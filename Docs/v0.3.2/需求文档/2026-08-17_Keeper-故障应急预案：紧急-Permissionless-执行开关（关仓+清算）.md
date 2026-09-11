# 🚨 Keeper 故障应急预案：紧急 Permissionless 执行开关（关仓 + 清算）

> Notion 页面：[原文](https://app.notion.com/p/3bf3d7873f2c8107b3c4f5c861e9e62c)
> 作者：fx100-sync（Gordon 的 fx100-contracts 仓库文档同步机器人，内容出自 Gordon）
> 创建时间：2026-08-17
> 最后编辑：2026-08-17
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 产品 / FX100 / 技术相关 / 合约 / 🏗️ 设计提案
> 类型：设计文档

> 👥 受众：合约工程师　｜　来源：docs/analysis/../superpowers/specs/2026-08-17-emergency-permissionless-execution-design.md

# Keeper 故障应急预案：紧急 Permissionless 执行开关（关仓 + 清算）设计

**日期**: 2026-08-17

**状态**: 设计讨论完成，给出方案方向，尚未写实现计划（writing-plans）

**受众**: 合约工程师、产品/安全

**涉及模块**: `src/exchange/OrderHandler.sol`、`src/exchange/LiquidationHandler.sol`、`src/exchange/BaseHandler.sol`、`src/oracle/OracleUtils.sol`、`src/constants/FX100Keys.sol`（新增 key）、`src/config/Config.sol`

**关联文档**: [docs/analysis/TEST_REVIEW_FINDINGS.md 问题 11](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/analysis/TEST_REVIEW_FINDINGS.md)

---

## 一、背景与问题

已经确认（问题 11 调研）：FX100 当前订单执行/清算是 permissioned keeper 模式，一旦 `ORDER_KEEPER`/`LIQUIDATION_KEEPER` 全部失效（宕机、私钥丢失、程序卡死），**没有任何链上兜底**——用户没法自己关仓（`cancelOrder` 只是撤单，不改变仓位），第三方也没法代为清算，GMX 官方原版同样没有这个兜底，两边都是靠"跑多个冗余 keeper 机器人"这种纯运维手段应对。

FX100 想做到比 GMX 更强的保证。用户提出的思路：增加一个紧急开关，打开后允许 **permissionless 执行关仓类订单**，但**开仓依然锁死给 keeper**——因为当初把执行权收归 keeper 的核心原因是防止用户确定性知道执行价格从而搞原子套利，只要开仓这一半保持锁死，套利的往返链条就断了。讨论后决定范围扩大到**关仓 + 清算一起开放，用同一个开关**，清算侧可以搭配激励（类似很多协议"任何人可清算并拿赏金"的做法）。

本文档记录这个方案的具体设计，以及讨论中发现的一个需要一起解决的新风险。

---

## 二、核心设计：一个全局开关，两条改动

### 2.1 新增 DataStore 开关

```solidity
bytes32 public constant EMERGENCY_PERMISSIONLESS_EXECUTION_ENABLED =
    keccak256(abi.encode("EMERGENCY_PERMISSIONLESS_EXECUTION_ENABLED"));
```

- 全局单一 bool，不分市场（keeper 故障通常是基础设施级的，不是某个市场单独出问题；分市场会增加不必要的复杂度）。
- **只能由 `CONFIG_KEEPER`（管理员/多签）开关**，不接入 `LIMITED_CONFIG_KEEPER` 或任何自动化 keeper 常规调整体系——这跟 [config-keeper-sync-mechanism-design.md](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/superpowers/specs/2026-08-13-config-keeper-sync-mechanism-design.md) §6.9 里"开关类参数需要人的深思熟虑判断，不应该交给日常自动化"的结论一致。这是一次性的、需要人明确决策"现在确实出现紧急情况"的动作，不是常规参数调整。

### 2.2 `OrderHandler.executeOrder`：只放开减仓类订单，开仓永远锁死

```solidity
modifier onlyOrderKeeperOrEmergencyDecrease(Order.OrderType orderType) {
    bool isKeeper = store.hasRole(Role.ORDER_KEEPER, msg.sender);
    bool isEmergencyDecrease = !isKeeper
        && dataStore.getBool(FX100Keys.EMERGENCY_PERMISSIONLESS_EXECUTION_ENABLED)
        && Order.isDecreaseOrder(orderType); // MarketDecrease / LimitDecrease / StopLossDecrease

    if (!isKeeper && !isEmergencyDecrease) {
        revert FxErrors.Unauthorized(msg.sender, "ORDER_KEEPER");
    }
    _;
}
```

- **开仓类订单（`MarketIncrease`/`LimitIncrease`）不管开关状态永远只能 `ORDER_KEEPER` 执行**——这是整个方案的安全核心，必须作为不变量单独测试。
- 减仓类订单（`MarketDecrease`/`LimitDecrease`/`StopLossDecrease`）在开关打开时，**任何地址**都能调用执行——不限制必须是仓位所有者本人（好处见 §2.4）。

### 2.3 `LiquidationHandler.executeLiquidation`：同一个开关，同时放开，搭配激励

```solidity
modifier onlyLiquidationKeeperOrEmergency() {
    bool isKeeper = store.hasRole(Role.LIQUIDATION_KEEPER, msg.sender);
    bool isEmergency = !isKeeper
        && dataStore.getBool(FX100Keys.EMERGENCY_PERMISSIONLESS_EXECUTION_ENABLED);

    if (!isKeeper && !isEmergency) {
        revert FxErrors.Unauthorized(msg.sender, "LIQUIDATION_KEEPER");
    }
    _;
}
```

**激励设计**：清算费当前按 `LIQUIDATION_FEE_RECEIVER_FACTOR`（现值 50%）拆成协议份额和 LP 池份额（已在问题 3 核实过）。紧急模式下由非 keeper 地址执行清算时，**把协议份额那一部分改发给 `msg.sender`（实际执行者）而不是协议 fee receiver**——不新增协议成本，只是换一个接收方，天然给第三方"帮忙清算"的动机，类似很多协议标配的"任何人可清算拿赏金"模式。LP 池份额不变，交易者的清算成本也不变。

### 2.4 为什么执行者不限制必须是仓位所有者本人

减仓类订单本身已经定义了 `receiver`/`account`（结算对象是仓位所有者），谁提交这笔执行交易不影响结算去向——开放给任何地址（本人、朋友、救援机器人、MEV searcher）能最大化"真的有人在紧急情况下去执行"的概率，这正是应急开关要解决的问题。限制成"只能本人执行"没有安全收益，只会降低这个兜底的实际可用性（比如用户本人可能也没法及时构造交易）。

---

## 三、讨论中发现的新风险，及配套解法

### 3.1 风险：permissionless 执行 = 调用者自己选价格快照

`executeOrder`/`executeLiquidation` 需要调用者传入签名的 oracle 价格数据（`oracleParams`）。平时是 keeper 中立地"尽快用当前价"提交；一旦变成任何人可调，**调用者可以在新鲜度容差允许的窗口内，挑一个对自己最有利的历史有效价格**来执行——这跟"开仓+关仓原子套利"是不同的风险面：不需要凑成一笔交易，单纯"关仓/清算时挑时机"就是真实的操纵手段，尤其是"仓位所有者专门挑一个更有利的价格抢先关仓、躲避即将到来的清算"这种场景，恰好是当初把执行权收归 keeper 的原因之一。

**解法：紧急模式下用一条独立的、比 keeper 平时更紧的新鲜度容差**（比如只接受几乎实时的价格，不给"回看窗口内挑一个"的空间）。这样自己执行和 keeper 执行用的实质上是同一个价格来源，消除挑价格这个操纵面。需要在 `OracleUtils`/`DecreaseOrderUtils.validateOracleTimestamp`（今天已经引用过的校验点）里为"permissionless 分支"单独加一条更紧的时间戳窗口校验，不能直接复用 keeper 那条宽松的 `REQUEST_EXPIRATION_TIME` 容差。

### 3.2 开关本身的风险定性——比想象的低，但仍需要审慎的开关权限

假设开关被误开启（并非真的 keeper 全挂），在 §3.1 的紧新鲜度容差已经落地的前提下：清算/关仓提前被人执行，对协议/交易者本身没有实质伤害（只是把"谁来执行、谁拿清算赏金"的权力从 keeper 扩散给了任何人，本质上更接近 Aave/Compound 那种默认开放清算的模式，不是灾难性后果）。**这意味着这个开关不需要类似"时间锁+多签"那种极端谨慎的门槛**，但仍然建议只给 `CONFIG_KEEPER`（管理员/多签），并要求每次开启都有对应的事件记录（`EventEmitter` 发一条 `EmergencyPermissionlessExecutionToggled`），方便事后审计"这次真的是紧急情况还是误操作"。

### 3.3 明确的范围边界（本次不覆盖）

- **ADL（自动减仓）不在这次方案范围内**——ADL 解决的是"全局失衡"这个不同的问题（今天已确认 ADL 不能当成"关仓兜底"用），跟 keeper 故障导致的个体仓位卡住是两个独立问题，本文档不建议现在一起改，避免范围蔓延。
- **紧新鲜度容差依赖的前提是 oracle 价格数据本身依然可得**——如果导致 keeper 故障的根因同时也让价格源不可用（比如整条基础设施同时挂掉），这个方案解决不了"没有价格可用"这个更底层的问题，那是 oracle 可用性本身的问题，不是本方案要解决的范围。
- **前端/工程依赖**：调用者需要自己拿到合法签名的 oracle 价格数据（Chainlink Data Stream report / Pyth 更新）传进 `executeOrder`/`executeLiquidation`——这些数据源本身是公开可查询的 API（不是 keeper 独占的秘密数据），技术上可行，但需要前端为"紧急自助执行"这个场景单独做一条"自己拉取价格数据再提交交易"的流程，不是简单加个按钮就行，是一块独立的前端工作量。

---

## 四、测试要点（Foundry）

- **核心不变量**：开关打开时，`MarketIncrease`/`LimitIncrease` 依然只能被 `ORDER_KEEPER` 执行，非 keeper 地址调用必须 revert——这是整个方案安全性的关键，需要专门的正向+负向测试。
- 开关打开时，非 keeper 地址能成功执行 `MarketDecrease`/`LimitDecrease`/`StopLossDecrease` 和清算。
- 开关关闭（默认值）时，现有行为完全不受影响——回归测试。
- 紧新鲜度容差：permissionless 执行分支下，用一个"合法但不够新"的价格（在 keeper 平时的宽松容差内、但超出紧急模式的紧容差）尝试执行，应该 revert；用真正接近 `block.timestamp` 的价格才能成功。
- 清算激励：非 keeper 地址执行清算时，验证协议 fee receiver 那部分份额正确改发给 `msg.sender`，LP 池份额和交易者成本不变。
- 开关访问控制：非 `CONFIG_KEEPER` 尝试切换开关应该 revert；开关切换有对应事件记录。
- 边界组合：开关打开 + 一笔部分平仓的减仓单，同一账户同时存在待执行的开仓单——验证开仓单依然锁死、减仓单能被任何人执行，两者互不影响。

---

## 五、非目标 / 留待后续决定的问题

- ADL 是否也要纳入类似的紧急开放机制——本文档不覆盖，见 §3.3。
- 清算赏金具体拿多少比例（是拿满 `LIQUIDATION_FEE_RECEIVER_FACTOR` 对应的全部份额，还是留一部分给协议）——本文档建议默认全额转给执行者作为最简单的起点，具体比例是产品可以后续调整的参数，不是本文档要锁死的设计细节。
- 前端"自助拉取 oracle 数据并提交紧急执行交易"这个流程的具体产品形态——本文档只确认技术可行性，不涉及交互设计。

# 🔐 可行性分析：最小持仓时间锁防刷量（参考 Avantis openCloseThreshold，GMX 无此机制）

> Notion 页面：[原文](https://app.notion.com/p/3b23d7873f2c81aa9eb9ebe9cdd0694a)
> 作者：fx100-sync（Gordon 的 fx100-contracts 仓库文档同步机器人，内容出自 Gordon）
> 创建时间：2026-08-04
> 最后编辑：2026-08-04
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 产品 / FX100 / 技术相关 / 合约 / 🏗️ 设计提案
> 类型：设计文档

**状态**: 分析完成，给出落地方案建议，尚未实施（合约无改动）

**涉及模块**: `src/order/DecreaseOrderUtils.sol`、`src/position/Position.sol`（`increasedAtTime` 字段复用）、`src/constants/FX100Keys.sol`、`src/config/Config.sol`/`ConfigUtils.sol`

**关联文档**: [risk_dynamic_spread_floor_removal.md](./risk_dynamic_spread_floor_removal.md) / [summary_dynamic_spread_floor_removal.md](./summary_dynamic_spread_floor_removal.md)（同一大主题"原子/快速开平仓套利"的另一条防线，两者互补不重叠）

**对比对象**: Avantis Protocol `PairStorage.sol`/`Trading.sol`（Base 主网实际部署，本文档引用的都是链上实测参数）；GMX v2 Synthetics（确认**没有**同类机制）

---

## 一、结论先行

1. **GMX v2 没有这个机制**，FX100（GMX v2 fork）自然也没有。GMX 防"开平仓套利"完全靠经济约束（`positiveImpactFactor ≤ negativeImpactFactor`），不设时间锁。
2. **Avantis 有**，且实现比"固定 30s"更精细：按仓位规模分档（`numTiers`/`tierThresholds`/`timers`），但**豁免止损（SL）和清算（LIQ）**，只挡"主动市价平仓"和"止盈（TP）触发"。链上实测：多数主流币对（ETH/BTC/SOL/DOGE）该值配的是 **0（等于关闭）**，只有 BNB/ARB/AVAX 等配了 **180 秒**；且它的两档 `tierThresholds` 对应的 `timers` 值目前是相同的（`[180,180]`），说明 Avantis 自己在生产环境里也没真正用出"分档差异化"，只是留了这个能力。
3. **这个机制解决的是另一个问题，不是 [risk_dynamic_spread_floor_removal.md](./risk_dynamic_spread_floor_removal.md) 里分析的"外部对冲套利"残留风险**——那个风险的套利者本来就不着急平仓（甚至永远不在 FX100 内平仓），时间锁锁不住"不着急的人"。它真正能防的是：**同账户、机器人驱动、依赖"立即"两个字才成立的策略**——高频刷量/薅羊毛式的开平仓（比如为了刷交易量拿积分/返佣/空投资格，而不是为了吃价格差）。这是防"刷量"，不是防"套利"，务实一点说是**纵深防御**，不是刚性缺口的解药。
4. **FX100 落地成本不高**：`Position.increasedAtTime()` 已经在每次 `increasePosition()`（开仓/加仓/加保证金全部会走这条路径）无条件刷新（[IncreasePositionUtils.sol:117](../../../src/position/IncreasePositionUtils.sol#L117)），不需要新增字段，只需要在减仓入口加一道校验 + 新增配置键。
5. **建议**：值得做，但做**简化版**（每市场单一阈值，不分档——理由见五.2），默认全市场关闭（`= 0`，与 Avantis 生产现状一致），只挡"主动市价减仓 + 限价止盈式减仓"，**硬性豁免止损单、清算、ADL**（对齐 Avantis 先例，原因见四.3）。

---

## 二、Avantis 实现细节回顾（本次逆向读代码得到的关键结论）

代码位置（`/Users/vicky/Documents/GitHub/avantis contract/contract/`）：

- 存储：`PairStorage.sol` 每个交易对维护 `openCloseTiersThresholds[i]` / `openCloseThresholdsTimers[i]`（分档：按 `_leveragePos = 抵押×杠杆` 的规模查表）。
- 查询：`openCloseThreshold(pairIndex, leveragePos)` —— 从最高档往下找第一个满足 `leveragePos >= threshold[i]` 的档位，返回对应 `timer[i]`；查不到返回 0（[PairStorage.sol:731-740](../../../../avantis%20contract/contract/PairStorage.sol#L731)，路径在本机 `avantis contract` 目录）。
- 执行时机记录：`_trade.timestamp = block.timestamp` 在 `_registerTrade()` 里设置（`TradingCallbacks.sol:476`），**开仓时**写入；本次没有确认 Avantis 是否有"纯加保证金不改变 timestamp"的分支（其代码里 open 和 add 共用同一条注册路径的可能性较大，但未逐行验证，仅供参考——FX100 这边是明确验证过的，见下节）。
- 强制校验点（两处，**均为 `require`，硬 revert**）：
- `closeTradeMarket()`（用户主动市价平仓）：`require(block.timestamp - t.timestamp >= pairsStored.openCloseThreshold(...), "EARLY_CLOSE")`（`Trading.sol:349`）。
- `LimitOrder.TP` 触发执行（止盈单）：同样的 `require(...)`（`Trading.sol:725`）。
- **`LimitOrder.LIQ`（清算）和 `LimitOrder.SL`（止损）分支里没有这条 `require`**——即 Avantis 明确不让这个时间锁挡住清算和止损。这是一个非常重要的安全设计先例：**保护性/风险释放性质的平仓永远不受时间锁限制**，只限制"主动获利/主动退出"性质的平仓。

## 三、FX100 现有基础设施（已验证，可直接复用）

| 需要的东西 | FX100 现状 | 结论 |
|---|---|---|
| 记录"最近一次开仓/加仓/加保证金的时间" | `Position.increasedAtTime()`，在 `IncreasePositionUtils.increasePosition()` 末尾无条件 `setIncreasedAtTime(block.timestamp)`（[IncreasePositionUtils.sol:117](../../../src/position/IncreasePositionUtils.sol#L117)）。该函数是开仓、加仓（size 增加）、**纯加保证金**（`collateralIncrementAmount>0` 但 `sizeDeltaUsd=0`）**共用的同一条路径**，已亲自读代码确认三种场景都会刷新这个时间戳，不需要新增字段。 | ✅ 直接复用，零新增存储 |
| 减仓入口，能拿到 order 类型 + position | `DecreaseOrderUtils.processOrder()`（[DecreaseOrderUtils.sol:28-67](../../../src/order/DecreaseOrderUtils.sol#L28)），已经在 `validateOracleTimestamp()` 里按 `order.orderType()` 分支处理 `MarketDecrease`/`LimitDecrease`/`StopLossDecrease`/`Liquidation` 四种类型，新校验可以加在同一层级 | ✅ 校验点现成 |
| 区分 ADL | ADL **不是**独立的 `OrderType`，而是 `OrderType.MarketDecrease` + `SecondaryOrderType.Adl`（[Order.sol:16-33](../../../src/order/Order.sol#L16)，`AdlHandler.sol:128` 用 `Order.SecondaryOrderType.Adl` 构造 execute 参数） | ⚠️ **易错点**：如果只按 `orderType` 判断"MarketDecrease 就要挡"，会**误伤 ADL**（协议强制减仓不该被用户侧计时器卡住，否则可能导致本该被 ADL 掉的极端失衡仓位卡死，放大协议风险）。必须显式排除 `secondaryOrderType == Adl`。 |
| 静默取消 vs 硬 revert 的现有模式 | FX100 的 `OrderHandler.executeOrder()` 用 try/catch，超限订单是**静默取消**而非 revert（`MIN_POSITION_SIZE_USD` 等现有风控 gate 都是这个模式，见 [feedback_e2e_silent_cancellation 记忆]） | 建议新校验也走这个模式，别学 Avantis 直接 `require` 硬 revert |

## 四、落地设计建议

### 4.1 配置：简化为单市场单阈值，不做分档

新增一个 key，例如 `MIN_POSITION_CLOSE_DURATION`（按 marketIndex 取值，类似 `constantPriceSpreadKey(marketIndex)` 的写法），值为秒数，`0` = 关闭（默认值）。

**不建议一开始就照抄 Avantis 的分档设计**，理由：

- Avantis 自己线上配置的两档 `timers` 值相同（`[180,180]`），说明分档能力目前形同虚设，没有证据表明"按仓位规模差异化等待时间"在实践中有独立价值。
- 分档会显著增加 `Config.sol`/`ConfigUtils.sol` 的校验复杂度（数组长度校验、单调性校验等），对应的测试矩阵也会翻倍。
- 如果未来确实需要分档，可以在这个单阈值版本跑稳之后再加，接口设计上把 `marketIndex` 作为 key 的一部分即可平滑升级（不需要推倒重来）。

### 4.2 校验点：`DecreaseOrderUtils.processOrder()` 入口处

在拿到 `position` 之后（已有 `position.increasedAtTime()` 可读），加一道：

```solidity
if (_isCloseDurationGated(order.orderType(), params.secondaryOrderType)) {
    uint256 minCloseDuration = dataStore.getUint(FX100Keys.minPositionCloseDurationKey(order.marketIndex()));
    if (block.timestamp - position.increasedAtTime() < minCloseDuration) {
        revert FxErrors.PositionCloseTooEarly(block.timestamp - position.increasedAtTime(), minCloseDuration);
    }
}
```

（伪代码，实际由合约工程师定，重点是判断逻辑和豁免名单，不是具体写法）

### 4.3 豁免名单（对齐 Avantis 先例，且是本方案的安全关键点）

| Order 类型 | 是否受时间锁限制 | 理由 |
|---|---|---|
| `MarketDecrease`（且 `secondaryOrderType != Adl`） | ✅ 挡 | 主动市价平仓/减仓，是刷量/薅羊毛的主要手段 |
| `LimitDecrease`（对应 Avantis 的 TP） | ✅ 挡 | 主动止盈类平仓，Avantis 同样挡这个 |
| `StopLossDecrease` | ❌ 豁免 | 保护性平仓，Avantis 明确豁免；卡住止损可能导致用户在价格继续不利时无法及时止损，放大用户和协议风险 |
| `Liquidation` | ❌ 豁免 | 清算是协议风险释放机制，卡住会造成坏账风险，绝对不能受用户侧计时器影响 |
| `MarketDecrease` + `SecondaryOrderType.Adl` | ❌ 豁免 | ADL 同理，是协议强制去杠杆，不能被卡住（见三节"易错点"） |
| 部分平仓 | 沿用对应 order 类型的规则 | 时间锁判断的是"这个仓位多久前刷新过 `increasedAtTime`"，跟平仓比例无关，部分/全部平仓一视同仁 |

### 4.4 违反时的行为

沿用 FX100 现有的静默取消模式（`OrderHandler.executeOrder()` 的 try/catch），不要像 Avantis 那样直接 `require` 硬 revert——保持跟 `MIN_POSITION_SIZE_USD` 等现有 gate 一致的用户体验（订单被取消，不会导致整笔 keeper 交易失败）。

### 4.5 新增内容清单（供合约工程师评估工作量）

- `FX100Keys.sol`：新增 `MIN_POSITION_CLOSE_DURATION` 及 `minPositionCloseDurationKey(marketIndex)`。
- `Config.sol`：`allowedBaseKeys` 注册新键。
- `ConfigUtils.sol`：如需要上限校验（比如管理员不能配到"永久锁死"的离谱大值），加一条 `MAX_MIN_POSITION_CLOSE_DURATION` 之类的硬上限保护，防止误操作/恶意 CONFIG_KEEPER 锁死用户资金（GMX 的 `getAdjustedSwapImpactFactors` 注释里也提到过"恶意 CONFIG_KEEPER"这个威胁模型，同样的思路适用在这里）。
- `FxErrors.sol`：新增 `error PositionCloseTooEarly(uint256 elapsed, uint256 required);`（参考现有 `MinPositionSize` 的两参数风格）。
- `DecreaseOrderUtils.sol`：加校验分支 + 豁免逻辑。

---

## 五、影响面 / 风险点

### 5.1 会直接影响的现有测试（默认关闭可以避免这个问题，但要写进验收标准）

- `test/integration/ExecutionPrice.t.sol` 的 `test_ep07_longRoundTrip_sameOracle_pays2xSpreadCost` / `test_ep08_shortRoundTrip_sameOracle_pays2xSpreadCost`：这两个测试**依赖"允许立即平仓"**来验证 2×spread 成本不变量。如果新功能默认全市场 `= 0`（关闭），这两个测试不受影响；但如果测试环境的默认配置意外把这个值设成非零，会直接把这两个现有测试打挂。**验收时必须明确：新 key 的默认值/未配置时的回退值必须是 0**（参考 memory 里 `project_exec_fee_subsidy_config_requirement` 记录的"缺省回退值决定生死"的坑，同类风险）。
- `test/integration/FundingRate.t.sol` 的 `test_noFundingCost_immediateClose_sameBlock`（同一原因）。
- 新功能上线后，任何未来"同 oracle 价格开平仓"的账本类测试（E2E 账本、round-trip 类）如果开启了这个 key，需要额外 `vm.warp` 跳过冷却期，否则会被静默取消导致断言失败但报错信息不直观（订单没执行，不是 revert）。

### 5.2 跟现有"清算保护宽限期"（`graceEnd`）容易混淆，但是两个相反方向的机制

- `position.graceEnd()`（[LiquidationUtils.sol:44](../../../src/liquidation/LiquidationUtils.sol#L44)）：保护**刚开仓的用户不被清算**（对用户有利）。
- 本方案的 `minPositionCloseDuration`：限制**刚开仓的用户不能马上平仓**（对用户是限制）。

两者都用同一个"刚开仓"的时间窗概念，但方向相反，一个是保护、一个是限制。**命名和文档里要明确区分，避免合约工程师或前端理解成同一个机制的两面**（实际上底层都可以复用 `increasedAtTime`，但用途完全不同，`graceEnd` 有自己独立的字段和分层乘数逻辑，不建议合并）。

### 5.3 不解决的问题（管理预期，避免决策者误判）

再强调一次结论里的第 3 点：这个机制**不能**替代或补全 [risk_dynamic_spread_floor_removal.md](./risk_dynamic_spread_floor_removal.md) 第五节分析的"外部对冲套利"风险——那个风险的前提就是套利者不急着在 FX100 内平仓（甚至可以长期不平仓），任何"最小持仓时间"哪怕设成几小时对这类套利者也无效。如果向上汇报/写审计问答，**不要把这个功能包装成"已经解决套利问题"**，它解决的是刷量/薅羊毛类的问题，是两个独立的风险面。

### 5.4 前端配合成本

用户点"平仓"按钮如果命中冷却期，订单会被静默取消（不 revert）——前端需要：

- 平仓前查询 `position.increasedAtTime() + minPositionCloseDuration`，提前禁用按钮/显示倒计时，否则用户会遇到"点了平仓但没反应"的困惑体验。
- 这个改动需要产品侧介入，不是纯合约改动能闭环的。

---

## 六、建议的下一步

1. 先跟工程侧确认：这个功能的真实诉求是"防积分/返佣/空投刷量"还是别的场景？如果是刷量场景，可能还要看积分系统本身是否有更直接的反刷量规则（比如按净敞口而非按笔数计积分），时间锁只是众多手段之一，不一定是性价比最高的。
2. 若决定推进：按本文档四节的方案给合约工程师提需求（简化版、不分档、默认关闭、硬豁免 SL/LIQ/ADL），并同步排入测试账本（参考 [feedback_test_catalog_maintenance 记忆] 的三处同步流程）。
3. 测试设计沿用现有 `RiskControl.int.t.sol`/`LiquidationBoundary` 类集成测试的写法，新增用例至少覆盖：正常挡住 MarketDecrease/LimitDecrease、正确豁免 StopLossDecrease/Liquidation/ADL、加保证金刷新计时器、部分平仓同规则、默认值为 0 时现有 round-trip 测试不受影响。

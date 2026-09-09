# v0.3.2 Order 字段与状态

> 源码权威定义：`src/order/Order.sol`。前端提交参数还需结合 `IBaseOrderUtils.CreateOrderParams`；本表描述落入 Order Store 后的核心字段。

## 1. 地址字段

| 字段 | 业务含义 | 前端来源/表现 | 必测点 |
|---|---|---|---|
| `account` | 订单及仓位的经济所有者 | Standard、直接 Relay/Gasless、Flash One-Click/1CT 均为用户主账户 | 不得被 Relayer 的 `tx.from` 或 1CT session signer 偷换 |
| `receiver` | 订单输出资产接收地址，也是订单执行后多余 Execution Fee 的最终 fallback 接收方 | 当前 Relay create 把它设为用户主账户 | 平仓到账正确；无 callback 时，多余 WNT 解包为原生币退给 receiver；不能与 account 或 Relay caller 混淆 |
| `cancellationReceiver` | 取消时 Increase 抵押品及多余 Execution Fee 的首选接收地址 | 当前 Relay create 传零地址；此时抵押品回退到 `account`，多余 Execution Fee 回退到 `receiver`，两者在当前路径均为用户 | 非零/零地址两支分别核对，不能假设两类退款总用同一个 fallback；不得错误回到垫资的 Relay caller |
| `callbackContract` | 执行后回调合约；有回调时先尝试把多余 Execution Fee 退款交给回调处理 | 当前普通前端和 Relay create 通常传零地址 | 非法回调、gas 上限及回调接受/拒绝退款分支；1CT 必测非空 callback + 大额 executionFee 的 cap，不能把前端传零当合约安全边界 |
| `uiFeeReceiver` | UI fee 接收方 | 产品配置 | 为空与非空时费用路由正确 |

## 2. 数值字段

| 字段 | 业务含义/单位 | 使用规则 | 前端要求与测试点 |
|---|---|---|---|
| `marketIndex` | 市场编号 | 必须对应有效市场 | 页面市场、URL、payload、Reader 四者一致 |
| `orderType` | 7 种合约订单枚举 | 决定开/减仓、触发和执行逻辑 | 页面文案与链上枚举一致，编辑跨价不得静默错型 |
| `sizeDelta` | 仓位规模变化量 | `isSizeDeltaUsd` 决定 USD 或 token 口径 | 单位切换经济含义不变；精度与取整正确 |
| `initialCollateralDeltaAmount` | Increase 时投入抵押；Decrease 时提取抵押 | token 原始精度 | 不能把 token amount 当 USD；余额差分正确 |
| `triggerPrice` | 非市价单触发价 | Limit/Stop/TP/SL 使用 | 多空和开/减仓四类方向条件正确 |
| `acceptablePrice` | 用户可接受的最差成交价 | 与实际 executionPrice 比较 | 四象限等号成交、不利越界取消/冻结；哨兵规范 |
| `executionFee` | Order Keeper 执行费 | 创建时预存，执行/取消时结算；Relay family 非补贴时由 Relayer 先垫 WNT，再计入 Relay Fee | 页面 Pay/Relay Fee 不重复计算；退款和 Keeper 收款正确；Subaccount Relay callback cap GAP 单独覆盖 |
| `callbackGasLimit` | 回调 gas 上限 | 有 callback 时使用 | 上限校验；无 callback 不产生错误费用 |
| `minOutputAmount` | Decrease 最小输出，按 USD 校验 | v0.3.2 实际生效 | 低/等/高三点；失败不得造成资金损失 |
| `updatedAtTime` | 最近创建/更新时间 | Oracle 时间窗与订单时效相关 | 创建/编辑后更新正确，事件和 Store 一致 |
| `validFromTime` | 最早可执行时间 | 非市价单到时前不可执行 | 边界前/等于/后；页面不得提前显示 Executed |

## 3. 标志字段

| 字段 | 含义 | 必测点 |
|---|---|---|
| `isLong` | 多仓或空仓方向 | 多空开仓、减仓、触发条件、acceptablePrice 方向均一致 |
| `isFrozen` | 订单是否冻结 | Frozen 不得误显示 Cancelled；恢复执行/撤销路径明确 |
| `autoCancel` | 相关仓位结束时是否自动撤销 | TP/SL 兄弟单及残单随仓位结束正确清理 |
| `isSizeDeltaUsd` | sizeDelta 是否为 USD 口径 | USD/Token Mode 换算、精度和完整平仓边界 |

## 4. 类型字段

合约原生 `OrderType`：

| 值 | 名称 | 含义 |
|---:|---|---|
| 0 | `MarketIncrease` | 当前市场价开仓或加仓 |
| 1 | `LimitIncrease` | 达到更有利限价时开仓 |
| 2 | `MarketDecrease` | 当前市场价减仓或平仓 |
| 3 | `LimitDecrease` | 达到目标价减仓，通常对应 TP |
| 4 | `StopLossDecrease` | 达到止损价减仓，通常对应 SL |
| 5 | `Liquidation` | 满足清算条件时强制减仓/平仓 |
| 6 | `StopIncrease` | 突破/破位后开仓 |

`SecondaryOrderType` 只有 `None` 和 `Adl`。因此 ADL 是风险处置执行上下文，不应在前端被描述为用户主动创建的第八种普通订单。

## 5. 生命周期状态

Order.sol 只保存 `isFrozen`，页面常见的 Open/Executed/Cancelled 等状态由 Store 是否仍存在、事件和索引结果共同派生。

```mermaid
stateDiagram-v2
    [*] --> Created: createOrder / OrderCreated
    Created --> Open: 写入 Order Store
    Open --> Open: 未到 trigger 或 validFrom
    Open --> Updated: 用户更新价格/规模
    Updated --> Open
    Open --> Executed: Keeper 执行成功
    Open --> Cancelled: 用户撤单或可取消错误
    Open --> Frozen: 不可安全取消的执行错误
    Frozen --> Executed: 条件恢复后重试成功
    Frozen --> Cancelled: 允许的撤销路径
    Executed --> [*]
    Cancelled --> [*]
```

前端必须区分：

- **Open**：仍在等待条件或 Keeper。
- **Executed**：订单已实际改变仓位/资金。
- **Cancelled**：订单结束并按规则退款。
- **Frozen**：订单仍存在，资金可能仍被占用，需要恢复或处理。
- **Pending/Submitted**：前端或 Relay 的过程态，不能长期覆盖链上真实终态。

Relay family 还存在一层独立于 Order 的任务生命周期：

| Relay task 状态 | 当前实现含义 | 不可推导的结论 |
|---|---|---|
| `pending` | 后端已接收并排队 | 尚无链上交易，不代表已创建订单 |
| `submitted` | Relay 交易已广播并已有 `txHash` | 回执未成功，不代表 Router 已完成 |
| `executed` | Relay Router 交易回执成功 | 只表示 create/update/cancel 已进入链上订单系统；不表示新建订单已经由 Order Keeper 成交 |
| `failed` | Relay 广播、回执或链上执行失败 | 不得伪造 `Cancelled`；是否已有 Order 必须按事件和 Store 核对 |

CURRENT Keeper 等待回执默认约 60 秒；超时后任务可继续停在 `submitted`，前端轮询约 3 分钟后只产生本地 timeout/failed 展示，并不会把服务端任务自动改成链上终态。页面必须以交易回执、Order 事件和 Store 继续收敛，不能把本地超时等同于订单失败。

## 6. 与 Relay fee 字段的边界

Relay fee **不是 `Order.Props` 字段，也不保存在 Order Store 中**。它属于 Flash/Relay 调用外层的 `RelayParams.fee`：

| 字段 | 含义 |
|---|---|
| `feeToken` | 支付 Relay fee 的代币；v0.3.2 必须等于全局 `COLLATERAL_TOKEN` |
| `maxFeeAmount` | 用户允许支付的 Relay fee 上限 |

因此核对订单字段时，不应在 Order 中寻找 Relay fee；应从 Relay 请求、`RelayFeePaid` 事件和账户/Relay 地址余额差分核对。完整流程与测试边界见 [02-订单类型与交易流程.md](02-订单类型与交易流程.md#5-relay-fee-流程与功能点)。

- Relay Router 没有把外部调用者限制为白名单 Keeper；任何拿到有效签名 payload 的地址都可广播，并由该次 `msg.sender` 接收 Relay Fee。安全边界是签名、deadline、chain/domain、nonce/count、业务校验和费用 cap，不是固定 Relayer 身份。
- `maxFeeAmount` 是实际 Relay Fee 的授权上限。合约只拉取实际 `feeAmount`，不存在“先扣 max、再退 max 与 actual 差额”的退款。

### 6.1 Execution Fee 在 Standard 与 Relay family 的现金流

Standard 与 Relay family 最终都把 `executionFee` 存入 Order，但入金责任和用户看到的币种不同：

| 阶段 | Standard | Relay/Gasless 与 1CT |
|---|---|---|
| Create/Update 入金 | 用户随链上交易向 OrderVault 预存 WNT；更新可补足 | 非补贴路径由 Relay caller 先垫 WNT；这笔完整垫付款作为 Relay native fee 的组成部分，最终按 Oracle 换算后从 account 收取 feeToken |
| 订单真正 Execute/Cancel | Execute、freeze、Keeper 错误取消及 auto-cancel 由实际 Keeper 按 gas 收费；用户主动 `cancelOrder` 则由合约把 `order.account` 作为 fee receiver | 同左；Relay cancel 的 caller 通过 Relay Fee 获得代发补偿，Order 上的主动取消 Execution Fee 仍付给 account。Relay caller 不因曾垫资而自动成为 Order Keeper 或退款接收方 |
| 多余部分 | WNT 解包为原生币，先给 callback 处理，未处理则给执行路径的 `receiver`；取消路径用非零 `cancellationReceiver`，否则回退 `receiver` | 同左；当前 Relay create 的 callback 和 cancellationReceiver 为零、receiver 为用户，因此多余部分最终是原生币退给用户，不是 USDC，也不是退给 Relay caller |
| Update 补贴分支 | 按合约补贴规则处理 | 若更新进入补贴分支，OrderHandler 会把旧 execution fee 加本次实际收到的 WNT 直接发给 receiver；Relay helper 在该分支不会按 `executionFeeIncrease` 垫入 WNT，必须与正常 Keeper 结算分开断言 |

因此 Relay 订单不能同时把“Relay Fee 中包含的完整 execution fee 垫付款”和“Order 上的 executionFee”作为两次用户支出相加；后续原生币/WNT 退款是独立的用户流入，也不是 `maxFeeAmount - feeAmount`。

## 7. CreateOrderParams 与最终 Order 的映射

前端提交的是 `IBaseOrderUtils.CreateOrderParams`，合约校验和归一化后才生成 `Order.Props`。测试不能只比较前端请求，也不能假设请求值一定原样写入 Store。

### 7.1 请求结构

```text
CreateOrderParams
├─ addresses
│  ├─ receiver
│  ├─ cancellationReceiver
│  ├─ callbackContract
│  └─ uiFeeReceiver
├─ numbers
│  ├─ marketIndex
│  ├─ sizeDelta
│  ├─ initialCollateralDeltaAmount
│  ├─ triggerPrice
│  ├─ acceptablePrice
│  ├─ executionFee
│  ├─ callbackGasLimit
│  ├─ minOutputAmount
│  └─ validFromTime
├─ orderType
├─ isLong
├─ autoCancel
├─ isSizeDeltaUsd
├─ referralCode
└─ dataList
```

### 7.2 请求到 Store 的转换规则

| 请求字段 | 最终保存位置 | 是否原样保存 | 转换或校验规则 |
|---|---|---:|---|
| 调用上下文中的 account | `addresses.account` | 通常是 | Standard 为实际主账户；Relay/Gasless 与 1CT 仍保存主账户经济归属，不是 Relayer 或 session signer |
| `addresses.*` | `order.addresses.*` | 是 | receiver 必须有效；cancellationReceiver 不能是 OrderVault |
| `numbers.marketIndex` | `numbers.marketIndex` | 是 | 必须是有效 Position Market |
| `numbers.sizeDelta` | `numbers.sizeDelta` | 是 | 必须结合 `isSizeDeltaUsd` 才有完整单位含义 |
| `initialCollateralDeltaAmount` | 同名字段 | 分类型 | Increase 取 OrderVault 实际 `recordTransferIn`；Decrease 取请求值 |
| `triggerPrice` | 同名字段 | 是 | Market 通常不使用；条件单执行时按方向校验 |
| `acceptablePrice` | 同名字段 | 是 | 执行时按 Increase/Decrease × long/short 四象限验证 |
| 请求 `executionFee` | `numbers.executionFee` | 不保证 | 以实际转入 WNT、补贴规则、最低费用和封顶结果为准；多余部分可能退款 |
| `callbackGasLimit` | 同名字段 | 是 | 创建时校验全局 callback gas 限制 |
| `minOutputAmount` | 同名字段 | 是 | Decrease 按 USD 1e30 口径验证；不是 collateral token 原始数量 |
| `validFromTime` | 同名字段 | 是 | Market Order 必须为 0，否则 `UnexpectedValidFromTime` |
| `orderType/isLong/autoCancel/isSizeDeltaUsd` | Order type/flags | 是 | 类型还决定是否允许用户创建和字段语义 |
| `referralCode` | ReferralStorage | 不进入 Order.Props | 创建时为 account 设置 referral code，需单独从 referral 状态/事件核对 |
| `dataList` | `order._dataList` | 是 | 扩展字段；需按使用方约定解释，不能被前端任意污染 |
| 创建时间 | `updatedAtTime` | 合约生成 | `order.touch()` 使用创建区块时间，不由前端传入 |
| `isFrozen` | `flags.isFrozen` | 合约生成 | 新订单默认 false；执行错误冻结后才变为 true |

### 7.3 创建流程

```mermaid
flowchart TD
    A[前端/SDK 构造 CreateOrderParams] --> B[Router 转入 Collateral 与 WNT]
    B --> C[OrderHandler 检查订单类型功能开关]
    C --> D[校验 account、market、receiver、validFrom]
    D --> E{Increase 或 Decrease}
    E -->|Increase| F[以 OrderVault 实际收到 Collateral 为准]
    E -->|Decrease| G[使用请求的 collateral withdraw amount]
    F --> H[校验/补贴/封顶 Execution Fee]
    G --> H
    H --> I[生成 orderKey 与 updatedAtTime]
    I --> J[写入 Order Store]
    J --> K[维护 autoCancel list]
    K --> L[发出 OrderCreated]
```

### 7.4 Order Create / Execute 合约入口与 `marketIndex` 路由

订单路径要分成“外部交易的 `to` 地址”和“内部核心处理合约”两层理解。对普通 Standard 订单，Create 和 Execute 的外层入口不同，但两条路径最终共用同一个 `OrderHandler`，不是两套互不相关的订单系统。

```text
Standard Order Create
用户/前端
→ ExchangeRouter.multicall / createOrder(params)
→ OrderHandler.createOrder(account, params, false)
→ OrderUtils.createOrder
→ DataStore 保存 Order；OrderVault 托管抵押品与 Execution Fee

Ordinary Order Execute
Order Keeper
→ OrderHandler.executeOrder(orderKey, oracleParams)
→ 按 orderKey 从 DataStore 读取 Order
→ 从 order.marketIndex 读取 Market
→ 按 orderType 选择 IncreaseOrderExecutor / DecreaseOrderExecutor
```

| 动作 | 外部交易 `to` | 内部处理 | 主要权限/身份 |
|---|---|---|---|
| Standard Create | `ExchangeRouter` | `OrderHandler.createOrder` → `OrderUtils.createOrder` | 用户钱包 |
| Relay/Gasless Create（内部 mode=`flash`） | `RelayRouter` | 最终进入同一 `OrderHandler.createOrder` | 主钱包逐动作签 EIP-712；任何持有有效 payload 的 caller 都可广播并收取 Relay Fee；当前设置页入口隐藏 |
| Flash One-Click/1CT Create | `SubaccountRelayRouter` | 最终进入同一 `OrderHandler.createOrder` | 主钱包先授权，session key 签动作，任意有效 caller 广播；必须校验命名 `slot`、有效期和 action count。CURRENT SDK/前端/Keeper 缺少合约必需的 `slot`，当前功能层记 `GAP`，准入状态另为 `NOT_READY` |
| Direct Subaccount Create | `SubaccountRouter` | 最终进入同一 `OrderHandler.createOrder` | 用户直接发送链上子账户交易；不是当前前端 1CT 的 Relay 提交路径 |
| 普通 Order Execute | `OrderHandler` | `executeOrder` → Increase/Decrease Executor | `ORDER_KEEPER` |
| Liquidation | `LiquidationHandler` | 生成内部 Liquidation Order 后走 Decrease Executor | `LIQUIDATION_KEEPER` |
| ADL | `AdlHandler` | 生成内部 ADL Order 后走 Decrease Executor | `ADL_KEEPER` |

#### `marketIndex` 不会切换 Router / Handler

在同一条链、同一套 v0.3.2 部署内，所有合法 `marketIndex` 共用同一组 `ExchangeRouter`、`OrderHandler`、`IncreaseOrderExecutor` 和 `DecreaseOrderExecutor`；不存在“每个 market 单独部署 OrderHandler”的路由。

- Create 时，`params.numbers.marketIndex` 用于校验 Market，并作为 `order.marketIndex` 写入共享 `DataStore`。
- Execute 入口只接收 `orderKey` 和 `oracleParams`，不再接收 `marketIndex`。`OrderHandler` 先按 key 读回 Order，再用已保存的 `order.marketIndex` 选择 Market。
- 执行时不能把已创建订单从 market A 改到 market B；`updateOrder` 也不允许修改 `marketIndex`。
- 市场之间改变的是 Market `vault`、`indexToken`、Oracle 价格输入，以及按 `marketIndex` 隔离的配置、OI、Funding、Position 和风险数据；不是 Router/Handler 合约地址。
- Increase/Decrease Executor 的分流依据是 `orderType`，不是 `marketIndex`。

源码证据：[`ExchangeRouter.createOrder`](../../../../Github/fx100-contracts@release-v0.3.2/src/router/ExchangeRouter.sol)、[`OrderHandler.createOrder/executeOrder`](../../../../Github/fx100-contracts@release-v0.3.2/src/exchange/OrderHandler.sol)、[`BaseOrderHandler._getExecuteOrderParams`](../../../../Github/fx100-contracts@release-v0.3.2/src/exchange/BaseOrderHandler.sol)、[`OrderUtils.createOrder`](../../../../Github/fx100-contracts@release-v0.3.2/src/order/OrderUtils.sol)、[`OrderStoreUtils`](../../../../Github/fx100-contracts@release-v0.3.2/src/order/OrderStoreUtils.sol)。部署地址不写死在用例中，每轮从 [`CURRENT.json`](../../../../Docs/contract-releases/CURRENT.json) 及其指向的 manifest 读取。

两种产品模式、三条技术提交路径及其 signer、`tx.from`、Router、Relay task、费用和切换规则见 [Standard-Relay-Flash-OneClick-(v0.3.2).md](Standard-Relay-Flash-OneClick-(v0.3.2).md)。

#### 测试断言

1. Standard Create 核对外层 `tx.to=ExchangeRouter`（前端批量路径可为同地址的 `multicall`）、内部调用 `OrderHandler.createOrder`、`OrderCreated.orderKey` 和 Store 全字段。
2. Relay/Gasless Create 核对主钱包为动作 signer、实际广播 caller 为 `tx.from`、外层 `tx.to=RelayRouter`；经济 `account` 和最终 `OrderHandler` 不得被 caller 偷换。用至少两个无 Keeper role 的 caller 证明权限来自有效 payload，而不是地址白名单。
3. Flash One-Click/1CT Create 在修复 `slot` ABI/typed-data/encoding GAP 后，核对主钱包为 approval signer、session key 为动作 signer、实际 caller 为 `tx.from`、外层 `tx.to=SubaccountRelayRouter`；经济 `account` 仍为主账户。修复前只能记录预期失败证据，不能判通过。
4. Execute 核对外层 `tx.to=OrderHandler`、Keeper 权限、`orderKey` 读出的 `marketIndex` 与 Create 时完全一致。
5. 至少用两个不同 `marketIndex` 做交叉测试：同一提交模式下 Router/Handler 地址相同，但 Market、Oracle、Position、OI、Funding、Vault 及事件证据按市场隔离，不得串市场。
6. Liquidation/ADL 分别断言 `LiquidationHandler`/`AdlHandler` 外部入口，不得误记为普通 `OrderHandler.executeOrder`。

## 8. 字段在不同订单类型中的使用规则

标记：`必`=业务必需；`0`=应为 0 或不参与；`选`=按功能使用；`系统`=协议内部生成。

| 字段 | MarketIncrease | LimitIncrease | StopIncrease | MarketDecrease | LimitDecrease | StopLossDecrease | Liquidation |
|---|---:|---:|---:|---:|---:|---:|---:|
| `marketIndex` | 必 | 必 | 必 | 必 | 必 | 必 | 必 |
| `sizeDelta` | 必 | 必 | 必 | 必 | 必 | 必 | 全仓/系统 |
| `initialCollateralDeltaAmount` | 实际转入 | 实际转入 | 实际转入 | 选：提取抵押 | 选 | 选 | 系统 |
| `triggerPrice` | 0 | 必 | 必 | 0 | 必 | 必 | 0 |
| `acceptablePrice` | 必 | 必 | 必 | 必 | 必 | 必 | 系统哨兵 |
| `executionFee` | 必/可补贴 | 必/可补贴 | 必/可补贴 | 必/可补贴 | 必/可补贴 | 必/可补贴 | 0 |
| `minOutputAmount` | 0 | 0 | 0 | 选/建议设置 | 选/建议设置 | 选/建议设置 | 系统 |
| `validFromTime` | 0 | 选 | 选 | 0 | 选 | 选 | 0 |
| `autoCancel` | 通常 false | 通常 false | 通常 false | 选 | TP 常用 true | SL 常用 true | 系统 |
| `isSizeDeltaUsd` | 选 | 选 | 选 | 选 | 选 | 选 | true |
| `isLong` | 必 | 必 | 必 | 必须匹配仓位 | 必须匹配仓位 | 必须匹配仓位 | 系统匹配 |

注意：

- Liquidation 不能通过普通用户 `createOrder` 创建；用户可创建的类型只包括 Market/Limit/Stop Increase 和 Market/Limit/StopLoss Decrease。
- Market Order 的 `validFromTime` 非零会直接失败，不是“忽略该字段”。
- Market Order 的 `triggerPrice` 虽不参与触发，前端仍应规范传 0，避免页面、事件和历史产生误导数据。
- `acceptablePrice` 对 Market Order 同样重要，Market 不等于无滑点保护。

## 9. UpdateOrder 可修改字段

Market Order 不允许更新；非 Market Order 才进入 Update 流程。

| 字段 | 可更新 | 更新规则/风险 |
|---|---:|---|
| `sizeDelta` | 是 | 必须同时核对 `isSizeDeltaUsd`，避免单位改变但数值未换算 |
| `isSizeDeltaUsd` | 是 | USD↔Token 切换必须保持用户可理解的经济含义 |
| `triggerPrice` | 是 | 跨越当前价格后仍不得静默错标 Limit/Stop 类型 |
| `acceptablePrice` | 是 | 必须按方向重算；Reduce-only 哨兵不能被破坏 |
| `minOutputAmount` | 是 | Decrease 为 USD 1e30；更新后重新校验实际输出 |
| `validFromTime` | 是 | 更新后不得提前执行 |
| `autoCancel` | 是 | 同步维护 autoCancel list 和 callback gas 总量 |
| `executionFee` | 可追加 | 冻结订单费用可能减少；更新可补充 WNT，合约重新校验/封顶/退款 |
| `isFrozen` | 合约重置 | 更新时设为 false，之后执行失败可能再次冻结 |
| `orderType` | 否 | 前端跨价编辑不得假装类型自动改变；需要换型时应明确取消重建 |
| `marketIndex/isLong/account/receiver` | 否 | 这些字段定义订单归属和经济方向，不允许 Update 偷换 |

Update 后应核对 `updatedAtTime`、OrderUpdated 事件、Store 全字段、autoCancel list、executionFee 余额及页面显示。

## 10. 字段单位与精度

| 字段 | 单位/精度 | 常见错误 |
|---|---|---|
| `sizeDelta` | `isSizeDeltaUsd=true` 时 USD 1e30；否则按 index token decimals | 把 Mock Token 固定当 8 位或 18 位 |
| `initialCollateralDeltaAmount` | collateral token 原始 decimals，例如 MockUSDC 可能为 6 位 | 当成 USD 1e30；Increase 只看请求值不看实际转入 |
| `triggerPrice` | 合约价格精度，由 Oracle/SDK 规则转换 | 直接使用页面小数字符串或 index token decimals |
| `acceptablePrice` | 同价格精度 | long/short 或 increase/decrease 方向反转；哨兵错误 |
| `executionFee` | WNT 原始单位 | 与 Relay fee、Position Fee 混淆 |
| `minOutputAmount` | Decrease 校验使用 USD 1e30 | 误传 USDC 1e6 数量 |
| `updatedAtTime/validFromTime` | Unix 秒 | 使用毫秒时间戳导致订单长期不可执行 |
| `callbackGasLimit` | gas units | 当成 wei 或费用金额 |

Mock 合成市场的 token、symbol 和 decimals 必须运行时读取；Order 测试需至少覆盖 index token 8 位和 18 位两类数据集。

## 11. Order 与 Leverage 的关系

`Order.Props` 没有 `leverage` 字段。前端杠杆是由仓位规模和有效保证金表达的业务值：

```text
leverage ≈ sizeInUsd / effectiveCollateralUsd
```

前端选择 2x、10x、Max 等杠杆时，最终转换为 `sizeDelta`、投入/提取 collateral 及相关预览参数。测试应验证转换结果，而不是在 Order 中寻找 leverage：

- 开仓杠杆改变时，size/collateral 组合正确。
- 调整杠杆可能通过保证金调整或仓位动作完成，不一定生成相同 OrderType。
- Fee、Funding、PnL 会影响有效保证金和风险杠杆，但不直接修改 Order 字段。
- 页面杠杆、Reader Position、清算价与最终账本必须使用同一口径。

## 12. 状态判定与证据来源

页面状态不是 Order struct 中的单一枚举。正确判定需要组合证据：

| 页面/业务状态 | Order Store | `isFrozen` | 关键事件 | 仓位/资金含义 |
|---|---|---:|---|---|
| Submitted | 可能尚未写入 | 不确定 | 钱包/Relay 过程态 | 不能当成链上订单已创建 |
| Created/Open | 存在 | false | OrderCreated/可能 OrderUpdated | 等待 trigger、validFrom 或 Keeper |
| Frozen | 存在 | true | OrderFrozen | 订单与部分资金仍保留，需重试/更新/撤销 |
| Executed | 不再存在 | — | OrderExecuted | 仓位/余额/OI 已按执行结果变化 |
| Cancelled | 不再存在 | — | OrderCancelled | 未执行经济动作，按规则退款 |
| AutoCancelled | 不再存在 | — | 取消事件/原因 | 关联仓位结束后自动清理 |

Indexer/API 可以用于页面回显，但不是唯一事实源。测试的权威顺序应为：交易回执与事件 → Order Store/Reader → Position/余额/OI → Indexer/API → 页面。

## 13. 前端字段展示要求

| 前端区域 | 至少展示/使用 | 核对要求 |
|---|---|---|
| 下单表单 | market、direction、type、size、collateral、trigger、TP/SL | 与最终 CreateOrderParams 一致 |
| Trade Details | execution price、acceptable price、fees、pay/receive、liquidation price | 单位清楚，费用不混算，预览可追溯 |
| Open Orders | type、direction、size、trigger、acceptable price、created/valid time、status | 与 Store 和事件一致，不能跨市场串值 |
| Edit Order | 可修改字段及修改后预览 | 不展示不可修改字段为可编辑；更新后全字段重核 |
| Position | size、collateral、entry、leverage、PnL、Funding、liquidation price | 来自 Position/Reader，不从历史 Order 猜测 |
| Order History | type、最终状态、执行/取消原因、实际价格和规模 | 适配 v0.3.2 事件，不依赖已删除字段 |

## 14. Order 字段测试最小集

1. 每种用户可创建 OrderType 至少一条成功创建和成功执行。
2. long/short × Increase/Decrease 的 acceptablePrice 四象限。
3. Trigger 前一单位、等号、后一单位；validFrom T−1/T/T+1。
4. USD/Token size 两种模式，并覆盖 8/18 位 Mock index token。
5. Increase 实际转入 collateral 与请求值差异；Decrease 提取 collateral。
6. executionFee 不足、恰好、超额、补贴、封顶和退款。
7. minOutputAmount 的实际输出−1、等号、+1。
8. autoCancel false/true，以及仓位结束后的残单处理。
9. callback 为空/非空、gas limit 边界和回调失败；1CT 非空 callback + executionFee 上限绕过（R8-B21）作为隔离 fork 安全负向用例。
10. Create、Update、Cancel、Execute、Freeze、Retry 全生命周期。
11. Standard、Relay/Gasless 与 Flash One-Click/1CT 的 account、signer、`tx.from`、Router、Order 字段、Relay Fee 和 action count 差异。
12. 页面、payload、事件、Store、Reader、Position、余额和历史逐字段一致。

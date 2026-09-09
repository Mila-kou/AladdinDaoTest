# FX100 Keeper 侧计算公式（代码口径）

> **代码版本**：`Github/fx100-apps@develop` @ `dfa36d0b5295d20246df2ae42fec50327fb0ace3`（2026-09-03），子路径 `apps/keeper`。基线登记见 [`CURRENT.json`](../../../../Docs/contract-releases/CURRENT.json) 的 `frontend.head` / `frontend.subpaths.keeper`。**`develop` 是移动分支**——引用本文行号必须连同该 head 一起引，rebase 后以函数名重新定位。
>
> **范围**：Keeper 进程**自己实现**的计算。合约侧公式见 [FX100-核心字段计算公式.md](./FX100-核心字段计算公式.md)；那份文档里「TX：执行加仓订单（Keeper）」讲的是**合约**在 Keeper 触发下算什么，与本文不重叠。
>
> **权威性**：Keeper 的计算**都不是**链上最终标准，但分两类，对核对的意义完全不同——见 §0.1。

## 0. 使用规则

### 0.1 两类 Keeper 计算

| 等级 | 含义 | 影响链上结果？ | 核对方式 |
| --- | --- | --- | --- |
| **K1 决定型** | 输出**进入链上输入**：选中的 oracle 报文、gas limit、时间窗下界 | **是**。换一个选择，链上算出的执行价与清算判定就不同 | 必须能重算，或从实际提交的报文锚定。**它是"实际值"的组成部分，不是噪声** |
| **K2 筛选型** | 只影响**何时被处理 / 是否入候选**，不进链上数值 | 否 | 只验"不漏"。用例 FAIL 时作归因候选，**禁作 parity 基准** |

对照：合约 = **A 级**（链上最终标准，断言基准）；前端 SDK/页面 = **B 级**（派生显示量）。

### 0.2 五条一句话结论

1. 普通订单成交时链上用哪份 oracle 报文，**由 Keeper 挑**（§1）——挑的是**对 trader 最不利的一侧极值**，与合约取整方向的护池原则同向叠加。
2. **清算与 ADL 状态更新不做方向极值**，取最新有效报文（§1.2）。把这两条混为一谈是本层最容易出错的地方。
3. Keeper **不重复实现**选边与触发判定，直接 import SDK 的同一份函数（§8）——这几处前端与 Keeper 天然一致，不存在"两边算得不一样"。
4. **relayFee 的金额不在 Keeper**（在 SDK 的 `extractRequiredWnt`）。Keeper 只管 gas limit 与 WNT 充足性（§3）。
5. 触发预筛一律 **fail-open**：任何不确定都提交给合约裁决——现役实现是 §1.2 的 `triggerCheck`（§7 的 `evaluateTrigger` 已是遗留路径，提交路径不再调用）。

### 0.3 精度约定

| 量 | 单位 |
| --- | --- |
| oracle 价格（`OraclePrice.min/max`、本文所有价格） | `USD × 10^(30 − tokenDecimals)`；ETH（d=18）→ `1e12`，WBTC（d=8）→ `1e22` |
| `sizeInUsd`、`effectiveShortfallUsd`、PnL | `USD × 1e30` |
| `sizeInTokens` | `10^tokenDecimals` |
| Chainlink 流报价 | `USD × 1e18`（进 Keeper 后换算，见 §7） |

---

## 1. 价格报文选择（K1）

**这是 Keeper 对链上结果影响最大的一条。** Keeper 的 price buffer 里同时存着多份有效 oracle 报文，选哪一份提交，直接决定合约算出的执行价。

**锚点**：`chain/minMaxPriceSelector.ts:63` `selectMinMaxSlot()` · `:193` `selectLatestValidSlot()` · `:212` `selectFirstValidSlot()`；调用点 `chain/oracle.ts:195-196`。

### 1.1 两步：先筛新鲜度，再按侧挑

```
① 新鲜度闸门（对每个 slot）
   保留 ⟺ nowMs + safetyMs < slot.expiresAt × 1000
   全部落选 → all-expired（不提交）

② 按 side 挑一个 slot（见 1.2 分支表）
```

调用点分工（`chain/oracle.ts:190-196`）：

| token 角色 | 用哪个选择器 | triggerCheck |
| --- | --- | --- |
| `tokens[0]` = **index token** | `selectMinMaxSlot(slots, side, …)` | 传入（触发单时生效） |
| 其余 = **抵押品 token** | `selectLatestValidSlot(slots, …)` | 不传 |

### 1.2 side 选法分支表（多条件）

`useMax` 来自 SDK `useMaxForSide(side)`（§8），与合约 `useMax = (开仓&多) 或 (平仓&空)` 同构。

| side | `useMax` | 选法 | 取到的标量 |
| --- | --- | --- | --- |
| `long-increase`（开多） | `true` | 在所有有效 slot 中取 **max(ask) 最大** 的那个 | `max` |
| `short-decrease`（平空） | `true` | 同上 | `max` |
| `short-increase`（开空） | `false` | 取 **min(bid) 最小** 的那个 | `min` |
| `long-decrease`（平多） | `false` | 同上 | `min` |
| `adl`（多头 ADL） | `false` | 同上 | `min` |
| `liquidation`（清算） | `null` | **不挑极值**：数组顺序第一个有效 slot（buffer 用 LPUSH 喂入，故为最新有效） | `max` |
| `updateAdlState` / 抵押品 | `null` | **不挑极值**：`observationsTimestamp` 最大的 slot | `max` |
| 未识别 side（防御分支） | `null` | 退化为最新有效 | `max` |

> 空头 ADL 走 `deriveSideForAdl(false) = 'short-decrease'`，因此与平空同为 `max`；多头 ADL 用独立枚举 `'adl'`，与平多同为 `min`。两者选边结果与普通平仓一致，只是枚举名不同。

**触发单额外一步（filter-then-extreme，顺序敏感）**：

```
先用 triggerCheck 丢掉「side 标量未越过 triggerPrice」的 slot
再在剩下的里挑方向极值
全被丢掉 → no-trigger-crossed（与 all-expired 区分，便于 ack-drop 而非重试）
```

### 1.3 例子（构造值，非实测）

buffer 里有 3 份有效报文，ETH（d=18，价格 scale `1e12`）：

| slot | min(bid) | max(ask) |
| --- | --- | --- |
| A | 2998.00 | 2999.50 |
| B | 2999.00 | 3001.20 |
| C | 2997.50 | 3000.10 |

| 场景 | side | 选中 | 提交给合约的报文 |
| --- | --- | --- | --- |
| 开多 | `long-increase` | **B**（max 最大 3001.20） | B |
| 开空 | `short-increase` | **C**（min 最小 2997.50） | C |
| 平多 | `long-decrease` | **C** | C |
| 清算 | `liquidation` | **数组第一个有效**（= 最新，与 min/max 高低无关） | 该 slot |

**核对含义**：同一个区块，"链上 oracle 价"不是唯一确定的——它取决于 Keeper 手上有哪些 slot、以及按哪一侧挑。因此**期望执行价必须用事件里实际的 oracle 价**，或完整复刻本节选择过程；拿"某时刻的一个 oracle 快照"去算期望值必然对不上。

---

## 2. Oracle 时间窗下界（K1）

**锚点**：`domain/orders/oracleWindow.ts:22` `computeOracleWindowFromMs()`

```
windowFloorMs = max( validFromTime × 1000 ,
                     updatedAtTime × 1000 ,
                     nowMs − windowMs )
```

（`validFromTime` / `updatedAtTime` 来自 OrderCreated 事件，单位**秒**；窗口单位**毫秒**。）

**为什么三项取 max**——这是合约约束的镜像：

| 分量 | 对应的合约要求 | 少了会怎样 |
| --- | --- | --- |
| `updatedAtTime` | `IncreaseOrderUtils` / `DecreaseOrderUtils` 对**所有**订单类型要求 `minOracleTimestamp ≥ order.updatedAtTime()` | §1 的方向极值选择器会伸手挑到**订单创建之前**观测的报文，合约以 `OracleTimestampsAreSmallerThanRequired` 拒绝 |
| `validFromTime` | 非市价单的额外下界（市价单为 0） | 限价/触发单可能用过早的价格执行 |
| `nowMs − windowMs` | 无对应；Keeper 自设的反 MEV 回看上限 | 可以回看任意久远的报文 |

**例子**：市价单 `validFromTime = 0`、`updatedAtTime = 1757000000`（秒）、`nowMs = 1757000002000`、`windowMs = 5000`

```
max( 0 , 1757000000000 , 1757000002000 − 5000 = 1756999997000 ) = 1757000000000
```

→ 下界被 `updatedAtTime` 顶起，比"仅按回看窗"高了 3 秒，正好挡住订单创建前那 3 秒的报文。

**已知缺口（代码注释自陈）**：本式**不覆盖** `LimitDecrease` / `StopLossDecrease` 在 `DecreaseOrderUtils` 里的额外下界 `positionIncreasedAtTime`（该字段不在订单事件里）。这类订单落到提交时的 stale-oracle 重取 + 重试路径——**测试上表现为 TP/SL 减仓单可能出现一次失败重试后成功**，属已知行为，不是缺陷。

---

## 3. Relay gas limit 与 WNT 前置（K1）

### 3.1 gas limit buffer

**锚点**：`domain/relay/gasPolicy.ts:45` `applyGasBuffer()` · `:36` `DEFAULT_RELAY_GAS_BUFFER_BPS = 2500`；调用点 `entrypoints/relWorker.ts:437`

```
gasLimit = ⌈ estimate × (10000 + bufferBps) / 10000 ⌉        默认 bufferBps = 2500（+25%）
```

（实现用 `(estimate × (10000+bps) + 9999) / 10000` 做向上取整。`bufferBps` 为非有限值 / ≤0 时**回落到默认值**，不是"不加 buffer"。）

**两条独立要求，缺一不可**（代码注释）：

| 要求 | 落点 | 违反后果 |
| --- | --- | --- |
| ① 估算必须打在 **sealed state** | 在 `relWorker` 调用点 pin，不在本函数 | 开 `KEEPER_PRECONF_ENABLED` 后 viem 的 `estimateGas` 默认打 `pending`（Flashblocks 预确认态），被预确认交易碰过的 slot 已是热的；实际密封执行付冷 SLOAD（2100 vs 100 gas），估算低约 30,000 gas |
| ② 估算必须加 buffer | 本函数 | 实测自然余量仅 **3.2%**（gasUsed ~892k / limit ~922k），任何状态漂移即耗尽 |

> 代码注释记录的事故：两条同时失守时 **1217 笔广播全部 out-of-gas**（gas 利用率 99.99%），而在成交区块做 `eth_call` 重放却成功——订单本身有效，纯粹是 gas 不够。

**例子**：

| estimate | bufferBps | gasLimit | 说明 |
| --- | --- | --- | --- |
| 892,000 | 2500 | **1,115,000** | 892000 × 1.25 恰好整除 |
| 1 | 2500 | **2** | 向上取整；若用整数除法直接截断会得回 1，重新变成零余量 |
| 892,000 | `NaN` / `0` / 负数 | **1,115,000** | 回落默认 2500，不是不加 buffer |

**未花完的 gas 会退款**，所以 buffer 的代价只是"提交时账户里要有这么多余额"，不是真花掉——但**余额预检要按 gasLimit 算，不是按 gasUsed**。

### 3.2 WNT 前置检查（非公式，是闸门）

**锚点**：`domain/relay/funding.ts:52` `checkWntFunding()`

```
sufficient = (balance ≥ required) 且 (allowance ≥ required)
required === 0 时（cancel / update）整个检查跳过
```

- `required` 的**计算不在 Keeper**，在 SDK `extractRequiredWnt`（`@fx-io/sdk/relay`），这样前端能在签名前就告警。
- Flash / express 模式下 relay 钱包**垫付 WNT 计价的执行费**，事后用用户的费用 token 报销——所以 WNT 存量**不会**被报销自动补回（与 gas 用的 ETH 不同）。
- 需要授权的 spender 是基础 **`Router`**（`pluginTransfer` 那个），**不是** RelayRouter。
- 不足时 `relWorker` 以 `RelayerExecutionFeeFundingInsufficient` 快速失败，不烧一次 simulate/gas 往返。

---

## 4. 近似清算价与候选索引（K2）

**锚点**：`chain/liquidationIndex.ts:121` `computeApproxLiquidationPrice()` · `:106` `scaleBigIntPriceToScore()` · `:94` `scoreScaleForToken()`；调用点 `:260 / :371 / :467 / :549`

### 4.1 近似清算价

```
delta = effectiveShortfallUsd / sizeInTokens        ← 整数除法；健康仓位时 shortfall 为负 ⇒ delta 为负

多头  approxLiqPrice = currentIndexPrice + delta
空头  approxLiqPrice = currentIndexPrice − delta

currentIndexPrice = (oracle.min + oracle.max) / 2          ← 中间价
```

⚠️ **`effectiveShortfallUsd` 不是 Reader 返回的字段**，是 Keeper 自己减出来的：

```
effectiveShortfallUsd = minCollateralUsdForLeverage − remainingCollateralUsd      （chain/marketState/store.ts:1155）
```

`Reader.isPositionLiquidatable` 返回 `[bool isLiquidatable, string reason, IsPositionLiquidatableInfo info]`，`info` 里只有 `remainingCollateralUsd` / `minCollateralUsd` / `minCollateralUsdForLeverage` 三个字段。所以这个量是 **K 级派生量，不是 A 级链上返回值**——不能拿它当合约权威值去做断言基准。

单位自洽：`USD×1e30 ÷ 10^d = 10^(30−d)` = 价格标度。

> 解码坑（源码注释记录）：`info` 是**具名结构体**，viem 返回**对象**而非位置数组。早期代码按 `info[0]/[1]/[2]` 取值得到 `undefined`，`effectiveShortfallUsd` 静默变 `NaN`。

**防御分支**：`sizeInTokens == 0` → 返回 `null`；`shortfall` 不是 bigint（ABI 解码失误导致 NaN）→ 返回 `null`。这不是洁癖——调用方 `syncFromStore` 是循环且**没有逐仓隔离**，一行坏数据抛异常会中断整轮同步，**静默停掉全部清算**。

**例子**（构造值）：多仓 5 ETH，`sizeInTokens = 5e18`，当前中间价 3000，`effectiveShortfallUsd = −2000 USD`

```
delta = −2000e30 / 5e18 = −400e12          （= −400 USD）
approxLiqPrice = 3000e12 + (−400e12) = 2600e12 = 2600 USD
```

自洽验证：5 ETH 仓位每跌 1 USD 亏 5 USD，2000 USD 缓冲 ÷ 5 = 400 USD，3000 − 400 = 2600 ✓

### 4.2 Redis 排序分数

```
scale = 10^(30 − tokenDecimals − 6)          （exp ≤ 0 时取 1）
score = Number( priceBigInt / scale )        ← 整数除法后转 double，丢弃余数
```

**这个标度是刻意设计的**：无论 token decimals 是多少，`10^(30−d) ÷ 10^(30−d−6) = 10^6`，即 **score 恒为"每美元 10^6"，分辨率统一到 1 微美元（1e-6 USD）**。

| token | d | 价格标度 | scale | 3000 USD 的 score |
| --- | --- | --- | --- | --- |
| ETH | 18 | `1e12` | `1e6` | `3.0e9` |
| WBTC | 8 | `1e22` | `1e16` | `3.0e9` |

**核对含义**：候选排序有 1 微美元的分辨率损失。做"边界仓位是否入候选"的用例时，价差小于 1e-6 USD 的两个仓位在排序里不可分——**这是 K2 层的固有粒度，不是缺陷**。

---

## 5. 近似 PnL 与 ADL top-M（K2）

**锚点**：`chain/marketState/liquidationCandidateVerifier.ts:89` `approximatePositionPnlUsd()` · `:98` `midPrice()` · `:103` `selectTopMWithTies()`

```
markUsd = sizeInTokens × indexMidPrice            ← 单位：10^d × 10^(30−d) = 1e30 ✓
多头 PnL ≈ markUsd − sizeInUsd
空头 PnL ≈ sizeInUsd − markUsd
```

**与合约 PnL 的差异**：合约的 `PositionUtils._getPositionPnlUsd`（即 Reader 的 `basePnlUsd`）本身也**只是** `sizeInTokens × 执行价 − sizeInUsd`，同样不含费用、不含 funding——所以差异**不在**这两项，而在下面两条：

| 项 | 合约 | Keeper 近似 |
| --- | --- | --- |
| 用什么价 | **含动态点差的 executionPrice** | **oracle 中间价**（`(min+max)/2`） |
| 盈利封顶 | 受池级 `MAX_PNL_FACTOR` 等比缩放 | **不封顶** |

用途只有一个：ADL 的 top-M 排序，避免全量 `getPositionInfo` 扫描。

**top-M 取法**：

```
先取 top-K，再把与第 K 名分数并列的全部纳入
  cutoff = score(sorted[K−1])
  向后扩展直到 score ≠ cutoff
```

→ 返回条数 **≥ K**，并列不截断。写"取前 K 个"的断言会在有并列时误判。

**例子**（构造值）：K=3，降序分数 `[900, 850, 700, 700, 700, 650]` → 返回 **前 5 个**（三个 700 全带上），不是 3 个。

⚠️ **但并列扩展只存在于中间的 M 阶段**：`strategies/adl/auto.ts:53` 用 `topM = maxPerTick × topMMultiplier` 取候选，`:93` 最后无条件 `selected.slice(0, maxPerTick)` 硬截。**最终提交的 ADL 候选数不会超过 `maxPerTick`**——不要据此预期"命中数会多于配置值"。

---

## 6. 抵押品价格失效闸门（K2）

**锚点**：`chain/collateralInvalidation.ts:42` `CollateralInvalidationGate.shouldInvalidate()`

```
movedBps = |mid − prevMid| × 10000 / prevMid          ← 整数除法（prevMid > 0）
                                                        prevMid == 0 时退化为 mid ≠ prevMid

shouldInvalidate = (movedBps ≥ movementBps) 或 (nowMs − prevAtMs ≥ maxIntervalMs)
```

分支：

| 条件 | 结果 | 副作用 |
| --- | --- | --- |
| 该 token 首次出现（无 previous） | **true** | 记录基线 |
| 价格变动达阈值 | **true** | **同时重置**价格与时间两条基线 |
| 未达阈值但超时 | **true** | 同上 |
| 未达阈值且未超时 | **false** | 基线不动 |

进程重启会丢掉 `last` 映射——**安全**：重启后第一次 tick 无条件失效。

**例子**（构造值，设 `movementBps = 10`）：`prevMid = 1.0000`、`mid = 1.0008` → `movedBps = 8 < 10` → 不失效（除非已超 `maxIntervalMs`）。

---

## 7. 触发单预筛（K2，fail-open）

**锚点**：`domain/orders/triggerFilter.ts:139` `evaluateTrigger()` · `:80` `extractTriggerFields()`

> ⚠️ **本节描述的是遗留路径，不是现役提交路径。** keeper 自家 `IMPLEMENTATION.md:705` 原文：`evaluateTrigger` … *"is the legacy single-slot wrapper retained for its tests; the submit path no longer calls it."* 全仓库搜索确认该函数除自身定义与测试外**无调用点**。
>
> **现役的触发筛选在 §1.2**：由 `selectMinMaxSlot` 的 `triggerCheck` 谓词做 filter-then-extreme——先筛掉未越过触发价的 slot，再在剩下的里挑方向极值。做 Keeper 触发行为的用例请以 §1.2 为准。
>
> 本节保留的价值：`extractTriggerFields` 仍是解析触发字段的工具；这套 fail-open 阶梯也如实反映了 Keeper 一贯的取向（宁可多提交交合约裁决，也不自行漏单）——§1.2 把 `no-trigger-crossed` 与 `all-expired` 分成两个失败码，同样是这个取向。

**判定顺序（任一条命中即 `submit`，交合约裁决）**：

| # | 条件 | 判定 | 理由 |
| --- | --- | --- | --- |
| 1 | 事件里取不到 `orderType` | `submit` | 无从判断 |
| 2 | `orderType` 不是触发型 | `submit` | 本就没有触发闸门 |
| 3 | `triggerPrice == 0` | `submit` | 交合约校验 |
| 4 | 未提供 `indexTokenDecimals` | `submit` | **缺 decimals 无法换标度，裸比较会把结论比反** |
| 5 | 参考价解码失败 | `submit` | 无从判断 |
| 6 | 标度换算抛错 | `submit` | 无从判断 |
| 7 | 以上都通过 | 按 `isTriggerCrossed` 判 | 唯一真正做筛选的分支 |

**标度换算**（`streamUsdInt192ToFx100OraclePrice`）：

```
Chainlink 流报价 USD × 1e18  →  oracle 标度 USD × 10^(30 − tokenDecimals)
```

**核对含义**：这一层**只会丢弃明显未触发的单，绝不因判定不准而漏单**；代价是可能提交注定被合约拒绝的单。所以"Keeper 是否漏单"的用例断言方向应是**不漏**，而不是"不多提交"。

---

## 8. 与 SDK 共享的实现（Keeper 不自己算的部分）

以下函数 Keeper 直接 `import` 自 `@fx-io/sdk`，**前端与 Keeper 是同一份代码**，不存在"两边算得不一样"：

| 函数 | SDK 位置 | Keeper 用在哪 | 作用 |
| --- | --- | --- | --- |
| `useMaxForSide` | `utils/fx100Orders.ts:108` | `chain/minMaxPriceSelector.ts:20` | 方向 → 取 ask 还是 bid |
| `deriveSideForOrder` / `deriveSideForAdl` | `utils/fx100Orders.ts:87 / :98` | **由 Keeper 的上游调用方从 SDK 直接 import**（`minMaxPriceSelector.ts` 只 import `useMaxForSide` 与类型 `PriceSide`，其文件头明确要求这两个函数「import it from there rather than through this module」） | 订单类型+方向 → PriceSide |
| `isTriggerCrossed` | `utils/fx100Orders.ts:59` | `domain/orders/triggerFilter.ts` | 触发是否越过 |
| `isTriggerOrderType` | `utils/fx100Orders.ts` | `chain/triggerIndex.ts:51` | 是否触发型订单 |
| `extractRequiredWnt` | `@fx-io/sdk/relay` | `domain/relay/funding.ts`（消费其结果） | relay 需垫付的 WNT |
| `USD_DECIMALS` | `utils/numbers.ts` | `chain/liquidationIndex.ts:46` | `= 30` |

**`useMaxForSide` 三层同构**——这是"三层一致"的正面样板：

| 层 | 表述 | 锚点 |
| --- | --- | --- |
| 合约 | `useMax = (开仓&多) 或 (平仓&空)` | `PositionUtils.getExecutionPriceForIncrease/Decrease` |
| SDK | `long-increase` / `short-decrease` → `true`（max ask）；`short-increase` / `long-decrease` / `adl` → `false`（min bid） | `utils/fx100Orders.ts:108` |
| Keeper | 直接调 SDK 同一函数 | `chain/minMaxPriceSelector.ts:124` |

---

## 9. 最终确认：合约 Reader（A 级）

Keeper 在广播清算交易前，会用**准备提交的同一份 oracle 报文**调合约：

```
Reader.isPositionLiquidatable(...)   →  返回 false 就不提交
```

**锚点**：`chain/marketState/liquidationCandidateVerifier.ts:53`（`exactCheckPositionLiquidatable`）· `entrypoints/liqWorker.ts:519`（提交前 preflight）· `chain/marketState/store.ts:750`（`forLiquidation=true` 的批量 multicall）

**因此三层的验收关系是**：

```
前端预估清算价  ≈  合约清算边界        （B 级：验算法一致，不验等于链上）
Keeper 近似价   不遗漏进入风险区间的仓位  （K2：只验不漏）
最终是否清算    完全以合约 Reader 判定为准（A 级：唯一断言基准）
```

**不能要求** `前端清算价 = Keeper 近似价 = 合约实际边界价`。

---

## 10. 对测试与核对的影响（归因表）

用例 FAIL 或实际值偏离期望时，按此表判断是否 Keeper 层造成：

| 症状 | 可能来源 | 等级 | 判别方法 |
| --- | --- | --- | --- |
| 执行价与"按某个 oracle 快照算的期望值"对不上 | §1 选了另一份报文 | K1 | 用事件里的 oracle 价重算；查提交报文的 `observationsTimestamp` |
| 真实清算价比页面 Est.Liq 略早 | funding 漂移 + 执行点差 + §1.2 清算取"最新有效"而非极值 + 区块离散 | K1+K2 | 三者叠加，属正常邻域，**非公式错** |
| TP/SL 减仓单失败一次后成功 | §2 已知缺口（`positionIncreasedAtTime` 下界不在事件里） | K1 | 查失败原因是否为 stale oracle |
| 边界仓位未进清算候选 | §4.2 score 分辨率 1e-6 USD | K2 | 价差是否小于 1 微美元 |
| ADL 命中数量与预期不符 | §5 的 top-M 并列扩展只在中间阶段；`strategies/adl/auto.ts:93` 最终 `slice(0, maxPerTick)` 硬截 | K2 | 先确认 `maxPerTick` 配置值；**命中数不会超过它**，多出来要另找原因 |
| 广播全部 out-of-gas | §3.1 两条要求之一失守 | K1 | 查 `KEEPER_PRECONF_ENABLED` 与 buffer 配置 |
| 提交了注定失败的触发单 | §1.2 的 `triggerCheck` 只做粗筛，宁多勿漏 | K2 | 正常行为，不是缺陷 |

另有**非公式**但会污染用例的 Keeper 机制，见 skill `fx100-verify-handbook` 的 `references/traps.md`：Service Keeper 抢跑、stale 价秒吃新单、多人共用队列偷单、`chain/submitGate.ts:52` 的单钥 nonce FIFO 序列化。

---

## 11. 代码来源

全部锚定 `fx100-apps@develop` @ `dfa36d0b5295d20246df2ae42fec50327fb0ace3`，`apps/keeper/src/` 下：

- `chain/minMaxPriceSelector.ts` — 报文选择（§1）
- `chain/oracle.ts` — 选择器调用点（§1.1）
- `chain/liquidationIndex.ts` — 近似清算价与 Redis 索引（§4）
- `chain/marketState/liquidationCandidateVerifier.ts` — 近似 PnL、中间价、top-M、Reader 精确校验（§5 §9）
- `chain/marketState/store.ts` — 批量 `isPositionLiquidatable`（§9）
- `chain/collateralInvalidation.ts` — 抵押品失效闸门（§6）
- `chain/submitGate.ts` — 单钥广播序列化（§10）
- `domain/orders/oracleWindow.ts` — oracle 时间窗下界（§2）
- `domain/orders/triggerFilter.ts` — 触发预筛（§7）
- `domain/relay/gasPolicy.ts` — gas buffer（§3.1）
- `domain/relay/funding.ts` — WNT 前置（§3.2）
- `entrypoints/relWorker.ts` / `entrypoints/liqWorker.ts` — 调用点

SDK 侧共享实现见 §8；合约侧见 [FX100-核心字段计算公式.md](./FX100-核心字段计算公式.md)。

## 12. 使用限制

- 本文是 **Keeper 代码口径**，不是链上标准。任何断言的基准仍是合约实现与 Reader 返回值。
- 所有例子标注为**构造值**，用于验证公式自洽与量纲，**不是实测数据**，不得当作期望值写死。
- `develop` 是移动分支：行号随 rebase 失效，以函数名定位；引用时必须带 head。
- 本文只覆盖已扫描确认的计算点；`chain/priceBuffer.ts`、`chain/priceRecorder.ts`、`chain/triggerIndex.ts`、`domain/prices/recordedPriceRefresh.ts` 的内部计算尚未逐行核对，需要时再补。
- **引用任何 Keeper 行为前先确认它是现役路径**：§7 的 `evaluateTrigger` 已确认为遗留（现役见 §1.2）。方法是 grep 该函数在 `apps/keeper/src` 下除自身定义与 `__tests__` 外是否还有调用点。

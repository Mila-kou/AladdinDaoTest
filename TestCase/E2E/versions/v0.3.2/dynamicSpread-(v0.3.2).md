# v0.3.2 dynamicSpread 功能、影响数据与边界

> 版本基线只认 [`Docs/contract-releases/CURRENT.json`](../../../../Docs/contract-releases/CURRENT.json)。本文描述 v0.3.2 的功能和测试判定口径，不把历史版本结论继承为当前版本 PASS。

## 1. 范围与核心结论

`dynamicSpread` 是仓位执行时根据订单规模、订单方向、当前 OI、Oracle 和配置实时计算的**有符号成交点差**。它不是 Order 的持久化字段，也不是用户或 Keeper 可以直接提交的值。

测试必须同时证明：

1. 原始值 `rawSpread` 的三个组成项推导正确。
2. `MIN_DYNAMIC_SPREAD`、`MAX_DYNAMIC_SPREAD` 和特殊订单负值禁用规则正确。
3. 最终点差以正确价格侧和舍入方式进入 `executionPrice`。
4. 成交价继续影响规模换算、PnL、仓位、OI、可接受价格校验和账本。
5. 前端预览、SDK 类型、交易回执和链上事件对正负号及精度的解释一致。

最容易写错的四点是：

- 负值不是异常。普通 Increase/Decrease 可以获得负点差带来的价格改善。
- Liquidation 和 `SecondaryOrderType.Adl` 不允许负点差，最终下限至少为 0。
- `balanceWasImproved` 与最终点差是同一次计算的两个输出；手续费档位使用前者，不是用 clamp 后的 `dynamicSpread` 正负号反推。
- 相同订单参数不保证相同点差；执行前的 OI、Oracle 和配置变化都会改变结果。

## 2. 定义与职责边界

| 层 | 负责什么 | 不负责什么 |
|---|---|---|
| 合约 | 读取执行时状态，计算 raw/final spread、成交价和 `balanceWasImproved`，执行可接受价格校验并记事件 | 不保存订单创建时的 spread 快照 |
| Keeper | 提交有效 Oracle 报告并触发订单、清算或 ADL 执行 | 不计算或指定 `dynamicSpread` |
| Reader | 普通 Increase/Decrease 的预估结果，返回有符号 `int256 dynamicSpread` | 通用 `getExecutionPrice` 不表达 Liquidation/ADL 的 `allowNegativeSpread=false` 语义 |
| 前端/SDK | 读取配置和 Reader、展示有符号预估、按链上舍入口径提示用户，并用事件核对实际成交 | 不能把本地预估当作最终成交事实 |
| 测试 | 独立计算期望值，并用事件、Reader、仓位/OI/余额交叉验证 | 不能拿被测返回值自身当作 raw 期望值 |

## 3. 输入与数据来源

### 3.1 直接输入

| 输入 | 精度/类型 | 用途 |
|---|---|---|
| `usdDelta` | `int256`，USD 1e30；Increase 为正，Decrease 为负 | 判断增减仓、规模绝对值和买卖深度 |
| pricing `tokenDelta` | `int256`，index token 原生 decimals | 用 Oracle 基准价先解析，作为本次 skew/OI 前后态的定价输入；不一定等于成交后的最终 token delta |
| `isLong` | `bool` | 选择 long/short clamp 键和买卖路径 |
| Oracle `indexTokenPrice.min/max` | 合约价格精度 | 成交价价格侧 |
| Oracle midpoint | `(min + max) / 2` 的实现口径 | 将 OI token 数量换为 USD 后计算 skew |
| 当前 long/short OI in tokens | token 原生 decimals | 计算操作前后不平衡度 |
| 市场配置 | 见下表 | 组成项和最终 clamp |

### 3.2 配置键

| 配置 | 作用 | 维度 |
|---|---|---|
| `CONSTANT_PRICE_SPREAD` | 固定点差 | `marketIndex` |
| `PRICE_IMPACT_PARAMETER` | 大单指数曲线参数 | `marketIndex` |
| `ASK_ORDER_BOOK_DEPTH` / `BID_ORDER_BOOK_DEPTH` | 买入/卖出深度 | `marketIndex` |
| `MAX_PRICE_IMPACT_SPREAD` | price impact 子项上限 | 全局 |
| `SKEW_IMPACT_FACTOR` | OI 不平衡影响系数 | `marketIndex` |
| `MIN_SKEW_IMPACT` / `MAX_SKEW_IMPACT` | skew 子项上下限 | `marketIndex` |
| `MIN_DYNAMIC_SPREAD` / `MAX_DYNAMIC_SPREAD` | 最终有符号点差上下限 | `marketIndex × isLong` |

部署参数必须在被测环境运行时读取并附到报告中。历史快照只能用于构造 fixture，不能替代目标环境真值。Mock index token 也不得固定写成 BTC；用市场实际 token 地址、符号和 decimals，至少覆盖 8 位与 18 位精度数据集。

### 3.3 买卖路径与深度

| 动作 | `usdDelta` | 经济方向 | 深度 |
|---|---:|---|---|
| long Increase | `> 0` | buy | ask |
| short Increase | `> 0` | sell | bid |
| long Decrease | `< 0` | sell | bid |
| short Decrease | `< 0` | buy | ask |

测试不能只按 `isLong` 选择 bid/ask；Decrease 会反转经济方向。

## 4. 公式与执行流程

以下用 `W = 1e18` 表示 100%。所有整数除法、向上/向下取整都必须与 Solidity 一致。

### 4.1 Price Impact Spread

令：

```text
q = abs(usdDelta)
x = floor(q × priceImpactParameter / depth)
linear = floor(q × W / depth)
```

规则：

```text
depth == 0 或 priceImpactParameter == 0  => priceImpactSpread = 0
x > 130e18                              => priceImpactSpread = MAX_PRICE_IMPACT_SPREAD
否则：
priceImpactSpread = min(
  max(exp(x) - W, linear) / 100,
  MAX_PRICE_IMPACT_SPREAD
)
```

`x == 130e18` 仍进入 `exp` 分支；只有严格大于才直接返回上限。前端若用浮点 `Math.exp`，必须额外证明大数、边界和合约整数结果一致。

### 4.2 Skew Impact Spread

先按 Oracle midpoint 将 long/short OI in tokens 换算为 USD，再应用本次 token delta：

```text
skewBefore = floor(abs(longOI - shortOI) × W / (longOI + shortOI))
skewAfter  = floor(abs(nextLongOI - nextShortOI) × W / (nextLongOI + nextShortOI))
skewRef    = floor((skewBefore + skewAfter) / 2)

balanceWasImproved = abs(nextLongOI - nextShortOI) < abs(longOI - shortOI)
skewImpactRaw = SKEW_IMPACT_FACTOR × skewRef / W
若 balanceWasImproved，skewImpactRaw 取负
skewImpact = clamp(skewImpactRaw, MIN_SKEW_IMPACT, MAX_SKEW_IMPACT)
```

“改善”是严格 `<`；相等不是改善。分母为 0 时该时点 skew 按 0 处理。

USD Increase 有两个 token delta：先按 Oracle 基准价解析 `pricingTokenDelta` 参与本次 dynamicSpread；得到 execution price 后再反算 `resolvedTokenDelta` 用于实际 Position/OI 落账。本次计算不迭代重算 spread，也不能从成交事件中的最终 token delta 反推当时的 skew 输入。

### 4.3 raw 与 final

```text
rawSpread = constantPriceSpread + priceImpactSpread + skewImpact

min = MIN_DYNAMIC_SPREAD(marketIndex, isLong)
max = MAX_DYNAMIC_SPREAD(marketIndex, isLong)

Liquidation 或 ADL 且 min < 0  => min = 0
max < min                       => max = min

dynamicSpread = clamp(rawSpread, min, max)
```

普通 Increase/Decrease 的 `allowNegativeSpread=true`；Liquidation 和 ADL 为 `false`。后者只抬高最终下限，不会改写 `balanceWasImproved`。

### 4.4 成交价

| 经济方向 | 动作 | 成交价 | 舍入 |
|---|---|---|---|
| buy | long Increase、short Decrease | `oracle.max × (W + d) / W` | 向上 |
| sell | short Increase、long Decrease | `oracle.min × (W - d) / W` | 向下 |

其中 `d = dynamicSpread`。因此正值总是使交易者价格变差，负值在普通交易中使价格改善。

成交价随后再经过 `acceptablePrice` 校验。等于边界应成交；只向不利方向越过最小单位应拒绝或按订单处理规则进入可解释终态。

## 5. 以 dynamicSpread 为核心影响的数据

### 5.1 直接影响

| 数据 | 影响方式 | 关键断言 |
|---|---|---|
| `executionPrice` | 直接进入 buy/sell 公式 | 价格侧、符号和舍入完全一致 |
| Increase 的最终规模 | 合约先用 Oracle 基准价形成 spread 输入，随后 USD 模式保持 `sizeDeltaUsd`、按成交价重算 `sizeDeltaInTokens`；token 模式保持 token 数、按成交价重算 `sizeDeltaUsd` | 本次 spread 不自反馈迭代；落账必须核对 resolved delta |
| Decrease 的实现 PnL | 减仓规模先由仓位比例确定，成交价改变 realized PnL | 通常不改 size；但剩余抵押预检可能把 collateralDelta 归零或把本单扩成全平 |
| `acceptablePrice` 结果 | 成交价与用户保护价比较 | 等号、最小不利越界、订单终态 |
| Position 规模与成本 | Increase 后 size、entry/open cost 随最终规模和价格变化 | Position Reader 与事件一致 |
| Market OI | 使用解析后的 USD/token delta 更新 | long/short、USD/token 两套 OI 差分 |
| 事件 | `PositionIncrease`/`PositionDecrease` 保存最终有符号 spread | ABI 必须按 `int256` 解码 |

### 5.2 间接影响

| 数据 | 因果链 |
|---|---|
| 仓位 PnL、净值和杠杆 | `dynamicSpread → executionPrice → 开仓成本或减仓 PnL → 仓位净值` |
| 清算状态 | 清算规则成交价影响 full-close PnL 和 remaining collateral；特殊订单负值下限为 0 |
| ADL 后风险比例 | ADL 成交价影响目标仓位减仓结果，执行后全局净义务比例必须严格下降 |
| Vault/Pool/用户余额 | 成交规模、PnL、费用扣除和输出金额共同改变账本 |
| TP/SL/Limit 执行结果 | trigger 先独立判断，触发后仍要用执行价通过 acceptable price |
| 后续订单点差 | 本单更新 OI 后，后续订单的 skew 输入发生变化 |
| 页面预估 | 点差改变执行价、Pay/Receive、PnL、价格影响和风险提示 |

### 5.3 相关但不是由 final spread 单独决定

| 数据 | 正确关系 |
|---|---|
| `balanceWasImproved` 与 Position Fee 档 | 与 spread 共用 OI 前后态计算，但不由 clamp 后的 spread 反推；只有 Position Fee factor 按该 bool 选档，即使 final 被夹为 0，改善档仍可能成立 |
| UI/Liquidation Fee factor | 分别由自身配置决定，不使用 `balanceWasImproved`；spread 只可能通过 resolved size、PnL 或结算间接影响金额 |
| Funding rate | 由时间、OI skew EMA 和 Funding 配置决定，不使用 dynamicSpread；仓位动作会同时触发 Funding 结算 |
| Execution Fee / Relay Fee | 有独立的 gas 或代付费公式，不把 dynamicSpread 当输入 |
| Trigger 条件 | 使用订单类型规定的 Oracle 价格侧；不是先用 spread 修正 trigger price |
| Order 存储字段 | Order 中没有 dynamicSpread；实际值只在执行结果/仓位事件中出现 |

## 6. 合约、Keeper 与前端一致性

### 6.1 合约事实源

- 核心公式：[`PositionPricingUtils.sol`](../../../../Github/fx100-contracts@release-v0.3.2/src/pricing/PositionPricingUtils.sol)。
- Increase/Decrease 价格侧与特殊订单规则：[`PositionUtils.sol`](../../../../Github/fx100-contracts@release-v0.3.2/src/position/PositionUtils.sol)。
- 实际值证据：[`PositionEventUtils.sol`](../../../../Github/fx100-contracts@release-v0.3.2/src/position/PositionEventUtils.sol) 中 `PositionIncrease.intItems[1]`、`PositionDecrease.intItems[3]`。
- Reader 返回类型：[`ReaderPricingUtils.sol`](../../../../Github/fx100-contracts@release-v0.3.2/src/reader/ReaderPricingUtils.sol) 的 `int256 dynamicSpread`。

Reader 的通用预估按普通 Increase/Decrease 语义执行，并返回 clamp 后的 final spread。清算和 ADL 的 floor-at-0 应以真实特殊订单路径或其仓位事件为准，不能只调用通用 Reader 得出结论。

### 6.2 Keeper

Keeper 输入是订单执行上下文和 Oracle 报告，不包含 dynamicSpread。相同 Oracle 报告下，若前一笔订单已经改变 OI，后一笔点差仍会不同。清算 Keeper 的精确预检应调用 Reader 的可清算判定，并在执行时使用同一份价格语义；本地近似清算价不能替代合约最终判定。

### 6.3 前端静态核对风险

截至 2026-09-05 的 v0.3.2 配套代码静态核对，以下项必须通过 FT/XT 用例确认，不能直接写 PASS：

1. [`useExecutionPriceConfig.ts`](../../../../Github/fx100-apps@develop/apps/fx-base-app/src/hooks/trade/useExecutionPriceConfig.ts) 未完整读取 aggregate MIN/MAX clamp 配置。
2. [`executionPrice.ts`](../../../../Github/fx100-apps@develop/apps/fx-base-app/src/lib/executionPrice.ts) 存在把 raw 直接 `max(0, raw)` 的旧口径，无法表达普通订单负点差和 MIN/MAX。
3. SDK Reader ABI 中若仍声明 `uint256 dynamicSpread`，负值会被错误解码；应与合约 `int256` 对齐。
4. 本地 `Math.exp` 的溢出/抛错行为不等于合约 `x > 130e18` 直接封顶。
5. TP/SL Decrease 的页面预估若跳过 FX100 spread，会与普通 Decrease 合约路径不一致。
6. `executionPrice.ts` 的 OI/skew 换算明确把 tokenDelta 固定转换为 1e18 native-token scale，并以 `/1e30` 归一；这只覆盖其当前 18 位假设，不能证明 8 位 index token 与合约原始单位一致。
7. 合约部署脚本 [`configureOracle.ts`](../../../../Github/fx100-contracts@release-v0.3.2/scripts/configureOracle.ts) 的 `getTokenDecimals` 又把所有非 USDC token 固定视为 18 位。因而“8 位市场尚未部署”是环境 `BLOCKED`，而“前端/配置脚本存在 18 位硬编码”是已静态确认的 `GAP`；两者必须分别记录。

命名也必须分开：合约 Reader/事件的 `dynamicSpread` 是 final；当前前端 `spreadInfo.dynamicSpread` 是 raw 三项和，`spreadInfo.spread` 又是 `max(0, raw)`。报告不得把三者写成同一个字段。

这些是静态差异风险，当前按 `GAP` 管理，不等于已经执行出的 FAIL；由 `FT-PRICE-006` 和跨层证据给出正式结论。

## 7. 边界值设计

| 组 | 边界/等价类 | 期望 |
|---|---|---|
| 零规模 | `usdDelta = 0` | spread=0、`balanceWasImproved=false`，走对应 Oracle 价格侧；不做 acceptable price 校验 |
| 最小算术规模 | `usdDelta = 1` | 只作为 library/Reader 数学边界；price impact 可截断为 0。正常 E2E 会受最小仓位和 tokenDelta=0 校验，不能声称可由 Keeper 成交 |
| 无深度 | depth=0 | price impact 子项=0，不除零 |
| 无参数 | parameter=0 | price impact 子项=0 |
| 指数阈值 | `x=130e18−1`、`=130e18`、`=130e18+1` | 前两点走 exp，后一点击中直接上限；都不得因指数溢出失败 |
| aggregate 未配置 | min=0、max=0 | 对非零订单 final 恒为 0；`usdDelta=0` 会在读取/clamp 前直接返回 0 |
| MIN | raw=min−1、min、min+1 | 分别为 min、min、raw |
| MAX | raw=max−1、max、max+1 | 分别为 raw、max、max |
| 错序配置 | max<min | 普通非零订单先把 max 抬到 min；Liquidation/ADL 还会先把负 min 抬到 0 |
| 单点配置 | min=max=k | 普通非零订单 final 恒为 k；零规模直接为 0，特殊订单的负 k 最终为 0 |
| 半配置 | min<0,max=0；min=0,max>0 | 前者仅允许非正，后者仅允许非负；报告必须标配置缺口 |
| 负值隔离 | 同一 raw<0 跑普通 Decrease、Liquidation、ADL | 普通保留负值；Liquidation/ADL final 至少为 0 |
| 负值 fixture | `MIN_SKEW_IMPACT<0` 且对应方向 `MIN_DYNAMIC_SPREAD<0` | 两个条件都满足才可能保留负值；运行前链上读取，不能假设部署默认 |
| 改善判定 | `abs(next imbalance)` 小于、等于、大于当前值 | 只有严格小于为 true |
| 穿越平衡点 | 本次规模刚好平衡、越过平衡点前后 | 按绝对不平衡度判断，而不是只看买卖方向 |
| bid/ask | Oracle min≠max，四交易象限 | 买路径取 max/ask，卖路径取 min/bid，并匹配深度 |
| 舍入 | spread 相差 1 wei；价格乘除恰好/有余数 | final spread 事件可不同而 executionPrice 相同；二者都要断言 |
| 极端 final | buy 的 `d <= -W`、sell 的 `d >= W` 及相邻点 | 等号可能得到 0 价，越界可能算术 revert；配置写入成功不代表可安全执行 |
| token 精度 | index token 8/18 decimals | 经济等价时 spread 应一致，resolved token 数可有量化差异；当前 8d 市场未部署时执行覆盖标 `BLOCKED`，前端与配置脚本的 18 位硬编码另标静态 `GAP`，不得合并或伪造 PASS |
| 顺序性 | 同状态连续两笔同参数订单 | 第二笔按第一笔更新后的 OI 重新计算 |
| 权限 | 无角色、LIMITED_CONFIG_KEEPER、CONFIG_KEEPER 写 signed clamp | 未授权拒绝；有限角色受 base key 限制；合法角色写入后仍需执行安全性测试 |

配置函数对 signed clamp 不提供完整业务范围保护。测试 fixture 应避免把 `d <= -W` 或 `d >= W` 当成正常生产配置；专门故障用例要断言 Position/OI/Vault 无非预期变化，同时允许 OrderHandler 按订单类型形成规范的 Cancelled/Frozen 终态并结算 execution fee。

## 8. 测试用例与断言

| 用例 | 覆盖 |
|---|---|
| `CT-PRICE-001` | 普通交易负 raw/final spread 与价格改善 |
| `CT-PRICE-002` | MIN 的低于/等于/高于三点 |
| `CT-PRICE-003` | MAX 的低于/等于/高于三点 |
| `CT-PRICE-004` | 指数上限前/等于/越过及零深度/零参数 |
| `XT-PRICE-005` | long/short Increase/Decrease 的 acceptable price 四象限 |
| `FT-PRICE-006` | 前端 signed 类型、MIN/MAX、舍入和展示 |
| `XT-LIQ-003` | 清算负点差 floor-at-0 与账本 |
| `CT-ADL-004` | ADL 负值 floor-at-0、正值/effective MAX clamp 与风险改善 |
| `SCN-B32-01/02` | 9 组 aggregate/skew/权限数据集和指数封顶专项 |

每个数据集至少保存：

1. 执行前配置、Oracle、long/short OI USD 与 token 值。
2. 独立推导的 constant、price impact、skew、raw、effective min/max 和 final。
3. Reader 预估（仅适用普通交易）、订单参数、执行交易与实际事件。
4. `executionPrice`、resolved USD/token delta、Position、OI、PnL、费用和余额差分。
5. 页面预估、payload、钱包结果、Toast/History（FT/XT）。

`rawSpread` 没有作为一个完整字段直接写入事件。测试报告中的 raw 必须由输入独立计算，并同时保留三个组成项；只断言事件里的 final 值会漏掉组成项错误被 clamp 掩盖的情况。

若 final spread 导致 acceptable price 失败，通常不会产生 `PositionIncrease/PositionDecrease` 事件。此时应以同状态、同 Oracle 的 Reader/独立复算保存预期，并核对 `OrderCancelled` 或 `OrderFrozen` 的原因；不得要求从不存在的 Position 事件中取 spread。

## 9. 已知缺口与完成条件

- Foundry 单元覆盖不能替代 fork E2E；`SCN-B32-01/02`、`CT-PRICE-*` 未执行前保持 `NOT_RUN`。
- 需要补齐前端对 signed Reader ABI、aggregate clamp、130e18 封顶和 TP/SL Decrease 的运行证据。
- 清算/ADL 的实际点差必须从特殊订单仓位事件取得，通用 Reader 预估只能作普通交易对照。
- 完成标准是“公式、事件、状态、资金、页面”五类证据一致，不以交易成功或脚本快速结束代替。

详细数值 fixture 见 [`05-重要参数边界场景.md`](../../../../Docs/contract-releases/v0.3.2/05-重要参数边界场景.md) 与 [`cases/SCN-B32.md`](cases/SCN-B32.md)。

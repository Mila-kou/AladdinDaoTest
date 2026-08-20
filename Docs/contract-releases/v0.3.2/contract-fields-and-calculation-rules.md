# FX100 Contracts v0.3.2 字段与计算规则

## 1. 文档目的

本文整理 FX100 Contracts v0.3.2 中与用户仓位、杠杆、保证金、成交价格、费用、资金费和清算相关的主要字段及计算口径。

> 注意：文中的默认参数来自代码仓库默认配置，仅用于说明。生产环境应以对应链上 `DataStore` 的实时配置为准。

## 2. 精度约定

| 类型 | 精度 | 含义 |
| --- | ---: | --- |
| USD 金额、比例因子 | `1e30` | 比例中 `1e30 = 100%`；USD 金额通常也使用 30 位精度 |
| 点差、skew | `1e18` | `1e18 = 100%` 或 `1x` |
| Token 数量 | Token decimals | 例如 USDC 通常为 6 位精度 |
| Token 价格 | 与 Token decimals 组合 | 合约乘法结果按 USD 30 位精度处理 |

## 3. 仓位核心字段

| 字段 | 中文名称 | 说明 | 主要计算或来源 |
| --- | --- | --- | --- |
| `account` | 仓位账户 | 仓位所有者地址 | 创建仓位时记录 |
| `marketIndex` | 市场编号 | 对应交易市场 | 订单指定 |
| `isLong` | 多空方向 | `true` 为多仓，`false` 为空仓 | 订单指定 |
| `sizeInUsd` | 名义仓位规模 | 仓位按 USD 记录的 Notional Size | 加仓累加 `sizeDeltaUsd`，减仓扣减 `sizeDeltaUsd` |
| `sizeInTokens` | 指数代币数量 | 仓位对应的指数资产数量 | 通常约等于 `sizeInUsd / executionPrice` |
| `collateralAmount` | 保证金数量 | 以抵押品 Token 计量的保证金 | 入金、出金、PnL 和费用结算后更新 |
| `negativeFundingFeePerSize` | 应付资金费快照 | 仓位上次结算时的累计应付资金费指数 | 仓位操作后更新 |
| `positiveFundingFeePerSize` | 应收资金费快照 | 仓位上次结算时的累计应收资金费指数 | 仓位操作后更新 |
| `increasedAtTime` | 最近加仓时间 | 最近一次增加仓位的时间 | 加仓执行时更新 |
| `decreasedAtTime` | 最近减仓时间 | 最近一次减少仓位的时间 | 减仓执行时更新 |
| `graceStart` | 清算保护开始时间 | 首次创建仓位时记录 | `block.timestamp` |
| `graceEnd` | 清算保护结束时间 | 保护期内不能创建清算订单 | `graceStart + gracePeriodBase × tierMultiplier` |

## 4. 订单核心字段

| 字段 | 中文名称 | 说明 |
| --- | --- | --- |
| `sizeDelta` | 仓位变化量 | 根据 `isSizeDeltaUsd` 表示 USD 数量或 Token 数量 |
| `isSizeDeltaUsd` | 变化量单位 | `true` 表示 `sizeDelta` 是 USD；`false` 表示是 Token 数量 |
| `initialCollateralDeltaAmount` | 保证金变化量 | 加仓时为投入保证金；减仓时为计划提取保证金 |
| `orderType` | 订单类型 | 市价、限价、止盈止损、清算等 |
| `triggerPrice` | 触发价格 | 非市价订单的触发条件 |
| `acceptablePrice` | 可接受价格 | 用户允许的最差成交价格 |
| `executionFee` | 执行费 | 支付 Keeper 执行订单的费用，不属于仓位 Close Fee |
| `minOutputAmount` | 最小输出 | 减仓时按 USD 价值检查最低输出 |
| `uiFeeReceiver` | UI 费用接收方 | 地址为零时不收 UI Fee |

## 5. Notional Size

### 5.1 定义

Notional Size 对应 `position.sizeInUsd`，表示仓位的 USD 名义规模，不等于保证金，也不等于随行情变化的当前仓位市值。

订单以 USD 指定仓位时：

```text
sizeDeltaUsd = 用户指定的 USD 仓位变化量
sizeDeltaInTokens ≈ sizeDeltaUsd / executionPrice
```

订单以 Token 数量指定仓位时：

```text
sizeDeltaInTokens = 用户指定的 Token 变化量
sizeDeltaUsd = sizeDeltaInTokens × executionPrice
```

加仓后：

```text
newSizeInUsd = oldSizeInUsd + sizeDeltaUsd
newSizeInTokens = oldSizeInTokens + sizeDeltaInTokens
```

减仓后：

```text
newSizeInUsd = oldSizeInUsd - sizeDeltaUsd
newSizeInTokens = oldSizeInTokens - sizeDeltaInTokens
```

## 6. Execution Price 与动态点差

| 字段/参数 | 说明 |
| --- | --- |
| `indexTokenPrice.min/max` | 预言机价格区间 |
| `constantPriceSpread` | 固定点差 |
| `skewImpact` | 多空持仓不平衡带来的点差 |
| `priceImpactSpread` | 订单规模相对订单簿深度产生的价格影响 |
| `dynamicSpread` | 最终动态点差，类型为 `int256` |
| `minDynamicSpread` | 动态点差下限，可为负数 |
| `maxDynamicSpread` | 动态点差上限 |
| `balanceWasImproved` | 本次交易是否改善市场多空平衡；同时影响手续费档位 |

动态点差基础公式：

```text
rawDynamicSpread
= skewImpact
 + constantPriceSpread
 + priceImpactSpread

dynamicSpread
= clamp(rawDynamicSpread, minDynamicSpread, maxDynamicSpread)
```

普通订单允许负动态点差；清算和 ADL 不允许负动态点差，最低按 0 处理。

## 7. PnL

当前仓位价值：

```text
positionValue = sizeInTokens × executionPrice
```

多仓基础 PnL：

```text
longPnlUsd = positionValue - sizeInUsd
```

空仓基础 PnL：

```text
shortPnlUsd = sizeInUsd - positionValue
```

部分减仓只实现对应比例的 PnL：

```text
realizedPnlUsd
= totalPositionPnlUsd × sizeDeltaInTokens / position.sizeInTokens
```

实际可支付的正 PnL 还可能受到市场最大 PnL Factor 等风险参数限制。

## 8. Collateral 与 Remaining Collateral

保证金 USD 价值使用抵押品预言机最低价计算：

```text
collateralUsd = collateralAmount × collateralTokenPrice.min
```

清算检查使用的剩余保证金：

```text
remainingCollateralUsd
= collateralUsd
 + positionPnlUsd
 + positiveFundingFeeUsd
 - collateralCostUsd
```

其中：

```text
collateralCostUsd
= (Close Fee after discount + UI Fee + negative Funding Fee)
  × collateralTokenPrice.min
```

清算检查中的 `uiFeeReceiver` 为零，因此通常不产生 UI Fee。

## 9. Leverage 杠杆

### 9.1 用户展示杠杆

常规展示公式：

```text
Leverage = Notional Size / Collateral USD
```

例如：

```text
Notional Size = 10,000 USD
Collateral USD = 1,000 USD
Leverage = 10x
```

### 9.2 风险口径杠杆

用于风险判断时，应使用扣除 PnL 和费用后的剩余保证金：

```text
Effective Leverage = sizeInUsd / remainingCollateralUsd
```

因此即使 `sizeInUsd` 不变，亏损和累计资金费也会提高实际风险杠杆。

### 9.3 最大杠杆

合约没有独立的 `maxLeverage` 配置字段。最大允许杠杆由最小保证金率反推：

```text
effectiveMinCollateralFactor
= max(
    marketMinCollateralFactor,
    openInterestAdjustedMinCollateralFactor
  )

Max Leverage ≈ 1 / effectiveMinCollateralFactor
```

默认市场基础参数：

```text
minCollateralFactor = 1%
理论基础最大杠杆 = 1 / 1% = 100x
```

但实际可开杠杆可能低于 100x，因为：

- Open Interest 可能动态提高最低保证金率。
- 开仓后的仓位必须能通过剩余保证金校验。
- 价格影响、费用和舍入可能减少有效保证金。
- 还受单仓最大规模、市场 OI 和池子储备约束。

## 10. Position Fee / Open Fee / Close Fee

合约统一使用 `positionFeeAmount` 表示增加或减少仓位产生的仓位手续费：

```text
positionFeeUsd = sizeDeltaUsd × positionFeeFactor

positionFeeAmount
= positionFeeUsd / collateralTokenPrice.min
```

业务展示中：

- 加仓产生的 Position Fee 可称为 Open Fee。
- 减仓或清算平仓产生的 Position Fee 可称为 Close Fee。

`positionFeeFactor` 会根据 `balanceWasImproved` 选择手续费档位。默认配置示例为 `0.05%`，实际值以链上配置为准。

交易者实际承担的 Position Fee：

```text
netPositionFee
= positionFeeAmount - totalDiscountAmount
```

其中 `totalDiscountAmount` 取 Pro Discount 与 Referral Trader Discount 中较大者，不是两者相加。

## 11. Liquidation Fee 清算费

只有真正执行清算订单时才计算清算费：

```text
liquidationFeeUsd
= liquidatedSizeInUsd × liquidationFeeFactor

liquidationFeeAmount
= roundUp(liquidationFeeUsd / collateralTokenPrice.min)
```

清算是完整平仓：

```text
liquidatedSizeInUsd = position.sizeInUsd
```

市场参数示例配置为 `0.3%`，实际以链上 `LIQUIDATION_FEE_FACTOR` 为准。

清算费不会替代 Close Fee，而是在 Close Fee 之外追加。

## 12. Funding Fee 资金费

### 12.1 Funding Rate

多空资金费率根据市场多空偏斜计算：

```text
skew = (longOpenInterest - shortOpenInterest)
       / (longOpenInterest + shortOpenInterest)

longFundingFactorPerSecond
= clamp(fundingFloorFactor + fundingBaseFactor × skew,
        minFundingFactorPerSecond,
        maxFundingFactorPerSecond)

shortFundingFactorPerSecond
= clamp(-fundingBaseFactor × skew,
        minFundingFactorPerSecond,
        maxFundingFactorPerSecond)
```

正费率表示该方向支付资金费，负费率表示该方向获得资金费。

### 12.2 单仓资金费

合约使用累计 Funding Fee Per Size 指数结算：

```text
fundingDiffFactor
= latestFundingFeePerSize - positionFundingFeePerSizeSnapshot

fundingFeeAmount
= sizeInTokens × fundingDiffFactor
   / (FLOAT_PRECISION × collateralTokenPrice)
```

- 应付资金费使用抵押品最低价并向上取整。
- 应收资金费使用抵押品最高价并向下取整。
- 加仓、减仓和清算等仓位操作时进行实际结算。

## 13. UI Fee 与 Execution Fee

### 13.1 UI Fee

```text
uiFeeAmount
= sizeDeltaUsd × uiFeeReceiverFactor
   / collateralTokenPrice.min
```

仅当订单设置了非零 `uiFeeReceiver` 时产生。清算订单的 `uiFeeReceiver` 为零，因此正常情况下清算不收 UI Fee。

### 13.2 Execution Fee

Execution Fee 用于支付 Keeper 执行订单所需的 Gas，独立于仓位保证金费用：

- 不属于 Open Fee。
- 不属于 Close Fee。
- 不属于 Liquidation Fee。
- 清算订单由协议路径创建，订单内 `executionFee` 设置为 0。

## 14. 清算条件

### 14.1 前置条件：保护期结束

首次创建仓位时设置：

```text
graceEnd
= graceStart
 + liquidationGracePeriodBase × tierMultiplier
```

如果：

```text
block.timestamp < graceEnd
```

则不能创建清算订单。

### 14.2 清算判定涉及的字段和参数

| 类别 | 字段或参数 |
| --- | --- |
| 仓位 | `sizeInUsd`、`sizeInTokens`、`collateralAmount`、`isLong` |
| 价格 | 指数代币价格、抵押品价格、清算成交价 |
| PnL | `positionPnlUsd` |
| Close Fee | `positionFeeFactorKey(marketIndex, balanceWasImproved)` |
| Funding | 正、负 Funding Fee Per Size 及仓位快照 |
| 最低固定保证金 | `MIN_COLLATERAL_USD` |
| 清算保证金率 | `MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION` |
| 保护期 | `LIQUIDATION_GRACE_PERIOD_BASE`、Tier Multiplier |

### 14.3 清算判断公式

首先计算：

```text
remainingCollateralUsd
= collateralUsd
 + unrealizedPnlUsd
 + positiveFundingFeeUsd
 - CloseFeeUsdAfterDiscount
 - negativeFundingFeeUsd
```

再计算清算杠杆最低保证金：

```text
minCollateralUsdForLeverage
= position.sizeInUsd
 × minCollateralFactorForLiquidation
```

满足以下任一条件即判定可清算：

```text
条件 1：remainingCollateralUsd < MIN_COLLATERAL_USD

条件 2：remainingCollateralUsd <= 0

条件 3：remainingCollateralUsd
        < minCollateralUsdForLeverage
```

默认代码配置示例：

| 市场 | `minCollateralFactorForLiquidation` | 对应风险杠杆 |
| --- | ---: | ---: |
| ETH | 0.5% | 约 200x |
| WBTC | 0.4% | 约 250x |

这里的 200x/250x 是清算阈值比例的数学倒数，不代表用户允许开仓到该杠杆。默认开仓基础上限仍由 1% 最低保证金率约束为约 100x，并可能被其他风控条件进一步降低。

### 14.4 清算判断不计 Liquidation Fee

合约在判断仓位是否应该被清算时，明确将 `isLiquidation` 设为 `false`，因此：

- 计入预计全平 Close Fee。
- 计入应付 Funding Fee。
- 计入应收 Funding Fee。
- 不计入 Liquidation Fee。

这样避免仅因为新增清算费本身就把仓位推入可清算状态。

### 14.5 真正执行清算时的费用

清算执行时：

```text
totalCostAmountExcludingFunding
= Close Fee
 + Liquidation Fee
 + UI Fee
 - Trader Discount

totalCostAmount
= totalCostAmountExcludingFunding
 + negative Funding Fee
```

由于清算订单 `uiFeeReceiver = address(0)`，清算 UI Fee 通常为 0。

最终用户清算成本可概括为：

```text
清算总费用
= Close Fee after discount
 + Liquidation Fee
 + 应付 Funding Fee
 - 应收 Funding Fee 的保证金补充效果
```

PnL 会与剩余保证金一起参与最终结算。

## 15. 清算示例

假设：

```text
Notional Size                 = 10,000 USD
Collateral USD                = 600 USD
Unrealized PnL                = -520 USD
Close Fee Rate                = 0.05%
Liquidation Fee Rate          = 0.3%
Negative Funding Fee          = 5 USD
Positive Funding Fee          = 0 USD
Min Liquidation Factor        = 0.5%
MIN_COLLATERAL_USD            = 10 USD（仅为示例）
```

清算判断阶段：

```text
Close Fee = 10,000 × 0.05% = 5 USD

remainingCollateralUsd
= 600 - 520 - 5 - 5
= 70 USD

minCollateralUsdForLeverage
= 10,000 × 0.5%
= 50 USD
```

此时：

```text
70 USD > 50 USD
70 USD > 10 USD
```

仓位尚不可清算。

如果亏损再增加 30 USD：

```text
remainingCollateralUsd = 40 USD
40 USD < 50 USD
```

仓位达到清算条件。

真正清算时还会追加：

```text
Liquidation Fee = 10,000 × 0.3% = 30 USD
```

即清算判断不使用这 30 USD，但清算执行结算时会扣除。

## 16. 主要风险配置字段

| 配置字段 | 作用 |
| --- | --- |
| `MIN_POSITION_SIZE_USD` | 最小仓位规模 |
| `MAX_POSITION_SIZE_USD` | 单仓最大规模 |
| `MIN_COLLATERAL_USD` | 仓位最低剩余保证金 USD |
| `MIN_COLLATERAL_FACTOR` | 开仓和正常仓位校验的最低保证金率 |
| `MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION` | 清算判断最低保证金率 |
| `MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER` | 根据 OI 动态增加最低保证金率 |
| `POSITION_FEE_FACTOR` | Open/Close Position Fee 比例 |
| `LIQUIDATION_FEE_FACTOR` | 清算费比例 |
| `POSITION_FEE_RECEIVER_FACTOR` | Position Fee 分给协议费用接收方的比例 |
| `LIQUIDATION_FEE_RECEIVER_FACTOR` | 清算费分给费用接收方的比例 |
| `FUNDING_FLOOR_FACTOR` | Funding Rate 基础项 |
| `FUNDING_BASE_FACTOR` | Funding Rate 对 skew 的敏感度 |
| `MIN_FUNDING_FACTOR_PER_SECOND` | Funding Rate 每秒下限 |
| `MAX_FUNDING_FACTOR_PER_SECOND` | Funding Rate 每秒上限 |
| `LIQUIDATION_GRACE_PERIOD_BASE` | 新仓清算保护期基础值 |
| `LIQUIDATION_GRACE_PERIOD_TIER_MULTIPLIER` | 不同用户等级的保护期倍数 |
| `MIN_DYNAMIC_SPREAD` | 动态点差下限 |
| `MAX_DYNAMIC_SPREAD` | 动态点差上限 |
| `MAX_PRICE_IMPACT_SPREAD` | 价格影响点差全局上限 |
| `MAX_OPEN_INTEREST` | 市场方向绝对 OI 上限 |
| `MAX_OPEN_INTEREST_FACTOR` | OI 相对池子资产的上限 |
| `RESERVE_FACTOR` | 市场可用于承载 OI 的储备比例 |

## 17. 前端字段展示建议

| 前端字段 | 建议口径 |
| --- | --- |
| Notional Size | `position.sizeInUsd` |
| Position Size (Token) | `position.sizeInTokens` |
| Collateral | `position.collateralAmount × collateralTokenPrice` |
| Entry Price | `sizeInUsd / sizeInTokens`，注意加仓后的组合口径 |
| Mark/Execution Price | 使用对应 Reader/Oracle 和方向性价格口径 |
| PnL | 使用合约 Reader 返回结果，不建议前端独立简化重算 |
| Leverage | 同时区分初始杠杆与基于剩余保证金的有效杠杆 |
| Max Leverage | 展示链上有效最低保证金率的倒数，不能只写死 100x |
| Open Fee | 增仓 `positionFeeAmount - traderDiscount` |
| Close Fee | 减仓 `positionFeeAmount - traderDiscount` |
| Liquidation Fee | `sizeInUsd × liquidationFeeFactor` |
| Funding Fee | 区分应付和应收，并显示预计值 |
| Liquidation Risk | 使用合约 Reader/清算逻辑返回的 remaining collateral 口径 |

## 18. 代码位置

- 仓位字段：`src/position/Position.sol`
- 杠杆和清算判断：`src/position/PositionUtils.sol`
- Position、Funding、UI、Liquidation Fee：`src/pricing/PositionPricingUtils.sol`
- Funding Rate 和 Funding Per Size：`src/market/MarketUtils.sol`
- 清算订单及保护期：`src/liquidation/LiquidationUtils.sol`
- 动态点差和成交价格：`src/pricing/PositionPricingUtils.sol`、`src/position/PositionUtils.sol`
- 默认参数：`scripts/config/defaults.ts`


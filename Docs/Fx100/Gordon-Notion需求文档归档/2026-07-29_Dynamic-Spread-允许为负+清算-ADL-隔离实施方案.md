# 实施方案：Dynamic Spread 允许为负 + 清算 / ADL 隔离

> Notion 页面：[原文](https://app.notion.com/p/3aa3d7873f2c81e18d82eaf8b851ce13)
> 抓取时间：2026-07-29 14:47 UTC
> 状态：**待评审实施**
> 受众：合约工程师、前端、Indexer、测试
> 最新性：本页是 Dynamic Spread 主题的最新权威方案；与旧文档冲突时以本页为准。

## 一、目标

将 `PositionPricingUtils.getDynamicSpread` 从“结果小于等于 0 时硬编码返回 0”的 `uint256` 模型，改造成可以为负的 `int256` 模型：

- 普通自愿开仓、加仓、减仓和平仓：改善多空平衡时允许负 spread，用户可获得优于 oracle 的成交价，即 rebate。
- 清算、ADL 和仓位安全校验：继续采用 `floor-at-0` 的保守口径，不允许 rebate 影响强制平仓或保证金安全判断。
- 正负幅度按市场、按方向配置。

旧口径：

```plain
dynamicSpread = constantSpread + depthSpread + skewImpact
totalSpread   = max(0, dynamicSpread)
```

最新目标口径：

```plain
rawDynamicSpread = constantSpread + depthSpread + skewImpact

普通交易：
dynamicSpread = clamp(
  MIN_DYNAMIC_SPREAD[market][isLong],
  MAX_DYNAMIC_SPREAD[market][isLong],
  rawDynamicSpread
)

清算 / ADL / 安全校验：
dynamicSpread = max(0, rawDynamicSpread)
```

## 二、配置变更

新增两个按 `marketIndex × isLong` 派生的有符号配置：

```solidity
MIN_DYNAMIC_SPREAD
MAX_DYNAMIC_SPREAD
```

建议派生方式：

```solidity
minDynamicSpreadKey(marketIndex, isLong)
maxDynamicSpreadKey(marketIndex, isLong)
```

配置注意事项：

1. 新 key 未写入时默认值为 0，不会报错，但会退回旧的 floor-at-0 行为，新功能等于未开启。
2. 必须对每个市场的 long/short 四个方向值逐项初始化并核对。
3. `skewImpact` 已有自己的 `minSkewImpactKey` / `maxSkewImpactKey`，本次不修改其 key 或函数。
4. 新增的 Dynamic Spread clamp 与既有 skew clamp 是两层独立约束，数值更紧的一层实际生效。
5. 若希望结果比当前 `minSkewImpactKey` 更负，仅新增 `MIN_DYNAMIC_SPREAD` 不够，还需要治理同步放宽原有 skew 下限。
6. 因为参数决定协议最多返利多少，建议至少增加链上交叉校验或部署脚本强校验。

## 三、核心类型变化

`dynamicSpread` 从 `uint256` 改为 `int256`，主要影响：

- `PositionPricingUtils.getDynamicSpread`
- `PositionUtils` 的执行价结果和缓存结构
- `IncreasePositionUtils`
- `DecreasePositionCollateralUtils`
- `PositionEventUtils`
- `ReaderPricingUtils`
- 前端 / SDK / Indexer 的 Reader 与事件解析

执行价运算需要显式处理：

```plain
WEI_PRECISION ± int256(dynamicSpread)
```

转回 `uint256` 前应增加防御性检查，不能依赖静默 underflow。

事件中的 `dynamicSpread` 必须从 `uintItems` 移至 `intItems`，并同步调整两个数组的初始化长度，否则会在运行时越界。

## 四、清算与仓位安全校验隔离

### 4.1 清算判定的合成订单

`isPositionLiquidatable` 内部构造的临时订单必须无条件设置为：

```solidity
Order.OrderType.Liquidation
```

这里不能只在 `forLiquidation == true` 时设置。原因是：

- 正常开仓 / 加仓后的安全校验通常传入 `forLiquidation=false`。
- 正常减仓后的安全校验也传入 `false`。
- 如果这些路径使用负 spread，极薄保证金或接近 100x 的仓位可能被临时 rebate“美化”，让本应拒绝的仓位通过校验。

无论该函数用于真实清算还是普通交易后的安全检查，本质都是保守估值，因此都应使用强制平仓上下文。

### 4.2 真实清算执行

`getExecutionPriceForDecrease` 应根据订单类型计算：

```plain
isForcedCloseContext =
  orderType == Liquidation
  OR secondaryOrderType == Adl
```

强制平仓上下文始终 floor-at-0，清算执行价不能因为改善平衡而优于 oracle。

### 4.3 ADL 独立标记

当前 ADL 使用普通 `MarketDecrease`，在类型层面无法与用户自愿平仓区分。

推荐方案：

- 给 `Order.Props` 接入已有但尚未使用的 `SecondaryOrderType`。
- `AdlUtils.createAdlOrder` 设置 `SecondaryOrderType.Adl`。
- 执行价函数将 Liquidation 和 Adl 统一识别为 `isForcedCloseContext`。

不建议在整条调用链额外传递散落的 `bool isAdl`。

## 五、前端联动

负 spread 上线时，前端必须同步修改，否则返利会被显示成 0：

1. 删除 `executionPrice.ts` 中 `dynamicSpread <= 0 ? 0 : dynamicSpread` 的旧 floor。
2. 改为读取 `MIN_DYNAMIC_SPREAD` / `MAX_DYNAMIC_SPREAD` 并与合约一致地 clamp。
3. 删除 `OrderPreview.tsx` 对负 spread 的第二次冗余 floor。
4. 自愿减仓路径同样允许负 spread。
5. SDK/DataStore multicall 增加每市场、每方向的新配置键。
6. Reader 和事件字段按有符号整数解析。
7. 颜色逻辑已经将负值视为利好，可保留。

受影响的前端展示：

- Est. execution price
- Total Spread
- Price Impact
- 平仓预览

## 六、文案口径

Price Impact 保留原名，不改为 Spread。

最新业务解释：

- 正值：订单加剧不平衡，成交价劣于 oracle。
- 负值：订单改善平衡，获得返利，成交价优于 oracle。
- Price Impact 已包含在预计执行价中，不是额外扣费。

## 七、最低测试清单

1. 普通交易改善平衡时返回负 spread，成交价优于 oracle。
2. 多头 / 空头分别验证 min/max clamp。
3. 分别构造 skew clamp 更紧和 dynamic clamp 更紧的场景。
4. 清算判定始终 floor-at-0，该清算的仓位不能被 rebate 救活。
5. 清算执行价不能优于 oracle。
6. 100x / 极薄保证金开仓、加仓、减仓的安全校验不受 rebate 欺骗。
7. ADL 判定与执行始终 floor-at-0。
8. PositionIncrease / PositionDecrease 事件可正确输出负 `dynamicSpread`。
9. Reader 返回有符号值，前端和 Indexer 可正确解析。
10. 所有市场、所有方向的新配置都已写入且非零。
11. 类型重构阶段先跑全量回归，确认业务行为未提前变化。
12. 前端显示负数、绿色利好、执行价和 Total Spread 三处一致。

## 八、建议实施顺序

1. PR1：`uint256 → int256` 类型重构，不改变业务行为。
2. PR2：新增 MIN/MAX 配置和部署初始化。
3. PR3：接入清算 / 安全校验隔离。
4. PR4：接入 ADL SecondaryOrderType。
5. PR5：增加配置护栏。

每个 PR 应独立测试、独立回滚。

## 九、对旧汇总口径的覆盖

以下旧结论不再作为最新目标行为：

- “Dynamic Spread 恒不小于 0”
- “改善平衡最多只能将 spread 降到 0”
- “所有成交方向都必然劣于 oracle”

最新目标行为为：

- 普通交易可以出现负 Dynamic Spread 和优于 oracle 的成交价。
- 清算、ADL、仓位安全校验仍不允许负 spread。
- 当前页面状态是“待评审实施”，在正式合入前，线上 / 当前 release 仍可能保持旧行为。

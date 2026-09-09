# UT-R5B02 清算可行性判定的手续费档位回归

> 所属版本：`fx100-contracts@release-v0.3.2`，回归对象 commit `13880f2`
> "fix(R5-B02): isPositionLiquidatable ignores balanceWasImproved fee tier"（v0.3.2 分支 HEAD，也是本分支最新一次合约改动）。
> 代码锚点：`src/position/PositionUtils.sol::isPositionLiquidatable`、`getExecutionPriceForDecrease`；`src/pricing/PositionPricingUtils.sol::getPositionFeesAfterReferral`（费率档位选取 `positionFeeFactorKey(marketIndex, balanceWasImproved)`）。
> 自动化落点：`TestCode/unit/src/LiquidationFeeTierRegression.t.sol`。

## 缺陷背景（期望值推导的前提）

`git show 13880f2 -- src/position/PositionUtils.sol` 显示改动仅 4 行新增：修复前 `cache.balanceWasImproved`（`IsPositionLiquidatableCache` 结构体的 bool 字段）**从未被赋值**，Solidity 结构体 bool 字段默认值为 `false`。这意味着修复前 `isPositionLiquidatable` 传给 `getPositionFeesAfterReferral` 的 `balanceWasImproved` 参数恒为 `false`，无论这笔清算实际是否改善市场多空平衡，手续费档位查询 `positionFeeFactorKey(marketIndex, balanceWasImproved)` 永远读取「未改善」档位，与 `PositionPricingUtils.getExecutionPriceForDecrease` 同一次调用里已经算出的真实 `balanceWasImproved` 结果脱节。

`06-测试影响与准入结论.md` §1.2 G3 已记录：05 文档的 B32-1-07 只隔离了「负点差」维度，「完整清算费用账本断言未成文」（矩阵行 R16 标「E2E 断言未展开」）。本单元测试文档正是补齐这条断言链——不测点差数值本身，只专门盯住"手续费档位是否随 balanceWasImproved 切换"。

## 用例列表

| 用例编号 | 设计方法 | 优先级 | 对应 forge 测试函数 |
| --- | --- | --- | --- |
| UT-R5B02-00 | 前置断言（防幽灵断言） | P0 | `test_BalanceWasImprovedPrecondition_IsTrue` |
| UT-R5B02-01 | 缺陷回归（正例，差分法） | P0 | `test_R5B02_UsesImprovedTierFactor_WhenBalanceIsImproved` |
| UT-R5B02-02 | 缺陷回归（反例，差分法） | P0 | `test_R5B02_IgnoresStandardTierFactor_WhenBalanceIsImproved` |

### UT-R5B02-00：前置断言——本用例构造的仓位确实令 balanceWasImproved=true

| 字段 | 内容 |
| --- | --- |
| 前置条件 | 市场 OI：long=1（`openInterestInTokensKey(marketIndex,true)`），short=0（默认）；仓位：多头，sizeInUsd=100×1e30，sizeInTokens=1（与 `PositionPricing.t.sol::_configureNegativeDynamicSpreadForLongDecrease` 完全一致的最小数字，已被现有 85/85 通过的套件证明不会在 `getDecreaseOrderSize`/OI 扣减处 underflow） |
| 测试数据 | usdDelta = −100×1e30（全平多头，减仓方向），tokenDelta = −1，isLong=true（与 `isPositionLiquidatable` 内部构造 `getExecutionPriceForDecrease` 参数时的负号语义一致，见 `PositionUtils.sol` L706-716） |
| 操作步骤 | 直接调用 `PositionPricingUtils.getDynamicSpread` 读取第二个返回值 `balanceWasImproved` |
| 核对数据 | `balanceWasImproved` |
| 期望结果 | `balanceWasImproved = true`。推导：long OI(1) 独大、short OI(0)，减少 long OI 收窄失衡 → 属于"改善平衡"方向 |
| 实际结果 | **PASS**（2026-08-23，forge test） |

### UT-R5B02-01（正例）：balanceWasImproved=true 时，「改善」档位费率变化必须精确反映到 remainingCollateralUsd

| 字段 | 内容 |
| --- | --- |
| 前置条件 | 同 UT-R5B02-00 的 OI/仓位构造；`POSITION_FEE_FACTOR(marketIndex, false)` 固定设为 5%（刻意与改善档不同，若判定误用该档会被下方差值断言拆穿） |
| 测试数据 | 「改善」档位 `POSITION_FEE_FACTOR(marketIndex, true)`：run A = 0%，run B = 1%（Δfactor = 1e28） |
| 操作步骤 | 1. 配置 run A 费率，调用 `isPositionLiquidatable`，记 `infoA.remainingCollateralUsd`；2. 把「改善」档位改为 1%，再次调用，记 `infoB.remainingCollateralUsd`；3. 求差 |
| 核对数据 | `infoA.remainingCollateralUsd − infoB.remainingCollateralUsd` |
| 期望结果 | 差值 = 1×1e30（1 USD，1e30 精度）。推导：sizeInUsd=100×1e30；`Precision.applyFactor(sizeInUsd, Δfactor)` = 100×1e30×1e28/1e30 = 1e30；该值先除后乘 `collateralTokenPrice.min`(=1e24) 两次运算均整除无舍入损耗，故 collateralCostUsd 的变化量精确等于 1e30 |
| 实际结果 | **PASS**（2026-08-23，forge test；差值实测 1000000000000000000000000000000，等于 1×1e30） |

### UT-R5B02-02（反例，缺陷特征直接对照）：balanceWasImproved=true 时，「未改善」档位费率变化必须对结果零影响

| 字段 | 内容 |
| --- | --- |
| 前置条件 | 同 UT-R5B02-00 的 OI/仓位构造；「改善」档位 `POSITION_FEE_FACTOR(marketIndex, true)` 固定为 0% |
| 测试数据 | 「未改善」档位 `POSITION_FEE_FACTOR(marketIndex, false)`：run A = 0%，run B = 1% |
| 操作步骤 | 1. 配置 run A，调用 `isPositionLiquidatable`，记 `infoA.remainingCollateralUsd`；2. 把「未改善」档位改为 1%，再次调用，记 `infoB.remainingCollateralUsd`；3. 求差 |
| 核对数据 | `infoA.remainingCollateralUsd` 与 `infoB.remainingCollateralUsd` 是否相等 |
| 期望结果 | 两者相等（差值 = 0）。因为本用例场景下真实 `balanceWasImproved=true`，费率查询应恒定读取 `positionFeeFactorKey(marketIndex, true)`，与「未改善」档位配置值无关 |
| 实际结果 | **PASS**（2026-08-23，forge test） |

## 回归有效性独立验证（防"看似严谨实则测不出问题"）

为确认上述两条差分断言真的能捕获 R5-B02 这个具体缺陷而非巧合通过，执行了一次对照实验：临时将 `src/position/PositionUtils.sol` 替换为 v0.3.2 分支修复提交（`13880f2`）的父提交版本（`7d639c9`，即修复前代码），仅重跑本文件两条测试：

```
[FAIL: remainingCollateralUsd must NOT react to the standard-tier factor when balance was improved:
  10000000000000000000000000000000 != 9000000000000000000000000000000] test_R5B02_IgnoresStandardTierFactor_WhenBalanceIsImproved()
[FAIL: remainingCollateralUsd must move by exactly the improved-tier fee delta:
  0 != 1000000000000000000000000000000] test_R5B02_UsesImprovedTierFactor_WhenBalanceIsImproved()
```

两条均按预期失败（修复前代码里改变"改善"档位对结果无影响、改变"未改善"档位却造成了 1 USD 的意外偏差，与缺陷描述完全对应），随后已将文件还原为修复后版本并确认 `git diff` 为空、全量 `forge test` 回到 99/99 通过。此对照实验本身不作为 UT-R5B02-01/02 的正式执行记录，只作为"测试用例设计有效性"的一次性佐证，记录在此供复核。

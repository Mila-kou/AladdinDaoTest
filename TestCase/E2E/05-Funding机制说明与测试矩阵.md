# FX100 Funding 机制说明与测试矩阵

> 面向交易员、页面 E2E 执行人和账本测试工程师  
> 合约基线：见 [Docs/contract-releases/CURRENT.json](../../Docs/contract-releases/CURRENT.json)；本文公式与参数按 @v0.3.1 快照（`Github/fx100-contracts@release-v0.3.1` @d9a7fd2，CURRENT.json `comparison`）整理。`primary` 版本资金费结算架构有变（`updateFundingState` 仅更新指数、`settleFundingFees` 逐仓实结——见 `Docs/contract-releases/v0.3.2/01-代码变化分析.md` §6、`04-参数目录.md` §3.9、`05-重要参数边界场景.md` 组 5 B32-5-01～04），使用前须回 `primary.repoPath` 源码复核  
> 专项用例：[S08 Funding 计提、结算与边界](scenarios/S08-Funding计提结算与边界.md)

## 1. Funding 有三个不同时点

| 阶段 | 发生什么 | 用户会看到什么 |
|---|---|---|
| 费率判定 | 根据 Long/Short OI、EMA Skew、Floor/Base 和 Min/Max 算两侧 factor | 页面展示多/空每小时费率 |
| 按时间计提 | 按 `blockTimestamp - fundingUpdatedAt` 的经过秒数增加市场 per-size 累计值 | 待结算 Funding、有效保证金、杠杆和清算风险持续变化 |
| 仓位结算 | 下一次仓位动作时，应付 Funding 扣抵押，应收 Funding 加抵押，再刷新仓位基准 | Funding 进入抵押/到账计算，待结算金额回到新基准 |

Funding 不是“每 8 小时扣一次”。本项目按秒计提；EMA 的 `3600` 秒是平滑时间尺度，不是扣费周期。

## 2. Funding factor 如何判断

### 2.1 Raw Skew 和 EMA Skew

```text
rawSkew
= (longOIUsd - shortOIUsd)
  / (longOIUsd + shortOIUsd)
```

- `rawSkew > 0`：Long OI 更多。
- `rawSkew = 0`：多空 OI 均衡。
- `rawSkew < 0`：Short OI 更多。
- 双边 OI 都为 0：Funding 在经济结果上是 no-op，不得增加 per-size 或资金流；实现仍可刷新 `fundingUpdatedAt` 或发出零值事件。

合约使用 EMA 后的 Skew。首次初始化时 EMA 等于当前 Raw Skew；已存在 EMA 时，OI 突变不会让 factor 在同一时刻直接跳到新 Raw Skew，而是按 3600 秒时间尺度连续收敛。

### 2.2 Long / Short 费率

```text
longFactor
= clamp(
    fundingFloor + fundingBase × emaSkew,
    minFundingFactor,
    maxFundingFactor
  )

shortFactor
= clamp(
    -fundingBase × emaSkew,
    minFundingFactor,
    maxFundingFactor
  )
```

| 合约 factor | 仓位结果 | 累计字段 |
|---:|---|---|
| `> 0` | 该方向支付 Funding | `negativeFundingFeePerSize` |
| `= 0` | 该方向不付不收 | 无增量 |
| `< 0` | 该方向获得 Funding | `positiveFundingFeePerSize` |

Long 比 Short 多一个 `fundingFloor`。因此存在“Short OI 略多，但 Long 和 Short 仍同时支付”的区间，两侧净额进入 LP/费用路由。

### 2.3 四个关键分界点

| 边界 | EMA Skew 条件 | 两侧都要测的数据 |
|---|---|---|
| Long 符号翻转 | `skew = -floor / base` | `boundary-ε`、`boundary`、`boundary+ε` |
| Long 命中 Max | `skew = (max-floor)/base` | 阈值前、恰好阈值、阈值后 |
| Long 命中 Min | `skew = (min-floor)/base` | 阈值前、恰好阈值、阈值后 |
| Short 命中 Min/Max | `skew = -min/base` / `-max/base` | 两个 clamp 阈值各做 `±ε` |

`ε` 应使用合约 Skew `1e18` 精度下的最小可构造单位；无法仅通过真实 OI 构造时，允许在专用 fork/fixture 直接初始化 EMA 状态。

## 3. 当前 ETH market #2 的判断示例

> 下表使用本地 `base_sepolia_v0.3.1_260729` 源部署在 tx-fork 的历史采集快照（`TestCase/config/v0.3.1/tx-fork/260812/`，chainId 99911，block 45389192），不代替执行时链上读数；Base Sepolia 真链快照与 CURRENT 登记另见 `TestCase/config/v0.3.1/base-sepolia/260729/`。

| 参数 | 快照年化值 |
|---|---:|
| Floor | 约 `+10.95%` |
| Base | 约 `142.79%` |
| Min | 约 `-27.51%` |
| Max | 约 `+111.39%` |

Long 符号翻转点约为 `-7.6686%` EMA Skew。代表数据：

| EMA Skew | Long factor | Short factor | 经济方向 |
|---:|---:|---:|---|
| `+20%` | 约 `+39.51%` | 约 `-27.51%`，命中 Min | Long 付，Short 收 |
| `0%` | 约 `+10.95%` | `0` | Long 付 Floor，Short 不付不收 |
| `-5%` | 约 `+3.81%` | 约 `+7.14%` | Long 和 Short 都支付 |
| `-7.6686%` 附近 | 接近 `0` | 约 `+10.95%` | Long 发生符号翻转 |
| `-20%` | 约 `-17.61%` | 约 `+28.56%` | Long 收，Short 付 |

年化只用于阅读；链上计算使用每秒 `1e30` factor。

## 4. 什么操作会结算 Funding

| 操作 | 是否结算本仓 Funding | 关键断言 |
|---|---|---|
| 创建/修改/撤销未执行订单 | 否 | 订单动作不得改变仓位 Funding 基准；已有仓位仍随时间计提 |
| 无仓账户首次开仓 | 无历史费用 | 开仓前无 size，仓位基准应直接设为市场最新 per-size |
| 已有仓位加仓 | 是 | 先结算旧仓全部待结算 Funding，再增加 size |
| 只追加保证金 | 是 | `sizeDelta=0` 仍是仓位动作，Funding 进入抵押变化 |
| 只提取保证金 | 是 | 可提上限必须给 Funding 结算留余量 |
| 部分平仓/TP/SL | 是 | 结算动作前整个旧仓自上次基准以来的 Funding，再减 size；不是只结算平掉的比例 |
| 全平 | 是 | Funding 进入最终到账，仓位删除 |
| Liquidation / ADL | 是 | Funding 进入可清算判定并在强制减仓时结算 |

每次结算后必须将仓位 `negativeFundingFeePerSize` / `positiveFundingFeePerSize` 基准刷新到市场最新值，否则下一次动作会重复收费或重复发放。

## 5. 单仓金额和取整

```text
negativeFundingFeeAmount
= ceil(
    sizeInTokens
    × (latestNegativePerSize - positionNegativePerSize)
    / (1e30 × collateralPrice.min)
  )

positiveFundingFeeAmount
= floor(
    sizeInTokens
    × (latestPositivePerSize - positionPositivePerSize)
    / (1e30 × collateralPrice.max)
  )
```

这是对用户保守的不对称取整：支付端向上取整，获得端向下取整。当 collateral Oracle `min != max` 时，不得用 mid 价或同一侧价格同时计算应付/应收。

页面净值：

```text
displayFundingToken
= positiveFundingFeeAmount - negativeFundingFeeAmount
```

页面如用“负数=用户支付、正数=用户获得”，显示 factor 与合约 factor 符号相反；翻转只能发生在显示层。

## 6. 必须覆盖的 Funding 边界

| 维度 | 必做值 | 主要风险 |
|---|---|---|
| OI | 双边 0、仅 Long、仅 Short、多空相等 | 除零、首仓追溯收费、空侧误累计 |
| Skew | `-1`、`0`、`+1`、Long 翻转点 `±ε` | 付款方向错、Floor 遗漏 |
| Clamp | Long Min/Max、Short Min/Max 的阈值 `±ε` | 超上下限、等号边界错 |
| EMA | 首次初始化、同时刻 OI 突变、`1/3599/3600/3601s` | 把 Raw Skew 当 EMA、把 1h 误当扣费周期 |
| Duration | `0s`、`1s`、多段时间 | 同秒也收费、分段重复/漏计 |
| Per-size 差 | `0`、最小正差、整除、有余数 | 负差、支付/获得取整错 |
| 抵押价 | `min=max`、`min<max` | 支付端/收取端用错 Oracle 侧 |
| 仓位动作 | 首次开仓；应付/应收 × 加仓、补保证金、提取、手动部分平、手动全平、TP、SL、清算、ADL | 首仓追溯收费、某条路径不结算或重复结算 |
| 风险 | 负 Funding 刚好到清算边界、再少 `1` 个 USD(1e30) 原始单位 | 清算判定未包含 Funding |
| 资金路由 | `positionPaysLp > 0`、`=0`、`<0` | claimable 账本或 LPVault→PositionVault 转账错 |

## 7. 新旧场景的分工

| 范围 | 场景 | 定位 |
|---|---|---|
| 长持业务主路 | SCN-045～047 | 均衡市场、拥挤方向和 Funding 侵蚀 |
| 仓位操作回归 | SCN-029～030 | 仓位更新结算与 Short 正 Funding 部分平仓历史问题 |
| Funding 专项矩阵 | SCN-073～080 | 首仓基准、Factor/EMA/Clamp、按秒计提、全动作结算、取整路由、Funding-only 清算和页面显示 |

E2E 负责验证用户可见语义、页面/Reader/事件一致和关键资金方向；逐 token 零和、取整和内部路由的最终权威继续由 fork integration / ledger 用例承担。

## 8. 代码、配置与口径依据

> 以下源码链接与参数快照均为 @v0.3.1 快照（CURRENT.json `comparison` / `deployments[0]`）；按 `primary` 复核时改指 `primary.repoPath` 同名文件——其中 `MarketUtils.sol`、`IncreasePositionUtils.sol`、`DecreasePositionCollateralUtils.sol` 在 v0.3.2 已改（`settleFundingFees` 逐仓结算），改指前须复核。

- [MarketUtils.sol：Skew、EMA、Factor、Clamp 和市场累计（@v0.3.1 快照；v0.3.2 已改）](../../Github/fx100-contracts@release-v0.3.1/src/market/MarketUtils.sol)
- [ExponentialMovingAverage.sol：3600 秒平滑语义（@v0.3.1 快照）](../../Github/fx100-contracts@release-v0.3.1/src/common/math/ExponentialMovingAverage.sol)
- [PositionPricingUtils.sol：单仓 Funding 和取整（@v0.3.1 快照）](../../Github/fx100-contracts@release-v0.3.1/src/pricing/PositionPricingUtils.sol)
- [ExecuteOrderUtils.sol：订单执行前更新市场 Funding（@v0.3.1 快照）](../../Github/fx100-contracts@release-v0.3.1/src/order/ExecuteOrderUtils.sol)
- [IncreasePositionUtils.sol：首次开仓基准和加仓结算（@v0.3.1 快照；v0.3.2 已改）](../../Github/fx100-contracts@release-v0.3.1/src/position/IncreasePositionUtils.sol)
- [DecreasePositionCollateralUtils.sol：减仓的 Funding 收付（@v0.3.1 快照；v0.3.2 已改）](../../Github/fx100-contracts@release-v0.3.1/src/position/DecreasePositionCollateralUtils.sol)
- [合约版本摘要与计算公式索引](ContractCodeSummary/README.md)
- [需求总结：页面字段计算公式](../../Docs/Gordon-Notion需求文档归档/汇总/FX100-页面字段计算公式.md)
- [本节参数来源（@v0.3.1 / tx-fork / 260812）](../config/v0.3.1/tx-fork/260812/parameters-by-module.csv)

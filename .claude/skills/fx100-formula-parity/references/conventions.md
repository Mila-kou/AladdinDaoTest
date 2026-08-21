# 两侧约定对照：单位 · 取整原语 · 选价 · 参数来源 · 已知精度故障

> 核对日期 2026-08-17（@v0.3.1 快照）。前端 `fx100-apps@develop` @ `61ec1f41`（2026-07-30，已对齐 v0.3.1 部署地址）；合约 `fx100-contracts@release-v0.3.1` @ `d9a7fd2`（2026-07-29，CURRENT.json `comparison`）。当时以 `@soso-test` `src/` 作 v0.3.2 差异参考——该目录已被 CURRENT.json `excluded` 裁决不引用，`primary` 版本差异改以 `Docs/contract-releases/v0.3.2/01-代码变化分析.md`（对比 CURRENT.json `primary.repoPath` 克隆）为准。锚点以函数名为准，行号会漂。

## 1. 精度体系（两侧必须相同的"物理单位"）

| 量 | 合约存储/计算单位 | 前端应使用的单位 | 前端常见错法 |
|---|---|---|---|
| USD 金额（sizeInUsd、费用、PnL、pool value） | `× 1e30`（`Precision.FLOAT_PRECISION`） | bigint `× 1e30`，`formatUsd(x, 30)` 只在展示层 | 用 `Number` 提前除 1e30 再参与乘除 |
| 比例 / 费率 / factor | `× 1e30` | 同 | 把 bps 直接当 factor |
| token 数量（sizeInTokens、sizeDeltaInTokens） | **统一 `× 1e18`**，与 token 链上 decimals 无关 | `POSITION_SIZE_DECIMALS = 18`（`packages/sdk/src/utils/positionPrecision.ts`） | 用 `indexToken.decimals`（BTC=8）格式化链上 sizeInTokens |
| 用户输入的 token 数量 | — | `indexToken.decimals`（用户输入是原生精度） | 把输入路径也改成 18 |
| USDC 抵押数量（collateralAmount） | `× 1e6`（USDC 原生） | 同 | 当 USD 用 |
| index / 标的价格（合约价） | `USD × 1e12`（= 1e30 / 1e18） | `convertToContractPrice(price, 18)` | 传 `decimals=8` 得 `USD × 1e22` |
| USDC 价格 | `USD × 1e24`（= 1e30 / 1e6） | `collateralToken.decimals = 6` | 与 index 价混用 |
| 动态点差 / skew 比例 | `× 1e18`（`WEI_PRECISION`；1e14 = 0.01%） | 同 | 当 1e30 factor 用 |
| LP shares | `× 1e18` | 同 | — |
| 换算常量 | `FLOAT_TO_WEI_DIVISOR = 1e12`、`BASIS_POINTS_DIVISOR = 10000` | 同 | — |

## 2. 取整原语对照（合约 `src/utils/Precision.sol` / `Calc.sol` ↔ SDK `packages/sdk/src/utils/bigmath.ts`）

| 合约 | 语义 | SDK 对应 | 是否等价 |
|---|---|---|---|
| `Precision.mulDiv(uint,uint,uint)` = OZ `Math.mulDiv` | 向下取整（floor） | `bigMath.mulDiv(x,y,z)` = `(x*y)/z` | 等价（bigint 除法向零截断，非负时=floor） |
| `Precision.mulDiv(uint,uint,uint,true)` = OZ `Math.mulDiv(..., Ceil)` | 向上取整 | `bigMath.mulDiv(x,y,z,true)` = floor + (`mulmod>0` ? 1) | **非负输入等价** |
| `Precision.mulDiv(int,…,true)` / `applyFactor(uint,int,true)` | **按幅值**向上取整（负数结果绝对值变大） | `bigMath.mulDiv(负数,…,true)` | **不等价**：JS `%` 符号随被除数，`(x*y)%z > 0n` 对负数恒 false → 负数不进位。调用点若把负值（如负 PnL、负 impact、负 funding）传给 `bigMath.mulDiv(..., true)`，与合约差 1 wei 幅值。核对时凡是负值 + roundUp 的路径都要点名 |
| `Calc.roundUpDivision(a,b)` = `(a+b-1)/b` | 向上取整 | `bigMath.divRoundUp(x,y)` = `(x+y-1n)/y` | 等价（非负） |
| `Calc.roundUpMagnitudeDivision(int a, uint b)` | 负数 `(a-b+1)/b`，幅值进位 | 无直接对应 | 前端若需要要自己写；用 `divRoundUp` 处理负数会错 |
| — | 四舍五入 | `bigMath.divRound(x,y)` = `x/y + ((x%y)*2n > y ? 1 : 0)` | 合约**没有**四舍五入原语；前端用它算"合约值"即不一致（且负数行为不对称） |
| `Precision.applyFactor(value, factor)` | `value × factor / 1e30` floor | 通常手写 `x * f / 10n**30n` | 等价，前提是同序（先乘后除） |
| `Precision.toFactor(value, divisor[, roundUp])` | `value × 1e30 / divisor` | 手写 | 同上 |
| `Precision.applyExponentFactor` | 指数因子（prb-math `pow`） | 前端若用 `Math.pow` float | **不等价**（float） |
| `Precision.floatToWei / weiToFloat` | `/1e12`、`×1e12` | 手写 | 等价 |

**bit 级一致的前提是同序复刻**：合约每一步都截断，前端把 `a*b/c*d/e` 重排成 `a*b*d/(c*e)` 就会差 1 wei。判"等价"时若涉及整数除法重排，必须给数值例子（见 SKILL.md 判定表）。

## 3. 选价规则（合约永远取对 trader 不利的一侧）

| 场景 | 合约用价 | 前端应同侧 |
|---|---|---|
| 抵押物 USD 估值（开仓校验 / 清算 / 显示 collateralUsd） | `collateralPrice.min` | min |
| 费用 USD → USDC token 数量（除法） | `collateralPrice.min`（除更小的数 → 多扣） | min |
| funding 支付端 | min（多付） | min |
| funding 收取端 / claimable | max（对收款人有利） | max |
| Pool 价值（LP 侧 maximize） | max | max |
| 开仓执行价基准 | 多头 max / 空头 min（买贵卖贱） | 同 |
| 平仓执行价基准 | 多头 min / 空头 max | 同 |
| PnL 计算价 | 平仓侧价（多 min / 空 max） | 前端"未实现 PnL"若用 index/mid 价，与合约算法差一档点差 → 属"展示性"还是"材料性"要看用途（预览 vs 清算判定） |

取整方向速查（合约侧）：买方向价格⌈⌉/卖方向⌊⌋；开仓多⌊⌋空⌈⌉、平仓多⌈⌉空⌊⌋（size↔token）；funding 付⌈/min⌉收⌊/max⌋；手续费双⌊⌋；PnL 亏⌈⌉盈⌊⌋；瀑布盈利⌊/max⌋成本⌈/min⌉；清算费⌈/min⌉。**方向、价格边、取整三者必须同时匹配。**（详见 `fx100-verify-handbook/references/formulas.md` §4/§10）

## 4. 参数来源（前端硬编码 vs DataStore）

核对每个公式时列出它用到的每个参数，标明前端是从哪拿的：

- **应从 DataStore / Reader 读**：`minCollateralFactor`、`minCollateralFactorForLiquidation`、`positionFeeFactor(+/-)`、`fundingFactor` 系列、`reserveFactor`、`maxPnlFactor` 系列、`minCollateralUsd`、`minPositionSizeUsd`、动态点差参数、`executionFee` 系列 key、grace period 参数。前端若在配置文件 / 常量里写死这些值，即使当前数值相同也要标"参数来源不一致（硬编码）"——参数一改就分叉。
- **DataStore key 双重编码**：key 是 `keccak256(abi.encode(BASE_KEY, market[, token, isLong]))`，签名 v0.3.1 与 v0.2.x 不同（见 `fx100-verify-handbook/references/v031-facts.md` §3）。前端 `packages/sdk/src/utils/marketKeysAndConfigs.ts` / `hash.ts` 的 key 拼法与合约 `src/data/Keys.sol` / `FX100Keys.sol` 对不上会**静默读 0**——这也是"公式一致但参数为 0"的一致性问题。

## 5. 前端已知精度故障样本（历史真实 bug，核对时的高危模式）

来源：`Docs/Gordon-Notion需求文档归档/2026-06-01_BTC-精度问题修复说明(SDK).md`（Gordon 页面公式文档 §0.1 转述）。模式：`indexToken.decimals=8` 误用导致 `10^10` 倍偏差，仅 BTC 类非 18 位 token 出错。

| 现象 | 根因 | 修复位置 |
|---|---|---|
| BTC 下单全部 cancel（`OrderNotFulfillableAtAcceptablePrice`） | `convertToContractPrice(price, 8)` 得 `USD×10^22`，合约要 `10^12` | `orderTransactions.ts` |
| BTC 仓位 Size 显示 ~1377 万 BTC | `getPositionSizeDecimals()` 返回 8，链上 18 | `positionPrecision.ts` |
| PnL / Funding / 清算价显示 −$578M | Reader 传价 `72272e22` 而非 `72272e12` | `markets.ts` / `priceImpact.ts` |
| Trigger 显示 `≤ 0.000007`（应 `≤ $70,000`） | `parseContractPrice(p, 8)` 应为 18 | `orders.ts` |
| 新建 BTC Limit 订单 Size 显示 $0 | 把用户输入路径也改成 18（应保留 8） | `trade/increase.ts` |

规则：**SDK 内部推算路径用 18，用户原生输入路径用 `indexToken.decimals`**。核对任何 size/price 字段时先问"这一步是哪条路径"。

## 6. 前端 float / Number 混用风险点

- 任何 `Number(bigint) / 1e30` 后再乘除的中间量，超过 2^53 即失真；只允许出现在最终展示层。
- 百分比 / 杠杆 / ROE 用 float 算是可接受的（展示派生量），但**用 float 结果反推链上参数**（如 acceptablePrice、sizeDelta）不可接受。
- `bigMath.divRound`（四舍五入）不是合约原语；用它产出要与链上比对的值一定不一致。

## 7. v0.3.1 → v0.3.2 影响公式的差异（前端 develop @61ec1f41 快照，2026-08-17 时尚对齐 v0.3.1）

`diff -rq fx100-contracts@release-v0.3.1/src fx100-contracts@soso-test/src`（2026-08-17 历史记录；`@soso-test` 已被 CURRENT.json `excluded`，正式差异以 `Docs/contract-releases/v0.3.2/01-代码变化分析.md`——对比 CURRENT.json `primary.repoPath` 克隆——为准）：37 个文件不同，其中会改变**字段公式或语义**的：

| 文件 | 变化 | 受影响字段 |
|---|---|---|
| `pricing/PositionPricingUtils.sol`、`position/PositionUtils.sol`、`IncreasePositionUtils.sol`、`reader/ReaderPricingUtils.sol` | `dynamicSpread` 由 `uint256` 改 `int256`，新增 `allowNegativeSpread`（负动态点差；方案见 soso `docs/analysis/pricing/impl_spec_negative_dynamic_spread.md`）；`GetPriceImpactUsdParams` 改名 `GetDynamicSpreadParams` | 执行价、点差预览、Reader `ExecutionPriceResult` 解码类型 |
| `market/MarketUtils.sol`（226 行）+ `IncreasePositionUtils.sol` 调 `MarketUtils.settleFundingFees` | funding 结算架构调整（结算时点/账本落点），funding cache 字段加注释与单位 | 资金费计提、claimable funding、Funding 列 |
| `position/DecreasePositionUtils.sol` | `sizeDeltaUsd < sizeInUsd` 但 `sizeDeltaInTokens == sizeInTokens` 时自动改写为全平（`emitOrderSizeDeltaAutoUpdated`；R4-B04 修复） | 部分平仓的 sizeDelta 预览、平仓后剩余仓位 |
| `position/DecreasePositionCollateralUtils.sol` | 移除 secondaryOutput / swap / holdingAddress 分支 | 平仓所得（output amount）路径 |
| `pricing/PositionPricingUtils.sol` | fee 结构体字段增删（`totalRebateFactor`/`affiliateRewardFactor` 等） | 手续费拆分、返佣展示 |
| `gas/GasUtils.sol` | 移除 swap order gas limit 估算 | 执行费估算（swap 单） |
| `vault/VaultBase.sol` | 策略赎回校验 `ErrorStrategyWithdrawalMismatch` | LP 赎回（不改 NAV 公式） |
| `router/relay/RelayUtils.sol`、`SubaccountRelayRouter.sol`、`subaccount/SubaccountUtils.sol` | 子账户 slot 命名（EIP-712 typehash 变化） | relay 签名域，不是公式 |

其余（Config/ConfigSyncer/Keys2/FxErrors/事件工具/Router/ExternalHandler/TokenUtils）为配置键、错误、事件、权限改动，不改字段公式。

**用法**：默认基线取 CURRENT.json `primary.repoPath`（不再使用 `@soso-test`，与 SKILL.md 口径一致）；若被核对的前端分支尚未跟进 `primary`（看 `packages/sdk/src/abis` 里 `dynamicSpread` 是否 `int256`、是否有 `OrderSizeDeltaAutoUpdated` 事件解码），如实判定并登记为兼容性差异，不能退回 `comparison` 版本得出假"一致"。

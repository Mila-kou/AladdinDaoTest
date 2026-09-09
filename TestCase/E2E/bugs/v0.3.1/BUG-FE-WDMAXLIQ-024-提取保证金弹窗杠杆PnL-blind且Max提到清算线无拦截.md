---
id: BUG-FE-WDMAXLIQ-024
title: 提取保证金弹窗三数口径不一：杠杆按名义保证金算（PnL-blind），清算价/可提上限按含浮亏净值算；**全部 26 个市场动作线=清算线（间隙恒为零）**致 Max 必然提到清算线且无拦截——大浮亏仓位显示"3.60x"实为 51x、提完清算价=现价
severity: S2
priority: P1
status: open
found: 2026-09-04
env: https://fx100-dev.vercel.app · web 桌面 · Base Sepolia 84532 · v0.3.1 · DOGE/USDC 空头 · 用户 0xc95d2C09647f339A9183CdAA99AE7E29d2dB98aD
source-case: Adjust Margin → Withdraw · POS-005 边界（超额提取拦截） · 2026-09-04 LOG-086（fx100-apps@develop 源码定位）
finder: 执行人（Mila）质疑"数据不对" + 记录员数值反推 + 源码 agent 定位
notion: https://app.notion.com/p/3d13d7873f2c81dd8b99c6d765caf7d7（🐞 Bugs「Withdraw/Adjust Leverage 巨亏仓位 Max 操作后零缓冲贴清算价」High/Review，2026-09-04 他人立单；本地单为同一缺陷的独立取证）
retest: 2026-09-05 **FAIL（未修复）**；2026-09-06 **PARTIAL（部分修复）**——commit 1bdd033b 只解决 5 条子主张中的 2 条（Max 不再贴清算线，保留 0.25×mcf 缓冲）；杠杆 PnL-blind、提交无拦截、funding 三口径分歧仍在（PositionMarginDialog.tsx 与 liqPriceUtils.ts 一行未改）。见文末 2026-09-06 复测段
---

# BUG-FE-WDMAXLIQ-024 · 提取保证金：杠杆 PnL-blind + Max 提到清算线无拦截

## 现象（2026-09-04 实录）

DOGE **空头**，反推 size ≈ **$400k**、Margin 208,060.40、**浮亏 ≈ −108,997（= 保证金的 52%）**、待收 funding +5,689.01、Equity 104,752.64。Withdraw 弹窗点 **Max**：

| 弹窗显示 | 值 | 真实（含浮亏） |
|---|---|---|
| Available to Trade（=Max） | **96,897.08** | = 提到清算线 |
| New Margin | 111,163.32（名义） | **New Equity ≈ 7,856**（未显示） |
| New Leverage | **3.60x** | **equity 杠杆 ≈ 50.9x** |
| Est. Liq. Price | $0.08733 **(+0% from oracle)** | 清算价 = 现价 |
| 提交按钮 | **绿色可点** | 无任何警告 |

同一弹窗："New Leverage 3.60x"（读作安全）与 "Est.Liq +0%"（读作立刻可清算）**自相矛盾**。

## 根因（fx100-apps@develop 源码，file:line）

1. **杠杆 PnL-blind**：Current `liqPriceUtils.ts:73-89`、New `positionRisk.ts:147-163`：`S / (collateralUsd + posFunding − owedFunding)`，**不含 PnL**。1.92 = 400k/208,060、3.60 = 400k/111,163 ✓。SDK 已有含浮亏的 `leverageWithPnl`（`packages/sdk/src/modules/positions/positions.ts:721-728`），**弹窗未使用**。
2. **可提上限 = 提到清算线**：`positionRisk.ts:209-251` `withdrawMax = min(netValue − max(S×minCollateralFactor, minCollateralUsd), settledMargin − ceil(S/100x))`。netValue（`packages/sdk/src/utils/positions.ts:107-124`）含 mark 价 PnL、扣平仓费，**不含待收 funding**。用的是**动作线 `minCollateralFactor`**（非清算线 `minCollateralFactorForLiquidation`，两者为独立 DataStore key）。代码注释**假设动作线(1%) > 清算线(0.5%)留安全间隙**（`positionRisk.ts:194-203`、`PositionMarginDialog.tsx:209-210/374-376`）——**链上实测：全部 26 个市场 `MIN_COLLATERAL_FACTOR` ≡ `MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION`，间隙恒为零（见下表）** → Max **必然**提到清算线，非 DOGE 个例。
3. **清算价 PnL-aware 且与 Available 同源恒等**：`PositionMarginDialog.tsx:503-540` 调 SDK `getLiquidationPrice`（空头 `positions.ts:292-296`）。因 Available = netValue − S×mcf 且 mcf_action = mcf_liq，提完后 `remaining + pnl_mark ≡ S×mcf` → **p_liq ≡ mark，"+0% from oracle" 数学恒成立**（非巧合）。
4. **无守卫**：`PositionMarginDialog.tsx:621-628` `isConfirmDisabled` 仅查 `amount > withdrawMax`（等于 Max 放行）、`newLev > 100x`；**无"提完清算价 ≤ 现价 / equity 杠杆过高"拦截**。`isPositionBelowActionThreshold`（`positionRisk.ts:66-73`）存在但未引用；提交路径 `usePositionAdjust.ts:730-760` 无清算模拟，直接构造 MarketDecrease(sizeDelta=0, collateralDelta=amount)。
5. **待收 funding 口径不一**：Available/Est.Liq **不计** +5,689，Margin/Leverage **计入**；链上结算会把 receivable 结进 collateral（`liqPriceUtils.ts:91-96` 注释）→ 真实清算线比预览宽约 5,689/400k ≈ 1.4% 价格，预览 "+0%" 相对合约偏保守。

## 影响

- 用户看 "3.60x" 以为安全，**实提完 equity 杠杆 51x、清算价=现价**；Max 一键直达清算边界、无警告 → 大浮亏仓位极高资金风险。
- 三个数三种口径（杠杆无 PnL / 清算价含 PnL 不含 funding / 保证金含 funding），同一弹窗自相矛盾，风险画像失真。定 **S2/P1**。

## 期望

1. 杠杆改用或并列显示**含浮亏的 equity 杠杆**（复用 `leverageWithPnl`），并显示 **New Equity**；
2. 可提上限按**清算线 + 安全间隙**计算，**勿假设动作线 > 清算线**（DOGE 已证为零，应按市场参数动态取 max 或加固定 buffer）；
3. 提完使清算价 ≤ 现价 / equity 杠杆超阈值时**禁用提交或强警告**（复用 `isPositionBelowActionThreshold`）；
4. 三个数统一待收 funding 口径。

## 关联

BUG-022 WDMAXLEV（移动端：提取 Max 与杠杆上限校验自相矛盾）同族；本单为**大浮亏 + 动作线=清算线（DOGE）**的严重表现，附完整源码根因。POS-005 边界（超 100x 拦截已验 LOG-053）——100x 拦截在名义杠杆上生效，但对 equity 杠杆 51x 无感。

## 证据

弹窗截图（数值见现象表）；DOGE 参数 `TestCode/artifacts/parameter-cache/base-sepolia/base_sepolia_v0.3.1_260729.params.json` market#26：minCollateralFactor = minCollateralFactorForLiquidation = 5e27（0.5%）、positionFee 7.5e26（0.075%）、清算费 3e27；源码 file:line 见根因；LOG-086。

## 全市场对照（链上参数缓存直读，2026-09-04）

`TestCode/artifacts/parameter-cache/base-sepolia/base_sepolia_v0.3.1_260729.params.json`，逐市场取 `MIN_COLLATERAL_FACTOR`（动作线）与 `MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION`（清算线），两者 `unset=false`（链上显式设置）：

| 因子值 | 市场 | 动作线 vs 清算线 |
|---|---|---|
| **0.5%** | BTC(1)、WETH(2)、MSOL(3)、SOL(5)、LINK(9)、XRP(17)、BNB(23)、**DOGE(26)** | 相等 |
| **1.0%** | HYPE(4)、WLD(6)、VVV(8)、SUI(10)、AERO(11)、NEAR(12)、XLM(13)、ENA(14)、TIA(15)、ONDO(16)、AAVE(21)、PUMP(22)、XMR(24)、ADA(25) | 相等 |
| 0.59% / 0.71% / 1.11% | ZEC(7)、ARB(18)/TON(20)、LIT(19) | 相等 |

**零间隙市场 26 / 26，有间隙 0 / 26。** 即：前端"动作线高于清算线"的安全假设**在所有市场均不成立**；`MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER` 在 DOGE 上未设（=0，无 OI 放大），故动作线不会因 OI 被抬高。
→ **缺陷范围从"DOGE 个例"升级为"全市场系统性"**：任何市场的 Max 提取都会把仓位推到清算线；浮亏越大越危险（浮亏小时名义杠杆上限 100x 通常先触发、掩盖此问题）。

## 待复测

- ~~用 DataStore 直读 minCollateralFactor(26) 确认 0.5%~~ **✅ 已定案**（参数缓存直读 5e27=0.5%，unset=false）；
- ~~ETH/BTC 等市场是否仍留间隙~~ **✅ 已定案：26/26 全部零间隙**（见上表），缺陷为全市场系统性；
- 实操复测：在 1.0% 档市场（如 SUI/TIA）建小额大浮亏仓位点 Max，验证同样"提到清算线 + 名义杠杆显示偏低 + 无拦截"；
- 提交后链上验证：Max 提取实际执行后仓位是否立即可清算（合约会把待收 funding 结进 collateral，预计比预览宽约 funding/size）。


---

## 复测 2026-09-05 · **FAIL（未修复）**

执行人提供"修复后"数据复测，判定**未修复**；结论已回填 Notion 单「复测」字段。

### 复测数据（fx100-dev.vercel.app · chain 84532 · 同一账号 0xc95d…98aD 的 DOGE Short）

| 字段 | 首次(09-04) | 复测(09-05) |
|---|---|---|
| Available to Trade | 96,897.08 | **94,802.61** |
| Current Margin | 208,060.40 | 208,617.49 |
| Pending funding | +5,689.0146 | +6,246.105 |
| Equity | 104,752.64 | 102,211 |
| New Margin | 111,163.32 | 113,814.88 |
| New Leverage | 3.60x | **3.52x** |
| Est. Liq. | +0% from oracle | **+0.1% from oracle** |

### 零缓冲仍在（数字自洽对账，结论与部署版本无关）

因 `Available := netValue − requiredUsd`：
- size = New Margin × New Lev = 113,814.88 × 3.52 = **400,628**；门槛 = size×0.5% = **2,003.14**
- netValue(提取前) = 94,802.61 + 2,003.14 = **96,805.75** → 提完后 = **2,003.14** ≡ 门槛
- **缓冲 = −0.00 USDC，仍精确落在清算线**

交叉验证：`netValue + 待收funding 6,246.105 − 平仓费 300.5 = 102,751.39`，页面 Equity = 102,211，残差 **540.39 = size 的 0.135%** —— 正是 mark 与 oracle 的点差。

### 「+0.1% from oracle」不是安全垫

该 0.1% 恰为上述 **0.135% 点差**的四舍五入；清算价依旧恒等于 mark 价，只是显示基准改用 oracle 把点差露了出来。**不满足 Notion 单自定的复测标准**（"Est. Liq. Price 相对 Oracle 有非零缓冲，不应出现 +0% from oracle"）。

### 代码侧确认（已排除"测到滞后版本"的顾虑）

- `fx100-apps` 已 fetch，本地与 `origin/develop` **完全同点**（HEAD `1912f460`，2026-09-05）
- `getWithdrawCeilingsUsd` 仍为 `equityUsd − requiredUsd`，`requiredUsd` 仍取 `getPositionActionThresholdUsd`（开仓门槛）；该文件 grep **无 buffer/epsilon/safety 任何标识**
- `positionRisk.ts` / `PositionMarginDialog.tsx` / `leverage.ts` 近期**无新提交**（仅 keeper 相关 #92–#99）；唯一相关的 `4463cb89` 修的是 OC-20，非本缺陷
- 第二处同根因 `leverage.ts::getEffectiveMinCollateralFactor` 仍用 `marketInfo.minCollateralFactor`，亦未修

### Notion 单描述的修复方向（他人分析，与本单一致，摘要备查）

1. **不要动 `min(exactLeverageUsd, maintenanceUsd)` 兜底** —— 它是必要保护：巨亏仓位若只按最大杠杆分支算，本例会允许只留 $4,003 保证金而真实净值仅剩 $105,689，等于多提走约 $101k。
2. **要修的是 maintenance 分支的 `requiredUsd`**：非开仓动作（Withdraw / Adjust Leverage / Add Margin）不应复用与 `minCollateralFactorForLiquidation` 相等的开仓门槛，应有**独立的、明确高于真实清算线**的门槛（单独 collateral factor 配置，或像 leverage 分支那样做 ceiling/epsilon）。
3. **两处提炼共用函数**：`getWithdrawCeilingsUsd` 与 `getMaxDisplayLeverageBpsForAdjust`/`getMaxTargetLeverageBpsForAdjust`（`leverage.ts:400-542`）同根因、各自独立实现，避免再分叉；Add Margin 一并排查（优先级低）。
4. 参数统一的由来：`scripts/tenderly/alignMinCollateralFactor.ts` 把 open/liq 两个 factor 统一，原意仅为开仓体验；开仓另有 100x UI 上限兜底（OC-17）故未出事，但通用函数 `getMinCollateralUsdForPositionAction` 不区分开仓/非开仓动作，导致非开仓动作的安全垫被压成 0。

### 本单相对 Notion 单的增量

- **全市场证据**：26/26 市场两个 minCF 全相等（见上文全市场对照表）→ 根因不限 DOGE、不限某个 fork（本次从 Gordon 20260901 fork 换到 fx100-dev 仍复现，即为佐证）。
- **New Leverage PnL-blind**（Notion 单未提）：显示 3.52x，提完后真实 equity 杠杆 = 400,628 ÷ 7,408.39 = **54.1x**，相差 15.4 倍；New Equity（7,408.39）全程不显示；提交按钮仍绿色可点（`isConfirmDisabled` 仅查 `amount > withdrawMax` 与 `newLev > 100x`，而 100x 闸只作用于名义杠杆，对 54x 的 equity 杠杆无感）。

---

## 复测 2026-09-06（针对 commit `1bdd033b fix: preserve liquidation headroom for max position adjustments`）

前端基线 `fx100-apps@develop` head `0716cb2b`（`1bdd033b` 已在祖先链）。**总裁定：PARTIAL（部分修复）**。

| # | 子主张 | 裁定 | 锚点 |
|---|---|---|---|
| 1 | 杠杆 PnL-blind（显示 3.60x 实为数十倍） | **未修复** | `liqPriceUtils.ts:84` / `positionRisk.ts:184` 分母仍不含 PnL；`leverageWithPnl` 在弹窗零引用 |
| 2 | 可提上限 = 提到清算线 | **已修复** | 新增 `applyMaxFillHeadroom`（`leverage.ts:143-146`，`MAX_FILL_LIQ_HEADROOM_BPS=2500n`），`positionRisk.ts:260` 改用 `getMaxFillThresholdUsd` |
| 3 | 清算价与 Available 同源恒等 | **已修复**（恒等已破） | `netValue' = 1.25L != L`；但显示层看不出，见下方方法学警告 |
| 4 | 提交按钮无守卫 | **未修复** | `PositionMarginDialog.tsx:621-628` 自 `1bdd033b` 起 **0 次改动**；`exceedsMaxAmount` 仍是 `amount > withdrawMax`（等于 Max 放行），无清算邻近度拦截 |
| 5 | 待收 funding 三口径分歧 | **未修复** | `positionRisk.ts:52-54`（不计 receivable）vs `:164`、`liqPriceUtils.ts:104`（计入）原样并存 |

### 数值验证（直接 import 生产模块，DOGE 空头实测数据）

| | 修复前 `1bdd033b^` | 修复后 |
|---|---|---|
| withdrawMax | 96,896.14 | 96,395.91（**少提 500.23**）|
| 提完后 equity 与清算线间隙 | **0.00 USD（精确零）** | 500.23 USD = **0.125% 名义** |
| Est. Liq. 相对 mark | **+0.0000%** | **+0.1250%** |
| 提完后 equity 杠杆 | 200.00x | **160.00x** |
| 弹窗显示 New Leverage | 3.60x | **3.58x** |

缓冲 = `0.25 × minCollateralFactor`，随市场档位缩放：0.5% 档（8 个市场）→ 0.125% 名义；1.0% 档（14 个市场）→ 0.25% 名义。因间隙以名义计价、价格变动对 equity 的影响同样是 `size × Δp/p`，**缓冲能扛的价格波动 = 间隙占名义的比例本身，与杠杆无关**。

### 方法学警告：人工复测不能靠「from oracle」这个字段判定

`LiqPriceRow.tsx:48` 用 `formatNumber(Math.abs(fromMarkPct), 1)` **只保留 1 位小数**。修复后的 `+0.125%` 显示为 **`+0.1%`**，而本单 2026-09-05 判 FAIL 那次复测的页面读数**也是 `+0.1%`**（当时那 0.1% 是 0.135% 点差的四舍五入）。**修好与没修好在这个字段上肉眼不可区分**，必须核对 Available/New Margin 反推间隙。

### 仍然危险的组合（主张 1 + 4 未修的直接后果）

提完 Max 后仓位的 equity 杠杆被钉在 **160x**（0.5% 档）/ **80x**（1.0% 档）——这是与仓位大小、浮亏深浅**无关的常数**（= 1/(1.25×mcf)）；而弹窗显示 **New Leverage 3.58x**，两者相差约 45 倍。提交按钮全程绿色可点、零警告。风险画像失真的问题**没有任何缓解**。

### 链上前提未变

公共 RPC 只读复核（2026-09-06，block 46,386,377）：**26/26 市场** `MIN_COLLATERAL_FACTOR` 与 `MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION` 相等，unequal = 0，与 8 月快照一致。修复未走参数侧规避。

### 回归面（判断）

`closeCostFactor` 现在取 `max(链上因子, 1.25×清算因子)`，在两线相等的现实下恒等于 1.25 倍，使推导出的 `fullCostMaxLeverageBps` 在所有统一市场收紧约 19%（0.5% 档 153.85x → 129.03x）。当前仍高于 UI 上限故不可见；**若某市场配置较大 spread 或 UI 上限贴近推导上限，这条会真的压低上限**。

单测：`src/lib/orders/` 30 文件 269 测试全绿；`typecheck` exit 0。新增测试**确实**断言了「Max 后仍有间隙」（`positionRisk.test.ts:338-355` 断言间隙精确等于 500.50575），但**零测试覆盖弹窗层**——与主张 1/4 未修复一致。

### 建议

1. 主张 1/4 应继续跟进：New Leverage 改用 `leverageWithPnl`、补 New Equity 行、给 `isConfirmDisabled` 加清算邻近度拦截。
2. `MAX_FILL_LIQ_HEADROOM_BPS = 2500` 是产品可调数。当前 0.125% 小于本单实测的 mark/oracle 基差（0.135%），也小于 keeper 正常延迟（58~124s）窗口内的常见波动。建议改挂**目标价格距离**（如「提完后 Est.Liq 距 mark 不少于 1~2%」）而非清算线的百分比。（判断，非事实）

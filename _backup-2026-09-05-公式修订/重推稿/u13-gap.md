# u13 需求↔实现差异台账（§18 清算价格与风险展示）

需求规范来源：
- **A** =《FX100-页面字段计算公式.md》（`Docs/Gordon-Notion需求文档归档/汇总/`，Notion 归档整理）——§2.5 清算价、§2.6 清算触发判定、§2.8 调整保证金、§四 清算保护卡片（§4.1 保护期推导 / §4.2 5 状态机）、§七 速查表第 490–491 / 495 行、§八 UI 文案建议第 511 行
- **B** =《2026-07-02_fx100-trading-guide.zh.md》（`Docs/V0.3.1/需求文档/`）——§9.1 维持保证金因子、§9.2 清算价公式、§10 清算保护（Liquidation Brake）
- **C** =《2026-07-29_Dynamic-Spread-允许为负+清算-ADL-隔离实施方案.md》（`Docs/v0.3.2/需求文档/`）——v0.3.2 清算/ADL 隔离的实施依据
- **D** =《2026-07-15_FX100-持仓面板数字口径统一规范（Margin-Net-Value-Leverage-uPnL-Funding）.md》（`Docs/V0.3.1/需求文档/`，自述合约基线 `release/v0.3.0`）——§4.2 Net Value 列与"与合约清算量的关系"精度声明；该文的 Margin / Leverage 部分已在 u11-gap 处理，本组只取与清算展示相关的段落

实现基线：`Github/fx100-contracts@release-v0.3.2`（对比 `release-v0.3.1`）；前端 `Github/fx100-apps@develop` @ `dfa36d0b5295d20246df2ae42fec50327fb0ace3`。

---

### 1. 需求闭式漏掉 `MIN_COLLATERAL_USD` 绝对地板

- 需求规范：A §2.5 / B §9.2「`liqPrice = entryPrice·(1 + minCF_liq + closeFeeRatio) − netCollateral / sizeInTokens`」，维持项只有 `minCF_liq`；A §七 第 490–491 行速查表同式。
- 合约实现：`src/position/PositionUtils.sol::isPositionLiquidatable` 有**两条**并列阈值——条件① `remainingCollateralUsd < dataStore.getUint(FX100Keys.MIN_COLLATERAL_USD)`（`shouldValidateMinCollateralUsd` 开关，真清算 gate 传 `true`，见 `src/position/DecreasePositionUtils.sol::decreasePosition`）、条件③ `< Precision.applyFactor(sizeInUsd, minCollateralFactor)`。有效维持线是两者取大。
- 差异：需求公式等价于只用条件③。仓位规模小到 `⌊S × mcf_liq / 1e30⌋ < MIN_COLLATERAL_USD` 时，真实清算线被绝对地板顶住，需求公式给出的多头清算价偏低、空头偏高。
- 影响：小仓位（尤其是"最小仓位规模附近"的边界用例）按需求公式算期望值会得到"还没到清算线"的结论，链上却已经可清算，被报成缺陷。
- 建议定性：需求缺失分支（本次 §18.1 引入 `T = max(MIN_COLLATERAL_USD, ⌊S×mcf/1e30⌋)`、`T* = max(T, 1)`）

---

### 2. 需求把价格冲击写成加性项；v0.3.2 的冲击只在成交价里，且遗留 impact 键是死代码

- 需求规范：A §2.5「`netCollateral = collateral + closingImpact − pendingFunding`」并在口径要点里打勾「✅ 含平仓价格冲击——清算价问的是『现在平掉还剩多少』」；B §9.2 同。
- 合约实现：`isPositionLiquidatable` 的 `remainingCollateralUsd` **没有任何加性 price impact 项**；冲击体现为 `PositionUtils.sol::getExecutionPriceForDecrease` 里作用在价格上的 `dynamicSpread`（清算路径 `allowNegativeSpread = false`，`minDynamicSpread` 抬到 0）。GMX 遗留的加性模型在 v0.3.2 已成死代码：`FX100Keys.sol` 仍定义 `POSITION_IMPACT_FACTOR` / `POSITION_IMPACT_EXPONENT_FACTOR` / `MAX_POSITION_IMPACT_FACTOR` / `MAX_POSITION_IMPACT_FACTOR_FOR_LIQUIDATIONS`，但 `src/` 全库检索这四个 key 的 `*Key()` 生成器只被 `MarketUtils.sol` 的 getter 引用，而 `getMaxPositionImpactFactorForLiquidations` / `capPositiveImpactUsdByMaxPositionImpact` **没有任何调用方**；`Position.Numbers`（`src/position/Position.sol`）也没有 `pendingImpactAmount` 字段。
- 差异：同一个"平仓冲击"，需求当加数、合约当乘数（价格侧），量纲与作用点都不同。
- 影响：① 直接按需求公式核对会在 `dynamicSpread ≠ 0` 的市场系统性分叉；② 前端 `packages/sdk/src/utils/positions.ts::getLiquidationPrice` 仍完整实现了这套死掉的加性模型（`maxPositionImpactFactorForLiquidations` 上限、`getPriceImpactForPosition` 指数模型、`pendingImpactAmount`）——正常部署下三项都为 0 所以不显形，**一旦某个 fork/mock 环境把这些遗留键配成非零，页面清算价会移动而链上判定纹丝不动**，属于"只能靠读键确认为 0 才能排除"的静默陷阱。
- 建议定性：设计已变更未回写文档（v0.3.2 按 C 改为 dynamicSpread 口径）+ 前端遗留实现

---

### 3. 需求的净抵押只减待付 Funding，不加待收 Funding

- 需求规范：A §2.5「`netCollateral = collateral + closingImpact − pendingFunding`」；A §2.6「`remainingCollateral = collateral + PnL(oracle) + closingImpact − closingFee − pendingFunding`」。
- 合约实现：`isPositionLiquidatable` 显式加入 `uint256 positiveFundingFeeUsd = fees.funding.positiveFundingFeeAmount * cache.collateralTokenPrice.min;`，并写进 `info.remainingCollateralUsd`（该分支 v0.3.1 已存在，v0.3.1↔v0.3.2 无 diff）。
- 差异：需求少算一项抵押品。
- 影响：净收 Funding 的仓位，按需求算出的清算价对多头偏高、对空头偏低（都偏保守），差额 = `positiveFundingFeeUsd / sizeInTokens`。同一问题在前端 Path A 上更严重——`getLiquidationPrice` 的**函数签名里根本没有正 Funding 入参**，页面所有清算价都少这一项。
- 建议定性：需求缺失分支 + 前端实现缺口（与 u11-gap 第 1 项同源：需求把"判定不计应收"当成现存缺陷，实际早已修复）

---

### 4. 需求判定用 `≤`，合约条件③ 是严格 `<`；且需求只写了一条条件

- 需求规范：A §2.6 / B §9.1「`if remainingCollateral ≤ sizeInUsd × minCollateralFactorForLiquidation: → 可被清算`」。
- 合约实现：三条件按源码顺序短路返回，等号语义不同——① `< MIN_COLLATERAL_USD`（严格）、② `<= 0`（含等号）、③ `< minCollateralUsdForLeverage`（严格），全不满足时返回 `(false, "", info)`。
- 差异：需求把条件③ 写成含等号，且合并掉了① 与②，也没有 `reason` 顺序。
- 影响："恰好等于维持线"的边界用例期望值反了（合约不触发）；`MIN_COLLATERAL_USD > 0` 时 remaining ≤ 0 会先命中条件① 而 `reason = "min collateral"`，按需求只断言最终 bool 的用例会漏掉 reason 分支。
- 建议定性：需求表述错误（本次 §18.1 明确 `T*` 与等号语义，§18.9 列入核对清单）

---

### 5. 需求判定用 oracle 价算 PnL，合约用清算专用成交价，且盈利侧还有池级封顶

- 需求规范：A §2.6「`remainingCollateral = collateral + PnL(oracle) + …`」；B §9 正文亦称「清算由 keeper 按当前预言机价触发执行」。
- 合约实现：判定用的是 `cache.executionPrice = getExecutionPriceForDecrease(cache.params, prices.indexTokenPrice).executionPrice`——Long 走 `⌊indexTokenPrice.min × (1e18 − d) / 1e18⌋`、Short 走 `⌈indexTokenPrice.max × (1e18 + d) / 1e18⌉`；随后 `getPositionPnlUsdWithExecutionPrice` 在 `totalPositionPnl > 0` 时按 `MAX_PNL_FACTOR_FOR_TRADERS` 对池级 PnL 等比缩放。
- 差异：① oracle 中间价 vs 含点差的清算成交价、且要选对 `min`/`max` 边；② 需求完全没有 PnL cap。
- 影响：把 mark price 当判定价，`constantPriceSpread` 不为 0 的市场必然分叉；盈利仓位因大额负 Funding 被清算的场景（cap 可能触发）无法用需求公式反解。
- 建议定性：需求缺失分支（本次 §18.2 末尾写明"闭式可用"的前提是亏损侧、cap 未触发；§18.3 给出 `d` 的四项分解与不动点说明）

---

### 6. 需求把「清算线低于开仓线、差额即安全缓冲」当成协议保证；链上不校验，实配 26/26 相等

- 需求规范：B §9.1「`minCollateralFactorForLiquidation` **低于**开仓所需的最低抵押率——两者之差即为安全缓冲」；A §2.5 符号表同句。
- 合约实现：`src/config/ConfigUtils.sol::validateRange` 只对两个键各设**独立上限**（`MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION ≤ 1e28`、`MIN_COLLATERAL_FACTOR ≤ 5e28`），**没有任何跨键关系断言**；`isPositionLiquidatable` 也只按 `forLiquidation` 二选一取值。
- 差异：需求描述的是配置约定，不是协议不变量。
- 影响：Base Sepolia dev 站 26/26 市场两键实测同值（0.5% / 1.0% / 0.59% / 0.71% / 1.11% 各档全部两线相等），"安全缓冲"不存在——提取保证金 Max 会把仓位提到清算线上（缺陷单 `BUG-FE-WDMAXLIQ-024`，前端根因 `lib/orders/positionRisk.ts::getWithdrawCeilingsUsd` + `PositionMarginDialog.tsx` 的注释就假设了这层缓冲）。fork mock 市场同样两线同值，所以"按上限杠杆开仓、扣一笔费就可被清算"是配置产物而非缺陷。
- 建议定性：需求把配置约定当协议保证（本次 §18.9 列为必读键；§11.2 已有相同结论，两处互引）

---

### 7. 保护期时长：需求内部就有 15 分钟 / 120s / 240s 三个数，前端另有一个兜底常量

- 需求规范：B §10「每一笔新开仓，自动获得 **15 分钟**的免清算宽限期」（摘要与速查表重复三次）；A §4.1 举例「Tier=0：multiplier = 8e18，base = 15s → +120s；Tier=1：multiplier = 16e18，base = 15s → +240s」；A §八 第 511 行又写「明示『加仓不延长；重开才能拿到新的 15 分钟』」。
- 合约实现：`src/order/IncreaseOrderUtils.sol::processOrder` 在 `position.account() == address(0)` 分支写 `graceEnd = block.timestamp + ⌊liquidationGracePeriodBaseKey(marketIndex) × liquidationGracePeriodTierMultiplierKey(referrerTiers(account)) / 1e18⌋`——**分市场 base × 分 tier multiplier，全部来自配置**，没有任何 15 分钟常量。`src/liquidation/LiquidationUtils.sol::createLiquidationOrder` 的闸门是 `position.graceEnd() > block.timestamp → revert PositionNotLiquidatable`。
- 差异：需求公式（A §4.1 第一行）与合约一致，但同文档的示例值与 B 的"15 分钟"文案互相矛盾，三个数没有一个是链上事实。
- 影响：① 用例写死 15 分钟会在 base=15s 的市场全错；② 前端 `apps/fx-base-app/src/lib/liquidationProtection.ts` 的 `DEFAULT_LIQUIDATION_PROTECTION_SECONDS = 15 * 60` 在 `graceStart` 缺失时倒推窗口起点——保护条的进度会显示成假的 15 分钟；③ `graceEnd <= 0` 时 `getLiquidationProtectionWindow` 返回 `null`（无保护），不是"默认 15 分钟"，与 B 的文案相反。
- 建议定性：需求内部不一致 + 文案与实现脱节（本次 §18.7 写明 duration 必须回读两个键）

---

### 8. 需求 5 状态机与实现不对应；"价格触碰清算线"不是 Reader 判定

- 需求规范：A §4.2 五状态机（Promo / Safe / Danger / Recovered / Expired-clean / Expired-saved，实为 6 行），触发条件写作「有持仓 + timer > 0 + 价格触碰清算线」，并要求 `hadDanger` 布尔区分两种 Expired。
- 合约实现：合约**不存任何状态枚举**；已清算只能由"Position 从 Store 消失 + 同一 orderKey 上 `OrderCreated.orderType == Liquidation` 与 `PositionDecrease.orderType == Liquidation`"的事件链证明（v0.3.2 没有名为 `Liquidated` 的事件）。前端实际实现是：`_position/liqPriceUtils.ts::isPositionLiquidatable`（与合约同名函数无关）判据 `netValue <= 0` **或** mark 价越过**本地估算**清算价；`lib/liquidationProtection.ts::isLiquidatableBadgeVisible` 在保护期内抑制 `Liquidatable` 徽标。
- 差异：需求的判据是"价格触碰清算线"（暗示权威判定），实现是本地估算的双条件或；需求的 Recovered/hadDanger 需要客户端记忆，链上无对应事实。
- 影响：把页面 `Liquidatable` 当作 Reader bool 写断言必然不稳；"红色清算价 + 无徽标"是保护期内的**正常态**，容易被误报成漏显示。
- 建议定性：需求与实现均需按 GAP 管理（本次 §18.7 要求用例分三列记录"本地估算态 / Reader 预检 bool / 链上执行结果"）

---

### 9. 同一仓位的"清算价"在页面上不止一个值：路径分叉 + 折扣入参不一致

- 需求规范：A §2.5 与 B §9.2 给出**单一**清算价公式；A §四 07-29 定案「Protection 面板删除重复的 `Est. Liq. Price`，仅保留动态 PnL；清算价继续在 Positions 行显示」——默认全站一个值。
- 前端实现（同 head 源码亲验）：
  - **路径分叉**：`OrderPreview.tsx` 的 `liquidationPrice` 先取 `preview?.liquidationPrice`（Path A），无效时才回退 `estimateNewLiqPrice`（Path B）；`PositionLeverageDialog.tsx` 的 `displayLiqPrice = hasUserChangedTarget ? (sdkEstimatedLiq ?? estimatedLiq.newLiqPrice) : …`，同样是 **A 优先、B 回退**。
  - **折扣入参不一致**：持仓面板路径 `packages/sdk/src/modules/positions/positions.ts` 传真实 `userReferralInfo`（由 `getUserReferralInfo()` 解析），而 `PositionMarginDialog.tsx` / `PositionLeverageDialog.tsx` / `hooks/trade/useCreateOrder.ts` 三处均传 `userReferralInfo: undefined`。
  - **地板入参不一致**：面板传链上 `MIN_COLLATERAL_USD`，弹窗传 `marketInfo.minCollateralUsd ?? 0n`，`useCreateOrder.ts` 传 `minCollateralUsd: 0n`。
- 差异：有返佣码的用户在持仓行与调保证金弹窗看到的清算价必然不同（差额 = 折扣项）；小仓位下单预览因丢失绝对地板而偏乐观。
- 影响：核对必须**按界面**确定基准，且要先确认这一次取到的是 A 还是回退的 B；"页面两处清算价不一致"不能一律判缺陷。**同时这也修正了 [FX100-前端代码公式.md](../../../../TestCase/E2E/ContractCodeSummary/v0.3.2/FX100-前端代码公式.md) 的两处表述**：§6 的界面归属表把「下单预览」「杠杆调整弹窗」标为固定 Path B，实际是 A 优先 B 回退（该文 §5 开头"`preview.liquidationPrice` 非 null 即走本路径"一句是对的，与 §6 的表自相矛盾）；§8 末尾"页面 display 路径传 `undefined`，所以页面显示的清算价不含返佣折扣"对**持仓面板不成立**。建议下一轮修订前端文档时一并订正，本文档 §18.5 只做交叉说明，不改前端文档结论。
- 建议定性：实现分叉未文档化 + 兄弟文档内部不一致

---

### 10. 前端 Path A 与合约判定的四处结构性口径差

- 需求规范：A §2.5 口径要点「✅ 含平仓费 / ✅ 含平仓价格冲击 / ❌ 不含未来资金费」。
- 实现差异（`packages/sdk/src/utils/positions.ts::getLiquidationPrice` vs `PositionUtils.sol::isPositionLiquidatable`）：
  1. 平仓费档位**写死** `getPositionFee(marketInfo, sizeInUsd, false, referral)` 的 `balanceWasImproved = false`；合约 v0.3.2 已把 `cache.balanceWasImproved = executionPriceResult.balanceWasImproved` 接进档位选择。
  2. 正 Funding 无入参（见第 3 项）。
  3. `pendingBorrowingFeesUsd` 参与 `totalPendingFeesUsd`，但 v0.3.2 `PositionPricingUtils.PositionFees` **没有 `borrowing` 字段**，SDK 的 `fees.borrowing?.borrowingFeeUsd ?? 0n` 对 v0.3.2 ABI 恒解析为 `0n`——当前不产生偏差，但结构上是"算了一项合约不结算的费"。
  4. 完全没有 `dynamicSpread`：Path A 反解出的是"成交价 = index 价"的近似。
  另有精度点：两个分支都以 `(分子 / 分母) × 10^posSizeDecimals` 收尾，**先除后乘**，截断发生在乘回标度之前。
- 影响：improved 档市场上 Path A 偏保守；`constantPriceSpread ≠ 0` 市场上必然分叉。逐 wei parity 只在"点差 0、正 Funding 0、遗留 impact 键 0、无返佣、抵押品未脱锚"时成立（§18.6 已用同一组数验证四路径逐 wei 相等）。
- 建议定性：前端实现缺口（`Liquidation-(v0.3.2).md` §6.3 已按 GAP 登记，本次补齐项级证据）

---

### 11. `sizeInTokens` 的 18 位是部署约定，SDK 却当成协议不变量

- 需求规范：A / B 未涉及；本文档 §21 速查表写「Size Token 展示 `sizeInTokens / 1e18`，所有标的统一 18 位」。
- 合约实现：`sizeDeltaInTokens = sizeDeltaUsd / executionPrice`，而 oracle 价标度是 `10^(30 − tokenDecimals)`（`src/oracle/ChainlinkPriceFeedUtils.sol` / `PythPriceFeedUtils.sol` 的「`60 - external price feed decimals - token decimals`」注释）。因此 `sizeInTokens` 的标度**等于 index token 登记的 decimals**，合约不作任何归一化。
- 前端实现：`packages/sdk/src/utils/positionPrecision.ts` 硬编码 `POSITION_SIZE_DECIMALS = 18`，`getPositionSizeDecimals(_token)` 忽略入参，注释直接断言「BTC 链上 8 位但仓位规模仍按 18 位存」。
- 差异：这是**登记约定**（合成 index token 一律按 18 位登记；工作区曾把 WBTC 合成 token 由 8 位改正为 18 位）而非合约保证。
- 影响：任何按非 18 位登记的 index token 会让 SDK 的清算价、入场价、仓位价值同时偏 `10^(18 − d)` 倍，且没有任何断言会报错。
- 建议定性：实现依赖未文档化的部署约定（本次 §18.1 加了标度警告，§18.9 列为核对项）

---

### 12. "屏幕上的 Net Value"与"驱动 Liquidatable 徽标的 netValue"不是同一个数；需求把徽标当成"按合约口径算"

- 需求规范：D §4.2「Net Value = Margin + Unrealized PnL − 平仓手续费」，并在"与合约清算量的关系（精度声明，测试必读）"中承认与合约 `remainingCollateralUsd` 有两处口径差（① PnL 用标记价 vs 全平执行价，**设计差异、永久保留**；② 应收资金费"现行合约判定不计（遗留 bug）……此差异为**临时**，修复合入后消失"），结论是「**清算真值以 Liquidatable 徽章和清算价为准（它们按合约口径算）**，Net Value 是导航仪不是判决书」。
- 实现（`apps/fx-base-app/src/hooks/trade/usePositionsController.ts` 同一函数体内）：
  - **显示列** `netValueUsdRaw` = `_position/liqPriceUtils.ts::getPositionPanelNetValueUsd` = `getPositionMarginUsd + unrealizedPnlUsd − getPositionCloseFeeUsd`，其中 `getPositionMarginUsd = collateralUsd + 正 Funding − 负 Funding`——**与 D §4.2 一致**。
  - **徽标判定** `isLiquidatable` = `liqPriceUtils.ts::isPositionLiquidatable({ netValue: posInfo.netValue, markPrice, liquidationPrice })`，其 `netValue` 来自 SDK `packages/sdk/src/utils/positions.ts::getPositionNetValue` = `collateralUsd − 待付 Funding − 待付 Borrowing − closingFee − uiFee + pnl + 两项 impact`——**不含正 Funding**，且 `closeFee` 走 `getPositionFee(..., balanceWasImproved=false, referral)` 而非面板的 `lib/orders/leverage.ts::getPositionFeeRate`。
- 差异：① 需求承认的第二处差异（判定不计应收）在**合约侧早已修复**（`isPositionLiquidatable` 含 `positiveFundingFeeUsd`，v0.3.1 起即有），却**原封不动地留在了前端徽标的判据里**——差异从合约漂移到了前端；② 需求说"徽章按合约口径算"不成立：徽标判据是本地 `netValue <= 0` **或** mark 价越过**本地估算**清算价，跟 `Reader.isPositionLiquidatable` 没有关系；③ 同一概念因此有三个互不相等的数（合约 `remainingCollateralUsd` / SDK `netValue` / 面板 `Net Value`）。
- 影响：净收 Funding 的仓位会出现"屏幕上的 Net Value 仍为正、`Liquidatable` 徽标已亮"，按 D 的措辞会被判成渲染缺陷，实际是两个不同的量；反过来，把徽标当作"合约已判可清算"的证据会在保护期内、以及 Path A 与链上分叉时全部失效。三者不可互相代入做断言。
- 建议定性：需求的"临时差异"表述过期 + 实现内部口径分叉（本次 §18.8 建三行对照表；命名陷阱表在 §17.4；与 u11-gap 第 1 项同源）

---

### 13. Reader 预检不等于执行判定（需求与页面文案都按"能查到就是权威"表述）

- 需求规范：A §4.2 状态机以"价格触碰清算线"为判据；B §9 称"当净抵押跌到维持线以下即触发清算"，均隐含"查询即权威"。
- 合约实现：`src/reader/Reader.sol::isPositionLiquidatable` 先 `PositionStoreUtils.get` 再直接调 `PositionUtils.isPositionLiquidatable`，**不预先推进 Funding**——`PositionPricingUtils.sol::getPositionFees` 取的是已持久化的 `MarketUtils.getNegativeFundingFeePerSize / getPositiveFundingFeePerSize`；真实清算交易在判定前会先更新 Funding。此外 Keeper 预检传 `(shouldValidateMinCollateralUsd = false, forLiquidation = true)`，链上清算 gate 传 `(true, true)`。
- 差异：Reader 是"基于已持久化状态的预检"，不是执行等价判定。
- 影响：只因全局 `MIN_COLLATERAL_USD` 触线的仓位会被 Keeper 预检漏掉；Funding 累积较快时同一 oracle 报文下预检与执行可以不同号。用例必须分别记录"Reader 预检"与"链上最终判定"两列。
- 建议定性：需求隐含假设不成立（与 `Liquidation-(v0.3.2).md` §6.2 同源，本次 §18.3 收进精确边界协议）

---

## 未发现差异的项（已核，无需改）

- A §4.1 的保护期公式本体（`graceEnd = graceStart + base × tierMultiplier / WEI_PRECISION`）与 `IncreaseOrderUtils.sol::processOrder` 一致；差异只在示例值与文案（见第 7 项）。
- A §2.5「✅ 含平仓费——清算是被迫平仓，平仓费照收」与合约一致：判定期 `getPositionFees` 传 `isLiquidation = false`、`uiFeeReceiver = address(0)`，所以含平仓位费、不含清算费与 UI 费；清算费只在执行阶段计入（§8 / §11.1）。
- A §2.5「❌ 不含未来资金费」与合约一致：判定只用已累积的 Funding 索引差，不外推。
- A §2.8「加保证金 → 清算价远离现价；减保证金 → 更接近清算」与 §18.2 闭式的单调性一致。
- B §9 末「清算费从剩余抵押中扣除，而非额外向你收取」与 `DecreasePositionCollateralUtils.sol::processCollateral` 的支付瀑布一致（§17.6）。

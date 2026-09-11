# u05（§6 Position PnL · §8 清算费 · §9 费用总额）需求 ↔ 实现差异台账

需求规范来源（两篇，均为 v0.3.1 期归档）：
- A =《FX100-费用收取与分配体系全面设计规范（讨论版-2026-06-13-定稿）》`Docs/V0.3.1/需求文档/2026-06-15_...md`
- B =《FX100-费用收取与分配体系改造规范(实施版-2026-06-13)》`Docs/V0.3.1/需求文档/2026-07-22_...md`

实现来源：`Github/fx100-contracts@release-v0.3.2` @ `13880f2`。

---

### G-01 清算费基数：需求按保证金，实现按名义仓位规模
- 需求规范：A §3.5「`liquidationFeeAmount = collateralAmount × LIQUIDATION_FEE_FACTOR`」，参数表「`LIQUIDATION_FEE_FACTOR(marketIndex)` — 清算费占**保证金**比例 — 建议 0.002~0.005」；B §七参数表「`LIQUIDATION_FEE_FACTOR(market)` 0.003 — 清算费 0.3% **保证金**」。
- 合约实现：`src/pricing/PositionPricingUtils.sol::getLiquidationFees` — `liquidationFeeUsd = Precision.applyFactor(sizeInUsd, liquidationFeeFactor)`，其中形参 `sizeInUsd` 实际接收的是 `params.sizeDeltaUsd`（`::getPositionFees` 调用处），即本次成交的**名义 USD 规模**；再 `liquidationFeeAmount = Calc.roundUpDivision(liquidationFeeUsd, collateralTokenPrice.min)`。全链路不读 `position.collateralAmount()`。
- 差异：费率基数从"保证金"变成"名义仓位规模"，实际收费被放大约 = 杠杆倍数。
- 影响：按 B 的建议值 0.003 部署时，10x 杠杆仓位的清算费 = 保证金的 3%（例：3 万美元名义 / 3 千美元保证金 → 收 90 USDC，需求意图是 9 USDC）；50x 时达保证金的 15%，会显著加深穿仓与坏账，也直接影响所有清算类用例的期望值。测试若照需求写期望值会全量 FAIL。
- 建议定性：缺陷候选（参数语义与代码基数不匹配；至少需要确认是"改代码"还是"改参数建议值 + 回写文档"）

### G-02 清算费余额腿去向：需求给清算人，实现给 LP Vault
- 需求规范：A §3.5「`liquidatorAmount = liquidationFeeAmount - feeReceiverAmount` → **转给清算人（Keeper）**」；A §1.1 费用总览表「清算费 → 主要去向：**Keeper（清算人）**+ 分账器（feeReceiverAmount）」。
- 合约实现：`src/pricing/PositionPricingUtils.sol::getPositionFees` — `fees.feeAmountForPool = fees.positionFeeAmountForPool + fees.liquidation.liquidationFeeAmount - fees.liquidation.liquidationFeeAmountForFeeReceiver`；`src/position/DecreasePositionCollateralUtils.sol::processCollateral` 把 `feeAmountForPool` 一次性 `positionVault.transferOut(collateralToken, market.vault, ...)` 转进 **LP Vault**。全流程无任何向 `order.executionFeeReceiver` / keeper 的清算费转账。
- 差异：清算费的非分账器部分（默认 50%）归 LP，而非清算人。
- 影响：Keeper 清算收益只剩执行费（gas 补偿），清算激励弱于需求设计；LP 侧多一笔非对赌收入。核对时不要在 keeper 地址上找这笔钱。
- 建议定性：缺陷候选（若为有意变更，属"设计已变更未回写文档"，需产品确认清算激励模型）

### G-03 清算费的生效门（`isLiquidation`）需求完全未描述
- 需求规范：A §3.5 / §1.1 只写"仓位被清算"触发，未区分 Liquidation 单与 ADL 单，也未说明清算判定、Reader 预览是否计入。
- 合约实现：`src/pricing/PositionPricingUtils.sol::getPositionFees` 的 `if (params.isLiquidation)` 门 = `Order.isLiquidationOrder(orderType)` = `orderType == OrderType.Liquidation`（`src/order/Order.sol::isLiquidationOrder`）。ADL 是 `MarketDecrease + SecondaryOrderType.Adl`，恒 `false`；`PositionUtils::isPositionLiquidatable` 与 `ReaderPositionUtils::getPositionInfo` 都硬编码 `false`。
- 差异：需求把"清算费"当成场景级概念，实现是订单类型级开关；ADL 强平不收清算费，Reader 也永远预览不到清算费。
- 影响：①ADL 与清算的用户成本不同，用例期望值必须分开写；②前端/Keeper 用 Reader 估算"被清算的总成本"会系统性少一笔清算费，会被误报为前端缺陷；③`isPositionLiquidatable` 不含清算费是源码显式意图（有注释），但它意味着"刚好触发清算"的仓位在实际清算时必然资不抵费。
- 建议定性：需求表述模糊（建议回写：明确 ADL 不收清算费、判定口径不含清算费）

### G-04 抵押品不足时费用"全部清零"，需求未描述该分支
- 需求规范：A §4.1 / B §一只写「交易者亏损 100% 进 LP Vault」「手续费 feeForPool + feeReceiverAmount 分账」，没有任何"抵押品不足以支付费用"时的降级规则；A §4.3 把穿仓坏账交给"保险基金手动兜底"。
- 合约实现：`src/position/DecreasePositionCollateralUtils.sol::processCollateral` 第三步 `payForCost(totalCostAmountExcludingFunding × price.min)` 后，`if (remainingCostUsd == 0) { 正常分账 } else { fees = getEmptyFees(fees); }`，随后 `handleEarlyReturn(..., "fees")`。`::getEmptyFees` 把 `positionFeeAmount` / `uiFeeAmount` / 全部 `liquidation.*` / 全部 `referral.*` / `feeAmountForPool` / `feeReceiverAmount` / `totalCost*` 一并**归零**，不是按比例削减；`handleReferral` 因此也拿到 0。
- 差异：需求隐含"尽力收取"，实现是**全有或全无**：只要差 1 wei，本笔清算/ADL 的手续费、清算费、UI Fee、推荐奖励全部收不到。
- 影响：清算类用例不能假设"必收清算费"；出现 `InsolventClose` 时所有费用断言都应改为断言 0。协议在最需要收清算费的穿仓场景反而完全收不到费。
- 建议定性：缺陷候选（收入口径；至少需要在需求文档补齐降级规则）

### G-05 清零分支下被扣抵押品无归集去向（滞留 PositionVault）
- 需求规范：A §4.2 端到端资金流图要求每一笔费用要么进 `claimableFeeAmount`，要么留在 LP；B §二同图。没有"无归属余额"这一去向。
- 合约实现：`::processCollateral` 的 `else { fees = getEmptyFees(fees); }` 分支不执行任何 `transferOut` 或 `incrementClaimableFeeAmount`，而 `payForCost` 已经把 `values.output.outputAmount` / `values.remainingCollateralAmount` 相应扣减。源码注释写「the amount was entirely paid to the pool instead of for fees」，但该分支并没有把资金转到 `market.vault`，代币实际停留在 `PositionVault`。（对比：第②步亏损支付是显式 `positionVault.transferOut(pnlToken, market.vault, amountPaid)`。）
- 差异：注释声称的去向（pool）与实际转账缺失不一致，形成一笔无账面归属的沉淀。
- 影响：穿仓清算后 PositionVault 余额会缓慢累积、且不体现在 LP NAV 与 claimable 里，守恒式核对（ΣΔ）会出现无法解释的残差。
- 建议定性：缺陷候选（资金归集缺口 / 注释与实现不符）

### G-06 UI Fee 的加减方向：需求从手续费内扣，实现是外加
- 需求规范：A §3.1 分配逻辑树「`positionFeeAmount` ├─ affiliateRewardAmount ├─ **uiFeeAmount ← UI 手续费（从总量中扣除）** └─ remainingFeeAmount → feeReceiverAmount / feeForPool」。
- 合约实现：`::getUiFees` 独立按 `uiFeeAmount = applyFactor(sizeDeltaUsd, uiFeeReceiverFactor) / collateralTokenPrice.min` 计算，与 `positionFeeAmount` 同基数并列；`::getPositionFees` 里 `totalCostAmountExcludingFunding = positionFeeAmount + liquidationFeeAmount + uiFeeAmount - totalDiscountAmount`，`protocolFeeAmount` 的减项里**没有** `uiFeeAmount`。
- 差异：UI Fee 是"额外向用户收"，不是"从既有手续费里分给前端"。用户实付成本 = 手续费 + UI Fee。
- 影响：`uiFeeReceiverFactor > 0` 时用户实际成本高于需求口径；LP 与分账器的份额不因 UI Fee 减少。总额公式（§9.1）的符号直接依赖这一点。
- 建议定性：缺陷候选 / 需求表述模糊（GMX 原生语义即"外加"，倾向于文档未回写）

### G-07 `protocolFeeAmount` 的减项与需求分配树不一致
- 需求规范：A §3.1「remainingFeeAmount = positionFeeAmount − affiliateRewardAmount − uiFeeAmount」，随后按 `POSITION_FEE_RECEIVER_FACTOR` 拆分账器/LP。
- 合约实现：`::getPositionFeesAfterReferral` — `protocolFeeAmount = positionFeeAmount - referral.affiliateRewardAmount - totalDiscountAmount`（`totalDiscountAmount = max(pro.traderDiscountAmount, referral.traderDiscountAmount)`），不减 `uiFeeAmount`，但多减了 Trader/Pro 折扣。
- 差异：减项集合不同（少 uiFee、多 traderDiscount）。该点主要落在 §7，但直接决定 §9 的 `totalCost` 与 §8 的 `feeAmountForPool` 数值。
- 影响：`feeReceiverAmount` / `feeAmountForPool` 的期望值若按需求树推导会偏大；有 Pro 分层或推荐码的账户偏差最大。
- 建议定性：设计已变更未回写文档（Pro 折扣是 v0.3.x 新增，需求文档未覆盖）

### G-08 `positionFeeAmount` 的单位：需求停在 USD，实现落到抵押币数量
- 需求规范：A §3.1「`positionFeeAmount = sizeDeltaUsd × POSITION_FEE_FACTOR / FLOAT_PRECISION`」——量纲是 30 位 USD。
- 合约实现：`::getPositionFeesAfterReferral` — `fees.positionFeeAmount = Precision.applyFactor(sizeDeltaUsd, positionFeeFactor) / collateralTokenPrice.min`，多一次除以 `collateralTokenPrice.min`，结果是**抵押币原生数量**（USDC 6 位）；`liquidationFeeAmount`、`uiFeeAmount`、`totalCostAmount` 同为数量口径。
- 差异：需求少写了 USD→token 的换算与"取 min 价"的选价侧，且实现是两次向下取整（applyFactor 一次、除价一次）。
- 影响：所有跨层核对（前端预览 vs 事件 vs Reader）若按需求量纲比对会差一个 `1e24` 量级；小额订单可能因两次截断使费用为 0。
- 建议定性：需求表述模糊（补写量纲与选价侧即可）

### G-09 交易者盈利上限（`MAX_PNL_FACTOR_FOR_TRADERS`）在费用体系需求中被略过，且上限分母是 vault 级共享
- 需求规范：A §4.1「交易者盈亏直接与 LP Vault 结算，协议不参与分成、不承担风险……LP 自身风险敞口由风控参数族（`MAX_PNL_FACTOR_*`、`RESERVE_FACTOR`）约束」——把 `MAX_PNL_FACTOR_*` 表述为"约束 LP 敞口"的风控参数，未说明它会**直接削减交易者已实现盈利**。
- 合约实现：`src/position/PositionUtils.sol::_getPositionPnlUsd` — 正 PnL 时按 `cappedPoolPnl / poolPnl` 等比缩放本仓 PnL；`poolPnl` 取自 `MarketUtils::getPnl(..., isLong = position.isLong(), maximize = true)`（市场 × 方向 级），而分母 `poolTokenUsd = IVault(market.vault).totalAssets() × collateralTokenPrice.min` 是**整个 LP Vault**（tx-fork 环境 26 个市场共用 2 个 vault）。
- 差异：①上限是对交易者盈利的直接削减，不只是"LP 敞口约束"；②同 vault 的其它市场提取/注入流动性会改变本市场的封顶阈值，形成跨市场耦合。
- 影响：盈利封顶时 `basePnlUsd < uncappedBasePnlUsd`，用户少拿钱且合约不发专门事件（只能靠两个字段差反推）；测试环境里别的市场的 LP 变动会让同一用例的期望 PnL 漂移。
- 建议定性：需求表述模糊 / 缺陷候选（跨市场耦合是否符合"风险隔离"意图需产品裁决）

### G-10 需求引用的旧实现片段在 v0.3.2 已不存在（`totalImpactUsd`、`updateFundingState` 现金流）
- 需求规范：A §4.1 直接贴代码「`if (values.basePnlUsd + values.totalImpactUsd < 0) { positionVault.transferOut(...) }`」并称「现有逻辑即为目标行为，无需修改」；A §3.2 / B §四称资金费由 `updateFundingState` **周期性结算净额**，并给出 `if (result.positionPaysLp > 0) incrementClaimableFeeAmount(...)` 的改造代码。
- 合约实现：v0.3.2 中 `DecreasePositionCollateralUtils::processCollateral` 的亏损支付条件是 `if (values.basePnlUsd < 0)`，`totalImpactUsd` 字段已不存在（`PositionUtils.DecreasePositionCollateralValues` 无该成员）；资金费改由 `MarketUtils::settleFundingFees(positionVault, dataStore, eventEmitter, market, negativeFundingFeeAmount, positiveFundingFeeAmount)` 在**仓位结算时**按该仓 negative−positive 净差执行（净负 → `incrementClaimableFeeAmount(..., FUNDING_FEE_TYPE)`，净正 → LP Vault 转出），`updateFundingState` 不再产生现金流。
- 差异：需求文档引用的代码坐标与函数已过时两个版本。
- 影响：按需求文档定位源码会找不到函数；§9.4 瀑布第①步的实际记账主体是 `settleFundingFees`（且用的是**实付额**而非应付额），与"周期性净额结算"的心智模型不同。
- 建议定性：设计已变更未回写文档

---

差异条数：10（G-01 ~ G-10）。其中 G-01 / G-02 / G-04 / G-05 建议按缺陷候选走复核；G-06 / G-09 需产品裁决；G-03 / G-07 / G-08 / G-10 属文档回写。

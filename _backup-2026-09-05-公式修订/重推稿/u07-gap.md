# §10 Funding 资金费 —— 需求↔实现差异台账（u07）

本组无专属需求规范文档，主要以源码为准；以下 7 条中，第 1～5 条是**源码内部的设计意图（注释 / 配置面）与实现行为冲突**，第 6～7 条是**归档需求文档与 v0.3.2 实现的冲突**。

---

### 1. `settleFundingFees` 注释称"结算给 LP"，但净支付方向的钱进的是协议费用账本，LPVault 只出不进

- 需求规范：无专属需求文档。源码自述的设计意图 —— `src/market/MarketUtils.sol` L440-L444 注释：`Settle realized position funding against the LP using the same token amounts that were applied to the position.`；归档需求《Funding Fee Breadown信息修改和SDK FE-4》（`Docs/V0.3.1/需求文档/2026-06-24_Funding-Fee-Breadown信息修改和SDK-FE-4.md`）也只描述仓位侧"直接结算进保证金"，未说明另一端归属。
- 合约实现：`src/market/MarketUtils.sol::settleFundingFees`（L445-L470）。`negAmt > posAmt` 时调用 `FeeUtils.incrementClaimableFeeAmount(..., FUNDING_FEE_TYPE)`，只写 `claimableFeeAmountKey(marketIndex, collateralToken, FUNDING_FEE_TYPE)`，代币留在 PositionVault；随后由 `src/fee/FeeHandler.sol::claimFees`（L69，permissionless）从 PositionVault 取走，再由 `withdrawFees`（L49，`onlyFeeKeeper`）转给 `FX100Keys.FEE_RECEIVER` / RewardSplitter。`posAmt > negAmt` 时才 `IVault(market.vault).transferOut(...)` 从 LPVault 出钱。`claimableFeeAmount` 在 `src/` 内只被 `FeeUtils` 读写，不进入 LP 池估值。
- 差异：资金费在"仓位净付"方向流向协议费用接收方，在"仓位净收"方向由 LPVault 承担 —— LP 单向出钱，与注释里的"against the LP"不符。
- 影响：① 任何按"LP 收取资金费"写的 LPVault 余额 / NAV 期望值都会 FAIL；② 经济上 LP 承担了资金费的负向敞口却拿不到正向收益，长期偏空 LP；③ 前端若把资金费展示为 LP 收益属误导。（注：v0.3.1 的 `updateFundingState` 也是同样的不对称路由，非 v0.3.2 引入。）
- 建议定性：缺陷候选

---

### 2. 零 OI 时源码注释说"funding update should be a no-op"，实际会抹掉 skew EMA 并推进 `fundingUpdatedAt`

- 需求规范：无专属需求文档。源码自述意图 —— `src/market/MarketUtils.sol` L494-L495 注释：`If both sides have zero OI, funding update should be a no-op. This avoids division by zero when deriving skew and per-size deltas.`
- 合约实现：`src/market/MarketUtils.sol::getNextFundingAmountPerSize`（L496-L498）`totalOpenInterest == 0` 时 `return result;`，返回的是**默认初始化的空结构**（`result.skewEMA` 全零）。调用方 `::updateFundingState`（L402-L438）在无任何守卫的情况下继续执行 `dataStore.setUint(fundingUpdatedAtKey, block.timestamp)` 与 `dataStore.setBytes32(fundingSkewEmaKey, result.skewEMA.toBytes32())`，并以三个 0 值 `emitFunding`。
- 差异：注释说 no-op，实际是"per-size 增量 no-op + 状态被覆写"：已积累的 skew EMA（`lastTime` / `lastValue` / `lastEmaValue` / `sampleInterval`）被整体清零，`fundingUpdatedAt` 被刷新。
- 影响：① 市场 OI 一旦归零（全部平仓），下一笔订单执行就把 EMA 历史清空，重新开仓后费率退回"用原始 skew"的初始化分支，费率轨迹与预期不一致；② 跨"清仓→再开仓"的 E2E 场景不能沿用旧 EMA 快照算期望值，否则误报缺陷；③ 可被用于低成本重置 skew EMA（把 OI 打到 0 再重建）。
- 建议定性：缺陷候选

---

### 3. `ConfigUtils.validateRange` 对 min/max funding factor 的上下界校验落在 uint 存储上，而实际读取路径是 int 存储 —— 边界从未生效

- 需求规范：无专属需求文档。源码自述意图 —— `src/config/ConfigUtils.sol` L133-L152 明确要求 `MAX_FUNDING_FACTOR_PER_SECOND ≤ MAX_ALLOWED_MAX_FUNDING_FACTOR_PER_SECOND (1e23)` 且 `min ≤ max`，注释标注 `FLOAT_PRECISION rate per second.`
- 合约实现：`validateRange` 只在 `src/config/Config.sol::setUint`（L242）里被调用；`Config::setInt`（L264-L283）**不做任何 range 校验**。而消费端 `src/market/MarketUtils.sol::getNextFundingAmountPerSize`（L528-L529）用 `dataStore.getInt(minFundingFactorPerSecondKey / maxFundingFactorPerSecondKey)` 读取，部署脚本 `scripts/configureMarket.ts`（L417-L431）也用 `setConfigInt` 写入（默认值里 `minFundingFactorPerSecond` 为负数，本来也无法走 uint 路径）。DataStore 的 uint 与 int 是两张独立映射。
- 差异：校验逻辑与实际读写路径不在同一张表上，等于形同虚设；funding 费率上下界可被 keeper 设成任意值（包括超过 1e23 的极端值或 `min > max`）。
- 影响：① `min > max` 时 `Calc.clamp` 会先判 `value < min → min`，返回值可能超出 `max`，费率完全失控；② 极端 `max` 可在一次更新里把仓位资金费拉到抵押品级别；③ 参数文档/边界场景清单若照抄 `MAX_ALLOWED_MAX_FUNDING_FACTOR_PER_SECOND` 作为可测边界会得到错误结论。
- 建议定性：缺陷候选

---

### 4. `THRESHOLD_FOR_STABLE_FUNDING` / `THRESHOLD_FOR_DECREASE_FUNDING` 在配置面开放，但 funding 公式从不读取

- 需求规范：无专属需求文档。源码自述意图 —— `src/config/Config.sol` L425-L426 把两个键列入 `allowedBaseKeys`（可由 keeper 配置），`src/constants/FX100Keys.sol` L155/L157 与 L841/L847 提供常量与 key 函数。
- 合约实现：全仓 `src/` 检索，两个键除常量定义与 allowlist 外**无任何读取点**；`getNextFundingAmountPerSize` 的费率只由 `fundingFloorFactor / fundingBaseFactor / min / max` 四项决定。同类残留还有：`GetNextFundingFactorPerSecondCache` 整个结构体未被使用，`GetNextFundingAmountPerSizeCache` 的 `sizeOfPayingSide` / `fundingUsd` / `fundingUsdForLongCollateral` / `fundingUsdForShortCollateral` 四个字段未被使用（GMX 自适应 funding 的遗留）。
- 差异：配置面暴露了不产生任何效果的参数。
- 影响：参数目录 / 边界场景清单会把它们当作可调 funding 参数写进用例，产生无法验证的"幽灵用例"；运营改这两个值会得到"改了没反应"的错觉。
- 建议定性：设计已变更未回写文档（GMX 遗留键未清理）

---

### 5. Reader 的资金费预览沿用 GMX"双 token 折半"假设：`multiplier = 2` 且恒取 long 侧增量

- 需求规范：无专属需求文档。源码自述意图 —— `src/reader/ReaderPositionUtils.sol` L220-L231 注释：`funding values are split based on long and short token … so when the funding values are applied in updateFundingState, they are applied twice … to avoid costs being doubled, these values are halved in MarketUtils.getNextFundingAmountPerSize` `the reader code needs to double the values`。
- 合约实现：`src/market/MarketUtils.sol::getNextFundingAmountPerSize`（L541-L578）在 FX100 单抵押品模型下**没有任何折半**（per-size 增量 = `toFactor(applyFactor(sideOIUsd, rate×dt), sideOITokens)`，无 `/2`）。但 `src/reader/ReaderPositionUtils.sol::getPositionInfo`（L156，L232-L237）仍执行 `uint256 multiplier = 2;` 并把 `nextFundingAmountResult.negativeFundingFeePerSizeDelta.long * multiplier` / `positiveFundingFeePerSizeDelta.long * multiplier` 加到 latest per-size 上 —— 既翻倍，又对空头仓位错用了 **long 侧**的增量。
- 差异：Reader 预览的"待结算资金费"= 已落账部分 + 2×(本次未落账的 long 侧增量)，与真实结算值不一致；空头仓位取错侧。
- 影响：① 前端持仓面板的 Owed/Earning、Margin 净额、杠杆分母（均以 `posInfo.pendingFundingFeesUsd` / `pendingPositiveFundingFeesUsd` 为源）系统性偏大；② 空头在"long 付、short 收"的常见 skew 下会被预览成"应付"；③ 前端-合约 parity 核对会稳定报差，差值随 `block.timestamp - fundingUpdatedAt` 增长。（属 Reader 路径，不影响真实结算金额。）
- 建议定性：缺陷候选

---

### 6. 需求文档称"合约清算判定不计应收资金费（遗留 bug）"，v0.3.2 已计入

- 需求规范：`Docs/V0.3.1/需求文档/2026-07-15_FX100-持仓面板数字口径统一规范（Margin-Net-Value-Leverage-uPnL-Funding）.md` §4.2 原文：「应收资金费——现行合约判定**不计**（遗留 bug，修复提案已交工程师，§10），本列计（如实反映结算）……此差异为**临时**，修复合入后消失。」该文自述合约基线为 `release/v0.3.0`。
- 合约实现：`src/position/PositionUtils.sol::isPositionLiquidatable`（L321，判定段 L380-L386）已显式加入 `positiveFundingFeeUsd = fees.funding.positiveFundingFeeAmount × collateralTokenPrice.min`，并计入 `info.remainingCollateralUsd = collateralUsd + positionPnlUsd + positiveFundingFeeUsd − collateralCostUsd`；注释说明"symmetric with the negative side"。v0.3.1 同位置（L379-L385）已相同，即修复早于 v0.3.2。附带精度提示：`positiveFundingFeeAmount` 本身是按 `collateralTokenPrice.max` **向下取整**算出的，这里又乘回 `.min`，min<max 时该项在清算 equity 里被系统性低估（偏保守）。
- 差异：需求文档描述的"临时差异"已消失，但文档未回写。
- 影响：按该需求文档设计的清算边界用例若仍保留"合约不计应收资金费"的期望值会误报；Net Value 与合约 equity 的差异项应只剩"标记价 vs 全平执行价"一条。
- 建议定性：设计已变更未回写文档

---

### 7. 减仓路径的资金费缺口只发事件、无兜底机制，注释指向的"保险基金"在代码中不存在

- 需求规范：无专属需求文档。源码自述意图 —— `src/position/DecreasePositionCollateralUtils.sol` L151-L154 注释：`the case where this is insufficient collateral to pay funding fees should be rare … the pool should be topped up with the required amount using an insurance fund or a similar mechanism`（v0.3.1 原文是 `using the claimable amount sent to the holding address, an insurance fund, or similar mechanism`，v0.3.2 删掉了 holding address 兜底）。
- 合约实现：`::processCollateral`（L141-L163）在 `amountPaidInCollateralToken < fees.funding.negativeFundingFeeAmount` 时，只以**实付额**调用 `settleFundingFees` 并 `emitInsufficientFundingFeePayment`；`src/` 内无任何保险基金合约或补足路径。v0.3.2 同时删除了 v0.3.1 里 `amountPaidInSecondaryOutputToken > 0 → MarketUtils.incrementClaimableCollateralAmount(holdingAddress, ...)` 的兜底分支，以及 `MarketUtils.incrementClaimableCollateralAmount / claimCollateral / batchClaimCollateral / _getClaimableFactor` 整组函数。（需澄清：v0.3.1 的 `payForCost` 从未给 `amountPaidInSecondaryOutputToken` 赋非零值，该兜底分支在 v0.3.1 本身就是不可达代码，v0.3.2 的删除是清理而非功能回退。）
- 差异：注释承诺的兜底机制（保险基金 / holding address）在两版实现中都不存在；缺口只有一条事件，静默由 LP 承担且无链上账本。
- 影响：① 破产清算 / ADL 全平场景下资金费缺口无法从链上账本盘出总额，只能扫事件；② 守恒核对（ΣΔ）在这条路径上必然不平，需要把 `InsufficientFundingFeePayment.expectedAmount − amountPaidInCollateralToken` 作为显式补偿项；③ 该分支只在「全平 + 清算/ADL」（`isInsolventCloseAllowed`）时才真正落账，其余情形整笔 revert。
- 建议定性：需求表述模糊（注释承诺的兜底机制无实现，需产品确认是否接受 LP 承担）

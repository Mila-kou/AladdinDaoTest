# §7 仓位费用 — 需求↔实现差异台账

需求侧：
- A =《2026-06-15_FX100-费用收取与分配体系全面设计规范（讨论版-2026-06-13-定稿）》
- B =《2026-07-22_FX100-费用收取与分配体系改造规范(实施版-2026-06-13)》

实现侧：`Github/fx100-contracts@release-v0.3.2`（commit `13880f2`）。

---

### G-U06-01 UI Fee：需求写「从手续费总量中扣除」，实现是额外加收

- 需求规范：A §3.1「分配逻辑」结构图，`positionFeeAmount` 下挂
  `├── uiFeeAmount ← UI 手续费（从总量中扣除）` 与
  `└── remainingFeeAmount`，`feeReceiverAmount = remainingFeeAmount × POSITION_FEE_RECEIVER_FACTOR`。
- 合约实现：`PositionPricingUtils.sol::getUiFees` 用 `sizeDeltaUsd` 独立计算 `uiFeeAmount`；
  `getPositionFeesAfterReferral` 的 `protocolFeeAmount = positionFeeAmount − affiliateRewardAmount
  − totalDiscountAmount`，**不减 uiFeeAmount**；`getPositionFees` 把 `uiFeeAmount` 作为**加项**
  计入 `totalCostAmountExcludingFunding`。
- 差异：UI Fee 不是从手续费里切给运营方，而是在手续费之外向交易者额外收取一笔。
- 影响：配了 `uiFeeReceiver` 时交易者实付高于需求口径，LP 与分账器分成不因 UI Fee 减少；
  按需求图算期望值会把 `feeReceiverAmount` / `feeAmountForPool` 算小、把 `totalCostAmount` 算小。
- 建议定性：设计已变更未回写文档（GMX v2 原口径即为附加收取；需求图与实现的资金结构不同，
  需产品确认哪一个是目标口径）

---

### G-U06-02 Pro 折扣体系在需求规范中完全缺席

- 需求规范：A §3.1/§3.7、B §六 均只描述 `positionFeeFactor`、`affiliateReward`、`traderDiscount`
  三项，全文无 Pro 等级、Pro 折扣、`PRO_DISCOUNT_FACTOR` 的任何表述。
- 合约实现：`PositionPricingUtils.sol::getPositionFeesAfterReferral` 读
  `FX100Keys.sol::proTraderTierKey(account)` / `proDiscountFactorKey(proTier)`，
  产生 `pro.traderDiscountAmount`，并以
  `totalDiscountAmount = max(pro.traderDiscountAmount, referral.traderDiscountAmount)`
  参与 `protocolFeeAmount` 减法。
- 差异：实现多出一整条按账户等级打折的链路，且与推荐折扣**取大者、只生效其一**。
- 影响：Pro 等级配置直接改变协议分成与 LP 分成；没有需求描述就没有分档标准与上限约定，
  也没有对应用例；期望值计算若忽略 Pro 折扣会在被配了等级的账户上系统性偏高。
- 建议定性：设计已变更未回写文档

---

### G-U06-03 `MIN_AFFILIATE_REWARD_FACTOR` 无上限校验，仅靠 v0.3.2 新增的 `maxAffiliateRewardFactor` 兜底

- 需求规范：A §8.3「Referral 参数」只列 `permissionedMode` / `totalRebate` / `discountShare`
  三项，无 `minAffiliateRewardFactor` 及其取值范围。
- 合约实现：`Config.sol` 把 `MIN_AFFILIATE_REWARD_FACTOR` 列入 `allowedBaseKeys`，
  但 `ConfigUtils.sol::validateRange` 对该 key **没有任何范围校验**（对照
  `PRO_DISCOUNT_FACTOR` / `POSITION_FEE_RECEIVER_FACTOR` 有 ≤100% 校验、
  `POSITION_FEE_FACTOR` 有 ≤5% 校验）。v0.3.2 在
  `getPositionFeesAfterReferral` 新增
  `maxAffiliateRewardFactor = totalDiscountFactor < 1e30 ? 1e30 − totalDiscountFactor : 0`
  并对 `adjustedAffiliateRewardFactor` 封顶，防止 `protocolFeeAmount` uint 减法下溢。
- 差异：需求未定义该参数与其边界；实现靠一层运行时封顶而非配置层校验来保证安全。
- 影响：`minAffiliateRewardFactor` 被配成大于 `1e30 − 折扣` 时，v0.3.1 会在开/平仓时下溢 revert
  （整条市场不可交易），v0.3.2 改为静默削减 Affiliate 奖励至上限。是版本行为变化，
  需要一条边界用例覆盖（配置 `minAffiliateRewardFactor` 极大 + Pro 折扣极大）。
- 建议定性：缺陷候选（配置层缺校验；v0.3.2 已加运行时兜底，建议补 `validateRange`）

---

### G-U06-04 推荐返佣拆分口径：需求按金额两步拆，实现按 factor 拆且先做基点级取整

- 需求规范：A §3.7「推荐奖励（Affiliate Reward）」：
  `affiliateRewardAmount = positionFeeAmount × referralCode.totalRebate`，
  `traderDiscount = affiliateRewardAmount × referralCode.discountShare → 返给交易者`，
  `affiliateReward = affiliateRewardAmount − traderDiscount`。
- 合约实现：`ReferralUtils.sol::getReferralInfo` 先在**基点**上算
  `traderDiscountFactor = basisPointsToFloat(floor(totalRebate × discountShare / 10000))`，
  再 `affiliateRewardFactor = basisPointsToFloat(totalRebate) − traderDiscountFactor`；
  两个金额在 `PositionPricingUtils.sol::getPositionFeesAfterReferral` 各自独立
  `Precision.applyFactor(positionFeeAmount, factor)` 向下取整。
- 差异：(a) 需求是「先算总返佣金额、再从中切给交易者」，实现是「先切 factor、再各自算金额」；
  (b) 实现多一次基点级 `floor`，折扣率分辨率只有 1bp（如 totalRebate=1500、discountShare=3333 →
  按需求为 4.9995%，实现取 499bp = 4.99%）；(c) 两次独立 floor 使
  `affiliateRewardAmount + traderDiscountAmount` 可能比按总额一次算少 1 个最小单位。
- 影响：只影响末位；但按需求公式写期望值会与链上差 1 wei，属于核对必踩的坑。
- 建议定性：需求表述模糊（需求为示意公式，实现为准；建议在需求里补 factor 拆分与取整顺序）

---

### G-U06-05 `referrerDiscountShares` 自定义覆盖 tier `discountShare` 未在需求中出现

- 需求规范：A §8.3 只给 tier 级 `discountShare` 建议值 0.50，未提 Affiliate 可自设。
- 合约实现：`ReferralUtils.sol::getReferralInfo` 读
  `referralStorage.referrerDiscountShares(affiliate)`，非 0 即覆盖 tier 的 `discountShare`；
  该值由 Affiliate 自己调 `ReferralStorage.sol::setReferrerDiscountShare` 设置（无治理审批，
  仅 `require(_discountShare <= 10000)`）。
- 差异：实现允许 Affiliate 在无治理介入的情况下把返佣中给交易者的比例改成 0~100%。
- 影响：同一推荐码下不同 Affiliate 的交易者折扣可能不同，期望值必须按
  `referrerDiscountShares(affiliate)` 实读而不能用 tier 默认值；也是一条权限面用例。
- 建议定性：设计已变更未回写文档

---

### G-U06-06 Referral `permissionedMode` 至 v0.3.2 仍未实现

- 需求规范：A §七 BUG-F02「Referral 权限模式未实现」、A §8.3 `permissionedMode = true`（主网初期）；
  B §6.2 给出 `permissionedMode` / `affiliateWhitelist` / 改造后的 `registerCode` 完整代码；
  B §十.5 自述「`permissionedMode`/`affiliateWhitelist` 尚未落地，整个 referral 模块延期」。
- 合约实现：v0.3.2 `ReferralStorage.sol::registerCode` 仍只有
  `require(_code != bytes32(0))` 与 `require(codeOwners[_code] == address(0))`，
  无 `permissionedMode` 状态变量、无白名单；`git diff` 显示 v0.3.1→v0.3.2 的 `src/referral/`
  只改了 `ReferralEventUtils.sol` 一行。
- 差异：需求要求的白名单注册在 v0.3.2 仍缺失。
- 影响：任意地址可注册推荐码并自设 `referrerDiscountShares`；配合 G-U06-05，
  返佣链路在测试网/主网初期不具备治理管控。
- 建议定性：缺陷候选（已知未修，B §十.5 已自述；本轮仅确认 v0.3.2 仍未落地）

---

### G-U06-07 清算费的非分账器部分进 LP Vault，需求写「转给清算人（Keeper）」

- 需求规范：A §3.5「清算费（Liquidation Fee）」：
  `liquidatorAmount = liquidationFeeAmount − feeReceiverAmount → 转给清算人（Keeper）`。
- 合约实现：`PositionPricingUtils.sol::getPositionFees` 把它并入池子分成——
  `feeAmountForPool = positionFeeAmountForPool + liquidation.liquidationFeeAmount
  − liquidation.liquidationFeeAmountForFeeReceiver`；
  `DecreasePositionCollateralUtils.sol::processCollateral` 将 `feeAmountForPool`
  `transferOut` 到 `market.vault`（LP Vault）。全仓库检索
  `liquidationFeeAmount` 无任何转给清算人的路径。
- 差异：清算费扣掉分账器份额后归 LP，而非归清算人。
- 影响：清算激励缺失（Keeper 只拿执行费），且按需求算期望值会把清算后的 LP Vault 余额算少、
  把 Keeper 收款算多。
- 建议定性：缺陷候选（激励设计缺口；也可能是有意变更，需产品确认后回写需求）

---

### G-U06-08 清算费基数：需求按保证金，实现按仓位规模

- 需求规范：A §3.5 `liquidationFeeAmount = collateralAmount × LIQUIDATION_FEE_FACTOR`；
  B §七参数表「`LIQUIDATION_FEE_FACTOR(market)` 0.003 清算费 0.3% 保证金」。
- 合约实现：`PositionPricingUtils.sol::getLiquidationFees`
  `liquidationFeeUsd = applyFactor(sizeInUsd, liquidationFeeFactor)`，
  `liquidationFeeAmount = Calc.roundUpDivision(liquidationFeeUsd, collateralTokenPrice.min)`
  —— 基数是**仓位 USD 规模**（清算路径传 `position.sizeInUsd()`），不是保证金。
- 差异：基数不同；杠杆越高两者差距越大（10x 杠杆下实现值约为需求值的 10 倍）。
- 影响：直接改变清算时从保证金里扣走的金额与剩余退还额；A/B 的 0.3% 建议值按保证金口径给出，
  照搬到按仓位规模的实现上会显著高估清算费率。（本条锚点在 §7 的同一文件，
  公式正文归 §8 清算费；此处登记以免遗漏。）
- 建议定性：缺陷候选（参数口径不一致，至少需要按实现口径重设 `LIQUIDATION_FEE_FACTOR` 建议值）

---

### G-U06-09 需求公式漏掉抵押品折算与选价侧

- 需求规范：A §3.1
  `positionFeeAmount = sizeDeltaUsd × POSITION_FEE_FACTOR / FLOAT_PRECISION`。
- 合约实现：`PositionPricingUtils.sol::getPositionFeesAfterReferral`
  `fees.positionFeeAmount = Precision.applyFactor(sizeDeltaUsd, positionFeeFactor)
  / collateralTokenPrice.min` —— 多一步除以**抵押品最低价**、并因此多一次向下取整。
- 差异：需求公式停在 USD 标度，未说明折算成抵押代币数量、也未指定选价侧。
- 影响：直接照需求公式写期望值会得到 `1e30` 标度的 USD 而非 token 数量，量级差 `1e(30−decimals)`；
  选价侧写成 `max` 或 `midPrice` 会让费用偏小。
- 建议定性：需求表述模糊（需求只写费率语义，数值以实现为准）

---

### 说明：确认一致、不计入差异的两项

- **两档费率 `positionFeeFactorKey(marketIndex, balanceWasImproved)`**：A §3.1 与 B §6.1 明确
  「本期保留原两档模式、不改 key、不动 src，上线时两档配同值」，v0.3.2 实现完全一致
  （`FX100Keys.sol::positionFeeFactorKey`）。属部署参数核对项，不是实现差异。
- **折扣不产生转账**：A §3.7 写「返给交易者」，实现以
  `totalDiscountAmount` 冲减 `totalCostAmount`（交易者少付），资金效果等价。

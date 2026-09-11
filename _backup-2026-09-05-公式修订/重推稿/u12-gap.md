# u12（§21 全字段速查 · §22 v0.3.2 实现与展示口径差异 · §23 E2E 预期值计算顺序）需求↔实现差异台账

本组任务书标注「无专属需求规范」，但 §22 需要逐条判读 37 个改动文件，过程中命中了三份仍在生效的需求文档与实现不一致的地方，一并记录在此。凡实现已按审计缺陷单修复、需求与实现一致的条目（R2-B03 / R2-B15 / R2-B17 / R2-B19 / R4-B01 / R4-B02 / R4-B03 等）不计入本台账，只写进 §22 的版本差异表。

---

### 1. 资金费净额的归集时点与依据被整体改写，费用体系规范仍停在 v0.3.1 口径

- 需求规范：`Docs/V0.3.1/需求文档/2026-07-22_FX100-费用收取与分配体系改造规范(实施版-2026-06-13).md` §四「唯一的 src 合约改动：资金费净额路由」——「资金费净额不再直接转给 LP Vault，而是计入 `claimableFeeAmount`」，给出的改法是在 `MarketUtils.updateFundingState` 里 `if (result.positionPaysLp > 0) { FeeUtils.incrementClaimableFeeAmount(..., uint256(result.positionPaysLp)) }`；§八 实施清单 P0-1 同样写作「`positionPaysLp` 改为 `incrementClaimableFeeAmount`」。
- 合约实现：`src/market/MarketUtils.sol::updateFundingState` 已不含任何资金流转（只刷 funding 指数、写 skew EMA、发 `Funding` 事件）；归集改由新函数 `MarketUtils::settleFundingFees` 承担，触发点是**仓位结算**（`IncreasePositionUtils::increasePosition`、`DecreasePositionCollateralUtils::processCollateral`），依据是**该仓位的 `negativeFundingFeeAmount − positiveFundingFeeAmount` 净差**，与 `positionPaysLp` 无关。
- 差异：规范说"市场级 `positionPaysLp` 在 funding 更新时归集"，实现是"仓位级净差在仓位动作时归集"，触发时点、计算依据、金额来源三者全变。
- 影响：按规范写的资金守恒式和监控（"每次订单执行后 claimableFee 增加 = positionPaysLp"）在 v0.3.2 上必然对不上；E2E 若仍在 `updateFundingState` 之后断言 Vault 余额变化会全数 FAIL。
- 建议定性：设计已变更未回写文档

### 2. 规范断言的「`positionPaysLp ≥ 0`，LP→持仓分支不可达」在 v0.3.2 已不成立

- 需求规范：同上文档 §四「为什么 `else` 分支可保留不动」——「两项均 ≥ 0……故 `positionPaysLp ≥ 0`，`else`（LP→持仓支付）分支不可达，保留为防御代码即可」。
- 合约实现：`MarketUtils::settleFundingFees` 的判据不是 `positionPaysLp`，而是单仓两个方向的实收实付。`positiveFundingFeeAmount > negativeFundingFeeAmount`（即该仓位是资金费的净收取方）是常规情形，此时执行 `IVault(market.vault).transferOut(collateralToken, positionVault, positive − negative)`，LP→PositionVault 的转账**是热路径而不是防御代码**。
- 差异：规范判定为不可达的分支，在新结算模型下是日常执行路径。
- 影响：把该分支当"死代码"跳过覆盖的测试设计会漏掉 LP 出金路径；风控/监控若假设"LP 只收不付"，会把正常出金误报为异常。
- 建议定性：缺陷候选（文档层面的不可达假设已失效，且据此设计的监控口径会误报）

### 3. 市场级 funding 累计与仓位级已实现 funding 之间的取整差没有兜底科目

- 需求规范：同上文档 §四把资金费净额当成一条单一账目（`positionPaysLp` 全额进 `claimableFeeAmount`），未定义"累计值 ≠ 实际结算值"时的差额去向。
- 合约实现：`src/market/MarketUtils.sol::getNextFundingAmountPerSize` 的新注释明确写着 `positionPaysLp` 「is emitted for observability only and is not used for settlement because positions round their realized funding independently」；仓位侧 `MarketUtils::getFundingAmount` 支付端 `ceil` + `collateralPrice.min`、收取端 `floor` + `collateralPrice.max`，与市场级按 mid 价的累计口径系统性不等。
- 差异：市场累计与实际现金流的差额被承认存在，但既不入账也不对账。
- 影响：LP 侧长期会积累一个方向不定的尾差，没有任何科目承接；E2E 的资金守恒断言必须显式给这条尾差留容差，否则会持续报假缺陷。
- 建议定性：缺陷候选（需产品/合约明确尾差归属，或至少给出容差上界）

### 4. 负资金费支付不足的兜底通道被删除，源码注释指向一个尚不存在的机制

- 需求规范：本组无对应需求条文；v0.3.1 的实现本身就是当时的事实规范——差额通过 `MarketUtils.incrementClaimableCollateralAmount` 记到 `HOLDING_ADDRESS` 的可领账本，源码注释写「the pool should be topped up ... using the claimable amount sent to the holding address, an insurance fund, or similar mechanism」。
- 合约实现：`src/position/DecreasePositionCollateralUtils.sol::processCollateral` 中 claimable collateral 那一整段已随机制删除；注释改成「using an insurance fund or a similar mechanism」，但 v0.3.2 `src/` 内没有任何保险基金合约或对应通道，差额只剩一条 `InsufficientFundingFeePayment` 事件。
- 差异：唯一实际存在的兜底路径被删，替代方案只停留在注释里。
- 影响：抵押品不足以支付负资金费时，LP 侧直接承担缺口且无记录科目；相关用例只能断言事件，无法断言资金补齐。
- 建议定性：缺陷候选

### 5. `MIN/MAX_DYNAMIC_SPREAD` 的链上交叉校验未实施，实现改为静默归一

- 需求规范：`Docs/v0.3.2/需求文档/2026-08-18_实施方案：Dynamic-Spread-允许为负+清算-ADL-隔离（更新版）.md` §五「配置护栏」——「考虑到这是直接决定'最多倒贴多少钱'的风控参数，建议**至少加链上校验**，哪怕只是一个简单的 `require`」，并建议把「`minDynamicSpread` 跟 `minSkewImpactKey` 现有值要配套」纳入校验范围。
- 合约实现：`src/pricing/PositionPricingUtils.sol::getDynamicSpread` 不做校验，只在读值后静默归一：`if (maxDynamicSpread < minDynamicSpread) { maxDynamicSpread = minDynamicSpread; }`；写入侧 `src/config/Config.sol::setInt` 完全不调用 `ConfigUtils.validateRange`（与 Zenith R8-B01 记录的现象同源），两个 key 既无范围校验也无相互校验。
- 差异：需求要求写入时 `require`，实现是读取时静默夹紧；配置写反（max < min）不会回退，而是被悄悄改成 `max = min`，结果点差恒等于 `minDynamicSpread`。
- 影响：参数误配不会在写入环节暴露，只会以"所有成交价都带同一个固定点差"的形式表现，排查成本高；这正是需求文档估算单笔可达 $8,000+ 量级的风险场景。
- 建议定性：缺陷候选

### 6. 「两个键默认 0 就退回 floor-at-0 效果」的表述与实现不符

- 需求规范：同上文档 §8.3——「需把 `MIN_DYNAMIC_SPREAD/MAX_DYNAMIC_SPREAD`（每市场 × long/short）加进 DataStore 读取……否则 8.1 的 clamp 没有参数来源、**默认 0 又退回 floor 效果**」。
- 合约实现：`PositionPricingUtils::getDynamicSpread` 在两个键都未配置时得到 `minDS = maxDS = 0`，`Calc.clamp(raw, 0, 0)` 恒返回 **0**——不仅负点差被抹掉，**正点差也被抹掉**，成交价等于裸 Oracle 价。旧版 `max(0, raw)` 只抹负值、保留正值，两者不等价。
- 差异：需求把 clamp(0,0) 类比成旧的 floor-at-0，实际是"点差整体失效"，比 floor 严格得多。
- 影响：新建市场（含 Mock Market Bundle）若漏配这四个值，点差、动态价差相关的全部用例都会以"点差恒为 0"通过，是典型的假通过；前端若照此表述实现，也会得到与链上不同的预览值。
- 建议定性：需求表述模糊（同时是高优先级配置陷阱，§22.1 已单列一行，TestCode CT-BASE 已有"非双零"断言）

### 7. `MAX_SUBACCOUNT_SLOTS` 的目标值在需求侧尚未收敛，实现固定为 4

- 需求规范：`Docs/v0.3.2/需求文档/2026-08-16_子账户槽位数量上限（MAX_SUBACCOUNT_SLOTS）设计讨论.md`——「产品側提出……上线时想只允许 1 个槽位同时生效」；同文记录「产品讨论里提到的 5……仓库里也没有任何地方出现过'5'这个数字，需要核对一下最初'5'这个说法的来源文档」。
- 合约实现：`src/subaccount/SubaccountUtils.sol` 的 `uint256 public constant MAX_SUBACCOUNT_SLOTS = 4`（编译期常量，`src/reader/Reader.sol` 再引用一次），`Config` 白名单里没有任何对应可配置键。
- 差异：产品目标 1、讨论稿曾提 5、实现是 4，且不可配置。
- 影响：§21.3 与 §22.4 只能按当前实现写 4；若产品裁决落到 1，需重新编译部署 `SubaccountUtils` / `SubaccountRouter` / `SubaccountRelayRouter` / `Reader` 四个合约，相关用例与文档全部要改。
- 建议定性：需求表述模糊（待产品裁决，本轮文档按实现写 4 并注明）

### 8. `removeSubaccount` 不释放槽位——已确认 by design，但与"槽位上限"的产品语义存在张力

- 需求规范：同上讨论文档引用 `docs/bugs/BUGS.md` R6-B01：「`removeSubaccount`（按地址撤销）**不释放槽位**，只有 `removeSlot`（按名字）才真正腾出容量。工程师已确认 by design」。
- 合约实现：`src/subaccount/SubaccountUtils.sol::removeSubaccount` 只把 `subaccountSlotSubaccountKey` 置零，保留 `subaccountSlotActiveKey = true` 与槽位名；`::removeSlot` 才会 `removeString/removeAddress/removeBool` 三删。
- 差异：需求与实现一致（by design），但"撤销子账户"这个用户动作不会释放容量，与"最多 N 个槽位"的直觉相反。
- 影响：槽位换绑用例必须走"`removeSubaccount` + `removeSlot`"两步，只调前者会在下次 `addSubaccount` 命中 `MaxSubaccountSlotsExceeded`；本组的 §21.3 / §22.4 只登记上限与回退分支，不展开该交互。
- 建议定性：需求表述模糊（行为已确认，但产品语义需在页面文案层澄清）

---

## 本组未展开、留给相邻组的交叉引用

- §19.2 末尾仍写着「`positionPaysLp > 0` 时当前实现累加 `FUNDING_FEE_TYPE` 可领取账本；`positionPaysLp < 0` 时 LPVault 向 PositionVault 转账」，这是 v0.3.1 口径，与本文档 §10.6 及本组 §22.2 的结论冲突。本组不改 §19，已在 §22.2 与本台账第 1、2 条记录，请负责 §19 的小组按 `MarketUtils::settleFundingFees` 重写。
- §3.1 只写了 `getIncreaseOrderSize` 的预解析式而未标注它会被 `getExecutionPriceForIncrease` 覆盖。本组 §21.1 已按源码拆成「预解析 / 最终」两行并显式标注覆盖关系，§23.1 步骤 7 也补了回写步骤；§3 仍需由对应小组同步。

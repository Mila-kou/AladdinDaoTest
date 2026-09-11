# u11 需求↔实现差异台账（§17 仓位全字段与保证金口径 · §19 Funding 展示字段 · §20 市场与风险展示字段）

需求规范来源：
- A =《2026-07-15_FX100-持仓面板数字口径统一规范（Margin-Net-Value-Leverage-uPnL-Funding）.md》（Gordon，合约基线自述为 `release/v0.3.0`）
- B =《2026-07-16_FX100-持仓面板数字口径统一规范-验证.md》——**该文件正文为 `<empty-block/>`，无可核内容**；本组无法用它交叉验证 A 的任何结论，凡依赖“验证篇”的判定一律未核实。

实现基线：`Github/fx100-contracts@release-v0.3.2`（对比 `release-v0.3.1`）。

---

### 1. 清算判定已计入应收资金费，需求文档仍写作“待修复的临时差异”

- 需求规范：A §4.1「与合约清算判定的临时差异（重要）」：「现行合约判定只扣应付、不计应收（GMX 语义漂移遗留……），修复提案已交合约工程师（§10）。修复合入前，判定恒比 Margin/Net Value 读数保守」；A §10 亦称「合约侧……清算判定不计（PositionUtils.sol:378）」。
- 合约实现：`src/position/PositionUtils.sol::isPositionLiquidatable` 已包含
  `uint256 positiveFundingFeeUsd = fees.funding.positiveFundingFeeAmount * cache.collateralTokenPrice.min;`
  `info.remainingCollateralUsd = collateralUsd + positionPnlUsd + positiveFundingFeeUsd - collateralCostUsd;`
  该分支在 **v0.3.1 已经存在**（v0.3.1↔v0.3.2 该段无 diff）。
- 差异：需求描述的“判定不计应收”缺陷在被测基线上早已修复，A 的过渡期口径与 FAQ Q4/Q10 的“临时例外”表述整体过期。
- 影响：按 A 写用例会预期“清算比展示早触发（少算应收）”，实际两边同口径，会把正常行为报成缺陷；反向也会掩盖真正的“判 / 执 / 显”不一致。
- 建议定性：设计已变更未回写文档

---

### 2. Margin 列名与本文档 `marginToken` / 链上 `collateralAmount` 三处同名不同数

- 需求规范：A §0/§4.1「Margin = 链上抵押品 + 资金费净额」；A §5「同一个词在任何界面必须是同一个数。下表任何一行对不上 = bug」。
- 合约实现：链上无 Margin 字段。`Position.Numbers.collateralAmount`（`src/position/Position.sol`）是未结算原值；净额值只能由 `collateralAmount` 与 `PositionPricingUtils.PositionFees.funding.{negative,positive}FundingFeeAmount` 派生（`src/pricing/PositionPricingUtils.sol::getFundingFees`）。
- 差异：需求把“Margin”绑定到净额口径，而链上原值与调整保证金弹窗操作的对象是 `collateralAmount`，两者在同一页面并存。
- 影响：核对脚本若按名字取值，会把 `collateralAmount` 当 Margin，Margin/Leverage/NetValue 三列连环对不上；差额恰为资金费净额，容易被误判为取整误差。
- 建议定性：需求表述模糊（已在 §17.3 补命名对照表，要求链上原值另起列名）

---

### 3. `updateFundingState` 不再产生 LP 现金流，需求与旧文档的 `positionPaysLp` 口径失效

- 需求规范：A §2/§3 反复以「链上合约（GMX/FX100）……资金费是挂账的」描述结算模型，并在 §4.1 用 `IncreasePositionUtils.sol:240` / `DecreasePositionCollateralUtils.sol:132` 两处 `+= positiveFundingFeeAmount` 作为“两侧都进保证金”的依据——但未涉及 LP 侧现金流何时发生。
- 合约实现：`src/market/MarketUtils.sol::updateFundingState` 在 v0.3.2 删除了 `PositionVault` 参数与全部 `incrementClaimableFeeAmount` / `transferOut` 分支，只推进索引、写 `fundingUpdatedAt`、写 `skewEMA`、发 `Funding` 事件；`GetNextFundingAmountPerSizeResult.positionPaysLp` 注释降级为 “informational accrued amount only”。现金流改由新增的 `MarketUtils.sol::settleFundingFees` 在仓位结算时按该仓 `negative − positive` 净差执行（调用点：`IncreasePositionUtils.sol::processCollateral`、`DecreasePositionCollateralUtils.sol::processCollateral`）。
- 差异：LP 侧资金流的**触发时机**由“市场 Funding 更新”改为“仓位动作”，金额由“市场聚合 `positionPaysLp`”改为“单仓净差之和”。
- 影响：以 `Funding` 事件的 `positionPaysLp` 为准做 LP 守恒断言会全部失败；`FUNDING_FEE_TYPE` 账本与 Vault 余额的变动时点也随之改变。市场级聚合与逐仓净差之和因逐仓独立取整（应付 ceil、应收 floor）必然存在尾差，不能互相反推。
- 建议定性：设计已变更未回写文档（v0.3.2 文档 §10.6 已改对，§19.2 此前仍写 v0.3.1 行为，本次同步）

---

### 4. Reader 的待结算资金费预览把增量翻倍，且空头取多头侧增量

- 需求规范：A §4.1 数据源「`posInfo.collateralUsd − posInfo.pendingFundingFeesUsd + posInfo.pendingPositiveFundingFeesUsd`（三字段均已存在）」；A §5 要求「Margin/NetValue 两列加入 bit-exact 断言（标记价口径可精确复算）」——即默认 Reader 返回的挂账资金费就是链上会扣的数。
- 合约实现：`src/reader/ReaderPositionUtils.sol::getPositionInfo`
  ```
  uint256 multiplier = 2;
  latestNegativeFundingFeePerSize += nextFundingAmountResult.negativeFundingFeePerSizeDelta.long * multiplier;
  latestPositiveFundingFeePerSize += nextFundingAmountResult.positiveFundingFeePerSizeDelta.long * multiplier;
  ```
  注释称该乘 2 是为抵消 `MarketUtils.getNextFundingAmountPerSize` 对双 Token 市场的折半，但 v0.3.2 的 `MarketUtils.sol::getNextFundingAmountPerSize` 中 `negativeFundingFeePerSizeDelta` / `positiveFundingFeePerSizeDelta` **没有任何折半**（`Precision.toFactor(Precision.applyFactor(OIUsd, rate × dt), OIInTokens)`）。同时这两行**恒取 `.long` 侧增量**，未按 `position.isLong()` 分流。v0.3.1 完全相同。
- 差异：Reader 预览的 `negativeFundingFeeAmount` / `positiveFundingFeeAmount` 相对链上实际结算值，对“自上次 `updateFundingState` 起未入库的那一段”多算一倍；空头仓位这一段还用错了侧别（多头费率与多头 OI）。
- 影响：Margin / Net Value / Leverage 的 bit-exact 断言在“距上次 Funding 更新有间隔”时必然对不上，间隔越长偏差越大；空头仓位方向也可能错（多头付、空头收时，空头会被预览成“也在付”）。这是**两版皆有的实现缺陷**，不是版本滞后。
- 建议定性：缺陷候选（高优先级；建议单独提缺陷单，链上实际扣款以 `PositionFeesCollected` 事件为准）

---

### 5. 零 OI 时 Funding「no-op」不成立：`fundingUpdatedAt` 照刷、skewEMA 被清零、事件照发

- 需求规范：A 未直接规定零 OI 行为；本文档 v0.3.1/v0.3.2 §19.3 写「Long OI 与 Short OI 同时为 0 时 Funding 更新应为 no-op」，源码注释同样写 “funding update should be a no-op”。
- 合约实现：`src/market/MarketUtils.sol::getNextFundingAmountPerSize` 在 `totalOpenInterest == 0` 时返回**零值 result**（含零值 `skewEMA`）；但 `::updateFundingState` 不因此提前返回，仍执行
  `dataStore.setUint(fundingUpdatedAtKey, block.timestamp)`、
  `dataStore.setBytes32(fundingSkewEmaKey, result.skewEMA.toBytes32())`（即写入 `bytes32(0)`，清掉已有 EMA）、
  `MarketEventUtils.emitFunding(marketIndex, 0, 0, 0)`。
  只有四次 `applyDeltaTo*FundingFeePerSize` 因 `delta == 0` 早退不写库。
- 差异：源码注释与文档所称的 “no-op” 只覆盖 per-size 索引，不覆盖时间戳、EMA 与事件。
- 影响：① 市场 OI 归零再复开后，skew EMA 从零重建，历史记忆丢失，首次费率直接采用瞬时 skew；② 零 OI 期间时间戳被持续推进，等于把空窗期从计费 duration 中抹掉；③ 用例断言“零 OI 时 Funding 完全不变”会误报。
- 建议定性：缺陷候选（EMA 被无 OI 的更新清零，属实现与注释不符）

---

### 6. Net Value 的合约对照量在 v0.3.2 只剩一处口径差（PnL 选价），需求写的是两处

- 需求规范：A §4.2「合约清算判定用的 equity（`remainingCollateralUsd`）和本列公式结构相同，但有两处口径差：① PnL——合约用全平执行价……② 应收资金费——现行合约判定不计（遗留 bug）……此差异为临时，修复合入后消失」。
- 合约实现：`src/position/PositionUtils.sol::isPositionLiquidatable` 已计应收（见差异 1），故第 ② 条不成立。第 ① 条成立且仍在：`getExecutionPriceForDecrease` 产出的含点差执行价，且清算路径 `allowNegativeSpread = false`。另有需求未提到的第三处差：合约 equity 扣的是 `fees.totalCostAmount`（= 仓位费 + UI 费 − `totalDiscountAmount` + 应付 Funding，`PositionPricingUtils.sol::getPositionFees`），而 A §4.2 的 Net Value 只扣“平仓手续费”，未含 UI 费与折扣项。
- 差异：需求列出的两处差异，一处已消失、一处仍在，另有一处（UI 费 / 折扣）未列出。
- 影响：用 A §4.2 的“两处差异且清算恒更保守”做方向性断言会失准——在有 UI 费或有折扣的账户上，Net Value 与合约 equity 的大小关系不再单向。
- 建议定性：设计已变更未回写文档 + 需求表述不完整

---

### 7. 需求的“平仓手续费”是单一费率，合约是随 `balanceWasImproved` 切换的双档费率

- 需求规范：A §8 第 3 项「closeFee 用市场平仓费率×size（worst-case 费率回退链与 `leverage.ts getPositionFeeRate` 一致）」。
- 合约实现：`src/pricing/PositionPricingUtils.sol::getPositionFeesAfterReferral` 按 `balanceWasImproved` 选择 `positionFeeFactor` 档位，而 `balanceWasImproved` 由 `::getDynamicSpread` 在算完点差后才确定（`PositionUtils.sol::getExecutionPriceForDecrease` 传出）。
- 差异：展示层无法在不模拟点差的前提下确定实际档位，只能取 worst-case。
- 影响：Net Value 与实际到手金额存在一个费率档位的系统性偏差（方向恒为“展示更低”），bit-exact 断言不成立，只能给容差或改用 Reader 预览。
- 建议定性：需求表述模糊（worst-case 是合理近似，但需求未声明它不可 bit-exact）

---

### 8. Claimable Collateral 通道与 secondary output 在 v0.3.2 整体删除（需求侧未覆盖）

- 需求规范：A §4.1「GMX 原版的 claimable 领取通道在 fx100 是遗留死键，`CLAIMABLE_FUNDING_AMOUNT` 无任何写入方」——需求只谈到**资金费**的 claimable 死键，未涉及**抵押品** claimable 通道与减仓 secondary output。
- 合约实现：v0.3.2 `src/market/MarketUtils.sol` 删除 `incrementClaimableCollateralAmount` / `claimCollateral` / `batchClaimCollateral` / `_getClaimableFactor`，`FX100Keys` 中 `claimableCollateralAmountKey` / `CLAIMABLE_COLLATERAL_DELAY` / `CLAIMABLE_COLLATERAL_TIME_DIVISOR` 一并消失（v0.3.2 全仓 grep 无命中）；`PositionUtils.DecreasePositionCollateralValuesOutput` 删除 `secondaryOutputToken` / `secondaryOutputAmount`；`DecreasePositionCollateralUtils.PayForCostResult` 删除 `amountPaidInSecondaryOutputToken`，同文件 `::processCollateral` 中把欠付资金费转给 `HOLDING_ADDRESS` 的兜底分支删除；`PositionEventUtils.sol::emitInsufficientFundingFeePayment` 由 4 个 `uintItems` 减为 3 个。
  注意：需求点名的 `CLAIMABLE_FUNDING_AMOUNT` 常量**仍留在 `src/constants/FX100Keys.sol`**，依旧无写入方——这一条需求陈述在 v0.3.2 仍然成立，不要与上面被删除的 collateral 通道混为一谈。
- 差异：需求侧的 claimable 讨论只覆盖资金费死键，抵押品 claimable 与 secondary output 的整体删除无对应需求条目。
- 影响：旧 ABI / 索引器解析 `InsufficientFundingFeePayment` 与减仓输出会读到错位或缺失字段；页面若仍保留 claim collateral 入口会调用不存在的方法；配置与索引项需清理。
- 建议定性：设计已变更未回写文档

---

### 9. 需求未覆盖：`PositionIncrease` / `PositionDecrease` 事件字段在 v0.3.2 重排且 `dynamicSpread` 改为有符号

- 需求规范：A §5 要求「前端自动化核对（scrapePanel / FRONTEND_VERIFICATION）按本表逐格核对」，但未涉及事件字段布局。
- 合约实现：`src/position/PositionEventUtils.sol::emitPositionIncrease` / `::emitPositionDecrease` 的 `uintItems` 由 16 减为 15；`dynamicSpread` 由 `uint256` 改 `int256`，从 `uintItems[13]` 迁至 `intItems[1]`（Increase）/ `intItems[3]`（Decrease）；`orderType` 由 `[14]` 前移到 `[13]`，`increasedAtTime` / `decreasedAtTime` 由 `[15]` 前移到 `[14]`。
- 差异：需求侧的核对清单按“列名 ↔ 数值”组织，未随事件 schema 变化更新。
- 影响：按下标解析的核对脚本会把 `orderType` 读成 `dynamicSpread`、把 `increasedAtTime` 读成 `orderType`；按 `uint256` 解析负点差会得到接近 2^256 的巨值。属静默错值，不会报错。
- 建议定性：设计已变更未回写文档（本次已补入 §17.8）

---

### 10. `Reader.SubaccountInfo` 中部插入两个字段，破坏按位置解码的调用方

- 需求规范：A 未涉及（子账户不在持仓面板口径范围内），此条为“实现变更需回写”的补充记录。
- 合约实现：`src/reader/Reader.sol::SubaccountInfo` 在 `isAuthorized` 之后插入 `string slot` 与 `bool isSlotActive`，其后全部字段位置后移；`::getSubaccountInfo` 的授权判定也由 `containsAddress(subaccountListKey)` 改为遍历 `MAX_SUBACCOUNT_SLOTS` 匹配 slot，且 `subaccount == address(0)` 时整段跳过（`isAuthorized` 恒 false）。新增 `::getSubaccountSlots`。
- 差异：返回结构体中部插字段，不是尾部追加。
- 影响：按元组位置解码（而非按 ABI 名字）的脚本会整体错位。
- 建议定性：设计已变更未回写文档

---

### 11. 需求「Margin 不随价格变」在合约层成立，但 Reader 读到的 Margin 会随时间与价格变

- 需求规范：A §6 T2「Margin | 100 − 3 + 1 | 98.00（不随价格变——这就是"保证金"该有的样子）」。
- 合约实现：`Position.collateralAmount` 确实不随价格变；但需求定义的 Margin 含资金费净额，而净额的两个 Token 数量由 `MarketUtils.sol::getFundingAmount` 用 `collateralTokenPrice.min` / `.max` 作除数计算，且分子中的 `latest*FundingFeePerSize` 通过 Reader 的虚拟增量随出块时间持续增长（`ReaderPositionUtils.sol::getPositionInfo`）。
- 差异：需求的“不随价格变”只对抵押品本体成立，对净额口径的 Margin 不成立——它随抵押品价格（USDC 脱锚时）与经过时间同时变化。
- 影响：用例若断言“价格变动后 Margin 不变”，在稳定币价格有 min/max 差或跨了区块的场景会误报。需求 §6 的示例把资金费当常量，掩盖了这一点。
- 建议定性：需求表述模糊

---

### 12. 需求的验证篇为空，A 的多条结论无第二来源

- 需求规范：B《持仓面板数字口径统一规范-验证》文件正文仅有 `<empty-block/>`（除 front-matter 外无内容）。
- 合约实现：不适用。
- 差异：本组指定的两篇需求规范中，验证篇没有可核对的内容。
- 影响：A 中依赖“已复验通过”的论断（§9 各项截图验收、数值自洽、`getPositionMarginUsd` 已按净额实现等）在本工作区内无法二次确认；本次改写对这些论断一律只采纳其**语义与列名**，公式体全部回源码。A 自述基线为 `release/v0.3.0`，与被测 v0.3.2 相隔两个版本，其 file:line 引用一律未按行号采信。
- 建议定性：需求表述模糊（文档缺失，已在 §17 开头声明取舍规则）

---

### 13. `sizeInTokens` 精度：本文档旧表述写死 1e18，实现按 index token 登记 decimals

- 需求规范：A 未直接规定；本文档 v0.3.1/v0.3.2 §17.1 写「`sizeInTokens` | 标的 × 1e18 | 所有市场统一按 18 位仓位精度」，§17.2 写 `displaySizeToken = sizeInTokens / 1e18`，§21 速查表「Size Token 展示 `sizeInTokens / 1e18` | 所有标的统一 18 位」同口径。
- 合约实现：`sizeInTokens` 是 index token 的 **raw 单位**，没有任何归一到 1e18 的换算——`PositionUtils.sol::getIncreaseOrderSize` / `::getDecreaseOrderSize` 用 `sizeDeltaUsd / indexTokenPrice` 得出，而 oracle 价格本身是「USD×1e30 / raw token」，因此精度完全由 index token 的注册 decimals 决定。
- 当前基线核实：`TestCode/config/mock-resources.json` 三个 fork 的 index token（FXMOCK）均登记 **18 位**（同文件出现的 `decimals: 8` 是 Mock Oracle 的价格源精度，不是 token 精度；CLAUDE.md 亦记「WBTC 合成 index token 登记修正 8→18 位」）。故当前基线上 `/1e18` 的数值结果恰好正确。
- 差异：文档把「当前基线的巧合」写成了「协议约定」。一旦接入非 18 位 index token（合成资产、8 位包装币），`/1e18` 的展示与断言会整体错 10^(18−d) 倍，而且不会报错。
- 影响：本次已在 §17.1 / §17.2 改为「以 index token 登记 decimals 为准（当前基线 18 位）」；**§1.1 与 §21 速查表两处仍写「所有标的统一 18 位」，属其它单元章节，需一并同步**。
- 建议定性：文档表述与实现不符（当前基线数值一致，不影响本轮执行，但属静默错值风险）

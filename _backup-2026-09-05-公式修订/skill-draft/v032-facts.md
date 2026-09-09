# 当前 primary 事实卡：相对 @v0.3.1 快照的「影响核对」变更

> 主测基线以 `Docs/contract-releases/CURRENT.json` `primary` 为准。本卡按 `primary.repoPath` 源码与详解层 `TestCase/E2E/ContractCodeSummary/<release>/FX100-核心字段计算公式.md` §22（37 文件 diff 逐条判读）提炼，只收**改变断言**的条目；行号仅定位、以函数名为准。指针缩写：核心 = 同目录 `FX100-核心字段计算公式.md`，前端 / Keeper = 同目录对应文档，台账 = `FX100-需求与实现差异台账.md`（uNN-k = 第 N 组第 k 条）。@v0.3.1 专有的路由/地址/键位见 `v031-facts.md`。

## 1. 结算与资金流（Funding · claimable · Vault）

| 变了什么 | 对断言的影响 | 锚点 | 指针 |
|---|---|---|---|
| Funding 现金流时点：`updateFundingState` 只刷 per-size 指数 / `fundingUpdatedAt` / `skewEMA` 并发 `Funding`，**不动钱**；现金流由 `settleFundingFees` 在**仓位结算**时按该仓 `negative − positive` 净差单向搬 | 「订单执行 → Vault 余额变化」断言全废，按仓位动作逐笔核；@v0.3.1「`positionPaysLp>0` 记 claimable / 否则 LPVault 转出」口径作废 | `MarketUtils.sol::updateFundingState` / `::settleFundingFees` | → 核心 §10.6-10.7、§22.2；台账 u12-1/2 |
| settle 入参不对称：加仓传 `fees.funding.negativeFundingFeeAmount`（**应付**）；减仓/清算/ADL 传 `amountPaidInCollateralToken`（**实付**）；应收位两路都传 `positiveFundingFeeAmount` | 减仓缺口只发 `InsufficientFundingFeePayment`（uintItems 3），无补偿科目、LP 承担；该分支只在「全平 + 清算/ADL」落账，其余整笔 revert；加仓不足则整笔 revert、无部分支付 | `IncreasePositionUtils.sol::processCollateral`（:219）/ `DecreasePositionCollateralUtils.sol::processCollateral`（:141） | → 核心 §10.7、§23.2 步 15；台账 u07-7 |
| 资金去向不对称：净付 → `FUNDING_FEE_TYPE` claimable（钱留 PositionVault，**LPVault 不增**）；净收 → LPVault `transferOut` 到 PositionVault | 两方向期望式不同：净付「LPVault 不变 + claimable +净差」、净收「LPVault −净差」；「LP 收到资金费」必 FAIL（两版皆然） | `MarketUtils.sol::settleFundingFees` | → 核心 §10.7、§10.9；台账 u07-1 |
| `positionPaysLp` 降级为 observability-only | 只作 `Funding` 事件字段断言，不得推 Vault 余额；市场级累计与仓位级实结的取整尾差无兜底科目 → ΣΔ 须显式留容差 | `MarketUtils.sol::getNextFundingAmountPerSize` | → 核心 §10.6；台账 u12-3 |
| 零 OI **不是 no-op**：per-size 不动，但 `fundingUpdatedAt` 照刷、`skewEMA` 被写成全零、`Funding(0,0,0)` 照发 | 零 OI 只能断「两个 per-size + FUNDING_FEE_TYPE 账本不变」；跨「清仓→再开仓」不得沿用旧 EMA 快照（重建走 `lastTime==0` 初始化分支） | `MarketUtils.sol::updateFundingState` | → 核心 §19.3；台账 u07-2 |
| Claimable Collateral 机制整体删除：`incrementClaimableCollateralAmount` / `claimCollateral` / `batchClaimCollateral` / `_getClaimableFactor`、`ExchangeRouter.claimCollateral`、`ClaimableCollateralUpdated` / `CollateralClaimed` 事件、全部 `CLAIMABLE_COLLATERAL_*` 键与 `Config.setClaimableCollateral*` | 守恒式去掉该科目；旧 ABI 不可调；看板/索引器该科目下线 | `MarketUtils` / `ExchangeRouter` / `MarketEventUtils` 删除段 | → 核心 §22.2-22.4 |
| `claimAffiliateRewards` 由必失败（`initItems(2)` 写第 3 项 panic）变可成功 | @v0.3.1「领取失败」是缺陷非设计；当前 primary 须有「领取成功 + 事件三字段」用例 | `ReferralEventUtils.sol::emitAffiliateRewardClaimed` | → 核心 §22.2 |
| `VaultBase._withdrawAssets` 缺口路径：先把本地余额发给 receiver，再按 receiver 余额差校验 strategy **恰好**补齐 shortage，否则 `ErrorStrategyWithdrawalMismatch`；`balance ≥ assets` 正常路径两版一致 | Noop 策略余额恒 0 → 进缺口分支必失败（标准 ERC20 报 transfer 余额不足，整笔回滚）；LP 赎回与 `transferOut`（付正 PnL / 净正 funding）同受此约束 | `VaultBase.sol::_withdrawAssets` | → 核心 §13.8 |

## 2. 计算结果直接变化（点差 · 费用 · 清算判定 · 减仓规模）

| 变了什么 | 对断言的影响 | 锚点 | 指针 |
|---|---|---|---|
| dynamicSpread：`uint256` floor-at-0 → `int256` 且 `clamp(raw, MIN_DYNAMIC_SPREAD, MAX_DYNAMIC_SPREAD)`（键维度 `(marketIndex, isLong)`，`isLong` 取 `order.isLong()`）；加仓恒 `allowNegativeSpread=true`；清算单 / `secondaryOrderType==Adl` 把 minDS 抬到 ≥0（上限沿用） | 断言有符号点差，负值合法不得取绝对值或归零；强平/ADL 与普通减仓分建期望；`ExecutionPriceResult.dynamicSpread` 与事件均按 int256 解码 | `PositionPricingUtils.sol::getDynamicSpread` / `PositionUtils.sol::getExecutionPriceForIncrease` / `::getExecutionPriceForDecrease` | → 核心 §4.1、§22.1 |
| **双零 clamp**：两键未配（`getInt` 读 0）→ `clamp(x,0,0)=0`，正的常数点差也被吞，执行价 = 裸 oracle 选价（**不是**退回 floor-at-0）；`max<min` 不 revert 而坍缩成 `[min,min]`；`Config.setInt` 不过 `validateRange` | 跑批前先读键；漏配时全部点差用例以「恒 0」假通过（CT-BASE 已加非双零断言）；越界只能链下断言 | 同上；`Config.sol::setInt` | → 核心 §4.1；台账 u12-5/6 |
| `getPriceImpactSpread` 极值：`mulDiv(orderSize, param, depth)` 防溢出；指数 > `MAX_NATURAL_EXPONENT` 直接返回全局 `MAX_PRICE_IMPACT_SPREAD` | 大额单从「期待 revert」改「期待封顶值」 | `PositionPricingUtils.sol::getPriceImpactSpread` | → 核心 §4.2、§22.1 |
| Affiliate reward 二次封顶 `maxAffiliateRewardFactor = max(1e30 − max(proDiscount, traderDiscount), 0)` | 断言「reward + 实采折扣 ≤ 仓位费」且 `protocolFeeAmount` 不下溢 | `PositionPricingUtils.sol::getPositionFeesAfterReferral` | → 核心 §7.3、§22.1 |
| 清算判定两处改动：合成订单**无条件** `setOrderType(Liquidation)`（→ minDS 抬 0，与 `forLiquidation` 入参无关）；`balanceWasImproved` 取真值进费档选择（@v0.3.1 恒 false） | 两处方向相反、净效果逐市场读键定；阈值随 OI 翻档而跳变，OI 快照与判定必须钉同块；清算价二分必须用当前 primary 的 Reader；因子仍由 `forLiquidation` 选：真清算 `(true,true)`、开仓校验 `(true, sizeDeltaUsd==0)`（**纯加保证金走清算档**）、减仓收尾 `(false,false)` | `PositionUtils.sol::isPositionLiquidatable` | → 核心 §11.2-11.3、§18.3-18.4 |
| 减仓 `sizeDeltaUsd` 放大整仓：USD 模式 Long 等比销账 ⌈⌉ 吃光 `sizeInTokens` 时把 `sizeDelta` 改成整仓 `sizeInUsd` 重算（发 `OrderSizeDeltaAutoUpdated`） | PnL / 费用 / OI 按整仓算；@v0.3.1 对照期望按「仓位被删 + 市场级 cumulativeOpenCosts 留残值」建，不是「残留 sizeInUsd」 | `DecreasePositionUtils.sol::decreasePosition` | → 核心 §5.2 ②、§22.1 |
| `remainingCostUsd` 量纲修正：Token 数 → `× collateralTokenPrice.min`（USD×1e30） | 分支边界不变；只重算 `InsufficientFundsToPayForCosts` / `InsolventClose.remainingCostUsd` 两处数值 | `DecreasePositionCollateralUtils.sol::payForCost` | → 核心 §22.1 |

## 3. 减仓订单的七处自动改写（**两版皆然**，不是版本差异；当前 primary 只新增第 ②「USD-Long 放大整仓」，已列 §2）→ 核心 §5.2、§23.2 步 3-7

- 七处的顺序即语义（①②⑤⑥ 改 `sizeDelta` 后重跑 `getDecreaseOrderSize`，③④⑦ 不重算）；**⑦ 全平时 `initialCollateralDeltaAmount` 强制置 0 且无事件**（`DecreasePositionUtils.sol:238-241`，@v0.3.1 同位置已存在）。用「事件缺席」推断「未改写」在 ⑦ 上必错。防法 → traps §13。

## 4. 事件与 ABI（解析器按名取值，不按下标）

| 变了什么 | 对断言的影响 | 锚点 | 指针 |
|---|---|---|---|
| `PositionIncrease` / `PositionDecrease`：uintItems 16→15；`dynamicSpread` 从 `uintItems[13]`（uint）迁到 `intItems[1]` / `[3]`（int256）；`orderType`→`uintItems[13]`、`increasedAtTime` / `decreasedAtTime`→`uintItems[14]`；`uintItems[0..12]` 不变 | 按下标解析全部错位；按 uint 解析负点差得天文数字 | `PositionEventUtils.sol::emitPositionIncrease` / `::emitPositionDecrease` | → 核心 §17.8 |
| 减仓输出事件只剩 `outputToken`（1 address）+ 3 uint，`secondaryOutput*` 删除；`InsufficientFundingFeePayment` uintItems 4→3 | 依赖 secondary 字段的索引器/看板科目改造 | `DecreaseOrderUtils.sol::getOutputEventData` / `PositionEventUtils.sol::emitInsufficientFundingFeePayment` | → 核心 §22.3 |
| `PositionFeesCollected` / `PositionFeesInfo` 布局未变，但 referral→pro→liquidation 追加段按条件出现 | 仍按名取 | `PositionEventUtils.sol::_emitPositionFees` | → 核心 §17.8 |
| `Reader.getSubaccountInfo` 增 `slot` / `isSlotActive`，新增 `getSubaccountSlots` / `MAX_SUBACCOUNT_SLOTS`；`SubaccountApproval` typehash 第 2 字段插 `string slot`；`addSubaccount(address, string)`；新增 `RemoveSubaccountSlot` 通道 | @v0.3.1 签名在当前 primary 一律验签失败、不能重放；ABI / typed data / 四槽三键 / nonce 同时核 | `RelayUtils.sol` / `SubaccountRouter.sol` / `Reader.sol` | → 核心 §16.6、§22.3 |
| `EmptyTokenTranferGasLimit` → `EmptyTokenTransferGasLimit` | 错误选择器改变 | `TokenUtils.sol::transfer` / `FxErrors` | → 核心 §22.3 |

## 5. 配置、键位与市场登记

| 变了什么 | 对断言的影响 | 锚点 | 指针 |
|---|---|---|---|
| `COLLATERAL_TOKEN` 改全局键（`keccak256(abi.encode)`）；`MarketStoreUtils.get` 直读全局、`set` 不再写 per-market；`createMarket` 校验 `== vault.asset()` 否则 `EmptyToken` / `InvalidCollateralTokenForVault` | 全网单一抵押品；旧 per-market 键读 0；Mock Market Bundle 建市场前必须先配全局键；抵押品为 USDC 时「同币种抵押」清算价分支不可达 | `MarketStoreUtils.sol::get` / `::set`、`MarketFactory.sol::createMarket` | → 核心 §22.4、§18.2 |
| 新键 `MIN_DYNAMIC_SPREAD` / `MAX_DYNAMIC_SPREAD`：`(marketIndex, isLong)`，int，1e18；每市场 4 值；无范围、无相对校验 | 参数目录与环境检查覆盖；越界只能链下断言 | `FX100Keys.sol::minDynamicSpreadKey` / `::maxDynamicSpreadKey` | → 核心 §4.1、§22.4 |
| 子账户：`SUBACCOUNT_LIST` 集合 → 三键槽位 `SUBACCOUNT_SLOT` / `_SUBACCOUNT` / `_ACTIVE`，上限 4（编译期常量，不可配）；`removeSubaccount` 只清地址**不释放槽位**，`removeSlot` 才释放（找不到时静默返回） | 换绑必须 `removeSlot` 或复用同名槽位，否则 `MaxSubaccountSlotsExceeded`；新增 `DuplicateSubaccount` | `SubaccountUtils.sol::addSubaccount` / `::removeSubaccount` / `::removeSlot` | → 核心 §16.6；台账 u12-7/8 |
| 错误集合：删 `InvalidClaimableFactor` / `InvalidClaimableReductionFactor` / `CollateralAlreadyClaimed` / `InvalidClaimCollateralInput` / `UnexpectedTokenForVirtualInventory`；增 `DuplicatedRefundToken` / `InvalidCollateralTokenForVault` / `MaxSubaccountSlotsExceeded` / `DuplicateSubaccount` | 回退断言按新名与选择器 | `FxErrors` | → 核心 §22.4 |
| 沿用未变：`claimableFeeAmountKey(marketIndex, token, feeType)` / `availableFeeAmountKey(feeToken, feeType)`（行号变、签名不变） | v031-facts §3 的 feeType 签名与双重基编码陷阱仍适用 | `FX100Keys.sol:991` / `:1573` | → v031-facts §3、traps §1 |

## 6. 校验与回退

| 变了什么 | 对断言的影响 | 锚点 | 指针 |
|---|---|---|---|
| 减仓 `minOutputAmount` 首次生效：`decreasePosition` 返回后、`transferOut` 前校验 `outputAmount × outputTokenPrice.min ≥ minOutputAmount`（**USD×1e30 口径**），否则 `InsufficientOutputAmount` | 失败路径期望按「仓位/OI/账本全部原状、零事件」建，不是「先改后拦」；成功路径数值不受影响 | `DecreaseOrderUtils.sol::processOrder` / `::_validateOutputAmount` | → 核心 §5.6、§23.2 步 17 |
| Relay `feeToken` 必须 == 全局 `COLLATERAL_TOKEN`：为 0 → `EmptyToken`，不匹配 → `UnexpectedRelayFeeToken` | 两分支都验「回退且不扣款」 | `BaseRelayRouter.sol::_validateCall` | → 核心 §22.5 |
| ExternalHandler 重复退款 token → `DuplicatedRefundToken` | 新增回退用例 | `ExternalHandler.sol::makeExternalCalls` | → 核心 §22.5 |
| Reader 批量取价：缺价 `EmptyMarketPrice` 整批回退；`marketIndices` / `marketPrices` 按较短截断；重复 marketIndex 取首次 | 入参须覆盖账户全部市场 | `ReaderPositionUtils.sol::getAccountPositionInfoList` | → 核心 §22.5 |
| `createOrder`：仅 `autoCancel==true` 才走 `updateAutoCancelList` + 总回调 gas 校验；`Liquidation && !isSizeDeltaUsd` 校验移出 `createOrder`（`updateOrder` 保留） | 校验触发条件/位置变化，用例前置改 | `OrderUtils.sol::createOrder` / `OrderHandler.sol::updateOrder` | → 核心 §22.5 |

## 7. 两版皆然、勿归因为版本差异

- 开仓 `sizeDeltaInTokens` / `sizeDeltaUsd` 最终值按**含点差 executionPrice** 回写；`getIncreaseOrderSize` 只是喂 `getDynamicSpread` 的预解析中间量。→ 核心 §23.1 步 2/8
- 正 funding 计入清算判定（@v0.3.1 同位置已如此）；判定不含清算费；合约没有清算价字段，闭式是对 `isPositionLiquidatable` 不等式的反解。→ 核心 §11.1、§18.1-18.2；台账 u07-6
- Funding 资金去向不对称（LP 单向出钱）与 Reader 资金费预览 ×2 且恒取 long 侧，两版同在。→ 台账 u07-1/5
- v031-facts 仍有效：费用三段路由、key 签名、五账户圈、发单前置校验；失效：§1 Funding 行的时点（改为 `settleFundingFees`）与 §4 地址表（环境实际版本按 CURRENT.json `environments.*.forkOf`）。→ v031-facts §1 / §3 / §4

# §5 仓位字段更新 —— 需求↔实现差异台账（v0.3.2）

本组（`IncreasePositionUtils` / `DecreasePositionUtils` / `DecreasePositionCollateralUtils`）无专属需求规范文档，以下条目按任务约定，记录**源码内部的设计意图冲突**（注释/字段命名/事件语义与实际行为不一致）与**跨版本行为变更**，供缺陷判定与用例设计使用。

---

### 费用步骤缺口时，已扣走的 token 既不入池也不入 claimable

- 需求规范：无专属规范。源码自带注释表达的设计意图 —— `DecreasePositionCollateralUtils.sol::processCollateral` 第 ⑤ 步的 `else` 分支注释："empty the fees since the amount was entirely paid to the pool instead of for fees"（该金额已整笔付给池子，而不是作为费用）。
- 合约实现：`DecreasePositionCollateralUtils.sol::processCollateral`。当 `payForCost(totalCostAmountExcludingFunding × collateralTokenPrice.min)` 之后 `remainingCostUsd > 0`，`else` 分支只执行 `fees = getEmptyFees(fees)`，**没有任何 `transferOut` 到 `market.vault`，也没有 `incrementClaimableFeeAmount`**。而 `payForCost` 已经从 `output.outputAmount` / `remainingCollateralAmount` 实扣了 `amountPaidInCollateralToken`。
- 差异：注释声称"已付给池子"，实现却没有把这笔钱转给池子，token 留在 `positionVault` 里，无任何账目归属。
- 影响：只在"全平的清算 / ADL"（`isInsolventCloseAllowed == true`）路径可达（否则会先 revert）。破产清算时被部分支付的费用变成 `positionVault` 的游离余额：LP 少收 `feeAmountForPool`，feeReceiver 少收清算费与仓位费，`positionVault` 余额与各仓位 `collateralAmount` 之和产生正向偏差。做 ΣΔ 守恒核对时会看到"钱不见了"的差额，需要单列。同一逻辑在 v0.3.1 已存在（v0.3.2 只改了触发条件，去掉了 `amountPaidInSecondaryOutputToken == 0` 的合取项），属"两版都错"。
- 建议定性：缺陷候选

---

### v0.3.1 的 `minOutputAmount` 滑点保护是死代码，v0.3.2 才接线

- 需求规范：无专属规范。`Order.minOutputAmount` 的存在本身即表达"减仓输出低于用户可接受值时应拒单"的设计意图。
- 合约实现：v0.3.1 `DecreaseOrderUtils.sol` 定义了两个 `_validateOutputAmount` 重载（第 136、149 行），但全仓库**没有任何调用点**（`grep -rn "validateOutputAmount" src/` 仅命中两处定义）。v0.3.2 `DecreaseOrderUtils.sol::processOrder` 在 `decreasePosition` 返回后、`transferOut` 之前新增了调用。
- 差异：v0.3.1 上任何 `minOutputAmount` 都不会生效，减仓不存在输出下限保护；v0.3.2 开始生效。
- 影响：跨版本用例不能共用期望结果——同一组"填了 minOutputAmount 且实际输出不足"的减仓数据，在 v0.3.1 环境成功、在 v0.3.2 环境 revert `InsufficientOutputAmount`。v0.3.1 上跑出的"通过"记录不能作为该保护的覆盖证据。
- 建议定性：设计已变更未回写文档（v0.3.1 侧为已修复的历史缺陷）

---

### `minOutputAmount` 字段名是 amount，比较口径是 30 位标度 USD

- 需求规范：无专属规范。字段名 `minOutputAmount` 与 `Order` 中相邻的 amount 类字段（`initialCollateralDeltaAmount` 等）同为"token 数量"命名风格。
- 合约实现：`DecreaseOrderUtils.sol::_validateOutputAmount`，注释 "note that minOutputAmount is treated as a USD value for this validation"；实际比较 `outputAmount × oracle.getPrimaryPrice(outputToken).min < minOutputAmount`，左侧是 30 位标度的 USD。
- 差异：字段命名与实际口径不一致，同一字段在下单侧（前端 / SDK 填值）与执行侧（合约比较）之间存在单位歧义。
- 影响：若前端按 token 数量填该字段（例如 USDC 6 位的 `100_000_000`），与 30 位 USD 值相比几乎必然通过，保护形同虚设——是典型的"假阴性"来源。用例必须显式断言填入值的标度，且需要一条专门验证单位口径的负向用例。
- 建议定性：需求表述模糊（命名与口径不一致；是否改名或改注释需产品裁决）

---

### 全平时 `orderInitialCollateralDeltaAmount` 被改写为 0，回传字段无法表示"本次提取保证金"

- 需求规范：无专属规范。`DecreasePositionResult.orderInitialCollateralDeltaAmount` 与事件字段 `orderInitialCollateralDeltaAmount` 的存在，表达"把本次订单实际生效的保证金提取额回传给调用方/前端"的意图。
- 合约实现：`DecreasePositionUtils.sol::decreasePosition` 在 `sizeDeltaUsd == params.position.sizeInUsd() && initialCollateralDeltaAmount > 0` 时**无条件 `setInitialCollateralDeltaAmount(0)`**，随后返回值与 `DecreaseOrderUtils.sol::getOutputEventData` 都取这个被改写后的 0；保证金实际是通过清仓分支的 `values.output.outputAmount += position.collateralAmount()` 退回的。
- 差异：全平（含手动全平、被自动升级的全平、清算、ADL）时该字段恒为 0，与用户实际收到的全部保证金不符。
- 影响：前端 / SDK / 对账脚本若用该字段展示或核对"本次提取保证金"，全平场景会显示 0，需改用 `outputAmount` 减去 PnL 与费用部分反推。E2E 期望值若按"requestedCollateralWithdrawal"建模，会整整少算一份本金（示例：1000 USDC 保证金 + 50 盈利 − 7 成本，正确输出 1043 USDC，按提取额建模只会算出 43 USDC）。
- 建议定性：缺陷候选（口径缺陷；至少需在字段文档中标注全平语义）

---

### 破产平仓路径的费用事件被清零，实付 funding 不可从事件还原

- 需求规范：无专属规范。`PositionFeesCollected` / `PositionFeesInfo` 事件的设计意图是可观测地还原本次结算的各项费用。
- 合约实现：`DecreasePositionCollateralUtils.sol::getEmptyFees` 只保留 `positiveFundingFeeAmount` 与两个 `latest*FundingFeePerSize`，把 `negativeFundingFeeAmount`、`positionFeeAmount`、`liquidation.*`、`ui.*`、`referral.*`、`totalCostAmount*` 全部置 0（源码注释自认："all fees are zeroed even though funding may have been paid / the funding fee amount value may not be accurate in the events due to this"）。且走 `step = "fees"` 早退时，`fees` 在 `handleEarlyReturn` 之前就已被清零，导致该路径的 `PositionFeesInfo` 也报全 0；走 `"funding"` / `"pnl"` 早退时 `PositionFeesInfo` 报的仍是真实费用。
- 差异：同一个事件在三个早退分支下语义不一致；且实际已支付的 funding 无法从费用事件读出。
- 影响：清算 / ADL 破产用例不能用 `PositionFeesCollected` 做费用断言（会全 0），实付 funding 只能从 `InsufficientFundingFeePayment.amountPaidInCollateralToken` 反推，实付费用只能从 `positionVault` 余额差反推。看板与核对脚本需要为破产路径单开一套断言口径。
- 建议定性：缺陷候选（可观测性缺陷，优先级低于资金类）

---

### 部分减仓预估闸门的源码注释指向 indexTokenPrice，实现用的是含点差 executionPrice

- 需求规范：无专属规范。`DecreasePositionUtils.sol::decreasePosition` 阶梯④前的注释 `// estimate pnl based on indexTokenPrice` 表达的意图是"用裸 index 价估算 PnL"。
- 合约实现：同处代码先调用 `PositionUtils.getExecutionPriceForDecrease(params, cache.prices.indexTokenPrice)` 取得含动态点差的 `executionPrice`，再以该 `executionPrice` 调 `getPositionPnlUsdWithExecutionPrice` 得到 `estimatedPositionPnlUsd`；index 价只是 executionPrice 的输入。
- 差异：注释与实现不一致（注释停留在早期版本口径）。
- 影响：按注释推导期望值会漏掉点差，`estimatedRealizedPnlUsd` / `estimatedRemainingPnlUsd` 偏离，进而把 §5.2 阶梯④（提取额置 0）与⑤（升级全平）的触发点算错——点差越大偏离越大。构造④⑤两级的边界用例时必须按 executionPrice 口径反推。
- 建议定性：文档/注释缺陷（实现正确，注释过期）

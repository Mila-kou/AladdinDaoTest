# u09（§13 LP Vault 字段 · §14 执行费）需求↔实现差异台账

对照的需求规范：
- A =《2026-06-13_FX100-储备金与风控体系全面设计规范（讨论版-2026-06-12-修订）》
- B =《2026-07-22_FX100-储备金与风控体系改造规范(实施版-2026-06-12)》
- C =《2026-07-22_FX100-执行费豁免前移到创建期+免Gas开仓-改造规范(实施版-2026-06-14)》

实现基线：`Github/fx100-contracts@release-v0.3.2` @ `13880f2416918f4fed3fea86d7f1023084a3ce0d`。

---

### G-13-1 提款 gate 的分母固定取「第一个市场」的 vault，且取抵押品 min 价

- 需求规范：B §6.1「实现：LPVault 持有 `dataStore`/`oracle` 引用（admin 可配置），迭代 `allMarkets` 累加 `net_i`，对比 `MAX_PNL_FACTOR_FOR_WITHDRAWALS × poolUsd`」；A/B §三 伪代码 `poolUsd = vault.totalAssets() × USDC 价`，A 的取价示例写的是 `price.max`。
- 合约实现：`src/market/MarketUtils.sol::getGlobalNetObligationRatio` 只在循环的 `i == 0` 那一轮取 `poolUsd`，注释写明「All markets share the same vault」；取价是 `getPoolUsdWithoutPnl(market, collateralTokenPrice, maximize = false)`，即 **collateral min 价**。分子逐市场用 `getNetObligation(..., maximize = true)`。
- 差异：分母依赖「所有市场共用同一 LPVault」这一部署不变量（合约层零校验），且取价方向与需求伪代码相反（min 而非 max）。
- 影响：min 价让分母偏小、比率偏大，gate 更早封锁提款（方向保守，对 LP 更安全）；但若将来某个市场配了不同 vault，`marketIndices[0]` 之外的池子会被静默忽略，比率失真。E2E 复算 `globalNetObligationRatio` 必须用 min 价、且只取第一个市场的 vault，否则会得出与链上不同的门槛判定。
- 建议定性：设计已变更未回写文档（B §十.5 已自述，但 A/B 正文伪代码未同步；「所有市场共用同一 vault」需列为新市场上线 checklist 强制项）

### G-13-2 提款多出一道需求里没有的「epoch 闸」，且 epoch 只能靠成功的 claim 推进

- 需求规范：A §5.4 / B §6.1 的 claim 流程只有两道 —— `_advanceEpoch()` + 「existing checks」+ `_validatePnlForWithdrawal()`；A §8.4 讨论的也只是「7 天提款锁定与 PnL Gate 的交互」。两篇需求正文都没有描述 epoch 这一层门禁的语义、参数或退出条件。
- 合约实现：`src/vault/LPVault.sol::_claimWithdrawRequest` 在时间闸之后还有一道 `if (request.unlockAt >= currentEpoch.startTime) revert WithdrawRequestEpochNotEnded()`；而 `_advanceEpoch()` 是 `if` 不是 `while`（一次调用最多推进一个 epoch），且它只被 `claimWithdrawRequest` / `claimWithdrawRequests` 调用——同一笔交易里若后续校验或 gate revert，epoch 推进会一起回滚，因此**只有成功的 claim 才会真正推进 epoch**。
- 差异：需求只规定「时间锁 + PnL gate」，实现是「时间锁 + epoch 闸 + PnL gate」三道，且 epoch 推进没有独立的 permissionless 入口。
- 影响：极端情况下形成推进僵局的观感——所有待兑付请求都被 epoch 闸挡住时，没有任何单独可调的「推进 epoch」函数；实际靠 `_advanceEpoch` 先于校验执行、同一笔内自愈，但若已过去多个 epoch，需要多次成功 claim 才追得上，LP 的等待期比需求描述的 `withdrawDelaySeconds` 长且不确定。测试上：SCN/CT 用例若只按 `unlockAt <= now` 设计前置条件，会得到非预期的 `WithdrawRequestEpochNotEnded`。
- 建议定性：设计已变更未回写文档（epoch 机制需补进需求；「无独立 epoch 推进入口」另作缺陷候选）

### G-13-3 需求建议的「允许 LP 取消提款请求并重新发起」未实现

- 需求规范：A §8.4「**建议**：在 claim 时检查 gate，gate 封锁期间 `unlockAt` 不消耗（或允许 LP 取消请求并重新发起）」。
- 合约实现：`src/vault/LPVault.sol` 只有 `initiateWithdrawRequest` / `claimWithdrawRequest` / `claimWithdrawRequests`，**没有任何撤销请求的接口**；份额被 `_burn(user)` + `_mint(address(this))` 锁进 vault 后只能等 claim。`unlockAt 不消耗` 这一半已满足（revert 时 `claimed` 保持 false）。
- 差异：需求给出的两个备选里只实现了前一半，后一半（取消并重发）无实现。
- 影响：净义务比长期高于 `MAX_PNL_FACTOR_FOR_WITHDRAWALS` 时，LP 的份额既不能兑付也不能撤回，被动继续承担风险敞口，且这部分份额仍计入 `totalSupply` 参与 NAV 摊分。
- 建议定性：缺陷候选（需求为「建议」而非硬约束，优先级可评估；测试上应有一条「gate 封锁期间份额不可撤回」的负向用例固化现状）

### G-13-4 Strategy 分配机制在需求规范里完全无对应条款，且实现无对外 setter、v0.3.2 永不触发

- 需求规范：A、B 两篇（含 §二 风控参数总览、§六 LP 存取款、§九 完整参数建议）**均未提及** Strategy、`strategyMinDeposit`、`strategyAllocationPercentage` 或收益策略托管；A/B 对 `totalAssets` 的口径描述只有「`vault.totalAssets()`」一句。
- 合约实现：`src/vault/VaultBase.sol::_tryAllocate` 有完整的三道闸门（`localAssets < minDeposit` 早退、占比未达目标判定、`newAllocation < minDeposit` 早退）；但 `_updateStrategyMinDeposit` / `_updateStrategyAllocationPercentage` 都是 internal，唯一调用点是 `__VaultBase_init`，而 `LPVault::initialize` 传的是 `__VaultBase_init(_strategy, 0, 0)`。全仓库无对外 setter → `allocationPercentage ≡ 0` → 闸门② 恒不成立 → 分配路径不可达。默认部署的策略是 `src/periphery/NoopStrategy.sol`。
- 差异：实现引入了需求未定义的资金托管维度；同时该维度在 v0.3.2 被配置为永久关闭且无法开启（除非升级代理）。
- 影响：① `totalAssets` 的第二个加项恒为 0，`VaultBase::_withdrawAssets` 的「缺口→找 Strategy 补」分支（含 v0.3.2 新增的 `ErrorStrategyWithdrawalMismatch`）在当前部署下**不可达**，无法用普通 E2E 覆盖，只能靠单测 mock；② `updateStrategy` 可换地址但不迁移旧策略资产，一旦将来开启分配，换策略会让 `totalAssets` 与 NAV 瞬时跳变，需求没有任何关于该跳变的说明或护栏。
- 建议定性：需求表述模糊（需求缺失该模块）＋ 缺陷候选（参数无 setter 的死配置、`updateStrategy` 不迁移资产）

### G-13-5 v0.3.1 提款缺口路径漏发本地余额（v0.3.2 已修）

- 需求规范：A §5.4 / B §6.1 把 claim 兑付描述为「按 NAV 换算后把 `assets` 付给 receiver」，未描述本地余额与 Strategy 之间的分账细节。
- 合约实现：v0.3.1 的 `VaultBase::_withdrawAssets` 在 `balance < assets` 时只执行 `IStrategy(strategy).withdraw(asset, shortage, receiver)`，**不转本地 `balance`**，receiver 实收 `= shortage < assets`，而份额已在上一步 `_burn`。v0.3.2 补上了 `if (balance != 0) safeTransfer(receiver, balance)`，并新增 `receivedAssets != shortage → revert ErrorStrategyWithdrawalMismatch(shortage, receivedAssets)` 的实收校验。
- 差异：v0.3.1 实现少付；v0.3.2 已修正为「先发本地余额、再从 Strategy 取缺口、校验实收恰好等于缺口、不符整笔 revert」。
- 影响：v0.3.1 下 LP 会少拿 `min(balance, assets)`，差额永久留在 vault（对留守 LP 是白得，对提款人是资金损失）；v0.3.2 的新校验是**严格相等**（多给也 revert），若 receiver 在 `withdraw` 期间被其它路径打款，整笔提款会失败。由于 G-13-4，该路径在 v0.3.2 默认部署下不可达，回归需靠单测。
- 建议定性：缺陷候选（v0.3.1 侧的资金损失缺陷，v0.3.2 已修；v0.3.2 侧的「多给也 revert」列为待观察）

---

### G-14-1 豁免单误传 WNT 的退款收款人：需求写 cancellationReceiver，实现是 receiver

- 需求规范：C §3.2 伪代码「`if (wntAmount > 0) { orderVault.transferOut(Addresses.WNT, order.cancellationReceiver(), wntAmount); }`」。
- 合约实现：`src/order/OrderUtils.sol::createOrder` 豁免分支为 `orderVault.transferOut(Addresses.WNT, order.receiver(), wntAmount)`；`src/exchange/OrderHandler.sol::updateOrder` 的豁免退款同样发给 `order.receiver()`。
- 差异：收款人字段不同（`receiver` vs `cancellationReceiver`）。
- 影响：两者通常是同一用户，但 `cancellationReceiver` 可被下单方单独指定；子账户 / 集成方若依赖「取消类退款一律进 cancellationReceiver」的约定，豁免退款会落到 `receiver`。核对时必须按 `receiver` 断言。
- 建议定性：设计已变更未回写文档（C §十.1 已自述并接受，但 §3.2 正文伪代码未同步）

### G-14-2 Relay 路径执行费上限：需求要求传 shouldCapMaxExecutionFee=true 且超限 revert，实现仍传 false

- 需求规范：C §八之二「**最小改法**：relay 路径改传 `true`，复用既有 multiplier 上限（相对 basefee）」；「建议 relay 路径**超限直接 revert**（而非静默 cap 把超额送 HOLDING），让 relayer 永不超额垫付」；实施清单 P0-7 同。
- 合约实现：`src/router/relay/BaseRelayRouter.sol::_createOrder` 与 `::_updateOrder` 在 v0.3.2 仍然是 `orderHandler.createOrder(account, params, false)` / `orderHandler.updateOrder(..., false)`。风控改由全局键 `MAX_RELAY_SWAP_WNT_CAP`（`src/constants/FX100Keys.sol:395`，`BaseRelayRouter.sol:243` 读取）对 relayer 单笔垫付的原生费设硬上限、超限直接 revert。
- 差异：机制换了一套，且极性相反 —— `MAX_EXECUTION_FEE_MULTIPLIER_FACTOR` 是「未配置=0 → maxExecutionFee=0 → 触发 InvalidExecutionFee revert」，而 `MAX_RELAY_SWAP_WNT_CAP` **`0` 表示不设限**。
- 影响：`shouldCapMaxExecutionFee` 在 v0.3.2 的三个 router 里只有 `SubaccountRouter` 且 `callbackContract != address(0)` 时为 true，这是**唯一**会产生 `executionFeeDiff` → `HOLDING_ADDRESS` 的路径。测试若在 ExchangeRouter 或 Relay 路径上设计「超额执行费被封顶/被转 HOLDING」的用例，会全部落空。运维上 `MAX_RELAY_SWAP_WNT_CAP` 忘配 = 完全不设限。
- 建议定性：设计已变更未回写文档（C §十.3 已自述极性差异；正文 §八之二 建议未采纳）

### G-14-3 updateOrder 的豁免重判与双向状态迁移在需求正文无规定

- 需求规范：C §三只规定「把 size 豁免前移到 `createOrder`」，§七 不变量列表也只覆盖创建期；`updateOrder` 路径在正文中无任何条款，只在事后补记的 §十.2 里被描述为「超出本文范围的增强」。
- 合约实现：`src/exchange/OrderHandler.sol::updateOrder` 用**改单后的** `sizeDelta` / `isSizeDeltaUsd` 重跑 `GasUtils.isExecutionFeeSubsidizedAtCreation`，并做双向迁移：改大过线 → `executionFeeRefund = order.executionFee + receivedWnt` 全额退给 `order.receiver()` 且 `executionFee` 置 0；改小掉线 → 以 `order.executionFee + receivedWnt` 重走 `validateAndCapExecutionFee`，不足 `minExecutionFee` 则 `revert InsufficientExecutionFee`。
- 差异：需求正文未定义改单路径的豁免语义，实现自行补了一套并成为事实规范。
- 影响：前端「改小订单」必须按新 size 预判豁免状态并随附足额 WNT，否则改单直接 revert；「改大订单」会触发一笔用户没有主动请求的 WNT 退款。这两条都是可测的行为契约，但在需求正文里查不到。
- 建议定性：设计已变更未回写文档

### G-14-4 需求称部署脚本「两键缺省即 throw」未完成，v0.3.2 已完成（需求状态过期）

- 需求规范：C §十.5「§五/§八 P0-5 部署脚本项未完成：`configureMarket.ts` 尚未把两个执行费豁免阈值（`executionFeeSubsidize`/`executionFeeSubsidizeSize`）的缺省行为改成'缺失即 throw'；`executionFeeSubsidizeSize` 在部署脚本层目前零支持。」
- 合约实现：v0.3.2 的 `scripts/configureMarket.ts` 对两键都走 `requireConfigValue(...)`（`configureMarket.ts:57-63` 缺失即 `throw`），`executionFeeSubsidize` 在 `toSharedMarketParams`、`executionFeeSubsidizeSize` 在 `toMarketParams`，并分别通过 `setDataStoreUintIfNeeded(directKey.executionFeeSubsidize(marketIndex), ...)` 与 `setDataStoreUintIfNeeded(directKey.executionFeeSubsidizeSize(marketIndex), ...)` 写入 DataStore。
- 差异：需求文档的「未完成」状态已过期。
- 影响：**合约层的隐患仍然成立**——`DataStore.getUint` 对未设置的键返回 `0`，而 `sizeDelta >= 0` 恒真，所以任何**没有跑过 configureMarket 的市场**（或跑在旧脚本上的环境）都是「全场免执行费」而非「全场收费」，与「MAX = 关闭」的极性相反。测试环境出现「执行费恒为 0」时应先查这两个键是否已写入，而不是判定为缺陷。
- 建议定性：设计已变更未回写文档（需求 §十.5 状态需更新；合约层缺省极性建议单独作为运维 checklist 项）

### G-14-5 直连路径「多传的 WNT 全额计入执行费」且无任何上限，需求不变量未覆盖

- 需求规范：C §七.1「非豁免单（size < 对应阈值 / 或阈值=MAX）行为**完全不变**：创建期要求足额 WETH，不足 revert `InsufficientExecutionFee`。」——只约束了下限，未约束上限，也未说明多付部分如何处理。
- 合约实现：`src/order/OrderUtils.sol::createOrder` 非豁免分支执行 `params.numbers.executionFee = wntAmount`，即**以实收 WNT 覆盖用户声明的金额**；随后 `validateAndCapExecutionFee` 在 `shouldCapMaxExecutionFee == false` 时（ExchangeRouter / Relay 全部路径，见 G-14-2）直接原样返回，不封顶、不产生 diff。
- 差异：需求默认「用户声明多少就是多少」，实现是「打进来多少就是多少」，且直连路径无上限。
- 影响：前端或脚本 `sendWnt` 多打的 WNT 会在创建期被整笔记为执行费并锁在 OrderVault，直到订单被执行 / 取消 / 冻结时才按 `payExecutionFee` 退回超出 keeper 实际成本的部分（去向见 §14.4 的 refundReceiver 表，且回调合约有效时会改投回调合约）。限价单挂单期间这笔钱一直被占用。E2E 断言 `order.executionFee` 时必须用实际转入的 WNT 量，不能用 `params.numbers.executionFee`。
- 建议定性：需求表述模糊（上限与「多付如何处理」在需求中缺失；实现行为本身自洽，建议补进需求不变量）

---

附：`TestCode/src/reconciliation/formulas.ts` 未覆盖 LP Vault 与执行费两块（无 `nav` / `executionFee` / `adjustGas*` 相关实现），本组无第三方交叉佐证，全部结论直接回源码确认。

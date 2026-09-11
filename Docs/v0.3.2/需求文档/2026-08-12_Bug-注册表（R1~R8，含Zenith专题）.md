# 🐛 Bug 注册表（R1~R8，含 Zenith 专题）

> Notion 页面：[原文](https://app.notion.com/p/3b93d7873f2c811fac3cffc0e71f7896)
> 作者：fx100-sync（Gordon 的 fx100-contracts 仓库文档同步机器人，内容出自 Gordon）
> 创建时间：2026-08-12
> 最后编辑：2026-08-12
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 产品 / FX100 / 技术相关 / 合约 / 🐛 Bug & Issues
> 类型：设计文档

**严重性**: P1 🟠  
**合约**: `src/referral/ReferralEventUtils.sol`  
**位置**: `emitAffiliateRewardClaimed()` — `initItems(2)` 应为 `initItems(3)`  
**状态**: **VERIFIED**（`release/v0.3.2@a5ee951`，2026-08-05 本地 `src/` 已同步 v0.3.2、`forge test` 实测确认）  
**found_at**: `v2026-05-10@e56bfed`  
**fixed_at**: `release/v0.3.2@a5ee951`（早前 VERIFIED 记录有误：修复由本测试分支 64a1977 打入 src/，从未进入 release；release/v0.2.1 仍为 `initItems(2)`。1b65413 还原 src/ 后回归，直到 v0.3.2 才在 release 分支真正修复）

缺陷: 写入第 3 个 uint 槽时越界 Panic(0x32)，所有联盟奖励领取（`batchClaimAffiliateRewards` / `ExchangeRouter.claimAffiliateRewards`）永久 revert。  
修复方向: `initItems(2)` → `initItems(3)`，**已在 `release/v0.3.2@a5ee951` 实施**，2026-08-05 `src/` 同步后本地实测确认生效。

| 测试函数 | 类型 | 状态 |
|---|---|---|
| `test_bug_B02_emitAffiliateRewardClaimedReverts` | bug | ⏸ SKIP（历史复现用例，v0.3.2 上不再触发越界，vm.skip 保留作回归记录） |
| `test_bug_B02_revertsWithAnyValidInput` | bug | ⏸ SKIP（同上） |
| `test_fix_B02_correctInitSizeSucceeds` | fix | ✅ PASS |
| `test_fix_B02_allThreeUintFieldsSet` | fix | ✅ PASS |

**连带 vm.skip 的下游测试**（修复后一并删 skip）：`Referral.t.sol::test_referralEventUtils_emitAffiliateRewardClaimed_oobPanic`、`ReferralUtils.t.sol::test_referralUtils_batchClaimAffiliateRewards_zeroReward_doesNotRevert`、`AffiliateReward.t.sol::test_ar02_claim_affiliate_rewards_transfers_and_resets`、`P8_AffiliateRewardAccounting.t.sol::test_AR1/test_AR2`

---

### R2-B03

**严重性**: P1 🟠  
**合约**: `src/exchange/ExecuteOrderUtils.sol` + `src/gas/GasUtils.sol`  
**位置**: `GasUtils.payExecutionFee` — 补贴后未退还用户预付 WNT  
**状态**: VERIFIED  
**found_at**: `v2026-05-10@e56bfed`  
**fixed_at**: `<0e8439c`（release/v0.2.0 合并时已修复）  
**verified_at**: `v2026-05-29@0592b26`

缺陷: 触发执行费补贴时，用户预付 WNT 永久锁死在 OrderVault。  
修复: 发送补贴后将用户预付 WNT 退还。

| 测试函数 | 类型 | 状态 |
|---|---|---|
| `test_bug_B03_payZeroFeeDoesNotCallBank` | bug | ✅ PASS |
| `test_bug_B03_preHeldWNTStuckInVaultAfterSubsidy` | bug | ✅ PASS |
| `test_fix_B03_subsidizedFeeRefundsUserWNT` | fix | ✅ PASS |

---

### R2-B04

**严重性**: P1 🟠  
**合约**: `src/market/MarketEventUtils.sol`  
**位置**: `emitTotalPendingImpactAmountUpdated()` — `initItems(0)` 应为 `initItems(1)`  
**状态**: VERIFIED  
**found_at**: `v2026-05-10@e56bfed`  
**fixed_at**: `3a9653e`  
**verified_at**: `v2026-05-29@0592b26`

| 测试函数 | 类型 | 状态 |
|---|---|---|
| `test_fix_B04_functionRemoved_compileTimeProof` | fix | ✅ PASS |

---

### R2-B05

**严重性**: P1 🟠  
**合约**: `src/market/MarketEventUtils.sol`  
**位置**: `emitLentPositionImpactPoolAmountUpdated()` — `initItems(1)` 应为 `initItems(2)`  
**状态**: VERIFIED  
**found_at**: `v2026-05-10@e56bfed`  
**fixed_at**: `<0e8439c`（release/v0.2.0 合并时已修复）  
**verified_at**: `v2026-05-29@0592b26`

| 测试函数 | 类型 | 状态 |
|---|---|---|
| `test_fix_B05_functionRemoved_compileTimeProof` | fix | ✅ PASS |

---

### R2-B06

**严重性**: P1 🟠  
**合约**: `src/subaccount/SubaccountUtils.sol`  
**位置**: `validateSubaccountApproval()` — `block.timestamp > expiresAt` 当 `expiresAt=0` 时恒 true  
**状态**: REPORTED（2026-08-05 本地全量测试再次核对仍未修复：`test_fix_B06_zeroExpiresAtMeansNeverExpires` 仍 SKIP）  
**found_at**: `v2026-05-10@e56bfed`

缺陷: 所有未设置过期时间的子账户立即失效。  
修复: `if (expiresAt != 0 && block.timestamp > expiresAt)`

---

### R2-B07

**严重性**: P2 🟡  
**合约**: `src/market/MarketUtils.sol`  
**位置**: `getIsLongToken()` — 第二个条件重复 `token != collateralToken`（应为 `!= indexToken`）  
**状态**: **VERIFIED**（`release/v0.3.2@7f41623`，2026-08-05 `src/` 同步后本地 `forge test` 确认 PASS）  
**found_at**: `v2026-05-10@e56bfed`  
**fixed_at**: `release/v0.3.2@7f41623`——没有修正条件，而是把整个死代码函数 `getIsLongToken` 连同其专用错误类型一起删除。`test/bugs/BugB07_MarketUtils.t.sol` 已按"函数已删除"重写为 stub（`test_fix_B07_indexTokenReturnsFalseWithoutRevert` 现为编译期证明，PASS）。

---

### R2-B08

**严重性**: P2 🟡  
**合约**: `src/order/DecreaseOrderUtils.sol`  
**位置**: `_handleSwapError()` — 函数体为空，swap 失败无任何处理  
**状态**: **VERIFIED**（`release/v0.3.2@a1e4459`，2026-08-05 `src/` 同步后本地 `forge test` 确认 PASS）  
**found_at**: `v2026-05-10@e56bfed`  
**fixed_at**: `release/v0.3.2@a1e4459`——没有补实现，而是把整个空函数删除（走的是"死代码删除"而非"补全逻辑"的路线）。`test/bugs/BugB08_DecreaseOrderUtils.t.sol` 已按"函数已删除"重写为 stub（`test_fix_B08_handleSwapErrorEmitsEvent` 现为编译期证明，PASS）。

---

### R2-B09

**严重性**: P2 🟡  
**合约**: `src/data/DataStore.sol`  
**位置**: `decrementUint` / `incrementUint` / `applyDeltaToUint` — 溢出产生 Panic(0x11) 而非 custom error  
**状态**: REPORTED（2026-08-05 本地全量测试再次核对仍未修复：`test_fix_B09_decrementBelowZeroRevertsCustomError`、`test_fix_B09_incrementOverflowRevertsCustomError` 仍 SKIP）  
**found_at**: `v2026-05-10@e56bfed`

---

### R2-B10

**严重性**: P2 🟡  
**合约**: `src/pricing/PositionPricingUtils.sol`  
**位置**: `getPriceImpactSpread()` — `orderSize * priceImpactParameter` 无溢出保护  
**状态**: **VERIFIED（顺带修复）**（`release/v0.3.2@b81786f`，2026-08-05 `src/` 同步后本地 `forge test` 确认 PASS）  
**found_at**: `v2026-05-10@e56bfed`  
**fixed_at**: `release/v0.3.2@b81786f`——该 commit 的主要目标是修 R5-B02（`getPriceImpactSpread` 的 `exp` 无上界防护），做法是把 `orderSize * priceImpactParameter / depth` 改成 `Math.mulDiv(orderSize, priceImpactParameter, depth)`（512-bit 中间精度，不会在乘法这一步溢出），顺带堵住了本条 R2-B10 描述的乘法溢出。同一测试文件里的 R2-B11（`EMAStorage` 除零）不受影响，2026-08-05 本地复测确认仍未修复。`test_bug_B10_*` 两条改为历史性 `vm.skip`（不再复现），`test_fix_B10_largeOrderSizeAndParamNoOverflow` 已 PASS；另有一个测试用例把哨兵配置值从 `type(uint256).max` 改为更真实的 0.5% 上限，因为原 max 哨兵值本身会撞上另一个已单独修复的指数上限分支里的 SafeCast 溢出。

---

### R2-B11

**严重性**: P2 🟡  
**合约**: `src/utils/EMAStorage.sol`  
**位置**: `emaValue()` — `sampleInterval=0` 时除零 Panic(0x12)  
**状态**: REPORTED（2026-08-05 本地全量测试再次核对仍未修复：`test_fix_B11_zeroSampleIntervalReturnsLastEma` 仍 SKIP）  
**found_at**: `v2026-05-10@e56bfed`

---

### R2-B12

**严重性**: P2 🟡  
**合约**: `src/bank/StrictBank.sol`  
**位置**: `_recordTransferIn()` — token burn 后 `nextBalance - prevBalance` 下溢  
**状态**: REPORTED（2026-08-05 本地全量测试再次核对仍未修复：`test_fix_B12_burnReturnsZeroInsteadOfPanic` 仍 SKIP）  
**found_at**: `v2026-05-10@e56bfed`

---

### R2-B13

**严重性**: P2 🟡  
**合约**: `src/gas/GasUtils.sol` + `src/order/Order.sol`  
**位置**: `estimateExecuteOrderGasLimit()` — SwapOrder 路径为死代码  
**状态**: **VERIFIED**（改走删除路线，2026-08-05 `src/` 同步后本地 `forge test` 确认——测试已按下方"2026-08-05 更新"重写并通过）  
**found_at**: `v2026-05-10@e56bfed`  
**fixed_at**: `6e86294`（部分修复，已被下方完整修复取代）→ `release/v0.3.2@6e21926`（完整修复）

**修复状态说明（历史，2026-06 记录）**：  
`6e86294` 在 `GasUtils` 中添加了 SwapOrder gas limit 路由，但 `Order.OrderType` 枚举中仍无 `SwapOrder` 成员，导致：

1. 新加的路由分支永远无法被触发（dead code 依然存在）
2. `test_fix_B13_swapOrderTypeUsesSwapGasLimit` 无法通过

**待工程师补充（历史建议，已被下方方案取代）**:

- 在 `src/order/Order.sol` 的 `OrderType` 枚举中新增 `SwapOrder`
- 或明确说明 SwapOrder 不会作为独立订单类型存在（此时应删除 GasUtils 中的路由分支）

**2026-08-03 更新**：工程师选择了第二条路线——`release/v0.3.2@6e21926` 把整个 `estimateExecuteSwapOrderGasLimit()` 死代码函数**直接删除**，不再补 `SwapOrder` 枚举。**⚠️ 这意味着 `test/bugs/BugB13_GasUtils.t.sol` 目前的写法与新代码不兼容**：该测试文件的 harness（`callEstimateExecuteSwapOrderGasLimit`）直接调用 `GasUtils.estimateExecuteSwapOrderGasLimit(...)`，函数被删除后**这份测试会编译失败**，不是简单的断言翻转。下次 `src/` 同步到 `release/v0.3.2` 时，必须同步重写这份测试（改为断言"该死代码函数已不存在/无法编译出对它的调用"，而不是原来的"应该被正确路由到"），否则会阻塞整个仓库的编译。

**2026-08-05 更新**：`src/` 已同步至 `release/v0.3.2`，`test/bugs/BugB13_GasUtils.t.sol` 已按上述提醒重写——原来直接调用已删除函数的 3 条 `test_bug_*` 和旧版 `test_fix_*` 占位断言全部移除，改为一个 harness（包一层 `GasUtils.estimateExecuteOrderGasLimit`）+ 单条 `test_fix_B13_swapOrderTypeUsesSwapGasLimit`，遍历全部 7 种真实 `Order.OrderType`（`MarketIncrease`/`LimitIncrease`/`StopIncrease`/`MarketDecrease`/`LimitDecrease`/`StopLossDecrease`/`Liquidation`），断言每种类型都能正确路由到已配置的 gas limit。本地 `forge test` 确认编译通过、断言 PASS。

| 测试函数 | 类型 | 状态 |
|---|---|---|
| `test_fix_B13_swapOrderTypeUsesSwapGasLimit` | fix（重写后，覆盖全部 7 种真实 OrderType） | ✅ PASS |

---

### R2-B14

**严重性**: P3 🔵  
**合约**: `src/gov/VlFX100.sol`  
**位置**: `initialize()` — `epochEnd = epochStart + epochLength - 1`（少 1 秒）  
**状态**: REPORTED  
**found_at**: `v2026-05-10@e56bfed`

---

### R2-B15

**严重性**: P3 🔵  
**合约**: `src/pricing/PositionPricingUtils.sol`  
**位置**: `getPositionFeesAfterReferral()` — protocolFee 计算无下溢保护  
**状态**: **VERIFIED**（`release/v0.3.2@e70c1db`，2026-08-05 `src/` 同步后本地 `forge test` 确认 PASS）  
**found_at**: `v2026-05-10@e56bfed`  
**fixed_at**: `release/v0.3.2@e70c1db`——新增 `maxAffiliateRewardFactor` 上限（基于 `1 - totalDiscountFactor`），把 `adjustedAffiliateRewardFactor` 钳到这个上限以内，防止折扣配置异常时下溢。`test/bugs/BugB15B16_ArithmeticUnderflow.t.sol::test_fix_B15_discountsExceedingFeeReturnZeroProtocolFee` 已重写为用真实 `ReferralStorage`+`DataStore` 端到端复现原危险场景并确认钳位生效，本地 PASS；同文件里的 R2-B16（`test_fix_B16_invertedFundingReturnsZero`）不受影响，仍 SKIP。

---

### R2-B16

**严重性**: P3 🔵  
**合约**: `src/market/MarketUtils.sol`  
**位置**: `getFundingAmount()` — `latestPerSize - positionPerSize` 当 latest < position 时下溢  
**状态**: REPORTED（2026-08-05 本地全量测试再次核对仍未修复：`test_fix_B16_invertedFundingReturnsZero` 仍 SKIP）  
**found_at**: `v2026-05-10@e56bfed`

---

### R2-B17

**严重性**: P3 🔵  
**合约**: `src/error/FxErrors.sol`  
**位置**: `EmptyTokenTranferGasLimit` — 拼写错误（少一个 s），selector 已固化  
**状态**: **VERIFIED**（`release/v0.3.2@6858107`，2026-08-05 `src/` 同步后本地 `forge test` 确认 `test_fix_B17_correctlySpelledErrorExists` PASS）  
**found_at**: `v2026-05-10@e56bfed`  
**fixed_at**: `release/v0.3.2@6858107`——⚠️ **实际修复方式比原建议更激进**：没有按"新增别名保留旧拼写"的建议做，而是直接把 `EmptyTokenTranferGasLimit` 改名为 `EmptyTokenTransferGasLimit`（连同那条"部分已部署合约无法重新部署、所以保留错误拼写"的注释一起删除）——即接受了 selector 变化，判断这个 ABI 破坏性变更当前可接受。

原修复建议（已被上面的方案取代）: 在 FxErrors.sol 新增 `EmptyTokenTransferGasLimit`（正确拼写）作为别名。

---

### R2-B18

**严重性**: P3 🔵  
**合约**: `src/exchange/LiquidationHandler.sol`  
**位置**: `executeLiquidation()` — 直接调用 `executeOrder`，无 try-catch，失败直接 revert  
**状态**: VERIFIED  
**found_at**: `v2026-05-10@e56bfed`  
**fixed_at**: `<0e8439c`（release/v0.2.0 合并时已修复）  
**verified_at**: `v2026-05-29@0592b26`

| 测试函数 | 类型 | 状态 |
|---|---|---|
| `test_bug_B18_liquidationExecutionFailurePropagatesRevert` | bug | ✅ PASS |
| `test_bug_B18_noErrorClassification` | bug | ✅ PASS |
| `test_bug_B18_noFallbackOnFailure` | bug | ✅ PASS |
| `test_fix_B18_liquidationFailureDoesNotRevertTransaction` | fix | ✅ PASS |
| `test_fix_B18_errorInfoCapturedOnFailure` | fix | ✅ PASS |

---

### R2-B19

**严重性**: P3 🔵  
**合约**: `src/external/ExternalHandler.sol`  
**位置**: `makeExternalCalls()` — refund 循环无重复 token 校验  
**状态**: **VERIFIED**（`release/v0.3.2@05b960a`，2026-08-05 `src/` 同步后本地 `forge test` 确认 PASS）  
**found_at**: `v2026-05-10@e56bfed`  
**fixed_at**: `release/v0.3.2@05b960a`——新增 `O(n²)` 重复校验（新增 `FxErrors.DuplicatedRefundToken` 错误类型），发现重复 token 直接 revert。`test_bug_B19_*` 四条改为历史性 `vm.skip`（v0.3.2 上不再复现"重复 token 静默丢单"行为）；`test_fix_B19_duplicateRefundTokenReverts` 早已断言新 revert 行为，无需改动，本地实测 PASS。

---

### R2-B20

**严重性**: P3 🔵  
**合约**: `src/reader/ReaderPositionUtils.sol`  
**位置**: `getAccountPositionInfoList()` — `_getMarketPricesByAddress()` O(N) 线性扫描致总体 O(N²)  
**状态**: **VERIFIED**（`release/v0.3.2@9cd1895`，2026-08-05 `src/` 同步后本地 `forge test` 确认 PASS）  
**found_at**: `v2026-05-10@e56bfed`  
**fixed_at**: `release/v0.3.2@9cd1895`——新增 `MarketPriceEntry` 缓存结构体，把市场价格查找从线性扫描改为直接索引。旧的线性扫描辅助函数已不再是可独立单测的函数，`test/bugs/BugB20_ReaderPerformance.t.sol` 已重写为直接对新数组索引方式做验证，并把 gas 对比方法学从"跨不同数组大小对比"改为"同一数组大小内前段 vs 后段访问对比"（避免外部调用传参本身随数组变大产生的 O(N) ABI 编码开销与 O(1) 索引优化混淆），本地实测 PASS。

---

### R2-B21

**严重性**: P1 🟠  
**合约**: `src/fee/DecreasePositionCollateralUtils.sol`  
**位置**: ~L212，交易亏损时未做 50/50 分流  
**状态**: REPORTED  
**found_at**: `v2026-05-28@da360e1`  
**测试**: `test/unit/fee/FeeSpecialty.t.sol` — `test_BUG_FS_04` (vm.skip)

缺陷: 交易亏损时 LP 池应承担 50%，目前全部由 trader collateral 吸收。  
修复: 在 ~L212 拆分亏损分配，LP 池 +lossAmount/2。  
**给工程师**: [R2-B21-RevenuePoolLossSplit.md](R2-B21-RevenuePoolLossSplit.md)

---

### R2-B22

**严重性**: P2 🟡  
**合约**: `src/fee/` (待实现)  
**位置**: Revenue Pool 手续费分配接口未实现  
**状态**: REPORTED  
**found_at**: `v2026-05-28@da360e1`  
**测试**: `test/unit/fee/FeeSpecialty.t.sol` — `test_BUG_FS_05` (vm.skip)

缺陷: 设计文档要求的手续费→Revenue Pool 路由未实现。  
**给工程师**: 参考 `docs/superpowers/specs/2026-05-28-fee-distribution-design.md`

---

### R2-B23

**严重性**: P2 🟡  
**合约**: `src/fee/` (待实现)  
**位置**: 借贷费/资金费→Revenue Pool 路由未实现  
**状态**: REPORTED  
**found_at**: `v2026-05-28@da360e1`  
**测试**: 暂无（待 R2-B21/22 修复后扩展）

---

## 快速命令

```bash
# 查看所有 vm.skip（应等于 BUGS.md REPORTED 条目数）
grep -r "vm\.skip(true)" test/ --include="*.sol"

# 跑所有 bug 测试
forge test --match-path "test/bugs/Bug*.t.sol" -v

# 只跑 fix 验收测试
forge test --match-path "test/bugs/Bug*.t.sol" --match-test "test_fix_" -v

# 回归全量（最终验证）
forge test 2>&1 | tail -5
```

---

## 详细条目（R3）

### R3-B01

**严重性**: P2 🟡  
**合约**: `src/order/IncreasePositionUtils.sol`  
**位置**: `increasePosition()` → token 模式（`order.isSizeDeltaUsd() == false`）执行路径  
**状态**: REPORTED  
**found_at**: `v2026-05-30@8e06226`  
**测试**: `test/e2e/accounting/phase1/P1_TokenMode.t.sol` → `test_GTOK_S2_overCollateral_refund` (vm.skip)

**问题描述**：  
当 trader 以 token 模式（`isSizeDeltaUsd=false`）开仓，并且存入的保证金（`initialCollateralDeltaAmount`）超过实际仓位所需时，多余的保证金未被退还给 trader，而是全部留在了 `positionVault` 中记为 position collateral。

**复现路径**：

- 设定 SIZE_TOKENS = 25e18，COLLATERAL_NEEDED = 10_000e6 USDC
- 调用 `sendTokens(usdc, orderVault, 12_000e6)`（多发 2000 USDC）
- `createOrder(params)` 其中 `initialCollateralDeltaAmount = 12_000e6`，`isSizeDeltaUsd = false`
- 执行 order 后：trader 损失 12000 USDC（而非 10000 USDC），position.collateralAmount = 12000e6

**期望行为**：  
多余的 2000 USDC 应在 order 执行后退还给 `params.addresses.receiver`（trader）。PR #1 描述此为已计划实现的功能。

**实际行为**：  
2000 USDC 多余保证金被全部存入 position collateral，无退款。

**修复建议**：  
在 `IncreasePositionUtils.increasePosition()` 执行完成后，计算 `depositedCollateral - actualCollateralAdded`，若 > 0 则调用 `positionVault.transferOut(collateralToken, receiver, excessAmount)` 退还。

**影响范围**：仅影响 `isSizeDeltaUsd=false` 的开仓订单，且 trader 主动多发保证金时；资金安全（不丢失），但用户体验不符合预期。

---

### R3-B02

**严重性**: P1 🟠  
**合约**: ~~`src/position/DecreasePositionCollateralUtils.sol`~~ → 实际是 `src/position/DecreasePositionUtils.sol`（见下方"✅ 已修复"，定位比原假设更精确）  
**位置**: ~~`processCollateral()` / `payForCost()` 的 funding / 负 PnL / impact 结算分支~~ → 实际是 `emitPositionDecrease()` 调用前的 `collateralDeltaAmount` 计算（无符号减法）  
**状态**: **VERIFIED**（`release/v0.3.1@d9a7fd2`，2026-07-29 回归验证，见下方"✅ 已修复"）  
**found_at**: 线上 Gordon fork（chain 99917）v0.2.0 部署；命中区块 `42873364`、`42873408`（至少两次）。**2026-06-30 再现**：v0.2.1 部署（d9096c）/ MSOL mock 市场 / 前端 UI 空头 TP / 仅 ~4.9x 杠杆盈利部分平仓，executeOrder 区块 `43468139`（详见下方"追加证据"）  
**测试**: `test/e2e/accounting/phase1/P1_ShortPartialClose.t.sol`（clean 参数 4 用例全过 → **不复现**，因未命中精确触发条件）；`test/integration/ShortPartialCloseFundingRegression.t.sol`（**新增，精确复现原触发条件并验证修复，PASS**）；关联 `docs/testing/E2E_MANUAL_REVIEW.md`

**✅ 已修复（2026-07-29，`release/v0.3.1` commit `d9a7fd2` "fix(R3-B02): underflow by short funding increasing collateral"）**：

真实根因比下方"工程师定位方向"猜测的范围**更窄、更精确**——不在 `processCollateral`/`payForCost` 的 funding/impact 结算分支内（那里的中间量本身没有下溢问题），而是在 `DecreasePositionUtils.sol` 里紧邻 `emitPositionDecrease()` 调用前的一行：

```solidity
// v0.3.0（旧，两个 uint256 相减）：
cache.initialCollateralAmount - params.position.collateralAmount()
```

`positiveFundingFeeAmount` 会在 `DecreasePositionCollateralUtils.sol:132` 累加进 `remainingCollateralAmount`（`values.remainingCollateralAmount += fees.funding.positiveFundingFeeAmount;`），当 short 部分平仓拿到的正 funding fee 足够大时，平仓后剩余仓位的 `collateralAmount()` 会**大于**平仓前的 `initialCollateralAmount`——这本身是正确、符合预期的账务结果，但上面这行**无符号相减**会在这种情况下下溢触发 `Panic(0x11)`，而这行的唯一用途是给事件传参（`collateralDeltaAmount` 只用于 `PositionDecrease` 事件展示，不影响链上状态结算）。也就是说，**触发条件与"高杠杆/薄保证金"无关**——2026-06-30 的追加证据（≈4.9x、保证金厚的仓位上同样复现）已经指向了这一点，本次修复完全印证。

修复方式：把 `collateralDeltaAmount` 改为 `int256`（`cache.initialCollateralAmount.toInt256() - params.position.collateralAmount().toInt256()`），`PositionEventUtils.emitPositionDecrease()` 的参数类型同步改为 `int256`，事件里该字段从 `uintItems` 移到 `intItems`（`uintItems` 17→16 项，`intItems` 2→3 项）。语义：抵押品减少为正、增加为负——与 `PositionIncrease` 事件的 `collateralDeltaAmount` 保持一致（该字段在 Increase 侧本来就是 `int256`，只有 Decrease 侧此前遗漏）。

**回归验证**：`test/integration/ShortPartialCloseFundingRegression.t.sol::test_regression_profitableShortPartialCloseWithPositiveFundingExecutes` 精确构造"short × 盈利部分平仓 × 正 funding fee 增加剩余抵押品"场景，断言订单成功执行（不再 Panic）、剩余抵押品确实增加、事件里 `collateralDeltaAmount` 为负值（`intItems`）。已在 `release/v0.3.1` 基线下跑通。

**下游影响（前端/索引器）**：`PositionDecrease` 事件的 `collateralDeltaAmount` 从 `uintItems` 迁移到 `intItems`，依赖动态字段解析的客户端需要同步调整读取分组。已排查 `fx100-apps`：`apps/fx-base-app/src` 与 `apps/keeper/src` 均未消费该事件字段（该字段名在这两个仓库里出现的地方全部是"创建订单时的入参"`initialCollateralDeltaAmount`，与本次改动的"事件出参"是两个不同的量，互不影响）；`packages/sdk/src/types/subsquid.ts` 里的 Subsquid GraphQL schema 已将其定义为 `BigInt`（兼容负值），但**该 squid 索引器的事件映射代码不在本仓库**，其从 `uintItems`/`intItems` 具体哪个分组取值的逻辑需要索引器维护方自行核实/更新，建议告知一声。

**问题描述**：  
高杠杆（≈45–50x、薄保证金）**short 仓位部分平仓**时，`executeOrder` 在抵押结算中发生 `Panic(0x11)`（Solidity 算术下溢/溢出）。OrderHandler 用 try/catch，失败后**静默取消订单并全额退款**（不 revert），故前端表现为"关一半失败、无报错"。**全平可正常执行**（可作临时 workaround），LONG 部分平仓正常。

**工程师定位方向**：  
**`DecreasePositionCollateralUtils` 的 funding / impact 结算分支，在薄保证金 short 部分减仓时下溢。** 疑似在 `processCollateral` 依次扣减「负资金费 → 负 PnL → 手续费」时，某一步从 `remainingCollateralAmount` 或中间量做无保护减法，薄保证金下被减成负值触发 Panic(0x11)。建议用线上 DataStore 实际参数（impact/skew/funding/min-collateral）镜像，对 live 状态做 fork 测试逐步定位下溢点。

**证据 / 排除风控**：  
watch 验证器解码 `OrderCancelled.reasonBytes`：本路径取消码恒为 `Panic`（`reasonBytes=0x4e487b71…`，args `0x11`）；**同环境**其它取消为 `LiquidatablePosition`（"min collateral for leverage"，`reasonBytes=0xbc121108…`）属合理风控。两者区分明确 → 本 bug **非风控，是算术下溢**。

**影响范围**：高杠杆 short **无法部分减仓**（功能受阻，影响主动降风险）；订单静默取消 + 全额退款，**无资金损失**。clean 隔离环境不复现 → 与线上真实 impact/skew/funding 参数 × 薄保证金 short 的交互相关。

**🔑 关键修正（2026-06-30 控制实验 → 重定位假设）**：在**同一个 short 仓位**（3 MSOL / entry 203.6667 / collateral 124.06 / ≈4.9x）上、**同样平 1 MSOL**，只改价格方向做对照：

| 平仓单 | 触发执行价 | short PnL | 结果 | tx |
|---|---|---|---|---|
| TP（LimitDecrease type3） | oracle **189**（价跌） | **+14.67（盈利）** | ❌ `Panic(0x11)` 冻结 | `0x3cf1db3c…`（block 43468139） |
| SL（StopLossDecrease type4） | oracle **211**（价涨） | **−7.33（亏损）** | ✅ **正常成交**（3→2 MSOL，loss 7.34 扣 collateral） | `0x220a514cd22555da6b0b2c9920ee92f402779b68858cbc5d2d4a914e95a10030`（block 43468145） |
| TP **全平**（LimitDecrease type3） | oracle **179**（价跌） | **+23.67（盈利）** | ✅ **正常成交**（1 MSOL→全平、Est.Receive 81.85=抵押58.23+盈利23.67−fee） | `0x1e8a8d6b28c1c1fa28eaf219f13dc99a3a56405ba277a6a3b635b7e51833a93d`（block 43468153） |

→ 对 short 而言 TP 天然落在盈利侧、SL 落在亏损侧，**真正的判别变量是 PnL 正负 / 价格方向，不是订单类型**。**结论（三者同时才下溢）：仅当 short × 盈利（价 < entry）× 部分平仓 时 `Panic(0x11)`；亏损平仓正常、全平（即使盈利）正常**——故"全平"是确切 workaround。这**推翻原"负资金费/负 PnL 结算下溢"假设** —— 实际下溢在 **short decrease 的正 PnL × 部分减仓 结算分支**。建议工程师据此重定位：检查 `DecreasePositionCollateralUtils` 处理 short **正 PnL × 部分平仓**（`sizeDeltaUsd < sizeInUsd`）时的减法/impact 分支（如盈利按比例分摊 profit→token 换算、positive-impact cap、impact pool 扣减的中间量），全平路径（比例=1）不触发。

**追加证据（2026-06-30，前端实盘 + 扩大复现面）**：经**前端 UI 下的空头 TP**（`TP/SL for MSOL` 弹窗，LimitDecrease `type=3` / `isLong=false` / `acceptablePrice=MaxUint256` / `autoCancel=true` / trigger 190）在 **Gordon fork chain 99917、v0.2.1 部署（d9096c）、MSOL mock 市场（index 3）** 上**再次复现**（原记录为 v0.2.0 / BTC 市场）。压价到 oracle 189（≤190 触发）执行：

- keeper 路径 → 订单 **`isFrozen=true`（卡死、永不成交）**；直接 `executeOrder` 重试 → tx 级 revert `Arithmetic operation resulted in underflow or overflow`（Panic 0x11），确认就是抵押结算下溢。
- **关键：突破原"高杠杆/薄保证金/负PnL"边界** —— 本仓 short `sizeInUsd=611` / `collateral=124.06` → **杠杆仅 ≈4.9x、保证金厚**；blended entry **203.67**（由 @189/211/211 三笔加仓构成）；平在 189 → short **PnL=+14.67（盈利平仓，非负 PnL）**。**部分平仓**（关 1 of 3 MSOL）。→ 说明下溢**不限于薄保证金/高杠杆/负 PnL**，触发面比原假设更广，疑点更可能在 funding/impact 结算的某个无保护减法本身（与杠杆厚薄无关）。
- **症状细分**：TP/SL（trigger decrease）路径 = **冻结**；原记录的 market-decrease 路径 = **静默取消+退款**。两者都使 short 部分平仓无法完成；用户侧均"关一半失败"。
- **前端连带影响**：现网**空头持仓的部分 TP/SL 会直接卡死（frozen）不执行**，用户无法对 short 设部分止盈/止损来主动降风险，且 UI 无任何错误提示。

**复现交易（给工程师定位）**：

- **失败执行 tx**：`0x3cf1db3c0202136c9d53841d2a51d1b120d5a4f50541790c19b26adb76fae261`（block `43468139`）。`from` = keeper `0xb5eb16b6…`，`to` = OrderHandler `0x40e409337bcb5f5acf70aa3e5ce3bac1874cd219`，selector `0x7ebc83f7`（executeOrder）。**tx 状态 = success（0x1）**：OrderHandler `try/catch` 吞掉内部 `Panic(0x11)` 并发 `OrderFrozen`，故**顶层不 revert**；**Tenderly 调用树里那条 reverted 子调用 = 下溢点**（`DecreasePositionCollateralUtils.processCollateral`/`payForCost` 分支）。

  Tenderly: `https://dashboard.tenderly.co/AladdinDAO/test/testnets/fe46ae45-688d-48db-9eeb-56e748846b1a/instance/5154b326-3749-4a09-93ef-7bf5edc4b5ff/container/cd614c70-7221-4ced-89a3-fc8131707b3b/tx/0x3cf1db3c0202136c9d53841d2a51d1b120d5a4f50541790c19b26adb76fae261`

- 直接（无 try/catch）以 keeper 重放同一订单 `executeOrder` → **顶层 revert `Arithmetic operation resulted in underflow or overflow`（Panic 0x11）**，确认下溢非风控。
- 订单 key（短头 TP）：`0xc93550b59cee404b9a9f0d745f6940cf5486f727252115c5eadcb314ab46efdd`。仓位快照：short 3 MSOL / `sizeInUsd=611` / `collateral=124.06`（≈4.9x）/ blended entry `203.6667`（@189/211/211 三笔加仓）/ 平 1 MSOL @ oracle 189（PnL +14.67）。
- 注：前端"Confirm TP/SL"的下单 tx 是 `0x3c82d138…`（`from`=用户钱包、`multicall`、success），**仅创建订单、不含 Panic**，勿误用。

---

### R3-B03

**严重性**: P2 🟡（当前核心合约处理正确、无资金损失；主要影响**费用分配 spec §四** 的实现假设）

**合约 / 文档**: `src/market/MarketUtils.sol`（`getNextFundingAmountPerSize`）+ `docs/superpowers/specs/2026-06-13-fee-distribution-implementation-spec.md` §四

**状态**: REPORTED

**found_at**: 线上 Gordon fork（chain 99917）v0.2.0；命中区块 `42873491`（SHORT 部分平仓，`Funding` 事件 `positionPaysLp = −760`（6dp）= **−0.00076 USDC**，即 **LP 反向付给 positionVault**）

**测试**: 待补（建议 fork 测试：构造失衡快速反向 → 在 EMA 滞后窗口内触发 `positionPaysLp < 0`）

**问题描述**：

费用分配实施 spec §四 把资金费净额 `positionPaysLp` 改路由到 `incrementClaimableFeeAmount`（与开/平仓手续费同一归集通道，流入分账器），并以"**`positionPaysLp ≥ 0` 恒成立、`else`（LP→持仓）分支不可达**"为前提（spec line 107–114 的公式推导）。

**该前提不严格成立**：`positionPaysLp` 实际可为**负**（链上已复现 −0.00076 USDC）。负值时核心合约走 [`MarketUtils.sol:529-534`](../../src/market/MarketUtils.sol#L529-L534) 的 `else` 分支，从市场 vault 转出给 positionVault（即 **LP 垫付**），再经 `processCollateral` 进入平仓用户保证金、最终被用户取走。

**根因（精确）**：`positionPaysLp` 公式（[`MarketUtils.sol:596-660`](../../src/market/MarketUtils.sol#L596-L660)）：

```plain text
positionPaysLp = dt × [ longOI·floor + base · skew · diffOI ]      // diffOI = longOI − shortOI
f_long  = clamp(floor + base·skew, min, max) ;  f_short = clamp(−base·skew, min, max)
```

spec 的 ≥0 推导依赖 **`skew` 与 `diffOI` 同号**（`base·skew·diffOI ≥ 0`）。但 [`MarketUtils.sol:575-589`](../../src/market/MarketUtils.sol#L575-L589) 里 **`skew` 取的是 1 小时 EMA 平滑值（`skewEMA.emaValue()`）**，而 `diffOI` 是**当前瞬时**多空差。**失衡快速切换时（OI 变化快于 EMA 跟上），`skew_EMA` 与 `diffOI` 可反号** → `base·skew·diffOI < 0` → 当其绝对值超过 `longOI·floor` 时，`positionPaysLp < 0`。

- 本例命中前盘口经历快速 加多→加空→连续部分平仓，当前已**强偏空**（LONG ≈0.4999 vs SHORT 1.0，`diffOI<0`），而 skew EMA 仍残留前段偏多倾向（`skew_EMA>0`）→ skew 项为负 → `positionPaysLp` 转负。
- （次要可能叠加因素：`f_long/f_short` 的 `clamp(min,max)` 在大失衡时也会破坏 `skew²` 抵消。）

这与设计意图一致——**`positionPaysLp ≥ 0` 在"所有仓位同时/稳态结算"下成立，但实际是按订单逐笔结算 + EMA 滞后，产生「时间错配」**：LP 在切换窗口内**垫付**资金费，待 EMA 跟上/对手方结算后回收，**总体净额 LP 仍为正**，只是**时间上错配**。

**影响**：

- **当前核心合约**：`else` 分支已正确处理负值（LP→positionVault），watch ③ `funding/zeroSum/pnlPayout` 全 OK，**无资金损失**。
- **隐患（§四 实现）**：若按 spec 把 `positionPaysLp` 全额 `incrementClaimableFeeAmount`，则 **`positionPaysLp < 0`（LP 欠持仓）无法用"增加 claimable fee"表达** → 会漏处理 / 记账错误。

**给合约工程师的建议（择一，最终由工程师定）**：

1. **拆正负（推荐，改动最小）**：仅把 `positionPaysLp > 0` 的部分路由到分账器（`incrementClaimableFeeAmount`）；`positionPaysLp < 0` 时**保留现有 `else` 分支**（LP 从 market vault 直接垫付给 positionVault）。即"正额进分账、负额 LP 自付"。
2. **floor 归零 + 容忍垫付**：路由额 `max(positionPaysLp, 0)`，负值由 LP NAV 暂时承担（垫付），文档明示 LP NAV 在失衡切换窗口可短暂回撤，稳态/对手结算后回补。语义上接受"时间错配"。
3. **累计应收净额**：维护一个 LP funding 应收/应付的累计量，仅把净正部分逐步路由到分账器（更复杂，记账更精确）。

> 备注（运营/经济性）：分账器（fx `RevenuePool`）会把进账按比例分给 协议收益库 / 保险基金 / LP，其中 LP 拿 ecosystem 余数。由于 LP 可能垫付 funding，**LP 拿到的资金费在时间上会错配**，但**长期净额应为正**（floor 恒向 LP，skew 项稳态向 LP）。建议据此选择上面的方案 1 或 2。

---

### R3-B04

**严重性**: P2 🟡（无资金损失；但**阻塞特定平仓**，订单冻结且 UI 无报错）

**类别**: **部署配置缺口**（非合约逻辑 bug）

**配置项**: DataStore `HOLDING_ADDRESS`（key `0xedb1530fc28f30624c93628ad31b7268776e448c849abb51e7e59c52548beaab`）

**状态**: REPORTED

**found_at**: 线上 Gordon fork（chain 99917）v0.2.1 部署（d9096c）/ MSOL mock 市场（index 3）/ 前端 TP/SL 弹窗 bracket。命中 executeOrder tx `0x82cd1180f0dedc8e19b7d427cacbd87ba2bf13aad9d3e47a0be6b68453be5c91`（block `43468168`）

**问题描述**：

前端 **TP/SL 弹窗一次挂 TP+SL（bracket）**于多头 1 MSOL（各 0.5）。先抬价触发 **TP 平 0.5**（正常成交，long→0.5）；随后压价触发 **SL 全平剩余 0.5** 时，`executeOrder` revert **`0xe9b78bd4 = EmptyHoldingAddress()`** → OrderHandler try/catch → **订单 `isFrozen=true`、不成交、UI 无报错**。

**根因（链上已确认，RPC 无关）**：

读 DataStore `HOLDING_ADDRESS` = **`0x0000000000000000000000000000000000000000`（未配置）**（active DataStore `0x25cBb91a384eD234DFAF03dedACb220022cCEbe2`，旧 DataStore `0x9e07…` 亦为 0）。某些**平仓输出残额**会路由到 holding 兜底地址（疑似：被 impact pool 上限截断的**正向价格冲击 diff**、或全平后的微残差/secondary output），该地址为 0 → `EmptyHoldingAddress` revert。

**为何偏偏 bracket 全平腿命中**：短头全平 TP@179、多头部分平 TP/SL 都没事；本例是 **bracket 第二腿**：TP 已平 0.5，SL 的 `sizeDeltaUsd`（建单时按 1 MSOL 定 = 剩余 sizeInUsd）→ **全平剩余**路径触发了需要 holding 的残额处理 → 撞 0x0。

**性质 / 建议**：**部署配置缺口**，非 R3-B02 那种算术下溢。**deployer 在 DataStore 配上 `HOLDING_ADDRESS`（非零，通常是 RoleStore/Treasury 之类持有地址）即解**。配后应复测同一 bracket 全平是否恢复正常。

**影响**：现网若 `HOLDING_ADDRESS` 未设，特定平仓（命中 holding 残额路径，如 bracket 全平、可能还有大正向冲击平仓）会**冻结不执行、UI 无报错**。**无资金损失**（仓位/抵押仍在链上，撤单/全平其它路径可退）。

**关联（✅ 2026-07-01 已确认）**：见 fx100-apps `FRONTEND_VERIFICATION.md` **FE-42** —— 此 SL 冻结时前端显示"已平仓"，但 Tenderly 修复后读 d9096c 原状态确认 **long 仓位仍开 0.5 MSOL、SL `0x3b89e662` 仍 `isFrozen`**，即 **FE↔链上不一致已坐实**（用户以为已平、实则仍有 0.5 MSOL 敞口）。FE 把"冻结路径 tx success"误判为成交所致。

---

### R4-B01

**严重性**: P1 🟠

**合约**: `src/vault/VaultBase.sol`

**位置**: `_withdrawAssets()` 的 shortage 分支

**状态**: **VERIFIED**（`release/v0.3.2@779eb63`，2026-08-05 `src/` 同步后本地 `forge test` 确认 `test_fix_R4B01_*`（2条）PASS，`test_bug_R4B01_*` 转为历史性 SKIP）

**found_at**: 内部审计报告 2026-07-24（原报告 #1）

**fixed_at**: `release/v0.3.2@779eb63`

**测试**: `test/bugs/BugR4B01_VaultBaseShortageWithdrawal.t.sol`

**问题描述**：

```solidity
function _withdrawAssets(uint256 assets, address receiver) internal {
    uint256 balance = IERC20(asset).balanceOf(address(this));
    if (balance < assets) {
        uint256 shortage = assets - balance;
        IStrategy(strategy).withdraw(asset, shortage, receiver); // 只把差额转给 receiver
        // Vault 本地的 balance 从未转出
    } else {
        IERC20(asset).safeTransfer(receiver, assets);
    }
}
```

当 Vault 本地余额小于目标提款额时，只把 strategy 补足的差额转给 receiver，Vault 本地已有余额永久滞留、从未转出，但上层记账（份额销毁/提款事件）已按全额处理。

**为何不是极端情况**：`VaultBase.totalAssets() = 本地余额 + strategy.totalAssets()`，且 `_tryAllocate()` 按 `strategyAllocationPercentage` 把部分资金转入 strategy——只要该比例不是 100%，本地余额与 strategy 余额就会**常态化并存**，大额提款会常态性触发这个分支。

**影响范围**：LP（`LPVault` 继承 `VaultBase`）大额提款时资产被永久滞留在 Vault 里，用户实收金额少于记账金额，无法找回（无专门的清算路径）。

**修复建议**：shortage 分支里先把本地 `balance`（非零时）转给 `receiver`，再从 strategy 提取 `assets - balance`。

---

### R4-B02

**严重性**: P2 🟡

**合约**: `src/position/DecreasePositionCollateralUtils.sol`

**位置**: `payForCost()` 资不抵债分支

**状态**: **VERIFIED**（`release/v0.3.2`，2026-08-05 `src/` 同步后本地 `forge test` 确认 PASS）

**found_at**: 内部审计报告 2026-07-24（原报告 #14）

**fixed_at**: `release/v0.3.2`（`remainingCostInOutputToken * collateralTokenPrice.min`，与本条修复建议一致）

**测试**: `test/bugs/BugR4B02_RemainingCostUsdUnit.t.sol`（`test_bug_R4B02_*` 改为历史性 `vm.skip`；`test_fix_R4B02_*` 未改动即已通过）

**问题描述**：`result.remainingCostUsd = remainingCostInOutputToken;` 直接把 collateral token 数量（token decimals 精度）赋值给一个字段名、错误类型（`InsufficientFundsToPayForCosts`）都按 USD（1e30 精度）解释的字段，从未乘回 `collateralTokenPrice` 换算。当 price ≠ 1 时，这个值和真实欠缺的 USD 金额相差达 price 倍数。已有测试 `DecreasePositionCollateralUtils.t.sol::test_payForCost_bothInsufficient_setsRemainingCost` 用 price=2 依然直接断言 token 数量，注释里承认"(in token units)"却未视为 bug。

**修复建议**：`result.remainingCostUsd = remainingCostInOutputToken * collateralTokenPrice.min;`

---

### R4-B03

**严重性**: P2 🟡

**合约**: `src/order/DecreaseOrderUtils.sol`

**位置**: `_validateOutputAmount()`（两个重载均已定义，全仓库零调用点）

**状态**: **VERIFIED**（`release/v0.3.2@7edffbf`，2026-08-05 `src/` 同步后本地 `forge test` 确认 `test_fix_R4B03_*`（2条）PASS，`test_bug_R4B03_*` 转为历史性 SKIP；Zenith 独立发现的 #3 是同一条问题，见 R5 章节）

**found_at**: 内部审计报告 2026-07-24（原报告 #22）

**fixed_at**: `release/v0.3.2@7edffbf`

**测试**: `test/bugs/BugR4B03_MinOutputAmountNotEnforced.t.sol`

**问题描述**：`Order.Numbers.minOutputAmount` 的 NatSpec 明确是"减仓/swap 的最低输出保护"，但校验函数从未被调用——用户设置的最低输出保护完全不生效，即使设置成不可能达到的天文数字，减仓订单依然正常执行。全仓库测试 fixture 里这个字段无一例外全部硬编码为 0，因此现有测试套件从未暴露这个回归。

**修复建议**：在 `transferOut()` 前调用与实际输出形态匹配的 `_validateOutputAmount()`，传入 `order.minOutputAmount()`。

---

### R4-B04

**严重性**: P2 🟡

**合约**: `src/position/PositionUtils.sol`

**位置**: `getDecreaseOrderSize()` 做多 USD 比例减仓分支

**状态**: **VERIFIED**（`release/v0.3.2@3e50700`，2026-08-05 `src/` 同步后本地 `forge test` 确认；⚠️ 但修复层级在调用方，见下方"2026-08-05 更新"）

**found_at**: 内部审计报告 2026-07-24（原报告 #20）

**fixed_at**: `release/v0.3.2@3e50700`（`DecreasePositionUtils.sol` 新增归一化 + `OrderSizeDeltaAutoUpdated` 事件，做法与本条修复建议一致）

**测试**: `test/bugs/BugR4B05_DecreaseOrderSizeRoundUpExhaustion.t.sol`（文件名沿用早期编号，内容对应本条 R4-B04）

**问题描述**：做多仓位按 USD 比例减仓时用 `Calc.roundUpDivision` 向上取整 token 数量。当 `rawSizeDelta` 只比全部 `sizeInUsd` 少 1（几乎全平仓）时，取整后 token 数量等于全部 `sizeInTokens`（相当于全平），但 `sizeDeltaUsd` 仍停留在"几乎但不是全部"的值，两个记账口径不一致。已用 `rawSizeDelta = sizeInUsd - 1` 精确复现。

**修复建议**：取整结果达到全部 `sizeInTokens` 时，同步把 `sizeDeltaUsd` 调整为全部 `sizeInUsd`，走统一全平仓路径并发出自动调整事件。

**2026-08-05 更新（修复层级核对）**：实际修复**不在**纯函数 `PositionUtils.getDecreaseOrderSize` 本身（该函数逐字未变，仍是不知道调用方是否即将耗尽仓位的纯比例计算），而在调用方 `DecreasePositionUtils.decreasePosition`——算完一次 `getDecreaseOrderSize` 后检测"token 侧已耗尽、USD 侧未全平"，命中就把 `order.sizeDelta` 改写为完整 `sizeInUsd`、发 `OrderSizeDeltaAutoUpdated` 事件，再重新调用一次得到归一化的全平仓结果。`test/bugs/BugR4B05_DecreaseOrderSizeRoundUpExhaustion.t.sol` 直接调用裸的 `getDecreaseOrderSize`，天然无法触达这个调用方层级的修复，因此 `test_fix_R4B05_almostFullClose_usdAndTokensMustAgreeOnFullClose` 已 `vm.skip(true)`（本地实测确认为 SKIP，非 FAIL），`test_bug_R4B05_almostFullClose_roundsUpToExhaustAllTokens` 仍 PASS（纯函数行为不变，符合预期）。

**2026-08-05 补充**：核对时发现测试文件注释指向的端到端回归测试 `test/integration/ExecutionPriceUsdOrder.t.sol::test_LongNearFullCloseThatConsumesAllTokensIsNormalizedToFullClose` 在仓库里并不存在（当时只有 `test_LongLifecycle_ExecutionPriceDirection_ReaderMatchesState`/`test_ShortLifecycle_ExecutionPriceDirection_ReaderMatchesState`，测的是执行价方向）。**已按注释原意补上这条测试**：真实开仓（10,000 USD 名义、2,000 USDC 抵押）后，用 `sizeDelta = sizeInUsd - 1` 发起一笔 `MarketDecrease`，驱动真实的 `orderHandler.executeOrder` 全链路，断言 `OrderSizeDeltaAutoUpdated` 事件的 `nextSizeDelta` 精确等于完整 `sizeInUsd`、且仓位最终从 `POSITION_LIST` 中彻底移除（真正全平仓，而不是 token=0/USD>0 的不一致状态）。本地 `forge test` 确认通过，调用方层级的修复现在有可重复运行的端到端自动化验证，不再只依赖源码 diff 核对。

---

### R4-B05

**严重性**: P3 🔵

**合约**: `src/order/IncreaseOrderUtils.sol`、`src/callback/CallbackUtils.sol`

**位置**: `IncreaseOrderUtils.processOrder` 返回给回调的 `EventLogData`

**状态**: REPORTED

**found_at**: 内部审计报告 2026-07-24（原报告 #7）

**测试**: `test/bugs/BugR4B04_IncreaseCallbackEventDataEmpty.t.sol`（记录当前不对称行为的特征化测试，非 bug 复现/修复对）

**问题描述**：加仓执行完成后，传给 `afterOrderExecution` 回调的 `eventData` 恒为空结构体；减仓侧对应位置会填入 `outputToken`/`secondaryOutputToken`/`outputAmount`/`secondaryOutputAmount`/`orderSizeDeltaUsd`/`orderInitialCollateralDeltaAmount` 六个真实字段。依赖回调获取执行结果的集成方，加仓路径完全拿不到数据。回调失败不影响订单执行本身，属于集成体验问题，不是资金安全问题。

**修复建议**：让 `IncreasePositionUtils.increasePosition` 返回实际执行结果，构造与减仓路径一致的 `EventLogData`；短期内若无法提供，应在接口文档明确说明。

---

### 2026-08-05 给工程/测试团队的提醒（R4 章节）

- **R4-B01（VaultBase shortage 提款滞留）、R4-B03（`minOutputAmount` 从未校验）**：本地 2026-08-05 `forge test` 确认 `test_fix_R4B01_*`、`test_fix_R4B03_*` 均已 PASS，`test_bug_*` 均已转为历史性 `SKIP`，已随本轮一并升级为 **VERIFIED**（见上方各条详情）。
- **R4-B04（做多减仓取整耗尽）**：~~测试文件注释里指向的"已通过端到端回归测试"在当前仓库找不到~~ ——**已补上**：`test/integration/ExecutionPriceUsdOrder.t.sol::test_LongNearFullCloseThatConsumesAllTokensIsNormalizedToFullClose` 现已存在并本地 PASS，驱动真实 `orderHandler.executeOrder` 全链路验证 `OrderSizeDeltaAutoUpdated` 事件+归一化后的最终仓位状态，调用方层级的修复不再只有源码核对。

---

### R5-B01

**严重性**: P1 🟠

**合约**: `src/position/PositionUtils.sol`、`src/pricing/PositionPricingUtils.sol`

**位置**: `isPositionLiquidatable()`

**状态**: **VERIFIED**（`release/v0.3.2@13880f2`，2026-08-05 `src/` 同步后本地 `forge test` 确认 `test_fix_R5B01_liquidationCheck_usesActualBalanceWasImprovedTier` PASS，`test_bug_R5B01_*` 转为历史性 SKIP）

**found_at**: 外部审计 Zenith 初步发现 #2（2026-07-30 核对）

**fixed_at**: `release/v0.3.2@13880f2`——2026-08-03 首次核对 `release/v0.3.2`（HEAD `7d639c9`）时发现工程师改过 `isPositionLiquidatable` 却漏修这条，反馈后当天下午补推 `13880f2`，`test_fix_R5B01_*` 在隔离 worktree 里验证已从 FAIL 翻转为 PASS

**测试**: `test/bugs/BugR5B01_LiquidationIgnoresFeeTier.t.sol`

**问题描述**：`isPositionLiquidatable()` 只取 `getExecutionPriceForDecrease(...).executionPrice`，把返回结构体里正确计算出的 `balanceWasImproved` 丢弃；随后传给 `getPositionFees()` 的是 `IsPositionLiquidatableCache.balanceWasImproved`——这个字段在整个函数里从未被赋值，恒为 Solidity 默认值 `false`。`getPositionFees` 用这个标志位从 `positionFeeFactorKey(marketIndex, balanceWasImproved)` 读取手续费档位，`true`（改善平衡）档位按设计通常低于 `false`（未改善）档位（`FeeTier.t.sol` 已确认此设计意图）。

**结果**：不管仓位平仓实际上是否改善市场平衡，清算判定永远按"未改善"（更高）的手续费档位计算成本，导致 `remainingCollateralUsd` 被低估。本次测试证明：只改变"改善"档位的手续费因子，清算判定结果完全不变——证明这个档位在这条路径上是死代码。

**影响范围**：一个本应健康、平仓其实改善市场平衡的仓位，可能因为费用算多了而被误判为可清算（提前清算）；合法的加仓/减仓也可能因为这个偏高的费用估算而 revert。不是资金被盗，但会造成不必要的提前清算或订单 DoS。

**修复建议**：让 `isPositionLiquidatable` 保留 `getExecutionPriceForDecrease` 返回的 `balanceWasImproved`，赋给 `cache.balanceWasImproved` 后再传入 `getPositionFees`。

---

### R5-B02

**严重性**: P0 🔴

**合约**: `src/pricing/PositionPricingUtils.sol`、`src/common/math/LogExpMath.sol`

**位置**: `getPriceImpactSpread()`

**状态**: **VERIFIED**（`release/v0.3.2@b81786f`，2026-08-05 `src/` 同步后本地 `forge test` 确认 `test_fix_R5B02_*`（2条）PASS，`test_bug_R5B02_*` 转为历史性 SKIP）

**found_at**: 外部审计 Zenith 初步发现 #4（2026-07-30 核对）

**fixed_at**: `release/v0.3.2@b81786f`（`exp` 调用前新增 `priceImpactExponent > MAX_NATURAL_EXPONENT` 判断，超界直接返回 `MAX_PRICE_IMPACT_SPREAD`，与本条修复建议一致）

**测试**: `test/bugs/BugR5B02_PriceImpactExpUnboundedRevert.t.sol`

**问题描述**：`getPriceImpactSpread` 把无上界的 `orderSize * priceImpactParameter / depth` 直接喂给 `LogExpMath.exp`；`exp` 内部有 `require(x <= MAX_NATURAL_EXPONENT /* 130e18 */, "INVALID_EXPONENT")`。设计意图里用来兜底的 `Math.min(priceImpactSpread, MAX_PRICE_IMPACT_SPREAD)` 封顶逻辑在 `exp` **之后**才执行，无法阻止这次 revert。

**与已跟踪的 R2-B10 的区别**：R2-B10 是 `orderSize * priceImpactParameter` 这两个 `uint256` 相乘本身溢出（需要单个操作数达到 ~2^128 的极端量级）；本问题用完全正常量级的参数（`priceImpactParameter=0.6`，真实 ETH 市场配置值）在低流动性/新上线市场的 `depth`（如 $1,000）叠加一笔中等规模订单（$650,000）就能触发——触发门槛低得多，且不需要任何极端/攻击性输入，正常的市场配置漂移或新市场上线初期就可能撞上。

**影响范围**：`getPriceImpactSpread` 在 `getDynamicSpread → getExecutionPriceForDecrease` 链路上，而后者被 `isPositionLiquidatable` 直接调用——一旦这条路径 revert，**清算判定本身都算不出来**。这意味着本该清算的仓位可能无法被清算（潜在坏账），而不只是普通订单执行失败/冻结。Zenith 原文：not fund theft, but a DoS/liveness and potential-insolvency issue。

**修复建议**：在把指数传给 `LogExpMath.exp` 之前先做封顶（例如 `SignedMath.min(exponent, MAX_NATURAL_EXPONENT)`），或者在调用 `exp` 前捕获/判断指数是否超界，超界时直接返回 `MAX_PRICE_IMPACT_SPREAD` 而不是让 `exp` 自己 revert。

---

## R6（2026-08-05）：命名多设备槽位模型（"Named Agent"）核对

`release/v0.3.2` 把子账户从旧的无上限地址 set 模型换成了 `MAX_SUBACCOUNT_SLOTS(=4)` 的命名槽数组，对应 Notion 设计文档《FX100 Flash 1CT · 命名会话密钥(Named Agent)最终方案》。补齐这批多设备场景的测试覆盖（同名覆盖、不同名占用独立槽位、超限 revert、按地址移除 vs 按名字移除的语义差异）时，发现一条与设计文档字面表述不完全一致的行为差异，已提交工程师确认。

### R6 Bug 总览

| ID | 严重性 | 合约文件 | 描述 | 状态 | 测试文件 |
|---|---|---|---|---|---|
| [R6-B01](#r6-b01) | — | `src/subaccount/SubaccountUtils.sol` | `removeSubaccount`（按地址移除）只清空槽位地址、保留槽位名称/active 标记，不释放槽位容量；`removeSlot`（按名字移除）才会完全释放 | **CLOSED（非 bug，设计确认）** | Subaccount.t.sol |

### R6-B01

**严重性**: 无（非 bug）

**合约**: `src/subaccount/SubaccountUtils.sol`

**位置**: `removeSubaccount()`（按地址移除）vs `removeSlot()`（按名字移除）

**状态**: **CLOSED（非 bug，2026-08-06 工程师确认为 by design）**

**found_at**: 2026-08-05，补齐 Named Agent 多设备槽位测试覆盖时发现

**closed_at**: 2026-08-06，工程师回复确认为有意设计

**行为**（已用测试证实，见 `test_subaccount_removeSubaccount_byAddress_doesNotFreeSlotForNewName`）：`removeSubaccount(account, subaccount)` 只清空槽位地址（`subaccountSlotSubaccountKey → address(0)`），保留槽位名称和 `subaccountSlotActiveKey`；只有 `removeSlot(account, slot)`（按名字移除）才会同时清空名称、地址、active 标记，真正释放槽位容量供全新设备名使用。

**2026-08-06 工程师确认（by design）**：这是有意为之的两级操作，给前端更多交互选择空间：

- `removeSubaccount`（按地址）——只撤销该槽位当前绑定的子账户授权，**槽位/设备本身仍保留**，前端可以继续把这台设备显示在"我的交易设备"列表里（例如显示"已撤销授权"状态），用户之后可以在同一个设备槽位下重新登记新的子账户。
- `removeSlot`（按名字）——彻底删除这个设备槽位，设备从列表中消失，释放容量给全新设备使用。

也就是说"按地址移除后槽位不释放容量"不是缺陷，而是刻意保留槽位以支持"设备仍在列表中显示、但当前无有效授权"这种前端交互状态；真正想彻底移除设备并腾出容量时，前端应该调用 `removeSlot`。之前测试里"4 个槽位全部按地址移除后会永久卡在 `MaxSubaccountSlotsExceeded`"的观察**本身没错**，只是不构成 bug——这就是该函数的预期行为边界：用户需要用 `removeSlot` 才能真正腾出容量。

保留的测试用例（改为回归测试，锁定这个确认后的预期行为，防止未来重构时被误改）：

- `test_subaccount_removeSubaccount_byAddress_doesNotFreeSlotForNewName`
- `test_subaccount_removeSubaccount_byAddress_sameNameCanReRegister`
- `test_subaccount_removeSlot_byName_freesSlotForNewName`

### R6 统计

| 状态 | 数量 | 条目 |
|---|---|---|
| REPORTED（待修复） | 0 | — |
| CLOSED（非 bug，设计确认） | 1 | R6-B01（2026-08-06 工程师确认） |

---

## R7（2026-08-06）：ADL/减仓边界场景核对

补充核对两条 ADL、清算边界相关的场景（编号来自另一份审查材料，其 `#2`/`#7` 编号与 R5 的 Zenith

初步发现编号**不是同一份文档**，恰好数字撞车——按内容逐条核对，不按编号映射，避免重蹈之前几轮

"commit 标号≠本文档 Bug ID"的混淆）。

### R7 Bug 总览

| ID | 严重性 | 合约文件 | 描述 | 状态 | 测试文件 |
|---|---|---|---|---|---|
| [R7-B01](#r7-b01) | P1 🟠 | `src/adl/AdlUtils.sol`、`src/exchange/AdlHandler.sol` | ADL 完全不检查仓位的清算保护期（`graceEnd`/`graceStart`），与清算路径的硬性 on-chain 兜底不对称 | REPORTED | AdlExecution.int.t.sol |
| [R7-B02](#r7-b02) | — | `src/position/DecreasePositionUtils.sol` | 部分减仓若导致剩余抵押品+PnL 低于 `MIN_COLLATERAL_USD`，不会 revert 也不会按请求的部分金额执行，而是静默改写为全平仓 | **CLOSED（非 bug，设计确认，代码注释已明确说明意图）** | CollateralAdjustment.t.sol |

### R7-B01

**严重性**: P1 🟠

**合约**: `src/adl/AdlUtils.sol`（`createAdlOrder`）、`src/exchange/AdlHandler.sol`（`executeAdl`）、`src/position/DecreasePositionUtils.sol`（`decreasePosition`）

**位置**: ADL 创建/执行订单的全流程

**状态**: REPORTED

**found_at**: 2026-08-06，核对审查材料提出的"ADL 保护期免疫"疑虑

**核对方法**：全仓库 `grep graceEnd\|graceStart`，命中：

- `src/position/Position.sol`：字段定义 + getter/setter（数据层，任何路径都能读到）。
- `src/liquidation/LiquidationUtils.sol:44`：`createLiquidationOrder` 里 `if (position.graceEnd() > block.timestamp) revert FxErrors.PositionNotLiquidatable(positionKey);`——**唯一**检查保护期的地方。
- 其余（`src/adl/`、`src/exchange/AdlHandler.sol`、`src/order/`）**零匹配**。

**确认结论**：

1. `AdlUtils.createAdlOrder` 创建的订单类型是 `Order.OrderType.MarketDecrease`（不是 `Liquidation`），全程不读 `graceEnd`/`graceStart`。
2. `DecreasePositionUtils.decreasePosition` 里唯一会重新校验"是否真的该清算"的分支（`isPositionLiquidatable`/`PositionShouldNotBeLiquidated`，src/position/DecreasePositionUtils.sol:246-262）用 `Order.isLiquidationOrder(params.order.orderType())` 做门槛——ADL 订单类型是 `MarketDecrease`，天然不满足，这段校验对 ADL 完全不生效。
3. 也就是说：清算有两道硬性 on-chain 关卡（`createLiquidationOrder` 的保护期检查 + `decreasePosition` 的可清算性复核），ADL 一道都没有——只要触发 ADL 的前置条件（全局净兑付率超限 + 目标仓位方向 PnL>0），保护期内的仓位照样会被 ADL 减仓。

**实测证明**（`test/integration/risk/AdlExecution.int.t.sol`）：

- `test_Integration_Risk_AdlExecute_IgnoresLiquidationGracePeriod`：把 setUp 里的仓位设置为 `graceEnd = now + 1 hour`（保护期还剩 1 小时），照常触发 ADL 条件后调用 `executeAdl`——**执行成功，不 revert**。
- `test_Integration_Risk_LiquidationOrder_RevertsForSameGracePeriodPosition`（对照组）：同一个仓位，改走 `LiquidationUtils.createLiquidationOrder`——**revert `PositionNotLiquidatable`**，证明保护期机制本身有效，只是 ADL 没接入。

**影响范围**：保护期的设计目的是给刚开仓/刚调整过的仓位一段"免打扰期"（详见 `docs/bugs/BUGS.md` 其他清算相关条目、`docs/gitbook` 交易指南对外承诺）。ADL 完全不检查这个字段意味着：一个仍在保护期内、恰好方向盈利的仓位，只要市场整体净兑付率超限，就可能被 ADL 强制减仓——这跟"保护期内不会被强制处置"的用户预期不符，虽然不是资金被盗，但破坏了一个对外承诺的保护机制。

**修复建议**：在 `AdlUtils.createAdlOrder`（创建 ADL 单前）或 `AdlHandler.executeAdl`（选定目标仓位后）加一道 `graceEnd` 检查，仓位仍在保护期内时应跳过该仓位（继续尝试列表里的下一个候选仓位）或直接 revert，具体策略需要产品/工程师定：是"保护期内的仓位对 ADL 免疫，ADL 只能挑保护期已过的仓位"，还是接受"ADL 是系统性风控手段，优先级高于个体保护期"这个设计取舍——需要一次明确的产品决策，而不是当前这种"未定义/没人管"的状态。

**深入分析（持续更新）**：[docs/analysis/adl/risk_grace_period_immunity.md](../analysis/adl/risk_grace_period_immunity.md) —— 记录了"保护期"立法原意的两种互斥理解及其对本条结论的影响、修复方案的三个选项取舍、当前 ADL keeper 实际实现（仅有 `Manual` 人工策略，`Auto`/`RiskBased` 尚未实现）对真实触发概率的影响等，后续每次核对/讨论直接追加在该文档，不在本条目重复展开。

### R7-B02

**严重性**: 无（非 bug）

**合约**: `src/position/DecreasePositionUtils.sol`

**位置**: `decreasePosition()` 第 200-217 行的最小抵押品检查分支

**状态**: **CLOSED（非 bug，代码注释已明确说明意图）**

**found_at**: 2026-08-06，核对审查材料提出的"跌破清算线后的减仓"疑虑

**代码行为**（源码注释原文，第 200-205 行）：「if the remaining collateral including position pnl will be below the min collateral usd value, then close the position / if the position has sufficient remaining collateral including pnl then allow the position to be partially closed and the updated position to remain open」——即：只要一笔部分减仓执行后，剩余抵押品+PnL 会跌破 `MIN_COLLATERAL_USD`，合约就会把这笔订单**静默改写为全平仓**（把 `order.sizeDelta` 直接改成仓位全部 `sizeInUsd`，重新计算，并发出 `OrderSizeDeltaAutoUpdated` 事件），而不是 revert、也不是按用户原本请求的较小金额执行。这是代码注释里明确写出来的既有设计，不是遗漏。

**实测证明**（`test/integration/CollateralAdjustment.t.sol::test_CollateralAdjustment_PartialDecreaseBelowMinCollateralUsd_AutoClosesFully`）：开仓 1,000 USDC 抵押、10,000 USD 名义仓位；开仓后把 `MIN_COLLATERAL_USD` 抬高到 2,000（超过现有抵押品的美元价值），此时请求一笔普通的 30% 部分平仓——结果：`OrderSizeDeltaAutoUpdated` 触发，`nextSizeDelta` 等于仓位全部 `sizeInUsd`；最终仓位 `sizeInUsd`/`sizeInTokens` 都归零，即被强制全平，而不是执行请求的 30%。

**这不是 bug，但值得记录和补测试的原因**：这个机制本身是合理的风控（避免留下一个抵押品不够、马上要被清算的"僵尸仓位"），但**行为对用户是隐性的**——前端如果只是简单地把"部分平仓"请求原样提交，用户可能会意外地把整个仓位平掉，且事前完全没有 UI 提示。建议：

1. 前端在提交减仓请求前，最好能预判"剩余抵押品是否会跌破 `MIN_COLLATERAL_USD`"，如果会，应提前提示用户"这笔操作会导致仓位被完全平掉"，而不是让用户执行后才发现。
2. 已用上述测试把这个确认后的行为锁定为回归测试，防止未来重构时被误改成"revert"或者"按原始金额部分执行"这两种都不对的形态。

---

## Round 8 (R8) — Zenith 外部审计专题（全部 30 条，逐条源码核对完成）

> **专题说明**：这是 fx100-contracts 的 **Zenith 专题**——Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol`（只有用户账号能看，本机用 `gh` 的 Gondoneth 账号拉取）里的全部 30 条发现（#1~#30，全部 `OPEN`），逐条按内部 ID `R8-B01`~`R8-B30` **与 Zenith 原编号 #1~#30 一一对应**（`R8-B0N` ↔ `#N`），方便直接拿工程师的修复 commit/PR 按编号对照核对状态。
> **原文镜像**：全部 30 条 issue 原文（逐字保留，未改写未翻译）在 [docs/audit/ZENITH_FINDINGS.md](../audit/ZENITH_FINDINGS.md)，以后 Zenith 那边新增/更新的 issue 都同步到那一份文件，不再按日期开新文件。
> **合约基线**：`release/v0.3.2`，本地 `git diff origin/release/v0.3.2 -- src/` 无输出，`src/` 与该基线逐字节一致，可直接对本地源码核实。
> **核对方法**：全部 30 条均已完成静态源码核对（读代码 + 追踪调用链 + 检查部署/管理脚本里的实际写入路径/配置值，逐条给出 file:line 级别证据，而不是只信 Zenith 的文字描述）。**核对完成 ≠ 已修复**——本轮全部条目状态仍是 `REPORTED`，等工程师认领后逐条转 `IN_PROGRESS`/`FIXED`/`VERIFIED`。
> **测试进度**：`R8-B01`/`R8-B02`/`R8-B16`（含 #23）/`R8-B19`（含 #25）/`R8-B20`/`R8-B30` 已有专题 Foundry 测试（`test/bugs/zenith/`，共 6 个文件 22 条 test：14 条 `test_bug_*` 全部 PASS，复现当前真实行为；8 条 `test_fix_*` 按仓库惯例 `vm.skip(true)`，写明修复后的目标断言，供工程师修复后摘掉 skip 验收），其余 22 条测试文件"待补"，每条详情里都留了具体的测试场景建议，供后续补齐或直接转给工程师作为验收标准。**全量 `forge test` 回归确认 1893 passed / 0 failed / 46 skipped，未影响任何既有测试。**
> **对照追踪表用法**：工程师修复后，把对应 `R8-B0N` 条目的「状态」从 `REPORTED` 改成 `FIXED`（并写清楚修复 commit），核对完 fix test 转绿后再改成 `VERIFIED`——跟本文档其它轮次（R2/R4/R5/R7）的流程完全一致。

### R8 Bug 总览

| ID | 严重性 | Zenith 原编号 | 描述 | 状态 | 测试文件 |
|---|---|---|---|---|---|
| [R8-B01](#r8-b01) | P1 🟠 | #1 | 风控预言机同步资金费四参数时用 setUint 写入，但资金费结算路径用 getInt 读取，两个 mapping 物理隔离，同步永远静默无效 | REPORTED | ZenithB01_ConfigSyncerFundingMismatch.t.sol |
| [R8-B02](#r8-b02) | P0 🔴 | #2 | 子账户专属 relay 费用 USD 上限声明未启用，唯一兜底是可选的全局 WNT cap；恶意/被盗子账户可自任 relayer+抬高 gasprice，反复抽取主账户 USDC | REPORTED | ZenithB02_SubaccountRelayFeeUncapped.t.sol |
| [R8-B03](#r8-b03) | P2 🟡 | #3 | ExternalHandler.makeExternalCalls 无访问控制，可扫走任意滞留 ERC20（继承自 GMX，非新退化） | REPORTED | 待补（见条目内建议方案） |
| [R8-B04](#r8-b04) | P2 🟡 | #4 | LIMITED_CONFIG_KEEPER 可把 MAX_OPEN_INTEREST 设 0，无下限校验，DoS 掉整个市场开仓 | REPORTED | 待补（见条目内建议方案） |
| [R8-B05](#r8-b05) | P2 🟡 | #5 | relay 精简签名回退可代签受害者提交减仓订单并把收益转给攻击者（继承自 GMX Ledger 兼容设计） | REPORTED | 待补（见条目内建议方案） |
| [R8-B06](#r8-b06) | P1 🟠 | #6 | 普通 keeper 可把 PRICE_FEED_HEARTBEAT_DURATION 设 type(uint256).max 永久关闭喂价过期校验，注释里承诺的 TimelockConfig 从未实现 | REPORTED | 待补（见条目内建议方案） |
| [R8-B07](#r8-b07) | P2 🟡 | #7 | 空/未配置 oracle 的新市场会让全局净兑付率聚合 revert，冻结所有市场的 LP 提款和 ADL | REPORTED | 待补（见条目内建议方案） |
| [R8-B08](#r8-b08) | P1 🟠 | #8 | StrictBank 全局余额快照可被下一笔 LimitIncrease 捕获后立即撤单卷走（跟 #15 同根因） | REPORTED | 待补（见条目内建议方案） |
| [R8-B09](#r8-b09) | P2 🟡 | #9 | uiFeeReceiver 可在下单后临时抬价抽取更高 UI 手续费（当前 MAX_UI_FEE_FACTOR=0 休眠） | REPORTED | 待补（见条目内建议方案） |
| [R8-B10](#r8-b10) | P1 🟠 | #10 | ExternalHandler.makeExternalCalls 可预先给自己批无限 approval，等未来滞留余额出现随时提走 | REPORTED | 待补（见条目内建议方案） |
| [R8-B11](#r8-b11) | P2 🟡 | #11 | updateFundingState 在 processOrder 之前采样，孤立单边仓位持仓期内自身失衡永不计入资金费 | REPORTED | 待补（见条目内建议方案） |
| [R8-B12](#r8-b12) | P2 🟡 | #12 | REFUND_EXECUTION_FEE_GAS_LIMIT 配置不当会让撤单也回滚整笔 keeper 交易（当前该参数=0 休眠） | REPORTED | 待补（见条目内建议方案） |
| [R8-B13](#r8-b13) | P2 🟡 | #13 | 被清算/ADL 账户可设置吃 gas 的 callback 让 keeper 交易回滚重试（gas 消耗型骚扰，非资金损失） | REPORTED | 待补（见条目内建议方案） |
| [R8-B14](#r8-b14) | P1 🟠 | #14 | BaseRouter 转账辅助函数无角色门槛，可直接转走路由合约滞留 ETH | REPORTED | 待补（见条目内建议方案） |
| [R8-B15](#r8-b15) | P1 🟠 | #15 | StrictBank 全局余额快照可被抢先建单捕获，跟 #8 同根因，触发面更广 | REPORTED | 待补（见条目内建议方案） |
| [R8-B16](#r8-b16) | P1 🟠 | #16 | Config.setInt 完全不跑 validateRange，生产资金费参数走这条路径，链上校验形同虚设 | REPORTED | ZenithB16B23_SignedFundingBypassesRange.t.sol |
| [R8-B17](#r8-b17) | P1 🟠 | #17 | LP 赎回不重新校验 pool-relative OI 上限，可能瞬间超限直到下次 ADL 检查（异步风控窗口） | REPORTED | 待补（见条目内建议方案） |
| [R8-B18](#r8-b18) | P2 🟡 | #18 | getPriceImpactSpread 只按单笔规模计算，拆单执行可系统性少付非线性价差，LP 承担差额 | REPORTED | 待补（见条目内建议方案） |
| [R8-B19](#r8-b19) | P1 🟠 | #19 | MIN_COLLATERAL_FACTOR 与清算因子互不交叉校验，误配置可致新开仓位立即可清算 | REPORTED | ZenithB19B25_CollateralFactorGaps.t.sol |
| [R8-B20](#r8-b20) | P1 🟠 | #20 | cappedPoolPnl>0 条件排除封顶归零场景，MAX_PNL_FACTOR_FOR_TRADERS=0 时 PnL 封顶完全失效（当前 24 市场均配置正确，休眠） | REPORTED | ZenithB20_ZeroFactorUncappedPnl.t.sol |
| [R8-B21](#r8-b21) | P1 🟠 | #21 | relay 路径 shouldCapMaxExecutionFee 硬编码 false，子账户可用大额 executionFee+恶意 callback 套现（与 #2 根因不同） | REPORTED | 待补（见条目内建议方案） |
| [R8-B22](#r8-b22) | P1 🟠 | #22 | OI 变化后 skewEMA 残留旧失衡度直到下一笔交易才纠正，资金费错配累积 | REPORTED | 待补（见条目内建议方案） |
| [R8-B23](#r8-b23) | P1 🟠 | #23 | Config.setInt 无校验，连 CONFIG_KEEPER 本身都没有链上防呆（与 #16 同族，范围更广） | REPORTED | ZenithB16B23_SignedFundingBypassesRange.t.sol |
| [R8-B24](#r8-b24) | P2 🟡 | #24 | 子账户下单校验未检查 uiFeeReceiver，可抽取主账户 UI 手续费（当前 MAX_UI_FEE_FACTOR=0 休眠） | REPORTED | 待补（见条目内建议方案） |
| [R8-B25](#r8-b25) | P1 🟠 | #25 | MIN_COLLATERAL_FACTOR 无下限+OI 乘数兜底键从未配置，可用远低于设计杠杆比例开仓 | REPORTED | ZenithB19B25_CollateralFactorGaps.t.sol |
| [R8-B26](#r8-b26) | P1 🟠 | #26 | subsidized 分支未清空 calldata 里的 executionFee 字段，子账户可谎报套现自动充值余额（当前豁免普遍开启，非休眠） | REPORTED | 待补（见条目内建议方案） |
| [R8-B27](#r8-b27) | P1 🟠 | #27 | handleSubaccountApproval 从未写入 integrationId，签名撤销/切换集成 ID 从未真正生效 | REPORTED | 待补（见条目内建议方案） |
| [R8-B28](#r8-b28) | P1 🟠 | #28 | ProtocolTreasury.multicall 绕开 TOKEN_RECEIVER_ROLE 白名单，feeKeeper 可把国库任意 ERC20 转给任意地址 | REPORTED | 待补（见条目内建议方案） |
| [R8-B29](#r8-b29) | P1 🟠 | #29 | AdlHandler.updateAdlState 完全不设价格新鲜度上限也不要求提交价格，可用陈旧价格错误启动 ADL | REPORTED | 待补（见条目内建议方案） |
| [R8-B30](#r8-b30) | P0 🔴 | #30 | settleFundingFees 交易者付 LP 方向只记账不转账，FeeHandler 分账时按 40/20/40 复用普通手续费比例，LP 应得资金费实际只拿到 40% | REPORTED | ZenithB30_FundingFeeSplitDivertsLpShare.t.sol |

### R8 统计

| 状态 | 数量 | 条目 |
|---|---|---|
| REPORTED | 30 | R8-B01 ~ R8-B30（全部） |
| 已有专题测试 | 6 | R8-B01, R8-B02, R8-B16/B23, R8-B19/B25, R8-B20, R8-B30 |
| 待补测试（方案已写） | 24 | 其余全部条目 |
| 严重性分布 | P0×2 / P1×18 / P2×10 | — |
| 当前休眠（配置项默认关闭，一旦启用立即可利用） | 4 | R8-B09（#9）、R8-B12（#12）、R8-B20（#20）、R8-B24（#24） |
| 设计决策待定（非纯代码缺陷） | 2 | R8-B05（#5）、R8-B17（#17） |

### R8-B01

**严重性**: P1 🟠（Zenith 原文：Impact High；未标注 Likelihood）

**合约**: `src/config/ConfigSyncer.sol`（`sync`）、`src/config/Config.sol`（`setUint`/`setInt`）、`src/data/DataStore.sol`（`uintValues`/`intValues`）、`src/market/MarketUtils.sol`（`getNextFundingAmountPerSize`）

**位置**: `ConfigSyncer.sol` 的 `sync()` 函数体、`_initAllowedBaseKeys()` 的资金费四个 allow-list 键

**状态**: REPORTED

**found_at**: 2026-08-10，核对 Zenith 审计补充发现 #1

**核对方法**：逐段读源码追踪同一个 `bytes32 fullKey` 在"风控预言机写入路径"和"资金费结算读取路径"上分别落到哪个存储位置。

**确认结论**（100% 与 Zenith 报告描述一致）：

1. `ConfigSyncer._initAllowedBaseKeys()`（`src/config/ConfigSyncer.sol:132-148`）把 `FUNDING_FLOOR_FACTOR`、`FUNDING_BASE_FACTOR`、`MIN_FUNDING_FACTOR_PER_SECOND`、`MAX_FUNDING_FACTOR_PER_SECOND` 四个键放进了 allow-list，允许 Chaos Labs 风控预言机通过 `sync()` 推送更新。
2. `sync()` 内部（`ConfigSyncer.sol:96`）把预言机推送的 `newValue` 用 `Cast.bytesToUint256` 解码成 `uint256`，再调用 `config.setUint(baseKey, data, updatedValue)`（`ConfigSyncer.sol:99`）。
3. `Config.setUint`（`Config.sol:237-257`）内部调用 `store.setUint(fullKey, value)`，写入 `DataStore.uintValues[fullKey]`（`DataStore.sol:27,82`）。
4. 而资金费实际生效的读取路径 `MarketUtils.getNextFundingAmountPerSize`（`MarketUtils.sol:526-529`）四行代码全部用 `dataStore.getInt(...)`，读的是 `DataStore.intValues[fullKey]`（`DataStore.sol:29,162`）——`uintValues` 和 `intValues` 是两个完全独立的 mapping，物理存储位置不同，即便 `fullKey` 字节完全相同也互不影响。
5. 交叉验证"资金费本该走 int 路径"：管理员正常配置资金费的脚本 `scripts/configureMarket.ts:376-403` 对这四个键用的是 `setConfigIntIfNeeded`（内部走 `Config.setInt`→`store.setInt`→写 `intValues`），证明 int 才是资金费结算真正读取的存储位置，`ConfigSyncer` 用 `setUint` 是接错了管线。
6. `Config.setUint` 内部会跑 `ConfigUtils.validateRange` 做上下限校验（`Config.sol:242`），但 `Config.setInt` 完全没有调用 `validateRange`（`Config.sol:264-282`）——也就是说就算 `ConfigSyncer` 改成走 int 路径，现有的 `MAX_FUNDING_FACTOR_PER_SECOND` 上限校验、`min ≤ max` 校验目前也不会在 `setInt` 侧生效，需要一并搬过去，否则修复后风控预言机仍能推送越界值。

**影响**：

- Chaos Labs 风控预言机针对这四个资金费参数的自动化调整，从部署起就是**静默空操作**——链上资金费永远停留在最后一次人工 `setInt`（`configureMarket.ts`）设置的值，风险事件下资金费无法自动响应，"自动化风控"名不副实但没有任何 revert 或事件提示这一点。
- `updatedValue` 走 uint 解码，即使修好了写入目标，`FUNDING_FLOOR_FACTOR`/`MIN_FUNDING_FACTOR_PER_SECOND` 这类需要为负值的参数（资金费接收方向）在当前 uint 编码下也表示不了，修复时需要同时改类型。

**是否需要专题测试/验证**：**需要**。建议：

1. 一条集成测试：调用 `ConfigSyncer.sync()`（mock `IRiskOracle` 返回一条资金费更新）后，分别断言 `dataStore.getUint(fullKey)` 确实变了、`dataStore.getInt(fullKey)`（即 `MarketUtils` 实际读取路径）**没变**——直接证明"预言机推送被静默吞掉"这个具体后果，比单纯读代码更有说服力，也能在工程师修复后转成回归测试防止再犯。
2. 待工程师给出修复方案（大概率是把这四个键的同步路径切到 `setInt`）后，补一条"修复后 `sync()` 确实驱动了 `MarketUtils` 读到的值"的端到端测试，并把 `validateRange` 的上下限校验一并挪到 int 路径核对到位。

### R8-B02

**严重性**: P0 🔴（Zenith 原文：Impact High / Likelihood Low）

**合约**: `src/router/relay/BaseRelayRouter.sol`（`_payRelayFee`）、`src/router/relay/SubaccountRelayRouter.sol`、`src/constants/FX100Keys.sol`（`MAX_RELAY_FEE_SWAP_USD_FOR_SUBACCOUNT`）、`src/error/FxErrors.sol`（`MaxRelayFeeSwapForSubaccountExceeded`）

**位置**: `BaseRelayRouter.sol:221-266`（`_payRelayFee`）

**状态**: REPORTED

**found_at**: 2026-08-10，核对 Zenith 审计补充发现 #2

**核对方法**：读 `_payRelayFee` 全函数体 + 全仓库 grep 两个"专属子账户上限"符号的所有引用。

**确认结论**（100% 与 Zenith 报告描述一致）：

1. `FX100Keys.MAX_RELAY_FEE_SWAP_USD_FOR_SUBACCOUNT`（`FX100Keys.sol:393-394`）和 `FxErrors.MaxRelayFeeSwapForSubaccountExceeded`（`FxErrors.sol:463`）确实被声明；`Config.sol:458` 把该键加进了 allow-list（可配置），但全仓库 `grep -rn MaxRelayFeeSwapForSubaccountExceeded src/` **零处 revert**、`grep -rn MAX_RELAY_FEE_SWAP_USD_FOR_SUBACCOUNT src/` 除声明和 allow-list 外**零处读取**——这两个符号纯粹是"声明了但没接线"。
2. `SubaccountRelayRouter.sol` 全文没有覆写 `_payRelayFee` 或任何子账户专属的费用校验分支，`batch`/`createOrder`/`updateOrder`/`cancelOrder` 全部通过 `withRelay` modifier 直接复用 `BaseRelayRouter._payRelayFee`，子账户路径和普通账户路径在收费校验上**完全没有区别对待**。
3. `_payRelayFee`（`BaseRelayRouter.sol:221-266`）里唯一的硬上限是 `maxRelaySwapWntCap`（`FX100Keys.MAX_RELAY_SWAP_WNT_CAP`），且 `if (maxRelaySwapWntCap != 0 && nativeFee > maxRelaySwapWntCap) revert` ——**cap 为 0 时这一整段校验直接跳过**，之后唯一的门槛是 `feeAmount > fee.maxFeeAmount`（`fee.maxFeeAmount` 是**子账户自己签名**的字段，恶意子账户可以把它签成主账户的全部余额）。
4. Relay 无许可（谁都能调用 `SubaccountRelayRouter.createOrder` 等函数当 relayer），收费对象是 `msg.sender`（`_sendTokens(account, fee.feeToken, msg.sender, feeAmount)`，`BaseRelayRouter.sol:262`）——子账户完全可以自己当自己的 relayer，抬高 `tx.gasprice` 把 `nativeFee` 做大，再用自己的签名把 `fee.maxFeeAmount` 设得足够高放过校验，反复调用即可从主账户 `pluginTransfer` 出 USDC 到自己账户（`msg.sender`）。

**⚠️ 与 Zenith 报告不完全一致、值得注意的一点缓解因素**（Zenith 报告本身也在"修复建议"里提到"defense-in-depth"，本次核对补充确认这条兜底目前的实际状态）：

- `scripts/parameters/general.sample.json:28` 里 `maxRelaySwapWntCap` 的部署模板默认值是 `"0.00005"`（WNT，非 0），`scripts/configureGeneral.ts` 会把这个值必填写入 `MAX_RELAY_SWAP_WNT_CAP`。**如果线上环境确实按这份模板跑过 `configureGeneral.ts`**，`nativeFee` 会被硬性限制在约 0.00005 WNT 换算的极小 USDC 金额内（大约几分钱量级），"掏空整个主账户余额"这个最坏场景在当前部署模板下**大概率不成立**，实际可榨取金额被压得很小。
- 但这**不能**当作已解决：①这只是一个跟"子账户"身份完全无关的全局兜底，任何一次运维忘记跑 `configureGeneral.ts`、或者未来某次新部署漏配（本仓库已有过"键漏配=静默全免/全松"的先例，见执行费豁免键教训）都会让这条防线归零；②即便 cap 生效，子账户仍然可以**反复调用**、每次揩走一小笔，累计起来仍是非预期的资金流失，且这条路径本该是"子账户只能交易、不能移动主账户资金"这条设计承诺的直接违反；③Zenith 建议的**子账户专属 USD 上限**（不受 `tx.gasprice` 影响、以美元计价）是更精准的修复，全局 WNT cap 只是碰巧起到部分削弱作用，不应该替代专属修复。

**是否需要专题测试/验证**：**需要**，且优先级高于 R8-B01（涉及用户资金直接损失，不是自动化失效）：

1. **先查线上实际配置**：核实当前 Base Sepolia（以及未来 mainnet 部署 checklist）里 `MAX_RELAY_SWAP_WNT_CAP` 的链上实际值是否为 0——如果确认为 0，这条就是"当前环境下可执行的资金被盗"而非"理论风险"，需要立刻报告，不能等工程师修复上线周期。
2. 补一条 Foundry 集成测试还原报告里的攻击场景：正常账户 `Alice` 授权一个 `subaccount`（仅 order 权限），`subaccount` 自己调用 `SubaccountRelayRouter.createOrder`（自任 relayer）、用 `vm.txGasPrice` 抬高 gas price、签一个远超正常 gas 成本的 `fee.maxFeeAmount`，断言 `Alice` 的 USDC 余额确实按 `feeAmount` 转给了 `msg.sender`（即 subaccount 自己）而不是被合理的子账户专属上限拦下来；再分别在 `MAX_RELAY_SWAP_WNT_CAP = 0` 和按模板值配置两种场景下跑一遍，量化两种配置下攻击者单次实际能拿到多少钱。
3. 待工程师按 Zenith 建议加上子账户专属 USD cap（`_maxRelayFeeUsdForSubaccount` 虚函数 + `SubaccountRelayRouter` 覆写读取 `MAX_RELAY_FEE_SWAP_USD_FOR_SUBACCOUNT`）后，补对照测试：同样的高 gasprice + 高 `maxFeeAmount` 攻击 payload，应该在新加的 USD cap 处 revert `MaxRelayFeeSwapForSubaccountExceeded`。

### R8-B03

**严重性**: P2 🟡（对应 Zenith 原编号 #3）

**合约**: `src/external/ExternalHandler.sol`（`makeExternalCalls`）、`src/router/ExchangeRouter.sol`

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #3

**核对结论**：CONFIRMED——但是原样继承自 GMX Synthetics 的既有设计（连警告注释都一字不改），不是 FX100 引入的新退化。

`makeExternalCalls`（`ExternalHandler.sol:30-63`）无任何访问控制，`target.call(data)`（line 70）谁都能调；`refundTokens`/`refundReceivers` 由调用者自选，只把当前合约持有的该 token 全部余额转给对应 receiver，跟这笔余额到底是谁存进来的毫无关联。与 `gmx-synthetics` 原版逐行比对完全一致（连"anyone can make this contract call any function"的注释都在），FX100 唯一多加的是重复 refund token 的 revert 保护。全协议只部署一个 `ExternalHandler` 单例（`ignition/modules/Fx100Base.ts:50`），被 `ExchangeRouter` 共享。

**影响**：如果有 ERC20 因为非原子的多步操作在两笔交易之间滞留在 `ExternalHandler`，任何人都能把它扫走。GMX 这个架构带着真实 TVL 跑了多年没有被从这个具体向量打过，风险接受度是「原子 multicall 内 prefund→swap→refund 不留余额」这个惯例，不是链上强制的。

**是否需要专题测试/验证**：需要——用于锁定「任意人可扫走滞留余额」这个具体后果作为回归测试，也方便以后如果决定收紧访问控制时对照。 建议测试文件：`test/bugs/zenith/ZenithB03_ExternalHandlerStrandedRefund.t.sol`。

### R8-B04

**严重性**: P2 🟡（对应 Zenith 原编号 #4）

**合约**: `src/config/Config.sol`（`_initAllowedLimitedBaseKeys`）、`src/config/ConfigUtils.sol`（`validateRange`）、`src/market/MarketUtils.sol`（`validateOpenInterest`）、`src/config/ConfigSyncer.sol:40-42`（团队自己写的已知缺口注释）

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #4

**核对结论**：CONFIRMED。

`LIMITED_CONFIG_KEEPER` 能调 `Config.setUint` 改 `MAX_OPEN_INTEREST`，而 `ConfigUtils.validateRange` 对这个键（以及 `MAX_POOL_AMOUNT`/`POSITION_IMPACT_FACTOR` 等）完全没有校验分支——`ConfigSyncer.sol:40-42` 的注释原文就承认这些键目前链上不校验，需要链下校验。把 `MAX_OPEN_INTEREST` 设成 0（或低于现有 OI）后，`MarketUtils.validateOpenInterest` 会让任何新增仓位的请求直接 revert `MaxOpenInterestExceeded`，等于单方面 DoS 掉整个市场的开仓能力。额外发现：`ignition` 部署脚本里从未给任何 `ConfigSyncer` 地址实际授予 `LIMITED_CONFIG_KEEPER`（该角色直接授予一个裸 EOA/多签），说明风控预言机 sync 路径可能根本不是生产环境实际在用的路径——不影响本条结论，因为裸 EOA 走的正是同一个不设防的 `Config.setUint`。

**影响**：低权限的运维角色（本意是给风控预言机这类半信任来源用的）就能让整个市场的开仓功能瘫痪，且没有下限保护——不需要恶意，一次误操作就够。

**是否需要专题测试/验证**：需要——直接测试用 `LIMITED_CONFIG_KEEPER` 权限把 `MAX_OPEN_INTEREST` 设 0 后新增仓位被拒的场景，证明门槛之低。 建议测试文件：`test/bugs/zenith/ZenithB04_LimitedKeeperZeroOpenInterest.t.sol`。

### R8-B05

**严重性**: P2 🟡（对应 Zenith 原编号 #5）

**合约**: `src/router/relay/RelayUtils.sol`（`MINIFIED_TYPEHASH`/`validateSignature`）、`src/router/relay/RelayRouter.sol`、`src/order/DecreaseOrderUtils.sol`

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #5

**核对结论**：CONFIRMED，但同样是原样继承自 GMX Synthetics 的 Ledger 兼容性设计（GMX 注释原文写明了动机），属于需要产品/工程明确表态「是否接受」的设计决策，不是纯代码缺陷。

`validateSignature` 在完整摘要验签失败后会退化到验一个「仅摘要 hash」的精简签名（`Minified` 回退，line 122-149）；`RelayRouter.createOrder` 对 `msg.sender` 没有任何限制，任何人拿到一个有效签名（完整版或精简版）就能代 `account` 提交订单；`order.receiver()` 除非零地址检查外不校验必须等于 `account`，减仓收益直接付给 `order.receiver()`。跟 GMX 原版逐行比对机制完全一致，GMX 官方注释明确说这是为了兼容「Ledger 等硬件钱包签不了完整大 payload」的场景，把防钓鱼的责任下放给钱包/dApp 的 UX 层。

**影响**：如果受害者被诱导对一个精简摘要签名（不知道自己签的是什么），攻击者可以拿这个签名把受害者仓位的减仓收益转给自己。发生条件较苛刻（需要受害者对攻击者准备好的具体 payload 签一个有效签名），Zenith 定为 High/Low 合理。

**是否需要专题测试/验证**：需要产品/工程先做一次「是否保留这个 Ledger 兼容回退」的决策，再决定测试范围；至少应补一条测试证明当前回退机制确实可行（作为决策依据）。 建议测试文件：`test/bugs/zenith/ZenithB05_MinifiedSignatureRelayPayout.t.sol`。

### R8-B06

**严重性**: P1 🟠（对应 Zenith 原编号 #6）

**合约**: `src/config/Config.sol`（`PRICE_FEED_HEARTBEAT_DURATION` 在 `allowedBaseKeys`）、`src/config/ConfigUtils.sol:65`（引用不存在的 TimelockConfig）、`src/oracle/ChainlinkPriceFeedUtils.sol`、`src/access-control/AccessStoreProxy.sol:45-48`

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #6

**核对结论**：CONFIRMED，且比 Zenith 原文描述的更糟——报告提到的「应该走 TimelockConfig」这条更安全的路径在代码里根本不存在。

`PRICE_FEED_HEARTBEAT_DURATION` 只受普通 `onlyKeeper`（`CONFIG_KEEPER`/`LIMITED_CONFIG_KEEPER`）保护，`ConfigUtils.validateRange` 对这个键零校验分支，可以直接设成 `type(uint256).max` 让 `ChainlinkPriceFeedUtils.sol:35` 的过期判断永远不触发。全仓库 grep `onlyTimelockAdmin`（`AccessStoreProxy.sol:48` 唯一定义处）和 `TimelockConfig` 都确认——`ConfigUtils.sol:65` 注释里说的「应该用 TimelockConfig」这条安全网从未被实现，唯一的路径就是这条不设防的普通 keeper 调用。作为对比，`setOracleProviderForToken`（`Config.sol:112-141`）确实有真实的 `ORACLE_PROVIDER_MIN_CHANGE_DELAY` 冷却期，说明团队在别处是有意加摩擦的，这里没做。

**影响**：普通（非 timelock）keeper 一次调用即可让某个 token 的喂价永远不判定过期，直接废掉喂价新鲜度这道风控防线，注释还误导读者以为有更安全的路径。

**是否需要专题测试/验证**：需要，且优先级较高（比原始描述更严重）：①测试证明普通 keeper 一次调用即可关闭过期校验，②建议同时报告工程师补 `validateRange` 分支 + 澄清/实现 `TimelockConfig` 或删掉误导注释。 建议测试文件：`test/bugs/zenith/ZenithB06_HeartbeatMaxDisablesStaleness.t.sol`。

### R8-B07

**严重性**: P2 🟡（对应 Zenith 原编号 #7）

**合约**: `src/market/MarketFactory.sol`（`createMarket`）、`src/market/MarketUtils.sol`（`getNetObligation`/`getGlobalNetObligationRatio`）、`src/vault/LPVault.sol`、`src/exchange/AdlHandler.sol`

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #7

**核对结论**：CONFIRMED。

`MarketFactory.createMarket` 不要求 `indexToken` 已经初始化过 oracle 配置；`getNetObligation`（`MarketUtils.sol:175`）在检查该市场 OI 是否为零之前就先无条件调 `oracle.getSecondaryPrice`，一旦该 token 没配置 oracle 就会 revert `EmptySecondaryPrice`；`getGlobalNetObligationRatio` 用不带 try/catch 的 for 循环遍历全部市场，一个市场的 revert 就拖垮整个聚合结果；`LPVault` 提款闸门和 `AdlHandler` 的 ADL 启停都依赖这个聚合值，因此一个空的/配置不完整的新市场能冻结所有其它市场的 LP 提款和 ADL。

**影响**：这是一个可恢复的全局拒绝服务，不是资金损失，但触发门槛只是市场上市流程里 oracle 配置和建市场的顺序搞反了这种操作失误，不需要恶意，历史上市场上新流程里确实有严格的顺序要求（见 project 手册），说明这是已知但未被代码兜底的风险点。

**是否需要专题测试/验证**：需要——直接测一遍「先建市场、不配 oracle，再验证一笔无关市场的 LP 提款/ADL 也被卡住」，量化影响范围。 建议测试文件：`test/bugs/zenith/ZenithB07_EmptyMarketFreezesGlobalRisk.t.sol`。

### R8-B08

**严重性**: P1 🟠（对应 Zenith 原编号 #8）

**合约**: `src/bank/StrictBank.sol`（`_recordTransferIn`）、`src/order/OrderUtils.sol`（`createOrder`/`cancelOrder`）、`src/exchange/OrderHandler.sol`（age gate 只保护市价单）

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #8

**核对结论**：CONFIRMED——与 R8-B15（#15）是同一个根因（`StrictBank` 全局单一余额快照，不区分是谁存的），只是触发路径是「下一笔 LimitIncrease 立即撤单」而不是「下一笔任意订单」。

`StrictBank._recordTransferIn` 只记一个 token 级别的全局余额快照，任何两次快照之间冒出来的余额差都会被下一个调用者的订单捕获为自己的 `initialCollateralDeltaAmount`（`OrderUtils.sol:88`）。`OrderHandler.sol:204-216` 的撤单延迟只套用在 `Order.isMarketOrder` 上，`LimitIncrease` 完全跳过，撤单会把捕获到的全部金额付给撤单方（`OrderUtils.sol:234-244`）。只要资金转入和建单不是打包在同一笔 multicall 里的两个独立调用（relay/subaccount 路径确实打包了，但不保证所有集成方都这样），就有这个非原子窗口。

**影响**：任何账户在 `OrderVault` 里留下的滞留/待处理余额，都可能被别人的下一笔 `LimitIncrease`+立即撤单捞走，属于真实的资金损失路径，只是发生条件（非原子资金转入）不算常见。

**是否需要专题测试/验证**：需要——完整还原「A 单独转账不建单 → B 建 LimitIncrease 捕获 → B 立即撤单拿钱」的攻击链。 建议测试文件：`test/bugs/zenith/ZenithB08_LimitIncreaseCapturesStrayDeposit.t.sol`。

### R8-B09

**严重性**: P2 🟡（对应 Zenith 原编号 #9）

**合约**: `src/router/ExchangeRouter.sol`（`setUiFeeFactor`/`claimUiFees`）、`src/pricing/PositionPricingUtils.sol`（`getUiFees`）

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #9

**核对结论**：CONFIRMED，但当前所有已知部署都处于休眠状态：`MAX_UI_FEE_FACTOR` 默认是 0，全仓库没有任何部署脚本把它设成非零，所以今天这条路径实际收费恒为 0。

`uiFeeReceiver` 可以在订单创建之后、执行之前随时调 `setUiFeeFactor` 把自己的费率抬到 `MAX_UI_FEE_FACTOR` 上限，订单本身不记录一个用户认可的费率上限，执行时读的是实时值，交易者对最终扣多少完全没有约束。这个机制一旦 `MAX_UI_FEE_FACTOR` 被设成非零（比如为了支持正式的联盟/UI 分成计划）就立刻变成真实可用的漏洞，不需要改代码。

**影响**：现在没有实际资金风险，但是一个「配置一开就立刻可用」的定时炸弹——建议在正式启用 UI 手续费之前先修好这个缺口。

**是否需要专题测试/验证**：需要（低优先级，先于未来启用 UI 手续费之前修）：测试证明设置非零 `MAX_UI_FEE_FACTOR` 后 receiver 能在下单后临时抬价并领到差额。 建议测试文件：`test/bugs/zenith/ZenithB09_UiFeeReceiverRugPull.t.sol`。

### R8-B10

**严重性**: P1 🟠（对应 Zenith 原编号 #10）

**合约**: `src/external/ExternalHandler.sol`（`makeExternalCalls`）、`ignition/modules/Fx100Base.ts`（单例部署）

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #10

**核对结论**：CONFIRMED——与 R8-B03（#3）同一个函数，但攻击手法不同：#3 是扫走已滞留余额，#10 是预先给自己批一个无限 approval，等未来任何时候有余额滞留就能随时提走，不需要在滞留那一刻就采取行动。

`makeExternalCalls` 允许任何人指令 `ExternalHandler` 对任意 `target` 发起任意 `data` 调用，包括 `token.approve(attacker, type(uint256).max)`。因为全协议只有一个共享的 `ExternalHandler` 单例（`Fx100Base.ts:50`），这个 approval 一旦种下就一直有效，不受时间/交易边界限制——之后任何原因造成的余额滞留（哪怕是完全无关的其他用户操作留下的 dust）都会被这个提前埋好的 approval 卷走。

**影响**：比 #3 更隐蔽：攻击者不需要盯着滞留事件发生的那一刻，只要提前埋好 approval 就能守株待兔，扩大了实际可利用窗口。

**是否需要专题测试/验证**：需要——测试证明「提前 approve → 之后任意时间一笔无关滞留余额出现 → 用早先的 approve 直接转走」全链路可行。 建议测试文件：`test/bugs/zenith/ZenithB10_ExternalHandlerStandingApproval.t.sol`。

### R8-B11

**严重性**: P2 🟡（对应 Zenith 原编号 #11）

**合约**: `src/order/ExecuteOrderUtils.sol`（`updateFundingState` 调用时机）、`src/market/MarketUtils.sol`（`getNextFundingAmountPerSize`）、`src/common/math/ExponentialMovingAverage.sol`

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #11

**核对结论**：CONFIRMED。

`updateFundingState` 在 `processOrder`（真正改变 OI 的地方）之前调用，所以每次采样到的都是这笔订单执行前的失衡度；`ExponentialMovingAverage.saveValue` 把这个旧值存成新的 `lastValue`，直到下一次 `updateFundingState`（同样在下一笔订单之前采样）才会更新——这意味着一个孤立的单边仓位在整个持仓期内（只要市场足够冷清没有其他交易触发 checkpoint），它自己造成的失衡永远不会被计入资金费计算，因为没有下一次采样去捕捉它。

**影响**：冷清市场里长期持有的单边仓位可能在整个持仓期都按开仓前的失衡度收资金费，实际应缴的资金费被系统性低估，影响随持仓时间和市场清淡程度放大。

**是否需要专题测试/验证**：需要——开一个大单边仓位后长时间 warp 不产生其他交易，对比实际收取的资金费和如果从开仓那一刻就正确计入失衡度应收的资金费两者的差额。 建议测试文件：`test/bugs/zenith/ZenithB11_StaleSkewEmaAfterOpenInterestChange.t.sol`。

### R8-B12

**严重性**: P2 🟡（对应 Zenith 原编号 #12）

**合约**: `src/callback/CallbackUtils.sol`（`refundExecutionFee`/`validateGasLeftForCallback`）、`src/gas/GasUtils.sol`

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #12

**核对结论**：CONFIRMED，但当前所有已知部署都处于休眠状态：`REFUND_EXECUTION_FEE_GAS_LIMIT` 默认 0，没有部署脚本设过非零值，`validateGasLeftForCallback(0)` 永远不 revert。

`refundExecutionFee` 在 `try/catch` 之外先跑 `validateGasLeftForCallback`，gas 不够会硬 revert；这个 revert 第一次发生时会被 `OrderHandler.executeOrder` 的外层 try/catch 捕获走向撤单分支，但撤单分支自己又调用同一个 `payExecutionFee`/`refundExecutionFee`，这次的 revert 没有任何外层 catch，会让整笔 keeper 交易连带撤单一起回滚。触发条件是 `REFUND_EXECUTION_FEE_GAS_LIMIT` 被设成一个超出准入校验预留量的正值——目前没有任何部署这样配置过。

**影响**：现在没有实际影响，但跟 #9 一样是一旦配置就立刻可利用的类型，值得在配置这个参数之前先修好。

**是否需要专题测试/验证**：需要（低优先级，先于启用该参数之前修）：测试证明设置该参数为正值后能制造出撤单也回滚的 keeper 交易。 建议测试文件：`test/bugs/zenith/ZenithB12_UnreservedRefundCallbackGasRollback.t.sol`。

### R8-B13

**严重性**: P2 🟡（对应 Zenith 原编号 #13）

**合约**: `src/liquidation/LiquidationUtils.sol`、`src/adl/AdlUtils.sol`、`src/callback/CallbackUtils.sol`、`src/exchange/LiquidationHandler.sol`/`AdlHandler.sol`

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #13

**核对结论**：CONFIRMED——性质是 gas 消耗型骚扰（回滚+重试即可成功），不是资金损失或永久阻塞，与 Zenith 定级 Impact:Low/Likelihood:High 一致。

被清算/ADL 账户可以给自己设一个有代码但不合作的 `callbackContract`，`LiquidationHandler.executeLiquidation`/`AdlHandler.executeAdl` 都不像 `OrderHandler.executeOrder` 那样做执行前 gas 准入校验，导致仓位已经被减完之后，回调阶段才发现 gas 不够而把整笔清算/ADL 交易回滚——keeper 白白浪费一次 gas，重试时带够 gas 就能成功。

**影响**：对 keeper 造成 gas 浪费型骚扰，可以被恶意账户反复利用来拖慢清算/ADL 处理速度，但不会造成资金损失或让清算永久失败。

**是否需要专题测试/验证**：需要（低优先级）：测试证明「故意设置吃 gas 的 callback + keeper gas 不足 → 清算回滚，仓位未减」，以及带足 gas 后正常成功。 建议测试文件：`test/bugs/zenith/ZenithB13_ForcedCallbackGasGrief.t.sol`。

### R8-B14

**严重性**: P1 🟠（对应 Zenith 原编号 #14）

**合约**: `src/router/BaseRouter.sol`（`sendWnt`/`sendTokens`/`sendNativeToken`）、`src/utils/PayableMulticall.sol`

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #14

**核对结论**：CONFIRMED。

`BaseRouter` 的三个转账辅助函数只有 `nonReentrant`+非零地址检查，没有角色门槛，也不校验 `amount` 和当前调用的 `msg.value` 是否匹配——它们操作的是路由合约当前持有的全部 ETH 余额，不是这一次调用自带的钱。`PayableMulticall.multicall` 里每个子调用共享同一个外层 `msg.value`（代码注释自己承认），没有额度追踪，理论上可以让同一笔 `msg.value` 被多个子调用各花一次。

**影响**：任何滞留在路由合约里的 ETH（不管什么原因造成）都可以被任意未授权地址直接转走；影响范围被路由合约当时持有多少 ETH 限定住，不涉及 ERC20 金库余额。

**是否需要专题测试/验证**：需要——测试「路由合约有滞留 ETH → 无角色地址直接调用转账函数拿走」，以及 multicall 内一个 `msg.value` 被多次引用的场景。 建议测试文件：`test/bugs/zenith/ZenithB14_RouterEthDrain.t.sol`。

### R8-B15

**严重性**: P1 🟠（对应 Zenith 原编号 #15）

**合约**: `src/bank/StrictBank.sol`（`_recordTransferIn`）、`src/order/OrderUtils.sol`、`src/exchange/OrderHandler.sol`

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #15

**核对结论**：CONFIRMED——与 R8-B08（#8）同一根因（`StrictBank` 全局单一余额快照），描述的是更一般的场景：任何非原子的「先转账、再建单」两步流程都会暴露这个窗口，不限于 LimitIncrease 立即撤单这一种利用方式。

`StrictBank._recordTransferIn` 没有按账户/订单区分余额来源，`OrderUtils.createOrder` 把两次快照之间出现的任意余额差直接归属给下一个调用 `createOrder` 的人。协议统一用 USDC 作抵押品（各市场共用），攻击者不需要猜受害者用的是哪个市场。`ExchangeRouter.createOrder` 本身不拉资金，资金转入是独立的一次调用——只要客户端没有把两步打包进同一个 multicall（relay/subaccount 路径确实打包了，但不能保证所有集成方都这样），这个窗口就是真实存在的。

**影响**：任何账户的资金转入与建单之间的非原子窗口，都可能被抢先插入的另一笔订单捕获走。

**是否需要专题测试/验证**：需要——完整还原「受害者单独转账 → 攻击者抢先建单捕获 → 攻击者立即撤单拿钱，受害者后续建单资金不足」的场景。 建议测试文件：`test/bugs/zenith/ZenithB15_StrayDepositTheft.t.sol`。

### R8-B16

**严重性**: P1 🟠（对应 Zenith 原编号 #16）

**合约**: `src/config/Config.sol`（`setInt` vs `setUint`）、`src/config/ConfigUtils.sol`（`validateRange`）、`scripts/configureMarket.ts`

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #16

**核对结论**：CONFIRMED，与 R8-B01（#1）、R8-B23（#23）同一个根因家族——`Config.setInt` 完全不调用 `ConfigUtils.validateRange`，而资金费四个参数在生产环境（`configureMarket.ts`）恰恰是走 `setInt` 配置的，导致校验形同虚设。

`Config.setUint`（line 237-244）会跑 `validateRange`，`Config.setInt`（line 264-283）完全不跑；`validateRange` 里资金费相关的校验分支比较的是 `uintValues`（只有 `setUint`/`ConfigSyncer` 才会写到那里），但 `MarketUtils.getNextFundingFactorPerSecond` 真正读取、生效的是 `setInt` 写入的 `intValues`——链上校验和实际生效值走的是两条不相交的存储路径。生产部署脚本 `configureMarket.ts:385-408` 确认资金费上下限就是走 `setInt`，即生产路径本来就没有链上校验。

**影响**：任何拿到 `CONFIG_KEEPER`/`LIMITED_CONFIG_KEEPER` 权限的地址（即使是完全受信任的角色）都能把资金费上下限设成任意值（包括上下限颠倒），完全绕开原本设计好的 `MAX_ALLOWED_MAX_FUNDING_FACTOR_PER_SECOND` 等封顶。

**是否需要专题测试/验证**：需要——测试证明同样离谱的值走 `setUint` 会 revert、走 `setInt` 却直接成功，量化对实际资金费计算的影响。 建议测试文件：`test/bugs/zenith/ZenithB16_SignedFundingBypassesRange.t.sol`。

### R8-B17

**严重性**: P1 🟠（对应 Zenith 原编号 #17）

**合约**: `src/vault/LPVault.sol`（`claimWithdrawRequest`/`_validateWithdrawalsAllowed`）、`src/market/MarketUtils.sol`（`validateOpenInterest`/`validateOpenInterestReserve` 调用点）

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #17

**核对结论**：CONFIRMED，但带一个重要的缓解语境：这不是永久失效的风控，而是一个时机窗口问题——独立运行的 ADL 机制最终会在净兑付率越过阈值时重新收紧敞口，只是 LP 赎回本身没有和 OI 相对上限同步校验。是否需要在赎回路径本身加同步校验，还是接受现有异步 ADL/风控梯度作为兜底，属于产品/风控架构层面的取舍，建议与团队正在做的 ADL 阈值调优放在一起决策。

`claimWithdrawRequest` 只受 `_validateWithdrawalsAllowed`（纯 PnL 口径的全局净兑付率闸门）限制；`validateOpenInterest`/`validateOpenInterestReserve`（两个跟 `poolUsd` 相对的敞口上限）只在开仓路径（`IncreasePositionUtils.sol:129`）调用，LP 赎回导致 `poolUsd` 缩水时不会重新校验这两个相对上限，只有 `MAX_OPEN_INTEREST`（绝对值上限）不受影响。

**影响**：LP 集中赎回可能让已有仓位的敞口瞬间超过两个 pool-relative 上限（但不超过绝对上限），在下一次 ADL 检查生效之前留出一个风险敞口临时超限的窗口。

**是否需要专题测试/验证**：需要——构造一个已有仓位刚好卡在 pool-relative 上限、全局净兑付率健康的场景，LP 赎回后验证敞口确实超限但赎回本身不 revert。 建议测试文件：`test/bugs/zenith/ZenithB17_LpRedemptionStrandsOpenInterest.t.sol`。

### R8-B18

**严重性**: P2 🟡（对应 Zenith 原编号 #18）

**合约**: `src/pricing/PositionPricingUtils.sol`（`getPriceImpactSpread`）、`src/order/OrderUtils.sol`（无深度状态追踪）

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #18

**核对结论**：CONFIRMED，且可利用区间比原文描述更宽——不需要接近指数爆炸的极端规模，线性分支本身在总规模达到约一半配置深度时就已经饱和到 `MAX_PRICE_IMPACT_SPREAD`，属于现实可达的订单量级，不是边缘案例。

`getPriceImpactSpread` 只按当前这一笔的规模计算价差，完全没有跨订单的已消耗深度状态（`ReaderUtils.virtualInventoryForPositions` 字段是死代码，从未在定价路径填充），所以把一笔大单拆成多笔小单执行，由于价差是规模的凸函数（`size × spread(size)` 凸增），总加权成本必然低于一次性执行——生产环境的深度/参数配置（$7.7-15.6M depth）证实这不是理论极限值才会触发。

**影响**：任何有能力把订单拆分执行的交易者（脚本化交易、做市商）都能系统性地少付非线性价差部分，代价由 LP（价差本该补偿的对象）承担，是一个持续的价值流失而非一次性事件。

**是否需要专题测试/验证**：需要——对比「一次性执行 X 规模」和「拆成 N 笔执行相同总规模」两种情况下的加权平均价差，量化差额。 建议测试文件：`test/bugs/zenith/ZenithB18_PriceImpactSplitAdvantage.t.sol`。

### R8-B19

**严重性**: P1 🟠（对应 Zenith 原编号 #19）

**合约**: `src/config/ConfigUtils.sol`（`validateRange` 对 `MIN_COLLATERAL_FACTOR`/`MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION` 各自独立校验，互不比较）、`src/position/PositionUtils.sol`（`isPositionLiquidatable`）

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #19

**核对结论**：CONFIRMED——与 R8-B25（#25）同属「开仓保证金因子/清算保证金因子/OI 乘数因子三者缺乏交叉校验」的问题家族，本条聚焦「开仓因子被设得比清算因子更低」这一具体反转。

`validateRange` 对 `MIN_COLLATERAL_FACTOR`（≤5%）和 `MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION`（≤1%）各自独立校验上限，互相之间没有任何比较，也没有下限——如果误配置成「开仓因子 < 清算因子」，一个刚刚满足开仓门槛的仓位可以立即满足清算条件，无需任何价格波动。生产默认配置目前顺序正确（开仓 1% > 清算 0.4-0.5%），但完全靠人工记忆维护，本仓库过往多次手动调整 `minCollateralFactor` 的记录（如 BTC 清算因子调整）证明团队确实是靠先手算现有仓位抵押率这种人工流程规避风险，而不是链上强制。

**影响**：任何一次配置变更如果不小心把两个因子的相对顺序搞反，会导致新开的仓位在零价格波动下立即可被清算——这是一个操作风险，触发不需要恶意，只需要一次配置失误。

**是否需要专题测试/验证**：需要——测试证明把清算因子设得比开仓因子高之后，刚开仓的仓位立即可被清算。 建议测试文件：`test/bugs/zenith/ZenithB19_CollateralFactorInversion.t.sol`。

### R8-B20

**严重性**: P1 🟠（对应 Zenith 原编号 #20）

**合约**: `src/market/MarketUtils.sol`（`getCappedPnl`）、`src/position/PositionUtils.sol`（`_getPositionPnlUsd` 227 行的 `cappedPoolPnl > 0` 条件）

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #20

**核对结论**：CONFIRMED——代码逻辑缺陷是真实的，但当前 24 个真实上线市场的 `MAX_PNL_FACTOR_FOR_TRADERS` 均已正确配置为非零值（60%），所以今天的真实链上环境不处于可利用状态；一旦该参数被设为 0% 或漏配（0-100% 合法区间内的合法值），缺陷立即生效。

`getCappedPnl` 在 `maxPnlFactor==0` 时正确把封顶后的池子 PnL 算成 0，但 `_getPositionPnlUsd`（PositionUtils.sol:227）只在 `cappedPoolPnl != poolPnl && cappedPoolPnl > 0 && poolPnl > 0` 时才按比例缩放单个仓位的 PnL——`cappedPoolPnl > 0` 这个条件恰好排除了「封顶归零」这一种情况，导致仓位自己的 PnL 完全不缩放，直接按未封顶的全额结算，从共享 LP 金库里付出去。这个条件本身没有必要存在（除数是 `poolPnl` 不是 `cappedPoolPnl`，不存在除零风险），去掉就是正确修复。

**影响**：如果 `MAX_PNL_FACTOR_FOR_TRADERS` 被设成 0% 或者某个市场/方向漏配（该键是 marketIndex+isLong 复合键，历史上团队已经在别处因为这类复合键漏配吃过亏），PnL 封顶机制形同虚设，LP 金库可能被无限度抽走利润。

**是否需要专题测试/验证**：需要——直接测试把某个市场的该参数设成 0 后，一笔深度盈利仓位的全平能拿到未封顶的全部利润。 建议测试文件：`test/bugs/zenith/ZenithB20_ZeroFactorUncappedPnl.t.sol`。

### R8-B21

**严重性**: P1 🟠（对应 Zenith 原编号 #21）

**合约**: `src/router/relay/BaseRelayRouter.sol`（`_createOrder`/`_updateOrder` 硬编码 `shouldCapMaxExecutionFee=false`）、`src/router/SubaccountRouter.sol`（对比：非 relay 路径正确按 callback 是否存在决定）、`src/gas/GasUtils.sol:213-218`（团队自己写的针对这个漏洞的注释）

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #21

**核对结论**：CONFIRMED——与 R8-B02（#2）是相关但不同的根因：#2 打的是 relay 费本身（`nativeFee`/`tx.gasprice`），#21 打的是订单自己的 `executionFee`/callback 退款机制（`shouldCapMaxExecutionFee`），两条独立的漏洞，共享同一个「子账户自任 relayer」的攻击外壳。

`BaseRelayRouter._createOrder`/`_updateOrder`（relay/subaccount-relay 两条路径共用）把 `shouldCapMaxExecutionFee` 硬编码成 `false`，而非 relay 的 `SubaccountRouter` 对应函数正确地按「是否设置了 callbackContract」决定是否封顶——`GasUtils.sol:213-218` 的注释原文就是在描述这个具体攻击场景（恶意子账户可以用一个大 `executionFee` 通过 callback 退款套现大部分金额），证明工程师专门为 `SubaccountRouter` 做了防护但没有接到 relay 路径。

**影响**：恶意/被盗子账户可以通过一个大额 `executionFee` + 自己控制的 callback 合约，从主账户 collateral 里套现，是一个独立于 #2 relay 费漏洞的资金损失路径。与 #2 共享同一个缓解因素：全局 `MAX_RELAY_SWAP_WNT_CAP`（部署模板非零 0.00005 WNT）如果确实生效，会压低通过这条路径能垫付的 WNT 上限，从而间接限制这次攻击的规模——但同样是跟子账户身份无关的全局兜底，不能替代专属修复。

**是否需要专题测试/验证**：需要——还原「子账户自任 relayer + 大额 executionFee + 攻击者控制的 callback 合约」场景，量化在 cap=0 和 cap=模板值两种情况下的套现金额。 建议测试文件：`test/bugs/zenith/ZenithB21_SubaccountRelayUncappedExecutionFee.t.sol`。

### R8-B22

**严重性**: P1 🟠（对应 Zenith 原编号 #22）

**合约**: `src/order/ExecuteOrderUtils.sol`（`updateFundingState` 在 `processOrder` 之前调用）、`src/market/MarketUtils.sol`（`getNextFundingAmountPerSize`）、`src/common/math/ExponentialMovingAverage.sol`

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #22

**核对结论**：CONFIRMED，与 R8-B11（#11）同一个「资金费 checkpoint 时机」根因家族，本条聚焦「OI 变化后旧失衡度残留多久」这个角度。

`updateFundingState` 记录的永远是这笔订单执行前的失衡度快照，而 `PositionUtils.updateOpenInterest`（真正改变 OI 的地方）不会回头触发任何 EMA 校正——直到市场上出现下一笔交易之前，`skewEMA` 会一直用这笔订单执行前的失衡度往前滚，即便订单本身已经彻底改变了实际失衡（比如平掉了一个大单边仓位）。

**影响**：该市场在两笔交易之间的资金费计算依据是过期的失衡快照，直到下一笔交易发生才纠正——纠正只发生在下一次交易时，期间已经计提的资金费不会被追溯修正，长期存在的错配会累积成实际的资金费分配误差。

**是否需要专题测试/验证**：需要——开大单边仓位后平仓，验证平仓后立即读取的 `skewEMA` 仍是平仓前的失衡值，warp 一段时间后触发下一笔交易，量化这段时间的资金费错配金额。 建议测试文件：`test/bugs/zenith/ZenithB22_StaleFundingSkewCheckpoint.t.sol`。

### R8-B23

**严重性**: P1 🟠（对应 Zenith 原编号 #23）

**合约**: `src/config/Config.sol`（`setInt` 无校验）、`src/config/ConfigUtils.sol`（`validateRange` 只在 `setUint` 生效）

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #23

**核对结论**：CONFIRMED，与 R8-B01（#1）、R8-B16（#16）同一个根因家族（`Config.setInt` 完全不校验），本条聚焦「连完全受信任的 `CONFIG_KEEPER` 本身都没有链上防呆」这一点——不像 #16 那样局限于 `LIMITED_CONFIG_KEEPER` 这个较低权限角色。

`Config.setInt` 的 `onlyKeeper` 修饰符同时允许 `CONFIG_KEEPER` 和 `LIMITED_CONFIG_KEEPER` 调用，且完全不跑 `validateRange`——即便是全权信任的 `CONFIG_KEEPER`，一次误操作（比如手滑把 min/max 写反，或者超出 `MAX_ALLOWED_MAX_FUNDING_FACTOR_PER_SECOND`）也没有任何链上防线拦截。生产配置脚本 `configureMarket.ts` 走的正是这条不设防路径。

**影响**：任何持有资金费配置权限（不论受信任等级）的角色发生一次误操作，就能让资金费率突破设计上限甚至方向颠倒，全市场层面影响所有持仓者。

**是否需要专题测试/验证**：需要——测试同样超界的值经 `setUint` 会 revert、经 `setInt` 却直接通过（无论调用者是 `CONFIG_KEEPER` 还是 `LIMITED_CONFIG_KEEPER`）。 建议测试文件：`test/bugs/zenith/ZenithB23_SignedFundingBoundsBypassCeiling.t.sol`。

### R8-B24

**严重性**: P2 🟡（对应 Zenith 原编号 #24）

**合约**: `src/subaccount/SubaccountUtils.sol`（`validateCreateOrderParams` 未检查 `uiFeeReceiver`）、`src/pricing/PositionPricingUtils.sol`（`getUiFees`）

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #24

**核对结论**：PARTIALLY_CONFIRMED——代码层面的缺口是真实的，但因为 `MAX_UI_FEE_FACTOR` 目前全部部署都是默认 0（跟 R8-B09/#9 同一个休眠状态），今天没有实际可利用的资金损失路径。

子账户下单校验（`validateCreateOrderParams`）只检查 `receiver`/`cancellationReceiver` 必须等于主账户，完全没检查 `uiFeeReceiver`——被授权只做交易的子账户理论上可以把 `uiFeeReceiver` 设成自己，从主账户的仓位里抽取 UI 手续费。但只要 `MAX_UI_FEE_FACTOR` 保持 0（当前所有已知部署的状态），`getUiFeeFactor` 封顶后恒为 0，这条路径抽不到钱。

**影响**：一旦协议为了支持正式的 UI/联盟返佣计划而把 `MAX_UI_FEE_FACTOR` 调成非零，这个缺口会立刻从理论变成子账户可以直接从主账户偷手续费，应该在那之前修好，而不是等启用后才发现。

**是否需要专题测试/验证**：需要（低优先级，先于启用 UI 手续费之前修）：测试证明设置非零 `MAX_UI_FEE_FACTOR` 后子账户能把自己设成 `uiFeeReceiver` 并领到主账户的手续费。 建议测试文件：`test/bugs/zenith/ZenithB24_SubaccountUiFeeDiversion.t.sol`。

### R8-B25

**严重性**: P1 🟠（对应 Zenith 原编号 #25）

**合约**: `src/config/ConfigUtils.sol`（`MIN_COLLATERAL_FACTOR` 无下限校验）、`src/market/MarketUtils.sol`（`getMinCollateralFactorForOpenInterestMultiplier` 键从未被任何部署脚本初始化）

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #25

**核对结论**：CONFIRMED——与 R8-B19（#19）同属「保证金因子缺乏交叉校验」问题家族，本条聚焦「开仓因子本身可以被设为 0，且 OI 乘数兜底键从未配置」这一更基础的缺口。

`MIN_COLLATERAL_FACTOR` 校验只共用一个通用的 ≤5% 上限分支，没有下限，`CONFIG_KEEPER` 可以直接设成 0；理论上的兜底 `getMinCollateralFactorForOpenInterestMultiplier`（按 OI 规模动态提高保证金要求）读取的键在任何部署脚本里都从未被初始化，静默解析为 0——两道防线同时失效时，`willPositionCollateralBeSufficient`/`validatePosition` 里的 `max(...)` 直接归零，允许以远超设计杠杆上限的比例开仓，唯一还生效的地板是绝对值 `MIN_COLLATERAL_USD`（$10，团队已确认接受）。

**影响**：需要一次配置失误或恶意的 `CONFIG_KEEPER`（全权信任角色）才能触发，触发后交易者可以用远低于文档设计的保证金比例开仓，绕开该市场声明的杠杆上限。

**是否需要专题测试/验证**：需要——测试证明把开仓因子设成 0 后，能用极低保证金（仅受 `MIN_COLLATERAL_USD` 限制）开出远超设计杠杆的仓位，同时清算保护期正常生效（不会立刻被清算）。 建议测试文件：`test/bugs/zenith/ZenithB25_ZeroOpeningCollateralFactor.t.sol`。

### R8-B26

**严重性**: P1 🟠（对应 Zenith 原编号 #26）

**合约**: `src/order/OrderUtils.sol`（subsidized 分支只清空 `order.setExecutionFee(0)`，未清空 `params.numbers.executionFee`）、`src/router/SubaccountRouter.sol`（`_autoTopUpSubaccount` 直接读取这个未清空的字段）、`src/router/relay/BaseRelayRouter.sol`（对比：relay 路径正确清零）

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #26

**核对结论**：CONFIRMED——与 R8-B02/B21 是同一大类「子账户套取主账户资金」但根因完全独立：本条打的是自动充值（auto top-up）机制，不经过 relay 费或 executionFee/callback 退款。

`OrderUtils.createOrder` 在判定订单享受执行费豁免时，只清空了存入订单的执行费字段，没有清空 calldata 里子账户自己声明的 `params.numbers.executionFee`；`SubaccountRouter.createOrder` 紧接着把这个未清空的字段原样喂给 `_autoTopUpSubaccount`，用来计算这次要从主账户 WNT 余额里报销多少，报销金额只受账户自己配置的充值上限约束，跟这笔订单实际有没有真的花掉这笔钱无关。`BaseRelayRouter` 的对应分支专门把这个字段清零，形成对照，证明这是遗漏而不是设计。

**影响**：考虑到执行费豁免在真实部署里目前是普遍/大范围开启的（豁免条件容易满足），子账户可以反复用被豁免的订单谎报执行费，从主账户的自动充值余额里持续套现，属于当前就可利用的资金损失路径，不是休眠漏洞。

**是否需要专题测试/验证**：需要，优先级较高——测试豁免订单+子账户谎报大额 `executionFee` 后自动充值机制确实按谎报金额（而非实际花费=0）报销。 建议测试文件：`test/bugs/zenith/ZenithB26_UnfundedSubsidizedTopUpDrain.t.sol`。

### R8-B27

**严重性**: P1 🟠（对应 Zenith 原编号 #27）

**合约**: `src/subaccount/SubaccountUtils.sol`（`handleSubaccountApproval` 从未写入 `integrationId`）、`src/router/relay/SubaccountRelayRouter.sol`（校验顺序 + 转发到无效的写入函数）

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #27

**核对结论**：CONFIRMED。

`integrationId` 确实是签名摘要（EIP-712）里认证过的字段，但 `handleSubaccountApproval` 处理签名后的批准时完全没有调用 `setSubaccountIntegrationId` 把它写进 `DataStore`——对比非 relay 路径的 `SubaccountRouter.setIntegrationId`（工作正常，直接由账户自己调用），证明写入函数本身没问题，只是 relay 批准流程漏接了这一步。四个 relay 入口（`createOrder`/`updateOrder`/`cancelOrder`/`batch`）都走同一个有缺陷的 helper，全部受影响。

**影响**：通过签名批准（而不是账户直接调用）更换或清除集成 ID 的意图从未真正落地，一个被标记为禁用的集成 ID 无法通过这条路径被真正撤销——不是任意第三方能直接冒用的开放漏洞，而是预期的撤销/切换操作没有生效这类正确性缺陷，仍然需要修。

**是否需要专题测试/验证**：需要——测试证明签名一个新的 `integrationId` 提交后，`DataStore` 里存的值其实没变，禁用检查仍然对着旧值生效。 建议测试文件：`test/bugs/zenith/ZenithB27_StaleIntegrationBinding.t.sol`。

### R8-B28

**严重性**: P1 🟠（对应 Zenith 原编号 #28）

**合约**: `src/fee-distribute/ProtocolTreasury.sol`（`multicall`，与 `batchTransfer` 的角色隔离形成对比）

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #28

**核对结论**：CONFIRMED。

`ProtocolTreasury.multicall` 只受 `MULTICALL_ROLE` 保护，对 `target`/`data` 没有任何限制，可以直接构造 `target.call(transfer(anyAddress, fullBalance))`；`Fx100Fee.ts` 把 `MULTICALL_ROLE` 授予 `feeKeeper`，却只把专门设计的收款白名单角色 `TOKEN_RECEIVER_ROLE` 授予 `lpVault`/多签——`multicall` 是一条完全独立、不受这个白名单约束的旁路。真实部署里 `feeKeeper` 的具体地址在部署参数模板里仍是占位符（未确认），暂时无法判断真实威胁模型下这个角色的信任等级。

**影响**：拥有 `feeKeeper` 角色（一个操作性角色，不是最高权限的多签）的地址可以绕开 `TOKEN_RECEIVER_ROLE` 白名单，把国库/保险库持有的任意 ERC20 直接转给任意地址。

**是否需要专题测试/验证**：需要——测试证明 `multicall` 能转给未被 `TOKEN_RECEIVER_ROLE` 允许的地址，而 `batchTransfer` 对同一目标会正确 revert，形成对照。 建议测试文件：`test/bugs/zenith/ZenithB28_TreasuryMulticallBypassesReceiverAllowlist.t.sol`。

### R8-B29

**严重性**: P1 🟠（对应 Zenith 原编号 #29）

**合约**: `src/oracle/Oracle.sol`（`_getSecondaryPrice` 的 `isADLStart` 分支跳过全部新鲜度校验）、`src/adl/AdlUtils.sol`（`updateAdlState`）、`src/exchange/AdlHandler.sol`（`updateAdlState()` 缺少 `withOraclePrices`）

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #29

**核对结论**：CONFIRMED，且比原始描述更严重——不是「允许用超过 24 小时的价格」，而是完全不设上限，且决定是否启动 ADL 的入口函数本身不要求提交任何新鲜价格数据。

`Oracle._getSecondaryPrice` 只有在 `!isADLStart` 时才检查 `latestRecordedPrice` 是否超过 `MAX_RECORDED_PRICE_AGE`；`isADLStart==true` 时这个检查被完全跳过（不是放宽，是没有）。更关键的是 `AdlHandler.updateAdlState()`（真正判断是否启动 ADL 的入口）没有 `withOraclePrices` 修饰符，调用时完全不提交价格，纯粹依赖 `latestRecordedPrices` 里可能是任意早前留下的旧值——这和已知的 recorded-price keeper 单点故障（此前已记录在 memory 里）是同一个子系统的风险放大。

**影响**：只要 `latestRecordedPrices` 因为 keeper 停机等原因变得陈旧，ADL 依然可以在过期价格基础上被错误启动/维持启动状态，而随后 `executeAdl` 用的却是真实新鲜价格——两次判断依据不一致，可能导致不该被 ADL 的仓位被强制减仓。

**是否需要专题测试/验证**：需要——测试证明 `updateAdlState()` 在价格远超 `MAX_RECORDED_PRICE_AGE` 时依然成功启动 ADL，而同一时刻直接调 `oracle.getSecondaryPrice`（非 ADL 起始路径）会正确 revert，形成对照。 建议测试文件：`test/bugs/zenith/ZenithB29_StaleRecordedPriceLatchesAdlStart.t.sol`。

### R8-B30

**严重性**: P0 🔴（对应 Zenith 原编号 #30）

**合约**: `src/market/MarketUtils.sol`（`settleFundingFees` 的付款方向不对称）、`ignition/modules/Fx100Fee.ts`（`FUNDING_FEE_TYPE` 复用跟普通手续费一样的 40/20/40 分账比例）

**状态**: REPORTED

**found_at**: 2026-08-11，核对 Zenith 私有 GitHub issues 仓库 `zenith-security/2026-08-f-x-protocol` #30

**核对结论**：CONFIRMED，Zenith 定级 Critical，本次核对认为该定级成立，不做下调。

`settleFundingFees` 在「LP 欠交易者」方向会直接 `transferOut` 全额给 `positionVault`（LP 100% 承担），但在「交易者欠 LP」方向完全没有对称的转账，只是把差额记进一个可 claim 的手续费桶（`FUNDING_FEE_TYPE`）——这个桶后续被 `FeeHandler`/`RevenuePool` 当成跟开平仓手续费、清算费一样的协议收入来分账，`Fx100Fee.ts` 给三种手续费类型配的是完全相同的 40% 国库/20% 保险库销毁/40% LPVault 比例，导致本该 100% 归还 LP 的资金费净流入只有 40% 真正进了 LP 金库，60% 被当作协议收入分掉了。`VaultBase.totalAssets()` 是纯 token 余额计数，这部分从未真正到账的资金在 LP 净值/份额定价里完全体现不出来。这直接违背了 `settleFundingFees` 自己的函数注释（按相同 token 数量结算给 LP），像是实现遗漏而不是设计选择。

**影响**：这是协议正常、高频的资金费结算路径（不需要任何攻击者行为，任何一次净付方向为「交易者付 LP」的资金费结算都会触发），随着资金费长期累积，LP 金库实际获得的资金费收入系统性地比协议设计意图少 60%，是一个持续性、结构性的 LP 价值流失，且目前没有任何部署配置能缓解（三种手续费类型的分账比例是在 ignition 部署脚本里硬编码成相同值的，不能单独覆盖资金费这一种）。

**是否需要专题测试/验证**：需要，最高优先级——完整还原一次「交易者欠 LP 方向」的资金费结算 → `FeeHandler.claimFees` → `RevenuePool.claim()` 全链路，量化 LP 实际到账 vs 应得全额的差额，并与「LP 欠交易者」方向的对称测试对比，证明不对称。 建议测试文件：`test/bugs/zenith/ZenithB30_FundingFeeSplitDivertsLpShare.t.sol`。

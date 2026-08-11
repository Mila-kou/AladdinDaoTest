---
title: 🧪 FX100 feeHandler.claimFees() 精确账本测试设计规范
notion_url: https://app.notion.com/p/3713d7873f2c817f83b7cf4733e35426
author: Gordon (chao@aladdin.club)
last_edited: 2026-06-08
archived: 2026-07-28
---

日期：2026-05-31 \| 状态：✅ P4 F1-F4 已实现；G2 S6-S10 已新增（2026-06-08） \| 分支：docs/testing-standards
---
## 概述
### 目的
现有 `P1_Fees.t.sol`（G2 系列）只验证了**第一步**：交易执行后 `claimableFeeAmountKey` 在 DataStore 里累积，但 `usdc.balanceOf(feeHandler)` 在现有所有测试中始终为 0 —— 因为 `claimFees()` 从未被调用过。
本套件补充验证**后两步**：
1. `claimFees()` — USDC 从 `positionVault` 转出到 `feeHandler`
2. `withdrawFees()` — USDC 从 `feeHandler` 转出到 `FEE_RECEIVER`（admin）
---
## 第一节：完整 USDC 流程
```javascript
交易执行（RECEIVER_FACTOR=100%）
  → claimableFeeAmountKey += feeAmount    [DataStore，USDC 仍在 posVault]

claimFees(marketIndex, usdc)              [任何人可调用]
  → positionVault → feeHandler            [feeAmount USDC 实际转移]
  → claimableFeeAmountKey 清零
  → availableFeeAmountKey += feeAmount    [FeeHandler 内部记账]

withdrawFees(usdc)                        [需要 feeKeeper 角色]
  → feeHandler → admin / FEE_RECEIVER     [feeAmount USDC 实际转移]
  → availableFeeAmountKey 清零
```
**三步状态变化对比：**
<table header-row="true">
<tr>
<td>步骤</td>
<td>posVaultUsdc</td>
<td>feeHandlerUsdc</td>
<td>claimableFeeKey</td>
<td>availableFeeKey</td>
<td>admin USDC</td>
</tr>
<tr>
<td>初始</td>
<td>0</td>
<td>0</td>
<td>0</td>
<td>0</td>
<td>X</td>
</tr>
<tr>
<td>交易后</td>
<td>+col +fee</td>
<td>0</td>
<td>+fee</td>
<td>0</td>
<td>X</td>
</tr>
<tr>
<td>claimFees()</td>
<td>-fee</td>
<td>+fee</td>
<td>0</td>
<td>+fee</td>
<td>X</td>
</tr>
<tr>
<td>withdrawFees()</td>
<td>-</td>
<td>-fee</td>
<td>0</td>
<td>0</td>
<td>X+fee</td>
</tr>
</table>
---
## 第二节：关键地址和角色
<table header-row="true">
<tr>
<td>角色</td>
<td>地址</td>
<td>权限</td>
</tr>
<tr>
<td>`feeKeeper`</td>
<td>`address(0x1004)`</td>
<td>唯一可调用 `withdrawFees()` 的地址</td>
</tr>
<tr>
<td>`FEE_RECEIVER`</td>
<td>`admin`</td>
<td>`withdrawFees()` 的收款人</td>
</tr>
<tr>
<td>`feeHandler`</td>
<td>合约地址</td>
<td>`claimFees()` 后 USDC 落地处</td>
</tr>
<tr>
<td>`positionVault`</td>
<td>合约地址</td>
<td>持有 collateral + 未提取的 fee</td>
</tr>
</table>
**DataStore 关键 key：**
```javascript
claimableFeeAmountKey(marketIndex, token)  ← 累积待领取 fee
availableFeeAmountKey(token)               ← FeeHandler 内部记账
FX100Keys.FEE_RECEIVER                    ← withdrawFees 的目标地址
```
---
## 第三节：断言框架
**三层断言（同 E2ELedger 风格）：**
<table header-row="true">
<tr>
<td>层级</td>
<td>断言</td>
<td>说明</td>
</tr>
<tr>
<td>Layer 1</td>
<td>`_assertZeroSum(s0, s1)`</td>
<td>每步操作四方守恒</td>
</tr>
<tr>
<td>Layer 2</td>
<td>`assertEq(feeHandlerΔ, +feeAmount)`</td>
<td>feeHandler 精确</td>
</tr>
<tr>
<td>Layer 3</td>
<td>`assertEq(claimableFeeAmount, 0)`</td>
<td>DataStore key 精确清零</td>
</tr>
<tr>
<td>Layer 3</td>
<td>`assertEq(availableFeeAmount, feeAmount)`</td>
<td>内部记账精确</td>
</tr>
</table>
**新增 helper（在 P4 文件内定义）：**
```solidity
function _claimFees() internal {
    feeHandler.claimFees(DEFAULT_MARKET_INDEX, address(usdc));
}

function _withdrawFees() internal {
    vm.prank(feeKeeper);
    feeHandler.withdrawFees(address(usdc));
}

function _availableFeeAmount() internal view returns (uint256) {
    return dataStore.getUint(FX100Keys.availableFeeAmountKey(address(usdc)));
}
```
---
## 第四节：4 个测试场景
**通用参数（setUp 中设定）：**
<table header-row="true">
<tr>
<td>参数</td>
<td>值</td>
<td>说明</td>
</tr>
<tr>
<td>`POOL_SEED`</td>
<td>`1_000_000e6`</td>
<td>LP 流动性</td>
</tr>
<tr>
<td>`SIZE`</td>
<td>`50_000e30`</td>
<td>每笔交易大小</td>
</tr>
<tr>
<td>`COLLATERAL`</td>
<td>`10_000e6`</td>
<td>保证金</td>
</tr>
<tr>
<td>`FEE_FACTOR`</td>
<td>`2e27`（0.2%）</td>
<td>单笔交易手续费率</td>
</tr>
<tr>
<td>`FEE_AMOUNT`</td>
<td>`100e6`</td>
<td>单笔交易的精确手续费</td>
</tr>
<tr>
<td>`RECEIVER_FACTOR`</td>
<td>`FLOAT_PRECISION`（100%）</td>
<td>全进 claimable</td>
</tr>
</table>
---
### F1：单笔交易 → claimFees() → 精确验证 posVault→feeHandler
**目的**：验证 `claimFees()` 的 USDC 转移精确无误，DataStore 状态正确清零。
```javascript
前提：RECEIVER_FACTOR=100%，FEE_FACTOR=0.2%，SIZE=50k → fee=100 USDC

步骤：
  _openLong(COLLATERAL, SIZE)      → claimableFeeKey += 100e6
  _closeFull(true)                 → claimableFeeKey += 100e6; 共200e6

  // 此时 feeHandlerUsdc = 0
  assertEq(s1.accounts.feeHandlerUsdc, 0)
  assertEq(s1.market.claimableFeeAmount, 2 * FEE_AMOUNT)

  _claimFees()

关键断言：
  _assertZeroSum(s2, s3)
  assertEq(feeHandlerΔ, +2 * FEE_AMOUNT)
  assertEq(posVaultΔ, -2 * FEE_AMOUNT)
  assertEq(s3.market.claimableFeeAmount, 0)
  assertEq(_availableFeeAmount(), 2 * FEE_AMOUNT)
```
---
### F2：多笔交易累积 → 单次 claimFees()
**目的**：验证累积后一次性 claim 的正确性。
```javascript
3 次 open+close → 累积 6 × FEE_AMOUNT = 600 USDC

_claimFees()

关键断言：
  _assertZeroSum(s0, s1)
  assertEq(feeHandlerΔ, 6 * FEE_AMOUNT)
  assertEq(s1.market.claimableFeeAmount, 0)
  assertEq(_availableFeeAmount(), 6 * FEE_AMOUNT)
```
---
### F3：claimFees() → withdrawFees() 完整链路
**目的**：验证从 posVault 到 FEE_RECEIVER（admin）的完整两步 USDC 转移。
```javascript
步骤：
  _openLong + _closeFull  → 积累 2 × FEE_AMOUNT

  // Step 1: claimFees
  _claimFees()
  assertEq(s1.accounts.feeHandlerUsdc, 2 * FEE_AMOUNT)
  assertEq(_availableFeeAmount(), 2 * FEE_AMOUNT)

  // Step 2: withdrawFees
  _withdrawFees()   // vm.prank(feeKeeper)

关键断言（withdrawFees 步骤）：
  _assertZeroSum(s2, s3)
  assertEq(admin_delta, 2 * FEE_AMOUNT)
  assertEq(s3.accounts.feeHandlerUsdc, 0)
  assertEq(_availableFeeAmount(), 0)

  // 端到端验证
  assertEq(posVault_net_delta, -2 * FEE_AMOUNT)
  assertEq(admin_net_delta, 2 * FEE_AMOUNT)
```
---
### F4：RECEIVER_FACTOR=50%，claimFees() 只提取 claimable 部分
**目的**：验证 50% 给 LP（交易时已转）、50% 进 claimable，两者互不影响。
```javascript
参数：RECEIVER_FACTOR = FLOAT_PRECISION / 2（50%）
  feeAmountForPool   = FEE_AMOUNT / 2 = 50 USDC  ← 交易时直接给 lpVault
  feeReceiverAmount  = FEE_AMOUNT / 2 = 50 USDC  ← 进 claimable

  // 交易时 LP 直接收到 50 USDC
  assertEq(lpVaultΔ, FEE_AMOUNT / 2)
  assertEq(s1.market.claimableFeeAmount, FEE_AMOUNT / 2)

  // claimFees 只提取 claimable 部分（50 USDC）
  _claimFees()

关键断言：
  _assertZeroSum(s2, s3)
  assertEq(feeHandlerΔ, FEE_AMOUNT / 2)
  assertEq(s3.market.claimableFeeAmount, 0)
  assertEq(lpVaultAssets_unchanged)  // LP 在 claimFees 步骤中不变
```
---
## 第五节：文件结构
```javascript
test/e2e/accounting/phase1/
  P4_FeeClaimAccounting.t.sol    ← 4 个测试，继承 E2ELedger
```
总计：4 个新测试函数（F1-F4），1 个新文件（P4_FeeClaimAccounting.t.sol）。另：P1_Fees.t.sol 同步扩展 G2-S6～G2-S10（5条，均 ✅ PASS）。
---
## 计算公式
```javascript
FEE_AMOUNT = mulDiv(SIZE, FEE_FACTOR, FLOAT_PRECISION) / USDC_PRICE
           = mulDiv(50_000e30, 2e27, 1e30) / 1e24 = 100e6 = 100 USDC

// claimFees 后的零和检验
posVaultΔ + feeHandlerΔ = -feeAmount + feeAmount = 0 ✓

// withdrawFees 后的零和检验
feeHandlerΔ + adminΔ = -feeAmount + feeAmount = 0 ✓

// RECEIVER_FACTOR=50% 时的拆分
feeAmountForPool = FEE_AMOUNT × 50% = 50e6 → lpVault（即时）
feeReceiverAmount = FEE_AMOUNT × 50% = 50e6 → claimable（待 claim）
```
---
*本文档是实现的唯一参考来源。写代码前先读这份文档，有疑问先更新文档再动代码。*
## 第七节：P1_Fees.t.sol 扩展（G2-S6 到 G2-S10）
本规范设计完成后，P1_Fees.t.sol 中额外新增 5 个 G2 测试，覆盖 claimFees/withdrawFees 的流程验证、权限控制和多市场场景，与 P4 F1-F4 的精确数值账本互补。
- G2-S6 (test_G2_S6_positionFeeAndUiFee_combined) — posFee(100)+uiFee(50)同时收取，各进独立bucket，net collateral=9850 USDC ✅
- G2-S7 (test_G2_S7_claimPositionFee_and_claimUiFee_pipeline) — 完整三步链路：claimFees + claimUiFees + withdrawFees，零和验证 ✅
- G2-S8 (test_G2_S8_accessControl_withdrawFees_requiresFeeKeeper) — claimFees=公开，withdrawFees=FEE_KEEPER专属（FxErrors.Unauthorized），新授权测试 ✅
- G2-S9 (test_G2_S9_multiMarket_claimFeesPerMarket_withdrawFeesOnce) — 2市场各claimFees(ETH=100+WBTC=40)→单次withdrawFees获140 USDC ✅
- G2-S10 (test_G2_S10_claimFees_isManual_usdcStaysInPosVaultUntilClaimed) — 交易只写DataStore，USDC留在posVault直到手动claimFees ✅

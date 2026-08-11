---
title: StakeDAO-Migration-Runbook
notion_url: https://app.notion.com/p/38e3d7873f2c80779a7bf34215617cab
author: Gordon (chao@aladdin.club)
last_edited: 2026-07-08
archived: 2026-07-28
---

# StakeDAO 迁移：运行手册 + 风险清单 + 验证指南
> 范围：(A) Pendle 废弃 vePendle 后 asdPENDLE 的 sPENDLE 收益处理；(B) veSDT → vlSDT 的 delegation/booster 迁移。<br>分支：`feat/stakedao-migration`。本文供你手工走查、并与开发/审计复核（与之前给的方案相比有变化，变化点见 §3、§5）。
Fork：[https://dashboard.tenderly.co/AladdinDAO/test/testnets/1cad3a19-ed65-4e8c-a701-1684a923d178/instance/a212278d-95c0-4a91-939e-09e942b01beb](https://dashboard.tenderly.co/AladdinDAO/test/testnets/1cad3a19-ed65-4e8c-a701-1684a923d178/instance/a212278d-95c0-4a91-939e-09e942b01beb)
验证交易记录：[https://docs.google.com/spreadsheets/d/1Ct-n6wq6i3-8E4PmgCLMoXaSu7eu0gd5X3n9F2w6ieQ/edit](https://docs.google.com/spreadsheets/d/1Ct-n6wq6i3-8E4PmgCLMoXaSu7eu0gd5X3n9F2w6ieQ/edit)
---
## 0. 摘要（给开发 / 审计）
- **审计三个 High 全部闭合**：boost() 参数顺序、endtime 按 week 对齐（origin 已修）；#3 迁移路径——选”全新 vlSDT 地址 `0x465D`“路径，sdCRV wrapper 通过**重部署 impl（仅改 immutable ****`delegation`****，源码不变）+ ProxyAdmin 升级**指向新 vlSDT（§3、R1）。
- **本次实操中新发现并已修复 2 个 runbook 问题**（fork 实测，§5 R6/R9）：
	1. **R9**：sPENDLE 抢救的 harvest 用 EmergencyConverter 会因其它 reward 走真实路由 `"unsupported poolType"` revert → **修复：抢救前先用真实 converter 跑一次正常 harvest**，使 stash 只剩 sPENDLE。
	2. **R6**：`sweepToken` 把币送到 strategy 的 `stash` 而非多签 → **修复：先 ****`updateStash(新stash 0x84C3)`**** 再 sweep**，sPENDLE 落入新 strategy 的 stash。`safe_C` 已更正为 3 笔。
- **执行铁律**：① 每个环境都要**重新部署 wrapper impl**（immutable 地址随 fork 变，回填 safe_A 第③笔）；② sPENDLE 抢救**必须先跑一次正常 harvest**。
- **完整端到端验证已在 fork ****`0fb319`**** 全部通过**（§6）：sdCRV 委托改道、sPENDLE 救出并复利、vlSDT 委托后 locker 拿 booster + 用户领到 SDT。
- **待办**：旧 `VeSDTDelegation 0x6037` 不动、保留 claim（约 16 万 SDT 历史奖励）；前端需先 `checkpoint(user)` 再 `claim`（R5）；过时的 fork 测试套件待统一修（R8）。
---
## 1. 关键地址
<table header-row="true">
<tr>
<td>角色</td>
<td>地址</td>
<td>备注</td>
</tr>
<tr>
<td>**新** VlSDTDelegation proxy</td>
<td>`0x465D39Bd6381568602dFDb3508bbbfa0E6215F7E`</td>
<td>owner=主多签；已部署初始化 ✅</td>
</tr>
<tr>
<td>旧 VeSDTDelegation proxy</td>
<td>`0x6037Bb1BBa598bf88D816cAD90A28cC00fE3ff64`</td>
<td>**不升级、不动**；保留 claim</td>
</tr>
<tr>
<td>sdCRV wrapper proxy</td>
<td>`0x09B0E3A114135F528F762DB8363b4f5eae3F3bF1`</td>
<td>`delegation` 当前=0x6037</td>
</tr>
<tr>
<td>**新** SdCRVBribeBurnerV2</td>
<td><span discussion-urls="discussion://38e3d787-3f2c-8077-9a7b-f34215617cab/38e3d787-3f2c-81ad-8811-ce662d9cfaba/3973d787-3f2c-80d1-b244-001c3e8d3acb">`0x9dB603bB327d915DCBe3B5241CdFcF722F759C45`</span></td>
<td>delegator=0x465D；已部署 ✅</td>
</tr>
<tr>
<td>SdPendleCompounder proxy</td>
<td>`0x606462126E4Bd5c4D153Fe09967e4C46C9c7FeCf`</td>
<td>待升级到新 impl</td>
</tr>
<tr>
<td>**新** SdPendleCompounder impl</td>
<td>`0x2f0EB991A7dfC7d7912194fCdAa0292d0c4f963b`</td>
<td>已部署 ✅</td>
</tr>
<tr>
<td>**新** SdPendleGaugeStrategy</td>
<td>`0x740f743cA121AA12e7d3739d4926cf6cAba44cE4`</td>
<td>stash=`0x84C310…06aaE`；已部署 ✅</td>
</tr>
<tr>
<td>旧 SdPendleGaugeStrategy</td>
<td>`0x94992Da38bE9aDADD359c2959588FdDFa2dFE5Cd`</td>
<td>stash=`0xC20eA0…7197`（**16,350 sPENDLE 卡在这里**）</td>
</tr>
<tr>
<td>**新** SdPendleBribeBurner</td>
<td>`0xBe11758E8912BD154613936D02e36B06cC46b4ED`</td>
<td>delegator=0x465D；已部署 ✅</td>
</tr>
<tr>
<td>EmergencyConverter</td>
<td>`0x4815bfD3F0ed01FE075b62dfe2bA27caBecfAB71`</td>
<td>poolType=15 透传；已部署 ✅</td>
</tr>
<tr>
<td>ProxyAdmin (Concentrator)</td>
<td>`0x12b1326459d72F2Ab081116bf27ca46cD97762A0`</td>
<td>owner=主多签</td>
</tr>
<tr>
<td>**主多签**</td>
<td>`0xA0FB1b11ccA5871fb0225B64308e249B97804E99`</td>
<td>ProxyAdmin/locker/旧strategy owner + 各合约 DEFAULT_ADMIN</td>
</tr>
<tr>
<td>**Aladdin 管理多签**</td>
<td>`0xc40549aa1D05C30af23a1C4a5af6bA11FCAFe23F`</td>
<td>**ConverterRegistry 的 owner**（updateRoute 用它）</td>
</tr>
<tr>
<td>ConverterRegistry</td>
<td>`0x997B6F43c1c1e8630d03B8E3C11B60E98A1beA90`</td>
<td></td>
</tr>
<tr>
<td>GeneralTokenConverter（旧 converter）</td>
<td>`0x11C907b3aeDbD863e551c37f21DD3F36b28A6784`</td>
<td></td>
</tr>
<tr>
<td>Keeper（ProtocolTreasuryProxy_bribe）</td>
<td>`0x24f043419850db81d2d7cda72fe9044eacbc5b3d`</td>
<td>合约，multicall 跑 harvest；授 WHITELIST_BURNER_ROLE</td>
</tr>
<tr>
<td>sPENDLE / WETH / SDT</td>
<td>`0x9999…4144` / `0xC02a…Cc2` / `0x7396…DB2F`</td>
<td></td>
</tr>
</table>
---
## 2. 两个功能的逻辑
**A. sPENDLE 收益处理（新 SdPendleGaugeStrategy.harvest）**<br>vePendle 废弃后，asdPENDLE 拿到的是 sPENDLE（质押 2 周的 vault token，赎回需 2 周冷却）。新 harvest：claim → 取回 stash；若已有冷却且到期→`finalizeCooldown()` 拿回 PENDLE，若无冷却且手里有 sPENDLE→`cooldown(balance)` 发起赎回；其余 reward→WETH→PENDLE；PENDLE→sdPENDLE（depositor 锁 vs Curve 取优）；sdPENDLE 复利。即”每次 harvest 自动续期/收割”，2 周后下一次 harvest 自动取出 PENDLE。
**B. veSDT→vlSDT booster 迁移**<br>旧 `VeSDTDelegation` 线性衰减模型；新 `VlSDTDelegation` flat boost 模型。booster fee（收益的一部分换成 SDT 给 delegation，分给委托人）必须改道新 vlSDT `0x465D`。
---
## 3. 代码改动说明（与之前方案的变化点）
1. **审计前两点已修**（origin 上）：`boost()` 参数顺序、`_endtime` 按 week 对齐。
2. **审计第 3 点（迁移路径）——本次新增的关键变化**：
	- 选定路径＝**部署全新 vlSDT 地址 0x465D**（不原地升级旧 0x6037）。
	- sdCRV wrapper 的 `delegation` 是 **`immutable`**（在字节码里、不占 storage）。**wrapper 的 Solidity 源码没有任何改动**（`git diff origin/main…HEAD` 对 `ConcentratorSdCrvGaugeWrapper.sol` 和基类 `ConcentratorStakeDAOGaugeWrapper.sol` 均为空）。
	- 要把 `delegation` 从 0x6037 换成 0x465D，**不改合约代码**，只需：用新的构造参数 `_delegation=0x465D` **重新部署一份 wrapper implementation**（字节码与现有 impl 完全一致，仅 immutable 不同），再 `ProxyAdmin.upgrade(0x09B0…, 新impl)`。`harvest()`/`harvestBribes()` 代码不变——它们转给 `delegation`，升级后这个 immutable 解析成 0x465D，**就不会再进旧 0x6037**。因为是 immutable，不动 storage、用户余额零影响。
	- **部署脚本**：`scripts/cmd/deploy_stakedao_migration.ts`（我改了：把它重构成可调用的 `deployStakeDaoMigration()`，并**新增部署这份新 wrapper impl** —— `ConcentratorSdCrvGaugeWrapper(gauge, locker, 0x465D, bribeClaimer)`，返回 `sdCrvWrapperImplementation`）。
	- **注意：这份新 wrapper impl 之前在 Tenderly 环境没有部署**（链上确认 wrapper.delegation 仍是 0x6037、且没有对应新 impl）。这是 runbook 里原本缺的一步，需补上。
3. **新增 fork 测试** `test/fork/concentrator/stakedao/StakeDaoMigration.spec.ts`（断言升级后 delegation 切换且 balanceOf/totalSupply 不变）。⚠️ 它能编译，但 hardhat fork 解码器不认 Tenderly 区块格式（缺 `totalDifficulty`），需用普通 mainnet archive RPC 才能跑；其逻辑已用直连脚本在 Tenderly 上验证通过（见 §6）。
---
## 4. 完整操作步骤（按顺序）
> Safe JSON 在 **`docs/safe-txs/`** 下：`safe_A_sdcrv.json`、`safe_B_spendle_pre.json`、`safe_C_spendle_post.json`、`safe_D_pendle.json`、`safe_E_registry_route.json`。<br>主多签=`0xA0FB`，管理多签=`0xc40549`。`syncRewardToken()` 谁都能调，但**必须按本顺序执行**。
### 第 0 步（部署，非多签）
- **CRV-0**：部署新 wrapper impl `ConcentratorSdCrvGaugeWrapper(0x7f50786A…3466, 0x1c0D72a3…ad09, 0x465D…, 0xEb78…D3c)`，把得到的地址回填到 `safe_A_sdcrv.json` 第 ③ 笔 `upgrade` 的第二个参数。可用 `deploy_stakedao_migration.ts` 产出。
- ⚠️ **每个环境/每次 fork 都要重新部署这份 impl**（`delegation` 是 immutable，地址随部署变；某 fork 上的 impl 在另一个 fork 上没有代码，照旧地址 upgrade 会把 wrapper 升级到空地址而报废）。
### sdCRV —— `safe_A_sdcrv.json`（主多签）
1. `SdCRVBribeBurnerV2(0x9dB6).grantRole(WHITELIST_BURNER_ROLE, keeper 0x24f0)`
2. `wrapper(0x09B0).updateConverter(0x9dB6)`
3. `ProxyAdmin(0x12b1).upgrade(0x09B0, <CRV-0 impl>)`
### sPENDLE 抢救（已按 fork 0fb319 实测更正；注意中间夹 keeper harvest，不能合成一个原子批次）
- **a0.（必须的前置，R9）先跑一次正常 harvest**：保持 `compounder.converter()` = 真实 GeneralConverter `0x11C907`，由 harvester 跑一次顶层 harvest，把 SDT/WETH 等常规 reward 正常处理掉，使旧 stash **只剩 sPENDLE**。不做这步，后面带 EmergencyConverter 的 harvest 会因其它 reward 走真实路由而 `"unsupported poolType"` revert。
- a.（前置）确认旧 stash `0xC20e` 里 USDT=0、且 a0 后只剩 sPENDLE
-
	1. `旧strategy(0x9499).syncRewardToken()` —— 公开，keeper/任何人可调
-
	1. **`safe_E_registry_route.json`****（管理多签 0xc40549）**：`ConverterRegistry.updateRoute(sPENDLE, WETH, [route])`，route=`897946605976065710371576166102758732145457482764303`
-
	1. **`safe_B_spendle_pre.json`****（主多签）**：`compounder(0x6064).updateConverter(EmergencyConverter 0x4815)`
-
	1. **keeper**：从顶层 harvest（`compounder.harvest(receiver, 0)`，`onlyHarvester`=`0xfa86aa…`）—— 把 stash 里的 sPENDLE 经透传留到旧 strategy
-
	1. **`safe_C_spendle_post.json`****（主多签，已更正为 3 笔）**：① `旧strategy.updateStash(新stash 0x84C3)` → ② `旧strategy.sweepToken([sPENDLE])`（这样落到**新 strategy 的 stash**，而非旧 stash）→ ③ `compounder.updateConverter(回旧 GeneralConverter 0x11C9)`
### PENDLE 新策略/compounder/burner —— `safe_D_pendle.json`（主多签）
1. `locker(0x1c0D).updateOperator(SdPendleGauge 0x50DC…, 新strategy 0x740f)`
2. `locker.updateGaugeRewardReceiver(SdPendleGauge, 新strategy.stash 0x84C3…)`
3. `ProxyAdmin.upgrade(compounder 0x6064, 新impl 0x2f0E)`
4. `compounder.migrateStrategyV2(0x740f)`
5. `新SdPendleBribeBurner(0xBe11).grantRole(WHITELIST_BURNER_ROLE, keeper 0x24f0)`
6. `compounder.updateBribeBurner(0xBe11)`
---
## 5. 风险 & 未决问题（请重点和开发/审计过）
<table header-row="true">
<tr>
<td>#</td>
<td>问题</td>
<td>现状 / 结论</td>
<td>待办</td>
</tr>
<tr>
<td>R1</td>
<td>**审计#3：wrapper immutable delegation 指向旧 0x6037**</td>
<td>用”重部署 impl(delegation=0x465D)+升级”解决，**已在 Tenderly 实测通过**（delegation 0x6037→0x465D，余额不变）。源码不改。</td>
<td>执行 CRV-0 + safe_A 第③笔</td>
</tr>
<tr>
<td>R2</td>
<td>**SDT booster fee 两条路径**</td>
<td>主路径=bribe→burner→delegator（新 burner 已指向 0x465D ✅）。`harvest()`/`harvestBribes()` 里”直接 SDT”分支转给 immutable delegation：当前 `getBoosterRatio()=10%` 且 SDT 是注册 reward token，**逻辑已上膛**，只因 sdCRV gauge 当前不发 SDT 而空转。一旦发 SDT 会漏进旧 0x6037 → 靠 R1 的 wrapper 升级兜底。</td>
<td>记录；wrapper 升级后即覆盖</td>
</tr>
<tr>
<td>R3</td>
<td>**sPENDLE 收益不应给 vlSDT 用户**</td>
<td>✅ 确认无问题：sPENDLE 走 strategy.harvest 复利成 sdPENDLE 给 asdPENDLE 持有人，全程不经 delegation；只有 bribe(harvestBribe) 才有 booster fee，vePendle 废弃后无新 bribe。</td>
<td>无</td>
</tr>
<tr>
<td>R4</td>
<td>**旧 0x6037 未领取 SDT（约 160,629 SDT）**</td>
<td>不动旧合约、保留 claim。用户的 boost 按旧线性模型继续衰减（与 StakeDAO 的 veSDT→vlSDT **脱钩**，旧合约感知不到 veSDT 已迁走），会持续分到旧合约里的 SDT 直至衰减完/发完。</td>
<td>见 R5 前端；最后补一次 `checkpointReward()`</td>
</tr>
<tr>
<td>R5</td>
<td>**用户 0x3f43…8620 报告”看不到/领不到旧奖励”**</td>
<td>✅ 已查清：他 veSDT=0、旧合约里 boost 仍在（balanceOf≈6035），但近几周 `historyBoosts` 没被 checkpoint→前端读到 0。**实测 ****`checkpoint(user)`****+****`claim(user,user)`**** 真领出 303.36 SDT**。钱在、能领。</td>
<td>前端修复：先 `checkpoint(user)` 再 `claim`；或给用户合约直领指引</td>
</tr>
<tr>
<td>R6</td>
<td>✅ **已解（fork 0fb319 验证）：sweepToken→stash，需先 updateStash**</td>
<td>`_sweepToken` 把 token 转到 strategy 的 `stash`，不是多签。**修复**：先 `旧strategy.updateStash(新stash 0x84C3)` 再 `sweepToken([sPENDLE])`，sPENDLE 即落到新 strategy 的 stash。实测：旧 strategy 19,042.9 → 新 stash 0x84C3 = 19,042.9，旧 strategy 归 0。已写入修正版 `safe_C_spendle_post.json`（3 笔：updateStash + sweepToken + updateConverter 恢复）。</td>
<td>用修正版 safe_C</td>
</tr>
<tr>
<td>R9</td>
<td>✅ **已解（fork 0fb319 验证）：先跑一次正常 harvest**</td>
<td>之前 harvest revert `"unsupported poolType"` 是因为 stash 里除 sPENDLE 外还有 SDT/WETH 等要走真实路由。**修复**：在 sPENDLE 抢救前**先用真实 GeneralConverter 跑一次正常 harvest**，把常规 reward 清掉、stash 只剩 sPENDLE；之后再 sync→updateRoute→updateConverter(Emergency)→harvest，只转换 sPENDLE（透传）→ 不再 revert。实测通过。</td>
<td>抢救前必须先跑一次正常 harvest</td>
</tr>
<tr>
<td>R7</td>
<td>ConverterRegistry owner 是管理多签 0xc40549，非主多签</td>
<td>updateRoute 用 `safe_E`（管理多签）发起。</td>
<td>用对多签</td>
</tr>
<tr>
<td>R8</td>
<td>fork 测试套件过时</td>
<td>旧 3 参数 wrapper / 1 参数 burner 构造，编不过新合约。</td>
<td>后续统一修</td>
</tr>
</table>
---
## 6. 已完成的链上验证（Tenderly，snapshot→执行→revert，环境无损）
- **R1 wrapper 升级**：升级到 `delegation=0x465D` 的新 impl 后，`wrapper.delegation()` 0x6037→0x465D，`balanceOf(asdCRV)` 与 `totalSupply` 完全不变。✅ PASS
- **R5 用户领取**：对 `0x3f43` 执行 `checkpoint`+`claim`，实收 **303.36 SDT**。✅
**新 testnet ****`64947c`**** 上的执行/验证（2026-06-29）：**<br>- **CRV-0 部署**：新 wrapper impl `0x95E23741bd9ADBFA70667C409F5158e41EB40D6b`（delegation=0x465D、gauge/locker/bribeClaimer 校验通过）。<br>- **safe_A 已由多签执行并验证**：`delegation→0x465D`、`converter→0x9dB6`、keeper 获 WHITELIST_BURNER_ROLE、`balanceOf(asdCRV)`/`totalSupply` 不变（19,293,700.22）。✅<br>- **sPENDLE 抢救 dry-run（snapshot）→ 在此发现 R6/R9**：sweepToken→stash；harvest revert “unsupported poolType”。已据此更正流程（见下 0fb319 完整验证）。
### ✅ 完整端到端验证（fork `0fb319-8825fd` / testnet `1cad3a19`，2026-06\~07，全部通过）
> 新 wrapper impl 本 fork 部署于 `0x476C38BD995f130682a00Fe557358Aa38425d319`。
<table header-row="true">
<tr>
<td>模块</td>
<td>验证结果</td>
</tr>
<tr>
<td>**sdCRV (safe_A)**</td>
<td>`delegation`→新 vlSDT `0x465D`、`converter`→新 burner `0x9dB6`、keeper 获 WHITELIST_BURNER_ROLE；`balanceOf(asdCRV)`/`totalSupply` 不变（19,293,700.22）</td>
</tr>
<tr>
<td>**vlSDT 地址一致性**</td>
<td>wrapper.delegation=0x465D；两个 burner 字节码均含 0x465D、不含旧 0x6037；vlSDT 自身 stakeDAOProxy=locker、owner=多签</td>
</tr>
<tr>
<td>**sPENDLE 抢救 (R9)**</td>
<td>先正常 harvest 清杂币 → 旧 stash 只剩 sPENDLE（19,042.9）→ sync/route/EmergencyConverter harvest **不再 revert**</td>
</tr>
<tr>
<td>**sPENDLE 提取 (R6)**</td>
<td>`updateStash(新stash)`+`sweepToken` → 19,042.9 sPENDLE 落入新 stash `0x84C3`、旧 strategy 归 0；converter 已恢复 `0x11C907`</td>
</tr>
<tr>
<td>**PENDLE 迁移 (safe_D)**</td>
<td>`compounder.strategy`→`0x740f`、`bribeBurner`→`0xBe11`；`locker.operators(gauge)`→新 strategy、`gauge.rewards_receiver`→新 stash `0x84C3`</td>
</tr>
<tr>
<td>**sPENDLE 收益闭环**</td>
<td>新 harvest 把新 stash 的 sPENDLE 发起 14 天 cooldown（userCooldown=19,042.9）→ 推进 15 天 → 再 harvest **finalize**（cooldown 归 0）→ PENDLE→sdPENDLE→复利，`compounder.totalAssets()`=519,046.55</td>
</tr>
<tr>
<td>**vlSDT 委托 (Phase 1)**</td>
<td>`0x3f43`（8,100.7 vlSDT）setOperator+boost → `vlBoost.receivedTotal(locker)`=8,100.7（**locker 拿到 booster**）、`VlSDTDelegation.balanceOf(0x3f43)`=8,100.7（**用户拿到 share**）</td>
</tr>
<tr>
<td>**vlSDT 用户收益 (Phase 2)**</td>
<td>注入 1000 SDT 收益 + 过周 → `claim(0x3f43)` 实领 **773.85 SDT**（余额未满 1000 是周分配机制，当前周部分需再过一周才可领，机制正确）</td>
</tr>
</table>
以上 snapshot 验证均已 revert，环境无损；safe_A / safe_C / safe_D 为真实多签执行。
```markdown


---

## vlSDT 委托 + 领取：持久化复跑（fork `0fb319`，未 revert，可在 Tenderly 查证）

**参与地址**：`0x3f43`（veSDT→vlSDT 迁移用户，余额 8,100.7 vlSDT）  
**说明**：已真实跑一遍并保留交易（可在 Tenderly 查证）。

### 交易清单

| # | 操作 | Tx |
|---:|---|---|
| 1 | `vlBoost.setOperator(VlSDTDelegation, true)` | `0x2fc0bec1…d52c6a2` |
| 2 | `VlSDTDelegation.boost(全部, endtime, self)` | `0x481d8106…c516174f` |
| 3 | `checkpointReward`（baseline） | `0x94c197d4…6ec049ca` |
| 4 | `checkpointReward`（分配：注入 1000 SDT 模拟 booster fee 后） | `0x0560f8fa…d1671724` |
| 5 | `VlSDTDelegation.claim(0x3f43, 0x3f43)` | `0x3ae963db…ce25f3cb` |

### 结果

- Tx #2 后：
  - `vlBoost.receivedTotal(locker)=8,100.7`（locker 拿 booster）
  - `VlSDTDelegation.balanceOf(0x3f43)=8,100.7`（用户 share）
- Tx #5 后：claim 实领 **884.30 SDT**（400.85 → 1285.15）
- 注入的 1000 SDT：通过 `tenderly_setErc20Balance` 模拟 booster fee。

### 前端读「可领多少 SDT」

- 直接 `eth_call`（staticcall）`claim(user, user)`：返回值即当前可领量（`claim` 内部已自动 `checkpointReward` + 结算）。
- 更稳的读法：multicall（均用 staticcall）`[checkpointReward(), claim(user,user)]`，覆盖「刚注入 < 1 天」的奖励场景。
- 注意：当前周奖励需「过周」才计入。

> 新旧 delegation（vlSDT `0x465D` / 旧 `0x6037`）读取逻辑同理。

### 状态盘点（迁移前基线）

- wrapper：`delegation=0x6037`，converter=旧
- compounder：`strategy/bribeBurner`=旧
- 新 `vlSDT/burner/strategy`：均已部署，owner/admin=主多签
- `ProxyAdmin` owner=主多签
- `ConverterRegistry` owner=管理多签
```
- 状态盘点（迁移前基线）：wrapper.delegation=0x6037、converter=旧、compounder.strategy/bribeBurner=旧；新 vlSDT/burner/strategy 均已部署、owner/admin=主多签；ProxyAdmin owner=主多签；ConverterRegistry owner=管理多签。
---
## 7. 验证计划（两阶段）
### 阶段一：在「已部署合约」的 Tenderly 上手工走一遍
按 §4 顺序，用 §1 的多签逐个执行（fork 里 impersonate 多签）。每步后断言：
1. CRV-0+safe_A 后：`wrapper.delegation()==0x465D`；`wrapper.converter()==0x9dB6`；`burner.hasRole(WHITELIST_BURNER_ROLE, keeper)==true`；`wrapper.balanceOf(asdCRV)`、`totalSupply` 不变。
2. sPENDLE 抢救（b→f）后：**观察 16,350 sPENDLE 的最终落点**（验证 R6）；确认无 revert；最后 `compounder.converter()` 已切回旧 GeneralConverter。
3. safe_D 后：`compounder.strategy()==0x740f`；`compounder.bribeBurner()==0xBe11`；`locker` operator/rewardReceiver 已指向新 strategy/新 stash。
4. **sPENDLE 端到端**：把抢救出的 sPENDLE 转入新 strategy → `harvest`（应发起 cooldown，strategy sPENDLE→0、userCooldown 记到）→ **推进 2 周** → 再 `harvest`（应 finalize 拿回 PENDLE→换成 sdPENDLE→复利进 LOCKER）。断言 cooldownAmount 归零、LOCKER 的 sdPENDLE 增加。
5. **sdCRV bribe 端到端**（用真实参考交易）：
	- 参考 harvestBribe：`0xe6ea3dca16c7cab4a8b7b57ca2c0c105e36cc5574179f5497989ba4bf62f000f`
	- 参考 burn：`0x58a07d3303e2d32fa9c69bcc8b9686de317e679dd5d0495a44f015f22ba5ddb1`
	- 在这两笔之前的区块 fork，部署新合约 + 升级 wrapper + updateConverter，按相同 claim 参数走一遍 `harvestBribes` → `burn`，**断言 booster fee 的 SDT 进入新 vlSDT ****`0x465D`****、而非旧 0x6037**；compounder/treasury 分账正确。
### 阶段二：全新 fork 重新部署再验证
在干净的 mainnet fork（建议就用阶段一·5 的”参考交易之前的区块”）上，用 `deploy_stakedao_migration.ts` **重新部署全部新合约**（含新 wrapper impl），再完整跑一遍 §4 + 上述 1–5 断言。确保 deploy script、构造参数、迁移顺序、最终 reward flow 与生产一致。
---
## 8. 手工走查 checklist（逐条勾）
- [ ] **本 fork/环境**部署 CRV-0 新 wrapper impl，回填 safe_A 第③笔（每个环境都要重部署，地址会变）
- [ ] 执行 safe_A（主多签）→ 断言 delegation/converter/role/余额
- [ ] **(R9 前置) 先用真实 GeneralConverter 跑一次正常 harvest**，使旧 stash 只剩 sPENDLE
- [ ] safe_E（管理多签）updateRoute(sPENDLE→WETH 透传)
- [ ] safe_B（主多签）updateConverter(EmergencyConverter)
- [ ] keeper 顶层 harvest（应不再 revert；sPENDLE 留在旧 strategy）
- [ ] **safe_C（主多签，已更正 3 笔）** updateStash(新stash) + sweepToken + updateConverter(回旧)→ **核对 sPENDLE 落入新 stash 0x84C3（R6）**
- [ ] safe_D（主多签）strategy/compounder/burner 切换
- [ ] 新 strategy harvest（发起 cooldown）→ +2周 → 再 harvest → 断言 finalize + sdPENDLE 复利
- [ ] vlSDT 验证：某 vlSDT 持有者 setOperator+boost → 断言 locker.receivedTotal↑ + 用户 share；注入 SDT + 过周 → claim 断言用户领到 SDT
- [ ] sdCRV bribe：参考真实 tx 走 harvestBribes+burn → 断言 SDT 进 0x465D（可选，bribe 路径补充验证）
- [ ] 旧 0x6037：`checkpointReward()` 一次；前端先 `checkpoint(user)` 再 `claim`（R5）
- [ ] 生产/全新 fork：用 `deploy_stakedao_migration.ts` 重部署全部新合约再跑一遍
<empty-block/>
```javascript
mainnet deployment:

VlSDTDelegation implementation: 0x6055Eaf99F1108AFe0ea239810Da771E8f99Bc3b
VlSDTDelegation proxy: 0x322c76e1205dE5ee4146e40644563B482B1CDA43
SdCRVBribeBurnerV2: 0xC56ec704c18dba3CDE4bf5A5c898E089DDAc5E27
ConcentratorSdCERGuageWrapper: 0xc25118D62046EFfBc3bcAC495cfCa2c08CbD0f08
EmergencyConverter: 0x9677f8Cc01226060C61733741E50Bb1B251561Cb
SdPendleCompounder: 0x8D985f7842A5e347CB668377e88B9fF659259D34
SdPendleBribeBurner: 0x15248cC4Ef7EdCB1B651037Db36DA710847A63cb
SdPendleGaugeStrategy: 0x6402258efa299F9fE8b50c8A6ce3F6E9f492347a

建议抢救完老的sPendle后，可以加一个调用ConverterRegistry.updateRoute(sPENDLE, WETH, [])
清除一下临时的route
```
```plain text
新 wrapper impl 0xc251.delegation() = 0x322c (新 vlSDT) ✓
新 strategy 0x6402.stash()          = 0x32c9C5fa9f38475626bc9Bc115cC6363188F78A1  ← 主网新 stash
新 vlSDT 0x322c: stakeDAOProxy=locker ✓、owner=主多签 ✓
wrapper proxy 0x09B0.delegation()   = 0x6037（迁移前，正确）
旧 stash 0xC20e sPENDLE（待救）      = 19,635.85
```
<br>
<empty-block/>

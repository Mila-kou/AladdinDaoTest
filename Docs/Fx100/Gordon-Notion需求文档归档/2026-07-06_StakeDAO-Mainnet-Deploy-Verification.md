---
title: StakeDAO-Mainnet-Deploy-Verification
notion_url: https://app.notion.com/p/38f3d7873f2c80d79b2ef144a96357d2
author: Gordon (chao@aladdin.club)
last_edited: 2026-07-06
archived: 2026-07-28
---

# StakeDAO 迁移 — 主网部署验证 & 上线多签清单
> 用途：供相关人（开发 / 审计 / 多签签署人）审阅主网部署、确认 fork 验证结论、并据此发起上线多签。<br>详尽背景与风险分析见同目录 `StakeDAO-Migration-Runbook.md`；本文件为上线导向的精简自包含版。
相关合约与多签交易也可以参考google sheet：[https://docs.google.com/spreadsheets/d/1Ct-n6wq6i3-8E4PmgCLMoXaSu7eu0gd5X3n9F2w6ieQ/edit?gid=2121631744#gid=2121631744](https://docs.google.com/spreadsheets/d/1Ct-n6wq6i3-8E4PmgCLMoXaSu7eu0gd5X3n9F2w6ieQ/edit?gid=2121631744#gid=2121631744)
升级的合约：[https://github.com/AladdinDAO/aladdin-v3-contracts/pull/273](https://github.com/AladdinDAO/aladdin-v3-contracts/pull/273)
部署地址：[https://github.com/AladdinDAO/deployments/blob/main/deployments.mainnet.md](https://github.com/AladdinDAO/deployments/blob/main/deployments.mainnet.md)
---
## 1. 目的与范围
本次迁移做两件事：
- **A. sPENDLE 收益处理**：Pendle 废弃 vePendle，asdPENDLE 拿到的是 sPENDLE（质押凭证，赎回需 14 天 cooldown）。卡在旧策略 stash 里的 \~1.96 万枚 sPENDLE 需救出，并让 sPENDLE 收益接入标准 harvest 流程（harvest 自动发起/finalize cooldown → PENDLE → sdPENDLE → 复利进 asdPENDLE）。
- **B. veSDT → vlSDT booster 迁移**：StakeDAO 把 veSDT 换成 vlSDT，booster fee 的收款 delegation 从旧 `VeSDTDelegation 0x6037…` 改道到新 `VlSDTDelegation 0x322c…`。
审计三个 High 已全部闭合（boost 参数顺序、endtime 按周对齐、迁移路径），实操中另发现并修复 2 点（见 §5）。
---
## 2. 主网部署合约（已上链，2026-06；逐个详情 + 链上核对）
> 类型说明：proxy=对外地址（storage 所在）；impl=实现合约（逻辑，经 ProxyAdmin 指向）；standalone=独立合约。“链上核对”列为部署后实际读到的关键配置。
<table>
<tr>
<td>**序号**</td>
<td>**部署合约名称**</td>
<td>**合约地址**</td>
</tr>
<tr>
<td>1</td>
<td>VlSDTDelegation implementation</td>
<td>0x6055Eaf99F1108AFe0ea239810Da771E8f99Bc3b</td>
</tr>
<tr>
<td>2</td>
<td>VlSDTDelegation proxy</td>
<td>0x322c76e1205dE5ee4146e40644563B482B1CDA43</td>
</tr>
<tr>
<td>3</td>
<td>SdCRVBribeBurnerV2</td>
<td>0xC56ec704c18dba3CDE4bf5A5c898E089DDAc5E27</td>
</tr>
<tr>
<td>4</td>
<td>ConcentratorSdCERGuageWrapper</td>
<td>0xc25118D62046EFfBc3bcAC495cfCa2c08CbD0f08</td>
</tr>
<tr>
<td>5</td>
<td>EmergencyConverter</td>
<td>0x9677f8Cc01226060C61733741E50Bb1B251561Cb</td>
</tr>
<tr>
<td>6</td>
<td>SdPendleCompounder</td>
<td>0x8D985f7842A5e347CB668377e88B9fF659259D34</td>
</tr>
<tr>
<td>7</td>
<td>SdPendleBribeBurner</td>
<td>0x15248cC4Ef7EdCB1B651037Db36DA710847A63cb</td>
</tr>
<tr>
<td>8</td>
<td>SdPendleGaugeStrategy</td>
<td>0x6402258efa299F9fE8b50c8A6ce3F6E9f492347a</td>
</tr>
</table>
### 2.1 vlSDT booster 相关
**VlSDTDelegation（proxy，新 booster delegation）** — `0x322c76e1205dE5ee4146e40644563B482B1CDA43`<br>- 作用：booster fee 的新收款 & 分润合约（替代旧 `VeSDTDelegation 0x6037`）。用户把 vlSDT 投票权委托给 StakeDAO locker，按份额领取 SDT。<br>- 关键 immutable / 配置：`stakeDAOProxy` = locker `0x1c0D72a330F2768dAF718DEf8A19BAb019EEAd09`；`vlBoost` = `0xaB05ca46d1c78CAbB051efFE35099714Cad2AddA`；`owner` = 主多签。<br>- 链上核对：`stakeDAOProxy()`=locker ✓、`vlBoost()`=0xaB05 ✓、`owner()`=主多签 ✓、已 `initialize`。<br>- impl：`0x6055Eaf99F1108AFe0ea239810Da771E8f99Bc3b`。
**SdCRVBribeBurnerV2（standalone，新）** — `0xC56ec704c18dba3CDE4bf5A5c898E089DDAc5E27`<br>- 作用：sdCRV bribe 收益 burner；burn 时把 booster fee 部分换成 SDT 转给 `delegator`。<br>- 关键 immutable：`wrapper` = sdCRV wrapper `0x09B0…3bF1`；`delegator` = **新 vlSDT ****`0x322c…`**（private immutable，无 getter）。<br>- 链上核对：runtime 字节码含新 vlSDT `0x322c…`、**不含**旧 `0x6037` ✓。
**新 sdCRV wrapper 实现（impl，CRV-0）** — `0xc25118D62046EFfBc3bcAC495cfCa2c08CbD0f08`<br>- 作用：`ConcentratorSdCrvGaugeWrapper` 的新实现，**源码与旧实现完全一致，仅 immutable ****`delegation`**** 换成新 vlSDT**。供 `ProxyAdmin.upgrade(0x09B0…, 0xc251…)`，使 wrapper 的 SDT booster fee 从旧 0x6037 改道到新 vlSDT。<br>- 关键 immutable：`gauge` = SdCrvGauge `0x7f50786A0b15723D741727882ee99a0BF34e3466`；`locker` = `0x1c0D…ad09`；`delegation` = **新 vlSDT ****`0x322c…`**；`bribeClaimer` = `0xEb7874754362386CA438E70447A60A626bCaaD3c`。<br>- 链上核对：`delegation()`=0x322c ✓、`gauge()/locker()/bribeClaimer()` 均正确 ✓。（升级是改 immutable、不动 storage，用户余额零影响。）
### 2.2 sPENDLE / asdPENDLE 相关
**新 SdPendleGaugeStrategy（standalone，新）** — `0x6402258efa299F9fE8b50c8A6ce3F6E9f492347a`<br>- 作用：带 sPENDLE 处理逻辑的新策略——harvest 时自动 `finalizeCooldown`（赎回到期的）+ 对手里的 sPENDLE 发起新 `cooldown`，PENDLE→sdPENDLE 复利。<br>- 构造时自建 stash（StakeDAOGaugeWrapperStash）：`0x32c9C5fa9f38475626bc9Bc115cC6363188F78A1`。<br>- 链上核对：`stash()`=0x32c9 ✓、`name()`=“SdPendleGauge” ✓。
**SdPendleCompounder 新实现（impl）** — `0x8D985f7842A5e347CB668377e88B9fF659259D34`<br>- 作用：asdPENDLE compounder 的新实现，新增 `migrateStrategyV2`（切换 strategy 指针）等。供 `ProxyAdmin.upgrade(0x6064…, 0x8D98…)`。
**SdPendleBribeBurner（standalone，新）** — `0x15248cC4Ef7EdCB1B651037Db36DA710847A63cb`<br>- 作用：sdPENDLE bribe burner；booster fee 换成 SDT 转给 `delegator`。<br>- 关键 immutable：`compounder` = `0x6064…FeCf`；`delegator` = **新 vlSDT ****`0x322c…`**。<br>- 链上核对：runtime 字节码含 `0x322c…`、不含旧 `0x6037` ✓。
**EmergencyConverter（standalone）** — `0x9677f8Cc01226060C61733741E50Bb1B251561Cb`<br>- 作用：poolType=15 的”原样透传” converter，仅 sPENDLE 抢救时临时挂在 compounder 上，让 harvest 把 sPENDLE 过流程而不真正兑换。抢救后即恢复正常 converter（MAIN-12）。
### 2.3 不变的固定合约（沿用）
sdCRV wrapper **proxy** `0x09B0E3A114135F528F762DB8363b4f5eae3F3bF1`
SdPendleCompounder **proxy** `0x606462126E4Bd5c4D153Fe09967e4C46C9c7FeCf`
StakeDAOLockerProxy `0x1c0D72a330F2768dAF718DEf8A19BAb019EEAd09`
ProxyAdmin `0x12b1326459d72F2Ab081116bf27ca46cD97762A0`
ConverterRegistry `0x997B6F43c1c1e8630d03B8E3C11B60E98A1beA90`
GeneralTokenConverter `0x11C907b3aeDbD863e551c37f21DD3F36b28A6784`
旧 SdPendleGaugeStrategy `0x94992Da38bE9aDADD359c2959588FdDFa2dFE5Cd`（其 stash `0xC20eA03Db6aE7b465B5BEa4Ecb8453aB0AF37197`，待救 sPENDLE 在此）
**旧 VeSDTDelegation ****`0x6037Bb1BBa598bf88D816cAD90A28cC00fE3ff64`****（保留、不动，仅供历史 claim）**
SdPendleGauge `0x50DC9aE51f78C593d4138263da7088A973b8184E`
Harvester `0xfa86aa141e45da5183B42792d99Dede3D26Ec515`
vlSDT token `0x94818A7baa7e9F5dC62ce4da1B52ef9a760b80B8`
vlBoost `0xaB05ca46d1c78CAbB051efFE35099714Cad2AddA`
veCTR `0xe4c09928d834cd58d233cd77b5af3545484b4968`
CTR `0xb3Ad645dB386D7F6D753B2b9C3F4B853DA6890B8`
SmartWalletWhitelist `0x3557bD058D674DD0981a3FF10515432159F63318`。
**角色多签**：主多签 `0xA0FB1b11ccA5871fb0225B64308e249B97804E99`（ProxyAdmin / locker / 旧strategy owner + 各合约 DEFAULT_ADMIN + SmartWalletWhitelist owner）；Aladdin 管理多签 `0xc40549aa1D05C30af23a1C4a5af6bA11FCAFe23F`（ConverterRegistry owner）；keeper `0x24f043419850db81d2d7cda72fe9044eacbc5b3d`。
---
## 3. Fork 验证过程（端到端通过 ✅，含可核对交易）
### 3.1 验收环境
- **主迁移验收 fork**：Tenderly testnet `1dc9555f-d348-4876-a415-cc4b871caab4`（RPC short code `67b94a-12dbba`），mainnet fork、用上述真实主网部署地址；多签由对应 Safe 实际发起执行。[Tenderly Dashboard](https://dashboard.tenderly.co/explorer/vnet/63a194a8-00f7-4728-92d5-7f632748b960/transactions?perPage=20&page=1)
- **vlSDT 委托/领取验证 fork**：testnet `1cad3a19-…-cc4b871caab4`（RPC `0fb319-8825fd`，另一 mainnet fork clone）。
### 3.2 主迁移执行交易（fork `1dc9555f`，可逐笔核对）
<table header-row="true">
<tr>
<td>步骤</td>
<td>交易哈希</td>
<td>验证点（执行后链上读到）</td>
</tr>
<tr>
<td>**E1** 设临时 route</td>
<td>`0x8afd42c1dec13528a5134b6fe3369cc66542a5e1163805200e067ddd976ce260`</td>
<td>`getRoutes(sPENDLE,WETH)` = `[897946605976065710371576166102758732145457482764303]`（透传）✅</td>
</tr>
<tr>
<td>**MAIN**（20 笔原子）</td>
<td>`0xe0dcedcc1718a2de247bc17190989d0a5a679082b2680c18718323c64200bffd`</td>
<td>见 §3.3 全部 ✅；**3 笔同块 harvest（#3/#9/#19）均未 revert**</td>
</tr>
<tr>
<td>**E2** 清 route</td>
<td>`0x7376f4fe9e5728090bf98511fe0e672fe92292c09e4afe13f9106815282512a9`</td>
<td>`getRoutes(sPENDLE,WETH)` = `[]` ✅</td>
</tr>
<tr>
<td>**FINALIZE**（+14 天）</td>
<td>`0x13567da7e767e748eda0960960c02b2fbdc0944f14accf957733b3bf438a5e6a`</td>
<td>见 §3.3 ✅</td>
</tr>
</table>
### 3.3 MAIN + FINALIZE 后逐项链上核对
<table header-row="true">
<tr>
<td>验证项</td>
<td>读到的值</td>
<td>结论</td>
</tr>
<tr>
<td>veCTR lock</td>
<td>`veCTR.locked(主多签)` = 3000 CTR，end=1908748800；`veCTR.balanceOf` ≈ 2994.98</td>
<td>锁仓成功、过 harvester 门槛 ✅</td>
</tr>
<tr>
<td>sdCRV delegation</td>
<td>`wrapper.delegation()` = 新 vlSDT `0x322c…CDA43`</td>
<td>booster 改道 ✅</td>
</tr>
<tr>
<td>sdCRV converter</td>
<td>`wrapper.converter()` = 新 burner `0xC56e…5E27`</td>
<td>✅</td>
</tr>
<tr>
<td>sdCRV burner 角色</td>
<td>`hasRole(WHITELIST_BURNER, keeper)` = true</td>
<td>✅</td>
</tr>
<tr>
<td>sPENDLE 抢救</td>
<td>MAIN 后 `userCooldown(新strategy)` = **19,661.30**；旧 stash `0xC20e` / 新 stash `0x32c9` sPENDLE 均 = 0</td>
<td>全额救出并进 cooldown ✅</td>
</tr>
<tr>
<td>converter 复原</td>
<td>`compounder.converter()` = GeneralConverter `0x11C9…6784`</td>
<td>✅</td>
</tr>
<tr>
<td>compounder strategy</td>
<td>`compounder.strategy()` = 新 strategy `0x6402…347a`</td>
<td>✅</td>
</tr>
<tr>
<td>compounder bribeBurner</td>
<td>`compounder.bribeBurner()` = 新 burner `0x15248…63cb`</td>
<td>✅</td>
</tr>
<tr>
<td>locker operator</td>
<td>`locker.operators(SdPendleGauge)` = `0x6402…347a`</td>
<td>✅</td>
</tr>
<tr>
<td>gauge reward receiver</td>
<td>`gauge.rewards_receiver(locker)` = 新 stash `0x32c9…78A1`</td>
<td>✅</td>
</tr>
<tr>
<td>sdPendle burner 角色</td>
<td>`hasRole(WHITELIST_BURNER, keeper)` = true</td>
<td>✅</td>
</tr>
<tr>
<td>**FINALIZE 后**</td>
<td>`userCooldown(新strategy)` 从 19,661 → **454.5**（原批 finalize、这 14 天新派 sPENDLE 续上新 cooldown）；新 strategy sPENDLE/PENDLE/sdPENDLE 均 0；`compounder.totalAssets()` ≈ **520,438**（救回的 sPENDLE 已换 sdPENDLE 复利进 asdPENDLE）</td>
<td>finalize+复利成功、稳态自动续期循环正常 ✅</td>
</tr>
</table>
### 3.4 vlSDT 委托 → locker 拿 booster → 用户领 SDT（fork `1cad3a19`，持久化交易可核对）
用真实迁移用户 `0x3f43a33be58a84bfca084d25328af4ae41678620`（veSDT→vlSDT，8,100.7 vlSDT）跑通：
<table header-row="true">
<tr>
<td>步骤</td>
<td>交易哈希</td>
<td>结果</td>
</tr>
<tr>
<td>1. `vlBoost.setOperator(VlSDTDelegation, true)`</td>
<td>`0x2fc0bec1d49129ca0995787d5391d8935106a7bca071bc9a82dc54675d52c6a2`</td>
<td>授权 ✅</td>
</tr>
<tr>
<td>2. `VlSDTDelegation.boost(全部, endtime, self)`</td>
<td>`0x481d810670646faf0f82c6fbf7e03cdd22f71543d7487c3379d58572c516174f`</td>
<td>`vlBoost.receivedTotal(locker)`=8,100.7（locker 拿到 booster）、`VlSDTDelegation.balanceOf(用户)`=8,100.7（用户 share）✅</td>
</tr>
<tr>
<td>3-4. `checkpointReward`（基线 / 注入 1000 SDT 后分配）</td>
<td>`0x94c197d4…6ec049ca` / `0x0560f8fa…d1671724`</td>
<td>奖励记账 ✅</td>
</tr>
<tr>
<td>5. `VlSDTDelegation.claim(用户, 用户)`</td>
<td>`0x3ae963db0fffb1c9f0968c79e847b5fa91a934ecb4b34aa4342ea5bcce25f3cb`</td>
<td>用户 SDT 余额 400.85 → 1285.15，**实领 884.30 SDT** ✅</td>
</tr>
</table>
> 注：步 4 的 1000 SDT 为模拟注入的 booster fee（`tenderly_setErc20Balance`）。旧 `VeSDTDelegation 0x6037` 全程未动；该用户在旧合约的历史 SDT 仍可 `claim`（实测 `checkpoint`+`claim` 可领 \~303 SDT，见前端改造点 §6.3）。
---
## 4. 上线多签步骤
**多签只需 3 组：E1 →（必须先于 MAIN 的抢救段）→ MAIN → E2。** FINALIZE 不走多签（见 §4.4）。
### 4.1 E1 — 设临时 route（管理多签 `0xc40549`，1 笔）
导入 `safe_mainnet_E1_setroute_abi.json`。<br>\| 合约 \| 函数 \| 参数 \|<br>\|—\|—\|—\|<br>\| ConverterRegistry `0x997B6F…bEA90` \| `updateRoute` \| sPENDLE, WETH, `[897946605976065710371576166102758732145457482764303]`（透传） \|
### 4.2 MAIN — 主批次（主多签 `0xA0FB`，20 笔，一个原子批次）
导入 `safe_mainnet_main_abi.json`。
<table header-row="true">
<tr>
<td>#</td>
<td>合约</td>
<td>函数</td>
<td>参数</td>
<td>说明（为什么）</td>
</tr>
<tr>
<td>0</td>
<td>SmartWalletWhitelist `0x3557bD05…63318`</td>
<td>`approveWallet`</td>
<td>wallet=主多签</td>
<td>veCTR 禁止合约锁仓，先把主多签加白名单，否则 create_lock 报 “Smart contract depositors not allowed”</td>
</tr>
<tr>
<td>1</td>
<td>CTR `0xb3Ad…90B8`</td>
<td>`approve`</td>
<td>spender=veCTR, amount=`3000e18`</td>
<td>授权 veCTR 划走 3000 CTR</td>
</tr>
<tr>
<td>2</td>
<td>veCTR `0xe4c0…4968`</td>
<td>`create_lock`</td>
<td>value=`3000e18`, unlock=`1908878693`(≈4年)</td>
<td>锁 CTR 成 veCTR，获得调用 harvester 的资格</td>
</tr>
<tr>
<td>3</td>
<td>Harvester `0xfa86aa…Ec515`</td>
<td>`harvestConcentratorCompounder`</td>
<td>compounder `0x6064…FeCf`, minAssets=`0`</td>
<td>**正常 harvest（R9 前置）**：清掉常规 reward，使旧 stash 只剩 sPENDLE</td>
</tr>
<tr>
<td>4</td>
<td>SdCRVBribeBurnerV2 `0xC56e…5E27`</td>
<td>`grantRole`</td>
<td>WHITELIST_BURNER_ROLE, keeper</td>
<td>授 keeper burn 权限</td>
</tr>
<tr>
<td>5</td>
<td>sdCRV wrapper `0x09B0…3bF1`</td>
<td>`updateConverter`</td>
<td>新 burner `0xC56e…5E27`</td>
<td>bribe 处理改道新 burner</td>
</tr>
<tr>
<td>6</td>
<td>ProxyAdmin `0x12b1…62A0`</td>
<td>`upgrade`</td>
<td>wrapper, 新 impl `0xc251…0f08`</td>
<td>升级 wrapper，delegation→新 vlSDT（源码不变、仅 immutable，不动余额）</td>
</tr>
<tr>
<td>7</td>
<td>旧 SdPendleStrategy `0x9499…E5Cd`</td>
<td>`syncRewardToken`</td>
<td>—</td>
<td>把 sPENDLE 纳入 rewards</td>
</tr>
<tr>
<td>8</td>
<td>SdPendleCompounder `0x6064…FeCf`</td>
<td>`updateConverter`</td>
<td>EmergencyConverter `0x9677…61Cb`</td>
<td>临时换透传 converter</td>
</tr>
<tr>
<td>9</td>
<td>Harvester `0xfa86aa…Ec515`</td>
<td>`harvestConcentratorCompounder`</td>
<td>`0x6064…FeCf`, `0`</td>
<td>**Emergency harvest**：把 sPENDLE 提到旧策略</td>
</tr>
<tr>
<td>10</td>
<td>旧 SdPendleStrategy `0x9499…E5Cd`</td>
<td>`updateStash`</td>
<td>新 stash `0x32c9…78A1`</td>
<td>改 stash 指针（修复 R6 的关键，否则 sweep 进不了新策略）</td>
</tr>
<tr>
<td>11</td>
<td>旧 SdPendleStrategy `0x9499…E5Cd`</td>
<td>`sweepToken`</td>
<td>`[sPENDLE]`</td>
<td>把 sPENDLE 扫进新 stash</td>
</tr>
<tr>
<td>12</td>
<td>SdPendleCompounder `0x6064…FeCf`</td>
<td>`updateConverter`</td>
<td>回 GeneralConverter `0x11C9…6784`</td>
<td>恢复正常 converter</td>
</tr>
<tr>
<td>13</td>
<td>StakeDAOLocker `0x1c0D…ad09`</td>
<td>`updateOperator`</td>
<td>SdPendleGauge, 新 strategy `0x6402…347a`</td>
<td>操作权给新策略</td>
</tr>
<tr>
<td>14</td>
<td>StakeDAOLocker `0x1c0D…ad09`</td>
<td>`updateGaugeRewardReceiver`</td>
<td>SdPendleGauge, 新 stash `0x32c9…78A1`</td>
<td>奖励接收改新 stash</td>
</tr>
<tr>
<td>15</td>
<td>ProxyAdmin `0x12b1…62A0`</td>
<td>`upgrade`</td>
<td>compounder, 新 impl `0x8D98…9D34`</td>
<td>升级 compounder</td>
</tr>
<tr>
<td>16</td>
<td>SdPendleCompounder `0x6064…FeCf`</td>
<td>`migrateStrategyV2`</td>
<td>新 strategy `0x6402…347a`</td>
<td>strategy 指针切新策略</td>
</tr>
<tr>
<td>17</td>
<td>SdPendleBribeBurner `0x15248…63cb`</td>
<td>`grantRole`</td>
<td>WHITELIST_BURNER_ROLE, keeper</td>
<td>授 keeper burn 权限</td>
</tr>
<tr>
<td>18</td>
<td>SdPendleCompounder `0x6064…FeCf`</td>
<td>`updateBribeBurner`</td>
<td>新 burner `0x15248…63cb`</td>
<td>bribe burner 改道</td>
</tr>
<tr>
<td>19</td>
<td>Harvester `0xfa86aa…Ec515`</td>
<td>`harvestConcentratorCompounder`</td>
<td>`0x6064…FeCf`, `0`</td>
<td>**新 harvest**：把救回的 sPENDLE 发起 14 天 cooldown</td>
</tr>
</table>
### 4.3 E2 — 清临时 route（管理多签 `0xc40549`，1 笔，MAIN 之后）
导入 `safe_mainnet_E2_clearroute_abi.json`。<br>\| 合约 \| 函数 \| 参数 \|<br>\|—\|—\|—\|<br>\| ConverterRegistry `0x997B6F…bEA90` \| `updateRoute` \| sPENDLE, WETH, `[]`（清空临时透传） \|
### 4.4 FINALIZE — 非多签（社区/keeper，+14 天后）
**不需发多签。** cooldown 到期后，任意一次常规 harvest（任何 veCTR 持有者/keeper 调 `Harvester.harvestConcentratorCompounder(0x6064…, minAssets)`）会自动 finalize 救回的 PENDLE→sdPENDLE→复利。`safe_mainnet_finalize_abi.json` 仅作参考。
---
## 5. 关键注意事项
1. **执行顺序铁律**：E1 必须先执行（MAIN 的 Emergency harvest 依赖它的透传 route）；MAIN 内部 20 笔顺序不可乱（正常 harvest 必须在 syncRewardToken / 换 EmergencyConverter 之前）。
2. **veCTR 白名单**：MAIN-0 的 `approveWallet` 必须在 create_lock 之前（已排好）。checker owner=主多签，可自批。
3. **3 笔同块 harvest**：fork 实测未 revert；主网执行时建议仍在 fork 上预演确认。
4. **MEV / 三明治**：会发生真实 swap 的是 MAIN-3（金额小，可忽略）和 FINALIZE（\~19,661 PENDLE→sdPENDLE，`minAssets`/内部 min_dy 默认 0）。FINALIZE 由社区/keeper 执行，建议执行者设合理 `minAssets` 或走私有 RPC（Flashbots/MEVBlocker）防夹。
5. **本次修复的两点**（fork 已验证）：
	- **R9**：抢救 harvest 前必须先跑一次正常 harvest（清常规 reward），否则 EmergencyConverter 会因其它 reward 走真实路由 `"unsupported poolType"` revert。
	- **R6**：`sweepToken` 把币送到”策略当前 stash”而非多签，故必须先 `updateStash(新 stash)` 再 sweep。
6. **旧 VeSDTDelegation ****`0x6037`**** 保留不动**：里面约 16 万历史 SDT 仍可由用户 `claim`；前端建议先 `checkpoint(user)` 再 `claim`（迁过 vlSDT 的用户近周快照未 checkpoint 会显示 0，但合约可领）。
7. **wrapper impl 已部署**（`0xc251…0f08`），MAIN-6 直接 upgrade 到它；无需再单独部署。
---
## 6. 前端改造点（与前端沟通用）
> 核心变化：booster 的 delegation 从旧 `VeSDTDelegation 0x6037` 换成新 **`VlSDTDelegation 0x322c76e1205dE5ee4146e40644563B482B1CDA43`**；底层投票券从 veSDT 变成 **vlSDT**（token `0x94818A7baa7e9F5dC62ce4da1B52ef9a760b80B8`，由 SDT 锁进 vlBoost `0xaB05ca46d1c78CAbB051efFE35099714Cad2AddA` 获得）。
**6.1 委托/领取改指向新 vlSDT delegation**<br>所有”委托 boost / 查看 & 领取 SDT 收益”的读写，**新地址用 ****`VlSDTDelegation 0x322c…`**，不要再用旧 `0x6037`（旧的只保留做历史 claim，见 6.3）。
**6.2 委托前需要一次性 setOperator 授权**<br>委托流程改为两步（旧版可能只有一步）：<br>1. `vlBoost(0xaB05…).setOperator(VlSDTDelegation 0x322c…, true)` —— 一次性授权（用户对该 delegation 只需做一次）；<br>2. `VlSDTDelegation(0x322c…).boost(amount, endtime, recipient)` —— `amount` 可传 `uint256.max` 表示全部可委托量；`endtime` 会按周向下取整。<br>未先 setOperator 会因 `NOT_OPERATOR` 失败。前端应检测 `vlBoost` 上的 operator 授权状态、缺失时引导用户先授权。
**6.3 旧 ****`VeSDTDelegation 0x6037`**** 历史奖励：必须先 checkpoint 再显示/领取（重要）**<br>已把 veSDT 迁成 vlSDT 的用户，在旧合约里的近周 `historyBoosts` 没有被 checkpoint，前端若直接读会**显示 0、让用户以为奖励丢了**（已有用户 `0x3f43…` 反馈）。实际钱还在、可领。前端处理：<br>- 计算可领量：对旧合约 `0x6037` 用 **staticcall ****`claim(user, user)`**（它内部会先 checkpoint 再结算，返回值即可领 SDT）；或先 `checkpoint(user)` 再读。<br>- 领取：先发 `checkpoint(user)`（或确保 claim 内部已 checkpoint），再 `claim(user, user)`。实测某用户这样可领出 \~303 SDT。<br>- 建议保留一个”领取旧版（veSDT）奖励”入口指向 `0x6037`，与新 vlSDT 委托分开展示。
**6.4 读取”可领多少 SDT”的推荐做法**<br>新/旧 delegation 都一样：前端用 `eth_call`（staticcall）`claim(user, user)` 读返回值即当前可领量；更稳可 multicall `[checkpointReward(), claim(user,user)]`（都 staticcall）覆盖”刚注入 \<1 天”的奖励。注意：**当前周的奖励要过周才计入**，展示时说明。
**6.5 asdPENDLE 展示调整**<br>- vePendle 已废弃，**asdPENDLE 不再有 vePendle bribe 收益**；前端若展示过 bribe APY/来源，需移除或改口径。<br>- 现在底层收益来自 sPENDLE，**赎回有 14 天 cooldown**：harvest 把 sPENDLE 质押→14 天后 finalize 才变 PENDLE→sdPENDLE 复利。所以收益到账有延迟，APY/待复利展示要考虑这个节奏（底层资产仍是 sdPENDLE，asdPENDLE 用户无需操作）。
**6.6 不影响前端的部分**<br>booster fee 的内部改道（burner→新 delegation）、sPENDLE 抢救、策略/compounder 升级等都是后端/合约侧，除上面几点外前端无需改动。
---
## 7. 附件
- Safe 多签交易（导入 Safe Transaction Builder）：（参考）。
	<file src="file://%7B%22source%22%3A%22attachment%3Ae6a1280d-c0a1-45d9-afbb-fa2942eff621%3Asafe_mainnet_E1_setroute_abi.json%22%2C%22permissionRecord%22%3A%7B%22table%22%3A%22block%22%2C%22id%22%3A%2238f3d787-3f2c-80a8-95fd-fe0225bc7f6e%22%2C%22spaceId%22%3A%222973d787-3f2c-81a7-88a2-0003f3f7bdbd%22%7D%7D"></file>
	<file src="file://%7B%22source%22%3A%22attachment%3Af5241dde-8b5e-4adf-a9a4-d28753e9a995%3Asafe_mainnet_main_abi.json%22%2C%22permissionRecord%22%3A%7B%22table%22%3A%22block%22%2C%22id%22%3A%2238f3d787-3f2c-8019-8a27-c277bfa6319a%22%2C%22spaceId%22%3A%222973d787-3f2c-81a7-88a2-0003f3f7bdbd%22%7D%7D"></file>
	<file src="file://%7B%22source%22%3A%22attachment%3A5307b0ef-35c7-4217-853e-f282504a4796%3Asafe_mainnet_E2_clearroute_abi.json%22%2C%22permissionRecord%22%3A%7B%22table%22%3A%22block%22%2C%22id%22%3A%2238f3d787-3f2c-803f-9774-eca3eed5ec7e%22%2C%22spaceId%22%3A%222973d787-3f2c-81a7-88a2-0003f3f7bdbd%22%7D%7D"></file>
- 逐笔交易表（导入 Google Sheet）：[https://docs.google.com/spreadsheets/d/1Ct-n6wq6i3-8E4PmgCLMoXaSu7eu0gd5X3n9F2w6ieQ/edit?gid=2121631744#gid=2121631744](https://docs.google.com/spreadsheets/d/1Ct-n6wq6i3-8E4PmgCLMoXaSu7eu0gd5X3n9F2w6ieQ/edit?gid=2121631744#gid=2121631744)
- 完整背景 / 风险 / 验证细节：[https://app.notion.com/p/StakeDAO-Migration-Runbook-38e3d7873f2c80779a7bf34215617cab](https://app.notion.com/p/StakeDAO-Migration-Runbook-38e3d7873f2c80779a7bf34215617cab) 
- 。
<empty-block/>

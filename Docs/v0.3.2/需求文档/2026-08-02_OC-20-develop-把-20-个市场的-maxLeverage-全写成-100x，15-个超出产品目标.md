# OC-20 develop 把 20 个市场的 maxLeverage 全写成 100x，15 个超出产品目标、10 个开仓即可被清算、LIT 超过合约硬上限

> Notion 页面：[原文](https://app.notion.com/p/3b03d7873f2c8185b7a0eace67b1c883)
> 作者：Gordon (chao@aladdin.club)
> 创建时间：2026-08-02
> 最后编辑：2026-08-02
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 🐛 Bugs（数据库）
> 类型：缺陷/需求（Bugs 库）
> 状态：Closed / High

## 属性

| 属性 | 值 |
|---|---|
| Name | OC-20 develop 把 20 个市场的 maxLeverage 全写成 100x，15 个超出产品目标、10 个开仓即可被清算、LIT 超过合约硬上限 |
| Status | Closed |
| Priority | High |
| Product | FX100 |
| Reporter | Gordon |
| Assignee | Fefe, starit.public |
| Link | https://github.com/AladdinDAO/fx100-apps/commit/9ce4908fa831edd0e60c278651eb24bb6d8574e7 |
| 创建时间 | 2026-08-02T15:45:07.609Z |
| Text | 见下文「描述（Text 属性）」 |
| 复测 | 见下文「复测（复测属性）」 |

## 描述（Text 属性）

【位置】apps/fx-base-app/src/constants/markets.ts —— MARKET_PAIRS 里 maxLeverage 除 MSOL 外全部是 100。

【背景】这是 OC-17（杠杆滑杆未按市场封顶）的延续。OC-17 修的是"滑杆读不读 per-market 值"，本单是"per-market 值本身被写错了"。两个都修完才有效果：即使滑杆正确读取 maxLeverage，值是 100 也照样能拖到 100x。

【口径】maxLeverage 是 per-market 的**产品目标杠杆**，不是统一值，也不是合约硬上限。链上关系是：
  minCollateralFactor(开仓) = minCollateralFactorForLiquidation = 1 / (2 × 目标杠杆)
所以合约硬上限 = 目标杠杆 × 2。那个 2 倍是刻意留的余量，让目标杠杆能顺滑开到底而不是正好贴在清算线上。取值依据见部署文档 §A 表（fx100-contracts/docs/superpowers/specs/2026-07-31-top20-markets-fork-deployment.md）。

【实测对照】链上 minCF 是真链读回的（verifyTop20Markets.ts），硬上限 = 1/minCF：

```text
market  资产  链上minCF   合约硬上限   产品目标   develop现值   问题
 4  HYPE   1.0000%    100.0x      50x     100x   🔴 =硬上限，开仓即可被清算
 6  WLD    1.0000%    100.0x      50x     100x   🔴 同上
 7  ZEC    0.5900%    169.5x      85x     100x   🔴 超出目标
 8  VVV    1.0000%    100.0x      50x     100x   🔴 =硬上限，开仓即可被清算
10  SUI    1.0000%    100.0x      50x     100x   🔴 同上
11  AERO   1.0000%    100.0x      50x     100x   🔴 同上
12  NEAR   1.0000%    100.0x      50x     100x   🔴 同上
13  XLM    1.0000%    100.0x      50x     100x   🔴 同上
14  ENA    1.0000%    100.0x      50x     100x   🔴 同上
15  TIA    1.0000%    100.0x      50x     100x   🔴 同上
16  ONDO   1.0000%    100.0x      50x     100x   🔴 同上
18  ARB    0.7100%    140.8x      70x     100x   🔴 超出目标
19  LIT    1.1100%     90.1x      45x     100x   🔴🔴 超过合约硬上限
20  TON    0.7100%    140.8x      70x     100x   🔴 超出目标
```
正确的 5 个：BTC/ETH/SOL/LINK/XRP = 100x（它们的目标本来就是 100x），MSOL = 50x。

【两种严重程度】
① LIT 最严重：合约硬上限只有 90.1x，填 100x 意味着用户把滑杆拖满，订单必然被拒/revert，是死路。
② minCF=1.0% 的 10 个市场（HYPE/WLD/VVV/SUI/AERO/NEAR/XLM/ENA/TIA/ONDO）：100x 恰好等于合约硬上限，用户在抵押率正好等于清算阈值处开仓，**开完立刻可被清算**。这正是当初把开仓 minCF 对齐清算因子想消除的"危险区"，现在从前端又造回来了。
③ ZEC/ARB/TON：超出产品目标但仍在硬上限内，风险相对低，但不符合风控设定的杠杆分层。

【修复】把 MARKET_PAIRS 的 maxLeverage 按上表"产品目标"逐个改回，不要用统一值。我已在测试分支 feat/liquidation-protection-ux-v031 本地改好并加了注释说明取值来源，可直接参考。

【预防建议】这个值和链上 minCF 是强耦合的（硬上限 = 1/minCF），硬编码两处必然漂移。更稳的做法是从链上 minCollateralFactor 推导出硬上限、产品目标单独配一份，或者至少加个启动时的一致性断言（maxLeverage × 2 应约等于 1/minCF），错配时报错而不是静默放行。

## 复测（复测属性）

【已验证关闭 2026-08-03】develop 749e5eef "feat: fix max leverage value" 已修，14 处 maxLeverage 的值与本单建议表逐个一致，因此与测试分支的 9ce4908f 自动合并无冲突。合并后已逐项核对 20 个市场的 maxLeverage 全部符合部署表（BTC/ETH/SOL/LINK/XRP=100x、ZEC=85x、ARB/TON=70x、LIT=45x、其余=50x、MSOL=50x）。已于 2026-08-03 合并进测试分支验证。

【参考实现】fx100-apps @ feat/liquidation-protection-ux-v031，commit 9ce4908f（单文件 apps/fx-base-app/src/constants/markets.ts），直接 git show 9ce4908f 看 diff 照抄。

① 每个市场的杠杆滑杆上限 = 上表产品目标值（HYPE/WLD/VVV/SUI/AERO/NEAR/XLM/ENA/TIA/ONDO=50x，ZEC=85x，ARB/TON=70x，LIT=45x，BTC/ETH/SOL/LINK/XRP=100x，MSOL=50x）；② LIT 市场滑杆拖满是 45x 而不是 100x，且能成功开仓；③ 任选一个 minCF=1.0% 的市场按最大杠杆开仓，开完后持仓不应立刻处于可清算状态；④ 合并 develop 后回归此项——develop 上是统一 100x，会被覆盖回去。

## 正文

### 📌 参考实现（已推送到远端，可直接对照）

测试分支上已按正确值改好，是一个独立提交、只动了一个文件，可以直接看 diff 照抄：

```text
仓库    AladdinDAO/fx100-apps
分支    feat/liquidation-protection-ux-v031
commit  9ce4908fa831edd0e60c278651eb24bb6d8574e7   (短号 9ce4908f)
文件    apps/fx-base-app/src/constants/markets.ts   ← 唯一改动文件
内容    14 处 maxLeverage 值 + MARKET_PAIRS 上方一段取值依据注释

查看：
  git fetch origin feat/liquidation-protection-ux-v031
  git show 9ce4908f -- apps/fx-base-app/src/constants/markets.ts
```

⚠️ 这个提交的父提交 b5903d52 就是 develop 的合并点，所以 diff 里的「-100 / +50」是相对最新 develop 的净改动，不掺杂其它历史。

### ✅ 逐市场目标值（照这张表改即可）

```text
market  资产    产品目标(改成这个)   develop现值   链上minCF   合约硬上限
  1     BTC          100x            100x      0.4000%    250.0x   ✅ 本来就对
  2     ETH          100x            100x      0.5000%    200.0x   ✅ 本来就对
  3     MSOL          50x             50x      0.5000%    200.0x   ✅（仅测试分支有此市场）
  4     HYPE          50x            100x      1.0000%    100.0x   🔴
  5     SOL          100x            100x      0.5000%    200.0x   ✅ 本来就对
  6     WLD           50x            100x      1.0000%    100.0x   🔴
  7     ZEC           85x            100x      0.5900%    169.5x   🔴
  8     VVV           50x            100x      1.0000%    100.0x   🔴
  9     LINK         100x            100x      0.5000%    200.0x   ✅ 本来就对
 10     SUI           50x            100x      1.0000%    100.0x   🔴
 11     AERO          50x            100x      1.0000%    100.0x   🔴
 12     NEAR          50x            100x      1.0000%    100.0x   🔴
 13     XLM           50x            100x      1.0000%    100.0x   🔴
 14     ENA           50x            100x      1.0000%    100.0x   🔴
 15     TIA           50x            100x      1.0000%    100.0x   🔴
 16     ONDO          50x            100x      1.0000%    100.0x   🔴
 17     XRP          100x            100x      0.5000%    200.0x   ✅ 本来就对
 18     ARB           70x            100x      0.7100%    140.8x   🔴
 19     LIT           45x            100x      1.1100%     90.1x   🔴🔴 现值超过硬上限
 20     TON           70x            100x      0.7100%    140.8x   🔴
```

需要改的是 14 个：HYPE WLD ZEC VVV SUI AERO NEAR XLM ENA TIA ONDO ARB LIT TON。BTC/ETH/SOL/LINK/XRP 的 100x 本来就是对的，不要动。MSOL 只存在于测试分支，develop 不需要加。

### ⚠️ 三个容易理解错的点

- 「产品目标」不等于「合约硬上限」。链上 minCollateralFactor(开仓) = minCollateralFactorForLiquidation = 1/(2×产品目标)，所以硬上限恰好是产品目标的 2 倍。那个 2 倍是刻意留的余量，让目标杠杆能顺滑开到底，而不是正好贴在清算线上。前端要填的是产品目标，不是硬上限。
- 不能用统一值。统一填 100 两头都不对：ZEC 的硬上限是 169.5x（填 100 偏低），LIT 只有 90.1x（填 100 直接超限，用户拖满必然失败）。必须逐市场配。
- 本单与 OC-17 是同一个问题的两半，两个都修完才看得到效果。OC-17 修「滑杆有没有读 per-market 的 maxLeverage」，本单修「maxLeverage 这个值本身」。滑杆即使已经正确读取，值是 100 也照样能拖到 100x —— 只修 OC-17 会以为没生效。

### 🔎 数据来源（可自行复现）

表里的「链上minCF」是从真 Base Sepolia（chain 84532）读回来的实测值，不是从文档抄的：

```text
cd apps/fx-base-app
RPC_URL=<base-sepolia-rpc> npx tsx scripts/tenderly/verifyTop20Markets.ts
# 每个 market 会输出 open=x.xxxx% liq=x.xxxx%，合约硬上限 = 1/open
```

产品目标杠杆的推导规则见部署文档 §二（fx100-contracts/docs/superpowers/specs/2026-07-31-top20-markets-fork-deployment.md）。

# OC-21 batch2 新市场 maxLeverage 4/6 与链上配置不符（ADA 75x 超出目标 50x，风险偏差）

> Notion 页面：[原文](https://app.notion.com/p/3b23d7873f2c81e7a67fd47bee6cdf98)
> 作者：Gordon (chao@aladdin.club)
> 创建时间：2026-08-04
> 最后编辑：2026-08-04
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 🐛 Bugs（数据库）
> 类型：缺陷/需求（Bugs 库）
> 状态：Closed / High

## 属性

| 属性 | 值 |
|---|---|
| Name | OC-21 batch2 新市场 maxLeverage 4/6 与链上配置不符（ADA 75x 超出目标 50x，风险偏差） |
| Status | Closed |
| Priority | High |
| Product | FX100 |
| Reporter | Gordon |
| Assignee | Fefe, starit.public |
| Link | https://github.com/AladdinDAO/fx100-apps/commit/a98af89d |
| 创建时间 | 2026-08-04T05:37:56.668Z |
| Text | 见下文「描述（Text 属性）」 |
| 复测 | 见下文「复测（复测属性）」 |

## 描述（Text 属性）

【位置】apps/fx-base-app/src/constants/markets.ts，develop c693ffbf "feat: add more markets" 引入的 market 21-26。

【判定依据：链上是权威，不是配置文件】
真 Base Sepolia（chain 84532）读回 market 21-26 的 minCollateralFactor，与 batch2 规格文档的目标杠杆严格满足 minCF(开仓) = minCF(清算) = 1/(2×目标)，6/6 成立：
```text
  AAVE 目标50x  → 应 1.0000%  链上 1.0000% ✅
  PUMP 目标50x  → 应 1.0000%  链上 1.0000% ✅
  BNB  目标100x → 应 0.5000%  链上 0.5000% ✅
  XMR  目标50x  → 应 1.0000%  链上 1.0000% ✅
  ADA  目标50x  → 应 1.0000%  链上 1.0000% ✅
  DOGE 目标100x → 应 0.5000%  链上 0.5000% ✅
```
说明链上就是按规格文档配的，文档目标值是权威。

【4 处不符】
```text
  资产   develop   应为    链上硬上限   性质
  PUMP    20x      50x      100x     偏低，用户开不到标称杠杆
  BNB     75x     100x      200x     偏低
  DOGE    50x     100x      200x     偏低
  ADA     75x      50x      100x     🔴 偏高 —— 这条是风险偏差
```
AAVE(50x) 与 XMR(50x) 本来就对，不要动。

【为什么 ADA 那条是风险问题不只是体验问题】
链上 minCF 设成 1%（= 1/(2×50)），刻意留了 2 倍余量：目标 50x 开仓时抵押率 2%，距清算线 1% 有 100% 缓冲。前端放到 75x 后，用户开仓抵押率只有 1.33%，距清算线仅 33% 缓冲 —— 一点不利波动就进清算区。这个 2 倍余量是 batch1 就定下的项目约定（见部署文档 §二），不该在前端被单方面收窄。

【参考实现（已推送）】
仓库 AladdinDAO/fx100-apps，分支 feat/liquidation-protection-ux-v031
merge commit a98af89d（4 处修正在这个 merge 的冲突解决里；本地 batch2 原始实现见 de4c3a1b）
文件 apps/fx-base-app/src/constants/markets.ts
查看：git fetch origin feat/liquidation-protection-ux-v031 && git show a98af89d -- apps/fx-base-app/src/constants/markets.ts

【复现命令】
cd apps/fx-base-app && RPC_URL=<base-sepolia-rpc> npx tsx scripts/tenderly/verifyTop20Markets.ts
（每个 market 输出 open=x.xxxx% liq=x.xxxx%，合约硬上限=1/open，产品目标=硬上限/2）

【同类问题第三次出现，建议根治】
OC-17 修的是「滑杆没读 per-market maxLeverage」、OC-20 修的是「batch1 的 20 个值被写成 100x」、本单是「batch2 的 6 个值有 4 个错」。建议加一个构建期或测试期断言：对每个市场校验 maxLeverage === 1/(2×链上 minCollateralFactor)，不一致直接失败。这样以后新增市场不可能再配错，也不用每批人工核对。

## 复测（复测属性）

【已验证关闭 2026-08-04】develop 0b3c6f49 "fix max leverage value" 已修正全部 4 处：PUMP 20→50x、BNB 75→100x、ADA 75→50x、DOGE 50→100x，与本单建议值逐个一致。合并后已核对 26 个市场的 maxLeverage 全部符合部署表，两条链均索引 1-26 齐全。测试分支 merge commit 5a2d83d8。
★ 根因也已根治：develop 75c6bae9 把杠杆推导写进 .claude/commands/add-market.md 的硬规则 —— maxLeverage = round((1e30 / minCollateralFactor) / 2)，从 DataStore 读，"do not guess this"，并加了一步「在 diff 里复核这个算式」，还注明 BTC 是历史例外（minCF 0.4% 隐含 250x 而配置 100x，不遵循折半规则）。这正是本单建议的自动化断言方向，后续新增市场不应再出现同类问题。

① 26 个市场逐个核对 maxLeverage：BTC/ETH/SOL/LINK/XRP/BNB/DOGE=100x、ZEC=85x、ARB/TON=70x、LIT=45x、其余(含AAVE/PUMP/XMR/ADA/MSOL)=50x；② ADA 滑杆拖到底应为 50x 不是 75x；③ PUMP/BNB/DOGE 滑杆能拖到 50/100/100x；④ 每个市场滑杆上限 × 2 应等于 1/(链上 open minCF)，可用 verifyTop20Markets.ts 交叉验证。

## 正文

<!-- Notion 页面为空白页，无正文内容 -->

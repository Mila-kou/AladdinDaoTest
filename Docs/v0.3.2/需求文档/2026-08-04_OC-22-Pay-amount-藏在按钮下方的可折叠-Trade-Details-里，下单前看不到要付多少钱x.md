# OC-22 Pay amount 藏在按钮下方的可折叠 Trade Details 里，下单前看不到要付多少钱x

> Notion 页面：[原文](https://app.notion.com/p/3b23d7873f2c8192bb10d4548e835142)
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
| Name | OC-22 Pay amount 藏在按钮下方的可折叠 Trade Details 里，下单前看不到要付多少钱x |
| Status | Closed |
| Priority | High |
| Product | FX100 |
| Reporter | Gordon |
| Assignee | Fefe |
| Link | https://github.com/AladdinDAO/fx100-apps/commit/00e0d964 |
| 创建时间 | 2026-08-04T06:19:40.442Z |
| Text | 见下文「描述（Text 属性）」 |
| 复测 | 见下文「复测（复测属性）」 |

## 描述（Text 属性）

【问题】Pay amount（本次开仓实际要付的抵押品）目前渲染在 _OrderDetailsPanel.tsx:430 的 Trade Details 面板里，而这个面板在 OrderForm 里排在提交按钮【下方】且是可折叠的。用户要点开折叠区才能看到自己要付多少钱，而这是下单前最后一个决策依据。

【建议放到提交按钮正上方，不是 Size 输入下面】
Size 输入和提交按钮之间还隔着杠杆滑杆、reduce-only 开关、TP/SL 折叠区。放在 Size 下面有两个问题：
1. 会被这些控件挤开，离按钮很远；
2. Pay = Size / 杠杆，杠杆滑杆一动它就变。值在上、影响它的控件在下，阅读顺序是反的。
放在按钮正上方则是「所有输入都定下来之后的最终值」，也是点下去前最后看到的东西。

【实现细节建议】
- 插在 FlashStatusChip 之后、SubmitButton 之前（OrderForm.tsx）
- 字号比详情行大一档（text-sm font-semibold），因为它现在是决策数字不是参考数字
- 加 tabular-nums，否则拖杠杆滑杆时数字宽度变化会左右跳
- reduce-only 时不显示 —— 那种场景钱是退回来的，仍由 Trade Details 的 withdraw 行负责
- 同时把 _OrderDetailsPanel.tsx 里那行去掉，避免同一个数字在一屏出现两次（withdraw 行保留）

【参考实现（已推送，可直接看 diff）】
仓库 AladdinDAO/fx100-apps，分支 feat/liquidation-protection-ux-v031，commit 00e0d964
文件 apps/fx-base-app/src/components/features/trade/OrderForm.tsx + _OrderDetailsPanel.tsx
查看：git fetch origin feat/liquidation-protection-ux-v031 && git show 00e0d964

## 复测（复测属性）

【已验证关闭 2026-08-04】develop cf4ac362 "fix: OC-22 Pay amount" 已修。Pay amount 已移到提交按钮正上方，并且比本单建议多做了一步：给标签加了 CircleHelp 图标 + tooltip，展开是 PayAmountBreakdown（构成明细），本单的参考实现没有这个。_OrderDetailsPanel 里的重复行已去掉、reduce-only 的 withdraw 行保留。测试分支 merge commit 3750faf6。⚠️ 合并时注意到一处：develop 的新行与测试分支参考实现落在相近但不同的位置，git 未报冲突而是两块都保留，会渲染出两行 Pay amount。已删除本地那版、保留 develop 带 tooltip 的版本。若其他分支也 cherry-pick 过参考实现请自查。

① 开仓表单不展开 Trade Details 就能在按钮上方看到 Pay amount；② 拖动杠杆滑杆时该数字实时更新且不左右跳动；③ Trade Details 里不再重复出现 Pay 行；④ reduce-only（平仓）时按钮上方不显示该行，Trade Details 里仍显示 withdraw 金额。

## 正文

<!-- Notion 页面为空白页，无正文内容 -->

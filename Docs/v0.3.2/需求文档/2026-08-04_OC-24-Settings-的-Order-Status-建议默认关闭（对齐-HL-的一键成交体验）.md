# OC-24 Settings 的 Order Status 建议默认关闭（对齐 HL 的一键成交体验）

> Notion 页面：[原文](https://app.notion.com/p/3b23d7873f2c81aea498de047caa3a6b)
> 作者：Gordon (chao@aladdin.club)
> 创建时间：2026-08-04
> 最后编辑：2026-08-05
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 🐛 Bugs（数据库）
> 类型：缺陷/需求（Bugs 库）
> 状态：Closed / High

## 属性

| 属性 | 值 |
|---|---|
| Name | OC-24 Settings 的 Order Status 建议默认关闭（对齐 HL 的一键成交体验） |
| Status | Closed |
| Priority | High |
| Product | FX100 |
| Reporter | Gordon |
| Assignee | Fefe |
| Link | https://github.com/AladdinDAO/fx100-apps/commit/00e0d964 |
| 创建时间 | 2026-08-04T06:21:09.887Z |
| Text | 见下文「描述（Text 属性）」 |
| 复测 | 见下文「复测（复测属性）」 |

## 描述（Text 属性）

【建议】Settings → Trading Preferences → Order Status（提交后弹出订单追踪弹窗）目前默认开启，建议改为默认关闭。

位置：src/state/base/settings.ts 的 showOrderTrackingAtom，默认值 true → false。

【理由】
1. 每笔交易都多一次关弹窗的点击。开了 Flash One-Click（session key 自动签名、无钱包弹窗）之后还要手动关一个弹窗，等于把「一键」的收益抵消掉了。
2. Hyperliquid 的做法是提交即返回，表单立刻可以下下一单，成交结果由 Open Orders / Positions 表格反馈。我们已经有这两个表格，信息不会丢。
3. 想要弹窗的用户在 Settings 里一键打开即可，成本很低；反过来默认开启则是所有人默认承担这个成本。

【实现注意】
showOrderTrackingAtom 用的是 atomWithSafeStorage（持久化到 localStorage），所以改默认值只对全新浏览器生效 —— 已经存了 true 的用户不会变。如果希望存量用户也切到新默认，需要另外做一次 storage key 版本迁移（例如换 key 名），否则这个改动对现有用户是无感的。测试时请用无痕窗口或清掉该 key 验证。

【参考实现（已推送）】
仓库 AladdinDAO/fx100-apps，分支 feat/liquidation-protection-ux-v031，commit 00e0d964
文件 apps/fx-base-app/src/state/base/settings.ts

## 复测（复测属性）

【已验证关闭 2026-08-06】develop 1dc9ecde "gated toggle for flash and order status" 已采纳本单建议：showOrderTrackingAtom 默认值在 develop 侧也改成 false。
★ 关键：本单的前置依赖（OC-25 A 类交易通知）在同一个 commit 里一起做了，所以不存在反馈真空。弹窗关闭后下单成功/失败均有 toast，详见 OC-25 的关闭说明。这两条当初就是按「必须同步上线」提的，实际也是同步落地的。
注意 atomWithSafeStorage 会持久化，改默认值只对全新浏览器生效 —— 存量用户仍看到弹窗，验收请用无痕窗口或清掉该 localStorage key。
测试分支 merge commit 929a2cef，457 个测试（54 文件）全过。

【已验证关闭 2026-08-04】develop 4e515194 "fix: OC-24 Settings" 已修，showOrderTrackingAtom 默认值 true → false。测试分支 merge commit 3750faf6。★ 提醒：该 atom 是 atomWithSafeStorage（持久化），改默认值只对全新浏览器生效，已存 true 的用户不受影响，测试请用无痕窗口。另外本单原本依赖 OC-25 的 A 类交易通知作为前置（关掉弹窗后需要 toast 兜住成功/失败反馈），OC-25 仍 Open —— 建议验收时确认关掉弹窗后失败场景仍有可见反馈，否则会出现反馈真空。

① 无痕窗口打开，Settings 里 Order Status 为关闭态；② 下单后不弹订单追踪弹窗，表单立刻可下下一单；③ 手动打开该开关后弹窗恢复；④ 成交/失败结果仍能在 Open Orders 与 Positions 表格里正确反映（不要因为关了弹窗就丢失失败提示）。

## 正文

<!-- Notion 页面为空白页，无正文内容 -->

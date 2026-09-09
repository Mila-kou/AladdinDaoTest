# Access Gate 弹窗 open 状态取反，白名单验证与本地测试均受影响

> Notion 页面：[原文](https://app.notion.com/p/3bc3d7873f2c81028a74d25d23c06adb)
> 作者：Gordon (chao@aladdin.club)
> 创建时间：2026-08-14
> 最后编辑：2026-08-19
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 🐛 Bugs（数据库）
> 类型：缺陷/需求（Bugs 库）
> 状态：Closed / High

## 属性

| 属性 | 值 |
|---|---|
| Status | Closed |
| Priority | High |
| Product | FX100 |
| Reporter | Gordon |
| Assignee | Fefe |
| 创建时间 | 2026-08-14T04:18:03.078Z |
| 复测 | 改回 open={open} 后验证：1) GATE_ENABLED=false 时本地不再弹窗；2) GATE_ENABLED 开启+未验证钱包时正常弹窗且可通过校验码关闭；3) 已验证/白名单钱包连接后不弹窗。 |
| Text | 见下文 |

## 描述（Text 属性）

apps/fx-base-app/src/lib/access-gate/AccessGateModal.tsx:15 的 <Dialog open={!open} ...> 在 commit a28126d1 (2026-08-07 21:55, 提交信息"fix: open order - relay fee"，与 access-gate 无关，应为误改带入) 被从 open={open} 改成 open={!open}。

影响：
1. 本地测试(NEXT_PUBLIC_GATE_ENABLED=false)：gate.open 恒为 false → !open 恒为 true → Access Required 弹窗必现且无法通过 Escape/点遮罩关闭(close() 只是把已经是 false 的 open 再设一次 false，视觉不变)，前端测试完全被卡住。
2. 线上/真实白名单场景：gate.open 变 true(真的需要验证码时)反而会让弹窗隐藏，即验证码门禁在生产环境可能已经失效，未验证钱包直接放行。

复现：yarn dev 后访问 http://localhost:3010/trade?market=ETHUSDC，即使 .env 里 NEXT_PUBLIC_GATE_ENABLED=false，弹窗依然出现。

已本地临时改回 open={open} 以解除本地测试阻塞（未提交/未 push），请工程师在源头修复。

## 正文

<!-- Notion 页面为空白页，无正文内容 -->

---
id: BUG-FE-TOOLTIP-008
title: Cancel Order 确认弹窗打开时 Relay fee 的 tooltip 未悬停自动弹出，遮挡订单确认信息
severity: S3
priority: P2
status: open
found: 2026-08-28
env: https://fx100-dev.vercel.app · Chrome 桌面 · Base Sepolia 84532
source-case: E2E-TRD-038（撤单）· 2026-08-28 smoke LOG-024
finder: 执行人（Mila）
notion: https://app.notion.com/p/3cc3d7873f2c81859f93e3bb2664429c（🐛 Bugs 库，2026-08-30 提交，Open/FX100/Medium）
---

# BUG-FE-TOOLTIP-008 · 撤单确认弹窗 tooltip 自动弹出遮挡

## 复现步骤

1. Open Orders 列表任一挂单（实测为 SOL SL @105.5）点击 Cancel。
2. Cancel Order 确认弹窗打开。

## 期望结果

Relay fee (est.) 行的 ⓘ tooltip（"Gas cost paid to the keeper relayer in USDC. Actual fee is capped at this estimate."）仅在鼠标悬停 ⓘ 图标时展示；弹窗内容完整可读。

## 实际结果

弹窗打开瞬间 tooltip **自动展示**（鼠标未悬停、无需任何交互），且浮层覆盖在弹窗中部，**遮挡 Type/Size 等订单确认字段**。该弹窗用于不可撤销操作（文案自述 "This action cannot be undone"），被遮挡的恰是确认前应核对的订单要素。

## 疑似成因（供开发参考）

弹窗打开时焦点自动落在 ⓘ 元素上，tooltip 绑定了 focus 触发（autofocus + focus-triggered tooltip 的常见组合）。

## 影响

用户在确认不可撤销操作前无法完整核对订单信息；需要额外操作（移动鼠标/点击别处）才能驱散浮层（是否可驱散待复测补记）。

## 证据

执行人截图（2026-08-28 ~17:45，tooltip 覆盖 Cancel Order 弹窗中部）；弹窗字段清单（顺带记录，S4 面素材）：Asset / Direction / Type / Price / Relay fee (est.) + 永久取消警示 + Keep Order / Confirm Cancel。

## 待复测补记

- tooltip 是否鼠标移动后消失、是否每次必现；
- Edit 弹窗与其他含 ⓘ 的弹窗是否同样存在（若同源组件则影响面更大）。

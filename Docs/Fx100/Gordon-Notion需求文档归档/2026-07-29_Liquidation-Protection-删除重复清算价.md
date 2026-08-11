# Liquidation Protection 删除重复清算价

> Notion 页面：[原文](https://app.notion.com/p/3ac3d7873f2c8131b516fb02822e72e0)
> 创建时间：2026-07-29 13:26 UTC
> Reporter：Gordon
> Priority：Low
> Status：Open
> 分支：`feat/liquidation-protection-ux-new-ui`

## 最新定案

Liquidation Protection 面板：

- 删除 `Est. Liq. Price`
- 保留动态 PnL

## 原因

1. 保护面板中的清算价与 Positions 行完全重复。
2. 清算价只随 funding 缓慢漂移，放在倒计时旁实时价值较低。
3. PnL 是动态值，保留更有意义。
4. 删除重复显示可减少用户对“两处清算价”的困惑。
5. 同时覆盖桌面端和移动端。

## 精确改动

文件：

```plain
src/components/features/trade/order-form/LiquidationProtectionCountdown.tsx
```

删除：

- `Est. Liq. Price` label
- `liqText` / `liqPrice` 的无用引用

保留：

- `pnlAmountText`
- `pnlPctText`

## 覆盖关系

本定案取代此前三个候选方案：

- 增加 “After this order” 限定词
- 无输入时收起
- 仅做视觉弱化

纯前端展示调整，不涉及合约和账本。

---
id: BUG-FE-SLACCEPT-009
title: 开仓附带的 Close-Long SL 其 acceptablePrice 被设为等于 triggerPrice（0 滑点容忍），触发即必然冻结——止损功能结构性失效，仓位只能走清算
severity: S2
priority: P1
status: fixed-verified（2026-08-28 21:34 复测通过，链上参数级确认：创建 tx `0xcb4844…3377` 中两笔附带 SL（含纯 SL 输入的 @105）acceptablePrice 均为 **0**（不设滑点限制），不再 =trigger；SL@105.1 触发后以 105.0276 < trigger 成功执行（tx `0x07cc9fc0…78a2`）。修复实现口径记录：acceptablePrice=0 意为无限滑点容忍——保证止损必然成交，极端行情下成交价不设下限，该取舍是否需要上限参数留产品评估（观察项，不影响本单关闭））
found: 2026-08-28
env: https://fx100-dev.vercel.app · Base Sepolia 84532 · fx100 v0.3.1 · One-Click（Flash）通道
source-case: E2E-TRD-033/044 · 2026-08-28 smoke LOG-025/026/027（链上取证定案）
related: BUG-FE-TPSL-007（同一提交产生的订单）
notion: https://app.notion.com/p/3ca3d7873f2c8102afd0ef82b2fa7afa（🐛 Bugs 库，2026-08-28 提交，Open/FX100/High）
---

# BUG-FE-SLACCEPT-009 · 附带 SL 触发即冻结（acceptablePrice=triggerPrice）

## 链上定案证据（2026-08-28）

- 17:33:42 开仓 tx `0x50f9b3c2…deae83` 同笔创建两 SL：trigger 106/acceptable **106**、trigger 105.5/acceptable **105.5**——**acceptablePrice = triggerPrice，0 滑点容忍**。
- 17:42:32 价格跌破 106，keeper 执行 SL-106 → revert **`OrderNotFulfillableAtAcceptablePrice(105.9623, 106)`**（reasonBytes 选择器精确匹配 v0.3.1 `src/error/FxErrors.sol:252`）→ OrderHandler `freezeOrder`（OrderHandler.sol:414）→ 订单 **Frozen**。tx `0x7e54498a…df513f`（block 46070932）。
- 机理（`BaseOrderUtils.getExecutionPriceForDecrease`）：多头减仓要求 executionPrice ≥ acceptablePrice；SL 触发时价格必然 < triggerPrice=acceptablePrice → **结构性永不可成交**。
- 冻结后无 FROZEN_ORDER_KEEPER 重试；仓位最终 17:49:34 被清算（tx `0x74b3711e…79e367`，@105.8378），冻结单同 tx AUTO_CANCEL。

## 影响（资金后果真实且必然）

开仓附带的多头止损**在任何触发场景下都无法执行**：用户以为有止损保护，实际保护为零；仓位只能滑向清算，额外承担 0.3% 清算费与更差的清算价（本例：SL@106 应止损 ≈−$70 上下，实际清算于 105.84 损失 −$139+，差额 ≈$70）。

## 对照组（证明正确行为存在）

同日 16:35:10 经**持仓行 TP/SL 弹窗**创建的 ETH SL（trigger 2,490）于 16:48:22 以 **2,489.914 成功执行**——执行价低于触发价仍可成交，说明该路径的 acceptablePrice 留有滑点余量。缺陷限于**开仓附带 TP/SL 路径**的 acceptablePrice 构造（编辑触发价时也不同步修正 acceptablePrice，见 17:38:04 编辑 tx：trigger 改 105.6、acceptable 仍 106）。

## 期望（需求级依据，2026-08-28 补）

归档需求《fx100-trading-guide.zh》§4.3 与《FX100-Limit-Stop-订单精确账本测试设计规范》明确：**触发单 acceptablePrice 恒为哨兵值**——平仓类 long→0、short→MaxUint256（"刻意设计，保证止损在剧烈行情中一定能成交"）。缺陷行为（acceptable=triggerPrice）直接违反该需求；修复后 acceptable=0 恰好回归需求 ✓。编辑触发价时亦不得破坏哨兵值。

## 修复验证建议

开仓附带 SL → 推价触发 → 断言 OrderExecuted（而非 OrderFrozen）且执行价 ∈ [acceptable, trigger]；回归对比两条创建路径的订单参数（Reader.getOrder 的 acceptablePrice 字段）。

---
id: BUG-FE-EDITACCEPT-014
title: 编辑触发单触发价时 acceptablePrice 被按 0.5% 滑点重算，破坏"触发单恒为哨兵值"需求——极端行情下重现触发即冻结风险
severity: S3
priority: P2
status: open
found: 2026-08-28
env: https://fx100-dev.vercel.app · Base Sepolia 84532 · v0.3.1 · One-Click（Flash）编辑通道
source-case: S7 出单断言（TRADE-CASES §一）· 2026-08-28 smoke LOG-034（链上取证定案）
related: BUG-FE-SLACCEPT-009（同一需求条款的创建路径违反，已修复；本单为编辑路径残留）
---

# BUG-FE-EDITACCEPT-014 · 编辑触发单破坏 acceptablePrice 哨兵

## 需求依据

《fx100-trading-guide.zh》§4.3 与《FX100-Limit-Stop-订单精确账本测试设计规范》：**触发单 acceptablePrice 恒为哨兵**（平仓 long→0 / short→MaxUint256），"触发单不支持最差可接受价设置……刻意设计保证止损必成交"。

## 链上证据（2026-08-28）

- 创建（tx `0x4f78719c…b47fdc`，22:01:12）：触发单 acceptablePrice = **0** ✓（SLACCEPT-009 修复后合规）。
- 编辑（tx `0xc8e561fb…f0d313`，22:04:32，orderKey `0x16567d58…92ddd` 不变）：triggerPrice 105.6→104.5 ✓，但 **acceptablePrice 被重算为 103.9775 = 104.5×(1−0.5%)**——哨兵 0 被滑点公式覆盖。

## 影响

编辑过的触发单不再"必然可成交"：价格跳空越过触发价并落在 acceptable 之外时（本例若跌破 103.9775），执行将 revert `OrderNotFulfillableAtAcceptablePrice` → 订单 Frozen——SLACCEPT-009 的冻结场景在编辑路径以 0.5% 缓冲的弱化形式重现。本例实测执行价 104.5286 ≥ 103.9775 未触雷，属幸免。

## 期望

编辑触发单只更新 triggerPrice（及用户明确修改的字段），acceptablePrice 保持哨兵值不变。

## 修复验证

编辑任一触发单后链上读 acceptablePrice 应仍为哨兵（long 平仓=0 / short 平仓=MaxUint256）；构造"编辑后价格跳空越过 trigger 且超出 0.5% 缓冲"用例应仍能执行。

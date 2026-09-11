---
id: BUG-FE-MINOUT-011
title: 开仓附带 TP/SL 与持仓弹窗追加 TP/SL 的创建参数不统一——附带路径缺 minOutputAmount 最小到手额保护、initialCollateralDelta 亦不同
severity: S4
priority: P3
status: open（观察项/低优先，前端两路径参数构造一致性）
found: 2026-08-29
env: https://fx100-dev.vercel.app · Base Sepolia 84532 · v0.3.1 · One-Click
source-case: S7 出单断言（TRADE-CASES §一）· 2026-08-29 smoke LOG-041（链上双路径对比）
---

# BUG-FE-MINOUT-011 · 两路径 TP/SL 创建参数不统一

## 链上对比证据（2026-08-29，同一 ETH 10x 多仓 4.0847 ETH）

同一仓位并存两组 TP/SL，逐字段解码创建参数：

| 字段 | 组1 开仓附带（tx `0xd14cd75b…`，00:12:12） | 组2 持仓弹窗（tx `0xc75d23ac…`，00:13:34） | 一致性 |
|---|---|---|---|
| orderType（TP=3/SL=4） | 3 / 4 | 3 / 4 | ✓ |
| triggerPrice | 2478 / 2430 | 2490 / 2420 | ✓（用户值原样） |
| acceptablePrice | 0 / 0 | 0 / 0 | ✓ 哨兵 |
| sizeDeltaUsd | $10,000 | $10,000 | ✓ |
| autoCancel | true | true | ✓ |
| **initialCollateralDeltaAmount** | **0** | 999999680（全仓保证金） | ✗ |
| **minOutputAmount** | **0（无下限）** | TP $1,166.01 / SL $880.08（≈保证金+预估PnL−费） | ✗ |

## 分析

- initialCollateralDeltaAmount 差异：全平场景合约最终都退全部保证金，功能等价，但前端构造规则不同。
- **minOutputAmount 差异有实际含义**：持仓弹窗路径为触发单设了最小到手额下限（相当于一道到手额保护）；开仓附带路径设 0，无此保护。触发单虽以 acceptablePrice=0 保证成交，minOutput 是另一层防线，两路径不统一。

## 期望

两条创建路径对同类触发单给出一致的参数构造；若 minOutputAmount 保护是有意设计，应在两条路径统一应用（或明确其仅适用弹窗路径的理由）。

## 备注

本单为参数一致性观察项（S4/P3），非资金风险缺陷（与 TPSL-007/SLACCEPT-009 不同级）。S7 三断言（类型/哨兵/滑点公式）本次全 PASS——即两路径均合规，仅内部构造细节不齐。

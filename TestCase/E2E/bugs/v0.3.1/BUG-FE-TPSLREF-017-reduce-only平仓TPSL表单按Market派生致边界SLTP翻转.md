---
id: BUG-FE-TPSLREF-017
title: reduce-only 平仓 TP/SL 下单表单按 "Market(mark)" 价派生类型与操作符，与协议按 Oracle 价分类不一致；触发价落在两价之间时用户点 "Place SL" 实际创建成 Take Profit（保护方向被静默反转）
severity: S2
priority: P1
status: open
found: 2026-08-30
env: https://fx100-dev.vercel.app · Base Sepolia 84532 · v0.3.1 · Chrome 桌面 · 已连接 0xEEeA…B119 · Limit·Reduce-only
source-case: E2E-TRD S7（出单参数）· reduce-only 平仓触发单 · 2026-08-30 LOG-072（链上取证 forensics-stop.mjs → tpsl-order.json）
finder: 执行人（Mila）+ 记录员链上取证
---

# BUG-FE-TPSLREF-017 · reduce-only 平仓 TP/SL 表单参考价不一致致 SL↔TP 边界翻转

与 [[BUG-FE-STOPTYPE-016]] 同族（前端"按触发价 vs 现价推断触发单类型"设计的脆弱性），但**根因不同**：016 是编辑路径不重派 / 挂单页显示；本单是**表单派生用 "Market" 价、协议分类用 "Oracle" 价的参考价不一致**，且在**全新提交**（无需编辑）即可触发。

## 现象（2026-08-30 12:20 实录）

- 持仓：ETH **Long**（entry 2,443.68、Oracle 2,457.23、表单显示 Market $2,458.29）。
- reduce-only 平多表单：Buy/Long + **Reduce-only ON** + 触发 **"Oracle ≤ 2458.28"**（表单参考 Market 2458.29，判触发价在"下方"）→ 按钮 **"Place SL"**、提示 "Near market — may fill right away"。
- 提交后创建的却是 **Take Profit / Close Long / Trigger: Oracle ≥ 2,458.28**（类型 SL→TP、操作符 ≤→≥ **双翻**）。

## 链上实锤

- 创建 tx **`0xa565224d8b0e9aff…`**（block 46147681，2026-08-30 12:20:50）：**orderType=3（LimitDecrease）**、isLong=true、triggerPrice=2458.28、**acceptablePrice=0（平多哨兵）**、autoCancel=true —— 即 Take Profit（平多 sell-high）。链上类型与前端 "Take Profit" 显示一致、**与表单 "Place SL" 按钮相反**。枚举据 v0.3.1 `src/order/Order.sol`（3=LimitDecrease）。

## 对照：同流程，触发价拉开就正确

- 触发 **"Oracle ≤ 2454"**（明显低于 Oracle 2456/Market 2457）→ 按钮 "Place SL"、Trade Details **"Stop-loss: once Oracle ≤ 2454, closes at market."** → 创建 tx `0xb4a0eb932a09e2b1…`（12:23:28）：**orderType=4（StopLossDecrease）**、isLong=true、trigger 2454、acceptable=0 —— **名副其实 Stop Loss，正确**。

## 根因（强推断）

- 表单按其显示的 **"Market"(mark/mid) 价（2458.29）** 判定触发价在现价上/下 → 据此派生 TP/SL 与 ≥/≤ 及按钮文案；
- 协议按 **Oracle 价（2457.23）** 分类/触发；
- 两价差约 **$1.06**，触发价 2458.28 落在其间（> Oracle、< Market）→ 表单判 **SL/≤**、链上成 **TP/≥**，同一笔单"入场标签"与"实际类型"相反。

## 影响

- **保护方向被静默反转**：用户意图 Stop-Loss（防下跌）实际得到 Take-Profit（仅上涨触发）→ **下行敞口无保护**，与意图相反，资金风险真实（尤其"近市价设保护单"是常见操作）。
- 复现窗口窄（触发价须落在 Market 与 Oracle 之间，本例 ~$1 宽），但边界触发概率非零、后果严重，定 **S2/P1**。

## 期望

1. 表单派生 TP/SL 类型与操作符所用的"现价"，必须与协议触发/分类所用的 **Oracle 价同源**；
2. 或在两价存在价差、触发价落入其间的边界，明确提示"该触发价接近现价，将创建为 X 类型"，并使 **按钮/Trade Details 与最终 orderType 一致**；不得"点 SL 出 TP"。

## 修复建议（含确认级别）

- **B1【缺陷直修】统一参考价**：表单类型/操作符派生改用 **Oracle 价**（与协议同源），根除 Market/Oracle 边界翻转。
- **B2【缺陷直修】提交前一致性校验**：按钮文案（Place SL/TP）、Trade Details、最终 orderType 三者必须一致；不一致时以将创建的实际类型为准并同步更新按钮/文案。
- **B3【需产品确认】近市价边界提示**：触发价落在 mark/oracle 之间或极近现价（"may fill right away"）时，是否加提示/二次确认。
- **是否需要确认**：B1/B2 为明确缺陷、可直接排期；仅 B3 的"是否加边界提示"需产品确认。

## 证据

- 取证脚本 `scratchpad/forensics-stop.mjs`（本轮改 startBlock 46145000）→ `tpsl-order.json`：两单 orderType 3/4、isLong true、acceptable 0、autoCancel true。
- 截图：表单 "Place SL / Oracle ≤ 2458.28 / Market 2458.29 / Oracle 2457.23"；Open Orders "Take Profit / Oracle ≥ 2,458.28 / Close Long"；对照 "≤2454 → Stop Loss / Trade Details 明写 Stop-loss"。

## 待复测

- 多空对称：空头 reduce-only 平空的 TP/SL 是否同样按 Market 派生、触发价落两价间是否翻转。
- 触发价精确设在 Oracle 与 Market 之间多次，测翻转确定性与边界宽度。
- 与 016 是否可合并为"触发单类型派生"统一修复（016 用 Oracle 派生但编辑不重派；017 表单派生用错价源）——修复时建议一并处理"派生一律以 Oracle 为准 + 全路径（表单/编辑/显示）复用同一派生"。

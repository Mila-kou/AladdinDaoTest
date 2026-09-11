---
id: BUG-FE-PROTPANEL-006
title: 仓位清算/平仓后 Liquidation Protection 面板残留旧仓位 PnL 超 20 分钟，且杠杆徽标错误联动表单滑条
severity: S3
priority: P2
status: open
found: 2026-08-28
env: https://fx100-dev.vercel.app · Chrome 桌面 · Base Sepolia 84532 · 已连接（0xEEeA••••B119）
source-case: E2E-TRD-042（保护页签与说明卡）· 2026-08-28 smoke LOG-016/017/018（live-observer 第二班取证）
---

# BUG-FE-PROTPANEL-006 · 保护面板残留与联动错乱

## 现象（2026-08-28 实测，live-observer 逐拍记录）

LINK 仓位于 17:03:00 被链上清算、持仓列表随后清空（Positions(0)）后：

1. **保护面板残留**：Liquidation Protection 面板超过 20 分钟持续显示已消失仓位的信息——"You are exposed to liquidation / Reopen to get protection back / 00:00"引导与 **PnL 冻结在旧仓位终值**（−$8.31 → −$9.78 等陈旧读数），未随仓位消失而清空/复位为"Trade now/15:00"初始态。
2. **杠杆徽标联动表单**：面板徽标先后显示 LINK 100.33x → 61.71x → **23x**——数值随下单表单杠杆滑条实时变化，而非仓位杠杆；无仓位时徽标含义误导（同一面板此前有仓位时徽标=实际仓位杠杆，如 100.19x）。

## 期望

- 仓位关闭/清算后，保护面板在合理时间内（与持仓列表同步）复位为无仓位初始态（"Trade now" + 15:00 静止），不残留旧 PnL；
- 徽标口径统一：有仓位显示仓位实际杠杆，无仓位显示表单杠杆时应有区分（或不显示徽标），避免"You are exposed to liquidation"与陈旧 PnL 组合造成"仍有仓位暴露"的误读。

## 影响

清算发生后的关键时间窗内（叠加 BUG-FE-IDXLAG-005 历史记录滞后），页面三处信息互相矛盾：持仓列表空、保护面板称"你暴露于清算风险"且带旧 PnL、历史无记录——用户无法判断自己当前是否有仓位与损失多少（当日执行人实际经历）。

## 证据

- live-observer 第二班逐拍记录（LIVE-LOG.md，清算后 >20 分钟面板逐拍读数）；LOG-016/017 截图（徽标 61.68x/23x 随表单变动、面板陈旧 PnL 与空持仓列表同屏）。

## 关联

- BUG-FE-IDXLAG-005（历史滞后）：两者叠加放大"仓位去哪了"的困惑窗口。
- E2E-TRD-042 执行时按本单现象增加"仓位关闭后面板复位"断言。

---

## 附带 · 保护倒计时同屏不一致（2026-09-06 追加，PROT-002 取证）

同一仓位的保护倒计时在**持仓行**与**右侧保护面板**两处最多相差 **1 秒**。实测：面板 11:29 / 持仓行 11:28（判定为同一仓位的依据：面板 PnL −$1.11 −2.77% 与该行完全一致，徽标同为 SOL 25x）。

**根因**：两个独立的 1 Hz `setInterval`，均取 `Math.floor(Date.now()/1000)`，但起拍相位不同 ——
- 持仓行 `hooks/trade/usePositionsController.ts:390-398`（持仓表挂载时起拍，`useEffect(…, [])`）
- 保护面板 `hooks/trade/useProtectionState.ts:131-137`（随 `[windowStart, windowEnd]` 重新起拍）

代码本已有共钟约定，但只覆盖持仓表内部 —— `usePositionsController.ts:176-180`：*"Callers that render the badge must pass the same ticking value they give the protection countdown"*。

**定级 S4**：纯显示相位差，最大 1 秒，不影响任何判定或操作。**期望**：面板复用持仓表同一时钟，或抽共享 1 Hz clock hook 供两处消费。

**非缺陷澄清**：同一截图中两个不同仓位（SOL Long 11:28 / SOL Short 11:26）相差 2 秒是**正确行为** —— 保护窗按仓位各自锚定首仓区块时间（`IncreaseOrderUtils.sol:55`），Base 出块 2s，两笔开仓落相邻块即差 2s。

证据：`manual-runs/2026-08-28-基本功能smoke/OPERATION-LOG.md` LOG-088。

---
id: BUG-FE-TPSLSIZE-012
title: Adjust Leverage 加仓使仓位规模放大后，既有 reduce-only TP/SL 触发单的 Size 不随之放大，导致放大后仓位大部分无止盈/止损覆盖
severity: S3
priority: P2
status: open
found: 2026-08-29
env: https://fx100-dev.vercel.app · Base Sepolia 84532 · v0.3.1
source-case: E2E-POS-003（调杠杆）· E2E-TRD-034（reduce-only）· 2026-08-29 smoke LOG-045
finder: 执行人（Mila）
notion: https://app.notion.com/p/3ca3d7873f2c811bbb5fc97e19ce0e48（🐛 Bugs 库，2026-08-29 提交，Open/FX100/High——按影响升级后定性；frontmatter 初判 S3/P2 未改）
---

# BUG-FE-TPSLSIZE-012 · 加仓后 TP/SL 未随仓位放大

## 复现步骤（2026-08-29 实录）

1. ETH 开多 $10,000/10x，挂 4 笔 TP/SL（各 Size $10,000，覆盖全仓）。
2. Adjust Leverage 10x→100x（保证金不变、加仓）：仓位放大为 **$95,708.83 / 39.12 ETH**（00:21:18 Market Open Long $85,708.83 Executed）。
3. 查看 Open Orders / Orders History 的 4 笔 TP/SL。

## 期望结果

加仓使仓位规模从 $10,000 增至 $95,708 后，覆盖全仓的 reduce-only TP/SL 应随之放大（或提示用户其保护单未覆盖新增仓位）。对照：**减仓 50% 时 TP/SL 会自动缩量至剩余仓位**（LOG-023，"Closes entire remaining position"）——放大方向理应对称处理。

## 实际结果

4 笔 TP/SL 的 Size 全部停留 **$10,000**（Orders History 四行均 $10,000，Token Size 仅 4.01~4.13 ETH 级），未随加仓放大到 $95,708。后果：若价格上行触及 TP，4 笔合计仅平 $40,000 < 仓位 $95,708，**剩余约 $55,708 敞口无止盈保护**；止损侧同理，放大后的仓位大部分暴露。

## 影响

- 用户经"Adjust Leverage"加仓后，其原有风控（TP/SL）静默失去对新增仓位的覆盖，且无任何提示；
- 与减仓自动缩量（LOG-023）的处理不对称——减仓会调、加仓不调。
- **升级：不止覆盖不足，直接导致 SL 无法执行（链上实证，2026-08-29）**。仓位加仓到 $95,708 后，陈旧 $10,000 SL 触发时 keeper 两次尝试执行（OrderHandler tx `0x67bebbda…` / `0x8fc34a55…`）均被合约以 `min collateral for leverage` / `pnl` **拒绝冻结**——因为只平 $10k 会留下 $85,708 敞口击穿最小抵押守卫。**即：TP/SL 未随加仓放大，使止损在最需要时被合约挡住，仓位只能走清算**（多付 0.3% 清算费 $287 vs 若 SL 正常执行的 0.05%）。严重性由此从"覆盖不足隐患"升为"止损失效直接后果"。

## 证据

执行人截图（Orders History 4 笔 TP/SL 均 $10,000，与放大后仓位 $95,708 并存）；LOG-042/044/045 仓位放大链路；本仓最终因价格下行被清算（$95,708 @2,430.82，00:29:10），TP/SL 侧未获实测触发，但覆盖不足的事实由 Size 值成立。

## 备注

减仓缩量为前端显示封顶（链上 sizeDelta 不变，见 LOG-027 ③）；本单为放大方向的对称缺口，需前端在加仓后同步放大 TP/SL 的 sizeDelta，或明确提示用户补挂。

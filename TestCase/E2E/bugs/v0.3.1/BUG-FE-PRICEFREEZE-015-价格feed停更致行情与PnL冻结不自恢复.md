---
id: BUG-FE-PRICEFREEZE-015
title: 前端价格 feed 停更导致行情/预言机价/持仓 PnL 与清算价长时间冻结在陈旧值且不自恢复，暴露仓位的风险读数失真
severity: S3
priority: P2
status: open
found: 2026-08-29
env: https://fx100-dev.vercel.app · Base Sepolia 84532 · v0.3.1 · Chrome 桌面
source-case: E2E-TRD-011/012（行情/K线）· E2E-TRD-049（feed 异常降级）· 2026-08-29 R3 LOG-052（live-observer 第七班取证 + 记录员复核）
---

# BUG-FE-PRICEFREEZE-015 · 价格 feed 停更致行情/PnL 冻结

## 现象

约 2026-08-29 18:00 起，整页价格数值逐位冻结并**持续 ≥40 分钟不自恢复**（记录员 18:4x 复核仍冻结在同一组值）：
- Oracle 2,436.15 / BTC 77,667.83 / SOL 103.45 / SUI 0.7366 / 24h vol 137.11M 全部不动；
- 持仓卡 **PnL 冻结在 −$30.83**、清算价与 Est. 各项随之冻结。

## 关键：非标签页休眠，是前端价格 feed 停更（network 证据）

`read_network_requests` 证据区分两种成因：
- 冻结期**仅见** `base-sepolia.gateway.tenderly.co` RPC POST（持续、全 200）——链上读活跃，**标签页未休眠**；
- 此前存在的 `fx100-dev.vercel.app/api/prices/tickers | open-interest | candles` GET 轮询在缓冲区**消失**——**价格 feed 轮询停更**是展示层冻结的直接成因。

## 影响

- 该仓保护已 **Expired（exposed）**，用户此刻正需要准确的实时 PnL / 清算距离来决策，却看到**冻结的陈旧 PnL 与预言机价**——风险读数失真（与 E2E-TRD-049 期望"不把陈旧数据伪装成实时、给明确降级提示"冲突：本例既无"数据延迟/停更"提示，也未自恢复）；
- 链上仓位真实、价格在动（Tenderly RPC 显示链上活跃），仅前端展示停在旧值。

## 期望

价格 feed 中断时：①给可见的"行情停更/重连中"提示，不把陈旧价伪装成实时；②自动重连恢复轮询；③恢复失败时提示用户刷新。

## 待复测

- 刷新页面能否恢复（本班/复核均只读未刷新，未验证）；
- feed 停更的触发条件（长时间挂起？特定 API 超时？）；
- 是否影响下单预览/触发判定（若前端用停更价算预览会二次失真）。

## 证据

live-observer 第七班逐拍冻结记录（LIVE-LOG，18:00 起 ≥14 拍）+ 记录员 18:4x 复核（Oracle/BTC/PnL 与 40 分钟前逐位相同）+ network 缓冲区对比（Tenderly RPC 活、api/prices GET 停）。

---
id: BUG-FE-MKTBOUNCE-004
title: 已连接持仓会话中选择新市场后，页面数秒内被自动拽回"页面加载时的锚定市场"（URL 保留新市场参数，与页面矛盾）
severity: S2
priority: P1
status: fixed-verified（2026-08-28 当日修复并复测通过）
found: 2026-08-28
env: https://fx100-dev.vercel.app · Chrome 桌面 · Base Sepolia 84532 · 已连接钱包（0xEEeA••••B119）且持有活跃仓位
source-case: 2026-08-28 基本功能 smoke 人工执行（manual-runs/2026-08-28-基本功能smoke/ LOG-005/007/008/009）
related: BUG-FE-MKTURL-002（URL 不随动，与本缺陷叠加造成 URL/页面矛盾态）
notion: https://app.notion.com/p/3ca3d7873f2c81d0b1cde51501e9417b（🐛 Bugs 库，2026-08-28 提交，Open/FX100/High）
---

# BUG-FE-MKTBOUNCE-004 · 选择市场被拽回会话锚定市场

## 现象

已连接钱包且持有活跃仓位的会话中，通过市场选择器选择任何非锚定市场后，页面短暂切换随即被自动拽回**页面加载（mount）时的市场**；URL 保留新选市场参数不被纠正，形成"URL=新市场、页面=锚定市场"的矛盾态。执行人描述"总是"复现。

## 复现记录（同一会话 4 例，两种锚定市场）

| # | 页面加载时锚定市场 | 执行人选择 | 结果 | 证据 |
|---|---|---|---|---|
| 1 | BTC（加载 `?market=BTCUSDC`） | SUI/USD | 页面拽回 BTC，URL 停 `?market=SUIUSDC` | LOG-005（16:04 实拍） |
| 2 | BTC（同上会话） | ETH/USD | 页面拽回 BTC，URL 停 `?market=ETHUSDC` | LOG-007；存储取证 `fx100:v2:selectedMarketSymbolByChain={"84532":"BTCUSDC"}` |
| 3 | BTC（同上会话，二次） | ETH/USD | 同上，复现 | LOG-007 |
| 4 | **ETH**（刷新后按 URL `?market=ETHUSDC` 重建） | LINK/USD | 页面拽回 **ETH**，URL 停 `?market=LINKUSDC` | LOG-009 截图；存储取证 `{"84532":"ETHUSDC"}` |

对照组：未连接、无持仓的浏览器中反复切换市场，页面稳定停留（复核 agent 受控 2/2，静置 >5s）——仅 URL 不随动（即 BUG-FE-MKTURL-002），无拽回。

## 关键诊断证据

1. **拽回目标随锚定市场移动**：刷新前锚 BTC 全部拽回 BTC；刷新落 ETH 后锚变 ETH、选 LINK 拽回 ETH——排除"固定默认市场"或"持仓市场"解释（案例 4 时 BTC/ETH 双仓并存，仍只拽回 ETH）。
2. **存储层**：`fx100:v2:selectedMarketSymbolByChain` 始终保持锚定市场值，用户新选择未能持久化（或被立即写回）。
3. **刷新即愈**：执行人刷新页面后，按 URL 参数重建状态，新市场稳定成立、不再拽回——说明拽回来自**会话内存态**（疑为以挂载时市场初始化的订阅/effect 在存续期间反复写回选中市场），非持久层。

## 期望结果

选择任何市场后页面稳定停留在所选市场，URL、存储、页面三者一致。

## 影响

- 持仓期间用户无法切换浏览/交易其他市场（核心交易路径受阻，故评 S2/P1）；
- 与 BUG-FE-MKTURL-002 叠加后 URL 与页面矛盾，刷新/分享落到与所见不同的市场。

## 待定项

触发条件未完全隔离：已连接+持仓的会话必现，纯"已连接无持仓"是否复现未测（当日账户始终有仓位）。修复验证时补测。

## 复测记录（2026-08-28 当日）

- 开发当日修复上线；执行人在原触发环境（已连接 + BTC/ETH 双活跃仓位）复测：选择 LINK/USD 后页面稳定停留，不再拽回。
- 记录员三层取证一致：URL `?market=LINKUSDC`、页面全区 LINK/USD（标题/页头/统计条/图表/保护面板）、存储 `fx100:v2:selectedMarketSymbolByChain={"84532":"LINKUSDC"}`——此前"存储保持锚定市场"的核心症状消除。
- 判定：**复测通过（fixed-verified）**。注：BUG-FE-MKTURL-002（切回市场 URL 不随动）为独立缺陷，是否被同一修复覆盖待单独复测。

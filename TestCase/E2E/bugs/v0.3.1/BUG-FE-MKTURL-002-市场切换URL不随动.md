---
id: BUG-FE-MKTURL-002
title: 切回市场后地址栏 URL 不随动，停留在前一市场参数（刷新/分享落错市场）
severity: S3
priority: P2
status: open
found: 2026-08-28
env: https://fx100-dev.vercel.app（Vercel dev 前端）· Chrome 桌面 · Base Sepolia 84532 · 未连接钱包即可复现
source-case: E2E-TRD-008（2026-08-28 基本功能 smoke，manual-runs/2026-08-28-基本功能smoke/）
---

# BUG-FE-MKTURL-002 · 切回市场后 URL 不随动

## 复现步骤（复现率 2/2，无钱包环境即可）

1. 打开 `https://fx100-dev.vercel.app/trade?market=BTCUSDC`。
2. 点击页头市场选择器，选择 ETH/USD —— 此方向正常：URL 变为 `/trade?market=ETHUSDC`，标题/页头/统计条/保护面板全部切为 ETH。
3. 再次打开选择器，切回 BTC/USD。
4. 观察地址栏 ≥5 秒。

## 期望结果

URL 随动为 `/trade?market=BTCUSDC`，与页面显示市场一致。

## 实际结果

页面所有区域（标题"BTC Market"、页头 BTC/USD、统计条、保护面板徽标）均已切回 BTC，但 URL 停留在 `?market=ETHUSDC`，等待 5 秒以上不更新；重复执行 2 次均复现。首次进入方向（BTC→ETH）URL 正常更新，问题只出现在**后续切换**上。

## 影响与后果

- 此时刷新页面或分享该链接，会按 URL 参数落到 ETH 市场，与用户所见矛盾。
- 已连接钱包的实操中观察到同类失同步实例：地址栏 `?market=SUIUSDC` 而页面显示 BTC/USD（2026-08-28 执行人会话，OPERATION-LOG LOG-005）。

## 证据

- 复核 agent 受控复现记录（2026-08-28，无钱包内置浏览器，2/2）；执行人已连接会话中 URL=SUIUSDC/页面 BTC、URL=ETHUSDC/页面 BTC 两例实拍（LIVE-LOG / OPERATION-LOG）。

## 关联与待办

- 关联用例：E2E-TRD-008（原设计断言"各区域同步"PASS，本缺陷为 URL 层新增发现）。
- 相关现象已于 2026-08-28 当日坐实并另立单：[BUG-FE-MKTBOUNCE-004](BUG-FE-MKTBOUNCE-004-选择市场被拽回锚定市场.md)（已连接持仓会话选择新市场被拽回加载时锚定市场；4 例复现 + 存储取证 + 刷新即愈）。两缺陷叠加造成"URL=新市场、页面=锚定市场"矛盾态。

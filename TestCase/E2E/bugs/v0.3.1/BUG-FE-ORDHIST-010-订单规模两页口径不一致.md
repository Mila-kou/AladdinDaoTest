---
id: BUG-FE-ORDHIST-010
title: Reduce-only 订单规模两页口径不一致：Open Orders 显示前端封顶后的 $15,000，Orders History 显示链上原始 $30,000，均无标注——用户误以为订单被缩量/历史未更新
severity: S3
priority: P2
status: open
found: 2026-08-28
env: https://fx100-dev.vercel.app · Base Sepolia 84532 · fx100 v0.3.1 · One-Click（Flash）通道
source-case: 2026-08-28 smoke（OPERATION-LOG LOG-023 观察窗② / LOG-026 口径疑点 / 探针第 3 问定案）；执行人 Orders History 截图标注
related: BUG-FE-SLACCEPT-009、BUG-FE-TPSL-007（同一批订单）
notion: https://app.notion.com/p/3ca3d7873f2c81619e6aec464d00f449（🐛 Bugs 库，2026-08-28 提交，Open/FX100/Medium）
---

# BUG-FE-ORDHIST-010 · Reduce-only 订单规模两页口径不一致

## 现象

SOL $30,000/100x 开多附带的两笔 SL（17:33:42 创建，Close Long / Reduce-Only）在 17:37:28 市价减仓 $15,000 后：

- **Open Orders 页**：两笔 SL 显示为 **$15,000** + 标注 "Closes entire remaining position"；
- **Orders History 页**（订单被 AUTO_CANCEL 后）：同两笔订单显示 **$30,000**（283.0189 / 284.3602 SOL，触发价派生值）。

同一订单，两个页面给出两个规模数字，均无解释口径的标注。执行人的直觉解读是"History 没更新成取消时的最终金额"。

## 链上定案（关键：History 显示的才是链上真值）

探针取证：两笔 SL 的链上 `sizeDelta` 从创建到消亡**始终 $30,000**，链上从未改单。Open Orders 的 "$15,000 / Closes entire remaining position" 是**纯前端显示层封顶**（reduce-only 订单执行时会按剩余仓位截断，前端提前把显示值按仓位封顶——语义无害但未标注是显示值）。

因此缺陷不是"History 显示错误值"，而是：**挂单页展示封顶后的有效值、历史页展示链上原始值，两页口径不一致且都不说明自己是哪个口径**。

## 复现步骤

1. 开多 $30,000 并附带 reduce-only SL（同规模）；
2. 市价减仓 50%（$15,000）；
3. 看 Open Orders：SL 显示 $15,000（封顶显示）；
4. 令订单进入终态（本例：清算触发 AUTO_CANCEL）；
5. 看 Orders History：同一订单显示 $30,000。

## 期望（口径待产品确认）

两页统一同一口径，任选其一并加标注：

- A. 两页都显示链上原始规模，reduce-only 单加 "执行时按剩余仓位截断" 提示；
- B. 历史页也显示封顶后的有效规模（订单终态时点的可执行量）。

最低要求：History 的 reduce-only 行沿用 Open Orders 已有的 "Closes entire remaining position" 类标注，消除"两个数字对不上"的误读。

## 影响

无资金影响（显示层）。但同一订单两页规模对不上：用户误以为订单被改过/缩过量、或历史数据未更新；测试/审计对账时两页数字无法直接互证（本次即触发一轮链上探针才定案）。评 S3/P2。

## 备注

Orders History 触发单行的 Token Size 为 Size/触发价派生值（283.0189=30,000/106、284.3602=30,000/105.7 附近），非实际币量；市价单行才是实际币量——此显示规律已记录于 OPERATION-LOG（LOG-022 附注），与本缺陷叠加会加深误读。

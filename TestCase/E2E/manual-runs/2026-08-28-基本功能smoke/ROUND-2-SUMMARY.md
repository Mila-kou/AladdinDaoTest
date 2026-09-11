---
project: fx100
type: round-summary
title: 2026-08-28~29 第二轮人工冒烟测试小结（Round 2）
period: 2026-08-28 21:30 – 2026-08-29 00:50
env: https://fx100-dev.vercel.app · Base Sepolia 84532 · fx100 v0.3.1（260729 部署）
executor: Mila（人工 + Rabby/Flash 签名）
recorder: Claude（第四~六班实时观察 + 6 次链上取证 + 逐笔核对）
status: round-2-complete
---

# 2026-08-28~29 第二轮人工冒烟测试小结

> 承 [ROUND-1-SUMMARY.md](ROUND-1-SUMMARY.md)（15:40–18:10）。Round 2 聚焦：TP/SL 订单类型语义、acceptablePrice 需求核查、订单编辑、调杠杆加仓、TP/SL 触发与清算竞速。过程记录见 [OPERATION-LOG.md](OPERATION-LOG.md) LOG-029~048、[CASE-2026-08-29-ETH-加仓清算.md](CASE-2026-08-29-ETH-加仓清算.md)。

## 一、执行统计

| 项 | 数 | 说明 |
|---|---|---|
| 真实交易 | 开仓 4 / 加仓 1 / TP 平仓 1 / TP-SL 组 5 组 / 编辑 3 / 撤单若干 | 跨 SOL·ETH 市场 |
| 真实清算 | 2 例（SOL 22:09 编辑单执行式平仓、ETH 00:29 加仓放大后清算） | 全部 tx 级取证 |
| 链上取证 | 6 次（21:34 单 / 22:01 双路径 / Frozen 定案 / 加仓命运 / SL竞速 / 双证） | 复用 scratchpad forensics5~8.mjs |
| 资金账 | 97,805.19 → 96,658.81（链上 balanceOf 对平） | 逐笔闭环零缺口；净损含 2 例清算+交易费 |
| S7 出单断言 | 新增并首跑（orderType/acceptablePrice/滑点公式） | 见 TRADE-CASES §一 |

## 二、缺陷（本轮新增/更新）

| 单号 | 级别 | 摘要 | 状态 |
|---|---|---|---|
| [TPSL-007](../../bugs/v0.3.1/BUG-FE-TPSL-007-非法TP未拦截且静默转为SL.md) | S2/P1 | 非法方向 TP/SL 未拦截、按价位静默转类型（双向复现 + 链上 orderType 实锤 + 范围精确化：仅非法输入触发） | open（Notion High） |
| [POSCARD-013](../../bugs/v0.3.1/BUG-FE-POSCARD-013-加仓成交后持仓卡陈旧未更新.md) | S2/P1 | 加仓成交后持仓卡陈旧（$10k/10x vs 链上 $95k/100x），误导清算风险 | open |
| [TPSLSIZE-012](../../bugs/v0.3.1/BUG-FE-TPSLSIZE-012-调杠杆加仓后TPSL未随仓位放大.md) | S3/P2→实害 | 加仓后 TP/SL 未放大；实证直接导致 SL 触发被合约冻结、止损失效、被迫清算 | open（Notion High） |
| [MINOUT-011](../../bugs/v0.3.1/BUG-FE-MINOUT-011-开仓附带TPSL缺最小到手额保护.md) | S4/P3 | 两路径 TP/SL 创建参数不统一（minOutputAmount / collateralDelta） | open |
| [EDITACCEPT-014](../../bugs/v0.3.1/BUG-FE-EDITACCEPT-014-编辑触发单重算可接受价破坏哨兵.md) | S3/P2 | 编辑触发价时 acceptablePrice 被按 0.5% 重算，破坏哨兵 | open |
| [ORDHIST-010](../../bugs/v0.3.1/BUG-FE-ORDHIST-010-订单规模两页口径不一致.md) | S3/P2 | reduce-only 订单规模两页口径不一致（前端封顶 vs 链上原值，均无标注） | open（执行人立） |
| [SLACCEPT-009](../../bugs/v0.3.1/BUG-FE-SLACCEPT-009-开仓附带SL可接受价等于触发价致触发即冻结.md) | S2/P1 | 附带 SL acceptablePrice=trigger 触发即冻结 | **fixed-verified** |
| [IDXLAG-005](../../bugs/v0.3.1/BUG-FE-IDXLAG-005-历史记录状态更新滞后无提示.md) | S3/P2 | 状态回填滞后 + 抹掉 OrderFrozen 中间态（本轮强化） | open |

> ✅ **编号撞车已处理（2026-08-29）**：原 EDITACCEPT-010 已改号 **EDITACCEPT-014**（文件与全部引用同步更新），ORDHIST-010 保留原号；NNN 空间恢复唯一。
> 当日缺陷单累计 **13 张**（+RELAY-001），S2 计 4（007/009已修/012/013）。

## 三、本轮确立的产品语义与核对口径（核对手册增补）

- **S7 出单断言体系**：orderType 如实传参（TP=3/SL=4）；触发单 acceptablePrice 哨兵（平仓 long=0/short=MaxUint256，需求出处 trading-guide §4.3 + Limit-Stop 规范）；市价单 acceptable=预估价×(1±滑点)。此后每笔触发单按 S7 链上核查。
- **调杠杆=加仓/减仓**（Adjust Leverage 保证金固定、调 size；只对增量收 0.05%；Target Size 基准=Equity）。
- **两条 keeper 通道**：触发单 OrderHandler `0x84162e52…`、清算 LiquidationHandler `0x40a99db1…`；清算费 0.3% 为清算铁证。
- **SL 抵押守卫**：陈旧小额 reduce-only 单在仓位放大后执行会击穿最小抵押/杠杆守卫被冻结。
- **Closed PnL = (exit−entry)×TokenSize − 平仓侧全部费（不含开仓费）**（三连验）；**平仓执行无点差（=index），点差仅加开仓**（三点定线）。
- **insolvent 禁止手动平仓**（Close 灰化"Pending Liquidation"）；保护面板五态谱 + Add Margin 自救；保护倒计时加/减仓/刷新均不重置。
- **方法论**：判定订单命运须以链上事件序列为准，前端 "Cancelled" 会抹掉 keeper 尝试执行→OrderFrozen 的中间态（执行人坚持链上核查，纠正了"直接取消"的误判）。

## 四、下一轮待办

- 空头镜像全链路（开空清算价在上、空头 TP<现价/SL>现价、空头触发单 acceptablePrice=MaxUint256）——Round 1/2 均未走空头；
- 修复复测：TPSL-007、TPSLSIZE-012（含 SL 冻结因果）、POSCARD-013、MKTURL-002；
- EDIT-001~003 正式执行（含编辑弹窗预填值口径验证）；
- ~~缺陷编号去重（010 撞车）~~ ✅ 已完成（EDITACCEPT→014）；
- 待评估：保护窗内已达清算门槛时用户主动平仓的预期行为（关联 OC-17/SCN-B32，见 CASE 记录 §7）。

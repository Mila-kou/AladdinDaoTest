---
project: fx100
type: round-summary
title: 2026-08-28 首轮人工冒烟测试小结（Round 1）
period: 2026-08-28 15:40 – 18:10
env: https://fx100-dev.vercel.app · Base Sepolia 84532 · fx100 v0.3.1（260729 部署）
executor: Mila（人工操作 + Rabby/Flash 签名）
recorder: Claude（3 班实时观察 agent + 5 次链上取证 + 逐笔核对）
status: round-1-complete
---

# 2026-08-28 首轮人工冒烟测试小结

## 一、执行统计

| 项 | 数 | 说明 |
|---|---|---|
| 控件用例（54 条底座） | **11 PASS / 0 FAIL / 43 待执行** | PASS：TRD-001/002/003/005/006/007/008/017/026/033/043；其中 026/033/043 为原判"不可测"经真实行情自然达成；14 条属本轮范围排除（可控价格/keeper/多账户/异常注入类） |
| 交易场景用例（新设计） | 21+3 条 draft 就绪 | PROT×6 / POS×8 / LMT×7 / EDIT×3（订单编辑为新功能点增补）；含全字段断言清单与自然实验证据映射（正式执行留下一轮） |
| 真实交易 | 开仓 5 / 部分平 1 / 全平 2 / 撤单 2 / 编辑 2 / TP-SL 对 2 组 | 跨 BTC·ETH·LINK·SOL 四市场 |
| 真实清算 | **3 例**（BTC 16:49:50 / LINK 17:03:00 / SOL 17:49:34） | 全部 tx 级取证，费用逐项分解精确吻合 |
| 资金账 | 98,217.06 → **97,805.19**（链上 balanceOf 对平） | 全部资金流逐笔闭环零缺口；净消耗 411.87（手续费+清算损失，测试网币） |

## 二、缺陷（8 张 + 观察项）

| 单号 | 严重级 | 摘要 | 状态 |
|---|---|---|---|
| [BUG-FE-TPSL-007](../../bugs/v0.3.1/BUG-FE-TPSL-007-非法TP未拦截且静默转为SL.md) | **S2/P1** | 开仓附带 TP 低于现价：红字校验未拦截提交，非法 TP 被静默转为第二笔 SL（订单类型静默变更） | open |
| [BUG-FE-SLACCEPT-009](../../bugs/v0.3.1/BUG-FE-SLACCEPT-009-开仓附带SL可接受价等于触发价致触发即冻结.md) | **S2/P1** | 开仓附带 SL 的 acceptablePrice=triggerPrice（0 滑点）→ 触发即必然 Frozen，止损结构性失效、仓位只能清算（链上 revert `OrderNotFulfillableAtAcceptablePrice` 定案；持仓弹窗路径正常为对照） | open |
| [BUG-FE-MKTBOUNCE-004](../../bugs/v0.3.1/BUG-FE-MKTBOUNCE-004-选择市场被拽回锚定市场.md) | S2/P1 | 持仓会话选新市场被拽回加载时锚定市场 | **当日修复，复测通过** |
| [BUG-FE-MKTURL-002](../../bugs/v0.3.1/BUG-FE-MKTURL-002-市场切换URL不随动.md) | S3/P2 | 切回市场 URL 不随动（2/2 复现）；是否被 004 修复覆盖待复测 | open |
| [BUG-FE-OI-003](../../bugs/v0.3.1/BUG-FE-OI-003-持仓量双口径不一致.md) | S3/P2 | 选择器=币量×现价、统计条=USD 成本，同名"持仓量"双口径无标注（机制已 API 对表坐实） | open |
| [BUG-FE-IDXLAG-005](../../bugs/v0.3.1/BUG-FE-IDXLAG-005-历史记录状态更新滞后无提示.md) | S3/P2 | TP/SL 状态与历史回填滞后（波动性 2–25 分钟）且无同步提示，期间仓位消失原因不可查 | open |
| [BUG-FE-PROTPANEL-006](../../bugs/v0.3.1/BUG-FE-PROTPANEL-006-保护面板残留与联动错乱.md) | S3/P2 | 清算后保护面板残留旧 PnL >20 分钟；徽标杠杆联动表单滑条（两例复现） | open |
| [BUG-FE-TOOLTIP-008](../../bugs/v0.3.1/BUG-FE-TOOLTIP-008-撤单确认弹窗tooltip自动弹出遮挡.md) | S3/P2 | 撤单确认弹窗 tooltip 未悬停自动弹出、遮挡确认字段 | open |

观察项（未立单）：①同屏四种百分比/盈亏口径混用无标注（价格距离 % / 保证金收益率 % / 预估不含费 / Closed PnL 含费 + 亏损封顶名义值）；②Max 填充不与市场上限联动（点 Max 必报错区间）；③触发单行 Token Size 为派生值；④SL 缩量为前端显示封顶（链上不改单，语义无害）；⑤编辑弹窗预填值口径待验证（"二次提交覆盖"已裁决为用户两次操作，不立单）；⑥LINK 开仓页面币量为无点差估算。

## 三、产品语义与核对口径新知（核对手册增补）

- **费用模型（三市场 tx 级钉死）**：仓位费按市场配置（BTC/ETH 0.05%，LINK/SOL 0.075%）；**清算费 0.3% 跨市场固定**；平仓/清算仓位费按 sizeInUsd（开仓成本口径）计；Fee 列=仓位费+资金费；Closed PnL=含费净额；Net Value=Margin+PnL−平仓费预扣；清算残值返还（非全额没收）。
- **免清算保护全生命周期（单仓完整验证）**：锚定首仓链上区块时间+900s；加仓/减仓均不重置；刷新不重置；只挡清算不挡撤单；面板六态（protected→rescued→being rescued→You'll be liquidated→liquidated / Liquidatable）+ 临期 "Add Margin" 自救入口 + 到期 "Close & Reopen"；窗口 A（保护期内跌破清算价不清算）与窗口 B（到期后 44–52 秒 keeper 清算）均实测。
- **TP/SL 语义**：触发后按 oracle±impact 市价执行、reduce-only 锁定；一单触发另一单**同 tx 原子 AUTO_CANCEL**（TRD-033 链上级 PASS）；徽标 % = 保证金收益率；SL 低于清算价=警示不拦截+亏损按保证金封顶；订单编辑=同 orderKey 原地更新（Flash 中继），但编辑触发价不同步 acceptablePrice（并入 009）。
- **表单**：Max = (余额 − 1.03 固定预留) ÷ (1/杠杆 + 费率)；市价单行显示实际币量、触发单行显示派生值；默认市场 = localStorage 记忆（纯净首访 ETH/USD 与设计一致）。

## 四、风险与建议

1. **两张 S2（TPSL-007 / SLACCEPT-009）为资金语义级缺陷，建议阻断发布**：止损功能在"开仓附带"路径实质失效且订单类型被静默变更——用户以为有保护、实际只能被清算（本轮实测多损失 ≈$70/仓）。修复验证断言已写入缺陷单。
2. IDXLAG-005 + PROTPANEL-006 叠加造成"仓位去哪了"的困惑窗口，建议增加同步提示与面板复位。
3. 已修复的 MKTBOUNCE-004 复测通过；MKTURL-002 需独立复测确认是否被同一修复覆盖。

## 五、下一轮待办

- 空头镜像全链路（TRD-024/032 空侧、LMT-004/005、空头减仓/全平）；
- A 段剩余 5 条（010-014）、B 段剩余表单用例；
- TRADE-CASES 正式执行（PROT-001~005 区块时间闭环、EDIT-001~003 含弹窗预填值验证、POS 全链、LMT 矩阵）；
- 修复复测：TPSL-007 / SLACCEPT-009（按单内断言）、MKTURL-002；
- 待核对小尾巴：减仓释放抵押非对半的组成（150.89 vs 149.96）、减仓预览 Collateral 显示口径（119.56）。

> 过程记录：[OPERATION-LOG.md](OPERATION-LOG.md)（28 条）·[LIVE-LOG.md](LIVE-LOG.md)（3 班 37+ 条）·[RUN-SHEET.md](RUN-SHEET.md)·[TRADE-CASES.md](TRADE-CASES.md)；正式回填：[CHECKLIST.md](../../CHECKLIST.md)；链上取证脚本与事件数据存会话 scratchpad。

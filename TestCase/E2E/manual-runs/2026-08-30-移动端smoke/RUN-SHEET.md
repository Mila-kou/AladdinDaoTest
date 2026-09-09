# RUN-SHEET · 2026-08-30 移动端 smoke

> 状态标记：⬜ 未执行 · 🟡 执行中/有证据待回填 · ✅ PASS · ❌ FAIL（记缺陷单）· ⛔ BLOCKED。
> 证据栏：tx hash / MLOG 编号 / 截图说明；"执行人自查"或"记录员复核"按 README §4。

## P1 触发单"发出+字段"回归（与 web 轮对照）

对照基准：web 轮 LOG-068~077（四象限发出+字段全对、7 类 orderType 真成交铁证）。移动端每条只需：手机端发单 → 记录员链上核 orderType / 触发价 / acceptablePrice / sizeDeltaUsd / isLong。

| ID | 用例 | 要点 | 状态 | 证据 |
|---|---|---|---|---|
| M-P1-01 | Buy-Limit 入场（现价下方买入） | orderType=1 LimitIncrease；acceptable=参考价×(1+0.5%) | ✅ **真实成交** | MLOG-003（WETH trigger 2455，tx 0xfcc240…/0xcc74e9…；记录员链上核） |
| M-P1-02 | Buy-Stop 入场（现价上方买入） | orderType=6 StopIncrease（挂单页显示类型 = 016 观察点） | ✅ 发出+字段 | MLOG-015（XLM trig 0.19 上方,ot=6 ✓;挂单页标签截图待补=016 复测） |
| M-P1-03 | Sell-Limit 入场（现价上方卖出开空） | orderType=1；空头 acceptable 为卖出下界 | ✅ 发出+字段 | MLOG-015（XLM trig 0.19 上方,ot=1 ✓） |
| M-P1-04 | Sell-Stop 入场（现价下方卖出开空） | orderType=6 | ✅ **真实触发成交** | MLOG-013/014（NEAR trig 1.877 跌破成交 exec 1.8769；#2 走 Standard 疑似路径） |
| M-P1-05 | 持仓挂 TP | orderType=3 LimitDecrease；哨兵 long=0/short=Max | ✅ 双侧 | MLOG-004（ENA 空,Max 哨兵）/MLOG-008（LINK 多,哨兵=0）；均 autoCancel ✓ |
| M-P1-06 | 持仓挂 SL | orderType=4 StopLossDecrease；哨兵同上 | ✅ 双侧+**真实触发** | MLOG-004/008；MLOG-010：ENA SL 0.158 真实触发全平+对单 TP 同 tx AUTO_CANCEL ✓ |
| M-P1-07 | 市价开仓+市价全平（对照基线一笔） | orderType=0/2；acceptable=预估价×(1±滑点) | ✅ 完整闭环 | MLOG-001/002（开多开空）/MLOG-009（部分平）/MLOG-010（SL 全平）/MLOG-012（Max 全平,PnL +16.64,TP/SL AUTO_CANCEL ✓） |

## P2 移动端专属交互

| ID | 用例 | 挂靠 | 要点 | 状态 | 证据 |
|---|---|---|---|---|---|
| M-P2-01 | 移动端钱包连接 | — | 手机钱包注入路径；连接、切网、断开重连 | ✅ **三钱包双平台** | iOS MetaMask（0x82eD…a0a7）+ iOS Rabby（0xA700…1052）+ **Android Rabby**（0x98B4…2115,MLOG-017,执行人自查+链上补证） |
| M-P2-02 | 响应式布局核心页 | E2E-TRD-053 | trade 页/持仓列表/挂单页/弹窗，竖屏+横屏；无横向不可恢复溢出、弹窗不超屏 | 🟡 竖屏真机初验 OK（截图 139~144：布局/下单区/交易详情/持仓卡/**K 线蜡烛正常**）；横屏与弹窗待补 | 仿真预扫见 LIVE-LOG；真机截图 5 张（18:15~18:20） |
| M-P2-03 | 虚拟键盘与输入 | E2E-TRD-053 | 数量/价格输入时键盘不遮挡当前输入与提交 CTA | ❌ **BUG-FE-IOSZOOM-020**（输入聚焦自动缩放,页面裁切错位不恢复,偶发卡住,S3） | 截图 157/158/159；MLOG-007 现场 |
| M-P2-04 | 触屏手势 | SCN-063 | 列表滚动、图表缩放拖动、（如有）滑动/长按下单 | ⬜ | |
| M-P2-05 | One-Click/Flash 切换 | SCN-063 | 移动端切换入口可达、子账户签名流程完整 | ✅ | Flash：MLOG-001；Standard：MLOG-014（链上形态）+ MLOG-018（Android MM **手动切换实测**,入口可达生效）；RELAY-001 规则2"费用不足自动引导"未触发,留遗留项 |
| M-P2-06 | 移动端核心旅程一组真实提交 | **SCN-063** | 选市场→下单→TP/SL→加保证金→全平（真实广播，回填 SCENARIO-CHECKLIST) | 🟡 各环节均已真实提交（选市场✓开仓✓TP/SL✓调保证金✓调杠杆✓SL 全平✓）；待串成单笔连贯旅程后正式回填 | MLOG-001~011 |

## P3 web 缺陷/盲区移动端复测

| ID | 原单 | 复测点 | 状态 | 结论（复现/不复现/表现不同） |
|---|---|---|---|---|
| M-P3-01 | STOPTYPE-016（S2） | Open Orders 页 StopIncrease 是否仍拍平成 Limit；编辑跨市价是否自冻 | ⬜ | |
| M-P3-02 | TPSLREF-017（S2） | reduce-only TP/SL 表单边界触发价 SL↔TP 翻转 | ⬜ | |
| M-P3-03 | ACCEPTSENTINEL-018（S3） | 平空触发单哨兵非规范值 | 🟡 持仓卡路径双侧未复现（哨兵规范）；Limit 页签 RO 路径待专测 | MLOG-004/008 |
| M-P3-04 | POSCARD-013（S2） | 加仓后持仓卡即时刷新 | ✅ **复现（减仓变体,轻度）**：部分平仓后持仓卡陈旧约 10s、偶发（执行人计时）；已回写原单 013 移动端复测记录 | MLOG-009,截图 160/161 |
| M-P3-05 | PRICEFREEZE-015（S3） | 价格 feed 停更冻结不自恢复 | ⬜ | |
| M-P3-06 | PROTPANEL-006 | 保护面板移动端展示 | ⬜ | |
| M-P3-07 | TOOLTIP-008 | tooltip 在触屏上的触达方式 | ⬜ | |
| M-P3-08 | EDITACCEPT-014 | 编辑弹窗破坏哨兵 | ⬜ | |

## 数据锚点（执行时补记）

- 执行开始：2026-08-30 18:15 前后（北京）；设备 iPhone + **MetaMask App 内置浏览器（iOS）**（版本待补）。
- 钱包：`0x82edd8d98e1b1f38f159f24643f033d1cdd2a0a7`（全新，水龙头 1,000 USDC）；Flash 子账户 `0x5cccb0daccd0d414b77e7c12119866e732499147`。
- 当日参考价：BTC ~78,000 / ETH ~2,455 / LINK ~11.35-11.38 / ENA ~0.1574。

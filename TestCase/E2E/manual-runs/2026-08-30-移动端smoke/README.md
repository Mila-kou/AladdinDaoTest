---
project: fx100
layer: e2e
type: manual-run-session
title: fx100-dev 移动端人工 smoke 执行会话
date: 2026-08-30
target: https://fx100-dev.vercel.app/trade?market=BTCUSDC（手机浏览器）
status: round-1-in-progress（2026-08-30 开辖；承接 web 端收口文档《../2026-08-28-基本功能smoke/测试覆盖度-web端.md》§六 移动端交接）
---

# 2026-08-30 移动端人工 smoke 执行会话

> 承接 2026-08-30 web 端收口：本轮在**真实手机**上对 fx100-dev 交易页做移动端测试。
> 分工：**人工执行**（执行人在手机浏览器操作 + 手机钱包签名）+ **记录核对**（Claude 记录员，通过链上 RPC 取证核对交易字段、桌面端移动视口仿真做布局对照与复现，回填台账）。
> 本会话只新增文档，不改动 TestCode 工程与既有用例文档；正式结果回填 CHECKLIST / SCENARIO-CHECKLIST 于轮次收口时进行。

## 1. 范围（来自 web 端交接 §六）

**平台无关、移动端继承（不重验）**：orderType 语义（0-6）、acceptablePrice 哨兵规则、fee/funding/PnL/清算价公式、清算判定、AUTO_CANCEL、保护机制——合约决定，web 轮已链上级验证。移动端只核**发出的交易字段正确**即等价。

**本轮三个优先级**：

1. **P1 触发单"发出+字段"回归（与 web 对照）**：手机端发 LimitIncrease / StopIncrease / TP(LimitDecrease) / SL(StopLossDecrease) 各象限，记录员链上核 orderType / 触发价 / acceptablePrice / sizeDeltaUsd 等字段与 web 轮结论一致。
2. **P2 移动端专属交互**：钱包连接注入路径、响应式布局（含横屏）、触屏手势、小屏字段可见性与预览区、虚拟键盘遮挡、One-Click/Flash 切换。正式用例挂靠 SCN-063（S06 移动端核心旅程）与 E2E-TRD-053（移动端与横屏布局）。
3. **P3 web 缺陷/盲区移动端复测**：STOPTYPE-016 / TPSLREF-017 / ACCEPTSENTINEL-018（触发单类型派生/显示层）、POSCARD-013（持仓卡即时刷新）、PRICEFREEZE-015、PROTPANEL-006、TOOLTIP-008、EDITACCEPT-014。

选案与逐条状态见本目录 [RUN-SHEET.md](RUN-SHEET.md)。

## 2. 被测环境快照

| 项 | 值 | 来源 |
|---|---|---|
| 前端 | https://fx100-dev.vercel.app（Vercel dev 部署，同 web 轮） | — |
| 链 | Base Sepolia，chainId **84532**（真网） | 同 web 轮勘察 |
| 合约部署 | v0.3.1 部署 260729（EventEmitter `0x8f00eBF8f571557685eEeAA2807Ecac396c3b380`、LiquidationHandler `0x40a99db1…`） | web 轮档案 §2/§五 |
| 执行钱包 | `0xEEeA43701a49F3d41EF694DdAFe2Ac74C7C8B119`（owner；Flash 子账户 `0x1446bf6F…cb92`） | web 轮档案 |
| 执行设备 | 执行人手机（型号/系统/浏览器/钱包 App 执行时补记） | 待补 |

## 3. 观察与记录通道（与 web 轮的差异）

- 执行人：手机浏览器操作 + 手机钱包签名；通过手机上的 Claude App 接入本 session 汇报步骤/结果，关键界面**手机截图直接发进会话**作证据。
- 记录员（Claude）：
  - **主核对通道 = 链上取证**：只读 RPC（sepolia.base.org）解码 EventEmitter 事件，核每笔订单字段与事件序列（脚本承自 web 轮 scratchpad forensics 套件 + `TestCode/tools/fx100-legacy`）。
  - **布局对照通道 = 桌面移动视口仿真**：内置浏览器 375×812 / 390×844 / 812×375 仿真预扫与复现（标注"仿真"，不替代真机对虚拟键盘/手势/钱包注入的判定）。
- 私钥零接触：Claude 不触碰私钥/助记词，不代发交易；签名全部由执行人在手机钱包完成。

## 4. 执行判定与证据规则（继承 web 轮 §5）

- 功能错误/超容差 FAIL；依赖故障且正确降级 BLOCKED；链上写操作必记 tx hash（记录员从 RPC 自动补齐）；FAIL 必须截图+区块号。
- 执行人报 PASS 直接标注，证据栏记"执行人自查"；记录员顺手可证的补双证。
- 触发单类用例沿用 web 轮口径：**前端能真实发出且链上字段全对 = 功能覆盖 PASS**，不强制等真实成交。
- 缺陷按 `fx100-BUG-NNN` 落 [../../bugs/v0.3.1/](../../bugs/v0.3.1/)；移动端复现 web 已知缺陷不开新单，在原单补"移动端复现/不复现"记录；移动端专属新缺陷开新单。

## 5. 台账文件

- [RUN-SHEET.md](RUN-SHEET.md) — 选案台账（P1/P2/P3 逐条状态回填）
- [OPERATION-LOG.md](OPERATION-LOG.md) — 逐笔链上核对（MLOG-001 起编）
- [LIVE-LOG.md](LIVE-LOG.md) — 实时观察底稿

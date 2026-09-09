---
name: fx100-verify-handbook
description: FX100 数据核对知识手册（公式、取整、费用路由、部署事实与核对陷阱；主测基线以 Docs/contract-releases/CURRENT.json 为准）。本 skill 是汇总层（精粹 + 指路 + 陷阱），详解层是工作区 TestCase/E2E/ContractCodeSummary/<release>/ 的核心 / 前端 / Keeper 公式文档。Use whenever the task involves FX100 verification in this workspace — 数据核对 / 深度核对 / 核对公式 / Expected Δ / 守恒 / ΣΔ / 账本 / ledger / execution-evidence / reconciliation / SCN-009 / SCN-010 / SCN-070 / TestCode 核对重构 / 手续费公式 / 资金费 / funding / settleFundingFees / 执行价 / 动态点差 / dynamicSpread / 取整方向 / 清算价 / Path A Path B / leverage 公式 / PnL / 支付瀑布 / claimable / FeeHandler / RevenuePool / 费用路由 / DataStore key / v0.3.2 差异 / 版本差异 / 需求差异台账 / 汇总层 详解层 — even if none of these words appear but the task requires computing expected on-chain values for fx100 positions/fees/funding/PnL, designing reconciliation checks, reading DataStore/event fields, or deciding which layer (contract / frontend / Keeper) a formula belongs to. 与 Test/standards 冲突时以 standards 为准；本 skill 只提供领域知识。工程操作（环境/跑批/看板/记录管理）见隔壁 skill fx100-testcode-ops。
---

# FX100 核对手册

> 当前主测基线以 `Docs/contract-releases/CURRENT.json` `primary` 为准（不在此复述版本号）。本手册两张事实卡：[v032-facts.md](references/v032-facts.md) 对应当前 `primary`，[v031-facts.md](references/v031-facts.md) 是 @v0.3.1 快照（`comparison`，仅作对比）；未在 `primary` 复核的内容不得直接作为断言。给出任何公式、费用路由或 key 签名前，必须回 `primary.repoPath` 源码复核；行号仅供定位，以函数名为准。
>
> **分层与同步方向**：本 skill 是**汇总层**（精粹 + 指路 + 陷阱，必须短）；**详解层**是工作区 `TestCase/E2E/ContractCodeSummary/<release>/`（核心字段计算公式 · 前端代码公式 · Keeper 代码公式，已过三轮对抗复核）。同步永远是 源码 → 详解层 → 汇总层；本手册每条结论以 `→ 核心 §x.y` / `→ 前端 §x` / `→ Keeper §x` 指回出处，与详解层矛盾时**以详解层为准**。

## 一句话核心事实

1. **合约没有"杠杆"变量**：只有 `净抵押 ≥ sizeInUsd × minCollateralFactor` 约束（`PositionUtils.isPositionLiquidatable`）。因子由 `forLiquidation` 入参决定、不是"清算 vs 正常"二分：开仓/加仓校验 MIN_COLLATERAL_FACTOR，清算 gate 与**纯加保证金（sizeDeltaUsd==0）**走 MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION，减仓收尾（剩余仓位非零）又用 MIN_COLLATERAL_FACTOR；合约不校验两键大小关系 → 核心 §11.2/§11.3。杠杆全是前端派生显示量 → 前端 §4。
2. **交易执行时协议费不动钱**：只记 DataStore `claimableFeeAmount`（USDC 物理留 PositionVault）；LP 份额当场物理转 LPVault；FeeHandler 与 FEE_RECEIVER 的余额要到 claimFees/withdrawFees 才动 → 核心 §7.5/§10.7（路由三段 @v0.3.1 快照见 v031-facts.md §1——**ΔFeeReceiver 这个名字在本仓看板里圈的其实是 FeeHandler**）。**Funding 现金流（当前 primary）**：`updateFundingState` 只刷 per-size 指数 / `fundingUpdatedAt` / skewEMA 并发 `Funding` 事件、**不产生 LP 现金流**；现金流由 `MarketUtils.settleFundingFees` 在仓位结算时按该仓 `negative − positive` **净差**执行——净付只记 FUNDING_FEE_TYPE 可领（钱留 PositionVault）、净收才 LPVault→PositionVault 转出，LP 只单向出钱；**加仓传应付额、减仓传实付额 `amountPaidInCollateralToken`**；`positionPaysLp` 仅 observability，不得据此推任何 Vault 余额 → 核心 §10 首段/§10.6/§10.7、§22.2。
3. **bit 级重算四根基**：BigInt 向零截断==EVM 整除；**同序复刻**（截断在每一步，重排乘除即差 1 wei）；事件为权威值来源；快照所有读数 pin 同一 blockNumber。
4. **取整总原则**：对 trader 不利、护池/护协议（买贵卖贱、付费进位、收款舍尾）。
5. **静默取消是头号陷阱**：OrderHandler try/catch 取消不 revert——"订单离队"≠"执行成功"，每个 TX 第一件事是判别 Executed/Cancelled/Frozen 并解码 reasonBytes。
6. **发单资金前置校验（务必遵守）**：前端/脚本发交易前必须保证 `collateral + relayFee + 开仓费(+关仓费预算) < USDC 余额`（严格小于、留余量）。机理：普通模式 Pay = Collateral + 开仓费一次性 sendTokens 转出；Flash/relay 模式另加 relayFee（**USDC 计价**，按 gas×ETH 价折算、约 30s 刷新会浮动，故必须留 buffer）；关仓费虽从平仓所得扣、不预付，但计入预算才能保证全流程不因余额卡壳。余额不足的失败形态：创建时 transferFrom revert（干净失败）或 relay 链路签名后失败——都会产生"无订单/无事件"的空转用例。把余额预检写进用例前置条件。
7. **开仓规模按含点差 executionPrice 定案**：`getIncreaseOrderSize` 用裸 index 价算出的那一对只是喂 `getDynamicSpread` 的预解析中间量；拿到点差后 USD 模式覆盖 token 数（多 ⌊USD/execPrice⌋ / 空 ⌈USD/execPrice⌉）、token 模式覆盖 USD（tokens×execPrice 纯乘无取整），primary 与 comparison 皆然——拿预解析值当期望会系统性偏离一个点差比例 → 核心 §3.1/§4.5。
8. **清算判定是不等式，不是价格**：合约无清算价字段与函数，"清算价"是对 `isPositionLiquidatable` 不等式按 index 价的代数反解（T2 派生量；多 ⌈⌉/空 ⌊⌋；精确边界只能 Reader 二分，且两个布尔入参须与复现的链上路径配对；`sizeInTokens` 标度按 index token 登记 decimals，不得写死 1e18）→ 核心 §18 首段/§18.1/§18.2/§18.3。判定用**含点差的清算成交价**（合成订单 orderType=Liquidation、负点差下限抬 0）、成本**不含清算费**、**正 funding 计入**净抵押；当前 primary 新增 `balanceWasImproved` 进判定 → 费档切换 → 阈值随 OI 移动 → 核心 §11.1/§18.4。各界面 **Path A（SDK）优先**，仅下单预览与杠杆弹窗有 Path B 兜底，按"这一次实际取到哪条"取基准，Path B 永不作 parity 基准 → 前端 §6、核心 §18.5。
9. **减仓有七处订单自动改写**（超仓夹紧 / sizeDeltaUsd 放大整仓（当前 primary 新增）/ 抵押夹紧 / 提取额先加回再置 0 / 两级升级全平 / **全平时 initialCollateralDeltaAmount 强制置 0 且不发事件**）：期望值必须按改写后的值算，改 `sizeDelta` 的步骤都会重跑 `getDecreaseOrderSize`，全平后"用户主动提取额"恒为 0 → 核心 §5.2。

## 知识地图

| 你在做什么 | 读哪里 |
|---|---|
| 算/核任何期望值（零和、执行价、点差、size↔token、资金费、手续费、PnL、瀑布、leverage、清算价、取整速查） | [references/formulas.md](references/formulas.md) |
| 写核对代码/断言前防踩坑（双 key 编码、orderType 枚举、原子快照、execBlock−1、事件自证、同序复刻…） | [references/traps.md](references/traps.md) |
| **查当前 `primary` 相对 @v0.3.1 影响核对的变更（结算资金流 / 计算结果 / 事件 ABI / 配置键 / 校验回退）** | [references/v032-facts.md](references/v032-facts.md)；差异全文 → 核心 §22（计算结果 / 结算资金流 / 事件 ABI / 配置键 / 校验回退 五类逐条） |
| 查历史 v0.3.1 费用路由、key 签名、部署地址（@v0.3.1 快照，仅作对比，使用前在 CURRENT `primary` 复核） | [references/v031-facts.md](references/v031-facts.md) |
| **任何 `→ 核心 §x.y` 指针的出处**：合约层公式详解（精度 / oracle / 订单换算 / 点差 / 仓位更新 / PnL / 费用 / 清算费 / funding / 清算判定 / ADL / LP Vault / 执行费 / relay / 订单与仓位字段 / 清算价 / 展示字段 / §22 版本差异 / §23 E2E 预期值计算顺序） | 工作区 `TestCase/E2E/ContractCodeSummary/<release>/FX100-核心字段计算公式.md`（A 级，绑定 `primary.head`） |
| **前端 / Keeper 自己算的公式**（页面口径、杠杆 → 前端 §4、清算价 Path A 优先 / Path B 兜底 → 前端 §6；oracle 报文选择按侧挑极值而清算/ADL 取最新有效 → Keeper §1.2、relay gas 只管 limit 与 WNT 充足性而 relayFee 金额在 SDK → Keeper §3/§8、近似清算价 → Keeper §4、`evaluateTrigger` 为遗留路径 → Keeper §7…）与三层权威等级 | 同目录 `FX100-前端代码公式.md`（B 级）· `FX100-Keeper代码公式.md`（K1/K2）· `FX100-功能用例公式与核对依据索引.md` §0 三层与权威等级 |
| 「实现 ≠ 需求设计意图」的线索（全部为候选、**未复核**；不得据此直接立缺陷单；公式本体不收这些） | 同目录 `FX100-需求与实现差异台账.md` |
| Funding / dynamicSpread / Liquidation / ADL 单主题**完整生命周期**（参数→状态机→Keeper/Reader 预检→执行→事件→边界值→证据清单；经审计） | 工作区 `TestCase/E2E/versions/<release>/` 的 `Funding-(<release>).md` · `dynamicSpread-(<release>).md` · `Liquidation-(<release>).md` · `ADL-(<release>).md` |

## 三层权威等级（断言前先确认引的是哪一层）

| 层 | 等级 | 能否作断言基准 |
|---|---|---|
| 合约 | **A** 链上最终标准 | **是**，0 容差（需同序复刻） |
| 前端 SDK / App | **B** 派生显示量 | 否。只验"算法与合约约束等价" |
| Keeper 决定型（oracle 报文选择、relay gas limit、时间窗） | **K1** 输出进入链上输入 | 否，但**它是实际值的组成部分**——期望执行价必须用事件里的 oracle 价，或复刻 Keeper 的报文选择 |
| Keeper 筛选型（近似清算价、候选排序、触发预筛） | **K2** 只影响调度 | **否**，只验"不漏"；用例 FAIL 时作归因候选 |

**三层不要求相等**：前端预估接近合约边界 · Keeper 不遗漏风险仓位 · 最终是否清算完全以合约 `Reader.isPositionLiquidatable` 为准。公式本体与归因表见上表指向的三份文档。

## 使用纪律

- 期望值**独立重算**，禁抄合约/事件输出当期望（幽灵内容零容忍，工作区规则 3）；确实无法独立时明确标注证据等级（恒等式/事件锚定），不冒充独立重算。
- 缺参数或公式未实现 → `NOT_VERIFIED`，不能倒推 PASS。
- 每条公式声明取整方向与容差（0 容差需同序复刻为前提）。

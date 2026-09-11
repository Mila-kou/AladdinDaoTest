# FX100 持仓面板数字口径统一规范（Margin / Net Value / Leverage / uPnL / Funding）

> Notion 页面：[原文](https://app.notion.com/p/39b3d7873f2c810ebc9cc5bc2a0efbe5)
> 作者：Gordon（fx100-sync 同步渠道，内容出自 Gordon）
> 创建时间：2026-07-15
> 最后编辑：2026-07-15
> 归档日期：2026-08-30
> Notion 路径：AladdinDAO 工作台 / 产品 / FX100 / 技术相关 / 合约 / 🧪 测试用例
> 类型：设计文档（前端数据口径）

# FX100 持仓面板数字口径统一规范（Margin / Net Value / Leverage / uPnL / Funding）
> **这是"持仓列表每个数字是什么、怎么算、为什么这么算"的唯一参考文档（单一事实来源）。** 与 ``FRONTEND_OPEN_CONTROLS.md``（管"这单能不能成交"）互补：那篇管**下单前**，本篇管**持仓后面板显示口径**。 - **业务/运营**：看 §0 速查表 + §7 FAQ。有人质疑"这个数字为什么和 Binance 不一样"，答案都在 §2/§3。 - **前端开发**：看 §4 正式定义（每列的公式、tooltip 文案要点）+ §5 一致性矩阵 + §8 实施清单。 - **测试**：§5 一致性矩阵就是核对清单——任何两处出现同一个词但数字对不上，即为 bug。 **决策日期**：2026-07-12 初稿；**2026-07-14 净额修订**——Margin 与杠杆分母由"只扣待付资金费"改为"资金费净额"（应付扣、应收加），依据 = 合约每次仓位操作两侧都真实结算进保证金；合约清算判定的配套修复提案已交工程师（§10）。**合约基线**：`release/v0.3.0`（测试分支 `docs/testing-standards` 的 `src/` 与之逐字节一致），file:line 均指该基线。 **背景**：原需求"Margin 列扣除 Unrealized PnL 和 funding"存在歧义且与弹窗/杠杆口径冲突（详见 §1），经分析后按本文口径定稿。
---
## 0. 一页结论（速查表）
fx100 每个仓位有独立保证金，等同 CEX 的**逐仓（Isolated Margin）模式**，所有对比均在逐仓口径下进行。
| 列名 | 公式 | 一句话语义 | 变更 |
|---|---|---|---|
| **Margin** | `链上抵押品 + 资金费净额`（= 抵押品 − 待付 + 应收） | 我放进去、经资金费**真实结算**后还属于这个仓位的保证金 | 🔧 改（07-12 版只扣待付，**07-14 修订为净额**，见 FAQ Q10） |
| **Net Value**（新增） | `Margin + uPnL − 平仓手续费` | 现在全平**大概能拿回多少**（≈净值/equity） | 🔧 新增列（金额与 07-12 版相同，应收行并入 Margin） |
| **Leverage** | `仓位价值 ÷ Margin` | 实际杠杆倍数 | 🔧 分母随 Margin 同步为净额（07-14） |
| **Unrealized PnL** | `(标记价 − 开仓均价) × 仓位数量`（毛盈亏） | 价格波动带来的浮动盈亏 | ✅ 不变 |
| **Funding** | `应收资金费 − 应付资金费`（净额） | 资金费累计净流向 | ✅ 不变 |
**核心关系式（每一项都在面板列或 tooltip 明细里可见，用户无需脑补）**：
```plain text
Margin    = 链上抵押品 − 待付资金费 + 应收资金费   （= 抵押品 + 资金费净额）
Net Value = Margin + Unrealized PnL − 平仓手续费
Leverage  = 仓位价值 ÷ Margin
```
**语义分工**：Margin 回答"我投入的钱经资金费真实结算后还剩多少本"，Net Value 回答"现在全平能拿回多少"。两个问题、两个数字、两个表头，互不越界。
---
## 1. 为什么要改：问题背景
**现状（改前）**：Margin 列直接显示链上原始抵押品 `collateralUsd`（`Positions.tsx:161-163`），什么都不扣；而杠杆列的分母是 `抵押品 − 待付资金费`（已定稿口径，见 §4.3）。于是用户拿 `仓位价值 ÷ Margin列` 手算杠杆，和杠杆列**永远差一个资金费**。
**曾提出的方案**："Margin 列扣除 uPnL 和 funding"（即显示净值）。该方案被否决，理由有五：
1. **名实不符**——扣完 uPnL 之后那个数是"净值（equity）"不是"保证金"，行业惯例两者分列展示（GMX 的 Collateral + Net Value 双列即是）。
2. **与 Adjust Margin 弹窗自相矛盾**——弹窗操作的是链上真实抵押品，列表显示净值会造成"同一个词两个数字"。
3. **与杠杆列口径冲突**——杠杆分母不含 uPnL，Margin 若含 uPnL 则 `size ÷ Margin` 与杠杆列对不上。
4. **信息重复**——同一行里 PnL、Funding 列还在，用户心算"保证金+盈亏"会把 PnL 重复加一次。
5. **负数歧义**——净值可为负（穿仓），"负保证金"在视觉与语义上都需要额外规范。
**最终决策**：Margin 按**资金费净额**结算（应付扣、应收加，**不碰 uPnL**），另加 Net Value 列承载"净值"语义。这样上述五个问题全部消解（§4 逐条说明），且与 GMX v2 / Binance 的分列做法一致（HL 逐仓走的是另一条路——把 uPnL 直接计入保证金合成一个数，我们不跟，理由见 §3）。（07-12 初版只扣应付、07-14 修订为净额，演变过程见 FAQ Q10。）
---
## 2. 各交易所怎么做（同为逐仓口径对比）
|  | **Binance（U 本位逐仓）** | **Hyperliquid（逐仓）** | **GMX v2** | **FX100（本规范）** |
|---|---|---|---|---|
| **资金费结算方式** | 每 8 小时**真实划转**，直接从逐仓保证金余额扣/加 | 每 1 小时**真实划转**，直接结算进保证金 | **挂账（pending）**，到下次仓位操作（加减仓/调保证金/平仓/清算）时才真实结算 | 同 GMX：挂账，操作时结算 |
| **Margin 列显示** | 逐仓保证金余额（历史资金费**已经在里面**，因为已真实划转；**uPnL 不在里面**，单独列示） | 逐仓保证金**含 uPnL**——官方文档明言 "isolated positions will apply unrealized pnl as additional margin for the open position"，浮盈还可在余量 ≥10% 名义价值时提走 | Collateral 列 = 抵押品 − 待付资金费/借贷费（GMX 应收走 claimable 不进抵押品，故只扣不加） | **Margin = 抵押品 + 资金费净额**（应付扣、应收加，tooltip 展开明细）——fx100 应收也进保证金，净额才等价 |
| **uPnL** | 单独列，标记价毛盈亏 | 单独列，标记价毛盈亏（同时已计入 margin，见上行） | 单独列，标记价毛盈亏（tooltip 提供 after-fees 版本） | 单独列，标记价毛盈亏（不变） |
| **净值列** | 无独立列（有保证金率/维持保证金） | 无独立列（**margin 本身已是净值语义**） | **Net Value 列** = 抵押品 + 标记价 PnL − 各项费用 | **Net Value 列** = Margin + uPnL − 平仓手续费 |
| **清算判定输入** | **含 uPnL**——官方清算公式 "Collateral = Initial Collateral + Realized PnL + Unrealized PnL < Maintenance Margin" | 逐仓保证金（已含 uPnL）vs 维持保证金——官方文档："the only inputs to the computation are the isolated margin and the notional value" | 抵押品 + **执行价 PnL** − 全部费用（equity）vs 门槛 | 同 GMX（`PositionUtils.sol:378-406`，§4.2 详述） |
| **浮盈能否直接提走** | ❌ 不能——逐仓可移出的只是超出初始保证金的已分配部分，浮盈须平仓才实现（浮亏会减少可移出额度） | ✅ 能——余量 ≥10% 名义价值时可提取未实现盈利 | ❌ 不能——uPnL 不并入抵押品，平仓才结算 | ❌ 不能——同 GMX |
**读表关键**：Binance/HL 的 Margin 列"看起来不扣资金费"，**不是展示策略，而是结算节奏的产物**——它们的资金费每小时/每 8 小时已经真金白银划走了，保证金余额里天然不存在"挂账未付"的部分。链上合约（GMX/FX100）做不到每小时给所有仓位结算（gas 成本），所以资金费是挂账的——这笔钱**已经欠下、下次任何仓位操作时必然被扣**，只是链上数字还没动。
---
## 3. 为什么不能和 Binance / Hyperliquid 完全一样（最常被问）
**一句话答案：结算模型不同——CEX 的资金费是"已结算的现金流"，链上是"挂账的应付款"。想让 Margin 和 CEX 语义一致，恰恰必须扣掉待付资金费，而不是照抄"显示原始数字"。**
推演给业务同学看：
- Binance 用户的逐仓保证金 100 USDT，过了 24 小时付了 3 USDT 资金费 → 交易所里那笔钱**真的走了**，Margin 列显示 **97**。
- FX100 用户抵押品 100 USDC，同样欠了 3 USDC 资金费 → 链上数字还是 100（要到下次操作才划走），但这 3 USDC **已经不属于他了**——补保证金、减仓、平仓，任何一个动作都会先把它扣掉（实测验证：调整保证金时合约先结算资金费，见清算边界测试记录）。
- 如果 FX100 的 Margin 列显示 100，用户拿它和 Binance 的 97 对比，会**高估自己的保证金**；显示 97 才是和 CEX 等价的语义。
所以本规范的 `Margin = 抵押品 + 资金费净额`，本质是**把挂账资金费（两侧）视同已结算**，主动对齐 CEX 逐仓的 Margin 语义——Binance 的资金费本来就是**双向**划入/划出保证金余额的，只扣应付不加应收反而不等价。GMX v2 的 Collateral 列只扣不加，那是因为 GMX 的应收走 claimable、不进抵押品；fx100 两侧都进保证金（§4.1 合约依据），净额才是忠实口径。
**Hyperliquid 是单独一档，不能混为一谈**：HL 逐仓比 Binance 更激进——官方文档明确"isolated positions will apply unrealized pnl as additional margin for the open position"（浮动盈亏直接计入逐仓保证金，浮盈在余量 ≥10% 名义价值时甚至可以提走）。所以交易员说"HL 的 Margin 含 uPnL"是**对的**。这相当于把我们的 Margin 和 Net Value **合成一个数**。我们不跟 HL 的理由，就是 §1 否决"Margin 扣除 uPnL"方案的那五条：合成数与 Adjust Margin 弹窗（操作真实抵押品）冲突、与杠杆分母（不含 uPnL）冲突、和独立的 uPnL 列信息重复。HL 没有这些矛盾是因为它的产品整体围绕"margin=净值"设计（杠杆、提取、清算全套跟着这个口径走）；我们的合约结算模型（GMX 系）做不到，硬抄只会抄出内部不一致。**分列展示（Margin + Net Value）在信息上与 HL 完全等价，只是拆开放**。
**次要差异（脚注级）**：部分平仓的已实现盈亏，Binance 逐仓会计入保证金余额，FX100/GMX 则直接出金到用户钱包、不留在仓位里。这也是结算模型差异，不影响本文口径。
---
## 4. 正式定义（逐列规范）
### 4.1 Margin 列 🔧
```plain text
Margin = 链上抵押品(collateralUsd) − 待付资金费 + 应收资金费
       = 链上抵押品 + 资金费净额
```
- **tooltip（必带）**，两行明细 + 一行说明：
```plain text
  链上抵押品              100.00 USDC
  待结算资金费（净额）     −2.00 USDC    ← 应付 −3 + 应收 +1
  ─────────────────────────
  Margin                  98.00 USDC
  挂账资金费将在下次仓位操作时自动结算（应付扣、应收加）。
```
- **为什么按净额（2026-07-14 修订）**：fx100 的资金费**应付、应收两侧都直接结算进保证金**，无需用户领取（增仓路径 `IncreasePositionUtils.sol:240`、减仓/清算路径 `DecreasePositionCollateralUtils.sol:132` 都有 `+= positiveFundingFeeAmount`；GMX 原版的 claimable 领取通道在 fx100 是遗留死键，`CLAIMABLE_FUNDING_AMOUNT` 无任何写入方）。两侧都是"下次操作必然入账/扣账"的**确定性挂账**，只扣一侧就不是真实的保证金——**净额才忠实于结算**，也与 Binance 逐仓（资金费双向划入保证金余额）语义等价。应收大的仓位 Margin 可以**大于**存入本金，属正常（赚了资金费）。
- **与合约清算判定的临时差异（重要）**：现行合约判定只扣应付、不计应收（GMX 语义漂移遗留——判定与结算不一致，导致有应收挂账的仓位被**提前**清算），修复提案已交合约工程师（§10）。修复合入前，**判定恒比 Margin/Net Value 读数保守**（少算应收），Liquidatable 徽章与清算价仍以合约为准——只会早清算、不会漏清算。
- **负数规则**：资金费净额为深度负值且超过抵押品时（长期不动的重亏付费仓位），显示真实负数、不钳制——负 Margin 本身就是强清算信号，且此时 Liquidatable 徽章必然已亮。
- **数据源**：`posInfo.collateralUsd − posInfo.pendingFundingFeesUsd + posInfo.pendingPositiveFundingFeesUsd`（三字段均已存在，`Positions.tsx:66,78`）。
### 4.2 Net Value 列（新增）🔧
```plain text
Net Value = Margin + Unrealized PnL − 平仓手续费
          = 抵押品 + 资金费净额 + 标记价毛盈亏 − 平仓手续费
```
- **语义**：现在全平这个仓位，大概能拿回多少钱；也是"离清算多远"的直观读数。
- 资金费两侧已全部并入 Margin（§4.1），本列**不再单列应收行**——三行明细直接相加即得。金额与 07-12 版完全相同（应收只是从单列行移进了 Margin，总和不变）。
- **tooltip（必带）**：
```plain text
  Margin            98.00 USDC
  未实现盈亏        +20.00 USDC
  平仓手续费        −2.00 USDC
  ─────────────────────────
  Net Value        116.00 USDC
  全平实际到手金额以平仓预览为准（含点差，略低于此值）。
```
- **与合约清算量的关系（精度声明，测试必读）**：合约清算判定用的 equity（`remainingCollateralUsd`）和本列公式结构相同，但有**两处口径差**：① PnL——合约用**全平执行价**（含动态点差与价格冲击，`PositionUtils.sol:344-348`），本列用**标记价**（与 uPnL 列同源），设计差异、永久保留；② 应收资金费——现行合约判定**不计**（遗留 bug，修复提案已交工程师，§10），本列计（如实反映结算）——此差异为**临时**，修复合入后消失。两处差异都使清算引擎比 Net Value **更保守**（实际清算线先于 Net Value 读数到达）。选标记价口径的理由：① 保证 `Net Value = Margin + uPnL − 平仓费` 三行**可见可加**，内部零歧义；② GMX v2 的 Net Value 同为标记价口径，行业先例一致。**清算真值以 Liquidatable 徽章和清算价为准**（它们按合约口径算），Net Value 是导航仪不是判决书。
- **负数规则**：允许负数，不钳制。负 Net Value = 穿仓，与 Liquidatable 徽章同屏出现是**正确且自洽**的组合（对应合约 `remainingCollateralUsd ≤ 0` 清算门，即 OC-14，`PositionUtils.sol:400-402`）。
- **清算三道门对照**（用户看 Net Value 逼近哪条线）：合约按 equity 依次检查 ① `< MIN_COLLATERAL_USD`（当前配置为 0，等效跳过）② `≤ 0`（穿仓）③ `< 仓位价值 × 清算保证金因子`（最大杠杆线，最常触发），见 `PositionUtils.sol:393-406`。
### 4.3 Leverage 列 ✅ 不变
```plain text
Leverage = 仓位价值(sizeInUsd) ÷ Margin列    （分母 = 抵押品 + 资金费净额，07-14 随 Margin 同步）
```
- **实施注意（07-14）**：SDK 的 `getLeverage` 现在只扣应付（`pendingFundingFeesUsd`），需同步加应收，否则 SDK `leverage` 字段（TP/SL 弹窗、OrderForm、保护浮层在用）会与列表杠杆分叉。
- 该口径（**含资金费、不含 uPnL**）为既有定稿决策（2026 年 6 月底"杠杆/PnL 显示口径决策"，GMX/HL/FX100 三方对比后确定维持算法不变+加 tooltip，Notion 页 `3913d787`）。
- **本次改动的红利**：Margin 列改口径后，杠杆分母**恰好等于** Margin 列——用户手算 `仓位价值 ÷ Margin` 与杠杆列严丝合缝，原先"差一个资金费"的对不上问题自动消失。杠杆 tooltip 可同步简化为"仓位价值 ÷ Margin"。
- 为什么不含 uPnL：含 uPnL 的杠杆会随价格每秒跳动，且"盈利越多杠杆越低"对风险提示是反直觉的；Binance 逐仓列表显示的是**用户设定杠杆**（也不随 uPnL 变），HL 提供两种口径切换。FX100 选定"实际占用杠杆、不含浮盈浮亏"，tooltip 已说明。
### 4.4 Unrealized PnL 列 ✅ 不变
```plain text
uPnL = (标记价 − 开仓均价) × 仓位数量    （毛盈亏，不含任何费用与点差）
```
- 数据源为列表 oracle 标记价（`state/derived/positions.ts:57-69`），与 K 线/价格面板同源，保证"价格动、PnL 动"直观一致。
- **为什么是毛盈亏**：Binance、HL、GMX 默认列均为毛盈亏，费用在平仓预览里给净额——这是行业通用分层："浮盈浮亏看列表，实际到手看平仓弹窗"。
- 平仓相关的净额（含点差、手续费、资金费结算）由 Close 弹窗的执行预览给出，口径为**执行价**（比标记价保守），两者差异属预期行为，非 bug。
### 4.5 Funding 列 ✅ 不变
```plain text
Funding = 应收资金费 − 应付资金费    （净额，带正负号，均为挂账待结算值）
```
- 与 Margin 的关系（07-14 起口径统一）：Funding 列的净额与 Margin tooltip 里"待结算资金费（净额）"是**同一个数**。本列的价值在 tooltip 的 Owed/Earning 分解与累计视角，帮助用户理解净额的构成。
---
## 5. 全项目一致性矩阵（测试核对清单）
> 原则：**同一个词在任何界面必须是同一个数**。下表任何一行对不上 = bug。
| 位置 | 显示内容 | 口径 | 备注 |
|---|---|---|---|
| 持仓列表 Margin 列 | 抵押品 + 资金费净额 | §4.1 | tooltip 展开两行明细（净额行 = Funding 列同数） |
| 持仓列表 Net Value 列 | Margin + uPnL − 平仓费 | §4.2 | 标记价口径；移动端可折叠进详情区 |
| 持仓列表 Leverage 列 | size ÷ Margin | §4.3 | 与 Margin 列直接可验算 |
| 持仓列表 uPnL / Funding 列 | 标记价毛盈亏 / 资金费净额 | §4.4 / §4.5 | 不变 |
| **Adjust Margin 弹窗** | "当前保证金"须与列表 Margin 列**同数**（净额口径），待结算资金费净额单独明细行 | §4.1 | 链上执行时资金费两侧都先结算再加减抵押品，净额口径下**操作后余额预估 = Margin + Δ**（干净的加法），与链上结果一致 |
| Adjust Leverage 弹窗 | 当前/目标杠杆 = size ÷ Margin | §4.3 | 与列表杠杆列同源 |
| Close 弹窗（平仓预览） | 预计到手 = 按**执行价**模拟全流程（结算资金费+扣费+点差） | 执行价口径 | 预期 ≈ Net Value 且略低（差全平点差）；差异过大才是 bug |
| Liquidatable 徽章 / 清算价 | 合约 `isPositionLiquidatable` 口径（执行价 equity 三道门） | §4.2 | 清算真值；Net Value 为负时徽章必亮 |
| GitBook 交易指南（中/英） | 本文 §0 速查表 + §7 FAQ 摘编 | — | 【强制】中英文同步修改 |
| 前端自动化核对（scrapePanel / FRONTEND_VERIFICATION） | 按本表逐格核对 | — | Margin/NetValue 两列加入 bit-exact 断言（标记价口径可精确复算） |
---
## 6. 数字示例（一个仓位走全程）
用户存入 **100 USDC**，10 倍开多，仓位价值 **1000 USD**。平仓手续费率按 0.2% 计（示例值）。挂账资金费：应付 3、应收 1（净额 **−2**）。
**T1：价格 +2%**
| 列 | 计算 | 显示 |
|---|---|---|
| Margin | 100 − 3 + 1 | **98.00** |
| uPnL | 1000 × 2% | **+20.00** |
| Net Value | 98 + 20 − 2 | **116.00** |
| Leverage | 1000 ÷ 98 | **10.20x** |
| Funding | 1 − 3 | **−2.00**（= Margin tooltip 净额行，同数） |
用户此刻点 Adjust Margin：弹窗显示当前保证金 98.00（与列表一致）；若补 10 USDC，链上先双向结算资金费再入金，操作后链上抵押品 = 100 − 3 + 1 + 10 = 108，与弹窗预估 98 + 10 = 108 一致——**净额口径下就是干净的加法**。✅
**T2：行情反转，价格 −8.6%（未再操作，资金费不变）**
| 列 | 计算 | 显示 |
|---|---|---|
| Margin | 100 − 3 + 1 | **98.00**（不随价格变——这就是"保证金"该有的样子） |
| uPnL | 1000 × (−8.6%) | **−86.00** |
| Net Value | 98 − 86 − 2 | **10.00** |
假设该市场清算保证金因子对应门槛为 `1000 × 1% = 10 USD`：Net Value 已贴线，Liquidatable 徽章亮起（精确判定按合约口径：执行价 PnL、且修复前不计应收 1，均比标记价读数**先**触发）。价格再跌 1%，Net Value = 0；再跌即为负数（穿仓），列内显示负值 + 徽章常亮，与合约 `remainingCollateralUsd ≤ 0` 清算门（OC-14）语义一致。
---
## 7. FAQ（业务同学答疑手册）
**Q1：为什么 Margin 和我存入的本金对不上？**
差额 = 挂账资金费净额（应付扣、应收加），tooltip 明细可见。两侧都是下次仓位操作必然结算的钱，显示"结算后的数"才和 Binance/HL 的逐仓保证金余额（资金费双向真实划转）语义一致（§3）。**赚资金费的仓位 Margin 会大于本金**，属正常。
**Q2：为什么 Margin + uPnL ≠ Net Value？**
只差一项平仓手续费（tooltip 第三行）。Net Value 的定义是"全平能拿回多少"，当然要把平仓成本算进去。
**Q3：Net Value 就是我全平到手的钱吗？**
约等于、略偏高。实际成交按执行价（含点差/价格冲击），精确金额看 Close 弹窗的平仓预览。列表给导航读数、弹窗给成交预估，是行业通用分层（§4.2、§4.4）。
**Q4：应收的资金费凭什么算进 Margin？还没到账吧？**
它和应付一样，是**下次仓位操作必然结算的确定性挂账**（合约两条路径核实：增仓 IncreasePositionUtils.sol:240、减仓/清算 DecreasePositionCollateralUtils.sol:132 都自动并入抵押品，无需领取）。确定要进来的钱不算，和确定要扣的钱不扣，是同一种失真。注意一个**临时例外**：现行合约清算判定还不计应收（遗留 bug，修复提案已交工程师，§10），修复前清算判定比 Margin 读数保守——只会早清算、不会漏清算。
**Q5：为什么杠杆列和 Binance 显示的不一样？**
Binance 列表显示的是**你设定的杠杆**，FX100 显示的是**实际占用杠杆**（仓位价值 ÷ Margin），会随补/提保证金变化、不随价格浮动。口径已在杠杆 tooltip 说明，是 2026-06 定稿决策（§4.3）。
**Q6：Margin 或 Net Value 出现负数正常吗？**
Net Value 为负 = 穿仓，必然伴随 Liquidatable 徽章，属正确显示（§4.2）。Margin 为负极罕见（应付资金费超过抵押品），同样是强清算信号，不做视觉钳制。
**Q7：为什么不干脆和 Binance/Hyperliquid 做得一模一样？**
先分清：Binance 和 HL 自己就不一样。Binance 是"保证金列 + uPnL 列"分列（和我们同构）；HL 是把 uPnL 直接计入逐仓保证金、合成一个数（§2/§3）。跟 Binance 的差异只剩结算节奏——它们资金费每 8 小时真实划转，链上做不到（gas 成本），我们用"Margin 扣待付资金费"把语义对齐到等价（§3）。跟 HL 的差异是产品结构性的：合成数会和 Adjust Margin 弹窗、杠杆分母、独立 uPnL 列全面冲突（§1 五条），HL 能这么做是它全套产品围绕"margin=净值"设计，我们的合约结算模型不是。**分列展示信息上与 HL 等价**。
**Q8：有交易员说 HL 逐仓的 Margin 含浮动盈亏，是真的吗？那 Binance 呢？**
HL：真的。官方文档原文："isolated positions will apply unrealized pnl as additional margin for the open position"，且浮盈在余量 ≥10% 名义价值时可提取。所以 HL 的逐仓 Margin ≈ 我们的 Net Value（含 uPnL 的净值），不是我们的 Margin。
Binance：**分两层**。展示/操作层（持仓行 Margin 列、调整保证金弹窗）是"分配给仓位的保证金"，**不含 uPnL**，uPnL 单独列示、浮盈也不能从逐仓提走；风险/清算层**含 uPnL**（官方清算公式 Collateral = Initial Collateral + Realized PnL + Unrealized PnL，体现在 Margin Ratio 和清算价上）。API 也印证这个分层：`isolatedWallet`（只随真实资金流变动）与含浮动盈亏的保证金余额是两个字段。
**结论**：三家的"风险判定数"都含 uPnL；差别只在展示层——HL 把保证金和净值合成一个数，Binance 和我们拆成两个。我们的 Margin 对标 Binance 的逐仓分配保证金（再扣挂账资金费使语义等价），Net Value 对标 Binance 的清算层保证金余额 / HL 的 isolated margin。跨所对比时先对齐口径再比数字。
**Q9：之前说"Margin 要扣除 PnL 和 funding"，现在为什么只扣 funding？**
"扣除 PnL"后的数字是净值不是保证金，会引发名实不符、与弹窗/杠杆口径冲突、信息重复、负数歧义等五个问题（§1）。净值语义由新增的 Net Value 列承载，Margin 保持"保证金"本义——两个问题两个列，互不打架。
**Q10：07-12 初版为什么只扣应付？07-14 为什么改成净额？**
初版的理由是"对齐当时合约清算判定的保守口径"（判定只扣应付）+ 杠杆可验算。后来核实：合约的**判定与结算不一致**——执行时应收如数入账、判定却不计它，是 GMX 语义漂移的遗留 bug（GMX 应收走 claimable 不进抵押品，判定不计是对的；fx100 两侧都进保证金）。既然"判定不计应收"本身是要修的 bug 而不是设计（修复提案已交工程师，§10），显示层就不该向 bug 对齐，而应向**真实结算**对齐——即净额口径。数学上两版的 Net Value 完全相同（应收从单列行移进 Margin），变化只有 Margin 与杠杆分母各计入应收。链上字段：应付=Reader `negativeFundingFeeAmount`、应收=`positiveFundingFeeAmount`，两个独立字段（命名指资金费对用户的方向，都存绝对值）。
---
## 8. 实施清单（前端）
| # | 改动 | 位置 | 说明 |
|---|---|---|---|
| 1 | Margin 列改口径 | `Positions.tsx` `marginUsd` 计算（现 L161-163） | `collateralUsd − pendingFundingFeesUsd`；负数不钳制 |
| 2 | Margin tooltip | 同上 + locales（en/zh/ja/ko） | §4.1 三行明细文案 |
| 3 | 新增 Net Value 列 | `Positions.tsx` 表头+行渲染（桌面表格 & 移动卡片） | `margin + uPnL + pendingPositiveFundingFeesUsd − closeFee`；closeFee 用市场平仓费率×size（worst-case 费率回退链与 `leverage.ts getPositionFeeRate` 一致）；tooltip §4.2（四行明细） |
| 4 | Adjust Margin 弹窗当前值对齐 | `PositionMarginDialog.tsx` | "当前保证金"改用 Margin 口径 + "待结算资金费（应付/应收）"明细行；操作后余额预估 = Margin + 应收 + Δ；min/max 校验逻辑仍基于链上原始值（合约执行时先结算 funding，两者自洽） |
| 5 | 杠杆 tooltip 简化 | 杠杆列 tooltip 文案 | 改为"仓位价值 ÷ Margin"，公式与 §4.3 一致 |
| 6 | GitBook 中英双版同步 | `docs/gitbook/` | §0 + §7 摘编；【强制】中英一致 |
| 7 | 自动化核对更新 | `scrapePanel.ts` / FRONTEND_VERIFICATION | Margin/NetValue 加 bit-exact 断言（标记价口径可精确复算） |
| **8** | **净额口径切换（07-14 修订）** | `liqPriceUtils.getPositionMarginUsd`（加 `+ pendingPositiveFundingFeesUsd`）+ SDK `getLeverage` 同步 + Net Value 去掉单列应收行 + Margin tooltip 改净额行 + `PositionMarginDialog` 当前值/明细行同步 + 表头 ⓘ 文案 | ✅ **develop `1f9f131a` 已实现并复验通过**（2026-07-14，见 §9 尾注）：getPositionMarginUsd/getPositionNetFundingUsd 净额、SDK getLeverage 加应收、NetValue 三行、弹窗 marginFundingNet 净额行（带符号=Funding 列同数）、tooltip 四语、"from mark"→"from oracle" 全改；连同 OC-17 已合入测试分支 `cc008c01` |
---
## 9. 实施核对记录（2026-07-14 起，随修复滚动更新）
> **当前状态（2026-07-16）：前端部分全部收官** ✅——净额口径及全部关联修复复测通过并关闭。剩余待办三项（均非前端改动）：① 存入执行后回列表核对（发一笔真实 Adjust Margin 存入，验证列表 Margin=预览值、挂账资金费归零）② earn>0 仓位的净额加项 UI 补验（造 short 侧仓位）③ 合约清算判定计应收的修复（spec 已交工程师，合入后按 spec §6 用例复验；前端无需再改）。
> ⚠️ 本节验证按 **07-12 旧口径**（Margin 只扣应付）进行，当时结论全部成立。 **07-14 净额口径复验（代码级，develop `1f9f131a`）**：✅ 公式逐字对齐 §4（Margin=抵押品+净额、杠杆分母含应收、NetValue 三行、SDK getLeverage 同步、弹窗净额明细行、from oracle）；Fefe 自带单测含规范 §6 示例用例、app 296/296 过。当时提出的两项遗留后续均已修复关闭：① Bug 3 救援预览徽章 → OC-18（见下）② develop 残码/spec 用例 → `d121a8e5`（残码删除、spec 13/13 过）。**UI 级复验（2026-07-15 截图验收，Next 16 + `1f9f131a`，MSOL insolvent 仓）**：✅ "+0.8% **from oracle**"（清算价随 owed 累积右移自洽）；✅ 杠杆 tooltip 新文案；✅ Net Value 三行 tooltip 逐分可加（19.06 − 19.42 − 0.04 = **−0.40**，负数红字）；✅ 表头 Margin/Net Value ⓘ；✅ 弹窗 "Pending funding (net) **−0.94**" **= Funding 列同数**（§5 核心断言）、Current Margin 19.06 = 列表、存 100 → 119.06 干净加法、新杠杆 1.68x=200.27÷119.06；✅ **OC-17 withdraw 水下钳 0**（Max: 0 USDC，输入 1 被 "Amount exceeds withdrawable collateral" 拦截）；✅ **insolvent 闭环**——下单面板 reduce-only 显示 "Pending Liquidation" 禁用 + "Position is insolvent — will be closed by liquidation"（OC-14），与列表负 Net Value + Liquidatable 徽章三处自洽。仍待验：**有应收资金费（earn>0）的仓位**（本仓 earn=0，净额加项未走到）——造 short 侧仓位后补验。 **Bug 状态回填（2026-07-15）**：净额口径 / from oracle / 收尾三项 / develop 残码 四个 bug 复测通过已 **Closed**；**Bug 3（救援预览徽章）已由 feat-open-control `beee3d84`(OC-18) 修复并 UI 三步复测通过后 Closed**——空输入=琥珀提示+徽章、存 1.1<门槛=红字+徽章、存 1.6>门槛=显示新清算价 $180.65(−0.1% from oracle)；**最低救援量 1.5008 数学核验通过**：公式=1.1×清算线−equity，链上实读 minCFForLiquidation[MSOL]=0.5%（操作线 1%），T=0.5%×200.2701=1.00135，1.1T=1.10149，equity(netValue)=−0.3993 → 1.5008 ✓；两次实测互证（存 1.1 后 equity 0.70<T 仍可清算、存 1.6 后 equity 1.20>T 脱险且新清算价距现价 −0.1% ≈ 超线余量 0.1996/200.27）。注意 nuance：1.5008 只脱离 0.5% 清算区，equity 仍低于 1% 操作线（部分平仓/提取仍受限），hint 文案 "out of the liquidation zone" 用词准确；**弹窗 Equity 行（OC-19，develop `f1697179`）复测通过并 Closed**——Equity 行=列表 Net Value 同数（显示口径）而 withdraw/救援门槛用 SDK equity（含全部 pending 成本，tooltip 说明差异）、Max:0 原因文案带数字（required 2 = 1% 操作线 × 200.27 ✓）、Deposit 提示带 equity、存 16 → 35.06/5.71x/新清算价 −8.1% 全链自洽；**随后发现的 "Pending Fees (settled on submit)" 行重复问题也已修复关闭**（develop `3e8fff43`：JSX 行 + 四语言 key 删除、内部净额计算保留，UI 确认摘要仅剩净额一行；该行曾诱导 19.06−0.94 的重复扣心算）；（上述 OC-19 即"弹窗缺 Equity 行"单的修复，已随复测关闭。）环境备注：GraphQL 404（Goldsky subgraph v0.0.2 端点下线）已解决——本地 .env `NEXT_PUBLIC_INDEXER_URL` 更新至 v0.0.4（`_meta` 探针 200），单已关；偶发的 tickers/open-interest 超时为 Tenderly fork RPC 延迟（实测 eth_blockNumber 3–10s），非代码问题，观察即可。另注意 **OC-17**：最低救援量口径改为 0.5% 清算线（非 1% 操作线）、withdrawMax 改为 equity−操作线且水下钳 0，LB 组相关用例（LB-2/3/5）的门槛预期需按此更新。
### 9.1 已验证通过（真实仓位截图验算，MSOL 1×long，抵押 20 USDC）
- 五列公式与本规范逐字吻合；四行 tooltip、负数不钳制、4 语言 locale 齐全；uPnL 全链路 bigint 原始精度（利于 bit-exact 断言）。
- 数值自洽：杠杆 200.27÷19.99=10.02x ✅；Net Value 19.99−19.42+0−0.04=0.53 ✅；Margin 20−0.01=19.99 ✅；ROE −19.42÷20=−97.10% ✅（分母=初始抵押品，既定口径）；Net Value 0.53 < 清算门槛 → Liquidatable 徽章亮 ✅。
- **无重复扣 funding 证据链**（最重要的核对项）：SDK `collateralUsd` = 链上原始值（`convertToUsd(collateralAmount)`，sdk positions.ts:656）→ Margin = raw − 应付，只减一次；SDK `leverage` 字段 = size ÷ (raw − pendingFees)，与 size ÷ Margin **同口径**（TP/SL 弹窗、OrderForm、保护浮层等用 SDK 字段处全部一致）；弹窗 withdrawMax 用独立字段 `remainingCollateralUsd`，无叠扣。
- 清算引擎只计应付侧再次核实：`totalCostAmount = 其他费用 + negativeFundingFeeAmount`（PositionPricingUtils.sol:376），应收不进 equity → 引擎恒比 Net Value 保守（方向安全）。
### 9.2 已提工程师（Notion Bugs → Fefe，2026-07-14）
| # | 问题 | 说明 | Notion |
|---|---|---|---|
| 1 | 清算价提示 "+x% **from mark**" 措辞 | 数值本身正确（=(清算价−现价)÷现价 的带符号距离，long 为正=已越线，**不是加点**）；但全站术语是 oracle，从未定义 mark | [bug 页](https://app.notion.com/p/Liq-Price-x-from-mark-from-oracle-39d3d7873f2c811d8318d2ffbe206810) |
| 2 | 收尾三项：杠杆 tooltip 重复扣措辞 / 弹窗缺应收明细行 / Margin与NetValue 表头缺概念 ⓘ | 杠杆 tooltip 应为 "size ÷ Margin（已含扣除，不重复扣）"；弹窗已算 `pendingPositiveFundingFeesUsd` 未渲染；表头概念 tip 四语文案见 §4.1/§4.2 | [bug 页](https://app.notion.com/p/tooltip-Margin-NetValue-tip-39d3d7873f2c8102abb1cd4a799bf4db) |
### 9.3 弹窗一致性实测（2026-07-14，Liquidatable MSOL 仓位截图验收）
| 项 | 结果 |
|---|---|
| Adjust Margin"当前保证金"= 列表 Margin（19.99，非链上 20） | ✅ |
| OC-16 提示未输入即出现（至少存入 1.6685）；输入 1 < 门槛提示变红（代码层按钮禁用） | ✅ |
| 预览数学：存 1 → 20.99 / 9.54x；存 10 → 29.99 / 6.68x（= size ÷ 新 Margin，应收=0） | ✅ |
| Funding Breakdown：Owed 0.005302 → Margin 20−0.0053=19.9947→显示 19.99，两处一致 | ✅ |
| Adjust Leverage：当前杠杆 10.02x 与列表同源；Equity 0.53 = Net Value | ✅ |
| Close 弹窗：Est. Receive 0.53 ≈ Net Value（2 位精度相同，执行价口径）；文案 "oracle ± impact" 术语正确 | ✅ |
| 存入执行后回列表核对（Margin=预览值、owed 归零） | ⏳ 待执行链上操作 |
| **穿仓视觉**（fork setMockPrice 179.5 压价实测，07-14）：Net Value 显示 **−1.74 USDC 红字**（`negative` class）+ Liquidatable 徽章同屏；Margin 19.07 保持中性色且不随价格变（=20 − 累积应付 0.93，杠杆 10.50x=200.27÷19.07 同步自洽）；uPnL −20.77(−103.85%) 红字；CDP 读 DOM + 截图双验，价格已复位 180.85 | ✅ |
| ⚠️ 新发现：输入足量救援金额后 Est. Liq. Price 行仍只显示 Liquidatable 徽章，不给新清算价预览；次要：Adjust Leverage "Collateral (unchanged)" 用原始抵押品与列表 Margin 并排易混 | 已提 [bug 页](https://app.notion.com/p/Adjust-Margin-Liquidatable-39d3d7873f2c817d8d53d720b8055594) |
### 9.4 测试分支临时修复（⚠️ 以开发者 develop 最终实现为准）
`feat/liquidation-protection-ux-new-ui` 上的先行修复，仅为不阻塞测试；**develop 正式修复合入后以其为准复验，临时改动随合并让位**：
- `0bedc1fe`（合并缝合）：弹窗 newMargin 采用 develop 的 settledMargin（=Margin+应收±Δ）；OC-16 救援门槛保留；旧 OC-15 费用行改造成"应收资金费 +X"行；补回被 auto-merge 丢弃的 `getPositionEquityUsd`。
- `8f1a37b0`：杠杆 tooltip 措辞 + Margin/Net Value 表头 ⓘ（en/zh/ja/ko）。
- **【流程规则】**测试侧此后**不再主动修改产品代码**：发现问题一律提 Notion bug 给工程师（本表模式），只做单向同步（develop / feat-open-control → 测试分支）并**验证开发者的修改是否正确**。
---
## 10. 净额口径定稿与合约清算判定修复（2026-07-14 采纳）
**决策（Gordon 拍板，2026-07-14）**：前端按**真实结算**计算——Margin = 抵押品 + 资金费净额（本文 §0/§4/§6/FAQ 已全部按此改版），合约清算判定同步修复为计入应收。
**合约侧**：判定 vs 结算不一致核实为真——清算**执行**入账应收（DecreasePositionCollateralUtils.sol:132，含清算单与穿仓兜底），清算**判定**不计（PositionUtils.sol:378）→ 有应收挂账的仓位被**提前**清算。修改提案（一行改动 + 四处"无需改"核实 + 测试要点 + 风险评估）已交合约工程师：`spec 文件` / [Notion 页](https://app.notion.com/p/vs-2026-07-14-39d3d7873f2c810da253c07277da089b)。
**前端侧（✅ 已全部完成，2026-07-15）**：净额口径由 develop `1f9f131a` 实现、`f1697179`(OC-19 Equity 行)、`3e8fff43`(删重复行) 收尾，连同 OC-17/18 全部复测通过关闭——显示层已就位，合约修复合入后前端**无需再改**。
**过渡期口径（合约修复合入前）**：前端按净额显示、合约判定仍只扣应付 → **判定恒比显示保守**（少算应收），Liquidatable 徽章/清算价以合约为准——只会早清算、不会漏清算；这个"早清算"正是要修的 bug 本身，不构成前端回退理由。
**修复合入后**：判 / 执 / 显三层统一净额；watch 验证器复算公式加应收项；按 spec §6 两个用例复验。
---
*变更记录：2026-07-12 初版定稿（Margin 扣待付资金费 + 新增 Net Value 列 + 全项目口径矩阵）。2026-07-12 修订：①更正资金费结算事实——fx100 应收/应付两侧均直接结算进保证金，无 claimable 领取通道（合约核实：IncreasePositionUtils.sol:240 / DecreasePositionCollateralUtils.sol:132），Margin 不加应收的理由改为"对齐清算引擎保守口径+杠杆可验算"；②Net Value 公式加入应收资金费；③更正 HL 事实——HL 逐仓保证金含 uPnL（官方文档核实），§2/§3/FAQ 相应改写。2026-07-14：新增 §9 实施核对记录 + §9.3 弹窗一致性实测；§10 合约清算判定修复 spec 交工程师。**2026-07-14（二）·净额口径修订**：Margin 与杠杆分母改为"抵押品 + 资金费净额"（应付扣、应收加，Gordon 拍板"以真实结算为准"），Net Value 回归三行（金额不变）；§0/§1/§2/§3/§4/§5/§6/FAQ Q1/Q2/Q4/Q10/§8 全套改版；§9 标注按旧口径验证待复验；前端实现已提 bug 给 Fefe。**2026-07-16 · 前端收官**：净额口径七批修复（1f9f131a 净额实现 / from oracle / 表头tips / OC-17 提取钳零 / OC-18 救援预览 / OC-19 Equity 行 / 3e8fff43 删重复行）全部复测通过、Bugs DB 前端项全部 Closed；§9/§10 状态刷新。剩余待办三项见 §9 顶部。*

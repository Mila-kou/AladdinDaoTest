# Dashboard 指标释义（中文）

> Notion 页面：[原文](https://app.notion.com/p/3ba3d7873f2c81bfbf2cfd5c63a361f4)
> 作者：fx100-sync（Gordon 的 fx100-contracts 仓库文档同步机器人，内容出自 Gordon）
> 创建时间：2026-08-13
> 最后编辑：2026-08-13
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 产品 / FX100 / PRD（产品需求文档） / 实时监控系统
> 类型：设计文档

# Dashboard 指标释义（中文）
这份文档解释 Dashboard 页面上每一项数据的**含义**、**计算公式**和**代码位置**，方便日常核对数据时知道每个数字到底是什么意思、怎么算出来的，而不是只看表面数字猜。
每一条都标注了源码位置（文件:行号），数值口径以代码为准——如果代码改了公式，这份文档要跟着更新。
---
## 一、OI 卡片（Total OI / Static OI）
### Total OI（结构 OI，mark-to-market）
**含义**：按当前 oracle 价格计算的持仓美元价值。会随价格波动实时变化。
**公式**：`OI(USD) = 持仓代币数量 × 当前 oracle 中间价`
**代码位置**：
- 数据来源：`apps/worker/src/collectors/marketCollector.ts` 的 `oi.longUsd`/`oi.shortUsd` 字段（源头是 `OPEN_INTEREST_IN_TOKENS` × 当前 oracle 价）
- 前端汇总：`apps/web/src/app/dashboard/page.tsx:65-67` 的 `oiLong()`/`oiShort()`
**⚠️ 一个容易漏看的细节**：如果某个市场当下没有 oracle 价格（比如 Chainlink feed 还没刷新出数据），前端会**自动退化成用 Static OI 顶替**那个市场的数值（`hasOracleOi()` 判断，`page.tsx:61-63`），避免界面上直接显示 $0。也就是说 Total OI 严格来说是"能算 mark-to-market 就用 mark-to-market，不能算就退化成 cost-basis"的混合值，不是纯粹的实时市值。
### Static OI（静态 / cost-basis OI）
**含义**：开仓那一刻记录的美元价值累计，之后价格怎么变都不影响这个数字，只有新开仓/平仓才会变。
**公式**：直接读合约的 `CUMULATIVE_OPEN_COSTS` 键（`marketCollector.ts:534-535`），不做任何价格换算。
**为什么两个数字经常很接近**：如果当前价格离大家开仓时的价格没差太多，mark-to-market 和 cost-basis 自然就贴近；价格大幅波动时两者会明显拉开——Total OI 跟着价格走，Static OI 不动。
**这两个指标分别用在哪**：Static OI 更适合算资金费/点差这类跟"名义仓位大小"相关的东西（稳定基准，不会因为价格波动本身产生假信号）；Total OI 更适合看当前真实敞口大小、reserve usage 这类要跟当前池子价值比较的指标。
---
## 二、LP Pool Health 卡片
> **2026-08-12 更正**：这一节原来把 Net Value/PnL-Pool 的公式写错了——用的是前端自己拿每个市场的 `longPnlToPoolFactor`/`shortPnlToPoolFactor`（**主 oracle 价格**，也就是这台 worker 自己缓存的 Chainlink 价）重新加总出来的一份指标，跟合约真实结算用的价格源不是一回事。已按合约源码（`MarketUtils.getPnl`/`getNetObligation`/`getGlobalNetObligationRatio`）重新核对并修正，下面是修正后的版本。原来的错误版本记在本节末尾，避免以后又踩一遍。
### TVL
**含义**：LP 池子的资产规模，**不含**交易者未实现盈亏（trader unrealised PnL）。
**公式**：直接取任意一个市场的 `Reader.getMarketInfo().poolUsdWithoutPnl`（所有市场共享同一个 LPVault，取哪个市场的值都一样）。合约里的原始公式是 `IVault(vault).totalAssets() × collateralTokenPrice`（`MarketUtils.sol:129-144`）。
**代码位置**：`apps/web/src/lib/snapshot.ts` 的 `lpPoolTvl = firstPoolUsd`
### LP NAV/share（新增）
**含义**：LPVault 自己的每份额净值——纯粹是"存进去的资产 ÷ 份额数"，**不含任何 PnL 调整**，跟 TVL 是同一个概念的不同粒度（份额初始值为 1.0000）。
**公式**：合约自带 `LPVault.nav()`（继承自 `VaultBase.sol:107-125`）：
```plain text
totalAssetsScaled = totalAssets() × 10^(18 − USDC小数位)   // USDC=6位，scalar=10^12
nav = totalAssetsScaled × 1e18 / totalSupply()             // 1e18 精度，注意不是全仓库通用的 1e30
```
**代码位置**：`packages/onchain/src/vault.ts`（`getVaultNav`）、`apps/worker/src/collectors/marketCollector.ts` 的 `global.lpVaultNavPerShare`、`page.tsx` 的 `navPerShareNum`
### Settlement NAV（原来叫"Net Value"，改名+改公式了）
**含义**：TVL 扣掉/加上全场交易者的**净盈亏**之后的真实价值——如果这一刻所有仓位按当前价格结算，LP 实际能拿到的钱。**Settlement NAV > TVL 说明交易者整体在亏钱（LP 在赚）；Settlement NAV < TVL 说明交易者整体在赚钱（LP 在亏）。**
**正确公式**（对齐合约 `MarketUtils.getPnl`/`getNetObligation` 的口径，`src/market/MarketUtils.sol:170-180, 266-286`）：
```plain text
每个市场：
  pnl_long_i  = longOiTokens_i  × secondaryPrice_i.max − cumulativeOpenCosts_long_i
  pnl_short_i = cumulativeOpenCosts_short_i − shortOiTokens_i × secondaryPrice_i.min
全场：
  全场净交易者盈亏 = Σ_i (pnl_long_i + pnl_short_i)      ← 有正有负，多空、多市场都互相抵消
  Settlement NAV = TVL − 全场净交易者盈亏
```
**关键点**：`secondaryPrice` 是 `Oracle.getSecondaryPrice()`——这是合约自己在算全局义务比/withdrawal gate 时用的价格源（Base Sepolia 目前没配 Chainlink push feed，所以它实际读的是 `Oracle.latestRecordedPrices()`，跟 checklist P2 已经在盯的"recorded price"是同一份数据）。**不是**前端/worker 自己缓存的主 oracle 价格。这一点是之前算错的根源。
**代码位置**：
- 每市场 PnL：`apps/worker/src/collectors/marketCollector.ts` 的 `pnlLongSecondaryUsd`/`pnlShortSecondaryUsd`（"2c" 步骤，跟 `getMarketInfo` 一起并发读取，没有多加链上调用）
- 全场汇总：同文件 "2.5" 步骤的 `sumPnlSecondary`，写进 `global.globalNetPnlSecondaryUsd`/`global.settlementNavUsd`
- 前端：`apps/web/src/lib/snapshot.ts` 的 `settlementNavUsd`，直接读 `global.settlementNavUsd`，不在前端重新算
**界面上的百分比**：`(Settlement NAV − TVL) / TVL`，正数=LP 在赚，负数=LP 在亏，颜色阈值：< −5% 红、< −1% 橙、< 0% 浅橙、≥0% 绿。
### PnL/Pool（改成读合约自己算的值了）
**含义**：全场**盈利方向**的交易者盈利之和占池子的比例——衡量"如果现在要兑付所有盈利仓位，需要动用多大比例的池子"，是一个**风险/容量**指标，不是"LP 赚了多少"的指标（跟上面 Settlement NAV 的净额口径不是一回事）。
**公式**：直接读 `global.globalNetObligationRatioPct`——这就是 checklist P0-2 接的 `Fx100Reader.getAdlState()`（合约自己跑 `MarketUtils.getGlobalNetObligationRatio` 算出来的值，`src/market/MarketUtils.sol:182-214`）：
```plain text
PnL/Pool = Σ_i [max(0,longPnl_i) + max(0,shortPnl_i)] / poolUsd   ← 合约里叫 netObligation/poolUsd
```
⚠️ 这个值**恒 ≥ 0**（每一项先 clamp 到 0 才加总），跟上面 Settlement NAV 的"有正有负"口径刻意不同——两个指标问的是不同问题："亏了多少"vs"要预留多少去兑付盈利仓位"。
**代码位置**：`apps/web/src/lib/snapshot.ts` 的 `globalPnlToPool = (global?.globalNetObligationRatioPct ?? 0) / 100`
**告警门槛**（`PoolBar` 显示的 Safe/5%/8%/Max 分区）：≥5% 警告，≥8% 严重。
**✅ 之前记录的技术债已修复**：以前这里是前端自己拿每个市场的 `longPnlToPoolFactor`/`shortPnlToPoolFactor`（主 oracle 价格）重新加总的一份指标，跟 `global.globalNetObligationRatioPct`（合约自己用 secondary price 算的）是两套独立代码路径算同一个概念。现在已经统一成只读后者，前端不再重复计算。
\<details\>
</details>
\<summary\>已废弃的错误版本（2026-08-09 写的，2026-08-12 发现价格源用错了）\</summary\>
</summary>
原文如下，保留是为了如果以后又出现类似的"前端自己拿主 oracle 价格重算全局指标"的改动，能对照着看出哪里错了：
> **Net Value 公式（错）**：`全场净交易者盈亏 = Σ_i (longPnlToPoolFactor_i + shortPnlToPoolFactor_i) × TVL / 1e30`，用的是 worker 自己缓存的 Chainlink 主价格，不是合约结算用的 secondary price。
>
> **PnL/Pool 公式（凑巧数值对但来源错）**：`Σ_i [max(0, longPnlToPoolFactor_i) + max(0, shortPnlToPoolFactor_i)]`，同样用主价格重新加总，跟 `getAdlState()` 是两条独立路径。
\</details\>
### Reserve
**含义**：池子里被"预留"用来覆盖当前持仓的资金比例——衡量池子资本利用率的容量指标，跟上面两个"盈亏"指标不是一回事。
**公式**：
```plain text
Reserve = Σ_i (每个市场多空两侧的已用 OI 之和) / TVL
```
每个市场的已用 OI 优先用 mark-to-market 的 `oi.longUsd`/`shortUsd`，没有的话退化成 `oi.staticLongUsd`/`staticShortUsd`（跟 Total OI 那条同样的退化逻辑，`snapshot.ts:613-614`）。
**代码位置**：`apps/web/src/lib/snapshot.ts:628, 630`
**告警门槛**（Safe/50%/80%/Max 分区）：≥50% 警告，≥80% 严重。
### 卡片右上角的 Normal / Warning / Critical 徽章
**公式**：
```plain text
Critical: Reserve ≥ 80%  或  PnL/Pool ≥ 8%
Warning:  Reserve ≥ 50%  或  PnL/Pool ≥ 5%
```
两个条件是"或"的关系，任意一个触发就升级。**看到 Warning 时，先看是 Reserve 还是 PnL/Pool 触发的**——两者含义完全不同（一个是容量吃紧，一个是盈利风险），处理思路也不一样。
**代码位置**：`apps/web/src/lib/snapshot.ts:632-634`
---
## 三、市场容量上限（asset-drawer 的 Capacity tab，逐市场）
> 2026-08-13 新增本节（用户报的）：drawer 里 Capacity tab 的 Long/Short/Total Cap Usage 一直没有文字说明是怎么算的，这里核对+补全。**跟"二、LP Pool Health 卡片"里的 Reserve 不是同一回事**——那个是协议级、所有市场共用一个 reserve 额度（第 17 条修的）；这里的 Cap Usage 是逐市场的，Long 和 Short 各自有自己独立的上限，互不共享。
这里一共有两层上限，"且"的关系（两个都要满足，链上按更紧的那个执行）：
### Max Long/Short OI（硬顶，Hard Cap）
**含义**：每个方向允许的最大持仓美元量，是管理员设的一个固定数字，**不会**随资金池大小自动变化。
**公式**：直接读 DataStore 的 `MAX_OPEN_INTEREST(marketIndex, isLong)`，long/short 各自一个独立存储位。
**代码位置**：`apps/worker/src/collectors/marketCollector.ts` 的 `dsV.maxLongOi`/`dsV.maxShortOi`（键：`maxOpenInterestKey`）→ 写进 `oi.maxLong`/`oi.maxShort`
### Max Long/Short OI Factor（软顶，Soft Cap）
**含义**：另外一层上限，是资金池当前价值的一个**比例**，会随 LP 存取款、盈亏结算实时变化——这就是用户说的"根据 LP 算出来的"那一层。跟 `RESERVE_FACTOR`（第 17 条已经证明是假拆分、long/short 读的是同一个键）不一样，`MAX_OPEN_INTEREST_FACTOR` 在链上**真的**是 long/short 分开存的两个键。
**公式**：
```plain text
软顶美元值(long)  = poolUsdWithoutPnl × MAX_OPEN_INTEREST_FACTOR(long)
软顶美元值(short) = poolUsdWithoutPnl × MAX_OPEN_INTEREST_FACTOR(short)
```
界面上主显示的是美元值（这是日常核对时实际会去比的数字），百分比参数放在 tooltip 里（2026-08-13 定稿：一开始反过来做的，用户反馈"平时看的是美元 cap，参数鼠标悬停能看到就行"，改成美元值优先显示）。
**代码位置**：`marketCollector.ts` 的 `dsV.maxOpenInterestFactorLong`/`Short`（键：`maxOpenInterestFactorKey`，%）和 `factorCapLong`/`factorCapShort`（美元值）→ 写进 `oi.maxLongFactor`/`maxShortFactor`（%）和 `oi.maxLongFactorUsd`/`maxShortFactorUsd`（$）
**目前真实链上的数字**：24 个真实市场全部统一是硬顶 $100,000,000、软顶 100%（≈ 池子当前市值，$50.2M 左右）——**软顶反而比硬顶更紧**，所以真正生效、卡住能不能开新仓的是软顶，不是硬顶。这个数字会随资金池涨跌变化：池子越大，软顶的美元值越大；池子缩水，软顶也跟着收紧。
### 有效上限 = min(硬顶, 软顶)
**含义**：真正生效的上限，取两层里更紧的那个。对齐合约 `MarketUtils.validateOpenInterest`（`src/market/MarketUtils.sol:639-658`）——每次加仓都会跑这个检查，硬顶和软顶是"且"的关系，任何一个超了都会 revert。
**公式**：
```plain text
有效上限(long)  = min(Max Long OI,  软顶美元值(long))
有效上限(short) = min(Max Short OI, 软顶美元值(short))
```
**代码位置**：`marketCollector.ts` 的 `effectiveCapLong`/`effectiveCapShort`（2026-08-13 之前这里漏了软顶，只对硬顶取值，把真实占用率低估了大约一半——ETH 的例子：只对 $100M 硬顶算是 5.1%，对上正确的 ~$50.2M 有效上限是 10.3%）
### Long / Short / Total Cap Usage
**含义**：当前持仓占"有效上限"的比例——衡量这个方向还能不能再开仓。
**公式**：
```plain text
Long Cap Usage  = longOiUsd  ÷ 有效上限(long)
Short Cap Usage = shortOiUsd ÷ 有效上限(short)
Total Cap Usage = (longOiUsd + shortOiUsd) ÷ (有效上限(long) + 有效上限(short))
```
⚠️ **Total 不是 Long 和 Short 两个百分比的平均值**，是"合并的持仓"除以"合并的有效上限"——如果 Long 用得很满、Short 几乎没用，Total 会比两者的算术平均更接近 Long 那个数字（因为分母也是按美元加权的，不是按 50/50 平均）。
**代码位置**：`marketCollector.ts` 的 `gcLongUsage`/`gcShortUsage`/`gcTotalUsage` → 写进 `globalCap.longUsage`/`shortUsage`/`totalUsage`
### Cap Risk Score / Cap Risk Status
**公式**：
```plain text
Cap Risk Score = max(Long Cap Usage, Short Cap Usage)
Cap Risk Status:
  L3: Cap Risk Score ≥ 95%
  L2: Cap Risk Score ≥ 85%
  L1: Cap Risk Score ≥ 70%
  否则 normal
```
**代码位置**：`marketCollector.ts` 的 `gcRisk`/`capRiskStatus` → 写进 `globalCap.risk`/`capRiskStatus`
### Headroom USD
**含义**：两个方向合计还能再开多少仓位（美元），才会撞到有效上限。
**公式**：
```plain text
Headroom USD = 有效上限(long) + 有效上限(short) − (longOiUsd + shortOiUsd)
```
**代码位置**：`marketCollector.ts` 的 `gcHeadroomUsd` → 写进 `globalCap.headroomUsd`
---
## 四、开仓/清算下限参数（新增，2026-08-13 用户报的）
> 用户当时的原话大意是"最小清算线，base sepolia配置的和Min Collateral Factor一样，还有最小开仓金额、最小保证金金额、免手续费最小金额，有些是全局的"——核对下来，四个里两个是全局的，两个是逐市场的，具体见下。
### Min Collateral Factor (Liquidation)（逐市场，跟 Min Collateral Factor 是两个独立键）
**含义**：清算判定专用的杠杆比例阈值——跟 drawer 里已有的"Min Collateral Factor"（开仓侧的杠杆上限）是**两个不同的 DataStore 键**，只是目前配置的数值恰好相等。
**核对结果**：用户的印象是对的——现场核对了全部 24 个真实市场，`MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION` 跟 `MIN_COLLATERAL_FACTOR` **逐个市场都完全相等**（比如 ETH 都是 0.50%）。但这是当前的配置选择，不是合约层面强制的——链上这两个是完全独立的键，理论上可以配成不同的值。
**代码位置**：
- 合约：`FX100Keys.minCollateralFactorForLiquidationKey(marketIndex)`（`src/constants/FX100Keys.sol:1258-1260`），读取用 `MarketUtils.getMinCollateralFactorForLiquidation`（`src/market/MarketUtils.sol:846-851`）
- 用在哪：`PositionUtils.sol:389-411` 的 `isPositionLiquidatable`——`remainingCollateralUsd < positionSizeUsd × minCollateralFactorForLiquidation` 就判定可清算
- monitor：`marketCollector.ts` 的 `dsV.minCollateralFactorForLiquidation` → 顶层字段 `minCollateralFactorForLiquidation`
### Min Position Size（全局，MIN_POSITION_SIZE_USD）
**含义**：任何仓位的总名义美元规模下限——所有市场共用同一个数字，不是逐市场配置的。
**代码位置**：
- 合约：`FX100Keys.sol:431`，纯全局常量，没有 `marketIndex` 参与哈希，直接 `dataStore.getUint(FX100Keys.MIN_POSITION_SIZE_USD)`
- 用在哪：`PositionUtils.sol:296-300`（`validatePosition`，低于这个数直接 revert `MinPositionSize`）、`DecreasePositionUtils.sol:222`（减仓也会检查）
- monitor：`marketCollector.ts` 的全局批量读取里新增 `minPositionSizeUsdGlobalKey()`（`packages/onchain/src/keys.ts`），写进 `global.minPositionSizeUsdGlobal`——跟 ADL 阶梯那三个全局裸键（第 6/9 条）读取方式一样，只读一次，不逐市场重复
### Min Collateral（全局，MIN_COLLATERAL_USD）
**含义**：剩余保证金的绝对美元下限——触发清算的另一个条件（跟上面 Min Collateral Factor (Liquidation) 的杠杆比例判定是两条独立的规则，任意一条满足就可清算）。
**当前配置**：Base Sepolia 上是 **0**（相当于没启用，历史决定见 `project_fx100_risk_backstops_vs_spec` 相关分析，链上上限是 ≤$10，`ConfigUtils.sol:234-238` 强制）。
**代码位置**：
- 合约：`FX100Keys.sol:426`，纯全局常量
- 用在哪：`PositionUtils.sol:401-404`（`isPositionLiquidatable`，`remainingCollateralUsd < MIN_COLLATERAL_USD` 且启用时判定可清算）
- monitor：同上，`global.minCollateralUsdGlobal`
### Execution Fee Exemption（免手续费门槛，逐市场，两个键互斥不叠加）
**含义**：订单的执行费（execution fee）是否被豁免（免掉，改成 0）的判定门槛。**注意这两个键不是"同时生效、取更松的那个"，而是根据订单类型二选一**：USD 计价的订单比 `EXECUTION_FEE_SUBSIDIZE`，token/合约张数计价的订单比 `EXECUTION_FEE_SUBSIDIZE_SIZE`。
**公式**：
```plain text
若 threshold == type(uint256).max → 永不豁免
否则 → sizeDelta ≥ threshold 就豁免（执行费设成 0）
```
所以 threshold = 0 就是"永远豁免"（当前 Base Sepolia 全部 24 个真实市场两个键都是 0，即全免）。
**代码位置**：
- 合约：`GasUtils.isExecutionFeeSubsidizedAtCreation`（`src/gas/GasUtils.sol:239-258`）；豁免后设执行费为 0 在 `OrderUtils.sol:136-141`
- monitor：`marketCollector.ts` 的 `dsV.executionFeeSubsidize`/`executionFeeSubsidizeSize` → 现在也写进 `feeParams.executionFeeSubsidize`/`executionFeeSubsidizeSize`（之前只在内部的 `paramCheck` 里给参数漂移检查用，没有对外显示；drawer 的"Trading Fees" tab 新增了"Execution Fee Exemption"小节展示）
---
## 五、资金费参数（Funding，2026-08-13 新增，修 bug 时顺手补的）
> 起因：用户从截图发现 drawer 里"Floor Factor"显示 `0.000000%`、"Base Factor"显示 `0.000005%`，跟自己记忆里的年化 `10.95%` 差太远，怀疑显示有 bug。核对后确认：链上数值本身是对的，是显示层漏了"每秒 → 年化"这一步换算——Min/Max Per Second 早就换算了，Floor/Base Factor 没换算，四舍五入之后自然显示成接近 0。
### 资金费率公式（合约怎么算的）
**含义**：这个市场当前每秒的资金费率，由 Floor（地板）+ Base×Skew（失衡加成）算出来，再被 Min/Max 夹住。
**公式**（`MarketUtils.sol:526-539`）：
```plain text
fundingFactorPerSecond = clamp(
  floorFactor + baseFactor × skew / 1e18,
  minFundingFactorPerSecond,
  maxFundingFactorPerSecond
)
```
Floor、Base、Min、Max 这四个都是**同一个 1e30 精度、每秒计**的数字——不是分别用不同单位存的，只是 Min/Max 的键名里带了"_PER_SECOND"字样，Floor/Base 没带，容易让人以为它们是别的单位。`skew` 是 1e18 精度（−1~+1，多空失衡程度）。
### Floor / Base / Min / Max Factor（年化显示）
**含义**：
- **Floor Factor**：资金费率的地板（失衡为 0 时的最低费率）
- **Base Factor**：失衡敏感度——skew 每变化多少，费率往上/下调多少
- **Min/Max Rate**：算出来的费率最终会被夹在这个区间内，不管 Floor+Base×Skew 算出多大
**年化换算公式**（monitor 显示用，跟 `fx100-contracts` 自己的换算约定一致，见 `test/fixtures/Fx100Setup.t.sol` 的 `FX100_SECONDS_PER_YEAR` 常量）：
```plain text
年化% = 链上原始值(1e30精度,每秒) / 1e30 × 31,536,000 × 100
```
`31,536,000` = 365 天 × 86,400 秒/天。
**2026-08-13 现场核对结果**（跟 `docs/analysis/TEST_REVIEW_FINDINGS.md` §7.2 的参考表逐项对比，完全吻合）：

| 参数 | 链上键 | BTC（market 1） | 其余 23 个（含 ETH，共用同一套值） |
|---|---|---|---|
| Floor | `FUNDING_FLOOR_FACTOR` | 10.9500% | 10.9500% |
| Base | `FUNDING_BASE_FACTOR` | 134.5723% | 142.7897% |
| Min | `MIN_FUNDING_FACTOR_PER_SECOND` | −13.3940% | −27.5075% |
| Max | `MAX_FUNDING_FACTOR_PER_SECOND` | 96.5221% | 111.3878% |

只有 BTC 有自己单独的一套值，其余 23 个真实市场（包括 ETH 自己）全部共用同一套"ETH 基线"参数——这不反映各资产真实的流动性差异，是已知的遗留问题（"B 类参数照抄 ETH"），不是 monitor 这边的 bug，是合约配置侧的已知限制。
**代码位置**：
- 合约：`FX100Keys.fundingFloorFactorKey(marketIndex)`/`fundingBaseFactorKey(marketIndex)`（`src/constants/FX100Keys.sol:147-149, 817-824`，逐市场）；`minFundingFactorPerSecondKey`/`maxFundingFactorPerSecondKey` 同样逐市场
- monitor：`marketCollector.ts` 的 `dsV.floorFactor`/`baseFactor`/`minFunding`/`maxFunding` → 写进每个市场 `funding.floorFactor`/`baseFactor`/`minPerSecond`/`maxPerSecond`；前端年化显示用 `fmtAnnualPct`（`asset-drawer.tsx`、`cost-params/page.tsx`）
### Long/Short Per Second（当前算出来的实时费率，不年化，跟 Funding APR 卡片配套）
**含义**：跟上面四个"配置参数"不同，这两个是**当前这一刻算出来的实际费率**（已经过 Floor+Base×Skew 再夹 Min/Max 之后的结果），换算成"每小时"显示，跟 Funding 卡片里"per hour"的口径一致，方便直接对照。
**公式**：`%/h = 链上原始值 / 1e30 × 3600 × 100`
**代码位置**：`marketCollector.ts` 的 `longPerSecond`/`shortPerSecond`；显示用 `fmtPerSecondPct`（跟 Floor/Base/Min/Max 用的年化公式是两套不同的换算，别弄混）
---
## 六、动态价差公式（Dynamic Spread，2026-08-13 新增）
> 起因：用户从截图发现 Oracle tab 里"Skew EMA"显示 `4.2601e-13`、"Constant Spread"显示 `0.0000%`、"Price Impact Param K"显示 `6.0000e-13`，都不对；另外指出 skew 相关参数在 Oracle tab 里缺失，要求把动态价格的完整计算公式和所有参数都列出来。核对后确认：这几个值链上都是 **WEI_PRECISION（1e18）**，monitor 之前当成跟其他大多数因子一样的 **FLOAT_PRECISION（1e30）**去除，差了整整 12 个数量级，四舍五入下来自然看起来像 0 或者极小的科学计数法。
**⚠️ 版本提醒**：下面这套公式是 `origin/release/v0.3.1`（Base Sepolia 真实部署的版本）的。本地 `src/` 已经是 v0.3.2，多加了一个 `min`/`maxDynamicSpread` 的 clamp——链上还没有这个 clamp，讲链上行为不能看本地 `src/`。
### 完整公式（`PositionPricingUtils.sol`，v0.3.1）
```plain text
dynamicSpread = max(0, skewImpact + constantSpread + priceImpactSpread)

priceImpactSpread = min(
  max( exp(orderSizeUsd × K / depth) − 1,  orderSizeUsd / depth ),
  MAX_PRICE_IMPACT_SPREAD
) / 100
  depth = askDepth（多头开仓 / 空头平仓），否则 bidDepth

skewImpact = clamp( skewImpactFactor × skewRef,  minSkewImpact,  maxSkewImpact )
  若这笔交易让多空更平衡（balanceWasImproved），取负值
  skewRef = (交易前 |skew| + 交易后 |skew|) / 2，skew = (long−short)/(long+short)

executionPrice（多头开仓） = oraclePrice.max × (1 + dynamicSpread)
executionPrice（空头开仓） = oraclePrice.min × (1 − dynamicSpread)
```
除了 `orderSizeUsd`/`depth`（USD，1e30）之外，`constantSpread`/`K`/`skewImpactFactor`/`minSkewImpact`/`maxSkewImpact`/`skewRef` 全部是 **WEI_PRECISION，1e18 = 100%**。
### 各参数含义 + 2026-08-13 现场核对的 ETH 真实数值

| 参数 | 链上键 | 精度 | 含义 | ETH 实测值 |
|---|---|---|---|---|
| Constant Spread | `CONSTANT_PRICE_SPREAD` | 1e18 | 每笔交易固定收的点差 | 0.01% |
| Price Impact Param K | `PRICE_IMPACT_PARAMETER` | 1e18 | 价格冲击公式里的指数系数 | 0.6 |
| Skew Impact Factor | `SPREAD_SKEW_IMPACT_FACTOR` | 1e18 | 失衡放大系数 | 0.0025 |
| Min/Max Skew Impact | `MIN`/`MAX_SKEW_IMPACT_FACTOR` | 1e18 | 失衡项的下限/上限 | ±0.5% |
| Skew EMA（当前值） | `FUNDING_SKEW_EMA` | 1e18 | 当前的多空失衡 EMA，喂给 skewRef | ≈0.4062（≈43% 失衡） |
| Bid/Ask Depth | `BID`/`ASK_ORDER_BOOK_DEPTH` | 1e30（USD） | 虚拟订单簿深度，价格冲击公式的分母 | 各市场不同，ETH 约 $7.8M/$7.9M |

**代码位置**：
- 合约：`PositionPricingUtils.sol`（`getDynamicSpread`/`getPriceImpactSpread`/`getSkewImpact`/`getSkewRef`），`origin/release/v0.3.1`
- monitor 读取：`marketCollector.ts` 的 `dsV.constantSpread`/`priceImpactParam`/`skewImpactFactor`/`minSkewImpact`/`maxSkewImpact` → 写进每个市场 `dynamicSpread.*`
- monitor 显示：`asset-drawer.tsx` 的 `fmtFactor18`（Constant Spread）、`fRawWei`（Price Impact K、Skew Impact 三个）、`fmtSkewEma`（改成 `/1e18` 之后）；Oracle tab 新增的"Dynamic Spread Formula"面板把这套公式和上面这张表放在一起显示，方便直接对着算
- `cost-params/page.tsx` 的 Spread tab 同步修了同样的精度 bug，另外 Bid/Ask Depth 从 `fRaw`（无量纲）改成了 `formatUsd`（这里本来就该是美元值）
**这跟"Bid/Ask Depth"上面"Oracle"卡片里的"Bid/Ask Spread"是两个完全不同的东西，别搞混**：
- Oracle 卡片的"Bid/Ask Spread"：Chainlink Data Stream 自己报的 CEX 买卖价差（0.67 bps 那种），跟 FX100 合约完全无关
- 这里的 Dynamic Spread：FX100 合约在 oracle 价格基础上，交易执行时额外收的点差，由上面这套公式算出来

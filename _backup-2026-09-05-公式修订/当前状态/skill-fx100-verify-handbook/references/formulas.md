# 公式卡：FX100 全部核对公式（精粹版）

> 锚点为函数名+参考行号；本卡为 @v0.3.1 快照（费用路由/键签名相关行号已按 v0.3.1 亲核，见 v031-facts.md；其余公式源自对 v0.3.x 系源码的逐行精读），使用前在 `Docs/contract-releases/CURRENT.json` `primary.repoPath` 源码复核（断言以实际实现为准），**以函数名为准**。

> 本卡是**合约层（A 级）**精粹版。前端与 Keeper 自己算的公式（含各自的来源锚点与权威等级）在工作区 `TestCase/E2E/ContractCodeSummary/<release>/` 的 `FX100-前端代码公式.md` 与 `FX100-Keeper代码公式.md`；三层验收关系见同目录 `FX100-功能用例公式与核对依据索引.md` §0。

## 0. 精度体系

USD 金额 1e30（FLOAT_PRECISION）· token 1e18 · index 价 1e12 · USDC 1e6 · USDC 价 1e24 · 点差比例 1e18（1e14=0.01%）· 费率因子 1e30 · LP shares 1e18。
bit 级根基：BigInt 向零截断==EVM 整除；**同序复刻**（截断在每一步，重排乘除即偏 1 wei）；事件为权威值；快照全部读数 pin 同一 blockNumber。

## 1. 零和守恒（总闸，逐 wei，对取整免疫）

```
ΔTrader + ΔOrderVault + ΔPositionVault + ΔLPVault(totalAssets!) + ΔFeeHandler === 0
```
资金流（全在集合内）：创建 trader→orderVault；执行 orderVault→posVault 整额；LP 费份额 posVault→LPVault（协议份额留 posVault 只记 claimable）；盈亏 LPVault↔posVault；payout posVault→trader；claimFees posVault→FeeHandler。**不适用**：withdrawFees（钱出到 RevenuePool，集合外）。整式无除法故对取整免疫——期望值算错它也能兜底。executionFee 走 ETH/WNT，不污染 USDC 账本。

## 2. OI 双账本

- `oiUsd` = cumulativeOpenCosts（**成本口径** = Σ仓位 sizeInUsd，不随价漂移）——PnL 基线/风控上限用；
- `oiTokens` = openInterestInTokens——盯市值 tokens×midPrice 给 **skew** 用；两者之差=该侧待实现 PnL。
- 断言：`oiΔ === positionΔ`（合约同 tx 同 cache 写两账本，恒真）+ 订单原值侧 `=== rawSizeDelta`（USD 模式验 USD 侧、token 模式验 token 侧——另一侧经 execPrice 派生不可预言）。旁观市场双侧 OI 前后**不变**（不是==0）。

## 3. 执行价与动态点差（PositionUtils.getExecutionPriceForIncrease/Decrease、PositionPricingUtils.getDynamicSpread）

```
useMax = (开仓&多) 或 (平仓&空)                        ← "买方"
useMax:  execPrice = ⌈ index.max × (1e18+dynSpread) / 1e18 ⌉
否则:    execPrice = ⌊ index.min × (1e18−dynSpread) / 1e18 ⌋
dynSpread = skewImpact + constantPriceSpread + priceImpactSpread ；≤0 → 0
  depth 项 = min( ⌊max( exp(⌊orderSize×param/depth⌋)−1e18 , ⌊orderSize×1e18/depth⌋ )/100⌋ , MAX_PRICE_IMPACT_SPREAD(全局键) )
    depth = useMax ? ask : bidOrderBookDepth（per-market）；depth==0 或 param==0 → 0
  skew 项 = ⌊factor × skewRef / 1e18⌋；skewRef=(skewBefore+skewAfter)/2，skew=⌊|多−空|×1e18/总和⌋（分母0→0）；
    改善失衡（|next|<|cur| 严格<）取负；先取负后 clamp[min,max]
```
- exp = Balancer LogExpMath **逐位 BigInt 移植**（魔数 x0..x9/a0..a9 + 12 项泰勒逐步截断）——禁用浮点 Math.exp；这是独立算执行价的最大实现件。
- **两大陷阱**：skew 的 OI 必须**盯市口径**（openInterestInTokens×midPrice，非成本口径）；开仓喂 skew 的 tokenDelta 是 getIncreaseOrderSize **预备值**（裸 index 价：多 ⌊USD/index.max⌋ / 空 ⌈USD/index.min⌉），不是事件最终 sizeDeltaInTokens。平仓无此分裂。
- max/min 选择+加减号+取整方向**三者必须同时匹配**，错一个差 1 wei 起。sizeDeltaUsd==0（纯调保证金）走早退分支 dynSpread=0。

## 4. size↔token 四格取整矩阵（每格对 trader 不利）

| | 多头 | 空头 |
|---|---|---|
| 开仓（by execPrice） | ⌊USD/execPrice⌋ | ⌈USD/execPrice⌉ |
| 平仓（按仓位比例，**与 execPrice 无关**） | ⌈sizeInTokens×dUSD/sizeInUsd⌉ | ⌊同式⌋ |

token 模式：开仓 USD=tokens×execPrice 纯乘法无取整；平仓 USD 反推多⌊⌋/空⌈⌉。全平走恒等分支精确清零（无尘埃）。
**限价/触发单**：triggerPrice 只是执行闸门（BaseOrderUtils.validateOrderTriggerPrice 的 8 格价向矩阵），**不是成交价**——成交仍走 oracle×(1±spread)。orderType（**与 GMX 不同序**）：0=MarketIncrease, 1=LimitIncrease, 2=MarketDecrease, 3=LimitDecrease(TP), 4=StopLossDecrease, 5=Liquidation, 6=StopIncrease，无 Swap。

## 5. 资金费（MarketUtils.getNextFundingAmountPerSize / getFundingAmount）

```
f_long = clamp(floorFactor + baseFactor×skewEMA₁ₕ, min, max)    ← 多头有地板，均衡时 funding 不为零
f_short = clamp(−baseFactor×skewEMA, min, max)                   ← 各付各的，净额流向 LP，非纯多空互转
仓位应付 = ⌈ sizeInTokens × Δ(negPerSize) / (1e30×colPrice.min) ⌉   ← min 价+进位（防高频触碰免付）
仓位应收 = ⌊ sizeInTokens × Δ(posPerSize) / (1e30×colPrice.max) ⌋   ← max 价+舍尾
floor funding: positionPaysLp = trunc[(trunc(多OI·f_l·dt/1e30)+trunc(空OI·f_s·dt/1e30))/colMid]
```
- **dt 必须从 execBlock−1 读 fundingUpdatedAt**（执行 tx 自己会覆写，执行块末态读 dt 恒 0）。
- 结算时点：市场累加器每单都推进（用**成交前** OI），仓位 pending 只在该仓位被处理时落账（含存取保证金）；FX100 **自动结算进保证金、无 claimable-funding 领取**。减仓时 funding 按**全仓** size 先结清再减。
- 费率政策本身（EMA 有状态）不可离线重放——信 Funding 事件的 f 值，只核金额恒等式；这是声明的 scope 边界。

## 6. 手续费两档（PositionPricingUtils.getPositionFees）

```
fee = ⌊ ⌊tradeSizeUsd × positionFeeFactor / 1e30⌋ / colPrice.min ⌋   ← 两次独立 floor；合并分母一次除会差 1 wei
```
档位由 balanceWasImproved（本单是否缩小盯市失衡，严格<）选 improved/not-improved 两键；事件 PositionFeesCollected 直接 emit 实际用的 factor。tradeSizeUsd 是执行时按仓位成本比例折算的 USD。此为毛额；协议/LP 分账按 POSITION_FEE_RECEIVER_FACTOR（本部署 5e29=50/50）。

## 7. 平仓 PnL 与支付瀑布（PositionUtils._getPositionPnlUsd / DecreasePositionCollateralUtils.processCollateral）

```
totalPnl = ±(sizeInTokensBefore × execPrice − sizeInUsdBefore)      ← 必须用事件执行价（含 spread），oracle 原价必偏
basePnlUsd = mulDivSigned(totalPnl, dTokens, sizeInTokensBefore, 亏损时幅度⌈⌉)；盈利可能被池级 MAX_PNL_FACTOR 等比例封顶
瀑布（顺序敏感！）：output=0; remColl=抵押
① 盈利>0: output += ⌊basePnl/colPrice.max⌋       ② remColl += 收到的 funding
③ pay(欠的 funding)   ④ 亏损: pay(⌈|basePnl|/colPrice.min⌉)   ⑤ pay(费用 excl funding)
   pay = 先扣 output 再扣 remColl（盈利垫费）
⑥ 全平: output += 全部 remColl / 部分平: += min(请求提取额, remColl)
断言 output === trader 钱包 USDC 实测差（0 容差）
```
只有①④两处真实舍入；funding/费用因 `×min` 再 `⌈÷min⌉` 恒等消去。部分平时 PnL/费用动仓位押金不动钱包（实收可为 0）。破产早退（清算/ADL insolvent close）路径另议。

## 8. Leverage（合约无此变量，五个口径）

1. **合约硬标准**（PositionUtils.isPositionLiquidatable）：`净抵押 = 抵押×colPrice.min + PnL + 待收funding − 总成本(含平仓费+欠funding)`；约束 `净抵押 ≥ sizeInUsd × minCF`。开仓校验 MIN_COLLATERAL_FACTOR、清算判定 MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION。压的是**净抵押**不是毛保证金。
2. 表单杠杆 = OrderValue / Collateral。
3. 持仓面板杠杆 = `sizeInUsd / (collateral − pendingFunding)`——与实时价格无关。
4. 最大可开杠杆 `L_max = 1/(minCF + s_open + s_close + f_open + f_close)`（开仓瞬间入场价差即浮亏）。
5. 通用上限（增仓/调杠杆/新仓三合一）：`C_net + c ≥ (S+d)×closeCost + d×openCost`；closeCost=minCF(+s_close+f_close 安全边际) **压整仓**、openCost=s_open+f_open **只压新增 d**；**C 必须净抵押**（毛值会过度放行）。

## 9. 清算价（Est. Liquidation Price）与浮盈亏

**合约清算判定**（`PositionUtils.isPositionLiquidatable` @PositionUtils.sol:324/399-412）：`可清算 ⟺ 净抵押 < sizeInUsd×mcf_liq`（或净抵押 ≤ 0）。
`净抵押 = collateral×colPrice.min + PnL(带点差执行价·带符号) + 待收funding − 总成本`；`总成本 = 平仓 position fee − 折扣 + 待付funding`（**无清算费、无 borrowing**；isLiquidation=false @PositionUtils.sol:364-365，费用组成 PositionPricingUtils.sol:373-400）。

**清算价闭式**（合约不等式代数反解 ＝ 前端 SDK Path A `packages/sdk/src/utils/positions.ts:281-297` 同构）：
```
多头 liq = ( q×(1 + mcf_liq + ff) − C − I + Φ ) / s
空头 liq = ( q×(1 − mcf_liq − ff) + C + I − Φ ) / s
  q=sizeInUsd  s=sizeInTokens  entry基准=q/s=平均执行价（用 index/oracle 价必偏 ~杠杆×现价×距离）
  C=collateral×colPrice.min  Φ=待付净funding+borrow（待收为负）  I=priceImpactDeltaUsd（含符号）
  mcf_liq=MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION、ff=平仓 POSITION_FEE_FACTOR
```
部署真值（@v0.3.1 base_sepolia params，ETH/marketIndex=2）：**mcf_liq=5e27/1e30=0.5%**、**ff=5e26/1e30=0.05%**（LINK/SOL 市场 ff=0.075%）；`applyFactor=mulDiv(_,factor,1e30)`。门槛 factor 由 forLiquidation 选（清算用 MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION、订单校验用 MIN_COLLATERAL_FACTOR，本 ETH 市场同值 0.5%，换市场必区分 MarketUtils.sol:979/987）。

**页面同口径近似**：display 调用 `userReferralInfo=undefined`、`useMaxPriceImpact` 未定义、funding 用查询快照——与页面对齐时取 **I=0、Φ=0**：新单预览 funding 本就 0；**存量仓 Path A 用 funding 快照、非恒 0**（旧述"funding 预览取 0"仅适用新单预览/Path B）。实证：多头 `(q×1.0055−C)/s`、空头 `(q×0.9945+C)/s` 精确复现页面 Est.Liq 到分（如 ETH 多 (10000×1.0055−993.45)/4.0922=2214.36、空 (2000×0.9945+26.67)/0.821052=2454.98）。

**两种核对法（验的东西不同，勿混）**：
- **(A) 公式/parity（精确·验前端算法）**：pin 同一 blockNumber 取 q/s/C/funding，按闭式独立重算，取 I=Φ=0 与 display 同口径 → 应吻合到分。
- **(B) 事件/ground-truth（近似·验估算落点）**：用真实清算 `PositionDecrease.indexTokenPrice` 比页面 Est.Liq，仅验"落在真实清算邻域"（差 sub-bp~几 bp，来自累计 funding 漂移＋执行点差＋keeper 区块离散，方向：真实略早，**非公式错**）。**切勿拿真实清算价当 parity 基准。**

**前端两路径坑**：Path A（SDK `getLiquidationPrice`，含费含 funding，权威，`preview.liquidationPrice` 非 null 即走它）；Path B（`liqPriceUtils.ts` `estimateNewLiqPrice`＝`entry×(1∓1/lev)`，忽略 mcf/费/funding，偏 ~杠杆倍距离，仅 SDK 未就绪回退）。⚠️ `LiqPriceRow` 的 "(excluding fees)" 标注对 Path A 是**错标**（Path A 实含平仓费，仅描述 Path B）。

**清算价核对陷阱**：①entry 用 q/s 非 index；②必须含平仓费；③parity 取 funding/spread=0 才同口径；④净抵押≠毛保证金；⑤门槛用清算专用 mcf；⑥C/funding/cost 用 .min 价、PnL 用带点差执行价；⑦pin 同块。（源码：PositionUtils.sol:324/384-412、PositionPricingUtils.sol:373-400、MarketUtils.sol:979/987、Precision.sol:23/38；前端 sdk/utils/positions.ts:182-304、_position/{LiqPriceRow,liqPriceUtils}.tsx；常量 base_sepolia_v0.3.1_260729.params.json）

```
Unrealized PnL（显示）= 毛价格 PnL（sizeTokens×oracle−sizeUsd），不含平仓 impact 不含费
Est.Receive ≈ collateral + 毛PnL + 平仓impact − 平仓费 − pendingFunding
```

## 10. 取整方向速查

买方向价格⌈⌉/卖方向⌊⌋；开仓多⌊⌋空⌈⌉、平仓多⌈⌉空⌊⌋；funding 付⌈/min⌉收⌊/max⌋；手续费双⌊⌋；PnL 亏⌈⌉盈⌊⌋；瀑布盈利⌊/max⌋成本⌈/min⌉；清算费⌈/min⌉；分账切桶全⌊⌋余数归协议。**方向、价格边（min/max）、取整三者必须同时匹配。**

# 公式卡：FX100 全部核对公式（精粹版）

> 锚点为函数名+参考行号；本卡为 @v0.3.1 快照（费用路由/键签名相关行号已按 v0.3.1 亲核，见 v031-facts.md；其余公式源自对 v0.3.x 系源码的逐行精读），使用前在 `Docs/contract-releases/CURRENT.json` `primary.repoPath` 源码复核（断言以实际实现为准），**以函数名为准**。

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

## 9. 清算价与浮盈亏

```
多头 liq = entry×(1 + mcf_liq + ff) − netColl/sizeInTokens   （空头镜像）
  entry = sizeInUsd/sizeInTokens = 平均执行价（用 index 价必偏）；必须含平仓费 ff；funding/平仓 spread 预览取 0 是固有近似
Unrealized PnL（显示）= 毛价格 PnL（sizeTokens×oracle−sizeUsd），不含平仓 impact 不含费
Est.Receive ≈ collateral + 毛PnL + 平仓impact − 平仓费 − pendingFunding
```

## 10. 取整方向速查

买方向价格⌈⌉/卖方向⌊⌋；开仓多⌊⌋空⌈⌉、平仓多⌈⌉空⌊⌋；funding 付⌈/min⌉收⌊/max⌋；手续费双⌊⌋；PnL 亏⌈⌉盈⌊⌋；瀑布盈利⌊/max⌋成本⌈/min⌉；清算费⌈/min⌉；分账切桶全⌊⌋余数归协议。**方向、价格边（min/max）、取整三者必须同时匹配。**

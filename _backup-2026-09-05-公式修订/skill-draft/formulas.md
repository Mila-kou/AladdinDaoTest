# 公式卡：FX100 全部核对公式（精粹版）

> 本卡与详解层 **@当前 primary**（`Docs/contract-releases/CURRENT.json` `primary`）对齐，@v0.3.1 专有内容已逐条标注。指针写法：`→ 核心 §x.y` = `TestCase/E2E/ContractCodeSummary/<release>/FX100-核心字段计算公式.md`（合约层 A 级）；`→ 前端 §x` / `→ Keeper §x` = 同目录 `FX100-前端代码公式.md`（B 级）/ `FX100-Keeper代码公式.md`（K1/K2）；`→ traps §n` / `v032-facts §n` / `v031-facts §n` = 本目录对应文件。详解层已写清的推导、分支、数值例本卡只留结论 + 指针；两者矛盾以详解层为准；使用前仍须回 `primary.repoPath` 源码复核，行号仅供定位、以函数名为准。
>
> 本卡是**合约层（A 级）**精粹；三层验收关系见 `FX100-功能用例公式与核对依据索引.md` §0（三层不要求相等）。
>
> 当前 primary 相对 @v0.3.1 影响核对的变更 → `v032-facts.md`（结算 / 计算 / 改写 / 事件 / 配置 / 校验 六节，每条带影响与锚点）· 核心 §22。

## 0. 精度体系

USD 金额、全部 factor/费率 1e30（FLOAT_PRECISION）· 比率 1e18（dynamicSpread、skew、tier multiplier；1e14=0.01%）· LP shares 1e18 → 核心 §1.1。
**token 数量不做标度归一**：`collateralAmount`/`sizeInTokens`/各 `*Amount` 一律是该 token 自身 decimals 的原始整数 → 核心 §1.1。
**价格 = USD × 10^(30−d) / 最小单位**（d = 该 token 登记 decimals；USDC 1e24，18 位 index token 才是 1e12）；SDK `TokenPrices` 恒 1e30/整枚，两层相差 10^d，拿合约标度套 SDK 公式整体偏 10^d 倍 → 核心 §2.5 · 前端 §0。
**index token 不保证 18 位**：合约无一处写死；`sizeInTokens`、价格标度、闸门②门槛全按登记 decimals 取，核对脚本禁写 `/1e18`（当前基线三 fork 均为 18 位只是登记事实，非合约保证）→ 核心 §1.1/§2.5/§18.1。
bit 级根基 → 核心 §1.2/§1.3：BigInt `/` == EVM 整除（无符号 floor；**带符号向零截断 ≠ floor**，`applyFactor(uint,int)`/`toFactor(int)` 先取 |x| 再补号）· 全部 `mulDiv` 走 OZ 512 位中间积，BigInt `(v*n)/d` 等价、ceil 写 `(v*n+d-1n)/d` · **取整恒等式** ⌊⌊x/m⌋/n⌋ = ⌊x/(m·n)⌋（m,n 正整数；ceil 同理）——拆/合同向分母**不差 1 wei**，差 1 wei 的只有「先除后乘」与「floor/ceil 混用」· 事件为权威值 · 快照 pin 同一 blockNumber（→ traps §4）。

## 1. 零和守恒（总闸，逐 wei，对取整免疫）

```
ΔTrader + ΔOrderVault + ΔPositionVault + ΔLPVault(totalAssets!) + ΔFeeHandler === 0
```
资金流全在集合内 → 核心 §13.2（totalAssets 全部流入/流出路径表；`totalAssets = 本地余额 + strategy.totalAssets`）：创建 trader→OrderVault；执行 OrderVault→PositionVault 整额；LP 费份额 `feeAmountForPool` 当场 PositionVault→LPVault，协议份额留 PositionVault 只记 `claimableFeeAmount` → 核心 §7.5；盈亏 LPVault↔PositionVault → 核心 §5.4 ①/④；payout PositionVault→trader。
**Funding 现金流（当前 primary）**：`updateFundingState` **不动钱**，只推指数、刷 `fundingUpdatedAt`、写 skewEMA、发 `Funding` 事件；钱由 `settleFundingFees` 在仓位结算时按**该仓 negative−positive 净差**单向搬：净负 → 记 `FUNDING_FEE_TYPE` claimable（币留 PositionVault，**LPVault 不增**）；净正 → LPVault→PositionVault；相等不动 → 核心 §10.7/§13.2。@v0.3.1 快照：由 `updateFundingState` 按 `positionPaysLp` 直接动账，已删除。
守恒式须单列的科目 → 核心 §5.4 ⑤/§9.5：全平清算/ADL 且费用步付不清时，已扣 token **滞留 PositionVault**（不入池、不入 claimable）；InsolventClose **无保险基金 / 补足路径**：缺口在 funding / PnL / 费用三步各自体现（未付 funding、负 PnL 付不足 → LP 少收；费用清零 → 各收款方少收）。claimable collateral 机制（`claimCollateral`/`incrementClaimableCollateralAmount`/`_getClaimableFactor`）当前 primary **整体删除**，守恒式去掉该科目 → 核心 §22.2。LP 提款缺口路径先发本地余额再按 receiver 余额差校验策略实收（mismatch revert）→ 核心 §13.8。
**不适用**：withdrawFees（钱出到 RevenuePool，集合外）；任何人直接向 vault/strategy 地址转 asset 会抬高 totalAssets 且无事件 → 核心 §13.2。整式无除法故对取整免疫；executionFee 走 ETH/WNT 不污染 USDC 账本，清算单 executionFee=0 → 核心 §8.5。协议费两跳：`claimFees`（PositionVault→FeeHandler，任何人可调）→ `withdrawFees`（FeeHandler→FEE_RECEIVER，onlyFeeKeeper）→ 核心 §10.7；FEE_RECEIVER 具体指向（@v0.3.1 = RevenuePool）、其后分发与账户圈定 → v031-facts §1-2，primary 复核前不作断言。

## 2. OI 双账本（→ 核心 §12 开头表 / §20.1 四行口径表）

- `cumulativeOpenCostsUsd`（**成本口径** = Σ仓位 sizeInUsd，不随价漂移）：市场 PnL 成本项、OI 硬顶/软顶（per-side、严格 > 才 revert、**无「0=不限」豁免**）→ 核心 §12.2/§12.5；
- `openInterestInTokens × 价`（**市值口径**）：skew/funding 用 **midPrice**（→ 核心 §4.3/§10.1）、储备闸门用 `index.max` 双边合计（→ 核心 §12.6）、市场 PnL 用 `pickPriceForPnl`（→ 核心 §12.2）；两者之差 = 该侧待实现 PnL，**不能互相代入**。
- 断言：`oiΔ === positionΔ`（同 tx 同 cache 写两账本 → 核心 §5.1/§5.2；`sizeDeltaUsd==0` 时 OI 整体 no-op）+ 订单原值侧 `=== rawSizeDelta`（USD 模式验 USD 侧、token 模式验 token 侧，另一侧经 execPrice 派生不可预言 → 核心 §3.1「恒等保留 = 最终值」表）。旁观市场双侧 OI 前后**不变**（不是 ==0）。例外：§5.5 `||` 抹平腿不回写 OI、市场级留残值（当前 primary 闸门②已堵 USD-Long 主因；@v0.3.1 对照期望按「仓位删除 + 账本残值」建）→ 核心 §5.5/§22.1。

## 3. 执行价与动态点差（→ 核心 §4；PositionUtils.getExecutionPriceForIncrease/Decrease、PositionPricingUtils.getDynamicSpread）

```
useMax = (开仓&多) 或 (平仓&空)                              ← 买侧；合约/SDK 显示/SDK 执行/Keeper 四处同构（→ 前端 §1）
买侧: execPrice = ⌈ index.max × (1e18 + dynSpread) / 1e18 ⌉   （mulDiv roundUp）
卖侧: execPrice = ⌊ index.min × (1e18 − dynSpread) / 1e18 ⌋   （原生 a×b/c）
dynSpread(int256) = clamp( skewImpact + constantPriceSpread + priceImpactSpread ,
                           MIN_DYNAMIC_SPREAD[market][order.isLong] , MAX_DYNAMIC_SPREAD[同] )
  清算 / ADL(secondaryOrderType) → allowNegativeSpread=false：min 抬到 ≥0，max 沿用普通交易那份；max<min → max=min
  priceImpactSpread = min( ⌊max( exp(⌊orderSize×param/depth⌋)−1e18 , ⌊orderSize×1e18/depth⌋ )/100⌋ , MAX_PRICE_IMPACT_SPREAD(全局键) )
    depth = 买侧 ask / 卖侧 bid（per-market）；depth==0 或 param==0 → 0；指数 > 130e18 → **直接返回上限**（@v0.3.1 快照：revert）
  skewImpact = trunc(SKEW_IMPACT_FACTOR × skewRef / 1e18)，改善失衡(|next|<|cur| 严格<) 取负，再 clamp[MIN,MAX_SKEW_IMPACT](per-market、不分方向)
    skewRef = (skewBeforeAbs + skewAfterAbs)/2，skewAbs = ⌊|多−空|×1e18/总和⌋（分母 0 → 该项 0）
```
- **规模两步**：`getIncreaseOrderSize` 按裸 index 价预解析（多 ⌊USD/index.max⌋ / 空 ⌈USD/index.min⌉）只是喂 `getDynamicSpread` 的中间量；**最终 sizeDeltaInTokens（USD 模式）/ sizeDeltaUsd（token 模式）按含点差 execPrice 重算**（两版皆然，写进仓位/OI/事件的是重算值）→ 核心 §3.1/§4.5/§23.1。平仓无此分裂：规模只由仓位比例决定、拿到执行价后不重算 → 核心 §3.2/§4.6。
- **三分量口径不同** → 核心 §4.3：priceImpact 用覆盖前 `usdDelta`（订单 sizeDeltaUsd）；skew/balanceWasImproved 用 `getNextOpenInterest` 覆写后的 `tokenDelta × mid`，OI 取**盯市**口径（成本口径分支是死分支）。减仓两量传负 → 核心 §4.6。
- **双零陷阱**：MIN/MAX_DYNAMIC_SPREAD 未配置 → `clamp(x,0,0)=0`，常数点差一并被吞、成交价 = 裸 oracle 选价（不是退回 @v0.3.1 的 floor-at-0）；`Config.setInt` 无范围校验 → 核心 §4.1。|dynSpread|>1e18 只有一侧 revert（Panic 0x11），另一侧成倍畸变 → 核心 §1.4/§4.5。
- `sizeDelta==0` 早退：`dynSpread=0`、`balanceWasImproved=false`、`execPrice=pickPrice`、**跳过 acceptablePrice 闸门**；闸门是 revert 不是夹紧；Reader 预览恒按非清算口径 → 核心 §4.5–§4.7。`getDynamicSpread` 的 isLong 取 `order.isLong()`，执行价分支取 `position.isLong()` → 核心 §4.7。
- exp = Balancer LogExpMath **逐句 BigInt 移植**（禁浮点 `Math.exp`）→ 核心 §4.2。事件字段重排（`dynamicSpread` 改 int256 入 intItems）：**按名取值、不按下标** → 核心 §17.8 · v032-facts §4。
- ⚠️ `TestCode/src/reconciliation/formulas.ts::composeDynamicSpread` 仍是 @v0.3.1 floor-at-0、无 min/max 入参，**不可作当前 primary 点差佐证**（→ traps §13）；同文件 `logExpMathExp` 可复用。

## 4. size↔token 四格取整矩阵（每格对 trader 不利 → 核心 §3.4 七行表）

| | 多头 | 空头 |
|---|---|---|
| 开仓 USD 模式（by execPrice） | ⌊USD/execPrice⌋（`0<USD<execPrice` 得 0） | ⌈USD/execPrice⌉（极小额恒 ≥1） |
| 平仓 USD 模式（按仓位比例，**与 execPrice 无关**） | ⌈sizeInTokens×dUSD/sizeInUsd⌉ | ⌊同式⌋ |

token 模式：开仓 USD = tokens×execPrice 纯乘法无取整；平仓 USD 反推多⌊⌋/空⌈⌉。全平走恒等分支精确清零 → 核心 §3.2。部分平「已实现 + 剩余未实现 ≠ 整仓 PnL」（恒 ≤0，量级 1 token-wei 入场价值），**不是守恒不变量** → 核心 §3.4。
**减仓七处订单自动改写**（按源码顺序；改 `sizeDelta` 者重跑 `getDecreaseOrderSize`，期望取改写后值；**⑦ 全平时 `initialCollateralDeltaAmount` 强制置 0 且不发事件**，本金在 `output.outputAmount`）→ 核心 §5.2 阶梯表 / §17.7 · traps §13。
**限价/触发单**：triggerPrice 只是执行闸门（`validateOrderTriggerPrice` 8 格价向矩阵：增仓 Long max/Short min、减仓 Long min/Short max；市价/清算单不校验；不满足原样 revert 不取消）**不是成交价** → 核心 §16.3。orderType（**与 GMX 不同序**）：0=MarketIncrease, 1=LimitIncrease, 2=MarketDecrease, 3=LimitDecrease(TP), 4=StopLossDecrease, 5=Liquidation, 6=StopIncrease，无 Swap；ADL = MarketDecrease + `SecondaryOrderType.Adl` → 核心 §3.3。

## 5. 资金费（→ 核心 §10；MarketUtils.getNextFundingAmountPerSize / getFundingAmount / settleFundingFees）

```
skewRaw = (longOI − shortOI)×1e18/totalOI（OI = tokens×midPrice，盯市，向零截断）；skew = EMA(skewRaw)
  EMA = 连续指数衰减：alpha = exp(−dt/3600)，3600 是**时间常数不是采样间隔**；本次样本只影响下一次费率；dt>41×3600s 直接取 lastValue
f_long  = clamp(floorFactor + baseFactor×skew/1e18, min, max)    ← 多头有地板，均衡时不为零；正 = 该侧付
f_short = clamp(−baseFactor×skew/1e18, min, max)                 ← 各付各的，两侧不互为相反数；floor/base/min/max 用 getInt 读
perSizeΔ.side = ⌊ ⌊sideOIUsd×(|f|×dt)/1e30⌋ × 1e30 / sideOItokens ⌋   ← 中间乘回 1e30，**不可合并**成一次除（这才是重排）
仓位应付 = ⌈ sizeInTokens × Δ(negPerSize) / (1e30×colPrice.min) ⌉   ← 合并分母一次除；min 价 + 进位
仓位应收 = ⌊ sizeInTokens × Δ(posPerSize) / (1e30×colPrice.max) ⌋   ← max 价 + 舍尾（选价与取整硬绑定）
positionPaysLp = trunc[(trunc(多OI·f_l·dt/1e30)+trunc(空OI·f_s·dt/1e30))/colMid]  ← **仅 Funding 事件观测量，不产生现金流**
```
→ 核心 §10.1–§10.6；EMA 递推与衰减 → 核心 §10.2 / §20.1。
- **零 OI 不是 no-op**：`fundingUpdatedAt` 照刷、**skewEMA 清零**、发 `Funding(0,0,0)`，只有 per-size 不动；跨「清仓再开仓」不能沿用旧 EMA → 核心 §19.3 · v032-facts §1。
- dt = `block.timestamp − fundingUpdatedAt`（==0 → 0，市场首次增量必为 0）；Before **必须从 execBlock−1 读**（执行 tx 会覆写，执行块末态 dt 恒 0）→ 核心 §10.4 · traps §4。市场指数每单执行开头推进（含清算/ADL），用**成交前** OI → 核心 §10。
- 仓位侧乘**整仓** sizeInTokens、任何仓位动作（含 sizeDelta=0 存取保证金）全仓结算一次；新仓先把基准对齐市场值故首笔为 0；全平不写回基准 → 核心 §10.5。用户侧自动进/出保证金、无 claim → 核心 §19.2。
- **LP 现金流**：`settleFundingFees` 按该仓净差；**加仓传应付额、减仓传实付额 `amountPaidInCollateralToken`**；实付<应付发 `InsufficientFundingFeePayment`（uintItems 4→3，secondary 字段删）且只在「全平清算/ADL」落账、否则整笔 revert → 核心 §10.7/§19.2。断言不对称：净付 = LPVault 不变 + FUNDING_FEE_TYPE claimable +净差；净收 = LPVault −净差 → 核心 §10.9。
- 费率复算需 execBlock−1 的 `fundingSkewEma` 快照 + LogExpMath 移植；做不到就锚 `Funding` 事件 f 值、只核金额恒等式并标 EVENT_ANCHORED（→ traps §7）。Reader `getPositionInfo` 的 funding 预览把增量 ×2 且恒取 long 侧，只能作上界 → 核心 §19.2。

## 6. 手续费两档（→ 核心 §7；PositionPricingUtils.getPositionFeesAfterReferral）

```
fee = ⌊ ⌊tradeSizeUsd × positionFeeFactor(market, balanceWasImproved) / 1e30⌋ / colPrice.min ⌋
```
**⚠️ 纠正（2026-09-05，保留）**：旧版注「合并分母一次除会差 1 wei」**不成立**——恒等式 ⌊⌊x/m⌋/n⌋ = ⌊x/(m·n)⌋ 对正整数 m=1e30、n=colPrice.min 成立，两步与一步**恒等**；保留两步写法只为忠实源码结构。真正差 1 wei 的是**重排乘除**（先除价格再 applyFactor；对照 §5 perSize 的「中间乘回 1e30」）和 JS Number → 核心 §1.2/§7.1/§7.7（traps §8 同一旧句待同步）。
- 档位：`balanceWasImproved`（|next|<|cur| 严格<；`usdDelta==0` 早退恒 false）选两个独立键，**不假定 improved 档更低**；事件 `PositionFeesCollected` 直接 emit 实际 factor → 核心 §7.1/§17.6。tradeSizeUsd：开仓 = 重算后 sizeDeltaUsd；平仓 = 归一化后 sizeDeltaUsd；清算判定 = 整仓 sizeInUsd → 核心 §7 表。
- 折扣链**乘在已取整 token 数上**，不可压成一式：Pro / referral 折扣**取大不相加**；`protocolFee = fee − affiliateReward − totalDiscount`；affiliateReward 受 `1e30 − max(折扣)` 二次封顶（当前 primary 新增）→ 核心 §7.2–§7.4。分账：协议份额 `⌊protocolFee × POSITION_FEE_RECEIVER_FACTOR(全局键)/1e30⌋` 记 claimable，**余数归 LP 池**当场转 LPVault → 核心 §7.5。UI fee 是**外加**项（不从 fee 内切、不进 protocolFee）→ 核心 §7.6。
- `totalCostAmount = fee + liqFee + uiFee − discount + 应付 funding`（token 口径），应收 funding 不在内 → 核心 §9.1。减仓付不清 → **费用全清零不按比例**，非「全平清算/ADL」则 revert `InsufficientFundsToPayForCosts`；InsolventClose 时同笔有两条费用事件：`PositionFeesInfo`（step=funding/pnl 时携带**未收**应收额）vs `PositionFeesCollected`（全 0，为准）→ 核心 §9.5/§8.6。
- 清算费 → 核心 §8：只在 `orderType==Liquidation` 计（ADL / Reader / 清算判定恒 0）；`liqFeeUsd = ⌊sizeDeltaUsd×liqFactor/1e30⌋`（基数 = 整仓名义规模，非保证金）、`liqFeeAmount = ⌈liqFeeUsd/colPrice.min⌉`（费用类中唯一 ceil）；协议份额 floor、余数并入 `feeAmountForPool`；**清算 Keeper 零补偿**（executionFee=0、无 `KeeperExecutionFee`）。affiliate reward 领取（`claimAffiliateRewards`）@v0.3.1 快照因事件数组越界必失败，当前 primary 可成功 → 核心 §22.2。

## 7. 平仓 PnL 与支付瀑布（→ 核心 §6 / §5.4 / §9.4；PositionUtils._getPositionPnlUsd、DecreasePositionCollateralUtils.processCollateral）

```
totalPnl = ±(sizeInTokensBefore × execPrice − sizeInUsdBefore)      ← 整仓、含点差执行价（oracle 原价必偏；已过 acceptablePrice 校验）
盈利封顶（仅 totalPnl>0）：poolPnl = 本仓**同方向单边** getPnl(maximize=true)；cap = ⌊totalAssets×colPrice.min × MAX_PNL_FACTOR_FOR_TRADERS(market,isLong)/1e30⌋
  min(poolPnl,cap) ≠ poolPnl 且两者>0 → totalPnl = ⌊totalPnl × cappedPoolPnl / poolPnl⌋
basePnlUsd = mulDiv(totalPnl, dTokens, sizeInTokensBefore, 亏损时幅度⌈⌉)；uncappedBasePnlUsd 同式不封顶
瀑布（顺序敏感）：output=0；remColl=抵押
① 盈利>0: output += ⌊basePnl/colPrice.max⌋（LPVault→PositionVault）   ② remColl += 应收 funding
③ pay(应付 funding×min) → settleFundingFees(实付, 应收)               ④ 亏损: pay(⌈|basePnl|/colPrice.min⌉) → LPVault
⑤ pay((fee+liqFee+uiFee−discount)×min)：付清→分账；付不清→费用清零     ⑥ 部分平: 提取额夹到 remColl 后 output += 提取额
  pay = need=⌈costUsd/min⌉，先扣 output 再扣 remColl（盈利垫费）；任一步缺口 → 非「全平清算/ADL」revert，否则 InsolventClose 早退且不回滚已发生动账
⑦ 全平（sizeInUsd==0 **或** sizeInTokens==0）: output += 全部 remColl，删仓      ← 在 processCollateral 之外，漏掉必少算本金
断言 output === trader 钱包 USDC 实测差（0 容差）；transferOut 前另有 output×min ≥ minOutputAmount（**USD 口径**，当前 primary 才接线；@v0.3.1 快照该校验无调用点）否则 revert InsufficientOutputAmount
```
- 只有①④两处真实舍入；③⑤因 `×min` 再 `⌈÷min⌉` 恒等消去 → 核心 §5.4。`basePnl ≠ uncapped` ⇒ 削顶（反向不成立，两值相等不证明未削顶）→ 核心 §6.6。
- 事件符号相反：`PositionIncrease.collateralDeltaAmount` 正 = 保证金增加；`PositionDecrease.collateralDeltaAmount` = 执行前 − 执行后，正 = 减少 → 核心 §5.5。减仓输出只剩 `{outputToken, outputAmount}`，secondary 通道删除 → 核心 §5/§22.3。
- 部分平时 PnL/费用动仓位押金不动钱包（实收可为 0）；减仓收尾对**剩余仓位**再跑 `isPositionLiquidatable(false,false)`（开仓档因子、无 MIN_COLLATERAL_USD 判据、revert 第 3 参恒 0），临界仓位部分平可能 revert `LiquidatablePosition`、全平则整段跳过 → 核心 §5.5/§11.3。

## 8. Leverage（合约无此变量 → 核心 §16.2/§17.4）

1. **合约硬标准**：`净抵押 = collateral×colPrice.min + PnL(整仓执行价) + 应收 funding×min − totalCostAmount×min`，约束 `净抵押 ≥ sizeInUsd × minCF`（`isPositionLiquidatable`）；因子由 `forLiquidation` 决定：开仓/加仓 `MIN_COLLATERAL_FACTOR`、清算 gate `MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION`、**纯加保证金（sizeDeltaUsd==0）走清算档**、减仓收尾走开仓档 → 核心 §11.1–§11.3。开仓另过 `willPositionCollateralBeSufficient`（不算费/点差/未实现 PnL，只减负已实现 PnL；因子 = max(OI 动态因子, MIN_COLLATERAL_FACTOR)；开仓 openInterestDelta=0、减仓 = −sizeDeltaUsd）→ 核心 §11.4。压的是**净抵押**不是毛保证金；两条 minCF 合约不校验大小关系（dev 站登记 26/26 市场相等；按目标环境读键）→ 核心 §11.2/§18.9。
2. 表单杠杆：`targetSizeDeltaUsd = inputMarginUsd × targetLeverage`（前端派生，合约不从杠杆反推）→ 核心 §16.2。
3. 持仓面板杠杆 = `sizeInUsd / effectiveMarginUsd`，`effectiveMargin = collateral − 应付 funding + 应收 funding`（**收−付**；@v0.3.1 快照文档写「付−收」，按名取值须反号）；SDK `getLeverage` 分母另含可选 pnl 与 borrowing，当前配置同值是巧合 → 核心 §17.3/§17.4 · 前端 §4。调杠杆目标 `targetSizeUsd = targetLeverage × effectiveMarginUsd` → 核心 §17.7。
4. 最大可开杠杆**无闭式字段**：由开仓后 `validatePosition` 的净抵押不等式反解，净抵押已扣开仓点差浮亏 + 平仓费 + 应付 funding，故 L_max < 1/minCF；精确值只能二分（方法同 §9 的 Reader 二分 → 核心 §18.3）。旧卡闭式近似 `1/(minCF+s_open+s_close+f_open+f_close)` 与「通用上限 C_net+c ≥ (S+d)×closeCost + d×openCost」未入详解层，**不作断言依据**。
5. `marginRatio = toFactor(净抵押, sizeInUsd)` 与链上整数原式在边界差 1 wei，断言用整数原式 → 核心 §17.4。`remainingCollateralUsd` 一名五义（合约 equity / `willBeSufficient` 返回值 / SDK 公开字段 / `getLeverage` 局部量 / `getLiquidationPrice` 局部量），按名对齐必错 → 核心 §17.4。前端最低抵押三条线（是否含 minCollateralUsd 地板）别混 → 前端 §7。

## 9. 清算价（Est. Liquidation Price）与浮盈亏（→ 核心 §11 / §18）

**合约没有清算价字段**，只有 `isPositionLiquidatable` 布尔判定；「清算价」= 对判定不等式按价反解的 T2 派生量 → 核心 §18 开头。
```
remaining(P) = C + Fp − F + (多 ? Q×P − S : S − Q×P)      Q=sizeInTokens S=sizeInUsd C=collateral×min Fp=应收 funding×min
                                                         F=totalCostAmount×min（平仓费−折扣+应付 funding；**无清算费、无 UI 费、无 borrowing**）
判定（短路）：① remaining < MIN_COLLATERAL_USD（由开关）② remaining ≤ 0 ③ remaining < ⌊S×mcf/1e30⌋；除②外严格 <，等于不触发
T* = max(阈值, 1)；safe ⟺ remaining(P) ≥ T*
闭式（异币种，成交价口径）：多 P_safe = ⌈(S + T* + F − C − Fp)/Q⌉，P_liq = P_safe−1；空 P_safe = ⌊(C + Fp + S − F − T*)/Q⌋，P_liq = P_safe+1
成交价→index 价一次换算（整仓判定下 d 与价无关）：多 indexMin = ⌈P×1e18/(1e18−d)⌉，空 indexMax = ⌊P×1e18/(1e18+d)⌋，d = clamp(raw, minDS', maxDS')，minDS' = max(minDS,0)，maxDS' = max(maxDS, minDS')
```
→ 核心 §11.1/§11.2/§18.1–§18.3。同币种分支（分母 Q ± A×scale）在当前部署**不可达**（`COLLATERAL_TOKEN` 改全局键、抵押品 = USDC）；SDK 用 `getIsEquivalentTokens` 判分支，合成 token 同 symbol 会误入 → 核心 §18.2。PnL 封顶不进闭式（边界在亏损侧）。
- **当前 primary 阈值本身移动**：判定合成订单无条件 `orderType=Liquidation`（allowNegativeSpread=false，四条调用路径同规则）；`balanceWasImproved` 接进判定 → 费档切换 → 阈值随 OI 跳变，清算价快照须与 OI 同块；@v0.3.1 快照两处都不存在 → 核心 §18.4。
- **精确边界唯一权威 = 定点二分 `Reader.isPositionLiquidatable`**，入参必须配对路径：真清算 `(true,true)`、开仓校验 `(true, sizeDeltaUsd==0)`、减仓收尾 `(false,false)`；同时记「最后安全价」与「第一个可清算价」、断言写区间；Reader **不预推 funding**、Keeper 预检传 `(false,true)` → 核心 §18.3 · Keeper §9。
- **前端路径**：各界面一律 **Path A（SDK `getLiquidationPrice`，bigint）优先**，下单预览与杠杆弹窗在 SDK 返回 null 时才回退 **Path B**（`estimateNewLiqPrice` = `entry×(1∓1/lev)`，浮点、忽略 mcf/费/funding），保证金弹窗与持仓列表无兜底——**不是按界面二选一**；证据须记录本次实际走的哪条，Path B 永不作 parity 基准；`LiqPriceRow` "(excluding fees)" 对 Path A 是错标 → 前端 §5/§6 表。
- **Path A 与合约的分叉项**（parity 前逐项对齐）→ 核心 §18.5：应收 funding **无入参**（多头偏高、空头偏低，两向偏保守）· 费档写死 `false` 且 USD 单次 applyFactor · 折扣调用点不一致（持仓面板传 referral，弹窗/下单传 undefined）· `priceImpactDeltaUsd` 建立在**死键**上（`POSITION_IMPACT_FACTOR`/`MAX_POSITION_IMPACT_FACTOR_FOR_LIQUIDATIONS` 无调用方，SDK 恒读 0；环境配非零则页面动、链上不动）· `pendingBorrowingFeesUsd` 恒 0（ABI 无 borrowing 字段，勿删核对项）· 无 dynamicSpread · 先除后乘丢 ≤10^posSizeDecimals wei。
- **两种核对法勿混**：(A) parity——pin 同块取 Q/S/C/funding，按闭式重算并对齐上列分叉项后应吻合到分；(B) ground-truth——真实清算 `PositionDecrease.indexTokenPrice` 只验「落在邻域」，真实略早来自 funding 漂移 + 执行点差 + Keeper 清算取最新有效报文非极值 + 区块离散，**非公式错**，切勿当 parity 基准 → Keeper §1.2/§10。
- Keeper 近似清算价 `mid ± effectiveShortfallUsd/sizeInTokens`，`effectiveShortfallUsd = minCollateralUsdForLeverage − remainingCollateralUsd` 是 **Keeper 自减的 K2 量，不是 Reader 字段** → Keeper §4.1。
- 陷阱清单 → 核心 §18.7–§18.9：entry 用 q/s 非 index · 含平仓费 · 净抵押 ≠ 毛保证金 · 门槛用路径对应 mcf · C/funding/cost 用 .min、PnL 用带点差执行价 · 抵押品脱锚不按 $1 硬算 · 两档费率与两条 minCF 逐市场读键 · index decimals 不写死 · 三个「净值」（合约 remaining / SDK `netValue` / 面板 Net Value）点名取哪个 · 宽限期 `graceEnd` 三点覆盖、开仓即计时，页面 15 分钟只是兜底常量。

```
Unrealized PnL（显示）= 毛价格 PnL（sizeTokens×mark − sizeUsd），不含点差不含费；链上 basePnlUsd 含点差、含封顶 → 核心 §17.5
Est.Receive ≈ collateral + 应收 funding − 应付 funding + 毛PnL − 平仓费 − uiFee − 清算费(仅清算单)；精确到账走 §7 瀑布 → 核心 §17.6
```

## 10. 取整方向速查（→ 核心 §1.3 ceil 全表 / §2.3 选价配对表）

买侧价格⌈⌉/卖侧⌊⌋（负点差不改取整）· 开仓多⌊⌋空⌈⌉、平仓多⌈⌉空⌊⌋ · funding 付⌈/min⌉收⌊/max⌋（选价与取整硬绑定，无「min+floor」组合）· 手续费/UI 费双⌊/min⌋ · PnL 亏⌈⌉盈⌊⌋ · 瀑布盈利⌊/max⌋成本⌈/min⌉ · 清算费⌈/min⌉ · 分账协议份额⌊⌋余数归 LP 池 · skewImpact/带符号 applyFactor **向零截断** · 清算价反解多⌈⌉空⌊⌋ · `Calc.clamp` 等号不钳、判定三条件除②外严格 < · 付出侧一律 .min、收取侧一律 .max（仅限仓位/费用调用点，relay fee 不套用）。**方向、价格边（min/max）、取整三者必须同时匹配。**

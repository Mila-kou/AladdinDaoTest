---
title: fx100-trading-guide.zh
notion_url: https://app.notion.com/p/3913d7873f2c80678f52e80e4bace076
author: Gordon (chao@aladdin.club)
last_edited: 2026-07-02
archived: 2026-07-28
---

# FX100 交易指南
> FX100 是部署在 **Base** 上的去中心化永续合约交易平台。它用**预言机定价**(无订单簿)撮合交易,支持最高 **100x** 的多头 / 空头杠杆,以 **USDC** 作为抵押品。本指南面向交易者,系统说明 FX100 的定价、下单、杠杆、盈亏、清算与费用规则,帮助你在下单前完全理解每一个数字的来龙去脉。
	文中涉及计算的地方直接给出英文公式,便于与合约行为逐项对照。
---
## 目录
1. [FX100 是什么](about:blank#1-fx100-%E6%98%AF%E4%BB%80%E4%B9%88)
2. [核心概念](about:blank#2-%E6%A0%B8%E5%BF%83%E6%A6%82%E5%BF%B5)
3. [价格与执行](about:blank#3-%E4%BB%B7%E6%A0%BC%E4%B8%8E%E6%89%A7%E8%A1%8C)
4. [订单类型](about:blank#4-%E8%AE%A2%E5%8D%95%E7%B1%BB%E5%9E%8B)
5. [杠杆与保证金](about:blank#5-%E6%9D%A0%E6%9D%86%E4%B8%8E%E4%BF%9D%E8%AF%81%E9%87%91)
6. [开仓价、盈亏与平仓](about:blank#6-%E5%BC%80%E4%BB%93%E4%BB%B7%E7%9B%88%E4%BA%8F%E4%B8%8E%E5%B9%B3%E4%BB%93)
7. [资金费](about:blank#7-%E8%B5%84%E9%87%91%E8%B4%B9)
8. [费用](about:blank#8-%E8%B4%B9%E7%94%A8)
9. [清算](about:blank#9-%E6%B8%85%E7%AE%97)
10. [清算保护(Liquidation Brake)](about:blank#10-%E6%B8%85%E7%AE%97%E4%BF%9D%E6%8A%A4liquidation-brake)
11. [流动性与 LP](about:blank#11-%E6%B5%81%E5%8A%A8%E6%80%A7%E4%B8%8E-lp)
12. [预言机与价格风险](about:blank#12-%E9%A2%84%E8%A8%80%E6%9C%BA%E4%B8%8E%E4%BB%B7%E6%A0%BC%E9%A3%8E%E9%99%A9)
13. [与 Hyperliquid / GMX 的对比](about:blank#13-%E4%B8%8E-hyperliquid--gmx-%E7%9A%84%E5%AF%B9%E6%AF%94)
14. [常见问题(FAQ)](about:blank#14-%E5%B8%B8%E8%A7%81%E9%97%AE%E9%A2%98faq)
---
## 1. FX100 是什么
FX100 是一个**预言机驱动**的永续合约 DEX。与 Hyperliquid 这类**订单簿**撮合的交易所不同,FX100 没有买卖挂单簿——你的每一笔成交都按**预言机价格 ± 动态点差**来定价并即时执行。这套模型继承自 GMX V2 的设计思路,但在此之上 FX100 有三个鲜明特点:
- **清算保护(Liquidation Brake)**:每笔新开仓自带 **15 分钟**免清算宽限期,期间即使价格触及你的清算价也不会被强平,专门抵御瞬时插针。见 [§10](about:blank#10-%E6%B8%85%E7%AE%97%E4%BF%9D%E6%8A%A4liquidation-brake)。
- **极低的资金费 + 无借贷费**:FX100 不收借贷费,资金费也远低于传统永续——均衡时仅多头支付一笔很小的基础(floor)费给 LP、空头不付,失衡时较轻一侧还可能收取;全部自动结算进保证金、无需手动领取。见 [§7](about:blank#7-%E8%B5%84%E9%87%91%E8%B4%B9)。
- **交易者与 LP 直接对赌**:LP(流动性提供方)是所有交易的对手方——交易者的盈利由 LP 支付,亏损归入 LP。LP 同时赚取仓位费。
**一句话**:用 CEX 般顺滑的一键市价 / 限价体验,交易 BTC、ETH 等资产的 100x 永续,同时享受链上自托管、清算保护与常态零资金费。
---
## 2. 核心概念
<table header-row="true">
<tr>
<td>概念</td>
<td>含义</td>
</tr>
<tr>
<td>**预言机价格(Oracle Price)**</td>
<td>链上参考价,来自 Chainlink Data Streams(主)等来源。分为中间价 / 买价(ask)/ 卖价(bid)。所有盈亏、清算都以它为基准。</td>
</tr>
<tr>
<td>**标记价格(Mark Price)**</td>
<td>用于计算未实现盈亏与清算的价格,等同预言机价。</td>
</tr>
<tr>
<td>**抵押品(Collateral / Margin)**</td>
<td>你为某个仓位存入的 USDC,按 ≈ \$1/枚 计价。</td>
</tr>
<tr>
<td>**隔离保证金(Isolated)**</td>
<td>每个仓位有**各自独立**的保证金,一个仓位被清算不影响其它仓位。多头与空头是两个独立仓位。</td>
</tr>
<tr>
<td>**名义规模**</td>
<td>`sizeInUsd`(以开仓执行价记的美元名义额)与 `sizeInTokens`(标的数量)。</td>
</tr>
<tr>
<td>**开仓价(Entry Price)**</td>
<td>`sizeInUsd / sizeInTokens`,即你实际成交的执行价(含点差),而非预言机中间价。</td>
</tr>
<tr>
<td>**杠杆(Leverage)**</td>
<td>名义规模 ÷ 净抵押。详见 [§5](about:blank#5-%E6%9D%A0%E6%9D%86%E4%B8%8E%E4%BF%9D%E8%AF%81%E9%87%91)。</td>
</tr>
</table>
---
## 3. 价格与执行
### 3.1 预言机价格
FX100 的参考价来自预言机,分三个口径:
- **中间价(Mid)**:链上参考中价。
- **买价 / 卖价(Ask / Bid)**:开多 / 平空按 ask 侧,开空 / 平多按 bid 侧。
### 3.2 点差(Spread)
你的**成交价 = 预言机价 ± 动态点差**。点差由三部分组成,始终对你不利方向叠加:
```plain text
totalSpread = constantSpread + depthSpread + skewImpact      (clamped ≥ 0)
```
- **常量点差(Constant Spread)**:每个市场固定的一小段基础点差(如 0.01%)。
- **深度点差(Depth Spread)**:随**订单规模**增大而增大——单越大,吃掉的流动性越深,点差越高。小单接近 0。
	```plain text
depthSpread = max( exp(orderSize · k / depth) − 1 , orderSize / depth ) / 100
	```
- **偏斜冲击(Skew Impact)**:取决于你的单让市场的多空失衡**变好还是变坏**。
	- 你站在**较轻的一侧**(改善失衡)→ 冲击**为负**,你**占便宜**(成交价更优)。
	- 你**加剧失衡** → 冲击为正,你**付出溢价**。
	- 完全均衡时为 0。
### 3.3 执行价公式
```plain text
useMax   = (open & long) OR (close & short)
execPrice = useMax ? ceil( indexAsk · (1 + totalSpread) )
                   : floor( indexBid · (1 − totalSpread) )
```
- 开多 / 平空取 ask 侧、向上取整;开空 / 平多取 bid 侧、向下取整——**取整方向始终对交易者不利**(交易所惯例)。
- **要点**:因为有点差,你的成交价**必然略差于**预言机中间价;单越大,差得越多。下单预览会显示预计执行价,请以预览为准。
---
## 4. 订单类型
FX100 支持市价单与四类触发单。**关键区别**:市价单可设最差可接受价(滑点保护);**所有触发单在触发后一律按市价成交**(见 [§4.3](about:blank#43-%E8%A7%A6%E5%8F%91%E5%8D%95%E7%9A%84%E6%89%A7%E8%A1%8C%E8%AF%AD%E4%B9%89%E5%8A%A1%E5%BF%85%E7%90%86%E8%A7%A3))。
### 4.1 市价单(Market)
立即按 `execPrice` 成交。可设**滑点保护**:
```plain text
maxAcceptablePrice = execPrice · (1 ± slippage)
   开多 / 平空:  · (1 + slippage)     (最差价更高)
   开空 / 平多:  · (1 − slippage)     (最差价更低)
```
若实际执行价超出该最差价,订单会被取消而不是以更差价格成交。
### 4.2 触发单(Limit / Stop / TP / SL)
FX100 没有订单簿,触发单是**"预言机价触达 → 转为市价成交"**的条件单:
<table header-row="true">
<tr>
<td>类型</td>
<td>用途</td>
<td>触发条件(多头)</td>
<td>触发条件(空头)</td>
</tr>
<tr>
<td>**限价开仓(Limit)**</td>
<td>低吸开多 / 高抛开空</td>
<td>预言机 **≤** 触发价</td>
<td>预言机 **≥** 触发价</td>
</tr>
<tr>
<td>**突破开仓(Stop)**</td>
<td>突破追多 / 破位追空</td>
<td>预言机 **≥** 触发价</td>
<td>预言机 **≤** 触发价</td>
</tr>
<tr>
<td>**止盈(Take-Profit)**</td>
<td>盈利了结</td>
<td>预言机 **≥** 触发价</td>
<td>预言机 **≤** 触发价</td>
</tr>
<tr>
<td>**止损(Stop-Loss)**</td>
<td>限制亏损</td>
<td>预言机 **≤** 触发价</td>
<td>预言机 **≥** 触发价</td>
</tr>
</table>
> FX100 前端在开仓时会**按触发价与现价的关系自动判断**是"限价(低吸)"还是"突破(追涨)",无需手动切换,从根源避免设错方向。
### 4.3 触发单的执行语义(务必理解)
触发单一旦被触发,**以当时的预言机市价成交,而不是以触发价成交**。技术上,触发单的"可接受价"被设为哨兵值(买单 = 无上限,卖单 = 无下限):
```plain text
acceptablePrice  (触发单恒为哨兵,等价于"接受任何市价")
   开仓:  long → MaxUint256 ,  short → 0
   平仓:  long → 0          ,  short → MaxUint256
```
由此产生两条你必须知道的规则:
1. **触发价不是成交价上限 / 下限。** 例如你挂 \$200 的限价开多,触发后按市价成交,实际成交价 = 预言机价 ×(1 + 点差),可能**略高于 \$200**。这是刻意设计,保证止损这类单在剧烈行情中一定能成交。
2. **触发单不支持"最差可接受价 / 最大滑点"设置。** 该设置只对市价单生效。前端若显示滑点字段,对触发单不起作用。
**止盈 / 止损预览**(方向以仓位多空为准):
```plain text
Expected Profit (TP) = sizeInTokens · (triggerPrice − entryPrice)     (多头;空头反向)
Expected Loss  (SL)  = sizeInTokens · |markPrice − triggerPrice|
TP% / SL%            = priceChange / mark · leverage
```
---
## 5. 杠杆与保证金
### 5.1 隔离保证金,抵押优先
- **隔离**:每个仓位有独立抵押,风险互不传染。
- **抵押优先(collateral-first)**:你先投入抵押(或选择杠杆,由系统反推所需抵押),仓位随之建立。抵押币种为 **USDC**。
### 5.2 杠杆的定义
```plain text
下单预览:  Leverage = OrderValue / Collateral         其中 OrderValue = sizeInTokens · oraclePrice
持仓面板:  Leverage = sizeInUsd / (collateral − pendingFunding)
```
- 持仓面板的杠杆用**净抵押**(抵押 − 待结算资金费)计算,因此**与实时价格无关**、不随价格抖动;它反映当前净抵押下的杠杆,不一定等于你开仓时选择的杠杆。
- **注意**:当保证金很小、资金费已累积时,净抵押被压缩,显示杠杆可能**高于**你的开仓杠杆。真实清算风险请看**清算价**,而非这个数字。
- 未实现盈亏**不计入**杠杆分母(所以价格波动不改变杠杆显示)。
### 5.3 最大可开杠杆
FX100 支持最高 **100x**,但单笔可开的上限还要扣掉点差与费用:
```plain text
maxLeverage = 1 / (minCollateralFactor + s_open + s_close + f_open + f_close)
```
- `minCollateralFactor` = 开仓所需最低抵押率(每市场配置);
- `s_open / s_close` = 开 / 平方向的动态点差;`f_open / f_close` = 开 / 平仓位费。
因此在流动性浅或单量大时,实际可开杠杆会**略低于**理论上限——点差吃掉了一部分空间。预览会显示当前可开的最大杠杆。
### 5.4 调整保证金 / 调整杠杆
```plain text
调整保证金:  newMargin   = currentMargin ± amount
             newLeverage = sizeInUsd / newMargin
调整杠杆:    targetSize  = targetLeverage · collateral        (保持抵押不变、改名义规模)
             sizeChange  = targetSize − currentSize
             estFee      = |sizeChange| · positionFeeFactor    (仅加仓部分收费)
```
- 加保证金 = 清算价远离现价(更安全);减保证金 = 更接近清算。
- 调高杠杆 = 加大名义规模(相当于加仓,按增量收仓位费)。
### 5.5 最小限制
存在**最小抵押**与**最小仓位名义**(如各 ≈ 若干美元)。低于阈值的订单会被拒绝。
---
## 6. 开仓价、盈亏与平仓
### 6.1 开仓价
```plain text
entryPrice = sizeInUsd / sizeInTokens
```
开仓价记录的是**执行价**(含点差),而非预言机中间价。它是此后所有盈亏与清算计算的基准,不随市场重新标记。
### 6.2 未实现盈亏(Unrealized PnL)
```plain text
LONG  : Unrealized PnL = sizeInTokens · oraclePrice − sizeInUsd
SHORT : Unrealized PnL = sizeInUsd − sizeInTokens · oraclePrice
```
- 这是**纯价格盈亏**——**不含**资金费、平仓费、平仓价格冲击。
- **盈亏百分比(ROE)= 未实现盈亏 ÷ 初始保证金。**
- 空头的正盈利受**资金池 PnL 上限**约束:当空头浮盈超过 `maxPnlFactor × poolValue` 时会被封顶(保护 LP)。
### 6.3 未实现盈亏 ≠ 平仓能拿回
平仓真正能拿回的金额与浮盈亏不同,因为平仓会实现价格冲击并扣除费用:
```plain text
Est. Receive ≈ collateral + UnrealizedPnL + closingImpact − closingFee − pendingFunding
```
- `closingImpact` = 平仓那一刻的价格冲击(平仓才实现,故不进浮盈亏显示);
- `closingFee` = 平仓仓位费;`pendingFunding` = 待结算资金费(常态为 0)。
所以**页面顶部的浮盈亏是"纯价格盈亏",而"预计可得(Est. Receive)"才是把冲击与费用都算进去后实际到账的数**。
---
## 7. 资金费
FX100 的资金费整体远低于传统永续,且**自动结算进保证金、无需手动领取**。但请准确理解它的构成——它不是简单的"多空互转",也**不是在均衡时完全为零**:
- **多头始终支付一笔很小的基础(floor)资金费给 LP 池**,即使多空持仓量完全均衡时也照收;**空头在均衡时不付资金费。**
- **失衡时**:较拥挤的一侧付得更多,净额流向 LP 池;**较轻的一侧可能收取**资金费(自动计入保证金)。
- **净额流向 LP**:资金费本质来自多空两侧费率公式的差(floor fee),净额进入 LP 池,而**不是**由一方直接付给另一方。
- **自动结算进保证金,无需领取,**FX100 把资金费**直接结算进你的仓位保证金**——付则从保证金扣、收则加进保证金,**没有需要手动 claim 的余额**。
- **符号约定**:持仓面板 `Funding` 列为负 = 你在支付;为正 = 你在收取。
费率公式(合约按每秒计,界面按每小时 % 显示):
```plain text
skew    = 1h-EMA( (longOI − shortOI) / totalOI )
f_long  = clamp( floorFactor + baseFactor · skew , min, max )    // floor 只加在多头侧
f_short = clamp(              − baseFactor · skew , min, max )
```
- 均衡时(`skew = 0`):`f_long = floorFactor > 0`(多头付 floor 给 LP)、`f_short = 0`(空头不付)。
- 某侧费率 \> 0 = 该侧**付**;\< 0 = 该侧**收**(自动计入保证金)。
---
## 8. 费用
交易者实际承担的费用如下,**全部在下单预览中提前展示**:
<table header-row="true">
<tr>
<td>费用</td>
<td>说明</td>
</tr>
<tr>
<td>**仓位费(Position Fee)**</td>
<td>开仓与平仓各收一次,按名义规模的一个比例(每市场配置,通常约 0.02%–0.06%/侧)。预览可见。</td>
</tr>
<tr>
<td>**执行费(Execution Fee)**</td>
<td>支付给 keeper 的链上执行 gas。小单由你预付、执行后多退;**清算与部分大额订单由协议补贴**(执行费为 0)。</td>
</tr>
<tr>
<td>**资金费(Funding)**</td>
<td>整体很低:均衡时仅多头付一笔很小的 floor 给 LP、空头不付;失衡时较拥挤侧多付、较轻侧可能收。自动进保证金,无需领取。见 [§7](about:blank#7-%E8%B5%84%E9%87%91%E8%B4%B9)。</td>
</tr>
<tr>
<td>**借贷费(Borrowing Fee)**</td>
<td>**FX100 不收借贷费**(相较 GMX 已移除)。</td>
</tr>
<tr>
<td>**推荐返佣(可选)**</td>
<td>通过推荐码交易可获得手续费折扣(具体比例以活动为准)。</td>
</tr>
</table>
---
## 9. 清算
### 9.1 维持保证金因子
每个市场有一个**清算维持因子** `minCollateralFactorForLiquidation`(下文简记 **`minCF_liq`**),它**低于**开仓所需的最低抵押率——两者之差即为安全缓冲。当净抵押跌到维持线以下即触发清算:
```plain text
remainingCollateral = collateral + PnL(oracle) + closingImpact − closingFee − pendingFunding
if  remainingCollateral ≤ sizeInUsd · minCollateralFactorForLiquidation:
        → 可被清算
```
### 9.2 清算价公式
```plain text
LONG  : liqPrice = entryPrice · (1 + minCF_liq + closeFeeRatio) − netCollateral / sizeInTokens
SHORT : liqPrice = entryPrice · (1 − minCF_liq − closeFeeRatio) + netCollateral / sizeInTokens

where  netCollateral = collateral + closingImpact − pendingFunding
```
符号说明:<br>- **`minCF_liq`** = `minCollateralFactorForLiquidation`,清算维持因子(每市场配置,见 [§9.1](about:blank#91-%E7%BB%B4%E6%8C%81%E4%BF%9D%E8%AF%81%E9%87%91%E5%9B%A0%E5%AD%90))。<br>- **`closeFeeRatio`** = 平仓仓位费率(见 [§8](about:blank#8-%E8%B4%B9%E7%94%A8))。<br>- **`netCollateral`** = 净抵押 = 抵押 + 平仓价格冲击 − 待结算资金费(`pendingFunding` 常态为 0)。<br>- **`entryPrice`**** / ****`sizeInTokens`** 见 [§6.1](about:blank#61-%E5%BC%80%E4%BB%93%E4%BB%B7)。
理解要点:<br>- **含平仓费**:清算是被迫平仓,平仓费照收,所以计入。<br>- **含平仓价格冲击**:清算价问的是"现在平掉还剩多少",故计入。<br>- **不含未来资金费**:未来资金费无法预估,取 0。
### 9.3 谁来执行
清算由 keeper(清算人)按当前预言机价触发执行,并收取一笔**清算费**(从剩余抵押中扣除,而非额外向你收取)。
---
## 10. 清算保护(Liquidation Brake)
**每一笔新开仓,自动获得 15 分钟的免清算宽限期。**
- **规则**:开仓后的 **15 分钟**内,**即使预言机价格触及甚至越过你的清算价,仓位也不会被清算。**
- **目的**:抵御瞬时插针 / 短时剧烈波动造成的"误清算"——只要价格在宽限期内回到安全区,你的仓位就安然无恙。
- **仅在"新开仓"时计时,加仓不延长**:宽限期从你**首次开仓**那一刻起算;在已有仓位上**继续加仓不会重置或延长**它。想重新获得完整的 15 分钟保护,需**先平掉仓位、再重新开一笔新仓**(注意重开会再产生一次开 / 平仓费)。
- **界面**:持仓面板的 `Est. Liq. Price / Liq. Prot.` 会显示清算价与保护倒计时。
- **宽限期结束后**:恢复正常清算规则(见 [§9](about:blank#9-%E6%B8%85%E7%AE%97))。
> 这是 FX100 "Zero Liquidation Risk" 定位的核心机制。它不消除清算价本身,而是给你一段**受保护的缓冲时间**,大幅降低被行情噪声扫出局的概率。
---
## 11. 流动性与 LP
### 11.1 可用流动性(Available Liquidity)
某市场某一侧可开的名义额受多重上限约束,取最小值:
```plain text
availableLiquidity = min(
    maxOpenInterest − currentOI,               // 该市场持仓硬上限
    poolValue · reserveFactor − reserved        // 池子按 reserveFactor 可承接的额度
) 及其它风控上限
```
- **储备因子(Reserve Factor)**:每个市场配置一个比例,决定池子价值中有多少可用于该市场的持仓(例如 BTC 更高、其它资产更保守)。
- 池子越大、reserveFactor 越高 → 可用流动性越深。当可用流动性不足以容纳你的单时,订单会被拒绝或静默取消。
### 11.2 LP 的角色
LP 向池子存入流动性,承担交易对手方并获得收益:
- 赚取**仓位费**;
- 赚取失衡时的**净资金费**;
- 作为**对手方**结算交易者盈亏(交易者赚 = LP 付,交易者亏 = LP 收)。
---
## 12. 预言机与价格风险
- **来源**:主用 **Chainlink Data Streams**(链下签名报价,含 bid/ask),并配置备份来源;部分部署用参考源做偏差校验。
- **时效性**:预言机价有最大有效期(`MAX_ORACLE_PRICE_AGE`,生产环境约 30–60 秒)。**过期的价格会导致下单 / 清算被拒绝**,直到取得新鲜价格。
- **偏差保护**:当主预言机价格与参考源偏离超过阈值(如 2%)时,相关操作会被拒绝,防止坏价成交。
- **Sequencer 保护**:Base 为 Optimistic Rollup,排序器故障恢复期内有保护性拒绝。
- **无自动降级**:主预言机失效时协议会**冻结**(不成交、不清算),需由治理**手动切换**到备份来源;切换设有时间锁以防抖动。
---
## 13. 与 Hyperliquid / GMX 的对比
<table header-row="true">
<tr>
<td>维度</td>
<td>**FX100**</td>
<td>**Hyperliquid**</td>
<td>**GMX V2**</td>
</tr>
<tr>
<td>撮合方式</td>
<td>预言机定价(无订单簿)</td>
<td>中央限价订单簿</td>
<td>预言机定价(无订单簿)</td>
</tr>
<tr>
<td>保证金</td>
<td>隔离(逐仓)</td>
<td>逐仓 / 全仓可选</td>
<td>隔离(逐仓)</td>
</tr>
<tr>
<td>杠杆显示</td>
<td>名义 / 净抵押(不含浮盈亏,不随价抖)</td>
<td>用户设定值(固定)</td>
<td>名义 / 净权益(含浮盈亏,随价动)</td>
</tr>
<tr>
<td>资金费</td>
<td>很低:多头付极小 floor→LP、空头均衡时不付;失衡时较轻侧可能收。自动进保证金</td>
<td>每小时点对点结算</td>
<td>有,轻仓侧需手动领取</td>
</tr>
<tr>
<td>借贷费</td>
<td>**无**</td>
<td>无</td>
<td>有</td>
</tr>
<tr>
<td>清算保护</td>
<td>**开仓 15 分钟免清算宽限**</td>
<td>无</td>
<td>无</td>
</tr>
<tr>
<td>对手方</td>
<td>LP 池(Trader↔︎LP 直接对赌)</td>
<td>对手方交易者</td>
<td>GLP / GM 池</td>
</tr>
<tr>
<td>触发单成交</td>
<td>触发后按市价(触发价不封顶)</td>
<td>订单簿限价可精确成交</td>
<td>触发后按市价</td>
</tr>
</table>
**FX100 的差异化**:极低资金费 + 无借贷费 + 15 分钟清算保护,面向"想长期持有高杠杆头寸、又不想被高资金费和插针清算折磨"的交易者。
---
## 14. 常见问题(FAQ)
**Q:为什么我的成交价和预言机价不一样?**<br>A:因为有动态点差(常量 + 深度 + 偏斜)。成交价 = 预言机价 ±(对你不利方向的)点差,单越大差得越多。见 [§3](about:blank#3-%E4%BB%B7%E6%A0%BC%E4%B8%8E%E6%89%A7%E8%A1%8C)。
**Q:为什么持仓显示的杠杆比我开仓时选的高?**<br>A:持仓杠杆按**净抵押**(抵押 − 待结算资金费)计算。当保证金小、资金费已累积时,净抵押被压缩,显示杠杆会高于开仓值。这是当前真实杠杆,真实风险请看清算价。见 [§5.2](about:blank#52-%E6%9D%A0%E6%9D%86%E7%9A%84%E5%AE%9A%E4%B9%89)。
**Q:未实现盈亏为什么不等于我现在平仓能拿回的钱?**<br>A:浮盈亏是**纯价格盈亏**,不含平仓的价格冲击与费用;平仓真正到账用 `Est. Receive`(已扣冲击、费用、资金费)。见 [§6.3](about:blank#63-%E6%9C%AA%E5%AE%9E%E7%8E%B0%E7%9B%88%E4%BA%8F--%E5%B9%B3%E4%BB%93%E8%83%BD%E6%8B%BF%E5%9B%9E)。
**Q:什么时候会产生资金费?**<br>A:多头始终支付一笔很小的基础(floor)资金费给 LP 池,即使多空均衡时也如此;空头在均衡时不付。失衡时较拥挤侧付得更多、较轻侧可能收取。全部自动结算进保证金,无需手动领取。见 [§7](about:blank#7-%E8%B5%84%E9%87%91%E8%B4%B9)。
**Q:15 分钟清算保护过后会怎样?**<br>A:恢复正常清算规则——宽限期只保护开仓后的头 15 分钟,之后价格触及清算价即可被清算。**保护只在"新开仓"那一刻开始计时,加仓不会延长**:在已有仓位上继续加仓,宽限期沿用最初开仓的起点、**不会重置**;只有**先平仓、再重新开一笔新仓**才能获得全新的 15 分钟保护。所以如果你想重新拿到保护窗口,可以考虑平仓后重开(注意会再产生一次开 / 平仓费)。见 [§10](about:blank#10-%E6%B8%85%E7%AE%97%E4%BF%9D%E6%8A%A4liquidation-brake)。
**Q:触发单(限价 / 止损)能设最差成交价吗?**<br>A:不能。触发单一律按市价成交,触发价不是成交价的上下限,"最大滑点"仅对市价单生效。见 [§4.3](about:blank#43-%E8%A7%A6%E5%8F%91%E5%8D%95%E7%9A%84%E6%89%A7%E8%A1%8C%E8%AF%AD%E4%B9%89%E5%8A%A1%E5%BF%85%E7%90%86%E8%A7%A3)。
**Q:为什么我的开仓单没成交 / 被取消了?**<br>A:可能是(1)可用流动性不足以容纳该单;(2)市价单实际执行价超出你的最大滑点;(3)预言机价格过期。见 [§11.1](about:blank#111-%E5%8F%AF%E7%94%A8%E6%B5%81%E5%8A%A8%E6%80%A7available-liquidity) 与 [§12](about:blank#12-%E9%A2%84%E8%A8%80%E6%9C%BA%E4%B8%8E%E4%BB%B7%E6%A0%BC%E9%A3%8E%E9%99%A9)。
---
*本指南描述 FX100 的通用交易规则;各市场的具体参数(点差、费率、杠杆上限、储备因子等)按市场配置,可能随时间调整,请以应用内的下单预览与市场信息为准。*

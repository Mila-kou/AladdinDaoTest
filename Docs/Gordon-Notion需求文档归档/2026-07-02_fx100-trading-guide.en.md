---
title: fx100-trading-guide.en
notion_url: https://app.notion.com/p/3913d7873f2c8099bbd3e2b8460a0449
author: Gordon (chao@aladdin.club)
last_edited: 2026-07-02
archived: 2026-07-28
---

# FX100 Trading Guide
> FX100 is a decentralized perpetual-futures trading platform on **Base**. It prices trades via an **oracle** (no order book) and executes them instantly, supporting up to **100x** long / short leverage with **USDC** as collateral. This guide is written for traders: it systematically explains FX100's pricing, order placement, leverage, PnL, liquidation, and fee rules so you understand exactly where every number comes from before you trade.
	Formulas are given in the notation used by the contracts, so you can reconcile the UI against on-chain behavior.
---
## Table of Contents
1. What is FX100
2. Core Concepts
3. Pricing & Execution
4. Order Types
5. Leverage & Margin
6. Entry Price, PnL & Closing
7. Funding
8. Fees
9. Liquidation
10. Liquidation Protection (Liquidation Brake)
11. Liquidity & LPs
12. Oracle & Price Risk
13. Comparison with Hyperliquid / GMX
14. FAQ
---
## 1. What is FX100
FX100 is an **oracle-driven** perpetuals DEX. Unlike order-book exchanges such as Hyperliquid, FX100 has no bid/ask book — every fill is priced at **oracle price ± a dynamic spread** and executed immediately. The model builds on GMX V2's design, with three distinctive features on top:
- **Liquidation Protection (Liquidation Brake)**: every new position gets a **15-minute** liquidation-free grace window; during that window your position cannot be liquidated even if price touches your liquidation price — specifically to defend against momentary wicks. See §10.
- **Very low funding + no borrowing fee**: FX100 charges no borrowing fee, and funding is far lower than traditional perps — when balanced, only longs pay a tiny baseline (floor) fee to the LP pool while shorts pay nothing; when imbalanced, the lighter side may even receive. Everything settles automatically into margin, with no manual claim. See §7.
- **Traders trade directly against LPs**: liquidity providers (LPs) are the counterparty to all trades — traders' profits are paid by LPs and traders' losses accrue to LPs. LPs also earn position fees.
**In one line**: trade 100x perps on assets like BTC and ETH with a CEX-smooth one-click market / limit experience, while keeping on-chain self-custody, liquidation protection, and minimal funding.
---
## 2. Core Concepts
<table header-row="true">
<tr>
<td>Concept</td>
<td>Meaning</td>
</tr>
<tr>
<td>**Oracle Price**</td>
<td>The on-chain reference price, sourced from Chainlink Data Streams (primary) and others. Split into mid / ask / bid. All PnL and liquidations reference it.</td>
</tr>
<tr>
<td>**Mark Price**</td>
<td>The price used for unrealized PnL and liquidation; equivalent to the oracle price.</td>
</tr>
<tr>
<td>**Collateral / Margin**</td>
<td>The USDC you deposit for a position, valued at ≈ \$1/unit.</td>
</tr>
<tr>
<td>**Isolated Margin**</td>
<td>Each position has its **own separate** collateral; liquidating one position does not affect others. A long and a short are two independent positions.</td>
</tr>
<tr>
<td>**Position Size**</td>
<td>`sizeInUsd` (USD notional recorded at the entry execution price) and `sizeInTokens` (amount of the underlying).</td>
</tr>
<tr>
<td>**Entry Price**</td>
<td>`sizeInUsd / sizeInTokens` — the execution price you actually filled at (spread included), not the oracle mid.</td>
</tr>
<tr>
<td>**Leverage**</td>
<td>Position size ÷ net collateral. See §5.</td>
</tr>
</table>
---
## 3. Pricing & Execution
### 3.1 Oracle Price
FX100's reference price comes from an oracle, in three flavors:
- **Mid**: the on-chain reference mid-price.
- **Ask / Bid**: opening a long / closing a short uses the ask side; opening a short / closing a long uses the bid side.
### 3.2 Spread
Your **fill price = oracle price ± a dynamic spread**. The spread has three components and always stacks in the direction unfavorable to you:
```plain text
totalSpread = constantSpread + depthSpread + skewImpact      (clamped ≥ 0)
```
- **Constant Spread**: a small fixed baseline spread per market (e.g. 0.01%).
- **Depth Spread**: grows with **order size** — the larger your order, the deeper the liquidity it consumes and the higher the spread. Small orders ≈ 0.
	```plain text
depthSpread = max( exp(orderSize · k / depth) − 1 , orderSize / depth ) / 100
	```
- **Skew Impact**: depends on whether your order makes the market's long/short imbalance **better or worse**.
	- You are on the **lighter side** (you improve the imbalance) → impact is **negative**, you **benefit** (a better fill price).
	- You **worsen the imbalance** → impact is positive, you pay a premium.
	- Perfectly balanced → 0.
### 3.3 Execution Price Formula
```plain text
useMax   = (open & long) OR (close & short)
execPrice = useMax ? ceil( indexAsk · (1 + totalSpread) )
                   : floor( indexBid · (1 − totalSpread) )
```
- Opening a long / closing a short uses the ask side and rounds up; opening a short / closing a long uses the bid side and rounds down — **rounding is always against the trader** (standard exchange convention).
- **Key point**: because of the spread, your fill is **always slightly worse than** the oracle mid; the larger the order, the larger the gap. The order preview shows the estimated execution price — rely on the preview.
---
## 4. Order Types
FX100 supports market orders and four kinds of trigger order. **The key distinction**: market orders let you set a worst acceptable price (slippage protection); **all trigger orders execute at market once triggered** (see §4.3).
### 4.1 Market Orders
Fill immediately at `execPrice`. You can set **slippage protection**:
```plain text
maxAcceptablePrice = execPrice · (1 ± slippage)
   open long / close short:  · (1 + slippage)     (worst price is higher)
   open short / close long:  · (1 − slippage)     (worst price is lower)
```
If the actual execution price is beyond that worst acceptable price, the order is cancelled rather than filled at a worse price.
### 4.2 Trigger Orders (Limit / Stop / TP / SL)
FX100 has no order book; a trigger order is a conditional order that **"once the oracle reaches the trigger → converts to a market fill"**:
<table header-row="true">
<tr>
<td>Type</td>
<td>Purpose</td>
<td>Trigger condition (long)</td>
<td>Trigger condition (short)</td>
</tr>
<tr>
<td>**Limit**</td>
<td>Buy the dip / sell the rally to open</td>
<td>oracle **≤** trigger</td>
<td>oracle **≥** trigger</td>
</tr>
<tr>
<td>**Stop (entry)**</td>
<td>Breakout long / breakdown short</td>
<td>oracle **≥** trigger</td>
<td>oracle **≤** trigger</td>
</tr>
<tr>
<td>**Take-Profit**</td>
<td>Lock in profit</td>
<td>oracle **≥** trigger</td>
<td>oracle **≤** trigger</td>
</tr>
<tr>
<td>**Stop-Loss**</td>
<td>Cap the loss</td>
<td>oracle **≤** trigger</td>
<td>oracle **≥** trigger</td>
</tr>
</table>
> When opening, the FX100 front end **automatically decides** whether the order is a "Limit (buy the dip)" or a "Stop (chase the breakout)" based on the trigger price vs. the current price — no manual toggle, eliminating wrong-direction mistakes at the root.
### 4.3 Trigger-Order Execution Semantics (important)
Once a trigger order fires, it **executes at the prevailing oracle market price, not at the trigger price**. Technically, a trigger order's "acceptable price" is set to a sentinel value (buy = no upper bound, sell = no lower bound):
```plain text
acceptablePrice  (always a sentinel for trigger orders — i.e. "accept any market price")
   open:   long → MaxUint256 ,  short → 0
   close:  long → 0          ,  short → MaxUint256
```
Two rules you must know follow from this:
1. **The trigger price is not a cap / floor on the fill price.** For example, if you place a \$200 limit order to open a long, once triggered it fills at market — the actual fill = oracle price × (1 + spread), which may be **slightly above \$200**. This is intentional: it guarantees orders like stop-losses always fill in fast-moving markets.
2. **Trigger orders do not support a "worst acceptable price / max slippage" setting.** That setting only applies to market orders. Any slippage field shown in the UI has no effect on Limit / Stop orders.
**Take-Profit / Stop-Loss preview** (direction follows the position's long/short side):
```plain text
Expected Profit (TP) = sizeInTokens · (triggerPrice − entryPrice)     (long; short is inverted)
Expected Loss  (SL)  = sizeInTokens · |markPrice − triggerPrice|
TP% / SL%            = priceChange / mark · leverage
```
---
## 5. Leverage & Margin
### 5.1 Isolated Margin, Collateral-First
- **Isolated**: each position has its own collateral; risks don't spill over between positions.
- **Collateral-first**: you put up collateral first (or pick a leverage, from which the required collateral is derived), and the position is created accordingly. Collateral is **USDC**.
### 5.2 Definition of Leverage
```plain text
Order preview:   Leverage = OrderValue / Collateral      where OrderValue = sizeInTokens · oraclePrice
Position panel:  Leverage = sizeInUsd / (collateral − pendingFunding)
```
- The position-panel leverage uses **net collateral** (collateral − pending funding), so it is **independent of the live price** and does not jitter with price; it reflects your leverage against current net collateral, which is not necessarily the leverage you opened at.
- **Note**: when margin is small and funding has accrued, net collateral shrinks, so the displayed leverage can be **higher** than your opening leverage. For your real liquidation risk, look at the **liquidation price**, not this number.
- Unrealized PnL is **not** included in the leverage denominator (which is why price moves don't change the displayed leverage).
### 5.3 Maximum Openable Leverage
FX100 supports up to **100x**, but the cap for a single order is reduced by spreads and fees:
```plain text
maxLeverage = 1 / (minCollateralFactor + s_open + s_close + f_open + f_close)
```
- `minCollateralFactor` = the minimum collateral ratio required to open (configured per market);
- `s_open / s_close` = the dynamic spreads on the open / close side; `f_open / f_close` = the open / close position fees.
So in shallow liquidity or for large orders, the actually openable leverage is **slightly below** the theoretical cap — the spread eats part of the room. The preview shows the currently openable maximum leverage.
### 5.4 Adjust Margin / Adjust Leverage
```plain text
Adjust margin:   newMargin   = currentMargin ± amount
                 newLeverage = sizeInUsd / newMargin
Adjust leverage: targetSize  = targetLeverage · collateral      (keep collateral fixed, change notional)
                 sizeChange  = targetSize − currentSize
                 estFee      = |sizeChange| · positionFeeFactor  (fee only on the added size)
```
- Adding margin = liquidation price moves away from the current price (safer); removing margin = closer to liquidation.
- Raising leverage = increasing notional size (equivalent to adding to the position; the position fee is charged on the increment).
### 5.5 Minimums
There is a **minimum collateral** and a **minimum position notional** (e.g. a few dollars each). Orders below the thresholds are rejected.
---
## 6. Entry Price, PnL & Closing
### 6.1 Entry Price
```plain text
entryPrice = sizeInUsd / sizeInTokens
```
The entry price records the **execution price** (spread included), not the oracle mid. It is the basis for all subsequent PnL and liquidation calculations and is not re-marked to market.
### 6.2 Unrealized PnL
```plain text
LONG  : Unrealized PnL = sizeInTokens · oraclePrice − sizeInUsd
SHORT : Unrealized PnL = sizeInUsd − sizeInTokens · oraclePrice
```
- This is **pure price PnL** — it does **not** include funding, closing fees, or closing price impact.
- **PnL percentage (ROE) = Unrealized PnL ÷ initial margin.**
- A short's positive PnL is subject to the **pool PnL cap**: when a short's unrealized profit exceeds `maxPnlFactor × poolValue`, it is capped (to protect LPs).
### 6.3 Unrealized PnL ≠ What You Get Back on Close
What you actually receive on closing differs from the unrealized PnL, because closing realizes price impact and deducts fees:
```plain text
Est. Receive ≈ collateral + UnrealizedPnL + closingImpact − closingFee − pendingFunding
```
- `closingImpact` = the price impact at the moment of closing (realized only on close, so not shown in unrealized PnL);
- `closingFee` = the closing position fee; `pendingFunding` = pending funding to settle (typically near 0).
So **the unrealized PnL at the top of the page is "pure price PnL", while "Est. Receive" is the amount that actually lands after impact and fees are all accounted for**.
---
## 7. Funding
FX100's funding is far lower overall than traditional perps, and it **settles automatically into margin with no manual claim**. But understand its structure precisely — it is not a simple "long↔︎short transfer", and it is **not exactly zero when balanced**:
- **Longs always pay a tiny baseline (floor) funding fee to the LP pool**, even when long and short open interest are perfectly balanced; **shorts pay no funding when balanced.**
- **When imbalanced**: the more crowded side pays more and the net flows to the LP pool; **the lighter side may receive** funding (auto-credited into margin).
- **Net flows to LPs**: funding fundamentally comes from the difference between the long and short rate formulas (the floor fee); the net enters the LP pool rather than being paid directly from one side to the other.
- **Auto-settles into margin, no claim**: FX100 settles funding **directly into your position's margin** — paying deducts it from margin, receiving adds it to margin — with **no balance you need to claim manually**.
- **Sign convention**: in the position panel, the `Funding` column negative = you are paying; positive = you are receiving.
Rate formulas (the contract computes per second; the UI shows an hourly %):
```plain text
skew    = 1h-EMA( (longOI − shortOI) / totalOI )
f_long  = clamp( floorFactor + baseFactor · skew , min, max )    // the floor is added on the long side only
f_short = clamp(              − baseFactor · skew , min, max )
```
- When balanced (`skew = 0`): `f_long = floorFactor > 0` (longs pay the floor to LPs), `f_short = 0` (shorts pay nothing).
- A side's rate \> 0 = that side **pays**; \< 0 = that side **receives** (auto-credited into margin).
---
## 8. Fees
The fees a trader actually bears are listed below, and **all are shown up front in the order preview**:
<table header-row="true">
<tr>
<td>Fee</td>
<td>Description</td>
</tr>
<tr>
<td>**Position Fee**</td>
<td>Charged once on open and once on close, as a fraction of notional size (configured per market, typically \~0.02%–0.06% per side). Shown in the preview.</td>
</tr>
<tr>
<td>**Execution Fee**</td>
<td>The on-chain gas paid to the keeper. For small orders you prepay and get the excess refunded after execution; **liquidations and some large orders are subsidized by the protocol** (execution fee = 0).</td>
</tr>
<tr>
<td>**Funding**</td>
<td>Very low overall: when balanced, only longs pay a tiny floor to LPs while shorts pay nothing; when imbalanced, the more crowded side pays more and the lighter side may receive. Auto-settled into margin, no claim. See §7.</td>
</tr>
<tr>
<td>**Borrowing Fee**</td>
<td>**FX100 charges no borrowing fee** (removed relative to GMX).</td>
</tr>
<tr>
<td>**Referral Rebate (optional)**</td>
<td>Trading via a referral code can earn a fee discount (exact rate depends on the campaign).</td>
</tr>
</table>
---
## 9. Liquidation
### 9.1 Maintenance Collateral Factor
Each market has a **liquidation maintenance factor** `minCollateralFactorForLiquidation` (abbreviated **`minCF_liq`** below). It is **lower** than the minimum collateral ratio required to open — the difference is your safety buffer. When net collateral falls below the maintenance line, liquidation is triggered:
```plain text
remainingCollateral = collateral + PnL(oracle) + closingImpact − closingFee − pendingFunding
if  remainingCollateral ≤ sizeInUsd · minCollateralFactorForLiquidation:
        → eligible for liquidation
```
### 9.2 Liquidation Price Formula
```plain text
LONG  : liqPrice = entryPrice · (1 + minCF_liq + closeFeeRatio) − netCollateral / sizeInTokens
SHORT : liqPrice = entryPrice · (1 − minCF_liq − closeFeeRatio) + netCollateral / sizeInTokens

where  netCollateral = collateral + closingImpact − pendingFunding
```
Notation:<br>- **`minCF_liq`** = `minCollateralFactorForLiquidation`, the liquidation maintenance factor (configured per market, see §9.1).<br>- **`closeFeeRatio`** = the closing position-fee rate (see §8).<br>- **`netCollateral`** = net collateral = collateral + closing price impact − pending funding (`pendingFunding` is typically near 0).<br>- **`entryPrice`**** / ****`sizeInTokens`** see §6.1.
Key points:<br>- **Includes the closing fee**: liquidation is a forced close, so the closing fee still applies and is included.<br>- **Includes closing price impact**: the liquidation price asks "how much is left if I close now", so impact is included.<br>- **Excludes future funding**: future funding cannot be estimated, so it is taken as 0.
### 9.3 Who Executes It
Liquidation is triggered and executed by a keeper (liquidator) at the current oracle price, and it collects a **liquidation fee** (deducted from the remaining collateral, not charged to you on top).
---
## 10. Liquidation Protection (Liquidation Brake)
**Every new position automatically gets a 15-minute liquidation-free grace window.**
- **Rule**: for the **15 minutes** after opening, the position **cannot be liquidated even if the oracle price touches or crosses your liquidation price.**
- **Purpose**: to defend against "false liquidations" caused by momentary wicks / short bursts of volatility — as long as price returns to the safe zone within the grace window, your position is safe.
- **Timed only at "new open"; adding to a position does not extend it**: the grace window is timed from the moment you **first open** the position; **adding to an existing position does not reset or extend** it. To get a fresh full 15-minute protection, you must **close the position first and then open a new one** (note: reopening incurs open / close fees again).
- **UI**: the position panel's `Est. Liq. Price / Liq. Prot.` shows the liquidation price and the protection countdown.
- **After the grace window ends**: normal liquidation rules resume (see §9).
> This is the core mechanism behind FX100's "Zero Liquidation Risk" positioning. It doesn't remove the liquidation price itself — it gives you a **protected buffer of time**, greatly reducing the chance of being shaken out by market noise.
---
## 11. Liquidity & LPs
### 11.1 Available Liquidity
The notional you can open on a given side of a given market is bounded by several limits; the minimum applies:
```plain text
availableLiquidity = min(
    maxOpenInterest − currentOI,               // hard open-interest cap for the market
    poolValue · reserveFactor − reserved        // amount the pool can back for this market per its reserveFactor
) and other risk limits
```
- **Reserve Factor**: each market is configured with a ratio determining how much of the pool value can back positions in that market (e.g. higher for BTC, more conservative for others).
- The larger the pool and the higher the reserveFactor, the deeper the available liquidity. When available liquidity can't accommodate your order, the order is rejected or silently cancelled.
### 11.2 The LP's Role
LPs deposit liquidity into the pool, act as the counterparty, and earn:
- **Position fees**;
- The **net funding** during imbalances;
- As the **counterparty**, they settle traders' PnL (trader wins = LP pays; trader loses = LP collects).
---
## 12. Oracle & Price Risk
- **Sources**: primarily **Chainlink Data Streams** (off-chain signed quotes with bid/ask), with a backup source configured; some deployments use a reference source for a deviation check.
- **Freshness**: oracle prices have a maximum age (`MAX_ORACLE_PRICE_AGE`, \~30–60s in production). **Stale prices cause orders / liquidations to be rejected** until a fresh price is available.
- **Deviation protection**: when the primary oracle price deviates from the reference source beyond a threshold (e.g. 2%), related operations are rejected to prevent bad-price fills.
- **Sequencer protection**: Base is an Optimistic Rollup; there is protective rejection during the sequencer's recovery window after an outage.
- **No automatic fallback**: if the primary oracle fails, the protocol **freezes** (no fills, no liquidations); governance must **manually switch** to the backup source, and the switch has a time-lock to prevent oscillation.
---
## 13. Comparison with Hyperliquid / GMX
<table header-row="true">
<tr>
<td>Dimension</td>
<td>**FX100**</td>
<td>**Hyperliquid**</td>
<td>**GMX V2**</td>
</tr>
<tr>
<td>Matching</td>
<td>Oracle pricing (no order book)</td>
<td>Central limit order book</td>
<td>Oracle pricing (no order book)</td>
</tr>
<tr>
<td>Margin</td>
<td>Isolated (per position)</td>
<td>Isolated / cross selectable</td>
<td>Isolated (per position)</td>
</tr>
<tr>
<td>Leverage display</td>
<td>Notional / net collateral (excludes PnL, doesn't jitter with price)</td>
<td>User-set value (fixed)</td>
<td>Notional / net equity (includes PnL, moves with price)</td>
</tr>
<tr>
<td>Funding</td>
<td>Very low: longs pay a tiny floor → LP, shorts pay nothing when balanced; lighter side may receive when imbalanced. Auto into margin</td>
<td>Peer-to-peer, settled hourly</td>
<td>Yes; the lighter side must claim manually</td>
</tr>
<tr>
<td>Borrowing fee</td>
<td>**None**</td>
<td>None</td>
<td>Yes</td>
</tr>
<tr>
<td>Liquidation protection</td>
<td>**15-minute liquidation-free grace on open**</td>
<td>None</td>
<td>None</td>
</tr>
<tr>
<td>Counterparty</td>
<td>LP pool (traders trade directly against LPs)</td>
<td>Counterparty traders</td>
<td>GLP / GM pool</td>
</tr>
<tr>
<td>Trigger fills</td>
<td>Market once triggered (trigger price is not a cap)</td>
<td>Order-book limit can fill at an exact price</td>
<td>Market once triggered</td>
</tr>
</table>
**FX100's differentiation**: very low funding + no borrowing fee + 15-minute liquidation protection — aimed at traders who want to hold high-leverage positions for a long time without being ground down by high funding and wick liquidations.
---
## 14. FAQ
**Q: Why is my fill price different from the oracle price?**<br>A: Because of the dynamic spread (constant + depth + skew). Fill price = oracle price ± the spread (in the direction unfavorable to you), and larger orders differ more. See §3.
**Q: Why is the leverage shown on my position higher than the leverage I opened at?**<br>A: Position leverage is computed on **net collateral** (collateral − pending funding). When margin is small and funding has accrued, net collateral shrinks, so the displayed leverage is higher than the opening value. This is your true current leverage; for real risk, look at the liquidation price. See §5.2.
**Q: Why doesn't the unrealized PnL equal what I'd get back if I closed now?**<br>A: Unrealized PnL is **pure price PnL** and excludes closing price impact and fees; what actually lands on close is `Est. Receive` (with impact, fees, and funding deducted). See §6.3.
**Q: When is funding charged?**<br>A: Longs always pay a tiny baseline (floor) funding fee to the LP pool, even when long and short are balanced; shorts pay nothing when balanced. When imbalanced, the more crowded side pays more and the lighter side may receive. Everything auto-settles into margin, with no manual claim. See §7.
**Q: What happens after the 15-minute liquidation protection?**<br>A: Normal liquidation rules resume — the grace window only protects the first 15 minutes after opening, after which the position can be liquidated once price touches the liquidation price. **Protection is timed only from the moment of a "new open"; adding to a position does not extend it**: adding to an existing position keeps the original opening start point and **does not reset**. Only by **closing and then opening a new position** do you get a fresh 15-minute protection. So if you want the protection window back, consider closing and reopening (note: this incurs open / close fees again). See §10.
**Q: Can I set a worst fill price on trigger orders (limit / stop)?**<br>A: No. Trigger orders always fill at market; the trigger price is not a cap or floor on the fill, and "max slippage" only applies to market orders. See §4.3.
**Q: Why didn't my opening order fill / why was it cancelled?**<br>A: Possibly (1) available liquidity couldn't accommodate the order; (2) a market order's actual execution price exceeded your max slippage; (3) the oracle price was stale. See §11.1 and §12.
---
*This guide describes FX100's general trading rules; the specific parameters of each market (spreads, fee rates, leverage caps, reserve factors, etc.) are configured per market and may change over time — always rely on the in-app order preview and market info.*

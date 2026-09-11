# 📋 Zenith Audit Setup

> Notion 页面：[原文](https://app.notion.com/p/3b13d7873f2c81aea45feb98bb0962e8)
> 作者：fx100-sync（Gordon 的 fx100-contracts 仓库文档同步机器人，内容出自 Gordon）
> 创建时间：2026-08-03
> 最后编辑：2026-08-03
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 产品 / FX100 / 技术相关 / 合约 / 🐛 Bug & Issues
> 类型：设计文档

> 👥 docs/analysis/../audit/2026-08-03-zenith-audit-setup.md

# FX100 — Zenith Audit Setup Questionnaire (draft response)

**Prepared**: 2026-08-03

**Status**: Draft for team review before sending to Zenith — items marked ⚠️ need a decision or confirmation from product/eng before this goes out.

**Scope reference**: `docs/audit/2026-08-03-v032-audit-scope.md` (`release/v0.3.2` @ `13880f2`)

---

## 1. Please list all chains that you plan to deploy the protocol on (now and in the future).

**Base only** — both now and for the foreseeable future. No other chains are planned.

- **Live today**: Base Sepolia (testnet, chain id `84532`). Addresses can be shared directly / verified on Basescan as needed.
- **Planned**: Base mainnet (chain id `8453`). **Target launch is within two weeks of receiving the final audit report.** This is already configured in our deploy tooling (`hardhat.config.ts`, Basescan verification wired up for both networks) and is the explicit target of our pre-launch checklists (e.g. tightening `MAX_ORACLE_PRICE_AGE` from the 60s test value to a stricter mainnet value, hardcoding the real Base mainnet USDC address in deployment scripts).

For completeness, two things that are **not** multi-chain deployment plans and shouldn't be read as scope: our `WNT` (wrapped native token) constant is written in a chain-agnostic way in comments (it resolves to the canonical Base/OP-Superchain WETH address today), and there are some unused DataStore keys reserved for a LayerZero-based cross-chain read mechanism inherited from an upstream fee-distributor codebase we reused. Both are unimplemented plumbing / design-for-generality leftovers, not active plans.

---

## 2. Are there any limitations on values set by admins (or other roles) in protocols you integrate with, including restrictions on array lengths?

**External protocol integrations**: three pluggable oracle providers behind a common `IOracleProvider` interface —

- **Chainlink Data Streams** (low-latency, off-chain signed report + on-chain DON-signature verification) — our primary price source for most markets.
- **Chainlink classic on-chain price feeds** (`AggregatorV2V3Interface`) — secondary/fallback price and sequencer-uptime feed.
- **Pyth** (on-chain pull) — used both as a deviation-reference sanity check against the primary provider, and as a standalone provider option.

**Admin-settable values and their bounds**:

- **Feed heartbeat / staleness** (`PRICE_FEED_HEARTBEAT_DURATION`): enforced against `block.timestamp - lastUpdateTimestamp`, but **we do not enforce any on-chain min/max bound on this value itself** — an admin could technically set it arbitrarily high, silently permitting stale prices. Production config target: 3600s for WNT/USDC feeds; test default is 60s.
- **Price/multiplier decimals** (`priceFeedMultiplierKey` / `dataStreamMultiplierKey`): only checked for non-zero, no upper bound or cross-check against actual feed decimals.
- **Primary price age** (`MAX_ORACLE_PRICE_AGE`, 60s in prod config) and **cross-token timestamp spread** (`MAX_ORACLE_TIMESTAMP_RANGE`, 60s) for a single multi-token price submission — both admin-configurable, both enforced with reverts.
- **Reference-price deviation cap** (`MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR`, 2% in prod) — bounds how far the primary price can diverge from the Pyth reference price before reverting.
- **Cached "recorded" price max age** (`MAX_RECORDED_PRICE_AGE`, 24h in prod) — see §4 for why this matters more than it looks.
- **Data Stream spread-reduction factor**: hard-capped at ≤ 100% (`Precision.FLOAT_PRECISION`), the one value with an actual on-chain ceiling.

**Array length**: we do **not** use fixed numeric maximums as a defense pattern almost anywhere in the protocol. The one exception is order-execution callback data (`FX100Keys.MAX_DATA_LENGTH`, admin-configurable, enforced in `BaseHandler.validateDataListLength`). Everywhere else — the external-call relay (`ExternalHandler.makeExternalCalls`), the multi-token oracle price submission array, and every batch-claim function (collateral, affiliate rewards, UI fees) — we only check that **parallel arrays have equal length**, with no upper bound; the practical ceiling is the block gas limit. Our relay/gasless order-batching path additionally caps total calldata size at 50,000 bytes, which indirectly bounds array size but isn't itself a length check. We'd welcome your team stress-testing this pattern (gas-griefing via large arrays from a permissioned-but-compromised or misconfigured caller) since we haven't treated array-length capping as a primary defense layer.

---

## 3. Are there any off-chain mechanisms involved in the protocol (e.g., keeper bots, arbitrage bots, etc.)? We assume these mechanisms will not misbehave, delay, or go offline unless otherwise specified.

Yes — several keeper roles, each gating a specific permissioned entry point:

| Keeper | Entry point | What happens if it's offline/delayed |
|---|---|---|
| **Order keeper** | `OrderHandler.executeOrder` | Orders sit un-executed; users can self-cancel after an expiration window. Market orders that time out are refunded; limit/trigger orders "freeze" pending re-execution. **Degrades gracefully — no permissionless fallback executor exists.** |
| **Frozen-order keeper** | Unfreezes/retries orders that failed on slippage/output checks | Frozen orders stay frozen (execution fee already spent) until this keeper acts. |
| **Liquidation keeper** | `LiquidationHandler.executeLiquidation` | **Please do not assume this always runs on time.** If delayed, undercollateralized positions accumulate — this is a genuine risk-accumulation failure mode, not graceful degradation. |
| **ADL keeper** | Global net-obligation ratio polling + `AdlHandler.executeAdl` (hysteresis, configurable thresholds — currently tentatively 75% to enable ADL, 50% to disable; a separate withdrawal gate tentatively blocks LP withdrawals above 65%) | **Also please do not assume this always runs.** If offline during a risk event, the protocol has no automatic deleveraging backstop. **Note: these threshold percentages are provisional parameters, not fixed contract constants, and may still change before mainnet launch.** |
| **Recorded-price refresher** | `AdlHandler.refreshLatestRecordedPrices` — **fully permissionless**, no role check at all | See §4 — this one has an outsized blast radius if it stops. |
| **Relay / "Express" (gasless) executor** | Off-chain relayer submits EIP-712-signed user intents, fronts the execution fee, collects a relay fee | **Fully permissionless — anyone can act as the relayer/executor, no on-chain role restriction beyond the user's own signature verification.** Only gasless/subaccount UX degrades if this off-chain service is offline — users fall back to normal (non-gasless) order submission. Graceful degradation. |

**Oracle price submission itself is hybrid**: the underlying price data (Chainlink Data Stream reports, Pyth updates) carries its own cryptographic signatures from the provider network, verified on-chain — that part is trustless/permissionless in the sense that anyone holding a validly-signed report can submit it. But the *transaction* carrying that price array in is gated to whichever keeper role owns the entry point it's attached to (order/liquidation/ADL keeper), **except** the recorded-price refresher, which is open to anyone.

**Please do not assume our keepers are perfectly reliable** — the liquidation keeper and ADL keeper in particular are risk-critical, and we'd like your review to explicitly consider what happens under keeper delay/downtime for those two, not just the happy path.

---

## 4. What properties/invariants do you want to hold even if breaking them has a low/unknown impact?

1. **Zero-sum across the four core balance-holders.** For every state-changing action, `Δ(trader balance) + Δ(LP vault assets) + Δ(position vault) + Δ(fee receiver) = 0` — no value is created or destroyed anywhere in the system. This is our most heavily-tested invariant (dedicated E2E ledger test suite asserts it after every scenario) and the one we'd most want flagged if any code path can violate it, however edge-case.
2. **Dynamic spread never lets liquidation/ADL execute at better-than-oracle price.** Regardless of how the voluntary-trade pricing formula evolves (see the negative-spread feature in the v0.3.2 scope doc), forced closes must never receive a rebate.
3. **Global net-obligation ratio is the single risk gate**, computed as `Σ_markets [max(0, longPnl) + max(0, shortPnl)] / poolUsd` across every market sharing one LP vault. This assumes — and we'd want it flagged if ever violated — that all markets configured against a given LP vault actually do share that one vault; new-market onboarding is supposed to preserve this but it's an assumption baked into the ratio computation rather than something enforced by a standalone check.
4. **ADL execution must strictly reduce the global net-obligation ratio, monotonically, or revert.** We're aware there's no independent per-call magnitude cap beyond this monotonicity check (an originally-planned "prevent over-deleveraging" guard was never implemented as a separate invariant) — we'd like to know if this matters more than we think it does.
5. **Risk-tightening actions require fresh prices; risk-loosening actions tolerate stale ones.** This asymmetry (LP-withdrawal gate and ADL-disable require fresh oracle data; ADL-enable does not) is intentional, not an oversight — but we'd want to hear if you think the asymmetry itself is exploitable.
6. **Funding-fee routing is asymmetric by design**: when a trader's position nets funding owed, funds route to claimable protocol-fee accounting rather than being paid to the LP directly; the reverse direction (LP pays trader directly) is a defensive branch we believe is currently unreachable, not a live path — we'd like it flagged if it turns out to be reachable.

**Note**: the test suite included in this repo/commit (`test/external`, `test/fixtures`, `test/integration`, `test/vault` — 19 files) is scenario-based, and does **not** include a Foundry-style `invariant_*`/`StdInvariant` fuzzing harness.

---

## 5. Please discuss any design choices you made.

**A few foundational principles worth stating up front, since they shape a lot of the rest of the design:**

- **USDC is the only collateral/settlement asset in the entire protocol.** Every LP deposit, every position's collateral, every PnL settlement is denominated and paid in USDC — index tokens (BTC, ETH, etc.) are pure price references for cash-settled synthetic perpetuals; there is no physical delivery of the index asset and no multi-collateral support anywhere. `MarketFactory.createMarket` enforces this directly (collateral token is validated against the vault's single asset at market-creation time). One nuance worth flagging: USDC's own price is still oracle-fed (via the same Chainlink/Pyth providers, with a "stablecoin band" clamp toward a reference price), not hardcoded to exactly `$1` — a severe USDC depeg would flow through into every pool/position USD valuation in the system, same as any other asset.
- **Every market shares exactly one LP vault, enforced architecturally, not just assumed.** `MarketFactory.vault` is set once at construction and is `immutable` — every market created by a given factory deployment shares that one vault. This is the load-bearing assumption behind the global net-obligation-ratio risk model (§4.3) — please flag it if you find any path where a market's accounting could diverge from this.
- **One net position per (account, market, side) — no hedge-mode / multi-position model.** Position keys are `keccak256(account, marketIndex, isLong)` — deterministic, no nonce/counter. Re-opening the same side always merges into the existing position rather than creating a new one; a user can hold at most one long and one short position per market simultaneously, never more than one of each.

FX100 is a fork of **GMX v2 (Synthetics)**, adapted from a shared-collateral single-asset (USDC) model rather than GMX's per-market isolated pools. The main departures from upstream GMX v2, in order of how much they diverge from the fork base:

- **Global net-obligation risk model** replaces GMX's per-market reserve-factor model — a direct consequence of the shared-vault principle above, since a single per-market reserve factor doesn't make sense once solvency has to be judged across all markets pooling the same collateral. See §4.3 above (happy to walk your team through the full derivation directly if useful).
- **Dynamic spread can go negative for voluntary trades** (new in v0.3.2), modeled after Avantis-style incentives for orders that improve market balance, while deliberately keeping liquidation/ADL execution pinned to the old floor-at-0 (never-better-than-oracle) behavior. Happy to share the full design rationale and risk analysis behind this directly if it would help your review.
- **Three-way fee split via a reused, previously-audited `RevenuePool`/`ProtocolTreasury` fee-distributor** (see §6) rather than GMX's simpler fee-receiver model — protocol fees split across a protocol treasury, an insurance-fund-style "burner" allocation, and the LP vault taking the remainder.
- **Subaccount slots bounded to 4 per account** (new in v0.3.2, see the v0.3.2 scope doc §0.4) — a deliberate choice to trade unbounded flexibility for a fixed, gas-predictable, easy-to-reason-about upper bound, replacing an unbounded address-set design.
- **Referral module ships in-repo but is deliberately kept inert this release** (tiers unconfigured) pending a redesign — see the audit scope doc §3.1 for the exact operational constraints we're relying on.
- **Recorded-price caching for thinly-traded markets** (`Oracle.latestRecordedPrices`) trades a global-blast-radius liveness risk (see §3/§4 above) for the ability to compute a global risk ratio across markets that don't trade often enough to keep their own price cache warm through organic activity alone.

---

## 6. Please provide links to previous audits (if any).

**No completed third-party audit of `fx100-contracts` itself exists yet** — this Zenith engagement is the first. What we do have:

- **An OpenZeppelin audit of a sibling/related AladdinDAO codebase, `fx-protocol-contracts`** (public report: `https://www.openzeppelin.com/news/fx-v2-audit`). This matters directly to your scope because **FX100's fee-distribution module (`RevenuePool.sol`/`ProtocolTreasury.sol`) is reused, largely as-is, from that already-audited codebase** rather than written fresh for FX100.
- ⚠️ **GMX v2 (Synthetics), the codebase FX100 is forked from, has itself been through multiple public audit rounds** (including Sherlock contests, among others) — we believe this is common knowledge but we don't have a specific report/link to hand you right now. We'll follow up with citations if that's useful for scoping a "fork discount," rather than asserting it without a source.

---

## 7. Please list any relevant protocol resources.

- **Repo**: `https://github.com/AladdinDAO/fx100-contracts` (canonical audit repo)

We don't keep a single canonical architecture whitepaper or public documentation site tied to this repo/commit. We do have supplementary internal material (risk-engine design writeups, our bug tracker, test inventory, a plain-English guardrail catalogue, and a writeup on the recorded-price-keeper liveness point raised in §4) that isn't part of the git history but that we're happy to share directly as separate documents if it would help your review — let us know what would be most useful and we'll package it up.

---

## 8. Additional audit information.

- **We are actively fixing findings as we go, including your own preliminary findings.** All 4 of your preliminary vulnerability findings sent ahead of this engagement are confirmed fixed as of `release/v0.3.2`.
- **This is a fast-moving branch** — the scope commit is provisional and we expect at least a handful more small fixes to land before the audit's actual start commit is pinned. We'll communicate the final pinned commit before kickoff rather than assuming `13880f2` is final.
- **Known, accepted-as-is design gaps we're not asking you to re-litigate** (product/eng has already decided these are acceptable for this release): referral module inert-by-configuration (§6); WNT-as-collateral path currently architecturally unreachable (collateral token is hardcoded to a single asset — USDC — at market-creation time); a handful of Info/Discussion-severity code-cleanliness items from our internal review that we judged not worth a code change — happy to share the full list directly if useful.
- **One thing we'd specifically like your help deciding**, rather than us pre-judging it: whether the newly-active `MarketUtils.settleFundingFees` code path (see scope doc §0.5) needs a dedicated fuzz/invariant-style review given it's brand-new real-value movement on a very hot path (every position increase/decrease with realized funding).

---

*Internal note (remove before sending): every claim above is grounded in specific file:line citations gathered during a research pass this session — ping @Vicky if you want the full citation trail before this goes out. Remaining open item: the GMX Synthetics prior-audit citation gap in §6 (no specific report/link on hand yet).*

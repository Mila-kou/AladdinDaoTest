# 🔬 Zenith 审计发现全量镜像（GitHub Issues 同步，30 条原文）

> Notion 页面：[原文](https://app.notion.com/p/3b93d7873f2c81c09470e53b9b5986ca)
> 作者：fx100-sync（Gordon 的 fx100-contracts 仓库文档同步机器人，内容出自 Gordon）
> 创建时间：2026-08-12
> 最后编辑：2026-08-12
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 产品 / FX100 / 技术相关 / 合约 / 🐛 Bug & Issues
> 类型：设计文档

> 👥 受众：全员　｜　来源：docs/analysis/../audit/ZENITH_FINDINGS.md

# Zenith 审计发现全量镜像（GitHub Issues 同步）

**来源仓库**: https://github.com/zenith-security/2026-08-f-x-protocol/issues （私有仓，只有用户账号能看到；本机用 `gh` 的 **Gondoneth** 账号拉取）  
**同步方式**: `gh issue view <N> --repo zenith-security/2026-08-f-x-protocol --json ...`，逐条拉取原始 issue body，**逐字保留，不改写不翻译**。  
**最后同步时间**: 2026-08-11  
**当前总数**: 30 条（issue #1~#30，全部 `OPEN`）  
**用途**: 这是发给合约工程师/相关人的原始材料镜像。我方的源码核对结果、严重性复核、是否需要专题测试的分析，见 [docs/bugs/BUGS.md](../bugs/BUGS.md) Round 8 (R8) 小节——**全部 30 条已逐条完成源码核对**，一一对应 `R8-B01`~`R8-B30`（见下方「三、核对清单」）；其中 6 条（#1/#2/#16/#19/#20/#23/#25/#30，共映射到 6 个测试文件）已有专题 Foundry 测试并全部通过，其余 24 条测试待补（每条 BUGS.md 详情里都写了具体建议方案）。

> **以后新增/更新的 issue，都同步追加/更新到本文件里，不再单独按日期开新文件。**

---

## 一、总览表

| # | 严重性 | 标题 | 状态 | 创建时间 |
|---|---|---|---|---|
| [#30](https://github.com/zenith-security/2026-08-f-x-protocol/issues/30) | Critical Risk | Funding fee splitting diverts 60% of realized payer cash flow from LPs | Open | 2026-08-11 |
| [#29](https://github.com/zenith-security/2026-08-f-x-protocol/issues/29) | High Risk | Expired fallback prices can latch ADL before forced position reductions | Open | 2026-08-11 |
| [#28](https://github.com/zenith-security/2026-08-f-x-protocol/issues/28) | High Risk | Fee keeper can route treasury tokens to unauthorized recipients | Open | 2026-08-11 |
| [#27](https://github.com/zenith-security/2026-08-f-x-protocol/issues/27) | High Risk | Relay approvals retain stale bindings and bypass disabled integration identities | Open | 2026-08-11 |
| [#26](https://github.com/zenith-security/2026-08-f-x-protocol/issues/26) | High Risk | Unfunded subsidized-order fees drain the account's auto-top-up | Open | 2026-08-11 |
| [#25](https://github.com/zenith-security/2026-08-f-x-protocol/issues/25) | High Risk | Zero opening collateral factor lets traders bypass the market’s leverage floor | Open | 2026-08-11 |
| [#24](https://github.com/zenith-security/2026-08-f-x-protocol/issues/24) | High Risk | Authorized subaccounts can divert position collateral through self-selected UI fees | Open | 2026-08-11 |
| [#23](https://github.com/zenith-security/2026-08-f-x-protocol/issues/23) | High Risk | Signed funding bounds bypass the configured rate ceiling | Open | 2026-08-11 |
| [#22](https://github.com/zenith-security/2026-08-f-x-protocol/issues/22) | High Risk | Funding checkpoints preserve obsolete skew after open interest changes | Open | 2026-08-11 |
| [#21](https://github.com/zenith-security/2026-08-f-x-protocol/issues/21) | High Risk | Subaccount relay helpers omit callback-sensitive execution-fee limits | Open | 2026-08-11 |
| [#20](https://github.com/zenith-security/2026-08-f-x-protocol/issues/20) | High Risk | Positive market-side PnL allows zero-factor decreases to remain uncapped | Open | 2026-08-11 |
| [#19](https://github.com/zenith-security/2026-08-f-x-protocol/issues/19) | High Risk | Independent collateral-factor limits permit unsafe market states | Open | 2026-08-11 |
| [#18](https://github.com/zenith-security/2026-08-f-x-protocol/issues/18) | High Risk | Partitioned position orders reduce the intended nonlinear depth charge | Open | 2026-08-11 |
| [#17](https://github.com/zenith-security/2026-08-f-x-protocol/issues/17) | High Risk | LP redemptions can strand existing exposure above both pool-relative limits | Open | 2026-08-11 |
| [#16](https://github.com/zenith-security/2026-08-f-x-protocol/issues/16) | High Risk | Signed funding writes evade ceiling and ordering enforcement | Open | 2026-08-11 |
| [#15](https://github.com/zenith-security/2026-08-f-x-protocol/issues/15) | High Risk | Pending vault deposits can fund the next caller's order | Open | 2026-08-11 |
| [#14](https://github.com/zenith-security/2026-08-f-x-protocol/issues/14) | Medium Risk | Unbudgeted payout helpers make retained router ETH publicly spendable | Open | 2026-08-11 |
| [#13](https://github.com/zenith-security/2026-08-f-x-protocol/issues/13) | Medium Risk | Account callbacks can roll back underfunded forced reductions | Open | 2026-08-11 |
| [#12](https://github.com/zenith-security/2026-08-f-x-protocol/issues/12) | Medium Risk | Unreserved refund-callback gas can roll back order settlement | Open | 2026-08-11 |
| [#11](https://github.com/zenith-security/2026-08-f-x-protocol/issues/11) | Medium Risk | Orders leave the skew EMA unchanged after open interest moves | Open | 2026-08-11 |
| [#10](https://github.com/zenith-security/2026-08-f-x-protocol/issues/10) | Medium Risk | Public handler calls can pre-authorize theft of later stranded token balances | Open | 2026-08-11 |
| [#9](https://github.com/zenith-security/2026-08-f-x-protocol/issues/9) | Medium Risk | UI fee receivers can raise charges on pending orders | Open | 2026-08-11 |
| [#8](https://github.com/zenith-security/2026-08-f-x-protocol/issues/8) | Medium Risk | The next increase order can appropriate an uncheckpointed collateral deposit | Open | 2026-08-11 |
| [#7](https://github.com/zenith-security/2026-08-f-x-protocol/issues/7) | Medium Risk | Unpriced empty markets can freeze global risk controls through premature oracle reads | Open | 2026-08-11 |
| [#6](https://github.com/zenith-security/2026-08-f-x-protocol/issues/6) | Medium Risk | Operational config access can nullify per-token oracle recency limits | Open | 2026-08-11 |
| [#5](https://github.com/zenith-security/2026-08-f-x-protocol/issues/5) | Medium Risk | Hash-only relay prompts can hide attacker-directed decrease payouts | Open | 2026-08-11 |
| [#4](https://github.com/zenith-security/2026-08-f-x-protocol/issues/4) | Medium Risk | Incomplete uint validation lets limited keepers halt position increases | Open | 2026-08-11 |
| [#3](https://github.com/zenith-security/2026-08-f-x-protocol/issues/3) | Medium Risk | Shared handler refunds can redirect stranded ERC-20 balances | Open | 2026-08-11 |
| [#2](https://github.com/zenith-security/2026-08-f-x-protocol/issues/2) | Medium Risk | Malicious or compromised subaccount can drain the main account's USDC via an uncapped relay fee | Open | 2026-08-10 |
| [#1](https://github.com/zenith-security/2026-08-f-x-protocol/issues/1) | Medium Risk | Risk-oracle funding-factor updates write the wrong DataStore mapping and are silently ignored | Open | 2026-08-10 |

---

## 二、原文全文（按 issue 编号排列，逐字保留）

## #1 — Risk-oracle funding-factor updates write the wrong DataStore mapping and are silently ignored

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/1  
**严重性标签**: Medium Risk　**状态**: Open　**创建时间**: 2026-08-10T07:40:56Z

### Target

- [ConfigSyncer.sol](https://gitea.zellic.io/mirror-zenith/AladdinDAO-fx100-contracts/src/branch/release/v0.3.2/src/config/ConfigSyncer.sol)

### Severity:

- Impact: High
- Likelihood: Low

### Description:

`DataStore` keeps a separate mapping per type — `uintValues` (written by `setUint`/read by `getUint`) and `intValues` (written by `setInt`/read by `getInt`). 

Writing one and reading the other returns a stale value with no revert.

The `funding engine` reads the four `funding factors` as `int`:

```solidity
// MarketUtils.getNextFundingAmountPerSize
int256 fundingFloorFactor        = dataStore.getInt(FX100Keys.fundingFloorFactorKey(marketIndex));
int256 fundingBaseFactor         = dataStore.getInt(FX100Keys.fundingBaseFactorKey(marketIndex));
int256 minFundingFactorPerSecond = dataStore.getInt(FX100Keys.minFundingFactorPerSecondKey(marketIndex));
int256 maxFundingFactorPerSecond = dataStore.getInt(FX100Keys.maxFundingFactorPerSecondKey(marketIndex));
```

But the `Chaos-Labs` `risk-oracle` path writes them as `uint`:

```solidity
// ConfigSyncer.sync  (allow-list includes FUNDING_FLOOR_FACTOR, FUNDING_BASE_FACTOR, MIN/MAX_FUNDING_FACTOR_PER_SECOND)
uint256 updatedValue = Cast.bytesToUint256(riskParameterUpdate.newValue);
config.setUint(baseKey, data, updatedValue);   // -> store.setUint -> uintValues[key]
```

The **key is identical** on both sides (`getFullKey(baseKey, abi.encode(marketIndex))` == `fundingXFactorKey(marketIndex)`), so this is not a key mismatch - the value lands in `uintValues[key]` while funding reads `intValues[key]`.

**Impact**

1. `Risk-oracle` `funding` updates are **silent no-ops** - `funding` stays at the last manual `setInt`, even when the `oracle` signals a change (the automated `funding risk` response is dead).
2. `updatedValue` is a `uint256`, so a **negative** `min`/floor (needed for the receive side, invariant #6) is unrepresentable on this path.
3. `ConfigUtils.validateRange` funding caps (`MAX_FUNDING_FACTOR_PER_SECOND`, `min ≤ max`) run only inside `setUint`, so they never bound the live `int` values (which are set via `setInt`, which skips `validateRange`).

### Recommendations:

Make write and read agree on one bucket:

- Route funding factors through an **int** sync path (`config.setInt`, with `newValue` decoded as `int256`) so writes land in `intValues`; move the `funding-cap` checks into that path. 

Or

- If `funding` is not meant to be risk-oracle-driven, remove the `funding keys` from `ConfigSyncer`'s allow-list and validate them wherever `setInt` sets them.

**AladdinDAO:**

**Zenith:**

---

## #2 — Malicious or compromised subaccount can drain the main account's USDC via an uncapped relay fee

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/2  
**严重性标签**: Medium Risk　**状态**: Open　**创建时间**: 2026-08-10T07:40:59Z

### Target

- [BaseRouter.sol](https://gitea.zellic.io/mirror-zenith/AladdinDAO-fx100-contracts/src/branch/release/v0.3.2/src/router/BaseRouter.sol)

### Severity:

- Impact: High
- Likelihood: Low

### Description:

A `subaccount` is only meant to place `orders` on the `owner`'s behalf (order `receiver` is pinned to the `owner`). 

But in the `gasless relay flow`, the **relay fee is chosen by the subaccount yet paid by the main account, with no cap.** 

The `GMX guard` for this (`MAX_RELAY_FEE_SWAP_USD_FOR_SUBACCOUNT`) exists but is never enforced; the only bound left is `MAX_RELAY_SWAP_WNT_CAP`, which is skipped when 0. 

`Relaying` is permissionless, so the `subaccount` is its own `relayer`, inflates `tx.gasprice`, and pays the `fee` to itself. 

Result: a `subaccount` trusted only to trade can empty the `owner`'s `USDC`.

```solidity
uint256 nativeFee = Math.mulDiv(relayGasLimit * tx.gasprice, relayFeeMultiplierFactor, Precision.FLOAT_PRECISION, Math.Rounding.Ceil) + relayExecutionFee;
uint256 maxRelaySwapWntCap = dataStore.getUint(FX100Keys.MAX_RELAY_SWAP_WNT_CAP);
if (maxRelaySwapWntCap != 0 && nativeFee > maxRelaySwapWntCap) revert ...; // skipped when 0
uint256 feeAmount = Math.mulDiv(nativeFee, nativeTokenPrice.max, feeTokenPrice.min, Math.Rounding.Ceil);
if (feeAmount > fee.maxFeeAmount) revert ...;            // maxFeeAmount is subaccount-signed
_sendTokens(account, fee.feeToken, msg.sender, feeAmount); // main account pays -> attacker (msg.sender)
```

`MAX_RELAY_FEE_SWAP_USD_FOR_SUBACCOUNT` and `FxErrors.MaxRelayFeeSwapForSubaccountExceeded` are declared but unused.

**Attack scenario**

1. `Alice` grants `subaccount S` (`order` actions only) and has `USDC` approved to the `Router` (normal state).
2. `S`'s key leaks or `S` is malicious; the attacker `self-relays` `SubaccountRelayRouter.createOrder(account=Alice,…)` signing `fee.maxFeeAmount = Alice's balance` with a high `tx.gasprice`.
3. With `MAX_RELAY_SWAP_WNT_CAP = 0`, the fee reaches `maxFeeAmount`; `pluginTransfer` sends `Alice`'s `USDC` to the `attacker`. Repeatable up to the approved action count.

### Recommendations:

Enforce the `per-subaccount` **USD** cap (immune to gas-price inflation) on the `subaccount` path only:

```solidity
// in _payRelayFee, before _sendTokens:
uint256 maxFeeUsd = _maxRelayFeeUsdForSubaccount();
if (maxFeeUsd != 0 && feeAmount * feeTokenPrice.min > maxFeeUsd)
    revert FxErrors.MaxRelayFeeSwapForSubaccountExceeded(feeAmount * feeTokenPrice.min, maxFeeUsd);

// BaseRelayRouter: function _maxRelayFeeUsdForSubaccount() internal view virtual returns (uint256) { return 0; }
// SubaccountRelayRouter override: return dataStore.getUint(FX100Keys.MAX_RELAY_FEE_SWAP_USD_FOR_SUBACCOUNT);
```

Also set `MAX_RELAY_SWAP_WNT_CAP != 0` at deploy (defense-in-depth, all relay paths).

**AladdinDAO:**

**Zenith:**

---

## #3 — Shared handler refunds can redirect stranded ERC-20 balances

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/3  
**严重性标签**: Medium Risk　**状态**: Open　**创建时间**: 2026-08-11T10:43:23Z

### Target

- [ExternalHandler.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/external/ExternalHandler.sol)
- [ExchangeRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/ExchangeRouter.sol)
- [BaseRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/BaseRouter.sol)
- [Fx100Base.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/ignition/modules/Fx100Base.ts)
- [Fx100Execution.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/ignition/modules/Fx100Execution.ts)

### Severity

- Impact: High
- Likelihood: Low

### Description

The deployment modules construct one `ExternalHandler` and supply that instance to the public `ExchangeRouter`, so unrelated users operate through the same token-holding address. `sendTokens` can place a user's approved ERC-20s at any nonzero receiver, while the documented external-swap flow names this handler as the destination; neither path records who owns a handler balance.

`makeExternalCalls` accepts calls from any address. For every token in `refundTokens`, it reads the handler's current balance and sends all of it to the matching `refundReceivers` entry, without tying that receiver to the account that supplied the tokens. Its unrestricted `target.call(data)` also runs with the shared handler as caller, so a token approval can outlive one invocation and authorize movement of funds deposited in a later transaction.

A correctly assembled `ExchangeRouter.multicall` keeps prefunding, swaps, refunds, and the ensuing action inside one transaction and therefore leaves no transaction boundary for another caller to interpose. The loss condition instead arises when ordinary ERC-20s remain at the handler between transactions—through a non-atomic prefund, residue, or accidental transfer—or when a standing allowance meets a later prefund. At that point an unprivileged account can redirect the balance, causing irreversible loss. The handler is not a vault: this capability reaches its assets only and does not independently expose protocol vault balances.

### Recommendation

Replace the singleton handler with an executor derived or created for the initiating account and operation, atomically pull only declared inputs, and hard-code every refund to that account; routing calls through the public `ExchangeRouter` alone does not provide isolation. Make each executor one-use or clear all approvals before reuse, then revoke the legacy handler's allowances and return or migrate its remaining balances before disabling it.

**Client:**

**Zenith:**

---

## #4 — Incomplete uint validation lets limited keepers halt position increases

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/4  
**严重性标签**: Medium Risk　**状态**: Open　**创建时间**: 2026-08-11T10:43:26Z

### Target

- [Config.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/config/Config.sol)
- [ConfigUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/config/ConfigUtils.sol)
- [Fx100Role.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/ignition/modules/Fx100Role.ts)
- [DataStore.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/data/DataStore.sol)
- [Oracle.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/oracle/Oracle.sol)
- [IncreasePositionUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/position/IncreasePositionUtils.sol)
- [PositionUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/position/PositionUtils.sol)
- [MarketUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/market/MarketUtils.sol)

### Severity

- Impact: Medium
- Likelihood: Medium

### Description

`Fx100Role.ts` installs operational `CONFIG_KEEPER` and `LIMITED_CONFIG_KEEPER` grants, while `onlyKeeper` admits either role to `setUint`; callers holding neither role are excluded. Once `_validateKey` approves the requested base key, the function computes its storage slot, invokes `ConfigUtils.validateRange`, and writes the number to `DataStore` in that transaction. There is no activation delay or additional authorization.

`validateRange` proves constraints only when one of its key-specific conditionals matches. It contains no match and no fail-closed terminus for `MAX_OPEN_INTEREST`, the six estimation/execution gas operands, the pool limits, or `PRO_TRADER_TIER` available to a limited keeper; the broader allowlist likewise exposes `MAX_ORACLE_PRICE_AGE`, `MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR`, timestamp adjustment, and provider delay without value semantics. Those accepted keys therefore reach storage without an on-chain floor, ceiling, or relationship check.

On a market side whose `MAX_OPEN_INTEREST` is changed to zero, any later positive cumulative-open-cost delta makes `MarketUtils.validateOpenInterest` compare a nonzero amount with a zero hard cap. The position increase reverts, and the ordinary market-order error route cancels the order. Separately, the gas operands are multiplied and added directly during fee estimation and keeper reimbursement; extreme values can inflate required fees, consume user refunds up to escrow, or make arithmetic and execution unavailable. The recipient is the order keeper, so a limited config keeper profits only if those roles overlap or collude.

At the oracle boundary, zero `MAX_ORACLE_PRICE_AGE` rejects any provider timestamp earlier than the execution block; it does not authorize stale data. Raising it to an addition-safe but overly permissive value relaxes freshness, while a value that overflows `timestamp + maxPriceAge` reverts; increasing the reference-deviation factor similarly broadens what the Oracle accepts against its reference feed. Provider-specific checks may still narrow the effect, and administrators can restore settings or revoke a keeper, but response is reactive and cannot undo cancellations or execution-fee loss already incurred.

### Recommendation

Define explicit lower, upper, and cross-key constraints in `ConfigUtils.validateRange` for every security-sensitive uint retained in either allowlist, set operationally safe ceilings that also prevent oracle and gas arithmetic overflow, and cover normal, zero, excessive, and overflow-inducing inputs with focused tests. Remove the pool, open-interest, and trader-tier entries from `allowedLimitedBaseKeys` until those constraints exist and require a trusted timelocked route for updates, using an explicit pause function for emergency halts.

**Client:**

**Zenith:**

---

## #5 — Hash-only relay prompts can hide attacker-directed decrease payouts

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/5  
**严重性标签**: Medium Risk　**状态**: Open　**创建时间**: 2026-08-11T10:43:30Z

### Target

- [RelayUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/relay/RelayUtils.sol)
- [RelayRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/relay/RelayRouter.sol)
- [BaseRelayRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/relay/BaseRelayRouter.sol)
- [Router.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/Router.sol)
- [OrderUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/order/OrderUtils.sol)
- [DecreaseOrderUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/order/DecreaseOrderUtils.sol)
- [OrderHandler.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/exchange/OrderHandler.sol)
- [SubaccountRelayRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/relay/SubaccountRelayRouter.sol)

### Severity

- Impact: High
- Likelihood: Low

### Description

The payout path makes the consequence concrete. `RelayRouter` allows any address to lodge an authorized order for `account`; `OrderUtils` stores the supplied nonzero `receiver` without requiring it to equal that account. When an ordinary keeper later processes a decrease order, `DecreaseOrderUtils` sends the released collateral and PnL to the stored receiver. An adversary can therefore prepare an exact market-decrease request naming their own address and collect the victim position's proceeds after routine keeper execution.

The authorization defect arises because `RelayUtils.validateSignature` recognizes two EIP-712 representations. If recovery from the complete action digest does not return `expectedSigner`, the function embeds that digest in `Minified(bytes32 digest)` and accepts recovery under this alternate struct. The action portion of the wallet prompt consequently exposes only a hash instead of the receiver, order terms, fee settings, or deadline. An adversary who obtains the expected signer's blind approval of the prepared request may then submit it through the unrestricted relay endpoint.

The embedded digest still commits to the precise action, chain, and verifying router, so the signature cannot be moved to modified calldata or a different domain. Exploitation instead depends on a fresh signature for the adversary's exact payload, a suitable open position, and relay-fee allowance/state; these requirements make likelihood Low despite the High potential loss. The fallback also applies to `SubaccountApproval` and may install scoped attacker-controlled authority for hostile account-bound trading, though subaccount receiver rules block direct attacker payout through that route.

### Recommendation

Delete `MINIFIED_TYPEHASH` and the fallback recovery branch in `RelayUtils.validateSignature`, and remove `Minified` from signing integrations and documentation so signers always receive the complete action or `SubaccountApproval` EIP-712 schema. Retain the existing domain, deadline, replay, fee, allowance, and subaccount checks.

**Client:**

**Zenith:**

---

## #6 — Operational config access can nullify per-token oracle recency limits

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/6  
**严重性标签**: Medium Risk　**状态**: Open　**创建时间**: 2026-08-11T10:43:34Z

### Target

- [ConfigUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/config/ConfigUtils.sol)
- [Config.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/config/Config.sol)
- [FX100Keys.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/constants/FX100Keys.sol)
- [DataStore.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/data/DataStore.sol)
- [Fx100Role.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/ignition/modules/Fx100Role.ts)
- [Fx100Oracle.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/ignition/modules/Fx100Oracle.ts)
- [ChainlinkPriceFeedUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/oracle/ChainlinkPriceFeedUtils.sol)
- [ChainlinkPriceFeedProvider.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/oracle/ChainlinkPriceFeedProvider.sol)

### Severity

- Impact: Medium
- Likelihood: Medium

### Description

The Ignition role module gives `Config` controller access to `DataStore` and assigns `CONFIG_KEEPER` to an operational account. Although `onlyKeeper` also recognizes `LIMITED_CONFIG_KEEPER`, `_validateKey` confines that role to a separate list; only the full keeper can select the two affected keys. `Config._initAllowedBaseKeys` nevertheless includes both `PRICE_FEED_HEARTBEAT_DURATION` and `DATA_STREAM_SPREAD_REDUCTION_FACTOR`.

Oracle setup stores the heartbeat and stream adjustment under `priceFeedHeartbeatDurationKey(token)` and `dataStreamSpreadReductionFactorKey(token)` and explicitly reserves later changes for `TimelockConfig`. By contrast, `setUint` is synchronous. Given `abi.encode(token)` as its `data`, `FX100Keys.getFullKey` hashes exactly the same 64-byte encoding as those two token helper functions, so its write replaces the initialized value rather than a separate configuration record.

```solidity
bytes32 fullKey = FX100Keys.getFullKey(baseKey, data);
ConfigUtils.validateRange(store, baseKey, data, value);
store.setUint(fullKey, value);
```

`ConfigUtils.validateRange` treats the stream factor as a ratio capped at `Precision.FLOAT_PRECISION` (100%), but it has no heartbeat case. A `type(uint256).max` heartbeat makes `block.timestamp - timestamp > heartbeatDuration` practically impossible, while zero rejects every feed round older than the executing block; feed positivity and configured-feed selection still apply. The Chainlink provider labels an accepted result with the current block time, preventing the generic downstream age test from recovering the feed round's actual age. An optional Pyth comparison can reject a divergent price, but its own recency request uses this heartbeat.

The precondition is control of the semi-trusted `CONFIG_KEEPER` and a token initialized for an affected oracle route; this checkout does not establish that any particular live token has that state. For a matching configuration, stale acceptance or pricing reverts can disrupt orders or ADL, waste gas, delay risk operations, and skew fee or shared-state accounting until an authorized repair. Changing the bounded stream factor can likewise alter bid/ask spread handling without the intended delay, but it cannot exceed 100%; the verified result is reversible operational harm rather than direct principal theft.

### Recommendation

Delete the two oracle keys from `Config._initAllowedBaseKeys` and expose every post-initialization change only through the timelocked configuration authority. Enforce `0 < heartbeatDuration <= protocolMaximum` during initialization and timelocked updates, preserve the existing 0–100% stream-factor bound, and add focused tests that generic `CONFIG_KEEPER` writes to both keys revert.

**Client:**

**Zenith:**

---

## #7 — Unpriced empty markets can freeze global risk controls through premature oracle reads

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/7  
**严重性标签**: Medium Risk　**状态**: Open　**创建时间**: 2026-08-11T10:43:37Z

### Target

- [MarketFactory.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/market/MarketFactory.sol)
- [MarketStoreUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/market/MarketStoreUtils.sol)
- [MarketUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/market/MarketUtils.sol)
- [Oracle.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/oracle/Oracle.sol)
- [ChainlinkPriceFeedUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/oracle/ChainlinkPriceFeedUtils.sol)
- [LPVault.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/vault/LPVault.sol)
- [AdlHandler.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/exchange/AdlHandler.sol)
- [DataStore.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/data/DataStore.sol)

### Severity

- Impact: Medium
- Likelihood: Medium

### Description

Risk aggregation makes an oracle query even when a market has no liability to value. `createMarket` is restricted to `MARKET_KEEPER`, but it records the supplied `indexToken` without checking for a nonzero address or an available secondary source. Every member of `MARKET_LIST` is then passed to `getNetObligation`, where `getSecondaryPrice` runs before the position state is examined.

By contrast, the later PnL branch already recognizes that either missing accounting component makes one side contribute nothing:

```solidity
int256 openInterest = getCumulativeOpenCosts(dataStore, market.marketIndex, isLong).toInt256();
uint256 openInterestInTokens = getOpenInterestInTokens(dataStore, market.marketIndex, isLong);
if (openInterest == 0 || openInterestInTokens == 0) {
    return 0;
}
```

For a newly added market, both sides can satisfy this zero-result condition, yet the earlier price request still executes. A nonzero index token with neither a feed nor a recorded value makes `Oracle` raise `EmptySecondaryPrice`. Since `getGlobalNetObligationRatio` offers no per-market isolation, that error terminates the aggregate instead of accepting the market's zero obligation.

Both public LP claim routes enter this aggregate gate ahead of settlement. ADL state transitions and `executeAdl` also reuse it, including the comparison after a reduction. A semi-trusted `MARKET_KEEPER` can therefore introduce an empty, unpriced market that suspends unrelated claims and ADL operations until privileged intervention installs a usable price or takes the entry out of the traversed set. The effect is a recoverable operational denial of service rather than demonstrated loss of principal.

### Recommendation

Determine from each side's stored cumulative open cost and token open interest whether neither side can have PnL, and return zero before requesting the index price; also reject `address(0)` in `createMarket`. Continue reverting for markets with actual exposure, using only an explicitly bounded, fresh fallback or emergency oracle for their liveness rather than omitting them from the aggregate.

**Client:**

**Zenith:**

---

## #8 — The next increase order can appropriate an uncheckpointed collateral deposit

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/8  
**严重性标签**: Medium Risk　**状态**: Open　**创建时间**: 2026-08-11T10:43:41Z

### Target

- [StrictBank.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/bank/StrictBank.sol)
- [OrderVault.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/bank/OrderVault.sol)
- [BaseRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/BaseRouter.sol)
- [ExchangeRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/ExchangeRouter.sol)
- [OrderHandler.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/exchange/OrderHandler.sol)
- [OrderUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/order/OrderUtils.sol)
- [Fx100Role.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/ignition/modules/Fx100Role.ts)
- [Fx100Usdc.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/ignition/modules/Fx100Usdc.ts)

### Severity

- Impact: High
- Likelihood: Low

### Description

`OrderUtils.createOrder` does not use the requested collateral field to identify what an increase-order account supplied. It obtains the stored amount through the following call instead:

```solidity
cache.initialCollateralDeltaAmount = orderVault.recordTransferIn(market.collateralToken);
```

`StrictBank.recordTransferIn` has only one `tokenBalances` checkpoint for each token. It moves that checkpoint to the vault's live ERC-20 balance and returns the full positive change, with no depositor, order key, or expected transfer amount in the calculation. Because `OrderVault` adds no per-account ledger, collateral deposited earlier remains claimable by the next creation call until that global checkpoint advances.

An unprivileged address reaches this code through `ExchangeRouter.createOrder`, which labels the order with `msg.sender` but neither pulls collateral nor proves the source of the balance increase. `BaseRouter.sendTokens` is a separate public operation, and the deployed role configuration authorizes the router-to-handler-to-vault chain. Consequently, a non-atomic prefund, an accidental direct transfer, or other positive surplus can be recorded on a different user's order. Atomic batching and the transfer-before-create logic in the subaccount and relay routes make such exposure uncommon, but neither removes an older surplus from `recordTransferIn`'s result. The configured USDC-like asset is sufficient; no rebase, burn, or transfer-fee behavior is part of this claim.

`LimitIncrease` is both an increase order and non-market. Its owner is permitted to call `ExchangeRouter.cancelOrder`; the handler's age gate does not apply, and `OrderUtils.cancelOrder` sends the order's entire `initialCollateralDeltaAmount` to `cancellationReceiver` or, when unset, to the account. Any foreign portion of that amount is therefore lost to the order creator, with the maximum loss bounded by the uncheckpointed collateral already in the vault.

### Recommendation

Make `ExchangeRouter`, `SubaccountRouter`, `RelayRouter`, and `SubaccountRelayRouter` call one atomic intake primitive that snapshots the vault, pulls `params.numbers.initialCollateralDeltaAmount` from the order account during creation, and stores only the balance change caused by that pull. Stop deriving order credit from the ambient `recordTransferIn` delta, and expose pre-existing surplus solely through a separately authorized recovery or synchronization path; limiting the shared delta to the requested amount is not sufficient.

**Client:**

**Zenith:**

---

## #9 — UI fee receivers can raise charges on pending orders

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/9  
**严重性标签**: Medium Risk　**状态**: Open　**创建时间**: 2026-08-11T10:43:45Z

### Target

- [IBaseOrderUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/order/IBaseOrderUtils.sol)
- [Order.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/order/Order.sol)
- [OrderUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/order/OrderUtils.sol)
- [OrderStoreUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/order/OrderStoreUtils.sol)
- [RelayUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/relay/RelayUtils.sol)
- [ExchangeRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/ExchangeRouter.sol)
- [MarketUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/market/MarketUtils.sol)
- [Config.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/config/Config.sol)

### Severity

- Impact: High
- Likelihood: Low

### Description

`CreateOrderParams` and the persisted `Order.Props` identify `uiFeeReceiver`, but neither records a factor ceiling chosen by the trader. `OrderStoreUtils` consequently commits only that address, and the relay and subaccount EIP-712 schemas authenticate the same unbounded fields. A signed or direct order therefore fixes the beneficiary without limiting the rate it may apply.

The relay type makes that authorization gap explicit:

```solidity
string constant CREATE_ORDER_ADDRESSES =
    "CreateOrderAddresses(address receiver,address cancellationReceiver,address callbackContract,address uiFeeReceiver)";
```

`ExchangeRouter.setUiFeeFactor` permits an address to replace its own setting immediately. When a keeper later processes the order, `PositionPricingUtils.getUiFees` asks `MarketUtils.getUiFeeFactor` for the receiver’s current value, limits it only by `MAX_UI_FEE_FACTOR`, and applies it to `sizeDeltaUsd`. Ordinary `ORDER_KEEPER` processing is sufficient: the fee receiver needs no execution privilege and can change the value between submission and execution.

This path is inactive until trusted configuration enables UI fees. The shipped general settings do not initialize `MAX_UI_FEE_FACTOR`, so a fresh deployment reads zero; a `CONFIG_KEEPER` must deliberately assign a positive cap, and `ConfigUtils` rejects values above 5% of notional.

With a positive cap, a sufficiently collateralized increase completes after subtracting the newly calculated fee from position collateral. A fully payable decrease similarly funds it from the trader’s collateral or output. In both branches, `FeeUtils` assigns the tokens to a receiver-specific claim balance, and `claimUiFees` allows that same unprivileged receiver to withdraw them to a chosen destination. Because the charge scales with notional, leverage can make it a substantial share of posted collateral.

An oversized increase does not pay the receiver: insufficient token collateral or the later USD sufficiency check reverts, after which `OrderHandler` cancels market orders and freezes non-market orders. The issue remains for orders that retain enough collateral to pass those checks.

### Recommendation

Introduce a trader-specified `maxUiFeeFactor` in `CreateOrderParams`, persist it in `Order.Props` and `OrderStoreUtils`, expose it through readers and events, incorporate it into relay and subaccount EIP-712 creation hashes, and migrate every create-order caller. At execution, either reject a live factor above the stored limit or charge `min(MarketUtils.getUiFeeFactor(dataStore, order.uiFeeReceiver()), order.maxUiFeeFactor())`; an unsigned creation-time snapshot is insufficient because the receiver can raise its factor before order creation.

**Client:**

**Zenith:**

---

## #10 — Public handler calls can pre-authorize theft of later stranded token balances

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/10  
**严重性标签**: Medium Risk　**状态**: Open　**创建时间**: 2026-08-11T10:43:49Z

### Target

- [ExternalHandler.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/external/ExternalHandler.sol)
- [ExchangeRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/ExchangeRouter.sol)
- [BaseRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/BaseRouter.sol)
- [Router.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/Router.sol)
- [AccountUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/utils/AccountUtils.sol)
- [Fx100Base.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/ignition/modules/Fx100Base.ts)
- [Fx100Execution.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/ignition/modules/Fx100Execution.ts)
- [Fx100Role.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/ignition/modules/Fx100Role.ts)

### Severity

- Impact: High
- Likelihood: Low

### Description

Production wiring gives `ExchangeRouter` one shared `ExternalHandler`, and both call surfaces are open to any account. The wrapper relays caller-chosen destinations and bytes to the handler. For each requested call, the handler's sole destination check is that bytecode exists; it then performs the low-level call. Choosing a conventional ERC-20 and encoding a maximum approval therefore makes the token record `ExternalHandler` as owner and an attacker-controlled address as spender. Nothing bounds or revokes that authorization when the batch ends, and a standard infinite allowance is not consumed by `transferFrom`.

Loss becomes possible only when the shared handler retains tokens after a transaction finishes. The documented `sendTokens(token, externalHandler, amount)` route can place a caller's tokens there because deployment grants `ExchangeRouter` the router-plugin role. If that prefund or stranded amount crosses the transaction boundary, the approved address can collect it under the standing allowance, which also remains effective against later balances.

A correctly assembled `multicall` that deposits, swaps, and consumes or refunds all tokens is atomic, so an EOA cannot insert a drain while the handler holds only a transient balance. The public whole-balance refund loop already confirms that this executor follows a zero-at-rest model rather than providing durable custody; the defect here is the approval authority that survives its originating call.

### Recommendation

Route approvals through a dedicated path that force-approves only the exact required amount to an allowlisted spender immediately before the permitted swap, then force-approves zero before returning. Complete the fix by enforcing one atomic pull, swap, and measured-delta refund operation that leaves no shared balance, or by using per-user executors; selector-only approval cleanup is inadequate while callers can request arbitrary transfers and whole-balance refunds.

**Client:**

**Zenith:**

---

## #11 — Orders leave the skew EMA unchanged after open interest moves

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/11  
**严重性标签**: Medium Risk　**状态**: Open　**创建时间**: 2026-08-11T10:43:52Z

### Target

- [ExchangeRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/ExchangeRouter.sol)
- [OrderHandler.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/exchange/OrderHandler.sol)
- [ExecuteOrderUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/order/ExecuteOrderUtils.sol)
- [MarketUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/market/MarketUtils.sol)
- [ExponentialMovingAverage.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/common/math/ExponentialMovingAverage.sol)
- [IncreasePositionUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/position/IncreasePositionUtils.sol)
- [DecreasePositionUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/position/DecreasePositionUtils.sol)
- [PositionPricingUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/pricing/PositionPricingUtils.sol)

### Severity

- Impact: Medium
- Likelihood: Medium

### Description

`ExecuteOrderUtils.executeOrder` settles elapsed funding through `PositionUtils.updateFundingState` and only then calls `orderExecutor.processOrder`. For size-changing orders, `IncreasePositionUtils` or `DecreasePositionUtils` subsequently alters market open interest, yet the shared flow returns without recording the resulting skew. The stored `fundingSkewEma` consequently represents the open-interest distribution that preceded the order.

The EMA library correctly carries the previous observation across the interval that has just ended. Because execution supplies no observation after the open-interest mutation, a later funding update rolls the holding interval forward from the sample taken before the position opened; the newly visible imbalance is retained only for subsequent time. When the earlier sample was balanced and a directional position remains open beyond the EMA horizon, the skew-dependent factors used for that position’s accrual exclude its newly created imbalance.

`ExchangeRouter.createOrder` permits an unprivileged trader to submit the order, while `OrderHandler` relies on a configured keeper and valid oracle data for execution; no keeper misconduct is necessary. When the position is reduced or closed, `PositionPricingUtils` converts the incomplete funding-index delta over its token size into a smaller debit. The funding floor and any component implied by the old skew still apply, and configured clamps constrain the discrepancy, but the omitted imbalance funding is not allocated to LPs or the opposing side as intended.

### Recommendation

Retain the funding settlement that precedes `processOrder`, then persist the post-mutation skew at the same block timestamp without applying another funding-period delta. Implement a dedicated resampling operation from the shared `ExecuteOrderUtils` flow so increases, decreases, liquidations, and ADL executions all invoke it, and cover a balanced-market open followed by a delayed close with a regression; moving the sole settlement after the order would charge the new position for earlier time.

**Client:**

**Zenith:**

---

## #12 — Unreserved refund-callback gas can roll back order settlement

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/12  
**严重性标签**: Medium Risk　**状态**: Open　**创建时间**: 2026-08-11T10:43:56Z

### Target

- [CallbackUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/callback/CallbackUtils.sol)
- [Config.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/config/Config.sol)
- [ConfigUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/config/ConfigUtils.sol)
- [FX100Keys.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/constants/FX100Keys.sol)
- [Fx100Role.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/ignition/modules/Fx100Role.ts)
- [ExchangeRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/ExchangeRouter.sol)
- [OrderUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/order/OrderUtils.sol)
- [GasUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/gas/GasUtils.sol)

### Severity

- Impact: Medium
- Likelihood: Medium

### Description

`REFUND_EXECUTION_FEE_GAS_LIMIT` is a normal `CONFIG_KEEPER` setting rather than an immutable zero. `Config` accepts the base key, empty configuration data maps it to the same key consumed by `CallbackUtils`, and `ConfigUtils.validateRange` neither caps the value nor connects it to any execution-gas reserve.

Gas admission for increase and decrease orders is calculated from the configured base cost plus `order.callbackGasLimit()`; it does not include the distinct allowance later used for refund delivery. For example, the increase-order estimator is limited to:

```solidity
return dataStore.getUint(FX100Keys.increaseOrderGasLimitKey()) + order.callbackGasLimit();
```

Once an operational keeper assigns a positive refund allowance, any account may submit an order that names a contract callback and arrange for a nonzero residual execution-fee refund. Consequently, an `ORDER_KEEPER` call can clear the initial gas validation and still arrive at `refundExecutionFee` with `(gasleft() / 64) * 63` below the stored allowance.

At that point, `validateGasLeftForCallback` executes before the external-call `try/catch`. Its exception therefore cannot become the `false` result that `GasUtils.payExecutionFee` uses to send the refund to the receiver directly, with WNT as the fallback. `BaseHandler` rethrows this error, so transaction atomicity undoes the attempted execution and leaves the order pending while the keeper pays for the failed transaction. Cancellation reaches the same late fee-payment path and also rolls back on this condition. When the configured limit is feasible, a better-funded retry can complete; a setting beyond practical transaction gas instead keeps affected callback orders unavailable until the configuration is reduced.

### Recommendation

Change `CallbackUtils.refundExecutionFee` so insufficient EIP-150-forwardable gas returns `false` instead of invoking a reverting validator; this routes the refund through the existing native/WNT fallback. Add a regression test through the real `Config` and `OrderHandler` paths that enables a positive limit, uses a gas budget accepted by admission, and confirms settlement succeeds via that fallback.

**Client:**

**Zenith:**

---

## #13 — Account callbacks can roll back underfunded forced reductions

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/13  
**严重性标签**: Medium Risk　**状态**: Open　**创建时间**: 2026-08-11T10:44:02Z

### Target

- [ExchangeRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/ExchangeRouter.sol)
- [CallbackUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/callback/CallbackUtils.sol)
- [DataStore.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/data/DataStore.sol)
- [Fx100Role.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/ignition/modules/Fx100Role.ts)
- [Fx100Execution.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/ignition/modules/Fx100Execution.ts)
- [defaults.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/scripts/config/defaults.ts)
- [LiquidationUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/liquidation/LiquidationUtils.sol)
- [AdlUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/adl/AdlUtils.sol)

### Severity

- Impact: Low
- Likelihood: High

### Description

Liquidation and ADL are synthesized with the affected account's saved callback rather than a protocol-owned target. Their builders give that address `MAX_CALLBACK_GAS_LIMIT` but place `0` in `executionFee`; the repository's default cap is 2,000,000 gas.

The forced handlers dispatch this order without callback-inclusive admission sizing. During shared order processing, the position decrease occurs before `CallbackUtils.afterOrderExecution`. When the saved address contains code, the callback helper first determines whether EIP-150 leaves enough forwardable gas for the entire declared allowance. That check precedes the external-call `try/catch`, so inadequate remaining gas raises `InsufficientGasLeftForCallback` and atomically undoes the reduction. Adequately provisioned retries are not blocked: the invocation is capped, and a revert from inside the callback is caught.

`ExchangeRouter.setSavedCallbackContract` lets a caller populate its own account-and-market slot, and deployment grants that router the controller authority required by `DataStore`. A position owner can therefore select the callback that a keeper-authorized liquidation or ADL later inherits. On a successful attempt, attacker-chosen work can use as much as the bounded allowance, yet the zero fee causes keeper payment to be skipped. The result is unreimbursed gas expenditure and a retryable delay, not an unbounded or permanent halt.

### Recommendation

Stop inheriting saved callbacks in involuntary orders by assigning `address(0)` to `callbackContract` and `0` to `callbackGasLimit` in both `createLiquidationOrder` and `createAdlOrder`. Leave the callback fields of user-created orders unchanged.

**Client:**

**Zenith:**

---

## #14 — Unbudgeted payout helpers make retained router ETH publicly spendable

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/14  
**严重性标签**: Medium Risk　**状态**: Open　**创建时间**: 2026-08-11T10:44:06Z

### Target

- [BaseRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/BaseRouter.sol)
- [PayableMulticall.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/utils/PayableMulticall.sol)
- [TokenUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/token/TokenUtils.sol)
- [AccountUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/utils/AccountUtils.sol)
- [ExchangeRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/ExchangeRouter.sol)
- [Router.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/Router.sol)
- [AccessStoreProxy.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/access-control/AccessStoreProxy.sol)
- [Fx100Execution.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/ignition/modules/Fx100Execution.ts)

### Severity

- Impact: High
- Likelihood: Low

### Description

`ExchangeRouter` receives `BaseRouter`'s externally callable payout surface through inheritance. Neither `sendNativeToken` nor `sendWnt` uses a role gate or ties its caller-selected `amount` to native currency delivered by that invocation; `TokenUtils` instead pays or wraps the quantity from the executing router's total ETH balance. The Ignition module constructs `ExchangeRouter` without overriding these inherited endpoints.

A router becomes vulnerable only while it retains ETH. That state can arise through `multicall` or another payable entry point that leaves part or all of the payment unused. At that point, an account with no protocol role may nominate any nonzero receiver and spend the residue in one call, as ETH or WNT. The loss cannot exceed the affected router's held ETH and does not by itself reach ERC-20 balances or protocol vaults.

`PayableMulticall` does not partition the outer payment. Every delegatecall observes the original `msg.value`, while the batch loop neither reduces a shared allowance nor preserves the balance that existed on entry. As a result, several payout items may collectively use more native currency than their top-level call contributed. The calls are sequential, so neither callback reentry nor privileged authority is necessary.

The exposure exists only after a residual balance is created; the checked integration scenario wraps exactly the attached execution fee. This prerequisite limits likelihood, but the resulting transfer is irreversible once retained funds are present.

### Recommendation

Establish a call-scoped native allowance from the outer `msg.value`, charge each direct or delegatecalled `sendNativeToken` and `sendWnt`, and revert before a charge exceeds the remainder; reject or refund any unused value. Apply this accounting to every `BaseRouter` descendant and enforce a floor at the pre-call balance (`address(this).balance - msg.value` on entry), since validating each delegated item against its unchanged `msg.value` would still permit cumulative spending of earlier funds.

**Client:**

**Zenith:**

---

## #15 — Pending vault deposits can fund the next caller's order

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/15  
**严重性标签**: High Risk　**状态**: Open　**创建时间**: 2026-08-11T10:44:10Z

### Target

- [BaseRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/BaseRouter.sol)
- [Router.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/Router.sol)
- [StrictBank.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/bank/StrictBank.sol)
- [ExchangeRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/ExchangeRouter.sol)
- [OrderHandler.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/exchange/OrderHandler.sol)
- [OrderUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/order/OrderUtils.sol)
- [AccountUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/utils/AccountUtils.sol)
- [GasUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/gas/GasUtils.sol)

### Severity

- Impact: High
- Likelihood: Medium

### Description

`sendTokens` and `sendWnt` only place assets at a receiver; neither records a depositor entitlement. Order submission is independently exposed by `ExchangeRouter.createOrder`, which forwards `msg.sender` as the order account without collecting its collateral in that call. The deployed router and handler roles therefore make the controller-gated vault functions reachable from an ordinary account.

`OrderVault` inherits `StrictBank`. Its accounting state consists of one checkpoint for each token, rather than a user-indexed ledger. `_recordTransferIn` replaces that checkpoint with the live ERC20 balance and reports the complete surplus:

```solidity
uint256 prevBalance = tokenBalances[token];
uint256 nextBalance = IERC20(token).balanceOf(address(this));
tokenBalances[token] = nextBalance;
return nextBalance - prevBalance;
```

`OrderUtils.createOrder` stores this result as an increase order's `initialCollateralDeltaAmount` even if somebody else supplied the balance increase. It also snapshots WNT. Once the selected order size meets the configured subsidy threshold, creation sets the fee to zero and sends the observed WNT to `order.receiver`; `OrderHandler.updateOrder` performs comparable aggregate WNT intake before paying its refund to the stored receiver. `AccountUtils` checks receivers only for the zero address, so it cannot establish any relationship to the funder.

During a non-atomic staging window, an adversarial increase order can consume the entire pending collateral surplus. Cancellation then pays the recorded amount to that order's `cancellationReceiver`. The ownership gates still pass because the adversary owns the consuming order, and a non-market order has no market-order cancellation delay. Independently, a subsidized create or update can pay captured WNT to the adversary's receiver.

The full uncheckpointed transfer is at risk, with no finding-specific value cap. Balances already incorporated into `tokenBalances`, including collateral backing existing orders, are outside this mechanism. Optional `multicall` batching removes the inter-transaction window when a client uses it, but the funding API also permits standalone transfers.

### Recommendation

Atomically credit the authenticated funding account with the exact token receipt in every exchange, relay, and subaccount funding route, then require creation and updates to debit only that account's token-specific credit and store those debits on the order. Limit `StrictBank`'s aggregate checkpoint to reconciliation so direct transfers and unrelated balance changes can never supply collateral or fees.

**Client:**

**Zenith:**

---

## #16 — Signed funding writes evade ceiling and ordering enforcement

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/16  
**严重性标签**: High Risk　**状态**: Open　**创建时间**: 2026-08-11T10:44:14Z

### Target

- [Config.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/config/Config.sol)
- [ConfigUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/config/ConfigUtils.sol)
- [DataStore.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/data/DataStore.sol)
- [Fx100Role.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/ignition/modules/Fx100Role.ts)
- [writers.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/scripts/config/writers.ts)
- [configureMarket.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/scripts/configureMarket.ts)
- [MarketUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/market/MarketUtils.sol)
- [OrderHandler.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/exchange/OrderHandler.sol)

### Severity

- Impact: High
- Likelihood: Medium

### Description

Signed writes are an intended operational route: the deployment grants `CONFIG_KEEPER` and `LIMITED_CONFIG_KEEPER`, `writers.ts` obtains the current entry with `getInt`, and market setup submits signed values through `Config.setInt`. The key tables allow a full configuration keeper to change the funding floor, base, minimum, and maximum; a limited keeper may change the two bounds. An ordinary account cannot use this setter.

Once `_validateKey` approves a base key, `setInt` derives its full key and commits the value to `DataStore.intValues` without a value check. `ConfigUtils.validateRange` has an unsigned funding branch that loads counterpart entries from `uintValues`, enforces the maximum funding ceiling, and rejects misordered unsigned bounds; `setInt` never invokes that branch. Because the mappings are independent, these controls neither cap nor order the signed entries read by the funding engine.

For a market with open interest, `MarketUtils.getNextFundingAmountPerSize` feeds the signed floor, base, minimum, and maximum into its rate clamp, then scales a positive rate by open interest and elapsed time to advance the payer’s negative funding index. The path entered through `OrderHandler.executeOrder` updates funding before the requested position operation. When an affected position is processed later, the index difference is converted to collateral-token units, added to `totalCostAmount`, and subtracted from collateral. A mistaken or malicious keeper update can therefore impose funding far above the designed cap across the market, exhaust trader collateral, trigger liquidations, and produce pool or insurance shortfalls. No accrual occurs while total open interest is zero, and the charge is realized only when the position next interacts.

### Recommendation

Add a signed validator and invoke it in `Config.setInt` before `store.setInt`: query counterpart funding bounds with `DataStore.getInt`, cap the signed maximum, enforce `minimum <= maximum`, and apply protocol-approved sign and magnitude restrictions to the signed funding, skew-impact, and dynamic-spread families with initialization-safe updates. Test both keeper roles so excessive and inverted writes revert while the current valid deployment sequence remains accepted.

**Client:**

**Zenith:**

---

## #17 — LP redemptions can strand existing exposure above both pool-relative limits

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/17  
**严重性标签**: High Risk　**状态**: Open　**创建时间**: 2026-08-11T10:44:18Z

### Target

- [ExchangeRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/ExchangeRouter.sol)
- [OrderHandler.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/exchange/OrderHandler.sol)
- [IncreaseOrderUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/order/IncreaseOrderUtils.sol)
- [IncreasePositionUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/position/IncreasePositionUtils.sol)
- [PositionUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/position/PositionUtils.sol)
- [MarketUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/market/MarketUtils.sol)
- [LPVault.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/vault/LPVault.sol)
- [VaultBase.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/vault/VaultBase.sol)

### Severity

- Impact: High
- Likelihood: Medium

### Description

Once its delay and epoch conditions are met, an LP can call either claim method without holding a protocol role. Each method invokes `_validateWithdrawalsAllowed()`, which is limited to the aggregate positive-PnL test, then destroys the escrowed shares and sends the corresponding assets via `_withdrawAssets()`. Since `VaultBase.totalAssets()` is the on-vault balance plus strategy holdings, that payment makes the returned quantity smaller. Neither claim simulates this post-payment state or mutates position accounting.

```solidity
_advanceEpoch();
_validateWithdrawalsAllowed();

uint256 currentNav = nav();
uint256 shares = _claimWithdrawRequest(_msgSender(), requestId, currentNav);
assets = _convertToAssets(shares, currentNav);
_burn(address(this), shares);

_withdrawAssets(assets, receiver);
```

Market admission uses that same mutable quantity as the base of two factor-derived ceilings. For each direction, `validateOpenInterest()` compares cumulative open cost with `poolUsd * maxOpenInterestFactor`; `validateOpenInterestReserve()` compares aggregate token OI valued at the index price with `poolUsd * reserveFactor`. The former is reached from a positive cumulative-cost delta and the latter from a positive position-size change. Thus the checks approve growth but are absent from a pure LP redemption, even though redemption reduces `poolUsd`.

An LP holding enough shares can therefore complete the normal waiting process while current positive PnL is below the withdrawal threshold and leave pre-existing OI above both factor ceilings. The path needs neither a privileged caller nor corrupted pricing. It does not let the LP collect more than its pro-rata entitlement, and shrinking the denominator cannot violate the denominator-free absolute `MAX_OPEN_INTEREST` constraint. Rather, risk is shifted onto those who stay: if the market moves against remaining liquidity before positions contract or ADL/risk-off behavior acts, trader claims can exceed the residual risk budget and potentially consume the pool.

### Recommendation

Gate both claim variants with one projected-state routine: subtract the redemption from `totalAssets`, derive the resulting `poolUsd`, and at current secondary-oracle prices reject the transfer whenever an enabled market's long or short cumulative open cost exceeds its factor allowance or its combined nominal token OI exceeds the reserve allowance. Keep the present PnL gate, apply the routine to other discretionary liquidity outflows that do not simultaneously lower OI, and atomically enter the established risk-off/ADL mode when an unavoidable settlement outflow creates the same condition.

**Client:**

**Zenith:**

---

## #18 — Partitioned position orders reduce the intended nonlinear depth charge

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/18  
**严重性标签**: High Risk　**状态**: Open　**创建时间**: 2026-08-11T10:44:21Z

### Target

- [ExchangeRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/ExchangeRouter.sol)
- [OrderUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/order/OrderUtils.sol)
- [PositionPricingUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/pricing/PositionPricingUtils.sol)
- [PositionUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/position/PositionUtils.sol)

### Severity

- Impact: Medium
- Likelihood: High

### Description

Any trader can submit repeated requests through `ExchangeRouter.createOrder`. `OrderUtils.createOrder` assigns each request a fresh key and persists it independently, without associating the order with recently executed directional volume:

```solidity
bytes32 key = NonceUtils.getNextKey(dataStore);

order.touch();

BaseOrderUtils.validateNonEmptyOrder(order);
OrderStoreUtils.set(dataStore, key, order);
```

During ordinary keeper execution, `getPriceImpactSpread` obtains the size from that fill's `abs(usdDelta)`, chooses the configured bid or ask depth, and derives the impact spread without any consumed-depth input. Neither depth value is advanced after execution. Consequently, each smaller same-side fill is assessed from zero accumulated flow, so its depth component can be lower in aggregate than the component for the combined quantity.

`PositionUtils` uses this result for entries and ordinary exits: long increases and short decreases consume the buy side, while short increases and long decreases consume the sell side. Position and open-interest writes occur only after pricing; later fills therefore reflect changed skew but still see undepleted configured depth. Skew movement can offset the advantage in some states, and constant spreads, position fees, execution costs, and risk limits remain applicable, but the repository's nonzero depth-impact configuration admits states where partitioning improves the trader's weighted execution. The resulting entry exposure or exit-value shortfall is ultimately borne by liquidity providers when the position settles; it is not evidence of a guaranteed profitable round trip.

### Recommendation

Maintain an atomic flow accumulator for each market and book side over an explicitly defined depth-replenishment window, charging fill `q` by the curve difference `C(Q + q) - C(Q)` before advancing `Q`. Share buy-side state between long increases and short decreases and sell-side state between short increases and long decreases, reset or decay it only upon a fresh-depth event, apply caps consistently to the marginal charge, and add split-invariance coverage for both sizing modes, clamp boundaries, and intervening opposite-side flow.

**Client:**

**Zenith:**

---

## #19 — Independent collateral-factor limits permit unsafe market states

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/19  
**严重性标签**: High Risk　**状态**: Open　**创建时间**: 2026-08-11T10:44:25Z

### Target

- [Config.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/config/Config.sol)
- [ConfigUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/config/ConfigUtils.sol)
- [MarketUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/market/MarketUtils.sol)
- [IncreasePositionUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/position/IncreasePositionUtils.sol)
- [PositionUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/position/PositionUtils.sol)
- [ExchangeRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/ExchangeRouter.sol)
- [OrderHandler.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/exchange/OrderHandler.sol)
- [LiquidationHandler.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/exchange/LiquidationHandler.sol)

### Severity

- Impact: High
- Likelihood: Medium

### Description

Per-market collateral requirements are written through `Config.setUint`. The function delegates to `ConfigUtils.validateRange` and commits the result, but that validator applies only separate ceilings—1% to `MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION` and 5% to `MIN_COLLATERAL_FACTOR`—without rejecting zero or reading the companion value. This gap allows a `CONFIG_KEEPER` (not a limited keeper or trader) to store either a zero liquidation factor or a liquidation factor above the ordinary factor. The checked-in defaults are ordered, but `configureMarket` derives the values independently and submits distinct transactions, leaving the contract as the invariant boundary for an authorized configuration mistake.

```solidity
bytes32 fullKey = FX100Keys.getFullKey(baseKey, data);
ConfigUtils.validateRange(store, baseKey, data, value);
store.setUint(fullKey, value);
```

A trader can submit a nonzero-size increase through `ExchangeRouter`; keeper execution in `OrderHandler` reaches `IncreasePositionUtils`, which asks `PositionUtils` to evaluate the ordinary factor by passing `forLiquidation == false`. After `graceEnd`, the keeper route in `LiquidationHandler` evaluates the position with `forLiquidation == true` and consequently selects the liquidation factor. If that second factor is higher, a position admitted at the original oracle values can cross the liquidation threshold without any price change and be removed by standard settlement, imposing the usual close and liquidation charges.

Setting the liquidation factor to zero instead makes the factor-derived minimum equal zero. This removes the leverage-based trigger for positions with positive remaining collateral; the independent `MIN_COLLATERAL_USD` and nonpositive-collateral conditions continue to operate, postponing intervention toward the insolvency boundary and increasing exposure to bad debt.

### Recommendation

Add per-market relational validation to both writes: require `MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION` to be nonzero and below `MIN_COLLATERAL_FACTOR`, and reject a new ordinary factor unless it remains above any initialized liquidation factor. Prevent market activation and position opening while the liquidation factor is zero, and make `configureMarket` choose a transaction order that preserves the relation without exposing a live intermediate state; an atomic setter for both values is an equivalent fix.

**Client:**

**Zenith:**

---

## #20 — Positive market-side PnL allows zero-factor decreases to remain uncapped

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/20  
**严重性标签**: High Risk　**状态**: Open　**创建时间**: 2026-08-11T10:44:28Z

### Target

- [MarketUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/market/MarketUtils.sol)
- [PositionUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/position/PositionUtils.sol)
- [Precision.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/utils/Precision.sol)
- [Config.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/config/Config.sol)
- [ConfigUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/config/ConfigUtils.sol)
- [DataStore.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/data/DataStore.sol)
- [configureMarket.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/scripts/configureMarket.ts)
- [ExchangeRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/ExchangeRouter.sol)

### Severity

- Impact: High
- Likelihood: Medium

### Description

`MAX_PNL_FACTOR` accepts values from 0% through 100%, and an absent uint entry in `DataStore` also resolves to zero. An authorized zero setting—or omission of shared-market parameters while open-interest limits are configured—can therefore leave either market side with `MAX_PNL_FACTOR_FOR_TRADERS == 0`, although the checked-in sample and fixture use 100%.

For positive aggregate PnL on that side, `MarketUtils.getCappedPnl` correctly yields zero. `PositionUtils._getPositionPnlUsd` then excludes this boundary result from its only scaling path:

```solidity
if (cache.cappedPoolPnl != cache.poolPnl && cache.cappedPoolPnl > 0 && cache.poolPnl > 0) {
```

Because `totalPositionPnl` keeps its pre-cap value, a profitable position produces positive `basePnlUsd`. The trader need not control configuration: after the state is established by `CONFIG_KEEPER` or initialization, the position owner can submit a normal decrease through `ExchangeRouter`, and routine `ORDER_KEEPER` execution carries the value into collateral settlement. Settlement removes the matching tokens from the LP vault, stages them in `PositionVault`, and sends the combined output to the receiver.

Payable profitable closes can consequently reduce LP-vault NAV and exhaust realizable shared assets despite the zero ceiling; later withdrawals exceeding available local and strategy liquidity revert rather than paying beyond the vault balance. This can impose direct LP loss and leave remaining obligations undercollateralized.

### Recommendation

Remove the `cappedPoolPnl > 0` predicate in `_getPositionPnlUsd`, retaining the inequality and positive `poolPnl` checks so the existing zero-numerator `Precision.mulDiv` reduces payable profit to zero. Cover both market sides and the LP-vault settlement path with zero-factor regressions; if zero is meant to disable capping, implement that meaning in `getCappedPnl` and reject or translate ambiguous zero configuration.

**Client:**

**Zenith:**

---

## #21 — Subaccount relay helpers omit callback-sensitive execution-fee limits

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/21  
**严重性标签**: High Risk　**状态**: Open　**创建时间**: 2026-08-11T10:44:32Z

### Target

- [SubaccountRelayRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/relay/SubaccountRelayRouter.sol)
- [SubaccountUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/subaccount/SubaccountUtils.sol)
- [BaseRelayRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/relay/BaseRelayRouter.sol)
- [Router.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/Router.sol)
- [RelayUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/relay/RelayUtils.sol)
- [OrderUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/order/OrderUtils.sol)
- [OrderHandler.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/exchange/OrderHandler.sol)
- [GasUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/gas/GasUtils.sol)

### Severity

- Impact: High
- Likelihood: Medium

### Description

`SubaccountRelayRouter` verifies the delegate's relay signature and consumes the parent's active subaccount action allowance before forwarding standalone creates, standalone updates, and the corresponding batch members to shared helpers. Creation validation pins the receiver and cancellation receiver to the parent but leaves `callbackContract` to the delegate; an update can add `executionFeeIncrease` to an existing callback-bearing order.

For both operations, `BaseRelayRouter` calls `OrderHandler` with `shouldCapMaxExecutionFee` set to `false`. This differs from `SubaccountRouter`, which derives the policy from the proposed callback during creation or the stored callback during an update. With the shared value disabled, `GasUtils.validateAndCapExecutionFee` returns the entire received amount and zero excess, so `OrderUtils` or `OrderHandler` persists all WNT supplied by the relay sender rather than returning the amount above the callback ceiling to the parent. Every create or update inside a batch reaches the same helpers.

After the order action, `_payRelayFee` includes that WNT in `nativeFee`, converts the total into `fee.feeToken` using oracle prices, and reimburses `msg.sender` from the parent's collateral-token balance through `Router.pluginTransfer`. During later fee settlement, the keeper receives the actual execution cost, while the remaining WNT is unwrapped and offered as native value to the stored callback. A malicious or compromised authorized subaccount that also controls the callback and relay sender can therefore reclaim most of its WNT advance while making the parent pay its collateral-token equivalent.

Exploitation still requires a non-subsidized order, a live delegated slot with unused action quota, a valid subaccount signature, adequate parent balance and Router allowance, and a callback contract that accepts the refund. The signed `fee.maxFeeAmount` and any nonzero `MAX_RELAY_SWAP_WNT_CAP` also bound or revert the charge. If that global cap is disabled or sufficiently high, however, one authorized action can consume collateral up to the parent's available balance or allowance and the subaccount-selected maximum fee.

### Recommendation

Thread a cap-policy argument through the shared relay helpers: ordinary `RelayRouter` calls should retain `false`, while every `SubaccountRelayRouter` create or batch-create should derive the value from `params.addresses.callbackContract` and every update or batch-update should derive it from the stored order callback. Add create, update, and batch regression cases confirming that an above-limit callback fee is stored only at the maximum and that the excess returns to the parent.

**Client:**

**Zenith:**

---

## #22 — Funding checkpoints preserve obsolete skew after open interest changes

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/22  
**严重性标签**: High Risk　**状态**: Open　**创建时间**: 2026-08-11T10:44:35Z

### Target

- [ExchangeRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/ExchangeRouter.sol)
- [OrderHandler.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/exchange/OrderHandler.sol)
- [ExecuteOrderUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/order/ExecuteOrderUtils.sol)
- [MarketUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/market/MarketUtils.sol)
- [ExponentialMovingAverage.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/common/math/ExponentialMovingAverage.sol)
- [PositionUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/position/PositionUtils.sol)
- [DecreasePositionUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/position/DecreasePositionUtils.sol)
- [IncreasePositionUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/position/IncreasePositionUtils.sol)

### Severity

- Impact: High
- Likelihood: Medium

### Description

`ExecuteOrderUtils.executeOrder` invokes `PositionUtils.updateFundingState` before it hands the order to `processOrder`. The funding routine therefore settles the elapsed period and calls `saveValue` with the market's pre-execution OI ratio. Position sizing occurs afterward: `IncreasePositionUtils` and `DecreasePositionUtils` reach the shared `PositionUtils.updateOpenInterest`, which changes the OI totals but performs no matching EMA checkpoint.

```solidity
MarketUtils.applyDeltaToOpenInterestInTokens(
    params.contracts.dataStore,
    params.contracts.eventEmitter,
    params.position.marketIndex(),
    params.position.isLong(),
    sizeDeltaInTokens
);
```

`saveValue` advances `lastEmaValue`, records its argument in `lastValue`, and begins a new time interval. If one-sided exposure is present when a reducing order begins, that order records the pre-reduction imbalance; removing the exposure does not replace the observation. A later execution folds the intervening time into the EMA using the obsolete value, then refreshes it with current OI. An intervening execution therefore ends further distortion, but it cannot undo funding already accrued for that interval.

Any account can submit an order through `ExchangeRouter`, while only an `ORDER_KEEPER` can execute it and provide prices. The flaw is consequently reachable through ordinary trading and expected keeper service, although a trader cannot dictate the precise sampling schedule and must obtain favorable ordering and a sufficiently quiet interval.

`MarketUtils` derives signed funding rates and per-size indices from this EMA. Upon position settlement, positive funding in excess of negative funding is transferred from the market vault to `PositionVault`, so biased indices can credit beneficiary exposure at LP expense or misallocate funding among unrelated positions. Per-side OI ceilings, position and reserve bounds, configured funding-rate clamps, trading costs, and intervening activity limit each attempt; net profitability depends on overcoming these constraints and is not established by the observed index direction alone.

### Recommendation

Retain the pre-change funding accrual, then have the common OI-update path checkpoint the resulting skew at the same timestamp after every successful increase, decrease, liquidation, and ADL; this checkpoint should replace `lastValue` and `lastTime` without accruing a second period or changing the EMA already computed for the prior period. Cover the correction with an end-to-end order test that removes sampled temporary exposure, advances time, and asserts that funding uses the OI that remained after the removal.

**Client:**

**Zenith:**

---

## #23 — Signed funding bounds bypass the configured rate ceiling

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/23  
**严重性标签**: High Risk　**状态**: Open　**创建时间**: 2026-08-11T10:44:41Z

### Target

- [DataStore.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/data/DataStore.sol)
- [Config.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/config/Config.sol)
- [ConfigUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/config/ConfigUtils.sol)
- [FX100Keys.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/constants/FX100Keys.sol)
- [MarketUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/market/MarketUtils.sol)
- [ExecuteOrderUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/order/ExecuteOrderUtils.sol)
- [IncreasePositionUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/position/IncreasePositionUtils.sol)
- [configureMarket.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/scripts/configureMarket.ts)

### Severity

- Impact: High
- Likelihood: Medium

### Description

A caller holding `LIMITED_CONFIG_KEEPER` may use `Config.setInt` for both `MIN_FUNDING_FACTOR_PER_SECOND` and `MAX_FUNDING_FACTOR_PER_SECOND`; the deployment also authorizes `Config` as a `DataStore` controller. After checking only that the caller's role permits the key, `setInt` commits the supplied `int256` without a magnitude limit or a `min <= max` condition.

```solidity
_validateKey(baseKey);

bytes32 fullKey = FX100Keys.getFullKey(baseKey, data);

store.setInt(fullKey, value);
```

The funding checks in `ConfigUtils.validateRange` are ineffective for this entry point. They receive a `uint256`, obtain the companion endpoint through `getUint`, and run solely from `setUint`; meanwhile, `DataStore` maintains separate `uintValues` and `intValues` mappings, and `MarketUtils` retrieves the live endpoints with `getInt`. A value accepted on the signed path thus never encounters the cap or pairwise ordering checks.

By assigning the two endpoints the same above-cap or extreme negative value, one limited keeper makes `Calc.clamp` select that value for the market's long and short rates. Ordinary order handling updates funding before processing a position action, whose fee settlement charges positive accrual to trader collateral or finances negative accrual from the LP vault. Non-overflowing inputs can therefore cause broad losses across the market, while larger values can revert checked funding arithmetic and halt order or liquidation execution.

### Recommendation

Store all four funding parameters only in `intValues`, reject those base keys in `setUint`, and make `setInt` call a signed validator that reads the paired endpoint with `getInt` and enforces `-MAX_ALLOWED_MAX_FUNDING_FACTOR_PER_SECOND <= min <= max <= MAX_ALLOWED_MAX_FUNDING_FACTOR_PER_SECOND`. Change `ConfigSyncer` to decode funding values as signed and invoke `setInt`, and add role-path coverage for above-cap, below-cap, and inverted endpoints plus valid negative minima and deployment defaults.

**Client:**

**Zenith:**

---

## #24 — Authorized subaccounts can divert position collateral through self-selected UI fees

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/24  
**严重性标签**: High Risk　**状态**: Open　**创建时间**: 2026-08-11T10:44:45Z

### Target

- [SubaccountUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/subaccount/SubaccountUtils.sol)
- [SubaccountRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/SubaccountRouter.sol)
- [SubaccountRelayRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/relay/SubaccountRelayRouter.sol)
- [OrderHandler.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/exchange/OrderHandler.sol)
- [OrderUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/order/OrderUtils.sol)
- [PositionPricingUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/pricing/PositionPricingUtils.sol)
- [IncreasePositionUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/position/IncreasePositionUtils.sol)
- [DecreasePositionCollateralUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/position/DecreasePositionCollateralUtils.sol)

### Severity

- Impact: High
- Likelihood: Medium

### Description

Routine execution calculates a position charge from `sizeDeltaUsd` and the factor registered for the order's `uiFeeReceiver`. Increase settlement includes that charge among costs removed from collateral, while a decrease credits it after the position-cost payment succeeds. The resulting token entitlement is indexed by `uiFeeReceiver` and may be withdrawn by that address.

`OrderUtils.createOrder` persists `params.addresses.uiFeeReceiver` without changing it. The common subaccount guard contains ownership rules for two neighboring recipients but no corresponding rule for this fee destination:

```solidity
if (params.addresses.receiver != account) {
    revert FxErrors.InvalidReceiverForSubaccountOrder(params.addresses.receiver, account);
}

if (params.addresses.cancellationReceiver != address(0) && params.addresses.cancellationReceiver != account) {
    revert FxErrors.InvalidCancellationReceiverForSubaccountOrder(params.addresses.cancellationReceiver, account);
}
```

Both subaccount routers use this guard before producing an order owned by `account`. On the direct path, `msg.sender` must occupy an active slot, pass the feature and integration checks, and spend an order permission that remains within its expiry and count; increase creation also needs the account's Router allowance. Consequently, an unrelated outsider cannot supply the harmful account context.

Once delegated, a hostile actor can name itself as `uiFeeReceiver`, register its own factor, and let an ordinary keeper process either an increase or decrease. This moves the principal's collateral into a claimable balance for the delegate without price manipulation, privileged access, or keeper cooperation. A positive `MAX_UI_FEE_FACTOR` and an enabled claim route are needed for payout. The cap limits a charge to 5% of size-delta notional, but leverage and multiple actions permitted by the principal can make aggregate loss a substantial portion of deposited collateral.

### Recommendation

Extend `validateCreateOrderParams` to reject every `uiFeeReceiver` other than `address(0)` or `account` through a dedicated error; the shared check will cover direct and relay creation. Add regression cases for both routes that reject a third-party receiver and accept zero or the principal, leaving callback execution-fee policy unchanged.

**Client:**

**Zenith:**

---

## #25 — Zero opening collateral factor lets traders bypass the market’s leverage floor

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/25  
**严重性标签**: High Risk　**状态**: Open　**创建时间**: 2026-08-11T10:44:49Z

### Target

- [Config.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/config/Config.sol)
- [ConfigUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/config/ConfigUtils.sol)
- [PositionUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/position/PositionUtils.sol)
- [MarketUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/market/MarketUtils.sol)
- [IncreasePositionUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/position/IncreasePositionUtils.sol)
- [IncreaseOrderUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/order/IncreaseOrderUtils.sol)
- [LiquidationUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/liquidation/LiquidationUtils.sol)
- [defaults.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/scripts/config/defaults.ts)

### Severity

- Impact: High
- Likelihood: Medium

### Description

`Config.setUint` accepts market-specific changes from the semi-trusted `CONFIG_KEEPER`, and `_validateKey` makes `MIN_COLLATERAL_FACTOR` available to that full role rather than the limited keeper. `ConfigUtils.validateRange` then handles the opening factor in a fee-factor branch that rejects amounts above 5% but performs neither a lower-bound check nor a comparison with the liquidation factor. Consequently, the keeper can store zero despite repository defaults choosing a 1% opening margin above the 0.5% and 0.4% liquidation thresholds.

A regular account can thereafter submit a `MarketIncrease` order through `ExchangeRouter.createOrder`. During execution, `willPositionCollateralBeSufficient` selects the greater of the market value and an open-interest-derived value. At the checked repository state, the multiplier used for the latter has no initialization, so its `DataStore` value and the derived requirement are zero. `validatePosition` independently multiplies position size by the same zero market factor. Thus, the collateral-specific gates retain only positive residual margin and the separate absolute `MIN_COLLATERAL_USD` test; the position and open-interest limits still apply.

For a new position, `IncreaseOrderUtils` records `graceEnd`, while `LiquidationUtils.createLiquidationOrder` refuses liquidation until that timestamp. A trader may therefore take exposure backed by far less than the intended 1% margin. Fees or unfavorable price movement can consume the thin collateral before liquidation, shifting a resulting deficit to shared LP assets; hard position and open-interest caps constrain maximum exposure but do not restore the missing margin.

### Recommendation

Give `MIN_COLLATERAL_FACTOR` its own validation branch: require the market-scoped value to meet the protocol-approved nonzero minimum and remain strictly greater than `MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION`. When changing the liquidation factor, enforce the reciprocal relation against the current opening factor so neither update order can violate the invariant.

**Client:**

**Zenith:**

---

## #26 — Unfunded subsidized-order fees drain the account's auto-top-up

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/26  
**严重性标签**: High Risk　**状态**: Open　**创建时间**: 2026-08-11T10:44:52Z

### Target

- [SubaccountRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/SubaccountRouter.sol)
- [SubaccountUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/subaccount/SubaccountUtils.sol)
- [OrderUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/order/OrderUtils.sol)
- [GasUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/gas/GasUtils.sol)
- [Router.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/Router.sol)
- [Fx100Role.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/ignition/modules/Fx100Role.ts)
- [configureMarket.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/scripts/configureMarket.ts)
- [BaseRelayRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/relay/BaseRelayRouter.sol)

### Severity

- Impact: High
- Likelihood: Medium

### Description

On a qualifying subsidized order, `OrderUtils.createOrder` writes an execution fee of zero and returns all WNT observed by `OrderVault`; the declared fee bypasses the funding validation reserved for non-subsidized creation. After the handler persists that result, `SubaccountRouter.createOrder` nevertheless supplies the unchanged `params.numbers.executionFee` to `_autoTopUpSubaccount`. The relay order route, by contrast, clears this field when subsidy applies.

Auto-top-up adds the unverified field to measured gas and then takes the lesser result and the account's configured ceiling. By declaring at least that ceiling without depositing fee WNT, a delegated caller makes the ceiling the payout; `Router.pluginTransfer` pulls this WNT from the account, and the router pays its value to the subaccount although the stored order carries no fee. Production roles authorize both downstream calls, and market configuration permits finite subsidy thresholds.

Exploitation requires the caller to occupy an active subaccount slot with an unexpired approval and unused order-action count, while the account must have enabled a positive top-up and retained enough WNT balance and Router allowance. A successful call can take the full per-action setting; repeated loss can reach that amount times the unused action quota, further bounded by WNT balance and allowance. Receiver validation keeps order collateral and proceeds assigned to the account, so the direct loss is confined to the unsupported reimbursement.

### Recommendation

Use the key returned by `orderHandler.createOrder` to load the persisted `Order`, and pass its `executionFee()` to `_autoTopUpSubaccount`; this makes reimbursement follow the fee retained after subsidy and capping rather than the request field. Add a regression case confirming that a subsidized delegated order with an exaggerated declaration receives only measured gas, bounded by the configured top-up ceiling.

**Client:**

**Zenith:**

---

## #27 — Relay approvals retain stale bindings and bypass disabled integration identities

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/27  
**严重性标签**: High Risk　**状态**: Open　**创建时间**: 2026-08-11T10:44:56Z

### Target

- [SubaccountRelayRouter.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/relay/SubaccountRelayRouter.sol)
- [SubaccountUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/subaccount/SubaccountUtils.sol)
- [RelayUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/router/relay/RelayUtils.sol)

### Severity

- Impact: High
- Likelihood: Medium

### Description

The EIP-712 digest authenticates `SubaccountApproval.integrationId`, but applying the approval changes only its action allowance, expiry, and slot membership. Although `SubaccountUtils` already exposes `setSubaccountIntegrationId`, `handleSubaccountApproval` never invokes that writer, leaving the account/subaccount pair associated with its earlier value instead of the identity selected by the account.

The shared order gate compounds this missing state transition: `_handleSubaccountOrderAction` calls `validateIntegrationId` before `_handleSubaccountApproval`. The validation consequently reads the old DataStore binding. When that stored or default ID is enabled while the newly signed ID is disabled, the check succeeds, the delegation is installed, and the new identity is still absent from storage.

All four relay order routes—`createOrder`, `updateOrder`, `cancelOrder`, and `batch`—use this sequence. Acceptance still depends on an approval signed by the account and a concrete relay call signed by the subaccount; submission by a relayer supplies neither authority. After onboarding, calls without another approval continue to pass against the unchanged ID until the independent slot, count, expiry, or module-wide feature controls stop them. Integration-level disablement therefore cannot revoke the affected subaccount’s ability to create, amend, cancel, or batch orders, exposing the account’s positions and collateral to unwanted order activity.

### Recommendation

Make `handleSubaccountApproval` persist every authenticated `integrationId`, including zero so an account can clear an earlier association. Reorder `_handleSubaccountOrderAction` to apply an optional approval before validating the resulting stored identity and consuming the action, and cover assignment, replacement, clearing, and rejection of a disabled newly signed ID in focused relay tests.

**Client:**

**Zenith:**

---

## #28 — Fee keeper can route treasury tokens to unauthorized recipients

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/28  
**严重性标签**: High Risk　**状态**: Open　**创建时间**: 2026-08-11T10:44:59Z

### Target

- [ProtocolTreasury.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/fee-distribute/ProtocolTreasury.sol)
- [Fx100Fee.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/ignition/modules/Fx100Fee.ts)
- [RevenuePool.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/fee-distribute/RevenuePool.sol)

### Severity

- Impact: High
- Likelihood: Medium

### Description

Deployment does not confine the keeper to the allowlisted payout path. `Fx100Fee` assigns the configured `feeKeeper` both `MULTICALL_ROLE` and `BATCH_TRANSFER_ROLE` on the protocol and insurance treasury proxies, yet gives `TOKEN_RECEIVER_ROLE` only to `lpVault` and `multisig`. `batchTransfer` consults that destination role, whereas `multicall` performs each role-holder-selected `target.call(data)` after checking only the caller's multicall role.

When the selected target is a standard ERC-20 held by a treasury, the external call reaches `transfer` with the treasury proxy as `msg.sender`, so the token deducts that proxy's balance. A malicious or compromised configured keeper can choose an unrestricted recipient and the complete held amount, draining either treasury in one transaction even though the destination is not approved. The module configures `RevenuePool` to send USDC shares into both treasury contracts; accounts without `MULTICALL_ROLE` cannot use this path, and the sample's zero keeper resolves to `bootstrapAdmin`, narrowing likelihood without protecting deployments that select a separate operational keeper.

### Recommendation

Replace `multicall` with a selector-aware dispatcher that rejects every unrecognized target/action combination, applies `TOKEN_RECEIVER_ROLE` to decoded transfer recipients, caps approval spenders and values, and sends trades through the existing permissioned-router and minimum-output checks. Until that policy is deployed, remove `MULTICALL_ROLE` from operational keeper addresses.

**Client:**

**Zenith:**

---

## #29 — Expired fallback prices can latch ADL before forced position reductions

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/29  
**严重性标签**: High Risk　**状态**: Open　**创建时间**: 2026-08-11T10:45:03Z

### Target

- [AdlHandler.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/exchange/AdlHandler.sol)
- [AdlUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/adl/AdlUtils.sol)
- [MarketUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/market/MarketUtils.sol)
- [Oracle.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/oracle/Oracle.sol)
- [DecreasePositionUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/position/DecreasePositionUtils.sol)
- [Fx100Role.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/ignition/modules/Fx100Role.ts)
- [Fx100Oracle.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/ignition/modules/Fx100Oracle.ts)
- [configureOracle.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/scripts/configureOracle.ts)

### Severity

- Impact: High
- Likelihood: Medium

### Description

The deployment enables a Chainlink Data Stream provider and assigns `ADL_KEEPER` to an operations address. For a token routed through that provider without a direct Chainlink secondary feed, the global risk computation must instead read `latestRecordedPrices`. Each stored value was checked when accepted, but it can remain in storage after `MAX_RECORDED_PRICE_AGE` has elapsed.

During a disabled-to-enabled transition, `AdlUtils` selects `MAX_PNL_FACTOR_FOR_ADL` and marks the ratio lookup as an ADL-start query. `Oracle._getSecondaryPrice` applies the expiry rejection only to non-start queries, leaving this transition free to use an over-age snapshot. A snapshot that crosses the upper boundary therefore sets the ADL flag and refreshes `latestAdlAt` even when contemporaneous market data would not qualify.

`executeAdl` installs fresh provider-validated prices, yet an already-latched flag changes the applicable boundary to `MIN_PNL_FACTOR_AFTER_ADL`. If the live ratio is between the two limits and the chosen side has positive PnL, the keeper can submit a genuine market decrease that partially or entirely reduces the user's stored position and open interest, provided the action lowers the ratio. This realizes trading costs and spread, strips the user of exposure and possible future gains without consent, and may be repeated against other profitable positions while the ratio remains above the continuation floor.

### Recommendation

Make recorded-price expiry invariant across both modes: `_getSecondaryPrice` should reject `latestRecordedPrices[token]` once `timestamp + MAX_RECORDED_PRICE_AGE` precedes `block.timestamp`, irrespective of `isADLStart`. Remove the mode parameter from the oracle interface and callers if it has no remaining purpose, then add native coverage proving that recent records can activate ADL, expired records cannot, and the continuation band cannot create a new ADL state.

**Client:**

**Zenith:**

---

## #30 — Funding fee splitting diverts 60% of realized payer cash flow from LPs

**GitHub 链接**: https://github.com/zenith-security/2026-08-f-x-protocol/issues/30  
**严重性标签**: Critical Risk　**状态**: Open　**创建时间**: 2026-08-11T10:45:07Z

### Target

- [MarketUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/market/MarketUtils.sol)
- [IncreasePositionUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/position/IncreasePositionUtils.sol)
- [FeeUtils.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/fee/FeeUtils.sol)
- [FeeHandler.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/fee/FeeHandler.sol)
- [Fx100Fee.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/ignition/modules/Fx100Fee.ts)
- [RevenuePool.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/fee-distribute/RevenuePool.sol)
- [VaultBase.sol](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/src/vault/VaultBase.sol)
- [defaults.ts](https://github.com/AladdinDAO/fx100-contracts/blob/13880f2416918f4fed3fea86d7f1023084a3ce0d/scripts/config/defaults.ts)

### Severity

- Impact: High
- Likelihood: High

### Description

Production deployment places `FUNDING_FEE_TYPE` in the same `RevenuePool` registry as ordinary protocol fees. `Fx100Fee` supplies `base.lpVault` as the pool’s `ecosystem` recipient but configures 40% for the protocol treasury and 20% for the locker destination (the insurance treasury), leaving only the 40% residual for LPVault.

These checked-in ratios use `RevenuePool`’s `1e9` denominator:

```typescript
const STAKER_RATIO = 0;
const TREASURY_RATIO = 400_000_000;
const LOCKER_RATIO = 200_000_000;
```

The mismatch begins earlier in `MarketUtils.settleFundingFees`. If realized positive funding exceeds the negative amount, `market.vault` transfers the entire net difference into PositionVault. In the payer direction, however, the function performs no reciprocal transfer: it increments a generic `FUNDING_FEE_TYPE` claim backed by tokens already held in PositionVault. `FeeHandler` can claim that balance and forward it to the fixed RevenuePool receiver, where the deployed ratios divide it.

This treatment conflicts with the funding calculation’s `positionPaysLp` quantity and with the function’s own LP-settlement contract. For a realized net payer amount `F`, LPVault receives `0.4F` only after distribution while `0.6F` goes to the treasury and insurance/locker destinations; for an equal net receiver amount, LPVault supplies the full `F`.

`IncreasePositionUtils.processCollateral` reaches the branch as part of a normal position adjustment: it obtains the live funding fees, invokes settlement, and applies the negative charge to trader collateral. The decrease and liquidation paths follow the same settlement function with the amount actually collected. Consequently, an ordinary public order followed by normal keeper execution is enough; an attacker does not need a privileged role or control of the receiver.

`VaultBase.totalAssets` counts the LP vault’s token balance and strategy assets, so the missing 60% is absent from LP share backing and NAV. The configured markets have a nonzero 10.95% annual funding floor and maximum annualized factors of about 111.39% for ETH and 96.52% for WBTC; repeated routine realizations can therefore make the imbalance financially material, reduce liquidity, and impair backing over time. The production split proves cumulative erosion, not that a single settlement necessarily empties the vault.

### Recommendation

Replace the net-payer bookkeeping branch in `MarketUtils.settleFundingFees` with a PositionVault-to-`market.vault` transfer of `negativeFundingFeeAmount - positiveFundingFeeAmount`, retaining the existing opposite-direction payment, and exclude `FUNDING_FEE_TYPE` from subsequent generic revenue splits. Send every funding balance already claimable in PositionVault or available in FeeHandler entirely to the associated LPVault, then assert in settlement coverage that payer funding increases the LP balance by the exact net amount without creating a generic fee claim.

**Client:**

**Zenith:**

---

## 三、核对清单（我方内部核对状态，全部完成）

| # | 我方核对状态 | 对应 BUGS.md 条目 | 专题测试文件 |
|---|---|---|---|
| #1 | ✅ CONFIRMED | [R8-B01](../bugs/BUGS.md#r8-b01) | ZenithB01_ConfigSyncerFundingMismatch.t.sol |
| #2 | ✅ CONFIRMED | [R8-B02](../bugs/BUGS.md#r8-b02) | ZenithB02_SubaccountRelayFeeUncapped.t.sol |
| #3 | ✅ CONFIRMED（继承自GMX既有设计） | [R8-B03](../bugs/BUGS.md#r8-b03) | 待补 |
| #4 | ✅ CONFIRMED | [R8-B04](../bugs/BUGS.md#r8-b04) | 待补 |
| #5 | ✅ CONFIRMED（设计决策待定） | [R8-B05](../bugs/BUGS.md#r8-b05) | 待补 |
| #6 | ✅ CONFIRMED（比原文更严重） | [R8-B06](../bugs/BUGS.md#r8-b06) | 待补 |
| #7 | ✅ CONFIRMED | [R8-B07](../bugs/BUGS.md#r8-b07) | 待补 |
| #8 | ✅ CONFIRMED | [R8-B08](../bugs/BUGS.md#r8-b08) | 待补 |
| #9 | ✅ CONFIRMED（当前休眠） | [R8-B09](../bugs/BUGS.md#r8-b09) | 待补 |
| #10 | ✅ CONFIRMED | [R8-B10](../bugs/BUGS.md#r8-b10) | 待补 |
| #11 | ✅ CONFIRMED | [R8-B11](../bugs/BUGS.md#r8-b11) | 待补 |
| #12 | ✅ CONFIRMED（当前休眠） | [R8-B12](../bugs/BUGS.md#r8-b12) | 待补 |
| #13 | ✅ CONFIRMED（gas骚扰非资金损失） | [R8-B13](../bugs/BUGS.md#r8-b13) | 待补 |
| #14 | ✅ CONFIRMED | [R8-B14](../bugs/BUGS.md#r8-b14) | 待补 |
| #15 | ✅ CONFIRMED | [R8-B15](../bugs/BUGS.md#r8-b15) | 待补 |
| #16 | ✅ CONFIRMED | [R8-B16](../bugs/BUGS.md#r8-b16) | ZenithB16B23_SignedFundingBypassesRange.t.sol |
| #17 | ✅ CONFIRMED（设计决策待定） | [R8-B17](../bugs/BUGS.md#r8-b17) | 待补 |
| #18 | ✅ CONFIRMED（范围比原文更宽） | [R8-B18](../bugs/BUGS.md#r8-b18) | 待补 |
| #19 | ✅ CONFIRMED | [R8-B19](../bugs/BUGS.md#r8-b19) | ZenithB19B25_CollateralFactorGaps.t.sol |
| #20 | ✅ CONFIRMED（当前休眠，24市场均配置正确） | [R8-B20](../bugs/BUGS.md#r8-b20) | ZenithB20_ZeroFactorUncappedPnl.t.sol |
| #21 | ✅ CONFIRMED（非#2重复） | [R8-B21](../bugs/BUGS.md#r8-b21) | 待补 |
| #22 | ✅ CONFIRMED | [R8-B22](../bugs/BUGS.md#r8-b22) | 待补 |
| #23 | ✅ CONFIRMED（比原文范围更广） | [R8-B23](../bugs/BUGS.md#r8-b23) | ZenithB16B23_SignedFundingBypassesRange.t.sol |
| #24 | ⚠️ PARTIALLY_CONFIRMED（当前休眠） | [R8-B24](../bugs/BUGS.md#r8-b24) | 待补 |
| #25 | ✅ CONFIRMED | [R8-B25](../bugs/BUGS.md#r8-b25) | ZenithB19B25_CollateralFactorGaps.t.sol |
| #26 | ✅ CONFIRMED（非休眠，豁免普遍开启） | [R8-B26](../bugs/BUGS.md#r8-b26) | 待补 |
| #27 | ✅ CONFIRMED | [R8-B27](../bugs/BUGS.md#r8-b27) | 待补 |
| #28 | ✅ CONFIRMED | [R8-B28](../bugs/BUGS.md#r8-b28) | 待补 |
| #29 | ✅ CONFIRMED（比原文更严重） | [R8-B29](../bugs/BUGS.md#r8-b29) | 待补 |
| #30 | ✅ CONFIRMED（Critical，未下调） | [R8-B30](../bugs/BUGS.md#r8-b30) | ZenithB30_FundingFeeSplitDivertsLpShare.t.sol |

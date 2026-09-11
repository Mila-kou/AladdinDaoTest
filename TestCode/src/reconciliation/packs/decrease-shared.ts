/**
 * 减仓 / 平仓 / 清算核对包共用的取数、来源引用、行构造与公式重放。
 *
 * 公式口径唯一依据：TestCase/E2E/ContractCodeSummary/v0.3.2/FX100-核心字段计算公式.md
 * （每条 check 以 formulaBasis.section 指向该文档章节），并回 v0.3.2 合约源码复核：
 *   - src/position/PositionUtils.sol::getDecreaseOrderSize（§3.2）/ ::getExecutionPriceForDecrease（§4.6）
 *     / ::_getPositionPnlUsd（§6）/ ::isPositionLiquidatable（§11）
 *   - src/position/DecreasePositionUtils.sol::decreasePosition（§5.2 / §5.5）
 *   - src/position/DecreasePositionCollateralUtils.sol::processCollateral / payForCost / handleEarlyReturn（§5.4 / §9.4 / §9.5）
 *   - src/pricing/PositionPricingUtils.sol::getPositionFees / getLiquidationFees（§8 / §9.1）
 *   - src/market/MarketUtils.sol::settleFundingFees（§10.7）
 *
 * 证据等级纪律：任何一项输入来自执行事件（executionPrice / dynamicSpread / basePnlUsd / 费用与 funding 金额）
 * 即为 EVENT_ANCHORED；全部输入来自 execBlock−1 状态、意图或 DataStore 参数才可 FULL_RECOMPUTE；
 * 缺输入一律 NOT_VERIFIED，不以 0 或 Actual 顶替。
 */
import type { CheckPackInputRequirement } from '../engine/check-engine.js';
import type { CheckRecord, SourceRef } from '../schema/check-record.js';
import type { ActionEvidence, EvidenceEnvelope, TransactionRef } from '../../evidence/evidence-v3.js';
import { resolveExecutionTransaction } from '../../evidence/execution-transaction.js';
import { FLOAT_PRECISION, WEI_PRECISION, calculateExecutionPrice, calculatePositionFee, ceilDiv } from '../formulas.js';
import { contractLedgerFieldId } from '../ledger-field-id.js';

export type JsonRecord = Record<string, unknown>;

/** 相对 TestCode 工程根；与 src/reporting/execution-evidence.ts::CONTRACT_FORMULA_SOURCE 同一写法。 */
export const CONTRACT_FORMULA_DOC = '../TestCase/E2E/ContractCodeSummary/v0.3.2/FX100-核心字段计算公式.md';
export const CONTRACT_SOURCE_ROOT = '../Github/fx100-contracts@release-v0.3.2/src';
export const FORMULA_VERSION = 'v0.3.2';

/** src/order/Order.sol::OrderType 枚举序号（顺序不可改）。 */
export const ORDER_TYPE = {
  MarketIncrease: 0n,
  LimitIncrease: 1n,
  MarketDecrease: 2n,
  LimitDecrease: 3n,
  StopLossDecrease: 4n,
  Liquidation: 5n,
  StopIncrease: 6n,
} as const;

export const LEDGER_FIELDS = ['traderUsdc', 'orderVaultUsdc', 'posVaultUsdc', 'lpVaultAssets', 'feeReceiverUsdc'] as const;

// ── formulaBasis ─────────────────────────────────────────────────────────────

export interface FormulaBasis {
  readonly section: string;
  readonly title: string;
  readonly sourcePath: string;
}

/**
 * CheckRecord 带公式依据。formulaBasis / ledgerFieldId 已登记进 src/reconciliation/schema/check-record.ts
 * （引擎 parse 后保留）；行构造仍把「依据 §x.y 标题」写进 note，保证扁平摘要与终端表格可见。
 * ledgerFieldId 由 basis.section 经 ../ledger-field-id.ts 派生（与 seed 的 c-<章>-<节> 同一规则），
 * 供 config/reconciliation-fields.json 台账精确回链。
 */
export type BasisCheckRecord = CheckRecord & { readonly formulaBasis: FormulaBasis };

export function basis(section: string, title: string): FormulaBasis {
  return { section, title, sourcePath: CONTRACT_FORMULA_DOC };
}

// ── 基础取值 ──────────────────────────────────────────────────────────────────

export function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

export function bigint(value: unknown): bigint {
  if (value === undefined || value === null || value === '') throw new Error('必需数值输入缺失');
  return BigInt(String(value));
}

export function optionalBigint(value: unknown): bigint | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  try {
    return BigInt(String(value));
  } catch {
    return undefined;
  }
}

export function optionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

export function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

export function max(left: bigint, right: bigint): bigint {
  return left > right ? left : right;
}

export function min(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

/** Precision.mulDiv(int256 value, uint256 numerator, uint256 denominator, bool roundUpMagnitude)：按 |value| 取整后补符号。 */
export function mulDivSigned(value: bigint, numerator: bigint, denominator: bigint, roundUpMagnitude: boolean): bigint {
  if (denominator === 0n) throw new Error('mulDiv 分母不能为 0');
  const magnitude = abs(value) * numerator;
  const result = roundUpMagnitude ? ceilDiv(magnitude, denominator) : magnitude / denominator;
  return value > 0n ? result : -result;
}

/** Precision.applyFactor(uint256, uint256) = floor(value × factor / 1e30)。 */
export function applyFactor(value: bigint, factor: bigint): bigint {
  return value * factor / FLOAT_PRECISION;
}

// ── Action 视图 ───────────────────────────────────────────────────────────────

export interface SnapshotView {
  readonly kind: string;
  readonly blockNumber: number;
  readonly values: JsonRecord;
}

export interface EventArgsView {
  readonly name: string;
  readonly index: number;
  readonly uint: JsonRecord;
  readonly int: JsonRecord;
  readonly bool: JsonRecord;
  readonly bytes32: JsonRecord;
  readonly string: JsonRecord;
  readonly address: JsonRecord;
}

export interface DecreaseActionView {
  readonly id: string;
  readonly type: string;
  readonly sequence: number;
  readonly purpose: ActionEvidence['purpose'];
  /** 小写化的 outcome：submitted / executed / cancelled / frozen / observed */
  readonly outcome: string;
  readonly input: JsonRecord;
  readonly before: SnapshotView;
  readonly after: SnapshotView;
  readonly events: readonly EventArgsView[];
  readonly transaction?: TransactionRef;
  /** parameters[name=trade-parameters].value（缺失为 {}）。 */
  readonly parameters: JsonRecord;
  readonly parameterBlockNumber?: number;
}

function snapshotView(snapshot: ActionEvidence['snapshots'][number]): SnapshotView {
  return { kind: snapshot.kind, blockNumber: Number(snapshot.blockNumber), values: record(snapshot.values) };
}

export function viewAction(evidence: EvidenceEnvelope, found: ActionEvidence): DecreaseActionView {
  const beforeSnapshot = found.snapshots.find((item) => item.kind === 'execution-before') ?? found.snapshots[0];
  const afterSnapshot = found.snapshots.find((item) => item.kind === 'execution-after') ?? found.snapshots[1];
  if (!beforeSnapshot || !afterSnapshot) throw new Error(`${evidence.caseId}/${found.actionId} 缺少 Before/After 快照`);
  const resolution = resolveExecutionTransaction(found);
  const transaction = resolution.status === 'RESOLVED' ? resolution.transaction : undefined;
  const parameterRef = found.parameters.find((item) => item.name === 'trade-parameters');
  const counters = new Map<string, number>();
  const events: EventArgsView[] = found.events.map((event) => {
    const args = record(event.args);
    const index = counters.get(event.name) ?? 0;
    counters.set(event.name, index + 1);
    return {
      name: event.name,
      index,
      uint: record(args.uint),
      int: record(args.int),
      bool: record(args.bool),
      bytes32: record(args.bytes32),
      string: record(args.string),
      address: record(args.address),
    };
  });
  return {
    id: found.actionId,
    type: found.type,
    sequence: found.sequence,
    purpose: found.purpose,
    outcome: found.outcome.toLowerCase(),
    input: record(found.input),
    before: snapshotView(beforeSnapshot),
    after: snapshotView(afterSnapshot),
    events,
    ...(transaction ? { transaction } : {}),
    parameters: record(parameterRef?.value),
    ...(parameterRef?.blockNumber !== undefined ? { parameterBlockNumber: Number(parameterRef.blockNumber) } : {}),
  };
}

export function findAction(
  evidence: EvidenceEnvelope,
  predicate: (action: ActionEvidence) => boolean,
  pick: 'first' | 'last' = 'last',
): ActionEvidence | undefined {
  const ordered = [...evidence.actions].sort((left, right) => left.sequence - right.sequence);
  const matches = ordered.filter(predicate);
  return pick === 'first' ? matches[0] : matches[matches.length - 1];
}

export function eventList(view: DecreaseActionView, name: string): EventArgsView[] {
  return view.events.filter((event) => event.name === name);
}

export function eventArgs(view: DecreaseActionView, name: string, index = 0): EventArgsView | undefined {
  return eventList(view, name)[index];
}

/** 费用事件：常规路径 PositionFeesCollected（旧 adapter 曾以 feesCollected 键承载同名事件）。 */
export function feesCollectedEvent(view: DecreaseActionView): EventArgsView | undefined {
  return eventArgs(view, 'PositionFeesCollected') ?? eventArgs(view, 'feesCollected');
}

export function parameterEntry(view: DecreaseActionView, group: 'market' | 'global', label: string): bigint | undefined {
  const entry = record(record(view.parameters[group])[label]);
  return optionalBigint(entry.value);
}

export function ledgerDelta(view: DecreaseActionView, field: string): bigint {
  return bigint(view.after.values[field]) - bigint(view.before.values[field]);
}

// ── SourceRef 构造 ───────────────────────────────────────────────────────────

export function stateSource(view: DecreaseActionView, side: 'before' | 'after', path: string): SourceRef {
  const snapshot = side === 'before' ? view.before : view.after;
  return {
    layer: 'chain-state',
    path: `actions[actionId=${view.id}].snapshots[kind=${snapshot.kind}].values.${path}`,
    blockNumber: snapshot.blockNumber,
  };
}

export function eventSource(view: DecreaseActionView, eventName: string, path: string, index = 0): SourceRef {
  const selector = index === 0 ? `name=${eventName}` : `name=${eventName},index=${index}`;
  return {
    layer: 'chain-event',
    path: `actions[actionId=${view.id}].events[${selector}].args.${path}`,
    ...(view.transaction ? { blockNumber: Number(view.transaction.blockNumber), txHash: view.transaction.txHash } : {}),
  };
}

export function intentSource(view: DecreaseActionView, path: string): SourceRef {
  return { layer: 'intent', path: `actions[actionId=${view.id}].input.${path}` };
}

export function parameterSource(view: DecreaseActionView, group: 'market' | 'global', label: string): SourceRef {
  return {
    layer: 'parameter',
    path: `actions[actionId=${view.id}].parameters[name=trade-parameters].value.${group}.${label}.value`,
    ...(view.parameterBlockNumber !== undefined ? { blockNumber: view.parameterBlockNumber } : {}),
  };
}

export function keeperSource(view: DecreaseActionView): SourceRef {
  return {
    layer: 'keeper',
    path: view.transaction
      ? `actions[actionId=${view.id}].transactions[txHash=${view.transaction.txHash}]`
      : `actions[actionId=${view.id}].transactions`,
    ...(view.transaction ? { blockNumber: Number(view.transaction.blockNumber), txHash: view.transaction.txHash } : {}),
  };
}

export function derivedSource(path: string): SourceRef {
  return { layer: 'derived', path };
}

export function formulaInput(name: string, value: unknown, source: SourceRef) {
  return { name, value: String(value), source };
}

export function requiredInput(input: {
  readonly view: DecreaseActionView;
  readonly name: string;
  readonly subject: CheckRecord['subject'];
  readonly source: SourceRef;
  readonly value: unknown;
}): CheckPackInputRequirement {
  return {
    name: `${input.view.id}.${input.name}`,
    actionId: input.view.id,
    purpose: input.view.purpose,
    subject: input.subject,
    source: input.source,
    value: input.value,
  };
}

// ── 行构造 ────────────────────────────────────────────────────────────────────

export interface TransitionFields {
  readonly before: { raw: string };
  readonly after: { raw: string };
  readonly actualDelta: { raw: string };
  readonly expectedDelta: { raw: string };
  readonly expectedAfter: { raw: string };
}

export function transition(before: unknown, after: unknown, expectedDelta: bigint): TransitionFields {
  const beforeValue = bigint(before);
  const afterValue = bigint(after);
  return {
    before: { raw: beforeValue.toString() },
    after: { raw: afterValue.toString() },
    actualDelta: { raw: (afterValue - beforeValue).toString() },
    expectedDelta: { raw: expectedDelta.toString() },
    expectedAfter: { raw: (beforeValue + expectedDelta).toString() },
  };
}

export interface RowInput {
  readonly id: string;
  readonly packId: string;
  readonly view: Pick<DecreaseActionView, 'id' | 'purpose'>;
  readonly subject: CheckRecord['subject'];
  readonly comparison: CheckRecord['comparison'];
  readonly actual: unknown;
  readonly expected: unknown;
  readonly sources: readonly SourceRef[];
  readonly verification: CheckRecord['verification'];
  readonly basis: FormulaBasis;
  readonly severity?: CheckRecord['severity'];
  readonly formula?: CheckRecord['formula'];
  readonly note?: string;
  readonly tolerance?: string;
  readonly transition?: TransitionFields;
  /** 缺省按 String(actual) === String(expected) 判 PASS/FAIL；显式传入用于布尔组合判定或 NOT_APPLICABLE。 */
  readonly verdict?: CheckRecord['verdict'];
  readonly display?: { readonly actual?: string; readonly expected?: string };
}

export function row(input: RowInput): BasisCheckRecord {
  const derivedVerdict: CheckRecord['verdict'] = input.verification === 'NOT_VERIFIED'
    ? 'NOT_VERIFIED'
    : (input.verdict ?? (String(input.actual) === String(input.expected) ? 'PASS' : 'FAIL'));
  const verdict: CheckRecord['verdict'] = input.verification === 'NOT_VERIFIED' && derivedVerdict === 'PASS'
    ? 'NOT_VERIFIED'
    : derivedVerdict;
  const note = `依据 ${input.basis.section} ${input.basis.title}${input.note ? `；${input.note}` : ''}`;
  const ledgerFieldId = contractLedgerFieldId(input.basis.section);
  return {
    id: input.id,
    packId: input.packId,
    actionId: input.view.id,
    purpose: input.view.purpose,
    subject: input.subject,
    comparison: input.comparison,
    actual: { raw: String(input.actual), ...(input.display?.actual ? { display: input.display.actual } : {}) },
    expected: { raw: String(input.expected), ...(input.display?.expected ? { display: input.display.expected } : {}) },
    ...(input.transition ?? {}),
    sources: [...input.sources],
    ...(input.formula ? { formula: input.formula } : {}),
    verification: input.verification,
    severity: input.severity ?? 'blocking',
    verdict,
    ...(input.tolerance !== undefined ? { tolerance: input.tolerance } : {}),
    note,
    formulaBasis: input.basis,
    ...(ledgerFieldId ? { ledgerFieldId } : {}),
  };
}

/** 缺关键输入：verification/verdict 同为 NOT_VERIFIED，expected 记录「本应如何算」。 */
export function notVerified(input: Omit<RowInput, 'verification' | 'verdict' | 'actual' | 'expected'> & {
  readonly actual?: unknown;
  readonly expectedDescription: string;
  readonly missing: string;
}): BasisCheckRecord {
  return row({
    ...input,
    actual: input.actual ?? '<unavailable>',
    expected: input.expectedDescription,
    verification: 'NOT_VERIFIED',
    note: `缺少 ${input.missing}${input.note ? `；${input.note}` : ''}`,
  });
}

export function notApplicable(input: Omit<RowInput, 'verification' | 'verdict' | 'actual' | 'expected'> & {
  readonly reason: string;
}): BasisCheckRecord {
  return row({
    ...input,
    actual: 'n/a',
    expected: 'n/a',
    verification: 'PRESENCE',
    verdict: 'NOT_APPLICABLE',
    note: input.reason,
  });
}

export function executionPresenceRow(input: {
  readonly id: string;
  readonly packId: string;
  readonly view: DecreaseActionView;
  readonly basis: FormulaBasis;
}): BasisCheckRecord {
  const role = input.view.transaction?.role;
  const status = input.view.transaction?.status;
  return row({
    id: input.id,
    packId: input.packId,
    view: input.view,
    subject: 'keeper',
    comparison: 'presence',
    actual: `${role ?? '<none>'}:${status ?? '<none>'}`,
    expected: 'keeper|service:SUCCESS',
    sources: [keeperSource(input.view)],
    verification: 'PRESENCE',
    basis: input.basis,
    verdict: (role === 'keeper' || role === 'service') && status === 'SUCCESS' ? 'PASS' : 'FAIL',
  });
}

/** USDC 五方守恒：trader + OrderVault + PositionVault + LPVault + FeeHandler 的 Δ 之和为 0。 */
export function conservationRow(input: {
  readonly id: string;
  readonly packId: string;
  readonly view: DecreaseActionView;
  readonly basis: FormulaBasis;
  readonly note?: string;
}): BasisCheckRecord {
  const deltas = Object.fromEntries(LEDGER_FIELDS.map((field) => [field, ledgerDelta(input.view, field)]));
  const sum = LEDGER_FIELDS.reduce((total, field) => total + (deltas[field] ?? 0n), 0n);
  const inputs = LEDGER_FIELDS.flatMap((field) => {
    const beforeSource = stateSource(input.view, 'before', field);
    const afterSource = stateSource(input.view, 'after', field);
    return [
      formulaInput(`${field}.before`, input.view.before.values[field], beforeSource),
      formulaInput(`${field}.after`, input.view.after.values[field], afterSource),
      formulaInput(`${field}.delta`, deltas[field], derivedSource(`${afterSource.path} - ${beforeSource.path}`)),
    ];
  });
  return row({
    id: input.id,
    packId: input.packId,
    view: input.view,
    subject: 'chain-state',
    comparison: 'invariant',
    actual: sum,
    expected: 0n,
    sources: LEDGER_FIELDS.flatMap((field) => [stateSource(input.view, 'before', field), stateSource(input.view, 'after', field)]),
    formula: {
      id: 'ledger.usdc-five-party-conservation',
      version: FORMULA_VERSION,
      expanded: LEDGER_FIELDS.map((field) => `${field}(${deltas[field]})`).join(' + '),
      inputs,
    },
    verification: 'FULL_RECOMPUTE',
    basis: input.basis,
    ...(input.note ? { note: input.note } : {}),
  });
}

// ── §3.2 减仓规模（等比销账，与执行价无关）───────────────────────────────────

export interface DecreaseOrderSizeResult {
  readonly sizeDeltaUsd: bigint;
  readonly sizeDeltaInTokens: bigint;
  readonly fullClose: boolean;
  readonly expanded: string;
}

/** PositionUtils.sol::getDecreaseOrderSize（L517-550）逐分支重放。 */
export function decreaseOrderSize(input: {
  readonly sizeInUsd: bigint;
  readonly sizeInTokens: bigint;
  readonly rawSizeDelta: bigint;
  readonly isSizeDeltaUsd: boolean;
  readonly isLong: boolean;
}): DecreaseOrderSizeResult {
  const { sizeInUsd, sizeInTokens, rawSizeDelta, isLong } = input;
  if (rawSizeDelta === 0n) {
    return { sizeDeltaUsd: 0n, sizeDeltaInTokens: 0n, fullClose: false, expanded: 'rawSizeDelta = 0 → (0, 0)（纯提取保证金路径）' };
  }
  if (input.isSizeDeltaUsd) {
    if (rawSizeDelta === sizeInUsd) {
      return {
        sizeDeltaUsd: rawSizeDelta, sizeDeltaInTokens: sizeInTokens, fullClose: true,
        expanded: `USD 模式全平恒等分支：rawSizeDelta ${rawSizeDelta} == sizeInUsd → (${rawSizeDelta}, sizeInTokens ${sizeInTokens})，无取整`,
      };
    }
    if (sizeInUsd === 0n) throw new Error('sizeInUsd 为 0，无法等比销账');
    const numerator = sizeInTokens * rawSizeDelta;
    const tokens = isLong ? ceilDiv(numerator, sizeInUsd) : numerator / sizeInUsd;
    return {
      sizeDeltaUsd: rawSizeDelta, sizeDeltaInTokens: tokens, fullClose: false,
      expanded: isLong
        ? `USD 模式 Long：⌈${sizeInTokens} × ${rawSizeDelta} / ${sizeInUsd}⌉ = ${tokens}`
        : `USD 模式 Short：⌊${sizeInTokens} × ${rawSizeDelta} / ${sizeInUsd}⌋ = ${tokens}`,
    };
  }
  if (rawSizeDelta === sizeInTokens) {
    return {
      sizeDeltaUsd: sizeInUsd, sizeDeltaInTokens: rawSizeDelta, fullClose: true,
      expanded: `Token 模式全平恒等分支：rawSizeDelta ${rawSizeDelta} == sizeInTokens → (sizeInUsd ${sizeInUsd}, ${rawSizeDelta})`,
    };
  }
  if (sizeInTokens === 0n) throw new Error('sizeInTokens 为 0，无法等比销账');
  const numerator = sizeInUsd * rawSizeDelta;
  const usd = isLong ? numerator / sizeInTokens : ceilDiv(numerator, sizeInTokens);
  return {
    sizeDeltaUsd: usd, sizeDeltaInTokens: rawSizeDelta, fullClose: false,
    expanded: isLong
      ? `Token 模式 Long：⌊${sizeInUsd} × ${rawSizeDelta} / ${sizeInTokens}⌋ = ${usd}`
      : `Token 模式 Short：⌈${sizeInUsd} × ${rawSizeDelta} / ${sizeInTokens}⌉ = ${usd}`,
  };
}

// ── §4.6 减仓成交价 ──────────────────────────────────────────────────────────

/** Long ⌊index.min × (1e18 − d) / 1e18⌋；Short ⌈index.max × (1e18 + d) / 1e18⌉；d 为 clamp 后 int256 动态点差。 */
export function decreaseExecutionPrice(input: {
  readonly indexPriceMin: bigint;
  readonly indexPriceMax: bigint;
  readonly dynamicSpread: bigint;
  readonly isLong: boolean;
}) {
  const oraclePrice = input.isLong ? input.indexPriceMin : input.indexPriceMax;
  const result = calculateExecutionPrice({ oraclePrice, dynamicSpread: input.dynamicSpread, adverseUp: !input.isLong });
  return {
    executionPrice: result.executionPrice,
    oraclePrice,
    oracleSide: input.isLong ? 'indexTokenPrice.min' : 'indexTokenPrice.max',
    rounding: input.isLong ? 'floor' : 'ceil',
    expanded: input.isLong
      ? `Long 减仓：⌊${oraclePrice} × (1e18 − ${input.dynamicSpread}) / 1e18⌋ = ${result.executionPrice}`
      : `Short 减仓：⌈${oraclePrice} × (1e18 + ${input.dynamicSpread}) / 1e18⌉ = ${result.executionPrice}`,
  };
}

// ── §6 Position PnL（整仓含点差执行价、同方向单边封顶、比例分摊）──────────────

export interface PnlCapInputs {
  readonly cumulativeOpenCosts: bigint;
  readonly openInterestInTokens: bigint;
  /** IVault(market.vault).totalAssets()（execBlock−1） */
  readonly poolTokenAmount: bigint;
  readonly collateralPriceMin: bigint;
  /** pickPriceForPnl(isLong, maximize=true)：Long→index.max，Short→index.min */
  readonly indexPriceForPool: bigint;
  readonly maxPnlFactor: bigint;
}

export interface PositionPnlResult {
  readonly totalPositionPnl: bigint;
  readonly uncappedBasePnlUsd: bigint;
  readonly basePnlUsd: bigint | undefined;
  readonly capStatus: 'loss-uncapped' | 'no-cap-needed' | 'capped' | 'inputs-missing';
  readonly expanded: string;
}

/** PositionUtils.sol::_getPositionPnlUsd + MarketUtils.getPnl / getCappedPnl 逐句重放。 */
export function positionPnl(input: {
  readonly sizeInUsd: bigint;
  readonly sizeInTokens: bigint;
  readonly sizeDeltaInTokens: bigint;
  readonly executionPrice: bigint;
  readonly isLong: boolean;
  readonly cap?: PnlCapInputs;
}): PositionPnlResult {
  const positionValue = input.sizeInTokens * input.executionPrice;
  const total = input.isLong ? positionValue - input.sizeInUsd : input.sizeInUsd - positionValue;
  if (input.sizeInTokens === 0n) throw new Error('sizeInTokens 为 0，无法折算 PnL');
  const uncapped = mulDivSigned(total, input.sizeDeltaInTokens, input.sizeInTokens, total < 0n);
  const head = `positionValue = ${input.sizeInTokens} × ${input.executionPrice} = ${positionValue}；total = ${total}`;
  if (total <= 0n) {
    return {
      totalPositionPnl: total, uncappedBasePnlUsd: uncapped, basePnlUsd: uncapped, capStatus: 'loss-uncapped',
      expanded: `${head}；total ≤ 0 不封顶；positionPnlUsd = mulDiv(${total}, ${input.sizeDeltaInTokens}, ${input.sizeInTokens}, roundUp=${total < 0n}) = ${uncapped}`,
    };
  }
  if (!input.cap) {
    return {
      totalPositionPnl: total, uncappedBasePnlUsd: uncapped, basePnlUsd: undefined, capStatus: 'inputs-missing',
      expanded: `${head}；total > 0 需要单边池 PnL 封顶输入（cumulativeOpenCosts / openInterestInTokens / totalAssets / MAX_PNL_FACTOR_FOR_TRADERS）`,
    };
  }
  const cap = input.cap;
  const poolTokenUsd = cap.poolTokenAmount * cap.collateralPriceMin;
  const poolPnl = cap.cumulativeOpenCosts === 0n || cap.openInterestInTokens === 0n
    ? 0n
    : (input.isLong
      ? cap.openInterestInTokens * cap.indexPriceForPool - cap.cumulativeOpenCosts
      : cap.cumulativeOpenCosts - cap.openInterestInTokens * cap.indexPriceForPool);
  const maxPnl = applyFactor(poolTokenUsd, cap.maxPnlFactor);
  const cappedPoolPnl = poolPnl < 0n ? poolPnl : (poolPnl > maxPnl ? maxPnl : poolPnl);
  const scale = cappedPoolPnl !== poolPnl && cappedPoolPnl > 0n && poolPnl > 0n;
  const scaledTotal = scale ? total * cappedPoolPnl / poolPnl : total;
  const base = mulDivSigned(scaledTotal, input.sizeDeltaInTokens, input.sizeInTokens, scaledTotal < 0n);
  return {
    totalPositionPnl: scaledTotal, uncappedBasePnlUsd: uncapped, basePnlUsd: base, capStatus: scale ? 'capped' : 'no-cap-needed',
    expanded: `${head}；poolPnl = ${poolPnl}，poolTokenUsd = ${cap.poolTokenAmount} × ${cap.collateralPriceMin} = ${poolTokenUsd}，`
      + `maxPnl = ⌊poolTokenUsd × ${cap.maxPnlFactor} / 1e30⌋ = ${maxPnl}，cappedPoolPnl = ${cappedPoolPnl}`
      + (scale ? `；缩放 total = ⌊${total} × ${cappedPoolPnl} / ${poolPnl}⌋ = ${scaledTotal}` : '；未触发缩放')
      + `；positionPnlUsd = mulDiv(${scaledTotal}, ${input.sizeDeltaInTokens}, ${input.sizeInTokens}, roundUp=false) = ${base}`,
  };
}

// ── §7.1 基础仓位费 / §8.3 清算费 ────────────────────────────────────────────

export function positionFeeExpectation(input: {
  readonly sizeDeltaUsd: bigint;
  readonly positionFeeFactor: bigint;
  readonly collateralPriceMin: bigint;
}) {
  const result = calculatePositionFee({ tradeSizeUsd: input.sizeDeltaUsd, positionFeeFactor: input.positionFeeFactor, collateralPriceMin: input.collateralPriceMin });
  return { positionFeeAmount: result.positionFee, expanded: `⌊⌊${result.expanded}⌋⌋（先 /1e30 再 /collateralPrice.min，两次向下）` };
}

export function liquidationFeeExpectation(input: {
  readonly sizeDeltaUsd: bigint;
  readonly liquidationFeeFactor: bigint;
  readonly collateralPriceMin: bigint;
  readonly receiverFactor: bigint | undefined;
}) {
  if (input.liquidationFeeFactor === 0n) {
    return {
      liquidationFeeUsd: 0n, liquidationFeeAmount: 0n, forReceiver: 0n,
      expanded: 'LIQUIDATION_FEE_FACTOR = 0 → 早退，清算费三项全 0（且不读 LIQUIDATION_FEE_RECEIVER_FACTOR）',
    };
  }
  const liquidationFeeUsd = applyFactor(input.sizeDeltaUsd, input.liquidationFeeFactor);
  const liquidationFeeAmount = ceilDiv(liquidationFeeUsd, input.collateralPriceMin);
  const forReceiver = input.receiverFactor === undefined ? undefined : applyFactor(liquidationFeeAmount, input.receiverFactor);
  return {
    liquidationFeeUsd, liquidationFeeAmount, forReceiver,
    expanded: `liquidationFeeUsd = ⌊${input.sizeDeltaUsd} × ${input.liquidationFeeFactor} / 1e30⌋ = ${liquidationFeeUsd}；`
      + `liquidationFeeAmount = ⌈${liquidationFeeUsd} / ${input.collateralPriceMin}⌉ = ${liquidationFeeAmount}`
      + (forReceiver === undefined ? '' : `；forFeeReceiver = ⌊${liquidationFeeAmount} × ${input.receiverFactor} / 1e30⌋ = ${forReceiver}`),
  };
}

// ── §5.4 减仓支付瀑布（含 §5.4.4 破产早退）───────────────────────────────────

export type WaterfallStep = 'funding' | 'pnl' | 'fees';

export interface WaterfallReplayInput {
  readonly collateralBefore: bigint;
  readonly positiveFunding: bigint;
  readonly negativeFunding: bigint;
  readonly basePnlUsd: bigint;
  readonly collateralPriceMin: bigint;
  readonly collateralPriceMax: bigint;
  /** totalCostAmountExcludingFunding；InsolventClose(step=fees) 后事件已清零、不可知时传 undefined。 */
  readonly costExcludingFunding: bigint | undefined;
  readonly feeAmountForPool: bigint;
  readonly fullClose: boolean;
  /** 归一化后的 order.initialCollateralDeltaAmount（全平恒为 0，见 §5.2 ⑦）。 */
  readonly requestedWithdrawal: bigint;
  readonly insolventCloseAllowed: boolean;
  /** 链上已观测到 InsolventClose(step=fees) 且费用不可知时置 true：费用步吃光 output 与押金。 */
  readonly observedFeesShortfall?: boolean;
}

export interface WaterfallReplay {
  readonly output: bigint | undefined;
  readonly remainingCollateral: bigint | undefined;
  readonly pnlPayoutFromLp: bigint;
  readonly fundingPaid: bigint;
  readonly lossPaidToLp: bigint;
  readonly feesPaid: bigint | undefined;
  readonly feesTransferredToPool: boolean;
  readonly shortfall?: { readonly step: WaterfallStep; readonly remainingCostUsd: bigint | undefined };
  readonly wouldRevert: boolean;
  readonly feesUnknown: boolean;
  /** LP Vault 期望 Δ：−盈利兑付 + 实付亏损 + （费用付清时）feeAmountForPool − max(positive − 实付 funding, 0) */
  readonly lpVaultDelta: bigint | undefined;
  readonly expanded: string;
}

/** DecreasePositionCollateralUtils.sol::processCollateral / payForCost / handleEarlyReturn 同序重放。 */
export function replayDecreaseWaterfall(input: WaterfallReplayInput): WaterfallReplay {
  const steps: string[] = [];
  let output = input.basePnlUsd > 0n ? input.basePnlUsd / input.collateralPriceMax : 0n;
  const pnlPayoutFromLp = output;
  let remaining = input.collateralBefore;
  steps.push(`① output = ${input.basePnlUsd > 0n ? `⌊${input.basePnlUsd} / ${input.collateralPriceMax}⌋` : '0'} = ${output}（LP→PositionVault 同额）`);
  remaining += input.positiveFunding;
  steps.push(`② remaining = ${input.collateralBefore} + positiveFunding ${input.positiveFunding} = ${remaining}`);

  const pay = (costUsd: bigint): { paid: bigint; remainingCostUsd: bigint } => {
    if (costUsd === 0n) return { paid: 0n, remainingCostUsd: 0n };
    let need = ceilDiv(costUsd, input.collateralPriceMin);
    let paid = 0n;
    if (output > 0n) {
      const take = min(output, need);
      paid += take;
      output -= take;
      need -= take;
    }
    if (need > 0n && remaining > 0n) {
      const take = min(remaining, need);
      paid += take;
      remaining -= take;
      need -= take;
    }
    return { paid, remainingCostUsd: need * input.collateralPriceMin };
  };

  const finish = (partial: {
    fundingPaid: bigint;
    lossPaidToLp: bigint;
    feesPaid: bigint | undefined;
    feesTransferredToPool: boolean;
    shortfall?: { step: WaterfallStep; remainingCostUsd: bigint | undefined };
    feesUnknown: boolean;
    determinate: boolean;
  }): WaterfallReplay => {
    const wouldRevert = partial.shortfall !== undefined && !input.insolventCloseAllowed;
    const lpVaultDelta = partial.feesUnknown && !partial.determinate
      ? undefined
      : -pnlPayoutFromLp + partial.lossPaidToLp + (partial.feesTransferredToPool ? input.feeAmountForPool : 0n)
        - max(input.positiveFunding - partial.fundingPaid, 0n);
    return {
      output: partial.determinate ? output : undefined,
      remainingCollateral: partial.determinate ? remaining : undefined,
      pnlPayoutFromLp,
      fundingPaid: partial.fundingPaid,
      lossPaidToLp: partial.lossPaidToLp,
      feesPaid: partial.feesPaid,
      feesTransferredToPool: partial.feesTransferredToPool,
      ...(partial.shortfall ? { shortfall: partial.shortfall } : {}),
      wouldRevert,
      feesUnknown: partial.feesUnknown,
      lpVaultDelta,
      expanded: steps.join('；'),
    };
  };

  const closeOut = (): void => {
    if (input.fullClose) {
      steps.push(`清仓分支：output += remaining ${remaining} → ${output + remaining}`);
      output += remaining;
      remaining = 0n;
    } else {
      const withdrawal = min(input.requestedWithdrawal, remaining);
      remaining -= withdrawal;
      output += withdrawal;
      steps.push(`⑥ 部分平提取 min(${input.requestedWithdrawal}, remaining) = ${withdrawal} → output ${output}，remaining ${remaining}`);
    }
  };

  const funding = pay(input.negativeFunding * input.collateralPriceMin);
  steps.push(`③ pay(negativeFunding ${input.negativeFunding} × min)：实付 ${funding.paid}，缺口 USD ${funding.remainingCostUsd}；settleFundingFees(实付 ${funding.paid}, positive ${input.positiveFunding})`);
  if (funding.remainingCostUsd > 0n) {
    steps.push('→ handleEarlyReturn(step="funding")');
    closeOut();
    return finish({ fundingPaid: funding.paid, lossPaidToLp: 0n, feesPaid: undefined, feesTransferredToPool: false, shortfall: { step: 'funding', remainingCostUsd: funding.remainingCostUsd }, feesUnknown: false, determinate: true });
  }

  let lossPaidToLp = 0n;
  if (input.basePnlUsd < 0n) {
    const loss = pay(-input.basePnlUsd);
    lossPaidToLp = loss.paid;
    steps.push(`④ pay(−basePnlUsd ${-input.basePnlUsd})：need ⌈/min⌉，实付 ${loss.paid}（PositionVault→LP），缺口 USD ${loss.remainingCostUsd}`);
    if (loss.remainingCostUsd > 0n) {
      steps.push('→ handleEarlyReturn(step="pnl")');
      closeOut();
      return finish({ fundingPaid: funding.paid, lossPaidToLp, feesPaid: undefined, feesTransferredToPool: false, shortfall: { step: 'pnl', remainingCostUsd: loss.remainingCostUsd }, feesUnknown: false, determinate: true });
    }
  } else {
    steps.push('④ basePnlUsd ≥ 0，无亏损支付');
  }

  if (input.costExcludingFunding === undefined) {
    if (input.observedFeesShortfall) {
      const consumed = output + remaining;
      output = 0n;
      remaining = 0n;
      steps.push(`⑤ 费用已被 getEmptyFees 清零不可知；链上 InsolventClose(step=fees) 表明费用步吃光 output+remaining = ${consumed}`);
      closeOut();
      return finish({ fundingPaid: funding.paid, lossPaidToLp, feesPaid: consumed, feesTransferredToPool: false, shortfall: { step: 'fees', remainingCostUsd: undefined }, feesUnknown: true, determinate: true });
    }
    steps.push('⑤ totalCostAmountExcludingFunding 不可知，瀑布无法继续');
    return finish({ fundingPaid: funding.paid, lossPaidToLp, feesPaid: undefined, feesTransferredToPool: false, feesUnknown: true, determinate: false });
  }

  const fees = pay(input.costExcludingFunding * input.collateralPriceMin);
  steps.push(`⑤ pay(totalCostAmountExcludingFunding ${input.costExcludingFunding} × min)：实付 ${fees.paid}，缺口 USD ${fees.remainingCostUsd}`);
  if (fees.remainingCostUsd > 0n) {
    steps.push('→ fees = getEmptyFees；handleEarlyReturn(step="fees")；feeAmountForPool 不转账、claimable 不增记');
    closeOut();
    return finish({ fundingPaid: funding.paid, lossPaidToLp, feesPaid: fees.paid, feesTransferredToPool: false, shortfall: { step: 'fees', remainingCostUsd: fees.remainingCostUsd }, feesUnknown: false, determinate: true });
  }
  steps.push(`费用付清：PositionVault→LP feeAmountForPool ${input.feeAmountForPool}，claimable 增记`);
  closeOut();
  return finish({ fundingPaid: funding.paid, lossPaidToLp, feesPaid: fees.paid, feesTransferredToPool: true, feesUnknown: false, determinate: true });
}

// ── §10.7 settleFundingFees（减仓传实付额）────────────────────────────────────

export function fundingSettlement(input: {
  readonly negativeFunding: bigint;
  readonly positiveFunding: bigint;
  /** InsufficientFundingFeePayment.amountPaidInCollateralToken；无该事件时实付 = 应付 */
  readonly insufficientPaid: bigint | undefined;
}) {
  const paid = input.insufficientPaid ?? input.negativeFunding;
  const claimableDelta = paid > input.positiveFunding ? paid - input.positiveFunding : 0n;
  const lpToPositionVault = input.positiveFunding > paid ? input.positiveFunding - paid : 0n;
  return {
    paid,
    claimableDelta,
    lpToPositionVault,
    expanded: `settleFundingFees(实付 ${paid}, positive ${input.positiveFunding})：`
      + (paid > input.positiveFunding
        ? `净支付 → claimable(FUNDING_FEE_TYPE) += ${claimableDelta}（只记账不转账）`
        : input.positiveFunding > paid
          ? `净收取 → LPVault→PositionVault ${lpToPositionVault}`
          : '相等 → 不动账'),
  };
}

// ── §11 清算判定 ─────────────────────────────────────────────────────────────

export interface LiquidationJudgementInput {
  readonly collateralAmount: bigint;
  readonly collateralPriceMin: bigint;
  /** 整仓（sizeDeltaInTokens = sizeInTokens）含点差执行价的封顶后 PnL */
  readonly positionPnlUsd: bigint;
  readonly positiveFundingFeeAmount: bigint;
  /** 判定口径 totalCostAmount = positionFeeAmount − totalDiscountAmount + negativeFundingFeeAmount（无清算费、无 UI Fee）；不可知传 undefined */
  readonly totalCostAmount: bigint | undefined;
  readonly sizeInUsd: bigint;
  /** forLiquidation=true → MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION */
  readonly minCollateralFactor: bigint | undefined;
  /** FX100Keys.MIN_COLLATERAL_USD（全局键）；参数快照未采集时为 undefined */
  readonly minCollateralUsd: bigint | undefined;
}

export interface LiquidationJudgement {
  readonly remainingCollateralUsd: bigint | undefined;
  /** 费用不可知时的上界（费用只会让剩余更小） */
  readonly remainingUpperBoundUsd: bigint;
  readonly minCollateralUsdForLeverage: bigint | undefined;
  readonly liquidatable: boolean | undefined;
  readonly reason: string;
  readonly expanded: string;
}

/** PositionUtils.sol::isPositionLiquidatable 三条判据按源码顺序短路；缺输入时只在可靠方向上下结论。 */
export function liquidationJudgement(input: LiquidationJudgementInput): LiquidationJudgement {
  const collateralUsd = input.collateralAmount * input.collateralPriceMin;
  const positiveFundingUsd = input.positiveFundingFeeAmount * input.collateralPriceMin;
  const costUsd = input.totalCostAmount === undefined ? undefined : input.totalCostAmount * input.collateralPriceMin;
  const upper = collateralUsd + input.positionPnlUsd + positiveFundingUsd - (costUsd ?? 0n);
  const remaining = costUsd === undefined ? undefined : upper;
  const minForLeverage = input.minCollateralFactor === undefined ? undefined : applyFactor(input.sizeInUsd, input.minCollateralFactor);
  const head = `remainingCollateralUsd = ${collateralUsd} + pnl ${input.positionPnlUsd} + positiveFundingUsd ${positiveFundingUsd} − collateralCostUsd ${costUsd === undefined ? '<unknown>' : costUsd} = ${remaining === undefined ? `≤ ${upper}` : remaining}`
    + `；minCollateralUsdForLeverage = ⌊${input.sizeInUsd} × ${input.minCollateralFactor === undefined ? '<unknown>' : input.minCollateralFactor} / 1e30⌋ = ${minForLeverage === undefined ? '<unknown>' : minForLeverage}`;
  const conclude = (liquidatable: boolean | undefined, reason: string, why: string): LiquidationJudgement => ({
    remainingCollateralUsd: remaining,
    remainingUpperBoundUsd: upper,
    minCollateralUsdForLeverage: minForLeverage,
    liquidatable,
    reason,
    expanded: `${head}；${why}`,
  });

  if (remaining !== undefined) {
    if (input.minCollateralUsd !== undefined) {
      if (remaining < input.minCollateralUsd) return conclude(true, 'min collateral', `① ${remaining} < MIN_COLLATERAL_USD ${input.minCollateralUsd}`);
    }
    if (remaining <= 0n) return conclude(true, '< 0', `② ${remaining} ≤ 0${input.minCollateralUsd === undefined ? '（① MIN_COLLATERAL_USD 未采集、未评估，但②已成立）' : ''}`);
    if (minForLeverage === undefined) return conclude(undefined, '', '③ 缺 MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION，无法评估杠杆判据');
    if (remaining < minForLeverage) {
      return conclude(true, 'min collateral for leverage', `③ ${remaining} < ${minForLeverage}${input.minCollateralUsd === undefined ? '（① 未评估，reason 可能实为 "min collateral"，结论 true 不受影响）' : ''}`);
    }
    if (input.minCollateralUsd === undefined) return conclude(undefined, '', '②③ 均不成立，① 需要 MIN_COLLATERAL_USD 才能定论');
    return conclude(false, '', '三条判据均不成立 → 不可清算');
  }
  if (upper <= 0n) return conclude(true, '< 0', `费用不可知，但上界 ${upper} ≤ 0 已满足 ②`);
  if (minForLeverage !== undefined && upper < minForLeverage) {
    return conclude(true, 'min collateral for leverage', `费用不可知，但上界 ${upper} < ${minForLeverage} 已满足 ③`);
  }
  return conclude(undefined, '', '费用不可知且上界未越线，无法定论');
}

// ── 意图解析（submitMarketDecrease.input 的多种写法）────────────────────────

export interface DecreaseIntent {
  readonly rawSizeDelta: bigint | undefined;
  readonly rawSizeDeltaSource: SourceRef | undefined;
  /** intent / percent-full 来自意图与状态（可 FULL_RECOMPUTE）；order-created 来自提交交易的 OrderCreated 事件（按事件锚定处理）。 */
  readonly rawSizeDeltaOrigin: 'intent' | 'percent-full' | 'order-created' | 'missing';
  readonly isSizeDeltaUsd: boolean;
  readonly isSizeDeltaUsdSource: SourceRef;
  readonly orderType: bigint;
  readonly orderTypeSource: SourceRef;
  readonly requestedWithdrawal: bigint;
  readonly requestedWithdrawalSource: SourceRef;
  readonly minOutputAmount: bigint | undefined;
  readonly minOutputAmountSource: SourceRef;
}

const ORDER_TYPE_NAMES: Readonly<Record<string, bigint>> = {
  MarketIncrease: ORDER_TYPE.MarketIncrease,
  LimitIncrease: ORDER_TYPE.LimitIncrease,
  MarketDecrease: ORDER_TYPE.MarketDecrease,
  LimitDecrease: ORDER_TYPE.LimitDecrease,
  StopLossDecrease: ORDER_TYPE.StopLossDecrease,
  Liquidation: ORDER_TYPE.Liquidation,
  StopIncrease: ORDER_TYPE.StopIncrease,
};

/**
 * 意图字段优先级：submit.input 显式字段 → 提交交易的 OrderCreated 事件（src/order/OrderEventUtils.sol::createEventData：
 * uint.orderType / sizeDelta / initialCollateralDeltaAmount / minOutputAmount，bool.isSizeDeltaUsd）→ percent=100 ↔ 整仓 → 缺省值。
 */
export function resolveDecreaseIntent(submit: DecreaseActionView, positionBefore: JsonRecord): DecreaseIntent {
  const input = submit.input;
  const created = eventArgs(submit, 'OrderCreated');
  const createdUint = created?.uint ?? {};
  const createdBool = created?.bool ?? {};
  const C = (path: string): SourceRef => eventSource(submit, 'OrderCreated', path);

  const isSizeDeltaUsdInput = optionalBoolean(input.isSizeDeltaUsd);
  const isSizeDeltaUsdCreated = optionalBoolean(createdBool.isSizeDeltaUsd);
  const isSizeDeltaUsd = isSizeDeltaUsdInput ?? isSizeDeltaUsdCreated ?? true;
  const isSizeDeltaUsdSource: SourceRef = isSizeDeltaUsdInput !== undefined
    ? intentSource(submit, 'isSizeDeltaUsd')
    : isSizeDeltaUsdCreated !== undefined ? C('bool.isSizeDeltaUsd') : derivedSource('未声明 isSizeDeltaUsd → 按 USD 模式');

  const sizeKeys = ['sizeDeltaUsd', 'sizeDeltaUsdRaw', 'sizeDelta', 'sizeDeltaRaw'] as const;
  const sizeKey = sizeKeys.find((key) => optionalBigint(input[key]) !== undefined);
  const percent = typeof input.percent === 'number' ? input.percent : optionalBigint(input.percent);
  let rawSizeDelta: bigint | undefined;
  let rawSizeDeltaSource: SourceRef | undefined;
  let origin: DecreaseIntent['rawSizeDeltaOrigin'] = 'missing';
  if (sizeKey) {
    rawSizeDelta = optionalBigint(input[sizeKey]);
    rawSizeDeltaSource = intentSource(submit, sizeKey);
    origin = 'intent';
  } else if (optionalBigint(createdUint.sizeDelta) !== undefined) {
    rawSizeDelta = optionalBigint(createdUint.sizeDelta);
    rawSizeDeltaSource = C('uint.sizeDelta');
    origin = 'order-created';
  } else if (percent !== undefined && Number(percent) === 100) {
    const field = isSizeDeltaUsd ? 'sizeInUsd' : 'sizeInTokens';
    rawSizeDelta = optionalBigint(positionBefore[field]);
    rawSizeDeltaSource = derivedSource(`actions[actionId=${submit.id}].input.percent=100 → execution-before position.${field}`);
    origin = 'percent-full';
  }

  const orderTypeRaw = input.orderType;
  const orderTypeInput = typeof orderTypeRaw === 'string' && ORDER_TYPE_NAMES[orderTypeRaw] !== undefined
    ? ORDER_TYPE_NAMES[orderTypeRaw]
    : optionalBigint(orderTypeRaw);
  const orderTypeCreated = optionalBigint(createdUint.orderType);
  const orderType = orderTypeInput ?? orderTypeCreated ?? ORDER_TYPE.MarketDecrease;
  const orderTypeSource: SourceRef = orderTypeInput !== undefined
    ? intentSource(submit, 'orderType')
    : orderTypeCreated !== undefined ? C('uint.orderType') : derivedSource('未声明 orderType → MarketDecrease');

  const withdrawalKeys = ['initialCollateralDeltaAmount', 'collateralDeltaRaw', 'withdrawCollateralRaw', 'collateralDeltaAmount'] as const;
  const withdrawalKey = withdrawalKeys.find((key) => optionalBigint(input[key]) !== undefined);
  const withdrawalCreated = optionalBigint(createdUint.initialCollateralDeltaAmount);
  const requestedWithdrawal = withdrawalKey ? optionalBigint(input[withdrawalKey])! : (withdrawalCreated ?? 0n);
  const requestedWithdrawalSource: SourceRef = withdrawalKey
    ? intentSource(submit, withdrawalKey)
    : withdrawalCreated !== undefined
      ? C('uint.initialCollateralDeltaAmount')
      : derivedSource(`actions[actionId=${submit.id}].input 未声明 initialCollateralDeltaAmount → 0`);

  const minOutputKeys = ['minOutputAmount', 'minOutputAmountRaw'] as const;
  const minOutputKey = minOutputKeys.find((key) => optionalBigint(input[key]) !== undefined);
  const minOutputCreated = optionalBigint(createdUint.minOutputAmount);
  const minOutputAmount = minOutputKey ? optionalBigint(input[minOutputKey]) : minOutputCreated;
  const minOutputAmountSource: SourceRef = minOutputKey
    ? intentSource(submit, minOutputKey)
    : minOutputCreated !== undefined ? C('uint.minOutputAmount') : intentSource(submit, 'minOutputAmount');

  return {
    rawSizeDelta,
    rawSizeDeltaSource,
    rawSizeDeltaOrigin: rawSizeDelta === undefined ? 'missing' : origin,
    isSizeDeltaUsd,
    isSizeDeltaUsdSource,
    orderType,
    orderTypeSource,
    requestedWithdrawal,
    requestedWithdrawalSource,
    minOutputAmount,
    minOutputAmountSource,
  };
}

export { FLOAT_PRECISION, WEI_PRECISION, ceilDiv };

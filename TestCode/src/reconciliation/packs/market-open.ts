import type { CheckPack, CheckPackInputRequirement } from '../engine/check-engine.js';
import type { CheckRecord, SourceRef } from '../schema/check-record.js';
import type { EvidenceEnvelope, TransactionRef } from '../../evidence/evidence-v3.js';
import { requireExecutionTransaction } from '../../evidence/execution-transaction.js';
import { ceilDiv, decreaseWaterfall } from '../formulas.js';

type JsonRecord = Record<string, unknown>;
const FLOAT_PRECISION = 10n ** 30n;
const SPREAD_PRECISION = 10n ** 18n;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function bigint(value: unknown): bigint {
  if (value === undefined || value === null || value === '') throw new Error('必需数值输入缺失');
  return BigInt(String(value));
}

interface ReconciliationActionView {
  readonly id: string;
  readonly outcome: string;
  readonly input: JsonRecord;
  readonly before: { readonly blockNumber: number; readonly values: JsonRecord };
  readonly after: { readonly blockNumber: number; readonly values: JsonRecord };
  readonly events: JsonRecord;
  readonly transaction?: TransactionRef;
}

function action(evidence: EvidenceEnvelope, id: string): ReconciliationActionView {
  const found = evidence.actions.find((item) => item.actionId === id);
  if (!found) throw new Error(`${evidence.caseId} 缺少 ${id}`);
  const before = found.snapshots[0];
  const after = found.snapshots[1];
  if (!before || !after) throw new Error(`${evidence.caseId}/${id} 缺少 Before/After 快照`);
  const transaction = found.type === 'executeOrder' ? requireExecutionTransaction(found) : undefined;
  return {
    id: found.actionId,
    outcome: found.outcome.toLowerCase(),
    input: record(found.input),
    before: { blockNumber: Number(before.blockNumber), values: record(before.values) },
    after: { blockNumber: Number(after.blockNumber), values: record(after.values) },
    events: Object.fromEntries(found.events.map((event) => [event.name, event.args])),
    ...(transaction ? { transaction } : {}),
  };
}

function stateSource(actionId: string, side: 'before' | 'after', blockNumber: number, path: string): SourceRef {
  const snapshotIndex = side === 'before' ? 0 : 1;
  return { layer: 'chain-state', path: `actions[actionId=${actionId}].snapshots[${snapshotIndex}].values.${path}`, blockNumber };
}

function eventSource(action: ReconciliationActionView, path: string): SourceRef {
  const [eventName, ...argPath] = path.split('.');
  return { layer: 'chain-event', path: `actions[actionId=${action.id}].events[name=${eventName}].args.${argPath.join('.')}`, ...(action.transaction ? { blockNumber: Number(action.transaction.blockNumber), txHash: action.transaction.txHash } : {}) };
}

function intentSource(path: string): SourceRef {
  return { layer: 'intent', path: `actions[actionId=TX1].input.${path}` };
}

function formulaInput(name: string, value: unknown, source: SourceRef) {
  return { name, value: String(value), source };
}

function requiredInput(input: Omit<CheckPackInputRequirement, 'value'> & { value: unknown }): CheckPackInputRequirement {
  return input;
}

function keeperSource(action: ReconciliationActionView): SourceRef {
  return {
    layer: 'keeper',
    path: action.transaction
      ? `actions[actionId=${action.id}].transactions[txHash=${action.transaction.txHash}]`
      : `actions[actionId=${action.id}].transactions`,
    ...(action.transaction ? { blockNumber: Number(action.transaction.blockNumber), txHash: action.transaction.txHash } : {}),
  };
}

function executionPresence(input: {
  id: string;
  packId: string;
  action: ReconciliationActionView;
  purpose: CheckRecord['purpose'];
}): CheckRecord {
  const role = input.action.transaction?.role;
  const status = input.action.transaction?.status;
  return check({
    id: input.id,
    packId: input.packId,
    actionId: input.action.id,
    purpose: input.purpose,
    subject: 'keeper',
    comparison: 'presence',
    actual: `${role}:${status}`,
    expected: 'keeper|service:SUCCESS',
    sources: [keeperSource(input.action)],
    verification: 'PRESENCE',
    severity: 'blocking',
    verdict: (role === 'keeper' || role === 'service') && status === 'SUCCESS' ? 'PASS' : 'FAIL',
  });
}

function check(input: Omit<CheckRecord, 'actual' | 'expected'> & { actual: unknown; expected: unknown }): CheckRecord {
  return { ...input, actual: { raw: String(input.actual) }, expected: { raw: String(input.expected) } };
}

function exact(input: Omit<CheckRecord, 'actual' | 'expected' | 'verdict'> & { actual: unknown; expected: unknown }): CheckRecord {
  return check({ ...input, verdict: String(input.actual) === String(input.expected) ? 'PASS' : 'FAIL' });
}

function transition(before: unknown, after: unknown, expectedDelta: unknown) {
  const expectedAfter = bigint(before) + bigint(expectedDelta);
  return {
    before: { raw: String(before) },
    after: { raw: String(after) },
    actualDelta: { raw: (bigint(after) - bigint(before)).toString() },
    expectedDelta: { raw: String(expectedDelta) },
    expectedAfter: { raw: expectedAfter.toString() },
  };
}

function sumFields(values: JsonRecord, fields: readonly string[]): bigint {
  return fields.reduce((sum, field) => sum + bigint(values[field]), 0n);
}

const ledgerFields = ['traderUsdc', 'orderVaultUsdc', 'posVaultUsdc', 'lpVaultAssets', 'feeReceiverUsdc'] as const;

function ledgerDelta(action: ReconciliationActionView, field: string): bigint {
  return bigint(action.after.values[field]) - bigint(action.before.values[field]);
}

function conservation(action: ReconciliationActionView, packId: string, purpose: CheckRecord['purpose']): CheckRecord {
  const deltas = Object.fromEntries(ledgerFields.map((field) => [field, ledgerDelta(action, field)]));
  const sum = sumFields(deltas, ledgerFields);
  const inputs = ledgerFields.flatMap((field) => {
    const beforeSource = stateSource(action.id, 'before', action.before.blockNumber, field);
    const afterSource = stateSource(action.id, 'after', action.after.blockNumber, field);
    return [
      formulaInput(`${field}.before`, action.before.values[field], beforeSource),
      formulaInput(`${field}.after`, action.after.values[field], afterSource),
      formulaInput(`${field}.delta`, deltas[field], {
        layer: 'derived', path: `${afterSource.path} - ${beforeSource.path}`,
      }),
    ];
  });
  return exact({
    id: `${packId}.conservation`, packId, actionId: action.id, purpose,
    subject: 'chain-state', comparison: 'invariant', actual: sum, expected: 0n,
    sources: ledgerFields.flatMap((field) => [
      stateSource(action.id, 'before', action.before.blockNumber, field),
      stateSource(action.id, 'after', action.after.blockNumber, field),
    ]),
    formula: {
      id: 'ledger.usdc-five-party-conservation', version: 'v0.3.x',
      expanded: ledgerFields.map((field) => `${field}(${deltas[field]})`).join(' + '), inputs,
    },
    verification: 'FULL_RECOMPUTE', severity: 'blocking',
  });
}

export const marketOpenCorePack: CheckPack = {
  id: 'market-open.core',
  version: '1',
  requiredCapabilities: ['transaction', 'order-events', 'position-state', 'ledger', 'fee', 'funding'],
  requiredInputs(evidence) {
    const tx1 = action(evidence, 'TX1');
    const tx2 = action(evidence, 'TX2');
    const position = record(tx2.after.values.position);
    const positionBefore = record(tx2.before.values.position);
    const increase = record(tx2.events.PositionIncrease);
    const increaseUint = record(increase.uint);
    const increaseInt = record(increase.int);
    const increaseBool = record(increase.bool);
    const fees = record(tx2.events.PositionFeesCollected ?? tx2.events.feesCollected);
    const feeUint = record(fees.uint);
    const feeBool = record(fees.bool);
    const expectedSide = tx1.input.side === 'long';
    const pricePath = expectedSide ? 'indexTokenPrice.max' : 'indexTokenPrice.min';
    const requirements: CheckPackInputRequirement[] = [
      requiredInput({ name: 'TX1.input.side', actionId: 'TX1', purpose: 'primary', subject: 'chain-state', source: intentSource('side'), value: tx1.input.side }),
      requiredInput({ name: 'TX1.input.sizeDeltaUsd', actionId: 'TX1', purpose: 'primary', subject: 'chain-state', source: intentSource('sizeDeltaUsd'), value: tx1.input.sizeDeltaUsd }),
      requiredInput({ name: 'TX1.input.collateralAmount', actionId: 'TX1', purpose: 'primary', subject: 'chain-state', source: intentSource('collateralAmount'), value: tx1.input.collateralAmount }),
      requiredInput({ name: 'TX2.position.exists', actionId: 'TX2', purpose: 'primary', subject: 'chain-state', source: stateSource('TX2', 'after', tx2.after.blockNumber, 'position.exists'), value: position.exists }),
      requiredInput({ name: 'TX2.position.isLong', actionId: 'TX2', purpose: 'primary', subject: 'chain-state', source: stateSource('TX2', 'after', tx2.after.blockNumber, 'position.isLong'), value: position.isLong }),
      requiredInput({ name: 'TX2.position.sizeInUsd.before', actionId: 'TX2', purpose: 'primary', subject: 'chain-state', source: stateSource('TX2', 'before', tx2.before.blockNumber, 'position.sizeInUsd'), value: positionBefore.sizeInUsd }),
      requiredInput({ name: 'TX2.position.sizeInUsd', actionId: 'TX2', purpose: 'primary', subject: 'chain-state', source: stateSource('TX2', 'after', tx2.after.blockNumber, 'position.sizeInUsd'), value: position.sizeInUsd }),
      requiredInput({ name: 'TX2.position.collateralAmount', actionId: 'TX2', purpose: 'primary', subject: 'chain-state', source: stateSource('TX2', 'after', tx2.after.blockNumber, 'position.collateralAmount'), value: position.collateralAmount }),
      ...([
        ['PositionIncrease.uint.orderType', increaseUint.orderType],
        ['PositionIncrease.uint.executionPrice', increaseUint.executionPrice],
        ['PositionIncrease.uint.sizeDeltaInTokens', increaseUint.sizeDeltaInTokens],
        [`PositionIncrease.uint.${pricePath}`, increaseUint[pricePath]],
        ['PositionIncrease.int.dynamicSpread', increaseInt.dynamicSpread],
        ['PositionIncrease.bool.isLong', increaseBool.isLong],
        ['PositionFeesCollected.uint.positionFeeAmount', feeUint.positionFeeAmount],
        ['PositionFeesCollected.uint.positionFeeFactor', feeUint.positionFeeFactor],
        ['PositionFeesCollected.uint.collateralTokenPrice.min', feeUint['collateralTokenPrice.min']],
        ['PositionFeesCollected.uint.totalCostAmount', feeUint.totalCostAmount],
        ['PositionFeesCollected.uint.positiveFundingFeeAmount', feeUint.positiveFundingFeeAmount],
        ['PositionFeesCollected.bool.balanceWasImproved', feeBool.balanceWasImproved],
      ] as const).map(([name, value]) => requiredInput({
        name: `TX2.${name}`, actionId: 'TX2', purpose: 'primary', subject: 'chain-event',
        source: eventSource(tx2, name), value,
      })),
    ];
    for (const current of [tx1, tx2]) {
      for (const field of ledgerFields) {
        requirements.push(
          requiredInput({ name: `${current.id}.before.${field}`, actionId: current.id, purpose: 'primary', subject: 'chain-state', source: stateSource(current.id, 'before', current.before.blockNumber, field), value: current.before.values[field] }),
          requiredInput({ name: `${current.id}.after.${field}`, actionId: current.id, purpose: 'primary', subject: 'chain-state', source: stateSource(current.id, 'after', current.after.blockNumber, field), value: current.after.values[field] }),
        );
      }
    }
    return requirements;
  },
  run(evidence) {
    const tx1 = action(evidence, 'TX1');
    const tx2 = action(evidence, 'TX2');
    const position = record(tx2.after.values.position);
    const positionBefore = record(tx2.before.values.position);
    const increase = record(tx2.events.PositionIncrease);
    const increaseUint = record(increase.uint);
    const increaseInt = record(increase.int);
    const increaseBool = record(increase.bool);
    const fees = record(tx2.events.PositionFeesCollected ?? tx2.events.feesCollected);
    const feeUint = record(fees.uint);
    const feeBool = record(fees.bool);
    const expectedSide = tx1.input.side === 'long';
    const size = bigint(tx1.input.sizeDeltaUsd);
    const oldSize = bigint(positionBefore.sizeInUsd ?? 0);
    const expectedSize = oldSize + size;
    const collateral = bigint(tx1.input.collateralAmount);
    const feeFactor = bigint(feeUint.positionFeeFactor);
    const collateralMin = bigint(feeUint['collateralTokenPrice.min']);
    const expectedFee = size * feeFactor / FLOAT_PRECISION / collateralMin;
    const expectedCollateral = collateral - bigint(feeUint.totalCostAmount) + bigint(feeUint.positiveFundingFeeAmount);
    const oraclePrice = bigint(increaseUint[expectedSide ? 'indexTokenPrice.max' : 'indexTokenPrice.min']);
    const spread = bigint(increaseInt.dynamicSpread);
    const numerator = expectedSide ? oraclePrice * (SPREAD_PRECISION + spread) : oraclePrice * (SPREAD_PRECISION - spread);
    const expectedExecutionPrice = expectedSide ? (numerator + SPREAD_PRECISION - 1n) / SPREAD_PRECISION : numerator / SPREAD_PRECISION;
    const sideOiUsd = expectedSide ? 'cumulativeOpenCostsLong' : 'cumulativeOpenCostsShort';
    const otherOiUsd = expectedSide ? 'cumulativeOpenCostsShort' : 'cumulativeOpenCostsLong';
    const sideOiTokens = expectedSide ? 'openInterestInTokensLong' : 'openInterestInTokensShort';
    const otherOiTokens = expectedSide ? 'openInterestInTokensShort' : 'openInterestInTokensLong';
    const priceSources = [eventSource(tx2, 'PositionIncrease.uint.executionPrice'), eventSource(tx2, 'PositionIncrease.int.dynamicSpread')];
    const rows: CheckRecord[] = [
      exact({ id: 'order.create.escrow-trader', packId: this.id, actionId: 'TX1', purpose: 'primary', subject: 'chain-state', comparison: 'formula-vs-state',
        actual: ledgerDelta(tx1, 'traderUsdc'), expected: -collateral,
        ...transition(tx1.before.values.traderUsdc, tx1.after.values.traderUsdc, -collateral),
        sources: [intentSource('collateralAmount'), stateSource('TX1', 'before', tx1.before.blockNumber, 'traderUsdc'), stateSource('TX1', 'after', tx1.after.blockNumber, 'traderUsdc')],
        formula: { id: 'ledger.order-create.trader', version: 'v0.3.x', expanded: `expected trader Δ = -${collateral}`,
          inputs: [formulaInput('collateralAmount', collateral, intentSource('collateralAmount'))] },
        verification: 'FULL_RECOMPUTE', severity: 'blocking' }),
      exact({ id: 'order.create.escrow-vault', packId: this.id, actionId: 'TX1', purpose: 'primary', subject: 'chain-state', comparison: 'formula-vs-state',
        actual: ledgerDelta(tx1, 'orderVaultUsdc'), expected: collateral,
        ...transition(tx1.before.values.orderVaultUsdc, tx1.after.values.orderVaultUsdc, collateral),
        sources: [intentSource('collateralAmount'), stateSource('TX1', 'before', tx1.before.blockNumber, 'orderVaultUsdc'), stateSource('TX1', 'after', tx1.after.blockNumber, 'orderVaultUsdc')],
        formula: { id: 'ledger.order-create.vault', version: 'v0.3.x', expanded: `expected OrderVault Δ = ${collateral}`,
          inputs: [formulaInput('collateralAmount', collateral, intentSource('collateralAmount'))] },
        verification: 'FULL_RECOMPUTE', severity: 'blocking' }),
      conservation(tx1, this.id, 'primary'),
      exact({ id: 'order.execute.outcome', packId: this.id, actionId: 'TX2', purpose: 'primary', subject: 'chain-event', comparison: 'presence',
        actual: tx2.outcome, expected: 'executed', sources: [eventSource(tx2, 'OrderExecuted')], verification: 'PRESENCE', severity: 'blocking' }),
      executionPresence({ id: 'keeper.open-execution', packId: this.id, action: tx2, purpose: 'primary' }),
      exact({ id: 'position.exists', packId: this.id, actionId: 'TX2', purpose: 'primary', subject: 'chain-state', comparison: 'formula-vs-state',
        actual: position.exists, expected: true, before: { raw: String(record(tx2.before.values.position).exists) }, after: { raw: String(position.exists) }, sources: [stateSource('TX2', 'after', tx2.after.blockNumber, 'position.exists')], verification: 'PRESENCE', severity: 'blocking' }),
      exact({ id: 'position.side', packId: this.id, actionId: 'TX2', purpose: 'primary', subject: 'chain-state', comparison: 'formula-vs-state',
        actual: position.isLong, expected: expectedSide, before: { raw: String(record(tx2.before.values.position).isLong) }, after: { raw: String(position.isLong) }, sources: [intentSource('side'), stateSource('TX2', 'after', tx2.after.blockNumber, 'position.isLong')], verification: 'IDENTITY', severity: 'blocking' }),
      exact({ id: 'position.size-usd', packId: this.id, actionId: 'TX2', purpose: 'primary', subject: 'chain-state', comparison: 'formula-vs-state',
        actual: position.sizeInUsd, expected: expectedSize, ...transition(oldSize, position.sizeInUsd, size),
        sources: [intentSource('sizeDeltaUsd'), stateSource('TX2', 'before', tx2.before.blockNumber, 'position.sizeInUsd'), stateSource('TX2', 'after', tx2.after.blockNumber, 'position.sizeInUsd')],
        formula: { id: 'position.size.after-increase', version: 'v0.3.x', expanded: `${oldSize} + ${size} = ${expectedSize}`, inputs: [
          formulaInput('position.sizeInUsd.before', oldSize, stateSource('TX2', 'before', tx2.before.blockNumber, 'position.sizeInUsd')),
          formulaInput('sizeDeltaUsd', size, intentSource('sizeDeltaUsd')),
        ] }, verification: 'FULL_RECOMPUTE', severity: 'blocking' }),
      exact({ id: 'event.position.order-type', packId: this.id, actionId: 'TX2', purpose: 'primary', subject: 'chain-event', comparison: 'formula-vs-event',
        actual: increaseUint.orderType, expected: 0n, sources: [eventSource(tx2, 'PositionIncrease.uint.orderType')], verification: 'IDENTITY', severity: 'blocking' }),
      exact({ id: 'event.position.side', packId: this.id, actionId: 'TX2', purpose: 'primary', subject: 'chain-event', comparison: 'formula-vs-event',
        actual: increaseBool.isLong, expected: expectedSide, sources: [intentSource('side'), eventSource(tx2, 'PositionIncrease.bool.isLong')], verification: 'IDENTITY', severity: 'blocking' }),
      exact({ id: 'fee.position.amount', packId: this.id, actionId: 'TX2', purpose: 'primary', subject: 'chain-event', comparison: 'formula-vs-event',
        actual: feeUint.positionFeeAmount, expected: expectedFee, sources: [intentSource('sizeDeltaUsd'), eventSource(tx2, 'PositionFeesCollected.uint.positionFeeFactor'), eventSource(tx2, 'PositionFeesCollected.uint.collateralTokenPrice.min')],
        formula: { id: 'fee.position.amount', version: 'v0.3.x', expanded: `floor(floor(${size} * ${feeFactor} / 1e30) / ${collateralMin}) = ${expectedFee}`, inputs: [
          formulaInput('sizeDeltaUsd', size, intentSource('sizeDeltaUsd')),
          formulaInput('positionFeeFactor', feeFactor, eventSource(tx2, 'PositionFeesCollected.uint.positionFeeFactor')),
          formulaInput('collateralPrice.min', collateralMin, eventSource(tx2, 'PositionFeesCollected.uint.collateralTokenPrice.min')),
        ], rounding: 'floor, then floor' },
        verification: 'EVENT_ANCHORED', severity: 'blocking', note: 'positionFeeFactor 与 collateralPrice.min 仅有执行事件来源；完成 DataStore/Oracle 独立采集前不得标 FULL_RECOMPUTE。' }),
      exact({ id: 'position.collateral', packId: this.id, actionId: 'TX2', purpose: 'primary', subject: 'chain-state', comparison: 'formula-vs-state',
        actual: position.collateralAmount, expected: expectedCollateral, ...transition(record(tx2.before.values.position).collateralAmount ?? 0, position.collateralAmount, expectedCollateral), sources: [intentSource('collateralAmount'), eventSource(tx2, 'PositionFeesCollected.uint.totalCostAmount'), eventSource(tx2, 'PositionFeesCollected.uint.positiveFundingFeeAmount'), stateSource('TX2', 'after', tx2.after.blockNumber, 'position.collateralAmount')],
        formula: { id: 'position.collateral.after-increase', version: 'v0.3.x', expanded: `${collateral} - ${bigint(feeUint.totalCostAmount)} + ${bigint(feeUint.positiveFundingFeeAmount)} = ${expectedCollateral}`, inputs: [
          formulaInput('initialCollateralAmount', collateral, intentSource('collateralAmount')),
          formulaInput('totalCostAmount', feeUint.totalCostAmount, eventSource(tx2, 'PositionFeesCollected.uint.totalCostAmount')),
          formulaInput('positiveFundingFeeAmount', feeUint.positiveFundingFeeAmount, eventSource(tx2, 'PositionFeesCollected.uint.positiveFundingFeeAmount')),
        ] },
        verification: 'EVENT_ANCHORED', severity: 'blocking' }),
      exact({ id: 'pricing.execution-price', packId: this.id, actionId: 'TX2', purpose: 'primary', subject: 'chain-event', comparison: 'formula-vs-event',
        actual: increaseUint.executionPrice, expected: expectedExecutionPrice, sources: priceSources,
        formula: { id: 'pricing.increase.execution-price', version: 'v0.3.x', expanded: `${expectedSide ? 'ceil' : 'floor'}(${oraclePrice} * (1e18 ${expectedSide ? '+' : '-'} ${spread}) / 1e18) = ${expectedExecutionPrice}`, inputs: [
          formulaInput(expectedSide ? 'indexTokenPrice.max' : 'indexTokenPrice.min', oraclePrice, eventSource(tx2, `PositionIncrease.uint.${expectedSide ? 'indexTokenPrice.max' : 'indexTokenPrice.min'}`)),
          formulaInput('dynamicSpread', spread, eventSource(tx2, 'PositionIncrease.int.dynamicSpread')),
          formulaInput('isLong', expectedSide, intentSource('side')),
        ], rounding: expectedSide ? 'ceil' : 'floor' },
        verification: 'EVENT_ANCHORED', severity: 'blocking', note: 'dynamicSpread 取自事件；完整 LogExpMath 独立移植前不升级为 FULL_RECOMPUTE。' }),
      exact({ id: 'market.oi-usd-primary-side', packId: this.id, actionId: 'TX2', purpose: 'primary', subject: 'chain-state', comparison: 'formula-vs-state',
        actual: ledgerDelta(tx2, sideOiUsd), expected: size, ...transition(tx2.before.values[sideOiUsd], tx2.after.values[sideOiUsd], size),
        sources: [intentSource('sizeDeltaUsd'), stateSource('TX2', 'before', tx2.before.blockNumber, sideOiUsd), stateSource('TX2', 'after', tx2.after.blockNumber, sideOiUsd)],
        formula: { id: 'market.open-interest-usd.increase', version: 'v0.3.x', expanded: `expected OI USD Δ = ${size}`,
          inputs: [formulaInput('sizeDeltaUsd', size, intentSource('sizeDeltaUsd'))] }, verification: 'FULL_RECOMPUTE', severity: 'blocking' }),
      exact({ id: 'market.oi-usd-other-side', packId: this.id, actionId: 'TX2', purpose: 'primary', subject: 'chain-state', comparison: 'invariant',
        actual: ledgerDelta(tx2, otherOiUsd), expected: 0n, ...transition(tx2.before.values[otherOiUsd], tx2.after.values[otherOiUsd], 0n), sources: [stateSource('TX2', 'before', tx2.before.blockNumber, otherOiUsd), stateSource('TX2', 'after', tx2.after.blockNumber, otherOiUsd)], verification: 'IDENTITY', severity: 'blocking' }),
      exact({ id: 'market.oi-token-primary-side', packId: this.id, actionId: 'TX2', purpose: 'primary', subject: 'chain-state', comparison: 'event-vs-state',
        actual: ledgerDelta(tx2, sideOiTokens), expected: increaseUint.sizeDeltaInTokens, ...transition(tx2.before.values[sideOiTokens], tx2.after.values[sideOiTokens], increaseUint.sizeDeltaInTokens), sources: [eventSource(tx2, 'PositionIncrease.uint.sizeDeltaInTokens'), stateSource('TX2', 'before', tx2.before.blockNumber, sideOiTokens), stateSource('TX2', 'after', tx2.after.blockNumber, sideOiTokens)], verification: 'EVENT_ANCHORED', severity: 'blocking' }),
      exact({ id: 'market.oi-token-other-side', packId: this.id, actionId: 'TX2', purpose: 'primary', subject: 'chain-state', comparison: 'invariant',
        actual: ledgerDelta(tx2, otherOiTokens), expected: 0n, ...transition(tx2.before.values[otherOiTokens], tx2.after.values[otherOiTokens], 0n), sources: [stateSource('TX2', 'before', tx2.before.blockNumber, otherOiTokens), stateSource('TX2', 'after', tx2.after.blockNumber, otherOiTokens)], verification: 'IDENTITY', severity: 'blocking' }),
      exact({ id: 'fee.factor-selected', packId: this.id, actionId: 'TX2', purpose: 'primary', subject: 'chain-event', comparison: 'formula-vs-event',
        actual: feeBool.balanceWasImproved, expected: false, sources: [eventSource(tx2, 'PositionFeesCollected.bool.balanceWasImproved')], verification: 'EVENT_ANCHORED', severity: 'warning' }),
      conservation(tx2, this.id, 'primary'),
    ];
    return rows;
  },
};

export const marketOpenCleanupPack: CheckPack = {
  id: 'market-open.cleanup', version: '1', requiredCapabilities: ['transaction', 'order-events', 'position-state', 'ledger', 'fee', 'funding'],
  requiredInputs(evidence) {
    const tx1 = action(evidence, 'TX1');
    const tx3 = action(evidence, 'TX3');
    const tx4 = action(evidence, 'TX4');
    const positionBefore = record(tx3.before.values.position);
    const positionAfter = record(tx4.after.values.position);
    const decrease = record(tx4.events.PositionDecrease);
    const decreaseUint = record(decrease.uint);
    const decreaseInt = record(decrease.int);
    const fees = record(tx4.events.PositionFeesCollected ?? tx4.events.feesCollected);
    const feeUint = record(fees.uint);
    const requirements: CheckPackInputRequirement[] = [
      requiredInput({ name: 'TX1.input.collateralAmount', actionId: 'TX1', purpose: 'whole-flow', subject: 'chain-state', source: intentSource('collateralAmount'), value: tx1.input.collateralAmount }),
      requiredInput({ name: 'TX3.position.collateralAmount', actionId: 'TX3', purpose: 'cleanup', subject: 'chain-state', source: stateSource('TX3', 'before', tx3.before.blockNumber, 'position.collateralAmount'), value: positionBefore.collateralAmount }),
      requiredInput({ name: 'TX4.position.exists', actionId: 'TX4', purpose: 'cleanup', subject: 'chain-state', source: stateSource('TX4', 'after', tx4.after.blockNumber, 'position.exists'), value: positionAfter.exists }),
      ...([
        ['PositionDecrease.int.basePnlUsd', decreaseInt.basePnlUsd],
        ['PositionDecrease.uint.collateralTokenPrice.min', decreaseUint['collateralTokenPrice.min']],
        ['PositionDecrease.uint.collateralTokenPrice.max', decreaseUint['collateralTokenPrice.max']],
        ['PositionFeesCollected.uint.totalCostAmount', feeUint.totalCostAmount],
        ['PositionFeesCollected.uint.negativeFundingFeeAmount', feeUint.negativeFundingFeeAmount],
        ['PositionFeesCollected.uint.positiveFundingFeeAmount', feeUint.positiveFundingFeeAmount],
      ] as const).map(([name, value]) => requiredInput({
        name: `TX4.${name}`, actionId: 'TX4', purpose: 'cleanup', subject: 'chain-event',
        source: eventSource(tx4, name), value,
      })),
    ];
    for (const current of [tx3, tx4]) {
      for (const field of ledgerFields) {
        requirements.push(
          requiredInput({ name: `${current.id}.before.${field}`, actionId: current.id, purpose: 'cleanup', subject: 'chain-state', source: stateSource(current.id, 'before', current.before.blockNumber, field), value: current.before.values[field] }),
          requiredInput({ name: `${current.id}.after.${field}`, actionId: current.id, purpose: 'cleanup', subject: 'chain-state', source: stateSource(current.id, 'after', current.after.blockNumber, field), value: current.after.values[field] }),
        );
      }
    }
    for (const field of ledgerFields) {
      requirements.push(
        requiredInput({ name: `WHOLE.before.${field}`, actionId: 'WHOLE', purpose: 'whole-flow', subject: 'chain-state', source: stateSource('TX1', 'before', tx1.before.blockNumber, field), value: tx1.before.values[field] }),
        requiredInput({ name: `WHOLE.after.${field}`, actionId: 'WHOLE', purpose: 'whole-flow', subject: 'chain-state', source: stateSource('TX4', 'after', tx4.after.blockNumber, field), value: tx4.after.values[field] }),
      );
    }
    return requirements;
  },
  run(evidence) {
    const tx3 = action(evidence, 'TX3');
    const tx4 = action(evidence, 'TX4');
    const before = action(evidence, 'TX1').before.values;
    const after = tx4.after.values;
    const traderDelta = bigint(after.traderUsdc) - bigint(before.traderUsdc);
    const decrease = record(tx4.events.PositionDecrease);
    const decreaseUint = record(decrease.uint);
    const decreaseInt = record(decrease.int);
    const closeFees = record(tx4.events.PositionFeesCollected ?? tx4.events.feesCollected);
    const closeFeeUint = record(closeFees.uint);
    const basePnlUsd = bigint(decreaseInt.basePnlUsd);
    const collateralMin = bigint(decreaseUint['collateralTokenPrice.min']);
    const collateralMax = bigint(decreaseUint['collateralTokenPrice.max']);
    const positivePnlUsdc = basePnlUsd > 0n ? basePnlUsd / collateralMax : 0n;
    const negativePnlUsdc = basePnlUsd < 0n ? ceilDiv(-basePnlUsd, collateralMin) : 0n;
    const closeNegativeFunding = bigint(closeFeeUint.negativeFundingFeeAmount);
    const closePositiveFunding = bigint(closeFeeUint.positiveFundingFeeAmount);
    const closeTotalCost = bigint(closeFeeUint.totalCostAmount);
    const openedMargin = bigint(record(tx3.before.values.position).collateralAmount);
    const settlement = decreaseWaterfall({
      oldMargin: openedMargin,
      positiveFunding: closePositiveFunding,
      negativeFunding: closeNegativeFunding,
      positivePnlUsdc,
      negativePnlUsdc,
      costExcludingFunding: closeTotalCost - closeNegativeFunding,
      fullClose: true,
      requestedWithdrawal: 0n,
    });
    const initialCollateral = bigint(action(evidence, 'TX1').input.collateralAmount);
    const expectedTraderDelta = settlement.output - initialCollateral;
    return [
      conservation(tx3, this.id, 'cleanup'),
      exact({ id: 'cleanup.execute.outcome', packId: this.id, actionId: 'TX4', purpose: 'cleanup', subject: 'chain-event', comparison: 'presence', actual: tx4.outcome, expected: 'executed', sources: [eventSource(tx4, 'OrderExecuted')], verification: 'PRESENCE', severity: 'blocking' }),
      executionPresence({ id: 'keeper.close-execution', packId: this.id, action: tx4, purpose: 'cleanup' }),
      exact({ id: 'cleanup.position-removed', packId: this.id, actionId: 'TX4', purpose: 'cleanup', subject: 'chain-state', comparison: 'formula-vs-state', actual: record(after.position).exists, expected: false, sources: [stateSource('TX4', 'after', tx4.after.blockNumber, 'position.exists')], verification: 'PRESENCE', severity: 'blocking' }),
      conservation(tx4, this.id, 'cleanup'),
      exact({ id: 'whole.trader-usdc', packId: this.id, actionId: 'WHOLE', purpose: 'whole-flow', subject: 'chain-state', comparison: 'formula-vs-state', actual: traderDelta, expected: expectedTraderDelta,
        ...transition(before.traderUsdc, after.traderUsdc, expectedTraderDelta),
        sources: [stateSource('TX1', 'before', action(evidence, 'TX1').before.blockNumber, 'traderUsdc'), stateSource('TX4', 'after', tx4.after.blockNumber, 'traderUsdc'), eventSource(tx4, 'PositionDecrease.int.basePnlUsd'), eventSource(tx4, 'PositionFeesCollected.uint.totalCostAmount')],
        formula: { id: 'settlement.decrease-waterfall', version: 'v0.3.x', expanded: `${settlement.expanded}；whole-flow trader Δ = ${settlement.output} - ${initialCollateral} = ${expectedTraderDelta}`, inputs: [
          formulaInput('initialCollateral', initialCollateral, intentSource('collateralAmount')),
          formulaInput('oldMargin', openedMargin, stateSource('TX3', 'before', tx3.before.blockNumber, 'position.collateralAmount')),
          formulaInput('basePnlUsd', basePnlUsd, eventSource(tx4, 'PositionDecrease.int.basePnlUsd')),
          formulaInput('collateralTokenPrice.min', collateralMin, eventSource(tx4, 'PositionDecrease.uint.collateralTokenPrice.min')),
          formulaInput('collateralTokenPrice.max', collateralMax, eventSource(tx4, 'PositionDecrease.uint.collateralTokenPrice.max')),
          formulaInput('totalCostAmount', closeTotalCost, eventSource(tx4, 'PositionFeesCollected.uint.totalCostAmount')),
          formulaInput('negativeFundingFeeAmount', closeNegativeFunding, eventSource(tx4, 'PositionFeesCollected.uint.negativeFundingFeeAmount')),
          formulaInput('positiveFundingFeeAmount', closePositiveFunding, eventSource(tx4, 'PositionFeesCollected.uint.positiveFundingFeeAmount')),
        ], rounding: 'profit floor/max; loss ceil/min; ordered waterfall' },
        verification: 'EVENT_ANCHORED', severity: 'blocking', note: '瀑布独立重放；PnL、费用和 Funding 分量取自执行事件，因此证据等级为 EVENT_ANCHORED。' }),
      (() => {
        const deltas = Object.fromEntries(ledgerFields.map((field) => [field, bigint(after[field]) - bigint(before[field])]));
        const sum = sumFields(deltas, ledgerFields);
        const tx1 = action(evidence, 'TX1');
        const inputs = ledgerFields.flatMap((field) => {
          const beforeSource = stateSource('TX1', 'before', tx1.before.blockNumber, field);
          const afterSource = stateSource('TX4', 'after', tx4.after.blockNumber, field);
          return [
            formulaInput(`${field}.before`, before[field], beforeSource),
            formulaInput(`${field}.after`, after[field], afterSource),
            formulaInput(`${field}.delta`, deltas[field], { layer: 'derived', path: `${afterSource.path} - ${beforeSource.path}` }),
          ];
        });
        return exact({ id: 'whole.conservation', packId: this.id, actionId: 'WHOLE', purpose: 'whole-flow', subject: 'chain-state', comparison: 'invariant', actual: sum, expected: 0n,
          sources: ledgerFields.flatMap((field) => [stateSource('TX1', 'before', action(evidence, 'TX1').before.blockNumber, field), stateSource('TX4', 'after', tx4.after.blockNumber, field)]),
          formula: { id: 'ledger.usdc-five-party-conservation', version: 'v0.3.x', expanded: ledgerFields.map((field) => `${field}(${deltas[field]})`).join(' + '), inputs }, verification: 'FULL_RECOMPUTE', severity: 'blocking' });
      })(),
    ];
  },
};

import type { EvidenceEnvelope } from '../../evidence/evidence-v3.js';
import { requireExecutionTransaction } from '../../evidence/execution-transaction.js';
import type { CheckPack, CheckPackInputRequirement } from '../engine/check-engine.js';
import type { CheckRecord, SourceRef } from '../schema/check-record.js';

type JsonRecord = Record<string, unknown>;

const claimableFields = {
  position: 'claimableFeeAmountPosition',
  funding: 'claimableFeeAmountFunding',
  liquidation: 'claimableFeeAmountLiquidation',
} as const;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function integer(value: unknown): bigint {
  if (value === undefined || value === null || value === '') throw new Error('必需 claimable 数值输入缺失');
  return BigInt(String(value));
}

function stateSource(actionId: string, side: 'before' | 'after', blockNumber: number, field: string): SourceRef {
  const kind = side === 'before' ? 'execution-before' : 'execution-after';
  return { layer: 'chain-state', path: `actions[actionId=${actionId}].snapshots[kind=${kind}].values.${field}`, blockNumber };
}

function eventSource(actionId: string, blockNumber: number, txHash: string | undefined, path: string): SourceRef {
  return {
    layer: 'chain-event',
    path: `actions[actionId=${actionId}].events[name=PositionFeesCollected].args.${path}`,
    blockNumber,
    ...(txHash ? { txHash } : {}),
  };
}

function actionSource(actionId: string): SourceRef {
  return { layer: 'intent', path: `actions[actionId=${actionId}].type` };
}

interface ClaimableActionView {
  readonly actionId: string;
  readonly purpose: CheckRecord['purpose'];
  readonly beforeBlockNumber: number;
  readonly blockNumber: number;
  readonly txHash?: string;
  readonly before: JsonRecord;
  readonly after: JsonRecord;
  readonly fees: JsonRecord;
}

function action(evidence: EvidenceEnvelope, actionId: 'TX2' | 'TX4'): ClaimableActionView {
  const found = evidence.actions.find((item) => item.actionId === actionId);
  if (!found) throw new Error(`${evidence.caseId} 缺少 ${actionId}`);
  const beforeSnapshot = found.snapshots.find((item) => item.kind === 'execution-before');
  const afterSnapshot = found.snapshots.find((item) => item.kind === 'execution-after');
  if (!beforeSnapshot || !afterSnapshot) throw new Error(`${evidence.caseId}/${actionId} 缺少 execution Before/After`);
  const transaction = requireExecutionTransaction(found);
  const feesEvent = found.events.find((item) => item.name === 'PositionFeesCollected');
  return {
    actionId,
    purpose: found.purpose,
    beforeBlockNumber: Number(beforeSnapshot.blockNumber),
    blockNumber: Number(afterSnapshot.blockNumber),
    txHash: transaction.txHash,
    before: record(beforeSnapshot.values),
    after: record(afterSnapshot.values),
    fees: record(record(feesEvent?.args).uint),
  };
}

function requiredInput(
  view: ClaimableActionView,
  name: string,
  source: SourceRef,
  value: unknown,
  subject: CheckRecord['subject'] = 'chain-state',
): CheckPackInputRequirement {
  return { name: `${view.actionId}.${name}`, actionId: view.actionId, purpose: view.purpose, subject, source, value };
}

function transitionRow(input: {
  id: string;
  view: ClaimableActionView;
  field: string;
  expectedDelta: bigint;
  verification: CheckRecord['verification'];
  sources: SourceRef[];
  formula?: CheckRecord['formula'];
  note: string;
}): CheckRecord {
  const before = integer(input.view.before[input.field]);
  const after = integer(input.view.after[input.field]);
  const actualDelta = after - before;
  const expectedAfter = before + input.expectedDelta;
  return {
    id: input.id,
    packId: 'fee.claimable',
    actionId: input.view.actionId,
    purpose: input.view.purpose,
    subject: 'chain-state',
    comparison: 'formula-vs-state',
    actual: { raw: actualDelta.toString() },
    expected: { raw: input.expectedDelta.toString() },
    before: { raw: before.toString() },
    after: { raw: after.toString() },
    actualDelta: { raw: actualDelta.toString() },
    expectedDelta: { raw: input.expectedDelta.toString() },
    expectedAfter: { raw: expectedAfter.toString() },
    sources: input.sources,
    ...(input.formula ? { formula: input.formula } : {}),
    verification: input.verification,
    severity: 'blocking',
    verdict: after === expectedAfter ? 'PASS' : 'FAIL',
    note: input.note,
  };
}

function rowsFor(view: ClaimableActionView): CheckRecord[] {
  const feeReceiverAmount = integer(view.fees.feeReceiverAmount);
  const negativeFunding = integer(view.fees.negativeFundingFeeAmount);
  const positiveFunding = integer(view.fees.positiveFundingFeeAmount);
  const expectedFundingClaimable = negativeFunding > positiveFunding ? negativeFunding - positiveFunding : 0n;
  const positionBeforeSource = stateSource(view.actionId, 'before', view.beforeBlockNumber, claimableFields.position);
  const fundingBeforeSource = stateSource(view.actionId, 'before', view.beforeBlockNumber, claimableFields.funding);
  const feeReceiverSource = eventSource(view.actionId, view.blockNumber, view.txHash, 'uint.feeReceiverAmount');
  const negativeFundingSource = eventSource(view.actionId, view.blockNumber, view.txHash, 'uint.negativeFundingFeeAmount');
  const positiveFundingSource = eventSource(view.actionId, view.blockNumber, view.txHash, 'uint.positiveFundingFeeAmount');
  return [
    transitionRow({
      id: 'fee.claimable.position', view, field: claimableFields.position, expectedDelta: feeReceiverAmount,
      sources: [positionBeforeSource, stateSource(view.actionId, 'after', view.blockNumber, claimableFields.position), feeReceiverSource],
      formula: {
        id: 'fee.claimable.position.increment', version: 'v0.3.x',
        expanded: `claimablePosition.after = before + feeReceiverAmount(${feeReceiverAmount})`,
        inputs: [
          { name: 'claimablePosition.before', value: String(view.before[claimableFields.position]), source: positionBeforeSource },
          { name: 'feeReceiverAmount', value: feeReceiverAmount.toString(), source: feeReceiverSource },
        ],
      },
      verification: 'EVENT_ANCHORED',
      note: 'DataStore 内部应收；USDC 仍可留在 PositionVault，不与 ERC20 五方余额相加。',
    }),
    transitionRow({
      id: 'fee.claimable.funding', view, field: claimableFields.funding, expectedDelta: expectedFundingClaimable,
      sources: [fundingBeforeSource, stateSource(view.actionId, 'after', view.blockNumber, claimableFields.funding), negativeFundingSource, positiveFundingSource],
      formula: {
        id: 'fee.claimable.funding.net-payer', version: 'v0.3.x',
        expanded: `max(${negativeFunding} - ${positiveFunding}, 0) = ${expectedFundingClaimable}`,
        inputs: [
          { name: 'claimableFunding.before', value: String(view.before[claimableFields.funding]), source: fundingBeforeSource },
          { name: 'negativeFundingFeeAmount', value: negativeFunding.toString(), source: negativeFundingSource },
          { name: 'positiveFundingFeeAmount', value: positiveFunding.toString(), source: positiveFundingSource },
        ],
      },
      verification: 'EVENT_ANCHORED',
      note: 'v0.3.2 付款侧净 Funding 记入 DataStore claimable；反向净额走 LPVault→PositionVault，不产生 claimable。',
    }),
    transitionRow({
      id: 'fee.claimable.liquidation', view, field: claimableFields.liquidation, expectedDelta: 0n,
      sources: [
        stateSource(view.actionId, 'before', view.beforeBlockNumber, claimableFields.liquidation),
        stateSource(view.actionId, 'after', view.blockNumber, claimableFields.liquidation),
        actionSource(view.actionId),
      ],
      verification: 'IDENTITY',
      note: 'MarketIncrease/普通全平不是清算动作，Liquidation claimable 必须保持不变。',
    }),
    transitionRow({
      id: 'fee.handler-token-balance', view, field: 'feeReceiverUsdc', expectedDelta: 0n,
      sources: [
        stateSource(view.actionId, 'before', view.beforeBlockNumber, 'feeReceiverUsdc'),
        stateSource(view.actionId, 'after', view.blockNumber, 'feeReceiverUsdc'),
        actionSource(view.actionId),
      ],
      verification: 'IDENTITY',
      note: '旧 Evidence 字段名 feeReceiverUsdc 实际读取 FeeHandler 合约余额；它与 DataStore claimable 分行核对。交易执行阶段尚未 claim，DataStore.FEE_RECEIVER 指向的 RevenuePool 也尚未收到资金。',
    }),
  ];
}

export const feeClaimablePack: CheckPack = {
  id: 'fee.claimable',
  version: '1',
  requiredCapabilities: ['fee', 'ledger', 'claimable-ledger'],
  requiredInputs(evidence) {
    return (['TX2', 'TX4'] as const).flatMap((actionId) => {
      const view = action(evidence, actionId);
      return [
        ...Object.values(claimableFields).flatMap((field) => [
          requiredInput(view, `before.${field}`, stateSource(actionId, 'before', view.beforeBlockNumber, field), view.before[field]),
          requiredInput(view, `after.${field}`, stateSource(actionId, 'after', view.blockNumber, field), view.after[field]),
        ]),
        requiredInput(view, 'before.feeReceiverUsdc', stateSource(actionId, 'before', view.beforeBlockNumber, 'feeReceiverUsdc'), view.before.feeReceiverUsdc),
        requiredInput(view, 'after.feeReceiverUsdc', stateSource(actionId, 'after', view.blockNumber, 'feeReceiverUsdc'), view.after.feeReceiverUsdc),
        ...(['feeReceiverAmount', 'negativeFundingFeeAmount', 'positiveFundingFeeAmount'] as const).map((field) => requiredInput(
          view,
          `PositionFeesCollected.uint.${field}`,
          eventSource(actionId, view.blockNumber, view.txHash, `uint.${field}`),
          view.fees[field],
          'chain-event',
        )),
      ];
    });
  },
  run(evidence) {
    return (['TX2', 'TX4'] as const).flatMap((actionId) => rowsFor(action(evidence, actionId)));
  },
};

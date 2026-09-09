import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { adaptMarketFlowV1 } from '../src/reconciliation/adapters/market-flow-v1.js';
import { runCheckPlan, type CheckPlan } from '../src/reconciliation/engine/check-engine.js';
import { aggregateReport, assessEvidenceIntegrity } from '../src/reconciliation/engine/aggregate-verdicts.js';
import { marketOpenRoundtripPlan, reconcileMarketOpenRoundtrip } from '../src/reconciliation/market-open-reconciliation.js';
import {
  canonicalEvidenceEnvelopeSchema,
} from '../src/evidence/adapters/v2-to-v3.js';
import {
  evidenceEnvelopeSchema as evidenceEnvelopeV2Schema,
  type EvidenceEnvelope as EvidenceEnvelopeV2,
} from '../src/evidence/evidence-v2.js';
import {
  evidenceEnvelopeSchema as evidenceEnvelopeV3Schema,
  type EvidenceEnvelope,
  type Hex,
  type ScannedTransactionRef,
} from '../src/evidence/evidence-v3.js';
import { checkRecordSchema, reconciliationReportSchema } from '../src/reconciliation/schema/check-record.js';

const fixturePath = resolve(
  process.cwd(),
  'fixtures/reconciliation/xt-mkt-open-001-legacy.json.gz.b64',
);
const raw = JSON.parse(gunzipSync(Buffer.from(
  (await readFile(fixturePath, 'utf8')).trim(),
  'base64',
)).toString('utf8')) as unknown;
const evidenceV2 = adaptMarketFlowV1(raw, {
  executionId: '2026-09-02T170938-282Z/XT-MKT-OPEN-001/tx-fork/r0',
});
evidenceEnvelopeV2Schema.parse(evidenceV2);
const evidence = canonicalEvidenceEnvelopeSchema.parse(evidenceV2);
evidenceEnvelopeV3Schema.parse(evidence);
assert.equal(evidenceV2.schemaVersion, 2);
assert.equal(evidence.schemaVersion, 3);
assert.ok(evidence.actions.every((item) => item.schemaVersion === 3));
assert.ok(evidence.actions.filter((item) => item.outcome === 'EXECUTED')
  .every((item) => item.windowContamination?.status === 'NOT_CHECKED'));

const plan = marketOpenRoundtripPlan;
// 核对入口直接接受历史 V2，并在内部正规化到 V3。
const report = reconciliationReportSchema.parse(reconcileMarketOpenRoundtrip(evidenceV2));

// 黄金历史证据：协议核对有充分输入，但没有污染窗口扫描凭证。
assert.equal(report.status, 'PASS_WITH_GAPS');
assert.equal(report.layers['chain-state'], 'PASS');
assert.equal(report.layers['chain-event'], 'PASS');
assert.equal(report.layers.keeper, 'PASS');
assert.equal(report.layers.frontend, 'NOT_RUN');
assert.equal(report.layers.indexer, 'NOT_RUN');
assert.equal(report.layers.cleanup, 'PASS');
assert.equal(report.layers.evidenceIntegrity, 'INCOMPLETE');
assert.deepEqual(report.integrity?.reasons, [
  'TX2: 执行窗口污染检查没有完成；需要 V3 CLEAN/POLLUTED 逐块扫描凭证',
  'TX4: 执行窗口污染检查没有完成；需要 V3 CLEAN/POLLUTED 逐块扫描凭证',
]);
assert.ok(report.checks.length >= 20);
assert.ok(report.checks.every((item) => item.verdict === 'PASS'));
assert.ok(evidence.actions.flatMap((item) => item.transactions).every((transaction) => transaction.explorer === undefined));
assert.ok(evidence.actions.filter((item) => item.outcome === 'EXECUTED')
  .every((item) => item.windowContamination?.status === 'NOT_CHECKED'));
assert.ok(assessEvidenceIntegrity(evidence, report.checks).reasons
  .some((reason) => reason.includes('污染检查没有完成')));

function byId(id: string) {
  const found = report.checks.find((item) => item.id === id);
  assert.ok(found, `缺少核对行 ${id}`);
  return found;
}

function byActionId(actionId: string, id: string) {
  const found = report.checks.find((item) => item.actionId === actionId && item.id === id);
  assert.ok(found, `缺少核对行 ${actionId}/${id}`);
  return found;
}

assert.equal(byId('fee.position.amount').actual.raw, '10010');
assert.equal(byId('fee.position.amount').expected.raw, '10010');
assert.equal(byId('fee.position.amount').verification, 'EVENT_ANCHORED');
assert.equal(byId('fee.position.amount').formula?.inputs.length, 3);
assert.equal(byId('order.create.escrow-trader').formula?.inputs.length, 1);
assert.equal(byId('order.create.escrow-vault').formula?.inputs.length, 1);
assert.equal(byId('position.size-usd').formula?.inputs.length, 2);
assert.equal(byId('market.oi-usd-primary-side').formula?.inputs.length, 1);
assert.equal(byId('position.collateral').formula?.inputs.length, 3);
assert.equal(byId('pricing.execution-price').formula?.inputs.length, 3);
assert.equal(byId('whole.trader-usdc').formula?.inputs.length, 8);
assert.equal(byId('order.create.escrow-trader').expectedDelta?.raw, '-10000000');
assert.equal(byId('order.create.escrow-trader').expectedAfter?.raw, '9990000000');
assert.equal(byId('pricing.execution-price').actual.raw, '2032740628092499');
assert.equal(byId('pricing.execution-price').verification, 'EVENT_ANCHORED');
assert.equal(byId('whole.trader-usdc').actual.raw, '-841204');
assert.equal(byId('whole.trader-usdc').expected.raw, '-841204');
assert.equal(byId('whole.conservation').actual.raw, '0');
assert.equal(byActionId('TX2', 'fee.claimable.position').actualDelta?.raw, '5005');
assert.equal(byActionId('TX2', 'fee.claimable.position').expectedDelta?.raw, '5005');
assert.equal(byActionId('TX4', 'fee.claimable.position').actualDelta?.raw, '12512');
assert.equal(byActionId('TX4', 'fee.claimable.funding').actualDelta?.raw, '30');
assert.equal(byActionId('TX4', 'fee.claimable.funding').expectedDelta?.raw, '30');
assert.equal(byActionId('TX4', 'fee.claimable.liquidation').actualDelta?.raw, '0');
assert.equal(byActionId('TX4', 'fee.handler-token-balance').actualDelta?.raw, '0');
assert.equal(byActionId('TX4', 'fee.claimable.position').verification, 'EVENT_ANCHORED');
assert.equal(byActionId('TX4', 'fee.claimable.funding').verification, 'EVENT_ANCHORED');

const formulaRows = report.checks.filter((item) => item.formula);
assert.ok(formulaRows.every((item) => item.formula?.inputs.every((input) => input.name && input.source.path)));
assert.ok(formulaRows.filter((item) => item.verification === 'FULL_RECOMPUTE')
  .every((item) => (item.formula?.inputs.length ?? 0) > 0));
const conservationRows = formulaRows.filter((item) => item.formula?.id === 'ledger.usdc-five-party-conservation');
assert.equal(conservationRows.length, 5);
assert.ok(conservationRows.every((item) => item.formula?.inputs.length === 15));

// Schema guard：带公式的 FULL_RECOMPUTE 不允许空输入；这是框架错误而不是 PASS。
const feeRow = byId('fee.position.amount');
assert.ok(feeRow.formula);
assert.throws(() => checkRecordSchema.parse({
  ...feeRow,
  verification: 'FULL_RECOMPUTE',
  formula: { ...feeRow.formula, inputs: [] },
}), /FormulaInput/);

function syntheticBlockHash(blockNumber: string): Hex {
  return `0x${BigInt(blockNumber).toString(16).padStart(64, '0')}` as Hex;
}

function scannedTransaction(
  transaction: EvidenceEnvelope['actions'][number]['transactions'][number],
): ScannedTransactionRef {
  assert.ok(transaction.blockHash, `${transaction.txHash} 缺少 blockHash`);
  assert.ok(transaction.nonce, `${transaction.txHash} 缺少 nonce`);
  return {
    txHash: transaction.txHash,
    blockNumber: transaction.blockNumber,
    blockHash: transaction.blockHash,
    transactionIndex: '0',
    actor: transaction.actor,
    ...(transaction.to ? { to: transaction.to } : {}),
    nonce: transaction.nonce,
    ...(transaction.transactionType ? { transactionType: transaction.transactionType } : {}),
    role: transaction.role,
  };
}

// 给黄金事实构造一份完整的 V3 扫描测试凭证；它只验证契约，不冒充历史运行真的保存过扫描结果。
function withContaminationStatus(source: EvidenceEnvelope, status: 'CLEAN' | 'POLLUTED'): EvidenceEnvelope {
  const cloned = structuredClone(source);
  const candidate = {
    ...cloned,
    actions: cloned.actions.map((item) => {
      if (item.outcome !== 'EXECUTED') return item;
      const transaction = item.transactions[0];
      const before = item.snapshots.find((snapshot) => snapshot.kind === 'execution-before');
      assert.ok(transaction && before);
      const fromBlock = before.blockNumber;
      const toBlock = transaction.blockNumber;
      const relevantTransactions = cloned.actions
        .flatMap((action) => action.transactions)
        .filter((candidateTransaction) => BigInt(candidateTransaction.blockNumber) >= BigInt(fromBlock)
          && BigInt(candidateTransaction.blockNumber) <= BigInt(toBlock))
        .map(scannedTransaction)
        .map((candidateTransaction, index, all) => ({
          ...candidateTransaction,
          transactionIndex: all
            .slice(0, index)
            .filter((previous) => previous.blockNumber === candidateTransaction.blockNumber)
            .length.toString() as `${bigint}`,
        }));
      const blockHash = (blockNumber: string): Hex => cloned.actions
        .flatMap((candidateAction) => candidateAction.transactions)
        .find((candidateTransaction) => candidateTransaction.blockNumber === blockNumber)?.blockHash
        ?? syntheticBlockHash(blockNumber);
      const external = {
        txHash: `0x${`${BigInt(toBlock).toString(16)}ee`.padStart(64, 'e').slice(-64)}` as Hex,
        blockNumber: toBlock,
        blockHash: blockHash(toBlock),
        actor: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' as const,
        transactionIndex: '999' as const,
        nonce: '999' as const,
      } satisfies ScannedTransactionRef;
      const inspectedTransactions = status === 'POLLUTED'
        ? [...relevantTransactions, external]
        : relevantTransactions;
      const inspectedBlocks = Array.from(
        { length: Number(BigInt(toBlock) - BigInt(fromBlock) + 1n) },
        (_, index) => (BigInt(fromBlock) + BigInt(index)).toString(),
      ).map((blockNumber) => ({
        blockNumber: blockNumber as `${bigint}`,
        blockHash: blockHash(blockNumber),
        parentHash: blockHash((BigInt(blockNumber) - 1n).toString()),
        transactionHashes: inspectedTransactions
          .filter((scanned) => scanned.blockNumber === blockNumber)
          .map((scanned) => scanned.txHash),
      }));
      return {
        ...item,
        snapshots: item.snapshots.map((snapshot) => (
          snapshot.kind === 'execution-before' || snapshot.kind === 'execution-after'
            ? { ...snapshot, blockHash: blockHash(snapshot.blockNumber) }
            : snapshot
        )),
        windowContamination: {
          status,
          fromBlock,
          toBlock,
          inspectedBlocks,
          inspectedTransactions,
          unexpectedTransactions: status === 'POLLUTED' ? [external] : [],
          source: {
            source: 'block-scan',
            path: `eth_getBlockByNumber(${fromBlock}..${toBlock}, true)`,
            blockNumber: toBlock,
          },
        },
      };
    }),
  };
  return evidenceEnvelopeV3Schema.parse(candidate) as EvidenceEnvelope;
}

const credentialed = withContaminationStatus(evidence, 'CLEAN');
const credentialedChecks = runCheckPlan(credentialed, plan);
const credentialedReport = aggregateReport(credentialed, credentialedChecks, plan);
assert.equal(credentialedReport.layers.evidenceIntegrity, 'PASS');
assert.deepEqual(credentialedReport.integrity?.reasons, []);
assert.equal(credentialedReport.layers.frontend, 'NOT_RUN');
assert.equal(credentialedReport.layers.indexer, 'NOT_RUN');
assert.equal(credentialedReport.status, 'PASS');

// NOT_APPLICABLE 与 NOT_RUN 一样不构成 gap。
const notApplicableFrontend = checkRecordSchema.parse({
  id: 'frontend.not-applicable', packId: 'test.aggregate', actionId: 'WHOLE', purpose: 'whole-flow',
  subject: 'frontend', comparison: 'presence', actual: { raw: 'n/a' }, expected: { raw: 'n/a' },
  sources: [{ layer: 'derived', path: 'test.not-applicable' }],
  verification: 'PRESENCE', severity: 'warning', verdict: 'NOT_APPLICABLE',
});
const notApplicablePlan = {
  ...plan,
  packs: [
    ...plan.packs,
    {
      id: 'test.aggregate',
      version: '1',
      requiredCapabilities: [],
      run: () => [notApplicableFrontend],
    },
  ],
} satisfies CheckPlan;
const notApplicableChecks = runCheckPlan(credentialed, notApplicablePlan);
const notApplicableReport = aggregateReport(credentialed, notApplicableChecks, notApplicablePlan);
assert.equal(notApplicableReport.layers.frontend, 'NOT_APPLICABLE');
assert.equal(notApplicableReport.status, 'PASS');

// 反向破坏 1：状态被篡改时必须 FAIL，不能信旧 checks[].passed。
const brokenState = structuredClone(evidence);
const tx2 = brokenState.actions.find((item) => item.actionId === 'TX2');
assert.ok(tx2);
const afterOpen = tx2.snapshots.find((item) => item.kind === 'execution-after');
assert.ok(afterOpen);
const position = (afterOpen.values as Record<string, unknown>).position as Record<string, unknown>;
position.sizeInUsd = (BigInt(String(position.sizeInUsd)) + 1n).toString();
const brokenStateReport = aggregateReport(brokenState, runCheckPlan(brokenState, plan), plan);
assert.equal(brokenStateReport.checks.find((item) => item.id === 'position.size-usd')?.verdict, 'FAIL');
assert.equal(brokenStateReport.status, 'FAIL');

// 反向破坏 2：能力声明缺失必须显式 NOT_VERIFIED。
const missingCapability = {
  ...structuredClone(evidence),
  capabilities: evidence.capabilities.filter((item) => item !== 'fee'),
};
const missingChecks = runCheckPlan(missingCapability, plan);
assert.ok(missingChecks.some((item) => item.verdict === 'NOT_VERIFIED' && item.id.endsWith('.capability')));

// 反向破坏 3：CheckPack 必需原始字段缺失必须成为 NOT_VERIFIED，并降低 Integrity。
const missingRawInput = structuredClone(evidence);
const missingInputTx2 = missingRawInput.actions.find((item) => item.actionId === 'TX2');
assert.ok(missingInputTx2);
const feeEvent = missingInputTx2.events.find((item) => item.name === 'PositionFeesCollected');
assert.ok(feeEvent);
const feeArgs = feeEvent.args as Record<string, unknown>;
delete (feeArgs.uint as Record<string, unknown>).positionFeeFactor;
const missingInputChecks = runCheckPlan(missingRawInput, plan);
assert.ok(missingInputChecks.some((item) => item.verdict === 'NOT_VERIFIED'
  && item.id.includes('required-input.TX2.PositionFeesCollected.uint.positionFeeFactor')));
const missingInputReport = aggregateReport(missingRawInput, missingInputChecks, plan);
assert.equal(missingInputReport.layers.evidenceIntegrity, 'INCOMPLETE');
assert.equal(missingInputReport.status, 'PASS_WITH_GAPS');

// Claimable 快照字段不能静默省略：缺读数必须由 fee.claimable pack 产出 NOT_VERIFIED。
const missingClaimable = structuredClone(evidence);
const claimableTx2 = missingClaimable.actions.find((item) => item.actionId === 'TX2');
assert.ok(claimableTx2);
const claimableAfter = claimableTx2.snapshots.find((item) => item.kind === 'execution-after');
assert.ok(claimableAfter);
delete (claimableAfter.values as Record<string, unknown>).claimableFeeAmountPosition;
const missingClaimableChecks = runCheckPlan(missingClaimable, plan);
assert.ok(missingClaimableChecks.some((item) => item.verdict === 'NOT_VERIFIED'
  && item.id.includes('fee.claimable.required-input.TX2.after.claimableFeeAmountPosition')));
const missingClaimableReport = aggregateReport(missingClaimable, missingClaimableChecks, plan);
assert.equal(missingClaimableReport.layers['chain-state'], 'INCOMPLETE');
assert.equal(missingClaimableReport.layers.evidenceIntegrity, 'INCOMPLETE');
assert.equal(missingClaimableReport.status, 'PASS_WITH_GAPS');

// 反向破坏 4：POLLUTED 是证据无效，不得聚合为 PASS。
const polluted = withContaminationStatus(evidence, 'POLLUTED');
const pollutedReport = aggregateReport(polluted, report.checks);
assert.equal(pollutedReport.layers.evidenceIntegrity, 'FAIL');
assert.equal(pollutedReport.status, 'INVALID_EVIDENCE');

// 反向破坏 5：缺失权威 Before/After 不得 Integrity PASS。
const missingBefore = {
  ...structuredClone(evidence),
  actions: evidence.actions.map((item) => item.actionId === 'TX2'
    ? { ...structuredClone(item), snapshots: item.snapshots.filter((snapshot) => snapshot.kind !== 'execution-before') }
    : structuredClone(item)),
} as EvidenceEnvelope;
const missingBeforeReport = aggregateReport(missingBefore, report.checks);
assert.equal(missingBeforeReport.layers.evidenceIntegrity, 'INCOMPLETE');
assert.notEqual(missingBeforeReport.status, 'PASS');

// 反向破坏 6：After 与 Keeper 交易块不一致时证据无效。
const mismatchedAfter = {
  ...structuredClone(evidence),
  actions: evidence.actions.map((item) => {
    if (item.actionId !== 'TX2') return structuredClone(item);
    const transactionBlock = BigInt(item.transactions[0]?.blockNumber ?? '0');
    return {
      ...structuredClone(item),
      snapshots: item.snapshots.map((snapshot) => snapshot.kind === 'execution-before'
        ? { ...snapshot, blockNumber: transactionBlock.toString() as `${bigint}` }
        : snapshot.kind === 'execution-after'
          ? { ...snapshot, blockNumber: (transactionBlock + 1n).toString() as `${bigint}` }
          : snapshot),
    };
  }),
} as EvidenceEnvelope;
const mismatchedAfterReport = aggregateReport(mismatchedAfter, report.checks);
assert.equal(mismatchedAfterReport.layers.evidenceIntegrity, 'FAIL');
assert.equal(mismatchedAfterReport.status, 'INVALID_EVIDENCE');

// 前端口保持独立：RPC 用例为 NOT_RUN；声明 frontend 但尚无前端核对行为 INCOMPLETE。
const declaredFrontend = {
  ...structuredClone(evidence),
  capabilities: [...evidence.capabilities, 'frontend' as const],
};
const frontendGapReport = aggregateReport(declaredFrontend, runCheckPlan(declaredFrontend, plan), plan);
assert.equal(frontendGapReport.layers.frontend, 'INCOMPLETE');
assert.equal(frontendGapReport.status, 'PASS_WITH_GAPS');

// Collector 局部读错不得被其余可读字段掩盖为证据完整。
const snapshotReadError = {
  ...structuredClone(evidence),
  actions: evidence.actions.map((item, actionIndex) => actionIndex === 0 ? {
    ...structuredClone(item),
    snapshots: item.snapshots.map((snapshot, snapshotIndex) => snapshotIndex === 0
      ? { ...snapshot, readErrors: ['reader probe failed'] }
      : snapshot),
  } : structuredClone(item)),
} as EvidenceEnvelope;
const readErrorReport = aggregateReport(snapshotReadError, runCheckPlan(snapshotReadError, plan), plan);
assert.equal(readErrorReport.layers.evidenceIntegrity, 'INCOMPLETE');
assert.ok(assessEvidenceIntegrity(snapshotReadError, readErrorReport.checks).reasons
  .some((reason) => reason.includes('readErrors')));

console.log(`Reconciliation V2 replay: PASS (historical=${report.status}, credentialed=${credentialedReport.status}, checks=${report.checks.length})`);

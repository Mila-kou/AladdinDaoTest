import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

import {
  adaptEvidenceV2ToV3,
  canonicalEvidenceEnvelopeSchema,
} from '../src/evidence/adapters/v2-to-v3.js';
import {
  evidenceEnvelopeSchema as evidenceEnvelopeV2Schema,
  type EvidenceEnvelope as EvidenceEnvelopeV2,
} from '../src/evidence/evidence-v2.js';
import {
  actionEvidenceSchema as actionEvidenceV3Schema,
  decimalStringSchema,
  environmentIdentitySchema,
  evidenceEnvelopeSchema as evidenceEnvelopeV3Schema,
  evidenceProvenanceRefSchema,
  nonNegativeDecimalStringSchema,
  scannedBlockRefSchema,
  scannedTransactionRefSchema,
  snapshotRefSchema,
  transactionRefSchema,
  type EvidenceEnvelope,
  type Hex,
  type ScannedTransactionRef,
  type TransactionRef,
} from '../src/evidence/evidence-v3.js';
import {
  requireExecutionTransaction,
  resolveExecutionTransaction,
} from '../src/evidence/execution-transaction.js';
import { adaptMarketFlowV1 } from '../src/reconciliation/adapters/market-flow-v1.js';
import { aggregateReport, assessEvidenceIntegrity } from '../src/reconciliation/engine/aggregate-verdicts.js';
import { runCheckPlan } from '../src/reconciliation/engine/check-engine.js';
import {
  createMarketOpenRoundtripPlan,
  marketOpenRoundtripPlan,
} from '../src/reconciliation/market-open-reconciliation.js';

const fixturePath = resolve(
  process.cwd(),
  'fixtures/reconciliation/xt-mkt-open-001-legacy.json.gz.b64',
);
const raw = JSON.parse(gunzipSync(Buffer.from(
  (await readFile(fixturePath, 'utf8')).trim(),
  'base64',
)).toString('utf8')) as unknown;
const evidenceV2 = adaptMarketFlowV1(raw, { executionId: 'v3-contract-verification' });
const canonical = adaptEvidenceV2ToV3(evidenceV2);

function blockHash(blockNumber: string): Hex {
  return `0x${BigInt(blockNumber).toString(16).padStart(64, '0')}` as Hex;
}

function asScanned(
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

function externalTransaction(blockNumber: string, containingBlockHash: Hex, salt = 0): ScannedTransactionRef {
  const suffix = (BigInt(blockNumber) + BigInt(salt)).toString(16).padStart(8, '0').slice(-8);
  return {
    txHash: `0x${'e'.repeat(56)}${suffix}` as Hex,
    blockNumber: blockNumber as `${bigint}`,
    blockHash: containingBlockHash,
    transactionIndex: (900 + salt).toString() as `${bigint}`,
    actor: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    nonce: (1000 + salt).toString() as `${bigint}`,
  };
}

function additionalKnownTransaction(
  template: TransactionRef,
  role: TransactionRef['role'],
  nibble: string,
): TransactionRef {
  const { orderKey: _orderKey, explorer: _explorer, ...base } = template;
  const txHash = `0x${nibble.repeat(64)}` as Hex;
  return {
    ...base,
    txHash,
    actor: `0x${nibble.repeat(40)}` as TransactionRef['actor'],
    nonce: '0',
    role,
    ...(template.receipt ? { receipt: { ...template.receipt, transactionHash: txHash } } : {}),
  };
}

function withCompletedWindows(source: EvidenceEnvelope, status: 'CLEAN' | 'POLLUTED'): EvidenceEnvelope {
  const cloned = structuredClone(source);
  const candidate = {
    ...cloned,
    actions: cloned.actions.map((action) => {
      if (!['EXECUTED', 'CANCELLED', 'FROZEN'].includes(action.outcome)) return action;
      const transaction = requireExecutionTransaction(action);
      const before = action.snapshots.find((snapshot) => snapshot.kind === 'execution-before');
      assert.ok(transaction && before);
      const fromBlock = before.blockNumber;
      const toBlock = transaction.blockNumber;
      const expectedTransactions = cloned.actions
        .flatMap((candidateAction) => candidateAction.transactions)
        .filter((candidateTransaction) => BigInt(candidateTransaction.blockNumber) >= BigInt(fromBlock)
          && BigInt(candidateTransaction.blockNumber) <= BigInt(toBlock))
        .map(asScanned)
        .map((candidateTransaction, index, all) => ({
          ...candidateTransaction,
          transactionIndex: all
            .slice(0, index)
            .filter((previous) => previous.blockNumber === candidateTransaction.blockNumber)
            .length.toString() as `${bigint}`,
        }));
      const hashForBlock = (number: string): Hex => cloned.actions
        .flatMap((candidateAction) => candidateAction.transactions)
        .find((candidateTransaction) => candidateTransaction.blockNumber === number)?.blockHash
        ?? blockHash(number);
      const external = externalTransaction(toBlock, hashForBlock(toBlock));
      const inspectedTransactions = status === 'POLLUTED'
        ? [...expectedTransactions, external]
        : expectedTransactions;
      const inspectedBlocks = Array.from(
        { length: Number(BigInt(toBlock) - BigInt(fromBlock) + 1n) },
        (_, index) => (BigInt(fromBlock) + BigInt(index)).toString(),
      ).map((number) => ({
        blockNumber: number as `${bigint}`,
        blockHash: hashForBlock(number),
        parentHash: hashForBlock((BigInt(number) - 1n).toString()),
        transactionHashes: inspectedTransactions
          .filter((candidateTransaction) => candidateTransaction.blockNumber === number)
          .map((candidateTransaction) => candidateTransaction.txHash),
      }));
      return {
        ...action,
        snapshots: action.snapshots.map((snapshot) => (
          snapshot.kind === 'execution-before' || snapshot.kind === 'execution-after'
            ? { ...snapshot, blockHash: hashForBlock(snapshot.blockNumber) }
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
            path: `eth_getBlockByNumber(${fromBlock}..${toBlock},true)`,
            blockNumber: toBlock,
          },
        },
      };
    }),
  };
  return evidenceEnvelopeV3Schema.parse(candidate) as EvidenceEnvelope;
}

type MutableWindow = {
  status: string;
  fromBlock?: string;
  toBlock?: string;
  inspectedBlocks?: Array<{
    blockNumber: string;
    blockHash: string;
    parentHash: string;
    transactionHashes: string[];
  }>;
  inspectedTransactions?: Array<Record<string, unknown>>;
  unexpectedTransactions?: Array<Record<string, unknown>>;
  source?: Record<string, unknown>;
  legacyClaim?: Record<string, unknown>;
  note?: string;
};

function mutateFirstExecution(
  source: EvidenceEnvelope,
  mutate: (window: MutableWindow) => void,
): EvidenceEnvelope {
  const candidate = structuredClone(source) as unknown as {
    actions: Array<{ outcome: string; windowContamination?: MutableWindow }>;
  };
  const action = candidate.actions.find((item) => ['EXECUTED', 'CANCELLED', 'FROZEN'].includes(item.outcome));
  assert.ok(action?.windowContamination);
  mutate(action.windowContamination);
  return candidate as unknown as EvidenceEnvelope;
}

const clean = withCompletedWindows(canonical, 'CLEAN');
const cleanChecks = runCheckPlan(clean, marketOpenRoundtripPlan);
const cleanReport = aggregateReport(clean, cleanChecks, marketOpenRoundtripPlan);
assert.equal(cleanReport.layers.evidenceIntegrity, 'PASS');
assert.equal(cleanReport.status, 'PASS');

// The CheckPlan result is authoritative. A caller cannot omit rows or submit a
// hand-crafted PASS subset and have Aggregate trust that external conclusion.
const callerForgedPassChecks = cleanChecks.slice(0, 1).map((check) => ({
  ...check,
  actual: check.expected,
  verification: 'PRESENCE' as const,
  verdict: 'PASS' as const,
}));
for (const suppliedChecks of [[], callerForgedPassChecks]) {
  const reboundReport = aggregateReport(clean, suppliedChecks, marketOpenRoundtripPlan);
  assert.equal(reboundReport.status, 'INVALID_EVIDENCE');
  assert.ok(reboundReport.integrity?.reasons.some((reason) => (
    reason.includes('调用方传入的 checks 与可信 CheckPlan')
  )));
  assert.deepEqual(reboundReport.checks, cleanChecks);
}

// Evidence cannot rewrite the trusted flow/action contract while retaining a
// green business check result. Type, purpose, and flow are bound separately.
const planTypeTamper = evidenceEnvelopeV3Schema.parse({
  ...structuredClone(clean),
  actions: clean.actions.map((action) => action.actionId === 'TX3'
    ? { ...action, type: 'submitMarketIncrease' }
    : action),
}) as EvidenceEnvelope;
const planTypeTamperReport = aggregateReport(
  planTypeTamper,
  runCheckPlan(planTypeTamper, marketOpenRoundtripPlan),
  marketOpenRoundtripPlan,
);
assert.equal(planTypeTamperReport.status, 'INVALID_EVIDENCE');
assert.ok(planTypeTamperReport.integrity?.reasons.some((reason) => (
  reason.includes('actions[2].type 期望 submitMarketDecrease')
)));

const planPurposeTamper = evidenceEnvelopeV3Schema.parse({
  ...structuredClone(clean),
  actions: clean.actions.map((action) => action.actionId === 'TX2'
    ? { ...action, purpose: 'cleanup' }
    : action),
}) as EvidenceEnvelope;
const planPurposeTamperReport = aggregateReport(
  planPurposeTamper,
  runCheckPlan(planPurposeTamper, marketOpenRoundtripPlan),
  marketOpenRoundtripPlan,
);
assert.equal(planPurposeTamperReport.status, 'INVALID_EVIDENCE');
assert.ok(planPurposeTamperReport.integrity?.reasons.some((reason) => (
  reason.includes('actions[1].purpose 期望 primary')
)));

const planFlowTamper = evidenceEnvelopeV3Schema.parse({
  ...structuredClone(clean),
  flowType: 'multi-phase',
}) as EvidenceEnvelope;
const planFlowTamperReport = aggregateReport(
  planFlowTamper,
  runCheckPlan(planFlowTamper, marketOpenRoundtripPlan),
  marketOpenRoundtripPlan,
);
assert.equal(planFlowTamperReport.status, 'INVALID_EVIDENCE');
assert.ok(planFlowTamperReport.integrity?.reasons.some((reason) => (
  reason.includes('flowType 期望 roundtrip，实际 multi-phase')
)));

// Capabilities are evidence provenance, not feature flags a producer may turn
// off to skip checks. Envelope/action downgrades remain blocking when facts exist.
const envelopeCapabilityDowngrade = evidenceEnvelopeV3Schema.parse({
  ...structuredClone(clean),
  capabilities: clean.capabilities.filter((capability) => capability !== 'keeper'),
}) as EvidenceEnvelope;
const envelopeCapabilityDowngradeReport = aggregateReport(
  envelopeCapabilityDowngrade,
  runCheckPlan(envelopeCapabilityDowngrade, marketOpenRoundtripPlan),
  marketOpenRoundtripPlan,
);
assert.equal(envelopeCapabilityDowngradeReport.status, 'INVALID_EVIDENCE');
assert.ok(envelopeCapabilityDowngradeReport.integrity?.reasons.some((reason) => (
  reason.includes('action.capabilities 未覆盖')
  || reason.includes('Envelope.capabilities 未覆盖')
)));

const actionCapabilityDowngrade = evidenceEnvelopeV3Schema.parse({
  ...structuredClone(clean),
  actions: clean.actions.map((action) => action.actionId === 'TX2'
    ? { ...action, capabilities: action.capabilities.filter((capability) => capability !== 'keeper') }
    : action),
}) as EvidenceEnvelope;
const actionCapabilityDowngradeReport = aggregateReport(
  actionCapabilityDowngrade,
  runCheckPlan(actionCapabilityDowngrade, marketOpenRoundtripPlan),
  marketOpenRoundtripPlan,
);
assert.equal(actionCapabilityDowngradeReport.status, 'INVALID_EVIDENCE');
assert.ok(actionCapabilityDowngradeReport.integrity?.reasons.some((reason) => (
  reason.includes('已携带 keeper 原始事实，但 action.capabilities 未声明')
)));

// V2 remains frozen; the new block-scan shape and role omission are V3-only.
assert.equal(evidenceEnvelopeV2Schema.safeParse(evidenceV2).success, true);
assert.equal(canonicalEvidenceEnvelopeSchema.parse(evidenceV2).schemaVersion, 3);
const invalidV2Role = structuredClone(evidenceV2) as unknown as {
  actions: Array<{ transactions: Array<{ role: string }> }>;
};
assert.ok(invalidV2Role.actions[0]?.transactions[0]);
invalidV2Role.actions[0].transactions[0].role = 'external';
assert.equal(evidenceEnvelopeV2Schema.safeParse(invalidV2Role).success, false);
assert.equal(canonicalEvidenceEnvelopeSchema.safeParse({ ...evidenceV2, schemaVersion: 99 }).success, false);

// V2's persisted grammar stays readable. The adapter canonicalizes its formerly
// accepted leading-zero quantities before validating the strict V3 projection.
const nonCanonicalLegacy = structuredClone(evidenceV2) as unknown as {
  actions: Array<{
    transactions: Array<{
      txHash: string;
      blockNumber: string;
      gasUsed: string;
      nonce?: string;
      receipt?: { blockNumber: string; gasUsed: string };
    }>;
  }>;
};
const nonCanonicalLegacyTransaction = nonCanonicalLegacy.actions
  .flatMap((action) => action.transactions)[0];
assert.ok(nonCanonicalLegacyTransaction);
nonCanonicalLegacyTransaction.blockNumber = `00${nonCanonicalLegacyTransaction.blockNumber}`;
nonCanonicalLegacyTransaction.gasUsed = `00${nonCanonicalLegacyTransaction.gasUsed}`;
nonCanonicalLegacyTransaction.nonce = '0007';
if (nonCanonicalLegacyTransaction.receipt) {
  nonCanonicalLegacyTransaction.receipt.blockNumber = nonCanonicalLegacyTransaction.blockNumber;
  nonCanonicalLegacyTransaction.receipt.gasUsed = nonCanonicalLegacyTransaction.gasUsed;
}
assert.equal(evidenceEnvelopeV2Schema.safeParse(nonCanonicalLegacy).success, true);
const canonicalizedLegacy = canonicalEvidenceEnvelopeSchema.parse(nonCanonicalLegacy);
const canonicalizedLegacyTransaction = canonicalizedLegacy.actions
  .flatMap((action) => action.transactions)
  .find((transaction) => transaction.txHash === nonCanonicalLegacyTransaction.txHash);
assert.ok(canonicalizedLegacyTransaction);
assert.equal(canonicalizedLegacyTransaction.blockNumber, BigInt(nonCanonicalLegacyTransaction.blockNumber).toString());
assert.equal(canonicalizedLegacyTransaction.gasUsed, BigInt(nonCanonicalLegacyTransaction.gasUsed).toString());
assert.equal(canonicalizedLegacyTransaction.nonce, '7');

const negativeLegacy = structuredClone(evidenceV2) as unknown as {
  actions: Array<{ transactions: Array<{ gasUsed: string; receipt?: { gasUsed: string } }> }>;
};
const negativeLegacyTransaction = negativeLegacy.actions.flatMap((action) => action.transactions)[0];
assert.ok(negativeLegacyTransaction);
negativeLegacyTransaction.gasUsed = '-1';
if (negativeLegacyTransaction.receipt) negativeLegacyTransaction.receipt.gasUsed = '-1';
assert.equal(evidenceEnvelopeV2Schema.safeParse(negativeLegacy).success, true);
assert.equal(canonicalEvidenceEnvelopeSchema.safeParse(negativeLegacy).success, false);

// V3 Action transaction still rejects external, while an unknown scanned transaction omits role honestly.
const invalidV3ActionRole = structuredClone(clean) as unknown as {
  actions: Array<{ transactions: Array<{ role: string }> }>;
};
assert.ok(invalidV3ActionRole.actions[0]?.transactions[0]);
invalidV3ActionRole.actions[0].transactions[0].role = 'external';
assert.equal(evidenceEnvelopeV3Schema.safeParse(invalidV3ActionRole).success, false);
const firstCleanWindow = clean.actions.find((item) => item.windowContamination?.status === 'CLEAN')?.windowContamination;
assert.ok(firstCleanWindow?.status === 'CLEAN');
const unknownScanned = externalTransaction(firstCleanWindow.toBlock, firstCleanWindow.inspectedBlocks.at(-1)!.blockHash);
assert.equal(scannedTransactionRefSchema.safeParse(unknownScanned).success, true);
assert.equal(unknownScanned.role, undefined);

// V3 is an exact evidence contract. Structural objects reject unknown keys at
// every carrier boundary instead of accepting and silently stripping them.
assert.equal(evidenceEnvelopeV3Schema.safeParse({ ...clean, undeclaredEnvelopeField: true }).success, false);
assert.equal(environmentIdentitySchema.safeParse({ ...clean.environment, undeclaredEnvironmentField: true }).success, false);
assert.equal(actionEvidenceV3Schema.safeParse({ ...clean.actions[0]!, undeclaredActionField: true }).success, false);
const strictTransaction = clean.actions.flatMap((action) => action.transactions)[0];
const strictSnapshot = clean.actions.flatMap((action) => action.snapshots)[0];
assert.ok(strictTransaction && strictSnapshot);
assert.equal(transactionRefSchema.safeParse({ ...strictTransaction, undeclaredTransactionField: true }).success, false);
assert.ok(strictTransaction.receipt);
assert.equal(transactionRefSchema.safeParse({
  ...strictTransaction,
  receipt: { ...strictTransaction.receipt, undeclaredReceiptField: true },
}).success, false);
assert.equal(snapshotRefSchema.safeParse({ ...strictSnapshot, undeclaredSnapshotField: true }).success, false);
assert.equal(evidenceProvenanceRefSchema.safeParse({
  source: 'block-scan',
  path: 'strict-provenance',
  undeclaredSourceField: true,
}).success, false);
assert.equal(scannedBlockRefSchema.safeParse({
  ...firstCleanWindow.inspectedBlocks[0]!,
  undeclaredBlockField: true,
}).success, false);
assert.equal(scannedTransactionRefSchema.safeParse({
  ...firstCleanWindow.inspectedTransactions[0]!,
  undeclaredScannedTransactionField: true,
}).success, false);
assert.ok(clean.environment.fork && clean.environment.market);
assert.equal(environmentIdentitySchema.safeParse({
  ...clean.environment,
  fork: { ...clean.environment.fork, undeclaredForkField: true },
}).success, false);
assert.equal(environmentIdentitySchema.safeParse({
  ...clean.environment,
  market: { ...clean.environment.market, undeclaredMarketField: true },
}).success, false);

const unknownWindowSource = mutateFirstExecution(clean, (window) => {
  assert.ok(window.source);
  window.source.undeclaredWindowSourceField = true;
});
assert.equal(evidenceEnvelopeV3Schema.safeParse(unknownWindowSource).success, false);

const unknownLegacyRawWindow = structuredClone(canonical) as unknown as {
  actions: Array<{
    windowContamination?: {
      legacyClaim?: { rawWindow: Record<string, unknown> };
    };
  }>;
};
const legacyWindow = unknownLegacyRawWindow.actions
  .map((action) => action.windowContamination)
  .find((window) => window?.legacyClaim);
assert.ok(legacyWindow?.legacyClaim);
legacyWindow.legacyClaim.rawWindow.undeclaredLegacyField = true;
assert.equal(evidenceEnvelopeV3Schema.safeParse(unknownLegacyRawWindow).success, false);

const duplicateActionId = structuredClone(clean);
assert.ok(duplicateActionId.actions[0] && duplicateActionId.actions[1]);
duplicateActionId.actions[1].actionId = duplicateActionId.actions[0].actionId;
assert.equal(evidenceEnvelopeV3Schema.safeParse(duplicateActionId).success, false);

const nonContiguousSequence = structuredClone(clean);
assert.ok(nonContiguousSequence.actions[1]);
nonContiguousSequence.actions[1].sequence = 99;
assert.equal(evidenceEnvelopeV3Schema.safeParse(nonContiguousSequence).success, false);

const outOfOrderActions = structuredClone(clean);
assert.ok(outOfOrderActions.actions[0] && outOfOrderActions.actions[1]);
[outOfOrderActions.actions[0], outOfOrderActions.actions[1]] = [
  outOfOrderActions.actions[1],
  outOfOrderActions.actions[0],
];
assert.equal(evidenceEnvelopeV3Schema.safeParse(outOfOrderActions).success, false);

const duplicateTransactionHash = structuredClone(clean);
const transactionRefs = duplicateTransactionHash.actions.flatMap((action) => action.transactions);
assert.ok(transactionRefs[0] && transactionRefs[1]);
transactionRefs[1].txHash = `0x${transactionRefs[0].txHash.slice(2).toUpperCase()}`;
assert.equal(evidenceEnvelopeV3Schema.safeParse(duplicateTransactionHash).success, false);

const pollutedLegacyClaimOnClean = mutateFirstExecution(clean, (window) => {
  window.legacyClaim = {
    schemaVersion: 2,
    status: 'POLLUTED',
    rawWindow: { status: 'POLLUTED' },
  };
});
assert.equal(evidenceEnvelopeV3Schema.safeParse(pollutedLegacyClaimOnClean).success, false);

// DecimalString text is canonical, and EVM coordinates/quantities are also
// non-negative. These checks close the previously schema-valid negative chain.
for (const invalid of ['001', '-02', '-0', '+1']) {
  assert.equal(decimalStringSchema.safeParse(invalid).success, false, `应拒绝非规范十进制 ${invalid}`);
}
for (const valid of ['0', '1', '-1', '9007199254740993']) {
  assert.equal(decimalStringSchema.safeParse(valid).success, true, `应接受规范十进制 ${valid}`);
}
for (const invalid of ['-1', '01', '-0', '+1']) {
  assert.equal(nonNegativeDecimalStringSchema.safeParse(invalid).success, false, `应拒绝链上数量 ${invalid}`);
}
for (const valid of ['0', '1', '9007199254740993']) {
  assert.equal(nonNegativeDecimalStringSchema.safeParse(valid).success, true, `应接受链上数量 ${valid}`);
}
for (const invalidTransaction of [
  { ...strictTransaction, blockNumber: '-1' },
  { ...strictTransaction, gasUsed: '-1' },
  { ...strictTransaction, nonce: '-1' },
  { ...strictTransaction, gasUsed: '001' },
]) {
  assert.equal(transactionRefSchema.safeParse(invalidTransaction).success, false);
}
for (const invalidScan of [
  { ...unknownScanned, blockNumber: '-1' },
  { ...unknownScanned, nonce: '-1' },
  { ...unknownScanned, transactionIndex: '-1' },
  { ...unknownScanned, transactionIndex: '001' },
]) {
  assert.equal(scannedTransactionRefSchema.safeParse(invalidScan).success, false);
}

// A legacy V2 CLEAN claim cannot be promoted because V2 did not record per-block coverage.
const legacyClean = structuredClone(evidenceV2) as EvidenceEnvelopeV2;
const legacyCleanClaim = {
  ...legacyClean,
  actions: legacyClean.actions.map((action) => ['EXECUTED', 'CANCELLED', 'FROZEN'].includes(action.outcome)
    ? {
      ...action,
      windowContamination: {
        status: 'CLEAN' as const,
        fromBlock: action.windowContamination?.fromBlock,
        toBlock: action.transactions[0]?.blockNumber,
        inspectedTransactions: action.transactions,
        unexpectedTransactions: [],
        source: { source: 'block-scan' as const, path: 'legacy-scan' },
      },
    }
    : action),
};
const migratedLegacyClean = adaptEvidenceV2ToV3(evidenceEnvelopeV2Schema.parse(legacyCleanClaim) as EvidenceEnvelopeV2);
assert.ok(migratedLegacyClean.actions.filter((item) => ['EXECUTED', 'CANCELLED', 'FROZEN'].includes(item.outcome))
  .every((item) => item.windowContamination?.status === 'NOT_CHECKED'));
assert.ok(migratedLegacyClean.actions.filter((item) => ['EXECUTED', 'CANCELLED', 'FROZEN'].includes(item.outcome))
  .every((item) => item.windowContamination?.status === 'NOT_CHECKED'
    && item.windowContamination.legacyClaim?.status === 'CLEAN'));
assert.ok(migratedLegacyClean.actions.filter((item) => ['EXECUTED', 'CANCELLED', 'FROZEN'].includes(item.outcome))
  .every((item) => item.windowContamination?.status === 'NOT_CHECKED'
    && item.windowContamination.legacyClaim?.rawWindow.status === 'CLEAN'
    && item.windowContamination.legacyClaim.rawWindow.inspectedTransactions?.length
      === item.transactions.length
    && item.windowContamination.legacyClaim.rawWindow.unexpectedTransactions?.length === 0));

const legacyPollutedClaim = {
  ...legacyCleanClaim,
  actions: legacyCleanClaim.actions.map((action) => action.windowContamination?.status === 'CLEAN'
    ? { ...action, windowContamination: { ...action.windowContamination, status: 'POLLUTED' as const } }
    : action),
};
const migratedLegacyPolluted = adaptEvidenceV2ToV3(
  evidenceEnvelopeV2Schema.parse(legacyPollutedClaim) as EvidenceEnvelopeV2,
);
const migratedLegacyPollutedReport = aggregateReport(migratedLegacyPolluted, []);
assert.equal(migratedLegacyPollutedReport.status, 'INVALID_EVIDENCE');
assert.ok(migratedLegacyPollutedReport.integrity?.reasons.some((reason) => reason.includes('污染结论不得降级')));
assert.ok(migratedLegacyPolluted.actions.filter((item) => ['EXECUTED', 'CANCELLED', 'FROZEN'].includes(item.outcome))
  .every((item) => item.windowContamination?.status === 'NOT_CHECKED'
    && item.windowContamination.legacyClaim?.rawWindow.status === 'POLLUTED'
    && item.windowContamination.legacyClaim.rawWindow.inspectedTransactions?.length
      === item.transactions.length));

// A producer cannot smuggle partial scan fields into NOT_CHECKED and rely on
// default Zod stripping. The unsupported evidence shape is rejected outright.
const partialNotChecked = mutateFirstExecution(canonical, (window) => {
  window.source = { source: 'block-scan', path: 'partial-only' };
  window.inspectedTransactions = [];
});
assert.equal(canonicalEvidenceEnvelopeSchema.safeParse(partialNotChecked).success, false);

// A real external transaction makes POLLUTED invalid evidence, with the raw scan item still parseable.
const polluted = withCompletedWindows(canonical, 'POLLUTED');
const pollutedReport = aggregateReport(polluted, runCheckPlan(polluted, marketOpenRoundtripPlan));
assert.equal(pollutedReport.layers.evidenceIntegrity, 'FAIL');
assert.equal(pollutedReport.status, 'INVALID_EVIDENCE');
assert.ok(pollutedReport.integrity?.reasons.some((reason) => reason.includes('非预期交易污染')));

// Fake CLEAN: an undeclared transaction cannot be hidden by leaving unexpectedTransactions empty.
const fakeClean = mutateFirstExecution(clean, (window) => {
  assert.ok(window.toBlock && window.inspectedBlocks && window.inspectedTransactions);
  const lastBlock = window.inspectedBlocks.find((block) => block.blockNumber === window.toBlock);
  assert.ok(lastBlock);
  const external = externalTransaction(window.toBlock, lastBlock.blockHash as Hex, 1);
  window.inspectedTransactions.push(external as unknown as Record<string, unknown>);
  lastBlock.transactionHashes.push(external.txHash);
});
assert.equal(evidenceEnvelopeV3Schema.safeParse(fakeClean).success, true);
const fakeCleanReport = aggregateReport(fakeClean, []);
assert.equal(fakeCleanReport.status, 'INVALID_EVIDENCE');
assert.ok(fakeCleanReport.integrity?.reasons.some((reason) => reason.includes('CLEAN 窗口包含')));

// POLLUTED without completed scan evidence is rejected structurally.
const uncredentialedPolluted = mutateFirstExecution(clean, (window) => {
  for (const key of ['fromBlock', 'toBlock', 'inspectedBlocks', 'inspectedTransactions', 'unexpectedTransactions', 'source'] as const) {
    delete window[key];
  }
  window.status = 'POLLUTED';
});
assert.equal(evidenceEnvelopeV3Schema.safeParse(uncredentialedPolluted).success, false);
assert.equal(aggregateReport(uncredentialedPolluted, []).status, 'INVALID_EVIDENCE');

const missingSourceBlock = mutateFirstExecution(clean, (window) => {
  assert.ok(window.source);
  delete window.source.blockNumber;
});
assert.equal(evidenceEnvelopeV3Schema.safeParse(missingSourceBlock).success, false);
assert.equal(aggregateReport(missingSourceBlock, []).status, 'INVALID_EVIDENCE');

const reversedRange = mutateFirstExecution(clean, (window) => {
  assert.ok(window.fromBlock && window.toBlock);
  [window.fromBlock, window.toBlock] = [window.toBlock, window.fromBlock];
});
assert.equal(aggregateReport(reversedRange, []).status, 'INVALID_EVIDENCE');

const outOfRangeTransaction = mutateFirstExecution(clean, (window) => {
  assert.ok(window.toBlock && window.inspectedTransactions?.[0]);
  window.inspectedTransactions[0].blockNumber = (BigInt(window.toBlock) + 1n).toString();
});
assert.equal(aggregateReport(outOfRangeTransaction, []).status, 'INVALID_EVIDENCE');

const incompleteBlocks = mutateFirstExecution(clean, (window) => {
  assert.ok(window.inspectedBlocks);
  window.inspectedBlocks.shift();
});
assert.equal(aggregateReport(incompleteBlocks, []).status, 'INVALID_EVIDENCE');

const wrongUnexpectedSubset = mutateFirstExecution(polluted, (window) => {
  assert.ok(window.toBlock && window.inspectedBlocks && window.unexpectedTransactions);
  const lastBlock = window.inspectedBlocks.find((block) => block.blockNumber === window.toBlock);
  assert.ok(lastBlock);
  window.unexpectedTransactions = [externalTransaction(window.toBlock, lastBlock.blockHash as Hex, 2) as unknown as Record<string, unknown>];
});
assert.equal(aggregateReport(wrongUnexpectedSubset, []).status, 'INVALID_EVIDENCE');
assert.ok(assessEvidenceIntegrity(polluted, []).reasons.some((reason) => reason.includes('污染')));

// A legacy POLLUTED declaration remains blocking even when attached to a
// non-terminal action; outcome/type dispatch must never wash it into PASS.
const legacyNonTerminalPolluted = evidenceEnvelopeV2Schema.parse({
  ...structuredClone(evidenceV2),
  actions: evidenceV2.actions.map((action, index) => index === 0 ? {
    ...action,
    windowContamination: {
      status: 'POLLUTED',
      fromBlock: action.transactions[0]?.blockNumber,
      toBlock: action.transactions[0]?.blockNumber,
      inspectedTransactions: action.transactions,
      unexpectedTransactions: [],
      source: { source: 'block-scan', path: 'legacy-non-terminal-claim' },
    },
  } : action),
}) as EvidenceEnvelopeV2;
const migratedNonTerminalPolluted = adaptEvidenceV2ToV3(legacyNonTerminalPolluted);
const migratedNonTerminalPollutedReport = aggregateReport(migratedNonTerminalPolluted, []);
assert.equal(migratedNonTerminalPollutedReport.status, 'INVALID_EVIDENCE');
assert.ok(migratedNonTerminalPollutedReport.integrity?.reasons.some((reason) => reason.includes('动作结果被降级')));

// Transaction array order is not semantic. A same-block oracle transaction may
// precede the keeper transaction without changing the selected execution tx.
const tx2Canonical = canonical.actions.find((action) => action.actionId === 'TX2');
assert.ok(tx2Canonical);
const tx2Keeper = requireExecutionTransaction(tx2Canonical);
const sameBlockOracle = additionalKnownTransaction(tx2Keeper, 'oracle', 'a');
assert.ok(sameBlockOracle.to);
const trustedOraclePlan = createMarketOpenRoundtripPlan({
  id: 'market-open.roundtrip.oracle-test',
  version: '2',
  oracleSupport: {
    actors: [sameBlockOracle.actor],
    targets: [sameBlockOracle.to],
  },
});
const multiTransactionSource = evidenceEnvelopeV3Schema.parse({
  ...structuredClone(canonical),
  actions: canonical.actions.map((action) => action.actionId === 'TX2'
    ? {
      ...action,
      transactions: [sameBlockOracle, ...action.transactions],
      oracle: [...action.oracle, {
        token: '0x1111111111111111111111111111111111111111',
        min: '1',
        max: '1',
        timestamp: '1',
        blockNumber: sameBlockOracle.blockNumber,
        transactionHash: sameBlockOracle.txHash,
      }],
    }
    : action),
}) as EvidenceEnvelope;
const multiResolution = resolveExecutionTransaction(multiTransactionSource.actions.find((action) => action.actionId === 'TX2')!);
assert.equal(multiResolution.status, 'RESOLVED');
assert.equal(multiResolution.status === 'RESOLVED' && multiResolution.transaction.txHash, tx2Keeper.txHash);
const multiTransactionClean = withCompletedWindows(multiTransactionSource, 'CLEAN');
const multiTransactionReport = aggregateReport(
  multiTransactionClean,
  runCheckPlan(multiTransactionClean, trustedOraclePlan),
  trustedOraclePlan,
);
assert.equal(multiTransactionReport.status, 'PASS');

// An oracle-role support transaction is trusted only when it is independently
// anchored by exactly one OracleRef and its runtime identity is allowlisted by
// the CheckPlan. Merely labelling a transaction "oracle" is insufficient.
const missingOracleRef = evidenceEnvelopeV3Schema.parse({
  ...structuredClone(multiTransactionClean),
  actions: multiTransactionClean.actions.map((action) => action.actionId === 'TX2'
    ? {
      ...action,
      oracle: action.oracle.filter((oracle) => oracle.transactionHash?.toLowerCase()
        !== sameBlockOracle.txHash.toLowerCase()),
    }
    : action),
}) as EvidenceEnvelope;
const missingOracleRefReport = aggregateReport(
  missingOracleRef,
  runCheckPlan(missingOracleRef, trustedOraclePlan),
  trustedOraclePlan,
);
assert.equal(missingOracleRefReport.status, 'INVALID_EVIDENCE');
assert.ok(missingOracleRefReport.integrity?.reasons.some((reason) => (
  reason.includes('未通过 oracle-ref 锚点') && reason.includes('没有匹配 OracleRef')
)));

const untrustedOracleActor = '0xcccccccccccccccccccccccccccccccccccccccc' as const;
const untrustedOracleTarget = '0xdddddddddddddddddddddddddddddddddddddddd' as const;
const untrustedOracleIdentity = structuredClone(multiTransactionClean) as unknown as {
  actions: Array<{
    actionId: string;
    transactions: Array<{ txHash: string; actor: string; to?: string }>;
    windowContamination?: MutableWindow;
  }>;
};
const untrustedOracleAction = untrustedOracleIdentity.actions.find((action) => action.actionId === 'TX2');
const untrustedOracleTransaction = untrustedOracleAction?.transactions.find((transaction) => (
  transaction.txHash.toLowerCase() === sameBlockOracle.txHash.toLowerCase()
));
const untrustedOracleScan = untrustedOracleAction?.windowContamination?.inspectedTransactions?.find((transaction) => (
  String(transaction.txHash).toLowerCase() === sameBlockOracle.txHash.toLowerCase()
));
assert.ok(untrustedOracleTransaction && untrustedOracleScan);
untrustedOracleTransaction.actor = untrustedOracleActor;
untrustedOracleTransaction.to = untrustedOracleTarget;
untrustedOracleScan.actor = untrustedOracleActor;
untrustedOracleScan.to = untrustedOracleTarget;
const untrustedOracleEvidence = evidenceEnvelopeV3Schema.parse(untrustedOracleIdentity) as EvidenceEnvelope;
const untrustedOracleReport = aggregateReport(
  untrustedOracleEvidence,
  runCheckPlan(untrustedOracleEvidence, trustedOraclePlan),
  trustedOraclePlan,
);
assert.equal(untrustedOracleReport.status, 'INVALID_EVIDENCE');
assert.ok(untrustedOracleReport.integrity?.reasons.some((reason) => (
  reason.includes('actor 不在规则 oracle-support 的可信白名单')
)));
assert.ok(untrustedOracleReport.integrity?.reasons.some((reason) => (
  reason.includes('to 不在规则 oracle-support 的可信白名单')
)));

const serviceExecutorSource = evidenceEnvelopeV3Schema.parse({
  ...structuredClone(canonical),
  actions: canonical.actions.map((action) => action.type === 'executeOrder'
    ? {
      ...action,
      transactions: action.transactions.map((transaction) => ({ ...transaction, role: 'service' })),
    }
    : action),
}) as EvidenceEnvelope;
const serviceExecutorClean = withCompletedWindows(serviceExecutorSource, 'CLEAN');
assert.equal(aggregateReport(
  serviceExecutorClean,
  runCheckPlan(serviceExecutorClean, marketOpenRoundtripPlan),
  marketOpenRoundtripPlan,
).status, 'PASS');

// Two keeper/service candidates in the authoritative After block are
// irreducibly ambiguous and therefore invalid evidence.
const ambiguousCandidate = additionalKnownTransaction(tx2Keeper, 'service', 'b');
const ambiguousExecution = structuredClone(multiTransactionClean) as unknown as {
  actions: Array<{
    actionId: string;
    transactions: TransactionRef[];
    windowContamination?: MutableWindow;
  }>;
};
const ambiguousTx2 = ambiguousExecution.actions.find((action) => action.actionId === 'TX2');
assert.ok(ambiguousTx2?.windowContamination?.inspectedTransactions
  && ambiguousTx2.windowContamination.inspectedBlocks);
ambiguousTx2.transactions.push(ambiguousCandidate);
ambiguousTx2.windowContamination.inspectedTransactions.push(asScanned(ambiguousCandidate) as unknown as Record<string, unknown>);
const ambiguousBlock = ambiguousTx2.windowContamination.inspectedBlocks.find(
  (block) => block.blockNumber === ambiguousCandidate.blockNumber,
);
assert.ok(ambiguousBlock);
ambiguousBlock.transactionHashes.push(ambiguousCandidate.txHash);
const ambiguousEvidence = evidenceEnvelopeV3Schema.parse(ambiguousExecution) as EvidenceEnvelope;
assert.equal(resolveExecutionTransaction(ambiguousEvidence.actions.find((action) => action.actionId === 'TX2')!).status, 'AMBIGUOUS');
const ambiguousReport = aggregateReport(ambiguousEvidence, []);
assert.equal(ambiguousReport.status, 'INVALID_EVIDENCE');
assert.ok(ambiguousReport.integrity?.reasons.some((reason) => reason.includes('执行交易存在歧义')));

// A unique keeper in execution-after does not wash away a second Keeper/Service
// candidate in a different block. The shared resolver rejects the contradictory
// candidate set before any pack can select the apparently correct transaction.
const wrongBlockExecution = structuredClone(clean) as unknown as {
  actions: Array<{
    actionId: string;
    transactions: TransactionRef[];
    windowContamination?: MutableWindow;
  }>;
};
const wrongBlockTx2 = wrongBlockExecution.actions.find((action) => action.actionId === 'TX2');
assert.ok(wrongBlockTx2?.windowContamination?.fromBlock
  && wrongBlockTx2.windowContamination.inspectedBlocks
  && wrongBlockTx2.windowContamination.inspectedTransactions);
const wrongBlock = wrongBlockTx2.windowContamination.inspectedBlocks.find((block) => (
  block.blockNumber === wrongBlockTx2.windowContamination!.fromBlock
));
assert.ok(wrongBlock);
const wrongBlockServiceBase = additionalKnownTransaction(tx2Keeper, 'service', '9');
assert.ok(wrongBlockServiceBase.receipt);
const wrongBlockService: TransactionRef = {
  ...wrongBlockServiceBase,
  blockNumber: wrongBlock.blockNumber as `${bigint}`,
  blockHash: wrongBlock.blockHash as Hex,
  receipt: {
    ...wrongBlockServiceBase.receipt,
    blockNumber: wrongBlock.blockNumber as `${bigint}`,
    blockHash: wrongBlock.blockHash as Hex,
  },
};
wrongBlockTx2.transactions.unshift(wrongBlockService);
const wrongBlockScan = {
  ...asScanned(wrongBlockService),
  transactionIndex: wrongBlock.transactionHashes.length.toString() as `${bigint}`,
};
wrongBlockTx2.windowContamination.inspectedTransactions.push(
  wrongBlockScan as unknown as Record<string, unknown>,
);
wrongBlock.transactionHashes.push(wrongBlockService.txHash);
const wrongBlockEvidence = evidenceEnvelopeV3Schema.parse(wrongBlockExecution) as EvidenceEnvelope;
const wrongBlockResolution = resolveExecutionTransaction(
  wrongBlockEvidence.actions.find((action) => action.actionId === 'TX2')!,
);
assert.equal(wrongBlockResolution.status, 'AMBIGUOUS');
assert.ok(wrongBlockResolution.reason.includes('不在 execution-after'));
const wrongBlockReport = aggregateReport(wrongBlockEvidence, []);
assert.equal(wrongBlockReport.status, 'INVALID_EVIDENCE');
assert.ok(wrongBlockReport.integrity?.reasons.some((reason) => reason.includes('不在 execution-after')));

// Transaction cardinality also comes from the trusted plan. A second, fully
// anchored trader submission is still invalid when the action contract says 1..1.
const extraSubmission = structuredClone(clean) as unknown as {
  actions: Array<{
    actionId: string;
    transactions: TransactionRef[];
    windowContamination?: MutableWindow;
  }>;
};
const extraSubmissionTx1 = extraSubmission.actions.find((action) => action.actionId === 'TX1');
const extraSubmissionTx2 = extraSubmission.actions.find((action) => action.actionId === 'TX2');
assert.ok(extraSubmissionTx1?.transactions[0]?.orderKey
  && extraSubmissionTx2?.windowContamination?.inspectedBlocks
  && extraSubmissionTx2.windowContamination.inspectedTransactions);
const secondTrader = {
  ...additionalKnownTransaction(extraSubmissionTx1.transactions[0], 'trader', '7'),
  orderKey: extraSubmissionTx1.transactions[0].orderKey,
};
extraSubmissionTx1.transactions.push(secondTrader);
const secondTraderBlock = extraSubmissionTx2.windowContamination.inspectedBlocks.find((block) => (
  block.blockNumber === secondTrader.blockNumber
));
assert.ok(secondTraderBlock);
extraSubmissionTx2.windowContamination.inspectedTransactions.push({
  ...asScanned(secondTrader),
  transactionIndex: secondTraderBlock.transactionHashes.length.toString() as `${bigint}`,
} as unknown as Record<string, unknown>);
secondTraderBlock.transactionHashes.push(secondTrader.txHash);
const extraSubmissionEvidence = evidenceEnvelopeV3Schema.parse(extraSubmission) as EvidenceEnvelope;
const extraSubmissionReport = aggregateReport(
  extraSubmissionEvidence,
  runCheckPlan(extraSubmissionEvidence, marketOpenRoundtripPlan),
  marketOpenRoundtripPlan,
);
assert.equal(extraSubmissionReport.status, 'INVALID_EVIDENCE');
assert.ok(extraSubmissionReport.integrity?.reasons.some((reason) => (
  reason.includes('交易规则 order-submission 超出上限')
)));

// A transaction belonging to a future action cannot be retroactively added to
// the current window whitelist to hide a real third-party transaction.
const futureRegisteredTransaction = additionalKnownTransaction(tx2Keeper, 'oracle', 'f');
const futureWhitelistAttempt = structuredClone(clean) as unknown as {
  actions: Array<{
    actionId: string;
    transactions: TransactionRef[];
    windowContamination?: MutableWindow;
  }>;
};
const futureTx2 = futureWhitelistAttempt.actions.find((action) => action.actionId === 'TX2');
const futureTx3 = futureWhitelistAttempt.actions.find((action) => action.actionId === 'TX3');
assert.ok(futureTx2?.windowContamination?.inspectedTransactions
  && futureTx2.windowContamination.inspectedBlocks
  && futureTx3);
futureTx3.transactions.unshift(futureRegisteredTransaction);
futureTx2.windowContamination.inspectedTransactions.push(
  asScanned(futureRegisteredTransaction) as unknown as Record<string, unknown>,
);
const futureExecutionBlock = futureTx2.windowContamination.inspectedBlocks.find(
  (block) => block.blockNumber === futureRegisteredTransaction.blockNumber,
);
assert.ok(futureExecutionBlock);
futureExecutionBlock.transactionHashes.push(futureRegisteredTransaction.txHash);
const futureWhitelistEvidence = evidenceEnvelopeV3Schema.parse(futureWhitelistAttempt) as EvidenceEnvelope;
const futureWhitelistReport = aggregateReport(futureWhitelistEvidence, []);
assert.equal(futureWhitelistReport.status, 'INVALID_EVIDENCE');
assert.ok(futureWhitelistReport.integrity?.reasons.some((reason) => reason.includes('CLEAN 窗口包含')));

// orderRefs are a logical lookup aid, not a substitute for a unique on-chain
// submission transaction carrying the same orderKey.
const orderRefsOnly = evidenceEnvelopeV3Schema.parse({
  ...structuredClone(clean),
  actions: clean.actions.map((action) => action.actionId === 'TX1'
    ? {
      ...action,
      transactions: action.transactions.map((transaction) => {
        const { orderKey: _orderKey, ...withoutOrderKey } = transaction;
        return withoutOrderKey;
      }),
    }
    : action),
}) as EvidenceEnvelope;
const orderRefsOnlyIntegrity = assessEvidenceIntegrity(orderRefsOnly, []);
assert.equal(orderRefsOnlyIntegrity.layer, 'INCOMPLETE');
assert.equal(orderRefsOnlyIntegrity.invalid, false);
assert.ok(orderRefsOnlyIntegrity.reasons.some((reason) => reason.includes('tx.orderKey 因果锚点')));

const tx1Canonical = clean.actions.find((action) => action.actionId === 'TX1');
assert.ok(tx1Canonical?.transactions[0]?.orderKey);
const duplicateSubmission = {
  ...additionalKnownTransaction(tx1Canonical.transactions[0], 'trader', '8'),
  orderKey: tx1Canonical.transactions[0].orderKey,
};
const ambiguousSubmission = structuredClone(clean) as unknown as {
  actions: Array<{
    actionId: string;
    transactions: TransactionRef[];
    windowContamination?: MutableWindow;
  }>;
};
const ambiguousTx1 = ambiguousSubmission.actions.find((action) => action.actionId === 'TX1');
const ambiguousSubmissionTx2 = ambiguousSubmission.actions.find((action) => action.actionId === 'TX2');
assert.ok(ambiguousTx1 && ambiguousSubmissionTx2?.windowContamination?.inspectedTransactions
  && ambiguousSubmissionTx2.windowContamination.inspectedBlocks);
ambiguousTx1.transactions.push(duplicateSubmission);
ambiguousSubmissionTx2.windowContamination.inspectedTransactions.push(
  asScanned(duplicateSubmission) as unknown as Record<string, unknown>,
);
const submissionBlock = ambiguousSubmissionTx2.windowContamination.inspectedBlocks.find(
  (block) => block.blockNumber === duplicateSubmission.blockNumber,
);
assert.ok(submissionBlock);
submissionBlock.transactionHashes.push(duplicateSubmission.txHash);
const ambiguousSubmissionEvidence = evidenceEnvelopeV3Schema.parse(ambiguousSubmission) as EvidenceEnvelope;
const ambiguousSubmissionReport = aggregateReport(ambiguousSubmissionEvidence, []);
assert.equal(ambiguousSubmissionReport.status, 'INVALID_EVIDENCE');
assert.ok(ambiguousSubmissionReport.integrity?.reasons.some((reason) => reason.includes('因果关系不唯一')));

const revertedSubmission = evidenceEnvelopeV3Schema.parse({
  ...structuredClone(clean),
  actions: clean.actions.map((action) => action.actionId === 'TX1'
    ? {
      ...action,
      transactions: action.transactions.map((transaction) => ({
        ...transaction,
        status: 'REVERTED',
        receipt: transaction.receipt ? { ...transaction.receipt, status: 'REVERTED' } : undefined,
      })),
    }
    : action),
}) as EvidenceEnvelope;
const revertedSubmissionReport = aggregateReport(revertedSubmission, []);
assert.equal(revertedSubmissionReport.status, 'INVALID_EVIDENCE');
assert.ok(revertedSubmissionReport.integrity?.reasons.some((reason) => reason.includes('SUBMITTED 交易')));

const impossibleMovePriceSubmission = evidenceEnvelopeV3Schema.parse({
  ...structuredClone(clean),
  actions: clean.actions.map((action) => action.actionId === 'TX1'
    ? { ...action, type: 'movePrice' }
    : action),
}) as EvidenceEnvelope;
const impossibleMovePriceReport = aggregateReport(impossibleMovePriceSubmission, []);
assert.equal(impossibleMovePriceReport.status, 'INVALID_EVIDENCE');
assert.ok(impossibleMovePriceReport.integrity?.reasons.some((reason) => reason.includes('movePrice 不能声明 SUBMITTED')));

const mismatchedExecutionOrderRef = evidenceEnvelopeV3Schema.parse({
  ...structuredClone(clean),
  actions: clean.actions.map((action) => action.actionId === 'TX2'
    ? { ...action, orderRefs: { order: `0x${'6'.repeat(64)}` } }
    : action),
}) as EvidenceEnvelope;
const mismatchedExecutionOrderRefReport = aggregateReport(mismatchedExecutionOrderRef, []);
assert.equal(mismatchedExecutionOrderRefReport.status, 'INVALID_EVIDENCE');
assert.ok(mismatchedExecutionOrderRefReport.integrity?.reasons.some((reason) => reason.includes('本动作 orderRefs 不一致')));

const reversedSameBlockCausality = structuredClone(clean) as unknown as {
  actions: Array<{
    actionId: string;
    transactions: TransactionRef[];
    windowContamination?: MutableWindow;
  }>;
};
const sameBlockTx1 = reversedSameBlockCausality.actions.find((action) => action.actionId === 'TX1');
const sameBlockTx2 = reversedSameBlockCausality.actions.find((action) => action.actionId === 'TX2');
assert.ok(sameBlockTx1?.transactions[0]
  && sameBlockTx2?.transactions[0]
  && sameBlockTx2.windowContamination?.inspectedTransactions
  && sameBlockTx2.windowContamination.inspectedBlocks);
const submissionTx = sameBlockTx1.transactions[0];
const executionTx = sameBlockTx2.transactions[0];
assert.ok(executionTx.blockHash && submissionTx.receipt);
submissionTx.blockNumber = executionTx.blockNumber;
submissionTx.blockHash = executionTx.blockHash;
submissionTx.receipt = {
  ...submissionTx.receipt,
  blockNumber: executionTx.blockNumber,
  blockHash: executionTx.blockHash,
};
const submissionScanned = sameBlockTx2.windowContamination.inspectedTransactions.find(
  (transaction) => transaction.txHash === submissionTx.txHash,
);
const executionScanned = sameBlockTx2.windowContamination.inspectedTransactions.find(
  (transaction) => transaction.txHash === executionTx.txHash,
);
assert.ok(submissionScanned && executionScanned);
submissionScanned.blockNumber = executionTx.blockNumber;
submissionScanned.blockHash = executionTx.blockHash;
submissionScanned.transactionIndex = '1';
executionScanned.transactionIndex = '0';
for (const block of sameBlockTx2.windowContamination.inspectedBlocks) {
  block.transactionHashes = block.blockNumber === executionTx.blockNumber
    ? [executionTx.txHash, submissionTx.txHash]
    : block.transactionHashes.filter((hash) => hash !== submissionTx.txHash);
}
const reversedSameBlockEvidence = evidenceEnvelopeV3Schema.parse(reversedSameBlockCausality) as EvidenceEnvelope;
const reversedSameBlockReport = aggregateReport(reversedSameBlockEvidence, []);
assert.equal(reversedSameBlockReport.status, 'INVALID_EVIDENCE');
assert.ok(reversedSameBlockReport.integrity?.reasons.some((reason) => reason.includes('同块订单提交 transactionIndex')));

const duplicateScannedIndex = mutateFirstExecution(multiTransactionClean, (window) => {
  assert.ok(window.toBlock && window.inspectedTransactions);
  const sameBlock = window.inspectedTransactions.filter((transaction) => transaction.blockNumber === window.toBlock);
  assert.ok(sameBlock.length > 1);
  sameBlock[1]!.transactionIndex = sameBlock[0]!.transactionIndex;
});
const duplicateScannedIndexReport = aggregateReport(duplicateScannedIndex, []);
assert.equal(duplicateScannedIndexReport.status, 'INVALID_EVIDENCE');
assert.ok(duplicateScannedIndexReport.integrity?.reasons.some((reason) => reason.includes('transactionIndex=')));

const mismatchedScannedNonce = mutateFirstExecution(clean, (window) => {
  assert.ok(window.toBlock && window.inspectedTransactions);
  const execution = window.inspectedTransactions.find((transaction) => transaction.blockNumber === window.toBlock);
  assert.ok(execution);
  execution.nonce = (BigInt(String(execution.nonce)) + 1n).toString();
});
const mismatchedScannedNonceReport = aggregateReport(mismatchedScannedNonce, []);
assert.equal(mismatchedScannedNonceReport.status, 'INVALID_EVIDENCE');
assert.ok(mismatchedScannedNonceReport.integrity?.reasons.some((reason) => reason.includes('nonce')));

// EXECUTED does not imply executeOrder. Operational actions do not inherit
// OrderExecuted/orderKey requirements, but an extraneous completed window is
// rejected until that action type registers its own window semantics.
const nonOrderWithExtraneousClean = evidenceEnvelopeV3Schema.parse({
  ...structuredClone(clean),
  actions: clean.actions.map((action) => action.actionId === 'TX2'
    ? { ...action, type: 'movePrice', events: action.events.filter((event) => event.name !== 'OrderExecuted') }
    : action),
}) as EvidenceEnvelope;
assert.equal(aggregateReport(nonOrderWithExtraneousClean, []).status, 'INVALID_EVIDENCE');

const nonOrderExecuted = evidenceEnvelopeV3Schema.parse({
  ...structuredClone(clean),
  actions: clean.actions.map((action) => {
    if (action.actionId !== 'TX2') return action;
    const { windowContamination: _window, ...withoutWindow } = action;
    return {
      ...withoutWindow,
      type: 'movePrice',
      events: action.events.filter((event) => event.name !== 'OrderExecuted'),
    };
  }),
}) as EvidenceEnvelope;
const nonOrderIntegrity = assessEvidenceIntegrity(nonOrderExecuted, []);
assert.equal(nonOrderIntegrity.layer, 'PASS');
assert.ok(nonOrderIntegrity.reasons.every((reason) => !reason.includes('OrderExecuted') && !reason.includes('orderKey')));

const unknownTerminalAction = evidenceEnvelopeV3Schema.parse({
  ...structuredClone(nonOrderExecuted),
  actions: nonOrderExecuted.actions.map((action) => action.actionId === 'TX2'
    ? { ...action, type: 'customExecute' }
    : action),
}) as EvidenceEnvelope;
const unknownTerminalIntegrity = assessEvidenceIntegrity(unknownTerminalAction, []);
assert.equal(unknownTerminalIntegrity.layer, 'INCOMPLETE');
assert.equal(unknownTerminalIntegrity.invalid, false);
assert.ok(unknownTerminalIntegrity.reasons.some((reason) => reason.includes('没有登记完整性策略')));

// Liquidation and ADL settle positions directly. Their causal anchor is the
// PositionDecrease event, not a synthetic OrderExecuted/orderKey requirement.
for (const actionType of ['liquidate', 'adl'] as const) {
  const settlementEvidence = evidenceEnvelopeV3Schema.parse({
    ...structuredClone(clean),
    actions: clean.actions.map((action) => action.actionId === 'TX2'
      ? {
        ...action,
        type: actionType,
        events: [
          ...action.events.filter((event) => event.name !== 'OrderExecuted'),
          {
            name: 'PositionDecrease',
            transactionHash: tx2Keeper.txHash,
            blockNumber: tx2Keeper.blockNumber,
            source: 'receipt-log',
            args: {},
          },
        ],
      }
      : action),
  }) as EvidenceEnvelope;
  assert.equal(assessEvidenceIntegrity(settlementEvidence, []).layer, 'PASS');
}

const revertedSettlement = evidenceEnvelopeV3Schema.parse({
  ...structuredClone(clean),
  actions: clean.actions.map((action) => action.actionId === 'TX2'
    ? {
      ...action,
      type: 'liquidate',
      transactions: action.transactions.map((transaction) => ({
        ...transaction,
        status: 'REVERTED',
        receipt: transaction.receipt ? { ...transaction.receipt, status: 'REVERTED' } : undefined,
      })),
      events: [
        ...action.events.filter((event) => event.name !== 'OrderExecuted'),
        {
          name: 'PositionDecrease',
          transactionHash: tx2Keeper.txHash,
          blockNumber: tx2Keeper.blockNumber,
          source: 'receipt-log',
          args: {},
        },
      ],
    }
    : action),
}) as EvidenceEnvelope;
const revertedSettlementReport = aggregateReport(revertedSettlement, []);
assert.equal(revertedSettlementReport.status, 'INVALID_EVIDENCE');
assert.ok(revertedSettlementReport.integrity?.reasons.some((reason) => reason.includes('终态执行交易必须 SUCCESS')));

const missingLiquidationEvent = evidenceEnvelopeV3Schema.parse({
  ...structuredClone(clean),
  actions: clean.actions.map((action) => action.actionId === 'TX2'
    ? { ...action, type: 'liquidate', events: action.events.filter((event) => event.name !== 'OrderExecuted') }
    : action),
}) as EvidenceEnvelope;
const missingLiquidationIntegrity = assessEvidenceIntegrity(missingLiquidationEvent, []);
assert.equal(missingLiquidationIntegrity.layer, 'INCOMPLETE');
assert.equal(missingLiquidationIntegrity.invalid, false);
assert.ok(missingLiquidationIntegrity.reasons.some((reason) => reason.includes('PositionDecrease')));

const mismatchedLiquidationEvent = structuredClone(missingLiquidationEvent) as unknown as {
  actions: Array<{ actionId: string; events: Array<Record<string, unknown>> }>;
};
const mismatchedLiquidationAction = mismatchedLiquidationEvent.actions.find((action) => action.actionId === 'TX2');
assert.ok(mismatchedLiquidationAction);
mismatchedLiquidationAction.events.push({
  name: 'PositionDecrease',
  transactionHash: `0x${'d'.repeat(64)}`,
  blockNumber: tx2Keeper.blockNumber,
  source: 'receipt-log',
  args: {},
});
assert.equal(aggregateReport(
  evidenceEnvelopeV3Schema.parse(mismatchedLiquidationEvent) as EvidenceEnvelope,
  [],
).status, 'INVALID_EVIDENCE');

// A block list cannot credential a reorged or fabricated Action transaction:
// the inspected block hash must equal both TransactionRef and receipt anchors.
const mismatchedBlockAnchor = mutateFirstExecution(clean, (window) => {
  assert.ok(window.toBlock && window.inspectedBlocks);
  const executionBlock = window.inspectedBlocks.find((block) => block.blockNumber === window.toBlock);
  assert.ok(executionBlock);
  executionBlock.blockHash = `0x${'c'.repeat(64)}`;
});
const mismatchedBlockAnchorReport = aggregateReport(mismatchedBlockAnchor, []);
assert.equal(mismatchedBlockAnchorReport.status, 'INVALID_EVIDENCE');
assert.ok(mismatchedBlockAnchorReport.integrity?.reasons.some((reason) => reason.includes('transaction/receipt 不一致')));

const mismatchedBeforeSnapshot = structuredClone(clean) as unknown as {
  actions: Array<{
    outcome: string;
    snapshots: Array<{ kind: string; blockHash?: string }>;
  }>;
};
const firstSettlement = mismatchedBeforeSnapshot.actions.find((action) => action.outcome === 'EXECUTED');
const beforeSnapshot = firstSettlement?.snapshots.find((snapshot) => snapshot.kind === 'execution-before');
assert.ok(beforeSnapshot);
beforeSnapshot.blockHash = `0x${'d'.repeat(64)}`;
const mismatchedBeforeSnapshotReport = aggregateReport(
  evidenceEnvelopeV3Schema.parse(mismatchedBeforeSnapshot) as EvidenceEnvelope,
  [],
);
assert.equal(mismatchedBeforeSnapshotReport.status, 'INVALID_EVIDENCE');
assert.ok(mismatchedBeforeSnapshotReport.integrity?.reasons.some((reason) => reason.includes('execution-before blockHash')));

const duplicateBlockHash = mutateFirstExecution(clean, (window) => {
  assert.ok(window.inspectedBlocks && window.inspectedBlocks.length > 1);
  window.inspectedBlocks[0]!.blockHash = window.inspectedBlocks[1]!.blockHash;
});
const duplicateBlockHashReport = aggregateReport(duplicateBlockHash, []);
assert.equal(duplicateBlockHashReport.status, 'INVALID_EVIDENCE');
assert.ok(duplicateBlockHashReport.integrity?.reasons.some((reason) => reason.includes('复用了同一 blockHash')));

const brokenParentLink = mutateFirstExecution(clean, (window) => {
  assert.ok(window.inspectedBlocks && window.inspectedBlocks.length > 1);
  window.inspectedBlocks[1]!.parentHash = `0x${'7'.repeat(64)}`;
});
const brokenParentLinkReport = aggregateReport(brokenParentLink, []);
assert.equal(brokenParentLinkReport.status, 'INVALID_EVIDENCE');
assert.ok(brokenParentLinkReport.integrity?.reasons.some((reason) => reason.includes('parentHash 未连接')));

// The first parent is outside a window, but it still cannot point forward into
// that same window. Together with the normal second->first edge this is a 2-cycle.
const cyclicParentWindow = mutateFirstExecution(clean, (window) => {
  assert.ok(window.inspectedBlocks && window.inspectedBlocks.length > 1);
  window.inspectedBlocks[0]!.parentHash = window.inspectedBlocks[1]!.blockHash;
});
const cyclicParentWindowReport = aggregateReport(cyclicParentWindow, []);
assert.equal(cyclicParentWindowReport.status, 'INVALID_EVIDENCE');
assert.ok(cyclicParentWindowReport.integrity?.reasons.some((reason) => (
  reason.includes('形成不可能的环/未来引用')
)));

// Aligning Action and scanned fields does not make a replayed nonce legitimate:
// it is rejected both inside the completed window and across Action boundaries.
const replayedActorNonce = structuredClone(clean) as unknown as {
  actions: Array<{
    actionId: string;
    transactions: Array<{ txHash: string; actor: string; nonce?: string }>;
    windowContamination?: MutableWindow;
  }>;
};
const replayedTx1 = replayedActorNonce.actions.find((action) => action.actionId === 'TX1')?.transactions[0];
const replayedTx2Action = replayedActorNonce.actions.find((action) => action.actionId === 'TX2');
const replayedTx2 = replayedTx2Action?.transactions[0];
const replayedTx2Scan = replayedTx2Action?.windowContamination?.inspectedTransactions?.find((transaction) => (
  String(transaction.txHash).toLowerCase() === replayedTx2?.txHash.toLowerCase()
));
assert.ok(replayedTx1?.nonce && replayedTx2 && replayedTx2Scan);
replayedTx2.actor = replayedTx1.actor;
replayedTx2.nonce = replayedTx1.nonce;
replayedTx2Scan.actor = replayedTx1.actor;
replayedTx2Scan.nonce = replayedTx1.nonce;
const replayedActorNonceEvidence = evidenceEnvelopeV3Schema.parse(replayedActorNonce) as EvidenceEnvelope;
const replayedActorNonceReport = aggregateReport(replayedActorNonceEvidence, []);
assert.equal(replayedActorNonceReport.status, 'INVALID_EVIDENCE');
assert.ok(replayedActorNonceReport.integrity?.reasons.some((reason) => reason.includes('全局严格递增')));
assert.ok(replayedActorNonceReport.integrity?.reasons.some((reason) => reason.includes('扫描 nonce 未严格递增')));

// Each window may be locally continuous while the boundary between two windows
// is on another fork. The envelope-level chain check closes that seam.
const crossWindowParentBreak = structuredClone(clean) as unknown as {
  actions: Array<{ actionId: string; windowContamination?: MutableWindow }>;
};
const tx4Window = crossWindowParentBreak.actions.find((action) => action.actionId === 'TX4')?.windowContamination;
assert.ok(tx4Window?.inspectedBlocks?.[0]);
tx4Window.inspectedBlocks[0].parentHash = `0x${'4'.repeat(64)}`;
const crossWindowParentBreakReport = aggregateReport(
  evidenceEnvelopeV3Schema.parse(crossWindowParentBreak) as EvidenceEnvelope,
  [],
);
assert.equal(crossWindowParentBreakReport.status, 'INVALID_EVIDENCE');
assert.ok(crossWindowParentBreakReport.integrity?.reasons.some((reason) => (
  reason.includes('相邻窗口区块') && reason.includes('parentHash 未连接')
)));

// A non-execution snapshot is still a global block anchor. It cannot claim a
// second blockHash for a height already credentialed by a receipt/window.
const sameHeightFork = structuredClone(clean) as unknown as {
  actions: Array<{
    actionId: string;
    snapshots: Array<{ kind: string; blockNumber: string; blockHash?: string }>;
  }>;
};
const tx3PreSubmit = sameHeightFork.actions
  .find((action) => action.actionId === 'TX3')
  ?.snapshots.find((snapshot) => snapshot.kind === 'pre-submit');
const tx2ExecutionBlock = clean.actions
  .find((action) => action.actionId === 'TX2')
  ?.transactions[0]?.blockNumber;
assert.ok(tx3PreSubmit && tx2ExecutionBlock && tx3PreSubmit.blockNumber === tx2ExecutionBlock);
tx3PreSubmit.blockHash = `0x${'3'.repeat(64)}`;
const sameHeightForkReport = aggregateReport(
  evidenceEnvelopeV3Schema.parse(sameHeightFork) as EvidenceEnvelope,
  [],
);
assert.equal(sameHeightForkReport.status, 'INVALID_EVIDENCE');
assert.ok(sameHeightForkReport.integrity?.reasons.some((reason) => reason.includes('同一高度')));

// An orderKey is terminally consumed once. Reusing the earlier order on a later
// execute action remains invalid even if the second action is otherwise complete.
const doubleConsumedOrder = structuredClone(clean) as unknown as {
  actions: Array<{
    actionId: string;
    orderRefs?: Record<string, string>;
    transactions: Array<{ orderKey?: string }>;
  }>;
};
const firstTerminalOrder = doubleConsumedOrder.actions
  .find((action) => action.actionId === 'TX2')
  ?.transactions[0]?.orderKey;
const secondTerminalAction = doubleConsumedOrder.actions.find((action) => action.actionId === 'TX4');
assert.ok(firstTerminalOrder && secondTerminalAction?.transactions[0]);
secondTerminalAction.transactions[0].orderKey = firstTerminalOrder;
if (secondTerminalAction.orderRefs) {
  secondTerminalAction.orderRefs = Object.fromEntries(
    Object.keys(secondTerminalAction.orderRefs).map((key) => [key, firstTerminalOrder]),
  );
}
const doubleConsumedOrderReport = aggregateReport(
  evidenceEnvelopeV3Schema.parse(doubleConsumedOrder) as EvidenceEnvelope,
  [],
);
assert.equal(doubleConsumedOrderReport.status, 'INVALID_EVIDENCE');
assert.ok(doubleConsumedOrderReport.integrity?.reasons.some((reason) => (
  reason.includes('orderKey 已被 TX2 EXECUTED/CANCELLED 终态消费')
)));

console.log('Reconciliation V3 contract verification passed: version adapter + trustworthy contamination windows');

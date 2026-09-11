import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { loadEnvironmentBinding } from '../src/config/environment-binding.js';
import { canonicalEvidenceEnvelopeSchema } from '../src/evidence/adapters/v2-to-v3.js';
import { computeEvidenceDigest, sha256CanonicalJson } from '../src/evidence/evidence-digest.js';
import {
  evidenceEnvelopeSchema as evidenceEnvelopeV2Schema,
  type EvidenceEnvelope as EvidenceEnvelopeV2,
} from '../src/evidence/evidence-v2.js';
import {
  evidenceEnvelopeSchema as evidenceEnvelopeV3Schema,
  type Hex,
} from '../src/evidence/evidence-v3.js';
import { adaptMarketFlowV1 } from '../src/reconciliation/adapters/market-flow-v1.js';
import { reconcileMarketOpenRoundtrip } from '../src/reconciliation/market-open-reconciliation.js';
import { reconciliationReportSchema } from '../src/reconciliation/schema/check-record.js';
import {
  decodeFunctionalAutomationEvidenceAttachment,
  selectFinalFunctionalEvidenceAttachment,
} from '../src/reporting/write-outputs.js';
import type { ScenarioResult } from '../src/reporting/schema.js';

const CASE_ID = 'XT-MKT-OPEN-001';
const VARIANT_ID = 'reporter-contract';
const EXECUTION_ID = 'reporter-contract-execution';
const NOW = '2026-09-04T00:00:00.000Z';
const TRADER = '0x1111111111111111111111111111111111111111';
const ROUTER = '0x3333333333333333333333333333333333333333';

function hash(digit: string): Hex {
  return `0x${digit.repeat(64)}` as Hex;
}

const portableFixturePath = resolve(process.cwd(), 'fixtures/reconciliation/xt-mkt-open-001-legacy.json.gz.b64');
const portableFixture = JSON.parse(gunzipSync(Buffer.from(
  (await readFile(portableFixturePath, 'utf8')).trim(),
  'base64',
)).toString('utf8')) as unknown;
const trustedEnvironment = loadEnvironmentBinding(process.cwd(), 'tx-fork').binding;
const adaptedEvidenceV2 = adaptMarketFlowV1(portableFixture, {
  executionId: EXECUTION_ID,
  variantId: VARIANT_ID,
});
const evidenceV2 = evidenceEnvelopeV2Schema.parse({
  ...adaptedEvidenceV2,
  environment: {
    ...adaptedEvidenceV2.environment,
    chainId: trustedEnvironment.environmentChainId,
    deploymentId: trustedEnvironment.deploymentId,
    release: trustedEnvironment.release,
  },
}) as EvidenceEnvelopeV2;
const evidenceV3 = evidenceEnvelopeV3Schema.parse(canonicalEvidenceEnvelopeSchema.parse(evidenceV2));
const report = reconciliationReportSchema.parse(reconcileMarketOpenRoundtrip(evidenceV2));

assert.equal(
  computeEvidenceDigest(canonicalEvidenceEnvelopeSchema.parse(evidenceV2)),
  report.evidenceDigest,
  'V2 必须先正规化为 V3，再与原生 V3 生成相同 digest',
);
assert.equal(
  sha256CanonicalJson({ z: 1, nested: { b: 2, a: 3 } }),
  sha256CanonicalJson({ nested: { a: 3, b: 2 }, z: 1 }),
  'canonical JSON 必须递归忽略 object key 插入顺序',
);

const result = {
  id: CASE_ID,
  project: 'tx-fork',
  scenarioTitle: 'Reporter contract fixture',
} as ScenarioResult;

function decode(value: unknown) {
  const decoded = decodeFunctionalAutomationEvidenceAttachment(
    value,
    result,
    'reporter-contract-evidence.json',
    process.cwd(),
  );
  assert.ok(decoded);
  return decoded;
}

const legacyChecks = [{
  name: 'legacy runner self-check',
  passed: true,
  actual: 'trusted-by-old-reporter',
  expected: 'trusted-by-old-reporter',
}];

const modernV2 = decode({
  id: CASE_ID,
  title: 'Nested V2',
  checks: legacyChecks,
  evidenceV2,
  reconciliationReport: report,
});
assert.equal(modernV2.reportStatus, 'PASS_WITH_GAPS');
assert.equal(modernV2.checks.length, report.checks.length);
assert.equal(modernV2.checks[0]?.name, report.checks[0]?.id);
assert.equal(modernV2.transactions.length, 4);

const modernV3 = decode({
  id: CASE_ID,
  title: 'Nested V3',
  checks: legacyChecks,
  evidenceV3,
  reconciliationReport: report,
});
assert.equal(modernV3.reportStatus, 'PASS_WITH_GAPS');
assert.equal(modernV3.transactions.length, 4);
assert.equal(modernV3.transactions[0]?.actionKey, 'createOpen');
assert.equal(modernV3.transactions[0]?.label, '创建开仓订单');

const tamperedUnboundRootData = decode({
  evidenceV3,
  reconciliationReport: report,
  data: { margin: 'forged', leverage: '999999' },
  evidence: { events: { PositionIncrease: { uint: { executionPrice: 'forged' } } } },
});
assert.deepEqual(tamperedUnboundRootData.data, evidenceV3);
assert.equal(tamperedUnboundRootData.actionData, undefined);

const missingV2Integrity = decode({
  evidenceV3,
  reconciliationReport: { ...report, integrity: undefined },
});
assert.equal(missingV2Integrity.reportStatus, 'INVALID_EVIDENCE');
assert.match(String(missingV2Integrity.checks[0]?.actual), /reconciliationReport schema integrity/u);

const missingV2Digest = decode({
  evidenceV3,
  reconciliationReport: { ...report, evidenceDigest: undefined },
});
assert.equal(missingV2Digest.reportStatus, 'INVALID_EVIDENCE');
assert.match(String(missingV2Digest.checks[0]?.actual), /reconciliationReport schema evidenceDigest/u);

const unboundCheckPlan = decode({
  evidenceV3,
  reconciliationReport: { ...report, checkPlan: { id: '', version: '' } },
});
assert.equal(unboundCheckPlan.reportStatus, 'INVALID_EVIDENCE');
assert.match(String(unboundCheckPlan.checks[0]?.actual), /reconciliationReport schema checkPlan\.(?:id|version)/u);

const missingCheckPlanDigest = decode({
  evidenceV3,
  reconciliationReport: { ...report, checkPlanDigest: undefined },
});
assert.equal(missingCheckPlanDigest.reportStatus, 'INVALID_EVIDENCE');
assert.match(String(missingCheckPlanDigest.checks[0]?.actual), /reconciliationReport schema checkPlanDigest/u);

const spoofedKnownCheckPlan = decode({
  evidenceV3,
  reconciliationReport: { ...report, checkPlanDigest: `sha256:${'0'.repeat(64)}` },
});
assert.equal(spoofedKnownCheckPlan.reportStatus, 'INVALID_EVIDENCE');
assert.match(String(spoofedKnownCheckPlan.checks[0]?.actual), /checkPlanDigest=.*与可信计划 digest=.*不一致/u);

const unregisteredCheckPlan = decode({
  evidenceV3,
  reconciliationReport: {
    ...report,
    checkPlan: { id: 'unregistered.plan', version: '1' },
    checkPlanDigest: sha256CanonicalJson({ schemaVersion: 1, id: 'unregistered.plan', version: '1' }),
  },
});
assert.equal(unregisteredCheckPlan.reportStatus, 'INVALID_EVIDENCE');
assert.match(String(unregisteredCheckPlan.checks[0]?.actual), /未登记到 Reporter 可信计划注册表/u);

// A registered digest is public identity, not an attestation. An unrelated
// Evidence/hand-written PASS report must fail the executable-plan replay.
const unrelatedReadOnlyEvidence = evidenceEnvelopeV3Schema.parse({
  schemaVersion: 3,
  caseId: CASE_ID,
  variantId: 'unrelated-read-only',
  executionId: 'unrelated-read-only-execution',
  flowType: 'read-only',
  capabilities: [],
  environment: evidenceV3.environment,
  actions: [{
    schemaVersion: 3,
    actionId: 'OBS1',
    sequence: 1,
    type: 'movePrice',
    purpose: 'primary',
    outcome: 'OBSERVED',
    input: {},
    capabilities: [],
    transactions: [],
    snapshots: [],
    events: [],
    parameters: [],
    oracle: [],
    startedAt: NOW,
    endedAt: NOW,
  }],
  startedAt: NOW,
  endedAt: NOW,
});
const forgedRegisteredReport = reconciliationReportSchema.parse({
  schemaVersion: 2,
  caseId: unrelatedReadOnlyEvidence.caseId,
  variantId: unrelatedReadOnlyEvidence.variantId,
  executionId: unrelatedReadOnlyEvidence.executionId,
  evidenceDigest: computeEvidenceDigest(unrelatedReadOnlyEvidence),
  checkPlan: report.checkPlan,
  checkPlanDigest: report.checkPlanDigest,
  status: 'PASS',
  layers: {
    'chain-state': 'PASS', 'chain-event': 'NOT_RUN', keeper: 'NOT_RUN', indexer: 'NOT_RUN', frontend: 'NOT_RUN',
    cleanup: 'NOT_RUN', evidenceIntegrity: 'PASS',
  },
  integrity: { status: 'PASS', invalid: false, reasons: [] },
  checks: [{
    id: 'forged.pass', packId: 'market-open.core', actionId: 'OBS1', purpose: 'primary',
    subject: 'chain-state', comparison: 'presence', actual: { raw: 'true' }, expected: { raw: 'true' },
    sources: [{ layer: 'derived', path: 'actions[0]' }], verification: 'PRESENCE', severity: 'blocking', verdict: 'PASS',
  }],
});
const forgedRegistered = decode({
  evidenceV3: unrelatedReadOnlyEvidence,
  reconciliationReport: forgedRegisteredReport,
});
assert.equal(forgedRegistered.reportStatus, 'INVALID_EVIDENCE');
assert.match(String(forgedRegistered.checks[0]?.actual), /可信计划.*重放结果不一致/u);

for (const [field, value] of [
  ['chainId', trustedEnvironment.environmentChainId + 1],
  ['deploymentId', 'attacker-selected-deployment'],
  ['release', 'v9.9.9'],
] as const) {
  const tamperedEnvironmentEvidence = evidenceEnvelopeV3Schema.parse({
    ...structuredClone(evidenceV3),
    environment: { ...evidenceV3.environment, [field]: value },
  });
  const tamperedEnvironmentReport = reconciliationReportSchema.parse(
    reconcileMarketOpenRoundtrip(tamperedEnvironmentEvidence),
  );
  const rejected = decode({
    evidenceV3: tamperedEnvironmentEvidence,
    reconciliationReport: tamperedEnvironmentReport,
  });
  assert.equal(rejected.reportStatus, 'INVALID_EVIDENCE');
  assert.match(String(rejected.checks[0]?.actual), new RegExp(`environment\\.${field}=.*可信绑定`, 'u'));
  assert.doesNotMatch(String(rejected.checks[0]?.actual), /canonical Evidence digest=.*不一致/u);
}

assert.ok(evidenceV3.environment.fork);
assert.ok(evidenceV3.environment.market);
const nestedEnvironmentTampering = [
  {
    label: 'fork.provider',
    environment: {
      ...evidenceV3.environment,
      fork: { ...evidenceV3.environment.fork, provider: 'attacker-fork' },
    },
    expected: /fork\.provider=.*可信值/u,
  },
  {
    label: 'fork.displayName',
    environment: {
      ...evidenceV3.environment,
      fork: { ...evidenceV3.environment.fork, displayName: 'attacker/fork' },
    },
    expected: /fork\.displayName=.*可信 Mock Registry/u,
  },
  {
    label: 'market.mode',
    environment: {
      ...evidenceV3.environment,
      market: { ...evidenceV3.environment.market, mode: 'attacker-market' },
    },
    expected: /market\.mode=.*不是可信市场模式/u,
  },
  {
    label: 'market.resourceAlias',
    environment: {
      ...evidenceV3.environment,
      market: { ...evidenceV3.environment.market, resourceAlias: 'attacker-bundle' },
    },
    expected: /market\.resourceAlias=.*未唯一命中/u,
  },
  {
    label: 'market.marketIndex',
    environment: {
      ...evidenceV3.environment,
      market: { ...evidenceV3.environment.market, marketIndex: 999 },
    },
    expected: /market\.marketIndex=999.*可信 Mock Bundle/u,
  },
  {
    label: 'market.marketAddress',
    environment: {
      ...evidenceV3.environment,
      market: { ...evidenceV3.environment.market, marketAddress: TRADER },
    },
    expected: /market\.marketAddress=.*可信 Mock Bundle vault/u,
  },
] as const;
for (const attack of nestedEnvironmentTampering) {
  const tampered = evidenceEnvelopeV3Schema.parse({
    ...structuredClone(evidenceV3),
    environment: attack.environment,
  });
  const boundReport = reconciliationReportSchema.parse(reconcileMarketOpenRoundtrip(tampered));
  const rejected = decode({ evidenceV3: tampered, reconciliationReport: boundReport });
  assert.equal(rejected.reportStatus, 'INVALID_EVIDENCE', attack.label);
  assert.match(String(rejected.checks[0]?.actual), attack.expected, attack.label);
  assert.doesNotMatch(String(rejected.checks[0]?.actual), /canonical Evidence digest=.*不一致/u, attack.label);
}

const legacyV1Report: Record<string, unknown> = { ...report, schemaVersion: 1 };
delete legacyV1Report.evidenceDigest;
delete legacyV1Report.checkPlan;
delete legacyV1Report.checkPlanDigest;
const unboundLegacyReport = decode({
  checks: legacyChecks,
  evidenceV3,
  reconciliationReport: legacyV1Report,
});
assert.equal(unboundLegacyReport.reportStatus, 'INVALID_EVIDENCE');
assert.match(String(unboundLegacyReport.checks[0]?.actual), /schemaVersion=1.*未绑定 Evidence digest.*重新生成 V2 Report/u);
assert.doesNotMatch(String(unboundLegacyReport.checks[0]?.actual), /trusted-by-old-reporter/u);

const mismatchedIntegrityLayer = decode({
  evidenceV3,
  reconciliationReport: {
    ...report,
    integrity: { status: 'PASS', invalid: false, reasons: [] },
  },
});
assert.equal(mismatchedIntegrityLayer.reportStatus, 'INVALID_EVIDENCE');
assert.match(String(mismatchedIntegrityLayer.checks[0]?.actual), /integrity\.status=PASS.*layers\.evidenceIntegrity=INCOMPLETE/u);

const unexpectedInvalidFlag = decode({
  evidenceV3,
  reconciliationReport: {
    ...report,
    integrity: { status: 'INCOMPLETE', invalid: true, reasons: [] },
  },
});
assert.equal(unexpectedInvalidFlag.reportStatus, 'INVALID_EVIDENCE');
assert.match(String(unexpectedInvalidFlag.checks[0]?.actual), /integrity\.invalid.*status===INVALID_EVIDENCE.*期望 false/u);

const missingInvalidFlag = decode({
  evidenceV3,
  reconciliationReport: {
    ...report,
    status: 'INVALID_EVIDENCE',
    integrity: { status: 'INCOMPLETE', invalid: false, reasons: [] },
  },
});
assert.equal(missingInvalidFlag.reportStatus, 'INVALID_EVIDENCE');
assert.equal(missingInvalidFlag.checks.length, 1);
assert.match(String(missingInvalidFlag.checks[0]?.actual), /integrity\.invalid.*status===INVALID_EVIDENCE.*期望 true/u);

const cleanPassReport = reconciliationReportSchema.parse({
  ...report,
  status: 'PASS',
  layers: { ...report.layers, evidenceIntegrity: 'PASS' },
  integrity: { status: 'PASS', invalid: false, reasons: [] },
});
const passWithFailedLayer = decode({
  evidenceV3,
  reconciliationReport: {
    ...cleanPassReport,
    layers: { ...cleanPassReport.layers, 'chain-state': 'FAIL' },
  },
});
assert.equal(passWithFailedLayer.reportStatus, 'INVALID_EVIDENCE');
assert.match(String(passWithFailedLayer.checks[0]?.actual), /status=PASS.*FAIL\/INCOMPLETE layer/u);

const passWithFailedEvidenceIntegrity = decode({
  evidenceV3,
  reconciliationReport: {
    ...cleanPassReport,
    layers: { ...cleanPassReport.layers, evidenceIntegrity: 'FAIL' },
    integrity: { status: 'FAIL', invalid: false, reasons: ['contradictory fixture'] },
  },
});
assert.equal(passWithFailedEvidenceIntegrity.reportStatus, 'INVALID_EVIDENCE');
assert.match(String(passWithFailedEvidenceIntegrity.checks[0]?.actual), /integrity\.status=FAIL.*integrity\.invalid=true/u);

const passWithBlockingFailure = decode({
  evidenceV3,
  reconciliationReport: {
    ...cleanPassReport,
    checks: cleanPassReport.checks.map((check) => ({ ...check, verdict: 'FAIL' })),
  },
});
assert.equal(passWithBlockingFailure.reportStatus, 'INVALID_EVIDENCE');
assert.match(String(passWithBlockingFailure.checks[0]?.actual), /status=PASS.*blocking FAIL\/NOT_VERIFIED check/u);

const passWithDisguisedUnverifiedWarning = decode({
  evidenceV3,
  reconciliationReport: {
    ...cleanPassReport,
    checks: cleanPassReport.checks.map((check) => ({
      ...check,
      severity: 'warning',
      verification: 'NOT_VERIFIED',
      verdict: 'PASS',
    })),
  },
});
assert.equal(passWithDisguisedUnverifiedWarning.reportStatus, 'INVALID_EVIDENCE');
assert.match(String(passWithDisguisedUnverifiedWarning.checks[0]?.actual), /verification=NOT_VERIFIED.*verdict.*PASS/u);

const bareEnvelope = decode({
  ...evidenceV3,
  title: 'Bare envelope with report',
  reconciliationReport: report,
});
assert.equal(bareEnvelope.reportStatus, 'PASS_WITH_GAPS');
assert.equal(bareEnvelope.transactions.length, 4);

const bareWithoutReport = decode(evidenceV3);
assert.equal(bareWithoutReport.reportStatus, 'INVALID_EVIDENCE');
assert.equal(bareWithoutReport.checks.length, 1);
assert.match(String(bareWithoutReport.checks[0]?.actual), /缺少 reconciliationReport/u);

const oldIncompatibleReport = {
  ...report,
  checks: [{
    ...report.checks[0],
    verification: 'FULL_RECOMPUTE',
    formula: {
      id: 'legacy.formula',
      version: '0',
      expanded: 'legacy persisted formula without sources',
      inputs: [],
    },
  }],
};
assert.equal(reconciliationReportSchema.safeParse(oldIncompatibleReport).success, false);
const incompatible = decode({
  id: CASE_ID,
  title: 'Old structured report',
  checks: legacyChecks,
  evidenceV2,
  reconciliationReport: oldIncompatibleReport,
});
assert.equal(incompatible.reportStatus, 'INVALID_EVIDENCE');
assert.equal(incompatible.checks.length, 1);
assert.equal(incompatible.checks[0]?.name, 'evidence.integrity.structured-pair');
assert.doesNotMatch(String(incompatible.checks[0]?.actual), /trusted-by-old-reporter/u);
assert.match(String(incompatible.checks[0]?.note), /重新生成 ReconciliationReport/u);
assert.equal(incompatible.transactions.length, 4, '有效 Evidence 仍只展示已声明的 Action 交易');

const invalidV3ShadowsV2 = decode({
  id: CASE_ID,
  title: 'Invalid V3 must fail closed',
  checks: legacyChecks,
  evidenceV3: { ...evidenceV3, actions: 'malformed' },
  evidenceV2,
  reconciliationReport: report,
});
assert.equal(invalidV3ShadowsV2.reportStatus, 'INVALID_EVIDENCE');
assert.equal(invalidV3ShadowsV2.transactions.length, 0);
assert.match(String(invalidV3ShadowsV2.checks[0]?.actual), /evidenceV3 schema/u);

const mislabeledV3 = decode({
  evidenceV3: evidenceV2,
  reconciliationReport: report,
});
assert.equal(mislabeledV3.reportStatus, 'INVALID_EVIDENCE');
assert.match(String(mislabeledV3.checks[0]?.actual), /evidenceV3 wrapper.*schemaVersion=3.*实际为 2/u);

const mislabeledV2 = decode({
  evidenceV2: evidenceV3,
  reconciliationReport: report,
});
assert.equal(mislabeledV2.reportStatus, 'INVALID_EVIDENCE');
assert.match(String(mislabeledV2.checks[0]?.actual), /evidenceV2 wrapper.*schemaVersion=2.*实际为 3/u);

for (const field of ['caseId', 'variantId', 'executionId'] as const) {
  const mismatched = decode({
    id: CASE_ID,
    title: `Mismatched ${field}`,
    checks: legacyChecks,
    evidenceV3,
    reconciliationReport: { ...report, [field]: `wrong-${field}` },
  });
  assert.equal(mismatched.reportStatus, 'INVALID_EVIDENCE');
  assert.match(String(mismatched.checks[0]?.actual), new RegExp(`${field}.*不一致`, 'u'));
  assert.equal(mismatched.checks.length, 1);
}

const crossEnvironmentEvidence = evidenceEnvelopeV3Schema.parse({
  ...evidenceV3,
  environment: { ...evidenceV3.environment, name: 'oracle-fork' },
});
const crossEnvironmentReport = reconciliationReportSchema.parse({
  ...report,
  evidenceDigest: computeEvidenceDigest(crossEnvironmentEvidence),
});
const crossEnvironment = decode({
  evidenceV3: crossEnvironmentEvidence,
  reconciliationReport: crossEnvironmentReport,
});
assert.equal(crossEnvironment.reportStatus, 'INVALID_EVIDENCE');
assert.match(String(crossEnvironment.checks[0]?.actual), /environment\.name=oracle-fork.*project=tx-fork.*不一致/u);
assert.doesNotMatch(String(crossEnvironment.checks[0]?.actual), /evidenceDigest=.*不一致/u);

const externalHash = hash('e');
const externalBlockHash = hash('f');
const scannedEvidence = evidenceEnvelopeV3Schema.parse({
  ...evidenceV3,
  actions: evidenceV3.actions.map((action) => action.actionId !== 'TX2' ? action : {
    ...action,
    windowContamination: {
      status: 'POLLUTED',
      fromBlock: '102',
      toBlock: '102',
      inspectedBlocks: [{
        blockNumber: '102',
        blockHash: externalBlockHash,
        parentHash: hash('d'),
        transactionHashes: [externalHash],
      }],
      inspectedTransactions: [{
        txHash: externalHash,
        blockNumber: '102',
        blockHash: externalBlockHash,
        transactionIndex: '0',
        actor: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        nonce: '9',
      }],
      unexpectedTransactions: [{
        txHash: externalHash,
        blockNumber: '102',
        blockHash: externalBlockHash,
        transactionIndex: '0',
        actor: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        nonce: '9',
      }],
      source: { source: 'block-scan', path: 'fixture scan', blockNumber: '102' },
    },
  }),
});

assert.notEqual(computeEvidenceDigest(scannedEvidence), cleanPassReport.evidenceDigest);
const staleCleanPassReport = decode({
  evidenceV3: scannedEvidence,
  reconciliationReport: cleanPassReport,
});
assert.equal(staleCleanPassReport.reportStatus, 'INVALID_EVIDENCE');
assert.equal(staleCleanPassReport.checks.length, 1);
assert.match(String(staleCleanPassReport.checks[0]?.actual), /evidenceDigest=.*canonical Evidence digest=.*不一致/u);
assert.doesNotMatch(String(staleCleanPassReport.checks[0]?.actual), /trusted-by-old-reporter/u);

const pollutedBoundReport = reconciliationReportSchema.parse(
  reconcileMarketOpenRoundtrip(scannedEvidence),
);
const scannedCanonical = decode({ evidenceV3: scannedEvidence, reconciliationReport: pollutedBoundReport });
assert.equal(scannedCanonical.reportStatus, 'INVALID_EVIDENCE');
assert.equal(scannedCanonical.checks[0]?.name, pollutedBoundReport.checks[0]?.id);
assert.equal(scannedCanonical.transactions.length, 4);
assert.ok(scannedCanonical.transactions.every((item) => item.hash !== externalHash));

const scannedWithInvalidReport = decode({
  checks: legacyChecks,
  evidenceV3: scannedEvidence,
  reconciliationReport: {
    ...oldIncompatibleReport,
    evidenceDigest: computeEvidenceDigest(scannedEvidence),
  },
});
assert.equal(scannedWithInvalidReport.reportStatus, 'INVALID_EVIDENCE');
assert.equal(scannedWithInvalidReport.transactions.length, 4);
assert.ok(scannedWithInvalidReport.transactions.every((item) => item.hash !== externalHash));

const multiPhaseEvidence = evidenceEnvelopeV3Schema.parse({
  ...evidenceV3,
  flowType: 'multi-phase',
});
const multiPhaseReport = reconciliationReportSchema.parse({
  ...report,
  evidenceDigest: computeEvidenceDigest(multiPhaseEvidence),
});
const multiPhase = decode({ evidenceV3: multiPhaseEvidence, reconciliationReport: multiPhaseReport });
assert.equal(multiPhase.reportStatus, 'INVALID_EVIDENCE');
assert.match(String(multiPhase.checks[0]?.actual), /可信计划.*重放结果不一致/u);
assert.equal(multiPhase.transactions[0]?.actionKey, 'TX1:submitMarketIncrease');
assert.equal(multiPhase.transactions[0]?.label, 'TX1 · 提交增加仓位订单');
assert.equal(multiPhase.transactions[1]?.actionKey, 'TX2:executeOrder');

const legacy = decode({
  id: CASE_ID,
  title: 'True legacy attachment',
  checks: legacyChecks,
  evidence: {
    transactions: {
      createOpen: {
        txHash: hash('a'),
        blockNumber: 200,
        status: 'success',
        from: TRADER,
        to: ROUTER,
      },
    },
    scannedTransactions: [{
      txHash: externalHash,
      blockNumber: 201,
      actor: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    }],
  },
});
assert.equal(legacy.reportStatus, undefined);
assert.equal(legacy.checks[0]?.name, 'legacy runner self-check');
assert.equal(legacy.transactions.length, 1);
assert.ok(legacy.transactions.every((item) => item.hash !== externalHash));

const oldAttachment = {
  name: 'fixture-xt-old-evidence.json',
  contentType: 'application/json',
  path: 'old.json',
};
const finalAttachment = {
  name: 'fixture-xt-final-evidence.json',
  contentType: 'application/json',
  path: 'final.json',
};
const retriedResult = {
  ...result,
  attempts: [
    { retry: 0, status: 'failed', startedAt: NOW, durationMs: 1, attachments: [oldAttachment] },
    { retry: 1, status: 'passed', startedAt: NOW, durationMs: 1, attachments: [finalAttachment] },
  ],
} as ScenarioResult;
assert.equal(selectFinalFunctionalEvidenceAttachment(retriedResult)?.path, 'final.json');
const finalRetryWithoutEvidence = {
  ...retriedResult,
  attempts: [
    retriedResult.attempts[0],
    { ...retriedResult.attempts[1], attachments: [] },
  ],
} as ScenarioResult;
assert.equal(selectFinalFunctionalEvidenceAttachment(finalRetryWithoutEvidence), undefined);

console.log('Reporter evidence verification passed: trusted-plan replay + full environment binding + stale-PASS rejection + canonical display isolation');

import { z } from 'zod';

import { EVIDENCE_DIGEST_PATTERN } from '../../evidence/evidence-digest.js';
import { LEDGER_FIELD_ID_PATTERN } from '../ledger-field-id.js';

export const checkValueSchema = z.object({
  raw: z.string(),
  display: z.string().optional(),
  unit: z.string().optional(),
});
export type CheckValue = z.infer<typeof checkValueSchema>;

export const sourceRefSchema = z.object({
  layer: z.enum([
    'intent', 'chain-state', 'chain-event', 'parameter', 'oracle',
    'keeper', 'indexer', 'frontend', 'wallet-request', 'derived',
  ]),
  path: z.string().min(1),
  blockNumber: z.number().int().nonnegative().optional(),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
});
export type SourceRef = z.infer<typeof sourceRefSchema>;

export const formulaInputSchemaV2 = z.object({
  name: z.string().min(1),
  value: z.string(),
  source: sourceRefSchema,
});

/** 公式依据：详解层章节（packs 用 decrease-shared::basis 填）。登记进 schema 后引擎 parse 不再剥掉，报告 / 台账可回链。 */
export const formulaBasisSchema = z.object({
  section: z.string().min(1),
  title: z.string().min(1),
  sourcePath: z.string().min(1),
});
export type FormulaBasis = z.infer<typeof formulaBasisSchema>;

export const checkRecordSchema = z.object({
  id: z.string().min(1),
  packId: z.string().min(1),
  actionId: z.string().min(1),
  purpose: z.enum(['setup', 'primary', 'support', 'cleanup', 'whole-flow']),
  subject: z.enum(['chain-state', 'chain-event', 'keeper', 'indexer', 'frontend']),
  comparison: z.enum([
    'formula-vs-state', 'formula-vs-event', 'event-vs-state', 'state-vs-indexer',
    'indexer-vs-ui', 'formula-vs-ui', 'intent-vs-ui', 'ui-vs-wallet-request',
    'wallet-request-vs-event', 'state-vs-ui', 'invariant', 'presence',
  ]),
  actual: checkValueSchema,
  expected: checkValueSchema,
  /** 状态差分行的四列；事件/恒等式行可以省略。 */
  before: checkValueSchema.optional(),
  after: checkValueSchema.optional(),
  actualDelta: checkValueSchema.optional(),
  expectedDelta: checkValueSchema.optional(),
  expectedAfter: checkValueSchema.optional(),
  sources: z.array(sourceRefSchema).min(1),
  formula: z.object({
    id: z.string().min(1),
    version: z.string().min(1),
    expanded: z.string().min(1),
    inputs: z.array(formulaInputSchemaV2),
    rounding: z.string().optional(),
  }).optional(),
  verification: z.enum(['FULL_RECOMPUTE', 'EVENT_ANCHORED', 'IDENTITY', 'PRESENCE', 'NOT_VERIFIED']),
  severity: z.enum(['blocking', 'warning']),
  verdict: z.enum(['PASS', 'FAIL', 'NOT_VERIFIED', 'NOT_APPLICABLE']),
  difference: z.string().optional(),
  tolerance: z.string().optional(),
  note: z.string().optional(),
  /** 公式依据章节（可选；market-close / liquidation pack 每行都带）。 */
  formulaBasis: formulaBasisSchema.optional(),
  /**
   * 核对字段台账行 id（config/reconciliation-fields.json rows[].id），由 formulaBasis.section 经
   * src/reconciliation/ledger-field-id.ts::contractLedgerFieldId 派生；seed 按它精确匹配升 implemented。
   */
  ledgerFieldId: z.string().regex(LEDGER_FIELD_ID_PATTERN, 'ledgerFieldId 必须是台账四类 id 形状（c-/p-/f-/pair-）').optional(),
}).superRefine((check, context) => {
  if (check.verification === 'FULL_RECOMPUTE' && check.formula && check.formula.inputs.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['formula', 'inputs'],
      message: 'FULL_RECOMPUTE 公式必须登记至少一个可追溯 FormulaInput',
    });
  }
  if (check.verification === 'NOT_VERIFIED' && check.verdict === 'PASS') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['verdict'],
      message: 'verification=NOT_VERIFIED 时 verdict 不得为 PASS',
    });
  }
});
export type CheckRecord = z.infer<typeof checkRecordSchema>;

export const reconciliationReportSchema = z.object({
  schemaVersion: z.literal(2),
  caseId: z.string(),
  variantId: z.string(),
  executionId: z.string(),
  evidenceDigest: z.string().regex(
    EVIDENCE_DIGEST_PATTERN,
    'evidenceDigest 必须是 sha256:<64 lowercase hex>',
  ),
  checkPlan: z.strictObject({
    id: z.string().min(1),
    version: z.string().min(1),
  }),
  checkPlanDigest: z.string().regex(
    EVIDENCE_DIGEST_PATTERN,
    'checkPlanDigest 必须是 sha256:<64 lowercase hex>',
  ),
  status: z.enum(['PASS', 'PASS_WITH_GAPS', 'FAIL', 'BLOCKED', 'INVALID_EVIDENCE']),
  layers: z.record(z.string(), z.enum(['PASS', 'FAIL', 'INCOMPLETE', 'NOT_RUN', 'NOT_APPLICABLE'])),
  integrity: z.object({
    status: z.enum(['PASS', 'FAIL', 'INCOMPLETE']),
    invalid: z.boolean(),
    reasons: z.array(z.string()),
  }),
  checks: z.array(checkRecordSchema),
}).superRefine((report, context) => {
  const expectedLayerKeys = [
    'chain-state', 'chain-event', 'keeper', 'indexer', 'frontend', 'cleanup', 'evidenceIntegrity',
  ];
  const actualLayerKeys = Object.keys(report.layers);
  const missingLayerKeys = expectedLayerKeys.filter((key) => !Object.hasOwn(report.layers, key));
  const extraLayerKeys = actualLayerKeys.filter((key) => !expectedLayerKeys.includes(key));
  if (missingLayerKeys.length > 0 || extraLayerKeys.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['layers'],
      message: `Report V2 layers 必须恰好包含固定 7 层（缺少=${missingLayerKeys.join(',') || '无'}；多余=${extraLayerKeys.join(',') || '无'}）`,
    });
  }
  const evidenceIntegrityLayer = report.layers.evidenceIntegrity;
  if (report.integrity.status !== evidenceIntegrityLayer) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['integrity', 'status'],
      message: `integrity.status=${report.integrity.status} 必须等于 layers.evidenceIntegrity=${String(evidenceIntegrityLayer)}`,
    });
  }
  const expectedInvalid = report.status === 'INVALID_EVIDENCE';
  if (report.integrity.invalid !== expectedInvalid) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['integrity', 'invalid'],
      message: `integrity.invalid 必须等于 status===INVALID_EVIDENCE（期望 ${String(expectedInvalid)}）`,
    });
  }
  const integrityStatusIsInvalid = report.integrity.status === 'FAIL';
  if (report.integrity.invalid !== integrityStatusIsInvalid) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['integrity'],
      message: 'integrity.status=FAIL 与 integrity.invalid=true 必须同时成立',
    });
  }
  if (report.integrity.status === 'PASS' && report.integrity.reasons.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['integrity', 'reasons'],
      message: 'integrity.status=PASS 时 reasons 必须为空',
    });
  }
  if (report.integrity.status !== 'PASS' && report.integrity.reasons.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['integrity', 'reasons'],
      message: 'integrity.status=INCOMPLETE/FAIL 时必须提供原因',
    });
  }

  const businessLayerFailures = Object.entries(report.layers)
    .filter(([layer, verdict]) => layer !== 'evidenceIntegrity' && verdict === 'FAIL')
    .map(([layer]) => layer);
  const incompleteLayers = Object.entries(report.layers)
    .filter(([, verdict]) => verdict === 'INCOMPLETE')
    .map(([layer]) => layer);
  const blockingFailures = report.checks.filter((check) => check.severity === 'blocking' && check.verdict === 'FAIL');
  const blockingUnverified = report.checks.filter((check) => check.severity === 'blocking'
    && (check.verdict === 'NOT_VERIFIED' || check.verification === 'NOT_VERIFIED'));
  const warningGaps = report.checks.filter((check) => check.severity === 'warning'
    && (check.verdict === 'FAIL' || check.verdict === 'NOT_VERIFIED' || check.verification === 'NOT_VERIFIED'));

  if (report.status === 'PASS' && (businessLayerFailures.length > 0 || incompleteLayers.length > 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['status'],
      message: `status=PASS 不允许 FAIL/INCOMPLETE layer（FAIL=${businessLayerFailures.join(',') || '无'}；INCOMPLETE=${incompleteLayers.join(',') || '无'}）`,
    });
  }
  if (report.status === 'PASS' && (blockingFailures.length > 0 || blockingUnverified.length > 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['status'],
      message: `status=PASS 不允许 blocking FAIL/NOT_VERIFIED check（${[...blockingFailures, ...blockingUnverified].map((check) => check.id).join(',')}）`,
    });
  }
  if (report.status === 'PASS' && warningGaps.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['status'],
      message: `status=PASS 不允许 warning FAIL/NOT_VERIFIED check（${warningGaps.map((check) => check.id).join(',')}）`,
    });
  }
  if (report.status === 'PASS' && report.checks.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['checks'],
      message: 'status=PASS 至少需要一条由可信 CheckPlan 产生的核对行',
    });
  }
  if ((report.status === 'PASS' || report.status === 'PASS_WITH_GAPS')
    && (businessLayerFailures.length > 0 || blockingFailures.length > 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['status'],
      message: `业务 layer 或 blocking check 为 FAIL 时 status 不得为 ${report.status}`,
    });
  }
});
export type ReconciliationReport = z.infer<typeof reconciliationReportSchema>;

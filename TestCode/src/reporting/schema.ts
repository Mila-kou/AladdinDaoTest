import { z } from 'zod';

import { executionModeValues } from './test-environments.js';

export const resultStatusSchema = z.enum([
  'PASS',
  'FAIL',
  'FLAKY',
  'BLOCKED',
  'SKIP',
]);

export type ResultStatus = z.infer<typeof resultStatusSchema>;

export const scenarioCatalogItemSchema = z.object({
  id: z.string().regex(/^SCN-\d{3}$/),
  suite: z.string().regex(/^S\d{2}$/),
  suiteName: z.string().min(1),
  title: z.string().min(1),
  priority: z.enum(['P0', 'P1', 'P2']),
  // 历史 results.json 没有这个字段；缺省按"自动化"解析，实际取值在写报告前由
  // applyCatalogExecutionModes 按当前配置刷新，避免旧快照锁死旧口径。
  executionMode: z.enum(executionModeValues).default('automated'),
});

export type ScenarioCatalogItem = z.infer<typeof scenarioCatalogItemSchema>;

const attachmentSchema = z.object({
  name: z.string().min(1),
  contentType: z.string().min(1),
  path: z.string().optional(),
});

const executionLinkSchema = z.object({
  label: z.string().min(1),
  href: z.string().url().refine((value) => /^https?:\/\//.test(value), {
    message: '执行链接只允许 http/https URL',
  }),
});

const reconciliationSchema = z.object({
  id: z.string().min(1),
  group: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(['PASS', 'FAIL', 'CALCULATED', 'NOT_VERIFIED']),
  before: z.string(),
  after: z.string(),
  delta: z.string().optional(),
  expected: z.string(),
  formula: z.string().min(1),
  basis: z.object({
    title: z.string().min(1),
    sourcePath: z.string().min(1),
    section: z.string().min(1),
  }),
  unit: z.string().optional(),
  note: z.string().optional(),
  // 一笔交易确认后产生的一组核对数据。历史报告没有该字段时仍可展示在“全流程”。
  txStep: z.string().regex(/^TX\d+$/).optional(),
});

const transactionEvidenceSchema = z.object({
  actor: z.enum(['TRADER', 'KEEPER']),
  action: z.string().min(1),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  from: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  to: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  blockNumber: z.number().int().nonnegative(),
  status: z.enum(['SUCCESS', 'REVERTED', 'UNKNOWN']),
  transactionType: z.string().min(1),
  nonce: z.string().min(1),
  gasUsed: z.string().min(1),
  orderKey: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
  signatureVerified: z.boolean(),
  stepId: z.string().regex(/^TX\d+$/).optional(),
  summary: z.string().min(1).optional(),
});

const executionEvidenceSchema = z.object({
  mode: z.string().min(1),
  persistent: z.boolean(),
  executionStatus: z.enum(['PASS', 'FAIL']).optional(),
  coverageStatus: z.enum(['COMPLETE', 'PARTIAL']).optional(),
  coverageNote: z.string().min(1).optional(),
  forkDisplayName: z.string().min(1).optional(),
  sourcePath: z.string().min(1),
  formulaSourcePath: z.string().min(1),
  reconciliations: z.array(reconciliationSchema),
  transactions: z.array(transactionEvidenceSchema),
});

const attemptSchema = z.object({
  retry: z.number().int().nonnegative(),
  status: z.enum(['passed', 'failed', 'timedOut', 'skipped', 'interrupted']),
  startedAt: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
  error: z.string().optional(),
  attachments: z.array(attachmentSchema),
});

export const scenarioResultSchema = z.object({
  id: z.string().regex(/^SCN-\d{3}$/),
  testId: z.string().min(1),
  suite: z.string().regex(/^S\d{2}$/),
  scenarioTitle: z.string().min(1),
  testTitle: z.string().min(1),
  priority: z.enum(['P0', 'P1', 'P2']),
  project: z.string().min(1),
  environment: z.string().min(1),
  status: resultStatusSchema,
  checkResult: z.string().min(1),
  executionLinks: z.array(executionLinkSchema),
  executionEvidence: executionEvidenceSchema.optional(),
  executedAt: z.string().datetime(),
  expectedStatus: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
  attempts: z.array(attemptSchema).min(1),
  tags: z.array(z.string()),
  annotations: z.array(
    z.object({
      type: z.string().min(1),
      description: z.string().optional(),
    }),
  ),
  error: z.string().optional(),
});

export type ScenarioResult = z.infer<typeof scenarioResultSchema>;

const qualityIssueSchema = z.object({
  severity: z.enum(['ERROR', 'WARNING']),
  code: z.string().min(1),
  message: z.string().min(1),
});

export const testRunArtifactSchema = z.object({
  schemaVersion: z.literal(2),
  sourceStatus: z.enum(['ready', 'fixture']),
  source: z.object({
    kind: z.literal('playwright-reporter'),
    grain: z.literal('one row per scenario and Playwright project final outcome'),
    generatedAt: z.string().min(1),
    catalogPath: z.string().min(1),
    metricDefinitions: z.record(z.string(), z.string()),
  }),
  run: z.object({
    id: z.string().min(1),
    startedAt: z.string().min(1),
    endedAt: z.string().min(1),
    durationMs: z.number().int().nonnegative(),
    playwrightStatus: z.enum(['passed', 'failed', 'timedout', 'interrupted']),
    environments: z.array(z.string()),
    projectNames: z.array(z.string()),
    discoveredTests: z.number().int().nonnegative(),
    release: z.string().optional(),
    forkBlockNumber: z.string().optional(),
  }),
  catalog: z.array(scenarioCatalogItemSchema),
  results: z.array(scenarioResultSchema),
  qualityIssues: z.array(qualityIssueSchema),
});

export type TestRunArtifact = z.infer<typeof testRunArtifactSchema>;

export function validateTestRunArtifact(input: unknown): TestRunArtifact {
  const artifact = testRunArtifactSchema.parse(input);
  const catalogIds = new Set<string>();
  for (const item of artifact.catalog) {
    if (catalogIds.has(item.id)) {
      throw new Error(`场景目录存在重复编号：${item.id}`);
    }
    catalogIds.add(item.id);
  }

  for (const result of artifact.results) {
    if (!catalogIds.has(result.id)) {
      throw new Error(`运行结果引用了目录之外的编号：${result.id}`);
    }
  }

  return artifact;
}

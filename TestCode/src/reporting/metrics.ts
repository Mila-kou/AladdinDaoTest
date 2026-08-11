import type {
  ResultStatus,
  ScenarioCatalogItem,
  ScenarioResult,
} from './schema.js';

export const resultStatuses: ResultStatus[] = [
  'PASS',
  'FAIL',
  'FLAKY',
  'BLOCKED',
  'SKIP',
];

export interface ResultMetrics {
  readonly planned: number;
  readonly automatable: number;
  readonly manual: number;
  readonly automated: number;
  readonly notAutomated: number;
  readonly executed: number;
  readonly pass: number;
  readonly fail: number;
  readonly flaky: number;
  readonly blocked: number;
  readonly skipped: number;
  readonly finalSuccessRate: number | null;
  readonly stablePassRate: number | null;
  readonly automationCoverage: number | null;
  readonly durationMs: number;
}

export function computeResultMetrics(
  catalog: ScenarioCatalogItem[],
  results: ScenarioResult[],
): ResultMetrics {
  const count = (status: ResultStatus) =>
    results.filter((result) => result.status === status).length;
  const manualIds = new Set(
    catalog.filter((item) => item.executionMode === 'manual').map((item) => item.id),
  );
  // 手工用例既不进覆盖率分母，也不能算进分子；即使误挂了自动化结果也不抬高覆盖率。
  const automatedIds = new Set(
    results.map((result) => result.id).filter((id) => !manualIds.has(id)),
  );
  const automatable = Math.max(0, catalog.length - manualIds.size);
  const pass = count('PASS');
  const fail = count('FAIL');
  const flaky = count('FLAKY');
  const blocked = count('BLOCKED');
  const skipped = count('SKIP');
  const executed = pass + fail + flaky;

  return {
    planned: catalog.length,
    automatable,
    manual: manualIds.size,
    automated: automatedIds.size,
    notAutomated: Math.max(0, automatable - automatedIds.size),
    executed,
    pass,
    fail,
    flaky,
    blocked,
    skipped,
    finalSuccessRate: executed === 0 ? null : (pass + flaky) / executed,
    stablePassRate: executed === 0 ? null : pass / executed,
    automationCoverage: automatable === 0 ? null : automatedIds.size / automatable,
    durationMs: results.reduce((total, result) => total + result.durationMs, 0),
  };
}

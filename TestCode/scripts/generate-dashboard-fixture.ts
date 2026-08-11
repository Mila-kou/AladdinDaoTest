import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { loadScenarioCatalog } from '../src/reporting/catalog.js';
import { metricDefinitions } from '../src/reporting/metric-definitions.js';
import type { ResultStatus, ScenarioCatalogItem, ScenarioResult, TestRunArtifact } from '../src/reporting/schema.js';
import { writeRunOutputs } from '../src/reporting/write-outputs.js';

const catalogPath = resolve(
  process.cwd(),
  process.env.E2E_SCENARIO_CATALOG ?? '../TestCase/E2E/SCENARIO-CHECKLIST.md',
);
let catalog: ScenarioCatalogItem[];
try {
  catalog = await loadScenarioCatalog(catalogPath);
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code !== 'ENOENT') throw error;
  const latest = JSON.parse(
    await readFile(resolve(process.cwd(), 'artifacts/latest/results.json'), 'utf8'),
  ) as TestRunArtifact;
  catalog = latest.catalog;
  console.warn(`场景清单不存在，Fixture 使用 artifacts/latest/results.json 中的 ${catalog.length} 条归档目录。`);
}
const now = new Date();
const startedAt = new Date(now.getTime() - 94_000);

const fixtureStatuses: Array<[string, ResultStatus, number, string?]> = [
  ['SCN-001', 'PASS', 6_200],
  ['SCN-009', 'PASS', 18_500],
  ['SCN-026', 'FLAKY', 22_100, '第一次等待 Indexer 超时，重试后页面与 Reader 一致。'],
  ['SCN-039', 'BLOCKED', 0, 'TIME_FORK baseline 尚未配置。'],
  ['SCN-069', 'FAIL', 15_700, 'triggerPrice-1 时订单没有进入预期执行状态。'],
  ['SCN-074', 'PASS', 8_900],
  ['SCN-075', 'SKIP', 0, 'Fixture 中不执行真实时间推进。'],
  ['SCN-079', 'PASS', 22_600],
];

const catalogById = new Map(catalog.map((item) => [item.id, item]));
const results: ScenarioResult[] = fixtureStatuses.map(([id, status, durationMs, error]) => {
  const scenario = catalogById.get(id);
  if (!scenario) {
    throw new Error(`Fixture 找不到 ${id}`);
  }
  const attempts = status === 'FLAKY'
    ? [
        {
          retry: 0,
          status: 'timedOut' as const,
          startedAt: startedAt.toISOString(),
          durationMs: 15_000,
          error,
          attachments: [{ name: 'trace', contentType: 'application/zip', path: 'artifacts/fixture/trace.zip' }],
        },
        {
          retry: 1,
          status: 'passed' as const,
          startedAt: new Date(startedAt.getTime() + 16_000).toISOString(),
          durationMs: 7_100,
          attachments: [{ name: 'screenshot', contentType: 'image/png', path: 'artifacts/fixture/pass.png' }],
        },
      ]
    : [
        {
          retry: 0,
          status:
            status === 'PASS' ? ('passed' as const)
              : status === 'SKIP' || status === 'BLOCKED' ? ('skipped' as const)
                : ('failed' as const),
          startedAt: startedAt.toISOString(),
          durationMs,
          ...(error ? { error } : {}),
          attachments: status === 'PASS'
            ? [{ name: 'tx-and-reader', contentType: 'application/json', path: `artifacts/fixture/${id}.json` }]
            : [],
        },
      ];

  return {
    id,
    testId: `fixture-${id}`,
    suite: scenario.suite,
    scenarioTitle: scenario.title,
    testTitle: `${id} fixture preview`,
    priority: scenario.priority,
    project: id === 'SCN-069' ? 'oracle-fork' : id === 'SCN-075' || id === 'SCN-079' ? 'time-fork' : 'tx-fork',
    environment: id === 'SCN-069' ? 'oracle-fork' : id === 'SCN-075' || id === 'SCN-079' ? 'time-fork' : 'tx-fork',
    status,
    checkResult:
      status === 'PASS' ? '页面、Reader、事件与预期值一致'
        : status === 'FLAKY' ? '首次 Indexer 超时，重试后页面与 Reader 一致'
          : status === 'FAIL' ? 'triggerPrice 边界核对失败：订单状态不符合预期'
            : status === 'BLOCKED' ? '缺少 TIME_FORK baseline，无法完成核对'
              : 'Fixture 预览不执行真实时间推进',
    executionLinks: ['BLOCKED', 'SKIP'].includes(status)
      ? []
      : [{ label: 'Fixture 结果接口', href: `http://localhost:4173/api/results#${id}` }],
    executedAt: new Date(startedAt.getTime() + Number(id.slice(4)) * 1_000).toISOString(),
    expectedStatus: 'passed',
    durationMs,
    attempts,
    tags: [`@${scenario.priority.toLowerCase()}`],
    annotations: status === 'BLOCKED' ? [{ type: 'blocked', description: error }] : [],
    ...(status === 'FAIL' || status === 'FLAKY' ? { error } : {}),
  };
});

const artifact: TestRunArtifact = {
  schemaVersion: 2,
  sourceStatus: 'fixture',
  source: {
    kind: 'playwright-reporter',
    grain: 'one row per scenario and Playwright project final outcome',
    generatedAt: now.toISOString(),
    catalogPath: '../TestCase/E2E/SCENARIO-CHECKLIST.md',
    metricDefinitions: { ...metricDefinitions },
  },
  run: {
    id: 'fixture-preview',
    startedAt: startedAt.toISOString(),
    endedAt: now.toISOString(),
    durationMs: now.getTime() - startedAt.getTime(),
    playwrightStatus: 'failed',
    environments: ['tx-fork', 'oracle-fork', 'time-fork'],
    projectNames: ['tx-fork', 'oracle-fork', 'time-fork'],
    discoveredTests: results.length,
    release: 'release-v0.3.1-fixture',
    forkBlockNumber: 'fixture',
  },
  catalog,
  results,
  qualityIssues: [],
};

const outputDirectory = resolve(process.cwd(), 'artifacts/fixture-dashboard');
const receipt = await writeRunOutputs(artifact, outputDirectory);
console.log({ status: 'FIXTURE_BUILT', ...receipt });

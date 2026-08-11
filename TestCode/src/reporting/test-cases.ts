import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

import type { ScenarioCatalogItem, ScenarioResult } from './schema.js';
import { loadTestCaseOverrides } from './test-case-overrides.js';
import {
  defaultExecutionMode,
  defaultTestEnvironment,
  type ExecutionMode,
  type TestEnvironmentDefinition,
} from './test-environments.js';

export interface TestCaseDefinition extends TestEnvironmentDefinition {
  readonly id: string;
  readonly suite: string;
  readonly suiteName: string;
  readonly title: string;
  readonly priority: 'P0' | 'P1' | 'P2';
  readonly executionMode: ExecutionMode;
  readonly roleIntent: string;
  readonly preconditions: string;
  readonly testData: string;
  readonly steps: string;
  readonly expected: string;
  readonly cleanup: string;
  readonly sourcePath: string;
  readonly edited: boolean;
  readonly updatedAt?: string;
}

export interface TestCaseView extends TestCaseDefinition {
  readonly executions: Array<Pick<ScenarioResult, 'project' | 'environment' | 'status' | 'executedAt'>>;
}

function cells(line: string): string[] {
  return line.trim().slice(1, -1).split('|').map((value) => value.trim());
}

export async function loadTestCases(
  catalog: ScenarioCatalogItem[],
  catalogPath: string,
): Promise<TestCaseDefinition[]> {
  const scenariosDirectory = resolve(
    process.cwd(),
    process.env.E2E_SCENARIO_DETAILS_DIR ?? join(dirname(catalogPath), 'scenarios'),
  );
  const detailById = new Map<string, Omit<
    TestCaseDefinition,
    | 'suite' | 'suiteName' | 'title' | 'priority' | 'edited' | 'updatedAt' | 'executionMode'
    | keyof TestEnvironmentDefinition
  >>();

  try {
    const files = (await readdir(scenariosDirectory))
      .filter((name) => name.endsWith('.md'))
      .sort();
    for (const file of files) {
      const path = join(scenariosDirectory, file);
      const source = await readFile(path, 'utf8');
      for (const line of source.split(/\r?\n/)) {
        if (!/^\|\s*SCN-\d{3}\s*\/\s*P[0-2]\s*\|/.test(line)) continue;
        const values = cells(line);
        if (values.length !== 7) throw new Error(`测试用例明细列数错误：${path}\n${line}`);
        const id = /SCN-\d{3}/.exec(values[0] ?? '')?.[0];
        if (!id) continue;
        detailById.set(id, {
          id,
          roleIntent: values[1] ?? '',
          preconditions: values[2] ?? '',
          testData: values[3] ?? '',
          steps: values[4] ?? '',
          expected: values[5] ?? '',
          cleanup: values[6] ?? '',
          sourcePath: relative(process.cwd(), path),
        });
      }
    }
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code !== 'ENOENT') throw error;
    const archivedPath = resolve(
      process.cwd(),
      process.env.E2E_ARCHIVED_TEST_CASES_HTML ?? 'artifacts/latest/test-cases.html',
    );
    const archivedHtml = await readFile(archivedPath, 'utf8');
    const payloadMatch = /<script id="test-case-data" type="application\/json">([\s\S]*?)<\/script>/.exec(archivedHtml);
    if (!payloadMatch?.[1]) throw new Error(`历史测试用例页面缺少结构化数据：${archivedPath}`);
    const payload = JSON.parse(payloadMatch[1]) as { cases?: TestCaseDefinition[] };
    for (const item of payload.cases ?? []) {
      detailById.set(item.id, {
        id: item.id,
        roleIntent: item.roleIntent,
        preconditions: item.preconditions,
        testData: item.testData,
        steps: item.steps,
        expected: item.expected,
        cleanup: item.cleanup,
        sourcePath: item.sourcePath,
      });
    }
  }

  const overrides = await loadTestCaseOverrides();
  return catalog.map((item) => {
    const detail = detailById.get(item.id);
    if (!detail) throw new Error(`没有找到 ${item.id} 的场景明细。`);
    const override = overrides[item.id];
    const environment = defaultTestEnvironment(item.id);
    return {
      ...detail,
      ...environment,
      suite: item.suite,
      suiteName: item.suiteName,
      title: item.title,
      priority: item.priority,
      executionMode: override?.executionMode ?? defaultExecutionMode(item.id),
      targetProject: override?.targetProject ?? environment.targetProject,
      marketMode: override?.marketMode ?? environment.marketMode,
      oracleMode: override?.oracleMode ?? environment.oracleMode,
      marketCompatibility: override?.marketCompatibility ?? environment.marketCompatibility,
      timeMode: override?.timeMode ?? environment.timeMode,
      signingMode: override?.signingMode ?? environment.signingMode,
      mockResourceAlias: override?.mockResourceAlias ?? environment.mockResourceAlias,
      environmentSetup: override?.environmentSetup ?? environment.environmentSetup,
      roleIntent: override?.roleIntent ?? detail.roleIntent,
      preconditions: override?.preconditions ?? detail.preconditions,
      testData: override?.testData ?? detail.testData,
      steps: override?.steps ?? detail.steps,
      expected: override?.expected ?? detail.expected,
      cleanup: override?.cleanup ?? detail.cleanup,
      edited: Boolean(override),
      ...(override ? { updatedAt: override.updatedAt } : {}),
    };
  });
}

export function attachExecutions(
  cases: TestCaseDefinition[],
  results: ScenarioResult[],
): TestCaseView[] {
  return cases.map((testCase) => ({
    ...testCase,
    executions: results
      .filter((result) => result.id === testCase.id)
      .map(({ project, environment, status, executedAt }) => ({
        project, environment, status, executedAt,
      })),
  }));
}

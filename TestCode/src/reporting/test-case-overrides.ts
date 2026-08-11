import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { z } from 'zod';

import type { ScenarioCatalogItem } from './schema.js';
import { getSuiteName } from './suite-names.js';
import {
  defaultExecutionMode,
  executionModeValues,
  marketModeValues,
  marketCompatibilityValues,
  oracleModeValues,
  signingModeValues,
  testProjectValues,
  timeModeValues,
} from './test-environments.js';

export const testCaseEditableFieldsSchema = z.object({
  suite: z.string().regex(/^S0[1-8]$/),
  title: z.string().trim().min(1).max(300),
  priority: z.enum(['P0', 'P1', 'P2']),
  targetProject: z.enum(testProjectValues),
  marketMode: z.enum(marketModeValues),
  oracleMode: z.enum(oracleModeValues),
  marketCompatibility: z.enum(marketCompatibilityValues),
  timeMode: z.enum(timeModeValues),
  signingMode: z.enum(signingModeValues),
  mockResourceAlias: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,47}$/, {
    message: 'Mock 资源别名只允许小写字母、数字和连字符，长度 1–48。',
  }),
  // 可选：旧的覆盖记录没有这个字段，此时回落到 defaultExecutionMode(id)，
  // 不能给默认值，否则旧记录会把代码里的手工基线覆盖成"自动化"。
  executionMode: z.enum(executionModeValues).optional(),
  environmentSetup: z.string().trim().min(1).max(20_000),
  roleIntent: z.string().trim().min(1).max(5_000),
  preconditions: z.string().trim().min(1).max(10_000),
  testData: z.string().trim().min(1).max(10_000),
  steps: z.string().trim().min(1).max(20_000),
  expected: z.string().trim().min(1).max(20_000),
  cleanup: z.string().trim().min(1).max(10_000),
});

export type TestCaseEditableFields = z.infer<typeof testCaseEditableFieldsSchema>;

const overrideSchema = testCaseEditableFieldsSchema.extend({
  updatedAt: z.string().datetime(),
});

const overridesFileSchema = z.object({
  schemaVersion: z.literal(1),
  cases: z.record(z.string().regex(/^SCN-\d{3}$/), overrideSchema),
});

export type TestCaseOverride = z.infer<typeof overrideSchema>;

function overridesPath(): string {
  return resolve(
    process.cwd(),
    process.env.E2E_TEST_CASE_OVERRIDES ?? './config/test-case-overrides.json',
  );
}

export async function loadTestCaseOverrides(): Promise<Record<string, TestCaseOverride>> {
  const path = overridesPath();
  try {
    return overridesFileSchema.parse(JSON.parse(await readFile(path, 'utf8'))).cases;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

export async function applyCatalogOverrides(
  catalog: ScenarioCatalogItem[],
): Promise<ScenarioCatalogItem[]> {
  const overrides = await loadTestCaseOverrides();
  return catalog.map((item) => {
    const override = overrides[item.id];
    const executionMode = override?.executionMode ?? defaultExecutionMode(item.id);
    if (!override) return { ...item, executionMode };
    return {
      ...item,
      suite: override.suite,
      suiteName: getSuiteName(override.suite),
      title: override.title,
      priority: override.priority,
      executionMode,
    };
  });
}

/**
 * 历史 results.json 里的 catalog 是当次运行时固化的，可能还没有 executionMode 或
 * 记录的是旧口径。渲染前按当前配置刷新，保证看板、指标与用例库对"手工核对"的判断同源。
 */
export async function applyCatalogExecutionModes(
  catalog: ScenarioCatalogItem[],
): Promise<ScenarioCatalogItem[]> {
  const overrides = await loadTestCaseOverrides();
  return catalog.map((item) => ({
    ...item,
    executionMode: overrides[item.id]?.executionMode ?? defaultExecutionMode(item.id),
  }));
}

export async function saveTestCaseOverride(
  id: string,
  input: unknown,
): Promise<TestCaseOverride> {
  if (!/^SCN-\d{3}$/.test(id)) throw new Error(`无效测试用例编号：${id}`);
  const fields = testCaseEditableFieldsSchema.parse(input);
  const path = overridesPath();
  const cases = await loadTestCaseOverrides();
  // 旧版用例库页面的表单没有"执行方式"控件，提交体不含 executionMode。
  // 整条替换会把已有的手工核对标记静默抹掉，所以缺字段时保留原值。
  const previousExecutionMode = cases[id]?.executionMode;
  const executionMode = fields.executionMode ?? previousExecutionMode;
  const saved = {
    ...fields,
    ...(executionMode ? { executionMode } : {}),
    updatedAt: new Date().toISOString(),
  };
  const next = overridesFileSchema.parse({
    schemaVersion: 1,
    cases: { ...cases, [id]: saved },
  });
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
  return saved;
}

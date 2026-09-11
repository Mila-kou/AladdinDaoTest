import { basename, relative, resolve } from 'node:path';

import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestError,
  TestResult,
} from '@playwright/test/reporter';

import { isReleaseMismatch, resolveRunRelease, targetRelease } from '../config/baseline.js';
import { loadScenarioCatalog } from './catalog.js';
import { mergeLatestSnapshot, readLatestSnapshot } from './latest-snapshot.js';
import { metricDefinitions } from './metric-definitions.js';
import type {
  ResultStatus,
  ScenarioCatalogItem,
  ScenarioResult,
  TestRunArtifact,
} from './schema.js';
import { loadVersionCases } from './version-cases.js';
import { writeRunOutputs } from './write-outputs.js';

interface ReporterOptions {
  readonly outputRoot?: string;
  readonly latestOutput?: string;
  readonly catalogPath?: string;
}

function cleanRunId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
}

function defaultRunId(startedAt: Date): string {
  return cleanRunId(startedAt.toISOString().replaceAll(':', '').replaceAll('.', '-'));
}

function formatError(error: TestError | undefined): string | undefined {
  if (!error) {
    return undefined;
  }
  const value = error.stack ?? error.message ?? String(error.value ?? 'Unknown test error');
  return value.slice(0, 20_000);
}

function attachmentPath(path: string | undefined): string | undefined {
  if (!path) {
    return undefined;
  }
  const result = relative(process.cwd(), path);
  return result.startsWith('..') ? basename(path) : result;
}

function formatAttempt(result: TestResult) {
  const error = formatError(result.error);
  return {
    retry: result.retry,
    status: result.status,
    startedAt: result.startTime.toISOString(),
    durationMs: result.duration,
    ...(error ? { error } : {}),
    attachments: result.attachments.map((attachment) => {
      const path = attachmentPath(attachment.path);
      return {
        name: attachment.name,
        contentType: attachment.contentType,
        ...(path ? { path } : {}),
      };
    }),
  };
}

function classify(test: TestCase, finalResult: TestResult): ResultStatus {
  const annotations = finalResult.annotations.map((annotation) => annotation.type.toLowerCase());
  if (annotations.includes('blocked')) {
    return 'BLOCKED';
  }
  if (test.outcome() === 'skipped' || finalResult.status === 'skipped') {
    return 'SKIP';
  }
  if (test.outcome() === 'flaky') {
    return 'FLAKY';
  }
  if (test.outcome() === 'unexpected') {
    return 'FAIL';
  }
  if (finalResult.status === 'passed') {
    return 'PASS';
  }
  // test.fail() 等已知失败不能伪装成 PASS；没有显式 blocked 注解时作为 FAIL。
  return 'FAIL';
}

function annotationDescription(
  result: TestResult,
  types: readonly string[],
): string | undefined {
  const wanted = new Set(types.map((type) => type.toLowerCase()));
  return result.annotations.find(
    (annotation) => wanted.has(annotation.type.toLowerCase()) && annotation.description?.trim(),
  )?.description?.trim();
}

function fallbackCheckResult(status: ResultStatus, error: string | undefined): string {
  switch (status) {
    case 'PASS': return '自动核对通过';
    case 'FLAKY': return '重试后自动核对通过';
    case 'BLOCKED': return '执行条件阻塞，未完成核对';
    case 'SKIP': return '本次未执行核对';
    case 'FAIL': return error?.split('\n')[0]?.slice(0, 500) || '自动核对失败';
  }
}

function executionLinks(result: TestResult): ScenarioResult['executionLinks'] {
  return result.annotations.flatMap((annotation) => {
    const type = annotation.type.toLowerCase();
    if (!['execution-link', 'tx-link'].includes(type) || !annotation.description) {
      return [];
    }

    const raw = annotation.description.trim();
    const separator = raw.indexOf('|');
    const label = separator >= 0
      ? raw.slice(0, separator).trim()
      : type === 'tx-link' ? '链上交易' : '执行详情';
    const href = (separator >= 0 ? raw.slice(separator + 1) : raw).trim();
    try {
      const url = new URL(href);
      if (!['http:', 'https:'].includes(url.protocol)) return [];
      return [{ label: label || '执行详情', href: url.href }];
    } catch {
      return [];
    }
  });
}

// —— 版本功能用例（CT/XT/FT）标题识别 ——跨会话锁定约定：测试标题「<ID> <标题> @p0/@p1 @readonly|@tx」，
// ID 满足 ^(?:CT|XT|FT)-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3}$。SCN 提取与校验保持原样，本组仅服务
// 「没有 SCN 编号」时的新增分支。
const FUNCTIONAL_TITLE_ID = /\b(?:CT|XT|FT)-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3}(?!\d)/;

type FunctionalPriority = ScenarioCatalogItem['priority'];

interface FunctionalCatalogIndex {
  readonly release: string;
  readonly byId: ReadonlyMap<string, { readonly title: string; readonly priority: FunctionalPriority }>;
}

/**
 * 功能用例目录：TestCase/E2E/versions/<release>/Trade-测试用例矩阵.md，
 * release 取 CURRENT.json primary.version（loadVersionCases 已容错——CURRENT.json 缺失、
 * versions/ 目录或矩阵文件不存在都不抛错，得到空索引，reporter 逐条记 WARNING 回退）。
 */
async function loadFunctionalCatalog(): Promise<FunctionalCatalogIndex> {
  const byId = new Map<string, { title: string; priority: FunctionalPriority }>();
  try {
    const data = await loadVersionCases(process.cwd());
    const view = data.versions.find((item) => item.release === data.defaultRelease) ?? data.versions[0];
    for (const section of view?.sections ?? []) {
      for (const item of section.cases) {
        if (/^P[0-2]$/.test(item.priority)) {
          byId.set(item.id, { title: item.title, priority: item.priority as FunctionalPriority });
        }
      }
    }
    return { release: view?.release ?? data.defaultRelease, byId };
  } catch {
    return { release: '', byId };
  }
}

/** 矩阵缺行时的标题回退：测试标题去掉 ID 与 @ 标签。 */
function functionalFallbackTitle(testTitle: string, id: string): string {
  const stripped = testTitle.replace(id, ' ').replace(/@[\w-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return stripped || testTitle;
}

/** 矩阵缺行时的优先级回退：标题 @p0/@p1/@p2 标记；再缺省 P1。 */
function functionalFallbackPriority(testTitle: string): FunctionalPriority {
  const match = /@p([0-2])\b/i.exec(testTitle);
  return match ? (`P${match[1]}` as FunctionalPriority) : 'P1';
}

function makeScenarioResult(
  test: TestCase,
  scenario: ScenarioCatalogItem,
): ScenarioResult | undefined {
  const attempts = test.results.length > 0 ? test.results : [];
  const finalResult = attempts.at(-1);
  if (!finalResult) {
    return undefined;
  }

  const project = test.parent.project();
  const projectName = project?.name ?? 'unknown-project';
  const environment = String(project?.metadata.e2eEnvironment ?? projectName);
  const error = formatError(finalResult.error);
  const status = classify(test, finalResult);
  const checkResult = annotationDescription(finalResult, ['check-result'])
    ?? annotationDescription(finalResult, ['blocked'])
    ?? fallbackCheckResult(status, error);

  return {
    id: scenario.id,
    testId: test.id,
    suite: scenario.suite,
    scenarioTitle: scenario.title,
    testTitle: test.title,
    priority: scenario.priority,
    project: projectName,
    environment,
    status,
    checkResult,
    ...(process.env.E2E_BATCH_ID ? { batchId: cleanRunId(process.env.E2E_BATCH_ID) } : {}),
    ...(process.env.E2E_RUN_ID ? { resultRunId: cleanRunId(process.env.E2E_RUN_ID) } : {}),
    executionLinks: executionLinks(finalResult),
    executedAt: finalResult.startTime.toISOString(),
    expectedStatus: test.expectedStatus,
    durationMs: attempts.reduce((total, attempt) => total + attempt.duration, 0),
    attempts: attempts.map(formatAttempt),
    tags: [...test.tags],
    annotations: finalResult.annotations.map((annotation) => ({
      type: annotation.type,
      ...(annotation.description ? { description: annotation.description } : {}),
    })),
    ...(error ? { error } : {}),
  };
}

export default class Fx100Reporter implements Reporter {
  private readonly options: Required<ReporterOptions>;
  private startedAt = new Date();
  private tests: TestCase[] = [];

  constructor(options: ReporterOptions = {}) {
    this.options = {
      outputRoot: options.outputRoot ?? 'artifacts/runs',
      latestOutput: options.latestOutput ?? 'artifacts/latest',
      catalogPath: options.catalogPath ?? '../TestCase/E2E/SCENARIO-CHECKLIST.md',
    };
  }

  printsToStdio(): boolean {
    return false;
  }

  onBegin(_config: FullConfig, suite: Suite): void {
    this.startedAt = new Date();
    this.tests = suite.allTests();
  }

  async onEnd(result: FullResult): Promise<{ status?: FullResult['status'] } | undefined> {
    try {
      if (this.tests.length === 0) {
        console.error('FX100 Reporter: 本次没有发现任何测试，不生成或覆盖结果看板。');
        return { status: 'failed' };
      }
      // `playwright test --list` 会触发 Reporter 生命周期，但不会生成 TestResult。
      // 这不是一次执行，不能写 run 目录，更不能用 MISSING_RESULT 覆盖 latest 看板。
      if (this.tests.every((test) => test.results.length === 0)) {
        console.log(`FX100 Reporter: 仅发现 ${this.tests.length} 条测试，未执行；不生成或覆盖结果看板。`);
        return undefined;
      }

      const catalogPath = resolve(
        process.cwd(),
        process.env.E2E_SCENARIO_CATALOG ?? this.options.catalogPath,
      );
      const catalog = await loadScenarioCatalog(catalogPath);
      const catalogById = new Map(catalog.map((scenario) => [scenario.id, scenario]));
      const qualityIssues: TestRunArtifact['qualityIssues'] = [];
      const scenarioResults: ScenarioResult[] = [];
      const resultKeys = new Set<string>();
      // 版本功能用例目录懒加载：纯 SCN 跑批不读矩阵，行为不变。
      let functionalCatalog: FunctionalCatalogIndex | undefined;

      for (const test of this.tests) {
        const id = /SCN-\d{3}/.exec(test.titlePath().join(' '))?.[0];
        if (!id) {
          // —— 新增分支：版本功能用例（CT/XT/FT）。标题命中任务书 ID 正则时按版本矩阵取标题/优先级；
          //    矩阵里不存在的 ID 记 WARNING（annotation + qualityIssues.note）仍入结果，不判 ERROR。 ——
          const functionalId = FUNCTIONAL_TITLE_ID.exec(test.titlePath().join(' '))?.[0];
          if (functionalId) {
            functionalCatalog ??= await loadFunctionalCatalog();
            const entry = functionalCatalog.byId.get(functionalId);
            if (!entry) {
              qualityIssues.push({
                severity: 'WARNING',
                code: 'UNKNOWN_VERSION_CASE',
                message: `功能用例 ${functionalId} 不在版本矩阵`
                  + `（release ${functionalCatalog.release || '未登记'}）中：标题/优先级回退测试标题与 @p 标记。`,
              });
            }
            const scenarioResult = makeScenarioResult(test, {
              id: functionalId,
              suite: functionalId.slice(0, 2),
              suiteName: '版本功能用例',
              title: entry?.title ?? functionalFallbackTitle(test.title, functionalId),
              priority: entry?.priority ?? functionalFallbackPriority(test.title),
              executionMode: 'automated',
            });
            if (!scenarioResult) {
              qualityIssues.push({
                severity: 'ERROR',
                code: 'MISSING_RESULT',
                message: `${functionalId} 在 ${test.parent.project()?.name ?? 'unknown-project'} 没有任何 Playwright TestResult。`,
              });
              continue;
            }
            const annotated = entry ? scenarioResult : {
              ...scenarioResult,
              annotations: [...scenarioResult.annotations, {
                type: 'catalog-warning',
                description: `编号不在版本矩阵中（release ${functionalCatalog.release || '未登记'}），标题/优先级来自测试标题回退。`,
              }],
            };
            const functionalKey = `${annotated.id}:${annotated.project}`;
            if (resultKeys.has(functionalKey)) {
              qualityIssues.push({
                severity: 'ERROR',
                code: 'DUPLICATE_SCENARIO_PROJECT',
                message: `${annotated.id} 在 ${annotated.project} 中出现多次。`,
              });
            }
            resultKeys.add(functionalKey);
            scenarioResults.push(annotated);
            continue;
          }
          qualityIssues.push({
            severity: 'ERROR',
            code: 'UNMAPPED_TEST',
            message: `测试没有 SCN 编号：${test.titlePath().join(' > ')}`,
          });
          continue;
        }

        const scenario = catalogById.get(id);
        if (!scenario) {
          qualityIssues.push({
            severity: 'ERROR',
            code: 'UNKNOWN_SCENARIO',
            message: `测试引用了场景目录之外的编号：${id}`,
          });
          continue;
        }

        const scenarioResult = makeScenarioResult(test, scenario);
        if (!scenarioResult) {
          const projectName = test.parent.project()?.name ?? 'unknown-project';
          qualityIssues.push({
            severity: 'ERROR',
            code: 'MISSING_RESULT',
            message: `${id} 在 ${projectName} 没有任何 Playwright TestResult。`,
          });
          continue;
        }

        const key = `${scenarioResult.id}:${scenarioResult.project}`;
        if (resultKeys.has(key)) {
          qualityIssues.push({
            severity: 'ERROR',
            code: 'DUPLICATE_SCENARIO_PROJECT',
            message: `${scenarioResult.id} 在 ${scenarioResult.project} 中出现多次。`,
          });
        }
        resultKeys.add(key);
        scenarioResults.push(scenarioResult);
      }

      const endedAt = new Date();
      const runId = cleanRunId(process.env.E2E_RUN_ID || defaultRunId(this.startedAt));
      const environments = Array.from(new Set(scenarioResults.map((item) => item.environment))).sort();
      const projectNames = Array.from(new Set(scenarioResults.map((item) => item.project))).sort();
      // run.release =「环境实际部署版本」：CURRENT.json environments[env].forkOf → deployments[].releaseLabel；
      // 无映射时回退既有 E2E_RELEASE。run.targetRelease = CURRENT.json primary；二者 vN.N.N 不同 → releaseMismatch。
      const resolvedRelease = resolveRunRelease(environments);
      const target = targetRelease();
      const releaseMismatch = isReleaseMismatch(resolvedRelease.release, target?.version);
      if (resolvedRelease.source === 'CURRENT.json' && process.env.E2E_RELEASE
        && process.env.E2E_RELEASE.trim() !== resolvedRelease.release) {
        console.log(
          `FX100 Reporter: run.release=${resolvedRelease.release}（CURRENT.json：${resolvedRelease.perEnvironment
            .map((item) => `${item.environment}→${item.release.deploymentId}`).join(', ')}）；`
          + `E2E_RELEASE=${process.env.E2E_RELEASE} 仅作为批次标签，不再写入 run.release。`,
        );
      }
      const artifact: TestRunArtifact = {
        schemaVersion: 2,
        sourceStatus: 'ready',
        source: {
          kind: 'playwright-reporter',
          grain: 'one row per scenario and Playwright project final outcome',
          generatedAt: endedAt.toISOString(),
          catalogPath: relative(process.cwd(), catalogPath),
          metricDefinitions: { ...metricDefinitions },
        },
        run: {
          id: runId,
          startedAt: this.startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
          durationMs: Math.max(0, endedAt.getTime() - this.startedAt.getTime()),
          playwrightStatus: result.status,
          environments,
          projectNames,
          discoveredTests: this.tests.length,
          ...(resolvedRelease.release ? { release: resolvedRelease.release } : {}),
          ...(resolvedRelease.source ? { releaseSource: resolvedRelease.source } : {}),
          ...(target ? { targetRelease: target.label } : {}),
          ...(releaseMismatch !== undefined ? { releaseMismatch } : {}),
          ...(process.env.E2E_FORK_BLOCK_NUMBER
            ? { forkBlockNumber: process.env.E2E_FORK_BLOCK_NUMBER }
            : {}),
        },
        catalog,
        results: scenarioResults,
        qualityIssues,
      };

      const runOutput = resolve(process.cwd(), this.options.outputRoot, runId);
      const latestOutput = resolve(process.cwd(), this.options.latestOutput);
      const previousLatest = await readLatestSnapshot(latestOutput);
      await writeRunOutputs(artifact, runOutput);
      await writeRunOutputs(mergeLatestSnapshot(previousLatest, artifact), latestOutput);
      console.log(`FX100 dashboard: ${relative(process.cwd(), runOutput)}/dashboard.html`);

      if (qualityIssues.some((issue) => issue.severity === 'ERROR')) {
        return { status: 'failed' };
      }
      return undefined;
    } catch (error) {
      console.error('FX100 Reporter failed:', error);
      return { status: 'failed' };
    }
  }
}

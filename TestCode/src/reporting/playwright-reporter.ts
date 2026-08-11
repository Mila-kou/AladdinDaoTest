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

import { loadScenarioCatalog } from './catalog.js';
import { mergeLatestSnapshot, readLatestSnapshot } from './latest-snapshot.js';
import { metricDefinitions } from './metric-definitions.js';
import type {
  ResultStatus,
  ScenarioCatalogItem,
  ScenarioResult,
  TestRunArtifact,
} from './schema.js';
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

      for (const test of this.tests) {
        const id = /SCN-\d{3}/.exec(test.titlePath().join(' '))?.[0];
        if (!id) {
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
          ...(process.env.E2E_RELEASE ? { release: process.env.E2E_RELEASE } : {}),
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

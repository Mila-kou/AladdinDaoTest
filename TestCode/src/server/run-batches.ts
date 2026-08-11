import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { z } from 'zod';

import {
  environmentNames,
  environments,
  type EnvironmentName,
} from '../../config/environments/catalog.js';
import { discoverScenarioSpecs, type ScenarioSpec } from '../execution/scenario-specs.js';
import type { ResultStatus, TestRunArtifact } from '../reporting/schema.js';
import type { TestCaseView } from '../reporting/test-cases.js';
import type {
  MarketCompatibility,
  MarketMode,
  MockResourceAlias,
  OracleMode,
  TestProject,
} from '../reporting/test-environments.js';
import {
  listEnvironmentProfiles,
  readEnvironmentSettings,
  saveEnvironmentSettings,
  validateRpcUrl,
} from './environment-settings.js';
import { EnvironmentInitializationManager } from './environment-initializations.js';

const createRunBatchSchema = z.object({
  release: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1_000).default(''),
  scope: z.enum(['single', 'selected', 'all']),
  scenarioIds: z.array(z.string().regex(/^SCN-\d{3}$/)).min(1).max(200),
  environmentMode: z.enum(['default', 'override']),
  marketSelection: z.enum(['default', 'deployed']).default('default'),
  keeperMode: z.enum(['inline', 'service']).default('inline'),
  overrideEnvironment: z.enum(environmentNames).optional(),
  rpcUrl: z.string().trim().optional(),
  adminRpcUrl: z.string().trim().optional(),
  reuseRpcForAdmin: z.boolean().default(true),
}).superRefine((value, context) => {
  if (value.environmentMode === 'override' && !value.overrideEnvironment) {
    context.addIssue({ code: 'custom', path: ['overrideEnvironment'], message: '请选择覆盖环境。' });
  }
  for (const key of ['rpcUrl', 'adminRpcUrl'] as const) {
    if (!value[key]) continue;
    try {
      validateRpcUrl(value[key]);
    } catch (error) {
      context.addIssue({
        code: 'custom',
        path: [key],
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
});

const manualStartSchema = z.object({
  caseId: z.string().regex(/^SCN-\d{3}$/),
});

const manualVerdictSchema = z.object({
  caseId: z.string().regex(/^SCN-\d{3}$/),
  // 'MANUAL' 表示撤销回填，把用例退回“待人工执行”。
  status: z.enum(['PASS', 'FAIL', 'BLOCKED', 'SKIP', 'MANUAL']),
  operator: z.string().trim().max(60).default(''),
  note: z.string().trim().max(2_000).default(''),
}).superRefine((value, context) => {
  if (value.status === 'MANUAL') return;
  if (!value.operator) {
    context.addIssue({ code: 'custom', path: ['operator'], message: '请填写执行人：没有署名的结论不算证据。' });
  }
  if (!value.note) {
    context.addIssue({ code: 'custom', path: ['note'], message: '请填写实际结果 / 证据：无证据的勾选不算通过。' });
  }
});

export type RunBatchStatus =
  | 'QUEUED' | 'RUNNING' | 'PASS' | 'FAIL' | 'PARTIAL' | 'NO_AUTOMATION'
  | 'MANUAL_PENDING' | 'INTERRUPTED';
export type RunBatchCaseStatus =
  | 'PENDING' | 'RUNNING' | ResultStatus | 'NOT_AUTOMATED' | 'MANUAL' | 'BLOCKED';

/** 人工回填的手工核对结论；没有这个字段的手工用例一律视为“未执行”。 */
export interface ManualVerdict {
  readonly status: Extract<RunBatchCaseStatus, 'PASS' | 'FAIL' | 'BLOCKED' | 'SKIP'>;
  readonly operator: string;
  readonly note: string;
  readonly recordedAt: string;
}

export interface RunBatchCase {
  readonly id: string;
  readonly title: string;
  readonly plannedEnvironment: TestProject;
  readonly resolvedEnvironment: EnvironmentName;
  readonly plannedMarketMode: MarketMode;
  readonly resolvedMarketMode: MarketMode;
  readonly resolvedOracleMode: OracleMode;
  readonly resolvedMockResourceAlias: MockResourceAlias;
  readonly marketCompatibility: MarketCompatibility;
  readonly automated: boolean;
  /** 设计上人工执行的用例；历史批次没有这个字段，判定一律用 `manual === true`。 */
  readonly manual?: boolean;
  readonly specPath?: string;
  status: RunBatchCaseStatus;
  resultRunId?: string;
  message?: string;
  manualVerdict?: ManualVerdict;
  /** 手工用例点"打开前端并开始"的时间；与回填时间一起构成人工执行的时间证据。 */
  manualStartedAt?: string;
}

export interface RunBatch {
  readonly id: string;
  readonly release: string;
  readonly description: string;
  readonly scope: 'single' | 'selected' | 'all';
  readonly environmentMode: 'default' | 'override';
  readonly marketSelection: 'default' | 'deployed';
  /** Inline 是默认协议用例模式；Service 仅用于验证 producer + worker 链路。 */
  readonly keeperMode: 'inline' | 'service';
  readonly overrideEnvironment?: EnvironmentName;
  readonly createdAt: string;
  startedAt?: string;
  endedAt?: string;
  /** 看板服务重启时打断了本批次；打断过的批次不会因为后续人工回填变回"跑完了"。 */
  interruptedAt?: string;
  status: RunBatchStatus;
  readonly rpcUpdatedEnvironments: EnvironmentName[];
  readonly cases: RunBatchCase[];
  logTail: string[];
}

export interface CreateRunBatchInput extends z.input<typeof createRunBatchSchema> {}

interface RunBatchManagerOptions {
  readonly projectRoot: string;
  readonly getCases: () => Promise<TestCaseView[]>;
}

function safeIdPart(value: string, maximumLength = 50): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, maximumLength) || 'run';
}

function batchId(release: string): string {
  const timestamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '-');
  return `${timestamp}-${safeIdPart(release)}`;
}

function compatibilityErrors(
  testCase: TestCaseView,
  environment: EnvironmentName,
  marketSelection: 'default' | 'deployed',
): string[] {
  const definition = environments[environment];
  const errors: string[] = [];
  const effectiveOracleMode = marketSelection === 'deployed' && testCase.marketMode !== 'not-applicable'
    ? 'deployed-oracle'
    : testCase.oracleMode;
  if (testCase.signingMode !== 'readonly' && !definition.permitsTransactions) {
    errors.push('用例需要发送交易，但目标环境禁止交易');
  }
  if (effectiveOracleMode === 'mock-oracle' && !definition.permitsOracleMutation) {
    errors.push('用例需要 Mock Oracle，但目标环境不允许修改 Oracle');
  }
  if (testCase.timeMode === 'controllable-time' && !definition.permitsTimeTravel) {
    errors.push('用例需要推进区块时间，但目标环境不支持时间控制');
  }
  return errors;
}

function resolvedMarket(testCase: TestCaseView, selection: 'default' | 'deployed') {
  if (testCase.marketMode === 'not-applicable') {
    return {
      marketMode: 'not-applicable',
      oracleMode: 'not-applicable',
      mockResourceAlias: 'none',
    } as const;
  }
  if (selection === 'deployed') {
    return {
      marketMode: 'deployed-market',
      oracleMode: 'deployed-oracle',
      mockResourceAlias: 'none',
    } as const;
  }
  return {
    marketMode: testCase.marketMode,
    oracleMode: testCase.oracleMode,
    mockResourceAlias: testCase.mockResourceAlias,
  };
}

/**
 * 批次状态永远由逐用例状态推导：手工核对用例在人工回填结论之前保持 MANUAL，
 * 因此不会因为自动化部分全绿就把整批记成 PASS。
 */
function deriveBatchStatus(batch: RunBatch): RunBatchStatus {
  const statuses = batch.cases.map((item) => item.status);
  if (statuses.includes('RUNNING')) return 'RUNNING';
  if (statuses.includes('PENDING')) return 'QUEUED';
  // 被中断的批次自动化结果本来就是残缺的，人工回填几条手工用例不能把它说成执行完毕。
  if (batch.interruptedAt) return 'INTERRUPTED';
  if (statuses.some((status) => status === 'FAIL' || status === 'BLOCKED')) return 'FAIL';
  if (statuses.includes('MANUAL')) return 'MANUAL_PENDING';
  if (statuses.every((status) => status === 'NOT_AUTOMATED')) return 'NO_AUTOMATION';
  if (statuses.every((status) => status === 'PASS')) return 'PASS';
  return 'PARTIAL';
}

function sanitizeLog(value: string, secrets: readonly string[]): string {
  let sanitized = value;
  for (const secret of secrets) {
    if (secret) sanitized = sanitized.replaceAll(secret, '[RPC REDACTED]');
  }
  return sanitized.replace(
    /https?:\/\/[^\s"']+\.rpc\.tenderly\.co\/[^\s"']+/gi,
    (match) => `${new URL(match).origin}/***`,
  );
}

async function rpcChainId(rpcUrl: string): Promise<number> {
  const response = await fetch(rpcUrl, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
  });
  const body = await response.json() as { result?: unknown; error?: { message?: string } };
  if (!response.ok || body.error || typeof body.result !== 'string') {
    throw new Error(`RPC chainId 校验失败：${body.error?.message ?? response.status}`);
  }
  return Number(BigInt(body.result));
}

async function readRunResult(projectRoot: string, runId: string): Promise<TestRunArtifact | undefined> {
  try {
    return JSON.parse(
      await readFile(join(projectRoot, 'artifacts', 'runs', runId, 'results.json'), 'utf8'),
    ) as TestRunArtifact;
  } catch {
    return undefined;
  }
}

export class RunBatchManager {
  private readonly projectRoot: string;
  private readonly getCases: () => Promise<TestCaseView[]>;
  private readonly directory: string;
  private readonly batches = new Map<string, RunBatch>();
  private readonly environmentInitializer: EnvironmentInitializationManager;
  private specs = new Map<string, ScenarioSpec>();
  private queue: Promise<void> = Promise.resolve();
  private persistSequence = 0;

  private constructor(options: RunBatchManagerOptions) {
    this.projectRoot = resolve(options.projectRoot);
    this.getCases = options.getCases;
    this.directory = join(this.projectRoot, 'artifacts', 'run-batches');
    this.environmentInitializer = new EnvironmentInitializationManager(this.projectRoot);
  }

  static async create(options: RunBatchManagerOptions): Promise<RunBatchManager> {
    const manager = new RunBatchManager(options);
    await manager.initialize();
    return manager;
  }

  private async initialize(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await this.environmentInitializer.initialize();
    this.specs = await discoverScenarioSpecs(this.projectRoot);
    const entries = await readdir(this.directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const batch = JSON.parse(
          await readFile(join(this.directory, entry.name, 'run.json'), 'utf8'),
        ) as RunBatch;
        if (batch.status === 'QUEUED' || batch.status === 'RUNNING') {
          batch.status = 'INTERRUPTED';
          batch.interruptedAt = new Date().toISOString();
          batch.endedAt = batch.interruptedAt;
          // 逐用例状态也要落定：留着 RUNNING/PENDING 会让后续人工回填重算出"还在跑"。
          for (const item of batch.cases) {
            if (item.status === 'RUNNING' || item.status === 'PENDING') {
              item.status = 'BLOCKED';
              item.message = '看板服务重启时执行被中断，本次没有产生结果。';
            }
          }
          batch.logTail.push('看板服务重启，未完成的运行已标记为 INTERRUPTED。');
          await this.persist(batch);
        }
        this.batches.set(batch.id, batch);
      } catch {
        // 损坏或未完成写入的批次不参与列表，避免影响看板启动。
      }
    }
    await this.importStandaloneRuns();
  }

  private async importStandaloneRuns(): Promise<void> {
    const runsDirectory = join(this.projectRoot, 'artifacts', 'runs');
    let entries;
    try {
      entries = await readdir(runsDirectory, { withFileTypes: true });
    } catch {
      return;
    }

    const referencedRunIds = new Set(
      Array.from(this.batches.values()).flatMap((batch) =>
        batch.cases.flatMap((item) => item.resultRunId ? [item.resultRunId] : []),
      ),
    );
    const testCases = await this.getCases();
    const testCasesById = new Map(testCases.map((item) => [item.id, item]));

    for (const entry of entries) {
      if (!entry.isDirectory() || this.batches.has(entry.name) || referencedRunIds.has(entry.name)) {
        continue;
      }
      const artifact = await readRunResult(this.projectRoot, entry.name);
      if (!artifact || artifact.results.length === 0) continue;

      const cases: RunBatchCase[] = artifact.results.map((result) => {
        const testCase = testCasesById.get(result.id);
        const spec = this.specs.get(result.id);
        const resolvedEnvironment = environmentNames.includes(result.environment as EnvironmentName)
          ? result.environment as EnvironmentName
          : testCase?.targetProject ?? 'dev-readonly';
        const market = testCase
          ? resolvedMarket(testCase, 'default')
          : {
              marketMode: 'not-applicable' as const,
              oracleMode: 'not-applicable' as const,
              mockResourceAlias: 'none' as const,
            };
        return {
          id: result.id,
          title: result.scenarioTitle,
          plannedEnvironment: testCase?.targetProject ?? resolvedEnvironment,
          resolvedEnvironment,
          plannedMarketMode: testCase?.marketMode ?? market.marketMode,
          resolvedMarketMode: market.marketMode,
          resolvedOracleMode: market.oracleMode,
          resolvedMockResourceAlias: market.mockResourceAlias,
          marketCompatibility: testCase?.marketCompatibility ?? 'not-applicable',
          automated: testCase?.executionMode !== 'manual',
          ...(testCase?.executionMode === 'manual' ? { manual: true } : {}),
          ...(spec ? { specPath: spec.relativePath } : {}),
          status: result.status,
          resultRunId: artifact.run.id,
          message: result.checkResult,
        };
      });
      const statuses = cases.map((item) => item.status);
      const status: RunBatchStatus = statuses.some((item) => ['FAIL', 'BLOCKED'].includes(item))
        ? 'FAIL'
        : statuses.every((item) => item === 'PASS')
          ? 'PASS'
          : 'PARTIAL';
      const batch: RunBatch = {
        id: artifact.run.id,
        release: artifact.run.release ?? `Playwright-${artifact.run.id}`,
        description: '由直接 Playwright 执行自动登记。',
        scope: cases.length === 1 ? 'single' : 'selected',
        environmentMode: 'default',
      marketSelection: 'default',
        keeperMode: 'inline',
        createdAt: artifact.run.startedAt,
        startedAt: artifact.run.startedAt,
        endedAt: artifact.run.endedAt,
        status,
        rpcUpdatedEnvironments: [],
        cases,
        logTail: [
          '检测到看板外直接执行的 Playwright 结果，已自动登记到最近运行。',
          `运行结束：${status}。`,
        ],
      };
      this.batches.set(batch.id, batch);
      await this.persist(batch);
    }
  }

  private async persist(batch: RunBatch): Promise<void> {
    const directory = join(this.directory, batch.id);
    await mkdir(directory, { recursive: true });
    const path = join(directory, 'run.json');
    // 人工回填与自动化执行会并发写同一个批次；直接覆盖可能写出半个 JSON，
    // 而损坏的 run.json 在下次启动时会被静默丢弃，连人工结论一起消失。
    const temporaryPath = `${path}.${process.pid}-${this.persistSequence++}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, path);
  }

  list(): RunBatch[] {
    return Array.from(this.batches.values())
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 50);
  }

  get(id: string): RunBatch | undefined {
    return this.batches.get(id);
  }

  automatedScenarioIds(): string[] {
    return Array.from(this.specs.keys()).sort();
  }

  async createBatch(rawInput: unknown): Promise<RunBatch> {
    const input = createRunBatchSchema.parse(rawInput);
    const cases = await this.getCases();
    const byId = new Map(cases.map((item) => [item.id, item]));
    const ids = Array.from(new Set(input.scenarioIds));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length > 0) throw new Error(`测试用例不存在：${missing.join(', ')}`);

    const override = input.environmentMode === 'override' ? input.overrideEnvironment : undefined;
    const selected = ids.map((id) => byId.get(id)!);
    if (input.marketSelection === 'deployed') {
      const incompatible = selected.filter((item) => item.marketCompatibility === 'mock-only');
      if (incompatible.length > 0) {
        throw new Error(
          `标准 Market 与用例能力不兼容：${incompatible.slice(0, 12).map((item) => item.id).join(', ')}`,
        );
      }
    }
    if (override) {
      const incompatible = selected.flatMap((item) =>
        compatibilityErrors(item, override, input.marketSelection).map((message) => `${item.id}: ${message}`),
      );
      if (incompatible.length > 0) {
        throw new Error(`环境覆盖与用例能力不兼容：${incompatible.slice(0, 8).join('；')}`);
      }
    }

    const rpcUpdatedEnvironments: EnvironmentName[] = [];
    if (override && input.rpcUrl) {
      const definition = environments[override];
      const rpcUrl = validateRpcUrl(input.rpcUrl);
      const explicitAdmin = input.adminRpcUrl ? validateRpcUrl(input.adminRpcUrl) : undefined;
      const adminRpcUrl = definition.adminRpcEnvironmentVariable
        ? input.reuseRpcForAdmin ? rpcUrl : explicitAdmin
        : undefined;
      await saveEnvironmentSettings(this.projectRoot, override, {
        rpcUrl,
        ...(adminRpcUrl ? { adminRpcUrl } : {}),
      });
      rpcUpdatedEnvironments.push(override);
    }

    const batch: RunBatch = {
      id: batchId(input.release),
      release: input.release,
      description: input.description,
      scope: input.scope,
      environmentMode: input.environmentMode,
      marketSelection: input.marketSelection,
      keeperMode: input.keeperMode,
      ...(override ? { overrideEnvironment: override } : {}),
      createdAt: new Date().toISOString(),
      status: 'QUEUED',
      rpcUpdatedEnvironments,
      cases: selected.map((item) => {
        const spec = this.specs.get(item.id);
        const market = resolvedMarket(item, input.marketSelection);
        return {
          id: item.id,
          title: item.title,
          plannedEnvironment: item.targetProject,
          resolvedEnvironment: override ?? item.targetProject,
          plannedMarketMode: item.marketMode,
          resolvedMarketMode: market.marketMode,
          resolvedOracleMode: market.oracleMode,
          resolvedMockResourceAlias: market.mockResourceAlias,
          marketCompatibility: item.marketCompatibility,
          automated: Boolean(spec) && item.executionMode !== 'manual',
          ...(item.executionMode === 'manual' ? { manual: true } : {}),
          ...(spec ? { specPath: spec.relativePath } : {}),
          status: item.executionMode === 'manual'
            ? 'MANUAL'
            : spec ? 'PENDING' : 'NOT_AUTOMATED',
        };
      }),
      logTail: ['运行批次已创建，等待执行。'],
    };

    const runnableEnvironments = Array.from(new Set(
      batch.cases.filter((item) => item.automated).map((item) => item.resolvedEnvironment),
    ));
    for (const environment of runnableEnvironments) {
      const settings = await readEnvironmentSettings(this.projectRoot, environment);
      if (!settings.rpcUrl) {
        throw new Error(`${environment} 尚未配置 ${environments[environment].rpcEnvironmentVariable}。`);
      }
      const definition = environments[environment];
      if ((definition.permitsOracleMutation || definition.permitsTimeTravel) && !settings.adminRpcUrl) {
        throw new Error(`${environment} 尚未配置 ${definition.adminRpcEnvironmentVariable}。`);
      }
    }

    this.batches.set(batch.id, batch);
    await this.persist(batch);
    this.queue = this.queue.then(() => this.execute(batch.id)).catch(async (error) => {
      const current = this.batches.get(batch.id);
      if (!current) return;
      current.status = 'FAIL';
      current.endedAt = new Date().toISOString();
      for (const item of current.cases) {
        if (item.status === 'RUNNING' || item.status === 'PENDING') {
          item.status = 'FAIL';
          item.message = '运行管理器异常终止。';
        }
      }
      current.logTail.push(`运行管理器错误：${error instanceof Error ? error.message : String(error)}`);
      await this.persist(current);
    });
    return batch;
  }

  private async execute(id: string): Promise<void> {
    const batch = this.batches.get(id);
    if (!batch) return;
    const runnable = batch.cases.filter((item) => item.automated);
    const manualCases = batch.cases.filter((item) => item.manual === true);
    if (runnable.length === 0) {
      batch.status = deriveBatchStatus(batch);
      batch.startedAt = new Date().toISOString();
      batch.endedAt = batch.startedAt;
      batch.logTail.push(manualCases.length > 0
        ? `本批次没有可自动执行的用例，其中 ${manualCases.length} 条是手工核对用例，看板不会代跑；请人工执行后在"手工核对清单"里标记 PASS / FAIL。`
        : '所选用例尚无自动化代码，本次没有发送交易。');
      await this.persist(batch);
      return;
    }

    batch.status = 'RUNNING';
    batch.startedAt = new Date().toISOString();
    batch.logTail.push(`开始执行 ${runnable.length} 条已自动化用例。`);
    if (manualCases.length > 0) {
      batch.logTail.push(
        `另有 ${manualCases.length} 条手工核对用例不参与自动运行：${manualCases.map((item) => item.id).join('、')}，`
        + '需人工执行后在"手工核对清单"里标记 PASS / FAIL 并回填证据。',
      );
    }
    await this.persist(batch);

    const groups = new Map<string, { environment: EnvironmentName; items: RunBatchCase[] }>();
    for (const item of runnable) {
      const key = `${item.resolvedEnvironment}:${item.resolvedMarketMode}:${item.resolvedMockResourceAlias}:${batch.keeperMode}`;
      const group = groups.get(key) ?? { environment: item.resolvedEnvironment, items: [] };
      group.items.push(item);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      await this.executeGroup(batch, group.environment, group.items);
    }

    batch.endedAt = new Date().toISOString();
    batch.status = deriveBatchStatus(batch);
    const pendingManual = manualCases.filter((item) => item.status === 'MANUAL').length;
    batch.logTail.push(`自动化执行结束：${batch.status}。${pendingManual > 0
      ? `其中 ${pendingManual} 条手工核对用例仍待人工执行并回填证据，未回填前不计入通过。`
      : ''}`);
    await this.persist(batch);
  }

  private async executeGroup(
    batch: RunBatch,
    environment: EnvironmentName,
    items: RunBatchCase[],
  ): Promise<void> {
    const settings = await readEnvironmentSettings(this.projectRoot, environment);
    const definition = environments[environment];
    if (!settings.rpcUrl) {
      for (const item of items) {
        item.status = 'BLOCKED';
        item.message = `${definition.rpcEnvironmentVariable} 未配置`;
      }
      await this.persist(batch);
      return;
    }
    const expectedChainId = settings.chainId;
    try {
      const actualChainId = await rpcChainId(settings.rpcUrl);
      if (!Number.isSafeInteger(expectedChainId) || !expectedChainId || expectedChainId <= 0) {
        throw new Error('E2E_CHAIN_ID 未配置为正整数');
      }
      if (actualChainId !== expectedChainId) {
        throw new Error(`Fork chainId=${actualChainId}，该环境固定配置为 ${expectedChainId}`);
      }
      batch.logTail.push(`${environment}: RPC Chain ID 已核对为 ${actualChainId}。`);
    } catch (error) {
      for (const item of items) {
        item.status = 'BLOCKED';
        item.message = `环境 Chain ID 未通过核对：${error instanceof Error ? error.message : String(error)}`;
      }
      batch.logTail.push(`${environment}: 因 Chain ID 不一致或不可读，未发送交易。`);
      await this.persist(batch);
      return;
    }
    for (const item of items) item.status = 'RUNNING';
    batch.logTail.push(`${environment}: 执行 ${items.map((item) => item.id).join(', ')}。`);
    await this.persist(batch);

    const marketMode = items[0]?.resolvedMarketMode ?? 'not-applicable';
    const mockResourceAlias = items[0]?.resolvedMockResourceAlias ?? 'none';
    const executionRunId = `${safeIdPart(batch.id, 32)}-${environment}-${marketMode}-${safeIdPart(mockResourceAlias, 24)}`;
    const specPaths = Array.from(new Set(items.flatMap((item) => item.specPath ? [item.specPath] : [])));
    const args = ['test', ...specPaths, `--project=${environment}`];
    const childEnvironment: NodeJS.ProcessEnv = {
      ...process.env,
      E2E_ENV: environment,
      E2E_RELEASE: batch.release,
      E2E_RUN_ID: executionRunId,
      E2E_MARKET_MODE: marketMode,
      E2E_MARKET_RESOURCE_ALIAS: mockResourceAlias,
      E2E_KEEPER_MODE: batch.keeperMode,
      [definition.rpcEnvironmentVariable]: settings.rpcUrl,
      ...(definition.adminRpcEnvironmentVariable && settings.adminRpcUrl
        ? { [definition.adminRpcEnvironmentVariable]: settings.adminRpcUrl }
        : {}),
    };
    const secrets = [settings.rpcUrl, settings.adminRpcUrl ?? ''];
    const executable = join(this.projectRoot, 'node_modules', '.bin', 'playwright');
    const exitCode = await new Promise<number>((resolveExit, rejectExit) => {
      const child = spawn(executable, args, {
        cwd: this.projectRoot,
        env: childEnvironment,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const record = (chunk: Buffer | string) => {
        const lines = sanitizeLog(String(chunk), secrets).split(/\r?\n/).filter(Boolean);
        batch.logTail.push(...lines);
        batch.logTail = batch.logTail.slice(-160);
      };
      child.stdout.on('data', record);
      child.stderr.on('data', record);
      child.once('error', rejectExit);
      child.once('exit', (code) => resolveExit(code ?? 1));
    });

    const artifact = await readRunResult(this.projectRoot, executionRunId);
    const results = new Map(
      (artifact?.results ?? [])
        .filter((result) => result.project === environment)
        .map((result) => [result.id, result]),
    );
    for (const item of items) {
      const result = results.get(item.id);
      if (result) {
        item.status = result.status;
        item.resultRunId = executionRunId;
        item.message = result.checkResult;
      } else {
        item.status = exitCode === 0 ? 'SKIP' : 'FAIL';
        item.message = exitCode === 0
          ? 'Playwright 未产生该场景结果，可能被测试代码按环境跳过。'
          : `Playwright 退出码 ${exitCode}，且没有生成场景结果。`;
      }
    }
    await this.persist(batch);
  }

  /** 手工用例专用的定位与校验：自动化用例的结果只能来自 Playwright 产物。 */
  private manualCase(batchId: string, caseId: string): { batch: RunBatch; item: RunBatchCase } {
    const batch = this.batches.get(batchId);
    if (!batch) throw new Error(`运行批次不存在：${batchId}`);
    const item = batch.cases.find((entry) => entry.id === caseId);
    if (!item) throw new Error(`本批次不包含用例：${caseId}`);
    if (item.manual !== true) {
      throw new Error(`${item.id} 不是手工核对用例，结果只能由自动化执行写入。`);
    }
    // 用例改过执行方式时，一条用例可能既被标成手工、又带着 Playwright 产物结果；
    // 这种结果的权威来源仍是产物，不允许人工覆盖。
    if (item.resultRunId) {
      throw new Error(`${item.id} 已有自动化执行结果（${item.resultRunId}），不能用人工结论覆盖。`);
    }
    return { batch, item };
  }

  /**
   * 记录一条手工用例的人工开始执行时间（点"打开前端并开始"时触发）。
   * 已经开始过就保留首次时间，重复点击打开前端不会把计时重置。
   */
  async recordManualStart(batchId: string, rawInput: unknown): Promise<RunBatch> {
    const parsed = manualStartSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new Error(parsed.error.issues.map((issue) => issue.message).join('；'));
    }
    const { batch, item } = this.manualCase(batchId, parsed.data.caseId);
    if (!item.manualStartedAt) {
      item.manualStartedAt = new Date().toISOString();
      batch.logTail.push(`${item.id}：已打开测试前端，开始人工执行。`);
      batch.logTail = batch.logTail.slice(-160);
      await this.persist(batch);
    }
    return batch;
  }

  /**
   * 回填一条手工核对用例的人工结论。只允许写手工用例：自动化用例的结果必须来自
   * Playwright 产物，不能由人手动改绿。传 status='MANUAL' 表示撤销回填。
   */
  async recordManualVerdict(batchId: string, rawInput: unknown): Promise<RunBatch> {
    const parsed = manualVerdictSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new Error(parsed.error.issues.map((issue) => issue.message).join('；'));
    }
    const input = parsed.data;
    const { batch, item } = this.manualCase(batchId, input.caseId);

    const recordedAt = new Date().toISOString();
    if (input.status === 'MANUAL') {
      delete item.manualVerdict;
      // 撤销后这条用例要重新执行，旧的开始时间不能继续挂在新一轮结论上。
      delete item.manualStartedAt;
      item.status = 'MANUAL';
      item.message = '人工回填已撤销，等待重新执行并回填证据。';
      batch.logTail.push(`${item.id}：撤销人工回填，退回待核对。`);
    } else {
      // 证据是人手粘贴的，可能带上 Fork RPC 端点；与自动化日志用同一套脱敏规则。
      const note = sanitizeLog(input.note, []);
      item.manualVerdict = {
        status: input.status,
        operator: input.operator,
        note,
        recordedAt,
      };
      item.status = input.status;
      item.message = `人工核对（${input.operator}）：${note}`;
      batch.logTail.push(`${item.id}：${input.operator} 人工标记 ${input.status}。`);
    }
    batch.logTail = batch.logTail.slice(-160);
    batch.status = deriveBatchStatus(batch);
    if (batch.status !== 'QUEUED' && batch.status !== 'RUNNING') batch.endedAt = recordedAt;
    await this.persist(batch);
    return batch;
  }

  async environmentProfiles() {
    return listEnvironmentProfiles(this.projectRoot);
  }

  environmentInitializations() {
    return this.environmentInitializer.list();
  }

  environmentInitialization(id: string) {
    return this.environmentInitializer.get(id);
  }

  async initializeEnvironment(rawInput: unknown) {
    const job = await this.environmentInitializer.create(rawInput);
    this.queue = this.queue
      .then(() => this.environmentInitializer.execute(job.id))
      .catch(() => undefined);
    return job;
  }
}

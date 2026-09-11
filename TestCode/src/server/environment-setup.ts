import { resolve } from 'node:path';

import { z } from 'zod';

import {
  environmentNames,
  environments,
  type EnvironmentName,
} from '../../config/environments/catalog.js';
import { checkEnvironmentConfiguration } from './environment-configuration.js';
import { readEnvironmentSettings } from './environment-settings.js';
import type { ContractDeploymentManager } from './contract-deployments.js';
import { FrontendLauncherError, type FrontendLauncher, type FrontendServiceView } from './frontend-launcher.js';
import { KEEPER_WORKER_NAMES, type KeeperActionResult, type KeeperLauncher } from './keeper-launcher.js';
import {
  isGroupAlive,
  isProcessAlive,
  redactSecrets,
  tailFile,
  waitForPort,
} from './local-services-core.js';
import type { TenderlyForkManager } from './tenderly-forks.js';
import type { RunBatchManager } from './run-batches.js';

/**
 * 环境页「⓪ 一键搭建向导」的编排器：把已有的六个分步能力串成一个长任务——
 *   createFork（TenderlyForkManager.create）→ deploy（ContractDeploymentManager 长任务，轮询至终态）
 *   → init（RunBatchManager.initializeEnvironment 长任务，轮询至终态）→ check（checkEnvironmentConfiguration 只读）
 *   → frontend（FrontendLauncher.start，再等端口监听）→ keeper（KeeperLauncher.execute start）。
 * 不重写任何步骤逻辑，只做顺序编排、进度记录与失败传播（一步失败即停，后续步骤标 skipped）。
 * 任务只存进程内存（与合约部署任务一致）；日志与失败信息沿用各管理器的脱敏，再叠加一层 RPC 兜底脱敏。
 * frontend / keeper 起的是常驻进程：登记、停止、日志仍归 ⑥ 本地服务面板（同一份 registry.json），向导只负责"起来并确认"。
 */

const STEP_ORDER = ['createFork', 'deploy', 'init', 'check', 'frontend', 'keeper'] as const;
export type EnvironmentSetupStepName = (typeof STEP_ORDER)[number];

const STEP_LABELS: Record<EnvironmentSetupStepName, string> = {
  createFork: '新建/重建 Fork',
  deploy: '部署合约',
  init: '初始化 Mock Bundle',
  check: '环境检查',
  frontend: '启动本地前端',
  keeper: '启动 Keeper',
};

/** 只在三个 Fork 环境上有意义的步骤；check / frontend / keeper 任何环境都可单独勾选（keeper 在只读环境由启动器拒绝）。 */
const FORK_ONLY_STEPS: ReadonlySet<EnvironmentSetupStepName> = new Set(['createFork', 'deploy', 'init']);

/** 长任务跟随轮询：2s 一次；单步最长跟随 60 分钟（超时只停止跟随并判失败，不杀原任务）。 */
const POLL_INTERVAL_MS = 2_000;
const STEP_TIMEOUT_MS = 60 * 60 * 1000;
const LOG_TAIL_LINES = 120;
/**
 * 前端 dev server 从启动到监听端口的最长等待：Next dev 首次监听通常 5～90s。到时只判失败、不杀进程
 * （与 deploy 的"超时只停止跟随"同一约定，进程留给 ⑥ 面板查看或停止）。
 */
const FRONTEND_LISTEN_TIMEOUT_MS = 120_000;
/** 等待分片：每片 waitForPort 之间复核进程存活，进程一退出立刻判失败，不空等满 120s。 */
const FRONTEND_LISTEN_SLICE_MS = 2_000;
/** 步骤日志里附带的服务日志尾巴：前端 dev 日志取最后几行（编译进度），keeper 取 run.sh 输出末尾。 */
const FRONTEND_LOG_TAIL_LINES = 6;
const KEEPER_OUTPUT_TAIL_LINES = 20;
/** 失败 summary 是一行字：日志尾巴拼进去要封顶，完整内容在 logTail 里。 */
const SUMMARY_MAX_CHARS = 600;

function isHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

const httpUrlSchema = z.string().trim().min(1).max(500).refine(isHttpUrl, { message: '必须是 http(s) 地址。' });

/**
 * 与 frontend-launcher 的 startOptionsSchema 同形，但全部可省略、不设默认值：向导只校验形状，
 * 缺省值由启动器自己 parse 补齐（默认值只在启动器一处维护，这里不复制）。
 */
const frontendOptionsSchema = z.object({
  marketsDataSource: z.enum(['api', 'split']).optional(),
  showDevMarkets: z.boolean().optional(),
  gateEnabled: z.boolean().optional(),
  flashEnabled: z.boolean().optional(),
  priceFeedApiUrl: httpUrlSchema.optional(),
  apiUrl: httpUrlSchema.optional(),
  chainlinkFromKeeperEnv: z.boolean().optional(),
});

const setupStepsSchema = z.object({
  createFork: z.object({
    /** 十进制区块号；省略 = latest */
    blockNumber: z.string().regex(/^\d+$/).optional(),
  }).optional(),
  deploy: z.object({
    branch: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, {
      message: '分支名只允许字母、数字与 . _ / -。',
    }),
    dryRun: z.boolean().optional(),
  }).optional(),
  init: z.object({
    force: z.boolean().optional(),
    forceSharedCollateral: z.boolean().optional(),
  }).optional(),
  check: z.literal(true).optional(),
  frontend: z.object({
    /** Github/ 下的 fx100-apps@<分支目录名>；是否真的存在由启动器在执行时核对（不存在 → 该步失败）。 */
    directory: z.string().trim().min(1).max(120),
    port: z.number().int().min(1024).max(65535),
    options: frontendOptionsSchema.optional(),
    /** 向导的环境永远优先。这里只为识别"页面顺手带了别的环境"并在步骤日志里说明，不会生效。 */
    environment: z.enum(environmentNames).optional(),
  }).optional(),
  keeper: z.object({
    workers: z.array(z.enum(KEEPER_WORKER_NAMES)).min(1),
    options: z.object({
      forkMode: z.boolean().optional(),
      clearCursors: z.boolean().optional(),
      clearQueues: z.boolean().optional(),
      dryRun: z.boolean().optional(),
    }).optional(),
  }).optional(),
});

const createSetupSchema = z.object({
  environment: z.enum(environmentNames),
  steps: setupStepsSchema,
});

type SetupInput = z.output<typeof createSetupSchema>;
type FrontendStepInput = NonNullable<SetupInput['steps']['frontend']>;
type KeeperStepInput = NonNullable<SetupInput['steps']['keeper']>;

export type EnvironmentSetupStepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
export type EnvironmentSetupJobStatus = 'running' | 'succeeded' | 'failed';

interface SetupStep {
  readonly step: EnvironmentSetupStepName;
  status: EnvironmentSetupStepStatus;
  startedAt?: string;
  endedAt?: string;
  summary?: string;
  logTail: string[];
}

interface SetupJob {
  readonly id: string;
  readonly environment: EnvironmentName;
  readonly startedAt: string;
  endedAt?: string;
  status: EnvironmentSetupJobStatus;
  readonly steps: SetupStep[];
}

export interface EnvironmentSetupStepView {
  readonly step: EnvironmentSetupStepName;
  readonly label: string;
  readonly status: EnvironmentSetupStepStatus;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly summary: string | null;
  readonly logTail: string[];
}

export interface EnvironmentSetupJobView {
  readonly id: string;
  readonly environment: EnvironmentName;
  readonly status: EnvironmentSetupJobStatus;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly steps: EnvironmentSetupStepView[];
}

/** 同环境已有 running 向导任务时抛出；dashboard-server 据此回 409。 */
export class EnvironmentSetupConflictError extends Error {}

export interface EnvironmentSetupDependencies {
  readonly projectRoot: string;
  readonly tenderlyForkManager: TenderlyForkManager;
  readonly contractDeploymentManager: ContractDeploymentManager;
  /** 初始化长任务经 RunBatchManager 的串行队列（与 ④ 面板同一路径）。 */
  readonly runManager: RunBatchManager;
  /** ⑥ 本地服务的两个启动器：向导只转调 start；登记 / 停止 / 日志仍归各自面板（同一份 registry.json）。 */
  readonly frontendLauncher: FrontendLauncher;
  readonly keeperLauncher: KeeperLauncher;
}

function sanitize(value: string, secrets: readonly string[]): string {
  let sanitized = value;
  for (const secret of secrets) {
    if (secret) sanitized = sanitized.replaceAll(secret, '[RPC REDACTED]');
  }
  return sanitized.replace(
    /https?:\/\/[^\s"']+\.rpc\.tenderly\.co\/[^\s"']+/gi,
    (match) => `${new URL(match).origin}/***`,
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function safeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'setup';
}

/**
 * 启动器抛出的错误 → 一行可读文字。
 *   · FrontendLauncherError（400 端口 3010 / 409 端口占用 / 500 秒退）带 status + detail；
 *   · keeper-launcher 的 KeeperLauncherError 没有导出（只在它自己的 HTTP 层 instanceof），按形状识别：
 *     Error 且带 status 与字符串 detail——链支持门槛「Chain ID 99911 不在 keeper 支持列表」就是这条路，
 *     tx-fork / oracle-fork / time-fork 上今天必然走到，要给用户 message：detail，不是堆栈；
 *   · zod 参数错误逐条 issue 列出；其余原样取 message。
 */
function describeLauncherError(error: unknown): string {
  if (error instanceof z.ZodError) {
    const issues = error.issues
      .map((issue) => `${issue.path.length ? issue.path.map(String).join('.') : '(root)'}: ${issue.message}`)
      .join('；');
    return `参数不合法：${issues}`;
  }
  if (error instanceof Error) {
    const shaped = error as Error & { status?: unknown; detail?: unknown };
    const hasStatus = error instanceof FrontendLauncherError || typeof shaped.status === 'number';
    if (hasStatus && typeof shaped.detail === 'string' && shaped.detail) {
      return `${error.message}：${shaped.detail}`;
    }
    return error.message;
  }
  return String(error);
}

function clampSummary(value: string): string {
  return value.length > SUMMARY_MAX_CHARS ? `${value.slice(0, SUMMARY_MAX_CHARS)}…` : value;
}

/**
 * keeper start 返回 ok=false 时挑"决定性"的一条：启动器把 run.sh 退出码 / 启动即退出 / 日志致命行都写进 warnings，
 * 体检失败的具体原因则只在 output 里——取 output 里最后一条 FAIL/ERROR 类的行拼在后面；都没有就退回 output 最后一行。
 */
function decisiveKeeperError(result: KeeperActionResult): string {
  const decisive = result.warnings.filter((line) => /退出码|已退出|致命行|判定：/.test(line)).slice(0, 2);
  const outputLines = result.output.split('\n').map((line) => line.trim()).filter(Boolean);
  const failLine = outputLines.filter((line) => /\b(?:FAIL|FAILED|ERR|ERROR)\b|失败|错误|missing|not found|refused/i.test(line)).at(-1);
  if (decisive.length) return failLine ? `${decisive.join(' ')} ← ${failLine}` : decisive.join(' ');
  return failLine ?? outputLines.at(-1) ?? 'run.sh 未给出原因（见日志）。';
}

export class EnvironmentSetupOrchestrator {
  private readonly projectRoot: string;
  private readonly deps: EnvironmentSetupDependencies;
  private readonly jobs = new Map<string, SetupJob>();

  constructor(deps: EnvironmentSetupDependencies) {
    this.projectRoot = resolve(deps.projectRoot);
    this.deps = deps;
  }

  list(): EnvironmentSetupJobView[] {
    return Array.from(this.jobs.values())
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .slice(0, 20)
      .map((job) => this.view(job));
  }

  get(id: string): EnvironmentSetupJobView | undefined {
    const job = this.jobs.get(id);
    return job ? this.view(job) : undefined;
  }

  async create(rawInput: unknown): Promise<EnvironmentSetupJobView> {
    const input = createSetupSchema.parse(rawInput);
    const selected = STEP_ORDER.filter((name) => input.steps[name] !== undefined);
    if (selected.length === 0) {
      throw new Error('至少勾选一个步骤（createFork / deploy / init / check / frontend / keeper）。');
    }
    const definition = environments[input.environment];
    if (!definition.initializesDefaultMockResources
      && selected.some((name) => FORK_ONLY_STEPS.has(name))) {
      throw new Error(
        `${input.environment} 仅支持向导的 check / frontend / keeper 步骤；新建 Fork / 部署 / 初始化只适用于 tx-fork / oracle-fork / time-fork。`,
      );
    }
    const running = Array.from(this.jobs.values())
      .find((job) => job.environment === input.environment && job.status === 'running');
    if (running) {
      throw new EnvironmentSetupConflictError(
        `${input.environment} 已有一键搭建任务 ${running.id} 正在运行；同环境同时只允许一个向导任务。`,
      );
    }

    const timestamp = new Date().toISOString();
    const id = `${timestamp.replaceAll(':', '').replaceAll('.', '-')}-${safeIdPart(input.environment)}-setup`;
    const job: SetupJob = {
      id,
      environment: input.environment,
      startedAt: timestamp,
      status: 'running',
      steps: selected.map((name) => ({
        step: name,
        status: 'pending',
        logTail: [],
      })),
    };
    this.jobs.set(id, job);
    void this.run(job, input);
    return this.view(job);
  }

  private async run(job: SetupJob, input: SetupInput): Promise<void> {
    // RPC / WSS 原文只用于日志兜底脱敏，不进任务记录（前端 dev 日志与 keeper 输出里可能带 WSS）。
    let secrets: string[] = [];
    try {
      const settings = await readEnvironmentSettings(this.projectRoot, job.environment);
      secrets = [settings.rpcUrl ?? '', settings.adminRpcUrl ?? '', settings.wssUrl ?? ''].filter(Boolean);
    } catch {
      secrets = [];
    }
    const record = (step: SetupStep, line: string): void => {
      step.logTail.push(sanitize(line, secrets));
      step.logTail = step.logTail.slice(-LOG_TAIL_LINES);
    };

    for (const step of job.steps) {
      if (job.status === 'failed') {
        step.status = 'skipped';
        step.summary = '前序步骤失败，本步骤未执行。';
        continue;
      }
      step.status = 'running';
      step.startedAt = new Date().toISOString();
      try {
        step.summary = sanitize(await this.executeStep(job, step, input, secrets, record), secrets);
        step.status = 'succeeded';
      } catch (error) {
        const message = sanitize(error instanceof Error ? error.message : String(error), secrets);
        step.status = 'failed';
        step.summary = message;
        record(step, `步骤失败：${message}`);
        job.status = 'failed';
      } finally {
        step.endedAt = new Date().toISOString();
      }
    }
    if (job.status === 'running') job.status = 'succeeded';
    job.endedAt = new Date().toISOString();
  }

  /** 执行单步并返回一行 summary；失败抛错（由 run 统一记账）。 */
  private async executeStep(
    job: SetupJob,
    step: SetupStep,
    input: SetupInput,
    secrets: string[],
    record: (step: SetupStep, line: string) => void,
  ): Promise<string> {
    switch (step.step) {
      case 'createFork': {
        const options = input.steps.createFork!;
        record(step, `正在创建 Tenderly Virtual TestNet（${job.environment}，固定 Chain ID）…`);
        const result = await this.deps.tenderlyForkManager.create({
          environment: job.environment,
          ...(options.blockNumber ? { blockNumber: options.blockNumber } : {}),
        });
        if ('dryRun' in result) {
          throw new Error('Fork 创建意外返回 dry-run 结果。');
        }
        // 新 Fork 已回填 .env.local：刷新脱敏词表，后续步骤日志按新 RPC 脱敏。
        try {
          const settings = await readEnvironmentSettings(this.projectRoot, job.environment);
          for (const secret of [settings.rpcUrl ?? '', settings.adminRpcUrl ?? '', settings.wssUrl ?? '']) {
            if (secret && !secrets.includes(secret)) secrets.push(secret);
          }
        } catch {
          // 词表刷新失败不影响主流程；tenderly 域名正则兜底仍生效。
        }
        record(
          step,
          `Virtual TestNet 已创建：chainId=${result.chainId}（已校验），rpcHost=${result.rpcHost}`
            + `${result.baselineRegistryUpdated ? '，CURRENT.json 已登记' : ''}；主 RPC / Admin RPC / WSS 已回填 .env.local。`,
        );
        return `chainId=${result.chainId}`
          + `${result.forkBlockNumber !== undefined ? ` forkBlock=${result.forkBlockNumber}` : ''}`
          + ` rpcHost=${result.rpcHost}`;
      }
      case 'deploy': {
        const options = input.steps.deploy!;
        const dryRun = options.dryRun ?? false;
        const created = await this.deps.contractDeploymentManager.create({
          environment: job.environment,
          branch: options.branch,
          dryRun,
        });
        record(step, `部署任务 ${created.id} 已创建，跟随其日志至终态…`);
        const final = await this.waitFor(
          `部署任务 ${created.id}`,
          () => this.deps.contractDeploymentManager.get(created.id),
          (view) => view.status !== 'running',
          (view) => {
            step.logTail = view.logTail.slice(-LOG_TAIL_LINES);
          },
        );
        step.logTail = final.logTail.slice(-LOG_TAIL_LINES);
        if (final.status !== 'succeeded') {
          throw new Error(final.message ?? `部署失败（退出码 ${final.exitCode ?? '未知'}）。`);
        }
        return `${dryRun ? 'dry-run ' : ''}部署 exit=${final.exitCode ?? 0}（${options.branch}）`;
      }
      case 'init': {
        const options = input.steps.init!;
        // 同一向导里刚新建过 Fork：共享 USDC 登记必然指向旧 fork 的死地址，不强制重建共享层会在
        // 参数回读阶段踩脏状态（2026-09-02 实例：SKEW_IMPACT_FACTOR 回读不一致，带 --force-shared-collateral 重跑即过）。
        const forkJustCreated = job.steps.some((item) => item.step === 'createFork' && item.status === 'succeeded');
        const forceSharedCollateral = (options.forceSharedCollateral ?? false) || forkJustCreated;
        if (forkJustCreated && !(options.forceSharedCollateral ?? false)) {
          record(step, '本向导刚新建 Fork：自动启用 force-shared-collateral（新 fork 上旧共享 USDC 登记已失效，必须重建共享层）。');
        }
        const created = await this.deps.runManager.initializeEnvironment({
          environment: job.environment,
          bundleAlias: 'default-mock',
          force: options.force ?? false,
          forceSharedCollateral,
        });
        record(step, `初始化任务 ${created.id} 已创建（串行队列），跟随其日志至终态…`);
        const final = await this.waitFor(
          `初始化任务 ${created.id}`,
          () => this.deps.runManager.environmentInitialization(created.id),
          (view) => view.status === 'PASS' || view.status === 'FAIL' || view.status === 'INTERRUPTED',
          (view) => {
            step.logTail = view.logTail.slice(-LOG_TAIL_LINES);
          },
        );
        step.logTail = final.logTail.slice(-LOG_TAIL_LINES);
        if (final.status !== 'PASS') {
          throw new Error(final.message ?? `初始化终态 ${final.status}。`);
        }
        return final.message ?? '初始化完成。';
      }
      case 'check': {
        const result = await checkEnvironmentConfiguration(this.projectRoot, job.environment);
        for (const item of result.checks) {
          record(step, `${item.label} · ${item.status} · ${item.detail}`);
        }
        const failed = result.checks.filter((item) => item.status === 'FAIL');
        const warned = result.checks.filter((item) => item.status === 'WARN');
        if (result.status !== 'READY') {
          throw new Error(
            `环境检查 NOT_READY：${failed.map((item) => item.label).join('、') || '详见日志'}。`,
          );
        }
        return `READY（${result.checks.length - failed.length - warned.length} PASS`
          + `${warned.length > 0 ? ` / ${warned.length} WARN` : ''}）`;
      }
      case 'frontend':
        return this.startFrontend(job, step, input.steps.frontend!, secrets, record);
      case 'keeper':
        return this.startKeeper(job, step, input.steps.keeper!, secrets, record);
    }
  }

  /**
   * frontend：转调 FrontendLauncher.start（登记进 registry.json，与 ⑥ 面板同一条记录），再替用户等端口监听。
   * 启动器刻意不等编译（页面按 status 轮询即可），向导是长任务、可以等：分片 waitForPort，片与片之间
   * 复核进程存活并刷新 dev 日志尾巴——进程一退出立刻判失败；到时仍未监听只判失败、不杀进程。
   */
  private async startFrontend(
    job: SetupJob,
    step: SetupStep,
    options: FrontendStepInput,
    secrets: readonly string[],
    record: (step: SetupStep, line: string) => void,
  ): Promise<string> {
    if (options.environment !== undefined && options.environment !== job.environment) {
      record(step, `请求里的前端环境 ${options.environment} 已忽略：向导统一按 ${job.environment} 启动。`);
    }
    record(step, `正在启动本地前端（${options.directory} :${options.port} → ${job.environment}）…`);
    let service: FrontendServiceView;
    try {
      service = await this.deps.frontendLauncher.start({
        action: 'start',
        environment: job.environment,
        directory: options.directory,
        port: options.port,
        ...(options.options !== undefined ? { options: options.options } : {}),
      });
    } catch (error) {
      throw new Error(describeLauncherError(error));
    }
    record(step, `命令：${service.command}`);
    record(step, `pid ${service.pid}（进程组 ${service.pgid}），登记 ${service.id}`);
    record(step, `日志：${service.logPath}`);
    // 上面几行固定不动；等待期间只替换其后的"dev 日志尾部"区，不把每次轮询都追加进去。
    const fixedLines = [...step.logTail];
    const redactLine = (line: string): string => sanitize(redactSecrets(line, secrets), secrets);
    const refreshTail = async (): Promise<string[]> => {
      const tail = (await tailFile(service.logPath, FRONTEND_LOG_TAIL_LINES)).map(redactLine);
      step.logTail = [...fixedLines, `── dev server 日志尾部（${tail.length} 行）──`, ...tail].slice(-LOG_TAIL_LINES);
      return tail;
    };
    const joinTail = (tail: readonly string[]): string => tail.join(' | ') || '（空）';
    const alive = (): boolean => isProcessAlive(service.pid) || isGroupAlive(service.pgid);

    const startedAt = Date.now();
    const deadline = startedAt + FRONTEND_LISTEN_TIMEOUT_MS;
    for (;;) {
      if (!alive()) {
        const tail = await refreshTail();
        throw new Error(clampSummary(
          `前端进程已退出（pid ${service.pid}；登记 ${service.id} 会在 ⑥ 面板下次列举时清理）。日志尾部：${joinTail(tail)}`,
        ));
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      if (await waitForPort(options.port, Math.min(FRONTEND_LISTEN_SLICE_MS, remaining))) {
        await refreshTail();
        step.logTail.push(`端口 ${options.port} 已监听（耗时 ${Math.round((Date.now() - startedAt) / 1000)}s）。`);
        return `本地前端已启动：http://127.0.0.1:${options.port}/trade（${options.directory}，pid ${service.pid}）`;
      }
      await refreshTail();
    }
    const tail = await refreshTail();
    throw new Error(clampSummary(
      `前端 ${FRONTEND_LISTEN_TIMEOUT_MS / 1000}s 内未监听端口 ${options.port}`
        + `（pid ${service.pid} 仍在运行，向导停止等待；请到 ⑥ 本地服务面板查看日志或停止）。日志尾部：${joinTail(tail)}`,
    ));
  }

  /**
   * keeper：转调 KeeperLauncher.execute({ action: 'start' })——车道 / 地址覆盖 / fork 开关 / 游标清理全在启动器里，向导不复制任何判断。
   * 启动器把"请求本身的问题"（只读环境、链不在地址表、车道已有存活进程）作为带状态码的错误抛出，
   * 把"run.sh 跑了但没成"（体检失败、进程秒退）放进 ok=false + warnings + output——两条路都要落成一行可读 summary。
   */
  private async startKeeper(
    job: SetupJob,
    step: SetupStep,
    options: KeeperStepInput,
    secrets: readonly string[],
    record: (step: SetupStep, line: string) => void,
  ): Promise<string> {
    const dryRun = options.options?.dryRun === true;
    record(step, `正在${dryRun ? '以 dry-run ' : ''}启动 Keeper（${job.environment}，workers=${options.workers.join(' / ')}）…`);
    let result: KeeperActionResult;
    try {
      result = await this.deps.keeperLauncher.execute({
        action: 'start',
        environment: job.environment,
        workers: options.workers,
        ...(options.options !== undefined ? { options: options.options } : {}),
      });
    } catch (error) {
      throw new Error(describeLauncherError(error));
    }
    // result.command / output 已由启动器按车道秘密脱敏；这里再按向导词表过一遍是兜底，不是重复劳动。
    const commands = result.command.split('\n').filter((line) => line.trim() !== '');
    for (const line of commands) record(step, `$ ${redactSecrets(line, secrets)}`);
    for (const warning of result.warnings) record(step, `警告：${redactSecrets(warning, secrets)}`);
    const outputTail = result.output.split('\n').filter((line) => line.trim() !== '').slice(-KEEPER_OUTPUT_TAIL_LINES);
    if (outputTail.length) {
      record(step, `── run.sh 输出尾部（${outputTail.length} 行）──`);
      for (const line of outputTail) record(step, redactSecrets(line, secrets));
    }
    if (!result.ok) {
      throw new Error(clampSummary(`Keeper 启动失败：${redactSecrets(decisiveKeeperError(result), secrets)}`));
    }
    if (dryRun) {
      return `Keeper dry-run：未启动任何进程；计划命令 ${commands.length} 条见日志（${options.workers.join(' / ')}）。`;
    }
    // ok=true 但一个都没登记：run.sh 正常退出却没写 pid（典型：worker 私钥未配被跳过）。什么都没起来不能算成功。
    if (!result.started.length) {
      throw new Error('run.sh 正常退出但没有登记任何 keeper 进程（多半是 worker 私钥未配、被 run.sh 跳过），详见日志警告。');
    }
    return `Keeper 已启动：${result.started.map((item) => `${item.name}(pid ${item.pid})`).join('、')}`;
  }

  private async waitFor<T>(
    label: string,
    read: () => T | undefined,
    isTerminal: (value: T) => boolean,
    onPoll: (value: T) => void,
  ): Promise<T> {
    const deadline = Date.now() + STEP_TIMEOUT_MS;
    for (;;) {
      const value = read();
      if (value === undefined) throw new Error(`${label} 的记录丢失，无法跟随。`);
      onPoll(value);
      if (isTerminal(value)) return value;
      if (Date.now() > deadline) {
        throw new Error(`${label} 超过 ${STEP_TIMEOUT_MS / 60000} 分钟未结束，向导停止跟随（原任务可能仍在运行，请到对应面板查看）。`);
      }
      await delay(POLL_INTERVAL_MS);
    }
  }

  private view(job: SetupJob): EnvironmentSetupJobView {
    return {
      id: job.id,
      environment: job.environment,
      status: job.status,
      startedAt: job.startedAt,
      endedAt: job.endedAt ?? null,
      steps: job.steps.map((step) => ({
        step: step.step,
        label: STEP_LABELS[step.step],
        status: step.status,
        startedAt: step.startedAt ?? null,
        endedAt: step.endedAt ?? null,
        summary: step.summary ?? null,
        logTail: step.logTail.slice(-LOG_TAIL_LINES),
      })),
    };
  }
}

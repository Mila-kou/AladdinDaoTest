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
import type { TenderlyForkManager } from './tenderly-forks.js';
import type { RunBatchManager } from './run-batches.js';

/**
 * 环境页「⓪ 一键搭建向导」的编排器：把已有的四个分步能力串成一个长任务——
 *   createFork（TenderlyForkManager.create）→ deploy（ContractDeploymentManager 长任务，轮询至终态）
 *   → init（RunBatchManager.initializeEnvironment 长任务，轮询至终态）→ check（checkEnvironmentConfiguration 只读）。
 * 不重写任何步骤逻辑，只做顺序编排、进度记录与失败传播（一步失败即停，后续步骤标 skipped）。
 * 任务只存进程内存（与合约部署任务一致）；日志与失败信息沿用各管理器的脱敏，再叠加一层 RPC 兜底脱敏。
 */

const STEP_ORDER = ['createFork', 'deploy', 'init', 'check'] as const;
export type EnvironmentSetupStepName = (typeof STEP_ORDER)[number];

const STEP_LABELS: Record<EnvironmentSetupStepName, string> = {
  createFork: '新建/重建 Fork',
  deploy: '部署合约',
  init: '初始化 Mock Bundle',
  check: '环境检查',
};

/** 长任务跟随轮询：2s 一次；单步最长跟随 60 分钟（超时只停止跟随并判失败，不杀原任务）。 */
const POLL_INTERVAL_MS = 2_000;
const STEP_TIMEOUT_MS = 60 * 60 * 1000;
const LOG_TAIL_LINES = 120;

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
});

const createSetupSchema = z.object({
  environment: z.enum(environmentNames),
  steps: setupStepsSchema,
});

type SetupInput = z.output<typeof createSetupSchema>;

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
      throw new Error('至少勾选一个步骤（createFork / deploy / init / check）。');
    }
    const definition = environments[input.environment];
    if (!definition.initializesDefaultMockResources
      && selected.some((name) => name !== 'check')) {
      throw new Error(
        `${input.environment} 仅支持向导的 check 步骤；新建 Fork / 部署 / 初始化只适用于 tx-fork / oracle-fork / time-fork。`,
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
    // RPC 原文只用于日志兜底脱敏，不进任务记录。
    let secrets: string[] = [];
    try {
      const settings = await readEnvironmentSettings(this.projectRoot, job.environment);
      secrets = [settings.rpcUrl ?? '', settings.adminRpcUrl ?? ''].filter(Boolean);
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
          for (const secret of [settings.rpcUrl ?? '', settings.adminRpcUrl ?? '']) {
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
    }
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

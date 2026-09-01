import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { z } from 'zod';

import {
  environmentNames,
  environments,
  type EnvironmentName,
} from '../../config/environments/catalog.js';
import { readEnvironmentSettings } from './environment-settings.js';

/**
 * 环境页「② 部署合约」的长任务管理器：把 scripts/deploy-contracts.ts 包成
 * POST /api/contract-deployments 任务（spawn 子进程 + 内存日志环形缓冲），
 * 模式照抄 EnvironmentInitializationManager。任务只存进程内存，不落盘——
 * 部署产物本身（manifest / .env.local / CURRENT.json / 参数快照）由脚本自动登记。
 */

const CONTRACT_REPOSITORY_PREFIX = 'fx100-contracts@';
/** CURRENT.json excluded 已裁决（2026-08-21）：soso-test 暂不纳入、不引用。 */
const EXCLUDED_REPOSITORY_DIRECTORIES = new Set(['fx100-contracts@soso-test']);
/** 内存日志环形缓冲：保留 400 行，接口只回最近 120 行。 */
const LOG_BUFFER_LINES = 400;
const LOG_TAIL_LINES = 120;

const createContractDeploymentSchema = z.object({
  environment: z.enum(environmentNames),
  branch: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, {
    message: '分支名只允许字母、数字与 . _ / -。',
  }),
  dryRun: z.boolean().default(false),
});

export type ContractDeploymentStatus = 'running' | 'succeeded' | 'failed';

export interface ContractBranch {
  readonly branch: string;
  readonly path: string;
  readonly head: string;
}

interface ContractDeploymentJob {
  readonly id: string;
  readonly environment: EnvironmentName;
  readonly branch: string;
  readonly dryRun: boolean;
  readonly startedAt: string;
  endedAt?: string;
  status: ContractDeploymentStatus;
  exitCode?: number;
  message?: string;
  logTail: string[];
}

export interface ContractDeploymentView {
  readonly id: string;
  readonly environment: EnvironmentName;
  readonly branch: string;
  readonly dryRun: boolean;
  readonly status: ContractDeploymentStatus;
  readonly exitCode: number | null;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly message: string | null;
  readonly logTail: string[];
}

/** 同环境已有 running 任务时抛出；dashboard-server 据此回 409。 */
export class ContractDeploymentConflictError extends Error {}

function safeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'deploy';
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

/** 只读 git 查询（branch --show-current / rev-parse），不改动合约仓。 */
async function gitOutput(directory: string, args: readonly string[]): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('git', ['-C', directory, ...args], {
      shell: false,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.once('error', rejectPromise);
    child.once('exit', (code) => {
      if (code === 0) resolvePromise(output.trim());
      else rejectPromise(new Error(`git ${args.join(' ')} 退出码 ${code ?? 'null'}`));
    });
  });
}

export class ContractDeploymentManager {
  private readonly projectRoot: string;
  private readonly githubDirectory: string;
  private readonly jobs = new Map<string, ContractDeploymentJob>();

  constructor(projectRoot: string) {
    this.projectRoot = resolve(projectRoot);
    this.githubDirectory = join(this.projectRoot, '..', 'Github');
  }

  /** 扫描 Github/ 下 fx100-contracts@* 克隆（排除 soso-test），返回真实 checked-out 分支与短 HEAD。 */
  async listBranches(): Promise<ContractBranch[]> {
    let entries;
    try {
      entries = await readdir(this.githubDirectory, { withFileTypes: true });
    } catch {
      throw new Error(`工作区 Github 目录不可读：${this.githubDirectory}`);
    }
    const branches: ContractBranch[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.startsWith(CONTRACT_REPOSITORY_PREFIX)) continue;
      if (EXCLUDED_REPOSITORY_DIRECTORIES.has(entry.name)) continue;
      const path = join(this.githubDirectory, entry.name);
      try {
        const [branch, head] = await Promise.all([
          gitOutput(path, ['branch', '--show-current']),
          gitOutput(path, ['rev-parse', '--short', 'HEAD']),
        ]);
        if (!branch) continue; // detached HEAD：deploy-contracts 的分支核对必失败，不展示。
        branches.push({ branch, path, head });
      } catch {
        // 非 git 目录或 git 查询失败：跳过，不阻塞其余分支。
      }
    }
    // 新版本排前面，页面默认选中最新分支。
    return branches.sort((left, right) => right.branch.localeCompare(left.branch));
  }

  list(): ContractDeploymentView[] {
    return Array.from(this.jobs.values())
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
      .slice(0, 20)
      .map((job) => this.view(job));
  }

  get(id: string): ContractDeploymentView | undefined {
    const job = this.jobs.get(id);
    return job ? this.view(job) : undefined;
  }

  async create(rawInput: unknown): Promise<ContractDeploymentView> {
    const input = createContractDeploymentSchema.parse(rawInput);
    const definition = environments[input.environment];
    if (!definition.adminRpcEnvironmentVariable || !definition.fixedChainId) {
      throw new Error(`${input.environment} 不支持合约部署（需要 Admin RPC 与固定 Chain ID 的 fork 环境）。`);
    }
    if (!/v\d+\.\d+\.\d+/.test(input.branch)) {
      throw new Error(`分支 ${input.branch} 无法解析版本号（需含 vN.N.N），deploy:contracts 不接受。`);
    }
    const repositoryDirectoryName = `${CONTRACT_REPOSITORY_PREFIX}${input.branch.replaceAll('/', '-')}`;
    if (EXCLUDED_REPOSITORY_DIRECTORIES.has(repositoryDirectoryName)) {
      throw new Error('fx100-contracts@soso-test 已按 2026-08-21 裁决排除（CURRENT.json excluded），不允许部署。');
    }
    const repositoryPath = join(this.githubDirectory, repositoryDirectoryName);
    if (!existsSync(join(repositoryPath, 'hardhat.config.ts'))) {
      throw new Error(`合约仓不存在或不完整：${repositoryPath}（分支需已按 <仓库名>@<分支名> 规范克隆）。`);
    }
    const running = Array.from(this.jobs.values())
      .find((job) => job.environment === input.environment && job.status === 'running');
    if (running) {
      throw new ContractDeploymentConflictError(
        `${input.environment} 已有部署任务 ${running.id}（${running.branch}${running.dryRun ? ' dry-run' : ''}）正在运行；同环境同时只允许一个部署任务。`,
      );
    }

    // RPC 原文只用于日志脱敏，不进任务记录。
    let secrets: string[] = [];
    try {
      const settings = await readEnvironmentSettings(this.projectRoot, input.environment);
      secrets = [settings.rpcUrl ?? '', settings.adminRpcUrl ?? ''].filter(Boolean);
    } catch {
      secrets = [];
    }

    const timestamp = new Date().toISOString();
    const id = `${timestamp.replaceAll(':', '').replaceAll('.', '-')}-${safeIdPart(input.environment)}-${safeIdPart(input.branch)}${input.dryRun ? '-dry-run' : ''}`;
    const job: ContractDeploymentJob = {
      id,
      environment: input.environment,
      branch: input.branch,
      dryRun: input.dryRun,
      startedAt: timestamp,
      status: 'running',
      logTail: [
        `部署任务已创建：env=${input.environment} branch=${input.branch}${input.dryRun ? '（dry-run 预览，不触链）' : ''}`,
      ],
    };
    this.jobs.set(id, job);
    this.execute(job, secrets);
    return this.view(job);
  }

  private execute(job: ContractDeploymentJob, secrets: readonly string[]): void {
    const executable = join(this.projectRoot, 'node_modules', '.bin', 'tsx');
    const args = ['scripts/deploy-contracts.ts', '--env', job.environment, '--branch', job.branch];
    if (job.dryRun) args.push('--dry-run');
    const record = (chunk: Buffer | string): void => {
      const lines = sanitize(String(chunk), secrets).split(/\r?\n/).filter(Boolean);
      job.logTail.push(...lines);
      job.logTail = job.logTail.slice(-LOG_BUFFER_LINES);
    };
    const finish = (exitCode: number, message: string): void => {
      job.exitCode = exitCode;
      job.status = exitCode === 0 ? 'succeeded' : 'failed';
      job.endedAt = new Date().toISOString();
      job.message = message;
      job.logTail.push(message);
      job.logTail = job.logTail.slice(-LOG_BUFFER_LINES);
    };
    try {
      const child = spawn(executable, args, {
        cwd: this.projectRoot,
        env: { ...process.env },
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout.on('data', record);
      child.stderr.on('data', record);
      child.once('error', (error) => {
        finish(1, `部署进程启动失败：${sanitize(error.message, secrets)}`);
      });
      child.once('exit', (code) => {
        const exitCode = code ?? 1;
        if (exitCode === 0) {
          finish(0, job.dryRun
            ? 'dry-run 预览完成（未触链、未登记）。确认计划无误后可执行真实部署。'
            : '部署完成：deployment manifest、.env.local E2E_DEPLOYMENT_MANIFEST、Docs/contract-releases/CURRENT.json、参数快照四处已自动登记。下一步：重新初始化 Mock Market Bundle。');
        } else {
          finish(exitCode, `部署失败：deploy:contracts 退出码 ${exitCode}，详见日志末尾。`);
        }
      });
    } catch (error) {
      finish(1, `部署进程启动失败：${sanitize(error instanceof Error ? error.message : String(error), secrets)}`);
    }
  }

  private view(job: ContractDeploymentJob): ContractDeploymentView {
    return {
      id: job.id,
      environment: job.environment,
      branch: job.branch,
      dryRun: job.dryRun,
      status: job.status,
      exitCode: job.exitCode ?? null,
      startedAt: job.startedAt,
      endedAt: job.endedAt ?? null,
      message: job.message ?? null,
      logTail: job.logTail.slice(-LOG_TAIL_LINES),
    };
  }
}

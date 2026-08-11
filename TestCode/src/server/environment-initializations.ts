import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import dotenv from 'dotenv';
import { z } from 'zod';

import {
  environmentNames,
  environments,
  type EnvironmentName,
} from '../../config/environments/catalog.js';
import {
  isCompleteMockMarketBundle,
  isMockResourceEnvironment,
  loadMockResourceRegistry,
} from '../config/mock-resources.js';
import { maskUrl } from '../config/runtime.js';
import {
  readEnvironmentSettings,
  saveEnvironmentSettings,
  validateRpcUrl,
} from './environment-settings.js';

const initializeEnvironmentSchema = z.object({
  environment: z.enum(environmentNames),
  rpcUrl: z.string().trim().optional(),
  adminRpcUrl: z.string().trim().optional(),
  reuseRpcForAdmin: z.boolean().default(true),
  bundleAlias: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{0,47}$/, {
    message: 'Market Bundle 别名只允许小写字母、数字和连字符，长度 1–48。',
  }).default('default-mock'),
  force: z.boolean().default(false),
  forceSharedCollateral: z.boolean().default(false),
}).superRefine((value, context) => {
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
  const definition = environments[value.environment];
  if (value.adminRpcUrl && !definition.adminRpcEnvironmentVariable) {
    context.addIssue({
      code: 'custom',
      path: ['adminRpcUrl'],
      message: `${value.environment} 不支持 Admin RPC。`,
    });
  }
  if (
    definition.adminRpcEnvironmentVariable
    && value.rpcUrl
    && !value.reuseRpcForAdmin
    && !value.adminRpcUrl
  ) {
    context.addIssue({
      code: 'custom',
      path: ['adminRpcUrl'],
      message: '主 RPC 更新且不复用为 Admin RPC 时，必须同时填写新的 Admin RPC。',
    });
  }
});

type InitializationInput = z.output<typeof initializeEnvironmentSchema>;

export type EnvironmentInitializationStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'PASS'
  | 'FAIL'
  | 'INTERRUPTED';

export interface EnvironmentInitialization {
  readonly id: string;
  readonly environment: EnvironmentName;
  readonly createdAt: string;
  startedAt?: string;
  endedAt?: string;
  status: EnvironmentInitializationStatus;
  readonly rpcUpdated: boolean;
  readonly adminRpcUpdated: boolean;
  readonly bundleAlias: string;
  readonly forceDefaultMock: boolean;
  readonly forceSharedCollateral: boolean;
  rpcMasked?: string;
  adminRpcMasked?: string;
  chainId?: number;
  blockNumber?: string;
  defaultMockStatus?: 'pending-initialization' | 'ready' | 'not-applicable';
  defaultMockMarketStatus?: 'unregistered' | 'registered' | 'not-applicable';
  defaultMockMarketIndex?: number;
  defaultMockMarketProfileId?: string;
  defaultMockMarketParameterCount?: number;
  message?: string;
  logTail: string[];
}

function safeIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'environment';
}

function initializationId(environment: EnvironmentName, bundleAlias: string): string {
  const timestamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '-');
  return `${timestamp}-${safeIdPart(environment)}-${safeIdPart(bundleAlias)}`;
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

async function rpcCall(
  rpcUrl: string,
  method: string,
  params: readonly unknown[] = [],
): Promise<unknown> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json() as {
    result?: unknown;
    error?: { message?: string };
  };
  if (body.error) throw new Error(`${method}: ${body.error.message ?? 'unknown RPC error'}`);
  return body.result;
}

async function expectedChainId(projectRoot: string, environment: EnvironmentName): Promise<number> {
  const values: Record<string, string> = {};
  for (const filename of ['.env', '.env.local']) {
    try {
      Object.assign(values, dotenv.parse(await readFile(join(projectRoot, filename), 'utf8')));
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code !== 'ENOENT') throw error;
    }
  }
  const chainIdKey = environments[environment].chainIdEnvironmentVariable ?? 'E2E_CHAIN_ID';
  const value = Number(values[chainIdKey] ?? values.E2E_CHAIN_ID ?? process.env[chainIdKey] ?? process.env.E2E_CHAIN_ID);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${chainIdKey} 未配置或非法。`);
  return value;
}

export class EnvironmentInitializationManager {
  private readonly projectRoot: string;
  private readonly directory: string;
  private readonly jobs = new Map<string, EnvironmentInitialization>();
  /** 原始 RPC 仅保存在当前进程内，不写入初始化记录。 */
  private readonly pendingInputs = new Map<string, InitializationInput>();
  private persistSequence = 0;

  constructor(projectRoot: string) {
    this.projectRoot = resolve(projectRoot);
    this.directory = join(this.projectRoot, 'artifacts', 'environment-initializations');
  }

  async initialize(): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const entries = await readdir(this.directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const job = JSON.parse(
          await readFile(join(this.directory, entry.name, 'initialization.json'), 'utf8'),
        ) as EnvironmentInitialization;
        if (job.status === 'QUEUED' || job.status === 'RUNNING') {
          job.status = 'INTERRUPTED';
          job.endedAt = new Date().toISOString();
          job.message = '看板服务重启，初始化任务已中断；RPC 原文未持久化，请重新提交。';
          job.logTail.push(job.message);
          await this.persist(job);
        }
        this.jobs.set(job.id, job);
      } catch {
        // 损坏记录不加入列表。
      }
    }
  }

  private async persist(job: EnvironmentInitialization): Promise<void> {
    const directory = join(this.directory, job.id);
    await mkdir(directory, { recursive: true });
    const path = join(directory, 'initialization.json');
    // 初始化任务会在开始、日志推进和结束时多次保存；原子替换避免重启后读到半个 JSON。
    const temporaryPath = `${path}.${process.pid}-${this.persistSequence++}.tmp`;
    await writeFile(
      temporaryPath,
      `${JSON.stringify(job, null, 2)}\n`,
      'utf8',
    );
    await rename(temporaryPath, path);
  }

  list(): EnvironmentInitialization[] {
    return Array.from(this.jobs.values())
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 50);
  }

  get(id: string): EnvironmentInitialization | undefined {
    return this.jobs.get(id);
  }

  async create(rawInput: unknown): Promise<EnvironmentInitialization> {
    const input = initializeEnvironmentSchema.parse(rawInput);
    const definition = environments[input.environment];
    const rpcUrl = input.rpcUrl ? validateRpcUrl(input.rpcUrl) : undefined;
    const explicitAdmin = input.adminRpcUrl ? validateRpcUrl(input.adminRpcUrl) : undefined;
    const adminRpcUrl = definition.adminRpcEnvironmentVariable
      ? input.reuseRpcForAdmin && rpcUrl ? rpcUrl : explicitAdmin
      : undefined;
    const id = initializationId(input.environment, input.bundleAlias);
    const job: EnvironmentInitialization = {
      id,
      environment: input.environment,
      createdAt: new Date().toISOString(),
      status: 'QUEUED',
      rpcUpdated: Boolean(rpcUrl),
      adminRpcUpdated: Boolean(adminRpcUrl),
      bundleAlias: input.bundleAlias,
      // 填写新 RPC 表示切换了 Fork，旧 registry 地址不得复用。
      forceDefaultMock: definition.initializesDefaultMockResources
        && (input.force || Boolean(rpcUrl)),
      forceSharedCollateral: definition.initializesDefaultMockResources
        && (input.forceSharedCollateral || Boolean(rpcUrl)),
      ...(rpcUrl ? { rpcMasked: maskUrl(rpcUrl) } : {}),
      ...(adminRpcUrl ? { adminRpcMasked: maskUrl(adminRpcUrl) } : {}),
      logTail: ['环境初始化任务已创建，等待串行执行。'],
    };
    this.pendingInputs.set(id, { ...input, ...(rpcUrl ? { rpcUrl } : {}), ...(adminRpcUrl ? { adminRpcUrl } : {}) });
    this.jobs.set(id, job);
    await this.persist(job);
    return job;
  }

  async execute(id: string): Promise<void> {
    const job = this.jobs.get(id);
    const input = this.pendingInputs.get(id);
    if (!job || !input) return;
    const definition = environments[job.environment];
    job.status = 'RUNNING';
    job.startedAt = new Date().toISOString();
    job.logTail.push(`开始初始化 ${job.environment}/${job.bundleAlias ?? 'default-mock'}。`);
    await this.persist(job);

    let secrets: string[] = [];
    try {
      const rpcUrl = input.rpcUrl ? validateRpcUrl(input.rpcUrl) : undefined;
      const explicitAdmin = input.adminRpcUrl ? validateRpcUrl(input.adminRpcUrl) : undefined;
      const adminRpcUrl = definition.adminRpcEnvironmentVariable
        ? input.reuseRpcForAdmin && rpcUrl ? rpcUrl : explicitAdmin
        : undefined;
      if (rpcUrl || adminRpcUrl) {
        await saveEnvironmentSettings(this.projectRoot, job.environment, {
          ...(rpcUrl ? { rpcUrl } : {}),
          ...(adminRpcUrl ? { adminRpcUrl } : {}),
        });
        job.logTail.push('RPC 配置已安全写入 .env.local。');
      }
      const settings = await readEnvironmentSettings(this.projectRoot, job.environment);
      if (!settings.rpcUrl) throw new Error(`${definition.rpcEnvironmentVariable} 未配置。`);
      if (definition.adminRpcEnvironmentVariable && !settings.adminRpcUrl) {
        throw new Error(`${definition.adminRpcEnvironmentVariable} 未配置。`);
      }
      secrets = [settings.rpcUrl, settings.adminRpcUrl ?? ''];
      job.rpcMasked = maskUrl(settings.rpcUrl);
      if (settings.adminRpcUrl) job.adminRpcMasked = maskUrl(settings.adminRpcUrl);

      const expected = await expectedChainId(this.projectRoot, job.environment);
      const [chainIdRaw, blockNumberRaw] = await Promise.all([
        rpcCall(settings.rpcUrl, 'eth_chainId'),
        rpcCall(settings.rpcUrl, 'eth_blockNumber'),
      ]);
      const chainId = Number(BigInt(String(chainIdRaw)));
      if (chainId !== expected) throw new Error(`RPC chainId=${chainId}，期望 ${expected}。`);
      job.chainId = chainId;
      job.blockNumber = BigInt(String(blockNumberRaw)).toString();
      job.logTail.push(`RPC 连通：chainId=${chainId}，block=${job.blockNumber}。`);

      if (definition.requiresBaselineReset) {
        const adminUrl = settings.adminRpcUrl ?? settings.rpcUrl;
        const snapshot = await rpcCall(adminUrl, 'evm_snapshot');
        if (typeof snapshot !== 'string') throw new Error('evm_snapshot 未返回快照 ID。');
        if (definition.permitsTimeTravel) {
          await rpcCall(adminUrl, 'evm_increaseTime', [1]);
          await rpcCall(adminUrl, 'evm_mine');
        }
        const reverted = await rpcCall(adminUrl, 'evm_revert', [snapshot]);
        if (reverted !== true) throw new Error('evm_revert 未返回 true。');
        job.logTail.push(definition.permitsTimeTravel
          ? '快照、时间推进、挖块和回滚能力验证通过。'
          : '快照和回滚能力验证通过。');
      }

      if (definition.initializesDefaultMockResources) {
        const executable = join(this.projectRoot, 'node_modules', '.bin', 'tsx');
        const bundleAlias = job.bundleAlias ?? 'default-mock';
        const args = [
          'scripts/init-mock-resources.ts',
          '--project', job.environment,
          '--bundle', bundleAlias,
        ];
        if (job.forceDefaultMock) args.push('--force');
        if (job.forceSharedCollateral) args.push('--force-shared-collateral');
        const childEnvironment: NodeJS.ProcessEnv = {
          ...process.env,
          E2E_ENV: job.environment,
          [definition.rpcEnvironmentVariable]: settings.rpcUrl,
          ...(definition.adminRpcEnvironmentVariable && settings.adminRpcUrl
            ? { [definition.adminRpcEnvironmentVariable]: settings.adminRpcUrl }
            : {}),
        };
        const exitCode = await new Promise<number>((resolveExit, rejectExit) => {
          const child = spawn(executable, args, {
            cwd: this.projectRoot,
            env: childEnvironment,
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          const record = (chunk: Buffer | string) => {
            const lines = sanitize(String(chunk), secrets).split(/\r?\n/).filter(Boolean);
            job.logTail.push(...lines);
            job.logTail = job.logTail.slice(-160);
          };
          child.stdout.on('data', record);
          child.stderr.on('data', record);
          child.once('error', rejectExit);
          child.once('exit', (code) => resolveExit(code ?? 1));
        });
        if (exitCode !== 0) throw new Error(`${bundleAlias} 初始化进程退出码 ${exitCode}。`);
        const registry = await loadMockResourceRegistry();
        if (!isMockResourceEnvironment(job.environment)) {
          throw new Error(`${job.environment} 的 Mock 资源定义不一致。`);
        }
        const resource = registry.resources[job.environment];
        if (!isCompleteMockMarketBundle(resource, bundleAlias)) {
          throw new Error(`${bundleAlias} 初始化进程结束，但 Market Bundle 登记仍不完整。`);
        }
        const bundle = resource.bundles?.[bundleAlias];
        if (!bundle) throw new Error(`${bundleAlias} 初始化完成后未找到登记记录。`);
        job.defaultMockStatus = bundle.status;
        job.defaultMockMarketStatus = bundle.market?.status ?? 'unregistered';
        if (bundle.market?.marketIndex !== undefined) {
          job.defaultMockMarketIndex = bundle.market.marketIndex;
        }
        if (bundle.market?.profileId) {
          job.defaultMockMarketProfileId = bundle.market.profileId;
        }
        if (bundle.market?.configuredParameterCount !== undefined) {
          job.defaultMockMarketParameterCount = bundle.market.configuredParameterCount;
        }
      } else {
        job.defaultMockStatus = 'not-applicable';
        job.defaultMockMarketStatus = 'not-applicable';
      }

      job.status = 'PASS';
      job.message = definition.initializesDefaultMockResources
        ? `环境初始化完成；bundle=${job.bundleAlias ?? 'default-mock'}，状态=${job.defaultMockStatus}，market=${job.defaultMockMarketStatus}`
          + (job.defaultMockMarketIndex === undefined ? '' : `#${job.defaultMockMarketIndex}`)
          + (job.defaultMockMarketParameterCount === undefined ? '' : `，参数=${job.defaultMockMarketParameterCount} 项`)
          + '。'
        : 'RPC 配置与连接验证完成；该环境不部署 default-mock。';
      job.logTail.push(job.message);
    } catch (error) {
      job.status = 'FAIL';
      job.message = sanitize(error instanceof Error ? error.message : String(error), secrets);
      job.logTail.push(`初始化失败：${job.message}`);
    } finally {
      job.endedAt = new Date().toISOString();
      this.pendingInputs.delete(id);
      await this.persist(job);
    }
  }
}

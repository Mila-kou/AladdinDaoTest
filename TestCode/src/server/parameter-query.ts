import { spawn } from 'node:child_process';
import { access, mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import dotenv from 'dotenv';

import {
  environmentNames,
  environments,
  type EnvironmentName,
} from '../../config/environments/catalog.js';
import { normalizeForkDisplayName } from '../domain/fork-display.js';
import { loadParameters, type ParameterReference } from '../reporting/reference-sources.js';
import {
  assertRuntimeEnvironmentBinding,
  loadEnvironmentBinding,
} from '../config/environment-binding.js';

const activeQueries = new Map<EnvironmentName, Promise<ParameterQueryResult>>();

export interface ParameterEnvironmentView {
  readonly name: EnvironmentName;
  readonly displayName: string;
  readonly rpcDisplay: string;
  readonly available: boolean;
  readonly selected: boolean;
}

export interface ParameterQueryResult {
  readonly parameters: ParameterReference;
  readonly cacheHit: boolean;
}

interface SnapshotIdentity {
  readonly meta?: {
    readonly rpc?: string;
    readonly chainId?: number;
    readonly blockNumber?: number;
    readonly deploymentName?: string;
  };
}

function loadLocalEnvironment(projectRoot: string): void {
  dotenv.config({ path: resolve(projectRoot, '.env'), quiet: true, override: true });
  dotenv.config({ path: resolve(projectRoot, '.env.local'), quiet: true, override: true });
}

function rpcUrlFor(name: EnvironmentName): string | undefined {
  const value = process.env[environments[name].rpcEnvironmentVariable]?.trim();
  return value || undefined;
}

/** 只把协议与主机返回给浏览器；路径中的 Alchemy Key / Tenderly 标识一律丢弃。 */
function rpcDisplayName(rawUrl: string | undefined): string {
  if (!rawUrl) return '';
  try {
    const url = new URL(rawUrl);
    return `${url.protocol}//${url.host}/***`;
  } catch {
    return '(RPC 格式非法)';
  }
}

function projectNameFromRpcUrl(rawUrl: string): string | undefined {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    return normalizeForkDisplayName(path.slice(-3).join('/'));
  } catch {
    return undefined;
  }
}

function environmentDisplayName(name: EnvironmentName, rpcUrl?: string): string {
  if (name === 'dev-readonly') return name;
  // 公共 RPC 的 URL 路径可能包含访问令牌，真链环境使用固定名称，绝不从 URL 派生展示值。
  if (name === 'base-sepolia') return 'Base Sepolia';
  const explicit = process.env.E2E_ENV === name
    ? normalizeForkDisplayName(process.env.E2E_FORK_DISPLAY_NAME)
    : undefined;
  const project = explicit ?? (rpcUrl ? projectNameFromRpcUrl(rpcUrl) : undefined);
  return project ? `${name} / ${project}` : name;
}

export function listParameterEnvironments(projectRoot: string): ParameterEnvironmentView[] {
  loadLocalEnvironment(projectRoot);
  const selected = process.env.E2E_ENV ?? 'tx-fork';
  return environmentNames.map((name) => {
    const rpcUrl = rpcUrlFor(name);
    return {
      name,
      displayName: environmentDisplayName(name, rpcUrl),
      rpcDisplay: rpcDisplayName(rpcUrl),
      available: Boolean(rpcUrl),
      selected: name === selected,
    };
  });
}

async function latestBlockNumber(rpcUrl: string): Promise<number> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`RPC 返回 HTTP ${response.status}`);
  const payload = await response.json() as { result?: unknown; error?: { message?: unknown } };
  if (typeof payload.result !== 'string' || !/^0x[0-9a-f]+$/i.test(payload.result)) {
    throw new Error(typeof payload.error?.message === 'string' ? payload.error.message : 'RPC 未返回区块号');
  }
  return Number(BigInt(payload.result));
}

// 参数缓存按「环境 + 绑定的 manifest.name」隔离；切换部署不会复用另一个环境或旧版本的快照。
function cachePaths(projectRoot: string, environment: EnvironmentName, deploymentName: string) {
  const directory = resolve(projectRoot, 'artifacts/parameter-cache', environment);
  return {
    directory,
    snapshot: join(directory, `${deploymentName}.params.json`),
    csv: join(directory, `${deploymentName}.params-by-module.csv`),
  };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function cacheMatches(
  snapshotPath: string,
  displayName: string,
  blockNumber: number,
  deploymentName: string,
): Promise<boolean> {
  try {
    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as SnapshotIdentity;
    return snapshot.meta?.rpc === displayName
      && snapshot.meta.blockNumber === blockNumber
      && snapshot.meta.deploymentName === deploymentName;
  } catch {
    return false;
  }
}

async function runNode(
  script: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): Promise<void> {
  await new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      if (stderr.length < 16_000) stderr += chunk;
    });
    // 消费 stdout，避免参数采集器因 pipe 缓冲区写满而阻塞；内容不写入服务日志。
    child.stdout.resume();
    child.once('error', rejectRun);
    child.once('exit', (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(stderr.trim() || `参数采集器退出码 ${String(code)}`));
    });
  });
}

async function executeParameterQuery(
  projectRoot: string,
  environment: EnvironmentName,
  forceRefresh: boolean,
): Promise<ParameterQueryResult> {
  loadLocalEnvironment(projectRoot);
  const rpcUrl = rpcUrlFor(environment);
  if (!rpcUrl) throw new Error(`Project 环境 ${environment} 未配置 RPC。`);

  const binding = loadEnvironmentBinding(projectRoot, environment);
  await assertRuntimeEnvironmentBinding({
    environment,
    chainId: binding.binding.environmentChainId,
    rpcUrl,
    deploymentManifestPath: binding.manifestPath,
    deploymentId: binding.binding.deploymentId,
    deploymentRelease: binding.binding.release,
    requestTimeoutMs: 30_000,
  }, projectRoot);
  if (!binding.addressesFile) {
    throw new Error(`环境 ${environment} 的绑定 manifest 缺少 source.addressesFile，无法读取参数。`);
  }
  const displayName = environmentDisplayName(environment, rpcUrl);
  const latestBlock = await latestBlockNumber(rpcUrl);
  const paths = cachePaths(projectRoot, environment, binding.manifest.name);
  await mkdir(paths.directory, { recursive: true });
  const cached = !forceRefresh && await fileExists(paths.csv)
    && await cacheMatches(paths.snapshot, displayName, latestBlock, binding.manifest.name);

  if (!cached) {
    const dumpTool = resolve(projectRoot, 'tools/config-dump/dump-config.mjs');
    const groupTool = resolve(projectRoot, 'tools/config-dump/group-by-module.mjs');
    await runNode(dumpTool, [
      '--block', String(latestBlock),
      '--out', paths.directory,
      '--deployment', binding.addressesFile,
      '--deployment-name', binding.manifest.name,
      '--registry', binding.parameterRegistryPath,
      '--rpc-label', displayName,
      '--max-calls', '100000',
      '--expected-chain-id', String(binding.binding.environmentChainId),
    ], { cwd: projectRoot, env: { FX100_RPC_URL: rpcUrl } });
    await runNode(groupTool, [
      '--snapshot', paths.snapshot,
      '--out', paths.csv,
    ], { cwd: projectRoot });
  }

  return {
    parameters: await loadParameters(paths.csv, {
      snapshotPath: paths.snapshot,
      environment,
      displayName,
    }),
    cacheHit: cached,
  };
}

export async function queryParameters(
  projectRoot: string,
  requestedEnvironment: string,
  options: { forceRefresh?: boolean } = {},
): Promise<ParameterQueryResult> {
  if (!environmentNames.includes(requestedEnvironment as EnvironmentName)) {
    throw new Error(`未知 Project 环境：${requestedEnvironment}`);
  }
  const environment = requestedEnvironment as EnvironmentName;
  const running = activeQueries.get(environment);
  if (running) return running;
  const query = executeParameterQuery(projectRoot, environment, options.forceRefresh ?? false)
    .finally(() => activeQueries.delete(environment));
  activeQueries.set(environment, query);
  return query;
}

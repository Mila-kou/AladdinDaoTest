import { spawn } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { mkdir, open, readFile, rename, stat, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { connect } from 'node:net';
import { join, resolve } from 'node:path';

import { loadDeploymentManifest, type DeploymentManifest } from '../config/deployment.js';
import { maskUrl } from '../config/runtime.js';

/**
 * 环境页「⑦ 本地服务：前端 + Keeper」的共享底座（docs/04 §10）。
 *
 * 前端 dev server 与 keeper 都是**常驻**进程，和 environment-initializations / contract-deployments
 * 那种"跑完就退出"的长任务不同：看板进程重启后它们还在跑，所以登记必须落盘（registry.json），
 * 停止必须杀到真正的子进程（§10.1 ④：pid 文件记的是 yarn 包装进程，kill 它不杀 node）。
 * 这里统一提供：detached 进程组启动、落盘登记、日志尾读、进程树/进程组终止、端口探测、
 * 只读 JSON-RPC 与脱敏。启动器（frontend-launcher / keeper-launcher）只关心各自的业务参数。
 */

export const LOCAL_SERVICES_RELATIVE_DIRECTORY = 'artifacts/local-services';
export const BASE_SEPOLIA_PUBLIC_RPC = 'https://sepolia.base.org';

export type LocalServiceKind = 'frontend' | 'keeper';

export interface LocalServiceRecord {
  readonly id: string;
  readonly kind: LocalServiceKind;
  readonly label: string;
  /** detached 启动的直接子进程 pid；因 detached=true 它同时是整棵进程树的进程组 id。 */
  readonly pid: number;
  readonly pgid: number;
  /** 已脱敏的启动命令（只用于展示）。 */
  readonly command: string;
  readonly cwd: string;
  readonly logPath: string;
  readonly startedAt: string;
  readonly environment: string;
  readonly chainId: number | null;
  readonly port: number | null;
  readonly meta: Record<string, unknown>;
}

// ── HTTP 帮助函数：dashboard-server.ts 的同名函数未导出，这里复刻同样的判定，行为保持一致 ──

export function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = `${JSON.stringify(body, null, 2)}\n`;
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  response.end(payload);
}

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) throw new Error('请求内容超过 64KB。');
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

export function isSameOriginRequest(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (!origin || !request.headers.host) return false;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

// ── 脱敏 ──

/**
 * 输出前脱敏：显式给出的秘密（RPC 全文等）→ 掩码；Tenderly RPC 路径 → 只留 origin；
 * 环境变量风格的 KEY/SECRET/TOKEN/PRIVATE_KEY 赋值 → 只留变量名。
 * 不掩 64 位 hex（那是交易哈希，keeper 日志里靠它排障）。
 */
export function redactSecrets(text: string, secrets: readonly string[] = []): string {
  let output = text;
  for (const secret of secrets) {
    if (!secret || secret.length < 8) continue;
    let replacement = '***';
    try {
      replacement = maskUrl(secret);
    } catch {
      // 不是 URL：用通用掩码
    }
    output = output.replaceAll(secret, replacement);
  }
  return output
    .replace(/https?:\/\/[^\s"']+\.rpc\.tenderly\.co\/[^\s"']+/gi, (match) => {
      try {
        return `${new URL(match).origin}/***`;
      } catch {
        return 'https://***';
      }
    })
    .replace(/\b([A-Z0-9_]*(?:PRIVATE_KEY|API_SECRET|API_KEY|TOKEN|SECRET)[A-Z0-9_]*)=([^\s'"]+)/g, '$1=***');
}

// ── 目录与登记 ──

export function localServicesDirectory(projectRoot: string): string {
  return join(resolve(projectRoot), LOCAL_SERVICES_RELATIVE_DIRECTORY);
}

export async function ensureLocalServicesDirectory(projectRoot: string): Promise<string> {
  const directory = localServicesDirectory(projectRoot);
  await mkdir(directory, { recursive: true });
  return directory;
}

export function newServiceId(kind: LocalServiceKind, suffix: string): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const safeSuffix = suffix.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || kind;
  return `${kind}-${stamp}-${safeSuffix}`;
}

/**
 * 落盘登记：artifacts/local-services/registry.json（artifacts/* 已 gitignore）。
 * 看板进程重启后仍能找到还在跑的前端 / keeper 并把它们停掉。写入串行化 + 原子替换。
 */
export class LocalServiceRegistry {
  private readonly path: string;
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly projectRoot: string) {
    this.path = join(localServicesDirectory(projectRoot), 'registry.json');
  }

  async list(kind?: LocalServiceKind): Promise<LocalServiceRecord[]> {
    const records = await this.read();
    return kind ? records.filter((record) => record.kind === kind) : records;
  }

  async get(id: string): Promise<LocalServiceRecord | undefined> {
    return (await this.read()).find((record) => record.id === id);
  }

  async upsert(record: LocalServiceRecord): Promise<void> {
    await this.mutate((records) => [...records.filter((item) => item.id !== record.id), record]);
  }

  async remove(id: string): Promise<void> {
    await this.mutate((records) => records.filter((item) => item.id !== id));
  }

  /** 清掉进程已不存在的登记（返回被清掉的条目，供页面提示"上次未正常停止"）。 */
  async pruneDead(): Promise<LocalServiceRecord[]> {
    const dead: LocalServiceRecord[] = [];
    await this.mutate((records) => records.filter((record) => {
      const alive = isProcessAlive(record.pid) || isGroupAlive(record.pgid);
      if (!alive) dead.push(record);
      return alive;
    }));
    return dead;
  }

  private async read(): Promise<LocalServiceRecord[]> {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8')) as { services?: unknown };
      return Array.isArray(parsed.services) ? (parsed.services as LocalServiceRecord[]) : [];
    } catch {
      return [];
    }
  }

  private mutate(update: (records: LocalServiceRecord[]) => LocalServiceRecord[]): Promise<void> {
    const operation = this.queue.then(async () => {
      await ensureLocalServicesDirectory(this.projectRoot);
      const next = update(await this.read());
      const temporary = `${this.path}.${process.pid}.tmp`;
      await writeFile(temporary, `${JSON.stringify({ services: next }, null, 2)}\n`, 'utf8');
      await rename(temporary, this.path);
    });
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }
}

// ── 进程：启动 / 存活 / 终止 ──

export interface SpawnDetachedOptions {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly logPath: string;
  /** 默认追加；启动新一代服务时传 true 让日志从头开始。 */
  readonly truncateLog?: boolean;
  /** 启动后观察多久判定"没有立刻退出"（默认 600ms）。 */
  readonly settleMs?: number;
}

export interface SpawnDetachedResult {
  readonly pid: number;
  readonly pgid: number;
}

/**
 * 以独立进程组启动常驻进程：stdout/stderr 直接写日志文件（看板进程不持有管道，重启不影响它），
 * detached=true 使 pid 同时成为进程组 id——整棵 yarn → sh → node 树都继承它，停止时一次杀干净。
 * 若进程在 settleMs 内就退出，视为启动失败并把日志尾巴放进错误信息。
 */
export async function spawnDetached(options: SpawnDetachedOptions): Promise<SpawnDetachedResult> {
  await mkdir(resolve(options.logPath, '..'), { recursive: true });
  const fd = openSync(options.logPath, options.truncateLog ? 'w' : 'a');
  let child;
  try {
    child = spawn(options.command, [...options.args], {
      cwd: options.cwd,
      env: options.env,
      detached: true,
      shell: false,
      stdio: ['ignore', fd, fd],
    });
  } finally {
    closeSync(fd);
  }
  const pid = await new Promise<number>((resolvePid, reject) => {
    child.once('error', reject);
    child.once('spawn', () => resolvePid(child.pid ?? -1));
  });
  if (pid <= 0) throw new Error(`进程启动失败：${options.command}`);

  let exitCode: number | null = null;
  child.once('exit', (code) => { exitCode = code ?? 1; });
  await sleep(options.settleMs ?? 600);
  child.unref();
  if (exitCode !== null) {
    const tail = (await tailFile(options.logPath, 30)).join('\n');
    throw new Error(`进程启动后立即退出（退出码 ${exitCode}）。日志尾部：\n${tail}`);
  }
  return { pid, pgid: pid };
}

export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function isGroupAlive(pgid: number): boolean {
  if (!Number.isInteger(pgid) || pgid <= 0) return false;
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** 递归列出 pid 的全部后代（pgrep -P，广度优先），不含 pid 自身。 */
export async function processTree(pid: number): Promise<number[]> {
  const found: number[] = [];
  const queue = [pid];
  while (queue.length) {
    const parent = queue.shift()!;
    const result = await runCommand('pgrep', ['-P', String(parent)], { timeoutMs: 4000 });
    for (const line of result.stdout.split('\n')) {
      const child = Number.parseInt(line.trim(), 10);
      if (Number.isInteger(child) && child > 0 && !found.includes(child)) {
        found.push(child);
        queue.push(child);
      }
    }
  }
  return found;
}

export interface KillTargets {
  readonly pgids?: readonly number[];
  readonly pids?: readonly number[];
}

export interface KillResult {
  readonly signaled: number[];
  readonly remaining: number[];
}

/**
 * 终止：先 SIGTERM 进程组 + 每个 pid 的整棵进程树，等 graceMs 后对仍存活者 SIGKILL。
 * 只对显式给出的目标动手，绝不按进程名全局 pkill（别的会话可能在同一台机器跑另一条车道）。
 */
export async function killGroupsAndTrees(targets: KillTargets, graceMs = 3000): Promise<KillResult> {
  const individuals = new Set<number>();
  for (const pid of targets.pids ?? []) {
    if (!isProcessAlive(pid)) continue;
    individuals.add(pid);
    for (const descendant of await processTree(pid)) individuals.add(descendant);
  }
  const groups = (targets.pgids ?? []).filter(isGroupAlive);
  const signal = (signalName: NodeJS.Signals) => {
    for (const pgid of groups) {
      try { process.kill(-pgid, signalName); } catch { /* 组已消失 */ }
    }
    for (const pid of individuals) {
      try { process.kill(pid, signalName); } catch { /* 进程已消失 */ }
    }
  };
  signal('SIGTERM');
  const deadline = Date.now() + graceMs;
  const survivors = () => [...individuals].filter(isProcessAlive);
  const groupSurvivors = () => groups.filter(isGroupAlive);
  while (Date.now() < deadline && (survivors().length || groupSurvivors().length)) await sleep(250);
  if (survivors().length || groupSurvivors().length) {
    signal('SIGKILL');
    await sleep(400);
  }
  return {
    signaled: [...individuals],
    remaining: survivors(),
  };
}

// ── 日志尾读 ──

export async function tailFile(path: string, lines = 120, maxBytes = 256 * 1024): Promise<string[]> {
  let handle;
  try {
    handle = await open(path, 'r');
  } catch {
    return [];
  }
  try {
    const { size } = await handle.stat();
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    const text = buffer.toString('utf8');
    const all = text.split('\n');
    if (length < size && all.length) all.shift(); // 第一行可能被截半
    while (all.length && all[all.length - 1] === '') all.pop();
    return all.slice(-lines);
  } finally {
    await handle.close();
  }
}

export async function fileMtimeMs(path: string): Promise<number | null> {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return null;
  }
}

// ── 端口 ──

export interface PortListener {
  readonly pid: number;
  readonly command: string;
}

/** lsof 只读探测：谁在监听该 TCP 端口（macOS / Linux 通用）。 */
export async function portListeners(port: number): Promise<PortListener[]> {
  const result = await runCommand('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc'], { timeoutMs: 6000 });
  const listeners: PortListener[] = [];
  let current: { pid?: number; command?: string } = {};
  for (const line of result.stdout.split('\n')) {
    if (line.startsWith('p')) {
      if (current.pid) listeners.push({ pid: current.pid, command: current.command ?? '' });
      current = { pid: Number.parseInt(line.slice(1), 10) };
    } else if (line.startsWith('c')) {
      current.command = line.slice(1);
    }
  }
  if (current.pid) listeners.push({ pid: current.pid, command: current.command ?? '' });
  return listeners.filter((item) => Number.isInteger(item.pid) && item.pid > 0);
}

export function probePort(port: number, host = '127.0.0.1', timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolveProbe) => {
    const socket = connect({ port, host });
    const finish = (value: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolveProbe(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

export async function waitForPort(port: number, timeoutMs: number, intervalMs = 500): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probePort(port)) return true;
    await sleep(intervalMs);
  }
  return false;
}

// ── 只读 JSON-RPC ──

export async function rpcCall(url: string, method: string, params: unknown[] = [], timeoutMs = 8000): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const payload = await response.json() as { result?: unknown; error?: { message?: string } };
  if (payload.error) throw new Error(payload.error.message ?? 'RPC error');
  return payload.result;
}

export interface ChainHead {
  readonly chainId: number;
  readonly blockNumber: number;
  readonly latencyMs: number;
}

export async function readChainHead(url: string, timeoutMs = 8000): Promise<ChainHead> {
  const started = Date.now();
  const [chainIdHex, blockHex] = await Promise.all([
    rpcCall(url, 'eth_chainId', [], timeoutMs),
    rpcCall(url, 'eth_blockNumber', [], timeoutMs),
  ]);
  return {
    chainId: Number.parseInt(String(chainIdHex), 16),
    blockNumber: Number.parseInt(String(blockHex), 16),
    latencyMs: Date.now() - started,
  };
}

export async function hasContractCode(url: string, address: string): Promise<boolean> {
  const code = await rpcCall(url, 'eth_getCode', [address, 'latest']);
  return typeof code === 'string' && code !== '0x' && code.length > 2;
}

// ── 环境绑定的部署清单 ──

/**
 * 读 config/environment-bindings.json 里该环境绑定的部署清单。
 * 刻意不 import src/config/environment-binding.ts：那是迁移会话尚未入库的模块，看板服务启动时
 * 静态 import 它会让"纯提交"的看板根本起不来；这里只读数据文件，缺失/未绑定时抛可读错误由调用方降级成警告。
 */
export async function readBoundDeploymentManifest(projectRoot: string, environment: string): Promise<DeploymentManifest> {
  const registryPath = join(resolve(projectRoot), 'config', 'environment-bindings.json');
  let registry: { bindings?: Record<string, { manifest?: string }> };
  try {
    registry = JSON.parse(await readFile(registryPath, 'utf8')) as typeof registry;
  } catch (error) {
    throw new Error(`读不到 config/environment-bindings.json：${error instanceof Error ? error.message : String(error)}`);
  }
  const manifestPath = registry.bindings?.[environment]?.manifest;
  if (!manifestPath) throw new Error(`config/environment-bindings.json 未绑定环境 ${environment}`);
  return loadDeploymentManifest(resolve(projectRoot, manifestPath));
}

// ── 只读 shell 命令（redis-cli / lsof / pgrep / git）──

export interface RunCommandOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  readonly input?: string;
  /**
   * 以独立进程组运行：命令本身跑完就退出，但它在后台拉起的子进程（keeper-runner 的
   * `yarn … &`）继承这个新进程组，之后可按 pgid（= 返回的 pid）整组终止。
   */
  readonly detached?: boolean;
}

export interface RunCommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  /** 命令进程的 pid；detached=true 时同时是它拉起的后台子进程的进程组 id。 */
  readonly pid: number;
}

export function runCommand(command: string, args: readonly string[], options: RunCommandOptions = {}): Promise<RunCommandResult> {
  return new Promise((resolveResult) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      detached: options.detached === true,
      stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    const pid = child.pid ?? -1;
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, options.timeoutMs ?? 30_000);
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.once('error', (error) => {
      clearTimeout(timer);
      resolveResult({ code: 127, stdout, stderr: `${stderr}${error.message}`, timedOut, pid });
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolveResult({ code: code ?? 1, stdout, stderr, timedOut, pid });
    });
    if (options.input !== undefined && child.stdin) {
      child.stdin.end(options.input);
    }
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

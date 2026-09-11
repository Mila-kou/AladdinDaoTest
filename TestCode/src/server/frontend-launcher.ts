import { constants as fsConstants } from 'node:fs';
import { access, readdir } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { z } from 'zod';

import { environmentNames, type EnvironmentName } from '../../config/environments/catalog.js';
import { readBoundDeploymentManifest } from './local-services-core.js';
import { maskUrl } from '../config/runtime.js';
import { readEnvironmentSettings, type RawEnvironmentSettings } from './environment-settings.js';
import {
  BASE_SEPOLIA_PUBLIC_RPC,
  LocalServiceRegistry,
  fileMtimeMs,
  hasContractCode,
  isGroupAlive,
  isProcessAlive,
  isSameOriginRequest,
  killGroupsAndTrees,
  localServicesDirectory,
  newServiceId,
  portListeners,
  probePort,
  readChainHead,
  readJsonBody,
  redactSecrets,
  runCommand,
  sendJson,
  spawnDetached,
  tailFile,
  type ChainHead,
  type KillResult,
  type LocalServiceRecord,
} from './local-services-core.js';

/**
 * 环境页「⑦ 本地服务：前端」的启动器（docs/04 §10.2～§10.4）：把 Github/fx100-apps@<分支> 的
 * apps/fx-base-app 以 `next dev -p <port>` 起在指定端口、指向指定环境的 RPC。
 *
 * 与 contract-deployments（跑完就退出的长任务）不同，dev server 是常驻进程：登记落盘在
 * local-services-core 的 registry.json，看板重启后仍能列出并停掉；停止按 pgid + 进程树杀，
 * 绝不按进程名全局 pkill（同机可能有别的会话在跑另一条车道）。
 *
 * 秘密处理的两条硬规矩：
 *   · Chainlink 四个变量住在 keeper 的 .env 里——看板进程**永远不读**那个文件，只把路径经
 *     FX_KEEPER_ENV_FILE 交给 bash，由 shell 侧 grep+eval 抽取后 exec 进 dev server，值不进 Node、不进日志；
 *   · RPC 全文只在 precheck 响应里给一次（页面拿去填钱包，§10.4），登记的 command / 日志尾 / 错误全部脱敏。
 */

const ROUTE_PREFIX = '/api/local-services/frontend';
const APPS_REPOSITORY_PREFIX = 'fx100-apps@';
const APP_WORKSPACE = 'fx-base-app';
/** 3010 是 .claude/launch.json 常驻的 fx100-frontend-local，这里永远不去碰它。 */
const RESERVED_FRONTEND_PORT = 3010;
export const DEFAULT_FRONTEND_PORT = 3110;
/**
 * 前端应用层支持链 = FX100_CHAIN_IDS = [8453, 84532, 99918]（apps/fx-base-app/src/config/fx100.ts:5）；
 * 99918（BASE_FORK）还要 NEXT_PUBLIC_SHOW_DEV_CHAINS=true 才进钱包链列表；99917 只在 SDK 静态表里，
 * 应用层不认（sdkConfigs 无此项、wagmi 未登记、MARKET_PAIRS 为空）。事实核查见 artifacts/local-services-research.md。
 */
const FRONTEND_APP_CHAIN_ID = 84532;
const FRONTEND_DEV_CHAIN_ID = 99918;
const SDK_ONLY_FORK_CHAIN_ID = 99917;
const DEFAULT_KEEPER_ENV_RELATIVE_PATH = 'tools/keeper-runner/.env';
const DEFAULT_PRICE_FEED_API_URL = 'https://fx100-apps.vercel.app/api';
const DEFAULT_API_URL = 'https://fx100-apps.vercel.app';
const LOG_TAIL_LINES = 40;
const LOG_DEFAULT_LINES = 300;
const LOG_MAX_LINES = 2000;

export type FrontendPatchState = 'PATCHED' | 'CLEAN' | 'MIXED' | 'UNKNOWN';

export interface FrontendBranch {
  readonly directory: string;
  readonly branch: string;
  readonly head: string;
  readonly path: string;
  readonly patch: FrontendPatchState;
  readonly installStale: boolean;
  readonly installHint: string | null;
}

export type FrontendPrecheckStatus = 'PASS' | 'WARN' | 'FAIL';

export interface FrontendPrecheckItem {
  readonly name: string;
  readonly status: FrontendPrecheckStatus;
  readonly detail: string;
}

export interface FrontendPrecheck {
  readonly environment: EnvironmentName;
  readonly chainId: number | null;
  /** RPC 全文：页面用来填钱包自定义网络（docs/04 §10.4），只在这里返回。 */
  readonly rpcUrl: string | null;
  readonly rpcMasked: string | null;
  readonly checks: FrontendPrecheckItem[];
  readonly heads: { readonly fork: ChainHead | null; readonly baseSepolia: ChainHead | null };
  readonly identifyHint: string;
}

export interface FrontendStartOptions {
  readonly marketsDataSource: 'api' | 'split';
  /** 省略时：非 base-sepolia 环境默认 true（fork 补丁注入的 mock 市场在 DISPLAY_DEV_MARKETS 里，只在此开关下显示）。 */
  readonly showDevMarkets?: boolean | undefined;
  readonly gateEnabled: boolean;
  readonly flashEnabled: boolean;
  readonly priceFeedApiUrl: string;
  readonly apiUrl: string;
  readonly chainlinkFromKeeperEnv: boolean;
}

export type FrontendServiceStatus = 'starting' | 'listening' | 'exited';

export interface FrontendServiceView {
  readonly id: string;
  readonly directory: string;
  readonly branch: string;
  readonly head: string;
  readonly environment: string;
  readonly chainId: number | null;
  readonly port: number;
  readonly url: string;
  readonly pid: number;
  readonly pgid: number;
  readonly status: FrontendServiceStatus;
  readonly startedAt: string;
  readonly uptimeSeconds: number;
  readonly logPath: string;
  readonly logTail: string[];
  readonly command: string;
  readonly options: FrontendStartOptions;
}

export interface FrontendStopResult {
  readonly stopped: true;
  readonly id: string;
  readonly result: KillResult;
}

// ── 校验 ──

function isHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

const directorySchema = z.string().trim().min(1).max(160).regex(/^fx100-apps@[A-Za-z0-9._-]+$/, {
  message: '前端目录必须形如 fx100-apps@<分支目录名>（Github/ 下的克隆或 worktree 目录名）。',
});
const portSchema = z.coerce.number().int().min(1024).max(65535);
const httpUrlSchema = z.string().trim().min(1).max(500).refine(isHttpUrl, { message: '必须是 http(s) 地址。' });

const startOptionsSchema = z.object({
  marketsDataSource: z.enum(['api', 'split']).default('api'),
  showDevMarkets: z.boolean().optional(),
  gateEnabled: z.boolean().default(false),
  flashEnabled: z.boolean().default(false),
  priceFeedApiUrl: httpUrlSchema.default(DEFAULT_PRICE_FEED_API_URL),
  apiUrl: httpUrlSchema.default(DEFAULT_API_URL),
  chainlinkFromKeeperEnv: z.boolean().default(true),
});

const startSchema = z.object({
  action: z.literal('start'),
  environment: z.enum(environmentNames),
  directory: directorySchema,
  port: portSchema,
  // 不用 .default({})：zod 4 的 default 值不再经过内层解析，内层字段的默认值会丢；改为缺省时显式 parse({})。
  options: z.unknown().optional(),
});

const stopSchema = z.object({
  action: z.literal('stop'),
  id: z.string().trim().min(1).max(200),
});

const requestSchema = z.discriminatedUnion('action', [startSchema, stopSchema]);

const precheckQuerySchema = z.object({
  environment: z.enum(environmentNames),
  directory: directorySchema,
  port: portSchema.default(DEFAULT_FRONTEND_PORT),
  flash: z.boolean().default(false),
});

/** 带 HTTP 状态码的业务错误；handle() 据此回 400 / 404 / 409。 */
export class FrontendLauncherError extends Error {
  constructor(readonly status: number, message: string, readonly detail?: string) {
    super(message);
  }
}

function describeZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length ? issue.path.map(String).join('.') : '(root)'}: ${issue.message}`)
    .join('；');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 只在路径含空白或 shell 特殊字符时加单引号，让提示命令可以直接复制执行。 */
function shellQuote(value: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function defaultStartOptions(): FrontendStartOptions {
  return startOptionsSchema.parse({});
}

export class FrontendLauncher {
  private readonly projectRoot: string;
  private readonly githubDirectory: string;
  private readonly registry: LocalServiceRegistry;
  /** 见过的 RPC / WSS 全文：任何出站文本（日志尾、命令、错误）都先按它们脱敏。 */
  private readonly secrets = new Set<string>();
  /** 启动串行化：两个并发 start 同一端口时，后者必须看到前者的登记与监听，才能正确回 409。 */
  private startQueue: Promise<void> = Promise.resolve();

  constructor(projectRoot: string) {
    this.projectRoot = resolve(projectRoot);
    this.githubDirectory = join(this.projectRoot, '..', 'Github');
    this.registry = new LocalServiceRegistry(this.projectRoot);
  }

  // ── HTTP 入口 ──

  /** 处理 /api/local-services/frontend 及其子路径；不属于本前缀返回 false 交回 dashboard-server。 */
  async handle(request: IncomingMessage, response: ServerResponse, url: URL, method: string): Promise<boolean> {
    if (url.pathname !== ROUTE_PREFIX && !url.pathname.startsWith(`${ROUTE_PREFIX}/`)) return false;
    try {
      await this.route(request, response, url, method);
    } catch (error) {
      this.sendError(response, error);
    }
    return true;
  }

  private async route(request: IncomingMessage, response: ServerResponse, url: URL, method: string): Promise<void> {
    const isRead = method === 'GET' || method === 'HEAD';
    const subPath = url.pathname.slice(ROUTE_PREFIX.length);

    if (subPath === '' || subPath === '/') {
      if (isRead) {
        sendJson(response, 200, await this.list());
        return;
      }
      if (method === 'POST') {
        if (!isSameOriginRequest(request)) {
          sendJson(response, 403, { error: '仅允许同源测试看板启动或停止本地前端。' });
          return;
        }
        let body: unknown;
        try {
          body = await readJsonBody(request);
        } catch (error) {
          throw new FrontendLauncherError(400, '请求体不是合法 JSON', errorMessage(error));
        }
        const input = requestSchema.parse(body);
        if (input.action === 'start') {
          sendJson(response, 201, { service: await this.start(input) });
        } else {
          sendJson(response, 200, await this.stop(input.id));
        }
        return;
      }
      sendJson(response, 405, { error: `不支持的方法 ${method}` });
      return;
    }

    if (subPath === '/branches') {
      if (!isRead) { sendJson(response, 405, { error: `不支持的方法 ${method}` }); return; }
      sendJson(response, 200, { branches: await this.listBranches() });
      return;
    }

    if (subPath === '/precheck') {
      if (!isRead) { sendJson(response, 405, { error: `不支持的方法 ${method}` }); return; }
      const query = precheckQuerySchema.parse({
        environment: url.searchParams.get('environment') ?? undefined,
        directory: url.searchParams.get('directory') ?? undefined,
        port: url.searchParams.get('port') ?? undefined,
        flash: url.searchParams.get('flash') === 'true',
      });
      sendJson(response, 200, await this.precheck(query));
      return;
    }

    const logMatch = /^\/([^/]+)\/log$/.exec(subPath);
    if (logMatch) {
      if (!isRead) { sendJson(response, 405, { error: `不支持的方法 ${method}` }); return; }
      const requested = Number.parseInt(url.searchParams.get('lines') ?? '', 10);
      const lines = Number.isInteger(requested) && requested > 0 ? Math.min(requested, LOG_MAX_LINES) : LOG_DEFAULT_LINES;
      sendJson(response, 200, await this.log(decodeURIComponent(logMatch[1]!), lines));
      return;
    }

    sendJson(response, 404, { error: `未知路径 ${url.pathname}` });
  }

  private sendError(response: ServerResponse, error: unknown): void {
    if (response.headersSent) return;
    if (error instanceof z.ZodError) {
      sendJson(response, 400, { error: '参数不合法', detail: describeZodError(error) });
      return;
    }
    if (error instanceof FrontendLauncherError) {
      sendJson(response, error.status, {
        error: error.message,
        ...(error.detail !== undefined ? { detail: this.redact(error.detail) } : {}),
      });
      return;
    }
    sendJson(response, 500, { error: '本地前端服务操作失败', detail: this.redact(errorMessage(error)) });
  }

  // ── 分支目录 ──

  /** 扫描 Github/ 下 fx100-apps@*（不排除任何目录），附带 fork 补丁状态与依赖是否过期。 */
  async listBranches(): Promise<FrontendBranch[]> {
    let entries;
    try {
      entries = await readdir(this.githubDirectory, { withFileTypes: true });
    } catch {
      throw new Error(`工作区 Github 目录不可读：${this.githubDirectory}`);
    }
    const candidates = entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(APPS_REPOSITORY_PREFIX))
      .map((entry) => entry.name);
    const branches = await Promise.all(candidates.map(async (directory) => {
      const path = join(this.githubDirectory, directory);
      let branch: string;
      let head: string;
      try {
        [branch, head] = await Promise.all([
          this.gitOutput(path, ['branch', '--show-current']),
          this.gitOutput(path, ['rev-parse', '--short', 'HEAD']),
        ]);
      } catch {
        return null; // 非 git 目录或 git 查询失败：跳过，不阻塞其余分支。
      }
      const [patch, install] = await Promise.all([this.patchState(path), this.installState(path)]);
      return {
        directory,
        // worktree 可能处于 detached HEAD：dev server 照样能起，只是没有分支名可显示。
        branch: branch || '(detached)',
        head,
        path,
        patch,
        installStale: install.stale,
        installHint: install.hint,
      } satisfies FrontendBranch;
    }));
    // develop 是默认前端基线（CURRENT.json frontend），排最前；其余按目录名。
    return branches
      .filter((item): item is FrontendBranch => item !== null)
      .sort((left, right) => {
        if (left.directory === `${APPS_REPOSITORY_PREFIX}develop`) return -1;
        if (right.directory === `${APPS_REPOSITORY_PREFIX}develop`) return 1;
        return left.directory.localeCompare(right.directory);
      });
  }

  /** 只读 git 查询（branch --show-current / rev-parse），不改动前端仓。 */
  private async gitOutput(directory: string, args: readonly string[]): Promise<string> {
    const result = await runCommand('git', ['-C', directory, ...args], { timeoutMs: 8000 });
    if (result.code !== 0) throw new Error(`git ${args.join(' ')} 退出码 ${result.code}`);
    return result.stdout.trim();
  }

  /**
   * 只读调用 scripts/frontend-fork-patch.ts status，按三个文件的 PATCHED/clean 行归并：
   * 全 PATCHED → PATCHED；全 clean → CLEAN；混合 → MIXED；脚本失败（文件缺失等）→ UNKNOWN。
   * 不自己解析哨兵——补丁形状归那个脚本管，这里只信它的 stdout（pipeline.ts 也按同一输出解析）。
   */
  private async patchState(frontendRoot: string): Promise<FrontendPatchState> {
    const localTsx = join(this.projectRoot, 'node_modules', '.bin', 'tsx');
    const useLocal = await pathExists(localTsx);
    const result = await runCommand(
      useLocal ? localTsx : 'npx',
      [...(useLocal ? [] : ['tsx']), 'scripts/frontend-fork-patch.ts', 'status', '--frontend-root', frontendRoot],
      { cwd: this.projectRoot, timeoutMs: 30_000 },
    );
    if (result.code !== 0) return 'UNKNOWN';
    const states = result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => (line.startsWith('PATCHED') ? 'PATCHED' : line.startsWith('clean') ? 'CLEAN' : 'UNKNOWN'));
    if (!states.length || states.includes('UNKNOWN')) return 'UNKNOWN';
    if (states.every((state) => state === 'PATCHED')) return 'PATCHED';
    if (states.every((state) => state === 'CLEAN')) return 'CLEAN';
    return 'MIXED';
  }

  /**
   * 依赖是否过期：yarn.lock 比安装标记新。Yarn 4（nodeLinker node-modules）真正反映磁盘链接状态的是
   * node_modules/.yarn-state.yml；.yarn/install-state.gz 任何一次解析都会刷新、不代表已链接，故不用。
   * Yarn 1 是 node_modules/.yarn-integrity。标记不存在视为从未安装；没有 yarn.lock 则不判定。
   */
  private async installState(frontendRoot: string): Promise<{ stale: boolean; hint: string | null }> {
    const lockMtime = await fileMtimeMs(join(frontendRoot, 'yarn.lock'));
    if (lockMtime === null) return { stale: false, hint: null };
    const markers = await Promise.all([
      fileMtimeMs(join(frontendRoot, 'node_modules', '.yarn-state.yml')),
      fileMtimeMs(join(frontendRoot, 'node_modules', '.yarn-integrity')),
    ]);
    const present = markers.filter((value): value is number => value !== null);
    const markerMtime = present.length ? Math.max(...present) : null;
    const stale = markerMtime === null || lockMtime > markerMtime;
    return { stale, hint: stale ? `cd ${shellQuote(frontendRoot)} && yarn install` : null };
  }

  private async findBranch(directory: string): Promise<FrontendBranch> {
    const branch = (await this.listBranches()).find((item) => item.directory === directory);
    if (!branch) {
      throw new FrontendLauncherError(400, `前端目录不存在：${directory}`, `Github/ 下没有名为 ${directory} 的 fx100-apps 克隆或 worktree。`);
    }
    return branch;
  }

  // ── 环境设置与脱敏 ──

  private async readSettings(environment: EnvironmentName): Promise<RawEnvironmentSettings> {
    const settings = await readEnvironmentSettings(this.projectRoot, environment);
    for (const secret of [settings.rpcUrl, settings.adminRpcUrl, settings.wssUrl]) {
      if (secret) this.secrets.add(secret);
    }
    return settings;
  }

  private redact(text: string): string {
    return redactSecrets(text, [...this.secrets]);
  }

  private keeperEnvFile(): string {
    const configured = process.env.KEEPER_ENV_FILE?.trim();
    if (!configured) return join(this.projectRoot, DEFAULT_KEEPER_ENV_RELATIVE_PATH);
    return isAbsolute(configured) ? configured : resolve(this.projectRoot, configured);
  }

  // ── 前置检查（docs/04 §10.3）──

  async precheck(input: z.infer<typeof precheckQuerySchema>): Promise<FrontendPrecheck> {
    const branch = await this.findBranch(input.directory);
    const settings = await this.readSettings(input.environment);
    const checks: FrontendPrecheckItem[] = [];
    const isBaseSepolia = input.environment === 'base-sepolia';

    // 两条链的块高并排给页面：Fork 与真链 chainId 相同时，只有块高 / RPC 全文能分辨交易发到了哪条链。
    const safeHead = async (url: string | undefined): Promise<{ head: ChainHead | null; error: string | null }> => {
      if (!url) return { head: null, error: '未配置 RPC' };
      try {
        return { head: await readChainHead(url), error: null };
      } catch (error) {
        return { head: null, error: this.redact(errorMessage(error)) };
      }
    };
    const [fork, baseSepolia] = await Promise.all([safeHead(settings.rpcUrl), safeHead(BASE_SEPOLIA_PUBLIC_RPC)]);

    // (1) chainId 在前端支持列表内
    if (!settings.chainId) {
      checks.push({ name: 'chainId', status: 'WARN', detail: `${input.environment} 尚未配置固定 Chain ID，先在“测试环境”填写。` });
    } else if (settings.chainId === FRONTEND_APP_CHAIN_ID) {
      checks.push({ name: 'chainId', status: 'PASS', detail: 'Chain ID 84532 = 前端 BASE_SEPOLIA，在应用层 FX100_CHAIN_IDS 内，钱包可直接连接。' });
    } else if (settings.chainId === FRONTEND_DEV_CHAIN_ID) {
      checks.push({ name: 'chainId', status: 'WARN', detail: 'Chain ID 99918 = 前端 BASE_FORK（dev 链）：需要 NEXT_PUBLIC_SHOW_DEV_CHAINS=true 才出现在钱包链列表，且合约地址表是前端仓库里写死的 dev fork 地址。' });
    } else if (settings.chainId === SDK_ONLY_FORK_CHAIN_ID) {
      checks.push({ name: 'chainId', status: 'WARN', detail: 'Chain ID 99917 只存在于 SDK 静态表：应用层 FX100_CHAIN_IDS 不含它、wagmi 未登记、MARKET_PAIRS 为空，页面基本不可用。' });
    } else {
      checks.push({
        name: 'chainId',
        status: 'WARN',
        detail: `Chain ID ${settings.chainId}：前端应用层只认 84532（config/fx100.ts FX100_CHAIN_IDS），MetaMask 会提示不支持的网络；E2E 注入钱包（E2E_TRADER_PROFILE=ui + fork 补丁）路径仍可用。要给人手工用，请把 Fork 建成 84532。`,
      });
    }

    // (2) 端口空闲
    if (input.port === RESERVED_FRONTEND_PORT) {
      checks.push({ name: 'port', status: 'FAIL', detail: `端口 ${RESERVED_FRONTEND_PORT} 保留给常驻 fx100-frontend-local（.claude/launch.json），请改用其它端口（默认 ${DEFAULT_FRONTEND_PORT}）。` });
    } else {
      const listeners = await portListeners(input.port);
      const registered = await this.registeredFrontendOnPort(input.port);
      if (listeners.length) {
        const who = listeners.map((item) => `pid ${item.pid}${item.command ? ` (${item.command})` : ''}`).join('、');
        checks.push({ name: 'port', status: 'FAIL', detail: `端口 ${input.port} 已被占用：${who}${registered ? `；且看板登记的 ${registered.id} 正使用该端口` : ''}` });
      } else if (registered) {
        checks.push({ name: 'port', status: 'FAIL', detail: `端口 ${input.port} 已由看板登记的前端 ${registered.id}（${registered.label}）使用，先停止它。` });
      } else {
        checks.push({ name: 'port', status: 'PASS', detail: `端口 ${input.port} 空闲。` });
      }
    }

    // (3) RPC 可达且 eth_chainId 与配置一致（Fork 被删后仍留在登记里的情况发生过）
    if (!settings.rpcUrl) {
      checks.push({ name: 'rpc', status: 'FAIL', detail: `${input.environment} 尚未配置主 RPC，先在“测试环境”保存并初始化 Fork。` });
    } else if (!fork.head) {
      checks.push({ name: 'rpc', status: 'FAIL', detail: `RPC 不可达（Fork 被删后仍留在登记里？）：${fork.error ?? '未知错误'}` });
    } else if (settings.chainId && fork.head.chainId !== settings.chainId) {
      checks.push({ name: 'rpc', status: 'FAIL', detail: `RPC 实际 eth_chainId=${fork.head.chainId}，与配置 ${settings.chainId} 不一致：登记的 RPC 可能指向了别的链 / 别的 Fork。` });
    } else {
      checks.push({ name: 'rpc', status: 'PASS', detail: `eth_chainId=${fork.head.chainId}，块高 ${fork.head.blockNumber}，延迟 ${fork.head.latencyMs}ms。` });
    }

    // (4) 合约就位：绑定 manifest 的 DataStore / Reader 在该 RPC 上有 code
    checks.push(await this.contractsCheck(input.environment, settings.rpcUrl, fork.head !== null));

    // (5) 依赖是否过期
    checks.push(branch.installStale
      ? { name: 'install', status: 'WARN', detail: `依赖可能过期（yarn.lock 比安装标记新，或从未安装）：${branch.installHint ?? 'yarn install'}` }
      : { name: 'install', status: 'PASS', detail: '依赖安装标记不早于 yarn.lock。' });

    // (6) fork 补丁状态：Fork 环境要 PATCHED 才看得到 default-mock 市场；真链反过来应当 CLEAN
    checks.push(this.patchCheck(branch.patch, isBaseSepolia));

    // (7) Chainlink 报价源：进程环境已有 → 不抽取；否则 keeper .env 必须存在（只 stat，不读）
    const keeperEnvFile = this.keeperEnvFile();
    if (process.env.CHAINLINK_API_KEY) {
      checks.push({ name: 'chainlink', status: 'PASS', detail: '看板进程环境已提供 CHAINLINK_API_KEY，dev server 直接继承，不再从 keeper .env 抽取。' });
    } else if (await pathExists(keeperEnvFile)) {
      checks.push({ name: 'chainlink', status: 'PASS', detail: `启动时由 shell 从 ${this.displayPath(keeperEnvFile)} 只抽取 CHAINLINK_BASE_URL/_API_KEY/_API_SECRET/_NETWORK 四行（看板进程不读取该文件）。` });
    } else {
      checks.push({ name: 'chainlink', status: 'WARN', detail: `未找到 ${this.displayPath(keeperEnvFile)}，进程环境也无 CHAINLINK_API_KEY：本地 /api/prices/* 无报价源（价格走线上 API 时可忽略）。` });
    }

    // (8) Flash / One-Click：前端 /api/relay/* 用 Upstash Redis（HTTP），与 keeper 的 TCP Redis 不是一回事
    if (!input.flash) {
      checks.push({ name: 'flash', status: 'PASS', detail: '未启用 Flash（One-Click），不需要 Upstash Redis。' });
    } else if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      checks.push({ name: 'flash', status: 'PASS', detail: '进程环境已提供 KV_REST_API_URL / KV_REST_API_TOKEN（前端 lib/kv.ts 读的就是这两个），dev server 直接继承。' });
    } else {
      // 前端 relay 入口 lib/kv.ts 只读 KV_REST_API_URL / KV_REST_API_TOKEN（全仓无 UPSTASH_REDIS_REST_*）。
      checks.push({ name: 'flash', status: 'WARN', detail: 'NEXT_PUBLIC_FLASH_ENABLED=true 但进程环境没有 KV_REST_API_URL + KV_REST_API_TOKEN：/api/relay/* 会报 Redis client was initialized without url or token，订单在签名之后、上链之前失败（前端 .env.local 若已配则不受影响）。' });
    }

    return {
      environment: input.environment,
      chainId: settings.chainId ?? null,
      rpcUrl: settings.rpcUrl ?? null,
      rpcMasked: settings.rpcUrl ? maskUrl(settings.rpcUrl) : null,
      checks,
      heads: { fork: fork.head, baseSepolia: baseSepolia.head },
      identifyHint: this.identifyHint(settings.chainId, fork.head, baseSepolia.head),
    };
  }

  private async contractsCheck(environment: EnvironmentName, rpcUrl: string | undefined, rpcReachable: boolean): Promise<FrontendPrecheckItem> {
    let addresses: { dataStore: string; reader: string };
    try {
      const manifest = await readBoundDeploymentManifest(this.projectRoot, environment);
      addresses = { dataStore: manifest.contracts.dataStore, reader: manifest.contracts.reader };
    } catch (error) {
      return { name: 'contracts', status: 'WARN', detail: `无法读取环境绑定 / manifest，跳过合约核对：${this.redact(errorMessage(error))}` };
    }
    if (!rpcUrl || !rpcReachable) {
      return { name: 'contracts', status: 'FAIL', detail: `RPC 不可达，无法核对 DataStore ${addresses.dataStore} / Reader ${addresses.reader} 是否有 code。` };
    }
    try {
      const [dataStore, reader] = await Promise.all([
        hasContractCode(rpcUrl, addresses.dataStore),
        hasContractCode(rpcUrl, addresses.reader),
      ]);
      const missing = [
        ...(dataStore ? [] : [`DataStore ${addresses.dataStore}`]),
        ...(reader ? [] : [`Reader ${addresses.reader}`]),
      ];
      if (missing.length) {
        return { name: 'contracts', status: 'FAIL', detail: `该 RPC 上没有合约 code：${missing.join('、')}（Fork 重建后未部署，或绑定的 manifest 不属于这条 Fork）。` };
      }
      return { name: 'contracts', status: 'PASS', detail: `DataStore ${addresses.dataStore} 与 Reader ${addresses.reader} 均有 code。` };
    } catch (error) {
      return { name: 'contracts', status: 'FAIL', detail: `eth_getCode 失败：${this.redact(errorMessage(error))}` };
    }
  }

  private patchCheck(patch: FrontendPatchState, isBaseSepolia: boolean): FrontendPrecheckItem {
    if (isBaseSepolia) {
      if (patch === 'CLEAN') return { name: 'patch', status: 'PASS', detail: '真链环境：fork 补丁未应用（CLEAN），静态市场表保持原样。' };
      if (patch === 'PATCHED') return { name: 'patch', status: 'WARN', detail: '补丁会把 mock market 顶进 84532 槽位，真链使用前应 revert：npx tsx scripts/frontend-fork-patch.ts revert --frontend-root <目录>' };
      return { name: 'patch', status: 'WARN', detail: `fork 补丁状态 ${patch}：三个文件不一致或 status 脚本失败，先执行 npx tsx scripts/frontend-fork-patch.ts status --frontend-root <目录> 查看。` };
    }
    if (patch === 'PATCHED') return { name: 'patch', status: 'PASS', detail: 'fork 补丁已应用（PATCHED），页面能看到 default-mock 市场。' };
    if (patch === 'CLEAN') return { name: 'patch', status: 'WARN', detail: '未注入 mock market：页面看不到 default-mock 市场。需要时执行 npx tsx scripts/frontend-fork-patch.ts apply --env <环境> --frontend-root <目录>' };
    return { name: 'patch', status: 'WARN', detail: `fork 补丁状态 ${patch}：三个文件不一致或 status 脚本失败，先执行 npx tsx scripts/frontend-fork-patch.ts status --frontend-root <目录> 查看。` };
  }

  private identifyHint(chainId: number | undefined, fork: ChainHead | null, baseSepolia: ChainHead | null): string {
    const heights = fork && baseSepolia
      ? `当前 Fork 块高 ${fork.blockNumber} vs 真链 Base Sepolia 块高 ${baseSepolia.blockNumber}（差 ${Math.abs(baseSepolia.blockNumber - fork.blockNumber)} 块）。`
      : 'Fork 或真链块高暂不可得，稍后刷新对比。';
    if (chainId === 84532) {
      return `Fork 与真实 Base Sepolia 的 chainId 同为 84532，钱包不会给出任何提示，只能靠 RPC 地址全文区分：把上面的 RPC 地址填进钱包的自定义网络，并核对块高——${heights}建议给测试地址在 Fork 上充值到易识别的余额（例如 100 ETH），与真链形成对比，一眼看出交易发到了哪条链。`;
    }
    return `该环境 Chain ID ${chainId ?? '未配置'} 与真链 84532 不同，钱包按链号即可区分（但前端只认 84532/99917，见 chainId 检查）；把上面的 RPC 地址填进钱包的自定义网络后核对块高——${heights}仍建议给测试地址在 Fork 上充值到易识别的余额（例如 100 ETH）作为二次确认。`;
  }

  private displayPath(path: string): string {
    const rel = relative(this.projectRoot, path);
    return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel : path;
  }

  private async registeredFrontendOnPort(port: number): Promise<LocalServiceRecord | undefined> {
    const records = await this.registry.list('frontend');
    return records.find((record) => record.port === port && (isProcessAlive(record.pid) || isGroupAlive(record.pgid)));
  }

  // ── 列表 / 启动 / 停止 / 日志 ──

  /**
   * 列出登记的前端。先 pruneDead：进程已死的登记直接移除并放进 pruned（页面据此提示"上次未正常停止"），
   * 所以 services 里的 'exited' 只会在 prune 与探测之间恰好死掉的窄窗口出现。
   */
  async list(): Promise<{ services: FrontendServiceView[]; pruned: { id: string; label: string }[] }> {
    const pruned = (await this.registry.pruneDead())
      .filter((record) => record.kind === 'frontend')
      .map((record) => ({ id: record.id, label: record.label }));
    const records = await this.registry.list('frontend');
    const services = await Promise.all(records.map((record) => this.view(record)));
    services.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
    return { services, pruned };
  }

  async start(input: z.infer<typeof startSchema>): Promise<FrontendServiceView> {
    if (input.port === RESERVED_FRONTEND_PORT) {
      throw new FrontendLauncherError(400, `端口 ${RESERVED_FRONTEND_PORT} 保留给常驻 fx100-frontend-local`, `请改用其它端口（默认 ${DEFAULT_FRONTEND_PORT}）。`);
    }
    const options: FrontendStartOptions = startOptionsSchema.parse(input.options ?? {});
    const branch = await this.findBranch(input.directory);
    const settings = await this.readSettings(input.environment);
    if (!settings.rpcUrl) throw new FrontendLauncherError(400, `${input.environment} 尚未配置主 RPC`, '先在“测试环境”保存并初始化 Fork。');
    if (!settings.chainId) throw new FrontendLauncherError(400, `${input.environment} 尚未配置固定 Chain ID`, '先在“测试环境”填写。');
    const rpcUrl = settings.rpcUrl;
    const chainId = settings.chainId;

    return this.serialize(async () => {
      const listeners = await portListeners(input.port);
      if (listeners.length) {
        const who = listeners.map((item) => `pid ${item.pid}${item.command ? ` (${item.command})` : ''}`).join('、');
        throw new FrontendLauncherError(409, `端口 ${input.port} 已被占用`, who);
      }
      const registered = await this.registeredFrontendOnPort(input.port);
      if (registered) {
        throw new FrontendLauncherError(409, `端口 ${input.port} 已由看板登记的前端使用`, `${registered.id}（${registered.label}），先停止它。`);
      }

      // docs/04 §10.2：页面读链 / 服务端 API 读链 / relay 路由三处 RPC 都指向该环境；
      // NEXT_PUBLIC_RPC_URL 刻意不注入——前端里唯一读它的是 api/_lib/viemClient.ts 的 **以太坊主网** client（且无调用方）。
      // 前端没有 NEXT_PUBLIC_BASE_SEPOLIA_FORK_* 变量（99917 是写死的常量），chainId≠84532 时也没有可注入的东西。
      const keeperEnvFile = this.keeperEnvFile();
      const extractChainlink = options.chainlinkFromKeeperEnv && !process.env.CHAINLINK_API_KEY;
      const injected: Record<string, string> = {
        NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL: rpcUrl,
        BASE_SEPOLIA_RPC_URL: rpcUrl,
        RELAY_KEEPER_RPC_URL: rpcUrl,
        NEXT_PUBLIC_MARKETS_DATA_SOURCE: options.marketsDataSource,
        // constants/markets.ts:366：DISPLAY_DEV_MARKETS 只在 SHOW_DEV_MARKETS=true 时显示；fork 补丁加的 mock 市场就在里面。
        NEXT_PUBLIC_SHOW_DEV_MARKETS: (options.showDevMarkets ?? input.environment !== 'base-sepolia') ? 'true' : 'false',
        NEXT_PUBLIC_GATE_ENABLED: options.gateEnabled ? 'true' : 'false',
        NEXT_PUBLIC_FLASH_ENABLED: options.flashEnabled ? 'true' : 'false',
        NEXT_PUBLIC_PRICE_FEED_API_URL: options.priceFeedApiUrl,
        NEXT_PUBLIC_API_URL: options.apiUrl,
        FX_KEEPER_ENV_FILE: keeperEnvFile,
      };
      const devCommand = `yarn workspace ${APP_WORKSPACE} exec next dev -p ${input.port}`;
      // Chainlink 四个值只在 bash 里存在：grep 抽行 → eval 赋值（set -a 导出）→ exec 成 dev server。
      // 看板进程既不读文件也拿不到值；grep 无匹配 / 文件不存在时 eval 空串，等于不注入。
      const script = extractChainlink
        ? `set -a; eval "$(grep -E '^CHAINLINK_(BASE_URL|API_KEY|API_SECRET|NETWORK)=' "$FX_KEEPER_ENV_FILE" 2>/dev/null)"; set +a; exec ${devCommand}`
        : `exec ${devCommand}`;
      const logPath = join(localServicesDirectory(this.projectRoot), `frontend-${input.port}.log`);
      const commandForDisplay = this.redact([
        `cd ${shellQuote(branch.path)} &&`,
        `NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL=${maskUrl(rpcUrl)}`,
        `BASE_SEPOLIA_RPC_URL=${maskUrl(rpcUrl)}`,
        `RELAY_KEEPER_RPC_URL=${maskUrl(rpcUrl)}`,
        `NEXT_PUBLIC_MARKETS_DATA_SOURCE=${options.marketsDataSource}`,
        `NEXT_PUBLIC_SHOW_DEV_MARKETS=${options.showDevMarkets ?? input.environment !== 'base-sepolia'}`,
        `NEXT_PUBLIC_GATE_ENABLED=${options.gateEnabled}`,
        `NEXT_PUBLIC_FLASH_ENABLED=${options.flashEnabled}`,
        `NEXT_PUBLIC_PRICE_FEED_API_URL=${options.priceFeedApiUrl}`,
        `NEXT_PUBLIC_API_URL=${options.apiUrl}`,
        ...(extractChainlink ? [`FX_KEEPER_ENV_FILE=${this.displayPath(keeperEnvFile)}`] : []),
        `bash -c ${JSON.stringify(script)}`,
      ].join(' '));

      let spawned;
      try {
        spawned = await spawnDetached({
          command: 'bash',
          args: ['-c', script],
          cwd: branch.path,
          env: { ...process.env, ...injected },
          logPath,
          truncateLog: true,
        });
      } catch (error) {
        throw new FrontendLauncherError(500, '前端 dev server 启动失败', errorMessage(error));
      }

      const record: LocalServiceRecord = {
        id: newServiceId('frontend', `${input.directory}-${input.port}`),
        kind: 'frontend',
        label: `${input.directory} :${input.port} → ${input.environment}`,
        pid: spawned.pid,
        pgid: spawned.pgid,
        command: commandForDisplay,
        cwd: branch.path,
        logPath,
        startedAt: new Date().toISOString(),
        environment: input.environment,
        chainId,
        port: input.port,
        meta: { directory: input.directory, branch: branch.branch, head: branch.head, options },
      };
      await this.registry.upsert(record);
      // 不等编译：Next dev 首次监听要 30～90s，页面按 status 轮询即可。
      return this.view(record);
    });
  }

  async stop(id: string): Promise<FrontendStopResult> {
    const record = await this.registry.get(id);
    if (!record || record.kind !== 'frontend') {
      throw new FrontendLauncherError(404, `未登记的前端服务：${id}`);
    }
    // 进程已死也照样走一遍（kill 对不存在的目标是空操作），然后把登记清掉。
    const result = await killGroupsAndTrees({ pgids: [record.pgid], pids: [record.pid] });
    await this.registry.remove(id);
    return { stopped: true, id, result };
  }

  async log(id: string, lines: number): Promise<{ id: string; logPath: string; lines: string[] }> {
    const record = await this.registry.get(id);
    if (!record || record.kind !== 'frontend') {
      throw new FrontendLauncherError(404, `未登记的前端服务：${id}`);
    }
    await this.readSettings(record.environment as EnvironmentName).catch(() => undefined);
    const tail = await tailFile(record.logPath, lines);
    return { id, logPath: record.logPath, lines: tail.map((line) => this.redact(line)) };
  }

  private async view(record: LocalServiceRecord): Promise<FrontendServiceView> {
    // 该环境的 RPC/WSS 可能还没进 secrets（看板重启后首次列举），先补上再脱敏日志尾。
    if ((environmentNames as readonly string[]).includes(record.environment)) {
      await this.readSettings(record.environment as EnvironmentName).catch(() => undefined);
    }
    const port = record.port ?? 0;
    const alive = isProcessAlive(record.pid) || isGroupAlive(record.pgid);
    const listening = alive && port > 0 && await probePort(port);
    const status: FrontendServiceStatus = !alive ? 'exited' : listening ? 'listening' : 'starting';
    const tail = await tailFile(record.logPath, LOG_TAIL_LINES);
    const meta = record.meta ?? {};
    const parsedOptions = startOptionsSchema.safeParse(meta.options);
    const startedAtMs = Date.parse(record.startedAt);
    return {
      id: record.id,
      directory: typeof meta.directory === 'string' ? meta.directory : '',
      branch: typeof meta.branch === 'string' ? meta.branch : '',
      head: typeof meta.head === 'string' ? meta.head : '',
      environment: record.environment,
      chainId: record.chainId,
      port,
      url: `http://127.0.0.1:${port}`,
      pid: record.pid,
      pgid: record.pgid,
      status,
      startedAt: record.startedAt,
      uptimeSeconds: Number.isFinite(startedAtMs) ? Math.max(0, Math.round((Date.now() - startedAtMs) / 1000)) : 0,
      logPath: record.logPath,
      logTail: tail.map((line) => this.redact(line)),
      command: this.redact(record.command),
      options: parsedOptions.success ? parsedOptions.data : defaultStartOptions(),
    };
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.startQueue.then(operation);
    // 失败的启动不能让后续启动永久卡在 rejected 链上。
    this.startQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}

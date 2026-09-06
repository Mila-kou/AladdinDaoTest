import { constants } from 'node:fs';
import { access, mkdir, open, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';

import { z } from 'zod';

import {
  environmentNames,
  environments,
  type EnvironmentName,
} from '../../config/environments/catalog.js';
import { readBoundDeploymentManifest } from './local-services-core.js';
import { maskUrl } from '../config/runtime.js';
import { readEnvironmentSettings } from './environment-settings.js';
import {
  isGroupAlive,
  isProcessAlive,
  isSameOriginRequest,
  killGroupsAndTrees,
  localServicesDirectory,
  LocalServiceRegistry,
  newServiceId,
  readJsonBody,
  redactSecrets,
  runCommand,
  sendJson,
  sleep,
  tailFile,
  type KillResult,
  type LocalServiceRecord,
  type RunCommandResult,
} from './local-services-core.js';

/**
 * 环境页「⑦ 本地服务：Keeper」启动器（docs/04 §10.1 四点的落地），路由 /api/local-services/keeper。
 *
 * 与 keeper-service.ts（最小版 check/both/status/stop）的区别，正是 §10.1 列的四点：
 *   ① 一律带 `--chain-id <chainId>` 车道参数：日志/pid 落 logs/<chainId>/、keeper 进程的 Redis 前缀按它拼、
 *      stop/status 只碰本车道——多环境并存时别的会话的 keeper 不受影响。
 *   ② Fork 环境默认注入 KEEPER_LEGACY_MARKET_STATE_SCAN_ENABLED=false + KEEPER_POSITION_EVENT_CACHE_ENABLED=true
 *      （成对；只关前者 producer 直接 exit 1）。这两个不在 run.sh 的调用方覆盖白名单里，.env 有同名值时会被压回，
 *      看板又不能读 .env，所以启动后回读 producer 新增日志找 `requires KEEPER_POSITION_EVENT_CACHE_ENABLED`。
 *   ③ 切环境前清事件游标：`<KEYSPACE_VERSION>:<chainId>:keeper:events:lastBlock*`（position 消费者的游标是裸数字，
 *      残留自上一个 Fork 时 producer 会死等一个永远到不了的块）。先备份到 artifacts/local-services/redis-backup/
 *      再 DEL，运行中的车道拒绝清理。
 *   ④ 停止要杀到真正的子进程：logs/<lane>/*.pid 记的是 yarn 包装进程，kill 它不杀 node。这里用 detached 起 run.sh，
 *      让它拉起的 yarn→sh→node 整棵树继承 run.sh 的进程组（pgid = run.sh pid，落进 registry.json），
 *      停止时按进程组 + 进程树一起杀，绝不按进程名全局 pkill。
 *
 * 纪律：tools/keeper-runner/.env 含私钥——本文件只 stat 它是否存在，不读内容；RPC 只经子进程环境变量交给 run.sh；
 * 回给页面的输出 / 日志尾巴 / 错误信息一律经 redactSecrets 脱敏。
 */

export const KEEPER_LAUNCHER_ROUTE = '/api/local-services/keeper';

export const KEEPER_WORKER_NAMES = ['producer', 'ord-worker', 'adl-worker', 'liq-worker', 'rel-worker'] as const;
export type KeeperWorkerName = (typeof KEEPER_WORKER_NAMES)[number];

export const KEEPER_ACTIONS = ['check', 'start', 'stop', 'status', 'clear-cursors'] as const;
export type KeeperAction = (typeof KEEPER_ACTIONS)[number];

/** run.sh 子命令：ord-worker 在脚本里叫 `worker`，其余同名。 */
const RUNNER_SUBCOMMAND: Record<KeeperWorkerName, string> = {
  producer: 'producer',
  'ord-worker': 'worker',
  'adl-worker': 'adl-worker',
  'liq-worker': 'liq-worker',
  'rel-worker': 'rel-worker',
};

/** 只消费 producer 队列的三个 worker：单独起不会执行任何东西，start 时隐含加上 producer。 */
const PRODUCER_CONSUMERS: readonly KeeperWorkerName[] = ['ord-worker', 'adl-worker', 'liq-worker'];

/**
 * 交给 run.sh 前从看板进程环境里剔掉的车道变量：它们在 run.sh 里的优先级高于/等于 `--chain-id`
 * （KEEPER_LOG_DIR 直接压过 --chain-id 决定 pid 目录；空值还会让脚本 fail-fast），
 * 留着会让看板读 pid 文件的位置和脚本实际写的位置对不上。车道只认 `--chain-id` 一个入口。
 */
const STRIPPED_LANE_ENV_KEYS = ['KEEPER_RUNNER_CHAIN_ID', 'KEEPER_LOG_DIR', 'KEEPER_ALIGN_CHAIN_ID', 'KEEPER_CHAIN_ID'] as const;

/**
 * SDK keyspace 版本字面量的兜底值。真身在 fx100-apps `packages/sdk/src/configs/keyspace.ts` 的
 * `KEYSPACE_VERSION`（合约每次重部署都会 bump），运行时优先从那份源码读，读不到才用这里的值。
 */
const FALLBACK_KEYSPACE_VERSION = 'v0.3.2';
const CURSOR_KEY_SUFFIX = 'keeper:events:lastBlock';

const RUNNER_CHECK_TIMEOUT_MS = 90_000;
const RUNNER_START_TIMEOUT_MS = 120_000;
const RUNNER_STOP_TIMEOUT_MS = 60_000;
const OUTPUT_TAIL_CHARS = 12_000;
const LOG_TAIL_LINES = 30;
/** run.sh 在 `yarn … &` 之后 sleep 1 才 echo pid；这里最多再等这么久让 pid 文件落盘。 */
const PID_FILE_WAIT_MS = 2_500;
/** 启动后观察多久判定"没有立刻退出"，并回读这段时间新增的日志找致命行。 */
const START_SETTLE_MS = 2_500;
const REDIS_PIPELINE_BATCH = 500;
const REDIS_DEL_BATCH = 200;

/** 启动后在新增日志里找的致命行：fork 开关被 .env 翻回、心跳键撞车、连不上依赖、进程直接退出。 */
const FATAL_LOG_PATTERN = /requires KEEPER_POSITION_EVENT_CACHE_ENABLED|heartbeat name collision|fatal|unhandled|ECONNREFUSED|InvalidOracleProvider|exited with code/i;

const ENV_OVERRIDE_WARNING = 'Fork 开关 KEEPER_LEGACY_MARKET_STATE_SCAN_ENABLED=false / KEEPER_POSITION_EVENT_CACHE_ENABLED=true '
  + '已随环境注入，但它们不在 run.sh 的调用方覆盖白名单内：tools/keeper-runner/.env 若定义了同名变量会以 .env 为准'
  + '（看板不读取该文件，无法预判）。启动后按 producer 新增日志复核，出现 `requires KEEPER_POSITION_EVENT_CACHE_ENABLED` 即被压回。';

// ── 对外类型（页面按这些形状渲染）──

export interface KeeperProcessView {
  readonly name: string;
  /** logs/<chainId>/<name>.pid 里的 yarn 包装进程 pid；只有日志没有 pid 文件时为 null。 */
  readonly pid: number | null;
  readonly alive: boolean;
  readonly logPath: string;
  readonly logTail: string[];
}

export interface KeeperRedisCursor {
  readonly key: string;
  readonly type: string;
  readonly value: string;
}

export interface KeeperRedisView {
  readonly reachable: boolean;
  readonly keyspacePrefix: string;
  readonly cursorKeys: KeeperRedisCursor[];
  readonly keyCount: number;
}

/**
 * fx100-apps 地址表只有这四条链（packages/sdk/src/configs/contracts.ts）。其它 chainId 下 producer 在模块加载即
 * `getContract(chainId,'NATIVE_TOKEN')` → `Unknown chainId` 崩溃（producer.ts:124 → marketConfig.ts:58），rel-worker 同；
 * 地址环境变量覆盖对"未知链"无济于事（producer 先查表）。事实核查：artifacts/local-services-research.md。
 */
const KEEPER_SUPPORTED_CHAIN_IDS: ReadonlySet<number> = new Set([8453, 84532, 99917, 99918]);

/**
 * 部署清单 → keeper 进程读的地址覆盖变量（apps/keeper/src/chain/env.ts:331-393）。对"支持链上的另一套部署"
 * （典型：建成 84532 的 Fork 上全新部署 v0.3.2）必须注入，否则 keeper 按 SDK 静态表连到旧部署。
 * RelayRouter / SubaccountRelayRouter / Router / NATIVE_TOKEN 不可覆盖（直接查表），留在警告里说明。
 */
const MANIFEST_ADDRESS_OVERRIDES: ReadonlyArray<readonly [envKey: string, pick: (manifest: { contracts: Record<string, string>; additionalContracts: Record<string, string> }) => string | undefined]> = [
  ['DATASTORE_ADDRESS', (manifest) => manifest.contracts.dataStore],
  ['KEEPER_EVENT_EMITTER_ADDRESS', (manifest) => manifest.contracts.eventEmitter],
  ['ORDER_HANDLER_ADDRESS', (manifest) => manifest.contracts.orderHandler],
  ['ADL_HANDLER_ADDRESS', (manifest) => manifest.contracts.adlHandler],
  ['LIQUIDATION_HANDLER_ADDRESS', (manifest) => manifest.contracts.liquidationHandler],
  ['ROLE_STORE_ADDRESS', (manifest) => manifest.contracts.roleStore],
  ['ORACLE_ADDRESS', (manifest) => manifest.contracts.oracle],
  ['READER_ADDRESS', (manifest) => manifest.contracts.reader],
  ['REFERRAL_STORAGE_ADDRESS', (manifest) => manifest.additionalContracts.referralStorage],
];

function chainUnsupportedMessage(chainId: number): string {
  return `keeper 代码（fx100-apps）只认 Chain ID 8453 / 84532 / 99917 / 99918：本环境 ${chainId} 下 producer 与 rel-worker 会在模块加载时报 Unknown chainId 直接退出，地址覆盖救不了。要在 Fork 上跑 keeper：把 Fork 建成 84532、把它的 RPC 配到 base-sepolia 环境槽（部署登记会随之提供地址覆盖）；或让 fx100-apps 为 ${chainId} 增加地址表。`;
}

export interface KeeperLaneStatus {
  readonly environment: EnvironmentName;
  readonly chainId: number;
  readonly rpcMasked: string;
  readonly dataStore: string | null;
  /** 该 chainId 是否在 keeper 地址表里；false 时 start 会被拒绝（原因见 warnings）。 */
  readonly chainSupported: boolean;
  /** 从部署清单注入给 keeper 进程的地址覆盖变量（已解析到的部分）。 */
  readonly addressOverrides: Record<string, string>;
  readonly lane: { readonly chainId: number; readonly logDir: string };
  readonly processes: KeeperProcessView[];
  readonly entrypoints: string[];
  readonly registry: LocalServiceRecord[];
  readonly redis: KeeperRedisView;
  readonly warnings: string[];
}

export interface KeeperStartedProcess {
  readonly name: KeeperWorkerName;
  readonly pid: number;
  readonly pgid: number;
  readonly logPath: string;
}

export interface KeeperActionResult {
  readonly action: KeeperAction;
  readonly environment: EnvironmentName;
  readonly chainId: number;
  /** 已脱敏、可读的"实际执行了什么"摘要。 */
  readonly command: string;
  readonly ok: boolean;
  /** 已脱敏的 stdout+stderr（末尾 12k 字符）。 */
  readonly output: string;
  readonly started: KeeperStartedProcess[];
  readonly stopped: KillResult | null;
  readonly backups: string[];
  readonly cleared: string[];
  readonly warnings: string[];
}

type MutableActionResult = { -readonly [K in keyof KeeperActionResult]: KeeperActionResult[K] };

const optionsSchema = z.object({
  /** 默认 environment !== 'base-sepolia'：Fork 上必须关全量扫描（§10.1 ②）。 */
  forkMode: z.boolean().optional(),
  clearCursors: z.boolean().optional(),
  clearQueues: z.boolean().optional(),
  /** 只走校验与方案，不起进程、不发信号、不 DEL（clear-cursors 仍会写备份文件）。 */
  dryRun: z.boolean().optional(),
});

const postBodySchema = z.object({
  action: z.enum(KEEPER_ACTIONS),
  environment: z.enum(environmentNames),
  workers: z.array(z.enum(KEEPER_WORKER_NAMES)).optional(),
  options: optionsSchema.optional(),
});

export type KeeperLauncherRequest = z.infer<typeof postBodySchema>;

/** 400 / 409 这类"请求本身的问题"，带状态码抛出；其余异常一律 500。 */
class KeeperLauncherError extends Error {
  readonly status: 400 | 409;
  readonly detail: string | undefined;

  constructor(status: 400 | 409, message: string, detail?: string) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

/** 一条车道解析出的全部运行参数；每个请求现算，不缓存（.env.local / 绑定表都可能被别的入口改写）。 */
interface KeeperLane {
  readonly environment: EnvironmentName;
  readonly chainId: number;
  readonly rpcMasked: string;
  /** 需要从输出里抹掉的原文：主 RPC / Admin RPC / WSS。 */
  readonly secrets: readonly string[];
  readonly dataStore: string | null;
  readonly chainSupported: boolean;
  readonly addressOverrides: Record<string, string>;
  readonly forkMode: boolean;
  readonly logDir: string;
  readonly keyspacePrefix: string;
  readonly env: NodeJS.ProcessEnv;
  /** 已脱敏的命令前缀：`KEEPER_RUN_RPC_URL=… … bash tools/keeper-runner/run.sh --chain-id <id>`。 */
  readonly commandPrefix: string;
  readonly warnings: string[];
}

interface RedisEntry {
  readonly key: string;
  readonly type: string;
  /** redis-cli --json 的单行回复：string 类型是 JSON 字符串，hash/list/set/zset/stream 是 JSON 对象/数组。 */
  readonly json: string;
}

export class KeeperLauncher {
  private readonly projectRoot: string;
  private readonly runnerDirectory: string;
  private readonly runnerPath: string;
  private readonly registry: LocalServiceRegistry;
  /** 解析过的车道秘密：500 兜底脱敏时用（那时手上已没有 lane）。 */
  private readonly knownSecrets = new Set<string>();
  /** start / stop / clear-cursors 串行化：两次点击并发时"存活判定 → 动手"之间不能插队。 */
  private mutationQueue: Promise<unknown> = Promise.resolve();

  constructor(projectRoot: string) {
    this.projectRoot = resolve(projectRoot);
    this.runnerDirectory = join(this.projectRoot, 'tools', 'keeper-runner');
    this.runnerPath = join(this.runnerDirectory, 'run.sh');
    this.registry = new LocalServiceRegistry(this.projectRoot);
  }

  /** 只接管 /api/local-services/keeper 下的路径；返回 false 表示不是本模块的路由。 */
  async handle(request: IncomingMessage, response: ServerResponse, url: URL, method: string): Promise<boolean> {
    if (url.pathname !== KEEPER_LAUNCHER_ROUTE && !url.pathname.startsWith(`${KEEPER_LAUNCHER_ROUTE}/`)) return false;
    try {
      if (url.pathname !== KEEPER_LAUNCHER_ROUTE) {
        sendJson(response, 404, { error: `未知路径 ${url.pathname}` });
        return true;
      }
      if (method === 'GET') {
        const parsed = z.enum(environmentNames).safeParse(url.searchParams.get('environment'));
        if (!parsed.success) {
          sendJson(response, 400, { error: '缺少或非法的 environment 参数', detail: `可选：${environmentNames.join(' / ')}` });
          return true;
        }
        sendJson(response, 200, await this.laneStatus(parsed.data));
        return true;
      }
      if (method === 'POST') {
        if (!isSameOriginRequest(request)) {
          sendJson(response, 403, { error: '仅允许同源测试看板管理本地 Keeper。' });
          return true;
        }
        let raw: unknown;
        try {
          raw = await readJsonBody(request);
        } catch (error) {
          sendJson(response, 400, { error: '请求体不是合法 JSON', detail: errorMessage(error) });
          return true;
        }
        const parsed = postBodySchema.safeParse(raw);
        if (!parsed.success) {
          sendJson(response, 400, { error: '请求参数不合法', detail: formatIssues(parsed.error) });
          return true;
        }
        sendJson(response, 200, { result: await this.execute(parsed.data) });
        return true;
      }
      sendJson(response, 405, { error: 'Method Not Allowed' });
    } catch (error) {
      if (error instanceof KeeperLauncherError) {
        sendJson(response, error.status, { error: error.message, ...(error.detail ? { detail: error.detail } : {}) });
      } else {
        sendJson(response, 500, { error: 'Keeper 操作失败', detail: this.redactText(errorMessage(error)) });
      }
    }
    return true;
  }

  /** POST 分发；check / status 是一次性只读命令可并发，其余三个改状态的动作串行。 */
  async execute(input: KeeperLauncherRequest): Promise<KeeperActionResult> {
    switch (input.action) {
      case 'check':
      case 'status':
        return this.runReadOnlyAction(input.action, input);
      case 'start':
        return this.serialize(() => this.start(input));
      case 'stop':
        return this.serialize(() => this.stop(input));
      case 'clear-cursors':
        return this.serialize(() => this.clearCursors(input));
      default:
        throw new KeeperLauncherError(400, `未知 action：${String((input as { action: unknown }).action)}`);
    }
  }

  // ── GET：车道全景 ──

  async laneStatus(environment: EnvironmentName): Promise<KeeperLaneStatus> {
    const lane = await this.resolveLane(environment);
    const warnings = [...lane.warnings];
    for (const dead of await this.registry.pruneDead()) {
      if (dead.kind === 'keeper' && dead.environment === environment) {
        warnings.push(`登记的 ${dead.label}（pid ${dead.pid}）已不在运行，登记已清理；日志：${dead.logPath}`);
      }
    }
    const records = await this.laneRecords(environment);
    const processes = await this.readLaneProcesses(lane, records);
    for (const view of processes) {
      if (view.alive && !records.some((record) => record.meta.worker === view.name)) {
        warnings.push(`${view.name} 在车道 ${lane.chainId} 上存活但不在看板登记里（可能由命令行 run.sh 启动）；「停止」仍会按 pid 文件停掉它。`);
      }
    }
    const entrypoints = await this.listEntrypoints(lane);
    const redis = await this.readRedisView(lane, warnings);
    return {
      environment,
      chainId: lane.chainId,
      rpcMasked: lane.rpcMasked,
      dataStore: lane.dataStore,
      chainSupported: lane.chainSupported,
      addressOverrides: lane.addressOverrides,
      lane: { chainId: lane.chainId, logDir: lane.logDir },
      processes,
      entrypoints,
      registry: records,
      redis,
      warnings,
    };
  }

  // ── check / status：run.sh 一次性命令 ──

  private async runReadOnlyAction(action: 'check' | 'status', input: KeeperLauncherRequest): Promise<KeeperActionResult> {
    const lane = await this.resolveLane(input.environment, input.options?.forkMode);
    const result = this.emptyResult(action, lane);
    result.command = `${lane.commandPrefix} ${action}`;
    if (lane.forkMode && action === 'check') result.warnings.push(ENV_OVERRIDE_WARNING);
    const run = await this.runRunner(lane, action, RUNNER_CHECK_TIMEOUT_MS, false);
    result.ok = run.code === 0 && !run.timedOut;
    result.output = this.formatOutput(lane, `$ ${result.command}\n${run.stdout}${run.stderr}`);
    if (run.timedOut) result.warnings.push(`run.sh ${action} 超过 ${RUNNER_CHECK_TIMEOUT_MS / 1000}s 未结束，已强制终止（多半是 RPC 无响应）。`);
    return result;
  }

  // ── start ──

  private async start(input: KeeperLauncherRequest): Promise<KeeperActionResult> {
    const options = input.options ?? {};
    const dryRun = options.dryRun === true;
    const lane = await this.resolveLane(input.environment, options.forkMode);
    if (!environments[input.environment].permitsTransactions) {
      throw new KeeperLauncherError(400, `${input.environment} 是只读环境，不允许起会签名广播的 Keeper。`);
    }
    // 硬门槛：不在地址表里的链，producer 起来就崩，与其让用户看"神秘退出"不如拒绝并说明。
    if (!lane.chainSupported) {
      throw new KeeperLauncherError(400, `Chain ID ${lane.chainId} 不在 keeper 支持列表，拒绝启动`, chainUnsupportedMessage(lane.chainId));
    }
    const requested = input.workers ?? [];
    if (!requested.length) {
      throw new KeeperLauncherError(400, 'start 至少要选一个 worker。', `可选：${KEEPER_WORKER_NAMES.join(' / ')}`);
    }
    const result = this.emptyResult('start', lane);
    const selected = new Set<KeeperWorkerName>(requested);
    if (!selected.has('producer') && PRODUCER_CONSUMERS.some((worker) => selected.has(worker))) {
      selected.add('producer');
      result.warnings.push('已自动加上 producer：ord/adl/liq worker 只消费 producer 填的队列，单独起不会执行任何订单。');
    }
    const ordered = KEEPER_WORKER_NAMES.filter((worker) => selected.has(worker));

    await this.registry.pruneDead();
    const records = await this.laneRecords(input.environment);
    const processes = await this.readLaneProcesses(lane, records);
    const aliveNames = processes.filter((view) => view.alive).map((view) => view.name);
    const conflicts = ordered.filter((worker) => aliveNames.includes(worker));
    if (conflicts.length) {
      throw new KeeperLauncherError(
        409,
        `车道 ${lane.chainId} 上已有存活的 ${conflicts.join('、')}，拒绝重复启动。`,
        '先「停止」再启动：两个 producer 并存会互相抢心跳键（heartbeat name collision）。',
      );
    }

    const commands: string[] = [];
    if (options.clearCursors || options.clearQueues) {
      if (aliveNames.length) {
        throw new KeeperLauncherError(
          409,
          `车道 ${lane.chainId} 上仍有存活的 ${aliveNames.join('、')}，不能在运行中清理 Redis 游标。`,
          '先停止本车道全部 keeper 再清理。',
        );
      }
      const cleared = await this.clearRedisKeys(lane, this.clearPattern(lane, options.clearQueues === true), dryRun);
      commands.push(cleared.command);
      result.backups.push(...cleared.backups);
      result.cleared.push(...cleared.cleared);
      result.warnings.push(...cleared.warnings);
    }
    if (lane.forkMode) result.warnings.push(ENV_OVERRIDE_WARNING);

    const outputs: string[] = [];
    const startedRecords: LocalServiceRecord[] = [];
    const logOffsets = new Map<KeeperWorkerName, number>();
    let ok = true;
    for (const worker of ordered) {
      const subcommand = RUNNER_SUBCOMMAND[worker];
      const label = `${lane.commandPrefix} ${subcommand}`;
      const logPath = join(lane.logDir, `${worker}.log`);
      const pidPath = join(lane.logDir, `${worker}.pid`);
      commands.push(label);
      if (dryRun) continue;
      // run.sh 自己先跑 check 再起进程，第一条 worker 的输出里就有体检结果，不另跑一遍 check。
      logOffsets.set(worker, await fileSize(logPath));
      const startedAt = Date.now();
      const run = await this.runRunner(lane, subcommand, RUNNER_START_TIMEOUT_MS, true);
      outputs.push(`$ ${label}\n${run.stdout}${run.stderr}`);
      if (run.code !== 0 || run.timedOut) {
        ok = false;
        result.warnings.push(`${worker}：run.sh 退出码 ${run.code}${run.timedOut ? '（超时被杀）' : ''}，后续 worker 未启动；体检结果见 output。`);
        break;
      }
      const yarnPid = await waitForFreshPid(pidPath, startedAt);
      if (yarnPid === null) {
        result.warnings.push(`${worker}：run.sh 正常退出但没有写新的 ${pidPath}——多半是该 worker 的私钥未配、被 run.sh 跳过（见 output），未登记。`);
        continue;
      }
      // pid = pid 文件里的 yarn 包装进程；pgid = detached 启动的 run.sh pid，整棵 yarn→sh→node 树都在这个组里（§10.1 ④）。
      const record: LocalServiceRecord = {
        id: newServiceId('keeper', `${input.environment}-${worker}`),
        kind: 'keeper',
        label: `${input.environment} ${worker}`,
        pid: yarnPid,
        pgid: run.pid,
        command: label,
        cwd: this.runnerDirectory,
        logPath,
        startedAt: new Date(startedAt).toISOString(),
        environment: input.environment,
        chainId: lane.chainId,
        port: null,
        meta: { worker, lane: lane.chainId },
      };
      await this.registry.upsert(record);
      startedRecords.push(record);
      result.started.push({ name: worker, pid: yarnPid, pgid: run.pid, logPath });
    }

    if (dryRun) {
      result.warnings.push('dryRun：未执行任何命令，仅展示将要执行的命令与登记方案。');
    } else if (startedRecords.length) {
      // 让进程跑一小段再判定：fork 开关被 .env 压回时 producer 会在启动几百毫秒后 exit 1，pid 文件却已经写好。
      await sleep(START_SETTLE_MS);
      for (const record of startedRecords) {
        const worker = record.meta.worker as KeeperWorkerName;
        const alive = isProcessAlive(record.pid) || isGroupAlive(record.pgid);
        const appended = await readAppendedLines(record.logPath, logOffsets.get(worker) ?? 0);
        const fatal = appended.filter((line) => FATAL_LOG_PATTERN.test(line)).slice(-5);
        if (fatal.length) {
          result.warnings.push(`${worker} 日志出现致命行：${fatal.map((line) => this.redactText(line, lane.secrets)).join(' | ')}`);
          if (fatal.some((line) => line.includes('requires KEEPER_POSITION_EVENT_CACHE_ENABLED'))) {
            result.warnings.push('判定：fork 开关被 tools/keeper-runner/.env 里的同名变量压回了——请在 .env 里把 KEEPER_POSITION_EVENT_CACHE_ENABLED 设为 true（或删掉两项让看板注入生效）。');
          }
        }
        if (!alive) {
          ok = false;
          const tail = (await tailFile(record.logPath, 8)).map((line) => this.redactText(line, lane.secrets));
          result.warnings.push(`${worker} 启动后 ${START_SETTLE_MS}ms 内已退出（登记已撤销）。日志尾部：${tail.join(' | ') || '（空）'}`);
          await this.registry.remove(record.id);
          result.started = result.started.filter((item) => item.name !== worker);
        }
      }
    }

    result.ok = ok;
    result.command = commands.join('\n');
    result.output = this.formatOutput(lane, outputs.join('\n\n'));
    return result;
  }

  // ── stop ──

  private async stop(input: KeeperLauncherRequest): Promise<KeeperActionResult> {
    const dryRun = input.options?.dryRun === true;
    const lane = await this.resolveLane(input.environment);
    const result = this.emptyResult('stop', lane);
    await this.registry.pruneDead();
    const records = await this.laneRecords(input.environment);
    const pidFiles = await this.readPidFiles(lane);
    const pgids = [...new Set(records.map((record) => record.pgid))];
    const pids = [...new Set([...records.map((record) => record.pid), ...pidFiles.map((item) => item.pid)])];
    result.command = `SIGTERM→SIGKILL 进程组 [${pgids.join(', ') || '无'}] + 进程树 [${pids.join(', ') || '无'}] → ${lane.commandPrefix} stop`;
    if (!pgids.length && !pids.length) {
      result.warnings.push(`车道 ${lane.chainId} 没有登记或 pid 文件记录的进程；run.sh stop 只会清理残留 pid 文件。`);
    }
    if (dryRun) {
      result.ok = true;
      result.warnings.push('dryRun：未发送信号、未执行 run.sh stop。');
      return result;
    }
    // 先按进程组/进程树杀干净（§10.1 ④），再让 run.sh stop 清 pid 文件——顺序反过来 pid 文件先没了，我们就找不到 yarn 的 pid。
    const killed = await killGroupsAndTrees({ pgids, pids });
    const run = await this.runRunner(lane, 'stop', RUNNER_STOP_TIMEOUT_MS, false);
    for (const record of records) await this.registry.remove(record.id);
    if (killed.remaining.length) {
      result.warnings.push(`仍有进程未退出：${killed.remaining.join(', ')}——请按 pid 手动处理；看板不做全局 pkill（别的会话可能在同一台机器跑另一条车道）。`);
    }
    result.stopped = killed;
    result.ok = run.code === 0 && !run.timedOut && killed.remaining.length === 0;
    result.output = this.formatOutput(lane, `$ ${lane.commandPrefix} stop\n${run.stdout}${run.stderr}`);
    return result;
  }

  // ── clear-cursors ──

  private async clearCursors(input: KeeperLauncherRequest): Promise<KeeperActionResult> {
    const dryRun = input.options?.dryRun === true;
    const lane = await this.resolveLane(input.environment);
    const result = this.emptyResult('clear-cursors', lane);
    await this.registry.pruneDead();
    const records = await this.laneRecords(input.environment);
    const alive = (await this.readLaneProcesses(lane, records)).filter((view) => view.alive).map((view) => view.name);
    if (alive.length) {
      throw new KeeperLauncherError(
        409,
        `车道 ${lane.chainId} 上仍有存活的 ${alive.join('、')}，运行中不能清游标。`,
        'producer 会把内存里的游标写回 Redis，运行中清了也白清；先停止再清理。',
      );
    }
    const cleared = await this.clearRedisKeys(lane, this.clearPattern(lane, input.options?.clearQueues === true), dryRun);
    result.command = cleared.command;
    result.ok = true;
    result.backups.push(...cleared.backups);
    result.cleared.push(...cleared.cleared);
    result.warnings.push(...cleared.warnings);
    return result;
  }

  private clearPattern(lane: KeeperLane, queues: boolean): string {
    return queues ? `${lane.keyspacePrefix}keeper:*` : `${lane.keyspacePrefix}${CURSOR_KEY_SUFFIX}*`;
  }

  /** 备份 → DEL；dryRun 只备份。返回的 cleared 是键名（值只在备份文件里）。 */
  private async clearRedisKeys(
    lane: KeeperLane,
    pattern: string,
    dryRun: boolean,
  ): Promise<{ backups: string[]; cleared: string[]; command: string; warnings: string[] }> {
    if (!(await redisPing())) {
      throw new KeeperLauncherError(400, `Redis 不可达（${redisAddress()}），无法清理游标。`, 'brew services start redis 后重试。');
    }
    const scanCommand = `redis-cli --scan --pattern '${pattern}'`;
    const keys = await redisScan(pattern);
    if (!keys.length) return { backups: [], cleared: [], command: `${scanCommand} → 0 个键，无需清理`, warnings: [] };
    const { entries, warnings } = await readRedisEntries(keys);
    const backupPath = await this.writeRedisBackup(lane, entries);
    if (dryRun) {
      return {
        backups: [backupPath],
        cleared: [],
        command: `${scanCommand} → 备份 ${entries.length} 个键到 ${backupPath}（dryRun，未 DEL）`,
        warnings: [...warnings, 'dryRun：只备份未删除。'],
      };
    }
    let deleted = 0;
    for (const batch of chunk(entries.map((entry) => entry.key), REDIS_DEL_BATCH)) {
      const run = await redisCli(['DEL', ...batch], undefined, 60_000);
      if (run.code !== 0) throw new Error(`redis-cli DEL 失败：${(run.stderr || run.stdout).trim()}（已备份到 ${backupPath}）`);
      deleted += Number.parseInt(run.stdout.trim(), 10) || 0;
    }
    if (deleted !== entries.length) {
      warnings.push(`DEL 实际删除 ${deleted} 个，与备份的 ${entries.length} 个不一致（可能有键在备份后过期或被别的进程删掉）。`);
    }
    return {
      backups: [backupPath],
      cleared: entries.map((entry) => entry.key),
      command: `${scanCommand} → 备份 ${backupPath} → DEL ${deleted} 个键`,
      warnings,
    };
  }

  /** artifacts/local-services/redis-backup/<chainId>-<YYYYMMDD-HHMMSS>.json，内容 [{key, type, value}]；同秒重名加序号。 */
  private async writeRedisBackup(lane: KeeperLane, entries: readonly RedisEntry[]): Promise<string> {
    const directory = join(localServicesDirectory(this.projectRoot), 'redis-backup');
    await mkdir(directory, { recursive: true });
    const payload = `${JSON.stringify(
      entries.map((entry) => ({ key: entry.key, type: entry.type, value: entryValue(entry) })),
      null,
      2,
    )}\n`;
    const stamp = `${lane.chainId}-${compactStamp()}`;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const path = join(directory, `${stamp}${attempt ? `-${attempt}` : ''}.json`);
      try {
        await writeFile(path, payload, { encoding: 'utf8', flag: 'wx' });
        return path;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }
    throw new Error(`备份文件重名超过 20 次：${stamp}`);
  }

  // ── 车道解析 ──

  private async resolveLane(environment: EnvironmentName, forkModeOption?: boolean): Promise<KeeperLane> {
    const warnings: string[] = [];
    const settings = await readEnvironmentSettings(this.projectRoot, environment);
    if (!settings.rpcUrl) throw new KeeperLauncherError(400, `${environment} 尚未配置主 RPC，先在「测试环境」保存并初始化 Fork。`);
    if (!settings.chainId) throw new KeeperLauncherError(400, `${environment} 尚未配置固定 Chain ID，先在「测试环境」填写。`);
    const chainId = settings.chainId;
    const secrets = [settings.rpcUrl, settings.adminRpcUrl, settings.wssUrl].filter((value): value is string => Boolean(value));
    for (const secret of secrets) this.knownSecrets.add(secret);

    const definition = environments[environment];
    if (definition.fixedChainId !== undefined && definition.fixedChainId !== chainId) {
      warnings.push(`${environment} 配置的 Chain ID ${chainId} 与目录约定的固定值 ${definition.fixedChainId} 不同；车道按配置值 ${chainId} 走。`);
    }

    const chainSupported = KEEPER_SUPPORTED_CHAIN_IDS.has(chainId);
    if (!chainSupported) warnings.push(chainUnsupportedMessage(chainId));

    // DataStore 给 run.sh 查角色用（它读 KEEPER_DATA_STORE）；keeper 进程自己读的是 DATASTORE_ADDRESS 等另一组名字，
    // 两组都从部署清单注入，让 keeper 跟着登记的部署走，而不是 SDK 静态表里那套旧地址。
    // 解析不到就让脚本用内置默认地址，但必须说出来——那多半是别的部署的地址。
    let dataStore: string | null = null;
    const addressOverrides: Record<string, string> = {};
    try {
      const manifest = await readBoundDeploymentManifest(this.projectRoot, environment);
      dataStore = manifest.contracts.dataStore;
      const view = { contracts: manifest.contracts as Record<string, string>, additionalContracts: manifest.additionalContracts as Record<string, string> };
      for (const [envKey, pick] of MANIFEST_ADDRESS_OVERRIDES) {
        const address = pick(view);
        if (address) addressOverrides[envKey] = address;
      }
      warnings.push(`已按部署清单注入 ${Object.keys(addressOverrides).length} 个地址覆盖（${Object.keys(addressOverrides).join(' / ')}）；RelayRouter / SubaccountRelayRouter / Router / NATIVE_TOKEN 不可覆盖，仍取 keeper 代码里 ${chainId} 的静态表。这些不是 run.sh 白名单变量：若 tools/keeper-runner/.env 里定义了同名项，以 .env 为准。`);
    } catch (error) {
      warnings.push(`无法从环境绑定解析部署清单：${this.redactText(errorMessage(error), secrets)}；run.sh 将用脚本内置默认地址查角色、keeper 走 SDK 静态表地址，体检与执行都可能不属于本环境部署。`);
    }

    const forkMode = forkModeOption ?? environment !== 'base-sepolia';
    const keyspace = await this.resolveKeyspaceVersion();
    if (keyspace.warning) warnings.push(keyspace.warning);
    // 与 SDK keyspacePrefix() 同构：空段丢弃，再接 ':'。
    const keyspacePrefix = `${[keyspace.version, String(chainId)].filter(Boolean).join(':')}:`;

    // 只看存在与否；文件含私钥，内容永远不读。
    const envFile = process.env.KEEPER_ENV_FILE?.trim() || join(this.runnerDirectory, '.env');
    if (!(await pathExists(envFile))) {
      warnings.push(`缺 ${envFile}（keeper 私钥配置，看板只检查存在、不读取内容）：run.sh 会直接退出。`);
    }

    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const key of STRIPPED_LANE_ENV_KEYS) delete env[key];
    env.KEEPER_RUN_RPC_URL = settings.rpcUrl;
    env.KEEPER_EXPECTED_CHAIN_ID = String(chainId);
    if (dataStore) env.KEEPER_DATA_STORE = dataStore;
    for (const [envKey, address] of Object.entries(addressOverrides)) env[envKey] = address;
    if (forkMode) {
      env.KEEPER_LEGACY_MARKET_STATE_SCAN_ENABLED = 'false';
      env.KEEPER_POSITION_EVENT_CACHE_ENABLED = 'true';
    }

    let rpcMasked = '***';
    try {
      rpcMasked = maskUrl(settings.rpcUrl);
    } catch {
      // 不是合法 URL：保持通用掩码
    }
    const commandPrefix = [
      `KEEPER_RUN_RPC_URL=${rpcMasked}`,
      `KEEPER_EXPECTED_CHAIN_ID=${chainId}`,
      dataStore ? `KEEPER_DATA_STORE=${dataStore}` : null,
      Object.keys(addressOverrides).length ? `<+${Object.keys(addressOverrides).length} 个部署清单地址覆盖>` : null,
      forkMode ? 'KEEPER_LEGACY_MARKET_STATE_SCAN_ENABLED=false KEEPER_POSITION_EVENT_CACHE_ENABLED=true' : null,
      `bash tools/keeper-runner/run.sh --chain-id ${chainId}`,
    ].filter((part): part is string => part !== null).join(' ');

    return {
      environment,
      chainId,
      rpcMasked,
      secrets,
      dataStore,
      chainSupported,
      addressOverrides,
      forkMode,
      logDir: join(this.runnerDirectory, 'logs', String(chainId)),
      keyspacePrefix,
      env,
      commandPrefix,
      warnings,
    };
  }

  /**
   * 从 keeper 所在的 fx100-apps 源码读 KEYSPACE_VERSION 字面量：run.sh 起的就是这份源码，
   * 前缀跟它走才不会在 SDK bump 版本后扫错前缀。目录探测与 run.sh 一致（KEEPER_DIR 优先）。
   */
  private async resolveKeyspaceVersion(): Promise<{ version: string; warning?: string }> {
    const keeperDirectory = process.env.KEEPER_DIR?.trim()
      || resolve(this.projectRoot, '..', 'Github', 'fx100-apps@develop', 'apps', 'keeper');
    const keyspaceFile = resolve(keeperDirectory, '..', '..', 'packages', 'sdk', 'src', 'configs', 'keyspace.ts');
    try {
      const match = /export\s+const\s+KEYSPACE_VERSION\s*=\s*["']([^"']*)["']/.exec(await readFile(keyspaceFile, 'utf8'));
      const version = match?.[1];
      if (version !== undefined) return { version };
    } catch {
      // 读不到源码：走兜底
    }
    return {
      version: FALLBACK_KEYSPACE_VERSION,
      warning: `未能从 ${keyspaceFile} 读到 KEYSPACE_VERSION，按兜底值 ${FALLBACK_KEYSPACE_VERSION} 拼 Redis 前缀。`,
    };
  }

  // ── 进程视图 ──

  private async laneRecords(environment: EnvironmentName): Promise<LocalServiceRecord[]> {
    return (await this.registry.list('keeper')).filter((record) => record.environment === environment);
  }

  /** logs/<chainId>/ 里 *.pid ∪ *.log 的名字；存活 = pid 文件的 yarn 还在，或登记的进程组还在（yarn 死了 node 还活着的情形）。 */
  private async readLaneProcesses(lane: KeeperLane, records: readonly LocalServiceRecord[]): Promise<KeeperProcessView[]> {
    let entries: string[] = [];
    try {
      entries = await readdir(lane.logDir);
    } catch {
      entries = [];
    }
    const names = new Set<string>();
    for (const entry of entries) {
      if (entry.endsWith('.pid') || entry.endsWith('.log')) names.add(entry.replace(/\.(?:pid|log)$/, ''));
    }
    const rank = (name: string) => {
      const index = (KEEPER_WORKER_NAMES as readonly string[]).indexOf(name);
      return index === -1 ? KEEPER_WORKER_NAMES.length : index;
    };
    const views: KeeperProcessView[] = [];
    for (const name of [...names].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))) {
      const pid = await readPidFile(join(lane.logDir, `${name}.pid`));
      const record = records.find((item) => item.meta.worker === name);
      const alive = (pid !== null && isProcessAlive(pid))
        || (record !== undefined && (isProcessAlive(record.pid) || isGroupAlive(record.pgid)));
      const logPath = join(lane.logDir, `${name}.log`);
      const logTail = (await tailFile(logPath, LOG_TAIL_LINES)).map((line) => this.redactText(line, lane.secrets));
      views.push({ name, pid, alive, logPath, logTail });
    }
    return views;
  }

  private async readPidFiles(lane: KeeperLane): Promise<{ name: string; pid: number }[]> {
    let entries: string[] = [];
    try {
      entries = await readdir(lane.logDir);
    } catch {
      return [];
    }
    const found: { name: string; pid: number }[] = [];
    for (const entry of entries) {
      if (!entry.endsWith('.pid')) continue;
      const pid = await readPidFile(join(lane.logDir, entry));
      if (pid !== null) found.push({ name: entry.slice(0, -'.pid'.length), pid });
    }
    return found;
  }

  /** 机器范围的 keeper entrypoint 进程（与 run.sh status 同一条 pgrep），只做参考：别的车道的也会列出来。 */
  private async listEntrypoints(lane: KeeperLane): Promise<string[]> {
    const run = await runCommand('pgrep', ['-fl', 'src/entrypoints/'], { timeoutMs: 5000 });
    return run.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => this.redactText(line, lane.secrets));
  }

  private async readRedisView(lane: KeeperLane, warnings: string[]): Promise<KeeperRedisView> {
    const reachable = await redisPing();
    if (!reachable) {
      warnings.push(`Redis 不可达（${redisAddress()}）——run.sh check 也会失败；brew services start redis`);
      return { reachable: false, keyspacePrefix: lane.keyspacePrefix, cursorKeys: [], keyCount: 0 };
    }
    try {
      const allKeys = await redisScan(`${lane.keyspacePrefix}keeper:*`);
      const cursorPrefix = `${lane.keyspacePrefix}${CURSOR_KEY_SUFFIX}`;
      const cursorNames = allKeys.filter((key) => key.startsWith(cursorPrefix)).sort();
      const { entries, warnings: readWarnings } = await readRedisEntries(cursorNames);
      warnings.push(...readWarnings);
      return {
        reachable: true,
        keyspacePrefix: lane.keyspacePrefix,
        cursorKeys: entries.map((entry) => ({ key: entry.key, type: entry.type, value: entryValue(entry) })),
        keyCount: allKeys.length,
      };
    } catch (error) {
      warnings.push(`读取 Redis 键失败：${this.redactText(errorMessage(error), lane.secrets)}`);
      return { reachable: true, keyspacePrefix: lane.keyspacePrefix, cursorKeys: [], keyCount: 0 };
    }
  }

  // ── run.sh 调用与脱敏 ──

  private async runRunner(lane: KeeperLane, subcommand: string, timeoutMs: number, detached: boolean): Promise<RunCommandResult> {
    await access(this.runnerPath, constants.X_OK);
    return runCommand('bash', [this.runnerPath, '--chain-id', String(lane.chainId), subcommand], {
      cwd: this.runnerDirectory,
      env: lane.env,
      timeoutMs,
      detached,
    });
  }

  private emptyResult(action: KeeperAction, lane: KeeperLane): MutableActionResult {
    return {
      action,
      environment: lane.environment,
      chainId: lane.chainId,
      command: '',
      ok: false,
      output: '',
      started: [],
      stopped: null,
      backups: [],
      cleared: [],
      warnings: [...lane.warnings],
    };
  }

  private formatOutput(lane: KeeperLane, text: string): string {
    return this.redactText(text, lane.secrets).slice(-OUTPUT_TAIL_CHARS);
  }

  private redactText(text: string, secrets: readonly string[] = []): string {
    return redactSecrets(text, [...secrets, ...this.knownSecrets]);
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation);
    // 失败的操作不能让后面的永久卡在 rejected 链上
    this.mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }
}

// ── Redis（redis-cli 走 core runCommand；REDIS_HOST / REDIS_PORT 与 run.sh 同一约定）──

function redisConnectionArgs(): string[] {
  const host = process.env.REDIS_HOST?.trim() || '127.0.0.1';
  const port = process.env.REDIS_PORT?.trim() || '6379';
  return ['-h', host, '-p', port];
}

function redisAddress(): string {
  const [, host, , port] = redisConnectionArgs();
  return `${host}:${port}`;
}

function redisCli(args: readonly string[], input?: string, timeoutMs = 30_000): Promise<RunCommandResult> {
  return runCommand('redis-cli', [...redisConnectionArgs(), ...args], {
    timeoutMs,
    ...(input === undefined ? {} : { input }),
  });
}

async function redisPing(): Promise<boolean> {
  const run = await redisCli(['PING'], undefined, 5000);
  return run.code === 0 && run.stdout.trim() === 'PONG';
}

/** SCAN 是 at-least-once，去重后返回。 */
async function redisScan(pattern: string): Promise<string[]> {
  const run = await redisCli(['--scan', '--pattern', pattern], undefined, 60_000);
  if (run.code !== 0) throw new Error(`redis-cli --scan 失败：${(run.stderr || run.stdout).trim()}`);
  return [...new Set(run.stdout.split('\n').map((line) => line.trim()).filter(Boolean))];
}

/** 走 stdin 管道时键名按 redis-cli 的引号规则包起来（键里有空格/引号也不会拆错）。 */
function quoteRedisArgument(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

/** 一个 redis-cli 进程里批量 TYPE（一行一个键，一行一个回复）。 */
async function redisTypes(keys: readonly string[]): Promise<string[]> {
  if (!keys.length) return [];
  const run = await redisCli([], `${keys.map((key) => `TYPE ${quoteRedisArgument(key)}`).join('\n')}\n`, 60_000);
  if (run.code !== 0) throw new Error(`redis-cli TYPE 失败：${(run.stderr || run.stdout).trim()}`);
  const lines = run.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length !== keys.length) throw new Error(`redis-cli TYPE 回复 ${lines.length} 行，与 ${keys.length} 个键不符`);
  return lines;
}

/** 一个 redis-cli --json 进程里批量取值：每条命令一行 JSON 回复（nil → null），无换行歧义。 */
async function redisJsonReplies(commands: readonly string[]): Promise<string[]> {
  if (!commands.length) return [];
  const run = await redisCli(['--json'], `${commands.join('\n')}\n`, 120_000);
  if (run.code !== 0) throw new Error(`redis-cli 取值失败：${(run.stderr || run.stdout).trim()}`);
  const lines = run.stdout.split('\n');
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  if (lines.length !== commands.length) throw new Error(`redis-cli 回复 ${lines.length} 行，与 ${commands.length} 条命令不符`);
  return lines;
}

function valueCommand(key: string, type: string): string | null {
  const quoted = quoteRedisArgument(key);
  switch (type) {
    case 'string': return `GET ${quoted}`;
    case 'hash': return `HGETALL ${quoted}`;
    case 'list': return `LRANGE ${quoted} 0 -1`;
    case 'set': return `SMEMBERS ${quoted}`;
    case 'zset': return `ZRANGE ${quoted} 0 -1 WITHSCORES`;
    case 'stream': return `XRANGE ${quoted} - +`;
    default: return null;
  }
}

/** 键 → {type, json}；扫描后已消失的键（TYPE=none）跳过，未支持的类型只记键名并给出警告。 */
async function readRedisEntries(keys: readonly string[]): Promise<{ entries: RedisEntry[]; warnings: string[] }> {
  const entries: RedisEntry[] = [];
  const warnings: string[] = [];
  for (const batch of chunk(keys, REDIS_PIPELINE_BATCH)) {
    const types = await redisTypes(batch);
    const pending: { index: number; command: string }[] = [];
    const batchEntries: (RedisEntry | undefined)[] = batch.map(() => undefined);
    batch.forEach((key, index) => {
      const type = types[index] ?? 'none';
      if (type === 'none') return;
      const command = valueCommand(key, type);
      if (!command) {
        warnings.push(`${key}：类型 ${type} 未支持，备份里只记键名。`);
        batchEntries[index] = { key, type, json: 'null' };
        return;
      }
      pending.push({ index, command });
    });
    const replies = await redisJsonReplies(pending.map((item) => item.command));
    pending.forEach((item, position) => {
      const key = batch[item.index];
      const type = types[item.index];
      if (key === undefined || type === undefined) return;
      batchEntries[item.index] = { key, type, json: replies[position] ?? 'null' };
    });
    for (const entry of batchEntries) if (entry) entries.push(entry);
  }
  return { entries, warnings };
}

/** 展示 / 备份用的值：string 类型还原成原文（裸数字游标就显示 46464139），其余保留 JSON 文本。 */
function entryValue(entry: RedisEntry): string {
  if (entry.type === 'string') {
    try {
      const parsed: unknown = JSON.parse(entry.json);
      if (typeof parsed === 'string') return parsed;
    } catch {
      // 不是合法 JSON：原样返回
    }
  }
  return entry.json;
}

// ── 文件小工具（core 没有的：按偏移读新增日志、读 pid 文件、等待新 pid 文件）──

async function readPidFile(path: string): Promise<number | null> {
  try {
    const pid = Number.parseInt((await readFile(path, 'utf8')).trim(), 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/**
 * 等 run.sh 写出**新的** pid 文件：按 mtime 不早于启动时刻判定，避免把上一代残留的 pid 文件当成这次的
 * （run.sh 只在 status 时清陈旧 pid，start 前不清）。
 */
async function waitForFreshPid(path: string, notBefore: number): Promise<number | null> {
  const deadline = Date.now() + PID_FILE_WAIT_MS;
  for (;;) {
    try {
      const info = await stat(path);
      if (info.mtimeMs >= notBefore - 1000) {
        const pid = await readPidFile(path);
        if (pid !== null) return pid;
      }
    } catch {
      // 还没写出来
    }
    if (Date.now() >= deadline) return null;
    await sleep(250);
  }
}

async function fileSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** 只读某次启动之后追加的日志（日志是 `>>` 追加的，整文件尾读会把上一代的错误当成这次的）。 */
async function readAppendedLines(path: string, fromByte: number, maxBytes = 256 * 1024): Promise<string[]> {
  let handle;
  try {
    handle = await open(path, 'r');
  } catch {
    return [];
  }
  try {
    const { size } = await handle.stat();
    if (size <= fromByte) return [];
    const length = Math.min(size - fromByte, maxBytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    return buffer.toString('utf8').split('\n').filter((line) => line.trim().length > 0);
  } finally {
    await handle.close();
  }
}

// ── 杂项 ──

function chunk<T>(items: readonly T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

function compactStamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`)
    .join('；');
}

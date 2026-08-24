import { spawn } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { RuntimeConfig } from '../src/config/runtime.js';

/**
 * pipeline 一键链路：无头串起「创建 fork → 环境准备 → 选例跑批 → 结果回收」。
 *
 *   npm run pipeline -- --env <tx-fork|oracle-fork|time-fork> --cases SCN-009,SCN-022 [flags]
 *   npm run pipeline -- --env tx-fork --all --archive v031-regression
 *
 * 阶段：
 *   A 环境存在性：.env.local 已配置且非 --fresh → 复用；否则 TenderlyForkManager.create（固定 Chain ID）
 *   B 环境准备：mock-resources.json 非 ready 或 --fresh → env:init:mock；随后 env:verify:mock 验收
 *   C（--per-case-traders）：动态加载 src/config/trader-roster，检查 case-traders.json 覆盖并批量注资
 *   D 跑批：case id → tests/**\/scn-<nnn>.spec.ts，npx playwright test --project=<env>（reporter 自动写 artifacts/runs 并合并 latest，禁止传 --reporter 覆盖）
 *   E 回收：dashboard:rebuild-latest + dashboard:verify + latest/results.json 摘要表（含 release 与目标基线比对）；--archive 时归档证据最小集
 *
 * flags：
 *   --cases SCN-009,SCN-022  逗号分隔场景（与 --all 二选一；无关环境的 spec 会自声明 SKIP，属正常）
 *   --all                    tests/**\/scn-*.spec.ts 全部
 *   --fresh                  强制重建：新建 VNet + 重新初始化 Mock 资源
 *   --skip-vnet              跳过阶段 A 的创建动作（未配置 RPC 时中止）
 *   --skip-init              跳过阶段 B（不 init 不 verify）
 *   --force                  env:verify:mock 失败时继续（醒目告警）
 *   --per-case-traders       启用按例专属 Trader（阶段 C + 子进程 E2E_TRADER_ASSIGNMENT=per-case）
 *   --archive <name>         阶段 E 末尾归档证据最小集（仅 PASS 场景入档）
 *   --dry-run                只打印各阶段计划，不创建 fork、不发交易、不跑批
 *
 * 退出码：0 成功；2 参数错误；10/20/30/40/50 = 阶段 A/B/C/D/E 失败。
 * 纪律：全文不打印任何 RPC URL / 私钥；环境状态只打印 configured / chainId。
 */

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FORK_ENVIRONMENTS = ['tx-fork', 'oracle-fork', 'time-fork'] as const;
type ForkEnvironment = (typeof FORK_ENVIRONMENTS)[number];

const USAGE = [
  '用法：npm run pipeline -- --env <tx-fork|oracle-fork|time-fork> (--cases SCN-009,SCN-022 | --all)',
  '      [--fresh] [--skip-vnet] [--skip-init] [--force] [--per-case-traders] [--archive <name>] [--dry-run]',
].join('\n');

class PipelineError extends Error {
  constructor(readonly exitCode: number, message: string) {
    super(message);
  }
}

interface PipelineOptions {
  readonly environment: ForkEnvironment;
  readonly caseIds: readonly string[];
  readonly specFiles: readonly string[];
  readonly all: boolean;
  readonly fresh: boolean;
  readonly skipVnet: boolean;
  readonly skipInit: boolean;
  readonly force: boolean;
  readonly perCaseTraders: boolean;
  readonly archiveName?: string;
  readonly dryRun: boolean;
}

interface CaseTraderAssignment {
  readonly scenarioId: string;
  readonly traderIndex: number;
  readonly address: string;
  readonly label: string;
}

/** 契约：src/config/trader-roster.ts（任务 A 实现；本脚本只通过动态 import 使用）。 */
interface TraderRosterModule {
  perCaseTraderEnabled(): boolean;
  loadCaseTraderMap(projectRoot?: string):
    | { assignments: Record<string, CaseTraderAssignment> }
    | undefined
    | Promise<{ assignments: Record<string, CaseTraderAssignment> } | undefined>;
  applyCaseTrader(runtime: RuntimeConfig, scenarioId: string): Promise<RuntimeConfig>;
  ensureCaseTradersFunded(
    runtime: RuntimeConfig,
    scenarioIds: readonly string[],
  ): Promise<{ funded: number; skipped: number }>;
}

interface LatestResultsFile {
  readonly run?: {
    readonly id?: string;
    readonly release?: string;
    readonly releaseSource?: string;
    readonly targetRelease?: string;
    readonly releaseMismatch?: boolean;
  };
  readonly results?: ReadonlyArray<{
    readonly id?: string;
    readonly project?: string;
    readonly status?: string;
    readonly durationMs?: number;
    readonly executedAt?: string;
  }>;
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function log(message: string): void {
  console.log(`[pipeline] ${message}`);
}

function banner(title: string): void {
  console.log(`\n[pipeline] ======== ${title} ========`);
}

/** 扫描 tests/**\/scn-*.spec.ts：SCN id（大写）→ 相对路径。 */
function discoverSpecFiles(): Map<string, string> {
  const testsDir = join(rootDir, 'tests');
  const map = new Map<string, string>();
  const entries = readdirSync(testsDir, { recursive: true }) as string[];
  for (const entry of entries) {
    const file = String(entry);
    const match = /^scn-([a-z0-9-]+)\.spec\.ts$/i.exec(basename(file));
    const key = match?.[1];
    if (!key) continue;
    map.set(`SCN-${key.toUpperCase()}`, join('tests', file));
  }
  return map;
}

function parseOptions(): PipelineOptions {
  const environment = argumentValue('--env');
  if (!environment || !(FORK_ENVIRONMENTS as readonly string[]).includes(environment)) {
    throw new PipelineError(2, `--env 必填且只支持 ${FORK_ENVIRONMENTS.join(' / ')}。\n${USAGE}`);
  }
  const all = process.argv.includes('--all');
  const casesRaw = argumentValue('--cases');
  if (all && casesRaw) throw new PipelineError(2, `--cases 与 --all 只能二选一。\n${USAGE}`);
  if (!all && !casesRaw) throw new PipelineError(2, `必须提供 --cases 或 --all。\n${USAGE}`);

  const specs = discoverSpecFiles();
  let caseIds: string[];
  if (all) {
    caseIds = [...specs.keys()].sort();
  } else {
    caseIds = (casesRaw ?? '').split(',').map((item) => item.trim()).filter(Boolean).map((item) => {
      const normalized = item.toUpperCase();
      if (!/^SCN-[A-Z0-9-]+$/.test(normalized)) {
        throw new PipelineError(2, `非法场景 ID：${item}（应形如 SCN-009）。`);
      }
      return normalized;
    });
    if (caseIds.length === 0) throw new PipelineError(2, `--cases 未解析出任何场景 ID。\n${USAGE}`);
    const missing = caseIds.filter((id) => !specs.has(id));
    if (missing.length > 0) {
      throw new PipelineError(2, [
        `以下场景没有对应 spec 文件：${missing.join(', ')}`,
        `已有 spec 的场景：${[...specs.keys()].sort().join(', ')}`,
      ].join('\n'));
    }
  }
  const specFiles = caseIds.map((id) => specs.get(id)!);

  const archiveName = argumentValue('--archive');
  if (archiveName !== undefined && !/^[A-Za-z0-9._-]+$/.test(archiveName)) {
    throw new PipelineError(2, `--archive 名称只允许字母、数字、. _ -：${archiveName}`);
  }
  const fresh = process.argv.includes('--fresh');
  const skipVnet = process.argv.includes('--skip-vnet');
  if (fresh && skipVnet) log('⚠ 同时给了 --fresh 与 --skip-vnet：阶段 A 不会新建 VNet，--fresh 只对阶段 B（强制重新初始化）生效。');
  return {
    environment: environment as ForkEnvironment,
    caseIds,
    specFiles,
    all,
    fresh,
    skipVnet,
    skipInit: process.argv.includes('--skip-init'),
    force: process.argv.includes('--force'),
    perCaseTraders: process.argv.includes('--per-case-traders'),
    ...(archiveName !== undefined ? { archiveName } : {}),
    dryRun: process.argv.includes('--dry-run'),
  };
}

function childEnvironment(options: PipelineOptions): NodeJS.ProcessEnv {
  const priorityKeys = ['E2E_ENV', ...(options.perCaseTraders ? ['E2E_TRADER_ASSIGNMENT'] : [])];
  return {
    ...process.env,
    E2E_ENV: options.environment,
    E2E_ENV_PRIORITY_KEYS: priorityKeys.join(','),
    ...(options.perCaseTraders ? { E2E_TRADER_ASSIGNMENT: 'per-case' } : {}),
  };
}

function runCommand(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<number> {
  console.log(`[pipeline] $ ${command} ${args.join(' ')}`);
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, [...args], { cwd: rootDir, stdio: 'inherit', env });
    child.on('error', rejectPromise);
    child.on('close', (code) => resolvePromise(code ?? 1));
  });
}

/** 阶段 A：环境存在性（复用已配置的 Fork，或经 Tenderly Virtual TestNet API 新建固定 Chain ID 的 Fork）。 */
async function stageEnvironmentExistence(options: PipelineOptions): Promise<void> {
  banner(`阶段 A：环境存在性（${options.environment}）`);
  const { readEnvironmentSettings } = await import('../src/server/environment-settings.js');
  const { TenderlyForkManager } = await import('../src/server/tenderly-forks.js');
  const { environments } = await import('../config/environments/catalog.js');

  const manager = new TenderlyForkManager(rootDir);
  const settings = await readEnvironmentSettings(rootDir, options.environment);
  const activeRecord = [...(await manager.list())].reverse()
    .find((item) => item.environment === options.environment && !item.deletedAt);
  const configured = Boolean(settings.rpcUrl) && Boolean(settings.chainId);
  const fixedChainId = environments[options.environment].fixedChainId;
  log(`.env.local 配置状态：rpc=${settings.rpcUrl ? 'configured' : 'missing'} adminRpc=${settings.adminRpcUrl ? 'configured' : 'missing'} chainId=${settings.chainId ?? '未配置'}`);
  log(`config/tenderly-vnets.json 有效登记：${activeRecord ? `environmentId=${activeRecord.environmentId}（chainId=${activeRecord.chainId}）` : '无'}`);
  if (configured && fixedChainId !== undefined && settings.chainId !== fixedChainId) {
    log(`⚠ 已配置 chainId=${settings.chainId} 与 catalog 固定值 ${fixedChainId} 不一致，请先核对环境登记。`);
  }

  if (configured && !options.fresh) {
    log('结论：已配置且非 --fresh → 复用现有环境。');
    return;
  }
  if (options.skipVnet) {
    if (!configured) {
      throw new PipelineError(10, `--skip-vnet 但 ${options.environment} 的 RPC/Chain ID 未配置，后续阶段无法执行；请先创建环境（npm run env:vnet:create -- --env ${options.environment}）。`);
    }
    log('结论：--skip-vnet → 跳过创建（--fresh 只影响阶段 B）。');
    return;
  }
  const reason = options.fresh ? '--fresh 强制重建' : 'RPC/Chain ID 未配置';
  if (options.dryRun) {
    log(`[dry-run] 计划：${reason} → TenderlyForkManager.create({ environment: '${options.environment}' })（固定 chainId=${fixedChainId ?? '按 catalog'}，创建后自动回填 .env.local 并登记 tenderly-vnets.json / CURRENT.json）。`);
    return;
  }
  log(`结论：${reason} → 创建 Tenderly Virtual TestNet…`);
  try {
    const created = await manager.create({ environment: options.environment });
    if ('dryRun' in created) throw new Error('意外进入 dryRun 分支');
    log(`已创建：${created.displayName}`);
    log(`  environmentId=${created.environmentId} chainId=${created.chainId}（eth_chainId 已校验）${created.forkBlockNumber !== undefined ? ` forkBlock=${created.forkBlockNumber}` : ''}`);
    log(`  CURRENT.json 回写：${created.baselineRegistryUpdated ? '已更新' : '未更新'}${created.baselineRegistryNote ? `（${created.baselineRegistryNote}）` : ''}`);
  } catch (error) {
    // 缺 Token 等错误原样透出并停（TenderlyForkManager 的报错已含处置指引）。
    throw new PipelineError(10, `创建 Virtual TestNet 失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

/** 阶段 B：环境准备（Mock Market Bundle 初始化 + env:verify:mock 验收）。 */
async function stageEnvironmentPreparation(options: PipelineOptions): Promise<void> {
  banner(`阶段 B：环境准备（${options.environment}）`);
  if (options.skipInit) {
    log('--skip-init → 跳过初始化与验收（环境状态以既有登记为准）。');
    return;
  }
  const { loadMockResourceRegistry } = await import('../src/config/mock-resources.js');
  let status = 'unknown';
  try {
    status = (await loadMockResourceRegistry()).resources[options.environment].status;
  } catch (error) {
    log(`⚠ 读取 config/mock-resources.json 失败（${error instanceof Error ? error.message : String(error)}），按未初始化处理。`);
  }
  const needsInit = options.fresh || status !== 'ready';
  log(`mock-resources.json：${options.environment}.status=${status} → ${needsInit ? (options.fresh ? '--fresh 强制重新初始化' : '执行初始化') : '已 ready，跳过 init'}`);
  const env = childEnvironment(options);
  if (options.dryRun) {
    if (needsInit) log(`[dry-run] 计划：npm run env:init:mock -- --project ${options.environment}`);
    log(`[dry-run] 计划：npm run env:verify:mock（注入 E2E_ENV=${options.environment} E2E_ENV_PRIORITY_KEYS=E2E_ENV；失败${options.force ? '继续（--force）' : '中止'}）`);
    return;
  }
  if (needsInit) {
    const initCode = await runCommand('npm', ['run', 'env:init:mock', '--', '--project', options.environment], env);
    if (initCode !== 0) throw new PipelineError(20, `env:init:mock 失败（退出码 ${initCode}）。`);
  }
  const verifyCode = await runCommand('npm', ['run', 'env:verify:mock'], env);
  if (verifyCode !== 0) {
    if (!options.force) throw new PipelineError(20, `env:verify:mock 失败（退出码 ${verifyCode}）；确认环境后重跑，或加 --force 继续。`);
    console.error('\n[pipeline] ⚠⚠⚠ env:verify:mock 失败但 --force 已指定：继续跑批，本批结果的环境验收未通过，不得直接充当回归证据！⚠⚠⚠\n');
  } else {
    log('env:verify:mock 通过。');
  }
}

/** 阶段 C（--per-case-traders）：按例 Trader 覆盖检查 + 批量幂等注资。 */
async function stagePerCaseTraders(options: PipelineOptions): Promise<void> {
  if (!options.perCaseTraders) return;
  banner('阶段 C：按例专属 Trader');
  const rosterHint = '请先生成花名册与映射：npm run traders:generate / npm run traders:map（模块：src/config/trader-roster.ts）。';
  // 变量 specifier：模块由任务 A 提供，缺席时 typecheck 不应失败、运行时给出指引。
  const rosterSpecifier = ['..', 'src', 'config', 'trader-roster.js'].join('/');
  let roster: TraderRosterModule;
  try {
    roster = await import(rosterSpecifier) as TraderRosterModule;
  } catch {
    throw new PipelineError(30, `未找到 src/config/trader-roster.ts；${rosterHint}`);
  }
  const map = await roster.loadCaseTraderMap(rootDir);
  if (!map) throw new PipelineError(30, `config/case-traders.json 不存在或不可读；${rosterHint}`);
  const missing = options.caseIds.filter((id) => !map.assignments[id]);
  if (missing.length > 0) {
    throw new PipelineError(30, `case-traders.json 未覆盖本批全部场景，缺：${missing.join(', ')}；${rosterHint}`);
  }
  log(`case-traders.json 覆盖检查通过（${options.caseIds.length} 条场景均有专属 Trader）。`);
  if (options.dryRun) {
    log(`[dry-run] 计划：ensureCaseTradersFunded(runtime, [${options.caseIds.join(', ')}]) 批量幂等注资（dry-run 不触链）。`);
    return;
  }
  const { loadRuntimeConfig } = await import('../src/config/runtime.js');
  const runtime = loadRuntimeConfig();
  const funding = await roster.ensureCaseTradersFunded(runtime, options.caseIds);
  log(`批量注资完成：funded=${funding.funded} skipped=${funding.skipped}。`);
}

/** 阶段 D：选例跑批（reporter 自动写 artifacts/runs 并合并 latest；禁止传 --reporter 覆盖）。 */
async function stageRunBatch(options: PipelineOptions): Promise<number> {
  banner(`阶段 D：跑批（${options.caseIds.length} 条场景 → --project=${options.environment}）`);
  for (const [index, id] of options.caseIds.entries()) {
    log(`  ${id} → ${options.specFiles[index]}`);
  }
  log('提示：与环境无关的 spec 会自声明 SKIP，属正常。');
  const args = ['playwright', 'test', ...options.specFiles, `--project=${options.environment}`];
  if (options.dryRun) {
    log(`[dry-run] 计划：npx ${args.join(' ')}`);
    log(`[dry-run]       注入 E2E_ENV=${options.environment} E2E_ENV_PRIORITY_KEYS=${options.perCaseTraders ? 'E2E_ENV,E2E_TRADER_ASSIGNMENT' : 'E2E_ENV'}${options.perCaseTraders ? ' E2E_TRADER_ASSIGNMENT=per-case' : ''}`);
    return 0;
  }
  const code = await runCommand('npx', args, childEnvironment(options));
  log(`playwright 退出码：${code}`);
  return code;
}

function formatDuration(durationMs: number | undefined): string {
  if (durationMs === undefined) return '-';
  return `${(durationMs / 1000).toFixed(1)}s`;
}

/** 阶段 E：结果回收（看板重建 + 验证 + latest 摘要表 + 可选证据归档）。 */
async function stageCollectResults(options: PipelineOptions): Promise<void> {
  banner('阶段 E：结果回收');
  if (options.dryRun) {
    log('[dry-run] 计划：npm run dashboard:rebuild-latest');
    log('[dry-run] 计划：npm run dashboard:verify -- artifacts/latest/dashboard.html');
    log('[dry-run] 计划：解析 artifacts/latest/results.json 生成本批摘要表（status/durationMs/executedAt + release 与目标基线比对）');
    if (options.archiveName) {
      log(`[dry-run] 计划：python3 evidence-archive/tools/archive-evidence.py ${options.archiveName} ${options.caseIds.join(',')}（仅 PASS 场景入档）`);
    }
    return;
  }
  // 参数页快照在 rebuild 时实时查 tx-fork（fd85e7b 钉 tx-fork）；fork 忙/限流会静默回退设计 CSV
  // 导致 dashboard:verify 参数区断言失败——因此 rebuild+verify 整体允许重试一次（间隔 30s）。
  const rebuildCode = await runCommand('npm', ['run', 'dashboard:rebuild-latest'], process.env);
  if (rebuildCode !== 0) throw new PipelineError(50, `dashboard:rebuild-latest 失败（退出码 ${rebuildCode}）。`);
  let verifyCode = await runCommand('npm', ['run', 'dashboard:verify', '--', 'artifacts/latest/dashboard.html'], process.env);
  if (verifyCode !== 0) {
    log('dashboard:verify 失败，30s 后重建并重试一次（参数页 tx-fork 快照查询可能因 fork 忙/限流瞬时回退）…');
    await new Promise((resolveWait) => setTimeout(resolveWait, 30_000));
    const retryRebuild = await runCommand('npm', ['run', 'dashboard:rebuild-latest'], process.env);
    if (retryRebuild !== 0) throw new PipelineError(50, `dashboard:rebuild-latest 重试失败（退出码 ${retryRebuild}）。`);
    verifyCode = await runCommand('npm', ['run', 'dashboard:verify', '--', 'artifacts/latest/dashboard.html'], process.env);
    if (verifyCode !== 0) throw new PipelineError(50, `dashboard:verify 重试后仍失败（退出码 ${verifyCode}）。`);
  }

  const resultsPath = join(rootDir, 'artifacts', 'latest', 'results.json');
  if (!existsSync(resultsPath)) throw new PipelineError(50, `未找到 ${resultsPath}，无法生成摘要。`);
  const latest = JSON.parse(readFileSync(resultsPath, 'utf8')) as LatestResultsFile;
  const run = latest.run ?? {};
  log(`latest run：id=${run.id ?? '-'} release=${run.release ?? '-'}（${run.releaseSource ?? '-'}） targetRelease=${run.targetRelease ?? '-'}`);
  if (run.releaseMismatch) {
    console.error('[pipeline] ⚠ 环境基线（release）≠ 目标基线（targetRelease）：本批结果不充当目标版本回归材料。');
  }
  console.log('\n[pipeline] 本批摘要（artifacts/latest/results.json，project=' + options.environment + '）：');
  console.log('  场景        | 状态    | 耗时     | executedAt');
  console.log('  ------------|---------|----------|--------------------------');
  for (const id of options.caseIds) {
    const row = (latest.results ?? []).find((item) => item.id === id && item.project === options.environment);
    const status = row?.status ?? '无记录';
    console.log(`  ${id.padEnd(11)} | ${status.padEnd(7)} | ${formatDuration(row?.durationMs).padEnd(8)} | ${row?.executedAt ?? '-'}`);
  }
  console.log('');

  if (options.archiveName) {
    const archiveCode = await runCommand(
      'python3',
      ['evidence-archive/tools/archive-evidence.py', options.archiveName, options.caseIds.join(',')],
      process.env,
    );
    if (archiveCode !== 0) throw new PipelineError(50, `证据归档失败（退出码 ${archiveCode}）。`);
    log(`证据最小集已归档：evidence-archive/${options.archiveName}/（仅 PASS 场景入档）。`);
  }
}

async function main(): Promise<void> {
  process.chdir(rootDir);
  const options = parseOptions();
  // 本进程内后续动态 import 会触发 runtime.ts 的 dotenv 加载；先登记优先键，防止 .env.local 的 E2E_ENV 覆盖批次环境。
  process.env.E2E_ENV = options.environment;
  process.env.E2E_ENV_PRIORITY_KEYS = ['E2E_ENV', ...(options.perCaseTraders ? ['E2E_TRADER_ASSIGNMENT'] : [])].join(',');
  if (options.perCaseTraders) process.env.E2E_TRADER_ASSIGNMENT = 'per-case';

  log(`环境=${options.environment} 场景=${options.all ? `--all（${options.caseIds.length} 条）` : options.caseIds.join(', ')}${options.dryRun ? '（dry-run：只打印计划）' : ''}`);

  await stageEnvironmentExistence(options);
  await stageEnvironmentPreparation(options);
  await stagePerCaseTraders(options);
  const testExitCode = await stageRunBatch(options);
  await stageCollectResults(options);

  if (testExitCode !== 0) {
    throw new PipelineError(40, `跑批存在失败用例（playwright 退出码 ${testExitCode}）；结果已回收进看板，请按摘要表定位。`);
  }
  banner(options.dryRun ? 'dry-run 计划打印完毕（未触链）' : '全部阶段完成');
}

main().catch((error) => {
  const exitCode = error instanceof PipelineError ? error.exitCode : 1;
  console.error(`\n[pipeline] 失败（退出码 ${exitCode}）：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = exitCode;
});

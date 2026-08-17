import { spawn } from 'node:child_process';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import dotenv from 'dotenv';
import { getAddress } from 'viem';
import { z } from 'zod';

import { expandPlan, generateTraderRoster, generateTraderWallets, NOISE_PLAN_PRESETS, noisePlanSchema, rosterToCsv, summarizePlan, walletsToRoster, type NoisePlan, type TraderWalletBundle } from '../domain/noise-plan.js';

// 模拟交易铺底任务管理器：spawn scripts/generate-noise-trades.ts 子进程，
// 记录状态与日志尾（脱敏——脚本本身不打印 RPC/密钥），任务落盘 artifacts/noise-trades/<id>/。
// 交易不做核验（按设计）；一次只允许一个任务运行，避免与用例批次并发污染核对窗口。

const requestSchema = z.object({
  environment: z.enum(['tx-fork', 'oracle-fork', 'time-fork']).default('tx-fork'),
  traders: z.array(z.string().regex(/^0x[0-9a-fA-F]{40}$/)).max(20).optional(),
  ordersPerTrader: z.number().int().min(1).max(10).default(2),
  closeAfter: z.boolean().default(false),
  /** 计划模式：传完整造数据计划（优先于上面的兼容字段） */
  plan: noisePlanSchema.optional(),
});

export interface NoiseTradeJob {
  readonly id: string;
  readonly environment: string;
  readonly traders: readonly string[];
  readonly ordersPerTrader: number;
  readonly closeAfter: boolean;
  readonly createdAt: string;
  /** 计划模式：计划名与摘要（兼容模式为空） */
  readonly planName?: string;
  readonly planSummary?: ReturnType<typeof summarizePlan>;
  status: 'RUNNING' | 'PASS' | 'FAIL' | 'INTERRUPTED';
  logTail: string[];
  message: string;
  endedAt?: string;
  summary?: { executed: number; longs: number; shorts: number; closed: number };
}

const RPC_VARIABLE: Record<string, string> = {
  'tx-fork': 'E2E_TX_FORK_RPC_URL',
  'oracle-fork': 'E2E_ORACLE_FORK_RPC_URL',
  'time-fork': 'E2E_TIME_FORK_RPC_URL',
};
const ADMIN_RPC_VARIABLE: Record<string, string> = {
  'tx-fork': 'E2E_TX_FORK_ADMIN_RPC_URL',
  'oracle-fork': 'E2E_ORACLE_FORK_ADMIN_RPC_URL',
  'time-fork': 'E2E_TIME_FORK_ADMIN_RPC_URL',
};

export class NoiseTradeManager {
  private readonly jobs = new Map<string, NoiseTradeJob>();
  private running: string | undefined;

  constructor(private readonly projectRoot: string) {}

  static async create(projectRoot: string): Promise<NoiseTradeManager> {
    const manager = new NoiseTradeManager(projectRoot);
    await manager.restore();
    return manager;
  }

  private directory(): string {
    return resolve(this.projectRoot, 'artifacts/noise-trades');
  }

  private async restore(): Promise<void> {
    try {
      const { readdir } = await import('node:fs/promises');
      const entries = await readdir(this.directory(), { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        try {
          const job = JSON.parse(await readFile(join(this.directory(), entry.name, 'job.json'), 'utf8')) as NoiseTradeJob;
          // 服务重启时仍处 RUNNING 的任务标记为 INTERRUPTED（子进程已随旧服务终止）
          if (job.status === 'RUNNING') {
            job.status = 'INTERRUPTED';
            job.message = '看板服务重启，任务中断（已成交的交易保留在链上）';
            job.endedAt = new Date().toISOString();
            await this.persist(job);
          }
          this.jobs.set(job.id, job);
        } catch {
          // 损坏的任务目录跳过
        }
      }
    } catch {
      // 目录尚不存在
    }
  }

  private async persist(job: NoiseTradeJob): Promise<void> {
    const directory = join(this.directory(), job.id);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'job.json'), `${JSON.stringify(job, null, 2)}\n`, 'utf8');
  }

  private async localValues(): Promise<Record<string, string>> {
    return {
      ...dotenv.parse(await readFile(join(this.projectRoot, '.env'), 'utf8').catch(() => '')),
      ...dotenv.parse(await readFile(join(this.projectRoot, '.env.local'), 'utf8').catch(() => '')),
    } as Record<string, string>;
  }

  list(): NoiseTradeJob[] {
    return Array.from(this.jobs.values()).sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 20);
  }

  get(id: string): NoiseTradeJob | undefined {
    return this.jobs.get(id);
  }

  async configuredTraders(): Promise<string[]> {
    const values = await this.localValues();
    const raw = values.E2E_NOISE_TRADER_ACCOUNTS?.trim();
    if (!raw) return [];
    return raw.split(',').map((item) => item.trim()).filter(Boolean).map((item) => getAddress(item));
  }

  private planPath(): string {
    return resolve(this.projectRoot, 'config/noise-plan.json');
  }

  /** 已保存的造数据计划（无则给一个预设骨架） */
  async loadPlan(): Promise<{ plan: NoisePlan; saved: boolean }> {
    try {
      const plan = noisePlanSchema.parse(JSON.parse(await readFile(this.planPath(), 'utf8')));
      return { plan, saved: true };
    } catch {
      return { plan: NOISE_PLAN_PRESETS['grid-basic']!, saved: false };
    }
  }

  async savePlan(raw: unknown): Promise<NoisePlan> {
    const plan = noisePlanSchema.parse(raw);
    await mkdir(resolve(this.projectRoot, 'config'), { recursive: true });
    await writeFile(this.planPath(), `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
    return plan;
  }

  /** 展开预览：不落盘、不上链，仅返回逐单清单（bigint 转字符串）与摘要 */
  preview(raw: unknown) {
    const plan = noisePlanSchema.parse(raw);
    const orders = expandPlan(plan).map((order) => ({
      seq: order.seq,
      traderIndex: order.traderIndex,
      trader: order.trader,
      rule: order.ruleLabel,
      side: order.isLong ? 'long' : 'short',
      collateralUsdc: (Number(order.collateralRaw) / 1e6).toFixed(2),
      leverage: order.leverage,
      sizeUsd: (order.sizeUsdRaw / 10n ** 30n).toString(),
    }));
    return { summary: summarizePlan(plan), orders, presets: Object.keys(NOISE_PLAN_PRESETS) };
  }

  private rosterPath(): string {
    return resolve(this.projectRoot, 'config/noise-traders.json');
  }

  /** 生成 N 个 Trader 花名册并落盘 config/noise-traders.json（+ 同名 .csv 便于外部使用） */
  async generateRoster(raw: unknown): Promise<{ roster: ReturnType<typeof generateTraderRoster>; savedAt: string; paths: { json: string; csv: string } }> {
    const input = z.object({
      count: z.number().int().min(1).max(100).default(100),
      overrides: z.array(z.string().regex(/^0x[0-9a-fA-F]{40}$/)).max(100).optional(),
    }).parse(raw ?? {});
    const roster = generateTraderRoster(input.count, input.overrides ?? []);
    const savedAt = new Date().toISOString();
    await mkdir(resolve(this.projectRoot, 'config'), { recursive: true });
    await writeFile(this.rosterPath(), `${JSON.stringify({ schemaVersion: 1, savedAt, count: roster.length, traders: roster }, null, 2)}\n`, 'utf8');
    const csvPath = this.rosterPath().replace(/\.json$/, '.csv');
    await writeFile(csvPath, `${rosterToCsv(roster)}\n`, 'utf8');
    return { roster, savedAt, paths: { json: 'config/noise-traders.json', csv: 'config/noise-traders.csv' } };
  }

  async loadRoster(): Promise<{
    roster: ReturnType<typeof generateTraderRoster>;
    savedAt?: string;
    saved: boolean;
    kind: 'derived' | 'wallet';
    wallets: { exists: boolean; count?: number; mode?: string; generatedAt?: string };
  }> {
    const wallets = await this.walletSecretStatus();
    try {
      const parsed = JSON.parse(await readFile(this.rosterPath(), 'utf8')) as { savedAt?: string; kind?: string; traders?: ReturnType<typeof generateTraderRoster> };
      if (Array.isArray(parsed.traders) && parsed.traders.length > 0) {
        return {
          roster: parsed.traders,
          ...(parsed.savedAt ? { savedAt: parsed.savedAt } : {}),
          saved: true,
          kind: parsed.kind === 'wallet' ? 'wallet' : 'derived',
          wallets,
        };
      }
    } catch {
      // 尚未生成
    }
    return { roster: generateTraderRoster(100), saved: false, kind: 'derived', wallets };
  }

  private walletSecretPath(): string {
    return resolve(this.projectRoot, 'config/noise-traders.secret.json');
  }

  /**
   * 生成 N 个真实 EOA（含私钥）：私钥束写入 config/noise-traders.secret.json（0600、gitignore、仅本机），
   * 公开花名册（无私钥）同步写入 config/noise-traders.json + .csv。API 返回值绝不包含私钥/助记词。
   */
  async generateWallets(raw: unknown): Promise<{
    roster: ReturnType<typeof walletsToRoster>;
    generatedAt: string;
    mode: 'mnemonic' | 'random';
    mnemonicWords?: number;
    secretPath: string;
    paths: { json: string; csv: string };
  }> {
    const input = z.object({
      count: z.number().int().min(1).max(100).default(100),
      mode: z.enum(['mnemonic', 'random']).default('mnemonic'),
      /** 传入已有助记词可重新派生同一批地址（恢复/扩容）；只在请求体里出现，不落日志 */
      mnemonic: z.string().min(1).optional(),
    }).parse(raw ?? {});
    const bundle = generateTraderWallets({ count: input.count, mode: input.mode, ...(input.mnemonic ? { mnemonic: input.mnemonic } : {}) });
    await mkdir(resolve(this.projectRoot, 'config'), { recursive: true });
    const secretPath = this.walletSecretPath();
    // 原子写 + 0600：先写临时文件再 rename，避免半写状态；权限收紧到仅当前用户
    const temporary = `${secretPath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(bundle, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await chmod(temporary, 0o600);
    const { rename } = await import('node:fs/promises');
    await rename(temporary, secretPath);
    const roster = walletsToRoster(bundle);
    await writeFile(this.rosterPath(), `${JSON.stringify({ schemaVersion: 1, savedAt: bundle.generatedAt, count: roster.length, kind: 'wallet', traders: roster }, null, 2)}\n`, 'utf8');
    await writeFile(this.rosterPath().replace(/\.json$/, '.csv'), `${rosterToCsv(roster)}\n`, 'utf8');
    return {
      roster,
      generatedAt: bundle.generatedAt,
      mode: bundle.mode,
      ...(bundle.mnemonic ? { mnemonicWords: bundle.mnemonic.split(' ').length } : {}),
      secretPath: 'config/noise-traders.secret.json',
      paths: { json: 'config/noise-traders.json', csv: 'config/noise-traders.csv' },
    };
  }

  /** 是否存在私钥束（只报有无与数量，不返回内容） */
  async walletSecretStatus(): Promise<{ exists: boolean; count?: number; mode?: string; generatedAt?: string }> {
    try {
      const bundle = JSON.parse(await readFile(this.walletSecretPath(), 'utf8')) as TraderWalletBundle;
      return { exists: true, count: bundle.wallets?.length ?? 0, mode: bundle.mode, generatedAt: bundle.generatedAt };
    } catch {
      return { exists: false };
    }
  }

  presets() {
    return Object.fromEntries(Object.entries(NOISE_PLAN_PRESETS).map(([key, plan]) => [key, { name: plan.name, plan }]));
  }

  async start(raw: unknown): Promise<NoiseTradeJob> {
    const input = requestSchema.parse(raw);
    if (this.running) {
      const active = this.jobs.get(this.running);
      throw new Error(`已有模拟交易任务 ${this.running} 运行中（${active?.message ?? ''}）；请等待完成后再启动。`);
    }
    const values = await this.localValues();
    const rpcUrl = values[RPC_VARIABLE[input.environment]!];
    if (!rpcUrl) throw new Error(`${input.environment} 未配置 RPC；请先在环境页完成 ① Fork 与 RPC。`);
    if (!values.E2E_KEEPER_ACCOUNT) throw new Error('未配置 E2E_KEEPER_ACCOUNT（模拟 ORDER_KEEPER 执行需要该地址）。');
    const plan = input.plan ? { ...input.plan, environment: input.environment } : undefined;
    const traders = plan
      ? []
      : (input.traders?.length ? input.traders.map((item) => getAddress(item)) : await this.configuredTraders());
    // 兼容模式 traders 为空时脚本回落内置 3 个 noise trader

    const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${input.environment}`;
    const job: NoiseTradeJob = {
      id,
      environment: input.environment,
      traders,
      ordersPerTrader: plan ? 0 : input.ordersPerTrader,
      closeAfter: plan ? plan.closeAfter : input.closeAfter,
      createdAt: new Date().toISOString(),
      ...(plan ? { planName: plan.name, planSummary: summarizePlan(plan) } : {}),
      status: 'RUNNING',
      logTail: [],
      message: plan ? `正在按计划「${plan.name}」启动铺底…` : '正在启动模拟交易铺底…',
    };
    this.jobs.set(id, job);
    this.running = id;
    await this.persist(job);
    let planFile: string | undefined;
    if (plan) {
      planFile = join(this.directory(), id, 'plan.json');
      await writeFile(planFile, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
    }

    const args = [
      resolve(this.projectRoot, 'node_modules/.bin/tsx'),
      resolve(this.projectRoot, 'scripts/generate-noise-trades.ts'),
      ...(planFile
        ? ['--plan', planFile]
        : [
          '--orders', String(input.ordersPerTrader),
          ...(traders.length ? ['--traders', traders.join(',')] : []),
          ...(input.closeAfter ? ['--close'] : []),
        ]),
    ];
    const child = spawn(process.execPath, args, {
      cwd: this.projectRoot,
      env: {
        ...process.env,
        E2E_ENV: input.environment,
        // 脚本按 tx-fork 变量名读 RPC；对其他 fork 转发到同名变量
        E2E_TX_FORK_RPC_URL: rpcUrl,
        E2E_TX_FORK_ADMIN_RPC_URL: values[ADMIN_RPC_VARIABLE[input.environment]!] ?? rpcUrl,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const append = (chunk: string): void => {
      for (const line of chunk.split('\n')) {
        const trimmed = line.trimEnd();
        if (!trimmed) continue;
        job.logTail.push(trimmed);
        if (job.logTail.length > 200) job.logTail.shift();
        job.message = trimmed.slice(0, 200);
      }
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.once('exit', (code) => {
      job.endedAt = new Date().toISOString();
      job.status = code === 0 ? 'PASS' : 'FAIL';
      const summaryLine = job.logTail.find((line) => line.startsWith('成交 '));
      if (summaryLine) {
        const executed = Number(/成交 (\d+) 单/.exec(summaryLine)?.[1] ?? 0);
        const longs = Number(/（(\d+) 多/.exec(summaryLine)?.[1] ?? 0);
        const shorts = Number(/(\d+) 空/.exec(summaryLine)?.[1] ?? 0);
        const closed = Number(/其中 (\d+) 单已随即平仓/.exec(summaryLine)?.[1] ?? 0);
        job.summary = { executed, longs, shorts, closed };
      }
      job.message = code === 0
        ? `铺底完成：${summaryLine ?? '见日志'}`
        : `铺底失败（退出码 ${String(code)}）：${job.logTail.at(-1) ?? ''}`;
      this.running = undefined;
      void this.persist(job);
    });
    child.once('error', (error) => {
      job.endedAt = new Date().toISOString();
      job.status = 'FAIL';
      job.message = `子进程启动失败：${error.message}`;
      this.running = undefined;
      void this.persist(job);
    });
    return job;
  }
}

import { getAddress, keccak256, toHex } from 'viem';
import { english, generateMnemonic, generatePrivateKey, mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';

// 造数据计划（noise plan）：多 Trader 注资 + 网格/等比批量下单的唯一真源。
// 页面用"表格 + 生成器 + 高级 JSON"三种方式编辑同一份计划；执行前先 expandPlan 展开成逐单清单。
// 这些交易不做核验（按设计），只为把环境数据铺复杂。

const decimalString = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/, '十进制数字，最多 6 位小数');

export const gridRuleSchema = z.object({
  /** 规则名（页面显示） */
  label: z.string().min(1).max(60).default('规则'),
  /** 起始抵押（USDC，十进制） */
  collateralUsdc: decimalString,
  /** 起始杠杆（1–50） */
  leverage: z.number().min(1).max(50),
  /** 方向：long / short / alternate（逐单交替） */
  side: z.enum(['long', 'short', 'alternate']).default('alternate'),
  /** 步进方式：fixed 每单同值；linear 每单 +collateralStep / +leverageStep；ratio 每单 ×collateralRatio / ×leverageRatio */
  step: z.enum(['fixed', 'linear', 'ratio']).default('fixed'),
  /** 单数（每个 Trader 按本规则下几单） */
  count: z.number().int().min(1).max(50).default(1),
  /** linear：每单抵押增量（USDC）；ratio：每单抵押倍率（如 1.2） */
  collateralStep: decimalString.optional(),
  collateralRatio: z.number().min(0.1).max(10).optional(),
  /** linear：每单杠杆增量；ratio：每单杠杆倍率 */
  leverageStep: z.number().min(0).max(50).optional(),
  leverageRatio: z.number().min(0.1).max(10).optional(),
  /** 应用到哪些 Trader：all / 索引区间（从 1 起）如 "1-20" / 显式列表 [1,5,9] */
  traders: z.union([z.literal('all'), z.string().regex(/^\d+-\d+$/), z.array(z.number().int().min(1))]).default('all'),
});

export const noisePlanSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  name: z.string().min(1).max(80).default('默认造数据计划'),
  environment: z.enum(['tx-fork', 'oracle-fork', 'time-fork']).default('tx-fork'),
  /** Trader 数量（1–100）；地址按 traderAddressAt 派生，或用 traderAddresses 显式覆盖 */
  traderCount: z.number().int().min(1).max(100).default(3),
  traderAddresses: z.array(z.string().regex(/^0x[0-9a-fA-F]{40}$/)).max(100).optional(),
  funding: z.object({
    ethPerTrader: decimalString.default('10'),
    usdcPerTrader: decimalString.default('1000000'),
  }).default({ ethPerTrader: '10', usdcPerTrader: '1000000' }),
  rules: z.array(gridRuleSchema).min(1).max(20),
  /** 全部下单后随即全平（只留成交历史与 Funding 痕迹） */
  closeAfter: z.boolean().default(false),
  /** 单单之间随机 0–N 秒间隔（0=不等待）；仅影响 fork 出块节奏 */
  maxDelaySeconds: z.number().int().min(0).max(60).default(0),
});

export type GridRule = z.infer<typeof gridRuleSchema>;
export type NoisePlan = z.infer<typeof noisePlanSchema>;

/** 第 n 个 Trader（从 1 起）的确定性地址：0x1000…0000 + n 的高位/低位编码，互不冲突、可复现 */
export function traderAddressAt(index: number): `0x${string}` {
  const hi = (0x1000 + index).toString(16).padStart(4, '0');
  const lo = index.toString(16).padStart(4, '0');
  return getAddress(`0x${hi}${'0'.repeat(32)}${lo}`) as `0x${string}`;
}

/** Trader 花名册条目：序号 · 名称（Trader1…）· 地址（确定性派生，或计划显式覆盖） */
export interface TraderRosterEntry {
  readonly index: number;
  readonly name: string;
  readonly address: `0x${string}`;
  /** derived=按序号占位地址（impersonation）；override=用户粘贴；wallet=真实 EOA（私钥在 secret 文件） */
  readonly source: 'derived' | 'override' | 'wallet';
}

/** 真实钱包花名册（含私钥）：仅本机 secret 文件，绝不经 API 返回、绝不进仓 */
export interface TraderWalletSecret {
  readonly index: number;
  readonly name: string;
  readonly address: `0x${string}`;
  readonly privateKey: `0x${string}`;
  /** 助记词派生路径（mnemonic 模式）；random 模式为空 */
  readonly derivationPath?: string;
}

export interface TraderWalletBundle {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly mode: 'mnemonic' | 'random';
  /** mnemonic 模式：24 词助记词——备份它即可完全恢复全部 100 个钱包 */
  readonly mnemonic?: string;
  readonly wallets: readonly TraderWalletSecret[];
}

/**
 * 生成 N 个真实 EOA（含私钥）。默认 mnemonic 模式：一个 24 词助记词按 BIP-44
 * m/44'/60'/0'/0/i 派生 N 个账户（备份助记词即可恢复）；random 模式每个独立随机私钥。
 * 传入已有 mnemonic 可重新派生同一批地址（恢复/扩容）。
 */
export function generateTraderWallets(input: {
  readonly count?: number;
  readonly mode?: 'mnemonic' | 'random';
  readonly mnemonic?: string;
} = {}): TraderWalletBundle {
  const total = Math.max(1, Math.min(100, input.count ?? 100));
  const mode = input.mode ?? 'mnemonic';
  const generatedAt = new Date().toISOString();
  if (mode === 'random') {
    return {
      schemaVersion: 1,
      generatedAt,
      mode,
      wallets: Array.from({ length: total }, (_unused, offset) => {
        const privateKey = generatePrivateKey();
        return { index: offset + 1, name: `Trader${offset + 1}`, address: privateKeyToAccount(privateKey).address, privateKey };
      }),
    };
  }
  const mnemonic = input.mnemonic ?? generateMnemonic(english, 256);
  return {
    schemaVersion: 1,
    generatedAt,
    mode,
    mnemonic,
    wallets: Array.from({ length: total }, (_unused, offset) => {
      const account = mnemonicToAccount(mnemonic, { addressIndex: offset });
      const hdKey = account.getHdKey();
      const privateKey = `0x${Buffer.from(hdKey.privateKey!).toString('hex')}` as `0x${string}`;
      return {
        index: offset + 1,
        name: `Trader${offset + 1}`,
        address: account.address,
        privateKey,
        derivationPath: `m/44'/60'/0'/0/${offset}`,
      };
    }),
  };
}

/** 从钱包束投影出公开花名册（无私钥） */
export function walletsToRoster(bundle: TraderWalletBundle): TraderRosterEntry[] {
  return bundle.wallets.map((wallet) => ({ index: wallet.index, name: wallet.name, address: wallet.address, source: 'wallet' }));
}

/**
 * 生成 N 个 Trader 的花名册（默认 100）。地址确定性派生（不依赖随机、不需私钥——
 * fork 上 impersonation 即可），因此"生成 + 保存"是记录用途，任何时候都能按序号重新算回同一地址。
 */
export function generateTraderRoster(count = 100, overrides: readonly string[] = []): TraderRosterEntry[] {
  const total = Math.max(1, Math.min(100, count));
  return Array.from({ length: total }, (_unused, offset) => {
    const index = offset + 1;
    const override = overrides[offset];
    return {
      index,
      name: `Trader${index}`,
      address: override ? (getAddress(override) as `0x${string}`) : traderAddressAt(index),
      source: override ? 'override' : 'derived',
    };
  });
}

export function rosterToCsv(roster: readonly TraderRosterEntry[]): string {
  return ['index,name,address,source', ...roster.map((item) => `${item.index},${item.name},${item.address},${item.source}`)].join('\n');
}

export function planTraders(plan: NoisePlan): `0x${string}`[] {
  if (plan.traderAddresses && plan.traderAddresses.length > 0) {
    return plan.traderAddresses.slice(0, plan.traderCount).map((item) => getAddress(item) as `0x${string}`);
  }
  return Array.from({ length: plan.traderCount }, (_unused, index) => traderAddressAt(index + 1));
}

function ruleAppliesTo(rule: GridRule, traderIndex: number): boolean {
  if (rule.traders === 'all') return true;
  if (typeof rule.traders === 'string') {
    const [from, to] = rule.traders.split('-').map(Number);
    return traderIndex >= from! && traderIndex <= to!;
  }
  return rule.traders.includes(traderIndex);
}

function decimalToUsdcRaw(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(`${whole}${fraction.padEnd(6, '0').slice(0, 6)}`);
}

/** 浮点安全的比例缩放：raw × ratio，ratio 保留 4 位小数后整数运算 */
function scaleRaw(raw: bigint, ratio: number): bigint {
  const scaled = BigInt(Math.round(ratio * 10_000));
  return raw * scaled / 10_000n;
}

export interface PlannedOrder {
  readonly seq: number;
  readonly traderIndex: number;
  readonly trader: `0x${string}`;
  readonly ruleLabel: string;
  readonly ruleIndex: number;
  readonly orderIndex: number;
  readonly isLong: boolean;
  /** USDC raw (1e6) */
  readonly collateralRaw: bigint;
  /** 杠杆（保留 2 位小数） */
  readonly leverage: number;
  /** USD raw (1e30) = collateral × leverage */
  readonly sizeUsdRaw: bigint;
}

/** 把计划展开为逐单清单（确定性，同一计划展开结果一致） */
export function expandPlan(plan: NoisePlan): PlannedOrder[] {
  const traders = planTraders(plan);
  const orders: PlannedOrder[] = [];
  let seq = 0;
  traders.forEach((trader, traderOffset) => {
    const traderIndex = traderOffset + 1;
    plan.rules.forEach((rule, ruleIndex) => {
      if (!ruleAppliesTo(rule, traderIndex)) return;
      let collateralRaw = decimalToUsdcRaw(rule.collateralUsdc);
      let leverage = rule.leverage;
      for (let orderIndex = 0; orderIndex < rule.count; orderIndex += 1) {
        if (orderIndex > 0) {
          if (rule.step === 'linear') {
            collateralRaw += decimalToUsdcRaw(rule.collateralStep ?? '0');
            leverage += rule.leverageStep ?? 0;
          } else if (rule.step === 'ratio') {
            collateralRaw = scaleRaw(collateralRaw, rule.collateralRatio ?? 1);
            leverage *= rule.leverageRatio ?? 1;
          }
        }
        leverage = Math.min(50, Math.max(1, Math.round(leverage * 100) / 100));
        const isLong = rule.side === 'long' ? true : rule.side === 'short' ? false
          // alternate：按 (trader, order) 交错，确保多空都出现且可复现
          : (BigInt(keccak256(toHex(`${trader}-${ruleIndex}-${orderIndex}`, { size: 64 }))) % 2n) === 0n;
        seq += 1;
        orders.push({
          seq,
          traderIndex,
          trader,
          ruleLabel: rule.label,
          ruleIndex,
          orderIndex,
          isLong,
          collateralRaw,
          leverage,
          sizeUsdRaw: collateralRaw * BigInt(Math.round(leverage * 100)) * 10n ** 30n / 100n / 10n ** 6n,
        });
      }
    });
  });
  return orders;
}

export function summarizePlan(plan: NoisePlan): {
  traders: number; orders: number; longs: number; shorts: number;
  totalCollateralUsdc: string; totalSizeUsd: string; maxSingleSizeUsd: string;
} {
  const orders = expandPlan(plan);
  const totalCollateral = orders.reduce((total, item) => total + item.collateralRaw, 0n);
  const totalSize = orders.reduce((total, item) => total + item.sizeUsdRaw, 0n);
  const maxSize = orders.reduce((max, item) => (item.sizeUsdRaw > max ? item.sizeUsdRaw : max), 0n);
  return {
    traders: planTraders(plan).length,
    orders: orders.length,
    longs: orders.filter((item) => item.isLong).length,
    shorts: orders.filter((item) => !item.isLong).length,
    totalCollateralUsdc: (Number(totalCollateral) / 1e6).toFixed(2),
    totalSizeUsd: (totalSize / 10n ** 30n).toString(),
    maxSingleSizeUsd: (maxSize / 10n ** 30n).toString(),
  };
}

/** 页面"生成器"预设：一键得到常用计划骨架 */
export const NOISE_PLAN_PRESETS: Record<string, NoisePlan> = {
  'grid-basic': noisePlanSchema.parse({
    name: '网格基础：10 Trader × 3 档抵押（1000/1200/1400 USDC）× 10x/20x/30x',
    traderCount: 10,
    rules: [
      { label: '抵押线性递增 +200，杠杆线性 +10', collateralUsdc: '1000', leverage: 10, side: 'alternate', step: 'linear', count: 3, collateralStep: '200', leverageStep: 10 },
    ],
  }),
  'ratio-ladder': noisePlanSchema.parse({
    name: '等比阶梯：20 Trader，size 每单 ×1.5，多空交替',
    traderCount: 20,
    rules: [
      { label: '抵押等比 ×1.5，杠杆固定 10x', collateralUsdc: '500', leverage: 10, side: 'alternate', step: 'ratio', count: 4, collateralRatio: 1.5 },
    ],
  }),
  'skew-long': noisePlanSchema.parse({
    name: '多头拥挤：30 Trader 全多 + 5 Trader 小空（造 skew）',
    traderCount: 35,
    rules: [
      { label: '主力多头 2000×15x', collateralUsdc: '2000', leverage: 15, side: 'long', step: 'fixed', count: 1, traders: '1-30' },
      { label: '对手小空 300×5x', collateralUsdc: '300', leverage: 5, side: 'short', step: 'fixed', count: 1, traders: '31-35' },
    ],
  }),
};

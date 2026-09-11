/**
 * v0.3.2 Trade 矩阵 B1「MarketIncrease」原子用例 runner（XT-MKT-OPEN-001/002、XT-MKT-LEV-003～006）。
 *
 * 分层约定（矩阵 §B「原子与分层执行约定」2026-09-02）：本模块只做合约层——RPC 入口（私钥签名 createOrder +
 * Inline Keeper 执行），前端层与交叉一致记 GAP，由 spec 注解声明。
 *
 * 组成：
 * - runMarketOpenAtom：复用 runMarketFlow（开仓 → 立即市价全平，priceMovePercent=0），再从 runner 证据推导本行核对点
 *   （orderType=0、方向、sizeInUsd、collateralAmount=抵押−费用、无 TP/SL 子单、OI Δ、执行价不利侧与守恒引用）。
 * - readLeverageParams / expectedMaxLeverage：链上参数（MIN_COLLATERAL_FACTOR / POSITION_FEE_FACTOR / MIN_COLLATERAL_USD /
 *   MIN_POSITION_SIZE_USD）+ Reader.getExecutionPrice 开/平点差 → 前端 leverage.ts 公式
 *   maxSafeLeverage = 1 / (minCF + openSpread + closeSpread + feeOpen + feeClose)，产品上限 100，UI 取整 floorUiLeverageCap；
 *   另按方向算含 Oracle min/max 价带的链上模型 chainModel = 1 / (minCF + feeOpen + feeClose + loss)，
 *   loss(long) = 1 − Pmin(1−s_close)/(Pmax(1+s_open))、loss(short) = Pmax(1+s_close)/(Pmin(1−s_open)) − 1
 *   （PositionUtils.getExecutionPriceForIncrease/Decrease + isPositionLiquidatable，v0.3.2）。
 * - findMinCollateralForSize：固定 size 下对抵押二分（每次探测独立 evm_snapshot/evm_revert），找出链上「等号成交」的最小抵押
 *   与「min − 1 raw」的取消原因（OrderCancelled reason / reasonBytes 解码）。区间按链上模型估计值 [×0.9, ×1.5] 收紧，
 *   括号不成立时放宽一次（lower/2、upper×2）再报错；缺省探测预算 32。
 * - 杠杆口径：前端公式作用于「提交的毛抵押」C_gross（C_gross ≥ S·F），因此链上实测取 chainMaxGrossX = S / (minFeasible × collateralPrice.min)
 *   （USD 口径）；raw 口径与费后口径只记观测。
 *
 * 保密纪律：证据与错误消息不得出现 RPC URL / 私钥——所有 RPC/viem 错误经 describeError（maskErrorText）后再抛出。
 */
import {
  BaseError,
  createPublicClient,
  createWalletClient,
  decodeAbiParameters,
  decodeEventLog,
  decodeFunctionResult,
  defineChain,
  encodeAbiParameters,
  encodeFunctionData,
  formatUnits,
  getAddress,
  http,
  keccak256,
  parseAbi,
  parseAbiParameters,
  toHex,
  type Abi,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { defaultMockMarketProfile } from '../config/default-mock-market.js';
import { loadDeploymentAbi, loadDeploymentManifest, type DeploymentManifest } from '../config/deployment.js';
import { assertRuntimeEnvironmentBinding } from '../config/environment-binding.js';
import { resolveMockMarketBundle, type MockResourceRecord } from '../config/mock-resources.js';
import { maskUrl, type RuntimeConfig } from '../config/runtime.js';
import { addTransactionExplorerLinks, findBlockExplorerBaseUrl } from '../config/transaction-links.js';
import { decodeEvmFailure, formatDecodedEvmFailure } from '../drivers/evm-decode.js';
import { cumulativeOpenCostsKey } from '../drivers/ledger.js';
import { freshOracleTimestamp, readMockOracleState, readStablePrice, sendSetMockPrice } from '../drivers/mock-oracle.js';
import type { ResolvedTestEnvironment } from '../domain/test-environment.js';
import {
  assertRuntimeMatchesResolvedEnvironment,
  buildRuntimeEnvironmentIdentity,
  resolveRuntimeTestEnvironment,
} from '../execution/runtime-environment.js';
import { decreaseWaterfall } from '../reconciliation/formulas.js';
import { adaptMarketFlowV1 } from '../reconciliation/adapters/market-flow-v1.js';
import { reconcileMarketOpenRoundtrip } from '../reconciliation/market-open-reconciliation.js';
import type { EvidenceEnvelope } from '../evidence/evidence-v2.js';
import type { ReconciliationReport } from '../reconciliation/schema/check-record.js';
import {
  KEYS,
  globalKey,
  marketBoolKey,
  marketKey,
  maskErrorText,
  tokenKey,
  type CaseCheck,
  type CaseEvidence,
} from './ct-base-runner.js';
import {
  MARKET_FLOW_DEFAULTS,
  inlineOracleProviders,
  runMarketFlow,
  type Scn009Evidence,
} from './scn-009-runner.js';

// ---------------------------------------------------------------------------
// 常量 / 纯函数
// ---------------------------------------------------------------------------

export const FLOAT_PRECISION = 10n ** 30n;
export const WEI_PRECISION = 10n ** 18n;
const BPS = 10_000n;
const USDC_PRECISION = 10n ** 6n;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;
const ZERO_BYTES32 = `0x${'0'.repeat(64)}` as Hex;
const MAX_UINT256 = 2n ** 256n - 1n;
const DEPLOYED_MARKET_INDEX = 2;

/** 矩阵 B1 行标题（TestCase/E2E/versions/v0.3.2/Trade-测试用例矩阵.md §B1，逐字） */
export const XT_MKT_TITLES = {
  'XT-MKT-OPEN-001': 'Market 开仓_long_建立一笔多仓',
  'XT-MKT-OPEN-002': 'Market 开仓_short_建立一笔空仓',
  'XT-MKT-LEV-003': 'Market 开仓_leverage=L_min_等号允许',
  'XT-MKT-LEV-004': 'Market 开仓_leverage=L_min_等号允许',
  'XT-MKT-LEV-005': 'Market 开仓_leverage=L_max_等号允许',
  'XT-MKT-LEV-006': 'Market 开仓_leverage=L_max_等号允许',
  'XT-MKT-COL-009': 'Market 开仓_initialCollateral=C_eff−1 最小原始单位_不得成交',
} as const;

export type XtMktCaseId = keyof typeof XT_MKT_TITLES;

type MaskableRuntime = Pick<RuntimeConfig, 'rpcUrl' | 'adminRpcUrl'>;

/** 错误 → 脱敏文本：viem BaseError 取 shortMessage(+details)，其余取 message；最后统一 maskErrorText（RPC URL 不外泄）。 */
export function describeError(error: unknown, runtime?: MaskableRuntime): string {
  const raw = error instanceof BaseError
    ? `${error.shortMessage}${error.details ? `（${error.details}）` : ''}`
    : error instanceof Error ? error.message : String(error);
  return maskErrorText(raw, runtime);
}

/**
 * RPC/viem 调用统一包装：可选 ABI 将 revert 先解码为可读摘要，再统一脱敏。
 * 不把原始 error 挂到 cause，避免其中的 RPC URL 穿透到 Playwright 报告。
 */
async function guarded<T>(
  runtime: MaskableRuntime | undefined,
  label: string,
  action: () => Promise<T>,
  errorAbi?: Abi,
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    const decoded = decodeEvmFailure(error, errorAbi);
    const decodedText = decoded ? `${maskErrorText(formatDecodedEvmFailure(decoded), runtime)}；` : '';
    throw new Error(`${label}：${decodedText}${describeError(error, runtime)}`);
  }
}

/** 向上取整除法（分子分母均为正） */
export function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error(`ceilDiv 分母必须为正：${denominator}`);
  if (numerator < 0n) throw new Error(`ceilDiv 分子必须非负：${numerator}`);
  return (numerator + denominator - 1n) / denominator;
}

/** bigint 比值格式化为十进制字符串（截断到 decimals 位），用于把杠杆倍数等比率落证据。 */
export function formatRatio(numerator: bigint, denominator: bigint, decimals = 6): string {
  if (denominator === 0n) throw new Error('formatRatio 分母为 0');
  const negative = (numerator < 0n) !== (denominator < 0n);
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const scaled = n * 10n ** BigInt(decimals) / d;
  const whole = scaled / 10n ** BigInt(decimals);
  const fraction = (scaled % 10n ** BigInt(decimals)).toString().padStart(decimals, '0');
  return `${negative && scaled !== 0n ? '-' : ''}${whole}.${fraction}`;
}

/** 杠杆倍数（number，两位小数）→ 百分之一倍的整数刻度（bigint），用于无浮点误差的 ceil 计算。 */
export function leverageToCenti(leverageX: number): bigint {
  if (!Number.isFinite(leverageX) || leverageX <= 0) throw new Error(`杠杆倍数非法：${leverageX}`);
  return BigInt(Math.round(leverageX * 100));
}

/**
 * 固定 size（USD 1e30）按目标杠杆（两位小数）所需抵押，USDC 原始单位，向上取整（风险侧）：
 * collateral = ceil( size / leverage ) = ceil( size × 1e6 × 100 / (1e30 × leverageCenti) )
 */
export function collateralRawForLeverage(sizeDeltaUsd: bigint, leverageX: number): bigint {
  const centi = leverageToCenti(leverageX);
  return ceilDiv(sizeDeltaUsd * USDC_PRECISION * 100n, FLOAT_PRECISION * centi);
}

/**
 * 固定 size 按最低抵押率因子（1e30）所需抵押的理论下限（USDC 原始单位，向上取整）：
 * collateral = ceil( size × factor / 1e30 / 1e30 × 1e6 )
 */
export function minCollateralRawForFactor(sizeDeltaUsd: bigint, factor: bigint): bigint {
  return ceilDiv(sizeDeltaUsd * factor * USDC_PRECISION, FLOAT_PRECISION * FLOAT_PRECISION);
}

/** 前端 leverage.ts：floorUiLeverage */
export function floorUiLeverage(value: number): number {
  return Math.floor(value * 100) / 100;
}

/** 前端 leverage.ts：floorUiLeverageCap（v ≥ 100 → 100；否则 max(1, floor((v − 0.01) × 100) / 100)） */
export function floorUiLeverageCap(value: number, hardCap = 100): number {
  const capped = Math.min(value, hardCap);
  if (!Number.isFinite(capped) || capped <= 0) return hardCap;
  if (capped >= hardCap) return hardCap;
  return Math.max(1, floorUiLeverage(capped - 0.01));
}

/** 前端 leverage.ts：getUiMaxLeverage（bps → 倍数，产品上限） */
export function getUiMaxLeverage(maxSafeLeverageBps: bigint | undefined, hardCap = 100): number {
  if (maxSafeLeverageBps === undefined || maxSafeLeverageBps <= 0n) return hardCap;
  return Math.min(hardCap, Number(maxSafeLeverageBps) / 10_000);
}

export interface LeverageFormulaInputs {
  /** MIN_COLLATERAL_FACTOR（1e30）；前端 getEffectiveMinCollateralFactor 已取 max(base, OI 乘数项) */
  readonly minCollateralFactor: bigint;
  /** 开仓费率（1e30）：前端 getPositionFeeRate = POSITION_FEE_FACTOR(balanceWasNotImproved=false 键) 优先 */
  readonly feeOpen: bigint;
  /** 平仓费率（1e30）：同一费率（前端 feeRate + feeRate） */
  readonly feeClose: bigint;
  /** 开仓侧动态点差（1e18；Reader.getExecutionPrice(+size).dynamicSpread） */
  readonly openSpread: bigint;
  /** 平仓侧动态点差（1e18；Reader.getExecutionPrice(−size, 结果仓位).dynamicSpread） */
  readonly closeSpread: bigint;
  /** 产品上限（默认 100） */
  readonly productCap?: number;
  /**
   * 可选：Oracle 内部价 min/max（1e30 刻度）。链上开多按 max×(1+s_open) 成交、isPositionLiquidatable 按 min×(1−s_close) 估值
   * （做空反之：min×(1−s_open) 成交、max×(1+s_close) 估值），min≠max 时（tx-fork mock STABLE_PRICE 锚形成的价带）多出一项
   * pnl 损耗，前端公式不含该项；给出后额外算 chainModel（按 isLong 分方向）。
   */
  readonly indexPriceMin?: bigint;
  readonly indexPriceMax?: bigint;
  /** 方向（价带模型分方向；缺省 long） */
  readonly isLong?: boolean;
  /**
   * 可选：链上闸门模型的分腿费率（1e30）。合约按每腿的 balanceWasImproved 选 POSITION_FEE_FACTOR(mi, improved)
   * （PositionPricingUtils.getPositionFees → positionFeeFactorKey(marketIndex, balanceWasImproved)），
   * 前端公式则两腿同用 getPositionFeeRate；tx-fork 上 (true)=5e26 ≠ (false)=2e26，两者不能混用。
   * 缺省退化为 feeOpen / feeClose（与前端口径一致）。
   */
  readonly chainFeeOpen?: bigint;
  readonly chainFeeClose?: bigint;
}

export interface ExpectedMaxLeverage {
  /** 理论上限 1e30 / minCF（倍数） */
  readonly theoreticalX: number;
  readonly theoreticalBps: bigint;
  /** 前端公式 1/(minCF + s_open + s_close + f_open + f_close)，bps 与倍数 */
  readonly formulaBps: bigint;
  readonly formulaX: number;
  /** 页面滑杆上限：floorUiLeverageCap(getUiMaxLeverage(formulaBps, cap), cap) */
  readonly uiCapX: number;
  /** 有效因子（1e30）= minCF + s_open×1e12 + s_close×1e12 + f_open + f_close（前端口径） */
  readonly effectiveFactor: bigint;
  /**
   * 链上闸门因子（1e30）= minCF + f_open + f_close + loss（loss 为分方向的价带+点差损耗项）；
   * 未给价带时退化为 effectiveFactor。用于收紧抵押搜索区间。
   */
  readonly chainFactor: bigint;
  /** 含 Oracle 价带项的链上模型（仅当给出 indexPriceMin/Max）；min==max 时与 formula 仅差点差取整 */
  readonly chainModelBps?: bigint;
  readonly chainModelX?: number;
  /** 分方向的 pnl 损耗项（1e30）：long = 1 − Pmin(1−s_c)/(Pmax(1+s_o))；short = Pmax(1+s_c)/(Pmin(1−s_o)) − 1 */
  readonly pnlLossFactor?: bigint;
  /** Oracle 价带因子（1e30）= 1 − Pmin/Pmax；min==max 时为 0（观测） */
  readonly oracleBandFactor?: bigint;
  readonly inputs: {
    readonly minCollateralFactor: string;
    readonly feeOpen: string;
    readonly feeClose: string;
    /** 链上闸门模型实际采用的分腿费率（按各腿 balanceWasImproved 取键） */
    readonly chainFeeOpen: string;
    readonly chainFeeClose: string;
    readonly openSpread: string;
    readonly closeSpread: string;
    readonly productCap: number;
    readonly isLong: boolean;
    readonly indexPriceMin?: string;
    readonly indexPriceMax?: string;
  };
}

function spreadToFloatPrecision(spread: bigint): bigint {
  return spread * FLOAT_PRECISION / WEI_PRECISION;
}

/**
 * 前端 leverage.ts 的 L_max（getMaxSafeLeverageBpsForMarket + getUiMaxLeverage + floorUiLeverageCap）bigint 复算。
 * 全部 bps 整数运算；倍数 number 仅用于 UI 取整语义（与前端 Number(bps)/10_000 同口径）。
 */
export function expectedMaxLeverage(params: LeverageFormulaInputs): ExpectedMaxLeverage {
  const productCap = params.productCap ?? 100;
  if (params.minCollateralFactor <= 0n) throw new Error('MIN_COLLATERAL_FACTOR 必须为正（链上未配置时不能推导 L_max）');
  const effectiveFactor = params.minCollateralFactor
    + spreadToFloatPrecision(params.openSpread)
    + spreadToFloatPrecision(params.closeSpread)
    + params.feeOpen
    + params.feeClose;
  if (effectiveFactor <= 0n) throw new Error(`有效因子非正：${effectiveFactor}`);
  const theoreticalBps = FLOAT_PRECISION * BPS / params.minCollateralFactor;
  const formulaBps = FLOAT_PRECISION * BPS / effectiveFactor;
  const formulaX = Number(formulaBps) / 10_000;
  const uiCapX = floorUiLeverageCap(getUiMaxLeverage(formulaBps, productCap), productCap);

  const isLong = params.isLong ?? true;
  const chainFeeOpen = params.chainFeeOpen ?? params.feeOpen;
  const chainFeeClose = params.chainFeeClose ?? params.feeClose;
  let chainFactor = effectiveFactor;
  let chainModel: Pick<ExpectedMaxLeverage, 'chainModelBps' | 'chainModelX' | 'oracleBandFactor' | 'pnlLossFactor'> = {};
  if (params.indexPriceMin !== undefined && params.indexPriceMax !== undefined) {
    if (params.indexPriceMin <= 0n || params.indexPriceMax < params.indexPriceMin) {
      throw new Error(`Oracle 价带非法：min=${params.indexPriceMin}，max=${params.indexPriceMax}`);
    }
    // PositionUtils.getExecutionPriceForIncrease：开多 exec = Pmax×(1+s_open)、开空 exec = Pmin×(1−s_open)（s_open 带符号原样应用）；
    // isPositionLiquidatable 以 Liquidation 规则 getExecutionPriceForDecrease（allowNegativeSpread=false → s_close 钳 ≥ 0）：
    // 平多 = Pmin×(1−s_close)、平空 = Pmax×(1+s_close)。pnl/size：
    //   long  = Pmin(1−s_c)/(Pmax(1+s_o)) − 1 → loss = 1 − 该比值
    //   short = 1 − Pmax(1+s_c)/(Pmin(1−s_o)) → loss = 该比值 − 1
    const openSigned = params.openSpread;
    const closeClamped = params.closeSpread < 0n ? 0n : params.closeSpread;
    const openMultiplierLong = WEI_PRECISION + openSigned;
    const openMultiplierShort = WEI_PRECISION - openSigned;
    if (openMultiplierLong <= 0n || openMultiplierShort <= 0n) throw new Error(`开仓点差非法：${openSigned}`);
    const pnlLossFactor = isLong
      ? FLOAT_PRECISION - params.indexPriceMin * (WEI_PRECISION - closeClamped) * FLOAT_PRECISION / (params.indexPriceMax * openMultiplierLong)
      : params.indexPriceMax * (WEI_PRECISION + closeClamped) * FLOAT_PRECISION / (params.indexPriceMin * openMultiplierShort) - FLOAT_PRECISION;
    // 链上闸门两腿费率按各自 balanceWasImproved 取键（见 LeverageFormulaInputs.chainFeeOpen/Close 注释）
    chainFactor = params.minCollateralFactor + chainFeeOpen + chainFeeClose + pnlLossFactor;
    if (chainFactor <= 0n) throw new Error(`链上闸门因子非正：${chainFactor}`);
    const chainModelBps = FLOAT_PRECISION * BPS / chainFactor;
    chainModel = {
      chainModelBps,
      chainModelX: Number(chainModelBps) / 10_000,
      pnlLossFactor,
      oracleBandFactor: FLOAT_PRECISION - params.indexPriceMin * FLOAT_PRECISION / params.indexPriceMax,
    };
  }

  return {
    theoreticalX: Number(theoreticalBps) / 10_000,
    theoreticalBps,
    formulaBps,
    formulaX,
    uiCapX,
    effectiveFactor,
    chainFactor,
    ...chainModel,
    inputs: {
      minCollateralFactor: params.minCollateralFactor.toString(),
      feeOpen: params.feeOpen.toString(),
      feeClose: params.feeClose.toString(),
      chainFeeOpen: chainFeeOpen.toString(),
      chainFeeClose: chainFeeClose.toString(),
      openSpread: params.openSpread.toString(),
      closeSpread: params.closeSpread.toString(),
      productCap,
      isLong,
      ...(params.indexPriceMin !== undefined ? { indexPriceMin: params.indexPriceMin.toString() } : {}),
      ...(params.indexPriceMax !== undefined ? { indexPriceMax: params.indexPriceMax.toString() } : {}),
    },
  };
}

/**
 * 前端 leverage.ts getPositionFeeRate 镜像：POSITION_FEE_FACTOR(mi,false) 只要「已定义」就用（即使为 0），未定义才回退 improved。
 * 局限：DataStore.getUint 对未设键返回 0，链上无法区分「设为 0」与「未设」；这里以 default-mock 参数清单
 * （config/markets/default-mock.ts，Fork 初始化逐项写入并回读校验）是否声明该键作为「已定义」判据。
 */
export function positionFeeRateForLeverage(input: {
  readonly notImproved: bigint;
  readonly improved: bigint;
  readonly notImprovedDeclared: boolean;
}): { readonly feeRate: bigint; readonly source: 'POSITION_FEE_FACTOR(false)' | 'POSITION_FEE_FACTOR(true) 回退' } {
  return input.notImprovedDeclared
    ? { feeRate: input.notImproved, source: 'POSITION_FEE_FACTOR(false)' }
    : { feeRate: input.improved, source: 'POSITION_FEE_FACTOR(true) 回退' };
}

/** default-mock 参数清单是否声明 POSITION_FEE_FACTOR(market, balanceWasImproved) */
export function defaultMockDeclaresPositionFeeFactor(balanceWasImproved: boolean): boolean {
  return defaultMockMarketProfile.parameters.some((parameter) =>
    parameter.baseKey === 'POSITION_FEE_FACTOR'
    && parameter.arguments.some((argument) => argument.type === 'bool' && argument.value === balanceWasImproved));
}

export interface CollateralSearchBounds {
  /** 链上模型估计的最小抵押（raw）= S × chainFactor / 1e30 / collateralPrice.min（向下取整） */
  readonly estimateRaw: bigint;
  /** floor(estimate × 0.9) */
  readonly lower: bigint;
  /** ceil(estimate × 1.5) */
  readonly upper: bigint;
  /** 预计探测次数 = 2（括号）+ ceil(log2(upper − lower)) */
  readonly needed: number;
}

/**
 * 抵押二分搜索区间（#8 收紧）：围绕链上模型估计值取 [×0.9, ×1.5]；
 * chainFactor 为含价带损耗的链上闸门因子（expectedMaxLeverage().chainFactor），collateralPriceMin 为抵押币 Oracle min 价（1e30/raw）。
 */
export function collateralSearchBounds(input: {
  readonly sizeDeltaUsd: bigint;
  readonly chainFactor: bigint;
  readonly collateralPriceMin: bigint;
}): CollateralSearchBounds {
  if (input.collateralPriceMin <= 0n) throw new Error(`collateralPrice.min 必须为正：${input.collateralPriceMin}`);
  if (input.chainFactor <= 0n) throw new Error(`chainFactor 必须为正：${input.chainFactor}`);
  const estimateRaw = input.sizeDeltaUsd * input.chainFactor / (FLOAT_PRECISION * input.collateralPriceMin);
  const lower = estimateRaw * 9n / 10n;
  const upper = ceilDiv(estimateRaw * 3n, 2n);
  if (lower <= 0n || upper <= lower) throw new Error(`抵押搜索区间退化：estimate=${estimateRaw}，lower=${lower}，upper=${upper}`);
  const needed = 2 + Math.ceil(Math.log2(Number(upper - lower)));
  return { estimateRaw, lower, upper, needed };
}

// ---------------------------------------------------------------------------
// 链上上下文（typed viem；与 scn-070-runner 同款模式）
// ---------------------------------------------------------------------------

const dataStoreAbi = parseAbi([
  'function getUint(bytes32) view returns (uint256)',
  'function getInt(bytes32) view returns (int256)',
  'function getBytes32Count(bytes32) view returns (uint256)',
  'function getBytes32ValuesAt(bytes32,uint256,uint256) view returns (bytes32[])',
  'function containsBytes32(bytes32,bytes32) view returns (bool)',
]);

interface XtContext {
  readonly runtime: RuntimeConfig;
  readonly manifest: DeploymentManifest;
  readonly resource: MockResourceRecord;
  readonly mockResourceAlias: string;
  readonly marketIndex: bigint;
  readonly indexToken: Address;
  readonly indexTokenDecimals: number;
  readonly indexOracle: Address;
  readonly collateralToken: Address;
  readonly collateralTokenDecimals: number;
  readonly collateralOracle: Address;
  readonly dataStore: Address;
  readonly reader: Address;
  readonly exchangeRouter: Address;
  readonly orderVault: Address;
  readonly orderHandler: Address;
  readonly eventEmitter: Address;
  readonly abis: {
    readonly reader: Abi;
    readonly exchangeRouter: Abi;
    readonly orderHandler: Abi;
    readonly eventEmitter: Abi;
    /** 目标合约 error + 版本绑定 FxErrors，供 create / execute revert 统一解码。 */
    readonly error: Abi;
  };
  readonly publicClient: ReturnType<typeof createPublicClient>;
}

function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new Error(message);
  return value as Record<string, unknown>;
}

function asBigInt(value: unknown, message: string): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' || typeof value === 'string') return BigInt(value);
  throw new Error(message);
}

/** 证据友好化：bigint → 十进制字符串（递归）；undefined 原样返回。 */
function stringifyBigint(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(stringifyBigint);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, stringifyBigint(item)]));
  }
  return value;
}

async function buildContext(
  runtime: RuntimeConfig,
  resolvedEnvironment?: ResolvedTestEnvironment,
): Promise<XtContext> {
  if (resolvedEnvironment) {
    assertRuntimeMatchesResolvedEnvironment(runtime, resolvedEnvironment);
    if (resolvedEnvironment.marketMode !== 'mock-market'
      || resolvedEnvironment.oracleMode !== 'mock-oracle') {
      throw new Error('XT-MKT 需要 mock-market + mock-oracle');
    }
  }
  await assertRuntimeEnvironmentBinding(runtime);
  if (resolvedEnvironment?.marketMode === 'deployed-market'
    || (!resolvedEnvironment && process.env.E2E_MARKET_MODE === 'deployed-market')) {
    throw new Error(`XT-MKT 需要 mock-market 模式（可控 Mock Oracle）；E2E_MARKET_MODE=deployed-market 时 Market #${DEPLOYED_MARKET_INDEX} 无法做点差/抵押探测。`);
  }
  const manifest = await loadDeploymentManifest(runtime.deploymentManifestPath);
  const mockResourceAlias = resolvedEnvironment?.mockResourceAlias
    ?? process.env.E2E_MARKET_RESOURCE_ALIAS
    ?? 'default-mock';
  const resource = await resolveMockMarketBundle(runtime.environment, mockResourceAlias);
  if (resource.market?.status !== 'registered' || resource.market.marketIndex === undefined) {
    throw new Error(`${runtime.environment}/${mockResourceAlias} 缺少已注册 Market`);
  }
  const token = requireValue(resource.token, `${mockResourceAlias} 缺少 Index Token 登记`);
  const oracle = requireValue(resource.oracle, `${mockResourceAlias} 缺少 Index Mock Oracle 登记`);
  const collateralToken = requireValue(resource.collateralToken, `${mockResourceAlias} 缺少 Collateral Token 登记`);
  const collateralOracle = requireValue(resource.collateralOracle, `${mockResourceAlias} 缺少 Collateral Mock Oracle 登记`);
  const orderVault = requireValue(manifest.additionalContracts.orderVault, 'Deployment manifest 缺少 additionalContracts.orderVault');
  const [readerAbi, exchangeRouterAbi, orderHandlerAbi, eventEmitterAbi, fxErrorsAbi] = await Promise.all([
    loadDeploymentAbi(manifest, 'Reader'),
    loadDeploymentAbi(manifest, 'ExchangeRouter'),
    loadDeploymentAbi(manifest, 'OrderHandler'),
    loadDeploymentAbi(manifest, 'EventEmitter'),
    loadDeploymentAbi(manifest, 'FxErrors'),
  ]);
  const errorAbi = [...exchangeRouterAbi, ...orderHandlerAbi, ...fxErrorsAbi]
    .filter((item) => item.type === 'error') as Abi;
  return {
    runtime,
    manifest,
    resource,
    mockResourceAlias,
    marketIndex: BigInt(resource.market.marketIndex),
    indexToken: getAddress(token.address),
    indexTokenDecimals: token.decimals,
    indexOracle: getAddress(oracle.address),
    collateralToken: getAddress(collateralToken.address),
    collateralTokenDecimals: collateralToken.decimals,
    collateralOracle: getAddress(collateralOracle.address),
    dataStore: getAddress(manifest.contracts.dataStore),
    reader: getAddress(manifest.contracts.reader),
    exchangeRouter: getAddress(manifest.contracts.exchangeRouter),
    orderVault: getAddress(orderVault),
    orderHandler: getAddress(manifest.contracts.orderHandler),
    eventEmitter: getAddress(manifest.contracts.eventEmitter),
    abis: {
      reader: readerAbi,
      exchangeRouter: exchangeRouterAbi,
      orderHandler: orderHandlerAbi,
      eventEmitter: eventEmitterAbi,
      error: errorAbi,
    },
    publicClient: createPublicClient({ transport: http(runtime.rpcUrl, { timeout: runtime.requestTimeoutMs }), pollingInterval: 500 }),
  };
}

export interface OraclePriceBand {
  /** provider 内部价 = mulDiv(answer, PRICE_FEED_MULTIPLIER(token), 1e30)（ChainlinkPriceFeedUtils.getPriceFeedPrice，向下取整） */
  readonly feed: bigint;
  readonly stable: bigint;
  readonly min: bigint;
  readonly max: bigint;
  readonly oracleDecimals: number;
  readonly rawAnswer: bigint;
  /** DataStore PRICE_FEED_MULTIPLIER(token) */
  readonly multiplier: bigint;
  /** 交叉观测：按小数位反推 answer × 10^(30 − oracleDecimals − tokenDecimals)；指数为负时缺省 */
  readonly feedFromDecimals?: bigint;
  /** feedFromDecimals 是否与 multiplier 口径一致（观测，不参与断言） */
  readonly decimalsCrossCheckMatches?: boolean;
}

/**
 * ChainlinkPriceFeedProvider 口径的内部价 min/max：
 * feed = mulDiv(answer, PRICE_FEED_MULTIPLIER(token), 1e30)（ChainlinkPriceFeedUtils.sol；multiplier=0 时合约 revert
 * EmptyChainlinkPriceFeedMultiplier），键 = keccak(abi.encode(PRICE_FEED_MULTIPLIER, token))（FX100Keys.priceFeedMultiplierKey）；
 * STABLE_PRICE(token) > 0 时 min = min(feed, stable)、max = max(feed, stable)（v0.3.2 provider L49-55）。
 * 按小数位反推的值只作交叉观测。
 */
async function readOraclePriceBand(
  context: XtContext,
  oracle: Address,
  token: Address,
  tokenDecimals: number,
): Promise<OraclePriceBand> {
  const runtime = context.runtime;
  const state = await guarded(runtime, `读取 Mock Oracle ${oracle} 状态`, () => readMockOracleState(runtime.rpcUrl, oracle, runtime.requestTimeoutMs));
  const multiplier = await readUint(context, tokenKey(KEYS.PRICE_FEED_MULTIPLIER, token));
  if (multiplier <= 0n) throw new Error(`PRICE_FEED_MULTIPLIER(${token}) 未设置（链上 getPriceFeedPrice 会 revert EmptyChainlinkPriceFeedMultiplier）`);
  if (state.answer <= 0n) throw new Error(`Mock Oracle ${oracle} answer 非正：${state.answer}（链上 revert InvalidFeedPrice）`);
  const feed = state.answer * multiplier / FLOAT_PRECISION;
  const exponent = 30 - state.decimals - tokenDecimals;
  const feedFromDecimals = exponent >= 0 ? state.answer * 10n ** BigInt(exponent) : undefined;
  const stable = await guarded(runtime, `读取 STABLE_PRICE(${token})`, () => readStablePrice(runtime.rpcUrl, context.dataStore, token, runtime.requestTimeoutMs));
  const min = stable > 0n && stable < feed ? stable : feed;
  const max = stable > 0n && stable > feed ? stable : feed;
  return {
    feed,
    stable,
    min,
    max,
    oracleDecimals: state.decimals,
    rawAnswer: state.answer,
    multiplier,
    ...(feedFromDecimals !== undefined ? { feedFromDecimals, decimalsCrossCheckMatches: feedFromDecimals === feed } : {}),
  };
}

async function readUint(context: XtContext, key: Hex, blockNumber?: bigint): Promise<bigint> {
  return guarded(context.runtime, `DataStore.getUint(${key})`, () => context.publicClient.readContract({
    address: context.dataStore,
    abi: dataStoreAbi,
    functionName: 'getUint',
    args: [key],
    ...(blockNumber !== undefined ? { blockNumber } : {}),
  }));
}

interface ExecutionPriceReading {
  readonly executionPrice: bigint;
  readonly dynamicSpread: bigint;
  readonly sizeDeltaUsd: bigint;
  readonly sizeDeltaInTokens: bigint;
  readonly balanceWasImproved: boolean;
}

async function readExecutionPrice(
  context: XtContext,
  input: {
    readonly prices: { readonly index: { min: bigint; max: bigint }; readonly collateral: { min: bigint; max: bigint } };
    readonly positionSizeInUsd: bigint;
    readonly positionSizeInTokens: bigint;
    readonly sizeDelta: bigint;
    readonly isLong: boolean;
  },
): Promise<ExecutionPriceReading> {
  const result = await guarded(context.runtime, `Reader.getExecutionPrice(sizeDelta=${input.sizeDelta},isLong=${input.isLong})`, () => context.publicClient.readContract({
    address: context.reader,
    abi: context.abis.reader,
    functionName: 'getExecutionPrice',
    args: [
      context.dataStore,
      context.marketIndex,
      {
        indexTokenPrice: { min: input.prices.index.min, max: input.prices.index.max },
        collateralTokenPrice: { min: input.prices.collateral.min, max: input.prices.collateral.max },
      },
      input.positionSizeInUsd,
      input.positionSizeInTokens,
      input.sizeDelta,
      true,
      input.isLong,
    ],
  }));
  const root = asRecord(result, 'Reader.getExecutionPrice 未返回对象');
  return {
    executionPrice: asBigInt(root.executionPrice, 'executionPrice 缺失'),
    dynamicSpread: asBigInt(root.dynamicSpread, 'dynamicSpread 缺失'),
    sizeDeltaUsd: asBigInt(root.sizeDeltaUsd, 'sizeDeltaUsd 缺失'),
    sizeDeltaInTokens: asBigInt(root.sizeDeltaInTokens, 'sizeDeltaInTokens 缺失'),
    balanceWasImproved: Boolean(root.balanceWasImproved),
  };
}

export interface LeverageParams {
  readonly blockNumber: string;
  readonly marketIndex: string;
  readonly isLong: boolean;
  readonly sizeDeltaUsd: bigint;
  /** MIN_COLLATERAL_FACTOR(marketIndex) */
  readonly minCollateralFactor: bigint;
  /** MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER(marketIndex, isLong) */
  readonly minCollateralFactorForOpenInterestMultiplier: bigint;
  /** CUMULATIVE_OPEN_COSTS(marketIndex, isLong)（前端 OI 项基数） */
  readonly cumulativeOpenCosts: bigint;
  /** 前端 getEffectiveMinCollateralFactor：max(base, (OI + size) × multiplier / 1e30) */
  readonly effectiveMinCollateralFactor: bigint;
  /** POSITION_FEE_FACTOR(marketIndex, false) —— balanceWasNotImproved（前端 getPositionFeeRate 首选） */
  readonly positionFeeFactorNotImproved: bigint;
  /** POSITION_FEE_FACTOR(marketIndex, true) —— balanceWasImproved */
  readonly positionFeeFactorImproved: bigint;
  /** default-mock 参数清单是否声明 POSITION_FEE_FACTOR(mi,false)（「已定义」判据，见 positionFeeRateForLeverage） */
  readonly positionFeeFactorNotImprovedDeclared: boolean;
  /** 前端 getPositionFeeRate 镜像结果（notImproved 已定义即用，未定义才回退 improved） */
  readonly feeRate: bigint;
  readonly feeRateSource: string;
  readonly minCollateralUsd: bigint;
  readonly minPositionSizeUsd: bigint;
  /** Reader.getExecutionPrice(+size).dynamicSpread（1e18） */
  readonly openSpread: bigint;
  /** Reader.getExecutionPrice(−size, 结果仓位).dynamicSpread（1e18） */
  readonly closeSpread: bigint;
  readonly openExecutionPrice: bigint;
  readonly closeExecutionPrice: bigint;
  readonly openSizeDeltaInTokens: bigint;
  readonly openBalanceWasImproved: boolean;
  readonly closeBalanceWasImproved: boolean;
  /** 由执行价反推的点差（相对同侧 Oracle 价，1e18），用于交叉核对 dynamicSpread */
  readonly openSpreadFromPrice: bigint;
  readonly closeSpreadFromPrice: bigint;
  readonly indexPrice: OraclePriceBand;
  readonly collateralPrice: OraclePriceBand;
  readonly keys: Record<string, Hex>;
}

/**
 * 读 L_max 所需链上参数与开/平点差（Reader.getExecutionPrice 相对 Oracle max/min 的不利侧执行价）。
 * 键构造已按 FX100Keys.sol 核对：minCollateralFactorKey = keccak(abi.encode(MIN_COLLATERAL_FACTOR, marketIndex))；
 * positionFeeFactorKey = keccak(abi.encode(POSITION_FEE_FACTOR, marketIndex, balanceWasImproved))；
 * MIN_COLLATERAL_USD / MIN_POSITION_SIZE_USD 为全局键。
 */
export async function readLeverageParams(
  runtime: RuntimeConfig,
  input: {
    readonly isLong: boolean;
    readonly sizeDeltaUsd: bigint;
    readonly resolvedEnvironment?: ResolvedTestEnvironment;
  },
): Promise<LeverageParams> {
  const context = await buildContext(runtime, input.resolvedEnvironment);
  const block = await guarded(runtime, 'eth_getBlockByNumber(latest)', () => context.publicClient.getBlock());
  const blockNumber = block.number;
  const mi = context.marketIndex;
  const keys = {
    MIN_COLLATERAL_FACTOR: marketKey(KEYS.MIN_COLLATERAL_FACTOR, mi),
    MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER: marketBoolKey(globalKey('MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER'), mi, input.isLong),
    CUMULATIVE_OPEN_COSTS: cumulativeOpenCostsKey(mi, input.isLong),
    POSITION_FEE_FACTOR_NOT_IMPROVED: marketBoolKey(KEYS.POSITION_FEE_FACTOR, mi, false),
    POSITION_FEE_FACTOR_IMPROVED: marketBoolKey(KEYS.POSITION_FEE_FACTOR, mi, true),
    MIN_COLLATERAL_USD: KEYS.MIN_COLLATERAL_USD,
    MIN_POSITION_SIZE_USD: KEYS.MIN_POSITION_SIZE_USD,
  } satisfies Record<string, Hex>;
  const [
    minCollateralFactor,
    minCollateralFactorForOpenInterestMultiplier,
    cumulativeOpenCosts,
    positionFeeFactorNotImproved,
    positionFeeFactorImproved,
    minCollateralUsd,
    minPositionSizeUsd,
  ] = await Promise.all([
    readUint(context, keys.MIN_COLLATERAL_FACTOR, blockNumber),
    readUint(context, keys.MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER, blockNumber),
    readUint(context, keys.CUMULATIVE_OPEN_COSTS, blockNumber),
    readUint(context, keys.POSITION_FEE_FACTOR_NOT_IMPROVED, blockNumber),
    readUint(context, keys.POSITION_FEE_FACTOR_IMPROVED, blockNumber),
    readUint(context, keys.MIN_COLLATERAL_USD, blockNumber),
    readUint(context, keys.MIN_POSITION_SIZE_USD, blockNumber),
  ]);
  const oiTerm = (cumulativeOpenCosts + input.sizeDeltaUsd) * minCollateralFactorForOpenInterestMultiplier / FLOAT_PRECISION;
  const effectiveMinCollateralFactor = oiTerm > minCollateralFactor ? oiTerm : minCollateralFactor;
  // 前端 getPositionFeeRate：notImproved ?? improved ?? 0 —— 「已定义即用（含 0）」，以 default-mock 参数清单声明为已定义判据
  const positionFeeFactorNotImprovedDeclared = defaultMockDeclaresPositionFeeFactor(false);
  const { feeRate, source: feeRateSource } = positionFeeRateForLeverage({
    notImproved: positionFeeFactorNotImproved,
    improved: positionFeeFactorImproved,
    notImprovedDeclared: positionFeeFactorNotImprovedDeclared,
  });

  const [indexPrice, collateralPrice] = await Promise.all([
    readOraclePriceBand(context, context.indexOracle, context.indexToken, context.indexTokenDecimals),
    readOraclePriceBand(context, context.collateralOracle, context.collateralToken, context.collateralTokenDecimals),
  ]);
  const prices = { index: { min: indexPrice.min, max: indexPrice.max }, collateral: { min: collateralPrice.min, max: collateralPrice.max } };
  const open = await readExecutionPrice(context, {
    prices, positionSizeInUsd: 0n, positionSizeInTokens: 0n, sizeDelta: input.sizeDeltaUsd, isLong: input.isLong,
  });
  const close = await readExecutionPrice(context, {
    prices, positionSizeInUsd: input.sizeDeltaUsd, positionSizeInTokens: open.sizeDeltaInTokens, sizeDelta: -input.sizeDeltaUsd, isLong: input.isLong,
  });
  // 不利侧：开多 vs max、开空 vs min；平多 vs min、平空 vs max（spread = |E/P − 1|，1e18）
  const openSide = input.isLong ? indexPrice.max : indexPrice.min;
  const closeSide = input.isLong ? indexPrice.min : indexPrice.max;
  const openSpreadFromPrice = input.isLong
    ? (open.executionPrice - openSide) * WEI_PRECISION / openSide
    : (openSide - open.executionPrice) * WEI_PRECISION / openSide;
  const closeSpreadFromPrice = input.isLong
    ? (closeSide - close.executionPrice) * WEI_PRECISION / closeSide
    : (close.executionPrice - closeSide) * WEI_PRECISION / closeSide;

  return {
    blockNumber: blockNumber.toString(),
    marketIndex: mi.toString(),
    isLong: input.isLong,
    sizeDeltaUsd: input.sizeDeltaUsd,
    minCollateralFactor,
    minCollateralFactorForOpenInterestMultiplier,
    cumulativeOpenCosts,
    effectiveMinCollateralFactor,
    positionFeeFactorNotImproved,
    positionFeeFactorImproved,
    positionFeeFactorNotImprovedDeclared,
    feeRate,
    feeRateSource,
    minCollateralUsd,
    minPositionSizeUsd,
    openSpread: open.dynamicSpread,
    closeSpread: close.dynamicSpread,
    openExecutionPrice: open.executionPrice,
    closeExecutionPrice: close.executionPrice,
    openSizeDeltaInTokens: open.sizeDeltaInTokens,
    openBalanceWasImproved: open.balanceWasImproved,
    closeBalanceWasImproved: close.balanceWasImproved,
    openSpreadFromPrice,
    closeSpreadFromPrice,
    indexPrice,
    collateralPrice,
    keys,
  };
}

/** 合约分腿费率：POSITION_FEE_FACTOR(mi, balanceWasImproved)（PositionPricingUtils.positionFeeFactorKey） */
export function chainLegFeeFactor(params: Pick<LeverageParams, 'positionFeeFactorImproved' | 'positionFeeFactorNotImproved'>, balanceWasImproved: boolean): bigint {
  return balanceWasImproved ? params.positionFeeFactorImproved : params.positionFeeFactorNotImproved;
}

/**
 * LeverageParams → expectedMaxLeverage 输入。
 * 前端口径：有效 minCF、同一费率两腿（getPositionFeeRate）、Reader 动态点差；
 * 链上闸门模型：两腿费率按 Reader.getExecutionPrice 返回的各腿 balanceWasImproved 取键（tx-fork 上 improved/notImproved 因子不同），
 * 价带模型按 params.isLong 分方向。
 */
export function leverageFormulaInputs(params: LeverageParams, options?: { readonly includeOracleBand?: boolean; readonly productCap?: number }): LeverageFormulaInputs {
  return {
    minCollateralFactor: params.effectiveMinCollateralFactor,
    feeOpen: params.feeRate,
    feeClose: params.feeRate,
    chainFeeOpen: chainLegFeeFactor(params, params.openBalanceWasImproved),
    chainFeeClose: chainLegFeeFactor(params, params.closeBalanceWasImproved),
    openSpread: params.openSpread,
    closeSpread: params.closeSpread,
    isLong: params.isLong,
    ...(options?.productCap !== undefined ? { productCap: options.productCap } : {}),
    ...(options?.includeOracleBand === false ? {} : { indexPriceMin: params.indexPrice.min, indexPriceMax: params.indexPrice.max }),
  };
}

// ---------------------------------------------------------------------------
// 抵押二分探测（每次探测独立 evm_snapshot / evm_revert）
// ---------------------------------------------------------------------------

/** 裸 JSON-RPC（admin RPC：evm_snapshot / evm_revert / eth_sendTransaction）；网络错误与 RPC error 均脱敏后抛出。 */
async function rawRpc(
  runtime: MaskableRuntime,
  url: string,
  method: string,
  params: readonly unknown[] = [],
  errorAbi?: Abi,
): Promise<unknown> {
  return guarded(runtime, `RPC ${method}`, async () => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json() as { result?: unknown; error?: { message?: string; data?: unknown } };
    if (body.error) {
      const rpcError = new Error(body.error.message ?? 'unknown RPC error') as Error & { data?: unknown };
      if (body.error.data !== undefined) rpcError.data = body.error.data;
      throw rpcError;
    }
    return body.result;
  }, errorAbi);
}

interface ProbeTransaction {
  readonly hash: Hex;
  readonly blockNumber: bigint;
  readonly status: string;
  readonly from: Address;
}

async function sendAsTrader(context: XtContext, input: { readonly to: Address; readonly data: Hex; readonly value: bigint; readonly label: string }): Promise<ProbeTransaction> {
  const runtime = context.runtime;
  const trader = getAddress(requireValue(runtime.testAccount, '缺少 E2E_TEST_ACCOUNT'));
  // 预执行拿可读的 revert 原因（脱敏后抛出）
  await guarded(
    runtime,
    `${input.label} 预执行 revert`,
    () => context.publicClient.call({ account: trader, to: input.to, data: input.data, value: input.value }),
    context.abis.error,
  );
  if (runtime.signingMode === 'private-key') {
    const privateKey = requireValue(runtime.testPrivateKey, 'private-key 模式缺少 E2E_TEST_PRIVATE_KEY');
    const account = privateKeyToAccount(privateKey);
    if (getAddress(account.address) !== trader) throw new Error('E2E_TEST_PRIVATE_KEY 地址与 E2E_TEST_ACCOUNT 不匹配');
    const chain = defineChain({
      id: runtime.chainId,
      name: 'FX100 E2E Fork',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [runtime.rpcUrl] } },
    });
    const wallet = createWalletClient({ account, chain, transport: http(runtime.rpcUrl, { timeout: runtime.requestTimeoutMs }) });
    const hash = await guarded(
      runtime,
      `${input.label} sendTransaction`,
      () => wallet.sendTransaction({ account, chain, to: input.to, data: input.data, value: input.value }),
      context.abis.error,
    );
    const receipt = await guarded(runtime, `${input.label} 等待回执 ${hash}`, () => context.publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 }));
    return { hash, blockNumber: receipt.blockNumber, status: receipt.status, from: trader };
  }
  // impersonation：Tenderly admin RPC 允许任意 from 的 eth_sendTransaction
  const adminUrl = requireValue(runtime.adminRpcUrl, 'impersonation 模式发单需要 admin RPC');
  const hash = await rawRpc(
    runtime,
    adminUrl,
    'eth_sendTransaction',
    [{ from: trader, to: input.to, data: input.data, value: toHex(input.value), gas: toHex(30_000_000n) }],
    context.abis.error,
  );
  if (typeof hash !== 'string' || !hash.startsWith('0x')) throw new Error(`${input.label} 未返回交易哈希`);
  const receipt = await guarded(runtime, `${input.label} 等待回执 ${hash}`, () => context.publicClient.waitForTransactionReceipt({ hash: hash as Hex, timeout: 120_000 }));
  return { hash: hash as Hex, blockNumber: receipt.blockNumber, status: receipt.status, from: trader };
}

/** MarketIncrease 创建（multicall：sendWnt + sendTokens + createOrder），acceptablePrice 放开（开多 MAX / 开空 0） */
async function createMarketIncrease(
  context: XtContext,
  input: { readonly isLong: boolean; readonly sizeDeltaUsd: bigint; readonly collateral: bigint },
): Promise<{ readonly key: Hex; readonly transaction: ProbeTransaction }> {
  const trader = getAddress(requireValue(context.runtime.testAccount, '缺少 E2E_TEST_ACCOUNT'));
  const executionFee = MARKET_FLOW_DEFAULTS.executionFee;
  const calls: Hex[] = [
    encodeFunctionData({ abi: context.abis.exchangeRouter, functionName: 'sendWnt', args: [context.orderVault, executionFee] }),
    encodeFunctionData({ abi: context.abis.exchangeRouter, functionName: 'sendTokens', args: [context.collateralToken, context.orderVault, input.collateral] }),
    encodeFunctionData({
      abi: context.abis.exchangeRouter,
      functionName: 'createOrder',
      args: [{
        addresses: { receiver: trader, cancellationReceiver: ZERO_ADDRESS, callbackContract: ZERO_ADDRESS, uiFeeReceiver: ZERO_ADDRESS },
        numbers: {
          marketIndex: context.marketIndex,
          sizeDelta: input.sizeDeltaUsd,
          initialCollateralDeltaAmount: input.collateral,
          triggerPrice: 0n,
          acceptablePrice: input.isLong ? MAX_UINT256 : 0n,
          executionFee,
          callbackGasLimit: 0n,
          minOutputAmount: 0n,
          validFromTime: 0n,
        },
        orderType: 0,
        isLong: input.isLong,
        autoCancel: false,
        isSizeDeltaUsd: true,
        referralCode: ZERO_BYTES32,
        dataList: [],
      }],
    }),
  ];
  const data = encodeFunctionData({ abi: context.abis.exchangeRouter, functionName: 'multicall', args: [calls] });
  const simulation = await guarded(
    context.runtime,
    `createOrder(size=${input.sizeDeltaUsd},collateral=${input.collateral}) 模拟`,
    () => context.publicClient.call({ account: trader, to: context.exchangeRouter, data, value: executionFee }),
    context.abis.error,
  );
  const results = decodeFunctionResult({ abi: context.abis.exchangeRouter, functionName: 'multicall', data: requireValue(simulation.data, 'createOrder 模拟未返回结果') });
  if (!Array.isArray(results)) throw new Error('multicall 模拟结果不是 bytes[]');
  const encodedKey = results.at(-1);
  if (typeof encodedKey !== 'string') throw new Error('createOrder 返回值不是 bytes');
  const key = decodeAbiParameters([{ type: 'bytes32' }], encodedKey as Hex)[0];
  const transaction = await sendAsTrader(context, { to: context.exchangeRouter, data, value: executionFee, label: `createOrder(size=${input.sizeDeltaUsd},collateral=${input.collateral})` });
  return { key, transaction };
}

async function executeInline(context: XtContext, key: Hex): Promise<ProbeTransaction> {
  const runtime = context.runtime;
  if (runtime.keeperMode !== 'inline') throw new Error('抵押探测只支持 Inline Keeper（每次探测在 evm_snapshot 内同步执行）');
  const privateKey = requireValue(runtime.secondaryTestPrivateKey, 'Inline Keeper 需要 E2E_SECONDARY_TEST_PRIVATE_KEY');
  const keeper = getAddress(requireValue(runtime.keeperAccount, '缺少 E2E_KEEPER_ACCOUNT'));
  const account = privateKeyToAccount(privateKey);
  if (getAddress(account.address) !== keeper) throw new Error('E2E_SECONDARY_TEST_PRIVATE_KEY 地址与 E2E_KEEPER_ACCOUNT 不匹配');
  const providers = await guarded(runtime, 'Inline Keeper 读 Oracle provider', () => inlineOracleProviders(runtime, { name: context.manifest.name, addresses: legacyAddresses(context) }, context.indexToken));
  const data = encodeFunctionData({
    abi: context.abis.orderHandler,
    functionName: 'executeOrder',
    args: [key, { tokens: [context.indexToken, context.collateralToken], providers: [providers.indexToken, providers.collateralToken], data: ['0x', '0x'] }],
  });
  await guarded(
    runtime,
    'Keeper executeOrder 预执行 revert',
    () => context.publicClient.call({ account: keeper, to: context.orderHandler, data }),
    context.abis.error,
  );
  const chain = defineChain({
    id: runtime.chainId,
    name: 'FX100 E2E Fork',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [runtime.rpcUrl] } },
  });
  const wallet = createWalletClient({ account, chain, transport: http(runtime.rpcUrl, { timeout: runtime.requestTimeoutMs }) });
  const hash = await guarded(
    runtime,
    'Keeper executeOrder sendTransaction',
    () => wallet.sendTransaction({ account, chain, to: context.orderHandler, data }),
    context.abis.error,
  );
  const receipt = await guarded(runtime, `Keeper executeOrder 等待回执 ${hash}`, () => context.publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 }));
  return { hash, blockNumber: receipt.blockNumber, status: receipt.status, from: keeper };
}

/** inlineOracleProviders 只读 addresses.dataStore / oracle / usdc；按 LegacyDeployment 形状拼最小对象。 */
function legacyAddresses(context: XtContext): {
  dataStore: string; exchangeRouter: string; orderHandler: string; orderVault: string; oracle: string; usdc: string;
  eventEmitter: string; chainlinkPriceFeedProvider: string; referralStorage: string;
} {
  return {
    dataStore: context.dataStore,
    exchangeRouter: context.exchangeRouter,
    orderHandler: context.orderHandler,
    orderVault: context.orderVault,
    oracle: getAddress(context.manifest.contracts.oracle),
    usdc: context.collateralToken,
    eventEmitter: context.eventEmitter,
    chainlinkPriceFeedProvider: context.manifest.additionalContracts.chainlinkPriceFeedProvider ?? ZERO_ADDRESS,
    referralStorage: context.manifest.additionalContracts.referralStorage ?? ZERO_ADDRESS,
  };
}

interface FxEvent {
  readonly eventName: string;
  readonly topic1?: Hex;
  readonly transactionHash: Hex;
  readonly blockNumber: bigint;
  readonly eventData: Record<string, unknown>;
}

function eventItems(eventData: Record<string, unknown>, groupName: string): Array<Record<string, unknown>> {
  const group = eventData[groupName];
  if (!group || typeof group !== 'object') return [];
  const items = (group as Record<string, unknown>).items;
  return Array.isArray(items) ? items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object') : [];
}

function eventItem(event: FxEvent, groupName: string, key: string): unknown {
  return eventItems(event.eventData, groupName).find((item) => item.key === key)?.value;
}

async function readEvents(context: XtContext, fromBlock: bigint, toBlock: bigint): Promise<FxEvent[]> {
  const logs = await guarded(context.runtime, `eth_getLogs(EventEmitter, ${fromBlock}-${toBlock})`, () =>
    context.publicClient.getLogs({ address: context.eventEmitter, fromBlock, toBlock }));
  const events: FxEvent[] = [];
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({ abi: context.abis.eventEmitter, data: log.data, topics: log.topics, strict: false });
      const args = asRecord(decoded.args, 'EventEmitter args 缺失');
      if (typeof args.eventName !== 'string') continue;
      events.push({
        eventName: args.eventName,
        ...(typeof args.topic1 === 'string' ? { topic1: args.topic1 as Hex } : {}),
        transactionHash: requireValue(log.transactionHash, '事件缺少 transactionHash'),
        blockNumber: requireValue(log.blockNumber, '事件缺少 blockNumber'),
        eventData: asRecord(args.eventData, `${args.eventName}.eventData 缺失`),
      });
    } catch {
      // 非 EventEmitter 结构的日志不属于本场景证据
    }
  }
  return events;
}

function eventsForOrder(events: readonly FxEvent[], key: Hex, eventName: string): FxEvent[] {
  return events.filter((event) => {
    if (event.eventName !== eventName) return false;
    const embedded = eventItem(event, 'bytes32Items', 'key') ?? eventItem(event, 'bytes32Items', 'orderKey');
    return event.topic1?.toLowerCase() === key.toLowerCase() || (typeof embedded === 'string' && embedded.toLowerCase() === key.toLowerCase());
  });
}

const CANCEL_REASON_ABI = parseAbi([
  'error LiquidatablePosition(string reason, int256 remainingCollateralUsd, int256 minCollateralUsd, int256 minCollateralUsdForLeverage)',
  'error InsufficientCollateralUsd(int256 remainingCollateralUsd)',
  'error MinPositionSize(uint256 positionSizeInUsd, uint256 minPositionSizeUsd)',
  'error OrderNotFulfillableAtAcceptablePrice(uint256 executionPrice, uint256 acceptablePrice)',
]);

const CANCEL_REASON_SELECTORS: Record<string, { readonly name: string; readonly signature: string; readonly leverageGate: boolean }> = Object.fromEntries([
  { name: 'LiquidatablePosition', signature: 'LiquidatablePosition(string,int256,int256,int256)', leverageGate: true },
  { name: 'InsufficientCollateralUsd', signature: 'InsufficientCollateralUsd(int256)', leverageGate: true },
  { name: 'MinPositionSize', signature: 'MinPositionSize(uint256,uint256)', leverageGate: false },
  { name: 'OrderNotFulfillableAtAcceptablePrice', signature: 'OrderNotFulfillableAtAcceptablePrice(uint256,uint256)', leverageGate: false },
].map((item) => [keccak256(toHex(item.signature)).slice(0, 10).toLowerCase(), item]));

export interface DecodedCancelReason {
  readonly selector: string;
  readonly errorName: string;
  /** 是否属于杠杆 / 最低抵押闸门（LiquidatablePosition / InsufficientCollateralUsd） */
  readonly leverageGate: boolean;
  readonly reasonString?: string;
  readonly arguments?: Record<string, string>;
}

/** OrderCancelled.reasonBytes 解码：LiquidatablePosition(reason, remaining, minUsd, minForLeverage) 等 */
export function decodeCancelReason(reasonBytes: unknown, reasonString?: string): DecodedCancelReason {
  if (typeof reasonBytes !== 'string' || !reasonBytes.startsWith('0x') || reasonBytes.length < 10) {
    return { selector: '', errorName: 'unknown', leverageGate: false, ...(reasonString !== undefined ? { reasonString } : {}) };
  }
  const decoded = decodeEvmFailure(reasonBytes, CANCEL_REASON_ABI);
  const selector = decoded?.selector ?? reasonBytes.slice(0, 10).toLowerCase();
  const known = CANCEL_REASON_SELECTORS[selector];
  const decodedArguments = decoded?.kind === 'custom' && decoded.args && decoded.args.length > 0
    ? Object.fromEntries(decoded.args.map((argument) => [
      argument.name,
      typeof argument.value === 'string' ? argument.value : JSON.stringify(argument.value),
    ]))
    : undefined;
  return {
    selector,
    errorName: decoded?.kind === 'custom' ? decoded.name ?? known?.name ?? 'unknown' : 'unknown',
    leverageGate: known?.leverageGate ?? false,
    ...(reasonString !== undefined ? { reasonString } : {}),
    ...(decodedArguments ? { arguments: decodedArguments } : {}),
  };
}

export interface CollateralProbe {
  readonly collateral: bigint;
  readonly outcome: 'executed' | 'cancelled';
  readonly orderKey: Hex;
  readonly createTxHash: Hex;
  readonly executeTxHash: Hex;
  readonly reason?: string;
  readonly reasonBytes?: string;
  readonly reasonDecoded?: DecodedCancelReason;
  /** executed：PositionIncrease 后的仓位字段与本单费用（executed 探测必有；缺 PositionFeesCollected / collateralTokenPrice.min 时直接报错，不以 0 顶替） */
  readonly position?: { readonly sizeInUsd: string; readonly sizeInTokens: string; readonly collateralAmount: string; readonly executionPrice: string };
  readonly fees?: { readonly positionFeeAmount: string; readonly uiFeeAmount: string; readonly totalCostAmount: string; readonly collateralTokenPriceMin: string };
  /**
   * executed：仓位建立后（回滚前）对同一仓位全平的 Reader.getExecutionPrice(−size) 读数。
   * isPositionLiquidatable 的平仓腿（点差与 balanceWasImproved → POSITION_FEE_FACTOR 键）按仓位已存在的状态计算：
   * 空市场上平掉刚开的仓会改善平衡（improved 费率、点差为负→清算规则钳 0），与开仓前读到的平仓腿不同。
   */
  readonly postOpenClose?: { readonly dynamicSpread: string; readonly balanceWasImproved: boolean; readonly executionPrice: string; readonly sizeDeltaInTokens: string };
}

/** CollateralProbe.fees 严格解析：字段缺失或非法一律抛错（#4：绝不把缺失当 0） */
export function requireProbeFees(probe: CollateralProbe): { readonly positionFee: bigint; readonly uiFee: bigint; readonly totalCost: bigint; readonly collateralPriceMin: bigint } {
  const fees = probe.fees;
  if (!fees) throw new Error(`探测 collateral=${probe.collateral}（${probe.outcome}）缺少 PositionFeesCollected 证据，无法推导链上杠杆`);
  const parse = (label: string, value: string): bigint => {
    if (!/^\d+$/.test(value)) throw new Error(`探测 collateral=${probe.collateral} 的 PositionFeesCollected.${label} 缺失或非法：'${value}'`);
    return BigInt(value);
  };
  const collateralPriceMin = parse('collateralTokenPrice.min', fees.collateralTokenPriceMin);
  if (collateralPriceMin <= 0n) throw new Error(`探测 collateral=${probe.collateral} 的 collateralTokenPrice.min 非正：${collateralPriceMin}`);
  return {
    positionFee: parse('positionFeeAmount', fees.positionFeeAmount),
    uiFee: parse('uiFeeAmount', fees.uiFeeAmount),
    totalCost: parse('totalCostAmount', fees.totalCostAmount),
    collateralPriceMin,
  };
}

export interface MinCollateralSearchResult {
  readonly sizeDeltaUsd: bigint;
  readonly isLong: boolean;
  readonly lowerCollateral: bigint;
  readonly upperCollateral: bigint;
  readonly minFeasibleCollateral: bigint;
  readonly lastInfeasibleCollateral: bigint;
  readonly lastInfeasibleReason: string;
  readonly lastInfeasibleReasonDecoded?: DecodedCancelReason;
  readonly minFeasibleProbe: CollateralProbe;
  readonly probes: CollateralProbe[];
  readonly probeCount: number;
  readonly oracleRefresh: Array<Record<string, unknown>>;
  /** 括号验证：初始区间与是否放宽过一次（#8） */
  readonly bracket: {
    readonly initialLower: bigint;
    readonly initialUpper: bigint;
    readonly lowerWidened: boolean;
    readonly upperWidened: boolean;
  };
}

async function probeCollateral(context: XtContext, input: { readonly isLong: boolean; readonly sizeDeltaUsd: bigint; readonly collateral: bigint }): Promise<CollateralProbe> {
  const adminUrl = requireValue(context.runtime.adminRpcUrl, '抵押探测需要 admin RPC（evm_snapshot/evm_revert）');
  const snapshot = await rawRpc(context.runtime, adminUrl, 'evm_snapshot');
  if (typeof snapshot !== 'string') throw new Error('evm_snapshot 未返回快照 ID');
  try {
    const created = await createMarketIncrease(context, input);
    const executed = await executeInline(context, created.key);
    const events = await readEvents(context, created.transaction.blockNumber, executed.blockNumber);
    const executedEvents = eventsForOrder(events, created.key, 'OrderExecuted');
    const cancelledEvents = eventsForOrder(events, created.key, 'OrderCancelled');
    const frozenEvents = eventsForOrder(events, created.key, 'OrderFrozen');
    if (executedEvents.length === 1 && cancelledEvents.length === 0) {
      const increase = eventsForOrder(events, created.key, 'PositionIncrease')[0];
      const fees = eventsForOrder(events, created.key, 'PositionFeesCollected')[0];
      if (!increase || !fees) {
        throw new Error(
          `抵押探测 collateral=${input.collateral} 已执行但事件不全：PositionIncrease=${increase ? 1 : 0}，PositionFeesCollected=${fees ? 1 : 0}`
          + `（区块 ${created.transaction.blockNumber}-${executed.blockNumber}，order=${created.key}）——不以 0 顶替费用/抵押价`,
        );
      }
      const text = (event: FxEvent | undefined, group: string, key: string): string => {
        const value = event ? eventItem(event, group, key) : undefined;
        return value === undefined ? '' : String(value);
      };
      if (text(fees, 'uintItems', 'collateralTokenPrice.min') === '' || text(fees, 'uintItems', 'positionFeeAmount') === '') {
        throw new Error(`抵押探测 collateral=${input.collateral} 的 PositionFeesCollected 缺 collateralTokenPrice.min / positionFeeAmount（order=${created.key}）`);
      }
      // 仓位已存在时的平仓腿读数（回滚前）：供 L_max 链上模型取平仓腿点差与 balanceWasImproved
      const sizeInUsdText = text(increase, 'uintItems', 'sizeInUsd');
      const sizeInTokensText = text(increase, 'uintItems', 'sizeInTokens');
      if (!/^\d+$/.test(sizeInUsdText) || !/^\d+$/.test(sizeInTokensText)) {
        throw new Error(`抵押探测 collateral=${input.collateral} 的 PositionIncrease 缺 sizeInUsd / sizeInTokens（order=${created.key}）`);
      }
      const [indexBand, collateralBand] = await Promise.all([
        readOraclePriceBand(context, context.indexOracle, context.indexToken, context.indexTokenDecimals),
        readOraclePriceBand(context, context.collateralOracle, context.collateralToken, context.collateralTokenDecimals),
      ]);
      const postOpenClose = await readExecutionPrice(context, {
        prices: { index: { min: indexBand.min, max: indexBand.max }, collateral: { min: collateralBand.min, max: collateralBand.max } },
        positionSizeInUsd: BigInt(sizeInUsdText),
        positionSizeInTokens: BigInt(sizeInTokensText),
        sizeDelta: -BigInt(sizeInUsdText),
        isLong: input.isLong,
      });
      return {
        collateral: input.collateral,
        outcome: 'executed',
        orderKey: created.key,
        createTxHash: created.transaction.hash,
        executeTxHash: executed.hash,
        position: {
          sizeInUsd: text(increase, 'uintItems', 'sizeInUsd'),
          sizeInTokens: text(increase, 'uintItems', 'sizeInTokens'),
          collateralAmount: text(increase, 'uintItems', 'collateralAmount'),
          executionPrice: text(increase, 'uintItems', 'executionPrice'),
        },
        fees: {
          positionFeeAmount: text(fees, 'uintItems', 'positionFeeAmount'),
          uiFeeAmount: text(fees, 'uintItems', 'uiFeeAmount'),
          totalCostAmount: text(fees, 'uintItems', 'totalCostAmount'),
          collateralTokenPriceMin: text(fees, 'uintItems', 'collateralTokenPrice.min'),
        },
        postOpenClose: {
          dynamicSpread: postOpenClose.dynamicSpread.toString(),
          balanceWasImproved: postOpenClose.balanceWasImproved,
          executionPrice: postOpenClose.executionPrice.toString(),
          sizeDeltaInTokens: postOpenClose.sizeDeltaInTokens.toString(),
        },
      };
    }
    if (cancelledEvents.length === 1 && executedEvents.length === 0) {
      const cancelled = cancelledEvents[0]!;
      const reason = eventItem(cancelled, 'stringItems', 'reason');
      const reasonBytes = eventItem(cancelled, 'bytesItems', 'reasonBytes');
      const decoded = decodeCancelReason(reasonBytes, typeof reason === 'string' ? reason : undefined);
      return {
        collateral: input.collateral,
        outcome: 'cancelled',
        orderKey: created.key,
        createTxHash: created.transaction.hash,
        executeTxHash: executed.hash,
        reason: typeof reason === 'string' ? reason : '',
        ...(typeof reasonBytes === 'string' ? { reasonBytes } : {}),
        reasonDecoded: decoded,
      };
    }
    throw new Error(
      `抵押探测 collateral=${input.collateral} 终态不可判定：OrderExecuted=${executedEvents.length}，OrderCancelled=${cancelledEvents.length}，OrderFrozen=${frozenEvents.length}`
      + `（区块 ${created.transaction.blockNumber}-${executed.blockNumber}，order=${created.key}）`,
    );
  } finally {
    const reverted = await rawRpc(context.runtime, adminUrl, 'evm_revert', [snapshot]);
    if (reverted !== true) throw new Error(`抵押探测 collateral=${input.collateral} 的 evm_revert 失败`);
  }
}

/**
 * 固定 size 下二分最小可成交抵押（USDC 原始单位）。
 * 前置：applyCaseTrader 已在任何 evm_snapshot 之前完成注资与 Router 授权（trader-roster.ts 硬性顺序约束）；
 * 本函数只在探测内部做快照/回滚，不做注资。
 * 括号约束：lower 必须 Cancelled、upper 必须 Executed；不成立时放宽一次（lower/2、upper×2）再验，仍不成立才报错。
 * 总探测次数（含括号与放宽）≤ maxProbes（默认 32）。
 */
export async function findMinCollateralForSize(
  runtime: RuntimeConfig,
  input: {
    readonly isLong: boolean;
    readonly sizeDeltaUsd: bigint;
    readonly lowerCollateral: bigint;
    readonly upperCollateral: bigint;
    readonly maxProbes?: number;
    /** 括号不成立时是否放宽一次（缺省 true） */
    readonly widenOnce?: boolean;
    readonly resolvedEnvironment?: ResolvedTestEnvironment;
  },
): Promise<MinCollateralSearchResult> {
  if (!runtime.adminRpcUrl) {
    throw new Error(`环境 ${runtime.environment} 未配置 admin RPC：findMinCollateralForSize 需要 evm_snapshot/evm_revert 逐探测回滚。`);
  }
  if (input.lowerCollateral <= 0n || input.upperCollateral <= input.lowerCollateral) {
    throw new Error(`抵押搜索区间非法：lower=${input.lowerCollateral}，upper=${input.upperCollateral}`);
  }
  const maxProbes = input.maxProbes ?? 32;
  const widenOnce = input.widenOnce ?? true;
  const needed = 2 + Math.ceil(Math.log2(Number(input.upperCollateral - input.lowerCollateral)));
  if (needed > maxProbes) {
    throw new Error(`抵押搜索区间 ${input.upperCollateral - input.lowerCollateral} raw 需要约 ${needed} 次探测（含括号 2 次），超过上限 ${maxProbes}；请收紧区间或显式提高 maxProbes。`);
  }
  const context = await buildContext(runtime, input.resolvedEnvironment);
  // 探测前刷新 Mock Oracle 时间戳（价格不变）：fork 闲置后价格年龄超过 heartbeat 会让 executeOrder 预执行 revert。
  const adminFrom = runtime.adminAccount ?? runtime.testAccount;
  if (!adminFrom) throw new Error('刷新 Mock Oracle 时间戳需要 E2E_ADMIN_ACCOUNT 或 E2E_TEST_ACCOUNT');
  const adminRpcUrl = runtime.adminRpcUrl;
  const oracleRefresh: Array<Record<string, unknown>> = [];
  for (const oracle of [{ role: 'index', address: context.indexOracle }, { role: 'collateral', address: context.collateralOracle }]) {
    const state = await guarded(runtime, `读取 ${oracle.role} Mock Oracle 状态`, () => readMockOracleState(runtime.rpcUrl, oracle.address, runtime.requestTimeoutMs));
    const receipt = await guarded(runtime, `刷新 ${oracle.role} Mock Oracle 时间戳`, () => sendSetMockPrice({
      adminRpcUrl,
      from: adminFrom,
      oracle: oracle.address,
      priceRaw: state.answer,
      timestamp: freshOracleTimestamp(state.latestBlockTimestamp),
    }));
    oracleRefresh.push({ role: oracle.role, oracle: oracle.address, priceRaw: state.answer.toString(), txHash: receipt.txHash, status: receipt.status });
    if (receipt.status !== 'success') throw new Error(`刷新 ${oracle.role} Mock Oracle 时间戳失败：${receipt.txHash}`);
  }

  const probes: CollateralProbe[] = [];
  const probe = async (collateral: bigint): Promise<CollateralProbe> => {
    if (probes.length >= maxProbes) throw new Error(`抵押探测次数超过上限 ${maxProbes}`);
    const result = await probeCollateral(context, { isLong: input.isLong, sizeDeltaUsd: input.sizeDeltaUsd, collateral });
    probes.push(result);
    return result;
  };

  // 括号验证：lower 必须 Cancel、upper 必须 Execute；各自最多放宽一次
  let low = input.lowerCollateral;
  let high = input.upperCollateral;
  let lowerWidened = false;
  let upperWidened = false;
  let lowProbe = await probe(low);
  if (lowProbe.outcome !== 'cancelled') {
    if (!widenOnce) throw new Error(`抵押搜索下界 ${low} 已可成交，区间不构成括号（lower 应为不可成交）；请下调 lower。`);
    const widened = low / 2n > 0n ? low / 2n : 1n;
    lowerWidened = true;
    lowProbe = await probe(widened);
    if (lowProbe.outcome !== 'cancelled') {
      throw new Error(`抵押搜索下界 ${low} 与放宽后的 ${widened} 均已可成交，区间不构成括号（lower 应为不可成交）；链上闸门估计值明显偏高，请核对参数。`);
    }
    low = widened;
  }
  let highProbe = await probe(high);
  if (highProbe.outcome !== 'executed') {
    const reasonText = (item: CollateralProbe): string => item.reasonDecoded?.errorName ?? item.reason ?? '未知';
    if (!widenOnce) throw new Error(`抵押搜索上界 ${high} 仍被取消（${reasonText(highProbe)}），区间不构成括号；请上调 upper。`);
    const widened = high * 2n;
    upperWidened = true;
    const firstReason = reasonText(highProbe);
    highProbe = await probe(widened);
    if (highProbe.outcome !== 'executed') {
      throw new Error(`抵押搜索上界 ${high}（${firstReason}）与放宽后的 ${widened}（${reasonText(highProbe)}）均被取消，区间不构成括号；链上闸门估计值明显偏低，请核对参数。`);
    }
    high = widened;
  }
  const bracket = { initialLower: input.lowerCollateral, initialUpper: input.upperCollateral, lowerWidened, upperWidened };
  while (high - low > 1n) {
    const middle = (low + high) / 2n;
    const result = await probe(middle);
    if (result.outcome === 'executed') {
      high = middle;
      highProbe = result;
    } else {
      low = middle;
      lowProbe = result;
    }
  }
  return {
    sizeDeltaUsd: input.sizeDeltaUsd,
    isLong: input.isLong,
    lowerCollateral: bracket.lowerWidened ? (input.lowerCollateral / 2n > 0n ? input.lowerCollateral / 2n : 1n) : input.lowerCollateral,
    upperCollateral: bracket.upperWidened ? input.upperCollateral * 2n : input.upperCollateral,
    minFeasibleCollateral: high,
    lastInfeasibleCollateral: low,
    lastInfeasibleReason: lowProbe.reason ?? '',
    ...(lowProbe.reasonDecoded ? { lastInfeasibleReasonDecoded: lowProbe.reasonDecoded } : {}),
    minFeasibleProbe: highProbe,
    probes,
    probeCount: probes.length,
    oracleRefresh,
    bracket,
  };
}

// ---------------------------------------------------------------------------
// 原子：市价开仓 → 立即市价全平（runMarketFlow）+ 本行核对点
// ---------------------------------------------------------------------------

interface DecodedEventLike {
  readonly blockNumber?: number;
  readonly txHash?: string;
  readonly eventName?: string;
  readonly uint?: Record<string, bigint>;
  readonly int?: Record<string, bigint>;
  readonly bool?: Record<string, boolean>;
  readonly bytes32?: Record<string, string>;
}

function legEvent(events: unknown, name: string): DecodedEventLike | undefined {
  if (!events || typeof events !== 'object') return undefined;
  const value = (events as Record<string, unknown>)[name];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as DecodedEventLike : undefined;
}

export interface MarketOpenAtomInput {
  readonly id: XtMktCaseId;
  readonly isLong: boolean;
  /** 开仓规模（USD 1e30）；缺省 runner 默认 50e30 */
  readonly sizeDeltaUsd?: bigint;
  /** 开仓抵押（USDC 原始单位）；缺省 runner 默认 10e6 */
  readonly collateral?: bigint;
  /** 杠杆边界说明（落证据 data.expectedLeverageNote，不参与断言） */
  readonly expectedLeverageNote?: string;
  readonly resolvedEnvironment?: ResolvedTestEnvironment;
}

export interface MarketOpenAtomResult extends CaseEvidence {
  readonly id: XtMktCaseId;
  readonly evidence: Scn009Evidence;
  readonly evidenceV2: EvidenceEnvelope;
  readonly reconciliationReport: ReconciliationReport;
}

function check(checks: CaseCheck[], name: string, passed: boolean, actual: unknown, expected: unknown, note?: string): void {
  checks.push({ name, passed, actual: stringifyBigint(actual), expected: stringifyBigint(expected), ...(note ? { note } : {}) });
}

/** 账户挂单数：DataStore.getBytes32Count(accountOrderListKey(account))，accountOrderListKey = keccak256(ACCOUNT_ORDER_LIST ‖ bytes32(account)) */
export function accountOrderListKey(account: string): Hex {
  const base = keccak256(encodeAbiParameters(parseAbiParameters('string'), ['ACCOUNT_ORDER_LIST']));
  const accountWord = `0x${getAddress(account).slice(2).toLowerCase().padStart(64, '0')}` as Hex;
  return keccak256(`0x${base.slice(2)}${accountWord.slice(2)}` as Hex);
}

/** 账户仓位列表：accountPositionListKey = keccak256(ACCOUNT_POSITION_LIST ‖ bytes32(account))（FX100Keys.sol 同构） */
export function accountPositionListKey(account: string): Hex {
  const base = keccak256(encodeAbiParameters(parseAbiParameters('string'), ['ACCOUNT_POSITION_LIST']));
  const accountWord = `0x${getAddress(account).slice(2).toLowerCase().padStart(64, '0')}` as Hex;
  return keccak256(`0x${base.slice(2)}${accountWord.slice(2)}` as Hex);
}

export async function runMarketOpenAtom(runtime: RuntimeConfig, input: MarketOpenAtomInput): Promise<MarketOpenAtomResult> {
  const resolvedEnvironment = input.resolvedEnvironment ?? resolveRuntimeTestEnvironment(runtime, {
    marketMode: 'mock-market',
    oracleMode: 'mock-oracle',
    timeMode: runtime.environment === 'time-fork' ? 'controllable-time' : 'normal-block-time',
    signingMode: 'trader-keeper-private-key',
    mockResourceAlias: runtime.definition.defaultMockResourceAlias ?? 'default-mock',
  });
  const sizeDeltaUsd = input.sizeDeltaUsd ?? MARKET_FLOW_DEFAULTS.sizeUsd;
  const collateral = input.collateral ?? MARKET_FLOW_DEFAULTS.collateral;
  const evidence = await guarded(runtime, `${input.id} runMarketFlow（开仓→全平）`, () => runMarketFlow(runtime, {
    scenarioId: input.id,
    isLong: input.isLong,
    resolvedEnvironment,
    priceMovePercent: 0,
    ...(input.sizeDeltaUsd !== undefined ? { openSizeDeltaUsd: input.sizeDeltaUsd } : {}),
    ...(input.collateral !== undefined ? { openCollateral: input.collateral } : {}),
  }));
  const checks: CaseCheck[] = [];
  const data: Record<string, unknown> = {
    entry: 'RPC（私钥签名 createOrder + Inline Keeper 执行）',
    layer: '合约层',
    isLong: input.isLong,
    sizeDeltaUsd: sizeDeltaUsd.toString(),
    sizeUsdText: formatUnits(sizeDeltaUsd, 30),
    collateral: collateral.toString(),
    collateralUsdcText: formatUnits(collateral, 6),
    trader: runtime.testAccount,
    marketIndex: evidence.environment.marketIndex,
    indexTokenDecimals: evidence.environment.indexTokenDecimals ?? 18,
    ...(input.expectedLeverageNote ? { expectedLeverageNote: input.expectedLeverageNote } : {}),
  };

  const openExecuted = evidence.transactions.executeOpen as { event?: DecodedEventLike } | undefined;
  const orderExecuted = openExecuted?.event;
  const positionIncrease = legEvent(evidence.events.open, 'PositionIncrease');
  const feesCollected = legEvent(evidence.events.open, 'feesCollected');
  const afterOpenPosition = evidence.snapshots.afterOpen.values.position;

  check(checks, '开仓 OrderExecuted 事件存在且 orderKey 一致', orderExecuted !== undefined && (orderExecuted.bytes32?.key ?? orderExecuted.bytes32?.orderKey)?.toLowerCase() === String((evidence.transactions.createOpen as { orderKey?: string }).orderKey ?? '').toLowerCase(),
    orderExecuted?.bytes32?.key ?? orderExecuted?.bytes32?.orderKey, (evidence.transactions.createOpen as { orderKey?: string }).orderKey);
  check(checks, 'PositionIncrease.orderType = 0（MarketIncrease）', positionIncrease?.uint?.orderType === 0n, positionIncrease?.uint?.orderType, 0n);
  check(checks, `PositionIncrease.isLong = ${input.isLong}`, positionIncrease?.bool?.isLong === input.isLong, positionIncrease?.bool?.isLong, input.isLong);
  check(checks, `开仓后仓位方向 = ${input.isLong ? 'long' : 'short'}`, afterOpenPosition?.exists === true && afterOpenPosition.isLong === input.isLong, afterOpenPosition?.isLong, input.isLong);
  check(checks, '开仓后 sizeInUsd = sizeDeltaUsd', afterOpenPosition?.sizeInUsd === sizeDeltaUsd, afterOpenPosition?.sizeInUsd, sizeDeltaUsd);
  check(checks, 'PositionIncrease.sizeDeltaUsd = 订单 sizeDeltaUsd', positionIncrease?.uint?.sizeDeltaUsd === sizeDeltaUsd, positionIncrease?.uint?.sizeDeltaUsd, sizeDeltaUsd);

  const positionFeeAmount = feesCollected?.uint?.positionFeeAmount;
  const uiFeeAmount = feesCollected?.uint?.uiFeeAmount ?? 0n;
  const totalCostAmount = feesCollected?.uint?.totalCostAmount;
  const positiveFunding = feesCollected?.uint?.positiveFundingFeeAmount ?? 0n;
  const negativeFunding = feesCollected?.uint?.negativeFundingFeeAmount ?? 0n;
  const collateralPriceMin = feesCollected?.uint?.['collateralTokenPrice.min'];
  const positionFeeFactor = feesCollected?.uint?.positionFeeFactor;
  check(checks, 'PositionFeesCollected 事件存在（本单）', feesCollected !== undefined && positionFeeAmount !== undefined && totalCostAmount !== undefined, feesCollected !== undefined, true);
  check(checks, 'uiFee = 0（uiFeeReceiver 为零地址）', uiFeeAmount === 0n, uiFeeAmount, 0n);
  const expectedCollateralAmount = positionFeeAmount !== undefined ? collateral - positionFeeAmount - uiFeeAmount : undefined;
  const expectedCollateralAmountExact = totalCostAmount !== undefined ? collateral - totalCostAmount + positiveFunding : undefined;
  check(checks, '开仓后 collateralAmount = 抵押 − positionFeeAmount − uiFee',
    afterOpenPosition !== undefined && expectedCollateralAmount !== undefined && afterOpenPosition.collateralAmount === expectedCollateralAmount,
    afterOpenPosition?.collateralAmount, expectedCollateralAmount,
    `IncreasePositionUtils：collateralDelta = 转入 − totalCostAmount + positiveFunding；本单 totalCost=${totalCostAmount ?? '?'}，negFunding=${negativeFunding}，posFunding=${positiveFunding}，精确式期望=${expectedCollateralAmountExact ?? '?'}`);
  if (positionFeeFactor !== undefined && collateralPriceMin !== undefined && collateralPriceMin > 0n) {
    const expectedFee = sizeDeltaUsd * positionFeeFactor / FLOAT_PRECISION / collateralPriceMin;
    check(checks, 'positionFeeAmount = applyFactor(size, POSITION_FEE_FACTOR) / collateralPrice.min（向下取整）', positionFeeAmount === expectedFee, positionFeeAmount, expectedFee,
      `factor=${positionFeeFactor}，collateralPrice.min=${collateralPriceMin}`);
  }

  // 无 TP/SL 子单：开仓执行块上账户挂单数应回到流程开始前的水平（开仓单已离队，全平单尚未创建）。
  // 用差值而不是绝对值 0：共享 trader（非 per-case）可能带着别的批次遗留的挂单进来，那是环境状态问题，不是本单生成了子单；
  // 遗留挂单的 key 记入证据（preExistingPendingOrders）供环境侧清理。
  const context = await buildContext(runtime, resolvedEnvironment);
  const trader = getAddress(requireValue(runtime.testAccount, '缺少 E2E_TEST_ACCOUNT'));
  const readOrderCount = (blockNumber: number | string) => guarded(runtime, `DataStore.getBytes32Count(accountOrderList)@${blockNumber}`, () => context.publicClient.readContract({
    address: context.dataStore,
    abi: dataStoreAbi,
    functionName: 'getBytes32Count',
    args: [accountOrderListKey(trader)],
    blockNumber: BigInt(blockNumber),
  }));
  const [orderCountBefore, orderCount] = await Promise.all([
    readOrderCount(evidence.snapshots.before.blockNumber),
    readOrderCount(evidence.snapshots.afterOpen.blockNumber),
  ]);
  const preExistingPendingOrders: Hex[] = orderCountBefore > 0n
    ? [...await guarded(runtime, 'DataStore.getBytes32ValuesAt(accountOrderList)', () => context.publicClient.readContract({
      address: context.dataStore,
      abi: dataStoreAbi,
      functionName: 'getBytes32ValuesAt',
      args: [accountOrderListKey(trader), 0n, orderCountBefore],
      blockNumber: BigInt(evidence.snapshots.before.blockNumber),
    }))]
    : [];
  check(checks, '开仓执行后账户挂单数 = 流程前挂单数（本单未生成 TP/SL 子单）', orderCount === orderCountBefore,
    `before=${orderCountBefore}，afterOpen=${orderCount}`, `afterOpen == before`,
    `block before=${evidence.snapshots.before.blockNumber}，afterOpen=${evidence.snapshots.afterOpen.blockNumber}`
    + (orderCountBefore > 0n ? `；⚠ trader ${trader} 进入流程前已有 ${orderCountBefore} 笔遗留挂单（${preExistingPendingOrders.join(', ')}），属环境状态问题，需清理` : ''));

  // (a) OrderCreated.acceptablePrice 哨兵：开多 type(uint256).max / 开空 0（RPC 入口放开 acceptablePrice，OrderEventUtils.createEventData uint 项）
  const createOpen = evidence.transactions.createOpen as { orderKey?: string; blockNumber?: number } | undefined;
  const createOpenBlock = createOpen?.blockNumber !== undefined ? BigInt(createOpen.blockNumber) : undefined;
  const openOrderKey = typeof createOpen?.orderKey === 'string' ? createOpen.orderKey as Hex : undefined;
  const orderCreated = createOpenBlock !== undefined && openOrderKey !== undefined
    ? eventsForOrder(await readEvents(context, createOpenBlock, createOpenBlock), openOrderKey, 'OrderCreated')[0]
    : undefined;
  const acceptablePrice = orderCreated ? eventItem(orderCreated, 'uintItems', 'acceptablePrice') : undefined;
  const expectedAcceptablePrice = input.isLong ? MAX_UINT256 : 0n;
  check(checks, `OrderCreated.acceptablePrice = ${input.isLong ? 'type(uint256).max（开多哨兵）' : '0（开空哨兵）'}`,
    typeof acceptablePrice === 'bigint' && acceptablePrice === expectedAcceptablePrice,
    orderCreated ? acceptablePrice : `OrderCreated 缺失（block=${createOpenBlock ?? '?'}，key=${openOrderKey ?? '?'}）`, expectedAcceptablePrice,
    'BaseOrderUtils.getExecutionPriceForIncrease：多头 acceptablePrice 为上限、空头为下限，哨兵值即不设价格保护');

  // (b) 立即全平的 PositionDecrease.basePnlUsd ≤ 0（价格未动，仅点差/价带损耗）
  const positionDecrease = legEvent(evidence.events.close, 'PositionDecrease');
  const closeFees = legEvent(evidence.events.close, 'feesCollected');
  const basePnlUsd = positionDecrease?.int?.basePnlUsd;
  check(checks, '全平 PositionDecrease.basePnlUsd ≤ 0（价格未动：点差/价带损耗）', basePnlUsd !== undefined && basePnlUsd <= 0n,
    basePnlUsd === undefined ? 'PositionDecrease.basePnlUsd 缺失' : basePnlUsd, '≤ 0',
    positionDecrease ? `executionPrice=${positionDecrease.uint?.executionPrice ?? '?'}，dynamicSpread=${positionDecrease.int?.dynamicSpread ?? '?'}` : 'events.close.PositionDecrease 缺失');

  // (c) trader USDC Δ = −C + 全平 output（DecreasePositionCollateralUtils.processCollateral 瀑布重放：decreaseWaterfall）
  //   pnlInCollateral：正 pnl = floor(pnl / collateralPrice.max)（L115）；负 pnl = ceil(|pnl| / collateralPrice.min)（payForCost roundUpDivision）
  const traderUsdcDelta = evidence.observations.traderUsdcDelta;
  const closePriceMin = positionDecrease?.uint?.['collateralTokenPrice.min'];
  const closePriceMax = positionDecrease?.uint?.['collateralTokenPrice.max'];
  const closePositionFee = closeFees?.uint?.positionFeeAmount;
  const closeTotalCost = closeFees?.uint?.totalCostAmount;
  const closePositiveFunding = closeFees?.uint?.positiveFundingFeeAmount ?? 0n;
  const closeNegativeFunding = closeFees?.uint?.negativeFundingFeeAmount ?? 0n;
  const usdcDeltaInputsMissing: string[] = [];
  if (typeof traderUsdcDelta !== 'bigint') usdcDeltaInputsMissing.push('observations.traderUsdcDelta');
  if (basePnlUsd === undefined) usdcDeltaInputsMissing.push('PositionDecrease.basePnlUsd');
  if (closePriceMin === undefined || closePriceMin <= 0n) usdcDeltaInputsMissing.push('PositionDecrease.collateralTokenPrice.min');
  if (closePriceMax === undefined || closePriceMax <= 0n) usdcDeltaInputsMissing.push('PositionDecrease.collateralTokenPrice.max');
  if (closePositionFee === undefined || closeTotalCost === undefined) usdcDeltaInputsMissing.push('全平 PositionFeesCollected.positionFeeAmount/totalCostAmount');
  if (positionFeeAmount === undefined) usdcDeltaInputsMissing.push('开仓 PositionFeesCollected.positionFeeAmount');
  if (afterOpenPosition?.collateralAmount === undefined) usdcDeltaInputsMissing.push('afterOpen.position.collateralAmount');
  if (usdcDeltaInputsMissing.length === 0
    && typeof traderUsdcDelta === 'bigint' && basePnlUsd !== undefined && closePriceMin !== undefined && closePriceMax !== undefined
    && closePositionFee !== undefined && closeTotalCost !== undefined && positionFeeAmount !== undefined && afterOpenPosition?.collateralAmount !== undefined) {
    const positivePnlUsdc = basePnlUsd > 0n ? basePnlUsd / closePriceMax : 0n;
    const negativePnlUsdc = basePnlUsd < 0n ? ceilDiv(-basePnlUsd, closePriceMin) : 0n;
    const waterfall = decreaseWaterfall({
      oldMargin: afterOpenPosition.collateralAmount,
      positiveFunding: closePositiveFunding,
      negativeFunding: closeNegativeFunding,
      positivePnlUsdc,
      negativePnlUsdc,
      costExcludingFunding: closeTotalCost - closeNegativeFunding,
      fullClose: true,
      requestedWithdrawal: 0n,
    });
    const expectedDelta = waterfall.output - collateral;
    const pnlInCollateral = positivePnlUsdc - negativePnlUsdc;
    const simplifiedDelta = -(positionFeeAmount + closePositionFee) + pnlInCollateral;
    const diff = traderUsdcDelta - expectedDelta;
    const absDiff = diff < 0n ? -diff : diff;
    check(checks, 'trader USDC Δ = −(开仓费 + 平仓费) + pnlInCollateral（瀑布重放，|Δ| ≤ 1 raw）', absDiff <= 1n,
      { traderUsdcDelta, expectedDelta, diff, simplifiedDelta }, { expectedDelta, tolerance: 1n },
      `basePnlUsd=${basePnlUsd}，collateralPrice.min=${closePriceMin}，max=${closePriceMax}，正pnl→floor(pnl/max)=${positivePnlUsdc}，负pnl→ceil(|pnl|/min)=${negativePnlUsdc}，`
      + `开仓费=${positionFeeAmount}，平仓费=${closePositionFee}，平仓 totalCost=${closeTotalCost}（excl funding=${closeTotalCost - closeNegativeFunding}），`
      + `funding +${closePositiveFunding}/−${closeNegativeFunding}，afterOpen.collateral=${afterOpenPosition.collateralAmount}；${waterfall.expanded}；`
      + `简化式 −(fee_open+fee_close)+pnl = ${simplifiedDelta}（与瀑布差 ${expectedDelta - simplifiedDelta} = uiFee/借贷费/funding 项）`);
    data.closeSettlement = stringifyBigint({
      basePnlUsd, positivePnlUsdc, negativePnlUsdc, pnlInCollateral, closePositionFee, closeTotalCost, closePositiveFunding, closeNegativeFunding,
      waterfallOutput: waterfall.output, expectedTraderUsdcDelta: expectedDelta, actualTraderUsdcDelta: traderUsdcDelta, simplifiedDelta,
    });
  } else {
    check(checks, 'trader USDC Δ = −(开仓费 + 平仓费) + pnlInCollateral（瀑布重放，|Δ| ≤ 1 raw）', false,
      `核对输入缺失：${usdcDeltaInputsMissing.join('，')}`, '输入齐全并 |Δ| ≤ 1 raw', '缺输入不以 0 顶替，按 FAIL 记');
  }

  const oiKey = input.isLong ? 'cumulativeOpenCostsLong' : 'cumulativeOpenCostsShort';
  const oiDelta = evidence.deltas.executeOpen[oiKey];
  check(checks, `OI(${input.isLong ? 'long' : 'short'}) Δ = sizeDeltaUsd（CUMULATIVE_OPEN_COSTS）`, oiDelta === sizeDeltaUsd, oiDelta, sizeDeltaUsd);
  const oiTokensKey = input.isLong ? 'openInterestInTokensLong' : 'openInterestInTokensShort';
  const oiTokensDelta = evidence.deltas.executeOpen[oiTokensKey];
  check(checks, 'OPEN_INTEREST_IN_TOKENS Δ = PositionIncrease.sizeDeltaInTokens', oiTokensDelta !== null && oiTokensDelta === positionIncrease?.uint?.sizeDeltaInTokens, oiTokensDelta, positionIncrease?.uint?.sizeDeltaInTokens);

  // 引用 runner 断言（不重复实现）：执行价不利侧、七组守恒、签名/回执
  const adverseName = input.isLong ? '开多执行价使用 ask/不利侧（executionPrice ≥ oracle max）' : '开空执行价使用 bid/不利侧（executionPrice ≤ oracle min）';
  const adverse = evidence.assertions.find((item) => item.name === adverseName);
  check(checks, `runner 断言引用：${adverseName}`, adverse?.passed === true, adverse ? `${String(adverse.actual)}（passed=${adverse.passed}）` : '断言缺失', 'passed=true');
  const conservationNames = ['createOpen', 'executeOpen', 'createClose', 'executeClose', 'open', 'close', 'wholeFlow'] as const;
  const conservation = conservationNames.map((stage) => {
    const value = evidence.observations[`${stage}Conservation`] as { status?: string; sum?: bigint | null } | undefined;
    return `${stage}=${value?.status ?? '缺失'}`;
  });
  check(checks, 'runner 断言引用：五方守恒 ΣΔ = 0（七组 PASS）',
    conservationNames.every((stage) => (evidence.observations[`${stage}Conservation`] as { status?: string } | undefined)?.status === 'PASS'),
    conservation.join('，'), '全部 PASS');
  const failedRunner = evidence.assertions.filter((item) => !item.passed);
  check(checks, `runner 链上断言全部通过（${evidence.assertions.length} 项）`, failedRunner.length === 0, failedRunner.map((item) => item.name), []);
  check(checks, '全平后仓位已移除（原子收口）', !evidence.snapshots.afterClose.values.position?.exists, Boolean(evidence.snapshots.afterClose.values.position?.exists), false);

  // 杠杆观测：毛杠杆 = size / collateral；费后杠杆 = size / (collateral − positionFee)（USDC raw 记 1 USD）；USD 口径按 collateralPrice.min
  const collateralAfterFee = positionFeeAmount !== undefined ? collateral - positionFeeAmount - uiFeeAmount : undefined;
  data.leverage = {
    grossX: formatRatio(sizeDeltaUsd * USDC_PRECISION, collateral * FLOAT_PRECISION),
    ...(collateralAfterFee !== undefined && collateralAfterFee > 0n
      ? { netOfFeeX: formatRatio(sizeDeltaUsd * USDC_PRECISION, collateralAfterFee * FLOAT_PRECISION) }
      : {}),
    ...(collateralAfterFee !== undefined && collateralAfterFee > 0n && collateralPriceMin !== undefined && collateralPriceMin > 0n
      ? { netOfFeeUsdX: formatRatio(sizeDeltaUsd, collateralAfterFee * collateralPriceMin) }
      : {}),
    positionFeeAmount: positionFeeAmount?.toString(),
    uiFeeAmount: uiFeeAmount.toString(),
    collateralAfterFee: collateralAfterFee?.toString(),
    collateralPriceMin: collateralPriceMin?.toString(),
  };
  data.openExecution = {
    executionPrice: positionIncrease?.uint?.executionPrice?.toString(),
    indexPriceMax: positionIncrease?.uint?.['indexTokenPrice.max']?.toString(),
    indexPriceMin: positionIncrease?.uint?.['indexTokenPrice.min']?.toString(),
    dynamicSpread: positionIncrease?.int?.dynamicSpread?.toString(),
    sizeDeltaInTokens: positionIncrease?.uint?.sizeDeltaInTokens?.toString(),
    orderKey: (evidence.transactions.createOpen as { orderKey?: string }).orderKey,
    createTxHash: (evidence.transactions.createOpen as { txHash?: string }).txHash,
    executeTxHash: orderExecuted?.txHash,
    accountOrderCountAfterOpen: orderCount.toString(),
    accountOrderCountBefore: orderCountBefore.toString(),
    preExistingPendingOrders,
  };
  data.runnerAssertionCount = evidence.assertions.length;
  data.traderUsdcDelta = String(evidence.observations.traderUsdcDelta);

  const evidenceV2 = adaptMarketFlowV1({ id: input.id, data, evidence }, {
    executionId: `${input.id}-${Date.now()}`,
    variantId: `${input.isLong ? 'long' : 'short'}-market-${formatUnits(sizeDeltaUsd, 30)}usd-${formatUnits(collateral, 6)}usdc`,
    environment: buildRuntimeEnvironmentIdentity(runtime, resolvedEnvironment, {
      marketIndex: Number(context.marketIndex),
    }),
  });
  const reconciliationReport = reconcileMarketOpenRoundtrip(evidenceV2);
  return { id: input.id, title: XT_MKT_TITLES[input.id], checks, data, evidence, evidenceV2, reconciliationReport };
}

// ---------------------------------------------------------------------------
// L_max 组合：参数 → 公式 → 二分 → 核对 → 原子
// ---------------------------------------------------------------------------

export interface MaxLeverageCaseInput {
  readonly id: 'XT-MKT-LEV-005' | 'XT-MKT-LEV-006';
  readonly isLong: boolean;
  readonly sizeDeltaUsd: bigint;
  /** |chainMax − formula| 容差（倍数），缺省 0.05 */
  readonly toleranceX?: number;
  readonly maxProbes?: number;
  readonly resolvedEnvironment?: ResolvedTestEnvironment;
}

export interface MaxLeverageCaseResult extends CaseEvidence {
  readonly id: 'XT-MKT-LEV-005' | 'XT-MKT-LEV-006';
  readonly params: LeverageParams;
  readonly expected: ExpectedMaxLeverage;
  readonly search: MinCollateralSearchResult;
  readonly atom: MarketOpenAtomResult;
}

function toX(value: number): string {
  return value.toFixed(4);
}

export async function runMaxLeverageCase(runtime: RuntimeConfig, input: MaxLeverageCaseInput): Promise<MaxLeverageCaseResult> {
  const S = input.sizeDeltaUsd;
  const tolerance = input.toleranceX ?? 0.05;
  const params = await readLeverageParams(runtime, {
    isLong: input.isLong,
    sizeDeltaUsd: S,
    ...(input.resolvedEnvironment ? { resolvedEnvironment: input.resolvedEnvironment } : {}),
  });
  if (params.minPositionSizeUsd > 0n && S < params.minPositionSizeUsd) {
    throw new Error(`size ${S} 低于 MIN_POSITION_SIZE_USD ${params.minPositionSizeUsd}`);
  }
  const expected = expectedMaxLeverage(leverageFormulaInputs(params));
  if (expected.chainModelX === undefined || expected.pnlLossFactor === undefined) {
    throw new Error('含价带的链上模型缺失（readLeverageParams 应给出 indexPrice.min/max）');
  }
  // 搜索区间（#8）：围绕开仓前口径的链上模型估计值 S × chainFactor / 1e30 / collateralPrice.min 取 [×0.9, ×1.5]
  const bounds = collateralSearchBounds({ sizeDeltaUsd: S, chainFactor: expected.chainFactor, collateralPriceMin: params.collateralPrice.min });
  const collateralFormula = collateralRawForLeverage(S, expected.uiCapX);
  const search = await findMinCollateralForSize(runtime, {
    isLong: input.isLong,
    sizeDeltaUsd: S,
    lowerCollateral: bounds.lower,
    upperCollateral: bounds.upper,
    ...(input.maxProbes !== undefined ? { maxProbes: input.maxProbes } : {}),
    ...(input.resolvedEnvironment ? { resolvedEnvironment: input.resolvedEnvironment } : {}),
  });

  const checks: CaseCheck[] = [];
  const minProbe = search.minFeasibleProbe;
  if (minProbe.outcome !== 'executed') throw new Error(`minFeasibleProbe 终态应为 executed，实际 ${minProbe.outcome}`);
  const minFees = requireProbeFees(minProbe);
  // 链上闸门模型（核对口径）：平仓腿取 minFeasible 探测内仓位已存在时的 Reader 读数（点差 + balanceWasImproved → 分腿费率键）。
  // 开仓前读到的平仓腿（params.closeSpread / closeBalanceWasImproved）只用于搜索区间估计；空市场上两者符号相反。
  const postOpenClose = minProbe.postOpenClose;
  if (!postOpenClose || !/^-?\d+$/.test(postOpenClose.dynamicSpread)) {
    throw new Error(`minFeasible 探测（collateral=${minProbe.collateral}）缺少仓位建立后的平仓腿 Reader 读数，无法核对链上模型`);
  }
  const expectedChain = expectedMaxLeverage({
    ...leverageFormulaInputs(params),
    closeSpread: BigInt(postOpenClose.dynamicSpread),
    chainFeeClose: chainLegFeeFactor(params, postOpenClose.balanceWasImproved),
  });
  if (expectedChain.chainModelX === undefined || expectedChain.pnlLossFactor === undefined) {
    throw new Error('仓位建立后口径的链上模型缺失');
  }
  const chainModelX = expectedChain.chainModelX;
  const closeLegNote = `平仓腿按仓位建立后读数：s_close=${postOpenClose.dynamicSpread}（清算规则钳 ≥0），balanceWasImproved=${postOpenClose.balanceWasImproved}`
    + `→ f_close=${chainLegFeeFactor(params, postOpenClose.balanceWasImproved)}；开仓前估计 s_close=${params.closeSpread}，improved=${params.closeBalanceWasImproved}`;
  const positionFee = minFees.positionFee;
  const uiFee = minFees.uiFee;
  const collateralPriceMin = minFees.collateralPriceMin;
  const netCollateral = search.minFeasibleCollateral - positionFee - uiFee;
  // 链上最大杠杆（核对口径）：毛抵押 USD 口径 chainMaxGrossX = S / (minFeasible × collateralPrice.min)——前端公式作用于提交的毛抵押 C_gross。
  // 观测口径：raw（1 raw 记 1e-6 USD）与费后净抵押 USD。
  const chainMaxGrossBps = S * BPS / (search.minFeasibleCollateral * collateralPriceMin);
  const chainMaxGrossRawBps = S * USDC_PRECISION * BPS / (search.minFeasibleCollateral * FLOAT_PRECISION);
  const chainMaxNetBps = netCollateral > 0n ? S * BPS / (netCollateral * collateralPriceMin) : 0n;
  const chainMaxGrossX = Number(chainMaxGrossBps) / 10_000;
  const chainMaxGrossRawX = Number(chainMaxGrossRawBps) / 10_000;
  const chainMaxNetX = Number(chainMaxNetBps) / 10_000;
  const bandFactorText = expectedChain.oracleBandFactor !== undefined ? formatRatio(expectedChain.oracleBandFactor, FLOAT_PRECISION, 8) : '0';
  const lossFactorText = formatRatio(expectedChain.pnlLossFactor, FLOAT_PRECISION, 8);

  // (i) min−1 取消（杠杆/最低抵押闸门）
  const decoded = search.lastInfeasibleReasonDecoded;
  check(checks, 'minFeasible − 1 被 OrderCancelled 且原因为杠杆/最低抵押闸门（LiquidatablePosition / InsufficientCollateralUsd）',
    decoded?.leverageGate === true,
    { collateral: search.lastInfeasibleCollateral, errorName: decoded?.errorName, selector: decoded?.selector, reason: search.lastInfeasibleReason, arguments: decoded?.arguments },
    'LiquidatablePosition(reason="min collateral for leverage", …) 或 InsufficientCollateralUsd',
    `minFeasible=${search.minFeasibleCollateral} raw（${formatUnits(search.minFeasibleCollateral, 6)} USDC）成交，${search.lastInfeasibleCollateral} raw 取消；探测 ${search.probeCount} 次`);

  // (ii) ≤ 理论上限
  check(checks, `chainMaxGrossX ≤ 理论上限 1/minCF（${toX(expected.theoreticalX)}x）`, chainMaxGrossX <= expected.theoreticalX + 1e-9, toX(chainMaxGrossX), `≤ ${toX(expected.theoreticalX)}`,
    `chainMaxGross(USD)=${toX(chainMaxGrossX)}x，raw 口径=${toX(chainMaxGrossRawX)}x，费后净口径=${toX(chainMaxNetX)}x，netCollateral=${netCollateral} raw`);

  // (iii-a) 链上实测 vs 含价带链上模型（验证链上闸门含价带项；必须 PASS）
  const modelDelta = Math.abs(chainMaxGrossX - chainModelX);
  check(checks, `|chainMaxGrossX − 含价带链上模型 chainModelX| ≤ ${tolerance}x`, modelDelta <= tolerance,
    `chainMaxGross=${toX(chainMaxGrossX)}x，chainModel=${toX(chainModelX)}x，|Δ|=${toX(modelDelta)}x`, `|Δ| ≤ ${tolerance}x`,
    `${input.isLong ? 'long：loss = 1 − Pmin(1−s_close)/(Pmax(1+s_open))' : 'short：loss = Pmax(1+s_close)/(Pmin(1−s_open)) − 1'} = ${lossFactorText}；`
    + `chainModel = 1/(minCF + f_open + f_close + loss)，价带因子 1 − Pmin/Pmax = ${bandFactorText}；${closeLegNote}`);

  // (iii-b) 链上实测 vs 前端公式（本行设计要暴露的差异：页面公式不含 oracle min/max 价带）
  const formulaDelta = Math.abs(chainMaxGrossX - expected.formulaX);
  check(checks, `|chainMaxGrossX − 前端公式 L_max| ≤ ${tolerance}x`, formulaDelta <= tolerance,
    `chainMaxGross=${toX(chainMaxGrossX)}x，frontendFormula=${toX(expected.formulaX)}x，|Δ|=${toX(formulaDelta)}x，价带因子=${bandFactorText}`, `|Δ| ≤ ${tolerance}x`,
    `页面公式不含 oracle min/max 价带；有价带的市场预期偏离（本环境价带因子 ${bandFactorText}，含价带链上模型 ${toX(chainModelX)}x）`);

  // (iv) 页面上限 ≤ 链上最大（毛口径）
  check(checks, `页面滑杆上限 uiCapX（${toX(expected.uiCapX)}x）≤ chainMaxGrossX`, expected.uiCapX <= chainMaxGrossX + 1e-9, toX(expected.uiCapX), `≤ ${toX(chainMaxGrossX)}`,
    'floorUiLeverageCap(getUiMaxLeverage(formulaBps, 100), 100)：页面不得提供链上不可开的杠杆值');

  // 原子：以 minFeasibleCollateral 开仓 → 全平（标准核对）
  const atom = await runMarketOpenAtom(runtime, {
    id: input.id,
    isLong: input.isLong,
    sizeDeltaUsd: S,
    collateral: search.minFeasibleCollateral,
    ...(input.resolvedEnvironment ? { resolvedEnvironment: input.resolvedEnvironment } : {}),
    expectedLeverageNote: `L_max 等号：collateral=minFeasible=${search.minFeasibleCollateral} raw；理论 ${toX(expected.theoreticalX)}x / 页面上限 ${toX(expected.uiCapX)}x / 链上实测(毛) ${toX(chainMaxGrossX)}x / 含价带模型 ${toX(chainModelX)}x`,
  });
  for (const item of atom.checks) checks.push({ ...item, name: `原子：${item.name}` });

  const data: Record<string, unknown> = {
    ...atom.data,
    leverageBounds: {
      theoreticalX: toX(expected.theoreticalX),
      frontendFormulaX: toX(expected.formulaX),
      formulaBps: expected.formulaBps.toString(),
      uiCapX: toX(expected.uiCapX),
      chainModelX: toX(chainModelX),
      chainModelBps: expectedChain.chainModelBps?.toString(),
      pnlLossFactor: expectedChain.pnlLossFactor.toString(),
      oracleBandFactor: expectedChain.oracleBandFactor?.toString(),
      chainMaxGrossX: toX(chainMaxGrossX),
      chainMaxGrossBps: chainMaxGrossBps.toString(),
      observations: { chainMaxGrossRawX: toX(chainMaxGrossRawX), chainMaxNetX: toX(chainMaxNetX) },
      effectiveFactor: expectedChain.effectiveFactor.toString(),
      chainFactor: expectedChain.chainFactor.toString(),
      inputs: expectedChain.inputs,
      /** 开仓前口径（仅用于搜索区间估计）：平仓腿点差/费率取开仓前 Reader 读数 */
      preOpenEstimate: {
        chainModelX: expected.chainModelX !== undefined ? toX(expected.chainModelX) : undefined,
        chainFactor: expected.chainFactor.toString(),
        closeSpread: params.closeSpread.toString(),
        closeBalanceWasImproved: params.closeBalanceWasImproved,
      },
      /** 仓位建立后口径（核对口径）：minFeasible 探测内的平仓腿 Reader 读数 */
      postOpenClose,
    },
    collateralBounds: {
      collateralFormula: collateralFormula.toString(),
      estimateRaw: bounds.estimateRaw.toString(),
      initialLower: bounds.lower.toString(),
      initialUpper: bounds.upper.toString(),
      neededProbes: bounds.needed,
      lower: search.lowerCollateral.toString(),
      upper: search.upperCollateral.toString(),
      bracket: stringifyBigint(search.bracket),
      minFeasibleCollateral: search.minFeasibleCollateral.toString(),
      lastInfeasibleCollateral: search.lastInfeasibleCollateral.toString(),
      lastInfeasibleReason: search.lastInfeasibleReason,
      lastInfeasibleReasonDecoded: search.lastInfeasibleReasonDecoded,
      positionFeeAtMin: positionFee.toString(),
      uiFeeAtMin: uiFee.toString(),
      collateralPriceMinAtMin: collateralPriceMin.toString(),
      netCollateralAtMin: netCollateral.toString(),
      probeCount: search.probeCount,
      probes: search.probes.map((probe) => ({
        collateral: probe.collateral.toString(),
        outcome: probe.outcome,
        ...(probe.reasonDecoded ? { reason: probe.reasonDecoded.errorName } : {}),
        createTxHash: probe.createTxHash,
        executeTxHash: probe.executeTxHash,
      })),
    },
    chainParams: stringifyBigint({
      blockNumber: params.blockNumber,
      marketIndex: params.marketIndex,
      minCollateralFactor: params.minCollateralFactor,
      minCollateralFactorForOpenInterestMultiplier: params.minCollateralFactorForOpenInterestMultiplier,
      cumulativeOpenCosts: params.cumulativeOpenCosts,
      effectiveMinCollateralFactor: params.effectiveMinCollateralFactor,
      positionFeeFactorNotImproved: params.positionFeeFactorNotImproved,
      positionFeeFactorImproved: params.positionFeeFactorImproved,
      positionFeeFactorNotImprovedDeclared: params.positionFeeFactorNotImprovedDeclared,
      feeRate: params.feeRate,
      feeRateSource: params.feeRateSource,
      minCollateralUsd: params.minCollateralUsd,
      minPositionSizeUsd: params.minPositionSizeUsd,
      openSpread: params.openSpread,
      closeSpread: params.closeSpread,
      openSpreadFromPrice: params.openSpreadFromPrice,
      closeSpreadFromPrice: params.closeSpreadFromPrice,
      openExecutionPrice: params.openExecutionPrice,
      closeExecutionPrice: params.closeExecutionPrice,
      indexPrice: params.indexPrice,
      collateralPrice: params.collateralPrice,
      keys: params.keys,
    }),
    rpc: maskUrl(runtime.rpcUrl),
  };
  return { id: input.id, title: XT_MKT_TITLES[input.id], checks, data, params, expected, search, atom };
}

// ---------------------------------------------------------------------------
// XT-MKT-COL-009：initialCollateral = C_eff − 1 最小原始单位 → 不得成交（三点边界的下点）
// ---------------------------------------------------------------------------

export interface CollateralBoundaryCaseInput {
  readonly id: 'XT-MKT-COL-009';
  readonly isLong: boolean;
  readonly sizeDeltaUsd: bigint;
  readonly resolvedEnvironment?: ResolvedTestEnvironment;
}

export interface CollateralBoundaryCaseResult extends CaseEvidence {
  readonly id: 'XT-MKT-COL-009';
  readonly cEff: bigint;
  readonly search: MinCollateralSearchResult;
}

const erc20Abi = parseAbi(['function balanceOf(address) view returns (uint256)']);

/**
 * C_eff 的链上权威值 = 固定 size 下等号成交的最小抵押（validatePosition → isPositionLiquidatable 闸门）。
 * 造数路径：① 开仓前口径估计 ×1.03 处成交一次（快照内）读仓位建立后的平仓腿 → 精确链上模型 C*；
 *          ② 以 C* 为中心 ±max(20 raw, C* × 1e-4) 窄区间二分（括号不成立由 findMinCollateralForSize 放宽一次）→ C_eff；
 *          ③ 原子（持久）：initialCollateral = C_eff − 1 建单 → Keeper 执行 → 期望 OrderCancelled(LiquidatablePosition)，
 *             抵押全额退回、执行费按 GasUtils 规则（keeper 收 + 余额退回）、无仓位、订单离队。
 * 矩阵 §B 的链下造数公式 max(MIN_COLLATERAL_USD, S×minCF) + 费用 → 按 Pc.min 向上取整 只记录（offlineCeff），链上为最终权威。
 */
export async function runCollateralBoundaryCase(runtime: RuntimeConfig, input: CollateralBoundaryCaseInput): Promise<CollateralBoundaryCaseResult> {
  const S = input.sizeDeltaUsd;
  const params = await readLeverageParams(runtime, {
    isLong: input.isLong,
    sizeDeltaUsd: S,
    ...(input.resolvedEnvironment ? { resolvedEnvironment: input.resolvedEnvironment } : {}),
  });
  if (params.minPositionSizeUsd > 0n && S < params.minPositionSizeUsd) {
    throw new Error(`size ${S} 低于 MIN_POSITION_SIZE_USD ${params.minPositionSizeUsd}`);
  }
  const context = await buildContext(runtime, input.resolvedEnvironment);
  const trader = getAddress(requireValue(runtime.testAccount, '缺少 E2E_TEST_ACCOUNT'));
  const checks: CaseCheck[] = [];
  const Pc = params.collateralPrice.min;

  // ① 标定探测（快照内）：开仓前口径估计偏小（平仓腿费率/点差按空市场读），×1.03 处应成交
  const preEstimate = collateralSearchBounds({ sizeDeltaUsd: S, chainFactor: expectedMaxLeverage(leverageFormulaInputs(params)).chainFactor, collateralPriceMin: Pc }).estimateRaw;
  const calibrationCollateral = preEstimate * 103n / 100n;
  const calibration = await probeCollateral(context, { isLong: input.isLong, sizeDeltaUsd: S, collateral: calibrationCollateral });
  if (calibration.outcome !== 'executed' || !calibration.postOpenClose) {
    throw new Error(`标定探测 collateral=${calibrationCollateral} 未成交（${calibration.reasonDecoded?.errorName ?? calibration.reason ?? ''}），无法读取仓位建立后的平仓腿`);
  }
  const exact = expectedMaxLeverage({
    ...leverageFormulaInputs(params),
    closeSpread: BigInt(calibration.postOpenClose.dynamicSpread),
    chainFeeClose: chainLegFeeFactor(params, calibration.postOpenClose.balanceWasImproved),
  });
  const modelRaw = collateralSearchBounds({ sizeDeltaUsd: S, chainFactor: exact.chainFactor, collateralPriceMin: Pc }).estimateRaw;
  // 矩阵 §B 链下造数口径（只记录）：费用前 max(MIN_COLLATERAL_USD, S×minCF) + 开/平仓费 → 按 Pc.min 向风险侧（上）取整
  const chainFeeOpen = chainLegFeeFactor(params, params.openBalanceWasImproved);
  const chainFeeClose = chainLegFeeFactor(params, calibration.postOpenClose.balanceWasImproved);
  const baseUsd = (() => { const byFactor = S * params.effectiveMinCollateralFactor / FLOAT_PRECISION; return byFactor > params.minCollateralUsd ? byFactor : params.minCollateralUsd; })();
  const offlineCeff = ceilDiv(baseUsd + S * (chainFeeOpen + chainFeeClose) / FLOAT_PRECISION, Pc);

  // ② 窄区间二分 → C_eff（链上权威）
  const delta = (() => { const relative = modelRaw / 10_000n; return relative > 20n ? relative : 20n; })();
  const search = await findMinCollateralForSize(runtime, {
    isLong: input.isLong,
    sizeDeltaUsd: S,
    lowerCollateral: modelRaw - delta,
    upperCollateral: modelRaw + delta,
    ...(input.resolvedEnvironment ? { resolvedEnvironment: input.resolvedEnvironment } : {}),
  });
  const cEff = search.minFeasibleCollateral;
  const cEffMinusOne = cEff - 1n;
  check(checks, '链上 C_eff 落在精确模型 C* ± max(20 raw, 1e-4) 区间内（括号未放宽）', !search.bracket.lowerWidened && !search.bracket.upperWidened,
    `C*=${modelRaw} raw，C_eff=${cEff} raw，Δ=${cEff - modelRaw} raw`, `|C_eff − C*| ≤ ${delta} raw`,
    `模型：C* = S × chainFactor / 1e30 / Pc.min，chainFactor = minCF + f_open(${chainFeeOpen}) + f_close(${chainFeeClose}) + loss（平仓腿按仓位建立后读数）；矩阵链下口径 C_eff(offline)=${offlineCeff} raw（不含价带损耗，仅记录）`);
  check(checks, '三点边界上点：initialCollateral = C_eff 成交（快照内探测）', search.minFeasibleProbe.outcome === 'executed', search.minFeasibleProbe.outcome, 'executed',
    `C_eff=${cEff} raw（${formatUnits(cEff, 6)} USDC），探测 ${search.probeCount} 次`);
  check(checks, '三点边界下点（探测）：C_eff − 1 被取消且原因为杠杆/最低抵押闸门', search.lastInfeasibleCollateral === cEffMinusOne && search.lastInfeasibleReasonDecoded?.leverageGate === true,
    { collateral: search.lastInfeasibleCollateral, errorName: search.lastInfeasibleReasonDecoded?.errorName }, { collateral: cEffMinusOne, leverageGate: true });

  // ③ 原子（持久，不在快照内）：C_eff − 1 建单 → Keeper 执行 → 取消
  // WNT（WETH9）：创建时被封顶掉的执行费差额以 WNT 退回账户（OrderUtils → GasUtils.transferExcessiveExecutionFee）
  const wnt = getAddress(requireValue(context.manifest.additionalContracts.wnt, 'Deployment manifest 缺少 additionalContracts.wnt'));
  const readBalances = async (blockNumber: bigint) => {
    const [traderUsdc, vaultUsdc, traderEth, traderWnt, orderCount, positionCount] = await Promise.all([
      guarded(runtime, 'USDC.balanceOf(trader)', () => context.publicClient.readContract({ address: context.collateralToken, abi: erc20Abi, functionName: 'balanceOf', args: [trader], blockNumber })),
      guarded(runtime, 'USDC.balanceOf(orderVault)', () => context.publicClient.readContract({ address: context.collateralToken, abi: erc20Abi, functionName: 'balanceOf', args: [context.orderVault], blockNumber })),
      guarded(runtime, 'eth_getBalance(trader)', () => context.publicClient.getBalance({ address: trader, blockNumber })),
      guarded(runtime, 'WNT.balanceOf(trader)', () => context.publicClient.readContract({ address: wnt, abi: erc20Abi, functionName: 'balanceOf', args: [trader], blockNumber })),
      guarded(runtime, 'DataStore.getBytes32Count(accountOrderList)', () => context.publicClient.readContract({ address: context.dataStore, abi: dataStoreAbi, functionName: 'getBytes32Count', args: [accountOrderListKey(trader)], blockNumber })),
      guarded(runtime, 'DataStore.getBytes32Count(accountPositionList)', () => context.publicClient.readContract({ address: context.dataStore, abi: dataStoreAbi, functionName: 'getBytes32Count', args: [accountPositionListKey(trader)], blockNumber })),
    ]);
    return { blockNumber, traderUsdc, vaultUsdc, traderEth, traderWnt, orderCount, positionCount };
  };
  const beforeBlock = (await guarded(runtime, 'eth_getBlockByNumber(latest)', () => context.publicClient.getBlock())).number;
  const before = await readBalances(beforeBlock);
  const created = await createMarketIncrease(context, { isLong: input.isLong, sizeDeltaUsd: S, collateral: cEffMinusOne });
  const createReceipt = await guarded(runtime, `createOrder 回执 ${created.transaction.hash}`, () => context.publicClient.getTransactionReceipt({ hash: created.transaction.hash }));
  const afterCreate = await readBalances(created.transaction.blockNumber);
  const executed = await executeInline(context, created.key);
  const after = await readBalances(executed.blockNumber);
  const events = await readEvents(context, created.transaction.blockNumber, executed.blockNumber);
  const orderCreated = eventsForOrder(events, created.key, 'OrderCreated');
  const orderExecuted = eventsForOrder(events, created.key, 'OrderExecuted');
  const orderCancelled = eventsForOrder(events, created.key, 'OrderCancelled');
  const positionIncrease = eventsForOrder(events, created.key, 'PositionIncrease');
  const text = (event: FxEvent | undefined, group: string, key: string): string => {
    const value = event ? eventItem(event, group, key) : undefined;
    return value === undefined ? '' : String(value);
  };
  // 执行费：随 createOrder 发出的 native（sendWnt）= executionFeeSent；合约按 gasLimit×basefee×MAX_EXECUTION_FEE_MULTIPLIER_FACTOR 封顶，
  // 封顶后的 order.executionFee 见 OrderCreated.uintItems.executionFee，差额在建单块以 WNT 退回账户；取消时 GasUtils.payExecutionFee(order.executionFee)
  // 付 keeper 并把余额以 native 退给 receiver（order.executionFee = 0 时直接返回，无事件）。
  const executionFeeSent = MARKET_FLOW_DEFAULTS.executionFee;
  const orderExecutionFeeText = text(orderCreated[0], 'uintItems', 'executionFee');
  const orderExecutionFee = /^\d+$/.test(orderExecutionFeeText) ? BigInt(orderExecutionFeeText) : undefined;

  check(checks, '原子：OrderCreated 存在且 initialCollateralDeltaAmount = C_eff − 1、sizeDelta = S（isSizeDeltaUsd）', orderCreated.length === 1
    && text(orderCreated[0], 'uintItems', 'initialCollateralDeltaAmount') === cEffMinusOne.toString()
    && text(orderCreated[0], 'uintItems', 'sizeDelta') === S.toString()
    && text(orderCreated[0], 'boolItems', 'isSizeDeltaUsd') === 'true',
    { events: orderCreated.length, initialCollateralDeltaAmount: text(orderCreated[0], 'uintItems', 'initialCollateralDeltaAmount'), sizeDelta: text(orderCreated[0], 'uintItems', 'sizeDelta'), isSizeDeltaUsd: text(orderCreated[0], 'boolItems', 'isSizeDeltaUsd') },
    { events: 1, initialCollateralDeltaAmount: cEffMinusOne.toString(), sizeDelta: S.toString(), isSizeDeltaUsd: 'true' });
  check(checks, '原子：建单后订单入队（账户挂单数 +1）', afterCreate.orderCount === before.orderCount + 1n, afterCreate.orderCount, before.orderCount + 1n);
  const cancelled = orderCancelled[0];
  const reasonString = text(cancelled, 'stringItems', 'reason');
  const reasonBytes = cancelled ? eventItem(cancelled, 'bytesItems', 'reasonBytes') : undefined;
  const decoded = decodeCancelReason(reasonBytes, reasonString || undefined);
  const liquidatableReason = decoded.arguments?.reason ?? '';
  check(checks, '原子：Keeper 执行 → OrderCancelled（无 OrderExecuted），reasonBytes 解码为 LiquidatablePosition', orderCancelled.length === 1 && orderExecuted.length === 0 && decoded.errorName === 'LiquidatablePosition',
    { cancelled: orderCancelled.length, executed: orderExecuted.length, errorName: decoded.errorName, selector: decoded.selector, reason: liquidatableReason, reasonString },
    { cancelled: 1, executed: 0, errorName: 'LiquidatablePosition' },
    'validatePosition → isPositionLiquidatable(forLiquidation=false)：remaining = C_net×Pc.min + pnl − 平仓腿费用 < size×MIN_COLLATERAL_FACTOR');
  check(checks, '原子：LiquidatablePosition.reason ∈ {min collateral for leverage, min collateral}', liquidatableReason === 'min collateral for leverage' || liquidatableReason === 'min collateral',
    liquidatableReason, 'min collateral for leverage | min collateral');
  const remaining = decoded.arguments?.remainingCollateralUsd; const minForLeverage = decoded.arguments?.minCollateralUsdForLeverage; const minUsd = decoded.arguments?.minCollateralUsd;
  const remainingBelowGate = remaining !== undefined && minForLeverage !== undefined
    && (liquidatableReason === 'min collateral' ? BigInt(remaining) < BigInt(minUsd ?? '0') : BigInt(remaining) < BigInt(minForLeverage));
  check(checks, '原子：解码参数 remainingCollateralUsd < 对应闸门（minCollateralUsdForLeverage = S × minCF）', remainingBelowGate,
    { remainingCollateralUsd: remaining, minCollateralUsd: minUsd, minCollateralUsdForLeverage: minForLeverage }, `remaining < ${liquidatableReason === 'min collateral' ? 'minCollateralUsd' : 'minCollateralUsdForLeverage'}`,
    `size×minCF = ${S * params.effectiveMinCollateralFactor / FLOAT_PRECISION}`);
  check(checks, '原子：无 PositionIncrease，账户仓位数不变', positionIncrease.length === 0 && after.positionCount === before.positionCount,
    { positionIncrease: positionIncrease.length, positionCountBefore: before.positionCount, positionCountAfter: after.positionCount }, { positionIncrease: 0, positionCountUnchanged: true });
  check(checks, '原子：取消后订单离队（账户挂单数回到建单前）', after.orderCount === before.orderCount, after.orderCount, before.orderCount);
  check(checks, '原子：抵押全额退回（trader USDC Δ = 0，OrderVault USDC Δ = 0；建单块 trader −(C_eff−1)）',
    after.traderUsdc - before.traderUsdc === 0n && after.vaultUsdc - before.vaultUsdc === 0n && before.traderUsdc - afterCreate.traderUsdc === cEffMinusOne,
    { traderUsdcDelta: after.traderUsdc - before.traderUsdc, vaultUsdcDelta: after.vaultUsdc - before.vaultUsdc, traderUsdcDeltaAtCreate: afterCreate.traderUsdc - before.traderUsdc },
    { traderUsdcDelta: 0n, vaultUsdcDelta: 0n, traderUsdcDeltaAtCreate: -cEffMinusOne });
  // 执行费：GasUtils.payExecutionFee → KeeperExecutionFee(keeper, amount) + ExecutionFeeRefund(receiver, refundFeeAmount)，两者之和 = executionFee
  const inExecuteTx = (name: string) => events.filter((event) => event.eventName === name && event.transactionHash.toLowerCase() === executed.hash.toLowerCase());
  const keeperFeeEvents = inExecuteTx('KeeperExecutionFee');
  const refundEvents = inExecuteTx('ExecutionFeeRefund');
  const keeperFee = keeperFeeEvents.reduce((sum, event) => sum + BigInt(text(event, 'uintItems', 'executionFeeAmount') || text(event, 'uintItems', 'amount') || '0'), 0n);
  const refund = refundEvents.reduce((sum, event) => sum + BigInt(text(event, 'uintItems', 'refundFeeAmount') || '0'), 0n);
  const refundReceiver = text(refundEvents[0], 'addressItems', 'receiver');
  const gasCost = createReceipt.gasUsed * createReceipt.effectiveGasPrice;
  const wntDeltaAtCreate = afterCreate.traderWnt - before.traderWnt;
  const ethDeltaAtCreate = afterCreate.traderEth - before.traderEth;
  const ethDeltaAtExecute = after.traderEth - afterCreate.traderEth;
  // 建单块 native 支出 = gas + 已发执行费 + L1 数据费（OP-stack 链在 receipt 之外扣，观测值；非负且很小）
  const l1FeeObserved = -ethDeltaAtCreate - gasCost - executionFeeSent;
  const L1_FEE_BOUND = 10n ** 13n;
  check(checks, '原子：执行费封顶差额以 WNT 退回建单账户（WNT Δ(建单块) = 已发执行费 − order.executionFee）',
    orderExecutionFee !== undefined && wntDeltaAtCreate === executionFeeSent - orderExecutionFee,
    { executionFeeSent, orderExecutionFee: orderExecutionFeeText, wntDeltaAtCreate }, { wntDeltaAtCreate: orderExecutionFee !== undefined ? executionFeeSent - orderExecutionFee : 'order.executionFee 缺失' },
    'OrderUtils.createOrder → GasUtils.validateAndCapExecutionFee（gasLimit × basefee × MAX_EXECUTION_FEE_MULTIPLIER_FACTOR 封顶）→ transferExcessiveExecutionFee；fork 上 basefee≈0 时 order.executionFee 被封顶为 0');
  if (orderExecutionFee !== undefined && orderExecutionFee > 0n) {
    check(checks, '原子：取消时执行费按规则处理（KeeperExecutionFee + ExecutionFeeRefund(receiver=trader) = order.executionFee）',
      keeperFee + refund === orderExecutionFee && (refund === 0n || refundReceiver.toLowerCase() === trader.toLowerCase()),
      { orderExecutionFee, keeperFee, refund, refundReceiver }, { sum: orderExecutionFee, refundReceiver: trader });
  } else {
    check(checks, '原子：order.executionFee = 0 → 取消时 payExecutionFee 直接返回，无 KeeperExecutionFee / ExecutionFeeRefund 事件', keeperFeeEvents.length === 0 && refundEvents.length === 0,
      { keeperFeeEvents: keeperFeeEvents.length, refundEvents: refundEvents.length }, { keeperFeeEvents: 0, refundEvents: 0 },
      'GasUtils.payExecutionFee：if (executionFee == 0) return 0');
  }
  check(checks, '原子：trader ETH Δ(建单块) = −建单 gas − 已发执行费 − L1 数据费（0 ≤ L1 ≤ 1e13 wei）', l1FeeObserved >= 0n && l1FeeObserved <= L1_FEE_BOUND,
    { ethDeltaAtCreate, gasCost, executionFeeSent, l1FeeObserved }, { l1FeeObserved: `0 ≤ … ≤ ${L1_FEE_BOUND}` },
    `建单 gasUsed=${createReceipt.gasUsed} × effectiveGasPrice=${createReceipt.effectiveGasPrice}`);
  check(checks, '原子：trader ETH Δ(执行块) = 取消退回的执行费余额（native）', ethDeltaAtExecute === refund, { ethDeltaAtExecute, refund }, { ethDeltaAtExecute: refund });

  const data: Record<string, unknown> = {
    entry: 'RPC（私钥签名 createOrder + Inline Keeper 执行）',
    layer: '合约层',
    isLong: input.isLong,
    sizeDeltaUsd: S,
    sizeUsdText: formatUnits(S, 30),
    trader,
    marketIndex: Number(context.marketIndex),
    boundary: {
      cEff, cEffText: formatUnits(cEff, 6), cEffMinusOne,
      modelRaw, modelDeltaRaw: cEff - modelRaw, searchDelta: delta,
      offlineCeff, offlineCeffNote: '矩阵 §B 链下造数：max(MIN_COLLATERAL_USD, S×minCF) + 开/平仓费，按 Pc.min 向上取整；不含价带/点差损耗',
      preOpenEstimate: preEstimate,
      calibration: { collateral: calibrationCollateral, outcome: calibration.outcome, postOpenClose: calibration.postOpenClose, createTxHash: calibration.createTxHash, executeTxHash: calibration.executeTxHash },
      chainModel: { chainFactor: exact.chainFactor, chainModelX: exact.chainModelX, pnlLossFactor: exact.pnlLossFactor, chainFeeOpen, chainFeeClose, inputs: exact.inputs },
    },
    collateralBounds: {
      lower: search.lowerCollateral, upper: search.upperCollateral, bracket: stringifyBigint(search.bracket), probeCount: search.probeCount,
      minFeasibleCollateral: search.minFeasibleCollateral, lastInfeasibleCollateral: search.lastInfeasibleCollateral, lastInfeasibleReasonDecoded: search.lastInfeasibleReasonDecoded,
      probes: search.probes.map((probe) => ({ collateral: probe.collateral.toString(), outcome: probe.outcome, ...(probe.reasonDecoded ? { reason: probe.reasonDecoded.errorName } : {}), createTxHash: probe.createTxHash, executeTxHash: probe.executeTxHash })),
    },
    atom: {
      orderKey: created.key, createTxHash: created.transaction.hash, createBlock: created.transaction.blockNumber, executeTxHash: executed.hash, executeBlock: executed.blockNumber,
      cancel: { reasonString, reasonBytes: typeof reasonBytes === 'string' ? reasonBytes : undefined, decoded },
      balances: { before, afterCreate, after },
      executionFee: { executionFeeSent, orderExecutionFee: orderExecutionFeeText, wntDeltaAtCreate, keeperFee, refund, refundReceiver, gasCost, ethDeltaAtCreate, ethDeltaAtExecute, l1FeeObserved },
      events: events.filter((event) => event.transactionHash.toLowerCase() === executed.hash.toLowerCase() || event.transactionHash.toLowerCase() === created.transaction.hash.toLowerCase()).map((event) => event.eventName),
    },
    chainParams: stringifyBigint({
      blockNumber: params.blockNumber, marketIndex: params.marketIndex, effectiveMinCollateralFactor: params.effectiveMinCollateralFactor, minCollateralUsd: params.minCollateralUsd,
      minPositionSizeUsd: params.minPositionSizeUsd, positionFeeFactorNotImproved: params.positionFeeFactorNotImproved, positionFeeFactorImproved: params.positionFeeFactorImproved,
      openSpread: params.openSpread, indexPrice: params.indexPrice, collateralPrice: params.collateralPrice,
    }),
    rpc: maskUrl(runtime.rpcUrl),
  };
  return { id: input.id, title: XT_MKT_TITLES[input.id], checks, data, cEff, search };
}

/** bigint → 十进制字符串的 JSON（证据落盘） */
export function stringifyXtEvidence(value: unknown): string {
  const explorerUrl = findBlockExplorerBaseUrl(value);
  const evidence = explorerUrl ? addTransactionExplorerLinks(value, explorerUrl) : value;
  return `${JSON.stringify(evidence, (_key, item: unknown) => (typeof item === 'bigint' ? item.toString() : item), 2)}\n`;
}

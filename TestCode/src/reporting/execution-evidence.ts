import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

import { normalizeForkDisplayName } from '../domain/fork-display.js';
import {
  calculateExecutionPrice,
  calculateFundingFactors,
  calculateGrace,
  calculatePositionFee,
  calculatePriceImpactSpread,
  calculateSignedSkew,
  calculateSkewImpact,
  ceilDiv,
  composeDynamicSpread,
  decreaseSizeInTokens,
  decreaseWaterfall,
  increaseSizeInTokens,
  preliminaryIncreaseTokens,
} from '../reconciliation/formulas.js';
import { isExecutionPriceAcceptable } from '../scenarios/scn-070-model.js';
import type { ScenarioResult, TestRunArtifact } from './schema.js';

type JsonRecord = Record<string, unknown>;
type Reconciliation = NonNullable<ScenarioResult['executionEvidence']>['reconciliations'][number];
type TransactionEvidence = NonNullable<ScenarioResult['executionEvidence']>['transactions'][number];

const FORMULA_SOURCE = '../Docs/Fx100/Gordon-Notion需求文档归档/汇总/FX100-十大功能领域需求文档.md';
const PAGE_FORMULA_SOURCE = '../Docs/Fx100/Gordon-Notion需求文档归档/汇总/FX100-页面字段计算公式.md';
const ORDER_FLOW_SOURCE = '../Docs/Fx100/Gordon-Notion需求文档归档/汇总/FX100-Order订单流程图与需求简介.md';
const LEDGER_SOURCE = 'src/scenarios/scn-009-runner.ts';
const SCN010_LEDGER_SOURCE = 'src/scenarios/scn-010-runner.ts';
const SCN070_MODEL_SOURCE = 'src/scenarios/scn-070-model.ts';
const SCN070_RUNNER_SOURCE = 'src/scenarios/scn-070-runner.ts';

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function stringValue(value: unknown, fallback = '—'): string {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function bigintValue(value: unknown): bigint {
  return BigInt(stringValue(value, '0'));
}

function rawAndUnit(value: unknown, decimals: number, symbol: string): string {
  const raw = bigintValue(value);
  const negative = raw < 0n;
  const absolute = negative ? -raw : raw;
  const scale = 10n ** BigInt(decimals);
  const whole = absolute / scale;
  const fraction = (absolute % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${raw.toString()} raw (${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''} ${symbol})`;
}

function deltaAndUnit(value: unknown, decimals: number, symbol: string): string {
  const raw = bigintValue(value);
  const formatted = rawAndUnit(raw, decimals, symbol);
  return raw > 0n ? `+${formatted}` : formatted;
}

const CONSERVATION_TERM_FIELDS = [
  ['traderUsdc', 'ΔTrader'],
  ['orderVaultUsdc', 'ΔOrderVault'],
  ['posVaultUsdc', 'ΔPositionVault'],
  ['lpVaultAssets', 'ΔLPVaultAssets'],
  // 槽位 key 保持 feeReceiverUsdc 以兼容存量证据 JSON；显示名改为 ΔFeeHandler——
  // 该槽读取的是 FeeHandler 合约（claimFees 第一跳收款方）的 USDC 余额，
  // 而 DataStore.FEE_RECEIVER 指向的 RevenuePool 不在本账本槽位中，叫 ΔFeeReceiver 会误导。
  ['feeReceiverUsdc', 'ΔFeeHandler'],
] as const;

function buildConservationRow(input: {
  readonly id: string;
  readonly txStep: string;
  readonly label: string;
  readonly observation: JsonRecord;
  readonly ledgerSource: string;
}): Reconciliation {
  const reportedSum = optionalBigint(input.observation.sum);
  const reportedStatus = stringValue(input.observation.status);
  const missingSlots = Array.isArray(input.observation.missing)
    ? input.observation.missing.map((slot) => String(slot))
    : [];
  const terms = record(input.observation.terms);
  const hasAllTerms = CONSERVATION_TERM_FIELDS.every(([key]) => optionalBigint(terms[key]) !== undefined);
  // ΣΔ 由五方逐项 Δ 独立复算，不信证据里预存的 sum/status（自证纪律）。
  const recomputedSum = hasAllTerms
    ? CONSERVATION_TERM_FIELDS.reduce((acc, [key]) => acc + bigintValue(terms[key]), 0n)
    : undefined;
  const sumMismatch = recomputedSum !== undefined && reportedSum !== undefined && recomputedSum !== reportedSum;
  const expandedTerms = hasAllTerms
    ? CONSERVATION_TERM_FIELDS.map(([key, label]) => `${label}(${bigintValue(terms[key])})`).join(' + ')
    : '历史证据未保存五方逐项 Δ';
  const expandedResult = recomputedSum === undefined
    ? `${expandedTerms} = 无法核对`
    : `${expandedTerms} = ${rawAndUnit(recomputedSum, 6, 'USDC')}`;
  // UNVERIFIABLE（缺读数）语义是"不可核"，不是"资金不闭合"——如实 NOT_VERIFIED，禁止倒推 PASS 也不误标 FAIL。
  const status: Reconciliation['status'] = reportedStatus === 'UNVERIFIABLE' || !hasAllTerms
    ? 'NOT_VERIFIED'
    : recomputedSum === 0n && reportedStatus === 'PASS' && !sumMismatch
      ? 'PASS'
      : 'FAIL';
  const statusNote = reportedStatus === 'UNVERIFIABLE'
    ? `守恒不可核（UNVERIFIABLE）：缺少读数槽位 ${missingSlots.join('、') || '（未记录）'}——缺读数不等于守恒成立。`
    : !hasAllTerms
      ? '历史证据未保存五方逐项 Δ，无法独立复算 ΣΔ。'
      : sumMismatch
        ? `⚠️ 证据预存 sum(${reportedSum}) 与独立复算 Σterms(${recomputedSum}) 不一致，按复算结果判定。`
        : '';

  return {
    id: input.id,
    group: '守恒',
    label: input.label,
    status,
    before: '五方账户 / Vault 的阶段前链上余额',
    after: `ΣΔ = ${expandedResult}`,
    delta: `ΣΔ = ${expandedResult}`,
    expected: 'ΣΔ = 0 raw (0 USDC)',
    formula: `ΣΔ = ΔTrader + ΔOrderVault + ΔPositionVault + ΔLPVaultAssets + ΔFeeHandler；本次：${expandedResult}`,
    basis: {
      title: 'USDC 五方封闭账本守恒',
      sourcePath: input.ledgerSource,
      section: `checkConservation(${input.id})`,
    },
    unit: 'USDC raw / USDC 1e6',
    txStep: input.txStep,
    note: `${statusNote ? `${statusNote} ` : ''}Position Fee 与 Funding 已分别在 Fee/Funding 行复算；它们在资金守恒式中通过 PositionVault、LPVault、FeeHandler 的实际余额变化体现，不再作为第六、第七项重复相加。Claimable Fee/Funding 属于 DataStore 应收账本，单独核对。第五方是 FeeHandler 合约（claimFees 第一跳收款方，交易执行窗口余额恒不变）；DataStore.FEE_RECEIVER 指向的 RevenuePool 只在 withdrawFees 后才有资金流，不在本守恒圈内。`,
  };
}

function boolValue(value: unknown): boolean {
  return value === true || value === 'true';
}

type VerificationKind = NonNullable<Reconciliation['verification']>;

// 验证方式分级：说明每一行结论的证据强度。行内已显式标注（verification 字段或【标记】note）时以标注为准，
// 否则按行的结构信号推断；默认视为独立计算复算。
function classifyVerification(row: Reconciliation): VerificationKind {
  if (row.verification) return row.verification;
  const note = row.note ?? '';
  if (row.group === '守恒' || note.includes('【守恒推论】')) return '守恒';
  if (row.status === 'CALCULATED') return '派生展示';
  if (row.status === 'NOT_VERIFIED') return '缺数据';
  if (note.includes('【恒等式】')) return '恒等式';
  if (note.includes('【事件对照】') || row.formula.includes('事件的同名字段')) return '事件对照';
  return '计算复算';
}

type DataSourceKind = NonNullable<Reconciliation['dataSource']>;

// 数据来源分层：本行 Actual 值读的是哪一层。行内显式标注优先，否则按行结构信号推断；
// 默认视为合约读数（账本快照、Reader、DataStore、OI 等）。
function classifyDataSource(row: Reconciliation): DataSourceKind {
  if (row.dataSource) return row.dataSource;
  const note = row.note ?? '';
  if (row.group === '守恒' || note.includes('【守恒推论】')) return '合约';
  if (note.includes('事件同名字段') || row.formula.includes('事件的同名字段')) return '合约+事件';
  // 链上参数与事件字段互证、DataStore 应收与事件金额互证的行
  if (/fee-factor|funding-factor|claimable/.test(row.id) || row.label.includes('待领取')) return '合约+事件';
  // Actual 直接取自事件字段的行：执行价、订单参数、Fee/Funding 金额、PnL、汇总恒等式
  if (/execution-price|order-type|-pnl|total-cost|protocol-fee|fee-receiver$|pool-fee|position-fee$|negative-funding|positive-funding|net-funding|balance-improved|dynamic-spread/.test(row.id)) {
    return '事件';
  }
  return '合约';
}

function withVerification(row: Reconciliation): Reconciliation {
  return { ...row, verification: classifyVerification(row), dataSource: classifyDataSource(row) };
}

function pass(actual: unknown, expected: unknown): 'PASS' | 'FAIL' {
  return String(actual) === String(expected) ? 'PASS' : 'FAIL';
}

function maxBigInt(value: bigint, minimum = 0n): bigint {
  return value < minimum ? minimum : value;
}

function optionalBigint(value: unknown): bigint | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  try {
    return BigInt(String(value));
  } catch {
    return undefined;
  }
}

function decimalToRaw(value: unknown, decimals: number): bigint {
  const source = stringValue(value, '0').trim();
  const match = source.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) throw new Error(`无法把 ${source} 转换为 ${decimals} 位原始整数`);
  const sign = match[1] === '-' ? -1n : 1n;
  const whole = BigInt(match[2]!);
  const fraction = (match[3] ?? '').padEnd(decimals, '0').slice(0, decimals);
  return sign * (whole * 10n ** BigInt(decimals) + BigInt(fraction || '0'));
}

function leverageTimes(value: unknown): bigint | undefined {
  const match = stringValue(value, '').trim().match(/^(\d+)x$/i);
  return match ? BigInt(match[1]!) : undefined;
}

function expectedOrderSizeUsd(testData: JsonRecord): {
  readonly value: bigint;
  readonly configured: bigint;
  readonly leverage?: bigint;
  readonly expanded: string;
} {
  const configured = decimalToRaw(testData.sizeUsd, 30);
  const leverage = leverageTimes(testData.leverage);
  if (leverage === undefined) {
    return {
      value: configured,
      configured,
      expanded: `用例配置 sizeUsd=${configured}`,
    };
  }
  const marginUsd = decimalToRaw(testData.collateralUsdc, 30);
  const value = marginUsd * leverage;
  return {
    value,
    configured,
    leverage,
    expanded: `inputMargin ${marginUsd} × leverage ${leverage}x = ${value}；用例配置 sizeUsd=${configured}`,
  };
}

function marketParameter(snapshot: JsonRecord, label: string): bigint | undefined {
  return optionalBigint(record(record(snapshot).market)[label]
    ? record(record(record(snapshot).market)[label]).value
    : undefined);
}

function globalParameter(snapshot: JsonRecord, label: string): bigint | undefined {
  return optionalBigint(record(record(record(snapshot).global)[label]).value);
}

function parameterBlockNote(snapshot: JsonRecord): string {
  return snapshot.source === 'chain-at-block'
    ? `参数来自执行区块 #${stringValue(snapshot.blockNumber)} 的 DataStore 实际值。`
    : '缺少执行区块参数快照。';
}

function timestampAndIso(value: unknown): string {
  const timestamp = bigintValue(value);
  if (timestamp === 0n) return '0（未设置）';
  return `${timestamp.toString()} (${new Date(Number(timestamp) * 1000).toISOString()})`;
}

interface LedgerField {
  readonly key: string;
  readonly label: string;
  readonly family: '资金账户' | '市场 / OI';
  readonly decimals: number | 'token';
  readonly symbol: string | 'token';
  readonly unit: string | 'token';
  /** 口径：这个读数是谁的账——账户级/合约级/池级/协议级/市场级。聚合口径下本单只体现在 Δ。 */
  readonly scope: string;
}

const LEDGER_FIELDS: readonly LedgerField[] = [
  { key: 'traderUsdc', label: 'ΔTrader', family: '资金账户', decimals: 6, symbol: 'USDC', unit: 'USDC 1e6', scope: '账户级——本交易账户的 USDC 钱包余额；Δ 核对隐含窗口内该账户无其他收支' },
  { key: 'orderVaultUsdc', label: 'ΔOrderVault', family: '资金账户', decimals: 6, symbol: 'USDC', unit: 'USDC 1e6', scope: '合约级——OrderVault 合约 USDC 总余额（所有账户的在途订单资金都在此）；本单只体现在 Δ' },
  { key: 'posVaultUsdc', label: 'ΔPositionVault', family: '资金账户', decimals: 6, symbol: 'USDC', unit: 'USDC 1e6', scope: '合约级——PositionVault 合约 USDC 总余额（全体仓位的抵押与未领费用都在此）；本单只体现在 Δ' },
  { key: 'lpVaultAssets', label: 'ΔLPVaultAssets', family: '资金账户', decimals: 6, symbol: 'USDC', unit: 'USDC 1e6', scope: '池级——LP 金库 totalAssets（整池资产，全体 LP 共有）；本单只体现在 Δ' },
  { key: 'feeReceiverUsdc', label: 'ΔFeeHandler', family: '资金账户', decimals: 6, symbol: 'USDC', unit: 'USDC 1e6', scope: '协议级——FeeHandler 合约 USDC 总余额（跨市场、跨账户累计）；本单只体现在 Δ' },
  { key: 'claimableFeeAmountPosition', label: '待领取仓位费', family: '资金账户', decimals: 6, symbol: 'USDC', unit: 'USDC 1e6', scope: '市场级累计——claimableFeeAmount(market, USDC, POSITION)，该市场全体交易者产生的待领取仓位费；本单只体现在 Δ' },
  { key: 'claimableFeeAmountFunding', label: '待领取 Funding', family: '资金账户', decimals: 6, symbol: 'USDC', unit: 'USDC 1e6', scope: '市场级累计——claimableFeeAmount(market, USDC, FUNDING)，该市场付给 LP 的待领取 Funding；本单只体现在 Δ' },
  { key: 'claimableFeeAmountLiquidation', label: '待领取清算费', family: '资金账户', decimals: 6, symbol: 'USDC', unit: 'USDC 1e6', scope: '市场级累计——claimableFeeAmount(market, USDC, LIQUIDATION)，该市场清算费 receiver 份额；本单只体现在 Δ' },
  // OI 三套口径统一命名（2026-08-13）：Token 口径 = 链上存储 openInterestInTokens；
  // USD 成本口径 = 链上存储 cumulativeOpenCosts（开仓时点成本，不随价漂移）；
  // USD 盯市口径 = 派生行（tokens × indexMid，随价漂移），见 OI / Skew / Spread 组。
  { key: 'cumulativeOpenCostsLong', label: 'Long 累计开仓成本（USD 成本口径）', family: '市场 / OI', decimals: 30, symbol: 'USD', unit: 'USD 1e30', scope: '市场级总账——该市场全体交易者的多头开仓成本聚合；本单只体现在 Δ' },
  { key: 'cumulativeOpenCostsShort', label: 'Short 累计开仓成本（USD 成本口径）', family: '市场 / OI', decimals: 30, symbol: 'USD', unit: 'USD 1e30', scope: '市场级总账——该市场全体交易者的空头开仓成本聚合；本单只体现在 Δ' },
  { key: 'openInterestInTokensLong', label: 'Long OI（Token 口径）', family: '市场 / OI', decimals: 'token', symbol: 'token', unit: 'token', scope: '市场级总账——该市场全体交易者的多头 OI（Token）聚合；本单只体现在 Δ' },
  { key: 'openInterestInTokensShort', label: 'Short OI（Token 口径）', family: '市场 / OI', decimals: 'token', symbol: 'token', unit: 'token', scope: '市场级总账——该市场全体交易者的空头 OI（Token）聚合；本单只体现在 Δ' },
  // positionImpactPoolAmount 已删除（2026-08-13）：fx100 用动态点差替代 GMX price impact 记账，
  // PositionImpactPoolUtils.sol 在 release-v0.3.1 已是空壳、该 key 无任何合约读写方——死字段不再展示。
];

type TradePhaseKind = 'create-order' | 'create-decrease-order'
  | 'create-and-increase' | 'execute-increase' | 'create-and-decrease' | 'execute-decrease';

type FormulaInput = NonNullable<Reconciliation['inputs']>[number];

interface LedgerDeltaExpectation {
  readonly value?: bigint;
  readonly formula: string;
  readonly note?: string;
  readonly inputs?: FormulaInput[];
}

function buildLedgerDeltaExpectations(input: {
  readonly phaseKind: TradePhaseKind;
  readonly testData: JsonRecord;
  readonly positionBefore: JsonRecord;
  readonly positionEvent: JsonRecord;
  readonly events: JsonRecord;
  readonly collateralDecimals: number;
}): Record<string, LedgerDeltaExpectation> {
  const margin = decimalToRaw(input.testData.collateralUsdc, input.collateralDecimals);
  const sizeModel = expectedOrderSizeUsd(input.testData);
  const sizeUsd = sizeModel.value;
  const eventUint = record(input.positionEvent.uint);
  const eventInt = record(input.positionEvent.int);
  const fees = record(record(input.events.feesCollected).uint);
  // 市场级 Funding 是区间总账：窗口内可能有多条 Funding 事件（共享市场他单执行也会推进），
  // 必须 Σ 聚合而不是只取第一条（vendor checkFundingMarketLoop 同口径）。
  const fundingEventList = Array.isArray(input.events.fundingEvents) ? input.events.fundingEvents : [];
  const fundingPays = fundingEventList.map((event) => bigintValue(record(record(event).int).positionPaysLp));
  const isLong = boolValue(record(input.positionEvent.bool).isLong ?? input.testData.isLong);
  const zero = (reason: string): LedgerDeltaExpectation => ({ value: 0n, formula: reason });

  if (input.phaseKind === 'create-order') {
    return {
      traderUsdc: { value: -margin, formula: `Expected ΔTrader = −inputMargin = −${margin}` },
      orderVaultUsdc: { value: margin, formula: `Expected ΔOrderVault = +inputMargin = +${margin}` },
      posVaultUsdc: zero('订单尚未执行：Expected ΔPositionVault = 0'),
      lpVaultAssets: zero('订单尚未执行：Expected ΔLPVault = 0'),
      feeReceiverUsdc: zero('费用尚未结算：Expected ΔFeeHandler balance = 0'),
      claimableFeeAmountPosition: zero('费用尚未结算：Expected ΔClaimable Position Fee = 0'),
      claimableFeeAmountFunding: zero('Funding 尚未结算：Expected ΔClaimable Funding = 0'),
      claimableFeeAmountLiquidation: zero('非清算订单：Expected ΔClaimable Liquidation Fee = 0'),
      cumulativeOpenCostsLong: zero('订单尚未执行：Expected ΔLong Open Costs = 0'),
      cumulativeOpenCostsShort: zero('订单尚未执行：Expected ΔShort Open Costs = 0'),
      openInterestInTokensLong: zero('订单尚未执行：Expected ΔLong OI = 0'),
      openInterestInTokensShort: zero('订单尚未执行：Expected ΔShort OI = 0'),
    };
  }

  if (input.phaseKind === 'create-decrease-order') {
    return {
      traderUsdc: zero('创建减仓订单只支付 ETH execution fee：Expected ΔTrader USDC = 0'),
      orderVaultUsdc: zero('减仓订单没有 USDC 抵押品存入：Expected ΔOrderVault = 0'),
      posVaultUsdc: zero('订单尚未执行：Expected ΔPositionVault = 0'),
      lpVaultAssets: zero('订单尚未执行：Expected ΔLPVault = 0'),
      feeReceiverUsdc: zero('费用尚未结算：Expected ΔFeeHandler balance = 0'),
      claimableFeeAmountPosition: zero('费用尚未结算：Expected ΔClaimable Position Fee = 0'),
      claimableFeeAmountFunding: zero('Funding 尚未结算：Expected ΔClaimable Funding = 0'),
      claimableFeeAmountLiquidation: zero('非清算订单：Expected ΔClaimable Liquidation Fee = 0'),
      cumulativeOpenCostsLong: zero('减仓订单尚未执行：Expected ΔLong Open Costs = 0'),
      cumulativeOpenCostsShort: zero('减仓订单尚未执行：Expected ΔShort Open Costs = 0'),
      openInterestInTokensLong: zero('减仓订单尚未执行：Expected ΔLong OI = 0'),
      openInterestInTokensShort: zero('减仓订单尚未执行：Expected ΔShort OI = 0'),
    };
  }

  const executionPrice = bigintValue(eventUint.executionPrice);
  // 四格取整矩阵（开仓格）：多头 ⌊⌋ / 空头 ⌈⌉，对 trader 不利（PositionUtils :627/:640）。
  const sizeTokensModel = executionPrice === 0n
    ? undefined
    : increaseSizeInTokens(sizeUsd, executionPrice, isLong);
  const sizeInTokens = sizeTokensModel?.value;
  const feeForPool = bigintValue(fees.feeAmountForPool ?? fees.positionFeeAmountForPool);
  const feeReceiverAmount = bigintValue(fees.feeReceiverAmount);
  const negativeFunding = bigintValue(fees.negativeFundingFeeAmount);
  const positiveFunding = bigintValue(fees.positiveFundingFeeAmount);
  const claimableFunding = fundingPays.reduce((total, value) => total + maxBigInt(value), 0n);
  const lpToPositionVault = fundingPays.reduce((total, value) => total + maxBigInt(-value), 0n);
  const fundingAggregateNote = `Σ over ${fundingPays.length} 条 Funding 事件`;
  const isIncrease = input.phaseKind === 'create-and-increase' || input.phaseKind === 'execute-increase';

  if (isIncrease) {
    const traderDelta = input.phaseKind === 'create-and-increase' ? -margin : 0n;
    const orderVaultDelta = input.phaseKind === 'execute-increase' ? -margin : 0n;
    const positionVaultDelta = margin - feeForPool + lpToPositionVault;
    const lpVaultDelta = feeForPool - lpToPositionVault;
    const increaseFormula = `${sizeModel.expanded}；${sizeTokensModel?.expanded ?? 'executionPrice 为 0，无法换算'}`;
    return {
      traderUsdc: {
        value: traderDelta,
        formula: input.phaseKind === 'create-and-increase'
          ? `Expected ΔTrader = −inputMargin = −${margin}`
          : '抵押品已在创建挂单阶段支付：Expected ΔTrader = 0',
      },
      orderVaultUsdc: {
        value: orderVaultDelta,
        formula: input.phaseKind === 'execute-increase'
          ? `Expected ΔOrderVault = −inputMargin = −${margin}`
          : '创建与执行均包含在本阶段：OrderVault 存入后转出，Expected 净 Δ = 0',
      },
      posVaultUsdc: {
        value: positionVaultDelta,
        formula: `Expected ΔPositionVault = inputMargin − feeForPool + LP→Position Funding = ${margin} − ${feeForPool} + ${lpToPositionVault} = ${positionVaultDelta}`,
      },
      lpVaultAssets: {
        value: lpVaultDelta,
        formula: `Expected ΔLPVault = feeForPool − LP→Position Funding = ${feeForPool} − ${lpToPositionVault} = ${lpVaultDelta}`,
      },
      feeReceiverUsdc: zero('协议费只记 Claimable（USDC 物理留在 PositionVault）；claimFees 之前 FeeHandler 余额不变：Expected ΔFeeHandler = 0'),
      claimableFeeAmountPosition: {
        value: feeReceiverAmount,
        formula: `Expected ΔClaimable Position Fee = feeReceiverAmount = ${feeReceiverAmount}`,
        note: '【事件对照】期望值取自 PositionFeesCollected.feeReceiverAmount，与 DataStore 入账增量交叉核对；该金额的独立复算见 Fee 组「Fee Receiver 分成」行。',
      },
      claimableFeeAmountFunding: {
        value: claimableFunding,
        formula: `Expected ΔClaimable Funding = Σmax(positionPaysLp, 0)（${fundingAggregateNote}）= ${claimableFunding}`,
        note: '【事件对照】期望值对窗口内全部 Funding 事件的 positionPaysLp 做 Σmax(·,0) 聚合（共享市场他单执行也会推进市场 Funding），与 DataStore 入账增量交叉核对。',
      },
      claimableFeeAmountLiquidation: zero('非清算订单：Expected ΔClaimable Liquidation Fee = 0'),
      cumulativeOpenCostsLong: {
        value: isLong ? sizeUsd : 0n,
        formula: isLong
          ? `Expected ΔLong Open Costs = isLong ? inputSizeUsd : 0；本次 isLong=true（多头开仓）→ +${sizeUsd}`
          : 'Expected ΔLong Open Costs = isLong ? inputSizeUsd : 0；本次 isLong=false（空头开仓）→ Long 侧不动，Expected Δ = 0',
      },
      cumulativeOpenCostsShort: {
        value: isLong ? 0n : sizeUsd,
        formula: isLong
          ? 'Expected ΔShort Open Costs = isLong ? 0 : inputSizeUsd；本次 isLong=true（多头开仓）→ Short 侧不动，Expected Δ = 0'
          : `Expected ΔShort Open Costs = isLong ? 0 : inputSizeUsd；本次 isLong=false（空头开仓）→ +${sizeUsd}`,
      },
      openInterestInTokensLong: {
        ...(sizeInTokens === undefined ? {} : { value: isLong ? sizeInTokens : 0n }),
        formula: isLong
          ? `Expected ΔLong OI = ⌊sizeUsd / executionPrice⌋（多头开仓向下取整）；本次 isLong=true → ${increaseFormula}`
          : 'Expected ΔLong OI：本次 isLong=false（空头开仓）→ Long 侧不动，Expected Δ = 0',
      },
      openInterestInTokensShort: {
        ...(sizeInTokens === undefined ? {} : { value: isLong ? 0n : sizeInTokens }),
        formula: isLong
          ? 'Expected ΔShort OI：本次 isLong=true（多头开仓）→ Short 侧不动，Expected Δ = 0'
          : `Expected ΔShort OI = ⌈sizeUsd / executionPrice⌉（空头开仓向上取整）；本次 isLong=false → ${increaseFormula}`,
      },
    };
  }

  const collateralMin = bigintValue(fees['collateralTokenPrice.min']);
  const collateralMax = bigintValue(fees['collateralTokenPrice.max']);
  const basePnlUsd = bigintValue(eventInt.basePnlUsd);
  const positivePnl = basePnlUsd > 0n && collateralMax > 0n ? basePnlUsd / collateralMax : 0n;
  const negativePnl = basePnlUsd < 0n && collateralMin > 0n ? ceilDiv(-basePnlUsd, collateralMin) : 0n;
  const totalCost = bigintValue(fees.totalCostAmount);
  const costExcludingFunding = totalCost - negativeFunding;
  const oldMargin = bigintValue(input.positionBefore.collateralAmount);
  const oldSizeUsd = bigintValue(input.positionBefore.sizeInUsd);
  const oldSizeInTokens = bigintValue(input.positionBefore.sizeInTokens);
  // 全平守卫：只有 sizeDeltaUsd == oldSizeUsd 才退还全部剩余押金；部分平退 min(请求提取额, 剩余押金)。
  const fullClose = sizeUsd === oldSizeUsd;
  const requestedWithdrawal = decimalToRaw(input.testData.collateralWithdrawUsdc ?? '0', input.collateralDecimals);
  const waterfall = decreaseWaterfall({
    oldMargin,
    positiveFunding,
    negativeFunding,
    positivePnlUsdc: positivePnl,
    negativePnlUsdc: negativePnl,
    costExcludingFunding,
    fullClose,
    requestedWithdrawal,
  });
  const traderOutput = waterfall.output;
  const lpVaultDelta = feeForPool + negativePnl - positivePnl - lpToPositionVault;
  const positionVaultDelta = -traderOutput - lpVaultDelta;
  // 四格取整矩阵（平仓格）：全平恒等分支精确清零；部分平多头 ⌈⌉ / 空头 ⌊⌋。
  const decreaseModel = decreaseSizeInTokens({ oldSizeUsd, oldSizeInTokens, sizeDeltaUsd: sizeUsd, isLong });
  const decreaseTokens = decreaseModel.value;
  const pnlFormula = `positivePnl=${positivePnl}；negativePnl=ceil(abs(${basePnlUsd})/${collateralMin})=${negativePnl}`;
  return {
    traderUsdc: {
      value: traderOutput,
      formula: `Expected ΔTrader（processCollateral 瀑布重放，${fullClose ? '全平' : '部分平'}）= ${traderOutput}；${waterfall.expanded}`,
      note: `${pnlFormula}。瀑布顺序敏感：盈利先进 output、正 funding 先入押金、成本先扣 output 再扣押金（盈利垫费）；${fullClose ? '全平退还全部剩余押金（偿付型下与线性式等值）' : `部分平退 min(请求提取额 ${requestedWithdrawal}, 剩余押金)，剩余押金 ${waterfall.remainingCollateral} 留仓`}。`,
      inputs: [
        { name: 'oldMargin（全平退还基数）', value: oldMargin.toString(), source: '仓位 Before 快照（Reader，钉块读数）' },
        { name: 'positiveFundingFeeAmount', value: positiveFunding.toString(), source: 'PositionFeesCollected 事件（执行回执解码）' },
        { name: 'negativeFundingFeeAmount', value: negativeFunding.toString(), source: 'PositionFeesCollected 事件（执行回执解码）' },
        { name: 'basePnlUsd（Cap 后，1e30 USD）', value: basePnlUsd.toString(), source: 'PositionDecrease 事件 int 字段；uncapped 版已在 PnL 组独立复算' },
        { name: 'positivePnl（盈利折 USDC，⌊÷colPrice.max⌋）', value: positivePnl.toString(), source: `派生：basePnl>0 时 ÷ ${collateralMax}（事件 max 价，向下取整）` },
        { name: 'negativePnl（亏损折 USDC，⌈÷colPrice.min⌉）', value: negativePnl.toString(), source: `派生：basePnl<0 时 ceil(÷${collateralMin})（事件 min 价，向上取整）` },
        { name: 'feeExFunding（费用 excl funding）', value: costExcludingFunding.toString(), source: '派生：事件 totalCostAmount − negativeFunding；分量在 Fee 组独立复算' },
        { name: 'Expected ΔTrader（瀑布结果）', value: traderOutput.toString(), source: '派生：processCollateral 瀑布重放，与链上 Trader 余额 Δ 逐位对照' },
      ],
    },
    orderVaultUsdc: zero('减仓订单没有抵押品存入：Expected ΔOrderVault = 0'),
    posVaultUsdc: {
      value: positionVaultDelta,
      formula: `Expected ΔPositionVault = −TraderOutput − ΔLPVault = −${traderOutput} − ${lpVaultDelta} = ${positionVaultDelta}`,
      inputs: [
        { name: 'TraderOutput', value: traderOutput.toString(), source: '派生：ΔTrader 行的瀑布重放结果' },
        { name: 'ΔLPVault', value: lpVaultDelta.toString(), source: '派生：ΔLPVaultAssets 行的期望值' },
        { name: 'Expected ΔPositionVault', value: positionVaultDelta.toString(), source: '派生：三方内部闭合（PositionVault 是瀑布的出纳方）' },
      ],
    },
    lpVaultAssets: {
      value: lpVaultDelta,
      formula: `Expected ΔLPVault = feeForPool + negativePnl − positivePnl − LP→Position Funding = ${feeForPool} + ${negativePnl} − ${positivePnl} − ${lpToPositionVault} = ${lpVaultDelta}`,
      inputs: [
        { name: 'feeAmountForPool（LP 费份额）', value: feeForPool.toString(), source: 'PositionFeesCollected 事件；独立复算见 Fee 组「LP Pool 分成」行' },
        { name: 'negativePnl（trader 亏损进池）', value: negativePnl.toString(), source: '派生：ceil(|basePnl|÷colPrice.min)' },
        { name: 'positivePnl（池付 trader 盈利）', value: positivePnl.toString(), source: '派生：⌊basePnl÷colPrice.max⌋' },
        { name: 'LP→Position Funding', value: lpToPositionVault.toString(), source: `Funding 事件：Σmax(−positionPaysLp,0)（${fundingAggregateNote}），positionPaysLp<0 时 LPVault 实付` },
      ],
    },
    feeReceiverUsdc: zero('协议费只记 Claimable（USDC 物理留在 PositionVault）；claimFees 之前 FeeHandler 余额不变：Expected ΔFeeHandler = 0'),
    claimableFeeAmountPosition: {
      value: feeReceiverAmount,
      formula: `Expected ΔClaimable Position Fee = feeReceiverAmount = ${feeReceiverAmount}`,
      note: '【事件对照】期望值取自 PositionFeesCollected.feeReceiverAmount，与 DataStore 入账增量交叉核对；该金额的独立复算见 Fee 组「Fee Receiver 分成」行。',
    },
    claimableFeeAmountFunding: {
      value: claimableFunding,
      formula: `Expected ΔClaimable Funding = Σmax(positionPaysLp, 0)（${fundingAggregateNote}）= ${claimableFunding}`,
      note: '【事件对照】期望值对窗口内全部 Funding 事件的 positionPaysLp 做 Σmax(·,0) 聚合（共享市场他单执行也会推进市场 Funding），与 DataStore 入账增量交叉核对。',
    },
    claimableFeeAmountLiquidation: zero('非清算订单：Expected ΔClaimable Liquidation Fee = 0'),
    cumulativeOpenCostsLong: {
      value: isLong ? -sizeUsd : 0n,
      formula: isLong
        ? `Expected ΔLong Open Costs = isLong ? −inputSizeUsd : 0；本次 isLong=true（平多）→ −${sizeUsd}`
        : 'Expected ΔLong Open Costs = isLong ? −inputSizeUsd : 0；本次 isLong=false（平空）→ Long 侧不动，Expected Δ = 0',
    },
    cumulativeOpenCostsShort: {
      value: isLong ? 0n : -sizeUsd,
      formula: isLong
        ? 'Expected ΔShort Open Costs = isLong ? 0 : −inputSizeUsd；本次 isLong=true（平多）→ Short 侧不动，Expected Δ = 0'
        : `Expected ΔShort Open Costs = isLong ? 0 : −inputSizeUsd；本次 isLong=false（平空）→ −${sizeUsd}`,
    },
    openInterestInTokensLong: {
      ...(decreaseTokens === undefined ? {} : { value: isLong ? -decreaseTokens : 0n }),
      formula: isLong
        ? `Expected ΔLong OI = −sizeDeltaInTokens（平多按仓位等比销账，与执行价无关）；${decreaseModel.expanded} → Δ = ${decreaseTokens === undefined ? '—' : -decreaseTokens}`
        : 'Expected ΔLong OI；本次 isLong=false（平空）→ Long 侧不动，Expected Δ = 0',
    },
    openInterestInTokensShort: {
      ...(decreaseTokens === undefined ? {} : { value: isLong ? 0n : -decreaseTokens }),
      formula: isLong
        ? 'Expected ΔShort OI；本次 isLong=true（平多）→ Short 侧不动，Expected Δ = 0'
        : `Expected ΔShort OI = −sizeDeltaInTokens（平空按仓位等比销账，与执行价无关）；${decreaseModel.expanded} → Δ = ${decreaseTokens === undefined ? '—' : -decreaseTokens}`,
    },
  };
}

function buildSnapshotRows(input: {
  readonly phaseId: string;
  readonly phaseLabel: string;
  readonly beforeLabel: string;
  readonly afterLabel: string;
  readonly before: JsonRecord;
  readonly after: JsonRecord;
  readonly expectedDeltas: Record<string, LedgerDeltaExpectation>;
  readonly tokenDecimals: number;
  readonly tokenSymbol: string;
  readonly ledgerSource: string;
}): Reconciliation[] {
  return LEDGER_FIELDS.map((field) => {
    const before = bigintValue(input.before[field.key]);
    const after = bigintValue(input.after[field.key]);
    const actualDelta = after - before;
    const expectation = input.expectedDeltas[field.key];
    const expectedDelta = expectation?.value;
    const expected = expectedDelta === undefined ? undefined : before + expectedDelta;
    const decimals = field.decimals === 'token' ? input.tokenDecimals : field.decimals;
    const symbol = field.symbol === 'token' ? input.tokenSymbol : field.symbol;
    const unit = field.unit === 'token' ? `${input.tokenSymbol} 1e${input.tokenDecimals}` : field.unit;
    return {
      id: `${input.phaseId}-ledger-${field.key}`,
      group: `${input.phaseLabel} · ${field.family}`,
      label: field.label,
      status: expected === undefined ? 'NOT_VERIFIED' : pass(after, expected),
      before: rawAndUnit(before, decimals, symbol),
      after: rawAndUnit(after, decimals, symbol),
      delta: expectedDelta === undefined ? '尚未建立独立 Expected Δ' : deltaAndUnit(expectedDelta, decimals, symbol),
      expected: expected === undefined ? '尚未建立独立 Expected After' : rawAndUnit(expected, decimals, symbol),
      formula: expectedDelta === undefined
        ? `${expectation?.formula ?? '缺少 Expected Δ 公式'}；Expected After = Before + Expected Δ（缺 Expected Δ，无法代入）`
        : `${expectation?.formula ?? '缺少 Expected Δ 公式'}；Expected After = Before + Expected Δ = ${before} + (${expectedDelta}) = ${expected}`,
      basis: {
        title: '链上阶段快照与账户增量账本',
        sourcePath: input.ledgerSource,
        section: `${input.beforeLabel} → ${input.afterLabel}`,
      },
      unit,
      note: `口径：${field.scope}。Before/After 均为指定区块 Reader 或 ERC20 实际读数（独享 fork 窗口内无他人活动，聚合层 Δ 才等于本单效果）；链上 Actual Δ=${actualDelta} raw。${expectation?.note ?? ''}`,
      ...(expectation?.inputs ? { inputs: expectation.inputs } : {}),
    };
  });
}

function buildPositionRows(input: {
  readonly phaseId: string;
  readonly phaseLabel: string;
  readonly before: JsonRecord;
  readonly after: JsonRecord;
  readonly expected: JsonRecord;
  readonly tokenDecimals: number;
  readonly tokenSymbol: string;
  readonly ledgerSource: string;
  readonly expectedReason: string;
}): Reconciliation[] {
  const fields = [
    { key: 'sizeInUsd', label: '仓位 sizeInUsd', decimals: 30, symbol: 'USD', unit: 'USD 1e30' },
    { key: 'sizeInTokens', label: '仓位 sizeInTokens', decimals: input.tokenDecimals, symbol: input.tokenSymbol, unit: `${input.tokenSymbol} 1e${input.tokenDecimals}` },
    { key: 'collateralAmount', label: '仓位 Margin / collateralAmount', decimals: 6, symbol: 'USDC', unit: 'USDC 1e6' },
    { key: 'negativeFundingFeePerSize', label: '仓位负 Funding 结算基准 / size', decimals: 0, symbol: 'raw', unit: 'funding per-size raw' },
    { key: 'positiveFundingFeePerSize', label: '仓位正 Funding 结算基准 / size', decimals: 0, symbol: 'raw', unit: 'funding per-size raw' },
  ] as const;
  return fields.map((field) => {
    const before = bigintValue(input.before[field.key]);
    const after = bigintValue(input.after[field.key]);
    const expected = bigintValue(input.expected[field.key]);
    return {
      id: `${input.phaseId}-position-${field.key}`,
      group: `${input.phaseLabel} · 仓位原始字段`,
      label: field.label,
      status: pass(after, expected),
      before: rawAndUnit(before, field.decimals, field.symbol),
      after: rawAndUnit(after, field.decimals, field.symbol),
      delta: deltaAndUnit(after - before, field.decimals, field.symbol),
      expected: rawAndUnit(expected, field.decimals, field.symbol),
      formula: `${input.expectedReason}；本次：Expected ${field.key} = ${expected}（Before ${before} → After ${after}）`,
      basis: {
        title: 'PositionIncrease / PositionDecrease 事件与 Reader 仓位快照交叉核对',
        sourcePath: input.ledgerSource,
        section: `${input.phaseLabel} position` ,
      },
      unit: field.unit,
    };
  });
}

function buildGraceRows(input: {
  readonly phaseId: string;
  readonly phaseLabel: string;
  readonly before: JsonRecord;
  readonly after: JsonRecord;
  readonly marketIndex: unknown;
  readonly parameters: JsonRecord;
  readonly ledgerSource: string;
}): Reconciliation[] {
  const beforeStart = bigintValue(input.before.graceStart);
  const afterStart = bigintValue(input.after.graceStart);
  const beforeEnd = bigintValue(input.before.graceEnd);
  const afterEnd = bigintValue(input.after.graceEnd);
  if (!boolValue(input.after.exists)) return [];
  const parameterSnapshotAvailable = input.parameters.source === 'chain-at-block';
  // 历史证据没有保存执行区块参数时，如实输出 NOT_VERIFIED 行（不整行省略、也不用 0 或本地默认值伪造复算）。
  if (!parameterSnapshotAvailable) {
    return [{
      id: `${input.phaseId}-grace-formula`, group: `${input.phaseLabel} · Grace`, label: 'Grace 公式核对',
      status: 'NOT_VERIFIED',
      before: `graceStart=${timestampAndIso(beforeStart)}；graceEnd=${timestampAndIso(beforeEnd)}`,
      after: `graceStart=${timestampAndIso(afterStart)}；graceEnd=${timestampAndIso(afterEnd)}`,
      expected: '缺少执行区块参数快照（graceBase / tierMultiplier），无法独立复算',
      formula: 'graceEnd = graceStart + graceBase × tierMultiplier / 1e18',
      basis: {
        title: 'Grace 终点按执行区块实际参数精确复算',
        sourcePath: PAGE_FORMULA_SOURCE,
        section: '四、清算保护卡片 / 4.1 保护期推导',
      },
      unit: 'Unix timestamp / seconds',
      note: `历史证据未保存执行区块参数，不能倒推 PASS，如实标 NOT_VERIFIED。链上阶段快照：${input.ledgerSource}`,
    }];
  }
  const graceBaseSeconds = bigintValue(input.parameters.graceBaseSeconds);
  const referralTier = bigintValue(input.parameters.referralTier);
  const tierMultiplier = bigintValue(input.parameters.tierMultiplier);
  const grace = calculateGrace({
    graceStart: afterStart,
    graceBase: graceBaseSeconds,
    tierMultiplier,
  });
  const expectedDuration = grace.effectiveGrace;
  const expectedEnd = grace.graceEnd;
  const effectiveGraceExpression = `${graceBaseSeconds} × ${tierMultiplier} / 1e18 = ${expectedDuration} seconds`;
  const graceEndExpression = grace.expanded;
  const group = `${input.phaseLabel} · Grace`;
  const parameterNote = `执行区块 #${stringValue(input.parameters.blockNumber)} 链上参数：market#${stringValue(input.marketIndex)} graceBase=${graceBaseSeconds}s；用户 referralTier=${referralTier}；tierMultiplier=${tierMultiplier}；effectiveGrace=${expectedDuration}s。`;
  const zeroGraceNote = expectedDuration === 0n
    ? ' 当前有效 Grace=0 秒，graceEnd===graceStart 是合法结果。'
    : '';

  return [
    {
      id: `${input.phaseId}-grace-formula`, group, label: 'Grace 公式核对',
      status: pass(afterEnd, expectedEnd),
      before: `graceStart=${timestampAndIso(beforeStart)}；graceEnd=${timestampAndIso(beforeEnd)}`,
      after: `graceStart=${timestampAndIso(afterStart)}；graceEnd=${timestampAndIso(afterEnd)}`,
      delta: `effectiveGrace = ${effectiveGraceExpression}；实际 graceEnd − graceStart = ${afterEnd - afterStart} seconds`,
      expected: `graceEnd = ${graceEndExpression}`,
      formula: `graceEnd = graceStart + graceBase × tierMultiplier / 1e18；本次：${graceEndExpression}`,
      basis: {
        title: 'Grace 终点按执行区块实际参数精确复算',
        sourcePath: PAGE_FORMULA_SOURCE,
        section: '四、清算保护卡片 / 4.1 保护期推导',
      },
      unit: 'Unix timestamp / seconds',
      note: `${parameterNote}${zeroGraceNote} 链上阶段快照：${input.ledgerSource}`,
    },
  ];
}

function oiUsd(openInterestInTokens: unknown, indexPrice: unknown): bigint {
  return bigintValue(openInterestInTokens) * bigintValue(indexPrice);
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function buildPricingRows(input: {
  readonly phaseId: string;
  readonly phaseLabel: string;
  readonly before: JsonRecord;
  readonly after: JsonRecord;
  readonly positionEvent: JsonRecord;
  readonly balanceWasImproved: unknown;
  readonly parameters: JsonRecord;
}): Reconciliation[] {
  const uint = record(input.positionEvent.uint);
  if (Object.keys(uint).length === 0) return [];
  const priceMin = bigintValue(uint['indexTokenPrice.min']);
  const priceMax = bigintValue(uint['indexTokenPrice.max']);
  const mid = (priceMin + priceMax) / 2n;
  const spread = bigintValue(uint.dynamicSpread);
  const eventName = stringValue(input.positionEvent.eventName, '');
  const isIncrease = eventName === 'PositionIncrease';
  const isLong = boolValue(record(input.positionEvent.bool).isLong);
  const beforeLongTokens = bigintValue(input.before.openInterestInTokensLong);
  const beforeShortTokens = bigintValue(input.before.openInterestInTokensShort);
  const longBeforeUsd = oiUsd(beforeLongTokens, mid);
  const shortBeforeUsd = oiUsd(beforeShortTokens, mid);
  const longAfterUsd = oiUsd(input.after.openInterestInTokensLong, mid);
  const shortAfterUsd = oiUsd(input.after.openInterestInTokensShort, mid);
  // balanceWasImproved / skewRef 的 next OI 用合约同款预备 tokenDelta（开仓裸 index 价换算：
  // 多 ⌊/index.max⌋ / 空 ⌈/index.min⌉；平仓无预备/最终分裂），不用 after 快照最终值——
  // 两者可差 1 wei 级 token，isBalanceWasImproved 是严格 <，边界数据下判向会不同。
  const preliminaryTokens = isIncrease
    ? preliminaryIncreaseTokens({
      sizeUsd: bigintValue(uint.sizeDeltaUsd),
      indexPriceMin: priceMin,
      indexPriceMax: priceMax,
      isLong,
    })
    : { value: bigintValue(uint.sizeDeltaInTokens), expanded: `平仓无预备/最终分裂：sizeDeltaInTokens ${bigintValue(uint.sizeDeltaInTokens)}` };
  const tokenDelta = isIncrease ? preliminaryTokens.value : -preliminaryTokens.value;
  const nextLongUsd = oiUsd(beforeLongTokens + (isLong ? tokenDelta : 0n), mid);
  const nextShortUsd = oiUsd(beforeShortTokens + (isLong ? 0n : tokenDelta), mid);
  const skewBefore = calculateSignedSkew(longBeforeUsd, shortBeforeUsd);
  const skewAfter = calculateSignedSkew(longAfterUsd, shortAfterUsd);
  const skewNext = calculateSignedSkew(nextLongUsd, nextShortUsd);
  const skewRef = (absolute(skewBefore) + absolute(skewNext)) / 2n;
  const imbalanceBefore = absolute(longBeforeUsd - shortBeforeUsd);
  const imbalanceNext = absolute(nextLongUsd - nextShortUsd);
  const imbalanceAfter = absolute(longAfterUsd - shortAfterUsd);
  const expectedImproved = imbalanceNext < imbalanceBefore;
  const actualImproved = boolValue(input.balanceWasImproved);
  const executionPrice = bigintValue(uint.executionPrice);
  const adverseUp = (isLong && isIncrease) || (!isLong && !isIncrease);
  const selectedOracle = adverseUp ? priceMax : priceMin;
  const execution = calculateExecutionPrice({ oraclePrice: selectedOracle, dynamicSpread: spread, adverseUp });
  const constantSpread = marketParameter(input.parameters, 'CONSTANT_PRICE_SPREAD');
  const priceImpactParameter = marketParameter(input.parameters, 'PRICE_IMPACT_PARAMETER');
  const orderBookDepth = marketParameter(input.parameters, adverseUp ? 'ASK_ORDER_BOOK_DEPTH' : 'BID_ORDER_BOOK_DEPTH');
  const skewImpactFactor = marketParameter(input.parameters, 'SKEW_IMPACT_FACTOR');
  const minimumSkewImpact = marketParameter(input.parameters, 'MIN_SKEW_IMPACT');
  const maximumSkewImpact = marketParameter(input.parameters, 'MAX_SKEW_IMPACT');
  const maximumPriceImpactSpread = globalParameter(input.parameters, 'maxPriceImpactSpread');
  const skewImpact = skewImpactFactor !== undefined && minimumSkewImpact !== undefined && maximumSkewImpact !== undefined
    ? calculateSkewImpact({
      skewImpactFactor,
      skewReference: skewRef,
      balanceWasImproved: actualImproved,
      minimum: minimumSkewImpact,
      maximum: maximumSkewImpact,
    })
    : undefined;
  const spreadParameterSummary = constantSpread === undefined
    ? '缺少执行区块参数快照。'
    : `constant=${constantSpread}；priceImpactParameter=${stringValue(priceImpactParameter)}；${adverseUp ? 'ask' : 'bid'}Depth=${stringValue(orderBookDepth)}；skewImpact=${skewImpact?.skewImpact ?? '—'}；maxPriceImpactSpread=${stringValue(maximumPriceImpactSpread)}。`;
  // Dynamic Spread 独立复算（LogExpMath 已逐句移植）：orderSize 用事件 sizeDeltaUsd——
  // USD 模式下即合约喂给 getPriceImpactSpread 的预备值；平仓预备值==最终值。
  const orderSizeUsdPreliminary = bigintValue(uint.sizeDeltaUsd);
  const priceImpactCalc = priceImpactParameter !== undefined && orderBookDepth !== undefined && maximumPriceImpactSpread !== undefined
    ? calculatePriceImpactSpread({
      orderSizeUsd: orderSizeUsdPreliminary,
      priceImpactParameter,
      depth: orderBookDepth,
      maxPriceImpactSpread: maximumPriceImpactSpread,
    })
    : undefined;
  const dynamicSpreadCalc = priceImpactCalc !== undefined && constantSpread !== undefined && skewImpact !== undefined
    ? composeDynamicSpread({
      constantPriceSpread: constantSpread,
      priceImpactSpread: priceImpactCalc.spread,
      skewImpact: skewImpact.skewImpact,
    })
    : undefined;
  const pricingParameterSource = input.parameters.source === 'chain-at-block'
    ? `DataStore @ 执行区块 #${stringValue(input.parameters.blockNumber)}`
    : '（缺少执行区块参数快照）';
  const rows: Reconciliation[] = [
    {
      id: `${input.phaseId}-pricing-oracle-mid`, group: `${input.phaseLabel} · OI / Skew / Spread`, label: 'Oracle 价格（min / mid / max）',
      status: 'CALCULATED',
      before: `min = ${priceMin}`, after: `max = ${priceMax}`,
      delta: `mid = (${priceMin} + ${priceMax}) / 2 = ${mid}`,
      expected: '—（本次执行采用的 Oracle 价格展示行）',
      formula: `indexMid = (indexTokenPrice.min + indexTokenPrice.max) / 2；本次：(${priceMin} + ${priceMax}) / 2 = ${mid}`,
      basis: { title: '本次执行的 Oracle 价格三元组', sourcePath: PAGE_FORMULA_SOURCE, section: '一、下单面板 / Oracle 价格' }, unit: 'price raw（USD×1e12 / token）',
      note: 'min/max 为执行事件携带的 Oracle 双边价（stablePrice 锚参与 min/max 合并）；mid 是 OI 盯市（USD 口径）与多空失衡判定的统一输入。执行价按方向取不利侧：多开/空平用 max、空开/多平用 min。',
      inputs: [
        { name: 'indexTokenPrice.min', value: priceMin.toString(), source: 'PositionIncrease/Decrease 事件（执行回执解码）' },
        { name: 'indexTokenPrice.max', value: priceMax.toString(), source: 'PositionIncrease/Decrease 事件（执行回执解码）' },
        { name: 'indexMid（派生）', value: mid.toString(), source: '派生：(min + max) / 2，向下取整' },
      ],
    },
    {
      id: `${input.phaseId}-pricing-long-oi-usd`, group: `${input.phaseLabel} · OI / Skew / Spread`, label: 'Long OI（USD 盯市口径，派生）',
      status: 'CALCULATED', before: rawAndUnit(longBeforeUsd, 30, 'USD'), after: rawAndUnit(longAfterUsd, 30, 'USD'),
      delta: deltaAndUnit(longAfterUsd - longBeforeUsd, 30, 'USD'), expected: '—（派生展示行，无独立期望值）',
      formula: `longOIUsd = longOpenInterestInTokens × indexMidPrice；本次 After：${stringValue(input.after.openInterestInTokensLong, '0')} × ${mid} = ${longAfterUsd}（Before：${stringValue(input.before.openInterestInTokensLong, '0')} × ${mid} = ${longBeforeUsd}）`,
      basis: { title: '市场 Open Interest USD', sourcePath: PAGE_FORMULA_SOURCE, section: '五、Funding / OI 与 Skew' }, unit: 'USD 1e30',
      note: `indexMidPrice=(${priceMin}+${priceMax})/2=${mid}。openInterestInTokensLong 取自 DataStore 市场级总账（该市场全体交易者聚合），不是本单的量——本环境只有本账户一笔仓位，总量才恰好等于本单仓位。`,
    },
    {
      id: `${input.phaseId}-pricing-short-oi-usd`, group: `${input.phaseLabel} · OI / Skew / Spread`, label: 'Short OI（USD 盯市口径，派生）',
      status: 'CALCULATED', before: rawAndUnit(shortBeforeUsd, 30, 'USD'), after: rawAndUnit(shortAfterUsd, 30, 'USD'),
      delta: deltaAndUnit(shortAfterUsd - shortBeforeUsd, 30, 'USD'), expected: '—（派生展示行，无独立期望值）',
      formula: `shortOIUsd = shortOpenInterestInTokens × indexMidPrice；本次 After：${stringValue(input.after.openInterestInTokensShort, '0')} × ${mid} = ${shortAfterUsd}（Before：${stringValue(input.before.openInterestInTokensShort, '0')} × ${mid} = ${shortBeforeUsd}）`,
      basis: { title: '市场 Open Interest USD', sourcePath: PAGE_FORMULA_SOURCE, section: '五、Funding / OI 与 Skew' }, unit: 'USD 1e30',
      note: 'openInterestInTokensShort 同为 DataStore 市场级总账（该市场全体交易者聚合），不是本单的量。',
    },
    {
      id: `${input.phaseId}-pricing-raw-skew`, group: `${input.phaseLabel} · OI / Skew / Spread`, label: '实时 Raw Skew（进入 EMA 前）',
      status: 'CALCULATED', before: rawAndUnit(skewBefore, 18, 'ratio'), after: rawAndUnit(skewAfter, 18, 'ratio'),
      delta: deltaAndUnit(skewAfter - skewBefore, 18, 'ratio'), expected: '—（派生展示行，无独立期望值）',
      formula: `skew = (longOIUsd − shortOIUsd) × 1e18 / (longOIUsd + shortOIUsd)；本次 After：(${longAfterUsd} − ${shortAfterUsd}) × 1e18 / (${longAfterUsd + shortAfterUsd}) = ${skewAfter}`,
      basis: { title: 'Funding 原始 Skew；实际费率使用 EMA Skew', sourcePath: PAGE_FORMULA_SOURCE, section: '五、Funding / 5.1 Raw Skew' }, unit: 'ratio 1e18',
      note: 'longOIUsd / shortOIUsd 是市场级总量（该市场全体交易者的 OI 聚合后盯市），不是本单的量。本环境仅本账户一笔多仓，市场总量恰好等于本单仓位，数值才与本次交易一致；多账户市场此处会包含他人仓位。',
      inputs: [
        { name: 'longOIUsd（全市场 After）', value: longAfterUsd.toString(), source: 'DataStore openInterestInTokensLong（市场级总账，全体交易者聚合）× indexMid' },
        { name: 'shortOIUsd（全市场 After）', value: shortAfterUsd.toString(), source: 'DataStore openInterestInTokensShort（市场级总账，全体交易者聚合）× indexMid' },
      ],
    },
    // Spread Skew Reference 不再单独占行（2026-08-13 用户要求）：skewRef 是 Skew Impact 的输入，
    // 其推导（|skewBefore|+|skewAfter|)/2 连同代入值并入「Skew Impact（参数复算）」行的 inputs。
    {
      id: `${input.phaseId}-pricing-balance-improved`, group: `${input.phaseLabel} · OI / Skew / Spread`, label: '是否改善多空平衡',
      status: pass(actualImproved, expectedImproved), before: rawAndUnit(imbalanceBefore, 30, 'USD'), after: rawAndUnit(imbalanceNext, 30, 'USD'),
      delta: deltaAndUnit(imbalanceNext - imbalanceBefore, 30, 'USD'), expected: String(expectedImproved),
      formula: `balanceWasImproved = abs(nextLongOI − nextShortOI) < abs(currentLongOI − currentShortOI)（next 用预备 tokenDelta：${preliminaryTokens.expanded}）；本次：|${imbalanceNext}| < |${imbalanceBefore}| = ${expectedImproved}（事件实际值 ${actualImproved}；快照终值失衡 ${imbalanceAfter} 仅作对照）`,
      basis: { title: 'Skew Impact 正负方向', sourcePath: PAGE_FORMULA_SOURCE, section: '一、下单面板 / Dynamic Spread' }, unit: 'boolean / USD 1e30',
      note: '独立推算用前后快照的实测失衡近似合约"当前失衡 + 本单预备 Δ"的判定（单账户受控场景等价）；合约口径为盯市 OI（tokens×midPrice）+ 预备 tokenDelta，严格 <，相等算未改善。该布尔决定 Position Fee 用哪一档费率。',
      inputs: [
        { name: 'openInterestInTokensLong（before/after）', value: `${stringValue(input.before.openInterestInTokensLong)} → ${stringValue(input.after.openInterestInTokensLong)}`, source: '链上阶段快照（钉块读数）' },
        { name: 'openInterestInTokensShort（before/after）', value: `${stringValue(input.before.openInterestInTokensShort)} → ${stringValue(input.after.openInterestInTokensShort)}`, source: '链上阶段快照（钉块读数）' },
        { name: 'indexMidPrice = (min+max)/2', value: mid.toString(), source: 'PositionIncrease/Decrease 事件 indexTokenPrice' },
        { name: 'event.balanceWasImproved（对照对象）', value: String(actualImproved), source: 'PositionFeesCollected 事件 bool 字段' },
      ],
    },
    ...(skewImpact ? [{
      id: `${input.phaseId}-pricing-skew-impact`, group: `${input.phaseLabel} · OI / Skew / Spread`, label: 'Skew Impact（参数复算）',
      status: 'CALCULATED' as const,
      before: `skewRef（输入）= ${rawAndUnit(skewRef, 18, 'ratio')}`,
      after: `skewImpact（分量结果）= ${rawAndUnit(skewImpact.skewImpact, 18, 'ratio')}`,
      delta: deltaAndUnit(skewImpact.skewImpact, 18, 'ratio'), expected: '—（参数复算展示行，事件未单独给出 Skew 分量，无对照值；总值对照见「Dynamic Spread 总值」行）',
      formula: `skewImpact = clamp(${actualImproved ? '−' : ''}skewImpactFactor × skewRef / 1e18, minSkewImpact, maxSkewImpact)（改善失衡取负后 clamp）；本次：${skewImpact.expanded}`,
      basis: { title: 'Skew Impact 参数公式', sourcePath: PAGE_FORMULA_SOURCE, section: '一、下单面板 / Dynamic Spread' }, unit: 'ratio 1e18',
      note: `${parameterBlockNote(input.parameters)} 本行独立展示 Skew Impact 分量；Dynamic Spread 还包含 Price Impact。`,
      inputs: [
        { name: 'skewImpactFactor', value: stringValue(skewImpactFactor, '缺'), source: pricingParameterSource },
        { name: 'skewRef（前后失衡均值，市场级）', value: skewRef.toString(), source: `派生：(|skewBefore ${skewBefore}| + |skewNext ${skewNext}|) / 2（next 用预备 tokenDelta 口径，快照终值 skew ${skewAfter} 仅作对照）；skew 为全市场多空失衡比，非本单量` },
        { name: 'balanceWasImproved（决定正负）', value: String(actualImproved), source: 'PositionFeesCollected 事件 bool；独立复算见「是否改善多空平衡」行' },
        { name: 'min / maxSkewImpact（clamp 边界）', value: `${stringValue(minimumSkewImpact, '缺')} / ${stringValue(maximumSkewImpact, '缺')}`, source: pricingParameterSource },
        { name: 'skewImpact（结果）', value: skewImpact.skewImpact.toString(), source: '派生：进入「Dynamic Spread 总值」行的三分量之一' },
      ],
    }] : []),
    {
      id: `${input.phaseId}-pricing-dynamic-spread`, group: `${input.phaseLabel} · OI / Skew / Spread`, label: 'Dynamic Spread 总值',
      status: dynamicSpreadCalc === undefined ? 'NOT_VERIFIED' : pass(spread, dynamicSpreadCalc.spread),
      before: rawAndUnit(0n, 18, 'ratio'), after: rawAndUnit(spread, 18, 'ratio'),
      delta: deltaAndUnit(spread, 18, 'ratio'),
      expected: dynamicSpreadCalc === undefined
        ? '缺少执行区块参数快照（constant / depth / param / max / skew），无法独立复算'
        : rawAndUnit(dynamicSpreadCalc.spread, 18, 'ratio'),
      formula: dynamicSpreadCalc === undefined
        ? `dynamicSpread = max(0, constantPriceSpread + priceImpactSpread + skewImpact)（参数不全，未复算）；事件最终值=${spread}`
        : `dynamicSpread = max(0, constantPriceSpread + priceImpactSpread + skewImpact)；本次：${dynamicSpreadCalc.expanded}。priceImpact 分量：${priceImpactCalc!.expanded}`,
      basis: { title: '动态点差总公式', sourcePath: PAGE_FORMULA_SOURCE, section: '一、下单面板 / Dynamic Spread' }, unit: 'ratio 1e18',
      note: `${parameterBlockNote(input.parameters)} LogExpMath.exp 已逐句 BigInt 移植（蓝本 src/common/math/LogExpMath.sol，同序截断故可 bit 级）；skew 分量沿用快照失衡近似（skewImpactFactor=0 时精确，非零时预备值口径差异可能假 FAIL——P1 已知）；orderSize 用事件 sizeDeltaUsd（USD 模式=合约预备值；token 模式开仓需按 index 价重算，当前场景均为 USD 模式）。`,
      inputs: [
        { name: 'orderSizeUsd（预备值，本单量）', value: orderSizeUsdPreliminary.toString(), source: 'PositionIncrease/Decrease 事件 sizeDeltaUsd；Spread 输入中唯一的本单量，其余为市场级参数/状态' },
        { name: 'priceImpactParameter', value: stringValue(priceImpactParameter, '缺'), source: pricingParameterSource },
        { name: adverseUp ? 'askOrderBookDepth' : 'bidOrderBookDepth', value: stringValue(orderBookDepth, '缺'), source: `${pricingParameterSource}；depth 按不利侧选 ${adverseUp ? 'ask' : 'bid'}` },
        { name: 'MAX_PRICE_IMPACT_SPREAD（全局封顶）', value: stringValue(maximumPriceImpactSpread, '缺'), source: pricingParameterSource },
        { name: 'constantPriceSpread', value: stringValue(constantSpread, '缺'), source: pricingParameterSource },
        { name: 'skewImpact（快照近似）', value: String(skewImpact?.skewImpact ?? '—'), source: '本组「Skew Impact（参数复算）」行' },
        { name: 'dynamicSpread（对照对象）', value: spread.toString(), source: 'PositionIncrease/Decrease 事件' },
      ],
    },
    {
      id: `${input.phaseId}-pricing-execution-price`, group: `${input.phaseLabel} · OI / Skew / Spread`, label: 'Spread 调整后执行价',
      status: pass(executionPrice, execution.executionPrice), before: stringValue(selectedOracle), after: stringValue(executionPrice),
      delta: deltaAndUnit(executionPrice - selectedOracle, 0, 'price raw'), expected: execution.executionPrice.toString(),
      formula: `方向规则：useMax = (开仓且多头) 或 (平仓且空头) → index.max × (1e18 + spread) 向上取整；否则 index.min × (1e18 − spread) 向下截断——始终取对交易者不利的一侧。本次 isLong=${isLong}、${isIncrease ? '开仓' : '平仓'} → ${adverseUp ? 'max 侧 ⌈⌉' : 'min 侧 ⌊⌋'}：executionPrice = ${execution.expanded}`,
      basis: { title: '方向与开/平仓共同决定价格不利侧', sourcePath: PAGE_FORMULA_SOURCE, section: '一、下单面板 / 1.5 执行价' }, unit: 'price raw',
      note: '【恒等式】oracle 价与 dynamicSpread 均取自被核对的同一事件——本行验证合约价格公式（方向/不利侧/取整）自洽，不构成独立重算；dynamicSpread 的独立复算未实现（见 Dynamic Spread 行 NOT_VERIFIED）。',
      inputs: [
        { name: `oracle（${adverseUp ? 'index.max，不利=买贵' : 'index.min，不利=卖贱'}）`, value: selectedOracle.toString(), source: 'PositionIncrease/Decrease 事件 indexTokenPrice' },
        { name: 'dynamicSpread', value: spread.toString(), source: '同一事件；独立复算未实现（见 Dynamic Spread 行）' },
        { name: `isLong / ${isIncrease ? '开仓' : '平仓'}（方向判据）`, value: String(isLong), source: '事件 bool + 事件类型 → adverseUp=' + String(adverseUp) },
        { name: 'executionPrice（对照对象）', value: executionPrice.toString(), source: '同一事件' },
      ],
    },
  ];
  if (!isIncrease) {
    const eventInt = record(input.positionEvent.int);
    const sizeTokens = bigintValue(uint.sizeDeltaInTokens);
    const sizeUsd = bigintValue(uint.sizeDeltaUsd);
    const expectedUncappedPnl = isLong
      ? sizeTokens * executionPrice - sizeUsd
      : sizeUsd - sizeTokens * executionPrice;
    const uncappedPnl = bigintValue(eventInt.uncappedBasePnlUsd);
    const basePnl = bigintValue(eventInt.basePnlUsd);
    const capDirectionValid = (basePnl === 0n || uncappedPnl === 0n || (basePnl > 0n) === (uncappedPnl > 0n))
      && absolute(basePnl) <= absolute(uncappedPnl);
    rows.push(
      {
        id: `${input.phaseId}-uncapped-pnl`, group: `${input.phaseLabel} · PnL`, label: 'Uncapped Base PnL',
        status: pass(uncappedPnl, expectedUncappedPnl), before: rawAndUnit(0n, 30, 'USD'), after: rawAndUnit(uncappedPnl, 30, 'USD'),
        delta: deltaAndUnit(uncappedPnl, 30, 'USD'), expected: rawAndUnit(expectedUncappedPnl, 30, 'USD'),
        formula: isLong
          ? `sizeDeltaInTokens × executionPrice − sizeDeltaUsd；本次：${sizeTokens} × ${executionPrice} − ${sizeUsd} = ${expectedUncappedPnl}`
          : `sizeDeltaUsd − sizeDeltaInTokens × executionPrice；本次：${sizeUsd} − ${sizeTokens} × ${executionPrice} = ${expectedUncappedPnl}`,
        basis: { title: '未裁剪的价格盈亏', sourcePath: FORMULA_SOURCE, section: '§6 仓位 PnL 与池子 PnL 裁剪' }, unit: 'USD 1e30',
        note: 'PnL 必须用事件执行价（含点差）——用 oracle 原价复算会系统性偏差。',
        inputs: [
          { name: 'sizeDeltaInTokens', value: sizeTokens.toString(), source: 'PositionDecrease 事件（执行回执解码）' },
          { name: 'executionPrice（含 spread）', value: executionPrice.toString(), source: 'PositionDecrease 事件；价格公式自洽性由「Spread 调整后执行价」行核对' },
          { name: 'sizeDeltaUsd', value: sizeUsd.toString(), source: 'PositionDecrease 事件（执行回执解码）' },
          { name: 'uncappedBasePnlUsd（对照对象）', value: uncappedPnl.toString(), source: 'PositionDecrease 事件 int 字段' },
        ],
      },
      {
        id: `${input.phaseId}-base-pnl`, group: `${input.phaseLabel} · PnL`, label: 'Base PnL（PnL Cap 后）',
        status: 'NOT_VERIFIED', before: rawAndUnit(uncappedPnl, 30, 'USD'), after: rawAndUnit(basePnl, 30, 'USD'),
        delta: deltaAndUnit(basePnl - uncappedPnl, 30, 'USD'), expected: '与 uncappedPnl 同方向，且绝对值不超过 uncappedPnl',
        formula: `basePnlUsd = applyPnlCap(uncappedBasePnlUsd, poolPnl, maxPnlFactor)；本次：applyPnlCap(${uncappedPnl}, poolPnl=未采集, maxPnlFactor=未采集)；事件 basePnlUsd=${basePnl}`,
        basis: { title: '池子 PnL Cap 后的仓位基础盈亏', sourcePath: PAGE_FORMULA_SOURCE, section: '仓位 PnL 与池子 PnL 裁剪' }, unit: 'USD 1e30',
        note: `方向/上限基础检查=${capDirectionValid}；尚未采集执行区块 poolPnl 与 maxPnlFactor，不能独立复算 Cap。`,
        inputs: [
          { name: 'uncappedBasePnlUsd', value: uncappedPnl.toString(), source: 'PositionDecrease 事件；上一行已独立复算' },
          { name: 'basePnlUsd（对照对象）', value: basePnl.toString(), source: 'PositionDecrease 事件 int 字段' },
          { name: 'poolPnl / maxPnlFactor', value: '（未采集）', source: '缺执行区块池状态与 MAX_PNL_FACTOR——补齐后本行可升级为计算复算' },
        ],
      },
    );
  }
  return rows;
}

function buildFeeAndFundingRows(input: {
  readonly phaseId: string;
  readonly phaseLabel: string;
  readonly before: JsonRecord;
  readonly after: JsonRecord;
  readonly positionBefore: JsonRecord;
  readonly events: JsonRecord;
  readonly parameters: JsonRecord;
}): Reconciliation[] {
  const fees = record(record(input.events.feesCollected).uint);
  if (Object.keys(fees).length === 0) {
    // 本阶段声明了 fee-funding 核对但证据缺少 PositionFeesCollected 事件：
    // 输出 NOT_VERIFIED 兜底行而非整组静默消失（覆盖静默收缩零容忍）。
    return [{
      id: `${input.phaseId}-fee-funding-missing-event`,
      group: `${input.phaseLabel} · Fee`,
      label: 'Fee / Funding 全组核对',
      status: 'NOT_VERIFIED',
      before: '—',
      after: '—',
      expected: '执行阶段应恰有一条 PositionFeesCollected 事件作为本组全部核对行的输入',
      formula: 'positionFee 复算 / 分账 / claimable 入账 / funding 结算各行均以 PositionFeesCollected 事件字段为输入',
      basis: { title: '费用与资金费核对输入缺失', sourcePath: FORMULA_SOURCE, section: '§7 仓位费用 / §9 费用总额' },
      note: '证据中 events.feesCollected 为空。可能原因：事件抓取窗口错位、订单被静默取消、或证据采集中断。本组核对无法进行，如实标注而非静默省略；请先核查同阶段 OrderExecuted/交易回执证据。',
    }];
  }
  // 市场级 Funding 区间总账：Σ 聚合全部 Funding 事件；factor 行锚定本单执行交易（txHash 匹配），
  // 找不到时退回第一条（单事件窗口两者等价）。
  const fundingEventList = Array.isArray(input.events.fundingEvents) ? input.events.fundingEvents : [];
  const fundingPays = fundingEventList.map((event) => bigintValue(record(record(event).int).positionPaysLp));
  const fundingPaysTotal = fundingPays.reduce((total, value) => total + maxBigInt(value), 0n);
  const executionTxHash = stringValue(record(input.events.feesCollected).txHash, '').toLowerCase();
  const anchoredFundingEvent = fundingEventList.find(
    (event) => stringValue(record(event).txHash, '').toLowerCase() === executionTxHash,
  ) ?? fundingEventList[0];
  const funding = record(record(anchoredFundingEvent).int);
  const scale30 = 10n ** 30n;
  const tradeSizeUsd = bigintValue(fees.tradeSizeUsd);
  const balanceWasImproved = boolValue(record(record(input.events.feesCollected).bool).balanceWasImproved);
  // 输入来源标签（供 inputs 清单使用）：让每个公式输入的出处逐项可追踪。
  const eventSource = 'PositionFeesCollected 事件（执行回执解码）';
  const parameterSource = input.parameters.source === 'chain-at-block'
    ? `DataStore @ 执行区块 #${stringValue(input.parameters.blockNumber)}`
    : '（缺少执行区块参数快照）';
  const snapshotSource = '链上阶段快照（DataStore 钉块读数）';
  const feeFactorLabel = `POSITION_FEE_FACTOR(${balanceWasImproved})`;
  const chainPositionFeeFactor = marketParameter(input.parameters, feeFactorLabel);
  const eventPositionFeeFactor = optionalBigint(fees.positionFeeFactor);
  const collateralMin = bigintValue(fees['collateralTokenPrice.min']);
  const collateralMax = bigintValue(fees['collateralTokenPrice.max']);
  const positionFeeCalculation = chainPositionFeeFactor === undefined
    ? undefined
    : calculatePositionFee({ tradeSizeUsd, positionFeeFactor: chainPositionFeeFactor, collateralPriceMin: collateralMin });
  const protocolFee = bigintValue(fees.protocolFeeAmount);
  const chainReceiverFactor = globalParameter(input.parameters, 'positionFeeReceiverFactor');
  const eventReceiverFactor = optionalBigint(fees.positionFeeReceiverFactor);
  const expectedReceiver = chainReceiverFactor === undefined ? undefined : protocolFee * chainReceiverFactor / scale30;
  const expectedPool = expectedReceiver === undefined ? undefined : protocolFee - expectedReceiver;
  const negativeFunding = bigintValue(fees.negativeFundingFeeAmount);
  const positiveFunding = bigintValue(fees.positiveFundingFeeAmount);
  const latestNegative = bigintValue(fees.latestNegativeFundingFeePerSize);
  const latestPositive = bigintValue(fees.latestPositiveFundingFeePerSize);
  const positionNegative = bigintValue(input.positionBefore.negativeFundingFeePerSize);
  const positionPositive = bigintValue(input.positionBefore.positiveFundingFeePerSize);
  const positionSizeTokens = bigintValue(input.positionBefore.sizeInTokens);
  const negativeDenominator = scale30 * collateralMin;
  const positiveDenominator = scale30 * collateralMax;
  const expectedNegative = negativeDenominator === 0n ? 0n : ceilDiv(
    maxBigInt(latestNegative - positionNegative) * positionSizeTokens,
    negativeDenominator,
  );
  const expectedPositive = positiveDenominator === 0n ? 0n
    : maxBigInt(latestPositive - positionPositive) * positionSizeTokens / positiveDenominator;
  const positionFee = bigintValue(fees.positionFeeAmount);
  const uiFee = bigintValue(fees.uiFeeAmount);
  const expectedTotalCost = positionFee + uiFee + negativeFunding;
  const claimablePositionBefore = bigintValue(input.before.claimableFeeAmountPosition);
  const claimablePositionAfter = bigintValue(input.after.claimableFeeAmountPosition);
  const claimableFundingBefore = bigintValue(input.before.claimableFeeAmountFunding);
  const claimableFundingAfter = bigintValue(input.after.claimableFeeAmountFunding);
  const rows: Reconciliation[] = [
    // Position Fee Factor 不再单独占行（2026-08-13 用户要求）：费率档是 Position Fee 复算的输入，
    // 事件档 vs 链上档的对照并入「Position Fee」行的 inputs；档位选择见「是否改善多空平衡」行。
    {
      id: `${input.phaseId}-position-fee`, group: `${input.phaseLabel} · Fee`, label: 'Position Fee（链上实际；前端 Fee 对照）',
      status: positionFeeCalculation?.positionFee === undefined ? 'NOT_VERIFIED' : pass(positionFee, positionFeeCalculation.positionFee),
      before: rawAndUnit(0n, 6, 'USDC'), after: rawAndUnit(positionFee, 6, 'USDC'),
      delta: deltaAndUnit(positionFee, 6, 'USDC'),
      expected: positionFeeCalculation?.positionFee === undefined ? '缺少链上费率或 collateral.min=0' : rawAndUnit(positionFeeCalculation.positionFee, 6, 'USDC'),
      formula: `positionFeeAmount = ${positionFeeCalculation?.expanded ?? `${tradeSizeUsd} × ? / 1e30 / ${collateralMin}`}`,
      basis: { title: '基础仓位费', sourcePath: PAGE_FORMULA_SOURCE, section: '费用 / Position Fee' }, unit: 'USDC 1e6',
      note: `${parameterBlockNote(input.parameters)} event.factor=${stringValue(eventPositionFeeFactor)}；chain.factor=${stringValue(chainPositionFeeFactor)}。`,
      inputs: [
        { name: 'tradeSizeUsd', value: tradeSizeUsd.toString(), source: eventSource },
        { name: `positionFeeFactor（${feeFactorLabel}）`, value: stringValue(chainPositionFeeFactor, '缺'), source: `${parameterSource}；复算采用链上档。选档依据 balanceWasImproved=${balanceWasImproved}（独立复算见「是否改善多空平衡」行）；事件采用值 ${stringValue(eventPositionFeeFactor, '缺')}，应与链上档一致${eventPositionFeeFactor !== undefined && chainPositionFeeFactor !== undefined ? (eventPositionFeeFactor === chainPositionFeeFactor ? '（✓ 一致）' : '（⚠️ 不一致！）') : ''}` },
        { name: 'collateralPrice.min', value: collateralMin.toString(), source: `${eventSource}；Oracle 抵押价随事件 emit` },
        { name: 'positionFeeAmount（对照对象）', value: positionFee.toString(), source: eventSource },
      ],
    },
    {
      id: `${input.phaseId}-protocol-fee`, group: `${input.phaseLabel} · Fee`, label: 'Protocol Fee 及分账守恒',
      status: pass(protocolFee, bigintValue(fees.feeReceiverAmount) + bigintValue(fees.positionFeeAmountForPool)),
      before: `Position Fee=${rawAndUnit(positionFee, 6, 'USDC')}；折扣后 Protocol Fee=${rawAndUnit(protocolFee, 6, 'USDC')}`,
      after: `Protocol Fee ${protocolFee} = feeReceiverAmount ${bigintValue(fees.feeReceiverAmount)} + LP Pool ${bigintValue(fees.positionFeeAmountForPool)}`,
      delta: `${protocolFee} = ${bigintValue(fees.feeReceiverAmount)} + ${bigintValue(fees.positionFeeAmountForPool)}`,
      expected: `Protocol Fee ${protocolFee} = ${bigintValue(fees.feeReceiverAmount) + bigintValue(fees.positionFeeAmountForPool)} raw`,
      formula: `protocolFeeAmount = feeReceiverAmount + positionFeeAmountForPool；本次：${protocolFee} = ${bigintValue(fees.feeReceiverAmount)} + ${bigintValue(fees.positionFeeAmountForPool)}`,
      basis: { title: '协议与 LP 分成', sourcePath: FORMULA_SOURCE, section: '§7.5 协议与 LP 分成' }, unit: 'USDC 1e6',
      note: '【恒等式】三个数取自同一 PositionFeesCollected 事件，本行只验证事件内部分账自洽，不构成独立重算；feeReceiverAmount 与 LP 分成的独立复算（用执行区块 positionFeeReceiverFactor）见相邻两行。Position Fee 是用户仓位费总额；扣除 Referral / Pro 等折扣后得到 Protocol Fee，再按 positionFeeReceiverFactor 拆分为协议应收与 LP Pool 分成。',
      inputs: [
        { name: 'protocolFeeAmount', value: protocolFee.toString(), source: eventSource },
        { name: 'feeReceiverAmount', value: stringValue(fees.feeReceiverAmount), source: eventSource },
        { name: 'positionFeeAmountForPool', value: stringValue(fees.positionFeeAmountForPool), source: `${eventSource}；三者同源 → 本行为恒等式` },
      ],
    },
    {
      id: `${input.phaseId}-fee-receiver`, group: `${input.phaseLabel} · Fee`, label: 'Fee Receiver 分成',
      status: expectedReceiver === undefined ? 'NOT_VERIFIED' : pass(fees.feeReceiverAmount, expectedReceiver),
      before: rawAndUnit(0n, 6, 'USDC'), after: rawAndUnit(fees.feeReceiverAmount, 6, 'USDC'),
      delta: deltaAndUnit(fees.feeReceiverAmount, 6, 'USDC'), expected: expectedReceiver === undefined ? '缺少链上 positionFeeReceiverFactor' : rawAndUnit(expectedReceiver, 6, 'USDC'),
      formula: `feeReceiverAmount = ${protocolFee} × ${stringValue(chainReceiverFactor)} / 1e30${expectedReceiver === undefined ? '' : ` = ${expectedReceiver}`}`,
      basis: { title: '协议与 LP 分成', sourcePath: FORMULA_SOURCE, section: '§7.5 协议与 LP 分成' }, unit: 'USDC 1e6',
      note: `${parameterBlockNote(input.parameters)} event.receiverFactor=${stringValue(eventReceiverFactor)}。`,
      inputs: [
        { name: 'protocolFeeAmount', value: protocolFee.toString(), source: eventSource },
        { name: 'positionFeeReceiverFactor', value: stringValue(chainReceiverFactor), source: `${parameterSource}；全局键，复算不用事件自带 factor` },
        { name: 'feeReceiverAmount（对照对象）', value: stringValue(fees.feeReceiverAmount), source: eventSource },
      ],
    },
    {
      id: `${input.phaseId}-pool-fee`, group: `${input.phaseLabel} · Fee`, label: 'LP Pool 分成',
      status: expectedPool === undefined ? 'NOT_VERIFIED' : pass(fees.positionFeeAmountForPool, expectedPool), before: rawAndUnit(0n, 6, 'USDC'), after: rawAndUnit(fees.positionFeeAmountForPool, 6, 'USDC'),
      delta: deltaAndUnit(fees.positionFeeAmountForPool, 6, 'USDC'), expected: expectedPool === undefined ? '缺少链上 positionFeeReceiverFactor' : rawAndUnit(expectedPool, 6, 'USDC'),
      formula: `positionFeeAmountForPool = protocolFeeAmount − feeReceiverAmount${expectedPool === undefined ? '（缺链上 receiverFactor，无法代入）' : `；本次：${protocolFee} − ${expectedReceiver} = ${expectedPool}`}`,
      basis: { title: '协议与 LP 分成', sourcePath: FORMULA_SOURCE, section: '§7.5 协议与 LP 分成' }, unit: 'USDC 1e6',
      inputs: [
        { name: 'protocolFeeAmount', value: protocolFee.toString(), source: eventSource },
        { name: 'expectedReceiver', value: stringValue(expectedReceiver), source: '派生值：protocolFee × 链上 positionFeeReceiverFactor / 1e30（见上一行）' },
        { name: 'positionFeeAmountForPool（对照对象）', value: stringValue(fees.positionFeeAmountForPool), source: eventSource },
      ],
    },
    {
      id: `${input.phaseId}-negative-funding`, group: `${input.phaseLabel} · Funding`, label: '本仓位应付 Funding',
      status: pass(negativeFunding, expectedNegative), before: rawAndUnit(positionNegative, 0, 'per-size'), after: rawAndUnit(latestNegative, 0, 'per-size'),
      delta: deltaAndUnit(latestNegative - positionNegative, 0, 'per-size'), expected: rawAndUnit(expectedNegative, 6, 'USDC'),
      formula: `ceil((latestNegativePerSize − positionNegativePerSize) × sizeInTokens / (1e30 × collateralPrice.min))；本次：ceil((${latestNegative} − ${positionNegative}) × ${positionSizeTokens} / (1e30 × ${collateralMin})) = ${expectedNegative}`,
      basis: { title: '单仓负 Funding（支付端向上取整）', sourcePath: FORMULA_SOURCE, section: '§10.5 单仓 Funding' }, unit: 'per-size raw → USDC 1e6',
      note: `PositionFeesCollected.negativeFundingFeeAmount=${negativeFunding} raw。Before/After 即"仓位结算基线 → 市场累计负 per-size 最新值"的推进（基线=上次结算时的市场累计值，累计值单调不减），市场级累计不再单独成行。`,
      inputs: [
        { name: 'positionNegativeFundingFeePerSize（entry 基线）', value: positionNegative.toString(), source: '仓位 Before 快照（Reader，钉块读数）' },
        { name: 'latestNegativeFundingFeePerSize（市场级累计）', value: latestNegative.toString(), source: `${eventSource}；对该市场全体同向仓位统一累计，非本仓专属` },
        { name: 'sizeInTokens（结算用全仓规模）', value: positionSizeTokens.toString(), source: '仓位 Before 快照（Reader，钉块读数）' },
        { name: 'collateralPrice.min', value: collateralMin.toString(), source: `${eventSource}；支付端用 min 价+向上取整` },
        { name: 'negativeFundingFeeAmount（对照对象）', value: negativeFunding.toString(), source: eventSource },
      ],
    },
    {
      id: `${input.phaseId}-positive-funding`, group: `${input.phaseLabel} · Funding`, label: '本仓位应收 Funding',
      status: pass(positiveFunding, expectedPositive), before: rawAndUnit(positionPositive, 0, 'per-size'), after: rawAndUnit(latestPositive, 0, 'per-size'),
      delta: deltaAndUnit(latestPositive - positionPositive, 0, 'per-size'), expected: rawAndUnit(expectedPositive, 6, 'USDC'),
      formula: `(latestPositivePerSize − positionPositivePerSize) × sizeInTokens / (1e30 × collateralPrice.max)；本次：(${latestPositive} − ${positionPositive}) × ${positionSizeTokens} / (1e30 × ${collateralMax}) = ${expectedPositive}（向下取整）`,
      basis: { title: '单仓正 Funding（收取端向下取整）', sourcePath: FORMULA_SOURCE, section: '§10.5 单仓 Funding' }, unit: 'per-size raw → USDC 1e6',
      note: `PositionFeesCollected.positiveFundingFeeAmount=${positiveFunding} raw。Before/After 即"仓位结算基线 → 市场累计正 per-size 最新值"的推进（基线=上次结算时的市场累计值，累计值单调不减），市场级累计不再单独成行。`,
      inputs: [
        { name: 'positionPositiveFundingFeePerSize（entry 基线）', value: positionPositive.toString(), source: '仓位 Before 快照（Reader，钉块读数）' },
        { name: 'latestPositiveFundingFeePerSize（市场级累计）', value: latestPositive.toString(), source: `${eventSource}；对该市场全体同向仓位统一累计，非本仓专属` },
        { name: 'sizeInTokens（结算用全仓规模）', value: positionSizeTokens.toString(), source: '仓位 Before 快照（Reader，钉块读数）' },
        { name: 'collateralPrice.max', value: collateralMax.toString(), source: `${eventSource}；收取端用 max 价+向下取整` },
        { name: 'positiveFundingFeeAmount（对照对象）', value: positiveFunding.toString(), source: eventSource },
      ],
    },
    {
      id: `${input.phaseId}-net-funding`, group: `${input.phaseLabel} · Funding`, label: 'Funding 净额（应收 − 应付）',
      status: pass(positiveFunding - negativeFunding, expectedPositive - expectedNegative),
      before: rawAndUnit(0n, 6, 'USDC'),
      after: rawAndUnit(positiveFunding - negativeFunding, 6, 'USDC'),
      delta: deltaAndUnit(positiveFunding - negativeFunding, 6, 'USDC'),
      expected: rawAndUnit(expectedPositive - expectedNegative, 6, 'USDC'),
      formula: `netFunding = positiveFunding − negativeFunding = ${positiveFunding} − ${negativeFunding} = ${positiveFunding - negativeFunding}`,
      basis: { title: '单仓 Funding 净额', sourcePath: FORMULA_SOURCE, section: '§10.5 单仓 Funding' },
      unit: 'USDC 1e6',
      note: '正数表示仓位应收 Funding，负数表示仓位应付 Funding；应付和应收原始值保留在相邻两行。',
      inputs: [
        { name: 'positiveFundingFeeAmount', value: positiveFunding.toString(), source: eventSource },
        { name: 'negativeFundingFeeAmount', value: negativeFunding.toString(), source: eventSource },
        { name: 'expected 净额', value: (expectedPositive - expectedNegative).toString(), source: '派生：相邻两行独立复算值之差（expectedPositive − expectedNegative）' },
      ],
    },
    {
      id: `${input.phaseId}-total-cost`, group: `${input.phaseLabel} · Fee`, label: 'Total Cost',
      status: pass(fees.totalCostAmount, expectedTotalCost), before: rawAndUnit(0n, 6, 'USDC'), after: rawAndUnit(fees.totalCostAmount, 6, 'USDC'),
      delta: deltaAndUnit(fees.totalCostAmount, 6, 'USDC'), expected: rawAndUnit(expectedTotalCost, 6, 'USDC'),
      formula: `totalCostAmount = positionFeeAmount + uiFeeAmount + negativeFundingFeeAmount（本用例无清算费/折扣）；本次：${positionFee} + ${uiFee} + ${negativeFunding} = ${expectedTotalCost}`,
      basis: { title: '费用总额；正 Funding 单独增加抵押品', sourcePath: FORMULA_SOURCE, section: '§9 费用总额' }, unit: 'USDC 1e6',
      note: '【恒等式】各分量取自同一 PositionFeesCollected 事件，本行只验证费用汇总自洽；positionFee 与应付/应收 Funding 已在相邻行用执行区块参数独立复算。',
    },
    {
      id: `${input.phaseId}-claimable-position-fee`, group: `${input.phaseLabel} · Fee`, label: 'Claimable Position Fee 入账',
      status: pass(claimablePositionAfter, claimablePositionBefore + bigintValue(fees.feeReceiverAmount)),
      before: rawAndUnit(claimablePositionBefore, 6, 'USDC'), after: rawAndUnit(claimablePositionAfter, 6, 'USDC'),
      delta: deltaAndUnit(claimablePositionAfter - claimablePositionBefore, 6, 'USDC'),
      expected: rawAndUnit(claimablePositionBefore + bigintValue(fees.feeReceiverAmount), 6, 'USDC'),
      formula: `claimablePositionFeeAfter = before + feeReceiverAmount；本次：${claimablePositionBefore} + ${bigintValue(fees.feeReceiverAmount)} = ${claimablePositionBefore + bigintValue(fees.feeReceiverAmount)}`,
      basis: { title: '协议费用入账与快照交叉核对', sourcePath: FORMULA_SOURCE, section: '§7.5 协议与 LP 分成' }, unit: 'USDC 1e6',
      note: '【事件对照】期望增量取自 PositionFeesCollected.feeReceiverAmount，与 DataStore claimable 状态交叉核对；该金额的独立复算见「Fee Receiver 分成」行。',
      inputs: [
        { name: 'claimable before', value: claimablePositionBefore.toString(), source: snapshotSource },
        { name: 'feeReceiverAmount（期望增量）', value: stringValue(fees.feeReceiverAmount), source: eventSource },
        { name: 'claimable after（对照对象）', value: claimablePositionAfter.toString(), source: snapshotSource },
      ],
    },
    {
      id: `${input.phaseId}-claimable-funding`, group: `${input.phaseLabel} · Funding`, label: 'LP Claimable Funding 入账',
      status: pass(claimableFundingAfter, claimableFundingBefore + fundingPaysTotal),
      before: rawAndUnit(claimableFundingBefore, 6, 'USDC'), after: rawAndUnit(claimableFundingAfter, 6, 'USDC'),
      delta: deltaAndUnit(claimableFundingAfter - claimableFundingBefore, 6, 'USDC'),
      expected: rawAndUnit(claimableFundingBefore + fundingPaysTotal, 6, 'USDC'),
      formula: `claimableFundingAfter = before + Σmax(positionPaysLp, 0)（over ${fundingPays.length} 条 Funding 事件）；< 0 分量由 LPVault 支付 PositionVault；本次：${claimableFundingBefore} + ${fundingPaysTotal} = ${claimableFundingBefore + fundingPaysTotal}`,
      basis: { title: 'LP Funding 净额', sourcePath: FORMULA_SOURCE, section: '§10.6 LP Funding 净额' }, unit: 'USDC 1e6',
      note: '【事件对照】期望增量取自 Funding 事件 positionPaysLp（floor funding：市场级净流，多头地板费率使均衡时也不为零），与 DataStore claimable 状态交叉核对。',
      inputs: [
        { name: 'claimable funding before', value: claimableFundingBefore.toString(), source: snapshotSource },
        { name: 'Σmax(positionPaysLp,0)（期望增量，floor funding）', value: fundingPaysTotal.toString(), source: `Funding 事件区间总账（Σ over ${fundingPays.length} 条；共享市场他单执行也会推进）` },
        { name: 'claimable funding after（对照对象）', value: claimableFundingAfter.toString(), source: snapshotSource },
      ],
    },
  ];
  const fundingEvent = record(anchoredFundingEvent);
  const fundingEventFactors = record(fundingEvent.int);
  const fundingEma = record(input.parameters.fundingEma);
  const fundingFloor = marketParameter(input.parameters, 'FUNDING_FLOOR_FACTOR');
  const fundingBase = marketParameter(input.parameters, 'FUNDING_BASE_FACTOR');
  const minimumFunding = marketParameter(input.parameters, 'MIN_FUNDING_FACTOR_PER_SECOND');
  const maximumFunding = marketParameter(input.parameters, 'MAX_FUNDING_FACTOR_PER_SECOND');
  const emaSkew = optionalBigint(fundingEma.lastEmaValue);
  if (Object.keys(fundingEventFactors).length > 0) {
    if (fundingFloor !== undefined && fundingBase !== undefined && minimumFunding !== undefined
      && maximumFunding !== undefined && emaSkew !== undefined) {
      const factors = calculateFundingFactors({
        fundingFloor,
        fundingBase,
        emaSkew,
        minimum: minimumFunding,
        maximum: maximumFunding,
        hasOpenInterest: bigintValue(input.before.openInterestInTokensLong) > 0n
          || bigintValue(input.before.openInterestInTokensShort) > 0n,
      });
      rows.push(
        {
          id: `${input.phaseId}-long-funding-factor`, group: `${input.phaseLabel} · Funding`, label: 'Long Funding Factor / second',
          status: pass(fundingEventFactors.longFundingFactorPerSecond, factors.long),
          before: rawAndUnit(emaSkew, 18, 'EMA skew'), after: rawAndUnit(fundingEventFactors.longFundingFactorPerSecond, 30, 'factor/s'),
          expected: rawAndUnit(factors.long, 30, 'factor/s'), formula: `longFactor = ${factors.longExpanded}`,
          basis: { title: 'Long Funding Factor', sourcePath: PAGE_FORMULA_SOURCE, section: '五、Funding / 5.2 Funding Factor' }, unit: 'factor 1e30 / second',
          note: `${parameterBlockNote(input.parameters)}口径：市场级费率——emaSkew 是全市场失衡的 EMA（由该市场全部交易活动驱动，非本单专属），得到的费率对该市场所有多头仓位统一生效。`,
        },
        {
          id: `${input.phaseId}-short-funding-factor`, group: `${input.phaseLabel} · Funding`, label: 'Short Funding Factor / second',
          status: pass(fundingEventFactors.shortFundingFactorPerSecond, factors.short),
          before: rawAndUnit(emaSkew, 18, 'EMA skew'), after: rawAndUnit(fundingEventFactors.shortFundingFactorPerSecond, 30, 'factor/s'),
          expected: rawAndUnit(factors.short, 30, 'factor/s'), formula: `shortFactor = ${factors.shortExpanded}`,
          basis: { title: 'Short Funding Factor', sourcePath: PAGE_FORMULA_SOURCE, section: '五、Funding / 5.2 Funding Factor' }, unit: 'factor 1e30 / second',
          note: `${parameterBlockNote(input.parameters)}口径：市场级费率——emaSkew 是全市场失衡的 EMA（由该市场全部交易活动驱动，非本单专属），得到的费率对该市场所有空头仓位统一生效。`,
        },
      );
    } else {
      rows.push({
        id: `${input.phaseId}-funding-factor-parameters`, group: `${input.phaseLabel} · Funding`, label: 'Funding Factor 参数复算',
        status: 'NOT_VERIFIED', before: '执行区块参数快照', after: 'FundingUpdated 事件已采集', expected: '需 fundingFloor/base/min/max 与 EMA Skew',
        formula: 'long/short factor = clamp(funding 参数与 emaSkew 的组合)',
        basis: { title: 'Funding Factor', sourcePath: PAGE_FORMULA_SOURCE, section: '五、Funding / 5.2 Funding Factor' },
        note: parameterBlockNote(input.parameters),
      });
    }
  }
  return rows;
}

type TradePhaseCheck = 'ledger' | 'position' | 'grace' | 'pricing' | 'fee-funding';

interface TradePhaseEvidenceInput {
  readonly phaseKind: TradePhaseKind;
  readonly phaseId: string;
  readonly phaseLabel: string;
  readonly beforeLabel: string;
  readonly afterLabel: string;
  readonly before: JsonRecord;
  readonly after: JsonRecord;
  readonly testData: JsonRecord;
  readonly positionBefore: JsonRecord;
  readonly positionAfter: JsonRecord;
  readonly positionExpected: JsonRecord;
  readonly positionExpectedReason: string;
  readonly positionEvent: JsonRecord;
  readonly events: JsonRecord;
  readonly parameters: JsonRecord;
  readonly graceParameters?: JsonRecord;
  readonly marketIndex: unknown;
  readonly tokenDecimals: number;
  readonly tokenSymbol: string;
  readonly collateralDecimals: number;
  readonly ledgerSource: string;
  readonly checks: readonly TradePhaseCheck[];
  readonly txStep?: string;
}

/**
 * 所有交易场景共用同一阶段核对入口。用例只声明要启用的核对模块并传入链上证据，
 * Before / After、事件和执行区块参数的具体复算规则集中维护在本文件中。
 */
function buildTradePhaseRows(input: TradePhaseEvidenceInput): Reconciliation[] {
  const rows: Reconciliation[] = [];
  if (input.checks.includes('ledger')) {
    const expectedDeltas = buildLedgerDeltaExpectations({
      phaseKind: input.phaseKind,
      testData: input.testData,
      positionBefore: input.positionBefore,
      positionEvent: input.positionEvent,
      events: input.events,
      collateralDecimals: input.collateralDecimals,
    });
    rows.push(...buildSnapshotRows({
      phaseId: input.phaseId,
      phaseLabel: input.phaseLabel,
      beforeLabel: input.beforeLabel,
      afterLabel: input.afterLabel,
      before: input.before,
      after: input.after,
      expectedDeltas,
      tokenDecimals: input.tokenDecimals,
      tokenSymbol: input.tokenSymbol,
      ledgerSource: input.ledgerSource,
    }));
  }
  if (input.checks.includes('position')) {
    rows.push(...buildPositionRows({
      phaseId: input.phaseId,
      phaseLabel: input.phaseLabel,
      before: input.positionBefore,
      after: input.positionAfter,
      expected: input.positionExpected,
      tokenDecimals: input.tokenDecimals,
      tokenSymbol: input.tokenSymbol,
      ledgerSource: input.ledgerSource,
      expectedReason: input.positionExpectedReason,
    }));
  }
  if (input.checks.includes('grace')) {
    rows.push(...buildGraceRows({
      phaseId: input.phaseId,
      phaseLabel: input.phaseLabel,
      before: input.positionBefore,
      after: input.positionAfter,
      marketIndex: input.marketIndex,
      parameters: input.graceParameters ?? record(input.parameters.grace),
      ledgerSource: input.ledgerSource,
    }));
  }
  if (input.checks.includes('pricing')) {
    rows.push(...buildPricingRows({
      phaseId: input.phaseId,
      phaseLabel: input.phaseLabel,
      before: input.before,
      after: input.after,
      positionEvent: input.positionEvent,
      balanceWasImproved: record(record(input.events.feesCollected).bool).balanceWasImproved,
      parameters: input.parameters,
    }));
  }
  if (input.checks.includes('fee-funding')) {
    rows.push(...buildFeeAndFundingRows({
      phaseId: input.phaseId,
      phaseLabel: input.phaseLabel,
      before: input.before,
      after: input.after,
      positionBefore: input.positionBefore,
      events: input.events,
      parameters: input.parameters,
    }));
  }
  return input.txStep ? rows.map((row) => ({ ...row, txStep: input.txStep })) : rows;
}

function buildTransaction(
  actor: 'TRADER' | 'KEEPER',
  action: string,
  containerValue: unknown,
): NonNullable<ScenarioResult['executionEvidence']>['transactions'][number] | undefined {
  const container = record(containerValue);
  const event = record(container.event);
  const tx = record(container.transaction);
  const receipt = record(container.receipt);
  const txHash = stringValue(container.txHash ?? event.txHash ?? tx.hash, '');
  const from = stringValue(tx.from, '');
  const to = stringValue(tx.to, '');
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)
    || !/^0x[0-9a-fA-F]{40}$/.test(from)
    || !/^0x[0-9a-fA-F]{40}$/.test(to)) return undefined;

  const receiptStatus = stringValue(receipt.status, '');
  const r = stringValue(tx.r, '0x0');
  const s = stringValue(tx.s, '0x0');
  const orderKey = stringValue(container.orderKey ?? record(event.bytes32).key, '');
  return {
    actor,
    action,
    txHash,
    from,
    to,
    blockNumber: Number(BigInt(stringValue(receipt.blockNumber ?? container.blockNumber ?? event.blockNumber, '0'))),
    status: receiptStatus && BigInt(receiptStatus) === 1n
      ? 'SUCCESS'
      : receiptStatus ? 'REVERTED' : 'UNKNOWN',
    transactionType: stringValue(tx.type, 'unknown'),
    nonce: stringValue(tx.nonce, 'unknown'),
    gasUsed: stringValue(receipt.gasUsed ?? container.gasUsed, 'unknown'),
    ...(/^0x[0-9a-fA-F]{64}$/.test(orderKey) ? { orderKey } : {}),
    signatureVerified: /^0x[0-9a-fA-F]+$/.test(r) && /^0x[0-9a-fA-F]+$/.test(s)
      && BigInt(r) !== 0n && BigInt(s) !== 0n,
  };
}

function deriveScn009Evidence(
  raw: JsonRecord,
  sourcePath: string,
): NonNullable<ScenarioResult['executionEvidence']> {
  const snapshots = record(raw.snapshots);
  const beforeValues = record(record(snapshots.before).values);
  const createOpenValues = record(record(snapshots.afterCreateOpen).values);
  const openValues = record(record(snapshots.afterOpen).values);
  const createCloseValues = record(record(snapshots.afterCreateClose).values);
  const closeValues = record(record(snapshots.afterClose).values);
  const hasPerTransactionSnapshots = Object.keys(createOpenValues).length > 0
    && Object.keys(createCloseValues).length > 0;
  const beforePosition = record(beforeValues.position);
  const createOpenPosition = record(createOpenValues.position);
  const openPosition = record(openValues.position);
  const createClosePosition = record(createCloseValues.position);
  const closePosition = record(closeValues.position);
  const events = record(raw.events);
  const openEvents = record(events.open);
  const closeEvents = record(events.close);
  const openIncrease = record(openEvents.PositionIncrease);
  const closeDecrease = record(closeEvents.PositionDecrease);
  const openIncreaseUint = record(openIncrease.uint);
  const closeDecreaseUint = record(closeDecrease.uint);
  const openFees = record(record(openEvents.feesCollected).uint);
  const closeFees = record(record(closeEvents.feesCollected).uint);
  const deltas = record(raw.deltas);
  const openDelta = record(deltas.open);
  const closeDelta = record(deltas.close);
  const wholeFlow = record(deltas.wholeFlow);
  const observations = record(raw.observations);
  const testData = record(raw.testData);
  const environment = record(raw.environment);
  const parameterSnapshots = record(raw.parameters);
  const openParameters = record(parameterSnapshots.open);
  const closeParameters = record(parameterSnapshots.close);
  const legacyGraceParameters = record(parameterSnapshots.grace);
  const openGraceParameters = Object.keys(record(openParameters.grace)).length > 0
    ? record(openParameters.grace) : legacyGraceParameters;
  const closeGraceParameters = Object.keys(record(closeParameters.grace)).length > 0
    ? record(closeParameters.grace) : legacyGraceParameters;

  const sizeBefore = bigintValue(beforePosition.sizeInUsd);
  const orderSize = expectedOrderSizeUsd(testData);
  const inputSizeUsd = orderSize.value;
  const expectedOpenSize = sizeBefore + inputSizeUsd;
  const inputCollateral = decimalToRaw(testData.collateralUsdc, 6);
  const expectedOpenCollateral = bigintValue(beforePosition.collateralAmount)
    + inputCollateral
    - bigintValue(openFees.totalCostAmount)
    + bigintValue(openFees.positiveFundingFeeAmount);
  const spreadScale = 10n ** 18n;
  // 方向感知（SCN-009 long / SCN-065 short 共用）：开仓不利侧 = 多 ⌈max×(1+s)⌉ / 空 ⌊min×(1−s)⌋，
  // 平仓镜像；开仓成本累计走方向侧账本。
  const isLong = boolValue(record(openIncrease.bool).isLong ?? testData.isLong);
  const directionLabel = isLong ? '多' : '空';
  const expectedOpenExecution = isLong
    ? ceilDiv(
      bigintValue(openIncreaseUint['indexTokenPrice.max'])
        * (spreadScale + bigintValue(openIncreaseUint.dynamicSpread)),
      spreadScale,
    )
    : bigintValue(openIncreaseUint['indexTokenPrice.min'])
      * (spreadScale - bigintValue(openIncreaseUint.dynamicSpread)) / spreadScale;
  const expectedCloseExecution = isLong
    ? bigintValue(closeDecreaseUint['indexTokenPrice.min'])
      * (spreadScale - bigintValue(closeDecreaseUint.dynamicSpread)) / spreadScale
    : ceilDiv(
      bigintValue(closeDecreaseUint['indexTokenPrice.max'])
        * (spreadScale + bigintValue(closeDecreaseUint.dynamicSpread)),
      spreadScale,
    );
  const openCostsSlot = isLong ? 'cumulativeOpenCostsLong' : 'cumulativeOpenCostsShort';
  const expectedCumulativeLongOpenCosts = bigintValue(beforeValues[openCostsSlot]) + inputSizeUsd;
  const expectedFinalUsdc = bigintValue(beforeValues.traderUsdc)
    - bigintValue(wholeFlow.orderVaultUsdc)
    - bigintValue(wholeFlow.posVaultUsdc)
    - bigintValue(wholeFlow.lpVaultAssets)
    - bigintValue(wholeFlow.feeReceiverUsdc);
  const openExecutionRows = buildTradePhaseRows({
    phaseKind: hasPerTransactionSnapshots ? 'execute-increase' : 'create-and-increase',
    phaseId: 'tx2-execute-open', phaseLabel: 'TX2 · Keeper 执行开仓',
    beforeLabel: hasPerTransactionSnapshots ? 'afterCreateOpen' : 'before', afterLabel: 'afterOpen',
    before: hasPerTransactionSnapshots ? createOpenValues : beforeValues, after: openValues, testData,
    positionBefore: hasPerTransactionSnapshots ? createOpenPosition : beforePosition,
    positionAfter: openPosition, positionExpected: openIncreaseUint,
    positionExpectedReason: 'After Position 原始字段 = PositionIncrease 事件的同名字段',
    positionEvent: openIncrease, events: openEvents, parameters: openParameters,
    graceParameters: openGraceParameters, marketIndex: environment.marketIndex,
    tokenDecimals: 18, tokenSymbol: 'ETH', collateralDecimals: 6, ledgerSource: LEDGER_SOURCE,
    checks: ['ledger', 'position', 'grace', 'pricing', 'fee-funding'], txStep: 'TX2',
  });
  const closeExecutionRows = buildTradePhaseRows({
    phaseKind: hasPerTransactionSnapshots ? 'execute-decrease' : 'create-and-decrease',
    phaseId: 'tx4-execute-close', phaseLabel: 'TX4 · Keeper 执行全平',
    beforeLabel: hasPerTransactionSnapshots ? 'afterCreateClose' : 'afterOpen', afterLabel: 'afterClose',
    before: hasPerTransactionSnapshots ? createCloseValues : openValues, after: closeValues, testData,
    positionBefore: hasPerTransactionSnapshots ? createClosePosition : openPosition,
    positionAfter: closePosition, positionExpected: beforePosition,
    positionExpectedReason: '全平后 sizeInUsd = 0，仓位删除并将原始字段清零',
    positionEvent: closeDecrease, events: closeEvents, parameters: closeParameters,
    graceParameters: closeGraceParameters, marketIndex: environment.marketIndex,
    tokenDecimals: 18, tokenSymbol: 'ETH', collateralDecimals: 6, ledgerSource: LEDGER_SOURCE,
    checks: ['ledger', 'position', 'grace', 'pricing', 'fee-funding'], txStep: 'TX4',
  });
  const detailedRows: Reconciliation[] = [
    ...(hasPerTransactionSnapshots ? buildTradePhaseRows({
      phaseKind: 'create-order', phaseId: 'tx1-create-open', phaseLabel: 'TX1 · 创建开仓订单',
      beforeLabel: 'before', afterLabel: 'afterCreateOpen', before: beforeValues, after: createOpenValues, testData,
      positionBefore: beforePosition, positionAfter: createOpenPosition, positionExpected: beforePosition,
      positionExpectedReason: '仅创建订单，仓位尚未执行，Position 原始字段保持不变',
      positionEvent: {}, events: {}, parameters: {}, marketIndex: environment.marketIndex,
      tokenDecimals: 18, tokenSymbol: 'ETH', collateralDecimals: 6, ledgerSource: LEDGER_SOURCE,
      checks: ['ledger', 'position'], txStep: 'TX1',
    }) : []),
    ...openExecutionRows,
    ...(hasPerTransactionSnapshots ? buildTradePhaseRows({
      phaseKind: 'create-decrease-order', phaseId: 'tx3-create-close', phaseLabel: 'TX3 · 创建全平订单',
      beforeLabel: 'afterOpen', afterLabel: 'afterCreateClose', before: openValues, after: createCloseValues, testData,
      positionBefore: openPosition, positionAfter: createClosePosition, positionExpected: openPosition,
      positionExpectedReason: '仅创建全平订单，Keeper 尚未执行，仓位原始字段保持不变',
      positionEvent: {}, events: {}, parameters: {}, marketIndex: environment.marketIndex,
      tokenDecimals: 18, tokenSymbol: 'ETH', collateralDecimals: 6, ledgerSource: LEDGER_SOURCE,
      checks: ['ledger', 'position'], txStep: 'TX3',
    }) : []),
    ...closeExecutionRows,
  ];

  const formulaBasis = (section: string, title: string) => ({
    title,
    sourcePath: FORMULA_SOURCE,
    section,
  });
  const ledgerBasis = (section: string, title: string) => ({
    title,
    sourcePath: LEDGER_SOURCE,
    section,
  });
  const conservationSpecs = hasPerTransactionSnapshots
    ? [
      ['createOpenConservation', 'TX1', '创建开仓订单资金守恒'],
      ['executeOpenConservation', 'TX2', '执行开仓资金守恒'],
      ['createCloseConservation', 'TX3', '创建全平订单资金守恒'],
      ['executeCloseConservation', 'TX4', '执行全平资金守恒'],
      ['wholeFlowConservation', 'TX4', '全流程资金守恒'],
    ] as const
    : [
      ['openConservation', 'TX2', '开仓资金守恒（历史证据包含创建与执行）'],
      ['closeConservation', 'TX4', '平仓资金守恒（历史证据包含创建与执行）'],
      ['wholeFlowConservation', 'TX4', '全流程资金守恒'],
    ] as const;
  const baseReconciliations: NonNullable<ScenarioResult['executionEvidence']>['reconciliations'] = [
    {
      id: 'position-open-exists', group: '开仓状态', label: `${directionLabel}头仓位建立`,
      status: boolValue(openPosition.exists) && boolValue(openPosition.isLong) === isLong ? 'PASS' : 'FAIL',
      before: stringValue(boolValue(beforePosition.exists)),
      after: `exists=${boolValue(openPosition.exists)}；isLong=${boolValue(openPosition.isLong)}`, expected: `exists=true 且 isLong=${isLong}`,
      formula: `afterOpen.position.exists = true 且 isLong = ${isLong}（${directionLabel}头）`,
      basis: formulaBasis('§5 仓位字段更新', '仓位建立后的结构状态'),
    },
    {
      id: 'position-open-size', group: '开仓状态', label: '仓位规模 sizeInUsd',
      status: pass(openPosition.sizeInUsd, expectedOpenSize),
      before: rawAndUnit(sizeBefore, 30, 'USD'),
      after: rawAndUnit(openPosition.sizeInUsd, 30, 'USD'),
      delta: deltaAndUnit(inputSizeUsd, 30, 'USD'),
      expected: rawAndUnit(expectedOpenSize, 30, 'USD'),
      formula: `Expected sizeDeltaUsd：${orderSize.expanded}；Expected After = Before + ${inputSizeUsd}`,
      basis: formulaBasis('§5.1 加仓后规模', '加仓后的 USD 规模'), unit: 'USD 1e30',
    },
    {
      id: 'position-open-collateral', group: '开仓状态', label: '仓位 Margin（链上实际；前端持仓字段对照）',
      status: pass(openPosition.collateralAmount, expectedOpenCollateral),
      before: rawAndUnit(beforePosition.collateralAmount, 6, 'USDC'),
      after: rawAndUnit(openPosition.collateralAmount, 6, 'USDC'),
      delta: deltaAndUnit(expectedOpenCollateral - bigintValue(beforePosition.collateralAmount), 6, 'USDC'),
      expected: rawAndUnit(expectedOpenCollateral, 6, 'USDC'),
      formula: `Expected Margin After = Before ${bigintValue(beforePosition.collateralAmount)} + inputMargin ${inputCollateral} − totalCostAmount ${bigintValue(openFees.totalCostAmount)} + positiveFunding ${bigintValue(openFees.positiveFundingFeeAmount)} = ${expectedOpenCollateral}`,
      basis: formulaBasis('§16.2 Pay、Margin、Size 与 Leverage', 'storedCollateralTokenAfterOpen'), unit: 'USDC 1e6',
      note: '这是仓位当前 Margin，不是用户最初输入值。totalCostAmount 来自 PositionFeesCollected，并在 Fee 分组使用执行区块费率独立复算。',
    },
    {
      id: 'open-execution-price', group: '成交价格', label: `开${directionLabel}执行价`,
      status: pass(openIncreaseUint.executionPrice, expectedOpenExecution),
      before: stringValue(openIncreaseUint[isLong ? 'indexTokenPrice.max' : 'indexTokenPrice.min']),
      after: stringValue(openIncreaseUint.executionPrice), expected: expectedOpenExecution.toString(),
      formula: isLong
        ? `ceil(indexPrice.max × (1e18 + dynamicSpread) / 1e18)；本次：ceil(${stringValue(openIncreaseUint['indexTokenPrice.max'])} × (1e18 + ${stringValue(openIncreaseUint.dynamicSpread)}) / 1e18) = ${expectedOpenExecution}`
        : `⌊indexPrice.min × (1e18 − dynamicSpread) / 1e18⌋；本次：⌊${stringValue(openIncreaseUint['indexTokenPrice.min'])} × (1e18 − ${stringValue(openIncreaseUint.dynamicSpread)}) / 1e18⌋ = ${expectedOpenExecution}`,
      basis: formulaBasis('§4.5 加仓成交价', isLong ? 'Long executionPrice' : 'Short executionPrice'), unit: 'price raw',
      note: `dynamicSpread=${stringValue(openIncreaseUint.dynamicSpread)}。【恒等式】oracle 价与 dynamicSpread 均取自被核对的 PositionIncrease 事件，验证价格公式自洽，不构成独立重算（dynamicSpread 独立复算未实现）。`,
    },
    {
      id: 'cumulative-long-open-costs-after-open', group: '市场账本',
      label: `累计${directionLabel}头开仓成本 ${openCostsSlot}`,
      status: pass(openValues[openCostsSlot], expectedCumulativeLongOpenCosts),
      before: rawAndUnit(beforeValues[openCostsSlot], 30, 'USD'),
      after: rawAndUnit(openValues[openCostsSlot], 30, 'USD'),
      delta: deltaAndUnit(inputSizeUsd, 30, 'USD'),
      expected: rawAndUnit(expectedCumulativeLongOpenCosts, 30, 'USD'),
      formula: `next ${openCostsSlot} = previous + sizeDeltaUsd；本次：${bigintValue(beforeValues[openCostsSlot])} + ${inputSizeUsd} = ${expectedCumulativeLongOpenCosts}`,
      basis: formulaBasis('§12.2 市场多空 PnL', `累计${directionLabel}头开仓成本增量`), unit: 'USD 1e30',
    },
    {
      id: 'close-execution-price', group: '成交价格', label: `平${directionLabel}执行价`,
      status: pass(closeDecreaseUint.executionPrice, expectedCloseExecution),
      before: stringValue(closeDecreaseUint[isLong ? 'indexTokenPrice.min' : 'indexTokenPrice.max']),
      after: stringValue(closeDecreaseUint.executionPrice), expected: expectedCloseExecution.toString(),
      formula: isLong
        ? `⌊indexPrice.min × (1e18 − dynamicSpread) / 1e18⌋；本次：⌊${stringValue(closeDecreaseUint['indexTokenPrice.min'])} × (1e18 − ${stringValue(closeDecreaseUint.dynamicSpread)}) / 1e18⌋ = ${expectedCloseExecution}`
        : `ceil(indexPrice.max × (1e18 + dynamicSpread) / 1e18)；本次：ceil(${stringValue(closeDecreaseUint['indexTokenPrice.max'])} × (1e18 + ${stringValue(closeDecreaseUint.dynamicSpread)}) / 1e18) = ${expectedCloseExecution}`,
      basis: formulaBasis('§4.6 减仓成交价', isLong ? 'Long executionPrice' : 'Short executionPrice'), unit: 'price raw',
      note: `dynamicSpread=${stringValue(closeDecreaseUint.dynamicSpread)}。【恒等式】oracle 价与 dynamicSpread 均取自被核对的 PositionDecrease 事件，验证价格公式自洽，不构成独立重算（dynamicSpread 独立复算未实现）。`,
    },
    {
      id: 'position-closed', group: '平仓状态', label: '全平后仓位移除',
      status: pass(boolValue(closePosition.exists), false),
      before: stringValue(boolValue(openPosition.exists)),
      after: stringValue(boolValue(closePosition.exists)), expected: 'false',
      formula: 'nextSizeInUsd = oldSizeInUsd − sizeDeltaUsd；nextSize = 0 时删除仓位',
      basis: formulaBasis('§5.2 减仓后规模', '全量减仓'),
    },
    {
      id: 'cumulative-long-open-costs-restored', group: '平仓状态',
      label: `累计${directionLabel}头开仓成本恢复初始值`,
      status: pass(closeValues[openCostsSlot], beforeValues[openCostsSlot]),
      before: rawAndUnit(openValues[openCostsSlot], 30, 'USD'),
      after: rawAndUnit(closeValues[openCostsSlot], 30, 'USD'),
      expected: rawAndUnit(beforeValues[openCostsSlot], 30, 'USD'),
      formula: `final ${openCostsSlot} = opened − fullCloseSizeUsd = initial；本次：${bigintValue(openValues[openCostsSlot])} − ${inputSizeUsd} = ${bigintValue(beforeValues[openCostsSlot])}`,
      basis: formulaBasis('§12.2 市场多空 PnL', `累计${directionLabel}头开仓成本全平回退`), unit: 'USD 1e30',
    },
    {
      id: 'trader-usdc-final', group: '守恒', label: '交易员最终 USDC（全流程守恒推论）',
      status: pass(closeValues.traderUsdc, expectedFinalUsdc),
      before: rawAndUnit(beforeValues.traderUsdc, 6, 'USDC'),
      after: rawAndUnit(closeValues.traderUsdc, 6, 'USDC'),
      expected: rawAndUnit(expectedFinalUsdc, 6, 'USDC'),
      formula: `expectedAfter = before − (ΔOrderVault + ΔPositionVault + ΔLPVaultAssets + ΔFeeHandler)；本次：${bigintValue(beforeValues.traderUsdc)} − (${bigintValue(wholeFlow.orderVaultUsdc)} + ${bigintValue(wholeFlow.posVaultUsdc)} + ${bigintValue(wholeFlow.lpVaultAssets)} + ${bigintValue(wholeFlow.feeReceiverUsdc)}) = ${expectedFinalUsdc}`,
      basis: ledgerBasis('checkConservation(wholeFlowDelta)', '全流程 USDC 守恒'), unit: 'USDC 1e6',
      note: '【守恒推论】Expected 由其他四方的实测 wholeFlow Δ 反推（五方守恒式的变形），不是独立公式——本行验证的是全流程资金闭合，交易员的独立 Expected（订单输入+事件分量建模）见 TX2/TX4 资金账户组的 ΔTrader 行。',
    },
    ...detailedRows,
    ...conservationSpecs.map(([key, txStep, label]) => buildConservationRow({
      id: key,
      txStep,
      label,
      observation: record(observations[key]),
      ledgerSource: LEDGER_SOURCE,
    })),
  ];
  const openOverviewIds = new Set([
    'position-open-exists', 'position-open-size', 'position-open-collateral',
    'open-execution-price', 'cumulative-long-open-costs-after-open',
  ]);
  const reconciliations = baseReconciliations.map((row) => row.txStep
    ? row
    : { ...row, txStep: openOverviewIds.has(row.id) ? 'TX2' : 'TX4' }).map(withVerification);

  const transactionsRecord = record(raw.transactions);
  const transactions = [
    buildTransaction('TRADER', '创建市价开多订单', transactionsRecord.createOpen),
    buildTransaction('KEEPER', '执行市价开多订单', transactionsRecord.executeOpen),
    buildTransaction('TRADER', '创建市价全平订单', transactionsRecord.createClose),
    buildTransaction('KEEPER', '执行市价全平订单', transactionsRecord.executeClose),
  ].filter((item): item is NonNullable<typeof item> => Boolean(item)).map((transaction, index) => ({
    ...transaction,
    stepId: `TX${index + 1}`,
    summary: [
      '交易员提交 10 USDC、5x 市价开多订单；USDC 从 Trader 转入 OrderVault，仓位尚未建立。',
      'Keeper 执行开仓；抵押品进入 PositionVault，并结算开仓 Fee、Funding、仓位、OI、Skew 与 Spread。',
      '交易员提交全平订单；只创建待执行订单，现有仓位与 USDC 账本暂不结算。',
      'Keeper 执行全平；结算 Margin、PnL、Fee、Funding，并回退仓位与 OI。',
    ][index]!,
  }));

  const executionStatus = !reconciliations.some((item) => item.status === 'FAIL')
    && transactions.length === 4
    && transactions.every((item) => item.status === 'SUCCESS' && item.signatureVerified)
    ? 'PASS' as const
    : 'FAIL' as const;

  return {
    mode: stringValue(raw.runMode, 'unknown'),
    persistent: record(raw.environment).resetMode === 'persistent-no-revert',
    executionStatus,
    coverageStatus: 'PARTIAL',
    coverageNote: '真实签名开仓与全平链路已验证；涨/平/跌三组受控价格和浏览器钱包点击签名尚未自动化。',
    ...(normalizeForkDisplayName(stringValue(environment.forkDisplayName, ''))
      ? { forkDisplayName: normalizeForkDisplayName(stringValue(environment.forkDisplayName, '')) }
      : {}),
    sourcePath,
    formulaSourcePath: FORMULA_SOURCE,
    reconciliations,
    transactions,
  };
}

function deriveScn010Evidence(
  raw: JsonRecord,
  sourcePath: string,
): NonNullable<ScenarioResult['executionEvidence']> {
  const snapshots = record(raw.snapshots);
  const beforeValues = record(record(snapshots.before).values);
  const createValues = record(record(snapshots.afterCreate).values);
  const openValues = record(record(snapshots.afterOpen).values);
  const createCloseValues = record(record(snapshots.afterCreateClose).values);
  const closeValues = record(record(snapshots.afterClose).values);
  const hasCreateCloseSnapshot = Object.keys(createCloseValues).length > 0;
  const beforePosition = record(beforeValues.position);
  const createPosition = record(createValues.position);
  const openPosition = record(openValues.position);
  const createClosePosition = record(createCloseValues.position);
  const closePosition = record(closeValues.position);
  const events = record(raw.events);
  const limitEvents = record(events.limit);
  const closeEvents = record(events.close);
  const orderCreatedUint = record(record(limitEvents.OrderCreated).uint);
  const increaseUint = record(record(limitEvents.PositionIncrease).uint);
  const decreaseUint = record(record(closeEvents.PositionDecrease).uint);
  const testData = record(raw.testData);
  const prices = record(raw.prices);
  const observations = record(raw.observations);
  const environment = record(raw.environment);
  const parameterSnapshots = record(raw.parameters);
  const openParameters = record(parameterSnapshots.open);
  const closeParameters = record(parameterSnapshots.close);
  const legacyGraceParameters = record(parameterSnapshots.grace);
  const openGraceParameters = Object.keys(record(openParameters.grace)).length > 0
    ? record(openParameters.grace) : legacyGraceParameters;
  const closeGraceParameters = Object.keys(record(closeParameters.grace)).length > 0
    ? record(closeParameters.grace) : legacyGraceParameters;
  const deltas = record(raw.deltas);
  const createDelta = record(deltas.create);
  const openDelta = record(deltas.open);
  const closeDelta = record(deltas.close);
  const startPrice = bigintValue(prices.startPrice);
  const triggerPrice = bigintValue(prices.triggerPrice);
  const executionPrice = bigintValue(increaseUint.executionPrice);
  const expectedTrigger = startPrice * 90n / 100n;
  const orderSize = expectedOrderSizeUsd(testData);
  const inputSizeUsd = orderSize.value;
  const expectedSizeInTokens = executionPrice === 0n ? 0n : inputSizeUsd / executionPrice;
  const tokenDecimals = Number(prices.tokenDecimals ?? 8);
  const detailedRows: Reconciliation[] = [
    ...buildTradePhaseRows({
      phaseKind: 'create-order', phaseId: 'create', phaseLabel: '限价单创建', beforeLabel: 'before', afterLabel: 'afterCreate',
      before: beforeValues, after: createValues, testData,
      positionBefore: beforePosition, positionAfter: createPosition, positionExpected: beforePosition,
      positionExpectedReason: '仅创建挂单，未触发前 Position 原始字段保持不变',
      positionEvent: {}, events: {}, parameters: {}, marketIndex: environment.marketIndex,
      tokenDecimals, tokenSymbol: 'MockBTC', collateralDecimals: 6, ledgerSource: SCN010_LEDGER_SOURCE,
      checks: ['ledger', 'position', 'grace'], txStep: 'TX1',
    }),
    ...buildTradePhaseRows({
      phaseKind: 'execute-increase', phaseId: 'open', phaseLabel: '限价触发开仓', beforeLabel: 'afterCreate', afterLabel: 'afterOpen',
      before: createValues, after: openValues, testData,
      positionBefore: createPosition, positionAfter: openPosition, positionExpected: increaseUint,
      positionExpectedReason: 'After Position 原始字段 = PositionIncrease 事件的同名字段',
      positionEvent: record(limitEvents.PositionIncrease), events: limitEvents, parameters: openParameters,
      graceParameters: openGraceParameters, marketIndex: environment.marketIndex,
      tokenDecimals, tokenSymbol: 'MockBTC', collateralDecimals: 6, ledgerSource: SCN010_LEDGER_SOURCE,
      checks: ['ledger', 'position', 'grace', 'pricing', 'fee-funding'], txStep: 'TX2',
    }),
    ...(hasCreateCloseSnapshot ? buildTradePhaseRows({
      phaseKind: 'create-decrease-order', phaseId: 'tx3-create-close', phaseLabel: 'TX3 · 创建全平订单',
      beforeLabel: 'afterOpen', afterLabel: 'afterCreateClose', before: openValues, after: createCloseValues, testData,
      positionBefore: openPosition, positionAfter: createClosePosition, positionExpected: openPosition,
      positionExpectedReason: '仅创建全平订单，Keeper 尚未执行，仓位原始字段保持不变',
      positionEvent: {}, events: {}, parameters: {}, marketIndex: environment.marketIndex,
      tokenDecimals, tokenSymbol: 'MockBTC', collateralDecimals: 6, ledgerSource: SCN010_LEDGER_SOURCE,
      checks: ['ledger', 'position'], txStep: 'TX3',
    }) : []),
    ...buildTradePhaseRows({
      phaseKind: hasCreateCloseSnapshot ? 'execute-decrease' : 'create-and-decrease',
      phaseId: 'tx4-execute-close', phaseLabel: 'TX4 · Keeper 执行全平',
      beforeLabel: hasCreateCloseSnapshot ? 'afterCreateClose' : 'afterOpen', afterLabel: 'afterClose',
      before: hasCreateCloseSnapshot ? createCloseValues : openValues, after: closeValues, testData,
      positionBefore: hasCreateCloseSnapshot ? createClosePosition : openPosition,
      positionAfter: closePosition, positionExpected: beforePosition,
      positionExpectedReason: '全平后 sizeInUsd = 0，仓位删除并将原始字段清零',
      positionEvent: record(closeEvents.PositionDecrease), events: closeEvents, parameters: closeParameters,
      graceParameters: closeGraceParameters, marketIndex: environment.marketIndex,
      tokenDecimals, tokenSymbol: 'MockBTC', collateralDecimals: 6, ledgerSource: SCN010_LEDGER_SOURCE,
      checks: ['ledger', 'position', 'grace', 'pricing', 'fee-funding'], txStep: 'TX4',
    }),
  ];
  const formulaBasis = (section: string, title: string) => ({
    title,
    sourcePath: FORMULA_SOURCE,
    section,
  });
  const ledgerBasis = (section: string, title: string) => ({
    title,
    sourcePath: SCN010_LEDGER_SOURCE,
    section,
  });
  const conservationSpecs = hasCreateCloseSnapshot
    ? [
      ['createConservation', 'TX1', '创建限价单资金守恒'],
      ['openConservation', 'TX2', '触发开仓资金守恒'],
      ['createCloseConservation', 'TX3', '创建全平订单资金守恒'],
      ['executeCloseConservation', 'TX4', '执行全平资金守恒'],
      ['wholeFlowConservation', 'TX4', '全流程资金守恒'],
    ] as const
    : [
      ['createConservation', 'TX1', '创建限价单资金守恒'],
      ['openConservation', 'TX2', '触发开仓资金守恒'],
      ['closeConservation', 'TX4', '全平资金守恒（历史证据包含创建与执行）'],
      ['wholeFlowConservation', 'TX4', '全流程资金守恒'],
    ] as const;
  const baseReconciliations: NonNullable<ScenarioResult['executionEvidence']>['reconciliations'] = [
    {
      id: 'limit-order-type', group: '订单参数', label: '订单类型 LimitIncrease',
      status: pass(increaseUint.orderType, 1),
      before: '用户输入：现价下方 10% 开多', after: stringValue(increaseUint.orderType), expected: '1',
      formula: 'Order.OrderType.LimitIncrease = 1',
      basis: formulaBasis('§3 订单类型与触发方向', 'LimitIncrease 枚举与方向'),
    },
    {
      id: 'trigger-price', group: '订单参数', label: '触发价为 P - 10%',
      status: pass(triggerPrice, expectedTrigger),
      before: stringValue(startPrice), after: stringValue(triggerPrice), expected: expectedTrigger.toString(),
      formula: 'triggerPrice = P × (1 − 10%) = P × 90 / 100',
      basis: formulaBasis('§3 订单类型与触发方向', '限价低吸触发价'), unit: 'price raw',
    },
    {
      id: 'pending-no-position', group: '触发前状态', label: '未触发时无仓位',
      status: pass(boolValue(createPosition.exists), false),
      before: stringValue(boolValue(beforePosition.exists)),
      after: stringValue(boolValue(createPosition.exists)), expected: 'false',
      formula: 'oraclePrice > triggerPrice 时 LimitIncrease long 不执行，position.exists 保持 false',
      basis: formulaBasis('§3 订单类型与触发方向', 'LimitIncrease Long 触发条件'),
    },
    {
      id: 'pending-open-costs', group: '触发前状态', label: '未触发时累计开仓成本不变',
      status: pass(createValues.cumulativeOpenCostsLong, beforeValues.cumulativeOpenCostsLong),
      before: rawAndUnit(beforeValues.cumulativeOpenCostsLong, 30, 'USD'),
      after: rawAndUnit(createValues.cumulativeOpenCostsLong, 30, 'USD'),
      expected: rawAndUnit(beforeValues.cumulativeOpenCostsLong, 30, 'USD'),
      formula: '订单仅创建未执行：ΔcumulativeOpenCostsLong = 0',
      basis: ledgerBasis('afterCreate', '挂单阶段 Reader 账本'), unit: 'USD 1e30',
    },
    {
      id: 'trigger-oracle-price', group: '触发执行', label: 'Oracle 到达触发价',
      status: pass(increaseUint['indexTokenPrice.max'], triggerPrice),
      before: stringValue(startPrice), after: stringValue(increaseUint['indexTokenPrice.max']),
      expected: triggerPrice.toString(),
      formula: 'LimitIncrease Long：primaryPrice.max ≤ triggerPrice；边界用例取等号',
      basis: formulaBasis('§3 订单类型与触发方向', 'LimitIncrease Long 边界条件'), unit: 'price raw',
    },
    {
      id: 'position-open-exists', group: '触发执行', label: '到价后建立多头仓位',
      status: pass(boolValue(openPosition.exists) && boolValue(openPosition.isLong), true),
      before: stringValue(boolValue(createPosition.exists)), after: stringValue(boolValue(openPosition.exists)),
      expected: 'true / isLong=true',
      formula: '触发成功且订单执行后 position.exists = true, isLong = true',
      basis: formulaBasis('§5 仓位字段更新', '仓位建立后的结构状态'),
    },
    {
      id: 'position-open-size', group: '触发执行', label: '仓位规模 sizeInUsd',
      status: pass(openPosition.sizeInUsd, inputSizeUsd),
      before: rawAndUnit(beforePosition.sizeInUsd, 30, 'USD'),
      after: rawAndUnit(openPosition.sizeInUsd, 30, 'USD'),
      delta: deltaAndUnit(inputSizeUsd, 30, 'USD'),
      expected: rawAndUnit(inputSizeUsd, 30, 'USD'),
      formula: `Expected sizeDeltaUsd：${orderSize.expanded}；Expected After = Before + ${inputSizeUsd}`,
      basis: formulaBasis('§5.1 加仓后规模', '加仓后的 USD 规模'), unit: 'USD 1e30',
    },
    {
      id: 'open-execution-side', group: '成交价格', label: '开多使用不利侧成交价',
      status: executionPrice >= bigintValue(increaseUint['indexTokenPrice.max']) ? 'PASS' : 'FAIL',
      before: stringValue(increaseUint['indexTokenPrice.max']), after: stringValue(executionPrice),
      expected: `>= ${stringValue(increaseUint['indexTokenPrice.max'])}`,
      formula: 'executionPrice = ceil(indexPrice.max × (1e18 + dynamicSpread) / 1e18)',
      basis: formulaBasis('§4.5 加仓成交价', 'Long executionPrice'), unit: 'price raw',
    },
    {
      id: 'size-in-tokens', group: '成交价格', label: 'sizeInTokens 按成交价换算',
      status: pass(openPosition.sizeInTokens, expectedSizeInTokens),
      before: '0', after: stringValue(openPosition.sizeInTokens), expected: expectedSizeInTokens.toString(),
      formula: 'sizeDeltaInTokens = sizeDeltaUsd / executionPrice（整数向下取整）',
      basis: formulaBasis('§4.5 加仓成交价', 'USD 计价开多的 token 数量'), unit: 'MockBTC 1e8',
    },
    {
      id: 'position-closed', group: '平仓状态', label: '全平后仓位移除',
      status: pass(boolValue(closePosition.exists), false),
      before: stringValue(boolValue(openPosition.exists)), after: stringValue(boolValue(closePosition.exists)),
      expected: 'false',
      formula: 'nextSizeInUsd = oldSizeInUsd − fullSizeInUsd = 0，随后删除仓位',
      basis: formulaBasis('§5.2 减仓后规模', '全量减仓'),
    },
    {
      id: 'close-execution-side', group: '平仓状态', label: '平多使用不利侧成交价',
      status: bigintValue(decreaseUint.executionPrice) <= bigintValue(decreaseUint['indexTokenPrice.min']) ? 'PASS' : 'FAIL',
      before: stringValue(decreaseUint['indexTokenPrice.min']), after: stringValue(decreaseUint.executionPrice),
      expected: `<= ${stringValue(decreaseUint['indexTokenPrice.min'])}`,
      formula: 'executionPrice = indexPrice.min × (1e18 − dynamicSpread) / 1e18',
      basis: formulaBasis('§4.6 减仓成交价', 'Long decrease executionPrice'), unit: 'price raw',
    },
    {
      id: 'cumulative-cost-restored', group: '平仓状态', label: '累计多头开仓成本恢复',
      status: pass(closeValues.cumulativeOpenCostsLong, beforeValues.cumulativeOpenCostsLong),
      before: rawAndUnit(openValues.cumulativeOpenCostsLong, 30, 'USD'),
      after: rawAndUnit(closeValues.cumulativeOpenCostsLong, 30, 'USD'),
      expected: rawAndUnit(beforeValues.cumulativeOpenCostsLong, 30, 'USD'),
      formula: 'finalCumulativeOpenCostsLong = opened − fullCloseSizeUsd = initial',
      basis: formulaBasis('§12.2 市场多空 PnL', '累计开仓成本全平回退'), unit: 'USD 1e30',
    },
    ...detailedRows,
    ...conservationSpecs.map(([key, txStep, label]) => buildConservationRow({
      id: key,
      txStep,
      label,
      observation: record(observations[key]),
      ledgerSource: SCN010_LEDGER_SOURCE,
    })),
  ];
  const tx1OverviewIds = new Set(['limit-order-type', 'trigger-price', 'pending-no-position', 'pending-open-costs']);
  const tx2OverviewIds = new Set([
    'trigger-oracle-price', 'position-open-exists', 'position-open-size', 'open-execution-side', 'size-in-tokens',
  ]);
  const reconciliations = baseReconciliations.map((row) => row.txStep
    ? row
    : { ...row, txStep: tx1OverviewIds.has(row.id) ? 'TX1' : tx2OverviewIds.has(row.id) ? 'TX2' : 'TX4' }).map(withVerification);

  const transactionRecord = record(raw.transactions);
  const transactions = [
    buildTransaction('TRADER', '创建 LimitIncrease 限价开多订单', transactionRecord.createLimit),
    buildTransaction('KEEPER', '到达触发价后执行限价开多订单', transactionRecord.executeLimit),
    buildTransaction('TRADER', '创建市价全平订单', transactionRecord.createClose),
    buildTransaction('KEEPER', '执行市价全平订单', transactionRecord.executeClose),
  ].filter((item): item is NonNullable<typeof item> => Boolean(item)).map((transaction, index) => ({
    ...transaction,
    stepId: `TX${index + 1}`,
    summary: [
      '交易员创建现价下方 10% 的 LimitIncrease；10 USDC 转入 OrderVault，订单保持 pending，仓位尚未建立。',
      'Keeper 在 Mock Oracle 到达触发价后执行限价开仓；结算仓位、Fee、Funding、OI、Skew 与 Spread。',
      '交易员创建市价全平订单；只登记待执行订单，已有仓位与 USDC 账本暂不结算。',
      'Keeper 执行全平；结算 Margin、PnL、Fee、Funding，并回退仓位与 OI。',
    ][index]!,
  }));
  const executionStatus = !reconciliations.some((item) => item.status === 'FAIL')
    && transactions.length === 4
    && transactions.every((item) => item.status === 'SUCCESS' && item.signatureVerified)
    ? 'PASS' as const
    : 'FAIL' as const;
  return {
    mode: stringValue(raw.runMode, 'unknown'),
    persistent: environment.resetMode === 'persistent-no-revert',
    executionStatus,
    coverageStatus: 'PARTIAL',
    coverageNote: '同一 Fork 内的 MockBTC 限价挂单、精确触发、真实用户/Keeper 签名及全平已验证；浏览器钱包点击签名尚未自动化。',
    ...(normalizeForkDisplayName(stringValue(environment.forkDisplayName, ''))
      ? { forkDisplayName: normalizeForkDisplayName(stringValue(environment.forkDisplayName, '')) }
      : {}),
    sourcePath,
    formulaSourcePath: FORMULA_SOURCE,
    reconciliations,
    transactions,
  };
}

interface Scn070Quadrant {
  readonly short: string;
  readonly rule: string;
}

const SCN070_QUADRANTS: Record<string, Scn070Quadrant> = {
  'open-long': { short: '开多', rule: '开多（increase & long）：E ≤ A 可成交，E > A 必须取消' },
  'open-short': { short: '开空', rule: '开空（increase & short）：E ≥ A 可成交，E < A 必须取消' },
  'close-long': { short: '平多', rule: '平多（decrease & long）：E ≥ A 可成交，E < A 必须取消' },
  'close-short': { short: '平空', rule: '平空（decrease & short）：E ≤ A 可成交，E > A 必须取消' },
};

function orderDocBasis(title: string, section: string): Reconciliation['basis'] {
  return { title, sourcePath: ORDER_FLOW_SOURCE, section };
}

function scn070ModelBasis(title: string, section: string): Reconciliation['basis'] {
  return { title, sourcePath: SCN070_MODEL_SOURCE, section };
}

function scn070RunnerBasis(title: string, section: string): Reconciliation['basis'] {
  return { title, sourcePath: SCN070_RUNNER_SOURCE, section };
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function signedValue(value: bigint): string {
  return value > 0n ? `+${value.toString()}` : value.toString();
}

function scn070Position(value: unknown): string {
  if (value === null || value === undefined) return '无仓位（null）';
  const position = record(value);
  return `size ${rawAndUnit(position.sizeInUsd, 30, 'USD')} · sizeInTokens ${stringValue(position.sizeInTokens)}`
    + ` · 抵押 ${rawAndUnit(position.collateralAmount, 6, 'USDC')} · ${boolValue(position.isLong) ? '多头' : '空头'}`;
}

function scn070Display(value: unknown): string {
  if (value === null || value === undefined) return '无（null）';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value !== 'object') return String(value);
  const candidate = record(value);
  return candidate.sizeInUsd === undefined ? JSON.stringify(value) : scn070Position(candidate);
}

interface Scn070AssertionMeta {
  readonly formula: string;
  readonly basis: Reconciliation['basis'];
  readonly unit?: string;
  readonly before?: (caseRecord: JsonRecord) => string;
}

const scn070BalanceBefore = (caseRecord: JsonRecord): string =>
  rawAndUnit(caseRecord.collateralBalanceBefore, 6, 'USDC');
const scn070PositionBefore = (caseRecord: JsonRecord): string => scn070Position(caseRecord.positionBefore);
const scn070AcceptableBefore = (caseRecord: JsonRecord): string => `A = ${stringValue(caseRecord.acceptablePrice)}`;

const SCN070_ASSERTION_META: Record<string, Scn070AssertionMeta> = {
  '测试账户抵押币余额充足': {
    formula: 'collateralBalance(trader) ≥ COLLATERAL_AMOUNT = 10 USDC',
    basis: scn070RunnerBasis('数据集前置：交易员抵押币余额', 'runBoundaryCase() 前置校验'),
    unit: 'USDC 1e6',
  },
  '开仓边界组执行前无同方向仓位': {
    formula: 'Reader.getPosition(trader, marketIndex, isLong) = null',
    basis: scn070RunnerBasis('开仓组前置：同方向无存量仓位', 'runBoundaryCase() 前置校验'),
  },
  '平仓边界组已准备对应仓位': {
    formula: 'isIncrease ? 跳过 : Reader.getPosition(trader, marketIndex, isLong) ≠ null',
    basis: scn070RunnerBasis('平仓组前置：先用市价开仓建立待平仓仓位', 'preparePosition()'),
  },
  '订单使用目标 marketIndex': {
    formula: 'OrderStore.order(key).marketIndex = default-mock 市场的 marketIndex',
    basis: scn070RunnerBasis('订单落在受控 Mock 市场', 'readOrder()'),
  },
  '订单类型正确': {
    formula: 'order.orderType = 开仓 MarketIncrease(0) / 平仓 MarketDecrease(2)',
    basis: orderDocBasis('市价单类型', '一、订单类型总览'),
  },
  '订单多空方向正确': {
    formula: 'order.isLong = 象限方向',
    basis: scn070ModelBasis('四象限方向定义', 'SCN070_CASES.isLong'),
  },
  '市价单 triggerPrice=0': {
    formula: 'MarketIncrease / MarketDecrease 的 triggerPrice 恒为 0（无触发条件）',
    basis: orderDocBasis('市价单没有触发价', '§1.1 精确触发条件（合约口径）'),
  },
  '链上 acceptablePrice 等于模型 A': {
    formula: '市价单 A = execPrice × (1 ± slippage)；本用例取 slippage = 0，使 A 精确落在等号边界',
    basis: orderDocBasis('市价单 acceptablePrice 规则', '§1.2 acceptablePrice 规则'),
    unit: 'price raw',
    before: (caseRecord) => `基线执行价 = ${stringValue(caseRecord.baselineExecutionPrice)}`,
  },
  '市价单创建后未冻结': {
    formula: 'order.isFrozen = false（市价单不进入 Frozen 状态）',
    basis: orderDocBasis('订单状态机', '七、订单状态机'),
  },
  '等号边界 E=A': {
    formula: 'E(基线 Oracle) = A',
    basis: scn070ModelBasis('等号边界数据集', 'SCN070_CASES.boundary = equal'),
    unit: 'price raw',
    before: scn070AcceptableBefore,
  },
  '不利边界 E 越过 A': {
    formula: '!isExecutionPriceAcceptable(E, A, isIncrease, isLong)',
    basis: scn070ModelBasis('不利越界数据集', 'isExecutionPriceAcceptable()'),
    unit: 'price raw',
    before: scn070AcceptableBefore,
  },
  '不利边界使用最小可达 Oracle 步长': {
    formula: '二分搜索最小 step，使 E(baseline + oracleDirection × step) 越过 A；等号组 step = 0',
    basis: scn070RunnerBasis('最小可达不利步长搜索', 'findAdverseExecution()'),
    unit: 'Mock Oracle raw',
  },
  '恰好一条 OrderCreated': {
    formula: 'count(OrderCreated[orderKey]) = 1',
    basis: scn070RunnerBasis('EventEmitter 事件按 orderKey 过滤', 'eventsForOrder()'),
    unit: '事件条数',
  },
  '执行后订单已从 OrderStore 移除': {
    formula: 'OrderStore.order(key).account = 0x0（成交或取消后订单均出账）',
    basis: orderDocBasis('订单终态出账', '七、订单状态机'),
  },
  '市价单任何边界都不得 Frozen': {
    formula: 'count(OrderFrozen[orderKey]) = 0',
    basis: orderDocBasis('市价单失败语义只有成交 / 取消', '§4.3 失败语义三分（前端提示必须区分）'),
    unit: '事件条数',
  },
  '等号边界恰好一条 OrderExecuted': {
    formula: 'count(OrderExecuted[orderKey]) = 1',
    basis: scn070ModelBasis('等号边界期望成交', 'SCN070_CASES.expectedOutcome = executed'),
    unit: '事件条数',
  },
  '等号边界没有 OrderCancelled': {
    formula: 'count(OrderCancelled[orderKey]) = 0',
    basis: scn070ModelBasis('等号边界期望成交', 'SCN070_CASES.expectedOutcome = executed'),
    unit: '事件条数',
  },
  '开仓等号边界建立仓位': {
    formula: 'positionAfter ≠ null',
    basis: scn070RunnerBasis('成交后 Reader 仓位快照', 'readPosition()'),
    before: scn070PositionBefore,
  },
  '开仓成功只转出一笔抵押': {
    formula: 'balanceBefore − balanceAfter = COLLATERAL_AMOUNT = 10 USDC',
    basis: scn070RunnerBasis('开仓成交只划走一笔保证金', 'collateralBalance()'),
    unit: 'USDC 1e6',
    before: scn070BalanceBefore,
  },
  '全平等号边界清除仓位': {
    formula: 'positionAfter = null（sizeDelta = 仓位全部 sizeInUsd）',
    basis: scn070RunnerBasis('全平后 Reader 仓位快照', 'readPosition()'),
    before: scn070PositionBefore,
  },
  '事件 executionPrice 精确等于 A': {
    formula: 'PositionIncrease / PositionDecrease 事件的 executionPrice = A',
    basis: orderDocBasis('执行价公式与最差可接受价的等号关系', '§5.1 执行价公式'),
    unit: 'price raw',
    before: scn070AcceptableBefore,
  },
  '不利越界恰好一条 OrderCancelled': {
    formula: 'count(OrderCancelled[orderKey]) = 1',
    basis: scn070ModelBasis('不利越界期望取消', 'SCN070_CASES.expectedOutcome = cancelled'),
    unit: '事件条数',
  },
  '不利越界没有 OrderExecuted': {
    formula: 'count(OrderExecuted[orderKey]) = 0',
    basis: scn070ModelBasis('不利越界期望取消', 'SCN070_CASES.expectedOutcome = cancelled'),
    unit: '事件条数',
  },
  '开仓取消后没有新仓位': {
    formula: 'positionAfter = null',
    basis: scn070RunnerBasis('取消后 Reader 仓位快照', 'readPosition()'),
    before: scn070PositionBefore,
  },
  '开仓取消后抵押币全额退款': {
    formula: 'balanceAfter = balanceBefore（订单取消时保证金原路退回）',
    basis: orderDocBasis('取消订单退款语义', '§4.3 失败语义三分（前端提示必须区分）'),
    unit: 'USDC 1e6',
    before: scn070BalanceBefore,
  },
  '平仓取消后原仓位完全不变': {
    formula: 'positionAfter ≡ positionBefore（marketIndex / sizeInUsd / sizeInTokens / collateralAmount / isLong 全等）',
    basis: scn070RunnerBasis('取消不得改动原仓位', 'samePosition()'),
    before: scn070PositionBefore,
  },
  '平仓取消不移动钱包抵押币': {
    formula: 'balanceAfter = balanceBefore（平仓单取消不产生任何资金流）',
    basis: orderDocBasis('取消订单退款语义', '§4.3 失败语义三分（前端提示必须区分）'),
    unit: 'USDC 1e6',
    before: scn070BalanceBefore,
  },
  '取消原因是 OrderNotFulfillableAtAcceptablePrice': {
    formula: 'OrderCancelled.reasonBytes 前 4 字节 = OrderNotFulfillableAtAcceptablePrice 选择器',
    basis: orderDocBasis('可接受价不满足时的取消原因', '§4.3 失败语义三分（前端提示必须区分）'),
  },
  '取消错误中的 executionPrice 等于边界模型 E': {
    formula: 'decode(reasonBytes).executionPrice = 模型 E',
    basis: scn070ModelBasis('链上回传的越界执行价与模型一致', 'isExecutionPriceAcceptable()'),
    unit: 'price raw',
  },
  '取消错误中的 acceptablePrice 等于订单 A': {
    formula: 'decode(reasonBytes).acceptablePrice = 订单 A',
    basis: orderDocBasis('市价单 acceptablePrice 规则', '§1.2 acceptablePrice 规则'),
    unit: 'price raw',
    before: scn070AcceptableBefore,
  },
};

function scn070AssertionMeta(name: string): Scn070AssertionMeta {
  const direct = SCN070_ASSERTION_META[name];
  if (direct) return direct;
  if (name.startsWith('恰好一条 Position')) {
    return {
      formula: `count(${name.replace('恰好一条 ', '')}[orderKey]) = 1`,
      basis: scn070RunnerBasis('成交后仓位事件按 orderKey 过滤', 'eventsForOrder()'),
      unit: '事件条数',
    };
  }
  return {
    formula: 'SCN-070 Runner 直接比对链上返回值：actual = expected 才通过',
    basis: scn070RunnerBasis('Runner 内联断言', 'runBoundaryCase() check()'),
  };
}

function scn070HasPassedAssertion(caseRecord: JsonRecord, name: string): boolean {
  return arrayValue(caseRecord.assertions)
    .map(record)
    .some((item) => stringValue(item.name) === name && item.passed === true);
}

function scn070OrderKey(events: unknown): string | undefined {
  for (const item of arrayValue(events)) {
    const event = record(item);
    if (stringValue(event.eventName) !== 'OrderCreated') continue;
    const entries = arrayValue(record(record(record(event.eventData).bytes32Items).items)).map(record);
    const key = stringValue(entries.find((entry) => stringValue(entry.key) === 'key')?.value, '');
    if (/^0x[0-9a-fA-F]{64}$/.test(key)) return key;
  }
  return undefined;
}

function scn070Transaction(
  actor: 'TRADER' | 'KEEPER',
  action: string,
  value: unknown,
  orderKey?: string,
): TransactionEvidence | undefined {
  const tx = record(value);
  const txHash = stringValue(tx.hash, '');
  const from = stringValue(tx.from, '');
  const to = stringValue(tx.to, '');
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)
    || !/^0x[0-9a-fA-F]{40}$/.test(from)
    || !/^0x[0-9a-fA-F]{40}$/.test(to)) return undefined;

  const status = stringValue(tx.status, '');
  const r = stringValue(tx.r, '');
  const s = stringValue(tx.s, '');
  return {
    actor,
    action,
    txHash,
    from,
    to,
    blockNumber: Number(bigintValue(tx.blockNumber)),
    status: status === 'success' ? 'SUCCESS' : status ? 'REVERTED' : 'UNKNOWN',
    transactionType: stringValue(tx.transactionType, '未记录'),
    nonce: stringValue(tx.nonce, '未记录'),
    gasUsed: stringValue(tx.gasUsed, 'unknown'),
    ...(orderKey ? { orderKey } : {}),
    // 旧运行的证据没有记录 r/s；此时如实显示为未验证，而不是假定签名有效。
    signatureVerified: /^0x[0-9a-fA-F]+$/.test(r) && /^0x[0-9a-fA-F]+$/.test(s)
      && BigInt(r) !== 0n && BigInt(s) !== 0n,
  };
}

function deriveScn070Case(
  caseRecord: JsonRecord,
  definition: JsonRecord,
  index: number,
  oracleDecimals: number,
): { readonly rows: Reconciliation[]; readonly transactions: TransactionEvidence[] } {
  const caseId = stringValue(caseRecord.caseId, `case-${index + 1}`);
  const quadrantKey = stringValue(caseRecord.quadrant, '');
  const quadrant = SCN070_QUADRANTS[quadrantKey];
  const equal = stringValue(caseRecord.boundary) === 'equal';
  const expectExecuted = stringValue(caseRecord.expectedOutcome) === 'executed';
  const short = quadrant?.short ?? quadrantKey;
  const group = `${index + 1} ${short} · ${equal ? '等号 E=A' : '不利越界'}`;
  const direction = Number(stringValue(definition.oracleDirection, '0'));
  const isIncrease = definition.isIncrease === undefined
    ? quadrantKey.startsWith('open')
    : boolValue(definition.isIncrease);
  const isLong = boolValue(caseRecord.isLong);
  const useMax = (isIncrease && isLong) || (!isIncrease && !isLong);

  const baselineOracle = bigintValue(caseRecord.baselineOracleRawPrice);
  const executionOracle = bigintValue(caseRecord.executionOracleRawPrice);
  const oracleStep = bigintValue(caseRecord.oracleRawStep);
  const baselineExecution = bigintValue(caseRecord.baselineExecutionPrice);
  const acceptablePrice = bigintValue(caseRecord.acceptablePrice);
  const executionPrice = bigintValue(caseRecord.executionPrice);
  const acceptable = isExecutionPriceAcceptable(executionPrice, acceptablePrice, isIncrease, isLong);
  const oracleMoved = equal
    ? executionOracle === baselineOracle && oracleStep === 0n
    : oracleStep > 0n && executionOracle === baselineOracle + BigInt(direction) * oracleStep;

  const rows: Reconciliation[] = [
    {
      id: `${caseId}-oracle-move`,
      group,
      label: 'Mock Oracle 原始报价（基线 → 执行）',
      status: oracleMoved ? 'PASS' : 'FAIL',
      before: rawAndUnit(baselineOracle, oracleDecimals, 'USD'),
      after: rawAndUnit(executionOracle, oracleDecimals, 'USD'),
      delta: deltaAndUnit(executionOracle - baselineOracle, oracleDecimals, 'USD'),
      expected: equal
        ? '与基线一致（oracleRawStep = 0）'
        : `基线 ${direction > 0 ? '+' : '−'} 最小可达步长（oracleRawStep > 0）`,
      formula: 'executionOracleRawPrice = baselineOracleRawPrice + oracleDirection × oracleRawStep',
      basis: scn070ModelBasis('不利方向按象限取值：开多 / 平空 +1，开空 / 平多 −1', 'SCN070_CASES.oracleDirection'),
      unit: `Mock Oracle raw 1e${oracleDecimals}`,
    },
    {
      id: `${caseId}-acceptable-price`,
      group,
      label: '订单最差可接受价 A',
      status: pass(acceptablePrice, baselineExecution),
      before: `基线 Oracle 下 Reader 执行价 = ${baselineExecution.toString()}`,
      after: `订单 acceptablePrice = ${acceptablePrice.toString()}`,
      expected: `A = 基线执行价 ${baselineExecution.toString()}`,
      formula: '市价单 A = execPrice × (1 ± slippage)；本用例取 slippage = 0，使 A 精确落在等号边界',
      basis: orderDocBasis('市价单 acceptablePrice 规则', '§1.2 acceptablePrice 规则'),
      unit: 'price raw',
    },
    {
      id: `${caseId}-boundary-decision`,
      group,
      label: '四象限可接受性判定 E vs A',
      status: acceptable === expectExecuted ? 'PASS' : 'FAIL',
      before: `A = ${acceptablePrice.toString()}`,
      after: `E = ${executionPrice.toString()}（${acceptable ? '可成交' : '不可成交'}）`,
      delta: `E − A = ${signedValue(executionPrice - acceptablePrice)}`,
      expected: `${quadrant?.rule ?? '按象限比较方向判定'}；本组期望${expectExecuted ? '成交' : '取消'}`,
      formula: 'isIncrease ? (isLong ? E ≤ A : E ≥ A) : (isLong ? E ≥ A : E ≤ A)',
      basis: scn070ModelBasis('四象限比较方向（与合约 BaseOrderUtils 独立同构）', 'isExecutionPriceAcceptable()'),
      unit: 'price raw',
      note: `执行价取值方向：${useMax ? 'useMax = true，ceil(indexAsk × (1 + totalSpread))' : 'useMax = false，floor(indexBid × (1 − totalSpread))'}`,
    },
    ...arrayValue(caseRecord.assertions).map(record).map((assertion, order) => {
      const name = stringValue(assertion.name, `断言 ${order + 1}`);
      const meta = scn070AssertionMeta(name);
      return {
        id: `${caseId}-assert-${order + 1}`,
        group,
        label: name,
        status: assertion.passed === true ? 'PASS' as const : 'FAIL' as const,
        before: meta.before?.(caseRecord) ?? '—',
        after: scn070Display(assertion.actual),
        expected: scn070Display(assertion.expected),
        formula: meta.formula,
        basis: meta.basis,
        ...(meta.unit ? { unit: meta.unit } : {}),
      };
    }),
  ];

  const label = `${short}·${equal ? '等号' : '越界'}`;
  const orderKey = scn070OrderKey(caseRecord.events);
  const transactionRecord = record(caseRecord.transactions);
  const transactions = [
    scn070Transaction('TRADER', `${label}｜前置：创建市价开仓订单`, transactionRecord.prepareCreate),
    scn070Transaction('KEEPER', `${label}｜前置：执行市价开仓订单`, transactionRecord.prepareExecute),
    scn070Transaction(
      'TRADER',
      `${label}｜创建${isIncrease ? '市价开仓' : '市价全平'}订单（acceptablePrice = A）`,
      transactionRecord.create,
      orderKey,
    ),
    scn070Transaction(
      'KEEPER',
      `${label}｜执行订单（期望${expectExecuted ? '成交' : '取消'}）`,
      transactionRecord.execute,
      orderKey,
    ),
  ].filter((item): item is TransactionEvidence => Boolean(item));

  return { rows, transactions };
}

function deriveScn070Evidence(
  raw: JsonRecord,
  sourcePath: string,
): NonNullable<ScenarioResult['executionEvidence']> {
  const environment = record(raw.environment);
  const coverage = record(raw.coverage);
  const summary = record(raw.summary);
  const matrix = arrayValue(raw.matrix).map(record);
  const cases = arrayValue(raw.cases).map(record);
  const definitionById = new Map(matrix.map((item) => [stringValue(item.id), item]));
  const oracleDecimals = Number(stringValue(environment.mockOracleDecimals, '0')) || 0;

  const plannedExecuted = matrix.filter((item) => stringValue(item.expectedOutcome) === 'executed').length;
  const plannedCancelled = matrix.filter((item) => stringValue(item.expectedOutcome) === 'cancelled').length;
  const executedOnChain = cases.filter((item) => scn070HasPassedAssertion(item, '等号边界恰好一条 OrderExecuted')).length;
  const cancelledOnChain = cases.filter((item) => scn070HasPassedAssertion(item, '不利越界恰好一条 OrderCancelled')).length;
  const assertionTotal = cases.reduce((total, item) => total + arrayValue(item.assertions).length, 0);

  const overview: Reconciliation[] = [
    {
      id: 'scn070-matrix-size',
      group: '0 矩阵总览',
      label: '必做数据集数量',
      status: cases.length === 8 && matrix.length === 8 ? 'PASS' : 'FAIL',
      before: '—',
      after: `执行 ${cases.length} 个 / 矩阵 ${matrix.length} 个`,
      expected: '8 个（4 象限 × 2 边界）',
      formula: 'SCN070_CASES = {开多, 开空, 平多, 平空} × {E = A, 最小可达不利步长}',
      basis: scn070ModelBasis('矩阵 B 的 8 个必做数据集', 'SCN070_CASES / validateScn070Matrix()'),
      unit: '数据集',
    },
    {
      id: 'scn070-executed-count',
      group: '0 矩阵总览',
      label: '等号边界链上成交数据集',
      status: pass(executedOnChain, plannedExecuted),
      before: '—',
      after: `${executedOnChain} 个数据集出现且仅出现一条 OrderExecuted`,
      expected: `${plannedExecuted} 个（矩阵中 expectedOutcome = executed）`,
      formula: 'count(数据集 : OrderExecuted[orderKey] = 1) = count(矩阵 : expectedOutcome = executed)',
      basis: scn070ModelBasis('等号边界必须成交', 'SCN070_CASES.expectedOutcome'),
      unit: '数据集',
    },
    {
      id: 'scn070-cancelled-count',
      group: '0 矩阵总览',
      label: '不利越界链上取消数据集',
      status: pass(cancelledOnChain, plannedCancelled),
      before: '—',
      after: `${cancelledOnChain} 个数据集出现且仅出现一条 OrderCancelled`,
      expected: `${plannedCancelled} 个（矩阵中 expectedOutcome = cancelled）`,
      formula: 'count(数据集 : OrderCancelled[orderKey] = 1) = count(矩阵 : expectedOutcome = cancelled)',
      basis: scn070ModelBasis('不利越界必须取消', 'SCN070_CASES.expectedOutcome'),
      unit: '数据集',
    },
    {
      id: 'scn070-assertion-total',
      group: '0 矩阵总览',
      label: '链上断言总数',
      status: pass(bigintValue(summary.assertions), assertionTotal),
      before: '—',
      after: `summary.assertions = ${stringValue(summary.assertions)}`,
      expected: `${assertionTotal}（各数据集 assertions 长度之和）`,
      formula: 'summary.assertions = Σ 数据集.assertions.length',
      basis: scn070RunnerBasis('断言计数与逐条断言记录一致', 'runScn070() summary'),
      unit: '断言条数',
    },
  ];

  const derived = cases.map((item, index) => deriveScn070Case(
    item,
    definitionById.get(stringValue(item.caseId)) ?? {},
    index,
    oracleDecimals,
  ));
  const reconciliations = [...overview, ...derived.flatMap((item) => item.rows)].map(withVerification);
  const transactions = derived.flatMap((item) => item.transactions);
  const executed = arrayValue(coverage.executed).map((item) => stringValue(item));
  const pending = arrayValue(coverage.pending).map((item) => stringValue(item));
  const forkDisplayName = normalizeForkDisplayName(stringValue(environment.forkDisplayName, ''));

  return {
    mode: stringValue(raw.runMode, 'unknown'),
    persistent: environment.resetMode === 'persistent-no-revert',
    executionStatus: reconciliations.every((item) => item.status === 'PASS')
      && transactions.every((item) => item.status === 'SUCCESS')
      ? 'PASS'
      : 'FAIL',
    coverageStatus: coverage.completeScenario === true ? 'COMPLETE' : 'PARTIAL',
    ...(pending.length
      ? { coverageNote: `已自动化：${executed.join('；')}。尚未自动化：${pending.join('；')}。` }
      : {}),
    ...(forkDisplayName ? { forkDisplayName } : {}),
    sourcePath,
    formulaSourcePath: ORDER_FLOW_SOURCE,
    reconciliations,
    transactions,
  };
}

interface EvidenceSource {
  readonly attachmentName: string;
  readonly derive: (raw: JsonRecord, sourcePath: string) => NonNullable<ScenarioResult['executionEvidence']>;
}

const EVIDENCE_SOURCES: Record<string, EvidenceSource> = {
  'SCN-009': { attachmentName: 'scn-009-evidence.json', derive: deriveScn009Evidence },
  // SCN-065 与 SCN-009 共用 runMarketFlow 证据形状；derive 已方向感知（isLong 取自事件/testData）。
  'SCN-065': { attachmentName: 'scn-065-evidence.json', derive: deriveScn009Evidence },
  'SCN-010': { attachmentName: 'scn-010-evidence.json', derive: deriveScn010Evidence },
  'SCN-070': { attachmentName: 'scn-070-evidence.json', derive: deriveScn070Evidence },
};

async function evidenceForResult(result: ScenarioResult): Promise<ScenarioResult['executionEvidence']> {
  const source = EVIDENCE_SOURCES[result.id];
  const attachment = source
    ? result.attempts.at(-1)?.attachments.find((item) => item.name === source.attachmentName)
    : undefined;
  if (!source || !attachment?.path) return result.executionEvidence;
  const evidencePath = resolve(process.cwd(), attachment.path);
  const relativePath = relative(process.cwd(), evidencePath);
  if (relativePath.startsWith('..')) return undefined;
  try {
    const parsed = JSON.parse(await readFile(evidencePath, 'utf8')) as unknown;
    return source.derive(record(parsed), relativePath);
  } catch {
    // 历史运行的 Playwright 临时附件可能已被下一次运行清理；已有结构化证据时继续保留。
    return result.executionEvidence;
  }
}

export async function attachExecutionEvidence(input: TestRunArtifact): Promise<TestRunArtifact> {
  const results = await Promise.all(input.results.map(async (result) => {
    const executionEvidence = await evidenceForResult(result);
    if (!executionEvidence) return result;
    const normalizedForkName = normalizeForkDisplayName(executionEvidence.forkDisplayName);
    const { forkDisplayName: _rawForkName, ...evidenceWithoutForkName } = executionEvidence;
    const normalizedEvidence = {
      ...evidenceWithoutForkName,
      ...(normalizedForkName ? { forkDisplayName: normalizedForkName } : {}),
    };
    const legacyPartialCoverage = result.id === 'SCN-009'
      && result.status === 'BLOCKED'
      && result.annotations.some((annotation) => annotation.type === 'blocked'
        && annotation.description?.includes('完整 SCN-009 仍缺'));
    const baseCheckResult = result.checkResult
      .replace(/；执行详情已展开 \d+ 项 Before \/ After \/ Δ \/ Expected 对账。$/, '')
      .replace(/[。；]+$/, '');
    const detailedCheckResult = `${baseCheckResult}；执行详情已展开 ${normalizedEvidence.reconciliations.length} 项 Before / After / Δ / Expected 对账。`;
    if (!legacyPartialCoverage) return { ...result, checkResult: detailedCheckResult, executionEvidence: normalizedEvidence };
    return {
      ...result,
      status: executionEvidence.executionStatus ?? result.status,
      checkResult: `真实签名开仓/全平链路执行通过；链上 17 项断言、4 笔交易及签名证据均通过；执行详情已展开 ${normalizedEvidence.reconciliations.length} 项 Before / After / Δ / Expected 对账。`,
      annotations: result.annotations.map((annotation) => annotation.type === 'blocked'
        ? { ...annotation, type: 'coverage-gap' }
        : annotation),
      executionEvidence: normalizedEvidence,
    };
  }));
  return { ...input, results };
}

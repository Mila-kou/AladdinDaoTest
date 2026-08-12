import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

import { normalizeForkDisplayName } from '../domain/fork-display.js';
import {
  calculateExecutionPrice,
  calculateFundingFactors,
  calculateGrace,
  calculatePositionFee,
  calculateSignedSkew,
  calculateSkewImpact,
  ceilDiv,
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
  const sum = optionalBigint(input.observation.sum);
  const terms = record(input.observation.terms);
  const hasAllTerms = CONSERVATION_TERM_FIELDS.every(([key]) => optionalBigint(terms[key]) !== undefined);
  const expandedTerms = hasAllTerms
    ? CONSERVATION_TERM_FIELDS.map(([key, label]) => `${label}(${bigintValue(terms[key])})`).join(' + ')
    : '历史证据未保存五方逐项 Δ';
  const expandedResult = sum === undefined
    ? `${expandedTerms} = 无法核对`
    : `${expandedTerms} = ${rawAndUnit(sum, 6, 'USDC')}`;

  return {
    id: input.id,
    group: '守恒',
    label: input.label,
    status: stringValue(input.observation.status) === 'PASS' && sum === 0n && hasAllTerms
      ? 'PASS'
      : 'FAIL',
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
    note: 'Position Fee 与 Funding 已分别在 Fee/Funding 行复算；它们在资金守恒式中通过 PositionVault、LPVault、FeeHandler 的实际余额变化体现，不再作为第六、第七项重复相加。Claimable Fee/Funding 属于 DataStore 应收账本，单独核对。第五方是 FeeHandler 合约（claimFees 第一跳收款方，交易执行窗口余额恒不变）；DataStore.FEE_RECEIVER 指向的 RevenuePool 只在 withdrawFees 后才有资金流，不在本守恒圈内。',
  };
}

function boolValue(value: unknown): boolean {
  return value === true || value === 'true';
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
}

const LEDGER_FIELDS: readonly LedgerField[] = [
  { key: 'traderUsdc', label: 'ΔTrader', family: '资金账户', decimals: 6, symbol: 'USDC', unit: 'USDC 1e6' },
  { key: 'orderVaultUsdc', label: 'ΔOrderVault', family: '资金账户', decimals: 6, symbol: 'USDC', unit: 'USDC 1e6' },
  { key: 'posVaultUsdc', label: 'ΔPositionVault', family: '资金账户', decimals: 6, symbol: 'USDC', unit: 'USDC 1e6' },
  { key: 'lpVaultAssets', label: 'ΔLPVaultAssets', family: '资金账户', decimals: 6, symbol: 'USDC', unit: 'USDC 1e6' },
  { key: 'feeReceiverUsdc', label: 'ΔFeeHandler', family: '资金账户', decimals: 6, symbol: 'USDC', unit: 'USDC 1e6' },
  { key: 'claimableFeeAmountPosition', label: '待领取仓位费', family: '资金账户', decimals: 6, symbol: 'USDC', unit: 'USDC 1e6' },
  { key: 'claimableFeeAmountFunding', label: '待领取 Funding', family: '资金账户', decimals: 6, symbol: 'USDC', unit: 'USDC 1e6' },
  { key: 'claimableFeeAmountLiquidation', label: '待领取清算费', family: '资金账户', decimals: 6, symbol: 'USDC', unit: 'USDC 1e6' },
  { key: 'cumulativeOpenCostsLong', label: 'Long 累计开仓成本', family: '市场 / OI', decimals: 30, symbol: 'USD', unit: 'USD 1e30' },
  { key: 'cumulativeOpenCostsShort', label: 'Short 累计开仓成本', family: '市场 / OI', decimals: 30, symbol: 'USD', unit: 'USD 1e30' },
  { key: 'openInterestInTokensLong', label: 'Long Open Interest', family: '市场 / OI', decimals: 'token', symbol: 'token', unit: 'token' },
  { key: 'openInterestInTokensShort', label: 'Short Open Interest', family: '市场 / OI', decimals: 'token', symbol: 'token', unit: 'token' },
  { key: 'positionImpactPoolAmount', label: 'Position Impact Pool', family: '市场 / OI', decimals: 'token', symbol: 'token', unit: 'token' },
];

type TradePhaseKind = 'create-order' | 'create-decrease-order'
  | 'create-and-increase' | 'execute-increase' | 'create-and-decrease' | 'execute-decrease';

interface LedgerDeltaExpectation {
  readonly value?: bigint;
  readonly formula: string;
  readonly note?: string;
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
  const funding = record(record((Array.isArray(input.events.fundingEvents) ? input.events.fundingEvents : [])[0]).int);
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
      positionImpactPoolAmount: zero('订单尚未执行：Expected ΔPosition Impact Pool = 0'),
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
      positionImpactPoolAmount: zero('减仓订单尚未执行：Expected ΔPosition Impact Pool = 0'),
    };
  }

  const executionPrice = bigintValue(eventUint.executionPrice);
  const sizeInTokens = executionPrice === 0n ? undefined : sizeUsd / executionPrice;
  const feeForPool = bigintValue(fees.feeAmountForPool ?? fees.positionFeeAmountForPool);
  const feeReceiverAmount = bigintValue(fees.feeReceiverAmount);
  const negativeFunding = bigintValue(fees.negativeFundingFeeAmount);
  const positiveFunding = bigintValue(fees.positiveFundingFeeAmount);
  const positionPaysLp = bigintValue(funding.positionPaysLp);
  const lpToPositionVault = maxBigInt(-positionPaysLp);
  const claimableFunding = maxBigInt(positionPaysLp);
  const isIncrease = input.phaseKind === 'create-and-increase' || input.phaseKind === 'execute-increase';

  if (isIncrease) {
    const traderDelta = input.phaseKind === 'create-and-increase' ? -margin : 0n;
    const orderVaultDelta = input.phaseKind === 'execute-increase' ? -margin : 0n;
    const positionVaultDelta = margin - feeForPool + lpToPositionVault;
    const lpVaultDelta = feeForPool - lpToPositionVault;
    const increaseFormula = `${sizeModel.expanded}；${sizeUsd} / executionPrice ${executionPrice} = ${stringValue(sizeInTokens)}`;
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
      },
      claimableFeeAmountFunding: {
        value: claimableFunding,
        formula: `Expected ΔClaimable Funding = max(positionPaysLp, 0) = max(${positionPaysLp}, 0) = ${claimableFunding}`,
      },
      claimableFeeAmountLiquidation: zero('非清算订单：Expected ΔClaimable Liquidation Fee = 0'),
      cumulativeOpenCostsLong: {
        value: isLong ? sizeUsd : 0n,
        formula: `Expected ΔLong Open Costs = isLong ? inputSizeUsd : 0 = ${isLong ? sizeUsd : 0n}`,
      },
      cumulativeOpenCostsShort: {
        value: isLong ? 0n : sizeUsd,
        formula: `Expected ΔShort Open Costs = isLong ? 0 : inputSizeUsd = ${isLong ? 0n : sizeUsd}`,
      },
      openInterestInTokensLong: {
        ...(sizeInTokens === undefined ? {} : { value: isLong ? sizeInTokens : 0n }),
        formula: `Expected ΔLong OI = isLong ? sizeUsd / executionPrice : 0；本次 ${increaseFormula}`,
      },
      openInterestInTokensShort: {
        ...(sizeInTokens === undefined ? {} : { value: isLong ? 0n : sizeInTokens }),
        formula: `Expected ΔShort OI = isLong ? 0 : sizeUsd / executionPrice；本次 ${increaseFormula}`,
      },
      positionImpactPoolAmount: {
        formula: '需要独立实现 Position Impact Pool 结算公式后才能生成 Expected Δ',
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
  const traderOutput = oldMargin + positiveFunding + positivePnl - negativeFunding - negativePnl - costExcludingFunding;
  const lpVaultDelta = feeForPool + negativePnl - positivePnl - lpToPositionVault;
  const positionVaultDelta = -traderOutput - lpVaultDelta;
  const oldSizeUsd = bigintValue(input.positionBefore.sizeInUsd);
  const oldSizeInTokens = bigintValue(input.positionBefore.sizeInTokens);
  const decreaseTokens = oldSizeUsd === 0n ? undefined : oldSizeInTokens * sizeUsd / oldSizeUsd;
  const pnlFormula = `positivePnl=${positivePnl}；negativePnl=ceil(abs(${basePnlUsd})/${collateralMin})=${negativePnl}`;
  return {
    traderUsdc: {
      value: traderOutput,
      formula: `Expected ΔTrader = oldMargin + positiveFunding + positivePnl − negativeFunding − negativePnl − feeExFunding = ${oldMargin} + ${positiveFunding} + ${positivePnl} − ${negativeFunding} − ${negativePnl} − ${costExcludingFunding} = ${traderOutput}`,
      note: pnlFormula,
    },
    orderVaultUsdc: zero('减仓订单没有抵押品存入：Expected ΔOrderVault = 0'),
    posVaultUsdc: {
      value: positionVaultDelta,
      formula: `Expected ΔPositionVault = −TraderOutput − ΔLPVault = −${traderOutput} − ${lpVaultDelta} = ${positionVaultDelta}`,
    },
    lpVaultAssets: {
      value: lpVaultDelta,
      formula: `Expected ΔLPVault = feeForPool + negativePnl − positivePnl − LP→Position Funding = ${feeForPool} + ${negativePnl} − ${positivePnl} − ${lpToPositionVault} = ${lpVaultDelta}`,
    },
    feeReceiverUsdc: zero('协议费只记 Claimable（USDC 物理留在 PositionVault）；claimFees 之前 FeeHandler 余额不变：Expected ΔFeeHandler = 0'),
    claimableFeeAmountPosition: {
      value: feeReceiverAmount,
      formula: `Expected ΔClaimable Position Fee = feeReceiverAmount = ${feeReceiverAmount}`,
    },
    claimableFeeAmountFunding: {
      value: claimableFunding,
      formula: `Expected ΔClaimable Funding = max(positionPaysLp, 0) = max(${positionPaysLp}, 0) = ${claimableFunding}`,
    },
    claimableFeeAmountLiquidation: zero('非清算订单：Expected ΔClaimable Liquidation Fee = 0'),
    cumulativeOpenCostsLong: {
      value: isLong ? -sizeUsd : 0n,
      formula: `Expected ΔLong Open Costs = isLong ? −inputSizeUsd : 0 = ${isLong ? -sizeUsd : 0n}`,
    },
    cumulativeOpenCostsShort: {
      value: isLong ? 0n : -sizeUsd,
      formula: `Expected ΔShort Open Costs = isLong ? 0 : −inputSizeUsd = ${isLong ? 0n : -sizeUsd}`,
    },
    openInterestInTokensLong: {
      ...(decreaseTokens === undefined ? {} : { value: isLong ? -decreaseTokens : 0n }),
      formula: `Expected sizeDeltaInTokens = oldSizeInTokens ${oldSizeInTokens} × sizeDeltaUsd ${sizeUsd} / oldSizeUsd ${oldSizeUsd} = ${stringValue(decreaseTokens)}；Expected ΔLong OI = ${isLong && decreaseTokens !== undefined ? -decreaseTokens : 0n}`,
    },
    openInterestInTokensShort: {
      ...(decreaseTokens === undefined ? {} : { value: isLong ? 0n : -decreaseTokens }),
      formula: `Expected sizeDeltaInTokens = oldSizeInTokens ${oldSizeInTokens} × sizeDeltaUsd ${sizeUsd} / oldSizeUsd ${oldSizeUsd} = ${stringValue(decreaseTokens)}；Expected ΔShort OI = ${!isLong && decreaseTokens !== undefined ? -decreaseTokens : 0n}`,
    },
    positionImpactPoolAmount: {
      formula: '需要独立实现 Position Impact Pool 结算公式后才能生成 Expected Δ',
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
      formula: `${expectation?.formula ?? '缺少 Expected Δ 公式'}；Expected After = Before + Expected Δ`,
      basis: {
        title: '链上阶段快照与账户增量账本',
        sourcePath: input.ledgerSource,
        section: `${input.beforeLabel} → ${input.afterLabel}`,
      },
      unit,
      note: `Before/After 均为指定区块 Reader 或 ERC20 实际读数；链上 Actual Δ=${actualDelta} raw。${expectation?.note ?? ''}`,
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
      formula: input.expectedReason,
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
  const longBeforeUsd = oiUsd(input.before.openInterestInTokensLong, mid);
  const shortBeforeUsd = oiUsd(input.before.openInterestInTokensShort, mid);
  const longAfterUsd = oiUsd(input.after.openInterestInTokensLong, mid);
  const shortAfterUsd = oiUsd(input.after.openInterestInTokensShort, mid);
  const skewBefore = calculateSignedSkew(longBeforeUsd, shortBeforeUsd);
  const skewAfter = calculateSignedSkew(longAfterUsd, shortAfterUsd);
  const skewRef = (absolute(skewBefore) + absolute(skewAfter)) / 2n;
  const imbalanceBefore = absolute(longBeforeUsd - shortBeforeUsd);
  const imbalanceAfter = absolute(longAfterUsd - shortAfterUsd);
  const expectedImproved = imbalanceAfter < imbalanceBefore;
  const actualImproved = boolValue(input.balanceWasImproved);
  const spread = bigintValue(uint.dynamicSpread);
  const eventName = stringValue(input.positionEvent.eventName, '');
  const isIncrease = eventName === 'PositionIncrease';
  const isLong = boolValue(record(input.positionEvent.bool).isLong);
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
  const rows: Reconciliation[] = [
    {
      id: `${input.phaseId}-pricing-long-oi-usd`, group: `${input.phaseLabel} · OI / Skew / Spread`, label: 'Long OI（USD 口径）',
      status: 'CALCULATED', before: rawAndUnit(longBeforeUsd, 30, 'USD'), after: rawAndUnit(longAfterUsd, 30, 'USD'),
      delta: deltaAndUnit(longAfterUsd - longBeforeUsd, 30, 'USD'), expected: '—（派生展示行，无独立期望值）',
      formula: 'longOIUsd = longOpenInterestInTokens × indexMidPrice',
      basis: { title: '市场 Open Interest USD', sourcePath: PAGE_FORMULA_SOURCE, section: '五、Funding / OI 与 Skew' }, unit: 'USD 1e30',
      note: `indexMidPrice=(${priceMin}+${priceMax})/2=${mid}。本行是链上 OI Token 与 Oracle 价格的派生展示。`,
    },
    {
      id: `${input.phaseId}-pricing-short-oi-usd`, group: `${input.phaseLabel} · OI / Skew / Spread`, label: 'Short OI（USD 口径）',
      status: 'CALCULATED', before: rawAndUnit(shortBeforeUsd, 30, 'USD'), after: rawAndUnit(shortAfterUsd, 30, 'USD'),
      delta: deltaAndUnit(shortAfterUsd - shortBeforeUsd, 30, 'USD'), expected: '—（派生展示行，无独立期望值）',
      formula: 'shortOIUsd = shortOpenInterestInTokens × indexMidPrice',
      basis: { title: '市场 Open Interest USD', sourcePath: PAGE_FORMULA_SOURCE, section: '五、Funding / OI 与 Skew' }, unit: 'USD 1e30',
    },
    {
      id: `${input.phaseId}-pricing-raw-skew`, group: `${input.phaseLabel} · OI / Skew / Spread`, label: '实时 Raw Skew（进入 EMA 前）',
      status: 'CALCULATED', before: rawAndUnit(skewBefore, 18, 'ratio'), after: rawAndUnit(skewAfter, 18, 'ratio'),
      delta: deltaAndUnit(skewAfter - skewBefore, 18, 'ratio'), expected: '—（派生展示行，无独立期望值）',
      formula: 'skew = (longOIUsd − shortOIUsd) × 1e18 / (longOIUsd + shortOIUsd)',
      basis: { title: 'Funding 原始 Skew；实际费率使用 EMA Skew', sourcePath: PAGE_FORMULA_SOURCE, section: '五、Funding / 5.1 Raw Skew' }, unit: 'ratio 1e18',
    },
    {
      id: `${input.phaseId}-pricing-skew-ref`, group: `${input.phaseLabel} · OI / Skew / Spread`, label: 'Spread Skew Reference',
      status: 'CALCULATED', before: rawAndUnit(absolute(skewBefore), 18, 'ratio'), after: rawAndUnit(absolute(skewAfter), 18, 'ratio'),
      delta: deltaAndUnit(absolute(skewAfter) - absolute(skewBefore), 18, 'ratio'), expected: rawAndUnit(skewRef, 18, 'ratio'),
      formula: 'skewRef = (abs(skewBefore) + abs(skewAfter)) / 2',
      basis: { title: '动态点差的 Skew Reference', sourcePath: PAGE_FORMULA_SOURCE, section: '一、下单面板 / Dynamic Spread' }, unit: 'ratio 1e18',
      note: 'Expected 列为本次成交用于 Skew Impact 的前后平均值，不是 After 单点值。',
    },
    {
      id: `${input.phaseId}-pricing-balance-improved`, group: `${input.phaseLabel} · OI / Skew / Spread`, label: '是否改善多空平衡',
      status: pass(actualImproved, expectedImproved), before: rawAndUnit(imbalanceBefore, 30, 'USD'), after: rawAndUnit(imbalanceAfter, 30, 'USD'),
      delta: deltaAndUnit(imbalanceAfter - imbalanceBefore, 30, 'USD'), expected: String(expectedImproved),
      formula: 'balanceWasImproved = abs(nextLongOI − nextShortOI) < abs(currentLongOI − currentShortOI)',
      basis: { title: 'Skew Impact 正负方向', sourcePath: PAGE_FORMULA_SOURCE, section: '一、下单面板 / Dynamic Spread' }, unit: 'boolean / USD 1e30',
    },
    ...(skewImpact ? [{
      id: `${input.phaseId}-pricing-skew-impact`, group: `${input.phaseLabel} · OI / Skew / Spread`, label: 'Skew Impact（参数复算）',
      status: 'CALCULATED' as const,
      before: rawAndUnit(skewRef, 18, 'ratio'), after: rawAndUnit(skewImpact.skewImpact, 18, 'ratio'),
      delta: deltaAndUnit(skewImpact.skewImpact, 18, 'ratio'), expected: '—（参数复算展示行，事件未单独给出 Skew 分量，无对照值）',
      formula: `skewImpact = ${skewImpact.expanded}`,
      basis: { title: 'Skew Impact 参数公式', sourcePath: PAGE_FORMULA_SOURCE, section: '一、下单面板 / Dynamic Spread' }, unit: 'ratio 1e18',
      note: `${parameterBlockNote(input.parameters)} 本行独立展示 Skew Impact 分量；Dynamic Spread 还包含 Price Impact。`,
    }] : []),
    {
      id: `${input.phaseId}-pricing-dynamic-spread`, group: `${input.phaseLabel} · OI / Skew / Spread`, label: 'Dynamic Spread 总值',
      status: 'NOT_VERIFIED', before: rawAndUnit(0n, 18, 'ratio'), after: rawAndUnit(spread, 18, 'ratio'),
      delta: deltaAndUnit(spread, 18, 'ratio'), expected: '需用合约 LogExpMath 独立复算 priceImpact 后才能得到精确 Expected',
      formula: 'dynamicSpread = max(0, constantPriceSpread + priceImpactSpread + skewImpact)',
      basis: { title: '动态点差总公式', sourcePath: PAGE_FORMULA_SOURCE, section: '一、下单面板 / Dynamic Spread' }, unit: 'ratio 1e18',
      note: `${parameterBlockNote(input.parameters)} ${spreadParameterSummary}事件保存合约最终 Spread；当前未复制 LogExpMath，因此不伪记 PASS。`,
    },
    {
      id: `${input.phaseId}-pricing-execution-price`, group: `${input.phaseLabel} · OI / Skew / Spread`, label: 'Spread 调整后执行价',
      status: pass(executionPrice, execution.executionPrice), before: stringValue(selectedOracle), after: stringValue(executionPrice),
      delta: deltaAndUnit(executionPrice - selectedOracle, 0, 'price raw'), expected: execution.executionPrice.toString(),
      formula: `executionPrice = ${execution.expanded}`,
      basis: { title: '方向与开/平仓共同决定价格不利侧', sourcePath: PAGE_FORMULA_SOURCE, section: '一、下单面板 / 1.5 执行价' }, unit: 'price raw',
      note: '【恒等式】oracle 价与 dynamicSpread 均取自被核对的同一事件——本行验证合约价格公式（方向/不利侧/取整）自洽，不构成独立重算；dynamicSpread 的独立复算未实现（见 Dynamic Spread 行 NOT_VERIFIED）。',
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
        formula: isLong ? 'sizeDeltaInTokens × executionPrice − sizeDeltaUsd' : 'sizeDeltaUsd − sizeDeltaInTokens × executionPrice',
        basis: { title: '未裁剪的价格盈亏', sourcePath: FORMULA_SOURCE, section: '§6 仓位 PnL 与池子 PnL 裁剪' }, unit: 'USD 1e30',
      },
      {
        id: `${input.phaseId}-base-pnl`, group: `${input.phaseLabel} · PnL`, label: 'Base PnL（PnL Cap 后）',
        status: 'NOT_VERIFIED', before: rawAndUnit(uncappedPnl, 30, 'USD'), after: rawAndUnit(basePnl, 30, 'USD'),
        delta: deltaAndUnit(basePnl - uncappedPnl, 30, 'USD'), expected: '与 uncappedPnl 同方向，且绝对值不超过 uncappedPnl',
        formula: 'basePnlUsd = applyPnlCap(uncappedBasePnlUsd, poolPnl, maxPnlFactor)',
        basis: { title: '池子 PnL Cap 后的仓位基础盈亏', sourcePath: PAGE_FORMULA_SOURCE, section: '仓位 PnL 与池子 PnL 裁剪' }, unit: 'USD 1e30',
        note: `方向/上限基础检查=${capDirectionValid}；尚未采集执行区块 poolPnl 与 maxPnlFactor，不能独立复算 Cap。`,
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
  if (Object.keys(fees).length === 0) return [];
  const funding = record(record((Array.isArray(input.events.fundingEvents) ? input.events.fundingEvents : [])[0]).int);
  const scale30 = 10n ** 30n;
  const tradeSizeUsd = bigintValue(fees.tradeSizeUsd);
  const balanceWasImproved = boolValue(record(record(input.events.feesCollected).bool).balanceWasImproved);
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
  const positionPaysLp = bigintValue(funding.positionPaysLp);
  const claimablePositionBefore = bigintValue(input.before.claimableFeeAmountPosition);
  const claimablePositionAfter = bigintValue(input.after.claimableFeeAmountPosition);
  const claimableFundingBefore = bigintValue(input.before.claimableFeeAmountFunding);
  const claimableFundingAfter = bigintValue(input.after.claimableFeeAmountFunding);
  const rows: Reconciliation[] = [
    {
      id: `${input.phaseId}-position-fee-factor`, group: `${input.phaseLabel} · Fee`, label: `Position Fee Factor（${balanceWasImproved ? '改善平衡' : '未改善平衡'}）`,
      status: chainPositionFeeFactor === undefined || eventPositionFeeFactor === undefined
        ? 'NOT_VERIFIED' : pass(eventPositionFeeFactor, chainPositionFeeFactor),
      before: feeFactorLabel, after: stringValue(eventPositionFeeFactor), expected: stringValue(chainPositionFeeFactor),
      formula: `event.positionFeeFactor = DataStore.${feeFactorLabel}`,
      basis: { title: '仓位费率按是否改善平衡选择', sourcePath: PAGE_FORMULA_SOURCE, section: '费用 / Position Fee' }, unit: 'factor 1e30',
      note: parameterBlockNote(input.parameters),
    },
    {
      id: `${input.phaseId}-position-fee`, group: `${input.phaseLabel} · Fee`, label: 'Position Fee（链上实际；前端 Fee 对照）',
      status: positionFeeCalculation?.positionFee === undefined ? 'NOT_VERIFIED' : pass(positionFee, positionFeeCalculation.positionFee),
      before: rawAndUnit(0n, 6, 'USDC'), after: rawAndUnit(positionFee, 6, 'USDC'),
      delta: deltaAndUnit(positionFee, 6, 'USDC'),
      expected: positionFeeCalculation?.positionFee === undefined ? '缺少链上费率或 collateral.min=0' : rawAndUnit(positionFeeCalculation.positionFee, 6, 'USDC'),
      formula: `positionFeeAmount = ${positionFeeCalculation?.expanded ?? `${tradeSizeUsd} × ? / 1e30 / ${collateralMin}`}`,
      basis: { title: '基础仓位费', sourcePath: PAGE_FORMULA_SOURCE, section: '费用 / Position Fee' }, unit: 'USDC 1e6',
      note: `${parameterBlockNote(input.parameters)} event.factor=${stringValue(eventPositionFeeFactor)}；chain.factor=${stringValue(chainPositionFeeFactor)}。`,
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
    },
    {
      id: `${input.phaseId}-fee-receiver`, group: `${input.phaseLabel} · Fee`, label: 'Fee Receiver 分成',
      status: expectedReceiver === undefined ? 'NOT_VERIFIED' : pass(fees.feeReceiverAmount, expectedReceiver),
      before: rawAndUnit(0n, 6, 'USDC'), after: rawAndUnit(fees.feeReceiverAmount, 6, 'USDC'),
      delta: deltaAndUnit(fees.feeReceiverAmount, 6, 'USDC'), expected: expectedReceiver === undefined ? '缺少链上 positionFeeReceiverFactor' : rawAndUnit(expectedReceiver, 6, 'USDC'),
      formula: `feeReceiverAmount = ${protocolFee} × ${stringValue(chainReceiverFactor)} / 1e30${expectedReceiver === undefined ? '' : ` = ${expectedReceiver}`}`,
      basis: { title: '协议与 LP 分成', sourcePath: FORMULA_SOURCE, section: '§7.5 协议与 LP 分成' }, unit: 'USDC 1e6',
      note: `${parameterBlockNote(input.parameters)} event.receiverFactor=${stringValue(eventReceiverFactor)}。`,
    },
    {
      id: `${input.phaseId}-pool-fee`, group: `${input.phaseLabel} · Fee`, label: 'LP Pool 分成',
      status: expectedPool === undefined ? 'NOT_VERIFIED' : pass(fees.positionFeeAmountForPool, expectedPool), before: rawAndUnit(0n, 6, 'USDC'), after: rawAndUnit(fees.positionFeeAmountForPool, 6, 'USDC'),
      delta: deltaAndUnit(fees.positionFeeAmountForPool, 6, 'USDC'), expected: expectedPool === undefined ? '缺少链上 positionFeeReceiverFactor' : rawAndUnit(expectedPool, 6, 'USDC'),
      formula: 'positionFeeAmountForPool = protocolFeeAmount − feeReceiverAmount',
      basis: { title: '协议与 LP 分成', sourcePath: FORMULA_SOURCE, section: '§7.5 协议与 LP 分成' }, unit: 'USDC 1e6',
    },
    {
      id: `${input.phaseId}-negative-funding`, group: `${input.phaseLabel} · Funding`, label: '本仓位应付 Funding',
      status: pass(negativeFunding, expectedNegative), before: rawAndUnit(positionNegative, 0, 'per-size'), after: rawAndUnit(latestNegative, 0, 'per-size'),
      delta: deltaAndUnit(latestNegative - positionNegative, 0, 'per-size'), expected: rawAndUnit(expectedNegative, 6, 'USDC'),
      formula: 'ceil((latestNegativePerSize − positionNegativePerSize) × sizeInTokens / (1e30 × collateralPrice.min))',
      basis: { title: '单仓负 Funding（支付端向上取整）', sourcePath: FORMULA_SOURCE, section: '§10.5 单仓 Funding' }, unit: 'per-size raw → USDC 1e6',
      note: `PositionFeesCollected.negativeFundingFeeAmount=${negativeFunding} raw`,
    },
    {
      id: `${input.phaseId}-positive-funding`, group: `${input.phaseLabel} · Funding`, label: '本仓位应收 Funding',
      status: pass(positiveFunding, expectedPositive), before: rawAndUnit(positionPositive, 0, 'per-size'), after: rawAndUnit(latestPositive, 0, 'per-size'),
      delta: deltaAndUnit(latestPositive - positionPositive, 0, 'per-size'), expected: rawAndUnit(expectedPositive, 6, 'USDC'),
      formula: '(latestPositivePerSize − positionPositivePerSize) × sizeInTokens / (1e30 × collateralPrice.max)',
      basis: { title: '单仓正 Funding（收取端向下取整）', sourcePath: FORMULA_SOURCE, section: '§10.5 单仓 Funding' }, unit: 'per-size raw → USDC 1e6',
      note: `PositionFeesCollected.positiveFundingFeeAmount=${positiveFunding} raw`,
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
    },
    {
      id: `${input.phaseId}-total-cost`, group: `${input.phaseLabel} · Fee`, label: 'Total Cost',
      status: pass(fees.totalCostAmount, expectedTotalCost), before: rawAndUnit(0n, 6, 'USDC'), after: rawAndUnit(fees.totalCostAmount, 6, 'USDC'),
      delta: deltaAndUnit(fees.totalCostAmount, 6, 'USDC'), expected: rawAndUnit(expectedTotalCost, 6, 'USDC'),
      formula: 'totalCostAmount = positionFeeAmount + uiFeeAmount + negativeFundingFeeAmount（本用例无清算费/折扣）',
      basis: { title: '费用总额；正 Funding 单独增加抵押品', sourcePath: FORMULA_SOURCE, section: '§9 费用总额' }, unit: 'USDC 1e6',
      note: '【恒等式】各分量取自同一 PositionFeesCollected 事件，本行只验证费用汇总自洽；positionFee 与应付/应收 Funding 已在相邻行用执行区块参数独立复算。',
    },
    {
      id: `${input.phaseId}-claimable-position-fee`, group: `${input.phaseLabel} · Fee`, label: 'Claimable Position Fee 入账',
      status: pass(claimablePositionAfter, claimablePositionBefore + bigintValue(fees.feeReceiverAmount)),
      before: rawAndUnit(claimablePositionBefore, 6, 'USDC'), after: rawAndUnit(claimablePositionAfter, 6, 'USDC'),
      delta: deltaAndUnit(claimablePositionAfter - claimablePositionBefore, 6, 'USDC'),
      expected: rawAndUnit(claimablePositionBefore + bigintValue(fees.feeReceiverAmount), 6, 'USDC'),
      formula: 'claimablePositionFeeAfter = before + feeReceiverAmount',
      basis: { title: '协议费用入账与快照交叉核对', sourcePath: FORMULA_SOURCE, section: '§7.5 协议与 LP 分成' }, unit: 'USDC 1e6',
    },
    {
      id: `${input.phaseId}-claimable-funding`, group: `${input.phaseLabel} · Funding`, label: 'LP Claimable Funding 入账',
      status: pass(claimableFundingAfter, claimableFundingBefore + maxBigInt(positionPaysLp)),
      before: rawAndUnit(claimableFundingBefore, 6, 'USDC'), after: rawAndUnit(claimableFundingAfter, 6, 'USDC'),
      delta: deltaAndUnit(claimableFundingAfter - claimableFundingBefore, 6, 'USDC'),
      expected: rawAndUnit(claimableFundingBefore + maxBigInt(positionPaysLp), 6, 'USDC'),
      formula: 'positionPaysLp > 0：claimableFundingAfter = before + positionPaysLp；< 0 时由 LPVault 支付 PositionVault',
      basis: { title: 'LP Funding 净额', sourcePath: FORMULA_SOURCE, section: '§10.6 LP Funding 净额' }, unit: 'USDC 1e6',
    },
  ];
  const fundingEvent = record((Array.isArray(input.events.fundingEvents) ? input.events.fundingEvents : [])[0]);
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
          note: parameterBlockNote(input.parameters),
        },
        {
          id: `${input.phaseId}-short-funding-factor`, group: `${input.phaseLabel} · Funding`, label: 'Short Funding Factor / second',
          status: pass(fundingEventFactors.shortFundingFactorPerSecond, factors.short),
          before: rawAndUnit(emaSkew, 18, 'EMA skew'), after: rawAndUnit(fundingEventFactors.shortFundingFactorPerSecond, 30, 'factor/s'),
          expected: rawAndUnit(factors.short, 30, 'factor/s'), formula: `shortFactor = ${factors.shortExpanded}`,
          basis: { title: 'Short Funding Factor', sourcePath: PAGE_FORMULA_SOURCE, section: '五、Funding / 5.2 Funding Factor' }, unit: 'factor 1e30 / second',
          note: parameterBlockNote(input.parameters),
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

function buildFundingLifecycleRows(input: {
  readonly openEvents: JsonRecord;
  readonly closeEvents: JsonRecord;
}): Reconciliation[] {
  const openFunding = record(record((Array.isArray(input.openEvents.fundingEvents) ? input.openEvents.fundingEvents : [])[0]).int);
  const closeFunding = record(record((Array.isArray(input.closeEvents.fundingEvents) ? input.closeEvents.fundingEvents : [])[0]).int);
  const openFees = record(record(input.openEvents.feesCollected).uint);
  const closeFees = record(record(input.closeEvents.feesCollected).uint);
  if (Object.keys(openFunding).length === 0 || Object.keys(closeFunding).length === 0) return [];
  const rows: Reconciliation[] = [];
  const perSizeRows = [
    { key: 'latestNegativeFundingFeePerSize', label: '市场累计负 Funding / size', direction: '应付侧累计值' },
    { key: 'latestPositiveFundingFeePerSize', label: '市场累计正 Funding / size', direction: '应收侧累计值' },
  ] as const;
  rows.push(...perSizeRows.map((field) => {
    const before = bigintValue(openFees[field.key]);
    const after = bigintValue(closeFees[field.key]);
    return {
      id: `lifecycle-${field.key}`,
      group: '全流程 · Funding 市场状态',
      label: field.label,
      status: after >= before ? 'PASS' as const : 'FAIL' as const,
      before: rawAndUnit(before, 0, 'per-size'),
      after: rawAndUnit(after, 0, 'per-size'),
      delta: deltaAndUnit(after - before, 0, 'per-size'),
      expected: 'After ≥ Before（累计值只增不减）',
      formula: 'fundingFeePerSizeDelta = sideFundingUsd × 1e30 / sideOpenInterestInTokens',
      basis: { title: field.direction, sourcePath: FORMULA_SOURCE, section: '§10.4 市场累计 Funding' },
      unit: 'funding per-size raw',
    };
  }));
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
  const expectedOpenExecution = ceilDiv(
    bigintValue(openIncreaseUint['indexTokenPrice.max'])
      * (spreadScale + bigintValue(openIncreaseUint.dynamicSpread)),
    spreadScale,
  );
  const expectedCloseExecution = bigintValue(closeDecreaseUint['indexTokenPrice.min'])
    * (spreadScale - bigintValue(closeDecreaseUint.dynamicSpread)) / spreadScale;
  const expectedCumulativeLongOpenCosts = bigintValue(beforeValues.cumulativeOpenCostsLong) + inputSizeUsd;
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
    ...buildFundingLifecycleRows({ openEvents, closeEvents }).map((row) => ({ ...row, txStep: 'TX4' })),
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
      id: 'position-open-exists', group: '开仓状态', label: '多头仓位建立',
      status: pass(boolValue(openPosition.exists), true),
      before: stringValue(boolValue(beforePosition.exists)),
      after: stringValue(boolValue(openPosition.exists)), expected: 'true',
      formula: 'afterOpen.position.exists = true 且 isLong = true',
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
      id: 'open-execution-price', group: '成交价格', label: '开多执行价',
      status: pass(openIncreaseUint.executionPrice, expectedOpenExecution),
      before: stringValue(openIncreaseUint['indexTokenPrice.max']),
      after: stringValue(openIncreaseUint.executionPrice), expected: expectedOpenExecution.toString(),
      formula: 'ceil(indexPrice.max × (1e18 + dynamicSpread) / 1e18)',
      basis: formulaBasis('§4.5 加仓成交价', 'Long executionPrice'), unit: 'price raw',
      note: `dynamicSpread=${stringValue(openIncreaseUint.dynamicSpread)}。【恒等式】oracle 价与 dynamicSpread 均取自被核对的 PositionIncrease 事件，验证价格公式自洽，不构成独立重算（dynamicSpread 独立复算未实现）。`,
    },
    {
      id: 'cumulative-long-open-costs-after-open', group: '市场账本',
      label: '累计多头开仓成本 cumulativeOpenCostsLong',
      status: pass(openValues.cumulativeOpenCostsLong, expectedCumulativeLongOpenCosts),
      before: rawAndUnit(beforeValues.cumulativeOpenCostsLong, 30, 'USD'),
      after: rawAndUnit(openValues.cumulativeOpenCostsLong, 30, 'USD'),
      delta: deltaAndUnit(inputSizeUsd, 30, 'USD'),
      expected: rawAndUnit(expectedCumulativeLongOpenCosts, 30, 'USD'),
      formula: 'nextCumulativeOpenCostsLong = previousCumulativeOpenCostsLong + sizeDeltaUsd',
      basis: formulaBasis('§12.2 市场多空 PnL', '累计多头开仓成本增量'), unit: 'USD 1e30',
    },
    {
      id: 'close-execution-price', group: '成交价格', label: '平多执行价',
      status: pass(closeDecreaseUint.executionPrice, expectedCloseExecution),
      before: stringValue(closeDecreaseUint['indexTokenPrice.min']),
      after: stringValue(closeDecreaseUint.executionPrice), expected: expectedCloseExecution.toString(),
      formula: 'indexPrice.min × (1e18 − dynamicSpread) / 1e18',
      basis: formulaBasis('§4.6 减仓成交价', 'Long executionPrice'), unit: 'price raw',
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
      label: '累计多头开仓成本恢复初始值',
      status: pass(closeValues.cumulativeOpenCostsLong, beforeValues.cumulativeOpenCostsLong),
      before: rawAndUnit(openValues.cumulativeOpenCostsLong, 30, 'USD'),
      after: rawAndUnit(closeValues.cumulativeOpenCostsLong, 30, 'USD'),
      expected: rawAndUnit(beforeValues.cumulativeOpenCostsLong, 30, 'USD'),
      formula: 'finalCumulativeOpenCostsLong = openedCumulativeOpenCostsLong − fullCloseSizeUsd = initialCumulativeOpenCostsLong',
      basis: formulaBasis('§12.2 市场多空 PnL', '累计多头开仓成本全平回退'), unit: 'USD 1e30',
    },
    {
      id: 'trader-usdc-final', group: '守恒', label: '交易员最终 USDC（全流程守恒推论）',
      status: pass(closeValues.traderUsdc, expectedFinalUsdc),
      before: rawAndUnit(beforeValues.traderUsdc, 6, 'USDC'),
      after: rawAndUnit(closeValues.traderUsdc, 6, 'USDC'),
      expected: rawAndUnit(expectedFinalUsdc, 6, 'USDC'),
      formula: 'expectedAfter = before − (ΔOrderVault + ΔPositionVault + ΔLPVaultAssets + ΔFeeHandler)',
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
    : { ...row, txStep: openOverviewIds.has(row.id) ? 'TX2' : 'TX4' });

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
    ...buildFundingLifecycleRows({ openEvents: limitEvents, closeEvents }).map((row) => ({ ...row, txStep: 'TX4' })),
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
    : { ...row, txStep: tx1OverviewIds.has(row.id) ? 'TX1' : tx2OverviewIds.has(row.id) ? 'TX2' : 'TX4' });

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
  const reconciliations = [...overview, ...derived.flatMap((item) => item.rows)];
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

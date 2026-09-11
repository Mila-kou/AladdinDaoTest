/**
 * liquidation.forced-close：清算（OrderType.Liquidation）执行的合约层核对包。
 *
 * 公式口径：TestCase/E2E/ContractCodeSummary/v0.3.2/FX100-核心字段计算公式.md
 *   §11 清算判定（forLiquidation 因子、balanceWasImproved 进判定、正 funding 计入、不含清算费）
 *   §8 清算费（只在 orderType == Liquidation、基数 sizeDeltaUsd = 整仓、⌈/min⌉、与仓位费合并）
 *   §5.4.4 / §9.5 破产早退（两条费用事件以 PositionFeesCollected 为实际入账、缺口不转账）
 *   §4.6 清算成交价（allowNegativeSpread = false；Keeper 报文/oracle 价只锚事件，不重算报文选择）
 *   §6 PnL · §10.7 settleFundingFees · §5.5 清仓写回
 * 合约复核：src/position/PositionUtils.sol::isPositionLiquidatable、src/liquidation/LiquidationUtils.sol、
 *   src/pricing/PositionPricingUtils.sol::getLiquidationFees、src/position/DecreasePositionCollateralUtils.sol
 *
 * 动作定位：最后一个 type=liquidate；退化为携带 PositionDecrease.orderType=5 的执行动作。
 * 证据等级：判定的成交价 / PnL / 费用 / funding 与真实清算单同一构造（§6.0 表、§11.1），只能锚事件；
 * MIN_COLLATERAL_USD 与 execBlock−1 的 funding / skewEMA 状态未采集时按可靠方向下结论，否则 NOT_VERIFIED。
 */
import type { CheckPack, CheckPackInputRequirement, CheckPlan } from '../engine/check-engine.js';
import type { SourceRef } from '../schema/check-record.js';
import type { Address, EvidenceEnvelope } from '../../evidence/evidence-v3.js';
import {
  FORMULA_VERSION,
  LEDGER_FIELDS,
  ORDER_TYPE,
  abs,
  applyFactor,
  basis,
  bigint,
  ceilDiv,
  conservationRow,
  decreaseExecutionPrice,
  derivedSource,
  eventArgs,
  eventSource,
  executionPresenceRow,
  feesCollectedEvent,
  findAction,
  formulaInput,
  fundingSettlement,
  ledgerDelta,
  liquidationFeeExpectation,
  liquidationJudgement,
  max,
  notApplicable,
  notVerified,
  optionalBigint,
  optionalBoolean,
  parameterEntry,
  parameterSource,
  positionFeeExpectation,
  positionPnl,
  record,
  replayDecreaseWaterfall,
  requiredInput,
  row,
  stateSource,
  transition,
  viewAction,
  type BasisCheckRecord,
  type DecreaseActionView,
  type EventArgsView,
  type PnlCapInputs,
} from './decrease-shared.js';

const PACK_ID = 'liquidation.forced-close';

function isLiquidationDecrease(action: EvidenceEnvelope['actions'][number]): boolean {
  return action.events.some((event) => event.name === 'PositionDecrease'
    && optionalBigint(record(record(event.args).uint).orderType) === ORDER_TYPE.Liquidation);
}

function liquidationContext(evidence: EvidenceEnvelope): DecreaseActionView {
  const found = findAction(evidence, (action) => action.type === 'liquidate', 'last')
    ?? findAction(evidence, (action) => (action.type === 'executeOrder' || action.type === 'liquidate') && isLiquidationDecrease(action), 'last');
  if (!found) throw new Error(`${evidence.caseId} 缺少 liquidate 动作（或携带 PositionDecrease.orderType=Liquidation 的执行动作）`);
  return viewAction(evidence, found);
}

const DECREASE_UINT_FIELDS = [
  'executionPrice', 'indexTokenPrice.min', 'indexTokenPrice.max', 'collateralTokenPrice.min', 'collateralTokenPrice.max',
  'sizeDeltaUsd', 'sizeDeltaInTokens', 'orderType', 'decreasedAtTime',
] as const;
const DECREASE_INT_FIELDS = ['basePnlUsd', 'uncappedBasePnlUsd', 'collateralDeltaAmount', 'dynamicSpread'] as const;
const COLLECTED_UINT_FIELDS = [
  'negativeFundingFeeAmount', 'positiveFundingFeeAmount', 'positionFeeAmount', 'positionFeeFactor', 'protocolFeeAmount',
  'positionFeeReceiverFactor', 'feeReceiverAmount', 'feeAmountForPool', 'positionFeeAmountForPool', 'totalCostAmount',
  'uiFeeAmount', 'collateralTokenPrice.min',
] as const;
const CLAIMABLE_FIELDS = ['claimableFeeAmountPosition', 'claimableFeeAmountFunding', 'claimableFeeAmountLiquidation'] as const;
const OI_FIELDS = ['cumulativeOpenCostsLong', 'cumulativeOpenCostsShort', 'openInterestInTokensLong', 'openInterestInTokensShort'] as const;

export const liquidationPack: CheckPack = {
  id: PACK_ID,
  version: '1',
  requiredCapabilities: ['transaction', 'order-events', 'position-state', 'ledger', 'fee', 'funding'],
  requiredInputs(evidence) {
    const ex = liquidationContext(evidence);
    const posB = record(ex.before.values.position);
    const posA = record(ex.after.values.position);
    const decrease = eventArgs(ex, 'PositionDecrease');
    const collected = feesCollectedEvent(ex);
    const requirements: CheckPackInputRequirement[] = [
      ...(['sizeInUsd', 'sizeInTokens', 'collateralAmount', 'isLong', 'graceEnd'] as const).map((field) => requiredInput({
        view: ex, name: `position.before.${field}`, subject: 'chain-state', source: stateSource(ex, 'before', `position.${field}`), value: posB[field],
      })),
      ...(['exists', 'sizeInUsd', 'sizeInTokens', 'collateralAmount'] as const).map((field) => requiredInput({
        view: ex, name: `position.after.${field}`, subject: 'chain-state', source: stateSource(ex, 'after', `position.${field}`), value: posA[field],
      })),
      ...DECREASE_UINT_FIELDS.map((field) => requiredInput({
        view: ex, name: `PositionDecrease.uint.${field}`, subject: 'chain-event', source: eventSource(ex, 'PositionDecrease', `uint.${field}`), value: decrease?.uint[field],
      })),
      ...DECREASE_INT_FIELDS.map((field) => requiredInput({
        view: ex, name: `PositionDecrease.int.${field}`, subject: 'chain-event', source: eventSource(ex, 'PositionDecrease', `int.${field}`), value: decrease?.int[field],
      })),
      requiredInput({ view: ex, name: 'PositionDecrease.bool.isLong', subject: 'chain-event', source: eventSource(ex, 'PositionDecrease', 'bool.isLong'), value: decrease?.bool.isLong }),
      ...COLLECTED_UINT_FIELDS.map((field) => requiredInput({
        view: ex, name: `PositionFeesCollected.uint.${field}`, subject: 'chain-event', source: eventSource(ex, 'PositionFeesCollected', `uint.${field}`), value: collected?.uint[field],
      })),
      requiredInput({ view: ex, name: 'PositionFeesCollected.bool.balanceWasImproved', subject: 'chain-event', source: eventSource(ex, 'PositionFeesCollected', 'bool.balanceWasImproved'), value: collected?.bool.balanceWasImproved }),
    ];
    for (const field of [...LEDGER_FIELDS, ...CLAIMABLE_FIELDS, ...OI_FIELDS]) {
      requirements.push(
        requiredInput({ view: ex, name: `before.${field}`, subject: 'chain-state', source: stateSource(ex, 'before', field), value: ex.before.values[field] }),
        requiredInput({ view: ex, name: `after.${field}`, subject: 'chain-state', source: stateSource(ex, 'after', field), value: ex.after.values[field] }),
      );
    }
    return requirements;
  },
  run(evidence) {
    const ex = liquidationContext(evidence);
    const P = PACK_ID;
    const S = (side: 'before' | 'after', path: string): SourceRef => stateSource(ex, side, path);
    const E = (event: string, path: string, index = 0): SourceRef => eventSource(ex, event, path, index);

    const posB = record(ex.before.values.position);
    const posA = record(ex.after.values.position);
    const decrease = eventArgs(ex, 'PositionDecrease');
    const collected = feesCollectedEvent(ex);
    if (!decrease || !collected) throw new Error(`${ex.id} 缺少 PositionDecrease / PositionFeesCollected 事件`);
    const du = decrease.uint;
    const di = decrease.int;
    const cu = collected.uint;
    const feesInfo = eventArgs(ex, 'PositionFeesInfo');
    const insolvent = eventArgs(ex, 'InsolventClose');
    const insolventStep = insolvent ? String(insolvent.string.step) : undefined;
    const insufficientFunding = eventArgs(ex, 'InsufficientFundingFeePayment');

    const isLong = optionalBoolean(posB.isLong) === true;
    const oldUsd = bigint(posB.sizeInUsd);
    const oldTok = bigint(posB.sizeInTokens);
    const oldColl = bigint(posB.collateralAmount);
    const afterColl = bigint(posA.collateralAmount);
    const graceEnd = bigint(posB.graceEnd);
    const execPrice = bigint(du.executionPrice);
    const spread = bigint(di.dynamicSpread);
    const indexMin = bigint(du['indexTokenPrice.min']);
    const indexMax = bigint(du['indexTokenPrice.max']);
    const colMin = bigint(du['collateralTokenPrice.min']);
    const colMax = bigint(du['collateralTokenPrice.max']);
    const basePnl = bigint(di.basePnlUsd);
    const uncappedPnl = bigint(di.uncappedBasePnlUsd);
    const collateralDeltaEvent = bigint(di.collateralDeltaAmount);
    const decreasedAtTime = bigint(du.decreasedAtTime);
    const evSizeDeltaUsd = bigint(du.sizeDeltaUsd);
    const evSizeDeltaTok = bigint(du.sizeDeltaInTokens);
    const sideUsd = isLong ? 'cumulativeOpenCostsLong' : 'cumulativeOpenCostsShort';
    const otherUsd = isLong ? 'cumulativeOpenCostsShort' : 'cumulativeOpenCostsLong';
    const sideTokens = isLong ? 'openInterestInTokensLong' : 'openInterestInTokensShort';
    const otherTokens = isLong ? 'openInterestInTokensShort' : 'openInterestInTokensLong';

    // ── 费用事件取数（§5.4.4 / §9.5）────────────────────────────────────────
    // 实际入账以 PositionFeesCollected 为准；应收额：无早退 = 同一事件，step=funding/pnl 早退 = PositionFeesInfo（仍是原始非零），
    // step=fees 早退 = 两条事件均已被 getEmptyFees 清零 → 应收额不可知。
    const applicable: EventArgsView | undefined = !insolvent
      ? collected
      : (insolventStep === 'funding' || insolventStep === 'pnl') ? feesInfo : undefined;
    const applicableName = applicable === collected ? 'PositionFeesCollected' : 'PositionFeesInfo';
    const A = (path: string): SourceRef => E(applicableName, path);
    const au = applicable?.uint;
    const positiveFunding = bigint(cu.positiveFundingFeeAmount); // getEmptyFees 保留该字段，任何路径都真实
    const claimableFundingDelta = ledgerDelta(ex, 'claimableFeeAmountFunding');
    const negativeFunding: bigint | undefined = au
      ? bigint(au.negativeFundingFeeAmount)
      : insufficientFunding
        ? bigint(insufficientFunding.uint.expectedAmount)
        : claimableFundingDelta > 0n ? claimableFundingDelta + positiveFunding : undefined;
    const negativeFundingSource: SourceRef = au
      ? A('uint.negativeFundingFeeAmount')
      : insufficientFunding
        ? E('InsufficientFundingFeePayment', 'uint.expectedAmount')
        : derivedSource('Δ claimableFeeAmountFunding + positiveFundingFeeAmount（step=fees 早退后事件已清零的反推）');
    const positionFee = au ? bigint(au.positionFeeAmount) : undefined;
    const uiFee = au ? bigint(au.uiFeeAmount) : undefined;
    const discount = au ? max(optionalBigint(au['referral.traderDiscountAmount']) ?? 0n, optionalBigint(au['pro.traderDiscountAmount']) ?? 0n) : undefined;
    const liqFeeApplicable = au ? (optionalBigint(au.liquidationFeeAmount) ?? 0n) : undefined;
    const liqReceiverApplicable = au ? (optionalBigint(au.liquidationFeeAmountForFeeReceiver) ?? 0n) : undefined;
    const liqReceiverFactor = au ? optionalBigint(au.liquidationFeeReceiverFactor) : undefined;
    const totalCostApplicable = au ? bigint(au.totalCostAmount) : undefined;
    const feeAmountForPool = au ? bigint(au.feeAmountForPool) : undefined;
    const feeReceiverAmount = au ? bigint(au.feeReceiverAmount) : undefined;
    const positionFeeAmountForPool = au ? bigint(au.positionFeeAmountForPool) : undefined;
    const protocolFeeAmount = au ? bigint(au.protocolFeeAmount) : undefined;
    const positionFeeReceiverFactor = au ? bigint(au.positionFeeReceiverFactor) : undefined;
    const balanceWasImproved = applicable ? optionalBoolean(applicable.bool.balanceWasImproved) : undefined;
    const costExcludingFunding = totalCostApplicable !== undefined && negativeFunding !== undefined ? totalCostApplicable - negativeFunding : undefined;
    // §9.6 / §11.1 判定口径：不含清算费、不含 UI Fee
    const judgementCost = positionFee !== undefined && discount !== undefined && negativeFunding !== undefined
      ? positionFee - discount + negativeFunding
      : undefined;
    // 实际入账（PositionFeesCollected）：早退时全 0
    const liqReceiverCharged = optionalBigint(cu.liquidationFeeAmountForFeeReceiver) ?? 0n;
    const feeReceiverCharged = bigint(cu.feeReceiverAmount);

    // ── 参数 ─────────────────────────────────────────────────────────────────
    const minCfLabel = 'MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION';
    const minCollateralFactor = parameterEntry(ex, 'market', minCfLabel);
    const minCollateralUsd = parameterEntry(ex, 'global', 'minCollateralUsd') ?? parameterEntry(ex, 'market', 'MIN_COLLATERAL_USD');
    const liqFeeFactorLabel = 'LIQUIDATION_FEE_FACTOR';
    const liquidationFeeFactor = parameterEntry(ex, 'market', liqFeeFactorLabel);
    const maxPnlLabel = `MAX_PNL_FACTOR(MAX_PNL_FACTOR_FOR_TRADERS,${isLong})`;
    const maxPnlFactor = parameterEntry(ex, 'market', maxPnlLabel);
    const feeFactorLabel = balanceWasImproved === undefined ? undefined : `POSITION_FEE_FACTOR(${balanceWasImproved})`;
    const feeFactorParam = feeFactorLabel === undefined ? undefined : parameterEntry(ex, 'market', feeFactorLabel);

    // ── §6 PnL（整仓：sizeDeltaInTokens = sizeInTokens）───────────────────────
    const cap: PnlCapInputs | undefined = maxPnlFactor === undefined ? undefined : {
      cumulativeOpenCosts: bigint(ex.before.values[sideUsd]),
      openInterestInTokens: bigint(ex.before.values[sideTokens]),
      poolTokenAmount: bigint(ex.before.values.lpVaultAssets),
      collateralPriceMin: colMin,
      indexPriceForPool: isLong ? indexMax : indexMin,
      maxPnlFactor,
    };
    const pnl = positionPnl({ sizeInUsd: oldUsd, sizeInTokens: oldTok, sizeDeltaInTokens: oldTok, executionPrice: execPrice, isLong, ...(cap ? { cap } : {}) });
    const pnlInputs = [
      formulaInput('position.sizeInUsd.before', oldUsd, S('before', 'position.sizeInUsd')),
      formulaInput('position.sizeInTokens.before(整仓)', oldTok, S('before', 'position.sizeInTokens')),
      formulaInput('executionPrice', execPrice, E('PositionDecrease', 'uint.executionPrice')),
      ...(cap ? [
        formulaInput(`${sideUsd}.before`, cap.cumulativeOpenCosts, S('before', sideUsd)),
        formulaInput(`${sideTokens}.before`, cap.openInterestInTokens, S('before', sideTokens)),
        formulaInput('lpVaultAssets.before(totalAssets)', cap.poolTokenAmount, S('before', 'lpVaultAssets')),
        formulaInput('collateralTokenPrice.min', colMin, E('PositionDecrease', 'uint.collateralTokenPrice.min')),
        formulaInput(isLong ? 'indexTokenPrice.max' : 'indexTokenPrice.min', cap.indexPriceForPool, E('PositionDecrease', isLong ? 'uint.indexTokenPrice.max' : 'uint.indexTokenPrice.min')),
        formulaInput(maxPnlLabel, cap.maxPnlFactor, parameterSource(ex, 'market', maxPnlLabel)),
      ] : []),
    ];

    // ── §5.4 瀑布重放（isInsolventCloseAllowed = 全平清算 → true）────────────
    const replay = negativeFunding === undefined ? undefined : replayDecreaseWaterfall({
      collateralBefore: oldColl,
      positiveFunding,
      negativeFunding,
      basePnlUsd: basePnl,
      collateralPriceMin: colMin,
      collateralPriceMax: colMax,
      costExcludingFunding,
      feeAmountForPool: feeAmountForPool ?? 0n,
      fullClose: true,
      requestedWithdrawal: 0n,
      insolventCloseAllowed: true,
      observedFeesShortfall: insolventStep === 'fees',
    });
    const waterfallInputs = [
      formulaInput('position.collateralAmount.before', oldColl, S('before', 'position.collateralAmount')),
      formulaInput('positiveFundingFeeAmount', positiveFunding, E('PositionFeesCollected', 'uint.positiveFundingFeeAmount')),
      formulaInput('negativeFundingFeeAmount(应付)', negativeFunding ?? '<unknown>', negativeFundingSource),
      formulaInput('basePnlUsd', basePnl, E('PositionDecrease', 'int.basePnlUsd')),
      formulaInput('collateralTokenPrice.min', colMin, E('PositionDecrease', 'uint.collateralTokenPrice.min')),
      formulaInput('collateralTokenPrice.max', colMax, E('PositionDecrease', 'uint.collateralTokenPrice.max')),
      formulaInput(`totalCostAmount(${applicableName})`, totalCostApplicable ?? '<unknown>', A('uint.totalCostAmount')),
      formulaInput(`feeAmountForPool(${applicableName})`, feeAmountForPool ?? '<unknown>', A('uint.feeAmountForPool')),
      formulaInput('isInsolventCloseAllowed', true, derivedSource('全平 && isLiquidationOrder → true')),
    ];
    const settlement = negativeFunding === undefined ? undefined : fundingSettlement({
      negativeFunding,
      positiveFunding,
      insufficientPaid: insufficientFunding ? bigint(insufficientFunding.uint.amountPaidInCollateralToken) : undefined,
    });

    const rows: BasisCheckRecord[] = [];

    rows.push(row({
      id: 'liquidation.execute.outcome', packId: P, view: ex, subject: 'chain-event', comparison: 'presence',
      actual: ex.outcome, expected: 'executed', sources: [E('PositionDecrease', 'uint.orderType'), E('OrderExecuted', 'bytes32.key')], verification: 'PRESENCE',
      basis: basis('§11.3', '四个调用点与参数取值'),
      note: 'EXECUTED 表示清算 gate（forLiquidation=true）判可清算、未 revert PositionShouldNotBeLiquidated，且宽限期已过',
    }));
    rows.push(executionPresenceRow({ id: 'keeper.liquidation-execution', packId: P, view: ex, basis: basis('§11.5', '宽限期与清算单创建') }));
    rows.push(row({
      id: 'liquidation.order-type', packId: P, view: ex, subject: 'chain-event', comparison: 'invariant',
      actual: du.orderType, expected: ORDER_TYPE.Liquidation, sources: [E('PositionDecrease', 'uint.orderType')], verification: 'IDENTITY',
      basis: basis('§8.1', '生效门：只有 orderType == Liquidation 才计清算费'),
      note: 'Order.OrderType.Liquidation = 5；ADL 是 MarketDecrease + SecondaryOrderType.Adl，不走本包',
    }));
    rows.push(row({
      id: 'liquidation.size-delta-usd', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
      actual: evSizeDeltaUsd, expected: oldUsd,
      sources: [E('PositionDecrease', 'uint.sizeDeltaUsd'), S('before', 'position.sizeInUsd')],
      formula: {
        id: 'liquidation.order.size-delta-usd', version: FORMULA_VERSION,
        expanded: `createLiquidationOrder：sizeDeltaUsd = position.sizeInUsd = ${oldUsd}，isSizeDeltaUsd = true → getDecreaseOrderSize 全平恒等分支`,
        inputs: [formulaInput('position.sizeInUsd.before', oldUsd, S('before', 'position.sizeInUsd'))],
      },
      verification: 'FULL_RECOMPUTE',
      basis: basis('§3.2', '减仓订单'),
    }));
    rows.push(row({
      id: 'liquidation.size-delta-tokens', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
      actual: evSizeDeltaTok, expected: oldTok,
      sources: [E('PositionDecrease', 'uint.sizeDeltaInTokens'), S('before', 'position.sizeInTokens')],
      formula: {
        id: 'liquidation.order.size-delta-tokens', version: FORMULA_VERSION,
        expanded: `全平恒等分支：sizeDeltaInTokens = position.sizeInTokens = ${oldTok}（无取整、无尘埃）`,
        inputs: [formulaInput('position.sizeInTokens.before', oldTok, S('before', 'position.sizeInTokens'))],
      },
      verification: 'FULL_RECOMPUTE',
      basis: basis('§3.2', '减仓订单'),
    }));
    rows.push(row({
      id: 'liquidation.grace-expired', packId: P, view: ex, subject: 'chain-state', comparison: 'formula-vs-event',
      actual: `graceEnd=${graceEnd}`, expected: `<= block.timestamp ${decreasedAtTime}`,
      verdict: graceEnd <= decreasedAtTime ? 'PASS' : 'FAIL',
      sources: [S('before', 'position.graceEnd'), E('PositionDecrease', 'uint.decreasedAtTime')],
      formula: {
        id: 'liquidation.grace-gate', version: FORMULA_VERSION,
        expanded: `position.graceEnd ${graceEnd} > block.timestamp → revert PositionNotLiquidatable；执行块 timestamp 取 PositionDecrease.decreasedAtTime = ${decreasedAtTime}`,
        inputs: [
          formulaInput('position.graceEnd(before)', graceEnd, S('before', 'position.graceEnd')),
          formulaInput('decreasedAtTime(block.timestamp)', decreasedAtTime, E('PositionDecrease', 'uint.decreasedAtTime')),
        ],
      },
      verification: 'EVENT_ANCHORED',
      basis: basis('§11.5', '宽限期与清算单创建'),
      note: 'graceEnd 只在仓位首次创建时写入；区块时间戳仅有事件来源',
    }));

    // §4.6 清算成交价
    const price = decreaseExecutionPrice({ indexPriceMin: indexMin, indexPriceMax: indexMax, dynamicSpread: spread, isLong });
    rows.push(row({
      id: 'pricing.liquidation.spread-floor', packId: P, view: ex, subject: 'chain-event', comparison: 'invariant',
      actual: spread, expected: '>= 0', verdict: spread >= 0n ? 'PASS' : 'FAIL',
      sources: [E('PositionDecrease', 'int.dynamicSpread'), E('PositionDecrease', 'uint.orderType')], verification: 'IDENTITY',
      basis: basis('§4.6', '减仓成交价'),
      note: 'Liquidation / ADL 以 allowNegativeSpread=false 调用 getDynamicSpread：min 抬到 0、max 若 < min 则塌缩到 min，点差不可为负',
    }));
    rows.push(row({
      id: 'pricing.liquidation.execution-price', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
      actual: execPrice, expected: price.executionPrice,
      sources: [E('PositionDecrease', 'uint.executionPrice'), E('PositionDecrease', `uint.${price.oracleSide}`), E('PositionDecrease', 'int.dynamicSpread')],
      formula: {
        id: 'pricing.liquidation.execution-price', version: FORMULA_VERSION, expanded: price.expanded, rounding: price.rounding,
        inputs: [
          formulaInput(price.oracleSide, price.oraclePrice, E('PositionDecrease', `uint.${price.oracleSide}`)),
          formulaInput('dynamicSpread(int256, clamp 后, ≥0)', spread, E('PositionDecrease', 'int.dynamicSpread')),
          formulaInput('position.isLong', isLong, S('before', 'position.isLong')),
        ],
      },
      verification: 'EVENT_ANCHORED',
      basis: basis('§4.6', '减仓成交价'),
      note: 'Keeper 报文选择决定的 oracle min/max 与 clamp 后点差只锚事件，不重算报文选择；acceptablePrice = isLong ? 0 : max，闸门恒过',
    }));

    // §6 PnL
    rows.push(row({
      id: 'pnl.liquidation.uncapped', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
      actual: uncappedPnl, expected: pnl.uncappedBasePnlUsd,
      sources: [E('PositionDecrease', 'int.uncappedBasePnlUsd'), E('PositionDecrease', 'uint.executionPrice'), S('before', 'position.sizeInUsd'), S('before', 'position.sizeInTokens')],
      formula: {
        id: 'pnl.liquidation.uncapped', version: FORMULA_VERSION,
        expanded: `positionValue = ${oldTok} × ${execPrice}；total = ${isLong ? 'value − sizeInUsd' : 'sizeInUsd − value'}；整仓折算恒等 → ${pnl.uncappedBasePnlUsd}`,
        inputs: pnlInputs.slice(0, 3),
      },
      verification: 'EVENT_ANCHORED',
      basis: basis('§6.2', '整仓 PnL'),
    }));
    if (pnl.basePnlUsd === undefined) {
      rows.push(notVerified({
        id: 'pnl.liquidation.base', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
        actual: basePnl, expectedDescription: 'total > 0 时按同方向单边池 PnL 与 MAX_PNL_FACTOR_FOR_TRADERS 封顶',
        missing: `参数 ${maxPnlLabel}`, sources: [E('PositionDecrease', 'int.basePnlUsd'), parameterSource(ex, 'market', maxPnlLabel)],
        basis: basis('§6.3', '盈利上限：只裁正 PnL，且只看本仓方向的单边池 PnL'), note: pnl.expanded,
      }));
    } else {
      rows.push(row({
        id: 'pnl.liquidation.base', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
        actual: basePnl, expected: pnl.basePnlUsd,
        sources: [E('PositionDecrease', 'int.basePnlUsd'), E('PositionDecrease', 'uint.executionPrice'), S('before', 'position.sizeInUsd'), S('before', 'position.sizeInTokens'), ...(cap ? [parameterSource(ex, 'market', maxPnlLabel)] : [])],
        formula: { id: 'pnl.liquidation.capped', version: FORMULA_VERSION, expanded: pnl.expanded, inputs: pnlInputs, rounding: '亏损按绝对值向上；盈利封顶缩放向下' },
        verification: 'EVENT_ANCHORED',
        basis: basis('§6.3', '盈利上限：只裁正 PnL，且只看本仓方向的单边池 PnL'),
        note: `capStatus=${pnl.capStatus}；清算判定与真实清算单使用同一 executionPrice 与整仓 sizeDeltaInTokens，故 basePnlUsd 即判定用 positionPnlUsd`,
      }));
    }

    // §7.1 仓位费（判定与清算单同一 sizeDeltaUsd / balanceWasImproved 档位）
    if (positionFee === undefined || au === undefined) {
      rows.push(notVerified({
        id: 'fee.position.amount', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
        actual: cu.positionFeeAmount, expectedDescription: '⌊⌊sizeInUsd × POSITION_FEE_FACTOR(balanceWasImproved) / 1e30⌋ / collateralPrice.min⌋',
        missing: `应收费用事件（InsolventClose step=${insolventStep ?? '?'} 时 PositionFeesInfo / PositionFeesCollected 均已清零）`,
        sources: [E('PositionFeesCollected', 'uint.positionFeeAmount'), E('InsolventClose', 'string.step')],
        basis: basis('§7.1', '基础仓位费'),
      }));
    } else {
      const feeFactor = feeFactorParam ?? bigint(au.positionFeeFactor);
      const feeFactorSource = feeFactorParam !== undefined && feeFactorLabel ? parameterSource(ex, 'market', feeFactorLabel) : A('uint.positionFeeFactor');
      const expectedFee = positionFeeExpectation({ sizeDeltaUsd: oldUsd, positionFeeFactor: feeFactor, collateralPriceMin: bigint(au['collateralTokenPrice.min']) });
      rows.push(row({
        id: 'fee.position.amount', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
        actual: positionFee, expected: expectedFee.positionFeeAmount ?? '<undefined>',
        sources: [A('uint.positionFeeAmount'), S('before', 'position.sizeInUsd'), feeFactorSource, A('uint.collateralTokenPrice.min')],
        formula: {
          id: 'fee.position.amount', version: FORMULA_VERSION, expanded: expectedFee.expanded, rounding: 'floor, then floor',
          inputs: [
            formulaInput('sizeDeltaUsd = position.sizeInUsd', oldUsd, S('before', 'position.sizeInUsd')),
            formulaInput(feeFactorLabel ?? 'positionFeeFactor', feeFactor, feeFactorSource),
            formulaInput('collateralTokenPrice.min', au['collateralTokenPrice.min'], A('uint.collateralTokenPrice.min')),
          ],
        },
        verification: 'EVENT_ANCHORED',
        basis: basis('§7.1', '基础仓位费'),
        note: `balanceWasImproved=${String(balanceWasImproved)} 选档（v0.3.2 接线，会移动清算阈值）；来源 ${applicableName}`,
      }));
    }

    // §8 清算费
    if (liquidationFeeFactor === undefined || liqFeeApplicable === undefined) {
      rows.push(notVerified({
        id: 'fee.liquidation.amount', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
        actual: liqFeeApplicable ?? cu.liquidationFeeAmount ?? '0(已清零)',
        expectedDescription: '⌈⌊sizeDeltaUsd × LIQUIDATION_FEE_FACTOR / 1e30⌋ / collateralPrice.min⌉',
        missing: liquidationFeeFactor === undefined ? `参数 ${liqFeeFactorLabel}` : `应收费用事件（step=${insolventStep ?? '?'} 已清零）`,
        sources: [E('PositionFeesCollected', 'uint.liquidationFeeAmount'), parameterSource(ex, 'market', liqFeeFactorLabel)],
        basis: basis('§8.3', '费用体'),
      }));
    } else {
      const expectedLiq = liquidationFeeExpectation({ sizeDeltaUsd: oldUsd, liquidationFeeFactor, collateralPriceMin: colMin, receiverFactor: liqReceiverFactor });
      rows.push(row({
        id: 'fee.liquidation.amount', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
        actual: liqFeeApplicable, expected: expectedLiq.liquidationFeeAmount,
        sources: [A('uint.liquidationFeeAmount'), S('before', 'position.sizeInUsd'), parameterSource(ex, 'market', liqFeeFactorLabel), E('PositionDecrease', 'uint.collateralTokenPrice.min')],
        formula: {
          id: 'fee.liquidation.amount', version: FORMULA_VERSION, expanded: expectedLiq.expanded, rounding: 'applyFactor 向下；/collateralPrice.min 向上',
          inputs: [
            formulaInput('sizeDeltaUsd = position.sizeInUsd(整仓)', oldUsd, S('before', 'position.sizeInUsd')),
            formulaInput(liqFeeFactorLabel, liquidationFeeFactor, parameterSource(ex, 'market', liqFeeFactorLabel)),
            formulaInput('collateralTokenPrice.min', colMin, E('PositionDecrease', 'uint.collateralTokenPrice.min')),
          ],
        },
        verification: 'EVENT_ANCHORED',
        basis: basis('§8.3', '费用体'),
        note: '基数是名义成交规模 sizeDeltaUsd（清算 = 整仓），不是保证金；三项为条件项，liquidationFeeAmount = 0 时不进事件',
      }));
      if (liqReceiverApplicable === undefined) {
        rows.push(notVerified({
          id: 'fee.liquidation.receiver-share', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
          expectedDescription: '⌊liquidationFeeAmount × LIQUIDATION_FEE_RECEIVER_FACTOR / 1e30⌋', missing: '应收费用事件',
          sources: [E('PositionFeesCollected', 'uint.liquidationFeeAmountForFeeReceiver')], basis: basis('§8.3', '费用体'),
        }));
      } else if (liqFeeApplicable > 0n && liqReceiverFactor === undefined) {
        rows.push(notVerified({
          id: 'fee.liquidation.receiver-share', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
          actual: liqReceiverApplicable, expectedDescription: '⌊liquidationFeeAmount × LIQUIDATION_FEE_RECEIVER_FACTOR / 1e30⌋',
          missing: `${applicableName}.uint.liquidationFeeReceiverFactor（全局键未进参数快照，仅事件来源）`,
          sources: [A('uint.liquidationFeeAmountForFeeReceiver')], basis: basis('§8.3', '费用体'),
        }));
      } else {
        const expectedReceiver = liqFeeApplicable === 0n ? 0n : applyFactor(liqFeeApplicable, liqReceiverFactor ?? 0n);
        rows.push(row({
          id: 'fee.liquidation.receiver-share', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
          actual: liqReceiverApplicable, expected: expectedReceiver,
          sources: [A('uint.liquidationFeeAmountForFeeReceiver'), A('uint.liquidationFeeAmount'), A('uint.liquidationFeeReceiverFactor')],
          formula: {
            id: 'fee.liquidation.receiver-share', version: FORMULA_VERSION,
            expanded: `⌊${liqFeeApplicable} × ${liqReceiverFactor ?? 0n} / 1e30⌋ = ${expectedReceiver}`,
            inputs: [
              formulaInput('liquidationFeeAmount', liqFeeApplicable, A('uint.liquidationFeeAmount')),
              formulaInput('LIQUIDATION_FEE_RECEIVER_FACTOR(事件)', liqReceiverFactor ?? 0n, A('uint.liquidationFeeReceiverFactor')),
            ],
          },
          verification: 'EVENT_ANCHORED',
          basis: basis('§8.3', '费用体'),
        }));
      }
    }
    if (au === undefined || feeAmountForPool === undefined || positionFeeAmountForPool === undefined || liqFeeApplicable === undefined
      || liqReceiverApplicable === undefined || feeReceiverAmount === undefined || protocolFeeAmount === undefined || positionFeeReceiverFactor === undefined) {
      rows.push(notVerified({
        id: 'fee.merge.pool-and-receiver-legs', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
        expectedDescription: 'feeAmountForPool = positionFeeAmountForPool + liqFee − liqReceiver；feeReceiverAmount = ⌊protocolFee × positionFeeReceiverFactor / 1e30⌋ + liqReceiver',
        missing: '应收费用事件（已清零）', sources: [E('PositionFeesCollected', 'uint.feeAmountForPool')], basis: basis('§8.4', '与仓位费合并'),
      }));
    } else {
      const expectedPool = positionFeeAmountForPool + liqFeeApplicable - liqReceiverApplicable;
      const expectedReceiver = applyFactor(protocolFeeAmount, positionFeeReceiverFactor) + liqReceiverApplicable;
      rows.push(row({
        id: 'fee.merge.pool-and-receiver-legs', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
        actual: `${feeAmountForPool}/${feeReceiverAmount}`, expected: `${expectedPool}/${expectedReceiver}`,
        sources: [A('uint.feeAmountForPool'), A('uint.feeReceiverAmount'), A('uint.positionFeeAmountForPool'), A('uint.protocolFeeAmount'), A('uint.positionFeeReceiverFactor')],
        formula: {
          id: 'fee.liquidation.merge', version: FORMULA_VERSION,
          expanded: `池子腿 ${positionFeeAmountForPool} + ${liqFeeApplicable} − ${liqReceiverApplicable} = ${expectedPool}；分账器腿 ⌊${protocolFeeAmount} × ${positionFeeReceiverFactor} / 1e30⌋ + ${liqReceiverApplicable} = ${expectedReceiver}（+= 而非 =）`,
          inputs: [
            formulaInput('positionFeeAmountForPool', positionFeeAmountForPool, A('uint.positionFeeAmountForPool')),
            formulaInput('liquidationFeeAmount', liqFeeApplicable, A('uint.liquidationFeeAmount')),
            formulaInput('liquidationFeeAmountForFeeReceiver', liqReceiverApplicable, A('uint.liquidationFeeAmountForFeeReceiver')),
            formulaInput('protocolFeeAmount', protocolFeeAmount, A('uint.protocolFeeAmount')),
            formulaInput('positionFeeReceiverFactor', positionFeeReceiverFactor, A('uint.positionFeeReceiverFactor')),
          ],
        },
        verification: 'EVENT_ANCHORED',
        basis: basis('§8.4', '与仓位费合并'),
      }));
    }
    rows.push(row({
      id: 'fee.ui.zero', packId: P, view: ex, subject: 'chain-event', comparison: 'invariant',
      actual: cu.uiFeeAmount, expected: 0n, sources: [E('PositionFeesCollected', 'uint.uiFeeAmount')], verification: 'IDENTITY',
      basis: basis('§8.5', '资金去向（仅在费用全额付清时执行，见 §9.5）'),
      note: '清算单 uiFeeReceiver = address(0) → getUiFees 早退，UI Fee 恒 0',
    }));
    if (au === undefined || positionFee === undefined || uiFee === undefined || discount === undefined || negativeFunding === undefined || totalCostApplicable === undefined || liqFeeApplicable === undefined) {
      rows.push(notVerified({
        id: 'fee.total-cost', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
        expectedDescription: 'positionFee + liquidationFee + uiFee − max(discount) + negativeFunding', missing: '应收费用事件（已清零）',
        sources: [E('PositionFeesCollected', 'uint.totalCostAmount')], basis: basis('§9.1', '两个聚合量'),
      }));
    } else {
      rows.push(row({
        id: 'fee.total-cost', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
        actual: totalCostApplicable, expected: positionFee + liqFeeApplicable + uiFee - discount + negativeFunding,
        sources: [A('uint.totalCostAmount'), A('uint.positionFeeAmount'), A('uint.uiFeeAmount'), negativeFundingSource],
        formula: {
          id: 'fee.total-cost-amount', version: FORMULA_VERSION,
          expanded: `positionFee ${positionFee} + liquidationFee ${liqFeeApplicable} + uiFee ${uiFee} − discount ${discount} + negativeFunding ${negativeFunding}`,
          inputs: [
            formulaInput('positionFeeAmount', positionFee, A('uint.positionFeeAmount')),
            formulaInput('liquidationFeeAmount', liqFeeApplicable, A('uint.liquidationFeeAmount')),
            formulaInput('uiFeeAmount', uiFee, A('uint.uiFeeAmount')),
            formulaInput('totalDiscountAmount', discount, A('uint.referral.traderDiscountAmount')),
            formulaInput('negativeFundingFeeAmount', negativeFunding, negativeFundingSource),
          ],
        },
        verification: 'EVENT_ANCHORED',
        basis: basis('§9.1', '两个聚合量'),
      }));
    }

    // §11 清算判定（不含清算费、正 funding 计入、forLiquidation 因子）
    const judgement = liquidationJudgement({
      collateralAmount: oldColl,
      collateralPriceMin: colMin,
      positionPnlUsd: basePnl,
      positiveFundingFeeAmount: positiveFunding,
      totalCostAmount: judgementCost,
      sizeInUsd: oldUsd,
      minCollateralFactor,
      minCollateralUsd,
    });
    const judgementInputs = [
      formulaInput('position.collateralAmount.before', oldColl, S('before', 'position.collateralAmount')),
      formulaInput('collateralTokenPrice.min', colMin, E('PositionDecrease', 'uint.collateralTokenPrice.min')),
      formulaInput('positionPnlUsd(整仓, 含点差, 封顶后) = basePnlUsd', basePnl, E('PositionDecrease', 'int.basePnlUsd')),
      formulaInput('positiveFundingFeeAmount', positiveFunding, E('PositionFeesCollected', 'uint.positiveFundingFeeAmount')),
      formulaInput('totalCostAmount(判定口径 = positionFee − discount + negativeFunding)', judgementCost ?? '<unknown>', au ? A('uint.positionFeeAmount') : derivedSource('应收费用已清零')),
      formulaInput('position.sizeInUsd.before', oldUsd, S('before', 'position.sizeInUsd')),
      formulaInput(minCfLabel, minCollateralFactor ?? '<missing>', parameterSource(ex, 'market', minCfLabel)),
      formulaInput('MIN_COLLATERAL_USD', minCollateralUsd ?? '<missing>', parameterSource(ex, 'global', 'minCollateralUsd')),
    ];
    if (judgement.liquidatable === undefined) {
      rows.push(notVerified({
        id: 'liquidation.judgement.verdict', packId: P, view: ex, subject: 'chain-state', comparison: 'formula-vs-event',
        actual: 'liquidatable=true（EXECUTED）', expectedDescription: 'isPositionLiquidatable(forLiquidation=true) 独立复算为 true',
        missing: judgement.expanded,
        sources: [E('PositionDecrease', 'int.basePnlUsd'), S('before', 'position.collateralAmount'), parameterSource(ex, 'market', minCfLabel)],
        basis: basis('§11.2', '最低抵押品要求与判定条件'),
      }));
    } else {
      rows.push(row({
        id: 'liquidation.judgement.verdict', packId: P, view: ex, subject: 'chain-state', comparison: 'formula-vs-event',
        actual: 'liquidatable=true', expected: `liquidatable=${judgement.liquidatable}`,
        display: { actual: 'EXECUTED ⇒ 清算 gate 判可清算', expected: `复算 ${judgement.liquidatable}（reason "${judgement.reason}"）` },
        sources: [E('PositionDecrease', 'int.basePnlUsd'), E('PositionFeesCollected', 'uint.positiveFundingFeeAmount'), S('before', 'position.collateralAmount'), S('before', 'position.sizeInUsd'), parameterSource(ex, 'market', minCfLabel)],
        formula: { id: 'liquidation.is-position-liquidatable', version: FORMULA_VERSION, expanded: judgement.expanded, inputs: judgementInputs },
        verification: 'EVENT_ANCHORED',
        basis: basis('§11.2', '最低抵押品要求与判定条件'),
        note: `判定口径：成交价按 Liquidation 规则（allowNegativeSpread=false）、isLiquidation=false 不含清算费与 UI Fee、positiveFunding × min 计入抵押、balanceWasImproved=${String(balanceWasImproved)} 选费率档；`
          + `forLiquidation=true → ${minCfLabel}；成交价/PnL/费用/funding 与真实清算单同一构造，只能锚事件（execBlock−1 的 funding per-size / skewEMA 未采集）`,
      }));
    }

    // §5.4 瀑布 → 用户实收
    const traderDelta = ledgerDelta(ex, 'traderUsdc');
    if (!replay || replay.output === undefined) {
      rows.push(notVerified({
        id: 'settlement.waterfall.output', packId: P, view: ex, subject: 'chain-state', comparison: 'formula-vs-state',
        actual: traderDelta, expectedDescription: '§5.4 瀑布 output（含清仓分支退回的剩余押金）',
        missing: replay ? '费用（step=fees 早退后不可知）' : 'negativeFundingFeeAmount（费用事件已清零且无可反推来源）',
        sources: [S('before', 'traderUsdc'), S('after', 'traderUsdc')], basis: basis('§5.4', '减仓支付瀑布与输出'),
      }));
    } else {
      rows.push(row({
        id: 'settlement.waterfall.output', packId: P, view: ex, subject: 'chain-state', comparison: 'formula-vs-state',
        actual: traderDelta, expected: replay.output, tolerance: '0',
        transition: transition(ex.before.values.traderUsdc, ex.after.values.traderUsdc, replay.output),
        sources: [S('before', 'traderUsdc'), S('after', 'traderUsdc'), E('PositionDecrease', 'int.basePnlUsd'), S('before', 'position.collateralAmount')],
        formula: {
          id: 'settlement.decrease-waterfall.output', version: FORMULA_VERSION,
          expanded: `${replay.expanded}；outputAmount → positionVault.transferOut(receiver = account) = ${replay.output}`,
          inputs: waterfallInputs, rounding: '盈利 ⌊/max⌋；need ⌈/min⌉；先扣 output 再扣押金',
        },
        verification: 'EVENT_ANCHORED',
        basis: basis('§5.4', '减仓支付瀑布与输出'),
        note: `清算单 receiver = account，output === trader 钱包 USDC Δ（0 容差）；${replay.shortfall ? `重放在 step=${replay.shortfall.step} 早退` : '重放全额偿付'}`,
      }));
    }

    // §5.4.4 破产早退
    const observed = insolvent ? `${insolventStep}/${String(insolvent.uint.remainingCostUsd)}` : 'none';
    if (!replay) {
      rows.push(notVerified({
        id: 'settlement.insolvent-close', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
        actual: observed, expectedDescription: '瀑布重放预测的早退 step / remainingCostUsd', missing: 'negativeFundingFeeAmount',
        sources: [E('InsolventClose', 'string.step')], basis: basis('§5.4.4', '破产平仓与早退'),
      }));
    } else {
      const predicted = replay.shortfall ? `${replay.shortfall.step}/${replay.shortfall.remainingCostUsd ?? '?'}` : 'none';
      const stepMatches = (insolvent === undefined) === (replay.shortfall === undefined)
        && (!insolvent || !replay.shortfall || insolventStep === replay.shortfall.step);
      const costMatches = !insolvent || !replay.shortfall || replay.shortfall.remainingCostUsd === undefined
        || bigint(insolvent.uint.remainingCostUsd) === replay.shortfall.remainingCostUsd;
      const payloadMatches = !insolvent
        || (bigint(insolvent.uint.positionCollateralAmount) === oldColl && bigint(insolvent.int.basePnlUsd) === basePnl);
      rows.push(row({
        id: 'settlement.insolvent-close', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
        actual: observed, expected: predicted,
        verdict: stepMatches && costMatches && payloadMatches ? 'PASS' : 'FAIL',
        sources: [E('InsolventClose', 'string.step'), E('InsolventClose', 'uint.remainingCostUsd'), E('InsolventClose', 'uint.positionCollateralAmount'), E('InsolventClose', 'int.basePnlUsd')],
        formula: {
          id: 'settlement.insolvent-close.step', version: FORMULA_VERSION,
          expanded: `${replay.expanded}；isInsolventCloseAllowed = 全平 && Liquidation → true：缺口时 emit PositionFeesInfo + InsolventClose(step) 并 return，不 revert`
            + (insolvent ? `；事件 positionCollateralAmount=${String(insolvent.uint.positionCollateralAmount)}（应 = 原押金 ${oldColl}），basePnlUsd=${String(insolvent.int.basePnlUsd)}` : ''),
          inputs: waterfallInputs,
        },
        verification: 'EVENT_ANCHORED',
        basis: basis('§5.4.4', '破产平仓与早退'),
        note: 'remainingCostUsd（v0.3.2）= 剩余 need × collateralPrice.min，30 位 USD；step=fees 时该值不可独立复算',
      }));
    }
    if (!insolvent) {
      rows.push(notApplicable({
        id: 'settlement.insolvent-close.fees-zeroed', packId: P, view: ex, subject: 'chain-event', comparison: 'invariant',
        sources: [E('PositionFeesCollected', 'uint.totalCostAmount')], basis: basis('§9.5', '付不清时：费用全部清零，不是按比例削减'),
        reason: '本笔无 InsolventClose，费用全额付清',
      }));
    } else {
      const zeroFields = ['positionFeeAmount', 'totalCostAmount', 'feeReceiverAmount', 'feeAmountForPool', 'protocolFeeAmount', 'negativeFundingFeeAmount', 'positionFeeFactor'] as const;
      const nonZero = zeroFields.filter((field) => bigint(cu[field]) !== 0n);
      const liqPresent = (optionalBigint(cu.liquidationFeeAmount) ?? 0n) !== 0n;
      const bwiFalse = optionalBoolean(collected.bool.balanceWasImproved) === false;
      rows.push(row({
        id: 'settlement.insolvent-close.fees-zeroed', packId: P, view: ex, subject: 'chain-event', comparison: 'invariant',
        actual: `nonZero=[${nonZero.join(',')}]${liqPresent ? ',liquidationFeeAmount' : ''};balanceWasImproved=${String(collected.bool.balanceWasImproved)}`,
        expected: 'nonZero=[];balanceWasImproved=false',
        verdict: nonZero.length === 0 && !liqPresent && bwiFalse ? 'PASS' : 'FAIL',
        sources: zeroFields.map((field) => E('PositionFeesCollected', `uint.${field}`)),
        verification: 'IDENTITY',
        basis: basis('§9.5', '付不清时：费用全部清零，不是按比例削减'),
        note: `InsolventClose 后 tx 末尾 PositionFeesCollected 为 getEmptyFees 结果（仅保留 positiveFundingFeeAmount / latest*PerSize / collateralTokenPrice）；step=${insolventStep} 的应收额见 ${applicable ? 'PositionFeesInfo' : '（已清零，不可知）'}`,
      }));
    }

    // §8.5 / §10.7 账本
    const feesTransferred = replay ? replay.feesTransferredToPool : undefined;
    const expectedLiqClaimable = feesTransferred === undefined ? undefined : (feesTransferred ? liqReceiverCharged : 0n);
    rows.push(expectedLiqClaimable === undefined
      ? notVerified({
        id: 'fee.claimable.liquidation', packId: P, view: ex, subject: 'chain-state', comparison: 'formula-vs-state',
        actual: ledgerDelta(ex, 'claimableFeeAmountLiquidation'), expectedDescription: '费用付清时 += liquidationFeeAmountForFeeReceiver，否则 0',
        missing: '瀑布重放输入', sources: [S('before', 'claimableFeeAmountLiquidation'), S('after', 'claimableFeeAmountLiquidation')],
        basis: basis('§8.5', '资金去向（仅在费用全额付清时执行，见 §9.5）'),
      })
      : row({
        id: 'fee.claimable.liquidation', packId: P, view: ex, subject: 'chain-state', comparison: 'formula-vs-state',
        actual: ledgerDelta(ex, 'claimableFeeAmountLiquidation'), expected: expectedLiqClaimable,
        transition: transition(ex.before.values.claimableFeeAmountLiquidation, ex.after.values.claimableFeeAmountLiquidation, expectedLiqClaimable),
        sources: [S('before', 'claimableFeeAmountLiquidation'), S('after', 'claimableFeeAmountLiquidation'), E('PositionFeesCollected', 'uint.liquidationFeeAmountForFeeReceiver')],
        formula: {
          id: 'fee.claimable.liquidation-increment', version: FORMULA_VERSION,
          expanded: `费用${feesTransferred ? '付清' : '未付清（早退）'} → claimable(LIQUIDATION_FEE_TYPE) += ${expectedLiqClaimable}（>0 时才调用）`,
          inputs: [formulaInput('liquidationFeeAmountForFeeReceiver(实际入账)', liqReceiverCharged, E('PositionFeesCollected', 'uint.liquidationFeeAmountForFeeReceiver'))],
        },
        verification: 'EVENT_ANCHORED',
        basis: basis('§8.5', '资金去向（仅在费用全额付清时执行，见 §9.5）'),
        note: '清算费余额腿并入 feeAmountForPool 进 LP；Keeper 在合约层零补偿',
      }));
    const expectedPositionClaimable = feesTransferred === undefined ? undefined : (feesTransferred ? feeReceiverCharged - liqReceiverCharged : 0n);
    rows.push(expectedPositionClaimable === undefined
      ? notVerified({
        id: 'fee.claimable.position', packId: P, view: ex, subject: 'chain-state', comparison: 'formula-vs-state',
        actual: ledgerDelta(ex, 'claimableFeeAmountPosition'), expectedDescription: '费用付清时 += feeReceiverAmount − liquidationFeeAmountForFeeReceiver，否则 0',
        missing: '瀑布重放输入', sources: [S('before', 'claimableFeeAmountPosition'), S('after', 'claimableFeeAmountPosition')],
        basis: basis('§8.5', '资金去向（仅在费用全额付清时执行，见 §9.5）'),
      })
      : row({
        id: 'fee.claimable.position', packId: P, view: ex, subject: 'chain-state', comparison: 'formula-vs-state',
        actual: ledgerDelta(ex, 'claimableFeeAmountPosition'), expected: expectedPositionClaimable,
        transition: transition(ex.before.values.claimableFeeAmountPosition, ex.after.values.claimableFeeAmountPosition, expectedPositionClaimable),
        sources: [S('before', 'claimableFeeAmountPosition'), S('after', 'claimableFeeAmountPosition'), E('PositionFeesCollected', 'uint.feeReceiverAmount'), E('PositionFeesCollected', 'uint.liquidationFeeAmountForFeeReceiver')],
        formula: {
          id: 'fee.claimable.position-increment', version: FORMULA_VERSION,
          expanded: `${feeReceiverCharged} − ${liqReceiverCharged} = ${feeReceiverCharged - liqReceiverCharged}（减仓侧传的是扣掉清算费分账器腿的 feeReceiverAmount）`,
          inputs: [
            formulaInput('feeReceiverAmount(实际入账)', feeReceiverCharged, E('PositionFeesCollected', 'uint.feeReceiverAmount')),
            formulaInput('liquidationFeeAmountForFeeReceiver(实际入账)', liqReceiverCharged, E('PositionFeesCollected', 'uint.liquidationFeeAmountForFeeReceiver')),
          ],
        },
        verification: 'EVENT_ANCHORED',
        basis: basis('§8.5', '资金去向（仅在费用全额付清时执行，见 §9.5）'),
      }));
    if (!settlement || !replay) {
      rows.push(notVerified({
        id: 'funding.settle.claimable', packId: P, view: ex, subject: 'chain-state', comparison: 'formula-vs-state',
        actual: claimableFundingDelta, expectedDescription: 'max(实付 negativeFunding − positiveFunding, 0)', missing: 'negativeFundingFeeAmount（应收额已清零）',
        sources: [S('before', 'claimableFeeAmountFunding'), S('after', 'claimableFeeAmountFunding')],
        basis: basis('§10.7', '仓位结算：settleFundingFees（v0.3.2 新增）'),
      }));
      rows.push(notVerified({
        id: 'funding.settle.paid-amount', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
        expectedDescription: 'payForCost 实付额 = min(应付, output + 押金)', missing: 'negativeFundingFeeAmount',
        sources: [E('InsufficientFundingFeePayment', 'uint.amountPaidInCollateralToken')],
        basis: basis('§10.7', '仓位结算：settleFundingFees（v0.3.2 新增）'),
      }));
    } else {
      rows.push(row({
        id: 'funding.settle.claimable', packId: P, view: ex, subject: 'chain-state', comparison: 'formula-vs-state',
        actual: claimableFundingDelta, expected: settlement.claimableDelta,
        transition: transition(ex.before.values.claimableFeeAmountFunding, ex.after.values.claimableFeeAmountFunding, settlement.claimableDelta),
        sources: [S('before', 'claimableFeeAmountFunding'), S('after', 'claimableFeeAmountFunding'), negativeFundingSource, E('PositionFeesCollected', 'uint.positiveFundingFeeAmount')],
        formula: {
          id: 'funding.settle.claimable-delta', version: FORMULA_VERSION, expanded: settlement.expanded,
          inputs: [
            formulaInput('negativeFundingFeeAmount(应付)', negativeFunding, negativeFundingSource),
            formulaInput('amountPaidInCollateralToken(实付)', settlement.paid, insufficientFunding ? E('InsufficientFundingFeePayment', 'uint.amountPaidInCollateralToken') : derivedSource('无 InsufficientFundingFeePayment → 实付 = 应付')),
            formulaInput('positiveFundingFeeAmount', positiveFunding, E('PositionFeesCollected', 'uint.positiveFundingFeeAmount')),
          ],
        },
        verification: 'EVENT_ANCHORED',
        basis: basis('§10.7', '仓位结算：settleFundingFees（v0.3.2 新增）'),
        note: '减仓/清算传 payForCost 实付额；settleFundingFees 在 step=funding 早退判断之前执行，清算下缺口由 LP 承担',
      }));
      rows.push(row({
        id: 'funding.settle.paid-amount', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
        actual: settlement.paid, expected: replay.fundingPaid,
        sources: [insufficientFunding ? E('InsufficientFundingFeePayment', 'uint.amountPaidInCollateralToken') : negativeFundingSource, S('before', 'position.collateralAmount'), E('PositionDecrease', 'int.basePnlUsd')],
        formula: {
          id: 'funding.pay-for-cost.actual-paid', version: FORMULA_VERSION,
          expanded: `payForCost(negativeFunding × min)：先扣 output（正 PnL 兑付 ${replay.pnlPayoutFromLp}）再扣押金 ${oldColl} + positive ${positiveFunding} → 实付 ${replay.fundingPaid}；`
            + (insufficientFunding ? `链上 InsufficientFundingFeePayment(expected=${String(insufficientFunding.uint.expectedAmount)}, paid=${settlement.paid})` : '无 InsufficientFundingFeePayment ⇒ 实付 = 应付'),
          inputs: waterfallInputs,
        },
        verification: 'EVENT_ANCHORED',
        basis: basis('§10.7', '仓位结算：settleFundingFees（v0.3.2 新增）'),
      }));
    }
    rows.push(!replay || replay.lpVaultDelta === undefined
      ? notVerified({
        id: 'ledger.lp-vault', packId: P, view: ex, subject: 'chain-state', comparison: 'formula-vs-state',
        actual: ledgerDelta(ex, 'lpVaultAssets'), expectedDescription: '−盈利兑付 + 实付亏损 + （付清时）feeAmountForPool − LP→PositionVault 净收 funding；缺口不转账',
        missing: '瀑布重放输入（negativeFunding / 费用）', sources: [S('before', 'lpVaultAssets'), S('after', 'lpVaultAssets')],
        basis: basis('§5.4.4', '破产平仓与早退'),
      })
      : row({
        id: 'ledger.lp-vault', packId: P, view: ex, subject: 'chain-state', comparison: 'formula-vs-state',
        actual: ledgerDelta(ex, 'lpVaultAssets'), expected: replay.lpVaultDelta,
        transition: transition(ex.before.values.lpVaultAssets, ex.after.values.lpVaultAssets, replay.lpVaultDelta),
        sources: [S('before', 'lpVaultAssets'), S('after', 'lpVaultAssets'), E('PositionDecrease', 'int.basePnlUsd'), E('PositionFeesCollected', 'uint.positiveFundingFeeAmount')],
        formula: {
          id: 'ledger.lp-vault.liquidation', version: FORMULA_VERSION,
          expanded: `ΔLP = −盈利兑付 ${replay.pnlPayoutFromLp} + 实付亏损 ${replay.lossPaidToLp} + feeAmountForPool ${replay.feesTransferredToPool ? (feeAmountForPool ?? 0n) : 0n} − 净收 funding ${settlement ? settlement.lpToPositionVault : 0n} = ${replay.lpVaultDelta}`
            + (replay.shortfall ? `；step=${replay.shortfall.step} 缺口 ${replay.shortfall.remainingCostUsd ?? '?'} USD 不转账、不补记（无保险金库，由 LP 承担）` : ''),
          inputs: waterfallInputs,
        },
        verification: 'EVENT_ANCHORED',
        basis: basis('§5.4.4', '破产平仓与早退'),
        note: '缺口只进 InsolventClose.remainingCostUsd，不产生任何 transferOut；②步已实付部分不回滚',
      }));

    // §5.5 清仓写回 / OI / 守恒
    rows.push(row({
      id: 'position.removed', packId: P, view: ex, subject: 'chain-state', comparison: 'formula-vs-state',
      actual: `exists=${String(posA.exists)},sizeInUsd=${String(posA.sizeInUsd)},sizeInTokens=${String(posA.sizeInTokens)},collateral=${afterColl}`,
      expected: 'exists=false,sizeInUsd=0,sizeInTokens=0,collateral=0',
      verdict: optionalBoolean(posA.exists) === false && bigint(posA.sizeInUsd) === 0n && bigint(posA.sizeInTokens) === 0n && afterColl === 0n ? 'PASS' : 'FAIL',
      sources: [S('after', 'position.exists'), S('after', 'position.sizeInUsd'), S('after', 'position.sizeInTokens'), S('after', 'position.collateralAmount')],
      verification: 'PRESENCE',
      basis: basis('§5.5', '减仓写回、清仓与事件符号'),
    }));
    rows.push(row({
      id: 'event.decrease.collateral-delta', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
      actual: collateralDeltaEvent, expected: oldColl - afterColl,
      sources: [E('PositionDecrease', 'int.collateralDeltaAmount'), S('before', 'position.collateralAmount'), S('after', 'position.collateralAmount')],
      formula: {
        id: 'event.decrease.collateral-delta-sign', version: FORMULA_VERSION,
        expanded: `collateralDeltaAmount = 执行前 ${oldColl} − 执行后 ${afterColl} = ${oldColl - afterColl}（全平 = 原全部保证金）`,
        inputs: [
          formulaInput('position.collateralAmount.before', oldColl, S('before', 'position.collateralAmount')),
          formulaInput('position.collateralAmount.after', afterColl, S('after', 'position.collateralAmount')),
        ],
      },
      verification: 'FULL_RECOMPUTE',
      basis: basis('§5.5', '减仓写回、清仓与事件符号'),
    }));
    rows.push(row({
      id: 'market.oi-side', packId: P, view: ex, subject: 'chain-state', comparison: 'formula-vs-state',
      actual: `${ledgerDelta(ex, sideUsd)}/${ledgerDelta(ex, sideTokens)}`, expected: `${-oldUsd}/${-oldTok}`,
      sources: [S('before', sideUsd), S('after', sideUsd), S('before', sideTokens), S('after', sideTokens), S('before', 'position.sizeInUsd'), S('before', 'position.sizeInTokens')],
      formula: {
        id: 'market.open-interest.liquidation-decrease', version: FORMULA_VERSION,
        expanded: `updateOpenInterest(−sizeDeltaUsd, −sizeDeltaInTokens) = (−${oldUsd}, −${oldTok})（整仓）`,
        inputs: [
          formulaInput('position.sizeInUsd.before', oldUsd, S('before', 'position.sizeInUsd')),
          formulaInput('position.sizeInTokens.before', oldTok, S('before', 'position.sizeInTokens')),
        ],
      },
      verification: 'FULL_RECOMPUTE',
      basis: basis('§5.2', '减仓后规模与订单规模归一化'),
    }));
    rows.push(row({
      id: 'market.oi-other-side', packId: P, view: ex, subject: 'chain-state', comparison: 'invariant',
      actual: `${ledgerDelta(ex, otherUsd)}/${ledgerDelta(ex, otherTokens)}`, expected: '0/0',
      sources: [S('before', otherUsd), S('after', otherUsd), S('before', otherTokens), S('after', otherTokens)], verification: 'IDENTITY',
      basis: basis('§5.2', '减仓后规模与订单规模归一化'),
    }));
    rows.push(row({
      id: 'pnl.cap-direction', packId: P, view: ex, subject: 'chain-event', comparison: 'invariant',
      actual: `${basePnl}/${uncappedPnl}`, expected: '|base| ≤ |uncapped| 且同号',
      verdict: abs(basePnl) <= abs(uncappedPnl) && (basePnl === 0n || (basePnl < 0n) === (uncappedPnl < 0n)) ? 'PASS' : 'FAIL',
      sources: [E('PositionDecrease', 'int.basePnlUsd'), E('PositionDecrease', 'int.uncappedBasePnlUsd')],
      verification: 'IDENTITY', severity: 'warning',
      basis: basis('§6.6', '核对要点'),
    }));
    rows.push(conservationRow({
      id: 'ledger.conservation', packId: P, view: ex, basis: basis('§5.4', '减仓支付瀑布与输出'),
      note: '破产早退时费用步已扣的 token 滞留 PositionVault（不入池、不入 claimable），五方之和仍为 0',
    }));

    // 清算判定用亏损向上取整口径的自洽提示：need = ⌈|basePnlUsd| / min⌉
    if (basePnl < 0n && replay) {
      const need = ceilDiv(-basePnl, colMin);
      rows.push(row({
        id: 'settlement.loss-need', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
        actual: replay.lossPaidToLp, expected: replay.shortfall && replay.shortfall.step !== 'fees' ? `<= ${need}` : need,
        verdict: replay.shortfall && replay.shortfall.step !== 'fees' ? (replay.lossPaidToLp <= need ? 'PASS' : 'FAIL') : (replay.lossPaidToLp === need ? 'PASS' : 'FAIL'),
        sources: [E('PositionDecrease', 'int.basePnlUsd'), E('PositionDecrease', 'uint.collateralTokenPrice.min')],
        formula: {
          id: 'settlement.pay-for-cost.loss-need', version: FORMULA_VERSION,
          expanded: `need = ⌈${-basePnl} / ${colMin}⌉ = ${need}；实付亏损 ${replay.lossPaidToLp}（PositionVault→LP）`,
          inputs: [
            formulaInput('basePnlUsd', basePnl, E('PositionDecrease', 'int.basePnlUsd')),
            formulaInput('collateralTokenPrice.min', colMin, E('PositionDecrease', 'uint.collateralTokenPrice.min')),
          ],
        },
        verification: 'EVENT_ANCHORED', severity: 'warning',
        basis: basis('§5.4', '减仓支付瀑布与输出'),
        note: '§5.4.1：只有亏损这一笔传的是真 USD，会实打实向上取整成 token 数',
      }));
    }

    return rows;
  },
};

// ── 可信 CheckPlan ───────────────────────────────────────────────────────────

export interface LiquidationPlanOptions {
  readonly id: string;
  readonly version: string;
  /** movePrice 调价交易的可信 actor/to 白名单（来自部署配置，绝不从 Evidence 反推）。缺省时该规则无白名单 → 完整性记 INCOMPLETE。 */
  readonly priceSupport?: {
    readonly actors: readonly [Address, ...Address[]];
    readonly targets: readonly [Address, ...Address[]];
  };
  readonly oracleSupport?: {
    readonly actors: readonly [Address, ...Address[]];
    readonly targets: readonly [Address, ...Address[]];
  };
}

/**
 * Market 开仓（setup）→ movePrice 调至可清算（support，须带 precondition.liquidation.* 评估）→ liquidate（primary）。
 * 清算单在同一笔交易内由 LiquidationHandler 创建并执行，因此 liquidate 动作没有独立提交腿，也不受 executeOrder 的 orderKey 因果锚点约束。
 */
export function createLiquidationPlan(options: LiquidationPlanOptions): CheckPlan {
  const submitTransactions = {
    rules: [{ id: 'order-submission', roles: ['trader'] as const, min: 1, max: 1, anchor: 'order-submission' as const }],
  };
  const oracleSupportRule = options.oracleSupport ? [{
    id: 'oracle-support', roles: ['oracle'] as const, min: 0, max: 1, anchor: 'oracle-ref' as const,
    actors: options.oracleSupport.actors, targets: options.oracleSupport.targets,
  }] : [];
  const executionTransactions = {
    rules: [
      { id: 'terminal-execution', roles: ['keeper', 'service'] as const, min: 1, max: 1, anchor: 'terminal-execution' as const },
      ...oracleSupportRule,
    ],
  };
  const liquidationTransactions = {
    rules: [
      { id: 'liquidation-execution', roles: ['keeper', 'service'] as const, min: 1, max: 1, anchor: 'terminal-execution' as const },
      ...oracleSupportRule,
    ],
  };
  const priceTransactions = {
    rules: [{
      id: 'price-push', roles: ['oracle', 'admin'] as const, min: 0, max: 4, anchor: 'oracle-ref' as const,
      ...(options.priceSupport ? { actors: options.priceSupport.actors, targets: options.priceSupport.targets } : {}),
    }],
  };
  const executionCapabilities = ['transaction', 'order-events', 'keeper', 'parameters', 'oracle', 'ledger', 'fee', 'position-state'] as const;
  return {
    id: options.id,
    version: options.version,
    flowType: 'multi-phase',
    actions: [
      { type: 'submitMarketIncrease', purpose: 'setup', outcomes: ['SUBMITTED'], transactions: submitTransactions, requiredCapabilities: ['transaction', 'order-events'] },
      { type: 'executeOrder', purpose: 'setup', outcomes: ['EXECUTED'], transactions: executionTransactions, requiredCapabilities: [...executionCapabilities] },
      { type: 'movePrice', purpose: 'support', outcomes: ['OBSERVED', 'EXECUTED'], transactions: priceTransactions, requiredCapabilities: ['oracle', 'parameters'] },
      { type: 'liquidate', purpose: 'primary', outcomes: ['EXECUTED'], transactions: liquidationTransactions, requiredCapabilities: [...executionCapabilities, 'funding'] },
    ],
    packs: [liquidationPack],
  };
}

export const liquidationPlan: CheckPlan = createLiquidationPlan({ id: 'liquidation.forced-close', version: '1' });

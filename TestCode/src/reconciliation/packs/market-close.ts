/**
 * market-close.decrease：Market 减仓 / 全平执行的合约层核对包。
 *
 * 公式口径：TestCase/E2E/ContractCodeSummary/v0.3.2/FX100-核心字段计算公式.md
 *   §3.2 减仓规模 · §3.3 orderType · §4.6 减仓成交价 · §5.2 订单归一化阶梯与写回 · §5.4 支付瀑布
 *   §5.4.4 破产早退 · §5.4.5/§5.6 minOutputAmount 闸门 · §5.5 清仓与事件符号 · §6 PnL
 *   §7.1 仓位费 · §8.1 清算费生效门 · §9.1 费用总额 · §10.7 settleFundingFees
 * 合约复核：Github/fx100-contracts@release-v0.3.2/src/position/{DecreasePositionUtils,DecreasePositionCollateralUtils,PositionUtils}.sol
 *
 * 动作定位按类型而非编号：最后一个 submitMarketDecrease 及其后第一个 executeOrder；purpose 随证据（primary / cleanup）。
 */
import type { CheckPack, CheckPackInputRequirement, CheckPlan } from '../engine/check-engine.js';
import type { SourceRef } from '../schema/check-record.js';
import type { Address, EvidenceEnvelope } from '../../evidence/evidence-v3.js';
import { feeClaimablePack } from './fee-claimable.js';
import { marketOpenCleanupPack, marketOpenCorePack } from './market-open.js';
import {
  FORMULA_VERSION,
  LEDGER_FIELDS,
  ORDER_TYPE,
  abs,
  basis,
  bigint,
  conservationRow,
  decreaseExecutionPrice,
  decreaseOrderSize,
  derivedSource,
  eventArgs,
  eventList,
  eventSource,
  executionPresenceRow,
  feesCollectedEvent,
  findAction,
  formulaInput,
  fundingSettlement,
  intentSource,
  ledgerDelta,
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
  resolveDecreaseIntent,
  row,
  stateSource,
  transition,
  viewAction,
  type BasisCheckRecord,
  type DecreaseActionView,
  type PnlCapInputs,
} from './decrease-shared.js';

const PACK_ID = 'market-close.decrease';

interface CloseContext {
  readonly submit: DecreaseActionView;
  readonly execute: DecreaseActionView;
}

function closeContext(evidence: EvidenceEnvelope): CloseContext {
  const submitAction = findAction(evidence, (action) => action.type === 'submitMarketDecrease', 'last');
  if (!submitAction) throw new Error(`${evidence.caseId} 缺少 submitMarketDecrease 动作`);
  const executeAction = findAction(
    evidence,
    (action) => action.type === 'executeOrder' && action.sequence > submitAction.sequence,
    'first',
  );
  if (!executeAction) throw new Error(`${evidence.caseId} 缺少 ${submitAction.actionId} 之后的 executeOrder 动作`);
  return { submit: viewAction(evidence, submitAction), execute: viewAction(evidence, executeAction) };
}

const DECREASE_UINT_FIELDS = [
  'executionPrice', 'indexTokenPrice.min', 'indexTokenPrice.max', 'collateralTokenPrice.min', 'collateralTokenPrice.max',
  'sizeDeltaUsd', 'sizeDeltaInTokens', 'orderType',
] as const;
const DECREASE_INT_FIELDS = ['basePnlUsd', 'uncappedBasePnlUsd', 'collateralDeltaAmount', 'dynamicSpread'] as const;
const FEE_UINT_FIELDS = [
  'negativeFundingFeeAmount', 'positiveFundingFeeAmount', 'positionFeeAmount', 'positionFeeFactor', 'totalCostAmount',
  'uiFeeAmount', 'feeReceiverAmount', 'feeAmountForPool', 'collateralTokenPrice.min',
] as const;
const CLAIMABLE_FIELDS = ['claimableFeeAmountPosition', 'claimableFeeAmountFunding', 'claimableFeeAmountLiquidation'] as const;
const OI_FIELDS = ['cumulativeOpenCostsLong', 'cumulativeOpenCostsShort', 'openInterestInTokensLong', 'openInterestInTokensShort'] as const;

/** intent / percent-full：意图或 execBlock−1 状态；order-created：提交交易 OrderCreated 事件；rewrite / event：执行交易事件。 */
type SizeOrigin = 'rewrite' | 'intent' | 'percent-full' | 'order-created' | 'event';

function verificationFor(origin: SizeOrigin): 'FULL_RECOMPUTE' | 'EVENT_ANCHORED' {
  return origin === 'intent' || origin === 'percent-full' ? 'FULL_RECOMPUTE' : 'EVENT_ANCHORED';
}

export const marketClosePack: CheckPack = {
  id: PACK_ID,
  version: '1',
  requiredCapabilities: ['transaction', 'order-events', 'position-state', 'ledger', 'fee', 'funding'],
  requiredInputs(evidence) {
    const { execute: ex } = closeContext(evidence);
    const posB = record(ex.before.values.position);
    const posA = record(ex.after.values.position);
    const decrease = eventArgs(ex, 'PositionDecrease');
    const fees = feesCollectedEvent(ex);
    const requirements: CheckPackInputRequirement[] = [
      ...(['sizeInUsd', 'sizeInTokens', 'collateralAmount', 'isLong'] as const).map((field) => requiredInput({
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
      ...FEE_UINT_FIELDS.map((field) => requiredInput({
        view: ex, name: `PositionFeesCollected.uint.${field}`, subject: 'chain-event', source: eventSource(ex, 'PositionFeesCollected', `uint.${field}`), value: fees?.uint[field],
      })),
      requiredInput({ view: ex, name: 'PositionFeesCollected.bool.balanceWasImproved', subject: 'chain-event', source: eventSource(ex, 'PositionFeesCollected', 'bool.balanceWasImproved'), value: fees?.bool.balanceWasImproved }),
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
    const { submit: sub, execute: ex } = closeContext(evidence);
    const P = PACK_ID;
    const S = (side: 'before' | 'after', path: string): SourceRef => stateSource(ex, side, path);
    const E = (event: string, path: string, index = 0): SourceRef => eventSource(ex, event, path, index);

    const posB = record(ex.before.values.position);
    const posA = record(ex.after.values.position);
    const decrease = eventArgs(ex, 'PositionDecrease');
    const fees = feesCollectedEvent(ex);
    if (!decrease || !fees) throw new Error(`${ex.id} 缺少 PositionDecrease / PositionFeesCollected 事件`);
    const du = decrease.uint;
    const di = decrease.int;
    const fu = fees.uint;

    const isLong = optionalBoolean(posB.isLong) === true;
    const oldUsd = bigint(posB.sizeInUsd);
    const oldTok = bigint(posB.sizeInTokens);
    const oldColl = bigint(posB.collateralAmount);
    const afterColl = bigint(posA.collateralAmount);
    const evSizeDeltaUsd = bigint(du.sizeDeltaUsd);
    const evSizeDeltaTok = bigint(du.sizeDeltaInTokens);
    const execPrice = bigint(du.executionPrice);
    const spread = bigint(di.dynamicSpread);
    const indexMin = bigint(du['indexTokenPrice.min']);
    const indexMax = bigint(du['indexTokenPrice.max']);
    const colMin = bigint(du['collateralTokenPrice.min']);
    const colMax = bigint(du['collateralTokenPrice.max']);
    const basePnl = bigint(di.basePnlUsd);
    const uncappedPnl = bigint(di.uncappedBasePnlUsd);
    const collateralDeltaEvent = bigint(di.collateralDeltaAmount);
    const negativeFunding = bigint(fu.negativeFundingFeeAmount);
    const positiveFunding = bigint(fu.positiveFundingFeeAmount);
    const totalCost = bigint(fu.totalCostAmount);
    const positionFee = bigint(fu.positionFeeAmount);
    const feeFactorEvent = bigint(fu.positionFeeFactor);
    const uiFee = bigint(fu.uiFeeAmount);
    const feeAmountForPool = bigint(fu.feeAmountForPool);
    const feeReceiverAmount = bigint(fu.feeReceiverAmount);
    const liquidationFeeEvent = optionalBigint(fu.liquidationFeeAmount) ?? 0n;
    const liquidationReceiverEvent = optionalBigint(fu.liquidationFeeAmountForFeeReceiver) ?? 0n;
    const discount = max(optionalBigint(fu['referral.traderDiscountAmount']) ?? 0n, optionalBigint(fu['pro.traderDiscountAmount']) ?? 0n);
    const balanceWasImproved = optionalBoolean(fees.bool.balanceWasImproved);

    const intent = resolveDecreaseIntent(sub, posB);
    const sizeRewrites = eventList(ex, 'OrderSizeDeltaAutoUpdated');
    const collateralRewrites = eventList(ex, 'OrderCollateralDeltaAmountAutoUpdated');
    const insolvent = eventArgs(ex, 'InsolventClose');
    const insufficientFunding = eventArgs(ex, 'InsufficientFundingFeePayment');
    const fullClose = evSizeDeltaUsd === oldUsd;
    const sideUsd = isLong ? 'cumulativeOpenCostsLong' : 'cumulativeOpenCostsShort';
    const otherUsd = isLong ? 'cumulativeOpenCostsShort' : 'cumulativeOpenCostsLong';
    const sideTokens = isLong ? 'openInterestInTokensLong' : 'openInterestInTokensShort';
    const otherTokens = isLong ? 'openInterestInTokensShort' : 'openInterestInTokensLong';

    // ── 有效 sizeDelta（§5.2：期望按改写后值）────────────────────────────────
    const lastRewrite = sizeRewrites[sizeRewrites.length - 1];
    const isSizeDeltaUsd = lastRewrite ? optionalBoolean(lastRewrite.bool.isSizeDeltaUsd) !== false : intent.isSizeDeltaUsd;
    const effective: { raw: bigint; source: SourceRef; origin: SizeOrigin } | undefined = lastRewrite
      ? { raw: bigint(lastRewrite.uint.nextSizeDelta), source: E('OrderSizeDeltaAutoUpdated', 'uint.nextSizeDelta', sizeRewrites.length - 1), origin: 'rewrite' }
      : intent.rawSizeDelta !== undefined && intent.rawSizeDeltaSource && intent.rawSizeDeltaOrigin !== 'missing'
        ? { raw: intent.rawSizeDelta, source: intent.rawSizeDeltaSource, origin: intent.rawSizeDeltaOrigin }
        : undefined;
    const sizeBasis: { raw: bigint; source: SourceRef; origin: SizeOrigin } = effective ?? (isSizeDeltaUsd
      ? { raw: evSizeDeltaUsd, source: E('PositionDecrease', 'uint.sizeDeltaUsd'), origin: 'event' }
      : { raw: evSizeDeltaTok, source: E('PositionDecrease', 'uint.sizeDeltaInTokens'), origin: 'event' });
    const size = decreaseOrderSize({ sizeInUsd: oldUsd, sizeInTokens: oldTok, rawSizeDelta: sizeBasis.raw, isSizeDeltaUsd, isLong });
    const sizeVerification = verificationFor(sizeBasis.origin);
    const sizeInputs = [
      formulaInput('position.sizeInUsd.before', oldUsd, S('before', 'position.sizeInUsd')),
      formulaInput('position.sizeInTokens.before', oldTok, S('before', 'position.sizeInTokens')),
      formulaInput('position.isLong', isLong, S('before', 'position.isLong')),
      formulaInput(`rawSizeDelta(${sizeBasis.origin})`, sizeBasis.raw, sizeBasis.source),
      formulaInput('isSizeDeltaUsd', isSizeDeltaUsd, lastRewrite ? E('OrderSizeDeltaAutoUpdated', 'bool.isSizeDeltaUsd', sizeRewrites.length - 1) : intent.isSizeDeltaUsdSource),
    ];

    // ── §6 PnL（封顶输入：execBlock−1 的 OI / totalAssets + MAX_PNL_FACTOR_FOR_TRADERS）─
    const maxPnlLabel = `MAX_PNL_FACTOR(MAX_PNL_FACTOR_FOR_TRADERS,${isLong})`;
    const maxPnlFactor = parameterEntry(ex, 'market', maxPnlLabel);
    const cap: PnlCapInputs | undefined = maxPnlFactor === undefined ? undefined : {
      cumulativeOpenCosts: bigint(ex.before.values[sideUsd]),
      openInterestInTokens: bigint(ex.before.values[sideTokens]),
      poolTokenAmount: bigint(ex.before.values.lpVaultAssets),
      collateralPriceMin: colMin,
      indexPriceForPool: isLong ? indexMax : indexMin,
      maxPnlFactor,
    };
    const pnl = positionPnl({ sizeInUsd: oldUsd, sizeInTokens: oldTok, sizeDeltaInTokens: evSizeDeltaTok, executionPrice: execPrice, isLong, ...(cap ? { cap } : {}) });
    const pnlInputs = [
      formulaInput('position.sizeInUsd.before', oldUsd, S('before', 'position.sizeInUsd')),
      formulaInput('position.sizeInTokens.before', oldTok, S('before', 'position.sizeInTokens')),
      formulaInput('sizeDeltaInTokens', evSizeDeltaTok, E('PositionDecrease', 'uint.sizeDeltaInTokens')),
      formulaInput('executionPrice', execPrice, E('PositionDecrease', 'uint.executionPrice')),
    ];
    const capInputs = cap ? [
      formulaInput(`${sideUsd}.before`, cap.cumulativeOpenCosts, S('before', sideUsd)),
      formulaInput(`${sideTokens}.before`, cap.openInterestInTokens, S('before', sideTokens)),
      formulaInput('lpVaultAssets.before(totalAssets)', cap.poolTokenAmount, S('before', 'lpVaultAssets')),
      formulaInput('collateralTokenPrice.min', colMin, E('PositionDecrease', 'uint.collateralTokenPrice.min')),
      formulaInput(isLong ? 'indexTokenPrice.max' : 'indexTokenPrice.min', cap.indexPriceForPool, E('PositionDecrease', isLong ? 'uint.indexTokenPrice.max' : 'uint.indexTokenPrice.min')),
      formulaInput(maxPnlLabel, cap.maxPnlFactor, parameterSource(ex, 'market', maxPnlLabel)),
    ] : [];

    // ── §5.4 瀑布重放 ────────────────────────────────────────────────────────
    const lastCollateralRewrite = collateralRewrites[collateralRewrites.length - 1];
    const requestedWithdrawal = fullClose
      ? 0n
      : lastCollateralRewrite ? bigint(lastCollateralRewrite.uint.nextCollateralDeltaAmount) : intent.requestedWithdrawal;
    const requestedWithdrawalSource: SourceRef = fullClose
      ? derivedSource('§5.2 ⑦ 全平强制 initialCollateralDeltaAmount = 0（无事件）')
      : lastCollateralRewrite
        ? E('OrderCollateralDeltaAmountAutoUpdated', 'uint.nextCollateralDeltaAmount', collateralRewrites.length - 1)
        : intent.requestedWithdrawalSource; // ③④ 与 §5.4 ⑥ 都会 emit OrderCollateralDeltaAmountAutoUpdated，无事件即按意图/OrderCreated 原值
    const replay = replayDecreaseWaterfall({
      collateralBefore: oldColl,
      positiveFunding,
      negativeFunding,
      basePnlUsd: basePnl,
      collateralPriceMin: colMin,
      collateralPriceMax: colMax,
      costExcludingFunding: totalCost - negativeFunding,
      feeAmountForPool,
      fullClose,
      requestedWithdrawal,
      insolventCloseAllowed: false,
    });
    const waterfallInputs = [
      formulaInput('position.collateralAmount.before', oldColl, S('before', 'position.collateralAmount')),
      formulaInput('positiveFundingFeeAmount', positiveFunding, E('PositionFeesCollected', 'uint.positiveFundingFeeAmount')),
      formulaInput('negativeFundingFeeAmount', negativeFunding, E('PositionFeesCollected', 'uint.negativeFundingFeeAmount')),
      formulaInput('basePnlUsd', basePnl, E('PositionDecrease', 'int.basePnlUsd')),
      formulaInput('collateralTokenPrice.min', colMin, E('PositionDecrease', 'uint.collateralTokenPrice.min')),
      formulaInput('collateralTokenPrice.max', colMax, E('PositionDecrease', 'uint.collateralTokenPrice.max')),
      formulaInput('totalCostAmount', totalCost, E('PositionFeesCollected', 'uint.totalCostAmount')),
      formulaInput('feeAmountForPool', feeAmountForPool, E('PositionFeesCollected', 'uint.feeAmountForPool')),
      formulaInput('fullClose(sizeDeltaUsd == sizeInUsd)', fullClose, E('PositionDecrease', 'uint.sizeDeltaUsd')),
      formulaInput('initialCollateralDeltaAmount(归一化后)', requestedWithdrawal, requestedWithdrawalSource),
    ];
    const settlement = fundingSettlement({
      negativeFunding,
      positiveFunding,
      insufficientPaid: insufficientFunding ? bigint(insufficientFunding.uint.amountPaidInCollateralToken) : undefined,
    });

    const rows: BasisCheckRecord[] = [];

    rows.push(row({
      id: 'close.execute.outcome', packId: P, view: ex, subject: 'chain-event', comparison: 'presence',
      actual: ex.outcome, expected: 'executed', sources: [E('OrderExecuted', 'bytes32.key')], verification: 'PRESENCE',
      basis: basis('§5.6', '减仓路径回退闸门速查'),
      note: 'EXECUTED 表示 InvalidDecreaseOrderSize / UnableToWithdrawCollateral / InsufficientFundsToPayForCosts / LiquidatablePosition / InsufficientOutputAmount 等回退均未触发',
    }));
    rows.push(executionPresenceRow({ id: 'keeper.close-execution', packId: P, view: ex, basis: basis('§23.2', '减仓 / 平仓 / 清算 / ADL 预期值计算顺序') }));
    rows.push(row({
      id: 'event.decrease.order-type', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
      actual: du.orderType, expected: intent.orderType,
      sources: [E('PositionDecrease', 'uint.orderType'), intent.orderTypeSource], verification: 'IDENTITY',
      basis: basis('§3.3', 'orderType 枚举与计价模式约束'),
      note: `Order.OrderType：MarketDecrease=${ORDER_TYPE.MarketDecrease} / LimitDecrease=${ORDER_TYPE.LimitDecrease} / StopLossDecrease=${ORDER_TYPE.StopLossDecrease}；意图未声明时按 MarketDecrease`,
    }));
    rows.push(row({
      id: 'event.decrease.side', packId: P, view: ex, subject: 'chain-event', comparison: 'event-vs-state',
      actual: decrease.bool.isLong, expected: posB.isLong,
      sources: [E('PositionDecrease', 'bool.isLong'), S('before', 'position.isLong')], verification: 'IDENTITY',
      basis: basis('§4.7', 'acceptablePrice 闸门与已知口径陷阱'),
      note: '事件 isLong 取 position.isLong()；正常路径与 order.isLong() 恒等',
    }));

    // §5.2 有效 sizeDelta（含七处改写）
    if (!effective) {
      rows.push(notVerified({
        id: 'order.size-delta.effective', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
        actual: evSizeDeltaUsd, expectedDescription: '意图 sizeDelta 经 §5.2 ①②⑤⑥ 改写后的值',
        missing: 'submitMarketDecrease.input.sizeDeltaUsd / OrderCreated.uint.sizeDelta（或 percent=100）与 OrderSizeDeltaAutoUpdated 事件',
        sources: [E('PositionDecrease', 'uint.sizeDeltaUsd'), intentSource(sub, 'sizeDeltaUsd'), eventSource(sub, 'OrderCreated', 'uint.sizeDelta')],
        basis: basis('§5.2', '减仓后规模与订单规模归一化'),
      }));
    } else {
      rows.push(row({
        id: 'order.size-delta.effective', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
        actual: evSizeDeltaUsd, expected: size.sizeDeltaUsd,
        sources: [E('PositionDecrease', 'uint.sizeDeltaUsd'), effective.source, S('before', 'position.sizeInUsd')],
        formula: {
          id: 'order.decrease.effective-size-delta', version: FORMULA_VERSION,
          expanded: `${effective.origin === 'rewrite' ? `最后一次 OrderSizeDeltaAutoUpdated.nextSizeDelta ${effective.raw}` : `意图 rawSizeDelta ${effective.raw}（${effective.origin}）`} → getDecreaseOrderSize → sizeDeltaUsd ${size.sizeDeltaUsd}；${size.expanded}`,
          inputs: sizeInputs,
        },
        verification: verificationFor(effective.origin),
        basis: basis('§5.2', '减仓后规模与订单规模归一化'),
        note: effective.origin === 'rewrite'
          ? `本笔发生 ${sizeRewrites.length} 次 sizeDelta 自动改写，期望按改写后值`
          : '本笔未观测到 OrderSizeDeltaAutoUpdated；若意图与事件不等，要么改写未被采集、要么规模有误，均判 FAIL',
      }));
    }
    if (sizeRewrites.length === 0) {
      rows.push(notApplicable({
        id: 'order.size-delta.rewrite-chain', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
        sources: [E('PositionDecrease', 'uint.sizeDeltaUsd')], basis: basis('§5.2', '减仓后规模与订单规模归一化'),
        reason: '本笔未出现 OrderSizeDeltaAutoUpdated，订单 sizeDelta 未被 ①②⑤⑥ 改写',
      }));
    } else {
      const maxSizeDelta = isSizeDeltaUsd ? oldUsd : oldTok;
      const violations: string[] = [];
      const links: string[] = [];
      sizeRewrites.forEach((event, index) => {
        const from = bigint(event.uint.sizeDelta);
        const to = bigint(event.uint.nextSizeDelta);
        links.push(`${from}→${to}`);
        if (to !== maxSizeDelta) violations.push(`第 ${index + 1} 次 nextSizeDelta ${to} ≠ maxSizeDelta/position.sizeInUsd ${maxSizeDelta}`);
        const previous = sizeRewrites[index - 1];
        if (index === 0 && intent.rawSizeDelta !== undefined && from !== intent.rawSizeDelta) {
          violations.push(`首次改写前 sizeDelta ${from} ≠ 意图 ${intent.rawSizeDelta}`);
        }
        if (previous && from !== bigint(previous.uint.nextSizeDelta)) violations.push(`第 ${index + 1} 次 sizeDelta ${from} 未接上一次 nextSizeDelta`);
      });
      if (intent.rawSizeDelta !== undefined && intent.rawSizeDelta > maxSizeDelta
        && intent.orderType !== ORDER_TYPE.LimitDecrease && intent.orderType !== ORDER_TYPE.StopLossDecrease) {
        violations.push(`超仓 ${intent.rawSizeDelta} > ${maxSizeDelta} 且 orderType ${intent.orderType} ∉ {LimitDecrease, StopLossDecrease}，①\' 应 revert InvalidDecreaseOrderSize`);
      }
      if (evSizeDeltaUsd !== size.sizeDeltaUsd) violations.push(`事件 sizeDeltaUsd ${evSizeDeltaUsd} ≠ 末次改写重算 ${size.sizeDeltaUsd}`);
      rows.push(row({
        id: 'order.size-delta.rewrite-chain', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
        actual: links.join(' ; '), expected: `每次 nextSizeDelta = ${maxSizeDelta} 且链式衔接`,
        verdict: violations.length === 0 ? 'PASS' : 'FAIL',
        sources: sizeRewrites.map((_, index) => E('OrderSizeDeltaAutoUpdated', 'uint.nextSizeDelta', index)).concat([S('before', 'position.sizeInUsd'), S('before', 'position.sizeInTokens')]),
        formula: {
          id: 'order.decrease.size-delta-rewrite-chain', version: FORMULA_VERSION,
          expanded: `maxSizeDelta = ${isSizeDeltaUsd ? 'sizeInUsd' : 'sizeInTokens'} = ${maxSizeDelta}；①/⑤/⑥ 改写目标 = maxSizeDelta，② 改写目标 = position.sizeInUsd（USD 模式下二者相等）；链：${links.join(' ; ')}`,
          inputs: sizeInputs,
        },
        verification: 'EVENT_ANCHORED',
        basis: basis('§5.2', '减仓后规模与订单规模归一化'),
        ...(violations.length > 0 ? { note: violations.join('；') } : {}),
      }));
    }
    if (fullClose) {
      rows.push(row({
        id: 'order.collateral-delta.full-close-zeroed', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
        actual: collateralDeltaEvent, expected: oldColl,
        verdict: collateralDeltaEvent === oldColl && afterColl === 0n ? 'PASS' : 'FAIL',
        sources: [E('PositionDecrease', 'int.collateralDeltaAmount'), S('before', 'position.collateralAmount'), S('after', 'position.collateralAmount')],
        formula: {
          id: 'order.decrease.full-close-collateral-zeroed', version: FORMULA_VERSION,
          expanded: `全平 ⑦ initialCollateralDeltaAmount 置 0（无事件）→ 保证金全部经清仓分支回到 output；collateralDeltaAmount = ${oldColl} − 0 = ${oldColl}；position.collateralAmount.after 应为 0（实际 ${afterColl}）`,
          inputs: [formulaInput('position.collateralAmount.before', oldColl, S('before', 'position.collateralAmount'))],
        },
        verification: 'FULL_RECOMPUTE',
        basis: basis('§5.2', '减仓后规模与订单规模归一化'),
      }));
    } else {
      rows.push(notApplicable({
        id: 'order.collateral-delta.full-close-zeroed', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
        sources: [E('PositionDecrease', 'uint.sizeDeltaUsd')], basis: basis('§5.2', '减仓后规模与订单规模归一化'),
        reason: '部分减仓不触发 ⑦；提取额按 ③④ 与 §5.4 ⑥ 归一化后值进入瀑布核对',
      }));
    }

    // §3.2 减仓 token 数
    rows.push(row({
      id: 'position.size-delta-in-tokens', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
      actual: evSizeDeltaTok, expected: size.sizeDeltaInTokens,
      sources: [E('PositionDecrease', 'uint.sizeDeltaInTokens'), sizeBasis.source, S('before', 'position.sizeInUsd'), S('before', 'position.sizeInTokens')],
      formula: { id: 'position.decrease.size-delta-in-tokens', version: FORMULA_VERSION, expanded: size.expanded, inputs: sizeInputs, rounding: isLong ? 'ceil（多头部分平）' : 'floor（空头部分平）' },
      verification: sizeVerification,
      basis: basis('§3.2', '减仓订单'),
      note: '等比销账只读仓位 sizeInUsd : sizeInTokens，不读价格/点差/执行价；全平走恒等分支无尘埃',
    }));

    // §4.6 减仓成交价
    const price = decreaseExecutionPrice({ indexPriceMin: indexMin, indexPriceMax: indexMax, dynamicSpread: spread, isLong });
    rows.push(row({
      id: 'pricing.decrease.execution-price', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
      actual: execPrice, expected: price.executionPrice,
      sources: [E('PositionDecrease', 'uint.executionPrice'), E('PositionDecrease', `uint.${price.oracleSide}`), E('PositionDecrease', 'int.dynamicSpread')],
      formula: {
        id: 'pricing.decrease.execution-price', version: FORMULA_VERSION, expanded: price.expanded, rounding: price.rounding,
        inputs: [
          formulaInput(price.oracleSide, price.oraclePrice, E('PositionDecrease', `uint.${price.oracleSide}`)),
          formulaInput('dynamicSpread(int256, clamp 后)', spread, E('PositionDecrease', 'int.dynamicSpread')),
          formulaInput('position.isLong', isLong, S('before', 'position.isLong')),
        ],
      },
      verification: 'EVENT_ANCHORED',
      basis: basis('§4.6', '减仓成交价'),
      note: 'dynamicSpread 取自事件 intItems（v0.3.2 为 int256，普通减仓允许为负）；未独立移植 getDynamicSpread 前不升级 FULL_RECOMPUTE',
    }));

    // §6 PnL
    rows.push(row({
      id: 'pnl.uncapped-base', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
      actual: uncappedPnl, expected: pnl.uncappedBasePnlUsd,
      sources: [E('PositionDecrease', 'int.uncappedBasePnlUsd'), E('PositionDecrease', 'uint.executionPrice'), S('before', 'position.sizeInUsd'), S('before', 'position.sizeInTokens')],
      formula: {
        id: 'pnl.decrease.uncapped', version: FORMULA_VERSION,
        expanded: `positionValue = sizeInTokens × executionPrice；total = ${isLong ? 'value − sizeInUsd' : 'sizeInUsd − value'} = ${pnl.totalPositionPnl < 0n || pnl.capStatus !== 'capped' ? pnl.totalPositionPnl : '(见 capped 行)'}；uncapped = mulDiv(total, ${evSizeDeltaTok}, ${oldTok}, roundUp=total<0) = ${pnl.uncappedBasePnlUsd}`,
        inputs: pnlInputs, rounding: '正 PnL 向下、负 PnL 按绝对值向上',
      },
      verification: 'EVENT_ANCHORED',
      basis: basis('§6.4', '按本次减仓比例折算'),
      note: '整仓市值用含点差执行价（§6.1），非裸 index 价',
    }));
    if (pnl.basePnlUsd === undefined) {
      rows.push(notVerified({
        id: 'pnl.base-capped', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
        actual: basePnl, expectedDescription: 'total > 0 时按同方向单边池 PnL 与 MAX_PNL_FACTOR_FOR_TRADERS 封顶后折算',
        missing: `参数 ${maxPnlLabel}（parameters[name=trade-parameters].value.market）`,
        sources: [E('PositionDecrease', 'int.basePnlUsd'), parameterSource(ex, 'market', maxPnlLabel)],
        basis: basis('§6.3', '盈利上限：只裁正 PnL，且只看本仓方向的单边池 PnL'),
        note: pnl.expanded,
      }));
    } else {
      rows.push(row({
        id: 'pnl.base-capped', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
        actual: basePnl, expected: pnl.basePnlUsd,
        sources: [E('PositionDecrease', 'int.basePnlUsd'), ...(cap ? [S('before', sideUsd), S('before', sideTokens), S('before', 'lpVaultAssets'), parameterSource(ex, 'market', maxPnlLabel)] : []), E('PositionDecrease', 'uint.executionPrice')],
        formula: { id: 'pnl.decrease.capped', version: FORMULA_VERSION, expanded: pnl.expanded, inputs: [...pnlInputs, ...capInputs], rounding: '缩放向下；折算正向下/负按绝对值向上' },
        verification: 'EVENT_ANCHORED',
        basis: basis('§6.3', '盈利上限：只裁正 PnL，且只看本仓方向的单边池 PnL'),
        note: `capStatus=${pnl.capStatus}；封顶用 Long→index.max / Short→index.min 的单边池 PnL，与自身 PnL 的成交价方向相反`,
      }));
    }
    rows.push(row({
      id: 'pnl.cap-direction', packId: P, view: ex, subject: 'chain-event', comparison: 'invariant',
      actual: `${basePnl}/${uncappedPnl}`, expected: '|base| ≤ |uncapped| 且同号',
      verdict: abs(basePnl) <= abs(uncappedPnl) && (basePnl === 0n || (basePnl < 0n) === (uncappedPnl < 0n)) ? 'PASS' : 'FAIL',
      sources: [E('PositionDecrease', 'int.basePnlUsd'), E('PositionDecrease', 'int.uncappedBasePnlUsd')],
      verification: 'IDENTITY', severity: 'warning',
      basis: basis('§6.6', '核对要点'),
      note: 'base ≠ uncapped ⇒ 该方向单边池 PnL 被削顶；相等不能反证未削顶（各有一次向下取整）',
    }));

    // §7.1 仓位费 / §9.1 费用总额 / §8.1 清算费生效门
    const feeFactorLabel = balanceWasImproved === undefined ? undefined : `POSITION_FEE_FACTOR(${balanceWasImproved})`;
    const feeFactorParam = feeFactorLabel === undefined ? undefined : parameterEntry(ex, 'market', feeFactorLabel);
    const feeFactor = feeFactorParam ?? feeFactorEvent;
    const feeFactorSource: SourceRef = feeFactorParam !== undefined && feeFactorLabel
      ? parameterSource(ex, 'market', feeFactorLabel)
      : E('PositionFeesCollected', 'uint.positionFeeFactor');
    const positionFeeExpected = positionFeeExpectation({ sizeDeltaUsd: evSizeDeltaUsd, positionFeeFactor: feeFactor, collateralPriceMin: bigint(fu['collateralTokenPrice.min']) });
    rows.push(row({
      id: 'fee.position.amount', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
      actual: positionFee, expected: positionFeeExpected.positionFeeAmount ?? '<undefined>',
      sources: [E('PositionFeesCollected', 'uint.positionFeeAmount'), E('PositionDecrease', 'uint.sizeDeltaUsd'), feeFactorSource, E('PositionFeesCollected', 'uint.collateralTokenPrice.min')],
      formula: {
        id: 'fee.position.amount', version: FORMULA_VERSION, expanded: positionFeeExpected.expanded, rounding: 'floor, then floor',
        inputs: [
          formulaInput('sizeDeltaUsd(归一化后)', evSizeDeltaUsd, E('PositionDecrease', 'uint.sizeDeltaUsd')),
          formulaInput(feeFactorLabel ?? 'positionFeeFactor', feeFactor, feeFactorSource),
          formulaInput('collateralTokenPrice.min', fu['collateralTokenPrice.min'], E('PositionFeesCollected', 'uint.collateralTokenPrice.min')),
        ],
      },
      verification: 'EVENT_ANCHORED',
      basis: basis('§7.1', '基础仓位费'),
      note: `费率档位由事件 balanceWasImproved=${String(balanceWasImproved)} 选择（v0.3.2 接线）；费率来源：${feeFactorParam !== undefined ? 'DataStore 参数快照' : '事件字段（参数快照未采集）'}`,
    }));
    rows.push(row({
      id: 'fee.total-cost', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
      actual: totalCost, expected: positionFee + liquidationFeeEvent + uiFee - discount + negativeFunding,
      sources: [E('PositionFeesCollected', 'uint.totalCostAmount'), E('PositionFeesCollected', 'uint.positionFeeAmount'), E('PositionFeesCollected', 'uint.uiFeeAmount'), E('PositionFeesCollected', 'uint.negativeFundingFeeAmount')],
      formula: {
        id: 'fee.total-cost-amount', version: FORMULA_VERSION,
        expanded: `positionFee ${positionFee} + liquidationFee ${liquidationFeeEvent} + uiFee ${uiFee} − max(referral.traderDiscount, pro.traderDiscount) ${discount} + negativeFunding ${negativeFunding}`,
        inputs: [
          formulaInput('positionFeeAmount', positionFee, E('PositionFeesCollected', 'uint.positionFeeAmount')),
          formulaInput('liquidationFeeAmount(条件项, 缺省 0)', liquidationFeeEvent, E('PositionFeesCollected', 'uint.liquidationFeeAmount')),
          formulaInput('uiFeeAmount', uiFee, E('PositionFeesCollected', 'uint.uiFeeAmount')),
          formulaInput('totalDiscountAmount(条件项 max)', discount, E('PositionFeesCollected', 'uint.referral.traderDiscountAmount')),
          formulaInput('negativeFundingFeeAmount', negativeFunding, E('PositionFeesCollected', 'uint.negativeFundingFeeAmount')),
        ],
      },
      verification: 'EVENT_ANCHORED',
      basis: basis('§9.1', '两个聚合量'),
      note: '单位为抵押币原生数量；positiveFundingFeeAmount 不进 totalCostAmount',
    }));
    rows.push(row({
      id: 'fee.liquidation.not-charged', packId: P, view: ex, subject: 'chain-event', comparison: 'invariant',
      actual: liquidationFeeEvent, expected: 0n,
      sources: [E('PositionFeesCollected', 'uint.liquidationFeeAmount'), E('PositionDecrease', 'uint.orderType')], verification: 'IDENTITY',
      basis: basis('§8.1', '生效门：只有 orderType == Liquidation 才计清算费'),
      note: 'MarketDecrease / Limit / StopLoss / ADL 的 isLiquidation 恒 false，事件不出现清算费三项',
    }));

    // §5.4 瀑布 → 用户实收 / 剩余押金 / LP 腿
    const traderDelta = ledgerDelta(ex, 'traderUsdc');
    rows.push(row({
      id: 'settlement.waterfall.output', packId: P, view: ex, subject: 'chain-state', comparison: 'formula-vs-state',
      actual: traderDelta, expected: replay.output ?? '<indeterminate>',
      verdict: replay.output !== undefined && !replay.shortfall && traderDelta === replay.output ? 'PASS' : 'FAIL',
      transition: transition(ex.before.values.traderUsdc, ex.after.values.traderUsdc, replay.output ?? 0n),
      tolerance: '0',
      sources: [S('before', 'traderUsdc'), S('after', 'traderUsdc'), E('PositionDecrease', 'int.basePnlUsd'), E('PositionFeesCollected', 'uint.totalCostAmount'), S('before', 'position.collateralAmount')],
      formula: {
        id: 'settlement.decrease-waterfall.output', version: FORMULA_VERSION,
        expanded: `${replay.expanded}；outputAmount → positionVault.transferOut(receiver=trader) = ${replay.output ?? '<indeterminate>'}`,
        inputs: waterfallInputs, rounding: '盈利 ⌊/max⌋；need ⌈/min⌉；先扣 output 再扣押金',
      },
      verification: 'EVENT_ANCHORED',
      basis: basis('§5.4', '减仓支付瀑布与输出'),
      note: replay.shortfall
        ? `瀑布重放在 step=${replay.shortfall.step} 出现缺口 ${replay.shortfall.remainingCostUsd}，非「全平+清算/ADL」应 revert InsufficientFundsToPayForCosts，与 EXECUTED 矛盾`
        : '断言 output === trader 钱包 USDC Δ，0 容差；全平时 output 含清仓分支退回的全部剩余押金',
    }));
    rows.push(row({
      id: 'settlement.remaining-collateral', packId: P, view: ex, subject: 'chain-state', comparison: 'formula-vs-state',
      actual: afterColl, expected: replay.remainingCollateral ?? '<indeterminate>',
      transition: transition(oldColl, afterColl, (replay.remainingCollateral ?? oldColl) - oldColl),
      sources: [S('before', 'position.collateralAmount'), S('after', 'position.collateralAmount'), E('PositionFeesCollected', 'uint.totalCostAmount'), E('PositionDecrease', 'int.basePnlUsd')],
      formula: { id: 'settlement.decrease-waterfall.remaining-collateral', version: FORMULA_VERSION, expanded: replay.expanded, inputs: waterfallInputs },
      verification: 'EVENT_ANCHORED',
      basis: basis('§5.5', '减仓写回、清仓与事件符号'),
      note: fullClose ? '全平：remaining 全额并入 output，仓位 collateralAmount 置 0 并删除' : '部分平：remaining 留在仓位上，⑥ 提取额已按归一化后值扣除',
    }));
    rows.push(row({
      id: 'event.decrease.collateral-delta', packId: P, view: ex, subject: 'chain-event', comparison: 'formula-vs-event',
      actual: collateralDeltaEvent, expected: oldColl - afterColl,
      sources: [E('PositionDecrease', 'int.collateralDeltaAmount'), S('before', 'position.collateralAmount'), S('after', 'position.collateralAmount')],
      formula: {
        id: 'event.decrease.collateral-delta-sign', version: FORMULA_VERSION,
        expanded: `collateralDeltaAmount = 执行前 ${oldColl} − 执行后 ${afterColl} = ${oldColl - afterColl}（正值 = 仓位抵押品净减少，与 PositionIncrease 符号相反）`,
        inputs: [
          formulaInput('position.collateralAmount.before', oldColl, S('before', 'position.collateralAmount')),
          formulaInput('position.collateralAmount.after', afterColl, S('after', 'position.collateralAmount')),
        ],
      },
      verification: 'FULL_RECOMPUTE',
      basis: basis('§5.5', '减仓写回、清仓与事件符号'),
    }));

    // §5.2 写回与 OI
    rows.push(row({
      id: 'position.size-usd.after', packId: P, view: ex, subject: 'chain-state', comparison: 'formula-vs-state',
      actual: posA.sizeInUsd, expected: oldUsd - size.sizeDeltaUsd,
      transition: transition(oldUsd, posA.sizeInUsd, -size.sizeDeltaUsd),
      sources: [S('before', 'position.sizeInUsd'), S('after', 'position.sizeInUsd'), sizeBasis.source],
      formula: { id: 'position.size-usd.after-decrease', version: FORMULA_VERSION, expanded: `${oldUsd} − ${size.sizeDeltaUsd} = ${oldUsd - size.sizeDeltaUsd}`, inputs: sizeInputs },
      verification: sizeVerification,
      basis: basis('§5.2', '减仓后规模与订单规模归一化'),
    }));
    rows.push(row({
      id: 'position.size-tokens.after', packId: P, view: ex, subject: 'chain-state', comparison: 'formula-vs-state',
      actual: posA.sizeInTokens, expected: oldTok - size.sizeDeltaInTokens,
      transition: transition(oldTok, posA.sizeInTokens, -size.sizeDeltaInTokens),
      sources: [S('before', 'position.sizeInTokens'), S('after', 'position.sizeInTokens'), sizeBasis.source],
      formula: { id: 'position.size-tokens.after-decrease', version: FORMULA_VERSION, expanded: `${oldTok} − ${size.sizeDeltaInTokens} = ${oldTok - size.sizeDeltaInTokens}`, inputs: sizeInputs },
      verification: sizeVerification,
      basis: basis('§5.2', '减仓后规模与订单规模归一化'),
    }));
    rows.push(row({
      id: 'position.removed-on-full-close', packId: P, view: ex, subject: 'chain-state', comparison: 'formula-vs-state',
      actual: `exists=${String(posA.exists)},sizeInUsd=${String(posA.sizeInUsd)},sizeInTokens=${String(posA.sizeInTokens)}`,
      expected: fullClose ? 'exists=false,sizeInUsd=0,sizeInTokens=0' : 'exists=true,两腿非零',
      verdict: fullClose
        ? (optionalBoolean(posA.exists) === false && bigint(posA.sizeInUsd) === 0n && bigint(posA.sizeInTokens) === 0n ? 'PASS' : 'FAIL')
        : (optionalBoolean(posA.exists) === true && bigint(posA.sizeInUsd) > 0n && bigint(posA.sizeInTokens) > 0n ? 'PASS' : 'FAIL'),
      sources: [S('after', 'position.exists'), S('after', 'position.sizeInUsd'), S('after', 'position.sizeInTokens'), E('PositionDecrease', 'uint.sizeDeltaUsd')],
      verification: 'PRESENCE',
      basis: basis('§5.5', '减仓写回、清仓与事件符号'),
      note: 'sizeInUsd == 0 || sizeInTokens == 0 即两腿同时清零并 PositionStoreUtils.remove',
    }));
    rows.push(row({
      id: 'market.oi-usd-side', packId: P, view: ex, subject: 'chain-state', comparison: 'formula-vs-state',
      actual: ledgerDelta(ex, sideUsd), expected: -size.sizeDeltaUsd,
      transition: transition(ex.before.values[sideUsd], ex.after.values[sideUsd], -size.sizeDeltaUsd),
      sources: [S('before', sideUsd), S('after', sideUsd), sizeBasis.source],
      formula: { id: 'market.open-interest-usd.decrease', version: FORMULA_VERSION, expanded: `updateOpenInterest(−sizeDeltaUsd) → Δ${sideUsd} = −${size.sizeDeltaUsd}`, inputs: sizeInputs },
      verification: sizeVerification,
      basis: basis('§5.2', '减仓后规模与订单规模归一化'),
    }));
    rows.push(row({
      id: 'market.oi-tokens-side', packId: P, view: ex, subject: 'chain-state', comparison: 'formula-vs-state',
      actual: ledgerDelta(ex, sideTokens), expected: -size.sizeDeltaInTokens,
      transition: transition(ex.before.values[sideTokens], ex.after.values[sideTokens], -size.sizeDeltaInTokens),
      sources: [S('before', sideTokens), S('after', sideTokens), sizeBasis.source],
      formula: { id: 'market.open-interest-tokens.decrease', version: FORMULA_VERSION, expanded: `updateOpenInterest(−sizeDeltaInTokens) → Δ${sideTokens} = −${size.sizeDeltaInTokens}`, inputs: sizeInputs },
      verification: sizeVerification,
      basis: basis('§5.2', '减仓后规模与订单规模归一化'),
    }));
    rows.push(row({
      id: 'market.oi-other-side', packId: P, view: ex, subject: 'chain-state', comparison: 'invariant',
      actual: `${ledgerDelta(ex, otherUsd)}/${ledgerDelta(ex, otherTokens)}`, expected: '0/0',
      sources: [S('before', otherUsd), S('after', otherUsd), S('before', otherTokens), S('after', otherTokens)], verification: 'IDENTITY',
      basis: basis('§5.2', '减仓后规模与订单规模归一化'),
      note: `对侧 ${otherUsd} / ${otherTokens} 不变`,
    }));

    // §10.7 settleFundingFees（减仓传实付额）
    rows.push(row({
      id: 'funding.settle.claimable', packId: P, view: ex, subject: 'chain-state', comparison: 'formula-vs-state',
      actual: ledgerDelta(ex, 'claimableFeeAmountFunding'), expected: settlement.claimableDelta,
      transition: transition(ex.before.values.claimableFeeAmountFunding, ex.after.values.claimableFeeAmountFunding, settlement.claimableDelta),
      sources: [S('before', 'claimableFeeAmountFunding'), S('after', 'claimableFeeAmountFunding'), E('PositionFeesCollected', 'uint.negativeFundingFeeAmount'), E('PositionFeesCollected', 'uint.positiveFundingFeeAmount')],
      formula: {
        id: 'funding.settle.claimable-delta', version: FORMULA_VERSION, expanded: settlement.expanded,
        inputs: [
          formulaInput('negativeFundingFeeAmount(应付)', negativeFunding, E('PositionFeesCollected', 'uint.negativeFundingFeeAmount')),
          formulaInput('amountPaidInCollateralToken(实付)', settlement.paid, insufficientFunding ? E('InsufficientFundingFeePayment', 'uint.amountPaidInCollateralToken') : derivedSource('无 InsufficientFundingFeePayment → 实付 = 应付')),
          formulaInput('positiveFundingFeeAmount', positiveFunding, E('PositionFeesCollected', 'uint.positiveFundingFeeAmount')),
        ],
      },
      verification: 'EVENT_ANCHORED',
      basis: basis('§10.7', '仓位结算：settleFundingFees（v0.3.2 新增）'),
      note: '减仓路径传 payForCost 实付额而非应付额；净支付只记 FUNDING_FEE_TYPE 账本不转账',
    }));
    // §8.5 减仓侧 claimable 增记：POSITION_FEE_TYPE += feeReceiverAmount − liquidationFeeAmountForFeeReceiver（普通减仓后者为 0）；LIQUIDATION_FEE_TYPE 不动
    rows.push(row({
      id: 'fee.claimable.position', packId: P, view: ex, subject: 'chain-state', comparison: 'formula-vs-state',
      actual: ledgerDelta(ex, 'claimableFeeAmountPosition'), expected: feeReceiverAmount - liquidationReceiverEvent,
      transition: transition(ex.before.values.claimableFeeAmountPosition, ex.after.values.claimableFeeAmountPosition, feeReceiverAmount - liquidationReceiverEvent),
      sources: [S('before', 'claimableFeeAmountPosition'), S('after', 'claimableFeeAmountPosition'), E('PositionFeesCollected', 'uint.feeReceiverAmount')],
      formula: {
        id: 'fee.claimable.position-increment', version: FORMULA_VERSION,
        expanded: `费用付清 → incrementClaimableFeeAmount(feeReceiverAmount ${feeReceiverAmount} − liquidationFeeAmountForFeeReceiver ${liquidationReceiverEvent}, POSITION_FEE_TYPE)`,
        inputs: [
          formulaInput('feeReceiverAmount', feeReceiverAmount, E('PositionFeesCollected', 'uint.feeReceiverAmount')),
          formulaInput('liquidationFeeAmountForFeeReceiver(条件项, 缺省 0)', liquidationReceiverEvent, E('PositionFeesCollected', 'uint.liquidationFeeAmountForFeeReceiver')),
        ],
      },
      verification: 'EVENT_ANCHORED',
      basis: basis('§8.5', '资金去向（仅在费用全额付清时执行，见 §9.5）'),
      note: 'DataStore 内部应收，USDC 留在 PositionVault；与五方 ERC20 守恒分行核对',
    }));
    rows.push(row({
      id: 'fee.claimable.liquidation', packId: P, view: ex, subject: 'chain-state', comparison: 'invariant',
      actual: ledgerDelta(ex, 'claimableFeeAmountLiquidation'), expected: 0n,
      transition: transition(ex.before.values.claimableFeeAmountLiquidation, ex.after.values.claimableFeeAmountLiquidation, 0n),
      sources: [S('before', 'claimableFeeAmountLiquidation'), S('after', 'claimableFeeAmountLiquidation'), E('PositionDecrease', 'uint.orderType')], verification: 'IDENTITY',
      basis: basis('§8.5', '资金去向（仅在费用全额付清时执行，见 §9.5）'),
      note: '非清算单 liquidationFeeAmountForFeeReceiver = 0，LIQUIDATION_FEE_TYPE 分支不进入',
    }));
    rows.push(row({
      id: 'funding.settle.full-payment', packId: P, view: ex, subject: 'chain-event', comparison: 'presence',
      actual: insufficientFunding ? 'present' : 'absent', expected: 'absent',
      sources: [E('InsufficientFundingFeePayment', 'uint.amountPaidInCollateralToken'), E('PositionDecrease', 'uint.orderType')], verification: 'PRESENCE',
      basis: basis('§10.7', '仓位结算：settleFundingFees（v0.3.2 新增）'),
      note: '非「全平+清算/ADL」路径 funding 付不满即 revert（③④ 一并回滚），EXECUTED 的普通减仓不应出现该事件',
    }));
    rows.push(row({
      id: 'settlement.no-insolvent-close', packId: P, view: ex, subject: 'chain-event', comparison: 'presence',
      actual: insolvent ? `present(step=${String(insolvent.string.step)})` : 'absent', expected: 'absent',
      verdict: insolvent ? 'FAIL' : 'PASS',
      sources: [E('InsolventClose', 'string.step'), E('PositionDecrease', 'uint.orderType')], verification: 'PRESENCE',
      basis: basis('§5.4.4', '破产平仓与早退'),
      note: 'isInsolventCloseAllowed 仅对全平的 Liquidation / ADL 为 true；普通减仓任一步缺口即 revert InsufficientFundsToPayForCosts',
    }));

    // §5.4.5 / §5.6 minOutputAmount（USD 口径）
    if (intent.minOutputAmount === undefined) {
      rows.push(notVerified({
        id: 'output.min-output-gate', packId: P, view: ex, subject: 'chain-state', comparison: 'formula-vs-state',
        actual: replay.output === undefined ? '<indeterminate>' : replay.output * colMin,
        expectedDescription: 'outputAmount × collateralPrice.min ≥ order.minOutputAmount（30 位 USD）',
        missing: 'submitMarketDecrease.input.minOutputAmount 或提交交易 OrderCreated.uint.minOutputAmount', severity: 'warning',
        sources: [intentSource(sub, 'minOutputAmount'), eventSource(sub, 'OrderCreated', 'uint.minOutputAmount'), E('PositionDecrease', 'uint.collateralTokenPrice.min')],
        basis: basis('§5.4', '减仓支付瀑布与输出'),
        note: '§5.4.5：minOutputAmount 是 USD 值不是 token 数；意图与 OrderCreated 均未登记该字段时无法核对闸门',
      }));
    } else {
      const outputUsd = (replay.output ?? 0n) * colMin;
      rows.push(row({
        id: 'output.min-output-gate', packId: P, view: ex, subject: 'chain-state', comparison: 'formula-vs-state',
        actual: outputUsd, expected: `>= ${intent.minOutputAmount}`,
        verdict: replay.output !== undefined && outputUsd >= intent.minOutputAmount ? 'PASS' : 'FAIL',
        sources: [intent.minOutputAmountSource, E('PositionDecrease', 'uint.collateralTokenPrice.min'), S('before', 'traderUsdc'), S('after', 'traderUsdc')],
        formula: {
          id: 'order.decrease.min-output-usd', version: FORMULA_VERSION,
          expanded: `outputUsd = ${replay.output ?? '<indeterminate>'} × ${colMin} = ${outputUsd} ≥ minOutputAmount ${intent.minOutputAmount}`,
          inputs: [
            formulaInput('outputAmount(瀑布)', replay.output ?? '<indeterminate>', derivedSource('settlement.waterfall.output')),
            formulaInput('collateralTokenPrice.min', colMin, E('PositionDecrease', 'uint.collateralTokenPrice.min')),
            formulaInput('order.minOutputAmount', intent.minOutputAmount, intent.minOutputAmountSource),
          ],
        },
        verification: 'EVENT_ANCHORED', severity: 'warning',
        basis: basis('§5.4', '减仓支付瀑布与输出'),
        note: '§5.4.5：v0.3.2 才接线的滑点闸门，比较口径为 USD；EXECUTED 已证明闸门通过，本行核对证据自洽',
      }));
    }

    // 资金账本
    rows.push(row({
      id: 'ledger.lp-vault', packId: P, view: ex, subject: 'chain-state', comparison: 'formula-vs-state',
      actual: ledgerDelta(ex, 'lpVaultAssets'), expected: replay.lpVaultDelta ?? '<indeterminate>',
      transition: transition(ex.before.values.lpVaultAssets, ex.after.values.lpVaultAssets, replay.lpVaultDelta ?? 0n),
      sources: [S('before', 'lpVaultAssets'), S('after', 'lpVaultAssets'), E('PositionDecrease', 'int.basePnlUsd'), E('PositionFeesCollected', 'uint.feeAmountForPool'), E('PositionFeesCollected', 'uint.positiveFundingFeeAmount')],
      formula: {
        id: 'ledger.lp-vault.decrease', version: FORMULA_VERSION,
        expanded: `ΔLP = −盈利兑付 ${replay.pnlPayoutFromLp} + 实付亏损 ${replay.lossPaidToLp} + feeAmountForPool ${replay.feesTransferredToPool ? feeAmountForPool : 0n} − LP→PositionVault 净收 funding ${settlement.lpToPositionVault} = ${replay.lpVaultDelta ?? '<indeterminate>'}`,
        inputs: waterfallInputs,
      },
      verification: 'EVENT_ANCHORED',
      basis: basis('§9.4', '消费路径二：减仓 / 平仓 / 清算（不用 totalCostAmount，走分步瀑布）'),
      note: 'LP 只在净收取方向出钱；净支付 funding 记 FUNDING_FEE_TYPE 账本，不进 LP',
    }));
    rows.push(conservationRow({ id: 'ledger.conservation', packId: P, view: ex, basis: basis('§5.4', '减仓支付瀑布与输出'), note: '五方 ERC20/vault 余额 Δ 之和恒 0；DataStore claimable 只记账不计入' }));

    return rows;
  },
};

// ── 可信 CheckPlan ───────────────────────────────────────────────────────────

export interface MarketClosePlanOptions {
  readonly id: string;
  readonly version: string;
  /** 开仓两腿的 purpose；缺省 setup（平仓为主测对象）。 */
  readonly openPurpose?: 'setup' | 'primary';
  /** 平仓两腿的 purpose；缺省 primary。 */
  readonly closePurpose?: 'primary' | 'cleanup';
  /**
   * 同时挂 market-open.core / market-open.cleanup / fee.claimable。这三个包按固定编号 TX1~TX4 取动作且把 TX1/TX2 固定为
   * primary、TX3/TX4 固定为 cleanup，只适用于旧 runMarketFlow 适配出的证据；原生 Scenario 证据的 actionId 形如 A01-…，不能挂。
   */
  readonly includeOpenPacks?: boolean;
  readonly oracleSupport?: {
    readonly actors: readonly [Address, ...Address[]];
    readonly targets: readonly [Address, ...Address[]];
  };
}

/** Market 开仓 → Market 减仓/全平；平仓腿为核对主体。 */
export function createMarketClosePlan(options: MarketClosePlanOptions): CheckPlan {
  const openPurpose = options.openPurpose ?? 'setup';
  const closePurpose = options.closePurpose ?? 'primary';
  const submitTransactions = {
    rules: [{ id: 'order-submission', roles: ['trader'] as const, min: 1, max: 1, anchor: 'order-submission' as const }],
  };
  const executionTransactions = {
    rules: [
      { id: 'terminal-execution', roles: ['keeper', 'service'] as const, min: 1, max: 1, anchor: 'terminal-execution' as const },
      ...(options.oracleSupport ? [{
        id: 'oracle-support', roles: ['oracle'] as const, min: 0, max: 1, anchor: 'oracle-ref' as const,
        actors: options.oracleSupport.actors, targets: options.oracleSupport.targets,
      }] : []),
    ],
  };
  const executionCapabilities = ['transaction', 'order-events', 'keeper', 'parameters', 'oracle', 'ledger', 'fee', 'position-state'] as const;
  return {
    id: options.id,
    version: options.version,
    flowType: 'roundtrip',
    actions: [
      { type: 'submitMarketIncrease', purpose: openPurpose, outcomes: ['SUBMITTED'], transactions: submitTransactions, requiredCapabilities: ['transaction', 'order-events'] },
      { type: 'executeOrder', purpose: openPurpose, outcomes: ['EXECUTED'], transactions: executionTransactions, requiredCapabilities: [...executionCapabilities] },
      { type: 'submitMarketDecrease', purpose: closePurpose, outcomes: ['SUBMITTED'], transactions: submitTransactions, requiredCapabilities: ['transaction', 'order-events', 'position-state'] },
      { type: 'executeOrder', purpose: closePurpose, outcomes: ['EXECUTED'], transactions: executionTransactions, requiredCapabilities: [...executionCapabilities] },
    ],
    packs: options.includeOpenPacks
      ? [marketOpenCorePack, marketOpenCleanupPack, feeClaimablePack, marketClosePack]
      : [marketClosePack],
  };
}

/** 平仓为主测对象：开仓 setup、减仓/全平 primary；按动作类型定位，兼容原生 Scenario 的 A01-… 编号。 */
export const marketCloseRoundtripPlan: CheckPlan = createMarketClosePlan({ id: 'market-close.roundtrip', version: '1' });

/** 与 market-open.roundtrip@2 同形（primary/primary/cleanup/cleanup），在开仓核对之上追加平仓核对包；可直接回放既有 roundtrip 证据。 */
export const marketCloseCleanupRoundtripPlan: CheckPlan = createMarketClosePlan({
  id: 'market-close.cleanup-roundtrip', version: '1', openPurpose: 'primary', closePurpose: 'cleanup', includeOpenPacks: true,
});

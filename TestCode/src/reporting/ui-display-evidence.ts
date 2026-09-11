import type { ScenarioResult } from './schema.js';

type Reconciliation = NonNullable<ScenarioResult['executionEvidence']>['reconciliations'][number];
type JsonRecord = Record<string, unknown>;

/**
 * "前端显示（平仓弹窗）"核对分组（docs/07 Phase 1-D 三方核对）。
 *
 * 数据来源=前端：Before 为页面显示值（Playwright 在全平前停点采集，链上静止），After 为链上事实
 * （实收 USDC / PositionFeesCollected / PositionDecrease / 执行价）。
 * 分层原则（docs/06 §8）：UI 层偏差不拉低协议 executionStatus——本组行只产 PASS / CALCULATED / NOT_VERIFIED；
 * 超显示级容差记 CALCULATED 并在 note 里写 "UI-DEVIATION"，看板可按 dataSource=前端 筛出。
 * 容差 = 显示位数的半个最小单位（如 2 位 → ±0.005）+ 1 微单位（内部按 1e6 定点，无浮点）。
 */
export interface UiDisplayRowsInput {
  readonly uiDisplay: JsonRecord | undefined;
  readonly closeCreateTx: string;
  /** deltas.executeClose.traderUsdc（USDC 1e6，正数=入账） */
  readonly actualReceiveUsdcRaw: bigint | undefined;
  /** close feesCollected.uint.positionFeeAmount（USDC 1e6） */
  readonly closeFeeAmountRaw: bigint | undefined;
  /** close feesCollected.uint['collateralTokenPrice.min']（1e24 USD/USDC 最小单位） */
  readonly collateralMinPriceRaw: bigint | undefined;
  /** close PositionDecrease.int.basePnlUsd（1e30 USD，signed） */
  readonly basePnlUsdRaw: bigint | undefined;
  /** close PositionDecrease.uint.executionPrice（1e30/10^indexDecimals，18 位 index → 1e12） */
  readonly executionPriceRaw: bigint | undefined;
  readonly indexDecimals: number;
}

const MICRO = 1_000_000n; // 内部定点：1e6
const BASIS = { title: '前端显示值核对（Phase 1-D 三方核对）', sourcePath: 'docs/07-前端显示值核对与testid契约.md', section: '附录一 显示口径速查 / 附录三 分阶段计划' } as const;

interface ParsedDisplay { readonly micro: bigint; readonly decimals: number; readonly text: string }

/** '14.66 USDC' / '-$0.02' / '+$4.69(+47.04%)' / '$2,648.69' → 1e6 定点 + 显示位数 */
export function parseDisplayedAmount(text: string | null | undefined): ParsedDisplay | undefined {
  if (!text) return undefined;
  const cleaned = text.replace(/,/g, '').replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^([+-])?\$?\s*(\d+)(?:\.(\d+))?/);
  if (!match) return undefined;
  const sign = match[1] === '-' ? -1n : 1n;
  const whole = BigInt(match[2]!);
  const fraction = (match[3] ?? '');
  const decimals = fraction.length;
  const fractionMicro = BigInt((fraction + '000000').slice(0, 6));
  return { micro: sign * (whole * MICRO + fractionMicro), decimals, text: cleaned };
}

function microToString(value: bigint, decimals = 6): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / MICRO;
  const fraction = (absolute % MICRO).toString().padStart(6, '0').slice(0, decimals).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

function toleranceMicro(displayDecimals: number): bigint {
  // 半个最小显示单位 + 1 微单位：2 位 → 5000+1；0 位 → 500000+1
  const unit = 10n ** BigInt(Math.max(0, 6 - displayDecimals));
  return unit / 2n + 1n;
}

function findField(list: unknown, field: string): JsonRecord | undefined {
  if (!Array.isArray(list)) return undefined;
  const hit = list.find((item) => item && typeof item === 'object' && (item as JsonRecord).field === field);
  return hit ? (hit as JsonRecord) : undefined;
}

function displayedOf(list: unknown, field: string): { text: string | null; locatedBy: string } {
  const hit = findField(list, field);
  return { text: typeof hit?.displayed === 'string' ? hit.displayed : null, locatedBy: typeof hit?.locatedBy === 'string' ? hit.locatedBy : 'none' };
}

interface CompareSpec {
  readonly id: string;
  readonly label: string;
  readonly field: string;
  readonly actualMicro: bigint | undefined;
  readonly actualLabel: string;
  readonly actualSource: string;
  readonly formula: string;
  readonly unit: string;
  readonly inputs: ReadonlyArray<{ name: string; value: string; source: string }>;
  /** 显示值取绝对值比较（如 Fee 显示为 -$0.02，链上金额为正） */
  readonly compareAbs?: boolean;
  readonly extraNote?: string;
}

function compareRow(group: string, txStep: string, ui: JsonRecord, spec: CompareSpec, priceBasisNote: string): Reconciliation {
  const { text, locatedBy } = displayedOf(ui.closeDialog, spec.field);
  const parsed = parseDisplayedAmount(text);
  const common = {
    id: spec.id, group, label: spec.label, txStep, unit: spec.unit, basis: BASIS,
    dataSource: '前端' as const, formula: spec.formula,
    inputs: [
      { name: `${spec.field}（前端显示原文）`, value: text ?? '（未采到）', source: `ClosePositionDialog · 定位方式=${locatedBy}（testid 落地前为 label fallback）` },
      ...spec.inputs,
    ],
  };
  if (!parsed) {
    return { ...common, status: 'NOT_VERIFIED', verification: '缺数据', before: text ?? '（未采到）', after: spec.actualMicro === undefined ? '（缺链上值）' : `${microToString(spec.actualMicro)} ${spec.unit}`, expected: '需要可解析的前端显示值', note: `前端字段未采到或无法解析（${locatedBy}）。${priceBasisNote}` };
  }
  if (spec.actualMicro === undefined) {
    return { ...common, status: 'NOT_VERIFIED', verification: '缺数据', before: `${parsed.text}`, after: '（缺链上值）', expected: '需要链上对照值', note: `${spec.actualLabel} 缺失，无法对照。${priceBasisNote}` };
  }
  const displayedMicro = spec.compareAbs ? (parsed.micro < 0n ? -parsed.micro : parsed.micro) : parsed.micro;
  const actualAbs = spec.compareAbs ? (spec.actualMicro < 0n ? -spec.actualMicro : spec.actualMicro) : spec.actualMicro;
  const diff = actualAbs - displayedMicro;
  const tolerance = toleranceMicro(parsed.decimals);
  const within = (diff < 0n ? -diff : diff) <= tolerance;
  const verdictNote = within
    ? `UI-OK：|Δ|=${microToString(diff < 0n ? -diff : diff)} ≤ 显示级容差 ${microToString(tolerance)}（显示 ${parsed.decimals} 位）。`
    : `UI-DEVIATION：|Δ|=${microToString(diff < 0n ? -diff : diff)} > 显示级容差 ${microToString(tolerance)}（显示 ${parsed.decimals} 位）——记 UI 层偏差，不影响协议 PASS（docs/06 §8 分层）。`;
  return {
    ...common,
    status: within ? 'PASS' : 'CALCULATED',
    verification: '事件对照',
    before: `前端 ${parsed.text}`,
    after: `${spec.actualLabel} ${microToString(actualAbs)} ${spec.unit}`,
    delta: `${diff >= 0n ? '+' : ''}${microToString(diff)} ${spec.unit}（链上 − 前端）`,
    expected: `|链上 − 前端| ≤ ${microToString(tolerance)} ${spec.unit}`,
    note: `${verdictNote}${spec.extraNote ? ` ${spec.extraNote}` : ''} ${priceBasisNote}`.trim(),
  };
}

export function buildUiDisplayRows(input: UiDisplayRowsInput): Reconciliation[] {
  const ui = input.uiDisplay;
  const group = `${input.closeCreateTx} · 前端显示 · 平仓弹窗预览（Max 全平）`;
  const txStep = input.closeCreateTx;
  if (!ui) return [];
  if (ui.collected !== true) {
    return [{
      id: 'ui-close-dialog-not-collected', group, label: '前端显示值采集', status: 'NOT_VERIFIED', verification: '缺数据', dataSource: '前端',
      before: '（未采到）', after: '（未采到）', expected: '停点打开平仓弹窗并采到 Est.Receive / Fee / Est.P&L', txStep, basis: BASIS,
      formula: 'beforeClose 停点：持仓行 → Close → Max → 采集（src/ui/close-dialog-collector.ts）',
      note: `采集阶段=${String(ui.stage ?? '?')}；错误=${String(ui.error ?? '未知')}。前置：本地前端接 fork（frontend-fork-patch）、专用 trader、E2E_UI_COLLECT=true。`,
    }];
  }
  const priceBasis = Array.isArray(ui.priceBasis) ? (ui.priceBasis as JsonRecord[]).map((p) => `${String(p.symbol)} min ${String(p.minUsd)} / max ${String(p.maxUsd)}@${String(p.block)}`).join('；') : '';
  const priceBasisNote = priceBasis ? `【采集价基】${priceBasis}。` : '';

  // 链上对照值 → 1e6 定点
  const feeUsdMicro = input.closeFeeAmountRaw !== undefined && input.collateralMinPriceRaw !== undefined
    ? (input.closeFeeAmountRaw * input.collateralMinPriceRaw) / (10n ** 24n) // USDC1e6 × (1e24 USD/USDC最小单位) / 1e24 = USD 1e6
    : undefined;
  const pnlMicro = input.basePnlUsdRaw !== undefined ? input.basePnlUsdRaw / (10n ** 24n) : undefined; // 1e30 → 1e6
  const execPriceMicro = input.executionPriceRaw !== undefined
    ? (input.executionPriceRaw * (10n ** BigInt(input.indexDecimals))) / (10n ** 24n) // internal(1e30/10^dec) → USD 1e6
    : undefined;

  const rows: Reconciliation[] = [
    compareRow(group, txStep, ui, {
      id: 'ui-close-est-receive', field: 'estReceive', label: 'Est. Receive（前端预览）vs 全平实收 USDC（ΔTrader@executeClose）', unit: 'USDC',
      actualMicro: input.actualReceiveUsdcRaw, actualLabel: '链上实收', actualSource: 'deltas.executeClose.traderUsdc',
      formula: 'UI Est.Receive（Max 全平预览，receiveTokenAmount 优先，含 pending funding/borrowing 与点差执行价）vs 链上 ΔTrader USDC（Keeper 执行全平后账户入账）',
      inputs: [{ name: 'ΔTrader USDC（executeClose，1e6）', value: input.actualReceiveUsdcRaw?.toString() ?? '—', source: 'ledger deltas.executeClose.traderUsdc' }],
      extraNote: '预览与实收的系统性小偏差候选原因：预览到执行之间的 funding/borrowing 累计、receiveTokenAmount 折算价基（collateral minPrice）与合约瀑布口径差异——data-raw 契约落地后可逐位定位。',
    }, priceBasisNote),
    compareRow(group, txStep, ui, {
      id: 'ui-close-fee', field: 'closeFee', label: 'Fee（前端预览）vs 事件 positionFeeAmount × collateralTokenPrice.min', unit: 'USD', compareAbs: true,
      actualMicro: feeUsdMicro, actualLabel: '链上 Fee', actualSource: 'PositionFeesCollected.positionFeeAmount × collateralTokenPrice.min',
      formula: 'UI Fee = sizeDeltaUsd × positionFeeFactor（USD，SDK estimatedPositionFeeCost）；链上 = positionFeeAmount(USDC) × collateralTokenPrice.min → USD',
      inputs: [
        { name: 'positionFeeAmount（USDC 1e6）', value: input.closeFeeAmountRaw?.toString() ?? '—', source: 'close PositionFeesCollected 事件' },
        { name: 'collateralTokenPrice.min（1e24）', value: input.collateralMinPriceRaw?.toString() ?? '—', source: 'close PositionFeesCollected 事件' },
      ],
      extraNote: '费率档由 balanceWasImproved 决定（多/空可能落不同档）；前端 USD 与链上 USDC×min 价的换算差 ≤0.1%。',
    }, priceBasisNote),
    compareRow(group, txStep, ui, {
      id: 'ui-close-est-pnl', field: 'estPnl', label: 'Est. P&L（前端预览）vs 事件 basePnlUsd', unit: 'USD',
      actualMicro: pnlMicro, actualLabel: '链上 basePnlUsd', actualSource: 'PositionDecrease.int.basePnlUsd',
      formula: 'UI Est.P&L = closedTokens × (预览执行价 − 开仓价)（含动态点差，不含滑点）；链上 = PositionDecrease.basePnlUsd（Cap 后）/1e30',
      inputs: [{ name: 'basePnlUsd（1e30）', value: input.basePnlUsdRaw?.toString() ?? '—', source: 'close PositionDecrease 事件 int 字段' }],
    }, priceBasisNote),
    compareRow(group, txStep, ui, {
      id: 'ui-close-exec-price', field: 'execPrice', label: 'Est. execution price（前端预览）vs 事件 executionPrice', unit: 'USD/token',
      actualMicro: execPriceMicro, actualLabel: '链上执行价', actualSource: 'PositionDecrease.uint.executionPrice',
      formula: 'UI 执行价 = getExecutionPriceForDecrease 模拟（oracle ± 动态点差）；链上 = PositionDecrease.executionPrice（1e30/10^indexDecimals）',
      inputs: [{ name: 'executionPrice（internal）', value: input.executionPriceRaw?.toString() ?? '—', source: 'close PositionDecrease 事件 uint 字段' }],
    }, priceBasisNote),
  ];

  // 持仓行原文（派生展示：testid 落地前无字段级对照，先留证据）
  const cells = Array.isArray(ui.positionRowCells) ? (ui.positionRowCells as unknown[]).map(String) : [];
  rows.push({
    id: 'ui-position-row', group: `${input.closeCreateTx} · 前端显示 · 持仓行`, label: '停点持仓行（Coin/方向/Size/Value/Entry/Oracle/PnL/Liq/Margin/NetValue/Funding）',
    status: 'CALCULATED', verification: '派生展示', dataSource: '前端', txStep, basis: BASIS,
    before: cells.length > 0 ? cells.slice(0, -1).map((c) => c.replace(/\s+/g, ' ')).join(' | ') : (typeof ui.positionRowText === 'string' ? ui.positionRowText : '（未采到）'),
    after: '（字段级对照待 testid/data-raw 契约落地，docs/07 需求 A/B）', expected: '持仓行字段 = 链上仓位/价格派生（附录一口径）',
    formula: 'Positions 表格行 innerText（桌面 tr），按 \\t 切分单元格',
    note: `采集块 ${String(ui.collectedAtBlock ?? '?')}；耗时 ${String(ui.durationMs ?? '?')}ms。${priceBasisNote}`,
  });
  return rows;
}

/**
 * "前端下单（页面点击 + 注入钱包签名）"分组（docs/07 附录四 §6）：仅当 runner 的 orderEntry 钩子接管了市价腿时出现。
 * Before = 用例意图 / 停点仓位，After = 页面实际提交并上链的 OrderCreated 参数；页面提交值与意图的微差不拉低协议状态
 * （对账层已按实际参数推导），只在 note 标注。
 */
export interface UiOrderEntryRowsInput {
  readonly uiOrderEntry: JsonRecord | undefined;
  readonly testData: JsonRecord;
  readonly openCreateTx: string;
  readonly closeCreateTx: string;
  /** 停点仓位 sizeInUsd（全平腿对照，1e30） */
  readonly closeSizeUsdRaw: bigint | undefined;
}

const ORDER_BASIS = { title: '前端下单核对（页面点击 · 注入钱包 Node 侧签名）', sourcePath: 'docs/07-前端显示值核对与testid契约.md', section: '附录四 §6 Phase 2 进展 / src/ui/order-entry.ts' } as const;
// FX100 Order.OrderType（tools/fx100-legacy/tool/onchain-tx/lib/flows.mjs ORDER_TYPE；与 GMX 不同，无 swap 类型）
const ORDER_TYPE_LABEL: Record<string, string> = { '0': 'MarketIncrease', '1': 'LimitIncrease', '2': 'MarketDecrease', '3': 'LimitDecrease', '4': 'StopLossDecrease', '5': 'Liquidation', '6': 'StopIncrease' };

function legRows(leg: 'open' | 'close', entry: JsonRecord, txStep: string, input: UiOrderEntryRowsInput): Reconciliation[] {
  const order = entry.order && typeof entry.order === 'object' ? (entry.order as JsonRecord) : {};
  const detail = entry.detail && typeof entry.detail === 'object' ? (entry.detail as JsonRecord) : {};
  const group = `${txStep} · 前端下单 · ${leg === 'open' ? '开仓表单' : '平仓弹窗 Confirm Close'}`;
  const txHash = String(entry.txHash ?? '');
  const orderKey = String(entry.orderKey ?? '');
  const sizeRaw = BigInt(String(order.sizeDeltaUsd ?? '0'));
  const collateralRaw = BigInt(String(order.initialCollateralDeltaAmount ?? '0'));
  const orderType = String(order.orderType ?? '');
  const form = detail.form && typeof detail.form === 'object' ? (detail.form as JsonRecord) : {};
  const shots = Array.isArray(detail.screenshots) ? detail.screenshots.length : 0;
  const rows: Reconciliation[] = [{
    id: `ui-order-${leg}-tx`, group, txStep, dataSource: '前端', status: 'CALCULATED', verification: '派生展示',
    label: leg === 'open' ? '页面开仓交易（Standard 模式，eth_sendTransaction → Node 侧私钥签名）' : '页面全平交易（持仓行 Close Position → Max → Confirm Close）',
    before: leg === 'open'
      ? `表单：${String(form.side ?? '—')} · Size ${String(form.sizeInput ?? '—')} ${String(form.sizeUnit ?? '')} · 杠杆 ${String(form.leverageInput ?? '—')}`
      : `弹窗：Max 全平（停点仓位 sizeInUsd=${input.closeSizeUsdRaw?.toString() ?? '—'}）`,
    after: `tx ${txHash} · block ${String(entry.blockNumber ?? '—')} · orderKey ${orderKey}`,
    expected: '页面发出的交易恰好产生 1 条 OrderCreated，由 runner 接管后续 Keeper 执行与对账',
    formula: 'driveOpen/CloseOrderOnPage → signing-wallet.exposeBinding(eth_sendTransaction) → eth_call 预执行 → viem 私钥签名广播 → OrderCreated 解析',
    basis: ORDER_BASIS, unit: '—',
    note: `orderType=${orderType}（${ORDER_TYPE_LABEL[orderType] ?? '?'}）；acceptablePrice=${String(order.acceptablePrice ?? '—')}；executionFee=${String(order.executionFee ?? '—')} wei；阶段截图 ${shots} 张；耗时 ${String(detail.durationMs ?? '?')}ms。`,
  }];
  if (leg === 'open') {
    const intent = form.intent && typeof form.intent === 'object' ? (form.intent as JsonRecord) : {};
    const intentSize = BigInt(String(intent.sizeUsd ?? input.testData.sizeUsd ?? '50').split('.')[0] ?? '50') * 10n ** 30n;
    const intentCollateral = BigInt(String(intent.collateralUsdc ?? '10').split('.')[0] ?? '10') * 10n ** 6n;
    const sizeOk = sizeRaw === intentSize;
    const colOk = collateralRaw === intentCollateral;
    rows.push({
      id: 'ui-order-open-size', group, txStep, dataSource: '前端', status: sizeOk ? 'PASS' : 'CALCULATED', verification: '事件对照',
      label: '页面提交 sizeDeltaUsd vs 用例意图 Size（USD）',
      before: `意图 ${intentSize} (1e30)`, after: `OrderCreated.sizeDeltaUsd ${sizeRaw}`, expected: `= ${intentSize}`,
      delta: `${sizeRaw - intentSize >= 0n ? '+' : ''}${(sizeRaw - intentSize).toString()}`,
      formula: 'Size 单位切 USD 后填入意图值；FE-W3：USD 模式提交 sizeDeltaUsd = 输入值（resolveSubmittedSizeDeltaUsd）',
      basis: ORDER_BASIS, unit: 'USD 1e30',
      note: sizeOk ? '页面提交与意图一致。' : '页面提交与意图不一致：对账层已按实际 sizeDeltaUsd 推导期望值（testData.sizeUsd 取自 OrderCreated），此处仅记录偏差。',
    });
    rows.push({
      id: 'ui-order-open-collateral', group, txStep, dataSource: '前端', status: colOk ? 'PASS' : 'CALCULATED', verification: '事件对照',
      label: '页面提交 initialCollateralDeltaAmount vs 意图抵押（Size ÷ 杠杆）',
      before: `意图 ${intentCollateral} (USDC 1e6)`, after: `OrderCreated.initialCollateralDeltaAmount ${collateralRaw}`, expected: `= ${intentCollateral}`,
      delta: `${collateralRaw - intentCollateral >= 0n ? '+' : ''}${(collateralRaw - intentCollateral).toString()}`,
      formula: '前端按 Size / 杠杆换算抵押（可能含费用预留与取整）；链上以提交值为准',
      basis: ORDER_BASIS, unit: 'USDC 1e6',
      note: colOk ? '页面提交与意图一致。' : '页面换算的抵押与意图不同（前端口径，如费用预留/取整）；对账层已按实际 initialCollateralDeltaAmount 推导。',
    });
  } else if (input.closeSizeUsdRaw !== undefined) {
    const ok = sizeRaw === input.closeSizeUsdRaw;
    rows.push({
      id: 'ui-order-close-size', group, txStep, dataSource: '前端', status: ok ? 'PASS' : 'CALCULATED', verification: '事件对照',
      label: '页面 Max 全平提交 sizeDeltaUsd vs 停点仓位 sizeInUsd',
      before: `仓位 ${input.closeSizeUsdRaw}`, after: `OrderCreated.sizeDeltaUsd ${sizeRaw}`, expected: `= ${input.closeSizeUsdRaw}`,
      delta: `${sizeRaw - input.closeSizeUsdRaw >= 0n ? '+' : ''}${(sizeRaw - input.closeSizeUsdRaw).toString()}`,
      formula: 'ClosePositionDialog Max → isFullClose → sizeDeltaUsd = 仓位 sizeInUsdExact',
      basis: ORDER_BASIS, unit: 'USD 1e30',
      note: ok ? 'Max 全平提交值等于停点仓位规模。' : 'Max 全平提交值与停点仓位不同（前端口径）；合约按 USD 减仓 ceil 归一规则处理。',
    });
  }
  return rows;
}

export function buildUiOrderEntryRows(input: UiOrderEntryRowsInput): Reconciliation[] {
  const ui = input.uiOrderEntry;
  if (!ui) return [];
  const rows: Reconciliation[] = [];
  if (ui.open && typeof ui.open === 'object') rows.push(...legRows('open', ui.open as JsonRecord, input.openCreateTx, input));
  if (ui.close && typeof ui.close === 'object') rows.push(...legRows('close', ui.close as JsonRecord, input.closeCreateTx, input));
  return rows;
}

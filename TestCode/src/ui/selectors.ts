import type { Locator, Page } from '@playwright/test';

/**
 * 前端显示值采集的防腐层（docs/07-前端显示值核对与testid契约.md 需求 A/B）。
 *
 * 契约：前端为值节点提供 data-testid + data-raw/data-raw-scale；在 testid 落地前，
 * fallback 按英文文案行结构定位（label span 与值 span 同一 flex 行）——仅限
 * 过渡期使用，且要求页面语言为 en。testid 落地后只改本文件，采集器与用例不动。
 */

export type RawScale = 'usd' | 'token' | 'price' | 'bps' | 'pct';

export interface DisplayFieldSpec {
  /** 契约 testid（docs/07 需求 A 清单） */
  readonly testId: string;
  /** 过渡期 fallback：值节点相对英文 label 的定位（前缀匹配）；null = 无文案锚点，必须等 testid */
  readonly fallbackLabelEn: string | null;
  /** 可选：label 的正则源码（优先于 fallbackLabelEn 的前缀匹配），如 '^(Max|Min) acceptable' */
  readonly fallbackLabelPattern?: string;
  /** data-raw-scale 期望值；显示级解析同样按此选择解析器 */
  readonly scale: RawScale;
}

/** 平仓弹窗（ClosePositionDialog）——SCN-022 Phase 1 的三个核心字段在此 */
export const CLOSE_DIALOG_FIELDS = {
  estReceive: { testId: 'close-est-receive', fallbackLabelEn: 'Est. Receive', scale: 'token' },
  closeFee: { testId: 'close-fee', fallbackLabelEn: 'Fee', scale: 'usd' },
  estPnl: { testId: 'close-est-pnl', fallbackLabelEn: 'Est. P&L', scale: 'usd' },
  execPrice: { testId: 'close-exec-price', fallbackLabelEn: 'Est. execution price', scale: 'price' },
  acceptablePrice: { testId: 'close-acceptable-price', fallbackLabelEn: 'acceptable', fallbackLabelPattern: '^(Max|Min) acceptable', scale: 'price' },
} as const satisfies Record<string, DisplayFieldSpec>;

/** 持仓列表行（Positions 桌面表格/移动卡片同 testid，采集时 filter visible） */
export const POSITION_ROW_FIELDS = {
  pnl: { testId: 'pos-pnl', fallbackLabelEn: null, scale: 'usd' },
  pnlPercent: { testId: 'pos-pnl-percent', fallbackLabelEn: null, scale: 'bps' },
  netValue: { testId: 'pos-net-value', fallbackLabelEn: null, scale: 'usd' },
  margin: { testId: 'pos-margin', fallbackLabelEn: null, scale: 'usd' },
  entryPrice: { testId: 'pos-entry-price', fallbackLabelEn: null, scale: 'price' },
  liqPrice: { testId: 'pos-liq-price', fallbackLabelEn: null, scale: 'price' },
  size: { testId: 'pos-size', fallbackLabelEn: null, scale: 'token' },
} as const satisfies Record<string, DisplayFieldSpec>;

/** 保证金弹窗（PositionMarginDialog） */
export const MARGIN_DIALOG_FIELDS = {
  currentMargin: { testId: 'margin-current', fallbackLabelEn: 'Current Margin', scale: 'usd' },
  fundingNet: { testId: 'margin-funding-net', fallbackLabelEn: 'Pending funding (net)', scale: 'usd' },
  equity: { testId: 'margin-equity', fallbackLabelEn: 'Equity (after PnL & funding)', scale: 'usd' },
  newMargin: { testId: 'margin-new', fallbackLabelEn: 'New Margin', scale: 'usd' },
  estLiq: { testId: 'margin-est-liq', fallbackLabelEn: 'Est. Liq. Price', scale: 'price' },
} as const satisfies Record<string, DisplayFieldSpec>;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 解析字段的值节点。优先 testid；未命中且有文案锚点时走 fallback：
 * 前端预览行结构为 `<div class="flex justify-between"><span>label</span><span>value</span></div>`，
 * 用 `div:has(> span:text-matches(^label))` 命中**最内层**行容器（避免 hasText 命中外层祖先），
 * 再取该行直接子 span 的最后一个。仅在页面语言为 en 时有效。
 */
export function locateDisplayValue(scope: Page | Locator, spec: DisplayFieldSpec): Locator {
  const byTestId = scope.getByTestId(spec.testId);
  if (spec.fallbackLabelEn === null) return byTestId;
  const labelPattern = spec.fallbackLabelPattern ?? `^${escapeRegExp(spec.fallbackLabelEn)}`;
  const byLabel = scope
    .locator(`div:has(> span:text-matches("${labelPattern}"))`)
    .first()
    .locator(':scope > span')
    .last();
  return byTestId.or(byLabel);
}

/** 采集结果：displayed 未采到为 null（附 error）；raw 仅在前端 data-raw 契约落地后出现 */
export interface CollectedDisplayValue {
  readonly field: string;
  readonly testId: string;
  readonly displayed: string | null;
  readonly raw: string | null;
  readonly rawScale: string | null;
  readonly locatedBy: 'testid' | 'label' | 'none';
  readonly error?: string;
}

/** 逐字段采集；单字段失败不影响其他字段（缺行/文案变化只记录 error） */
export async function collectDisplayValues(
  scope: Page | Locator,
  fields: Record<string, DisplayFieldSpec>,
  perFieldTimeoutMs = 3_000,
): Promise<CollectedDisplayValue[]> {
  const collected: CollectedDisplayValue[] = [];
  for (const [field, spec] of Object.entries(fields)) {
    const byTestId = scope.getByTestId(spec.testId).filter({ visible: true }).first();
    let locatedBy: CollectedDisplayValue['locatedBy'] = 'none';
    let node: Locator | undefined;
    if (await byTestId.count() > 0) { node = byTestId; locatedBy = 'testid'; }
    else if (spec.fallbackLabelEn !== null) {
      const byLabel = locateDisplayValue(scope, spec).filter({ visible: true }).first();
      if (await byLabel.count() > 0) { node = byLabel; locatedBy = 'label'; }
    }
    if (!node) {
      collected.push({ field, testId: spec.testId, displayed: null, raw: null, rawScale: null, locatedBy, error: 'not found' });
      continue;
    }
    try {
      collected.push({
        field,
        testId: spec.testId,
        displayed: (await node.innerText({ timeout: perFieldTimeoutMs })).trim(),
        raw: await node.getAttribute('data-raw', { timeout: perFieldTimeoutMs }),
        rawScale: await node.getAttribute('data-raw-scale', { timeout: perFieldTimeoutMs }),
        locatedBy,
      });
    } catch (error) {
      collected.push({ field, testId: spec.testId, displayed: null, raw: null, rawScale: null, locatedBy, error: error instanceof Error ? error.message.split('\n')[0]! : String(error) });
    }
  }
  return collected;
}

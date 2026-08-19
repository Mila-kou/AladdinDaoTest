import type { Page } from '@playwright/test';

import type { MarketFlowBeforeCloseContext } from '../scenarios/scn-009-runner.js';
import { openPositionsTab, openTradeSession, type TradeSession } from './frontend-session.js';
import type { ForkPriceToken } from './fork-price-feed.js';
import { CLOSE_DIALOG_FIELDS, POSITION_ROW_FIELDS, collectDisplayValues, type CollectedDisplayValue } from './selectors.js';

/**
 * 全平前停点的前端显示值采集（docs/07 Phase 1-D）：
 *   持仓行（Positions 页签）→ 点 Close → 弹窗内 Max（全平）→ 等预览稳定 → 采 Est. Receive / Fee / Est. P&L / 执行价 → Esc 关闭。
 * 只观测：不点 Confirm，不改链上状态。任何步骤失败都以 error 字段返回，由调用方决定是否阻断（runner 不阻断）。
 */
export interface CloseDialogCollectOptions {
  readonly appBaseUrl: string;
  readonly appChainId: number;
  /** 喂价代币（须与前端 SDK TOKENS 书写一致，见 frontend-fork-patch） */
  readonly tokens: readonly ForkPriceToken[];
  readonly marketSymbol: string;
  readonly indexSymbol: string;
  /** 已打开的会话可复用（矩阵多数据集共用一页） */
  readonly session?: TradeSession;
  readonly screenshotPath?: string;
  readonly rowWaitMs?: number;
  readonly previewWaitMs?: number;
}

export interface CloseDialogCollectResult {
  readonly collected: boolean;
  readonly error?: string;
  readonly stage: 'session' | 'position-row' | 'open-dialog' | 'max' | 'preview' | 'done';
  readonly positionRowText?: string;
  readonly positionRowCells?: readonly string[];
  readonly positionRowFields?: readonly CollectedDisplayValue[];
  readonly closeDialog?: readonly CollectedDisplayValue[];
  readonly dialogText?: string;
  readonly screenshotPath?: string;
  /** 采集时前端 tickers 用的链上价格（route 缓存中的最近一次读数） */
  readonly priceBasis?: ReadonlyArray<{ symbol: string; minUsd: string; maxUsd: string; block: string }>;
  readonly session: TradeSession;
}

export async function collectCloseDialogAtStopPoint(
  page: Page,
  context: MarketFlowBeforeCloseContext,
  options: CloseDialogCollectOptions,
): Promise<CloseDialogCollectResult> {
  let stage: CloseDialogCollectResult['stage'] = 'session';
  const session = options.session ?? await openTradeSession(page, {
    appBaseUrl: options.appBaseUrl,
    rpcUrl: context.rpcUrl,
    dataStore: context.dataStore,
    oracle: context.oracle,
    appChainId: options.appChainId,
    trader: context.trader,
    tokens: options.tokens,
    marketSymbol: options.marketSymbol,
  });
  const partial = (error: unknown, extra: Partial<CloseDialogCollectResult> = {}): CloseDialogCollectResult => ({
    collected: false,
    stage,
    error: error instanceof Error ? error.message.split('\n')[0]! : String(error),
    session,
    ...extra,
  });
  try {
    // 推价/中段阶段后价格已变：强制 tickers 重读，并让页面重新拉一次持仓
    session.refreshPrices();
    if (options.session) await page.reload({ waitUntil: 'domcontentloaded' });
    await openPositionsTab(page);

    // —— 持仓行（桌面表格 tr）：按 index symbol + 方向文本定位；testid 落地后改用 position-row[data-market][data-side]
    stage = 'position-row';
    const sideText = context.isLong ? 'Long' : 'Short';
    const rowByTestId = page.locator(`[data-testid="position-row"][data-market="${context.marketIndex}"][data-side="${sideText.toLowerCase()}"]`).first();
    // 注意：hasText 用 textContent（单元格无分隔拼接，如 "FXMOCK5.01xLong0.025…"），\b 词边界会失效 → 用子串匹配
    const rowByText = page.locator('tr', { hasText: options.indexSymbol }).filter({ hasText: sideText }).first();
    const deadline = Date.now() + (options.rowWaitMs ?? 45_000);
    let row = rowByTestId;
    let visible = false;
    while (Date.now() < deadline) {
      if (await rowByTestId.isVisible().catch(() => false)) { row = rowByTestId; visible = true; break; }
      if (await rowByText.isVisible().catch(() => false)) { row = rowByText; visible = true; break; }
      await page.waitForTimeout(1_500);
    }
    if (!visible) {
      const bodyText = await page.locator('body').innerText().catch(() => '');
      return partial(new Error(`持仓行未渲染（${options.indexSymbol} ${sideText}），等待 ${options.rowWaitMs ?? 45_000}ms`), { dialogText: bodyText });
    }
    const positionRowText = (await row.innerText()).trim();
    const positionRowCells = positionRowText.split('\t').map((c) => c.trim()).filter(Boolean);
    const positionRowFields = await collectDisplayValues(row, POSITION_ROW_FIELDS, 1_500);

    // —— 打开平仓弹窗
    stage = 'open-dialog';
    await row.getByRole('button', { name: 'Close', exact: true }).first().click();
    const dialog = page.getByRole('dialog').filter({ hasText: /close position/i }).first();
    await dialog.waitFor({ state: 'visible', timeout: 10_000 });

    // —— Max（全平）
    stage = 'max';
    const maxButton = dialog.getByRole('button', { name: /^max$/i }).first();
    await maxButton.waitFor({ state: 'visible', timeout: 10_000 });
    await maxButton.click();

    // —— 等预览稳定：Est. Receive 不再是 '0 USDC' 且连续两次读数一致
    stage = 'preview';
    const previewDeadline = Date.now() + (options.previewWaitMs ?? 20_000);
    let last: string | null = null;
    let stable = false;
    while (Date.now() < previewDeadline) {
      const [sample] = await collectDisplayValues(dialog, { estReceive: CLOSE_DIALOG_FIELDS.estReceive }, 1_500);
      const value = sample?.displayed ?? null;
      if (value && !/^0(\.0+)?\s/.test(value) && value === last) { stable = true; break; }
      last = value;
      await page.waitForTimeout(700);
    }
    const closeDialog = await collectDisplayValues(dialog, CLOSE_DIALOG_FIELDS, 2_000);
    const dialogText = (await dialog.innerText()).trim();
    let screenshotPath: string | undefined;
    if (options.screenshotPath) {
      await page.screenshot({ path: options.screenshotPath, fullPage: false });
      screenshotPath = options.screenshotPath;
    }
    // 关闭弹窗（不确认）
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);
    stage = 'done';
    const prices = session.routes.latest() ?? [];
    return {
      collected: true,
      stage,
      positionRowText,
      positionRowCells,
      positionRowFields,
      closeDialog,
      dialogText,
      ...(screenshotPath ? { screenshotPath } : {}),
      ...(stable ? {} : { error: 'Est. Receive 预览在等待窗口内未稳定（已按最后读数采集）' }),
      priceBasis: prices.map((p) => ({ symbol: p.symbol, minUsd: p.minUsd, maxUsd: p.maxUsd, block: p.blockNumber.toString() })),
      session,
    };
  } catch (error) {
    if (options.screenshotPath) await page.screenshot({ path: options.screenshotPath.replace(/\.png$/, '-error.png') }).catch(() => undefined);
    await page.keyboard.press('Escape').catch(() => undefined);
    return partial(error);
  }
}

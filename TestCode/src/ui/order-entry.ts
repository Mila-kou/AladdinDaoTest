import type { Page } from '@playwright/test';

import type { MarketFlowOrderEntryContext, MarketFlowOrderEntryResult } from '../scenarios/scn-009-runner.js';
import { openPositionsTab, type TradeSession } from './frontend-session.js';
import type { SentUiTransaction } from './signing-wallet.js';

/**
 * 页面下单驱动器（docs/07 附录四 §6「钱包签名走页面」）：在本地前端（接 fork）按 runner 给的意图点出同一笔订单，
 * 交易由注入的签名钱包在 Node 侧签名（见 signing-wallet.ts），这里只负责：
 *   开仓腿：Market 页签 → 方向 → Size 单位切 USD → 填 Size → 填杠杆 → 等 "Trade now" 可用 → 点击 → 等页面发给 ExchangeRouter 的交易上链；
 *   全平腿：Positions → 持仓行 "Close Position" → Max → "Confirm Close" → 等交易上链。
 * 表单定位与 fx100-apps e2e/smoke/open-and-close.spec.ts 同源（role/placeholder/aria-label，文案 en）。
 * 每个阶段截图（`<base>-<stage>.png`）随 detail 返回，由钩子附到用例。
 */
export interface OrderEntryDriveOptions {
  readonly indexSymbol: string;
  /** 截图基名（.png）；缺省不截图 */
  readonly screenshotPath?: string;
  readonly txTimeoutMs?: number;
  readonly rowWaitMs?: number;
}

interface StageShot { readonly stage: string; readonly path: string }

function requireSigning(session: TradeSession) {
  if (!session.signing) throw new Error('页面下单需要 signing 会话（openTradeSession wallet.mode=signing）');
  return session.signing;
}

async function stageShots(page: Page, base: string | undefined) {
  const shots: StageShot[] = [];
  const snap = async (stage: string): Promise<void> => {
    if (!base) return;
    const path = base.replace(/\.png$/, `-${stage}.png`);
    try {
      await page.screenshot({ path, fullPage: false });
      shots.push({ stage, path });
    } catch {
      // 截图失败不影响下单
    }
  };
  return { shots, snap };
}

function describeTx(tx: SentUiTransaction): Record<string, unknown> {
  return {
    seq: tx.seq,
    requestedAt: tx.requestedAt,
    to: tx.to,
    value: tx.value,
    ...(tx.gas ? { gas: tx.gas } : {}),
    ...(tx.txHash ? { txHash: tx.txHash } : {}),
    ...(tx.blockNumber !== undefined ? { blockNumber: tx.blockNumber } : {}),
    ...(tx.status ? { status: tx.status } : {}),
    ...(tx.gasUsed ? { gasUsed: tx.gasUsed } : {}),
    ...(tx.simulated ? { simulatedReturn: tx.simulated } : {}),
    ...(tx.error ? { error: tx.error } : {}),
  };
}

/** 选中 Size 单位为 USD（Radix Select：trigger 是 combobox，选项 role=option） */
async function selectSizeUnitUsd(page: Page, sizeInput: ReturnType<Page['getByPlaceholder']>): Promise<string> {
  // Size 输入框右侧的单位 Select（同一 fx-terminal-field 容器内）
  const field = sizeInput.locator('xpath=ancestor::div[contains(@class,"fx-terminal-field")][1]');
  const trigger = field.getByRole('combobox').first();
  await trigger.waitFor({ state: 'visible', timeout: 10_000 });
  const current = (await trigger.innerText().catch(() => '')).trim();
  if (/usd/i.test(current)) return current;
  await trigger.click();
  // 选项可访问名含 TokenIcon（如 "S USD"），不能锚定整串；按包含 usd 且不含 token 过滤
  const option = page.getByRole('option').filter({ hasText: /usd/i }).filter({ hasNotText: /token/i }).first();
  await option.waitFor({ state: 'visible', timeout: 5_000 });
  await option.click();
  await page.waitForTimeout(200);
  return (await trigger.innerText().catch(() => '')).trim();
}

export async function driveOpenOrderOnPage(
  page: Page,
  session: TradeSession,
  context: MarketFlowOrderEntryContext,
  options: OrderEntryDriveOptions,
): Promise<MarketFlowOrderEntryResult> {
  const signing = requireSigning(session);
  const { shots, snap } = await stageShots(page, options.screenshotPath);
  const startedAt = Date.now();
  // 推价/上一数据集之后价格可能已变：强制 tickers 重读并刷新页面，清掉上一次的下单追踪弹窗
  session.refreshPrices();
  await page.reload({ waitUntil: 'domcontentloaded' });
  // 表单就绪：Market 页签 + 方向
  const marketTab = page.getByRole('button', { name: 'Market', exact: true }).first();
  await marketTab.waitFor({ state: 'visible', timeout: 30_000 });
  await marketTab.click();
  const sideButton = page.getByRole('button', { name: context.isLong ? 'Buy / Long' : 'Sell / Short' }).first();
  await sideButton.waitFor({ state: 'visible', timeout: 10_000 });
  await sideButton.click();
  // Size（USD）与杠杆
  const sizeInput = page.getByPlaceholder('Size').first();
  await sizeInput.waitFor({ state: 'visible', timeout: 10_000 });
  const unitAfter = await selectSizeUnitUsd(page, sizeInput);
  await sizeInput.click();
  await sizeInput.fill('');
  await sizeInput.fill(context.intent.sizeUsd);
  const leverageInput = page.getByRole('textbox', { name: 'Leverage' }).first();
  await leverageInput.waitFor({ state: 'visible', timeout: 10_000 });
  await leverageInput.click();
  await leverageInput.fill(String(context.intent.leverage));
  await leverageInput.press('Enter');
  await page.waitForTimeout(300);
  const leverageShown = (await leverageInput.inputValue().catch(() => '')).trim();
  const sizeShown = (await sizeInput.inputValue().catch(() => '')).trim();
  await snap('form-filled');
  // 提交按钮：表单就绪后文案为 "Open Long" / "Open Short"（未就绪时为 "Enter Amount"/校验文案且 disabled；
  // 右下 "Trade now" 是 Liquidation Protection 组件的按钮，不是提交）
  const submit = page.getByRole('button', { name: context.isLong ? /^open long$/i : /^open short$/i }).first();
  // 冷启动首屏市场/价格水合慢时按钮长期停留 "Enter Amount"/校验文案且 disabled——轮询到 45s
  const enabledDeadline = Date.now() + 45_000;
  while (Date.now() < enabledDeadline) {
    if (await submit.isVisible().catch(() => false) && await submit.isEnabled().catch(() => false)) break;
    await page.waitForTimeout(500);
  }
  if (!(await submit.isVisible().catch(() => false)) || !(await submit.isEnabled().catch(() => false))) {
    await snap('submit-disabled');
    const formText = await page.locator('form').first().innerText().catch(() => '');
    throw new Error(`页面开仓：Open ${context.isLong ? 'Long' : 'Short'} 按钮 45s 内未就绪；表单原文：${formText.replace(/\s+/g, ' ').slice(0, 400)}`);
  }
  const router = context.exchangeRouter.toLowerCase();
  const pending = signing.waitForNext((tx) => tx.to.toLowerCase() === router, options.txTimeoutMs ?? 120_000, 'ExchangeRouter 开仓交易');
  await submit.click();
  await snap('submitted');
  const tx = await pending;
  await snap('tx-confirmed');
  if (tx.error || !tx.txHash) throw new Error(`页面开仓交易失败：${tx.error ?? '无 txHash'}`);
  if (tx.status === 'reverted') throw new Error(`页面开仓交易回执 reverted：${tx.txHash}`);
  // 关掉下单追踪弹窗（若有），不影响链上
  await page.keyboard.press('Escape').catch(() => undefined);
  return {
    txHash: tx.txHash,
    detail: {
      leg: 'open',
      form: { side: context.isLong ? 'Buy / Long' : 'Sell / Short', sizeUnit: unitAfter, sizeInput: sizeShown, leverageInput: leverageShown, intent: context.intent },
      pageTransactions: signing.sent.map(describeTx),
      orderTransaction: describeTx(tx),
      screenshots: shots,
      durationMs: Date.now() - startedAt,
      driver: 'order-entry/2026-08-23',
    },
  };
}

export async function driveCloseOrderOnPage(
  page: Page,
  session: TradeSession,
  context: MarketFlowOrderEntryContext,
  options: OrderEntryDriveOptions,
): Promise<MarketFlowOrderEntryResult> {
  const signing = requireSigning(session);
  const { shots, snap } = await stageShots(page, options.screenshotPath);
  const startedAt = Date.now();
  session.refreshPrices();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openPositionsTab(page);
  const sideText = context.isLong ? 'Long' : 'Short';
  const rowByTestId = page.locator(`[data-testid="position-row"][data-market="${context.marketIndex}"][data-side="${sideText.toLowerCase()}"]`).first();
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
    await snap('position-row-missing');
    throw new Error(`页面全平：持仓行未渲染（${options.indexSymbol} ${sideText}）`);
  }
  await snap('position-row');
  await row.getByRole('button', { name: /^close( position)?$/i }).first().click();
  const dialog = page.getByRole('dialog').filter({ hasText: /close position/i }).first();
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });
  const maxButton = dialog.getByRole('button', { name: /^max$/i }).first();
  await maxButton.waitFor({ state: 'visible', timeout: 10_000 });
  await maxButton.click();
  const confirm = dialog.getByRole('button', { name: /^confirm close$/i }).first();
  await confirm.waitFor({ state: 'visible', timeout: 10_000 });
  const enabledDeadline = Date.now() + 20_000;
  while (Date.now() < enabledDeadline && !(await confirm.isEnabled().catch(() => false))) await page.waitForTimeout(300);
  const dialogText = (await dialog.innerText().catch(() => '')).trim();
  await snap('dialog-max');
  if (!(await confirm.isEnabled().catch(() => false))) {
    throw new Error(`页面全平：Confirm Close 按钮 20s 内未可用；弹窗原文：${dialogText.replace(/\s+/g, ' ').slice(0, 400)}`);
  }
  const router = context.exchangeRouter.toLowerCase();
  const pending = signing.waitForNext((tx) => tx.to.toLowerCase() === router, options.txTimeoutMs ?? 120_000, 'ExchangeRouter 全平交易');
  await confirm.click();
  await snap('confirmed');
  const tx = await pending;
  await snap('tx-confirmed');
  if (tx.error || !tx.txHash) throw new Error(`页面全平交易失败：${tx.error ?? '无 txHash'}`);
  if (tx.status === 'reverted') throw new Error(`页面全平交易回执 reverted：${tx.txHash}`);
  await page.keyboard.press('Escape').catch(() => undefined);
  return {
    txHash: tx.txHash,
    detail: {
      leg: 'close',
      dialogText,
      pageTransactions: signing.sent.map(describeTx),
      orderTransaction: describeTx(tx),
      screenshots: shots,
      durationMs: Date.now() - startedAt,
      driver: 'order-entry/2026-08-23',
    },
  };
}

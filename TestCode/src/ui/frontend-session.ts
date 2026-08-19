import type { Page } from '@playwright/test';

import { injectReadonlyWallet } from './mock-wallet.js';
import { installForkPriceRoutes, type ForkPriceToken, type ForkRouteHandle } from './fork-price-feed.js';

/**
 * 打开一个"前端接 fork"的只读观测会话（docs/07 附录二）：
 *   路由接管（价格/代币/公共 RPC 改写）→ 只读钱包注入 → localStorage 预置（链、市场、语言、关掉引导）→ /trade → 连接钱包。
 * 只做观测：不发交易、不改链上状态。
 */
export interface TradeSessionOptions {
  readonly appBaseUrl: string;
  /** fork RPC（SDK 读链已由前端 env 指向它；这里用于 tickers 读价与公共 RPC 改写） */
  readonly rpcUrl: string;
  readonly dataStore: string;
  readonly oracle: string;
  /** 前端借用的链槽位（84532） */
  readonly appChainId: number;
  readonly trader: `0x${string}`;
  /** 要喂价的代币（地址书写须与前端 SDK TOKENS 一致） */
  readonly tokens: readonly ForkPriceToken[];
  /** 进入页面后选中的交易对 symbol（如 FXMOCKUSDC）；决定点差参数拉取与平仓弹窗执行价预览 */
  readonly marketSymbol: string;
  readonly connectTimeoutMs?: number;
}

export interface TradeSession {
  readonly page: Page;
  readonly routes: ForkRouteHandle;
  /** 采集停点前重读价格（推价后必须调用） */
  refreshPrices(): void;
}

export async function openTradeSession(page: Page, options: TradeSessionOptions): Promise<TradeSession> {
  const routes = await installForkPriceRoutes(page, {
    rpcUrl: options.rpcUrl,
    dataStore: options.dataStore,
    oracle: options.oracle,
    tokens: options.tokens,
    appChainId: options.appChainId,
  });
  await injectReadonlyWallet(page, { address: options.trader, chainId: options.appChainId });
  // 源码字符串注入（避免 tsx/esbuild keepNames 的 __name 助手污染，见 mock-wallet.ts 注释）
  await page.addInitScript(`(() => {
  localStorage.setItem('fx100:currentChainId', ${JSON.stringify(String(options.appChainId))});
  localStorage.setItem('fx100:v2:selectedMarketSymbolByChain', ${JSON.stringify(JSON.stringify({ [String(options.appChainId)]: options.marketSymbol }))});
  localStorage.setItem('language', 'en');
  localStorage.setItem('fx100.tour.trade.v1.completed', '1');
})();`);

  await page.goto(new URL('/trade', options.appBaseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await connectWallet(page, options.connectTimeoutMs ?? 20_000, options.trader);

  return {
    page,
    routes,
    refreshPrices: () => routes.invalidate(),
  };
}

/** topbar 是否已显示钱包地址（wagmi 对 EIP-6963 announce 的注入钱包常会自动重连，无需点 Connect） */
export async function isWalletConnected(page: Page, address: `0x${string}`): Promise<boolean> {
  const head = address.slice(0, 6).toLowerCase();
  const tail = address.slice(-4).toLowerCase();
  const text = (await page.locator('header, nav, [class*="topbar" i]').first().innerText().catch(() => '')).toLowerCase();
  return text.includes(head) && text.includes(tail);
}

/** 移植自 fx100-apps e2e/smoke/open-and-close.spec.ts connectWallet；文案已由 language=en 钉死 */
export async function connectWallet(page: Page, timeoutMs: number, address?: `0x${string}`): Promise<void> {
  const connectButton = page.getByRole('button', { name: /^connect wallet$/i }).first();
  const deadline = Date.now() + timeoutMs;
  // 先等"已连接"或"Connect Wallet 可见"二者之一
  while (Date.now() < deadline) {
    if (address && await isWalletConnected(page, address)) return;
    if (await connectButton.isVisible().catch(() => false)) break;
    await page.waitForTimeout(250);
  }
  if (address && await isWalletConnected(page, address)) return;
  await connectButton.waitFor({ state: 'visible', timeout: Math.max(1_000, deadline - Date.now()) });
  await connectButton.click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible', timeout: 5_000 });
  let clicked = false;
  for (const name of ['MetaMask', 'Browser Wallet', 'Injected']) {
    const button = dialog.getByRole('button', { name, exact: true });
    if (await button.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await button.click();
      clicked = true;
      break;
    }
  }
  if (!clicked) {
    await dialog.getByRole('button').filter({ hasNotText: /walletconnect|close/i }).first().click();
  }
  await connectButton.waitFor({ state: 'hidden', timeout: timeoutMs });
}

/** ConnectKit enforceSupportedChains 的换网遮罩是否出现（出现即钱包上报链不被前端接受） */
export async function hasSwitchNetworkOverlay(page: Page): Promise<boolean> {
  return page.getByText(/switch networks/i).first().isVisible({ timeout: 500 }).catch(() => false);
}

/** 打开 Positions 页签（文案 en） */
export async function openPositionsTab(page: Page): Promise<void> {
  const tab = page.getByRole('button', { name: /^positions/i }).first();
  if (await tab.isVisible({ timeout: 3_000 }).catch(() => false)) await tab.click();
}

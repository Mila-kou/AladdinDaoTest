import type { Page } from '@playwright/test';

import { injectReadonlyWallet } from './mock-wallet.js';
import { injectSigningWallet, type SigningWallet } from './signing-wallet.js';
import { installForkPriceRoutes, type ForkPriceToken, type ForkRouteHandle, type StaticForkPrice } from './fork-price-feed.js';

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
  /** 链上读不到时的静态兜底价（只进 tickers） */
  readonly staticPrices?: readonly StaticForkPrice[];
  /** 进入页面后选中的交易对 symbol（如 FXMOCKUSDC）；决定点差参数拉取与平仓弹窗执行价预览 */
  readonly marketSymbol: string;
  readonly connectTimeoutMs?: number;
  /**
   * 钱包形态：缺省 readonly（只观测，签名方法抛错）；signing = Node 侧私钥签名的 EIP-1193 钱包
   * （页面下单走 Standard 模式 eth_sendTransaction，见 signing-wallet.ts）。
   */
  readonly wallet?:
    | { readonly mode: 'readonly' }
    | { readonly mode: 'signing'; readonly privateKey: `0x${string}`; readonly forkChainId: number; readonly requestTimeoutMs?: number };
}

export interface TradeSession {
  readonly page: Page;
  readonly routes: ForkRouteHandle;
  /** 采集停点前重读价格（推价后必须调用） */
  refreshPrices(): void;
  /** signing 模式下的 Node 侧签名钱包（交易记录 / 等待页面交易） */
  readonly signing?: SigningWallet;
}

export async function openTradeSession(page: Page, options: TradeSessionOptions): Promise<TradeSession> {
  const routes = await installForkPriceRoutes(page, {
    rpcUrl: options.rpcUrl,
    dataStore: options.dataStore,
    oracle: options.oracle,
    tokens: options.tokens,
    ...(options.staticPrices ? { staticPrices: options.staticPrices } : {}),
    appChainId: options.appChainId,
  });
  const walletMode = options.wallet?.mode ?? 'readonly';
  let signing: SigningWallet | undefined;
  if (options.wallet?.mode === 'signing') {
    signing = await injectSigningWallet(page, {
      address: options.trader,
      appChainId: options.appChainId,
      chainId: options.wallet.forkChainId,
      privateKey: options.wallet.privateKey,
      rpcUrl: options.rpcUrl,
      ...(options.wallet.requestTimeoutMs !== undefined ? { requestTimeoutMs: options.wallet.requestTimeoutMs } : {}),
    });
  } else {
    await injectReadonlyWallet(page, { address: options.trader, chainId: options.appChainId });
  }
  // 源码字符串注入（避免 tsx/esbuild keepNames 的 __name 助手污染，见 mock-wallet.ts 注释）
  await page.addInitScript(`(() => {
  localStorage.setItem('fx100:currentChainId', ${JSON.stringify(String(options.appChainId))});
  localStorage.setItem('fx100:v2:selectedMarketSymbolByChain', ${JSON.stringify(JSON.stringify({ [String(options.appChainId)]: options.marketSymbol }))});
  localStorage.setItem('language', 'en');
  localStorage.setItem('fx100.tour.trade.v1.completed', '1');
  // develop@c670d007 起的测试网门禁（src/lib/access-gate，营销 PRD 非交易逻辑）：连接后未验证 referral code 会弹
  // "Access Required" 模态挡住持仓行 Close。useAccessGate 以 isAddressVerified(address) 短路 → 预置该钱包的已验证标记。
  localStorage.setItem(${JSON.stringify(`fx100:access-gate:verified:${options.trader.toLowerCase()}`)}, '1');
  ${walletMode === 'signing'
    // 页面下单只支持 Standard（eth_sendTransaction）：flashModeAtom 缺省 '1ct'（src/state/ui/flash.ts，JSON storage），
    // 1ct/flash 会走 EIP-712 relay 签名 → 签名钱包抛 4200。只在 signing 会话预置，只读观测会话保持前端缺省。
    ? "localStorage.setItem('fx100:flash:mode', JSON.stringify('standard'));"
    : ''}
})();`);

  await page.goto(new URL('/trade', options.appBaseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await connectWallet(page, options.connectTimeoutMs ?? 20_000, options.trader);

  return {
    page,
    routes,
    refreshPrices: () => routes.invalidate(),
    ...(signing ? { signing } : {}),
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
  // dev server 冷启动首屏会持续重渲染，ConnectKit 选项按钮可能"不稳定/被分离"——轮询重试点击，
  // 每轮先看是否已连上（wagmi 对注入钱包也可能自动重连）
  const clickDeadline = Date.now() + Math.max(10_000, timeoutMs);
  let lastError: unknown;
  while (Date.now() < clickDeadline) {
    if (address && await isWalletConnected(page, address)) return;
    if (!(await connectButton.isVisible().catch(() => false))) break; // 按钮消失 = 已连接
    const candidates = [
      ...['MetaMask', 'Browser Wallet', 'Injected'].map((name) => dialog.getByRole('button', { name, exact: true })),
      dialog.getByRole('button').filter({ hasNotText: /walletconnect|close/i }).first(),
    ];
    let clicked = false;
    for (const button of candidates) {
      if (!(await button.isVisible({ timeout: 500 }).catch(() => false))) continue;
      try {
        await button.click({ timeout: 3_000 });
        clicked = true;
        break;
      } catch (error) {
        lastError = error; // 不稳定/分离 → 换下一个候选或下一轮重试
      }
    }
    if (clicked) {
      const hidden = await connectButton.waitFor({ state: 'hidden', timeout: 5_000 }).then(() => true).catch(() => false);
      if (hidden) return;
    }
    await page.waitForTimeout(500);
  }
  if (address && await isWalletConnected(page, address)) return;
  await connectButton.waitFor({ state: 'hidden', timeout: 2_000 }).catch(() => {
    throw new Error(`钱包连接未完成（ConnectKit 选项点击持续失败）：${lastError instanceof Error ? lastError.message.split('\n')[0] : String(lastError ?? '未知')}`);
  });
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

/**
 * Phase 1-B/1-C 冒烟：本地前端接 fork 的只读观测链路是否成立。
 *
 *   E2E_ENV=tx-fork E2E_ENV_PRIORITY_KEYS=E2E_ENV npx tsx scripts/ui-fork-smoke.ts
 *   （环境必须在命令行传：runtime.ts 在 import 时就加载 dotenv，脚本内再设 process.env 已太晚；
 *     前端需已在 UI_APP_BASE_URL/localhost:3010 运行，且已 apply scripts/frontend-fork-patch.ts）
 *
 * 断言：
 *   A. 无 ConnectKit "Switch Networks" 遮罩（钱包上报的链被前端接受）
 *   B. 页面 tickers 价 == fork 链上 Oracle min/max（逐字节；tickers 应答本就由链上读数生成，此处验证前端拿到的是它）
 *   C. 市场头部显示的价格与链上 Oracle 一致（显示级：整数部分/千分位格式化后包含）
 *   D. 网络：fork RPC 被命中；公共 sepolia.base.org 请求被改写计数 > 0 或为 0（两者都合理，报告即可）
 *   E. 已连接钱包 = trader；Positions 页签可打开，报告持仓行数
 * 输出报告 JSON + 截图到 artifacts/ui-smoke/。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { chromium } from '@playwright/test';

import { loadDeploymentManifest } from '../src/config/deployment.js';
import { resolveMockMarketBundle } from '../src/config/mock-resources.js';
import { loadRuntimeConfig } from '../src/config/runtime.js';
import { hasSwitchNetworkOverlay, openPositionsTab, openTradeSession } from '../src/ui/frontend-session.js';
import { readWalletCallLog } from '../src/ui/mock-wallet.js';
import { buildTickersPayload, type ForkPriceToken } from '../src/ui/fork-price-feed.js';

const APP_CHAIN_ID = 84532;
// 前端 SDK TOKENS[84532] 的书写（大小写敏感的 map 键）；FXMOCK 由 scripts/frontend-fork-patch.ts 以小写写入
const SDK_USDC = '0xbf4d9b318689ab928db9ee4cdc840c065575eb89'; // 与 frontend-fork-patch 的小写一致（split 管线小写索引）
const SDK_WETH = '0x4200000000000000000000000000000000000006';
const SDK_BTC = '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c';

async function main() {
  const runtime = loadRuntimeConfig();
  if (runtime.environment !== 'tx-fork' && runtime.environment !== 'oracle-fork' && runtime.environment !== 'time-fork') {
    throw new Error(`需要 fork 环境，当前 ${runtime.environment}`);
  }
  if (!runtime.testAccount) throw new Error('缺 E2E_TEST_ACCOUNT（trader 地址）');
  const appBaseUrl = process.env.UI_APP_BASE_URL ?? 'http://localhost:3010';
  const manifest = await loadDeploymentManifest(runtime.deploymentManifestPath);
  const bundle = await resolveMockMarketBundle(runtime.environment, process.env.E2E_MARKET_RESOURCE_ALIAS ?? 'default-mock');
  if (!bundle.token || !bundle.market) throw new Error('mock bundle 缺 token/market 登记');

  const tokens: ForkPriceToken[] = [
    { symbol: bundle.token.symbol, address: bundle.token.address.toLowerCase(), decimals: bundle.token.decimals },
    { symbol: 'USDC', address: SDK_USDC, decimals: 6 },
    { symbol: 'ETH', address: SDK_WETH, decimals: 18 },
    { symbol: 'BTC', address: SDK_BTC, decimals: 18 },
  ];
  const marketSymbol = `${bundle.token.symbol}USDC`;
  const outDir = resolve(process.cwd(), 'artifacts/ui-smoke');
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });
  const hostHits = new Map<string, number>();
  page.on('request', (req) => {
    try {
      const url = new URL(req.url());
      if (url.hostname === 'localhost') return;
      hostHits.set(url.host, (hostHits.get(url.host) ?? 0) + 1);
    } catch { /* ignore */ }
  });

  const report: Record<string, unknown> = { environment: runtime.environment, chainId: runtime.chainId, appBaseUrl, marketSymbol, trader: runtime.testAccount };
  try {
    // 用户可能只登记了 FXMOCK/USDC 的 provider；ETH/BTC 读不到就从喂价列表剔除（前端会静默过滤这两个市场）
    const { readForkOraclePrices } = await import('../src/ui/fork-price-feed.js');
    const priceable: ForkPriceToken[] = [];
    const unpriceable: string[] = [];
    for (const t of tokens) {
      try {
        await readForkOraclePrices({ rpcUrl: runtime.rpcUrl, dataStore: manifest.contracts.dataStore, oracle: manifest.contracts.oracle, tokens: [t] });
        priceable.push(t);
      } catch (error) {
        unpriceable.push(`${t.symbol}: ${error instanceof Error ? error.message.slice(0, 120) : String(error)}`);
      }
    }
    report.priceableTokens = priceable.map((t) => t.symbol);
    report.unpriceableTokens = unpriceable;

    const session = await openTradeSession(page, {
      appBaseUrl,
      rpcUrl: runtime.rpcUrl,
      dataStore: manifest.contracts.dataStore,
      oracle: manifest.contracts.oracle,
      appChainId: APP_CHAIN_ID,
      trader: runtime.testAccount,
      tokens: priceable,
      marketSymbol,
    });
    await page.waitForTimeout(4_000);

    // A
    report.switchNetworkOverlay = await hasSwitchNetworkOverlay(page);
    // B：页面视角拿到的 tickers（经 route）与链上直读逐字节一致
    const uiTickers = await page.evaluate(async (chainId) => (await fetch(`/api/prices/tickers?chainId=${chainId}`)).json(), APP_CHAIN_ID) as ReturnType<typeof buildTickersPayload>;
    const chainPrices = session.routes.latest() ?? [];
    const idxPrice = chainPrices.find((p) => p.symbol === bundle.token!.symbol);
    const uiIdx = uiTickers.find((t) => t.tokenSymbol === bundle.token!.symbol);
    report.indexPrice = idxPrice ? { minUsd: idxPrice.minUsd, maxUsd: idxPrice.maxUsd, minInternal: idxPrice.minInternal.toString(), maxInternal: idxPrice.maxInternal.toString(), block: idxPrice.blockNumber.toString() } : null;
    report.uiTickerIndex = uiIdx ?? null;
    report.tickerParity = Boolean(idxPrice && uiIdx && uiIdx.minPrice === idxPrice.minUsd && uiIdx.maxPrice === idxPrice.maxUsd);
    // C：市场头部 "Oracle Price" 显示 tickers 中间价 (min+max)/2（state/derived/prices.ts getMidPrice）——显示级：整数部分（千分位格式化）出现在页面正文
    const bodyText = await page.locator('body').innerText();
    const midInternal = idxPrice ? (idxPrice.minInternal + idxPrice.maxInternal) / 2n : 0n;
    const { internalPriceToUsdString } = await import('../src/ui/fork-price-feed.js');
    const midUsd = idxPrice ? internalPriceToUsdString(midInternal, bundle.token!.decimals) : '';
    const wholeMid = midUsd.split('.')[0]!;
    const wholeFormatted = wholeMid.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    report.indexMidUsd = midUsd;
    report.headerShowsIndexPrice = Boolean(wholeMid) && (bodyText.includes(wholeFormatted) || bodyText.includes(wholeMid));
    report.marketHeaderSample = bodyText.split('\n').filter((l) => l.includes(bundle.token!.symbol)).slice(0, 4);
    // F：市场是否水合进 marketsInfoData（selectedMarketInfoAtom 为空时下单按钮显示 "Market Unavailable"）
    report.marketHydrated = !bodyText.includes('Market Unavailable');
    report.tradeButtonText = (await page.getByRole('button', { name: /market unavailable|please connect|buy \/ long|trade now|insufficient|enter/i }).first().innerText().catch(() => null));
    // D
    report.hostHits = Object.fromEntries(hostHits);
    report.rewrittenPublicRpc = session.routes.rewrittenRpcCount();
    // E
    await openPositionsTab(page);
    await page.waitForTimeout(2_500);
    const shortAddr = `${runtime.testAccount.slice(0, 6)}`.toLowerCase();
    report.walletShown = (await page.locator('body').innerText()).toLowerCase().includes(shortAddr);
    report.walletCalls = await readWalletCallLog(page);
    const rows = page.getByTestId('position-row');
    report.positionRowsByTestId = await rows.count();
    report.positionsTabText = (await page.locator('body').innerText()).split('\n').filter((l) => /position|no open|empty/i.test(l)).slice(0, 6);
    await page.screenshot({ path: resolve(outDir, `${runtime.environment}-trade.png`), fullPage: false });
  } catch (error) {
    report.error = error instanceof Error ? `${error.message}\n${error.stack?.split('\n').slice(0, 4).join('\n')}` : String(error);
    await page.screenshot({ path: resolve(outDir, `${runtime.environment}-error.png`) }).catch(() => undefined);
  } finally {
    report.consoleErrors = consoleErrors.slice(0, 12);
    await browser.close();
  }
  await writeFile(resolve(outDir, `${runtime.environment}-report.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  const ok = report.switchNetworkOverlay === false && report.tickerParity === true && report.headerShowsIndexPrice === true && report.walletShown === true && report.marketHydrated === true && !report.error;
  console.log(ok ? '\nUI FORK SMOKE: PASS' : '\nUI FORK SMOKE: FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch((error) => { console.error(error); process.exit(1); });

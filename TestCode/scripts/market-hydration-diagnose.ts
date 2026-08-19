/**
 * 一次性诊断脚本(非用例):直接探测 sdk.oracle.getTokens()/getTickers() 实际打到的 URL
 * 是否被 installForkPriceRoutes 的 page.route() 拦截、返回体是否含 FXMOCK。
 * 不跑链上流程,只开会话到 /trade,比 scn-009-ui-position-parity.ts 快得多。
 *
 *   E2E_ENV=tx-fork E2E_ENV_PRIORITY_KEYS=E2E_ENV npx tsx scripts/market-hydration-diagnose.ts
 */
import { chromium } from '@playwright/test';

import { loadDeploymentManifest } from '../src/config/deployment.js';
import { resolveMockMarketBundle } from '../src/config/mock-resources.js';
import { loadRuntimeConfig } from '../src/config/runtime.js';
import { readForkOraclePrices, type ForkPriceToken } from '../src/ui/fork-price-feed.js';
import { openTradeSession } from '../src/ui/frontend-session.js';

const APP_CHAIN_ID = 84532;
const SDK_USDC = '0xbf4d9b318689ab928db9ee4cdc840c065575eb89'; // 与 frontend-fork-patch 的小写一致（split 管线小写索引）

async function main() {
  const runtime = loadRuntimeConfig();
  const appBaseUrl = process.env.UI_APP_BASE_URL ?? 'http://localhost:3010';
  const manifest = await loadDeploymentManifest(runtime.deploymentManifestPath);
  const bundle = await resolveMockMarketBundle(runtime.environment, process.env.E2E_MARKET_RESOURCE_ALIAS ?? 'default-mock');
  if (!bundle.token || !bundle.market) throw new Error('缺 token/market 登记');

  const candidateTokens: ForkPriceToken[] = [
    { symbol: bundle.token.symbol, address: bundle.token.address.toLowerCase(), decimals: bundle.token.decimals },
    { symbol: 'USDC', address: SDK_USDC, decimals: 6 },
  ];
  const tokens: ForkPriceToken[] = [];
  for (const token of candidateTokens) {
    try {
      await readForkOraclePrices({ rpcUrl: runtime.rpcUrl, dataStore: manifest.contracts.dataStore, oracle: manifest.contracts.oracle, tokens: [token] });
      tokens.push(token);
    } catch { /* skip unpriceable */ }
  }
  const marketSymbol = `${bundle.token.symbol}USDC`;

  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ locale: 'en-US' })).newPage();

  const consoleLines: string[] = [];
  page.on('console', (msg) => { consoleLines.push(`[${msg.type()}] ${msg.text()}`); });

  const hits: Array<{ url: string; status: number | undefined; bodySample: string }> = [];
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('/api/tokens') || url.includes('/api/prices/tickers')) {
      let bodySample = '';
      try { bodySample = (await res.text()).slice(0, 400); } catch { bodySample = '(unreadable)'; }
      hits.push({ url, status: res.status(), bodySample });
    }
  });

  const trader = runtime.testAccount ?? ('0x0000000000000000000000000000000000000001' as `0x${string}`);
  await openTradeSession(page, {
    appBaseUrl,
    rpcUrl: runtime.rpcUrl,
    dataStore: manifest.contracts.dataStore,
    oracle: manifest.contracts.oracle,
    appChainId: APP_CHAIN_ID,
    trader: trader as `0x${string}`,
    tokens,
    marketSymbol,
  });
  await page.waitForTimeout(5_000);

  console.log('priceFeedUrl-targeted network hits:');
  for (const hit of hits) console.log(`  [${hit.status}] ${hit.url}\n    body: ${hit.bodySample.replace(/\n/g, ' ')}`);

  console.log('\nin-page direct fetch probes:');
  const directTokens = await page.evaluate(async (chainId) => {
    try {
      const res = await fetch(`/api/tokens?chainId=${chainId}`);
      return { status: res.status, body: await res.text() };
    } catch (error) {
      return { error: String(error) };
    }
  }, APP_CHAIN_ID);
  console.log('  /api/tokens ->', JSON.stringify(directTokens).slice(0, 500));

  const directTickers = await page.evaluate(async (chainId) => {
    try {
      const res = await fetch(`/api/prices/tickers?chainId=${chainId}`);
      return { status: res.status, body: await res.text() };
    } catch (error) {
      return { error: String(error) };
    }
  }, APP_CHAIN_ID);
  console.log('  /api/prices/tickers ->', JSON.stringify(directTickers).slice(0, 500));

  // 关键：SDK 的 tokensData 与逐层 atom 状态,判定到底断在哪一层
  console.log('\nrelevant console lines (markets/tokens/positions):');
  const interesting = consoleLines.filter((line) =>
    /marketsData|MarketsData|tokensData|getTokensData|missing prices|No market|positions|Positions|marketsValues|marketsConfigs|SDK/i.test(line));
  for (const line of interesting.slice(-40)) console.log('  ', line.slice(0, 300));

  await browser.close();
}

main().catch((error) => { console.error(error); process.exit(1); });

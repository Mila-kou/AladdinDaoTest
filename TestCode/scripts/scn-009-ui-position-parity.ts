/**
 * Phase 1-D：全平前停点用真实持仓验证「持仓行渲染」（docs/07 附录三）。
 *
 *   E2E_ENV=tx-fork E2E_ENV_PRIORITY_KEYS=E2E_ENV npx tsx scripts/scn-009-ui-position-parity.ts
 *   （环境必须在命令行传，前端需已在 UI_APP_BASE_URL/localhost:3010 运行，且已 apply scripts/frontend-fork-patch.ts）
 *
 * 与 ui-fork-smoke.ts 的区别：那个脚本只读观测（当前无持仓）；这个脚本用 runMarketFlow 的
 * beforeClose 停点，在真实开仓→全平之间，链上状态静止时打开前端会话读取目标持仓行。
 * 链上流程照常跑完（含全平），停点只观测不改变链上结果。
 *
 * 采集口径：docs/07 现状盘点——生产持仓表数值字段 testid 现状为零，POSITION_ROW_FIELDS
 * 全部走 testid（无文案 fallback，行内无稳定 label:value 结构）。命中率为 0 是当前预期状态，
 * 不代表脚本故障；本脚本同时留证据（screenshot + 行容器可见性 + body 文本行 + console 错误）
 * 供人工核对，并作为 testid 契约（docs/07 需求 A）落地后的复验入口——届时无需改脚本，只需重跑。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { chromium } from '@playwright/test';

import { loadDeploymentManifest } from '../src/config/deployment.js';
import { resolveMockMarketBundle } from '../src/config/mock-resources.js';
import { loadRuntimeConfig } from '../src/config/runtime.js';
import { runMarketFlow, type MarketFlowBeforeCloseContext } from '../src/scenarios/scn-009-runner.js';
import { readForkOraclePrices, type ForkPriceToken } from '../src/ui/fork-price-feed.js';
import { openPositionsTab, openTradeSession } from '../src/ui/frontend-session.js';
import { collectDisplayValues, POSITION_ROW_FIELDS } from '../src/ui/selectors.js';

const APP_CHAIN_ID = 84532;
// 前端 SDK TOKENS[84532] 的书写（大小写敏感的 map 键），与 ui-fork-smoke.ts 保持一致
const SDK_USDC = '0xbf4d9b318689ab928db9ee4cdc840c065575eb89'; // 与 frontend-fork-patch 的小写一致（split 管线小写索引）
const SDK_WETH = '0x4200000000000000000000000000000000000006';
const SDK_BTC = '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c';

function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

async function main() {
  const runtime = loadRuntimeConfig();
  if (runtime.environment !== 'tx-fork' && runtime.environment !== 'oracle-fork' && runtime.environment !== 'time-fork') {
    throw new Error(`需要 fork 环境，当前 ${runtime.environment}`);
  }
  const appBaseUrl = process.env.UI_APP_BASE_URL ?? 'http://localhost:3010';
  const mockResourceAlias = process.env.E2E_MARKET_RESOURCE_ALIAS ?? 'default-mock';
  const manifest = await loadDeploymentManifest(runtime.deploymentManifestPath);
  const bundle = await resolveMockMarketBundle(runtime.environment, mockResourceAlias);
  if (!bundle.token || !bundle.market) throw new Error(`${runtime.environment}/${mockResourceAlias} 缺 token/market 登记`);

  // 只登记了 FXMOCK 的 Oracle provider；USDC/ETH/BTC 探测失败就从喂价列表剔除
  // （否则 readForkOraclePrices 的 Promise.all 因一个 token 失败而整体 throw，
  // tickers/tokens 路由跟着 500，前端拿不到 marketsInfoData/tokensData，
  // usePositionsDataSync 的 queryEnabled 门槛过不去——真实仓位也会显示 Positions (0)；
  // 2026-08-17 实案：漏做这层过滤，35/35 链上断言全绿但持仓行 0）。
  const candidateTokens: ForkPriceToken[] = [
    { symbol: bundle.token.symbol, address: bundle.token.address.toLowerCase(), decimals: bundle.token.decimals },
    { symbol: 'USDC', address: SDK_USDC, decimals: 6 },
    { symbol: 'ETH', address: SDK_WETH, decimals: 18 },
    { symbol: 'BTC', address: SDK_BTC, decimals: 18 },
  ];
  const tokens: ForkPriceToken[] = [];
  const unpriceableTokens: string[] = [];
  for (const token of candidateTokens) {
    try {
      await readForkOraclePrices({ rpcUrl: runtime.rpcUrl, dataStore: manifest.contracts.dataStore, oracle: manifest.contracts.oracle, tokens: [token] });
      tokens.push(token);
    } catch (error) {
      unpriceableTokens.push(`${token.symbol}: ${error instanceof Error ? error.message.slice(0, 120) : String(error)}`);
    }
  }
  const marketSymbol = `${bundle.token.symbol}USDC`;
  const outDir = resolve(process.cwd(), 'artifacts/ui-smoke');
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 900 } })).newPage();
  const consoleErrors: string[] = [];
  const consoleTrace: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error') consoleErrors.push(text.slice(0, 300));
    if (/usePositionsDataSync|\[SDK\]|getPositions|No market|missing prices|useMarketsValues\]|useMarketsConfigs\]/.test(text)) {
      consoleTrace.push(`[${msg.type()}] ${text.slice(0, 400)}`);
    }
  });

  let stopPointReport: Record<string, unknown> = { collected: false };
  try {
    const evidence = await runMarketFlow(runtime, {
      scenarioId: 'SCN-009-UI-1D',
      isLong: true,
      beforeClose: async (context: MarketFlowBeforeCloseContext) => {
        const session = await openTradeSession(page, {
          appBaseUrl,
          rpcUrl: context.rpcUrl,
          dataStore: context.dataStore,
          oracle: context.oracle,
          appChainId: APP_CHAIN_ID,
          trader: context.trader,
          tokens,
          marketSymbol,
        });
        await page.waitForTimeout(2_000);
        await openPositionsTab(page);
        // 持仓查询依赖 marketsInfoData 就绪后启用，refetchInterval 8s；轮询最多 30s 等 "Positions (N>0)" 或 Fetched positions 日志
        const side = context.isLong ? 'long' : 'short';
        const deadline = Date.now() + 30_000;
        let positionsHeadingNow: string | undefined;
        while (Date.now() < deadline) {
          const text = await page.locator('body').innerText();
          positionsHeadingNow = text.split('\n').find((line) => /^positions\s*\(/i.test(line.trim()));
          if (positionsHeadingNow && /\(\s*[1-9]/.test(positionsHeadingNow)) break;
          await page.waitForTimeout(2_000);
        }
        const rows = page.getByTestId('position-row');
        const rowCount = await rows.count();
        const targetRow = page.locator(
          `[data-testid="position-row"][data-market="${context.marketIndex}"][data-side="${side}"]`,
        ).first();
        const targetRowVisible = await targetRow.isVisible().catch(() => false);
        const fields = await collectDisplayValues(targetRowVisible ? targetRow : page, POSITION_ROW_FIELDS);

        const bodyText = await page.locator('body').innerText();
        const positionsHeading = bodyText.split('\n').find((line) => /^positions\s*\(/i.test(line.trim()));
        const symbolLines = bodyText.split('\n').filter((line) => line.includes(bundle.token!.symbol)).slice(0, 8);

        const screenshotPath = resolve(outDir, `${context.scenarioId}-position-row.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });

        stopPointReport = {
          collected: true,
          appBaseUrl,
          marketSymbol,
          priceableTokens: tokens.map((t) => t.symbol),
          unpriceableTokens,
          marketIndex: context.marketIndex,
          side,
          onchainPosition: context.position,
          positionsHeading,
          positionRowCountByTestId: rowCount,
          targetRowVisible,
          fields,
          symbolLines,
          rewrittenPublicRpc: session.routes.rewrittenRpcCount(),
          consoleErrors: consoleErrors.slice(-20),
          consoleTrace: consoleTrace.slice(-30),
          screenshotPath,
        };
        return stopPointReport;
      },
    });

    const report = {
      environment: runtime.environment,
      chainId: runtime.chainId,
      assertionsPassed: evidence.assertions.filter((a) => a.passed).length,
      assertionsTotal: evidence.assertions.length,
      failedAssertions: evidence.assertions.filter((a) => !a.passed),
      uiDisplay: evidence.uiDisplay,
    };
    await writeFile(resolve(outDir, 'scn-009-1d-report.json'), JSON.stringify(report, jsonReplacer, 2));
    console.log(JSON.stringify(report, jsonReplacer, 2));
    const positionRendered = /\(\s*[1-9]/.test(String(stopPointReport.positionsHeading ?? '')) || stopPointReport.targetRowVisible === true;
    const ok = report.failedAssertions.length === 0 && stopPointReport.collected === true && positionRendered;
    console.log(ok ? '\nSCN-009 UI 1-D: PASS（链上流程全绿；持仓行已渲染，证据见上）' : '\nSCN-009 UI 1-D: FAIL（若链上断言全绿但持仓行未渲染，见 consoleErrors / unpriceableTokens 定位前端侧原因）');
    process.exitCode = ok ? 0 : 1;
  } catch (error) {
    // 链上流程抛错（停点之后的断言等）也要保住停点采集结果，便于分层定位
    const report = { environment: runtime.environment, chainId: runtime.chainId, flowError: error instanceof Error ? error.message : String(error), uiDisplay: stopPointReport };
    await writeFile(resolve(outDir, 'scn-009-1d-report.json'), JSON.stringify(report, jsonReplacer, 2));
    console.log(JSON.stringify(report, jsonReplacer, 2));
    console.log('\nSCN-009 UI 1-D: FLOW ERROR（停点采集结果已保留，见 uiDisplay）');
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });

/**
 * Phase 1-D 独立驱动：单流（默认开多 +10%）全平前停点 → 平仓弹窗采集（src/ui/close-dialog-collector.ts）。
 * 比跑整个 SCN-022 矩阵快一半，用于调试采集器与查看三值。
 *
 *   E2E_ENV=tx-fork E2E_SIGNING_MODE=impersonation E2E_TEST_ACCOUNT=0xf100000000000000000000000000000000000d01 \
 *   E2E_ENV_PRIORITY_KEYS=E2E_ENV,E2E_SIGNING_MODE,E2E_TEST_ACCOUNT npx tsx scripts/scn-009-ui-close-dialog.ts [--short] [--move 10]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { chromium } from '@playwright/test';

import { loadRuntimeConfig } from '../src/config/runtime.js';
import { runMarketFlow, type MarketFlowBeforeCloseContext } from '../src/scenarios/scn-009-runner.js';
import { collectCloseDialogAtStopPoint } from '../src/ui/close-dialog-collector.js';
import { UI_APP_CHAIN_ID, prepareUiCollect } from '../src/ui/ui-collect-hook.js';

function jsonReplacer(_k: string, v: unknown) { return typeof v === 'bigint' ? v.toString() : v; }

async function main() {
  const runtime = loadRuntimeConfig();
  const isLong = !process.argv.includes('--short');
  const moveIndex = process.argv.indexOf('--move');
  const priceMovePercent = moveIndex >= 0 ? Number(process.argv[moveIndex + 1]) : (isLong ? 10 : -10);
  const setup = await prepareUiCollect(runtime);
  const outDir = resolve(process.cwd(), 'artifacts/ui-smoke');
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 900 } })).newPage();
  let stop: Record<string, unknown> = { collected: false };
  try {
    const evidence = await runMarketFlow(runtime, {
      scenarioId: `SCN-009-UI-CLOSE-${isLong ? 'LONG' : 'SHORT'}`,
      isLong,
      priceMovePercent,
      beforeClose: async (context: MarketFlowBeforeCloseContext) => {
        const result = await collectCloseDialogAtStopPoint(page, context, {
          appBaseUrl: setup.appBaseUrl,
          appChainId: UI_APP_CHAIN_ID,
          tokens: setup.tokens,
          marketSymbol: setup.marketSymbol,
          indexSymbol: setup.indexSymbol,
          screenshotPath: resolve(outDir, `close-dialog-${isLong ? 'long' : 'short'}.png`),
        });
        const { session: _s, ...rest } = result;
        stop = { ...rest };
        if (!result.collected) {
          // 定位诊断：表格/行计数与候选行文本
          stop.diag = {
            tables: await page.locator('table').count(),
            trs: await page.locator('tr').count(),
            trsWithSymbol: await page.locator('tr', { hasText: setup.indexSymbol }).count(),
            trTexts: (await page.locator('tr', { hasText: setup.indexSymbol }).allInnerTexts()).slice(0, 4).map((t) => t.replace(/\s+/g, ' ').slice(0, 160)),
            roleRows: await page.getByRole('row').count(),
            closeButtons: await page.getByRole('button', { name: 'Close', exact: true }).count(),
          };
        }
        return stop;
      },
    });
    const report = { environment: runtime.environment, chainId: runtime.chainId, trader: runtime.testAccount, isLong, priceMovePercent,
      assertionsPassed: evidence.assertions.filter((a) => a.passed).length, assertionsTotal: evidence.assertions.length,
      closeDelta: { traderUsdc: evidence.deltas.executeClose.traderUsdc?.toString() }, uiDisplay: evidence.uiDisplay };
    await writeFile(resolve(outDir, `close-dialog-${isLong ? 'long' : 'short'}-report.json`), JSON.stringify(report, jsonReplacer, 2));
    console.log(JSON.stringify(report, jsonReplacer, 2));
  } catch (error) {
    console.log(JSON.stringify({ flowError: error instanceof Error ? error.message : String(error), uiDisplay: stop }, jsonReplacer, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });

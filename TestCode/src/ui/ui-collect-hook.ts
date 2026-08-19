import type { Page, TestInfo } from '@playwright/test';

import { loadDeploymentManifest } from '../config/deployment.js';
import { resolveMockMarketBundle } from '../config/mock-resources.js';
import type { RuntimeConfig } from '../config/runtime.js';
import type { MarketFlowBeforeCloseContext, MarketFlowBeforeCloseHook } from '../scenarios/scn-009-runner.js';
import { collectCloseDialogAtStopPoint } from './close-dialog-collector.js';
import { readForkOraclePrices, type ForkPriceToken } from './fork-price-feed.js';
import type { TradeSession } from './frontend-session.js';

/**
 * 给矩阵/单流用例挂"全平前停点前端采集"的开关式装配（docs/07 Phase 1-D）。
 *
 * 开关：E2E_UI_COLLECT=true 才装配；默认关闭，链上用例行为完全不变。
 * 前置：本地前端已起（UI_APP_BASE_URL，默认 http://localhost:3010）、已 apply scripts/frontend-fork-patch.ts、
 *       trader 为无历史仓位的专用地址（scripts/prepare-ui-trader.ts，见 docs/07 需求 F）。
 * 前端借用 84532 槽位读 fork（docs/07 附录二）。
 */
export const UI_APP_CHAIN_ID = 84532;
/** 前端 SDK TOKENS[84532] 的书写；USDC 已由 frontend-fork-patch 改小写（split 管线小写索引） */
const SDK_USDC_LOWER = '0xbf4d9b318689ab928db9ee4cdc840c065575eb89';

export function uiCollectEnabled(): boolean {
  return process.env.E2E_UI_COLLECT === 'true';
}

export interface UiCollectSetup {
  readonly appBaseUrl: string;
  readonly tokens: readonly ForkPriceToken[];
  readonly marketSymbol: string;
  readonly indexSymbol: string;
  readonly unpriceable: readonly string[];
}

export async function prepareUiCollect(runtime: RuntimeConfig): Promise<UiCollectSetup> {
  const appBaseUrl = process.env.UI_APP_BASE_URL ?? 'http://localhost:3010';
  const manifest = await loadDeploymentManifest(runtime.deploymentManifestPath);
  const bundle = await resolveMockMarketBundle(runtime.environment as never, process.env.E2E_MARKET_RESOURCE_ALIAS ?? 'default-mock');
  if (!bundle.token) throw new Error('UI 采集需要 mock bundle 的 index token 登记');
  const candidates: ForkPriceToken[] = [
    { symbol: bundle.token.symbol, address: bundle.token.address.toLowerCase(), decimals: bundle.token.decimals },
    { symbol: 'USDC', address: SDK_USDC_LOWER, decimals: 6 },
  ];
  const tokens: ForkPriceToken[] = [];
  const unpriceable: string[] = [];
  for (const token of candidates) {
    try {
      await readForkOraclePrices({ rpcUrl: runtime.rpcUrl, dataStore: manifest.contracts.dataStore, oracle: manifest.contracts.oracle, tokens: [token] });
      tokens.push(token);
    } catch (error) {
      unpriceable.push(`${token.symbol}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
    }
  }
  return { appBaseUrl, tokens, marketSymbol: `${bundle.token.symbol}USDC`, indexSymbol: bundle.token.symbol, unpriceable };
}

/**
 * 生成 beforeClose 钩子：同一 page 跨数据集复用会话；每次停点截图落 testInfo.outputPath。
 * 返回值即 evidence.uiDisplay（runner 原样落证据）。
 */
export function makeCloseDialogHook(page: Page, testInfo: TestInfo, setup: UiCollectSetup): MarketFlowBeforeCloseHook {
  let session: TradeSession | undefined;
  return async (context: MarketFlowBeforeCloseContext) => {
    const tag = `${context.scenarioId.replace(/[^\w-]+/g, '_')}-close-dialog.png`;
    const result = await collectCloseDialogAtStopPoint(page, context, {
      appBaseUrl: setup.appBaseUrl,
      appChainId: UI_APP_CHAIN_ID,
      tokens: setup.tokens,
      marketSymbol: setup.marketSymbol,
      indexSymbol: setup.indexSymbol,
      ...(session ? { session } : {}),
      screenshotPath: testInfo.outputPath(tag),
    });
    session = result.session;
    if (result.screenshotPath) {
      await testInfo.attach(tag, { path: result.screenshotPath, contentType: 'image/png' }).catch(() => undefined);
    }
    const { session: _omit, ...serializable } = result;
    return {
      ...serializable,
      appBaseUrl: setup.appBaseUrl,
      appChainId: UI_APP_CHAIN_ID,
      marketSymbol: setup.marketSymbol,
      unpriceableTokens: setup.unpriceable,
      collectorVersion: 'phase1-d/2026-08-19',
    };
  };
}

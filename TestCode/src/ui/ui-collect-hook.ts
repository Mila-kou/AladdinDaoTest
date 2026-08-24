import type { Page, TestInfo } from '@playwright/test';

import { loadDeploymentManifest } from '../config/deployment.js';
import { resolveMockMarketBundle } from '../config/mock-resources.js';
import type { RuntimeConfig } from '../config/runtime.js';
import type {
  MarketFlowBeforeCloseContext,
  MarketFlowBeforeCloseHook,
  MarketFlowOrderEntryContext,
  MarketFlowOrderEntryHook,
} from '../scenarios/scn-009-runner.js';
import { collectCloseDialogAtStopPoint } from './close-dialog-collector.js';
import { readForkOraclePrices, type ForkPriceToken, type StaticForkPrice } from './fork-price-feed.js';
import { openTradeSession, type TradeSession } from './frontend-session.js';
import { driveCloseOrderOnPage, driveOpenOrderOnPage } from './order-entry.js';

/**
 * 给矩阵/单流用例挂前端钩子的开关式装配（docs/07 Phase 1-D / Phase 2）：
 *   - E2E_UI_COLLECT=true     → beforeClose 停点采集（只读观测：平仓弹窗预览三方核对）；
 *   - E2E_UI_ORDER_ENTRY=true → orderEntry 页面下单（市价开仓/全平由页面点击发起，注入钱包 Node 侧私钥签名）。
 * 两个开关默认关闭，关闭时用例与链上证据链完全不变。两者同开时共用同一个页面会话（signing 模式）。
 * 前置：本地前端已起（UI_APP_BASE_URL，默认 http://localhost:3010）、已 apply scripts/frontend-fork-patch.ts、
 *       trader 为无历史仓位的专用地址（scripts/prepare-ui-trader.ts，见 docs/07 需求 F）；页面下单还要求
 *       E2E_TRADER_PROFILE=ui + private-key 签名模式（私钥留在 Node，见 signing-wallet.ts）。
 * 前端借用 84532 槽位读 fork（docs/07 附录二）。
 */
export const UI_APP_CHAIN_ID = 84532;
/** 前端 SDK TOKENS[84532] 的书写；USDC 已由 frontend-fork-patch 改小写（split 管线小写索引） */
const SDK_USDC_LOWER = '0xbf4d9b318689ab928db9ee4cdc840c065575eb89';

export function uiCollectEnabled(): boolean {
  return process.env.E2E_UI_COLLECT === 'true';
}

export function uiOrderEntryEnabled(): boolean {
  return process.env.E2E_UI_ORDER_ENTRY === 'true';
}

/** 前端 SDK TOKENS[84532] 的 WETH（native ETH 取 wrapped 价：sdk/modules/tokens getTokenRecentPrices） */
const SDK_WETH = '0x4200000000000000000000000000000000000006';

export interface UiCollectSetup {
  readonly appBaseUrl: string;
  readonly tokens: readonly ForkPriceToken[];
  /** 链上读不到时的静态兜底价（当前：WETH→native ETH，供前端执行费 USD 估算；E2E_UI_NATIVE_USD，缺省 3000） */
  readonly staticPrices: readonly StaticForkPrice[];
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
    { symbol: 'WETH', address: SDK_WETH, decimals: 18 },
  ];
  const tokens: ForkPriceToken[] = [];
  const unpriceable: string[] = [];
  const staticPrices: StaticForkPrice[] = [];
  for (const token of candidates) {
    try {
      await readForkOraclePrices({ rpcUrl: runtime.rpcUrl, dataStore: manifest.contracts.dataStore, oracle: manifest.contracts.oracle, tokens: [token] });
      tokens.push(token);
    } catch (error) {
      const reason = error instanceof Error ? error.message.split('\n')[0]! : String(error);
      if (token.symbol === 'WETH') {
        // native ETH 价只用于前端执行费 USD 估算（SDK getExecutionFee 缺 native 价直接 undefined → "Failed to calculate execution fee"）；
        // fork 上 WETH provider 为 datastream 类读不到 → 静态兜底，链上 executionFee=gasLimit×gasPrice 不受影响
        const usd = process.env.E2E_UI_NATIVE_USD ?? '3000';
        staticPrices.push({ ...token, usd, reason: `链上 provider 读取失败（${reason}）→ 静态 ${usd} USD（E2E_UI_NATIVE_USD）` });
        unpriceable.push(`${token.symbol}: 静态 ${usd} USD（${reason}）`);
      } else {
        unpriceable.push(`${token.symbol}: ${reason}`);
      }
    }
  }
  return { appBaseUrl, tokens, staticPrices, marketSymbol: `${bundle.token.symbol}USDC`, indexSymbol: bundle.token.symbol, unpriceable };
}

/**
 * 页面会话持有者：同一 page 上只开一个会话，采集钩子与页面下单钩子共用。
 * 会话钱包形态在首次打开时决定（需要下单 → signing；否则 readonly），之后 reload 复用（initScript 对后续导航持续生效）。
 */
export interface UiSessionHolder {
  session: TradeSession | undefined;
  readonly wantSigning: boolean;
  ensure(page: Page, context: Pick<MarketFlowBeforeCloseContext, 'rpcUrl' | 'dataStore' | 'oracle' | 'trader'>): Promise<TradeSession>;
}

export function createUiSessionHolder(runtime: RuntimeConfig, setup: UiCollectSetup, wantSigning: boolean): UiSessionHolder {
  const holder: UiSessionHolder = {
    session: undefined,
    wantSigning,
    async ensure(page, context) {
      if (holder.session) return holder.session;
      if (wantSigning && (!runtime.testPrivateKey || runtime.signingMode !== 'private-key')) {
        throw new Error('页面下单需要 private-key 签名模式与 trader 私钥（E2E_TRADER_PROFILE=ui + .env.local E2E_UI_TEST_PRIVATE_KEY）');
      }
      holder.session = await openTradeSession(page, {
        appBaseUrl: setup.appBaseUrl,
        rpcUrl: context.rpcUrl,
        dataStore: context.dataStore,
        oracle: context.oracle,
        appChainId: UI_APP_CHAIN_ID,
        trader: context.trader,
        tokens: setup.tokens,
        staticPrices: setup.staticPrices,
        marketSymbol: setup.marketSymbol,
        ...(wantSigning && runtime.testPrivateKey
          ? { wallet: { mode: 'signing' as const, privateKey: runtime.testPrivateKey, forkChainId: runtime.chainId, requestTimeoutMs: runtime.requestTimeoutMs } }
          : {}),
      });
      return holder.session;
    },
  };
  return holder;
}

function tagFor(scenarioId: string, datasetId: string | undefined, suffix: string): string {
  const base = `${scenarioId}${datasetId ? `_${datasetId}` : ''}`.replace(/[^\w-]+/g, '_');
  return `${base}-${suffix}.png`;
}

async function attachShots(testInfo: TestInfo, tag: string, shots: ReadonlyArray<{ stage: string; path: string }>): Promise<void> {
  for (const shot of shots) {
    const name = tag.replace(/\.png$/, `-${shot.stage}.png`);
    await testInfo.attach(name, { path: shot.path, contentType: 'image/png' }).catch(() => undefined);
  }
}

export interface UiHooks {
  readonly beforeClose?: MarketFlowBeforeCloseHook;
  readonly orderEntry?: MarketFlowOrderEntryHook;
}

/**
 * 按开关一次装配两个钩子（market-flow 用例统一入口）：
 *   两个开关都关 → {}，用例行为不变；开了哪个就返回哪个；两者共用一个 UiSessionHolder。
 * 适用前提：流程以「市价全平」收尾（009/011/012/013/022/023/024/025/065）；页面下单只接管市价腿，
 * 触发式腿（011/012/013 开仓）仍走 RPC。TP/SL 触发全平（015/016/066/067）停点在推价之前，勿接 beforeClose。
 */
export async function resolveUiHooks(runtime: RuntimeConfig, page: Page, testInfo: TestInfo): Promise<UiHooks> {
  const collect = uiCollectEnabled();
  const orderEntry = uiOrderEntryEnabled();
  if (!collect && !orderEntry) return {};
  const setup = await prepareUiCollect(runtime);
  const holder = createUiSessionHolder(runtime, setup, orderEntry);
  testInfo.annotations.push({
    type: 'ui-collect',
    description: `前端钩子已装配（${[collect ? 'E2E_UI_COLLECT 停点采集' : '', orderEntry ? 'E2E_UI_ORDER_ENTRY 页面下单' : ''].filter(Boolean).join(' + ')}）：${setup.appBaseUrl} · 市场 ${setup.marketSymbol} · 喂价 ${setup.tokens.map((t) => t.symbol).join('/') || '无'}${setup.unpriceable.length ? ` · 不可喂价 ${setup.unpriceable.join('；')}` : ''}`,
  });
  return {
    ...(collect ? { beforeClose: makeCloseDialogHook(page, testInfo, setup, holder) } : {}),
    ...(orderEntry ? { orderEntry: makeOrderEntryHook(page, testInfo, setup, holder) } : {}),
  };
}

/** 把钩子并入 runMarketFlow 的 flow 选项或 runMarketFlowMatrix 的 dataset 项；未启用的钩子不写字段。 */
export function withUiHooks<T extends object>(
  options: T,
  hooks: UiHooks,
): T & { beforeClose?: MarketFlowBeforeCloseHook; orderEntry?: MarketFlowOrderEntryHook } {
  return {
    ...options,
    ...(hooks.beforeClose ? { beforeClose: hooks.beforeClose } : {}),
    ...(hooks.orderEntry ? { orderEntry: hooks.orderEntry } : {}),
  };
}

/** 兼容入口：只装 beforeClose（等价 resolveUiHooks().beforeClose；E2E_UI_ORDER_ENTRY 同时打开时也一并装配） */
export async function resolveBeforeCloseHook(
  runtime: RuntimeConfig,
  page: Page,
  testInfo: TestInfo,
): Promise<MarketFlowBeforeCloseHook | undefined> {
  return (await resolveUiHooks(runtime, page, testInfo)).beforeClose;
}

/** 兼容入口：把 beforeClose 并入选项（无钩子时原样返回，不写 undefined 字段）。 */
export function withBeforeClose<T extends object>(
  options: T,
  hook: MarketFlowBeforeCloseHook | undefined,
): T & { beforeClose?: MarketFlowBeforeCloseHook } {
  return hook ? { ...options, beforeClose: hook } : options;
}

/**
 * 生成 beforeClose 钩子：同一 page 跨数据集复用会话；每次停点逐阶段截图落 testInfo.outputPath 并附到用例。
 * 返回值即 evidence.uiDisplay（runner 原样落证据）。
 */
export function makeCloseDialogHook(page: Page, testInfo: TestInfo, setup: UiCollectSetup, holder?: UiSessionHolder): MarketFlowBeforeCloseHook {
  let localSession: TradeSession | undefined;
  return async (context: MarketFlowBeforeCloseContext) => {
    const tag = tagFor(context.scenarioId, context.datasetId, 'close-dialog');
    // 会话来源：共享持有者（可能是 signing 会话）优先；否则本钩子自持只读会话
    const session = holder ? await holder.ensure(page, context) : localSession;
    const result = await collectCloseDialogAtStopPoint(page, context, {
      appBaseUrl: setup.appBaseUrl,
      appChainId: UI_APP_CHAIN_ID,
      tokens: setup.tokens,
      marketSymbol: setup.marketSymbol,
      indexSymbol: setup.indexSymbol,
      ...(session ? { session } : {}),
      screenshotPath: testInfo.outputPath(tag),
    });
    if (holder) holder.session = result.session; else localSession = result.session;
    const shots = result.screenshots && result.screenshots.length > 0
      ? result.screenshots
      : (result.screenshotPath ? [{ stage: 'preview', path: result.screenshotPath }] : []);
    await attachShots(testInfo, tag, shots);
    const { session: _omit, ...serializable } = result;
    return {
      ...serializable,
      appBaseUrl: setup.appBaseUrl,
      appChainId: UI_APP_CHAIN_ID,
      marketSymbol: setup.marketSymbol,
      unpriceableTokens: setup.unpriceable,
      walletMode: holder?.wantSigning ? 'signing' : 'readonly',
      collectorVersion: 'phase2/2026-08-23',
    };
  };
}

/**
 * 生成 orderEntry 钩子：开仓腿走前端下单表单，全平腿走持仓行 Close Position → Max → Confirm Close；
 * 交易由 signing 会话的注入钱包在 Node 侧签名。逐阶段截图附到用例；detail 原样进 evidence.uiOrderEntry。
 */
export function makeOrderEntryHook(page: Page, testInfo: TestInfo, setup: UiCollectSetup, holder: UiSessionHolder): MarketFlowOrderEntryHook {
  return async (context: MarketFlowOrderEntryContext) => {
    const session = await holder.ensure(page, context);
    const tag = tagFor(context.scenarioId, context.datasetId, `order-${context.leg}`);
    const options = { indexSymbol: setup.indexSymbol, screenshotPath: testInfo.outputPath(tag) };
    let result;
    try {
      result = context.leg === 'open'
        ? await driveOpenOrderOnPage(page, session, context, options)
        : await driveCloseOrderOnPage(page, session, context, options);
    } catch (error) {
      // 失败现场截图也附上
      const errorShot = testInfo.outputPath(tag.replace(/\.png$/, '-error.png'));
      await page.screenshot({ path: errorShot }).then(() => testInfo.attach(tag.replace(/\.png$/, '-error.png'), { path: errorShot, contentType: 'image/png' })).catch(() => undefined);
      throw error;
    }
    const shots = (result.detail?.screenshots as ReadonlyArray<{ stage: string; path: string }> | undefined) ?? [];
    await attachShots(testInfo, tag, shots);
    return result;
  };
}

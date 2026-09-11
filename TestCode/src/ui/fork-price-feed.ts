import type { Page } from '@playwright/test';
import { createPublicClient, encodeAbiParameters, getAddress, http, keccak256, parseAbi, parseAbiParameters } from 'viem';

/**
 * 前端价格源改接 fork 链上 Oracle 真值（Phase 1-B 的落地形态）。
 *
 * 为什么不用前端自己的 /api/prices/tickers：develop 分支该路由只读 Chainlink DB/API、无 mock oracle 分支，
 * 且缺 DATABASE_URL 直接 500（Phase 1 审计 2026-08-14）。这里在 Playwright 层用
 * `ChainlinkPriceFeedProvider.getOraclePrice(token,'0x')`（view）读出合约实际使用的 {min,max}
 * （min=min(feed,STABLE_PRICE)、max=max(...)），按 SDK 的换算口径回填成 tickers 应答：
 *   ticker.usd = internal / 10^(30 − tokenDecimals)   ← SDK convertToContractPrice 的逆运算，逐位精确
 * 这样前端拿到的价格 == 合约执行用的价格，三方核对的"UI 价基"与链上一致。
 */

const dataStoreAbi = parseAbi(['function getAddress(bytes32) view returns (address)']);
const providerAbi = parseAbi([
  'function getOraclePrice(address token, bytes data) view returns ((address token, uint256 min, uint256 max, uint256 timestamp, address provider))',
]);

export interface ForkPriceToken {
  readonly symbol: string;
  /** 必须与前端 SDK TOKENS 配置里的书写完全一致（大小写敏感的 map 键） */
  readonly address: string;
  readonly decimals: number;
}

export interface ForkTokenPrice extends ForkPriceToken {
  readonly provider: `0x${string}`;
  readonly minInternal: bigint;
  readonly maxInternal: bigint;
  /** 人类可读 USD 十进制字符串（无损） */
  readonly minUsd: string;
  readonly maxUsd: string;
  readonly blockNumber: bigint;
}

function oracleProviderKey(oracle: string, token: string): `0x${string}` {
  const base = keccak256(encodeAbiParameters(parseAbiParameters('string'), ['ORACLE_PROVIDER_FOR_TOKEN']));
  return keccak256(encodeAbiParameters(parseAbiParameters('bytes32,address,address'), [base, getAddress(oracle), getAddress(token)]));
}

/** internal(1e30 USD / token 最小单位) → USD 十进制字符串：除以 10^(30−decimals)，精确、去尾零 */
export function internalPriceToUsdString(internal: bigint, tokenDecimals: number): string {
  const scale = 30 - tokenDecimals;
  if (scale < 0) throw new Error(`tokenDecimals ${tokenDecimals} > 30`);
  const divisor = 10n ** BigInt(scale);
  const whole = internal / divisor;
  const frac = (internal % divisor).toString().padStart(scale, '0').replace(/0+$/, '');
  return frac.length > 0 ? `${whole}.${frac}` : whole.toString();
}

export interface ReadForkOraclePricesInput {
  readonly rpcUrl: string;
  readonly dataStore: string;
  readonly oracle: string;
  readonly tokens: readonly ForkPriceToken[];
  readonly timeoutMs?: number;
}

export async function readForkOraclePrices(input: ReadForkOraclePricesInput): Promise<ForkTokenPrice[]> {
  const client = createPublicClient({ transport: http(input.rpcUrl, { timeout: input.timeoutMs ?? 15_000 }) });
  const block = await client.getBlockNumber();
  const out = await Promise.all(input.tokens.map(async (token): Promise<ForkTokenPrice> => {
    const provider = await client.readContract({
      address: getAddress(input.dataStore),
      abi: dataStoreAbi,
      functionName: 'getAddress',
      args: [oracleProviderKey(input.oracle, token.address)],
      blockNumber: block,
    });
    if (provider === '0x0000000000000000000000000000000000000000') {
      throw new Error(`token ${token.symbol} ${token.address} 在 DataStore 无 ORACLE_PROVIDER_FOR_TOKEN 登记`);
    }
    const validated = await client.readContract({
      address: provider,
      abi: providerAbi,
      functionName: 'getOraclePrice',
      args: [getAddress(token.address), '0x'],
      blockNumber: block,
    });
    return {
      ...token,
      provider,
      minInternal: validated.min,
      maxInternal: validated.max,
      minUsd: internalPriceToUsdString(validated.min, token.decimals),
      maxUsd: internalPriceToUsdString(validated.max, token.decimals),
      blockNumber: block,
    };
  }));
  return out;
}

/** 前端 /api/prices/tickers 应答（7 字段全必填，见 fx100-apps src/lib/api/tickers.ts 校验器） */
export function buildTickersPayload(prices: readonly ForkTokenPrice[], nowMs = Date.now()) {
  return prices.map((p) => ({
    tokenAddress: p.address,
    tokenSymbol: p.symbol,
    minPrice: p.minUsd,
    maxPrice: p.maxUsd,
    oracleDecimals: 8,
    updatedAt: nowMs,
    timestamp: Math.floor(nowMs / 1000),
  }));
}

/** 前端 /api/tokens 应答（SDK getTokensData 读 res.tokens；address 须与 SDK TOKENS 键一致） */
export function buildTokensPayload(chainId: number, tokens: readonly ForkPriceToken[]) {
  return {
    chainId,
    tokens: tokens.map((t) => ({ symbol: t.symbol, address: t.address, decimals: t.decimals, synthetic: false })),
  };
}

/** 链上读不到（datastream 类 provider 需 report 数据）时的静态兜底价：只进 tickers，不进 tokens 表 */
export interface StaticForkPrice extends ForkPriceToken {
  /** USD 十进制字符串，min=max */
  readonly usd: string;
  /** 说明（证据 priceBasis 用） */
  readonly reason: string;
}

export interface ForkRouteOptions extends ReadForkOraclePricesInput {
  /** 前端认为的链 ID（借用槽位，通常 84532） */
  readonly appChainId: number;
  /** 静态兜底价（如 WETH→native ETH：前端执行费 USD 估算需要 native 价；链上 executionFee=gasLimit×gasPrice 不受影响） */
  readonly staticPrices?: readonly StaticForkPrice[];
  /** 浏览器里 wagmi transport 硬打的公共 RPC，改写到 fork RPC；默认 https://sepolia.base.org */
  readonly publicRpcToRewrite?: string;
  /** tickers 读链缓存（前端 1s 轮询） */
  readonly cacheMs?: number;
}

export interface ForkRouteHandle {
  /** 最近一次读到的链上价格（供核对记录 UI 采集时的价基） */
  latest(): readonly ForkTokenPrice[] | undefined;
  /** 强制下次请求重读（推价后调用） */
  invalidate(): void;
  /** 被改写到 fork 的公共 RPC 请求计数（用于验证 wagmi 路径确实被接管） */
  rewrittenRpcCount(): number;
}

/**
 * 安装三组 route：
 *   1. **\/api/prices/tickers**  → fork Oracle min/max（同源与远端两条链路一并覆盖）
 *   2. **\/api/tokens**          → 含 fork 新市场 index token 的代币表
 *   3. <publicRpcToRewrite>/**   → continue 到 fork RPC（wagmi transport 动态 env 未内联的兜底）
 * 另把 /api/prices/24h 置空数组（否则 500 → 前端重试噪音）。
 */
export async function installForkPriceRoutes(page: Page, options: ForkRouteOptions): Promise<ForkRouteHandle> {
  const cacheMs = options.cacheMs ?? 1_000;
  let cached: { at: number; prices: ForkTokenPrice[] } | undefined;
  let inflight: Promise<ForkTokenPrice[]> | undefined;
  let rewritten = 0;
  // 前端每秒轮询 + SDK 并发拉取：同一时刻只发一组链上读（in-flight 去重），否则请求堆积触发前端 5s 超时
  const staticEntries: ForkTokenPrice[] = (options.staticPrices ?? []).map((item) => {
    const scale = 10n ** BigInt(30 - item.decimals);
    const [whole = '0', frac = ''] = item.usd.split('.');
    const internal = BigInt(whole) * scale + BigInt((frac + '0'.repeat(30 - item.decimals)).slice(0, 30 - item.decimals) || '0');
    return {
      symbol: item.symbol, address: item.address, decimals: item.decimals,
      provider: '0x0000000000000000000000000000000000000000',
      minInternal: internal, maxInternal: internal, minUsd: item.usd, maxUsd: item.usd, blockNumber: 0n,
    };
  });
  const readPrices = async () => {
    if (cached && Date.now() - cached.at < cacheMs) return cached.prices;
    if (!inflight) {
      inflight = readForkOraclePrices(options)
        .then((prices) => { cached = { at: Date.now(), prices: [...prices, ...staticEntries] }; return cached.prices; })
        .finally(() => { inflight = undefined; });
    }
    return inflight;
  };
  // 预热：goto 之前先读一次，首屏 tickers 立即命中缓存
  await readPrices().catch(() => undefined);

  await page.route('**/api/prices/tickers**', async (route) => {
    try {
      const prices = await readPrices();
      await route.fulfill({ json: buildTickersPayload(prices), headers: { 'access-control-allow-origin': '*' } });
    } catch (error) {
      await route.fulfill({ status: 500, body: `fork price feed error: ${error instanceof Error ? error.message : String(error)}` });
    }
  });
  await page.route('**/api/tokens**', (route) =>
    route.fulfill({ json: buildTokensPayload(options.appChainId, options.tokens), headers: { 'access-control-allow-origin': '*' } }));
  await page.route('**/api/prices/24h**', (route) => route.fulfill({ json: [], headers: { 'access-control-allow-origin': '*' } }));

  const publicRpc = (options.publicRpcToRewrite ?? 'https://sepolia.base.org').replace(/\/$/, '');
  await page.route(`${publicRpc}/**`, (route) => {
    rewritten += 1;
    return route.continue({ url: options.rpcUrl });
  });
  await page.route(publicRpc, (route) => {
    rewritten += 1;
    return route.continue({ url: options.rpcUrl });
  });

  return {
    latest: () => cached?.prices,
    invalidate: () => { cached = undefined; },
    rewrittenRpcCount: () => rewritten,
  };
}

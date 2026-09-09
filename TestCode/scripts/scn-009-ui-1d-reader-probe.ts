/**
 * 1-D 定位探针：在 runMarketFlow 全平前停点，从 Node 侧用前端 SDK 同样的 Reader 调用与参数读仓位，
 * 把「链上 Reader 是否返回仓位」与「前端 SDK 过滤」分开。不开浏览器。
 *
 *   E2E_ENV=tx-fork E2E_ENV_PRIORITY_KEYS=E2E_ENV npx tsx scripts/scn-009-ui-1d-reader-probe.ts
 */
import { createPublicClient, getAddress, http, zeroAddress } from 'viem';

import { loadDeploymentAbi, loadDeploymentManifest } from '../src/config/deployment.js';
import { resolveMockMarketBundle } from '../src/config/mock-resources.js';
import { loadRuntimeConfig } from '../src/config/runtime.js';
import { runMarketFlow, type MarketFlowBeforeCloseContext } from '../src/scenarios/scn-009-runner.js';
import { readForkOraclePrices } from '../src/ui/fork-price-feed.js';

function jsonReplacer(_k: string, v: unknown) { return typeof v === 'bigint' ? v.toString() : v; }

async function main() {
  const runtime = loadRuntimeConfig();
  const manifest = await loadDeploymentManifest(runtime.deploymentManifestPath);
  const bundle = await resolveMockMarketBundle(runtime.environment, process.env.E2E_MARKET_RESOURCE_ALIAS ?? 'default-mock');
  if (!bundle.token || !bundle.market) throw new Error('缺 token/market 登记');
  const abi = await loadDeploymentAbi(manifest, 'Reader');
  const reader = getAddress(manifest.contracts.reader);
  const referralStorage = getAddress(manifest.additionalContracts.referralStorage ?? (() => { throw new Error('绑定 manifest 缺少 referralStorage'); })());
  const collateralToken = bundle.collateralToken?.address;
  if (!collateralToken) throw new Error('缺 collateralToken 登记');
  const client = createPublicClient({ transport: http(runtime.rpcUrl, { timeout: 30_000 }) });

  const evidence = await runMarketFlow(runtime, {
    scenarioId: 'SCN-009-UI-1D-READER-PROBE',
    isLong: true,
    beforeClose: async (ctx: MarketFlowBeforeCloseContext) => {
      const out: Record<string, unknown> = { block: ctx.snapshotBlock, trader: ctx.trader, marketIndex: ctx.marketIndex, positionKey: ctx.positionKey };
      // 1) 无价格参数的原始仓位列表
      try {
        const raw = await client.readContract({ address: reader, abi, functionName: 'getAccountPositions', args: [getAddress(ctx.dataStore), ctx.trader, 0n, 1000n] }) as unknown[];
        out.getAccountPositions = { count: raw.length, sample: raw.slice(0, 2) };
      } catch (error) { out.getAccountPositionsError = String(error instanceof Error ? error.message.split('\n')[0] : error); }
      // 2) 与 SDK 相同参数的 getAccountPositionInfoList（市场 [27]，价格 = fork provider min/max 内部刻度）
      const prices = await readForkOraclePrices({ rpcUrl: runtime.rpcUrl, dataStore: ctx.dataStore, oracle: ctx.oracle, tokens: [
        { symbol: bundle.token!.symbol, address: bundle.token!.address.toLowerCase(), decimals: bundle.token!.decimals },
        { symbol: 'USDC', address: collateralToken.toLowerCase(), decimals: bundle.collateralToken!.decimals },
      ] });
      const idx = prices.find((p) => p.symbol === bundle.token!.symbol)!;
      const usdc = prices.find((p) => p.symbol === 'USDC')!;
      const marketPrices = [{ indexTokenPrice: { min: idx.minInternal, max: idx.maxInternal }, collateralTokenPrice: { min: usdc.minInternal, max: usdc.maxInternal } }];
      out.pricesUsed = marketPrices;
      for (const [label, account] of [['checksum', getAddress(ctx.trader)], ['lowercase', ctx.trader.toLowerCase()]] as const) {
        try {
          const list = await client.readContract({ address: reader, abi, functionName: 'getAccountPositionInfoList', args: [getAddress(ctx.dataStore), referralStorage, account as `0x${string}`, [BigInt(ctx.marketIndex)], marketPrices, zeroAddress, 0n, 1000n] }) as Array<Record<string, unknown>>;
          out[`infoList_${label}`] = { count: list.length, first: list[0] ? { position: (list[0] as { position?: unknown }).position, basePnlUsd: (list[0] as { basePnlUsd?: unknown }).basePnlUsd } : null };
        } catch (error) { out[`infoList_${label}Error`] = String(error instanceof Error ? error.message.split('\n').slice(0, 3).join(' | ') : error); }
      }
      // 3) 也试一下把 [27] 换成 [1,2,27]（SDK 会把 marketsInfoData 全部 key 传入）
      try {
        const list = await client.readContract({ address: reader, abi, functionName: 'getAccountPositionInfoList', args: [getAddress(ctx.dataStore), referralStorage, getAddress(ctx.trader), [BigInt(ctx.marketIndex)], marketPrices, zeroAddress, 0n, 10n] }) as unknown[];
        out.infoList_end10 = { count: list.length };
      } catch (error) { out.infoList_end10Error = String(error instanceof Error ? error.message.split('\n')[0] : error); }
      console.log(JSON.stringify(out, jsonReplacer, 2));
      return out;
    },
  });
  console.log('assertions:', evidence.assertions.filter((a) => a.passed).length, '/', evidence.assertions.length);
}

main().catch((error) => { console.error(error); process.exit(1); });

// 模拟交易生成器：用多个 noise trader 在 tx-fork 的 default-mock 市场铺底真实交易，
// 使环境数据更复杂（双侧非零 OI、Skew、Funding 累加器启动、多仓位并存）。
// **交易不做任何核验**（按设计），只输出交易哈希与铺底后的市场概览。
//
// ⚠️ 使用纪律：在跑用例批次「之前」铺底运行——被测用例的窗口纯净度断言会把
//    并发的第三方账本变动如实判 FAIL（这正是该断言的职责）。铺底完成后的静态
//    仓位不影响核对（期望模型全部基于 before 快照的增量）。
//
// 用法：
//   npm run env:noise:trades                        # 默认 3 个内置 trader × 2 单，留仓
//   npm run env:noise:trades -- --orders 4          # 每 trader 4 单
//   npm run env:noise:trades -- --traders 0xA,0xB   # 指定 trader（或配 E2E_NOISE_TRADER_ACCOUNTS）
//   npm run env:noise:trades -- --close             # 铺底后随即全平（只留成交历史与 funding 痕迹）
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

import dotenv from 'dotenv';
import { getAddress, keccak256, toHex } from 'viem';

import { resolveMockMarketBundle } from '../src/config/mock-resources.js';
import {
  cumulativeOpenCostsKey,
  openInterestInTokensKey,
} from '../src/drivers/ledger.js';
import {
  freshOracleTimestamp,
  readMockOracleState,
  sendSetMockPrice,
} from '../src/drivers/mock-oracle.js';

dotenv.config({ path: '.env', quiet: true });
dotenv.config({ path: '.env.local', quiet: true, override: true });

// 内置 noise trader（fork 上 impersonation 免私钥；地址仅需格式合法且互不冲突）
const BUILTIN_NOISE_TRADERS = [
  '0x1001000000000000000000000000000000000001',
  '0x1002000000000000000000000000000000000002',
  '0x1003000000000000000000000000000000000003',
];

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function legacyPath(...parts: string[]): string {
  return resolve(process.cwd(), 'tools/fx100-legacy', ...parts);
}

async function rawRpc(url: string, method: string, params: readonly unknown[]): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const body = await response.json() as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message ?? 'unknown RPC error'}`);
  return body.result;
}

async function waitReceipt(url: string, txHash: string, timeoutMs = 60_000): Promise<{ status?: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const receipt = await rawRpc(url, 'eth_getTransactionReceipt', [txHash]) as { status?: string } | null;
    if (receipt) return receipt;
    await new Promise((resolveWait) => { setTimeout(resolveWait, 500); });
  }
  throw new Error(`交易 ${txHash} 超时未上链`);
}

/** 伪随机但可复现：keccak(trader, index) 派生方向与规模 */
function tradeParams(trader: string, index: number): { isLong: boolean; collateral: bigint; sizeUsd: bigint } {
  const seed = keccak256(toHex(`${trader.toLowerCase()}-${index}`, { size: 64 }));
  const bytes = BigInt(seed);
  const isLong = bytes % 2n === 0n;
  const collateralUsdc = 5n + (bytes >> 8n) % 16n;        // 5–20 USDC
  const leverage = 2n + (bytes >> 16n) % 4n;              // 2–5x
  return {
    isLong,
    collateral: collateralUsdc * 10n ** 6n,
    sizeUsd: collateralUsdc * leverage * 10n ** 30n,
  };
}

async function main(): Promise<void> {
  const rpcUrl = process.env.E2E_TX_FORK_RPC_URL;
  const adminRpcUrl = process.env.E2E_TX_FORK_ADMIN_RPC_URL ?? rpcUrl;
  const keeperAccount = process.env.E2E_KEEPER_ACCOUNT;
  if (!rpcUrl || !keeperAccount) throw new Error('需要 E2E_TX_FORK_RPC_URL 与 E2E_KEEPER_ACCOUNT');

  const traders = (argValue('--traders') ?? process.env.E2E_NOISE_TRADER_ACCOUNTS ?? BUILTIN_NOISE_TRADERS.join(','))
    .split(',').map((item) => getAddress(item.trim()));
  const ordersPerTrader = Number(argValue('--orders') ?? '2');
  const closeAfter = process.argv.includes('--close');

  const bundle = await resolveMockMarketBundle('tx-fork', 'default-mock');
  const marketIndex = bundle.market!.marketIndex!;
  const usdc = getAddress(bundle.collateralToken!.address);

  const [deploymentModule, actionsModule, keysModule, runnerModule] = await Promise.all([
    import(pathToFileURL(legacyPath('tool/onchain-tx/lib/deployment.mjs')).href),
    import(pathToFileURL(legacyPath('integration/lib/actions.mjs')).href),
    import(pathToFileURL(legacyPath('tool/onchain-tx/lib/keys.mjs')).href),
    import('../src/scenarios/scn-009-runner.js'),
  ]);
  const deploymentDir = resolve(process.cwd(), '../Github/fx100-contracts@release-v0.3.1/base_sepolia_v0.3.1_260729');
  const baseDeployment = deploymentModule.loadDeployment(deploymentDir);
  const deployment = { ...baseDeployment, addresses: { ...baseDeployment.addresses, usdc } };
  const broadcaster = await actionsModule.impersonateBroadcaster({ rpcUrl, deploymentDir });
  const castModule = await import(pathToFileURL(legacyPath('tool/onchain-tx/lib/cast.mjs')).href);
  const deps = { calldata: castModule.calldata };

  // Oracle 时间戳自愈（否则执行必因价格过期取消）
  for (const oracle of [bundle.oracle!.address, bundle.collateralOracle!.address]) {
    const state = await readMockOracleState(rpcUrl, oracle);
    await sendSetMockPrice({
      adminRpcUrl: adminRpcUrl!,
      from: traders[0]!,
      oracle,
      priceRaw: state.answer,
      timestamp: freshOracleTimestamp(state.latestBlockTimestamp),
    });
  }
  console.log('✔ Mock Oracle 时间戳已刷新');

  // Keeper 执行走 impersonation（noise 交易不需要真实签名证据）
  const runtimeLike = {
    rpcUrl,
    adminRpcUrl,
    requestTimeoutMs: 30_000,
  } as never;
  const providers = await runnerModule.inlineOracleProviders(
    { ...(runtimeLike as object), rpcUrl } as never,
    deployment as never,
    bundle.token!.address,
  );

  const executed: Array<{ trader: string; orderKey: string; txHash: string; isLong: boolean; sizeUsd: string; closed: boolean }> = [];
  for (const trader of traders) {
    // 注资：ETH + Mock USDC + Router 授权（全部 admin/impersonation，不留私钥痕迹）
    await rawRpc(adminRpcUrl!, 'tenderly_setBalance', [[trader], toHex(10n * 10n ** 18n)]);
    await rawRpc(adminRpcUrl!, 'tenderly_setErc20Balance', [usdc, trader, toHex(1_000_000n * 10n ** 6n)]);
    const approveTx = await rawRpc(adminRpcUrl!, 'eth_sendTransaction', [{
      from: trader,
      to: usdc,
      data: deps.calldata('approve(address,uint256)', [deployment.addresses.router, (2n ** 256n - 1n).toString()]),
    }]);
    await waitReceipt(adminRpcUrl!, approveTx as string);
    console.log(`✔ ${trader} 注资与授权完成`);

    for (let index = 0; index < ordersPerTrader; index += 1) {
      const params = tradeParams(trader, index);
      const created = await broadcaster.send({
        ...actionsModule.buildIncreaseMulticall({
          exchangeRouter: deployment.addresses.exchangeRouter,
          orderVault: deployment.addresses.orderVault,
          collateralToken: usdc,
          account: trader,
          marketIndex,
          isLong: params.isLong,
          sizeDeltaUsd: params.sizeUsd,
          collateral: params.collateral,
          executionFee: 20_000_000_000_000n,
        }),
        from: trader,
      });
      if (!created.ok || !created.orderKey) {
        console.log(`✘ ${trader} #${index} 创建失败：${created.error ?? created.txHash}（noise 不核验，跳过）`);
        continue;
      }
      const execute = runnerModule.buildInlineExecuteOrder(deps as never, deployment as never, created.orderKey, bundle.token!.address, providers);
      const execTx = await rawRpc(adminRpcUrl!, 'eth_sendTransaction', [{
        from: keeperAccount, to: execute.to, data: execute.data,
      }]);
      const execReceipt = await waitReceipt(adminRpcUrl!, execTx as string);
      const ok = execReceipt.status === '0x1';
      console.log(`${ok ? '✔' : '✘'} ${trader} #${index} ${params.isLong ? '开多' : '开空'} ${params.sizeUsd / 10n ** 30n} USD → ${created.txHash.slice(0, 12)}…`);
      let closed = false;
      if (ok && closeAfter) {
        const closeCreated = await broadcaster.send({
          ...actionsModule.buildDecreaseOrder({
            exchangeRouter: deployment.addresses.exchangeRouter,
            orderVault: deployment.addresses.orderVault,
            account: trader,
            marketIndex,
            isLong: params.isLong,
            sizeDeltaUsd: params.sizeUsd,
            collateralDelta: 0n,
            executionFee: 20_000_000_000_000n,
          }),
          from: trader,
        });
        if (closeCreated.ok && closeCreated.orderKey) {
          const closeExec = runnerModule.buildInlineExecuteOrder(deps as never, deployment as never, closeCreated.orderKey, bundle.token!.address, providers);
          const closeTx = await rawRpc(adminRpcUrl!, 'eth_sendTransaction', [{ from: keeperAccount, to: closeExec.to, data: closeExec.data }]);
          const closeReceipt = await waitReceipt(adminRpcUrl!, closeTx as string);
          closed = closeReceipt.status === '0x1';
        }
      }
      executed.push({
        trader, orderKey: created.orderKey, txHash: created.txHash,
        isLong: params.isLong, sizeUsd: (params.sizeUsd / 10n ** 30n).toString(), closed,
      });
    }
  }

  // 铺底后市场概览（只读展示，不做核对）
  const mi = BigInt(marketIndex);
  const readUint = async (key: `0x${string}`): Promise<bigint> => BigInt(await rawRpc(rpcUrl, 'eth_call', [{
    to: deployment.addresses.dataStore,
    data: deps.calldata('getUint(bytes32)', [key]),
  }, 'latest']) as string);
  const [oiLong, oiShort, costsLong, costsShort] = await Promise.all([
    readUint(openInterestInTokensKey(mi, true)),
    readUint(openInterestInTokensKey(mi, false)),
    readUint(cumulativeOpenCostsKey(mi, true)),
    readUint(cumulativeOpenCostsKey(mi, false)),
  ]);
  console.log('\n=== 铺底完成（noise 交易不核验） ===');
  console.log(`成交 ${executed.length} 单（${executed.filter((item) => item.isLong).length} 多 / ${executed.filter((item) => !item.isLong).length} 空${closeAfter ? `，其中 ${executed.filter((item) => item.closed).length} 单已随即平仓` : '，全部留仓'}）`);
  console.log(`市场 #${marketIndex}：Long OI ${oiLong} tokens ｜ Short OI ${oiShort} tokens`);
  console.log(`开仓成本：Long ${costsLong / 10n ** 30n} USD ｜ Short ${costsShort / 10n ** 30n} USD`);
  console.log('提醒：请在跑用例批次前铺底；与批次并发会被用例的窗口纯净度断言如实拦截。');
}

await main();

// 模拟交易生成器：用多个 noise trader 在 tx-fork 的 default-mock 市场铺底真实交易，
// 使环境数据更复杂（双侧非零 OI、Skew、Funding 累加器启动、多仓位并存）。
// **交易不做任何核验**（按设计），只输出交易哈希与铺底后的市场概览。
//
// ⚠️ 使用纪律：在跑用例批次「之前」铺底运行——被测用例的窗口纯净度断言会把
//    并发的第三方账本变动如实判 FAIL（这正是该断言的职责）。铺底完成后的静态
//    仓位不影响核对（期望模型全部基于 before 快照的增量）。
//
// 用法：
//   npm run env:noise:trades -- --plan <plan.json>  # 按造数据计划执行（页面「Faucet & 交易」编辑保存的 JSON）
//   npm run env:noise:trades                        # 无计划：兼容模式，3 个内置 trader × 2 单伪随机，留仓
//   npm run env:noise:trades -- --orders 4          # 兼容模式：每 trader 4 单
//   npm run env:noise:trades -- --traders 0xA,0xB   # 兼容模式：指定 trader（或配 E2E_NOISE_TRADER_ACCOUNTS）
//   npm run env:noise:trades -- --close             # 铺底后随即全平（只留成交历史与 funding 痕迹）
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

import dotenv from 'dotenv';
import { createPublicClient, createWalletClient, defineChain, getAddress, http, keccak256, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { resolveMockMarketBundle } from '../src/config/mock-resources.js';
import { expandPlan, noisePlanSchema, planTraders, summarizePlan, type NoisePlan, type PlannedOrder, type TraderWalletBundle } from '../src/domain/noise-plan.js';
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

/** 本机真实钱包私钥束（config/noise-traders.secret.json）；不存在则返回空 map（走 impersonation） */
async function loadWalletSecrets(): Promise<Map<string, `0x${string}`>> {
  const map = new Map<string, `0x${string}`>();
  try {
    const bundle = JSON.parse(await readFile(resolve(process.cwd(), 'config/noise-traders.secret.json'), 'utf8')) as TraderWalletBundle;
    for (const wallet of bundle.wallets ?? []) map.set(wallet.address.toLowerCase(), wallet.privateKey);
  } catch {
    // 无私钥束
  }
  return map;
}

/** viem 私钥签名广播器：与 legacy impersonateBroadcaster 同形状（send → {ok, txHash, blockNumber, orderKey}） */
function signingBroadcaster(input: {
  rpcUrl: string; chainId: number; secrets: Map<string, `0x${string}`>;
  extractOrderKey: (result: string) => `0x${string}` | null;
}) {
  const chain = defineChain({ id: input.chainId, name: 'FX100 Fork', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [input.rpcUrl] } } });
  const publicClient = createPublicClient({ chain, transport: http(input.rpcUrl) });
  return {
    mode: 'private-key',
    async send({ to, data, from, value = '0', label }: { to: string; data: `0x${string}`; from: string; value?: string; label?: string }) {
      const privateKey = input.secrets.get(from.toLowerCase());
      if (!privateKey) throw new Error(`钱包 ${from} 无私钥（不在 secret 束中）`);
      const account = privateKeyToAccount(privateKey);
      const wallet = createWalletClient({ account, chain, transport: http(input.rpcUrl) });
      // 先 eth_call 模拟拿 orderKey（与 legacy 同口径），失败即返回可读错误
      let simulated: `0x${string}`;
      try {
        simulated = (await publicClient.call({ account, to: to as `0x${string}`, data, value: BigInt(value) })).data ?? '0x';
      } catch (error) {
        return { ok: false, simulated: true, error: error instanceof Error ? error.message.split('\n')[0] : String(error), label };
      }
      const txHash = await wallet.sendTransaction({ account, chain, to: to as `0x${string}`, data, value: BigInt(value) });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 });
      return {
        ok: receipt.status === 'success', simulated: false, txHash, blockNumber: Number(receipt.blockNumber),
        gasUsed: receipt.gasUsed.toString(), orderKey: input.extractOrderKey(simulated),
        error: receipt.status === 'success' ? null : '交易 reverted', label,
      };
    },
  };
}

async function main(): Promise<void> {
  const rpcUrl = process.env.E2E_TX_FORK_RPC_URL;
  const adminRpcUrl = process.env.E2E_TX_FORK_ADMIN_RPC_URL ?? rpcUrl;
  const keeperAccount = process.env.E2E_KEEPER_ACCOUNT;
  if (!rpcUrl || !keeperAccount) throw new Error('需要 E2E_TX_FORK_RPC_URL 与 E2E_KEEPER_ACCOUNT');

  // 计划模式（页面/JSON）优先；无计划则退回兼容模式（内置伪随机）
  const planPath = argValue('--plan');
  let plan: NoisePlan | undefined;
  if (planPath) {
    plan = noisePlanSchema.parse(JSON.parse(await readFile(resolve(process.cwd(), planPath), 'utf8')));
    const summary = summarizePlan(plan);
    console.log(`▶ 计划「${plan.name}」：${summary.traders} Trader，${summary.orders} 单（${summary.longs} 多 / ${summary.shorts} 空），总抵押 ${summary.totalCollateralUsdc} USDC，总规模 ${summary.totalSizeUsd} USD，最大单 ${summary.maxSingleSizeUsd} USD`);
  }
  const traders = plan
    ? planTraders(plan)
    : (argValue('--traders') ?? process.env.E2E_NOISE_TRADER_ACCOUNTS ?? BUILTIN_NOISE_TRADERS.join(','))
      .split(',').map((item) => getAddress(item.trim()));
  const ordersPerTrader = Number(argValue('--orders') ?? '2');
  const closeAfter = plan ? plan.closeAfter : process.argv.includes('--close');
  const fundingEth = plan ? BigInt(Math.round(Number(plan.funding.ethPerTrader) * 1e6)) * 10n ** 12n : 10n * 10n ** 18n;
  const fundingUsdc = plan ? BigInt(Math.round(Number(plan.funding.usdcPerTrader) * 1e6)) : 1_000_000n * 10n ** 6n;
  const plannedByTrader = new Map<string, PlannedOrder[]>();
  if (plan) for (const order of expandPlan(plan)) {
    const list = plannedByTrader.get(order.trader.toLowerCase()) ?? [];
    list.push(order);
    plannedByTrader.set(order.trader.toLowerCase(), list);
  }

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
  const secrets = await loadWalletSecrets();
  const allSigned = traders.length > 0 && traders.every((trader) => secrets.has(trader.toLowerCase()));
  const chainIdHex = await rawRpc(rpcUrl, 'eth_chainId', []) as string;
  const broadcaster = allSigned
    ? signingBroadcaster({ rpcUrl, chainId: Number(BigInt(chainIdHex)), secrets, extractOrderKey: actionsModule.extractOrderKey })
    : await actionsModule.impersonateBroadcaster({ rpcUrl, deploymentDir });
  console.log(allSigned
    ? `🔐 签名模式：${traders.length} 个 Trader 全部有本机私钥，订单由各钱包真实签名`
    : `👤 impersonation 模式：${secrets.size ? `${traders.filter((t) => !secrets.has(t.toLowerCase())).length} 个 Trader 无私钥，` : ''}走 admin RPC 免签名`);
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
    await rawRpc(adminRpcUrl!, 'tenderly_setBalance', [[trader], toHex(fundingEth)]);
    await rawRpc(adminRpcUrl!, 'tenderly_setErc20Balance', [usdc, trader, toHex(fundingUsdc)]);
    const approveData = deps.calldata('approve(address,uint256)', [deployment.addresses.router, (2n ** 256n - 1n).toString()]);
    if (allSigned) {
      const approved = await broadcaster.send({ to: usdc, data: approveData, from: trader, label: 'approve' });
      if (!approved.ok) throw new Error(`${trader} Router 授权失败：${approved.error ?? approved.txHash}`);
    } else {
      const approveTx = await rawRpc(adminRpcUrl!, 'eth_sendTransaction', [{ from: trader, to: usdc, data: approveData }]);
      await waitReceipt(adminRpcUrl!, approveTx as string);
    }
    console.log(`✔ ${trader} 注资与授权完成`);

    const plannedOrders = plannedByTrader.get(trader.toLowerCase());
    const orderCount = plannedOrders ? plannedOrders.length : ordersPerTrader;
    for (let index = 0; index < orderCount; index += 1) {
      const planned = plannedOrders?.[index];
      const params = planned
        ? { isLong: planned.isLong, collateral: planned.collateralRaw, sizeUsd: planned.sizeUsdRaw }
        : tradeParams(trader, index);
      if (plan && plan.maxDelaySeconds > 0) {
        await new Promise((resolveWait) => { setTimeout(resolveWait, Math.floor(Math.random() * plan!.maxDelaySeconds * 1000)); });
      }
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
      const detail = planned ? `（${planned.ruleLabel}｜${(Number(planned.collateralRaw) / 1e6).toFixed(0)} USDC × ${planned.leverage}x）` : '';
      console.log(`${ok ? '✔' : '✘'} ${trader} #${index} ${params.isLong ? '开多' : '开空'} ${params.sizeUsd / 10n ** 30n} USD${detail} → ${created.txHash.slice(0, 12)}…`);
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

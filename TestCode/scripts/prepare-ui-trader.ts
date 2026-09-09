/**
 * 为「前端显示值观测」准备一个干净的专用 trader（docs/07 Phase 1-D）。
 *
 * 为什么需要：共享 trader 0xEEeA… 在 tx-fork 上留有 2026-08-05/07 早期 bundle 的 3 个历史仓位
 * （市场 11/15/23）。前端 SDK 用 Reader.getAccountPositionInfoList 只传 marketsInfoData 里的市场价格，
 * Reader 遍历账户全部仓位、缺任一市场价格即 revert EmptyMarketPrice → 前端持仓列表整体为空
 * （2026-08-19 实证；亦是前端健壮性缺陷，见 docs/07 需求 F）。用零历史的专用地址即可绕开。
 *
 * 做三件事（幂等，仅 Tenderly 私有 fork）：
 *   1. tenderly_setBalance      → 10 ETH
 *   2. tenderly_setErc20Balance → USDC 余额补到 10,000（已 ≥ 则跳过）
 *   3. impersonation approve    → USDC.approve(Router, MAX)（allowance 已足够则跳过）
 *
 *   E2E_ENV=tx-fork E2E_ENV_PRIORITY_KEYS=E2E_ENV npx tsx scripts/prepare-ui-trader.ts [--account 0x…]
 *   （不传 --account 时优先取 .env.local 的 E2E_UI_TEST_ACCOUNT，其次 E2E_UI_TEST_ACCOUNT 环境变量，最后兜底合成地址）
 *   随后用 ui 档案跑 UI 观测（private-key 模式 → 全签名 PASS 级证据；密钥留在 .env.local，命令行只传 profile）：
 *   E2E_ENV=tx-fork E2E_TRADER_PROFILE=ui E2E_UI_COLLECT=true \
 *   E2E_ENV_PRIORITY_KEYS=E2E_ENV,E2E_TRADER_PROFILE npx playwright test tests/S03/scn-022.spec.ts --project=tx-fork
 */
import { createPublicClient, encodeFunctionData, getAddress, http, maxUint256, parseAbi, parseEther, parseUnits, toHex } from 'viem';

import { loadRuntimeConfig } from '../src/config/runtime.js';
import { loadDeploymentManifest } from '../src/config/deployment.js';
import { assertRuntimeEnvironmentBinding } from '../src/config/environment-binding.js';

/** 兜底：合成地址（仅 impersonation 可用）；正式用法是 .env.local 的 E2E_UI_TEST_ACCOUNT（配套 E2E_UI_TEST_PRIVATE_KEY，private-key 模式出 PASS 级证据） */
export const DEFAULT_UI_TRADER = '0xF100000000000000000000000000000000000d01' as const;

const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
  'function decimals() view returns (uint8)',
]);

async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const body = await res.json() as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message ?? 'unknown'}`);
  return body.result;
}

async function main() {
  const runtime = loadRuntimeConfig();
  await assertRuntimeEnvironmentBinding(runtime);
  if (!runtime.adminRpcUrl) throw new Error(`环境 ${runtime.environment} 未配置 admin RPC，无法注资/免签授权`);
  const argIndex = process.argv.indexOf('--account');
  const account = getAddress(argIndex >= 0 ? process.argv[argIndex + 1]! : (process.env.E2E_UI_TEST_ACCOUNT ?? DEFAULT_UI_TRADER));
  console.log(`UI trader = ${account}${argIndex >= 0 ? '（--account）' : process.env.E2E_UI_TEST_ACCOUNT ? '（.env.local E2E_UI_TEST_ACCOUNT）' : '（兜底合成地址，仅 impersonation）'}`);
  const manifest = await loadDeploymentManifest(runtime.deploymentManifestPath);
  const usdc = getAddress(manifest.additionalContracts.mockUsdc ?? (() => { throw new Error('绑定 manifest 缺少 mockUsdc'); })());
  const router = getAddress(manifest.additionalContracts.router ?? (() => { throw new Error('绑定 manifest 缺少 router'); })());
  const client = createPublicClient({ transport: http(runtime.rpcUrl, { timeout: 30_000 }) });

  const [ethBefore, decimals] = await Promise.all([client.getBalance({ address: account }), client.readContract({ address: usdc, abi: erc20Abi, functionName: 'decimals' })]);
  const targetUsdc = parseUnits('10000', Number(decimals));
  const usdcBefore = await client.readContract({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [account] });
  const allowanceBefore = await client.readContract({ address: usdc, abi: erc20Abi, functionName: 'allowance', args: [account, router] });

  const report: Record<string, unknown> = { environment: runtime.environment, chainId: runtime.chainId, account, usdc, router, ethBefore: ethBefore.toString(), usdcBefore: usdcBefore.toString(), allowanceBefore: allowanceBefore.toString() };

  if (ethBefore < parseEther('1')) {
    await rpc(runtime.adminRpcUrl, 'tenderly_setBalance', [[account], toHex(parseEther('10'))]);
    report.ethFunded = '10 ETH';
  }
  if (usdcBefore < targetUsdc) {
    await rpc(runtime.adminRpcUrl, 'tenderly_setErc20Balance', [usdc, account, toHex(targetUsdc)]);
    report.usdcFunded = '10000 USDC';
  }
  if (allowanceBefore < targetUsdc) {
    const data = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [router, maxUint256] });
    const txHash = await rpc(runtime.adminRpcUrl, 'eth_sendTransaction', [{ from: account, to: usdc, data }]) as `0x${string}`;
    const receipt = await client.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });
    report.approveTx = txHash;
    report.approveStatus = receipt.status;
  }
  report.ethAfter = (await client.getBalance({ address: account })).toString();
  report.usdcAfter = (await client.readContract({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [account] })).toString();
  report.allowanceAfter = (await client.readContract({ address: usdc, abi: erc20Abi, functionName: 'allowance', args: [account, router] })).toString();
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });

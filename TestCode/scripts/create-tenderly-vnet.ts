import { TenderlyForkManager } from '../src/server/tenderly-forks.js';

/**
 * 一键创建 / 删除 Tenderly Virtual TestNet（固定 Chain ID）并回填环境配置。
 *   npm run env:vnet:create -- --env time-fork [--block <十进制区块>] [--chain-id 99913] [--name "显示名"] [--no-registry] [--dry-run]
 *   npm run env:vnet:delete -- --env time-fork            （按环境删最近一次创建的 VNet）
 *   npm run env:vnet:delete -- --environment-id <uuid>
 * 成功后：.env.local 的 RPC/Admin RPC/WSS/Chain ID 已回填，config/tenderly-vnets.json 与 Docs/contract-releases/CURRENT.json 已登记；
 * 下一步在环境页 ③ 初始化 Mock Market Bundle（或 `E2E_ENV=<env> E2E_ENV_PRIORITY_KEYS=E2E_ENV npm run env:init:mock`）。
 * 输出不含任何 RPC URL / 凭证，只有主机名与 ID。
 */
function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const manager = new TenderlyForkManager(process.cwd());
  const environment = argument('--env');
  if (process.argv.includes('--list')) {
    console.log(JSON.stringify(await manager.list(), null, 2));
    return;
  }
  if (process.argv.includes('--delete')) {
    const environmentId = argument('--environment-id');
    const result = await manager.remove({ ...(environment ? { environment } : {}), ...(environmentId ? { environmentId } : {}) });
    console.log(`已删除 Tenderly Virtual TestNet：${result.environmentId}${result.environment ? `（${result.environment}）` : ''}（HTTP ${result.status}）；CURRENT.json 已置回 pending。`);
    return;
  }
  if (!environment) throw new Error('用法：--env <tx-fork|oracle-fork|time-fork> [--block N] [--chain-id N] [--name 显示名] [--no-registry] | --delete | --list');
  const block = argument('--block');
  const chainId = argument('--chain-id');
  const name = argument('--name');
  const result = await manager.create({
    environment,
    ...(block ? { blockNumber: block } : {}),
    ...(chainId ? { chainId: Number(chainId) } : {}),
    ...(name ? { displayName: name } : {}),
    ...(process.argv.includes('--no-registry') ? { updateRegistry: false } : {}),
    ...(process.argv.includes('--dry-run') ? { dryRun: true } : {}),
  });
  if ('dryRun' in result) {
    console.log(`[dry-run] ${result.endpoint}`);
    console.log(`[dry-run] body = ${JSON.stringify(result.requestBody, null, 2)}`);
    console.log(`[dry-run] 凭证${result.credentialsReady ? '就绪' : '未就绪'}${result.missing.length ? `：${result.missing.join('；')}` : ''}`);
    return;
  }
  console.log([
    `已创建 Tenderly Virtual TestNet：${result.displayName}`,
    `  environment=${result.environment} chainId=${result.chainId}（eth_chainId 已校验）parent=${result.parentNetworkId}${result.forkBlockNumber !== undefined ? ` forkBlock=${result.forkBlockNumber}` : ''}`,
    `  tenderly environmentId=${result.environmentId}${result.vnetId ? ` vnetId=${result.vnetId}` : ''} rpcHost=${result.rpcHost}`,
    `  已回填 .env.local：主 RPC / Admin RPC / WSS / Chain ID；config/tenderly-vnets.json 已登记`,
    `  CURRENT.json：${result.baselineRegistryUpdated ? '已回写 environments.' + result.environment : '未回写'}${result.baselineRegistryNote ? `（${result.baselineRegistryNote}）` : ''}`,
    `  下一步：环境页 ③ 初始化 Mock Market Bundle，或 E2E_ENV=${result.environment} E2E_ENV_PRIORITY_KEYS=E2E_ENV npm run env:init:mock`,
  ].join('\n'));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

import {
  isTemporaryEnvironmentName,
  temporaryEnvironmentNames,
  temporaryEnvironments,
} from '../config/environments/catalog.js';
import { TenderlyForkManager, type TenderlyVNetRecord } from '../src/server/tenderly-forks.js';

/**
 * 一键创建 / 删除 Tenderly Virtual TestNet（固定 Chain ID）并回填环境配置。
 *   npm run env:vnet:create -- --env time-fork [--block <十进制区块>] [--chain-id 99913] [--name "显示名"] [--no-registry] [--dry-run] [--force]
 *   npm run env:vnet:delete -- --env time-fork            （按环境删最近一次创建的 VNet）
 *   npm run env:vnet:delete -- --environment-id <uuid>
 * 成功后：.env.local 的 RPC/Admin RPC/WSS/Chain ID 已回填，环境绑定复位到 Base 部署，
 * config/tenderly-vnets.json 与 Docs/contract-releases/CURRENT.json 已登记；
 * 下一步在环境页 ③ 初始化 Mock Market Bundle（或 `E2E_ENV=<env> E2E_ENV_PRIORITY_KEYS=E2E_ENV npm run env:init:mock`）。
 * 输出不含任何 RPC URL / 凭证，只有主机名与 ID。
 *
 * 覆盖护栏（2026-09-05 增补）：目标槽位在 config/tenderly-vnets.json 里还有「在用」记录时默认拒绝执行，
 * 只有显式 --force 才继续——重建会连锁改写该环境的 .env.local / 绑定 / CURRENT.json，
 * 对着别人正在跑的环境执行一次就会把对方的版本登记抹掉。--dry-run 不写任何文件，只告警不拦截。
 */
function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/** 该槽位当前「在用」（未删除）的登记记录，最近创建的在最后。 */
function activeRecords(records: readonly TenderlyVNetRecord[], environment: string): TenderlyVNetRecord[] {
  return records.filter((item) => item.environment === environment && !item.deletedAt);
}

/** 覆盖提示：说清楚会覆盖谁、覆盖什么、以及怎么才能继续。 */
function overwriteWarning(environment: string, record: TenderlyVNetRecord): string {
  return [
    `环境槽位 ${environment} 已登记在用的 Virtual TestNet：`,
    `  displayName=${record.displayName}`,
    `  chainId=${record.chainId} environmentId=${record.environmentId} createdAt=${record.createdAt}${record.forkBlockNumber !== undefined ? ` forkBlock=${record.forkBlockNumber}` : ''}`,
    '  重建会连锁改写：.env.local 的该环境 RPC/Admin RPC/WSS/Chain ID、config/environment-bindings.json 的该环境绑定',
    '  （复位到 Base 部署）、config/tenderly-vnets.json 的在用记录、Docs/contract-releases/CURRENT.json 的 environments.'
      + `${environment}（forkOf 复位 ⇒ 该 Fork 上已部署的合约与已初始化的 Mock Market 全部作废）。`,
    '  另一条会话可能正在这个环境上跑用例，重建等于把对方的环境和版本登记一起抹掉。',
  ].join('\n');
}

/** 临时槽位尚未接线时的提示：只登记了名字与固定 Chain ID，共享登记文件里还没有它。 */
function temporarySlotNotice(environment: string): string {
  const definition = temporaryEnvironments[environment as keyof typeof temporaryEnvironments];
  return [
    `环境槽位 ${environment} 已在 config/environments/catalog.ts 登记为临时槽位`
      + `（固定 chainId=${definition.fixedChainId}，环境变量前缀 ${definition.rpcEnvironmentVariable.replace(/_RPC_URL$/, '')}），`,
    '但共享登记文件里还没有这个名字，此时创建只会写出一份用不起来的配置，因此本命令不继续。',
    '接线清单（接完一条删一条）：',
    ...definition.pendingWiring.map((item, index) => `  ${index + 1}) ${item}`),
    '接线完成前，临时验证请沿用现有槽位并先与占用方确认；接线完成后本命令即可直接创建该槽位。',
  ].join('\n');
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
  if (!environment) throw new Error(`用法：--env <tx-fork|oracle-fork|time-fork|${temporaryEnvironmentNames.join('|')}> [--block N] [--chain-id N] [--name 显示名] [--no-registry] [--dry-run] [--force] | --delete | --list`);
  const block = argument('--block');
  const chainId = argument('--chain-id');
  const name = argument('--name');
  const dryRun = process.argv.includes('--dry-run');
  const force = process.argv.includes('--force');

  // 覆盖护栏：先看登记表，再决定要不要调用 Tenderly。对所有槽位一视同仁（含 tx-fork）。
  const occupied = activeRecords(await manager.list(), environment);
  const latest = occupied.at(-1);
  if (latest) {
    if (!dryRun && !force) {
      console.error([
        `拒绝执行：${overwriteWarning(environment, latest)}`,
        '  确认要覆盖：重跑同一条命令并加 --force；',
        '  只想看请求参数：加 --dry-run（不写任何文件）；',
        `  想换一个不打扰他人的槽位：--env ${temporaryEnvironmentNames[0]}（临时槽位，chainId=${temporaryEnvironments[temporaryEnvironmentNames[0]].fixedChainId}）。`,
      ].join('\n'));
      process.exitCode = 1;
      return;
    }
    console.warn(`[警告] ${overwriteWarning(environment, latest)}${dryRun ? '\n  当前是 --dry-run，不写任何文件；真实创建需要 --force。' : '\n  已按 --force 继续。'}`);
  }

  // 临时槽位只登记在 catalog，共享登记文件（绑定表 / mock 资源 / playwright project）尚未接线：优雅停下，不做半截创建。
  if (isTemporaryEnvironmentName(environment)) {
    console.error(temporarySlotNotice(environment));
    process.exitCode = 1;
    return;
  }
  // 其余名字（含拼错的）仍交给 TenderlyForkManager 校验，保持原有报错口径不变。
  const result = await manager.create({
    environment,
    ...(block ? { blockNumber: block } : {}),
    ...(chainId ? { chainId: Number(chainId) } : {}),
    ...(name ? { displayName: name } : {}),
    ...(process.argv.includes('--no-registry') ? { updateRegistry: false } : {}),
    ...(dryRun ? { dryRun: true } : {}),
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
    `  已回填 .env.local：主 RPC / Admin RPC / WSS / Chain ID；环境绑定已复位到 Base 部署；config/tenderly-vnets.json 已登记`,
    `  CURRENT.json：${result.baselineRegistryUpdated ? '已回写 environments.' + result.environment : '未回写'}${result.baselineRegistryNote ? `（${result.baselineRegistryNote}）` : ''}`,
    `  下一步：环境页 ③ 初始化 Mock Market Bundle，或 E2E_ENV=${result.environment} E2E_ENV_PRIORITY_KEYS=E2E_ENV npm run env:init:mock`,
  ].join('\n'));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

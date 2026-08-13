// typed ledger driver 与 legacy ledger.mjs 的等价性校验：
// ① key 派生对拍（cumulativeOpenCosts/openInterestInTokens/claimableFeeAmount/position）；
// ② 同一区块各采一份快照，逐槽位比对数值与 position 字段。
// 用法：npx tsx scripts/verify-ledger-driver.ts（需 tx-fork RPC 与 default-mock 已初始化）
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

import dotenv from 'dotenv';

import {
  checkLedgerConservation,
  claimableFeeAmountKey,
  cumulativeOpenCostsKey,
  LEDGER_BASE,
  ledgerDiff,
  openInterestInTokensKey,
  positionKey,
  takeLedgerSnapshot,
} from '../src/drivers/ledger.js';
import { resolveMockMarketBundle } from '../src/config/mock-resources.js';

dotenv.config({ path: '.env', quiet: true });
dotenv.config({ path: '.env.local', quiet: true, override: true });

function legacyPath(...parts: string[]): string {
  return resolve(process.cwd(), 'tools/fx100-legacy', ...parts);
}

async function main(): Promise<void> {
  const rpcUrl = process.env.E2E_TX_FORK_RPC_URL;
  const trader = process.env.E2E_TEST_ACCOUNT;
  if (!rpcUrl || !trader) throw new Error('需要 E2E_TX_FORK_RPC_URL 与 E2E_TEST_ACCOUNT');

  const [keysModule, ledgerModule, rpcModule, deploymentModule] = await Promise.all([
    import(pathToFileURL(legacyPath('tool/onchain-tx/lib/keys.mjs')).href),
    import(pathToFileURL(legacyPath('tool/onchain-tx/lib/ledger.mjs')).href),
    import(pathToFileURL(legacyPath('tool/config-dump/lib/rpc.mjs')).href),
    import(pathToFileURL(legacyPath('tool/onchain-tx/lib/deployment.mjs')).href),
  ]);

  const failures: string[] = [];
  const check = (name: string, ok: boolean, detail: string): void => {
    if (!ok) failures.push(`${name}: ${detail}`);
    console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : ` — ${detail}`}`);
  };

  // ① key 派生对拍
  const bundle = await resolveMockMarketBundle('tx-fork', 'default-mock');
  const mi = BigInt(bundle.market!.marketIndex!);
  const usdc = bundle.collateralToken!.address;
  const keyPairs: Array<[string, string, string]> = [
    ['cumulativeOpenCostsKey(long)', cumulativeOpenCostsKey(mi, true), keysModule.cumulativeOpenCostsKey(mi, true)],
    ['cumulativeOpenCostsKey(short)', cumulativeOpenCostsKey(mi, false), keysModule.cumulativeOpenCostsKey(mi, false)],
    ['openInterestInTokensKey(long)', openInterestInTokensKey(mi, true), keysModule.openInterestInTokensKey(mi, true)],
    ['claimableFeeAmountKey(position)', claimableFeeAmountKey(mi, usdc, LEDGER_BASE.POSITION_FEE_TYPE),
      keysModule.claimableFeeAmountKey(mi, usdc, keysModule.BASE.POSITION_FEE_TYPE)],
    ['claimableFeeAmountKey(funding)', claimableFeeAmountKey(mi, usdc, LEDGER_BASE.FUNDING_FEE_TYPE),
      keysModule.claimableFeeAmountKey(mi, usdc, keysModule.BASE.FUNDING_FEE_TYPE)],
    ['claimableFeeAmountKey(liquidation)', claimableFeeAmountKey(mi, usdc, LEDGER_BASE.LIQUIDATION_FEE_TYPE),
      keysModule.claimableFeeAmountKey(mi, usdc, keysModule.BASE.LIQUIDATION_FEE_TYPE)],
    ['positionKey', positionKey(trader, mi, true), keysModule.positionKey(trader, mi, true)],
  ];
  for (const [name, ts, legacy] of keyPairs) {
    check(`key 对拍 ${name}`, ts.toLowerCase() === String(legacy).toLowerCase(), `ts=${ts} legacy=${String(legacy)}`);
  }

  // ② 同区块快照对拍
  const deploymentDir = resolve(process.cwd(), '../Github/fx100-contracts@release-v0.3.1/base_sepolia_v0.3.1_260729');
  const baseDeployment = deploymentModule.loadDeployment(deploymentDir);
  const deployment = { ...baseDeployment, addresses: { ...baseDeployment.addresses, usdc } };
  const rpc = new rpcModule.Rpc(rpcUrl);
  const blockHex = await rpc.single('eth_blockNumber', []);
  const blockNumber = Number(BigInt(blockHex as string));
  const context = { trader, marketIndex: Number(bundle.market!.marketIndex!), isLong: true };

  const legacySnap = await ledgerModule.snapshot(rpc, deployment, context, blockNumber);
  const tsSnap = await takeLedgerSnapshot({
    rpcUrl,
    addresses: {
      usdc,
      dataStore: deployment.addresses.dataStore,
      orderVault: deployment.addresses.orderVault,
      positionVault: deployment.addresses.positionVault,
      feeHandler: deployment.addresses.feeHandler,
      lpVault: deployment.addresses.lpVault,
      reader: deployment.addresses.reader,
    },
    context: { trader, marketIndex: mi, isLong: true },
    blockNumber,
  });

  check('快照 posKey 一致', String(legacySnap.posKey).toLowerCase() === tsSnap.posKey.toLowerCase(),
    `legacy=${legacySnap.posKey} ts=${tsSnap.posKey}`);
  check('legacy 快照无缺读数', legacySnap.errors.length === 0, legacySnap.errors.join('；'));
  check('ts 快照无缺读数', tsSnap.errors.length === 0, tsSnap.errors.join('；'));

  const numericKeys = Object.keys(legacySnap.values).filter((key) => key !== 'position');
  for (const key of numericKeys) {
    const legacyValue = legacySnap.values[key];
    const tsValue = tsSnap.values[key];
    check(`槽位 ${key}`, String(legacyValue) === String(tsValue), `legacy=${String(legacyValue)} ts=${String(tsValue)}`);
  }
  const legacyPosition = legacySnap.values.position;
  const tsPosition = tsSnap.values.position;
  if (legacyPosition === null || legacyPosition === undefined) {
    check('position（双方均为空/不存在）', tsPosition === null || tsPosition === undefined || tsPosition.exists === false,
      `legacy=null ts=${JSON.stringify(tsPosition, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))}`);
  } else {
    for (const field of Object.keys(legacyPosition)) {
      const legacyField = (legacyPosition as Record<string, unknown>)[field];
      const tsField = (tsPosition as unknown as Record<string, unknown>)[field];
      check(`position.${field}`, String(legacyField).toLowerCase() === String(tsField).toLowerCase(),
        `legacy=${String(legacyField)} ts=${String(tsField)}`);
    }
  }

  // ③ diff / 守恒行为对拍（自反：同快照 diff 全零、守恒 PASS）
  const selfDiff = ledgerDiff(tsSnap, tsSnap);
  const conservation = checkLedgerConservation(selfDiff);
  check('自反 diff 全零 + 守恒 PASS', conservation.status === 'PASS' && conservation.sum === 0n,
    `status=${conservation.status} sum=${String(conservation.sum)}`);

  if (failures.length > 0) {
    console.error(`\n等价性校验失败 ${failures.length} 项`);
    process.exitCode = 1;
  } else {
    console.log('\ntyped ledger driver ≡ legacy ledger.mjs：全部一致');
  }
}

await main();

import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { loadRuntimeConfig } from '../../src/config/runtime.js';
import { applyCaseTrader } from '../../src/config/trader-roster.js';
import { runScn010, stringifyEvidence, type Scn010Evidence } from '../../src/scenarios/scn-010-runner.js';

async function rawRpc(url: string, method: string, params: readonly unknown[] = []): Promise<unknown> {
  const body = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }).then((response) => response.json()) as {
    result?: unknown;
    error?: { message?: string };
  };
  if (body.error) throw new Error(`${method}: ${body.error.message ?? 'unknown RPC error'}`);
  return body.result;
}

test.describe('S02 策略下单与订单管理', () => {
  test('SCN-010 现价下方限价开多｜Market Bundle 受控价格真实签名链路 @p0 @tx @oracle @serial', async ({}, testInfo) => {
    test.setTimeout(360_000);
    test.skip(testInfo.project.name !== 'oracle-fork', 'SCN-010 使用 oracle-fork 的双 Mock Oracle Market Bundle 构造精确价格边界');
    const runtime = await applyCaseTrader(loadRuntimeConfig(), 'SCN-010');
    const persistForkState = process.env.E2E_PERSIST_FORK_STATE === 'true';
    expect(runtime.signingMode, 'SCN-010 的用户与 Keeper 业务交易必须使用私钥签名').toBe('private-key');
    expect(runtime.hasPrimaryTestWallet, '缺少用户签名私钥').toBe(true);
    expect(runtime.hasSecondaryTestWallet, '缺少 Keeper 签名私钥').toBe(true);
    const adminRpcUrl = runtime.adminRpcUrl ?? runtime.rpcUrl;
    const snapshotId = await rawRpc(adminRpcUrl, 'evm_snapshot');
    let evidence: Scn010Evidence | undefined;
    let succeeded = false;

    try {
      evidence = await runScn010(runtime);
      const evidencePath = testInfo.outputPath('scn-010-evidence.json');
      await writeFile(evidencePath, stringifyEvidence(evidence), 'utf8');
      await testInfo.attach('scn-010-evidence.json', {
        path: evidencePath,
        contentType: 'application/json',
      });

      const txPath = testInfo.outputPath('tx-and-receipt.json');
      await writeFile(txPath, stringifyEvidence(evidence.transactions), 'utf8');
      await testInfo.attach('tx-and-receipt.json', {
        path: txPath,
        contentType: 'application/json',
      });

      const ledgerPath = testInfo.outputPath('reader-ledger-before-after.json');
      await writeFile(ledgerPath, stringifyEvidence({
        prices: evidence.prices,
        snapshots: evidence.snapshots,
        deltas: evidence.deltas,
        observations: evidence.observations,
      }), 'utf8');
      await testInfo.attach('reader-ledger-before-after.json', {
        path: ledgerPath,
        contentType: 'application/json',
      });

      testInfo.annotations.push({
        type: 'coverage-gap',
        description: '自动化范围是 RPC 签名 LimitIncrease、受控 Oracle、Keeper 与全平；页面与浏览器钱包操作由手工核对用例覆盖。',
      });
      testInfo.annotations.push({
        type: 'check-result',
        description: `链上 ${evidence.assertions.length} 项核对通过；已记录用户/ Keeper 四笔真实签名业务交易，并恢复双 Mock Oracle 状态。`,
      });
      succeeded = true;
    } finally {
      if (!persistForkState || !succeeded) {
        const reverted = await rawRpc(adminRpcUrl, 'evm_revert', [snapshotId]);
        expect(reverted).toBe(true);
      }
    }
  });
});

import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { loadRuntimeConfig } from '../../src/config/runtime.js';
import { runScn009, stringifyEvidence, type Scn009Evidence } from '../../src/scenarios/scn-009-runner.js';

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
  test('SCN-009 市价开多快速退出｜首轮真实链路证据验证 @p0 @tx @serial', async ({}, testInfo) => {
    // 真实签名的开仓 + 全平链路含 4 笔交易与三次全量账本快照，超出 playwright.config 的 90s 全局上限。
    test.setTimeout(360_000);
    test.skip(testInfo.project.name !== 'tx-fork', 'SCN-009 首轮只允许在 tx-fork 执行');
    const runtime = loadRuntimeConfig();
    const persistForkState = process.env.E2E_PERSIST_FORK_STATE === 'true';
    if (persistForkState) {
      expect(runtime.signingMode, '持久证据运行必须使用私钥签名').toBe('private-key');
    }
    const snapshotId = persistForkState
      ? undefined
      : await rawRpc(runtime.adminRpcUrl ?? runtime.rpcUrl, 'evm_snapshot');
    let evidence: Scn009Evidence | undefined;

    try {
      try {
        evidence = await runScn009(runtime);
      } catch (error) {
        // Service Keeper 未启动、连错 Fork 或未就绪属于执行环境阻塞，不能误记成协议功能 FAIL。
        if (runtime.keeperMode === 'service') {
          testInfo.annotations.push({
            type: 'blocked',
            description: `Service Keeper 专项未就绪：${error instanceof Error ? error.message : String(error)}`,
          });
        }
        throw error;
      }
      const evidencePath = testInfo.outputPath('scn-009-evidence.json');
      await writeFile(evidencePath, stringifyEvidence(evidence), 'utf8');
      await testInfo.attach('scn-009-evidence.json', {
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
        description: '自动化范围是 RPC 签名订单、Inline Keeper 与链上核对；页面加载和浏览器钱包操作由手工核对用例覆盖。',
      });
      testInfo.annotations.push({
        type: 'check-result',
        description: `链上 ${evidence.assertions.length} 项核对通过；已记录用户签名开仓/平仓、Keeper 签名执行及完整回执。`,
      });
    } finally {
      if (snapshotId !== undefined) {
        const reverted = await rawRpc(runtime.adminRpcUrl ?? runtime.rpcUrl, 'evm_revert', [snapshotId]);
        expect(reverted).toBe(true);
      }
    }
  });
});

import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { loadRuntimeConfig } from '../../src/config/runtime.js';
import { applyCaseTrader } from '../../src/config/trader-roster.js';
import { runMarketFlow, stringifyEvidence, type Scn009Evidence } from '../../src/scenarios/scn-009-runner.js';
import { resolveUiHooks, withUiHooks } from '../../src/ui/ui-collect-hook.js';

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
  test('SCN-013 趋势交易员破位追空｜StopIncrease short @p0 @tx @serial', async ({ page }, testInfo) => {
    // 破位追空（P−10% 下破）：StopIncrease short 挂单 → 推价下破触发 → Keeper 执行 → 全平（validFrom 生效时间维度留 S07 边界矩阵）。
    test.setTimeout(360_000);
    test.skip(testInfo.project.name !== 'tx-fork', 'SCN-013 在 tx-fork 执行（06-策略下单矩阵）');
    const runtime = await applyCaseTrader(loadRuntimeConfig(), 'SCN-013');
    const persistForkState = process.env.E2E_PERSIST_FORK_STATE === 'true';
    if (persistForkState) {
      expect(runtime.signingMode, '持久证据运行必须使用私钥签名').toBe('private-key');
    }
    const snapshotId = persistForkState
      ? undefined
      : await rawRpc(runtime.adminRpcUrl ?? runtime.rpcUrl, 'evm_snapshot');
    // 前端钩子（docs/07 Phase 2）：E2E_UI_COLLECT=true 全平前停点采平仓弹窗预览；E2E_UI_ORDER_ENTRY=true 市价开仓/全平改由页面点击发起（注入钱包 Node 侧签名）
    const uiHooks = await resolveUiHooks(runtime, page, testInfo);
    let evidence: Scn009Evidence | undefined;

    try {
      try {
        evidence = await runMarketFlow(runtime, withUiHooks({ scenarioId: 'SCN-013', isLong: false, openTrigger: { orderType: 6, offsetPercent: -10 } }, uiHooks));
      } catch (error) {
        if (runtime.keeperMode === 'service') {
          testInfo.annotations.push({
            type: 'blocked',
            description: `Service Keeper 专项未就绪：${error instanceof Error ? error.message : String(error)}`,
          });
        }
        throw error;
      }
      const evidencePath = testInfo.outputPath('scn-013-evidence.json');
      await writeFile(evidencePath, stringifyEvidence(evidence), 'utf8');
      await testInfo.attach('scn-013-evidence.json', {
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
        description: `链上 ${evidence.assertions.length} 项核对通过（StopIncrease short 破位追单链路）；已记录用户签名挂单/平仓、推价触发与 Keeper 执行完整回执。`,
      });
    } finally {
      if (snapshotId !== undefined) {
        const reverted = await rawRpc(runtime.adminRpcUrl ?? runtime.rpcUrl, 'evm_revert', [snapshotId]);
        expect(reverted).toBe(true);
      }
    }
  });
});

import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { loadRuntimeConfig } from '../../src/config/runtime.js';
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

test.describe('S07 订单类型全矩阵', () => {
  test('SCN-065 看空交易员立即开空，补齐 MarketIncrease short @p0 @tx @serial', async ({ page }, testInfo) => {
    // SCN-009 的方向对偶：市价开空 → 全平，走同一 runMarketFlow（isLong=false）。
    // 这是 P1 空头取整守卫（开仓 ⌈⌉、Short OI/开仓成本侧）的首条真实链路实证。
    test.setTimeout(360_000);
    test.skip(testInfo.project.name !== 'tx-fork', 'SCN-065 市价开空在 tx-fork 执行（06-策略下单矩阵）');
    const runtime = loadRuntimeConfig();
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
        evidence = await runMarketFlow(runtime, withUiHooks({ scenarioId: 'SCN-065', isLong: false }, uiHooks));
      } catch (error) {
        if (runtime.keeperMode === 'service') {
          testInfo.annotations.push({
            type: 'blocked',
            description: `Service Keeper 专项未就绪：${error instanceof Error ? error.message : String(error)}`,
          });
        }
        throw error;
      }
      const evidencePath = testInfo.outputPath('scn-065-evidence.json');
      await writeFile(evidencePath, stringifyEvidence(evidence), 'utf8');
      await testInfo.attach('scn-065-evidence.json', {
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
        description: `链上 ${evidence.assertions.length} 项核对通过（市价开空/全平对偶）；已记录用户签名开仓/平仓、Keeper 签名执行及完整回执。`,
      });
    } finally {
      if (snapshotId !== undefined) {
        const reverted = await rawRpc(runtime.adminRpcUrl ?? runtime.rpcUrl, 'evm_revert', [snapshotId]);
        expect(reverted).toBe(true);
      }
    }
  });
});

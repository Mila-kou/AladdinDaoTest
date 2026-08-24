import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { loadRuntimeConfig } from '../../src/config/runtime.js';
import { applyCaseTrader } from '../../src/config/trader-roster.js';
import { runMarketFlowMatrix, stringifyEvidence, type MarketFlowMatrixEvidence } from '../../src/scenarios/scn-009-runner.js';
import { resolveUiHooks, withUiHooks } from '../../src/ui/ui-collect-hook.js';

test.describe('S03 仓位管理与退出', () => {
  test('SCN-023 盈利时分批兑现｜部分平 50% 后清仓 @p0 @tx @serial', async ({ page }, testInfo) => {
    // 分批兑现数据集（06-策略下单矩阵 · long-decrease-profit）：
    // 开多 → +10% 推价 → 部分平 50%（中段阶段：多头部分平 ⌈⌉ 取整 + 瀑布部分平分支
    // output=盈利折算、押金留仓）→ 全平剩余 50%。P1 部分平守卫的首条真实链路实证。
    // 数据集矩阵模式：每个数据集独立 evm_snapshot/revert（runner 内部管理，
    // SCN-070 模式）；报告按数据集独立保留结果，txStep 跨数据集顺延编号。
    test.setTimeout(720_000);
    test.skip(testInfo.project.name !== 'tx-fork', 'SCN-023 在 tx-fork 执行（06-策略下单矩阵）');
    const runtime = await applyCaseTrader(loadRuntimeConfig(), 'SCN-023');
    if (process.env.E2E_PERSIST_FORK_STATE === 'true') {
      expect(runtime.signingMode, '持久证据运行必须使用私钥签名').toBe('private-key');
    }
    // 前端钩子（docs/07 Phase 2）：E2E_UI_COLLECT=true 全平前停点采平仓弹窗预览；E2E_UI_ORDER_ENTRY=true 市价开仓/全平改由页面点击发起（中段阶段仍走 RPC）
    const uiHooks = await resolveUiHooks(runtime, page, testInfo);

    let evidence: MarketFlowMatrixEvidence | undefined;
    try {
      evidence = await runMarketFlowMatrix(runtime, {
        scenarioId: 'SCN-023',
        datasets: [
          withUiHooks({
            datasetId: 'long-decrease-profit', label: '开多 +10% 分批兑现', isLong: true, priceMovePercent: 10,
            middlePhases: [{ kind: 'decrease', label: '分批兑现 50%', percentOfPosition: 50 }],
          }, uiHooks),
        ],
      });
    } catch (error) {
      if (runtime.keeperMode === 'service') {
        testInfo.annotations.push({
          type: 'blocked',
          description: `Service Keeper 专项未就绪：${error instanceof Error ? error.message : String(error)}`,
        });
      }
      throw error;
    }
    expect(evidence.summary.total, '数据集应全部执行').toBe(1);
    expect(evidence.summary.passed, '数据集应全部通过').toBe(1);

    const evidencePath = testInfo.outputPath('scn-023-evidence.json');
    await writeFile(evidencePath, stringifyEvidence(evidence), 'utf8');
    await testInfo.attach('scn-023-evidence.json', { path: evidencePath, contentType: 'application/json' });

    const txPath = testInfo.outputPath('tx-and-receipt.json');
    await writeFile(txPath, stringifyEvidence(Object.fromEntries(
      evidence.datasets.map((item) => [item.datasetId, item.evidence.transactions]),
    )), 'utf8');
    await testInfo.attach('tx-and-receipt.json', { path: txPath, contentType: 'application/json' });

    const ledgerPath = testInfo.outputPath('reader-ledger-before-after.json');
    await writeFile(ledgerPath, stringifyEvidence(Object.fromEntries(
      evidence.datasets.map((item) => [item.datasetId, {
        snapshots: item.evidence.snapshots,
        deltas: item.evidence.deltas,
        observations: item.evidence.observations,
      }]),
    )), 'utf8');
    await testInfo.attach('reader-ledger-before-after.json', { path: ledgerPath, contentType: 'application/json' });

    testInfo.annotations.push({
      type: 'coverage-gap',
      description: '自动化范围是 RPC 签名订单、Inline Keeper 与链上核对；页面加载和浏览器钱包操作由手工核对用例覆盖。',
    });
    testInfo.annotations.push({
      type: 'check-result',
      description: `双数据集（${evidence.datasets.map((item) => item.datasetId).join('、')}）共 ${evidence.summary.assertions} 项链上核对通过；部分平 50%（⌈⌉ 取整、瀑布部分平分支）+ 清仓路径逐位核对。`,
    });
  });
});

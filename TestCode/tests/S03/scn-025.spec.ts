import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { loadRuntimeConfig } from '../../src/config/runtime.js';
import { runMarketFlowMatrix, stringifyEvidence, type MarketFlowMatrixEvidence } from '../../src/scenarios/scn-009-runner.js';

test.describe('S03 仓位管理与退出', () => {
  test('SCN-025 趋势确认后同方向加仓｜加仓双向数据集 @p1 @tx @serial', async ({}, testInfo) => {
    // 加仓双向数据集（06-策略下单矩阵 · long/short-increase）：
    // 开仓 50 USD → 同方向加仓 50 USD（中段阶段）→ 全平 100 USD。
    // 中段阶段走完整 创建→执行→钉块快照→纯净度→守恒 链路，加仓期望为在仓位基础上的增量模型。
    // 数据集矩阵模式：每个数据集独立 evm_snapshot/revert（runner 内部管理，
    // SCN-070 模式）；报告按数据集独立保留结果，txStep 跨数据集顺延编号。
    test.setTimeout(720_000);
    test.skip(testInfo.project.name !== 'tx-fork', 'SCN-025 在 tx-fork 执行（06-策略下单矩阵）');
    const runtime = loadRuntimeConfig();
    if (process.env.E2E_PERSIST_FORK_STATE === 'true') {
      expect(runtime.signingMode, '持久证据运行必须使用私钥签名').toBe('private-key');
    }

    let evidence: MarketFlowMatrixEvidence | undefined;
    try {
      evidence = await runMarketFlowMatrix(runtime, {
        scenarioId: 'SCN-025',
        datasets: [
          {
            datasetId: 'long-increase', label: '开多后同方向加仓', isLong: true,
            middlePhases: [{ kind: 'increase', label: '同方向加仓 50 USD', collateralUsdc: '10' }],
          },
          {
            datasetId: 'short-increase', label: '开空后同方向加仓', isLong: false,
            middlePhases: [{ kind: 'increase', label: '同方向加仓 50 USD', collateralUsdc: '10' }],
          },
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
    expect(evidence.summary.total, '数据集应全部执行').toBe(2);
    expect(evidence.summary.passed, '数据集应全部通过').toBe(2);

    const evidencePath = testInfo.outputPath('scn-025-evidence.json');
    await writeFile(evidencePath, stringifyEvidence(evidence), 'utf8');
    await testInfo.attach('scn-025-evidence.json', { path: evidencePath, contentType: 'application/json' });

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
      description: `双数据集（${evidence.datasets.map((item) => item.datasetId).join('、')}）共 ${evidence.summary.assertions} 项链上核对通过；加仓增量模型（规模/Margin/OI/开仓成本累加）双向逐位核对，全平 100 USD 清仓。`,
    });
  });
});

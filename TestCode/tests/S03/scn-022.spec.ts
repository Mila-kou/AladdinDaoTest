import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { loadRuntimeConfig } from '../../src/config/runtime.js';
import { runMarketFlowMatrix, stringifyEvidence, type MarketFlowMatrixEvidence } from '../../src/scenarios/scn-009-runner.js';
import { resolveUiHooks, withUiHooks } from '../../src/ui/ui-collect-hook.js';

test.describe('S03 仓位管理与退出', () => {
  test('SCN-022 交易员观察纯价格 PnL 与实际可得差异｜盈利全平双向数据集 @p0 @tx @serial', async ({ page }, testInfo) => {
    // 盈利全平双向数据集（06-策略下单矩阵 · long/short-close-profit）：
    // 多头 +10% / 空头 −10% 推价后全平——支付瀑布盈利路径（⌊÷colPrice.max⌋、LPVault 付盈利）双向实证。
    // 数据集矩阵模式：每个数据集独立 evm_snapshot/revert（runner 内部管理，
    // SCN-070 模式）；报告按数据集独立保留结果，txStep 跨数据集顺延编号。
    test.setTimeout(720_000);
    test.skip(testInfo.project.name !== 'tx-fork', 'SCN-022 在 tx-fork 执行（06-策略下单矩阵）');
    const runtime = loadRuntimeConfig();
    // 环境必须与 Playwright project 一致：.env.local 的 E2E_ENV 曾静默把 tx-fork 批次改跑 oracle-fork（2026-08-14 实例）
    expect(runtime.environment, 'runtime 环境须与 --project 一致（见 src/config/runtime.ts E2E_ENV_PRIORITY_KEYS）').toBe(testInfo.project.name);
    if (process.env.E2E_PERSIST_FORK_STATE === 'true') {
      expect(runtime.signingMode, '持久证据运行必须使用私钥签名').toBe('private-key');
    }
    // 前端钩子（docs/07 Phase 1-D / Phase 2）：E2E_UI_COLLECT=true 每个数据集全平前停点采平仓弹窗预览；E2E_UI_ORDER_ENTRY=true 市价开仓/全平改由页面点击发起（注入钱包 Node 侧签名）
    const uiHooks = await resolveUiHooks(runtime, page, testInfo);

    let evidence: MarketFlowMatrixEvidence | undefined;
    try {
      evidence = await runMarketFlowMatrix(runtime, {
        scenarioId: 'SCN-022',
        datasets: [
          withUiHooks({ datasetId: 'long-close-profit', label: '开多 +10% 盈利全平', isLong: true, priceMovePercent: 10 }, uiHooks),
          withUiHooks({ datasetId: 'short-close-profit', label: '开空 −10% 盈利全平', isLong: false, priceMovePercent: -10 }, uiHooks),
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

    const evidencePath = testInfo.outputPath('scn-022-evidence.json');
    await writeFile(evidencePath, stringifyEvidence(evidence), 'utf8');
    await testInfo.attach('scn-022-evidence.json', { path: evidencePath, contentType: 'application/json' });

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
      description: `双数据集（${evidence.datasets.map((item) => item.datasetId).join('、')}）共 ${evidence.summary.assertions} 项链上核对通过；毛 PnL 与实际可得差异（费用/取整）双向逐位核对。`,
    });
  });
});

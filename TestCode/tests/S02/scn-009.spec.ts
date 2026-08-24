import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { loadRuntimeConfig } from '../../src/config/runtime.js';
import { runMarketFlowMatrix, stringifyEvidence, type MarketFlowMatrixEvidence } from '../../src/scenarios/scn-009-runner.js';
import { resolveUiHooks, withUiHooks } from '../../src/ui/ui-collect-hook.js';

test.describe('S02 策略下单与订单管理', () => {
  test('SCN-009 市价开多快速退出｜涨/平/跌三组受控价格数据集 @p0 @tx @serial', async ({ page }, testInfo) => {
    // 用例（TestCase/E2E/scenarios/S02 第 18 行）：10 USDC / 5x，价格小涨/平/小跌三组，
    // 核对「三组最终余额方向为涨 > 平 > 跌；Entry/Exit 使用对用户不利侧执行价」。
    // 三组 = 数据集矩阵（+3% / 0 / −3%，推价三件套见 runMarketFlow priceMovePercent），
    // 每个数据集独立 evm_snapshot/revert（runner 内部管理），跨数据集用 crossDatasetChecks 断言 traderUsdcDelta 严格递减。
    // 每个数据集 4 笔真实交易 + 全量账本快照，三组合计超出 playwright.config 的 90s 全局上限。
    test.setTimeout(900_000);
    test.skip(testInfo.project.name !== 'tx-fork', 'SCN-009 在 tx-fork 执行（交易账本线）');
    const runtime = loadRuntimeConfig();
    // 环境必须与 Playwright project 一致：.env.local 的 E2E_ENV 曾静默把 tx-fork 批次改跑 oracle-fork（2026-08-14 实例）
    expect(runtime.environment, 'runtime 环境须与 --project 一致（见 src/config/runtime.ts E2E_ENV_PRIORITY_KEYS）').toBe(testInfo.project.name);
    if (process.env.E2E_PERSIST_FORK_STATE === 'true') {
      expect(runtime.signingMode, '持久证据运行必须使用私钥签名').toBe('private-key');
    }
    // 前端钩子（docs/07 Phase 2）：E2E_UI_COLLECT=true 每个数据集全平前停点采平仓弹窗预览；E2E_UI_ORDER_ENTRY=true 市价开仓/全平改由页面点击发起（注入钱包 Node 侧签名）
    const uiHooks = await resolveUiHooks(runtime, page, testInfo);

    let evidence: MarketFlowMatrixEvidence | undefined;
    try {
      evidence = await runMarketFlowMatrix(runtime, {
        scenarioId: 'SCN-009',
        datasets: [
          withUiHooks({ datasetId: 'long-quick-exit-up', label: '开多 → +3% 小涨 → 市价全平', isLong: true, priceMovePercent: 3 }, uiHooks),
          withUiHooks({ datasetId: 'long-quick-exit-flat', label: '开多 → 价格不动 → 市价全平', isLong: true, priceMovePercent: 0 }, uiHooks),
          withUiHooks({ datasetId: 'long-quick-exit-down', label: '开多 → −3% 小跌 → 市价全平', isLong: true, priceMovePercent: -3 }, uiHooks),
        ],
        crossDatasetChecks: [{
          name: '三组最终余额方向：涨 > 平 > 跌（traderUsdcDelta 严格递减）',
          metric: 'traderUsdcDelta',
          strictlyDescending: ['long-quick-exit-up', 'long-quick-exit-flat', 'long-quick-exit-down'],
        }],
        coverage: {
          executed: ['涨/平/跌三组可控价格对照（+3% / 0 / −3%，跨数据集断言 traderUsdcDelta 严格递减）'],
          // 仍保留两项真实缺口：浏览器钱包点击签名（设计上以私钥签名等价替代，页面操作由 [M] 手工用例覆盖）、
          // 页面历史与链上事件逐条核对（Phase 2 前端核对）。
          pending: ['浏览器钱包内从页面点击并签名', '页面历史与链上事件逐条核对'],
        },
      });
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
    expect(evidence.summary.total, '数据集应全部执行').toBe(3);
    expect(evidence.summary.passed, '数据集应全部通过').toBe(3);
    expect(evidence.matrixAssertions.length, '应有一条跨数据集序关系断言').toBe(1);
    for (const assertion of evidence.matrixAssertions) {
      expect(assertion.passed, `${assertion.name}：实际 ${assertion.actual}，期望 ${assertion.expected}`).toBe(true);
    }

    const evidencePath = testInfo.outputPath('scn-009-evidence.json');
    await writeFile(evidencePath, stringifyEvidence(evidence), 'utf8');
    await testInfo.attach('scn-009-evidence.json', { path: evidencePath, contentType: 'application/json' });

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
      description: '自动化范围是 RPC 签名订单、Inline Keeper、受控推价与链上核对；页面加载和浏览器钱包操作由手工核对用例覆盖。',
    });
    const deltas = evidence.datasets
      .map((item) => `${item.datasetId}=${String(item.evidence.observations.traderUsdcDelta)}`)
      .join('，');
    testInfo.annotations.push({
      type: 'check-result',
      description: `三数据集（+3% / 0 / −3%）共 ${evidence.summary.assertions} 项链上核对通过；跨数据集 traderUsdcDelta：${deltas}，满足 涨 > 平 > 跌。`,
    });
  });
});

import { writeFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { loadRuntimeConfig } from '../../src/config/runtime.js';
import {
  runScn070,
  stringifyScn070Evidence,
  type Scn070Evidence,
} from '../../src/scenarios/scn-070-runner.js';

test.describe('S07 订单类型全矩阵', () => {
  test('SCN-070 市价四象限可接受价｜等号成交与不利越界取消 @p0 @tx @oracle @serial', async ({}, testInfo) => {
    test.setTimeout(1_200_000);
    test.skip(testInfo.project.name !== 'oracle-fork', 'SCN-070 固定在 oracle-fork 使用受控 Mock Oracle');

    const runtime = loadRuntimeConfig();
    expect(runtime.signingMode, 'SCN-070 的 Trader 与 Keeper 交易必须使用私钥签名').toBe('private-key');
    expect(runtime.hasPrimaryTestWallet, '缺少 Trader 私钥').toBe(true);
    expect(runtime.hasSecondaryTestWallet, '缺少 ORDER_KEEPER 私钥').toBe(true);

    const evidence: Scn070Evidence = await runScn070(runtime);
    expect(evidence.summary.total).toBe(8);
    expect(evidence.summary.executed).toBe(4);
    expect(evidence.summary.cancelled).toBe(4);

    const evidencePath = testInfo.outputPath('scn-070-evidence.json');
    await writeFile(evidencePath, stringifyScn070Evidence(evidence), 'utf8');
    await testInfo.attach('scn-070-evidence.json', {
      path: evidencePath,
      contentType: 'application/json',
    });

    const transactionPath = testInfo.outputPath('tx-and-receipt.json');
    await writeFile(
      transactionPath,
      stringifyScn070Evidence(Object.fromEntries(
        evidence.cases.map((item) => [item.caseId, item.transactions]),
      )),
      'utf8',
    );
    await testInfo.attach('tx-and-receipt.json', {
      path: transactionPath,
      contentType: 'application/json',
    });

    const boundaryPath = testInfo.outputPath('acceptable-price-boundaries.json');
    await writeFile(
      boundaryPath,
      stringifyScn070Evidence({
        matrix: evidence.matrix,
        cases: evidence.cases.map((item) => ({
          caseId: item.caseId,
          acceptablePrice: item.acceptablePrice,
          executionPrice: item.executionPrice,
          executionPriceStep: item.executionPriceStep,
          baselineOracleRawPrice: item.baselineOracleRawPrice,
          executionOracleRawPrice: item.executionOracleRawPrice,
          oracleRawStep: item.oracleRawStep,
          assertions: item.assertions,
        })),
      }),
      'utf8',
    );
    await testInfo.attach('acceptable-price-boundaries.json', {
      path: boundaryPath,
      contentType: 'application/json',
    });

    testInfo.annotations.push({
      type: 'coverage-gap',
      description: '链上市价四象限和 acceptablePrice 边界已自动化；页面加载、浏览器钱包输入与历史逐行核对由手工用例覆盖。',
    });
    testInfo.annotations.push({
      type: 'check-result',
      description: `8/8 数据集通过：4 条 E=A 成交、4 条最小可达不利步长取消，共 ${evidence.summary.assertions} 项链上核对。`,
    });
  });
});

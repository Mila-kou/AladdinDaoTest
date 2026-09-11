import { writeFile } from 'node:fs/promises';

import { expect, test, type TestInfo } from '@playwright/test';

import { loadRuntimeConfig, type RuntimeConfig } from '../../src/config/runtime.js';

// 版本级功能用例（CT/XT/FT）默认启用每用例专属 Trader：矩阵已为每条用例分配地址，共享 trader 的遗留挂单/仓位会污染核对。
// 显式设置 E2E_TRADER_ASSIGNMENT=global 可退回共享 trader；E2E_TRADER_PROFILE=ui 仍优先于 per-case。
process.env.E2E_TRADER_ASSIGNMENT ??= 'per-case';
import { applyCaseTrader } from '../../src/config/trader-roster.js';
import {
  CT_BASE_TITLES,
  runCtBase001,
  runCtBase002,
  runCtBase003,
  runCtBase004,
  runCtBase005,
  runCtBase006,
  runCtBase007,
  runCtBase008,
  stringifyCaseEvidence,
  summarizeChecks,
  type CaseEvidence,
} from '../../src/scenarios/ct-base-runner.js';

// v0.3.2 Trade 矩阵 A 节「部署与交易基线」（TestCase/E2E/versions/v0.3.2/Trade-测试用例矩阵.md §3.A）。
// 全部在 tx-fork 执行；期望值来自 CURRENT.json / 环境绑定 manifest / 链上实时读取。
// 标签：@readonly = 只有 eth_call / eth_getCode（含 revert 模拟）；@tx = spec 层有链上写动作（CT-BASE-005 由 applyCaseTrader 给 T100 注资/授权）。
// CT-BASE-008 的 LIMITED_CONFIG_KEEPER 夹具在 admin RPC 的 evm_snapshot/evm_revert 内完成，链上净状态不变，仍记 @readonly。
// 暂停规则：CT-BASE-001～008 任一 P0 失败时暂停 B 节合约层执行——所以真实偏差必须让本文件 FAIL，不得弱化。

const PROJECT = 'tx-fork';
// CT-BASE-002 一次跑约 50+ 串行 RPC（全 manifest eth_getCode + 产物比对），其余用例也逐市场串行读键：统一放宽到 5 分钟
const CASE_TIMEOUT_MS = 300_000;

function skipUnlessTxFork(testInfo: TestInfo): void {
  test.skip(testInfo.project.name !== PROJECT, `A 节基线在 ${PROJECT} 执行（矩阵 A 节执行环境约定）`);
}

function assertRuntimeMatchesProject(runtime: RuntimeConfig, testInfo: TestInfo): void {
  // 环境必须与 Playwright project 一致：.env.local 的 E2E_ENV 曾静默把 tx-fork 批次改跑 oracle-fork（2026-08-14 实例）
  expect(runtime.environment, 'runtime 环境须与 --project 一致（见 src/config/runtime.ts E2E_ENV_PRIORITY_KEYS）').toBe(testInfo.project.name);
}

async function recordEvidence(evidence: CaseEvidence, sequence: string, testInfo: TestInfo): Promise<void> {
  const fileName = `ct-base-${sequence}-evidence.json`;
  const evidencePath = testInfo.outputPath(fileName);
  await writeFile(evidencePath, stringifyCaseEvidence(evidence), 'utf8');
  await testInfo.attach(fileName, { path: evidencePath, contentType: 'application/json' });
  testInfo.annotations.push({ type: 'check-result', description: summarizeChecks(evidence) });
  if (evidence.blocked) {
    testInfo.annotations.push({ type: 'blocked', description: evidence.blocked });
  }
}

function assertAllChecksPassed(evidence: CaseEvidence): void {
  // RPC 不可达等执行阻塞：记 BLOCKED（注解已写入），同时让用例失败——阻塞不是通过
  expect(evidence.blocked, evidence.blocked ?? '').toBeUndefined();
  expect(evidence.checks.length, '至少要有一项核对（幽灵内容零容忍）').toBeGreaterThan(0);
  for (const item of evidence.checks) {
    expect(
      item.passed,
      `${evidence.id} ${item.name}：实际 ${stringifyCaseEvidence(item.actual).trim()}，期望 ${stringifyCaseEvidence(item.expected).trim()}${item.note ? `（${item.note}）` : ''}`,
    ).toBe(true);
  }
}

async function runReadonlyCase(
  sequence: string,
  runner: (runtime: RuntimeConfig) => Promise<CaseEvidence>,
  testInfo: TestInfo,
): Promise<void> {
  test.setTimeout(CASE_TIMEOUT_MS);
  skipUnlessTxFork(testInfo);
  const runtime = loadRuntimeConfig();
  assertRuntimeMatchesProject(runtime, testInfo);
  const evidence = await runner(runtime);
  await recordEvidence(evidence, sequence, testInfo);
  assertAllChecksPassed(evidence);
}

test.describe('A 部署与交易基线', () => {
  test(`CT-BASE-001 ${CT_BASE_TITLES['CT-BASE-001']} @p0 @readonly`, async ({}, testInfo) => {
    // 含 CURRENT.json 目标版本闸门：tx-fork 若仍为 v0.3.1 fork，该项应真实 FAIL（矩阵 A 节执行环境约定）
    await runReadonlyCase('001', runCtBase001, testInfo);
  });

  test(`CT-BASE-002 ${CT_BASE_TITLES['CT-BASE-002']} @p0 @readonly`, async ({}, testInfo) => {
    await runReadonlyCase('002', runCtBase002, testInfo);
  });

  test(`CT-BASE-003 ${CT_BASE_TITLES['CT-BASE-003']} @p0 @readonly`, async ({}, testInfo) => {
    await runReadonlyCase('003', runCtBase003, testInfo);
  });

  test(`CT-BASE-004 ${CT_BASE_TITLES['CT-BASE-004']} @p0 @readonly`, async ({}, testInfo) => {
    await runReadonlyCase('004', runCtBase004, testInfo);
  });

  test(`CT-BASE-005 ${CT_BASE_TITLES['CT-BASE-005']} @p0 @tx`, async ({}, testInfo) => {
    test.setTimeout(CASE_TIMEOUT_MS);
    skipUnlessTxFork(testInfo);
    // @tx：探针账户 T100（config/case-traders.json CT-BASE-005）由 applyCaseTrader 注资 ETH/USDC 并做 Router 授权（链上写动作在 spec 层，runner 本身只读）；
    // 未启用 E2E_TRADER_ASSIGNMENT=per-case 时沿用默认 trader，证据 data.probe.address 记录实际探针地址。
    const runtime = await applyCaseTrader(loadRuntimeConfig(), 'CT-BASE-005');
    assertRuntimeMatchesProject(runtime, testInfo);
    const evidence = await runCtBase005(runtime);
    await recordEvidence(evidence, '005', testInfo);
    assertAllChecksPassed(evidence);
  });

  test(`CT-BASE-006 ${CT_BASE_TITLES['CT-BASE-006']} @p0 @readonly`, async ({}, testInfo) => {
    await runReadonlyCase('006', runCtBase006, testInfo);
  });

  test(`CT-BASE-007 ${CT_BASE_TITLES['CT-BASE-007']} @p0 @readonly`, async ({}, testInfo) => {
    await runReadonlyCase('007', runCtBase007, testInfo);
  });

  test(`CT-BASE-008 ${CT_BASE_TITLES['CT-BASE-008']} @p0 @readonly`, async ({}, testInfo) => {
    // 唯一含写动作的用例：LIMITED_CONFIG_KEEPER 夹具在 admin RPC 的 evm_snapshot/evm_revert 内授予并回滚；
    // 无 admin RPC 时该子项记 NOT_EXERCISED（不宣称执行、也不因夹具缺席判 FAIL）。
    await runReadonlyCase('008', runCtBase008, testInfo);
  });

  test(`XT-BASE-009 ${CT_BASE_TITLES['XT-BASE-009']} @p0 @frontend`, async ({}, testInfo) => {
    test.setTimeout(CASE_TIMEOUT_MS);
    testInfo.annotations.push({
      type: 'coverage-gap',
      description: '前端层基线（页面/SDK 请求的 chainId、合约地址、市场参数与链上快照比对）未自动化；等 CURRENT.primary.admissionScope["tx-fork:frontend"] 准入后按 docs/07 前端钩子实现。',
    });
    test.skip(true, '等 tx-fork:frontend 准入');
  });
});

import { writeFile } from 'node:fs/promises';

import { expect, test, type TestInfo } from '@playwright/test';

import { loadRuntimeConfig, type RuntimeConfig } from '../../src/config/runtime.js';

// 版本级功能用例（CT/XT/FT）默认启用每用例专属 Trader：矩阵已为每条用例分配地址，共享 trader 的遗留挂单/仓位会污染核对。
// 显式设置 E2E_TRADER_ASSIGNMENT=global 可退回共享 trader；E2E_TRADER_PROFILE=ui 仍优先于 per-case。
process.env.E2E_TRADER_ASSIGNMENT ??= 'per-case';
import { applyCaseTrader } from '../../src/config/trader-roster.js';
import { maskErrorText, summarizeChecks, type CaseEvidence } from '../../src/scenarios/ct-base-runner.js';
import {
  XT_MKT_TITLES,
  runCollateralBoundaryCase,
  runMarketOpenAtom,
  runMaxLeverageCase,
  stringifyXtEvidence,
  type XtMktCaseId,
} from '../../src/scenarios/xt-mkt-runner.js';

// v0.3.2 Trade 矩阵 B1「MarketIncrease」（TestCase/E2E/versions/v0.3.2/Trade-测试用例矩阵.md §B1）——
// XT-MKT-OPEN-001/002、XT-MKT-LEV-003～006 的合约层原子：RPC 入口（私钥签名 createOrder + Inline Keeper 执行），
// 前端层与交叉一致按 §B 分层约定记 GAP（coverage-gap 注解），等 tx-fork:frontend 准入后按同一原子补跑。
// 每条用例独立 Trader（config/case-traders.json：OPEN-001→T9、OPEN-002→T65、LEV-003→T5、LEV-004→T89、LEV-005→T33、LEV-006→T90），
// applyCaseTrader 在任何 evm_snapshot 之前完成注资与 Router 授权（trader-roster.ts 硬性顺序约束）。

const PROJECT = 'tx-fork';
const USDC = 10n ** 6n;
const USD = 10n ** 30n;

/**
 * 版本级功能用例默认持久：开仓/全平真实留在 fork 上，可在 Tenderly 浏览器按 tx 哈希复核（专属 trader 保证互不串扰；
 * L_max 二分探测仍逐次快照回滚）。E2E_TRADE_PERSIST=false 退回快照模式（每条用例 evm_snapshot → 跑 → evm_revert）。
 * 不能拿 E2E_PERSIST_FORK_STATE 判定：.env.local 固定写 false 且以 override 加载，shell 值到不了这里；
 * 判定为持久后同步写回该键，让 runner 证据里的 resetMode 与实际一致。
 */
function persistFork(): boolean {
  const persist = process.env.E2E_TRADE_PERSIST !== 'false' || process.env.E2E_PERSIST_FORK_STATE === 'true';
  if (persist) process.env.E2E_PERSIST_FORK_STATE = 'true';
  return persist;
}

/** admin RPC 裸调用（evm_snapshot / evm_revert）；任何错误文本先 maskErrorText 再抛出（不外泄 RPC URL）。 */
async function rawRpc(runtime: RuntimeConfig, url: string, method: string, params: readonly unknown[] = []): Promise<unknown> {
  try {
    const body = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }).then((response) => response.json()) as { result?: unknown; error?: { message?: string } };
    if (body.error) throw new Error(body.error.message ?? 'unknown RPC error');
    return body.result;
  } catch (error) {
    throw new Error(`RPC ${method}：${maskErrorText(error instanceof Error ? error.message : String(error), runtime)}`);
  }
}

function title(id: XtMktCaseId): string {
  return `${id} ${XT_MKT_TITLES[id]} @p0 @tx`;
}

async function prepare(id: XtMktCaseId, testInfo: TestInfo): Promise<RuntimeConfig> {
  test.setTimeout(1_200_000);
  test.skip(testInfo.project.name !== PROJECT, `${id} 在 ${PROJECT} 执行（矩阵 §B：XT 行先以 RPC 入口在 tx-fork 跑合约层）`);
  const runtime = await applyCaseTrader(loadRuntimeConfig(), id);
  // 环境必须与 Playwright project 一致：.env.local 的 E2E_ENV 曾静默把 tx-fork 批次改跑 oracle-fork（2026-08-14 实例）
  expect(runtime.environment, 'runtime 环境须与 --project 一致（见 src/config/runtime.ts E2E_ENV_PRIORITY_KEYS）').toBe(testInfo.project.name);
  if (persistFork()) {
    expect(runtime.signingMode, '持久证据运行必须使用私钥签名').toBe('private-key');
  }
  return runtime;
}

async function recordEvidence(id: XtMktCaseId, result: CaseEvidence, testInfo: TestInfo): Promise<void> {
  const fileName = `${id.toLowerCase()}-evidence.json`;
  const evidencePath = testInfo.outputPath(fileName);
  await writeFile(evidencePath, stringifyXtEvidence(result), 'utf8');
  await testInfo.attach(fileName, { path: evidencePath, contentType: 'application/json' });
  testInfo.annotations.push({ type: 'check-result', description: summarizeChecks(result) });
  testInfo.annotations.push({
    type: 'coverage-gap',
    description: '前端层与交叉一致待页面入口补跑（GAP）',
  });
}

function assertAllChecksPassed(result: CaseEvidence): void {
  expect(result.checks.length, '至少要有一项核对（幽灵内容零容忍）').toBeGreaterThan(0);
  for (const item of result.checks) {
    expect(
      item.passed,
      `${result.id} ${item.name}：实际 ${stringifyXtEvidence(item.actual).trim()}，期望 ${stringifyXtEvidence(item.expected).trim()}${item.note ? `（${item.note}）` : ''}`,
    ).toBe(true);
  }
}

/**
 * 统一执行壳：默认持久（交易留在 fork）；E2E_TRADE_PERSIST=false 时 evm_snapshot → 原子/组合 → 落证据 → evm_revert。
 * runner 抛错时若为 Service Keeper 模式记 blocked（执行环境阻塞不是协议 FAIL）并原样抛出（scn-009 模式）。
 */
async function runCase(
  id: XtMktCaseId,
  testInfo: TestInfo,
  body: (runtime: RuntimeConfig) => Promise<CaseEvidence>,
): Promise<void> {
  const runtime = await prepare(id, testInfo);
  const persist = persistFork();
  const adminUrl = runtime.adminRpcUrl ?? runtime.rpcUrl;
  const snapshotId = persist ? undefined : await rawRpc(runtime, adminUrl, 'evm_snapshot');
  try {
    let result: CaseEvidence;
    try {
      result = await body(runtime);
    } catch (error) {
      if (runtime.keeperMode === 'service') {
        // 注解只收脱敏文本：runner 已经 describeError 过，这里再过一遍 maskErrorText 兜底（双保险）
        testInfo.annotations.push({
          type: 'blocked',
          description: `Service Keeper 专项未就绪：${maskErrorText(error instanceof Error ? error.message : String(error), runtime)}`,
        });
      }
      throw error;
    }
    await recordEvidence(id, result, testInfo);
    assertAllChecksPassed(result);
  } finally {
    if (snapshotId !== undefined) {
      const reverted = await rawRpc(runtime, adminUrl, 'evm_revert', [snapshotId]);
      expect(reverted).toBe(true);
    }
  }
}

test.describe('B1 开仓：MarketIncrease', () => {
  test(title('XT-MKT-OPEN-001'), async ({}, testInfo) => {
    // long；普通 size；中间杠杆（runner 缺省 10 USDC / 5x / 50 USD）；不带 TP/SL
    await runCase('XT-MKT-OPEN-001', testInfo, (runtime) => runMarketOpenAtom(runtime, { id: 'XT-MKT-OPEN-001', isLong: true }));
  });

  test(title('XT-MKT-OPEN-002'), async ({}, testInfo) => {
    // short；同上；方向等价类：type=0、isLong=false、成交价不利侧（bid）
    await runCase('XT-MKT-OPEN-002', testInfo, (runtime) => runMarketOpenAtom(runtime, { id: 'XT-MKT-OPEN-002', isLong: false }));
  });

  test(title('XT-MKT-LEV-003'), async ({}, testInfo) => {
    // L_min = 1x 是页面规则（buildLeverageMarks 基点 [1,…]），链上无最小杠杆参数（FX100Keys.sol 无 LEVERAGE 键，2026-09-02 核实）。
    // RPC 入口按 size = collateral × L_min 换算：collateral = 50 USDC → sizeDelta = 50 USD（毛杠杆恰好 1x）；
    // 合约层只核「链上不拒绝、规模与抵押关系 = 换算值」，费后杠杆 size/(collateral − fee) 记观测。
    const sizeDeltaUsd = 50n * USD;
    const collateral = 50n * USDC;
    testInfo.annotations.push({
      type: 'note',
      description: 'L_min=1x 为前端页面规则（slider 最小刻度），链上无对应参数；本用例只验证链上等号不拒绝与换算关系。',
    });
    await runCase('XT-MKT-LEV-003', testInfo, (runtime) => runMarketOpenAtom(runtime, {
      id: 'XT-MKT-LEV-003',
      isLong: true,
      sizeDeltaUsd,
      collateral,
      expectedLeverageNote: 'L_min=1x（页面规则）：sizeDelta = collateral × 1 = 50 USD；链上无最小杠杆参数，等号允许',
    }));
  });

  test(title('XT-MKT-LEV-004'), async ({}, testInfo) => {
    // XT-MKT-LEV-003 的 short 对偶（方向 + 空头清算价方向由前端层补跑）
    const sizeDeltaUsd = 50n * USD;
    const collateral = 50n * USDC;
    testInfo.annotations.push({
      type: 'note',
      description: 'L_min=1x 为前端页面规则（slider 最小刻度），链上无对应参数；本用例只验证链上等号不拒绝与换算关系（short）。',
    });
    await runCase('XT-MKT-LEV-004', testInfo, (runtime) => runMarketOpenAtom(runtime, {
      id: 'XT-MKT-LEV-004',
      isLong: false,
      sizeDeltaUsd,
      collateral,
      expectedLeverageNote: 'L_min=1x（页面规则）：sizeDelta = collateral × 1 = 50 USD；链上无最小杠杆参数，等号允许（short）',
    }));
  });

  test(title('XT-MKT-LEV-005'), async ({}, testInfo) => {
    // L_max（long）：链上参数 + Reader 点差 → 前端公式 1/(minCF + s_open + s_close + 2fee) → 页面上限；
    // 另按方向算含 Oracle min/max 价带的链上模型 1/(minCF + f_open + f_close + loss)，loss(long) = 1 − Pmin(1−s_close)/(Pmax(1+s_open))；
    // 两腿费率按各腿 balanceWasImproved 取 POSITION_FEE_FACTOR 键，平仓腿点差/费率取 minFeasible 探测内仓位建立后的 Reader 读数（空市场上平仓改善平衡：improved 费率、点差钳 0）。
    // 固定 S = 1000 USD 对抵押二分（每探测独立 evm_snapshot/revert）找等号成交的最小抵押，链上实测取毛口径
    // chainMaxGrossX = S / (minFeasible × collateralPrice.min)（前端公式作用于提交的毛抵押）。
    // 核对：min−1 取消原因为杠杆闸门 / ≤ 理论 100x / (iii-a) |链上 − 含价带模型| ≤ 0.05x（必须 PASS）/
    // (iii-b) |链上 − 前端公式| ≤ 0.05x（页面公式不含价带，有价带的市场预期偏离——本行设计要暴露的差异）/ 页面上限 ≤ 链上；再以 minFeasible 跑完整原子。
    // 探测预算：区间围绕链上模型估计值取 [×0.9, ×1.5]（≈ 0.6 × 11.3M raw → 23 次二分 + 2 次括号；括号不成立放宽一次再 +2），
    // 均在 runner 缺省 32 内，不再显式覆盖 maxProbes。
    const sizeDeltaUsd = 1_000n * USD;
    await runCase('XT-MKT-LEV-005', testInfo, (runtime) => runMaxLeverageCase(runtime, {
      id: 'XT-MKT-LEV-005',
      isLong: true,
      sizeDeltaUsd,
      toleranceX: 0.05,
    }));
  });

  test(title('XT-MKT-LEV-006'), async ({}, testInfo) => {
    // XT-MKT-LEV-005 的 short 对偶（开空按 min×(1−s_open) 成交、按 max×(1+s_close) 估值：loss(short) = Pmax(1+s_close)/(Pmin(1−s_open)) − 1）
    const sizeDeltaUsd = 1_000n * USD;
    await runCase('XT-MKT-LEV-006', testInfo, (runtime) => runMaxLeverageCase(runtime, {
      id: 'XT-MKT-LEV-006',
      isLong: false,
      sizeDeltaUsd,
      toleranceX: 0.05,
    }));
  });

  test(title('XT-MKT-COL-009'), async ({}, testInfo) => {
    // 三点边界下点：固定 long / size 50 USD；C_eff 取链上权威（validatePosition 闸门下等号成交的最小抵押）：
    // 标定探测（×1.03 成交一次，读仓位建立后的平仓腿）→ 精确链上模型 C* → C* ± max(20 raw, 1e-4) 窄区间二分 → C_eff；
    // 原子（持久）：initialCollateral = C_eff − 1 建单 → Keeper 执行 → OrderCancelled(LiquidatablePosition)、抵押全额退回、
    // 执行费 keeper 收取 + 余额退回、无仓位、订单离队。矩阵链下造数公式值只记录（offlineCeff），链上为最终权威。
    const sizeDeltaUsd = 50n * USD;
    await runCase('XT-MKT-COL-009', testInfo, (runtime) => runCollateralBoundaryCase(runtime, {
      id: 'XT-MKT-COL-009',
      isLong: true,
      sizeDeltaUsd,
    }));
  });
});

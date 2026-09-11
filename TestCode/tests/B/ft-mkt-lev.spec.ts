import { writeFile } from 'node:fs/promises';

import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { getAddress } from 'viem';

import { loadBaselineRegistry } from '../../src/config/baseline.js';
import { loadDeploymentManifest } from '../../src/config/deployment.js';
import { resolveMockMarketBundle } from '../../src/config/mock-resources.js';
import { loadRuntimeConfig, maskUrl, type RuntimeConfig } from '../../src/config/runtime.js';

// 版本级功能用例默认每用例专属 Trader（FT 探针行共用 T100，见 config/case-traders.json）
process.env.E2E_TRADER_ASSIGNMENT ??= 'per-case';
import { applyCaseTrader } from '../../src/config/trader-roster.js';
import { maskErrorText, summarizeChecks, type CaseCheck, type CaseEvidence } from '../../src/scenarios/ct-base-runner.js';
import { expectedMaxLeverage, leverageFormulaInputs, readLeverageParams, stringifyXtEvidence } from '../../src/scenarios/xt-mkt-runner.js';
import { createUiSessionHolder, prepareUiCollect } from '../../src/ui/ui-collect-hook.js';

// v0.3.2 Trade 矩阵 B1 前端层行（TestCase/E2E/versions/v0.3.2/Trade-测试用例矩阵.md §B1）：
//   FT-MKT-LEV-007  leverage = L_min − 最小输入单位 → 明确拦截；不得静默改为 L_min；不得请求签名或创建订单
//   FT-MKT-LEV-008  leverage = L_max + 最小输入单位 → 明确拦截或按已声明规则封顶；不得页面显示超限但链上使用另一值
// 入口：本地前端（docs/07 §3/§7：fork 补丁 + :3010）+ 注入签名钱包（Node 侧私钥，私钥不进页面）。
// 只有 CURRENT.primary.admissionScope["tx-fork:frontend"] = READY_FOR_SYSTEM_TEST 才执行；否则记 coverage-gap 并 skip
// （E2E_FT_FORCE=true 可在准入前本地试跑，结果不得写入 results.md）。

const PROJECT = 'tx-fork';
const FT_TITLES = {
  'FT-MKT-LEV-007': 'Market 开仓_leverage=L_min−最小输入单位_明确拦截',
  'FT-MKT-LEV-008': 'Market 开仓_leverage=L_max+最小输入单位_明确拦截或按已声明规则封顶',
} as const;
type FtCaseId = keyof typeof FT_TITLES;

/** 页面杠杆输入的最小输入单位（fx100-apps 杠杆输入框 step=0.01；L_min = 1x 为页面规则，见 XT-MKT-LEV-003 注） */
const LEVERAGE_STEP = 0.01;
const L_MIN = 1;
/** 提交后等待页面向 ExchangeRouter 发交易的观察窗口（应当没有） */
const NO_TX_WINDOW_MS = 8_000;
/** 越界输入前先提交的合法基准杠杆（页面接受 1～L_max 且两位小数：LeverageSection.tsx handleDraftValueChange） */
const BASELINE_LEVERAGE = '5';

function frontendAdmitted(): boolean {
  const registry = loadBaselineRegistry(process.cwd());
  const scope = (registry?.primary as Record<string, unknown> | undefined)?.admissionScope as Record<string, string> | undefined;
  return scope?.['tx-fork:frontend'] === 'READY_FOR_SYSTEM_TEST';
}

function title(id: FtCaseId): string {
  return `${id} ${FT_TITLES[id]} @p0 @frontend`;
}

function check(checks: CaseCheck[], name: string, passed: boolean, actual: unknown, expected: unknown, note?: string): void {
  checks.push({ name, passed, actual: typeof actual === 'bigint' ? actual.toString() : actual, expected: typeof expected === 'bigint' ? expected.toString() : expected, ...(note ? { note } : {}) });
}

async function prepare(id: FtCaseId, testInfo: TestInfo): Promise<RuntimeConfig> {
  test.setTimeout(300_000);
  test.skip(testInfo.project.name !== PROJECT, `${id} 在 ${PROJECT} 执行（前端接 tx-fork）`);
  const admitted = frontendAdmitted();
  if (!admitted) {
    testInfo.annotations.push({
      type: 'coverage-gap',
      description: `前端层未准入（CURRENT.primary.admissionScope["tx-fork:frontend"] ≠ READY_FOR_SYSTEM_TEST）；${id} 记 GAP。前置：本地前端 :3010 + frontend-fork-patch + 专属 trader 注资（docs/07 §3/§7）。`,
    });
  }
  test.skip(!admitted && process.env.E2E_FT_FORCE !== 'true', '等 tx-fork:frontend 准入');
  const runtime = await applyCaseTrader(loadRuntimeConfig(), id);
  expect(runtime.environment, 'runtime 环境须与 --project 一致').toBe(testInfo.project.name);
  expect(runtime.signingMode, '页面用例需要 private-key 签名模式（注入钱包在 Node 侧签名）').toBe('private-key');
  return runtime;
}

interface LeverageFormObservation {
  readonly requested: string;
  /** 越界输入前已提交的合法基准杠杆显示值（应为 BASELINE_LEVERAGE） */
  readonly baselineShown: string;
  readonly leverageShown: string;
  readonly sizeShown: string;
  readonly submitVisible: boolean;
  readonly submitEnabled: boolean;
  readonly submitText: string;
  readonly formText: string;
  readonly validationText: string;
  readonly screenshots: string[];
}

/** 填表到杠杆输入为止（同 order-entry.ts 的定位：Market 页签 → 方向 → Size(USD) → Leverage），不点提交 */
async function fillLeverageForm(page: Page, isLong: boolean, sizeUsd: string, leverage: string, shotBase: string): Promise<LeverageFormObservation> {
  const screenshots: string[] = [];
  const snap = async (stage: string): Promise<void> => {
    const path = `${shotBase}-${stage}.png`;
    try { await page.screenshot({ path, fullPage: false }); screenshots.push(path); } catch { /* 截图失败不影响判定 */ }
  };
  await page.reload({ waitUntil: 'domcontentloaded' });
  const marketTab = page.getByRole('button', { name: 'Market', exact: true }).first();
  await marketTab.waitFor({ state: 'visible', timeout: 30_000 });
  await marketTab.click();
  const sideButton = page.getByRole('button', { name: isLong ? 'Buy / Long' : 'Sell / Short' }).first();
  await sideButton.waitFor({ state: 'visible', timeout: 10_000 });
  await sideButton.click();
  const sizeInput = page.getByPlaceholder('Size').first();
  await sizeInput.waitFor({ state: 'visible', timeout: 10_000 });
  const field = sizeInput.locator('xpath=ancestor::div[contains(@class,"fx-terminal-field")][1]');
  const unitTrigger = field.getByRole('combobox').first();
  if (!/usd/i.test((await unitTrigger.innerText().catch(() => '')).trim())) {
    await unitTrigger.click();
    await page.getByRole('option').filter({ hasText: /usd/i }).filter({ hasNotText: /token/i }).first().click();
    await page.waitForTimeout(200);
  }
  await sizeInput.click();
  await sizeInput.fill('');
  await sizeInput.fill(sizeUsd);
  const leverageInput = page.getByRole('textbox', { name: 'Leverage' }).first();
  await leverageInput.waitFor({ state: 'visible', timeout: 10_000 });
  // 基准：先提交一个已知合法杠杆（5x），越界输入后「显示值仍为 5」= 输入被拒绝，「显示值变为 L_min」= 静默归一化
  await leverageInput.click();
  await leverageInput.fill('');
  await leverageInput.fill(BASELINE_LEVERAGE);
  await leverageInput.press('Enter');
  await page.waitForTimeout(300);
  const baselineShown = (await leverageInput.inputValue().catch(() => '')).trim();
  await leverageInput.click();
  await leverageInput.fill('');
  await leverageInput.fill(leverage);
  await leverageInput.press('Enter');
  await leverageInput.blur().catch(() => undefined);
  await page.waitForTimeout(800);
  await snap('leverage-entered');
  const leverageShown = (await leverageInput.inputValue().catch(() => '')).trim();
  const sizeShown = (await sizeInput.inputValue().catch(() => '')).trim();
  // 提交按钮：就绪时 "Open Long/Short"；未就绪/校验失败时为校验文案且 disabled
  const form = page.locator('form').first();
  const formText = (await form.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  const submitCandidates = form.getByRole('button').filter({ hasText: /open long|open short|enter amount|leverage|invalid|exceed|min|max/i });
  const submit = submitCandidates.first();
  const submitVisible = await submit.isVisible().catch(() => false);
  const submitEnabled = submitVisible ? await submit.isEnabled().catch(() => false) : false;
  const submitText = submitVisible ? (await submit.innerText().catch(() => '')).replace(/\s+/g, ' ').trim() : '';
  // 校验文案：role=alert / aria-invalid 邻近文本 / 表单里含 leverage 的提示句
  const alerts = await page.getByRole('alert').allInnerTexts().catch(() => [] as string[]);
  const leverageHints = formText.match(/[^.。]*(leverage|杠杆)[^.。]*(min|max|between|exceed|invalid|至少|最多|不能|超过)[^.。]*/gi) ?? [];
  const validationText = [...alerts, ...leverageHints].map((item) => item.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | ');
  return { requested: leverage, baselineShown, leverageShown, sizeShown, submitVisible, submitEnabled, submitText, formText: formText.slice(0, 600), validationText, screenshots };
}

async function runFtCase(id: FtCaseId, testInfo: TestInfo, page: Page, body: (runtime: RuntimeConfig) => Promise<CaseEvidence>): Promise<void> {
  const runtime = await prepare(id, testInfo);
  let result: CaseEvidence;
  try {
    result = await body(runtime);
  } catch (error) {
    throw new Error(maskErrorText(error instanceof Error ? error.message : String(error), runtime));
  }
  const file = testInfo.outputPath(`${id.toLowerCase()}-evidence.json`);
  await writeFile(file, stringifyXtEvidence(result), 'utf8');
  await testInfo.attach(`${id.toLowerCase()}-evidence.json`, { path: file, contentType: 'application/json' });
  for (const shot of (result.data.screenshots as string[] | undefined) ?? []) {
    await testInfo.attach(shot.split('/').pop() ?? shot, { path: shot, contentType: 'image/png' }).catch(() => undefined);
  }
  testInfo.annotations.push({ type: 'checks', description: summarizeChecks(result) });
  for (const item of result.checks) {
    expect.soft(item.passed, `${id} ${item.name}：实际 ${JSON.stringify(item.actual)}，期望 ${JSON.stringify(item.expected)}${item.note ? `（${item.note}）` : ''}`).toBe(true);
  }
}

interface LeverageBoundaryOutcome {
  readonly observation: LeverageFormObservation;
  readonly routerTxCount: number;
  readonly walletRequests: number;
  readonly orderCountBefore: bigint;
  readonly orderCountAfter: bigint;
  /** 页面是否把越界值原样显示（true 时已点提交观察） */
  readonly pageAcceptedOutOfRange: boolean;
}

/** 打开前端会话 → 填表（越界杠杆）→ 若提交可点则点击并观察 NO_TX_WINDOW_MS：页面不得向 ExchangeRouter 发交易 */
async function driveLeverageBoundary(runtime: RuntimeConfig, page: Page, testInfo: TestInfo, id: FtCaseId, isLong: boolean, leverage: string): Promise<LeverageBoundaryOutcome> {
  const setup = await prepareUiCollect(runtime);
  const manifest = await loadDeploymentManifest(runtime.deploymentManifestPath);
  const bundle = await resolveMockMarketBundle(runtime.environment as never, process.env.E2E_MARKET_RESOURCE_ALIAS ?? 'default-mock');
  if (!bundle.oracle) throw new Error('mock bundle 缺少 index Mock Oracle 登记');
  const trader = getAddress(runtime.testAccount ?? '0x0000000000000000000000000000000000000000') as `0x${string}`;
  const holder = createUiSessionHolder(runtime, setup, true);
  const session = await holder.ensure(page, { rpcUrl: runtime.rpcUrl, dataStore: manifest.contracts.dataStore, oracle: bundle.oracle.address, trader });
  const signing = session.signing;
  if (!signing) throw new Error('需要 signing 会话以证明页面未请求签名');
  const { createPublicClient, http, parseAbi } = await import('viem');
  const { accountOrderListKey } = await import('../../src/scenarios/xt-mkt-runner.js');
  const client = createPublicClient({ transport: http(runtime.rpcUrl, { timeout: runtime.requestTimeoutMs }) });
  const dsAbi = parseAbi(['function getBytes32Count(bytes32) view returns (uint256)']);
  const readOrderCount = () => client.readContract({ address: getAddress(manifest.contracts.dataStore), abi: dsAbi, functionName: 'getBytes32Count', args: [accountOrderListKey(trader)] });
  const orderCountBefore = await readOrderCount();
  const shotBase = testInfo.outputPath(`${id.toLowerCase()}`);
  const observation = await fillLeverageForm(page, isLong, '50', leverage, shotBase);
  const sentBefore = signing.sent.length;
  const shownValue = normalizedLeverage(observation.leverageShown);
  const pageAcceptedOutOfRange = shownValue !== undefined && Math.abs(shownValue - Number(leverage)) < 1e-9;
  if (pageAcceptedOutOfRange && observation.submitEnabled && /open (long|short)/i.test(observation.submitText)) {
    // 页面把越界值原样显示且提交可用：点击提交，观察窗口内不得出现发往 ExchangeRouter 的交易（签名钱包 Node 侧记录）。
    // 页面已拒绝/归一化时不点：那样会以基准杠杆真实下单，不属于本行核对。
    await page.locator('form').first().getByRole('button', { name: isLong ? /^open long$/i : /^open short$/i }).first().click().catch(() => undefined);
    await page.waitForTimeout(NO_TX_WINDOW_MS);
    try { await page.screenshot({ path: `${shotBase}-after-submit.png`, fullPage: false }); observation.screenshots.push(`${shotBase}-after-submit.png`); } catch { /* ignore */ }
  }
  const router = manifest.contracts.exchangeRouter.toLowerCase();
  const routerTxCount = signing.sent.slice(sentBefore).filter((tx) => tx.to.toLowerCase() === router).length;
  const orderCountAfter = await readOrderCount();
  return { observation, routerTxCount, walletRequests: signing.sent.length - sentBefore, orderCountBefore, orderCountAfter, pageAcceptedOutOfRange };
}

function normalizedLeverage(value: string): number | undefined {
  const parsed = Number(value.replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) && value.trim() !== '' ? parsed : undefined;
}

test.describe('B1 开仓：杠杆边界外（前端层）', () => {
  test(title('FT-MKT-LEV-007'), async ({ page }, testInfo) => {
    await runFtCase('FT-MKT-LEV-007', testInfo, page, async (runtime) => {
      const requested = (L_MIN - LEVERAGE_STEP).toFixed(2);
      const outcome = await driveLeverageBoundary(runtime, page, testInfo, 'FT-MKT-LEV-007', true, requested);
      const o = outcome.observation;
      const shown = normalizedLeverage(o.leverageShown);
      const checks: CaseCheck[] = [];
      const baselineOk = normalizedLeverage(o.baselineShown) === Number(BASELINE_LEVERAGE);
      check(checks, '基准：合法杠杆 5x 可提交并显示', baselineOk, o.baselineShown, BASELINE_LEVERAGE);
      const explicitBlock = !o.submitEnabled || !/open (long|short)/i.test(o.submitText) || o.validationText !== '';
      const inputRejected = shown !== undefined && Math.abs(shown - Number(BASELINE_LEVERAGE)) < 1e-9;
      check(checks, '越界值未被页面接受（拒绝输入保持基准值 / 校验文案 / 提交不可用）', inputRejected || explicitBlock,
        { requested, leverageShown: o.leverageShown, submitEnabled: o.submitEnabled, submitText: o.submitText, validationText: o.validationText }, '显示值仍为基准 5，或提交不可用，或给出校验文案',
        o.validationText === '' ? '页面无提示文案（LeverageSection.tsx handleDraftValueChange 直接拒绝 < marks[0] 的键入）——「明确拦截」是否成立由用例裁决方定' : undefined);
      const silentlyChangedToMin = shown !== undefined && Math.abs(shown - L_MIN) < 1e-9 && o.validationText === '';
      check(checks, '不得静默改为 L_min（若归一化到 1x 必须伴随提示）', !silentlyChangedToMin,
        { requested, leverageShown: o.leverageShown, validationText: o.validationText }, '显示值 ≠ 1x，或归一化到 1x 并提示');
      check(checks, '不得请求签名或创建订单（观察窗口内无发往 ExchangeRouter 的交易）', outcome.routerTxCount === 0 && outcome.walletRequests === 0,
        { routerTxCount: outcome.routerTxCount, walletRequests: outcome.walletRequests }, { routerTxCount: 0, walletRequests: 0 });
      check(checks, '链上账户挂单数不变', outcome.orderCountAfter === outcome.orderCountBefore, outcome.orderCountAfter, outcome.orderCountBefore);
      return {
        id: 'FT-MKT-LEV-007', title: FT_TITLES['FT-MKT-LEV-007'], checks,
        data: { entry: '页面（本地前端 + 注入签名钱包）', layer: '前端层', requestedLeverage: requested, lMin: L_MIN, step: LEVERAGE_STEP, observation: o, outcome: { routerTxCount: outcome.routerTxCount, walletRequests: outcome.walletRequests, orderCountBefore: outcome.orderCountBefore.toString(), orderCountAfter: outcome.orderCountAfter.toString() }, screenshots: o.screenshots, rpc: maskUrl(runtime.rpcUrl) },
      };
    });
  });

  test(title('FT-MKT-LEV-008'), async ({ page }, testInfo) => {
    await runFtCase('FT-MKT-LEV-008', testInfo, page, async (runtime) => {
      // 页面上限 = floorUiLeverageCap(getUiMaxLeverage(前端公式, 100))：与 XT-MKT-LEV-005 同一复算
      const params = await readLeverageParams(runtime, { isLong: true, sizeDeltaUsd: 50n * 10n ** 30n });
      const expected = expectedMaxLeverage(leverageFormulaInputs(params, { includeOracleBand: false }));
      const uiCap = expected.uiCapX;
      const requested = (uiCap + LEVERAGE_STEP).toFixed(2);
      const outcome = await driveLeverageBoundary(runtime, page, testInfo, 'FT-MKT-LEV-008', true, requested);
      const o = outcome.observation;
      const shown = normalizedLeverage(o.leverageShown);
      const checks: CaseCheck[] = [];
      const clampedToCap = shown !== undefined && Math.abs(shown - uiCap) < 1e-6;
      const inputRejected = shown !== undefined && Math.abs(shown - Number(BASELINE_LEVERAGE)) < 1e-9;
      const explicitBlock = !o.submitEnabled || !/open (long|short)/i.test(o.submitText) || o.validationText !== '';
      check(checks, '基准：合法杠杆 5x 可提交并显示', normalizedLeverage(o.baselineShown) === Number(BASELINE_LEVERAGE), o.baselineShown, BASELINE_LEVERAGE);
      check(checks, '明确拦截或按已声明规则封顶到页面上限（或拒绝输入保持基准值）', explicitBlock || clampedToCap || inputRejected,
        { requested, leverageShown: o.leverageShown, uiCap, submitEnabled: o.submitEnabled, submitText: o.submitText, validationText: o.validationText }, `拦截，或 leverageShown = ${uiCap}`);
      const showsOverLimit = shown !== undefined && shown > uiCap + 1e-6;
      check(checks, '不得页面显示超限值（显示超限且可提交 = 页面与链上口径不一致）', !(showsOverLimit && o.submitEnabled),
        { leverageShown: o.leverageShown, uiCap, submitEnabled: o.submitEnabled }, '显示值 ≤ 页面上限，或提交不可用');
      check(checks, '未按封顶值下单前不得创建订单（观察窗口内无发往 ExchangeRouter 的交易）', outcome.routerTxCount === 0,
        { routerTxCount: outcome.routerTxCount, walletRequests: outcome.walletRequests }, { routerTxCount: 0 });
      check(checks, '链上账户挂单数不变', outcome.orderCountAfter === outcome.orderCountBefore, outcome.orderCountAfter, outcome.orderCountBefore);
      return {
        id: 'FT-MKT-LEV-008', title: FT_TITLES['FT-MKT-LEV-008'], checks,
        data: { entry: '页面（本地前端 + 注入签名钱包）', layer: '前端层', requestedLeverage: requested, uiCap, frontendFormulaX: expected.formulaX, step: LEVERAGE_STEP, observation: o, outcome: { routerTxCount: outcome.routerTxCount, walletRequests: outcome.walletRequests, orderCountBefore: outcome.orderCountBefore.toString(), orderCountAfter: outcome.orderCountAfter.toString() }, screenshots: o.screenshots, rpc: maskUrl(runtime.rpcUrl) },
      };
    });
  });
});

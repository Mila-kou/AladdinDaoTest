/**
 * 离线回归门：不连链，用当前 src/reporting/execution-evidence.ts 重新派生
 * artifacts/runs/<run>/attachments/<CASE>-…-evidence.json 的核对行，与旧结果逐 id 比对 status / verification，
 * 输出翻转清单到 artifacts/replay/<timestamp>-p0-replay.md（附同名 .json 全量清单）。
 *
 * 旧基线取法（按优先级）：
 *   0. --old-module <path>：用另一份 execution-evidence.ts（如 git archive HEAD 抽出的副本）对同一证据派生旧行，
 *      old/new 只差未提交改动，翻转可精确归因（head-derive 模式；给了就不再用 results.json）；
 *   1. latest 锚定：artifacts/latest/results.json 里同 id 结果的 executionEvidence.sourcePath 恰好指向本证据文件；
 *   2. run-local：该 run 目录自己的 results.json 里同 id 结果的 executionEvidence（当时代码派生的旧行）；
 *   3. 无基线：只报告新状态分布，不计翻转。
 * 派生入口复用 attachExecutionEvidence（只吃 TestRunArtifact + 附件路径，不依赖 Playwright 运行时）。
 *
 * 用法：npm run evidence:replay [-- --only SCN-011,SCN-012] [--runs-dir artifacts/runs] [--old-module <path/to/execution-evidence.ts>] [--tag <name>] [--cross-check <head-derive.json>]
 * 旧派生器副本的取法（不动仓库、不建 worktree）：在仓库根目录
 *   git archive <rev> TestCode/src TestCode/config TestCode/tsconfig.json TestCode/package.json | tar -x -C <dir>
 *   ln -s <TestCode>/node_modules <dir>/TestCode/node_modules
 * 然后 --old-module <dir>/TestCode/src/reporting/execution-evidence.ts。
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { attachExecutionEvidence } from '../src/reporting/execution-evidence.js';
import type { ScenarioResult, TestRunArtifact } from '../src/reporting/schema.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);

type Reconciliation = NonNullable<ScenarioResult['executionEvidence']>['reconciliations'][number];
type Status = Reconciliation['status'];
type Verification = NonNullable<Reconciliation['verification']>;

/** v0.3.1 锚（旧双锚点实现留下的口径文本）：新行的 formula / note 里一个都不许再出现。 */
const V031_ANCHOR = /Σmax\(positionPaysLp|v0\.3\.1 市场级净流|【事件对照·双锚点】|alternateValue|alternateFormula/;
/**
 * 旧行是否以 v0.3.1 口径建立期望：除带标签的锚外，8 月中旬的旧代码用无标签的 `max(positionPaysLp, 0)`；
 * 只要旧 formula 拿 positionPaysLp 当期望就算 v0.3.1 口径（新代码 formula 里不再出现该词，note 里只有否定式提法）。
 */
const OLD_V031_FORMULA = /positionPaysLp|v0\.3\.1|双锚点/;
/** 任何 "v0.3.1" 字样（含否定式提法），单独列出供人工裁决，不直接判失败。 */
const V031_MENTION = /v0\.3\.1/;
/** 验收 (b)：单仓应付 / 应收 Funding（真独立重算）行。 */
const FUNDING_LEG_ROW = /-(negative|positive)-funding$/;

interface CheckSummary {
  readonly id: string;
  readonly name: string;
  readonly status: Status;
  readonly verification?: Verification;
  readonly formula: string;
  readonly note?: string;
  readonly expected: string;
  readonly delta?: string;
}

interface BaselineRow {
  readonly status: Status;
  readonly verification?: Verification;
  readonly formula: string;
  readonly note?: string;
}

interface Baseline {
  readonly kind: 'latest' | 'run-local' | 'head-derive';
  readonly path: string;
  readonly rows: ReadonlyMap<string, BaselineRow>;
}

type AttachFn = typeof attachExecutionEvidence;

type FlipVerdict = '修复暴露的旧假通过' | '旧口径假 FAIL，新口径正确命中' | '新增必填输入缺失（降级为 NOT_VERIFIED）' | '口径换版（证据来自 v0.3.1 链）' | '仅验证方式重标（status 不变）' | '旧基线代码漂移（HEAD→工作树同行无翻转）' | '未解释';

interface Flip {
  readonly caseId: string;
  readonly evidencePath: string;
  readonly baselineKind: Baseline['kind'];
  readonly rowId: string;
  readonly name: string;
  readonly oldStatus: Status;
  readonly newStatus: Status;
  readonly oldVerification?: Verification;
  readonly newVerification?: Verification;
  readonly category: string;
  readonly verdict: FlipVerdict;
  readonly reason: string;
  readonly newExpected: string;
  readonly newDelta?: string;
  readonly oldFormulaHadV031Anchor: boolean;
  readonly newTextHasV031Anchor: boolean;
}

interface FileReport {
  readonly caseId: string;
  readonly runName: string;
  readonly evidencePath: string;
  readonly deployment: string;
  readonly outcome: 'derived' | 'no-deriver' | 'derive-failed';
  readonly baseline?: Baseline['kind'];
  readonly baselinePath?: string;
  readonly newRows: CheckSummary[];
  readonly newStatusDist: Record<string, number>;
  readonly matched: number;
  readonly newOnly: string[];
  readonly oldOnly: string[];
  readonly flips: Flip[];
  readonly anchorResidue: CheckSummary[];
  readonly v031Mentions: CheckSummary[];
  /** 旧行以 v0.3.1 口径建期望的行（验收 (a) 的靶子）的新状态；oldFormulaLabeled=旧 formula 带 v0.3.1 标签（双锚点期）。 */
  readonly anchoredRows: Array<{ rowId: string; oldStatus: Status; newStatus: Status; newVerification?: Verification; oldFormulaLabeled: boolean; newTextHasAnchor: boolean; newDelta?: string; newExpected: string }>;
  /** 验收 (b)：应付 / 应收 Funding 行 old→new。 */
  readonly fundingLegRows: Array<{ rowId: string; oldStatus?: Status; newStatus: Status }>;
}

interface CliOptions {
  readonly only?: ReadonlySet<string>;
  readonly runsDir: string;
  /** 旧派生器模块路径（head-derive 模式）。 */
  readonly oldModule?: string;
  /** 报告文件名后缀（区分多次回放）。 */
  readonly tag: string;
  /**
   * 交叉核对：head-derive 模式产出的 .json。results / run-local 基线里"未解释"的翻转，若同一 (证据, 行 id)
   * 在 HEAD→工作树之间没有 status 翻转，则裁定为旧基线代码漂移（run-local 基线由数周前的代码派生），不是本次改动。
   */
  readonly crossCheck?: string;
}

function parseCli(argv: readonly string[]): CliOptions {
  let only: Set<string> | undefined;
  let runsDir = 'artifacts/runs';
  let oldModule: string | undefined;
  let crossCheck: string | undefined;
  let tag = 'p0-replay';
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--only') {
      const value = argv[index + 1] ?? '';
      only = new Set(value.split(',').map((item) => item.trim()).filter(Boolean));
      index += 1;
    } else if (arg === '--runs-dir') {
      runsDir = argv[index + 1] ?? runsDir;
      index += 1;
    } else if (arg === '--old-module') {
      oldModule = argv[index + 1];
      index += 1;
    } else if (arg === '--tag') {
      tag = argv[index + 1] ?? tag;
      index += 1;
    } else if (arg === '--cross-check') {
      crossCheck = argv[index + 1];
      index += 1;
    }
  }
  return { ...(only ? { only } : {}), runsDir, ...(oldModule ? { oldModule } : {}), tag, ...(crossCheck ? { crossCheck } : {}) };
}

/** head-derive 清单里发生 status 翻转的 (证据路径#行 id) 集合。 */
async function loadCrossCheck(path: string): Promise<{ flipped: ReadonlySet<string>; covered: ReadonlySet<string>; path: string }> {
  const parsed = JSON.parse(await readFile(resolve(ROOT, path), 'utf8')) as { reports?: FileReport[] };
  const flipped = new Set<string>();
  const covered = new Set<string>();
  for (const report of parsed.reports ?? []) {
    if (report.outcome !== 'derived' || !report.baseline) continue;
    covered.add(report.evidencePath);
    for (const flip of report.flips) {
      if (flip.oldStatus !== flip.newStatus) flipped.add(`${report.evidencePath}#${flip.rowId}`);
    }
  }
  return { flipped, covered, path };
}

function applyCrossCheck(reports: FileReport[], cross: { flipped: ReadonlySet<string>; covered: ReadonlySet<string>; path: string }): FileReport[] {
  return reports.map((report) => ({
    ...report,
    flips: report.flips.map((flip) => {
      if (flip.verdict !== '未解释' || !cross.covered.has(report.evidencePath)) return flip;
      if (cross.flipped.has(`${report.evidencePath}#${flip.rowId}`)) return flip;
      return {
        ...flip,
        verdict: '旧基线代码漂移（HEAD→工作树同行无翻转）',
        reason: `run-local 旧行由当时代码派生；同一证据用 HEAD 派生器与工作树派生器对比（${cross.path}）该行 status 不变，翻转来自基线代码漂移而非本次未提交改动。`,
      };
    }),
  }));
}

type JsonRecord = Record<string, unknown>;
function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

/** 附件文件名 → (用例 id, 附件名)。形如 SCN-011-tx-fork-r0-7-scn-011-evidence.json / XT-MKT-OPEN-001-tx-fork-r0-0-xt-mkt-open-001-evidence.json。 */
function parseEvidenceName(fileName: string): { caseId: string; attachmentName: string } | undefined {
  const matched = /^([A-Z]+(?:-[A-Z0-9]+)*-\d{3})-.+?-r\d+-\d+-(.+-evidence\.json)$/.exec(fileName);
  if (!matched) return undefined;
  const caseId = matched[1] ?? '';
  const attachmentName = matched[2] ?? '';
  if (!caseId || !attachmentName) return undefined;
  return { caseId, attachmentName };
}

function syntheticArtifact(caseId: string, attachmentName: string, attachmentPath: string): TestRunArtifact {
  const at = new Date(0).toISOString();
  const suite = caseId.startsWith('SCN-') ? 'S00' : (caseId.split('-')[0] ?? 'CT');
  const result: ScenarioResult = {
    id: caseId,
    testId: `replay-${caseId}`,
    suite,
    scenarioTitle: caseId,
    testTitle: caseId,
    priority: 'P0',
    project: 'replay',
    environment: 'replay',
    status: 'PASS',
    checkResult: '离线回放',
    executionLinks: [],
    executedAt: at,
    expectedStatus: 'passed',
    durationMs: 0,
    attempts: [{
      retry: 0,
      status: 'passed',
      startedAt: at,
      durationMs: 0,
      attachments: [{ name: attachmentName, contentType: 'application/json', path: attachmentPath }],
    }],
    tags: [],
    annotations: [],
  };
  return {
    schemaVersion: 2,
    sourceStatus: 'fixture',
    source: {
      kind: 'playwright-reporter',
      grain: 'one row per scenario and Playwright project final outcome',
      generatedAt: at,
      catalogPath: 'replay',
      metricDefinitions: {},
    },
    run: {
      id: 'replay',
      startedAt: at,
      endedAt: at,
      durationMs: 0,
      playwrightStatus: 'passed',
      environments: [],
      projectNames: [],
      discoveredTests: 0,
    },
    catalog: [],
    results: [result],
    qualityIssues: [],
  };
}

function summarize(row: Reconciliation): CheckSummary {
  return {
    id: row.id,
    name: row.label,
    status: row.status,
    ...(row.verification ? { verification: row.verification } : {}),
    formula: row.formula,
    ...(row.note ? { note: row.note } : {}),
    expected: row.expected,
    ...(row.delta ? { delta: row.delta } : {}),
  };
}

function baselineRowsOf(result: ScenarioResult | undefined): Map<string, BaselineRow> | undefined {
  if (!result?.executionEvidence) return undefined;
  const rows = new Map<string, BaselineRow>();
  for (const row of result.executionEvidence.reconciliations) {
    rows.set(row.id, {
      status: row.status,
      ...(row.verification ? { verification: row.verification } : {}),
      formula: row.formula,
      ...(row.note ? { note: row.note } : {}),
    });
  }
  return rows;
}

async function readArtifact(path: string): Promise<TestRunArtifact | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as TestRunArtifact;
  } catch {
    return undefined;
  }
}

function deploymentOf(raw: JsonRecord): string {
  const datasets = Array.isArray(raw.datasets) ? raw.datasets : undefined;
  const environment = datasets && datasets.length > 0
    ? record(record(record(datasets[0]).evidence).environment)
    : record(raw.environment);
  const deployment = environment.deployment;
  return typeof deployment === 'string' && deployment ? deployment : '（证据未登记 deployment）';
}

function explainFlip(input: {
  readonly rowId: string;
  readonly newRow: CheckSummary;
  readonly oldRow: BaselineRow;
  readonly deployment: string;
}): { category: string; verdict: FlipVerdict; reason: string } {
  const { rowId, newRow, oldRow, deployment } = input;
  const statusChanged = newRow.status !== oldRow.status;
  const fromV031Chain = /v0\.3\.1/i.test(deployment);
  if (!statusChanged) {
    return {
      category: 'verification 重标',
      verdict: '仅验证方式重标（status 不变）',
      reason: `${oldRow.verification ?? '（无）'} → ${newRow.verification ?? '（无）'}：classifyVerification 前缀匹配修复 / 期望显式标注 verification，期望值来源本就是事件字段。`,
    };
  }
  if (OLD_V031_FORMULA.test(oldRow.formula)) {
    if (newRow.status === 'PASS') {
      return {
        category: 'claimable FUNDING：v0.3.1 锚行',
        verdict: '旧口径假 FAIL，新口径正确命中',
        reason: '旧行用 positionPaysLp（v0.3.1 市场级净流）建期望，在本证据上未命中；v0.3.2 口径 max(negAmt−posAmt,0) 精确等于链上 Actual Δ。',
      };
    }
    if (newRow.status === 'NOT_VERIFIED') {
      return {
        category: 'claimable FUNDING：v0.3.1 锚行',
        verdict: '新增必填输入缺失（降级为 NOT_VERIFIED）',
        reason: `旧行靠 positionPaysLp 口径 PASS；新口径输入不可确定，如实 NOT_VERIFIED：${newRow.expected}`,
      };
    }
    return {
      category: 'claimable FUNDING：v0.3.1 锚行',
      verdict: '修复暴露的旧假通过',
      reason: '旧行靠 positionPaysLp（v0.3.1 市场级净流）口径命中 PASS；v0.3.2 唯一口径 max(negAmt−posAmt,0) 下 Actual Δ 不再命中（证据链上是 v0.3.1 时两口径可差 1 raw 或整笔不同）。',
    };
  }
  if (/-dynamic-spread$/.test(rowId)) {
    if (newRow.status === 'NOT_VERIFIED' && /DYNAMIC_SPREAD/.test(newRow.expected)) {
      return {
        category: '动态点差：clamp 上下界缺快照',
        verdict: '新增必填输入缺失（降级为 NOT_VERIFIED）',
        reason: '历史证据参数快照没有 MIN/MAX_DYNAMIC_SPREAD(isLong) 标签（快照兜底读取是本次新增，旧证据无法补采）；旧实现 max(0,sum) 不需要该输入。',
      };
    }
    if (fromV031Chain) {
      return {
        category: '动态点差：clamp 口径 vs v0.3.1 事件值',
        verdict: '口径换版（证据来自 v0.3.1 链）',
        reason: '证据链上是 v0.3.1（max(0,sum)），期望改按 v0.3.2 clamp(raw,min,max) 复算，不同版本合约的真实行为本就不同。',
      };
    }
    return { category: '动态点差', verdict: '未解释', reason: '同为 v0.3.2 证据但 clamp 复算结果与事件不一致，需逐条看。' };
  }
  if (/-ledger-(posVaultUsdc|lpVaultAssets)$/.test(rowId)) {
    if (newRow.status === 'NOT_VERIFIED') {
      return {
        category: 'Vault Δ：LP→Position Funding 缺输入',
        verdict: '新增必填输入缺失（降级为 NOT_VERIFIED）',
        reason: 'LP→Position Funding 现按本仓 PositionFeesCollected 推导；证据缺 PositionFeesCollected / 减仓缺 orderType / 清算单 → 不建立期望。',
      };
    }
    if (fromV031Chain) {
      return {
        category: 'Vault Δ：LP→Position Funding 改口径',
        verdict: '口径换版（证据来自 v0.3.1 链）',
        reason: '旧期望用 Funding 事件 Σmax(−positionPaysLp,0)（v0.3.1 市场级净流），新期望用 max(posAmt−negAmt,0)（v0.3.2 settleFundingFees）；v0.3.1 链上真实转账走的是旧口径。',
      };
    }
    return { category: 'Vault Δ', verdict: '未解释', reason: '同为 v0.3.2 证据但 Vault Δ 期望不再命中，需逐条看。' };
  }
  if (/claimable-funding$|claimableFeeAmountFunding$/.test(rowId)) {
    if (newRow.status === 'NOT_VERIFIED') {
      return {
        category: 'claimable FUNDING：缺输入',
        verdict: '新增必填输入缺失（降级为 NOT_VERIFIED）',
        reason: newRow.expected,
      };
    }
    return { category: 'claimable FUNDING', verdict: '未解释', reason: '旧行不是 v0.3.1 锚却翻转，需逐条看。' };
  }
  return { category: '其它', verdict: '未解释', reason: `旧 ${oldRow.status} → 新 ${newRow.status}；不属于本次改动声明的任何行族。` };
}

async function replayOne(input: {
  readonly runName: string;
  readonly fileName: string;
  readonly runsDir: string;
  readonly latestById: ReadonlyMap<string, ScenarioResult>;
  readonly oldAttach?: AttachFn;
  readonly oldModulePath?: string;
}): Promise<FileReport | undefined> {
  const parsed = parseEvidenceName(input.fileName);
  if (!parsed) return undefined;
  const { caseId, attachmentName } = parsed;
  const evidencePath = join(input.runsDir, input.runName, 'attachments', input.fileName);
  const relativeEvidence = relative(ROOT, resolve(ROOT, evidencePath));
  let raw: JsonRecord = {};
  try {
    raw = record(JSON.parse(await readFile(evidencePath, 'utf8')) as unknown);
  } catch {
    return {
      caseId, runName: input.runName, evidencePath: relativeEvidence, deployment: '（证据 JSON 无法解析）', outcome: 'derive-failed',
      newRows: [], newStatusDist: {}, matched: 0, newOnly: [], oldOnly: [], flips: [], anchorResidue: [], v031Mentions: [], anchoredRows: [], fundingLegRows: [],
    };
  }
  const deployment = deploymentOf(raw);
  const replayed = await attachExecutionEvidence(syntheticArtifact(caseId, attachmentName, relativeEvidence));
  const evidence = replayed.results[0]?.executionEvidence;
  if (!evidence) {
    return {
      caseId, runName: input.runName, evidencePath: relativeEvidence, deployment,
      outcome: caseId.startsWith('SCN-') ? 'derive-failed' : 'no-deriver',
      newRows: [], newStatusDist: {}, matched: 0, newOnly: [], oldOnly: [], flips: [], anchorResidue: [], v031Mentions: [], anchoredRows: [], fundingLegRows: [],
    };
  }
  const newRows = evidence.reconciliations.map(summarize);
  const newStatusDist: Record<string, number> = {};
  for (const row of newRows) newStatusDist[row.status] = (newStatusDist[row.status] ?? 0) + 1;
  const anchorResidue = newRows.filter((row) => V031_ANCHOR.test(row.formula) || V031_ANCHOR.test(row.note ?? ''));
  const v031Mentions = newRows.filter((row) => V031_MENTION.test(row.formula) || V031_MENTION.test(row.note ?? ''));

  // 基线选择：head-derive（给了旧派生器就只用它）→ latest 锚定 → run-local → 无
  let baseline: Baseline | undefined;
  if (input.oldAttach) {
    const oldReplayed = await input.oldAttach(syntheticArtifact(caseId, attachmentName, relativeEvidence));
    const rows = baselineRowsOf(oldReplayed.results[0]);
    if (rows) baseline = { kind: 'head-derive', path: input.oldModulePath ?? '--old-module', rows };
  }
  const latestResult = input.latestById.get(caseId);
  if (!baseline && !input.oldAttach && latestResult?.executionEvidence?.sourcePath === relativeEvidence) {
    const rows = baselineRowsOf(latestResult);
    if (rows) baseline = { kind: 'latest', path: 'artifacts/latest/results.json', rows };
  }
  if (!baseline && !input.oldAttach) {
    const runLocalPath = join(input.runsDir, input.runName, 'results.json');
    const runLocal = await readArtifact(runLocalPath);
    const candidates = (runLocal?.results ?? []).filter((item) => item.id === caseId && item.executionEvidence);
    const preferred = candidates.find((item) => item.attempts.some((attempt) => attempt.attachments.some((attachment) => attachment.path?.endsWith(input.fileName))))
      ?? candidates[0];
    const rows = baselineRowsOf(preferred);
    if (rows) baseline = { kind: 'run-local', path: relative(ROOT, resolve(ROOT, runLocalPath)), rows };
  }

  const flips: Flip[] = [];
  const anchoredRows: FileReport['anchoredRows'] = [];
  const fundingLegRows: FileReport['fundingLegRows'] = [];
  const newOnly: string[] = [];
  let matched = 0;
  if (baseline) {
    for (const row of newRows) {
      const old = baseline.rows.get(row.id);
      if (FUNDING_LEG_ROW.test(row.id)) {
        fundingLegRows.push({ rowId: row.id, ...(old ? { oldStatus: old.status } : {}), newStatus: row.status });
      }
      if (!old) {
        newOnly.push(row.id);
        continue;
      }
      matched += 1;
      const newTextHasAnchor = V031_ANCHOR.test(row.formula) || V031_ANCHOR.test(row.note ?? '');
      if (OLD_V031_FORMULA.test(old.formula)) {
        anchoredRows.push({
          rowId: row.id, oldStatus: old.status, newStatus: row.status, ...(row.verification ? { newVerification: row.verification } : {}),
          oldFormulaLabeled: V031_ANCHOR.test(old.formula),
          newTextHasAnchor, ...(row.delta ? { newDelta: row.delta } : {}), newExpected: row.expected,
        });
      }
      const statusChanged = row.status !== old.status;
      const verificationChanged = (row.verification ?? '') !== (old.verification ?? '');
      if (!statusChanged && !verificationChanged) continue;
      const explanation = explainFlip({ rowId: row.id, newRow: row, oldRow: old, deployment });
      flips.push({
        caseId, evidencePath: relativeEvidence, baselineKind: baseline.kind, rowId: row.id, name: row.name,
        oldStatus: old.status, newStatus: row.status,
        ...(old.verification ? { oldVerification: old.verification } : {}),
        ...(row.verification ? { newVerification: row.verification } : {}),
        category: explanation.category, verdict: explanation.verdict, reason: explanation.reason,
        newExpected: row.expected, ...(row.delta ? { newDelta: row.delta } : {}),
        oldFormulaHadV031Anchor: OLD_V031_FORMULA.test(old.formula), newTextHasV031Anchor: newTextHasAnchor,
      });
    }
  } else {
    for (const row of newRows) {
      if (FUNDING_LEG_ROW.test(row.id)) fundingLegRows.push({ rowId: row.id, newStatus: row.status });
    }
  }
  const newIds = new Set(newRows.map((row) => row.id));
  const oldOnly = baseline ? [...baseline.rows.keys()].filter((id) => !newIds.has(id)) : [];
  return {
    caseId, runName: input.runName, evidencePath: relativeEvidence, deployment, outcome: 'derived',
    ...(baseline ? { baseline: baseline.kind, baselinePath: baseline.path } : {}),
    newRows, newStatusDist, matched, newOnly, oldOnly, flips, anchorResidue, v031Mentions, anchoredRows, fundingLegRows,
  };
}

function count<T>(items: readonly T[], predicate: (item: T) => boolean): number {
  return items.reduce((total, item) => total + (predicate(item) ? 1 : 0), 0);
}

function dist(items: readonly string[]): string {
  const map: Record<string, number> = {};
  for (const item of items) map[item] = (map[item] ?? 0) + 1;
  return Object.entries(map).map(([key, value]) => `${key}=${value}`).join('，') || '—';
}

function md(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function renderReport(input: {
  readonly generatedAt: string;
  readonly reports: readonly FileReport[];
  readonly options: CliOptions;
  readonly jsonPath: string;
}): string {
  const { reports } = input;
  const derived = reports.filter((item) => item.outcome === 'derived');
  const withBaseline = derived.filter((item) => item.baseline);
  const latestAnchored = derived.filter((item) => item.baseline === 'latest');
  const allFlips = derived.flatMap((item) => item.flips);
  const statusFlips = allFlips.filter((flip) => flip.oldStatus !== flip.newStatus);
  const verificationOnly = allFlips.filter((flip) => flip.oldStatus === flip.newStatus);
  const unexplained = statusFlips.filter((flip) => flip.verdict === '未解释');
  const headMode = derived.some((item) => item.baseline === 'head-derive');
  const anchoredAll = derived.flatMap((item) => item.anchoredRows.map((row) => ({ caseId: item.caseId, baseline: item.baseline, ...row })));
  // 验收 (a) 的严格靶子：results 模式 = latest 锚定的旧行；head-derive 模式 = HEAD 双锚点展示了 v0.3.1 命中口径的旧行（带标签）。
  const anchoredStrict = headMode
    ? anchoredAll.filter((row) => row.oldFormulaLabeled)
    : latestAnchored.flatMap((item) => item.anchoredRows.map((row) => ({ caseId: item.caseId, baseline: item.baseline, ...row })));
  const anchoredLatest = anchoredStrict;
  const anchoredStrictStillPass = anchoredStrict.filter((row) => row.newStatus === 'PASS');
  // 宽口径（run-local 无标签旧行）里仍 PASS 的：Δ=0 且两口径同值属正常，非零 Δ 仍 PASS 说明两口径数值恰好相等，列出供复核。
  const anchoredStillPass = anchoredAll.filter((row) => row.newStatus === 'PASS');
  const anchoredLooseStillPassNonZero = anchoredStillPass.filter((row) => !anchoredStrict.includes(row) && row.oldStatus === 'PASS' && !/^0 raw/.test(row.newDelta ?? ''));
  const anchoredTextResidue = anchoredAll.filter((row) => row.newTextHasAnchor);
  const anchorResidueTotal = derived.reduce((total, item) => total + item.anchorResidue.length, 0);
  const fundingLegs = derived.flatMap((item) => item.fundingLegRows.map((row) => ({ caseId: item.caseId, baseline: item.baseline, ...row })));
  const fundingLegsLatest = fundingLegs.filter((row) => row.baseline === 'latest');
  const fundingLegRegress = fundingLegs.filter((row) => row.oldStatus === 'PASS' && row.newStatus !== 'PASS');
  const fundingLegNotPass = fundingLegs.filter((row) => row.newStatus !== 'PASS');

  const criteriaA = anchoredStrictStillPass.length === 0 && anchoredTextResidue.length === 0 && anchorResidueTotal === 0 && anchoredStrict.length > 0;
  // (b) 以"有旧行的应付/应收 Funding 行"为准：head-derive 模式没有 latest 基线，不能拿 latest 条数当门槛。
  const fundingLegsWithOld = fundingLegs.filter((row) => row.oldStatus !== undefined);
  const criteriaB = fundingLegRegress.length === 0 && fundingLegsWithOld.length > 0 && fundingLegsWithOld.every((row) => row.newStatus === 'PASS');
  const criteriaC = unexplained.length === 0;

  const lines: string[] = [];
  lines.push(`# P0 离线回放回归门（${input.generatedAt}）`);
  lines.push('');
  lines.push(`- 新派生器：\`src/reporting/execution-evidence.ts\`（当前工作树）→ \`attachExecutionEvidence\`；不连链。`);
  lines.push(`- 证据来源：\`${input.options.runsDir}/*/attachments/*-evidence.json\`${input.options.only ? `（--only ${[...input.options.only].join(',')}）` : ''}：${reports.length} 份；成功派生 ${derived.length}，无派生器（CT/XT/FT 透明兜底）${count(reports, (item) => item.outcome === 'no-deriver')}，派生失败 ${count(reports, (item) => item.outcome === 'derive-failed')}。`);
  if (headMode) {
    lines.push(`- 旧基线：head-derive —— 用 \`${input.options.oldModule ?? ''}\`（旧派生器）对同一证据重新派生，old/new 只差未提交改动；有基线 ${withBaseline.length} 份，无基线 ${derived.length - withBaseline.length} 份。`);
  } else {
    lines.push(`- 旧基线：latest 锚定（\`artifacts/latest/results.json\` 的 sourcePath 指向本证据）${latestAnchored.length} 份；run-local（run 目录自己的 results.json，由当时的代码派生，含数周代码漂移）${withBaseline.length - latestAnchored.length} 份；无基线 ${derived.length - withBaseline.length} 份。`);
  }
  lines.push(`- 全量清单（含每行新 formula/note）：\`${input.jsonPath}\``);
  lines.push('');
  lines.push('## 0 验收结论');
  lines.push('');
  lines.push(`| 项 | 结论 | 依据 |`);
  lines.push(`|---|---|---|`);
  lines.push(`| (a) 旧 v0.3.1 锚行不再 PASS 且新文本无 v0.3.1 锚 | ${criteriaA ? '满足' : '不满足'} | 严格靶子（${headMode ? 'HEAD 双锚点展示 v0.3.1 命中口径的行' : 'latest 锚定的旧行'}）${anchoredStrict.length} 条：新状态仍 PASS ${anchoredStrictStillPass.length} 条，新 formula/note 仍含锚 ${anchoredTextResidue.length} 条；全部新行含锚残留 ${anchorResidueTotal} 条。宽口径（旧 formula 用 positionPaysLp 建期望，含无标签旧写法）共 ${anchoredAll.length} 条，其中仍 PASS ${anchoredStillPass.length} 条（Δ≠0 且旧 PASS 的 ${anchoredLooseStillPassNonZero.length} 条见 §2 复核） |`);
  lines.push(`| (b) 单仓应付 / 应收 Funding 行保持 PASS | ${criteriaB ? '满足' : '不满足'} | 有旧行的应付/应收行 ${fundingLegsWithOld.length} 条（latest ${fundingLegsLatest.length}）；PASS→非PASS ${fundingLegRegress.length} 条；新状态非 PASS 共 ${fundingLegNotPass.length} 条（${dist(fundingLegNotPass.map((row) => `${row.baseline ?? '无基线'}:${row.newStatus}`))}） |`);
  lines.push(`| (c) 其它翻转均可解释 | ${criteriaC ? '满足' : '不满足'} | status 翻转 ${statusFlips.length} 条：${dist(statusFlips.map((flip) => flip.verdict))}；未解释 ${unexplained.length} 条${input.options.crossCheck ? `（交叉核对 \`${input.options.crossCheck}\`）` : ''} |`);
  lines.push('');
  lines.push(`> "v0.3.1" 字样残留（含否定式提法，如「不退回 v0.3.1 的 positionPaysLp 口径」）：${derived.reduce((total, item) => total + item.v031Mentions.length, 0)} 行，见 §5，供人工裁决；锚判定用的正则是 \`${V031_ANCHOR.source}\`。`);
  lines.push('');

  lines.push('## 1 逐证据总览');
  lines.push('');
  lines.push('| 用例 | run | 链部署 | 基线 | 新行数 | 匹配 | status 翻转 | 仅 verification 翻转 | 新增行 | 旧独有行 | 新状态分布 |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const item of reports) {
    if (item.outcome !== 'derived') {
      lines.push(`| ${item.caseId} | ${item.runName} | ${md(item.deployment)} | — | ${item.outcome === 'no-deriver' ? '无派生器' : '派生失败'} | | | | | | |`);
      continue;
    }
    const statusFlipCount = count(item.flips, (flip) => flip.oldStatus !== flip.newStatus);
    lines.push(`| ${item.caseId} | ${item.runName} | ${md(item.deployment)} | ${item.baseline ?? '无'} | ${item.newRows.length} | ${item.matched} | ${statusFlipCount} | ${item.flips.length - statusFlipCount} | ${item.newOnly.length} | ${item.oldOnly.length} | ${md(Object.entries(item.newStatusDist).map(([key, value]) => `${key}=${value}`).join('，'))} |`);
  }
  lines.push('');

  lines.push('## 2 验收 (a)：旧 formula 以 v0.3.1 口径建期望的行');
  lines.push('');
  lines.push(`共 ${anchoredAll.length} 行（每个执行阶段一对：ledger \`…-claimableFeeAmountFunding\` + Funding 组 \`…-claimable-funding\`）；old→new 分布：${dist(anchoredAll.map((row) => `${row.oldStatus}→${row.newStatus}`))}。`);
  lines.push('');
  if (anchoredLooseStillPassNonZero.length) {
    lines.push(`### 2.0 复核：旧 PASS → 新 PASS 且 Δ≠0（两口径数值恰好相等，新 PASS 由 v0.3.2 公式独立成立）`);
    lines.push('');
    for (const row of anchoredLooseStillPassNonZero) lines.push(`- ${row.caseId} ${row.rowId}：Δ ${row.newDelta ?? ''}，新 Expected ${row.newExpected}`);
    lines.push('');
  }
  lines.push('### 2.1 严格靶子逐条');
  lines.push('');
  lines.push('| 用例 | 基线 | 行 id | 旧 | 新 | 新验证方式 | 新文本含锚 | 链上 Δ | 新 Expected |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const row of anchoredStrict) {
    lines.push(`| ${row.caseId} | ${row.baseline ?? ''} | ${row.rowId} | ${row.oldStatus} | ${row.newStatus} | ${row.newVerification ?? ''} | ${row.newTextHasAnchor ? '是' : '否'} | ${md(row.newDelta ?? '')} | ${md(row.newExpected)} |`);
  }
  lines.push('');
  const anchoredLoose = anchoredAll.filter((row) => !anchoredStrict.includes(row));
  if (anchoredLoose.length) {
    lines.push('### 2.2 宽口径其余行（按用例汇总）');
    lines.push('');
    const byCase = new Map<string, typeof anchoredLoose>();
    for (const row of anchoredLoose) byCase.set(row.caseId, [...(byCase.get(row.caseId) ?? []), row]);
    lines.push('| 用例 | 条数 | old→new 分布 |');
    lines.push('|---|---|---|');
    for (const [caseId, rows] of byCase) lines.push(`| ${caseId} | ${rows.length} | ${dist(rows.map((row) => `${row.oldStatus}→${row.newStatus}`))} |`);
    lines.push('');
  }

  lines.push('## 3 验收 (b)：单仓应付 / 应收 Funding 行');
  lines.push('');
  lines.push(`有基线 ${fundingLegs.length} 行：${dist(fundingLegs.map((row) => `${row.oldStatus ?? '无旧行'}→${row.newStatus}`))}。`);
  if (fundingLegNotPass.length) {
    lines.push('');
    lines.push('| 用例 | 基线 | 行 id | 旧 | 新 |');
    lines.push('|---|---|---|---|---|');
    for (const row of fundingLegNotPass) lines.push(`| ${row.caseId} | ${row.baseline ?? '无'} | ${row.rowId} | ${row.oldStatus ?? '—'} | ${row.newStatus} |`);
  }
  lines.push('');

  lines.push('## 4 验收 (c)：status 翻转分类');
  lines.push('');
  const byCategory = new Map<string, Flip[]>();
  for (const flip of statusFlips) {
    const key = `${flip.category}｜${flip.verdict}`;
    byCategory.set(key, [...(byCategory.get(key) ?? []), flip]);
  }
  lines.push('| 类别 | 裁定 | 条数 | old→new 分布 | 涉及用例 | 理由 |');
  lines.push('|---|---|---|---|---|---|');
  for (const [key, flips] of byCategory) {
    const [category, verdict] = key.split('｜');
    lines.push(`| ${category ?? ''} | ${verdict ?? ''} | ${flips.length} | ${dist(flips.map((flip) => `${flip.oldStatus}→${flip.newStatus}`))} | ${[...new Set(flips.map((flip) => flip.caseId))].join('、')} | ${md(flips[0]?.reason ?? '')} |`);
  }
  lines.push('');
  if (unexplained.length) {
    lines.push('### 4.1 未解释翻转（逐条）');
    lines.push('');
    lines.push('| 用例 | 证据 | 行 id | 名称 | 旧 | 新 | 新 Expected | 链上 Δ |');
    lines.push('|---|---|---|---|---|---|---|---|');
    for (const flip of unexplained) {
      lines.push(`| ${flip.caseId} | ${flip.evidencePath} | ${flip.rowId} | ${md(flip.name)} | ${flip.oldStatus} | ${flip.newStatus} | ${md(flip.newExpected)} | ${md(flip.newDelta ?? '')} |`);
    }
    lines.push('');
  }
  lines.push('### 4.2 status 翻转逐条清单');
  lines.push('');
  lines.push('| 用例 | 基线 | 行 id | 旧 | 新 | 裁定 | 链上 Δ | 新 Expected |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const flip of statusFlips) {
    lines.push(`| ${flip.caseId} | ${flip.baselineKind} | ${flip.rowId} | ${flip.oldStatus}/${flip.oldVerification ?? ''} | ${flip.newStatus}/${flip.newVerification ?? ''} | ${flip.verdict} | ${md(flip.newDelta ?? '')} | ${md(flip.newExpected)} |`);
  }
  lines.push('');

  lines.push('## 5 仅 verification 重标（status 不变）与 v0.3.1 字样残留');
  lines.push('');
  lines.push(`仅 verification 翻转 ${verificationOnly.length} 条：${dist(verificationOnly.map((flip) => `${flip.oldVerification ?? '无'}→${flip.newVerification ?? '无'}`))}；按行族：${dist(verificationOnly.map((flip) => flip.rowId.replace(/^.*?-(tx\d+|ledger)/, '…-$1')))}。`);
  lines.push('');
  const mentions = derived.flatMap((item) => item.v031Mentions.map((row) => ({ caseId: item.caseId, row })));
  if (mentions.length) {
    lines.push('| 用例 | 行 id | 状态 | 含 "v0.3.1" 的片段 |');
    lines.push('|---|---|---|---|');
    for (const { caseId, row } of mentions) {
      const text = `${row.formula} ${row.note ?? ''}`;
      const at = text.search(V031_MENTION);
      lines.push(`| ${caseId} | ${row.id} | ${row.status} | ${md(text.slice(Math.max(0, at - 30), at + 50))} |`);
    }
  } else {
    lines.push('无。');
  }
  lines.push('');

  lines.push('## 6 覆盖说明');
  lines.push('');
  for (const item of reports) {
    if (item.outcome === 'no-deriver') lines.push(`- ${item.caseId}（${item.runName}）：功能用例透明兜底，无派生器，跳过。`);
    if (item.outcome === 'derive-failed') lines.push(`- ${item.caseId}（${item.runName}）：派生失败或证据无法解析。`);
    if (item.outcome === 'derived' && !item.baseline) lines.push(`- ${item.caseId}（${item.runName}）：无旧基线，只报告新状态分布 ${Object.entries(item.newStatusDist).map(([key, value]) => `${key}=${value}`).join('，')}。`);
  }
  lines.push('');
  return lines.join('\n');
}

async function loadOldAttach(modulePath: string): Promise<AttachFn> {
  const url = pathToFileURL(resolve(ROOT, modulePath)).href;
  const loaded = await import(url) as { attachExecutionEvidence?: AttachFn };
  if (typeof loaded.attachExecutionEvidence !== 'function') {
    throw new Error(`--old-module ${modulePath} 未导出 attachExecutionEvidence`);
  }
  return loaded.attachExecutionEvidence;
}

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  const oldAttach = options.oldModule ? await loadOldAttach(options.oldModule) : undefined;
  const latest = await readArtifact('artifacts/latest/results.json');
  const latestById = new Map<string, ScenarioResult>();
  for (const result of latest?.results ?? []) latestById.set(result.id, result);

  const runNames = (await readdir(options.runsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  let reports: FileReport[] = [];
  for (const runName of runNames) {
    const attachmentsDir = join(options.runsDir, runName, 'attachments');
    if (!existsSync(attachmentsDir)) continue;
    const files = (await readdir(attachmentsDir)).filter((name) => name.endsWith('-evidence.json')).sort();
    for (const fileName of files) {
      const parsed = parseEvidenceName(fileName);
      if (!parsed) continue;
      if (options.only && !options.only.has(parsed.caseId)) continue;
      const report = await replayOne({
        runName, fileName, runsDir: options.runsDir, latestById,
        ...(oldAttach ? { oldAttach } : {}),
        ...(options.oldModule ? { oldModulePath: options.oldModule } : {}),
      });
      if (report) reports.push(report);
    }
  }
  if (options.crossCheck) reports = applyCrossCheck(reports, await loadCrossCheck(options.crossCheck));

  const generatedAt = new Date().toISOString();
  const stamp = generatedAt.replace(/:/g, '').replace('.', '-');
  const outDir = resolve(ROOT, 'artifacts/replay');
  await mkdir(outDir, { recursive: true });
  const jsonPath = join('artifacts/replay', `${stamp}-${options.tag}.json`);
  const mdPath = join('artifacts/replay', `${stamp}-${options.tag}.md`);
  await writeFile(resolve(ROOT, jsonPath), JSON.stringify({ generatedAt, options: { ...options, only: options.only ? [...options.only] : undefined }, reports }, null, 2));
  const markdown = renderReport({ generatedAt, reports, options, jsonPath });
  await writeFile(resolve(ROOT, mdPath), markdown);

  const derived = reports.filter((item) => item.outcome === 'derived');
  const flips = derived.flatMap((item) => item.flips);
  const statusFlips = flips.filter((flip) => flip.oldStatus !== flip.newStatus);
  console.log(`回放 ${reports.length} 份证据（派生 ${derived.length}）；status 翻转 ${statusFlips.length}，仅 verification 翻转 ${flips.length - statusFlips.length}，未解释 ${count(statusFlips, (flip) => flip.verdict === '未解释')}。`);
  console.log(`报告：${mdPath}`);
  console.log(`清单：${jsonPath}`);
}

await main();

import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { z } from 'zod';

import { VERSION_CASE_ID } from '../reporting/version-cases.js';

/**
 * 版本功能用例结果台账（TestCase/E2E/versions/<release>/results.md 标记区）读写 +
 * 手工批次归档（TestCase/E2E/manual-runs/<日期-批次名>/）。
 *
 * 写回约定（与 results.md 文件内注释、跨会话对齐一致，三条硬规则）：
 * 1. 只改 `<!-- functional-results:start -->` / `<!-- functional-results:end -->` 之间的表格行，
 *    且只追加不覆盖（同 ID 重复执行 = 新行）；
 * 2. 整文件原子替换（临时文件 + rename），标记区外内容字节级不变；
 * 3. 写回前校验行 schema（10 列）与状态词汇（PASS/FAIL/BLOCKED/GAP/NOT_RUN；交叉一致仅页面入口判，
 *    RPC 入口固定 `—`）。
 *
 * 两条硬门槛（服务端拦截）：
 * - admission 门槛：对应层的 CURRENT.json primary.admissionScope 非 READY_FOR_SYSTEM_TEST 时，
 *   该层只能写 BLOCKED / NOT_RUN，出现 PASS / FAIL → 422（合约层看 tx-fork:contract；
 *   前端层与交叉一致看 tx-fork:frontend）；
 * - 功能用例区不得出现 SCN 编号及相关内容：任何字段含 `SCN-\d{3}` → 400。
 */

export const FUNCTIONAL_RESULTS_START = '<!-- functional-results:start -->';
export const FUNCTIONAL_RESULTS_END = '<!-- functional-results:end -->';

const RELEASE_PATTERN = /^v\d+\.\d+\.\d+$/;
/** 其余功能用例 ID（同 version-cases.ts 的 GENERIC_CASE_ID，如 OT-MI-001）。 */
const GENERIC_CASE_ID = /^(?!SCN-)[A-Z]{2,5}(?:-[A-Z0-9]+)+-\d{3}$/;
const LAYER_STATUSES = ['PASS', 'FAIL', 'BLOCKED', 'GAP', 'NOT_RUN'] as const;
type LayerStatus = (typeof LAYER_STATUSES)[number];
const SCN_REFERENCE = /SCN-\d{3}/i;
const RESULT_TABLE_HEADER =
  '| ID | 部署 · commit | 入口 | 合约层 | 前端层 | 交叉一致 | 实际结果 | 证据 | 执行人 | 日期 |';

const VERSIONS_RELATIVE_DIR = '../TestCase/E2E/versions';
const MANUAL_RUNS_RELATIVE_DIR = '../TestCase/E2E/manual-runs';
const BINDINGS_RELATIVE_PATH = 'config/environment-bindings.json';

/** 统一错误：status 供 HTTP 层映射（400 校验 / 404 缺失 / 409 冲突 / 422 admission 门槛）。 */
export class VersionResultsError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 422 = 400,
  ) {
    super(message);
    this.name = 'VersionResultsError';
  }
}

export interface VersionResultRow {
  /** ID 列原文（允许「ID/数据集」）。 */
  readonly id: string;
  /** 不含数据集的用例 ID。 */
  readonly caseId: string;
  readonly dataset?: string;
  readonly deploy: string;
  readonly entry: string;
  readonly contract: string;
  readonly frontend: string;
  readonly cross: string;
  readonly actualResult: string;
  readonly evidence: string;
  readonly executor: string;
  readonly date: string;
}

export interface VersionResultsView {
  readonly release: string;
  readonly resultsPath: string;
  /** 服务端当前会自动填入「部署 · commit」列的值（绑定不可用或版本不符时为「待确认」）。 */
  readonly deploy: string;
  /** false = 该版本 results.md 缺失或没有标记区（GET 仍返回 200 空表，页面级 fetch 不产生控制台 404）。 */
  readonly available: boolean;
  readonly reason?: string;
  readonly rows: readonly VersionResultRow[];
}

function isFunctionalCaseId(id: string): boolean {
  return VERSION_CASE_ID.test(id) || GENERIC_CASE_ID.test(id);
}

function resultsFilePath(projectRoot: string, release: string): string {
  return resolve(projectRoot, VERSIONS_RELATIVE_DIR, release, 'results.md');
}

function manualRunsDirectory(projectRoot: string): string {
  return resolve(projectRoot, MANUAL_RUNS_RELATIVE_DIR);
}

function todayStamp(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function parseRelease(value: string | null | undefined): string {
  if (!value || !RELEASE_PATTERN.test(value)) {
    throw new VersionResultsError('release 必须形如 vX.Y.Z。');
  }
  return value;
}

/** 单元格清洗：去掉换行与竖线（竖线转义会破坏 10 列 schema 校验，直接替换为全角）。 */
function sanitizeCell(value: string): string {
  return value.replace(/\r?\n/g, ' ').replace(/\|/g, '｜').trim();
}

interface MarkerRegion {
  readonly before: string;
  readonly region: string;
  readonly after: string;
}

function splitMarkerRegion(source: string, displayPath: string): MarkerRegion {
  const startIndex = source.indexOf(FUNCTIONAL_RESULTS_START);
  const endIndex = source.indexOf(FUNCTIONAL_RESULTS_END);
  if (startIndex < 0 || endIndex < 0) {
    throw new VersionResultsError(`${displayPath} 缺少功能用例结果标记区（start/end 注释）。`, 404);
  }
  if (endIndex < startIndex
    || source.indexOf(FUNCTIONAL_RESULTS_START, startIndex + 1) >= 0
    || source.indexOf(FUNCTIONAL_RESULTS_END, endIndex + 1) >= 0) {
    throw new VersionResultsError(`${displayPath} 的功能用例结果标记区不唯一或顺序错误，拒绝写回。`);
  }
  const regionStart = startIndex + FUNCTIONAL_RESULTS_START.length;
  return {
    before: source.slice(0, regionStart),
    region: source.slice(regionStart, endIndex),
    after: source.slice(endIndex),
  };
}

function rowCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function splitIdCell(cell: string): { caseId: string; dataset?: string } {
  const [caseId = '', ...rest] = cell.split('/').map((part) => part.trim());
  const dataset = rest.join('/');
  return { caseId, ...(dataset ? { dataset } : {}) };
}

/** 解析标记区内的一行结果（10 列）；表头/分隔行与空行返回 undefined。 */
function parseResultLine(line: string): VersionResultRow | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return undefined;
  const cells = rowCells(trimmed);
  const first = cells[0] ?? '';
  if (!first || first === 'ID' || /^[-\s:]+$/.test(first)) return undefined;
  if (cells.length !== 10) return undefined;
  const { caseId, ...datasetPart } = splitIdCell(first);
  return {
    id: first,
    caseId,
    ...datasetPart,
    deploy: cells[1] ?? '',
    entry: cells[2] ?? '',
    contract: cells[3] ?? '',
    frontend: cells[4] ?? '',
    cross: cells[5] ?? '',
    actualResult: cells[6] ?? '',
    evidence: cells[7] ?? '',
    executor: cells[8] ?? '',
    date: cells[9] ?? '',
  };
}

async function readResultsSource(projectRoot: string, release: string): Promise<string> {
  const path = resultsFilePath(projectRoot, release);
  try {
    return await readFile(path, 'utf8');
  } catch {
    throw new VersionResultsError(
      `TestCase/E2E/versions/${release}/results.md 不存在，无法读写该版本的功能用例结果。`,
      404,
    );
  }
}

/**
 * 「部署 · commit」列服务端自动填：读 config/environment-bindings.json 的 tx-fork 绑定
 * （运行时唯一 manifest 选择入口；遗留 E2E_DEPLOYMENT_MANIFEST 已废弃）。
 * 绑定不可读、或绑定 release 与写回版本不一致（环境实际版本 ≠ 目标版本，不充当目标版本材料）时填「待确认」。
 */
async function resolveDeployLabel(projectRoot: string, release: string): Promise<string> {
  try {
    const raw = JSON.parse(
      await readFile(resolve(projectRoot, BINDINGS_RELATIVE_PATH), 'utf8'),
    ) as { bindings?: Record<string, { manifestName?: unknown; contractCommit?: unknown; release?: unknown }> };
    const binding = raw.bindings?.['tx-fork'];
    if (binding
      && typeof binding.manifestName === 'string'
      && typeof binding.contractCommit === 'string'
      && /^[0-9a-f]{40}$/i.test(binding.contractCommit)
      && binding.release === release) {
      return `${binding.manifestName} · ${binding.contractCommit.slice(0, 7)}`;
    }
  } catch {
    // 绑定表缺失/损坏不阻断读写，仅回退「待确认」。
  }
  return '待确认';
}

export async function readVersionResults(
  projectRoot: string,
  releaseInput: string | null | undefined,
): Promise<VersionResultsView> {
  const release = parseRelease(releaseInput);
  const base = {
    release,
    resultsPath: `TestCase/E2E/versions/${release}/results.md`,
    deploy: await resolveDeployLabel(projectRoot, release),
  };
  let region: string;
  try {
    region = splitMarkerRegion(await readResultsSource(projectRoot, release), base.resultsPath).region;
  } catch (error) {
    // GET 是页面轮询入口：results.md 缺失/无标记区返回 200 空表 + 原因，写回（append）仍按硬错误拒绝。
    if (error instanceof VersionResultsError) {
      return { ...base, available: false, reason: error.message, rows: [] };
    }
    throw error;
  }
  const rows = region
    .split(/\r?\n/)
    .map(parseResultLine)
    .filter((row): row is VersionResultRow => Boolean(row));
  return { ...base, available: true, rows };
}

// —— 追加写回 ——

const appendRowSchema = z.object({
  id: z.string().min(1),
  dataset: z.string().max(60).optional(),
  entry: z.string().min(1).max(40),
  layers: z.object({
    contract: z.string(),
    frontend: z.string(),
    cross: z.string(),
  }),
  actualResult: z.string().min(1).max(2000),
  evidence: z.union([z.string(), z.array(z.string().max(500)).max(20)]),
  executor: z.string().min(1).max(60),
});

const appendRequestSchema = z.object({
  release: z.string().regex(RELEASE_PATTERN, 'release 必须形如 vX.Y.Z'),
  rows: z.array(appendRowSchema).min(1).max(50),
});

export type AppendVersionResultsInput = z.infer<typeof appendRequestSchema>;

interface AdmissionScope {
  readonly contract: string;
  readonly frontend: string;
}

async function loadAdmissionScope(projectRoot: string): Promise<AdmissionScope> {
  try {
    const raw = JSON.parse(
      await readFile(resolve(projectRoot, '../Docs/contract-releases/CURRENT.json'), 'utf8'),
    ) as { primary?: { admissionScope?: Record<string, unknown> } };
    const scope = raw.primary?.admissionScope ?? {};
    const read = (key: string): string => (typeof scope[key] === 'string' ? (scope[key] as string) : '未登记');
    return { contract: read('tx-fork:contract'), frontend: read('tx-fork:frontend') };
  } catch {
    return { contract: '未登记', frontend: '未登记' };
  }
}

function isReady(status: string): boolean {
  return status === 'READY_FOR_SYSTEM_TEST';
}

function assertLayerStatus(value: string, label: string, rowId: string): LayerStatus {
  if (!(LAYER_STATUSES as readonly string[]).includes(value)) {
    throw new VersionResultsError(
      `${rowId} 的${label}状态「${value}」不在词汇表内（${LAYER_STATUSES.join(' / ')}）。`,
    );
  }
  return value as LayerStatus;
}

function assertNoScnReference(rowId: string, fields: readonly string[]): void {
  for (const field of fields) {
    if (SCN_REFERENCE.test(field)) {
      throw new VersionResultsError(
        `${rowId} 的写回内容包含 SCN 编号（功能用例结果区不得出现 SCN 编号及相关内容）。`,
      );
    }
  }
}

interface PreparedRow {
  readonly line: string;
  readonly parsed: VersionResultRow;
}

function prepareRow(
  input: z.infer<typeof appendRowSchema>,
  deploy: string,
  date: string,
  admission: AdmissionScope,
): PreparedRow {
  const caseId = sanitizeCell(input.id);
  if (!isFunctionalCaseId(caseId)) {
    throw new VersionResultsError(
      `「${caseId}」不是合法的功能用例 ID（CT/XT/FT-…-NNN 或其他非 SCN 功能用例 ID）。`,
    );
  }
  const dataset = input.dataset ? sanitizeCell(input.dataset) : '';
  const entry = sanitizeCell(input.entry);
  const contract = assertLayerStatus(input.layers.contract, '合约层', caseId);
  const frontend = assertLayerStatus(input.layers.frontend, '前端层', caseId);
  const crossRaw = input.layers.cross.trim();
  const isPageEntry = entry.includes('页面');
  let cross: string;
  if (!isPageEntry) {
    if (crossRaw !== '—' && crossRaw !== '') {
      throw new VersionResultsError(`${caseId} 为非页面入口（${entry}），交叉一致只能写「—」。`);
    }
    cross = '—';
  } else {
    cross = crossRaw === '—' ? '—' : assertLayerStatus(crossRaw, '交叉一致', caseId);
  }
  const actualResult = sanitizeCell(input.actualResult);
  const evidenceParts = (Array.isArray(input.evidence) ? input.evidence : [input.evidence])
    .map((item) => sanitizeCell(item))
    .filter((item) => item.length > 0);
  if (evidenceParts.length === 0) {
    throw new VersionResultsError(`${caseId} 缺少证据（至少一条链接或工作区相对路径）。`);
  }
  const evidence = evidenceParts.join('；');
  const executor = sanitizeCell(input.executor);
  assertNoScnReference(caseId, [caseId, dataset, entry, actualResult, evidence, executor]);

  // admission 硬门槛：合约层看 tx-fork:contract；前端层与交叉一致看 tx-fork:frontend。
  if ((contract === 'PASS' || contract === 'FAIL') && !isReady(admission.contract)) {
    throw new VersionResultsError(
      `${caseId} 合约层写 ${contract} 被拒：admissionScope["tx-fork:contract"]=${admission.contract}`
      + '（非 READY_FOR_SYSTEM_TEST 时只能写 BLOCKED / NOT_RUN）。',
      422,
    );
  }
  const frontendJudged = [frontend, cross].filter(
    (status) => status === 'PASS' || status === 'FAIL',
  );
  if (frontendJudged.length > 0 && !isReady(admission.frontend)) {
    throw new VersionResultsError(
      `${caseId} 前端层/交叉一致写 ${frontendJudged.join('、')} 被拒：`
      + `admissionScope["tx-fork:frontend"]=${admission.frontend}`
      + '（非 READY_FOR_SYSTEM_TEST 时只能写 BLOCKED / NOT_RUN）。',
      422,
    );
  }

  const idCell = dataset ? `${caseId}/${dataset}` : caseId;
  const line = `| ${idCell} | ${deploy} | ${entry} | ${contract} | ${frontend} | ${cross} | ${actualResult} | ${evidence} | ${executor} | ${date} |`;
  // 写回前最后一道 schema 自检：渲染出的行必须能按 10 列结果行解析回来。
  const parsed = parseResultLine(line);
  if (!parsed || parsed.caseId !== caseId || parsed.date !== date) {
    throw new VersionResultsError(`${caseId} 渲染出的结果行不符合 10 列 schema，已拒绝写回。`);
  }
  return { line, parsed };
}

async function atomicReplace(path: string, content: string): Promise<void> {
  const temporary = `${path}.${process.pid}-${Date.now()}.tmp`;
  await writeFile(temporary, content, 'utf8');
  await rename(temporary, path);
}

export interface AppendVersionResultsReceipt {
  readonly release: string;
  readonly resultsPath: string;
  readonly deploy: string;
  readonly date: string;
  readonly appended: number;
  readonly rows: readonly VersionResultRow[];
}

export async function appendVersionResults(
  projectRoot: string,
  body: unknown,
): Promise<AppendVersionResultsReceipt> {
  const parsedInput = appendRequestSchema.safeParse(body);
  if (!parsedInput.success) {
    throw new VersionResultsError(
      `写回请求不合法：${parsedInput.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('；')}`,
    );
  }
  const { release, rows } = parsedInput.data;
  const displayPath = `TestCase/E2E/versions/${release}/results.md`;
  const [source, deploy, admission] = await Promise.all([
    readResultsSource(projectRoot, release),
    resolveDeployLabel(projectRoot, release),
    loadAdmissionScope(projectRoot),
  ]);
  const date = todayStamp();
  const prepared = rows.map((row) => prepareRow(row, deploy, date, admission));

  const { before, region, after } = splitMarkerRegion(source, displayPath);
  if (!region.includes('| ID |')) {
    throw new VersionResultsError(`${displayPath} 标记区缺少结果表表头，拒绝写回：${RESULT_TABLE_HEADER}`);
  }
  const regionBody = region.endsWith('\n') ? region : `${region}\n`;
  const next = `${before}${regionBody}${prepared.map((row) => row.line).join('\n')}\n${after}`;
  await atomicReplace(resultsFilePath(projectRoot, release), next);
  return {
    release,
    resultsPath: displayPath,
    deploy,
    date,
    appended: prepared.length,
    rows: prepared.map((row) => row.parsed),
  };
}

// —— 手工批次归档 ——

const BATCH_NAME_PATTERN = /^[\p{Script=Han}A-Za-z0-9_-]{2,40}$/u;
const BATCH_ID_PATTERN = /^\d{4}-\d{2}-\d{2}-[\p{Script=Han}A-Za-z0-9_-]{2,40}$/u;

const createBatchSchema = z.object({
  release: z.string().regex(RELEASE_PATTERN, 'release 必须形如 vX.Y.Z'),
  name: z.string().min(2).max(40),
  caseIds: z.array(z.string().min(1)).min(1).max(200),
  executor: z.string().min(1).max(60),
});

export interface ManualBatchReceipt {
  readonly id: string;
  readonly directory: string;
  readonly files: readonly string[];
  readonly caseCount: number;
}

function batchReadme(id: string, release: string, executor: string, caseCount: number): string {
  const date = todayStamp();
  return `---
project: fx100
layer: e2e
type: manual-run-session
title: ${id} 手工执行批次
date: ${date}
release: ${release}
status: round-1-in-progress
---

# ${id} 手工执行批次

> 由测试看板「测试用例页 · 手工测试工作台」创建。执行范围为版本功能用例（CT/XT/FT）；
> 结果唯一台账在 [../../versions/${release}/results.md](../../versions/${release}/results.md) 标记区，本目录只存过程档案与证据。

## 1. 范围

- 版本：${release}（基线以 Docs/contract-releases/CURRENT.json 为准）
- 用例（${caseCount} 条）：见 [RUN-SHEET.md](RUN-SHEET.md)
- 执行人：${executor}

## 2. 记录规则

- 每条结果经看板「记录结果」写回 results.md 标记区（一行一次结果，重复执行追加行不覆盖）；
- 对应层 admissionScope 非 READY_FOR_SYSTEM_TEST 时只记 BLOCKED / NOT_RUN，不得写 PASS / FAIL；
- 证据（截图 / 日志 / tx 记录）存本目录，results.md 证据列写 \`TestCase/E2E/manual-runs/${id}/…\` 相对路径。

## 3. 台账文件

- [RUN-SHEET.md](RUN-SHEET.md) — 选案台账（逐条状态回填）
- OPERATION-LOG.md — 逐条操作记录（执行时按需创建）
- ROUND-N-SUMMARY.md — 轮次小结（收口时由看板按 ID 反链 results.md 归档）
`;
}

function batchRunSheet(id: string, release: string, caseIds: readonly string[]): string {
  const rows = caseIds.map((caseId) => `| ${caseId} | ⬜ | |`).join('\n');
  return `# RUN-SHEET · ${id}

> 状态标记：⬜ 未执行 · 🟡 执行中/有证据待回填 · ✅ PASS · ❌ FAIL · ⛔ BLOCKED。
> 本表只是选案台账；正式结果以 [../../versions/${release}/results.md](../../versions/${release}/results.md) 标记区为准。

| ID | 状态 | 证据 |
|---|---|---|
${rows}
`;
}

export async function createManualBatch(
  projectRoot: string,
  body: unknown,
): Promise<ManualBatchReceipt> {
  const parsed = createBatchSchema.safeParse(body);
  if (!parsed.success) {
    throw new VersionResultsError(
      `批次创建请求不合法：${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('；')}`,
    );
  }
  const { release, name, caseIds, executor } = parsed.data;
  if (!BATCH_NAME_PATTERN.test(name)) {
    throw new VersionResultsError('批次名只允许中英文、数字、-、_（2~40 字符），不含路径分隔符。');
  }
  const invalid = caseIds.filter((caseId) => !isFunctionalCaseId(caseId.trim()));
  if (invalid.length > 0) {
    throw new VersionResultsError(`批次包含非法功能用例 ID：${invalid.slice(0, 5).join('、')}。`);
  }
  // 校验目标版本 results.md 存在且标记区可用（批次创建即验证写回链路可达）。
  splitMarkerRegion(
    await readResultsSource(projectRoot, release),
    `TestCase/E2E/versions/${release}/results.md`,
  );
  const id = `${todayStamp()}-${name}`;
  const directory = join(manualRunsDirectory(projectRoot), id);
  try {
    await stat(directory);
    throw new VersionResultsError(`批次目录已存在：TestCase/E2E/manual-runs/${id}/。`, 409);
  } catch (error) {
    if (error instanceof VersionResultsError) throw error;
    // 不存在才继续创建。
  }
  await mkdir(directory, { recursive: true });
  const uniqueIds = Array.from(new Set(caseIds.map((caseId) => caseId.trim())));
  await Promise.all([
    writeFile(join(directory, 'README.md'), batchReadme(id, release, sanitizeCell(executor), uniqueIds.length), 'utf8'),
    writeFile(join(directory, 'RUN-SHEET.md'), batchRunSheet(id, release, uniqueIds), 'utf8'),
  ]);
  return {
    id,
    directory: `TestCase/E2E/manual-runs/${id}/`,
    files: ['README.md', 'RUN-SHEET.md'],
    caseCount: uniqueIds.length,
  };
}

const summarySchema = z.object({
  release: z.string().regex(RELEASE_PATTERN, 'release 必须形如 vX.Y.Z'),
  caseIds: z.array(z.string().min(1)).max(200).optional(),
  executor: z.string().max(60).optional(),
});

export interface ManualBatchSummaryReceipt {
  readonly id: string;
  readonly file: string;
  readonly round: number;
  readonly caseCount: number;
  readonly matchedRows: number;
}

async function parseRunSheetCaseIds(directory: string): Promise<string[]> {
  try {
    const source = await readFile(join(directory, 'RUN-SHEET.md'), 'utf8');
    const ids: string[] = [];
    for (const line of source.split(/\r?\n/)) {
      const first = rowCells(line)[0] ?? '';
      if (isFunctionalCaseId(first)) ids.push(first);
    }
    return ids;
  } catch {
    return [];
  }
}

function statusCounts(rows: readonly VersionResultRow[], pick: (row: VersionResultRow) => string): string {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const status = pick(row);
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([status, count]) => `${status} ${count}`).join(' / ') || '无记录';
}

export async function writeManualBatchSummary(
  projectRoot: string,
  idInput: string,
  body: unknown,
): Promise<ManualBatchSummaryReceipt> {
  const id = idInput.trim();
  if (!BATCH_ID_PATTERN.test(id)) {
    throw new VersionResultsError('批次 id 必须形如 YYYY-MM-DD-批次名（中英文、数字、-、_）。');
  }
  const parsed = summarySchema.safeParse(body);
  if (!parsed.success) {
    throw new VersionResultsError(
      `小结请求不合法：${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('；')}`,
    );
  }
  const { release, caseIds, executor } = parsed.data;
  const directory = join(manualRunsDirectory(projectRoot), id);
  try {
    if (!(await stat(directory)).isDirectory()) throw new Error('不是目录');
  } catch {
    throw new VersionResultsError(`批次目录不存在：TestCase/E2E/manual-runs/${id}/。`, 404);
  }
  const targets = (caseIds && caseIds.length > 0
    ? caseIds.map((caseId) => caseId.trim())
    : await parseRunSheetCaseIds(directory)
  ).filter(isFunctionalCaseId);
  if (targets.length === 0) {
    throw new VersionResultsError('小结没有可反链的用例 ID（body.caseIds 与 RUN-SHEET.md 均为空）。');
  }
  const view = await readVersionResults(projectRoot, release);
  const uniqueTargets = Array.from(new Set(targets));
  const matched = view.rows.filter((row) => uniqueTargets.includes(row.caseId));

  // ROUND-N：找到第一个未占用的轮次号（沿既有 manual-runs 多轮小结惯例）。
  const existing = new Set(await readdir(directory));
  let round = 1;
  while (existing.has(`ROUND-${round}-SUMMARY.md`)) round += 1;

  const tableRows = uniqueTargets.flatMap((caseId) => {
    const rows = matched.filter((row) => row.caseId === caseId);
    if (rows.length === 0) {
      return [`| ${caseId} | — | — | — | — | — | 未在 results.md 标记区找到记录 | — | — |`];
    }
    return rows.map((row) =>
      `| ${row.id} | ${row.deploy} | ${row.entry} | ${row.contract} | ${row.frontend} | ${row.cross} | ${row.actualResult} | ${row.evidence} | ${row.date} |`,
    );
  });
  const content = `# ROUND-${round} 小结 · ${id}

> 生成：${new Date().toISOString()}${executor ? ` · 执行人：${sanitizeCell(executor)}` : ''}
> 结果反链：[../../versions/${release}/results.md](../../versions/${release}/results.md) 标记区（按 ID 汇总；同 ID 多行全部列出，追加不覆盖）。

## 结果汇总

| ID | 部署 · commit | 入口 | 合约层 | 前端层 | 交叉一致 | 实际结果 | 证据 | 日期 |
|---|---|---|---|---|---|---|---|---|
${tableRows.join('\n')}

## 统计

- 覆盖用例 ${uniqueTargets.length} 条；results.md 匹配记录 ${matched.length} 行（未记录 ${uniqueTargets.length - new Set(matched.map((row) => row.caseId)).size} 条）
- 合约层：${statusCounts(matched, (row) => row.contract)}
- 前端层：${statusCounts(matched, (row) => row.frontend)}
- 交叉一致：${statusCounts(matched, (row) => row.cross)}
`;
  const file = join(directory, `ROUND-${round}-SUMMARY.md`);
  await atomicReplace(file, content);
  return {
    id,
    file: `TestCase/E2E/manual-runs/${id}/ROUND-${round}-SUMMARY.md`,
    round,
    caseCount: uniqueTargets.length,
    matchedRows: matched.length,
  };
}

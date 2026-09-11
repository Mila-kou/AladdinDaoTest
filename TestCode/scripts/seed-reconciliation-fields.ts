import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

import { contractLedgerFieldId } from '../src/reconciliation/ledger-field-id.js';
import {
  loadReconciliationLedger,
  saveReconciliationLedger,
  type ReconciliationCoverageLink,
  type ReconciliationFieldRow,
  type ReconciliationFieldStatus,
  type ReconciliationLedger,
  type ReconciliationSide,
} from '../src/reporting/reconciliation-fields.js';

/**
 * 核对字段台账种子脚本（直接 `npx tsx scripts/seed-reconciliation-fields.ts [--dry-run]` 运行，不注册 npm script）。
 *
 * 从四个权威来源提取字段清单，生成 config/reconciliation-fields.json：
 *  ① 合约侧：TestCase/E2E/ContractCodeSummary/v0.3.2/FX100-核心字段计算公式.md 第 1–20 章的小节字段
 *            + Docs/contract-releases/v0.3.2/04-参数目录.md §6 参数变化清单；
 *  ② 前端侧：Docs/Gordon-Notion需求文档归档/汇总/FX100-页面字段计算公式.md §九 测试断言表；
 *  ③ 配对侧：.claude/skills/fx100-formula-parity/references/conventions.md §1/§2/§3 字段配对约定表；
 *  ④ 已覆盖映射：TestCode/artifacts/latest/results.json 各场景 executionEvidence.reconciliations，
 *     按字段名 / label / 章节锚点模糊匹配标 implemented（已生效）并回链 场景+行 id；
 *  ⑤ 手工核对覆盖：TestCase/E2E/manual-runs/**\/verify-*.json（看板「回填」落盘）与
 *     TestCode/artifacts/manual-verify/**\/*.json（CLI verify:tx 落盘）里的 reconciliationReport.checks，
 *     先按核对行自带 ledgerFieldId（packs 经 src/reconciliation/ledger-field-id.ts 派生）精确匹配，
 *     再退回 ④ 的模糊规则；verification=NOT_VERIFIED 的行不算覆盖（没算出来的不算「已生效」）。
 *     同一 caseId 的同一核对行只保留最新产物一处回链。
 *
 * 提取原则：靠标题 / 表格解析，宁可粗一点也不编造公式；摘要解析不到的行 note=待人工补。
 * 重跑合并规则：candidate / accepted 属人工裁决，重跑 seed 保留；implemented 每次按当前
 * results.json + 手工核对产物覆盖重新判定（覆盖消失则回落到人工状态或 uncovered）。
 * `--dry-run`：只打印统计，不写台账；`--verbose`：逐行打印靠手工核对产物回链的台账行。
 */

const projectRoot = process.cwd();
const workspaceRoot = resolve(projectRoot, '..');

const CONTRACT_FORMULA_DOC = 'TestCase/E2E/ContractCodeSummary/v0.3.2/FX100-核心字段计算公式.md';
const PARAMETER_CATALOG_DOC = 'Docs/contract-releases/v0.3.2/04-参数目录.md';
const PAGE_FORMULA_DOC = 'Docs/Gordon-Notion需求文档归档/汇总/FX100-页面字段计算公式.md';
const CONVENTIONS_DOC = '.claude/skills/fx100-formula-parity/references/conventions.md';
const RESULTS_PATH = 'artifacts/latest/results.json';
/** 手工核对产物扫描根（相对工作区根 / 工程根）；文件名规则见 readManualVerifyRecords。 */
const MANUAL_RUNS_ROOT = 'TestCase/E2E/manual-runs';
const MANUAL_VERIFY_ARTIFACTS_ROOT = 'artifacts/manual-verify';
const MANUAL_SOURCES = [
  `${MANUAL_RUNS_ROOT}/**/verify-*.json`,
  `TestCode/${MANUAL_VERIFY_ARTIFACTS_ROOT}/**/*.json`,
];

const COVERED_BY_LIMIT = 40;
const DRY_RUN = process.argv.includes('--dry-run');
/** `--verbose`：逐行打印由手工核对产物回链的台账行（核对哪些字段是靠 verify-tx 证据升的 implemented）。 */
const VERBOSE = process.argv.includes('--verbose');

interface SeedRow {
  readonly id: string;
  readonly side: ReconciliationSide;
  readonly field: string;
  readonly formulaDigest: string;
  readonly sourceAnchor: string;
  /** 归一化后的匹配关键词（label / 章节锚点包含任一关键词即视为覆盖）。 */
  readonly matchKeys: string[];
  /** 是否允许在核对行 formula 文本里匹配（仅参数键：键名足够特异）。 */
  readonly matchInFormula: boolean;
  readonly note: string;
}

interface ReconRecord {
  readonly scenarioId: string;
  readonly rowId: string;
  readonly dataSource: string;
  readonly haystack: string;
  readonly formulaNorm: string;
  /** 核对行自带的台账行 id（CheckRecord.ledgerFieldId）；有则精确匹配，优先于模糊规则。 */
  readonly ledgerFieldId?: string;
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('`', '')
    .replace(/\*\*/g, '')
    // 去掉空白与常见标点，只留 CJK / 字母 / 数字，便于跨文档模糊包含匹配。
    .replace(/[\s（）()【】\[\]「」《》<>·、，,。．.；;：:/\\|—\-–_§~！!？?＋+=×÷*%…&$#@^'"‘’“”]+/g, '');
}

function compress(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncateDigest(value: string, limit = 240): string {
  const compact = compress(value);
  return compact.length > limit ? `${compact.slice(0, limit - 1)}…` : compact;
}

function stripMarkdown(value: string): string {
  return value.replaceAll('`', '').replace(/\*\*/g, '').trim();
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isTableSeparator(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell.replaceAll(' ', '')));
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.slice(0, 40);
}

async function readWorkspaceDoc(relativePath: string): Promise<string[]> {
  const source = await readFile(join(workspaceRoot, relativePath), 'utf8');
  return source.split('\n');
}

/** 章节正文 → 口径摘要：优先第一个代码块，其次第一张表格前几行，最后第一段文字。 */
function digestFromBody(body: string[]): string {
  let inFence = false;
  const fenceLines: string[] = [];
  for (const line of body) {
    if (/^\s*```/.test(line)) {
      if (inFence) return truncateDigest(fenceLines.filter(Boolean).join(' ; '));
      inFence = true;
      continue;
    }
    if (inFence) fenceLines.push(compress(line));
  }
  const tableLines = body.filter((line) => line.trim().startsWith('|'));
  if (tableLines.length >= 2) {
    const rows = tableLines
      .map(splitTableRow)
      .filter((cells) => !isTableSeparator(cells))
      .slice(0, 4)
      .map((cells) => cells.map(stripMarkdown).join(' / '));
    if (rows.length > 0) return truncateDigest(rows.join(' ；ROW： '));
  }
  const paragraph = body.find((line) => {
    const text = line.trim();
    return text.length > 0 && !text.startsWith('#') && !text.startsWith('>') && !text.startsWith('|');
  });
  return paragraph ? truncateDigest(paragraph) : '';
}

// —— 来源 ①A：合约核心字段计算公式（章节字段） ————————————————————————

/** 高置信同义词：归一化章节名 → 核对行常用 label 关键词（保守列表，避免误标 implemented）。 */
const CONTRACT_TITLE_ALIASES: Record<string, string[]> = {
  ['中间价']: ['minmidmax', 'midprice'],
  ['动态点差']: ['dynamicspread'],
  ['每秒费率']: ['fundingfactorsecond'],
  ['市场openinterestusd']: ['oiusd'],
  ['盈利上限']: ['pnlcap'],
  ['整仓pnl']: ['uncappedbasepnl'],
  ['基础仓位费']: ['positionfee', '仓位费'],
};

/** 纯 ASCII 关键词至少 4 个字符、含 CJK 的至少 3 个字符，避免过短关键词误命中。 */
function keyLongEnough(key: string): boolean {
  return /^[\x20-\x7e]*$/.test(key) ? key.length >= 4 : key.length >= 3;
}

interface ContractSection {
  readonly number: string;
  readonly title: string;
  readonly level: 2 | 3;
  readonly bodyStart: number;
  bodyEnd: number;
}

function parseContractFormulaDoc(lines: string[]): SeedRow[] {
  const sections: ContractSection[] = [];
  lines.forEach((line, index) => {
    const chapter = /^## (\d+)\.\s*(.+)$/.exec(line);
    const sub = /^### (\d+\.\d+)\s+(.+)$/.exec(line);
    if (chapter?.[1] && chapter[2]) {
      sections.push({ number: chapter[1], title: stripMarkdown(chapter[2]), level: 2, bodyStart: index + 1, bodyEnd: lines.length });
    } else if (sub?.[1] && sub[2]) {
      sections.push({ number: sub[1], title: stripMarkdown(sub[2]), level: 3, bodyStart: index + 1, bodyEnd: lines.length });
    }
  });
  sections.forEach((section, index) => {
    const next = sections[index + 1];
    section.bodyEnd = next ? next.bodyStart - 1 : lines.length;
  });

  const rows: SeedRow[] = [];
  for (const section of sections) {
    // 行 id 与章节范围（1～20 章；第 0 章是使用规则、21 章起是速查/差异/流程附录）统一走 ledger-field-id.ts，
    // 与 packs / verify-tx 给 CheckRecord.ledgerFieldId 用的是同一条规则。
    const id = contractLedgerFieldId(section.number);
    if (!id) continue;
    if (section.level === 2) {
      const hasChildren = sections.some(
        (item) => item.level === 3 && item.number.startsWith(`${section.number}.`),
      );
      if (hasChildren) continue; // 有小节的章由小节出行，章标题不重复出行。
    }
    const digest = digestFromBody(lines.slice(section.bodyStart, section.bodyEnd));
    const titleKey = normalizeKey(section.title);
    const matchKeys = [titleKey, ...(CONTRACT_TITLE_ALIASES[titleKey] ?? [])]
      .filter(keyLongEnough);
    rows.push({
      id,
      side: '合约',
      field: `${section.number} ${section.title}`,
      formulaDigest: digest,
      sourceAnchor: `${CONTRACT_FORMULA_DOC} §${section.number} ${section.title}`,
      matchKeys,
      matchInFormula: false,
      note: digest ? '' : '公式摘要解析不到，待人工补',
    });
  }
  return rows;
}

// —— 来源 ①B：04-参数目录 §6 参数变化清单 ————————————————————————

function extractSectionTableRows(lines: string[], headingPattern: RegExp): string[][] {
  const start = lines.findIndex((line) => headingPattern.test(line));
  if (start < 0) return [];
  const rows: string[][] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (/^## /.test(line)) break;
    if (!line.trim().startsWith('|')) continue;
    const cells = splitTableRow(line);
    if (isTableSeparator(cells)) continue;
    rows.push(cells);
  }
  return rows;
}

function parseParameterCatalog(lines: string[]): SeedRow[] {
  const tableRows = extractSectionTableRows(lines, /^## 6\.\s/);
  const rows: SeedRow[] = [];
  for (const cells of tableRows) {
    const [order, keyCell, changeType, scope, anchor] = cells;
    if (!order || !keyCell || !/^\d+$/.test(order)) continue; // 跳过表头（# 列非数字）。
    const field = stripMarkdown(keyCell);
    const backticked = [...keyCell.matchAll(/`([^`]+)`/g)]
      .map((match) => match[1] ?? '')
      .filter(Boolean);
    const matchKeys = new Set<string>();
    for (const token of backticked) {
      const whole = normalizeKey(token);
      if (whole.length >= 4) matchKeys.add(whole);
      for (const part of token.split(/[/、\s]+/)) {
        const normalized = normalizeKey(part);
        if (normalized.length >= 6) matchKeys.add(normalized);
      }
    }
    if (matchKeys.size === 0) {
      const fallback = normalizeKey(field);
      if (fallback.length >= 4) matchKeys.add(fallback);
    }
    const digestParts = [
      changeType ? `变化类型：${stripMarkdown(changeType)}` : '',
      scope ? `作用域：${stripMarkdown(scope)}` : '',
      anchor ? `锚点：${stripMarkdown(anchor)}` : '',
    ].filter(Boolean);
    rows.push({
      id: `p-${order.padStart(2, '0')}-${slugify(backticked[0] ?? field) || 'row'}`,
      side: '合约',
      field,
      formulaDigest: truncateDigest(digestParts.join('；')),
      sourceAnchor: `${PARAMETER_CATALOG_DOC} §6 v0.3.2 参数变化清单 · 第 ${order} 行`,
      matchKeys: [...matchKeys],
      matchInFormula: true,
      note: digestParts.length > 0 ? '' : '公式摘要解析不到，待人工补',
    });
  }
  return rows;
}

// —— 来源 ②：页面字段计算公式 §九 测试断言表 ————————————————————————

function parsePageAssertionTable(lines: string[]): SeedRow[] {
  const tableRows = extractSectionTableRows(lines, /^## 九、/);
  const rows: SeedRow[] = [];
  let order = 0;
  for (const cells of tableRows) {
    const [assertion, expectation, source] = cells;
    if (!assertion || assertion === '断言项') continue;
    order += 1;
    const field = stripMarkdown(assertion);
    const matchKeys = new Set<string>();
    const fieldKey = normalizeKey(field);
    if (keyLongEnough(fieldKey)) matchKeys.add(fieldKey);
    for (const match of assertion.matchAll(/`([^`]+)`/g)) {
      const token = normalizeKey(match[1] ?? '');
      if (token.length >= 6) matchKeys.add(token);
    }
    const digest = expectation ? `期望：${stripMarkdown(expectation)}` : '';
    rows.push({
      id: `f-${String(order).padStart(2, '0')}-${slugify(field) || 'assert'}`,
      side: '前端',
      field,
      formulaDigest: truncateDigest(digest),
      sourceAnchor: `${PAGE_FORMULA_DOC} §九 测试断言参考 · 第 ${order} 行`
        + (source ? `（来源：${stripMarkdown(source)}）` : ''),
      matchKeys: [...matchKeys],
      matchInFormula: false,
      note: digest ? '' : '公式摘要解析不到，待人工补',
    });
  }
  return rows;
}

// —— 来源 ③：formula-parity conventions 字段配对约定 ————————————————————————

function parseConventions(lines: string[]): SeedRow[] {
  const sections: Array<{ heading: RegExp; label: string; key: string; digestOf: (cells: string[]) => string }> = [
    {
      heading: /^## 1\.\s/,
      label: '§1 精度体系',
      key: 'precision',
      digestOf: (cells) => `合约 ${stripMarkdown(cells[1] ?? '')} ↔ 前端 ${stripMarkdown(cells[2] ?? '')}`,
    },
    {
      heading: /^## 2\.\s/,
      label: '§2 取整原语对照',
      key: 'rounding',
      digestOf: (cells) => `语义：${stripMarkdown(cells[1] ?? '')}；SDK：${stripMarkdown(cells[2] ?? '')}；等价性：${stripMarkdown(cells[3] ?? '')}`,
    },
    {
      heading: /^## 3\.\s/,
      label: '§3 选价规则',
      key: 'pricing',
      digestOf: (cells) => `合约用价 ${stripMarkdown(cells[1] ?? '')} ↔ 前端应同侧 ${stripMarkdown(cells[2] ?? '')}`,
    },
  ];
  const rows: SeedRow[] = [];
  for (const section of sections) {
    const tableRows = extractSectionTableRows(lines, section.heading);
    let order = 0;
    for (const cells of tableRows) {
      const first = cells[0] ?? '';
      // §2 有一行首列为 —（四舍五入非合约原语），以语义列充当字段名。
      const field = stripMarkdown(first) === '—' ? stripMarkdown(cells[1] ?? '') : stripMarkdown(first);
      if (!field || field === '量' || field === '合约' || field === '场景') continue;
      order += 1;
      const digest = section.digestOf(cells);
      const matchKeys = new Set<string>();
      const fieldKey = normalizeKey(field);
      if (fieldKey.length >= 4 && keyLongEnough(fieldKey)) matchKeys.add(fieldKey);
      for (const match of first.matchAll(/`([^`]+)`/g)) {
        const token = normalizeKey(match[1] ?? '');
        if (token.length >= 6) matchKeys.add(token);
      }
      rows.push({
        id: `pair-${section.key}-${String(order).padStart(2, '0')}`,
        side: '配对',
        field: `${field}（${section.label}）`,
        formulaDigest: truncateDigest(digest),
        sourceAnchor: `${CONVENTIONS_DOC} ${section.label} · 第 ${order} 行`,
        matchKeys: [...matchKeys],
        matchInFormula: false,
        note: digest ? '' : '公式摘要解析不到，待人工补',
      });
    }
  }
  return rows;
}

// —— 来源 ④：results.json 现有核对行 ————————————————————————

interface ResultsSnapshot {
  readonly runId: string;
  readonly generatedAt: string;
  readonly records: ReconRecord[];
}

async function readReconciliationRecords(): Promise<ResultsSnapshot> {
  const raw = JSON.parse(await readFile(join(projectRoot, RESULTS_PATH), 'utf8')) as {
    run?: { id?: unknown };
    source?: { generatedAt?: unknown };
    results?: Array<{
      id?: unknown;
      executionEvidence?: {
        reconciliations?: Array<Record<string, unknown>>;
      } | null;
    }>;
  };
  const records: ReconRecord[] = [];
  for (const result of raw.results ?? []) {
    const scenarioId = typeof result.id === 'string' ? result.id : '';
    const reconciliations = result.executionEvidence?.reconciliations;
    if (!scenarioId || !Array.isArray(reconciliations)) continue;
    for (const item of reconciliations) {
      const rowId = typeof item.id === 'string' ? item.id : '';
      if (!rowId) continue;
      const basis = (typeof item.basis === 'object' && item.basis !== null
        ? item.basis
        : {}) as Record<string, unknown>;
      const haystack = normalizeKey([
        typeof item.label === 'string' ? item.label : '',
        typeof item.group === 'string' ? item.group : '',
        typeof basis.section === 'string' ? basis.section : '',
        typeof basis.title === 'string' ? basis.title : '',
      ].join('|'));
      records.push({
        scenarioId,
        rowId,
        dataSource: typeof item.dataSource === 'string' ? item.dataSource : '',
        haystack,
        formulaNorm: normalizeKey(typeof item.formula === 'string' ? item.formula : ''),
        ...(typeof item.ledgerFieldId === 'string' && item.ledgerFieldId ? { ledgerFieldId: item.ledgerFieldId } : {}),
      });
    }
  }
  return {
    runId: typeof raw.run?.id === 'string' ? raw.run.id : '',
    generatedAt: typeof raw.source?.generatedAt === 'string' ? raw.source.generatedAt : '',
    records,
  };
}

// —— 来源 ⑤：手工核对产物（看板回填 verify-*.json / CLI verify:tx 落盘） ————————————————————————

interface ManualVerifySnapshot {
  readonly files: number;
  readonly skipped: number;
  readonly records: ReconRecord[];
}

async function listJsonFiles(root: string, accept: (fileName: string) => boolean): Promise<string[]> {
  const files: string[] = [];
  async function walk(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && accept(entry.name)) files.push(path);
    }
  }
  await walk(root);
  return files.sort();
}

/**
 * 读手工核对产物里的 CheckRecord（reconciliationReport.checks；与 verify-tx 落盘结构一致）。
 * - 只认带 reconciliationReport.checks 的 JSON，其它 JSON（对比稿、退出码探针的空产物）跳过；
 * - verification=NOT_VERIFIED 的行不算覆盖；
 * - 同一 caseId 的同一核对行（actionId + id）只保留 generatedAt 最新的产物，rowId 带产物相对路径便于回溯。
 */
async function readManualVerifyRecords(): Promise<ManualVerifySnapshot> {
  const candidates = [
    ...await listJsonFiles(join(workspaceRoot, MANUAL_RUNS_ROOT), (name) => /^verify-.*\.json$/.test(name)),
    ...await listJsonFiles(join(projectRoot, MANUAL_VERIFY_ARTIFACTS_ROOT), (name) => name.endsWith('.json')),
  ];
  const latestByKey = new Map<string, { generatedAt: string; record: ReconRecord }>();
  let files = 0;
  let skipped = 0;
  for (const file of candidates) {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(file, 'utf8')) as unknown;
    } catch {
      skipped += 1;
      continue;
    }
    const artifact = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const report = (typeof artifact.reconciliationReport === 'object' && artifact.reconciliationReport !== null
      ? artifact.reconciliationReport
      : {}) as Record<string, unknown>;
    if (!Array.isArray(report.checks)) {
      skipped += 1;
      continue;
    }
    files += 1;
    const caseId = typeof artifact.id === 'string' && artifact.id ? artifact.id : 'adhoc-tx-verify';
    const generatedAt = typeof artifact.generatedAt === 'string' ? artifact.generatedAt : '';
    const displayPath = relative(workspaceRoot, file).split(sep).join('/');
    for (const item of report.checks as unknown[]) {
      const check = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
      const checkId = typeof check.id === 'string' ? check.id : '';
      if (!checkId || check.verification === 'NOT_VERIFIED') continue;
      const actionId = typeof check.actionId === 'string' ? check.actionId : 'WHOLE';
      const basis = (typeof check.formulaBasis === 'object' && check.formulaBasis !== null
        ? check.formulaBasis
        : {}) as Record<string, unknown>;
      const formula = (typeof check.formula === 'object' && check.formula !== null
        ? check.formula
        : {}) as Record<string, unknown>;
      const rowKey = `${actionId} ${checkId}`;
      const dedupeKey = `${caseId}#${rowKey}`;
      const existing = latestByKey.get(dedupeKey);
      if (existing && existing.generatedAt >= generatedAt) continue;
      latestByKey.set(dedupeKey, {
        generatedAt,
        record: {
          scenarioId: caseId,
          rowId: `${rowKey} @ ${displayPath}`,
          dataSource: '',
          haystack: normalizeKey([
            checkId,
            typeof check.note === 'string' ? check.note : '',
            typeof basis.section === 'string' ? basis.section : '',
            typeof basis.title === 'string' ? basis.title : '',
          ].join('|')),
          formulaNorm: normalizeKey(typeof formula.expanded === 'string' ? formula.expanded : ''),
          ...(typeof check.ledgerFieldId === 'string' && check.ledgerFieldId ? { ledgerFieldId: check.ledgerFieldId } : {}),
        },
      });
    }
  }
  return { files, skipped, records: [...latestByKey.values()].map((entry) => entry.record) };
}

/** 侧别 → 允许计入覆盖的核对行数据来源层（前端字段只认前端层核对，防止链上行冒充页面覆盖）。 */
function sourceMatchesSide(side: ReconciliationSide, dataSource: string): boolean {
  if (side === '前端') return dataSource === '前端';
  if (side === '合约') return dataSource !== '前端';
  return true;
}

function findCoverage(seed: SeedRow, records: ReconRecord[]): ReconciliationCoverageLink[] {
  const links: ReconciliationCoverageLink[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    if (!sourceMatchesSide(seed.side, record.dataSource)) continue;
    // 核对行自带台账 id（packs / verify-tx 派生）：对合约章节行（c-）只认精确相等，不再按标题模糊命中别的章节；
    // 参数行（p-）/ 配对行（pair-）没有派生 id，仍沿用 label / 章节 / 公式文本的模糊规则。
    const fuzzy = () => seed.matchKeys.some((key) =>
      record.haystack.includes(key) || (seed.matchInFormula && record.formulaNorm.includes(key)));
    const matched = record.ledgerFieldId === seed.id
      || (record.ledgerFieldId && seed.id.startsWith('c-') ? false : fuzzy());
    if (!matched) continue;
    const dedupeKey = `${record.scenarioId}#${record.rowId}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    links.push({ scenarioId: record.scenarioId, rowId: record.rowId });
  }
  return links;
}

// —— 合并与写盘 ————————————————————————

function mergeStatus(
  computed: ReconciliationFieldStatus,
  existing: ReconciliationFieldRow | undefined,
): ReconciliationFieldStatus {
  if (computed === 'implemented') return 'implemented';
  // candidate / accepted 是控制台人工裁决，重跑 seed 不得回退。
  if (existing && (existing.status === 'candidate' || existing.status === 'accepted')) {
    return existing.status;
  }
  return 'uncovered';
}

async function main(): Promise<void> {
  const [contractLines, parameterLines, pageLines, conventionLines] = await Promise.all([
    readWorkspaceDoc(CONTRACT_FORMULA_DOC),
    readWorkspaceDoc(PARAMETER_CATALOG_DOC),
    readWorkspaceDoc(PAGE_FORMULA_DOC),
    readWorkspaceDoc(CONVENTIONS_DOC),
  ]);

  const contractRows = parseContractFormulaDoc(contractLines);
  const parameterRows = parseParameterCatalog(parameterLines);
  const pageRows = parsePageAssertionTable(pageLines);
  const pairingRows = parseConventions(conventionLines);
  const seeds = [...contractRows, ...parameterRows, ...pageRows, ...pairingRows];

  const duplicated = seeds.map((seed) => seed.id).filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicated.length > 0) {
    throw new Error(`台账行 id 冲突：${[...new Set(duplicated)].join(', ')}`);
  }

  const [snapshot, manual] = await Promise.all([readReconciliationRecords(), readManualVerifyRecords()]);
  const coverageRecords = [...snapshot.records, ...manual.records];
  const existing = await loadReconciliationLedger(projectRoot).catch(() => null);
  const existingById = new Map((existing?.rows ?? []).map((row) => [row.id, row]));
  const now = new Date().toISOString();

  let implementedCount = 0;
  let manualOnlyCount = 0;
  const rows: ReconciliationFieldRow[] = seeds.map((seed) => {
    const coveredBy = findCoverage(seed, coverageRecords);
    if (coveredBy.length > 0 && findCoverage(seed, snapshot.records).length === 0) manualOnlyCount += 1;
    const truncated = coveredBy.length > COVERED_BY_LIMIT;
    const computed: ReconciliationFieldStatus = coveredBy.length > 0 ? 'implemented' : 'uncovered';
    if (computed === 'implemented') implementedCount += 1;
    const previous = existingById.get(seed.id);
    const status = mergeStatus(computed, previous);
    const noteParts = [
      previous?.note && previous.note !== seed.note ? previous.note : seed.note,
      truncated ? `覆盖行超过 ${COVERED_BY_LIMIT} 处，仅保留前 ${COVERED_BY_LIMIT} 处示例` : '',
    ].filter(Boolean);
    const note = [...new Set(noteParts)].join('；');
    const unchanged = previous
      && previous.status === status
      && previous.note === note
      && JSON.stringify(previous.coveredBy) === JSON.stringify(coveredBy.slice(0, COVERED_BY_LIMIT));
    return {
      id: seed.id,
      side: seed.side,
      field: seed.field,
      formulaDigest: seed.formulaDigest,
      sourceAnchor: seed.sourceAnchor,
      relatedScenarios: [...new Set(coveredBy.map((link) => link.scenarioId))].sort(),
      status,
      coveredBy: coveredBy.slice(0, COVERED_BY_LIMIT),
      updatedAt: unchanged ? previous.updatedAt : now,
      note,
    };
  });

  const ledger: ReconciliationLedger = {
    schemaVersion: 1,
    generatedAt: now,
    seededFrom: {
      resultsPath: RESULTS_PATH,
      runId: snapshot.runId,
      resultsGeneratedAt: snapshot.generatedAt,
      // 文档来源在前，手工核对产物扫描根（glob 写法）在后：台账页可据此看出 implemented 还采纳了哪些手工证据。
      sources: [CONTRACT_FORMULA_DOC, PARAMETER_CATALOG_DOC, PAGE_FORMULA_DOC, CONVENTIONS_DOC, ...MANUAL_SOURCES],
    },
    rows,
  };
  const target = DRY_RUN ? '（--dry-run：未写盘）' : await saveReconciliationLedger(projectRoot, ledger);

  const bySide = (side: ReconciliationSide) => rows.filter((row) => row.side === side);
  const implementedOf = (subset: ReconciliationFieldRow[]) =>
    subset.filter((row) => row.status === 'implemented').length;
  console.log('核对字段台账已生成：', target);
  console.log(`来源提取行数：合约公式章节 ${contractRows.length} · 参数变化清单 ${parameterRows.length}`
    + ` · 页面断言表 ${pageRows.length} · 配对约定 ${pairingRows.length}（合计 ${rows.length}）`);
  console.log(`已生效匹配（implemented）：${implementedCount} 行`
    + `（合约侧 ${implementedOf(bySide('合约'))}/${bySide('合约').length}`
    + ` · 前端侧 ${implementedOf(bySide('前端'))}/${bySide('前端').length}`
    + ` · 配对 ${implementedOf(bySide('配对'))}/${bySide('配对').length}）`);
  console.log(`覆盖快照：${RESULTS_PATH} · run ${snapshot.runId || '未知'} · 核对行 ${snapshot.records.length} 条`);
  console.log(`手工核对产物：${MANUAL_SOURCES.join(' + ')} · 采纳 ${manual.files} 份（跳过 ${manual.skipped} 份无核对行）`
    + ` · 核对行 ${manual.records.length} 条（其中带 ledgerFieldId ${manual.records.filter((record) => record.ledgerFieldId).length} 条）`
    + ` · 仅靠手工核对升为 implemented ${manualOnlyCount} 行`);
  if (VERBOSE) {
    for (const row of rows) {
      const manualLinks = row.coveredBy.filter((link) => link.rowId.includes(' @ '));
      if (manualLinks.length === 0) continue;
      console.log(`  ${row.id}（${row.field}）← ${manualLinks.slice(0, 3).map((link) => `${link.scenarioId} ${link.rowId}`).join(' | ')}`
        + (manualLinks.length > 3 ? ` …共 ${manualLinks.length} 处` : ''));
    }
  }
  if (existing) {
    const kept = rows.filter((row) => {
      const previous = existingById.get(row.id);
      return previous && (previous.status === 'candidate' || previous.status === 'accepted')
        && row.status === previous.status;
    }).length;
    console.log(`重跑合并：保留人工裁决（candidate/accepted）${kept} 行`);
  }
}

await main();

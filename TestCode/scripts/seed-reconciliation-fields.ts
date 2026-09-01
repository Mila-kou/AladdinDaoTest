import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

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
 * 核对字段台账种子脚本（直接 `npx tsx scripts/seed-reconciliation-fields.ts` 运行，不注册 npm script）。
 *
 * 从四个权威来源提取字段清单，生成 config/reconciliation-fields.json：
 *  ① 合约侧：TestCase/E2E/ContractCodeSummary/FX100-核心字段计算公式.md 第 1–20 章的小节字段
 *            + Docs/contract-releases/v0.3.2/04-参数目录.md §6 参数变化清单；
 *  ② 前端侧：Docs/Gordon-Notion需求文档归档/汇总/FX100-页面字段计算公式.md §九 测试断言表；
 *  ③ 配对侧：.claude/skills/fx100-formula-parity/references/conventions.md §1/§2/§3 字段配对约定表；
 *  ④ 已覆盖映射：TestCode/artifacts/latest/results.json 各场景 executionEvidence.reconciliations，
 *     按字段名 / label / 章节锚点模糊匹配标 implemented（已生效）并回链 场景+行 id。
 *
 * 提取原则：靠标题 / 表格解析，宁可粗一点也不编造公式；摘要解析不到的行 note=待人工补。
 * 重跑合并规则：candidate / accepted 属人工裁决，重跑 seed 保留；implemented 每次按当前
 * results.json 覆盖重新判定（覆盖消失则回落到人工状态或 uncovered）。
 */

const projectRoot = process.cwd();
const workspaceRoot = resolve(projectRoot, '..');

const CONTRACT_FORMULA_DOC = 'TestCase/E2E/ContractCodeSummary/FX100-核心字段计算公式.md';
const PARAMETER_CATALOG_DOC = 'Docs/contract-releases/v0.3.2/04-参数目录.md';
const PAGE_FORMULA_DOC = 'Docs/Gordon-Notion需求文档归档/汇总/FX100-页面字段计算公式.md';
const CONVENTIONS_DOC = '.claude/skills/fx100-formula-parity/references/conventions.md';
const RESULTS_PATH = 'artifacts/latest/results.json';

const COVERED_BY_LIMIT = 40;

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
    const chapterNumber = Number(section.number.split('.')[0]);
    // 第 0 章是使用规则、21 章起是速查/差异/流程附录，不是字段定义。
    if (!Number.isFinite(chapterNumber) || chapterNumber < 1 || chapterNumber > 20) continue;
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
      id: `c-${section.number.replaceAll('.', '-')}`,
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
      });
    }
  }
  return {
    runId: typeof raw.run?.id === 'string' ? raw.run.id : '',
    generatedAt: typeof raw.source?.generatedAt === 'string' ? raw.source.generatedAt : '',
    records,
  };
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
    const matched = seed.matchKeys.some((key) =>
      record.haystack.includes(key) || (seed.matchInFormula && record.formulaNorm.includes(key)));
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

  const snapshot = await readReconciliationRecords();
  const existing = await loadReconciliationLedger(projectRoot).catch(() => null);
  const existingById = new Map((existing?.rows ?? []).map((row) => [row.id, row]));
  const now = new Date().toISOString();

  let implementedCount = 0;
  const rows: ReconciliationFieldRow[] = seeds.map((seed) => {
    const coveredBy = findCoverage(seed, snapshot.records);
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
      sources: [CONTRACT_FORMULA_DOC, PARAMETER_CATALOG_DOC, PAGE_FORMULA_DOC, CONVENTIONS_DOC],
    },
    rows,
  };
  const target = await saveReconciliationLedger(projectRoot, ledger);

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

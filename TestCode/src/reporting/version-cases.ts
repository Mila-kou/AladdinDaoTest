import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { TestCaseDefinition } from './test-cases.js';

/**
 * 版本级功能用例（CT/XT/FT，Trade 测试用例矩阵）解析器。
 *
 * 数据源（全部只读、容错解析，格式问题记入 parseIssues 而不抛错）：
 * - `TestCase/E2E/versions/<release>/Trade-测试用例矩阵.md`：§ 节分组；A/B 节 9 列（带「Trader / 地址」），
 *   其余节 8 列；行首形如 `| XT-MKT-OPEN-001 / P0 |`。8/9 列混排必须容错。
 * - 同文件 A/B1/B2 节末尾「地址映射」表：本轮入口（RPC / 页面）按用例登记（首格可为范围/枚举）。
 * - `results.md`：按层状态（合约层 / 前端层 / 交叉一致），词汇 NOT_RUN/PASS/FAIL/BLOCKED/GAP；
 *   无记录 = NOT_RUN；FT 行未走页面时前端层 = GAP。
 * - `config/case-traders.json`：地址缺省时回退 CT/XT/FT 条目；仍缺 =「待分配」。
 * - `Docs/contract-releases/CURRENT.json`：primary.version / admission / admissionScope（容错读取）。
 *
 * 与共享 SCN 场景解析（schema.ts `^SCN-\d{3}$`、test-cases.ts 7 列明细）完全独立：
 * 本模块不放宽也不复用 SCN 路径的任何校验。
 */

export type VersionLayerStatus = 'NOT_RUN' | 'PASS' | 'FAIL' | 'BLOCKED' | 'GAP';

/** 功能用例 ID（任务书正则）：CT-BASE-001、XT-MKT-OPEN-001、FT-LMT-VAL-011 … */
export const VERSION_CASE_ID = /^(?:CT|XT|FT)-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3}$/;
/** 其余功能用例 ID（如订单类型主用例 OT-MI-001）：非 SCN、两段以上大写段 + 三位序号。 */
const GENERIC_CASE_ID = /^(?!SCN-)[A-Z]{2,5}(?:-[A-Z0-9]+)+-\d{3}$/;
const LAYER_STATUS = /^(NOT_RUN|PASS|FAIL|BLOCKED|GAP)$/;

export interface VersionCaseLayers {
  readonly contract: VersionLayerStatus;
  readonly frontend: VersionLayerStatus;
  readonly parity: VersionLayerStatus;
}

export interface VersionFunctionalCase {
  readonly id: string;
  readonly priority: string;
  readonly title: string;
  /** 'core' = 带测试账户 / Trader 地址列的完整分层行；'other' = 其余行。 */
  readonly kind: 'core' | 'other';
  /** 用例要求覆盖的层；旧矩阵缺列时按 CT / XT / FT 前缀推导。 */
  readonly layer: string;
  /** 本轮入口：地址映射表登记值；缺省按 ID 前缀推导（FT=页面，其余=RPC）。 */
  readonly entry: string;
  /** Trader 编号 + 地址（矩阵第 9 列原文，或 case-traders.json 回退；仍缺 =「待分配」）。 */
  readonly trader: string;
  readonly preconditions: string;
  readonly testData: string;
  readonly steps: string;
  readonly checks: string;
  readonly expected: string;
  /** 矩阵中的「关联用例 / 后续处理」原文；无该列时为空字符串。 */
  readonly relatedCase: string;
  readonly designBasis: string;
  readonly layers: VersionCaseLayers;
}

export interface VersionCaseSection {
  readonly name: string;
  readonly cases: readonly VersionFunctionalCase[];
}

export interface VersionCasesView {
  readonly release: string;
  readonly hasMatrix: boolean;
  readonly matrixPath: string;
  readonly resultsPath: string;
  readonly applicabilityPath: string;
  readonly overridesPath: string;
  readonly sections: readonly VersionCaseSection[];
  readonly coreCount: number;
  readonly otherCount: number;
  readonly parseIssues: readonly string[];
  readonly emptyReason?: string;
}

export interface AdmissionScopeEntry {
  readonly key: string;
  readonly status: string;
}

export interface AdmissionView {
  /** primary.admission（总开关）；登记缺失时「未登记」。 */
  readonly admission: string;
  readonly scope: readonly AdmissionScopeEntry[];
  readonly txForkContractReady: boolean;
  readonly source: string;
}

export interface VersionCasesData {
  readonly defaultRelease: string;
  readonly releases: readonly string[];
  readonly versions: readonly VersionCasesView[];
  readonly admission: AdmissionView;
  /** versions/ 目录不存在或为空时的说明；正常时不写。 */
  readonly noVersionsReason?: string;
}

const VERSIONS_RELATIVE_DIR = '../TestCase/E2E/versions';
const BASELINE_RELATIVE_PATH = '../Docs/contract-releases/CURRENT.json';
const CASE_TRADERS_RELATIVE_PATH = 'config/case-traders.json';
const MATRIX_FILE = 'Trade-测试用例矩阵.md';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

export function isFunctionalCaseId(id: string): boolean {
  return VERSION_CASE_ID.test(id) || GENERIC_CASE_ID.test(id);
}

/** 展开地址映射表首格里的用例引用：`CT-BASE-001～004、006、007` → 6 个完整 ID。 */
function expandMappingIds(cell: string): string[] {
  const ids: string[] = [];
  let prefix = '';
  for (const raw of cell.split(/[、，,]/)) {
    const token = raw.trim().replace(/`/g, '');
    if (!token) continue;
    const fullRange = /^([A-Z][A-Z0-9-]*-)(\d{3})[～~-](\d{3})$/.exec(token);
    if (fullRange?.[1] && fullRange[2] && fullRange[3]) {
      prefix = fullRange[1];
      for (let n = Number(fullRange[2]); n <= Number(fullRange[3]); n++) {
        ids.push(`${prefix}${String(n).padStart(3, '0')}`);
      }
      continue;
    }
    const full = /^([A-Z][A-Z0-9-]*-)(\d{3})$/.exec(token);
    if (full?.[1] && full[2]) {
      prefix = full[1];
      ids.push(`${prefix}${full[2]}`);
      continue;
    }
    const bareRange = /^(\d{3})[～~-](\d{3})$/.exec(token);
    if (bareRange?.[1] && bareRange[2] && prefix) {
      for (let n = Number(bareRange[1]); n <= Number(bareRange[2]); n++) {
        ids.push(`${prefix}${String(n).padStart(3, '0')}`);
      }
      continue;
    }
    const bare = /^(\d{3})$/.exec(token);
    if (bare?.[1] && prefix) ids.push(`${prefix}${bare[1]}`);
  }
  return ids.filter(isFunctionalCaseId);
}

interface ParsedMatrixRow {
  readonly id: string;
  readonly priority: string;
  readonly title: string;
  readonly kind: 'core' | 'other';
  readonly layerCell: string;
  readonly entryCell: string;
  readonly addressCell: string;
  readonly preconditions: string;
  readonly testData: string;
  readonly steps: string;
  readonly checks: string;
  readonly expected: string;
  readonly relatedCase: string;
  readonly designBasis: string;
  readonly section: string;
}

interface ParsedMatrix {
  readonly rows: readonly ParsedMatrixRow[];
  readonly entryById: ReadonlyMap<string, string>;
  readonly parseIssues: readonly string[];
}

/** 解析 Trade 矩阵：用例行（兼容新旧表头）+ 地址映射表（裸 ID 首格 → 本轮入口）。 */
export function parseTradeMatrix(markdown: string): ParsedMatrix {
  const rows: ParsedMatrixRow[] = [];
  const entryById = new Map<string, string>();
  const parseIssues: string[] = [];
  let section = '';
  let tableHeaders: string[] = [];
  const lines = markdown.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? '';
    const heading = /^#{2,4}\s+(.+?)\s*$/.exec(line);
    if (heading?.[1]) {
      section = heading[1];
      tableHeaders = [];
      continue;
    }
    if (!line.trimStart().startsWith('|')) continue;
    const cells = tableCells(line);
    const first = cells[0] ?? '';
    if (!first || /^[-\s:]+$/.test(first)) continue;

    const normalizedFirst = first.replace(/`/g, '').replace(/\s+/g, ' ').trim();
    if (/^(?:ID\s*\/\s*P|用例\s*ID\s*\/\s*优先级)$/i.test(normalizedFirst)) {
      tableHeaders = cells.map((cell) => cell.replace(/`/g, '').replace(/\s+/g, ' ').trim());
      continue;
    }

    const caseHead = /^([A-Z][A-Z0-9-]*-\d{3})\s*\/\s*(P[0-2])$/.exec(first);
    if (caseHead?.[1] && caseHead[2] && isFunctionalCaseId(caseHead[1])) {
      const id = caseHead[1];
      const title = cells[1] ?? '';
      if (!title) {
        parseIssues.push(`第 ${index + 1} 行 ${id} 缺少测试标题`);
        continue;
      }
      const hasAccountColumn = tableHeaders.some((header) =>
        header === 'Trader / 地址' || header === '测试账户 / 地址');
      // 新矩阵已不再以 8/9 列区分用例类型：是否带账户地址列才是稳定标识。
      // 表头缺失时保留旧矩阵的列数回退，避免历史文档全部改类。
      const kind: 'core' | 'other' = hasAccountColumn
        ? 'core'
        : tableHeaders.length > 0 ? 'other' : cells.length >= 9 ? 'core' : 'other';
      const valueFor = (...names: string[]): string => {
        const headerIndex = tableHeaders.findIndex((header) => names.includes(header));
        return headerIndex >= 0 ? (cells[headerIndex] ?? '').replace(/`/g, '').trim() : '';
      };
      rows.push({
        id,
        priority: caseHead[2],
        title,
        kind,
        layerCell: valueFor('层'),
        entryCell: valueFor('入口'),
        addressCell: valueFor('Trader / 地址', '测试账户 / 地址'),
        preconditions: valueFor('前置条件', '关联开仓用例 / 前置条件'),
        testData: valueFor('测试数据', '前置/数据'),
        steps: valueFor('操作步骤'),
        checks: valueFor('核对数据'),
        expected: valueFor('期望结果'),
        relatedCase: valueFor('关联用例 / 后续处理'),
        designBasis: valueFor('设计方法 / 依据', '设计依据 / 备注', '设计方法 / 备注'),
        section: section || '未分节',
      });
      continue;
    }

    // 地址映射表行：首格是裸 ID / 范围 / 枚举（不含 ` / P`），第 2 格是「本轮入口」。
    if (!first.includes(' / P') && /[A-Z]{2,5}-[A-Z0-9]/.test(first)) {
      const entry = (cells[1] ?? '').replace(/`/g, '');
      if (!entry || entry === '本轮入口') continue;
      for (const id of expandMappingIds(first)) {
        if (!entryById.has(id)) entryById.set(id, entry);
      }
    }
  }
  return { rows, entryById, parseIssues };
}

interface ResultsRecord {
  contract?: VersionLayerStatus;
  frontend?: VersionLayerStatus;
  parity?: VersionLayerStatus;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 从 results.md 提取每条功能用例的按层状态：支持「合约层: PASS」式标注与表格顺序两种写法。 */
export function parseResultsStatuses(
  markdown: string,
  ids: readonly string[],
): ReadonlyMap<string, ResultsRecord> {
  const byId = new Map<string, ResultsRecord>();
  const lines = markdown.split(/\r?\n/);
  for (const id of ids) {
    const idPattern = new RegExp(`${escapeRegExp(id)}(?![0-9A-Za-z-])`);
    for (const line of lines) {
      if (!idPattern.test(line)) continue;
      const record: ResultsRecord = byId.get(id) ?? {};
      const labeled = (label: string): VersionLayerStatus | undefined => {
        const match = new RegExp(`${label}\\s*[:：=]?\\s*(NOT_RUN|PASS|FAIL|BLOCKED|GAP)`).exec(line);
        return match?.[1] as VersionLayerStatus | undefined;
      };
      const contract = labeled('合约层');
      const frontend = labeled('前端层');
      const parity = labeled('交叉一致');
      if (contract) record.contract = contract;
      if (frontend) record.frontend = frontend;
      if (parity) record.parity = parity;
      if (!contract && !frontend && !parity && line.trimStart().startsWith('|')) {
        const cells = tableCells(line);
        if ((cells[0] ?? '') === id) {
          const statuses = cells.slice(1)
            .map((cell) => LAYER_STATUS.exec(cell)?.[1] as VersionLayerStatus | undefined)
            .filter((value): value is VersionLayerStatus => Boolean(value));
          if (statuses[0]) record.contract = statuses[0];
          if (statuses[1]) record.frontend = statuses[1];
          if (statuses[2]) record.parity = statuses[2];
        }
      }
      if (Object.keys(record).length > 0) byId.set(id, record);
    }
  }
  return byId;
}

interface CaseTraderAssignment {
  readonly traderIndex: number;
  readonly address: string;
  readonly label: string;
}

async function loadCaseTraderAssignments(
  projectRoot: string,
): Promise<ReadonlyMap<string, CaseTraderAssignment>> {
  const assignments = new Map<string, CaseTraderAssignment>();
  try {
    const raw = JSON.parse(
      await readFile(resolve(projectRoot, CASE_TRADERS_RELATIVE_PATH), 'utf8'),
    ) as unknown;
    if (isRecord(raw) && isRecord(raw.assignments)) {
      for (const [id, value] of Object.entries(raw.assignments)) {
        if (!isRecord(value)) continue;
        const traderIndex = typeof value.traderIndex === 'number' ? value.traderIndex : undefined;
        const address = typeof value.address === 'string' ? value.address : undefined;
        if (traderIndex === undefined || !address) continue;
        assignments.set(id, {
          traderIndex,
          address,
          label: typeof value.label === 'string' ? value.label : `Trader${traderIndex}`,
        });
      }
    }
  } catch {
    // 映射文件缺失/损坏时静默回退「待分配」；地址缺省不是重建失败。
  }
  return assignments;
}

function loadAdmission(raw: unknown): Pick<AdmissionView, 'admission' | 'scope'> {
  if (!isRecord(raw) || !isRecord(raw.primary)) return { admission: '未登记', scope: [] };
  const admission = typeof raw.primary.admission === 'string' ? raw.primary.admission : '未登记';
  const scope: AdmissionScopeEntry[] = [];
  if (isRecord(raw.primary.admissionScope)) {
    for (const [key, status] of Object.entries(raw.primary.admissionScope)) {
      if (typeof status === 'string') scope.push({ key, status });
    }
  }
  return { admission, scope };
}

function fallbackEntry(id: string): string {
  return id.startsWith('FT-') ? '页面' : 'RPC';
}

function fallbackLayer(id: string): string {
  if (id.startsWith('CT-')) return '合约层';
  if (id.startsWith('FT-')) return '前端层';
  return '合约层 + 前端层';
}

function buildCase(
  row: ParsedMatrixRow,
  entryById: ReadonlyMap<string, string>,
  results: ReadonlyMap<string, ResultsRecord>,
  traders: ReadonlyMap<string, CaseTraderAssignment>,
): VersionFunctionalCase {
  const record = results.get(row.id);
  const isFrontendCase = row.id.startsWith('FT-');
  const layers: VersionCaseLayers = {
    contract: record?.contract ?? 'NOT_RUN',
    // FT 行未走页面（无前端层记录）时前端层 = GAP；其余无记录 = NOT_RUN。
    frontend: record?.frontend ?? (isFrontendCase ? 'GAP' : 'NOT_RUN'),
    parity: record?.parity ?? 'NOT_RUN',
  };
  const assignment = traders.get(row.id);
  const trader = row.addressCell
    || (assignment ? `T${assignment.traderIndex} ${assignment.address}` : '待分配');
  const entry = row.entryCell || entryById.get(row.id)
    || (row.addressCell.includes('只读') ? 'RPC 只读' : fallbackEntry(row.id));
  return {
    id: row.id,
    priority: row.priority,
    title: row.title,
    kind: row.kind,
    layer: row.layerCell || fallbackLayer(row.id),
    entry,
    trader,
    preconditions: row.preconditions,
    testData: row.testData,
    steps: row.steps,
    checks: row.checks,
    expected: row.expected,
    relatedCase: row.relatedCase,
    designBasis: row.designBasis,
    layers,
  };
}

async function loadVersionView(
  versionsDirectory: string,
  release: string,
  traders: ReadonlyMap<string, CaseTraderAssignment>,
): Promise<VersionCasesView> {
  const displayBase = `TestCase/E2E/versions/${release}`;
  const base = {
    release,
    matrixPath: `${displayBase}/${MATRIX_FILE}`,
    resultsPath: `${displayBase}/results.md`,
    applicabilityPath: `${displayBase}/applicability.md`,
    overridesPath: `${displayBase}/expectation-overrides.md`,
  };
  let matrixSource: string;
  try {
    matrixSource = await readFile(join(versionsDirectory, release, MATRIX_FILE), 'utf8');
  } catch {
    return {
      ...base,
      hasMatrix: false,
      sections: [],
      coreCount: 0,
      otherCount: 0,
      parseIssues: [],
      emptyReason: `该版本目录（${displayBase}/）下没有 ${MATRIX_FILE}，暂无版本级功能用例。`,
    };
  }
  const matrix = parseTradeMatrix(matrixSource);
  const resultsSource = await readFile(join(versionsDirectory, release, 'results.md'), 'utf8')
    .catch(() => '');
  const results = parseResultsStatuses(resultsSource, matrix.rows.map((row) => row.id));

  const sections: Array<{ name: string; cases: VersionFunctionalCase[] }> = [];
  for (const row of matrix.rows) {
    const built = buildCase(row, matrix.entryById, results, traders);
    const current = sections[sections.length - 1];
    if (current && current.name === row.section) current.cases.push(built);
    else sections.push({ name: row.section, cases: [built] });
  }
  const flat = sections.flatMap((section) => section.cases);
  return {
    ...base,
    hasMatrix: true,
    sections,
    coreCount: flat.filter((item) => item.kind === 'core').length,
    otherCount: flat.filter((item) => item.kind === 'other').length,
    parseIssues: matrix.parseIssues,
  };
}

/** 汇总测试用例页「版本功能用例」分区所需的全部数据；任何数据源缺失都不抛错。 */
export async function loadVersionCases(
  projectRoot: string = process.cwd(),
): Promise<VersionCasesData> {
  const versionsDirectory = resolve(projectRoot, VERSIONS_RELATIVE_DIR);
  let releases: string[] = [];
  let noVersionsReason: string | undefined;
  try {
    releases = (await readdir(versionsDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse();
    if (releases.length === 0) {
      noVersionsReason = 'TestCase/E2E/versions/ 下没有任何版本子目录，暂无版本级功能用例。';
    }
  } catch {
    noVersionsReason = 'TestCase/E2E/versions/ 目录不存在，暂无版本级功能用例。';
  }

  let registryRaw: unknown;
  try {
    registryRaw = JSON.parse(
      await readFile(resolve(projectRoot, BASELINE_RELATIVE_PATH), 'utf8'),
    ) as unknown;
  } catch {
    registryRaw = undefined;
  }
  const { admission, scope } = loadAdmission(registryRaw);
  const txForkContract = scope.find((item) => item.key === 'tx-fork:contract');
  const admissionView: AdmissionView = {
    admission,
    scope,
    txForkContractReady: /^READY/.test(txForkContract?.status ?? ''),
    source: 'Docs/contract-releases/CURRENT.json（primary.admission / primary.admissionScope）',
  };

  const primaryVersion = isRecord(registryRaw) && isRecord(registryRaw.primary)
    && typeof registryRaw.primary.version === 'string'
    ? registryRaw.primary.version
    : '';
  const defaultRelease = primaryVersion && releases.includes(primaryVersion)
    ? primaryVersion
    : (releases[0] ?? primaryVersion);
  // primary.version 无对应 versions/ 子目录时也渲染一个空块并说明原因。
  const renderReleases = defaultRelease && !releases.includes(defaultRelease)
    ? [defaultRelease, ...releases]
    : releases;

  const traders = await loadCaseTraderAssignments(projectRoot);
  const versions = await Promise.all(
    renderReleases.map((release) => loadVersionView(versionsDirectory, release, traders)),
  );

  return {
    defaultRelease,
    releases: renderReleases,
    versions,
    admission: admissionView,
    ...(noVersionsReason ? { noVersionsReason } : {}),
  };
}

/**
 * 把当前版本矩阵里的 CT / XT / FT 等功能用例投影成测试运行可消费的统一用例模型。
 * 矩阵仍是唯一事实源；这里不复制期望值，只补齐运行编排所需的环境与执行方式。
 */
export function buildVersionRunCaseDefinitions(data: VersionCasesData): TestCaseDefinition[] {
  const view = data.versions.find((item) => item.release === data.defaultRelease);
  if (!view?.hasMatrix) return [];

  return view.sections.flatMap((section) => section.cases.map((item) => {
    const pageOnly = item.entry.includes('页面') && !item.entry.includes('RPC');
    const readonly = item.entry.includes('只读');
    const needsTime = item.id.includes('-TIME-');
    return {
      id: item.id,
      suite: item.id.split('-')[0] ?? 'CASE',
      suiteName: `版本功能用例 · ${section.name}`,
      title: item.title,
      priority: item.priority as 'P0' | 'P1' | 'P2',
      executionMode: pageOnly ? 'manual' as const : 'automated' as const,
      targetProject: needsTime ? 'time-fork' as const : 'tx-fork' as const,
      marketMode: 'mock-market' as const,
      oracleMode: 'mock-oracle' as const,
      marketCompatibility: 'mock-only' as const,
      timeMode: needsTime ? 'controllable-time' as const : 'normal-block-time' as const,
      signingMode: readonly
        ? 'readonly' as const
        : pageOnly ? 'browser-wallet-keeper' as const : 'trader-keeper-private-key' as const,
      mockResourceAlias: 'default-mock',
      environmentSetup: `按 ${view.release} Trade 矩阵在独享测试环境准备 Mock Market；入口：${item.entry}`,
      roleIntent: `执行 ${view.release} Trade 矩阵中的 ${item.id} 原子用例。`,
      preconditions: item.preconditions || `遵守“${section.name}”的前置条件与准入要求。`,
      testData: [item.testData, item.trader].filter(Boolean).join('\nTrader / 地址：'),
      steps: item.steps || `按矩阵 ${item.id} 行从“${item.entry}”入口执行，并保留实际结果与证据。`,
      expected: [item.checks ? `核对数据：${item.checks}` : '', item.expected].filter(Boolean).join('\n'),
      cleanup: '按矩阵的数据隔离约定回滚快照，或清理本用例产生的仓位、订单与授权。',
      sourcePath: view.matrixPath,
      edited: false,
    };
  }));
}

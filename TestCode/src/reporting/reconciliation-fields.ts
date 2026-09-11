import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * 核对字段台账（reconciliation-fields.json）的数据层：
 * - 台账由 scripts/seed-reconciliation-fields.ts 从四个权威来源提取生成；
 * - 控制台页面（render-reconciliation-console.ts）静态渲染 + serve 模式经
 *   /api/reconciliation-fields 读取、/api/reconciliation-fields/confirm 写回；
 * - 写回使用临时文件 + rename 的原子写，避免并发写坏 JSON。
 */

export type ReconciliationSide = '合约' | '前端' | '配对';

export type ReconciliationFieldStatus = 'uncovered' | 'candidate' | 'accepted' | 'implemented';

export const reconciliationSides: readonly ReconciliationSide[] = ['合约', '前端', '配对'];

export const reconciliationFieldStatuses: readonly ReconciliationFieldStatus[] = [
  'uncovered',
  'candidate',
  'accepted',
  'implemented',
];

/** 页面按钮可写回的状态（implemented 只能由 seed 依据 results.json 覆盖判定，不允许手工设置）。 */
export const confirmableStatuses: readonly ReconciliationFieldStatus[] = [
  'candidate',
  'accepted',
  'uncovered',
];

export interface ReconciliationCoverageLink {
  readonly scenarioId: string;
  readonly rowId: string;
}

export interface ReconciliationFieldRow {
  readonly id: string;
  readonly side: ReconciliationSide;
  readonly field: string;
  readonly formulaDigest: string;
  readonly sourceAnchor: string;
  readonly relatedScenarios: string[];
  readonly status: ReconciliationFieldStatus;
  readonly coveredBy: ReconciliationCoverageLink[];
  readonly updatedAt: string;
  readonly note: string;
}

export interface ReconciliationLedgerSeedInfo {
  readonly resultsPath: string;
  readonly runId: string;
  readonly resultsGeneratedAt: string;
  readonly sources: string[];
}

export interface ReconciliationLedger {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly seededFrom: ReconciliationLedgerSeedInfo;
  readonly rows: ReconciliationFieldRow[];
}

export function reconciliationLedgerPath(projectRoot: string): string {
  return join(projectRoot, 'config', 'reconciliation-fields.json');
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function parseRow(raw: unknown): ReconciliationFieldRow | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const id = asString(record.id);
  const side = asString(record.side) as ReconciliationSide;
  const status = asString(record.status) as ReconciliationFieldStatus;
  if (!id || !reconciliationSides.includes(side) || !reconciliationFieldStatuses.includes(status)) {
    return null;
  }
  const coveredBy = Array.isArray(record.coveredBy)
    ? record.coveredBy.flatMap((item): ReconciliationCoverageLink[] => {
      if (typeof item !== 'object' || item === null) return [];
      const link = item as Record<string, unknown>;
      const scenarioId = asString(link.scenarioId);
      const rowId = asString(link.rowId);
      return scenarioId && rowId ? [{ scenarioId, rowId }] : [];
    })
    : [];
  const relatedScenarios = Array.isArray(record.relatedScenarios)
    ? record.relatedScenarios.filter((item): item is string => typeof item === 'string')
    : [];
  return {
    id,
    side,
    field: asString(record.field),
    formulaDigest: asString(record.formulaDigest),
    sourceAnchor: asString(record.sourceAnchor),
    relatedScenarios,
    status,
    coveredBy,
    updatedAt: asString(record.updatedAt),
    note: asString(record.note),
  };
}

export function parseReconciliationLedger(raw: unknown): ReconciliationLedger {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('reconciliation-fields.json 结构无效：期望顶层对象。');
  }
  const record = raw as Record<string, unknown>;
  if (record.schemaVersion !== 1) {
    throw new Error('reconciliation-fields.json schemaVersion 不支持（期望 1）。');
  }
  const seededRaw = (typeof record.seededFrom === 'object' && record.seededFrom !== null
    ? record.seededFrom
    : {}) as Record<string, unknown>;
  const rowsRaw = Array.isArray(record.rows) ? record.rows : [];
  const rows: ReconciliationFieldRow[] = [];
  for (const item of rowsRaw) {
    const row = parseRow(item);
    if (row) rows.push(row);
  }
  return {
    schemaVersion: 1,
    generatedAt: asString(record.generatedAt),
    seededFrom: {
      resultsPath: asString(seededRaw.resultsPath),
      runId: asString(seededRaw.runId),
      resultsGeneratedAt: asString(seededRaw.resultsGeneratedAt),
      sources: Array.isArray(seededRaw.sources)
        ? seededRaw.sources.filter((item): item is string => typeof item === 'string')
        : [],
    },
    rows,
  };
}

/** 台账不存在返回 null（未跑 seed 前控制台显示引导，不视为错误）；存在但损坏则抛错。 */
export async function loadReconciliationLedger(
  projectRoot: string,
): Promise<ReconciliationLedger | null> {
  let source: string;
  try {
    source = await readFile(reconciliationLedgerPath(projectRoot), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  return parseReconciliationLedger(JSON.parse(source) as unknown);
}

/** 原子写：先写临时文件再 rename，防止 confirm 接口与 seed 并发时留下半个 JSON。 */
export async function saveReconciliationLedger(
  projectRoot: string,
  ledger: ReconciliationLedger,
): Promise<string> {
  const target = reconciliationLedgerPath(projectRoot);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
  await rename(temporary, target);
  return target;
}

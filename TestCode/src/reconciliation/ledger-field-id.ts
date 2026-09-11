/**
 * 核对字段台账（config/reconciliation-fields.json）合约侧行 id 的唯一派生规则。
 *
 * - seed（scripts/seed-reconciliation-fields.ts）按详解层 `## N.` / `### N.M` 标题出行，id = `c-N` / `c-N-M`；
 * - packs（decrease-shared.ts::row）与 verify-tx 产物用同一函数从 formulaBasis.section 派生 `ledgerFieldId`；
 * - seed 重跑时先按 `ledgerFieldId === row.id` 精确匹配，再退回 label / 章节标题的模糊匹配，命中即升为 implemented。
 *
 * 规则：取 section 开头的 `§?N[.M[.K…]]` 数字串，只保留前两级（`§5.4.4 破产早退` → `c-5-4`；`§8` → `c-8`；`4.1 动态点差` → `c-4-1`）；
 * 章号必须在 1～20（第 0 章是使用规则、21 章起是速查 / 差异 / 流程附录，seed 不为这些章出行），否则返回 undefined。
 * 只对「核心字段计算公式」文档的章节使用；前端 / 需求文档的章节（如「一、下单面板」）不应传进来。
 */
export const CONTRACT_LEDGER_CHAPTER_RANGE = { min: 1, max: 20 } as const;

const SECTION_NUMBER_PATTERN = /^\s*§?\s*(\d{1,2})(?:\.(\d{1,2}))?(?:\.\d+)*(?![\d.])/;

export function contractLedgerFieldId(section: string | undefined): string | undefined {
  if (!section) return undefined;
  const match = SECTION_NUMBER_PATTERN.exec(section);
  if (!match?.[1]) return undefined;
  const chapter = Number(match[1]);
  if (chapter < CONTRACT_LEDGER_CHAPTER_RANGE.min || chapter > CONTRACT_LEDGER_CHAPTER_RANGE.max) return undefined;
  return match[2] ? `c-${chapter}-${Number(match[2])}` : `c-${chapter}`;
}

/** 台账四类行 id 的形状（c- 合约章节 / p- 参数变化清单 / f- 页面断言 / pair- 配对约定），schema 用它拦截随手写的 id。 */
export const LEDGER_FIELD_ID_PATTERN = /^(?:c|p|f|pair)-[A-Za-z0-9-]+$/;

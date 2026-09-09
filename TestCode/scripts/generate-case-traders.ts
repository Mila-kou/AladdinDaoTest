/**
 * 用例 → Trader 确定性映射生成：npm run traders:map
 *
 * 输入：config/noise-traders.json（公开地址册，来自 npm run traders:generate）
 *      + TestCase/E2E/SCENARIO-CHECKLIST.md（共享设计索引，主表 SCN-\d{3} 共 80 条）
 *      + TestCase/E2E/versions/v0.3.2/cases/SCN-B32.md（增补 SCN-B32-\d{2} 共 8 条）
 *      + TestCase/E2E/versions/v0.3.2/Trade-测试用例矩阵.md（A/B 节末尾的地址映射表，CT/XT/FT 功能用例）。
 * 规则：SCN-0NN → traderIndex NN（花名册 Trader 编号 1 基，Trader1=index 1）；SCN-B32-0N → 80+N；
 *      CT/XT/FT 按矩阵映射表登记的 `T<n>` 落地——允许与 SCN 复用同一 Trader（同一动作的版本级用例），
 *      Trade 用例之间只有探针行（FT 行，或本轮入口为「只读」/「页面」的行）可以共用一个地址；
 *      映射表若写了地址，必须与花名册该编号的地址一致（缩写「0x1234…」核前缀）；标「不占」或一格多账户的行跳过并打印原因，
 *      首格是编号却没有单独 `T<n>` 格的行直接报错（防静默漏映射）。
 *      负例校验：npm run traders:map -- --trade-matrix <临时副本路径>（日常不带该参数）。
 * 输出：config/case-traders.json（schemaVersion / generatedAt / rule / assignments；
 *      只含地址与编号，不含任何私钥——该文件**入库**，.gitignore 不得误伤）。
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { getAddress } from 'viem';
import { z } from 'zod';

const rosterSchema = z.object({
  savedAt: z.string().optional(),
  kind: z.string().optional(),
  traders: z.array(z.object({
    index: z.number().int().positive(),
    name: z.string().min(1),
    address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    source: z.string(),
  })).min(1),
});

const MAIN_SCENARIO_COUNT = 80;
const B32_SCENARIO_COUNT = 8;
const B32_INDEX_OFFSET = 80;

const CHECKLIST_PATH = '../TestCase/E2E/SCENARIO-CHECKLIST.md';
const B32_CASES_PATH = '../TestCase/E2E/versions/v0.3.2/cases/SCN-B32.md';
const DEFAULT_TRADE_MATRIX_PATH = '../TestCase/E2E/versions/v0.3.2/Trade-测试用例矩阵.md';

/** 版本级功能用例编号：CT-BASE-001、XT-MKT-OPEN-001、FT-LMT-VAL-011 … */
const TRADE_CASE_ID = /^(?:CT|XT|FT)-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3}$/;

interface TradeMappingRow {
  readonly id: string;
  readonly traderIndex: number;
  /** 映射表里写的完整地址（「同上」或缺省时为空） */
  readonly address?: string;
  /** 映射表里写的缩写地址前缀，如 `0x7a23…` 的 `0x7a23`（只能核前缀） */
  readonly addressPrefix?: string;
  readonly entry: string;
  readonly basis: string;
  /** 允许与其它探针行共用一个地址：FT 行，或本轮入口为「只读」/「页面」的行 */
  readonly probe: boolean;
  readonly line: number;
}

function splitTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

/**
 * 解析 Trade 矩阵 A/B 节末尾的地址映射表。
 * 认「首格是单个用例编号 + 某格是单独的 `T<n>`」的行；用例正文行首格形如 `XT-… / P0`，不会命中。
 * 显式跳过：含「不占」的行、一格里写了多个 `T<n>` 的行（如 CT-BASE-008 的角色夹具行）——都会打印跳过原因。
 * 首格是用例编号但既不是上述两种、又没有单独 `T<n>` 格的行视为写错，直接报错并给出行号，避免静默漏映射。
 * 围栏代码块（```）内的表格不解析。
 */
function parseTradeMatrixAssignments(markdown: string, log: (message: string) => void): TradeMappingRow[] {
  const rows: TradeMappingRow[] = [];
  const lines = markdown.split(/\r?\n/);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence || !/^\s*\|/.test(line)) continue;
    const cells = splitTableRow(line);
    const id = cells[0] ?? '';
    if (!TRADE_CASE_ID.test(id)) continue;
    const lineNo = i + 1;
    const traderTokens = cells.slice(1).flatMap((cell) => cell.match(/\bT\d+\b/g) ?? []);
    const bareTraderCell = cells.slice(1).find((cell) => /^T\d+$/.test(cell));
    if (cells.some((cell) => cell.includes('不占'))) {
      log(`[traders:map] 跳过 ${id}（行 ${lineNo}）：标记「不占」。`);
      continue;
    }
    if (!bareTraderCell) {
      if (traderTokens.length >= 2) {
        log(`[traders:map] 跳过 ${id}（行 ${lineNo}）：一格里写了多个账户（${traderTokens.join('、')}），不生成单一映射。`);
        continue;
      }
      throw new Error(
        `Trade 矩阵映射表 ${id}（行 ${lineNo}）没有单独的 \`T<n>\` 格（当前各格：${cells.slice(1).join(' | ')}）；`
        + '要么写成单独的 T<n>，要么标「不占」，不要留空或写「同上」。',
      );
    }
    let address: string | undefined;
    let addressPrefix: string | undefined;
    for (const cell of cells.slice(1)) {
      const plain = cell.replace(/`/g, '').trim();
      if (!/^0[xX]/.test(plain)) continue;
      const full = /0[xX][0-9a-fA-F]{40}/.exec(plain)?.[0];
      if (full) {
        address = `0x${full.slice(2)}`;
        break;
      }
      const abbreviated = /^0[xX]([0-9a-fA-F]{4,})…$/.exec(plain);
      if (abbreviated) {
        addressPrefix = abbreviated[1]!.toLowerCase();
        break;
      }
      throw new Error(`Trade 矩阵映射表 ${id}（行 ${lineNo}）的地址格「${plain}」既不是完整 40 位地址，也不是「0x1234…」式缩写。`);
    }
    const entry = cells[1] ?? '';
    rows.push({
      id,
      traderIndex: Number(bareTraderCell.slice(1)),
      ...(address ? { address } : {}),
      ...(addressPrefix ? { addressPrefix } : {}),
      entry,
      basis: cells[cells.length - 1] ?? '',
      probe: /^FT-/.test(id) || /只读|页面/.test(entry),
      line: lineNo,
    });
  }
  return rows;
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const projectRoot = process.cwd();
  const rosterPath = resolve(projectRoot, 'config/noise-traders.json');
  const rosterRaw = await readFile(rosterPath, 'utf8').catch(() => {
    throw new Error('config/noise-traders.json 不存在；先跑 npm run traders:generate 生成花名册。');
  });
  const roster = rosterSchema.parse(JSON.parse(rosterRaw) as unknown);
  if (roster.kind !== 'wallet') {
    throw new Error(`花名册 kind=${roster.kind ?? 'derived'} 不是 wallet（真实 EOA）；per-case 注入需要私钥签名，先跑 npm run traders:generate。`);
  }
  // index 基准核对：花名册 entry.index 从 1 起、连续且与数组位置一致（Trader1 = index 1）。
  roster.traders.forEach((entry, offset) => {
    if (entry.index !== offset + 1) {
      throw new Error(`花名册 index 基准异常：第 ${offset + 1} 项 index=${entry.index}（期望 1 基连续），请重新生成花名册。`);
    }
  });
  const byIndex = new Map(roster.traders.map((entry) => [entry.index, entry]));

  // 主表 80 条来自共享设计索引 SCENARIO-CHECKLIST.md（2026-09-02 起为 4 列，不含状态格）；
  // 增补 SCN-B32-01～08 已迁到版本专项 versions/v0.3.2/cases/SCN-B32.md，不再出现在主表里。
  const checklist = await readFile(resolve(projectRoot, CHECKLIST_PATH), 'utf8');
  const b32Cases = await readFile(resolve(projectRoot, B32_CASES_PATH), 'utf8').catch(() => {
    throw new Error(`${B32_CASES_PATH} 不存在；SCN-B32 增补场景的登记源缺失。`);
  });
  // --trade-matrix <path> 仅供对映射表改动做负例校验（指向临时副本），日常不带参数。
  const tradeMatrixPath = argumentValue('--trade-matrix') ?? DEFAULT_TRADE_MATRIX_PATH;
  const tradeMatrix = await readFile(resolve(projectRoot, tradeMatrixPath), 'utf8').catch(() => {
    throw new Error(`${tradeMatrixPath} 不存在；CT/XT/FT 功能用例的地址映射源缺失。`);
  });
  const mainIds = [...new Set(checklist.match(/SCN-\d{3}/g) ?? [])].sort();
  const b32Ids = [...new Set(b32Cases.match(/SCN-B32-\d{2}/g) ?? [])].sort();
  if (mainIds.length !== MAIN_SCENARIO_COUNT) {
    throw new Error(`主表 SCN 场景数 ${mainIds.length} ≠ ${MAIN_SCENARIO_COUNT}；请核对 SCENARIO-CHECKLIST.md 后再生成。`);
  }
  if (b32Ids.length !== B32_SCENARIO_COUNT) {
    throw new Error(`增补 SCN-B32 场景数 ${b32Ids.length} ≠ ${B32_SCENARIO_COUNT}；请核对 versions/v0.3.2/cases/SCN-B32.md 后再生成。`);
  }

  const plans = [
    ...mainIds.map((scenarioId) => ({ scenarioId, traderIndex: Number(scenarioId.slice('SCN-'.length)) })),
    ...b32Ids.map((scenarioId) => ({ scenarioId, traderIndex: B32_INDEX_OFFSET + Number(scenarioId.slice('SCN-B32-'.length)) })),
  ];
  const usedIndexes = new Set<number>();
  const assignments: Record<string, { scenarioId: string; traderIndex: number; address: string; label: string }> = {};
  for (const { scenarioId, traderIndex } of plans) {
    if (!Number.isInteger(traderIndex) || traderIndex < 1) {
      throw new Error(`${scenarioId} 解析出的 traderIndex=${traderIndex} 非法。`);
    }
    if (usedIndexes.has(traderIndex)) {
      throw new Error(`traderIndex ${traderIndex} 被重复分配（${scenarioId}）；确定性规则被破坏，请核对场景清单。`);
    }
    usedIndexes.add(traderIndex);
    const entry = byIndex.get(traderIndex);
    if (!entry) {
      throw new Error(`花名册只有 ${roster.traders.length} 个 Trader，${scenarioId} 需要 traderIndex=${traderIndex}；请 npm run traders:generate -- --count 100。`);
    }
    assignments[scenarioId] = {
      scenarioId,
      traderIndex,
      address: getAddress(entry.address),
      label: entry.name,
    };
  }

  // Trade 矩阵 CT/XT/FT：以映射表为准落地，校验编号在花名册内、表内地址与花名册一致、共用只限探针行。
  const tradeRows = parseTradeMatrixAssignments(tradeMatrix, (message) => console.log(message));
  const tradeIds = new Set<string>();
  const tradeIndexOwners = new Map<number, TradeMappingRow[]>();
  for (const row of tradeRows) {
    if (tradeIds.has(row.id)) {
      throw new Error(`Trade 矩阵映射表里 ${row.id} 出现两次（行 ${row.line}）；一条用例只能有一个映射。`);
    }
    tradeIds.add(row.id);
    const entry = byIndex.get(row.traderIndex);
    if (!entry) {
      throw new Error(`Trade 矩阵 ${row.id}（行 ${row.line}）要求 T${row.traderIndex}，花名册只有 ${roster.traders.length} 个 Trader。`);
    }
    if (row.address && getAddress(row.address) !== getAddress(entry.address)) {
      throw new Error(`Trade 矩阵 ${row.id}（行 ${row.line}）写的地址与花名册 T${row.traderIndex} 不一致；请以花名册为准修正矩阵。`);
    }
    if (row.addressPrefix && !entry.address.toLowerCase().startsWith(`0x${row.addressPrefix}`)) {
      throw new Error(`Trade 矩阵 ${row.id}（行 ${row.line}）的缩写地址 0x${row.addressPrefix}… 与花名册 T${row.traderIndex} 前缀不符；请以花名册为准修正矩阵。`);
    }
    tradeIndexOwners.set(row.traderIndex, [...(tradeIndexOwners.get(row.traderIndex) ?? []), row]);
    assignments[row.id] = {
      scenarioId: row.id,
      traderIndex: row.traderIndex,
      address: getAddress(entry.address),
      label: entry.name,
    };
  }
  let probeShared = 0;
  for (const [traderIndex, owners] of tradeIndexOwners) {
    if (owners.length <= 1) continue;
    const nonProbe = owners.filter((row) => !row.probe);
    if (nonProbe.length > 0) {
      throw new Error(
        `T${traderIndex} 被多条 Trade 用例共用（${owners.map((row) => row.id).join('、')}），而其中 ${nonProbe.map((row) => row.id).join('、')} 不是前端探针行；`
        + '写链用例必须各占一个 Trader（只有 FT 行或本轮入口为「只读」/「页面」的行可以共用），请修正矩阵映射表。',
      );
    }
    probeShared += owners.length;
  }
  const tradeReuseScn = tradeRows.filter((row) => usedIndexes.has(row.traderIndex)).length;

  const document = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    rule: 'SCN-0NN → traderIndex NN（花名册 Trader 编号 1 基）；SCN-B32-0N → 80+N；'
      + 'CT/XT/FT 按 Trade 矩阵 A/B 节映射表登记的 T<n> 落地（可与 SCN 复用同一 Trader，探针行可共用）。'
      + '仅含地址与编号，不含任何私钥；私钥束在本机 config/noise-traders.secret.json。',
    source: {
      roster: 'config/noise-traders.json',
      ...(roster.savedAt ? { rosterSavedAt: roster.savedAt } : {}),
      rosterCount: roster.traders.length,
      checklist: 'TestCase/E2E/SCENARIO-CHECKLIST.md',
      b32Cases: 'TestCase/E2E/versions/v0.3.2/cases/SCN-B32.md',
      tradeMatrix: 'TestCase/E2E/versions/v0.3.2/Trade-测试用例矩阵.md',
    },
    assignments,
  };
  const outputPath = resolve(projectRoot, 'config/case-traders.json');
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  console.log(
    `已写入 config/case-traders.json：${Object.keys(assignments).length} 条映射`
    + `（主表 ${mainIds.length} + 增补 ${b32Ids.length} + Trade 矩阵 ${tradeRows.length}，其中 ${tradeReuseScn} 条复用 SCN 专属 Trader、${probeShared} 条探针行共用），`
    + `SCN traderIndex 1–${Math.max(...usedIndexes)}，花名册 ${roster.traders.length} 个 Trader。该文件入库；跑批加 E2E_TRADER_ASSIGNMENT=per-case 生效。`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

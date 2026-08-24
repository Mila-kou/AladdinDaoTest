/**
 * 用例 → Trader 确定性映射生成：npm run traders:map
 *
 * 输入：config/noise-traders.json（公开地址册，来自 npm run traders:generate）
 *      + TestCase/E2E/SCENARIO-CHECKLIST.md（主表 SCN-\d{3} 共 80 条 + 增补 SCN-B32-\d{2} 共 8 条）。
 * 规则：SCN-0NN → traderIndex NN（花名册 Trader 编号 1 基，Trader1=index 1）；SCN-B32-0N → 80+N。
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

  const checklistPath = resolve(projectRoot, '../TestCase/E2E/SCENARIO-CHECKLIST.md');
  const checklist = await readFile(checklistPath, 'utf8');
  const mainIds = [...new Set(checklist.match(/SCN-\d{3}/g) ?? [])].sort();
  const b32Ids = [...new Set(checklist.match(/SCN-B32-\d{2}/g) ?? [])].sort();
  if (mainIds.length !== MAIN_SCENARIO_COUNT) {
    throw new Error(`主表 SCN 场景数 ${mainIds.length} ≠ ${MAIN_SCENARIO_COUNT}；请核对 SCENARIO-CHECKLIST.md 后再生成。`);
  }
  if (b32Ids.length !== B32_SCENARIO_COUNT) {
    throw new Error(`增补 SCN-B32 场景数 ${b32Ids.length} ≠ ${B32_SCENARIO_COUNT}；请核对 SCENARIO-CHECKLIST.md 后再生成。`);
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

  const document = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    rule: 'SCN-0NN → traderIndex NN（花名册 Trader 编号 1 基）；SCN-B32-0N → 80+N。仅含地址与编号，不含任何私钥；私钥束在本机 config/noise-traders.secret.json。',
    source: {
      roster: 'config/noise-traders.json',
      ...(roster.savedAt ? { rosterSavedAt: roster.savedAt } : {}),
      rosterCount: roster.traders.length,
      checklist: 'TestCase/E2E/SCENARIO-CHECKLIST.md',
    },
    assignments,
  };
  const outputPath = resolve(projectRoot, 'config/case-traders.json');
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  console.log(
    `已写入 config/case-traders.json：${Object.keys(assignments).length} 条映射`
    + `（主表 ${mainIds.length} + 增补 ${b32Ids.length}），traderIndex 1–${Math.max(...usedIndexes)}，`
    + `花名册 ${roster.traders.length} 个 Trader。该文件入库；跑批加 E2E_TRADER_ASSIGNMENT=per-case 生效。`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

#!/usr/bin/env node
// 把「合约取数清单」（Google Sheet）与实际部署里的参数全集比对，量化清单缺口。
//
// 输出三张表：
//   A 清单有 / 快照有   —— 已覆盖，附当前链上值
//   B 清单有 / 快照无   —— 清单写错了 key 名，或该项本就不是 DataStore 参数
//   C 清单无 / 快照有值 —— **清单遗漏**，这些参数链上真的设了值，却没进清单
//
// C 表是本脚本的目的：清单是人手维护的，只会越用越旧；快照是从合约源码生成的，不会漏。
//
// 用法：node check-coverage.mjs --snapshot <params.json> [--out <coverage.md>]

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { humanize } from "./lib/hints.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CHECKLIST = join(HERE, "checklist-取数清单.json");

function parseArgs() {
  const argv = process.argv.slice(2);
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--") && argv[i + 1] && !argv[i + 1].startsWith("--")) args[argv[i].slice(2)] = argv[++i];
  }
  return args;
}

function main() {
  const args = parseArgs();
  if (!args.snapshot) throw new Error("缺少 --snapshot <params.json>；不再回退固定 v0.3.1 快照。");
  const snapshotPath = resolve(args.snapshot);
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  const checklist = JSON.parse(readFileSync(resolve(args.checklist ?? DEFAULT_CHECKLIST), "utf8"));
  const outPath = resolve(args.out ?? join(dirname(snapshotPath), "取数清单-覆盖度.md"));

  const byBase = new Map();
  for (const entry of snapshot.entries) {
    if (!byBase.has(entry.base)) byBase.set(entry.base, []);
    byBase.get(entry.base).push(entry);
  }

  const checklistBases = new Set(checklist.dataStoreKeys.map((row) => row.base));

  const covered = [];
  const missingFromSnapshot = [];
  for (const row of checklist.dataStoreKeys) {
    const rows = byBase.get(row.base);
    if (rows?.length) covered.push({ ...row, rows });
    else missingFromSnapshot.push(row);
  }

  // C 表：链上真有值、清单里没有的参数。只看「已设置」的，未设置的不构成取数缺口。
  const missingFromChecklist = [];
  for (const [base, rows] of byBase) {
    if (checklistBases.has(base)) continue;
    const set = rows.filter((r) => !r.unset && !r.error);
    if (set.length) missingFromChecklist.push({ base, rows: set });
  }
  missingFromChecklist.sort((a, b) => a.base.localeCompare(b.base));

  const lines = [];
  lines.push("# 合约取数清单 — 覆盖度核对");
  lines.push("");
  lines.push(`> 清单来源：${checklist.source.name}（${checklist.source.tab}，同步于 ${checklist.source.syncedAt}）`);
  lines.push(`> 快照来源：${snapshot.meta.deploymentName} @ block ${snapshot.meta.blockNumber}（chainId ${snapshot.meta.chainId}）`);
  lines.push(`> 本文件由 \`tool/config-dump/check-coverage.mjs\` 生成，请勿手工编辑。`);
  lines.push("");
  lines.push("## 结论");
  lines.push("");
  lines.push("| 项 | 数量 |");
  lines.push("|---|---|");
  lines.push(`| 清单中的 DataStore 参数 | ${checklist.dataStoreKeys.length} |`);
  lines.push(`| A 清单有 · 快照有 | ${covered.length} |`);
  lines.push(`| B 清单有 · 快照无（key 名对不上或非 DataStore 项） | ${missingFromSnapshot.length} |`);
  lines.push(`| **C 清单无 · 链上已设值（清单缺口）** | **${missingFromChecklist.length} 个 key，共 ${missingFromChecklist.reduce((n, x) => n + x.rows.length, 0)} 条取值** |`);
  lines.push(`| 快照中被读到的 key 基名总数 | ${byBase.size} |`);
  lines.push("");

  lines.push("## A 清单有 · 快照有");
  lines.push("");
  lines.push("| 清单字段 | 清单 Key | 基名 | 取值条数 | 当前值 |");
  lines.push("|---|---|---|---|---|");
  for (const item of covered) {
    const values = item.rows
      .map((r) => `${r.argLabel ?? "-"}: \`${r.value}\`${r.unset ? "（未设置）" : ""}`)
      .join("<br>");
    lines.push(`| ${item.field} | \`${item.sheetKey}\` | ${item.base} | ${item.rows.length} | ${values} |`);
  }
  lines.push("");

  if (missingFromSnapshot.length) {
    lines.push("## B 清单有 · 快照无");
    lines.push("");
    lines.push("| 清单字段 | 清单 Key | 推断基名 |");
    lines.push("|---|---|---|");
    for (const row of missingFromSnapshot) lines.push(`| ${row.field} | \`${row.sheetKey}\` | ${row.base} |`);
    lines.push("");
  }

  lines.push("## C 清单无 · 链上已设值 —— 清单缺口");
  lines.push("");
  lines.push("以下参数在本次部署里**确实被设了非默认值**，但取数清单没有收录。");
  lines.push("按 Config 白名单区分设置路径：`Config(...)` 可治理改动，`DataStore 直写` 只能由 CONTROLLER 改、不留 Config 事件。");
  lines.push("");
  lines.push("| 基名 | 取值条数 | 设置路径 | 当前值 |");
  lines.push("|---|---|---|---|");
  for (const item of missingFromChecklist) {
    const path = (item.rows[0].settableVia ?? []).join(" / ") || "-";
    const values = item.rows
      .slice(0, 6)
      .map((r) => {
        const readable = humanize(r.base, r.type === "uint" || r.type === "int" ? r.value : null);
        return `${r.argLabel ?? "-"}: \`${r.value}\`${readable ? ` = ${readable}` : ""}`;
      })
      .join("<br>");
    const more = item.rows.length > 6 ? `<br>…共 ${item.rows.length} 条` : "";
    lines.push(`| ${item.base} | ${item.rows.length} | ${path} | ${values}${more} |`);
  }
  lines.push("");

  lines.push("## 清单中的非 DataStore 项（不参与比对）");
  lines.push("");
  lines.push("| 字段 | 来源 |");
  lines.push("|---|---|");
  for (const row of checklist.nonDataStore) lines.push(`| ${row.field} | ${row.source} |`);
  lines.push("");

  writeFileSync(outPath, lines.join("\n") + "\n");
  console.log(`覆盖度报告已写入 ${outPath}`);
  console.log(`  A 已覆盖 ${covered.length} · B 对不上 ${missingFromSnapshot.length} · C 清单缺口 ${missingFromChecklist.length} 个 key`);
}

main();

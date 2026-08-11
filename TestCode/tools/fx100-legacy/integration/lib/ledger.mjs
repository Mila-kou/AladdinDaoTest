// fork 层的账本流水落盘（`reports/ledger/<用例ID>.fork.csv`）。
//
// ## 为什么单独一个文件名后缀
//
// 同一条用例有两种执行形态，**账本 CSV 此前共用同一个文件名**：
//   合约层夹具 `test/shared/LedgerCsv.sol` 写 `reports/ledger/IT-POS-001.csv`
//   fork 层                              也想写 `reports/ledger/IT-POS-001.csv`
// 于是谁后跑谁覆盖——跑一次 `forge test` 就能把 fork 的真实对账数据抹掉，
// 而看板上那份 CSV 会带着夹具的常量（trader 10,000,000 USDC、size 5000e30）
// 挂在一条刚在 fork 上跑过的用例下面，**看起来像证据，其实是别的环境的数**。
//
// 步骤追踪早就用 `<ID>.csv` / `<ID>.fork.csv` 分开了（`trace.mjs` 开头），
// 账本这边一直没跟上。本文件补齐，两类产物的命名从此同构。
//
// ## 为什么不复用 `LedgerCsv.sol` 那套
//
// 表头是同一套（`reports/README.md`「账本 CSV 统一格式 v2」，13 列），底层写行也复用
// `tool/onchain-tx/lib/ledger.mjs` 的 `appendCsv`——本文件只负责**路径约定与生命周期**
// （开跑前清空、每步追加、守恒行收尾），不重造格式。

import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

import { PROJECT_ROOT } from "./env.mjs";
import {
  appendCsv,
  appendConservationRow,
  diff as ledgerDiff,
  checkConservation,
} from "../../tool/onchain-tx/lib/ledger.mjs";

export const LEDGER_DIR = join(PROJECT_ROOT, "reports/ledger");

/** fork 形态的账本流水路径。合约层是 `<ID>.csv`，两者不得同名（见文件头）。 */
export function forkLedgerPath(caseId) {
  return join(LEDGER_DIR, `${caseId}.fork.csv`);
}

/**
 * 开跑前清空同名旧流水。
 *
 * 与 `openTrace` 同律：`appendCsv` 是追加语义，不清就会把上一轮的行留在文件里，
 * 看板读到的是两轮混在一起的账——**行数对不上、Match 列真假掺杂**。
 */
export function resetForkLedger(caseId) {
  const path = forkLedgerPath(caseId);
  if (existsSync(path)) rmSync(path);
  return path;
}

/**
 * 落一步账本：逐槽位行 + 一行 ZERO_SUM，并在步骤流水里留一条「账本流水 <step>」互指。
 *
 * `expected` 只对传进来的槽位判 TRUE/FALSE，没传的 match 列留空——
 * **不拿「没核对」冒充「核对通过」**（`appendCsv` 的既有纪律）。
 *
 * @returns {{path:string, rows:number, deltas:object, conservation:object}}
 */
export function writeForkLedgerStep(t, { step, before, after, expected = {}, txHash = "", note = "" }) {
  const caseId = t.caseId;
  const path = forkLedgerPath(caseId);
  const deltas = ledgerDiff(before, after);
  const conservation = checkConservation(deltas);

  const rows = appendCsv(path, { caseId, step, before, after, deltas, txHash, expected, note });
  appendConservationRow(path, { caseId, step, conservation, before, after, txHash });

  t.ledgerStep(step, rows + 1, txHash);
  t.fact({ ledger: `reports/ledger/${caseId}.fork.csv` });
  return { path, rows: rows + 1, deltas, conservation };
}

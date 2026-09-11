import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { applyDeletedRecords, mergeLatestSnapshot, readDeletedRecords } from '../src/reporting/latest-snapshot.js';
import { readLatestSnapshot } from '../src/reporting/latest-snapshot.js';
import { validateTestRunArtifact, type TestRunArtifact } from '../src/reporting/schema.js';
import { writeRunOutputs } from '../src/reporting/write-outputs.js';

const runsDirectory = resolve(process.cwd(), 'artifacts/runs');
const latestDirectory = resolve(process.cwd(), 'artifacts/latest');
const runNames = (await readdir(runsDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

let snapshot: TestRunArtifact | undefined;
let acceptedRuns = 0;
for (const runName of runNames) {
  try {
    const source = await readFile(join(runsDirectory, runName, 'results.json'), 'utf8');
    const artifact = validateTestRunArtifact(JSON.parse(source) as unknown);
    // `playwright --list` 的历史误产物没有任何 TestResult，只包含 MISSING_RESULT；
    // 它们不是实际执行，恢复 latest 时必须忽略。
    if (artifact.results.length === 0
      && artifact.qualityIssues.length > 0
      && artifact.qualityIssues.every((issue) => issue.code === 'MISSING_RESULT')) {
      continue;
    }
    snapshot = mergeLatestSnapshot(snapshot, artifact);
    acceptedRuns += 1;
  } catch {
    // 旧版本或不完整报告不参与恢复；其它有效历史报告继续处理。
  }
}

// 已恢复或已汇总的证据优先保留，避免旧运行缺失临时附件时把 PASS 详情退回 BLOCKED。
const existingLatest = await readLatestSnapshot(latestDirectory);
if (existingLatest) {
  // 保留 latest 中可能由恢复工具补写的较新证据，但最终运行元数据和数据质量
  // 以历史有效执行汇总为准，不能再被 --list 的空运行污染。
  snapshot = snapshot
    ? mergeLatestSnapshot(existingLatest, snapshot)
    : existingLatest;
}

if (!snapshot) throw new Error('artifacts/runs 中没有可用的历史运行结果');
// 应用执行记录删除墓碑：已删除的 (id, project) 旧记录不得随历史重建复活。
snapshot = applyDeletedRecords(snapshot, await readDeletedRecords(process.cwd()));
const receipt = await writeRunOutputs(snapshot, latestDirectory);
console.log(`已从 ${acceptedRuns} 次历史运行恢复最近结果：${snapshot.results.length} 条`);
console.log(`主看板：${receipt.dashboardHtml}`);

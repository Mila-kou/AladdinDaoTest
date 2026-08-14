import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { validateTestRunArtifact, type ScenarioResult, type TestRunArtifact } from './schema.js';

function resultKey(result: ScenarioResult): string {
  return `${result.id}:${result.project}`;
}

function preferResult(previous: ScenarioResult | undefined, candidate: ScenarioResult): ScenarioResult {
  if (!previous) return candidate;
  // “只列用例”或项目条件跳过不应抹掉已经执行过的最近证据。
  if (candidate.status === 'SKIP' && previous.status !== 'SKIP') return previous;
  return Date.parse(candidate.executedAt) >= Date.parse(previous.executedAt) ? candidate : previous;
}

export function mergeLatestSnapshot(
  previous: TestRunArtifact | undefined,
  current: TestRunArtifact,
): TestRunArtifact {
  if (!previous) return current;
  const catalogIds = new Set(current.catalog.map((item) => item.id));
  const merged = new Map<string, ScenarioResult>();
  for (const result of [...previous.results, ...current.results]) {
    if (!catalogIds.has(result.id)) continue;
    const key = resultKey(result);
    merged.set(key, preferResult(merged.get(key), result));
  }
  const results = [...merged.values()].sort((left, right) =>
    left.id.localeCompare(right.id) || left.project.localeCompare(right.project));
  return {
    ...current,
    run: {
      ...current.run,
      environments: [...new Set(results.map((item) => item.environment))].sort(),
      projectNames: [...new Set(results.map((item) => item.project))].sort(),
      discoveredTests: results.length,
    },
    results,
  };
}

export async function readLatestSnapshot(outputDirectory: string): Promise<TestRunArtifact | undefined> {
  try {
    const parsed = JSON.parse(await readFile(join(outputDirectory, 'results.json'), 'utf8')) as unknown;
    return validateTestRunArtifact(parsed);
  } catch {
    return undefined;
  }
}

/**
 * 执行记录删除墓碑：只影响 latest 视图，artifacts/runs 历史档案永不改动。
 * 语义：匹配 (id, project) 且 executedAt <= deletedAt 的结果不再进入 latest；
 * 删除之后产生的新执行（executedAt > deletedAt）会自然重新出现。
 */
export interface DeletedExecutionRecord {
  readonly id: string;
  readonly project: string;
  readonly deletedAt: string;
  readonly note?: string;
}

export function deletedRecordsPath(projectRoot: string): string {
  return join(projectRoot, 'artifacts', 'deleted-records.json');
}

export async function readDeletedRecords(projectRoot: string): Promise<DeletedExecutionRecord[]> {
  try {
    const parsed = JSON.parse(await readFile(deletedRecordsPath(projectRoot), 'utf8')) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is DeletedExecutionRecord =>
      Boolean(entry) && typeof entry === 'object'
      && typeof (entry as DeletedExecutionRecord).id === 'string'
      && typeof (entry as DeletedExecutionRecord).project === 'string'
      && Number.isFinite(Date.parse((entry as DeletedExecutionRecord).deletedAt)));
  } catch {
    return [];
  }
}

export function applyDeletedRecords(
  snapshot: TestRunArtifact,
  deleted: readonly DeletedExecutionRecord[],
): TestRunArtifact {
  if (deleted.length === 0) return snapshot;
  const results = snapshot.results.filter((result) => !deleted.some((record) =>
    record.id === result.id && record.project === result.project
    && Date.parse(result.executedAt) <= Date.parse(record.deletedAt)));
  if (results.length === snapshot.results.length) return snapshot;
  return {
    ...snapshot,
    run: {
      ...snapshot.run,
      environments: [...new Set(results.map((item) => item.environment))].sort(),
      projectNames: [...new Set(results.map((item) => item.project))].sort(),
      discoveredTests: results.length,
    },
    results,
  };
}

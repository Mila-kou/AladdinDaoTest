import { readFile } from 'node:fs/promises';

import {
  scenarioCatalogItemSchema,
  type ScenarioCatalogItem,
} from './schema.js';
import { getSuiteName } from './suite-names.js';
import { applyCatalogOverrides } from './test-case-overrides.js';

const SCENARIO_ROW =
  /^\|\s*\[[^\]]*\]\s*\|\s*(SCN-\d{3})\s*\|\s*(S\d{2})\s+(.+?)\s*\|\s*(P[0-2])\s*\|/;

export async function loadScenarioCatalog(path: string): Promise<ScenarioCatalogItem[]> {
  const source = await readFile(path, 'utf8');
  const scenarios: ScenarioCatalogItem[] = [];

  for (const line of source.split(/\r?\n/)) {
    const match = SCENARIO_ROW.exec(line);
    if (!match) {
      continue;
    }

    scenarios.push(
      scenarioCatalogItemSchema.parse({
        id: match[1],
        suite: match[2],
        suiteName: getSuiteName(match[2] ?? ''),
        title: match[3]?.trim(),
        priority: match[4],
      }),
    );
  }

  if (scenarios.length === 0) {
    throw new Error(`场景目录没有解析到任何 SCN 行：${path}`);
  }

  return applyCatalogOverrides(scenarios.sort((a, b) => a.id.localeCompare(b.id)));
}

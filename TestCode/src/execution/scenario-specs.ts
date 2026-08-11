import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

export interface ScenarioSpec {
  readonly scenarioId: string;
  readonly absolutePath: string;
  readonly relativePath: string;
}

async function collectSpecFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectSpecFiles(path);
    return entry.isFile() && /^scn-\d{3}\.spec\.ts$/i.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

export async function discoverScenarioSpecs(projectRoot: string): Promise<Map<string, ScenarioSpec>> {
  const files = await collectSpecFiles(join(projectRoot, 'tests'));
  return new Map(files.map((absolutePath) => {
    const number = /scn-(\d{3})\.spec\.ts$/i.exec(absolutePath)?.[1];
    if (!number) throw new Error(`无法从测试文件名解析场景编号：${absolutePath}`);
    const scenarioId = `SCN-${number}`;
    return [scenarioId, {
      scenarioId,
      absolutePath,
      relativePath: relative(projectRoot, absolutePath),
    }];
  }));
}

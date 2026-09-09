import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { VERSION_CASE_ID } from '../reporting/version-cases.js';

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
    return entry.isFile() && entry.name.endsWith('.spec.ts') ? [path] : [];
  }));
  return nested.flat();
}

export async function discoverScenarioSpecs(projectRoot: string): Promise<Map<string, ScenarioSpec>> {
  const files = await collectSpecFiles(join(projectRoot, 'tests'));
  const specs = new Map<string, ScenarioSpec>();
  for (const absolutePath of files) {
    const number = /scn-(\d{3})\.spec\.ts$/i.exec(absolutePath)?.[1];
    const relativePath = relative(projectRoot, absolutePath);
    if (number) {
      const scenarioId = `SCN-${number}`;
      specs.set(scenarioId, { scenarioId, absolutePath, relativePath });
    }

    // 版本功能用例允许多条测试共用一个 spec（例如 tests/A/ct-base.spec.ts）。
    // 只扫描真正的 test(...) 声明，避免把注释中的待实现编号误判成已自动化。
    const source = await readFile(absolutePath, 'utf8');
    const declaration = /\btest(?:\.(?:only|skip|fixme))?\s*\(\s*(?:title\s*\(\s*)?[`'"]((?:CT|XT|FT)-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3})/g;
    for (const match of source.matchAll(declaration)) {
      const scenarioId = match[1];
      if (!scenarioId || !VERSION_CASE_ID.test(scenarioId)) continue;
      specs.set(scenarioId, { scenarioId, absolutePath, relativePath });
    }
  }
  return specs;
}

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ParameterReference } from '../src/reporting/reference-sources.js';
import { renderParametersHtml } from '../src/reporting/render-parameters.js';

const target = resolve(process.cwd(), process.argv[2] ?? 'artifacts/latest/parameters.html');
const current = await readFile(target, 'utf8');
const match = /<script id="parameter-data" type="application\/json">([\s\S]*?)<\/script>/.exec(current);
if (!match?.[1]) throw new Error(`参数页面缺少 parameter-data：${target}`);

const reference = JSON.parse(match[1]) as ParameterReference;
await writeFile(target, renderParametersHtml(reference, new Date().toISOString()), 'utf8');
console.log(`参数页面已更新：${target}`);

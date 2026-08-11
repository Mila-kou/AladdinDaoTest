import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { validateTestRunArtifact } from '../src/reporting/schema.js';
import { writeRunOutputs } from '../src/reporting/write-outputs.js';

const input = process.argv[2];
const output = process.argv[3];

if (!input) {
  console.error('Usage: npm run dashboard:build -- <results.json> [output-directory]');
  process.exitCode = 1;
} else {
  try {
    const inputPath = resolve(process.cwd(), input);
    const artifact = validateTestRunArtifact(JSON.parse(await readFile(inputPath, 'utf8')) as unknown);
    const outputDirectory = output
      ? resolve(process.cwd(), output)
      : dirname(inputPath);
    const receipt = await writeRunOutputs(artifact, outputDirectory);
    console.log({ status: 'BUILT', ...receipt });
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

import { renderDashboardHtml } from './render-dashboard.js';
import { attachExecutionEvidence } from './execution-evidence.js';
import { renderExecutionsHtml } from './render-executions.js';
import { renderEnvironmentsHtml } from './render-environments.js';
import { renderContractFormulasHtml, renderPageFormulasHtml } from './render-formulas.js';
import { renderMarkdownSummary } from './render-markdown.js';
import { metricDefinitions } from './metric-definitions.js';
import { renderParametersHtml } from './render-parameters.js';
import { renderRunBuilderHtml } from './render-run-builder.js';
import { renderTestCasesHtml } from './render-test-cases.js';
import { discoverScenarioSpecs } from '../execution/scenario-specs.js';
import { loadReferenceSources } from './reference-sources.js';
import { validateTestRunArtifact, type TestRunArtifact } from './schema.js';
import { applyCatalogExecutionModes } from './test-case-overrides.js';
import { attachExecutions, loadTestCases } from './test-cases.js';

export interface OutputReceipt {
  readonly outputDirectory: string;
  readonly resultsJson: string;
  readonly summaryMarkdown: string;
  readonly dashboardHtml: string;
  readonly executionsHtml: string;
  readonly parametersHtml: string;
  readonly formulasHtml: string;
  readonly pageFormulasHtml: string;
  readonly testCasesHtml: string;
  readonly runsHtml: string;
  readonly environmentsHtml: string;
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'attachment';
}

async function preserveAttachments(
  input: TestRunArtifact,
  outputDirectory: string,
): Promise<TestRunArtifact> {
  const attachmentDirectory = join(outputDirectory, 'attachments');
  await mkdir(attachmentDirectory, { recursive: true });
  const results = await Promise.all(input.results.map(async (result) => ({
    ...result,
    attempts: await Promise.all(result.attempts.map(async (attempt) => ({
      ...attempt,
      attachments: await Promise.all(attempt.attachments.map(async (attachment, index) => {
        if (!attachment.path) return attachment;
        const source = resolve(process.cwd(), attachment.path);
        const extension = extname(source);
        const attachmentStem = extension && attachment.name.endsWith(extension)
          ? attachment.name.slice(0, -extension.length)
          : attachment.name;
        const target = join(
          attachmentDirectory,
          `${result.id}-${safeFilePart(result.project)}-r${attempt.retry}-${index}-${safeFilePart(attachmentStem)}${extension}`,
        );
        try {
          if (source !== target) await copyFile(source, target);
          return { ...attachment, path: relative(process.cwd(), target) };
        } catch {
          // 老报告附件已不存在时保留原路径；结构化 executionEvidence 仍可继续展示。
          return attachment;
        }
      })),
    }))),
  })));
  return { ...input, results };
}

export async function writeRunOutputs(
  input: TestRunArtifact,
  outputDirectory: string,
): Promise<OutputReceipt> {
  const validated = validateTestRunArtifact(input);
  const withEvidence = validateTestRunArtifact(await attachExecutionEvidence({
    ...validated,
    // 指标数字在渲染时按当前代码重算，指标定义也必须同步刷新，
    // 否则重建历史报告会出现"数字用新口径、随页定义写旧口径"的分叉。
    source: { ...validated.source, metricDefinitions: { ...metricDefinitions } },
    catalog: await applyCatalogExecutionModes(validated.catalog),
  }));
  const artifact = validateTestRunArtifact(await preserveAttachments(withEvidence, outputDirectory));
  const catalogPath = resolve(process.cwd(), artifact.source.catalogPath);
  const [references, testCases, scenarioSpecs] = await Promise.all([
    loadReferenceSources(),
    loadTestCases(artifact.catalog, catalogPath),
    discoverScenarioSpecs(process.cwd()),
  ]);
  await mkdir(outputDirectory, { recursive: true });

  const resultsJson = join(outputDirectory, 'results.json');
  const summaryMarkdown = join(outputDirectory, 'summary.md');
  const dashboardHtml = join(outputDirectory, 'dashboard.html');
  const executionsHtml = join(outputDirectory, 'executions.html');
  const parametersHtml = join(outputDirectory, 'parameters.html');
  const formulasHtml = join(outputDirectory, 'formulas.html');
  const pageFormulasHtml = join(outputDirectory, 'page-formulas.html');
  const testCasesHtml = join(outputDirectory, 'test-cases.html');
  const runsHtml = join(outputDirectory, 'runs.html');
  const environmentsHtml = join(outputDirectory, 'environments.html');

  await Promise.all([
    writeFile(resultsJson, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8'),
    writeFile(summaryMarkdown, renderMarkdownSummary(artifact), 'utf8'),
    writeFile(dashboardHtml, renderDashboardHtml(artifact), 'utf8'),
    writeFile(executionsHtml, renderExecutionsHtml(artifact, testCases), 'utf8'),
    writeFile(parametersHtml, renderParametersHtml(references.parameters, artifact.source.generatedAt), 'utf8'),
    writeFile(formulasHtml, renderContractFormulasHtml(references.contractFormulas, artifact.source.generatedAt), 'utf8'),
    writeFile(pageFormulasHtml, renderPageFormulasHtml(references.pageFormulas, artifact.source.generatedAt), 'utf8'),
    writeFile(testCasesHtml, renderTestCasesHtml(attachExecutions(testCases, artifact.results), artifact.source.generatedAt), 'utf8'),
    writeFile(
      runsHtml,
      renderRunBuilderHtml(
        attachExecutions(testCases, artifact.results),
        Array.from(scenarioSpecs.keys()).sort(),
        artifact.source.generatedAt,
      ),
      'utf8',
    ),
    writeFile(environmentsHtml, renderEnvironmentsHtml(artifact.source.generatedAt), 'utf8'),
  ]);

  return {
    outputDirectory,
    resultsJson,
    summaryMarkdown,
    dashboardHtml,
    executionsHtml,
    parametersHtml,
    formulasHtml,
    pageFormulasHtml,
    testCasesHtml,
    runsHtml,
    environmentsHtml,
  };
}

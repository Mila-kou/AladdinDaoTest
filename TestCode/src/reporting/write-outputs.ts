import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

import { renderDashboardHtml } from './render-dashboard.js';
import { collectPositionKeyContexts } from './decode-chain-values.js';
import { renderDeploymentsHtml } from './render-deployments.js';
import { attachExecutionEvidence } from './execution-evidence.js';
import {
  renderExecutionsHtml,
  type ExecutionDeploymentView,
  type FunctionalAutomationCheck,
  type FunctionalAutomationEvidence,
  type FunctionalAutomationTransaction,
} from './render-executions.js';
import { renderEnvironmentsHtml } from './render-environments.js';
import { renderFaucetHtml } from './render-faucet.js';
import { renderContractFormulasHtml, renderPageFormulasHtml } from './render-formulas.js';
import { renderMarkdownSummary } from './render-markdown.js';
import { metricDefinitions } from './metric-definitions.js';
import { renderParametersHtml } from './render-parameters.js';
import { renderReconciliationConsoleHtml } from './render-reconciliation-console.js';
import { loadReconciliationLedger } from './reconciliation-fields.js';
import { renderRunBuilderHtml } from './render-run-builder.js';
import { renderTestCasesHtml } from './render-test-cases.js';
import { buildBaselineView } from '../config/baseline.js';
import { canonicalEvidenceEnvelopeSchema } from '../evidence/adapters/v2-to-v3.js';
import type { EvidenceEnvelope as CanonicalEvidenceEnvelope } from '../evidence/evidence-v3.js';
import { computeEvidenceDigest } from '../evidence/evidence-digest.js';
import {
  reconciliationReportSchema,
  type ReconciliationReport,
} from '../reconciliation/schema/check-record.js';
import { verifyReconciliationArtifact } from '../reconciliation/verify-report-artifact.js';
import { loadEnvironmentBinding } from '../config/environment-binding.js';
import { listMockMarketBundles, loadMockResourceRegistry } from '../config/mock-resources.js';
import { environmentNames, type EnvironmentName } from '../../config/environments/catalog.js';
import { readTradeSiteTarget } from '../server/environment-configuration.js';
import { discoverScenarioSpecs } from '../execution/scenario-specs.js';
import { loadReferenceSources } from './reference-sources.js';
import {
  isFunctionalResultId,
  validateTestRunArtifact,
  type ScenarioResult,
  type TestRunArtifact,
} from './schema.js';
import { applyCatalogExecutionModes } from './test-case-overrides.js';
import { attachExecutions, loadTestCases } from './test-cases.js';
import { buildVersionRunCaseDefinitions, loadVersionCases } from './version-cases.js';
import {
  explorerLinkStatus,
  findBlockExplorerBaseUrl,
  findForkDisplayName,
  resolveBlockExplorerBaseUrl,
  transactionExplorerUrl,
} from '../config/transaction-links.js';

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
  readonly deploymentsHtml: string;
  readonly faucetHtml: string;
  readonly reconciliationConsoleHtml: string;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

interface StoredRunBatch {
  readonly id?: string;
  readonly cases?: readonly {
    readonly id?: string;
    readonly resolvedEnvironment?: string;
    readonly resultRunId?: string;
  }[];
}

function resultProvenanceKey(id: string, project: string, executedAt: string): string {
  return `${id}\u0000${project}\u0000${executedAt}`;
}

/**
 * 历史 latest 结果早于 batchId 字段。通过只读批次登记和不可变 run 产物精确回填，
 * 必须同时匹配 id / project / executedAt，避免同一用例多次运行时串批次。
 */
async function attachStoredResultProvenance(input: TestRunArtifact): Promise<TestRunArtifact> {
  if (input.results.every((result) => result.batchId && result.resultRunId)) return input;
  const projectRoot = process.cwd();
  let directories: Dirent[];
  try {
    directories = await readdir(resolve(projectRoot, 'artifacts/run-batches'), { withFileTypes: true });
  } catch {
    return input;
  }
  const provenance = new Map<string, { batchId: string; resultRunId: string }>();
  for (const directory of directories) {
    if (!directory.isDirectory()) continue;
    try {
      const batch = JSON.parse(await readFile(
        resolve(projectRoot, 'artifacts/run-batches', directory.name, 'run.json'),
        'utf8',
      )) as StoredRunBatch;
      if (!batch.id) continue;
      for (const item of batch.cases ?? []) {
        if (!item.id || !item.resolvedEnvironment || !item.resultRunId) continue;
        const run = JSON.parse(await readFile(
          resolve(projectRoot, 'artifacts/runs', item.resultRunId, 'results.json'),
          'utf8',
        )) as { results?: unknown[] };
        const result = (run.results ?? []).find((candidate) => isRecord(candidate)
          && candidate.id === item.id
          && candidate.project === item.resolvedEnvironment
          && typeof candidate.executedAt === 'string');
        if (!isRecord(result) || typeof result.executedAt !== 'string') continue;
        provenance.set(
          resultProvenanceKey(item.id, item.resolvedEnvironment, result.executedAt),
          { batchId: batch.id, resultRunId: item.resultRunId },
        );
      }
    } catch {
      // 老批次可能缺文件或结构不完整；保持其结果没有批次来源，不做模糊推断。
    }
  }
  return validateTestRunArtifact({
    ...input,
    results: input.results.map((result) => {
      if (result.batchId && result.resultRunId) return result;
      const found = provenance.get(resultProvenanceKey(result.id, result.project, result.executedAt));
      return found ? { ...result, ...found } : result;
    }),
  });
}

function storedFunctionalResultKey(result: ScenarioResult): string {
  return `${result.id}\u0000${result.project}\u0000${result.executedAt}`;
}

/**
 * latest 只保留每个用例最近一次结果；执行详情的“批次 ID”筛选需要读取已登记批次的
 * 不可变 run 结果，否则下一次执行同一用例后旧批次会从筛选框消失。
 */
async function attachFunctionalBatchHistory(input: TestRunArtifact): Promise<TestRunArtifact> {
  let directories: Dirent[];
  try {
    directories = await readdir(resolve(process.cwd(), 'artifacts/run-batches'), { withFileTypes: true });
  } catch {
    return input;
  }
  const functional = new Map<string, ScenarioResult>();
  for (const directory of directories) {
    if (!directory.isDirectory() || !/^[A-Za-z0-9._-]+$/.test(directory.name)) continue;
    try {
      const batch = JSON.parse(await readFile(
        resolve(process.cwd(), 'artifacts/run-batches', directory.name, 'run.json'),
        'utf8',
      )) as StoredRunBatch;
      if (!batch.id) continue;
      for (const item of batch.cases ?? []) {
        if (!item.id || !isFunctionalResultId(item.id) || !item.resolvedEnvironment || !item.resultRunId
          || !/^[A-Za-z0-9._-]+$/.test(item.resultRunId)) continue;
        const stored = validateTestRunArtifact(JSON.parse(await readFile(
          resolve(process.cwd(), 'artifacts/runs', item.resultRunId, 'results.json'),
          'utf8',
        )) as unknown);
        const result = stored.results.find((candidate) => candidate.id === item.id
          && candidate.project === item.resolvedEnvironment);
        if (!result) continue;
        const historical = { ...result, batchId: batch.id, resultRunId: item.resultRunId };
        functional.set(storedFunctionalResultKey(historical), historical);
      }
    } catch {
      // 未完成/已清理的批次可能没有对应 run；只跳过该登记，不做模糊匹配。
    }
  }
  for (const result of input.results) {
    if (isFunctionalResultId(result.id)) functional.set(storedFunctionalResultKey(result), result);
  }
  const historicalFunctionalResults = Array.from(functional.values())
    .sort((left, right) => right.executedAt.localeCompare(left.executedAt));
  return validateTestRunArtifact({
    ...input,
    results: [
      ...input.results.filter((result) => !isFunctionalResultId(result.id)),
      ...historicalFunctionalResults,
    ],
  });
}

const TRANSACTION_HASH = /^0x[0-9a-fA-F]{64}$/;

function functionalTransactionLabel(path: readonly string[]): string {
  const joined = path.join('.');
  if (/oracleRefresh\.0(?:\.|$)/.test(joined)) return '更新 Index Oracle';
  if (/oracleRefresh\.1(?:\.|$)/.test(joined)) return '更新抵押品 Oracle';
  if (/priceMove/.test(joined)) return '推动 Oracle 价格';
  if (/openTriggerPush/.test(joined)) return '推动开仓触发价格';
  if (/closeTriggerPush/.test(joined)) return '推动平仓触发价格';
  if (/createOpen/.test(joined)) return '创建开仓订单';
  if (/executeOpen/.test(joined)) return '执行开仓订单';
  if (/createClose/.test(joined)) return '创建平仓订单';
  if (/executeClose/.test(joined)) return '执行平仓订单';
  if (/createOrder/i.test(joined)) return '创建订单';
  if (/executeOrder/i.test(joined)) return '执行订单';
  return path.filter((part) => !/^\d+$/.test(part) && !/^(transaction|receipt|event)$/.test(part))
    .slice(-2).join(' › ') || '链上交易';
}

function functionalTransactionActionKey(path: readonly string[]): string {
  const joined = path.join('.');
  if (/oracleRefresh\.0(?:\.|$)/.test(joined)) return 'oracle-index';
  if (/oracleRefresh\.1(?:\.|$)/.test(joined)) return 'oracle-collateral';
  if (/priceMove/.test(joined)) return 'priceMove';
  if (/openTriggerPush/.test(joined)) return 'openTriggerPush';
  if (/closeTriggerPush/.test(joined)) return 'closeTriggerPush';
  if (/createOpen/.test(joined)) return 'createOpen';
  if (/executeOpen/.test(joined)) return 'executeOpen';
  if (/createClose/.test(joined)) return 'createClose';
  if (/executeClose/.test(joined)) return 'executeClose';
  if (/createOrder/i.test(joined)) return 'createOrder';
  if (/executeOrder/i.test(joined)) return 'executeOrder';
  return path.filter((part) => !/^\d+$/.test(part)).slice(-2).join(':') || 'transaction';
}

const TRADE_ACTION_KEYS = ['createOpen', 'executeOpen', 'createClose', 'executeClose'] as const;

/**
 * 旧版功能证据只有断言名称，没有 txStep。这里补出阶段关系，保证历史批次也可按交易动作查看。
 * 新证据若直接保存 actionKeys，则优先使用显式关系。
 */
function inferFunctionalCheckActionKeys(name: string): readonly string[] {
  if (/Oracle.*时间戳|刷新.*Oracle|Index Oracle/i.test(name)) return ['oracle-index', 'oracle-collateral'];
  if (/OrderCreated|开仓创建|创建开仓/.test(name)) return ['createOpen'];
  if (/全平创建|平仓创建|创建平仓/.test(name)) return ['createClose'];
  if (/全平|平仓|PositionDecrease|trader USDC|close/i.test(name)) return ['executeClose'];
  if (/OrderExecuted|PositionIncrease|开仓后|开仓执行|PositionFeesCollected|positionFeeAmount|uiFee|OI\(|OPEN_INTEREST|ask\/不利侧/.test(name)) return ['executeOpen'];
  if (/runner 链上断言/.test(name)) return ['oracle-index', 'oracle-collateral', ...TRADE_ACTION_KEYS];
  if (/四笔交易|两笔用户交易|两笔执行交易|五方守恒/.test(name)) return TRADE_ACTION_KEYS;
  return [];
}

function childRecord(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const child = value[key];
  return isRecord(child) ? child : undefined;
}

/** 只读整理交易概要所需字段；不参与断言、状态或数据核对计算。 */
function extractFunctionalActionData(parsed: Record<string, unknown>): Record<string, unknown> | undefined {
  const runnerEvidence = childRecord(parsed, 'evidence');
  if (!runnerEvidence) return undefined;
  const events = childRecord(runnerEvidence, 'events');
  const openEvents = childRecord(events, 'open');
  const closeEvents = childRecord(events, 'close');
  const positionIncrease = childRecord(openEvents, 'PositionIncrease');
  const positionDecrease = childRecord(closeEvents, 'PositionDecrease');
  const openUint = childRecord(positionIncrease, 'uint');
  const openInt = childRecord(positionIncrease, 'int');
  const openBytes32 = childRecord(positionIncrease, 'bytes32');
  const closeUint = childRecord(positionDecrease, 'uint');
  const closeInt = childRecord(positionDecrease, 'int');
  const closeBytes32 = childRecord(positionDecrease, 'bytes32');
  const transactions = childRecord(runnerEvidence, 'transactions');
  const createOpen = childRecord(transactions, 'createOpen');
  const createClose = childRecord(transactions, 'createClose');
  const observations = childRecord(runnerEvidence, 'observations');
  return {
    createOpen: {
      orderKey: createOpen?.orderKey,
    },
    executeOpen: {
      executionPrice: openUint?.executionPrice,
      indexPriceMin: openUint?.['indexTokenPrice.min'],
      indexPriceMax: openUint?.['indexTokenPrice.max'],
      dynamicSpread: openInt?.dynamicSpread,
      sizeDeltaUsd: openUint?.sizeDeltaUsd,
      orderKey: openBytes32?.orderKey,
    },
    createClose: {
      orderKey: createClose?.orderKey,
    },
    executeClose: {
      executionPrice: closeUint?.executionPrice,
      indexPriceMin: closeUint?.['indexTokenPrice.min'],
      indexPriceMax: closeUint?.['indexTokenPrice.max'],
      dynamicSpread: closeInt?.dynamicSpread,
      sizeDeltaUsd: closeUint?.sizeDeltaUsd,
      basePnlUsd: closeInt?.basePnlUsd,
      orderKey: closeBytes32?.orderKey,
      traderUsdcDelta: observations?.traderUsdcDelta,
    },
  };
}

function collectFunctionalTransactions(
  value: unknown,
  projectRoot: string,
  explorerBaseUrl?: string,
): FunctionalAutomationTransaction[] {
  const found = new Map<string, { item: FunctionalAutomationTransaction; score: number }>();
  const visit = (current: unknown, path: string[]): void => {
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, [...path, String(index)]));
      return;
    }
    if (!isRecord(current)) return;

    const hashEntries = Object.entries(current).filter(([key, candidate]) =>
      typeof candidate === 'string'
      && TRANSACTION_HASH.test(candidate)
      && (key === 'txHash' || key === 'transactionHash' || /TxHash$/.test(key)
        || (key === 'hash' && ('from' in current || 'to' in current))),
    );
    for (const hashEntry of hashEntries) {
      if (typeof hashEntry[1] !== 'string') continue;
      const [hashKey, hash] = hashEntry;
      const stringField = (key: string): string | undefined => {
        const field = current[key];
        return typeof field === 'string' || typeof field === 'number' ? String(field) : undefined;
      };
      const blockNumber = stringField('blockNumber');
      const transactionStatus = stringField('status');
      const from = stringField('from');
      const to = stringField('to');
      const companionUrlKey = /TxHash$/.test(hashKey)
        ? `${hashKey.slice(0, -'TxHash'.length)}TransactionUrl`
        : 'transactionUrl';
      const savedUrl = stringField(companionUrlKey);
      const url = savedUrl && /^https:\/\//.test(savedUrl)
        ? savedUrl
        : explorerBaseUrl ? transactionExplorerUrl(explorerBaseUrl, hash) : undefined;
      const linkStatus = explorerLinkStatus(projectRoot, url);
      const item: FunctionalAutomationTransaction = {
        label: functionalTransactionLabel(path),
        hash,
        actionKey: functionalTransactionActionKey(path),
        linkStatus,
        ...(url && linkStatus === 'available' ? { url } : {}),
        ...(blockNumber ? { blockNumber } : {}),
        ...(transactionStatus ? { status: transactionStatus } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      };
      const score = Number(Boolean(item.blockNumber)) + Number(Boolean(item.status))
        + Number(Boolean(item.from)) * 2 + Number(Boolean(item.to)) * 2;
      const key = hash.toLowerCase();
      if (!found.has(key) || score > found.get(key)!.score) found.set(key, { item, score });
    }
    for (const [key, child] of Object.entries(current)) {
      // Legacy attachments predate typed Evidence. Keep their permissive transaction
      // discovery, but never treat V3 block-window scan facts as business actions.
      if (key === 'windowContamination'
        || key === 'inspectedBlocks'
        || /^(?:inspected|unexpected|scanned)Transactions$/i.test(key)) continue;
      visit(child, [...path, key]);
    }
  };
  visit(value, []);
  const block = (item: FunctionalAutomationTransaction): bigint | undefined => {
    if (!item.blockNumber) return undefined;
    try { return BigInt(item.blockNumber); } catch { return undefined; }
  };
  return Array.from(found.values(), ({ item }) => item).sort((left, right) => {
    const leftBlock = block(left);
    const rightBlock = block(right);
    if (leftBlock === undefined && rightBlock === undefined) return 0;
    if (leftBlock === undefined) return 1;
    if (rightBlock === undefined) return -1;
    return leftBlock < rightBlock ? -1 : leftBlock > rightBlock ? 1 : 0;
  });
}

/** 读取功能用例 runner 保存的逐项核对证据，供执行详情直接展示 Actual / Expected。 */
function functionalAutomationEvidenceKey(result: ScenarioResult): string {
  return `${result.id}:${result.project}:${result.batchId ?? result.resultRunId ?? result.executedAt}`;
}

type FunctionalEvidenceAttachment = ScenarioResult['attempts'][number]['attachments'][number];

function isFunctionalEvidenceAttachment(item: FunctionalEvidenceAttachment): boolean {
  return item.contentType === 'application/json'
    && /(?:^|-)(?:ct|xt|ft)-.+-evidence\.json$/i.test(item.name)
    && Boolean(item.path);
}

/** Select only the final Playwright retry, never stale evidence from an earlier failure. */
export function selectFinalFunctionalEvidenceAttachment(
  result: ScenarioResult,
): FunctionalEvidenceAttachment | undefined {
  let finalAttempt = result.attempts[0];
  for (const attempt of result.attempts.slice(1)) {
    if (!finalAttempt || attempt.retry >= finalAttempt.retry) finalAttempt = attempt;
  }
  if (!finalAttempt) return undefined;
  for (let index = finalAttempt.attachments.length - 1; index >= 0; index -= 1) {
    const attachment = finalAttempt.attachments[index];
    if (attachment && isFunctionalEvidenceAttachment(attachment)) return attachment;
  }
  return undefined;
}

interface StructuredEvidenceSelection {
  readonly claimed: boolean;
  readonly label: 'evidenceV3' | 'evidenceV2' | 'bare-envelope' | 'missing';
  readonly payload?: unknown;
}

const BARE_EVIDENCE_ENVELOPE_KEYS = [
  'schemaVersion', 'caseId', 'variantId', 'executionId', 'flowType',
  'capabilities', 'environment', 'actions', 'startedAt', 'endedAt',
] as const;

function pickBareEvidenceEnvelope(parsed: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(BARE_EVIDENCE_ENVELOPE_KEYS
    .filter((key) => Object.hasOwn(parsed, key))
    .map((key) => [key, parsed[key]]));
}

function selectStructuredEvidence(parsed: Record<string, unknown>): StructuredEvidenceSelection {
  // Property presence, rather than nullish fallback, is intentional. Once a producer
  // claims V3, a malformed V3 payload must not be hidden by a valid legacy V2 sibling.
  if (Object.hasOwn(parsed, 'evidenceV3')) {
    return { claimed: true, label: 'evidenceV3', payload: parsed.evidenceV3 };
  }
  if (Object.hasOwn(parsed, 'evidenceV2')) {
    return { claimed: true, label: 'evidenceV2', payload: parsed.evidenceV2 };
  }
  if (Object.hasOwn(parsed, 'schemaVersion') && Object.hasOwn(parsed, 'actions')) {
    // A bare envelope may share the attachment root with its report and display
    // metadata. Parse exactly the envelope projection so V3 strictness does not
    // mistake those Reporter siblings for Evidence fields.
    return { claimed: true, label: 'bare-envelope', payload: pickBareEvidenceEnvelope(parsed) };
  }
  return { claimed: false, label: 'missing' };
}

const LEGACY_ROUNDTRIP_SHAPE = [
  { sequence: 1, type: 'submitMarketIncrease', purpose: 'primary', key: 'createOpen' },
  { sequence: 2, type: 'executeOrder', purpose: 'primary', key: 'executeOpen' },
  { sequence: 3, type: 'submitMarketDecrease', purpose: 'cleanup', key: 'createClose' },
  { sequence: 4, type: 'executeOrder', purpose: 'cleanup', key: 'executeClose' },
] as const;

function isStrictFourActionRoundtrip(evidence: CanonicalEvidenceEnvelope): boolean {
  return evidence.flowType === 'roundtrip'
    && evidence.actions.length === LEGACY_ROUNDTRIP_SHAPE.length
    && evidence.actions.every((action, index) => {
      const expected = LEGACY_ROUNDTRIP_SHAPE[index];
      if (!expected) return false;
      return action.sequence === expected.sequence
        && action.type === expected.type
        && action.purpose === expected.purpose;
    });
}

function canonicalActionKeyById(evidence: CanonicalEvidenceEnvelope): ReadonlyMap<string, string> {
  const legacyRoundtrip = isStrictFourActionRoundtrip(evidence);
  return new Map(evidence.actions.map((action, index) => [
    action.actionId,
    legacyRoundtrip
      ? LEGACY_ROUNDTRIP_SHAPE[index]!.key
      : `${action.actionId}:${action.type}`,
  ]));
}

function canonicalActionLabel(
  action: CanonicalEvidenceEnvelope['actions'][number],
  actionKey: string,
): string {
  const legacyLabels: Readonly<Record<string, string>> = {
    createOpen: '创建开仓订单',
    executeOpen: '执行开仓订单',
    createClose: '创建平仓订单',
    executeClose: '执行平仓订单',
  };
  if (legacyLabels[actionKey]) return legacyLabels[actionKey];
  const actionTypeLabels: Readonly<Record<string, string>> = {
    submitMarketIncrease: '提交增加仓位订单',
    submitMarketDecrease: '提交减少仓位订单',
    executeOrder: '执行订单',
    placeLimit: '提交限价订单',
    addTpSl: '添加止盈止损',
    movePrice: '移动价格',
    advanceTime: '推进时间',
  };
  return `${action.actionId} · ${actionTypeLabels[action.type] ?? action.type}`;
}

function canonicalFunctionalTransactions(
  evidence: CanonicalEvidenceEnvelope,
  projectRoot: string,
  actionKeyById: ReadonlyMap<string, string>,
): FunctionalAutomationTransaction[] {
  // Deliberately read only declared Action transactions. windowContamination scan
  // entries are evidence about isolation, not business transactions in the timeline.
  return evidence.actions.flatMap((action) => action.transactions.map((transaction) => {
    const savedUrl = transaction.explorer?.transactionUrl;
    const linkStatus = explorerLinkStatus(projectRoot, savedUrl);
    const actionKey = actionKeyById.get(action.actionId) ?? `${action.actionId}:${action.type}`;
    return {
      label: canonicalActionLabel(action, actionKey),
      hash: transaction.txHash,
      actionKey,
      linkStatus,
      ...(savedUrl && linkStatus === 'available' ? { url: savedUrl } : {}),
      blockNumber: transaction.blockNumber,
      status: transaction.status,
      from: transaction.actor,
      ...(transaction.to ? { to: transaction.to } : {}),
    };
  }));
}

function canonicalFunctionalChecks(
  report: ReconciliationReport,
  actionKeyById: ReadonlyMap<string, string>,
): FunctionalAutomationEvidence['checks'] {
  return report.checks.map((item) => ({
    name: item.id,
    passed: item.verdict === 'PASS',
    status: item.verdict,
    kind: item.formula || item.expectedDelta ? 'calculation' as const : 'assertion' as const,
    actual: item.actual.display ?? item.actual.raw,
    expected: item.expected.display ?? item.expected.raw,
    verification: item.verification,
    sources: item.sources.map((source) => `${source.layer}:${source.path}`),
    ...(item.before ? { before: item.before.display ?? item.before.raw } : {}),
    ...(item.after ? { after: item.after.display ?? item.after.raw } : {}),
    ...(item.actualDelta ? { delta: item.actualDelta.display ?? item.actualDelta.raw } : {}),
    ...(item.expectedDelta ? { expectedDelta: item.expectedDelta.display ?? item.expectedDelta.raw } : {}),
    ...(item.expectedAfter ? { expectedAfter: item.expectedAfter.display ?? item.expectedAfter.raw } : {}),
    ...(item.formula ? { formula: `${item.formula.id}@${item.formula.version}：${item.formula.expanded}` } : {}),
    ...(item.note ? { note: item.note } : {}),
    actionKeys: item.actionId === 'WHOLE' ? [] : [actionKeyById.get(item.actionId) ?? item.actionId],
  }));
}

interface CompatibilityReconciliationCheck {
  readonly check: ReconciliationReport['checks'][number];
  readonly index: number;
  consumed: boolean;
}

function buildReconciliationCheckLookup(
  reportChecks: readonly ReconciliationReport['checks'][number][],
): {
  takeByName: (name: string) => ReconciliationReport['checks'][number] | undefined;
  takeByActionKeys: (actionKeys: readonly string[]) => ReconciliationReport['checks'][number] | undefined;
  takeByIndex: (index: number) => ReconciliationReport['checks'][number] | undefined;
  getAll: () => readonly CompatibilityReconciliationCheck[];
} {
  const items: CompatibilityReconciliationCheck[] = reportChecks.map((check, index) => ({ check, index, consumed: false }));
  const normalize = (value: unknown): string => String(value ?? '')
    .trim().toLowerCase()
    .replace(/[\s._-]/g, '')
    .replace(/[:：（）()]/g, '');
  const byName = new Map<string, CompatibilityReconciliationCheck[]>();
  const byAction = new Map<string, CompatibilityReconciliationCheck[]>();
  for (const item of items) {
    const normalizedName = normalize(item.check.id);
    if (!byName.has(normalizedName)) byName.set(normalizedName, []);
    byName.get(normalizedName)!.push(item);
    if (item.check.actionId) {
      const key = normalize(item.check.actionId);
      if (!byAction.has(key)) byAction.set(key, []);
      byAction.get(key)!.push(item);
    }
  }
  const take = (bucket: CompatibilityReconciliationCheck[] | undefined) => {
    if (!bucket) return undefined;
    const found = bucket.find((item) => !item.consumed);
    if (!found) return undefined;
    found.consumed = true;
    return found.check;
  };
  return {
    takeByName(name: string) {
      const normalized = normalize(name);
      const direct = take(byName.get(normalized));
      if (direct) return direct;
      const candidates = Array.from(byName.entries()).find(([key]) => key.includes(normalized) || normalized.includes(key));
      return candidates ? take(candidates[1]) : undefined;
    },
    takeByActionKeys(actionKeys: readonly string[]) {
      for (const key of actionKeys) {
        const direct = take(byAction.get(normalize(key)));
        if (direct) return direct;
      }
      return undefined;
    },
    takeByIndex(index: number) {
      const item = items[index];
      if (!item || item.consumed) return undefined;
      item.consumed = true;
      return item.check;
    },
    getAll: () => items,
  };
}

function mapCompatibilityReconciliationCheck(
  report: ReconciliationReport,
  compatibilityCheck: ReconciliationReport['checks'][number],
): Partial<Pick<FunctionalAutomationCheck, 'formula' | 'note' | 'verification' | 'sources' | 'before' | 'after' | 'delta' | 'expectedDelta' | 'expectedAfter'>> {
  return {
    ...(compatibilityCheck.formula ? { formula: `${compatibilityCheck.formula.id}@${compatibilityCheck.formula.version}：${compatibilityCheck.formula.expanded}` } : {}),
    verification: compatibilityCheck.verification,
    sources: compatibilityCheck.sources.map((source) => `${source.layer}:${source.path}`),
    ...(compatibilityCheck.before ? { before: compatibilityCheck.before.display ?? compatibilityCheck.before.raw } : {}),
    ...(compatibilityCheck.after ? { after: compatibilityCheck.after.display ?? compatibilityCheck.after.raw } : {}),
    ...(compatibilityCheck.actualDelta ? { delta: compatibilityCheck.actualDelta.display ?? compatibilityCheck.actualDelta.raw } : {}),
    ...(compatibilityCheck.expectedDelta ? { expectedDelta: compatibilityCheck.expectedDelta.display ?? compatibilityCheck.expectedDelta.raw } : {}),
    ...(compatibilityCheck.expectedAfter ? { expectedAfter: compatibilityCheck.expectedAfter.display ?? compatibilityCheck.expectedAfter.raw } : {}),
    note: [
      compatibilityCheck.note,
      `verification=${compatibilityCheck.verification}`,
      compatibilityCheck.sources.length
        ? `sources=${compatibilityCheck.sources.map((source) => `${source.layer}:${source.path}`).join('；')}`
        : '',
    ].filter(Boolean).join('；'),
  };
}

function buildCompatibilityChecks(
  source: unknown,
  report: ReconciliationReport | undefined,
  reportLookup: {
    takeByName: (name: string) => ReconciliationReport['checks'][number] | undefined;
    takeByActionKeys: (actionKeys: readonly string[]) => ReconciliationReport['checks'][number] | undefined;
    takeByIndex: (index: number) => ReconciliationReport['checks'][number] | undefined;
    getAll: () => readonly CompatibilityReconciliationCheck[];
  } | undefined,
  sourceLabel: 'checks' | 'assertions',
): FunctionalAutomationEvidence['checks'] {
  if (!Array.isArray(source)) return [];
  return source.filter(isRecord).flatMap((item, index) => {
    if (typeof item.name !== 'string' || typeof item.passed !== 'boolean') return [];
    const explicitActionKeys = Array.isArray(item.actionKeys)
      ? item.actionKeys.filter((value): value is string => typeof value === 'string')
      : typeof item.txStep === 'string' ? [item.txStep] : [];
    const reportHint = reportLookup
      ? reportLookup.takeByName(item.name)
          || reportLookup.takeByActionKeys(explicitActionKeys)
          || reportLookup.takeByIndex(index)
      : undefined;
    const reportFields = report && reportHint
      ? mapCompatibilityReconciliationCheck(report, reportHint)
      : {};
    const compatibilitySummary = reportHint
      ? ''
      : reportLookup
        ? `未匹配到对应 ${sourceLabel} 解析项（名称/动作）在 ReconciliationReport 的同名记录`
        : '';
    return [{
      name: item.name,
      passed: item.passed,
      status: item.passed ? 'PASS' as const : 'FAIL' as const,
      actual: item.actual,
      expected: item.expected,
      ...reportFields,
      ...(typeof item.note === 'string'
        ? {
            note: String(item.note) + (reportFields.note ? `；${reportFields.note}` : '') + (compatibilitySummary ? `；${compatibilitySummary}` : ''),
          }
        : compatibilitySummary
          ? { note: compatibilitySummary }
          : {}),
      actionKeys: explicitActionKeys.length ? explicitActionKeys : inferFunctionalCheckActionKeys(item.name),
    }];
  });
}

function schemaIssueSummary(
  label: string,
  issues: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[],
): string[] {
  return issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.map(String).join('.') : '<root>';
    return `${label} ${path}: ${issue.message}`;
  });
}

function invalidStructuredFunctionalEvidence(input: {
  readonly parsed: Record<string, unknown>;
  readonly result: ScenarioResult;
  readonly sourcePath: string;
  readonly diagnostics: readonly string[];
  readonly canonicalEvidence?: CanonicalEvidenceEnvelope;
  readonly projectRoot: string;
  readonly fallbackChecks?: FunctionalAutomationEvidence['checks'];
}): FunctionalAutomationEvidence {
  const actionKeyById = input.canonicalEvidence
    ? canonicalActionKeyById(input.canonicalEvidence)
    : new Map<string, string>();
  const transactions = input.canonicalEvidence
    ? canonicalFunctionalTransactions(input.canonicalEvidence, input.projectRoot, actionKeyById)
    : [];
  const diagnostic = input.diagnostics.join('\n');
  const fallbackChecks = input.fallbackChecks ?? [];
  const integrityWarning = fallbackChecks.length
    ? `已展示解析出的对齐核对明细，当前 Evidence/Report 仍存在结构化完整性告警：\n${diagnostic}`
    : diagnostic;
  return {
    id: input.result.id,
    title: typeof input.parsed.title === 'string' ? input.parsed.title : input.result.scenarioTitle,
    checks: (fallbackChecks.length ? [{
      name: 'evidence.integrity.structured-pair',
      passed: false,
      status: 'FAIL',
      actual: integrityWarning,
      expected: 'Evidence 与 ReconciliationReport V2 均通过当前 schema，caseId / variantId / executionId 一致，evidenceDigest 精确绑定，且 Report integrity / layers / status 自洽',
      note: '结构化证据校验未通过；已回退到可展示的核对明细，便于快速排查。请在重新生成时修正校验链路。',
      actionKeys: [],
    }, ...fallbackChecks] : [{
      name: 'evidence.integrity.structured-pair',
      passed: false,
      status: 'FAIL',
      actual: diagnostic,
      expected: 'Evidence 与 ReconciliationReport V2 均通过当前 schema，caseId / variantId / executionId 一致，evidenceDigest 精确绑定，且 Report integrity / layers / status 自洽',
      note: '结构化证据无效；Reporter 未重算业务结论，也未回退读取 root checks。请用当前核对引擎重新生成 ReconciliationReport。',
      actionKeys: [],
    }]),
    transactions,
    positionKeyContexts: collectPositionKeyContexts(input.canonicalEvidence ?? input.parsed),
    ...(input.canonicalEvidence ? { data: input.canonicalEvidence } : {}),
    sourcePath: input.sourcePath,
    reportStatus: 'INVALID_EVIDENCE',
    layerVerdicts: {
      'chain-state': 'NOT_RUN',
      'chain-event': 'NOT_RUN',
      keeper: 'NOT_RUN',
      indexer: 'NOT_RUN',
      frontend: 'NOT_RUN',
      cleanup: 'NOT_RUN',
      evidenceIntegrity: 'FAIL',
    },
  };
}

/**
 * Decode one functional attachment and delegate trust verification to the
 * reconciliation layer. Rendering itself never owns formulas or verdict rules.
 * Exported for the Reporter contract verification script.
 */
export function decodeFunctionalAutomationEvidenceAttachment(
  parsedInput: unknown,
  result: ScenarioResult,
  sourcePath: string,
  projectRoot = process.cwd(),
): FunctionalAutomationEvidence | null {
  if (!isRecord(parsedInput)) return null;
  const parsed = parsedInput;
  const savedExplorerBaseUrl = findBlockExplorerBaseUrl(parsed);
  const explorerBaseUrl = savedExplorerBaseUrl
    ? explorerLinkStatus(projectRoot, savedExplorerBaseUrl) === 'available'
      ? savedExplorerBaseUrl
      : undefined
    : resolveBlockExplorerBaseUrl(
        projectRoot,
        result.project,
        undefined,
        findForkDisplayName(parsed),
      );

  const evidenceSelection = selectStructuredEvidence(parsed);
  const reportClaimed = Object.hasOwn(parsed, 'reconciliationReport');
  const structuredClaimed = evidenceSelection.claimed || reportClaimed;
  if (structuredClaimed) {
    const canonicalEvidence = canonicalEvidenceEnvelopeSchema.safeParse(evidenceSelection.payload);
    const canonicalReport = reconciliationReportSchema.safeParse(parsed.reconciliationReport);
    const diagnostics: string[] = [];
    if (!evidenceSelection.claimed) {
      diagnostics.push('缺少 evidenceV3 / evidenceV2 / 裸 EvidenceEnvelope');
    } else if (!canonicalEvidence.success) {
      diagnostics.push(...schemaIssueSummary(
        `${evidenceSelection.label} schema`,
        canonicalEvidence.error.issues,
      ));
    }
    if (isRecord(evidenceSelection.payload)) {
      const claimedVersion = evidenceSelection.payload.schemaVersion;
      if (evidenceSelection.label === 'evidenceV3' && claimedVersion !== 3) {
        diagnostics.push(`evidenceV3 wrapper 要求 schemaVersion=3，实际为 ${String(claimedVersion)}`);
      }
      if (evidenceSelection.label === 'evidenceV2' && claimedVersion !== 2) {
        diagnostics.push(`evidenceV2 wrapper 要求 schemaVersion=2，实际为 ${String(claimedVersion)}`);
      }
    }
    if (!reportClaimed) {
      diagnostics.push('缺少 reconciliationReport；裸 EvidenceEnvelope 不能单独代表核对结论');
    } else if (!canonicalReport.success) {
      if (isRecord(parsed.reconciliationReport) && parsed.reconciliationReport.schemaVersion === 1) {
        diagnostics.push('ReconciliationReport schemaVersion=1 是未绑定 Evidence digest 的历史报告，必须用当前核对引擎重新生成 V2 Report');
      }
      diagnostics.push(...schemaIssueSummary('reconciliationReport schema', canonicalReport.error.issues));
    }

    if (canonicalEvidence.success && canonicalReport.success) {
      const identityFields = ['caseId', 'variantId', 'executionId'] as const;
      for (const field of identityFields) {
        if (canonicalEvidence.data[field] !== canonicalReport.data[field]) {
          diagnostics.push(
            `Evidence.${field}=${canonicalEvidence.data[field]} 与 ReconciliationReport.${field}=${canonicalReport.data[field]} 不一致`,
          );
        }
      }
      if (canonicalEvidence.data.caseId !== result.id) {
        diagnostics.push(`Evidence.caseId=${canonicalEvidence.data.caseId} 与运行结果 id=${result.id} 不一致`);
      }
      if (canonicalEvidence.data.environment.name !== result.project) {
        diagnostics.push(
          `Evidence.environment.name=${canonicalEvidence.data.environment.name} 与运行结果 project=${result.project} 不一致`,
        );
      }
      if (result.environment && canonicalEvidence.data.environment.name !== result.environment) {
        diagnostics.push(
          `Evidence.environment.name=${canonicalEvidence.data.environment.name} 与运行结果 environment=${result.environment} 不一致`,
        );
      }
      const actualEvidenceDigest = computeEvidenceDigest(canonicalEvidence.data);
      if (canonicalReport.data.evidenceDigest !== actualEvidenceDigest) {
        diagnostics.push(
          `ReconciliationReport.evidenceDigest=${canonicalReport.data.evidenceDigest} 与 canonical Evidence digest=${actualEvidenceDigest} 不一致`,
        );
      }
      // The renderer never implements formulas. It delegates artifact trust to
      // the reconciliation layer, which replays the one registered executable
      // plan and compares the complete canonical report before display.
      diagnostics.push(...verifyReconciliationArtifact(
        canonicalEvidence.data,
        canonicalReport.data,
        projectRoot,
      ));
    }

    const actionKeyById = canonicalEvidence.success
      ? canonicalActionKeyById(canonicalEvidence.data)
      : new Map<string, string>();
    const fallbackChecks = canonicalEvidence.success && canonicalReport.success
      ? canonicalFunctionalChecks(canonicalReport.data, actionKeyById)
      : [];

    if (diagnostics.length > 0) {
      return invalidStructuredFunctionalEvidence({
        parsed,
        result,
        sourcePath,
        diagnostics,
        ...(canonicalEvidence.success ? { canonicalEvidence: canonicalEvidence.data } : {}),
        ...(fallbackChecks.length ? { fallbackChecks } : {}),
        projectRoot,
      });
    }

    // The empty-diagnostics branch proves both parses succeeded.
    if (!canonicalEvidence.success || !canonicalReport.success) {
      throw new Error('结构化 Evidence/Report 解析状态不一致');
    }
    // diagnostics 清空意味着 Evidence/Report 可信链路完整，直接透出 canonical 结果。
    return {
      id: result.id,
      title: typeof parsed.title === 'string' ? parsed.title : result.scenarioTitle,
      checks: fallbackChecks,
      transactions: canonicalFunctionalTransactions(canonicalEvidence.data, projectRoot, actionKeyById),
      positionKeyContexts: collectPositionKeyContexts(canonicalEvidence.data),
      // Structured display data is covered by evidenceDigest. Root data/evidence
      // fields are intentionally ignored because they are outside the bound V3 envelope.
      data: canonicalEvidence.data,
      sourcePath,
      reportStatus: canonicalReport.data.status,
      layerVerdicts: canonicalReport.data.layers,
      checkPlan: {
        ...canonicalReport.data.checkPlan,
        digest: canonicalReport.data.checkPlanDigest,
      },
    };
  }

  // Compatibility is intentionally limited to attachments which make no typed
  // Evidence/Report claim at all. A malformed modern pair must fail closed above.
  if (!Array.isArray(parsed.checks) && !Array.isArray(parsed.assertions)) return null;
  const compatibilityReport = reconciliationReportSchema.safeParse(parsed.reconciliationReport);
  const reportLookup = compatibilityReport.success
    ? buildReconciliationCheckLookup(compatibilityReport.data.checks)
    : undefined;
  const compatibilityReportData = compatibilityReport.success ? compatibilityReport.data : undefined;
  const checks = buildCompatibilityChecks(
    parsed.checks,
    compatibilityReportData,
    reportLookup,
    'checks',
  );
  if (checks.length === 0) {
    const assertionChecks = buildCompatibilityChecks(
      parsed.assertions,
      compatibilityReportData,
      reportLookup,
      'assertions',
    );
    if (assertionChecks.length > 0) {
      const actionData = extractFunctionalActionData(parsed);
      return {
        id: result.id,
        title: typeof parsed.title === 'string' ? parsed.title : result.scenarioTitle,
        checks: assertionChecks,
        transactions: collectFunctionalTransactions(parsed, projectRoot, explorerBaseUrl),
        positionKeyContexts: collectPositionKeyContexts(parsed),
        ...(actionData ? { actionData } : {}),
        ...(Object.hasOwn(parsed, 'data') ? { data: parsed.data } : {}),
        sourcePath,
      };
    }
  }
  const actionData = extractFunctionalActionData(parsed);
  return {
    id: result.id,
    title: typeof parsed.title === 'string' ? parsed.title : result.scenarioTitle,
    checks,
    transactions: collectFunctionalTransactions(parsed, projectRoot, explorerBaseUrl),
    positionKeyContexts: collectPositionKeyContexts(parsed),
    ...(actionData ? { actionData } : {}),
    ...(Object.hasOwn(parsed, 'data') ? { data: parsed.data } : {}),
    sourcePath,
  };
}

async function loadFunctionalAutomationEvidence(
  artifact: TestRunArtifact,
): Promise<Record<string, FunctionalAutomationEvidence>> {
  const entries = await Promise.all(artifact.results.filter((result) => isFunctionalResultId(result.id)).map(
    async (result): Promise<readonly [string, FunctionalAutomationEvidence] | null> => {
      const attachment = selectFinalFunctionalEvidenceAttachment(result);
      if (!attachment?.path) return null;
      try {
        const parsed = JSON.parse(await readFile(resolve(process.cwd(), attachment.path), 'utf8')) as unknown;
        const evidence = decodeFunctionalAutomationEvidenceAttachment(
          parsed,
          result,
          attachment.path,
          process.cwd(),
        );
        return evidence ? [functionalAutomationEvidenceKey(result), evidence] : null;
      } catch (error) {
        const evidence = invalidStructuredFunctionalEvidence({
          parsed: {},
          result,
          sourcePath: attachment.path,
          diagnostics: [
            `附件 JSON 读取或解析失败: ${error instanceof Error ? error.message : String(error)}`,
          ],
          projectRoot: process.cwd(),
        });
        return [functionalAutomationEvidenceKey(result), evidence];
      }
    },
  ));
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, FunctionalAutomationEvidence] => Boolean(entry)));
}

async function loadExecutionDeploymentViews(): Promise<Record<string, ExecutionDeploymentView>> {
  const views: Record<string, ExecutionDeploymentView> = {};
  const mockRegistry = await loadMockResourceRegistry().catch(() => undefined);
  for (const environment of environmentNames) {
    try {
      const context = loadEnvironmentBinding(process.cwd(), environment as EnvironmentName);
      const deployedAddresses = context.manifest.source?.addressesFile
        ? await readFile(resolve(process.cwd(), context.manifest.source.addressesFile), 'utf8')
          .then((source) => JSON.parse(source) as unknown)
          .then((parsed) => isRecord(parsed)
            ? Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] =>
              typeof entry[1] === 'string' && /^0x[0-9a-fA-F]{40}$/.test(entry[1])))
            : {})
          .catch(() => ({}))
        : {};
      const mockResource = environment === 'tx-fork' || environment === 'oracle-fork' || environment === 'time-fork'
        ? mockRegistry?.resources[environment]
        : undefined;
      views[environment] = {
        environment,
        version: context.binding.release,
        deploymentId: context.binding.deploymentId,
        manifestName: context.binding.manifestName,
        contractCommit: context.binding.contractCommit,
        environmentChainId: context.binding.environmentChainId,
        deploymentChainId: context.binding.deploymentChainId,
        contracts: context.manifest.contracts,
        additionalContracts: context.manifest.additionalContracts,
        deployedAddresses,
        markets: context.manifest.markets.map((market) => ({
          name: market.name,
          symbol: market.symbol,
          marketIndex: market.marketIndex,
          indexToken: market.indexToken,
          collateralToken: market.collateralToken,
          vault: market.vault,
          indexTokenDecimals: market.indexTokenDecimals,
          collateralTokenDecimals: market.collateralTokenDecimals,
        })),
        ...(mockResource ? {
          mockResources: {
            status: mockResource.status,
            ...(mockResource.forkDisplayName ? { forkDisplayName: mockResource.forkDisplayName } : {}),
            ...(mockResource.sharedCollateral ? {
              sharedCollateral: {
                ...(mockResource.sharedCollateral.token ? { token: mockResource.sharedCollateral.token } : {}),
                ...(mockResource.sharedCollateral.oracle ? { oracle: mockResource.sharedCollateral.oracle } : {}),
              },
            } : {}),
            bundles: listMockMarketBundles(mockResource).map((bundle) => ({
              alias: bundle.alias,
              status: bundle.status,
              ...(bundle.token ? { token: bundle.token } : {}),
              ...(bundle.oracle ? { oracle: bundle.oracle } : {}),
              ...(bundle.market ? {
                market: {
                  ...(bundle.market.marketIndex !== undefined ? { marketIndex: bundle.market.marketIndex } : {}),
                  ...(bundle.market.vault ? { vault: bundle.market.vault } : {}),
                  ...(bundle.market.bundleId ? { bundleId: bundle.market.bundleId } : {}),
                },
              } : {}),
            })),
          },
        } : {}),
      };
    } catch {
      // 环境绑定不可读时不猜地址；执行详情显示明确的缺失状态。
    }
  }
  return views;
}

export async function writeRunOutputs(
  input: TestRunArtifact,
  outputDirectory: string,
): Promise<OutputReceipt> {
  const validated = await attachStoredResultProvenance(validateTestRunArtifact(input));
  const withEvidence = validateTestRunArtifact(await attachExecutionEvidence({
    ...validated,
    // 指标数字在渲染时按当前代码重算，指标定义也必须同步刷新，
    // 否则重建历史报告会出现"数字用新口径、随页定义写旧口径"的分叉。
    source: { ...validated.source, metricDefinitions: { ...metricDefinitions } },
    catalog: await applyCatalogExecutionModes(validated.catalog),
  }));
  const artifact = validateTestRunArtifact(await preserveAttachments(withEvidence, outputDirectory));
  const catalogPath = resolve(process.cwd(), artifact.source.catalogPath);
  const [references, testCases, scenarioSpecs, reconciliationLedger, versionCases] = await Promise.all([
    loadReferenceSources(),
    loadTestCases(artifact.catalog, catalogPath),
    discoverScenarioSpecs(process.cwd()),
    // 字段台账未生成（seed 未跑）时页面渲染引导文案，不视为重建失败。
    loadReconciliationLedger(process.cwd()).catch(() => null),
    // 版本功能用例（CT/XT/FT）：versions/<release>/ 矩阵 + results.md，与 SCN 目录解析互不影响。
    loadVersionCases(process.cwd()),
  ]);
  await mkdir(outputDirectory, { recursive: true });
  // 基线视图在渲染时实时读取 CURRENT.json（目标基线随登记切换），run.release 仍取产物记录的环境实际部署版本。
  const baseline = buildBaselineView(artifact.run);
  const versionRunCases = buildVersionRunCaseDefinitions(versionCases);
  const automatedFunctionalCaseIds = versionRunCases
    .filter((item) => item.executionMode === 'automated' && scenarioSpecs.has(item.id))
    .map((item) => item.id);
  const executionArtifact = await attachFunctionalBatchHistory(artifact);
  const functionalAutomationEvidence = await loadFunctionalAutomationEvidence(executionArtifact);
  const executionDeployments = await loadExecutionDeploymentViews();
  const tradeSite = await readTradeSiteTarget(process.cwd());

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
  const deploymentsHtml = join(outputDirectory, 'deployments.html');
  const faucetHtml = join(outputDirectory, 'faucet.html');
  const reconciliationConsoleHtml = join(outputDirectory, 'reconciliation-console.html');

  await Promise.all([
    writeFile(resultsJson, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8'),
    writeFile(summaryMarkdown, renderMarkdownSummary(artifact, baseline), 'utf8'),
    writeFile(dashboardHtml, renderDashboardHtml(artifact, baseline), 'utf8'),
    writeFile(executionsHtml, renderExecutionsHtml(
      executionArtifact,
      [...testCases, ...versionRunCases],
      versionCases,
      functionalAutomationEvidence,
      executionDeployments,
    ), 'utf8'),
    writeFile(parametersHtml, renderParametersHtml(references.parameters, artifact.source.generatedAt), 'utf8'),
    writeFile(formulasHtml, renderContractFormulasHtml(references.contractFormulas, artifact.source.generatedAt), 'utf8'),
    // 页面数据公式页 = 前端代码公式 + 下方挂 Keeper 代码公式（看板只有两页公式，见 render-formulas.ts）。
    writeFile(pageFormulasHtml, renderPageFormulasHtml(references.pageFormulas, artifact.source.generatedAt, references.keeperFormulas), 'utf8'),
    writeFile(testCasesHtml, renderTestCasesHtml(
      attachExecutions(testCases, artifact.results),
      artifact.source.generatedAt,
      versionCases,
      automatedFunctionalCaseIds,
    ), 'utf8'),
    writeFile(
      runsHtml,
      renderRunBuilderHtml(
        attachExecutions(
          [...testCases, ...versionRunCases],
          artifact.results,
        ),
        Array.from(scenarioSpecs.keys()).sort(),
        artifact.source.generatedAt,
        baseline,
      ),
      'utf8',
    ),
    writeFile(environmentsHtml, renderEnvironmentsHtml(artifact.source.generatedAt), 'utf8'),
    writeFile(
      deploymentsHtml,
      renderDeploymentsHtml(executionDeployments, tradeSite, artifact.source.generatedAt),
      'utf8',
    ),
    writeFile(faucetHtml, renderFaucetHtml(), 'utf8'),
    writeFile(
      reconciliationConsoleHtml,
      renderReconciliationConsoleHtml(reconciliationLedger, artifact.source.generatedAt),
      'utf8',
    ),
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
    deploymentsHtml,
    faucetHtml,
    reconciliationConsoleHtml,
  };
}

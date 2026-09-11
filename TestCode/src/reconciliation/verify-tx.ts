/**
 * verify-tx 共用 runner —— CLI（scripts/verify-tx.ts）与看板路由（src/server/verify-tx-routes.ts）共用同一套：
 *   请求规整 → buildEnvelopeFromTxHashes（tx hash → Evidence V2；RPC / chainId 只走既有 RuntimeConfig）
 *   → 按 tx kind 选核对包（严格 4 笔开→平 roundtrip 走注册表 market-open.roundtrip@2；其它形态临时拼
 *   tx-verify.adhoc 计划：market-open.core 接开仓配对，market-close / liquidation pack 接减仓 / 清算）
 *   → check-engine 跑包 → aggregateReport 出分层 / 完整性 → 单一结论（PASS / FAIL / NOT_VERIFIED）
 *   → 证据 JSON 对象（结构与跑批附件一致：evidenceV2 + reconciliationReport + checks）。
 *
 * 纪律：期望值与判定全部来自 packs（本文件不实现任何公式）；证据等级由 CheckRecord.verification 如实呈现，
 *   缺 execBlock−1 状态的行由引擎降级为 NOT_VERIFIED，这里绝不改写；错误文本先脱敏（不外泄 RPC URL）。
 *   结论只有一层：blocking FAIL / INVALID_EVIDENCE → FAIL；任一 NOT_VERIFIED、warning FAIL、缺 pack、无核对行
 *   → NOT_VERIFIED；其余 → PASS。看板 attach 与 CLI 退出码都从这同一函数出。
 */
import { environmentNames } from '../../config/environments/catalog.js';
import { maskUrl } from '../config/runtime.js';
import { resolveBlockExplorerBaseUrl } from '../config/transaction-links.js';
import { canonicalEvidenceEnvelopeSchema } from '../evidence/adapters/v2-to-v3.js';
import type { EvidenceEnvelope as EvidenceEnvelopeV2, Hex } from '../evidence/evidence-v2.js';
import type { EvidenceEnvelope as EvidenceEnvelopeV3 } from '../evidence/evidence-v3.js';
import {
  buildEnvelopeFromTxHashes,
  type TxVerifyMetadata,
  type TxVerifyOverrides,
  type TxVerifyResult,
} from './adapters/tx-hashes.js';
import { findTrustedCheckPlan } from './check-plan-registry.js';
import { aggregateReport } from './engine/aggregate-verdicts.js';
import { contractLedgerFieldId } from './ledger-field-id.js';
import {
  computeCheckPlanDigest,
  runCheckPlan,
  type CheckPack,
  type CheckPlan,
} from './engine/check-engine.js';
import { feeClaimablePack } from './packs/fee-claimable.js';
import { liquidationPack } from './packs/liquidation.js';
import { marketClosePack } from './packs/market-close.js';
import { marketOpenCleanupPack, marketOpenCorePack } from './packs/market-open.js';
import {
  reconciliationReportSchema,
  type CheckRecord,
  type ReconciliationReport, checkRecordSchema
} from './schema/check-record.js';

export type { TxVerifyMetadata, TxVerifyOverrides, TxVerifyResult } from './adapters/tx-hashes.js';

export const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
export const CASE_ID_PATTERN = /^(?:CT|XT|FT)-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3}$|^SCN-\d{3}$/;
/** v0.3.2 合约公式详解层；章节号作 formulaBasis.section（只登记能对上章节的公式 id，对不上的如实标 —）。 */
export const FORMULA_DOC = 'TestCase/E2E/ContractCodeSummary/v0.3.2/FX100-核心字段计算公式.md';
export const FORMULA_SECTIONS: Readonly<Record<string, string>> = {
  'pricing.increase.execution-price': '§4.5 加仓成交价',
  'position.size.after-increase': '§5.1 加仓后规模',
  'position.collateral.after-increase': '§5.3 加仓抵押品变化',
  'settlement.decrease-waterfall': '§5.4 减仓支付瀑布与输出',
  'fee.position.amount': '§7.1 基础仓位费',
  'fee.claimable.position.increment': '§7.5 协议与 LP 分成',
  'fee.claimable.funding.net-payer': '§10.7 仓位结算：settleFundingFees',
};
/** 核对行 id → 人读名称（仅展示；判定与期望仍以 CheckRecord 为准）。 */
export const CHECK_LABELS: Readonly<Record<string, string>> = {
  'order.create.escrow-trader': '下单托管：Trader USDC Δ',
  'order.create.escrow-vault': '下单托管：OrderVault USDC Δ',
  'market-open.core.conservation': '五方 USDC 守恒 ΣΔ',
  'market-open.cleanup.conservation': '五方 USDC 守恒 ΣΔ',
  'order.execute.outcome': '执行结果 OrderExecuted',
  'keeper.open-execution': 'Keeper 开仓执行交易',
  'position.exists': '仓位存在',
  'position.side': '仓位方向',
  'position.size-usd': '仓位规模 USD',
  'event.position.order-type': '事件 orderType',
  'event.position.side': '事件 isLong',
  'fee.position.amount': '仓位费金额',
  'position.collateral': '仓位抵押品',
  'pricing.execution-price': '执行价',
  'market.oi-usd-primary-side': 'OI USD 本侧 Δ',
  'market.oi-usd-other-side': 'OI USD 对侧不变',
  'market.oi-token-primary-side': 'OI Token 本侧 Δ',
  'market.oi-token-other-side': 'OI Token 对侧不变',
  'fee.factor-selected': '费率档位 balanceWasImproved',
  'cleanup.execute.outcome': '平仓执行结果',
  'keeper.close-execution': 'Keeper 平仓执行交易',
  'cleanup.position-removed': '仓位已移除',
  'whole.trader-usdc': '全流程 Trader USDC Δ',
  'whole.conservation': '全流程五方守恒',
  'fee.claimable.position': 'claimable 仓位费 Δ',
  'fee.claimable.funding': 'claimable Funding Δ',
  'fee.claimable.liquidation': 'claimable 清算费不变',
  'fee.handler-token-balance': 'FeeHandler 余额不变',
};

type JsonRecord = Record<string, unknown>;

/** 请求规整错误（参数不合法）：HTTP 400 / CLI 退出码 3。 */
export class TxVerifyInputError extends Error {
  readonly status = 400 as const;
  constructor(message: string) {
    super(message);
    this.name = 'TxVerifyInputError';
  }
}

/** 读链 / 组装证据失败：HTTP 502 / CLI 退出码 3。文本已脱敏。 */
export class TxVerifyChainError extends Error {
  readonly status = 502 as const;
  constructor(message: string) {
    super(message);
    this.name = 'TxVerifyChainError';
  }
}

export interface TxVerifyNormalizedRequest {
  readonly env: string;
  readonly hashes: Hex[];
  readonly caseId?: string;
  readonly overrides: TxVerifyOverrides;
}

export interface TxVerifyRunRequest extends TxVerifyNormalizedRequest {
  readonly projectRoot: string;
  /** 写进证据 JSON 的 source 字段（哪一入口产出）。 */
  readonly source: string;
}

export interface PlanSelection {
  readonly plan: CheckPlan;
  readonly trust: 'registered' | 'adhoc';
  readonly digest: string;
  readonly applied: readonly string[];
  readonly excluded: ReadonlyArray<{ readonly id: string; readonly reason: string }>;
  readonly noPack: ReadonlyArray<{ readonly actionId: string; readonly kind: string; readonly type: string; readonly reason: string }>;
  readonly notes: readonly string[];
}

export type TxVerifyVerdictLabel = 'PASS' | 'FAIL' | 'NOT_VERIFIED';

export interface TxVerifyVerdict {
  readonly label: TxVerifyVerdictLabel;
  readonly exitCode: 0 | 1 | 2;
  readonly reasons: readonly string[];
  readonly counts: Readonly<Record<string, number>>;
}

export interface TxVerifyRun {
  readonly request: TxVerifyNormalizedRequest;
  readonly caseId: string;
  readonly generatedAt: string;
  readonly result: TxVerifyResult;
  readonly evidence: EvidenceEnvelopeV3;
  readonly selection: PlanSelection;
  readonly checks: readonly CheckRecord[];
  readonly report: ReconciliationReport;
  readonly verdict: TxVerifyVerdict;
  /** 证据 JSON 对象（与 scripts/verify-tx.ts 落盘结构一致；已是纯 JSON 值，无 bigint）。 */
  readonly artifact: JsonRecord;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

export function errorMessage(error: unknown): string {
  return maskText(error instanceof Error ? error.message : String(error));
}

/** 错误 / 告警文本脱敏：任何 http(s) URL 只留 host（RPC URL 含 fork 凭证）。 */
export function maskText(text: string): string {
  return text.replace(/https?:\/\/[^\s"'`)\]]+/g, (match) => {
    try { return maskUrl(match); } catch { return 'https://***'; }
  });
}

// ---------------------------------------------------------------------------
// 请求规整
// ---------------------------------------------------------------------------

const OVERRIDE_STRING_FIELDS = ['contractVersion', 'contractHead', 'frontendHead', 'executedAt', 'note'] as const;

export function normalizeTxHashes(input: unknown, maxHashes = 32): Hex[] {
  const pieces = Array.isArray(input)
    ? input
    : typeof input === 'string' ? input.split(',') : undefined;
  if (!pieces) throw new TxVerifyInputError('hashes 必须是交易哈希数组（或逗号分隔字符串）');
  const hashes: Hex[] = [];
  for (const piece of pieces) {
    if (typeof piece !== 'string') throw new TxVerifyInputError('hashes 数组元素必须是字符串');
    const hash = piece.trim();
    if (!hash) continue;
    if (!TX_HASH_PATTERN.test(hash)) throw new TxVerifyInputError(`不是合法交易哈希：${hash}`);
    hashes.push(hash.toLowerCase() as Hex);
  }
  const unique = [...new Set(hashes)];
  if (unique.length === 0) throw new TxVerifyInputError('至少提供一个交易哈希');
  if (unique.length > maxHashes) throw new TxVerifyInputError(`交易哈希最多 ${maxHashes} 个（收到 ${unique.length} 个）`);
  return unique;
}

export function normalizeCaseId(input: unknown): string | undefined {
  if (input === undefined || input === null || input === '') return undefined;
  if (typeof input !== 'string') throw new TxVerifyInputError('caseId 必须是字符串');
  const caseId = input.trim();
  if (!CASE_ID_PATTERN.test(caseId)) {
    throw new TxVerifyInputError(`caseId=${caseId} 不符合用例编号规范（CT|XT|FT-<域>[-<子段>]-NNN 或 SCN-NNN）`);
  }
  return caseId;
}

export function normalizeOverrides(input: unknown): TxVerifyOverrides {
  if (input === undefined || input === null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) throw new TxVerifyInputError('overrides 必须是对象');
  const source = input as JsonRecord;
  const overrides: {
    contractVersion?: string; contractHead?: string; frontendHead?: string; executedAt?: string; chainId?: number; note?: string;
  } = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null || value === '') continue;
    if (key === 'chainId') {
      const parsed = typeof value === 'number' ? value : Number(value);
      if (typeof value === 'boolean' || !Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new TxVerifyInputError(`overrides.chainId=${String(value)} 不是正整数`);
      }
      overrides.chainId = parsed;
      continue;
    }
    if ((OVERRIDE_STRING_FIELDS as readonly string[]).includes(key)) {
      if (typeof value !== 'string') throw new TxVerifyInputError(`overrides.${key} 必须是字符串`);
      overrides[key as (typeof OVERRIDE_STRING_FIELDS)[number]] = value.trim();
      continue;
    }
    throw new TxVerifyInputError(`overrides 含未知字段：${key}（允许 ${[...OVERRIDE_STRING_FIELDS, 'chainId'].join(' / ')}）`);
  }
  return overrides;
}

export function normalizeEnvironment(input: unknown): string {
  if (typeof input !== 'string' || !input.trim()) throw new TxVerifyInputError('缺少 env');
  const env = input.trim();
  if (!environmentNames.includes(env as (typeof environmentNames)[number])) {
    throw new TxVerifyInputError(`env=${env} 不在可信环境目录 ${environmentNames.join('/')} 中`);
  }
  return env;
}

/** 看板 / CLI 请求体 → 规整请求；任何不合法字段抛 TxVerifyInputError（400）。 */
export function normalizeTxVerifyRequest(input: unknown, options: { readonly maxHashes?: number } = {}): TxVerifyNormalizedRequest {
  const body = record(input);
  const env = normalizeEnvironment(body.env);
  const hashes = normalizeTxHashes(body.hashes, options.maxHashes);
  const caseId = normalizeCaseId(body.caseId);
  const overrides = normalizeOverrides(body.overrides);
  return { env, hashes, ...(caseId ? { caseId } : {}), overrides };
}

// ---------------------------------------------------------------------------
// 核对包选择
// ---------------------------------------------------------------------------

/** pack 预检：requiredInputs / run 抛错（如缺 TX4）说明该包对当前 tx 组合不适用，排除并记原因；缺输入本身交给引擎出 NOT_VERIFIED。 */
function preflightPack(evidence: EvidenceEnvelopeV3, pack: CheckPack): string | undefined {
  try {
    const available = new Set(evidence.capabilities);
    if (pack.requiredCapabilities.some((capability) => !available.has(capability))) return undefined;
    const requirements = pack.requiredInputs?.(evidence) ?? [];
    const missing = requirements.filter((requirement) => requirement.value === undefined
      || requirement.value === null || requirement.value === '');
    if (missing.length === 0) pack.run(evidence);
    return undefined;
  } catch (error) {
    return errorMessage(error);
  }
}

function strictRoundtrip(evidence: EvidenceEnvelopeV3, plan: CheckPlan): boolean {
  return evidence.flowType === plan.flowType
    && evidence.actions.length === plan.actions.length
    && evidence.actions.every((action, index) => {
      const expected = plan.actions[index];
      return expected !== undefined && action.type === expected.type && action.purpose === expected.purpose
        && expected.outcomes.includes(action.outcome);
    });
}

function transactionPolicyFor(action: EvidenceEnvelopeV3['actions'][number]): CheckPlan['actions'][number]['transactions'] | undefined {
  const transaction = action.transactions.length === 1 ? action.transactions[0] : undefined;
  if (!transaction) return undefined;
  if (action.outcome === 'SUBMITTED' && transaction.orderKey && action.orderRefs) {
    return { rules: [{ id: 'order-submission', roles: [transaction.role], min: 1, max: 1, anchor: 'order-submission' }] };
  }
  if (action.outcome === 'EXECUTED' && (transaction.role === 'keeper' || transaction.role === 'service')
    && action.snapshots.some((snapshot) => snapshot.kind === 'execution-after')) {
    return { rules: [{ id: 'terminal-execution', roles: [transaction.role], min: 1, max: 1, anchor: 'terminal-execution' }] };
  }
  return undefined;
}

function adhocPlan(evidence: EvidenceEnvelopeV3, packs: readonly CheckPack[]): CheckPlan {
  return {
    id: 'tx-verify.adhoc',
    version: '1',
    flowType: evidence.flowType,
    actions: evidence.actions.map((action) => {
      const transactions = transactionPolicyFor(action);
      return {
        type: action.type,
        purpose: action.purpose,
        outcomes: [action.outcome],
        ...(transactions ? { transactions } : {}),
        requiredCapabilities: action.capabilities,
      };
    }),
    packs,
  };
}

function packIdentity(pack: CheckPack): string {
  return `${pack.id}@${pack.version}`;
}

export function selectPlan(evidence: EvidenceEnvelopeV3, metadata: TxVerifyMetadata): PlanSelection {
  const notes: string[] = [];
  const kindOf = new Map(metadata.perTx.map((tx) => [tx.actionId, tx.kind]));
  const registered = findTrustedCheckPlan('market-open.roundtrip', '2');

  // 1. 严格 4 笔开→平 roundtrip：直接用注册表里的可信计划（看板信任门可重放）。
  if (registered && strictRoundtrip(evidence, registered.plan)) {
    try {
      runCheckPlan(evidence, registered.plan);
      return {
        plan: registered.plan,
        trust: 'registered',
        digest: registered.digest,
        applied: registered.plan.packs.map(packIdentity),
        excluded: [],
        noPack: [],
        notes: ['tx 组合命中注册计划 market-open.roundtrip@2（开仓 → 平仓 4 笔）。'],
      };
    } catch (error) {
      notes.push(`注册计划 market-open.roundtrip@2 执行异常，降级为 adhoc 计划：${errorMessage(error)}`);
    }
  }

  // 2. adhoc：按 tx kind 挑候选包并预检；每个候选包登记它覆盖的 action，只有真正接入的包才算覆盖。
  const candidates: Array<{ pack: CheckPack; covers: readonly string[] }> = [];
  const excluded: Array<{ id: string; reason: string }> = [];
  const noPack: Array<{ actionId: string; kind: string; type: string; reason: string }> = [];
  const actionById = new Map(evidence.actions.map((action) => [action.actionId, action]));
  const tx1 = actionById.get('TX1');
  const tx2 = actionById.get('TX2');
  const openPair = tx1?.type === 'submitMarketIncrease' && tx1.outcome === 'SUBMITTED'
    && tx2?.type === 'executeOrder' && tx2.outcome === 'EXECUTED' && kindOf.get('TX2') === 'execute-increase';
  if (openPair) candidates.push({ pack: marketOpenCorePack, covers: ['TX1', 'TX2'] });
  const kinds = new Set(kindOf.values());
  if (evidence.flowType === 'roundtrip') {
    candidates.push({ pack: marketOpenCleanupPack, covers: ['TX3', 'TX4'] }, { pack: feeClaimablePack, covers: ['TX2', 'TX4'] });
  }
  if (kinds.has('execute-decrease') && evidence.flowType !== 'roundtrip') {
    notes.push(`packs/market-close.ts 已接入：${packIdentity(marketClosePack)}`);
    const covers = metadata.perTx
      .filter((tx) => tx.kind === 'execute-decrease' || (tx.kind === 'create' && actionById.get(tx.actionId)?.type === 'submitMarketDecrease'))
      .map((tx) => tx.actionId);
    candidates.push({ pack: marketClosePack, covers });
  }
  if (kinds.has('liquidation') || kinds.has('adl')) {
    notes.push(`packs/liquidation.ts 已接入：${packIdentity(liquidationPack)}`);
    const covers = metadata.perTx.filter((tx) => tx.kind === 'liquidation' || tx.kind === 'adl').map((tx) => tx.actionId);
    candidates.push({ pack: liquidationPack, covers });
  }

  const applied: CheckPack[] = [];
  const coveredActions = new Set<string>();
  const seen = new Set<string>();
  for (const { pack, covers } of candidates) {
    const key = packIdentity(pack);
    if (seen.has(key)) continue;
    seen.add(key);
    const failure = preflightPack(evidence, pack);
    if (failure) {
      excluded.push({ id: key, reason: failure });
      continue;
    }
    applied.push(pack);
    for (const actionId of covers) coveredActions.add(actionId);
  }
  for (const tx of metadata.perTx) {
    if (coveredActions.has(tx.actionId)) continue;
    const action = actionById.get(tx.actionId);
    noPack.push({
      actionId: tx.actionId,
      kind: tx.kind,
      type: action?.type ?? '(unknown)',
      reason: noPackReason(tx.kind, action?.type),
    });
  }
  const plan = adhocPlan(evidence, applied);
  return {
    plan,
    trust: 'adhoc',
    digest: computeCheckPlanDigest(plan),
    applied: applied.map(packIdentity),
    excluded,
    noPack,
    notes: [
      ...notes,
      'adhoc 计划未登记到可信计划注册表：看板信任门会标 INVALID_EVIDENCE，本产物仅作手工核对材料；'
        + '需要看板采信时用注册计划覆盖的 tx 组合（4 笔开→平）或先登记专用计划。',
    ],
  };
}

function noPackReason(kind: string, type: string | undefined): string {
  switch (kind) {
    case 'create':
      return type === 'submitMarketIncrease'
        ? '创建 tx 未配对到执行 tx：market-open.core 需要 OrderCreated + 执行（PositionIncrease）成对给出'
        : `创建类型 ${type ?? kind} 尚无独立 pack`;
    case 'execute-increase':
      return '加仓执行未与创建 tx 配对为 TX1/TX2：market-open.core 需要创建 tx 提供订单意图（side / sizeDeltaUsd / collateralAmount）';
    case 'execute-decrease':
      return '减仓 / 平仓 pack（market-close）预检未通过或该 tx 未被其覆盖';
    case 'liquidation':
    case 'adl':
      return '清算 / ADL pack（liquidation）预检未通过或该 tx 未被其覆盖';
    case 'cancel':
    case 'frozen':
      return '取消 / 冻结类型尚无独立 pack';
    case 'funding-only':
      return '仅 Funding 结算的 tx 尚无独立 pack';
    case 'execute':
      return '执行 tx 未解出 PositionIncrease/Decrease，无法归入开仓或平仓 pack';
    case 'reverted':
      return 'tx 回执 reverted，无事件可核对';
    default:
      return '未识别的 FX100 交易动作，该类型尚无独立 pack';
  }
}

// ---------------------------------------------------------------------------
// 结论（唯一一层）
// ---------------------------------------------------------------------------

interface VerdictRow {
  readonly id: string;
  readonly severity: string;
  readonly verdict: string;
  readonly verification: string;
}

interface VerdictInput {
  readonly rows: readonly VerdictRow[];
  readonly reportStatus: string | undefined;
  readonly integrityReasons: readonly string[];
  readonly noPack: ReadonlyArray<{ readonly actionId: string; readonly kind: string }>;
}

function verdictFromRows(input: VerdictInput): TxVerifyVerdict {
  const counts: Record<string, number> = {};
  for (const row of input.rows) counts[row.verdict] = (counts[row.verdict] ?? 0) + 1;
  const reasons: string[] = [];
  const blockingFail = input.rows.filter((row) => row.severity === 'blocking' && row.verdict === 'FAIL');
  const warningFail = input.rows.filter((row) => row.severity === 'warning' && row.verdict === 'FAIL');
  const unverified = input.rows.filter((row) => row.verdict === 'NOT_VERIFIED' || row.verification === 'NOT_VERIFIED');
  if (input.reportStatus === 'INVALID_EVIDENCE') {
    reasons.push(`证据完整性失败（INVALID_EVIDENCE）：${input.integrityReasons.join('；') || '未给出原因'}`);
  }
  if (blockingFail.length > 0) reasons.push(`blocking FAIL ${blockingFail.length} 行：${blockingFail.map((row) => row.id).join('、')}`);
  if (input.reportStatus === 'INVALID_EVIDENCE' || blockingFail.length > 0) {
    return { label: 'FAIL', exitCode: 1, reasons, counts };
  }
  if (unverified.length > 0) reasons.push(`NOT_VERIFIED ${unverified.length} 行：${unverified.map((row) => row.id).join('、')}`);
  if (warningFail.length > 0) reasons.push(`warning FAIL ${warningFail.length} 行：${warningFail.map((row) => row.id).join('、')}`);
  if (input.noPack.length > 0) reasons.push(`缺 pack 的 tx ${input.noPack.length} 笔：${input.noPack.map((gap) => `${gap.actionId}(${gap.kind})`).join('、')}`);
  if (input.rows.length === 0) reasons.push('没有产生任何核对行');
  if (reasons.length > 0) return { label: 'NOT_VERIFIED', exitCode: 2, reasons, counts };
  return { label: 'PASS', exitCode: 0, reasons: [], counts };
}

export 
/**
 * 元数据一致性核对行：请求里断言的 chainId（登记值或 --chain-id 覆盖）必须等于 RPC eth_chainId。
 * 贴错链的证据是「批次标签从不对照链上实况」那类假通过的源头，因此设为 blocking；
 * RPC 读不到 chainId 时按 schema 只能 NOT_VERIFIED，不得 PASS。
 */
function chainIdConsistencyCheck(metadata: {
  readonly chainId: number;
  readonly rpcChainId?: number;
  readonly resolvedFrom: { readonly chainId?: 'default' | 'override' };
}): CheckRecord {
  const asserted = String(metadata.chainId);
  const observed = metadata.rpcChainId === undefined ? undefined : String(metadata.rpcChainId);
  const origin = metadata.resolvedFrom.chainId === 'override' ? 'overrides.chainId（手填覆盖）' : 'config/mock-resources.json / 环境绑定表登记值';
  const verdict: CheckRecord['verdict'] = observed === undefined ? 'NOT_VERIFIED' : observed === asserted ? 'PASS' : 'FAIL';
  return checkRecordSchema.parse({
    id: 'metadata.chain-id',
    packId: 'tx-verify.metadata',
    actionId: 'WHOLE',
    purpose: 'whole-flow',
    subject: 'chain-state',
    comparison: 'invariant',
    actual: { raw: observed ?? '（RPC eth_chainId 不可读）' },
    expected: { raw: asserted, display: `${asserted}（${origin}）` },
    sources: [
      { layer: 'chain-state', path: 'rpc.eth_chainId' },
      { layer: 'parameter', path: metadata.resolvedFrom.chainId === 'override' ? 'request.overrides.chainId' : 'config/mock-resources.json#chainId' },
    ],
    verification: observed === undefined ? 'NOT_VERIFIED' : 'IDENTITY',
    severity: 'blocking',
    verdict,
    ...(verdict === 'FAIL'
      ? { difference: `元数据 chainId=${asserted} ≠ RPC eth_chainId=${observed}`, note: '证据被贴到了错误的链/环境：核对结果不可采信。修正 --chain-id / 环境选择后重跑。' }
      : verdict === 'NOT_VERIFIED'
        ? { note: 'RPC eth_chainId 读取失败，无法证明证据所属链；不得据此判 PASS。' }
        : { note: `RPC eth_chainId 与元数据一致（来源：${origin}）。` }),
  });
}

function verdictOf(checks: readonly CheckRecord[], report: ReconciliationReport, selection: PlanSelection): TxVerifyVerdict {
  return verdictFromRows({
    rows: checks,
    reportStatus: report.status,
    integrityReasons: report.integrity.reasons,
    noPack: selection.noPack,
  });
}

function asVerdictRows(value: unknown): VerdictRow[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows: VerdictRow[] = [];
  for (const [index, item] of value.entries()) {
    const row = record(item);
    const id = typeof row.id === 'string' ? row.id : typeof row.name === 'string' ? row.name : `#${index + 1}`;
    if (typeof row.verdict !== 'string' || typeof row.severity !== 'string') return undefined;
    rows.push({
      id,
      severity: row.severity,
      verdict: row.verdict,
      verification: typeof row.verification === 'string' ? row.verification : 'NOT_VERIFIED',
    });
  }
  return rows;
}

/**
 * 从已落盘 / 已上传的证据 JSON 重新推导唯一结论（不信任其 summary.verdict）：
 * 优先 reconciliationReport.checks（CheckRecord），退化到扁平 checks；缺核对行 → NOT_VERIFIED。
 */
export function verdictFromArtifact(artifact: unknown): TxVerifyVerdict {
  const root = record(artifact);
  const report = record(root.reconciliationReport);
  const rows = asVerdictRows(report.checks) ?? asVerdictRows(root.checks) ?? [];
  const summary = record(root.summary);
  const reportStatus = typeof report.status === 'string'
    ? report.status
    : typeof summary.reportStatus === 'string' ? summary.reportStatus : undefined;
  const integrity = record(report.integrity);
  const integrityReasons = Array.isArray(integrity.reasons)
    ? integrity.reasons.filter((reason): reason is string => typeof reason === 'string')
    : [];
  const plan = record(record(root.data).plan);
  const noPack = Array.isArray(plan.noPack)
    ? plan.noPack.map((gap) => {
        const item = record(gap);
        return { actionId: String(item.actionId ?? '?'), kind: String(item.kind ?? '?') };
      })
    : [];
  return verdictFromRows({ rows, reportStatus, integrityReasons, noPack });
}

/** 证据 JSON 是否至少带有核对行（扁平 checks 或 reconciliationReport.checks）。 */
export function artifactHasCheckRows(artifact: unknown): boolean {
  const root = record(artifact);
  return Array.isArray(root.checks) || Array.isArray(record(root.reconciliationReport).checks);
}

// ---------------------------------------------------------------------------
// 展示辅助（CLI 表格与看板共用的名称 / 章节映射）
// ---------------------------------------------------------------------------

export function labelOf(check: CheckRecord): string {
  return CHECK_LABELS[check.id] ?? check.formula?.id ?? `${check.subject}/${check.comparison}`;
}

/** 章节：pack 自带 formulaBasis（market-close / liquidation 每行都有）优先，否则按 formula.id 查 FORMULA_SECTIONS。 */
export function sectionOf(check: CheckRecord): string {
  if (check.formulaBasis) return check.formulaBasis.section;
  return check.formula ? FORMULA_SECTIONS[check.formula.id] ?? '—' : '—';
}

/**
 * 台账行 id：CheckRecord 自带 ledgerFieldId（packs 经 ledger-field-id.ts 派生）优先；
 * 只有 FORMULA_SECTIONS 映射的行（market-open 系）在产物层按同一规则补派生，不回写 CheckRecord
 * （aggregateReport 会重跑 CheckPlan 并比对 checks 摘要，产物层以外改写核对行会被判 INVALID_EVIDENCE）。
 */
export function ledgerFieldIdOf(check: CheckRecord): string | undefined {
  if (check.ledgerFieldId) return check.ledgerFieldId;
  const section = check.formulaBasis?.section ?? (check.formula ? FORMULA_SECTIONS[check.formula.id] : undefined);
  return contractLedgerFieldId(section);
}

export function valueOf(value: CheckRecord['actual']): string {
  return value.display ?? value.raw;
}

// ---------------------------------------------------------------------------
// 产物
// ---------------------------------------------------------------------------

export function stringifyArtifact(value: unknown): string {
  return `${JSON.stringify(value, (_key, item: unknown) => (typeof item === 'bigint' ? item.toString() : item), 2)}\n`;
}

/** 去掉 bigint 等不可 JSON 化的值，得到纯 JSON 对象（sendJson / writeFile 皆可直接用）。 */
export function toJsonValue<T = JsonRecord>(value: unknown): T {
  return JSON.parse(stringifyArtifact(value)) as T;
}

export function compactTimestamp(iso: string): string {
  return iso.replace(/[-:]/g, '').replace('T', '-').replace(/\.\d{3}Z$/, '');
}

export function buildTxVerifyArtifact(input: {
  readonly request: TxVerifyNormalizedRequest;
  readonly projectRoot: string;
  readonly source: string;
  readonly caseId: string;
  readonly generatedAt: string;
  readonly result: TxVerifyResult;
  readonly selection: PlanSelection;
  readonly checks: readonly CheckRecord[];
  readonly report: ReconciliationReport;
  readonly verdict: TxVerifyVerdict;
}): JsonRecord {
  const { request, result, selection, checks, report, verdict } = input;
  const forkDisplayName = result.envelope.environment.fork?.displayName;
  const explorerUrl = resolveBlockExplorerBaseUrl(input.projectRoot, request.env, result.metadata.chainId, forkDisplayName);
  return {
    id: input.caseId,
    title: `${input.caseId} 按 tx hash 手工核对（verify:tx）`,
    source: input.source,
    generatedAt: input.generatedAt,
    request: {
      env: request.env,
      hashes: request.hashes,
      ...(request.caseId ? { caseId: request.caseId } : {}),
      overrides: request.overrides,
    },
    summary: {
      verdict: verdict.label,
      exitCode: verdict.exitCode,
      reasons: verdict.reasons,
      counts: verdict.counts,
      reportStatus: report.status,
      layers: report.layers,
    },
    // 与 tests/B 功能用例附件同形的扁平核对摘要（看板兼容路径只在没有 evidenceV2 时才读它）。
    checks: checks.map((check) => {
      const ledgerFieldId = ledgerFieldIdOf(check);
      return {
        name: `${check.actionId} ${check.id}`,
        passed: check.verdict === 'PASS',
        actual: valueOf(check.actual),
        expected: valueOf(check.expected),
        verification: check.verification,
        verdict: check.verdict,
        severity: check.severity,
        ...(check.note ? { note: check.note } : {}),
        ...(ledgerFieldId ? { ledgerFieldId } : {}),
      };
    }),
    data: {
      environment: {
        env: request.env,
        chainId: result.metadata.chainId,
        ...(result.metadata.rpcChainId !== undefined ? { rpcChainId: result.metadata.rpcChainId } : {}),
        ...(forkDisplayName ? { forkDisplayName } : {}),
        ...(explorerUrl ? { explorerUrl } : {}),
      },
      metadata: result.metadata,
      warnings: result.warnings.map(maskText),
      plan: {
        id: selection.plan.id,
        version: selection.plan.version,
        digest: selection.digest,
        trust: selection.trust,
        applied: selection.applied,
        excluded: selection.excluded,
        noPack: selection.noPack,
        notes: selection.notes,
      },
      // 章节 / 台账 id 回链：pack 自带 formulaBasis 的行（market-close / liquidation）与 FORMULA_SECTIONS 映射的行都登记。
      formulaBasis: {
        sourcePath: FORMULA_DOC,
        byCheckId: Object.fromEntries(checks
          .filter((check) => check.formula || check.formulaBasis)
          .map((check) => {
            const ledgerFieldId = ledgerFieldIdOf(check);
            return [`${check.actionId} ${check.id}`, {
              ...(check.formula ? { formulaId: check.formula.id } : {}),
              section: sectionOf(check),
              ...(check.formulaBasis ? { title: check.formulaBasis.title } : {}),
              ...(ledgerFieldId ? { ledgerFieldId } : {}),
            }];
          })),
      },
    },
    evidenceV2: result.envelope as EvidenceEnvelopeV2,
    reconciliationReport: report,
  };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

/**
 * 跑一次完整核对。参数错误抛 TxVerifyInputError（调用方应先 normalizeTxVerifyRequest），读链失败抛
 * TxVerifyChainError（文本已脱敏），其余异常原样抛出。
 */
export async function runTxVerify(request: TxVerifyRunRequest): Promise<TxVerifyRun> {
  const generatedAt = new Date().toISOString();
  const caseId = request.caseId ?? 'adhoc-tx-verify';
  let result: TxVerifyResult;
  try {
    result = await buildEnvelopeFromTxHashes({
      env: request.env,
      hashes: request.hashes,
      ...(request.caseId ? { caseId: request.caseId } : {}),
      overrides: request.overrides,
      projectRoot: request.projectRoot,
    });
  } catch (error) {
    throw new TxVerifyChainError(`读链 / 组装证据失败：${errorMessage(error)}`);
  }

  const evidence = canonicalEvidenceEnvelopeSchema.parse(result.envelope);
  const selection = selectPlan(evidence, result.metadata);
  // 报告只聚合计划内的行（aggregateReport 会把计划外 pack/action 判为 INVALID_EVIDENCE）；
  // 元数据一致性行不属于任何计划，只并入 verdict 与输出。
  const planChecks = runCheckPlan(evidence, selection.plan);
  const report = reconciliationReportSchema.parse(aggregateReport(evidence, planChecks, selection.plan));
  const checks = [...planChecks, chainIdConsistencyCheck(result.metadata)];
  const verdict = verdictOf(checks, report, selection);
  const normalized: TxVerifyNormalizedRequest = {
    env: request.env,
    hashes: request.hashes,
    ...(request.caseId ? { caseId: request.caseId } : {}),
    overrides: request.overrides,
  };
  const artifact = toJsonValue(buildTxVerifyArtifact({
    request: normalized,
    projectRoot: request.projectRoot,
    source: request.source,
    caseId,
    generatedAt,
    result,
    selection,
    checks,
    report,
    verdict,
  }));
  return { request: normalized, caseId, generatedAt, result, evidence, selection, checks, report, verdict, artifact };
}

import type { CheckRecord, ReconciliationReport } from '../schema/check-record.js';
import {
  canonicalEvidenceEnvelopeSchema,
  type EvidenceEnvelopeInput,
} from '../../evidence/adapters/v2-to-v3.js';
import type {
  ActionEvidence,
  EvidenceCapability,
  EvidenceEnvelope,
  ScannedTransactionRef,
} from '../../evidence/evidence-v3.js';
import { resolveExecutionTransaction } from '../../evidence/execution-transaction.js';
import { computeEvidenceDigest, sha256CanonicalJson } from '../../evidence/evidence-digest.js';
import {
  computeCheckPlanDigest,
  requiredCapabilitiesForPlan,
  runCheckPlan,
  type CheckPlan,
} from './check-engine.js';

type LayerVerdict = ReconciliationReport['layers'][string];

const subjects = ['chain-state', 'chain-event', 'keeper', 'indexer', 'frontend'] as const;
const submissionActionTypes = new Set(['submitMarketIncrease', 'placeLimit', 'submitMarketDecrease', 'addTpSl']);
const operationalOutcomePolicy: Readonly<Record<string, readonly ActionEvidence['outcome'][]>> = {
  submitMarketIncrease: ['SUBMITTED'],
  placeLimit: ['SUBMITTED'],
  submitMarketDecrease: ['SUBMITTED'],
  addTpSl: ['SUBMITTED', 'EXECUTED'],
  movePrice: ['OBSERVED', 'EXECUTED'],
  advanceTime: ['OBSERVED', 'EXECUTED'],
};

function aggregateLayer(rows: CheckRecord[], required: boolean): LayerVerdict {
  if (rows.length === 0) return required ? 'INCOMPLETE' : 'NOT_RUN';
  if (rows.some((row) => row.severity === 'blocking' && row.verdict === 'FAIL')) return 'FAIL';
  if (rows.some((row) => row.severity === 'blocking' && row.verdict === 'NOT_VERIFIED')) return 'INCOMPLETE';
  if (rows.every((row) => row.verdict === 'NOT_APPLICABLE')) return 'NOT_APPLICABLE';
  return 'PASS';
}

export function aggregateReport(
  evidenceInput: EvidenceEnvelopeInput,
  checks: CheckRecord[],
  plan?: CheckPlan,
): ReconciliationReport {
  const checkPlan = plan
    ? { id: plan.id, version: plan.version }
    : { id: 'unbound', version: '0' };
  const checkPlanDigest = plan
    ? computeCheckPlanDigest(plan)
    : sha256CanonicalJson({ schemaVersion: 1, id: 'unbound', version: '0' });
  const schemaResult = canonicalEvidenceEnvelopeSchema.safeParse(evidenceInput);
  if (!schemaResult.success) {
    const reasons = schemaResult.error.issues.map((issue) => `Schema ${issue.path.join('.') || '<root>'}: ${issue.message}`);
    const identity = evidenceInput as Partial<Pick<EvidenceEnvelope, 'caseId' | 'variantId' | 'executionId'>>;
    return {
      schemaVersion: 2,
      caseId: identity.caseId || '<invalid-case>',
      variantId: identity.variantId || '<invalid-variant>',
      executionId: identity.executionId || '<invalid-execution>',
      evidenceDigest: sha256CanonicalJson(evidenceInput),
      checkPlan,
      checkPlanDigest,
      status: 'INVALID_EVIDENCE',
      layers: {
        'chain-state': 'NOT_RUN', 'chain-event': 'NOT_RUN', keeper: 'NOT_RUN', indexer: 'NOT_RUN', frontend: 'NOT_RUN',
        cleanup: 'NOT_RUN', evidenceIntegrity: 'FAIL',
      },
      integrity: { status: 'FAIL', invalid: true, reasons },
      checks,
    };
  }
  const evidence = schemaResult.data;
  let authoritativeChecks = checks;
  let planExecutionError: string | undefined;
  let suppliedChecksMismatch = false;
  if (plan) {
    try {
      authoritativeChecks = runCheckPlan(evidence, plan);
      suppliedChecksMismatch = sha256CanonicalJson(authoritativeChecks) !== sha256CanonicalJson(checks);
    } catch (error) {
      authoritativeChecks = [];
      planExecutionError = error instanceof Error ? error.message : String(error);
    }
  }
  const requiredSubjects = new Set<string>();
  if (evidence.capabilities.some((capability) => ['position-state', 'ledger', 'claimable-ledger', 'parameters', 'oracle'].includes(capability))) {
    requiredSubjects.add('chain-state');
  }
  if (evidence.capabilities.some((capability) => ['order-events', 'fee', 'funding'].includes(capability))) {
    requiredSubjects.add('chain-event');
  }
  if (evidence.capabilities.includes('keeper')) requiredSubjects.add('keeper');
  if (evidence.capabilities.includes('indexer')) requiredSubjects.add('indexer');
  if (evidence.capabilities.includes('frontend')) requiredSubjects.add('frontend');
  const layers: Record<string, LayerVerdict> = Object.fromEntries(subjects.map((subject) => [
    subject,
    aggregateLayer(authoritativeChecks.filter((row) => row.subject === subject), requiredSubjects.has(subject)),
  ]));
  layers.cleanup = aggregateLayer(authoritativeChecks.filter((row) => row.purpose === 'cleanup'), false);
  const assessedIntegrity = assessEvidenceIntegrity(evidence, authoritativeChecks, plan);
  const bindingReasons = [
    ...(planExecutionError ? [`CheckPlan 执行失败：${planExecutionError}`] : []),
    ...(suppliedChecksMismatch ? ['调用方传入的 checks 与可信 CheckPlan 对当前 Evidence 重新计算的结果不一致'] : []),
    ...(!plan ? ['未绑定可信 CheckPlan；不能仅凭 Evidence 自述的 flowType/capabilities 或外部传入 checks 判为完整'] : []),
  ];
  const bindingInvalid = planExecutionError !== undefined || suppliedChecksMismatch;
  const integrity = bindingReasons.length === 0 ? assessedIntegrity : {
    invalid: assessedIntegrity.invalid || bindingInvalid,
    layer: assessedIntegrity.invalid || bindingInvalid ? 'FAIL' as const : 'INCOMPLETE' as const,
    reasons: [...assessedIntegrity.reasons, ...bindingReasons],
  };
  layers.evidenceIntegrity = integrity.layer;

  const values = Object.values(layers);
  const warningGap = authoritativeChecks.some((check) => check.severity === 'warning'
    && (check.verdict === 'FAIL' || check.verdict === 'NOT_VERIFIED' || check.verification === 'NOT_VERIFIED'));
  const status = integrity.invalid ? 'INVALID_EVIDENCE'
    : values.includes('FAIL') ? 'FAIL'
      : values.includes('INCOMPLETE') || warningGap ? 'PASS_WITH_GAPS'
      : 'PASS';
  return {
    schemaVersion: 2,
    caseId: evidence.caseId,
    variantId: evidence.variantId,
    executionId: evidence.executionId,
    evidenceDigest: computeEvidenceDigest(evidence),
    checkPlan,
    checkPlanDigest,
    status,
    layers,
    integrity: { status: integrity.layer, invalid: integrity.invalid, reasons: [...integrity.reasons] },
    checks: authoritativeChecks,
  };
}

export interface EvidenceIntegrityAssessment {
  readonly layer: 'PASS' | 'FAIL' | 'INCOMPLETE';
  readonly invalid: boolean;
  readonly reasons: readonly string[];
}

export function assessEvidenceIntegrity(
  evidence: EvidenceEnvelope,
  checks: readonly CheckRecord[],
  plan?: CheckPlan,
): EvidenceIntegrityAssessment {
  const reasons: string[] = [];
  const envelopeIntegrity = assessEnvelopeIdentityAndOrder(evidence);
  reasons.push(...envelopeIntegrity.reasons.map((reason) => `Envelope: ${reason}`));
  let invalid = envelopeIntegrity.invalid;
  const crossWindowIntegrity = assessCrossWindowChain(evidence);
  reasons.push(...crossWindowIntegrity.reasons.map((reason) => `Window chain: ${reason}`));
  invalid ||= crossWindowIntegrity.invalid;
  const blockHashIntegrity = assessGlobalBlockHashConsistency(evidence);
  reasons.push(...blockHashIntegrity.reasons.map((reason) => `Block hash: ${reason}`));
  invalid ||= blockHashIntegrity.invalid;
  const capabilityIntegrity = assessCapabilityAndFlowIntegrity(evidence);
  reasons.push(...capabilityIntegrity.reasons.map((reason) => `Capability/Flow: ${reason}`));
  invalid ||= capabilityIntegrity.invalid;
  if (plan) {
    const planIntegrity = assessCheckPlanConformance(evidence, checks, plan);
    reasons.push(...planIntegrity.reasons.map((reason) => `CheckPlan ${plan.id}@${plan.version}: ${reason}`));
    invalid ||= planIntegrity.invalid;
  }
  for (const action of evidence.actions) {
    const result = assessActionIntegrity(action, evidence);
    reasons.push(...result.reasons.map((reason) => `${action.actionId}: ${reason}`));
    invalid ||= result.invalid;
  }
  const orderedActions = [...evidence.actions].sort((left, right) => left.sequence - right.sequence);
  const submittedOrderKeys = new Set<string>();
  const consumedOrderKeys = new Map<string, string>();
  for (const action of orderedActions) {
    if (action.outcome === 'SUBMITTED') {
      if (submissionActionTypes.has(action.type)) {
        for (const transaction of action.transactions) {
          if (transaction.orderKey) submittedOrderKeys.add(transaction.orderKey.toLowerCase());
        }
        for (const orderKey of Object.values(action.orderRefs ?? {})) submittedOrderKeys.add(orderKey.toLowerCase());
      }
      continue;
    }
    if (action.type !== 'executeOrder' || !['EXECUTED', 'CANCELLED', 'FROZEN'].includes(action.outcome)) continue;
    const execution = resolveExecutionTransaction(action);
    if (execution.status !== 'RESOLVED') continue;
    const orderKey = execution.transaction.orderKey;
    if (!orderKey) {
      reasons.push(`${action.actionId}: 执行交易缺少 orderKey`);
      continue;
    }
    const normalizedOrderKey = orderKey.toLowerCase();
    const previousTerminal = consumedOrderKeys.get(normalizedOrderKey);
    if (previousTerminal) {
      invalid = true;
      reasons.push(`${action.actionId}: orderKey 已被 ${previousTerminal} EXECUTED/CANCELLED 终态消费，不得再次结算`);
    }
    const executionDeclaredOrderKeys = Object.values(action.orderRefs ?? {}).map((value) => value.toLowerCase());
    if (executionDeclaredOrderKeys.length > 0 && !executionDeclaredOrderKeys.includes(normalizedOrderKey)) {
      invalid = true;
      reasons.push(`${action.actionId}: 执行交易 tx.orderKey 与本动作 orderRefs 不一致`);
    }
    const matchingSubmissions = orderedActions
      .filter((candidate) => candidate.sequence < action.sequence
        && candidate.outcome === 'SUBMITTED'
        && submissionActionTypes.has(candidate.type))
      .flatMap((candidate) => candidate.transactions.map((transaction) => ({ candidate, transaction })))
      .filter(({ transaction }) => transaction.orderKey?.toLowerCase() === normalizedOrderKey);
    if (matchingSubmissions.length === 0) {
      if (submittedOrderKeys.has(normalizedOrderKey)) {
        reasons.push(`${action.actionId}: 此前仅有 orderRefs 声明该 orderKey，缺少唯一提交交易的 tx.orderKey 因果锚点`);
      } else {
        invalid = true;
        reasons.push(`${action.actionId}: 执行交易 orderKey 与此前提交订单不一致`);
      }
    } else if (matchingSubmissions.length > 1) {
      invalid = true;
      reasons.push(`${action.actionId}: orderKey 匹配到 ${matchingSubmissions.length} 笔此前提交交易，因果关系不唯一`);
    } else {
      const { candidate, transaction: submission } = matchingSubmissions[0]!;
      if (BigInt(submission.blockNumber) > BigInt(execution.transaction.blockNumber)) {
        invalid = true;
        reasons.push(`${action.actionId}: 提交交易 ${candidate.actionId}/${submission.txHash} 晚于执行交易`);
      }
      const declaredOrderKeys = Object.values(candidate.orderRefs ?? {})
        .map((value) => value.toLowerCase());
      if (declaredOrderKeys.length > 0 && !declaredOrderKeys.includes(normalizedOrderKey)) {
        invalid = true;
        reasons.push(`${action.actionId}: 提交交易 tx.orderKey 与 ${candidate.actionId}.orderRefs 不一致`);
      }
    }
    if (action.outcome === 'EXECUTED' || action.outcome === 'CANCELLED') {
      consumedOrderKeys.set(normalizedOrderKey, action.actionId);
    }
  }
  if (checks.some((check) => check.severity === 'blocking'
    && (check.verdict === 'NOT_VERIFIED' || check.verification === 'NOT_VERIFIED'))) {
    reasons.push('CheckPack 必需原始输入或 capability 缺失');
  }
  return {
    layer: invalid ? 'FAIL' : reasons.length > 0 ? 'INCOMPLETE' : 'PASS',
    invalid,
    reasons,
  };
}

function assessCapabilityAndFlowIntegrity(
  evidence: EvidenceEnvelope,
): { invalid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let invalid = false;
  const envelopeCapabilities = new Set(evidence.capabilities);
  const actionCapabilities = new Set<EvidenceCapability>();
  let transactionCount = 0;

  for (const action of evidence.actions) {
    const declared = new Set(action.capabilities);
    for (const capability of declared) {
      actionCapabilities.add(capability);
      if (!envelopeCapabilities.has(capability)) {
        invalid = true;
        reasons.push(`${action.actionId}.capabilities 包含 ${capability}，但 Envelope.capabilities 未覆盖`);
      }
    }

    transactionCount += action.transactions.length;
    const implied = new Set<EvidenceCapability>();
    if (action.transactions.length > 0) implied.add('transaction');
    if (action.transactions.some((transaction) => transaction.role === 'keeper' || transaction.role === 'service')) {
      implied.add('keeper');
    }
    if (action.events.some((event) => event.name.startsWith('Order'))) implied.add('order-events');
    if (action.events.some((event) => event.name === 'PositionFeesCollected')) implied.add('fee');
    if (action.events.some((event) => event.name.toLowerCase().includes('funding'))) implied.add('funding');
    if (action.parameters.length > 0) implied.add('parameters');
    if (action.oracle.length > 0) implied.add('oracle');
    if (action.frontend) implied.add('frontend');
    for (const capability of implied) {
      if (!declared.has(capability)) {
        invalid = true;
        reasons.push(`${action.actionId} 已携带 ${capability} 原始事实，但 action.capabilities 未声明`);
      }
    }

    // transaction/frontend have one canonical carrier. Parameters and oracle
    // values may also be preserved inside decoded event/snapshot payloads by
    // legacy collectors, so an empty dedicated array is not itself a gap.
    for (const capability of ['transaction', 'frontend'] as const) {
      const hasFact = capability === 'transaction' ? action.transactions.length > 0
        : action.frontend !== undefined;
      if (declared.has(capability) && !hasFact) {
        reasons.push(`${action.actionId} 声明 ${capability} capability，但没有对应原始事实`);
      }
    }
  }

  for (const capability of envelopeCapabilities) {
    if (!actionCapabilities.has(capability)) {
      reasons.push(`Envelope.capabilities 声明 ${capability}，但没有任何 Action 承载该能力`);
    }
  }

  const submitted = evidence.actions.filter((action) => action.outcome === 'SUBMITTED').length;
  const executed = evidence.actions.filter((action) => action.outcome === 'EXECUTED').length;
  const cancelled = evidence.actions.filter((action) => action.outcome === 'CANCELLED').length;
  const terminal = evidence.actions.filter((action) => (
    action.outcome === 'EXECUTED' || action.outcome === 'CANCELLED' || action.outcome === 'FROZEN'
  )).length;
  if (evidence.flowType === 'read-only') {
    if (transactionCount > 0 || evidence.actions.some((action) => action.outcome !== 'OBSERVED')) {
      invalid = true;
      reasons.push('read-only flow 不得包含交易或非 OBSERVED 动作结果');
    }
  } else if (transactionCount === 0) {
    reasons.push(`${evidence.flowType} flow 没有任何 TransactionRef`);
  }
  if (evidence.flowType === 'create-only' && submitted < 1) {
    reasons.push('create-only flow 至少需要一个 SUBMITTED 动作');
  }
  if (evidence.flowType === 'create-execute' && (submitted < 1 || terminal < 1)) {
    reasons.push('create-execute flow 至少需要一个 SUBMITTED 和一个终态动作');
  }
  if (evidence.flowType === 'create-cancel' && (submitted < 1 || cancelled < 1)) {
    reasons.push('create-cancel flow 至少需要一个 SUBMITTED 和一个 CANCELLED 动作');
  }
  if (evidence.flowType === 'roundtrip' && (submitted < 2 || executed < 2)) {
    reasons.push('roundtrip flow 至少需要两次 SUBMITTED 和两次 EXECUTED');
  }
  if (evidence.flowType === 'multi-phase' && evidence.actions.length < 2) {
    reasons.push('multi-phase flow 至少需要两个 Action');
  }
  return { invalid, reasons };
}

function assessCheckPlanConformance(
  evidence: EvidenceEnvelope,
  checks: readonly CheckRecord[],
  plan: CheckPlan,
): { invalid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let invalid = false;
  if (!plan.id.trim() || !plan.version.trim()) reasons.push('id/version 不能为空');
  if (evidence.flowType !== plan.flowType) {
    invalid = true;
    reasons.push(`flowType 期望 ${plan.flowType}，实际 ${evidence.flowType}`);
  }
  if (plan.actions.length === 0) reasons.push('没有声明 Action 契约');
  if (evidence.actions.length !== plan.actions.length) {
    invalid = true;
    reasons.push(`Action 数量期望 ${plan.actions.length}，实际 ${evidence.actions.length}`);
  }
  for (const [index, expected] of plan.actions.entries()) {
    const action = evidence.actions[index];
    if (!action) continue;
    if (action.type !== expected.type) {
      invalid = true;
      reasons.push(`actions[${index}].type 期望 ${expected.type}，实际 ${action.type}`);
    }
    if (action.purpose !== expected.purpose) {
      invalid = true;
      reasons.push(`actions[${index}].purpose 期望 ${expected.purpose}，实际 ${action.purpose}`);
    }
    if (!expected.outcomes.includes(action.outcome)) {
      invalid = true;
      reasons.push(`actions[${index}].outcome 期望 ${expected.outcomes.join('/')}，实际 ${action.outcome}`);
    }
    const transactionPolicy = expected.transactions;
    if (!transactionPolicy) {
      reasons.push(`actions[${index}] 没有声明可信交易基数/角色策略`);
    } else {
      const ruleIds = new Set<string>();
      const transactionRule = new Map<string, typeof transactionPolicy.rules[number]>();
      const ruleCounts = new Map<string, number>();
      if (transactionPolicy.rules.length === 0) reasons.push(`actions[${index}] 的交易策略没有规则`);
      for (const rule of transactionPolicy.rules) {
        if (!rule.id.trim() || ruleIds.has(rule.id) || rule.roles.length === 0
          || !Number.isSafeInteger(rule.min) || !Number.isSafeInteger(rule.max)
          || rule.min < 0 || rule.max < rule.min) {
          reasons.push(`actions[${index}] 的交易规则 ${rule.id || '<empty>'} 配置无效`);
        }
        ruleIds.add(rule.id);
        ruleCounts.set(rule.id, 0);
        if (rule.anchor === 'oracle-ref'
          && ((rule.actors?.length ?? 0) === 0 || (rule.targets?.length ?? 0) === 0)) {
          reasons.push(`actions[${index}] 的 oracle-ref 规则 ${rule.id} 缺少可信 actor/to 白名单`);
        }
      }
      for (const transaction of action.transactions) {
        const matchingRules = transactionPolicy.rules.filter((rule) => rule.roles.includes(transaction.role));
        if (matchingRules.length !== 1) {
          invalid = true;
          reasons.push(
            `${action.actionId}/${transaction.txHash} 必须唯一匹配交易规则，`
            + `角色 ${transaction.role} 实际匹配 ${matchingRules.length} 条`,
          );
          continue;
        }
        const rule = matchingRules[0]!;
        transactionRule.set(lowerHash(transaction.txHash), rule);
        ruleCounts.set(rule.id, (ruleCounts.get(rule.id) ?? 0) + 1);
        const anchor = transactionRuleAnchor(action, transaction, rule.anchor);
        if (!anchor.anchored) {
          invalid = true;
          reasons.push(`${action.actionId}/${transaction.txHash} 未通过 ${rule.anchor} 锚点：${anchor.reason}`);
        }
        if (rule.actors && !rule.actors.some((actor) => actor.toLowerCase() === transaction.actor.toLowerCase())) {
          invalid = true;
          reasons.push(`${action.actionId}/${transaction.txHash} 的 actor 不在规则 ${rule.id} 的可信白名单`);
        }
        if (rule.targets && (!transaction.to
          || !rule.targets.some((target) => target.toLowerCase() === transaction.to?.toLowerCase()))) {
          invalid = true;
          reasons.push(`${action.actionId}/${transaction.txHash} 的 to 不在规则 ${rule.id} 的可信白名单`);
        }
      }
      for (const rule of transactionPolicy.rules) {
        const count = ruleCounts.get(rule.id) ?? 0;
        if (count < rule.min) {
          reasons.push(`${action.actionId} 的交易规则 ${rule.id} 缺少必需交易：${count} < ${rule.min}`);
        }
        if (count > rule.max) {
          invalid = true;
          reasons.push(`${action.actionId} 的交易规则 ${rule.id} 超出上限：${count} > ${rule.max}`);
        }
      }
      for (const oracle of action.oracle.filter((item) => item.transactionHash)) {
        const transactions = action.transactions.filter((item) => (
          lowerHash(item.txHash) === lowerHash(oracle.transactionHash!)
        ));
        const transaction = transactions[0];
        if (transactions.length !== 1 || !transaction || transaction.role !== 'oracle'
          || transactionRule.get(lowerHash(transaction.txHash))?.anchor !== 'oracle-ref') {
          invalid = true;
          reasons.push(`${action.actionId} 的 OracleRef.transactionHash 未唯一指向本动作 oracle TransactionRef`);
        } else if (oracle.blockNumber === undefined || oracle.blockNumber !== transaction.blockNumber) {
          invalid = true;
          reasons.push(`${action.actionId}/${transaction.txHash} 的 OracleRef.blockNumber 必须存在且与交易一致`);
        }
      }
    }
    for (const capability of expected.requiredCapabilities ?? []) {
      if (!action.capabilities.includes(capability)) {
        reasons.push(`${action.actionId} 缺少 Action 契约要求的 capability ${capability}`);
      }
    }
  }

  for (const capability of requiredCapabilitiesForPlan(plan)) {
    if (!evidence.capabilities.includes(capability)) {
      reasons.push(`Evidence 缺少 CheckPlan 要求的 capability ${capability}`);
    }
  }

  const packIds = plan.packs.map((pack) => pack.id);
  const uniquePackIds = new Set(packIds);
  if (plan.packs.length === 0) reasons.push('没有声明 CheckPack');
  if (uniquePackIds.size !== packIds.length) reasons.push('CheckPack id 必须唯一');
  const actionById = new Map(evidence.actions.map((action) => [action.actionId, action]));
  const seenRows = new Set<string>();
  for (const check of checks) {
    if (!uniquePackIds.has(check.packId)) {
      invalid = true;
      reasons.push(`核对行 ${check.id} 的 packId=${check.packId} 不属于本计划`);
    }
    if (check.actionId === 'WHOLE') {
      if (check.purpose !== 'whole-flow') {
        invalid = true;
        reasons.push(`核对行 ${check.id} 使用 WHOLE 时 purpose 必须为 whole-flow`);
      }
    } else {
      const action = actionById.get(check.actionId);
      if (!action) {
        invalid = true;
        reasons.push(`核对行 ${check.id} 引用了不存在的 actionId=${check.actionId}`);
      } else if (check.purpose !== action.purpose) {
        invalid = true;
        reasons.push(`核对行 ${check.id}.purpose=${check.purpose} 与 ${check.actionId}.purpose=${action.purpose} 不一致`);
      }
    }
    const rowKey = `${check.packId}:${check.actionId}:${check.id}`;
    if (seenRows.has(rowKey)) {
      invalid = true;
      reasons.push(`核对行键重复：${rowKey}`);
    }
    seenRows.add(rowKey);
  }
  for (const packId of uniquePackIds) {
    if (!checks.some((check) => check.packId === packId)) {
      reasons.push(`CheckPack ${packId} 没有产生任何核对行`);
    }
  }
  return { invalid, reasons };
}

function transactionRuleAnchor(
  action: ActionEvidence,
  transaction: ActionEvidence['transactions'][number],
  anchor: 'order-submission' | 'terminal-execution' | 'oracle-ref',
): { anchored: boolean; reason: string } {
  if (anchor === 'order-submission') {
    const declaredOrderKeys = Object.values(action.orderRefs ?? {}).map(lowerHash);
    return {
      anchored: transaction.orderKey !== undefined
        && declaredOrderKeys.includes(lowerHash(transaction.orderKey)),
      reason: transaction.orderKey === undefined
        ? '提交交易缺少 orderKey'
        : 'tx.orderKey 未命中 action.orderRefs',
    };
  }
  if (anchor === 'terminal-execution') {
    const resolution = resolveExecutionTransaction(action);
    return {
      anchored: resolution.status === 'RESOLVED'
        && lowerHash(resolution.transaction.txHash) === lowerHash(transaction.txHash),
      reason: resolution.status === 'RESOLVED'
        ? '交易不是唯一 execution-after Keeper/Service'
        : resolution.reason,
    };
  }
  if (anchor === 'oracle-ref') {
    const matches = action.oracle.filter((oracle) => (
      oracle.transactionHash !== undefined
      && lowerHash(oracle.transactionHash) === lowerHash(transaction.txHash)
      && oracle.blockNumber !== undefined
      && oracle.blockNumber === transaction.blockNumber
    ));
    return {
      anchored: matches.length === 1,
      reason: matches.length === 0 ? '没有匹配 OracleRef' : `匹配到 ${matches.length} 个 OracleRef`,
    };
  }
  return { anchored: false, reason: `未知锚点 ${String(anchor)}` };
}

function assessEnvelopeIdentityAndOrder(
  evidence: EvidenceEnvelope,
): { invalid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let invalid = false;
  const actionIds = evidence.actions.map((action) => action.actionId);
  if (new Set(actionIds).size !== actionIds.length) {
    invalid = true;
    reasons.push('actionId 必须全局唯一');
  }
  const sequences = evidence.actions.map((action) => action.sequence);
  if (new Set(sequences).size !== sequences.length) {
    invalid = true;
    reasons.push('action.sequence 必须全局唯一');
  }
  if (sequences.some((sequence, index) => sequence !== index + 1)) {
    invalid = true;
    reasons.push('actions[] 必须按从 1 开始的连续 sequence 保存');
  }

  const scannedOrderByHash = new Map<string, { blockNumber: bigint; transactionIndex: bigint }>();
  for (const action of evidence.actions) {
    const window = action.windowContamination;
    if (!window || window.status === 'NOT_CHECKED') continue;
    for (const transaction of window.inspectedTransactions) {
      const hash = lowerHash(transaction.txHash);
      const order = {
        blockNumber: BigInt(transaction.blockNumber),
        transactionIndex: BigInt(transaction.transactionIndex),
      };
      const previous = scannedOrderByHash.get(hash);
      if (previous && (previous.blockNumber !== order.blockNumber
        || previous.transactionIndex !== order.transactionIndex)) {
        invalid = true;
        reasons.push(`交易 ${transaction.txHash} 在不同窗口的 block/transactionIndex 不一致`);
      } else {
        scannedOrderByHash.set(hash, order);
      }
    }
  }

  const transactionOwners = new Map<string, string>();
  const transactionsByActor = new Map<string, Array<{
    blockNumber: bigint;
    nonce: bigint;
    txHash: string;
    sequence: number;
  }>>();
  let previousActionLastBlock: bigint | undefined;
  for (const action of evidence.actions) {
    let previousBlock: bigint | undefined;
    for (const transaction of action.transactions) {
      const hash = lowerHash(transaction.txHash);
      const previousOwner = transactionOwners.get(hash);
      if (previousOwner) {
        invalid = true;
        reasons.push(`交易 ${transaction.txHash} 被 ${previousOwner}/${action.actionId} 重复登记`);
      } else {
        transactionOwners.set(hash, action.actionId);
      }
      const block = BigInt(transaction.blockNumber);
      if (transaction.nonce === undefined) {
        reasons.push(`交易 ${transaction.txHash} 缺少 nonce，无法做 Envelope 级重放/顺序核对`);
      } else {
        const actor = transaction.actor.toLowerCase();
        const actorTransactions = transactionsByActor.get(actor) ?? [];
        actorTransactions.push({
          blockNumber: block,
          nonce: BigInt(transaction.nonce),
          txHash: transaction.txHash,
          sequence: action.sequence,
        });
        transactionsByActor.set(actor, actorTransactions);
      }
      if (previousBlock !== undefined && block < previousBlock) {
        invalid = true;
        reasons.push(`${action.actionId}.transactions 未按区块顺序保存`);
      }
      previousBlock = block;
    }
    if (action.transactions.length === 0) continue;
    const firstBlock = BigInt(action.transactions[0]!.blockNumber);
    const lastBlock = BigInt(action.transactions.at(-1)!.blockNumber);
    if (previousActionLastBlock !== undefined && firstBlock < previousActionLastBlock) {
      invalid = true;
      reasons.push(`${action.actionId} 的交易区块早于此前动作，违反 sequence 时间顺序`);
    }
    previousActionLastBlock = lastBlock;
  }
  for (const [actor, transactions] of transactionsByActor) {
    const byBlock = new Map<string, typeof transactions>();
    for (const transaction of transactions) {
      const blockNumber = transaction.blockNumber.toString();
      byBlock.set(blockNumber, [...(byBlock.get(blockNumber) ?? []), transaction]);
    }
    for (const [blockNumber, sameBlock] of byBlock) {
      if (sameBlock.length > 1 && sameBlock.some((transaction) => !scannedOrderByHash.has(lowerHash(transaction.txHash)))) {
        reasons.push(`actor ${actor} 在同块 ${blockNumber} 有多笔已登记交易，但缺少完整扫描 transactionIndex，无法证明 nonce 顺序`);
      }
    }
    const sorted = [...transactions].sort((left, right) => {
      if (left.blockNumber !== right.blockNumber) return left.blockNumber < right.blockNumber ? -1 : 1;
      const leftOrder = scannedOrderByHash.get(lowerHash(left.txHash));
      const rightOrder = scannedOrderByHash.get(lowerHash(right.txHash));
      if (leftOrder && rightOrder && leftOrder.transactionIndex !== rightOrder.transactionIndex) {
        return leftOrder.transactionIndex < rightOrder.transactionIndex ? -1 : 1;
      }
      if (left.sequence !== right.sequence) return left.sequence - right.sequence;
      return left.txHash.localeCompare(right.txHash);
    });
    let previous: typeof sorted[number] | undefined;
    for (const current of sorted) {
      if (previous && current.nonce <= previous.nonce) {
        invalid = true;
        reasons.push(
          `actor ${actor} 的已登记交易 nonce 未全局严格递增：`
          + `${previous.txHash}@${previous.blockNumber}/${previous.nonce} -> `
          + `${current.txHash}@${current.blockNumber}/${current.nonce}`,
        );
      }
      previous = current;
    }
  }
  return { invalid, reasons };
}

function assessCrossWindowChain(
  evidence: EvidenceEnvelope,
): { invalid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let invalid = false;
  const completedWindows = evidence.actions.flatMap((action) => {
    const window = action.windowContamination;
    return window && window.status !== 'NOT_CHECKED' ? [{ actionId: action.actionId, window }] : [];
  });
  if (completedWindows.length < 2) return { invalid, reasons };

  const blocks = new Map<string, {
    actionId: string;
    blockHash: string;
    parentHash: string;
    transactionHashes: readonly string[];
  }>();
  for (const { actionId, window } of completedWindows) {
    for (const block of window.inspectedBlocks) {
      const previous = blocks.get(block.blockNumber);
      if (previous) {
        const sameTransactions = previous.transactionHashes.length === block.transactionHashes.length
          && previous.transactionHashes.every((hash, index) => (
            lowerHash(hash) === lowerHash(block.transactionHashes[index]!)
          ));
        if (lowerHash(previous.blockHash) !== lowerHash(block.blockHash)
          || lowerHash(previous.parentHash) !== lowerHash(block.parentHash)
          || !sameTransactions) {
          invalid = true;
          reasons.push(`重叠区块 ${block.blockNumber} 在 ${previous.actionId}/${actionId} 的扫描凭证不一致`);
        }
      } else {
        blocks.set(block.blockNumber, {
          actionId,
          blockHash: block.blockHash,
          parentHash: block.parentHash,
          transactionHashes: block.transactionHashes,
        });
      }
    }
  }
  const ordered = [...blocks.entries()].sort(([left], [right]) => (
    BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0
  ));
  for (let index = 1; index < ordered.length; index += 1) {
    const [previousNumber, previous] = ordered[index - 1]!;
    const [currentNumber, current] = ordered[index]!;
    const distance = BigInt(currentNumber) - BigInt(previousNumber);
    if (distance === 1n) {
      if (lowerHash(current.parentHash) !== lowerHash(previous.blockHash)) {
        invalid = true;
        reasons.push(`相邻窗口区块 ${currentNumber}.parentHash 未连接 ${previousNumber}.blockHash`);
      }
    } else if (distance > 1n) {
      reasons.push(`完成扫描的窗口在区块 ${previousNumber}..${currentNumber} 之间有未覆盖链段，无法证明跨窗口同链`);
    }
  }
  return { invalid, reasons };
}

function assessGlobalBlockHashConsistency(
  evidence: EvidenceEnvelope,
): { invalid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let invalid = false;
  const blockHashes = new Map<string, { hash: string; source: string }>();
  const register = (blockNumber: string, blockHash: string | undefined, source: string): void => {
    if (!blockHash) return;
    const previous = blockHashes.get(blockNumber);
    if (previous && lowerHash(previous.hash) !== lowerHash(blockHash)) {
      invalid = true;
      reasons.push(`同一高度 ${blockNumber} 出现不同 blockHash：${previous.source}/${previous.hash} 与 ${source}/${blockHash}`);
      return;
    }
    if (!previous) blockHashes.set(blockNumber, { hash: blockHash, source });
  };
  for (const action of evidence.actions) {
    for (const transaction of action.transactions) {
      register(transaction.blockNumber, transaction.blockHash, `${action.actionId}.transaction(${transaction.txHash})`);
      register(transaction.receipt?.blockNumber ?? transaction.blockNumber, transaction.receipt?.blockHash,
        `${action.actionId}.receipt(${transaction.txHash})`);
    }
    for (const snapshot of action.snapshots) {
      register(snapshot.blockNumber, snapshot.blockHash, `${action.actionId}.snapshot(${snapshot.id})`);
    }
    const window = action.windowContamination;
    if (!window || window.status === 'NOT_CHECKED') continue;
    for (const block of window.inspectedBlocks) {
      register(block.blockNumber, block.blockHash, `${action.actionId}.window.block(${block.blockNumber})`);
    }
    for (const transaction of window.inspectedTransactions) {
      register(transaction.blockNumber, transaction.blockHash, `${action.actionId}.window.transaction(${transaction.txHash})`);
    }
  }
  return { invalid, reasons };
}

function lowerHash(value: string): string {
  return value.toLowerCase();
}

function scannedTransactionKey(transaction: ScannedTransactionRef): string {
  return `${transaction.blockNumber}:${lowerHash(transaction.txHash)}`;
}

function completedWindowIntegrity(
  evidence: EvidenceEnvelope,
  action: ActionEvidence,
  transaction: ActionEvidence['transactions'][number],
): { invalid: boolean; reasons: string[] } {
  const window = action.windowContamination;
  if (!window || window.status === 'NOT_CHECKED') {
    const legacyPolluted = window?.status === 'NOT_CHECKED' && window.legacyClaim?.status === 'POLLUTED';
    return {
      invalid: legacyPolluted,
      reasons: [legacyPolluted
        ? 'Evidence V2 已声明执行窗口 POLLUTED；虽缺 V3 逐块凭证，污染结论不得降级'
        : '执行窗口污染检查没有完成；需要 V3 CLEAN/POLLUTED 逐块扫描凭证'],
    };
  }

  const reasons: string[] = [];
  let invalid = window.status === 'POLLUTED';
  if (window.status === 'POLLUTED') reasons.push('执行窗口被非预期交易污染');

  const fromBlock = BigInt(window.fromBlock);
  const toBlock = BigInt(window.toBlock);
  if (fromBlock > toBlock) {
    invalid = true;
    reasons.push(`污染扫描区块范围倒序：${window.fromBlock}..${window.toBlock}`);
  }
  if (toBlock !== BigInt(transaction.blockNumber)) {
    invalid = true;
    reasons.push(`污染扫描必须截止执行块 ${transaction.blockNumber}，实际 ${window.toBlock}`);
  }
  const before = action.snapshots.find((item) => item.kind === 'execution-before');
  if (before && fromBlock > BigInt(before.blockNumber)) {
    invalid = true;
    reasons.push(`污染扫描起点 ${window.fromBlock} 未覆盖 execution-before ${before.blockNumber}`);
  }
  const orderKey = action.type === 'executeOrder' ? transaction.orderKey?.toLowerCase() : undefined;
  const submissionTransactions = orderKey
    ? evidence.actions
      .filter((candidate) => candidate.sequence < action.sequence && candidate.outcome === 'SUBMITTED')
      .flatMap((candidate) => candidate.transactions)
      .filter((candidate) => candidate.orderKey?.toLowerCase() === orderKey)
      .sort((left, right) => (
        BigInt(left.blockNumber) < BigInt(right.blockNumber) ? 1
          : BigInt(left.blockNumber) > BigInt(right.blockNumber) ? -1 : 0
      ))
    : [];
  const submissionTransaction = submissionTransactions.length === 1 ? submissionTransactions[0] : undefined;
  if (action.type === 'executeOrder' && transaction.orderKey && submissionTransactions.length === 0) {
    reasons.push('污染窗口无法定位带 tx.orderKey 的唯一提交交易');
  }
  if (submissionTransactions.length > 1) {
    invalid = true;
    reasons.push(`污染窗口的 orderKey 匹配到 ${submissionTransactions.length} 笔提交交易`);
  }
  if (submissionTransaction && fromBlock > BigInt(submissionTransaction.blockNumber)) {
    invalid = true;
    reasons.push(`污染扫描起点 ${window.fromBlock} 未覆盖提交交易区块 ${submissionTransaction.blockNumber}`);
  }
  if (window.source.blockNumber !== window.toBlock) {
    invalid = true;
    reasons.push(`污染扫描 source.blockNumber 必须等于 toBlock，实际 ${window.source.blockNumber}/${window.toBlock}`);
  }

  const sortedBlocks = [...window.inspectedBlocks].sort((left, right) => (
    BigInt(left.blockNumber) < BigInt(right.blockNumber) ? -1 : BigInt(left.blockNumber) > BigInt(right.blockNumber) ? 1 : 0
  ));
  const uniqueBlockNumbers = new Set(sortedBlocks.map((item) => item.blockNumber));
  if (uniqueBlockNumbers.size !== sortedBlocks.length) {
    invalid = true;
    reasons.push('污染扫描存在重复区块');
  }
  const uniqueBlockHashes = new Set(sortedBlocks.map((item) => lowerHash(item.blockHash)));
  if (uniqueBlockHashes.size !== sortedBlocks.length) {
    invalid = true;
    reasons.push('污染扫描的不同区块复用了同一 blockHash');
  }
  const expectedBlockCount = toBlock >= fromBlock ? toBlock - fromBlock + 1n : 0n;
  if (BigInt(sortedBlocks.length) !== expectedBlockCount
    || sortedBlocks.some((block, index) => BigInt(block.blockNumber) !== fromBlock + BigInt(index))) {
    invalid = true;
    reasons.push(`污染扫描没有逐块覆盖 ${window.fromBlock}..${window.toBlock}`);
  }
  const blockHashIndexes = new Map(sortedBlocks.map((block, index) => [lowerHash(block.blockHash), index]));
  for (const [index, block] of sortedBlocks.entries()) {
    const parentIndex = blockHashIndexes.get(lowerHash(block.parentHash));
    if (parentIndex !== undefined && parentIndex >= index) {
      invalid = true;
      reasons.push(`区块 ${block.blockNumber}.parentHash 指向窗口内同高或更高区块，形成不可能的环/未来引用`);
    }
  }
  for (let index = 1; index < sortedBlocks.length; index += 1) {
    const previous = sortedBlocks[index - 1]!;
    const current = sortedBlocks[index]!;
    if (lowerHash(current.parentHash) !== lowerHash(previous.blockHash)) {
      invalid = true;
      reasons.push(`区块 ${current.blockNumber}.parentHash 未连接前一区块 ${previous.blockNumber}.blockHash`);
    }
  }

  const blockByNumber = new Map(sortedBlocks.map((block) => [block.blockNumber, block]));
  for (const snapshot of action.snapshots.filter((item) => (
    item.kind === 'execution-before' || item.kind === 'execution-after'
  ))) {
    const scannedBlock = blockByNumber.get(snapshot.blockNumber);
    if (!snapshot.blockHash) {
      reasons.push(`${snapshot.kind} 缺少 blockHash，无法与逐块扫描排除重组`);
    } else if (!scannedBlock || lowerHash(scannedBlock.blockHash) !== lowerHash(snapshot.blockHash)) {
      invalid = true;
      reasons.push(`${snapshot.kind} blockHash 与 inspectedBlocks[${snapshot.blockNumber}] 不一致`);
    }
  }
  const blockTransactionKeys = new Set<string>();
  const blockTransactionHashes = new Set<string>();
  for (const block of sortedBlocks) {
    const hashes = block.transactionHashes.map(lowerHash);
    if (new Set(hashes).size !== hashes.length) {
      invalid = true;
      reasons.push(`区块 ${block.blockNumber} 的扫描交易 hash 重复`);
    }
    for (const hash of hashes) {
      if (blockTransactionHashes.has(hash)) {
        invalid = true;
        reasons.push(`扫描交易 ${hash} 同时出现在多个区块`);
      }
      blockTransactionHashes.add(hash);
      blockTransactionKeys.add(`${block.blockNumber}:${hash}`);
    }
  }

  const inspectedKeys = window.inspectedTransactions.map(scannedTransactionKey);
  const inspectedKeySet = new Set(inspectedKeys);
  if (inspectedKeySet.size !== inspectedKeys.length) {
    invalid = true;
    reasons.push('污染扫描交易列表存在重复 hash/block');
  }
  for (const scanned of window.inspectedTransactions) {
    const block = BigInt(scanned.blockNumber);
    if (block < fromBlock || block > toBlock) {
      invalid = true;
      reasons.push(`扫描交易 ${scanned.txHash} 的区块 ${scanned.blockNumber} 超出窗口`);
    }
    const scannedBlock = blockByNumber.get(scanned.blockNumber);
    if (!scannedBlock || !blockTransactionKeys.has(scannedTransactionKey(scanned))) {
      invalid = true;
      reasons.push(`扫描交易 ${scanned.txHash} 未出现在 inspectedBlocks`);
    } else if (scanned.blockHash && lowerHash(scanned.blockHash) !== lowerHash(scannedBlock.blockHash)) {
      invalid = true;
      reasons.push(`扫描交易 ${scanned.txHash} 的 blockHash 与区块清单不一致`);
    }
  }
  if (blockTransactionKeys.size !== inspectedKeySet.size
    || [...blockTransactionKeys].some((key) => !inspectedKeySet.has(key))) {
    invalid = true;
    reasons.push('inspectedTransactions 与 inspectedBlocks.transactionHashes 不完整对应');
  }
  const inspectedByKey = new Map(window.inspectedTransactions.map((item) => [scannedTransactionKey(item), item]));
  for (const block of sortedBlocks) {
    block.transactionHashes.forEach((hash, index) => {
      const scanned = inspectedByKey.get(`${block.blockNumber}:${lowerHash(hash)}`);
      if (scanned && BigInt(scanned.transactionIndex) !== BigInt(index)) {
        invalid = true;
        reasons.push(`扫描交易 ${hash} 的 transactionIndex=${scanned.transactionIndex} 与区块顺序 ${index} 不一致`);
      }
    });
  }
  const scannedInChainOrder = [...window.inspectedTransactions].sort((left, right) => {
    const blockDifference = BigInt(left.blockNumber) - BigInt(right.blockNumber);
    if (blockDifference !== 0n) return blockDifference < 0n ? -1 : 1;
    const indexDifference = BigInt(left.transactionIndex) - BigInt(right.transactionIndex);
    return indexDifference < 0n ? -1 : indexDifference > 0n ? 1 : 0;
  });
  const lastNonceByActor = new Map<string, bigint>();
  for (const scanned of scannedInChainOrder) {
    const actor = scanned.actor.toLowerCase();
    const nonce = BigInt(scanned.nonce);
    const previousNonce = lastNonceByActor.get(actor);
    if (previousNonce !== undefined && nonce <= previousNonce) {
      invalid = true;
      reasons.push(`actor ${scanned.actor} 的扫描 nonce 未严格递增：${previousNonce.toString()} -> ${nonce.toString()}`);
    }
    lastNonceByActor.set(actor, nonce);
  }

  const expectedTransactions = new Map(evidence.actions
    .filter((item) => item.sequence <= action.sequence)
    .flatMap((item) => item.transactions.map((itemTransaction) => [
    lowerHash(itemTransaction.txHash),
    { actionId: item.actionId, transaction: itemTransaction },
  ] as const)));
  const externalHashes = new Set<string>();
  for (const scanned of window.inspectedTransactions) {
    const expected = expectedTransactions.get(lowerHash(scanned.txHash));
    if (!expected) {
      externalHashes.add(lowerHash(scanned.txHash));
      if (scanned.role) {
        invalid = true;
        reasons.push(`未登记交易 ${scanned.txHash} 不得声明业务角色 ${scanned.role}`);
      }
    } else {
      if (scanned.blockNumber !== expected.transaction.blockNumber) {
        invalid = true;
        reasons.push(`扫描交易 ${scanned.txHash} 的区块与 ${expected.actionId} 登记交易不一致`);
      }
      if (scanned.actor.toLowerCase() !== expected.transaction.actor.toLowerCase()) {
        invalid = true;
        reasons.push(`扫描交易 ${scanned.txHash} 的 actor 与 ${expected.actionId} 登记交易不一致`);
      }
      if (scanned.to?.toLowerCase() !== expected.transaction.to?.toLowerCase()) {
        invalid = true;
        reasons.push(`扫描交易 ${scanned.txHash} 的 to 与 ${expected.actionId} 登记交易不一致`);
      }
      if (!expected.transaction.nonce) {
        reasons.push(`登记交易 ${expected.actionId}/${scanned.txHash} 缺少 nonce 锚点`);
      } else if (scanned.nonce !== expected.transaction.nonce) {
        invalid = true;
        reasons.push(`扫描交易 ${scanned.txHash} 的 nonce 与 ${expected.actionId} 登记交易不一致`);
      }
      if (expected.transaction.transactionType
        && scanned.transactionType?.toLowerCase() !== expected.transaction.transactionType.toLowerCase()) {
        invalid = true;
        reasons.push(`扫描交易 ${scanned.txHash} 的 transactionType 与 ${expected.actionId} 登记交易不一致`);
      }
      if (!scanned.role) {
        invalid = true;
        reasons.push(`扫描中的已登记交易 ${scanned.txHash} 缺少业务角色`);
      } else if (scanned.role !== expected.transaction.role) {
        invalid = true;
        reasons.push(`扫描交易 ${scanned.txHash} 的角色与 ${expected.actionId} 不一致`);
      }
      const inspectedBlock = blockByNumber.get(scanned.blockNumber);
      const actionBlockHash = expected.transaction.blockHash;
      const receiptBlockHash = expected.transaction.receipt?.blockHash;
      if (!actionBlockHash || !receiptBlockHash) {
        reasons.push(`扫描交易 ${scanned.txHash} 缺少 Action transaction/receipt blockHash 锚点`);
      } else if (!inspectedBlock
        || lowerHash(inspectedBlock.blockHash) !== lowerHash(actionBlockHash)
        || lowerHash(inspectedBlock.blockHash) !== lowerHash(receiptBlockHash)) {
        invalid = true;
        reasons.push(`扫描区块 ${scanned.blockNumber} 的 blockHash 与 ${expected.actionId} transaction/receipt 不一致`);
      }
    }
  }
  for (const { actionId, transaction: registered } of expectedTransactions.values()) {
    const registeredBlock = BigInt(registered.blockNumber);
    if (registeredBlock < fromBlock || registeredBlock > toBlock) continue;
    if (!inspectedKeySet.has(`${registered.blockNumber}:${lowerHash(registered.txHash)}`)) {
      invalid = true;
      reasons.push(`污染扫描遗漏窗口内已登记交易 ${actionId}/${registered.txHash}`);
    }
  }
  const unexpectedHashes = new Set(window.unexpectedTransactions.map((item) => lowerHash(item.txHash)));
  if (unexpectedHashes.size !== window.unexpectedTransactions.length) {
    invalid = true;
    reasons.push('unexpectedTransactions 存在重复 hash');
  }
  if (window.unexpectedTransactions.some((item) => item.role !== undefined)) {
    invalid = true;
    reasons.push('未登记的 unexpectedTransactions 不得声明业务角色');
  }
  if ([...unexpectedHashes].some((hash) => !externalHashes.has(hash))
    || [...externalHashes].some((hash) => !unexpectedHashes.has(hash))) {
    invalid = true;
    reasons.push('unexpectedTransactions 必须与扫描中未登记交易的集合完全一致');
  }
  if (window.unexpectedTransactions.some((item) => !inspectedKeySet.has(scannedTransactionKey(item)))) {
    invalid = true;
    reasons.push('unexpectedTransactions 必须是 inspectedTransactions 的 hash/block 子集');
  }
  if (!inspectedKeys.includes(`${transaction.blockNumber}:${lowerHash(transaction.txHash)}`)) {
    invalid = true;
    reasons.push(`污染扫描没有包含执行交易 ${transaction.txHash}`);
  }
  if (submissionTransaction
    && !inspectedKeySet.has(`${submissionTransaction.blockNumber}:${lowerHash(submissionTransaction.txHash)}`)) {
    invalid = true;
    reasons.push(`污染扫描没有包含提交交易 ${submissionTransaction.txHash}`);
  }
  if (submissionTransaction && submissionTransaction.blockNumber === transaction.blockNumber) {
    const submissionScanned = inspectedByKey.get(
      `${submissionTransaction.blockNumber}:${lowerHash(submissionTransaction.txHash)}`,
    );
    const executionScanned = inspectedByKey.get(`${transaction.blockNumber}:${lowerHash(transaction.txHash)}`);
    if (!submissionScanned || !executionScanned) {
      reasons.push('同块提交/执行缺少可比较的扫描 transactionIndex');
    } else if (BigInt(submissionScanned.transactionIndex) >= BigInt(executionScanned.transactionIndex)) {
      invalid = true;
      reasons.push('同块订单提交 transactionIndex 必须早于执行交易');
    }
  }
  if (window.status === 'CLEAN' && externalHashes.size > 0) {
    invalid = true;
    reasons.push('CLEAN 窗口包含未登记第三方交易');
  }
  if (window.status === 'POLLUTED' && externalHashes.size === 0) {
    invalid = true;
    reasons.push('POLLUTED 窗口没有可验证的未登记第三方交易');
  }
  return { invalid, reasons };
}

function assessActionIntegrity(
  action: ActionEvidence,
  evidence?: EvidenceEnvelope,
): { invalid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let invalid = false;
  if (action.snapshots.some((snapshot) => (snapshot.readErrors?.length ?? 0) > 0)) {
    reasons.push('快照存在 readErrors');
  }
  for (const transaction of action.transactions) {
    if (!transaction.receipt) {
      reasons.push(`交易 ${transaction.txHash} 缺少独立 receipt`);
    } else if (
      transaction.receipt.transactionHash.toLowerCase() !== transaction.txHash.toLowerCase()
      || transaction.receipt.blockNumber !== transaction.blockNumber
      || transaction.receipt.status !== transaction.status
      || transaction.receipt.gasUsed !== transaction.gasUsed
    ) {
      invalid = true;
      reasons.push(`交易 ${transaction.txHash} 与 receipt 的 hash/block/status/gas 不一致`);
    }
    if (!transaction.blockHash || !transaction.receipt?.blockHash) {
      reasons.push(`交易 ${transaction.txHash} 缺少 transaction/receipt blockHash 对照`);
    } else if (transaction.blockHash.toLowerCase() !== transaction.receipt.blockHash.toLowerCase()) {
      invalid = true;
      reasons.push(`交易 ${transaction.txHash} 的 transaction/receipt blockHash 不一致`);
    }
    if (transaction.status === 'UNKNOWN' || transaction.receipt?.status === 'UNKNOWN') {
      reasons.push(`交易 ${transaction.txHash} 的最终状态未知`);
    }
    if (transaction.explorer && !explorerMatchesTransaction(transaction.explorer, transaction.txHash)) {
      invalid = true;
      reasons.push(`Explorer URL 与 provider/txHash 不一致`);
    }
  }
  if (action.outcome === 'SUBMITTED') {
    if (action.transactions.length === 0) reasons.push('SUBMITTED 动作缺少提交交易');
    for (const transaction of action.transactions) {
      if (transaction.status !== 'SUCCESS' || (transaction.receipt && transaction.receipt.status !== 'SUCCESS')) {
        invalid = true;
        reasons.push(`SUBMITTED 交易 ${transaction.txHash} 必须 SUCCESS`);
      }
    }
  }
  const settlementAction = action.type === 'executeOrder' || action.type === 'liquidate' || action.type === 'adl';
  const allowedOperationalOutcomes = operationalOutcomePolicy[action.type];
  const knownOperationalAction = allowedOperationalOutcomes !== undefined;
  if (!settlementAction) {
    if (action.windowContamination?.status === 'CLEAN') {
      invalid = true;
      reasons.push(`${action.type} 没有登记 completed window 语义，不得直接声明 CLEAN`);
    }
    if (action.windowContamination?.status === 'POLLUTED') {
      invalid = true;
      reasons.push('动作已声明执行窗口 POLLUTED；污染结论不得因动作类型被忽略');
    }
    if (action.windowContamination?.status === 'NOT_CHECKED'
      && action.windowContamination.legacyClaim?.status === 'POLLUTED') {
      invalid = true;
      reasons.push('Evidence V2 已声明执行窗口 POLLUTED；污染结论不得因动作结果被降级');
    }
    if (action.outcome === 'CANCELLED' || action.outcome === 'FROZEN') {
      invalid = true;
      reasons.push(`${action.type} 不能声明 ${action.outcome}；该结果只属于 executeOrder`);
    }
    if (allowedOperationalOutcomes && !allowedOperationalOutcomes.includes(action.outcome)) {
      invalid = true;
      reasons.push(`${action.type} 不能声明 ${action.outcome}；允许 ${allowedOperationalOutcomes.join('/')}`);
    }
    if (!knownOperationalAction) {
      reasons.push(`未知动作类型 ${action.type} 没有登记完整性策略，不能判为完整`);
      if (['EXECUTED', 'CANCELLED', 'FROZEN'].includes(action.outcome)
        && (!action.windowContamination || action.windowContamination.status === 'NOT_CHECKED')) {
        reasons.push('未知终态动作没有完成执行窗口污染检查');
      }
    }
    if (action.snapshots.length === 0) reasons.push('动作没有快照');
    return { invalid, reasons };
  }
  if (action.type === 'executeOrder' && !['EXECUTED', 'CANCELLED', 'FROZEN'].includes(action.outcome)) {
    invalid = true;
    reasons.push(`executeOrder 结果必须为 EXECUTED/CANCELLED/FROZEN，实际 ${action.outcome}`);
    return { invalid, reasons };
  }
  if ((action.type === 'liquidate' || action.type === 'adl') && action.outcome !== 'EXECUTED') {
    invalid = true;
    reasons.push(`${action.type} 结果必须为 EXECUTED，实际 ${action.outcome}`);
    return { invalid, reasons };
  }

  const resolution = resolveExecutionTransaction(action);
  if (resolution.status !== 'RESOLVED') {
    reasons.push(resolution.reason.replace(`${action.actionId}: `, ''));
    const misplacedServiceTransaction = resolution.status === 'MISSING'
      && action.transactions.some((transaction) => transaction.role === 'keeper' || transaction.role === 'service');
    if (misplacedServiceTransaction) {
      reasons.push('Keeper/Service 候选交易与 execution-after 区块不一致');
    }
    return {
      invalid: invalid || resolution.status === 'AMBIGUOUS' || misplacedServiceTransaction,
      reasons,
    };
  }
  const transaction = resolution.transaction;
  if (transaction.status !== 'SUCCESS' || transaction.receipt?.status !== 'SUCCESS') {
    invalid = true;
    reasons.push(`终态执行交易必须 SUCCESS，实际 transaction=${transaction.status}/receipt=${transaction.receipt?.status ?? 'MISSING'}`);
  }
  const windowIntegrity = evidence
    ? completedWindowIntegrity(evidence, action, transaction)
    : { invalid: false, reasons: ['执行窗口污染检查缺少 EvidenceEnvelope 上下文'] };
  invalid ||= windowIntegrity.invalid;
  reasons.push(...windowIntegrity.reasons);
  const beforeSnapshots = action.snapshots.filter((item) => item.kind === 'execution-before');
  const afterSnapshots = action.snapshots.filter((item) => item.kind === 'execution-after');
  const before = beforeSnapshots[0];
  const after = afterSnapshots[0];
  if (beforeSnapshots.length !== 1 || afterSnapshots.length !== 1 || !before || !after) {
    reasons.push('缺少权威 execution-before / execution-after');
  } else if (BigInt(after.blockNumber) - BigInt(before.blockNumber) !== 1n) {
    reasons.push('权威 Before/After 不满足 N−1/N');
  } else if (after.blockNumber !== transaction.blockNumber) {
    invalid = true;
    reasons.push('execution-after 区块与执行交易区块不一致');
  }
  if (after?.blockHash && transaction.blockHash
    && after.blockHash.toLowerCase() !== transaction.blockHash.toLowerCase()) {
    invalid = true;
    reasons.push('execution-after blockHash 与执行交易不一致');
  }

  const eventName = action.type === 'executeOrder'
    ? action.outcome === 'EXECUTED' ? 'OrderExecuted'
      : action.outcome === 'CANCELLED' ? 'OrderCancelled' : 'OrderFrozen'
    : 'PositionDecrease';
  const outcomeEvents = action.events.filter((event) => event.name === eventName);
  if (outcomeEvents.length === 0) {
    reasons.push(`缺少 ${eventName} 执行事件`);
  } else if (outcomeEvents.length !== 1) {
    invalid = true;
    reasons.push(`${eventName} 执行事件数量必须为 1，实际 ${outcomeEvents.length}`);
  } else {
    const outcomeEvent = outcomeEvents[0]!;
    if (outcomeEvent.transactionHash.toLowerCase() !== transaction.txHash.toLowerCase()
      || outcomeEvent.blockNumber !== transaction.blockNumber) {
      invalid = true;
      reasons.push(`${eventName} 与执行交易的 txHash/block 不一致`);
    } else if (action.type === 'executeOrder' && transaction.orderKey) {
      const eventOrderKeys = collectOrderKeys(outcomeEvent.args);
      if (eventOrderKeys.length === 0) {
        reasons.push(`${eventName} 没有可核对的 orderKey`);
      } else if (!eventOrderKeys.some((key) => key.toLowerCase() === transaction.orderKey?.toLowerCase())) {
        invalid = true;
        reasons.push(`${eventName}.orderKey 与交易 orderKey 不一致`);
      }
    }
  }
  return { invalid, reasons };
}

function collectOrderKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectOrderKeys);
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
    const direct = (key === 'key' || key === 'orderKey') && typeof item === 'string' && /^0x[0-9a-fA-F]{64}$/.test(item)
      ? [item] : [];
    return [...direct, ...collectOrderKeys(item)];
  });
}

function explorerMatchesTransaction(explorer: NonNullable<ActionEvidence['transactions'][number]['explorer']>, txHash: string): boolean {
  let url: URL;
  try { url = new URL(explorer.transactionUrl); } catch { return false; }
  if (!url.pathname.toLowerCase().endsWith(`/tx/${txHash.toLowerCase()}`)) return false;
  return explorer.provider === 'basescan'
    ? url.hostname.endsWith('basescan.org')
    : url.hostname === 'dashboard.tenderly.co';
}

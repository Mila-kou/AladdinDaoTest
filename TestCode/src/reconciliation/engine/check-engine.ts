import type {
  ActionOutcome,
  ActionPurpose,
  Address,
  EvidenceCapability,
  EvidenceEnvelope,
  FlowType,
  TransactionRole,
} from '../../evidence/evidence-v3.js';
import { sha256CanonicalJson, type EvidenceDigest } from '../../evidence/evidence-digest.js';
import { checkRecordSchema, type CheckRecord, type SourceRef } from '../schema/check-record.js';

export interface CheckPackInputRequirement {
  readonly name: string;
  readonly actionId: string;
  readonly purpose: CheckRecord['purpose'];
  readonly subject: CheckRecord['subject'];
  readonly source: SourceRef;
  readonly value: unknown;
}

export interface CheckPack {
  readonly id: string;
  /** Bump whenever formulas, required inputs, or emitted CheckRecord semantics change. */
  readonly version: string;
  readonly requiredCapabilities: readonly EvidenceEnvelope['capabilities'][number][];
  /** Pack 运行前声明其权威原始输入；缺项会生成 NOT_VERIFIED，不允许以 0 或 Actual 顶替。 */
  requiredInputs?(evidence: EvidenceEnvelope): readonly CheckPackInputRequirement[];
  run(evidence: EvidenceEnvelope): CheckRecord[];
}

export interface CheckPlanTransactionPolicy {
  /** Every TransactionRef must match exactly one rule; unmatched/overlapping facts are invalid. */
  readonly rules: readonly {
    readonly id: string;
    readonly roles: readonly TransactionRole[];
    readonly min: number;
    readonly max: number;
    readonly anchor: 'order-submission' | 'terminal-execution' | 'oracle-ref';
    /** Trusted runtime/deployment identity, never learned back from Evidence. */
    readonly actors?: readonly Address[];
    readonly targets?: readonly Address[];
  }[];
}

export interface CheckPlan {
  readonly id: string;
  readonly version: string;
  readonly flowType: FlowType;
  readonly actions: readonly {
    readonly type: string;
    readonly purpose: ActionPurpose;
    readonly outcomes: readonly ActionOutcome[];
    readonly transactions?: CheckPlanTransactionPolicy;
    readonly requiredCapabilities?: readonly EvidenceCapability[];
  }[];
  readonly packs: readonly CheckPack[];
}

export function requiredCapabilitiesForPlan(plan: CheckPlan): EvidenceCapability[] {
  return [...new Set([
    ...plan.packs.flatMap((pack) => pack.requiredCapabilities),
    ...plan.actions.flatMap((action) => action.requiredCapabilities ?? []),
  ])];
}

/** Serializable plan identity; executable pack functions are represented by explicit pack versions. */
export function checkPlanDescriptor(plan: CheckPlan): unknown {
  return {
    schemaVersion: 1,
    id: plan.id,
    version: plan.version,
    flowType: plan.flowType,
    actions: plan.actions,
    packs: plan.packs.map((pack) => ({
      id: pack.id,
      version: pack.version,
      requiredCapabilities: pack.requiredCapabilities,
    })),
  };
}

export function computeCheckPlanDigest(plan: CheckPlan): EvidenceDigest {
  return sha256CanonicalJson(checkPlanDescriptor(plan));
}

export function runCheckPlan(evidence: EvidenceEnvelope, plan: CheckPlan): CheckRecord[] {
  const available = new Set(evidence.capabilities);
  return plan.packs.flatMap((pack) => {
    const missing = pack.requiredCapabilities.filter((capability) => !available.has(capability));
    if (missing.length > 0) {
      return [checkRecordSchema.parse({
        id: `${pack.id}.capability`, packId: pack.id, actionId: 'WHOLE', purpose: 'whole-flow',
        subject: 'chain-state', comparison: 'presence',
        actual: { raw: `missing:${missing.join(',')}` }, expected: { raw: 'all-required-capabilities' },
        sources: [{ layer: 'derived', path: 'evidence.capabilities' }],
        verification: 'NOT_VERIFIED', severity: 'blocking', verdict: 'NOT_VERIFIED',
        note: `核对包缺少 Evidence capability：${missing.join('、')}`,
      })];
    }
    let requirements: readonly CheckPackInputRequirement[];
    try {
      requirements = pack.requiredInputs?.(evidence) ?? [];
    } catch (error) {
      throw new Error(`${pack.id} 无法枚举必需原始输入：${error instanceof Error ? error.message : String(error)}`);
    }
    const missingInputs = requirements.filter((requirement) => requirement.value === undefined
      || requirement.value === null || requirement.value === '');
    if (missingInputs.length > 0) {
      return missingInputs.map((requirement) => checkRecordSchema.parse({
        id: `${pack.id}.required-input.${requirement.name}`,
        packId: pack.id,
        actionId: requirement.actionId,
        purpose: requirement.purpose,
        subject: requirement.subject,
        comparison: 'presence',
        actual: { raw: '<missing>' },
        expected: { raw: 'present' },
        sources: [requirement.source],
        verification: 'NOT_VERIFIED',
        severity: 'blocking',
        verdict: 'NOT_VERIFIED',
        note: `CheckPack 必需原始输入缺失：${requirement.name}`,
      }));
    }
    return pack.run(evidence).map((check) => checkRecordSchema.parse(check));
  });
}

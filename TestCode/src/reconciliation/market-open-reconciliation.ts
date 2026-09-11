import {
  canonicalEvidenceEnvelopeSchema,
  type EvidenceEnvelopeInput,
} from '../evidence/adapters/v2-to-v3.js';
import type { Address } from '../evidence/evidence-v3.js';
import { reconciliationReportSchema, type ReconciliationReport } from './schema/check-record.js';
import { aggregateReport } from './engine/aggregate-verdicts.js';
import { runCheckPlan, type CheckPlan } from './engine/check-engine.js';
import { marketOpenCleanupPack, marketOpenCorePack } from './packs/market-open.js';
import { feeClaimablePack } from './packs/fee-claimable.js';

export interface MarketOpenRoundtripPlanOptions {
  readonly id: string;
  readonly version: string;
  readonly oracleSupport?: {
    readonly actors: readonly [Address, ...Address[]];
    readonly targets: readonly [Address, ...Address[]];
  };
}

/** 按 flow/capability 组合，不按 Case ID 路由；support 身份必须来自可信部署配置。 */
export function createMarketOpenRoundtripPlan(options: MarketOpenRoundtripPlanOptions): CheckPlan {
  const submitTransactions = {
    rules: [{
      id: 'order-submission', roles: ['trader'] as const, min: 1, max: 1, anchor: 'order-submission' as const,
    }],
  };
  const executionTransactions = {
    rules: [
      {
        id: 'terminal-execution', roles: ['keeper', 'service'] as const,
        min: 1, max: 1, anchor: 'terminal-execution' as const,
      },
      ...(options.oracleSupport ? [{
        id: 'oracle-support', roles: ['oracle'] as const,
        min: 0, max: 1, anchor: 'oracle-ref' as const,
        actors: options.oracleSupport.actors,
        targets: options.oracleSupport.targets,
      }] : []),
    ],
  };
  return {
    id: options.id,
    version: options.version,
    flowType: 'roundtrip',
    actions: [
      {
        type: 'submitMarketIncrease', purpose: 'primary', outcomes: ['SUBMITTED'],
        transactions: submitTransactions,
        requiredCapabilities: ['transaction', 'order-events'],
      },
      {
        type: 'executeOrder', purpose: 'primary', outcomes: ['EXECUTED'],
        transactions: executionTransactions,
        requiredCapabilities: ['transaction', 'order-events', 'keeper', 'parameters', 'oracle', 'ledger', 'fee', 'position-state'],
      },
      {
        type: 'submitMarketDecrease', purpose: 'cleanup', outcomes: ['SUBMITTED'],
        transactions: submitTransactions,
        requiredCapabilities: ['transaction', 'order-events', 'position-state'],
      },
      {
        type: 'executeOrder', purpose: 'cleanup', outcomes: ['EXECUTED'],
        transactions: executionTransactions,
        requiredCapabilities: ['transaction', 'order-events', 'keeper', 'parameters', 'oracle', 'ledger', 'fee', 'position-state'],
      },
    ],
    packs: [marketOpenCorePack, marketOpenCleanupPack, feeClaimablePack],
  };
}

export const marketOpenRoundtripPlan: CheckPlan = createMarketOpenRoundtripPlan({
  id: 'market-open.roundtrip',
  version: '2',
});

export function reconcileMarketOpenRoundtrip(evidence: EvidenceEnvelopeInput): ReconciliationReport {
  const parsed = canonicalEvidenceEnvelopeSchema.safeParse(evidence);
  if (!parsed.success) {
    return reconciliationReportSchema.parse(aggregateReport(evidence, [], marketOpenRoundtripPlan));
  }
  if (parsed.data.flowType !== 'roundtrip') {
    throw new Error(`market-open roundtrip 核对需要 flowType=roundtrip，实际 ${parsed.data.flowType}`);
  }
  const canonicalEvidence = parsed.data;
  const checks = runCheckPlan(canonicalEvidence, marketOpenRoundtripPlan);
  return reconciliationReportSchema.parse(aggregateReport(canonicalEvidence, checks, marketOpenRoundtripPlan));
}

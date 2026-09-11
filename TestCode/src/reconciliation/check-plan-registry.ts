import { computeCheckPlanDigest, type CheckPlan } from './engine/check-engine.js';
import { marketOpenRoundtripPlan } from './market-open-reconciliation.js';
import { marketCloseCleanupRoundtripPlan, marketCloseRoundtripPlan } from './packs/market-close.js';
import { liquidationPlan } from './packs/liquidation.js';

export interface TrustedCheckPlanRegistration {
  readonly id: string;
  readonly version: string;
  readonly digest: `sha256:${string}`;
  readonly plan: CheckPlan;
}

const registeredPlans = [
  marketOpenRoundtripPlan,
  // 平仓为主体（开仓 setup / 减仓·全平 primary）
  marketCloseRoundtripPlan,
  // 与 market-open.roundtrip@2 同形（primary/primary/cleanup/cleanup）+ 平仓核对包，可回放既有 roundtrip 证据
  marketCloseCleanupRoundtripPlan,
  // 开仓 setup → movePrice support → liquidate primary（multi-phase）
  liquidationPlan,
] as const;

const identities = new Map(registeredPlans.map((plan) => [
  `${plan.id}@${plan.version}`,
  { id: plan.id, version: plan.version, digest: computeCheckPlanDigest(plan), plan },
]));

/** Parameterized/deployment plans need their own registered id/version. */
export function findTrustedCheckPlan(
  id: string,
  version: string,
): TrustedCheckPlanRegistration | undefined {
  return identities.get(`${id}@${version}`);
}

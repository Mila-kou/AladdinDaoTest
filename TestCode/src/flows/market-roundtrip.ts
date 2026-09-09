import type { RuntimeConfig } from '../config/runtime.js';
import {
  assertResolvedTestEnvironment,
  type ResolvedTestEnvironment,
  type TestEnvironmentDefinition,
} from '../domain/test-environment.js';
import type { ScenarioDefinition, ScenarioCheckPlan, Side } from '../scenario-engine/actions.js';
import { ref, referenceKey } from '../scenario-engine/references.js';
import { scenario } from '../scenario-engine/scenario-builder.js';
import { validateScenarioDefinition } from '../scenario-engine/state-machine.js';
import {
  runMarketFlow,
  type MarketFlowOptions,
  type Scn009Evidence,
} from '../scenarios/scn-009-runner.js';
import { assertRuntimeMatchesResolvedEnvironment } from '../execution/runtime-environment.js';

export const MARKET_ROUNDTRIP_CHECK_PLAN: ScenarioCheckPlan = Object.freeze({
  defaultPacks: [
    'order.market-increase-created',
    'order.executed',
    'position.increased',
    'pricing.increase',
    'fee.position',
    'market.open-interest',
    'ledger.transaction',
    'order.no-attached-protection',
  ],
  additionalPacks: [
    'cleanup.full-close',
    'ledger.whole-flow',
  ],
});

export interface MarketRoundtripScenarioInput {
  readonly caseId: string;
  readonly variantId: string;
  readonly environment: TestEnvironmentDefinition;
  readonly actor?: string;
  readonly side: Side;
  readonly collateralRaw: string;
  readonly sizeDeltaUsdRaw: string;
  readonly checkPlan?: ScenarioCheckPlan;
}

/**
 * Canonical Market open -> full-close composition. The two open actions are
 * primary evidence; the two close actions are cleanup evidence.
 */
export function marketRoundtripScenario(input: MarketRoundtripScenarioInput): ScenarioDefinition {
  const actor = input.actor ?? 'trader';
  const openOrder = ref.order('open');
  const position = ref.position('main');
  const closeOrder = ref.order('close');

  return scenario(input.caseId, {
    variantId: input.variantId,
    environment: input.environment,
    actors: [actor],
    isolation: 'snapshot',
    checkPlan: input.checkPlan ?? MARKET_ROUNDTRIP_CHECK_PLAN,
  })
    .openMarket({
      actor,
      side: input.side,
      collateralRaw: input.collateralRaw,
      sizeDeltaUsdRaw: input.sizeDeltaUsdRaw,
      saveAs: openOrder,
      savePositionAs: position,
      purpose: 'primary',
    })
    .closePosition({
      actor,
      position,
      percent: 100,
      saveAs: closeOrder,
      purpose: 'cleanup',
    })
    .build();
}

function compileLegacyMarketFlow(definition: ScenarioDefinition): Omit<MarketFlowOptions, 'resolvedEnvironment'> {
  validateScenarioDefinition(definition);
  if (definition.flowType !== 'roundtrip') {
    throw new Error(`${definition.caseId}: Market Flow 过渡桥只接受 roundtrip，实际 ${definition.flowType}`);
  }
  if (definition.actions.length !== 4) {
    throw new Error(`${definition.caseId}: Market Flow 过渡桥要求四个原子 Action，实际 ${definition.actions.length}`);
  }

  const [submitOpen, executeOpen, submitClose, executeClose] = definition.actions;
  if (submitOpen?.type !== 'submitMarketIncrease'
    || executeOpen?.type !== 'executeOrder'
    || submitClose?.type !== 'submitMarketDecrease'
    || executeClose?.type !== 'executeOrder') {
    throw new Error(`${definition.caseId}: 过渡桥仅支持 submitMarketIncrease -> executeOrder -> submitMarketDecrease -> executeOrder`);
  }
  if (submitOpen.purpose !== 'primary' || executeOpen.purpose !== 'primary'
    || submitClose.purpose !== 'cleanup' || executeClose.purpose !== 'cleanup') {
    throw new Error(`${definition.caseId}: 开仓腿必须为 primary，全平腿必须为 cleanup`);
  }
  if (submitOpen.acceptablePriceRaw !== undefined) {
    throw new Error(`${definition.caseId}: 旧 runMarketFlow 不能保真执行自定义 acceptablePriceRaw`);
  }
  if (submitClose.percent !== undefined && submitClose.percent !== 100) {
    throw new Error(`${definition.caseId}: 旧 runMarketFlow 过渡桥只支持 100% 全平`);
  }
  if (submitClose.actor !== submitOpen.actor) {
    throw new Error(`${definition.caseId}: 过渡桥要求开仓与全平使用同一 actor`);
  }
  if (referenceKey(executeOpen.order) !== referenceKey(submitOpen.saveAs)
    || !executeOpen.savePositionAs
    || referenceKey(submitClose.position) !== referenceKey(executeOpen.savePositionAs)
    || referenceKey(executeClose.order) !== referenceKey(submitClose.saveAs)
    || !executeClose.position
    || referenceKey(executeClose.position) !== referenceKey(submitClose.position)
    || executeClose.positionEffect !== 'full-close') {
    throw new Error(`${definition.caseId}: 过渡桥的订单/仓位逻辑引用不闭合`);
  }
  if ((executeOpen.expectedOutcome ?? 'EXECUTED') !== 'EXECUTED'
    || (executeClose.expectedOutcome ?? 'EXECUTED') !== 'EXECUTED') {
    throw new Error(`${definition.caseId}: 过渡桥当前只支持开仓与全平都 EXECUTED`);
  }

  const collateral = BigInt(submitOpen.collateralRaw);
  const sizeDeltaUsd = BigInt(submitOpen.sizeDeltaUsdRaw);
  if (collateral <= 0n || sizeDeltaUsd <= 0n) {
    throw new Error(`${definition.caseId}: collateralRaw 与 sizeDeltaUsdRaw 必须为正整数`);
  }

  return {
    scenarioId: definition.caseId,
    isLong: submitOpen.side === 'long',
    priceMovePercent: 0,
    openCollateral: collateral,
    openSizeDeltaUsd: sizeDeltaUsd,
  };
}

export interface RunLegacyMarketRoundtripInput {
  readonly definition: ScenarioDefinition;
  /** Must be resolved from Runtime/Driver state, never copied from definition.environment. */
  readonly resolvedEnvironment: ResolvedTestEnvironment;
}

export interface LegacyMarketRoundtripResult {
  readonly definition: ScenarioDefinition;
  readonly evidence: Scn009Evidence;
}

/**
 * Phase A/B compatibility bridge. It validates the complete Scenario before
 * delegating the four real transactions to the established runMarketFlow.
 * New action shapes must use real ActionExecutors instead of widening this bridge.
 */
export async function runLegacyMarketRoundtrip(
  runtime: RuntimeConfig,
  input: RunLegacyMarketRoundtripInput,
): Promise<LegacyMarketRoundtripResult> {
  // Compare design and actual runtime selections before runMarketFlow can send
  // the first Oracle, Trader, or Keeper transaction.
  assertResolvedTestEnvironment(input.definition.environment, input.resolvedEnvironment);
  assertRuntimeMatchesResolvedEnvironment(runtime, input.resolvedEnvironment);
  const flow = compileLegacyMarketFlow(input.definition);
  const evidence = await runMarketFlow(runtime, {
    ...flow,
    resolvedEnvironment: input.resolvedEnvironment,
  });
  return { definition: input.definition, evidence };
}

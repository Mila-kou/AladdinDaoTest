import type { ActionPurpose, EvidenceCapability, FlowType, JsonValue } from '../evidence/evidence-v3.js';
import type {
  AddTpSlAction,
  AdvanceTimeAction,
  AdlAction,
  ExecuteOrderAction,
  LiquidateAction,
  MovePriceAction,
  PlaceLimitAction,
  ScenarioCheckPlan,
  ScenarioDefinition,
  ScenarioEnvironmentDefinition,
  Side,
  SubmitMarketIncreaseAction,
  SubmitMarketDecreaseAction,
  TradeAction,
} from './actions.js';
import type { ScenarioRef } from './references.js';
import { validateTestEnvironmentDefinition } from '../domain/test-environment.js';
import { validateScenarioDefinition } from './state-machine.js';

export interface ScenarioOptions {
  readonly environment: ScenarioEnvironmentDefinition;
  readonly actors: readonly string[];
  readonly isolation?: 'snapshot' | 'persistent';
  readonly variantId?: string;
  readonly checkPlan?: ScenarioCheckPlan;
}

interface MarketIncreaseInput {
  readonly actor: string;
  readonly side: Side;
  readonly collateralRaw: string;
  readonly sizeDeltaUsdRaw: string;
  readonly acceptablePriceRaw?: string;
  readonly saveAs: ScenarioRef<'order'>;
  readonly purpose?: ActionPurpose;
}

type BuilderActionInput<T> = Omit<T, 'id' | 'type' | 'capabilities' | 'input' | 'purpose'> & {
  readonly purpose?: ActionPurpose;
};

function input(value: Record<string, JsonValue | undefined>): JsonValue {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as JsonValue;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export class ScenarioBuilder {
  private readonly actions: TradeAction[] = [];
  private sequence = 0;

  constructor(readonly caseId: string, readonly options: ScenarioOptions) {
    if (!caseId.trim()) throw new Error('caseId 不能为空');
    if (options.actors.length === 0) throw new Error('至少登记一个 actor');
    if (options.actors.some((actor) => !actor.trim())) throw new Error('actor 名称不能为空');
    if (new Set(options.actors).size !== options.actors.length) throw new Error('actor 名称不能重复');
    validateTestEnvironmentDefinition(options.environment);
  }

  private actionId(type: string): string {
    this.sequence += 1;
    return `A${String(this.sequence).padStart(2, '0')}-${type}`;
  }

  submitMarketIncrease(value: MarketIncreaseInput): this {
    const capabilities: EvidenceCapability[] = ['transaction', 'order-events'];
    const action: SubmitMarketIncreaseAction = {
      ...value,
      id: this.actionId('submit-market-increase'),
      type: 'submitMarketIncrease',
      purpose: value.purpose ?? 'primary',
      capabilities,
      input: input({
        actor: value.actor,
        side: value.side,
        collateralRaw: value.collateralRaw,
        sizeDeltaUsdRaw: value.sizeDeltaUsdRaw,
        acceptablePriceRaw: value.acceptablePriceRaw,
        saveAs: value.saveAs.name,
      }),
    };
    this.actions.push(action);
    return this;
  }

  executeOrder(value: {
    readonly order: ScenarioRef<'order'>;
    readonly expectedOutcome?: 'EXECUTED' | 'CANCELLED' | 'FROZEN';
    readonly savePositionAs?: ScenarioRef<'position'>;
    readonly position?: ScenarioRef<'position'>;
    readonly positionEffect?: 'partial-close' | 'full-close';
    readonly purpose?: ActionPurpose;
  }): this {
    const capabilities: EvidenceCapability[] = [
      'transaction', 'order-events', 'keeper', 'parameters', 'oracle', 'ledger', 'fee', 'position-state',
    ];
    const action: ExecuteOrderAction = {
      ...value,
      id: this.actionId('execute-order'),
      type: 'executeOrder',
      purpose: value.purpose ?? 'primary',
      capabilities,
      input: input({
        order: value.order.name,
        expectedOutcome: value.expectedOutcome,
        savePositionAs: value.savePositionAs?.name,
        position: value.position?.name,
        positionEffect: value.positionEffect,
      }),
    };
    this.actions.push(action);
    return this;
  }

  /** Business flow: always expands to submit + execute atomic actions. */
  openMarket(value: MarketIncreaseInput & { readonly savePositionAs: ScenarioRef<'position'> }): this {
    this.submitMarketIncrease(value);
    this.executeOrder({
      order: value.saveAs,
      savePositionAs: value.savePositionAs,
      ...(value.purpose ? { purpose: value.purpose } : {}),
    });
    return this;
  }

  placeLimit(value: BuilderActionInput<PlaceLimitAction>): this {
    const action: PlaceLimitAction = {
      ...value,
      id: this.actionId('place-limit'),
      type: 'placeLimit',
      purpose: value.purpose ?? 'primary',
      capabilities: ['transaction', 'order-events'],
      input: input({
        actor: value.actor,
        side: value.side,
        collateralRaw: value.collateralRaw,
        sizeDeltaUsdRaw: value.sizeDeltaUsdRaw,
        triggerPriceRaw: value.triggerPriceRaw,
        acceptablePriceRaw: value.acceptablePriceRaw,
        saveAs: value.saveAs.name,
      }),
    };
    this.actions.push(action);
    return this;
  }

  addTpSl(value: BuilderActionInput<AddTpSlAction>): this {
    const action: AddTpSlAction = {
      ...value,
      id: this.actionId('add-tp-sl'),
      type: 'addTpSl',
      purpose: value.purpose ?? 'primary',
      capabilities: ['transaction', 'order-events', 'position-state'],
      input: input({
        actor: value.actor,
        position: value.position.name,
        takeProfitRaw: value.takeProfitRaw,
        stopLossRaw: value.stopLossRaw,
        tpSaveAs: value.tpSaveAs?.name,
        slSaveAs: value.slSaveAs?.name,
      }),
    };
    this.actions.push(action);
    return this;
  }

  movePrice(value: BuilderActionInput<MovePriceAction>): this {
    const action: MovePriceAction = {
      ...value,
      id: this.actionId('move-price'),
      type: 'movePrice',
      purpose: value.purpose ?? 'support',
      capabilities: ['transaction', 'oracle'],
      input: input({
        index: value.index,
        collateral: value.collateral,
        assess: value.assess?.map((item) => ({ condition: item.condition, position: item.position.name })),
        timestamp: value.timestamp,
      }),
    };
    this.actions.push(action);
    return this;
  }

  advanceTime(value: BuilderActionInput<AdvanceTimeAction>): this {
    const action: AdvanceTimeAction = {
      ...value,
      id: this.actionId('advance-time'),
      type: 'advanceTime',
      purpose: value.purpose ?? 'support',
      capabilities: ['transaction'],
      input: input({ seconds: value.seconds }),
    };
    this.actions.push(action);
    return this;
  }

  submitMarketDecrease(value: BuilderActionInput<SubmitMarketDecreaseAction>): this {
    const action: SubmitMarketDecreaseAction = {
      ...value,
      id: this.actionId('submit-market-decrease'),
      type: 'submitMarketDecrease',
      purpose: value.purpose ?? 'primary',
      capabilities: ['transaction', 'order-events', 'position-state'],
      input: input({ actor: value.actor, position: value.position.name, percent: value.percent, saveAs: value.saveAs.name }),
    };
    this.actions.push(action);
    return this;
  }

  /** Business flow: submit decrease + execute; close is applied only after execution. */
  closePosition(value: BuilderActionInput<SubmitMarketDecreaseAction>): this {
    this.submitMarketDecrease(value);
    this.executeOrder({
      order: value.saveAs,
      position: value.position,
      positionEffect: value.percent === undefined || value.percent === 100 ? 'full-close' : 'partial-close',
      ...(value.purpose ? { purpose: value.purpose } : {}),
    });
    return this;
  }

  liquidate(value: BuilderActionInput<LiquidateAction>): this {
    const action: LiquidateAction = {
      ...value,
      id: this.actionId('liquidate'),
      type: 'liquidate',
      purpose: value.purpose ?? 'primary',
      capabilities: ['transaction', 'keeper', 'position-state', 'ledger', 'fee', 'oracle', 'parameters'],
      input: input({ position: value.position.name }),
    };
    this.actions.push(action);
    return this;
  }

  adl(value: BuilderActionInput<AdlAction>): this {
    const action: AdlAction = {
      ...value,
      id: this.actionId('adl'),
      type: 'adl',
      purpose: value.purpose ?? 'primary',
      capabilities: ['transaction', 'keeper', 'position-state', 'ledger', 'oracle', 'parameters'],
      input: input({ position: value.position.name, sizeDeltaUsdRaw: value.sizeDeltaUsdRaw }),
    };
    this.actions.push(action);
    return this;
  }

  build(): ScenarioDefinition {
    const flowType = inferFlowType(this.actions);
    const definition: ScenarioDefinition = Object.freeze({
      caseId: this.caseId,
      variantId: this.options.variantId ?? 'default',
      environment: this.options.environment,
      actors: [...this.options.actors],
      isolation: this.options.isolation ?? 'snapshot',
      flowType,
      capabilities: unique(this.actions.flatMap((action) => action.capabilities)),
      ...(this.options.checkPlan ? { checkPlan: this.options.checkPlan } : {}),
      actions: [...this.actions],
    });
    validateScenarioDefinition(definition);
    return definition;
  }
}

function inferFlowType(actions: readonly TradeAction[]): FlowType {
  const types = actions.map((action) => action.type);
  if (types.length === 0) return 'read-only';
  const hasCreate = types.some((type) => type === 'submitMarketIncrease' || type === 'placeLimit' || type === 'submitMarketDecrease');
  const hasExecute = types.includes('executeOrder') || types.includes('liquidate') || types.includes('adl');
  const hasPrimaryOpen = actions.some((action) => action.type === 'executeOrder' && action.purpose === 'primary');
  const hasCleanupClose = actions.some((action) => action.type === 'executeOrder' && action.purpose === 'cleanup');
  if (hasPrimaryOpen && hasCleanupClose) return 'roundtrip';
  if (hasCreate && hasExecute) return 'create-execute';
  if (hasCreate) return 'create-only';
  return types.length > 1 ? 'multi-phase' : 'read-only';
}

export function scenario(caseId: string, options: ScenarioOptions): ScenarioBuilder {
  return new ScenarioBuilder(caseId, options);
}

import type { ActionPurpose, EvidenceCapability, JsonValue } from '../evidence/evidence-v3.js';
import type { TestEnvironmentDefinition } from '../domain/test-environment.js';
import type { ScenarioRef } from './references.js';

export type Side = 'long' | 'short';

interface BaseAction<T extends string> {
  readonly id: string;
  readonly type: T;
  readonly purpose: ActionPurpose;
  readonly capabilities: readonly EvidenceCapability[];
  readonly input: JsonValue;
}

export interface SubmitMarketIncreaseAction extends BaseAction<'submitMarketIncrease'> {
  readonly actor: string;
  readonly side: Side;
  readonly collateralRaw: string;
  readonly sizeDeltaUsdRaw: string;
  readonly acceptablePriceRaw?: string;
  readonly saveAs: ScenarioRef<'order'>;
}

export interface PlaceLimitAction extends BaseAction<'placeLimit'> {
  readonly actor: string;
  readonly side: Side;
  readonly collateralRaw: string;
  readonly sizeDeltaUsdRaw: string;
  readonly triggerPriceRaw: string;
  readonly acceptablePriceRaw: string;
  readonly saveAs: ScenarioRef<'order'>;
}

export interface ExecuteOrderAction extends BaseAction<'executeOrder'> {
  readonly order: ScenarioRef<'order'>;
  /** 缺省为 EXECUTED；边界取消/冻结用例必须显式声明，状态机据此决定后续逻辑状态。 */
  readonly expectedOutcome?: 'EXECUTED' | 'CANCELLED' | 'FROZEN';
  readonly savePositionAs?: ScenarioRef<'position'>;
  readonly position?: ScenarioRef<'position'>;
  readonly positionEffect?: 'partial-close' | 'full-close';
}

export interface AddTpSlAction extends BaseAction<'addTpSl'> {
  readonly actor: string;
  readonly position: ScenarioRef<'position'>;
  readonly takeProfitRaw?: string;
  readonly stopLossRaw?: string;
  readonly tpSaveAs?: ScenarioRef<'order'>;
  readonly slSaveAs?: ScenarioRef<'order'>;
}

export interface MovePriceAction extends BaseAction<'movePrice'> {
  readonly index: { readonly min: string; readonly max: string };
  readonly collateral?: { readonly min: string; readonly max: string };
  /** 调价完成后由 Driver/独立模型实际评估；声明目标不等于条件已经满足。 */
  readonly assess?: readonly PositionConditionRequest[];
  readonly timestamp?: string | 'next-block';
}

export type PositionCondition = 'liquidation' | 'adl';

export interface PositionConditionRequest {
  readonly condition: PositionCondition;
  readonly position: ScenarioRef<'position'>;
}

export interface AdvanceTimeAction extends BaseAction<'advanceTime'> {
  readonly seconds: number;
}

export interface SubmitMarketDecreaseAction extends BaseAction<'submitMarketDecrease'> {
  readonly actor: string;
  readonly position: ScenarioRef<'position'>;
  readonly percent?: number;
  readonly saveAs: ScenarioRef<'order'>;
}

export interface LiquidateAction extends BaseAction<'liquidate'> {
  readonly position: ScenarioRef<'position'>;
}

export interface AdlAction extends BaseAction<'adl'> {
  readonly position: ScenarioRef<'position'>;
  readonly sizeDeltaUsdRaw: string;
}

export type TradeAction =
  | SubmitMarketIncreaseAction
  | PlaceLimitAction
  | ExecuteOrderAction
  | AddTpSlAction
  | MovePriceAction
  | AdvanceTimeAction
  | SubmitMarketDecreaseAction
  | LiquidateAction
  | AdlAction;

export type TradeActionType = TradeAction['type'];

export interface ScenarioCheckPlan {
  readonly defaultPacks: readonly string[];
  readonly additionalPacks?: readonly string[];
  readonly disabledChecks?: readonly { readonly checkId: string; readonly reason: string }[];
}

/** Scenario DSL 与看板用例登记共用同一环境契约，避免两套枚举漂移。 */
export type ScenarioEnvironmentDefinition = TestEnvironmentDefinition;

export interface ScenarioDefinition {
  readonly caseId: string;
  readonly variantId: string;
  readonly environment: ScenarioEnvironmentDefinition;
  readonly actors: readonly string[];
  readonly isolation: 'snapshot' | 'persistent';
  readonly flowType: import('../evidence/evidence-v3.js').FlowType;
  readonly capabilities: readonly EvidenceCapability[];
  readonly checkPlan?: ScenarioCheckPlan;
  readonly actions: readonly TradeAction[];
}

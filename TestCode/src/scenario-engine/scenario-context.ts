import type { Address, Hex } from '../evidence/evidence-v3.js';
import type { ResolvedTestEnvironment } from '../domain/test-environment.js';
import type { PositionCondition, ScenarioEnvironmentDefinition, Side } from './actions.js';
import { referenceKey, type ScenarioRef } from './references.js';

export type OrderLifecycle = 'pending' | 'executed' | 'cancelled' | 'frozen';
export type PositionLifecycle = 'open' | 'closed' | 'liquidated';
export type ScenarioContextMode = 'planning' | 'runtime';
export type PositionConditionAssessmentStatus = 'SATISFIED' | 'NOT_SATISFIED' | 'NOT_CHECKED';

export interface OrderState {
  readonly orderType: 'market-open' | 'limit-increase' | 'market-close' | 'limit-decrease' | 'stop-loss-decrease';
  readonly orderKey?: Hex;
  readonly status: OrderLifecycle;
  readonly actor: Address;
  readonly side: Side;
  readonly createdAt: number;
  readonly triggerPriceRaw?: string;
}

export interface PositionState {
  readonly positionKey?: Hex;
  readonly status: PositionLifecycle;
  readonly actor: Address;
  readonly side: Side;
  readonly openedAt: number;
}

interface PriceState {
  readonly min: bigint;
  readonly max: bigint;
  readonly sequence: number;
}

interface PositionConditionState {
  readonly status: PositionConditionAssessmentStatus;
  readonly sequence: number;
  readonly sourcePath?: string;
}

export class ScenarioContext {
  private latestIndexPrice?: PriceState;
  private readonly positionConditions = new Map<string, PositionConditionState>();
  readonly orders = new Map<string, OrderState>();
  readonly positions = new Map<string, PositionState>();

  constructor(
    readonly environment: ScenarioEnvironmentDefinition,
    readonly actors: Readonly<Record<string, Address>>,
    readonly mode: ScenarioContextMode = 'runtime',
    /** 仅 runtime 模式存在；Executor 必须据此选择本轮实际 Mock/Deployed 资源。 */
    readonly resolvedEnvironment?: ResolvedTestEnvironment,
  ) {}

  order(reference: ScenarioRef<'order'>): OrderState | undefined {
    return this.orders.get(referenceKey(reference));
  }

  position(reference: ScenarioRef<'position'>): PositionState | undefined {
    return this.positions.get(referenceKey(reference));
  }

  setOrder(reference: ScenarioRef<'order'>, state: OrderState): void {
    this.orders.set(referenceKey(reference), Object.freeze({ ...state }));
  }

  updateOrder(reference: ScenarioRef<'order'>, state: Partial<OrderState>): void {
    const current = this.order(reference);
    if (!current) throw new Error(`订单引用 ${reference.name} 不存在`);
    this.orders.set(referenceKey(reference), Object.freeze({ ...current, ...state }));
  }

  setPosition(reference: ScenarioRef<'position'>, state: PositionState): void {
    this.positions.set(referenceKey(reference), Object.freeze({ ...state }));
  }

  updatePosition(reference: ScenarioRef<'position'>, state: Partial<PositionState>): void {
    const current = this.position(reference);
    if (!current) throw new Error(`仓位引用 ${reference.name} 不存在`);
    this.positions.set(referenceKey(reference), Object.freeze({ ...current, ...state }));
    this.positionConditions.delete(this.conditionKey('liquidation', reference));
    this.positionConditions.delete(this.conditionKey('adl', reference));
  }

  recordPriceMovement(index: { readonly min: string; readonly max: string }, sequence: number): void {
    this.latestIndexPrice = Object.freeze({ min: BigInt(index.min), max: BigInt(index.max), sequence });
    this.positionConditions.clear();
  }

  invalidatePositionConditions(): void {
    this.positionConditions.clear();
  }

  isOrderPriceConditionSatisfied(reference: ScenarioRef<'order'>, executionSequence: number): boolean {
    const order = this.order(reference);
    if (!order) return false;
    if (order.orderType === 'market-open' || order.orderType === 'market-close') return true;
    if (!order.triggerPriceRaw || !this.latestIndexPrice) return false;
    if (this.latestIndexPrice.sequence <= order.createdAt || this.latestIndexPrice.sequence >= executionSequence) return false;

    const trigger = BigInt(order.triggerPriceRaw);
    if (order.orderType === 'limit-increase') {
      // BaseOrderUtils.validateOrderPrices: long 使用 max <= trigger，short 使用 min >= trigger。
      return order.side === 'long' ? this.latestIndexPrice.max <= trigger : this.latestIndexPrice.min >= trigger;
    }
    if (order.orderType === 'limit-decrease') {
      return order.side === 'long' ? this.latestIndexPrice.min >= trigger : this.latestIndexPrice.max <= trigger;
    }
    return order.side === 'long' ? this.latestIndexPrice.min <= trigger : this.latestIndexPrice.max >= trigger;
  }

  recordConditionRequest(condition: PositionCondition, position: ScenarioRef<'position'>, sequence: number): void {
    this.positionConditions.set(this.conditionKey(condition, position), { status: 'NOT_CHECKED', sequence });
  }

  recordConditionAssessment(
    condition: PositionCondition,
    subject: string,
    status: PositionConditionAssessmentStatus,
    sourcePath: string,
    sequence: number,
  ): void {
    this.positionConditions.set(`${condition}:${subject}`, {
      status,
      sequence,
      sourcePath,
    });
  }

  hasConditionRequestAfterOpen(condition: PositionCondition, position: ScenarioRef<'position'>): boolean {
    const current = this.position(position);
    const assessment = this.positionConditions.get(this.conditionKey(condition, position));
    return Boolean(current && assessment && assessment.sequence > current.openedAt);
  }

  isConditionSatisfiedAfterOpen(condition: PositionCondition, position: ScenarioRef<'position'>): boolean {
    const current = this.position(position);
    const assessment = this.positionConditions.get(this.conditionKey(condition, position));
    return Boolean(
      current
      && assessment
      && assessment.sequence > current.openedAt
      && assessment.status === 'SATISFIED'
      && assessment.sourcePath,
    );
  }

  private conditionKey(condition: PositionCondition, position: ScenarioRef<'position'>): string {
    return `${condition}:${referenceKey(position)}`;
  }
}

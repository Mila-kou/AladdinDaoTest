import type { ActionEvidence, Address, Hex, JsonValue } from '../evidence/evidence-v3.js';
import { validateTestEnvironmentDefinition } from '../domain/test-environment.js';
import type { ScenarioDefinition, TradeAction } from './actions.js';
import { ScenarioContext } from './scenario-context.js';
import { referenceKey } from './references.js';
import type { PositionConditionAssessmentStatus } from './scenario-context.js';

export class InvalidScenarioTransitionError extends Error {
  constructor(readonly actionId: string, message: string) {
    super(`${actionId}: ${message}`);
    this.name = 'InvalidScenarioTransitionError';
  }
}

function reject(action: TradeAction, message: string): never {
  throw new InvalidScenarioTransitionError(action.id, message);
}

function actorAddress(context: ScenarioContext, action: TradeAction, actor: string): Address {
  const address = context.actors[actor];
  if (!address) reject(action, `未登记 actor ${actor}`);
  return address;
}

function positiveIntegerString(action: TradeAction, value: string, label: string): void {
  if (!/^\d+$/.test(value) || BigInt(value) <= 0n) reject(action, `${label} 必须为正整数原始值`);
}

function expectedOrderOutcome(action: Extract<TradeAction, { readonly type: 'executeOrder' }>): 'EXECUTED' | 'CANCELLED' | 'FROZEN' {
  return action.expectedOutcome ?? 'EXECUTED';
}

export function conditionAssessmentParameterName(
  condition: 'liquidation' | 'adl',
  subject: string,
): string {
  return `precondition.${condition}.${subject}`;
}

function conditionStatus(value: JsonValue): PositionConditionAssessmentStatus | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const status = value.status;
  return status === 'SATISFIED' || status === 'NOT_SATISFIED' || status === 'NOT_CHECKED' ? status : undefined;
}

export function validateAction(context: ScenarioContext, action: TradeAction, actionSequence: number): void {
  if (action.capabilities.includes('transaction') && context.environment.signingMode === 'readonly') {
    reject(action, 'readonly 场景不允许执行写链动作');
  }

  switch (action.type) {
    case 'submitMarketIncrease': {
      actorAddress(context, action, action.actor);
      if (context.environment.marketMode === 'not-applicable') reject(action, '当前环境未声明市场资源，不允许提交订单动作');
      if ('triggerPriceRaw' in action && action.triggerPriceRaw !== undefined) {
        reject(action, 'Market 订单不能配置 Limit trigger');
      }
      positiveIntegerString(action, action.collateralRaw, 'collateralRaw');
      positiveIntegerString(action, action.sizeDeltaUsdRaw, 'sizeDeltaUsdRaw');
      if (context.order(action.saveAs)) reject(action, `订单引用 ${action.saveAs.name} 已存在`);
      return;
    }
    case 'placeLimit': {
      actorAddress(context, action, action.actor);
      if (context.environment.marketMode === 'not-applicable') reject(action, '当前环境未声明市场资源，不允许提交订单动作');
      positiveIntegerString(action, action.collateralRaw, 'collateralRaw');
      positiveIntegerString(action, action.sizeDeltaUsdRaw, 'sizeDeltaUsdRaw');
      positiveIntegerString(action, action.triggerPriceRaw, 'Limit triggerPriceRaw');
      positiveIntegerString(action, action.acceptablePriceRaw, 'acceptablePriceRaw');
      if (context.order(action.saveAs)) reject(action, `订单引用 ${action.saveAs.name} 已存在`);
      return;
    }
    case 'executeOrder': {
      const order = context.order(action.order);
      if (!order) reject(action, `订单引用 ${action.order.name} 不存在`);
      if (order.status !== 'pending') reject(action, `订单 ${action.order.name} 状态为 ${order.status}，不能执行`);
      if (expectedOrderOutcome(action) === 'EXECUTED' && !context.isOrderPriceConditionSatisfied(action.order, actionSequence)) {
        reject(action, `订单 ${action.order.name} 的价格条件尚未满足，不能声明 EXECUTED`);
      }
      if (action.savePositionAs && context.position(action.savePositionAs)) {
        reject(action, `仓位引用 ${action.savePositionAs.name} 已存在`);
      }
      if (action.position) {
        const position = context.position(action.position);
        if (!position || position.status !== 'open') reject(action, `仓位 ${action.position.name} 未开启`);
        if (!action.positionEffect) reject(action, '减仓订单执行必须声明 positionEffect');
      }
      return;
    }
    case 'addTpSl': {
      actorAddress(context, action, action.actor);
      const position = context.position(action.position);
      if (!position || position.status !== 'open') reject(action, `仓位 ${action.position.name} 未开启`);
      if (!action.takeProfitRaw && !action.stopLossRaw) reject(action, 'TP 与 SL 至少提供一个');
      if (action.takeProfitRaw) {
        positiveIntegerString(action, action.takeProfitRaw, 'takeProfitRaw');
        if (!action.tpSaveAs) reject(action, '设置 TP 时必须提供 tpSaveAs');
        if (context.order(action.tpSaveAs)) reject(action, `订单引用 ${action.tpSaveAs.name} 已存在`);
      }
      if (action.stopLossRaw) {
        positiveIntegerString(action, action.stopLossRaw, 'stopLossRaw');
        if (!action.slSaveAs) reject(action, '设置 SL 时必须提供 slSaveAs');
        if (context.order(action.slSaveAs)) reject(action, `订单引用 ${action.slSaveAs.name} 已存在`);
      }
      return;
    }
    case 'submitMarketDecrease': {
      actorAddress(context, action, action.actor);
      if (action.percent !== undefined && (action.percent <= 0 || action.percent > 100)) {
        reject(action, `平仓比例必须在 (0, 100]，实际 ${action.percent}`);
      }
      const position = context.position(action.position);
      if (!position || position.status !== 'open') reject(action, `仓位 ${action.position.name} 未开启`);
      if (context.order(action.saveAs)) reject(action, `订单引用 ${action.saveAs.name} 已存在`);
      return;
    }
    case 'liquidate':
    case 'adl': {
      const position = context.position(action.position);
      if (!position || position.status !== 'open') reject(action, `仓位 ${action.position.name} 未开启`);
      if (context.environment.marketCompatibility !== 'mock-only') {
        reject(action, `${action.type === 'liquidate' ? '清算' : 'ADL'}精确条件场景必须声明 mock-only`);
      }
      const condition = action.type === 'liquidate' ? 'liquidation' : 'adl';
      if (context.mode === 'planning') {
        if (!context.hasConditionRequestAfterOpen(condition, action.position)) {
          reject(action, `执行前没有声明对仓位 ${action.position.name} 的${condition === 'liquidation' ? '可清算' : 'ADL'}条件评估`);
        }
      } else if (!context.isConditionSatisfiedAfterOpen(condition, action.position)) {
        reject(action, `仓位 ${action.position.name} 没有带来源的 ${condition} 条件满足证据`);
      }
      return;
    }
    case 'movePrice': {
      let indexMin: bigint;
      let indexMax: bigint;
      try {
        indexMin = BigInt(action.index.min);
        indexMax = BigInt(action.index.max);
      } catch {
        reject(action, 'index min/max 必须为整数原始价格');
      }
      if (indexMin <= 0n || indexMax <= 0n) reject(action, 'index min/max 必须大于 0');
      if (indexMin > indexMax) reject(action, 'index min 不能大于 max');
      if (action.collateral) {
        let collateralMin: bigint;
        let collateralMax: bigint;
        try {
          collateralMin = BigInt(action.collateral.min);
          collateralMax = BigInt(action.collateral.max);
        } catch {
          reject(action, 'collateral min/max 必须为整数原始价格');
        }
        if (collateralMin <= 0n || collateralMax <= 0n) reject(action, 'collateral min/max 必须大于 0');
        if (collateralMin > collateralMax) reject(action, 'collateral min 不能大于 max');
      }
      if (context.environment.oracleMode !== 'mock-oracle') reject(action, 'movePrice 只能使用 Mock Oracle');
      if (context.environment.marketCompatibility !== 'mock-only') {
        reject(action, '显式价格控制场景必须声明 mock-only，不能切换普通部署市场');
      }
      if (action.timestamp !== undefined && !action.timestamp.trim()) reject(action, 'movePrice.timestamp 不能为空');
      if (action.timestamp !== undefined && action.timestamp !== 'next-block'
        && (context.environment.targetProject !== 'time-fork' || context.environment.timeMode !== 'controllable-time')) {
        reject(action, '非 time-fork 只能使用 next-block Oracle 时间戳，不能显式推进时间');
      }
      const seen = new Set<string>();
      for (const request of action.assess ?? []) {
        const position = context.position(request.position);
        if (!position || position.status !== 'open') reject(action, `条件评估引用的仓位 ${request.position.name} 未开启`);
        const key = `${request.condition}:${referenceKey(request.position)}`;
        if (seen.has(key)) reject(action, `重复条件评估 ${key}`);
        seen.add(key);
      }
      return;
    }
    case 'advanceTime':
      if (!Number.isSafeInteger(action.seconds) || action.seconds <= 0) reject(action, 'advanceTime.seconds 必须为正安全整数');
      if (context.environment.targetProject !== 'time-fork' || context.environment.timeMode !== 'controllable-time') {
        reject(action, '只有 time-fork + controllable-time 可以推进时间');
      }
      return;
  }
}

function firstOrderKey(evidence: ActionEvidence): Hex | undefined {
  return evidence.transactions.find((item) => item.orderKey)?.orderKey
    ?? Object.values(evidence.orderRefs ?? {})[0];
}

function firstPositionKey(evidence: ActionEvidence): Hex | undefined {
  return Object.values(evidence.positionRefs ?? {})[0];
}

export function applyActionEvidence(
  context: ScenarioContext,
  action: TradeAction,
  evidence: ActionEvidence,
  actionSequence: number,
): void {
  switch (action.type) {
    case 'submitMarketIncrease':
    case 'placeLimit': {
      if (evidence.outcome !== 'SUBMITTED') reject(action, `提交动作结果必须为 SUBMITTED，实际 ${evidence.outcome}`);
      const orderKey = firstOrderKey(evidence);
      const base = {
        orderType: action.type === 'placeLimit' ? 'limit-increase' as const : 'market-open' as const,
        status: 'pending' as const,
        actor: actorAddress(context, action, action.actor),
        side: action.side,
        createdAt: actionSequence,
      };
      context.setOrder(action.saveAs, {
        ...base,
        ...(action.type === 'placeLimit' ? { triggerPriceRaw: action.triggerPriceRaw } : {}),
        ...(orderKey ? { orderKey } : {}),
      });
      return;
    }
    case 'executeOrder': {
      const outcome = evidence.outcome;
      const expected = expectedOrderOutcome(action);
      if (outcome !== expected) reject(action, `执行动作期望 ${expected}，实际 ${outcome}`);
      const status = outcome === 'EXECUTED' ? 'executed'
        : outcome === 'CANCELLED' ? 'cancelled'
          : outcome === 'FROZEN' ? 'frozen'
            : undefined;
      if (!status) reject(action, `执行动作必须先判别 EXECUTED/CANCELLED/FROZEN，实际 ${outcome}`);
      const order = context.order(action.order);
      if (!order) reject(action, `订单引用 ${action.order.name} 不存在`);
      const actualOrderKey = firstOrderKey(evidence);
      if (order.orderKey && actualOrderKey !== order.orderKey) {
        reject(action, `执行证据 orderKey 不一致，期望 ${order.orderKey}，实际 ${actualOrderKey ?? '缺失'}`);
      }
      context.updateOrder(action.order, { status });
      if (outcome === 'EXECUTED' && action.savePositionAs) {
        const positionKey = firstPositionKey(evidence);
        context.setPosition(action.savePositionAs, {
          status: 'open',
          actor: order.actor,
          side: order.side,
          openedAt: actionSequence,
          ...(positionKey ? { positionKey } : {}),
        });
      }
      if (outcome === 'EXECUTED' && action.position && action.positionEffect === 'full-close') {
        context.updatePosition(action.position, { status: 'closed' });
      }
      return;
    }
    case 'addTpSl': {
      if (evidence.outcome !== 'SUBMITTED' && evidence.outcome !== 'EXECUTED') {
        reject(action, `TP/SL 动作结果必须为 SUBMITTED 或 EXECUTED，实际 ${evidence.outcome}`);
      }
      const position = context.position(action.position);
      if (!position) reject(action, `仓位 ${action.position.name} 未开启`);
      const actor = actorAddress(context, action, action.actor);
      if (action.tpSaveAs && action.takeProfitRaw) {
        context.setOrder(action.tpSaveAs, {
          orderType: 'limit-decrease', status: 'pending', actor, side: position.side,
          createdAt: actionSequence, triggerPriceRaw: action.takeProfitRaw,
        });
      }
      if (action.slSaveAs && action.stopLossRaw) {
        context.setOrder(action.slSaveAs, {
          orderType: 'stop-loss-decrease', status: 'pending', actor, side: position.side,
          createdAt: actionSequence, triggerPriceRaw: action.stopLossRaw,
        });
      }
      return;
    }
    case 'submitMarketDecrease': {
      if (evidence.outcome !== 'SUBMITTED') reject(action, `关仓提交结果必须为 SUBMITTED，实际 ${evidence.outcome}`);
      const position = context.position(action.position);
      if (!position) reject(action, `仓位 ${action.position.name} 未开启`);
      const orderKey = firstOrderKey(evidence);
      context.setOrder(action.saveAs, {
        orderType: 'market-close', status: 'pending', actor: actorAddress(context, action, action.actor),
        side: position.side, createdAt: actionSequence, ...(orderKey ? { orderKey } : {}),
      });
      return;
    }
    case 'movePrice': {
      if (evidence.outcome !== 'OBSERVED' && evidence.outcome !== 'EXECUTED') {
        reject(action, `movePrice 结果必须为 OBSERVED 或 EXECUTED，实际 ${evidence.outcome}`);
      }
      context.recordPriceMovement(action.index, actionSequence);
      const observedBlocks = new Set([
        ...evidence.transactions.map((item) => item.blockNumber),
        ...evidence.oracle.flatMap((item) => item.blockNumber ? [item.blockNumber] : []),
        ...evidence.snapshots.map((item) => item.blockNumber),
      ]);
      for (const request of action.assess ?? []) {
        const subject = referenceKey(request.position);
        const name = conditionAssessmentParameterName(request.condition, subject);
        const assessment = evidence.parameters.find((item) => item.name === name);
        const status = assessment && conditionStatus(assessment.value);
        if (!assessment || !status || !assessment.source.trim() || !assessment.blockNumber
          || !observedBlocks.has(assessment.blockNumber)) {
          reject(action, `缺少带来源的条件评估参数 ${name}`);
        }
        context.recordConditionAssessment(request.condition, subject, status, assessment.source, actionSequence);
      }
      return;
    }
    case 'advanceTime':
      if (evidence.outcome !== 'OBSERVED' && evidence.outcome !== 'EXECUTED') {
        reject(action, `advanceTime 结果必须为 OBSERVED 或 EXECUTED，实际 ${evidence.outcome}`);
      }
      context.invalidatePositionConditions();
      return;
    case 'liquidate':
      if (evidence.outcome !== 'EXECUTED') reject(action, `清算必须执行成功，实际 ${evidence.outcome}`);
      context.updatePosition(action.position, { status: 'liquidated' });
      return;
    case 'adl':
      if (evidence.outcome !== 'EXECUTED') reject(action, `ADL 必须执行成功，实际 ${evidence.outcome}`);
      return;
  }
}

function applyPlannedAction(context: ScenarioContext, action: TradeAction, actionSequence: number): void {
  switch (action.type) {
    case 'submitMarketIncrease':
    case 'placeLimit':
      context.setOrder(action.saveAs, {
        orderType: action.type === 'placeLimit' ? 'limit-increase' : 'market-open',
        status: 'pending', actor: actorAddress(context, action, action.actor), side: action.side,
        createdAt: actionSequence, ...(action.type === 'placeLimit' ? { triggerPriceRaw: action.triggerPriceRaw } : {}),
      });
      return;
    case 'executeOrder': {
      const order = context.order(action.order);
      if (!order) reject(action, `订单引用 ${action.order.name} 不存在`);
      const outcome = expectedOrderOutcome(action);
      context.updateOrder(action.order, {
        status: outcome === 'EXECUTED' ? 'executed' : outcome === 'CANCELLED' ? 'cancelled' : 'frozen',
      });
      if (outcome === 'EXECUTED' && action.savePositionAs) {
        context.setPosition(action.savePositionAs, {
          status: 'open', actor: order.actor, side: order.side, openedAt: actionSequence,
        });
      }
      if (outcome === 'EXECUTED' && action.position && action.positionEffect === 'full-close') {
        context.updatePosition(action.position, { status: 'closed' });
      }
      return;
    }
    case 'addTpSl': {
      const position = context.position(action.position);
      if (!position) reject(action, `仓位 ${action.position.name} 未开启`);
      const actor = actorAddress(context, action, action.actor);
      if (action.tpSaveAs && action.takeProfitRaw) {
        context.setOrder(action.tpSaveAs, {
          orderType: 'limit-decrease', status: 'pending', actor, side: position.side,
          createdAt: actionSequence, triggerPriceRaw: action.takeProfitRaw,
        });
      }
      if (action.slSaveAs && action.stopLossRaw) {
        context.setOrder(action.slSaveAs, {
          orderType: 'stop-loss-decrease', status: 'pending', actor, side: position.side,
          createdAt: actionSequence, triggerPriceRaw: action.stopLossRaw,
        });
      }
      return;
    }
    case 'submitMarketDecrease': {
      const position = context.position(action.position);
      if (!position) reject(action, `仓位 ${action.position.name} 未开启`);
      context.setOrder(action.saveAs, {
        orderType: 'market-close', status: 'pending', actor: actorAddress(context, action, action.actor),
        side: position.side, createdAt: actionSequence,
      });
      return;
    }
    case 'movePrice':
      context.recordPriceMovement(action.index, actionSequence);
      for (const request of action.assess ?? []) {
        context.recordConditionRequest(request.condition, request.position, actionSequence);
      }
      return;
    case 'advanceTime':
      context.invalidatePositionConditions();
      return;
    case 'liquidate':
      context.updatePosition(action.position, { status: 'liquidated' });
      return;
    case 'adl':
      return;
  }
}

/** 构建 ScenarioDefinition 时执行完整静态演练，非法组合不会触发任何 Executor。 */
export function validateScenarioDefinition(definition: ScenarioDefinition): void {
  validateTestEnvironmentDefinition(definition.environment);
  const actors = Object.fromEntries(definition.actors.map((name, index) => [
    name,
    `0x${(index + 1).toString(16).padStart(40, '0')}` as Address,
  ]));
  const context = new ScenarioContext(definition.environment, actors, 'planning');
  for (const [index, action] of definition.actions.entries()) {
    const sequence = index + 1;
    validateAction(context, action, sequence);
    applyPlannedAction(context, action, sequence);
  }
}

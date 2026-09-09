import { randomUUID } from 'node:crypto';

import type {
  ActionEvidence,
  EnvironmentIdentity,
  EvidenceEnvelope,
} from '../evidence/evidence-v3.js';
import { requireExecutionTransaction } from '../evidence/execution-transaction.js';
import {
  assertResolvedTestEnvironment,
  type ResolvedTestEnvironment,
} from '../domain/test-environment.js';
import type { ScenarioDefinition, TradeAction, TradeActionType } from './actions.js';
import { ScenarioContext } from './scenario-context.js';
import { applyActionEvidence, validateAction, validateScenarioDefinition } from './state-machine.js';

export interface ActionExecutionInput<T extends TradeAction = TradeAction> {
  readonly action: T;
  readonly sequence: number;
  readonly context: ScenarioContext;
}

/** Implementations perform side effects and return raw facts only. */
export interface ActionExecutor<T extends TradeAction = TradeAction> {
  execute(input: ActionExecutionInput<T>): Promise<Omit<ActionEvidence,
    | 'schemaVersion'
    | 'actionId'
    | 'sequence'
    | 'type'
    | 'purpose'
    | 'capabilities'
    | 'windowContamination'
  >>;
}

export type ActionExecutorRegistry = {
  readonly [K in TradeActionType]?: ActionExecutor<Extract<TradeAction, { readonly type: K }>>;
};

export interface HarnessRunOptions {
  readonly environment: EnvironmentIdentity;
  /** 批次/Runtime 已解析的实际能力，用于在任何副作用之前核对设计环境。 */
  readonly resolvedEnvironment: ResolvedTestEnvironment;
  readonly actors: Readonly<Record<string, `0x${string}`>>;
  readonly executionId?: string;
  readonly now?: () => Date;
}

export function assertActionExecutorsRegistered(
  definition: ScenarioDefinition,
  executors: ActionExecutorRegistry,
): void {
  const required = [...new Set(definition.actions.map((action) => action.type))];
  const missing = required.filter((type) => typeof executors[type]?.execute !== 'function');
  if (missing.length > 0) {
    throw new Error(`${definition.caseId}: 缺少 Action Executor：${missing.join(', ')}`);
  }
}

export function validateHarnessRunOptions(
  definition: ScenarioDefinition,
  options: HarnessRunOptions,
): void {
  validateScenarioDefinition(definition);
  assertResolvedTestEnvironment(definition.environment, options.resolvedEnvironment);
  if (options.environment.name !== options.resolvedEnvironment.targetProject) {
    throw new Error(
      `Evidence 环境 ${options.environment.name} 与解析运行环境 ${options.resolvedEnvironment.targetProject} 不一致`,
    );
  }
  if (options.environment.market?.mode && options.environment.market.mode !== options.resolvedEnvironment.marketMode) {
    throw new Error(
      `Evidence Market=${options.environment.market.mode} 与解析运行环境 ${options.resolvedEnvironment.marketMode} 不一致`,
    );
  }
  if (options.environment.market?.resourceAlias
    && options.environment.market.resourceAlias !== options.resolvedEnvironment.mockResourceAlias) {
    throw new Error(
      `Evidence mockResourceAlias=${options.environment.market.resourceAlias} 与解析运行环境 ${options.resolvedEnvironment.mockResourceAlias} 不一致`,
    );
  }
  for (const actor of definition.actors) {
    if (!options.actors[actor]) throw new Error(`场景 actor ${actor} 没有运行时地址`);
  }
}

export class ScenarioHarness {
  constructor(private readonly executors: ActionExecutorRegistry) {}

  async run(definition: ScenarioDefinition, options: HarnessRunOptions): Promise<EvidenceEnvelope> {
    assertActionExecutorsRegistered(definition, this.executors);
    validateHarnessRunOptions(definition, options);

    const now = options.now ?? (() => new Date());
    const startedAt = now().toISOString();
    const context = new ScenarioContext(definition.environment, options.actors, 'runtime', options.resolvedEnvironment);
    const actionEvidence: ActionEvidence[] = [];

    for (const [index, action] of definition.actions.entries()) {
      const sequence = index + 1;
      validateAction(context, action, sequence);
      const executor = this.executor(action);
      const raw = await executor.execute({ action, sequence, context });
      if (Object.prototype.hasOwnProperty.call(raw, 'windowContamination')) {
        throw new Error(`${action.id}: Action Executor 不得自行提供执行窗口污染结论`);
      }
      const requiresExecutionWindow = ['executeOrder', 'liquidate', 'adl'].includes(action.type)
        && ['EXECUTED', 'CANCELLED', 'FROZEN'].includes(raw.outcome);
      const evidence: ActionEvidence = {
        ...raw,
        ...(requiresExecutionWindow
          ? {
            windowContamination: {
              status: 'NOT_CHECKED' as const,
              note: '执行窗口扫描器未提供逐块凭证',
            },
          }
          : {}),
        schemaVersion: 3,
        actionId: action.id,
        sequence,
        type: action.type,
        purpose: action.purpose,
        capabilities: [...action.capabilities],
      };
      validatePinnedExecutionSnapshots(evidence);
      applyActionEvidence(context, action, evidence, sequence);
      actionEvidence.push(evidence);
    }

    return {
      schemaVersion: 3,
      caseId: definition.caseId,
      variantId: definition.variantId,
      executionId: options.executionId ?? randomUUID(),
      flowType: definition.flowType,
      capabilities: [...definition.capabilities],
      environment: options.environment,
      actions: actionEvidence,
      startedAt,
      endedAt: now().toISOString(),
    };
  }

  private executor(action: TradeAction): ActionExecutor {
    const executor = this.executors[action.type] as ActionExecutor | undefined;
    if (!executor) throw new Error(`没有为动作 ${action.type} 注册执行器`);
    return executor;
  }
}

/** Executed/Cancelled/Frozen actions must prove N-1/N authoritative snapshots. */
export function validatePinnedExecutionSnapshots(evidence: ActionEvidence): void {
  if (!['executeOrder', 'liquidate', 'adl'].includes(evidence.type)) return;
  if (!['EXECUTED', 'CANCELLED', 'FROZEN'].includes(evidence.outcome)) return;
  const beforeSnapshots = evidence.snapshots.filter((item) => item.kind === 'execution-before');
  const afterSnapshots = evidence.snapshots.filter((item) => item.kind === 'execution-after');
  if (beforeSnapshots.length !== 1 || afterSnapshots.length !== 1) {
    throw new Error(
      `${evidence.actionId}: ${evidence.outcome} 要求唯一 execution-before/execution-after，`
      + `实际 ${beforeSnapshots.length}/${afterSnapshots.length}`,
    );
  }
  const before = beforeSnapshots[0]!;
  const after = afterSnapshots[0]!;
  if (BigInt(after.blockNumber) - BigInt(before.blockNumber) !== 1n) {
    throw new Error(`${evidence.actionId}: 权威快照必须为 executionBlock-1/executionBlock，实际 ${before.blockNumber}/${after.blockNumber}`);
  }
  requireExecutionTransaction(evidence);
}

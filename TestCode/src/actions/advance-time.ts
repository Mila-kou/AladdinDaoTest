import type { ActionEvidence } from '../evidence/evidence-v3.js';
import { decimal } from '../evidence/evidence-v3.js';
import type { ActionExecutionInput, ActionExecutor } from '../scenario-engine/action-executor.js';
import type { AdvanceTimeAction } from '../scenario-engine/actions.js';
import { advanceForkTime } from '../drivers/fork-time.js';

type RawActionEvidence = Omit<ActionEvidence,
  'schemaVersion' | 'actionId' | 'sequence' | 'type' | 'purpose' | 'capabilities'
>;

export interface AdvanceTimeExecutorOptions {
  readonly adminRpcUrl: string;
  readonly timeoutMs?: number;
  readonly now?: () => Date;
}

/** Real advanceTime executor for the isolated time-fork environment. */
export class AdvanceTimeActionExecutor implements ActionExecutor<AdvanceTimeAction> {
  constructor(private readonly options: AdvanceTimeExecutorOptions) {}

  async execute(input: ActionExecutionInput<AdvanceTimeAction>): Promise<RawActionEvidence> {
    const resolvedEnvironment = input.context.resolvedEnvironment;
    if (!resolvedEnvironment) {
      throw new Error('advanceTime 缺少已解析运行环境');
    }
    if (resolvedEnvironment.targetProject !== 'time-fork'
      || resolvedEnvironment.timeMode !== 'controllable-time') {
      throw new Error(
        `advanceTime 仅允许 time-fork + controllable-time，实际为 ${resolvedEnvironment.targetProject} + ${resolvedEnvironment.timeMode}`,
      );
    }

    const now = this.options.now ?? (() => new Date());
    const startedAt = now().toISOString();
    const result = await advanceForkTime({
      adminRpcUrl: this.options.adminRpcUrl,
      seconds: input.action.seconds,
      ...(this.options.timeoutMs === undefined ? {} : { timeoutMs: this.options.timeoutMs }),
    });
    const endedAt = now().toISOString();
    const afterBlock = decimal(result.after.number);
    const source = 'admin-rpc:evm_increaseTime+evm_mine';

    return {
      outcome: 'OBSERVED',
      input: input.action.input,
      transactions: [],
      snapshots: [
        {
          id: `${input.action.id}:time-before`,
          kind: 'observation',
          blockNumber: decimal(result.before.number),
          blockHash: result.before.hash,
          source: 'rpc',
          values: {
            phase: 'before',
            timestamp: decimal(result.before.timestamp),
          },
        },
        {
          id: `${input.action.id}:time-after`,
          kind: 'observation',
          blockNumber: afterBlock,
          blockHash: result.after.hash,
          source: 'rpc',
          values: {
            phase: 'after',
            timestamp: decimal(result.after.timestamp),
          },
        },
      ],
      events: [],
      parameters: [
        {
          name: 'advanceTime.seconds',
          value: decimal(input.action.seconds),
          source,
          blockNumber: afterBlock,
        },
        {
          name: 'advanceTime.oldTimestamp',
          value: decimal(result.before.timestamp),
          source,
          blockNumber: afterBlock,
        },
        {
          name: 'advanceTime.newTimestamp',
          value: decimal(result.after.timestamp),
          source,
          blockNumber: afterBlock,
        },
      ],
      oracle: [],
      startedAt,
      endedAt,
    };
  }
}

export function createAdvanceTimeExecutor(options: AdvanceTimeExecutorOptions): ActionExecutor<AdvanceTimeAction> {
  return new AdvanceTimeActionExecutor(options);
}

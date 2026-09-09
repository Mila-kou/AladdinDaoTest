import type { RuntimeConfig } from '../config/runtime.js';
import type { ResolvedTestEnvironment } from '../domain/test-environment.js';
import {
  evidenceEnvelopeSchema,
  type Address,
  type EvidenceEnvelope,
} from '../evidence/evidence-v3.js';
import {
  ScenarioHarness,
  assertActionExecutorsRegistered,
  validateHarnessRunOptions,
  type ActionExecutorRegistry,
  type HarnessRunOptions,
} from '../scenario-engine/action-executor.js';
import type { ScenarioDefinition } from '../scenario-engine/actions.js';
import {
  assertRuntimeMatchesResolvedEnvironment,
  buildRuntimeEnvironmentIdentity,
  type RuntimeMarketIdentity,
} from './runtime-environment.js';
import { collectExecutionWindows } from './window-contamination.js';
import { revertForkSnapshot, takeForkSnapshot } from '../drivers/fork-snapshot.js';

export type LiveMarketIdentity = RuntimeMarketIdentity;

export interface RunLiveScenarioInput {
  readonly runtime: RuntimeConfig;
  readonly definition: ScenarioDefinition;
  /** Resolved independently from ScenarioDefinition by Runtime/Driver setup. */
  readonly resolvedEnvironment: ResolvedTestEnvironment;
  readonly actors: Readonly<Record<string, Address>>;
  readonly executors: ActionExecutorRegistry;
  readonly market?: LiveMarketIdentity;
  readonly executionId?: string;
  readonly now?: () => Date;
}

/**
 * Production ScenarioHarness entry. All environment, actor, and executor
 * preflight checks complete before the first executor is allowed to run.
 */
export async function runLiveScenario(input: RunLiveScenarioInput): Promise<EvidenceEnvelope> {
  assertRuntimeMatchesResolvedEnvironment(input.runtime, input.resolvedEnvironment);
  assertActionExecutorsRegistered(input.definition, input.executors);
  const harnessOptions: HarnessRunOptions = {
    environment: buildRuntimeEnvironmentIdentity(input.runtime, input.resolvedEnvironment, input.market),
    resolvedEnvironment: input.resolvedEnvironment,
    actors: input.actors,
    ...(input.executionId ? { executionId: input.executionId } : {}),
    ...(input.now ? { now: input.now } : {}),
  };
  validateHarnessRunOptions(input.definition, harnessOptions);

  const needsSnapshot = input.definition.isolation === 'snapshot'
    && input.definition.capabilities.includes('transaction');
  if (needsSnapshot && !input.runtime.adminRpcUrl) {
    throw new Error(`${input.definition.caseId}: snapshot isolation 缺少 admin RPC`);
  }
  const snapshotOptions = needsSnapshot && input.runtime.adminRpcUrl
    ? { adminRpcUrl: input.runtime.adminRpcUrl, timeoutMs: input.runtime.requestTimeoutMs }
    : undefined;
  const snapshotId = snapshotOptions ? await takeForkSnapshot(snapshotOptions) : undefined;
  let result: EvidenceEnvelope | undefined;
  let executionError: unknown;
  let executionFailed = false;
  try {
    const rawEvidence = await new ScenarioHarness(input.executors).run(input.definition, harnessOptions);
    // Validate the executor boundary first, then enrich execution actions using
    // a complete-envelope block scan before any snapshot is reverted.
    const evidence = evidenceEnvelopeSchema.parse(rawEvidence) as EvidenceEnvelope;
    const withExecutionWindows = await collectExecutionWindows(evidence, {
      rpcUrl: input.runtime.rpcUrl,
      timeoutMs: input.runtime.requestTimeoutMs,
    });
    result = evidenceEnvelopeSchema.parse(withExecutionWindows) as EvidenceEnvelope;
  } catch (error) {
    executionFailed = true;
    executionError = error;
  }

  let cleanupError: unknown;
  if (snapshotOptions && snapshotId) {
    try {
      await revertForkSnapshot(snapshotOptions, snapshotId);
    } catch (error) {
      cleanupError = error;
    }
  }
  if (executionFailed && cleanupError) {
    throw new AggregateError(
      [executionError, cleanupError],
      `${input.definition.caseId}: 场景执行失败，且 snapshot isolation 回滚失败`,
    );
  }
  if (executionFailed) throw executionError;
  if (cleanupError) throw cleanupError;
  if (!result) throw new Error(`${input.definition.caseId}: 场景执行未返回 Evidence`);
  return result;
}

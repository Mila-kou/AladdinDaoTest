import type { SnapshotRef, TransactionRef } from './evidence-v3.js';

/**
 * Small structural boundary shared by executors and reconciliation consumers.
 * Keeping this outside scenario-engine prevents each consumer from inventing a
 * different "first transaction wins" rule.
 */
export interface ExecutionTransactionContainer {
  readonly actionId: string;
  readonly snapshots: readonly SnapshotRef[];
  readonly transactions: readonly TransactionRef[];
}

export type ExecutionTransactionResolution =
  | {
      readonly status: 'RESOLVED';
      readonly afterBlockNumber: `${bigint}`;
      readonly transaction: TransactionRef;
      readonly candidates: readonly [TransactionRef];
    }
  | {
      readonly status: 'MISSING';
      readonly afterBlockNumber?: `${bigint}`;
      readonly candidates: readonly [];
      readonly reason: string;
    }
  | {
      readonly status: 'AMBIGUOUS';
      readonly afterBlockNumber?: `${bigint}`;
      readonly candidates: readonly TransactionRef[];
      readonly reason: string;
    };

/**
 * The terminal execution transaction is the unique keeper/service transaction
 * in the authoritative execution-after block. Array order is never evidence.
 */
export function resolveExecutionTransaction(
  action: ExecutionTransactionContainer,
): ExecutionTransactionResolution {
  const afterSnapshots = action.snapshots.filter((snapshot) => snapshot.kind === 'execution-after');
  if (afterSnapshots.length === 0) {
    return {
      status: 'MISSING',
      candidates: [],
      reason: `${action.actionId}: 缺少 execution-after，无法识别执行交易`,
    };
  }
  if (afterSnapshots.length > 1) {
    return {
      status: 'AMBIGUOUS',
      candidates: [],
      reason: `${action.actionId}: 存在 ${afterSnapshots.length} 个 execution-after，无法唯一确定执行块`,
    };
  }
  const after = afterSnapshots[0]!.blockNumber;
  const allCandidates = action.transactions.filter((transaction) => (
    transaction.role === 'keeper' || transaction.role === 'service'
  ));
  const misplacedCandidates = allCandidates.filter((transaction) => transaction.blockNumber !== after);
  if (misplacedCandidates.length > 0) {
    return {
      status: 'AMBIGUOUS',
      afterBlockNumber: after,
      candidates: allCandidates,
      reason: `${action.actionId}: 有 ${misplacedCandidates.length} 笔 Keeper/Service 候选不在 execution-after=${after}，执行凭证自相矛盾`,
    };
  }
  const candidates = allCandidates;
  if (candidates.length === 0) {
    return {
      status: 'MISSING',
      afterBlockNumber: after,
      candidates: [],
      reason: `${action.actionId}: execution-after=${after} 没有 Keeper/Service 执行交易`,
    };
  }
  if (candidates.length > 1) {
    return {
      status: 'AMBIGUOUS',
      afterBlockNumber: after,
      candidates,
      reason: `${action.actionId}: execution-after=${after} 有 ${candidates.length} 笔 Keeper/Service 候选，执行交易存在歧义`,
    };
  }
  return {
    status: 'RESOLVED',
    afterBlockNumber: after,
    transaction: candidates[0]!,
    candidates: [candidates[0]!],
  };
}

export function requireExecutionTransaction(
  action: ExecutionTransactionContainer,
): TransactionRef {
  const resolution = resolveExecutionTransaction(action);
  if (resolution.status !== 'RESOLVED') throw new Error(resolution.reason);
  return resolution.transaction;
}

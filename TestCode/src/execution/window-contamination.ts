import {
  type ActionEvidence,
  type EvidenceEnvelope,
  type Hex,
  type TransactionRef,
  type WindowContaminationEvidence,
} from '../evidence/evidence-v3.js';
import { resolveExecutionTransaction } from '../evidence/execution-transaction.js';
import { scanBlockWindow } from '../drivers/block-window-scanner.js';

export interface CollectExecutionWindowsOptions {
  readonly rpcUrl: string;
  readonly timeoutMs?: number;
  readonly maxBlocks?: number;
}

function requiresExecutionWindow(action: ActionEvidence): boolean {
  if (!['executeOrder', 'liquidate', 'adl'].includes(action.type)) return false;
  return action.outcome === 'EXECUTED' || action.outcome === 'CANCELLED' || action.outcome === 'FROZEN';
}

function matchingSubmissions(
  evidence: EvidenceEnvelope,
  action: ActionEvidence,
  execution: TransactionRef,
): TransactionRef[] {
  const orderKey = execution.orderKey?.toLowerCase();
  if (!orderKey) return [];
  const byHash = new Map(evidence.actions
    .filter((candidate) => candidate.sequence < action.sequence && candidate.outcome === 'SUBMITTED')
    .flatMap((candidate) => candidate.transactions)
    .filter((candidate) => candidate.orderKey?.toLowerCase() === orderKey)
    .map((candidate) => [candidate.txHash.toLowerCase(), candidate] as const));
  return [...byHash.values()];
}

function notChecked(note: string): WindowContaminationEvidence {
  return { status: 'NOT_CHECKED', note };
}

async function collectActionWindow(
  evidence: EvidenceEnvelope,
  action: ActionEvidence,
  knownTransactions: readonly TransactionRef[],
  options: CollectExecutionWindowsOptions,
): Promise<WindowContaminationEvidence> {
  const beforeSnapshots = action.snapshots.filter((snapshot) => snapshot.kind === 'execution-before');
  if (beforeSnapshots.length !== 1) {
    return notChecked(`执行动作要求唯一 execution-before，实际数量=${beforeSnapshots.length}。`);
  }
  const afterSnapshots = action.snapshots.filter((snapshot) => snapshot.kind === 'execution-after');
  if (afterSnapshots.length !== 1) {
    return notChecked(`执行动作要求唯一 execution-after，实际数量=${afterSnapshots.length}。`);
  }
  const before = beforeSnapshots[0]!;
  const after = afterSnapshots[0]!;
  const executionResolution = resolveExecutionTransaction(action);
  if (executionResolution.status !== 'RESOLVED') return notChecked(executionResolution.reason);
  const execution = executionResolution.transaction;
  if (!execution.receipt || !execution.blockHash || !execution.receipt.blockHash) {
    return notChecked('执行交易缺少独立 receipt 或 transaction/receipt blockHash，不能生成完整扫描凭证。');
  }
  if (execution.receipt.transactionHash.toLowerCase() !== execution.txHash.toLowerCase()
    || execution.receipt.blockNumber !== execution.blockNumber
    || execution.receipt.blockHash.toLowerCase() !== execution.blockHash.toLowerCase()) {
    return notChecked('执行交易与独立 receipt 的 hash/block/blockHash 不一致。');
  }
  if (!before.blockHash || !after.blockHash) {
    return notChecked('execution-before/execution-after 缺少 blockHash，不能排除扫描期间重组。');
  }
  if (after.blockNumber !== execution.blockNumber
    || after.blockHash.toLowerCase() !== execution.blockHash.toLowerCase()) {
    return notChecked('execution-after 与执行交易的 block/blockHash 不一致。');
  }
  const submissions = matchingSubmissions(evidence, action, execution);
  if (action.type === 'executeOrder' && !execution.orderKey) {
    return notChecked('executeOrder 执行交易缺少 orderKey，无法定位提交交易。');
  }
  if (action.type === 'executeOrder' && submissions.length !== 1) {
    return notChecked(`executeOrder 无法唯一定位提交交易，匹配数量=${submissions.length}。`);
  }
  const submission = submissions[0];
  const fromBlock = submission && BigInt(submission.blockNumber) < BigInt(before.blockNumber)
    ? submission.blockNumber
    : before.blockNumber;
  const requiredTransactionHashes: Hex[] = [execution.txHash];
  if (submission) requiredTransactionHashes.push(submission.txHash);

  const window = await scanBlockWindow({
    rpcUrl: options.rpcUrl,
    fromBlock,
    toBlock: execution.blockNumber,
    knownTransactions,
    requiredTransactionHashes,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    ...(options.maxBlocks === undefined ? {} : { maxBlocks: options.maxBlocks }),
  });
  if (window.status === 'NOT_CHECKED') return window;
  const beforeBlock = window.inspectedBlocks.find((block) => block.blockNumber === before.blockNumber);
  if (!beforeBlock || beforeBlock.blockHash.toLowerCase() !== before.blockHash.toLowerCase()) {
    return {
      status: 'NOT_CHECKED',
      fromBlock: window.fromBlock,
      toBlock: window.toBlock,
      source: window.source,
      note: '扫描到的 execution-before blockHash 与权威快照不一致。',
    };
  }
  const afterBlock = window.inspectedBlocks.find((block) => block.blockNumber === after.blockNumber);
  if (!afterBlock || afterBlock.blockHash.toLowerCase() !== after.blockHash.toLowerCase()) {
    return {
      status: 'NOT_CHECKED',
      fromBlock: window.fromBlock,
      toBlock: window.toBlock,
      source: window.source,
      note: '扫描到的 execution-after blockHash 与权威快照不一致。',
    };
  }
  return window;
}

/**
 * Enrich execution actions after the complete scenario is known, so role
 * assignment is based on all registered business transactions. Terminal
 * windows are always rescanned here; an Executor cannot self-certify CLEAN.
 */
export async function collectExecutionWindows(
  evidence: EvidenceEnvelope,
  options: CollectExecutionWindowsOptions,
): Promise<EvidenceEnvelope> {
  const actions: ActionEvidence[] = [];
  for (const action of evidence.actions) {
    if (!requiresExecutionWindow(action)) {
      if (action.windowContamination) {
        throw new Error(`${action.actionId}: 非结算动作不得携带执行窗口污染结论`);
      }
      actions.push(action);
      continue;
    }
    const knownTransactions = evidence.actions
      .filter((candidate) => candidate.sequence <= action.sequence)
      .flatMap((candidate) => candidate.transactions);
    actions.push({
      ...action,
      windowContamination: await collectActionWindow(evidence, action, knownTransactions, options),
    });
  }
  return { ...evidence, actions };
}

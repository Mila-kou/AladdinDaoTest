import { adminRpcRequest } from './admin-rpc.js';
import {
  decimal,
  type Address,
  type DecimalString,
  type Hex,
  type ScannedBlockRef,
  type ScannedTransactionRef,
  type TransactionRef,
  type WindowContaminationEvidence,
} from '../evidence/evidence-v3.js';

const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

interface RpcTransaction {
  readonly hash?: unknown;
  readonly blockNumber?: unknown;
  readonly blockHash?: unknown;
  readonly transactionIndex?: unknown;
  readonly from?: unknown;
  readonly to?: unknown;
  readonly nonce?: unknown;
  readonly type?: unknown;
}

interface RpcBlock {
  readonly number?: unknown;
  readonly hash?: unknown;
  readonly parentHash?: unknown;
  readonly transactions?: unknown;
}

export interface ScanBlockWindowInput {
  readonly rpcUrl: string;
  readonly fromBlock: DecimalString;
  readonly toBlock: DecimalString;
  /** All transactions registered by the execution, including setup/support. */
  readonly knownTransactions: readonly TransactionRef[];
  /** Submission/execution hashes which this particular window must contain. */
  readonly requiredTransactionHashes?: readonly Hex[];
  readonly timeoutMs?: number;
  readonly maxBlocks?: number;
}

function redactRpcDetails(message: string, rpcUrl: string): string {
  const configuredRedacted = rpcUrl
    ? message.split(rpcUrl).join('[redacted-rpc-url]')
    : message;
  return configuredRedacted
    .replace(/(?:https?|wss?):\/\/[^\s"'`]+/giu, '[redacted-rpc-url]')
    .slice(0, 500);
}

function notChecked(
  input: ScanBlockWindowInput,
  path: string,
  note: string,
): WindowContaminationEvidence {
  return {
    status: 'NOT_CHECKED',
    fromBlock: input.fromBlock,
    toBlock: input.toBlock,
    source: {
      source: 'block-scan',
      path,
      blockNumber: input.toBlock,
    },
    note,
  };
}

function blockPath(fromBlock: DecimalString, toBlock: DecimalString): string {
  return `eth_getBlockByNumber(${fromBlock}..${toBlock},true)`;
}

function parseBlockNumber(value: unknown, field: string): bigint {
  if (typeof value !== 'string' || !/^(?:0x[0-9a-fA-F]+|\d+)$/.test(value)) {
    throw new Error(`${field} 不是有效区块数量`);
  }
  const parsed = BigInt(value);
  if (parsed < 0n) throw new Error(`${field} 不能为负数`);
  return parsed;
}

function parseInputBlockNumber(value: unknown, field: string): bigint {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    throw new Error(`${field} 不是十进制区块数量`);
  }
  return parseBlockNumber(value, field);
}

function parseHash(value: unknown, field: string): Hex {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    throw new Error(`${field} 不是 32-byte hash`);
  }
  return value as Hex;
}

function parseAddress(value: unknown, field: string): Address {
  if (typeof value !== 'string' || !ADDRESS_PATTERN.test(value)) {
    throw new Error(`${field} 不是 EVM 地址`);
  }
  return value as Address;
}

function optionalAddress(value: unknown, field: string): Address | undefined {
  if (value === null || value === undefined) return undefined;
  return parseAddress(value, field);
}

function parseQuantity(value: unknown, field: string): DecimalString {
  return decimal(parseBlockNumber(value, field));
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function knownTransactionMap(transactions: readonly TransactionRef[]): Map<string, TransactionRef> {
  const known = new Map<string, TransactionRef>();
  for (const transaction of transactions) {
    const key = transaction.txHash.toLowerCase();
    const previous = known.get(key);
    if (previous && (
      previous.blockNumber !== transaction.blockNumber
      || previous.role !== transaction.role
      || !sameAddress(previous.actor, transaction.actor)
    )) {
      throw new Error(`已登记交易 ${transaction.txHash} 的 block/role/actor 不一致`);
    }
    known.set(key, transaction);
  }
  return known;
}

function parseTransaction(
  value: unknown,
  containingBlockNumber: bigint,
  containingBlockHash: Hex,
  index: number,
  known: ReadonlyMap<string, TransactionRef>,
): ScannedTransactionRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`block.transactions[${index}] 不是完整交易对象；RPC 必须支持 fullTransactions=true`);
  }
  const transaction = value as RpcTransaction;
  const txHash = parseHash(transaction.hash, `block.transactions[${index}].hash`);
  const actor = parseAddress(transaction.from, `block.transactions[${index}].from`);
  const rpcBlockNumber = parseBlockNumber(transaction.blockNumber, `block.transactions[${index}].blockNumber`);
  if (rpcBlockNumber !== containingBlockNumber) {
    throw new Error(`交易 ${txHash} 的 blockNumber 与所在区块不一致`);
  }
  if (transaction.blockHash !== undefined && transaction.blockHash !== null) {
    const transactionBlockHash = parseHash(transaction.blockHash, `block.transactions[${index}].blockHash`);
    if (transactionBlockHash.toLowerCase() !== containingBlockHash.toLowerCase()) {
      throw new Error(`交易 ${txHash} 的 blockHash 与所在区块不一致`);
    }
  }

  const to = optionalAddress(transaction.to, `block.transactions[${index}].to`);
  const transactionIndex = parseQuantity(
    transaction.transactionIndex,
    `block.transactions[${index}].transactionIndex`,
  );
  if (BigInt(transactionIndex) !== BigInt(index)) {
    throw new Error(`交易 ${txHash} 的 transactionIndex 与区块交易顺序不一致`);
  }
  const nonce = parseQuantity(transaction.nonce, `block.transactions[${index}].nonce`);
  const transactionType = typeof transaction.type === 'string' ? transaction.type : undefined;

  const expected = known.get(txHash.toLowerCase());
  if (expected && (
    expected.blockNumber !== decimal(containingBlockNumber)
    || !sameAddress(expected.actor, actor)
  )) {
    throw new Error(`扫描交易 ${txHash} 与已登记 block/actor 不一致`);
  }
  if (expected?.blockHash && expected.blockHash.toLowerCase() !== containingBlockHash.toLowerCase()) {
    throw new Error(`扫描交易 ${txHash} 的区块 hash 与已登记 transaction 不一致`);
  }
  if (expected?.receipt?.blockHash
    && expected.receipt.blockHash.toLowerCase() !== containingBlockHash.toLowerCase()) {
    throw new Error(`扫描交易 ${txHash} 的区块 hash 与已登记 receipt 不一致`);
  }
  if (expected) {
    const expectedTo = expected.to?.toLowerCase();
    const scannedTo = to?.toLowerCase();
    if (expectedTo !== scannedTo) {
      throw new Error(`扫描交易 ${txHash} 的 to 与已登记 transaction 不一致`);
    }
    if (expected.nonce !== undefined && expected.nonce !== nonce) {
      throw new Error(`扫描交易 ${txHash} 的 nonce 与已登记 transaction 不一致`);
    }
    if (expected.transactionType !== undefined
      && (transactionType === undefined
        || expected.transactionType.toLowerCase() !== transactionType.toLowerCase())) {
      throw new Error(`扫描交易 ${txHash} 的 transactionType 与已登记 transaction 不一致`);
    }
  }

  return {
    txHash,
    blockNumber: decimal(containingBlockNumber),
    blockHash: containingBlockHash,
    actor,
    ...(to ? { to } : {}),
    transactionIndex,
    nonce,
    ...(transactionType === undefined ? {} : { transactionType }),
    ...(expected ? { role: expected.role } : {}),
  };
}

/**
 * Scan every block and every transaction in an inclusive execution window.
 * Any incomplete or inconsistent RPC response is preserved as NOT_CHECKED;
 * this collector never guesses CLEAN from endpoint snapshots.
 */
export async function scanBlockWindow(
  input: ScanBlockWindowInput,
): Promise<WindowContaminationEvidence> {
  const path = blockPath(input.fromBlock, input.toBlock);
  let fromBlock: bigint;
  let toBlock: bigint;
  try {
    fromBlock = parseInputBlockNumber(input.fromBlock, 'fromBlock');
    toBlock = parseInputBlockNumber(input.toBlock, 'toBlock');
  } catch (error) {
    return {
      status: 'NOT_CHECKED',
      note: `区块扫描范围无效：${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (fromBlock > toBlock) {
    return notChecked(input, path, `区块扫描范围倒序：${input.fromBlock}..${input.toBlock}`);
  }
  const maxBlocks = input.maxBlocks ?? 256;
  if (!Number.isSafeInteger(maxBlocks) || maxBlocks <= 0) {
    return notChecked(input, path, 'maxBlocks 必须为正安全整数');
  }
  const blockCount = toBlock - fromBlock + 1n;
  if (blockCount > BigInt(maxBlocks)) {
    return notChecked(input, path, `区块扫描范围 ${blockCount.toString()} 超过上限 ${maxBlocks}`);
  }

  try {
    if (!input.rpcUrl.trim()) throw new Error('缺少 RPC URL');
    const known = knownTransactionMap(input.knownTransactions);
    const inspectedBlocks: ScannedBlockRef[] = [];
    const inspectedTransactions: ScannedTransactionRef[] = [];
    const seenBlockHashes = new Set<string>();
    const seenTransactionHashes = new Set<string>();
    const timeoutMs = input.timeoutMs ?? 30_000;

    for (let blockNumber = fromBlock; blockNumber <= toBlock; blockNumber += 1n) {
      const raw = await adminRpcRequest(
        input.rpcUrl,
        'eth_getBlockByNumber',
        [`0x${blockNumber.toString(16)}`, true],
        timeoutMs,
      );
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`区块 ${blockNumber.toString()} 缺失`);
      }
      const block = raw as RpcBlock;
      const actualNumber = parseBlockNumber(block.number, `block(${blockNumber.toString()}).number`);
      if (actualNumber !== blockNumber) {
        throw new Error(`请求区块 ${blockNumber.toString()}，RPC 返回 ${actualNumber.toString()}`);
      }
      const blockHash = parseHash(block.hash, `block(${blockNumber.toString()}).hash`);
      const parentHash = parseHash(
        block.parentHash,
        `block(${blockNumber.toString()}).parentHash`,
      );
      if (seenBlockHashes.has(blockHash.toLowerCase())) {
        throw new Error(`区块 ${blockNumber.toString()} 的 blockHash 与窗口内其他区块重复`);
      }
      seenBlockHashes.add(blockHash.toLowerCase());
      if (!Array.isArray(block.transactions)) {
        throw new Error(`区块 ${blockNumber.toString()} 缺少完整 transactions 数组`);
      }
      const transactions = block.transactions.map((transaction, index) => (
        parseTransaction(transaction, blockNumber, blockHash, index, known)
      ));
      for (const transaction of transactions) {
        const key = transaction.txHash.toLowerCase();
        if (seenTransactionHashes.has(key)) {
          throw new Error(`交易 ${transaction.txHash} 在扫描窗口内重复`);
        }
        seenTransactionHashes.add(key);
      }
      inspectedBlocks.push({
        blockNumber: decimal(blockNumber),
        blockHash,
        parentHash,
        transactionHashes: transactions.map((transaction) => transaction.txHash),
      });
      inspectedTransactions.push(...transactions);
    }

    const blockIndexByHash = new Map(
      inspectedBlocks.map((block, index) => [block.blockHash.toLowerCase(), index] as const),
    );
    for (const [index, current] of inspectedBlocks.entries()) {
      const parentIndex = blockIndexByHash.get(current.parentHash.toLowerCase());
      if (parentIndex !== undefined && parentIndex >= index) {
        throw new Error(`区块 ${current.blockNumber} 的 parentHash 指向窗口内同高或更高区块`);
      }
      if (index === 0) continue;
      const previous = inspectedBlocks[index - 1]!;
      if (current.parentHash.toLowerCase() !== previous.blockHash.toLowerCase()) {
        throw new Error(
          `区块 ${current.blockNumber} 的 parentHash 未连接前一区块 ${previous.blockNumber} 的 blockHash`,
        );
      }
    }

    let previousPosition: readonly [bigint, bigint] | undefined;
    const lastNonceByActor = new Map<string, bigint>();
    for (const transaction of inspectedTransactions) {
      const position = [BigInt(transaction.blockNumber), BigInt(transaction.transactionIndex)] as const;
      if (previousPosition
        && (position[0] < previousPosition[0]
          || (position[0] === previousPosition[0] && position[1] <= previousPosition[1]))) {
        throw new Error(`扫描交易 ${transaction.txHash} 未按 blockNumber/transactionIndex 严格排序`);
      }
      previousPosition = position;
      const actorKey = transaction.actor.toLowerCase();
      const nonce = BigInt(transaction.nonce);
      const previousNonce = lastNonceByActor.get(actorKey);
      if (previousNonce !== undefined && nonce <= previousNonce) {
        throw new Error(`Actor ${transaction.actor} 的 nonce 未严格递增`);
      }
      lastNonceByActor.set(actorKey, nonce);
    }

    const inspectedHashes = new Set(inspectedTransactions.map((transaction) => transaction.txHash.toLowerCase()));
    const declaredInWindow = input.knownTransactions
      .filter((transaction) => {
        const blockNumber = BigInt(transaction.blockNumber);
        return blockNumber >= fromBlock && blockNumber <= toBlock;
      })
      .map((transaction) => transaction.txHash);
    const requiredHashes = [...new Set([
      ...(input.requiredTransactionHashes ?? []),
      ...declaredInWindow,
    ].map((hash) => hash.toLowerCase()))];
    const missingRequired = requiredHashes
      .filter((hash) => !inspectedHashes.has(hash.toLowerCase()));
    if (missingRequired.length > 0) {
      throw new Error(`扫描窗口缺少必需交易：${missingRequired.join(', ')}`);
    }

    const unexpectedTransactions = inspectedTransactions.filter((transaction) => !transaction.role);
    if (inspectedBlocks.length === 0) throw new Error('扫描窗口没有返回任何区块');
    const completedBlocks = inspectedBlocks as [ScannedBlockRef, ...ScannedBlockRef[]];
    const base = {
      fromBlock: input.fromBlock,
      toBlock: input.toBlock,
      inspectedBlocks: completedBlocks,
      inspectedTransactions,
      source: {
        source: 'block-scan' as const,
        path,
        blockNumber: input.toBlock,
      },
    };
    if (unexpectedTransactions.length === 0) {
      return { status: 'CLEAN', ...base, unexpectedTransactions: [] };
    }
    return {
      status: 'POLLUTED',
      ...base,
      unexpectedTransactions: unexpectedTransactions as [ScannedTransactionRef, ...ScannedTransactionRef[]],
    };
  } catch (error) {
    const detail = redactRpcDetails(error instanceof Error ? error.message : String(error), input.rpcUrl);
    return notChecked(input, path, `区块扫描未完成：${detail}`);
  }
}

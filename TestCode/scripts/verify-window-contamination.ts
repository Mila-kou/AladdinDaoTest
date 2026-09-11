import assert from 'node:assert/strict';
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { scanBlockWindow } from '../src/drivers/block-window-scanner.js';
import {
  windowContaminationEvidenceSchema,
  type Address,
  type DecimalString,
  type Hex,
  type TransactionRef,
  type TransactionRole,
  type WindowContaminationEvidence,
} from '../src/evidence/evidence-v3.js';

interface JsonRpcRequest {
  readonly id?: string | number | null;
  readonly method?: unknown;
  readonly params?: unknown;
}

interface RpcStub {
  readonly url: string;
  readonly requests: JsonRpcRequest[];
  readonly useBlocks: (blocks: Readonly<Record<string, unknown>>) => void;
  readonly close: () => Promise<void>;
}

const TRADER = '0x1111111111111111111111111111111111111111' as Address;
const KEEPER = '0x2222222222222222222222222222222222222222' as Address;
const THIRD_PARTY = '0x3333333333333333333333333333333333333333' as Address;
const TARGET = '0x4444444444444444444444444444444444444444' as Address;

function hash(seed: bigint | number): Hex {
  return `0x${BigInt(seed).toString(16).padStart(64, '0')}` as Hex;
}

function quantity(value: bigint | number): string {
  return `0x${BigInt(value).toString(16)}`;
}

function rpcTransaction(input: {
  readonly txHash: Hex;
  readonly blockNumber: bigint;
  readonly actor: Address;
  readonly to?: Address | null;
  readonly transactionIndex?: bigint;
  readonly nonce?: bigint;
  readonly transactionType?: string | null;
  readonly reportedBlockNumber?: bigint;
  readonly reportedBlockHash?: Hex;
}): Record<string, unknown> {
  return {
    hash: input.txHash,
    blockNumber: quantity(input.reportedBlockNumber ?? input.blockNumber),
    blockHash: input.reportedBlockHash ?? hash(input.blockNumber),
    transactionIndex: quantity(input.transactionIndex ?? 0n),
    from: input.actor,
    to: input.to === undefined ? TARGET : input.to,
    nonce: quantity(input.nonce ?? 1n),
    type: input.transactionType === undefined ? '0x2' : input.transactionType,
  };
}

function rpcBlock(
  blockNumber: bigint,
  transactions: readonly unknown[],
  parentHash: Hex = hash(blockNumber - 1n),
): Record<string, unknown> {
  return {
    number: quantity(blockNumber),
    hash: hash(blockNumber),
    parentHash,
    transactions,
  };
}

function knownTransaction(input: {
  readonly txHash: Hex;
  readonly blockNumber: bigint;
  readonly actor: Address;
  readonly role: TransactionRole;
  readonly to?: Address | null;
  readonly nonce?: bigint;
  readonly transactionType?: string;
}): TransactionRef {
  return {
    txHash: input.txHash,
    blockNumber: input.blockNumber.toString() as DecimalString,
    blockHash: hash(input.blockNumber),
    actor: input.actor,
    ...(input.to === null ? {} : { to: input.to ?? TARGET }),
    role: input.role,
    gasUsed: '21000',
    status: 'SUCCESS',
    ...(input.nonce === undefined ? {} : { nonce: input.nonce.toString() as DecimalString }),
    ...(input.transactionType === undefined ? {} : { transactionType: input.transactionType }),
  };
}

function jsonRpcResult(response: ServerResponse, id: JsonRpcRequest['id'], result: unknown): void {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, result }));
}

async function listen(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once('error', onError);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', onError);
      resolve();
    });
  });
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function startRpcStub(): Promise<RpcStub> {
  let blocks: Readonly<Record<string, unknown>> = {};
  const requests: JsonRpcRequest[] = [];
  const server = createServer(async (request, response) => {
    try {
      let source = '';
      for await (const chunk of request) source += chunk.toString();
      const payload = JSON.parse(source) as JsonRpcRequest;
      requests.push(payload);
      if (payload.method !== 'eth_getBlockByNumber') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({
          jsonrpc: '2.0',
          id: payload.id ?? null,
          error: { code: -32601, message: `method not found: ${String(payload.method)}` },
        }));
        return;
      }
      const params = Array.isArray(payload.params) ? payload.params : [];
      const blockTag = typeof params[0] === 'string' ? params[0] : '';
      const result = Object.prototype.hasOwnProperty.call(blocks, blockTag) ? blocks[blockTag] : null;
      jsonRpcResult(response, payload.id, result);
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  });

  await listen(server);
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    useBlocks(nextBlocks) {
      blocks = nextBlocks;
      requests.length = 0;
    },
    close: () => close(server),
  };
}

function assertFullTransactionRequests(rpc: RpcStub, expectedTags: readonly string[]): void {
  assert.deepEqual(
    rpc.requests.map((request) => ({ method: request.method, params: request.params })),
    expectedTags.map((blockTag) => ({ method: 'eth_getBlockByNumber', params: [blockTag, true] })),
  );
}

function assertNotCheckedWithoutPartialArrays(value: WindowContaminationEvidence): void {
  assert.equal(value.status, 'NOT_CHECKED');
  const record = value as unknown as Record<string, unknown>;
  assert.equal(Object.prototype.hasOwnProperty.call(record, 'inspectedBlocks'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(record, 'inspectedTransactions'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(record, 'unexpectedTransactions'), false);
  windowContaminationEvidenceSchema.parse(value);
}

async function verifyCleanWindow(rpc: RpcStub): Promise<void> {
  const traderTx = knownTransaction({
    txHash: hash(1_001),
    blockNumber: 100n,
    actor: TRADER,
    role: 'trader',
  });
  const keeperTx = knownTransaction({
    txHash: hash(1_002),
    blockNumber: 102n,
    actor: KEEPER,
    role: 'keeper',
  });
  rpc.useBlocks({
    '0x64': rpcBlock(100n, [rpcTransaction({
      txHash: traderTx.txHash,
      blockNumber: 100n,
      actor: TRADER,
      transactionIndex: 0n,
      nonce: 0n,
    })]),
    '0x65': rpcBlock(101n, []),
    '0x66': rpcBlock(102n, [rpcTransaction({
      txHash: keeperTx.txHash,
      blockNumber: 102n,
      actor: KEEPER,
      transactionIndex: 0n,
      nonce: 9n,
    })]),
  });

  const result = await scanBlockWindow({
    rpcUrl: rpc.url,
    fromBlock: '100',
    toBlock: '102',
    knownTransactions: [traderTx, keeperTx],
    requiredTransactionHashes: [traderTx.txHash, keeperTx.txHash],
  });
  if (result.status !== 'CLEAN') assert.fail(`期望 CLEAN，实际为 ${result.status}: ${result.note ?? ''}`);

  assert.deepEqual(result.inspectedBlocks.map((block) => ({
    blockNumber: block.blockNumber,
    blockHash: block.blockHash,
    parentHash: block.parentHash,
    transactionHashes: block.transactionHashes,
  })), [
    {
      blockNumber: '100',
      blockHash: hash(100n),
      parentHash: hash(99n),
      transactionHashes: [traderTx.txHash],
    },
    {
      blockNumber: '101',
      blockHash: hash(101n),
      parentHash: hash(100n),
      transactionHashes: [],
    },
    {
      blockNumber: '102',
      blockHash: hash(102n),
      parentHash: hash(101n),
      transactionHashes: [keeperTx.txHash],
    },
  ]);
  assert.deepEqual(
    result.inspectedTransactions.map((transaction) => [transaction.txHash, transaction.role]),
    [[traderTx.txHash, 'trader'], [keeperTx.txHash, 'keeper']],
  );
  assert.deepEqual(
    result.inspectedTransactions.map((transaction) => [transaction.blockNumber, transaction.transactionIndex]),
    [['100', '0'], ['102', '0']],
  );
  assert.deepEqual(result.unexpectedTransactions, []);

  const zeroQuantityTransaction = result.inspectedTransactions[0];
  assert.ok(zeroQuantityTransaction);
  assert.equal(zeroQuantityTransaction.transactionIndex, '0');
  assert.equal(zeroQuantityTransaction.nonce, '0');
  assert.equal(Object.prototype.hasOwnProperty.call(zeroQuantityTransaction, 'transactionIndex'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(zeroQuantityTransaction, 'nonce'), true);

  windowContaminationEvidenceSchema.parse(result);
  assertFullTransactionRequests(rpc, ['0x64', '0x65', '0x66']);
}

async function verifyPollutedWindow(rpc: RpcStub): Promise<void> {
  const known = knownTransaction({
    txHash: hash(2_001),
    blockNumber: 200n,
    actor: TRADER,
    role: 'admin',
  });
  const externalHash = hash(2_002);
  rpc.useBlocks({
    '0xc8': rpcBlock(200n, [
      rpcTransaction({ txHash: known.txHash, blockNumber: 200n, actor: TRADER, transactionIndex: 0n }),
      rpcTransaction({ txHash: externalHash, blockNumber: 200n, actor: THIRD_PARTY, transactionIndex: 1n }),
    ]),
  });

  const result = await scanBlockWindow({
    rpcUrl: rpc.url,
    fromBlock: '200',
    toBlock: '200',
    knownTransactions: [known],
    requiredTransactionHashes: [known.txHash],
  });
  if (result.status !== 'POLLUTED') assert.fail(`期望 POLLUTED，实际为 ${result.status}: ${result.note ?? ''}`);

  assert.equal(result.inspectedTransactions[0]?.role, 'admin');
  assert.equal(result.unexpectedTransactions.length, 1);
  const unexpected = result.unexpectedTransactions[0];
  assert.equal(unexpected.txHash, externalHash);
  assert.equal(unexpected.actor, THIRD_PARTY);
  assert.equal(unexpected.role, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(unexpected, 'role'), false);
  const scannedExternal = result.inspectedTransactions.find((transaction) => transaction.txHash === externalHash);
  assert.ok(scannedExternal);
  assert.equal(Object.prototype.hasOwnProperty.call(scannedExternal, 'role'), false);

  windowContaminationEvidenceSchema.parse(result);
  assertFullTransactionRequests(rpc, ['0xc8']);
}

async function verifyIncompleteRpcResponses(rpc: RpcStub): Promise<void> {
  const validFirstBlock = rpcBlock(300n, []);
  const cases: ReadonlyArray<{
    readonly name: string;
    readonly blocks: Readonly<Record<string, unknown>>;
  }> = [
    {
      name: 'missing block',
      blocks: { '0x12c': validFirstBlock },
    },
    {
      name: 'hash-only transaction',
      blocks: {
        '0x12c': validFirstBlock,
        '0x12d': rpcBlock(301n, [hash(3_001)]),
      },
    },
    {
      name: 'contradictory transaction blockNumber',
      blocks: {
        '0x12c': validFirstBlock,
        '0x12d': rpcBlock(301n, [rpcTransaction({
          txHash: hash(3_002),
          blockNumber: 301n,
          reportedBlockNumber: 302n,
          actor: THIRD_PARTY,
        })]),
      },
    },
    {
      name: 'contradictory transactionIndex',
      blocks: {
        '0x12c': validFirstBlock,
        '0x12d': rpcBlock(301n, [rpcTransaction({
          txHash: hash(3_003),
          blockNumber: 301n,
          transactionIndex: 1n,
          actor: THIRD_PARTY,
        })]),
      },
    },
    {
      name: 'missing transactionIndex',
      blocks: {
        '0x12c': validFirstBlock,
        '0x12d': rpcBlock(301n, [{
          ...rpcTransaction({
            txHash: hash(3_005),
            blockNumber: 301n,
            actor: THIRD_PARTY,
          }),
          transactionIndex: undefined,
        }]),
      },
    },
    {
      name: 'missing nonce',
      blocks: {
        '0x12c': validFirstBlock,
        '0x12d': rpcBlock(301n, [{
          ...rpcTransaction({
            txHash: hash(3_006),
            blockNumber: 301n,
            actor: THIRD_PARTY,
          }),
          nonce: undefined,
        }]),
      },
    },
    {
      name: 'duplicate transaction hash across blocks',
      blocks: {
        '0x12c': rpcBlock(300n, [rpcTransaction({
          txHash: hash(3_004), blockNumber: 300n, actor: THIRD_PARTY,
        })]),
        '0x12d': rpcBlock(301n, [rpcTransaction({
          txHash: hash(3_004), blockNumber: 301n, actor: THIRD_PARTY,
        })]),
      },
    },
    {
      name: 'discontinuous parentHash',
      blocks: {
        '0x12c': validFirstBlock,
        '0x12d': rpcBlock(301n, [], hash(9_999)),
      },
    },
    {
      name: 'self-referencing parentHash',
      blocks: {
        '0x12c': rpcBlock(300n, [], hash(300n)),
        '0x12d': rpcBlock(301n, []),
      },
    },
    {
      name: 'parentHash cycle to later block',
      blocks: {
        '0x12c': rpcBlock(300n, [], hash(301n)),
        '0x12d': rpcBlock(301n, []),
      },
    },
    {
      name: 'duplicate actor nonce',
      blocks: {
        '0x12c': rpcBlock(300n, [rpcTransaction({
          txHash: hash(3_007), blockNumber: 300n, actor: THIRD_PARTY, nonce: 5n,
        })]),
        '0x12d': rpcBlock(301n, [rpcTransaction({
          txHash: hash(3_008), blockNumber: 301n, actor: THIRD_PARTY, nonce: 5n,
        })]),
      },
    },
    {
      name: 'decreasing actor nonce',
      blocks: {
        '0x12c': rpcBlock(300n, [rpcTransaction({
          txHash: hash(3_009), blockNumber: 300n, actor: THIRD_PARTY, nonce: 6n,
        })]),
        '0x12d': rpcBlock(301n, [rpcTransaction({
          txHash: hash(3_010), blockNumber: 301n, actor: THIRD_PARTY, nonce: 5n,
        })]),
      },
    },
  ];

  for (const testCase of cases) {
    rpc.useBlocks(testCase.blocks);
    const result = await scanBlockWindow({
      rpcUrl: rpc.url,
      fromBlock: '300',
      toBlock: '301',
      knownTransactions: [],
    });
    assertNotCheckedWithoutPartialArrays(result);
    assert.match(result.note ?? '', /区块扫描未完成/u, testCase.name);
    assertFullTransactionRequests(rpc, ['0x12c', '0x12d']);
  }
}

async function verifyKnownTransactionIdentity(rpc: RpcStub): Promise<void> {
  const blockNumber = 350n;
  const cases: ReadonlyArray<{
    readonly name: string;
    readonly known: TransactionRef;
    readonly rpcTransaction: Record<string, unknown>;
  }> = [
    {
      name: 'known to differs from RPC to',
      known: knownTransaction({
        txHash: hash(3_501), blockNumber, actor: TRADER, role: 'trader',
      }),
      rpcTransaction: rpcTransaction({
        txHash: hash(3_501), blockNumber, actor: TRADER, to: KEEPER,
      }),
    },
    {
      name: 'known omits to but RPC has to',
      known: knownTransaction({
        txHash: hash(3_502), blockNumber, actor: TRADER, role: 'trader', to: null,
      }),
      rpcTransaction: rpcTransaction({
        txHash: hash(3_502), blockNumber, actor: TRADER,
      }),
    },
    {
      name: 'known has to but RPC omits to',
      known: knownTransaction({
        txHash: hash(3_503), blockNumber, actor: TRADER, role: 'trader',
      }),
      rpcTransaction: rpcTransaction({
        txHash: hash(3_503), blockNumber, actor: TRADER, to: null,
      }),
    },
    {
      name: 'known nonce differs from RPC nonce',
      known: knownTransaction({
        txHash: hash(3_504), blockNumber, actor: TRADER, role: 'trader', nonce: 7n,
      }),
      rpcTransaction: rpcTransaction({
        txHash: hash(3_504), blockNumber, actor: TRADER, nonce: 8n,
      }),
    },
    {
      name: 'known transactionType missing from RPC',
      known: knownTransaction({
        txHash: hash(3_505), blockNumber, actor: TRADER, role: 'trader', transactionType: '0x2',
      }),
      rpcTransaction: rpcTransaction({
        txHash: hash(3_505), blockNumber, actor: TRADER, transactionType: null,
      }),
    },
    {
      name: 'known transactionType differs from RPC',
      known: knownTransaction({
        txHash: hash(3_506), blockNumber, actor: TRADER, role: 'trader', transactionType: '0x2',
      }),
      rpcTransaction: rpcTransaction({
        txHash: hash(3_506), blockNumber, actor: TRADER, transactionType: '0x1',
      }),
    },
  ];

  for (const testCase of cases) {
    rpc.useBlocks({
      '0x15e': rpcBlock(blockNumber, [testCase.rpcTransaction]),
    });
    const result = await scanBlockWindow({
      rpcUrl: rpc.url,
      fromBlock: '350',
      toBlock: '350',
      knownTransactions: [testCase.known],
      requiredTransactionHashes: [testCase.known.txHash],
    });
    assertNotCheckedWithoutPartialArrays(result);
    assert.match(result.note ?? '', /区块扫描未完成/u, testCase.name);
    assertFullTransactionRequests(rpc, ['0x15e']);
  }
}

async function verifyRangeLimitSkipsRpc(rpc: RpcStub): Promise<void> {
  rpc.useBlocks({});
  const result = await scanBlockWindow({
    rpcUrl: rpc.url,
    fromBlock: '400',
    toBlock: '402',
    knownTransactions: [],
    maxBlocks: 2,
  });
  assertNotCheckedWithoutPartialArrays(result);
  assert.match(result.note ?? '', /超过上限/u);
  assert.equal(rpc.requests.length, 0);

  rpc.useBlocks({});
  const invalidRuntimeRange = await scanBlockWindow({
    rpcUrl: rpc.url,
    fromBlock: '0x190' as DecimalString,
    toBlock: '401',
    knownTransactions: [],
  });
  assertNotCheckedWithoutPartialArrays(invalidRuntimeRange);
  const invalidRecord = invalidRuntimeRange as unknown as Record<string, unknown>;
  assert.equal(Object.prototype.hasOwnProperty.call(invalidRecord, 'fromBlock'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(invalidRecord, 'source'), false);
  assert.equal(rpc.requests.length, 0);
}

async function main(): Promise<void> {
  const rpc = await startRpcStub();
  try {
    await verifyCleanWindow(rpc);
    await verifyPollutedWindow(rpc);
    await verifyIncompleteRpcResponses(rpc);
    await verifyKnownTransactionIdentity(rpc);
    await verifyRangeLimitSkipsRpc(rpc);
  } finally {
    await rpc.close();
  }
  console.log('window contamination V3 scanner verification passed');
}

await main();

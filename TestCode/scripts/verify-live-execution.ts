import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { environments } from '../config/environments/catalog.js';
import { createAdvanceTimeExecutor } from '../src/actions/advance-time.js';
import type { RuntimeConfig } from '../src/config/runtime.js';
import {
  InvalidTestEnvironmentError,
  type TestEnvironmentDefinition,
} from '../src/domain/test-environment.js';
import {
  evidenceEnvelopeSchema,
  type ActionEvidence,
  type Address,
  type Hex,
  type TransactionRef,
} from '../src/evidence/evidence-v3.js';
import { runLiveScenario } from '../src/execution/live-scenario.js';
import {
  buildRuntimeEnvironmentIdentity,
  resolveRuntimeTestEnvironment,
  type RuntimeExecutionSelection,
} from '../src/execution/runtime-environment.js';
import { marketRoundtripScenario } from '../src/flows/market-roundtrip.js';
import { adaptMarketFlowV1 } from '../src/reconciliation/adapters/market-flow-v1.js';
import type { ActionExecutor, ActionExecutorRegistry } from '../src/scenario-engine/action-executor.js';
import type {
  AdvanceTimeAction,
  ExecuteOrderAction,
  SubmitMarketIncreaseAction,
} from '../src/scenario-engine/actions.js';
import { ref } from '../src/scenario-engine/references.js';
import { scenario } from '../src/scenario-engine/scenario-builder.js';

interface RpcStub {
  readonly url: string;
  readonly methods: string[];
  readonly close: () => Promise<void>;
}

interface JsonRpcRequest {
  readonly id?: string | number | null;
  readonly method?: unknown;
  readonly params?: unknown;
}

interface RpcFullTransaction {
  readonly hash: Hex;
  readonly blockNumber: `0x${string}`;
  readonly blockHash: Hex;
  readonly transactionIndex: `0x${string}`;
  readonly from: Address;
  readonly to: Address;
  readonly nonce: `0x${string}`;
  readonly type: `0x${string}`;
}

function blockHash(blockNumber: bigint): `0x${string}` {
  return `0x${blockNumber.toString(16).padStart(64, '0')}`;
}

function jsonRpcResult(response: import('node:http').ServerResponse, id: JsonRpcRequest['id'], result: unknown): void {
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

async function startRpcStub(
  fullTransactionBlocks: ReadonlyMap<bigint, readonly RpcFullTransaction[]> = new Map(),
): Promise<RpcStub> {
  let currentBlock = 100n;
  let currentTimestamp = 1_700_000_000n;
  let pendingIncrease = 0n;
  let snapshotSequence = 0n;
  const snapshots = new Map<string, {
    readonly block: bigint;
    readonly timestamp: bigint;
    readonly pendingIncrease: bigint;
  }>();
  const methods: string[] = [];

  const server = createServer(async (request, response) => {
    try {
      let source = '';
      for await (const chunk of request) source += chunk.toString();
      const payload = JSON.parse(source) as JsonRpcRequest;
      if (typeof payload.method !== 'string') throw new Error('JSON-RPC method 缺失');
      const method = payload.method;
      methods.push(method);

      if (method === 'eth_getBlockByNumber') {
        const params = Array.isArray(payload.params) ? payload.params : [];
        const blockTag = params[0];
        if (typeof blockTag === 'string' && blockTag !== 'latest') {
          const requestedBlock = BigInt(blockTag);
          assert.equal(params[1], true, '指定区块扫描必须请求 fullTransactions=true');
          const transactions = fullTransactionBlocks.get(requestedBlock);
          jsonRpcResult(response, payload.id, transactions === undefined ? null : {
            number: `0x${requestedBlock.toString(16)}`,
            hash: blockHash(requestedBlock),
            parentHash: blockHash(requestedBlock - 1n),
            timestamp: `0x${(1_700_000_000n + requestedBlock).toString(16)}`,
            transactions,
          });
          return;
        }
        jsonRpcResult(response, payload.id, {
          number: `0x${currentBlock.toString(16)}`,
          hash: blockHash(currentBlock),
          parentHash: blockHash(currentBlock - 1n),
          timestamp: `0x${currentTimestamp.toString(16)}`,
        });
        return;
      }
      if (method === 'evm_increaseTime') {
        const params = Array.isArray(payload.params) ? payload.params : [];
        assert.equal(typeof params[0], 'number');
        pendingIncrease += BigInt(params[0] as number);
        jsonRpcResult(response, payload.id, Number(pendingIncrease));
        return;
      }
      if (method === 'evm_mine') {
        currentBlock += 1n;
        currentTimestamp += pendingIncrease;
        pendingIncrease = 0n;
        jsonRpcResult(response, payload.id, '0x0');
        return;
      }
      if (method === 'evm_snapshot') {
        snapshotSequence += 1n;
        const snapshotId = `0x${snapshotSequence.toString(16)}`;
        snapshots.set(snapshotId, {
          block: currentBlock,
          timestamp: currentTimestamp,
          pendingIncrease,
        });
        jsonRpcResult(response, payload.id, snapshotId);
        return;
      }
      if (method === 'evm_revert') {
        const params = Array.isArray(payload.params) ? payload.params : [];
        const snapshotId = params[0];
        const snapshot = typeof snapshotId === 'string' ? snapshots.get(snapshotId) : undefined;
        if (snapshot) {
          currentBlock = snapshot.block;
          currentTimestamp = snapshot.timestamp;
          pendingIncrease = snapshot.pendingIncrease;
          snapshots.delete(snapshotId as string);
        }
        jsonRpcResult(response, payload.id, snapshot !== undefined);
        return;
      }

      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({
        jsonrpc: '2.0',
        id: payload.id ?? null,
        error: { code: -32601, message: `method not found: ${method}` },
      }));
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  });

  await listen(server);
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    methods,
    close: () => close(server),
  };
}

function runtimeFixture(adminRpcUrl: string): RuntimeConfig {
  return {
    environment: 'time-fork',
    definition: environments['time-fork'],
    appBaseUrl: 'http://127.0.0.1:3010',
    chainId: 99913,
    rpcUrl: adminRpcUrl,
    adminRpcUrl,
    deploymentManifestPath: '/fixture/deployment.json',
    environmentBindingsPath: '/fixture/environment-bindings.json',
    deploymentId: 'execution-v3-fixture',
    deploymentRelease: 'v0.3.2',
    deploymentManifestName: 'execution-v3-fixture',
    requestTimeoutMs: 2_000,
    forkDisplayName: 'execution-v3-local-stub',
    hasPrimaryTestWallet: false,
    hasSecondaryTestWallet: false,
    hasTenderlyAccessToken: false,
    signingMode: 'private-key',
    keeperMode: 'service',
    testAccount: '0x1111111111111111111111111111111111111111',
    keeperAccount: '0x2222222222222222222222222222222222222222',
    forkResetMode: 'snapshot',
  };
}

const timeSelection: RuntimeExecutionSelection = {
  marketMode: 'mock-market',
  oracleMode: 'mock-oracle',
  timeMode: 'controllable-time',
  signingMode: 'browser-wallet-keeper',
  mockResourceAlias: 'default-mock',
};

const timeEnvironment: TestEnvironmentDefinition = {
  targetProject: 'time-fork',
  ...timeSelection,
  marketCompatibility: 'mock-only',
  environmentSetup: '本地 ephemeral admin RPC；推进时间后回滚进程内状态。',
};

const txEnvironment: TestEnvironmentDefinition = {
  targetProject: 'tx-fork',
  marketMode: 'mock-market',
  oracleMode: 'mock-oracle',
  marketCompatibility: 'mock-only',
  timeMode: 'normal-block-time',
  signingMode: 'trader-keeper-private-key',
  mockResourceAlias: 'default-mock',
  environmentSetup: '独享 tx-fork + default-mock；执行后回滚快照。',
};

const trader = '0x1111111111111111111111111111111111111111' as Address;
const keeper = '0x2222222222222222222222222222222222222222' as Address;
const exchange = '0x3333333333333333333333333333333333333333' as Address;
const thirdParty = '0x4444444444444444444444444444444444444444' as Address;
const orderKey = `0x${'a'.repeat(64)}` as Hex;
const positionKey = `0x${'b'.repeat(64)}` as Hex;

type RawActionEvidence = Omit<ActionEvidence,
  'schemaVersion' | 'actionId' | 'sequence' | 'type' | 'purpose' | 'capabilities'
>;

interface ExecutionWindowFixture {
  readonly submitTransaction: TransactionRef;
  readonly executeTransaction: TransactionRef;
}

function fixtureHash(digit: string): Hex {
  return `0x${digit.repeat(64)}` as Hex;
}

function registeredTransaction(input: {
  readonly txHash: Hex;
  readonly blockNumber: bigint;
  readonly actor: Address;
  readonly role: TransactionRef['role'];
  readonly nonce: bigint;
}): TransactionRef {
  const number = input.blockNumber.toString() as `${bigint}`;
  const hash = blockHash(input.blockNumber);
  return {
    txHash: input.txHash,
    blockNumber: number,
    blockHash: hash,
    actor: input.actor,
    to: exchange,
    role: input.role,
    orderKey,
    gasUsed: '21000',
    status: 'SUCCESS',
    nonce: input.nonce.toString() as `${bigint}`,
    transactionType: '0x2',
    signatureVerified: true,
    receipt: {
      transactionHash: input.txHash,
      blockNumber: number,
      blockHash: hash,
      status: 'SUCCESS',
      gasUsed: '21000',
    },
  };
}

function rpcTransaction(input: {
  readonly txHash: Hex;
  readonly blockNumber: bigint;
  readonly actor: Address;
  readonly transactionIndex?: bigint;
  readonly nonce?: bigint;
}): RpcFullTransaction {
  return {
    hash: input.txHash,
    blockNumber: `0x${input.blockNumber.toString(16)}`,
    blockHash: blockHash(input.blockNumber),
    transactionIndex: `0x${(input.transactionIndex ?? 0n).toString(16)}`,
    from: input.actor,
    to: exchange,
    nonce: `0x${(input.nonce ?? 0n).toString(16)}`,
    type: '0x2',
  };
}

function executionWindowExecutors(fixture: ExecutionWindowFixture): ActionExecutorRegistry {
  const submitMarketIncrease: ActionExecutor<SubmitMarketIncreaseAction> = {
    execute: async ({ action }): Promise<RawActionEvidence> => ({
      outcome: 'SUBMITTED',
      input: action.input,
      transactions: [fixture.submitTransaction],
      orderRefs: { order: orderKey },
      snapshots: [],
      events: [],
      parameters: [],
      oracle: [],
      startedAt: '2026-09-04T00:00:00.000Z',
      endedAt: '2026-09-04T00:00:01.000Z',
    }),
  };
  const executeOrder: ActionExecutor<ExecuteOrderAction> = {
    execute: async ({ action }): Promise<RawActionEvidence> => {
      const executionBlock = BigInt(fixture.executeTransaction.blockNumber);
      const beforeBlock = executionBlock - 1n;
      return {
        outcome: 'EXECUTED',
        input: action.input,
        transactions: [fixture.executeTransaction],
        orderRefs: { order: orderKey },
        positionRefs: { position: positionKey },
        snapshots: [
          {
            id: `${action.id}:before`,
            kind: 'execution-before',
            blockNumber: beforeBlock.toString() as `${bigint}`,
            blockHash: blockHash(beforeBlock),
            source: 'reader',
            values: {},
          },
          {
            id: `${action.id}:after`,
            kind: 'execution-after',
            blockNumber: fixture.executeTransaction.blockNumber,
            blockHash: blockHash(executionBlock),
            source: 'reader',
            values: {},
          },
        ],
        events: [],
        parameters: [],
        oracle: [],
        startedAt: '2026-09-04T00:00:02.000Z',
        endedAt: '2026-09-04T00:00:03.000Z',
      };
    },
  };
  return { submitMarketIncrease, executeOrder };
}

function executionWindowScenario(variantId: string) {
  return scenario('XT-MKT-OPEN-001', {
    variantId,
    environment: timeEnvironment,
    actors: ['trader'],
  }).openMarket({
    actor: 'trader',
    side: 'long',
    collateralRaw: '10000000',
    sizeDeltaUsdRaw: '50000000000000000000000000000000',
    saveAs: ref.order('open'),
    savePositionAs: ref.position('main'),
  }).build();
}

const cleanFixture: ExecutionWindowFixture = {
  submitTransaction: registeredTransaction({
    txHash: fixtureHash('1'), blockNumber: 200n, actor: trader, role: 'trader', nonce: 1n,
  }),
  executeTransaction: registeredTransaction({
    txHash: fixtureHash('2'), blockNumber: 203n, actor: keeper, role: 'keeper', nonce: 2n,
  }),
};
const pollutedFixture: ExecutionWindowFixture = {
  submitTransaction: registeredTransaction({
    txHash: fixtureHash('3'), blockNumber: 300n, actor: trader, role: 'trader', nonce: 3n,
  }),
  executeTransaction: registeredTransaction({
    txHash: fixtureHash('4'), blockNumber: 303n, actor: keeper, role: 'keeper', nonce: 4n,
  }),
};
const thirdPartyTransaction = rpcTransaction({
  txHash: fixtureHash('5'), blockNumber: 301n, actor: thirdParty, nonce: 5n,
});
const fullTransactionBlocks = new Map<bigint, readonly RpcFullTransaction[]>([
  [200n, [rpcTransaction({
    txHash: cleanFixture.submitTransaction.txHash, blockNumber: 200n, actor: trader, nonce: 1n,
  })]],
  [201n, []],
  [202n, []],
  [203n, [rpcTransaction({
    txHash: cleanFixture.executeTransaction.txHash, blockNumber: 203n, actor: keeper, nonce: 2n,
  })]],
  [300n, [rpcTransaction({
    txHash: pollutedFixture.submitTransaction.txHash, blockNumber: 300n, actor: trader, nonce: 3n,
  })]],
  [301n, [thirdPartyTransaction]],
  [302n, []],
  [303n, [rpcTransaction({
    txHash: pollutedFixture.executeTransaction.txHash, blockNumber: 303n, actor: keeper, nonce: 4n,
  })]],
]);
const rpc = await startRpcStub(fullTransactionBlocks);

try {
  const runtime = runtimeFixture(rpc.url);

  // Runtime is the sole source of the resolved target project and must prove
  // that every selected capability is actually available before execution.
  const resolvedEnvironment = resolveRuntimeTestEnvironment(runtime, timeSelection);
  assert.deepEqual(resolvedEnvironment, {
    targetProject: 'time-fork',
    ...timeSelection,
  });
  const trustedEnvironment = buildRuntimeEnvironmentIdentity(runtime, resolvedEnvironment, {
    marketIndex: 7,
  });
  const legacyFixture = JSON.parse(gunzipSync(Buffer.from(
    (await readFile(resolve(
      process.cwd(),
      'fixtures/reconciliation/xt-mkt-open-001-legacy.json.gz.b64',
    ), 'utf8')).trim(),
    'base64',
  )).toString('utf8')) as unknown;
  const trustedLegacyEvidence = adaptMarketFlowV1(legacyFixture, {
    executionId: 'execution-v3-trusted-environment-bridge',
    environment: trustedEnvironment,
  });
  assert.deepEqual(
    trustedLegacyEvidence.environment,
    trustedEnvironment,
    'legacy Adapter 必须完整采用调用方传入的 Runtime/Resolved Environment 身份',
  );
  assert.equal(trustedLegacyEvidence.environment.deploymentId, runtime.deploymentId);
  assert.equal(trustedLegacyEvidence.environment.release, runtime.deploymentRelease);
  const incapableRuntime: RuntimeConfig = {
    ...runtime,
    definition: { ...runtime.definition, permitsTimeTravel: false },
  };
  assert.throws(
    () => resolveRuntimeTestEnvironment(incapableRuntime, timeSelection),
    InvalidTestEnvironmentError,
  );
  assert.equal(rpc.methods.length, 0, '环境解析与能力拒绝不得访问 RPC');

  // Missing executors are checked as a complete set before the first action.
  // The first executor is real and RPC-backed, so both counters prove that
  // preflight rejection happened before any side effect.
  const advanceExecutor = createAdvanceTimeExecutor({
    adminRpcUrl: rpc.url,
    timeoutMs: runtime.requestTimeoutMs,
  });
  let executorCalls = 0;
  const countingExecutor: ActionExecutor<AdvanceTimeAction> = {
    execute: async (input) => {
      executorCalls += 1;
      return advanceExecutor.execute(input);
    },
  };
  const missingExecutorDefinition = scenario('CT-FUND-001', {
    variantId: 'execution-v3-missing-executor',
    environment: timeEnvironment,
    actors: ['trader'],
  })
    .advanceTime({ seconds: 60, purpose: 'support' })
    .movePrice({ index: { min: '100', max: '100' }, purpose: 'support' })
    .build();
  await assert.rejects(
    () => runLiveScenario({
      runtime,
      definition: missingExecutorDefinition,
      resolvedEnvironment,
      actors: { trader },
      executors: { advanceTime: countingExecutor },
    }),
    /缺少 Action Executor：movePrice/u,
  );
  assert.equal(executorCalls, 0, '缺任一 Executor 时不得调用排在前面的 Executor');
  assert.equal(rpc.methods.length, 0, '缺任一 Executor 时不得访问 RPC');

  const liveDefinition = scenario('CT-FUND-001', {
    variantId: 'execution-v3-advance-time',
    environment: timeEnvironment,
    actors: ['trader'],
  })
    .advanceTime({ seconds: 3_600, purpose: 'support' })
    .build();
  let clock = 0;
  const now = (): Date => new Date(1_800_000_000_000 + clock++ * 1_000);
  const evidence = await runLiveScenario({
    runtime,
    definition: liveDefinition,
    resolvedEnvironment,
    actors: { trader },
    executors: {
      advanceTime: createAdvanceTimeExecutor({
        adminRpcUrl: rpc.url,
        timeoutMs: runtime.requestTimeoutMs,
        now,
      }),
    },
    executionId: 'execution-v3-local-rpc',
    now,
  });

  evidenceEnvelopeSchema.parse(evidence);
  assert.equal(evidence.schemaVersion, 3);
  assert.equal(evidence.actions[0]?.schemaVersion, 3);
  assert.deepEqual(rpc.methods, [
    'evm_snapshot',
    'eth_getBlockByNumber',
    'evm_increaseTime',
    'evm_mine',
    'eth_getBlockByNumber',
    'evm_revert',
  ]);
  assert.equal(evidence.actions.length, 1);
  const action = evidence.actions[0]!;
  assert.equal(action.outcome, 'OBSERVED');
  assert.equal(action.transactions.length, 0);
  assert.equal(action.oracle.length, 0);
  assert.equal(action.snapshots[0]?.kind, 'observation');
  assert.equal(action.snapshots[0]?.blockNumber, '100');
  assert.equal(action.snapshots[0]?.blockHash, blockHash(100n));
  assert.deepEqual(action.snapshots[0]?.values, { phase: 'before', timestamp: '1700000000' });
  assert.equal(action.snapshots[1]?.kind, 'observation');
  assert.equal(action.snapshots[1]?.blockNumber, '101');
  assert.equal(action.snapshots[1]?.blockHash, blockHash(101n));
  assert.deepEqual(action.snapshots[1]?.values, { phase: 'after', timestamp: '1700003600' });

  const parameters = Object.fromEntries(action.parameters.map((parameter) => [parameter.name, parameter]));
  assert.equal(parameters['advanceTime.seconds']?.value, '3600');
  assert.equal(parameters['advanceTime.oldTimestamp']?.value, '1700000000');
  assert.equal(parameters['advanceTime.newTimestamp']?.value, '1700003600');
  for (const parameter of action.parameters) {
    assert.equal(parameter.blockNumber, '101');
    assert.ok(parameter.source.trim().length > 0);
  }

  // runLiveScenario must replace the Harness NOT_CHECKED fallback with a
  // credentialed, inclusive block scan from submit through execution.
  const cleanWindowStart = rpc.methods.length;
  const cleanWindowEvidence = await runLiveScenario({
    runtime,
    definition: executionWindowScenario('execution-v3-window-clean'),
    resolvedEnvironment,
    actors: { trader },
    executors: executionWindowExecutors(cleanFixture),
    executionId: 'execution-v3-window-clean',
  });
  evidenceEnvelopeSchema.parse(cleanWindowEvidence);
  const cleanWindow = cleanWindowEvidence.actions[1]?.windowContamination;
  if (cleanWindow?.status !== 'CLEAN') {
    assert.fail(`期望 CLEAN 执行窗口，实际 ${cleanWindow?.status ?? 'missing'}`);
  }
  assert.equal(cleanWindow.fromBlock, '200');
  assert.equal(cleanWindow.toBlock, '203');
  assert.equal(cleanWindow.source.source, 'block-scan');
  assert.equal(cleanWindow.source.blockNumber, cleanWindow.toBlock);
  assert.deepEqual(
    cleanWindow.inspectedBlocks.map((block) => block.blockNumber),
    ['200', '201', '202', '203'],
  );
  assert.deepEqual(
    cleanWindow.inspectedBlocks.map((block) => block.parentHash),
    [blockHash(199n), blockHash(200n), blockHash(201n), blockHash(202n)],
    '逐块凭证必须锚定相邻父区块 hash',
  );
  assert.deepEqual(
    cleanWindow.inspectedBlocks.map((block) => block.transactionHashes),
    [[cleanFixture.submitTransaction.txHash], [], [], [cleanFixture.executeTransaction.txHash]],
    '逐块凭证必须保留空中间块',
  );
  assert.deepEqual(
    cleanWindow.inspectedTransactions.map((transaction) => ({
      txHash: transaction.txHash,
      role: transaction.role,
    })),
    [
      { txHash: cleanFixture.submitTransaction.txHash, role: 'trader' },
      { txHash: cleanFixture.executeTransaction.txHash, role: 'keeper' },
    ],
  );
  assert.deepEqual(cleanWindow.unexpectedTransactions, []);
  assert.deepEqual(rpc.methods.slice(cleanWindowStart), [
    'evm_snapshot',
    'eth_getBlockByNumber',
    'eth_getBlockByNumber',
    'eth_getBlockByNumber',
    'eth_getBlockByNumber',
    'evm_revert',
  ], '污染扫描必须在 snapshot revert 之前完成');

  // An unregistered transaction is contamination, not a guessed business
  // action. The scanner must preserve it without assigning a role.
  const pollutedWindowEvidence = await runLiveScenario({
    runtime,
    definition: executionWindowScenario('execution-v3-window-polluted'),
    resolvedEnvironment,
    actors: { trader },
    executors: executionWindowExecutors(pollutedFixture),
    executionId: 'execution-v3-window-polluted',
  });
  evidenceEnvelopeSchema.parse(pollutedWindowEvidence);
  const pollutedWindow = pollutedWindowEvidence.actions[1]?.windowContamination;
  if (pollutedWindow?.status !== 'POLLUTED') {
    assert.fail(`期望 POLLUTED 执行窗口，实际 ${pollutedWindow?.status ?? 'missing'}`);
  }
  assert.equal(pollutedWindow.fromBlock, '300');
  assert.equal(pollutedWindow.toBlock, '303');
  assert.equal(pollutedWindow.source.blockNumber, pollutedWindow.toBlock);
  assert.deepEqual(
    pollutedWindow.inspectedBlocks.map((block) => block.blockNumber),
    ['300', '301', '302', '303'],
  );
  assert.deepEqual(
    pollutedWindow.inspectedTransactions.map((transaction) => transaction.role),
    ['trader', undefined, 'keeper'],
  );
  assert.equal(pollutedWindow.unexpectedTransactions.length, 1);
  assert.equal(pollutedWindow.unexpectedTransactions[0]?.txHash, thirdPartyTransaction.hash);
  assert.equal(pollutedWindow.unexpectedTransactions[0]?.role, undefined);
  assert.equal(Object.hasOwn(pollutedWindow.unexpectedTransactions[0]!, 'role'), false);

  const failingDefinition = scenario('CT-FUND-001', {
    variantId: 'execution-v3-revert-on-error',
    environment: timeEnvironment,
    actors: ['trader'],
  }).advanceTime({ seconds: 1 }).build();
  const failureStart = rpc.methods.length;
  await assert.rejects(
    () => runLiveScenario({
      runtime,
      definition: failingDefinition,
      resolvedEnvironment,
      actors: { trader },
      executors: {
        advanceTime: {
          execute: async () => { throw new Error('fixture executor failure'); },
        },
      },
    }),
    /fixture executor failure/u,
  );
  assert.deepEqual(
    rpc.methods.slice(failureStart),
    ['evm_snapshot', 'evm_revert'],
    'Executor 抛错后仍必须回滚 snapshot，且不得先执行额外 RPC',
  );

  const roundtrip = marketRoundtripScenario({
    caseId: 'XT-MKT-OPEN-001',
    variantId: 'execution-v3-roundtrip-shape',
    environment: txEnvironment,
    side: 'long',
    collateralRaw: '10000000',
    sizeDeltaUsdRaw: '50000000000000000000000000000000',
  });
  assert.equal(roundtrip.flowType, 'roundtrip');
  assert.deepEqual(roundtrip.actions.map((actionItem) => actionItem.type), [
    'submitMarketIncrease',
    'executeOrder',
    'submitMarketDecrease',
    'executeOrder',
  ]);
  assert.deepEqual(roundtrip.actions.map((actionItem) => actionItem.purpose), [
    'primary',
    'primary',
    'cleanup',
    'cleanup',
  ]);
} finally {
  await rpc.close();
}

console.log('live execution verification passed: runtime preflight + V3 block-window scan + roundtrip composition');

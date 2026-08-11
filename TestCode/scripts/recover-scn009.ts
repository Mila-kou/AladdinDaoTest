import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { loadRuntimeConfig } from '../src/config/runtime.js';
import { mergeLatestSnapshot, readLatestSnapshot } from '../src/reporting/latest-snapshot.js';
import { validateTestRunArtifact, type TestRunArtifact } from '../src/reporting/schema.js';
import { writeRunOutputs } from '../src/reporting/write-outputs.js';

const BEFORE_BLOCK = 45_002_555;
const CREATE_OPEN_BLOCK = 45_002_556;
const EXECUTE_OPEN_BLOCK = 45_002_557;
const CREATE_CLOSE_BLOCK = 45_002_558;
const EXECUTE_CLOSE_BLOCK = 45_002_559;
const MARKET_INDEX = 2;
const TRADER = '0xEEeA43701a49F3d41EF694DdAFe2Ac74c7c8B119';

// 遗留 .mjs 工具已随仓收编到 tools/fx100-legacy（见 src/scenarios/scn-009-runner.ts）。
function legacyPath(...parts: string[]): string {
  return resolve(process.cwd(), 'tools/fx100-legacy', ...parts);
}

async function importFile<T>(path: string): Promise<T> {
  return import(pathToFileURL(path).href) as Promise<T>;
}

function eventKey(event: Record<string, unknown>): string | undefined {
  const bytes32 = event.bytes32 as Record<string, unknown> | undefined;
  const value = bytes32?.orderKey ?? bytes32?.key;
  return typeof value === 'string' ? value : undefined;
}

function stringify(value: unknown): string {
  return `${JSON.stringify(value, (_key, item: unknown) => typeof item === 'bigint' ? item.toString() : item, 2)}\n`;
}

const runtime = loadRuntimeConfig();
const [rpcModule, deploymentModule, ledgerModule, eventsModule, scenarioModule] = await Promise.all([
  importFile<{ Rpc: new (url: string) => {
    single(method: string, params: readonly unknown[]): Promise<unknown>;
  } }>(legacyPath('tool/config-dump/lib/rpc.mjs')),
  importFile<{ loadDeployment(path: string): { name: string; addresses: Record<string, string> } }>(
    legacyPath('tool/onchain-tx/lib/deployment.mjs'),
  ),
  importFile<{
    snapshot(rpc: unknown, deployment: unknown, context: unknown, block: number): Promise<{
      blockNumber: number;
      values: Record<string, unknown>;
      errors: string[];
    }>;
    diff(before: unknown, after: unknown): Record<string, bigint | null>;
    checkConservation(delta: Record<string, bigint | null>): unknown;
  }>(legacyPath('tool/onchain-tx/lib/ledger.mjs')),
  importFile<{
    fetchEmitterEvents(rpc: unknown, input: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
  }>(legacyPath('integration/lib/events.mjs')),
  importFile<{
    fetchExecutionEvents(context: unknown, input: Record<string, unknown>): Promise<Record<string, unknown>>;
  }>(legacyPath('integration/lib/scenario.mjs')),
]);

const rpc = new rpcModule.Rpc(runtime.rpcUrl);
const deployment = deploymentModule.loadDeployment(
  resolve(process.cwd(), '../Github/fx100-contracts@release-v0.3.1/base_sepolia_v0.3.1_260729'),
);
const ledgerContext = { trader: TRADER, marketIndex: MARKET_INDEX, isLong: true };
const [before, afterOpen, afterClose, createdEvents, executedEvents] = await Promise.all([
  ledgerModule.snapshot(rpc, deployment, ledgerContext, BEFORE_BLOCK),
  ledgerModule.snapshot(rpc, deployment, ledgerContext, EXECUTE_OPEN_BLOCK),
  ledgerModule.snapshot(rpc, deployment, ledgerContext, EXECUTE_CLOSE_BLOCK),
  eventsModule.fetchEmitterEvents(rpc, {
    emitter: deployment.addresses.eventEmitter,
    fromBlock: CREATE_OPEN_BLOCK,
    toBlock: CREATE_CLOSE_BLOCK,
    eventName: 'OrderCreated',
  }),
  eventsModule.fetchEmitterEvents(rpc, {
    emitter: deployment.addresses.eventEmitter,
    fromBlock: EXECUTE_OPEN_BLOCK,
    toBlock: EXECUTE_CLOSE_BLOCK,
    eventName: 'OrderExecuted',
  }),
]);
if (before.errors.length || afterOpen.errors.length || afterClose.errors.length) {
  throw new Error(`历史 Reader 快照读取失败：${[...before.errors, ...afterOpen.errors, ...afterClose.errors].join('；')}`);
}
const openCreated = createdEvents.find((event) => event.blockNumber === CREATE_OPEN_BLOCK);
const closeCreated = createdEvents.find((event) => event.blockNumber === CREATE_CLOSE_BLOCK);
if (!openCreated || !closeCreated) throw new Error('无法从历史区块恢复两条 OrderCreated 事件');
const openOrderKey = openCreated ? eventKey(openCreated) : undefined;
const closeOrderKey = closeCreated ? eventKey(closeCreated) : undefined;
if (!openOrderKey || !closeOrderKey) throw new Error('无法从历史 OrderCreated 事件恢复 orderKey');
const openExecuted = executedEvents.find((event) => eventKey(event)?.toLowerCase() === openOrderKey.toLowerCase());
const closeExecuted = executedEvents.find((event) => eventKey(event)?.toLowerCase() === closeOrderKey.toLowerCase());
if (!openExecuted || !closeExecuted) throw new Error('无法从历史 OrderExecuted 事件恢复 Keeper 交易');
const context = { rpc, a: deployment.addresses, marketIndex: MARKET_INDEX, isLong: true };
const [openEvents, closeEvents] = await Promise.all([
  scenarioModule.fetchExecutionEvents(context, {
    fromBlock: CREATE_OPEN_BLOCK,
    toBlock: EXECUTE_OPEN_BLOCK,
    orderKey: openOrderKey,
    extraNames: ['PositionIncrease'],
  }),
  scenarioModule.fetchExecutionEvents(context, {
    fromBlock: CREATE_CLOSE_BLOCK,
    toBlock: EXECUTE_CLOSE_BLOCK,
    orderKey: closeOrderKey,
    extraNames: ['PositionDecrease'],
  }),
]);
const createOpenHash = String(openCreated.txHash);
const executeOpenHash = String(openExecuted.txHash);
const createCloseHash = String(closeCreated.txHash);
const executeCloseHash = String(closeExecuted.txHash);
const [createOpenTx, createOpenReceipt, executeOpenTx, executeOpenReceipt,
  createCloseTx, createCloseReceipt, executeCloseTx, executeCloseReceipt] = await Promise.all([
  rpc.single('eth_getTransactionByHash', [createOpenHash]), rpc.single('eth_getTransactionReceipt', [createOpenHash]),
  rpc.single('eth_getTransactionByHash', [executeOpenHash]), rpc.single('eth_getTransactionReceipt', [executeOpenHash]),
  rpc.single('eth_getTransactionByHash', [createCloseHash]), rpc.single('eth_getTransactionReceipt', [createCloseHash]),
  rpc.single('eth_getTransactionByHash', [executeCloseHash]), rpc.single('eth_getTransactionReceipt', [executeCloseHash]),
]);
const openDelta = ledgerModule.diff(before, afterOpen);
const closeDelta = ledgerModule.diff(afterOpen, afterClose);
const wholeFlowDelta = ledgerModule.diff(before, afterClose);
const openPosition = afterOpen.values.position as { sizeInUsd?: bigint; sizeInTokens?: bigint } | undefined;
const entryPrice = openPosition?.sizeInTokens
  ? (openPosition.sizeInUsd ?? 0n) / openPosition.sizeInTokens
  : null;
const evidence = {
  scenarioId: 'SCN-009',
  runMode: 'tx-fork-private-key',
  coverage: {
    executed: ['历史链上交易、事件与 Reader 状态重建', '真实用户/Keeper 签名开仓与全平'],
    pending: ['涨/平/跌三组可控价格对照', '浏览器钱包内点击签名'],
    completeScenario: false,
  },
  environment: {
    deployment: deployment.name,
    chainId: runtime.chainId,
    rpcHost: new URL(runtime.rpcUrl).host,
    forkDisplayName: runtime.forkDisplayName,
    forkBlockNumber: BEFORE_BLOCK,
    marketIndex: MARKET_INDEX,
    trader: runtime.testAccount,
    keeper: runtime.keeperAccount,
    signingMode: 'private-key',
    resetMode: 'persistent-no-revert',
  },
  testData: {
    collateralUsdc: '10', leverage: '5x', sizeUsd: '50', executionFeeEth: '0.00002', isLong: true,
  },
  snapshots: { before, afterOpen, afterClose },
  deltas: { open: openDelta, close: closeDelta, wholeFlow: wholeFlowDelta },
  transactions: {
    createOpen: {
      ok: true, txHash: createOpenHash, blockNumber: CREATE_OPEN_BLOCK,
      gasUsed: String((createOpenReceipt as Record<string, unknown>).gasUsed ?? ''), orderKey: openOrderKey,
      transaction: createOpenTx, receipt: createOpenReceipt,
    },
    executeOpen: { event: openExecuted, transaction: executeOpenTx, receipt: executeOpenReceipt },
    createClose: {
      ok: true, txHash: createCloseHash, blockNumber: CREATE_CLOSE_BLOCK,
      gasUsed: String((createCloseReceipt as Record<string, unknown>).gasUsed ?? ''), orderKey: closeOrderKey,
      transaction: createCloseTx, receipt: createCloseReceipt,
    },
    executeClose: { event: closeExecuted, transaction: executeCloseTx, receipt: executeCloseReceipt },
  },
  events: { open: openEvents, close: closeEvents },
  assertions: [],
  observations: {
    entryPrice,
    traderUsdcBefore: before.values.traderUsdc,
    traderUsdcAfter: afterClose.values.traderUsdc,
    traderUsdcDelta: BigInt(String(afterClose.values.traderUsdc ?? 0)) - BigInt(String(before.values.traderUsdc ?? 0)),
    openConservation: ledgerModule.checkConservation(openDelta),
    closeConservation: ledgerModule.checkConservation(closeDelta),
    wholeFlowConservation: ledgerModule.checkConservation(wholeFlowDelta),
    recoveredFromBlocks: [BEFORE_BLOCK, CREATE_OPEN_BLOCK, EXECUTE_OPEN_BLOCK, CREATE_CLOSE_BLOCK, EXECUTE_CLOSE_BLOCK],
  },
};

const recoveredDirectory = resolve(process.cwd(), 'artifacts/recovered');
const evidencePath = resolve(recoveredDirectory, 'scn-009-evidence.json');
const transactionsPath = resolve(recoveredDirectory, 'scn-009-tx-and-receipt.json');
const ledgerPath = resolve(recoveredDirectory, 'scn-009-reader-ledger.json');
await mkdir(dirname(evidencePath), { recursive: true });
await Promise.all([
  writeFile(evidencePath, stringify(evidence), 'utf8'),
  writeFile(transactionsPath, stringify(evidence.transactions), 'utf8'),
  writeFile(ledgerPath, stringify({
    snapshots: evidence.snapshots,
    deltas: evidence.deltas,
    observations: evidence.observations,
  }), 'utf8'),
]);
const historicalArtifactPath = resolve(process.cwd(), 'artifacts/runs/2026-08-03T165242-489Z/results.json');
const historicalArtifact = validateTestRunArtifact(
  JSON.parse(await readFile(historicalArtifactPath, 'utf8')) as unknown,
);
const recoveredArtifact: TestRunArtifact = {
  ...historicalArtifact,
  results: historicalArtifact.results.map((result) => result.id !== 'SCN-009' ? result : {
    ...result,
    attempts: result.attempts.map((attempt, attemptIndex) => attemptIndex !== result.attempts.length - 1
      ? attempt
      : {
        ...attempt,
        attachments: [
          {
            name: 'scn-009-evidence.json',
            contentType: 'application/json',
            path: resolve(process.cwd(), evidencePath).slice(process.cwd().length + 1),
          },
          {
            name: 'tx-and-receipt.json',
            contentType: 'application/json',
            path: resolve(process.cwd(), transactionsPath).slice(process.cwd().length + 1),
          },
          {
            name: 'reader-ledger-before-after.json',
            contentType: 'application/json',
            path: resolve(process.cwd(), ledgerPath).slice(process.cwd().length + 1),
          },
        ],
      }),
  }),
};
await writeFile(resolve(recoveredDirectory, 'scn-009-artifact.json'), stringify(recoveredArtifact), 'utf8');
const currentLatest = await readLatestSnapshot(resolve(process.cwd(), 'artifacts/latest'));
const mergedBase = currentLatest
  ? mergeLatestSnapshot(currentLatest, recoveredArtifact)
  : recoveredArtifact;
const merged = currentLatest
  ? { ...mergedBase, source: currentLatest.source, run: currentLatest.run, catalog: currentLatest.catalog }
  : mergedBase;
await writeRunOutputs(merged, resolve(process.cwd(), 'artifacts/latest'));
console.log(`SCN-009 已从区块 ${CREATE_OPEN_BLOCK}-${EXECUTE_CLOSE_BLOCK} 重建，并合并到主看板。`);

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

import { createPublicClient, createWalletClient, defineChain, encodeAbiParameters, getAddress, http, keccak256, parseAbi, parseAbiParameters, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import type { RuntimeConfig } from '../config/runtime.js';
import { resolveMockMarketBundle } from '../config/mock-resources.js';
import {
  checkLedgerConservation,
  ledgerDiff,
  takeLedgerSnapshot,
  type LedgerAddresses,
} from '../drivers/ledger.js';
import { sendAdminTransaction } from '../drivers/admin-rpc.js';
import {
  encodeDataStoreSetUint,
  freshOracleTimestamp,
  readMockOracleState,
  readStablePrice,
  sendSetMockPrice,
  stablePriceKey,
} from '../drivers/mock-oracle.js';
import { readTradeParameterSnapshot } from '../reconciliation/chain-parameter-snapshot.js';
import { calculateGrace } from '../reconciliation/formulas.js';

interface LegacyRpc {
  single(method: string, params: readonly unknown[]): Promise<unknown>;
}

interface LegacySnapshot {
  readonly blockNumber: number;
  readonly values: Record<string, unknown> & {
    readonly traderUsdc?: bigint;
    readonly cumulativeOpenCostsLong?: bigint;
    readonly position?: LegacyPosition;
  };
  readonly errors: readonly string[];
}

interface LegacyPosition {
  readonly exists: boolean;
  readonly isLong: boolean;
  readonly sizeInUsd: bigint;
  readonly sizeInTokens: bigint;
  readonly collateralAmount: bigint;
  readonly graceStart: bigint;
  readonly graceEnd: bigint;
}

interface SentOrder {
  readonly ok: boolean;
  readonly error?: string | null;
  readonly txHash: `0x${string}`;
  readonly blockNumber: number;
  readonly gasUsed: string;
  readonly orderKey?: `0x${string}` | null;
}

interface OrderBroadcaster {
  send(input: Record<string, unknown>): Promise<SentOrder>;
}

interface DecodedEvent {
  readonly blockNumber: number;
  readonly txHash: `0x${string}`;
  readonly eventName: string;
  readonly uint?: Record<string, bigint>;
  readonly int?: Record<string, bigint>;
  readonly bytes32?: Record<string, string>;
  readonly [key: string]: unknown;
}

interface LegacyDeployment {
  readonly name: string;
  readonly addresses: Record<string, string> & {
    readonly dataStore: string;
    readonly exchangeRouter: string;
    readonly orderHandler: string;
    readonly orderVault: string;
    readonly oracle: string;
    readonly usdc: string;
    readonly eventEmitter: string;
    readonly chainlinkPriceFeedProvider: string;
    readonly referralStorage: string;
  };
}

interface LegacyDependencies {
  readonly Rpc: new (url: string) => LegacyRpc;
  readonly loadDeployment: (path: string) => LegacyDeployment;
  readonly impersonateBroadcaster: (input: {
    rpcUrl: string;
    deploymentDir: string;
  }) => Promise<OrderBroadcaster>;
  readonly extractOrderKey: (result: string) => `0x${string}` | null;
  readonly buildIncreaseMulticall: (input: Record<string, unknown>) => Record<string, unknown>;
  readonly buildDecreaseOrder: (input: Record<string, unknown>) => Record<string, unknown>;
  readonly waitForExecution: (
    isSettled: () => Promise<boolean>,
    options: { timeoutMs: number; pollMs: number },
  ) => Promise<{ outcome: string; reason?: string }>;
  readonly orderIsPending: (
    rpc: LegacyRpc,
    input: { dataStore: string; orderListKey: string; orderKey: string; block?: number | string },
  ) => Promise<boolean>;
  readonly snapshot: (
    rpc: LegacyRpc,
    deployment: LegacyDeployment,
    context: { trader: string; marketIndex: number; isLong: boolean },
    block?: number,
  ) => Promise<LegacySnapshot>;
  readonly diff: (before: LegacySnapshot, after: LegacySnapshot) => Record<string, bigint | null>;
  readonly checkConservation: (deltas: Record<string, bigint | null>) => {
    status: 'PASS' | 'FAIL' | 'UNVERIFIABLE';
    sum: bigint | null;
    missing: string[];
    terms: Record<string, bigint>;
  };
  readonly orderListKey: string;
  readonly fetchEmitterEvents: (
    rpc: LegacyRpc,
    input: {
      emitter: string;
      fromBlock: number;
      toBlock: number;
      eventName: string;
    },
  ) => Promise<DecodedEvent[]>;
  readonly fetchExecutionEvents: (
    context: {
      rpc: LegacyRpc;
      a: LegacyDeployment['addresses'];
      marketIndex: number;
      isLong: boolean;
    },
    input: {
      fromBlock: number;
      toBlock: number;
      orderKey: string;
      extraNames: string[];
    },
  ) => Promise<Record<string, DecodedEvent | DecodedEvent[] | null>>;
  readonly calldata: (signature: string, params: unknown[]) => `0x${string}`;
}

export interface Scn009Evidence {
  readonly scenarioId: string;
  readonly runMode: 'tx-fork-impersonation' | 'tx-fork-private-key';
  readonly coverage: {
    readonly executed: string[];
    readonly pending: string[];
    readonly completeScenario: boolean;
  };
  readonly environment: Record<string, unknown>;
  readonly testData: Record<string, string | number | boolean>;
  readonly snapshots: {
    readonly before: LegacySnapshot;
    readonly afterCreateOpen: LegacySnapshot;
    /** 执行步 before：开仓执行块 −1（创建与执行同块时为创建块快照） */
    readonly openExecBefore: LegacySnapshot;
    readonly afterOpen: LegacySnapshot;
    readonly afterCreateClose: LegacySnapshot;
    /** 执行步 before：全平执行块 −1（创建与执行同块时为创建块快照） */
    readonly closeExecBefore: LegacySnapshot;
    readonly afterClose: LegacySnapshot;
  };
  readonly deltas: {
    readonly createOpen: Record<string, bigint | null>;
    readonly executeOpen: Record<string, bigint | null>;
    readonly createClose: Record<string, bigint | null>;
    readonly executeClose: Record<string, bigint | null>;
    readonly open: Record<string, bigint | null>;
    readonly close: Record<string, bigint | null>;
    readonly wholeFlow: Record<string, bigint | null>;
  };
  readonly transactions: Record<string, unknown>;
  readonly events: Record<string, unknown>;
  readonly assertions: Array<{ name: string; passed: boolean; actual: unknown; expected: unknown }>;
  readonly observations: Record<string, unknown>;
  readonly parameters: Record<string, unknown>;
}

const DEPLOYED_MARKET_INDEX = 2;
const COLLATERAL = 10_000_000n;
const SIZE_USD = 50n * 10n ** 30n;
const EXECUTION_FEE = 20_000_000_000_000n;

// 遗留 .mjs 工具已随仓收编到 tools/fx100-legacy，目录结构与原 Test/project/fx100 保持一致，
// 这样模块之间的相对 import（../../tool/... 等）不需要改动。
function legacyPath(...parts: string[]): string {
  return resolve(process.cwd(), 'tools/fx100-legacy', ...parts);
}

function deploymentPath(): string {
  return resolve(process.cwd(), '../Github/fx100-contracts@release-v0.3.1/base_sepolia_v0.3.1_260729');
}

async function importFile<T>(path: string): Promise<T> {
  return import(pathToFileURL(path).href) as Promise<T>;
}

async function loadLegacyDependencies(): Promise<LegacyDependencies> {
  const [rpcModule, deploymentModule, actionsModule, ledgerModule, keysModule, castModule, eventsModule, scenarioModule]
    = await Promise.all([
      importFile<{ Rpc: LegacyDependencies['Rpc'] }>(legacyPath('tool/config-dump/lib/rpc.mjs')),
      importFile<{ loadDeployment: LegacyDependencies['loadDeployment'] }>(legacyPath('tool/onchain-tx/lib/deployment.mjs')),
      importFile<Pick<LegacyDependencies,
        'impersonateBroadcaster' | 'extractOrderKey' | 'buildIncreaseMulticall' | 'buildDecreaseOrder' | 'waitForExecution' | 'orderIsPending'
      >>(legacyPath('integration/lib/actions.mjs')),
      importFile<Pick<LegacyDependencies, 'snapshot' | 'diff' | 'checkConservation'>>(
        legacyPath('tool/onchain-tx/lib/ledger.mjs'),
      ),
      importFile<{ BASE: { ORDER_LIST: string } }>(legacyPath('tool/onchain-tx/lib/keys.mjs')),
      importFile<{ calldata: LegacyDependencies['calldata'] }>(legacyPath('tool/onchain-tx/lib/cast.mjs')),
      importFile<Pick<LegacyDependencies, 'fetchEmitterEvents'>>(legacyPath('integration/lib/events.mjs')),
      importFile<Pick<LegacyDependencies, 'fetchExecutionEvents'>>(legacyPath('integration/lib/scenario.mjs')),
    ]);

  return {
    ...rpcModule,
    ...deploymentModule,
    ...actionsModule,
    ...ledgerModule,
    ...eventsModule,
    ...scenarioModule,
    ...castModule,
    orderListKey: keysModule.BASE.ORDER_LIST,
  };
}

function asHex(value: unknown, label: string): `0x${string}` {
  if (typeof value !== 'string' || !value.startsWith('0x')) throw new Error(`${label} 未返回 hex`);
  return value as `0x${string}`;
}

function oracleParamsLiteral(input: {
  readonly tokens: readonly string[];
  readonly providers: readonly string[];
  readonly data: readonly string[];
}): string {
  return `([${input.tokens.join(',')}],[${input.providers.join(',')}],[${input.data.join(',')}])`;
}

/** default-mock 配置的是 Chainlink price-feed provider；其价格来自 Mock Oracle，data 为空即可。 */
function buildInlineExecuteOrder(
  deps: Pick<LegacyDependencies, 'calldata'>,
  deployment: LegacyDeployment,
  orderKey: string,
  indexToken: string,
  providers: { indexToken: string; collateralToken: string },
): { to: string; data: `0x${string}`; value: bigint } {
  return {
    to: deployment.addresses.orderHandler,
    data: deps.calldata('executeOrder(bytes32,(address[],address[],bytes[]))', [
      orderKey,
      oracleParamsLiteral({
        tokens: [indexToken, deployment.addresses.usdc],
        providers: [providers.indexToken, providers.collateralToken],
        data: ['0x', '0x'],
      }),
    ]),
    value: 0n,
  };
}

function oracleProviderKey(oracle: string, token: string): `0x${string}` {
  const baseKey = keccak256(encodeAbiParameters(parseAbiParameters('string'), ['ORACLE_PROVIDER_FOR_TOKEN']));
  return keccak256(encodeAbiParameters(parseAbiParameters('bytes32,address,address'), [baseKey, getAddress(oracle), getAddress(token)]));
}

async function inlineOracleProviders(runtime: RuntimeConfig, deployment: LegacyDeployment, indexToken: string) {
  const client = createPublicClient({ transport: http(runtime.rpcUrl, { timeout: runtime.requestTimeoutMs }) });
  const abi = parseAbi(['function getAddress(bytes32) view returns (address)']);
  const [indexProvider, collateralProvider] = await Promise.all([
    client.readContract({ address: getAddress(deployment.addresses.dataStore), abi, functionName: 'getAddress', args: [oracleProviderKey(deployment.addresses.oracle, indexToken)] }),
    client.readContract({ address: getAddress(deployment.addresses.dataStore), abi, functionName: 'getAddress', args: [oracleProviderKey(deployment.addresses.oracle, deployment.addresses.usdc)] }),
  ]);
  if (indexProvider === '0x0000000000000000000000000000000000000000' || collateralProvider === '0x0000000000000000000000000000000000000000') {
    throw new Error('Inline Keeper 缺少 Index Token 或 Collateral Token 的 Oracle provider 配置。');
  }
  return { indexToken: indexProvider, collateralToken: collateralProvider };
}

async function sendKeeperExecution(
  runtime: RuntimeConfig,
  rpc: LegacyRpc,
  input: { to: string; data: string; value?: bigint },
): Promise<SentOrder> {
  if (!runtime.secondaryTestPrivateKey || !runtime.keeperAccount) {
    throw new Error('Inline Keeper 需要 E2E_SECONDARY_TEST_PRIVATE_KEY 与 E2E_KEEPER_ACCOUNT');
  }
  const account = privateKeyToAccount(runtime.secondaryTestPrivateKey);
  if (getAddress(account.address) !== getAddress(runtime.keeperAccount)) {
    throw new Error('E2E_SECONDARY_TEST_PRIVATE_KEY 地址与 E2E_KEEPER_ACCOUNT 不匹配');
  }
  const chain = defineChain({
    id: runtime.chainId,
    name: 'FX100 E2E Fork',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [runtime.rpcUrl] } },
  });
  const transport = http(runtime.rpcUrl, { timeout: runtime.requestTimeoutMs });
  const wallet = createWalletClient({ account, chain, transport });
  const publicClient = createPublicClient({ chain, transport, pollingInterval: 1_000 });
  const to = input.to as `0x${string}`;
  const data = input.data as `0x${string}`;
  const value = input.value ?? 0n;
  asHex(await rpc.single('eth_call', [{ from: account.address, to, data, value: toHex(value) }, 'latest']), 'Keeper 预执行');
  const txHash = await wallet.sendTransaction({ account, chain, to, data, value });
  const txReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 });
  return { ok: txReceipt.status === 'success', txHash, blockNumber: Number(txReceipt.blockNumber), gasUsed: txReceipt.gasUsed.toString() };
}

function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

function positionOf(snapshotValue: LegacySnapshot): LegacyPosition | undefined {
  const position = snapshotValue.values.position;
  return position && position.exists ? position : undefined;
}

function check(
  assertions: Scn009Evidence['assertions'],
  name: string,
  passed: boolean,
  actual: unknown,
  expected: unknown,
): void {
  assertions.push({ name, passed, actual, expected });
  if (!passed) throw new Error(`${name}：实际 ${String(actual)}，期望 ${String(expected)}`);
}

function eventKey(event: DecodedEvent): string | undefined {
  return event.bytes32?.orderKey ?? event.bytes32?.key;
}

async function receipt(rpc: LegacyRpc, hash: string): Promise<unknown> {
  return rpc.single('eth_getTransactionReceipt', [hash]);
}

async function transaction(rpc: LegacyRpc, hash: string): Promise<unknown> {
  return rpc.single('eth_getTransactionByHash', [hash]);
}

function transactionField(value: unknown, field: string): unknown {
  if (!value || typeof value !== 'object') return undefined;
  return (value as Record<string, unknown>)[field];
}

function transactionFrom(value: unknown): string | undefined {
  const from = transactionField(value, 'from');
  return typeof from === 'string' ? from.toLowerCase() : undefined;
}

function hasSignature(value: unknown): boolean {
  const r = transactionField(value, 'r');
  const s = transactionField(value, 's');
  return typeof r === 'string' && typeof s === 'string'
    && BigInt(r) !== 0n && BigInt(s) !== 0n;
}

function successfulReceipt(value: unknown): boolean {
  const status = transactionField(value, 'status');
  return typeof status === 'string' && BigInt(status) === 1n;
}

async function signedBroadcaster(
  runtime: RuntimeConfig,
  rpc: LegacyRpc,
  extractOrderKey: LegacyDependencies['extractOrderKey'],
): Promise<OrderBroadcaster> {
  if (!runtime.testPrivateKey || !runtime.testAccount) {
    throw new Error('private-key 模式需要 E2E_TEST_PRIVATE_KEY 与 E2E_TEST_ACCOUNT');
  }

  const account = privateKeyToAccount(runtime.testPrivateKey);
  if (getAddress(account.address) !== getAddress(runtime.testAccount)) {
    throw new Error(`E2E_TEST_PRIVATE_KEY 地址与 E2E_TEST_ACCOUNT 不匹配`);
  }

  const chain = defineChain({
    id: runtime.chainId,
    name: 'FX100 Tenderly Base Sepolia Fork',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [runtime.rpcUrl] } },
  });
  const transport = http(runtime.rpcUrl, { timeout: runtime.requestTimeoutMs });
  const wallet = createWalletClient({ account, chain, transport });
  const publicClient = createPublicClient({ chain, transport, pollingInterval: 1_000 });

  return {
    async send(input: Record<string, unknown>): Promise<SentOrder> {
      const to = String(input.to) as `0x${string}`;
      const data = String(input.data) as `0x${string}`;
      const value = BigInt(String(input.value ?? '0'));
      const simulated = await rpc.single('eth_call', [{
        from: account.address,
        to,
        data,
        value: toHex(value),
      }, 'latest']);
      if (typeof simulated !== 'string') throw new Error('签名交易预执行没有返回 calldata 结果');

      const hash = await wallet.sendTransaction({ account, chain, to, data, value });
      const txReceipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
      return {
        ok: txReceipt.status === 'success',
        txHash: hash,
        blockNumber: Number(txReceipt.blockNumber),
        gasUsed: txReceipt.gasUsed.toString(),
        orderKey: extractOrderKey(simulated),
      };
    },
  };
}

// 账本快照走 typed driver（src/drivers/ledger.ts，与 legacy ledger.mjs 逐槽等价，
// 见 scripts/verify-ledger-driver.ts）；订单构造仍走 legacy flows，待 harness 二期收编。
function ledgerAddressesOf(deployment: LegacyDeployment): LedgerAddresses {
  return {
    usdc: deployment.addresses.usdc,
    dataStore: deployment.addresses.dataStore,
    orderVault: deployment.addresses.orderVault,
    positionVault: deployment.addresses.positionVault!,
    feeHandler: deployment.addresses.feeHandler!,
    lpVault: deployment.addresses.lpVault!,
    reader: deployment.addresses.reader!,
  };
}

async function takeSnapshot(
  _deps: unknown,
  rpc: LegacyRpc,
  deployment: LegacyDeployment,
  ledgerContext: { trader: string; marketIndex: number; isLong: boolean },
  blockNumber?: number,
): Promise<LegacySnapshot> {
  let block = blockNumber;
  if (block === undefined) {
    const blockHex = await rpc.single('eth_blockNumber', []);
    if (typeof blockHex !== 'string') throw new Error('eth_blockNumber 未返回十六进制区块号');
    block = Number(BigInt(blockHex));
  }
  return takeLedgerSnapshot({
    rpcUrl: (rpc as unknown as { url?: string }).url ?? process.env.E2E_TX_FORK_RPC_URL!,
    addresses: ledgerAddressesOf(deployment),
    context: {
      trader: ledgerContext.trader,
      marketIndex: BigInt(ledgerContext.marketIndex),
      isLong: ledgerContext.isLong,
    },
    blockNumber: block,
  }) as Promise<LegacySnapshot>;
}

// 用 OrderExecuted 事件定位订单的真实执行区块（traps §4：after 快照必须钉执行块，禁止 latest——
// 轮询后的 latest 可能已被后续区块污染）。订单已离队却找不到 OrderExecuted 即显式报错，不当成功。
async function locateOrderExecution(
  deps: Pick<LegacyDependencies, 'fetchEmitterEvents'>,
  rpc: LegacyRpc,
  deployment: LegacyDeployment,
  orderKey: string,
  fromBlock: number,
): Promise<DecodedEvent> {
  const blockHex = await rpc.single('eth_blockNumber', []);
  if (typeof blockHex !== 'string') throw new Error('eth_blockNumber 未返回十六进制区块号');
  const toBlock = Number(BigInt(blockHex));
  const events = await deps.fetchEmitterEvents(rpc, {
    emitter: deployment.addresses.eventEmitter,
    fromBlock,
    toBlock,
    eventName: 'OrderExecuted',
  });
  const match = events.find((event) => eventKey(event)?.toLowerCase() === orderKey.toLowerCase());
  if (match) return match;
  // 离队但无 OrderExecuted：同窗补查 OrderCancelled / OrderFrozen 并解码 reason，把真实死因
  // 写进错误信息（events.mjs 已解 reason/reasonBytes 两族）。非持久模式结束后 evm_revert 会抹掉
  // 现场，这里是拿到取消原因的唯一时机。
  for (const eventName of ['OrderCancelled', 'OrderFrozen'] as const) {
    const terminal = await deps.fetchEmitterEvents(rpc, {
      emitter: deployment.addresses.eventEmitter,
      fromBlock,
      toBlock,
      eventName,
    });
    const hit = terminal.find((event) => eventKey(event)?.toLowerCase() === orderKey.toLowerCase());
    if (hit) {
      const reason = (hit as { string?: Record<string, unknown> }).string?.reason;
      const reasonBytes = (hit as { bytes?: Record<string, unknown> }).bytes?.reasonBytes;
      const selector = typeof reasonBytes === 'string' ? reasonBytes.slice(0, 10) : undefined;
      throw new Error(
        `订单 ${orderKey} 被${eventName === 'OrderFrozen' ? '冻结（OrderFrozen）' : '静默取消（OrderCancelled）'}：`
        + `reason=${String(reason ?? '未知')}；reasonBytes selector=${selector ?? '无'}；`
        + `block=${hit.blockNumber}，tx=${hit.txHash}。`
        + '常见取消闸门：OrderNotFulfillableAtAcceptablePrice（执行价越过 acceptablePrice，检查 mock 价与订单价格假设是否一致）、'
        + 'MaxPriceAgeExceeded / 价格时间戳早于订单创建（刷新 Mock Oracle 时间戳）、'
        + 'LiquidatablePosition[0xbc121108]（杠杆/保证金校验；⚠️ 手动改 mock 价后若未同步 DataStore 的 STABLE_PRICE 锚，'
        + 'min/max 会被撑开成 [新价, 旧锚]，开仓按 max 成交、校验按 min 估值 → 必然"开仓即可清算"——改价必须连锚一起改，2026-08-12 实案）。',
      );
    }
  }
  throw new Error(
    `订单 ${orderKey} 已离开挂单队列，但在区块 ${fromBlock}-${toBlock} 内 OrderExecuted / OrderCancelled / OrderFrozen 均未命中。`
    + '可能原因：①事件检索窗口内日志超限（fork 上有高频 Service Keeper 交易时 eth_getLogs 可能被截断/失败）；'
    + '②挂单列表读取与事件写入竞态。注意：非持久模式结束后 evm_revert 会抹掉现场，复诊请用持久模式（E2E_PERSIST_FORK_STATE=true）重跑。',
  );
}

// Mock Oracle 时间戳自愈：fork 新区块使用真实时钟，而 Oracle 时间戳停在上次设价时刻，
// 隔天执行订单必因价格过期 revert（heartbeat 86400s / 价格早于订单创建时间）。
// 执行前按"价格数值不变、时间戳刷新"重设，属环境管理交易，与业务交易分开记录。
async function refreshMockOracleTimestamps(
  runtime: RuntimeConfig,
  oracles: ReadonlyArray<{ role: 'index' | 'collateral'; address: string }>,
): Promise<Array<Record<string, unknown>>> {
  const adminRpcUrl = runtime.adminRpcUrl ?? runtime.rpcUrl;
  const from = runtime.adminAccount ?? runtime.testAccount;
  if (!from) throw new Error('刷新 Mock Oracle 时间戳需要 E2E_ADMIN_ACCOUNT 或 E2E_TEST_ACCOUNT');
  const results: Array<Record<string, unknown>> = [];
  for (const oracle of oracles) {
    const state = await readMockOracleState(runtime.rpcUrl, oracle.address, runtime.requestTimeoutMs);
    const timestamp = freshOracleTimestamp(state.latestBlockTimestamp);
    const receipt = await sendSetMockPrice({
      adminRpcUrl,
      from,
      oracle: oracle.address,
      priceRaw: state.answer,
      timestamp,
    });
    results.push({
      role: oracle.role,
      oracle: oracle.address,
      priceRaw: state.answer.toString(),
      previousUpdatedAt: Number(state.updatedAt),
      refreshedTimestamp: Number(timestamp),
      txHash: receipt.txHash,
      blockNumber: receipt.blockNumber,
      status: receipt.status,
    });
  }
  return results;
}

// 窗口纯净度：diff 里的 bigint 槽位全部为 0 才算无第三方账本变动。
// 非 bigint 项（如 position 结构体）不参与判定；缺失读数由各快照的 errors 断言单独把关。
function ledgerDriftIsZero(drift: Record<string, bigint | null>): boolean {
  return Object.values(drift).every((value) => typeof value !== 'bigint' || value === 0n);
}

function describeLedgerDrift(drift: Record<string, bigint | null>): string {
  const moved = Object.entries(drift).filter(([, value]) => typeof value === 'bigint' && value !== 0n);
  return moved.length === 0 ? '无变动' : moved.map(([key, value]) => `${key}:${value}`).join('，');
}

export interface MarketFlowOptions {
  readonly scenarioId: string;
  readonly isLong: boolean;
  /** 盈亏构造：开仓后、平仓前把 Index 价格推动 ±N%（feed+时间戳+STABLE_PRICE 三件套，traps §11）。 */
  readonly priceMovePercent?: number;
}

export async function runScn009(runtime: RuntimeConfig): Promise<Scn009Evidence> {
  return runMarketFlow(runtime, { scenarioId: 'SCN-009', isLong: true });
}

// 市价开仓→全平 的方向无关流程：SCN-009（long）与 SCN-065（short）共用。
// 方向差异集中在：订单 isLong、执行价不利侧比较方向、断言与覆盖文案。
export async function runMarketFlow(runtime: RuntimeConfig, flow: MarketFlowOptions): Promise<Scn009Evidence> {
  const isLong = flow.isLong;
  const directionLabel = isLong ? '多' : '空';
  if (!runtime.testAccount || !runtime.keeperAccount) {
    throw new Error('SCN-009 需要 E2E_TEST_ACCOUNT 与 E2E_KEEPER_ACCOUNT');
  }

  const deps = await loadLegacyDependencies();
  const deploymentDir = deploymentPath();
  const baseDeployment = deps.loadDeployment(deploymentDir);
  const useDeployedMarket = process.env.E2E_MARKET_MODE === 'deployed-market';
  const mockResourceAlias = process.env.E2E_MARKET_RESOURCE_ALIAS ?? 'default-mock';
  const mockResource = useDeployedMarket
    ? undefined
    : await resolveMockMarketBundle(runtime.environment, mockResourceAlias);
  if (mockResource && (mockResource.market?.status !== 'registered'
    || mockResource.market.marketIndex === undefined
    || !mockResource.collateralToken)) {
    throw new Error(`${runtime.environment}/${mockResourceAlias} 缺少已注册 Market 或 Collateral Token`);
  }
  if (runtime.keeperMode === 'inline' && mockResource
    && (!mockResource.collateralOracle
      || mockResource.oracleMode?.index !== 'mock'
      || mockResource.oracleMode.collateral !== 'mock'
      || mockResource.oracleMode.inlineKeeperReady !== true)) {
    throw new Error(`${runtime.environment}/${mockResourceAlias} 尚未配置双 Mock Oracle；请在环境页重新初始化后再运行 Inline Keeper。`);
  }
  const marketIndex = mockResource?.market?.marketIndex ?? DEPLOYED_MARKET_INDEX;
  const deployment: LegacyDeployment = mockResource
    ? {
      ...baseDeployment,
      name: `${baseDeployment.name} + ${runtime.environment}/${mockResourceAlias}`,
      addresses: {
        ...baseDeployment.addresses,
        usdc: mockResource.collateralToken!.address,
      },
    }
    : baseDeployment;
  const rpc = new deps.Rpc(runtime.rpcUrl);
  const broadcaster = runtime.signingMode === 'private-key'
    ? await signedBroadcaster(runtime, rpc, deps.extractOrderKey)
    : await deps.impersonateBroadcaster({ rpcUrl: runtime.rpcUrl, deploymentDir });
  const context = { rpc, deployment, a: deployment.addresses, marketIndex, isLong };
  const ledgerContext = { trader: runtime.testAccount, marketIndex, isLong };
  const assertions: Scn009Evidence['assertions'] = [];
  const inlineKeeper = runtime.keeperMode === 'inline';
  if (inlineKeeper && !mockResource?.token?.address) {
    throw new Error('Inline Keeper 当前需要完整 Mock Market Bundle；切换标准 Market 时请选择 Service Keeper 专项模式。');
  }

  // 先刷新 Oracle 时间戳、再取 before 快照：刷新交易挖出的新区块不会污染账本核对窗口。
  const oracleRefresh = mockResource?.oracle?.address
    ? await refreshMockOracleTimestamps(runtime, [
      { role: 'index', address: mockResource.oracle.address },
      ...(mockResource.collateralOracle
        ? [{ role: 'collateral' as const, address: mockResource.collateralOracle.address }]
        : []),
    ])
    : [];
  if (oracleRefresh.length > 0) {
    check(
      assertions,
      '执行前 Mock Oracle 时间戳已刷新（价格不变）',
      oracleRefresh.every((item) => item.status === 'success'),
      oracleRefresh.map((item) => `${String(item.role)}:${String(item.status)}@${String(item.refreshedTimestamp)}`).join('，'),
      '全部 setMockPrice 回执成功',
    );
  }

  const before = await takeSnapshot(deps, rpc, deployment, ledgerContext);
  check(assertions, 'before 账本无缺失读数', before.errors.length === 0, before.errors, []);
  check(assertions, `执行前无${directionLabel}仓`, !positionOf(before), Boolean(positionOf(before)), false);

  const open = await broadcaster.send({
    ...deps.buildIncreaseMulticall({
      exchangeRouter: deployment.addresses.exchangeRouter,
      orderVault: deployment.addresses.orderVault,
      collateralToken: deployment.addresses.usdc,
      account: runtime.testAccount,
      marketIndex,
      isLong,
      sizeDeltaUsd: SIZE_USD,
      collateral: COLLATERAL,
      executionFee: EXECUTION_FEE,
    }),
    from: runtime.testAccount,
  });
  check(assertions, '开仓创建交易成功', open.ok, open.error ?? open.txHash, 'success');
  const openOrderKey = requireValue(open.orderKey, '开仓交易未解出 orderKey');
  // 固定读取创建交易所在区块，避免 Service Keeper 紧接着执行后丢失 TX1 的挂单态。
  const afterCreateOpen = await takeSnapshot(deps, rpc, deployment, ledgerContext, open.blockNumber);
  check(assertions, 'afterCreateOpen 账本无缺失读数', afterCreateOpen.errors.length === 0, afterCreateOpen.errors, []);
  if (inlineKeeper) {
    const providers = await inlineOracleProviders(runtime, deployment, mockResource!.token!.address);
    const execution = await sendKeeperExecution(runtime, rpc, buildInlineExecuteOrder(
      deps, deployment, openOrderKey, mockResource!.token!.address, providers,
    ));
    check(assertions, 'Inline Keeper 开仓执行交易成功', execution.ok, execution.txHash, 'success');
  }
  const openSettled = inlineKeeper
    ? { outcome: !(await deps.orderIsPending(rpc, {
      dataStore: deployment.addresses.dataStore, orderListKey: deps.orderListKey, orderKey: openOrderKey,
    })) ? 'settled' : 'pending' }
    : await deps.waitForExecution(
    async () => !(await deps.orderIsPending(rpc, {
      dataStore: deployment.addresses.dataStore,
      orderListKey: deps.orderListKey,
      orderKey: openOrderKey,
    })),
    { timeoutMs: 300_000, pollMs: 2_000 },
  );
  if (openSettled.outcome !== 'settled') {
    throw new Error(inlineKeeper ? 'Inline Keeper 已发送执行交易，但订单仍在挂单态' : '等 Service Keeper 超时（300s），订单仍在挂单态。请在看板选择 Inline Keeper，或先完成 Service Keeper 专项就绪检查。');
  }

  // after 快照与参数快照钉真实执行区块；执行步 before 钉 execBlock−1，
  // 并对 [创建块, execBlock−1] 做窗口纯净度检测——第三方交易插入会污染阶段 Δ 与参数读数。
  const openExecutionLocated = await locateOrderExecution(deps, rpc, deployment, openOrderKey, open.blockNumber);
  const openExecBlock = openExecutionLocated.blockNumber;
  const openExecBefore = openExecBlock > open.blockNumber
    ? await takeSnapshot(deps, rpc, deployment, ledgerContext, openExecBlock - 1)
    : afterCreateOpen; // 创建与执行同块时无法分离执行步 before，退回创建块快照
  check(assertions, 'openExecBefore 账本无缺失读数', openExecBefore.errors.length === 0, openExecBefore.errors, []);
  const openWindowDrift = ledgerDiff(afterCreateOpen, openExecBefore);
  check(
    assertions,
    '开仓执行窗口无第三方账本变动（创建块 → execBlock−1）',
    ledgerDriftIsZero(openWindowDrift),
    describeLedgerDrift(openWindowDrift),
    '全部账本槽位 Δ = 0',
  );
  const afterOpen = await takeSnapshot(deps, rpc, deployment, ledgerContext, openExecBlock);
  check(assertions, 'afterOpen 账本无缺失读数', afterOpen.errors.length === 0, afterOpen.errors, []);
  const openedPosition = requireValue(positionOf(afterOpen), `开仓订单离队，但${directionLabel}头仓位不存在（可能被静默取消）`);
  const openParameterSnapshot = await readTradeParameterSnapshot({
    rpcUrl: runtime.rpcUrl,
    timeoutMs: runtime.requestTimeoutMs,
    dataStore: deployment.addresses.dataStore,
    referralStorage: deployment.addresses.referralStorage,
    marketIndex,
    account: runtime.testAccount,
    blockNumber: afterOpen.blockNumber,
  });
  const graceParameters = openParameterSnapshot.grace;
  const expectedGrace = calculateGrace({
    graceStart: openedPosition.graceStart,
    graceBase: graceParameters.graceBaseSeconds,
    tierMultiplier: graceParameters.tierMultiplier,
  });
  check(assertions, `开仓后方向为${directionLabel}头`, openedPosition.isLong === isLong, openedPosition.isLong, isLong);
  check(assertions, '开仓规模为 50 USD', openedPosition.sizeInUsd === SIZE_USD, openedPosition.sizeInUsd, SIZE_USD);
  check(
    assertions,
    '首次开仓 Grace 按执行区块当前参数复算',
    openedPosition.graceEnd === expectedGrace.graceEnd,
    {
      graceStart: openedPosition.graceStart,
      graceEnd: openedPosition.graceEnd,
      graceBase: graceParameters.graceBaseSeconds,
      tier: graceParameters.referralTier,
      tierMultiplier: graceParameters.tierMultiplier,
      effectiveGrace: graceParameters.effectiveGraceSeconds,
    },
    `graceEnd = ${expectedGrace.expanded}`,
  );

  // 盈亏构造：三件套推价（feed 价 + 时间戳 + STABLE_PRICE 锚同步缩放，保持 min/max 带宽形状）。
  const priceMove = flow.priceMovePercent ?? 0;
  const priceMoveTransactions: Array<Record<string, unknown>> = [];
  if (priceMove !== 0) {
    if (!mockResource?.oracle?.address || !mockResource.token?.address) {
      throw new Error('盈亏构造需要 mock-market 模式（可控 Index Oracle）');
    }
    const adminRpcUrl = runtime.adminRpcUrl ?? runtime.rpcUrl;
    const adminFrom = runtime.adminAccount ?? runtime.testAccount;
    const indexState = await readMockOracleState(runtime.rpcUrl, mockResource.oracle.address, runtime.requestTimeoutMs);
    const stableBefore = await readStablePrice(runtime.rpcUrl, deployment.addresses.dataStore, mockResource.token.address, runtime.requestTimeoutMs);
    const factor = BigInt(100 + priceMove);
    const scaledFeed = indexState.answer * factor / 100n;
    const scaledStable = stableBefore * factor / 100n;
    const moveTimestamp = freshOracleTimestamp(indexState.latestBlockTimestamp);
    const feedReceipt = await sendSetMockPrice({
      adminRpcUrl,
      from: adminFrom,
      oracle: mockResource.oracle.address,
      priceRaw: scaledFeed,
      timestamp: moveTimestamp,
    });
    const stableReceipt = await sendAdminTransaction({
      adminRpcUrl,
      // DataStore.setUint onlyController：模拟持有 CONTROLLER 角色的 Config 合约
      from: deployment.addresses.config!,
      to: deployment.addresses.dataStore,
      data: encodeDataStoreSetUint(stablePriceKey(mockResource.token.address), scaledStable),
    });
    check(
      assertions,
      `盈亏构造：Index 价格已推动 ${priceMove > 0 ? '+' : ''}${priceMove}%（feed + STABLE_PRICE 三件套）`,
      feedReceipt.status === 'success' && stableReceipt.status === 'success',
      `feed=${feedReceipt.status}（${scaledFeed}），stable=${stableReceipt.status}（${scaledStable}）`,
      '两笔环境管理交易回执成功',
    );
    priceMoveTransactions.push(
      { kind: 'feed', txHash: feedReceipt.txHash, blockNumber: feedReceipt.blockNumber, priceRaw: scaledFeed.toString(), previousPriceRaw: indexState.answer.toString(), timestamp: Number(moveTimestamp) },
      { kind: 'stablePrice', txHash: stableReceipt.txHash, blockNumber: stableReceipt.blockNumber, value: scaledStable.toString(), previousValue: stableBefore.toString() },
    );
  }

  const close = await broadcaster.send({
    ...deps.buildDecreaseOrder({
      exchangeRouter: deployment.addresses.exchangeRouter,
      orderVault: deployment.addresses.orderVault,
      account: runtime.testAccount,
      marketIndex,
      isLong,
      sizeDeltaUsd: openedPosition.sizeInUsd,
      collateralDelta: 0n,
      executionFee: EXECUTION_FEE,
    }),
    from: runtime.testAccount,
  });
  check(assertions, '全平创建交易成功', close.ok, close.error ?? close.txHash, 'success');
  const closeOrderKey = requireValue(close.orderKey, '全平交易未解出 orderKey');
  const afterCreateClose = await takeSnapshot(deps, rpc, deployment, ledgerContext, close.blockNumber);
  check(assertions, 'afterCreateClose 账本无缺失读数', afterCreateClose.errors.length === 0, afterCreateClose.errors, []);
  if (inlineKeeper) {
    const providers = await inlineOracleProviders(runtime, deployment, mockResource!.token!.address);
    const execution = await sendKeeperExecution(runtime, rpc, buildInlineExecuteOrder(
      deps, deployment, closeOrderKey, mockResource!.token!.address, providers,
    ));
    check(assertions, 'Inline Keeper 全平执行交易成功', execution.ok, execution.txHash, 'success');
  }
  const closeSettled = inlineKeeper
    ? { outcome: !(await deps.orderIsPending(rpc, {
      dataStore: deployment.addresses.dataStore, orderListKey: deps.orderListKey, orderKey: closeOrderKey,
    })) ? 'settled' : 'pending' }
    : await deps.waitForExecution(
    async () => !(await deps.orderIsPending(rpc, {
      dataStore: deployment.addresses.dataStore,
      orderListKey: deps.orderListKey,
      orderKey: closeOrderKey,
    })),
    { timeoutMs: 300_000, pollMs: 2_000 },
  );
  if (closeSettled.outcome !== 'settled') {
    throw new Error(inlineKeeper ? 'Inline Keeper 已发送全平执行交易，但订单仍在挂单态' : '等 Service Keeper 超时（300s），全平订单仍在挂单态。请在看板选择 Inline Keeper，或先完成 Service Keeper 专项就绪检查。');
  }

  const closeExecutionLocated = await locateOrderExecution(deps, rpc, deployment, closeOrderKey, close.blockNumber);
  const closeExecBlock = closeExecutionLocated.blockNumber;
  const closeExecBefore = closeExecBlock > close.blockNumber
    ? await takeSnapshot(deps, rpc, deployment, ledgerContext, closeExecBlock - 1)
    : afterCreateClose;
  check(assertions, 'closeExecBefore 账本无缺失读数', closeExecBefore.errors.length === 0, closeExecBefore.errors, []);
  const closeWindowDrift = ledgerDiff(afterCreateClose, closeExecBefore);
  check(
    assertions,
    '全平执行窗口无第三方账本变动（创建块 → execBlock−1）',
    ledgerDriftIsZero(closeWindowDrift),
    describeLedgerDrift(closeWindowDrift),
    '全部账本槽位 Δ = 0',
  );
  const afterClose = await takeSnapshot(deps, rpc, deployment, ledgerContext, closeExecBlock);
  check(assertions, 'afterClose 账本无缺失读数', afterClose.errors.length === 0, afterClose.errors, []);
  const closeParameterSnapshot = await readTradeParameterSnapshot({
    rpcUrl: runtime.rpcUrl,
    timeoutMs: runtime.requestTimeoutMs,
    dataStore: deployment.addresses.dataStore,
    referralStorage: deployment.addresses.referralStorage,
    marketIndex,
    account: runtime.testAccount,
    blockNumber: afterClose.blockNumber,
  });
  check(assertions, '全平后仓位已移除', !positionOf(afterClose), Boolean(positionOf(afterClose)), false);
  const openCostsKey = isLong ? 'cumulativeOpenCostsLong' : 'cumulativeOpenCostsShort';
  check(
    assertions,
    `累计${directionLabel}头开仓成本回到执行前数值`,
    afterClose.values[openCostsKey] === before.values[openCostsKey],
    afterClose.values[openCostsKey],
    before.values[openCostsKey],
  );

  const allOrderEvents = await deps.fetchEmitterEvents(rpc, {
    emitter: deployment.addresses.eventEmitter,
    fromBlock: before.blockNumber + 1,
    toBlock: afterClose.blockNumber,
    eventName: 'OrderExecuted',
  });
  const openExecutionMatches = allOrderEvents.filter(
    (event) => eventKey(event)?.toLowerCase() === openOrderKey.toLowerCase(),
  );
  const closeExecutionMatches = allOrderEvents.filter(
    (event) => eventKey(event)?.toLowerCase() === closeOrderKey.toLowerCase(),
  );
  const openExecution = openExecutionMatches[0];
  const closeExecution = closeExecutionMatches[0];
  check(assertions, '开仓恰好一条执行证据', openExecutionMatches.length === 1, openExecutionMatches.length, 1);
  check(assertions, '全平恰好一条执行证据', closeExecutionMatches.length === 1, closeExecutionMatches.length, 1);

  const [openEvents, closeEvents] = await Promise.all([
    deps.fetchExecutionEvents(context, {
      fromBlock: open.blockNumber,
      toBlock: afterOpen.blockNumber,
      orderKey: openOrderKey,
      extraNames: ['PositionIncrease'],
    }),
    deps.fetchExecutionEvents(context, {
      fromBlock: close.blockNumber,
      toBlock: afterClose.blockNumber,
      orderKey: closeOrderKey,
      extraNames: ['PositionDecrease'],
    }),
  ]);
  const positionIncrease = openEvents.PositionIncrease as DecodedEvent | null;
  const positionDecrease = closeEvents.PositionDecrease as DecodedEvent | null;
  const openExecutionPrice = positionIncrease?.uint?.executionPrice;
  const closeExecutionPrice = positionDecrease?.uint?.executionPrice;
  // 不利侧矩阵：开多/平空 用 ask（≥ oracle max）；开空/平多 用 bid（≤ oracle min）。
  const openOracleSide = isLong ? positionIncrease?.uint?.['indexTokenPrice.max'] : positionIncrease?.uint?.['indexTokenPrice.min'];
  const closeOracleSide = isLong ? positionDecrease?.uint?.['indexTokenPrice.min'] : positionDecrease?.uint?.['indexTokenPrice.max'];
  const openAdverse = (price: bigint, side: bigint): boolean => (isLong ? price >= side : price <= side);
  const closeAdverse = (price: bigint, side: bigint): boolean => (isLong ? price <= side : price >= side);
  check(
    assertions,
    isLong ? '开多执行价使用 ask/不利侧（executionPrice ≥ oracle max）' : '开空执行价使用 bid/不利侧（executionPrice ≤ oracle min）',
    openExecutionPrice !== undefined && openOracleSide !== undefined && openAdverse(openExecutionPrice, openOracleSide),
    `${openExecutionPrice}/${openOracleSide}`,
    isLong ? 'executionPrice ≥ oracle max' : 'executionPrice ≤ oracle min',
  );
  check(
    assertions,
    isLong ? '平多执行价使用 bid/不利侧（executionPrice ≤ oracle min）' : '平空执行价使用 ask/不利侧（executionPrice ≥ oracle max）',
    closeExecutionPrice !== undefined && closeOracleSide !== undefined && closeAdverse(closeExecutionPrice, closeOracleSide),
    `${closeExecutionPrice}/${closeOracleSide}`,
    isLong ? 'executionPrice ≤ oracle min' : 'executionPrice ≥ oracle max',
  );

  const openExecutionEvent = requireValue(openExecution, '缺少开仓 OrderExecuted 事件');
  const closeExecutionEvent = requireValue(closeExecution, '缺少平仓 OrderExecuted 事件');
  const [openCreateTx, openCreateReceipt, openExecuteTx, openExecuteReceipt,
    closeCreateTx, closeCreateReceipt, closeExecuteTx, closeExecuteReceipt] = await Promise.all([
    transaction(rpc, open.txHash), receipt(rpc, open.txHash),
    transaction(rpc, openExecutionEvent.txHash), receipt(rpc, openExecutionEvent.txHash),
    transaction(rpc, close.txHash), receipt(rpc, close.txHash),
    transaction(rpc, closeExecutionEvent.txHash), receipt(rpc, closeExecutionEvent.txHash),
  ]);
  const trader = runtime.testAccount.toLowerCase();
  const keeper = runtime.keeperAccount.toLowerCase();
  check(
    assertions,
    '两笔用户交易均由测试用户地址签名',
    transactionFrom(openCreateTx) === trader && transactionFrom(closeCreateTx) === trader,
    `${transactionFrom(openCreateTx)}/${transactionFrom(closeCreateTx)}`,
    trader,
  );
  check(
    assertions,
    '两笔执行交易均由 ORDER_KEEPER 地址签名',
    transactionFrom(openExecuteTx) === keeper && transactionFrom(closeExecuteTx) === keeper,
    `${transactionFrom(openExecuteTx)}/${transactionFrom(closeExecuteTx)}`,
    keeper,
  );
  check(
    assertions,
    '四笔交易均包含非零签名字段',
    [openCreateTx, openExecuteTx, closeCreateTx, closeExecuteTx].every(hasSignature),
    [openCreateTx, openExecuteTx, closeCreateTx, closeExecuteTx].map(hasSignature),
    [true, true, true, true],
  );
  check(
    assertions,
    '四笔交易回执均成功',
    [openCreateReceipt, openExecuteReceipt, closeCreateReceipt, closeExecuteReceipt].every(successfulReceipt),
    [openCreateReceipt, openExecuteReceipt, closeCreateReceipt, closeExecuteReceipt].map(successfulReceipt),
    [true, true, true, true],
  );

  const createOpenDelta = ledgerDiff(before, afterCreateOpen);
  // 执行步 Δ 以 execBlock−1 为基准（traps §4）；创建块 → execBlock−1 的间隙已由窗口纯净度断言保证为零变动。
  const executeOpenDelta = ledgerDiff(openExecBefore, afterOpen);
  const createCloseDelta = ledgerDiff(afterOpen, afterCreateClose);
  const executeCloseDelta = ledgerDiff(closeExecBefore, afterClose);
  const openDelta = ledgerDiff(before, afterOpen);
  const closeDelta = ledgerDiff(afterOpen, afterClose);
  const wholeFlowDelta = ledgerDiff(before, afterClose);
  const entryPrice = openedPosition.sizeInTokens > 0n
    ? openedPosition.sizeInUsd / openedPosition.sizeInTokens
    : null;
  const traderUsdcDelta = (afterClose.values.traderUsdc ?? 0n) - (before.values.traderUsdc ?? 0n);

  // L1 零和守恒是总闸（整式无除法、对取整免疫）：七组结果逐一进 check()，
  // UNVERIFIABLE（缺读数）不当通过——只写 observations 不断言等于守恒零门槛。
  const conservation = {
    createOpen: checkLedgerConservation(createOpenDelta),
    executeOpen: checkLedgerConservation(executeOpenDelta),
    createClose: checkLedgerConservation(createCloseDelta),
    executeClose: checkLedgerConservation(executeCloseDelta),
    open: checkLedgerConservation(openDelta),
    close: checkLedgerConservation(closeDelta),
    wholeFlow: checkLedgerConservation(wholeFlowDelta),
  };
  for (const [stage, result] of Object.entries(conservation)) {
    check(
      assertions,
      `${stage} 阶段五方守恒 ΣΔ = 0`,
      result.status === 'PASS',
      `status=${result.status}，ΣΔ=${result.sum ?? 'null'}${result.missing.length > 0 ? `，缺读数：${result.missing.join('/')}` : ''}`,
      'status=PASS 且 ΣΔ=0',
    );
  }

  return {
    scenarioId: flow.scenarioId,
    runMode: runtime.signingMode === 'private-key' ? 'tx-fork-private-key' : 'tx-fork-impersonation',
    coverage: {
      executed: [
        'Trade 页面可达与页面截图',
        mockResource
          ? `${mockResourceAlias} Market #${marketIndex} / Mock Token / Mock Oracle`
          : `已部署 Market #${marketIndex} / 非 Mock Oracle`,
        runtime.signingMode === 'private-key'
          ? `用户私钥签名：10 USDC / 5x / 50 USD 市价开${directionLabel}`
          : `账户模拟：10 USDC / 5x / 50 USD 市价开${directionLabel}`,
        inlineKeeper
          ? 'Inline Keeper：ORDER_KEEPER 私钥真实签名 executeOrder'
          : 'Service Keeper：producer + ord-worker 异步执行',
        runtime.signingMode === 'private-key' ? '用户私钥签名市价全平' : '账户模拟市价全平',
        'Reader/账本/事件/余额证据',
      ],
      pending: [
        '涨/平/跌三组可控价格对照',
        '浏览器钱包内从页面点击并签名',
        '页面历史与链上事件逐条核对',
      ],
      completeScenario: false,
    },
    environment: {
      deployment: deployment.name,
      chainId: runtime.chainId,
      rpcHost: new URL(runtime.rpcUrl).host,
      forkDisplayName: runtime.forkDisplayName,
      forkBlockNumber: before.blockNumber,
      marketIndex,
      marketMode: mockResource ? 'mock-market' : 'deployed-market',
      oracleMode: mockResource ? 'mock-oracle' : 'deployed-oracle',
      mockResourceAlias: mockResource ? mockResourceAlias : 'none',
      indexToken: mockResource?.token?.address,
      oracle: mockResource?.oracle?.address,
      collateralToken: deployment.addresses.usdc,
      trader: runtime.testAccount,
      keeper: runtime.keeperAccount,
      signingMode: runtime.signingMode,
      keeperMode: runtime.keeperMode,
      resetMode: process.env.E2E_PERSIST_FORK_STATE === 'true'
        ? 'persistent-no-revert'
        : runtime.forkResetMode,
    },
    testData: {
      collateralUsdc: '10',
      leverage: '5x',
      sizeUsd: '50',
      executionFeeEth: '0.00002',
      isLong,
    },
    parameters: { open: openParameterSnapshot, close: closeParameterSnapshot },
    snapshots: { before, afterCreateOpen, openExecBefore, afterOpen, afterCreateClose, closeExecBefore, afterClose },
    deltas: {
      createOpen: createOpenDelta,
      executeOpen: executeOpenDelta,
      createClose: createCloseDelta,
      executeClose: executeCloseDelta,
      open: openDelta,
      close: closeDelta,
      wholeFlow: wholeFlowDelta,
    },
    transactions: {
      // 环境管理交易：执行前的 Oracle 时间戳刷新 + 盈亏构造推价，与四笔业务交易分开记录。
      oracleRefresh,
      priceMove: priceMoveTransactions,
      createOpen: { ...open, transaction: openCreateTx, receipt: openCreateReceipt },
      executeOpen: { event: openExecutionEvent, transaction: openExecuteTx, receipt: openExecuteReceipt },
      createClose: { ...close, transaction: closeCreateTx, receipt: closeCreateReceipt },
      executeClose: { event: closeExecutionEvent, transaction: closeExecuteTx, receipt: closeExecuteReceipt },
    },
    events: { open: openEvents, close: closeEvents },
    assertions,
    observations: {
      entryPrice,
      traderUsdcBefore: before.values.traderUsdc,
      traderUsdcAfter: afterClose.values.traderUsdc,
      traderUsdcDelta,
      createOpenConservation: conservation.createOpen,
      executeOpenConservation: conservation.executeOpen,
      createCloseConservation: conservation.createClose,
      executeCloseConservation: conservation.executeClose,
      openConservation: conservation.open,
      closeConservation: conservation.close,
      wholeFlowConservation: conservation.wholeFlow,
    },
  };
}

export function stringifyEvidence(value: unknown): string {
  return `${JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'bigint' ? item.toString() : item, 2)}\n`;
}

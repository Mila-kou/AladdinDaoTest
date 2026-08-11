import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

import { createPublicClient, createWalletClient, defineChain, getAddress, http, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { resolveMockMarketBundle } from '../config/mock-resources.js';
import type { RuntimeConfig } from '../config/runtime.js';
import { readTradeParameterSnapshot } from '../reconciliation/chain-parameter-snapshot.js';
import { calculateGrace } from '../reconciliation/formulas.js';

interface LegacyRpc {
  single(method: string, params: readonly unknown[]): Promise<unknown>;
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

interface LegacySnapshot {
  readonly blockNumber: number;
  readonly values: Record<string, unknown> & {
    readonly traderUsdc?: bigint;
    readonly cumulativeOpenCostsLong?: bigint;
    readonly position?: LegacyPosition;
  };
  readonly errors: readonly string[];
}

interface DecodedEvent {
  readonly blockNumber: number;
  readonly txHash: `0x${string}`;
  readonly eventName: string;
  readonly uint?: Record<string, bigint>;
  readonly bool?: Record<string, boolean>;
  readonly bytes32?: Record<string, string>;
  readonly [key: string]: unknown;
}

interface LegacyDeployment {
  readonly name: string;
  readonly dir: string;
  readonly addresses: Record<string, string> & {
    readonly dataStore: string;
    readonly exchangeRouter: string;
    readonly orderHandler: string;
    readonly orderVault: string;
    readonly usdc: string;
    readonly eventEmitter: string;
    readonly oracle: string;
    readonly chainlinkPriceFeedProvider: string;
    readonly referralStorage: string;
  };
}

interface SentTransaction {
  readonly ok: boolean;
  readonly txHash: `0x${string}`;
  readonly blockNumber: number;
  readonly gasUsed: string;
  readonly simulatedResult: `0x${string}`;
  readonly orderKey?: `0x${string}` | null;
}

interface AdminReceipt {
  readonly txHash: `0x${string}`;
  readonly blockNumber: number;
  readonly status: 'success' | 'reverted';
  readonly gasUsed: string;
  readonly label: string;
  readonly contractAddress?: string;
}

interface OracleConfig {
  readonly token: string;
  readonly priceFeed: string;
  readonly multiplier: bigint;
  readonly heartbeat: bigint;
  readonly provider: string;
}

interface MockOracleState {
  readonly token: string;
  readonly oracle: string;
  readonly rawPrice: bigint;
  readonly timestamp: bigint;
  readonly stablePrice: bigint;
}

interface LegacyDependencies {
  readonly Rpc: new (url: string) => LegacyRpc;
  readonly loadDeployment: (path: string) => LegacyDeployment;
  readonly extractOrderKey: (result: string) => `0x${string}` | null;
  readonly buildDecreaseOrder: (input: Record<string, unknown>) => Record<string, unknown>;
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
  readonly checkConservation: (deltas: Record<string, bigint | null>) => unknown;
  readonly orderListKey: string;
  readonly calldata: (signature: string, params: unknown[]) => `0x${string}`;
  readonly createOrderSignature: string;
  readonly priceFeedKey: (token: string) => string;
  readonly priceFeedMultiplierKey: (token: string) => string;
  readonly priceFeedHeartbeatDurationKey: (token: string) => string;
  readonly stablePriceKey: (token: string) => string;
  readonly oracleProviderForTokenKey: (oracle: string, token: string) => string;
  readonly fetchEmitterEvents: (
    rpc: LegacyRpc,
    input: { emitter: string; fromBlock: number; toBlock: number; eventName: string },
  ) => Promise<DecodedEvent[]>;
  readonly fetchExecutionEvents: (
    context: {
      rpc: LegacyRpc;
      a: LegacyDeployment['addresses'];
      marketIndex: number;
      isLong: boolean;
    },
    input: { fromBlock: number; toBlock: number; orderKey: string; extraNames: string[] },
  ) => Promise<Record<string, DecodedEvent | DecodedEvent[] | null>>;
}

interface TenderlyForkAdapter {
  readonly rpcUrl: string;
  readonly adminTransactions: AdminReceipt[];
  call(method: string, params?: readonly unknown[]): Promise<unknown>;
  ethCall(to: string, signature: string, params: unknown[], block?: string): Promise<string>;
  send(input: {
    from: string;
    to?: string | null;
    data: string;
    value?: bigint;
    label?: string;
  }): Promise<AdminReceipt>;
  mustSend(input: {
    from: string;
    to?: string | null;
    data: string;
    value?: bigint;
    label?: string;
  }): Promise<AdminReceipt>;
  setBalance(address: string, wei: bigint): Promise<void>;
}

export interface Scn010Evidence {
  readonly scenarioId: 'SCN-010';
  readonly runMode: 'oracle-fork-private-key-market-bundle';
  readonly coverage: {
    readonly executed: string[];
    readonly pending: string[];
    readonly completeScenario: boolean;
  };
  readonly environment: Record<string, unknown>;
  readonly testData: Record<string, string | number | boolean>;
  readonly prices: Record<string, unknown>;
  readonly snapshots: {
    readonly before: LegacySnapshot;
    readonly afterCreate: LegacySnapshot;
    readonly afterOpen: LegacySnapshot;
    readonly afterCreateClose: LegacySnapshot;
    readonly afterClose: LegacySnapshot;
  };
  readonly deltas: Record<string, Record<string, bigint | null>>;
  readonly transactions: Record<string, unknown>;
  readonly events: Record<string, unknown>;
  readonly assertions: Array<{ name: string; passed: boolean; actual: unknown; expected: unknown }>;
  readonly observations: Record<string, unknown>;
  readonly parameters: Record<string, unknown>;
}

const SIZE_USD = 50n * 10n ** 30n;
const EXECUTION_FEE = 20_000_000_000_000n;
const MAX_UINT256 = 2n ** 256n - 1n;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ZERO_BYTES32 = `0x${'0'.repeat(64)}`;

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
  const [rpcModule, deploymentModule, actionsModule, ledgerModule, keysModule, castModule,
    flowsModule, eventsModule, scenarioModule] = await Promise.all([
    importFile<{ Rpc: LegacyDependencies['Rpc'] }>(legacyPath('tool/config-dump/lib/rpc.mjs')),
    importFile<{ loadDeployment: LegacyDependencies['loadDeployment'] }>(legacyPath('tool/onchain-tx/lib/deployment.mjs')),
    importFile<Pick<LegacyDependencies, 'extractOrderKey' | 'buildDecreaseOrder' | 'orderIsPending'>>(
      legacyPath('integration/lib/actions.mjs'),
    ),
    importFile<Pick<LegacyDependencies, 'snapshot' | 'diff' | 'checkConservation'>>(
      legacyPath('tool/onchain-tx/lib/ledger.mjs'),
    ),
    importFile<{
      BASE: { ORDER_LIST: string };
      priceFeedKey: LegacyDependencies['priceFeedKey'];
      priceFeedMultiplierKey: LegacyDependencies['priceFeedMultiplierKey'];
      priceFeedHeartbeatDurationKey: LegacyDependencies['priceFeedHeartbeatDurationKey'];
      stablePriceKey: LegacyDependencies['stablePriceKey'];
      oracleProviderForTokenKey: LegacyDependencies['oracleProviderForTokenKey'];
    }>(legacyPath('tool/onchain-tx/lib/keys.mjs')),
    importFile<{ calldata: LegacyDependencies['calldata'] }>(legacyPath('tool/onchain-tx/lib/cast.mjs')),
    importFile<{ CREATE_ORDER_SIG: string }>(legacyPath('tool/onchain-tx/lib/flows.mjs')),
    importFile<Pick<LegacyDependencies, 'fetchEmitterEvents'>>(legacyPath('integration/lib/events.mjs')),
    importFile<Pick<LegacyDependencies, 'fetchExecutionEvents'>>(legacyPath('integration/lib/scenario.mjs')),
  ]);

  return {
    ...rpcModule,
    ...deploymentModule,
    ...actionsModule,
    ...ledgerModule,
    ...castModule,
    ...eventsModule,
    ...scenarioModule,
    priceFeedKey: keysModule.priceFeedKey,
    priceFeedMultiplierKey: keysModule.priceFeedMultiplierKey,
    priceFeedHeartbeatDurationKey: keysModule.priceFeedHeartbeatDurationKey,
    stablePriceKey: keysModule.stablePriceKey,
    oracleProviderForTokenKey: keysModule.oracleProviderForTokenKey,
    orderListKey: keysModule.BASE.ORDER_LIST,
    createOrderSignature: flowsModule.CREATE_ORDER_SIG,
  };
}

function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

function check(
  assertions: Scn010Evidence['assertions'],
  name: string,
  passed: boolean,
  actual: unknown,
  expected: unknown,
): void {
  assertions.push({ name, passed, actual, expected });
  if (!passed) throw new Error(`${name}：实际 ${String(actual)}，期望 ${String(expected)}`);
}

function positionOf(snapshotValue: LegacySnapshot): LegacyPosition | undefined {
  const position = snapshotValue.values.position;
  return position && position.exists ? position : undefined;
}

function eventKey(event: DecodedEvent): string | undefined {
  return event.bytes32?.orderKey ?? event.bytes32?.key;
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

function asHexString(value: unknown, label: string): `0x${string}` {
  if (typeof value !== 'string' || !value.startsWith('0x')) {
    throw new Error(`${label} 未返回 hex`);
  }
  return value as `0x${string}`;
}

async function rpcPost(
  url: string,
  method: string,
  params: readonly unknown[] = [],
): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const body = await response.json() as {
    result?: unknown;
    error?: { message?: string; data?: unknown };
  };
  if (body.error) {
    const error = new Error(`${method}: ${body.error.message ?? 'unknown RPC error'}`) as Error & { data?: unknown };
    error.data = body.error.data;
    throw error;
  }
  return body.result;
}

async function waitForRawReceipt(url: string, hash: `0x${string}`): Promise<Record<string, unknown>> {
  for (let index = 0; index < 120; index += 1) {
    const value = await rpcPost(url, 'eth_getTransactionReceipt', [hash]);
    if (value && typeof value === 'object') return value as Record<string, unknown>;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error(`交易 ${hash} 60 秒内未返回回执`);
}

function createTenderlyForkAdapter(
  url: string,
  deps: Pick<LegacyDependencies, 'calldata'>,
): TenderlyForkAdapter {
  const adminTransactions: AdminReceipt[] = [];
  const adapter: TenderlyForkAdapter = {
    rpcUrl: url,
    adminTransactions,
    call: (method, params = []) => rpcPost(url, method, params),
    async ethCall(to, signature, params, block = 'latest') {
      return asHexString(await rpcPost(url, 'eth_call', [{ to, data: deps.calldata(signature, params) }, block]), signature);
    },
    async send({ from, to, data, value = 0n, label = '' }) {
      const tx: Record<string, unknown> = {
        from,
        data,
        value: toHex(value),
        gas: toHex(30_000_000n),
      };
      if (to) tx.to = to;
      const hash = asHexString(await rpcPost(url, 'eth_sendTransaction', [tx]), label || 'eth_sendTransaction');
      const rawReceipt = await waitForRawReceipt(url, hash);
      const status = BigInt(String(rawReceipt.status ?? '0x0')) === 1n ? 'success' : 'reverted';
      const result: AdminReceipt = {
        txHash: hash,
        blockNumber: Number(BigInt(String(rawReceipt.blockNumber ?? '0x0'))),
        status,
        gasUsed: BigInt(String(rawReceipt.gasUsed ?? '0x0')).toString(),
        label,
        ...(typeof rawReceipt.contractAddress === 'string'
          ? { contractAddress: rawReceipt.contractAddress }
          : {}),
      };
      adminTransactions.push(result);
      return result;
    },
    async mustSend(input) {
      const result = await adapter.send(input);
      if (result.status !== 'success') {
        throw new Error(`${result.label || result.txHash} 执行失败（${result.txHash}）`);
      }
      return result;
    },
    async setBalance(address, wei) {
      const current = BigInt(asHexString(await rpcPost(url, 'eth_getBalance', [address, 'latest']), 'eth_getBalance'));
      if (current >= wei) return;
      await rpcPost(url, 'tenderly_setBalance', [[address], toHex(wei)]);
    },
  };
  return adapter;
}

function buildLimitIncreaseMulticall(
  deps: Pick<LegacyDependencies, 'calldata' | 'createOrderSignature'>,
  input: {
    exchangeRouter: string;
    orderVault: string;
    collateralToken: string;
    account: string;
    marketIndex: number;
    collateralAmount: bigint;
    triggerPrice: bigint;
  },
): { to: string; data: `0x${string}`; value: string; label: string } {
  const addresses = `(${input.account},${input.account},${ZERO_ADDRESS},${ZERO_ADDRESS})`;
  const numbers = `(${input.marketIndex},${SIZE_USD},${input.collateralAmount},${input.triggerPrice},${MAX_UINT256},${EXECUTION_FEE},0,0,0)`;
  const params = `(${addresses},${numbers},1,true,false,true,${ZERO_BYTES32},[])`;
  const parts = [
    deps.calldata('sendWnt(address,uint256)', [input.orderVault, EXECUTION_FEE]),
    deps.calldata('sendTokens(address,address,uint256)', [input.collateralToken, input.orderVault, input.collateralAmount]),
    deps.calldata(deps.createOrderSignature, [params]),
  ];
  return {
    to: input.exchangeRouter,
    data: deps.calldata('multicall(bytes[])', [`[${parts.join(',')}]`]),
    value: EXECUTION_FEE.toString(),
    label: 'LimitIncrease long：P-10% 挂单',
  };
}

function oracleParamsLiteral(params: {
  readonly tokens: readonly string[];
  readonly providers: readonly string[];
  readonly data: readonly string[];
}): string {
  return `([${params.tokens.join(',')}],[${params.providers.join(',')}],[${params.data.join(',')}])`;
}

function buildExecuteOrder(
  deps: Pick<LegacyDependencies, 'calldata'>,
  deployment: LegacyDeployment,
  orderKey: string,
  oracleParams: { readonly tokens: string[]; readonly providers: string[]; readonly data: string[] },
): { to: string; data: `0x${string}`; value: bigint } {
  return {
    to: deployment.addresses.orderHandler,
    data: deps.calldata('executeOrder(bytes32,(address[],address[],bytes[]))', [
      orderKey,
      oracleParamsLiteral(oracleParams),
    ]),
    value: 0n,
  };
}

async function sendSigned(
  runtime: RuntimeConfig,
  rpc: LegacyRpc,
  privateKey: `0x${string}`,
  expectedAddress: `0x${string}`,
  input: { to: string; data: string; value?: bigint },
  extractOrderKey?: LegacyDependencies['extractOrderKey'],
): Promise<SentTransaction> {
  const account = privateKeyToAccount(privateKey);
  if (getAddress(account.address) !== getAddress(expectedAddress)) {
    throw new Error(`签名私钥地址与配置地址 ${expectedAddress} 不匹配`);
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
  const to = input.to as `0x${string}`;
  const data = input.data as `0x${string}`;
  const value = input.value ?? 0n;
  const simulatedResult = asHexString(await rpc.single('eth_call', [{
    from: account.address,
    to,
    data,
    value: toHex(value),
  }, 'latest']), '签名交易预执行');
  const hash = await wallet.sendTransaction({ account, chain, to, data, value });
  const txReceipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  return {
    ok: txReceipt.status === 'success',
    txHash: hash,
    blockNumber: Number(txReceipt.blockNumber),
    gasUsed: txReceipt.gasUsed.toString(),
    simulatedResult,
    ...(extractOrderKey ? { orderKey: extractOrderKey(simulatedResult) } : {}),
  };
}

async function blockNumber(rpc: LegacyRpc): Promise<number> {
  return Number(BigInt(asHexString(await rpc.single('eth_blockNumber', []), 'eth_blockNumber')));
}

async function takeSnapshot(
  deps: Pick<LegacyDependencies, 'snapshot'>,
  rpc: LegacyRpc,
  deployment: LegacyDeployment,
  trader: string,
  marketIndex: number,
  atBlock?: number,
): Promise<LegacySnapshot> {
  return deps.snapshot(
    rpc,
    deployment,
    { trader, marketIndex, isLong: true },
    atBlock ?? await blockNumber(rpc),
  );
}

async function transaction(rpc: LegacyRpc, hash: string): Promise<unknown> {
  return rpc.single('eth_getTransactionByHash', [hash]);
}

async function receipt(rpc: LegacyRpc, hash: string): Promise<unknown> {
  return rpc.single('eth_getTransactionReceipt', [hash]);
}

function decodeAddressWord(hex: string): string {
  return `0x${hex.replace(/^0x/, '').slice(-40)}`.toLowerCase();
}

function decodeUint(hex: string): bigint {
  return hex === '0x' ? 0n : BigInt(hex);
}

function formatInternalUsd(value: bigint, tokenDecimals: number): string {
  const precision = 30 - tokenDecimals;
  const divisor = 10n ** BigInt(precision);
  const whole = value / divisor;
  const fraction = (value % divisor).toString().padStart(precision, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function decodeWord(hex: string, index: number): bigint {
  const body = hex.replace(/^0x/, '');
  const word = body.slice(index * 64, (index + 1) * 64);
  if (word.length !== 64) throw new Error(`ABI 返回值缺少第 ${index} 个 word。`);
  return BigInt(`0x${word}`);
}

async function latestBlockTimestamp(fork: TenderlyForkAdapter): Promise<bigint> {
  const block = await fork.call('eth_getBlockByNumber', ['latest', false]) as { timestamp?: string } | null;
  if (!block?.timestamp) throw new Error('无法读取最新区块时间。');
  return BigInt(block.timestamp);
}

async function readMockOracleState(
  fork: TenderlyForkAdapter,
  deps: Pick<LegacyDependencies, 'stablePriceKey'>,
  deployment: LegacyDeployment,
  token: string,
  oracle: string,
): Promise<MockOracleState> {
  const [roundData, stablePrice] = await Promise.all([
    fork.ethCall(oracle, 'latestRoundData()', []),
    fork.ethCall(deployment.addresses.dataStore, 'getUint(bytes32)', [deps.stablePriceKey(token)]),
  ]);
  return {
    token: token.toLowerCase(),
    oracle: oracle.toLowerCase(),
    rawPrice: decodeWord(roundData, 1),
    timestamp: decodeWord(roundData, 3),
    stablePrice: decodeUint(stablePrice),
  };
}

async function writeMockOracleState(
  fork: TenderlyForkAdapter,
  deps: Pick<LegacyDependencies, 'calldata' | 'stablePriceKey'>,
  deployment: LegacyDeployment,
  admin: string,
  state: MockOracleState,
  label: string,
): Promise<void> {
  await fork.mustSend({
    from: admin,
    to: state.oracle,
    data: deps.calldata('setMockPrice(uint256,uint256)', [state.rawPrice, state.timestamp]),
    label: `${label} PriceFeed`,
  });
  await fork.mustSend({
    from: admin,
    to: deployment.addresses.dataStore,
    data: deps.calldata('setUint(bytes32,uint256)', [deps.stablePriceKey(state.token), state.stablePrice]),
    label: `${label} StablePrice`,
  });
}

function sameMockOracleState(actual: MockOracleState, expected: MockOracleState): boolean {
  return actual.token === expected.token
    && actual.oracle === expected.oracle
    && actual.rawPrice === expected.rawPrice
    && actual.timestamp === expected.timestamp
    && actual.stablePrice === expected.stablePrice;
}

async function readOracleConfig(
  fork: TenderlyForkAdapter,
  deps: Pick<LegacyDependencies,
    'priceFeedKey' | 'priceFeedMultiplierKey' | 'priceFeedHeartbeatDurationKey' | 'oracleProviderForTokenKey'
  >,
  deployment: LegacyDeployment,
  token: string,
): Promise<OracleConfig> {
  const dataStore = deployment.addresses.dataStore;
  const [feed, multiplier, heartbeat, provider] = await Promise.all([
    fork.ethCall(dataStore, 'getAddress(bytes32)', [deps.priceFeedKey(token)]),
    fork.ethCall(dataStore, 'getUint(bytes32)', [deps.priceFeedMultiplierKey(token)]),
    fork.ethCall(dataStore, 'getUint(bytes32)', [deps.priceFeedHeartbeatDurationKey(token)]),
    fork.ethCall(dataStore, 'getAddress(bytes32)', [
      deps.oracleProviderForTokenKey(deployment.addresses.oracle, token),
    ]),
  ]);
  return {
    token: token.toLowerCase(),
    priceFeed: decodeAddressWord(feed),
    multiplier: decodeUint(multiplier),
    heartbeat: decodeUint(heartbeat),
    provider: decodeAddressWord(provider),
  };
}

export async function runScn010(runtime: RuntimeConfig): Promise<Scn010Evidence> {
  if (!runtime.testAccount || !runtime.keeperAccount || !runtime.adminAccount) {
    throw new Error('SCN-010 需要 E2E_TEST_ACCOUNT、E2E_KEEPER_ACCOUNT 与 E2E_ADMIN_ACCOUNT');
  }
  if (!runtime.testPrivateKey || !runtime.secondaryTestPrivateKey) {
    throw new Error('SCN-010 必须配置用户与 Keeper 私钥，不能用账户模拟代替业务交易');
  }

  const deps = await loadLegacyDependencies();
  const deploymentDir = deploymentPath();
  const baseDeployment = deps.loadDeployment(deploymentDir);
  const mockResourceAlias = process.env.E2E_MARKET_RESOURCE_ALIAS ?? 'default-mock';
  const resource = await resolveMockMarketBundle(runtime.environment, mockResourceAlias);
  if (!resource.market?.marketIndex || resource.market.status !== 'registered'
    || !resource.token || !resource.oracle || !resource.collateralToken || !resource.collateralOracle
    || resource.oracleMode?.index !== 'mock' || resource.oracleMode.collateral !== 'mock'
    || !resource.oracleMode.inlineKeeperReady) {
    throw new Error(`${runtime.environment}/${mockResourceAlias} 不是可执行的双 Mock Oracle Market Bundle；请重新初始化环境。`);
  }
  if (resource.token.decimals > 30) throw new Error('SCN-010 暂不支持 decimals > 30 的 Index Token。');
  const marketIndex = resource.market.marketIndex;
  const indexToken = getAddress(resource.token.address);
  const collateralToken = getAddress(resource.collateralToken.address);
  const indexOracle = getAddress(resource.oracle.address);
  const collateralOracle = getAddress(resource.collateralOracle.address);
  const collateralAmount = 10n * 10n ** BigInt(resource.collateralToken.decimals);
  const startMinPrice = requireValue(resource.oracle.minPrice, 'default-mock 未记录 Index Oracle minPrice');
  const startMaxPrice = requireValue(resource.oracle.maxPrice, 'default-mock 未记录 Index Oracle maxPrice');
  const startPrice = BigInt(startMaxPrice);
  const triggerPrice = startPrice * 90n / 100n;
  const triggerRawPrice = BigInt(resource.oracle.initialPrice) * 90n / 100n;
  const collateralPrice = BigInt(requireValue(resource.collateralOracle.maxPrice, 'default-mock 未记录 USDC Oracle maxPrice'));
  const deployment: LegacyDeployment = {
    ...baseDeployment,
    addresses: { ...baseDeployment.addresses, usdc: collateralToken },
  };
  const rpc = new deps.Rpc(runtime.rpcUrl);
  const fork = createTenderlyForkAdapter(runtime.adminRpcUrl ?? runtime.rpcUrl, deps);
  const assertions: Scn010Evidence['assertions'] = [];
  const originalOracleConfigs = await Promise.all([
    readOracleConfig(fork, deps, deployment, indexToken),
    readOracleConfig(fork, deps, deployment, collateralToken),
  ]);
  if (getAddress(originalOracleConfigs[0]!.priceFeed) !== indexOracle
    || getAddress(originalOracleConfigs[1]!.priceFeed) !== collateralOracle) {
    throw new Error('Market Bundle 登记的 Mock Oracle 与 DataStore 当前 PriceFeed 不一致。');
  }
  const originalOracleStates = await Promise.all([
    readMockOracleState(fork, deps, deployment, indexToken, indexOracle),
    readMockOracleState(fork, deps, deployment, collateralToken, collateralOracle),
  ]);
  const setupStart = fork.adminTransactions.length;
  let restoreStart = -1;
  let mutationStarted = false;
  let restoredStates: MockOracleState[] = [];
  let core: Omit<Scn010Evidence, 'transactions'> & { transactions: Record<string, unknown> } | undefined;
  let primaryError: unknown;
  let restoreError: unknown;

  try {
    mutationStarted = true;
    const baselineTimestamp = await latestBlockTimestamp(fork);
    await writeMockOracleState(fork, deps, deployment, runtime.adminAccount, {
      token: indexToken,
      oracle: indexOracle,
      rawPrice: BigInt(resource.oracle.initialPrice),
      timestamp: baselineTimestamp,
      stablePrice: startPrice,
    }, '设置 Index Oracle 基线');
    await writeMockOracleState(fork, deps, deployment, runtime.adminAccount, {
      token: collateralToken,
      oracle: collateralOracle,
      rawPrice: BigInt(resource.collateralOracle.initialPrice),
      timestamp: baselineTimestamp,
      stablePrice: collateralPrice,
    }, '设置 USDC Oracle 基线');
    const oracleParams = {
      tokens: [indexToken, collateralToken],
      providers: originalOracleConfigs.map((item) => item.provider),
      data: ['0x', '0x'],
    };
    const before = await takeSnapshot(deps, rpc, deployment, runtime.testAccount, marketIndex);
    check(assertions, 'before 账本无缺失读数', before.errors.length === 0, before.errors, []);
    check(assertions, '执行前无 default-mock 多仓', !positionOf(before), Boolean(positionOf(before)), false);

    const createLimitInput = buildLimitIncreaseMulticall(deps, {
      exchangeRouter: deployment.addresses.exchangeRouter,
      orderVault: deployment.addresses.orderVault,
      collateralToken,
      account: runtime.testAccount,
      marketIndex,
      collateralAmount,
      triggerPrice,
    });
    const createLimit = await sendSigned(
      runtime,
      rpc,
      runtime.testPrivateKey,
      runtime.testAccount,
      { ...createLimitInput, value: BigInt(createLimitInput.value) },
      deps.extractOrderKey,
    );
    check(assertions, '限价开多创建交易成功', createLimit.ok, createLimit.txHash, 'success');
    const openOrderKey = requireValue(createLimit.orderKey, '限价单创建交易未解出 orderKey');
    const pendingAtCreateBlock = await deps.orderIsPending(rpc, {
      dataStore: deployment.addresses.dataStore,
      orderListKey: deps.orderListKey,
      orderKey: openOrderKey,
      block: createLimit.blockNumber,
    });
    const pendingBeforeTrigger = await deps.orderIsPending(rpc, {
      dataStore: deployment.addresses.dataStore,
      orderListKey: deps.orderListKey,
      orderKey: openOrderKey,
    });
    check(assertions, '创建块订单进入挂单列表', pendingAtCreateBlock, pendingAtCreateBlock, true);
    check(assertions, '价格未触发时订单保持 pending', pendingBeforeTrigger, pendingBeforeTrigger, true);

    const afterCreate = await takeSnapshot(deps, rpc, deployment, runtime.testAccount, marketIndex);
    check(assertions, '未触发时无仓位', !positionOf(afterCreate), Boolean(positionOf(afterCreate)), false);
    check(
      assertions,
      '未触发时累计多头开仓成本不变',
      afterCreate.values.cumulativeOpenCostsLong === before.values.cumulativeOpenCostsLong,
      afterCreate.values.cumulativeOpenCostsLong,
      before.values.cumulativeOpenCostsLong,
    );
    check(assertions, '触发价等于当前价 P 的 90%', triggerPrice === startPrice * 90n / 100n, triggerPrice, startPrice * 90n / 100n);

    await writeMockOracleState(fork, deps, deployment, runtime.adminAccount, {
      token: indexToken,
      oracle: indexOracle,
      rawPrice: triggerRawPrice,
      timestamp: await latestBlockTimestamp(fork),
      stablePrice: triggerPrice,
    }, '设置 Index Oracle 触发价');
    const executeLimitInput = buildExecuteOrder(deps, deployment, openOrderKey, oracleParams);
    const executeLimit = await sendSigned(
      runtime,
      rpc,
      runtime.secondaryTestPrivateKey,
      runtime.keeperAccount,
      executeLimitInput,
    );
    check(assertions, 'Keeper 触发限价开多交易成功', executeLimit.ok, executeLimit.txHash, 'success');
    const pendingAfterTrigger = await deps.orderIsPending(rpc, {
      dataStore: deployment.addresses.dataStore,
      orderListKey: deps.orderListKey,
      orderKey: openOrderKey,
    });
    check(assertions, '到达 trigger 后订单离开挂单列表', !pendingAfterTrigger, pendingAfterTrigger, false);

    const afterOpen = await takeSnapshot(deps, rpc, deployment, runtime.testAccount, marketIndex);
    const openedPosition = requireValue(positionOf(afterOpen), '限价单离队后多头仓位不存在（可能被静默取消）');
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
    check(assertions, '触发后建立多头仓位', openedPosition.isLong, openedPosition.isLong, true);
    check(assertions, '触发后仓位规模为 50 USD', openedPosition.sizeInUsd === SIZE_USD, openedPosition.sizeInUsd, SIZE_USD);
    check(
      assertions,
      '限价开仓 Grace 按执行区块当前参数复算',
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

    const createCloseInput = deps.buildDecreaseOrder({
      exchangeRouter: deployment.addresses.exchangeRouter,
      orderVault: deployment.addresses.orderVault,
      account: runtime.testAccount,
      marketIndex,
      isLong: true,
      sizeDeltaUsd: openedPosition.sizeInUsd,
      collateralDelta: 0n,
      executionFee: EXECUTION_FEE,
    });
    const createClose = await sendSigned(
      runtime,
      rpc,
      runtime.testPrivateKey,
      runtime.testAccount,
      {
        to: String(createCloseInput.to),
        data: String(createCloseInput.data),
        value: BigInt(String(createCloseInput.value ?? '0')),
      },
      deps.extractOrderKey,
    );
    check(assertions, '全平创建交易成功', createClose.ok, createClose.txHash, 'success');
    const closeOrderKey = requireValue(createClose.orderKey, '全平交易未解出 orderKey');
    const afterCreateClose = await takeSnapshot(
      deps,
      rpc,
      deployment,
      runtime.testAccount,
      marketIndex,
      createClose.blockNumber,
    );
    const executeCloseInput = buildExecuteOrder(deps, deployment, closeOrderKey, oracleParams);
    const executeClose = await sendSigned(
      runtime,
      rpc,
      runtime.secondaryTestPrivateKey,
      runtime.keeperAccount,
      executeCloseInput,
    );
    check(assertions, 'Keeper 执行全平交易成功', executeClose.ok, executeClose.txHash, 'success');

    const afterClose = await takeSnapshot(deps, rpc, deployment, runtime.testAccount, marketIndex);
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
    check(
      assertions,
      '累计多头开仓成本回到执行前数值',
      afterClose.values.cumulativeOpenCostsLong === before.values.cumulativeOpenCostsLong,
      afterClose.values.cumulativeOpenCostsLong,
      before.values.cumulativeOpenCostsLong,
    );

    const [orderCreatedEvents, orderExecutedEvents, openEvents, closeEvents] = await Promise.all([
      deps.fetchEmitterEvents(rpc, {
        emitter: deployment.addresses.eventEmitter,
        fromBlock: createLimit.blockNumber,
        toBlock: afterOpen.blockNumber,
        eventName: 'OrderCreated',
      }),
      deps.fetchEmitterEvents(rpc, {
        emitter: deployment.addresses.eventEmitter,
        fromBlock: createLimit.blockNumber,
        toBlock: afterClose.blockNumber,
        eventName: 'OrderExecuted',
      }),
      deps.fetchExecutionEvents(
        { rpc, a: deployment.addresses, marketIndex, isLong: true },
        {
          fromBlock: createLimit.blockNumber,
          toBlock: afterOpen.blockNumber,
          orderKey: openOrderKey,
          extraNames: ['PositionIncrease'],
        },
      ),
      deps.fetchExecutionEvents(
        { rpc, a: deployment.addresses, marketIndex, isLong: true },
        {
          fromBlock: createClose.blockNumber,
          toBlock: afterClose.blockNumber,
          orderKey: closeOrderKey,
          extraNames: ['PositionDecrease'],
        },
      ),
    ]);
    const createdMatches = orderCreatedEvents.filter((event) => eventKey(event)?.toLowerCase() === openOrderKey.toLowerCase());
    const openExecutedMatches = orderExecutedEvents.filter((event) => eventKey(event)?.toLowerCase() === openOrderKey.toLowerCase());
    const closeExecutedMatches = orderExecutedEvents.filter((event) => eventKey(event)?.toLowerCase() === closeOrderKey.toLowerCase());
    check(assertions, '限价单恰好一条 OrderCreated 证据', createdMatches.length === 1, createdMatches.length, 1);
    check(assertions, '限价单恰好一条 OrderExecuted 证据', openExecutedMatches.length === 1, openExecutedMatches.length, 1);
    check(assertions, '全平单恰好一条 OrderExecuted 证据', closeExecutedMatches.length === 1, closeExecutedMatches.length, 1);

    const positionIncrease = openEvents.PositionIncrease as DecodedEvent | null;
    const positionDecrease = closeEvents.PositionDecrease as DecodedEvent | null;
    const increaseUint = requireValue(positionIncrease?.uint, '缺少 PositionIncrease 数值字段');
    const decreaseUint = requireValue(positionDecrease?.uint, '缺少 PositionDecrease 数值字段');
    const executionPrice = requireValue(increaseUint.executionPrice, 'PositionIncrease 缺少 executionPrice');
    const oracleMax = requireValue(increaseUint['indexTokenPrice.max'], 'PositionIncrease 缺少 indexTokenPrice.max');
    const expectedSizeInTokens = SIZE_USD / executionPrice;
    check(assertions, '执行事件订单类型为 LimitIncrease(1)', increaseUint.orderType === 1n, increaseUint.orderType, 1n);
    check(assertions, '触发执行使用 Mock Oracle 的 trigger 价格', oracleMax === triggerPrice, oracleMax, triggerPrice);
    check(assertions, '开多成交价使用不利侧且不低于 Oracle max', executionPrice >= oracleMax, executionPrice, `>= ${oracleMax}`);
    check(assertions, 'sizeInTokens 按成交价换算', openedPosition.sizeInTokens === expectedSizeInTokens, openedPosition.sizeInTokens, expectedSizeInTokens);
    check(assertions, 'PositionIncrease 的 token 增量与仓位一致', increaseUint.sizeDeltaInTokens === openedPosition.sizeInTokens, increaseUint.sizeDeltaInTokens, openedPosition.sizeInTokens);
    check(
      assertions,
      '平多成交价使用不利侧且不高于 Oracle min',
      decreaseUint.executionPrice !== undefined
        && decreaseUint['indexTokenPrice.min'] !== undefined
        && decreaseUint.executionPrice <= decreaseUint['indexTokenPrice.min'],
      `${decreaseUint.executionPrice}/${decreaseUint['indexTokenPrice.min']}`,
      'executionPrice <= oracle min',
    );

    const [createLimitTx, createLimitReceipt, executeLimitTx, executeLimitReceipt,
      createCloseTx, createCloseReceipt, executeCloseTx, executeCloseReceipt] = await Promise.all([
      transaction(rpc, createLimit.txHash), receipt(rpc, createLimit.txHash),
      transaction(rpc, executeLimit.txHash), receipt(rpc, executeLimit.txHash),
      transaction(rpc, createClose.txHash), receipt(rpc, createClose.txHash),
      transaction(rpc, executeClose.txHash), receipt(rpc, executeClose.txHash),
    ]);
    const trader = runtime.testAccount.toLowerCase();
    const keeper = runtime.keeperAccount.toLowerCase();
    check(
      assertions,
      '两笔用户交易均由测试用户地址签名',
      transactionFrom(createLimitTx) === trader && transactionFrom(createCloseTx) === trader,
      `${transactionFrom(createLimitTx)}/${transactionFrom(createCloseTx)}`,
      trader,
    );
    check(
      assertions,
      '两笔执行交易均由 ORDER_KEEPER 地址签名',
      transactionFrom(executeLimitTx) === keeper && transactionFrom(executeCloseTx) === keeper,
      `${transactionFrom(executeLimitTx)}/${transactionFrom(executeCloseTx)}`,
      keeper,
    );
    check(
      assertions,
      '四笔业务交易均包含非零签名字段',
      [createLimitTx, executeLimitTx, createCloseTx, executeCloseTx].every(hasSignature),
      [createLimitTx, executeLimitTx, createCloseTx, executeCloseTx].map(hasSignature),
      [true, true, true, true],
    );
    check(
      assertions,
      '四笔业务交易回执均成功',
      [createLimitReceipt, executeLimitReceipt, createCloseReceipt, executeCloseReceipt].every(successfulReceipt),
      [createLimitReceipt, executeLimitReceipt, createCloseReceipt, executeCloseReceipt].map(successfulReceipt),
      [true, true, true, true],
    );

    const createDelta = deps.diff(before, afterCreate);
    const openDelta = deps.diff(afterCreate, afterOpen);
    const createCloseDelta = deps.diff(afterOpen, afterCreateClose);
    const executeCloseDelta = deps.diff(afterCreateClose, afterClose);
    const closeDelta = deps.diff(afterOpen, afterClose);
    const wholeFlowDelta = deps.diff(before, afterClose);
    core = {
      scenarioId: 'SCN-010',
      runMode: 'oracle-fork-private-key-market-bundle',
      coverage: {
        executed: [
          `oracle-fork 的 ${mockResourceAlias} Market Bundle`,
          'Index 与 USDC 双 Mock Oracle，Index P 精确下调 10%',
          '用户私钥签名创建 LimitIncrease 多单',
          '未触发 pending/无仓位/OI 不变核对',
          'ORDER_KEEPER 私钥签名触发执行',
          '用户与 Keeper 私钥签名全平',
          'Reader/账本/事件/余额证据',
          'Oracle 价格与 StablePrice 恢复',
        ],
        pending: ['浏览器钱包内从页面输入参数并点击签名', '页面订单历史与链上事件逐条核对'],
        completeScenario: false,
      },
      environment: {
        deployment: deployment.name,
        chainId: runtime.chainId,
        rpcHost: new URL(runtime.rpcUrl).host,
        forkDisplayName: runtime.forkDisplayName,
        forkBlockNumber: before.blockNumber,
        marketIndex,
        bundleId: resource.market.bundleId,
        mockResourceAlias,
        marketToken: indexToken,
        collateralToken,
        trader: runtime.testAccount,
        keeper: runtime.keeperAccount,
        admin: runtime.adminAccount,
        signingMode: 'private-key',
        oracleMode: 'bundle-double-mock-restored',
        resetMode: process.env.E2E_PERSIST_FORK_STATE === 'true' ? 'persistent-no-revert' : runtime.forkResetMode,
      },
      testData: {
        orderType: 'LimitIncrease(1)',
        collateralUsdc: '10',
        leverage: '5x',
        sizeUsd: '50',
        startPriceUsd: formatInternalUsd(startPrice, resource.token.decimals),
        triggerPriceUsd: formatInternalUsd(triggerPrice, resource.token.decimals),
        triggerPercent: '-10%',
        executionFeeEth: '0.00002',
        isLong: true,
      },
      parameters: { open: openParameterSnapshot, close: closeParameterSnapshot },
      prices: {
        startMinPrice: BigInt(startMinPrice),
        startPrice,
        triggerPrice,
        collateralPrice,
        tokenDecimals: resource.token.decimals,
        controlledFeeds: {
          index: { token: indexToken, oracle: indexOracle, provider: originalOracleConfigs[0]?.provider },
          collateral: { token: collateralToken, oracle: collateralOracle, provider: originalOracleConfigs[1]?.provider },
        },
        originalOracleConfigs,
        originalOracleStates,
      },
      snapshots: { before, afterCreate, afterOpen, afterCreateClose, afterClose },
      deltas: {
        create: createDelta,
        open: openDelta,
        createClose: createCloseDelta,
        executeClose: executeCloseDelta,
        close: closeDelta,
        wholeFlow: wholeFlowDelta,
      },
      transactions: {
        createLimit: { ...createLimit, orderKey: openOrderKey, transaction: createLimitTx, receipt: createLimitReceipt },
        executeLimit: { ...executeLimit, orderKey: openOrderKey, transaction: executeLimitTx, receipt: executeLimitReceipt },
        createClose: { ...createClose, orderKey: closeOrderKey, transaction: createCloseTx, receipt: createCloseReceipt },
        executeClose: { ...executeClose, orderKey: closeOrderKey, transaction: executeCloseTx, receipt: executeCloseReceipt },
      },
      events: {
        limit: { OrderCreated: createdMatches[0], OrderExecuted: openExecutedMatches[0], ...openEvents },
        close: { OrderExecuted: closeExecutedMatches[0], ...closeEvents },
      },
      assertions,
      observations: {
        expectedSizeInTokens,
        executionPrice,
        triggerOraclePrice: oracleMax,
        createConservation: deps.checkConservation(createDelta),
        openConservation: deps.checkConservation(openDelta),
        createCloseConservation: deps.checkConservation(createCloseDelta),
        executeCloseConservation: deps.checkConservation(executeCloseDelta),
        closeConservation: deps.checkConservation(closeDelta),
        wholeFlowConservation: deps.checkConservation(wholeFlowDelta),
      },
    };
  } catch (error) {
    primaryError = error;
  } finally {
    if (mutationStarted) {
      restoreStart = fork.adminTransactions.length;
      try {
        for (const [index, state] of originalOracleStates.entries()) {
          await writeMockOracleState(
            fork,
            deps,
            deployment,
            runtime.adminAccount,
            state,
            `恢复 ${index === 0 ? 'Index' : 'USDC'} Oracle`,
          );
        }
        restoredStates = await Promise.all([
          readMockOracleState(fork, deps, deployment, indexToken, indexOracle),
          readMockOracleState(fork, deps, deployment, collateralToken, collateralOracle),
        ]);
      } catch (error) {
        restoreError = error;
      }
    }
  }

  if (primaryError) {
    if (restoreError) {
      throw new Error(`SCN-010 执行失败，且 Oracle 恢复也失败：${String(primaryError)}；${String(restoreError)}`);
    }
    throw primaryError;
  }
  if (restoreError) throw restoreError;
  const evidence = requireValue(core, 'SCN-010 未生成证据');
  check(
    assertions,
    'Index 与 USDC Mock Oracle 状态已恢复',
    restoredStates.length === originalOracleStates.length
      && restoredStates.every((item, index) => {
        const original = originalOracleStates[index];
        return original ? sameMockOracleState(item, original) : false;
      }),
    restoredStates,
    originalOracleStates,
  );
  return {
    ...evidence,
    transactions: {
      ...evidence.transactions,
      oracleSetup: fork.adminTransactions.slice(setupStart, restoreStart),
      oracleRestore: fork.adminTransactions.slice(restoreStart),
    },
    prices: {
      ...evidence.prices,
      restoredOracleStates: restoredStates,
      oracleRestored: true,
    },
  };
}

export function stringifyEvidence(value: unknown): string {
  return `${JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'bigint' ? item.toString() : item, 2)}\n`;
}

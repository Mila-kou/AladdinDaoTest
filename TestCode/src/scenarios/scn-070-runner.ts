import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  createPublicClient,
  createWalletClient,
  decodeAbiParameters,
  decodeEventLog,
  decodeFunctionResult,
  defineChain,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  http,
  keccak256,
  parseAbi,
  toHex,
  type Abi,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { loadDeploymentManifest, type DeploymentManifest } from '../config/deployment.js';
import { resolveMockMarketBundle, type MockResourceRecord } from '../config/mock-resources.js';
import type { RuntimeConfig } from '../config/runtime.js';
import {
  SCN070_CASES,
  isExecutionPriceAcceptable,
  validateScn070Matrix,
  type Scn070CaseDefinition,
} from './scn-070-model.js';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;
const ZERO_BYTES32 = `0x${'0'.repeat(64)}` as Hex;
const MAX_UINT256 = 2n ** 256n - 1n;
const FLOAT_PRECISION = 10n ** 30n;
const COLLATERAL_PRICE = 10n ** 24n;
const COLLATERAL_AMOUNT = 10n * 10n ** 6n;
const SIZE_USD = 50n * 10n ** 30n;
const EXECUTION_FEE = 20_000_000_000_000n;
const REQUIRED_NATIVE_BALANCE = 2n * 10n ** 18n;
const SCENARIO_GAS_LIMIT = 30_000_000n;
const MAX_ALLOWANCE = MAX_UINT256;
const ACCEPTABLE_PRICE_ERROR_SELECTOR = keccak256(
  toHex('OrderNotFulfillableAtAcceptablePrice(uint256,uint256)'),
).slice(0, 10).toLowerCase();

const mockOracleAbi = parseAbi([
  'function setMockPrice(uint256 price,uint256 timestamp)',
  'function decimals() view returns (uint8)',
]);

interface MarketFixture {
  readonly marketIndex: bigint;
  readonly name: string;
  readonly indexToken: Address;
  readonly indexTokenDecimals: number;
  readonly collateralToken: Address;
  readonly collateralTokenDecimals: number;
  readonly mockOracle: Address;
  readonly mockOracleDecimals: number;
  readonly priceFeedMultiplier: bigint;
  readonly collateralMockOracle: Address;
  readonly collateralMockOracleDecimals: number;
  readonly collateralPriceFeedMultiplier: bigint;
  readonly chainlinkProvider: Address;
}

interface PositionState {
  readonly marketIndex: bigint;
  readonly sizeInUsd: bigint;
  readonly sizeInTokens: bigint;
  readonly collateralAmount: bigint;
  readonly isLong: boolean;
}

interface OrderState {
  readonly account: Address;
  readonly marketIndex: bigint;
  readonly orderType: bigint;
  readonly sizeDelta: bigint;
  readonly acceptablePrice: bigint;
  readonly triggerPrice: bigint;
  readonly isLong: boolean;
  readonly isFrozen: boolean;
}

interface TransactionEvidence {
  readonly hash: Hex;
  readonly blockNumber: bigint;
  readonly gasUsed: bigint;
  readonly from: Address;
  readonly to: Address | null;
  readonly status: string;
  /** 仅私钥签名交易记录；看板据此核对 r/s 非零。 */
  readonly transactionType?: string;
  readonly nonce?: number;
  readonly r?: Hex;
  readonly s?: Hex;
}

interface FxEvent {
  readonly eventName: string;
  readonly topic1?: Hex;
  readonly transactionHash: Hex;
  readonly blockNumber: bigint;
  readonly eventData: Record<string, unknown>;
}

interface CreatedOrder {
  readonly key: Hex;
  readonly transaction: TransactionEvidence;
}

export interface Scn070CaseEvidence {
  readonly caseId: string;
  readonly title: string;
  readonly quadrant: string;
  readonly boundary: string;
  readonly expectedOutcome: string;
  readonly orderType: number;
  readonly isLong: boolean;
  readonly marketIndex: bigint;
  readonly baselineOracleRawPrice: bigint;
  readonly executionOracleRawPrice: bigint;
  readonly oracleRawStep: bigint;
  readonly acceptablePrice: bigint;
  readonly baselineExecutionPrice: bigint;
  readonly executionPrice: bigint;
  readonly executionPriceStep: bigint;
  readonly positionBefore: PositionState | null;
  readonly positionAfter: PositionState | null;
  readonly collateralBalanceBefore: bigint;
  readonly collateralBalanceAfter: bigint;
  readonly transactions: Record<string, TransactionEvidence | undefined>;
  readonly events: FxEvent[];
  readonly assertions: Array<{
    readonly name: string;
    readonly passed: boolean;
    readonly actual: unknown;
    readonly expected: unknown;
  }>;
}

export interface Scn070Evidence {
  readonly scenarioId: 'SCN-070';
  readonly runMode: 'oracle-fork-private-key-controlled-oracle';
  readonly environment: Record<string, unknown>;
  readonly coverage: {
    readonly executed: string[];
    readonly pending: string[];
    readonly completeScenario: boolean;
  };
  readonly matrix: readonly Scn070CaseDefinition[];
  readonly cases: Scn070CaseEvidence[];
  readonly summary: {
    readonly total: number;
    readonly executed: number;
    readonly cancelled: number;
    readonly assertions: number;
  };
}

interface ScenarioContext {
  readonly runtime: RuntimeConfig;
  readonly manifest: DeploymentManifest;
  readonly resource: MockResourceRecord;
  readonly mockResourceAlias: string;
  readonly fixture: MarketFixture;
  readonly abis: {
    readonly exchangeRouter: Abi;
    readonly orderHandler: Abi;
    readonly reader: Abi;
    readonly dataStore: Abi;
    readonly erc20: Abi;
    readonly eventEmitter: Abi;
  };
  readonly publicClient: ReturnType<typeof createPublicClient>;
  readonly adminPublicClient: ReturnType<typeof createPublicClient>;
}

function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new Error(message);
  return value as Record<string, unknown>;
}

function asBigInt(value: unknown, message: string): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' || typeof value === 'string') return BigInt(value);
  throw new Error(message);
}

function asBoolean(value: unknown, message: string): boolean {
  if (typeof value !== 'boolean') throw new Error(message);
  return value;
}

function asAddress(value: unknown, message: string): Address {
  if (typeof value !== 'string') throw new Error(message);
  return getAddress(value);
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

async function rawRpc(
  url: string,
  method: string,
  params: readonly unknown[] = [],
): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json() as {
    result?: unknown;
    error?: { message?: string; data?: unknown };
  };
  if (body.error) {
    const detail = body.error.data === undefined ? '' : `；data=${JSON.stringify(body.error.data)}`;
    const error = new Error(`${method}: ${body.error.message ?? 'unknown RPC error'}${detail}`) as Error & {
      data?: unknown;
    };
    error.data = body.error.data;
    throw error;
  }
  return body.result;
}

async function loadAbi(manifest: DeploymentManifest, name: string): Promise<Abi> {
  const directory = manifest.source?.abiDirectory;
  if (!directory) throw new Error('Deployment manifest 缺少 source.abiDirectory');
  const filename = manifest.abiFiles[name] ?? `${name}.json`;
  const source = await readFile(resolve(process.cwd(), directory, filename), 'utf8');
  const parsed = JSON.parse(source) as unknown;
  if (!Array.isArray(parsed)) throw new Error(`${filename} 不是 ABI 数组`);
  return parsed as Abi;
}

function keyBase(name: string): Hex {
  return keccak256(encodeAbiParameters([{ type: 'string' }], [name]));
}

function tokenKey(name: string, token: Address): Hex {
  return keccak256(encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'address' }],
    [keyBase(name), token],
  ));
}

function providerKey(oracle: Address, token: Address): Hex {
  return keccak256(encodeAbiParameters(
    [{ type: 'bytes32' }, { type: 'address' }, { type: 'address' }],
    [keyBase('ORACLE_PROVIDER_FOR_TOKEN'), oracle, token],
  ));
}

async function adminSend(
  context: ScenarioContext,
  input: { readonly from: Address; readonly to: Address; readonly data: Hex; readonly label: string },
): Promise<TransactionEvidence> {
  const url = context.runtime.adminRpcUrl ?? context.runtime.rpcUrl;
  const hash = await rawRpc(url, 'eth_sendTransaction', [{
    from: input.from,
    to: input.to,
    data: input.data,
    gas: toHex(30_000_000n),
  }]);
  if (typeof hash !== 'string' || !hash.startsWith('0x')) {
    throw new Error(`${input.label} 未返回交易哈希`);
  }
  const receipt = await context.adminPublicClient.waitForTransactionReceipt({
    hash: hash as Hex,
    timeout: 120_000,
  });
  if (receipt.status !== 'success') throw new Error(`${input.label} 执行失败：${hash}`);
  const transaction = await context.adminPublicClient.getTransaction({ hash: hash as Hex });
  return {
    hash: hash as Hex,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    from: transaction.from,
    to: transaction.to,
    status: receipt.status,
  };
}

async function setNativeBalance(context: ScenarioContext, address: Address): Promise<void> {
  const url = context.runtime.adminRpcUrl ?? context.runtime.rpcUrl;
  await rawRpc(url, 'tenderly_setBalance', [[address], toHex(REQUIRED_NATIVE_BALANCE)]);
}

async function sendSigned(
  context: ScenarioContext,
  privateKey: Hex,
  expectedAddress: Address,
  input: { readonly to: Address; readonly data: Hex; readonly value?: bigint; readonly label: string },
): Promise<TransactionEvidence> {
  const account = privateKeyToAccount(privateKey);
  if (getAddress(account.address) !== getAddress(expectedAddress)) {
    throw new Error(`${input.label} 的私钥与配置地址不匹配`);
  }
  const chain = defineChain({
    id: context.runtime.chainId,
    name: 'FX100 oracle-fork',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [context.runtime.rpcUrl] } },
  });
  const wallet = createWalletClient({
    account,
    chain,
    transport: http(context.runtime.rpcUrl, { timeout: context.runtime.requestTimeoutMs }),
  });
  const value = input.value ?? 0n;
  await rawRpc(context.runtime.rpcUrl, 'eth_call', [{
    from: account.address,
    to: input.to,
    data: input.data,
    value: toHex(value),
    gas: toHex(SCENARIO_GAS_LIMIT),
  }, 'latest']);
  const hash = await wallet.sendTransaction({
    account,
    chain,
    to: input.to,
    data: input.data,
    value,
    gas: SCENARIO_GAS_LIMIT,
  });
  const receipt = await context.publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== 'success') throw new Error(`${input.label} 执行失败：${hash}`);
  const transaction = await context.publicClient.getTransaction({ hash });
  return {
    hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    from: transaction.from,
    to: transaction.to,
    status: receipt.status,
    transactionType: transaction.type,
    nonce: transaction.nonce,
    ...(transaction.r ? { r: transaction.r } : {}),
    ...(transaction.s ? { s: transaction.s } : {}),
  };
}

async function readDataStoreAddress(
  context: ScenarioContext,
  key: Hex,
): Promise<Address> {
  const value = await context.publicClient.readContract({
    address: getAddress(context.manifest.contracts.dataStore),
    abi: context.abis.dataStore,
    functionName: 'getAddress',
    args: [key],
  });
  return asAddress(value, `DataStore ${key} 未返回地址`);
}

async function writeDataStore(
  context: ScenarioContext,
  functionName: 'setAddress' | 'setUint',
  key: Hex,
  value: Address | bigint,
  label: string,
): Promise<TransactionEvidence> {
  const admin = getAddress(requireValue(context.runtime.adminAccount, '缺少 E2E_ADMIN_ACCOUNT'));
  return adminSend(context, {
    from: admin,
    to: getAddress(context.manifest.contracts.dataStore),
    data: encodeFunctionData({
      abi: context.abis.dataStore,
      functionName,
      args: [key, value],
    }),
    label,
  });
}

async function configureMockOracle(context: ScenarioContext): Promise<TransactionEvidence[]> {
  const fixture = context.fixture;
  return [
    await writeDataStore(
      context,
      'setAddress',
      tokenKey('PRICE_FEED', fixture.indexToken),
      fixture.mockOracle,
      'SCN-070 设置 Mock priceFeed',
    ),
    await writeDataStore(
      context,
      'setUint',
      tokenKey('PRICE_FEED_MULTIPLIER', fixture.indexToken),
      fixture.priceFeedMultiplier,
      'SCN-070 设置 priceFeedMultiplier',
    ),
    await writeDataStore(
      context,
      'setUint',
      tokenKey('PRICE_FEED_HEARTBEAT_DURATION', fixture.indexToken),
      86_400n,
      'SCN-070 设置 heartbeat',
    ),
    await writeDataStore(
      context,
      'setAddress',
      tokenKey('PRICE_FEED', fixture.collateralToken),
      fixture.collateralMockOracle,
      'SCN-070 设置抵押币 Mock priceFeed',
    ),
    await writeDataStore(
      context,
      'setUint',
      tokenKey('PRICE_FEED_MULTIPLIER', fixture.collateralToken),
      fixture.collateralPriceFeedMultiplier,
      'SCN-070 设置抵押币 priceFeedMultiplier',
    ),
    await writeDataStore(
      context,
      'setUint',
      tokenKey('PRICE_FEED_HEARTBEAT_DURATION', fixture.collateralToken),
      86_400n,
      'SCN-070 设置抵押币 heartbeat',
    ),
    await writeDataStore(
      context,
      'setAddress',
      providerKey(getAddress(context.manifest.contracts.oracle), fixture.indexToken),
      fixture.chainlinkProvider,
      'SCN-070 设置 Chainlink provider',
    ),
    await writeDataStore(
      context,
      'setAddress',
      providerKey(getAddress(context.manifest.contracts.oracle), fixture.collateralToken),
      fixture.chainlinkProvider,
      'SCN-070 设置抵押币 Chainlink provider',
    ),
    await setOraclePrice(
      context,
      fixture.collateralMockOracle,
      10n ** BigInt(fixture.collateralMockOracleDecimals),
      'SCN-070 刷新抵押币 Mock Oracle',
    ),
  ];
}

async function setOraclePrice(
  context: ScenarioContext,
  oracle: Address,
  rawPrice: bigint,
  label: string,
): Promise<TransactionEvidence> {
  if (rawPrice <= 0n) throw new Error(`Mock Oracle 价格必须大于 0：${rawPrice}`);
  const block = await context.adminPublicClient.getBlock();
  return adminSend(context, {
    from: getAddress(requireValue(context.runtime.adminAccount, '缺少 E2E_ADMIN_ACCOUNT')),
    to: oracle,
    data: encodeFunctionData({
      abi: mockOracleAbi,
      functionName: 'setMockPrice',
      args: [rawPrice, block.timestamp],
    }),
    label,
  });
}

async function setMockPrice(context: ScenarioContext, rawPrice: bigint): Promise<TransactionEvidence> {
  return setOraclePrice(
    context,
    context.fixture.mockOracle,
    rawPrice,
    `SCN-070 设置 Mock Oracle ${rawPrice}`,
  );
}

async function ensureApproval(context: ScenarioContext): Promise<TransactionEvidence | undefined> {
  const trader = getAddress(requireValue(context.runtime.testAccount, '缺少 E2E_TEST_ACCOUNT'));
  const router = getAddress(requireValue(
    context.manifest.additionalContracts.router,
    'Deployment manifest 缺少 collateral allowance spender Router',
  ));
  const allowance = asBigInt(await context.publicClient.readContract({
    address: context.fixture.collateralToken,
    abi: context.abis.erc20,
    functionName: 'allowance',
    args: [trader, router],
  }), 'allowance 不是 uint256');
  if (allowance >= COLLATERAL_AMOUNT * 2n) return undefined;
  return sendSigned(
    context,
    requireValue(context.runtime.testPrivateKey, '缺少 E2E_TEST_PRIVATE_KEY'),
    trader,
    {
      to: context.fixture.collateralToken,
      data: encodeFunctionData({
        abi: context.abis.erc20,
        functionName: 'approve',
        args: [router, MAX_ALLOWANCE],
      }),
      label: 'SCN-070 collateral approve',
    },
  );
}

async function collateralBalance(context: ScenarioContext): Promise<bigint> {
  const trader = getAddress(requireValue(context.runtime.testAccount, '缺少 E2E_TEST_ACCOUNT'));
  return asBigInt(await context.publicClient.readContract({
    address: context.fixture.collateralToken,
    abi: context.abis.erc20,
    functionName: 'balanceOf',
    args: [trader],
  }), 'balanceOf 不是 uint256');
}

function normalizePosition(value: unknown): PositionState {
  const root = asRecord(value, 'Position 不是对象');
  const numbers = asRecord(root.numbers, 'Position.numbers 缺失');
  const flags = asRecord(root.flags, 'Position.flags 缺失');
  return {
    marketIndex: asBigInt(numbers.marketIndex, 'Position.marketIndex 缺失'),
    sizeInUsd: asBigInt(numbers.sizeInUsd, 'Position.sizeInUsd 缺失'),
    sizeInTokens: asBigInt(numbers.sizeInTokens, 'Position.sizeInTokens 缺失'),
    collateralAmount: asBigInt(numbers.collateralAmount, 'Position.collateralAmount 缺失'),
    isLong: asBoolean(flags.isLong, 'Position.isLong 缺失'),
  };
}

async function readPosition(
  context: ScenarioContext,
  isLong: boolean,
): Promise<PositionState | null> {
  const trader = getAddress(requireValue(context.runtime.testAccount, '缺少 E2E_TEST_ACCOUNT'));
  const result = await context.publicClient.readContract({
    address: getAddress(context.manifest.contracts.reader),
    abi: context.abis.reader,
    functionName: 'getAccountPositions',
    args: [getAddress(context.manifest.contracts.dataStore), trader, 0n, 100n],
  });
  if (!Array.isArray(result)) throw new Error('Reader.getAccountPositions 未返回数组');
  const matches = result.map(normalizePosition).filter((position) =>
    position.marketIndex === context.fixture.marketIndex && position.isLong === isLong);
  if (matches.length > 1) throw new Error('同市场同方向返回多个仓位');
  return matches[0] ?? null;
}

async function readOrder(context: ScenarioContext, key: Hex): Promise<OrderState> {
  const result = await context.publicClient.readContract({
    address: getAddress(context.manifest.contracts.reader),
    abi: context.abis.reader,
    functionName: 'getOrder',
    args: [getAddress(context.manifest.contracts.dataStore), key],
  });
  const root = asRecord(result, 'Reader.getOrder 未返回对象');
  const addresses = asRecord(root.addresses, 'Order.addresses 缺失');
  const numbers = asRecord(root.numbers, 'Order.numbers 缺失');
  const flags = asRecord(root.flags, 'Order.flags 缺失');
  return {
    account: asAddress(addresses.account, 'Order.account 缺失'),
    marketIndex: asBigInt(numbers.marketIndex, 'Order.marketIndex 缺失'),
    orderType: asBigInt(numbers.orderType, 'Order.orderType 缺失'),
    sizeDelta: asBigInt(numbers.sizeDelta, 'Order.sizeDelta 缺失'),
    acceptablePrice: asBigInt(numbers.acceptablePrice, 'Order.acceptablePrice 缺失'),
    triggerPrice: asBigInt(numbers.triggerPrice, 'Order.triggerPrice 缺失'),
    isLong: asBoolean(flags.isLong, 'Order.isLong 缺失'),
    isFrozen: asBoolean(flags.isFrozen, 'Order.isFrozen 缺失'),
  };
}

function contractPriceFromRaw(fixture: MarketFixture, rawPrice: bigint): bigint {
  return rawPrice * fixture.priceFeedMultiplier / FLOAT_PRECISION;
}

async function readExecutionPrice(
  context: ScenarioContext,
  definition: Scn070CaseDefinition,
  rawOraclePrice: bigint,
  position: PositionState | null,
): Promise<bigint> {
  const contractPrice = contractPriceFromRaw(context.fixture, rawOraclePrice);
  const sizeDelta = definition.isIncrease
    ? SIZE_USD
    : -requireValue(position, `${definition.id} 缺少待平仓仓位`).sizeInUsd;
  const result = await context.publicClient.readContract({
    address: getAddress(context.manifest.contracts.reader),
    abi: context.abis.reader,
    functionName: 'getExecutionPrice',
    args: [
      getAddress(context.manifest.contracts.dataStore),
      context.fixture.marketIndex,
      {
        indexTokenPrice: { min: contractPrice, max: contractPrice },
        collateralTokenPrice: { min: COLLATERAL_PRICE, max: COLLATERAL_PRICE },
      },
      position?.sizeInUsd ?? 0n,
      position?.sizeInTokens ?? 0n,
      sizeDelta,
      true,
      definition.isLong,
    ],
  });
  const root = asRecord(result, 'Reader.getExecutionPrice 未返回对象');
  return asBigInt(root.executionPrice, 'executionPrice 缺失');
}

async function createMarketOrder(
  context: ScenarioContext,
  definition: Pick<Scn070CaseDefinition, 'isIncrease' | 'isLong' | 'orderType'>,
  acceptablePrice: bigint,
  sizeDelta: bigint,
): Promise<CreatedOrder> {
  const trader = getAddress(requireValue(context.runtime.testAccount, '缺少 E2E_TEST_ACCOUNT'));
  const exchangeRouter = getAddress(context.manifest.contracts.exchangeRouter);
  const orderVault = getAddress(requireValue(
    context.manifest.additionalContracts.orderVault,
    'Deployment manifest 缺少 orderVault',
  ));
  const calls: Hex[] = [encodeFunctionData({
    abi: context.abis.exchangeRouter,
    functionName: 'sendWnt',
    args: [orderVault, EXECUTION_FEE],
  })];
  if (definition.isIncrease) {
    calls.push(encodeFunctionData({
      abi: context.abis.exchangeRouter,
      functionName: 'sendTokens',
      args: [context.fixture.collateralToken, orderVault, COLLATERAL_AMOUNT],
    }));
  }
  calls.push(encodeFunctionData({
    abi: context.abis.exchangeRouter,
    functionName: 'createOrder',
    args: [{
      addresses: {
        receiver: trader,
        cancellationReceiver: ZERO_ADDRESS,
        callbackContract: ZERO_ADDRESS,
        uiFeeReceiver: ZERO_ADDRESS,
      },
      numbers: {
        marketIndex: context.fixture.marketIndex,
        sizeDelta,
        initialCollateralDeltaAmount: definition.isIncrease ? COLLATERAL_AMOUNT : 0n,
        triggerPrice: 0n,
        acceptablePrice,
        executionFee: EXECUTION_FEE,
        callbackGasLimit: 0n,
        minOutputAmount: 0n,
        validFromTime: 0n,
      },
      orderType: definition.orderType,
      isLong: definition.isLong,
      autoCancel: false,
      isSizeDeltaUsd: true,
      referralCode: ZERO_BYTES32,
      dataList: [],
    }],
  }));
  const data = encodeFunctionData({
    abi: context.abis.exchangeRouter,
    functionName: 'multicall',
    args: [calls],
  });
  const simulation = await context.publicClient.call({
    account: trader,
    to: exchangeRouter,
    data,
    value: EXECUTION_FEE,
  });
  const simulationData = requireValue(simulation.data, 'createOrder 模拟未返回结果');
  const results = decodeFunctionResult({
    abi: context.abis.exchangeRouter,
    functionName: 'multicall',
    data: simulationData,
  });
  if (!Array.isArray(results)) throw new Error('multicall 模拟结果不是 bytes[]');
  const encodedKey = requireValue(results.at(-1), 'multicall 缺少 createOrder 返回值');
  if (typeof encodedKey !== 'string') throw new Error('createOrder 返回值不是 bytes');
  const key = decodeAbiParameters([{ type: 'bytes32' }], encodedKey as Hex)[0];
  const transaction = await sendSigned(
    context,
    requireValue(context.runtime.testPrivateKey, '缺少 E2E_TEST_PRIVATE_KEY'),
    trader,
    { to: exchangeRouter, data, value: EXECUTION_FEE, label: 'SCN-070 create market order' },
  );
  return { key, transaction };
}

async function executeOrder(
  context: ScenarioContext,
  key: Hex,
): Promise<TransactionEvidence> {
  const keeper = getAddress(requireValue(context.runtime.keeperAccount, '缺少 E2E_KEEPER_ACCOUNT'));
  const data = encodeFunctionData({
    abi: context.abis.orderHandler,
    functionName: 'executeOrder',
    args: [key, {
      tokens: [context.fixture.indexToken, context.fixture.collateralToken],
      providers: [context.fixture.chainlinkProvider, context.fixture.chainlinkProvider],
      data: ['0x', '0x'],
    }],
  });
  return sendSigned(
    context,
    requireValue(context.runtime.secondaryTestPrivateKey, '缺少 E2E_SECONDARY_TEST_PRIVATE_KEY'),
    keeper,
    {
      to: getAddress(context.manifest.contracts.orderHandler),
      data,
      label: `SCN-070 execute ${key}`,
    },
  );
}

function eventItems(
  eventData: Record<string, unknown>,
  groupName: string,
): Array<Record<string, unknown>> {
  const group = eventData[groupName];
  if (!group || typeof group !== 'object') return [];
  const items = (group as Record<string, unknown>).items;
  return Array.isArray(items)
    ? items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : [];
}

function eventItem(event: FxEvent, groupName: string, key: string): unknown {
  return eventItems(event.eventData, groupName).find((item) => item.key === key)?.value;
}

function decodeAcceptablePriceError(value: unknown): {
  readonly executionPrice: bigint;
  readonly acceptablePrice: bigint;
} | null {
  if (typeof value !== 'string' || !value.startsWith('0x')) return null;
  if (value.slice(0, 10).toLowerCase() !== ACCEPTABLE_PRICE_ERROR_SELECTOR) return null;
  const encodedArguments = `0x${value.slice(10)}` as Hex;
  const [executionPrice, acceptablePrice] = decodeAbiParameters(
    [{ type: 'uint256' }, { type: 'uint256' }],
    encodedArguments,
  );
  return { executionPrice, acceptablePrice };
}

async function readEvents(
  context: ScenarioContext,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<FxEvent[]> {
  const logs = await context.publicClient.getLogs({
    address: getAddress(context.manifest.contracts.eventEmitter),
    fromBlock,
    toBlock,
  });
  const events: FxEvent[] = [];
  for (const log of logs) {
    try {
      const decoded = decodeEventLog({
        abi: context.abis.eventEmitter,
        data: log.data,
        topics: log.topics,
        strict: false,
      });
      const args = asRecord(decoded.args, 'EventEmitter args 缺失');
      if (typeof args.eventName !== 'string') continue;
      events.push({
        eventName: args.eventName,
        ...(typeof args.topic1 === 'string' ? { topic1: args.topic1 as Hex } : {}),
        transactionHash: requireValue(log.transactionHash, '事件缺少 transactionHash'),
        blockNumber: requireValue(log.blockNumber, '事件缺少 blockNumber'),
        eventData: asRecord(args.eventData, `${args.eventName}.eventData 缺失`),
      });
    } catch {
      // EventEmitter 之外的日志或不兼容日志不属于本场景证据。
    }
  }
  return events;
}

function eventsForOrder(events: readonly FxEvent[], key: Hex, eventName?: string): FxEvent[] {
  return events.filter((event) => {
    if (eventName && event.eventName !== eventName) return false;
    const embedded = eventItem(event, 'bytes32Items', 'key')
      ?? eventItem(event, 'bytes32Items', 'orderKey');
    return event.topic1?.toLowerCase() === key.toLowerCase()
      || (typeof embedded === 'string' && embedded.toLowerCase() === key.toLowerCase());
  });
}

function samePosition(left: PositionState | null, right: PositionState | null): boolean {
  if (!left || !right) return left === right;
  return left.marketIndex === right.marketIndex
    && left.sizeInUsd === right.sizeInUsd
    && left.sizeInTokens === right.sizeInTokens
    && left.collateralAmount === right.collateralAmount
    && left.isLong === right.isLong;
}

function check(
  assertions: Scn070CaseEvidence['assertions'],
  name: string,
  passed: boolean,
  actual: unknown,
  expected: unknown,
): void {
  assertions.push({ name, passed, actual, expected });
  if (!passed) throw new Error(`${name}：实际 ${String(actual)}，期望 ${String(expected)}`);
}

async function preparePosition(
  context: ScenarioContext,
  definition: Scn070CaseDefinition,
  rawPrice: bigint,
): Promise<{
  readonly oracleBeforeCreate: TransactionEvidence;
  readonly create: TransactionEvidence;
  readonly oracleBeforeExecute: TransactionEvidence;
  readonly execute: TransactionEvidence;
  readonly position: PositionState;
}> {
  const oracleBeforeCreate = await setMockPrice(context, rawPrice);
  const existing = await readPosition(context, definition.isLong);
  if (existing) throw new Error(`${definition.id} 前置状态已有同方向仓位`);
  const order = await createMarketOrder(
    context,
    { isIncrease: true, isLong: definition.isLong, orderType: 0 },
    definition.isLong ? MAX_UINT256 : 0n,
    SIZE_USD,
  );
  const oracleBeforeExecute = await setMockPrice(context, rawPrice);
  const execute = await executeOrder(context, order.key);
  const position = requireValue(
    await readPosition(context, definition.isLong),
    `${definition.id} 无法准备待平仓仓位`,
  );
  return { oracleBeforeCreate, create: order.transaction, oracleBeforeExecute, execute, position };
}

async function findAdverseExecution(
  context: ScenarioContext,
  definition: Scn070CaseDefinition,
  baseRawPrice: bigint,
  acceptablePrice: bigint,
  position: PositionState | null,
): Promise<{ readonly rawPrice: bigint; readonly executionPrice: bigint; readonly rawStep: bigint }> {
  const candidate = async (step: bigint): Promise<{ rawPrice: bigint; executionPrice: bigint }> => {
    const rawPrice = baseRawPrice + BigInt(definition.oracleDirection) * step;
    if (rawPrice <= 0n) throw new Error(`${definition.id} 的 Oracle 搜索越过零价`);
    return {
      rawPrice,
      executionPrice: await readExecutionPrice(context, definition, rawPrice, position),
    };
  };

  let high = 1n;
  let highResult = await candidate(high);
  while (isExecutionPriceAcceptable(
    highResult.executionPrice,
    acceptablePrice,
    definition.isIncrease,
    definition.isLong,
  )) {
    high *= 2n;
    if (high > baseRawPrice / 2n) {
      throw new Error(`${definition.id} 找不到可达的不利执行价`);
    }
    highResult = await candidate(high);
  }

  let low = 1n;
  while (low < high) {
    const middle = (low + high) / 2n;
    const middleResult = await candidate(middle);
    if (isExecutionPriceAcceptable(
      middleResult.executionPrice,
      acceptablePrice,
      definition.isIncrease,
      definition.isLong,
    )) {
      low = middle + 1n;
    } else {
      high = middle;
      highResult = middleResult;
    }
  }
  const result = await candidate(low);
  return { ...result, rawStep: low };
}

async function runBoundaryCase(
  context: ScenarioContext,
  definition: Scn070CaseDefinition,
): Promise<Scn070CaseEvidence> {
  const assertions: Scn070CaseEvidence['assertions'] = [];
  const fixture = context.fixture;
  const baseRawPrice = 60_000n * 10n ** BigInt(fixture.mockOracleDecimals);
  await Promise.all([
    setNativeBalance(context, getAddress(requireValue(context.runtime.testAccount, '缺少 trader'))),
    setNativeBalance(context, getAddress(requireValue(context.runtime.keeperAccount, '缺少 keeper'))),
    setNativeBalance(context, getAddress(requireValue(context.runtime.adminAccount, '缺少 admin'))),
  ]);
  const setupTransactions = await configureMockOracle(context);
  const approve = await ensureApproval(context);
  const balanceAtStart = await collateralBalance(context);
  check(
    assertions,
    '测试账户抵押币余额充足',
    balanceAtStart >= COLLATERAL_AMOUNT,
    balanceAtStart,
    `>= ${COLLATERAL_AMOUNT}`,
  );

  let preparation: Awaited<ReturnType<typeof preparePosition>> | undefined;
  if (!definition.isIncrease) {
    preparation = await preparePosition(context, definition, baseRawPrice);
  } else {
    check(
      assertions,
      '开仓边界组执行前无同方向仓位',
      (await readPosition(context, definition.isLong)) === null,
      await readPosition(context, definition.isLong),
      null,
    );
  }

  const baselineOracleSet = await setMockPrice(context, baseRawPrice);
  const positionBefore = await readPosition(context, definition.isLong);
  check(
    assertions,
    '平仓边界组已准备对应仓位',
    definition.isIncrease || positionBefore !== null,
    positionBefore,
    definition.isIncrease ? 'not applicable' : 'position exists',
  );
  const balanceBefore = await collateralBalance(context);
  const baselineExecutionPrice = await readExecutionPrice(
    context,
    definition,
    baseRawPrice,
    positionBefore,
  );
  const acceptablePrice = baselineExecutionPrice;
  const sizeDelta = definition.isIncrease
    ? SIZE_USD
    : requireValue(positionBefore, `${definition.id} 缺少仓位`).sizeInUsd;
  const created = await createMarketOrder(context, definition, acceptablePrice, sizeDelta);
  const storedOrder = await readOrder(context, created.key);
  check(assertions, '订单使用目标 marketIndex', storedOrder.marketIndex === fixture.marketIndex, storedOrder.marketIndex, fixture.marketIndex);
  check(assertions, '订单类型正确', storedOrder.orderType === BigInt(definition.orderType), storedOrder.orderType, definition.orderType);
  check(assertions, '订单多空方向正确', storedOrder.isLong === definition.isLong, storedOrder.isLong, definition.isLong);
  check(assertions, '市价单 triggerPrice=0', storedOrder.triggerPrice === 0n, storedOrder.triggerPrice, 0n);
  check(assertions, '链上 acceptablePrice 等于模型 A', storedOrder.acceptablePrice === acceptablePrice, storedOrder.acceptablePrice, acceptablePrice);
  check(assertions, '市价单创建后未冻结', !storedOrder.isFrozen, storedOrder.isFrozen, false);

  let executionRawPrice = baseRawPrice;
  let executionPrice = baselineExecutionPrice;
  let oracleRawStep = 0n;
  if (definition.boundary === 'adverse') {
    const adverse = await findAdverseExecution(
      context,
      definition,
      baseRawPrice,
      acceptablePrice,
      positionBefore,
    );
    executionRawPrice = adverse.rawPrice;
    executionPrice = adverse.executionPrice;
    oracleRawStep = adverse.rawStep;
  }
  const executionPriceStep = absolute(executionPrice - acceptablePrice);
  check(
    assertions,
    definition.boundary === 'equal' ? '等号边界 E=A' : '不利边界 E 越过 A',
    definition.boundary === 'equal'
      ? executionPrice === acceptablePrice
      : !isExecutionPriceAcceptable(executionPrice, acceptablePrice, definition.isIncrease, definition.isLong),
    executionPrice,
    definition.boundary === 'equal' ? acceptablePrice : 'unacceptable',
  );
  check(
    assertions,
    '不利边界使用最小可达 Oracle 步长',
    definition.boundary === 'equal' || oracleRawStep > 0n,
    oracleRawStep,
    definition.boundary === 'equal' ? 0n : '> 0',
  );

  const executionOracleSet = await setMockPrice(context, executionRawPrice);
  const executed = await executeOrder(context, created.key);
  const orderAfter = await readOrder(context, created.key);
  const positionAfter = await readPosition(context, definition.isLong);
  const balanceAfter = await collateralBalance(context);
  const events = await readEvents(context, created.transaction.blockNumber, executed.blockNumber);
  const createdEvents = eventsForOrder(events, created.key, 'OrderCreated');
  const executedEvents = eventsForOrder(events, created.key, 'OrderExecuted');
  const cancelledEvents = eventsForOrder(events, created.key, 'OrderCancelled');
  const frozenEvents = eventsForOrder(events, created.key, 'OrderFrozen');
  check(assertions, '恰好一条 OrderCreated', createdEvents.length === 1, createdEvents.length, 1);
  check(assertions, '执行后订单已从 OrderStore 移除', orderAfter.account === ZERO_ADDRESS, orderAfter.account, ZERO_ADDRESS);
  check(assertions, '市价单任何边界都不得 Frozen', frozenEvents.length === 0, frozenEvents.length, 0);

  if (definition.expectedOutcome === 'executed') {
    check(assertions, '等号边界恰好一条 OrderExecuted', executedEvents.length === 1, executedEvents.length, 1);
    check(assertions, '等号边界没有 OrderCancelled', cancelledEvents.length === 0, cancelledEvents.length, 0);
    if (definition.isIncrease) {
      check(assertions, '开仓等号边界建立仓位', positionAfter !== null, positionAfter, 'position exists');
      check(assertions, '开仓成功只转出一笔抵押', balanceBefore - balanceAfter === COLLATERAL_AMOUNT, balanceBefore - balanceAfter, COLLATERAL_AMOUNT);
    } else {
      check(assertions, '全平等号边界清除仓位', positionAfter === null, positionAfter, null);
    }
    const positionEventName = definition.isIncrease ? 'PositionIncrease' : 'PositionDecrease';
    const positionEvents = eventsForOrder(events, created.key, positionEventName);
    check(assertions, `恰好一条 ${positionEventName}`, positionEvents.length === 1, positionEvents.length, 1);
    const eventExecutionPrice = asBigInt(
      eventItem(requireValue(positionEvents[0], `缺少 ${positionEventName}`), 'uintItems', 'executionPrice'),
      `${positionEventName}.executionPrice 缺失`,
    );
    check(assertions, '事件 executionPrice 精确等于 A', eventExecutionPrice === acceptablePrice, eventExecutionPrice, acceptablePrice);
  } else {
    check(assertions, '不利越界恰好一条 OrderCancelled', cancelledEvents.length === 1, cancelledEvents.length, 1);
    check(assertions, '不利越界没有 OrderExecuted', executedEvents.length === 0, executedEvents.length, 0);
    if (definition.isIncrease) {
      check(assertions, '开仓取消后没有新仓位', positionAfter === null, positionAfter, null);
      check(assertions, '开仓取消后抵押币全额退款', balanceAfter === balanceBefore, balanceAfter, balanceBefore);
    } else {
      check(assertions, '平仓取消后原仓位完全不变', samePosition(positionAfter, positionBefore), positionAfter, positionBefore);
      check(assertions, '平仓取消不移动钱包抵押币', balanceAfter === balanceBefore, balanceAfter, balanceBefore);
    }
    const reasonBytes = eventItem(
      requireValue(cancelledEvents[0], '缺少 OrderCancelled'),
      'bytesItems',
      'reasonBytes',
    );
    const acceptablePriceError = decodeAcceptablePriceError(reasonBytes);
    check(
      assertions,
      '取消原因是 OrderNotFulfillableAtAcceptablePrice',
      acceptablePriceError !== null,
      typeof reasonBytes === 'string' ? reasonBytes.slice(0, 10) : reasonBytes,
      ACCEPTABLE_PRICE_ERROR_SELECTOR,
    );
    check(
      assertions,
      '取消错误中的 executionPrice 等于边界模型 E',
      acceptablePriceError?.executionPrice === executionPrice,
      acceptablePriceError?.executionPrice,
      executionPrice,
    );
    check(
      assertions,
      '取消错误中的 acceptablePrice 等于订单 A',
      acceptablePriceError?.acceptablePrice === acceptablePrice,
      acceptablePriceError?.acceptablePrice,
      acceptablePrice,
    );
  }

  return {
    caseId: definition.id,
    title: definition.title,
    quadrant: definition.quadrant,
    boundary: definition.boundary,
    expectedOutcome: definition.expectedOutcome,
    orderType: definition.orderType,
    isLong: definition.isLong,
    marketIndex: fixture.marketIndex,
    baselineOracleRawPrice: baseRawPrice,
    executionOracleRawPrice: executionRawPrice,
    oracleRawStep,
    acceptablePrice,
    baselineExecutionPrice,
    executionPrice,
    executionPriceStep,
    positionBefore,
    positionAfter,
    collateralBalanceBefore: balanceBefore,
    collateralBalanceAfter: balanceAfter,
    transactions: {
      oracleConfigPriceFeed: setupTransactions[0],
      oracleConfigMultiplier: setupTransactions[1],
      oracleConfigHeartbeat: setupTransactions[2],
      oracleConfigProvider: setupTransactions[3],
      approve,
      prepareOracleBeforeCreate: preparation?.oracleBeforeCreate,
      prepareCreate: preparation?.create,
      prepareOracleBeforeExecute: preparation?.oracleBeforeExecute,
      prepareExecute: preparation?.execute,
      baselineOracleSet,
      create: created.transaction,
      executionOracleSet,
      execute: executed,
    },
    events,
    assertions,
  };
}

async function buildContext(runtime: RuntimeConfig): Promise<ScenarioContext> {
  if (runtime.environment !== 'oracle-fork') {
    throw new Error(`SCN-070 只能在 oracle-fork 执行，当前 ${runtime.environment}`);
  }
  if (!runtime.testPrivateKey || !runtime.secondaryTestPrivateKey) {
    throw new Error('SCN-070 需要 Trader 与 ORDER_KEEPER 两把真实签名私钥');
  }
  if (!runtime.testAccount || !runtime.keeperAccount || !runtime.adminAccount) {
    throw new Error('SCN-070 缺少 Trader/Keeper/Admin 地址');
  }
  const trader = getAddress(runtime.testAccount);
  const keeper = getAddress(runtime.keeperAccount);
  const admin = getAddress(runtime.adminAccount);
  if (getAddress(privateKeyToAccount(runtime.testPrivateKey).address) !== trader) {
    throw new Error('SCN-070 的 E2E_TEST_PRIVATE_KEY 与 E2E_TEST_ACCOUNT 不匹配');
  }
  if (getAddress(privateKeyToAccount(runtime.secondaryTestPrivateKey).address) !== keeper) {
    throw new Error('SCN-070 的 E2E_SECONDARY_TEST_PRIVATE_KEY 与 E2E_KEEPER_ACCOUNT 不匹配');
  }
  const manifest = await loadDeploymentManifest(runtime.deploymentManifestPath);
  const mockResourceAlias = process.env.E2E_MARKET_RESOURCE_ALIAS ?? 'default-mock';
  const resource = await resolveMockMarketBundle('oracle-fork', mockResourceAlias);
  const registered = resource.market?.status === 'registered'
    ? resource.market.marketIndex
    : undefined;
  if (registered === undefined) {
    throw new Error(`oracle-fork/${mockResourceAlias} 尚未初始化完整 Market；请先运行 env:init:mock`);
  }
  const resourceToken = requireValue(resource.token, 'default-mock 缺少 token');
  const manifestMarket = manifest.markets.find((item) => BigInt(item.marketIndex) === BigInt(registered));
  const market = manifestMarket ?? (() => {
    const collateral = requireValue(resource.collateralToken, 'default-mock 链上 Market 缺少 collateralToken 登记');
    if (!resource.market?.vault) throw new Error('default-mock 链上 Market 缺少 vault 登记');
    return {
      name: `${resourceToken.symbol} default-mock`,
      symbol: `${resourceToken.symbol}-${collateral.symbol}`,
      marketIndex: String(registered),
      indexToken: resourceToken.address,
      collateralToken: collateral.address,
      vault: resource.market.vault,
      indexTokenDecimals: resourceToken.decimals,
      collateralTokenDecimals: collateral.decimals,
      synthetic: true,
    };
  })();
  if (getAddress(resourceToken.address) !== getAddress(market.indexToken)) {
    throw new Error('default-mock.token 与链上 market.indexToken 不一致');
  }
  const oracle = requireValue(resource.oracle, 'default-mock 缺少 oracle');
  const chainlinkProvider = getAddress(requireValue(
    manifest.additionalContracts.chainlinkPriceFeedProvider,
    'Deployment manifest 缺少 chainlinkPriceFeedProvider',
  ));
  const rpcTransport = http(runtime.rpcUrl, { timeout: runtime.requestTimeoutMs });
  const adminTransport = http(runtime.adminRpcUrl ?? runtime.rpcUrl, { timeout: runtime.requestTimeoutMs });
  const publicClient = createPublicClient({ transport: rpcTransport, pollingInterval: 500 });
  const adminPublicClient = createPublicClient({ transport: adminTransport, pollingInterval: 500 });
  const abis = {
    exchangeRouter: await loadAbi(manifest, 'ExchangeRouter'),
    orderHandler: await loadAbi(manifest, 'OrderHandler'),
    reader: await loadAbi(manifest, 'Reader'),
    dataStore: await loadAbi(manifest, 'DataStore'),
    erc20: await loadAbi(manifest, 'ERC20'),
    eventEmitter: await loadAbi(manifest, 'EventEmitter'),
  };
  const temporaryContext = {
    runtime,
    manifest,
    resource,
    mockResourceAlias,
    abis,
    publicClient,
    adminPublicClient,
  };
  const collateralToken = getAddress(market.collateralToken);
  const collateralMockOracleRecord = requireValue(
    resource.collateralOracle,
    `${mockResourceAlias} 缺少共享 USDC Mock Oracle 登记`,
  );
  const collateralMockOracle = getAddress(requireValue(
    collateralMockOracleRecord.address,
    `${mockResourceAlias} 共享 USDC Mock Oracle 缺少地址`,
  ));
  const [collateralOracleBytecode, collateralOracleDecimalsValue] = await Promise.all([
    publicClient.getBytecode({ address: collateralMockOracle }),
    publicClient.readContract({
      address: collateralMockOracle,
      abi: mockOracleAbi,
      functionName: 'decimals',
    }),
  ]);
  if (!collateralOracleBytecode || collateralOracleBytecode === '0x') {
    throw new Error(`抵押币 Mock Oracle ${collateralMockOracle} 没有 bytecode`);
  }
  const collateralMockOracleDecimals = Number(collateralOracleDecimalsValue);
  const exponent = 60 - oracle.decimals - market.indexTokenDecimals;
  if (exponent < 0) throw new Error(`priceFeedMultiplier 指数非法：${exponent}`);
  const collateralExponent = 60 - collateralMockOracleDecimals - market.collateralTokenDecimals;
  if (collateralExponent < 0) {
    throw new Error(`抵押币 priceFeedMultiplier 指数非法：${collateralExponent}`);
  }
  const fixture: MarketFixture = {
    marketIndex: BigInt(market.marketIndex),
    name: market.name,
    indexToken: getAddress(market.indexToken),
    indexTokenDecimals: market.indexTokenDecimals,
    collateralToken,
    collateralTokenDecimals: market.collateralTokenDecimals,
    mockOracle: getAddress(oracle.address),
    mockOracleDecimals: oracle.decimals,
    priceFeedMultiplier: 10n ** BigInt(exponent),
    collateralMockOracle,
    collateralMockOracleDecimals,
    collateralPriceFeedMultiplier: 10n ** BigInt(collateralExponent),
    chainlinkProvider,
  };
  const context: ScenarioContext = { ...temporaryContext, fixture };
  const [chainId, oracleBytecode, oracleDecimals] = await Promise.all([
    publicClient.getChainId(),
    publicClient.getBytecode({ address: fixture.mockOracle }),
    publicClient.readContract({
      address: fixture.mockOracle,
      abi: mockOracleAbi,
      functionName: 'decimals',
    }),
  ]);
  if (chainId !== runtime.chainId) throw new Error(`RPC chainId=${chainId}，期望 ${runtime.chainId}`);
  if (!oracleBytecode || oracleBytecode === '0x') throw new Error('default-mock Oracle 没有 bytecode');
  if (Number(oracleDecimals) !== fixture.mockOracleDecimals) {
    throw new Error(`Mock Oracle decimals=${oracleDecimals}，登记值=${fixture.mockOracleDecimals}`);
  }
  const [adminIsController, keeperHasRole, traderCollateralBalance] = await Promise.all([
    publicClient.readContract({
      address: getAddress(manifest.contracts.dataStore),
      abi: abis.dataStore,
      functionName: 'hasRole',
      args: [keyBase('CONTROLLER'), admin],
    }),
    publicClient.readContract({
      address: getAddress(manifest.contracts.dataStore),
      abi: abis.dataStore,
      functionName: 'hasRole',
      args: [keyBase('ORDER_KEEPER'), keeper],
    }),
    publicClient.readContract({
      address: fixture.collateralToken,
      abi: abis.erc20,
      functionName: 'balanceOf',
      args: [trader],
    }),
  ]);
  if (adminIsController !== true) throw new Error('E2E_ADMIN_ACCOUNT 缺少 CONTROLLER 角色');
  if (keeperHasRole !== true) throw new Error('E2E_KEEPER_ACCOUNT 缺少 ORDER_KEEPER 角色');
  const collateralBalanceValue = asBigInt(traderCollateralBalance, 'Trader 抵押币余额不是 uint256');
  if (collateralBalanceValue < COLLATERAL_AMOUNT) {
    throw new Error(`Trader 抵押币不足：${collateralBalanceValue} < ${COLLATERAL_AMOUNT}`);
  }
  return context;
}

export async function runScn070(runtime: RuntimeConfig): Promise<Scn070Evidence> {
  validateScn070Matrix();
  const context = await buildContext(runtime);
  const cases: Scn070CaseEvidence[] = [];
  const adminUrl = runtime.adminRpcUrl ?? runtime.rpcUrl;

  for (const definition of SCN070_CASES) {
    const snapshot = await rawRpc(adminUrl, 'evm_snapshot');
    if (typeof snapshot !== 'string') throw new Error(`${definition.id} 无法创建 Fork 快照`);
    try {
      cases.push(await runBoundaryCase(context, definition));
    } catch (error) {
      throw new Error(`SCN-070/${definition.id} 失败：${String(error)}`);
    } finally {
      const reverted = await rawRpc(adminUrl, 'evm_revert', [snapshot]);
      if (reverted !== true) throw new Error(`${definition.id} Fork 快照回滚失败`);
    }
  }

  const assertionCount = cases.reduce((total, item) => total + item.assertions.length, 0);
  return {
    scenarioId: 'SCN-070',
    runMode: 'oracle-fork-private-key-controlled-oracle',
    environment: {
      deployment: context.manifest.name,
      chainId: runtime.chainId,
      forkDisplayName: runtime.forkDisplayName,
      marketIndex: context.fixture.marketIndex,
      market: context.fixture.name,
      indexToken: context.fixture.indexToken,
      indexTokenDecimals: context.fixture.indexTokenDecimals,
      collateralToken: context.fixture.collateralToken,
      mockResourceAlias: context.mockResourceAlias,
      mockOracle: context.fixture.mockOracle,
      mockOracleDecimals: context.fixture.mockOracleDecimals,
      priceFeedMultiplier: context.fixture.priceFeedMultiplier,
      resetMode: 'per-dataset-evm_snapshot',
    },
    coverage: {
      executed: [
        'MarketIncrease long：E=A 成交 / 不利最小步长取消退款',
        'MarketIncrease short：E=A 成交 / 不利最小步长取消退款',
        'MarketDecrease long：E=A 成交 / 不利最小步长原仓不变',
        'MarketDecrease short：E=A 成交 / 不利最小步长原仓不变',
        '8 个数据集独立快照、真实 Trader/Keeper 签名、Reader/OrderStore/EventEmitter 多源核对',
      ],
      pending: ['浏览器钱包内输入订单并点击签名', '页面历史状态与链上事件逐行比对'],
      completeScenario: false,
    },
    matrix: SCN070_CASES,
    cases,
    summary: {
      total: cases.length,
      executed: cases.filter((item) => item.expectedOutcome === 'executed').length,
      cancelled: cases.filter((item) => item.expectedOutcome === 'cancelled').length,
      assertions: assertionCount,
    },
  };
}

export function stringifyScn070Evidence(value: unknown): string {
  return `${JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'bigint' ? item.toString() : item, 2)}\n`;
}

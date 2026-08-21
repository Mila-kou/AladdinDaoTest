import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

import { createPublicClient, createWalletClient, defineChain, encodeAbiParameters, getAddress, http, keccak256, parseAbi, parseAbiParameters, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import type { RuntimeConfig } from '../config/runtime.js';
import { resolveMockMarketBundle } from '../config/mock-resources.js';
import {
  checkLedgerConservation,
  ledgerDiff,
  positionKey as ledgerPositionKey,
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
  readonly createOrderSignature: string;
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
  readonly middlePhases?: readonly unknown[];
  readonly transactions: Record<string, unknown>;
  readonly events: Record<string, unknown>;
  readonly assertions: Array<{ name: string; passed: boolean; actual: unknown; expected: unknown }>;
  readonly observations: Record<string, unknown>;
  readonly parameters: Record<string, unknown>;
  /** 全平前停点的前端显示值采集（beforeClose 回调返回值；采集失败为 {error}）；无回调时缺省 */
  readonly uiDisplay?: Record<string, unknown>;
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
  const flowsModule = await importFile<{ CREATE_ORDER_SIG: string }>(legacyPath('tool/onchain-tx/lib/flows.mjs'));

  return {
    ...rpcModule,
    ...deploymentModule,
    ...actionsModule,
    ...ledgerModule,
    ...eventsModule,
    ...scenarioModule,
    ...castModule,
    orderListKey: keysModule.BASE.ORDER_LIST,
    createOrderSignature: flowsModule.CREATE_ORDER_SIG,
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
export function buildInlineExecuteOrder(
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

const TRIGGER_ZERO_ADDRESS = `0x${'0'.repeat(40)}`;
const TRIGGER_ZERO_BYTES32 = `0x${'0'.repeat(64)}`;
const MAX_UINT256 = 2n ** 256n - 1n;

// 触发单创建（SCN-010 buildLimitIncreaseMulticall 的通用化）：numbers 第 4 槽带 triggerPrice（内部价刻度），
// acceptablePrice 按买/卖侧放开（买侧 MAX / 卖侧 0）；increase 三段 multicall，decrease 两段。
function buildTriggerOrderMulticall(
  deps: Pick<LegacyDependencies, 'calldata' | 'createOrderSignature'>,
  input: {
    exchangeRouter: string; orderVault: string; collateralToken: string; account: string;
    marketIndex: number; isLong: boolean; isIncrease: boolean; orderType: number;
    sizeDeltaUsd: bigint; collateral: bigint; triggerPriceInternal: bigint; executionFee: bigint;
  },
): { to: string; data: `0x${string}`; value: string; label: string } {
  const acceptable = input.isLong === input.isIncrease ? MAX_UINT256 : 0n;
  const addresses = `(${input.account},${input.account},${TRIGGER_ZERO_ADDRESS},${TRIGGER_ZERO_ADDRESS})`;
  const numbers = `(${input.marketIndex},${input.sizeDeltaUsd},${input.collateral},${input.triggerPriceInternal},${acceptable},${input.executionFee},0,0,0)`;
  const params = `(${addresses},${numbers},${input.orderType},${input.isLong},false,true,${TRIGGER_ZERO_BYTES32},[])`;
  const parts = input.isIncrease
    ? [
      deps.calldata('sendWnt(address,uint256)', [input.orderVault, input.executionFee]),
      deps.calldata('sendTokens(address,address,uint256)', [input.collateralToken, input.orderVault, input.collateral]),
      deps.calldata(deps.createOrderSignature, [params]),
    ]
    : [
      deps.calldata('sendWnt(address,uint256)', [input.orderVault, input.executionFee]),
      deps.calldata(deps.createOrderSignature, [params]),
    ];
  return {
    to: input.exchangeRouter,
    data: deps.calldata('multicall(bytes[])', [`[${parts.join(',')}]`]),
    value: input.executionFee.toString(),
    label: `${ORDER_TYPE_NAMES[input.orderType] ?? input.orderType} trigger=${input.triggerPriceInternal}`,
  };
}

function oracleProviderKey(oracle: string, token: string): `0x${string}` {
  const baseKey = keccak256(encodeAbiParameters(parseAbiParameters('string'), ['ORACLE_PROVIDER_FOR_TOKEN']));
  return keccak256(encodeAbiParameters(parseAbiParameters('bytes32,address,address'), [baseKey, getAddress(oracle), getAddress(token)]));
}

export async function inlineOracleProviders(runtime: RuntimeConfig, deployment: LegacyDeployment, indexToken: string) {
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

function decimalToRawUsdc(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > 6) throw new Error(`USDC 金额 ${value} 小数位超过 6`);
  return BigInt(`${whole}${fraction.padEnd(6, '0')}`);
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

export interface MarketFlowMiddlePhase {
  readonly kind: 'increase' | 'decrease';
  readonly label: string;
  /** increase：追加的抵押（十进制 USDC）；缺省 '10' */
  readonly collateralUsdc?: string;
  /** increase：追加规模（USD 1e30 raw）；缺省 50e30 */
  readonly sizeUsdRaw?: bigint;
  /** decrease：按当前仓位规模的百分比部分平仓（1-99） */
  readonly percentOfPosition?: number;
}

/**
 * "推价后、全平前"停点上下文（docs/07 附录三 Phase 1-D）：链上状态在此静止（无新交易、mock 价不动），
 * 供前端显示值采集器打开页面读取持仓行/平仓弹窗预览。回调只观测不改状态；抛错不阻断链上流程。
 */
export interface MarketFlowBeforeCloseContext {
  readonly scenarioId: string;
  readonly datasetId?: string;
  readonly isLong: boolean;
  readonly marketIndex: number;
  readonly chainId: number;
  readonly trader: `0x${string}`;
  readonly positionKey: `0x${string}`;
  /** 停点时仓位原始字段（bigint → string） */
  readonly position: { readonly sizeInUsd: string; readonly sizeInTokens: string; readonly collateralAmount: string };
  readonly openOrderKey: string;
  /** 停点前最后一次链上快照块（afterOpen 或最后一个中段阶段执行块） */
  readonly snapshotBlock: string;
  readonly indexToken?: string;
  readonly indexOracle?: string;
  readonly collateralToken: string;
  readonly dataStore: string;
  readonly oracle: string;
  readonly rpcUrl: string;
  readonly appBaseUrl: string;
}

export type MarketFlowBeforeCloseHook = (context: MarketFlowBeforeCloseContext) => Promise<Record<string, unknown> | void>;

export interface MarketFlowOptions {
  readonly scenarioId: string;
  readonly isLong: boolean;
  /** 盈亏构造：开仓后（中段阶段前）把 Index 价格推动 ±N%（feed+时间戳+STABLE_PRICE 三件套，traps §11）。 */
  readonly priceMovePercent?: number;
  /** 中段阶段（加仓/部分平），按序执行于开仓与最终全平之间；证据落 middlePhases 数组。 */
  readonly middlePhases?: readonly MarketFlowMiddlePhase[];
  /** 触发式开仓（LimitIncrease=1 / StopIncrease=6）：挂单 → 推价至触发 → Keeper 执行。 */
  readonly openTrigger?: TriggerSpec;
  /** 触发式全平（LimitDecrease/TP=3 / StopLossDecrease=4）：挂单 → 推价至触发 → Keeper 执行。 */
  readonly closeTrigger?: TriggerSpec;
  /** 全平前停点回调（前端显示值采集）；返回值原样落证据 uiDisplay，抛错记为 uiDisplay.error 不中断。 */
  readonly beforeClose?: MarketFlowBeforeCloseHook;
  /** 矩阵模式透传，仅用于停点上下文标注 */
  readonly datasetId?: string;
}

export interface TriggerSpec {
  readonly orderType: 1 | 3 | 4 | 6;
  /** 触发价 = 当前 feed ×(100+offset)/100；推价越过触发价 0.1%（闸门等号语义交给 S07 边界矩阵） */
  readonly offsetPercent: number;
}

const ORDER_TYPE_NAMES: Record<number, string> = {
  1: 'LimitIncrease', 3: 'LimitDecrease(TP)', 4: 'StopLossDecrease', 6: 'StopIncrease',
};

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

  // 触发式开仓：先按当前 feed 计算触发价（内部价刻度 = feedRaw × 10^(12−feedDecimals)）
  let openTriggerContext: { feedRaw: bigint; internal: bigint; feedDecimals: number } | undefined;
  if (flow.openTrigger) {
    if (!mockResource?.oracle?.address || !mockResource.token?.address) {
      throw new Error('触发式开仓需要 mock-market 模式（可控 Index Oracle）');
    }
    const state = await readMockOracleState(runtime.rpcUrl, mockResource.oracle.address, runtime.requestTimeoutMs);
    const feedRaw = state.answer * BigInt(100 + flow.openTrigger.offsetPercent) / 100n;
    const internal = feedRaw * 10n ** BigInt(12 - state.decimals);
    openTriggerContext = { feedRaw, internal, feedDecimals: state.decimals };
  }
  const open = await broadcaster.send({
    ...(flow.openTrigger && openTriggerContext
      ? buildTriggerOrderMulticall(deps, {
        exchangeRouter: deployment.addresses.exchangeRouter,
        orderVault: deployment.addresses.orderVault,
        collateralToken: deployment.addresses.usdc,
        account: runtime.testAccount,
        marketIndex,
        isLong,
        isIncrease: true,
        orderType: flow.openTrigger.orderType,
        sizeDeltaUsd: SIZE_USD,
        collateral: COLLATERAL,
        triggerPriceInternal: openTriggerContext.internal,
        executionFee: EXECUTION_FEE,
      })
      : deps.buildIncreaseMulticall({
        exchangeRouter: deployment.addresses.exchangeRouter,
        orderVault: deployment.addresses.orderVault,
        collateralToken: deployment.addresses.usdc,
        account: runtime.testAccount,
        marketIndex,
        isLong,
        sizeDeltaUsd: SIZE_USD,
        collateral: COLLATERAL,
        executionFee: EXECUTION_FEE,
      })),
    from: runtime.testAccount,
  });
  check(assertions, '开仓创建交易成功', open.ok, open.error ?? open.txHash, 'success');
  const openOrderKey = requireValue(open.orderKey, '开仓交易未解出 orderKey');
  // 固定读取创建交易所在区块，避免 Service Keeper 紧接着执行后丢失 TX1 的挂单态。
  const afterCreateOpen = await takeSnapshot(deps, rpc, deployment, ledgerContext, open.blockNumber);
  check(assertions, 'afterCreateOpen 账本无缺失读数', afterCreateOpen.errors.length === 0, afterCreateOpen.errors, []);
  const openTriggerPushTransactions: Array<Record<string, unknown>> = [];
  if (flow.openTrigger && openTriggerContext) {
    const stillPending = await deps.orderIsPending(rpc, {
      dataStore: deployment.addresses.dataStore, orderListKey: deps.orderListKey, orderKey: requireValue(open.orderKey, '触发单未解出 orderKey'),
    });
    check(
      assertions,
      `${ORDER_TYPE_NAMES[flow.openTrigger.orderType]}：未到触发价时订单保持挂单、仓位不存在`,
      stillPending && !positionOf(afterCreateOpen),
      `pending=${stillPending}，position=${Boolean(positionOf(afterCreateOpen))}`,
      'pending=true 且 position=false',
    );
    // 推价越过触发价 0.1%（方向 = offset 符号）；三件套：feed + 时间戳 + STABLE_PRICE
    const crossFeed = flow.openTrigger.offsetPercent > 0
      ? openTriggerContext.feedRaw * 1001n / 1000n
      : openTriggerContext.feedRaw * 999n / 1000n;
    const crossInternal = crossFeed * 10n ** BigInt(12 - openTriggerContext.feedDecimals);
    const pushAdmin = runtime.adminRpcUrl ?? runtime.rpcUrl;
    const pushFrom = runtime.adminAccount ?? runtime.testAccount;
    const pushState = await readMockOracleState(runtime.rpcUrl, mockResource!.oracle!.address, runtime.requestTimeoutMs);
    const feedReceipt = await sendSetMockPrice({
      adminRpcUrl: pushAdmin, from: pushFrom, oracle: mockResource!.oracle!.address,
      priceRaw: crossFeed, timestamp: freshOracleTimestamp(pushState.latestBlockTimestamp),
    });
    const stableReceipt = await sendAdminTransaction({
      adminRpcUrl: pushAdmin, from: deployment.addresses.config!, to: deployment.addresses.dataStore,
      data: encodeDataStoreSetUint(stablePriceKey(mockResource!.token!.address), crossInternal),
    });
    check(
      assertions,
      `${ORDER_TYPE_NAMES[flow.openTrigger.orderType]}：价格已推越触发价（trigger=${openTriggerContext.internal}）`,
      feedReceipt.status === 'success' && stableReceipt.status === 'success',
      `feed=${feedReceipt.status}（${crossFeed}），stable=${stableReceipt.status}（${crossInternal}）`,
      '两笔环境管理交易回执成功',
    );
    openTriggerPushTransactions.push(
      { kind: 'feed', txHash: feedReceipt.txHash, priceRaw: crossFeed.toString() },
      { kind: 'stablePrice', txHash: stableReceipt.txHash, value: crossInternal.toString() },
    );
  }
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

  // 中段阶段（加仓 / 部分平）：每阶段完整走 创建→执行→钉块快照→纯净度→参数快照→事件，
  // 证据落 middlePhases 数组；最终全平的窗口基准移到最后一个中段快照。
  interface MiddlePhaseRecord {
    readonly kind: 'increase' | 'decrease';
    readonly label: string;
    readonly sizeUsdRaw: string;
    readonly marginRaw: string;
    readonly orderKey: string;
    readonly snapshots: { afterCreate: LegacySnapshot; execBefore: LegacySnapshot; afterExec: LegacySnapshot };
    readonly deltas: { create: Record<string, bigint | null>; execute: Record<string, bigint | null> };
    readonly conservation: { create: unknown; execute: unknown };
    readonly events: Record<string, unknown>;
    readonly parameters: unknown;
    readonly transactions: Record<string, unknown>;
  }
  const middlePhaseRecords: MiddlePhaseRecord[] = [];
  let flowCursor = afterOpen;
  let currentPosition = openedPosition;
  for (const [middleIndex, phase] of (flow.middlePhases ?? []).entries()) {
    const phaseTag = `中段${middleIndex + 1}·${phase.label}`;
    const isIncreasePhase = phase.kind === 'increase';
    const phaseMargin = isIncreasePhase ? decimalToRawUsdc(phase.collateralUsdc ?? '10') : 0n;
    const phaseSizeUsd = isIncreasePhase
      ? (phase.sizeUsdRaw ?? SIZE_USD)
      : currentPosition.sizeInUsd * BigInt(phase.percentOfPosition ?? 50) / 100n;
    const phaseOrder = await broadcaster.send({
      ...(isIncreasePhase
        ? deps.buildIncreaseMulticall({
          exchangeRouter: deployment.addresses.exchangeRouter,
          orderVault: deployment.addresses.orderVault,
          collateralToken: deployment.addresses.usdc,
          account: runtime.testAccount,
          marketIndex,
          isLong,
          sizeDeltaUsd: phaseSizeUsd,
          collateral: phaseMargin,
          executionFee: EXECUTION_FEE,
        })
        : deps.buildDecreaseOrder({
          exchangeRouter: deployment.addresses.exchangeRouter,
          orderVault: deployment.addresses.orderVault,
          account: runtime.testAccount,
          marketIndex,
          isLong,
          sizeDeltaUsd: phaseSizeUsd,
          collateralDelta: 0n,
          executionFee: EXECUTION_FEE,
        })),
      from: runtime.testAccount,
    });
    check(assertions, `${phaseTag}：创建交易成功`, phaseOrder.ok, phaseOrder.error ?? phaseOrder.txHash, 'success');
    const phaseOrderKey = requireValue(phaseOrder.orderKey, `${phaseTag}：交易未解出 orderKey`);
    const phaseAfterCreate = await takeSnapshot(deps, rpc, deployment, ledgerContext, phaseOrder.blockNumber);
    check(assertions, `${phaseTag}：afterCreate 账本无缺失读数`, phaseAfterCreate.errors.length === 0, phaseAfterCreate.errors, []);
    if (inlineKeeper) {
      const providers = await inlineOracleProviders(runtime, deployment, mockResource!.token!.address);
      const execution = await sendKeeperExecution(runtime, rpc, buildInlineExecuteOrder(
        deps, deployment, phaseOrderKey, mockResource!.token!.address, providers,
      ));
      check(assertions, `${phaseTag}：Inline Keeper 执行交易成功`, execution.ok, execution.txHash, 'success');
    }
    const phaseSettled = inlineKeeper
      ? { outcome: !(await deps.orderIsPending(rpc, {
        dataStore: deployment.addresses.dataStore, orderListKey: deps.orderListKey, orderKey: phaseOrderKey,
      })) ? 'settled' : 'pending' }
      : await deps.waitForExecution(
        async () => !(await deps.orderIsPending(rpc, {
          dataStore: deployment.addresses.dataStore,
          orderListKey: deps.orderListKey,
          orderKey: phaseOrderKey,
        })),
        { timeoutMs: 300_000, pollMs: 2_000 },
      );
    if (phaseSettled.outcome !== 'settled') throw new Error(`${phaseTag}：订单仍在挂单态`);
    const phaseLocated = await locateOrderExecution(deps, rpc, deployment, phaseOrderKey, phaseOrder.blockNumber);
    const phaseExecBlock = phaseLocated.blockNumber;
    const phaseExecBefore = phaseExecBlock > phaseOrder.blockNumber
      ? await takeSnapshot(deps, rpc, deployment, ledgerContext, phaseExecBlock - 1)
      : phaseAfterCreate;
    check(assertions, `${phaseTag}：execBefore 账本无缺失读数`, phaseExecBefore.errors.length === 0, phaseExecBefore.errors, []);
    const phaseWindowDrift = ledgerDiff(phaseAfterCreate, phaseExecBefore);
    check(
      assertions,
      `${phaseTag}：执行窗口无第三方账本变动`,
      ledgerDriftIsZero(phaseWindowDrift),
      describeLedgerDrift(phaseWindowDrift),
      '全部账本槽位 Δ = 0',
    );
    const phaseAfterExec = await takeSnapshot(deps, rpc, deployment, ledgerContext, phaseExecBlock);
    check(assertions, `${phaseTag}：afterExec 账本无缺失读数`, phaseAfterExec.errors.length === 0, phaseAfterExec.errors, []);
    const phaseParameters = await readTradeParameterSnapshot({
      rpcUrl: runtime.rpcUrl,
      timeoutMs: runtime.requestTimeoutMs,
      dataStore: deployment.addresses.dataStore,
      referralStorage: deployment.addresses.referralStorage,
      marketIndex,
      account: runtime.testAccount,
      blockNumber: phaseExecBlock,
    });
    const phaseEvents = await deps.fetchExecutionEvents(context, {
      fromBlock: phaseOrder.blockNumber,
      toBlock: phaseExecBlock,
      orderKey: phaseOrderKey,
      extraNames: [isIncreasePhase ? 'PositionIncrease' : 'PositionDecrease'],
    });
    const [phaseCreateTx, phaseCreateReceipt, phaseExecuteTx, phaseExecuteReceipt] = await Promise.all([
      transaction(rpc, phaseOrder.txHash), receipt(rpc, phaseOrder.txHash),
      transaction(rpc, phaseLocated.txHash), receipt(rpc, phaseLocated.txHash),
    ]);
    const phaseCreateDelta = ledgerDiff(flowCursor, phaseAfterCreate);
    const phaseExecuteDelta = ledgerDiff(phaseExecBefore, phaseAfterExec);
    const phaseCreateConservation = checkLedgerConservation(phaseCreateDelta);
    const phaseExecuteConservation = checkLedgerConservation(phaseExecuteDelta);
    check(
      assertions,
      `${phaseTag}：创建阶段五方守恒 ΣΔ = 0`,
      phaseCreateConservation.status === 'PASS',
      `status=${phaseCreateConservation.status}，ΣΔ=${phaseCreateConservation.sum ?? 'null'}`,
      'status=PASS 且 ΣΔ=0',
    );
    check(
      assertions,
      `${phaseTag}：执行阶段五方守恒 ΣΔ = 0`,
      phaseExecuteConservation.status === 'PASS',
      `status=${phaseExecuteConservation.status}，ΣΔ=${phaseExecuteConservation.sum ?? 'null'}`,
      'status=PASS 且 ΣΔ=0',
    );
    const phasePosition = positionOf(phaseAfterExec);
    if (isIncreasePhase) {
      const expectedPhaseSize = currentPosition.sizeInUsd + phaseSizeUsd;
      check(
        assertions,
        `${phaseTag}：加仓后规模 = 原规模 + 增量`,
        phasePosition !== undefined && phasePosition.sizeInUsd === expectedPhaseSize,
        phasePosition?.sizeInUsd,
        expectedPhaseSize,
      );
      currentPosition = requireValue(phasePosition, `${phaseTag}：加仓后仓位不存在`);
    } else {
      const expectedPhaseSize = currentPosition.sizeInUsd - phaseSizeUsd;
      check(
        assertions,
        `${phaseTag}：部分平后规模 = 原规模 − 减量`,
        phasePosition !== undefined && phasePosition.sizeInUsd === expectedPhaseSize,
        phasePosition?.sizeInUsd,
        expectedPhaseSize,
      );
      currentPosition = requireValue(phasePosition, `${phaseTag}：部分平后仓位不存在（应保留剩余仓位）`);
    }
    middlePhaseRecords.push({
      kind: phase.kind,
      label: phase.label,
      sizeUsdRaw: phaseSizeUsd.toString(),
      marginRaw: phaseMargin.toString(),
      orderKey: phaseOrderKey,
      snapshots: { afterCreate: phaseAfterCreate, execBefore: phaseExecBefore, afterExec: phaseAfterExec },
      deltas: { create: phaseCreateDelta, execute: phaseExecuteDelta },
      conservation: { create: phaseCreateConservation, execute: phaseExecuteConservation },
      events: phaseEvents,
      parameters: phaseParameters,
      transactions: {
        create: { ...phaseOrder, transaction: phaseCreateTx, receipt: phaseCreateReceipt },
        execute: { event: phaseLocated, transaction: phaseExecuteTx, receipt: phaseExecuteReceipt },
      },
    });
    flowCursor = phaseAfterExec;
  }

  // —— 停点：推价 / 中段阶段之后、全平之前（链上静止）——前端显示值采集（docs/07 Phase 1-D）——
  // 采集失败只记录不 throw：链上证据链完整性优先，UI 层核对在 execution-evidence 里分层呈现。
  let uiDisplay: Record<string, unknown> | undefined;
  if (flow.beforeClose) {
    const context: MarketFlowBeforeCloseContext = {
      scenarioId: flow.scenarioId,
      ...(flow.datasetId !== undefined ? { datasetId: flow.datasetId } : {}),
      isLong,
      marketIndex,
      chainId: runtime.chainId,
      trader: getAddress(runtime.testAccount) as `0x${string}`,
      positionKey: ledgerPositionKey(runtime.testAccount, BigInt(marketIndex), isLong),
      position: {
        sizeInUsd: currentPosition.sizeInUsd.toString(),
        sizeInTokens: currentPosition.sizeInTokens.toString(),
        collateralAmount: currentPosition.collateralAmount.toString(),
      },
      openOrderKey,
      snapshotBlock: flowCursor.blockNumber.toString(),
      ...(mockResource?.token?.address ? { indexToken: mockResource.token.address } : {}),
      ...(mockResource?.oracle?.address ? { indexOracle: mockResource.oracle.address } : {}),
      collateralToken: deployment.addresses.usdc,
      dataStore: deployment.addresses.dataStore,
      oracle: deployment.addresses.oracle,
      rpcUrl: runtime.rpcUrl,
      appBaseUrl: runtime.appBaseUrl,
    };
    const startedAt = Date.now();
    try {
      const collected = await flow.beforeClose(context);
      uiDisplay = { ...(collected ?? {}), collectedAtBlock: context.snapshotBlock, durationMs: Date.now() - startedAt };
    } catch (error) {
      uiDisplay = {
        error: error instanceof Error ? error.message : String(error),
        collectedAtBlock: context.snapshotBlock,
        durationMs: Date.now() - startedAt,
      };
    }
  }

  let closeTriggerContext: { feedRaw: bigint; internal: bigint; feedDecimals: number } | undefined;
  if (flow.closeTrigger) {
    if (!mockResource?.oracle?.address || !mockResource.token?.address) {
      throw new Error('触发式全平需要 mock-market 模式（可控 Index Oracle）');
    }
    const state = await readMockOracleState(runtime.rpcUrl, mockResource.oracle.address, runtime.requestTimeoutMs);
    const feedRaw = state.answer * BigInt(100 + flow.closeTrigger.offsetPercent) / 100n;
    const internal = feedRaw * 10n ** BigInt(12 - state.decimals);
    closeTriggerContext = { feedRaw, internal, feedDecimals: state.decimals };
  }
  const close = await broadcaster.send({
    ...(flow.closeTrigger && closeTriggerContext
      ? buildTriggerOrderMulticall(deps, {
        exchangeRouter: deployment.addresses.exchangeRouter,
        orderVault: deployment.addresses.orderVault,
        collateralToken: deployment.addresses.usdc,
        account: runtime.testAccount,
        marketIndex,
        isLong,
        isIncrease: false,
        orderType: flow.closeTrigger.orderType,
        sizeDeltaUsd: currentPosition.sizeInUsd,
        collateral: 0n,
        triggerPriceInternal: closeTriggerContext.internal,
        executionFee: EXECUTION_FEE,
      })
      : deps.buildDecreaseOrder({
        exchangeRouter: deployment.addresses.exchangeRouter,
        orderVault: deployment.addresses.orderVault,
        account: runtime.testAccount,
        marketIndex,
        isLong,
        sizeDeltaUsd: currentPosition.sizeInUsd,
        collateralDelta: 0n,
        executionFee: EXECUTION_FEE,
      })),
    from: runtime.testAccount,
  });
  check(assertions, '全平创建交易成功', close.ok, close.error ?? close.txHash, 'success');
  const closeOrderKey = requireValue(close.orderKey, '全平交易未解出 orderKey');
  const afterCreateClose = await takeSnapshot(deps, rpc, deployment, ledgerContext, close.blockNumber);
  check(assertions, 'afterCreateClose 账本无缺失读数', afterCreateClose.errors.length === 0, afterCreateClose.errors, []);
  const closeTriggerPushTransactions: Array<Record<string, unknown>> = [];
  if (flow.closeTrigger && closeTriggerContext) {
    const stillPending = await deps.orderIsPending(rpc, {
      dataStore: deployment.addresses.dataStore, orderListKey: deps.orderListKey, orderKey: requireValue(close.orderKey, '触发单未解出 orderKey'),
    });
    const positionIntact = positionOf(afterCreateClose);
    check(
      assertions,
      `${ORDER_TYPE_NAMES[flow.closeTrigger.orderType]}：未到触发价时订单保持挂单、仓位原样保留`,
      stillPending && positionIntact !== undefined && positionIntact.sizeInUsd === currentPosition.sizeInUsd,
      `pending=${stillPending}，positionSize=${positionIntact?.sizeInUsd}`,
      `pending=true 且 positionSize=${currentPosition.sizeInUsd}`,
    );
    const crossFeed = flow.closeTrigger.offsetPercent > 0
      ? closeTriggerContext.feedRaw * 1001n / 1000n
      : closeTriggerContext.feedRaw * 999n / 1000n;
    const crossInternal = crossFeed * 10n ** BigInt(12 - closeTriggerContext.feedDecimals);
    const pushAdmin = runtime.adminRpcUrl ?? runtime.rpcUrl;
    const pushFrom = runtime.adminAccount ?? runtime.testAccount;
    const pushState = await readMockOracleState(runtime.rpcUrl, mockResource!.oracle!.address, runtime.requestTimeoutMs);
    const feedReceipt = await sendSetMockPrice({
      adminRpcUrl: pushAdmin, from: pushFrom, oracle: mockResource!.oracle!.address,
      priceRaw: crossFeed, timestamp: freshOracleTimestamp(pushState.latestBlockTimestamp),
    });
    const stableReceipt = await sendAdminTransaction({
      adminRpcUrl: pushAdmin, from: deployment.addresses.config!, to: deployment.addresses.dataStore,
      data: encodeDataStoreSetUint(stablePriceKey(mockResource!.token!.address), crossInternal),
    });
    check(
      assertions,
      `${ORDER_TYPE_NAMES[flow.closeTrigger.orderType]}：价格已推越触发价（trigger=${closeTriggerContext.internal}）`,
      feedReceipt.status === 'success' && stableReceipt.status === 'success',
      `feed=${feedReceipt.status}（${crossFeed}），stable=${stableReceipt.status}（${crossInternal}）`,
      '两笔环境管理交易回执成功',
    );
    closeTriggerPushTransactions.push(
      { kind: 'feed', txHash: feedReceipt.txHash, priceRaw: crossFeed.toString() },
      { kind: 'stablePrice', txHash: stableReceipt.txHash, value: crossInternal.toString() },
    );
  }
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

  if (flow.openTrigger) {
    check(
      assertions,
      `开仓事件 orderType = ${flow.openTrigger.orderType}（${ORDER_TYPE_NAMES[flow.openTrigger.orderType]}）`,
      positionIncrease?.uint?.orderType === BigInt(flow.openTrigger.orderType),
      positionIncrease?.uint?.orderType,
      BigInt(flow.openTrigger.orderType),
    );
  }
  if (flow.closeTrigger) {
    check(
      assertions,
      `全平事件 orderType = ${flow.closeTrigger.orderType}（${ORDER_TYPE_NAMES[flow.closeTrigger.orderType]}）`,
      positionDecrease?.uint?.orderType === BigInt(flow.closeTrigger.orderType),
      positionDecrease?.uint?.orderType,
      BigInt(flow.closeTrigger.orderType),
    );
  }
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
  // 签名形态按模式：private-key 四笔全签；impersonation（Tenderly 免签）用户两笔 r=s=0、Keeper 两笔真签。
  const signaturePattern = [openCreateTx, openExecuteTx, closeCreateTx, closeExecuteTx].map(hasSignature);
  const expectedSignaturePattern = runtime.signingMode === 'private-key' ? [true, true, true, true] : [false, true, false, true];
  check(
    assertions,
    runtime.signingMode === 'private-key' ? '四笔交易均包含非零签名字段' : '用户两笔免签（impersonation）、Keeper 两笔真实签名',
    signaturePattern.every((value, index) => value === expectedSignaturePattern[index]),
    signaturePattern,
    expectedSignaturePattern,
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
  const createCloseDelta = ledgerDiff(flowCursor, afterCreateClose);
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
      closeSizeUsdRaw: currentPosition.sizeInUsd.toString(),
      ...(flow.openTrigger && openTriggerContext ? {
        openTriggerOrderType: flow.openTrigger.orderType,
        openTriggerPriceInternal: openTriggerContext.internal.toString(),
      } : {}),
      ...(flow.closeTrigger && closeTriggerContext ? {
        closeTriggerOrderType: flow.closeTrigger.orderType,
        closeTriggerPriceInternal: closeTriggerContext.internal.toString(),
      } : {}),
    },
    parameters: { open: openParameterSnapshot, close: closeParameterSnapshot },
    snapshots: { before, afterCreateOpen, openExecBefore, afterOpen, afterCreateClose, closeExecBefore, afterClose },
    middlePhases: middlePhaseRecords,
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
      openTriggerPush: openTriggerPushTransactions,
      closeTriggerPush: closeTriggerPushTransactions,
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
    ...(uiDisplay !== undefined ? { uiDisplay } : {}),
  };
}

export interface MarketFlowDataset {
  /** 数据集 ID（06-矩阵规范：<方向>-<动作>[-<盈亏>]，如 long-close-profit） */
  readonly datasetId: string;
  readonly label: string;
  readonly isLong: boolean;
  readonly priceMovePercent?: number;
  readonly middlePhases?: readonly MarketFlowMiddlePhase[];
  /** 全平前停点回调（前端显示值采集），见 MarketFlowOptions.beforeClose */
  readonly beforeClose?: MarketFlowBeforeCloseHook;
}

/** 跨数据集对照断言（矩阵级）：同一指标在多个数据集之间的序关系，如 SCN-009 的「涨 > 平 > 跌」。 */
export interface MarketFlowCrossDatasetCheck {
  readonly name: string;
  /** 指标来源：各数据集 evidence.observations[metric]（bigint 原始值；traderUsdcDelta = 全流程 trader USDC 净变化，1e6） */
  readonly metric: 'traderUsdcDelta';
  /** 数据集 ID 序列，要求该指标沿序列严格递减 */
  readonly strictlyDescending: readonly string[];
}

export interface MarketFlowMatrixInput {
  readonly scenarioId: string;
  readonly datasets: readonly MarketFlowDataset[];
  /** 覆盖声明覆写：pending 给出则整体替换首数据集的 pending（如三组受控价格已由数据集覆盖时移除该项）；executed 追加在矩阵行之后 */
  readonly coverage?: { readonly executed?: readonly string[]; readonly pending?: readonly string[] };
  readonly crossDatasetChecks?: readonly MarketFlowCrossDatasetCheck[];
}

export interface MarketFlowMatrixEvidence {
  readonly scenarioId: string;
  readonly runMode: Scn009Evidence['runMode'];
  readonly coverage: Scn009Evidence['coverage'];
  readonly environment: Record<string, unknown>;
  readonly datasets: Array<{
    readonly datasetId: string;
    readonly label: string;
    readonly options: { readonly isLong: boolean; readonly priceMovePercent: number };
    readonly evidence: Scn009Evidence;
  }>;
  /** 矩阵级断言（crossDatasetChecks 结果）；不通过不抛错，由 spec 断言并在证据中保留 FAIL 记录 */
  readonly matrixAssertions: Array<{ name: string; passed: boolean; actual: string; expected: string }>;
  readonly summary: { readonly total: number; readonly passed: number; readonly assertions: number };
}

async function adminRawRpc(url: string, method: string, params: readonly unknown[] = []): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const body = await response.json() as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message ?? 'unknown RPC error'}`);
  return body.result;
}

// 数据集数组模式（SCN-070 的多数据集单 spec 移植）：每个数据集独立 evm_snapshot/revert，
// 失败带数据集前缀抛出；报告层按数据集独立保留结果（txStep 跨数据集顺延编号）。
export async function runMarketFlowMatrix(
  runtime: RuntimeConfig,
  input: MarketFlowMatrixInput,
): Promise<MarketFlowMatrixEvidence> {
  const adminUrl = runtime.adminRpcUrl ?? runtime.rpcUrl;
  const persist = process.env.E2E_PERSIST_FORK_STATE === 'true';
  const results: MarketFlowMatrixEvidence['datasets'] = [];
  let assertionCount = 0;
  for (const dataset of input.datasets) {
    const snapshotId = persist ? undefined : await adminRawRpc(adminUrl, 'evm_snapshot');
    try {
      const evidence = await runMarketFlow(runtime, {
        scenarioId: `${input.scenarioId}/${dataset.datasetId}`,
        isLong: dataset.isLong,
        ...(dataset.priceMovePercent !== undefined ? { priceMovePercent: dataset.priceMovePercent } : {}),
        ...(dataset.middlePhases !== undefined ? { middlePhases: dataset.middlePhases } : {}),
        ...(dataset.beforeClose !== undefined ? { beforeClose: dataset.beforeClose, datasetId: dataset.datasetId } : {}),
      });
      assertionCount += evidence.assertions.length;
      results.push({
        datasetId: dataset.datasetId,
        label: dataset.label,
        options: { isLong: dataset.isLong, priceMovePercent: dataset.priceMovePercent ?? 0 },
        evidence,
      });
    } catch (error) {
      throw new Error(`${input.scenarioId}/${dataset.datasetId}：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (snapshotId !== undefined) {
        const reverted = await adminRawRpc(adminUrl, 'evm_revert', [snapshotId]);
        if (reverted !== true) throw new Error(`${input.scenarioId}/${dataset.datasetId}：evm_revert 失败`);
      }
    }
  }
  const first = results[0]?.evidence;
  // 矩阵级对照：读各数据集 observations[metric]（bigint），按给定顺序检查严格递减。
  // 与数据集内 check() 不同，这里不抛错：数据集都已跑完，保留 FAIL 记录进证据比丢证据更有诊断价值；
  // 通过与否由 spec expect 与看板「MATRIX 跨数据集对照」行共同呈现。
  const matrixAssertions: MarketFlowMatrixEvidence['matrixAssertions'] = [];
  for (const checkSpec of input.crossDatasetChecks ?? []) {
    const samples = checkSpec.strictlyDescending.map((datasetId) => {
      const item = results.find((entry) => entry.datasetId === datasetId);
      if (!item) throw new Error(`${input.scenarioId}：跨数据集断言「${checkSpec.name}」引用了不存在的数据集 ${datasetId}`);
      const value = item.evidence.observations[checkSpec.metric];
      if (typeof value !== 'bigint') throw new Error(`${input.scenarioId}/${datasetId}：observations.${checkSpec.metric} 缺失或非 bigint`);
      return { datasetId, value };
    });
    const passed = samples.every((sample, index) => index === 0 || samples[index - 1]!.value > sample.value);
    matrixAssertions.push({
      name: checkSpec.name,
      passed,
      actual: samples.map((sample) => `${sample.datasetId}=${sample.value}`).join('，'),
      expected: `${samples.map((sample) => sample.datasetId).join(' > ')}（${checkSpec.metric} 严格递减）`,
    });
    assertionCount += 1;
  }
  return {
    scenarioId: input.scenarioId,
    runMode: first?.runMode ?? (runtime.signingMode === 'private-key' ? 'tx-fork-private-key' : 'tx-fork-impersonation'),
    coverage: {
      executed: [
        `数据集矩阵：${results.map((item) => item.datasetId).join('、')}`,
        ...(input.coverage?.executed ?? []),
        ...(first?.coverage.executed ?? []),
      ],
      pending: [...(input.coverage?.pending ?? first?.coverage.pending ?? [])],
      completeScenario: false,
    },
    environment: first?.environment ?? {},
    datasets: results,
    matrixAssertions,
    summary: { total: results.length, passed: results.length, assertions: assertionCount },
  };
}

export interface ResidualPositionCloseResult {
  readonly closed: boolean;
  readonly marketIndex: number;
  readonly sizeInUsd?: string;
  readonly collateralAmount?: string;
  readonly createTxHash?: string;
  readonly createBlock?: number;
  readonly orderKey?: string;
  readonly executeTxHash?: string;
  readonly executeBlock?: number;
  readonly positionAfter?: boolean;
}

// 运维工具：清理残仓。数据集矩阵被网络中断等打断时，finally 的 evm_revert 可能未执行，fork 上留下 trader 仓位，
// 之后 runMarketFlow 的「执行前无多/空仓」前置检查直接失败（2026-08-21 实例：DNS 解析失败中断 SCN-009 第三组）。
// 这里按 runMarketFlow 的同一路径（刷新 Oracle 时间戳 → 市价全平单 → Inline Keeper 执行 → 确认订单结清）平掉残仓。
// 仅支持 mock-market + Inline Keeper；无残仓时直接返回 closed=false，不发任何交易。
export async function closeResidualPosition(
  runtime: RuntimeConfig,
  options: { readonly isLong: boolean },
): Promise<ResidualPositionCloseResult> {
  const isLong = options.isLong;
  if (!runtime.testAccount || !runtime.keeperAccount) {
    throw new Error('closeResidualPosition 需要 E2E_TEST_ACCOUNT 与 E2E_KEEPER_ACCOUNT');
  }
  if (runtime.keeperMode !== 'inline') throw new Error('closeResidualPosition 仅支持 Inline Keeper');
  const deps = await loadLegacyDependencies();
  const deploymentDir = deploymentPath();
  const baseDeployment = deps.loadDeployment(deploymentDir);
  const mockResourceAlias = process.env.E2E_MARKET_RESOURCE_ALIAS ?? 'default-mock';
  const mockResource = await resolveMockMarketBundle(runtime.environment, mockResourceAlias);
  if (!mockResource || mockResource.market?.status !== 'registered' || mockResource.market.marketIndex === undefined
    || !mockResource.collateralToken || !mockResource.token?.address || !mockResource.oracle?.address) {
    throw new Error(`${runtime.environment}/${mockResourceAlias} 缺少已注册 Mock Market Bundle`);
  }
  const marketIndex = mockResource.market.marketIndex;
  const deployment: LegacyDeployment = {
    ...baseDeployment,
    name: `${baseDeployment.name} + ${runtime.environment}/${mockResourceAlias}`,
    addresses: { ...baseDeployment.addresses, usdc: mockResource.collateralToken.address },
  };
  const rpc = new deps.Rpc(runtime.rpcUrl);
  const ledgerContext = { trader: runtime.testAccount, marketIndex, isLong };
  const before = await takeSnapshot(deps, rpc, deployment, ledgerContext);
  const residual = positionOf(before);
  if (!residual) return { closed: false, marketIndex };

  const broadcaster = runtime.signingMode === 'private-key'
    ? await signedBroadcaster(runtime, rpc, deps.extractOrderKey)
    : await deps.impersonateBroadcaster({ rpcUrl: runtime.rpcUrl, deploymentDir });
  await refreshMockOracleTimestamps(runtime, [
    { role: 'index', address: mockResource.oracle.address },
    ...(mockResource.collateralOracle ? [{ role: 'collateral' as const, address: mockResource.collateralOracle.address }] : []),
  ]);
  const close = await broadcaster.send({
    ...deps.buildDecreaseOrder({
      exchangeRouter: deployment.addresses.exchangeRouter,
      orderVault: deployment.addresses.orderVault,
      account: runtime.testAccount,
      marketIndex,
      isLong,
      sizeDeltaUsd: residual.sizeInUsd,
      collateralDelta: 0n,
      executionFee: EXECUTION_FEE,
    }),
    from: runtime.testAccount,
  });
  if (!close.ok) throw new Error(`残仓全平单创建失败：${close.error ?? close.txHash}`);
  const orderKey = requireValue(close.orderKey, '残仓全平单未解出 orderKey');
  const providers = await inlineOracleProviders(runtime, deployment, mockResource.token.address);
  const execution = await sendKeeperExecution(runtime, rpc, buildInlineExecuteOrder(
    deps, deployment, orderKey, mockResource.token.address, providers,
  ));
  if (!execution.ok) throw new Error(`残仓全平 Keeper 执行失败：${execution.txHash}`);
  const stillPending = await deps.orderIsPending(rpc, {
    dataStore: deployment.addresses.dataStore, orderListKey: deps.orderListKey, orderKey,
  });
  if (stillPending) throw new Error('Inline Keeper 已发送全平执行交易，但残仓订单仍在挂单态');
  const after = await takeSnapshot(deps, rpc, deployment, ledgerContext);
  return {
    closed: true,
    marketIndex,
    sizeInUsd: residual.sizeInUsd.toString(),
    collateralAmount: residual.collateralAmount.toString(),
    createTxHash: close.txHash,
    createBlock: close.blockNumber,
    orderKey,
    executeTxHash: execution.txHash,
    executeBlock: execution.blockNumber,
    positionAfter: Boolean(positionOf(after)),
  };
}

export function stringifyEvidence(value: unknown): string {
  return `${JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'bigint' ? item.toString() : item, 2)}\n`;
}

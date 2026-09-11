import {
  createPublicClient,
  decodeEventLog,
  encodeAbiParameters,
  getAddress,
  http,
  keccak256,
  parseAbi,
  parseAbiParameters,
  type Abi,
} from 'viem';

import { environmentNames, type EnvironmentName } from '../../../config/environments/catalog.js';
import { loadBaselineRegistry } from '../../config/baseline.js';
import { loadDeploymentAbi, type DeploymentManifest } from '../../config/deployment.js';
import { loadEnvironmentBinding, type EnvironmentBindingContext } from '../../config/environment-binding.js';
import {
  isMockResourceEnvironment,
  listMockMarketBundles,
  loadMockResourceRegistrySync,
  type MockResourceRecord,
} from '../../config/mock-resources.js';
import { loadRuntimeConfig, type RuntimeConfig } from '../../config/runtime.js';
import { resolveBlockExplorerBaseUrl, transactionExplorerUrl } from '../../config/transaction-links.js';
import { takeLedgerSnapshot, type LedgerAddresses } from '../../drivers/ledger.js';
import {
  decimal,
  evidenceEnvelopeSchema,
  type ActionEvidence,
  type ActionOutcome,
  type Address,
  type EvidenceCapability,
  type EvidenceEnvelope,
  type EnvironmentIdentity,
  type EventRef,
  type FlowType,
  type Hex,
  type JsonValue,
  type OracleRef,
  type ParameterRef,
  type SnapshotRef,
  type TransactionRef,
  type TransactionRole,
} from '../../evidence/evidence-v2.js';
import {
  buildRuntimeEnvironmentIdentity,
  resolveRuntimeTestEnvironment,
  type RuntimeExecutionSelection,
} from '../../execution/runtime-environment.js';
import { readTradeParameterSnapshot } from '../chain-parameter-snapshot.js';
import {
  resolveTxVerifyBaseMetadata,
  type TxVerifyBaseMetadata,
  type TxVerifyMetadata,
  type TxVerifyOverrides,
  type TxVerifyPerTxMetadata,
} from './tx-metadata.js';

export type { TxVerifyMetadata, TxVerifyOverrides, TxVerifyPerTxMetadata } from './tx-metadata.js';

/**
 * tx hash → Evidence V2 Envelope 适配器。
 *
 * 与 market-flow-v1 的 runMarketFlowEvidenceV2 是「同一套组装、输入换成 tx hash」：
 * receipt + EventEmitter 日志解码（按 key 名取值，不按下标）→ 交易分类 / 按 orderKey 配对 →
 * execBlock−1 / execBlock 钉块快照（Reader 仓位 + 四 Vault 余额 + DataStore 键）→ ActionEvidence。
 *
 * 硬约束：
 * - RPC / chainId 只走 RuntimeConfig（loadRuntimeConfig）+ resolveRuntimeTestEnvironment，本文件不拼 URL、不写密钥；
 * - 历史块读不到就标 missing（readErrors + values.snapshotStatus），绝不用最新块冒充；
 * - 不产出任何 verdict：envelope 只有原始事实，期望与判定由 packs 负责。
 */
export interface TxVerifyRequest {
  env: string;
  hashes: Hex[];
  caseId?: string;
  overrides?: TxVerifyOverrides;
  /** TestCode 工程根；默认 process.cwd()。 */
  projectRoot?: string;
}

export interface TxVerifyResult {
  readonly envelope: EvidenceEnvelope;
  readonly metadata: TxVerifyMetadata;
  readonly warnings: string[];
}

type JsonRecord = Record<string, unknown>;

/** Multicall3 canonical 地址（与 src/drivers/ledger.ts 同款；Base Sepolia 与 Tenderly fork 通用）。 */
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as const;
const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

/** Order.OrderType（order/Order.sol:10）——按枚举序号解释 OrderCreated.uint.orderType。 */
const ORDER_TYPES = [
  'MarketIncrease', 'LimitIncrease', 'MarketDecrease', 'LimitDecrease', 'StopLossDecrease', 'Liquidation', 'StopIncrease',
] as const;
const ORDER_TYPE_LIQUIDATION = 5n;
/** Order.SecondaryOrderType（order/Order.sol:30）：0 None，1 Adl。 */
const SECONDARY_ORDER_TYPE_ADL = 1n;

const EVENT_GROUPS = [
  ['addressItems', 'address'],
  ['uintItems', 'uint'],
  ['intItems', 'int'],
  ['boolItems', 'bool'],
  ['bytes32Items', 'bytes32'],
  ['bytesItems', 'bytes'],
  ['stringItems', 'string'],
] as const;

type TxKind =
  | 'create'
  | 'execute-increase'
  | 'execute-decrease'
  | 'execute'
  | 'liquidation'
  | 'adl'
  | 'cancel'
  | 'frozen'
  | 'funding-only'
  | 'reverted'
  | 'unknown';

interface DecodedFxEvent {
  readonly name: string;
  readonly emitter: Address;
  readonly logIndex: number;
  readonly msgSender?: string;
  readonly topic1?: Hex;
  readonly topic2?: Hex;
  /** 按 key 名分组的 items：address / uint / int / bool / bytes32 / bytes / string。 */
  readonly groups: Record<string, Record<string, unknown>>;
  readonly arrays: Record<string, Record<string, unknown>>;
}

interface PositionContext {
  readonly account: Address;
  readonly marketIndex: bigint;
  readonly isLong: boolean;
}

interface LoadedTransaction {
  readonly hash: Hex;
  readonly transaction: JsonRecord;
  readonly receipt: JsonRecord;
  readonly blockNumber: bigint;
  readonly blockHash?: Hex;
  readonly transactionIndex: number;
  readonly blockTimestamp: bigint;
  readonly timestampIso: string;
  readonly status: TransactionRef['status'];
  readonly events: readonly DecodedFxEvent[];
  readonly otherLogCount: number;
  readonly kind: TxKind;
  readonly role: TransactionRole;
  readonly orderKey?: Hex;
  readonly positionKey?: Hex;
  readonly orderType?: bigint;
  readonly secondaryOrderType?: bigint;
  readonly context?: PositionContext;
  readonly marketIndex?: bigint;
}

interface AdapterContext {
  readonly projectRoot: string;
  readonly env: EnvironmentName;
  readonly runtime: RuntimeConfig;
  readonly binding: EnvironmentBindingContext;
  readonly manifest: DeploymentManifest;
  readonly mockResource: MockResourceRecord | undefined;
  readonly eventEmitter: Address;
  readonly eventEmitterAbi: Abi;
  readonly client: ReturnType<typeof createPublicClient>;
  readonly explorerBase: string | undefined;
  readonly warnings: string[];
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function json(value: unknown): JsonValue {
  if (typeof value === 'bigint') return value.toString();
  if (value === undefined) return null;
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value as JsonValue;
  if (Array.isArray(value)) return value.map(json);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as JsonRecord).map(([key, item]) => [key, json(item)]));
  }
  return String(value);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isoOf(timestamp: bigint): string {
  return new Date(Number(timestamp) * 1000).toISOString();
}

function toBigint(value: unknown): bigint | undefined {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(value);
  if (typeof value === 'string' && /^(0x[0-9a-fA-F]+|-?\d+)$/.test(value)) return BigInt(value);
  return undefined;
}

function hexOf(value: unknown): Hex | undefined {
  return typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value) ? value as Hex : undefined;
}

function addressOf(value: unknown): Address | undefined {
  return typeof value === 'string' && ADDRESS_PATTERN.test(value) ? getAddress(value) : undefined;
}

function abiStringKey(name: string): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters('string'), [name]));
}

// keccak256(abi.encode(BASE, marketIndex))：FX100Keys.sol:811/:871 的市场一维键。
function marketKey(baseKey: Hex, marketIndex: bigint): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters('bytes32,uint256'), [baseKey, marketIndex]));
}

// keccak256(abi.encode(BASE, marketIndex, isLong))：FX100Keys.sol:614/:622/:856/:864 的 (marketIndex, isLong) 二维键。
function marketSideKey(baseKey: Hex, marketIndex: bigint, isLong: boolean): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters('bytes32,uint256,bool'), [baseKey, marketIndex, isLong]));
}

const dataStoreAbi = parseAbi([
  'function getUint(bytes32) view returns (uint256)',
  'function getInt(bytes32) view returns (int256)',
  'function getBytes32(bytes32) view returns (bytes32)',
]);

/**
 * 执行类 tx 前后两块都要读的 DataStore 状态键（参数表之外的“状态”，不是配置）：
 * 动态点差 clamp 上下界 × 两侧、Funding per-size 两侧、Funding 更新时间、Funding skew EMA。
 */
function marketStatePlan(dataStore: Address, marketIndex: bigint) {
  const getUint = (key: Hex) => ({ address: dataStore, abi: dataStoreAbi, functionName: 'getUint', args: [key] }) as const;
  const getInt = (key: Hex) => ({ address: dataStore, abi: dataStoreAbi, functionName: 'getInt', args: [key] }) as const;
  const getBytes32 = (key: Hex) => ({ address: dataStore, abi: dataStoreAbi, functionName: 'getBytes32', args: [key] }) as const;
  const plan: Array<{ label: string; key: Hex; valueType: 'uint' | 'int' | 'bytes32'; call: ReturnType<typeof getUint | typeof getInt | typeof getBytes32> }> = [];
  for (const base of ['MIN_DYNAMIC_SPREAD', 'MAX_DYNAMIC_SPREAD'] as const) {
    for (const isLong of [true, false]) {
      const key = marketSideKey(abiStringKey(base), marketIndex, isLong);
      plan.push({ label: `${base}(${isLong})`, key, valueType: 'int', call: getInt(key) });
    }
  }
  for (const base of ['NEGATIVE_FUNDING_FEE_PER_SIZE', 'POSITIVE_FUNDING_FEE_PER_SIZE'] as const) {
    for (const isLong of [true, false]) {
      const key = marketSideKey(abiStringKey(base), marketIndex, isLong);
      plan.push({ label: `${base}(${isLong})`, key, valueType: 'uint', call: getUint(key) });
    }
  }
  const updatedAt = marketKey(abiStringKey('FUNDING_UPDATED_AT'), marketIndex);
  plan.push({ label: 'FUNDING_UPDATED_AT', key: updatedAt, valueType: 'uint', call: getUint(updatedAt) });
  const skewEma = marketKey(abiStringKey('FUNDING_SKEW_EMA'), marketIndex);
  plan.push({ label: 'FUNDING_SKEW_EMA', key: skewEma, valueType: 'bytes32', call: getBytes32(skewEma) });
  return plan;
}

/** loadRuntimeConfig 只认 process.env.E2E_ENV；按请求环境临时钉住并在返回后还原，不改 runtime-environment。 */
function loadRuntimeFor(env: EnvironmentName): RuntimeConfig {
  const previous = process.env.E2E_ENV;
  process.env.E2E_ENV = env;
  try {
    return loadRuntimeConfig();
  } finally {
    if (previous === undefined) delete process.env.E2E_ENV;
    else process.env.E2E_ENV = previous;
  }
}

function decodeEmitterLog(abi: Abi, log: JsonRecord): DecodedFxEvent | undefined {
  const data = hexOf(log.data);
  const topics = Array.isArray(log.topics) ? log.topics.filter((item): item is Hex => hexOf(item) !== undefined) : [];
  if (!data) return undefined;
  let decoded: { args: unknown };
  try {
    decoded = decodeEventLog({ abi, data, topics: topics as [Hex, ...Hex[]], strict: false }) as { args: unknown };
  } catch {
    return undefined;
  }
  const args = record(decoded.args);
  if (typeof args.eventName !== 'string') return undefined;
  const eventData = record(args.eventData);
  const groups: Record<string, Record<string, unknown>> = {};
  const arrays: Record<string, Record<string, unknown>> = {};
  for (const [groupName, kind] of EVENT_GROUPS) {
    const group = record(eventData[groupName]);
    const items: Record<string, unknown> = {};
    for (const item of Array.isArray(group.items) ? group.items : []) {
      const entry = record(item);
      if (typeof entry.key === 'string') items[entry.key] = entry.value;
    }
    groups[kind] = items;
    const arrayItems: Record<string, unknown> = {};
    for (const item of Array.isArray(group.arrayItems) ? group.arrayItems : []) {
      const entry = record(item);
      if (typeof entry.key === 'string') arrayItems[entry.key] = entry.value;
    }
    if (Object.keys(arrayItems).length > 0) arrays[kind] = arrayItems;
  }
  const emitter = addressOf(log.address);
  if (!emitter) return undefined;
  const logIndex = Number(log.logIndex ?? -1);
  const topic1 = hexOf(args.topic1);
  const topic2 = hexOf(args.topic2);
  return {
    name: args.eventName,
    emitter,
    logIndex: Number.isFinite(logIndex) ? logIndex : -1,
    ...(typeof args.msgSender === 'string' ? { msgSender: args.msgSender } : {}),
    ...(topic1 ? { topic1 } : {}),
    ...(topic2 ? { topic2 } : {}),
    groups,
    arrays,
  };
}

function item(event: DecodedFxEvent | undefined, kind: string, key: string): unknown {
  return event?.groups[kind]?.[key];
}

function firstEvent(events: readonly DecodedFxEvent[], name: string): DecodedFxEvent | undefined {
  return events.find((event) => event.name === name);
}

function hasEvent(events: readonly DecodedFxEvent[], name: string): boolean {
  return events.some((event) => event.name === name);
}

function contextOf(event: DecodedFxEvent | undefined): PositionContext | undefined {
  const account = addressOf(item(event, 'address', 'account'));
  const marketIndex = toBigint(item(event, 'uint', 'marketIndex'));
  const isLong = item(event, 'bool', 'isLong');
  if (!account || marketIndex === undefined || typeof isLong !== 'boolean') return undefined;
  return { account, marketIndex, isLong };
}

function classify(events: readonly DecodedFxEvent[], reverted: boolean): {
  kind: TxKind;
  orderKey?: Hex;
  positionKey?: Hex;
  orderType?: bigint;
  secondaryOrderType?: bigint;
  context?: PositionContext;
  marketIndex?: bigint;
} {
  if (reverted) return { kind: 'reverted' };
  const created = firstEvent(events, 'OrderCreated');
  const executed = firstEvent(events, 'OrderExecuted');
  const cancelled = firstEvent(events, 'OrderCancelled');
  const frozen = firstEvent(events, 'OrderFrozen');
  const increase = firstEvent(events, 'PositionIncrease');
  const decrease = firstEvent(events, 'PositionDecrease');
  const fees = firstEvent(events, 'PositionFeesCollected');
  const funding = firstEvent(events, 'Funding');

  const orderKey = hexOf(item(created, 'bytes32', 'key'))
    ?? hexOf(item(executed, 'bytes32', 'key'))
    ?? hexOf(item(cancelled, 'bytes32', 'key'))
    ?? hexOf(item(frozen, 'bytes32', 'key'))
    ?? hexOf(item(increase ?? decrease, 'bytes32', 'orderKey'))
    ?? hexOf(item(fees, 'bytes32', 'orderKey'))
    ?? created?.topic1 ?? executed?.topic1 ?? cancelled?.topic1 ?? frozen?.topic1;
  const positionKey = hexOf(item(increase ?? decrease, 'bytes32', 'positionKey')) ?? hexOf(item(fees, 'bytes32', 'positionKey'));
  const orderType = toBigint(item(created, 'uint', 'orderType'))
    ?? toBigint(item(increase ?? decrease, 'uint', 'orderType'));
  const secondaryOrderType = toBigint(item(executed, 'uint', 'secondaryOrderType'));
  const context = contextOf(increase ?? decrease) ?? contextOf(created);
  const marketIndex = context?.marketIndex
    ?? toBigint(item(fees, 'uint', 'marketIndex'))
    ?? (funding?.topic1 ? BigInt(funding.topic1) : undefined);
  const common = {
    ...(orderKey ? { orderKey } : {}),
    ...(positionKey ? { positionKey } : {}),
    ...(orderType !== undefined ? { orderType } : {}),
    ...(secondaryOrderType !== undefined ? { secondaryOrderType } : {}),
    ...(context ? { context } : {}),
    ...(marketIndex !== undefined ? { marketIndex } : {}),
  };

  let kind: TxKind;
  if (executed && created && orderType === ORDER_TYPE_LIQUIDATION) kind = 'liquidation';
  else if (executed && secondaryOrderType === SECONDARY_ORDER_TYPE_ADL) kind = 'adl';
  else if (executed && increase) kind = 'execute-increase';
  else if (executed && decrease) kind = 'execute-decrease';
  else if (executed) kind = 'execute';
  else if (cancelled) kind = 'cancel';
  else if (frozen) kind = 'frozen';
  else if (created) kind = 'create';
  else if (events.length > 0 && events.every((event) => /funding/i.test(event.name))) kind = 'funding-only';
  else kind = 'unknown';
  return { kind, ...common };
}

function roleOf(
  manifest: DeploymentManifest,
  kind: TxKind,
  actor: Address,
  events: readonly DecodedFxEvent[],
  warnings: string[],
  hash: Hex,
): TransactionRole {
  const roles = manifest.roles;
  const same = (value: string | undefined) => value !== undefined && ADDRESS_PATTERN.test(value) && getAddress(value) === actor;
  const isKeeperRole = same(roles.orderKeeper) || same(roles.liquidationKeeper) || same(roles.adlKeeper);
  const isAdminRole = same(roles.controller) || same(roles.configKeeper);
  const account = addressOf(item(firstEvent(events, 'OrderCreated') ?? firstEvent(events, 'OrderCancelled') ?? firstEvent(events, 'OrderFrozen'), 'address', 'account'));
  switch (kind) {
    case 'liquidation':
    case 'adl':
    case 'execute-increase':
    case 'execute-decrease':
    case 'execute':
    case 'frozen':
      if (!isKeeperRole) warnings.push(`${hash} 由 ${actor} 执行，但该地址不在 manifest.roles 的 Keeper 角色中；按事件语义仍记 role=keeper。`);
      return 'keeper';
    case 'cancel':
      if (account && account === actor) return 'trader';
      if (isKeeperRole) return 'keeper';
      warnings.push(`${hash} OrderCancelled 的发起人 ${actor} 既不是订单 account 也不是 manifest Keeper；按 trader 记录。`);
      return 'trader';
    case 'create':
      if (account && account !== actor) warnings.push(`${hash} OrderCreated.account=${account} 与交易发起人 ${actor} 不同（子账户 / Relay 路径），role 仍记 trader。`);
      return 'trader';
    default:
      if (isKeeperRole) return 'keeper';
      if (isAdminRole) return 'admin';
      return 'trader';
  }
}

async function loadTransaction(context: AdapterContext, hash: Hex): Promise<LoadedTransaction> {
  const [receiptRaw, transactionRaw] = await Promise.all([
    context.client.getTransactionReceipt({ hash }),
    context.client.getTransaction({ hash }),
  ]);
  const receipt = record(receiptRaw);
  const transaction = record(transactionRaw);
  const blockNumber = toBigint(receipt.blockNumber);
  if (blockNumber === undefined) throw new Error(`${hash} 回执缺少 blockNumber`);
  const block = record(await context.client.getBlock({ blockNumber }));
  const blockTimestamp = toBigint(block.timestamp);
  if (blockTimestamp === undefined) throw new Error(`${hash} 所在区块 ${blockNumber} 缺少 timestamp`);
  const status: TransactionRef['status'] = receipt.status === 'success' ? 'SUCCESS' : receipt.status === 'reverted' ? 'REVERTED' : 'UNKNOWN';
  const logs = Array.isArray(receipt.logs) ? receipt.logs.map(record) : [];
  const events: DecodedFxEvent[] = [];
  let otherLogCount = 0;
  for (const log of logs) {
    const emitter = addressOf(log.address);
    if (emitter !== context.eventEmitter) { otherLogCount += 1; continue; }
    const decoded = decodeEmitterLog(context.eventEmitterAbi, log);
    if (decoded) events.push(decoded);
    else context.warnings.push(`${hash} 有 EventEmitter 日志无法用绑定 ABI 解码（logIndex=${String(log.logIndex)}），已跳过。`);
  }
  const classified = classify(events, status === 'REVERTED');
  const actor = addressOf(transaction.from);
  if (!actor) throw new Error(`${hash} 缺少交易 from`);
  const role = roleOf(context.manifest, classified.kind, actor, events, context.warnings, hash);
  const blockHash = hexOf(receipt.blockHash);
  return {
    hash,
    transaction,
    receipt,
    blockNumber,
    ...(blockHash && HASH_PATTERN.test(blockHash) ? { blockHash } : {}),
    transactionIndex: Number(receipt.transactionIndex ?? 0),
    blockTimestamp,
    timestampIso: isoOf(blockTimestamp),
    status,
    events,
    otherLogCount,
    role,
    ...classified,
  };
}

function transactionRef(context: AdapterContext, loaded: LoadedTransaction): TransactionRef {
  const tx = loaded.transaction;
  const receipt = loaded.receipt;
  const actor = addressOf(tx.from)!;
  const to = addressOf(tx.to);
  const nonce = toBigint(tx.nonce);
  const r = toBigint(tx.r);
  const s = toBigint(tx.s);
  const signatureVerified = r !== undefined && s !== undefined && r !== 0n && s !== 0n;
  const gasUsed = toBigint(receipt.gasUsed) ?? 0n;
  const explorerUrl = context.explorerBase ? transactionExplorerUrl(context.explorerBase, loaded.hash) : undefined;
  const provider = context.explorerBase?.includes('basescan.org') ? 'basescan' as const : 'tenderly-vnet' as const;
  return {
    txHash: loaded.hash,
    blockNumber: decimal(loaded.blockNumber),
    ...(loaded.blockHash ? { blockHash: loaded.blockHash } : {}),
    actor,
    ...(to ? { to } : {}),
    role: loaded.role,
    ...(loaded.orderKey && HASH_PATTERN.test(loaded.orderKey) ? { orderKey: loaded.orderKey } : {}),
    gasUsed: decimal(gasUsed),
    status: loaded.status,
    ...(nonce !== undefined ? { nonce: decimal(nonce) } : {}),
    ...(typeof tx.type === 'string' ? { transactionType: tx.type } : {}),
    signatureVerified,
    receipt: {
      transactionHash: loaded.hash,
      blockNumber: decimal(loaded.blockNumber),
      ...(loaded.blockHash ? { blockHash: loaded.blockHash } : {}),
      status: loaded.status,
      gasUsed: decimal(gasUsed),
    },
    ...(explorerUrl ? { explorer: { provider, transactionUrl: explorerUrl } } : {}),
  };
}

/** 事件 args 采用 legacy DecodedEvent 形状（eventName/txHash/blockNumber + 按 key 名分组），packs 读 `args.uint.<key>`。 */
function eventRefs(loaded: LoadedTransaction): EventRef[] {
  return loaded.events.map((event) => ({
    name: event.name,
    address: event.emitter,
    transactionHash: loaded.hash,
    blockNumber: decimal(loaded.blockNumber),
    ...(event.logIndex >= 0 ? { logIndex: event.logIndex } : {}),
    source: 'receipt-log' as const,
    args: json({
      eventName: event.name,
      txHash: loaded.hash,
      blockNumber: Number(loaded.blockNumber),
      logIndex: event.logIndex,
      emitter: event.emitter,
      ...(event.msgSender ? { msgSender: event.msgSender } : {}),
      ...(event.topic1 ? { topic1: event.topic1 } : {}),
      ...(event.topic2 ? { topic2: event.topic2 } : {}),
      ...event.groups,
      ...(Object.keys(event.arrays).length > 0 ? { arrays: event.arrays } : {}),
    }),
  }));
}

/**
 * OraclePriceUpdate（oracle/Oracle.sol:356-366）：token / minPrice / maxPrice / timestamp 按 key 名取值，落为 OracleRef。
 * 价格是在执行 tx 内部由 Oracle 合约设置的（同一笔 Keeper 交易），不存在独立的 oracle 角色交易，
 * 因此只钉 blockNumber、不填 transactionHash——完整性规则要求 OracleRef.transactionHash 唯一指向本动作的 oracle TransactionRef。
 */
function oracleRefs(loaded: LoadedTransaction): OracleRef[] {
  return loaded.events.flatMap((event) => {
    if (event.name !== 'OraclePriceUpdate') return [];
    const token = addressOf(item(event, 'address', 'token'));
    const min = toBigint(item(event, 'uint', 'minPrice'));
    const max = toBigint(item(event, 'uint', 'maxPrice'));
    const timestamp = toBigint(item(event, 'uint', 'timestamp'));
    if (!token || min === undefined || max === undefined || timestamp === undefined) return [];
    return [{
      token,
      min: decimal(min),
      max: decimal(max),
      timestamp: decimal(timestamp),
      blockNumber: decimal(loaded.blockNumber),
    }];
  });
}

function collateralTokenFor(context: AdapterContext, marketIndex: bigint): { address: Address; source: string } | undefined {
  const market = context.manifest.markets.find((entry) => BigInt(entry.marketIndex) === marketIndex);
  if (market) return { address: getAddress(market.collateralToken), source: `manifest.markets[marketIndex=${marketIndex}].collateralToken` };
  const shared = context.mockResource?.sharedCollateral?.token?.address ?? context.mockResource?.collateralToken?.address;
  if (shared) return { address: getAddress(shared), source: `config/mock-resources.json resources.${context.env}.sharedCollateral.token` };
  const mockUsdc = context.manifest.additionalContracts.mockUsdc;
  if (mockUsdc) return { address: getAddress(mockUsdc), source: 'manifest.additionalContracts.mockUsdc' };
  return undefined;
}

function ledgerAddressesFor(context: AdapterContext, collateralToken: Address): { addresses: LedgerAddresses; feeHandlerMissing: boolean } | undefined {
  const manifest = context.manifest;
  const orderVault = manifest.additionalContracts.orderVault;
  const lpVault = manifest.additionalContracts.lpVault ?? manifest.markets[0]?.vault;
  if (!orderVault || !lpVault) return undefined;
  const feeHandler = manifest.additionalContracts.feeHandler;
  return {
    addresses: {
      usdc: collateralToken,
      dataStore: manifest.contracts.dataStore,
      orderVault,
      positionVault: manifest.contracts.positionVault,
      // 缺 FeeHandler 登记时用 DataStore 地址占位，读数随后置 null 并记 readErrors——绝不让占位地址的余额冒充 FeeHandler。
      feeHandler: feeHandler ?? manifest.contracts.dataStore,
      lpVault,
      reader: manifest.contracts.reader,
    },
    feeHandlerMissing: !feeHandler,
  };
}

/**
 * 钉块快照：Reader 仓位 + 四 Vault 余额 + claimable / OI / 累计成本（takeLedgerSnapshot，与 legacy 逐槽等价）
 * + 市场级 DataStore 状态键（点差上下界 / Funding per-size / Funding 更新时间 / skew EMA）。
 * 任一层读不到只记 readErrors；整块读不到（历史块不可用）则 values.snapshotStatus='missing'。
 */
async function pinnedSnapshot(
  context: AdapterContext,
  input: {
    readonly id: string;
    readonly kind: SnapshotRef['kind'];
    readonly blockNumber: bigint;
    readonly position: PositionContext | undefined;
    readonly marketIndex: bigint | undefined;
    readonly collateralToken: Address | undefined;
  },
): Promise<SnapshotRef> {
  const values: JsonRecord = {};
  const readErrors: string[] = [];
  let blockHash: Hex | undefined;
  try {
    blockHash = hexOf(record(await context.client.getBlock({ blockNumber: input.blockNumber })).blockHash);
  } catch (error) {
    readErrors.push(`block header #${input.blockNumber}: ${message(error)}`);
  }
  let layers = 0;
  let succeeded = 0;

  if (input.position && input.collateralToken) {
    layers += 1;
    const ledger = ledgerAddressesFor(context, input.collateralToken);
    if (!ledger) {
      readErrors.push('ledger: manifest 缺少 additionalContracts.orderVault / lpVault，无法取 Vault 余额');
    } else {
      try {
        const snapshot = await takeLedgerSnapshot({
          rpcUrl: context.runtime.rpcUrl,
          addresses: ledger.addresses,
          context: { trader: input.position.account, marketIndex: input.position.marketIndex, isLong: input.position.isLong },
          blockNumber: Number(input.blockNumber),
          timeoutMs: context.runtime.requestTimeoutMs,
        });
        Object.assign(values, snapshot.values, { positionKey: snapshot.posKey });
        if (ledger.feeHandlerMissing) {
          values.feeReceiverUsdc = null;
          readErrors.push('feeReceiverUsdc: manifest 缺少 additionalContracts.feeHandler，未读取');
        }
        readErrors.push(...snapshot.errors);
        // 全槽失败视为整块不可读（典型：fork 不支持历史块状态）。
        if (snapshot.errors.length < Object.keys(snapshot.values).length) succeeded += 1;
      } catch (error) {
        readErrors.push(`ledger@${input.blockNumber}: ${message(error)}`);
      }
    }
  } else if (input.position && !input.collateralToken) {
    readErrors.push('ledger: 无法确定该市场的抵押 token 地址，未读取 Vault 余额与仓位');
  }

  if (input.marketIndex !== undefined) {
    layers += 1;
    const plan = marketStatePlan(getAddress(context.manifest.contracts.dataStore), input.marketIndex);
    try {
      const results = await context.client.multicall({
        contracts: plan.map((entry) => entry.call) as never,
        blockNumber: input.blockNumber,
        allowFailure: true,
        multicallAddress: MULTICALL3,
      }) as Array<{ status: 'success' | 'failure'; error?: Error; result?: unknown }>;
      const dataStore: JsonRecord = {};
      let ok = 0;
      plan.forEach((entry, index) => {
        const result = results[index];
        if (!result || result.status !== 'success') {
          readErrors.push(`dataStore.${entry.label}: ${result?.error?.message ?? '无返回'}`);
          dataStore[entry.label] = { key: entry.key, valueType: entry.valueType, value: null };
          return;
        }
        ok += 1;
        dataStore[entry.label] = { key: entry.key, valueType: entry.valueType, value: json(result.result) };
      });
      values.dataStore = dataStore;
      if (ok > 0) succeeded += 1;
    } catch (error) {
      readErrors.push(`dataStore@${input.blockNumber}: ${message(error)}`);
    }
  }

  if (layers === 0) {
    readErrors.push('缺少仓位上下文（account/marketIndex/isLong），本块未读取任何链上状态');
  }
  const missing = layers === 0 || succeeded === 0;
  if (missing) {
    values.snapshotStatus = 'missing';
    context.warnings.push(`快照 ${input.id}@${input.blockNumber} 读取失败，已标 missing（下游对应核对降级 NOT_VERIFIED）：${readErrors.join('；') || '无可读层'}`);
  }
  return {
    id: input.id,
    kind: input.kind,
    blockNumber: decimal(input.blockNumber),
    ...(blockHash && HASH_PATTERN.test(blockHash) ? { blockHash } : {}),
    source: input.position ? 'reader' : 'datastore',
    values: json(values),
    ...(readErrors.length > 0 ? { readErrors } : {}),
  };
}

async function tradeParameters(
  context: AdapterContext,
  loaded: LoadedTransaction,
  position: PositionContext,
): Promise<ParameterRef | undefined> {
  const referralStorage = context.manifest.additionalContracts.referralStorage;
  if (!referralStorage) {
    context.warnings.push(`${loaded.hash} 执行块参数快照跳过：manifest 缺少 additionalContracts.referralStorage。`);
    return undefined;
  }
  try {
    const snapshot = await readTradeParameterSnapshot({
      rpcUrl: context.runtime.rpcUrl,
      timeoutMs: context.runtime.requestTimeoutMs,
      dataStore: context.manifest.contracts.dataStore,
      referralStorage,
      marketIndex: Number(position.marketIndex),
      account: position.account,
      blockNumber: Number(loaded.blockNumber),
    });
    return {
      name: 'trade-parameters',
      value: json(snapshot),
      source: 'DataStore/ReferralStorage@executionBlock',
      blockNumber: decimal(loaded.blockNumber),
    };
  } catch (error) {
    context.warnings.push(`${loaded.hash} 执行块 #${loaded.blockNumber} 参数快照读取失败（历史块不可用或 RPC 错误）：${message(error)}；parameters 留空。`);
    return undefined;
  }
}

function orderTypeName(orderType: bigint | undefined): string | undefined {
  return orderType === undefined ? undefined : ORDER_TYPES[Number(orderType)] ?? `OrderType#${orderType}`;
}

function createActionType(orderType: bigint | undefined): string {
  switch (orderType) {
    case 0n: return 'submitMarketIncrease';
    case 2n: return 'submitMarketDecrease';
    case 1n:
    case 6n: return 'placeLimit';
    case 3n:
    case 4n: return 'addTpSl';
    case 5n: return 'liquidate';
    default: return 'submitOrder';
  }
}

function createInput(loaded: LoadedTransaction, pairedActionId: string | undefined): JsonRecord {
  const created = firstEvent(loaded.events, 'OrderCreated');
  const isLong = item(created, 'bool', 'isLong');
  const isSizeDeltaUsd = item(created, 'bool', 'isSizeDeltaUsd');
  const sizeDelta = toBigint(item(created, 'uint', 'sizeDelta'));
  return {
    side: isLong === true ? 'long' : isLong === false ? 'short' : undefined,
    ...(isSizeDeltaUsd === false ? { sizeDeltaTokens: sizeDelta } : { sizeDeltaUsd: sizeDelta }),
    isSizeDeltaUsd,
    collateralAmount: toBigint(item(created, 'uint', 'initialCollateralDeltaAmount')),
    orderType: orderTypeName(loaded.orderType),
    orderTypeCode: loaded.orderType,
    acceptablePrice: toBigint(item(created, 'uint', 'acceptablePrice')),
    triggerPrice: toBigint(item(created, 'uint', 'triggerPrice')),
    executionFee: toBigint(item(created, 'uint', 'executionFee')),
    marketIndex: loaded.marketIndex,
    account: item(created, 'address', 'account'),
    orderKey: loaded.orderKey,
    source: 'OrderCreated 事件（按 key 名取值）',
    ...(pairedActionId ? { terminalActionId: pairedActionId } : { terminal: 'missing' }),
  };
}

function executeInput(
  loaded: LoadedTransaction,
  creation: { actionId: string } | 'same-tx' | 'missing',
  collateral: { address: Address; source: string } | undefined,
): JsonRecord {
  const decrease = firstEvent(loaded.events, 'PositionDecrease');
  const remainingSize = toBigint(item(decrease, 'uint', 'sizeInUsd'));
  const order = loaded.kind === 'liquidation' ? 'liquidation'
    : loaded.kind === 'adl' ? 'adl'
      : loaded.kind === 'execute-increase' ? 'open'
        : loaded.kind === 'execute-decrease' ? 'close' : 'execute';
  return {
    order,
    orderKey: loaded.orderKey,
    positionKey: loaded.positionKey,
    orderType: orderTypeName(loaded.orderType),
    orderTypeCode: loaded.orderType,
    secondaryOrderType: loaded.secondaryOrderType,
    marketIndex: loaded.marketIndex,
    account: loaded.context?.account,
    side: loaded.context ? (loaded.context.isLong ? 'long' : 'short') : undefined,
    ...(decrease ? { position: 'main', positionEffect: remainingSize === 0n ? 'full-close' : 'partial-close' } : {}),
    ...(creation === 'missing'
      ? { creation: 'missing', creationNote: '未提供创建 tx（OrderCreated），订单意图字段缺失；只能核对执行侧事实。' }
      : creation === 'same-tx'
        ? { creation: 'same-tx' }
        : { creationActionId: creation.actionId }),
    ...(collateral ? { collateralToken: collateral.address, collateralTokenSource: collateral.source } : {}),
    otherLogCount: loaded.otherLogCount,
  };
}

function capabilitiesOf(input: {
  readonly loaded: LoadedTransaction;
  readonly snapshots: readonly SnapshotRef[];
  readonly parameters: readonly ParameterRef[];
  readonly oracle: readonly OracleRef[];
  readonly outcome: ActionOutcome;
}): EvidenceCapability[] {
  const capabilities = new Set<EvidenceCapability>(['transaction']);
  if (input.oracle.length > 0) capabilities.add('oracle');
  if (input.loaded.role === 'keeper' || input.loaded.role === 'service') capabilities.add('keeper');
  if (input.loaded.events.some((event) => event.name.startsWith('Order'))) capabilities.add('order-events');
  if (input.loaded.events.some((event) => event.name === 'PositionFeesCollected')) capabilities.add('fee');
  if (input.loaded.events.some((event) => /funding/i.test(event.name))) capabilities.add('funding');
  if (input.parameters.length > 0) capabilities.add('parameters');
  const snapshotValues = input.snapshots.map((snapshot) => record(snapshot.values));
  if (snapshotValues.some((values) => values.position !== undefined && values.position !== null)) capabilities.add('position-state');
  if (snapshotValues.some((values) => values.traderUsdc !== undefined && values.traderUsdc !== null)) capabilities.add('ledger');
  const claimableFields = ['claimableFeeAmountPosition', 'claimableFeeAmountFunding', 'claimableFeeAmountLiquidation'];
  if (['EXECUTED', 'CANCELLED', 'FROZEN'].includes(input.outcome)
    && snapshotValues.length === 2
    && snapshotValues.every((values) => claimableFields.every((field) => values[field] !== undefined && values[field] !== null))) {
    capabilities.add('claimable-ledger');
  }
  return [...capabilities];
}

function provenanceParameter(base: TxVerifyBaseMetadata, env: string, perTx: TxVerifyPerTxMetadata, rpcChainId: number | undefined): ParameterRef {
  const { warnings: _warnings, ...metadata } = base;
  return {
    name: 'tx-verify-provenance',
    value: json({ env, ...metadata, ...(rpcChainId !== undefined ? { rpcChainId } : {}), tx: perTx }),
    source: 'CURRENT.json + config/environment-bindings.json + config/mock-resources.json + overrides（resolvedFrom 逐字段标注）',
    blockNumber: decimal(perTx.blockNumber),
  };
}

function selectionFor(env: EnvironmentName, marketIndex: bigint | undefined, mockResource: MockResourceRecord | undefined): RuntimeExecutionSelection {
  const timeMode = env === 'time-fork' ? 'controllable-time' : 'normal-block-time';
  if (marketIndex === undefined) {
    return { marketMode: 'not-applicable', oracleMode: 'not-applicable', timeMode, signingMode: 'readonly', mockResourceAlias: 'none' };
  }
  const bundle = mockResource
    ? listMockMarketBundles(mockResource).find((entry) => entry.market?.marketIndex !== undefined && BigInt(entry.market.marketIndex) === marketIndex)
    : undefined;
  if (bundle) {
    return { marketMode: 'mock-market', oracleMode: 'mock-oracle', timeMode, signingMode: 'readonly', mockResourceAlias: bundle.alias };
  }
  return { marketMode: 'deployed-market', oracleMode: 'deployed-oracle', timeMode, signingMode: 'readonly', mockResourceAlias: 'none' };
}

function flowTypeOf(actions: readonly ActionEvidence[], loaded: readonly LoadedTransaction[]): FlowType {
  const kinds = loaded.map((item) => item.kind);
  const creates = kinds.filter((kind) => kind === 'create').length;
  const executes = kinds.filter((kind) => kind === 'execute-increase' || kind === 'execute-decrease' || kind === 'execute' || kind === 'liquidation' || kind === 'adl').length;
  const cancels = kinds.filter((kind) => kind === 'cancel' || kind === 'frozen').length;
  if (actions.every((action) => action.outcome === 'OBSERVED')) return 'read-only';
  if (creates === 1 && executes === 0 && cancels === 0) return 'create-only';
  if (creates === 1 && executes === 1 && cancels === 0 && kinds.includes('execute-increase')) return 'create-execute';
  if (creates === 1 && cancels === 1 && executes === 0) return 'create-cancel';
  if (creates === 2 && kinds.includes('execute-increase') && kinds.includes('execute-decrease') && executes === 2) return 'roundtrip';
  return 'multi-phase';
}

function forkBlockNumberOf(registryEnvironment: unknown, manifest: DeploymentManifest, env: EnvironmentName): bigint | undefined {
  const registered = toBigint(record(registryEnvironment).forkBlockNumber);
  if (registered !== undefined) return registered;
  // manifest 的 forkBlockNumber 只有在部署链 = 运行链时才描述本环境的 fork 起点。
  return env === 'tx-fork' && manifest.chainId === 99_911 ? toBigint(manifest.forkBlockNumber) : undefined;
}

export async function buildEnvelopeFromTxHashes(req: TxVerifyRequest): Promise<TxVerifyResult> {
  const projectRoot = req.projectRoot ?? process.cwd();
  if (!environmentNames.includes(req.env as EnvironmentName)) {
    throw new Error(`env=${req.env} 不在可信环境目录 ${environmentNames.join('/')} 中`);
  }
  const env = req.env as EnvironmentName;
  const hashes = [...new Set(req.hashes.map((hash) => hash.toLowerCase()))] as Hex[];
  if (hashes.length === 0) throw new Error('hashes 不能为空');
  for (const hash of hashes) {
    if (!HASH_PATTERN.test(hash)) throw new Error(`非法交易哈希：${hash}`);
  }

  const warnings: string[] = [];
  const runtime = loadRuntimeFor(env);
  const binding = loadEnvironmentBinding(projectRoot, env);
  const manifest = binding.manifest;
  const registry = loadBaselineRegistry(projectRoot, { reload: true });
  let mockResource: MockResourceRecord | undefined;
  if (isMockResourceEnvironment(env)) {
    try {
      mockResource = loadMockResourceRegistrySync(projectRoot).resources[env];
    } catch (error) {
      warnings.push(`无法读取 config/mock-resources.json：${message(error)}；chainId 默认值退回绑定表。`);
    }
  }
  const eventEmitterAbi = await loadDeploymentAbi(manifest, 'EventEmitter', projectRoot);
  const client = createPublicClient({ transport: http(runtime.rpcUrl, { timeout: runtime.requestTimeoutMs }) });
  const explorerBase = resolveBlockExplorerBaseUrl(projectRoot, env, runtime.chainId, runtime.forkDisplayName);
  const context: AdapterContext = {
    projectRoot, env, runtime, binding, manifest, mockResource,
    eventEmitter: getAddress(manifest.contracts.eventEmitter),
    eventEmitterAbi, client, explorerBase, warnings,
  };

  let rpcChainId: number | undefined;
  try {
    rpcChainId = await client.getChainId();
  } catch (error) {
    warnings.push(`RPC eth_chainId 读取失败：${message(error)}`);
  }

  const loaded = (await Promise.all(hashes.map((hash) => loadTransaction(context, hash))))
    .sort((left, right) => left.blockNumber === right.blockNumber
      ? left.transactionIndex - right.transactionIndex
      : (left.blockNumber < right.blockNumber ? -1 : 1));

  const latest = loaded.reduce((best, item) => item.blockTimestamp > best.blockTimestamp ? item : best, loaded[0]!);
  const base = resolveTxVerifyBaseMetadata({
    env,
    binding,
    registry,
    mockRegistryChainId: mockResource?.chainId,
    latestBlockTimestampIso: latest.timestampIso,
    ...(req.overrides ? { overrides: req.overrides } : { overrides: undefined }),
  });
  warnings.push(...base.warnings);
  if (rpcChainId !== undefined && rpcChainId !== base.chainId) {
    warnings.push(`RPC 实际 chainId=${rpcChainId} 与元数据 chainId=${base.chainId}（${base.resolvedFrom.chainId}）不一致。`);
  }

  // 配对：按 orderKey 把创建 tx 与其终态 tx（执行 / 取消 / 冻结）排成相邻的 TXn → TXn+1。
  const consumed = new Set<Hex>();
  const ordered: Array<{ loaded: LoadedTransaction; creation?: LoadedTransaction; terminal?: LoadedTransaction }> = [];
  for (const item of loaded) {
    if (consumed.has(item.hash)) continue;
    if (item.kind === 'create' && item.orderKey) {
      const terminal = loaded.find((candidate) => !consumed.has(candidate.hash) && candidate.hash !== item.hash
        && candidate.orderKey?.toLowerCase() === item.orderKey!.toLowerCase()
        && candidate.kind !== 'create'
        && (candidate.blockNumber > item.blockNumber || (candidate.blockNumber === item.blockNumber && candidate.transactionIndex > item.transactionIndex)));
      consumed.add(item.hash);
      ordered.push({ loaded: item, ...(terminal ? { terminal } : {}) });
      if (terminal) {
        consumed.add(terminal.hash);
        ordered.push({ loaded: terminal, creation: item });
      }
      continue;
    }
    consumed.add(item.hash);
    ordered.push({ loaded: item });
  }

  const actions: ActionEvidence[] = [];
  const perTx: TxVerifyPerTxMetadata[] = [];
  const actionIdOf = new Map<Hex, string>();
  ordered.forEach((entry, index) => actionIdOf.set(entry.loaded.hash, `TX${index + 1}`));
  // 开→平的 roundtrip 形态：减仓一对按既有 market-open.roundtrip 计划的 Action 契约记 purpose=cleanup（与 v1 adapter 一致）；
  // 其余形态一律 primary——适配器不知道用户意图，不擅自区分主 / 辅。
  const orderedKinds = ordered.map((entry) => entry.loaded.kind);
  const roundtripPattern = ordered.length === 4
    && orderedKinds.filter((kind) => kind === 'create').length === 2
    && orderedKinds.includes('execute-increase') && orderedKinds.includes('execute-decrease');
  const purposeOf = (entry: typeof ordered[number]): ActionEvidence['purpose'] => {
    if (!roundtripPattern) return 'primary';
    const decreaseCreate = entry.loaded.kind === 'create' && entry.terminal?.kind === 'execute-decrease';
    return decreaseCreate || entry.loaded.kind === 'execute-decrease' ? 'cleanup' : 'primary';
  };

  for (const [index, entry] of ordered.entries()) {
    const current = entry.loaded;
    const sequence = index + 1;
    const actionId = `TX${sequence}`;
    const position = current.context ?? entry.creation?.context;
    const marketIndex = current.marketIndex ?? entry.creation?.marketIndex;
    const collateral = marketIndex === undefined ? undefined : collateralTokenFor(context, marketIndex);
    if (marketIndex !== undefined && position && !collateral) {
      warnings.push(`${current.hash} 无法确定 market #${marketIndex} 的抵押 token（manifest.markets / mock-resources / mockUsdc 均未登记），Vault 余额与仓位快照跳过。`);
    }
    const isExecution = ['execute-increase', 'execute-decrease', 'execute', 'liquidation', 'adl'].includes(current.kind);
    const isTerminal = isExecution || current.kind === 'cancel' || current.kind === 'frozen';
    const before = current.blockNumber - 1n;
    let snapshots: SnapshotRef[] = [];
    let parameters: ParameterRef[] = [];
    let type: string;
    let outcome: ActionOutcome;
    let input: JsonRecord;
    let windowContamination: ActionEvidence['windowContamination'];
    let error: ActionEvidence['error'];

    if (current.kind === 'create') {
      type = createActionType(current.orderType);
      outcome = 'SUBMITTED';
      input = createInput(current, entry.terminal ? actionIdOf.get(entry.terminal.hash) : undefined);
      if (!entry.terminal) warnings.push(`${current.hash} 的订单 ${current.orderKey ?? '(无 key)'} 未在给定 hash 里找到执行 / 取消 tx，只能核对创建侧。`);
      snapshots = [
        await pinnedSnapshot(context, { id: `${actionId}-pre-submit`, kind: 'pre-submit', blockNumber: before, position, marketIndex, collateralToken: collateral?.address }),
        await pinnedSnapshot(context, { id: `${actionId}-after-submit`, kind: 'observation', blockNumber: current.blockNumber, position, marketIndex, collateralToken: collateral?.address }),
      ];
    } else if (isTerminal) {
      const creation = entry.creation ? { actionId: actionIdOf.get(entry.creation.hash)! }
        : hasEvent(current.events, 'OrderCreated') ? 'same-tx' as const : 'missing' as const;
      if (creation === 'missing') warnings.push(`${current.hash}（${current.kind}）未提供对应的创建 tx，创建信息标缺失。`);
      if (isExecution) {
        type = current.kind === 'liquidation' ? 'liquidate' : current.kind === 'adl' ? 'adl' : 'executeOrder';
        outcome = 'EXECUTED';
        input = executeInput(current, creation, collateral);
        if (!position) warnings.push(`${current.hash} 缺少仓位上下文（PositionIncrease/Decrease 未解出 account/marketIndex/isLong），仓位与 Vault 快照标 missing。`);
        snapshots = [
          await pinnedSnapshot(context, { id: `${actionId}-execution-before`, kind: 'execution-before', blockNumber: before, position, marketIndex, collateralToken: collateral?.address }),
          await pinnedSnapshot(context, { id: `${actionId}-execution-after`, kind: 'execution-after', blockNumber: current.blockNumber, position, marketIndex, collateralToken: collateral?.address }),
        ];
        if (position) {
          const parameter = await tradeParameters(context, current, position);
          if (parameter) parameters = [parameter];
        }
        if (entry.creation) {
          windowContamination = {
            status: 'NOT_CHECKED',
            fromBlock: decimal(entry.creation.blockNumber),
            toBlock: decimal(before),
            note: 'tx-hash 适配器只取创建块与执行前一块两端快照，没有逐块交易扫描凭证；快照相同不能替代污染检查。',
          };
        }
      } else {
        type = current.kind === 'cancel' ? 'cancelOrder' : 'freezeOrder';
        outcome = current.kind === 'cancel' ? 'CANCELLED' : 'FROZEN';
        const event = firstEvent(current.events, current.kind === 'cancel' ? 'OrderCancelled' : 'OrderFrozen');
        input = {
          orderKey: current.orderKey,
          account: item(event, 'address', 'account'),
          reason: item(event, 'string', 'reason'),
          reasonBytes: item(event, 'bytes', 'reasonBytes'),
          ...(typeof creation === 'string' ? { creation } : { creationActionId: creation.actionId }),
        };
        snapshots = [
          await pinnedSnapshot(context, { id: `${actionId}-pre-terminal`, kind: 'pre-submit', blockNumber: before, position, marketIndex, collateralToken: collateral?.address }),
          await pinnedSnapshot(context, { id: `${actionId}-after-terminal`, kind: 'observation', blockNumber: current.blockNumber, position, marketIndex, collateralToken: collateral?.address }),
        ];
      }
    } else if (current.kind === 'funding-only') {
      type = 'settleFunding';
      outcome = 'OBSERVED';
      input = { marketIndex, events: current.events.map((event) => event.name), otherLogCount: current.otherLogCount };
      snapshots = [
        await pinnedSnapshot(context, { id: `${actionId}-before`, kind: 'observation', blockNumber: before, position: undefined, marketIndex, collateralToken: undefined }),
        await pinnedSnapshot(context, { id: `${actionId}-after`, kind: 'observation', blockNumber: current.blockNumber, position: undefined, marketIndex, collateralToken: undefined }),
      ];
    } else if (current.kind === 'reverted') {
      type = 'revertedTransaction';
      outcome = 'OBSERVED';
      input = { otherLogCount: current.otherLogCount };
      error = { name: 'TransactionReverted', message: `${current.hash} 回执 status=reverted，无事件可分类。` };
      warnings.push(error.message);
    } else {
      type = 'observeTransaction';
      outcome = 'OBSERVED';
      input = { events: current.events.map((event) => event.name), otherLogCount: current.otherLogCount, note: '没有 Order/Position/Funding 事件，无法归类为交易动作。' };
      warnings.push(`${current.hash} 未识别出 FX100 交易动作（事件：${current.events.map((event) => event.name).join('、') || '无 EventEmitter 事件'}）。`);
    }

    const tx: TxVerifyPerTxMetadata = {
      hash: current.hash,
      blockNumber: Number(current.blockNumber),
      blockTimestamp: Number(current.blockTimestamp),
      executedAtIso: current.timestampIso,
      role: current.role,
      kind: current.kind,
      actionId,
      ...(current.orderKey ? { orderKey: current.orderKey } : {}),
    };
    perTx.push(tx);
    parameters = [...parameters, provenanceParameter(base, env, tx, rpcChainId)];
    const oracle = oracleRefs(current);
    const capabilities = capabilitiesOf({ loaded: current, snapshots, parameters, oracle, outcome });
    actions.push({
      schemaVersion: 2,
      actionId,
      sequence,
      type,
      purpose: purposeOf(entry),
      outcome,
      input: json(input),
      capabilities,
      transactions: [transactionRef(context, current)],
      ...(current.orderKey && HASH_PATTERN.test(current.orderKey) ? { orderRefs: { order: current.orderKey } } : {}),
      ...(current.positionKey && HASH_PATTERN.test(current.positionKey) ? { positionRefs: { main: current.positionKey } } : {}),
      snapshots,
      events: eventRefs(current),
      parameters,
      oracle,
      ...(windowContamination ? { windowContamination } : {}),
      startedAt: current.timestampIso,
      endedAt: current.timestampIso,
      ...(error ? { error } : {}),
    });
  }

  // 环境身份：走既有 runtime 解析（校验 RuntimeConfig 与环境一致），再叠加元数据里的 chainId / 版本。
  const primaryMarketIndex = loaded.map((item) => item.marketIndex).find((value) => value !== undefined);
  const distinctMarkets = new Set(loaded.map((item) => item.marketIndex).filter((value): value is bigint => value !== undefined).map(String));
  if (distinctMarkets.size > 1) warnings.push(`给定 tx 跨 ${distinctMarkets.size} 个市场（${[...distinctMarkets].join('、')}），environment.market 只登记首个。`);
  const selection = selectionFor(env, primaryMarketIndex, mockResource);
  const resolvedEnvironment = resolveRuntimeTestEnvironment(runtime, selection);
  const identity = buildRuntimeEnvironmentIdentity(
    runtime,
    resolvedEnvironment,
    primaryMarketIndex === undefined ? undefined : { marketIndex: Number(primaryMarketIndex) },
  );
  const registryEnvironment = registry?.environments[env];
  const forkBlockNumber = forkBlockNumberOf(registryEnvironment, manifest, env);
  const environment: EnvironmentIdentity = {
    ...identity,
    chainId: base.chainId,
    release: base.contractVersion,
    ...(identity.fork ? {
      fork: {
        ...identity.fork,
        ...(forkBlockNumber !== undefined ? { forkBlockNumber: decimal(forkBlockNumber) } : {}),
      },
    } : {}),
  };

  const earliest = loaded.reduce((best, item) => item.blockTimestamp < best.blockTimestamp ? item : best, loaded[0]!);
  const shortHash = hashes[0]!.slice(2, 10);
  const executedAtCompact = base.executedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const envelope: EvidenceEnvelope = {
    schemaVersion: 2,
    caseId: req.caseId ?? 'adhoc-tx-verify',
    variantId: `tx-${hashes.length}-${shortHash}`,
    executionId: `txverify-${executedAtCompact}-${shortHash}`,
    flowType: flowTypeOf(actions, loaded),
    capabilities: [...new Set(actions.flatMap((action) => action.capabilities))],
    environment,
    actions,
    startedAt: earliest.timestampIso < base.executedAt ? earliest.timestampIso : base.executedAt,
    endedAt: base.executedAt,
  };
  const parsed = evidenceEnvelopeSchema.parse(envelope) as EvidenceEnvelope;

  const { warnings: _baseWarnings, ...baseMetadata } = base;
  const metadata: TxVerifyMetadata = {
    env,
    ...baseMetadata,
    ...(rpcChainId !== undefined ? { rpcChainId } : {}),
    perTx,
  };
  return { envelope: parsed, metadata, warnings: [...new Set(warnings)] };
}

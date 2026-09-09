import type { RuntimeConfig } from '../../config/runtime.js';
import {
  decimal,
  evidenceEnvelopeSchema,
  type ActionEvidence,
  type Address,
  type EvidenceCapability,
  type EvidenceEnvelope,
  type EnvironmentIdentity,
  type EventRef,
  type Hex,
  type JsonValue,
  type SnapshotRef,
  type TransactionRef,
} from '../../evidence/evidence-v2.js';
import { buildRuntimeEnvironmentIdentity } from '../../execution/runtime-environment.js';
import { runMarketFlow, type MarketFlowOptions, type Scn009Evidence } from '../../scenarios/scn-009-runner.js';

type JsonRecord = Record<string, unknown>;
const EPOCH = '1970-01-01T00:00:00.000Z';

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function string(value: unknown, fallback = ''): string {
  return value === undefined || value === null ? fallback : String(value);
}

function finiteNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`期望有限数字，实际 ${String(value)}`);
  return parsed;
}

function json(value: unknown): JsonValue {
  if (typeof value === 'bigint') return value.toString();
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value as JsonValue;
  if (Array.isArray(value)) return value.map(json);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as JsonRecord).map(([key, item]) => [key, json(item)]));
  }
  return String(value);
}

function decimalToRaw(value: unknown, decimals: number): string {
  const text = string(value, '0');
  if (/^-?\d+$/.test(text) && text.length > decimals) return text;
  const negative = text.startsWith('-');
  const [whole = '0', fraction = ''] = (negative ? text.slice(1) : text).split('.');
  const raw = `${whole || '0'}${fraction.padEnd(decimals, '0').slice(0, decimals)}`.replace(/^0+(?=\d)/, '');
  return `${negative ? '-' : ''}${raw || '0'}`;
}

function gasString(value: unknown): `${bigint}` {
  return BigInt(string(value, '0')).toString() as `${bigint}`;
}

function transactionStatus(value: unknown, fallbackSuccess = false): TransactionRef['status'] {
  const status = string(value).toLowerCase();
  if (status === '0x0' || status === '0' || status === 'reverted') return 'REVERTED';
  if (status === '0x1' || status === '1' || status === 'success' || fallbackSuccess) return 'SUCCESS';
  return 'UNKNOWN';
}

/** 只接受原始交易对象携带的完整 URL；不得用环境或调用方 base URL 拼接。 */
function trustedExplorer(raw: JsonRecord, txHash: string): TransactionRef['explorer'] | undefined {
  const declared = record(raw.explorer);
  const transactionUrl = string(declared.transactionUrl || raw.transactionUrl || raw.url);
  if (!transactionUrl) return undefined;
  let parsed: URL;
  try { parsed = new URL(transactionUrl); } catch { return undefined; }
  if (!parsed.pathname.toLowerCase().endsWith(`/tx/${txHash.toLowerCase()}`)) return undefined;
  const declaredProvider = string(declared.provider || raw.explorerProvider);
  const provider = declaredProvider === 'basescan' || declaredProvider === 'tenderly-vnet'
    ? declaredProvider
    : parsed.hostname.endsWith('basescan.org') ? 'basescan'
      : parsed.hostname === 'dashboard.tenderly.co' ? 'tenderly-vnet' : undefined;
  if (!provider) return undefined;
  if (provider === 'basescan' && !parsed.hostname.endsWith('basescan.org')) return undefined;
  if (provider === 'tenderly-vnet' && parsed.hostname !== 'dashboard.tenderly.co') return undefined;
  const networkId = string(declared.networkId || raw.explorerNetworkId);
  return { provider, ...(networkId ? { networkId } : {}), transactionUrl };
}

function snapshot(raw: JsonRecord, name: string, kind: SnapshotRef['kind']): SnapshotRef {
  const item = record(record(raw.snapshots)[name]);
  const readErrors = Array.isArray(item.errors) ? item.errors.map((value) => string(value)) : [];
  return {
    id: name,
    kind,
    blockNumber: decimal(finiteNumber(item.blockNumber)),
    source: 'reader',
    values: json(record(item.values)),
    ...(readErrors.length > 0 ? { readErrors } : {}),
  };
}

function transaction(
  raw: unknown,
  fallbackEvent: unknown,
  role: TransactionRef['role'],
): TransactionRef | undefined {
  const direct = record(raw);
  const event = record(fallbackEvent);
  const nested = record(direct.transaction);
  const receipt = record(direct.receipt);
  const hash = string(direct.txHash || event.txHash || nested.hash || receipt.transactionHash);
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return undefined;
  const actor = string(nested.from || direct.from);
  if (!/^0x[0-9a-fA-F]{40}$/.test(actor)) throw new Error(`${hash} 缺少交易 actor`);
  const blockNumber = direct.blockNumber || event.blockNumber || nested.blockNumber || receipt.blockNumber;
  const blockHash = string(nested.blockHash || direct.blockHash);
  const orderKey = string(direct.orderKey || record(event.bytes32).key || record(event.bytes32).orderKey);
  const to = string(nested.to || direct.to);
  const nonce = nested.nonce;
  const signatureVerified = /^0x[0-9a-fA-F]+$/.test(string(nested.r)) && /^0x[0-9a-fA-F]+$/.test(string(nested.s))
    && BigInt(string(nested.r, '0')) !== 0n && BigInt(string(nested.s, '0')) !== 0n;
  const status = transactionStatus(receipt.status || direct.status, direct.ok === true);
  const receiptHash = string(receipt.transactionHash);
  const receiptBlock = receipt.blockNumber;
  const receiptBlockHash = string(receipt.blockHash);
  const receiptGas = receipt.gasUsed;
  const explorer = trustedExplorer(direct, hash) ?? trustedExplorer(nested, hash);
  return {
    txHash: hash as Hex,
    blockNumber: decimal(typeof blockNumber === 'string' && blockNumber.startsWith('0x') ? BigInt(blockNumber) : finiteNumber(blockNumber)),
    ...(/^0x[0-9a-fA-F]{64}$/.test(blockHash) ? { blockHash: blockHash as Hex } : {}),
    actor: actor as Address,
    ...(/^0x[0-9a-fA-F]{40}$/.test(to) ? { to: to as Address } : {}),
    role,
    ...(orderKey ? { orderKey: orderKey as Hex } : {}),
    gasUsed: gasString(direct.gasUsed || receipt.gasUsed),
    status,
    ...(nonce !== undefined ? { nonce: decimal(typeof nonce === 'string' && nonce.startsWith('0x') ? BigInt(nonce) : finiteNumber(nonce)) } : {}),
    ...(nested.type !== undefined ? { transactionType: string(nested.type) } : {}),
    signatureVerified,
    ...(/^0x[0-9a-fA-F]{64}$/.test(receiptHash) && receiptBlock !== undefined && receiptGas !== undefined ? {
      receipt: {
        transactionHash: receiptHash as Hex,
        blockNumber: decimal(typeof receiptBlock === 'string' && receiptBlock.startsWith('0x') ? BigInt(receiptBlock) : finiteNumber(receiptBlock)),
        ...(/^0x[0-9a-fA-F]{64}$/.test(receiptBlockHash) ? { blockHash: receiptBlockHash as Hex } : {}),
        status: transactionStatus(receipt.status),
        gasUsed: gasString(receiptGas),
      },
    } : {}),
    ...(explorer ? { explorer } : {}),
  };
}

function events(raw: unknown): EventRef[] {
  return Object.entries(record(raw)).flatMap(([fallbackName, value]) => {
    const values = Array.isArray(value) ? value : [value];
    return values.flatMap((item) => {
      const event = record(item);
      const hash = string(event.txHash || event.transactionHash);
      if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return [];
      return [{
        name: string(event.eventName, fallbackName),
        transactionHash: hash as Hex,
        blockNumber: decimal(finiteNumber(event.blockNumber)),
        source: 'decoded-runner' as const,
        args: json(event),
      }];
    });
  });
}

function action(input: {
  sequence: number;
  type: string;
  purpose: ActionEvidence['purpose'];
  outcome: ActionEvidence['outcome'];
  capabilities: EvidenceCapability[];
  transaction?: TransactionRef | undefined;
  snapshots: SnapshotRef[];
  events?: EventRef[];
  parameters?: unknown;
  actionInput?: JsonRecord;
  contaminationWindow?: readonly [SnapshotRef, SnapshotRef];
}): ActionEvidence {
  const after = input.snapshots[1];
  const claimableFields = [
    'claimableFeeAmountPosition',
    'claimableFeeAmountFunding',
    'claimableFeeAmountLiquidation',
  ];
  const capturesClaimableLedger = ['EXECUTED', 'CANCELLED', 'FROZEN'].includes(input.outcome)
    && input.snapshots.slice(0, 2).length === 2
    && input.snapshots.slice(0, 2).every((item) => {
      const values = record(item.values);
      return claimableFields.every((field) => values[field] !== undefined && values[field] !== null);
    });
  const capabilities = capturesClaimableLedger
    ? [...new Set([...input.capabilities, 'claimable-ledger' as const])]
    : input.capabilities;
  const windowContamination = input.contaminationWindow
    ? {
      status: 'NOT_CHECKED' as const,
      fromBlock: input.contaminationWindow[0].blockNumber,
      toBlock: input.contaminationWindow[1].blockNumber,
      note: 'legacy market-flow 只保留窗口两端快照，没有交易列表扫描凭证；快照相同不能替代污染检查。',
    }
    : undefined;
  return {
    schemaVersion: 2,
    actionId: `TX${input.sequence}`,
    sequence: input.sequence,
    type: input.type,
    purpose: input.purpose,
    outcome: input.outcome,
    input: json(input.actionInput ?? {}),
    capabilities,
    transactions: input.transaction ? [input.transaction] : [],
    ...(input.transaction?.orderKey ? { orderRefs: { order: input.transaction.orderKey } } : {}),
    snapshots: input.snapshots,
    events: input.events ?? [],
    parameters: input.parameters === undefined ? [] : [{
      name: 'trade-parameters', value: json(input.parameters), source: 'DataStore/ReferralStorage@executionBlock',
      ...(after ? { blockNumber: after.blockNumber } : {}),
    }],
    oracle: [],
    ...(windowContamination ? { windowContamination } : {}),
    startedAt: EPOCH,
    endedAt: EPOCH,
  };
}

export interface MarketFlowAdapterOptions {
  executionId: string;
  variantId?: string;
  startedAt?: string;
  endedAt?: string;
  caseData?: JsonRecord;
  /**
   * Trusted producer identity. New executions must provide this from
   * RuntimeConfig + ResolvedTestEnvironment; omission exists only to replay
   * already archived V1 evidence whose historical binding cannot be recovered.
   */
  environment?: EnvironmentIdentity;
}

/**
 * runMarketFlow v1 -> 唯一 Evidence V2。只读原始交易/事件/快照；不信任 assertions、checks 或预存守恒 sum。
 */
export function adaptMarketFlowV1(value: unknown, options: MarketFlowAdapterOptions): EvidenceEnvelope {
  const root = record(value);
  const raw = record(root.evidence ?? value);
  const env = record(raw.environment);
  const data = { ...record(raw.testData), ...record(root.data), ...(options.caseData ?? {}) };
  const observations = record(raw.observations);
  const transactions = record(raw.transactions);
  const decodedEvents = record(raw.events);
  const params = record(raw.parameters);
  const createOpenRaw = record(transactions.createOpen);
  const executeOpenRaw = record(transactions.executeOpen);
  const createCloseRaw = record(transactions.createClose);
  const executeCloseRaw = record(transactions.executeClose);
  const tx = (rawTx: JsonRecord, event: unknown, role: TransactionRef['role']) => {
    return transaction(rawTx, event, role);
  };

  const sizeDeltaUsd = string(data.sizeDeltaUsd || observations.openSizeDeltaUsdRaw || data.openSizeDeltaUsdRaw)
    || decimalToRaw(data.sizeUsd, 30);
  const collateralAmount = string(data.collateral || observations.openCollateralRaw || data.openCollateralRaw)
    || decimalToRaw(data.collateralUsdc, 6);
  const isLong = data.isLong !== false;
  const openInput = { side: isLong ? 'long' : 'short', sizeDeltaUsd, collateralAmount, orderType: 'MarketIncrease', acceptablePricePolicy: 'unbounded' };

  const actions: ActionEvidence[] = [
    action({ sequence: 1, type: 'submitMarketIncrease', purpose: 'primary', outcome: 'SUBMITTED', capabilities: ['transaction', 'order-events', 'ledger'],
      transaction: tx(createOpenRaw, undefined, 'trader'), snapshots: [snapshot(raw, 'before', 'pre-submit'), snapshot(raw, 'afterCreateOpen', 'observation')], actionInput: openInput }),
    action({ sequence: 2, type: 'executeOrder', purpose: 'primary', outcome: record(executeOpenRaw.event).eventName === 'OrderExecuted' ? 'EXECUTED' : 'OBSERVED',
      capabilities: ['transaction', 'order-events', 'position-state', 'ledger', 'fee', 'funding', 'oracle', 'parameters', 'keeper'],
      transaction: tx(executeOpenRaw, executeOpenRaw.event, 'keeper'), snapshots: [snapshot(raw, 'openExecBefore', 'execution-before'), snapshot(raw, 'afterOpen', 'execution-after')],
      events: [...events(decodedEvents.open), ...events({ OrderExecuted: executeOpenRaw.event })], parameters: params.open, actionInput: { order: 'open' },
      contaminationWindow: [snapshot(raw, 'afterCreateOpen', 'observation'), snapshot(raw, 'openExecBefore', 'execution-before')] }),
    action({ sequence: 3, type: 'submitMarketDecrease', purpose: 'cleanup', outcome: 'SUBMITTED', capabilities: ['transaction', 'order-events', 'position-state', 'ledger'],
      transaction: tx(createCloseRaw, undefined, 'trader'), snapshots: [snapshot(raw, 'afterOpen', 'pre-submit'), snapshot(raw, 'afterCreateClose', 'observation')], actionInput: { position: 'main', percent: 100 } }),
    action({ sequence: 4, type: 'executeOrder', purpose: 'cleanup', outcome: record(executeCloseRaw.event).eventName === 'OrderExecuted' ? 'EXECUTED' : 'OBSERVED',
      capabilities: ['transaction', 'order-events', 'position-state', 'ledger', 'fee', 'funding', 'oracle', 'parameters', 'keeper'],
      transaction: tx(executeCloseRaw, executeCloseRaw.event, 'keeper'), snapshots: [snapshot(raw, 'closeExecBefore', 'execution-before'), snapshot(raw, 'afterClose', 'execution-after')],
      events: [...events(decodedEvents.close), ...events({ OrderExecuted: executeCloseRaw.event })], parameters: params.close, actionInput: { order: 'close', position: 'main', positionEffect: 'full-close' },
      contaminationWindow: [snapshot(raw, 'afterCreateClose', 'observation'), snapshot(raw, 'closeExecBefore', 'execution-before')] }),
  ];

  const envelope: EvidenceEnvelope = {
    schemaVersion: 2,
    caseId: string(root.id || raw.scenarioId),
    variantId: options.variantId ?? `${isLong ? 'long' : 'short'}-market-${string(data.sizeUsd, 'unknown')}usd-${string(data.collateralUsdc || data.collateralUsdcText, 'unknown')}usdc`,
    executionId: options.executionId,
    flowType: 'roundtrip',
    capabilities: [...new Set(actions.flatMap((item) => item.capabilities))],
    environment: options.environment ?? {
      name: string(env.environment, 'tx-fork'),
      chainId: finiteNumber(env.chainId),
      deploymentId: string(env.deployment),
      fork: {
        provider: 'tenderly-vnet',
        ...(env.forkDisplayName ? { displayName: string(env.forkDisplayName) } : {}),
        ...(env.forkBlockNumber !== undefined ? { forkBlockNumber: decimal(finiteNumber(env.forkBlockNumber)) } : {}),
      },
      market: {
        mode: string(env.marketMode, 'unknown'),
        ...(env.mockResourceAlias ? { resourceAlias: string(env.mockResourceAlias) } : {}),
        marketIndex: finiteNumber(env.marketIndex),
      },
    },
    actions,
    startedAt: options.startedAt ?? EPOCH,
    endedAt: options.endedAt ?? EPOCH,
  };
  return evidenceEnvelopeSchema.parse(envelope) as EvidenceEnvelope;
}

export interface RunMarketFlowV2Options extends Omit<MarketFlowOptions, 'resolvedEnvironment'> {
  readonly executionId: string;
  readonly variantId?: string;
  readonly resolvedEnvironment: NonNullable<MarketFlowOptions['resolvedEnvironment']>;
}

/** 真实桥接入口：执行旧 runner 后立即产出唯一 Evidence V2，不携带 runner verdict。 */
export async function runMarketFlowEvidenceV2(runtime: RuntimeConfig, options: RunMarketFlowV2Options): Promise<{
  readonly legacy: Scn009Evidence;
  readonly evidence: EvidenceEnvelope;
}> {
  const startedAt = new Date().toISOString();
  const legacy = await runMarketFlow(runtime, options);
  const endedAt = new Date().toISOString();
  return {
    legacy,
    evidence: adaptMarketFlowV1(legacy, {
      executionId: options.executionId,
      environment: buildRuntimeEnvironmentIdentity(runtime, options.resolvedEnvironment, {
        marketIndex: finiteNumber(record(legacy.environment).marketIndex),
      }),
      ...(options.variantId ? { variantId: options.variantId } : {}),
      startedAt,
      endedAt,
      caseData: {
        isLong: options.isLong,
        ...(options.openSizeDeltaUsd !== undefined ? { sizeDeltaUsd: options.openSizeDeltaUsd.toString() } : {}),
        ...(options.openCollateral !== undefined ? { collateral: options.openCollateral.toString() } : {}),
      },
    }),
  };
}

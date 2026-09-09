import { z } from 'zod';

export type Hex = `0x${string}`;
export type Address = `0x${string}`;
export type DecimalString = `${bigint}`;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };

export type EvidenceCapability =
  | 'transaction'
  | 'order-events'
  | 'position-state'
  | 'ledger'
  | 'claimable-ledger'
  | 'fee'
  | 'funding'
  | 'oracle'
  | 'parameters'
  | 'keeper'
  | 'indexer'
  | 'frontend';

export type FlowType =
  | 'read-only'
  | 'create-only'
  | 'create-execute'
  | 'create-cancel'
  | 'roundtrip'
  | 'multi-phase';

export type ActionPurpose = 'setup' | 'primary' | 'support' | 'cleanup';

export type ActionOutcome =
  | 'OBSERVED'
  | 'SUBMITTED'
  | 'EXECUTED'
  | 'CANCELLED'
  | 'FROZEN';

export type TransactionRole = 'trader' | 'keeper' | 'admin' | 'oracle' | 'service';

export interface EnvironmentIdentity {
  readonly name: string;
  readonly chainId: number;
  readonly deploymentId: string;
  readonly release?: string;
  readonly fork?: {
    readonly provider: string;
    readonly networkId?: string;
    readonly displayName?: string;
    readonly forkBlockNumber?: DecimalString;
  };
  readonly market?: {
    readonly mode: string;
    readonly resourceAlias?: string;
    readonly marketIndex?: number;
    readonly marketAddress?: Address;
  };
}

/**
 * JSON evidence stores integer values as base-10 strings. This avoids bigint
 * serialization failures and precision loss when evidence is consumed outside
 * TypeScript.
 */
export interface TransactionRef {
  readonly txHash: Hex;
  readonly blockNumber: DecimalString;
  readonly blockHash?: Hex;
  readonly actor: Address;
  readonly to?: Address;
  readonly role: TransactionRole;
  readonly orderKey?: Hex;
  readonly gasUsed: DecimalString;
  readonly status: 'SUCCESS' | 'REVERTED' | 'UNKNOWN';
  readonly nonce?: DecimalString;
  readonly transactionType?: string;
  readonly signatureVerified?: boolean;
  /** 交易与回执分开保存，完整性层据此核验 hash / block / status / gas 的对应关系。 */
  readonly receipt?: {
    readonly transactionHash: Hex;
    readonly blockNumber: DecimalString;
    readonly blockHash?: Hex;
    readonly status: 'SUCCESS' | 'REVERTED' | 'UNKNOWN';
    readonly gasUsed: DecimalString;
  };
  readonly explorer?: {
    readonly provider: 'basescan' | 'tenderly-vnet';
    readonly networkId?: string;
    readonly transactionUrl: string;
  };
}

export interface SnapshotRef {
  readonly id: string;
  readonly kind: 'pre-submit' | 'execution-before' | 'execution-after' | 'observation';
  readonly blockNumber: DecimalString;
  readonly blockHash?: Hex;
  readonly source: 'rpc' | 'reader' | 'datastore' | 'token' | 'indexer' | 'frontend';
  readonly values: JsonValue;
  /** Collector 读取失败必须随原始快照保留，不能因其余字段可读而静默丢失。 */
  readonly readErrors?: readonly string[];
}

export interface EventRef {
  readonly name: string;
  /** 旧 runner 的解码事件可能没有保留 emitter；缺失时不得伪造。 */
  readonly address?: Address;
  readonly transactionHash: Hex;
  readonly blockNumber: DecimalString;
  readonly logIndex?: number;
  readonly source: 'receipt-log' | 'decoded-runner';
  readonly args: JsonValue;
}

export interface ParameterRef {
  readonly name: string;
  readonly value: JsonValue;
  readonly source: string;
  readonly blockNumber?: DecimalString;
  readonly key?: Hex;
}

export interface OracleRef {
  readonly token: Address;
  readonly min: DecimalString;
  readonly max: DecimalString;
  readonly timestamp: DecimalString;
  readonly blockNumber?: DecimalString;
  readonly transactionHash?: Hex;
}

export interface FrontendLocatorRef {
  /** 优先使用稳定的 test-id / role / label；CSS 仅用于旧页面兼容。 */
  readonly strategy: 'test-id' | 'role' | 'label' | 'css';
  readonly value: string;
}

/** Playwright 采集的原始页面事实；expected/verdict 仍由核对引擎产生。 */
export interface FrontendObservationRef {
  /** 稳定业务字段名，例如 order.leverage、position.sizeUsd。 */
  readonly field: string;
  readonly source: 'dom' | 'app-state' | 'network-response';
  readonly value: JsonValue;
  readonly displayedText?: string;
  readonly normalizedValue?: DecimalString | string | boolean;
  readonly unit?: string;
  readonly locator?: FrontendLocatorRef;
  readonly capturedAt: string;
  readonly screenshotPath?: string;
}

/** dApp 发给注入钱包的真实请求，用于核对页面输入是否被正确编码。 */
export interface WalletRequestRef {
  readonly requestId: string;
  readonly method: string;
  readonly chainId?: number;
  readonly from?: Address;
  readonly to?: Address;
  readonly value?: DecimalString;
  readonly data?: Hex;
  readonly functionName?: string;
  readonly decodedArgs?: JsonValue;
  readonly requestedAt: string;
}

export interface FrontendEvidence {
  readonly pageUrl: string;
  readonly route: string;
  readonly buildId?: string;
  readonly locale?: string;
  readonly walletAddress?: Address;
  readonly chainId?: number;
  readonly observations: readonly FrontendObservationRef[];
  readonly walletRequests: readonly WalletRequestRef[];
}

export interface EvidenceProvenanceRef {
  readonly source: 'rpc' | 'receipt' | 'block-scan' | 'execution-collector';
  readonly path: string;
  readonly blockNumber?: DecimalString;
}

export interface WindowContaminationEvidence {
  /** NOT_CHECKED 与 CLEAN 严格区分；没有交易列表凭证不得推断 CLEAN。 */
  readonly status: 'CLEAN' | 'POLLUTED' | 'NOT_CHECKED';
  readonly fromBlock?: DecimalString;
  readonly toBlock?: DecimalString;
  readonly inspectedTransactions?: readonly TransactionRef[];
  readonly unexpectedTransactions?: readonly TransactionRef[];
  readonly source?: EvidenceProvenanceRef;
  readonly note?: string;
}

/** Shared execution/reconciliation boundary. Contains raw facts only. */
export interface ActionEvidence {
  readonly schemaVersion: 2;
  readonly actionId: string;
  readonly sequence: number;
  readonly type: string;
  readonly purpose: ActionPurpose;
  readonly outcome: ActionOutcome;
  readonly input: JsonValue;
  readonly capabilities: readonly EvidenceCapability[];
  readonly transactions: readonly TransactionRef[];
  readonly orderRefs?: Readonly<Record<string, Hex>>;
  readonly positionRefs?: Readonly<Record<string, Hex>>;
  readonly snapshots: readonly SnapshotRef[];
  readonly events: readonly EventRef[];
  readonly parameters: readonly ParameterRef[];
  readonly oracle: readonly OracleRef[];
  /** 仅 Playwright/UI Action 提供；RPC 用例省略并由报告标为 frontend NOT_RUN。 */
  readonly frontend?: FrontendEvidence;
  readonly windowContamination?: WindowContaminationEvidence;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly error?: {
    readonly name: string;
    readonly message: string;
    readonly code?: string;
  };
}

/** Top-level raw evidence. It deliberately has no checks or verdicts. */
export interface EvidenceEnvelope {
  readonly schemaVersion: 2;
  readonly caseId: string;
  readonly variantId: string;
  readonly executionId: string;
  readonly flowType: FlowType;
  readonly capabilities: readonly EvidenceCapability[];
  readonly environment: EnvironmentIdentity;
  readonly actions: readonly ActionEvidence[];
  readonly startedAt: string;
  readonly endedAt: string;
}

export function decimal(value: bigint | number | string): DecimalString {
  return BigInt(value).toString() as DecimalString;
}

const hexSchema = z.string().regex(/^0x[0-9a-fA-F]+$/).transform((value) => value as Hex);
const hashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((value) => value as Hex);
const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((value) => value as Address);
const decimalSchema = z.string().regex(/^-?\d+$/).transform((value) => value as DecimalString);

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema),
]));

export const evidenceCapabilitySchema = z.enum([
  'transaction', 'order-events', 'position-state', 'ledger', 'claimable-ledger', 'fee', 'funding',
  'oracle', 'parameters', 'keeper', 'indexer', 'frontend',
]);

export const transactionRoleSchema = z.enum(['trader', 'keeper', 'admin', 'oracle', 'service']);

export const transactionRefSchema = z.object({
  txHash: hashSchema, blockNumber: decimalSchema, blockHash: hashSchema.optional(), actor: addressSchema,
  to: addressSchema.optional(),
  role: transactionRoleSchema,
  orderKey: hashSchema.optional(), gasUsed: decimalSchema,
  status: z.enum(['SUCCESS', 'REVERTED', 'UNKNOWN']),
  nonce: decimalSchema.optional(), transactionType: z.string().optional(), signatureVerified: z.boolean().optional(),
  receipt: z.object({
    transactionHash: hashSchema, blockNumber: decimalSchema, blockHash: hashSchema.optional(),
    status: z.enum(['SUCCESS', 'REVERTED', 'UNKNOWN']), gasUsed: decimalSchema,
  }).optional(),
  explorer: z.object({
    provider: z.enum(['basescan', 'tenderly-vnet']),
    networkId: z.string().optional(), transactionUrl: z.string().url(),
  }).optional(),
});

export const snapshotRefSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['pre-submit', 'execution-before', 'execution-after', 'observation']),
  blockNumber: decimalSchema, blockHash: hashSchema.optional(),
  source: z.enum(['rpc', 'reader', 'datastore', 'token', 'indexer', 'frontend']),
  values: jsonValueSchema,
  readErrors: z.array(z.string()).optional(),
});

export const eventRefSchema = z.object({
  name: z.string().min(1), address: addressSchema.optional(),
  transactionHash: hashSchema, blockNumber: decimalSchema,
  logIndex: z.number().int().nonnegative().optional(),
  source: z.enum(['receipt-log', 'decoded-runner']), args: jsonValueSchema,
});

const parameterRefSchema = z.object({
  name: z.string().min(1), value: jsonValueSchema, source: z.string().min(1),
  blockNumber: decimalSchema.optional(), key: hashSchema.optional(),
});

const oracleRefSchema = z.object({
  token: addressSchema, min: decimalSchema, max: decimalSchema, timestamp: decimalSchema,
  blockNumber: decimalSchema.optional(), transactionHash: hashSchema.optional(),
});

const frontendEvidenceSchema = z.object({
  pageUrl: z.string().url(), route: z.string(), buildId: z.string().optional(), locale: z.string().optional(),
  walletAddress: addressSchema.optional(), chainId: z.number().int().positive().optional(),
  observations: z.array(z.object({
    field: z.string().min(1), source: z.enum(['dom', 'app-state', 'network-response']), value: jsonValueSchema,
    displayedText: z.string().optional(), normalizedValue: z.union([decimalSchema, z.string(), z.boolean()]).optional(),
    unit: z.string().optional(), locator: z.object({ strategy: z.enum(['test-id', 'role', 'label', 'css']), value: z.string() }).optional(),
    capturedAt: z.string().datetime(), screenshotPath: z.string().optional(),
  })),
  walletRequests: z.array(z.object({
    requestId: z.string().min(1), method: z.string().min(1), chainId: z.number().int().positive().optional(),
    from: addressSchema.optional(), to: addressSchema.optional(), value: decimalSchema.optional(), data: hexSchema.optional(),
    functionName: z.string().optional(), decodedArgs: jsonValueSchema.optional(), requestedAt: z.string().datetime(),
  })),
});

export const actionEvidenceSchema = z.object({
  schemaVersion: z.literal(2), actionId: z.string().min(1), sequence: z.number().int().positive(),
  type: z.string().min(1), purpose: z.enum(['setup', 'primary', 'support', 'cleanup']),
  outcome: z.enum(['OBSERVED', 'SUBMITTED', 'EXECUTED', 'CANCELLED', 'FROZEN']),
  input: jsonValueSchema, capabilities: z.array(evidenceCapabilitySchema),
  transactions: z.array(transactionRefSchema), orderRefs: z.record(z.string(), hashSchema).optional(),
  positionRefs: z.record(z.string(), hashSchema).optional(), snapshots: z.array(snapshotRefSchema),
  events: z.array(eventRefSchema), parameters: z.array(parameterRefSchema), oracle: z.array(oracleRefSchema),
  frontend: frontendEvidenceSchema.optional(),
  windowContamination: z.object({
    status: z.enum(['CLEAN', 'POLLUTED', 'NOT_CHECKED']),
    fromBlock: decimalSchema.optional(), toBlock: decimalSchema.optional(),
    inspectedTransactions: z.array(transactionRefSchema).optional(),
    unexpectedTransactions: z.array(transactionRefSchema).optional(),
    source: z.object({
      source: z.enum(['rpc', 'receipt', 'block-scan', 'execution-collector']),
      path: z.string().min(1), blockNumber: decimalSchema.optional(),
    }).optional(),
    note: z.string().optional(),
  }).optional(),
  startedAt: z.string().datetime(), endedAt: z.string().datetime(),
  error: z.object({ name: z.string(), message: z.string(), code: z.string().optional() }).optional(),
});

export const evidenceEnvelopeSchema = z.object({
  schemaVersion: z.literal(2), caseId: z.string().min(1), variantId: z.string().min(1), executionId: z.string().min(1),
  flowType: z.enum(['read-only', 'create-only', 'create-execute', 'create-cancel', 'roundtrip', 'multi-phase']),
  capabilities: z.array(evidenceCapabilitySchema),
  environment: z.object({
    name: z.string().min(1), chainId: z.number().int().positive(), deploymentId: z.string().min(1), release: z.string().optional(),
    fork: z.object({ provider: z.string(), networkId: z.string().optional(), displayName: z.string().optional(), forkBlockNumber: decimalSchema.optional() }).optional(),
    market: z.object({ mode: z.string(), resourceAlias: z.string().optional(), marketIndex: z.number().int().nonnegative().optional(), marketAddress: addressSchema.optional() }).optional(),
  }),
  actions: z.array(actionEvidenceSchema), startedAt: z.string().datetime(), endedAt: z.string().datetime(),
});

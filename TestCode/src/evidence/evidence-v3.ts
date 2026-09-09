import { z } from 'zod';

import {
  evidenceCapabilitySchema,
  jsonValueSchema,
  transactionRoleSchema,
  type Address,
  type DecimalString,
  type Hex,
} from './evidence-v2.js';

export {
  decimal,
  evidenceCapabilitySchema,
  jsonValueSchema,
  transactionRoleSchema,
} from './evidence-v2.js';

export type {
  ActionOutcome,
  ActionPurpose,
  Address,
  DecimalString,
  EvidenceCapability,
  FlowType,
  Hex,
  JsonPrimitive,
  JsonValue,
  TransactionRole,
} from './evidence-v2.js';

const hashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((value) => value as Hex);
const hexSchema = z.string().regex(/^0x[0-9a-fA-F]+$/).transform((value) => value as Hex);
const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((value) => value as Address);

/** Canonical BigInt text. Leading zeroes, `-0`, and a leading `+` are rejected. */
export const decimalStringSchema = z.string()
  .regex(/^(?:0|-?[1-9]\d*)$/)
  .transform((value) => value as DecimalString);

/** Canonical EVM quantity text used for blocks, gas, nonces, and transaction indexes. */
export const nonNegativeDecimalStringSchema = z.string()
  .regex(/^(?:0|[1-9]\d*)$/)
  .transform((value) => value as DecimalString);

const receiptSchema = z.strictObject({
  transactionHash: hashSchema,
  blockNumber: nonNegativeDecimalStringSchema,
  blockHash: hashSchema.optional(),
  status: z.enum(['SUCCESS', 'REVERTED', 'UNKNOWN']),
  gasUsed: nonNegativeDecimalStringSchema,
});

const explorerSchema = z.strictObject({
  provider: z.enum(['basescan', 'tenderly-vnet']),
  networkId: z.string().optional(),
  transactionUrl: z.string().url(),
});

export const transactionRefSchema = z.strictObject({
  txHash: hashSchema,
  blockNumber: nonNegativeDecimalStringSchema,
  blockHash: hashSchema.optional(),
  actor: addressSchema,
  to: addressSchema.optional(),
  role: transactionRoleSchema,
  orderKey: hashSchema.optional(),
  gasUsed: nonNegativeDecimalStringSchema,
  status: z.enum(['SUCCESS', 'REVERTED', 'UNKNOWN']),
  nonce: nonNegativeDecimalStringSchema.optional(),
  transactionType: z.string().optional(),
  signatureVerified: z.boolean().optional(),
  receipt: receiptSchema.optional(),
  explorer: explorerSchema.optional(),
});

export type TransactionRef = z.output<typeof transactionRefSchema>;

export const snapshotRefSchema = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(['pre-submit', 'execution-before', 'execution-after', 'observation']),
  blockNumber: nonNegativeDecimalStringSchema,
  blockHash: hashSchema.optional(),
  source: z.enum(['rpc', 'reader', 'datastore', 'token', 'indexer', 'frontend']),
  values: jsonValueSchema,
  readErrors: z.array(z.string()).optional(),
});

export type SnapshotRef = z.output<typeof snapshotRefSchema>;

export const eventRefSchema = z.strictObject({
  name: z.string().min(1),
  address: addressSchema.optional(),
  transactionHash: hashSchema,
  blockNumber: nonNegativeDecimalStringSchema,
  logIndex: z.number().int().nonnegative().optional(),
  source: z.enum(['receipt-log', 'decoded-runner']),
  args: jsonValueSchema,
});

export type EventRef = z.output<typeof eventRefSchema>;

export const parameterRefSchema = z.strictObject({
  name: z.string().min(1),
  value: jsonValueSchema,
  source: z.string().min(1),
  blockNumber: nonNegativeDecimalStringSchema.optional(),
  key: hashSchema.optional(),
});

export type ParameterRef = z.output<typeof parameterRefSchema>;

export const oracleRefSchema = z.strictObject({
  token: addressSchema,
  min: decimalStringSchema,
  max: decimalStringSchema,
  timestamp: nonNegativeDecimalStringSchema,
  blockNumber: nonNegativeDecimalStringSchema.optional(),
  transactionHash: hashSchema.optional(),
});

export type OracleRef = z.output<typeof oracleRefSchema>;

export const frontendLocatorRefSchema = z.strictObject({
  strategy: z.enum(['test-id', 'role', 'label', 'css']),
  value: z.string(),
});

export type FrontendLocatorRef = z.output<typeof frontendLocatorRefSchema>;

export const frontendObservationRefSchema = z.strictObject({
  field: z.string().min(1),
  source: z.enum(['dom', 'app-state', 'network-response']),
  value: jsonValueSchema,
  displayedText: z.string().optional(),
  normalizedValue: z.union([decimalStringSchema, z.string(), z.boolean()]).optional(),
  unit: z.string().optional(),
  locator: frontendLocatorRefSchema.optional(),
  capturedAt: z.string().datetime(),
  screenshotPath: z.string().optional(),
});

export type FrontendObservationRef = z.output<typeof frontendObservationRefSchema>;

export const walletRequestRefSchema = z.strictObject({
  requestId: z.string().min(1),
  method: z.string().min(1),
  chainId: z.number().int().positive().optional(),
  from: addressSchema.optional(),
  to: addressSchema.optional(),
  value: nonNegativeDecimalStringSchema.optional(),
  data: hexSchema.optional(),
  functionName: z.string().optional(),
  decodedArgs: jsonValueSchema.optional(),
  requestedAt: z.string().datetime(),
});

export type WalletRequestRef = z.output<typeof walletRequestRefSchema>;

export const frontendEvidenceSchema = z.strictObject({
  pageUrl: z.string().url(),
  route: z.string(),
  buildId: z.string().optional(),
  locale: z.string().optional(),
  walletAddress: addressSchema.optional(),
  chainId: z.number().int().positive().optional(),
  observations: z.array(frontendObservationRefSchema),
  walletRequests: z.array(walletRequestRefSchema),
});

export type FrontendEvidence = z.output<typeof frontendEvidenceSchema>;

export const evidenceProvenanceRefSchema = z.strictObject({
  source: z.enum(['rpc', 'receipt', 'block-scan', 'execution-collector']),
  path: z.string().min(1),
  blockNumber: nonNegativeDecimalStringSchema.optional(),
});

export type EvidenceProvenanceRef = z.output<typeof evidenceProvenanceRefSchema>;

export const environmentIdentitySchema = z.strictObject({
  name: z.string().min(1),
  chainId: z.number().int().positive(),
  deploymentId: z.string().min(1),
  release: z.string().optional(),
  fork: z.strictObject({
    provider: z.string(),
    networkId: z.string().optional(),
    displayName: z.string().optional(),
    forkBlockNumber: nonNegativeDecimalStringSchema.optional(),
  }).optional(),
  market: z.strictObject({
    mode: z.string(),
    resourceAlias: z.string().optional(),
    marketIndex: z.number().int().nonnegative().optional(),
    marketAddress: addressSchema.optional(),
  }).optional(),
});

export type EnvironmentIdentity = z.output<typeof environmentIdentitySchema>;

/**
 * Raw transaction identity returned by a block scan. It deliberately omits
 * receipt-only execution fields such as gasUsed/status and does not invent a
 * business role for an unknown third party.
 */
export const scannedTransactionRefSchema = z.strictObject({
  txHash: hashSchema,
  blockNumber: nonNegativeDecimalStringSchema,
  blockHash: hashSchema,
  transactionIndex: nonNegativeDecimalStringSchema,
  actor: addressSchema,
  to: addressSchema.optional(),
  nonce: nonNegativeDecimalStringSchema,
  transactionType: z.string().optional(),
  role: transactionRoleSchema.optional(),
});

export type ScannedTransactionRef = z.output<typeof scannedTransactionRefSchema>;

/** One entry per block in the inclusive scan range. */
export const scannedBlockRefSchema = z.strictObject({
  blockNumber: nonNegativeDecimalStringSchema,
  blockHash: hashSchema,
  parentHash: hashSchema,
  transactionHashes: z.array(hashSchema),
});

export type ScannedBlockRef = z.output<typeof scannedBlockRefSchema>;

/*
 * V2 accepted non-canonical signed decimal text. Keep that grammar only inside
 * the raw legacy payload so already-persisted V2 remains readable. V3 fields
 * outside rawWindow always use the canonical schemas above.
 */
const legacyDecimalStringSchema = z.string()
  .regex(/^-?\d+$/)
  .transform((value) => value as DecimalString);

const legacyReceiptSchema = z.strictObject({
  transactionHash: hashSchema,
  blockNumber: legacyDecimalStringSchema,
  blockHash: hashSchema.optional(),
  status: z.enum(['SUCCESS', 'REVERTED', 'UNKNOWN']),
  gasUsed: legacyDecimalStringSchema,
});

const legacyTransactionRefSchema = z.strictObject({
  txHash: hashSchema,
  blockNumber: legacyDecimalStringSchema,
  blockHash: hashSchema.optional(),
  actor: addressSchema,
  to: addressSchema.optional(),
  role: transactionRoleSchema,
  orderKey: hashSchema.optional(),
  gasUsed: legacyDecimalStringSchema,
  status: z.enum(['SUCCESS', 'REVERTED', 'UNKNOWN']),
  nonce: legacyDecimalStringSchema.optional(),
  transactionType: z.string().optional(),
  signatureVerified: z.boolean().optional(),
  receipt: legacyReceiptSchema.optional(),
  explorer: explorerSchema.optional(),
});

const legacyProvenanceRefSchema = z.strictObject({
  source: z.enum(['rpc', 'receipt', 'block-scan', 'execution-collector']),
  path: z.string().min(1),
  blockNumber: legacyDecimalStringSchema.optional(),
});

export const legacyWindowContaminationEvidenceSchema = z.strictObject({
  status: z.enum(['CLEAN', 'POLLUTED', 'NOT_CHECKED']),
  fromBlock: legacyDecimalStringSchema.optional(),
  toBlock: legacyDecimalStringSchema.optional(),
  inspectedTransactions: z.array(legacyTransactionRefSchema).optional(),
  unexpectedTransactions: z.array(legacyTransactionRefSchema).optional(),
  source: legacyProvenanceRefSchema.optional(),
  note: z.string().optional(),
});

export type LegacyWindowContaminationEvidence = z.output<typeof legacyWindowContaminationEvidenceSchema>;

const legacyClaimSchema = z.strictObject({
  schemaVersion: z.literal(2),
  status: z.enum(['CLEAN', 'POLLUTED', 'NOT_CHECKED']),
  rawWindow: legacyWindowContaminationEvidenceSchema,
});

const windowScanSourceSchema = z.strictObject({
  source: z.enum(['block-scan', 'execution-collector']),
  path: z.string().min(1),
  blockNumber: nonNegativeDecimalStringSchema,
});

const notCheckedWindowSchema = z.strictObject({
  status: z.literal('NOT_CHECKED'),
  fromBlock: nonNegativeDecimalStringSchema.optional(),
  toBlock: nonNegativeDecimalStringSchema.optional(),
  source: evidenceProvenanceRefSchema.optional(),
  legacyClaim: legacyClaimSchema.optional(),
  note: z.string().optional(),
});

const nonEmptyScannedBlocksSchema = z.tuple(
  [scannedBlockRefSchema],
  scannedBlockRefSchema,
);

const completedWindowBase = {
  fromBlock: nonNegativeDecimalStringSchema,
  toBlock: nonNegativeDecimalStringSchema,
  inspectedBlocks: nonEmptyScannedBlocksSchema,
  inspectedTransactions: z.array(scannedTransactionRefSchema),
  source: windowScanSourceSchema,
  note: z.string().optional(),
};

const cleanWindowSchema = z.strictObject({
  status: z.literal('CLEAN'),
  ...completedWindowBase,
  unexpectedTransactions: z.tuple([]),
});

const pollutedWindowSchema = z.strictObject({
  status: z.literal('POLLUTED'),
  ...completedWindowBase,
  unexpectedTransactions: z.tuple(
    [scannedTransactionRefSchema],
    scannedTransactionRefSchema,
  ),
});

export const windowContaminationEvidenceSchema = z.discriminatedUnion('status', [
  notCheckedWindowSchema,
  cleanWindowSchema,
  pollutedWindowSchema,
]);

export type WindowContaminationEvidence = z.output<typeof windowContaminationEvidenceSchema>;

export const actionEvidenceSchema = z.strictObject({
  schemaVersion: z.literal(3),
  actionId: z.string().min(1),
  sequence: z.number().int().positive(),
  type: z.string().min(1),
  purpose: z.enum(['setup', 'primary', 'support', 'cleanup']),
  outcome: z.enum(['OBSERVED', 'SUBMITTED', 'EXECUTED', 'CANCELLED', 'FROZEN']),
  input: jsonValueSchema,
  capabilities: z.array(evidenceCapabilitySchema),
  transactions: z.array(transactionRefSchema),
  orderRefs: z.record(z.string(), hashSchema).optional(),
  positionRefs: z.record(z.string(), hashSchema).optional(),
  snapshots: z.array(snapshotRefSchema),
  events: z.array(eventRefSchema),
  parameters: z.array(parameterRefSchema),
  oracle: z.array(oracleRefSchema),
  frontend: frontendEvidenceSchema.optional(),
  windowContamination: windowContaminationEvidenceSchema.optional(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  error: z.strictObject({
    name: z.string(),
    message: z.string(),
    code: z.string().optional(),
  }).optional(),
});

export type ActionEvidence = z.output<typeof actionEvidenceSchema>;

export const evidenceEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(3),
  caseId: z.string().min(1),
  variantId: z.string().min(1),
  executionId: z.string().min(1),
  flowType: z.enum(['read-only', 'create-only', 'create-execute', 'create-cancel', 'roundtrip', 'multi-phase']),
  capabilities: z.array(evidenceCapabilitySchema),
  environment: environmentIdentitySchema,
  actions: z.array(actionEvidenceSchema).min(1),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
}).superRefine((evidence, context) => {
  const actionIds = new Set<string>();
  const sequences = new Set<number>();
  const transactionHashes = new Set<string>();
  for (const [actionIndex, action] of evidence.actions.entries()) {
    if (actionIds.has(action.actionId)) {
      context.addIssue({
        code: 'custom',
        path: ['actions', actionIndex, 'actionId'],
        message: `actionId 重复：${action.actionId}`,
      });
    }
    actionIds.add(action.actionId);

    if (sequences.has(action.sequence)) {
      context.addIssue({
        code: 'custom',
        path: ['actions', actionIndex, 'sequence'],
        message: `sequence 重复：${action.sequence}`,
      });
    }
    sequences.add(action.sequence);
    if (action.sequence !== actionIndex + 1) {
      context.addIssue({
        code: 'custom',
        path: ['actions', actionIndex, 'sequence'],
        message: `actions 必须按 1..N 连续排序，索引 ${actionIndex} 的 sequence=${action.sequence}`,
      });
    }

    for (const [transactionIndex, transaction] of action.transactions.entries()) {
      const normalizedHash = transaction.txHash.toLowerCase();
      if (transactionHashes.has(normalizedHash)) {
        context.addIssue({
          code: 'custom',
          path: ['actions', actionIndex, 'transactions', transactionIndex, 'txHash'],
          message: `TransactionRef.txHash 全局重复：${transaction.txHash}`,
        });
      }
      transactionHashes.add(normalizedHash);
    }
  }
});

export type EvidenceEnvelope = z.output<typeof evidenceEnvelopeSchema>;

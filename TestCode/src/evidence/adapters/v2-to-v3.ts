import { z } from 'zod';

import {
  evidenceEnvelopeSchema as evidenceEnvelopeV2Schema,
  type EvidenceEnvelope as EvidenceEnvelopeV2,
} from '../evidence-v2.js';
import {
  evidenceEnvelopeSchema as evidenceEnvelopeV3Schema,
  legacyWindowContaminationEvidenceSchema,
  type DecimalString,
  type EvidenceEnvelope as EvidenceEnvelopeV3,
  type WindowContaminationEvidence as WindowContaminationEvidenceV3,
} from '../evidence-v3.js';

type ParsedEvidenceEnvelopeV2 = z.output<typeof evidenceEnvelopeV2Schema>;
type ParsedWindowV2 = ParsedEvidenceEnvelopeV2['actions'][number]['windowContamination'];

function canonicalDecimal(value: DecimalString): DecimalString {
  return BigInt(value).toString() as DecimalString;
}

function canonicalQuantity(value: DecimalString, field: string): DecimalString {
  const parsed = BigInt(value);
  if (parsed < 0n) throw new Error(`${field} 不能为负数`);
  return parsed.toString() as DecimalString;
}

function migrateWindow(
  window: ParsedWindowV2,
): WindowContaminationEvidenceV3 | undefined {
  if (!window) return undefined;
  const rawWindow = legacyWindowContaminationEvidenceSchema.parse(window);
  const note = [
    window.note,
    window.status === 'NOT_CHECKED'
      ? undefined
      : '由 Evidence V2 迁移：旧版没有逐块扫描清单，原状态不能作为 V3 CLEAN/POLLUTED 凭证，已降级为 NOT_CHECKED。',
  ].filter(Boolean).join(' ');
  return {
    status: 'NOT_CHECKED',
    ...(window.fromBlock === undefined ? {} : {
      fromBlock: canonicalQuantity(window.fromBlock, 'window.fromBlock'),
    }),
    ...(window.toBlock === undefined ? {} : {
      toBlock: canonicalQuantity(window.toBlock, 'window.toBlock'),
    }),
    ...(window.source ? {
      source: {
        ...window.source,
        ...(window.source.blockNumber === undefined ? {} : {
          blockNumber: canonicalQuantity(window.source.blockNumber, 'window.source.blockNumber'),
        }),
      },
    } : {}),
    legacyClaim: {
      schemaVersion: 2,
      status: window.status,
      rawWindow,
    },
    ...(note ? { note } : {}),
  };
}

function migratedCandidate(v2: ParsedEvidenceEnvelopeV2): unknown {
  const actions = v2.actions.map((action, actionIndex) => {
    const { windowContamination, ...rest } = action;
    const migratedWindow = migrateWindow(windowContamination);
    return {
      ...rest,
      schemaVersion: 3,
      transactions: action.transactions.map((transaction, transactionIndex) => ({
        ...transaction,
        blockNumber: canonicalQuantity(
          transaction.blockNumber,
          `actions[${actionIndex}].transactions[${transactionIndex}].blockNumber`,
        ),
        gasUsed: canonicalQuantity(
          transaction.gasUsed,
          `actions[${actionIndex}].transactions[${transactionIndex}].gasUsed`,
        ),
        ...(transaction.nonce === undefined ? {} : {
          nonce: canonicalQuantity(
            transaction.nonce,
            `actions[${actionIndex}].transactions[${transactionIndex}].nonce`,
          ),
        }),
        ...(transaction.receipt ? {
          receipt: {
            ...transaction.receipt,
            blockNumber: canonicalQuantity(
              transaction.receipt.blockNumber,
              `actions[${actionIndex}].transactions[${transactionIndex}].receipt.blockNumber`,
            ),
            gasUsed: canonicalQuantity(
              transaction.receipt.gasUsed,
              `actions[${actionIndex}].transactions[${transactionIndex}].receipt.gasUsed`,
            ),
          },
        } : {}),
      })),
      snapshots: action.snapshots.map((snapshot, snapshotIndex) => ({
        ...snapshot,
        blockNumber: canonicalQuantity(
          snapshot.blockNumber,
          `actions[${actionIndex}].snapshots[${snapshotIndex}].blockNumber`,
        ),
      })),
      events: action.events.map((event, eventIndex) => ({
        ...event,
        blockNumber: canonicalQuantity(
          event.blockNumber,
          `actions[${actionIndex}].events[${eventIndex}].blockNumber`,
        ),
      })),
      parameters: action.parameters.map((parameter, parameterIndex) => ({
        ...parameter,
        ...(parameter.blockNumber === undefined ? {} : {
          blockNumber: canonicalQuantity(
            parameter.blockNumber,
            `actions[${actionIndex}].parameters[${parameterIndex}].blockNumber`,
          ),
        }),
      })),
      oracle: action.oracle.map((oracle, oracleIndex) => ({
        ...oracle,
        min: canonicalDecimal(oracle.min),
        max: canonicalDecimal(oracle.max),
        timestamp: canonicalQuantity(
          oracle.timestamp,
          `actions[${actionIndex}].oracle[${oracleIndex}].timestamp`,
        ),
        ...(oracle.blockNumber === undefined ? {} : {
          blockNumber: canonicalQuantity(
            oracle.blockNumber,
            `actions[${actionIndex}].oracle[${oracleIndex}].blockNumber`,
          ),
        }),
      })),
      ...(action.frontend ? {
        frontend: {
          ...action.frontend,
          walletRequests: action.frontend.walletRequests.map((request, requestIndex) => ({
            ...request,
            ...(request.value === undefined ? {} : {
              value: canonicalQuantity(
                request.value,
                `actions[${actionIndex}].frontend.walletRequests[${requestIndex}].value`,
              ),
            }),
          })),
        },
      } : {}),
      ...(migratedWindow ? { windowContamination: migratedWindow } : {}),
    };
  });
  return {
    ...v2,
    schemaVersion: 3,
    environment: {
      ...v2.environment,
      ...(v2.environment.fork ? {
        fork: {
          ...v2.environment.fork,
          ...(v2.environment.fork.forkBlockNumber === undefined ? {} : {
            forkBlockNumber: canonicalQuantity(
              v2.environment.fork.forkBlockNumber,
              'environment.fork.forkBlockNumber',
            ),
          }),
        },
      } : {}),
    },
    actions,
  };
}

function parseMigratedEvidenceV2(v2: ParsedEvidenceEnvelopeV2): EvidenceEnvelopeV3 {
  return evidenceEnvelopeV3Schema.parse(migratedCandidate(v2));
}

/** Conservative V2 -> V3 migration. It never promotes legacy window claims. */
export function adaptEvidenceV2ToV3(input: EvidenceEnvelopeV2): EvidenceEnvelopeV3 {
  return parseMigratedEvidenceV2(evidenceEnvelopeV2Schema.parse(input));
}

/** All current consumers normalize persisted V2/V3 evidence to V3 first. */
export const canonicalEvidenceEnvelopeSchema = z.discriminatedUnion('schemaVersion', [
  evidenceEnvelopeV3Schema,
  evidenceEnvelopeV2Schema,
]).transform((evidence, context) => {
  if (evidence.schemaVersion === 3) return evidence;
  try {
    const migrated = evidenceEnvelopeV3Schema.safeParse(migratedCandidate(evidence));
    if (migrated.success) return migrated.data;
    for (const issue of migrated.error.issues) {
      context.addIssue({ code: 'custom', path: issue.path, message: issue.message });
    }
  } catch (error) {
    context.addIssue({
      code: 'custom',
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return z.NEVER;
});

export type EvidenceEnvelopeInput = EvidenceEnvelopeV2 | EvidenceEnvelopeV3;

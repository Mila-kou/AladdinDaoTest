import { createHash } from 'node:crypto';

import type { EvidenceEnvelope } from './evidence-v3.js';

export const EVIDENCE_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
export type EvidenceDigest = `sha256:${string}`;

function canonicalJsonValue(value: unknown, ancestors: WeakSet<object>): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON 不接受 NaN 或 Infinity');
    return JSON.stringify(value);
  }
  if (typeof value === 'bigint') throw new TypeError('Canonical JSON 不接受 bigint；Evidence 必须先序列化为十进制字符串');
  if (typeof value !== 'object') throw new TypeError(`Canonical JSON 不接受 ${typeof value}`);
  if (ancestors.has(value)) throw new TypeError('Canonical JSON 不接受循环引用');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalJsonValue(item, ancestors)).join(',')}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Canonical JSON 只接受普通对象');
    }
    const record = value as Record<string, unknown>;
    const fields = Object.keys(record).sort().flatMap((key) => {
      const item = record[key];
      // Match JSON object semantics while keeping arrays strict. Canonical V3
      // Evidence normally has no own undefined fields after schema parsing.
      if (item === undefined) return [];
      return [`${JSON.stringify(key)}:${canonicalJsonValue(item, ancestors)}`];
    });
    return `{${fields.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

/** Stable JSON: object keys are sorted recursively; array order remains evidentiary. */
export function stableCanonicalJson(value: unknown): string {
  return canonicalJsonValue(value, new WeakSet<object>());
}

export function sha256CanonicalJson(value: unknown): EvidenceDigest {
  const digest = createHash('sha256').update(stableCanonicalJson(value), 'utf8').digest('hex');
  return `sha256:${digest}`;
}

/** Digest only a schema-normalized V3 envelope. Callers normalize V2 first. */
export function computeEvidenceDigest(evidence: EvidenceEnvelope): EvidenceDigest {
  return sha256CanonicalJson(evidence);
}

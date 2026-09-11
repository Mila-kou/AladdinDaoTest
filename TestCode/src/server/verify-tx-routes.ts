/**
 * 看板服务端「按 tx hash 核对」两条路由（与 scripts/verify-tx.ts 共用 src/reconciliation/verify-tx.ts）：
 *
 *   POST /api/verify-tx           body { env, hashes: string[], caseId?, overrides? }
 *     → { metadata, checks, layerVerdicts, reportStatus, verdict, reasons, counts, warnings, evidence }
 *       verdict 是 'PASS' | 'FAIL' | 'NOT_VERIFIED' 字符串（与 attach 同形），reasons / counts 为其推导依据；
 *       evidence = 与 CLI 落盘同形的证据 JSON（evidenceV2 + reconciliationReport + checks + summary），
 *       看板须把它原样作为 attach 的 evidence 回传（服务端不落中间产物，也不接受 artifactPath 之类的路径引用：
 *       证据只走请求体内联上传，避免客户端指定服务端任意文件路径）。
 *   POST /api/manual-runs/attach  body { batchId?, caseId, evidence }
 *     → { path, absolutePath, verdict, reasons, counts, attachedAt, note? }
 *       写 TestCase/E2E/manual-runs/<batchId>/<caseId>/verify-<timestamp>.json（目录不存在则建）。
 *       batchId 缺省 / 空串时落到显式默认段 ADHOC_BATCH_ID（非引导模式的单条回填），非字符串仍 400。
 *       verdict 由证据里的核对行重新推导（不信任上传的 summary.verdict）：blocking FAIL / INVALID_EVIDENCE → FAIL；
 *       任一 NOT_VERIFIED、warning FAIL、缺 pack、无核对行 → NOT_VERIFIED；否则 PASS。这就是用例结论，没有第二层。
 *       summary.verdict 与重推不一致时附 note（看板状态栏会展示）。
 *
 * 同源校验 / sendJson 由 dashboard-server 注入（沿用其它写路由的 403 / 400 约定）；请求体在本文件自行读取，
 * 因为 attach 的证据 JSON 远超 dashboard-server.readJsonBody 的 64KB 上限。
 * 状态码：TxVerifyInputError → 400、TxVerifyChainError → 502、其它异常（zod parse / 核对引擎抛错等）→ 500。
 * 纪律：RPC / chainId 只走 runTxVerify → buildEnvelopeFromTxHashes 的既有运行时解析；错误文本已脱敏；
 * batchId / caseId 只允许 [A-Za-z0-9._-]（且不能是 . / ..），落盘前再校验解析路径仍在 manual-runs 之内。
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { relative, resolve, sep } from 'node:path';

import {
  artifactHasCheckRows,
  compactTimestamp,
  errorMessage,
  normalizeTxVerifyRequest,
  runTxVerify,
  stringifyArtifact,
  TxVerifyChainError,
  TxVerifyInputError,
  verdictFromArtifact,
} from '../reconciliation/verify-tx.js';

export const VERIFY_TX_ROUTE = '/api/verify-tx';
export const MANUAL_RUN_ATTACH_ROUTE = '/api/manual-runs/attach';
export const VERIFY_TX_ROUTES = [VERIFY_TX_ROUTE, MANUAL_RUN_ATTACH_ROUTE] as const;

const MANUAL_RUNS_RELATIVE_DIR = '../TestCase/E2E/manual-runs';
/** 非引导模式（抽屉直接回填、未创建手工批次）的默认批次段：manual-runs/adhoc/<caseId>/verify-*.json。 */
export const ADHOC_BATCH_ID = 'adhoc';
const SAFE_SEGMENT = /^[A-Za-z0-9._-]{1,120}$/;
const VERIFY_BODY_LIMIT = 64 * 1024;
const ATTACH_BODY_LIMIT = 32 * 1024 * 1024;
const ROUTE_SOURCE = 'src/server/verify-tx-routes.ts (POST /api/verify-tx)';

type JsonRecord = Record<string, unknown>;

export interface VerifyTxRouteHelpers {
  readonly isSameOriginRequest: (request: IncomingMessage) => boolean;
  readonly sendJson: (response: ServerResponse, status: number, body: unknown, headOnly?: boolean) => void;
}

export interface VerifyTxRoutesOptions {
  readonly projectRoot: string;
  readonly helpers: VerifyTxRouteHelpers;
}

export interface VerifyTxRoutes {
  /** 命中并已响应返回 true；未命中返回 false 让 dashboard-server 继续匹配其它路由。 */
  handle(request: IncomingMessage, response: ServerResponse, url: URL, method: string): Promise<boolean>;
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

async function readJsonBody(request: IncomingMessage, limitBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limitBytes) throw new TxVerifyInputError(`请求内容超过 ${Math.round(limitBytes / 1024)}KB。`);
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) throw new TxVerifyInputError('请求体为空，需要 JSON 对象。');
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new TxVerifyInputError(`请求体不是合法 JSON：${error instanceof Error ? error.message : String(error)}`);
  }
}

function safeSegment(value: unknown, field: string): string {
  // 路径穿越防护：拦的是分隔符、控制字符、空白与 . / ..，不拦非 ASCII——
  // 看板手工批次 id 本来就允许中文（如 2026-08-28-基本功能smoke），caseId 另有严格 ASCII 正则校验。
  if (typeof value !== 'string') throw new TxVerifyInputError(`${field} 必须是字符串`);
  const segment = value.normalize('NFC');
  if (segment.length < 1 || segment.length > 120) throw new TxVerifyInputError(`${field} 长度须为 1~120 字符`);
  if (segment === '.' || segment === '..') throw new TxVerifyInputError(`${field} 不能是 . 或 ..`);
  if (/[\/\\\u0000-\u001f\u007f]/.test(segment) || /\s/.test(segment)) {
    throw new TxVerifyInputError(`${field}=${segment} 含路径分隔符、控制字符或空白`);
  }
  return segment;
}

function errorStatus(error: unknown): number {
  if (error instanceof TxVerifyInputError || error instanceof TxVerifyChainError) return error.status;
  return 500;
}

export function createVerifyTxRoutes(options: VerifyTxRoutesOptions): VerifyTxRoutes {
  const projectRoot = resolve(options.projectRoot);
  const manualRunsRoot = resolve(projectRoot, MANUAL_RUNS_RELATIVE_DIR);
  const { isSameOriginRequest, sendJson } = options.helpers;

  async function handleVerifyTx(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!isSameOriginRequest(request)) {
      sendJson(response, 403, { error: '仅允许同源测试看板发起按 tx hash 核对。' });
      return;
    }
    try {
      const normalized = normalizeTxVerifyRequest(await readJsonBody(request, VERIFY_BODY_LIMIT));
      const run = await runTxVerify({ ...normalized, projectRoot, source: ROUTE_SOURCE });
      sendJson(response, 200, {
        metadata: run.result.metadata,
        checks: run.checks,
        layerVerdicts: run.report.layers,
        reportStatus: run.report.status,
        verdict: run.verdict.label,
        reasons: run.verdict.reasons,
        counts: run.verdict.counts,
        warnings: run.result.warnings.map((warning) => errorMessage(warning)),
        evidence: run.artifact,
      });
    } catch (error) {
      const status = errorStatus(error);
      sendJson(response, status, {
        error: status === 502 ? '按 tx hash 读链 / 组装证据失败' : status === 400 ? '按 tx hash 核对请求不合法' : '按 tx hash 核对失败',
        detail: errorMessage(error),
      });
    }
  }

  async function handleAttach(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!isSameOriginRequest(request)) {
      sendJson(response, 403, { error: '仅允许同源测试看板把核对证据挂到手工批次。' });
      return;
    }
    try {
      const body = record(await readJsonBody(request, ATTACH_BODY_LIMIT));
      const batchIdInput = body.batchId === undefined || body.batchId === null || body.batchId === '' ? ADHOC_BATCH_ID : body.batchId;
      const batchId = safeSegment(batchIdInput, 'batchId');
      const caseId = safeSegment(body.caseId, 'caseId');
      if (!/^[A-Za-z0-9._-]{1,120}$/.test(caseId)) throw new TxVerifyInputError(`caseId=${caseId} 只允许 [A-Za-z0-9._-]（用例 ID 为 ASCII）`);
      const evidence = body.evidence;
      if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
        throw new TxVerifyInputError('evidence 必须是 /api/verify-tx 返回的证据 JSON 对象');
      }
      if (!artifactHasCheckRows(evidence)) {
        throw new TxVerifyInputError('evidence 缺少核对行（checks 或 reconciliationReport.checks），无法得出结论');
      }

      const directory = resolve(manualRunsRoot, batchId, caseId);
      if (!directory.startsWith(`${manualRunsRoot}${sep}`)) {
        throw new TxVerifyInputError('落盘路径越出 TestCase/E2E/manual-runs/，已拒绝');
      }
      const attachedAt = new Date().toISOString();
      await mkdir(directory, { recursive: true });
      const stem = `verify-${compactTimestamp(attachedAt)}`;
      let absolutePath = resolve(directory, `${stem}.json`);
      for (let suffix = 2; existsSync(absolutePath); suffix += 1) {
        absolutePath = resolve(directory, `${stem}-${suffix}.json`);
      }
      await writeFile(absolutePath, stringifyArtifact(evidence), { encoding: 'utf8', flag: 'wx' });

      const verdict = verdictFromArtifact(evidence);
      const summaryVerdict = record(record(evidence).summary).verdict;
      const path = `TestCase/E2E/manual-runs/${relative(manualRunsRoot, absolutePath).split(sep).join('/')}`;
      sendJson(response, 201, {
        path,
        absolutePath,
        verdict: verdict.label,
        reasons: verdict.reasons,
        counts: verdict.counts,
        attachedAt,
        ...(typeof summaryVerdict === 'string' && summaryVerdict !== verdict.label
          ? { note: `证据自带 summary.verdict=${summaryVerdict} 与按核对行重新推导的 ${verdict.label} 不一致，以重新推导为准` }
          : {}),
      });
    } catch (error) {
      const status = errorStatus(error);
      sendJson(response, status, {
        error: status === 400 ? '核对证据挂载请求不合法' : '核对证据挂载失败',
        detail: errorMessage(error),
      });
    }
  }

  return {
    async handle(request, response, url, method) {
      if (url.pathname === VERIFY_TX_ROUTE) {
        if (method !== 'POST') {
          sendJson(response, 405, { error: 'Method Not Allowed' }, method === 'HEAD');
          return true;
        }
        await handleVerifyTx(request, response);
        return true;
      }
      if (url.pathname === MANUAL_RUN_ATTACH_ROUTE) {
        if (method !== 'POST') {
          sendJson(response, 405, { error: 'Method Not Allowed' }, method === 'HEAD');
          return true;
        }
        await handleAttach(request, response);
        return true;
      }
      return false;
    },
  };
}

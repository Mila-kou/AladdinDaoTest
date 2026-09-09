import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import dotenv from 'dotenv';

import { environments, type EnvironmentName } from '../../config/environments/catalog.js';

const TRANSACTION_HASH = /^0x[0-9a-fA-F]{64}$/;
const TENDERLY_DASHBOARD_BASE = 'https://dashboard.tenderly.co';
const BASE_SEPOLIA_EXPLORER_BASE = 'https://sepolia.basescan.org';

interface TenderlyVNetRecord {
  readonly environment?: string;
  readonly vnetId?: string;
  readonly createdAt?: string;
  readonly deletedAt?: string;
}

interface TenderlyVNetRegistry {
  readonly vnets?: readonly TenderlyVNetRecord[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readTenderlyVNetRegistry(projectRoot: string): TenderlyVNetRegistry {
  try {
    return JSON.parse(readFileSync(resolve(projectRoot, 'config/tenderly-vnets.json'), 'utf8')) as TenderlyVNetRegistry;
  } catch {
    return {};
  }
}

function activeTenderlyVNet(projectRoot: string, environment: string): TenderlyVNetRecord | undefined {
  return (readTenderlyVNetRegistry(projectRoot).vnets ?? [])
    .filter((item) => item.environment === environment && !item.deletedAt && item.vnetId)
    .sort((left, right) => String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? '')))[0];
}

function forkDisplayNameFromRpcUrl(rawUrl: string): string | undefined {
  try {
    const segments = new URL(rawUrl).pathname.split('/').filter(Boolean).map(decodeURIComponent);
    return segments.length >= 3 ? segments.slice(-3).join('/') : undefined;
  } catch {
    return undefined;
  }
}

function configuredForkDisplayName(projectRoot: string, environment: string): string | undefined {
  if (!(environment in environments)) return undefined;
  const definition = environments[environment as EnvironmentName];
  let values: Record<string, string> = {};
  for (const filename of ['.env', '.env.local']) {
    try {
      values = { ...values, ...dotenv.parse(readFileSync(resolve(projectRoot, filename))) };
    } catch {
      // 配置文件可选；没有配置时仅依赖证据和 fork 登记表。
    }
  }
  const rpcUrl = values[definition.rpcEnvironmentVariable];
  return rpcUrl ? forkDisplayNameFromRpcUrl(rpcUrl) : undefined;
}

function tenderlyProjectParts(forkDisplayName: string): readonly [string, string] | undefined {
  const segments = forkDisplayName.split('/').filter(Boolean);
  if (segments.length < 3) return undefined;
  return [segments[0]!, segments[1]!];
}

/** 返回当前测试环境对应的真实链上浏览器首页；不包含 RPC 凭证。 */
export function resolveBlockExplorerBaseUrl(
  projectRoot: string,
  environment: string,
  chainId?: number,
  forkDisplayName?: string,
): string | undefined {
  if (environment === 'base-sepolia' || chainId === 84_532) return BASE_SEPOLIA_EXPLORER_BASE;
  if (!forkDisplayName) return undefined;
  const activeVNet = activeTenderlyVNet(projectRoot, environment);
  const projectParts = tenderlyProjectParts(forkDisplayName);
  if (!activeVNet?.vnetId || !projectParts) return undefined;

  // 老证据可能来自已删除的同类 fork。只有证据名称与当前配置指向同一个 fork 时才允许回填链接，
  // 避免把旧交易哈希错误地链接到后来重建的新 Virtual TestNet。
  const configuredName = configuredForkDisplayName(projectRoot, environment);
  if (configuredName && configuredName !== forkDisplayName) return undefined;
  return `${TENDERLY_DASHBOARD_BASE}/${projectParts.map(encodeURIComponent).join('/')}/testnet/${encodeURIComponent(activeVNet.vnetId)}`;
}

export function transactionExplorerUrl(baseUrl: string, hash: string): string | undefined {
  if (!/^https:\/\//.test(baseUrl) || !TRANSACTION_HASH.test(hash)) return undefined;
  return `${baseUrl.replace(/\/$/, '')}/tx/${hash}`;
}

/** 从已保存证据中读取浏览器首页，兼容根证据与功能用例的 atom 嵌套结构。 */
export function findBlockExplorerBaseUrl(value: unknown, depth = 0): string | undefined {
  if (depth > 16) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findBlockExplorerBaseUrl(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  if (typeof value.explorerUrl === 'string' && /^https:\/\//.test(value.explorerUrl)) return value.explorerUrl;
  for (const child of Object.values(value)) {
    const found = findBlockExplorerBaseUrl(child, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/** 从证据中寻找执行时保存的 Tenderly fork 全名（account/project/slug）。 */
export function findForkDisplayName(value: unknown, depth = 0): string | undefined {
  if (depth > 16) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForkDisplayName(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  if (typeof value.forkDisplayName === 'string' && tenderlyProjectParts(value.forkDisplayName)) {
    return value.forkDisplayName;
  }
  for (const child of Object.values(value)) {
    const found = findForkDisplayName(child, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/** 链接只有在公共测试网，或其 Virtual TestNet 仍登记为存续时才可点击。 */
export function explorerLinkStatus(projectRoot: string, url?: string): 'available' | 'missing' {
  if (!url) return 'missing';
  try {
    const parsed = new URL(url);
    if (parsed.origin === BASE_SEPOLIA_EXPLORER_BASE) return 'available';
    if (parsed.origin !== TENDERLY_DASHBOARD_BASE) return 'missing';
    const segments = parsed.pathname.split('/').filter(Boolean);
    const testnetIndex = segments.indexOf('testnet');
    const vnetId = testnetIndex >= 0 ? segments[testnetIndex + 1] : undefined;
    if (!vnetId) return 'missing';
    const record = (readTenderlyVNetRegistry(projectRoot).vnets ?? [])
      .find((item) => item.vnetId === vnetId);
    return record && !record.deletedAt ? 'available' : 'missing';
  } catch {
    return 'missing';
  }
}

function linkKey(hashKey: string, record: Readonly<Record<string, unknown>>): string | undefined {
  if (hashKey === 'txHash' || hashKey === 'transactionHash') return 'transactionUrl';
  if (hashKey === 'hash' && ('from' in record || 'to' in record)) return 'transactionUrl';
  if (/TxHash$/.test(hashKey)) return `${hashKey.slice(0, -'TxHash'.length)}TransactionUrl`;
  return undefined;
}

/** 按交易哈希读取证据中与其配套保存的真实 Explorer URL。 */
export function findTransactionExplorerUrl(
  value: unknown,
  wantedHash: string,
  depth = 0,
): string | undefined {
  if (depth > 24) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTransactionExplorerUrl(item, wantedHash, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  for (const [hashKey, candidate] of Object.entries(value)) {
    if (typeof candidate !== 'string' || candidate.toLowerCase() !== wantedHash.toLowerCase()) continue;
    const targetKey = linkKey(hashKey, value);
    const url = targetKey ? value[targetKey] : undefined;
    if (typeof url === 'string' && /^https:\/\//.test(url)) return url;
  }
  for (const child of Object.values(value)) {
    const found = findTransactionExplorerUrl(child, wantedHash, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/**
 * 递归为证据中的交易哈希增加真实 Explorer URL。
 * createTxHash / executeTxHash 同处一个对象时分别生成 createTransactionUrl / executeTransactionUrl。
 */
export function addTransactionExplorerLinks<T>(value: T, baseUrl: string): T {
  const visit = (current: unknown): unknown => {
    if (Array.isArray(current)) return current.map(visit);
    if (!isRecord(current)) return current;
    const output: Record<string, unknown> = Object.fromEntries(
      Object.entries(current).map(([key, child]) => [key, visit(child)]),
    );
    for (const [key, candidate] of Object.entries(current)) {
      if (typeof candidate !== 'string' || !TRANSACTION_HASH.test(candidate)) continue;
      const targetKey = linkKey(key, current);
      if (!targetKey || typeof output[targetKey] === 'string') continue;
      const url = transactionExplorerUrl(baseUrl, candidate);
      if (url) output[targetKey] = url;
    }
    return output;
  };
  return visit(value) as T;
}

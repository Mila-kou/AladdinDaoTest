import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

import { environmentNames, type EnvironmentName } from '../../config/environments/catalog.js';
import { saveEnvironmentSettings, readEnvironmentSettings } from './environment-settings.js';

const requestSchema = z.object({ environment: z.enum(environmentNames), blockNumber: z.string().regex(/^\d+$/).optional() });

function firstUrl(value: unknown, protocol: 'https:' | 'wss:'): string | undefined {
  if (typeof value === 'string') return value.startsWith(protocol) ? value : undefined;
  if (Array.isArray(value)) for (const item of value) { const found = firstUrl(item, protocol); if (found) return found; }
  if (value && typeof value === 'object') for (const item of Object.values(value)) { const found = firstUrl(item, protocol); if (found) return found; }
  return undefined;
}

function teamAndProject(rpcUrl: string, values: Record<string, string>): { account: string; project: string } {
  const explicit = { account: values.E2E_TENDERLY_ACCOUNT_SLUG, project: values.E2E_TENDERLY_PROJECT_SLUG };
  if (explicit.account && explicit.project) return { account: explicit.account, project: explicit.project };
  const parts = new URL(rpcUrl).pathname.split('/').filter(Boolean);
  if (parts.length >= 2) return { account: parts[0]!, project: parts[1]! };
  throw new Error('无法从当前 Fork RPC 推导 Tenderly account/project；请配置 E2E_TENDERLY_ACCOUNT_SLUG 与 E2E_TENDERLY_PROJECT_SLUG。');
}

export class TenderlyForkManager {
  constructor(private readonly projectRoot: string) {}

  async create(raw: unknown) {
    const input = requestSchema.parse(raw);
    if (!['tx-fork', 'oracle-fork', 'time-fork'].includes(input.environment)) throw new Error('仅 tx-fork / oracle-fork / time-fork 支持创建 Tenderly Fork。');
    const values = { ...process.env, ...dotenv.parse(await readFile(join(this.projectRoot, '.env'), 'utf8').catch(() => '')), ...dotenv.parse(await readFile(join(this.projectRoot, '.env.local'), 'utf8').catch(() => '')) } as Record<string, string>;
    const token = values.E2E_TENDERLY_ACCESS_TOKEN;
    if (!token) throw new Error('缺少 E2E_TENDERLY_ACCESS_TOKEN。');
    const current = await readEnvironmentSettings(this.projectRoot, input.environment as EnvironmentName);
    if (!current.rpcUrl) throw new Error('请先配置一个同项目的 Tenderly Fork RPC，或配置 E2E_TENDERLY_ACCOUNT_SLUG / E2E_TENDERLY_PROJECT_SLUG。');
    const target = teamAndProject(current.rpcUrl, values);
    const response = await fetch(`https://api.tenderly.co/api/v1/account/${encodeURIComponent(target.account)}/project/${encodeURIComponent(target.project)}/fork`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'X-Access-Key': token },
      body: JSON.stringify({ network_id: '84532', ...(input.blockNumber ? { block_number: input.blockNumber } : {}) }),
    });
    const body = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new Error(`Tenderly 创建 Fork 失败：${String((body as { error?: { message?: string } }).error?.message ?? response.status)}`);
    const httpRpc = firstUrl(body, 'https:');
    const wssRpc = firstUrl(body, 'wss:') ?? (httpRpc ? httpRpc.replace(/^https:/, 'wss:') : undefined);
    const chainId = Number((body as { simulation_fork?: { chain_config?: { chain_id?: number } }; chain_config?: { chain_id?: number } }).simulation_fork?.chain_config?.chain_id ?? (body as { chain_config?: { chain_id?: number } }).chain_config?.chain_id ?? 84532);
    if (!httpRpc || !wssRpc) throw new Error('Tenderly 返回未包含可用 RPC/WSS 地址，未回填配置。');
    await saveEnvironmentSettings(this.projectRoot, input.environment as EnvironmentName, { rpcUrl: httpRpc, adminRpcUrl: httpRpc, wssUrl: wssRpc, chainId });
    return { environment: input.environment, rpcUrl: httpRpc, wssUrl: wssRpc, chainId, fork: body };
  }
}

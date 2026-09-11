import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import dotenv from 'dotenv';
import { z } from 'zod';

import { environmentNames, environments, type EnvironmentName } from '../../config/environments/catalog.js';
import {
  loadEnvironmentBinding,
  updateEnvironmentBinding,
} from '../config/environment-binding.js';
import { readEnvironmentSettings, saveEnvironmentSettings } from './environment-settings.js';

/**
 * Tenderly Virtual TestNet（VNet）自动创建 / 删除。
 *
 * 背景：Tenderly legacy Forks API（POST .../fork）已于 2026-03-31 停用，且无法指定 Chain ID；
 * 本模块改用 Virtual TestNets（Environments）REST API，并按 catalog.fixedChainId 固定每个环境的链 ID：
 *   POST   https://api.tenderly.co/api/public/v1/account/{account}/project/{project}/environments
 *          body: { display_name, slug?, network_configs: [{ network_id, block_number(hex)?, chain_config_overrides: { chain_id }, explorer_config }] }
 *          resp: { id, active_instance: { vnets: [{ id, rpcs: [{ name: 'Admin RPC' | 'Public RPC', url }], fork_config: { network_id, block_number } }] } }
 *   DELETE https://api.tenderly.co/api/public/v1/account/{account}/project/{project}/environments/{id} → 204
 * 文档：https://docs.tenderly.co/virtual-testnets/develop/rest-api（2026-08-21 核对）。
 *
 * 创建后：① 用 eth_chainId 校验固定编号；② 回填 .env.local 的 RPC / Admin RPC / WSS / Chain ID（saveEnvironmentSettings）；
 * ③ 在 config/tenderly-vnets.json 登记无凭证的记录（environment id 用于删除，只存 RPC 主机名）；
 * ④ 将 config/environment-bindings.json 的本环境复位到 Base 部署；
 * ⑤ 回写 Docs/contract-releases/CURRENT.json 的 environments.<env>（status/chainId/forkBlockNumber/forkOf）。
 */
const API_BASE = 'https://api.tenderly.co/api/public/v1';
/** Base Sepolia：fx100 v0.3.x 部署基线，所有 Fork 的 Parent Network */
const PARENT_NETWORK_ID = 84532;
const FORK_ENVIRONMENTS = ['tx-fork', 'oracle-fork', 'time-fork'] as const;
type ForkEnvironment = (typeof FORK_ENVIRONMENTS)[number];

const createSchema = z.object({
  environment: z.enum(environmentNames),
  /** 十进制区块号；省略 = latest（响应会回填实际 fork 块） */
  blockNumber: z.string().regex(/^\d+$/).optional(),
  /** 省略 = catalog.fixedChainId */
  chainId: z.number().int().positive().optional(),
  displayName: z.string().min(1).max(80).optional(),
  /** 默认 true：回写 Docs/contract-releases/CURRENT.json environments.<env> */
  updateRegistry: z.boolean().optional(),
  /** 只构造请求、不调用 Tenderly、不回填：用于核对参数（不需要 Access Token） */
  dryRun: z.boolean().optional(),
});
const removeSchema = z.object({
  environment: z.enum(environmentNames).optional(),
  environmentId: z.string().min(1).optional(),
});

export interface TenderlyVNetRecord {
  readonly environment: ForkEnvironment;
  /** Tenderly Environment UUID（删除用；不含访问凭证） */
  readonly environmentId: string;
  readonly vnetId?: string;
  readonly displayName: string;
  readonly chainId: number;
  readonly parentNetworkId: number;
  readonly forkBlockNumber?: number;
  /** 只存 RPC 主机名；带路径的 RPC 属于访问凭证，只写入 .env.local */
  readonly rpcHost: string;
  readonly createdAt: string;
  readonly deletedAt?: string;
}

interface VNetRegistryFile {
  schemaVersion: 1;
  vnets: TenderlyVNetRecord[];
}

interface TenderlyRpc { readonly name?: string; readonly url?: string }
interface TenderlyVNet {
  readonly id?: string;
  readonly rpcs?: readonly TenderlyRpc[];
  readonly fork_config?: { readonly network_id?: number | string; readonly block_number?: string | number };
}
interface TenderlyEnvironmentResponse {
  readonly id?: string;
  readonly display_name?: string;
  readonly active_instance?: { readonly id?: string; readonly vnets?: readonly TenderlyVNet[] };
  readonly error?: { readonly message?: string; readonly slug?: string };
}

export interface DryRunVNetResult {
  readonly dryRun: true;
  readonly environment: ForkEnvironment;
  readonly chainId: number;
  readonly endpoint: string;
  readonly requestBody: Record<string, unknown>;
  readonly credentialsReady: boolean;
  readonly missing: readonly string[];
}

export interface CreateVNetResult {
  readonly environment: ForkEnvironment;
  readonly chainId: number;
  readonly parentNetworkId: number;
  readonly forkBlockNumber?: number;
  readonly environmentId: string;
  readonly vnetId?: string;
  readonly displayName: string;
  readonly rpcHost: string;
  readonly publicRpcPresent: boolean;
  readonly baselineRegistryUpdated: boolean;
  readonly baselineRegistryNote?: string;
}

const REGISTRY_PATH = 'config/tenderly-vnets.json';
const BASELINE_REGISTRY_PATH = '../Docs/contract-releases/CURRENT.json';

function isForkEnvironment(value: EnvironmentName): value is ForkEnvironment {
  return (FORK_ENVIRONMENTS as readonly string[]).includes(value);
}

/** VNet RPC 形如 https://virtual.<network>[.<region>].rpc.tenderly.co/<account>/<project>/<id>；取前两段作为 slug。 */
function slugsFromRpc(rpcUrl: string): { account: string; project: string } | undefined {
  try {
    const url = new URL(rpcUrl);
    if (!url.hostname.endsWith('rpc.tenderly.co')) return undefined;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length >= 3) return { account: parts[0]!, project: parts[1]! };
    return undefined;
  } catch {
    return undefined;
  }
}

function parseBlockNumber(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : undefined;
  const text = value.trim();
  if (!text) return undefined;
  const parsed = text.startsWith('0x') ? Number.parseInt(text, 16) : Number.parseInt(text, 10);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

async function rpcChainId(rpcUrl: string): Promise<number> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
  });
  const body = await response.json() as { result?: string; error?: { message?: string } };
  if (body.error || typeof body.result !== 'string') throw new Error(`eth_chainId 失败：${body.error?.message ?? '无 result'}`);
  return Number.parseInt(body.result, 16);
}

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const error = (body as TenderlyEnvironmentResponse).error;
    if (error?.message) return `${error.message}${error.slug ? `（${error.slug}）` : ''}`;
    const raw = (body as { raw?: string }).raw;
    if (raw) return raw.slice(0, 300);
  }
  return `HTTP ${status}`;
}

function stamp(date: Date): { display: string; slug: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const display = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}Z`;
  const slug = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`;
  return { display, slug };
}

export class TenderlyForkManager {
  constructor(private readonly projectRoot: string) {}

  private async readValues(): Promise<Record<string, string>> {
    const base = dotenv.parse(await readFile(join(this.projectRoot, '.env'), 'utf8').catch(() => ''));
    const local = dotenv.parse(await readFile(join(this.projectRoot, '.env.local'), 'utf8').catch(() => ''));
    return { ...process.env, ...base, ...local } as Record<string, string>;
  }

  private async credentials(environment: ForkEnvironment): Promise<{ token: string; account: string; project: string }> {
    const values = await this.readValues();
    const missing: string[] = [];
    const token = values.E2E_TENDERLY_ACCESS_TOKEN;
    if (!token) missing.push('缺少 E2E_TENDERLY_ACCESS_TOKEN（环境页 ① 的「Tenderly Access Token」）');
    let account = values.E2E_TENDERLY_ACCOUNT_SLUG;
    let project = values.E2E_TENDERLY_PROJECT_SLUG;
    if (!account || !project) {
      // 显式 slug 优先；否则从本环境或任一同项目 Fork 的 RPC 路径推导（不读取、不回显 RPC 本身）
      for (const candidate of [environment, ...FORK_ENVIRONMENTS]) {
        const settings = await readEnvironmentSettings(this.projectRoot, candidate);
        const derived = settings.rpcUrl ? slugsFromRpc(settings.rpcUrl) : undefined;
        if (derived) { account = derived.account; project = derived.project; break; }
      }
    }
    if (!account || !project) {
      missing.push('无法确定 Tenderly account/project：请配置 E2E_TENDERLY_ACCOUNT_SLUG 与 E2E_TENDERLY_PROJECT_SLUG（或先为任一 Fork 配置同项目的 VNet RPC）');
    }
    if (missing.length || !token || !account || !project) throw new Error(missing.join('；'));
    return { token, account, project };
  }

  private registryPath(): string {
    return join(this.projectRoot, REGISTRY_PATH);
  }

  async list(): Promise<TenderlyVNetRecord[]> {
    try {
      const parsed = JSON.parse(await readFile(this.registryPath(), 'utf8')) as VNetRegistryFile;
      return Array.isArray(parsed.vnets) ? parsed.vnets : [];
    } catch {
      return [];
    }
  }

  private async writeRegistry(vnets: TenderlyVNetRecord[]): Promise<void> {
    const file: VNetRegistryFile = { schemaVersion: 1, vnets };
    await writeFile(this.registryPath(), `${JSON.stringify(file, null, 2)}\n`, 'utf8');
  }

  /** 回写基线登记：environments.<env> 的 status/chainId/forkBlockNumber/forkOf/note；失败只告警不阻断创建。 */
  private async updateBaselineRegistry(
    environment: ForkEnvironment,
    patch: {
      chainId: number;
      forkBlockNumber?: number;
      environmentId?: string;
      status: 'ready' | 'pending';
      note: string;
      resetToBaseDeployment?: boolean;
    },
  ): Promise<{ updated: boolean; note?: string }> {
    const path = resolve(this.projectRoot, BASELINE_REGISTRY_PATH);
    try {
      const registry = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
      const environmentsNode = (registry.environments ?? {}) as Record<string, Record<string, unknown>>;
      const current = environmentsNode[environment] ?? {};
      const deployments = Array.isArray(registry.deployments) ? registry.deployments as Array<Record<string, unknown>> : [];
      const baseSepolia = deployments.filter((item) => Number(item.chainId) === PARENT_NETWORK_ID);
      const baseDeploymentId = baseSepolia.length === 1 ? baseSepolia[0]!.id : null;
      // 新建 VNet 是从 Base Sepolia parent 重开，不含旧 VNet 上的私有部署。
      // 因此创建时必须把 forkOf 复位到 Base 部署；保留旧 forkOf 会让 v0.3.2 地址静默指向空 bytecode。
      const forkOf = patch.resetToBaseDeployment ? baseDeploymentId : (current.forkOf ?? baseDeploymentId);
      environmentsNode[environment] = {
        ...current,
        chainId: patch.chainId,
        forkOf,
        status: patch.status,
        ...(patch.forkBlockNumber !== undefined ? { forkBlockNumber: patch.forkBlockNumber } : {}),
        ...(patch.environmentId ? { tenderlyEnvironmentId: patch.environmentId } : {}),
        note: patch.note,
      };
      registry.environments = environmentsNode;
      const today = new Date().toISOString().slice(0, 10);
      registry.updatedAt = today;
      const history = Array.isArray(registry.history) ? registry.history as Array<Record<string, unknown>> : [];
      history.push({ date: today, change: `${environment}：${patch.note}` });
      registry.history = history;
      await writeFile(path, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
      return {
        updated: true,
        ...(forkOf === null ? { note: 'CURRENT.json deployments 中 Base Sepolia 部署不唯一/缺失，forkOf 留空待人工填写' } : {}),
      };
    } catch (error) {
      return { updated: false, note: `CURRENT.json 回写失败：${error instanceof Error ? error.message : String(error)}` };
    }
  }

  async create(raw: unknown): Promise<CreateVNetResult | DryRunVNetResult> {
    const input = createSchema.parse(raw);
    if (!isForkEnvironment(input.environment)) throw new Error('仅 tx-fork / oracle-fork / time-fork 支持创建 Tenderly Virtual TestNet。');
    const environment = input.environment;
    const definition = environments[environment];
    const chainId = input.chainId ?? definition.fixedChainId;
    if (!chainId) throw new Error(`${environment} 未在 config/environments/catalog.ts 登记 fixedChainId，也未显式传入 chainId。`);
    const now = stamp(new Date());
    const displayName = input.displayName ?? `fx100 ${environment} · chain ${chainId} · ${now.display}`;
    const requestBody = {
      display_name: displayName,
      slug: `fx100-${environment}-${now.slug}`,
      network_configs: [{
        network_id: String(PARENT_NETWORK_ID),
        ...(input.blockNumber ? { block_number: `0x${BigInt(input.blockNumber).toString(16)}` } : {}),
        chain_config_overrides: { chain_id: String(chainId) },
        // explorer 默认关闭；实测 2026-08-24：enabled:false 时携带 verification_visibility 会被 API 拒绝
        // （explorer_config.contract_verification_visibility is invalid），故整体省略。
      }],
    };
    if (input.dryRun) {
      const missing: string[] = [];
      let account = '<account>';
      let project = '<project>';
      try {
        const creds = await this.credentials(environment);
        account = creds.account; project = creds.project;
      } catch (error) {
        missing.push(error instanceof Error ? error.message : String(error));
      }
      return {
        dryRun: true,
        environment,
        chainId,
        endpoint: `POST ${API_BASE}/account/${account}/project/${project}/environments`,
        requestBody,
        credentialsReady: missing.length === 0,
        missing,
      };
    }
    const { token, account, project } = await this.credentials(environment);
    const response = await fetch(`${API_BASE}/account/${encodeURIComponent(account)}/project/${encodeURIComponent(project)}/environments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Access-Key': token },
      body: JSON.stringify(requestBody),
    });
    const text = await response.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    if (!response.ok) throw new Error(`Tenderly 创建 Virtual TestNet 失败：${errorMessage(body, response.status)}`);
    const created = body as TenderlyEnvironmentResponse;
    const environmentId = created.id;
    const vnet = created.active_instance?.vnets?.[0];
    const adminRpc = vnet?.rpcs?.find((item) => /admin/i.test(item.name ?? ''))?.url;
    const publicRpc = vnet?.rpcs?.find((item) => /public/i.test(item.name ?? ''))?.url;
    if (!environmentId || !adminRpc) {
      throw new Error(`Tenderly 响应未包含 environment id 或 Admin RPC，未回填配置（响应键：${Object.keys(created).join(',')}）。`);
    }
    // 固定编号校验：eth_chainId 必须等于请求值，否则保留环境以便排查、不回填
    const actualChainId = await rpcChainId(adminRpc);
    if (actualChainId !== chainId) {
      throw new Error(`新建 VNet 的 eth_chainId=${actualChainId} 与请求的 ${chainId} 不一致；已创建的环境 ${environmentId} 保留以便排查，未回填配置。`);
    }
    const forkBlockNumber = parseBlockNumber(vnet?.fork_config?.block_number);
    // 主 RPC 与 Admin RPC 都用 Admin RPC：私有 Fork 上普通读写与 cheatcode（evm_snapshot/evm_revert/setStorageAt）同一端点
    const wssUrl = adminRpc.replace(/^https:/, 'wss:');
    await saveEnvironmentSettings(this.projectRoot, environment, { rpcUrl: adminRpc, adminRpcUrl: adminRpc, wssUrl, chainId });
    const baseBinding = loadEnvironmentBinding(this.projectRoot, 'base-sepolia').binding;
    await updateEnvironmentBinding(this.projectRoot, environment, {
      ...baseBinding,
      environmentChainId: chainId,
    });
    const rpcHost = new URL(adminRpc).host;
    const record: TenderlyVNetRecord = {
      environment,
      environmentId,
      ...(vnet?.id ? { vnetId: vnet.id } : {}),
      displayName,
      chainId,
      parentNetworkId: PARENT_NETWORK_ID,
      ...(forkBlockNumber !== undefined ? { forkBlockNumber } : {}),
      rpcHost,
      createdAt: new Date().toISOString(),
    };
    const existing = (await this.list()).filter((item) => !(item.environment === environment && !item.deletedAt));
    await this.writeRegistry([...existing, record]);
    const registryResult = input.updateRegistry === false
      ? { updated: false, note: '按请求未回写 CURRENT.json' }
      : await this.updateBaselineRegistry(environment, {
        chainId,
        ...(forkBlockNumber !== undefined ? { forkBlockNumber } : {}),
        environmentId,
        status: 'ready',
        resetToBaseDeployment: true,
        note: `${new Date().toISOString().slice(0, 10)} 由 TestCode 通过 Tenderly Virtual TestNet API 自动创建（chain ${chainId}，fork Base Sepolia${forkBlockNumber !== undefined ? ` @${forkBlockNumber}` : ''}）`,
      });
    return {
      environment,
      chainId,
      parentNetworkId: PARENT_NETWORK_ID,
      ...(forkBlockNumber !== undefined ? { forkBlockNumber } : {}),
      environmentId,
      ...(vnet?.id ? { vnetId: vnet.id } : {}),
      displayName,
      rpcHost,
      publicRpcPresent: Boolean(publicRpc),
      baselineRegistryUpdated: registryResult.updated,
      ...(registryResult.note ? { baselineRegistryNote: registryResult.note } : {}),
    };
  }

  /** 删除 Virtual TestNet（按环境取最近一次创建记录，或显式 environmentId）；登记打 deletedAt，CURRENT.json 置回 pending。 */
  async remove(raw: unknown): Promise<{ environment?: ForkEnvironment; environmentId: string; deleted: boolean; status: number }> {
    const input = removeSchema.parse(raw);
    const records = await this.list();
    let record: TenderlyVNetRecord | undefined;
    if (input.environmentId) record = records.find((item) => item.environmentId === input.environmentId);
    else if (input.environment && isForkEnvironment(input.environment)) {
      record = [...records].reverse().find((item) => item.environment === input.environment && !item.deletedAt);
    }
    const environmentId = input.environmentId ?? record?.environmentId;
    if (!environmentId) throw new Error('没有可删除的 Virtual TestNet 记录：请给 environmentId，或先在该环境创建过。');
    const environment = record?.environment ?? (input.environment && isForkEnvironment(input.environment) ? input.environment : undefined);
    const { token, account, project } = await this.credentials(environment ?? 'tx-fork');
    const response = await fetch(`${API_BASE}/account/${encodeURIComponent(account)}/project/${encodeURIComponent(project)}/environments/${encodeURIComponent(environmentId)}`, {
      method: 'DELETE',
      headers: { 'X-Access-Key': token },
    });
    const deleted = response.status === 204 || response.ok;
    if (!deleted) {
      const text = await response.text();
      throw new Error(`Tenderly 删除 Virtual TestNet 失败（HTTP ${response.status}）：${text.slice(0, 300)}`);
    }
    if (record) {
      const now = new Date().toISOString();
      await this.writeRegistry(records.map((item) => (item === record ? { ...item, deletedAt: now } : item)));
    }
    if (environment) {
      await this.updateBaselineRegistry(environment, {
        chainId: record?.chainId ?? environments[environment].fixedChainId ?? 0,
        status: 'pending',
        note: `${new Date().toISOString().slice(0, 10)} Virtual TestNet ${environmentId} 已删除；需重新创建后再初始化`,
      });
    }
    return { ...(environment ? { environment } : {}), environmentId, deleted, status: response.status };
  }
}

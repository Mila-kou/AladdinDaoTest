import { chmod, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import dotenv from 'dotenv';

import {
  environmentNames,
  environments,
  type EnvironmentName,
} from '../../config/environments/catalog.js';
import {
  isCompleteDefaultMockResource,
  isMockResourceEnvironment,
  loadMockResourceRegistry,
} from '../config/mock-resources.js';
import { maskUrl } from '../config/runtime.js';

export interface EnvironmentProfile {
  readonly name: EnvironmentName;
  /** 每个环境/Fork 运行前必须与 RPC 实际 chainId 一致；看板仅显示，不暴露 RPC。 */
  readonly configuredChainId?: number;
  readonly rpcEnvironmentVariable: string;
  readonly adminRpcEnvironmentVariable?: string;
  readonly rpcConfigured: boolean;
  readonly adminRpcConfigured: boolean;
  readonly rpcMasked?: string;
  readonly adminRpcMasked?: string;
  readonly wssConfigured: boolean;
  readonly wssMasked?: string;
  readonly permitsTransactions: boolean;
  readonly permitsOracleMutation: boolean;
  readonly permitsTimeTravel: boolean;
  readonly initializesDefaultMockResources: boolean;
  readonly defaultMockStatus?: 'pending-initialization' | 'ready';
  readonly defaultMockMarketStatus?: 'unregistered' | 'registered';
  readonly defaultMockMarketIndex?: number;
  readonly defaultMockMarketProfileId?: string;
  readonly defaultMockMarketParameterCount?: number;
}

export interface RawEnvironmentSettings {
  readonly rpcUrl?: string;
  readonly adminRpcUrl?: string;
  readonly wssUrl?: string;
  readonly chainId?: number;
}

/**
 * 看板可从“环境配置”、“环境初始化”和“创建运行”三个入口更新同一份 .env.local。
 * 将读-改-写串行化，避免两个请求各自读取旧文件后覆盖对方的变更。
 */
let environmentSettingsWriteQueue: Promise<void> = Promise.resolve();

function serializeEnvironmentSettingsWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = environmentSettingsWriteQueue.then(operation);
  // 失败的保存不能让后续保存永久卡在 rejected 链上。
  environmentSettingsWriteQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function parseEnvironmentFile(path: string): Promise<Record<string, string>> {
  try {
    return dotenv.parse(await readFile(path, 'utf8'));
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code === 'ENOENT') return {};
    throw error;
  }
}

export function validateRpcUrl(rawUrl: string): string {
  const url = new URL(rawUrl.trim());
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('RPC 只允许 http 或 https 地址。');
  }
  if (url.username || url.password) {
    throw new Error('RPC 地址不能使用 URL 用户名或密码，请使用服务商提供的完整端点。');
  }
  return url.href;
}

export async function readEnvironmentSettings(
  projectRoot: string,
  environment: EnvironmentName,
): Promise<RawEnvironmentSettings> {
  const definition = environments[environment];
  const [local, defaults] = await Promise.all([
    parseEnvironmentFile(join(projectRoot, '.env.local')),
    parseEnvironmentFile(join(projectRoot, '.env')),
  ]);
  const value = (key: string | undefined): string | undefined => {
    if (!key) return undefined;
    // 看板保存的 .env.local 是当前项目的权威配置；不能被启动 Dashboard 时继承的旧 shell 环境覆盖。
    const raw = local[key] ?? defaults[key] ?? process.env[key];
    return raw?.trim() || undefined;
  };
  const rpcUrl = value(definition.rpcEnvironmentVariable);
  const adminRpcUrl = value(definition.adminRpcEnvironmentVariable);
  const wssUrl = value(definition.wssEnvironmentVariable);
  // 新配置按环境/Fork 独立保存；兼容旧项目的全局 E2E_CHAIN_ID 作为回退。
  const configuredChainId = Number(value(definition.chainIdEnvironmentVariable) ?? value('E2E_CHAIN_ID') ?? '');
  return {
    ...(rpcUrl ? { rpcUrl } : {}),
    ...(adminRpcUrl ? { adminRpcUrl } : {}),
    ...(wssUrl ? { wssUrl } : {}),
    ...(Number.isSafeInteger(configuredChainId) && configuredChainId > 0 ? { chainId: configuredChainId } : {}),
  };
}

export async function listEnvironmentProfiles(projectRoot: string): Promise<EnvironmentProfile[]> {
  const registry = await loadMockResourceRegistry();
  return Promise.all(environmentNames.map(async (name) => {
    const definition = environments[name];
    const settings = await readEnvironmentSettings(projectRoot, name);
    const mockResource = isMockResourceEnvironment(name) ? registry.resources[name] : undefined;
    return {
      name,
      ...(settings.chainId ? { configuredChainId: settings.chainId } : {}),
      rpcEnvironmentVariable: definition.rpcEnvironmentVariable,
      ...(definition.adminRpcEnvironmentVariable
        ? { adminRpcEnvironmentVariable: definition.adminRpcEnvironmentVariable }
        : {}),
      rpcConfigured: Boolean(settings.rpcUrl),
      adminRpcConfigured: Boolean(settings.adminRpcUrl),
      wssConfigured: Boolean(settings.wssUrl),
      ...(settings.rpcUrl ? { rpcMasked: maskUrl(settings.rpcUrl) } : {}),
      ...(settings.adminRpcUrl ? { adminRpcMasked: maskUrl(settings.adminRpcUrl) } : {}),
      ...(settings.wssUrl ? { wssMasked: maskUrl(settings.wssUrl) } : {}),
      permitsTransactions: definition.permitsTransactions,
      permitsOracleMutation: definition.permitsOracleMutation,
      permitsTimeTravel: definition.permitsTimeTravel,
      initializesDefaultMockResources: definition.initializesDefaultMockResources,
      ...(mockResource
        ? { defaultMockStatus: isCompleteDefaultMockResource(mockResource) ? 'ready' as const : 'pending-initialization' as const }
        : {}),
      ...(mockResource?.market?.status
        ? { defaultMockMarketStatus: mockResource.market.status }
        : {}),
      ...(mockResource?.market?.marketIndex !== undefined
        ? { defaultMockMarketIndex: mockResource.market.marketIndex }
        : {}),
      ...(mockResource?.market?.profileId
        ? { defaultMockMarketProfileId: mockResource.market.profileId }
        : {}),
      ...(mockResource?.market?.configuredParameterCount !== undefined
        ? { defaultMockMarketParameterCount: mockResource.market.configuredParameterCount }
        : {}),
    };
  }));
}

function replaceEnvironmentValue(source: string, key: string, value: string): string {
  const line = `${key}=${JSON.stringify(value)}`;
  const expression = new RegExp(`^${key}=.*$`, 'm');
  if (expression.test(source)) return source.replace(expression, line);
  const prefix = source.length === 0 || source.endsWith('\n') ? source : `${source}\n`;
  return `${prefix}${line}\n`;
}

export async function saveEnvironmentSettings(
  projectRoot: string,
  environment: EnvironmentName,
  input: { readonly rpcUrl?: string; readonly adminRpcUrl?: string; readonly wssUrl?: string; readonly chainId?: number },
): Promise<RawEnvironmentSettings> {
  const definition = environments[environment];
  if (!input.rpcUrl && !input.adminRpcUrl && !input.wssUrl && !input.chainId) return readEnvironmentSettings(projectRoot, environment);
  const path = join(projectRoot, '.env.local');
  const validatedRpcUrl = input.rpcUrl ? validateRpcUrl(input.rpcUrl) : undefined;
  const validatedAdminRpcUrl = input.adminRpcUrl ? validateRpcUrl(input.adminRpcUrl) : undefined;
  const validatedWssUrl = input.wssUrl?.trim();
  const validatedChainId = input.chainId;
  if (validatedChainId !== undefined && (!Number.isSafeInteger(validatedChainId) || validatedChainId <= 0)) throw new Error('Chain ID 必须为正整数。');
  if (validatedWssUrl && !/^wss:\/\/.+/i.test(validatedWssUrl)) throw new Error('WSS 地址必须以 wss:// 开头。');
  return serializeEnvironmentSettingsWrite(async () => {
    let source = '';
    try {
      source = await readFile(path, 'utf8');
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code !== 'ENOENT') throw error;
    }
    if (validatedRpcUrl) {
      source = replaceEnvironmentValue(
        source,
        definition.rpcEnvironmentVariable,
        validatedRpcUrl,
      );
    }
    if (validatedAdminRpcUrl) {
      if (!definition.adminRpcEnvironmentVariable) {
        throw new Error(`${environment} 不支持 Admin RPC 配置。`);
      }
      source = replaceEnvironmentValue(
        source,
        definition.adminRpcEnvironmentVariable,
        validatedAdminRpcUrl,
      );
    }
    if (validatedWssUrl) {
      if (!definition.wssEnvironmentVariable) throw new Error(`${environment} 不支持 WSS 配置。`);
      source = replaceEnvironmentValue(source, definition.wssEnvironmentVariable, validatedWssUrl);
    }
    if (validatedChainId !== undefined) {
      source = replaceEnvironmentValue(source, definition.chainIdEnvironmentVariable ?? 'E2E_CHAIN_ID', String(validatedChainId));
    }
    // 原子替换确保服务重启或进程异常时，至少保留一份完整的旧配置。
    const temporaryPath = `${path}.${process.pid}-${Date.now()}.tmp`;
    await writeFile(temporaryPath, source, { encoding: 'utf8', mode: 0o600 });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, path);
    // dotenv 在服务启动时已写入 process.env；同步更新可确保本次运行立即使用新端点。
    if (validatedRpcUrl) process.env[definition.rpcEnvironmentVariable] = validatedRpcUrl;
    if (validatedAdminRpcUrl && definition.adminRpcEnvironmentVariable) {
      process.env[definition.adminRpcEnvironmentVariable] = validatedAdminRpcUrl;
    }
    if (validatedWssUrl && definition.wssEnvironmentVariable) process.env[definition.wssEnvironmentVariable] = validatedWssUrl;
    if (validatedChainId !== undefined) process.env[definition.chainIdEnvironmentVariable ?? 'E2E_CHAIN_ID'] = String(validatedChainId);
    return readEnvironmentSettings(projectRoot, environment);
  });
}

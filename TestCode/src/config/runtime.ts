import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

import dotenv from 'dotenv';
import { z } from 'zod';

import {
  environmentNames,
  environments,
  type EnvironmentDefinition,
  type EnvironmentName,
} from '../../config/environments/catalog.js';
import { normalizeForkDisplayName } from '../domain/fork-display.js';

// .env.local 是看板保存的项目当前配置，必须覆盖启动进程遗留的同名环境变量。
dotenv.config({ path: resolve(process.cwd(), '.env'), quiet: true, override: true });
dotenv.config({ path: resolve(process.cwd(), '.env.local'), quiet: true, override: true });

const optionalUrl = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().url().optional(),
);
const optionalPrivateKey = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
);
const optionalAddress = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
);
const optionalText = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().min(1).optional(),
);
const optionalPositiveInteger = z.preprocess(
  // z.coerce.number() 会把空字符串转为 0。未启用环境的 Chain ID 允许留空，
  // 因此必须先把空白值归一化为 undefined，避免它阻断其他环境的初始化。
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.coerce.number().int().positive().optional(),
);

const rawEnvironmentSchema = z.object({
  E2E_ENV: z.enum(environmentNames).default('tx-fork'),
  E2E_APP_BASE_URL: z.string().url(),
  E2E_CHAIN_ID: optionalPositiveInteger,
  E2E_DEV_CHAIN_ID: optionalPositiveInteger,
  E2E_TX_FORK_CHAIN_ID: optionalPositiveInteger,
  E2E_ORACLE_FORK_CHAIN_ID: optionalPositiveInteger,
  E2E_TIME_FORK_CHAIN_ID: optionalPositiveInteger,
  E2E_BASE_SEPOLIA_CHAIN_ID: optionalPositiveInteger,
  E2E_DEPLOYMENT_MANIFEST: z.string().min(1),
  E2E_DEV_RPC_URL: optionalUrl,
  E2E_TX_FORK_RPC_URL: optionalUrl,
  E2E_ORACLE_FORK_RPC_URL: optionalUrl,
  E2E_TIME_FORK_RPC_URL: optionalUrl,
  E2E_BASE_SEPOLIA_RPC_URL: optionalUrl,
  E2E_TX_FORK_ADMIN_RPC_URL: optionalUrl,
  E2E_ORACLE_FORK_ADMIN_RPC_URL: optionalUrl,
  E2E_TIME_FORK_ADMIN_RPC_URL: optionalUrl,
  E2E_TEST_PRIVATE_KEY: optionalPrivateKey,
  E2E_SECONDARY_TEST_PRIVATE_KEY: optionalPrivateKey,
  E2E_TENDERLY_ACCESS_TOKEN: optionalText,
  E2E_SIGNING_MODE: z.enum(['private-key', 'impersonation']).default('private-key'),
  // 默认由测试侧 Keeper Driver 直接发送真实 executeOrder；只有 Keeper 服务专项测试才切 service。
  E2E_KEEPER_MODE: z.enum(['inline', 'service']).default('inline'),
  E2E_TEST_ACCOUNT: optionalAddress,
  E2E_KEEPER_ACCOUNT: optionalAddress,
  E2E_ADMIN_ACCOUNT: optionalAddress,
  E2E_FORK_RESET_MODE: z.enum(['snapshot', 'baseline']).default('baseline'),
  E2E_KEEPER_ENV_FILE: optionalText,
  E2E_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  E2E_FORK_BASELINE_ID: optionalText,
  E2E_FORK_DISPLAY_NAME: optionalText,
});

export interface RuntimeConfig {
  readonly environment: EnvironmentName;
  readonly definition: EnvironmentDefinition;
  readonly appBaseUrl: string;
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly adminRpcUrl?: string;
  readonly deploymentManifestPath: string;
  readonly requestTimeoutMs: number;
  readonly baselineId?: string;
  readonly forkDisplayName?: string;
  readonly hasPrimaryTestWallet: boolean;
  /** 仅供本地签名器使用；禁止写入日志、报告或序列化配置。 */
  readonly testPrivateKey?: `0x${string}`;
  readonly hasSecondaryTestWallet: boolean;
  /** Keeper 等第二签名角色使用；禁止写入日志、报告或序列化配置。 */
  readonly secondaryTestPrivateKey?: `0x${string}`;
  readonly hasTenderlyAccessToken: boolean;
  readonly signingMode: 'private-key' | 'impersonation';
  /** inline = 测试内 Keeper 真实签名执行；service = producer + worker 异步执行。 */
  readonly keeperMode: 'inline' | 'service';
  readonly testAccount?: `0x${string}`;
  readonly keeperAccount?: `0x${string}`;
  readonly adminAccount?: `0x${string}`;
  readonly forkResetMode: 'snapshot' | 'baseline';
  readonly keeperEnvFile?: string;
}

function readOptionalEnvironmentVariable(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

export function forkDisplayNameFromRpcUrl(rawUrl: string): string | undefined {
  const parsed = new URL(rawUrl);
  const segments = parsed.pathname.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment));
  if (segments.length === 0) return undefined;
  return normalizeForkDisplayName(segments.slice(-3).join('/'));
}

export function loadRuntimeConfig(): RuntimeConfig {
  const raw = rawEnvironmentSchema.parse(process.env);
  const definition = environments[raw.E2E_ENV];
  const scopedChainId = definition.chainIdEnvironmentVariable
    ? raw[definition.chainIdEnvironmentVariable as keyof typeof raw]
    : undefined;
  const chainId = typeof scopedChainId === 'number' ? scopedChainId : raw.E2E_CHAIN_ID;
  if (!chainId) {
    throw new Error(`环境 ${definition.name} 缺少 ${definition.chainIdEnvironmentVariable ?? 'E2E_CHAIN_ID'} 固定 Chain ID。`);
  }
  const rpcUrl = readOptionalEnvironmentVariable(definition.rpcEnvironmentVariable);

  if (!rpcUrl) {
    throw new Error(
      `环境 ${definition.name} 缺少 ${definition.rpcEnvironmentVariable}，请填写 .env.local。`,
    );
  }

  const adminRpcUrl = definition.adminRpcEnvironmentVariable
    ? readOptionalEnvironmentVariable(definition.adminRpcEnvironmentVariable)
    : undefined;

  let keeperSecrets: Record<string, string> = {};
  if (raw.E2E_KEEPER_ENV_FILE) {
    try {
      keeperSecrets = dotenv.parse(readFileSync(resolve(process.cwd(), raw.E2E_KEEPER_ENV_FILE)));
    } catch {
      keeperSecrets = {};
    }
  }
  const privateKeyPattern = /^0x[0-9a-fA-F]{64}$/;
  const traderPrivateKey = raw.E2E_TEST_PRIVATE_KEY
    ?? (privateKeyPattern.test(keeperSecrets.FX100_TRADER_PK ?? '') ? keeperSecrets.FX100_TRADER_PK : undefined);
  const secondaryPrivateKey = raw.E2E_SECONDARY_TEST_PRIVATE_KEY
    ?? (privateKeyPattern.test(keeperSecrets.ORDER_KEEPER_PRIVATE_KEY ?? '')
      ? keeperSecrets.ORDER_KEEPER_PRIVATE_KEY
      : undefined);

  if ((definition.permitsOracleMutation || definition.permitsTimeTravel) && !adminRpcUrl) {
    throw new Error(
      `环境 ${definition.name} 需要 ${definition.adminRpcEnvironmentVariable} 才能修改 Oracle 或时间。`,
    );
  }

  return {
    environment: raw.E2E_ENV,
    definition,
    appBaseUrl: raw.E2E_APP_BASE_URL,
    chainId,
    rpcUrl,
    ...(adminRpcUrl ? { adminRpcUrl } : {}),
    deploymentManifestPath: resolve(process.cwd(), raw.E2E_DEPLOYMENT_MANIFEST),
    requestTimeoutMs: raw.E2E_REQUEST_TIMEOUT_MS,
    ...(raw.E2E_FORK_BASELINE_ID ? { baselineId: raw.E2E_FORK_BASELINE_ID } : {}),
    ...(raw.E2E_ENV === 'dev-readonly' || raw.E2E_ENV === 'base-sepolia'
      ? {}
      : { forkDisplayName: normalizeForkDisplayName(raw.E2E_FORK_DISPLAY_NAME) ?? forkDisplayNameFromRpcUrl(rpcUrl) ?? raw.E2E_ENV }),
    hasPrimaryTestWallet: Boolean(traderPrivateKey),
    ...(traderPrivateKey
      ? { testPrivateKey: traderPrivateKey as `0x${string}` }
      : {}),
    hasSecondaryTestWallet: Boolean(secondaryPrivateKey),
    ...(secondaryPrivateKey
      ? { secondaryTestPrivateKey: secondaryPrivateKey as `0x${string}` }
      : {}),
    hasTenderlyAccessToken: Boolean(raw.E2E_TENDERLY_ACCESS_TOKEN),
    signingMode: raw.E2E_SIGNING_MODE,
    keeperMode: raw.E2E_KEEPER_MODE,
    ...(raw.E2E_TEST_ACCOUNT ? { testAccount: raw.E2E_TEST_ACCOUNT as `0x${string}` } : {}),
    ...(raw.E2E_KEEPER_ACCOUNT ? { keeperAccount: raw.E2E_KEEPER_ACCOUNT as `0x${string}` } : {}),
    ...(raw.E2E_ADMIN_ACCOUNT ? { adminAccount: raw.E2E_ADMIN_ACCOUNT as `0x${string}` } : {}),
    forkResetMode: raw.E2E_FORK_RESET_MODE,
    ...(raw.E2E_KEEPER_ENV_FILE
      ? { keeperEnvFile: resolve(process.cwd(), raw.E2E_KEEPER_ENV_FILE) }
      : {}),
  };
}

export function maskUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  const port = parsed.port ? `:${parsed.port}` : '';
  return `${parsed.protocol}//${parsed.hostname}${port}/***`;
}

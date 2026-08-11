import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { z } from 'zod';

import type { TestProject } from '../reporting/test-environments.js';

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const hashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

const deployedContractSchema = z.object({
  address: addressSchema,
  deploymentTxHash: hashSchema.optional(),
  deploymentBlock: z.number().int().nonnegative().optional(),
  origin: z.enum(['environment-init', 'inherited-base-deployment', 'recovered-evidence']),
});

const tokenSchema = deployedContractSchema.extend({
  name: z.string().min(1),
  symbol: z.string().min(1),
  decimals: z.number().int().min(0).max(255),
});

const oracleSchema = deployedContractSchema.extend({
  description: z.string().min(1),
  decimals: z.number().int().min(0).max(255),
  initialPrice: z.string().regex(/^\d+$/),
  minPrice: z.string().regex(/^\d+$/).optional(),
  maxPrice: z.string().regex(/^\d+$/).optional(),
  spreadBps: z.number().int().positive().optional(),
  provider: addressSchema.optional(),
});

const marketSchema = z.object({
  status: z.enum(['unregistered', 'registered']),
  marketIndex: z.number().int().nonnegative().optional(),
  vault: addressSchema.optional(),
  creationTxHash: hashSchema.optional(),
  profileId: z.string().min(1).optional(),
  bundleId: z.string().min(1).optional(),
  referenceMarketIndex: z.number().int().nonnegative().optional(),
  configuredParameterCount: z.number().int().nonnegative().optional(),
  configurationTxHashes: z.array(hashSchema).optional(),
  notes: z.string().min(1),
});

const bundleSchema = z.object({
  alias: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/),
  status: z.enum(['pending-initialization', 'ready']),
  initializedAt: z.string().datetime().optional(),
  token: tokenSchema.optional(),
  oracle: oracleSchema.optional(),
  market: marketSchema.optional(),
  notes: z.string().min(1),
});

const sharedCollateralSchema = z.object({
  status: z.enum(['pending-initialization', 'ready']),
  initializedAt: z.string().datetime().optional(),
  token: tokenSchema.optional(),
  oracle: oracleSchema.optional(),
  configurationTxHashes: z.array(hashSchema).optional(),
  inlineKeeperReady: z.boolean().default(false),
  notes: z.string().min(1),
});

const resourceSchema = z.object({
  alias: z.literal('default-mock'),
  status: z.enum(['pending-initialization', 'ready']),
  chainId: z.number().int().positive().optional(),
  forkDisplayName: z.string().min(1).optional(),
  initializedAt: z.string().datetime().optional(),
  oracleMode: z.object({
    index: z.literal('mock'),
    collateral: z.literal('mock'),
    inlineKeeperReady: z.literal(true),
  }).optional(),
  /** 新结构：Fork 级共享 USDC 与 Oracle。旧字段保留为 default-mock 兼容投影。 */
  sharedCollateral: sharedCollateralSchema.optional(),
  defaultBundleAlias: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/).optional(),
  bundles: z.record(z.string(), bundleSchema).optional(),
  /** @deprecated 使用 bundles[defaultBundleAlias].token。 */
  token: tokenSchema.optional(),
  /** @deprecated 使用 bundles[defaultBundleAlias].oracle。 */
  oracle: oracleSchema.optional(),
  /** @deprecated 使用 sharedCollateral.token。 */
  collateralToken: tokenSchema.optional(),
  /** @deprecated 使用 sharedCollateral.oracle。 */
  collateralOracle: oracleSchema.optional(),
  /** @deprecated 使用 bundles[defaultBundleAlias].market。 */
  market: marketSchema.optional(),
  notes: z.string().min(1),
});

const registrySchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.string().datetime(),
  resources: z.object({
    'tx-fork': resourceSchema,
    'oracle-fork': resourceSchema,
    'time-fork': resourceSchema,
  }),
});

export type MockResourceRecord = z.infer<typeof resourceSchema>;
export type MockMarketBundleRecord = z.infer<typeof bundleSchema>;
export type SharedCollateralRecord = z.infer<typeof sharedCollateralSchema>;
export type MockResourceRegistry = z.infer<typeof registrySchema>;
export type MockResourceEnvironment = keyof MockResourceRegistry['resources'];

function registryPath(): string {
  return resolve(
    process.cwd(),
    process.env.E2E_MOCK_RESOURCE_REGISTRY ?? './config/mock-resources.json',
  );
}

export function isMockResourceEnvironment(project: TestProject): project is MockResourceEnvironment {
  return project === 'tx-fork' || project === 'oracle-fork' || project === 'time-fork';
}

/**
 * 旧登记只有 Index Mock Oracle，不能供 Inline Keeper 使用。只有 Market Bundle 的
 * Index/Collateral 两路 Oracle、Market 与 bundleId 都登记完整，才允许显示 ready。
 */
function bundleProjection(resource: MockResourceRecord, alias: string): MockMarketBundleRecord | undefined {
  const stored = resource.bundles?.[alias];
  if (stored) return stored;
  if (alias !== (resource.defaultBundleAlias ?? 'default-mock')) return undefined;
  if (!resource.token && !resource.oracle && !resource.market) return undefined;
  return {
    alias,
    status: resource.status,
    ...(resource.initializedAt ? { initializedAt: resource.initializedAt } : {}),
    ...(resource.token ? { token: resource.token } : {}),
    ...(resource.oracle ? { oracle: resource.oracle } : {}),
    ...(resource.market ? { market: resource.market } : {}),
    notes: resource.notes,
  };
}

function collateralProjection(resource: MockResourceRecord): SharedCollateralRecord | undefined {
  if (resource.sharedCollateral) return resource.sharedCollateral;
  if (!resource.collateralToken && !resource.collateralOracle) return undefined;
  const inlineKeeperReady = Boolean(resource.collateralToken)
    && Boolean(resource.collateralOracle)
    && resource.oracleMode?.collateral === 'mock'
    && resource.oracleMode.inlineKeeperReady === true;
  return {
    status: inlineKeeperReady ? 'ready' : 'pending-initialization',
    ...(resource.initializedAt ? { initializedAt: resource.initializedAt } : {}),
    ...(resource.collateralToken ? { token: resource.collateralToken } : {}),
    ...(resource.collateralOracle ? { oracle: resource.collateralOracle } : {}),
    inlineKeeperReady,
    notes: resource.notes,
  };
}

export function listMockMarketBundles(resource: MockResourceRecord): MockMarketBundleRecord[] {
  if (resource.bundles) return Object.values(resource.bundles);
  const fallback = bundleProjection(resource, resource.defaultBundleAlias ?? 'default-mock');
  return fallback ? [fallback] : [];
}

export function isCompleteMockMarketBundle(resource: MockResourceRecord, alias: string): boolean {
  const bundle = bundleProjection(resource, alias);
  const collateral = collateralProjection(resource);
  return resource.status === 'ready'
    && bundle?.status === 'ready'
    && Boolean(bundle.token)
    && Boolean(bundle.oracle)
    && Boolean(bundle.oracle?.minPrice)
    && Boolean(bundle.oracle?.maxPrice)
    && bundle.market?.status === 'registered'
    && bundle.market.marketIndex !== undefined
    && Boolean(bundle.market.bundleId)
    && collateral?.status === 'ready'
    && Boolean(collateral.token)
    && Boolean(collateral.oracle)
    && Boolean(collateral.oracle?.minPrice)
    && Boolean(collateral.oracle?.maxPrice)
    && Boolean(collateral.oracle?.provider)
    && collateral.inlineKeeperReady;
}

export function isCompleteDefaultMockResource(resource: MockResourceRecord): boolean {
  return isCompleteMockMarketBundle(resource, resource.defaultBundleAlias ?? 'default-mock');
}

export async function loadMockResourceRegistry(): Promise<MockResourceRegistry> {
  const parsed = registrySchema.parse(JSON.parse(await readFile(registryPath(), 'utf8')) as unknown);
  return registrySchema.parse({
    ...parsed,
    resources: Object.fromEntries(Object.entries(parsed.resources).map(([environment, resource]) => {
      const defaultBundleAlias = resource.defaultBundleAlias ?? 'default-mock';
      const defaultBundle = bundleProjection(resource, defaultBundleAlias);
      const sharedCollateral = collateralProjection(resource);
      return [environment, {
        ...resource,
        defaultBundleAlias,
        ...(defaultBundle ? { bundles: { ...(resource.bundles ?? {}), [defaultBundleAlias]: defaultBundle } } : {}),
        ...(sharedCollateral ? { sharedCollateral } : {}),
      }];
    })),
  });
}

export async function resolveDefaultMockResource(
  project: TestProject,
): Promise<MockResourceRecord> {
  return resolveMockMarketBundle(project, 'default-mock');
}

export async function resolveMockMarketBundle(
  project: TestProject,
  alias: string,
): Promise<MockResourceRecord> {
  if (!isMockResourceEnvironment(project)) {
    throw new Error(`${project} 不部署默认 Mock 资源；仅 tx-fork / oracle-fork / time-fork 支持。`);
  }
  const resource = (await loadMockResourceRegistry()).resources[project];
  if (!isCompleteMockMarketBundle(resource, alias)) {
    throw new Error(`${project}/${alias} 尚未完成双 Mock Oracle Market Bundle 初始化；请在环境页重新初始化。`);
  }
  const bundle = bundleProjection(resource, alias)!;
  const collateral = collateralProjection(resource)!;
  return resourceSchema.parse({
    ...resource,
    alias: 'default-mock',
    token: bundle.token,
    oracle: bundle.oracle,
    collateralToken: collateral.token,
    collateralOracle: collateral.oracle,
    market: bundle.market,
    oracleMode: { index: 'mock', collateral: 'mock', inlineKeeperReady: true },
  });
}

export async function saveDefaultMockResource(
  project: MockResourceEnvironment,
  input: MockResourceRecord,
): Promise<void> {
  return saveMockMarketBundle(project, input.defaultBundleAlias ?? 'default-mock', input);
}

/** 保存一个独立 Index Market Bundle；共享 Collateral 只保留一份并在后续 Bundle 中复用。 */
export async function saveMockMarketBundle(
  project: MockResourceEnvironment,
  alias: string,
  input: MockResourceRecord,
): Promise<void> {
  const path = registryPath();
  const current = await loadMockResourceRegistry();
  const currentResource = current.resources[project];
  const defaultAlias = currentResource.defaultBundleAlias ?? 'default-mock';
  const bundle = bundleSchema.parse({
    alias,
    status: input.status,
    ...(input.initializedAt ? { initializedAt: input.initializedAt } : {}),
    ...(input.token ? { token: input.token } : {}),
    ...(input.oracle ? { oracle: input.oracle } : {}),
    ...(input.market ? { market: input.market } : {}),
    notes: input.notes,
  });
  const sharedCollateral = sharedCollateralSchema.parse({
    status: input.sharedCollateral?.status ?? input.status,
    ...((input.sharedCollateral?.initializedAt ?? input.initializedAt)
      ? { initializedAt: input.sharedCollateral?.initializedAt ?? input.initializedAt }
      : {}),
    ...((input.sharedCollateral?.token ?? input.collateralToken)
      ? { token: input.sharedCollateral?.token ?? input.collateralToken }
      : {}),
    ...((input.sharedCollateral?.oracle ?? input.collateralOracle)
      ? { oracle: input.sharedCollateral?.oracle ?? input.collateralOracle }
      : {}),
    ...(input.sharedCollateral?.configurationTxHashes
      ? { configurationTxHashes: input.sharedCollateral.configurationTxHashes }
      : {}),
    inlineKeeperReady: input.sharedCollateral?.inlineKeeperReady
      ?? input.oracleMode?.inlineKeeperReady === true,
    notes: input.sharedCollateral?.notes ?? input.notes,
  });
  const normalized = resourceSchema.parse({
    ...currentResource,
    ...input,
    alias: 'default-mock',
    defaultBundleAlias: defaultAlias,
    sharedCollateral,
    bundles: { ...(currentResource.bundles ?? {}), ...(input.bundles ?? {}), [alias]: bundle },
    // 扁平字段永远投影默认 Bundle，保证旧用例和旧看板兼容。
    ...(alias === defaultAlias ? {
      token: input.token,
      oracle: input.oracle,
      market: input.market,
    } : {
      token: currentResource.token,
      oracle: currentResource.oracle,
      market: currentResource.market,
    }),
    collateralToken: sharedCollateral.token,
    collateralOracle: sharedCollateral.oracle,
  });
  const next = registrySchema.parse({
    ...current,
    updatedAt: new Date().toISOString(),
    resources: { ...current.resources, [project]: normalized },
  });
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
}

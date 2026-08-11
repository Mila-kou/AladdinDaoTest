import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { z } from 'zod';

import {
  defaultMockMarketProfile,
  type DefaultMockMarketParameter,
} from '../../config/markets/default-mock.js';
import {
  environmentNames,
  type EnvironmentName,
} from '../../config/environments/catalog.js';
import { defaultMockParameterLabel } from '../config/default-mock-market.js';

const unsignedInteger = z.string().regex(/^\d+$/, '必须填写非负整数原始值。');
const signedInteger = z.string().regex(/^-?\d+$/, '必须填写整数原始值。');
const positiveDecimal = z.string().regex(/^\d+(?:\.\d+)?$/, '必须填写大于 0 的十进制价格。');

const initializationProfileObjectSchema = z.object({
  token: z.object({
    name: z.string().trim().min(1).max(80),
    symbol: z.string().trim().min(1).max(20),
    decimals: z.number().int().min(0).max(36),
  }),
  oracle: z.object({
    description: z.string().trim().min(1).max(120),
    decimals: z.number().int().min(0).max(36),
    /** 用户可读的 USD 价格；部署时按 Oracle decimals 换算为 Chainlink 原始价格。 */
    minPrice: positiveDecimal,
    maxPrice: positiveDecimal,
    heartbeatDuration: unsignedInteger,
  }),
  collateralOracle: z.object({
    description: z.string().trim().min(1).max(120),
    decimals: z.number().int().min(0).max(36),
    minPrice: positiveDecimal,
    maxPrice: positiveDecimal,
    heartbeatDuration: unsignedInteger,
  }),
  referenceMarketIndex: z.number().int().positive(),
  parameterOverrides: z.record(z.string(), signedInteger).default({}),
  funding: z.object({
    nativeBalanceEth: positiveDecimal,
    traderCollateral: positiveDecimal,
    minimumLpCollateral: positiveDecimal,
    routerAllowance: z.enum(['max', 'exact']),
  }),
  operations: z.object({
    configureMarketParameters: z.boolean(),
    configureFundingParameters: z.boolean(),
    configureFeeRatio: z.boolean(),
    fundNativeAccounts: z.boolean(),
    fundTraderCollateral: z.boolean(),
    seedLpLiquidity: z.boolean(),
    grantRoles: z.boolean(),
    configureRouterAllowance: z.boolean(),
    validateAfterInitialization: z.boolean(),
  }),
});

const initializationProfileSchema = initializationProfileObjectSchema;

const storeSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.string().datetime(),
  environments: z.record(z.string(), initializationProfileObjectSchema.partial()).default({}),
});

const saveSchema = z.object({
  environment: z.enum(environmentNames),
  profile: initializationProfileSchema,
});

export type EnvironmentInitializationProfile = z.infer<typeof initializationProfileSchema>;

export interface InitializationParameterDescriptor {
  readonly label: string;
  readonly baseKey: string;
  readonly valueType: 'uint' | 'int';
  readonly group: 'funding' | 'fee' | 'market';
  readonly overrideValue?: string;
}

function profilePath(projectRoot: string): string {
  return resolve(
    projectRoot,
    process.env.E2E_INITIALIZATION_PROFILES
      ?? './config/environment-initialization-profiles.json',
  );
}

function groupFor(parameter: DefaultMockMarketParameter): InitializationParameterDescriptor['group'] {
  if (parameter.baseKey.startsWith('FUNDING_')
    || parameter.baseKey.includes('FUNDING_FACTOR')) return 'funding';
  if (parameter.baseKey === 'POSITION_FEE_FACTOR') return 'fee';
  return 'market';
}

function defaultProfile(): EnvironmentInitializationProfile {
  return {
    token: {
      name: defaultMockMarketProfile.token.name,
      symbol: defaultMockMarketProfile.token.symbol,
      decimals: defaultMockMarketProfile.token.decimals,
    },
    oracle: {
      description: defaultMockMarketProfile.oracle.description,
      decimals: defaultMockMarketProfile.oracle.decimals,
      minPrice: '60000',
      maxPrice: '60060',
      heartbeatDuration: defaultMockMarketProfile.oracle.heartbeatDuration.toString(),
    },
    collateralOracle: {
      description: 'Mock USDC / USD',
      decimals: 8,
      minPrice: '0.999',
      maxPrice: '1.001',
      heartbeatDuration: '86400',
    },
    referenceMarketIndex: defaultMockMarketProfile.referenceMarketIndex,
    parameterOverrides: {},
    funding: {
      nativeBalanceEth: '10',
      traderCollateral: '1000000',
      minimumLpCollateral: '500000',
      routerAllowance: 'max',
    },
    operations: {
      configureMarketParameters: true,
      configureFundingParameters: true,
      configureFeeRatio: true,
      fundNativeAccounts: true,
      fundTraderCollateral: true,
      seedLpLiquidity: true,
      grantRoles: true,
      configureRouterAllowance: true,
      validateAfterInitialization: true,
    },
  };
}

function decimalPrice(raw: string, decimals: number): string {
  const value = BigInt(raw);
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const fraction = (value % divisor).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** 将已保存的 initialPrice + spreadBps 配置无损迁移为可读的 min/max 价格。 */
function migrateLegacyOraclePrices(rawStore: unknown): unknown {
  if (!rawStore || typeof rawStore !== 'object' || !('environments' in rawStore)) return rawStore;
  const store = rawStore as { environments?: Record<string, unknown> };
  const environments = Object.fromEntries(Object.entries(store.environments ?? {}).map(([name, profile]) => {
    if (!profile || typeof profile !== 'object') return [name, profile];
    const oracle = (profile as { oracle?: unknown }).oracle;
    const legacy = oracle && typeof oracle === 'object'
      ? oracle as { initialPrice?: unknown; spreadBps?: unknown; decimals?: unknown; minPrice?: unknown; maxPrice?: unknown }
      : undefined;
    let migratedOracle = legacy;
    if (legacy && !(typeof legacy.minPrice === 'string' && typeof legacy.maxPrice === 'string')
      && typeof legacy.initialPrice === 'string' && /^\d+$/.test(legacy.initialPrice)
      && typeof legacy.decimals === 'number' && Number.isInteger(legacy.decimals)) {
      const minRaw = BigInt(legacy.initialPrice);
      const spreadBps = typeof legacy.spreadBps === 'number' && Number.isInteger(legacy.spreadBps)
        ? legacy.spreadBps : 10;
      const maxRaw = minRaw * BigInt(10_000 + spreadBps) / 10_000n;
      migratedOracle = {
        ...legacy,
        minPrice: decimalPrice(minRaw.toString(), legacy.decimals),
        maxPrice: decimalPrice(maxRaw.toString(), legacy.decimals),
      };
    }
    const legacyFunding = (profile as { funding?: unknown }).funding;
    const funding = legacyFunding && typeof legacyFunding === 'object' ? legacyFunding as Record<string, unknown> : undefined;
    const migratedFunding = funding && typeof funding.nativeBalanceWei === 'string'
      && typeof funding.traderCollateralAmount === 'string' && typeof funding.minimumLpCollateralAmount === 'string'
      ? { ...funding, nativeBalanceEth: decimalPrice(funding.nativeBalanceWei, 18), traderCollateral: decimalPrice(funding.traderCollateralAmount, 6), minimumLpCollateral: decimalPrice(funding.minimumLpCollateralAmount, 6) }
      : funding;
    return [name, {
      ...(profile as object),
      ...(migratedOracle ? { oracle: migratedOracle } : {}),
      ...(migratedFunding ? { funding: migratedFunding } : {}),
    }];
  }));
  return { ...(rawStore as object), environments };
}

async function readStore(projectRoot: string): Promise<z.infer<typeof storeSchema>> {
  try {
    return storeSchema.parse(migrateLegacyOraclePrices(JSON.parse(await readFile(profilePath(projectRoot), 'utf8')) as unknown));
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code === 'ENOENT') {
      return { schemaVersion: 1, updatedAt: new Date(0).toISOString(), environments: {} };
    }
    throw error;
  }
}

export function initializationParameterDescriptors(
  profile: EnvironmentInitializationProfile,
): readonly InitializationParameterDescriptor[] {
  return defaultMockMarketProfile.parameters.map((parameter) => {
    const label = defaultMockParameterLabel(parameter);
    const overrideValue = profile.parameterOverrides[label];
    return {
      label,
      baseKey: parameter.baseKey,
      valueType: parameter.valueType,
      group: groupFor(parameter),
      ...(overrideValue === undefined ? {} : { overrideValue }),
    };
  });
}

export function shouldConfigureParameter(
  profile: EnvironmentInitializationProfile,
  parameter: DefaultMockMarketParameter,
): boolean {
  const group = groupFor(parameter);
  if (group === 'funding') return profile.operations.configureFundingParameters;
  if (group === 'fee') return profile.operations.configureFeeRatio;
  return profile.operations.configureMarketParameters;
}

export async function loadEnvironmentInitializationProfile(
  projectRoot: string,
  environment: EnvironmentName,
): Promise<EnvironmentInitializationProfile> {
  const stored = (await readStore(projectRoot)).environments[environment] ?? {};
  const base = defaultProfile();
  return initializationProfileSchema.parse({
    ...base,
    ...stored,
    token: { ...base.token, ...stored.token },
    oracle: { ...base.oracle, ...stored.oracle },
    collateralOracle: { ...base.collateralOracle, ...stored.collateralOracle },
    funding: { ...base.funding, ...stored.funding },
    operations: { ...base.operations, ...stored.operations },
    parameterOverrides: stored.parameterOverrides ?? {},
  });
}

export async function readEnvironmentInitializationProfile(
  projectRoot: string,
  environment: EnvironmentName,
) {
  const profile = await loadEnvironmentInitializationProfile(projectRoot, environment);
  return {
    environment,
    profile,
    parameters: initializationParameterDescriptors(profile),
  };
}

export async function saveEnvironmentInitializationProfile(
  projectRoot: string,
  rawInput: unknown,
) {
  const input = saveSchema.parse(rawInput);
  const allowedLabels = new Map(defaultMockMarketProfile.parameters.map((parameter) => [
    defaultMockParameterLabel(parameter),
    parameter,
  ]));
  for (const [label, value] of Object.entries(input.profile.parameterOverrides)) {
    const parameter = allowedLabels.get(label);
    if (!parameter) throw new Error(`未知 Market 参数：${label}`);
    if (parameter.valueType === 'uint' && value.startsWith('-')) {
      throw new Error(`${label} 是 uint，不能填写负数。`);
    }
  }
  const current = await readStore(projectRoot);
  const next = storeSchema.parse({
    ...current,
    updatedAt: new Date().toISOString(),
    environments: { ...current.environments, [input.environment]: input.profile },
  });
  const path = profilePath(projectRoot);
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
  return readEnvironmentInitializationProfile(projectRoot, input.environment);
}

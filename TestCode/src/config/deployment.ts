import { access, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { z } from 'zod';
import type { Abi } from 'viem';

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

const requiredContractsSchema = z.object({
  exchangeRouter: addressSchema,
  reader: addressSchema,
  dataStore: addressSchema,
  roleStore: addressSchema,
  config: addressSchema,
  oracle: addressSchema,
  orderHandler: addressSchema,
  liquidationHandler: addressSchema,
  adlHandler: addressSchema,
  eventEmitter: addressSchema,
  positionVault: addressSchema,
});

const rolesSchema = z.object({
  controller: addressSchema,
  configKeeper: addressSchema,
  orderKeeper: addressSchema,
  liquidationKeeper: addressSchema,
  adlKeeper: addressSchema,
});

const marketSchema = z.object({
  name: z.string().min(1),
  symbol: z.string().min(1),
  marketIndex: z.string().regex(/^\d+$/),
  indexToken: addressSchema,
  collateralToken: addressSchema,
  vault: addressSchema,
  indexTokenDecimals: z.number().int().min(0).max(255),
  collateralTokenDecimals: z.number().int().min(0).max(255),
  synthetic: z.boolean(),
});

const sourceSchema = z.object({
  deploymentDirectory: z.string().min(1),
  addressesFile: z.string().min(1),
  abiDirectory: z.string().min(1),
  parametersFile: z.string().min(1),
  rolesFile: z.string().min(1),
  tokensFile: z.string().min(1),
});

const initializationSchema = z.object({
  nativeEth: z.object({
    trader: z.string().regex(/^\d+(?:\.\d+)?$/),
    keeper: z.string().regex(/^\d+(?:\.\d+)?$/),
    admin: z.string().regex(/^\d+(?:\.\d+)?$/),
  }),
  traderUsdc: z.string().regex(/^\d+(?:\.\d+)?$/),
  minimumLpUsdc: z.string().regex(/^\d+(?:\.\d+)?$/),
  routerApproval: z.literal('max'),
  keeperRoles: z.array(z.string().min(1)).min(1),
});

export const deploymentManifestSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().min(1),
  release: z.string().min(1),
  chainId: z.number().int().positive(),
  forkBlockNumber: z.string().regex(/^\d+$/),
  contracts: requiredContractsSchema,
  roles: rolesSchema,
  markets: z.array(marketSchema).min(1),
  additionalContracts: z.record(z.string(), addressSchema).default({}),
  source: sourceSchema.optional(),
  abiFiles: z.record(z.string(), z.string().min(1)).default({}),
  initialization: initializationSchema.optional(),
});

export type DeploymentManifest = z.infer<typeof deploymentManifestSchema>;

/**
 * deployment manifest 保存完整 JSON 快照；参数页消费同目录的按模块 CSV。
 * 同时兼容旧生成名 `<deployment>.params.*` 与正式三层归档名 `parameters.*`。
 */
export function parameterSnapshotCsvPath(parametersFile: string): string {
  if (/\.params\.json$/.test(parametersFile)) {
    return parametersFile.replace(/\.params\.json$/, '.params-by-module.csv');
  }
  if (/(^|\/)parameters\.json$/.test(parametersFile)) {
    return parametersFile.replace(/parameters\.json$/, 'parameters-by-module.csv');
  }
  throw new Error(`无法从参数 JSON 推导按模块 CSV：${parametersFile}`);
}

export function parameterSnapshotJsonPath(parametersCsv: string): string {
  if (/\.params-by-module(?:-set)?\.csv$/.test(parametersCsv)) {
    return parametersCsv.replace(/\.params-by-module(?:-set)?\.csv$/, '.params.json');
  }
  if (/(^|\/)parameters-by-module\.csv$/.test(parametersCsv)) {
    return parametersCsv.replace(/parameters-by-module\.csv$/, 'parameters.json');
  }
  throw new Error(`无法从参数 CSV 推导完整 JSON：${parametersCsv}`);
}

export async function loadDeploymentManifest(path: string): Promise<DeploymentManifest> {
  const source = await readFile(path, 'utf8');
  return deploymentManifestSchema.parse(JSON.parse(source) as unknown);
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const artifactPathCache = new Map<string, Promise<string>>();

async function findArtifact(root: string, name: string): Promise<string> {
  const cacheKey = `${root}\0${name}`;
  let result = artifactPathCache.get(cacheKey);
  if (!result) {
    result = (async () => {
      const expected = `${name}.json`;
      const matches: string[] = [];
      const stack = [root];
      while (stack.length > 0) {
        const directory = stack.pop()!;
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          if (entry.name === 'build-info' || entry.name === 'cache') continue;
          const path = resolve(directory, entry.name);
          if (entry.isDirectory()) stack.push(path);
          else if (entry.isFile() && entry.name === expected) matches.push(path);
        }
      }
      const preferred = matches.find((path) => path.endsWith(`/${name}.sol/${name}.json`))
        ?? matches[0];
      if (!preferred) throw new Error(`ABI 目录 ${root} 找不到 ${expected}`);
      return preferred;
    })();
    artifactPathCache.set(cacheKey, result);
    result.catch(() => artifactPathCache.delete(cacheKey));
  }
  return result;
}

/** 同时兼容 v0.3.1 的扁平 ABI 数组与 Hardhat artifacts 的 `{ abi }` 结构。 */
export async function loadDeploymentAbi(
  manifest: DeploymentManifest,
  name: string,
  projectRoot: string = process.cwd(),
): Promise<Abi> {
  const directory = manifest.source?.abiDirectory;
  if (!directory) throw new Error(`Deployment manifest ${manifest.name} 缺少 source.abiDirectory`);
  const root = resolve(projectRoot, directory);
  const explicit = manifest.abiFiles[name];
  const direct = resolve(root, explicit ?? `${name}.json`);
  const path = await fileExists(direct) ? direct : await findArtifact(root, name);
  const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
  const abi = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { abi?: unknown }).abi)
      ? (parsed as { abi: unknown[] }).abi
      : undefined;
  if (!abi) throw new Error(`${path} 既不是 ABI 数组，也不含 abi 数组`);
  return abi as Abi;
}

export interface ContractArtifact {
  readonly abi: Abi;
  readonly bytecode?: `0x${string}`;
  readonly path: string;
}

/** 从显式版本绑定的 artifacts 根目录按合约名读取 ABI/bytecode。 */
export async function loadContractArtifact(
  artifactDirectory: string,
  name: string,
): Promise<ContractArtifact> {
  const path = await findArtifact(resolve(artifactDirectory), name);
  const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object') throw new Error(`${path} 不是合约 artifact 对象`);
  const record = parsed as { abi?: unknown; bytecode?: unknown };
  if (!Array.isArray(record.abi)) throw new Error(`${path} 缺少 abi 数组`);
  const rawBytecode = typeof record.bytecode === 'string'
    ? record.bytecode
    : record.bytecode && typeof record.bytecode === 'object'
      && typeof (record.bytecode as { object?: unknown }).object === 'string'
      ? (record.bytecode as { object: string }).object
      : undefined;
  const bytecode = rawBytecode
    ? (rawBytecode.startsWith('0x') ? rawBytecode : `0x${rawBytecode}`) as `0x${string}`
    : undefined;
  return {
    abi: record.abi as Abi,
    ...(bytecode ? { bytecode } : {}),
    path,
  };
}

export function getDeploymentAddresses(
  manifest: DeploymentManifest,
): ReadonlyArray<{ name: string; address: `0x${string}` }> {
  const contracts = Object.entries(manifest.contracts).map(([name, address]) => ({
    name: `contract.${name}`,
    address: address as `0x${string}`,
  }));

  const additionalContracts = Object.entries(manifest.additionalContracts).map(
    ([name, address]) => ({
      name: `additionalContract.${name}`,
      address: address as `0x${string}`,
    }),
  );

  const marketContracts = manifest.markets.flatMap((market) => [
    { name: `market.${market.name}.indexToken`, address: market.indexToken as `0x${string}` },
    {
      name: `market.${market.name}.collateralToken`,
      address: market.collateralToken as `0x${string}`,
    },
    { name: `market.${market.name}.vault`, address: market.vault as `0x${string}` },
  ]);

  return [...contracts, ...additionalContracts, ...marketContracts];
}

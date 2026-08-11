import { readFile } from 'node:fs/promises';

import { z } from 'zod';

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

export async function loadDeploymentManifest(path: string): Promise<DeploymentManifest> {
  const source = await readFile(path, 'utf8');
  return deploymentManifestSchema.parse(JSON.parse(source) as unknown);
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

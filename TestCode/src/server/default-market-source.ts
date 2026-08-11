import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  createPublicClient,
  defineChain,
  encodeAbiParameters,
  getAddress,
  hexToString,
  http,
  keccak256,
  parseAbi,
  parseAbiParameters,
  type Abi,
  type Address,
} from 'viem';
import { z } from 'zod';

import { defaultMockMarketProfile, defaultMockParameterKey, defaultMockParameterLabel } from '../config/default-mock-market.js';
import { loadDeploymentManifest } from '../config/deployment.js';
import { readEnvironmentConfiguration } from './environment-configuration.js';
import { readEnvironmentSettings } from './environment-settings.js';
import { environmentNames, type EnvironmentName } from '../../config/environments/catalog.js';

const listRequestSchema = z.object({ environment: z.enum(environmentNames) });
const copyRequestSchema = listRequestSchema.extend({
  indexToken: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Index Token 地址格式不正确。'),
});

interface Artifact { readonly abi: Abi; }
interface MarketProps {
  readonly marketIndex: bigint;
  readonly vault: Address;
  readonly indexToken: Address;
  readonly collateralToken: Address;
}

const erc20MetadataAbi = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
]);
const bytes32MetadataAbi = parseAbi([
  'function name() view returns (bytes32)',
  'function symbol() view returns (bytes32)',
]);

function bytes32Text(value: unknown): string {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) return '';
  try { return hexToString(value as `0x${string}`, { size: 32 }).replace(/\0+$/, ''); } catch { return ''; }
}

async function artifact(path: string): Promise<Artifact> {
  return JSON.parse(await readFile(resolve(process.cwd(), path), 'utf8')) as Artifact;
}

async function context(projectRoot: string, environment: EnvironmentName) {
  const settings = await readEnvironmentSettings(projectRoot, environment);
  if (!settings.rpcUrl) throw new Error(`${environment} 尚未配置 RPC，无法读取链上 Market。`);
  const configuration = await readEnvironmentConfiguration(projectRoot, environment);
  const manifestField = configuration.fields.find((field) => field.key === 'E2E_DEPLOYMENT_MANIFEST');
  if (!manifestField?.value) throw new Error('未配置 Deployment Manifest，无法定位 Reader 与 DataStore。');
  const manifest = await loadDeploymentManifest(resolve(projectRoot, manifestField.value));
  const [dataStoreArtifact, readerArtifact] = await Promise.all([
    artifact('../Github/fx100-contracts@release-v0.3.1/out/DataStore.sol/DataStore.json'),
    artifact('../Github/fx100-contracts@release-v0.3.1/out/Reader.sol/Reader.json'),
  ]);
  const chain = defineChain({
    id: settings.chainId ?? manifest.chainId,
    name: `${environment} market source`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [settings.rpcUrl] } },
  });
  return {
    manifest,
    dataStore: getAddress(manifest.contracts.dataStore),
    reader: getAddress(manifest.contracts.reader),
    dataStoreArtifact,
    readerArtifact,
    client: createPublicClient({ chain, transport: http(settings.rpcUrl, { timeout: 30_000 }) }),
  };
}

async function markets(projectRoot: string, environment: EnvironmentName): Promise<MarketProps[]> {
  const source = await context(projectRoot, environment);
  const marketListKey = keccak256(encodeAbiParameters(parseAbiParameters('string'), ['MARKET_LIST']));
  const marketCount = await source.client.readContract({
    address: source.dataStore,
    abi: source.dataStoreArtifact.abi,
    functionName: 'getUintCount',
    args: [marketListKey],
  }) as bigint;
  const result: MarketProps[] = [];
  for (let marketIndex = 1n; marketIndex <= marketCount; marketIndex += 1n) {
    const market = await source.client.readContract({
      address: source.reader,
      abi: source.readerArtifact.abi,
      functionName: 'getMarket',
      args: [source.dataStore, marketIndex],
    }) as MarketProps;
    if (market.marketIndex > 0n) result.push(market);
  }
  return result;
}

export class DefaultMarketSourceManager {
  constructor(private readonly projectRoot: string) {}

  async list(raw: unknown) {
    const { environment } = listRequestSchema.parse(raw);
    const result = await markets(this.projectRoot, environment);
    const source = await context(this.projectRoot, environment);
    return {
      environment,
      markets: await Promise.all(result.map(async (market) => {
        const metadata = async (address: Address) => {
          const [name, symbol] = await Promise.all([
            source.client.readContract({ address, abi: erc20MetadataAbi, functionName: 'name' })
              .catch(async () => bytes32Text(await source.client.readContract({ address, abi: bytes32MetadataAbi, functionName: 'name' }).catch(() => ''))),
            source.client.readContract({ address, abi: erc20MetadataAbi, functionName: 'symbol' })
              .catch(async () => bytes32Text(await source.client.readContract({ address, abi: bytes32MetadataAbi, functionName: 'symbol' }).catch(() => ''))),
          ]);
          return { name: typeof name === 'string' ? name : '', symbol: typeof symbol === 'string' ? symbol : '' };
        };
        const [indexToken, collateralToken] = await Promise.all([
          metadata(getAddress(market.indexToken)), metadata(getAddress(market.collateralToken)),
        ]);
        const configuredMarket = source.manifest.markets.find((item) =>
          getAddress(item.indexToken) === getAddress(market.indexToken));
        return {
          marketIndex: market.marketIndex.toString(),
          indexToken: getAddress(market.indexToken),
          collateralToken: getAddress(market.collateralToken),
          indexTokenName: indexToken.name || configuredMarket?.name || '',
          indexTokenSymbol: indexToken.symbol || configuredMarket?.symbol || '',
          collateralTokenName: collateralToken.name,
          collateralTokenSymbol: collateralToken.symbol || (configuredMarket ? 'USDC' : ''),
          vault: getAddress(market.vault),
        };
      })),
    };
  }

  async copy(raw: unknown) {
    const { environment, indexToken } = copyRequestSchema.parse(raw);
    const source = await context(this.projectRoot, environment);
    const token = getAddress(indexToken);
    const market = (await markets(this.projectRoot, environment)).find((item) => getAddress(item.indexToken) === token);
    if (!market) throw new Error(`当前环境未找到 Index Token ${token} 对应的已配置 Market。`);
    const parameterOverrides: Record<string, string> = {};
    for (const parameter of defaultMockMarketProfile.parameters) {
      const value = await source.client.readContract({
        address: source.dataStore,
        abi: source.dataStoreArtifact.abi,
        functionName: parameter.valueType === 'int' ? 'getInt' : 'getUint',
        args: [defaultMockParameterKey(parameter, market.marketIndex)],
      }) as bigint;
      parameterOverrides[defaultMockParameterLabel(parameter)] = value.toString();
    }
    return {
      environment,
      source: {
        marketIndex: Number(market.marketIndex),
        indexToken: token,
        collateralToken: getAddress(market.collateralToken),
        vault: getAddress(market.vault),
        parameterOverrides,
      },
    };
  }
}

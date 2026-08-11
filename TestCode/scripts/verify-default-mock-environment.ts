import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  createPublicClient,
  encodeAbiParameters,
  getAddress,
  http,
  keccak256,
  parseAbiParameters,
  type Abi,
  type Address,
  type Hex,
} from 'viem';

import {
  defaultMockMarketProfile,
  defaultMockParameterKey,
  defaultMockParameterLabel,
} from '../src/config/default-mock-market.js';
import { loadDeploymentManifest } from '../src/config/deployment.js';
import {
  isMockResourceEnvironment,
  resolveMockMarketBundle,
} from '../src/config/mock-resources.js';
import { loadRuntimeConfig } from '../src/config/runtime.js';
import {
  loadEnvironmentInitializationProfile,
  shouldConfigureParameter,
} from '../src/server/environment-initialization-profile.js';

interface FoundryArtifact {
  readonly abi: Abi;
}

interface MarketProps {
  readonly marketIndex: bigint;
  readonly vault: Address;
  readonly indexToken: Address;
  readonly collateralToken: Address;
}

async function artifact(path: string): Promise<FoundryArtifact> {
  return JSON.parse(await readFile(resolve(process.cwd(), path), 'utf8')) as FoundryArtifact;
}

function baseKey(name: string): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters('string'), [name]));
}

function dataStoreKey(name: string, parameters: string, values: readonly unknown[]): Hex {
  const encoded = encodeAbiParameters(parseAbiParameters(parameters), values);
  return keccak256(`${baseKey(name)}${encoded.slice(2)}` as Hex);
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const runtime = loadRuntimeConfig();
const bundleAlias = argument('--bundle') ?? 'default-mock';
if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(bundleAlias)) {
  throw new Error('--bundle 只允许小写字母、数字和连字符，长度 1–48。');
}
if (!isMockResourceEnvironment(runtime.environment)) {
  throw new Error(`${runtime.environment} 不支持 Mock Market Bundle。`);
}
const [
  manifest,
  resource,
  dataStoreArtifact,
  readerArtifact,
  chainlinkProviderArtifact,
  initializationProfile,
] = await Promise.all([
  loadDeploymentManifest(runtime.deploymentManifestPath),
  resolveMockMarketBundle(runtime.environment, bundleAlias),
  artifact('../Github/fx100-contracts@release-v0.3.1/out/DataStore.sol/DataStore.json'),
  artifact('../Github/fx100-contracts@release-v0.3.1/out/Reader.sol/Reader.json'),
  artifact('../Github/fx100-contracts@release-v0.3.1/out/ChainlinkPriceFeedProvider.sol/ChainlinkPriceFeedProvider.json'),
  loadEnvironmentInitializationProfile(process.cwd(), runtime.environment),
]);
const configuredParameters = defaultMockMarketProfile.parameters.filter((parameter) =>
  shouldConfigureParameter(initializationProfile, parameter));
const multiplierExponent = 60
  - initializationProfile.oracle.decimals
  - initializationProfile.token.decimals;
if (multiplierExponent < 0) throw new Error(`PriceFeed multiplier 指数非法：${multiplierExponent}`);
const expectedMultiplier = 10n ** BigInt(multiplierExponent);
if (resource.market?.status !== 'registered' || resource.market.marketIndex === undefined) {
  throw new Error(`${runtime.environment}/${bundleAlias} Market 尚未注册。`);
}
if (!resource.market.vault || !resource.collateralToken || !resource.collateralOracle
  || !resource.token || !resource.oracle) {
  throw new Error(`${runtime.environment}/${bundleAlias} 登记信息不完整。`);
}
if (resource.oracleMode?.index !== 'mock'
  || resource.oracleMode.collateral !== 'mock'
  || !resource.oracleMode.inlineKeeperReady) {
  throw new Error(`${runtime.environment}/${bundleAlias} 尚未登记为双 Mock Oracle。`);
}
if (resource.market.profileId !== defaultMockMarketProfile.id) {
  throw new Error(`Market Profile=${resource.market.profileId ?? 'missing'}，期望 ${defaultMockMarketProfile.id}。`);
}

const client = createPublicClient({
  transport: http(runtime.rpcUrl, { timeout: runtime.requestTimeoutMs }),
  pollingInterval: 500,
});
const dataStore = getAddress(manifest.contracts.dataStore);
const marketIndex = BigInt(resource.market.marketIndex);
const token = getAddress(resource.token.address);
const oracle = getAddress(resource.oracle.address);
const collateralToken = getAddress(resource.collateralToken.address);
const collateralOracle = getAddress(resource.collateralOracle.address);
const protocolOracle = getAddress(manifest.contracts.oracle);
const chainlinkProvider = getAddress(manifest.additionalContracts.chainlinkPriceFeedProvider ?? '');
const collateralMultiplierExponent = 60
  - initializationProfile.collateralOracle.decimals
  - resource.collateralToken.decimals;
if (collateralMultiplierExponent < 0) throw new Error(`USDC PriceFeed multiplier 指数非法：${collateralMultiplierExponent}`);
const expectedCollateralMultiplier = 10n ** BigInt(collateralMultiplierExponent);
const [
  tokenCode,
  oracleCode,
  collateralOracleCode,
  market,
  feedAddress,
  multiplier,
  heartbeat,
  provider,
  collateralFeedAddress,
  collateralMultiplier,
  collateralHeartbeat,
  collateralProvider,
  indexPrice,
  collateralPrice,
] = await Promise.all([
  client.getBytecode({ address: token }),
  client.getBytecode({ address: oracle }),
  client.getBytecode({ address: collateralOracle }),
  client.readContract({
    address: getAddress(manifest.contracts.reader),
    abi: readerArtifact.abi,
    functionName: 'getMarket',
    args: [dataStore, marketIndex],
  }) as Promise<MarketProps>,
  client.readContract({
    address: dataStore,
    abi: dataStoreArtifact.abi,
    functionName: 'getAddress',
    args: [dataStoreKey('PRICE_FEED', 'address', [token])],
  }) as Promise<Address>,
  client.readContract({
    address: dataStore,
    abi: dataStoreArtifact.abi,
    functionName: 'getUint',
    args: [dataStoreKey('PRICE_FEED_MULTIPLIER', 'address', [token])],
  }) as Promise<bigint>,
  client.readContract({
    address: dataStore,
    abi: dataStoreArtifact.abi,
    functionName: 'getUint',
    args: [dataStoreKey('PRICE_FEED_HEARTBEAT_DURATION', 'address', [token])],
  }) as Promise<bigint>,
  client.readContract({
    address: dataStore,
    abi: dataStoreArtifact.abi,
    functionName: 'getAddress',
    args: [dataStoreKey('ORACLE_PROVIDER_FOR_TOKEN', 'address,address', [protocolOracle, token])],
  }) as Promise<Address>,
  client.readContract({
    address: dataStore,
    abi: dataStoreArtifact.abi,
    functionName: 'getAddress',
    args: [dataStoreKey('PRICE_FEED', 'address', [collateralToken])],
  }) as Promise<Address>,
  client.readContract({
    address: dataStore,
    abi: dataStoreArtifact.abi,
    functionName: 'getUint',
    args: [dataStoreKey('PRICE_FEED_MULTIPLIER', 'address', [collateralToken])],
  }) as Promise<bigint>,
  client.readContract({
    address: dataStore,
    abi: dataStoreArtifact.abi,
    functionName: 'getUint',
    args: [dataStoreKey('PRICE_FEED_HEARTBEAT_DURATION', 'address', [collateralToken])],
  }) as Promise<bigint>,
  client.readContract({
    address: dataStore,
    abi: dataStoreArtifact.abi,
    functionName: 'getAddress',
    args: [dataStoreKey('ORACLE_PROVIDER_FOR_TOKEN', 'address,address', [protocolOracle, collateralToken])],
  }) as Promise<Address>,
  client.readContract({
    address: chainlinkProvider,
    abi: chainlinkProviderArtifact.abi,
    functionName: 'getOraclePrice',
    args: [token, '0x'],
  }) as Promise<{ min: bigint; max: bigint }>,
  client.readContract({
    address: chainlinkProvider,
    abi: chainlinkProviderArtifact.abi,
    functionName: 'getOraclePrice',
    args: [collateralToken, '0x'],
  }) as Promise<{ min: bigint; max: bigint }>,
]);

if (!tokenCode || tokenCode === '0x') throw new Error('Mock Token 没有 bytecode。');
if (!oracleCode || oracleCode === '0x') throw new Error('Mock Oracle 没有 bytecode。');
if (!collateralOracleCode || collateralOracleCode === '0x') throw new Error('Mock USDC Oracle 没有 bytecode。');
if (market.marketIndex !== marketIndex
  || getAddress(market.indexToken) !== token
  || getAddress(market.collateralToken) !== collateralToken
  || getAddress(market.vault) !== getAddress(resource.market.vault)) {
  throw new Error(`Reader Market 与 ${bundleAlias} 登记不一致。`);
}
if (getAddress(feedAddress) !== oracle) throw new Error('Mock Token PriceFeed 地址不一致。');
if (multiplier !== expectedMultiplier) throw new Error('Mock Token PriceFeed multiplier 不一致。');
if (heartbeat !== BigInt(initializationProfile.oracle.heartbeatDuration)) throw new Error('Mock Token heartbeat 不一致。');
if (getAddress(provider) !== chainlinkProvider) throw new Error('Mock Token Oracle provider 不一致。');
if (resource.oracle.minPrice === undefined || resource.oracle.maxPrice === undefined
  || indexPrice.min !== BigInt(resource.oracle.minPrice)
  || indexPrice.max !== BigInt(resource.oracle.maxPrice)
  || indexPrice.min >= indexPrice.max) {
  throw new Error(`Mock Token Oracle min/max 不一致：min=${indexPrice.min}，max=${indexPrice.max}。`);
}
if (getAddress(collateralFeedAddress) !== collateralOracle) throw new Error('USDC PriceFeed 地址不一致。');
if (collateralMultiplier !== expectedCollateralMultiplier) throw new Error('USDC PriceFeed multiplier 不一致。');
if (collateralHeartbeat !== BigInt(initializationProfile.collateralOracle.heartbeatDuration)) {
  throw new Error('USDC heartbeat 不一致。');
}
if (getAddress(collateralProvider) !== chainlinkProvider
  || (resource.collateralOracle.provider
    && getAddress(resource.collateralOracle.provider) !== chainlinkProvider)) {
  throw new Error('USDC Oracle provider 不一致。');
}
if (resource.collateralOracle.minPrice === undefined || resource.collateralOracle.maxPrice === undefined
  || collateralPrice.min !== BigInt(resource.collateralOracle.minPrice)
  || collateralPrice.max !== BigInt(resource.collateralOracle.maxPrice)
  || collateralPrice.min >= collateralPrice.max) {
  throw new Error(`USDC Oracle min/max 不一致：min=${collateralPrice.min}，max=${collateralPrice.max}。`);
}

for (const parameter of configuredParameters) {
  const label = defaultMockParameterLabel(parameter);
  const sourceKey = defaultMockParameterKey(parameter, BigInt(initializationProfile.referenceMarketIndex));
  const targetKey = defaultMockParameterKey(parameter, marketIndex);
  const functionName = parameter.valueType === 'int' ? 'getInt' : 'getUint';
  const targetValue = await client.readContract({ address: dataStore, abi: dataStoreArtifact.abi, functionName, args: [targetKey] }) as bigint;
  const override = initializationProfile.parameterOverrides[label];
  const expectedValue = override === undefined
    ? await client.readContract({ address: dataStore, abi: dataStoreArtifact.abi, functionName, args: [sourceKey] }) as bigint
    : BigInt(override);
  if (expectedValue !== targetValue) {
    throw new Error(`Market 参数不一致：${label}`);
  }
}

console.log(JSON.stringify({
  status: 'PASS',
  environment: runtime.environment,
  alias: bundleAlias,
  marketIndex: resource.market.marketIndex,
  profileId: resource.market.profileId,
  configuredParameterCount: configuredParameters.length,
  token,
  oracle,
  collateralToken,
  collateralOracle,
  oracleMode: resource.oracleMode,
  indexOracleConfiguration: 'verified',
  collateralOracleConfiguration: 'verified',
  marketParameters: 'verified-against-reference-market',
}, null, 2));

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  getAddress,
  http,
  keccak256,
  parseAbiParameters,
  toHex,
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
  isCompleteMockMarketBundle,
  isMockResourceEnvironment,
  loadMockResourceRegistry,
  saveMockMarketBundle,
  type SharedCollateralRecord,
} from '../src/config/mock-resources.js';
import { loadRuntimeConfig } from '../src/config/runtime.js';
import type { TestProject } from '../src/reporting/test-environments.js';
import {
  loadEnvironmentInitializationProfile,
  shouldConfigureParameter,
} from '../src/server/environment-initialization-profile.js';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

interface FoundryArtifact {
  readonly abi: Abi;
  readonly bytecode: { readonly object: Hex };
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

async function rpcCall(rpcUrl: string, method: string, params: readonly unknown[] = []): Promise<unknown> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json() as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message ?? 'unknown RPC error'}`);
  return body.result;
}

function baseKey(name: string): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters('string'), [name]));
}

function dataStoreKey(name: string, parameters: string, values: readonly unknown[]): Hex {
  const encoded = encodeAbiParameters(parseAbiParameters(parameters), values);
  return keccak256(`${baseKey(name)}${encoded.slice(2)}` as Hex);
}

async function sendAndWait(
  label: string,
  publicClient: ReturnType<typeof createPublicClient>,
  transaction: Promise<Hex>,
): Promise<Hex> {
  const hash = await transaction;
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  if (receipt.status !== 'success') throw new Error(`${label} 失败：${hash}`);
  return hash;
}

async function roleMember(
  publicClient: ReturnType<typeof createPublicClient>,
  dataStore: Address,
  dataStoreAbi: Abi,
  roleName: string,
): Promise<Address> {
  const role = baseKey(roleName);
  const count = await publicClient.readContract({
    address: dataStore,
    abi: dataStoreAbi,
    functionName: 'getRoleMemberCount',
    args: [role],
  }) as bigint;
  if (count === 0n) throw new Error(`DataStore 没有 ${roleName} 成员。`);
  return getAddress(await publicClient.readContract({
    address: dataStore,
    abi: dataStoreAbi,
    functionName: 'getRoleMember',
    args: [role, 0n],
  }) as Address);
}

async function roleMemberByHash(
  publicClient: ReturnType<typeof createPublicClient>,
  dataStore: Address,
  dataStoreAbi: Abi,
  role: Hex,
  label: string,
): Promise<Address> {
  const count = await publicClient.readContract({
    address: dataStore,
    abi: dataStoreAbi,
    functionName: 'getRoleMemberCount',
    args: [role],
  }) as bigint;
  if (count === 0n) throw new Error(`DataStore 没有 ${label} 成员。`);
  return getAddress(await publicClient.readContract({
    address: dataStore,
    abi: dataStoreAbi,
    functionName: 'getRoleMember',
    args: [role, 0n],
  }) as Address);
}

function priceFeedMultiplier(tokenDecimals: number, oracleDecimals: number): bigint {
  const exponent = 60 - tokenDecimals - oracleDecimals;
  if (exponent < 0) throw new Error(`PriceFeed multiplier 指数非法：${exponent}`);
  return 10n ** BigInt(exponent);
}

function internalPrice(rawPrice: bigint, multiplier: bigint): bigint {
  return rawPrice * multiplier / 10n ** 30n;
}

/** 将看板填写的 USD 十进制价格换成 Mock Chainlink feed 的原始整数。 */
function oraclePriceRaw(value: string, decimals: number): bigint {
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error(`Oracle 价格 ${value} 的小数位超过 Oracle decimals=${decimals}。`);
  return BigInt(`${whole}${fraction.padEnd(decimals, '0')}`);
}

async function main(): Promise<void> {
  const requestedProject = (argument('--project') ?? process.env.E2E_ENV ?? 'tx-fork') as TestProject;
  if (!isMockResourceEnvironment(requestedProject)) {
    throw new Error('默认 Mock 资源只允许初始化到 tx-fork / oracle-fork / time-fork。');
  }
  process.env.E2E_ENV = requestedProject;
  const bundleAlias = argument('--bundle') ?? 'default-mock';
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(bundleAlias)) {
    throw new Error('--bundle 只允许小写字母、数字和连字符，长度 1–48。');
  }

  const initializationProfile = await loadEnvironmentInitializationProfile(
    process.cwd(),
    requestedProject,
  );
  const configuredParameters = defaultMockMarketProfile.parameters.filter((parameter) =>
    shouldConfigureParameter(initializationProfile, parameter));

  const force = process.argv.includes('--force');
  const forceSharedCollateral = process.argv.includes('--force-shared-collateral');
  const current = (await loadMockResourceRegistry()).resources[requestedProject];
  const runtime = loadRuntimeConfig();
  if (!runtime.adminAccount || !runtime.adminRpcUrl) {
    throw new Error(`${requestedProject} 初始化需要 E2E_ADMIN_ACCOUNT 和 Admin RPC URL。`);
  }
  if (current.chainId === runtime.chainId && isCompleteMockMarketBundle(current, bundleAlias) && !force) {
    const existingMarketIndex = current.bundles?.[bundleAlias]?.market?.marketIndex
      ?? (bundleAlias === (current.defaultBundleAlias ?? 'default-mock') ? current.market?.marketIndex : undefined);
    console.log(`${requestedProject}/${bundleAlias} 完整环境已存在：marketIndex=${existingMarketIndex ?? 'unknown'}`);
    console.log('如需重建这个 Market Bundle，请增加 --force；共享 USDC Oracle 只有在增加 --force-shared-collateral 时才重建。');
    return;
  }

  const manifest = await loadDeploymentManifest(runtime.deploymentManifestPath);
  const contractRoot = '../Github/fx100-contracts@release-v0.3.1/out';
  const [tokenArtifact, oracleArtifact, marketFactoryArtifact, dataStoreArtifact, configArtifact, vaultArtifact, readerArtifact, chainlinkProviderArtifact] = await Promise.all([
    artifact(`${contractRoot}/MockAssetContracts.sol/MockToken.json`),
    artifact(`${contractRoot}/MockAssetContracts.sol/MockChainlinkOracle.json`),
    artifact(`${contractRoot}/MarketFactory.sol/MarketFactory.json`),
    artifact(`${contractRoot}/DataStore.sol/DataStore.json`),
    artifact(`${contractRoot}/Config.sol/Config.json`),
    artifact(`${contractRoot}/LPVault.sol/LPVault.json`),
    artifact(`${contractRoot}/Reader.sol/Reader.json`),
    artifact(`${contractRoot}/ChainlinkPriceFeedProvider.sol/ChainlinkPriceFeedProvider.json`),
  ]);

  const chain = defineChain({
    id: runtime.chainId,
    name: `${requestedProject} private fork`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [runtime.adminRpcUrl] } },
  });
  const publicClient = createPublicClient({
    chain,
    transport: http(runtime.adminRpcUrl, { timeout: runtime.requestTimeoutMs }),
    pollingInterval: 500,
  });
  const dataStore = getAddress(manifest.contracts.dataStore);
  const config = getAddress(manifest.contracts.config);
  const protocolOracle = getAddress(manifest.contracts.oracle);
  const reader = getAddress(manifest.contracts.reader);
  const marketFactory = getAddress(manifest.additionalContracts.marketFactory ?? '');
  const chainlinkProvider = getAddress(manifest.additionalContracts.chainlinkPriceFeedProvider ?? '');
  const vault = getAddress(manifest.additionalContracts.lpVault ?? '');
  const router = getAddress(manifest.additionalContracts.router ?? '');

  const [marketKeeper, configKeeper, controller, defaultAdmin] = await Promise.all([
    roleMember(publicClient, dataStore, dataStoreArtifact.abi, 'MARKET_KEEPER'),
    roleMember(publicClient, dataStore, dataStoreArtifact.abi, 'CONFIG_KEEPER'),
    roleMember(publicClient, dataStore, dataStoreArtifact.abi, 'CONTROLLER'),
    roleMemberByHash(publicClient, dataStore, dataStoreArtifact.abi, `0x${'0'.repeat(64)}`, 'DEFAULT_ADMIN_ROLE'),
  ]);
  const deployer = getAddress(runtime.adminAccount);
  const configuredAccounts = [runtime.testAccount, runtime.keeperAccount, runtime.adminAccount]
    .filter((value): value is Address => Boolean(value))
    .map(getAddress);
  const nativeBalanceWei = oraclePriceRaw(initializationProfile.funding.nativeBalanceEth, 18);
  if (initializationProfile.operations.fundNativeAccounts) {
    for (const account of new Set([
      deployer, marketKeeper, configKeeper, controller, defaultAdmin, ...configuredAccounts,
    ])) {
      await rpcCall(runtime.adminRpcUrl, 'tenderly_setBalance', [
        [account],
        toHex(nativeBalanceWei),
      ]);
    }
  }

  const wallet = (account: Address) => createWalletClient({
    account,
    chain,
    transport: http(runtime.adminRpcUrl!, { timeout: runtime.requestTimeoutMs }),
  });
  const deployerWallet = wallet(deployer);
  const marketWallet = wallet(marketKeeper);
  const configWallet = wallet(configKeeper);
  const controllerWallet = wallet(controller);
  const defaultAdminWallet = wallet(defaultAdmin);
  const snapshot = await rpcCall(runtime.adminRpcUrl, 'evm_snapshot');
  if (typeof snapshot !== 'string') throw new Error('初始化前 evm_snapshot 未返回快照 ID。');

  try {
    const tokenTxHash = await sendAndWait('Mock Token 部署', publicClient, deployerWallet.deployContract({
      abi: tokenArtifact.abi,
      bytecode: tokenArtifact.bytecode.object,
      args: [
        initializationProfile.token.name,
        initializationProfile.token.symbol,
        initializationProfile.token.decimals,
      ],
    }));
    const tokenReceipt = await publicClient.getTransactionReceipt({ hash: tokenTxHash });
    if (!tokenReceipt.contractAddress) throw new Error(`Mock Token 部署未返回地址：${tokenTxHash}`);
    const token = getAddress(tokenReceipt.contractAddress);

    const oracleTxHash = await sendAndWait('Mock Oracle 部署', publicClient, deployerWallet.deployContract({
      abi: oracleArtifact.abi,
      bytecode: oracleArtifact.bytecode.object,
      args: [initializationProfile.oracle.description, initializationProfile.oracle.decimals],
    }));
    const oracleReceipt = await publicClient.getTransactionReceipt({ hash: oracleTxHash });
    if (!oracleReceipt.contractAddress) throw new Error(`Mock Oracle 部署未返回地址：${oracleTxHash}`);
    const oracle = getAddress(oracleReceipt.contractAddress);
    const minRawPrice = oraclePriceRaw(initializationProfile.oracle.minPrice, initializationProfile.oracle.decimals);
    const maxRawPrice = oraclePriceRaw(initializationProfile.oracle.maxPrice, initializationProfile.oracle.decimals);
    if (maxRawPrice <= minRawPrice) throw new Error('default-mock Oracle 价格区间无效：Max Price 必须大于 Min Price。');
    const latestBlock = await publicClient.getBlock();
    const setPriceTxHash = await sendAndWait('Mock Oracle 初始价格设置', publicClient, deployerWallet.writeContract({
      address: oracle,
      abi: oracleArtifact.abi,
      functionName: 'setMockPrice',
      args: [minRawPrice, latestBlock.timestamp],
    }));
    const indexPriceMultiplier = priceFeedMultiplier(
      initializationProfile.token.decimals,
      initializationProfile.oracle.decimals,
    );
    const initialMinPrice = internalPrice(minRawPrice, indexPriceMultiplier);
    const initialMaxPrice = internalPrice(maxRawPrice, indexPriceMultiplier);

    const marketListKey = baseKey('MARKET_LIST');
    const marketCountBefore = await publicClient.readContract({
      address: dataStore,
      abi: dataStoreArtifact.abi,
      functionName: 'getUintCount',
      args: [marketListKey],
    }) as bigint;
    const marketCreationTxHash = await sendAndWait('default-mock Market 创建', publicClient, marketWallet.writeContract({
      address: marketFactory,
      abi: marketFactoryArtifact.abi,
      functionName: 'createMarket',
      args: [token],
    }));
    const marketCountAfter = await publicClient.readContract({
      address: dataStore,
      abi: dataStoreArtifact.abi,
      functionName: 'getUintCount',
      args: [marketListKey],
    }) as bigint;
    if (marketCountAfter !== marketCountBefore + 1n) {
      throw new Error(`Market 数量未递增：before=${marketCountBefore}，after=${marketCountAfter}`);
    }
    const marketIndex = marketCountAfter;
    const collateralToken = getAddress(await publicClient.readContract({
      address: vault,
      abi: vaultArtifact.abi,
      functionName: 'asset',
    }) as Address);
    const collateralTokenDecimals = Number(await publicClient.readContract({
      address: collateralToken,
      abi: tokenArtifact.abi,
      functionName: 'decimals',
    }) as bigint);
    const traderCollateralAmount = oraclePriceRaw(
      initializationProfile.funding.traderCollateral,
      collateralTokenDecimals,
    );
    const minimumLpCollateralAmount = oraclePriceRaw(
      initializationProfile.funding.minimumLpCollateral,
      collateralTokenDecimals,
    );

    const existingShared = current.chainId === runtime.chainId ? current.sharedCollateral : undefined;
    const existingSharedToken = existingShared?.token;
    const existingSharedOracle = existingShared?.oracle;
    let reuseSharedCollateral = !forceSharedCollateral
      && existingShared?.status === 'ready'
      && existingShared.inlineKeeperReady
      && Boolean(existingSharedToken)
      && Boolean(existingSharedOracle?.minPrice)
      && Boolean(existingSharedOracle?.maxPrice)
      && getAddress(existingSharedToken!.address) === collateralToken;
    if (reuseSharedCollateral) {
      const candidateOracle = getAddress(existingSharedOracle!.address);
      const [candidateCode, configuredFeed, configuredProvider] = await Promise.all([
        publicClient.getBytecode({ address: candidateOracle }),
        publicClient.readContract({
          address: dataStore,
          abi: dataStoreArtifact.abi,
          functionName: 'getAddress',
          args: [dataStoreKey('PRICE_FEED', 'address', [collateralToken])],
        }) as Promise<Address>,
        publicClient.readContract({
          address: dataStore,
          abi: dataStoreArtifact.abi,
          functionName: 'getAddress',
          args: [dataStoreKey('ORACLE_PROVIDER_FOR_TOKEN', 'address,address', [protocolOracle, collateralToken])],
        }) as Promise<Address>,
      ]);
      reuseSharedCollateral = Boolean(candidateCode && candidateCode !== '0x')
        && getAddress(configuredFeed) === candidateOracle
        && getAddress(configuredProvider) === chainlinkProvider;
    }

    let collateralOracle: Address;
    let collateralMinRawPrice: bigint;
    let collateralMinPrice: bigint;
    let collateralMaxPrice: bigint;
    let collateralSetPriceTxHash: Hex | undefined;
    let collateralOracleRecord: NonNullable<SharedCollateralRecord['oracle']>;
    const collateralOracleConfigTxHashes: Hex[] = [];
    if (reuseSharedCollateral) {
      collateralOracle = getAddress(existingSharedOracle!.address);
      collateralMinRawPrice = BigInt(existingSharedOracle!.initialPrice);
      collateralMinPrice = BigInt(existingSharedOracle!.minPrice!);
      collateralMaxPrice = BigInt(existingSharedOracle!.maxPrice!);
      collateralOracleRecord = existingSharedOracle!;
      console.log(`复用 ${requestedProject} 共享 USDC Mock Oracle：${collateralOracle}`);
    } else {
      const collateralOracleTxHash = await sendAndWait('Mock USDC Oracle 部署', publicClient, deployerWallet.deployContract({
        abi: oracleArtifact.abi,
        bytecode: oracleArtifact.bytecode.object,
        args: [initializationProfile.collateralOracle.description, initializationProfile.collateralOracle.decimals],
      }));
      const collateralOracleReceipt = await publicClient.getTransactionReceipt({ hash: collateralOracleTxHash });
      if (!collateralOracleReceipt.contractAddress) throw new Error('Mock USDC Oracle 部署未返回地址。');
      collateralOracle = getAddress(collateralOracleReceipt.contractAddress);
      collateralMinRawPrice = oraclePriceRaw(
        initializationProfile.collateralOracle.minPrice,
        initializationProfile.collateralOracle.decimals,
      );
      const collateralMaxRawPrice = oraclePriceRaw(
        initializationProfile.collateralOracle.maxPrice,
        initializationProfile.collateralOracle.decimals,
      );
      if (collateralMaxRawPrice <= collateralMinRawPrice) throw new Error('USDC Oracle Max Price 必须大于 Min Price。');
      collateralSetPriceTxHash = await sendAndWait('Mock USDC Oracle 初始价格设置', publicClient, deployerWallet.writeContract({
        address: collateralOracle,
        abi: oracleArtifact.abi,
        functionName: 'setMockPrice',
        args: [collateralMinRawPrice, latestBlock.timestamp],
      }));
      const collateralPriceMultiplier = priceFeedMultiplier(
        collateralTokenDecimals,
        initializationProfile.collateralOracle.decimals,
      );
      collateralMinPrice = internalPrice(collateralMinRawPrice, collateralPriceMultiplier);
      collateralMaxPrice = internalPrice(collateralMaxRawPrice, collateralPriceMultiplier);
      for (const [label, setter, key, value] of [
        ['PriceFeed', 'setAddress', dataStoreKey('PRICE_FEED', 'address', [collateralToken]), collateralOracle],
        ['Multiplier', 'setUint', dataStoreKey('PRICE_FEED_MULTIPLIER', 'address', [collateralToken]), collateralPriceMultiplier],
        ['Heartbeat', 'setUint', dataStoreKey('PRICE_FEED_HEARTBEAT_DURATION', 'address', [collateralToken]), BigInt(initializationProfile.collateralOracle.heartbeatDuration)],
        ['StablePrice', 'setUint', dataStoreKey('STABLE_PRICE', 'address', [collateralToken]), collateralMaxPrice],
        ['Provider', 'setAddress', dataStoreKey('ORACLE_PROVIDER_FOR_TOKEN', 'address,address', [protocolOracle, collateralToken]), chainlinkProvider],
      ] as const) {
        collateralOracleConfigTxHashes.push(await sendAndWait(`Mock USDC Oracle ${label} 配置`, publicClient, controllerWallet.writeContract({
          address: dataStore,
          abi: dataStoreArtifact.abi,
          functionName: setter,
          args: [key, value],
        })));
      }
      collateralOracleRecord = {
        address: collateralOracle,
        deploymentTxHash: collateralOracleTxHash,
        deploymentBlock: Number(collateralOracleReceipt.blockNumber),
        origin: 'environment-init',
        description: initializationProfile.collateralOracle.description,
        decimals: initializationProfile.collateralOracle.decimals,
        initialPrice: collateralMinRawPrice.toString(),
        minPrice: collateralMinPrice.toString(),
        maxPrice: collateralMaxPrice.toString(),
        provider: chainlinkProvider,
      };
    }

    const oracleConfigTxHash = await sendAndWait('Mock Token PriceFeed 配置', publicClient, configWallet.writeContract({
      address: config,
      abi: configArtifact.abi,
      functionName: 'initOracleConfig',
      args: [{
        token,
        priceFeed: {
          feedAddress: oracle,
          multiplier: indexPriceMultiplier,
          heartbeatDuration: BigInt(initializationProfile.oracle.heartbeatDuration),
          // Chainlink provider 将 feed 价与 stablePrice 排序为 min/max；这里让 Mock Oracle
          // 的初始 min 与配置 max 有明确差值，覆盖不利成交价、Spread 等区间逻辑。
          stablePrice: initialMaxPrice,
        },
        dataStream: {
          feedId: `0x${'0'.repeat(64)}`,
          multiplier: 0n,
          spreadReductionFactor: 0n,
        },
        edge: {
          feedId: `0x${'0'.repeat(64)}`,
          tokenDecimals: 0n,
        },
      }],
    }));
    const providerConfigTxHash = await sendAndWait('Mock Token Oracle provider 配置', publicClient, configWallet.writeContract({
      address: config,
      abi: configArtifact.abi,
      functionName: 'initOracleProviderForToken',
      args: [protocolOracle, token, chainlinkProvider],
    }));

    const parameterTxHashes: Hex[] = [];
    for (const parameter of configuredParameters) {
      const label = defaultMockParameterLabel(parameter);
      const sourceKey = defaultMockParameterKey(parameter, BigInt(initializationProfile.referenceMarketIndex));
      const targetKey = defaultMockParameterKey(parameter, marketIndex);
      const functionName = parameter.valueType === 'int' ? 'getInt' : 'getUint';
      const setter = parameter.valueType === 'int' ? 'setInt' : 'setUint';
      const override = initializationProfile.parameterOverrides[label];
      const value = override === undefined
        ? await publicClient.readContract({
          address: dataStore,
          abi: dataStoreArtifact.abi,
          functionName,
          args: [sourceKey],
        }) as bigint
        : BigInt(override);
      const hash = await sendAndWait(
        `Market 参数 ${label}`,
        publicClient,
        controllerWallet.writeContract({
          address: dataStore,
          abi: dataStoreArtifact.abi,
          functionName: setter,
          args: [targetKey, value],
        }),
      );
      parameterTxHashes.push(hash);
    }

    const roleTxHashes: Hex[] = [];
    if (initializationProfile.operations.grantRoles) {
      const grants = [
        ...(runtime.keeperAccount
          ? (manifest.initialization?.keeperRoles ?? ['ORDER_KEEPER']).map((role) => ({
            role,
            account: getAddress(runtime.keeperAccount!),
          }))
          : []),
        ...(runtime.adminAccount
          ? ['CONTROLLER', 'CONFIG_KEEPER', 'MARKET_KEEPER'].map((role) => ({
            role,
            account: getAddress(runtime.adminAccount!),
          }))
          : []),
      ];
      for (const grant of grants) {
        const role = baseKey(grant.role);
        const alreadyGranted = await publicClient.readContract({
          address: dataStore,
          abi: dataStoreArtifact.abi,
          functionName: 'hasRole',
          args: [role, grant.account],
        }) as boolean;
        if (alreadyGranted) continue;
        roleTxHashes.push(await sendAndWait(
          `角色授权 ${grant.role}`,
          publicClient,
          defaultAdminWallet.writeContract({
            address: dataStore,
            abi: dataStoreArtifact.abi,
            functionName: 'grantRole',
            args: [role, grant.account],
          }),
        ));
      }
    }

    const erc20Abi = tokenArtifact.abi;
    let traderAllowanceTxHash: Hex | undefined;
    if (runtime.testAccount && initializationProfile.operations.fundTraderCollateral) {
      await rpcCall(runtime.adminRpcUrl, 'tenderly_setErc20Balance', [
        collateralToken,
        getAddress(runtime.testAccount),
        toHex(traderCollateralAmount),
      ]);
    }
    if (runtime.testAccount && initializationProfile.operations.configureRouterAllowance) {
      const trader = getAddress(runtime.testAccount);
      const allowance = initializationProfile.funding.routerAllowance === 'max'
        ? (2n ** 256n) - 1n
        : traderCollateralAmount;
      traderAllowanceTxHash = await sendAndWait(
        'Trader Router allowance',
        publicClient,
        wallet(trader).writeContract({
          address: collateralToken,
          abi: erc20Abi,
          functionName: 'approve',
          args: [router, allowance],
        }),
      );
    }

    let lpLiquidityTxHash: Hex | undefined;
    if (initializationProfile.operations.seedLpLiquidity) {
      const minimum = minimumLpCollateralAmount;
      const currentAssets = await publicClient.readContract({
        address: vault,
        abi: vaultArtifact.abi,
        functionName: 'totalAssets',
      }) as bigint;
      if (currentAssets < minimum) {
        const amount = minimum - currentAssets;
        await rpcCall(runtime.adminRpcUrl, 'tenderly_setErc20Balance', [
          collateralToken,
          deployer,
          toHex(amount),
        ]);
        await sendAndWait('LPVault collateral allowance', publicClient, deployerWallet.writeContract({
          address: collateralToken,
          abi: erc20Abi,
          functionName: 'approve',
          args: [vault, amount],
        }));
        lpLiquidityTxHash = await sendAndWait('LPVault 最低流动性', publicClient, deployerWallet.writeContract({
          address: vault,
          abi: vaultArtifact.abi,
          functionName: 'deposit',
          args: [amount, deployer],
        }));
      }
    }

    const market = await publicClient.readContract({
      address: reader,
      abi: readerArtifact.abi,
      functionName: 'getMarket',
      args: [dataStore, marketIndex],
    }) as MarketProps;
    if (market.marketIndex !== marketIndex
      || getAddress(market.indexToken) !== token
      || getAddress(market.collateralToken) !== collateralToken
      || getAddress(market.vault) !== vault) {
      throw new Error('Reader 返回的 default-mock Market 与初始化输入不一致。');
    }

    const [feedAddress, multiplier, heartbeat, provider, oraclePrice] = await Promise.all([
      publicClient.readContract({
        address: dataStore,
        abi: dataStoreArtifact.abi,
        functionName: 'getAddress',
        args: [dataStoreKey('PRICE_FEED', 'address', [token])],
      }) as Promise<Address>,
      publicClient.readContract({
        address: dataStore,
        abi: dataStoreArtifact.abi,
        functionName: 'getUint',
        args: [dataStoreKey('PRICE_FEED_MULTIPLIER', 'address', [token])],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: dataStore,
        abi: dataStoreArtifact.abi,
        functionName: 'getUint',
        args: [dataStoreKey('PRICE_FEED_HEARTBEAT_DURATION', 'address', [token])],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: dataStore,
        abi: dataStoreArtifact.abi,
        functionName: 'getAddress',
        args: [dataStoreKey('ORACLE_PROVIDER_FOR_TOKEN', 'address,address', [protocolOracle, token])],
      }) as Promise<Address>,
      publicClient.readContract({
        address: chainlinkProvider,
        abi: chainlinkProviderArtifact.abi,
        functionName: 'getOraclePrice',
        args: [token, '0x'],
      }) as Promise<{ min: bigint; max: bigint }>,
    ]);
    if (getAddress(feedAddress) !== oracle
      || multiplier !== priceFeedMultiplier(
        initializationProfile.token.decimals,
        initializationProfile.oracle.decimals,
      )
      || heartbeat !== BigInt(initializationProfile.oracle.heartbeatDuration)
      || getAddress(provider) !== chainlinkProvider) {
      throw new Error('default-mock Token Oracle 配置回读不一致。');
    }
    if (oraclePrice.min !== initialMinPrice || oraclePrice.max !== initialMaxPrice || oraclePrice.min >= oraclePrice.max) {
      throw new Error(`default-mock Oracle 区间回读不一致：min=${oraclePrice.min}，max=${oraclePrice.max}`);
    }
    const [collateralProvider, collateralOraclePrice] = await Promise.all([
      publicClient.readContract({
        address: dataStore,
        abi: dataStoreArtifact.abi,
        functionName: 'getAddress',
        args: [dataStoreKey('ORACLE_PROVIDER_FOR_TOKEN', 'address,address', [protocolOracle, collateralToken])],
      }) as Promise<Address>,
      publicClient.readContract({
        address: chainlinkProvider,
        abi: chainlinkProviderArtifact.abi,
        functionName: 'getOraclePrice',
        args: [collateralToken, '0x'],
      }) as Promise<{ min: bigint; max: bigint }>,
    ]);
    if (getAddress(collateralProvider) !== chainlinkProvider
      || collateralOraclePrice.min !== collateralMinPrice
      || collateralOraclePrice.max !== collateralMaxPrice
      || collateralOraclePrice.min >= collateralOraclePrice.max) {
      throw new Error(`Mock USDC Oracle 回读不一致：provider=${collateralProvider}，min=${collateralOraclePrice.min}，max=${collateralOraclePrice.max}`);
    }

    for (const parameter of configuredParameters) {
      const label = defaultMockParameterLabel(parameter);
      const sourceKey = defaultMockParameterKey(parameter, BigInt(initializationProfile.referenceMarketIndex));
      const targetKey = defaultMockParameterKey(parameter, marketIndex);
      const functionName = parameter.valueType === 'int' ? 'getInt' : 'getUint';
      const targetValue = await publicClient.readContract({
        address: dataStore,
        abi: dataStoreArtifact.abi,
        functionName,
        args: [targetKey],
      }) as bigint;
      const override = initializationProfile.parameterOverrides[label];
      const expectedValue = override === undefined
        ? await publicClient.readContract({
          address: dataStore,
          abi: dataStoreArtifact.abi,
          functionName,
          args: [sourceKey],
        }) as bigint
        : BigInt(override);
      if (expectedValue !== targetValue) {
        throw new Error(`Market 参数回读不一致：${label}`);
      }
    }

    if (initializationProfile.operations.validateAfterInitialization && runtime.testAccount) {
      const trader = getAddress(runtime.testAccount);
      if (initializationProfile.operations.fundTraderCollateral) {
        const balance = await publicClient.readContract({
          address: collateralToken,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [trader],
        }) as bigint;
        if (balance < traderCollateralAmount) {
          throw new Error('Trader collateral funding 回读不足。');
        }
      }
      if (initializationProfile.operations.configureRouterAllowance) {
        const allowance = await publicClient.readContract({
          address: collateralToken,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [trader, router],
        }) as bigint;
        const minimumAllowance = initializationProfile.funding.routerAllowance === 'max'
          ? (2n ** 256n) - 1n
          : traderCollateralAmount;
        if (allowance < minimumAllowance) throw new Error('Trader Router allowance 回读不足。');
      }
    }

    const [collateralName, collateralSymbol, collateralDecimals] = await Promise.all([
      publicClient.readContract({ address: collateralToken, abi: tokenArtifact.abi, functionName: 'name' }) as Promise<string>,
      publicClient.readContract({ address: collateralToken, abi: tokenArtifact.abi, functionName: 'symbol' }) as Promise<string>,
      publicClient.readContract({ address: collateralToken, abi: tokenArtifact.abi, functionName: 'decimals' }) as Promise<number>,
    ]);
    await saveMockMarketBundle(requestedProject, bundleAlias, {
      alias: 'default-mock',
      status: 'ready',
      chainId: runtime.chainId,
      ...(runtime.forkDisplayName ? { forkDisplayName: runtime.forkDisplayName } : {}),
      initializedAt: new Date().toISOString(),
      oracleMode: { index: 'mock', collateral: 'mock', inlineKeeperReady: true },
      token: {
        address: token,
        deploymentTxHash: tokenTxHash,
        deploymentBlock: Number(tokenReceipt.blockNumber),
        origin: 'environment-init',
        ...initializationProfile.token,
      },
      oracle: {
        address: oracle,
        deploymentTxHash: oracleTxHash,
        deploymentBlock: Number(oracleReceipt.blockNumber),
        origin: 'environment-init',
        description: initializationProfile.oracle.description,
        decimals: initializationProfile.oracle.decimals,
        initialPrice: minRawPrice.toString(),
        minPrice: initialMinPrice.toString(),
        maxPrice: initialMaxPrice.toString(),
      },
      collateralToken: {
        address: collateralToken,
        origin: 'inherited-base-deployment',
        name: collateralName,
        symbol: collateralSymbol,
        decimals: Number(collateralDecimals),
      },
      collateralOracle: collateralOracleRecord,
      sharedCollateral: {
        status: 'ready',
        initializedAt: reuseSharedCollateral
          ? existingShared?.initializedAt
          : new Date().toISOString(),
        token: {
          address: collateralToken,
          origin: 'inherited-base-deployment',
          name: collateralName,
          symbol: collateralSymbol,
          decimals: Number(collateralDecimals),
        },
        oracle: collateralOracleRecord,
        configurationTxHashes: reuseSharedCollateral
          ? existingShared?.configurationTxHashes ?? []
          : [
              ...(collateralSetPriceTxHash ? [collateralSetPriceTxHash] : []),
              ...collateralOracleConfigTxHashes,
            ],
        inlineKeeperReady: true,
        notes: reuseSharedCollateral
          ? `复用 ${requestedProject} 已回读验证的共享 USDC Mock Oracle。`
          : `在 ${requestedProject} 新部署并配置共享 USDC Mock Oracle；影响本 Fork 全部 USDC Market。`,
      },
      market: {
        status: 'registered',
        marketIndex: Number(marketIndex),
        vault,
        creationTxHash: marketCreationTxHash,
        profileId: defaultMockMarketProfile.id,
        bundleId: `${requestedProject}/${bundleAlias}/market-${marketIndex}`,
        referenceMarketIndex: initializationProfile.referenceMarketIndex,
        configuredParameterCount: configuredParameters.length,
        configurationTxHashes: [
          setPriceTxHash,
          oracleConfigTxHash,
          providerConfigTxHash,
          ...(collateralSetPriceTxHash ? [collateralSetPriceTxHash] : []),
          ...collateralOracleConfigTxHashes,
          ...parameterTxHashes,
          ...roleTxHashes,
          ...(traderAllowanceTxHash ? [traderAllowanceTxHash] : []),
          ...(lpLiquidityTxHash ? [lpLiquidityTxHash] : []),
        ],
        notes: `链上创建的 Synthetic Market；${configuredParameters.length} 项参数来自 marketIndex=${initializationProfile.referenceMarketIndex} 或看板覆盖值，并已回读验证。`,
      },
      notes: `由 env:init:mock 初始化 ${bundleAlias}；Index Oracle 初始价格交易 ${setPriceTxHash}；共享 USDC Oracle ${reuseSharedCollateral ? '复用' : '新部署'}。`,
    });

    console.log(`${requestedProject}/${bundleAlias} 完整环境初始化完成`);
    console.log(`Mock Token: ${token}`);
    console.log(`Mock Oracle: ${oracle}`);
    console.log(`Mock Market: marketIndex=${marketIndex}`);
    console.log(`Market Profile: ${defaultMockMarketProfile.id} (${configuredParameters.length} parameters)`);
    console.log('登记表：config/mock-resources.json');
  } catch (error) {
    await rpcCall(runtime.adminRpcUrl, 'evm_revert', [snapshot]);
    throw error;
  }
}

await main();

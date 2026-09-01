import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  getAddress,
  http,
  keccak256,
  parseAbi,
  parseAbiParameters,
  toHex,
  type Address,
  type Hex,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import { environments, type EnvironmentName } from '../config/environments/catalog.js';
import { deploymentManifestSchema, type DeploymentManifest } from '../src/config/deployment.js';
import { readEnvironmentSettings } from '../src/server/environment-settings.js';

/**
 * v0.3.2 部署执行器：把 fx100-contracts 的 Ignition 全新部署 + configure 三脚本
 * 一键执行到指定 Tenderly fork（Admin RPC），随后自动登记 TestCode/工作区基线。
 *
 *   npm run deploy:contracts -- --env tx-fork --branch release/v0.3.2 \
 *     [--repo <合约仓路径>] [--dry-run] [--skip-compile] [--skip-install] [--deployment-id <id>]
 *
 * 流程（对应 Docs/contract-releases/v0.3.2/02-部署与升级手册.md）：
 *   1. 校验合约仓分支/HEAD（只读 git 状态）
 *   2. 读取 TestCode .env.local 的该环境 Admin RPC（readEnvironmentSettings；不打印 URL）
 *   3. 生成一次性 deployer（viem generatePrivateKey，内存态，用后即弃）+ tenderly_setBalance
 *   4. 合约仓 npm ci（node_modules 缺失时）→ npx hardhat compile
 *   5. 写 untracked 的 hardhat.fork.config.ts + Ignition 参数文件 → Ignition 部署 Fx100Core（§4 八模块）
 *   6. 部署 WBTC/ETH Mock Chainlink Oracle 并 setMockPrice → 生成 oracle.fork.json
 *   7. configure 三脚本（General/Oracle/Market×2，参数用仓库 scripts/parameters 预设）
 *   8. 角色授权（ORDER_KEEPER→keeper；CONTROLLER/CONFIG_KEEPER/MARKET_KEEPER→admin）
 *   9. 读回校验（02 §18.1 + 06 §5 A-2：COLLATERAL_TOKEN=USDC=vault.asset()；MIN/MAX_DYNAMIC_SPREAD 读回=写入）
 *  10. 自动登记：deployment manifest + .env.local E2E_DEPLOYMENT_MANIFEST + CURRENT.json + 参数快照(config-dump)
 *
 * 纪律：全程不打印任何 RPC URL / 私钥；私钥只经环境变量传给 hardhat 子进程；
 *       hardhat.fork.config.ts / fx100.fork.*.json / oracle.fork.*.json 保留在合约仓但绝不 commit。
 */

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const WETH_BASE = '0x4200000000000000000000000000000000000006';

interface CliOptions {
  readonly environment: EnvironmentName;
  readonly branch: string;
  readonly repoPath: string;
  readonly dryRun: boolean;
  readonly skipCompile: boolean;
  readonly skipInstall: boolean;
  readonly deploymentId: string;
  readonly version: string;
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function log(message: string): void {
  console.log(`[deploy] ${message}`);
}

function banner(title: string): void {
  console.log(`\n[deploy] ======== ${title} ========`);
}

function fail(message: string): never {
  throw new Error(message);
}

/* ---------------------------------------------------------------- 子进程 */

async function runCommand(
  label: string,
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env?: Record<string, string | undefined>; readonly stdinText?: string },
): Promise<void> {
  log(`$ ${label}`);
  const startedAt = Date.now();
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: [options.stdinText === undefined ? 'ignore' : 'pipe', 'inherit', 'inherit'],
    });
    if (options.stdinText !== undefined && child.stdin) {
      child.stdin.write(options.stdinText);
      child.stdin.end();
    }
    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${label} 退出码 ${code ?? 'null'}`));
    });
  });
  log(`✓ ${label}（${Math.round((Date.now() - startedAt) / 1000)}s）`);
}

/* ---------------------------------------------------------------- RPC / key 工具 */

async function rpcCall(rpcUrl: string, method: string, params: readonly unknown[] = []): Promise<unknown> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(60_000),
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

/** 十进制字符串 → 定点整数（scaleDigits 位小数），支持负号；等价合约仓 parseDecimalToScaled。 */
function parseDecimalScaled(value: string, scaleDigits: number): bigint {
  const normalized = value.trim();
  const negative = normalized.startsWith('-');
  const digits = negative ? normalized.slice(1) : normalized;
  const [wholePart, fractionalPart = ''] = digits.split('.');
  if (fractionalPart.length > scaleDigits) throw new Error(`小数位超限：${value}（最多 ${scaleDigits} 位）`);
  const scaled = BigInt(wholePart || '0') * 10n ** BigInt(scaleDigits) + BigInt(fractionalPart.padEnd(scaleDigits, '0') || '0');
  return negative ? -scaled : scaled;
}

/* ---------------------------------------------------------------- ABI（最小集） */

const dataStoreAbi = parseAbi([
  'function getAddress(bytes32 key) view returns (address)',
  'function getUint(bytes32 key) view returns (uint256)',
  'function getInt(bytes32 key) view returns (int256)',
  'function getUintCount(bytes32 setKey) view returns (uint256)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function grantRole(bytes32 role, address account)',
  'function getRoleMemberCount(bytes32 role) view returns (uint256)',
  'function getRoleMember(bytes32 role, uint256 index) view returns (address)',
]);

const readerAbi = parseAbi([
  'function getMarket(address dataStore, uint256 marketIndex) view returns ((uint256 marketIndex, address vault, address indexToken, address collateralToken))',
]);

const erc20Abi = parseAbi([
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
]);

const vaultAbi = parseAbi(['function asset() view returns (address)']);

const mockOracleAbi = parseAbi([
  'function setMockPrice(uint256 price, uint256 timestamp_)',
  'function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)',
]);

const providerAbi = parseAbi([
  // OracleUtils.ValidatedPrice（src/oracle/OracleUtils.sol L20-26）
  'function getOraclePrice(address token, bytes data) view returns ((address token, uint256 min, uint256 max, uint256 timestamp, address provider))',
]);

/* ---------------------------------------------------------------- 部署产物 */

type DeployedAddresses = Record<string, string>;

function addressOf(addresses: DeployedAddresses, id: string): Address {
  const direct = addresses[`Fx100Core#${id}`];
  if (direct) return getAddress(direct);
  const suffix = `#${id}`;
  const hit = Object.entries(addresses).find(([key]) => key.endsWith(suffix));
  if (!hit) fail(`deployed_addresses.json 缺少 *#${id}`);
  return getAddress(hit[1]);
}

/* ---------------------------------------------------------------- env 文件更新 */

async function updateEnvLocal(projectRoot: string, entries: Readonly<Record<string, string>>): Promise<void> {
  const path = join(projectRoot, '.env.local');
  let source = '';
  try {
    source = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  for (const [key, value] of Object.entries(entries)) {
    const line = `${key}=${JSON.stringify(value)}`;
    const expression = new RegExp(`^${key}=.*$`, 'm');
    source = expression.test(source)
      ? source.replace(expression, line)
      : `${source.length === 0 || source.endsWith('\n') ? source : `${source}\n`}${line}\n`;
  }
  const temporaryPath = `${path}.${process.pid}-${Date.now()}.tmp`;
  await writeFile(temporaryPath, source, { encoding: 'utf8', mode: 0o600 });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, path);
}

/* ---------------------------------------------------------------- CURRENT.json 登记 */

async function updateBaselineRegistry(input: {
  readonly registryPath: string;
  readonly environment: string;
  readonly deploymentId: string;
  readonly chainId: number;
  readonly version: string;
  readonly paramsExport: string;
  readonly manifestPath: string;
  readonly note: string;
}): Promise<void> {
  const raw = JSON.parse(await readFile(input.registryPath, 'utf8')) as Record<string, unknown>;
  const deployments = Array.isArray(raw.deployments) ? raw.deployments as Array<Record<string, unknown>> : [];
  const entry: Record<string, unknown> = {
    id: input.deploymentId,
    network: `tenderly-vnet(${input.environment})`,
    chainId: input.chainId,
    version: input.version,
    releaseLabel: `release-${input.version}`,
    paramsExport: input.paramsExport,
    manifest: input.manifestPath,
    note: input.note,
  };
  const existingIndex = deployments.findIndex((item) => item.id === input.deploymentId);
  if (existingIndex >= 0) deployments[existingIndex] = entry;
  else deployments.push(entry);
  raw.deployments = deployments;
  const environmentsNode = (raw.environments ?? {}) as Record<string, Record<string, unknown>>;
  environmentsNode[input.environment] = {
    ...(environmentsNode[input.environment] ?? {}),
    forkOf: input.deploymentId,
  };
  raw.environments = environmentsNode;
  const today = new Date().toISOString().slice(0, 10);
  raw.updatedAt = today;
  const history = Array.isArray(raw.history) ? raw.history as Array<Record<string, unknown>> : [];
  const change = `${input.environment}：${input.note}`;
  // 续跑幂等：同一条登记不重复追加 history
  if (!history.some((item) => item.change === change)) history.push({ date: today, change });
  raw.history = history;
  await writeFile(input.registryPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
}

/* ---------------------------------------------------------------- 主流程 */

async function main(): Promise<void> {
  const projectRoot = process.cwd();
  const workspaceRoot = resolve(projectRoot, '..');

  const environmentName = (argumentValue('--env') ?? 'tx-fork') as EnvironmentName;
  const definition = environments[environmentName];
  if (!definition) fail(`未知环境：${environmentName}`);
  if (!definition.adminRpcEnvironmentVariable || !definition.fixedChainId) {
    fail(`${environmentName} 不支持部署（需要 Admin RPC 与固定 Chain ID 的 fork 环境）。`);
  }
  const branch = argumentValue('--branch') ?? 'release/v0.3.2';
  const versionMatch = /v\d+\.\d+\.\d+/.exec(branch);
  if (!versionMatch) fail(`--branch ${branch} 无法解析版本号（需含 vN.N.N）。`);
  const version = versionMatch[0];
  const repoPath = resolve(argumentValue('--repo')
    ?? join(workspaceRoot, 'Github', `fx100-contracts@${branch.replaceAll('/', '-')}`));
  const dateStamp = new Date().toISOString().slice(2, 10).replaceAll('-', '');
  // Ignition deployment-id 只允许字母数字、- 与 _（实测 0.15.16 拒绝点号），版本号去点后拼入。
  const deploymentId = argumentValue('--deployment-id') ?? `${environmentName}-${version.replaceAll('.', '')}-${dateStamp}`;
  if (!/^[A-Za-z0-9_-]+$/.test(deploymentId)) fail(`--deployment-id ${deploymentId} 含 Ignition 不允许的字符（仅限字母数字/-/_）。`);
  const options: CliOptions = {
    environment: environmentName,
    branch,
    repoPath,
    dryRun: process.argv.includes('--dry-run'),
    skipCompile: process.argv.includes('--skip-compile'),
    skipInstall: process.argv.includes('--skip-install'),
    deploymentId,
    version,
  };
  const manifestName = `${environmentName}-${version}-${dateStamp}`;

  banner('1/10 合约仓与分支核对（只读）');
  if (!existsSync(join(options.repoPath, 'hardhat.config.ts'))) fail(`合约仓不存在或不完整：${options.repoPath}`);
  const gitOutput = async (args: readonly string[]): Promise<string> => new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('git', ['-C', options.repoPath, ...args], { stdio: ['ignore', 'pipe', 'inherit'] });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
    child.on('error', rejectPromise);
    child.on('exit', (code) => code === 0 ? resolvePromise(output.trim()) : rejectPromise(new Error(`git ${args.join(' ')} 退出码 ${code}`)));
  });
  const currentBranch = await gitOutput(['branch', '--show-current']);
  const head = await gitOutput(['rev-parse', 'HEAD']);
  if (currentBranch !== options.branch) fail(`合约仓分支为 ${currentBranch}，与 --branch ${options.branch} 不一致。`);
  log(`合约仓 ${options.repoPath}`);
  log(`分支 ${currentBranch} @ ${head}`);

  banner('2/10 环境 RPC 与 Chain ID');
  const settings = await readEnvironmentSettings(projectRoot, options.environment);
  if (!settings.adminRpcUrl) fail(`${options.environment} 缺少 Admin RPC（.env.local ${definition.adminRpcEnvironmentVariable}）。`);
  const adminRpcUrl = settings.adminRpcUrl;
  const expectedChainId = settings.chainId ?? definition.fixedChainId;
  log(`环境 ${options.environment}，登记 Chain ID ${expectedChainId}（固定编号 ${definition.fixedChainId}）`);
  if (!options.dryRun) {
    const chainIdHex = await rpcCall(adminRpcUrl, 'eth_chainId') as string;
    const actualChainId = Number.parseInt(chainIdHex, 16);
    if (actualChainId !== expectedChainId) fail(`fork eth_chainId=${actualChainId} 与登记 ${expectedChainId} 不一致。`);
    log(`eth_chainId 校验通过：${actualChainId}`);
  }

  const localValues = Object.fromEntries((await readFile(join(projectRoot, '.env.local'), 'utf8'))
    .split('\n')
    .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => [match[1]!, (match[2] ?? '').replace(/^"|"$/g, '')]));
  const adminAccount = getAddress(localValues.E2E_ADMIN_ACCOUNT ?? fail('缺少 E2E_ADMIN_ACCOUNT'));
  const keeperAccount = getAddress(localValues.E2E_KEEPER_ACCOUNT ?? fail('缺少 E2E_KEEPER_ACCOUNT'));
  log(`admin=${adminAccount} keeper=${keeperAccount}`);

  banner('3/10 一次性 deployer 生成与注资');
  const deployerPrivateKey = generatePrivateKey();
  const deployer = privateKeyToAccount(deployerPrivateKey).address;
  log(`deployer=${deployer}（一次性，仅本进程内存与子进程环境变量，不落盘）`);
  if (!options.dryRun) {
    await rpcCall(adminRpcUrl, 'tenderly_setBalance', [[deployer], toHex(100n * 10n ** 18n)]);
    log('tenderly_setBalance deployer 100 ETH 完成');
  }

  banner('4/10 合约仓依赖与编译');
  if (options.dryRun) {
    log('[dry-run] 将按需执行 npm ci 与 npx hardhat compile');
  } else {
    if (!existsSync(join(options.repoPath, 'node_modules')) && !options.skipInstall) {
      await runCommand('npm ci（合约仓）', 'npm', ['ci', '--no-audit', '--no-fund'], { cwd: options.repoPath });
    } else {
      log('node_modules 已存在或 --skip-install，跳过 npm ci');
    }
    if (options.skipCompile && existsSync(join(options.repoPath, 'artifacts'))) {
      log('--skip-compile：使用现有 hardhat artifacts');
    } else {
      await runCommand('npx hardhat compile', 'npx', ['hardhat', 'compile'], { cwd: options.repoPath });
    }
  }

  banner('5/10 Ignition 部署（Fx100Core 八模块）');
  const forkConfigPath = join(options.repoPath, 'hardhat.fork.config.ts');
  const forkConfigSource = `// 由 TestCode/scripts/deploy-contracts.ts 生成的 untracked 临时配置：向 Tenderly fork 部署用。
// RPC/私钥均经环境变量注入（FORK_RPC_URL / FORK_CHAIN_ID / DEPLOYER_PRIVATE_KEY），本文件不含凭证，绝不 commit。
import baseConfig from "./hardhat.config";

const forkUrl = process.env.FORK_RPC_URL ?? "";
const forkChainId = Number(process.env.FORK_CHAIN_ID ?? "0");

const config: typeof baseConfig = {
  ...baseConfig,
  ignition: { requiredConfirmations: 1 },
  networks: {
    ...(baseConfig.networks ?? {}),
    fork: {
      url: forkUrl,
      chainId: forkChainId,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
      timeout: 180_000,
    },
  },
};

export default config;
`;
  const parametersPath = join(options.repoPath, 'ignition', 'parameters', `fx100.fork.${options.environment}.json`);
  const subprocessEnv: Record<string, string> = {
    FORK_RPC_URL: adminRpcUrl,
    FORK_CHAIN_ID: String(expectedChainId),
    DEPLOYER_PRIVATE_KEY: deployerPrivateKey,
  };
  if (options.dryRun) {
    log(`[dry-run] 将写 ${forkConfigPath} 与 ${parametersPath}`);
    log(`[dry-run] npx hardhat --config hardhat.fork.config.ts ignition deploy ignition/modules/Fx100Core.ts --network fork --parameters ${parametersPath} --deployment-id ${options.deploymentId}`);
    log('[dry-run] 后续步骤（configure/角色/读回/登记）不再展开，结束。');
    return;
  }
  await writeFile(forkConfigPath, forkConfigSource, 'utf8');
  const latestBlockTimestampHex = (await rpcCall(adminRpcUrl, 'eth_getBlockByNumber', ['latest', false]) as { timestamp: string }).timestamp;
  const epochStartTime = Number.parseInt(latestBlockTimestampHex, 16) - 7 * 24 * 3600;
  const ignitionParameters = {
    Fx100Usdc: { usdc: ZERO_ADDRESS, mockUsdcInitialSupply: '10000000000000000n' },
    Fx100Base: {
      lpVaultName: 'FX100 LP USDC',
      lpVaultSymbol: 'fxLP-USDC',
      lpVaultWithdrawDelaySeconds: 604800,
      lpVaultEpochDuration: 604800,
      lpVaultEpochStartTime: epochStartTime,
      lpVaultStrategy: ZERO_ADDRESS,
      sequencerUptimeFeed: ZERO_ADDRESS,
      pyth: ZERO_ADDRESS,
    },
    Fx100Oracle: {
      pyth: ZERO_ADDRESS,
      dataStreamVerifier: '0x8Ac491b7c118a0cdcF048e0f707247fD8C9575f9',
      chainlinkPaymentToken: '0xE4aB69C077896252FAFBD49EFD26B5D171A32410',
    },
    Fx100Periphery: { riskOracle: ZERO_ADDRESS },
    Fx100Fee: { multisig: adminAccount, feeKeeper: adminAccount },
    Fx100Role: {
      configKeeper: adminAccount,
      limitedConfigKeeper: adminAccount,
      marketKeeper: adminAccount,
      orderKeeper: keeperAccount,
      liquidationKeeper: keeperAccount,
      adlKeeper: keeperAccount,
      timelockAdmin: adminAccount,
      holdingAddress: ZERO_ADDRESS,
    },
  };
  await writeFile(parametersPath, `${JSON.stringify(ignitionParameters, null, 2)}\n`, 'utf8');
  log(`Ignition 参数：keeper 角色=keeper 地址，config/market/timelock/multisig/feeKeeper=admin 地址（回落规则见 02 §9.2）`);
  const deployedAddressesPath = join(options.repoPath, 'ignition', 'deployments', options.deploymentId, 'deployed_addresses.json');
  if (existsSync(deployedAddressesPath)) {
    // 续跑：Ignition journal 记录了首次 deployer；新生成的一次性 deployer 会触发 from-account 对账失败，
    // 且部署已完成，直接复用产物即可。
    log(`检测到已完成的部署产物，跳过 Ignition：${deployedAddressesPath}`);
  } else {
    await runCommand(
      `hardhat ignition deploy（deployment-id=${options.deploymentId}）`,
      'npx',
      ['hardhat', '--config', 'hardhat.fork.config.ts', 'ignition', 'deploy', 'ignition/modules/Fx100Core.ts',
        '--network', 'fork', '--parameters', `ignition/parameters/fx100.fork.${options.environment}.json`,
        '--deployment-id', options.deploymentId],
      { cwd: options.repoPath, env: subprocessEnv, stdinText: 'y\n' },
    );
  }
  const deployedAddresses = JSON.parse(await readFile(deployedAddressesPath, 'utf8')) as DeployedAddresses;
  const contracts = {
    dataStore: addressOf(deployedAddresses, 'DataStoreProxy'),
    config: addressOf(deployedAddresses, 'Config'),
    oracle: addressOf(deployedAddresses, 'Oracle'),
    router: addressOf(deployedAddresses, 'Router'),
    orderVault: addressOf(deployedAddresses, 'OrderVault'),
    positionVault: addressOf(deployedAddresses, 'PositionVault'),
    eventEmitter: addressOf(deployedAddresses, 'EventEmitter'),
    referralStorage: addressOf(deployedAddresses, 'ReferralStorage'),
    externalHandler: addressOf(deployedAddresses, 'ExternalHandler'),
    lpVault: addressOf(deployedAddresses, 'LPVaultProxy'),
    mockUsdc: addressOf(deployedAddresses, 'MockUSDC'),
    mockUsdcOracle: addressOf(deployedAddresses, 'MockUSDCOracle'),
    chainlinkPriceFeedProvider: addressOf(deployedAddresses, 'ChainlinkPriceFeedProvider'),
    pythPriceFeedProvider: addressOf(deployedAddresses, 'PythPriceFeedProvider'),
    chainlinkDataStreamProvider: addressOf(deployedAddresses, 'ChainlinkDataStreamProvider'),
    orderHandler: addressOf(deployedAddresses, 'OrderHandler'),
    exchangeRouter: addressOf(deployedAddresses, 'ExchangeRouter'),
    subaccountRouter: addressOf(deployedAddresses, 'SubaccountRouter'),
    relayRouter: addressOf(deployedAddresses, 'RelayRouter'),
    subaccountRelayRouter: addressOf(deployedAddresses, 'SubaccountRelayRouter'),
    liquidationHandler: addressOf(deployedAddresses, 'LiquidationHandler'),
    adlHandler: addressOf(deployedAddresses, 'AdlHandler'),
    feeHandler: addressOf(deployedAddresses, 'FeeHandler'),
    increaseOrderExecutor: addressOf(deployedAddresses, 'IncreaseOrderExecutor'),
    decreaseOrderExecutor: addressOf(deployedAddresses, 'DecreaseOrderExecutor'),
    protocolTreasury: addressOf(deployedAddresses, 'ProtocolTreasuryProxy'),
    insuranceTreasury: addressOf(deployedAddresses, 'InsuranceTreasuryProxy'),
    revenuePool: addressOf(deployedAddresses, 'RevenuePool'),
    marketFactory: addressOf(deployedAddresses, 'MarketFactory'),
    autoCancelSyncer: addressOf(deployedAddresses, 'AutoCancelSyncer'),
    configSyncer: addressOf(deployedAddresses, 'ConfigSyncer'),
    reader: addressOf(deployedAddresses, 'Reader'),
    keeperReader: addressOf(deployedAddresses, 'KeeperReader'),
  } as const;
  log(`DataStoreProxy=${contracts.dataStore}`);
  log(`Config=${contracts.config} ExchangeRouter=${contracts.exchangeRouter} Reader=${contracts.reader}`);
  log(`LPVaultProxy=${contracts.lpVault} MockUSDC=${contracts.mockUsdc} RevenuePool=${contracts.revenuePool}`);

  /* viem 客户端（Admin RPC；写操作用免签名 eth_sendTransaction） */
  const chain = defineChain({
    id: expectedChainId,
    name: `${options.environment} private fork`,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [adminRpcUrl] } },
  });
  const publicClient = createPublicClient({ chain, transport: http(adminRpcUrl, { timeout: 60_000 }), pollingInterval: 500 });
  const wallet = (account: Address) => createWalletClient({ account, chain, transport: http(adminRpcUrl, { timeout: 60_000 }) });
  const deployerWallet = wallet(deployer);
  const sendAndWait = async (label: string, transaction: Promise<Hex>): Promise<Hex> => {
    const hash = await transaction;
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
    if (receipt.status !== 'success') fail(`${label} 交易失败：${hash}`);
    return hash;
  };

  // 链上真实权限持有者：DataStore DEFAULT_ADMIN_ROLE 成员[0]（全新部署时 = 首次 deployer）。
  // 续跑时本进程新生成的一次性 deployer 没有任何角色：由 defaultAdmin 经 Admin RPC 免签名补授，
  // configure 子脚本（用本次 deployer 私钥签名）才有 CONFIG_KEEPER/CONTROLLER/MARKET_KEEPER 可写。
  const defaultAdminRole = `0x${'0'.repeat(64)}` as Hex;
  const defaultAdminCount = await publicClient.readContract({
    address: contracts.dataStore, abi: dataStoreAbi, functionName: 'getRoleMemberCount', args: [defaultAdminRole],
  });
  if (defaultAdminCount === 0n) fail('DataStore 没有 DEFAULT_ADMIN_ROLE 成员。');
  const defaultAdmin = getAddress(await publicClient.readContract({
    address: contracts.dataStore, abi: dataStoreAbi, functionName: 'getRoleMember', args: [defaultAdminRole, 0n],
  }));
  const defaultAdminWallet = wallet(defaultAdmin);
  await rpcCall(adminRpcUrl, 'tenderly_setBalance', [[defaultAdmin], toHex(100n * 10n ** 18n)]);
  log(`DEFAULT_ADMIN_ROLE 成员[0]=${defaultAdmin}`);
  for (const roleName of ['CONFIG_KEEPER', 'CONTROLLER', 'MARKET_KEEPER'] as const) {
    const role = baseKey(roleName);
    const alreadyGranted = await publicClient.readContract({
      address: contracts.dataStore, abi: dataStoreAbi, functionName: 'hasRole', args: [role, deployer],
    });
    if (alreadyGranted) continue;
    await sendAndWait(`grantRole(${roleName}, 本次一次性 deployer)`, defaultAdminWallet.writeContract({
      address: contracts.dataStore, abi: dataStoreAbi, functionName: 'grantRole', args: [role, deployer],
    }));
    log(`续跑自愈：${roleName} → 本次 deployer ${deployer}`);
  }

  banner('6/10 WBTC/ETH Mock Oracle 部署与初始价格');
  const marketSample = JSON.parse(await readFile(join(options.repoPath, 'scripts', 'parameters', 'market.sample.json'), 'utf8')) as {
    markets: Array<{ symbol: string; token: string; raw: Record<string, string | number> }>;
  };
  const oracleArtifact = JSON.parse(await readFile(
    join(options.repoPath, 'artifacts', 'src', 'periphery', 'MockAssetContracts.sol', 'MockChainlinkOracle.json'),
    'utf8',
  )) as { abi: unknown; bytecode: Hex };
  const nowTimestamp = BigInt(Number.parseInt(latestBlockTimestampHex, 16));
  const mockPrices: Record<string, string> = { WBTC: '118000', ETH: '4500' };
  const indexOracles: Record<string, Address> = {};
  for (const market of marketSample.markets) {
    const price = mockPrices[market.symbol] ?? fail(`未为 ${market.symbol} 预置 Mock 价格`);
    // 续跑复用：该 token 的 PRICE_FEED 已指向有代码的合约（首轮部署的 Mock Oracle）则不重复部署。
    const existingFeed = getAddress(await publicClient.readContract({
      address: contracts.dataStore, abi: dataStoreAbi, functionName: 'getAddress',
      args: [dataStoreKey('PRICE_FEED', 'address', [getAddress(market.token)])],
    }));
    let oracleAddress: Address | undefined;
    if (existingFeed !== ZERO_ADDRESS) {
      const code = await publicClient.getBytecode({ address: existingFeed });
      if (code && code !== '0x') {
        oracleAddress = existingFeed;
        log(`${market.symbol} 复用已配置的 Mock Oracle ${oracleAddress}`);
      }
    }
    if (!oracleAddress) {
      const deployHash = await sendAndWait(`MockChainlinkOracle(${market.symbol})`, deployerWallet.deployContract({
        abi: oracleArtifact.abi as never,
        bytecode: oracleArtifact.bytecode,
        args: [`${market.symbol} / USD`, 8],
      }));
      const receipt = await publicClient.getTransactionReceipt({ hash: deployHash });
      if (!receipt.contractAddress) fail(`MockChainlinkOracle(${market.symbol}) 未返回地址`);
      oracleAddress = getAddress(receipt.contractAddress);
    }
    indexOracles[market.symbol] = oracleAddress;
    await sendAndWait(`setMockPrice(${market.symbol}=${price})`, deployerWallet.writeContract({
      address: oracleAddress,
      abi: mockOracleAbi,
      functionName: 'setMockPrice',
      args: [parseDecimalScaled(price, 8), nowTimestamp],
    }));
    log(`${market.symbol} MockOracle=${oracleAddress} 价格=${price}（8 decimals）`);
  }
  // USDC feed 复用：env:init:mock 之后 PRICE_FEED(USDC) 会指向共享 USDC Mock Oracle（8 decimals + STABLE_PRICE 锚），
  // 续跑绝不能把它改回 Ignition MockUSDCOracle（2026-09-01 实例：改回后 multiplier 1e46→1e36，verify:mock 必炸）。
  const existingUsdcFeed = getAddress(await publicClient.readContract({
    address: contracts.dataStore, abi: dataStoreAbi, functionName: 'getAddress',
    args: [dataStoreKey('PRICE_FEED', 'address', [contracts.mockUsdc])],
  }));
  let usdcFeed = contracts.mockUsdcOracle;
  if (existingUsdcFeed !== ZERO_ADDRESS && existingUsdcFeed !== contracts.mockUsdcOracle) {
    const usdcFeedCode = await publicClient.getBytecode({ address: existingUsdcFeed });
    if (usdcFeedCode && usdcFeedCode !== '0x') usdcFeed = existingUsdcFeed;
  }
  if (usdcFeed === contracts.mockUsdcOracle) {
    await sendAndWait('setMockPrice(USDC=1.00)', deployerWallet.writeContract({
      address: contracts.mockUsdcOracle,
      abi: mockOracleAbi,
      functionName: 'setMockPrice',
      args: [parseDecimalScaled('1', 18), nowTimestamp],
    }));
    log(`MockUSDCOracle=${contracts.mockUsdcOracle} 初始价=1.00（18 decimals）`);
  } else {
    log(`USDC 复用已配置的 PRICE_FEED：${usdcFeed}（价格/时间戳/锚不改动）`);
  }
  const usdcFeedDecimals = Number(await publicClient.readContract({
    address: usdcFeed, abi: erc20Abi, functionName: 'decimals',
  }));

  const oracleConfig = {
    tokenTransferGasLimit: '200000',
    tokens: [
      {
        symbol: 'USDC',
        token: contracts.mockUsdc,
        dataFeed: { feedAddress: usdcFeed, oracleDecimals: String(usdcFeedDecimals), heartbeatDuration: '86400' },
        dataStream: { feedId: `0x${'0'.repeat(64)}`, oracleDecimals: String(usdcFeedDecimals), dataStreamSpreadReductionFactor: '1' },
      },
      ...marketSample.markets.map((market) => ({
        symbol: market.symbol,
        token: market.token,
        dataFeed: { feedAddress: indexOracles[market.symbol]!, oracleDecimals: '8', heartbeatDuration: '86400' },
        dataStream: { feedId: `0x${'0'.repeat(64)}`, oracleDecimals: '8', dataStreamSpreadReductionFactor: '1' },
      })),
    ],
  };
  const oracleConfigPath = join(options.repoPath, 'scripts', 'parameters', `oracle.fork.${options.environment}.json`);
  await writeFile(oracleConfigPath, `${JSON.stringify(oracleConfig, null, 2)}\n`, 'utf8');

  banner('7/10 configure 三脚本（仓库预设参数）');
  const configureEnv = (extra: Record<string, string>): Record<string, string> => ({
    ...subprocessEnv,
    FX100_DEPLOYMENT: deployedAddressesPath,
    ...extra,
  });
  const hardhatRun = (script: string) => ['hardhat', '--config', 'hardhat.fork.config.ts', 'run', script, '--network', 'fork'];
  await runCommand('configureGeneral（general.sample.json）', 'npx', hardhatRun('scripts/configureGeneral.ts'), {
    cwd: options.repoPath,
    env: configureEnv({ FX100_CONFIG: 'scripts/parameters/general.sample.json' }),
  });
  await runCommand('configureOracle（oracle.fork 生成文件）', 'npx', hardhatRun('scripts/configureOracle.ts'), {
    cwd: options.repoPath,
    env: configureEnv({ FX100_CONFIG: `scripts/parameters/oracle.fork.${options.environment}.json` }),
  });
  for (const marketOrdinal of [1, 2] as const) {
    await runCommand(`configureMarket FX100_MARKET=${marketOrdinal}（market.sample.json）`, 'npx', hardhatRun('scripts/configureMarket.ts'), {
      cwd: options.repoPath,
      env: configureEnv({
        FX100_CONFIG: 'scripts/parameters/market.sample.json',
        FX100_SHARED_CONFIG: 'scripts/parameters/shared_market.sample.json',
        FX100_MARKET: String(marketOrdinal),
      }),
    });
  }

  banner('8/10 角色授权（keeper/admin）');
  const roleGrants: ReadonlyArray<{ role: string; account: Address }> = [
    { role: 'ORDER_KEEPER', account: keeperAccount },
    { role: 'FROZEN_ORDER_KEEPER', account: keeperAccount },
    { role: 'LIQUIDATION_KEEPER', account: keeperAccount },
    { role: 'ADL_KEEPER', account: keeperAccount },
    { role: 'CONTROLLER', account: adminAccount },
    { role: 'CONFIG_KEEPER', account: adminAccount },
    { role: 'MARKET_KEEPER', account: adminAccount },
  ];
  for (const grant of roleGrants) {
    const role = baseKey(grant.role);
    const alreadyGranted = await publicClient.readContract({
      address: contracts.dataStore, abi: dataStoreAbi, functionName: 'hasRole', args: [role, grant.account],
    });
    if (alreadyGranted) {
      log(`${grant.role} → ${grant.account} 已具备（Ignition 参数已授予）`);
      continue;
    }
    await sendAndWait(`grantRole(${grant.role})`, defaultAdminWallet.writeContract({
      address: contracts.dataStore, abi: dataStoreAbi, functionName: 'grantRole', args: [role, grant.account],
    }));
    log(`${grant.role} → ${grant.account} 已补授`);
  }

  banner('9/10 读回校验（02 §18.1 + 06 §5 A-2）');
  const failures: string[] = [];
  const check = (label: string, ok: boolean, detail: string): void => {
    log(`${ok ? '✓' : '✗'} ${label}：${detail}`);
    if (!ok) failures.push(`${label}：${detail}`);
  };
  const collateralTokenGlobal = getAddress(await publicClient.readContract({
    address: contracts.dataStore, abi: dataStoreAbi, functionName: 'getAddress', args: [baseKey('COLLATERAL_TOKEN')],
  }));
  const vaultAsset = getAddress(await publicClient.readContract({
    address: contracts.lpVault, abi: vaultAbi, functionName: 'asset',
  }));
  check('COLLATERAL_TOKEN 全局键 = 部署 USDC = vault.asset()',
    collateralTokenGlobal === contracts.mockUsdc && vaultAsset === contracts.mockUsdc,
    `COLLATERAL_TOKEN=${collateralTokenGlobal} MockUSDC=${contracts.mockUsdc} vault.asset()=${vaultAsset}`);
  const feeReceiver = getAddress(await publicClient.readContract({
    address: contracts.dataStore, abi: dataStoreAbi, functionName: 'getAddress', args: [baseKey('FEE_RECEIVER')],
  }));
  check('FEE_RECEIVER = RevenuePool', feeReceiver === contracts.revenuePool, `FEE_RECEIVER=${feeReceiver}`);
  const marketCount = await publicClient.readContract({
    address: contracts.dataStore, abi: dataStoreAbi, functionName: 'getUintCount', args: [baseKey('MARKET_LIST')],
  });
  // 部署本身创建 2 个市场；后续 env:init:mock 会追加 Mock Market（如 #3 FXMOCK），故校验下限
  check('MARKET_LIST 数量 ≥ 2', marketCount >= 2n, `count=${marketCount}`);

  const manifestMarkets: DeploymentManifest['markets'][number][] = [];
  for (const [ordinal, market] of marketSample.markets.entries()) {
    const marketIndex = BigInt(ordinal + 1);
    const onChain = await publicClient.readContract({
      address: contracts.reader, abi: readerAbi, functionName: 'getMarket', args: [contracts.dataStore, marketIndex],
    });
    const indexToken = getAddress(market.token);
    check(`Market #${marketIndex}（${market.symbol}）Reader 读回`,
      onChain.marketIndex === marketIndex
        && getAddress(onChain.indexToken) === indexToken
        && getAddress(onChain.collateralToken) === contracts.mockUsdc
        && getAddress(onChain.vault) === contracts.lpVault,
      `indexToken=${onChain.indexToken} collateral=${onChain.collateralToken} vault=${onChain.vault}`);
    const expectedMin = parseDecimalScaled(String(market.raw.DynamicSpread_Clamp_Min), 18);
    const expectedMax = parseDecimalScaled(String(market.raw.DynamicSpread_Clamp_Max), 18);
    for (const isLong of [true, false]) {
      const minValue = await publicClient.readContract({
        address: contracts.dataStore, abi: dataStoreAbi, functionName: 'getInt',
        args: [dataStoreKey('MIN_DYNAMIC_SPREAD', 'uint256,bool', [marketIndex, isLong])],
      });
      const maxValue = await publicClient.readContract({
        address: contracts.dataStore, abi: dataStoreAbi, functionName: 'getInt',
        args: [dataStoreKey('MAX_DYNAMIC_SPREAD', 'uint256,bool', [marketIndex, isLong])],
      });
      check(`Market #${marketIndex} isLong=${isLong} MIN/MAX_DYNAMIC_SPREAD 读回=写入`,
        minValue === expectedMin && maxValue === expectedMax,
        `min=${minValue}（期望 ${expectedMin}）max=${maxValue}（期望 ${expectedMax}）`);
    }
    // 合成市场的 index token 允许是无代码的占位地址（如 Base Sepolia 合成 BTC 0x0555E…），
    // 不能对它读 decimals()；已知 symbol 用登记值（对齐 v0.3.1 manifest），读取失败回退 18。
    const knownDecimals: Record<string, number> = { WBTC: 8, ETH: 18 };
    const indexTokenDecimals = knownDecimals[market.symbol]
      ?? await publicClient.readContract({ address: indexToken, abi: erc20Abi, functionName: 'decimals' })
        .then((value) => Number(value))
        .catch(() => 18);
    manifestMarkets.push({
      name: market.symbol === 'WBTC' ? 'MockBTC' : market.symbol,
      symbol: market.symbol === 'WBTC' ? 'MOCK-BTC-USD' : `${market.symbol}-USD`,
      marketIndex: String(marketIndex),
      indexToken,
      collateralToken: contracts.mockUsdc,
      vault: contracts.lpVault,
      indexTokenDecimals,
      collateralTokenDecimals: 6,
      synthetic: indexToken.toLowerCase() !== WETH_BASE.toLowerCase(),
    });
  }
  for (const grant of roleGrants) {
    const granted = await publicClient.readContract({
      address: contracts.dataStore, abi: dataStoreAbi, functionName: 'hasRole', args: [baseKey(grant.role), grant.account],
    });
    check(`hasRole(${grant.role}, ${grant.role.includes('KEEPER') && grant.account === keeperAccount ? 'keeper' : 'admin'})`, granted, String(granted));
  }
  const controllerOnOrderHandler = await publicClient.readContract({
    address: contracts.dataStore, abi: dataStoreAbi, functionName: 'hasRole', args: [baseKey('CONTROLLER'), contracts.orderHandler],
  });
  check('hasRole(CONTROLLER, OrderHandler)', controllerOnOrderHandler, String(controllerOnOrderHandler));
  for (const [symbol, token] of [
    ['USDC', contracts.mockUsdc],
    ...marketSample.markets.map((market) => [market.symbol, getAddress(market.token)] as const),
  ] as ReadonlyArray<readonly [string, Address]>) {
    const price = await publicClient.readContract({
      address: contracts.chainlinkPriceFeedProvider, abi: providerAbi, functionName: 'getOraclePrice', args: [token, '0x'],
    });
    check(`PriceFeedProvider.getOraclePrice(${symbol}) 非零`, price.min > 0n && price.max >= price.min, `min=${price.min} max=${price.max}`);
  }
  if (failures.length > 0) fail(`读回校验未全部通过（${failures.length} 项）：\n- ${failures.join('\n- ')}`);

  banner('10/10 自动登记（manifest / .env.local / CURRENT.json / 参数快照）');
  const forkRecord = await (async (): Promise<{ forkBlockNumber?: number }> => {
    try {
      const registry = JSON.parse(await readFile(join(workspaceRoot, 'Docs', 'contract-releases', 'CURRENT.json'), 'utf8')) as {
        environments?: Record<string, { forkBlockNumber?: number }>;
      };
      const blockNumber = registry.environments?.[options.environment]?.forkBlockNumber;
      return typeof blockNumber === 'number' ? { forkBlockNumber: blockNumber } : {};
    } catch {
      return {};
    }
  })();
  const forkBlockNumber = forkRecord.forkBlockNumber
    ?? Number.parseInt(await rpcCall(adminRpcUrl, 'eth_blockNumber') as string, 16);

  // 角色/代币导出（manifest.source 引用的真实文件；scn-009 等 runner 经 source.deploymentDirectory 找地址表）
  const parameterCachePrefix = `./artifacts/parameter-cache/${options.environment}`;
  const parameterCacheDirectoryEarly = join(projectRoot, 'artifacts', 'parameter-cache', options.environment);
  await mkdir(parameterCacheDirectoryEarly, { recursive: true });
  const rolesExport = {
    generatedAt: new Date().toISOString(),
    deploymentId: options.deploymentId,
    chainId: expectedChainId,
    dataStore: contracts.dataStore,
    defaultAdminRoleMember0: defaultAdmin,
    grants: roleGrants.map((grant) => ({ role: grant.role, account: grant.account })),
    note: 'Ignition bootstrap 角色（DEFAULT_ADMIN/CONTROLLER/CONFIG_KEEPER 等）仍留在首次一次性 deployer 上，未回收（02 §9.3）；fork 上经 Admin RPC 免签名可随时代行。',
  };
  const tokensExport = {
    generatedAt: new Date().toISOString(),
    deploymentId: options.deploymentId,
    chainId: expectedChainId,
    tokens: [
      { symbol: 'USDC', address: contracts.mockUsdc, decimals: 6, oracle: usdcFeed, oracleDecimals: usdcFeedDecimals, kind: 'mock-collateral' },
      ...marketSample.markets.map((market) => ({
        symbol: market.symbol,
        address: getAddress(market.token),
        decimals: market.symbol === 'WBTC' ? 8 : 18,
        oracle: indexOracles[market.symbol] ?? ZERO_ADDRESS,
        oracleDecimals: 8,
        kind: market.symbol === 'ETH' ? 'wnt-index' : 'synthetic-index',
      })),
    ],
  };
  await writeFile(join(parameterCacheDirectoryEarly, `${manifestName}.roles.json`), `${JSON.stringify(rolesExport, null, 2)}\n`, 'utf8');
  await writeFile(join(parameterCacheDirectoryEarly, `${manifestName}.tokens.json`), `${JSON.stringify(tokensExport, null, 2)}\n`, 'utf8');

  const ignitionDeploymentDirectory = join(options.repoPath, 'ignition', 'deployments', options.deploymentId);
  const manifest: DeploymentManifest = deploymentManifestSchema.parse({
    schemaVersion: 1,
    name: manifestName,
    release: `release-${options.version}@${head}`,
    chainId: expectedChainId,
    forkBlockNumber: String(forkBlockNumber),
    contracts: {
      exchangeRouter: contracts.exchangeRouter,
      reader: contracts.reader,
      dataStore: contracts.dataStore,
      roleStore: contracts.dataStore,
      config: contracts.config,
      oracle: contracts.oracle,
      orderHandler: contracts.orderHandler,
      liquidationHandler: contracts.liquidationHandler,
      adlHandler: contracts.adlHandler,
      eventEmitter: contracts.eventEmitter,
      positionVault: contracts.positionVault,
    },
    roles: {
      controller: adminAccount,
      configKeeper: adminAccount,
      orderKeeper: keeperAccount,
      liquidationKeeper: keeperAccount,
      adlKeeper: keeperAccount,
    },
    markets: manifestMarkets,
    additionalContracts: {
      router: contracts.router,
      orderVault: contracts.orderVault,
      lpVault: contracts.lpVault,
      referralStorage: contracts.referralStorage,
      externalHandler: contracts.externalHandler,
      mockUsdc: contracts.mockUsdc,
      mockUsdcOracle: contracts.mockUsdcOracle,
      keeperReader: contracts.keeperReader,
      marketFactory: contracts.marketFactory,
      chainlinkPriceFeedProvider: contracts.chainlinkPriceFeedProvider,
      chainlinkDataStreamProvider: contracts.chainlinkDataStreamProvider,
      pythPriceFeedProvider: contracts.pythPriceFeedProvider,
      subaccountRouter: contracts.subaccountRouter,
      relayRouter: contracts.relayRouter,
      subaccountRelayRouter: contracts.subaccountRelayRouter,
      increaseOrderExecutor: contracts.increaseOrderExecutor,
      decreaseOrderExecutor: contracts.decreaseOrderExecutor,
      feeHandler: contracts.feeHandler,
      protocolTreasury: contracts.protocolTreasury,
      insuranceTreasury: contracts.insuranceTreasury,
      revenuePool: contracts.revenuePool,
      autoCancelSyncer: contracts.autoCancelSyncer,
      configSyncer: contracts.configSyncer,
      mockBtcOracle: indexOracles.WBTC ?? ZERO_ADDRESS,
      mockEthOracle: indexOracles.ETH ?? ZERO_ADDRESS,
      wnt: getAddress(WETH_BASE),
    },
    source: {
      deploymentDirectory: relative(projectRoot, ignitionDeploymentDirectory),
      addressesFile: relative(projectRoot, deployedAddressesPath),
      abiDirectory: relative(projectRoot, join(options.repoPath, 'artifacts')),
      parametersFile: `${parameterCachePrefix}/${manifestName}.params.json`,
      rolesFile: `${parameterCachePrefix}/${manifestName}.roles.json`,
      tokensFile: `${parameterCachePrefix}/${manifestName}.tokens.json`,
    },
    initialization: {
      nativeEth: { trader: '10', keeper: '10', admin: '10' },
      traderUsdc: '1000000',
      minimumLpUsdc: '500000',
      routerApproval: 'max',
      keeperRoles: ['ORDER_KEEPER', 'ADL_KEEPER', 'LIQUIDATION_KEEPER'],
    },
  });
  const manifestRelativePath = `./config/deployments/${manifestName}.json`;
  const manifestAbsolutePath = join(projectRoot, 'config', 'deployments', `${manifestName}.json`);
  await writeFile(manifestAbsolutePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  log(`deployment manifest 写入 ${manifestAbsolutePath}（schema 校验通过）`);

  await updateEnvLocal(projectRoot, { E2E_DEPLOYMENT_MANIFEST: manifestRelativePath });
  log(`.env.local E2E_DEPLOYMENT_MANIFEST → ${manifestRelativePath}`);

  const parameterCacheDirectory = join(projectRoot, 'artifacts', 'parameter-cache', options.environment);
  // dump-config 用 deployment 路径的父目录名作为快照名；复制一份 addresses 到带版本号的目录，让快照命名为 <manifestName>.params.*
  const snapshotDeploymentDirectory = join(parameterCacheDirectory, manifestName);
  await mkdir(snapshotDeploymentDirectory, { recursive: true });
  await writeFile(join(snapshotDeploymentDirectory, 'deployed_addresses.json'), `${JSON.stringify(deployedAddresses, null, 2)}\n`, 'utf8');
  const registryOutPath = join(parameterCacheDirectory, `registry-${options.version}.json`);
  await runCommand('config-dump build-registry（v0.3.2 keys）', 'node',
    ['tools/config-dump/build-registry.mjs', '--contracts', options.repoPath, '--out', registryOutPath],
    { cwd: projectRoot });
  await runCommand('config-dump 参数快照', 'node',
    ['tools/config-dump/dump-config.mjs',
      '--deployment', join(snapshotDeploymentDirectory, 'deployed_addresses.json'),
      '--registry', registryOutPath,
      '--out', parameterCacheDirectory,
      '--expected-chain-id', String(expectedChainId),
      '--rpc-label', `${options.environment} admin RPC`],
    { cwd: projectRoot, env: { FX100_RPC_URL: adminRpcUrl } });
  const paramsExportWorkspacePath = `TestCode/artifacts/parameter-cache/${options.environment}/${manifestName}.params.json`;

  await updateBaselineRegistry({
    registryPath: join(workspaceRoot, 'Docs', 'contract-releases', 'CURRENT.json'),
    environment: options.environment,
    deploymentId: `${options.environment}@${options.version}`,
    chainId: expectedChainId,
    version: options.version,
    paramsExport: paramsExportWorkspacePath,
    manifestPath: `TestCode/config/deployments/${manifestName}.json`,
    note: `${new Date().toISOString().slice(0, 10)} 由 deploy:contracts 在 ${options.environment}（chain ${expectedChainId}）全新部署 ${options.branch}@${head.slice(0, 7)}（Ignition Fx100Core + configure 三脚本 + 双市场 + 角色授权 + 读回校验通过）`,
  });
  log(`CURRENT.json 已登记 deployments[] ${options.environment}@${options.version} 并把 environments.${options.environment}.forkOf 指向它`);

  banner('完成');
  log(`部署产物：${deployedAddressesPath}`);
  log(`manifest：${manifestRelativePath}`);
  log(`参数快照：${paramsExportWorkspacePath}`);
  log('下一步：npm run env:init:mock（--force --force-shared-collateral）→ env:verify:mock → 跑批。');
  log('提醒：一次性 deployer 私钥仅存于本进程内存，进程结束即弃；fork 上后续管理操作走 Admin RPC 免签名。');
}

main().catch((error) => {
  console.error(`[deploy] 失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

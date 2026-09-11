/**
 * v0.3.2 Trade 矩阵 A 节「部署与交易基线」CT-BASE-001～008 只读核对 runner。
 *
 * 口径（TestCase/E2E/versions/v0.3.2/Trade-测试用例矩阵.md §A）：
 * - 期望值全部来自 CURRENT.json / 环境绑定 manifest / 链上实时读取，不写死部署地址、marketIndex、decimals；
 * - 只读：所有函数只对 runtime.rpcUrl 做 eth_call / eth_getCode / eth_getStorageAt（含 Config.setInt / OrderHandler.executeOrder 的
 *   eth_call 模拟，不发交易）；唯一的状态变更是 CT-BASE-008 的 LIMITED_CONFIG_KEEPER 夹具——在 runtime.adminRpcUrl 的
 *   evm_snapshot/evm_revert 之间由 DEFAULT_ADMIN 免签名 grantRole，夹具不可用（无 admin RPC）时该子项记 NOT_EXERCISED（passed=true 且注明未执行）；
 *   CT-BASE-005 本身只读，但 spec 层用 applyCaseTrader 给探针 T100 注资/授权，故该 spec 打 @tx 标签而非 @readonly；
 * - 证据里不得出现 RPC URL / 私钥；错误消息统一 maskErrorText 脱敏。
 */
import { readFile } from 'node:fs/promises';

import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  formatUnits,
  getAddress,
  http,
  keccak256,
  parseAbi,
  parseAbiParameters,
  parseUnits,
  stringToHex,
  zeroAddress,
  zeroHash,
  type Abi,
  type Hex,
  type PublicClient,
} from 'viem';

import {
  loadBaselineRegistry,
  resolveEnvironmentRelease,
  targetRelease,
} from '../config/baseline.js';
import {
  loadContractArtifact,
  loadDeploymentAbi,
  loadDeploymentManifest,
  type DeploymentManifest,
} from '../config/deployment.js';
import { assertRuntimeEnvironmentBinding, loadEnvironmentBinding } from '../config/environment-binding.js';
import { isMockResourceEnvironment, loadMockResourceRegistry } from '../config/mock-resources.js';
import { maskUrl, type RuntimeConfig } from '../config/runtime.js';
import { loadCaseTraderMap } from '../config/trader-roster.js';
import { adminRpcRequest, sendAdminTransaction } from '../drivers/admin-rpc.js';
import { readMockOracleState, readStablePrice } from '../drivers/mock-oracle.js';

// ---------------------------------------------------------------------------
// 证据形状
// ---------------------------------------------------------------------------

export interface CaseCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly actual: unknown;
  readonly expected: unknown;
  readonly note?: string;
}

export interface CaseEvidence {
  readonly id: string;
  readonly title: string;
  readonly checks: CaseCheck[];
  readonly data: Record<string, unknown>;
  readonly blocked?: string;
}

export const CT_BASE_TITLES = {
  'CT-BASE-001': '环境身份_当前测试端点_确认为目标 v0.3.2 环境',
  'CT-BASE-002': '核心合约_CURRENT 地址清单_地址存在代码且版本一致',
  'CT-BASE-003': '主测市场_运行时市场元数据_Market、Token 与 Oracle 映射正确',
  'CT-BASE-004': 'Mock 市场_Token 类型与 decimals 运行时读取_不依赖 MOCK-BTC 或固定精度',
  'CT-BASE-005': '抵押品链路_全局、市场、Vault 与账户资产_Token 和精度一致',
  'CT-BASE-006': '开仓参数_杠杆、最低抵押、费用与容量_参数完整且边界自洽',
  'CT-BASE-007': 'Oracle 基线_市场价格与时间戳_价格有效、未过期且映射正确',
  'CT-BASE-008': '执行权限_Trader、Keeper 与配置角色_各角色只能执行授权动作',
  'XT-BASE-009': '前端接入_页面、SDK、Reader 与链上基线_使用同一环境和市场配置',
} as const;

export type CtBaseCaseId = keyof typeof CT_BASE_TITLES;

/** bigint → 十进制字符串；其余原样。 */
export function stringifyCaseEvidence(value: unknown): string {
  return `${JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'bigint' ? item.toString() : item, 2)}\n`;
}

/** 错误文本脱敏：RPC URL（含 viem 错误里的 `URL: https://…`）一律替换为 maskUrl 形式。 */
export function maskErrorText(text: string, runtime?: Pick<RuntimeConfig, 'rpcUrl' | 'adminRpcUrl'>): string {
  let masked = text;
  for (const url of [runtime?.rpcUrl, runtime?.adminRpcUrl]) {
    if (url) masked = masked.split(url).join(maskUrl(url));
  }
  return masked.replace(/https?:\/\/[^\s"'`)\]]+/g, (match) => {
    try {
      return maskUrl(match);
    } catch {
      return 'https://***';
    }
  });
}

function errorMessage(error: unknown, runtime?: Pick<RuntimeConfig, 'rpcUrl' | 'adminRpcUrl'>): string {
  const raw = error instanceof BaseError
    ? `${error.shortMessage}${error.details ? `（${error.details}）` : ''}`
    : error instanceof Error ? error.message : String(error);
  return maskErrorText(raw, runtime);
}

// ---------------------------------------------------------------------------
// FX100Keys / Role 派生（与 src/constants/FX100Keys.sol、Role.sol 逐条核对，2026-09-02 @release-v0.3.2）
// ---------------------------------------------------------------------------

/** 全局键：keccak256(abi.encode("NAME")) */
export function globalKey(name: string): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters('string'), [name]));
}

/** keccak256(abi.encode(base, marketIndex)) —— minCollateralFactorKey / isMarketDisabledKey / reserveFactorKey 等 */
export function marketKey(base: Hex, marketIndex: bigint): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters('bytes32, uint256'), [base, marketIndex]));
}

/** keccak256(abi.encode(base, marketIndex, bool)) —— minDynamicSpreadKey / maxDynamicSpreadKey / positionFeeFactorKey / maxOpenInterestKey */
export function marketBoolKey(base: Hex, marketIndex: bigint, flag: boolean): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters('bytes32, uint256, bool'), [base, marketIndex, flag]));
}

/** keccak256(abi.encode(base, token)) —— priceFeedKey / priceFeedMultiplierKey / priceFeedHeartbeatDurationKey / stablePriceKey */
export function tokenKey(base: Hex, token: string): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters('bytes32, address'), [base, getAddress(token)]));
}

/**
 * keccak256(abi.encode(ORACLE_PROVIDER_FOR_TOKEN, oracle, token)) —— Oracle.sol:275 实际使用的是双参形式
 * `oracleProviderForTokenKey(address(this), token)`；单参形式 `oracleProviderForTokenKey(token)` 在 v0.3.1/v0.3.2 均未被读取。
 */
export function oracleProviderForTokenKey(oracle: string, token: string): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters('bytes32, address, address'), [KEYS.ORACLE_PROVIDER_FOR_TOKEN, getAddress(oracle), getAddress(token)]));
}

export const KEYS = {
  COLLATERAL_TOKEN: globalKey('COLLATERAL_TOKEN'),
  IS_MARKET_DISABLED: globalKey('IS_MARKET_DISABLED'),
  MIN_DYNAMIC_SPREAD: globalKey('MIN_DYNAMIC_SPREAD'),
  MAX_DYNAMIC_SPREAD: globalKey('MAX_DYNAMIC_SPREAD'),
  MIN_COLLATERAL_FACTOR: globalKey('MIN_COLLATERAL_FACTOR'),
  MIN_COLLATERAL_USD: globalKey('MIN_COLLATERAL_USD'),
  MIN_POSITION_SIZE_USD: globalKey('MIN_POSITION_SIZE_USD'),
  MAX_POSITION_SIZE_USD: globalKey('MAX_POSITION_SIZE_USD'),
  POSITION_FEE_FACTOR: globalKey('POSITION_FEE_FACTOR'),
  MAX_OPEN_INTEREST: globalKey('MAX_OPEN_INTEREST'),
  MAX_OPEN_INTEREST_FACTOR: globalKey('MAX_OPEN_INTEREST_FACTOR'),
  RESERVE_FACTOR: globalKey('RESERVE_FACTOR'),
  ORACLE_PROVIDER_FOR_TOKEN: globalKey('ORACLE_PROVIDER_FOR_TOKEN'),
  PRICE_FEED: globalKey('PRICE_FEED'),
  PRICE_FEED_MULTIPLIER: globalKey('PRICE_FEED_MULTIPLIER'),
  PRICE_FEED_HEARTBEAT_DURATION: globalKey('PRICE_FEED_HEARTBEAT_DURATION'),
  MAX_ORACLE_PRICE_AGE: globalKey('MAX_ORACLE_PRICE_AGE'),
  IS_ORACLE_PROVIDER_ENABLED: globalKey('IS_ORACLE_PROVIDER_ENABLED'),
} as const;

/**
 * Config.sol:49 `onlyKeeper` 的 revert 字面量：`Unauthorized(msg.sender, "LIMITED / CONFIG KEEPER")`，
 * 字符串字面量转 bytes32 为右补零（Solidity 隐式转换），与 AccessStoreProxy._validateRole 抛的 role 哈希形式不同。
 */
export const LIMITED_OR_CONFIG_KEEPER_ROLE_ARG: Hex = stringToHex('LIMITED / CONFIG KEEPER', { size: 32 });

export const ROLES = {
  CONFIG_KEEPER: globalKey('CONFIG_KEEPER'),
  LIMITED_CONFIG_KEEPER: globalKey('LIMITED_CONFIG_KEEPER'),
  CONTROLLER: globalKey('CONTROLLER'),
  MARKET_KEEPER: globalKey('MARKET_KEEPER'),
  ORDER_KEEPER: globalKey('ORDER_KEEPER'),
  FROZEN_ORDER_KEEPER: globalKey('FROZEN_ORDER_KEEPER'),
  LIQUIDATION_KEEPER: globalKey('LIQUIDATION_KEEPER'),
  ADL_KEEPER: globalKey('ADL_KEEPER'),
} as const;

/** OpenZeppelin AccessControl DEFAULT_ADMIN_ROLE */
const DEFAULT_ADMIN_ROLE: Hex = `0x${'0'.repeat(64)}`;

/** EIP-1967 implementation slot */
const EIP1967_IMPLEMENTATION_SLOT: Hex = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

const FLOAT_PRECISION = 10n ** 30n;

// ---------------------------------------------------------------------------
// ABI
// ---------------------------------------------------------------------------

const dataStoreAbi = parseAbi([
  'function getUint(bytes32) view returns (uint256)',
  'function getInt(bytes32) view returns (int256)',
  'function getAddress(bytes32) view returns (address)',
  'function getBool(bytes32) view returns (bool)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function getRoleMemberCount(bytes32 role) view returns (uint256)',
  'function getRoleMember(bytes32 role, uint256 index) view returns (address)',
  'function grantRole(bytes32 role, address account)',
]);

const erc20Abi = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

const lpVaultAbi = parseAbi([
  'function asset() view returns (address)',
  'function totalAssets() view returns (uint256)',
]);

const configAbi = parseAbi([
  'function setInt(bytes32 baseKey, bytes data, int256 value)',
  'error Unauthorized(address msgSender, bytes32 role)',
  'error InvalidBaseKey(bytes32 baseKey)',
]);

/** OrderHandler.executeOrder(bytes32, OracleUtils.SetPricesParams)：修饰符顺序 globalNonReentrant → onlyOrderKeeper → withOraclePrices（OrderHandler.sol:259-263） */
const orderHandlerAbi = parseAbi([
  'function executeOrder(bytes32 key, (address[] tokens, address[] providers, bytes[] data) oracleParams)',
  'error Unauthorized(address msgSender, bytes32 role)',
]);

const chainlinkFeedAbi = parseAbi([
  'function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)',
  'function decimals() view returns (uint8)',
]);

const oracleAbi = parseAbi([
  'function latestRecordedPrices(address token) view returns (uint256 timestamp, (uint256 min, uint256 max) price)',
]);

// ---------------------------------------------------------------------------
// 公共上下文
// ---------------------------------------------------------------------------

interface CaseContext {
  readonly runtime: RuntimeConfig;
  readonly client: PublicClient;
  readonly manifest: DeploymentManifest;
  readonly projectRoot: string;
}

async function loadCaseContext(runtime: RuntimeConfig, projectRoot: string): Promise<CaseContext> {
  const manifest = await loadDeploymentManifest(runtime.deploymentManifestPath);
  const client = createPublicClient({ transport: http(runtime.rpcUrl, { timeout: runtime.requestTimeoutMs }) });
  return { runtime, client, manifest, projectRoot };
}

function sameAddress(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  try {
    return getAddress(a) === getAddress(b);
  } catch {
    return false;
  }
}

function check(name: string, passed: boolean, actual: unknown, expected: unknown, note?: string): CaseCheck {
  return { name, passed, actual, expected, ...(note ? { note } : {}) };
}

/** 夹具 / 前置不可用：不是缺陷，但绝不宣称已执行。 */
function notExercised(name: string, reason: string): CaseCheck {
  return { name, passed: true, actual: 'NOT_EXERCISED', expected: 'NOT_EXERCISED', note: `未执行：${reason}` };
}

/**
 * 每个用例的统一包装：把传输层不可达（RPC 超时 / 连接拒绝 / HTTP 错误）转为 blocked，
 * 其它异常（如 ABI 解码失败）也记 blocked——只读基线用例没有"抛异常就是 FAIL"的语义，
 * 真实偏差只以 checks[].passed=false 表达。
 */
async function runCase(
  id: CtBaseCaseId,
  runtime: RuntimeConfig,
  body: (context: CaseContext, checks: CaseCheck[], data: Record<string, unknown>) => Promise<void>,
  projectRoot: string,
): Promise<CaseEvidence> {
  const checks: CaseCheck[] = [];
  const data: Record<string, unknown> = {
    environment: runtime.environment,
    rpc: maskUrl(runtime.rpcUrl),
    deploymentId: runtime.deploymentId,
    deploymentRelease: runtime.deploymentRelease,
    manifestName: runtime.deploymentManifestName,
  };
  try {
    const context = await loadCaseContext(runtime, projectRoot);
    await body(context, checks, data);
    return { id, title: CT_BASE_TITLES[id], checks, data };
  } catch (error) {
    return {
      id,
      title: CT_BASE_TITLES[id],
      checks,
      data,
      blocked: `BLOCKED：${errorMessage(error, runtime)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// CT-BASE-001 环境身份
// ---------------------------------------------------------------------------

export async function runCtBase001(runtime: RuntimeConfig, projectRoot: string = process.cwd()): Promise<CaseEvidence> {
  return runCase('CT-BASE-001', runtime, async ({ client, manifest }, checks, data) => {
    const startedAt = performance.now();
    const chainId = await client.getChainId();
    const roundTripMs = Math.round((performance.now() - startedAt) * 100) / 100;
    const block = await client.getBlock();
    const registry = loadBaselineRegistry(projectRoot, { reload: true });
    const baselineEnvironment = registry?.environments[runtime.environment];
    const environmentRelease = resolveEnvironmentRelease(runtime.environment, projectRoot);
    const target = targetRelease(projectRoot);
    const forkBlockNumber = BigInt(manifest.forkBlockNumber);

    Object.assign(data, {
      rpcRoundTripMs: roundTripMs,
      rpcChainId: chainId,
      runtimeChainId: runtime.chainId,
      manifestChainId: manifest.chainId,
      manifestRelease: manifest.release,
      manifestForkBlockNumber: forkBlockNumber,
      latestBlock: { number: block.number, hash: block.hash, timestamp: block.timestamp },
      current: {
        environment: baselineEnvironment ?? null,
        environmentRelease: environmentRelease ?? null,
        targetRelease: target ?? null,
        admissionScope: (registry?.primary as { admissionScope?: unknown } | undefined)?.admissionScope ?? null,
      },
    });

    checks.push(check('RPC eth_chainId == runtime.chainId', chainId === runtime.chainId, chainId, runtime.chainId));
    checks.push(check(
      'runtime.chainId == CURRENT environments[env].chainId',
      typeof baselineEnvironment?.chainId === 'number' && baselineEnvironment.chainId === runtime.chainId,
      baselineEnvironment?.chainId ?? '（CURRENT.json 未登记该环境）',
      runtime.chainId,
    ));
    checks.push(check(
      'manifest.chainId == RPC eth_chainId（绑定 manifest 为本环境原生部署）',
      manifest.chainId === chainId,
      manifest.chainId,
      chainId,
      manifest.chainId === chainId
        ? undefined
        : 'manifest 记录的是被 fork 的原部署链（继承部署），不是在本环境上完成的部署；目标版本要求 tx-fork 原生部署 v0.3.2',
    ));
    checks.push(check(
      'latest block 可读且 > manifest.forkBlockNumber',
      block.number > forkBlockNumber,
      block.number,
      `> ${forkBlockNumber}`,
    ));
    checks.push(check(
      'CURRENT environments[env].forkOf → deployments[].releaseLabel == targetRelease().label',
      Boolean(environmentRelease && target && environmentRelease.label === target.label),
      environmentRelease?.label ?? '（无法解析：forkOf 为空或 deployments[] 未登记）',
      target?.label ?? '（CURRENT.json 缺失 primary）',
      environmentRelease && target && environmentRelease.label !== target.label
        ? `环境基线 ≠ 目标基线：${runtime.environment} forkOf=${environmentRelease.deploymentId}，本环境不充当目标版本回归材料（矩阵 A 节暂停规则）`
        : undefined,
    ));
    checks.push(check(
      'runtime deploymentRelease 与目标版本一致',
      Boolean(target && runtime.deploymentRelease === target.version),
      runtime.deploymentRelease,
      target?.version ?? '（CURRENT.json 缺失 primary）',
    ));

    try {
      await assertRuntimeEnvironmentBinding(runtime, projectRoot);
      checks.push(check('assertRuntimeEnvironmentBinding（RPC 链 + 关键合约 bytecode 与绑定一致）', true, 'ok', 'ok'));
    } catch (error) {
      checks.push(check(
        'assertRuntimeEnvironmentBinding（RPC 链 + 关键合约 bytecode 与绑定一致）',
        false,
        errorMessage(error, runtime),
        'ok',
      ));
    }
  }, projectRoot);
}

// ---------------------------------------------------------------------------
// CT-BASE-002 核心合约
// ---------------------------------------------------------------------------

/** 这些名字在 fx100 部署里是 ERC1967 代理（DataStoreProxy / LPVaultProxy / *TreasuryProxy）；产物比对取 EIP-1967 implementation 的 code。 */
const PROXY_CONTRACT_NAMES = new Set(['dataStore', 'roleStore', 'lpVault', 'protocolTreasury', 'insuranceTreasury']);

/**
 * manifest 合约名 → 编译产物合约名候选（按 artifacts/src 实际产物名登记，2026-09-02 @release-v0.3.2）。
 * 多候选时所有存在的产物都参与比对，任一长度相等即通过（note 标明命中者）；全部候选都无产物文件记 NOT_EXERCISED。
 * roleStore 与 dataStore 在 v0.3.2 是同一地址（DataStore 兼任 RoleStore）；insuranceTreasury 无同名产物，ProtocolTreasury 为同源候选。
 */
const ARTIFACT_CANDIDATES: Readonly<Record<string, readonly string[]>> = {
  exchangeRouter: ['ExchangeRouter'],
  reader: ['Reader'],
  dataStore: ['DataStore'],
  roleStore: ['RoleStore', 'DataStore'],
  config: ['Config'],
  oracle: ['Oracle'],
  orderHandler: ['OrderHandler'],
  liquidationHandler: ['LiquidationHandler'],
  adlHandler: ['AdlHandler'],
  eventEmitter: ['EventEmitter'],
  positionVault: ['PositionVault'],
  router: ['Router'],
  orderVault: ['OrderVault'],
  lpVault: ['LPVault'],
  referralStorage: ['ReferralStorage'],
  externalHandler: ['ExternalHandler'],
  mockUsdc: ['MockToken', 'MockERC20PermitV2'],
  mockUsdcOracle: ['MockChainlinkOracle'],
  mockBtcOracle: ['MockChainlinkOracle'],
  mockEthOracle: ['MockChainlinkOracle'],
  keeperReader: ['KeeperReader'],
  marketFactory: ['MarketFactory'],
  chainlinkPriceFeedProvider: ['ChainlinkPriceFeedProvider'],
  chainlinkDataStreamProvider: ['ChainlinkDataStreamProvider'],
  pythPriceFeedProvider: ['PythPriceFeedProvider'],
  subaccountRouter: ['SubaccountRouter'],
  relayRouter: ['RelayRouter'],
  subaccountRelayRouter: ['SubaccountRelayRouter'],
  increaseOrderExecutor: ['IncreaseOrderExecutor'],
  decreaseOrderExecutor: ['DecreaseOrderExecutor'],
  feeHandler: ['FeeHandler'],
  protocolTreasury: ['ProtocolTreasury'],
  insuranceTreasury: ['InsuranceTreasury', 'ProtocolTreasury'],
  revenuePool: ['RevenuePool'],
  autoCancelSyncer: ['AutoCancelSyncer'],
  configSyncer: ['ConfigSyncer'],
  wnt: ['MockWNT', 'WNT'],
};

/** OP-stack 预部署地址段 0x4200000000000000000000000000000000000000 ～ 0x42000000000000000000000000000000000008ff（Base 系链继承）。 */
function isOpStackPredeploy(address: string): boolean {
  try {
    const value = BigInt(getAddress(address));
    const base = BigInt('0x4200000000000000000000000000000000000000');
    return value >= base && value <= base + 0x8ffn;
  } catch {
    return false;
  }
}

/** 产物文件不存在 → undefined（其它异常照抛：JSON 损坏等属真实问题）。 */
async function tryLoadArtifactBytecode(artifactDirectory: string, name: string): Promise<{ path: string; deployed: Hex | undefined } | undefined> {
  try {
    const artifact = await loadContractArtifact(artifactDirectory, name);
    return { path: artifact.path, deployed: await readDeployedBytecode(artifact.path) };
  } catch (error) {
    if (error instanceof Error && error.message.includes('找不到')) return undefined;
    throw error;
  }
}

async function readDeployedBytecode(artifactPath: string): Promise<Hex | undefined> {
  const parsed = JSON.parse(await readFile(artifactPath, 'utf8')) as { deployedBytecode?: unknown };
  const raw = typeof parsed.deployedBytecode === 'string'
    ? parsed.deployedBytecode
    : parsed.deployedBytecode && typeof parsed.deployedBytecode === 'object'
      && typeof (parsed.deployedBytecode as { object?: unknown }).object === 'string'
      ? (parsed.deployedBytecode as { object: string }).object
      : undefined;
  if (!raw) return undefined;
  return (raw.startsWith('0x') ? raw : `0x${raw}`) as Hex;
}

function byteLength(code: Hex): number {
  return (code.length - 2) / 2;
}

export async function runCtBase002(runtime: RuntimeConfig, projectRoot: string = process.cwd()): Promise<CaseEvidence> {
  return runCase('CT-BASE-002', runtime, async ({ client, manifest }, checks, data) => {
    const entries = [
      ...Object.entries(manifest.contracts).map(([name, address]) => ({ scope: 'contracts', name, address })),
      ...Object.entries(manifest.additionalContracts).map(([name, address]) => ({ scope: 'additionalContracts', name, address })),
    ];
    const codeRecords: Record<string, unknown> = {};
    /** 参与产物比对的 code：普通合约取自身 code，代理取 implementation code */
    const compareCode = new Map<string, { readonly code: Hex | undefined; readonly source: string }>();
    for (const entry of entries) {
      const label = `${entry.scope}.${entry.name}`;
      if (sameAddress(entry.address, zeroAddress)) {
        checks.push(check(`${label} 非零地址`, false, entry.address, '非零地址'));
        continue;
      }
      const code = await client.getCode({ address: getAddress(entry.address) });
      const hasCode = Boolean(code && code !== '0x');
      const record: Record<string, unknown> = {
        address: getAddress(entry.address),
        codeLength: hasCode && code ? byteLength(code) : 0,
        codeHash: hasCode && code ? keccak256(code) : null,
      };
      checks.push(check(`${label} eth_getCode 非空`, hasCode, record.codeLength, '> 0'));
      if (PROXY_CONTRACT_NAMES.has(entry.name)) {
        const slot = await client.getStorageAt({ address: getAddress(entry.address), slot: EIP1967_IMPLEMENTATION_SLOT });
        const implementation = slot ? getAddress(`0x${slot.slice(-40)}`) : zeroAddress;
        record.eip1967Implementation = implementation;
        const implementationCode = implementation !== zeroAddress
          ? await client.getCode({ address: implementation })
          : undefined;
        record.implementationCodeLength = implementationCode && implementationCode !== '0x' ? byteLength(implementationCode) : 0;
        checks.push(check(
          `${label} EIP-1967 implementation 非零且有代码`,
          implementation !== zeroAddress && Boolean(implementationCode && implementationCode !== '0x'),
          { implementation, implementationCodeLength: record.implementationCodeLength },
          '非零地址且 eth_getCode 非空',
        ));
        compareCode.set(label, { code: implementationCode, source: `EIP-1967 implementation ${implementation}` });
      } else {
        compareCode.set(label, { code: hasCode ? code : undefined, source: 'eth_getCode(self)' });
      }
      codeRecords[label] = record;
    }
    data.contracts = codeRecords;

    // 编译产物比对：artifactDirectory 来自 config/environment-bindings.json（与绑定 commit 对应的 Foundry out / Hardhat artifacts）。
    // 覆盖 manifest 全部 contracts + additionalContracts；无产物文件记 NOT_EXERCISED（不静默跳过）。
    const binding = loadEnvironmentBinding(projectRoot, runtime.environment);
    data.artifactDirectory = binding.binding.artifactDirectory;
    data.bindingContractCommit = binding.binding.contractCommit;
    const artifactRecords: Record<string, unknown> = {};
    for (const entry of entries) {
      const label = `${entry.scope}.${entry.name}`;
      const candidates = ARTIFACT_CANDIDATES[entry.name];
      const checkName = `${label} 链上 code 长度 == 编译 deployedBytecode 长度`;
      if (!candidates) {
        checks.push(notExercised(checkName, `${entry.name} 未登记产物候选名（ARTIFACT_CANDIDATES），无法定位编译产物`));
        continue;
      }
      const target = compareCode.get(label);
      if (!target) continue; // 零地址已在上面记 FAIL
      if (isOpStackPredeploy(entry.address)) {
        // 0x4200…0000～0x4200…08ff 是 OP-stack 链级预部署（Base Sepolia WETH9 = 0x4200…0006），不是 fx100 部署产物，无可比对的编译 artifact
        checks.push(notExercised(checkName, `${getAddress(entry.address)} 为 OP-stack 链级预部署合约（fork 自 Base Sepolia），非 fx100 编译产物，不做产物比对`));
        artifactRecords[label] = { candidates, status: 'NOT_EXERCISED', reason: 'op-stack-predeploy', onChainLength: target.code ? byteLength(target.code) : 0 };
        continue;
      }
      try {
        const found: Array<{ name: string; path: string; deployed: Hex | undefined }> = [];
        for (const name of candidates) {
          const artifact = await tryLoadArtifactBytecode(binding.artifactDirectory, name);
          if (artifact) found.push({ name, ...artifact });
        }
        if (found.length === 0) {
          checks.push(notExercised(checkName, `产物目录无候选文件 ${candidates.join(' / ')}.json`));
          artifactRecords[label] = { candidates, status: 'NOT_EXERCISED' };
          continue;
        }
        const onChain = target.code;
        const onChainLength = onChain && onChain !== '0x' ? byteLength(onChain) : 0;
        const onChainHash = onChain && onChain !== '0x' ? keccak256(onChain) : null;
        const comparisons = found.map((item) => {
          const artifactLength = item.deployed ? byteLength(item.deployed) : null;
          return {
            artifact: item.name,
            artifactPath: item.path.replace(projectRoot, '.'),
            artifactLength,
            artifactCodeHash: item.deployed ? keccak256(item.deployed) : null,
            lengthEqual: artifactLength !== null && artifactLength === onChainLength,
            fullCodeHashEqual: Boolean(item.deployed && onChainHash && keccak256(item.deployed) === onChainHash),
          };
        });
        const matched = comparisons.find((item) => item.lengthEqual);
        artifactRecords[label] = { codeSource: target.source, onChainLength, onChainCodeHash: onChainHash, comparisons };
        const missingBytecode = comparisons.every((item) => item.artifactLength === null);
        checks.push(check(
          checkName,
          onChainLength > 0 && matched !== undefined,
          onChainLength,
          comparisons.map((item) => `${item.artifact}=${item.artifactLength ?? '（缺 deployedBytecode）'}`).join(' | '),
          missingBytecode
            ? 'artifact 缺少 deployedBytecode'
            : matched
              ? `命中 ${matched.artifact}（${target.source}）${matched.fullCodeHashEqual ? '，整段 code hash 亦相等' : '，整段 code hash 不等（immutables / 元数据差异属预期，仅记录）'}`
              : `长度差 ${comparisons.map((item) => `${item.artifact}:${item.artifactLength === null ? '?' : onChainLength - item.artifactLength}`).join(' ')} 字节（${target.source}）：immutables 不改长度，说明绑定 artifactDirectory 不是该部署实际使用的编译产物（编译设置或源码不同）`,
        ));
      } catch (error) {
        checks.push(check(checkName, false, errorMessage(error, runtime), '相等'));
      }
    }
    data.artifacts = artifactRecords;
  }, projectRoot);
}

// ---------------------------------------------------------------------------
// CT-BASE-003 市场元数据
// ---------------------------------------------------------------------------

interface MarketProps {
  readonly marketIndex: bigint;
  readonly vault: `0x${string}`;
  readonly indexToken: `0x${string}`;
  readonly collateralToken: `0x${string}`;
}

async function readMarket(context: CaseContext, readerAbi: Abi, marketIndex: bigint): Promise<MarketProps> {
  const result = await context.client.readContract({
    address: getAddress(context.manifest.contracts.reader),
    abi: readerAbi,
    functionName: 'getMarket',
    args: [getAddress(context.manifest.contracts.dataStore), marketIndex],
  }) as MarketProps;
  return result;
}

function manifestCollateralToken(manifest: DeploymentManifest): { address: string; source: string } {
  const mockUsdc = manifest.additionalContracts.mockUsdc;
  if (mockUsdc) return { address: mockUsdc, source: 'manifest.additionalContracts.mockUsdc' };
  const first = manifest.markets[0];
  return { address: first?.collateralToken ?? zeroAddress, source: 'manifest.markets[0].collateralToken（无 mockUsdc 登记）' };
}

export async function runCtBase003(runtime: RuntimeConfig, projectRoot: string = process.cwd()): Promise<CaseEvidence> {
  return runCase('CT-BASE-003', runtime, async (context, checks, data) => {
    const { client, manifest } = context;
    const readerAbi = await loadDeploymentAbi(manifest, 'Reader', projectRoot);
    const dataStore = getAddress(manifest.contracts.dataStore);
    const markets: Record<string, unknown> = {};
    for (const market of manifest.markets) {
      const marketIndex = BigInt(market.marketIndex);
      const onChain = await readMarket(context, readerAbi, marketIndex);
      const disabled = await client.readContract({
        address: dataStore,
        abi: dataStoreAbi,
        functionName: 'getBool',
        args: [marketKey(KEYS.IS_MARKET_DISABLED, marketIndex)],
      });
      markets[market.symbol] = { manifest: market, reader: onChain, isMarketDisabled: disabled };
      const label = `market[${market.marketIndex}] ${market.symbol}`;
      checks.push(check(`${label} Reader.getMarket.marketIndex == manifest`, onChain.marketIndex === marketIndex, onChain.marketIndex, marketIndex));
      checks.push(check(`${label} Reader.getMarket.indexToken == manifest`, sameAddress(onChain.indexToken, market.indexToken), onChain.indexToken, getAddress(market.indexToken)));
      checks.push(check(`${label} Reader.getMarket.vault == manifest`, sameAddress(onChain.vault, market.vault), onChain.vault, getAddress(market.vault)));
      checks.push(check(`${label} Reader.getMarket.collateralToken == manifest`, sameAddress(onChain.collateralToken, market.collateralToken), onChain.collateralToken, getAddress(market.collateralToken)));
      checks.push(check(`${label} 必填地址非零`, ![onChain.indexToken, onChain.vault, onChain.collateralToken].some((item) => sameAddress(item, zeroAddress)), { indexToken: onChain.indexToken, vault: onChain.vault, collateralToken: onChain.collateralToken }, '均非零'));
      checks.push(check(`${label} IS_MARKET_DISABLED == false`, disabled === false, disabled, false));
    }
    data.markets = markets;

    const collateral = manifestCollateralToken(manifest);
    const globalCollateral = await client.readContract({ address: dataStore, abi: dataStoreAbi, functionName: 'getAddress', args: [KEYS.COLLATERAL_TOKEN] });
    data.globalCollateralToken = { onChain: globalCollateral, manifest: getAddress(collateral.address), source: collateral.source };
    checks.push(check(
      'DataStore COLLATERAL_TOKEN == manifest 抵押品',
      sameAddress(globalCollateral, collateral.address),
      globalCollateral,
      getAddress(collateral.address),
      sameAddress(globalCollateral, zeroAddress)
        ? `${collateral.source}；链上为零：COLLATERAL_TOKEN 是 v0.3.2 新增全局键（v0.3.1 FX100Keys.sol 无此键），零值说明部署不是 v0.3.2 或未初始化`
        : collateral.source,
    ));

    const indexTokens = manifest.markets.map((market) => getAddress(market.indexToken));
    const duplicates = indexTokens.filter((token, index) => indexTokens.indexOf(token) !== index);
    checks.push(check('无两个市场共用同一 indexToken', duplicates.length === 0, duplicates, []));
    const indexes = manifest.markets.map((market) => market.marketIndex);
    checks.push(check('无两个市场共用同一 marketIndex', new Set(indexes).size === indexes.length, indexes, '互不相同'));
  }, projectRoot);
}

// ---------------------------------------------------------------------------
// CT-BASE-004 Token 精度
// ---------------------------------------------------------------------------

export async function runCtBase004(runtime: RuntimeConfig, projectRoot: string = process.cwd()): Promise<CaseEvidence> {
  return runCase('CT-BASE-004', runtime, async ({ client, manifest }, checks, data) => {
    const dataStore = getAddress(manifest.contracts.dataStore);
    const tokens: Record<string, unknown> = {};
    for (const market of manifest.markets) {
      const address = getAddress(market.indexToken);
      const label = `market[${market.marketIndex}] indexToken`;
      const code = await client.getCode({ address });
      const hasCode = Boolean(code && code !== '0x');
      let symbol: string | undefined;
      let name: string | undefined;
      let erc20Decimals: number | undefined;
      if (hasCode) {
        try {
          [symbol, erc20Decimals] = await Promise.all([
            client.readContract({ address, abi: erc20Abi, functionName: 'symbol' }),
            client.readContract({ address, abi: erc20Abi, functionName: 'decimals' }),
          ]);
          try {
            name = await client.readContract({ address, abi: erc20Abi, functionName: 'name' });
          } catch {
            name = undefined;
          }
          checks.push(check(`${label} ERC20 symbol()/decimals() 可读`, true, { symbol, decimals: erc20Decimals }, '可读'));
        } catch (error) {
          checks.push(check(`${label} ERC20 symbol()/decimals() 可读`, false, errorMessage(error, runtime), '可读'));
        }
      } else {
        checks.push(notExercised(
          `${label} ERC20 symbol()/decimals() 可读`,
          `${address} 无合约代码（synthetic=${market.synthetic} 的占位地址），ERC20 接口不存在；精度改由 PRICE_FEED_MULTIPLIER 反推`,
        ));
      }

      // 第二来源：PRICE_FEED_MULTIPLIER = 10^(60 − feedDecimals − tokenDecimals)（FX100Keys.sol 注释），feed 与 multiplier 都在链上时可反推 tokenDecimals
      let multiplierDecimals: number | undefined;
      let multiplierNote: string | undefined;
      try {
        const [multiplier, feed] = await Promise.all([
          client.readContract({ address: dataStore, abi: dataStoreAbi, functionName: 'getUint', args: [tokenKey(KEYS.PRICE_FEED_MULTIPLIER, address)] }),
          client.readContract({ address: dataStore, abi: dataStoreAbi, functionName: 'getAddress', args: [tokenKey(KEYS.PRICE_FEED, address)] }),
        ]);
        if (multiplier > 0n && !sameAddress(feed, zeroAddress)) {
          const feedDecimals = await client.readContract({ address: getAddress(feed), abi: chainlinkFeedAbi, functionName: 'decimals' });
          const exponent = multiplier.toString().length - 1;
          if (10n ** BigInt(exponent) === multiplier) {
            multiplierDecimals = 60 - feedDecimals - exponent;
            multiplierNote = `PRICE_FEED_MULTIPLIER=1e${exponent}，feedDecimals=${feedDecimals} → tokenDecimals=${multiplierDecimals}`;
          } else {
            multiplierNote = `PRICE_FEED_MULTIPLIER=${multiplier} 非 10 的幂，无法反推`;
          }
        } else {
          multiplierNote = 'PRICE_FEED_MULTIPLIER 或 PRICE_FEED 未配置，无法反推';
        }
      } catch (error) {
        multiplierNote = `反推失败：${errorMessage(error, runtime)}`;
      }

      const decimals = erc20Decimals ?? multiplierDecimals;
      checks.push(check(
        `${label} 运行时 decimals（ERC20.decimals() 或 PRICE_FEED_MULTIPLIER 反推）== manifest.indexTokenDecimals`,
        decimals !== undefined && decimals === market.indexTokenDecimals
          && (erc20Decimals === undefined || multiplierDecimals === undefined || erc20Decimals === multiplierDecimals),
        { erc20: erc20Decimals ?? null, fromMultiplier: multiplierDecimals ?? null },
        market.indexTokenDecimals,
        decimals === undefined ? `链上无任何 decimals 来源；${multiplierNote ?? ''}` : multiplierNote,
      ));
      if (decimals === undefined) {
        tokens[market.symbol] = { address, hasCode, symbol: symbol ?? null, name: name ?? null, decimals: null, manifestDecimals: market.indexTokenDecimals, synthetic: market.synthetic, multiplierNote };
        continue;
      }

      // 精度互转：1 token 与 1 最小原始单位各做一次往返，均须无损（decimals 按运行时值，不假设 8/18）
      const oneTokenRaw = parseUnits('1', decimals);
      const oneTokenBack = formatUnits(oneTokenRaw, decimals);
      const oneUnitDisplay = formatUnits(1n, decimals);
      const oneUnitBack = parseUnits(oneUnitDisplay, decimals);
      tokens[market.symbol] = {
        address,
        hasCode,
        symbol: symbol ?? null,
        name: name ?? null,
        decimals,
        decimalsSource: erc20Decimals !== undefined ? 'ERC20.decimals()' : 'PRICE_FEED_MULTIPLIER 反推',
        manifestDecimals: market.indexTokenDecimals,
        synthetic: market.synthetic,
        multiplierNote: multiplierNote ?? null,
        oneToken: { raw: oneTokenRaw, display: oneTokenBack },
        oneUnit: { raw: 1n, display: oneUnitDisplay, back: oneUnitBack },
      };
      checks.push(check(`${label} 1 token 往返无损`, oneTokenBack === '1' && oneTokenRaw === 10n ** BigInt(decimals), { raw: oneTokenRaw, display: oneTokenBack }, { raw: 10n ** BigInt(decimals), display: '1' }));
      checks.push(check(`${label} 1 最小原始单位往返无损`, oneUnitBack === 1n, { display: oneUnitDisplay, back: oneUnitBack }, { back: 1n }));
    }
    data.tokens = tokens;
    data.note = '资产名称与精度均为运行时读取，不断言 symbol 为 BTC/ETH，也不假设 8/18 位';
  }, projectRoot);
}

// ---------------------------------------------------------------------------
// CT-BASE-005 抵押品链路
// ---------------------------------------------------------------------------

export async function runCtBase005(runtime: RuntimeConfig, projectRoot: string = process.cwd()): Promise<CaseEvidence> {
  return runCase('CT-BASE-005', runtime, async (context, checks, data) => {
    const { client, manifest } = context;
    const dataStore = getAddress(manifest.contracts.dataStore);
    const collateral = manifestCollateralToken(manifest);
    const globalCollateral = await client.readContract({ address: dataStore, abi: dataStoreAbi, functionName: 'getAddress', args: [KEYS.COLLATERAL_TOKEN] });
    const expectedCollateral = getAddress(collateral.address);
    checks.push(check(
      'DataStore COLLATERAL_TOKEN == manifest 抵押品',
      sameAddress(globalCollateral, expectedCollateral),
      globalCollateral,
      expectedCollateral,
      sameAddress(globalCollateral, zeroAddress)
        ? `${collateral.source}；链上为零：COLLATERAL_TOKEN 是 v0.3.2 新增全局键（v0.3.1 无此键），零值说明部署不是 v0.3.2 或未初始化`
        : collateral.source,
    ));
    // 后续 token 读数以链上全局键为准；全局键为零（v0.3.1 无 COLLATERAL_TOKEN 键 / 未初始化）时退回 manifest 地址并注明
    const globalIsSet = !sameAddress(globalCollateral, zeroAddress);
    const token = globalIsSet ? getAddress(globalCollateral) : expectedCollateral;
    const tokenSource = globalIsSet ? 'DataStore COLLATERAL_TOKEN' : `manifest（链上 COLLATERAL_TOKEN 为零地址，退回 ${collateral.source}）`;

    // Vault：manifest.additionalContracts.lpVault 优先；缺省时用 Reader.getMarket(markets[0]).vault
    let vault: `0x${string}`;
    let vaultSource: string;
    if (manifest.additionalContracts.lpVault) {
      vault = getAddress(manifest.additionalContracts.lpVault);
      vaultSource = 'manifest.additionalContracts.lpVault';
    } else {
      const readerAbi = await loadDeploymentAbi(manifest, 'Reader', projectRoot);
      const first = manifest.markets[0];
      if (!first) throw new Error('manifest.markets 为空');
      vault = getAddress((await readMarket(context, readerAbi, BigInt(first.marketIndex))).vault);
      vaultSource = `Reader.getMarket(${first.marketIndex}).vault`;
    }
    const [vaultAsset, vaultTotalAssets] = await Promise.all([
      client.readContract({ address: vault, abi: lpVaultAbi, functionName: 'asset' }),
      client.readContract({ address: vault, abi: lpVaultAbi, functionName: 'totalAssets' }),
    ]);
    checks.push(check('LPVault.asset() == manifest 抵押品', sameAddress(vaultAsset, expectedCollateral), vaultAsset, expectedCollateral, vaultSource));
    for (const market of manifest.markets) {
      checks.push(check(`market[${market.marketIndex}] collateralToken == manifest 抵押品`, sameAddress(market.collateralToken, expectedCollateral), getAddress(market.collateralToken), expectedCollateral));
    }

    const [symbol, decimals] = await Promise.all([
      client.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' }),
      client.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
    ]);
    for (const market of manifest.markets) {
      checks.push(check(`market[${market.marketIndex}] manifest.collateralTokenDecimals == 抵押品 decimals()`, market.collateralTokenDecimals === decimals, market.collateralTokenDecimals, decimals));
    }
    let vaultDecimals: number | undefined;
    try {
      vaultDecimals = await client.readContract({ address: vault, abi: erc20Abi, functionName: 'decimals' });
    } catch {
      vaultDecimals = undefined;
    }

    // 派生资金下限：最小可开仓位 = MIN_POSITION_SIZE_USD 在 L_max = 1e30 / MIN_COLLATERAL_FACTOR 下所需抵押
    //   collateralForLeverageUsd = applyFactor(MIN_POSITION_SIZE_USD, MIN_COLLATERAL_FACTOR)（PositionUtils.sol:397-398 minCollateralUsdForLeverage）
    //   且 ≥ MIN_COLLATERAL_USD（PositionUtils.sol:401-402）；再加一笔开仓手续费
    //   feeUsd = applyFactor(MIN_POSITION_SIZE_USD, POSITION_FEE_FACTOR)（PositionPricingUtils.sol:475，取 improved/worsened 中较大者）
    //   → 抵押品原始单位 = ceil(totalUsd / collateralPrice)，collateralPrice 取 DataStore STABLE_PRICE(token)，未配置时按 $1 = 1e30 / 10^decimals
    //   多市场取各市场下限的最大值。
    const getUint = (key: Hex) => client.readContract({ address: dataStore, abi: dataStoreAbi, functionName: 'getUint', args: [key] });
    const [minPositionSizeUsd, minCollateralUsd, stablePrice] = await Promise.all([
      getUint(KEYS.MIN_POSITION_SIZE_USD),
      getUint(KEYS.MIN_COLLATERAL_USD),
      readStablePrice(runtime.rpcUrl, dataStore, token, runtime.requestTimeoutMs),
    ]);
    const collateralPrice = stablePrice > 0n ? stablePrice : FLOAT_PRECISION / 10n ** BigInt(decimals);
    const ceilDiv = (numerator: bigint, denominator: bigint) => (numerator + denominator - 1n) / denominator;
    const maxBig = (a: bigint, b: bigint) => (a > b ? a : b);
    let floorRaw = 0n;
    let floorMarket: string | null = null;
    const floorByMarket: Record<string, unknown> = {};
    for (const market of manifest.markets) {
      const marketIndex = BigInt(market.marketIndex);
      const [minCollateralFactor, feeImproved, feeWorsened] = await Promise.all([
        getUint(marketKey(KEYS.MIN_COLLATERAL_FACTOR, marketIndex)),
        getUint(marketBoolKey(KEYS.POSITION_FEE_FACTOR, marketIndex, true)),
        getUint(marketBoolKey(KEYS.POSITION_FEE_FACTOR, marketIndex, false)),
      ]);
      const collateralForLeverageUsd = (minPositionSizeUsd * minCollateralFactor) / FLOAT_PRECISION;
      const collateralUsd = maxBig(collateralForLeverageUsd, minCollateralUsd);
      const feeFactor = maxBig(feeImproved, feeWorsened);
      const feeUsd = (minPositionSizeUsd * feeFactor) / FLOAT_PRECISION;
      const totalUsd = collateralUsd + feeUsd;
      const raw = ceilDiv(totalUsd, collateralPrice);
      floorByMarket[market.symbol] = {
        marketIndex,
        MIN_COLLATERAL_FACTOR: minCollateralFactor,
        lMax: minCollateralFactor > 0n ? FLOAT_PRECISION / minCollateralFactor : null,
        POSITION_FEE_FACTOR: { improved: feeImproved, worsened: feeWorsened, used: feeFactor },
        collateralForLeverageUsd,
        collateralUsd,
        feeUsd,
        totalUsd,
        floorRaw: raw,
        floorDisplay: formatUnits(raw, decimals),
      };
      if (raw > floorRaw) {
        floorRaw = raw;
        floorMarket = market.symbol;
      }
    }
    const floorDerivation = {
      formula: 'floorRaw = ceil((max(MIN_POSITION_SIZE_USD × MIN_COLLATERAL_FACTOR / 1e30, MIN_COLLATERAL_USD) + MIN_POSITION_SIZE_USD × max(POSITION_FEE_FACTOR) / 1e30) / collateralPrice)，多市场取最大',
      sources: 'PositionUtils.sol:297-299 MinPositionSize · :397-402 minCollateralUsdForLeverage/MIN_COLLATERAL_USD · PositionPricingUtils.sol:474-475 positionFeeAmount',
      MIN_POSITION_SIZE_USD: minPositionSizeUsd,
      MIN_COLLATERAL_USD: minCollateralUsd,
      STABLE_PRICE: stablePrice,
      collateralPrice,
      collateralPriceSource: stablePrice > 0n ? 'DataStore STABLE_PRICE(token)' : `未配置 STABLE_PRICE，按 $1 = 1e30 / 10^${decimals}`,
      byMarket: floorByMarket,
      floorRaw,
      floorDisplay: formatUnits(floorRaw, decimals),
      floorMarket,
    };

    // 探针账户：runtime.testAccount（applyCaseTrader 后为 T100，未启用 per-case 时为默认 trader）
    const probe = runtime.testAccount;
    const router = manifest.additionalContracts.router;
    const probeRecord: Record<string, unknown> = { address: probe ?? null, router: router ? getAddress(router) : null };
    const floorNote = floorRaw === 0n
      ? '派生下限为 0（MIN_POSITION_SIZE_USD / MIN_COLLATERAL_FACTOR / MIN_COLLATERAL_USD 均未配置），≥ 0 为空断言，判 FAIL'
      : `下限 ${formatUnits(floorRaw, decimals)} ${symbol}（${floorMarket}），见 data.floorDerivation`;
    if (!probe) {
      checks.push(check('探针账户 抵押品余额 ≥ 派生下限', false, '（runtime.testAccount 未配置）', `≥ ${floorRaw}`, floorNote));
      checks.push(check('探针账户 allowance(Router) ≥ 派生下限', false, '（runtime.testAccount 未配置）', `≥ ${floorRaw}`, floorNote));
    } else {
      const balance = await client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [getAddress(probe)] });
      const nativeBalance = await client.getBalance({ address: getAddress(probe) });
      probeRecord.usdcBalance = balance;
      probeRecord.usdcBalanceDisplay = formatUnits(balance, decimals);
      probeRecord.nativeBalanceWei = nativeBalance;
      checks.push(check('探针账户 抵押品余额 ≥ 派生下限', floorRaw > 0n && balance >= floorRaw, balance, `≥ ${floorRaw}`, floorNote));
      if (router) {
        const allowance = await client.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [getAddress(probe), getAddress(router)] });
        probeRecord.routerAllowance = allowance;
        checks.push(check('探针账户 allowance(Router) ≥ 派生下限', floorRaw > 0n && allowance >= floorRaw, allowance, `≥ ${floorRaw}`, floorNote));
      } else {
        checks.push(check('探针账户 allowance(Router) ≥ 派生下限', false, '（manifest.additionalContracts.router 缺失）', `≥ ${floorRaw}`, floorNote));
      }
    }

    Object.assign(data, {
      collateralToken: { address: token, source: tokenSource, symbol, decimals, manifestSource: collateral.source, onChainGlobal: globalCollateral },
      vault: { address: vault, source: vaultSource, asset: vaultAsset, totalAssets: vaultTotalAssets, shareDecimals: vaultDecimals ?? null },
      floorDerivation,
      probe: probeRecord,
      perCaseTraderEnabled: process.env.E2E_TRADER_ASSIGNMENT === 'per-case',
    });
  }, projectRoot);
}

// ---------------------------------------------------------------------------
// CT-BASE-006 开仓参数
// ---------------------------------------------------------------------------

export async function runCtBase006(runtime: RuntimeConfig, projectRoot: string = process.cwd()): Promise<CaseEvidence> {
  return runCase('CT-BASE-006', runtime, async ({ client, manifest }, checks, data) => {
    const dataStore = getAddress(manifest.contracts.dataStore);
    const getUint = (key: Hex) => client.readContract({ address: dataStore, abi: dataStoreAbi, functionName: 'getUint', args: [key] });
    const getInt = (key: Hex) => client.readContract({ address: dataStore, abi: dataStoreAbi, functionName: 'getInt', args: [key] });

    const [minCollateralUsd, minPositionSizeUsd] = await Promise.all([
      getUint(KEYS.MIN_COLLATERAL_USD),
      getUint(KEYS.MIN_POSITION_SIZE_USD),
    ]);
    data.global = {
      MIN_COLLATERAL_USD: { key: KEYS.MIN_COLLATERAL_USD, value: minCollateralUsd, unit: 'USD 1e30' },
      MIN_POSITION_SIZE_USD: { key: KEYS.MIN_POSITION_SIZE_USD, value: minPositionSizeUsd, unit: 'USD 1e30' },
    };
    data.lMin = 'FX100Keys.sol 无最小杠杆键；L_min 为前端约束，本用例不在 DataStore 断言';
    data.keyForms = {
      MAX_POSITION_SIZE_USD: 'keccak256(abi.encode(MAX_POSITION_SIZE_USD, marketIndex))（FX100Keys.sol:1585 maxPositionSizeUSDKey，PositionUtils.sol:304 按市场读；0 = 不限）',
      MAX_OPEN_INTEREST: 'keccak256(abi.encode(MAX_OPEN_INTEREST, marketIndex, isLong))（MarketUtils.sol:649-652 硬顶，0 → 任何开仓 MaxOpenInterestExceeded）',
      MAX_OPEN_INTEREST_FACTOR: 'keccak256(abi.encode(MAX_OPEN_INTEREST_FACTOR, marketIndex, isLong))（MarketUtils.sol:655-658 无条件读取，applyFactor(pool, 0)=0 → 任何开仓被拒）',
      RESERVE_FACTOR: 'keccak256(abi.encode(RESERVE_FACTOR, marketIndex))（IncreasePositionUtils.sol:129 → MarketUtils.validateOpenInterestReserve，sizeDelta>0 时无条件读取，0 → InsufficientReserveForOpenInterest）',
    };

    const markets: Record<string, unknown> = {};
    for (const market of manifest.markets) {
      const marketIndex = BigInt(market.marketIndex);
      const label = `market[${market.marketIndex}] ${market.symbol}`;
      const minCollateralFactorKey = marketKey(KEYS.MIN_COLLATERAL_FACTOR, marketIndex);
      const maxPositionSizeKey = marketKey(KEYS.MAX_POSITION_SIZE_USD, marketIndex);
      const [minCollateralFactor, reserveFactor, maxPositionSizeUsd] = await Promise.all([
        getUint(minCollateralFactorKey),
        getUint(marketKey(KEYS.RESERVE_FACTOR, marketIndex)),
        getUint(maxPositionSizeKey),
      ]);
      const lMax = minCollateralFactor > 0n ? FLOAT_PRECISION / minCollateralFactor : null;
      checks.push(check(`${label} MIN_COLLATERAL_FACTOR > 0`, minCollateralFactor > 0n, minCollateralFactor, '> 0', lMax !== null ? `L_max = 1e30 / factor = ${lMax}` : undefined));
      checks.push(check(
        `${label} RESERVE_FACTOR > 0`,
        reserveFactor > 0n,
        reserveFactor,
        '> 0',
        'IncreasePositionUtils.sol:129 sizeDelta>0 时无条件 validateOpenInterestReserve，0 → 任何开仓 InsufficientReserveForOpenInterest',
      ));
      checks.push(check(
        `${label} MAX_POSITION_SIZE_USD == 0（不限）或 ≥ MIN_POSITION_SIZE_USD`,
        maxPositionSizeUsd === 0n || maxPositionSizeUsd >= minPositionSizeUsd,
        maxPositionSizeUsd,
        `0 或 ≥ ${minPositionSizeUsd}`,
        maxPositionSizeUsd === 0n ? 'PositionUtils.sol:305 仅在 > 0 时生效，0 = 不限' : undefined,
      ));

      const sides: Record<string, unknown> = {};
      for (const isLong of [true, false]) {
        const side = isLong ? 'long' : 'short';
        const minKey = marketBoolKey(KEYS.MIN_DYNAMIC_SPREAD, marketIndex, isLong);
        const maxKey = marketBoolKey(KEYS.MAX_DYNAMIC_SPREAD, marketIndex, isLong);
        const [minSpread, maxSpread, maxOpenInterest, maxOpenInterestFactor] = await Promise.all([
          getInt(minKey),
          getInt(maxKey),
          getUint(marketBoolKey(KEYS.MAX_OPEN_INTEREST, marketIndex, isLong)),
          getUint(marketBoolKey(KEYS.MAX_OPEN_INTEREST_FACTOR, marketIndex, isLong)),
        ]);
        sides[side] = {
          MIN_DYNAMIC_SPREAD: { key: minKey, value: minSpread, unit: 'WEI 1e18 = 100%' },
          MAX_DYNAMIC_SPREAD: { key: maxKey, value: maxSpread, unit: 'WEI 1e18 = 100%' },
          MAX_OPEN_INTEREST: { value: maxOpenInterest, unit: 'USD 1e30（0 = 硬顶为零，任何开仓被拒）' },
          MAX_OPEN_INTEREST_FACTOR: { value: maxOpenInterestFactor, unit: 'FLOAT 1e30 = 100%（0 = 软顶为零，任何开仓被拒）' },
        };
        checks.push(check(
          `${label} ${side} MAX_OPEN_INTEREST > 0`,
          maxOpenInterest > 0n,
          maxOpenInterest,
          '> 0',
          'MarketUtils.sol:649-652 validateOpenInterest 硬顶：openInterest > maxOpenInterest 即 MaxOpenInterestExceeded，0 阻断全部开仓',
        ));
        checks.push(check(
          `${label} ${side} MAX_OPEN_INTEREST_FACTOR > 0`,
          maxOpenInterestFactor > 0n,
          maxOpenInterestFactor,
          '> 0',
          'MarketUtils.sol:655-658 软顶无条件读取：applyFactor(poolUSD, 0) = 0，任何 openInterest > 0 即 MaxOpenInterestExceeded',
        ));
        checks.push(check(
          `${label} ${side} MIN_DYNAMIC_SPREAD ≤ MAX_DYNAMIC_SPREAD 且非双零`,
          minSpread <= maxSpread && !(minSpread === 0n && maxSpread === 0n),
          { min: minSpread, max: maxSpread },
          'min ≤ max 且 (min, max) ≠ (0, 0)',
          minSpread === 0n && maxSpread === 0n
            ? '双零视为漏配默认值（负 MIN 允许，见矩阵 C 节负点差）；MIN/MAX_DYNAMIC_SPREAD 为 v0.3.2 新增键，v0.3.1 部署恒为零'
            : '负 MIN 允许（矩阵 C 节负点差）',
        ));
      }

      // POSITION_FEE_FACTOR(marketIndex, balanceWasImproved)
      const [feeImproved, feeWorsened] = await Promise.all([
        getUint(marketBoolKey(KEYS.POSITION_FEE_FACTOR, marketIndex, true)),
        getUint(marketBoolKey(KEYS.POSITION_FEE_FACTOR, marketIndex, false)),
      ]);
      markets[market.symbol] = {
        marketIndex,
        MIN_COLLATERAL_FACTOR: { key: minCollateralFactorKey, value: minCollateralFactor, unit: 'FLOAT 1e30 = 100%', lMax },
        MAX_POSITION_SIZE_USD: { key: maxPositionSizeKey, value: maxPositionSizeUsd, unit: 'USD 1e30（0 = 不限，PositionUtils.sol:305）' },
        RESERVE_FACTOR: { value: reserveFactor, unit: 'FLOAT 1e30 = 100%（0 = 任何开仓 InsufficientReserveForOpenInterest）' },
        POSITION_FEE_FACTOR: {
          balanceWasImproved: { value: feeImproved, unit: 'FLOAT 1e30 = 100%' },
          balanceWorsened: { value: feeWorsened, unit: 'FLOAT 1e30 = 100%' },
        },
        sides,
      };
    }
    data.markets = markets;
  }, projectRoot);
}

// ---------------------------------------------------------------------------
// CT-BASE-007 Oracle 基线
// ---------------------------------------------------------------------------

async function mockOracleAddresses(runtime: RuntimeConfig, manifest: DeploymentManifest): Promise<Set<string>> {
  const set = new Set<string>();
  for (const name of ['mockUsdcOracle', 'mockBtcOracle', 'mockEthOracle']) {
    const address = manifest.additionalContracts[name];
    if (address) set.add(getAddress(address));
  }
  if (isMockResourceEnvironment(runtime.environment)) {
    try {
      const resource = (await loadMockResourceRegistry()).resources[runtime.environment];
      const candidates = [
        resource.sharedCollateral?.oracle?.address,
        resource.oracle?.address,
        resource.collateralOracle?.address,
        ...Object.values(resource.bundles ?? {}).map((bundle) => bundle.oracle?.address),
      ];
      for (const address of candidates) if (address) set.add(getAddress(address));
    } catch {
      // 登记表缺失时只依赖 manifest 的 mock oracle 登记
    }
  }
  return set;
}

export async function runCtBase007(runtime: RuntimeConfig, projectRoot: string = process.cwd()): Promise<CaseEvidence> {
  return runCase('CT-BASE-007', runtime, async ({ client, manifest }, checks, data) => {
    const dataStore = getAddress(manifest.contracts.dataStore);
    const oracle = getAddress(manifest.contracts.oracle);
    const getUint = (key: Hex) => client.readContract({ address: dataStore, abi: dataStoreAbi, functionName: 'getUint', args: [key] });
    const getAddr = (key: Hex) => client.readContract({ address: dataStore, abi: dataStoreAbi, functionName: 'getAddress', args: [key] });
    const maxOraclePriceAge = await getUint(KEYS.MAX_ORACLE_PRICE_AGE);
    const mockFeeds = await mockOracleAddresses(runtime, manifest);
    const block = await client.getBlock();
    data.MAX_ORACLE_PRICE_AGE = { key: KEYS.MAX_ORACLE_PRICE_AGE, value: maxOraclePriceAge, unit: 'seconds' };
    data.latestBlock = { number: block.number, timestamp: block.timestamp };
    data.registeredMockFeeds = [...mockFeeds];

    const providerNames = new Map<string, string>();
    for (const name of ['chainlinkPriceFeedProvider', 'chainlinkDataStreamProvider', 'pythPriceFeedProvider']) {
      const address = manifest.additionalContracts[name];
      if (address) providerNames.set(getAddress(address), name);
    }
    const tokenSet = new Map<string, string>();
    for (const market of manifest.markets) {
      tokenSet.set(getAddress(market.indexToken), `market[${market.marketIndex}] ${market.symbol} indexToken`);
    }
    const collateral = manifestCollateralToken(manifest);
    tokenSet.set(getAddress(collateral.address), 'collateralToken');

    const tokens: Record<string, unknown> = {};
    for (const [token, label] of tokenSet) {
      const [provider, feed, multiplier, heartbeat, stablePrice] = await Promise.all([
        getAddr(oracleProviderForTokenKey(oracle, token)),
        getAddr(tokenKey(KEYS.PRICE_FEED, token)),
        getUint(tokenKey(KEYS.PRICE_FEED_MULTIPLIER, token)),
        getUint(tokenKey(KEYS.PRICE_FEED_HEARTBEAT_DURATION, token)),
        readStablePrice(runtime.rpcUrl, dataStore, token, runtime.requestTimeoutMs),
      ]);
      const record: Record<string, unknown> = {
        token,
        label,
        ORACLE_PROVIDER_FOR_TOKEN: provider,
        providerName: providerNames.get(sameAddress(provider, zeroAddress) ? '' : getAddress(provider)) ?? (sameAddress(provider, zeroAddress) ? null : '（manifest 未登记该 provider）'),
        oracleProviderKeyForm: 'keccak256(abi.encode(ORACLE_PROVIDER_FOR_TOKEN, Oracle, token))',
        PRICE_FEED: feed,
        PRICE_FEED_MULTIPLIER: multiplier,
        PRICE_FEED_HEARTBEAT_DURATION: heartbeat,
        STABLE_PRICE: stablePrice,
      };
      checks.push(check(`${label} ORACLE_PROVIDER_FOR_TOKEN 非零`, !sameAddress(provider, zeroAddress), provider, '非零地址'));
      const providerName = providerNames.get(sameAddress(provider, zeroAddress) ? '' : getAddress(provider));
      checks.push(check(
        `${label} PRICE_FEED 非零`,
        !sameAddress(feed, zeroAddress),
        feed,
        '非零地址',
        sameAddress(feed, zeroAddress)
          ? (providerName === 'chainlinkDataStreamProvider'
            ? 'provider 为 DataStream（链下签名价），链上无 feed 可读；A 节要求 Mock Oracle 推价路径（ChainlinkPriceFeedProvider + PRICE_FEED）'
            : '该 token 未配置链上 feed（Mock Oracle 未接线或环境未初始化）')
          : undefined,
      ));
      if (sameAddress(feed, zeroAddress)) {
        tokens[token] = record;
        continue;
      }
      const isMock = mockFeeds.has(getAddress(feed));
      record.feedKind = isMock ? 'MockChainlinkOracle（mock-resources / manifest 登记）' : 'Chainlink 风格 feed（latestRoundData）';
      try {
        let answer: bigint;
        let updatedAt: bigint;
        let decimals: number;
        if (isMock) {
          const state = await readMockOracleState(runtime.rpcUrl, feed, runtime.requestTimeoutMs);
          answer = state.answer;
          updatedAt = state.updatedAt;
          decimals = state.decimals;
          record.description = state.description;
        } else {
          const [roundData, feedDecimals] = await Promise.all([
            client.readContract({ address: getAddress(feed), abi: chainlinkFeedAbi, functionName: 'latestRoundData' }),
            client.readContract({ address: getAddress(feed), abi: chainlinkFeedAbi, functionName: 'decimals' }),
          ]);
          answer = roundData[1];
          updatedAt = roundData[3];
          decimals = feedDecimals;
        }
        const age = block.timestamp - updatedAt;
        Object.assign(record, { answer, feedDecimals: decimals, updatedAt, ageSeconds: age, priceDisplay: formatUnits(answer, decimals) });
        checks.push(check(`${label} feed 价格 > 0`, answer > 0n, answer, '> 0'));
        // 时效分层（Oracle.sol:290 比较的是 validatedPrice.timestamp）：
        // - PRICE_FEED_HEARTBEAT_DURATION(token)：ChainlinkPriceFeedUtils.sol:35 读 feed 的过期线（超过即 ChainlinkPriceFeedNotUpdated）；
        //   PythPriceFeedUtils.sol:24-25 亦用同一键作 getPriceNoOlderThan 窗口。所有 provider 都断言。
        // - MAX_ORACLE_PRICE_AGE：ChainlinkPriceFeedProvider.sol:61 / PythPriceFeedProvider.sol:66 把 timestamp 置为 block.timestamp，
        //   该窗口对它们恒满足、合约不实际应用；仅 ChainlinkDataStreamProvider.sol:100 用 report.observationsTimestamp，才受此窗口约束。
        checks.push(check(
          `${label} 价格年龄 ≤ PRICE_FEED_HEARTBEAT_DURATION`,
          heartbeat > 0n && age <= heartbeat,
          { ageSeconds: age },
          `≤ ${heartbeat}`,
          heartbeat === 0n ? 'PRICE_FEED_HEARTBEAT_DURATION 未配置（0），feed 读价必然 ChainlinkPriceFeedNotUpdated' : undefined,
        ));
        const withinMaxAge = maxOraclePriceAge > 0n && age <= maxOraclePriceAge;
        if (providerName === 'chainlinkDataStreamProvider') {
          checks.push(check(
            `${label} 价格年龄 ≤ MAX_ORACLE_PRICE_AGE（DataStream provider 用 observationsTimestamp）`,
            withinMaxAge,
            { ageSeconds: age, heartbeatDuration: heartbeat },
            `≤ ${maxOraclePriceAge}`,
            maxOraclePriceAge === 0n ? 'MAX_ORACLE_PRICE_AGE 未配置（0）' : undefined,
          ));
        } else {
          record.maxOraclePriceAgeObservation = {
            ageSeconds: age,
            MAX_ORACLE_PRICE_AGE: maxOraclePriceAge,
            withinWindow: withinMaxAge,
            appliedByContract: false,
            note: `provider=${providerName ?? '未知'}：ChainlinkPriceFeedProvider/PythPriceFeedProvider 把 validatedPrice.timestamp 置为 block.timestamp，Oracle.sol:290 的 MAX_ORACLE_PRICE_AGE 窗口对该 token 不实际生效，仅记录不断言`,
          };
        }
      } catch (error) {
        checks.push(check(`${label} feed 价格可读`, false, errorMessage(error, runtime), '可读'));
      }

      // Oracle.latestRecordedPrices(token)：仅在执行过订单后有值；有值时断言 min ≤ max
      const recordedName = `${label} Oracle.latestRecordedPrices min ≤ max`;
      try {
        const recorded = await client.readContract({ address: oracle, abi: oracleAbi, functionName: 'latestRecordedPrices', args: [getAddress(token)] });
        const [timestamp, price] = recorded;
        record.latestRecordedPrice = { timestamp, min: price.min, max: price.max };
        if (price.min > 0n || price.max > 0n) {
          checks.push(check(recordedName, price.min <= price.max && price.min > 0n, { min: price.min, max: price.max }, '0 < min ≤ max'));
        } else {
          checks.push(notExercised(recordedName, '该 token 尚无执行记录价（min=max=0），min/max 对只在订单执行时由 provider 产生'));
        }
      } catch (error) {
        const reason = errorMessage(error, runtime);
        record.latestRecordedPrice = `不可读：${reason}`;
        checks.push(notExercised(recordedName, `Oracle.latestRecordedPrices(token) 读取失败：${reason}`));
      }
      tokens[token] = record;
    }
    data.tokens = tokens;

    // IS_ORACLE_PROVIDER_ENABLED(provider)：Oracle.sol:269 对每个 provider 无条件校验，未启用即 InvalidOracleProvider
    const providersInUse = new Map<string, string[]>();
    for (const [token, item] of Object.entries(tokens)) {
      const provider = (item as { ORACLE_PROVIDER_FOR_TOKEN?: string }).ORACLE_PROVIDER_FOR_TOKEN;
      if (!provider || sameAddress(provider, zeroAddress)) continue;
      const key = getAddress(provider);
      providersInUse.set(key, [...(providersInUse.get(key) ?? []), (item as { label?: string }).label ?? token]);
    }
    const providerRecords: Record<string, unknown> = {};
    for (const [provider, usedBy] of providersInUse) {
      const enabledKey = tokenKey(KEYS.IS_ORACLE_PROVIDER_ENABLED, provider);
      const enabled = await client.readContract({ address: dataStore, abi: dataStoreAbi, functionName: 'getBool', args: [enabledKey] });
      const name = providerNames.get(provider) ?? '（manifest 未登记）';
      providerRecords[provider] = { name, usedBy, IS_ORACLE_PROVIDER_ENABLED: enabled, key: enabledKey, keyForm: 'keccak256(abi.encode(IS_ORACLE_PROVIDER_ENABLED, provider))' };
      checks.push(check(`provider ${name} ${provider} IS_ORACLE_PROVIDER_ENABLED == true`, enabled === true, enabled, true, `使用方：${usedBy.join('、')}`));
    }
    data.providers = providerRecords;

    const feeds = Object.values(tokens).map((item) => (item as { PRICE_FEED?: string }).PRICE_FEED).filter((item): item is string => Boolean(item) && !sameAddress(item, zeroAddress));
    checks.push(check('各 token 的 PRICE_FEED 互不相同（两市场不串价）', new Set(feeds.map((item) => getAddress(item))).size === feeds.length, feeds, '互不相同'));
  }, projectRoot);
}

// ---------------------------------------------------------------------------
// CT-BASE-008 执行权限
// ---------------------------------------------------------------------------

interface RevertOutcome {
  readonly reverted: boolean;
  readonly errorName?: string;
  readonly args?: readonly unknown[];
  readonly message?: string;
}

/** eth_call 模拟（simulateContract，带 from），把 revert 归一为 RevertOutcome；不发交易。 */
async function simulateCall(input: {
  readonly rpcUrl: string;
  readonly timeoutMs: number;
  readonly address: `0x${string}`;
  readonly abi: Abi;
  readonly functionName: string;
  readonly args: readonly unknown[];
  readonly from: `0x${string}`;
}): Promise<RevertOutcome> {
  const client = createPublicClient({ transport: http(input.rpcUrl, { timeout: input.timeoutMs }) });
  try {
    await client.simulateContract({
      address: input.address,
      abi: input.abi,
      functionName: input.functionName,
      args: input.args as unknown[],
      account: input.from,
    });
    return { reverted: false };
  } catch (error) {
    if (error instanceof BaseError) {
      const revert = error.walk((item) => item instanceof ContractFunctionRevertedError);
      if (revert instanceof ContractFunctionRevertedError) {
        return {
          reverted: true,
          ...(revert.data?.errorName ? { errorName: revert.data.errorName } : {}),
          ...(revert.data?.args ? { args: revert.data.args } : {}),
          message: maskErrorText(revert.shortMessage),
        };
      }
      return { reverted: true, message: maskErrorText(error.shortMessage) };
    }
    return { reverted: true, message: maskErrorText(error instanceof Error ? error.message : String(error)) };
  }
}

async function simulateConfigSetInt(input: {
  readonly rpcUrl: string;
  readonly timeoutMs: number;
  readonly config: `0x${string}`;
  readonly from: `0x${string}`;
  readonly baseKey: Hex;
  readonly data: Hex;
  readonly value: bigint;
}): Promise<RevertOutcome> {
  return simulateCall({
    rpcUrl: input.rpcUrl,
    timeoutMs: input.timeoutMs,
    address: input.config,
    abi: configAbi,
    functionName: 'setInt',
    args: [input.baseKey, input.data, input.value],
    from: input.from,
  });
}

/** OrderHandler.executeOrder(zero key, 空 oracleParams)：onlyOrderKeeper 在 withOraclePrices 之前，非 keeper 必 Unauthorized(msgSender, ORDER_KEEPER 哈希) */
async function simulateExecuteOrder(input: {
  readonly rpcUrl: string;
  readonly timeoutMs: number;
  readonly orderHandler: `0x${string}`;
  readonly from: `0x${string}`;
  /** 额外的 error ABI（FxErrors），用于把"过角色闸后"的 revert 解码出名字；缺省只解码 Unauthorized */
  readonly extraErrorAbi?: Abi;
}): Promise<RevertOutcome> {
  return simulateCall({
    rpcUrl: input.rpcUrl,
    timeoutMs: input.timeoutMs,
    address: input.orderHandler,
    abi: [...orderHandlerAbi, ...(input.extraErrorAbi ?? []).filter((item) => item.type === 'error')] as Abi,
    functionName: 'executeOrder',
    args: [zeroHash, { tokens: [], providers: [], data: [] }],
    from: input.from,
  });
}

function hexEquals(a: unknown, b: Hex): boolean {
  return typeof a === 'string' && a.toLowerCase() === b.toLowerCase();
}

function caseTraderAddress(projectRoot: string, scenarioId: string): `0x${string}` | undefined {
  const map = loadCaseTraderMap(projectRoot);
  const assignment = map?.assignments[scenarioId];
  return assignment ? getAddress(assignment.address) : undefined;
}

export async function runCtBase008(runtime: RuntimeConfig, projectRoot: string = process.cwd()): Promise<CaseEvidence> {
  return runCase('CT-BASE-008', runtime, async ({ client, manifest }, checks, data) => {
    const dataStore = getAddress(manifest.contracts.dataStore);
    const config = getAddress(manifest.contracts.config);
    const orderHandler = getAddress(manifest.contracts.orderHandler);
    const hasRole = (role: Hex, account: string) => client.readContract({ address: dataStore, abi: dataStoreAbi, functionName: 'hasRole', args: [role, getAddress(account)] });
    // FxErrors ABI（绑定 artifactDirectory）仅用于解码 revert 名字；缺失不影响断言（Unauthorized 已在 orderHandlerAbi 内）
    let fxErrorsAbi: Abi | undefined;
    try {
      fxErrorsAbi = (await loadContractArtifact(loadEnvironmentBinding(projectRoot, runtime.environment).artifactDirectory, 'FxErrors')).abi;
    } catch {
      fxErrorsAbi = undefined;
    }
    data.revertDecoder = fxErrorsAbi ? 'FxErrors artifact ABI' : '仅 Unauthorized / InvalidBaseKey（FxErrors artifact 不可用）';

    // 1) manifest.roles → 链上 hasRole
    const expectedPairs: Array<{ readonly label: string; readonly role: keyof typeof ROLES; readonly account: string }> = [
      { label: 'manifest.roles.controller', role: 'CONTROLLER', account: manifest.roles.controller },
      { label: 'manifest.roles.configKeeper', role: 'CONFIG_KEEPER', account: manifest.roles.configKeeper },
      { label: 'manifest.roles.orderKeeper', role: 'ORDER_KEEPER', account: manifest.roles.orderKeeper },
      { label: 'manifest.roles.liquidationKeeper', role: 'LIQUIDATION_KEEPER', account: manifest.roles.liquidationKeeper },
      { label: 'manifest.roles.adlKeeper', role: 'ADL_KEEPER', account: manifest.roles.adlKeeper },
    ];
    const keeperAccount = runtime.keeperAccount ?? manifest.roles.orderKeeper;
    for (const roleName of manifest.initialization?.keeperRoles ?? []) {
      if (!(roleName in ROLES)) {
        checks.push(check(`initialization.keeperRoles ${roleName} 为 Role.sol 已知角色`, false, roleName, Object.keys(ROLES)));
        continue;
      }
      expectedPairs.push({ label: `initialization.keeperRoles（keeper=${getAddress(keeperAccount)}）`, role: roleName as keyof typeof ROLES, account: keeperAccount });
    }
    for (const name of ['orderHandler', 'exchangeRouter', 'liquidationHandler', 'adlHandler'] as const) {
      expectedPairs.push({ label: `contracts.${name}`, role: 'CONTROLLER', account: manifest.contracts[name] });
    }
    const roleRecords: Array<Record<string, unknown>> = [];
    for (const pair of expectedPairs) {
      const held = await hasRole(ROLES[pair.role], pair.account);
      roleRecords.push({ label: pair.label, role: pair.role, roleHash: ROLES[pair.role], account: getAddress(pair.account), hasRole: held });
      checks.push(check(`${pair.label} 持有 ${pair.role}`, held, held, true));
    }
    data.roles = roleRecords;

    // 2) 反例账户（矩阵 A 节映射：无权限 T100 = CT-BASE-005 探针；LIMITED 夹具 T89 = XT-MKT-LEV-004）
    const noRoleAccount = caseTraderAddress(projectRoot, 'CT-BASE-005');
    const limitedFixtureAccount = caseTraderAddress(projectRoot, 'XT-MKT-LEV-004');
    const probeMarket = manifest.markets[0];
    if (!probeMarket) throw new Error('manifest.markets 为空');
    const marketIndex = BigInt(probeMarket.marketIndex);
    const setIntData = encodeAbiParameters(parseAbiParameters('uint256, bool'), [marketIndex, true]);
    const setIntValue = -(2n * 10n ** 16n);
    data.probe = {
      target: 'Config.setInt(MIN_DYNAMIC_SPREAD, abi.encode(marketIndex, true), -2e16)',
      baseKey: KEYS.MIN_DYNAMIC_SPREAD,
      marketIndex,
      data: setIntData,
      value: setIntValue,
      noRoleAccount: noRoleAccount ?? null,
      limitedFixtureAccount: limitedFixtureAccount ?? null,
      configKeeper: getAddress(manifest.roles.configKeeper),
      method: 'eth_call 模拟（simulateContract），不发交易',
    };

    if (!noRoleAccount) {
      checks.push(check('无权限账户 T100 调 Config.setInt → Unauthorized', false, '（config/case-traders.json 缺 CT-BASE-005 映射）', 'Unauthorized'));
    } else {
      const [holdsConfig, holdsLimited] = await Promise.all([hasRole(ROLES.CONFIG_KEEPER, noRoleAccount), hasRole(ROLES.LIMITED_CONFIG_KEEPER, noRoleAccount)]);
      checks.push(check('T100 不持有 CONFIG_KEEPER / LIMITED_CONFIG_KEEPER（反例前置）', !holdsConfig && !holdsLimited, { CONFIG_KEEPER: holdsConfig, LIMITED_CONFIG_KEEPER: holdsLimited }, { CONFIG_KEEPER: false, LIMITED_CONFIG_KEEPER: false }));
      const outcome = await simulateConfigSetInt({ rpcUrl: runtime.rpcUrl, timeoutMs: runtime.requestTimeoutMs, config, from: noRoleAccount, baseKey: KEYS.MIN_DYNAMIC_SPREAD, data: setIntData, value: setIntValue });
      const roleArg = outcome.args?.[1];
      checks.push(check(
        '无权限账户 T100 调 Config.setInt → Unauthorized(msgSender, bytes32("LIMITED / CONFIG KEEPER"))',
        outcome.reverted && outcome.errorName === 'Unauthorized' && sameAddress(String(outcome.args?.[0] ?? ''), noRoleAccount) && hexEquals(roleArg, LIMITED_OR_CONFIG_KEEPER_ROLE_ARG),
        outcome,
        { reverted: true, errorName: 'Unauthorized', msgSender: noRoleAccount, role: LIMITED_OR_CONFIG_KEEPER_ROLE_ARG },
        `Config.sol:49 字面量右补零 bytes32；实际 role 参数=${typeof roleArg === 'string' ? roleArg : '（未解码）'}`,
      ));

      // executeOrder 反例：OrderHandler.sol:262 onlyOrderKeeper → AccessStoreProxy._validateRole 抛 Unauthorized(msg.sender, Role.ORDER_KEEPER)，
      // role 参数是 keccak256(abi.encode("ORDER_KEEPER")) 哈希（不是字符串字面量）
      const [holdsOrderKeeper, holdsFrozenOrderKeeper] = await Promise.all([hasRole(ROLES.ORDER_KEEPER, noRoleAccount), hasRole(ROLES.FROZEN_ORDER_KEEPER, noRoleAccount)]);
      checks.push(check('T100 不持有 ORDER_KEEPER / FROZEN_ORDER_KEEPER（反例前置）', !holdsOrderKeeper && !holdsFrozenOrderKeeper, { ORDER_KEEPER: holdsOrderKeeper, FROZEN_ORDER_KEEPER: holdsFrozenOrderKeeper }, { ORDER_KEEPER: false, FROZEN_ORDER_KEEPER: false }));
      const executeOutcome = await simulateExecuteOrder({ rpcUrl: runtime.rpcUrl, timeoutMs: runtime.requestTimeoutMs, orderHandler, from: noRoleAccount, ...(fxErrorsAbi ? { extraErrorAbi: fxErrorsAbi } : {}) });
      const executeRoleArg = executeOutcome.args?.[1];
      checks.push(check(
        '无权限账户 T100 调 OrderHandler.executeOrder → Unauthorized(msgSender, ORDER_KEEPER 哈希)',
        executeOutcome.reverted && executeOutcome.errorName === 'Unauthorized' && sameAddress(String(executeOutcome.args?.[0] ?? ''), noRoleAccount) && hexEquals(executeRoleArg, ROLES.ORDER_KEEPER),
        executeOutcome,
        { reverted: true, errorName: 'Unauthorized', msgSender: noRoleAccount, role: ROLES.ORDER_KEEPER },
        `AccessStoreProxy.sol:126-128 _validateRole(Role.ORDER_KEEPER)；实际 role 参数=${typeof executeRoleArg === 'string' ? executeRoleArg : '（未解码）'}`,
      ));
    }

    const orderKeeper = getAddress(manifest.roles.orderKeeper);
    const keeperExecuteOutcome = await simulateExecuteOrder({ rpcUrl: runtime.rpcUrl, timeoutMs: runtime.requestTimeoutMs, orderHandler, from: orderKeeper, ...(fxErrorsAbi ? { extraErrorAbi: fxErrorsAbi } : {}) });
    const keeperPassedRoleGate = !(keeperExecuteOutcome.reverted && keeperExecuteOutcome.errorName === 'Unauthorized');
    data.executeOrderProbe = {
      target: 'OrderHandler.executeOrder(bytes32(0), SetPricesParams{tokens:[],providers:[],data:[]})',
      orderHandler,
      orderKeeper,
      method: 'eth_call 模拟（simulateContract），不发交易',
      keeperOutcome: keeperExecuteOutcome,
      keeperVerdict: keeperPassedRoleGate ? 'passed role gate' : 'blocked by role gate',
    };
    checks.push(check(
      'ORDER_KEEPER 调 OrderHandler.executeOrder 不以 Unauthorized revert（过角色闸；其它 revert 可接受）',
      keeperPassedRoleGate,
      keeperExecuteOutcome,
      { notErrorName: 'Unauthorized' },
      keeperPassedRoleGate
        ? (keeperExecuteOutcome.reverted ? `passed role gate：后续 revert ${keeperExecuteOutcome.errorName ?? '（未解码）'} 来自空订单/空价格，不是权限` : 'passed role gate：模拟未 revert')
        : undefined,
    ));

    const keeperOutcome = await simulateConfigSetInt({ rpcUrl: runtime.rpcUrl, timeoutMs: runtime.requestTimeoutMs, config, from: getAddress(manifest.roles.configKeeper), baseKey: KEYS.MIN_DYNAMIC_SPREAD, data: setIntData, value: setIntValue });
    checks.push(check(
      'CONFIG_KEEPER 调 Config.setInt(MIN_DYNAMIC_SPREAD) 不 revert（模拟）',
      !keeperOutcome.reverted,
      keeperOutcome,
      { reverted: false },
      keeperOutcome.errorName === 'InvalidBaseKey'
        ? 'InvalidBaseKey 表示链上 Config 的 allowedBaseKeys 不含 MIN_DYNAMIC_SPREAD（v0.3.2 Config.sol 已加入；v0.3.1 未加入），即部署版本不是 v0.3.2'
        : undefined,
    ));

    // 3) LIMITED_CONFIG_KEEPER 夹具：snapshot 内由 DEFAULT_ADMIN 免签名 grantRole，再模拟受限调用；finally 必 revert
    const fixtureName = 'LIMITED 夹具 T89 调 Config.setInt(MIN_DYNAMIC_SPREAD) → InvalidBaseKey(baseKey)';
    if (!runtime.adminRpcUrl) {
      checks.push(notExercised(fixtureName, `环境 ${runtime.environment} 未配置 admin RPC，无法在 snapshot 内授予 LIMITED_CONFIG_KEEPER`));
    } else if (!limitedFixtureAccount) {
      checks.push(notExercised(fixtureName, 'config/case-traders.json 缺 XT-MKT-LEV-004（T89）映射'));
    } else {
      const adminRpcUrl = runtime.adminRpcUrl;
      const fixture: Record<string, unknown> = { account: limitedFixtureAccount, adminRpc: maskUrl(adminRpcUrl) };
      data.limitedFixture = fixture;
      const defaultAdminCount = await client.readContract({ address: dataStore, abi: dataStoreAbi, functionName: 'getRoleMemberCount', args: [DEFAULT_ADMIN_ROLE] });
      const defaultAdmin = defaultAdminCount > 0n
        ? await client.readContract({ address: dataStore, abi: dataStoreAbi, functionName: 'getRoleMember', args: [DEFAULT_ADMIN_ROLE, 0n] })
        : undefined;
      fixture.defaultAdmin = defaultAdmin ?? null;
      fixture.defaultAdminMemberCount = defaultAdminCount;
      if (!defaultAdmin) {
        checks.push(check(fixtureName, false, '（链上 DataStore DEFAULT_ADMIN_ROLE 无成员，无法授予夹具角色）', 'InvalidBaseKey'));
      } else {
        const [preConfig, preLimited] = await Promise.all([hasRole(ROLES.CONFIG_KEEPER, limitedFixtureAccount), hasRole(ROLES.LIMITED_CONFIG_KEEPER, limitedFixtureAccount)]);
        fixture.before = { CONFIG_KEEPER: preConfig, LIMITED_CONFIG_KEEPER: preLimited };
        // admin RPC 写动作前再次确认 runtime 与环境绑定一致（RPC 链 + 关键合约 bytecode），防止把夹具写进错误环境
        let bindingError: string | undefined;
        try {
          await assertRuntimeEnvironmentBinding(runtime, projectRoot);
        } catch (error) {
          bindingError = errorMessage(error, runtime);
        }
        fixture.bindingAssertion = bindingError ?? 'ok';
        if (preConfig) {
          checks.push(check(fixtureName, false, 'T89 已持有 CONFIG_KEEPER，无法构成"仅 LIMITED"反例', '仅 LIMITED_CONFIG_KEEPER'));
        } else if (bindingError) {
          checks.push(check(fixtureName, false, `assertRuntimeEnvironmentBinding 失败，拒绝在 admin RPC 写入：${bindingError}`, 'InvalidBaseKey'));
        } else {
          const snapshot = await adminRpcRequest(adminRpcUrl, 'evm_snapshot', [], runtime.requestTimeoutMs);
          if (typeof snapshot !== 'string') throw new Error('evm_snapshot 未返回快照 ID');
          fixture.snapshotId = snapshot;
          data.limitedFixture = fixture; // try/finally 抛错时 snapshotId / grantRoleTx / reverted 仍留在证据里
          try {
            const grantData = encodeFunctionData({ abi: dataStoreAbi, functionName: 'grantRole', args: [ROLES.LIMITED_CONFIG_KEEPER, limitedFixtureAccount] });
            const receipt = await sendAdminTransaction({ adminRpcUrl, from: defaultAdmin, to: dataStore, data: grantData, timeoutMs: runtime.requestTimeoutMs });
            fixture.grantRoleTx = receipt;
            const adminClient = createPublicClient({ transport: http(adminRpcUrl, { timeout: runtime.requestTimeoutMs }) });
            const granted = await adminClient.readContract({ address: dataStore, abi: dataStoreAbi, functionName: 'hasRole', args: [ROLES.LIMITED_CONFIG_KEEPER, limitedFixtureAccount] });
            fixture.grantedInSnapshot = granted;
            checks.push(check('夹具：DEFAULT_ADMIN 免签名 grantRole(LIMITED_CONFIG_KEEPER, T89) 生效（snapshot 内）', receipt.status === 'success' && granted, { status: receipt.status, hasRole: granted }, { status: 'success', hasRole: true }));
            const outcome = await simulateConfigSetInt({ rpcUrl: adminRpcUrl, timeoutMs: runtime.requestTimeoutMs, config, from: limitedFixtureAccount, baseKey: KEYS.MIN_DYNAMIC_SPREAD, data: setIntData, value: setIntValue });
            fixture.outcome = outcome;
            checks.push(check(
              fixtureName,
              outcome.reverted && outcome.errorName === 'InvalidBaseKey' && String(outcome.args?.[0] ?? '').toLowerCase() === KEYS.MIN_DYNAMIC_SPREAD.toLowerCase(),
              outcome,
              { reverted: true, errorName: 'InvalidBaseKey', baseKey: KEYS.MIN_DYNAMIC_SPREAD },
            ));
          } finally {
            const reverted = await adminRpcRequest(adminRpcUrl, 'evm_revert', [snapshot], runtime.requestTimeoutMs);
            fixture.reverted = reverted;
            const postLimited = await hasRole(ROLES.LIMITED_CONFIG_KEEPER, limitedFixtureAccount);
            fixture.after = { LIMITED_CONFIG_KEEPER: postLimited };
            checks.push(check('夹具：evm_revert 后 T89 不再持有 LIMITED_CONFIG_KEEPER（状态不变）', reverted === true && postLimited === preLimited, { reverted, LIMITED_CONFIG_KEEPER: postLimited }, { reverted: true, LIMITED_CONFIG_KEEPER: preLimited }));
          }
        }
      }
    }
  }, projectRoot);
}

/** 汇总一行给 check-result 注解。 */
export function summarizeChecks(evidence: CaseEvidence): string {
  const passed = evidence.checks.filter((item) => item.passed).length;
  const notExercisedCount = evidence.checks.filter((item) => item.actual === 'NOT_EXERCISED').length;
  const failed = evidence.checks.filter((item) => !item.passed);
  const head = `${evidence.id}：${passed}/${evidence.checks.length} 项核对通过` + (notExercisedCount > 0 ? `（含 ${notExercisedCount} 项 NOT_EXERCISED）` : '');
  if (evidence.blocked) return `${head}；${evidence.blocked}`;
  if (failed.length === 0) return head;
  const detail = failed.map((item) => `${item.name}：实际 ${JSON.stringify(item.actual, (_k, v: unknown) => typeof v === 'bigint' ? v.toString() : v)}，期望 ${JSON.stringify(item.expected, (_k, v: unknown) => typeof v === 'bigint' ? v.toString() : v)}`).join('；');
  return `${head}；未通过 ${failed.length} 项：${detail}`;
}

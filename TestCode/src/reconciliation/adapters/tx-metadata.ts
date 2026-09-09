import type { EnvironmentBindingContext } from '../../config/environment-binding.js';
import { normalizeReleaseVersion, type BaselineRegistry } from '../../config/baseline.js';

/**
 * tx hash 核对的元数据解析：默认值 + 可覆盖。
 *
 * 默认值来源（全部是既有登记文件，不再另立事实源）：
 * - 合约版本：`Docs/contract-releases/CURRENT.json` `environments.<env>.forkOf` → `deployments[].version/releaseLabel`
 * - 合约 head：同文件 `primary.head`（部署版本 = primary.version 时）→ `comparison.head`（= comparison.version 时）
 *   → 兜底 `config/environment-bindings.json` 的 `contractCommit`
 * - 前端 head：`environments.<env>.frontend.head ?? frontend.head`（CURRENT.json 自述的解析规则）
 * - chainId：Fork 环境取 `config/mock-resources.json` `resources.<env>.chainId`，否则取绑定表 `environmentChainId`
 * - executedAt：最后一笔 tx 所在区块的 timestamp（由调用方传入）
 *
 * `overrides` 里给的值覆盖默认，`resolvedFrom` 逐字段记录 default / override；两者都要写进 envelope 与 JSON。
 */
export interface TxVerifyOverrides {
  contractVersion?: string;
  contractHead?: string;
  frontendHead?: string;
  executedAt?: string;
  chainId?: number;
  note?: string;
}

export type TxVerifyResolvedFrom = Record<string, 'default' | 'override'>;

export interface TxVerifyPerTxMetadata {
  readonly hash: `0x${string}`;
  readonly blockNumber: number;
  /** 区块 timestamp（unix 秒）。 */
  readonly blockTimestamp: number;
  readonly executedAtIso: string;
  readonly role: 'trader' | 'keeper' | 'admin' | 'oracle' | 'service';
  readonly kind: string;
  readonly actionId: string;
  readonly orderKey?: `0x${string}`;
}

export interface TxVerifyMetadata {
  readonly env: string;
  readonly chainId: number;
  /** RPC eth_chainId 实际返回值，用于与登记值交叉核对。 */
  readonly rpcChainId?: number;
  readonly forkOf: string;
  readonly contractVersion: string;
  readonly contractHead: string;
  readonly frontendHead: string;
  readonly deploymentId?: string;
  readonly deploymentManifest?: string;
  readonly executedAt: string;
  readonly note?: string;
  readonly resolvedFrom: TxVerifyResolvedFrom;
  /** 每个字段默认值的出处（文件 + 字段路径），供看板 / JSON 追溯。 */
  readonly sources: Record<string, string>;
  readonly perTx: readonly TxVerifyPerTxMetadata[];
}

export interface TxVerifyBaseMetadata {
  readonly chainId: number;
  readonly forkOf: string;
  readonly contractVersion: string;
  readonly contractHead: string;
  readonly frontendHead: string;
  readonly deploymentId: string;
  readonly deploymentManifest: string;
  readonly executedAt: string;
  readonly note?: string;
  readonly resolvedFrom: TxVerifyResolvedFrom;
  readonly sources: Record<string, string>;
  readonly warnings: string[];
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/i;

function resolveField<T>(
  name: string,
  defaultValue: T | undefined,
  defaultSource: string,
  override: T | undefined,
  resolvedFrom: TxVerifyResolvedFrom,
  sources: Record<string, string>,
): T | undefined {
  if (override !== undefined) {
    resolvedFrom[name] = 'override';
    sources[name] = 'overrides（调用方显式给定）';
    return override;
  }
  resolvedFrom[name] = 'default';
  sources[name] = defaultSource;
  return defaultValue;
}

/**
 * 解析除 perTx 以外的全部元数据。纯函数：不读 RPC、不读密钥；输入只有登记文件的解析结果与调用方覆盖。
 */
export function resolveTxVerifyBaseMetadata(input: {
  readonly env: string;
  readonly binding: EnvironmentBindingContext;
  readonly registry: BaselineRegistry | undefined;
  /** Fork 环境在 config/mock-resources.json 登记的 chainId；非 Fork 环境或未登记时 undefined。 */
  readonly mockRegistryChainId: number | undefined;
  /** 最后一笔 tx 所在区块 timestamp 的 ISO 形式。 */
  readonly latestBlockTimestampIso: string;
  readonly overrides: TxVerifyOverrides | undefined;
}): TxVerifyBaseMetadata {
  const warnings: string[] = [];
  const resolvedFrom: TxVerifyResolvedFrom = {};
  const sources: Record<string, string> = {};
  const overrides = input.overrides ?? {};
  const registry = input.registry;
  const registryEnvironment = registry?.environments[input.env];
  const forkOf = registryEnvironment?.forkOf ?? input.binding.binding.deploymentId;
  if (!registry) {
    warnings.push('CURRENT.json 不可用：合约版本 / head / 前端 head 的默认值退回 config/environment-bindings.json（无前端 head 可退）。');
  } else if (!registryEnvironment?.forkOf) {
    warnings.push(`CURRENT.json environments.${input.env}.forkOf 未登记，forkOf 退回绑定表 deploymentId=${input.binding.binding.deploymentId}。`);
  }
  const deployment = registry?.deployments.find((item) => item.id === forkOf);
  if (registry && !deployment) {
    warnings.push(`CURRENT.json deployments[] 未登记 ${forkOf}，合约版本默认值退回绑定表 release=${input.binding.binding.release}。`);
  }

  // 合约版本：deployments[].releaseLabel / version → 归一化 vX.Y.Z；兜底绑定表 release。
  const deploymentVersion = normalizeReleaseVersion(deployment?.releaseLabel)
    ?? normalizeReleaseVersion(deployment?.version);
  const defaultContractVersion = deploymentVersion ?? input.binding.binding.release;
  const contractVersionSource = deploymentVersion
    ? `CURRENT.json environments.${input.env}.forkOf=${forkOf} → deployments[id=${forkOf}].${deployment?.releaseLabel ? 'releaseLabel' : 'version'}`
    : `config/environment-bindings.json bindings.${input.env}.release`;
  const contractVersion = resolveField(
    'contractVersion', defaultContractVersion, contractVersionSource, text(overrides.contractVersion), resolvedFrom, sources,
  ) ?? defaultContractVersion;

  // 合约 head：按部署版本挑 primary / comparison 的 head；都不匹配时用绑定表 contractCommit。
  const primaryVersion = normalizeReleaseVersion(registry?.primary.version);
  const comparisonVersion = normalizeReleaseVersion(registry?.comparison?.version);
  let defaultContractHead: string = input.binding.binding.contractCommit;
  let contractHeadSource = `config/environment-bindings.json bindings.${input.env}.contractCommit`;
  if (registry && deploymentVersion && deploymentVersion === primaryVersion && text(registry.primary.head)) {
    defaultContractHead = registry.primary.head!;
    contractHeadSource = 'CURRENT.json primary.head（部署版本 = primary.version）';
  } else if (registry && deploymentVersion && deploymentVersion === comparisonVersion && text(registry.comparison?.head)) {
    defaultContractHead = registry.comparison!.head!;
    contractHeadSource = 'CURRENT.json comparison.head（部署版本 = comparison.version）';
  }
  if (defaultContractHead.toLowerCase() !== input.binding.binding.contractCommit.toLowerCase()) {
    warnings.push(`合约 head 默认值 ${defaultContractHead} 与绑定表 contractCommit=${input.binding.binding.contractCommit} 不一致，以 CURRENT.json 为准并如实记录。`);
  }
  const overrideHead = text(overrides.contractHead);
  if (overrideHead && !COMMIT_PATTERN.test(overrideHead)) {
    warnings.push(`overrides.contractHead=${overrideHead} 不是 7～40 位十六进制 commit，按原样记录。`);
  }
  const contractHead = resolveField(
    'contractHead', defaultContractHead, contractHeadSource, overrideHead, resolvedFrom, sources,
  ) ?? defaultContractHead;
  if (resolvedFrom.contractVersion === 'override' && normalizeReleaseVersion(contractVersion) !== normalizeReleaseVersion(defaultContractVersion)) {
    warnings.push(`overrides.contractVersion=${contractVersion} 与环境登记版本 ${defaultContractVersion} 不一致：envelope.environment.release 将按覆盖值写入，核对时会被绑定校验标出。`);
  }

  // 前端 head：environments.<env>.frontend.head ?? frontend.head。
  const perEnvironmentFrontend = record(record(registryEnvironment).frontend);
  const topFrontend = record(registry?.frontend);
  const defaultFrontendHead = text(perEnvironmentFrontend.head) ?? text(topFrontend.head);
  const frontendHeadSource = text(perEnvironmentFrontend.head)
    ? `CURRENT.json environments.${input.env}.frontend.head`
    : 'CURRENT.json frontend.head';
  const frontendHead = resolveField(
    'frontendHead', defaultFrontendHead, frontendHeadSource, text(overrides.frontendHead), resolvedFrom, sources,
  );
  if (!frontendHead) warnings.push('前端 head 无默认值（CURRENT.json frontend.head 缺失）且未覆盖，记为空串。');

  // chainId：Fork 环境优先 mock-resources 登记；否则绑定表 environmentChainId。
  const defaultChainId = input.mockRegistryChainId ?? input.binding.binding.environmentChainId;
  const chainIdSource = input.mockRegistryChainId !== undefined
    ? `config/mock-resources.json resources.${input.env}.chainId`
    : `config/environment-bindings.json bindings.${input.env}.environmentChainId`;
  if (input.mockRegistryChainId !== undefined && input.mockRegistryChainId !== input.binding.binding.environmentChainId) {
    warnings.push(`mock-resources 登记 chainId=${input.mockRegistryChainId} 与绑定表 environmentChainId=${input.binding.binding.environmentChainId} 不一致，默认取 mock-resources。`);
  }
  const chainId = resolveField(
    'chainId', defaultChainId, chainIdSource, overrides.chainId, resolvedFrom, sources,
  ) ?? defaultChainId;

  // executedAt：默认最后一笔 tx 的区块时间。
  const overrideExecutedAt = text(overrides.executedAt);
  if (overrideExecutedAt && Number.isNaN(Date.parse(overrideExecutedAt))) {
    throw new Error(`overrides.executedAt=${overrideExecutedAt} 不是可解析的时间。`);
  }
  const executedAt = resolveField(
    'executedAt', input.latestBlockTimestampIso, '最后一笔 tx 所在区块的 timestamp（eth_getBlockByNumber）',
    overrideExecutedAt ? new Date(overrideExecutedAt).toISOString() : undefined, resolvedFrom, sources,
  ) ?? input.latestBlockTimestampIso;

  const note = text(overrides.note);
  if (note) {
    resolvedFrom.note = 'override';
    sources.note = 'overrides.note';
  }

  return {
    chainId,
    forkOf,
    contractVersion,
    contractHead,
    frontendHead: frontendHead ?? '',
    deploymentId: input.binding.binding.deploymentId,
    deploymentManifest: input.binding.binding.manifestName,
    executedAt,
    ...(note ? { note } : {}),
    resolvedFrom,
    sources,
    warnings,
  };
}

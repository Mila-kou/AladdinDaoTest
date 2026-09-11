import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

/**
 * 基线唯一登记（单一事实源）读取器。
 *
 * 登记文件：`Docs/contract-releases/CURRENT.json`（相对 TestCode 根 `../Docs/contract-releases/CURRENT.json`）。
 * 语义约定（2026-08-21）：
 * - `primary`      = 目标测试版本（run.targetRelease 来源）；
 * - `environments` = 各执行环境 fork 自哪一次部署（`forkOf` → `deployments[].id`）；
 * - `deployments`  = 已知部署及其 `releaseLabel`（run.release =「环境实际部署版本」的来源）；
 * - 二者不一致时 run.releaseMismatch = true，看板显著标注「环境基线 ≠ 目标基线」。
 *
 * 文件缺失或无法解析时一律返回 undefined 并 console.warn 一次，不得抛错——
 * Reporter、看板渲染、lint 都必须在没有登记文件的机器上继续工作（回退到既有 E2E_RELEASE 机制）。
 */

export const BASELINE_REGISTRY_RELATIVE_PATH = '../Docs/contract-releases/CURRENT.json';

export interface BaselineDeployment {
  readonly id: string;
  readonly network?: string;
  readonly chainId?: number;
  readonly version?: string;
  readonly releaseLabel?: string;
  readonly paramsExport?: string;
  readonly note?: string;
}

export interface BaselineEnvironment {
  readonly chainId?: number;
  readonly forkOf?: string | null;
  readonly status?: string;
  readonly note?: string;
}

export interface BaselineReleaseRef {
  readonly version: string;
  readonly branch?: string;
  readonly repoPath?: string;
  readonly head?: string;
  readonly deliverables?: string;
  readonly admission?: string;
  readonly admissionSource?: string;
}

export interface BaselineRegistry {
  readonly updatedAt?: string;
  readonly primary: BaselineReleaseRef;
  readonly comparison?: BaselineReleaseRef;
  readonly frontend?: { readonly repoPath?: string; readonly branch?: string };
  readonly deployments: readonly BaselineDeployment[];
  readonly environments: Readonly<Record<string, BaselineEnvironment>>;
  readonly excluded?: ReadonlyArray<{ readonly path: string; readonly reason?: string }>;
  readonly history?: ReadonlyArray<{ readonly date: string; readonly change: string }>;
}

export interface TargetRelease {
  /** 目标版本号，如 `v0.3.2`。 */
  readonly version: string;
  /** 运行记录里使用的标签形式，如 `release-v0.3.2`。 */
  readonly label: string;
  readonly branch?: string;
  readonly head?: string;
  readonly admission?: string;
  /** 登记文件的工作区相对路径，供看板展示来源。 */
  readonly source: string;
}

export interface EnvironmentRelease {
  /** 部署版本号，如 `v0.3.1`。 */
  readonly version: string;
  /** 部署标签，如 `release-v0.3.1`（来自 `deployments[].releaseLabel`）。 */
  readonly label: string;
  readonly deploymentId: string;
  readonly chainId?: number;
  readonly environmentChainId?: number;
  readonly source: 'CURRENT.json';
}

const VERSION_PATTERN = /v\d+\.\d+\.\d+/;

/** 从 `release-v0.3.1`、`release/v0.3.1`、`release-v0.3.1@d9a7fd2`、`v0.3.1` 等写法里抽出 `v0.3.1`；抽不出返回 undefined。 */
export function normalizeReleaseVersion(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  const match = VERSION_PATTERN.exec(value);
  return match ? match[0] : undefined;
}

/** `v0.3.2` → `release-v0.3.2`（与 run.release / 批次 release 的既有标签形式一致）。 */
export function releaseLabelFor(version: string): string {
  const normalized = normalizeReleaseVersion(version) ?? version;
  return normalized.startsWith('release-') ? normalized : `release-${normalized}`;
}

export function baselineRegistryPath(projectRoot: string = process.cwd()): string {
  return resolve(projectRoot, BASELINE_REGISTRY_RELATIVE_PATH);
}

/** 看板上展示用的相对路径（相对工作区根，如 `Docs/contract-releases/CURRENT.json`）。 */
export function baselineRegistryDisplayPath(projectRoot: string = process.cwd()): string {
  return relative(resolve(projectRoot, '..'), baselineRegistryPath(projectRoot)).replaceAll('\\', '/');
}

const registryCache = new Map<string, BaselineRegistry | undefined>();
const warnedPaths = new Set<string>();

function warnOnce(path: string, message: string): void {
  if (warnedPaths.has(path)) return;
  warnedPaths.add(path);
  console.warn(`[baseline] ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseRegistry(raw: unknown, path: string): BaselineRegistry | undefined {
  if (!isRecord(raw)) {
    warnOnce(path, `基线登记 ${path} 不是 JSON 对象，忽略。`);
    return undefined;
  }
  const primary = raw.primary;
  if (!isRecord(primary) || typeof primary.version !== 'string' || !normalizeReleaseVersion(primary.version)) {
    warnOnce(path, `基线登记 ${path} 缺少合法的 primary.version（形如 v0.3.2），忽略。`);
    return undefined;
  }
  const deployments = Array.isArray(raw.deployments)
    ? raw.deployments.filter((item): item is BaselineDeployment => isRecord(item) && typeof item.id === 'string')
    : [];
  const environments: Record<string, BaselineEnvironment> = {};
  if (isRecord(raw.environments)) {
    for (const [name, value] of Object.entries(raw.environments)) {
      if (isRecord(value)) environments[name] = value as BaselineEnvironment;
    }
  }
  const comparison = isRecord(raw.comparison) && typeof raw.comparison.version === 'string'
    ? (raw.comparison as unknown as BaselineReleaseRef)
    : undefined;
  return {
    ...(typeof raw.updatedAt === 'string' ? { updatedAt: raw.updatedAt } : {}),
    primary: primary as unknown as BaselineReleaseRef,
    ...(comparison ? { comparison } : {}),
    ...(isRecord(raw.frontend) ? { frontend: raw.frontend as NonNullable<BaselineRegistry['frontend']> } : {}),
    deployments,
    environments,
    ...(Array.isArray(raw.excluded) ? { excluded: raw.excluded as NonNullable<BaselineRegistry['excluded']> } : {}),
    ...(Array.isArray(raw.history) ? { history: raw.history as NonNullable<BaselineRegistry['history']> } : {}),
  };
}

/**
 * 读取并缓存基线登记。缺失 / 解析失败 → undefined + 一次 console.warn，绝不抛错。
 * 传 `{ reload: true }` 可绕过缓存（lint、长期运行的看板服务按需使用）。
 */
export function loadBaselineRegistry(
  projectRoot: string = process.cwd(),
  options: { readonly reload?: boolean } = {},
): BaselineRegistry | undefined {
  const path = baselineRegistryPath(projectRoot);
  if (!options.reload && registryCache.has(path)) return registryCache.get(path);
  let registry: BaselineRegistry | undefined;
  try {
    registry = parseRegistry(JSON.parse(readFileSync(path, 'utf8')) as unknown, path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    warnOnce(
      path,
      code === 'ENOENT'
        ? `未找到基线登记 ${path}；run.targetRelease / releaseMismatch 将留空，run.release 回退到 E2E_RELEASE。`
        : `基线登记 ${path} 读取失败（${error instanceof Error ? error.message : String(error)}），按缺失处理。`,
    );
    registry = undefined;
  }
  registryCache.set(path, registry);
  return registry;
}

/** 目标测试版本（CURRENT.json primary）。登记缺失时 undefined。 */
export function targetRelease(projectRoot: string = process.cwd()): TargetRelease | undefined {
  const registry = loadBaselineRegistry(projectRoot);
  if (!registry) return undefined;
  const version = normalizeReleaseVersion(registry.primary.version);
  if (!version) return undefined;
  return {
    version,
    label: releaseLabelFor(version),
    ...(registry.primary.branch ? { branch: registry.primary.branch } : {}),
    ...(registry.primary.head ? { head: registry.primary.head } : {}),
    ...(registry.primary.admission ? { admission: registry.primary.admission } : {}),
    source: baselineRegistryDisplayPath(projectRoot),
  };
}

/**
 * 环境实际部署版本：`environments[env].forkOf` → `deployments[].releaseLabel`。
 * 无登记、环境未登记、`forkOf` 为空（如 time-fork pending）或找不到对应部署 → undefined，由调用方回退既有机制。
 */
export function resolveEnvironmentRelease(
  environmentName: string,
  projectRoot: string = process.cwd(),
): EnvironmentRelease | undefined {
  const registry = loadBaselineRegistry(projectRoot);
  if (!registry) return undefined;
  const environment = registry.environments[environmentName];
  if (!environment?.forkOf) return undefined;
  const deployment = registry.deployments.find((item) => item.id === environment.forkOf);
  if (!deployment) return undefined;
  const label = deployment.releaseLabel ?? (deployment.version ? releaseLabelFor(deployment.version) : undefined);
  const version = normalizeReleaseVersion(label) ?? normalizeReleaseVersion(deployment.version);
  if (!label || !version) return undefined;
  return {
    version,
    label,
    deploymentId: deployment.id,
    ...(typeof deployment.chainId === 'number' ? { chainId: deployment.chainId } : {}),
    ...(typeof environment.chainId === 'number' ? { environmentChainId: environment.chainId } : {}),
    source: 'CURRENT.json',
  };
}

/**
 * 环境基线是否 ≠ 目标基线。按 vN.N.N 归一化后比较；任一方缺失返回 undefined（无法判定，不算不一致）。
 * `release` 允许是 `a | b` 形式的多环境联合标签：任一段版本 ≠ 目标即视为不一致。
 */
export function isReleaseMismatch(
  release: string | undefined,
  target: string | undefined,
): boolean | undefined {
  const targetVersion = normalizeReleaseVersion(target);
  if (!release || !targetVersion) return undefined;
  const versions = release.split('|').map((part) => normalizeReleaseVersion(part.trim())).filter(Boolean);
  if (versions.length === 0) return undefined;
  return versions.some((version) => version !== targetVersion);
}

export interface ResolvedRunRelease {
  readonly release?: string;
  readonly source?: 'CURRENT.json' | 'E2E_RELEASE';
  /** 每个环境的解析明细（仅 CURRENT.json 命中的环境）。 */
  readonly perEnvironment: ReadonlyArray<{ readonly environment: string; readonly release: EnvironmentRelease }>;
}

/**
 * 为一次运行解析 run.release（环境实际部署版本）。
 * 优先级：CURRENT.json 环境映射（多个环境映射到不同部署时以 ` | ` 连接）→ 回退 `E2E_RELEASE`（既有机制）→ 空。
 */
export function resolveRunRelease(
  environmentNames: readonly string[],
  fallbackRelease: string | undefined = process.env.E2E_RELEASE,
  projectRoot: string = process.cwd(),
): ResolvedRunRelease {
  const perEnvironment = environmentNames.flatMap((environment) => {
    const release = resolveEnvironmentRelease(environment, projectRoot);
    return release ? [{ environment, release }] : [];
  });
  const labels = [...new Set(perEnvironment.map((item) => item.release.label))];
  if (labels.length > 0) return { release: labels.join(' | '), source: 'CURRENT.json', perEnvironment };
  const fallback = fallbackRelease?.trim();
  if (fallback) return { release: fallback, source: 'E2E_RELEASE', perEnvironment };
  return { perEnvironment };
}

/** 看板页头展示用的基线视图（渲染时实时读取 CURRENT.json，历史产物中记录的 targetRelease 另列）。 */
export interface BaselineView {
  readonly registryPath: string;
  readonly registryFound: boolean;
  readonly updatedAt?: string;
  readonly target?: TargetRelease;
  readonly comparisonVersion?: string;
  /** 本次运行记录的环境实际部署版本（run.release）。 */
  readonly environmentRelease?: string;
  readonly environmentVersion?: string;
  readonly releaseSource?: string;
  /** 运行产物里 Reporter 写入时的目标版本（可能与当前 CURRENT.json 不同）。 */
  readonly recordedTargetRelease?: string;
  readonly recordedMismatch?: boolean;
  /** 以当前 CURRENT.json 目标版本为准重新判定的不一致结论。 */
  readonly mismatch?: boolean;
  readonly environments: ReadonlyArray<{
    readonly name: string;
    readonly chainId?: number;
    readonly forkOf?: string | null;
    readonly status?: string;
    readonly releaseLabel?: string;
    readonly releaseVersion?: string;
  }>;
}

export function buildBaselineView(
  run: {
    readonly release?: string | undefined;
    readonly releaseSource?: string | undefined;
    readonly targetRelease?: string | undefined;
    readonly releaseMismatch?: boolean | undefined;
  },
  projectRoot: string = process.cwd(),
): BaselineView {
  const registry = loadBaselineRegistry(projectRoot);
  const target = targetRelease(projectRoot);
  const environments = registry
    ? Object.entries(registry.environments).map(([name, definition]) => {
      const resolved = resolveEnvironmentRelease(name, projectRoot);
      return {
        name,
        ...(typeof definition.chainId === 'number' ? { chainId: definition.chainId } : {}),
        ...(definition.forkOf !== undefined ? { forkOf: definition.forkOf } : {}),
        ...(definition.status ? { status: definition.status } : {}),
        ...(resolved ? { releaseLabel: resolved.label, releaseVersion: resolved.version } : {}),
      };
    })
    : [];
  const environmentVersion = normalizeReleaseVersion(run.release);
  const mismatch = isReleaseMismatch(run.release, target?.version);
  return {
    registryPath: baselineRegistryDisplayPath(projectRoot),
    registryFound: Boolean(registry),
    ...(registry?.updatedAt ? { updatedAt: registry.updatedAt } : {}),
    ...(target ? { target } : {}),
    ...(registry?.comparison?.version ? { comparisonVersion: normalizeReleaseVersion(registry.comparison.version) ?? registry.comparison.version } : {}),
    ...(run.release ? { environmentRelease: run.release } : {}),
    ...(environmentVersion ? { environmentVersion } : {}),
    ...(run.releaseSource ? { releaseSource: run.releaseSource } : {}),
    ...(run.targetRelease ? { recordedTargetRelease: run.targetRelease } : {}),
    ...(run.releaseMismatch !== undefined ? { recordedMismatch: run.releaseMismatch } : {}),
    ...(mismatch !== undefined ? { mismatch } : {}),
    environments,
  };
}

/** 页头一行文案：「目标基线 vX（CURRENT.json）｜环境基线 vY」。 */
export function baselineHeadline(view: BaselineView): string {
  const target = view.target
    ? `目标基线 ${view.target.version}（${view.registryPath}）`
    : `目标基线 未登记（${view.registryPath} ${view.registryFound ? '缺少 primary' : '缺失'}）`;
  const environment = view.environmentRelease
    ? `环境基线 ${view.environmentVersion ?? view.environmentRelease}${view.environmentVersion && view.environmentVersion !== view.environmentRelease ? `（${view.environmentRelease}）` : ''}`
    : '环境基线 未知（运行记录无 release）';
  return `${target}｜${environment}`;
}

export const RELEASE_MISMATCH_BADGE = '环境基线 ≠ 目标基线：本批不充当目标版本回归材料';

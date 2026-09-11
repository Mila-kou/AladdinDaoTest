import { readFileSync, statSync } from 'node:fs';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

import { z } from 'zod';

import {
  environmentNames,
  type EnvironmentName,
} from '../../config/environments/catalog.js';
import {
  loadBaselineRegistry,
  normalizeReleaseVersion,
} from './baseline.js';
import {
  deploymentManifestSchema,
  type DeploymentManifest,
} from './deployment.js';

/**
 * 每个执行环境绑定自己的 deployment manifest。这里是运行时唯一的 manifest 选择入口；
 * `.env.local` 里的遗留 E2E_DEPLOYMENT_MANIFEST 不再参与选择，避免看板切换环境后沿用上一个环境的地址。
 */
export const ENVIRONMENT_BINDINGS_RELATIVE_PATH = 'config/environment-bindings.json';

const commitSchema = z.string().regex(/^[0-9a-f]{40}$/i);
const bindingSchema = z.object({
  deploymentId: z.string().min(1),
  manifest: z.string().regex(/^\.\/config\/deployments\/[A-Za-z0-9._-]+\.json$/),
  manifestName: z.string().min(1),
  release: z.string().regex(/^v\d+\.\d+\.\d+$/),
  contractCommit: commitSchema,
  /** RPC 必须返回的环境 Chain ID；Fork 与原部署链可以不同。 */
  environmentChainId: z.number().int().positive(),
  /** manifest 记录的部署链 Chain ID。 */
  deploymentChainId: z.number().int().positive(),
  /** config-dump 使用的版本化 key registry。 */
  parameterRegistry: z.string().min(1),
  /** 与该合约 commit 对应、包含 bytecode 的 Foundry out 或 Hardhat artifacts。 */
  artifactDirectory: z.string().min(1),
});

const bindingsShape = Object.fromEntries(
  environmentNames.map((name) => [name, bindingSchema]),
) as Record<EnvironmentName, typeof bindingSchema>;

export const environmentBindingRegistrySchema = z.object({
  schemaVersion: z.literal(1),
  bindings: z.object(bindingsShape),
});

export type EnvironmentBinding = z.infer<typeof bindingSchema>;
export type EnvironmentBindingRegistry = z.infer<typeof environmentBindingRegistrySchema>;

export interface EnvironmentBindingContext {
  readonly environment: EnvironmentName;
  readonly registryPath: string;
  readonly binding: EnvironmentBinding;
  readonly manifestPath: string;
  readonly manifest: DeploymentManifest;
  readonly deploymentDirectory?: string;
  readonly addressesFile?: string;
  readonly parameterRegistryPath: string;
  readonly artifactDirectory: string;
}

function toProjectRelative(projectRoot: string, path: string): string {
  const value = relative(projectRoot, path).split(sep).join('/');
  return value.startsWith('.') ? value : `./${value}`;
}

export function environmentBindingsPath(projectRoot: string = process.cwd()): string {
  return resolve(projectRoot, ENVIRONMENT_BINDINGS_RELATIVE_PATH);
}

export function loadEnvironmentBindingRegistry(
  projectRoot: string = process.cwd(),
): EnvironmentBindingRegistry {
  const path = environmentBindingsPath(projectRoot);
  let source: string;
  try {
    source = readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(
      `缺少环境部署绑定表 ${toProjectRelative(projectRoot, path)}：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    return environmentBindingRegistrySchema.parse(JSON.parse(source) as unknown);
  } catch (error) {
    throw new Error(
      `环境部署绑定表 ${toProjectRelative(projectRoot, path)} 不合法：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function assertBindingMatchesManifest(
  environment: EnvironmentName,
  binding: EnvironmentBinding,
  manifest: DeploymentManifest,
): void {
  const failures: string[] = [];
  const manifestVersion = normalizeReleaseVersion(manifest.release);
  if (manifest.name !== binding.manifestName) {
    failures.push(`manifest.name=${manifest.name}，绑定=${binding.manifestName}`);
  }
  if (manifestVersion !== binding.release) {
    failures.push(`manifest.release=${manifest.release}，绑定=${binding.release}`);
  }
  if (!manifest.release.toLowerCase().includes(binding.contractCommit.toLowerCase())) {
    failures.push(`manifest.release 未包含绑定 commit ${binding.contractCommit}`);
  }
  if (manifest.chainId !== binding.deploymentChainId) {
    failures.push(`manifest.chainId=${manifest.chainId}，绑定部署链=${binding.deploymentChainId}`);
  }
  if (failures.length > 0) {
    throw new Error(`环境 ${environment} 的 deployment manifest 与绑定表不一致：${failures.join('；')}`);
  }
}

function assertParameterSnapshotMatchesBinding(
  projectRoot: string,
  environment: EnvironmentName,
  binding: EnvironmentBinding,
  manifest: DeploymentManifest,
): void {
  const parametersFile = manifest.source?.parametersFile;
  if (!parametersFile) return;
  const path = resolve(projectRoot, parametersFile);
  let snapshot: {
    meta?: {
      chainId?: number;
      dataStore?: string;
      contracts?: { commit?: string };
    };
  };
  try {
    snapshot = JSON.parse(readFileSync(path, 'utf8')) as typeof snapshot;
  } catch (error) {
    throw new Error(
      `环境 ${environment} 无法读取绑定部署的参数快照 ${parametersFile}：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const failures: string[] = [];
  if (snapshot.meta?.chainId !== binding.deploymentChainId) {
    failures.push(`snapshot chainId=${snapshot.meta?.chainId ?? '缺失'}，绑定部署链=${binding.deploymentChainId}`);
  }
  if (snapshot.meta?.dataStore?.toLowerCase() !== manifest.contracts.dataStore.toLowerCase()) {
    failures.push(`snapshot DataStore=${snapshot.meta?.dataStore ?? '缺失'}，manifest=${manifest.contracts.dataStore}`);
  }
  if (snapshot.meta?.contracts?.commit?.toLowerCase() !== binding.contractCommit.toLowerCase()) {
    failures.push(`snapshot commit=${snapshot.meta?.contracts?.commit ?? '缺失'}，绑定=${binding.contractCommit}`);
  }
  if (failures.length > 0) {
    throw new Error(`环境 ${environment} 的参数快照与绑定部署不一致：${failures.join('；')}`);
  }
}

function assertBindingMatchesBaseline(
  projectRoot: string,
  environment: EnvironmentName,
  binding: EnvironmentBinding,
): void {
  const registry = loadBaselineRegistry(projectRoot, { reload: true });
  if (!registry) return;
  const deployment = registry.deployments.find((item) => item.id === binding.deploymentId);
  if (!deployment) {
    throw new Error(`环境 ${environment} 绑定 deploymentId=${binding.deploymentId}，但 CURRENT.json deployments[] 未登记该部署。`);
  }
  const deploymentVersion = normalizeReleaseVersion(deployment.releaseLabel)
    ?? normalizeReleaseVersion(deployment.version);
  if (deploymentVersion !== binding.release) {
    throw new Error(
      `环境 ${environment} 绑定版本=${binding.release}，CURRENT.json 部署 ${binding.deploymentId} 版本=${deploymentVersion ?? '无法识别'}。`,
    );
  }
  if (typeof deployment.chainId === 'number' && deployment.chainId !== binding.deploymentChainId) {
    throw new Error(
      `环境 ${environment} 绑定部署链=${binding.deploymentChainId}，CURRENT.json 部署链=${deployment.chainId}。`,
    );
  }
  const baselineEnvironment = registry.environments[environment];
  if (!baselineEnvironment) return;
  if (baselineEnvironment.forkOf !== binding.deploymentId) {
    throw new Error(
      `环境 ${environment} 绑定 deploymentId=${binding.deploymentId}，CURRENT.json environments.${environment}.forkOf=${baselineEnvironment.forkOf ?? 'null'}。`,
    );
  }
  if (typeof baselineEnvironment.chainId === 'number'
    && baselineEnvironment.chainId !== binding.environmentChainId) {
    throw new Error(
      `环境 ${environment} 绑定运行链=${binding.environmentChainId}，CURRENT.json 环境链=${baselineEnvironment.chainId}。`,
    );
  }
}

export function loadEnvironmentBinding(
  projectRoot: string,
  environment: EnvironmentName,
): EnvironmentBindingContext {
  const registryPath = environmentBindingsPath(projectRoot);
  const binding = loadEnvironmentBindingRegistry(projectRoot).bindings[environment];
  const manifestPath = resolve(projectRoot, binding.manifest);
  let manifest: DeploymentManifest;
  try {
    manifest = deploymentManifestSchema.parse(
      JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown,
    );
  } catch (error) {
    throw new Error(
      `环境 ${environment} 无法读取绑定的 manifest ${binding.manifest}：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  assertBindingMatchesManifest(environment, binding, manifest);
  assertBindingMatchesBaseline(projectRoot, environment, binding);
  assertParameterSnapshotMatchesBinding(projectRoot, environment, binding, manifest);
  const parameterRegistryPath = resolve(projectRoot, binding.parameterRegistry);
  try {
    const parameterRegistry = JSON.parse(readFileSync(parameterRegistryPath, 'utf8')) as {
      generatedFrom?: { commit?: string };
    };
    const registryCommit = parameterRegistry.generatedFrom?.commit;
    if (registryCommit?.toLowerCase() !== binding.contractCommit.toLowerCase()) {
      throw new Error(`registry commit=${registryCommit ?? '缺失'}，绑定=${binding.contractCommit}`);
    }
  } catch (error) {
    throw new Error(
      `环境 ${environment} 的参数 registry 与绑定不一致（${binding.parameterRegistry}）：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const artifactDirectory = resolve(projectRoot, binding.artifactDirectory);
  try {
    if (!statSync(artifactDirectory).isDirectory()) throw new Error('不是目录');
  } catch (error) {
    throw new Error(
      `环境 ${environment} 的 artifactDirectory 不可用（${binding.artifactDirectory}）：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return {
    environment,
    registryPath,
    binding,
    manifestPath,
    manifest,
    ...(manifest.source?.deploymentDirectory
      ? { deploymentDirectory: resolve(projectRoot, manifest.source.deploymentDirectory) }
      : {}),
    ...(manifest.source?.addressesFile
      ? { addressesFile: resolve(projectRoot, manifest.source.addressesFile) }
      : {}),
    parameterRegistryPath,
    artifactDirectory,
  };
}

const rpcValidationCache = new Map<string, Promise<void>>();

async function rpcCall(rpcUrl: string, method: string, params: readonly unknown[]): Promise<unknown> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json() as { result?: unknown; error?: { message?: string } };
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (body.error) throw new Error(body.error.message ?? 'unknown RPC error');
  return body.result;
}

/**
 * 在发交易前核对 RPC 实际链和关键合约 bytecode。后者能阻止「新建了 Fork，
 * 但仍沿用旧 Fork 上私有部署 manifest」这类同 Chain ID 的静默串用。
 */
export async function assertRuntimeEnvironmentBinding(input: {
  readonly environment: EnvironmentName;
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly deploymentManifestPath: string;
  readonly deploymentId: string;
  readonly deploymentRelease: string;
  readonly requestTimeoutMs: number;
}, projectRoot: string = process.cwd()): Promise<void> {
  const context = loadEnvironmentBinding(projectRoot, input.environment);
  const failures: string[] = [];
  if (resolve(input.deploymentManifestPath) !== resolve(context.manifestPath)) {
    failures.push(`runtime manifest=${input.deploymentManifestPath}，绑定=${context.manifestPath}`);
  }
  if (input.deploymentId !== context.binding.deploymentId) {
    failures.push(`runtime deploymentId=${input.deploymentId}，绑定=${context.binding.deploymentId}`);
  }
  if (input.deploymentRelease !== context.binding.release) {
    failures.push(`runtime release=${input.deploymentRelease}，绑定=${context.binding.release}`);
  }
  if (input.chainId !== context.binding.environmentChainId) {
    failures.push(`runtime chainId=${input.chainId}，绑定运行链=${context.binding.environmentChainId}`);
  }
  if (failures.length > 0) {
    throw new Error(`环境 ${input.environment} 运行配置与部署绑定不一致：${failures.join('；')}`);
  }

  const cacheKey = `${input.environment}\0${input.rpcUrl}\0${context.manifestPath}`;
  let validation = rpcValidationCache.get(cacheKey);
  if (!validation) {
    validation = (async () => {
      const chainRaw = await rpcCall(input.rpcUrl, 'eth_chainId', []);
      if (typeof chainRaw !== 'string' || !/^0x[0-9a-f]+$/i.test(chainRaw)) {
        throw new Error(`环境 ${input.environment} RPC 未返回合法 eth_chainId。`);
      }
      const actualChainId = Number(BigInt(chainRaw));
      if (actualChainId !== context.binding.environmentChainId) {
        throw new Error(
          `环境 ${input.environment} RPC chainId=${actualChainId}，绑定=${context.binding.environmentChainId}。`,
        );
      }
      const criticalContracts = [
        ['dataStore', context.manifest.contracts.dataStore],
        ['reader', context.manifest.contracts.reader],
        ['config', context.manifest.contracts.config],
      ] as const;
      const codes = await Promise.all(criticalContracts.map(([, address]) =>
        rpcCall(input.rpcUrl, 'eth_getCode', [address, 'latest'])));
      const missing = criticalContracts.filter((_, index) => {
        const code = codes[index];
        return typeof code !== 'string' || code === '0x' || code === '0x0';
      }).map(([name, address]) => `${name}@${address}`);
      if (missing.length > 0) {
        throw new Error(
          `环境 ${input.environment} RPC 上找不到绑定部署 ${context.binding.deploymentId} 的关键合约 bytecode：${missing.join('、')}`,
        );
      }
    })();
    rpcValidationCache.set(cacheKey, validation);
    validation.catch(() => rpcValidationCache.delete(cacheKey));
  }
  await new Promise<void>((resolveValidation, rejectValidation) => {
    const timeout = setTimeout(
      () => rejectValidation(new Error(`环境 ${input.environment} 部署绑定 RPC 校验超时。`)),
      input.requestTimeoutMs,
    );
    validation!.then(
      () => { clearTimeout(timeout); resolveValidation(); },
      (error) => { clearTimeout(timeout); rejectValidation(error); },
    );
  });
}

export async function updateEnvironmentBinding(
  projectRoot: string,
  environment: EnvironmentName,
  binding: EnvironmentBinding,
): Promise<void> {
  const path = environmentBindingsPath(projectRoot);
  const registry = environmentBindingRegistrySchema.parse(
    JSON.parse(await readFile(path, 'utf8')) as unknown,
  );
  const next = environmentBindingRegistrySchema.parse({
    ...registry,
    bindings: { ...registry.bindings, [environment]: binding },
  });
  const temporary = `${path}.${process.pid}-${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
}

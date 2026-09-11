import { getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import type { RuntimeConfig } from '../config/runtime.js';
import type { Address } from '../evidence/evidence-v3.js';
import {
  InvalidTestEnvironmentError,
  validateTestEnvironmentDefinition,
  type MarketMode,
  type MockResourceAlias,
  type OracleMode,
  type ResolvedTestEnvironment,
  type SigningMode,
  type TimeMode,
} from '../domain/test-environment.js';

/**
 * The execution choice resolved by the caller. It deliberately excludes the
 * project: the actual project always comes from RuntimeConfig.
 */
export interface RuntimeExecutionSelection {
  readonly marketMode: MarketMode;
  readonly oracleMode: OracleMode;
  readonly timeMode: TimeMode;
  readonly signingMode: SigningMode;
  readonly mockResourceAlias: MockResourceAlias;
}

export interface RuntimeMarketIdentity {
  readonly marketIndex?: number;
  readonly marketAddress?: Address;
}

/** Exact-optional shape assignable to both the legacy V2 and canonical V3 envelopes. */
export interface RuntimeEnvironmentIdentity {
  readonly name: string;
  readonly chainId: number;
  readonly deploymentId: string;
  readonly release: string;
  readonly fork?: {
    readonly provider: string;
    readonly displayName?: string;
  };
  readonly market?: {
    readonly mode: string;
    readonly resourceAlias: string;
    readonly marketIndex?: number;
    readonly marketAddress?: Address;
  };
}

function fail(message: string): never {
  throw new InvalidTestEnvironmentError(message);
}

function validateResolvedEnvironment(environment: ResolvedTestEnvironment): void {
  const marketCompatibility = environment.marketMode === 'mock-market'
    ? 'mock-only' as const
    : environment.marketMode === 'deployed-market'
      ? 'deployed-only' as const
      : 'not-applicable' as const;

  // The domain currently exposes validation for the complete eight-field
  // definition. Build a runtime-only definition here so its shape, paired
  // Market/Oracle modes, alias rules and time-fork rules stay authoritative.
  validateTestEnvironmentDefinition({
    ...environment,
    marketCompatibility,
    environmentSetup: 'RuntimeConfig + RuntimeExecutionSelection',
  });
}

function assertPrivateKeyAccount(
  label: string,
  privateKey: `0x${string}` | undefined,
  expectedAccount: `0x${string}` | undefined,
): void {
  if (!privateKey || !expectedAccount) fail(`${label} 缺少私钥或账户地址`);
  if (getAddress(privateKeyToAccount(privateKey).address) !== getAddress(expectedAccount)) {
    fail(`${label} 私钥与账户地址不匹配`);
  }
}

/**
 * Assert that an already resolved execution environment is backed by the
 * actual RuntimeConfig. This performs no I/O and must run before any Executor.
 */
export function assertRuntimeMatchesResolvedEnvironment(
  runtime: RuntimeConfig,
  environment: ResolvedTestEnvironment,
): void {
  validateResolvedEnvironment(environment);

  if (environment.targetProject !== runtime.environment) {
    fail(`运行环境 targetProject=${environment.targetProject}，RuntimeConfig.environment=${runtime.environment}`);
  }
  if (runtime.definition.name !== runtime.environment) {
    fail(`RuntimeConfig.definition.name=${runtime.definition.name} 与 environment=${runtime.environment} 不一致`);
  }

  if (environment.marketMode === 'mock-market') {
    if (!runtime.definition.permitsOracleMutation) {
      fail(`${runtime.environment} 不允许 Mock Oracle 写入`);
    }
    if (!runtime.definition.initializesDefaultMockResources) {
      fail(`${runtime.environment} 未声明 Mock Market 资源能力`);
    }
    if (!runtime.adminRpcUrl) {
      fail(`${runtime.environment} 使用 Mock Market/Oracle 时缺少 admin RPC`);
    }
  }

  if (environment.timeMode === 'controllable-time') {
    if (!runtime.definition.permitsTimeTravel) {
      fail(`${runtime.environment} 不支持 controllable-time`);
    }
    if (!runtime.adminRpcUrl) {
      fail(`${runtime.environment} 使用 controllable-time 时缺少 admin RPC`);
    }
  }

  if (environment.signingMode === 'readonly') return;
  if (!runtime.definition.permitsTransactions) {
    fail(`${runtime.environment} 禁止交易，不能使用 ${environment.signingMode}`);
  }
  if (runtime.signingMode !== 'private-key') {
    fail(`${environment.signingMode} 不能由 RuntimeConfig.signingMode=${runtime.signingMode} 冒充`);
  }
  if (!runtime.testAccount) fail(`${environment.signingMode} 缺少 Trader 账户`);
  if (!runtime.keeperAccount) fail(`${environment.signingMode} 缺少 Keeper 账户`);

  if (environment.signingMode === 'trader-keeper-private-key') {
    if (!runtime.hasPrimaryTestWallet) fail('trader-keeper-private-key 缺少 Trader 私钥钱包');
    if (!runtime.hasSecondaryTestWallet) fail('trader-keeper-private-key 缺少 Keeper 私钥钱包');
    assertPrivateKeyAccount('Trader', runtime.testPrivateKey, runtime.testAccount);
    assertPrivateKeyAccount('Keeper', runtime.secondaryTestPrivateKey, runtime.keeperAccount);
    return;
  }

  // Browser-wallet flows do not require the Trader private key to be exposed to
  // RuntimeConfig. Inline Keeper still needs a locally verifiable Keeper key;
  // service mode owns its signer outside this process.
  if (runtime.keeperMode === 'inline') {
    if (!runtime.hasSecondaryTestWallet) fail('browser-wallet-keeper + inline Keeper 缺少 Keeper 私钥钱包');
    assertPrivateKeyAccount('Keeper', runtime.secondaryTestPrivateKey, runtime.keeperAccount);
  }
}

/** Build the only runtime-derived ResolvedTestEnvironment; never reads process.env. */
export function resolveRuntimeTestEnvironment(
  runtime: RuntimeConfig,
  selection: RuntimeExecutionSelection,
): ResolvedTestEnvironment {
  const environment: ResolvedTestEnvironment = {
    targetProject: runtime.environment,
    marketMode: selection.marketMode,
    oracleMode: selection.oracleMode,
    timeMode: selection.timeMode,
    signingMode: selection.signingMode,
    mockResourceAlias: selection.mockResourceAlias,
  };
  assertRuntimeMatchesResolvedEnvironment(runtime, environment);
  return Object.freeze(environment);
}

/**
 * Build the persisted Evidence identity exclusively from the validated runtime
 * binding and resolved execution choice. Display labels from a legacy runner
 * are deliberately not accepted as deployment identity.
 */
export function buildRuntimeEnvironmentIdentity(
  runtime: RuntimeConfig,
  resolvedEnvironment: ResolvedTestEnvironment,
  market?: RuntimeMarketIdentity,
): RuntimeEnvironmentIdentity {
  assertRuntimeMatchesResolvedEnvironment(runtime, resolvedEnvironment);
  return {
    name: runtime.environment,
    chainId: runtime.chainId,
    deploymentId: runtime.deploymentId,
    release: runtime.deploymentRelease,
    ...(['tx-fork', 'oracle-fork', 'time-fork'].includes(runtime.environment)
      ? {
        fork: {
          provider: 'tenderly-vnet',
          ...(runtime.forkDisplayName ? { displayName: runtime.forkDisplayName } : {}),
        },
      }
      : {}),
    ...(resolvedEnvironment.marketMode === 'not-applicable'
      ? {}
      : {
        market: {
          mode: resolvedEnvironment.marketMode,
          resourceAlias: resolvedEnvironment.mockResourceAlias,
          ...(market?.marketIndex === undefined ? {} : { marketIndex: market.marketIndex }),
          ...(market?.marketAddress === undefined ? {} : { marketAddress: market.marketAddress }),
        },
      }),
  };
}

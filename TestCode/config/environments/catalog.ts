export const environmentNames = [
  'dev-readonly',
  'tx-fork',
  'oracle-fork',
  'time-fork',
  'base-sepolia',
] as const;

export type EnvironmentName = (typeof environmentNames)[number];

export interface EnvironmentDefinition {
  readonly name: EnvironmentName;
  readonly rpcEnvironmentVariable: string;
  readonly wssEnvironmentVariable?: string;
  /** 环境/Fork 独立的固定 chainId；允许不同 Fork 使用不同链。 */
  readonly chainIdEnvironmentVariable?: string;
  readonly adminRpcEnvironmentVariable?: string;
  readonly permitsTransactions: boolean;
  readonly permitsOracleMutation: boolean;
  readonly permitsTimeTravel: boolean;
  readonly requiresBaselineReset: boolean;
  readonly stateSyncDuringRun: boolean;
  readonly initializesDefaultMockResources: boolean;
  readonly defaultMockResourceAlias?: 'default-mock';
}

export const environments: Record<EnvironmentName, EnvironmentDefinition> = {
  'dev-readonly': {
    name: 'dev-readonly',
    rpcEnvironmentVariable: 'E2E_DEV_RPC_URL',
    chainIdEnvironmentVariable: 'E2E_DEV_CHAIN_ID',
    permitsTransactions: false,
    permitsOracleMutation: false,
    permitsTimeTravel: false,
    requiresBaselineReset: false,
    stateSyncDuringRun: true,
    initializesDefaultMockResources: false,
  },
  'tx-fork': {
    name: 'tx-fork',
    rpcEnvironmentVariable: 'E2E_TX_FORK_RPC_URL',
    wssEnvironmentVariable: 'E2E_TX_FORK_WSS_URL',
    chainIdEnvironmentVariable: 'E2E_TX_FORK_CHAIN_ID',
    adminRpcEnvironmentVariable: 'E2E_TX_FORK_ADMIN_RPC_URL',
    permitsTransactions: true,
    // Inline Keeper 的普通真实交易；Index 与 USDC 均使用初始化时登记的 Mock Oracle。
    permitsOracleMutation: true,
    permitsTimeTravel: false,
    requiresBaselineReset: true,
    stateSyncDuringRun: false,
    initializesDefaultMockResources: true,
    defaultMockResourceAlias: 'default-mock',
  },
  'oracle-fork': {
    name: 'oracle-fork',
    rpcEnvironmentVariable: 'E2E_ORACLE_FORK_RPC_URL',
    wssEnvironmentVariable: 'E2E_ORACLE_FORK_WSS_URL',
    chainIdEnvironmentVariable: 'E2E_ORACLE_FORK_CHAIN_ID',
    adminRpcEnvironmentVariable: 'E2E_ORACLE_FORK_ADMIN_RPC_URL',
    permitsTransactions: true,
    permitsOracleMutation: true,
    permitsTimeTravel: false,
    requiresBaselineReset: true,
    stateSyncDuringRun: false,
    initializesDefaultMockResources: true,
    defaultMockResourceAlias: 'default-mock',
  },
  'time-fork': {
    name: 'time-fork',
    rpcEnvironmentVariable: 'E2E_TIME_FORK_RPC_URL',
    wssEnvironmentVariable: 'E2E_TIME_FORK_WSS_URL',
    chainIdEnvironmentVariable: 'E2E_TIME_FORK_CHAIN_ID',
    adminRpcEnvironmentVariable: 'E2E_TIME_FORK_ADMIN_RPC_URL',
    permitsTransactions: true,
    permitsOracleMutation: true,
    permitsTimeTravel: true,
    requiresBaselineReset: true,
    stateSyncDuringRun: false,
    initializesDefaultMockResources: true,
    defaultMockResourceAlias: 'default-mock',
  },
  'base-sepolia': {
    name: 'base-sepolia',
    rpcEnvironmentVariable: 'E2E_BASE_SEPOLIA_RPC_URL',
    wssEnvironmentVariable: 'E2E_BASE_SEPOLIA_WSS_URL',
    chainIdEnvironmentVariable: 'E2E_BASE_SEPOLIA_CHAIN_ID',
    // Service Keeper 专项使用真实 Base Sepolia 部署与标准 Oracle；不部署或替换 Mock 资源。
    permitsTransactions: true,
    permitsOracleMutation: false,
    permitsTimeTravel: false,
    requiresBaselineReset: false,
    stateSyncDuringRun: true,
    initializesDefaultMockResources: false,
  },
};

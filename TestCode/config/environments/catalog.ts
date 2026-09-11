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
  /** 本环境约定的固定 Chain ID（Tenderly Virtual TestNet 创建时作为 chain_config_overrides.chain_id；与真链 84532 区分、便于 Keeper 按链隔离游标）。 */
  readonly fixedChainId?: number;
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
    fixedChainId: 99911,
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
    fixedChainId: 99912,
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
    fixedChainId: 99913,
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

/**
 * 临时环境槽位：给「临时插入一个版本验证」用的备用 Fork 槽位，固定 Chain ID 接在 99911/99912/99913 之后。
 * 有了它，临时验证不必再去占用别人正在跑的 tx-fork（占用会连锁改写 .env.local / 环境绑定 /
 * config/tenderly-vnets.json / CURRENT.json environments.<env>）。
 *
 * 刻意**不并入** environmentNames / environments：这两个导出是若干「完整性契约」的唯一来源，
 * 直接加名字会让现有三条 Fork 的配置当场校验失败（已逐个核对）——
 *   · src/config/environment-binding.ts 用 environmentNames 生成 bindings 的 z.object 形状，
 *     config/environment-bindings.json 缺哪个名字就整表 parse 失败，所有跑批立刻中断；
 *   · src/server/environment-configuration.ts 的 chainIdHint 是 Record<EnvironmentName, string> 字面量，缺项直接 tsc 报错；
 *   · src/reporting/render-run-builder.ts 用 Object.values(environments) 渲染看板环境下拉，加项即改看板行为。
 * 因此这里只登记「名字 + 固定 Chain ID + 环境变量名 + 能力」，接线清单见 pendingWiring，
 * 逐项接完再把名字并进 environmentNames。
 */
export const temporaryEnvironmentNames = ['func-fork'] as const;

export type TemporaryEnvironmentName = (typeof temporaryEnvironmentNames)[number];

export interface TemporaryEnvironmentDefinition extends Omit<EnvironmentDefinition, 'name'> {
  readonly name: TemporaryEnvironmentName;
  /** 该槽位还缺哪些登记才能真正跑起来；命令行原样打印，接线一条删一条。 */
  readonly pendingWiring: readonly string[];
}

export const temporaryEnvironments: Record<TemporaryEnvironmentName, TemporaryEnvironmentDefinition> = {
  'func-fork': {
    name: 'func-fork',
    rpcEnvironmentVariable: 'E2E_FUNC_FORK_RPC_URL',
    wssEnvironmentVariable: 'E2E_FUNC_FORK_WSS_URL',
    chainIdEnvironmentVariable: 'E2E_FUNC_FORK_CHAIN_ID',
    // 99911 tx-fork / 99912 oracle-fork / 99913 time-fork 之后的下一个号，互不冲突。
    fixedChainId: 99914,
    adminRpcEnvironmentVariable: 'E2E_FUNC_FORK_ADMIN_RPC_URL',
    permitsTransactions: true,
    permitsOracleMutation: true,
    // 临时槽位按 Tenderly VNet 的最宽能力登记（私有 Fork 三种能力都具备），
    // 具体用例仍按自身的环境要求筛选，不因为这里放开就允许在别的环境穿越时间。
    permitsTimeTravel: true,
    requiresBaselineReset: true,
    stateSyncDuringRun: false,
    initializesDefaultMockResources: true,
    defaultMockResourceAlias: 'default-mock',
    pendingWiring: [
      'config/environment-bindings.json：补 bindings["func-fork"]（environmentBindingRegistrySchema 要求 environmentNames 每一项都有绑定）',
      'src/server/environment-configuration.ts：chainIdHint 补一项（Record<EnvironmentName, string> 字面量，缺项 tsc 报错）',
      'src/config/mock-resources.ts：isMockResourceEnvironment 放行（否则不能初始化 Mock Market Bundle）',
      'playwright.config.ts：补一个同名 project（否则 --project=func-fork 跑不了用例）',
      'src/reporting/render-environments.ts：内联 environmentNames 数组补一项（看板环境下拉）',
      'config/environments/catalog.ts：以上都就绪后，把 func-fork 并入 environmentNames 并在 environments 里登记同一份定义',
    ],
  },
};

/** 名字是否为临时环境槽位（只读判断，不影响既有导出）。 */
export function isTemporaryEnvironmentName(value: string): value is TemporaryEnvironmentName {
  return (temporaryEnvironmentNames as readonly string[]).includes(value);
}

/** 按名字取环境定义（含临时槽位）；未登记返回 undefined。 */
export function findEnvironmentSlot(
  value: string,
): EnvironmentDefinition | TemporaryEnvironmentDefinition | undefined {
  if (isTemporaryEnvironmentName(value)) return temporaryEnvironments[value];
  return (environmentNames as readonly string[]).includes(value)
    ? environments[value as EnvironmentName]
    : undefined;
}

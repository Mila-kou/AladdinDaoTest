import {
  executionModeValues,
  marketCompatibilityValues,
  marketModeValues,
  mockResourceAliasValues,
  oracleModeValues,
  signingModeValues,
  testProjectValues,
  timeModeValues,
  type ExecutionMode,
  type MarketCompatibility,
  type MarketMode,
  type MockResourceAlias,
  type OracleMode,
  type SigningMode,
  type TestEnvironmentDefinition,
  type TestProject,
  type TimeMode,
} from '../domain/test-environment.js';

export {
  executionModeValues,
  marketCompatibilityValues,
  marketModeValues,
  mockResourceAliasValues,
  oracleModeValues,
  signingModeValues,
  testProjectValues,
  timeModeValues,
};
export type {
  ExecutionMode,
  MarketCompatibility,
  MarketMode,
  MockResourceAlias,
  OracleMode,
  SigningMode,
  TestEnvironmentDefinition,
  TestProject,
  TimeMode,
};

const DEV_READONLY_IDS = new Set([
  'SCN-001', 'SCN-002', 'SCN-003', 'SCN-004', 'SCN-007', 'SCN-063', 'SCN-064',
]);

const ORACLE_FORK_IDS = new Set([
  'SCN-010', 'SCN-011', 'SCN-012', 'SCN-014', 'SCN-015', 'SCN-016', 'SCN-019', 'SCN-020',
  'SCN-022', 'SCN-033', 'SCN-035', 'SCN-036', 'SCN-037', 'SCN-038', 'SCN-041',
  'SCN-043', 'SCN-044', 'SCN-048', 'SCN-049', 'SCN-050', 'SCN-051', 'SCN-060',
  'SCN-066', 'SCN-067', 'SCN-068', 'SCN-069', 'SCN-070', 'SCN-071', 'SCN-072',
]);

const TIME_FORK_IDS = new Set([
  'SCN-013', 'SCN-029', 'SCN-030', 'SCN-039', 'SCN-042', 'SCN-045', 'SCN-046',
  'SCN-047', 'SCN-058', 'SCN-059', 'SCN-073', 'SCN-074', 'SCN-075', 'SCN-076',
  'SCN-077', 'SCN-078', 'SCN-079', 'SCN-080',
]);

const NON_MARKET_IDS = new Set([
  'SCN-002', 'SCN-003', 'SCN-007', 'SCN-055', 'SCN-057', 'SCN-058', 'SCN-061', 'SCN-064',
]);

// 这些用例不依赖可控价格、可控市场参数或精确边界，保持同一套核对规则时也可以
// 显式切换到已部署 Market + 非 Mock Oracle。默认仍然使用 default-mock。
const STANDARD_MARKET_COMPATIBLE_IDS = new Set([
  'SCN-005', 'SCN-006', 'SCN-008', 'SCN-017', 'SCN-018', 'SCN-021',
  'SCN-024', 'SCN-025', 'SCN-027', 'SCN-028', 'SCN-031', 'SCN-032',
  'SCN-033', 'SCN-034', 'SCN-040', 'SCN-048', 'SCN-052', 'SCN-053',
  'SCN-054', 'SCN-056', 'SCN-059', 'SCN-062', 'SCN-065',
]);

const BROWSER_WALLET_IDS = new Set([
  'SCN-002', 'SCN-003', 'SCN-005', 'SCN-006', 'SCN-007', 'SCN-008', 'SCN-053',
  'SCN-054', 'SCN-055', 'SCN-056', 'SCN-057', 'SCN-058', 'SCN-061', 'SCN-063', 'SCN-064',
]);

// 手工核对：结论必须由人看页面表现或在浏览器钱包里真人操作才能判定，设计上不产出自动化代码。
// 与 NOT_AUTOMATED（尚未实现，属于欠账）严格区分：手工核对用例仍必须人工执行并回填证据。
// 判据 = dev-readonly 页面核对 ∪ browser-wallet-keeper 钱包交互。
const MANUAL_CHECK_IDS = new Set([
  // dev-readonly 页面核对
  'SCN-001', // 首次进入并判断数据可信
  'SCN-004', // 筛选可交易市场
  // 浏览器钱包交互（含同时属于 dev-readonly 的 002/003/007/063/064）
  'SCN-002', // 错误网络与安全切链
  'SCN-003', // 钱包连接与协议披露
  'SCN-005', // Standard 第一笔市价开仓
  'SCN-006', // Flash 同意、连接与首单
  'SCN-007', // 刷新与重开恢复上下文
  'SCN-008', // 切账户的数据与授权隔离：钱包内 A→B→A 切账户无法自动驱动
  'SCN-053', // Flash 连续交易
  'SCN-054', // Standard/Flash 切换
  'SCN-055', // consent 版本升级
  'SCN-056', // Cancel All 原子撤单
  'SCN-057', // 断开与撤销交易密钥
  'SCN-058', // 到期/持久化/多设备
  'SCN-061', // RPC/拒签恢复
  'SCN-063', // 移动端核心旅程
  'SCN-064', // 多语言与账户隐私
]);

export function defaultExecutionMode(id: string): ExecutionMode {
  return MANUAL_CHECK_IDS.has(id) ? 'manual' : 'automated';
}

function targetProject(id: string): TestProject {
  // 手工核对用例由人在已部署环境上操作，默认落 base-sepolia：不建 Fork、不回滚。
  if (defaultExecutionMode(id) === 'manual') return 'base-sepolia';
  if (DEV_READONLY_IDS.has(id)) return 'dev-readonly';
  if (TIME_FORK_IDS.has(id)) return 'time-fork';
  if (ORACLE_FORK_IDS.has(id)) return 'oracle-fork';
  return 'tx-fork';
}

export type EnvironmentSetupInput = Omit<TestEnvironmentDefinition, 'environmentSetup'> & {
  readonly executionMode: ExecutionMode;
};

type EnvironmentInput = EnvironmentSetupInput;

/** 只有一条时直接成句，多条时编号，避免长段落读不出层次。 */
function numbered(items: readonly string[]): string {
  if (items.length === 1) return `${items[0]}。`;
  return `${items.map((item, index) => `${index + 1}、${item}；`).join('\n')}`.replace(/；$/, '。');
}

function setupBefore(input: EnvironmentInput): string {
  if (input.executionMode === 'manual') {
    return '不新建 Fork、不建快照，直接在已部署环境上人工执行';
  }
  if (input.targetProject === 'dev-readonly' || input.targetProject === 'base-sepolia') {
    return '不新建 Fork；直接使用共享环境的已部署数据';
  }
  return `在独享 ${input.targetProject} 上创建快照，快照可带本用例需要的初始数据`;
}

function setupAfter(input: EnvironmentInput): string {
  if (input.executionMode === 'manual') {
    return '手工核对用例不需要回滚或重建 Fork；只按用例自带的清理项处理残留仓位、挂单与授权';
  }
  const items: string[] = [];
  if (input.marketMode !== 'not-applicable') {
    items.push('关闭本用例开的仓位与挂单');
  }
  if (input.oracleMode === 'mock-oracle') {
    items.push('把 Oracle 价格与本用例改过的市场参数恢复到用例前取值');
  }
  if (input.timeMode === 'controllable-time') {
    items.push('恢复推进过的区块时间设置');
  }
  if (input.targetProject !== 'dev-readonly' && input.targetProject !== 'base-sepolia') {
    items.push('回滚快照或重建 Fork');
  }
  return items.length > 0 ? items.join('；') : '无需恢复操作';
}

function setupInitialization(input: EnvironmentInput): string[] {
  const items: string[] = [];
  if (input.targetProject !== 'dev-readonly' && input.targetProject !== 'base-sepolia') {
    items.push(`部署完整的 ${input.mockResourceAlias} Market Bundle：专属 Index Token + Index Mock Oracle、环境共享 USDC + USDC Mock Oracle、Synthetic Market 与参数套件`);
  }
  if (input.marketMode === 'mock-market') {
    items.push(`通过资源别名 ${input.mockResourceAlias} 解析 bundleId、Market、Index Token/Oracle、USDC/Oracle，测试代码禁止硬编码地址`);
    items.push('初始化市场流动性及本场景需要的 OI、Funding、Spread、Grace 和风控参数');
  } else if (input.marketMode === 'deployed-market') {
    items.push(`使用 config/environment-bindings.json 为 ${input.targetProject} 绑定的已部署市场、Token、Oracle 和 ABI`);
  }
  if (input.oracleMode === 'mock-oracle') {
    items.push('测试步骤必须列明价格初值、目标值、更新时间和恢复值');
  }
  if (input.marketCompatibility === 'mock-and-deployed') {
    items.push('默认使用 default-mock；创建运行时可显式切换到已部署 Market + 非 Mock Oracle');
  } else if (input.marketCompatibility === 'mock-only') {
    items.push('依赖可控价格、参数、时间或边界，禁止切换到非 Mock Oracle 市场');
  } else if (input.marketCompatibility === 'deployed-only') {
    items.push('仅使用已部署 Market 与 Oracle，不做 Mock 替换');
  }
  if (input.timeMode === 'controllable-time') {
    items.push('Fork 必须允许推进时间与挖块；记录 before/after 区块号和时间戳');
  }
  if (input.signingMode === 'trader-keeper-private-key') {
    items.push('为 Trader/Keeper 准备测试 ETH 和交易 Token，并用两者真实私钥分别签名');
  } else if (input.signingMode === 'browser-wallet-keeper') {
    items.push('准备浏览器钱包测试账户；涉及订单执行时同时准备 Keeper');
  } else {
    items.push('只读页面核对，不需要签名账户');
  }
  return items;
}

/** 三段式环境要求：用例开始前 / 用例结束时 / 环境初始化（多条时编号）。 */
export function environmentSetupText(input: EnvironmentSetupInput): string {
  return [
    `用例开始前：${setupBefore(input)}；`,
    `用例结束时：${setupAfter(input)}；`,
    `环境初始化：${numbered(setupInitialization(input))}`,
  ].join('\n');
}

export function defaultTestEnvironment(id: string): TestEnvironmentDefinition {
  const project = targetProject(id);
  const marketMode: MarketMode = NON_MARKET_IDS.has(id)
    ? 'not-applicable'
    : project === 'dev-readonly' || project === 'base-sepolia'
      ? 'deployed-market'
      : 'mock-market';
  const oracleMode: OracleMode = marketMode === 'not-applicable'
    ? 'not-applicable'
    : marketMode === 'mock-market' ? 'mock-oracle' : 'deployed-oracle';
  const timeMode: TimeMode = project === 'time-fork'
    ? 'controllable-time'
    : (project === 'dev-readonly' || project === 'base-sepolia') && marketMode === 'not-applicable'
      ? 'not-applicable'
      : 'normal-block-time';
  const signingMode: SigningMode = ['SCN-001', 'SCN-004'].includes(id)
    ? 'readonly'
    : BROWSER_WALLET_IDS.has(id) ? 'browser-wallet-keeper' : 'trader-keeper-private-key';
  const mockResourceAlias: MockResourceAlias = marketMode === 'mock-market' ? 'default-mock' : 'none';
  const marketCompatibility: MarketCompatibility = marketMode === 'not-applicable'
    ? 'not-applicable'
    : project === 'dev-readonly' || project === 'base-sepolia'
      ? 'deployed-only'
      : STANDARD_MARKET_COMPATIBLE_IDS.has(id)
        ? 'mock-and-deployed'
        : 'mock-only';
  const definition = {
    targetProject: project,
    marketMode,
    oracleMode,
    marketCompatibility,
    timeMode,
    signingMode,
    mockResourceAlias,
  } as const;
  return {
    ...definition,
    environmentSetup: environmentSetupText({ ...definition, executionMode: defaultExecutionMode(id) }),
  };
}

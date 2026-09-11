export const testProjectValues = [
  'dev-readonly',
  'tx-fork',
  'oracle-fork',
  'time-fork',
  'base-sepolia',
] as const;

export const marketModeValues = ['deployed-market', 'mock-market', 'not-applicable'] as const;
export const oracleModeValues = ['deployed-oracle', 'mock-oracle', 'not-applicable'] as const;
export const marketCompatibilityValues = [
  'mock-only',
  'mock-and-deployed',
  'deployed-only',
  'not-applicable',
] as const;
export const timeModeValues = ['normal-block-time', 'controllable-time', 'not-applicable'] as const;
export const signingModeValues = ['readonly', 'browser-wallet-keeper', 'trader-keeper-private-key'] as const;
/** 看板预设；实际 Bundle Alias 允许按命名规则扩展。 */
export const mockResourceAliasValues = ['default-mock', 'none'] as const;
export const executionModeValues = ['automated', 'manual'] as const;

export type TestProject = typeof testProjectValues[number];
export type MarketMode = typeof marketModeValues[number];
export type OracleMode = typeof oracleModeValues[number];
export type MarketCompatibility = typeof marketCompatibilityValues[number];
export type TimeMode = typeof timeModeValues[number];
export type SigningMode = typeof signingModeValues[number];
export type MockResourceAlias = string;
export type ExecutionMode = typeof executionModeValues[number];

/** 测试设计声明的完整环境约束；03 §1 要求八个字段全部存在。 */
export interface TestEnvironmentDefinition {
  readonly targetProject: TestProject;
  readonly marketMode: MarketMode;
  readonly oracleMode: OracleMode;
  readonly marketCompatibility: MarketCompatibility;
  readonly timeMode: TimeMode;
  readonly signingMode: SigningMode;
  readonly mockResourceAlias: MockResourceAlias;
  readonly environmentSetup: string;
}

/** Harness 入场时已经解析出的实际环境，不含设计说明与兼容策略。 */
export type ResolvedTestEnvironment = Omit<TestEnvironmentDefinition, 'marketCompatibility' | 'environmentSetup'>;

export class InvalidTestEnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTestEnvironmentError';
  }
}

function fail(message: string): never {
  throw new InvalidTestEnvironmentError(message);
}

function requireEnum(label: string, value: unknown, allowed: readonly string[]): asserts value is string {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    fail(`${label} 非法或缺失：${String(value)}`);
  }
}

function validateResolvedShape(value: ResolvedTestEnvironment, label: string): void {
  if (!value || typeof value !== 'object') fail(`${label} 必须为结构化对象`);
  requireEnum(`${label}.targetProject`, value.targetProject, testProjectValues);
  requireEnum(`${label}.marketMode`, value.marketMode, marketModeValues);
  requireEnum(`${label}.oracleMode`, value.oracleMode, oracleModeValues);
  requireEnum(`${label}.timeMode`, value.timeMode, timeModeValues);
  requireEnum(`${label}.signingMode`, value.signingMode, signingModeValues);
  if (typeof value.mockResourceAlias !== 'string') fail(`${label}.mockResourceAlias 非法或缺失`);
  const isMock = value.marketMode === 'mock-market' && value.oracleMode === 'mock-oracle';
  const isDeployed = value.marketMode === 'deployed-market' && value.oracleMode === 'deployed-oracle';
  const isNotApplicable = value.marketMode === 'not-applicable' && value.oracleMode === 'not-applicable';
  if (!isMock && !isDeployed && !isNotApplicable) {
    fail(`${label} Market/Oracle 模式不成对：${value.marketMode}/${value.oracleMode}`);
  }
  if (isMock && (!value.mockResourceAlias.trim() || value.mockResourceAlias === 'none')) {
    fail(`${label} Mock Market 必须声明有效 mockResourceAlias`);
  }
  if (!isMock && value.mockResourceAlias !== 'none') {
    fail(`${label} 非 Mock Market 的 mockResourceAlias 必须为 none`);
  }
  if ((value.targetProject === 'dev-readonly' || value.targetProject === 'base-sepolia') && isMock) {
    fail(`${label} ${value.targetProject} 不允许初始化 Mock Market/Oracle`);
  }
  if (value.timeMode === 'controllable-time' && value.targetProject !== 'time-fork') {
    fail(`${label} 只有 time-fork 可以声明 controllable-time`);
  }
  if (value.targetProject === 'time-fork' && value.timeMode !== 'controllable-time') {
    fail(`${label} time-fork 必须显式声明 controllable-time`);
  }
}

export function validateTestEnvironmentDefinition(value: TestEnvironmentDefinition): void {
  if (!value || typeof value !== 'object') fail('场景环境必须为结构化对象');
  requireEnum('场景环境.marketCompatibility', value.marketCompatibility, marketCompatibilityValues);
  if (typeof value.environmentSetup !== 'string' || !value.environmentSetup.trim()) fail('environmentSetup 不能为空');
  validateResolvedShape(value, '场景环境');

  if (value.marketCompatibility === 'mock-only' && value.marketMode !== 'mock-market') {
    fail('mock-only 场景的默认 marketMode 必须为 mock-market');
  }
  if (value.marketCompatibility === 'deployed-only' && value.marketMode !== 'deployed-market') {
    fail('deployed-only 场景的默认 marketMode 必须为 deployed-market');
  }
  if (value.marketCompatibility === 'not-applicable' && value.marketMode !== 'not-applicable') {
    fail('marketCompatibility=not-applicable 时 marketMode 必须为 not-applicable');
  }
  if (value.marketMode === 'not-applicable' && value.marketCompatibility !== 'not-applicable') {
    fail('marketMode=not-applicable 时 marketCompatibility 必须为 not-applicable');
  }
  if (value.marketCompatibility === 'mock-and-deployed' && value.marketMode === 'not-applicable') {
    fail('mock-and-deployed 场景必须声明一个可执行 Market 模式');
  }
}

/** 对照设计环境与本次运行解析结果；任何不一致都发生在发送第一笔交易之前。 */
export function assertResolvedTestEnvironment(
  expected: TestEnvironmentDefinition,
  actual: ResolvedTestEnvironment,
): void {
  validateTestEnvironmentDefinition(expected);
  validateResolvedShape(actual, '运行环境');

  if (actual.targetProject !== expected.targetProject) {
    fail(`场景 targetProject=${expected.targetProject}，实际运行在 ${actual.targetProject}`);
  }
  if (actual.timeMode !== expected.timeMode) {
    fail(`场景 timeMode=${expected.timeMode}，实际为 ${actual.timeMode}`);
  }
  if (actual.signingMode !== expected.signingMode) {
    fail(`场景 signingMode=${expected.signingMode}，实际为 ${actual.signingMode}`);
  }

  const actualMock = actual.marketMode === 'mock-market' && actual.oracleMode === 'mock-oracle';
  const actualDeployed = actual.marketMode === 'deployed-market' && actual.oracleMode === 'deployed-oracle';
  const actualNotApplicable = actual.marketMode === 'not-applicable' && actual.oracleMode === 'not-applicable';

  if (expected.marketCompatibility === 'mock-only' && !actualMock) {
    fail(`mock-only 场景禁止切换到 ${actual.marketMode}/${actual.oracleMode}`);
  }
  if (expected.marketCompatibility === 'deployed-only' && !actualDeployed) {
    fail(`deployed-only 场景不能运行在 ${actual.marketMode}/${actual.oracleMode}`);
  }
  if (expected.marketCompatibility === 'not-applicable' && !actualNotApplicable) {
    fail(`不涉及 Market 的场景不能运行在 ${actual.marketMode}/${actual.oracleMode}`);
  }
  if (expected.marketCompatibility === 'mock-and-deployed' && !actualMock && !actualDeployed) {
    fail(`mock-and-deployed 场景不支持 ${actual.marketMode}/${actual.oracleMode}`);
  }
  if (actualMock && actual.mockResourceAlias !== expected.mockResourceAlias) {
    fail(`场景 mockResourceAlias=${expected.mockResourceAlias}，实际为 ${actual.mockResourceAlias}`);
  }

  if (expected.marketCompatibility !== 'mock-and-deployed') {
    if (actual.marketMode !== expected.marketMode || actual.oracleMode !== expected.oracleMode) {
      fail(`场景 Market/Oracle=${expected.marketMode}/${expected.oracleMode}，实际为 ${actual.marketMode}/${actual.oracleMode}`);
    }
  }
}

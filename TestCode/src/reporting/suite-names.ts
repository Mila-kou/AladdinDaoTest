export const suiteNames = {
  S01: '交易准备与首单',
  S02: '策略下单与订单管理',
  S03: '仓位管理与退出',
  S04: '风险自救、保护与强平',
  S05: '长持费用、价格冲击与多市场',
  S06: 'Flash、异常恢复与兼容',
  S07: '订单类型全矩阵',
  S08: 'Funding 计提、结算与边界',
} as const;

export type SuiteCode = keyof typeof suiteNames;

export function getSuiteName(suite: string): string {
  return suiteNames[suite as SuiteCode] ?? '未命名套件';
}

export function getSuiteLabel(suite: string): string {
  return `${suite} · ${getSuiteName(suite)}`;
}

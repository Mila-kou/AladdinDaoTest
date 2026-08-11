export const PRECISION = {
  usd: 10n ** 30n,
  factor: 10n ** 30n,
  skew: 10n ** 18n,
  token18: 10n ** 18n,
} as const;

export function assertNonNegative(value: bigint, label: string): void {
  if (value < 0n) {
    throw new Error(`${label} 不能为负数：${value}`);
  }
}

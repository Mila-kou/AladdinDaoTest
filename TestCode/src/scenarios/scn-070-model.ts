export type Scn070Quadrant = 'open-long' | 'open-short' | 'close-long' | 'close-short';
export type Scn070Boundary = 'equal' | 'adverse';
export type Scn070ExpectedOutcome = 'executed' | 'cancelled';

export interface Scn070CaseDefinition {
  readonly id: string;
  readonly title: string;
  readonly quadrant: Scn070Quadrant;
  readonly boundary: Scn070Boundary;
  readonly isIncrease: boolean;
  readonly isLong: boolean;
  readonly orderType: 0 | 2;
  /** Mock Oracle 原始报价相对基准价的移动方向。 */
  readonly oracleDirection: -1 | 0 | 1;
  readonly expectedOutcome: Scn070ExpectedOutcome;
}

const quadrants = [
  {
    quadrant: 'open-long',
    title: '开多 MarketIncrease long',
    isIncrease: true,
    isLong: true,
    orderType: 0,
    adverseOracleDirection: 1,
  },
  {
    quadrant: 'open-short',
    title: '开空 MarketIncrease short',
    isIncrease: true,
    isLong: false,
    orderType: 0,
    adverseOracleDirection: -1,
  },
  {
    quadrant: 'close-long',
    title: '平多 MarketDecrease long',
    isIncrease: false,
    isLong: true,
    orderType: 2,
    adverseOracleDirection: -1,
  },
  {
    quadrant: 'close-short',
    title: '平空 MarketDecrease short',
    isIncrease: false,
    isLong: false,
    orderType: 2,
    adverseOracleDirection: 1,
  },
] as const;

export const SCN070_CASES: readonly Scn070CaseDefinition[] = quadrants.flatMap((quadrant) => [
  {
    ...quadrant,
    id: `${quadrant.quadrant}-equal`,
    title: `${quadrant.title}｜executionPrice = acceptablePrice`,
    boundary: 'equal' as const,
    oracleDirection: 0 as const,
    expectedOutcome: 'executed' as const,
  },
  {
    ...quadrant,
    id: `${quadrant.quadrant}-adverse`,
    title: `${quadrant.title}｜向不利方向越过最小可达价格步长`,
    boundary: 'adverse' as const,
    oracleDirection: quadrant.adverseOracleDirection,
    expectedOutcome: 'cancelled' as const,
  },
]);

/** 与 BaseOrderUtils 的四象限 acceptablePrice 比较保持独立同构。 */
export function isExecutionPriceAcceptable(
  executionPrice: bigint,
  acceptablePrice: bigint,
  isIncrease: boolean,
  isLong: boolean,
): boolean {
  if (isIncrease) {
    return isLong
      ? executionPrice <= acceptablePrice
      : executionPrice >= acceptablePrice;
  }
  return isLong
    ? executionPrice >= acceptablePrice
    : executionPrice <= acceptablePrice;
}

export function isAdverseBoundaryCrossed(
  definition: Scn070CaseDefinition,
  executionPrice: bigint,
  acceptablePrice: bigint,
): boolean {
  if (definition.boundary !== 'adverse') return false;
  return !isExecutionPriceAcceptable(
    executionPrice,
    acceptablePrice,
    definition.isIncrease,
    definition.isLong,
  );
}

export function validateScn070Matrix(
  cases: readonly Scn070CaseDefinition[] = SCN070_CASES,
): void {
  if (cases.length !== 8) throw new Error(`SCN-070 必须包含 8 个数据集，实际 ${cases.length}`);
  const ids = new Set(cases.map((item) => item.id));
  if (ids.size !== cases.length) throw new Error('SCN-070 数据集 ID 不唯一');

  for (const quadrant of quadrants) {
    const matches = cases.filter((item) => item.quadrant === quadrant.quadrant);
    if (matches.length !== 2) {
      throw new Error(`${quadrant.quadrant} 必须包含 equal/adverse 两组`);
    }
    const equal = matches.find((item) => item.boundary === 'equal');
    const adverse = matches.find((item) => item.boundary === 'adverse');
    if (!equal || equal.expectedOutcome !== 'executed' || equal.oracleDirection !== 0) {
      throw new Error(`${quadrant.quadrant} 的 equal 数据不完整`);
    }
    if (
      !adverse
      || adverse.expectedOutcome !== 'cancelled'
      || adverse.oracleDirection !== quadrant.adverseOracleDirection
    ) {
      throw new Error(`${quadrant.quadrant} 的 adverse 数据不完整`);
    }
  }
}

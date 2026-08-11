export const WEI_PRECISION = 10n ** 18n;
export const FLOAT_PRECISION = 10n ** 30n;

export function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error('公式分母不能为 0');
  return numerator === 0n ? 0n : (numerator + denominator - 1n) / denominator;
}

export function clamp(value: bigint, minimum: bigint, maximum: bigint): bigint {
  if (minimum > maximum) throw new Error(`clamp 参数非法：min ${minimum} > max ${maximum}`);
  if (value < minimum) return minimum;
  return value > maximum ? maximum : value;
}

export function calculateGrace(input: {
  readonly graceStart: bigint;
  readonly graceBase: bigint;
  readonly tierMultiplier: bigint;
}) {
  const effectiveGrace = input.graceBase * input.tierMultiplier / WEI_PRECISION;
  const graceEnd = input.graceStart + effectiveGrace;
  return {
    effectiveGrace,
    graceEnd,
    expanded: `${input.graceStart} + (${input.graceBase} × ${input.tierMultiplier} / 1e18) = ${graceEnd}`,
  };
}

export function calculateExecutionPrice(input: {
  readonly oraclePrice: bigint;
  readonly dynamicSpread: bigint;
  readonly adverseUp: boolean;
}) {
  const executionPrice = input.adverseUp
    ? ceilDiv(input.oraclePrice * (WEI_PRECISION + input.dynamicSpread), WEI_PRECISION)
    : input.oraclePrice * (WEI_PRECISION - input.dynamicSpread) / WEI_PRECISION;
  const operator = input.adverseUp ? '+' : '−';
  return {
    executionPrice,
    expanded: input.adverseUp
      ? `ceil(${input.oraclePrice} × (1e18 ${operator} ${input.dynamicSpread}) / 1e18) = ${executionPrice}`
      : `${input.oraclePrice} × (1e18 ${operator} ${input.dynamicSpread}) / 1e18 = ${executionPrice}`,
  };
}

export function calculatePositionFee(input: {
  readonly tradeSizeUsd: bigint;
  readonly positionFeeFactor: bigint;
  readonly collateralPriceMin: bigint;
}) {
  const positionFee = input.collateralPriceMin === 0n
    ? undefined
    : input.tradeSizeUsd * input.positionFeeFactor / FLOAT_PRECISION / input.collateralPriceMin;
  return {
    positionFee,
    expanded: positionFee === undefined
      ? `${input.tradeSizeUsd} × ${input.positionFeeFactor} / 1e30 / 0（分母为 0，无法计算）`
      : `${input.tradeSizeUsd} × ${input.positionFeeFactor} / 1e30 / ${input.collateralPriceMin} = ${positionFee}`,
  };
}

export function calculateFundingFactors(input: {
  readonly fundingFloor: bigint;
  readonly fundingBase: bigint;
  readonly emaSkew: bigint;
  readonly minimum: bigint;
  readonly maximum: bigint;
  readonly hasOpenInterest?: boolean;
}) {
  if (input.hasOpenInterest === false) {
    return {
      long: 0n,
      short: 0n,
      longExpanded: 'totalOpenInterest = 0，Funding 更新为 no-op，因此 longFactor = 0',
      shortExpanded: 'totalOpenInterest = 0，Funding 更新为 no-op，因此 shortFactor = 0',
    };
  }
  const longRaw = input.fundingFloor + input.fundingBase * input.emaSkew / WEI_PRECISION;
  const shortRaw = -input.fundingBase * input.emaSkew / WEI_PRECISION;
  const long = clamp(longRaw, input.minimum, input.maximum);
  const short = clamp(shortRaw, input.minimum, input.maximum);
  return {
    long,
    short,
    longExpanded: `clamp(${input.fundingFloor} + ${input.fundingBase} × ${input.emaSkew} / 1e18, ${input.minimum}, ${input.maximum}) = ${long}`,
    shortExpanded: `clamp(−${input.fundingBase} × ${input.emaSkew} / 1e18, ${input.minimum}, ${input.maximum}) = ${short}`,
  };
}

export function calculateSignedSkew(longOiUsd: bigint, shortOiUsd: bigint): bigint {
  const total = longOiUsd + shortOiUsd;
  return total === 0n ? 0n : (longOiUsd - shortOiUsd) * WEI_PRECISION / total;
}

export function calculateSkewImpact(input: {
  readonly skewImpactFactor: bigint;
  readonly skewReference: bigint;
  readonly balanceWasImproved: boolean;
  readonly minimum: bigint;
  readonly maximum: bigint;
}) {
  const unsigned = input.skewImpactFactor * input.skewReference / WEI_PRECISION;
  const directional = input.balanceWasImproved ? -unsigned : unsigned;
  const skewImpact = clamp(directional, input.minimum, input.maximum);
  return {
    skewImpact,
    expanded: `clamp(${input.balanceWasImproved ? '−' : ''}${input.skewImpactFactor} × ${input.skewReference} / 1e18, ${input.minimum}, ${input.maximum}) = ${skewImpact}`,
  };
}

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
    expanded: `${input.graceStart} + floor(${input.graceBase} × ${input.tierMultiplier} / 1e18) = ${graceEnd}`,
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

/**
 * size↔token 四格取整矩阵 · 开仓（USD 模式，对 trader 不利）：
 * 多头 ⌊sizeUsd/execPrice⌋（PositionUtils.getExecutionPriceForIncrease 长侧分支），
 * 空头 ⌈sizeUsd/execPrice⌉（Calc.roundUpDivision 短侧分支）。
 */
export function increaseSizeInTokens(sizeUsd: bigint, executionPrice: bigint, isLong: boolean) {
  const value = isLong ? sizeUsd / executionPrice : ceilDiv(sizeUsd, executionPrice);
  return {
    value,
    expanded: isLong
      ? `⌊${sizeUsd} / ${executionPrice}⌋ = ${value}（多头开仓向下取整）`
      : `⌈${sizeUsd} / ${executionPrice}⌉ = ${value}（空头开仓向上取整）`,
  };
}

/**
 * 减仓 token 数（与执行价无关，按仓位等比销账）：
 * 全平走恒等分支精确清零（无尘埃）；部分平多头 ⌈⌉ / 空头 ⌊⌋（对 trader 不利）。
 */
export function decreaseSizeInTokens(input: {
  readonly oldSizeUsd: bigint;
  readonly oldSizeInTokens: bigint;
  readonly sizeDeltaUsd: bigint;
  readonly isLong: boolean;
}) {
  if (input.oldSizeUsd <= 0n) return { value: undefined, expanded: 'oldSizeUsd 为 0，无法销账' };
  if (input.sizeDeltaUsd === input.oldSizeUsd) {
    return {
      value: input.oldSizeInTokens,
      expanded: `全平恒等分支：sizeDeltaUsd == oldSizeUsd → 精确清零 ${input.oldSizeInTokens} tokens（无取整、无尘埃）`,
    };
  }
  const numerator = input.oldSizeInTokens * input.sizeDeltaUsd;
  const value = input.isLong ? ceilDiv(numerator, input.oldSizeUsd) : numerator / input.oldSizeUsd;
  return {
    value,
    expanded: input.isLong
      ? `⌈${input.oldSizeInTokens} × ${input.sizeDeltaUsd} / ${input.oldSizeUsd}⌉ = ${value}（多头部分平向上取整）`
      : `⌊${input.oldSizeInTokens} × ${input.sizeDeltaUsd} / ${input.oldSizeUsd}⌋ = ${value}（空头部分平向下取整）`,
  };
}

/**
 * 开仓喂 skew / balanceWasImproved 判定的预备 tokenDelta（裸 index 价，非事件最终值）：
 * 多头 ⌊sizeUsd/index.max⌋ / 空头 ⌈sizeUsd/index.min⌉（getIncreaseOrderSize 预备值）。
 * 平仓无预备/最终分裂，直接用等比销账值。
 */
export function preliminaryIncreaseTokens(input: {
  readonly sizeUsd: bigint;
  readonly indexPriceMin: bigint;
  readonly indexPriceMax: bigint;
  readonly isLong: boolean;
}) {
  const value = input.isLong
    ? input.sizeUsd / input.indexPriceMax
    : ceilDiv(input.sizeUsd, input.indexPriceMin);
  return {
    value,
    expanded: input.isLong
      ? `⌊${input.sizeUsd} / index.max ${input.indexPriceMax}⌋ = ${value}`
      : `⌈${input.sizeUsd} / index.min ${input.indexPriceMin}⌉ = ${value}`,
  };
}

/**
 * 平仓支付瀑布（DecreasePositionCollateralUtils.processCollateral 同序重放）。
 * 顺序敏感：① 盈利先进 output → ② 收到的 funding 入押金 → ③ pay(欠的 funding)
 * → ④ pay(亏损) → ⑤ pay(费用 excl funding) → ⑥ 全平退全部剩余押金 / 部分平退 min(请求提取额, 剩余押金)。
 * pay = 先扣 output 再扣押金（盈利垫费）。全平且偿付型时结果与线性式等值。
 */
export function decreaseWaterfall(input: {
  readonly oldMargin: bigint;
  readonly positiveFunding: bigint;
  readonly negativeFunding: bigint;
  readonly positivePnlUsdc: bigint;
  readonly negativePnlUsdc: bigint;
  readonly costExcludingFunding: bigint;
  readonly fullClose: boolean;
  readonly requestedWithdrawal: bigint;
}) {
  let output = input.positivePnlUsdc;
  let remaining = input.oldMargin + input.positiveFunding;
  const pay = (amount: bigint): void => {
    const fromOutput = output < amount ? output : amount;
    output -= fromOutput;
    remaining -= amount - fromOutput;
  };
  pay(input.negativeFunding);
  pay(input.negativePnlUsdc);
  pay(input.costExcludingFunding);
  const withdrawal = input.fullClose
    ? remaining
    : (input.requestedWithdrawal < remaining ? input.requestedWithdrawal : remaining);
  output += withdrawal;
  remaining -= withdrawal;
  return {
    output,
    remainingCollateral: remaining,
    expanded: `瀑布：output=盈利 ${input.positivePnlUsdc} → 押金=${input.oldMargin}+funding ${input.positiveFunding} → pay(欠 funding ${input.negativeFunding}) → pay(亏损 ${input.negativePnlUsdc}) → pay(费用 ${input.costExcludingFunding}) → ${input.fullClose ? `全平退剩余押金 ${withdrawal}` : `部分平退 min(${input.requestedWithdrawal}, 剩余) = ${withdrawal}`} → output ${output}`,
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

// ── LogExpMath.exp 逐句 BigInt 移植 ─────────────────────────────────────────────
// 蓝本：Github/fx100-contracts@release-v0.3.1/src/common/math/LogExpMath.sol:151-286（标准 Balancer）。
// bit 级一致的根基：BigInt 除法与 EVM DIV/SDIV 同为向零截断；魔数、运算顺序、每一步截断位置逐句对应。
// ⚠️ 禁止用浮点 Math.exp 替代（53bit 尾数必对不上）；禁止重排乘除顺序（截断点移动即差 1 wei）。
const ONE_20 = 10n ** 20n;
const EXP_MAX = 130n * WEI_PRECISION;
const EXP_MIN = -41n * WEI_PRECISION;
// 18 位定点阈值（x0/x1）与无小数位大数（a0/a1）
const EXP_X0 = 128000000000000000000n;
const EXP_A0 = 38877084059945950922200000000000000000000000000000000000n;
const EXP_X1 = 64000000000000000000n;
const EXP_A1 = 6235149080811616882910000000n;
// 20 位定点阈值/魔数对 x2..x9（exp 未使用 x10/x11，与合约一致）
const EXP_PAIRS: ReadonlyArray<readonly [bigint, bigint]> = [
  [3200000000000000000000n, 7896296018268069516100000000000000n],
  [1600000000000000000000n, 888611052050787263676000000n],
  [800000000000000000000n, 298095798704172827474000n],
  [400000000000000000000n, 5459815003314423907810n],
  [200000000000000000000n, 738905609893065022723n],
  [100000000000000000000n, 271828182845904523536n],
  [50000000000000000000n, 164872127070012814685n],
  [25000000000000000000n, 128402541668774148407n],
];

export function logExpMathExp(exponent: bigint): bigint {
  if (exponent < EXP_MIN || exponent > EXP_MAX) throw new Error(`INVALID_EXPONENT：${exponent} 超出 [-41e18, 130e18]`);
  if (exponent < 0n) {
    // 负指数经 1e36 / exp(−x) 二次截断，与合约同序。
    return (WEI_PRECISION * WEI_PRECISION) / logExpMathExp(-exponent);
  }
  let x = exponent;
  let firstAN: bigint;
  if (x >= EXP_X0) { x -= EXP_X0; firstAN = EXP_A0; }
  else if (x >= EXP_X1) { x -= EXP_X1; firstAN = EXP_A1; }
  else firstAN = 1n;
  x *= 100n; // 升到 20 位定点
  let product = ONE_20;
  for (const [threshold, an] of EXP_PAIRS) {
    if (x >= threshold) { x -= threshold; product = (product * an) / ONE_20; }
  }
  let seriesSum = ONE_20;
  let term = x;
  seriesSum += term;
  for (let n = 2n; n <= 12n; n += 1n) {
    term = ((term * x) / ONE_20) / n; // 先乘 x 除 1e20，再除 n——逐项截断顺序与合约一致
    seriesSum += term;
  }
  return (((product * seriesSum) / ONE_20) * firstAN) / 100n;
}

// ── 订单簿深度冲击分量（getPriceImpactSpread 逐句复算）────────────────────────────
// 蓝本：src/pricing/PositionPricingUtils.sol:177-198。
export function calculatePriceImpactSpread(input: {
  readonly orderSizeUsd: bigint;
  readonly priceImpactParameter: bigint;
  readonly depth: bigint;
  readonly maxPriceImpactSpread: bigint;
}) {
  if (input.depth === 0n || input.priceImpactParameter === 0n) {
    return { spread: 0n, expanded: 'depth 或 priceImpactParameter 为 0（防除零守卫）→ priceImpactSpread = 0' };
  }
  const expArg = (input.orderSizeUsd * input.priceImpactParameter) / input.depth;
  const expTerm = logExpMathExp(expArg) - WEI_PRECISION;
  const linear = (input.orderSizeUsd * WEI_PRECISION) / input.depth;
  const raw = (expTerm > linear ? expTerm : linear) / 100n;
  const spread = raw < input.maxPriceImpactSpread ? raw : input.maxPriceImpactSpread;
  return {
    spread,
    expanded: `expArg = ${input.orderSizeUsd} × ${input.priceImpactParameter} / ${input.depth} = ${expArg}；`
      + `max(exp(expArg) − 1e18 = ${expTerm}, 线性 ${input.orderSizeUsd} × 1e18 / ${input.depth} = ${linear}) / 100 = ${raw}；`
      + `封顶 min(·, ${input.maxPriceImpactSpread}) = ${spread}`,
  };
}

// ── Dynamic Spread 总合成（getDynamicSpread 口径，v0.3.2）────────────────────────
// 蓝本：Github/fx100-contracts@release-v0.3.2/src/pricing/PositionPricingUtils.sol:154-186：
//   raw = skewImpact + int256(constantPriceSpread) + priceImpactSpread
//   min = getInt(MIN_DYNAMIC_SPREAD[marketIndex][isLong])；max = getInt(MAX_DYNAMIC_SPREAD[marketIndex][isLong])
//   if (!allowNegativeSpread && min < 0) min = 0；if (max < min) max = min
//   return Calc.clamp(raw, min, max)   （等号不属于钳制侧）
// ⚠️ 两键未配置时 getInt 为 0 → clamp(raw, 0, 0) = 0，常数点差一并被吞——这是链上真实行为，
//    不是"未配置视为不限制"；调用方读不到键值时应标 NOT_VERIFIED，而不是在这里兜底。
// v0.3.1 的 floor-at-0（sum ≤ 0 → 0）已废弃：v0.3.2 允许负点差（min < 0 且 allowNegativeSpread）。
export function composeDynamicSpread(input: {
  readonly constantPriceSpread: bigint;
  readonly priceImpactSpread: bigint;
  readonly skewImpact: bigint;
  readonly minDynamicSpread: bigint;
  readonly maxDynamicSpread: bigint;
  readonly allowNegativeSpread: boolean;
}) {
  const raw = input.skewImpact + input.constantPriceSpread + input.priceImpactSpread;
  const minFloored = !input.allowNegativeSpread && input.minDynamicSpread < 0n;
  const effectiveMin = minFloored ? 0n : input.minDynamicSpread;
  const maxCollapsed = input.maxDynamicSpread < effectiveMin;
  const effectiveMax = maxCollapsed ? effectiveMin : input.maxDynamicSpread;
  const spread = clamp(raw, effectiveMin, effectiveMax);
  const minText = minFloored
    ? `min = ${input.minDynamicSpread} → 0（allowNegativeSpread=false 且 min<0）`
    : `min = ${input.minDynamicSpread}`;
  const maxText = maxCollapsed
    ? `max = ${input.maxDynamicSpread} < min → ${effectiveMax}（区间坍缩为 [min, min]）`
    : `max = ${input.maxDynamicSpread}`;
  return {
    spread,
    raw,
    effectiveMin,
    effectiveMax,
    expanded: `raw = skewImpact ${input.skewImpact} + constant ${input.constantPriceSpread} + priceImpact ${input.priceImpactSpread} = ${raw}；`
      + `${minText}；${maxText}；clamp(${raw}, ${effectiveMin}, ${effectiveMax}) = ${spread}`,
  };
}

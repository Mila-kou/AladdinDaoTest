import assert from 'node:assert/strict';

import {
  calculateExecutionPrice,
  calculateFundingFactors,
  calculateGrace,
  calculatePositionFee,
  calculateSignedSkew,
  calculateSkewImpact,
  calculatePriceImpactSpread,
  composeDynamicSpread,
  logExpMathExp,
} from '../src/reconciliation/formulas.js';

const zeroGrace = calculateGrace({ graceStart: 1_000n, graceBase: 0n, tierMultiplier: 10n ** 18n });
assert.equal(zeroGrace.effectiveGrace, 0n);
assert.equal(zeroGrace.graceEnd, 1_000n);

const tierGrace = calculateGrace({ graceStart: 1_000n, graceBase: 900n, tierMultiplier: 15n * 10n ** 17n });
assert.equal(tierGrace.effectiveGrace, 1_350n);
assert.equal(tierGrace.graceEnd, 2_350n);

assert.equal(calculateExecutionPrice({ oraclePrice: 101n, dynamicSpread: 10n ** 16n, adverseUp: true }).executionPrice, 103n);
assert.equal(calculateExecutionPrice({ oraclePrice: 101n, dynamicSpread: 10n ** 16n, adverseUp: false }).executionPrice, 99n);

const positionFee = calculatePositionFee({
  tradeSizeUsd: 50n * 10n ** 30n,
  positionFeeFactor: 10n ** 26n,
  collateralPriceMin: 10n ** 24n,
});
assert.equal(positionFee.positionFee, 5_000n);

const funding = calculateFundingFactors({
  fundingFloor: 5n,
  fundingBase: 20n,
  emaSkew: 5n * 10n ** 17n,
  minimum: -4n,
  maximum: 12n,
});
assert.equal(funding.long, 12n, 'Long factor 应触发上限 clamp');
assert.equal(funding.short, -4n, 'Short factor 应触发下限 clamp');

const noOpenInterestFunding = calculateFundingFactors({
  fundingFloor: 5n,
  fundingBase: 20n,
  emaSkew: 0n,
  minimum: -4n,
  maximum: 12n,
  hasOpenInterest: false,
});
assert.equal(noOpenInterestFunding.long, 0n, '没有 OI 时 Funding 更新应为 no-op');
assert.equal(noOpenInterestFunding.short, 0n, '没有 OI 时 Funding 更新应为 no-op');

assert.equal(calculateSignedSkew(75n, 25n), 5n * 10n ** 17n);
assert.equal(calculateSignedSkew(0n, 0n), 0n);

const skewImpact = calculateSkewImpact({
  skewImpactFactor: 10n ** 16n,
  skewReference: 5n * 10n ** 17n,
  balanceWasImproved: true,
  minimum: -4n * 10n ** 15n,
  maximum: 4n * 10n ** 15n,
});
assert.equal(skewImpact.skewImpact, -4n * 10n ** 15n, '改善平衡时应为负并触发最小值 clamp');

// LogExpMath.exp 逐句移植回归向量（蓝本 src/common/math/LogExpMath.sol；任何魔数/运算序改动都会打破 bit 级一致）
assert.equal(logExpMathExp(0n), 10n ** 18n, 'exp(0) = 1');
assert.equal(logExpMathExp(10n ** 18n), 2718281828459045235n, 'exp(1) = e（a7/100 截断）');
assert.equal(logExpMathExp(250000000000000000n), 1284025416687741484n, 'exp(0.25) 恰触 x9 阈值（a9/100）');
assert.equal(logExpMathExp(100000000000000n), 1000100005000166670n, 'exp(1e-4) 纯泰勒段');
assert.equal(logExpMathExp(-(10n ** 18n)), (10n ** 36n) / 2718281828459045235n, 'exp(-1) 负分支 = 1e36/exp(1)');
assert.throws(() => logExpMathExp(131n * 10n ** 18n), 'exp 域上界 130e18 越界应抛错');

// Dynamic Spread 实盘锚定向量（SCN-009 2026-08-13 运行 TX2，事件值 bit 级复现）
const piSpread = calculatePriceImpactSpread({
  orderSizeUsd: 50n * 10n ** 30n,
  priceImpactParameter: 600000000000000000n,
  depth: 7923961270000000000000000000000000000n,
  maxPriceImpactSpread: 5000000000000000n,
});
// v0.3.2 composeDynamicSpread 需要 clamp 上下界与 allowNegativeSpread（PositionPricingUtils.sol:154-186）。
// 该实盘向量来自 v0.3.1 环境（无 MIN/MAX_DYNAMIC_SPREAD 键）；这里按部署默认值 min=−2e16 / max=1e18
// （scripts/config/defaults.ts，详解层 §4.1）给出不触发钳制的区间，仅验证三分量求和 + exp 移植的 bit 级一致。
const dynSpread = composeDynamicSpread({
  constantPriceSpread: 100000000000000n,
  priceImpactSpread: piSpread.spread,
  skewImpact: 1250000000000000n,
  minDynamicSpread: -20000000000000000n,
  maxDynamicSpread: 10n ** 18n,
  allowNegativeSpread: true,
});
assert.equal(dynSpread.spread, 1350063099753136n, 'SCN-009 TX2 实盘 dynamicSpread bit 级复现');

// v0.3.2 clamp 分支（合约语义，非 v0.3.1 floor-at-0）：
// ① 两键未配置（getInt=0）→ clamp(raw,0,0)=0，常数点差一并被吞
const unconfigured = composeDynamicSpread({
  constantPriceSpread: 100000000000000n, priceImpactSpread: 0n, skewImpact: 0n,
  minDynamicSpread: 0n, maxDynamicSpread: 0n, allowNegativeSpread: true,
});
assert.equal(unconfigured.spread, 0n, 'MIN/MAX_DYNAMIC_SPREAD 未配置 → clamp(raw,0,0)=0');
// ② 负 raw 在允许负点差时保留（v0.3.1 会夹到 0）；清算/ADL（allowNegativeSpread=false）把 min 抬到 0
const negativeAllowed = composeDynamicSpread({
  constantPriceSpread: 100000000000000n, priceImpactSpread: 0n, skewImpact: -5000000000000000n,
  minDynamicSpread: -20000000000000000n, maxDynamicSpread: 10n ** 18n, allowNegativeSpread: true,
});
assert.equal(negativeAllowed.spread, -4900000000000000n, 'allowNegativeSpread=true 且 min<0 → 负点差保留');
const negativeForbidden = composeDynamicSpread({
  constantPriceSpread: 100000000000000n, priceImpactSpread: 0n, skewImpact: -5000000000000000n,
  minDynamicSpread: -20000000000000000n, maxDynamicSpread: 10n ** 18n, allowNegativeSpread: false,
});
assert.equal(negativeForbidden.spread, 0n, 'allowNegativeSpread=false 且 min<0 → min 抬到 0');
// ③ max < min → 区间坍缩为 [min, min]
const collapsed = composeDynamicSpread({
  constantPriceSpread: 100000000000000n, priceImpactSpread: 0n, skewImpact: 0n,
  minDynamicSpread: 3000000000000000n, maxDynamicSpread: 1000000000000000n, allowNegativeSpread: true,
});
assert.equal(collapsed.spread, 3000000000000000n, 'max<min → max=min，点差恒等于 min');

console.log('Shared reconciliation formula model: PASS');

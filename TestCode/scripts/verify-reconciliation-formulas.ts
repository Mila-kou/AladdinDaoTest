import assert from 'node:assert/strict';

import {
  calculateExecutionPrice,
  calculateFundingFactors,
  calculateGrace,
  calculatePositionFee,
  calculateSignedSkew,
  calculateSkewImpact,
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

console.log('Shared reconciliation formula model: PASS');

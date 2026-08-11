import {
  SCN070_CASES,
  isAdverseBoundaryCrossed,
  isExecutionPriceAcceptable,
  validateScn070Matrix,
} from '../src/scenarios/scn-070-model.js';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

validateScn070Matrix();

for (const definition of SCN070_CASES) {
  const acceptablePrice = 100n;
  assert(
    isExecutionPriceAcceptable(
      acceptablePrice,
      acceptablePrice,
      definition.isIncrease,
      definition.isLong,
    ),
    `${definition.id}: E=A 必须可接受`,
  );

  const adverseExecutionPrice = definition.oracleDirection > 0 ? 101n : 99n;
  if (definition.boundary === 'equal') {
    assert(definition.oracleDirection === 0, `${definition.id}: equal 不得移动 Oracle`);
    assert(definition.expectedOutcome === 'executed', `${definition.id}: equal 必须成交`);
  } else {
    assert(
      isAdverseBoundaryCrossed(definition, adverseExecutionPrice, acceptablePrice),
      `${definition.id}: 不利方向必须越过 acceptablePrice`,
    );
    assert(definition.expectedOutcome === 'cancelled', `${definition.id}: adverse 必须取消`);
  }
}

const summary = SCN070_CASES.map((item) => ({
  id: item.id,
  comparison: item.isIncrease
    ? (item.isLong ? 'E <= A' : 'E >= A')
    : (item.isLong ? 'E >= A' : 'E <= A'),
  boundary: item.boundary,
  outcome: item.expectedOutcome,
}));

console.log('SCN-070 纯模型校验通过：4 个市价四象限 × 2 个边界 = 8 个数据集。');
console.table(summary);

import assert from 'node:assert/strict';

import type {
  ActionEvidence,
  Address,
  EnvironmentIdentity,
} from '../src/evidence/evidence-v3.js';
import { evidenceEnvelopeSchema } from '../src/evidence/evidence-v3.js';
import type {
  ResolvedTestEnvironment,
  TestEnvironmentDefinition,
} from '../src/domain/test-environment.js';
import { InvalidTestEnvironmentError } from '../src/domain/test-environment.js';
import { ScenarioHarness, type ActionExecutorRegistry } from '../src/scenario-engine/action-executor.js';
import type { ScenarioDefinition } from '../src/scenario-engine/actions.js';
import { ref, referenceKey } from '../src/scenario-engine/references.js';
import { scenario } from '../src/scenario-engine/scenario-builder.js';
import {
  conditionAssessmentParameterName,
  InvalidScenarioTransitionError,
  validateScenarioDefinition,
} from '../src/scenario-engine/state-machine.js';

const actor = '0x1111111111111111111111111111111111111111' as Address;
const keeper = '0x2222222222222222222222222222222222222222' as Address;
const market = '0x3333333333333333333333333333333333333333' as Address;
const token = '0x4444444444444444444444444444444444444444' as Address;
const openOrderKey = `0x${'a'.repeat(64)}` as const;
const positionKey = `0x${'b'.repeat(64)}` as const;
const closeOrderKey = `0x${'c'.repeat(64)}` as const;
const limitOrderKey = `0x${'d'.repeat(64)}` as const;
type ConditionStatus = 'SATISFIED' | 'NOT_SATISFIED' | 'NOT_CHECKED';
interface ConditionAssessmentFixture {
  readonly condition: 'liquidation' | 'adl';
  readonly subject: string;
  readonly status: ConditionStatus;
  readonly sourcePath: string;
  readonly blockNumber: `${bigint}`;
}

const txMockEnvironment: TestEnvironmentDefinition = {
  targetProject: 'tx-fork',
  marketMode: 'mock-market',
  oracleMode: 'mock-oracle',
  marketCompatibility: 'mock-only',
  timeMode: 'normal-block-time',
  signingMode: 'trader-keeper-private-key',
  mockResourceAlias: 'default-mock',
  environmentSetup: '独享 tx-fork + default-mock；执行后回滚快照。',
};

const oracleMockEnvironment: TestEnvironmentDefinition = {
  ...txMockEnvironment,
  targetProject: 'oracle-fork',
  environmentSetup: '独享 oracle-fork + default-mock；允许显式调价，执行后恢复并回滚。',
};

const timeMockEnvironment: TestEnvironmentDefinition = {
  ...txMockEnvironment,
  targetProject: 'time-fork',
  timeMode: 'controllable-time',
  environmentSetup: '独享 time-fork + default-mock；允许推进时间，执行后回滚。',
};

function resolved(environment: TestEnvironmentDefinition): ResolvedTestEnvironment {
  return {
    targetProject: environment.targetProject,
    marketMode: environment.marketMode,
    oracleMode: environment.oracleMode,
    timeMode: environment.timeMode,
    signingMode: environment.signingMode,
    mockResourceAlias: environment.mockResourceAlias,
  };
}

function identity(environment: ResolvedTestEnvironment): EnvironmentIdentity {
  return {
    name: environment.targetProject,
    chainId: environment.targetProject === 'tx-fork' ? 99911
      : environment.targetProject === 'oracle-fork' ? 99912
        : environment.targetProject === 'time-fork' ? 99913 : 84532,
    deploymentId: 'scenario-engine-fixture',
    market: {
      mode: environment.marketMode,
      resourceAlias: environment.mockResourceAlias,
      marketIndex: 4,
      marketAddress: market,
    },
  };
}

let clock = 0;
function iso(): string {
  clock += 1;
  return new Date(clock * 1_000).toISOString();
}

function rawEvidence(
  outcome: ActionEvidence['outcome'],
  sequence: number,
  input: {
    role?: 'trader' | 'keeper' | 'oracle';
    orderKey?: `0x${string}`;
    positionKey?: `0x${string}`;
    conditionAssessments?: readonly ConditionAssessmentFixture[];
  } = {},
): Omit<ActionEvidence, 'schemaVersion' | 'actionId' | 'sequence' | 'type' | 'purpose' | 'capabilities'> {
  const block = BigInt(100 + sequence * 2);
  const role = input.role ?? (['EXECUTED', 'CANCELLED', 'FROZEN'].includes(outcome) ? 'keeper' : 'trader');
  return {
    outcome,
    input: {},
    transactions: [{
      txHash: `0x${String(sequence).padStart(64, '0')}`,
      blockNumber: block.toString() as `${bigint}`,
      actor: role === 'keeper' ? keeper : actor,
      role,
      ...(input.orderKey ? { orderKey: input.orderKey } : {}),
      gasUsed: '100000',
      status: 'SUCCESS',
    }],
    ...(input.orderKey ? { orderRefs: { order: input.orderKey } } : {}),
    ...(input.positionKey ? { positionRefs: { position: input.positionKey } } : {}),
    snapshots: ['EXECUTED', 'CANCELLED', 'FROZEN'].includes(outcome) ? [
      { id: `before-${sequence}`, kind: 'execution-before', blockNumber: (block - 1n).toString() as `${bigint}`, source: 'reader', values: {} },
      { id: `after-${sequence}`, kind: 'execution-after', blockNumber: block.toString() as `${bigint}`, source: 'reader', values: {} },
    ] : [],
    events: [],
    parameters: (input.conditionAssessments ?? []).map((assessment) => ({
      name: conditionAssessmentParameterName(assessment.condition, assessment.subject),
      value: { status: assessment.status, observed: { eligible: assessment.status === 'SATISFIED' } },
      source: assessment.sourcePath,
      blockNumber: assessment.blockNumber,
    })),
    oracle: role === 'oracle' ? [{ token, min: '99', max: '100', timestamp: '1', blockNumber: block.toString() as `${bigint}` }] : [],
    startedAt: iso(),
    endedAt: iso(),
  };
}

let conditionStatus: ConditionStatus = 'SATISFIED';
let liquidateCalls = 0;
let adlCalls = 0;
let actionCalls = 0;

const executors: ActionExecutorRegistry = {
  submitMarketIncrease: {
    execute: async ({ sequence }) => {
      actionCalls += 1;
      return rawEvidence('SUBMITTED', sequence, { orderKey: openOrderKey });
    },
  },
  placeLimit: {
    execute: async ({ sequence }) => {
      actionCalls += 1;
      return rawEvidence('SUBMITTED', sequence, { orderKey: limitOrderKey });
    },
  },
  executeOrder: {
    execute: async ({ sequence, action, context }) => {
      actionCalls += 1;
      const orderKey = context.order(action.order)?.orderKey;
      return rawEvidence(action.expectedOutcome ?? 'EXECUTED', sequence, {
        role: 'keeper',
        ...(orderKey ? { orderKey } : {}),
        ...(action.savePositionAs ? { positionKey } : {}),
      });
    },
  },
  submitMarketDecrease: {
    execute: async ({ sequence }) => {
      actionCalls += 1;
      return rawEvidence('SUBMITTED', sequence, { orderKey: closeOrderKey });
    },
  },
  addTpSl: {
    execute: async ({ sequence }) => {
      actionCalls += 1;
      return rawEvidence('SUBMITTED', sequence);
    },
  },
  movePrice: {
    execute: async ({ sequence, action }) => {
      actionCalls += 1;
      const assessments = (action.assess ?? []).map((request): ConditionAssessmentFixture => ({
        condition: request.condition,
        subject: referenceKey(request.position),
        status: conditionStatus,
        sourcePath: `actions[${sequence - 1}].postPriceRiskAssessment.${request.condition}`,
        blockNumber: String(100 + sequence * 2) as `${bigint}`,
      }));
      return rawEvidence('OBSERVED', sequence, { role: 'oracle', conditionAssessments: assessments });
    },
  },
  advanceTime: {
    execute: async ({ sequence }) => {
      actionCalls += 1;
      return rawEvidence('OBSERVED', sequence, { role: 'oracle' });
    },
  },
  liquidate: {
    execute: async ({ sequence }) => {
      actionCalls += 1;
      liquidateCalls += 1;
      return rawEvidence('EXECUTED', sequence, { role: 'keeper' });
    },
  },
  adl: {
    execute: async ({ sequence }) => {
      actionCalls += 1;
      adlCalls += 1;
      return rawEvidence('EXECUTED', sequence, { role: 'keeper' });
    },
  },
};

function harnessOptions(environment: ResolvedTestEnvironment) {
  return {
    environment: identity(environment),
    resolvedEnvironment: environment,
    actors: { trader: actor },
  } as const;
}

const order = ref.order('open');
const position = ref.position('main');
const definition = scenario('XT-MKT-OPEN-001', {
  environment: txMockEnvironment,
  actors: ['trader'],
  variantId: 'long-50usd-10usdc',
  checkPlan: { defaultPacks: ['order.market-increase-created', 'order.executed', 'position.increased'] },
})
  .openMarket({
    actor: 'trader', side: 'long', collateralRaw: '10000000',
    sizeDeltaUsdRaw: '50000000000000000000000000000000', saveAs: order, savePositionAs: position,
  })
  .build();

assert.equal(definition.environment.targetProject, 'tx-fork');
assert.deepEqual(definition.actions.map((item) => item.type), ['submitMarketIncrease', 'executeOrder']);
assert.equal(definition.flowType, 'create-execute');

const envelope = await new ScenarioHarness(executors).run(definition, {
  ...harnessOptions(resolved(txMockEnvironment)),
  executionId: 'golden-replay-producer-contract',
  now: () => new Date(10_000 + clock++ * 1_000),
});
assert.equal(envelope.schemaVersion, 3);
evidenceEnvelopeSchema.parse(envelope);
assert.equal(envelope.actions[1]?.outcome, 'EXECUTED');
assert.equal(envelope.actions[1]?.windowContamination?.status, 'NOT_CHECKED');
assert.equal(envelope.actions[1]?.snapshots[0]?.blockNumber, '103');
assert.equal(envelope.actions[1]?.snapshots[1]?.blockNumber, '104');
assert.equal('verdict' in envelope.actions[1]!, false);
assert.equal('expected' in envelope.actions[1]!, false);

// Action Executor 只能产原始事实，不能自行声明 CLEAN/POLLUTED/NOT_CHECKED。
// 即使是非结算 Action，也不能把伪造窗口带入 Evidence。
const forgedWindowDefinition = scenario('FORGED-WINDOW', {
  environment: oracleMockEnvironment,
  actors: ['trader'],
  variantId: 'executor-window-forbidden',
}).movePrice({ index: { min: '100', max: '100' }, purpose: 'support' }).build();
await assert.rejects(
  () => new ScenarioHarness({
    movePrice: {
      execute: async ({ sequence }) => ({
        ...rawEvidence('OBSERVED', sequence, { role: 'oracle' }),
        windowContamination: { status: 'NOT_CHECKED' as const, note: 'forged by executor' },
      }),
    },
  }).run(forgedWindowDefinition, harnessOptions(resolved(oracleMockEnvironment))),
  /Action Executor 不得自行提供执行窗口污染结论/u,
);

// 多份 execution-after 不能由调用方先 find 后绕过共享唯一性规则。
await assert.rejects(
  () => new ScenarioHarness({
    ...executors,
    executeOrder: {
      execute: async ({ sequence, action, context }) => {
        const currentOrderKey = context.order(action.order)?.orderKey;
        const raw = rawEvidence('EXECUTED', sequence, {
          role: 'keeper',
          ...(currentOrderKey ? { orderKey: currentOrderKey } : {}),
          ...(action.savePositionAs ? { positionKey } : {}),
        });
        const after = raw.snapshots.find((snapshot) => snapshot.kind === 'execution-after');
        assert.ok(after);
        return {
          ...raw,
          snapshots: [...raw.snapshots, { ...after, id: `${after.id}-duplicate` }],
        };
      },
    },
  }).run(definition, harnessOptions(resolved(txMockEnvironment))),
  /要求唯一 execution-before\/execution-after/u,
);

// 普通 Market 全平不依赖调价；此前错误地要求 movePrice，会误拒黄金 roundtrip。
const closeOrder = ref.order('close');
const roundtrip = scenario('XT-MKT-OPEN-001', { environment: txMockEnvironment, actors: ['trader'], variantId: 'roundtrip' })
  .openMarket({
    actor: 'trader', side: 'long', collateralRaw: '10000000', sizeDeltaUsdRaw: '50000000000000000000000000000000',
    saveAs: order, savePositionAs: position, purpose: 'primary',
  })
  .closePosition({ actor: 'trader', position, saveAs: closeOrder, purpose: 'cleanup' })
  .build();
assert.equal((await new ScenarioHarness(executors).run(roundtrip, harnessOptions(resolved(txMockEnvironment)))).actions.length, 4);

// §7.1：无仓位不能平仓，也不能添加仓位级 TP/SL。
assert.throws(
  () => scenario('INVALID-CLOSE', { environment: txMockEnvironment, actors: ['trader'] })
    .closePosition({ actor: 'trader', position: ref.position('missing'), saveAs: ref.order('close') }).build(),
  InvalidScenarioTransitionError,
);
assert.throws(
  () => scenario('INVALID-TPSL', { environment: txMockEnvironment, actors: ['trader'] })
    .addTpSl({ actor: 'trader', position: ref.position('missing'), takeProfitRaw: '110', tpSaveAs: ref.order('tp') }).build(),
  InvalidScenarioTransitionError,
);

// §7.2：即使输入来自 JSON/不受 TS excess-property 保护，Market 单携带 trigger 也必须拒绝。
const malformedMarket = {
  ...definition,
  actions: [{ ...definition.actions[0]!, triggerPriceRaw: '100' }, ...definition.actions.slice(1)],
} as ScenarioDefinition;
assert.throws(() => validateScenarioDefinition(malformedMarket), InvalidScenarioTransitionError);

// §7.3：Limit trigger 缺失/非正整数必须在构建期拒绝。
assert.throws(
  () => scenario('INVALID-LIMIT-TRIGGER', { environment: oracleMockEnvironment, actors: ['trader'] })
    .placeLimit({
      actor: 'trader', side: 'long', collateralRaw: '1', sizeDeltaUsdRaw: '1',
      triggerPriceRaw: '', acceptablePriceRaw: '100', saveAs: ref.order('limit'), purpose: 'primary',
    }).build(),
  InvalidScenarioTransitionError,
);

// §7.4：LimitIncrease 使用合约 BaseOrderUtils 同口径价格带，不能以“曾经调价”代替触发条件。
assert.throws(
  () => scenario('INVALID-LIMIT-PRICE', { environment: oracleMockEnvironment, actors: ['trader'] })
    .placeLimit({
      actor: 'trader', side: 'long', collateralRaw: '1', sizeDeltaUsdRaw: '1',
      triggerPriceRaw: '100', acceptablePriceRaw: '100', saveAs: ref.order('limit'), purpose: 'primary',
    })
    .movePrice({ index: { min: '101', max: '101' }, purpose: 'support' })
    .executeOrder({ order: ref.order('limit'), savePositionAs: ref.position('limit-position') })
    .build(),
  InvalidScenarioTransitionError,
);
const satisfiedLongLimit = scenario('VALID-LIMIT-LONG', { environment: oracleMockEnvironment, actors: ['trader'] })
  .placeLimit({
    actor: 'trader', side: 'long', collateralRaw: '1', sizeDeltaUsdRaw: '1',
    triggerPriceRaw: '100', acceptablePriceRaw: '100', saveAs: ref.order('limit'), purpose: 'primary',
  })
  .movePrice({ index: { min: '99', max: '100' }, purpose: 'support' })
  .executeOrder({ order: ref.order('limit'), savePositionAs: ref.position('limit-position') })
  .build();
await new ScenarioHarness(executors).run(satisfiedLongLimit, harnessOptions(resolved(oracleMockEnvironment)));
scenario('VALID-LIMIT-SHORT', { environment: oracleMockEnvironment, actors: ['trader'] })
  .placeLimit({
    actor: 'trader', side: 'short', collateralRaw: '1', sizeDeltaUsdRaw: '1',
    triggerPriceRaw: '100', acceptablePriceRaw: '100', saveAs: ref.order('limit'), purpose: 'primary',
  })
  .movePrice({ index: { min: '100', max: '101' }, purpose: 'support' })
  .executeOrder({ order: ref.order('limit'), savePositionAs: ref.position('limit-position') })
  .build();

// §7.5：清算要求调价后的、带来源的独立风险评估；任意调价或 NOT_SATISFIED 都不够。
assert.throws(
  () => scenario('INVALID-LIQUIDATION-NO-ASSESSMENT', { environment: oracleMockEnvironment, actors: ['trader'] })
    .openMarket({ actor: 'trader', side: 'long', collateralRaw: '1', sizeDeltaUsdRaw: '10', saveAs: order, savePositionAs: position })
    .movePrice({ index: { min: '50', max: '50' }, purpose: 'support' })
    .liquidate({ position, purpose: 'primary' }).build(),
  InvalidScenarioTransitionError,
);
assert.throws(
  () => scenario('INVALID-LIQUIDATION-STALE-ASSESSMENT', { environment: oracleMockEnvironment, actors: ['trader'] })
    .openMarket({ actor: 'trader', side: 'long', collateralRaw: '1', sizeDeltaUsdRaw: '10', saveAs: order, savePositionAs: position })
    .movePrice({ index: { min: '60', max: '60' }, assess: [{ condition: 'liquidation', position }] })
    .movePrice({ index: { min: '50', max: '50' } })
    .liquidate({ position }).build(),
  InvalidScenarioTransitionError,
);
const liquidation = scenario('LIQUIDATION-ASSESSMENT', { environment: oracleMockEnvironment, actors: ['trader'] })
  .openMarket({ actor: 'trader', side: 'long', collateralRaw: '1', sizeDeltaUsdRaw: '10', saveAs: order, savePositionAs: position })
  .movePrice({ index: { min: '50', max: '50' }, assess: [{ condition: 'liquidation', position }], purpose: 'support' })
  .liquidate({ position, purpose: 'primary' }).build();
conditionStatus = 'NOT_SATISFIED';
liquidateCalls = 0;
await assert.rejects(
  () => new ScenarioHarness(executors).run(liquidation, harnessOptions(resolved(oracleMockEnvironment))),
  InvalidScenarioTransitionError,
);
assert.equal(liquidateCalls, 0, '条件未满足时不得调用 liquidate Executor');
conditionStatus = 'SATISFIED';
const liquidationEnvelope = await new ScenarioHarness(executors).run(
  liquidation,
  harnessOptions(resolved(oracleMockEnvironment)),
);
evidenceEnvelopeSchema.parse(liquidationEnvelope);
assert.equal(
  liquidationEnvelope.actions[2]?.parameters[0]?.name,
  'precondition.liquidation.position:main',
);
assert.equal(liquidateCalls, 1);

// §7.6：ADL 同样要求独立市场条件评估，不能复用 liquidation 或单纯调价结论。
const adlDefinition = scenario('ADL-ASSESSMENT', { environment: oracleMockEnvironment, actors: ['trader'] })
  .openMarket({ actor: 'trader', side: 'short', collateralRaw: '1', sizeDeltaUsdRaw: '10', saveAs: order, savePositionAs: position })
  .movePrice({ index: { min: '150', max: '150' }, assess: [{ condition: 'adl', position }], purpose: 'support' })
  .adl({ position, sizeDeltaUsdRaw: '5', purpose: 'primary' }).build();
conditionStatus = 'NOT_CHECKED';
adlCalls = 0;
await assert.rejects(
  () => new ScenarioHarness(executors).run(adlDefinition, harnessOptions(resolved(oracleMockEnvironment))),
  InvalidScenarioTransitionError,
);
assert.equal(adlCalls, 0, 'ADL 条件未核验时不得调用 Executor');
conditionStatus = 'SATISFIED';
await new ScenarioHarness(executors).run(adlDefinition, harnessOptions(resolved(oracleMockEnvironment)));
assert.equal(adlCalls, 1);

// §7.7：AdvanceTime 是一等动作；非 time-fork 在构建期即拒绝。
assert.throws(
  () => scenario('INVALID-ADVANCE-TIME', { environment: txMockEnvironment, actors: ['trader'] })
    .advanceTime({ seconds: 3600, purpose: 'support' }).build(),
  InvalidScenarioTransitionError,
);
assert.throws(
  () => scenario('INVALID-MOVE-PRICE-TIME', { environment: oracleMockEnvironment, actors: ['trader'] })
    .movePrice({ index: { min: '100', max: '100' }, timestamp: '2000000000' }).build(),
  InvalidScenarioTransitionError,
);
const timeDefinition = scenario('VALID-ADVANCE-TIME', { environment: timeMockEnvironment, actors: ['trader'] })
  .advanceTime({ seconds: 3600, purpose: 'support' }).build();
await new ScenarioHarness(executors).run(timeDefinition, harnessOptions(resolved(timeMockEnvironment)));

// §7.8：mock-only 不得在运行时切到普通部署市场；mock-and-deployed 才允许显式切换。
const deployedResolved: ResolvedTestEnvironment = {
  ...resolved(txMockEnvironment), marketMode: 'deployed-market', oracleMode: 'deployed-oracle', mockResourceAlias: 'none',
};
actionCalls = 0;
await assert.rejects(
  () => new ScenarioHarness(executors).run(definition, harnessOptions(deployedResolved)),
  InvalidTestEnvironmentError,
);
assert.equal(actionCalls, 0, '环境不兼容必须在调用任何 Executor 前拒绝');
const flexibleEnvironment: TestEnvironmentDefinition = {
  ...txMockEnvironment,
  marketCompatibility: 'mock-and-deployed',
};
const flexibleDefinition = scenario('ENVIRONMENT-FLEXIBLE', { environment: flexibleEnvironment, actors: ['trader'] })
  .openMarket({
    actor: 'trader', side: 'long', collateralRaw: '1', sizeDeltaUsdRaw: '10',
    saveAs: order, savePositionAs: position,
  })
  .build();
await new ScenarioHarness(executors).run(flexibleDefinition, harnessOptions(deployedResolved));

// 8 字段结构本身也受约束，空说明与 targetProject/timeMode 不一致不得进入 Scenario。
assert.throws(
  () => scenario('INVALID-ENV-EMPTY', {
    environment: { ...txMockEnvironment, environmentSetup: '' }, actors: ['trader'],
  }),
  InvalidTestEnvironmentError,
);
assert.throws(
  () => scenario('INVALID-ENV-TIME', {
    environment: { ...txMockEnvironment, timeMode: 'controllable-time' }, actors: ['trader'],
  }),
  InvalidTestEnvironmentError,
);
for (const field of [
  'targetProject', 'marketMode', 'oracleMode', 'marketCompatibility',
  'timeMode', 'signingMode', 'mockResourceAlias', 'environmentSetup',
] as const) {
  const malformed = { ...txMockEnvironment } as Record<string, unknown>;
  delete malformed[field];
  assert.throws(
    () => scenario(`INVALID-ENV-MISSING-${field}`, {
      environment: malformed as unknown as TestEnvironmentDefinition,
      actors: ['trader'],
    }),
    InvalidTestEnvironmentError,
    `缺少 ${field} 必须拒绝`,
  );
}

console.log('scenario-engine verification passed: structured environment + 8 rejection rules');

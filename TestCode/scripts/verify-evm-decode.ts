import assert from 'node:assert/strict';

import {
  BaseError,
  ContractFunctionRevertedError,
  encodeAbiParameters,
  encodeErrorResult,
  type Hex,
} from 'viem';

import { loadDeploymentAbi, loadDeploymentManifest } from '../src/config/deployment.js';
import {
  decodeEvmFailure,
  extractRevertData,
  formatDecodedEvmFailure,
} from '../src/drivers/evm-decode.js';
import { decodeCancelReason } from '../src/scenarios/xt-mkt-runner.js';

function withSelector(selector: Hex, parameters: Hex): Hex {
  return `${selector}${parameters.slice(2)}` as Hex;
}

const errorStringData = withSelector(
  '0x08c379a0',
  encodeAbiParameters([{ type: 'string' }], ['订单参数无效']),
);
const errorString = decodeEvmFailure(errorStringData);
assert.equal(errorString?.kind, 'reason');
assert.equal(errorString?.name, 'Error');
assert.equal(errorString?.reason, '订单参数无效');
assert.match(formatDecodedEvmFailure(errorString!), /订单参数无效/);

const panicData = withSelector(
  '0x4e487b71',
  encodeAbiParameters([{ type: 'uint256' }], [0x11n]),
);
const panic = decodeEvmFailure(panicData);
assert.equal(panic?.kind, 'panic');
assert.equal(panic?.panicCode, '0x11');
assert.match(formatDecodedEvmFailure(panic!), /上溢或下溢/);

const manifest = await loadDeploymentManifest('config/deployments/tx-fork-v0.3.2-260902.json');
const fxErrorsAbi = await loadDeploymentAbi(manifest, 'FxErrors');
const customData = encodeErrorResult({
  abi: fxErrorsAbi,
  errorName: 'OrderNotFulfillableAtAcceptablePrice',
  args: [60_081_003_785_995_202n, 60_081_003_785_985_189n],
});
const custom = decodeEvmFailure(customData, fxErrorsAbi);
assert.equal(custom?.kind, 'custom');
assert.equal(custom?.name, 'OrderNotFulfillableAtAcceptablePrice');
assert.equal(custom?.signature, 'OrderNotFulfillableAtAcceptablePrice(uint256,uint256)');
assert.deepEqual(custom?.args?.map((argument) => argument.value), [
  '60081003785995202',
  '60081003785985189',
]);
assert.doesNotThrow(() => JSON.stringify(custom));

const liquidatableData = encodeErrorResult({
  abi: fxErrorsAbi,
  errorName: 'LiquidatablePosition',
  args: ['MIN_LEVERAGE', -1n, 5_000_000_000_000_000_000_000_000_000_000n, 6_000_000_000_000_000_000_000_000_000_000n],
});
assert.deepEqual(decodeCancelReason(liquidatableData, 'position is liquidatable'), {
  selector: liquidatableData.slice(0, 10),
  errorName: 'LiquidatablePosition',
  leverageGate: true,
  reasonString: 'position is liquidatable',
  arguments: {
    reason: 'MIN_LEVERAGE',
    remainingCollateralUsd: '-1',
    minCollateralUsd: '5000000000000000000000000000000',
    minCollateralUsdForLeverage: '6000000000000000000000000000000',
  },
});

const viemRevert = new ContractFunctionRevertedError({
  abi: fxErrorsAbi,
  data: customData,
  functionName: 'executeOrder',
});
const outerViemError = new BaseError('外层调用失败', { cause: viemRevert });
assert.equal(extractRevertData(outerViemError), customData);
assert.equal(decodeEvmFailure(outerViemError, fxErrorsAbi)?.name, 'OrderNotFulfillableAtAcceptablePrice');

const nestedRpcError = { info: { error: { data: { data: customData } } } };
assert.equal(extractRevertData(nestedRpcError), customData);
assert.equal(decodeEvmFailure(nestedRpcError, fxErrorsAbi)?.name, 'OrderNotFulfillableAtAcceptablePrice');

const unknownData = '0x12345678deadbeef' as Hex;
const unknown = decodeEvmFailure(unknownData, fxErrorsAbi);
assert.equal(unknown?.kind, 'unknown');
assert.equal(unknown?.selector, '0x12345678');
assert.equal(unknown?.name, undefined);
assert.match(formatDecodedEvmFailure(unknown!), /未知错误/);

assert.equal(extractRevertData({ data: '0x1234' }), undefined, '不足 4-byte selector 的短数据不应被当作 revert');

console.log('EVM revert decoder verification passed: Error(string), Panic, FxErrors, unknown selector, nested data.');

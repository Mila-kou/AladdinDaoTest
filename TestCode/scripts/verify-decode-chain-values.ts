import assert from 'node:assert/strict';

import {
  collectPositionKeyContexts,
  derivePositionKey,
} from '../src/reporting/decode-chain-values.js';

const ACCOUNT = '0x2fd6F79c404B17d68FDc111f8EF8C93891682624';
const EXPECTED_POSITION_KEY = '0x5b5970ba1babb540320fd2d9bd20fad63f0e3c0fd38e99382f1f9d6df411afd1';

const calculatedKey = derivePositionKey(ACCOUNT, 4n, true);
assert.equal(
  calculatedKey,
  EXPECTED_POSITION_KEY,
  'Position key 必须等于 keccak256(abi.encode(account, marketIndex, isLong)) 的已知链上结果',
);

const matchingEvidence = {
  actions: [{
    actionId: 'TX2',
    events: [{
      name: 'PositionIncrease',
      args: {
        eventName: 'PositionIncrease',
        address: { account: ACCOUNT.toLowerCase() },
        uint: { marketIndex: '4' },
        bool: { isLong: true },
        bytes32: {
          orderKey: '0x341be51138b31b31a743b1e33cedb621c4a0d1ec4bff4323c104e45124bedd70',
          positionKey: EXPECTED_POSITION_KEY,
        },
      },
    }],
  }],
};

assert.deepEqual(
  collectPositionKeyContexts(matchingEvidence),
  [{
    key: EXPECTED_POSITION_KEY,
    account: ACCOUNT,
    marketIndex: '4',
    isLong: true,
    source: '事件 PositionIncrease',
    verified: true,
  }],
  '同时包含 key 与正确构成字段的事件证据应被精确解析并标记为已验证',
);

const mismatchingEvidence = {
  positionKey: EXPECTED_POSITION_KEY,
  eventName: 'PositionIncrease',
  address: { account: ACCOUNT },
  uint: { marketIndex: '4' },
  bool: { isLong: false },
};

assert.deepEqual(
  collectPositionKeyContexts(mismatchingEvidence),
  [],
  '方向、市场或账户不匹配的候选不得被标记为已解析',
);

console.log('decode-chain-values verification passed: known key matched; mismatched candidate rejected.');

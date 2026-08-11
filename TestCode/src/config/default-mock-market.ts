import {
  concatHex,
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  stringToHex,
  type Hex,
} from 'viem';

import {
  defaultMockMarketProfile,
  type DefaultMockMarketParameter,
} from '../../config/markets/default-mock.js';

function stringKey(name: string, encoding: 'abi-string' | 'packed-string' = 'abi-string'): Hex {
  return encoding === 'packed-string'
    ? keccak256(stringToHex(name))
    : keccak256(encodeAbiParameters(parseAbiParameters('string'), [name]));
}

function parameterData(parameter: DefaultMockMarketParameter, marketIndex: bigint): Hex {
  const abi = parameter.arguments.map((argument) => {
    if (argument.type === 'marketIndex') return { type: 'uint256' } as const;
    if (argument.type === 'bool') return { type: 'bool' } as const;
    return { type: 'bytes32' } as const;
  });
  const values = parameter.arguments.map((argument) => {
    if (argument.type === 'marketIndex') return marketIndex;
    if (argument.type === 'bool') return argument.value;
    return stringKey(argument.value);
  });
  return encodeAbiParameters(abi, values);
}

export function defaultMockParameterKey(
  parameter: DefaultMockMarketParameter,
  marketIndex: bigint,
): Hex {
  const baseKey = stringKey(parameter.baseKey, parameter.baseKeyEncoding);
  return keccak256(concatHex([baseKey, parameterData(parameter, marketIndex)]));
}

export function defaultMockParameterLabel(parameter: DefaultMockMarketParameter): string {
  const dimensions = parameter.arguments
    .filter((argument) => argument.type !== 'marketIndex')
    .map((argument) => argument.type === 'bool' ? String(argument.value) : argument.value);
  return dimensions.length > 0
    ? `${parameter.baseKey}(${dimensions.join(',')})`
    : parameter.baseKey;
}

export function defaultMockPriceFeedMultiplier(): bigint {
  const exponent = 60
    - defaultMockMarketProfile.oracle.decimals
    - defaultMockMarketProfile.token.decimals;
  if (exponent < 0) throw new Error(`default-mock PriceFeed multiplier 指数非法：${exponent}`);
  return 10n ** BigInt(exponent);
}

export { defaultMockMarketProfile };

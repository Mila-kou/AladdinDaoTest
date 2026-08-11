import {
  createPublicClient,
  encodeAbiParameters,
  getAddress,
  http,
  keccak256,
  parseAbi,
  parseAbiParameters,
  type Hex,
} from 'viem';

import {
  defaultMockMarketProfile,
  defaultMockParameterKey,
  defaultMockParameterLabel,
} from '../config/default-mock-market.js';

const dataStoreAbi = parseAbi([
  'function getUint(bytes32) view returns (uint256)',
  'function getInt(bytes32) view returns (int256)',
  'function getBytes32(bytes32) view returns (bytes32)',
]);

function abiStringKey(name: string): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters('string'), [name]));
}

function uintDimensionKey(baseKey: Hex, value: bigint): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters('bytes32,uint256'), [baseKey, value]));
}

function signedWord(value: bigint, bits: bigint): bigint {
  const sign = 1n << (bits - 1n);
  const modulus = 1n << bits;
  return value & sign ? value - modulus : value;
}

function decodeFundingEma(value: Hex) {
  const word = BigInt(value);
  const mask40 = (1n << 40n) - 1n;
  const mask24 = (1n << 24n) - 1n;
  const mask96 = (1n << 96n) - 1n;
  return {
    raw: value,
    lastTime: word & mask40,
    sampleInterval: (word >> 40n) & mask24,
    lastValue: signedWord((word >> 64n) & mask96, 96n),
    lastEmaValue: signedWord((word >> 160n) & mask96, 96n),
  };
}

export interface ChainParameterValue {
  readonly key: Hex;
  readonly valueType: 'uint' | 'int';
  readonly value: bigint;
}

export interface TradeParameterSnapshot {
  readonly source: 'chain-at-block';
  readonly blockNumber: number;
  readonly blockTimestamp: bigint;
  readonly marketIndex: number;
  readonly dataStore: string;
  readonly account: string;
  readonly market: Record<string, ChainParameterValue>;
  readonly global: {
    readonly positionFeeReceiverFactor: ChainParameterValue;
    readonly maxPriceImpactSpread: ChainParameterValue;
  };
  readonly fundingEma: ReturnType<typeof decodeFundingEma>;
  readonly grace: {
    readonly source: 'chain-at-block';
    readonly blockNumber: number;
    readonly marketIndex: number;
    readonly account: string;
    readonly referralTier: bigint;
    readonly graceBaseSeconds: bigint;
    readonly tierMultiplier: bigint;
    readonly effectiveGraceSeconds: bigint;
    readonly dataStore: string;
    readonly referralStorage: string;
  };
}

export async function readTradeParameterSnapshot(input: {
  readonly rpcUrl: string;
  readonly timeoutMs: number;
  readonly dataStore: string;
  readonly referralStorage: string;
  readonly marketIndex: number;
  readonly account: string;
  readonly blockNumber: number;
}): Promise<TradeParameterSnapshot> {
  const client = createPublicClient({ transport: http(input.rpcUrl, { timeout: input.timeoutMs }) });
  const dataStore = getAddress(input.dataStore);
  const referralStorage = getAddress(input.referralStorage);
  const account = getAddress(input.account);
  const blockNumber = BigInt(input.blockNumber);

  const marketEntries = await Promise.all(defaultMockMarketProfile.parameters.map(async (parameter) => {
    const key = defaultMockParameterKey(parameter, BigInt(input.marketIndex));
    const value = await client.readContract({
      address: dataStore,
      abi: dataStoreAbi,
      functionName: parameter.valueType === 'int' ? 'getInt' : 'getUint',
      args: [key],
      blockNumber,
    });
    return [defaultMockParameterLabel(parameter), {
      key,
      valueType: parameter.valueType,
      value,
    }] as const;
  }));
  const market = Object.fromEntries(marketEntries);

  const positionFeeReceiverFactorKey = abiStringKey('POSITION_FEE_RECEIVER_FACTOR');
  const maxPriceImpactSpreadKey = abiStringKey('MAX_PRICE_IMPACT_SPREAD');
  const fundingEmaKey = uintDimensionKey(abiStringKey('FUNDING_SKEW_EMA'), BigInt(input.marketIndex));
  const [positionFeeReceiverFactor, maxPriceImpactSpread, fundingEmaRaw, referralTier, block] = await Promise.all([
    client.readContract({ address: dataStore, abi: dataStoreAbi, functionName: 'getUint', args: [positionFeeReceiverFactorKey], blockNumber }),
    client.readContract({ address: dataStore, abi: dataStoreAbi, functionName: 'getUint', args: [maxPriceImpactSpreadKey], blockNumber }),
    client.readContract({ address: dataStore, abi: dataStoreAbi, functionName: 'getBytes32', args: [fundingEmaKey], blockNumber }),
    client.readContract({
      address: referralStorage,
      abi: parseAbi(['function referrerTiers(address) view returns (uint256)']),
      functionName: 'referrerTiers',
      args: [account],
      blockNumber,
    }),
    client.getBlock({ blockNumber }),
  ]);
  const graceBaseSeconds = market.LIQUIDATION_GRACE_PERIOD_BASE?.value ?? 0n;
  const tierMultiplierKey = uintDimensionKey(
    keccak256(new TextEncoder().encode('LIQUIDATION_GRACE_PERIOD_TIER_MULTIPLIER')),
    referralTier,
  );
  const tierMultiplier = await client.readContract({
    address: dataStore,
    abi: dataStoreAbi,
    functionName: 'getUint',
    args: [tierMultiplierKey],
    blockNumber,
  });

  return {
    source: 'chain-at-block',
    blockNumber: input.blockNumber,
    blockTimestamp: block.timestamp,
    marketIndex: input.marketIndex,
    dataStore,
    account,
    market,
    global: {
      positionFeeReceiverFactor: { key: positionFeeReceiverFactorKey, valueType: 'uint', value: positionFeeReceiverFactor },
      maxPriceImpactSpread: { key: maxPriceImpactSpreadKey, valueType: 'uint', value: maxPriceImpactSpread },
    },
    fundingEma: decodeFundingEma(fundingEmaRaw),
    grace: {
      source: 'chain-at-block',
      blockNumber: input.blockNumber,
      marketIndex: input.marketIndex,
      account,
      referralTier,
      graceBaseSeconds,
      tierMultiplier,
      effectiveGraceSeconds: graceBaseSeconds * tierMultiplier / 10n ** 18n,
      dataStore,
      referralStorage,
    },
  };
}


import { createPublicClient, encodeAbiParameters, encodeFunctionData, getAddress, http, keccak256, parseAbi, parseAbiParameters } from 'viem';

// MockChainlinkOracle（fx100-contracts src/periphery/MockAssetContracts.sol）驱动。
// setMockPrice(price, timestamp) 是 external 无权限控制；写入走 admin RPC 的
// eth_sendTransaction（Tenderly 免签名），from 任意已配置地址即可。
const mockOracleAbi = parseAbi([
  'function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)',
  'function decimals() view returns (uint8)',
  'function description() view returns (string)',
  'function setMockPrice(uint256 price, uint256 timestamp)',
]);

export interface MockOracleState {
  readonly address: `0x${string}`;
  readonly description: string;
  readonly decimals: number;
  /** 原始 answer（decimals 位小数的定点整数） */
  readonly answer: bigint;
  /** Oracle 内记录的价格时间戳 */
  readonly updatedAt: bigint;
  readonly latestBlockNumber: bigint;
  readonly latestBlockTimestamp: bigint;
  /** 相对链上最新区块的时间差；fork 新区块使用真实时钟，隔天必然过期 */
  readonly ageSeconds: bigint;
}

export async function readMockOracleState(
  rpcUrl: string,
  oracleAddress: string,
  timeoutMs = 15_000,
): Promise<MockOracleState> {
  const client = createPublicClient({ transport: http(rpcUrl, { timeout: timeoutMs }) });
  const address = getAddress(oracleAddress);
  const [block, roundData, decimals, description] = await Promise.all([
    client.getBlock(),
    client.readContract({ address, abi: mockOracleAbi, functionName: 'latestRoundData' }),
    client.readContract({ address, abi: mockOracleAbi, functionName: 'decimals' }),
    client.readContract({ address, abi: mockOracleAbi, functionName: 'description' }),
  ]);
  const [, answer, , updatedAt] = roundData;
  return {
    address,
    description,
    decimals,
    answer,
    updatedAt,
    latestBlockNumber: block.number,
    latestBlockTimestamp: block.timestamp,
    ageSeconds: block.timestamp - updatedAt,
  };
}

async function rpcRequest(rpcUrl: string, method: string, params: unknown[], timeoutMs: number): Promise<unknown> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`RPC 返回 HTTP ${response.status}`);
  const payload = await response.json() as { result?: unknown; error?: { message?: unknown } };
  if (payload.error) throw new Error(`${method} 失败: ${String(payload.error.message ?? 'unknown')}`);
  return payload.result;
}

export interface SetMockPriceReceipt {
  readonly txHash: string;
  readonly blockNumber: number;
  readonly status: 'success' | 'reverted';
}

/**
 * 设置 Mock Oracle 价格与时间戳（admin RPC 免签名交易）。
 * timestamp 取 max(本机当前时间, 链上最新区块时间)：fork 新区块用真实时钟，
 * 但 time-fork 推进过时间后链上时间可能领先本机，取 max 保证价格永远"新鲜"。
 */
export async function sendSetMockPrice(input: {
  readonly adminRpcUrl: string;
  readonly from: string;
  readonly oracle: string;
  readonly priceRaw: bigint;
  readonly timestamp: bigint;
  readonly timeoutMs?: number;
}): Promise<SetMockPriceReceipt> {
  const timeoutMs = input.timeoutMs ?? 30_000;
  const data = encodeFunctionData({
    abi: mockOracleAbi,
    functionName: 'setMockPrice',
    args: [input.priceRaw, input.timestamp],
  });
  const txHash = await rpcRequest(input.adminRpcUrl, 'eth_sendTransaction', [{
    from: input.from,
    to: getAddress(input.oracle),
    data,
  }], timeoutMs);
  if (typeof txHash !== 'string') throw new Error('eth_sendTransaction 未返回交易哈希');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const receipt = await rpcRequest(input.adminRpcUrl, 'eth_getTransactionReceipt', [txHash], timeoutMs) as
      | { status?: string; blockNumber?: string }
      | null;
    if (receipt?.blockNumber) {
      return {
        txHash,
        blockNumber: Number(BigInt(receipt.blockNumber)),
        status: receipt.status === '0x1' ? 'success' : 'reverted',
      };
    }
    await new Promise((resolveWait) => { setTimeout(resolveWait, 500); });
  }
  throw new Error(`setMockPrice 交易 ${txHash} 在 ${timeoutMs}ms 内未上链`);
}

/** 价格新鲜时间戳：max(本机时钟, 链上最新区块时间)。 */
export function freshOracleTimestamp(latestBlockTimestamp: bigint): bigint {
  const now = BigInt(Math.floor(Date.now() / 1000));
  return now > latestBlockTimestamp ? now : latestBlockTimestamp;
}

// —— STABLE_PRICE 锚（traps §11：大幅改价三件套 feed+时间戳+STABLE_PRICE，缺一则 min/max 撑开）——

const dataStoreUintAbi = parseAbi([
  'function getUint(bytes32) view returns (uint256)',
  'function setUint(bytes32 key, uint256 value)',
]);

export function stablePriceKey(token: string): `0x${string}` {
  const base = keccak256(encodeAbiParameters(parseAbiParameters('string'), ['STABLE_PRICE']));
  return keccak256(encodeAbiParameters(parseAbiParameters('bytes32, address'), [base, getAddress(token)]));
}

export async function readStablePrice(
  rpcUrl: string,
  dataStore: string,
  token: string,
  timeoutMs = 15_000,
): Promise<bigint> {
  const client = createPublicClient({ transport: http(rpcUrl, { timeout: timeoutMs }) });
  return client.readContract({
    address: getAddress(dataStore),
    abi: dataStoreUintAbi,
    functionName: 'getUint',
    args: [stablePriceKey(token)],
  });
}

export function encodeDataStoreSetUint(key: `0x${string}`, value: bigint): `0x${string}` {
  return encodeFunctionData({ abi: dataStoreUintAbi, functionName: 'setUint', args: [key, value] });
}

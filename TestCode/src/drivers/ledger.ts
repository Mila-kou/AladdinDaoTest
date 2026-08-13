import {
  createPublicClient,
  encodeAbiParameters,
  getAddress,
  http,
  keccak256,
  parseAbi,
  parseAbiParameters,
} from 'viem';

// 账本快照 / Delta / L1 五方守恒 —— tools/fx100-legacy/tool/onchain-tx/lib/ledger.mjs 的 typed 移植。
// 槽位、key 口径、输出形状与 legacy 逐一对齐（含 2026-08-13 移除 positionImpactPoolAmount）；
// 等价性由 scripts/verify-ledger-driver.ts 在同一区块与 legacy 快照逐槽比对。
// 铁律：读不到就是读不到，绝不当 0（errors 数组承载缺读数）；缺读数守恒判 UNVERIFIABLE。

export const CONSERVATION_SLOTS = [
  'traderUsdc',
  'orderVaultUsdc',
  'posVaultUsdc',
  'lpVaultAssets',
  'feeReceiverUsdc',
] as const;

export interface LedgerPosition {
  readonly account: string;
  readonly marketIndex: bigint;
  readonly sizeInUsd: bigint;
  readonly sizeInTokens: bigint;
  readonly collateralAmount: bigint;
  readonly negativeFundingFeePerSize: bigint;
  readonly positiveFundingFeePerSize: bigint;
  readonly increasedAtTime: bigint;
  readonly decreasedAtTime: bigint;
  readonly graceStart: bigint;
  readonly graceEnd: bigint;
  readonly isLong: boolean;
  readonly exists: boolean;
}

export interface LedgerSnapshot {
  readonly blockNumber: number;
  readonly posKey: `0x${string}`;
  readonly values: Record<string, unknown> & {
    traderUsdc?: bigint | null;
    position?: LedgerPosition | null;
  };
  readonly errors: string[];
}

export interface LedgerAddresses {
  readonly usdc: string;
  readonly dataStore: string;
  readonly orderVault: string;
  readonly positionVault: string;
  readonly feeHandler: string;
  readonly lpVault: string;
  readonly reader: string;
}

// key 口径：keccak256(abi.encode(...))（FX100Keys.sol 主流派生；裸串键不在本模块范围）
function base(name: string): `0x${string}` {
  return keccak256(encodeAbiParameters(parseAbiParameters('string'), [name]));
}

export const LEDGER_BASE = {
  CUMULATIVE_OPEN_COSTS: base('CUMULATIVE_OPEN_COSTS'),
  OPEN_INTEREST_IN_TOKENS: base('OPEN_INTEREST_IN_TOKENS'),
  CLAIMABLE_FEE_AMOUNT: base('CLAIMABLE_FEE_AMOUNT'),
  POSITION_FEE_TYPE: base('POSITION_FEE_TYPE'),
  FUNDING_FEE_TYPE: base('FUNDING_FEE_TYPE'),
  LIQUIDATION_FEE_TYPE: base('LIQUIDATION_FEE_TYPE'),
} as const;

export function cumulativeOpenCostsKey(marketIndex: bigint, isLong: boolean): `0x${string}` {
  return keccak256(encodeAbiParameters(
    parseAbiParameters('bytes32, uint256, bool'),
    [LEDGER_BASE.CUMULATIVE_OPEN_COSTS, marketIndex, isLong],
  ));
}

export function openInterestInTokensKey(marketIndex: bigint, isLong: boolean): `0x${string}` {
  return keccak256(encodeAbiParameters(
    parseAbiParameters('bytes32, uint256, bool'),
    [LEDGER_BASE.OPEN_INTEREST_IN_TOKENS, marketIndex, isLong],
  ));
}

export function claimableFeeAmountKey(marketIndex: bigint, token: string, feeType: `0x${string}`): `0x${string}` {
  return keccak256(encodeAbiParameters(
    parseAbiParameters('bytes32, uint256, address, bytes32'),
    [LEDGER_BASE.CLAIMABLE_FEE_AMOUNT, marketIndex, getAddress(token), feeType],
  ));
}

/** Position key 无 base 前缀：keccak256(abi.encode(account, marketIndex, isLong)) */
export function positionKey(account: string, marketIndex: bigint, isLong: boolean): `0x${string}` {
  return keccak256(encodeAbiParameters(
    parseAbiParameters('address, uint256, bool'),
    [getAddress(account), marketIndex, isLong],
  ));
}

const erc20Abi = parseAbi(['function balanceOf(address) view returns (uint256)']);
const vaultAbi = parseAbi(['function totalAssets() view returns (uint256)']);
const dataStoreAbi = parseAbi(['function getUint(bytes32) view returns (uint256)']);
const readerAbi = parseAbi([
  'function getPosition(address dataStore, bytes32 key) view returns ((address account, uint256 marketIndex, uint256 sizeInUsd, uint256 sizeInTokens, uint256 collateralAmount, uint256 negativeFundingFeePerSize, uint256 positiveFundingFeePerSize, uint256 increasedAtTime, uint256 decreasedAtTime, uint256 graceStart, uint256 graceEnd, bool isLong))',
]);

export interface LedgerContext {
  readonly trader: string;
  readonly marketIndex: bigint;
  readonly isLong: boolean;
}

export async function takeLedgerSnapshot(input: {
  readonly rpcUrl: string;
  readonly addresses: LedgerAddresses;
  readonly context: LedgerContext;
  readonly blockNumber: number;
  readonly timeoutMs?: number;
}): Promise<LedgerSnapshot> {
  const client = createPublicClient({ transport: http(input.rpcUrl, { timeout: input.timeoutMs ?? 30_000 }) });
  const a = input.addresses;
  const mi = input.context.marketIndex;
  const usdc = getAddress(a.usdc);
  const dataStore = getAddress(a.dataStore);
  const posKey = positionKey(input.context.trader, mi, input.context.isLong);
  const getUint = (key: `0x${string}`) =>
    ({ address: dataStore, abi: dataStoreAbi, functionName: 'getUint', args: [key] }) as const;

  const plan = [
    ['traderUsdc', { address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [getAddress(input.context.trader)] }],
    ['orderVaultUsdc', { address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [getAddress(a.orderVault)] }],
    ['posVaultUsdc', { address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [getAddress(a.positionVault)] }],
    ['feeReceiverUsdc', { address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [getAddress(a.feeHandler)] }],
    ['lpVaultAssets', { address: getAddress(a.lpVault), abi: vaultAbi, functionName: 'totalAssets', args: [] }],
    ['cumulativeOpenCostsLong', getUint(cumulativeOpenCostsKey(mi, true))],
    ['cumulativeOpenCostsShort', getUint(cumulativeOpenCostsKey(mi, false))],
    ['openInterestInTokensLong', getUint(openInterestInTokensKey(mi, true))],
    ['openInterestInTokensShort', getUint(openInterestInTokensKey(mi, false))],
    ['claimableFeeAmountPosition', getUint(claimableFeeAmountKey(mi, usdc, LEDGER_BASE.POSITION_FEE_TYPE))],
    ['claimableFeeAmountFunding', getUint(claimableFeeAmountKey(mi, usdc, LEDGER_BASE.FUNDING_FEE_TYPE))],
    ['claimableFeeAmountLiquidation', getUint(claimableFeeAmountKey(mi, usdc, LEDGER_BASE.LIQUIDATION_FEE_TYPE))],
    ['position', { address: getAddress(a.reader), abi: readerAbi, functionName: 'getPosition', args: [dataStore, posKey] }],
  ] as const;

  const results = await client.multicall({
    contracts: plan.map(([, call]) => call) as never,
    blockNumber: BigInt(input.blockNumber),
    allowFailure: true,
    // 与 legacy readMany 同款 Multicall3 canonical 地址（Base Sepolia 与 Tenderly fork 通用）
    multicallAddress: '0xcA11bde05977b3631167028862bE2a173976CA11',
  }) as Array<{ status: 'success' | 'failure'; error?: Error; result?: unknown }>;

  const values: LedgerSnapshot['values'] = {};
  const errors: string[] = [];
  plan.forEach(([name], index) => {
    const result = results[index]!;
    if (result.status !== 'success') {
      // 读不到就是读不到——绝不当作 0
      errors.push(`${name}: ${result.error?.message ?? '无返回'}`);
      values[name] = null;
      return;
    }
    if (name === 'position') {
      const raw = result.result as {
        account: string; marketIndex: bigint; sizeInUsd: bigint; sizeInTokens: bigint;
        collateralAmount: bigint; negativeFundingFeePerSize: bigint; positiveFundingFeePerSize: bigint;
        increasedAtTime: bigint; decreasedAtTime: bigint; graceStart: bigint; graceEnd: bigint; isLong: boolean;
      };
      values.position = {
        ...raw,
        account: raw.account.toLowerCase(),
        exists: raw.account !== '0x0000000000000000000000000000000000000000',
      };
      return;
    }
    values[name] = result.result as bigint;
  });

  return { blockNumber: input.blockNumber, posKey, values, errors };
}

// 结构性最小签名：兼容 runner 侧本地 Snapshot 接口（只要求 values 槽位表）。
export function ledgerDiff(
  before: { readonly values: Record<string, unknown> },
  after: { readonly values: Record<string, unknown> },
): Record<string, bigint | null> {
  const deltas: Record<string, bigint | null> = {};
  for (const key of Object.keys(before.values)) {
    const b = before.values[key];
    const a = after.values[key];
    deltas[key] = typeof b === 'bigint' && typeof a === 'bigint' ? a - b : null;
  }
  return deltas;
}

export function checkLedgerConservation(deltas: Record<string, bigint | null>): {
  status: 'PASS' | 'FAIL' | 'UNVERIFIABLE';
  sum: bigint | null;
  missing: string[];
  terms: Record<string, bigint>;
} {
  const missing = CONSERVATION_SLOTS.filter((slot) => typeof deltas[slot] !== 'bigint');
  if (missing.length > 0) return { status: 'UNVERIFIABLE', sum: null, missing: [...missing], terms: {} };
  const terms = Object.fromEntries(CONSERVATION_SLOTS.map((slot) => [slot, deltas[slot] as bigint]));
  const sum = CONSERVATION_SLOTS.reduce((total, slot) => total + (deltas[slot] as bigint), 0n);
  return { status: sum === 0n ? 'PASS' : 'FAIL', sum, missing: [], terms };
}

import {
  encodeAbiParameters,
  getAddress,
  keccak256,
  parseAbiParameters,
  type Address,
  type Hex,
} from 'viem';

const POSITION_KEY_PARAMETERS = parseAbiParameters('address, uint256, bool');
const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export interface PositionKeyContext {
  /** 合约保存及事件返回的 bytes32 Position key。 */
  readonly key: Hex;
  /** 参与 positionKey 计算的账户。 */
  readonly account: Address;
  /** 参与 positionKey 计算的 Market index。 */
  readonly marketIndex: string;
  /** 参与 positionKey 计算的方向。 */
  readonly isLong: boolean;
  /** 找到构成字段的持久化证据位置。 */
  readonly source: string;
  /** 只有重新计算结果与 key 完全一致时才会输出该记录。 */
  readonly verified: true;
}

interface PositionKeyCandidate {
  readonly account: Address;
  readonly marketIndex: bigint;
  readonly isLong: boolean;
  readonly source: string;
  readonly priority: number;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function bytes32(value: unknown): Hex | undefined {
  return typeof value === 'string' && BYTES32_PATTERN.test(value)
    ? value.toLowerCase() as Hex
    : undefined;
}

function address(value: unknown): Address | undefined {
  if (typeof value !== 'string') return undefined;
  try { return getAddress(value); } catch { return undefined; }
}

function integer(value: unknown): bigint | undefined {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') return undefined;
  try {
    const parsed = BigInt(value);
    return parsed >= 0n ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function derivePositionKey(accountValue: Address, marketIndex: bigint, isLong: boolean): Hex {
  return keccak256(encodeAbiParameters(
    POSITION_KEY_PARAMETERS,
    [getAddress(accountValue), marketIndex, isLong],
  ));
}

function candidateFrom(container: Record<string, unknown>, path: string): PositionKeyCandidate | undefined {
  const addressValues = record(container.address);
  const uintValues = record(container.uint);
  const boolValues = record(container.bool);
  const account = address(
    addressValues?.account
      ?? addressValues?.trader
      ?? container.account
      ?? container.trader,
  );
  const marketIndex = integer(uintValues?.marketIndex ?? container.marketIndex);
  const side = typeof container.side === 'string' ? container.side.toLowerCase() : '';
  const isLong = typeof boolValues?.isLong === 'boolean'
    ? boolValues.isLong
    : typeof container.isLong === 'boolean'
      ? container.isLong
      : side === 'long'
        ? true
        : side === 'short'
          ? false
          : undefined;
  if (!account || marketIndex === undefined || isLong === undefined) return undefined;
  const eventName = typeof container.eventName === 'string' ? container.eventName : '';
  const snapshotName = typeof container.name === 'string' ? container.name : '';
  const source = eventName
    ? `事件 ${eventName}`
    : snapshotName
      ? `快照 ${snapshotName}`
      : path || '执行证据';
  return {
    account,
    marketIndex,
    isLong,
    source,
    priority: eventName ? 3 : /snapshot|before|after/i.test(path) ? 2 : 1,
  };
}

/**
 * Position key 是 Keccak-256，不可逆。本函数只做“证据反向关联”：
 * 收集事件、快照及用例上下文中的已知构成字段，重新计算 key；只有精确匹配才返回。
 */
export function collectPositionKeyContexts(input: unknown): PositionKeyContext[] {
  const keys = new Set<Hex>();
  const candidates: PositionKeyCandidate[] = [];

  function walk(value: unknown, path: string): void {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    const item = record(value);
    if (!item) return;

    const directCandidate = candidateFrom(item, path);
    if (directCandidate) candidates.push(directCandidate);
    const args = record(item.args);
    const argsCandidate = args ? candidateFrom(args, `${path}.args`) : undefined;
    if (argsCandidate) candidates.push(argsCandidate);

    for (const [name, child] of Object.entries(item)) {
      if (/^(?:positionKey|posKey)$/i.test(name)) {
        const key = bytes32(child);
        if (key) keys.add(key);
      }
      walk(child, path ? `${path}.${name}` : name);
    }
  }

  walk(input, 'evidence');
  const candidateByInput = new Map<string, PositionKeyCandidate>();
  for (const item of candidates) {
    const id = `${item.account.toLowerCase()}:${item.marketIndex}:${item.isLong}`;
    const current = candidateByInput.get(id);
    if (!current || item.priority > current.priority) candidateByInput.set(id, item);
  }
  const uniqueCandidates = Array.from(candidateByInput.values()).sort((a, b) => b.priority - a.priority);

  return Array.from(keys).flatMap((key) => {
    const match = uniqueCandidates.find((item) => derivePositionKey(item.account, item.marketIndex, item.isLong).toLowerCase() === key);
    return match ? [{
      key,
      account: match.account,
      marketIndex: match.marketIndex.toString(),
      isLong: match.isLong,
      source: match.source,
      verified: true as const,
    }] : [];
  });
}

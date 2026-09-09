import {
  BaseError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  type Abi,
  type AbiParameter,
  type Hex,
} from 'viem';

export type JsonSafeValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonSafeValue[]
  | { readonly [key: string]: JsonSafeValue };

export interface DecodedEvmArgument {
  readonly name: string;
  readonly type: string;
  readonly value: JsonSafeValue;
}

/**
 * 可持久化的 EVM revert 结构。unknown 只保留实际 selector / rawData，绝不按
 * selector 猜错误名；调用方可以稍后换更完整的 ABI 重新解码。
 */
export interface DecodedEvmFailure {
  readonly kind: 'custom' | 'reason' | 'panic' | 'unknown';
  readonly selector: Hex;
  readonly rawData: Hex;
  readonly name?: string;
  readonly signature?: string;
  readonly args?: readonly DecodedEvmArgument[];
  readonly reason?: string;
  readonly panicCode?: Hex;
}

const PANIC_REASONS: Readonly<Record<string, string>> = {
  '0x01': 'assert 条件失败',
  '0x11': '算术上溢或下溢',
  '0x12': '除以零或模零',
  '0x21': '转换为非法枚举值',
  '0x22': '存储中的 bytes 编码非法',
  '0x31': '对空数组执行 pop',
  '0x32': '数组或 bytes 下标越界',
  '0x41': '内存分配过大',
  '0x51': '调用未初始化的内部函数',
};

/** 至少包含 4-byte selector，且必须是偶数字节的十六进制数据。 */
function isRevertData(value: unknown): value is Hex {
  return typeof value === 'string'
    && /^0x(?:[0-9a-fA-F]{2}){4,}$/.test(value);
}

function extractFromRecord(value: unknown, seen: Set<object>, depth: number): Hex | undefined {
  if (!value || typeof value !== 'object' || depth > 12 || seen.has(value)) return undefined;
  seen.add(value);

  if (value instanceof BaseError) {
    const reverted = value.walk((item) => item instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError && isRevertData(reverted.raw)) return reverted.raw;
  }
  if (value instanceof ContractFunctionRevertedError && isRevertData(value.raw)) return value.raw;

  const record = value as Record<string, unknown>;
  // raw / revertData / return 是各 RPC 与 SDK 常见的“返回数据”字段；先于通用 data。
  for (const key of ['revertData', 'return', 'raw'] as const) {
    if (isRevertData(record[key])) return record[key];
  }

  const data = record.data;
  if (isRevertData(data)) return data;
  if (data && typeof data === 'object') {
    const nested = extractFromRecord(data, seen, depth + 1);
    if (nested) return nested;
  }

  // viem：cause；ethers v5：error / originalError；ethers v6：info.error。
  for (const key of ['cause', 'error', 'originalError', 'info'] as const) {
    const nested = extractFromRecord(record[key], seen, depth + 1);
    if (nested) return nested;
  }
  return undefined;
}

/**
 * 从 viem BaseError/ContractFunctionRevertedError、JSON-RPC 错误，以及 ethers v5/v6
 * 的常见嵌套形状中提取原始 revert data。不会扫描 message 中的任意 hex，避免把
 * 交易哈希或 calldata 误当成错误数据。
 */
export function extractRevertData(errorOrData: unknown): Hex | undefined {
  if (isRevertData(errorOrData)) return errorOrData;
  return extractFromRecord(errorOrData, new Set<object>(), 0);
}

function canonicalAbiType(parameter: AbiParameter): string {
  if (!parameter.type.startsWith('tuple')) return parameter.type;
  const components = 'components' in parameter
    ? (parameter.components as readonly AbiParameter[])
    : [];
  return `(${components.map(canonicalAbiType).join(',')})${parameter.type.slice('tuple'.length)}`;
}

function toJsonSafe(value: unknown): JsonSafeValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (value instanceof Uint8Array) {
    return `0x${Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, toJsonSafe(item)]),
    );
  }
  return String(value);
}

function panicCode(value: unknown): Hex | undefined {
  try {
    const code = typeof value === 'bigint' ? value : BigInt(String(value));
    return `0x${code.toString(16).padStart(2, '0')}` as Hex;
  } catch {
    return undefined;
  }
}

/**
 * 使用可选 ABI 解码错误。viem 会自动支持 Solidity Error(string) 与 Panic(uint256)；
 * ABI 未命中的 selector 返回 kind=unknown，不做 4byte/名称猜测。
 */
export function decodeEvmFailure(errorOrData: unknown, abi: Abi = []): DecodedEvmFailure | undefined {
  const rawData = extractRevertData(errorOrData);
  if (!rawData) return undefined;
  const selector = rawData.slice(0, 10).toLowerCase() as Hex;

  try {
    const decoded = decodeErrorResult({ abi, data: rawData });
    const inputs = decoded.abiItem.type === 'error' ? decoded.abiItem.inputs : [];
    const values = decoded.args ? Array.from(decoded.args) : [];
    const args = inputs.map((input, index): DecodedEvmArgument => ({
      name: input.name || `arg${index}`,
      type: canonicalAbiType(input),
      value: toJsonSafe(values[index]),
    }));
    const signature = `${decoded.errorName}(${inputs.map(canonicalAbiType).join(',')})`;

    if (decoded.errorName === 'Error') {
      const reason = typeof values[0] === 'string' ? values[0] : String(values[0] ?? '');
      return {
        kind: 'reason', selector, rawData, name: decoded.errorName, signature, args, reason,
      };
    }
    if (decoded.errorName === 'Panic') {
      const code = panicCode(values[0]);
      return {
        kind: 'panic', selector, rawData, name: decoded.errorName, signature, args,
        ...(code ? { panicCode: code, reason: PANIC_REASONS[code] ?? '未知 Panic 代码' } : {}),
      };
    }
    return {
      kind: 'custom', selector, rawData, name: decoded.errorName, signature,
      ...(args.length > 0 ? { args } : {}),
    };
  } catch {
    return { kind: 'unknown', selector, rawData };
  }
}

function formatJsonSafe(value: JsonSafeValue): string {
  if (typeof value === 'string') return value;
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

/** 面向测试报告的一行可读摘要；rawData 仍保留在结构体中，不塞入长错误消息。 */
export function formatDecodedEvmFailure(failure: DecodedEvmFailure): string {
  if (failure.kind === 'reason') return `合约回退：${failure.reason || '未提供原因'}`;
  if (failure.kind === 'panic') {
    return `Solidity Panic ${failure.panicCode ?? failure.selector}${failure.reason ? `（${failure.reason}）` : ''}`;
  }
  if (failure.kind === 'unknown') return `合约回退：未知错误 selector=${failure.selector}（当前 ABI 无匹配项）`;
  const argumentsText = failure.args?.map((argument) => `${argument.name}=${formatJsonSafe(argument.value)}`).join('，');
  return `合约自定义错误 ${failure.name ?? failure.selector}${argumentsText ? `（${argumentsText}）` : ''}`;
}

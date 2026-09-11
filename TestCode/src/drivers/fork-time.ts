import type { Hex } from '../evidence/evidence-v3.js';
import { adminRpcRequest } from './admin-rpc.js';

export interface ForkTimeBlock {
  readonly number: bigint;
  readonly hash: Hex;
  readonly timestamp: bigint;
}

export interface AdvanceForkTimeResult {
  readonly before: ForkTimeBlock;
  readonly after: ForkTimeBlock;
}

export interface AdvanceForkTimeInput {
  readonly adminRpcUrl: string;
  readonly seconds: number;
  readonly timeoutMs?: number;
}

interface RpcBlock {
  readonly number?: unknown;
  readonly hash?: unknown;
  readonly timestamp?: unknown;
}

function redactRpcUrls(message: string, configuredUrl: string): string {
  const withoutConfiguredUrl = configuredUrl
    ? message.split(configuredUrl).join('[redacted-rpc-url]')
    : message;
  return withoutConfiguredUrl.replace(/(?:https?|wss?):\/\/[^\s"'`]+/giu, '[redacted-rpc-url]');
}

async function request(
  input: AdvanceForkTimeInput,
  method: string,
  params: unknown[],
  timeoutMs: number,
): Promise<unknown> {
  try {
    return await adminRpcRequest(input.adminRpcUrl, method, params, timeoutMs);
  } catch (error) {
    const detail = redactRpcUrls(error instanceof Error ? error.message : String(error), input.adminRpcUrl);
    throw new Error(`Fork 时间控制 RPC ${method} 失败：${detail}`);
  }
}

function parseHexQuantity(value: unknown, field: string): bigint {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/iu.test(value)) {
    throw new Error(`Fork 时间控制 RPC 返回的 ${field} 非法`);
  }
  return BigInt(value);
}

function parseBlock(value: unknown, phase: 'before' | 'after'): ForkTimeBlock {
  if (!value || typeof value !== 'object') {
    throw new Error(`Fork 时间推进 ${phase} 区块缺失`);
  }
  const block = value as RpcBlock;
  if (typeof block.hash !== 'string' || !/^0x[0-9a-f]{64}$/iu.test(block.hash)) {
    throw new Error(`Fork 时间推进 ${phase} 区块 hash 非法`);
  }
  return {
    number: parseHexQuantity(block.number, `${phase}.number`),
    hash: block.hash as Hex,
    timestamp: parseHexQuantity(block.timestamp, `${phase}.timestamp`),
  };
}

async function latestBlock(
  input: AdvanceForkTimeInput,
  phase: 'before' | 'after',
  timeoutMs: number,
): Promise<ForkTimeBlock> {
  const raw = await request(input, 'eth_getBlockByNumber', ['latest', false], timeoutMs);
  return parseBlock(raw, phase);
}

/**
 * Advance a dedicated EVM fork clock and mine the block that makes the new
 * timestamp observable. No RPC endpoint identity is returned or embedded in
 * thrown errors.
 */
export async function advanceForkTime(input: AdvanceForkTimeInput): Promise<AdvanceForkTimeResult> {
  if (!input.adminRpcUrl.trim()) throw new Error('Fork 时间控制缺少 admin RPC');
  if (!Number.isSafeInteger(input.seconds) || input.seconds <= 0) {
    throw new Error('Fork 时间推进秒数必须为正安全整数');
  }

  const timeoutMs = input.timeoutMs ?? 30_000;
  const before = await latestBlock(input, 'before', timeoutMs);
  await request(input, 'evm_increaseTime', [input.seconds], timeoutMs);
  await request(input, 'evm_mine', [], timeoutMs);
  const after = await latestBlock(input, 'after', timeoutMs);

  if (after.number <= before.number) {
    throw new Error(`Fork 时间推进未产生新区块：${before.number.toString()} -> ${after.number.toString()}`);
  }
  const minimumTimestamp = before.timestamp + BigInt(input.seconds);
  if (after.timestamp < minimumTimestamp) {
    throw new Error(
      `Fork 时间推进不足：期望至少 ${minimumTimestamp.toString()}，实际 ${after.timestamp.toString()}`,
    );
  }

  return { before, after };
}

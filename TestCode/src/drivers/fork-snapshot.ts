import { adminRpcRequest } from './admin-rpc.js';

export interface ForkSnapshotOptions {
  readonly adminRpcUrl: string;
  readonly timeoutMs?: number;
}

function redactRpcDetails(message: string, rpcUrl: string): string {
  const withoutConfigured = rpcUrl
    ? message.split(rpcUrl).join('[redacted-rpc-url]')
    : message;
  return withoutConfigured.replace(/(?:https?|wss?):\/\/[^\s"'`]+/giu, '[redacted-rpc-url]');
}

async function snapshotRpc(
  options: ForkSnapshotOptions,
  method: 'evm_snapshot' | 'evm_revert',
  params: unknown[],
): Promise<unknown> {
  try {
    return await adminRpcRequest(
      options.adminRpcUrl,
      method,
      params,
      options.timeoutMs ?? 30_000,
    );
  } catch (error) {
    const detail = redactRpcDetails(error instanceof Error ? error.message : String(error), options.adminRpcUrl);
    throw new Error(`Fork 快照 RPC ${method} 失败：${detail}`);
  }
}

export async function takeForkSnapshot(options: ForkSnapshotOptions): Promise<string> {
  if (!options.adminRpcUrl.trim()) throw new Error('snapshot isolation 缺少 admin RPC');
  const snapshotId = await snapshotRpc(options, 'evm_snapshot', []);
  if (typeof snapshotId !== 'string' || !snapshotId.trim()) {
    throw new Error('evm_snapshot 未返回有效快照 ID');
  }
  return snapshotId;
}

export async function revertForkSnapshot(
  options: ForkSnapshotOptions,
  snapshotId: string,
): Promise<void> {
  if (!snapshotId.trim()) throw new Error('evm_revert 缺少快照 ID');
  const reverted = await snapshotRpc(options, 'evm_revert', [snapshotId]);
  if (reverted !== true) throw new Error(`evm_revert(${snapshotId}) 未返回 true`);
}

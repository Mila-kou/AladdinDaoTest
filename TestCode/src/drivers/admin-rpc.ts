// Tenderly admin RPC 免签名交易通道：eth_sendTransaction 可用任意 from（含合约地址）。
// 仅用于私有 Fork 的环境管理操作；RPC URL 不进入返回值。
export async function adminRpcRequest(
  rpcUrl: string,
  method: string,
  params: unknown[],
  timeoutMs: number,
): Promise<unknown> {
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

export interface AdminTransactionReceipt {
  readonly txHash: string;
  readonly blockNumber: number;
  readonly status: 'success' | 'reverted';
}

export async function sendAdminTransaction(input: {
  readonly adminRpcUrl: string;
  readonly from: string;
  readonly to: string;
  readonly data: `0x${string}`;
  readonly timeoutMs?: number;
}): Promise<AdminTransactionReceipt> {
  const timeoutMs = input.timeoutMs ?? 30_000;
  const txHash = await adminRpcRequest(input.adminRpcUrl, 'eth_sendTransaction', [{
    from: input.from,
    to: input.to,
    data: input.data,
  }], timeoutMs);
  if (typeof txHash !== 'string') throw new Error('eth_sendTransaction 未返回交易哈希');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const receipt = await adminRpcRequest(input.adminRpcUrl, 'eth_getTransactionReceipt', [txHash], timeoutMs) as
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
  throw new Error(`环境管理交易 ${txHash} 在 ${timeoutMs}ms 内未上链`);
}

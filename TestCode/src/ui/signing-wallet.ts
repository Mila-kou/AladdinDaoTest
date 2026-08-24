import type { Page } from '@playwright/test';
import { createPublicClient, createWalletClient, defineChain, getAddress, http, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * 可签名的 EIP-1193 钱包注入（docs/07 附录四 §6「钱包签名走页面」；思路移植自 fx100-apps
 * e2e/fixtures/real-wallet.ts + signer.mjs）：
 *   - 页面侧 provider 与只读钱包同形（eth_accounts / eth_chainId 上报 84532 槽位、EIP-6963 announce），
 *     但 eth_sendTransaction 通过 page.exposeBinding 交给 Node 侧：viem 用 runtime 的 trader 私钥签名并广播到 fork RPC。
 *   - **私钥只在 Node 进程**，页面拿到的只是 txHash；personal_sign / eth_signTypedData_v4 仍抛 4200（只支持 Standard 模式）。
 *   - 每笔交易在签名前先 eth_call 预执行（失败即向页面抛错，便于定位前端构造问题），并把模拟返回值记下来
 *     （multicall 返回 bytes[]，最后一段是 orderKey，runner 可用 extractOrderKey 兜底）。
 *   - `waitForNext()` 让 runner/驱动器等待"页面刚发出的那笔交易"（按 to 过滤，如 ExchangeRouter）。
 * 必须在 page.goto 之前调用 injectSigningWallet。
 */
export interface SigningWalletOptions {
  readonly address: `0x${string}`;
  /** 页面侧上报的链 ID（前端借用 84532 槽位读 fork） */
  readonly appChainId: number;
  /** 实际签名/广播的链 ID（fork 链 ID，如 99911） */
  readonly chainId: number;
  readonly privateKey: `0x${string}`;
  readonly rpcUrl: string;
  readonly requestTimeoutMs?: number;
}

export interface SentUiTransaction {
  readonly seq: number;
  readonly requestedAt: string;
  readonly from: `0x${string}`;
  readonly to: `0x${string}`;
  readonly data: `0x${string}`;
  readonly value: string;
  readonly gas?: string;
  /** 签名前 eth_call 的返回值（hex）；预执行失败时为 undefined */
  readonly simulated?: `0x${string}`;
  readonly txHash?: `0x${string}`;
  readonly blockNumber?: number;
  readonly status?: 'success' | 'reverted';
  readonly gasUsed?: string;
  readonly error?: string;
}

export interface SigningWallet {
  readonly address: `0x${string}`;
  /** 已处理的页面交易（含失败），按 seq 递增 */
  readonly sent: readonly SentUiTransaction[];
  /** 等待下一笔满足条件且已上链（有回执）的页面交易；从调用时刻之后计数 */
  waitForNext(filter: (tx: SentUiTransaction) => boolean, timeoutMs?: number, label?: string): Promise<SentUiTransaction>;
}

export function signingWalletInitScript(options: { address: `0x${string}`; appChainId: number }): string {
  const address = JSON.stringify(options.address);
  const chainId = Number(options.appChainId);
  if (!Number.isInteger(chainId) || chainId <= 0) throw new Error(`非法 appChainId ${options.appChainId}`);
  // 源码字符串注入（避免 tsx keepNames 的 __name 助手，见 mock-wallet.ts）
  return `(() => {
  const address = ${address};
  const chainId = ${chainId};
  const chainHex = '0x' + chainId.toString(16);
  const listeners = new Map();
  const provider = {
    isMetaMask: true,
    selectedAddress: address,
    chainId: chainHex,
    networkVersion: String(chainId),
    isConnected: function () { return true; },
    request: async function (args) {
      const method = args && args.method;
      const params = (args && args.params) || [];
      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts':
          return [address];
        case 'eth_chainId':
          return chainHex;
        case 'net_version':
          return String(chainId);
        case 'wallet_requestPermissions':
          return [{ parentCapability: 'eth_accounts', caveats: [{ type: 'restrictReturnedAccounts', value: [address] }] }];
        case 'wallet_getPermissions':
          return [{ parentCapability: 'eth_accounts' }];
        case 'wallet_switchEthereumChain':
        case 'wallet_addEthereumChain':
        case 'wallet_watchAsset':
          return null;
        case 'eth_sendTransaction': {
          // Node 侧签名（私钥不进页面）；失败以 4001 形态抛回，前端按用户拒签/失败处理
          try {
            return await window.__fx100E2ESendTransaction(params[0] || {});
          } catch (error) {
            const wrapped = new Error('[signing-wallet] ' + (error && error.message ? error.message : String(error)));
            wrapped.code = 4001;
            throw wrapped;
          }
        }
        case 'personal_sign':
        case 'eth_sign':
        case 'eth_signTypedData':
        case 'eth_signTypedData_v4': {
          const error = new Error('[signing-wallet] ' + method + ' 不受支持（仅 Standard 模式 eth_sendTransaction）');
          error.code = 4200;
          throw error;
        }
        default:
          return null;
      }
    },
    on: function (event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(handler);
      return provider;
    },
    removeListener: function (event, handler) {
      const set = listeners.get(event);
      if (set) set.delete(handler);
      return provider;
    },
    emit: function (event) {
      const args = Array.prototype.slice.call(arguments, 1);
      const set = listeners.get(event);
      if (set) set.forEach(function (handler) { handler.apply(null, args); });
    },
  };
  Object.defineProperty(window, 'ethereum', { value: provider, configurable: true, writable: false });
  window.__fx100SigningWallet = { address: address, chainId: chainId, calls: [] };
  const originalRequest = provider.request;
  provider.request = async function (args) {
    const method = args && args.method;
    try {
      const result = await originalRequest(args);
      window.__fx100SigningWallet.calls.push({ method: method, ok: true });
      return result;
    } catch (error) {
      window.__fx100SigningWallet.calls.push({ method: method, ok: false, error: String(error && error.message) });
      throw error;
    }
  };
  const info = { uuid: 'fx100-testcode-signing-wallet', name: 'MetaMask', icon: 'data:image/svg+xml,', rdns: 'io.metamask' };
  const announce = function () {
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info: info, provider: provider }) }));
  };
  window.addEventListener('eip6963:requestProvider', announce);
  announce();
})();`;
}

interface RawTxParams {
  readonly from?: string;
  readonly to?: string;
  readonly data?: string;
  readonly value?: string;
  readonly gas?: string;
}

export async function injectSigningWallet(page: Page, options: SigningWalletOptions): Promise<SigningWallet> {
  const account = privateKeyToAccount(options.privateKey);
  if (getAddress(account.address) !== getAddress(options.address)) {
    throw new Error('签名钱包私钥地址与 trader 地址不匹配');
  }
  const chain = defineChain({
    id: options.chainId,
    name: 'FX100 E2E Fork (ui signer)',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [options.rpcUrl] } },
  });
  const transport = http(options.rpcUrl, { timeout: options.requestTimeoutMs ?? 30_000 });
  const wallet = createWalletClient({ account, chain, transport });
  const publicClient = createPublicClient({ chain, transport, pollingInterval: 1_000 });

  const sent: SentUiTransaction[] = [];
  const waiters: Array<{ afterSeq: number; filter: (tx: SentUiTransaction) => boolean; resolve: (tx: SentUiTransaction) => void }> = [];
  let seq = 0;
  const notify = (tx: SentUiTransaction): void => {
    for (let i = waiters.length - 1; i >= 0; i--) {
      const waiter = waiters[i]!;
      if (tx.seq > waiter.afterSeq && waiter.filter(tx)) {
        waiters.splice(i, 1);
        waiter.resolve(tx);
      }
    }
  };
  const update = (index: number, patch: Partial<SentUiTransaction>): SentUiTransaction => {
    const next = { ...sent[index]!, ...patch };
    sent[index] = next;
    return next;
  };

  await page.exposeBinding('__fx100E2ESendTransaction', async (_source, raw: RawTxParams): Promise<string> => {
    const index = sent.length;
    const to = getAddress(String(raw.to ?? '')) as `0x${string}`;
    const data = (raw.data && raw.data.startsWith('0x') ? raw.data : '0x') as `0x${string}`;
    const value = raw.value ? BigInt(raw.value) : 0n;
    const gas = raw.gas ? BigInt(raw.gas) : undefined;
    sent.push({
      seq: ++seq,
      requestedAt: new Date().toISOString(),
      from: getAddress(account.address) as `0x${string}`,
      to,
      data,
      value: value.toString(),
      ...(gas !== undefined ? { gas: gas.toString() } : {}),
    });
    if (raw.from && getAddress(raw.from) !== getAddress(account.address)) {
      const error = `页面请求的 from ${raw.from} 不是注入钱包地址 ${account.address}`;
      notify(update(index, { error }));
      throw new Error(error);
    }
    try {
      const simulated = await publicClient.request({
        method: 'eth_call',
        params: [{ from: account.address, to, data, value: toHex(value) }, 'latest'],
      }) as `0x${string}`;
      update(index, { simulated });
    } catch (error) {
      const message = error instanceof Error ? error.message.split('\n')[0]! : String(error);
      notify(update(index, { error: `预执行失败：${message}` }));
      throw new Error(`预执行失败：${message}`);
    }
    let hash: `0x${string}`;
    try {
      hash = await wallet.sendTransaction({ account, chain, to, data, value, ...(gas !== undefined ? { gas } : {}) });
    } catch (error) {
      const message = error instanceof Error ? error.message.split('\n')[0]! : String(error);
      notify(update(index, { error: `签名/广播失败：${message}` }));
      throw new Error(`签名/广播失败：${message}`);
    }
    update(index, { txHash: hash });
    // 回执在后台等待：页面拿到 hash 后自行轮询；这里补齐 blockNumber/status 供 runner 使用
    void publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 })
      .then((receipt) => {
        notify(update(index, {
          blockNumber: Number(receipt.blockNumber),
          status: receipt.status === 'success' ? 'success' : 'reverted',
          gasUsed: receipt.gasUsed.toString(),
        }));
      })
      .catch((error: unknown) => {
        notify(update(index, { error: `等待回执失败：${error instanceof Error ? error.message.split('\n')[0] : String(error)}` }));
      });
    return hash;
  });

  await page.addInitScript(signingWalletInitScript({ address: options.address, appChainId: options.appChainId }));

  return {
    address: getAddress(account.address) as `0x${string}`,
    sent,
    waitForNext(filter, timeoutMs = 90_000, label = '页面交易') {
      const afterSeq = seq;
      return new Promise<SentUiTransaction>((resolve, reject) => {
        const timer = setTimeout(() => {
          const index = waiters.findIndex((w) => w.resolve === wrapped);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error(`等待${label}超时（${timeoutMs}ms）；已记录 ${sent.length} 笔：${sent.map((t) => `${t.to.slice(0, 10)}…→${t.txHash ?? t.error ?? 'pending'}`).join('，') || '无'}`));
        }, timeoutMs);
        const wrapped = (tx: SentUiTransaction): void => {
          clearTimeout(timer);
          resolve(tx);
        };
        // 只在"已有回执或已失败"时放行：回执到达才 notify（见 exposeBinding 内）
        waiters.push({ afterSeq, filter: (tx) => (tx.blockNumber !== undefined || tx.error !== undefined) && filter(tx), resolve: wrapped });
      });
    },
  };
}

/** 页面内记录的 provider 调用轨迹（调试/证据用） */
export async function readSigningWalletCallLog(page: Page): Promise<Array<{ method: string; ok: boolean; error?: string }>> {
  return page.evaluate(() => {
    const w = window as unknown as { __fx100SigningWallet?: { calls: Array<{ method: string; ok: boolean; error?: string }> } };
    return w.__fx100SigningWallet?.calls ?? [];
  });
}

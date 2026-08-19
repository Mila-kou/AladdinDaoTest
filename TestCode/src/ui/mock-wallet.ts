import type { Page } from '@playwright/test';

/**
 * 只读观测用 EIP-1193 钱包注入（移植自 fx100-apps e2e/fixtures/mock-wallet.ts，2026-08-14）。
 *
 * 用途：让前端 wagmi/ConnectKit 进入"已连接"状态，从而 usePositionsDataSync 满足
 * isConnected && walletChainId === appChainId 后按 address 读取 tx-fork 持仓。
 *
 * 关键约束（docs/07 附录二 / Phase 1 审计）：
 *   - eth_chainId 必须上报 84532（0x14a34）：前端无 99911 槽位，上报 99911 会触发 ConnectKit
 *     不可关闭的 Switch Networks 遮罩；tx-fork 借 84532 槽位读链（合约地址与部署一致）。
 *   - 不发交易：eth_sendTransaction / 签名类方法直接抛错，避免静默假成功污染核对。
 *     将来 UI 全链路冒烟改用 impersonation provider（请求转发到 tx-fork RPC）。
 *   - 注入脚本以**源码字符串**形式传入 addInitScript：函数形式会被 tsx/esbuild 的 keepNames
 *     包上 `__name(...)` 助手，注入页面后 ReferenceError 静默失败（2026-08-14 实测）。
 * 必须在 page.goto 之前调用。
 */
export interface MockWalletOptions {
  readonly address: `0x${string}`;
  readonly chainId: number;
}

export function readonlyWalletInitScript(options: MockWalletOptions): string {
  const address = JSON.stringify(options.address);
  const chainId = Number(options.chainId);
  if (!Number.isInteger(chainId) || chainId <= 0) throw new Error(`非法 chainId ${options.chainId}`);
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
        case 'eth_sendTransaction':
        case 'personal_sign':
        case 'eth_sign':
        case 'eth_signTypedData':
        case 'eth_signTypedData_v4': {
          const error = new Error('[readonly-wallet] ' + method + ' 不受支持（只读观测钱包）');
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
  window.__fx100ReadonlyWallet = { address: address, chainId: chainId, calls: [] };
  const originalRequest = provider.request;
  provider.request = async function (args) {
    const method = args && args.method;
    try {
      const result = await originalRequest(args);
      window.__fx100ReadonlyWallet.calls.push({ method: method, ok: true });
      return result;
    } catch (error) {
      window.__fx100ReadonlyWallet.calls.push({ method: method, ok: false, error: String(error && error.message) });
      throw error;
    }
  };
  const info = { uuid: 'fx100-testcode-readonly-wallet', name: 'MetaMask', icon: 'data:image/svg+xml,', rdns: 'io.metamask' };
  const announce = function () {
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info: info, provider: provider }) }));
  };
  window.addEventListener('eip6963:requestProvider', announce);
  announce();
})();`;
}

export async function injectReadonlyWallet(page: Page, options: MockWalletOptions): Promise<void> {
  await page.addInitScript(readonlyWalletInitScript(options));
}

/** 页面内记录的 provider 调用轨迹（调试/证据用） */
export async function readWalletCallLog(page: Page): Promise<Array<{ method: string; ok: boolean; error?: string }>> {
  return page.evaluate(() => {
    const w = window as unknown as { __fx100ReadonlyWallet?: { calls: Array<{ method: string; ok: boolean; error?: string }> } };
    return w.__fx100ReadonlyWallet?.calls ?? [];
  });
}

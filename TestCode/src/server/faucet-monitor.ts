import { resolve } from 'node:path';

import {
  createPublicClient,
  formatUnits,
  getAddress,
  http,
  parseAbi,
  type Address,
} from 'viem';

import { readEnvironmentSettings } from './environment-settings.js';

export const BASE_SEPOLIA_FAUCET_ACCOUNT = getAddress('0x6E2Df1a8d0366ac1e55fF1dC23523299613902e5');
export const BASE_SEPOLIA_FAUCET_TOKEN = getAddress('0xbf4D9B318689AB928DB9eE4Cdc840c065575Eb89');

const BASE_SEPOLIA_CHAIN_ID = 84_532;
const erc20Abi = parseAbi([
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address account) view returns (uint256)',
]);

export interface FaucetBalanceSnapshot {
  readonly environment: 'base-sepolia';
  readonly chainId: number;
  readonly blockNumber: string;
  readonly account: Address;
  readonly token: Address;
  readonly symbol: string;
  readonly decimals: number;
  readonly balance: string;
  readonly rawBalance: string;
  readonly status: 'AVAILABLE' | 'EMPTY';
  readonly checkedAt: string;
  readonly explorerUrl: string;
}

export class FaucetBalanceMonitor {
  private readonly projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = resolve(projectRoot);
  }

  async read(): Promise<FaucetBalanceSnapshot> {
    const settings = await readEnvironmentSettings(this.projectRoot, 'base-sepolia');
    if (!settings.rpcUrl) {
      throw new Error('base-sepolia 未配置 E2E_BASE_SEPOLIA_RPC_URL。');
    }
    if (settings.chainId !== BASE_SEPOLIA_CHAIN_ID) {
      throw new Error(`base-sepolia 固定 Chain ID 应为 ${BASE_SEPOLIA_CHAIN_ID}，当前配置为 ${settings.chainId ?? '未配置'}。`);
    }

    const client = createPublicClient({
      transport: http(settings.rpcUrl, { timeout: 30_000 }),
      pollingInterval: 1_000,
    });
    const chainId = await client.getChainId();
    if (chainId !== BASE_SEPOLIA_CHAIN_ID) {
      throw new Error(`Base Sepolia RPC chainId=${chainId}，期望 ${BASE_SEPOLIA_CHAIN_ID}。`);
    }

    const blockNumber = await client.getBlockNumber();
    const [symbol, decimalsValue, balance] = await Promise.all([
      client.readContract({
        address: BASE_SEPOLIA_FAUCET_TOKEN,
        abi: erc20Abi,
        functionName: 'symbol',
        blockNumber,
      }),
      client.readContract({
        address: BASE_SEPOLIA_FAUCET_TOKEN,
        abi: erc20Abi,
        functionName: 'decimals',
        blockNumber,
      }),
      client.readContract({
        address: BASE_SEPOLIA_FAUCET_TOKEN,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [BASE_SEPOLIA_FAUCET_ACCOUNT],
        blockNumber,
      }),
    ]);
    const decimals = Number(decimalsValue);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
      throw new Error(`Token decimals=${decimals} 不受支持。`);
    }

    return {
      environment: 'base-sepolia',
      chainId,
      blockNumber: blockNumber.toString(),
      account: BASE_SEPOLIA_FAUCET_ACCOUNT,
      token: BASE_SEPOLIA_FAUCET_TOKEN,
      symbol,
      decimals,
      balance: formatUnits(balance, decimals),
      rawBalance: balance.toString(),
      status: balance === 0n ? 'EMPTY' : 'AVAILABLE',
      checkedAt: new Date().toISOString(),
      explorerUrl: `https://sepolia.basescan.org/token/${BASE_SEPOLIA_FAUCET_TOKEN}?a=${BASE_SEPOLIA_FAUCET_ACCOUNT}`,
    };
  }
}

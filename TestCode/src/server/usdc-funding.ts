import { resolve } from 'node:path';

import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  getAddress,
  http,
  parseAbi,
  parseUnits,
  toHex,
  type Address,
  type Hash,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';

import {
  environmentNames,
  environments,
  type EnvironmentName,
} from '../../config/environments/catalog.js';
import {
  assertRuntimeEnvironmentBinding,
  loadEnvironmentBinding,
} from '../config/environment-binding.js';
import {
  readFundingSignerCandidates,
} from './environment-configuration.js';
import { readEnvironmentSettings } from './environment-settings.js';

const fundSchema = z.object({
  environment: z.enum(environmentNames),
  account: z.string().trim().regex(/^0x[0-9a-fA-F]{40}$/, '用户地址格式不正确。'),
  expectedToken: z.string().trim().regex(/^0x[0-9a-fA-F]{40}$/, '预期 Token 地址格式不正确。').optional(),
  amount: z.string().trim().min(1).max(80).regex(
    /^(?:0|[1-9]\d*)(?:\.\d+)?$/,
    '金额必须是大于 0 的十进制数字。',
  ),
});

const lpVaultAbi = parseAbi(['function asset() view returns (address)']);
const erc20Abi = parseAbi([
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address account) view returns (uint256)',
  'function owner() view returns (address)',
  'function mint(address account, uint256 amount)',
]);

interface RpcBody {
  readonly result?: unknown;
  readonly error?: { readonly message?: string };
}

async function rpcCall(url: string, method: string, params: readonly unknown[]): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${method} HTTP ${response.status}`);
  const body = await response.json() as RpcBody;
  if (body.error) throw new Error(`${method}: ${body.error.message ?? 'unknown RPC error'}`);
  return body.result;
}

export interface UsdcFundingReceipt {
  readonly environment: EnvironmentName;
  readonly chainId: number;
  readonly account: Address;
  readonly token: Address;
  readonly symbol: string;
  readonly decimals: number;
  readonly amount: string;
  readonly before: string;
  readonly after: string;
  readonly rawAmount: string;
  readonly rawBefore: string;
  readonly rawAfter: string;
  readonly rpcMethod: 'tenderly_setErc20Balance' | 'MockToken.mint';
  readonly transactionHash?: Hash;
  readonly transactionUrl?: string;
  readonly executedAt: string;
}

export class UsdcFundingManager {
  private readonly projectRoot: string;
  private queue: Promise<void> = Promise.resolve();

  constructor(projectRoot: string) {
    this.projectRoot = resolve(projectRoot);
  }

  fund(rawInput: unknown): Promise<UsdcFundingReceipt> {
    const operation = this.queue.then(() => this.execute(rawInput));
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  /** 自动补款启动前的只读校验；不会签名或发送交易。 */
  async validateBaseSepoliaAutoFunding(expectedToken: Address): Promise<void> {
    const [settings, candidates] = await Promise.all([
      readEnvironmentSettings(this.projectRoot, 'base-sepolia'),
      readFundingSignerCandidates(this.projectRoot),
    ]);
    if (!settings.rpcUrl) throw new Error('base-sepolia 未配置 E2E_BASE_SEPOLIA_RPC_URL。');
    if (settings.chainId !== 84_532) {
      throw new Error(`base-sepolia 固定 Chain ID 应为 84532，当前为 ${settings.chainId ?? '未配置'}。`);
    }
    const binding = loadEnvironmentBinding(this.projectRoot, 'base-sepolia');
    await assertRuntimeEnvironmentBinding({
      environment: 'base-sepolia',
      chainId: binding.binding.environmentChainId,
      rpcUrl: settings.rpcUrl,
      deploymentManifestPath: binding.manifestPath,
      deploymentId: binding.binding.deploymentId,
      deploymentRelease: binding.binding.release,
      requestTimeoutMs: 30_000,
    }, this.projectRoot);
    const manifest = binding.manifest;
    const lpVault = manifest.additionalContracts.lpVault;
    if (!lpVault) throw new Error('Deployment Manifest 缺少 LPVault 地址。');
    const client = createPublicClient({
      transport: http(settings.rpcUrl, { timeout: 30_000 }),
      pollingInterval: 500,
    });
    const chainId = await client.getChainId();
    if (chainId !== 84_532) throw new Error(`Base Sepolia RPC chainId=${chainId}，期望 84532。`);
    const token = getAddress(await client.readContract({
      address: getAddress(lpVault),
      abi: lpVaultAbi,
      functionName: 'asset',
    }));
    if (token.toLowerCase() !== expectedToken.toLowerCase()) {
      throw new Error(`LPVault asset=${token}，与 Faucet 监控 Token=${expectedToken} 不一致。`);
    }
    const owner = getAddress(await client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'owner',
    }));
    const ownerCandidate = candidates.find((candidate) => candidate.source === 'E2E_TOKEN_OWNER_PRIVATE_KEY');
    if (!ownerCandidate) throw new Error('未配置 E2E_TOKEN_OWNER_PRIVATE_KEY。');
    const signer = privateKeyToAccount(ownerCandidate.privateKey);
    if (signer.address.toLowerCase() !== owner.toLowerCase()) {
      throw new Error(`Token Owner 私钥地址=${signer.address}，与链上 owner()=${owner} 不一致。`);
    }
    if (await client.getBalance({ address: signer.address }) === 0n) {
      throw new Error(`Token Owner ${owner} 没有 Base Sepolia ETH，无法支付 mint Gas。`);
    }
  }

  private async execute(rawInput: unknown): Promise<UsdcFundingReceipt> {
    const input = fundSchema.parse(rawInput);
    const definition = environments[input.environment];
    const isBaseSepolia = input.environment === 'base-sepolia';
    const isPrivateFork = definition.initializesDefaultMockResources
      && Boolean(definition.adminRpcEnvironmentVariable);
    if (!isBaseSepolia && !isPrivateFork) {
      throw new Error('USDC Funding 只允许 base-sepolia 或 tx-fork、oracle-fork、time-fork。');
    }

    const settings = await readEnvironmentSettings(this.projectRoot, input.environment);
    if (isPrivateFork && !settings.adminRpcUrl) {
      throw new Error(`${input.environment} 未配置 ${definition.adminRpcEnvironmentVariable}。`);
    }
    if (isBaseSepolia && !settings.rpcUrl) {
      throw new Error('base-sepolia 未配置 E2E_BASE_SEPOLIA_RPC_URL。');
    }
    if (!settings.chainId) throw new Error(`${input.environment} 未配置固定 Chain ID。`);
    const operationRpcUrl = isPrivateFork ? settings.adminRpcUrl! : settings.rpcUrl!;

    const binding = loadEnvironmentBinding(this.projectRoot, input.environment);
    await assertRuntimeEnvironmentBinding({
      environment: input.environment,
      chainId: binding.binding.environmentChainId,
      rpcUrl: operationRpcUrl,
      deploymentManifestPath: binding.manifestPath,
      deploymentId: binding.binding.deploymentId,
      deploymentRelease: binding.binding.release,
      requestTimeoutMs: 30_000,
    }, this.projectRoot);
    const manifest = binding.manifest;
    const lpVault = manifest.additionalContracts.lpVault;
    if (!lpVault) throw new Error('Deployment Manifest 缺少 LPVault 地址。');

    const client = createPublicClient({
      transport: http(operationRpcUrl, { timeout: 30_000 }),
      pollingInterval: 500,
    });
    const chainId = await client.getChainId();
    if (chainId !== settings.chainId) {
      throw new Error(`Funding RPC chainId=${chainId}，期望 ${settings.chainId}；未执行 Funding。`);
    }
    if (isBaseSepolia && chainId !== 84_532) {
      throw new Error(`base-sepolia 必须连接 Chain ID 84532，当前为 ${chainId}；未执行 Funding。`);
    }

    const account = getAddress(input.account);
    const token = getAddress(await client.readContract({
      address: getAddress(lpVault),
      abi: lpVaultAbi,
      functionName: 'asset',
    }));
    if (input.expectedToken && token.toLowerCase() !== getAddress(input.expectedToken).toLowerCase()) {
      throw new Error(`Funding Token=${token}，与预期 Token=${getAddress(input.expectedToken)} 不一致；未执行 Funding。`);
    }
    const [symbol, decimalsValue, before] = await Promise.all([
      client.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' }),
      client.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
      client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
    ]);
    const decimals = Number(decimalsValue);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
      throw new Error(`USDC decimals=${decimals} 不受支持。`);
    }
    const amount = parseUnits(input.amount, decimals);
    if (amount <= 0n) throw new Error('Funding 金额必须大于 0。');
    const afterExpected = before + amount;
    if (afterExpected > (2n ** 256n) - 1n) throw new Error('Funding 后余额超过 uint256 上限。');

    let transactionHash: Hash | undefined;
    let rpcMethod: UsdcFundingReceipt['rpcMethod'];
    if (isPrivateFork) {
      await rpcCall(operationRpcUrl, 'tenderly_setErc20Balance', [
        token,
        account,
        toHex(afterExpected),
      ]);
      rpcMethod = 'tenderly_setErc20Balance';
    } else {
      const owner = getAddress(await client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'owner',
      }));
      const candidates = await readFundingSignerCandidates(this.projectRoot);
      const signer = candidates
        .map((candidate) => ({ ...candidate, account: privateKeyToAccount(candidate.privateKey) }))
        .find((candidate) => candidate.account.address.toLowerCase() === owner.toLowerCase());
      if (!signer) {
        throw new Error(`Base Sepolia Mock USDC owner=${owner}；请在测试环境配置 E2E_TOKEN_OWNER_PRIVATE_KEY，并确保其地址与 owner() 一致。`);
      }
      const nativeBalance = await client.getBalance({ address: signer.account.address });
      if (nativeBalance === 0n) {
        throw new Error(`Token Owner ${owner} 没有 Base Sepolia ETH，无法支付 mint Gas。`);
      }
      const wallet = createWalletClient({
        account: signer.account,
        transport: http(operationRpcUrl, { timeout: 30_000 }),
      });
      transactionHash = await wallet.writeContract({
        chain: null,
        address: token,
        abi: erc20Abi,
        functionName: 'mint',
        args: [account, amount],
      });
      const receipt = await client.waitForTransactionReceipt({
        hash: transactionHash,
        confirmations: 1,
        timeout: 90_000,
      });
      if (receipt.status !== 'success') {
        throw new Error(`MockToken.mint 交易执行失败：${transactionHash}`);
      }
      rpcMethod = 'MockToken.mint';
    }
    const after = await client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [account],
    });
    if (after !== afterExpected) {
      throw new Error(`Funding 回读不一致：expected=${afterExpected}，after=${after}。`);
    }

    return {
      environment: input.environment,
      chainId,
      account,
      token,
      symbol,
      decimals,
      amount: formatUnits(amount, decimals),
      before: formatUnits(before, decimals),
      after: formatUnits(after, decimals),
      rawAmount: amount.toString(),
      rawBefore: before.toString(),
      rawAfter: after.toString(),
      rpcMethod,
      ...(transactionHash ? {
        transactionHash,
        transactionUrl: `https://sepolia.basescan.org/tx/${transactionHash}`,
      } : {}),
      executedAt: new Date().toISOString(),
    };
  }
}

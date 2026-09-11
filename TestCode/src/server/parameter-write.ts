import { createPublicClient, encodeFunctionData, getAddress, http, parseAbi } from 'viem';
import { z } from 'zod';

import { environments, type EnvironmentName } from '../../config/environments/catalog.js';
import {
  assertRuntimeEnvironmentBinding,
  loadEnvironmentBinding,
} from '../config/environment-binding.js';
import { sendAdminTransaction } from '../drivers/admin-rpc.js';
import { readEnvironmentSettings } from './environment-settings.js';

// 单参数直写：DataStore.set*（onlyController），from 模拟 Config 合约——它持有
// CONTROLLER 角色，初始化脚本写 33 项参数走的就是它。仅私有 Fork 可用，
// 写入后立即回读核对；改动不自动恢复，由页面显著警示。
const dataStoreAbi = parseAbi([
  'function getUint(bytes32) view returns (uint256)',
  'function getInt(bytes32) view returns (int256)',
  'function getBool(bytes32) view returns (bool)',
  'function getAddress(bytes32) view returns (address)',
  'function setUint(bytes32 key, uint256 value)',
  'function setInt(bytes32 key, int256 value)',
  'function setBool(bytes32 key, bool value)',
  'function setAddress(bytes32 key, address value)',
]);

const writeSchema = z.object({
  environment: z.string(),
  key: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  valueType: z.enum(['uint', 'int', 'bool', 'address']),
  value: z.string().min(1).max(256),
  label: z.string().max(200).optional(),
});

const PRIVATE_FORKS = ['tx-fork', 'oracle-fork', 'time-fork'];

function parseValue(valueType: 'uint' | 'int' | 'bool' | 'address', value: string): bigint | boolean | `0x${string}` {
  if (valueType === 'uint') {
    if (!/^\d+$/.test(value)) throw new Error('uint 参数值必须是十进制非负整数（raw 原始值，非可读值）。');
    return BigInt(value);
  }
  if (valueType === 'int') {
    if (!/^-?\d+$/.test(value)) throw new Error('int 参数值必须是十进制整数（raw 原始值）。');
    return BigInt(value);
  }
  if (valueType === 'bool') {
    if (value !== 'true' && value !== 'false') throw new Error('bool 参数值只接受 true / false。');
    return value === 'true';
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error('address 参数值必须是 0x 开头的 40 位十六进制地址。');
  return getAddress(value);
}

export class ParameterWriteManager {
  constructor(private readonly projectRoot: string) {}

  private manifestAddresses(environment: EnvironmentName): {
    dataStore: string;
    config: string;
    binding: ReturnType<typeof loadEnvironmentBinding>;
  } {
    const binding = loadEnvironmentBinding(this.projectRoot, environment);
    return {
      dataStore: binding.manifest.contracts.dataStore,
      config: binding.manifest.contracts.config,
      binding,
    };
  }

  async write(raw: unknown) {
    const input = writeSchema.parse(raw);
    if (!(input.environment in environments) || !PRIVATE_FORKS.includes(input.environment)) {
      throw new Error(`仅 tx-fork / oracle-fork / time-fork 支持参数直写，收到：${input.environment}`);
    }
    const settings = await readEnvironmentSettings(this.projectRoot, input.environment as EnvironmentName);
    if (!settings.rpcUrl) throw new Error(`${input.environment} 未配置 RPC。`);
    const adminRpcUrl = settings.adminRpcUrl ?? settings.rpcUrl;
    const addresses = this.manifestAddresses(input.environment as EnvironmentName);
    await assertRuntimeEnvironmentBinding({
      environment: input.environment as EnvironmentName,
      chainId: addresses.binding.binding.environmentChainId,
      rpcUrl: settings.rpcUrl,
      deploymentManifestPath: addresses.binding.manifestPath,
      deploymentId: addresses.binding.binding.deploymentId,
      deploymentRelease: addresses.binding.binding.release,
      requestTimeoutMs: 20_000,
    }, this.projectRoot);
    const client = createPublicClient({ transport: http(settings.rpcUrl, { timeout: 20_000 }) });
    const dataStore = getAddress(addresses.dataStore);
    const key = input.key as `0x${string}`;
    const parsed = parseValue(input.valueType, input.value);
    const readCurrent = async (): Promise<unknown> => {
      switch (input.valueType) {
        case 'uint': return client.readContract({ address: dataStore, abi: dataStoreAbi, functionName: 'getUint', args: [key] });
        case 'int': return client.readContract({ address: dataStore, abi: dataStoreAbi, functionName: 'getInt', args: [key] });
        case 'bool': return client.readContract({ address: dataStore, abi: dataStoreAbi, functionName: 'getBool', args: [key] });
        default: return client.readContract({ address: dataStore, abi: dataStoreAbi, functionName: 'getAddress', args: [key] });
      }
    };
    const encodeSetter = (): `0x${string}` => {
      switch (input.valueType) {
        case 'uint': return encodeFunctionData({ abi: dataStoreAbi, functionName: 'setUint', args: [key, parsed as bigint] });
        case 'int': return encodeFunctionData({ abi: dataStoreAbi, functionName: 'setInt', args: [key, parsed as bigint] });
        case 'bool': return encodeFunctionData({ abi: dataStoreAbi, functionName: 'setBool', args: [key, parsed as boolean] });
        default: return encodeFunctionData({ abi: dataStoreAbi, functionName: 'setAddress', args: [key, parsed as `0x${string}`] });
      }
    };

    const before = await readCurrent();
    const receipt = await sendAdminTransaction({
      adminRpcUrl,
      // Config 合约持有 CONTROLLER 角色；免签名模拟它直写 DataStore。
      from: addresses.config,
      to: dataStore,
      data: encodeSetter(),
    });
    if (receipt.status !== 'success') {
      throw new Error(`DataStore set${input.valueType} 交易回执失败：${receipt.txHash}`);
    }
    const after = await readCurrent();
    const normalize = (value: unknown): string => (typeof value === 'string' ? value.toLowerCase() : String(value));
    if (normalize(after) !== normalize(parsed)) {
      throw new Error(`写入后回读不一致：期望 ${String(parsed)}，实际 ${String(after)}。`);
    }
    return {
      environment: input.environment,
      key: input.key,
      valueType: input.valueType,
      label: input.label ?? '',
      before: String(before),
      after: String(after),
      txHash: receipt.txHash,
      blockNumber: receipt.blockNumber,
    };
  }
}

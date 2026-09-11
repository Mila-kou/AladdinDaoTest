import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import dotenv from 'dotenv';
import {
  createPublicClient,
  encodeAbiParameters,
  encodeFunctionData,
  formatUnits,
  getAddress,
  http,
  keccak256,
  parseAbi,
  parseAbiParameters,
} from 'viem';
import { z } from 'zod';

import { environments, type EnvironmentName } from '../../config/environments/catalog.js';
import {
  assertRuntimeEnvironmentBinding,
  loadEnvironmentBinding,
} from '../config/environment-binding.js';
import { isMockResourceEnvironment, resolveMockMarketBundle } from '../config/mock-resources.js';
import { sendAdminTransaction } from '../drivers/admin-rpc.js';
import {
  freshOracleTimestamp,
  readMockOracleState,
  sendSetMockPrice,
  type MockOracleState,
} from '../drivers/mock-oracle.js';
import type { TestProject } from '../reporting/test-environments.js';
import { readEnvironmentSettings } from './environment-settings.js';

// 链上有效价格区间的机制（ChainlinkPriceFeedProvider.getOraclePrice）：
//   feed 内部价 = MockOracle answer × PRICE_FEED_MULTIPLIER / 1e30
//   stablePrice = DataStore.STABLE_PRICE(token)（内部价刻度）
//   min/max = sort(feed 内部价, stablePrice)；stablePrice=0 时 min==max==feed 价
// 因此：min 由 MockOracle answer 控制（setMockPrice），max 由 STABLE_PRICE 控制
//（DataStore.setUint，模拟持有 CONTROLLER 的 Config 合约）。

const priceDecimal = /^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/;

const readSchema = z.object({
  environment: z.string(),
  bundleAlias: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/).default('default-mock'),
});

const updateSchema = readSchema.extend({
  action: z.enum(['refresh-timestamp', 'set-price']),
  target: z.enum(['index', 'collateral', 'both']).default('both'),
  /** 旧字段：等价于 minPrice=maxPrice=price */
  price: z.string().regex(priceDecimal).optional(),
  /** set-price：新的 Min 价（USD 十进制，写入 MockOracle answer） */
  minPrice: z.string().regex(priceDecimal).optional(),
  /** set-price：新的 Max 价（USD 十进制，写入 DataStore STABLE_PRICE）；缺省=minPrice */
  maxPrice: z.string().regex(priceDecimal).optional(),
});

const dataStoreAbi = parseAbi([
  'function getUint(bytes32) view returns (uint256)',
  'function setUint(bytes32 key, uint256 value)',
]);

function baseKey(name: string): `0x${string}` {
  return keccak256(encodeAbiParameters(parseAbiParameters('string'), [name]));
}

function tokenKey(name: string, token: string): `0x${string}` {
  const encoded = encodeAbiParameters(parseAbiParameters('address'), [getAddress(token)]);
  return keccak256(`${baseKey(name)}${encoded.slice(2)}` as `0x${string}`);
}

/** 看板填写的 USD 十进制价格 → feed 原始整数（oracle decimals 定点） */
function oraclePriceRaw(value: string, decimals: number): bigint {
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error(`价格 ${value} 的小数位超过 Oracle decimals=${decimals}。`);
  return BigInt(`${whole}${fraction.padEnd(decimals, '0')}`);
}

function internalPrice(rawPrice: bigint, multiplier: bigint): bigint {
  return rawPrice * multiplier / 10n ** 30n;
}

/** 内部价刻度的小数位：log10(multiplier) + oracleDecimals − 30（index=12，USDC=24） */
function internalDecimals(multiplier: bigint, feedDecimals: number): number {
  const digits = multiplier.toString().length - 1;
  return digits + feedDecimals - 30;
}

interface OracleTargetContext {
  readonly role: 'index' | 'collateral';
  readonly oracle: string;
  readonly token: string;
}

interface OracleChainView {
  readonly state: MockOracleState;
  readonly multiplier: bigint;
  readonly stablePrice: bigint;
  readonly scale: number;
  readonly feedInternal: bigint;
  readonly minInternal: bigint;
  readonly maxInternal: bigint;
}

function oracleView(target: OracleTargetContext, chain: OracleChainView) {
  return {
    role: target.role,
    address: chain.state.address,
    token: target.token,
    description: chain.state.description,
    decimals: chain.state.decimals,
    priceRaw: chain.state.answer.toString(),
    priceDisplay: formatUnits(chain.state.answer, chain.state.decimals),
    minPriceDisplay: formatUnits(chain.minInternal, chain.scale),
    maxPriceDisplay: formatUnits(chain.maxInternal, chain.scale),
    stablePriceRaw: chain.stablePrice.toString(),
    updatedAt: Number(chain.state.updatedAt),
    updatedAtIso: new Date(Number(chain.state.updatedAt) * 1000).toISOString(),
    ageSeconds: Number(chain.state.ageSeconds),
    fresh: chain.state.ageSeconds <= 3600n,
  };
}

export class MockOraclePriceManager {
  constructor(private readonly projectRoot: string) {}

  private async localValues(): Promise<Record<string, string>> {
    return {
      ...dotenv.parse(await readFile(join(this.projectRoot, '.env'), 'utf8').catch(() => '')),
      ...dotenv.parse(await readFile(join(this.projectRoot, '.env.local'), 'utf8').catch(() => '')),
    } as Record<string, string>;
  }

  private async context(environment: string, bundleAlias: string) {
    if (!(environment in environments) || !isMockResourceEnvironment(environment as TestProject)) {
      throw new Error(`仅 tx-fork / oracle-fork / time-fork 支持 Mock Oracle 价格操作，收到：${environment}`);
    }
    const settings = await readEnvironmentSettings(this.projectRoot, environment as EnvironmentName);
    if (!settings.rpcUrl) throw new Error(`${environment} 未配置 RPC；请先完成步骤① Fork 与 RPC。`);
    const resource = await resolveMockMarketBundle(environment as TestProject, bundleAlias);
    if (!resource.oracle?.address || !resource.collateralOracle?.address
      || !resource.token?.address || !resource.collateralToken?.address) {
      throw new Error(`${environment}/${bundleAlias} 缺少 Token / Mock Oracle 登记；请先初始化 default-mock。`);
    }
    const binding = loadEnvironmentBinding(this.projectRoot, environment as EnvironmentName);
    await assertRuntimeEnvironmentBinding({
      environment: environment as EnvironmentName,
      chainId: binding.binding.environmentChainId,
      rpcUrl: settings.rpcUrl,
      deploymentManifestPath: binding.manifestPath,
      deploymentId: binding.binding.deploymentId,
      deploymentRelease: binding.binding.release,
      requestTimeoutMs: 20_000,
    }, this.projectRoot);
    const manifest = binding.manifest;
    const targets: OracleTargetContext[] = [
      { role: 'index', oracle: resource.oracle.address, token: resource.token.address },
      { role: 'collateral', oracle: resource.collateralOracle.address, token: resource.collateralToken.address },
    ];
    return {
      rpcUrl: settings.rpcUrl,
      adminRpcUrl: settings.adminRpcUrl ?? settings.rpcUrl,
      dataStore: getAddress(manifest.contracts.dataStore),
      configContract: getAddress(manifest.contracts.config),
      targets,
    };
  }

  private async readChain(
    rpcUrl: string,
    dataStore: `0x${string}`,
    target: OracleTargetContext,
  ): Promise<OracleChainView> {
    const client = createPublicClient({ transport: http(rpcUrl, { timeout: 15_000 }) });
    const [state, multiplier, stablePrice] = await Promise.all([
      readMockOracleState(rpcUrl, target.oracle),
      client.readContract({
        address: dataStore, abi: dataStoreAbi, functionName: 'getUint',
        args: [tokenKey('PRICE_FEED_MULTIPLIER', target.token)],
      }),
      client.readContract({
        address: dataStore, abi: dataStoreAbi, functionName: 'getUint',
        args: [tokenKey('STABLE_PRICE', target.token)],
      }),
    ]);
    const feedInternal = internalPrice(state.answer, multiplier);
    const minInternal = stablePrice > 0n && stablePrice < feedInternal ? stablePrice : feedInternal;
    const maxInternal = stablePrice > feedInternal ? stablePrice : feedInternal;
    return {
      state,
      multiplier,
      stablePrice,
      scale: internalDecimals(multiplier, state.decimals),
      feedInternal,
      minInternal,
      maxInternal,
    };
  }

  async read(raw: unknown) {
    const input = readSchema.parse(raw);
    const context = await this.context(input.environment, input.bundleAlias);
    const views = await Promise.all(context.targets.map(async (target) => oracleView(
      target,
      await this.readChain(context.rpcUrl, context.dataStore, target),
    )));
    const first = await readMockOracleState(context.rpcUrl, context.targets[0]!.oracle);
    return {
      environment: input.environment,
      bundleAlias: input.bundleAlias,
      latestBlock: {
        number: Number(first.latestBlockNumber),
        timestamp: Number(first.latestBlockTimestamp),
        timestampIso: new Date(Number(first.latestBlockTimestamp) * 1000).toISOString(),
      },
      oracles: views,
    };
  }

  async update(raw: unknown) {
    const input = updateSchema.parse(raw);
    const minInput = input.minPrice ?? input.price;
    const maxInput = input.maxPrice ?? minInput;
    if (input.action === 'set-price') {
      if (!minInput) throw new Error('set-price 需要提供 minPrice（或旧字段 price）。');
      if (Number(minInput) <= 0) throw new Error('Min 价必须大于 0。');
      if (Number(maxInput) < Number(minInput)) throw new Error('Max 价不能小于 Min 价。');
    }
    const context = await this.context(input.environment, input.bundleAlias);
    const from = await this.senderAddress();
    const targets = context.targets.filter((target) =>
      input.target === 'both' || target.role === input.target);
    const operations = [];
    for (const target of targets) {
      const before = await this.readChain(context.rpcUrl, context.dataStore, target);
      const timestamp = freshOracleTimestamp(before.state.latestBlockTimestamp);
      const feedRaw = input.action === 'set-price'
        ? oraclePriceRaw(minInput!, before.state.decimals)
        : before.state.answer;
      const feedReceipt = await sendSetMockPrice({
        adminRpcUrl: context.adminRpcUrl,
        from,
        oracle: target.oracle,
        priceRaw: feedRaw,
        timestamp,
      });
      if (feedReceipt.status !== 'success') {
        throw new Error(`${target.role} Oracle setMockPrice 交易回执失败：${feedReceipt.txHash}`);
      }
      let stableTxHash: string | undefined;
      if (input.action === 'set-price') {
        // Max 价写 STABLE_PRICE（内部价刻度）；min==max 时也写入，保证区间精确等于输入。
        const maxInternal = internalPrice(oraclePriceRaw(maxInput!, before.state.decimals), before.multiplier);
        const stableReceipt = await sendAdminTransaction({
          adminRpcUrl: context.adminRpcUrl,
          from: context.configContract,
          to: context.dataStore,
          data: encodeFunctionData({
            abi: dataStoreAbi,
            functionName: 'setUint',
            args: [tokenKey('STABLE_PRICE', target.token), maxInternal],
          }),
        });
        if (stableReceipt.status !== 'success') {
          throw new Error(`${target.role} STABLE_PRICE 写入交易回执失败：${stableReceipt.txHash}`);
        }
        stableTxHash = stableReceipt.txHash;
      }
      const after = await this.readChain(context.rpcUrl, context.dataStore, target);
      operations.push({
        role: target.role,
        address: target.oracle,
        action: input.action,
        before: {
          priceRaw: before.state.answer.toString(),
          minPriceDisplay: formatUnits(before.minInternal, before.scale),
          maxPriceDisplay: formatUnits(before.maxInternal, before.scale),
          updatedAt: Number(before.state.updatedAt),
        },
        after: oracleView(target, after),
        txHash: feedReceipt.txHash,
        blockNumber: feedReceipt.blockNumber,
        ...(stableTxHash ? { stableTxHash } : {}),
      });
    }
    return { environment: input.environment, bundleAlias: input.bundleAlias, operations };
  }

  private async senderAddress(): Promise<string> {
    const values = await this.localValues();
    const from = values.E2E_ADMIN_ACCOUNT ?? values.E2E_TEST_ACCOUNT;
    if (!from) throw new Error('未配置 E2E_ADMIN_ACCOUNT / E2E_TEST_ACCOUNT，无法发送环境管理交易。');
    return from;
  }
}

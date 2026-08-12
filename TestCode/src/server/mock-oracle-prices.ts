import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import dotenv from 'dotenv';
import { formatUnits, parseUnits } from 'viem';
import { z } from 'zod';

import { environments, type EnvironmentName } from '../../config/environments/catalog.js';
import { isMockResourceEnvironment, resolveMockMarketBundle } from '../config/mock-resources.js';
import type { TestProject } from '../reporting/test-environments.js';
import {
  freshOracleTimestamp,
  readMockOracleState,
  sendSetMockPrice,
  type MockOracleState,
} from '../drivers/mock-oracle.js';
import { readEnvironmentSettings } from './environment-settings.js';

const readSchema = z.object({
  environment: z.string(),
  bundleAlias: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/).default('default-mock'),
});

const updateSchema = readSchema.extend({
  action: z.enum(['refresh-timestamp', 'set-price']),
  target: z.enum(['index', 'collateral', 'both']).default('both'),
  /** set-price 时必填：十进制 USD 价格（按 Oracle decimals 换算 raw） */
  price: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/).optional(),
});

interface OracleView {
  readonly role: 'index' | 'collateral';
  readonly address: string;
  readonly description: string;
  readonly decimals: number;
  readonly priceRaw: string;
  readonly priceDisplay: string;
  readonly updatedAt: number;
  readonly updatedAtIso: string;
  readonly ageSeconds: number;
  /** 相对链上最新区块 1 小时内视为新鲜；fork 新区块用真实时钟，隔天必过期 */
  readonly fresh: boolean;
}

function oracleView(role: 'index' | 'collateral', state: MockOracleState): OracleView {
  return {
    role,
    address: state.address,
    description: state.description,
    decimals: state.decimals,
    priceRaw: state.answer.toString(),
    priceDisplay: formatUnits(state.answer, state.decimals),
    updatedAt: Number(state.updatedAt),
    updatedAtIso: new Date(Number(state.updatedAt) * 1000).toISOString(),
    ageSeconds: Number(state.ageSeconds),
    fresh: state.ageSeconds <= 3600n,
  };
}

export class MockOraclePriceManager {
  constructor(private readonly projectRoot: string) {}

  private async context(environment: string, bundleAlias: string) {
    if (!(environment in environments) || !isMockResourceEnvironment(environment as TestProject)) {
      throw new Error(`仅 tx-fork / oracle-fork / time-fork 支持 Mock Oracle 价格操作，收到：${environment}`);
    }
    const settings = await readEnvironmentSettings(this.projectRoot, environment as EnvironmentName);
    if (!settings.rpcUrl) throw new Error(`${environment} 未配置 RPC；请先完成步骤① Fork 与 RPC。`);
    const resource = await resolveMockMarketBundle(environment as TestProject, bundleAlias);
    if (!resource.oracle?.address || !resource.collateralOracle?.address) {
      throw new Error(`${environment}/${bundleAlias} 缺少 Index/Collateral Mock Oracle 登记；请先初始化 default-mock。`);
    }
    return {
      rpcUrl: settings.rpcUrl,
      adminRpcUrl: settings.adminRpcUrl ?? settings.rpcUrl,
      indexOracle: resource.oracle.address,
      collateralOracle: resource.collateralOracle.address,
    };
  }

  private async senderAddress(): Promise<string> {
    const values = {
      ...dotenv.parse(await readFile(join(this.projectRoot, '.env'), 'utf8').catch(() => '')),
      ...dotenv.parse(await readFile(join(this.projectRoot, '.env.local'), 'utf8').catch(() => '')),
    } as Record<string, string>;
    const from = values.E2E_ADMIN_ACCOUNT ?? values.E2E_TEST_ACCOUNT;
    if (!from) throw new Error('未配置 E2E_ADMIN_ACCOUNT / E2E_TEST_ACCOUNT，无法发送环境管理交易。');
    return from;
  }

  async read(raw: unknown) {
    const input = readSchema.parse(raw);
    const context = await this.context(input.environment, input.bundleAlias);
    const [index, collateral] = await Promise.all([
      readMockOracleState(context.rpcUrl, context.indexOracle),
      readMockOracleState(context.rpcUrl, context.collateralOracle),
    ]);
    return {
      environment: input.environment,
      bundleAlias: input.bundleAlias,
      latestBlock: {
        number: Number(index.latestBlockNumber),
        timestamp: Number(index.latestBlockTimestamp),
        timestampIso: new Date(Number(index.latestBlockTimestamp) * 1000).toISOString(),
      },
      oracles: [oracleView('index', index), oracleView('collateral', collateral)],
    };
  }

  async update(raw: unknown) {
    const input = updateSchema.parse(raw);
    if (input.action === 'set-price' && !input.price) {
      throw new Error('set-price 需要提供十进制 USD 价格。');
    }
    const context = await this.context(input.environment, input.bundleAlias);
    const from = await this.senderAddress();
    const targets: Array<{ role: 'index' | 'collateral'; address: string }> = [
      ...(input.target !== 'collateral' ? [{ role: 'index' as const, address: context.indexOracle }] : []),
      ...(input.target !== 'index' ? [{ role: 'collateral' as const, address: context.collateralOracle }] : []),
    ];
    const operations = [];
    for (const target of targets) {
      const before = await readMockOracleState(context.rpcUrl, target.address);
      const priceRaw = input.action === 'set-price'
        ? parseUnits(input.price!, before.decimals)
        : before.answer;
      if (priceRaw <= 0n) throw new Error(`${target.role} Oracle 价格必须大于 0。`);
      const timestamp = freshOracleTimestamp(before.latestBlockTimestamp);
      const receipt = await sendSetMockPrice({
        adminRpcUrl: context.adminRpcUrl,
        from,
        oracle: target.address,
        priceRaw,
        timestamp,
      });
      if (receipt.status !== 'success') {
        throw new Error(`${target.role} Oracle setMockPrice 交易回执失败：${receipt.txHash}`);
      }
      const after = await readMockOracleState(context.rpcUrl, target.address);
      operations.push({
        role: target.role,
        address: target.address,
        action: input.action,
        before: { priceRaw: before.answer.toString(), updatedAt: Number(before.updatedAt) },
        after: oracleView(target.role, after),
        txHash: receipt.txHash,
        blockNumber: receipt.blockNumber,
      });
    }
    return { environment: input.environment, bundleAlias: input.bundleAlias, operations };
  }
}

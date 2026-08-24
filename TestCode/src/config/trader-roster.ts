/**
 * 每用例专属 Trader 注入（E2E_TRADER_ASSIGNMENT=per-case）。
 *
 * 数据链路：`npm run traders:generate` 生成 100 个真实 EOA（私钥束
 * config/noise-traders.secret.json，0600、gitignore；公开地址册 noise-traders.json）→
 * `npm run traders:map` 按确定性规则（SCN-0NN → traderIndex NN；SCN-B32-0N → 80+N）
 * 生成 config/case-traders.json（只含地址与编号，入库）→ spec 顶部
 * `applyCaseTrader(loadRuntimeConfig(), 'SCN-0xx')` 覆盖 testAccount/testPrivateKey。
 *
 * 保密纪律：私钥只走「从文件加载 → 进签名器（runtime.testPrivateKey）」，
 * 本模块任何日志、错误消息、返回值元数据只允许出现地址与编号。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createPublicClient, encodeFunctionData, getAddress, http, maxUint256, parseAbi, parseUnits, toHex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';

import { loadDeploymentManifest } from './deployment.js';
import { loadEnvironmentInitializationProfile } from '../server/environment-initialization-profile.js';
import { isMockResourceEnvironment, loadMockResourceRegistry } from './mock-resources.js';
import type { RuntimeConfig } from './runtime.js';

export interface CaseTraderAssignment {
  readonly scenarioId: string;
  readonly traderIndex: number;
  readonly address: `0x${string}`;
  readonly label: string;
}

export interface CaseTraderMap {
  readonly generatedAt?: string;
  readonly rule?: string;
  readonly assignments: Record<string, CaseTraderAssignment>;
}

const assignmentSchema = z.object({
  scenarioId: z.string().regex(/^SCN-(?:\d{3}|B32-\d{2})$/),
  traderIndex: z.number().int().positive(),
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  label: z.string().min(1),
});

const caseTraderMapSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().optional(),
  rule: z.string().optional(),
  assignments: z.record(z.string(), assignmentSchema),
});

// 私钥束只解析签名所需的最小字段；对象绝不整体打印或返回。
const secretBundleSchema = z.object({
  wallets: z.array(z.object({
    index: z.number().int().positive(),
    address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    privateKey: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  })),
});

const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
]);

const warnedKeys = new Set<string>();

function warnOnce(key: string, message: string): void {
  if (warnedKeys.has(key)) return;
  warnedKeys.add(key);
  console.warn(message);
}

async function rpcCall(rpcUrl: string, method: string, params: readonly unknown[]): Promise<unknown> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json() as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message ?? 'unknown RPC error'}`);
  return body.result;
}

/** per-case 档案是否开启（E2E_TRADER_ASSIGNMENT=per-case）。 */
export function perCaseTraderEnabled(): boolean {
  return process.env.E2E_TRADER_ASSIGNMENT === 'per-case';
}

/** 读 config/case-traders.json；缺失或不合法返回 undefined（由调用方降级）。 */
export function loadCaseTraderMap(projectRoot: string = process.cwd()): CaseTraderMap | undefined {
  try {
    const parsed = caseTraderMapSchema.parse(
      JSON.parse(readFileSync(resolve(projectRoot, 'config/case-traders.json'), 'utf8')) as unknown,
    );
    return {
      ...(parsed.generatedAt ? { generatedAt: parsed.generatedAt } : {}),
      ...(parsed.rule ? { rule: parsed.rule } : {}),
      assignments: Object.fromEntries(Object.entries(parsed.assignments).map(([scenarioId, assignment]) => [
        scenarioId,
        { ...assignment, address: getAddress(assignment.address) as `0x${string}` },
      ])),
    };
  } catch {
    return undefined;
  }
}

/**
 * 从私钥束加载 assignment 对应 Trader 的私钥（仅进签名器，绝不落日志）。
 * 束文件缺失/不可解析 → undefined（调用方降级）；束里缺该编号或地址与映射不一致 → throw
 * （静默用错账户签名比失败更危险，错误消息只含地址与编号）。
 */
function loadTraderPrivateKey(
  projectRoot: string,
  assignment: CaseTraderAssignment,
): `0x${string}` | undefined {
  let bundle: z.infer<typeof secretBundleSchema>;
  try {
    bundle = secretBundleSchema.parse(
      JSON.parse(readFileSync(resolve(projectRoot, 'config/noise-traders.secret.json'), 'utf8')) as unknown,
    );
  } catch {
    return undefined;
  }
  const wallet = bundle.wallets.find((item) => item.index === assignment.traderIndex);
  if (!wallet) {
    throw new Error(
      `[trader-roster] 私钥束缺少 Trader${assignment.traderIndex}（${assignment.scenarioId}）；`
      + '花名册与映射不同批，请重跑 npm run traders:generate 与 npm run traders:map。',
    );
  }
  const derived = getAddress(privateKeyToAccount(wallet.privateKey as `0x${string}`).address);
  if (derived !== getAddress(assignment.address)) {
    throw new Error(
      `[trader-roster] ${assignment.scenarioId} 映射地址 ${assignment.address} 与私钥束 `
      + `Trader${assignment.traderIndex} 派生地址 ${derived} 不一致；请重跑 npm run traders:map（同批花名册）。`,
    );
  }
  return wallet.privateKey as `0x${string}`;
}

interface FundingContext {
  readonly adminRpcUrl: string;
  readonly client: ReturnType<typeof createPublicClient>;
  /** 与环境初始化 funding.nativeBalanceEth 同口径（wei）。 */
  readonly nativeTarget: bigint;
  /** 与 funding.traderCollateral 同口径（USDC 原始单位）；无登记 USDC 时缺省。 */
  readonly collateral?: { readonly token: `0x${string}`; readonly target: bigint };
  /** Router 地址（deployment manifest additionalContracts.router）：market-flow 的 sendTokens 经 Router 拉款，全新 trader 需要 USDC approve；缺省时跳过授权。 */
  readonly router?: `0x${string}`;
}

async function resolveFundingContext(
  runtime: RuntimeConfig,
  projectRoot: string,
): Promise<FundingContext | undefined> {
  if (!runtime.adminRpcUrl) {
    warnOnce('no-admin-rpc', `[trader-roster] 环境 ${runtime.environment} 未配置 admin RPC，跳过 per-case trader 注资（余额可能不足）。`);
    return undefined;
  }
  const profile = await loadEnvironmentInitializationProfile(projectRoot, runtime.environment);
  const nativeTarget = parseUnits(profile.funding.nativeBalanceEth, 18);
  let collateral: FundingContext['collateral'];
  if (isMockResourceEnvironment(runtime.environment)) {
    const resource = (await loadMockResourceRegistry()).resources[runtime.environment];
    const token = resource.sharedCollateral?.token ?? resource.collateralToken;
    if (token) {
      collateral = {
        token: getAddress(token.address) as `0x${string}`,
        target: parseUnits(profile.funding.traderCollateral, token.decimals),
      };
    } else {
      warnOnce('no-collateral-token', `[trader-roster] ${runtime.environment} 未登记共享 USDC（mock-resources.json），仅注资 ETH。`);
    }
  } else {
    warnOnce('no-mock-env', `[trader-roster] ${runtime.environment} 不是 Mock 资源环境，仅注资 ETH。`);
  }
  let router: `0x${string}` | undefined;
  try {
    const manifest = await loadDeploymentManifest(runtime.deploymentManifestPath);
    const routerAddress = manifest.additionalContracts.router;
    if (routerAddress) router = getAddress(routerAddress) as `0x${string}`;
    else warnOnce('no-router', '[trader-roster] deployment manifest 无 additionalContracts.router，跳过 USDC 授权（首单 sendTokens 可能因 allowance=0 revert）。');
  } catch (error) {
    warnOnce('no-manifest', `[trader-roster] 读取 deployment manifest 失败（${error instanceof Error ? error.message : String(error)}），跳过 USDC 授权。`);
  }
  return {
    adminRpcUrl: runtime.adminRpcUrl,
    client: createPublicClient({ transport: http(runtime.adminRpcUrl, { timeout: runtime.requestTimeoutMs }) }),
    nativeTarget,
    ...(collateral ? { collateral } : {}),
    ...(router ? { router } : {}),
  };
}

/** 幂等注资单个地址：先读余额、低于目标才用 cheatcode 补到目标；返回是否发生过补充。 */
async function fundAccount(context: FundingContext, address: `0x${string}`): Promise<boolean> {
  let topped = false;
  const nativeBalance = await context.client.getBalance({ address });
  if (nativeBalance < context.nativeTarget) {
    await rpcCall(context.adminRpcUrl, 'tenderly_setBalance', [[address], toHex(context.nativeTarget)]);
    topped = true;
  }
  if (context.collateral) {
    const balance = await context.client.readContract({
      address: context.collateral.token,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address],
    }) as bigint;
    if (balance < context.collateral.target) {
      await rpcCall(context.adminRpcUrl, 'tenderly_setErc20Balance', [
        context.collateral.token,
        address,
        toHex(context.collateral.target),
      ]);
      topped = true;
    }
    // Router 授权（与注资同受「必须在 evm_snapshot 之前」约束）：market-flow 的 exchangeRouter 多调
    // sendTokens 经 Router.pluginTransfer 从 trader 拉 USDC，全新 trader allowance=0 会 revert。
    // Tenderly admin RPC 允许任意 from 的 eth_sendTransaction（impersonation），无需动私钥。
    if (context.router) {
      const allowance = await context.client.readContract({
        address: context.collateral.token,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, context.router],
      }) as bigint;
      if (allowance < context.collateral.target) {
        const data = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [context.router, maxUint256] });
        const txHash = await rpcCall(context.adminRpcUrl, 'eth_sendTransaction', [
          { from: address, to: context.collateral.token, data },
        ]) as `0x${string}`;
        const receipt = await context.client.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });
        if (receipt.status !== 'success') throw new Error(`[trader-roster] ${address} USDC approve(Router) 回执失败：${txHash}`);
        topped = true;
      }
    }
  }
  return topped;
}

/**
 * 把 scenarioId 映射的专属 Trader 注入 RuntimeConfig（拷贝覆盖
 * testAccount / testPrivateKey / hasPrimaryTestWallet），并保证该地址已注资。
 *
 * 【硬性顺序约束】注资（tenderly_setBalance / tenderly_setErc20Balance）必须发生在调用方
 * 任何 evm_snapshot / 账本基线快照之前，因此本函数只应在 spec 顶部、紧跟 loadRuntimeConfig 调用：
 *   1) runner 以 snapshot 为基线并在结束时 evm_revert——注资若落在 snapshot 之后会被回滚，
 *      后续数据集 / 重跑会缺资金；
 *   2) 核对窗口内的带外余额写入会污染 traderUsdcDelta / ΣΔ 守恒断言（Expected Δ 不再成立）。
 *
 * 降级路径（console.warn 一次并原样返回，不影响默认档案行为）：
 *   未设 E2E_TRADER_ASSIGNMENT=per-case / E2E_TRADER_PROFILE=ui（前端观测档案优先，per-case 让位）/
 *   无 config/case-traders.json 映射 / 无私钥束。
 */
export async function applyCaseTrader(
  runtime: RuntimeConfig,
  scenarioId: string,
  projectRoot: string = process.cwd(),
): Promise<RuntimeConfig> {
  if (!perCaseTraderEnabled()) {
    warnOnce('disabled', '[trader-roster] E2E_TRADER_ASSIGNMENT 未设为 per-case，未启用每用例专属 Trader，沿用默认 trader 档案。');
    return runtime;
  }
  if (process.env.E2E_TRADER_PROFILE === 'ui') {
    warnOnce('ui-profile', '[trader-roster] E2E_TRADER_PROFILE=ui 为前端观测专用档案，per-case 注入让位，沿用 ui trader。');
    return runtime;
  }
  const map = loadCaseTraderMap(projectRoot);
  if (!map) {
    warnOnce('no-map', '[trader-roster] config/case-traders.json 缺失或不合法，per-case 注入未生效；先跑 npm run traders:map。');
    return runtime;
  }
  const assignment = map.assignments[scenarioId];
  if (!assignment) {
    warnOnce(`no-assignment:${scenarioId}`, `[trader-roster] case-traders.json 无 ${scenarioId} 映射，沿用默认 trader；请重跑 npm run traders:map。`);
    return runtime;
  }
  const privateKey = loadTraderPrivateKey(projectRoot, assignment);
  if (!privateKey) {
    warnOnce('no-secret', '[trader-roster] 私钥束 config/noise-traders.secret.json 缺失（仅本机文件），per-case 注入未生效；先跑 npm run traders:generate。');
    return runtime;
  }
  const address = getAddress(assignment.address) as `0x${string}`;
  const context = await resolveFundingContext(runtime, projectRoot);
  if (context) await fundAccount(context, address);
  return {
    ...runtime,
    testAccount: address,
    testPrivateKey: privateKey,
    hasPrimaryTestWallet: true,
  };
}

/**
 * 批量幂等注资一组场景映射到的 Trader 地址（地址去重后逐个「先读余额、低于目标才补」）。
 * 与 applyCaseTrader 相同的硬性顺序约束：必须在任何 evm_snapshot / 账本基线之前执行，
 * 否则注资会被 revert 回滚或污染核对窗口（原因见 applyCaseTrader 注释）。
 * 返回 funded=实际补过余额的地址数；skipped=余额已达标、地址重复、无映射或无法注资的条目数。
 */
export async function ensureCaseTradersFunded(
  runtime: RuntimeConfig,
  scenarioIds: readonly string[],
): Promise<{ funded: number; skipped: number }> {
  const map = loadCaseTraderMap();
  if (!map) {
    warnOnce('no-map', '[trader-roster] config/case-traders.json 缺失或不合法，批量注资跳过；先跑 npm run traders:map。');
    return { funded: 0, skipped: scenarioIds.length };
  }
  const context = await resolveFundingContext(runtime, process.cwd());
  const seenAddresses = new Set<string>();
  let funded = 0;
  let skipped = 0;
  for (const scenarioId of scenarioIds) {
    const assignment = map.assignments[scenarioId];
    if (!assignment) {
      warnOnce(`no-assignment:${scenarioId}`, `[trader-roster] case-traders.json 无 ${scenarioId} 映射，批量注资跳过该场景。`);
      skipped += 1;
      continue;
    }
    const address = getAddress(assignment.address) as `0x${string}`;
    if (seenAddresses.has(address) || !context) {
      skipped += 1;
      continue;
    }
    seenAddresses.add(address);
    if (await fundAccount(context, address)) funded += 1;
    else skipped += 1;
  }
  return { funded, skipped };
}

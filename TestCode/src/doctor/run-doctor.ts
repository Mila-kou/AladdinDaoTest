import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  createPublicClient,
  encodeAbiParameters,
  formatEther,
  formatUnits,
  getAddress,
  http,
  keccak256,
  parseAbi,
} from 'viem';

import {
  getDeploymentAddresses,
  loadDeploymentManifest,
} from '../config/deployment.js';
import { loadRuntimeConfig, maskUrl } from '../config/runtime.js';

interface DoctorCheck {
  readonly name: string;
  readonly status: 'PASS' | 'FAIL';
  readonly detail: string;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const accessControlAbi = parseAbi(['function hasRole(bytes32,address) view returns (bool)']);
const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
]);
const lpVaultAbi = parseAbi(['function totalAssets() view returns (uint256)']);

function roleHash(name: string): `0x${string}` {
  return keccak256(encodeAbiParameters([{ type: 'string' }], [name]));
}

async function rawRpc(
  url: string,
  method: string,
  params: readonly unknown[] = [],
): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json() as {
    result?: unknown;
    error?: { message?: string };
  };
  if (body.error) throw new Error(`${method}: ${body.error.message ?? 'unknown RPC error'}`);
  return body.result;
}

function redactError(error: unknown, secrets: ReadonlyArray<string | undefined>): string {
  let detail = String(error);
  for (const secret of secrets) {
    if (secret) {
      detail = detail.replaceAll(secret, '<redacted-rpc>');
    }
  }
  return detail;
}

async function checkPage(url: string, timeoutMs: number): Promise<DoctorCheck> {
  try {
    const response = await fetch(new URL('/trade', url), {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return {
      name: 'Trade 页面',
      status: response.ok ? 'PASS' : 'FAIL',
      detail: `HTTP ${response.status}`,
    };
  } catch (error) {
    return { name: 'Trade 页面', status: 'FAIL', detail: String(error) };
  }
}

export async function runDoctor(): Promise<number> {
  const checks: DoctorCheck[] = [];
  let runtime: ReturnType<typeof loadRuntimeConfig>;

  try {
    runtime = loadRuntimeConfig();
  } catch (error) {
    checks.push({ name: '运行配置', status: 'FAIL', detail: String(error) });
    console.table(checks);
    console.log('Doctor result: NOT READY (1)');
    return 1;
  }

  checks.push({
    name: '运行配置',
    status: 'PASS',
    detail: `${runtime.environment} / ${maskUrl(runtime.rpcUrl)}`,
  });
  checks.push(await checkPage(runtime.appBaseUrl, runtime.requestTimeoutMs));

  try {
    await access(runtime.deploymentManifestPath);
    const manifest = await loadDeploymentManifest(runtime.deploymentManifestPath);
    checks.push({
      name: 'Deployment manifest',
      status: 'PASS',
      detail: `${manifest.name} / ${manifest.release}`,
    });

    checks.push({
      name: 'Fork 起始区块',
      status: manifest.forkBlockNumber === '0' ? 'FAIL' : 'PASS',
      detail:
        manifest.forkBlockNumber === '0'
          ? '仍为示例值 0'
          : manifest.forkBlockNumber,
    });

    if (manifest.chainId !== runtime.chainId) {
      checks.push({
        name: 'Manifest chainId',
        status: 'FAIL',
        detail: `manifest=${manifest.chainId}, expected=${runtime.chainId}`,
      });
    } else {
      checks.push({ name: 'Manifest chainId', status: 'PASS', detail: String(runtime.chainId) });
    }

    for (const [name, address] of Object.entries(manifest.roles)) {
      checks.push({
        name: `role.${name}`,
        status: address.toLowerCase() === ZERO_ADDRESS ? 'FAIL' : 'PASS',
        detail: address.toLowerCase() === ZERO_ADDRESS ? '仍为示例零地址' : address,
      });
    }

    try {
      const client = createPublicClient({ transport: http(runtime.rpcUrl) });
      const [rpcChainId, blockNumber] = await Promise.all([
        client.getChainId(),
        client.getBlockNumber(),
      ]);

      checks.push({
        name: 'RPC chainId',
        status: rpcChainId === runtime.chainId ? 'PASS' : 'FAIL',
        detail: `rpc=${rpcChainId}, expected=${runtime.chainId}`,
      });
      checks.push({ name: 'RPC 最新区块', status: 'PASS', detail: blockNumber.toString() });

      for (const item of getDeploymentAddresses(manifest)) {
        if (item.address.toLowerCase() === ZERO_ADDRESS) {
          checks.push({ name: item.name, status: 'FAIL', detail: '仍为示例零地址' });
          continue;
        }

        try {
          const bytecode = await client.getBytecode({ address: getAddress(item.address) });
          checks.push({
            name: item.name,
            status: bytecode && bytecode !== '0x' ? 'PASS' : 'FAIL',
            detail: bytecode && bytecode !== '0x' ? 'bytecode found' : 'no bytecode',
          });
        } catch (error) {
          checks.push({
            name: item.name,
            status: 'FAIL',
            detail: redactError(error, [runtime.rpcUrl, runtime.adminRpcUrl]),
          });
        }
      }

      if (manifest.source) {
        for (const [name, path] of Object.entries(manifest.source)) {
          try {
            await access(resolveFromCwd(path));
            checks.push({ name: `source.${name}`, status: 'PASS', detail: path });
          } catch {
            checks.push({ name: `source.${name}`, status: 'FAIL', detail: `找不到 ${path}` });
          }
        }
      }

      if (runtime.testAccount) {
        const nativeBalance = await client.getBalance({ address: getAddress(runtime.testAccount) });
        checks.push({
          name: 'trader ETH',
          status: nativeBalance > 0n ? 'PASS' : 'FAIL',
          detail: `${formatEther(nativeBalance)} ETH`,
        });

        const usdc = manifest.additionalContracts.mockUsdc;
        const router = manifest.additionalContracts.router;
        if (usdc && router) {
          const [balance, allowance] = await Promise.all([
            client.readContract({
              address: getAddress(usdc), abi: erc20Abi, functionName: 'balanceOf',
              args: [getAddress(runtime.testAccount)],
            }),
            client.readContract({
              address: getAddress(usdc), abi: erc20Abi, functionName: 'allowance',
              args: [getAddress(runtime.testAccount), getAddress(router)],
            }),
          ]);
          checks.push({
            name: 'trader USDC',
            status: balance > 0n ? 'PASS' : 'FAIL',
            detail: `${formatUnits(balance, 6)} USDC`,
          });
          checks.push({
            name: 'USDC → Router 授权',
            status: allowance > 0n ? 'PASS' : 'FAIL',
            detail: allowance > 0n ? '已授权' : 'allowance=0',
          });
        }
      }

      if (runtime.keeperAccount) {
        const [nativeBalance, hasOrderKeeper] = await Promise.all([
          client.getBalance({ address: getAddress(runtime.keeperAccount) }),
          client.readContract({
            address: getAddress(manifest.contracts.dataStore),
            abi: accessControlAbi,
            functionName: 'hasRole',
            args: [roleHash('ORDER_KEEPER'), getAddress(runtime.keeperAccount)],
          }),
        ]);
        checks.push({
          name: 'keeper ETH',
          status: nativeBalance > 0n ? 'PASS' : 'FAIL',
          detail: `${formatEther(nativeBalance)} ETH`,
        });
        checks.push({
          name: 'keeper ORDER_KEEPER',
          status: hasOrderKeeper ? 'PASS' : 'FAIL',
          detail: hasOrderKeeper ? '角色已持有' : '缺少角色',
        });
      }

      const lpVault = manifest.additionalContracts.lpVault;
      if (lpVault) {
        const assets = await client.readContract({
          address: getAddress(lpVault), abi: lpVaultAbi, functionName: 'totalAssets',
        });
        checks.push({
          name: 'LP 流动性',
          status: assets > 0n ? 'PASS' : 'FAIL',
          detail: `${formatUnits(assets, 6)} USDC`,
        });
      }
    } catch (error) {
      checks.push({
        name: 'RPC 连接',
        status: 'FAIL',
        detail: redactError(error, [runtime.rpcUrl, runtime.adminRpcUrl]),
      });
    }
  } catch (error) {
    checks.push({ name: 'Deployment manifest', status: 'FAIL', detail: String(error) });
  }

  if (
    runtime.definition.requiresBaselineReset
    && runtime.forkResetMode === 'baseline'
    && !runtime.baselineId
  ) {
    checks.push({
      name: 'Fork baseline',
      status: 'FAIL',
      detail: '缺少 E2E_FORK_BASELINE_ID',
    });
  } else if (runtime.definition.requiresBaselineReset && runtime.forkResetMode === 'snapshot') {
    try {
      const snapshotId = await rawRpc(runtime.adminRpcUrl ?? runtime.rpcUrl, 'evm_snapshot');
      const reverted = await rawRpc(runtime.adminRpcUrl ?? runtime.rpcUrl, 'evm_revert', [snapshotId]);
      checks.push({
        name: 'Fork snapshot/reset',
        status: reverted === true ? 'PASS' : 'FAIL',
        detail: reverted === true ? 'evm_snapshot + evm_revert 可用' : 'evm_revert 未返回 true',
      });
    } catch (error) {
      checks.push({
        name: 'Fork snapshot/reset',
        status: 'FAIL',
        detail: redactError(error, [runtime.rpcUrl, runtime.adminRpcUrl]),
      });
    }
  } else {
    checks.push({ name: 'Fork baseline', status: 'PASS', detail: 'ready or not required' });
  }

  if (
    runtime.definition.permitsTransactions
    && runtime.signingMode === 'private-key'
    && !runtime.hasPrimaryTestWallet
  ) {
    checks.push({
      name: '测试钱包',
      status: 'FAIL',
      detail: '缺少 E2E_TEST_PRIVATE_KEY',
    });
  } else if (
    runtime.definition.permitsTransactions
    && runtime.signingMode === 'impersonation'
    && !runtime.testAccount
  ) {
    checks.push({
      name: '测试账户',
      status: 'FAIL',
      detail: 'impersonation 模式缺少 E2E_TEST_ACCOUNT',
    });
  } else {
    checks.push({
      name: '交易签名模式',
      status: 'PASS',
      detail: runtime.signingMode === 'impersonation'
        ? `impersonation / ${runtime.testAccount}`
        : 'private-key 已配置',
    });
  }

  if (runtime.keeperEnvFile) {
    try {
      await access(runtime.keeperEnvFile);
      checks.push({ name: 'Keeper 本地配置', status: 'PASS', detail: '文件存在（内容未读取/未输出）' });
    } catch {
      checks.push({ name: 'Keeper 本地配置', status: 'FAIL', detail: '配置文件不存在' });
    }
  }

  console.table(checks);
  const failures = checks.filter((check) => check.status === 'FAIL');
  console.log(`Doctor result: ${failures.length === 0 ? 'READY' : `NOT READY (${failures.length})`}`);
  return failures.length === 0 ? 0 : 1;
}

function resolveFromCwd(path: string): string {
  return resolve(process.cwd(), path);
}

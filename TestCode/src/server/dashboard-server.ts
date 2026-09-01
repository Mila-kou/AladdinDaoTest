import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import {
  applyDeletedRecords,
  deletedRecordsPath,
  readDeletedRecords,
} from '../reporting/latest-snapshot.js';
import {
  confirmableStatuses,
  loadReconciliationLedger,
  saveReconciliationLedger,
  type ReconciliationFieldStatus,
} from '../reporting/reconciliation-fields.js';
import { writeRunOutputs } from '../reporting/write-outputs.js';
import { baselineRegistryDisplayPath, targetRelease } from '../config/baseline.js';
import { validateTestRunArtifact, type TestRunArtifact } from '../reporting/schema.js';
import { saveTestCaseOverride } from '../reporting/test-case-overrides.js';
import { attachExecutions, loadTestCases, type TestCaseView } from '../reporting/test-cases.js';
import { listParameterEnvironments, queryParameters } from './parameter-query.js';
import { RunBatchManager } from './run-batches.js';
import { KeeperServiceManager } from './keeper-service.js';
import { TenderlyForkManager } from './tenderly-forks.js';
import {
  ContractDeploymentConflictError,
  ContractDeploymentManager,
} from './contract-deployments.js';
import { DefaultMarketSourceManager } from './default-market-source.js';
import { UsdcFundingManager } from './usdc-funding.js';
import { FaucetBalanceMonitor } from './faucet-monitor.js';
import { MockOraclePriceManager } from './mock-oracle-prices.js';
import { ParameterWriteManager } from './parameter-write.js';
import { NoiseTradeManager } from './noise-trades.js';
import { rosterToCsv } from '../domain/noise-plan.js';
import { FaucetAutoFundingManager } from './faucet-auto-funding.js';
import {
  checkEnvironmentConfiguration,
  readEnvironmentConfiguration,
  readTradeSiteTarget,
  saveEnvironmentConfiguration,
} from './environment-configuration.js';
import {
  readEnvironmentInitializationProfile,
  saveEnvironmentInitializationProfile,
} from './environment-initialization-profile.js';
import {
  environmentNames,
  type EnvironmentName,
} from '../../config/environments/catalog.js';

export interface DashboardServerOptions {
  readonly host: string;
  readonly port: number;
  readonly artifactDirectory: string;
  readonly projectRoot: string;
}

interface PackageMetadata {
  readonly name: string;
  readonly version: string;
}

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy':
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'self'; base-uri 'none'; frame-ancestors 'self'; form-action 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
} as const;

function send(
  response: ServerResponse,
  status: number,
  contentType: string,
  body: string | Buffer,
  headOnly = false,
): void {
  response.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(headOnly ? undefined : body);
}

function sendJson(response: ServerResponse, status: number, body: unknown, headOnly = false): void {
  send(
    response,
    status,
    'application/json; charset=utf-8',
    `${JSON.stringify(body, null, 2)}\n`,
    headOnly,
  );
}

function sendCompactJson(response: ServerResponse, status: number, body: unknown): void {
  send(response, status, 'application/json; charset=utf-8', JSON.stringify(body));
}

async function readArtifact(directory: string): Promise<TestRunArtifact> {
  const path = join(directory, 'results.json');
  return validateTestRunArtifact(JSON.parse(await readFile(path, 'utf8')) as unknown);
}

async function readPackageMetadata(projectRoot: string): Promise<PackageMetadata> {
  const parsed = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8')) as {
    name?: unknown;
    version?: unknown;
  };
  if (typeof parsed.name !== 'string' || typeof parsed.version !== 'string') {
    throw new Error('package.json 缺少 name 或 version。');
  }
  return { name: parsed.name, version: parsed.version };
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) throw new Error('请求内容超过 64KB。');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

async function readTestCaseViews(
  artifactDirectory: string,
  projectRoot: string,
): Promise<TestCaseView[]> {
  const artifact = await readArtifact(artifactDirectory);
  const catalogPath = resolve(projectRoot, artifact.source.catalogPath);
  const definitions = await loadTestCases(artifact.catalog, catalogPath);
  return attachExecutions(definitions, artifact.results);
}

function isSameOriginRequest(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (!origin || !request.headers.host) return false;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function parseEnvironment(value: string | null): EnvironmentName {
  if (!value || !environmentNames.includes(value as EnvironmentName)) {
    throw new Error('请选择有效的测试环境。');
  }
  return value as EnvironmentName;
}

export async function startDashboardServer(options: DashboardServerOptions) {
  const artifactDirectory = resolve(options.artifactDirectory);
  const projectRoot = resolve(options.projectRoot);

  // 启动即验证结果和项目版本，避免服务一个损坏或来源不明的看板。
  const [initialArtifact, packageMetadata] = await Promise.all([
    readArtifact(artifactDirectory),
    readPackageMetadata(projectRoot),
  ]);
  const runManager = await RunBatchManager.create({
    projectRoot,
    getCases: () => readTestCaseViews(artifactDirectory, projectRoot),
  });
  const keeperServiceManager = new KeeperServiceManager(projectRoot);
  const tenderlyForkManager = new TenderlyForkManager(projectRoot);
  const contractDeploymentManager = new ContractDeploymentManager(projectRoot);
  const defaultMarketSourceManager = new DefaultMarketSourceManager(projectRoot);
  const usdcFundingManager = new UsdcFundingManager(projectRoot);
  const faucetBalanceMonitor = new FaucetBalanceMonitor(projectRoot);
  const mockOraclePriceManager = new MockOraclePriceManager(projectRoot);
  const parameterWriteManager = new ParameterWriteManager(projectRoot);
  const noiseTradeManager = await NoiseTradeManager.create(projectRoot);
  const faucetAutoFundingManager = await FaucetAutoFundingManager.create(
    projectRoot,
    faucetBalanceMonitor,
    usdcFundingManager,
  );

  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const method = request.method ?? 'GET';
    const headOnly = method === 'HEAD';
    if (method !== 'GET' && method !== 'HEAD' && method !== 'PUT' && method !== 'POST') {
      sendJson(response, 405, { error: 'Method Not Allowed' }, headOnly);
      return;
    }

    const url = new URL(request.url ?? '/', `http://${options.host}:${options.port}`);

    try {
      const pageFiles: Record<string, string> = {
        '/': 'dashboard.html',
        '/index.html': 'dashboard.html',
        '/dashboard.html': 'dashboard.html',
        '/executions': 'executions.html',
        '/executions.html': 'executions.html',
        '/test-cases': 'test-cases.html',
        '/test-cases.html': 'test-cases.html',
        '/runs': 'runs.html',
        '/runs.html': 'runs.html',
        '/environments': 'environments.html',
        '/environments.html': 'environments.html',
        '/faucet': 'faucet.html',
        '/faucet.html': 'faucet.html',
        '/parameters': 'parameters.html',
        '/parameters.html': 'parameters.html',
        '/formulas': 'formulas.html',
        '/formulas.html': 'formulas.html',
        '/page-formulas': 'page-formulas.html',
        '/page-formulas.html': 'page-formulas.html',
        '/reconciliation-console': 'reconciliation-console.html',
        '/reconciliation-console.html': 'reconciliation-console.html',
      };
      const pageFile = pageFiles[url.pathname];
      if (pageFile) {
        if (method === 'PUT' || method === 'POST') {
          sendJson(response, 405, { error: 'Method Not Allowed' }, headOnly);
          return;
        }
        const html = await readFile(join(artifactDirectory, pageFile));
        send(response, 200, 'text/html; charset=utf-8', html, headOnly);
        return;
      }

      // 执行附件静态读取（停点截图 PNG / 证据 JSON）：只允许 attachments/ 目录内的单层文件名，防穿越。
      if (url.pathname.startsWith('/attachments/') && (method === 'GET' || method === 'HEAD')) {
        const fileName = decodeURIComponent(url.pathname.slice('/attachments/'.length));
        if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName.startsWith('.')) {
          sendJson(response, 404, { error: '附件不存在' }, headOnly);
          return;
        }
        const attachmentsDir = join(artifactDirectory, 'attachments');
        const filePath = resolve(attachmentsDir, fileName);
        if (!filePath.startsWith(resolve(attachmentsDir) + '/')) {
          sendJson(response, 404, { error: '附件不存在' }, headOnly);
          return;
        }
        let body: Buffer;
        try {
          body = await readFile(filePath);
        } catch {
          sendJson(response, 404, { error: `附件 ${fileName} 不存在` }, headOnly);
          return;
        }
        const contentType = fileName.endsWith('.png') ? 'image/png'
          : fileName.endsWith('.json') ? 'application/json; charset=utf-8'
            : 'application/octet-stream';
        send(response, 200, contentType, body, headOnly);
        return;
      }

      if (url.pathname === '/api/test-cases' && (method === 'GET' || method === 'HEAD')) {
        const cases = await readTestCaseViews(artifactDirectory, projectRoot);
        sendJson(response, 200, { cases }, headOnly);
        return;
      }

      if (url.pathname === '/api/environments' && (method === 'GET' || method === 'HEAD')) {
        sendJson(response, 200, { environments: await runManager.environmentProfiles() }, headOnly);
        return;
      }

      if (url.pathname === '/api/fund-usdc' && method === 'POST') {
        if (!isSameOriginRequest(request)) {
          sendJson(response, 403, { error: '仅允许同源测试看板执行 USDC Funding。' });
          return;
        }
        try {
          sendJson(response, 200, { funding: await usdcFundingManager.fund(await readJsonBody(request)) });
        } catch (error) {
          sendJson(response, 400, {
            error: 'USDC Funding 失败',
            detail: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (url.pathname === '/api/noise-traders') {
        if (method === 'GET' || method === 'HEAD') {
          sendJson(response, 200, await noiseTradeManager.loadRoster(), headOnly);
          return;
        }
        if (method === 'POST') {
          if (!isSameOriginRequest(request)) { sendJson(response, 403, { error: '仅允许同源测试看板生成 Trader 花名册。' }); return; }
          try {
            sendJson(response, 200, await noiseTradeManager.generateRoster(await readJsonBody(request).catch(() => ({}))));
          } catch (error) {
            sendJson(response, 400, { error: 'Trader 花名册生成失败', detail: error instanceof Error ? error.message : String(error) });
          }
          return;
        }
        sendJson(response, 405, { error: 'Method Not Allowed' }, headOnly);
        return;
      }
      if (url.pathname === '/api/noise-traders/wallets' && method === 'POST') {
        if (!isSameOriginRequest(request)) { sendJson(response, 403, { error: '仅允许同源测试看板生成 Trader 钱包。' }); return; }
        try {
          // 返回值绝不含私钥/助记词；私钥束仅落本机 config/noise-traders.secret.json（0600、gitignore）
          sendJson(response, 200, await noiseTradeManager.generateWallets(await readJsonBody(request).catch(() => ({}))));
        } catch (error) {
          sendJson(response, 400, { error: 'Trader 钱包生成失败', detail: error instanceof Error ? error.message : String(error) });
        }
        return;
      }
      if (url.pathname === '/api/noise-traders.csv' && (method === 'GET' || method === 'HEAD')) {
        const loaded = await noiseTradeManager.loadRoster();
        send(response, 200, 'text/csv; charset=utf-8', `${rosterToCsv(loaded.roster)}\n`, headOnly);
        return;
      }

      if (url.pathname === '/api/noise-plan') {
        if (method === 'GET' || method === 'HEAD') {
          const loaded = await noiseTradeManager.loadPlan();
          sendJson(response, 200, { ...loaded, presets: noiseTradeManager.presets() }, headOnly);
          return;
        }
        if (method === 'PUT') {
          if (!isSameOriginRequest(request)) { sendJson(response, 403, { error: '仅允许同源测试看板保存造数据计划。' }); return; }
          try {
            sendJson(response, 200, { plan: await noiseTradeManager.savePlan(await readJsonBody(request)), saved: true });
          } catch (error) {
            sendJson(response, 400, { error: '造数据计划保存失败', detail: error instanceof Error ? error.message : String(error) });
          }
          return;
        }
        if (method === 'POST') {
          // POST = 展开预览（不落盘、不上链）
          try {
            sendJson(response, 200, noiseTradeManager.preview(await readJsonBody(request)));
          } catch (error) {
            sendJson(response, 400, { error: '造数据计划展开失败', detail: error instanceof Error ? error.message : String(error) });
          }
          return;
        }
        sendJson(response, 405, { error: 'Method Not Allowed' }, headOnly);
        return;
      }

      if (url.pathname === '/api/noise-trades') {
        if (method === 'GET' || method === 'HEAD') {
          sendJson(response, 200, {
            jobs: noiseTradeManager.list(),
            configuredTraders: await noiseTradeManager.configuredTraders(),
          }, headOnly);
          return;
        }
        if (method === 'POST') {
          if (!isSameOriginRequest(request)) {
            sendJson(response, 403, { error: '仅允许同源测试看板启动模拟交易。' });
            return;
          }
          try {
            sendJson(response, 202, { job: await noiseTradeManager.start(await readJsonBody(request)) });
          } catch (error) {
            sendJson(response, 400, {
              error: '模拟交易任务创建失败',
              detail: error instanceof Error ? error.message : String(error),
            });
          }
          return;
        }
        sendJson(response, 405, { error: 'Method Not Allowed' }, headOnly);
        return;
      }
      const noiseJobMatch = /^\/api\/noise-trades\/([a-zA-Z0-9._-]+)$/.exec(url.pathname);
      if (noiseJobMatch && (method === 'GET' || method === 'HEAD')) {
        const job = noiseTradeManager.get(noiseJobMatch[1]!);
        if (!job) { sendJson(response, 404, { error: '模拟交易任务不存在。' }, headOnly); return; }
        sendJson(response, 200, { job }, headOnly);
        return;
      }

      if (url.pathname === '/api/parameters/set' && method === 'POST') {
        if (!isSameOriginRequest(request)) {
          sendJson(response, 403, { error: '仅允许同源测试看板写入参数。' });
          return;
        }
        try {
          sendJson(response, 200, { write: await parameterWriteManager.write(await readJsonBody(request)) });
        } catch (error) {
          sendJson(response, 400, {
            error: '参数写入失败',
            detail: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (url.pathname === '/api/mock-oracle-prices') {
        if (method === 'GET' || method === 'HEAD') {
          try {
            sendJson(response, 200, await mockOraclePriceManager.read({
              environment: url.searchParams.get('environment') ?? '',
              bundleAlias: url.searchParams.get('bundleAlias') ?? undefined,
            }), headOnly);
          } catch (error) {
            sendJson(response, 400, {
              error: 'Mock Oracle 价格读取失败',
              detail: error instanceof Error ? error.message : String(error),
            }, headOnly);
          }
          return;
        }
        if (method === 'POST') {
          if (!isSameOriginRequest(request)) {
            sendJson(response, 403, { error: '仅允许同源测试看板修改 Mock Oracle 价格。' });
            return;
          }
          try {
            sendJson(response, 200, await mockOraclePriceManager.update(await readJsonBody(request)));
          } catch (error) {
            sendJson(response, 400, {
              error: 'Mock Oracle 价格更新失败',
              detail: error instanceof Error ? error.message : String(error),
            });
          }
          return;
        }
        sendJson(response, 405, { error: 'Method Not Allowed' }, headOnly);
        return;
      }

      if (url.pathname === '/api/faucet-balance' && (method === 'GET' || method === 'HEAD')) {
        try {
          sendJson(response, 200, { faucet: await faucetBalanceMonitor.read() }, headOnly);
        } catch (error) {
          sendJson(response, 400, {
            error: 'Faucet 余额读取失败',
            detail: error instanceof Error ? error.message : String(error),
          }, headOnly);
        }
        return;
      }

      if (url.pathname === '/api/faucet-auto-funding') {
        if (method === 'GET' || method === 'HEAD') {
          sendJson(response, 200, { service: await faucetAutoFundingManager.status() }, headOnly);
          return;
        }
        if (method === 'PUT') {
          if (!isSameOriginRequest(request)) {
            sendJson(response, 403, { error: '仅允许同源测试看板配置 Faucet 自动打款服务。' });
            return;
          }
          try {
            sendJson(response, 200, {
              service: await faucetAutoFundingManager.update(await readJsonBody(request)),
            });
          } catch (error) {
            sendJson(response, 400, {
              error: 'Faucet 自动打款配置失败',
              detail: error instanceof Error ? error.message : String(error),
            });
          }
          return;
        }
      }

      if (url.pathname === '/api/faucet-auto-funding/run-now' && method === 'POST') {
        if (!isSameOriginRequest(request)) {
          sendJson(response, 403, { error: '仅允许同源测试看板触发 Faucet 检查。' });
          return;
        }
        try {
          await faucetAutoFundingManager.runNow();
          sendJson(response, 200, { service: await faucetAutoFundingManager.status() });
        } catch (error) {
          sendJson(response, 400, {
            error: 'Faucet 后台检查失败',
            detail: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (url.pathname === '/api/environment-configuration') {
        if (method === 'GET' || method === 'HEAD') {
          try {
            sendJson(response, 200, {
              configuration: await readEnvironmentConfiguration(
                projectRoot,
                parseEnvironment(url.searchParams.get('environment')),
              ),
            }, headOnly);
          } catch (error) {
            sendJson(response, 400, { error: '环境配置读取失败', detail: String(error) }, headOnly);
          }
          return;
        }
        if (method === 'PUT') {
          if (!isSameOriginRequest(request)) {
            sendJson(response, 403, { error: '仅允许同源看板页面保存环境配置。' });
            return;
          }
          try {
            sendJson(response, 200, {
              configuration: await saveEnvironmentConfiguration(projectRoot, await readJsonBody(request)),
            });
          } catch (error) {
            sendJson(response, 400, {
              error: '环境配置保存失败',
              detail: error instanceof Error ? error.message : String(error),
            });
          }
          return;
        }
      }

      if (url.pathname === '/api/environment-check' && (method === 'GET' || method === 'HEAD')) {
        try {
          sendJson(response, 200, {
            result: await checkEnvironmentConfiguration(
              projectRoot,
              parseEnvironment(url.searchParams.get('environment')),
            ),
          }, headOnly);
        } catch (error) {
          sendJson(response, 400, {
            error: '环境检查失败',
            detail: error instanceof Error ? error.message : String(error),
          }, headOnly);
        }
        return;
      }

      if (url.pathname === '/api/environment-initialization-profile') {
        if (method === 'GET' || method === 'HEAD') {
          try {
            sendJson(
              response,
              200,
              await readEnvironmentInitializationProfile(
                projectRoot,
                parseEnvironment(url.searchParams.get('environment')),
              ),
              headOnly,
            );
          } catch (error) {
            sendJson(response, 400, { error: '初始化配置读取失败', detail: String(error) }, headOnly);
          }
          return;
        }
        if (method === 'PUT') {
          if (!isSameOriginRequest(request)) {
            sendJson(response, 403, { error: '仅允许同源看板页面保存初始化配置。' });
            return;
          }
          try {
            sendJson(
              response,
              200,
              await saveEnvironmentInitializationProfile(projectRoot, await readJsonBody(request)),
            );
          } catch (error) {
            sendJson(response, 400, {
              error: '初始化配置保存失败',
              detail: error instanceof Error ? error.message : String(error),
            });
          }
          return;
        }
      }

      if (url.pathname === '/api/default-market-source') {
        if (method === 'GET' || method === 'HEAD') {
          try {
            sendJson(response, 200, await defaultMarketSourceManager.list({
              environment: parseEnvironment(url.searchParams.get('environment')),
            }), headOnly);
          } catch (error) {
            sendJson(response, 400, { error: '默认 Market 列表读取失败', detail: error instanceof Error ? error.message : String(error) }, headOnly);
          }
          return;
        }
        if (method === 'POST') {
          if (!isSameOriginRequest(request)) {
            sendJson(response, 403, { error: '仅允许同源看板页面复制 Market 配置。' });
            return;
          }
          try {
            sendJson(response, 200, await defaultMarketSourceManager.copy(await readJsonBody(request)));
          } catch (error) {
            sendJson(response, 400, { error: '默认 Market 参数复制失败', detail: error instanceof Error ? error.message : String(error) });
          }
          return;
        }
      }

      if (url.pathname === '/api/environment-initializations') {
        if (method === 'GET' || method === 'HEAD') {
          sendJson(
            response,
            200,
            { initializations: runManager.environmentInitializations() },
            headOnly,
          );
          return;
        }
        if (method === 'POST') {
          if (!isSameOriginRequest(request)) {
            sendJson(response, 403, { error: '仅允许同源看板页面初始化环境。' });
            return;
          }
          try {
            sendJson(response, 202, {
              initialization: await runManager.initializeEnvironment(await readJsonBody(request)),
            });
          } catch (error) {
            sendJson(response, 400, {
              error: '环境初始化创建失败',
              detail: error instanceof Error ? error.message : String(error),
            });
          }
          return;
        }
      }

      if (url.pathname === '/api/tenderly-forks' && method === 'GET') {
        sendJson(response, 200, { vnets: await tenderlyForkManager.list() });
        return;
      }

      if (url.pathname === '/api/tenderly-forks' && method === 'POST') {
        if (!isSameOriginRequest(request)) { sendJson(response, 403, { error: '仅允许同源看板页面创建 Tenderly Virtual TestNet。' }); return; }
        try { sendJson(response, 201, { fork: await tenderlyForkManager.create(await readJsonBody(request)) }); }
        catch (error) { sendJson(response, 400, { error: 'Tenderly Virtual TestNet 创建失败', detail: error instanceof Error ? error.message : String(error) }); }
        return;
      }

      if (url.pathname === '/api/tenderly-forks/delete' && method === 'POST') {
        if (!isSameOriginRequest(request)) { sendJson(response, 403, { error: '仅允许同源看板页面删除 Tenderly Virtual TestNet。' }); return; }
        try { sendJson(response, 200, { removed: await tenderlyForkManager.remove(await readJsonBody(request)) }); }
        catch (error) { sendJson(response, 400, { error: 'Tenderly Virtual TestNet 删除失败', detail: error instanceof Error ? error.message : String(error) }); }
        return;
      }

      // ② 部署合约：长任务模式照抄 environment-initializations（spawn 子进程 + 内存日志），
      // branches 是精确路径，必须放在 /:id 匹配之前。
      if (url.pathname === '/api/contract-deployments/branches' && (method === 'GET' || method === 'HEAD')) {
        try {
          sendJson(response, 200, { branches: await contractDeploymentManager.listBranches() }, headOnly);
        } catch (error) {
          sendJson(response, 400, {
            error: '合约分支列表读取失败',
            detail: error instanceof Error ? error.message : String(error),
          }, headOnly);
        }
        return;
      }

      if (url.pathname === '/api/contract-deployments') {
        if (method === 'GET' || method === 'HEAD') {
          sendJson(response, 200, { deployments: contractDeploymentManager.list() }, headOnly);
          return;
        }
        if (method === 'POST') {
          if (!isSameOriginRequest(request)) {
            sendJson(response, 403, { error: '仅允许同源看板页面发起合约部署。' });
            return;
          }
          try {
            const job = await contractDeploymentManager.create(await readJsonBody(request));
            sendJson(response, 202, { jobId: job.id, job });
          } catch (error) {
            if (error instanceof ContractDeploymentConflictError) {
              sendJson(response, 409, { error: '合约部署任务冲突', detail: error.message });
            } else {
              sendJson(response, 400, {
                error: '合约部署任务创建失败',
                detail: error instanceof Error ? error.message : String(error),
              });
            }
          }
          return;
        }
        sendJson(response, 405, { error: 'Method Not Allowed' }, headOnly);
        return;
      }

      const contractDeploymentMatch =
        /^\/api\/contract-deployments\/([a-zA-Z0-9._-]+)$/.exec(url.pathname);
      if (contractDeploymentMatch && (method === 'GET' || method === 'HEAD')) {
        const deployment = contractDeploymentManager.get(contractDeploymentMatch[1]!);
        if (!deployment) {
          sendJson(response, 404, { error: '合约部署任务不存在。' }, headOnly);
          return;
        }
        sendJson(response, 200, deployment, headOnly);
        return;
      }

      const environmentInitializationMatch =
        /^\/api\/environment-initializations\/([a-zA-Z0-9._-]+)$/.exec(url.pathname);
      if (environmentInitializationMatch && (method === 'GET' || method === 'HEAD')) {
        const initialization = runManager.environmentInitialization(environmentInitializationMatch[1]!);
        if (!initialization) {
          sendJson(response, 404, { error: '环境初始化任务不存在。' }, headOnly);
          return;
        }
        sendJson(response, 200, { initialization }, headOnly);
        return;
      }

      if (url.pathname === '/api/manual-check-target' && (method === 'GET' || method === 'HEAD')) {
        sendJson(response, 200, { target: await readTradeSiteTarget(projectRoot) }, headOnly);
        return;
      }

      if (url.pathname === '/api/run-batches') {
        if (method === 'GET' || method === 'HEAD') {
          sendJson(response, 200, {
            batches: runManager.list(),
            automatedScenarioIds: runManager.automatedScenarioIds(),
          }, headOnly);
          return;
        }
        if (method === 'POST') {
          if (!isSameOriginRequest(request)) {
            sendJson(response, 403, { error: '仅允许同源看板页面创建测试运行。' });
            return;
          }
          try {
            sendJson(response, 202, { batch: await runManager.createBatch(await readJsonBody(request)) });
          } catch (error) {
            sendJson(response, 400, {
              error: '测试运行创建失败',
              detail: error instanceof Error ? error.message : String(error),
            });
          }
          return;
        }
      }

      if (url.pathname === '/api/keeper-service' && method === 'POST') {
        if (!isSameOriginRequest(request)) {
          sendJson(response, 403, { error: '仅允许同源看板页面管理 Service Keeper。' });
          return;
        }
        try {
          sendJson(response, 200, { result: await keeperServiceManager.execute(await readJsonBody(request)) });
        } catch (error) {
          sendJson(response, 400, {
            error: 'Service Keeper 操作失败',
            detail: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      const manualActionMatch =
        /^\/api\/run-batches\/([a-zA-Z0-9._-]+)\/(manual-result|manual-start)$/.exec(url.pathname);
      if (manualActionMatch && method === 'PUT') {
        const isVerdict = manualActionMatch[2] === 'manual-result';
        if (!isSameOriginRequest(request)) {
          sendJson(response, 403, {
            error: isVerdict ? '仅允许同源看板页面回填人工核对结果。' : '仅允许同源看板页面记录人工执行。',
          });
          return;
        }
        const batchId = manualActionMatch[1]!;
        if (!runManager.get(batchId)) {
          sendJson(response, 404, { error: '运行批次不存在。' });
          return;
        }
        try {
          const body = await readJsonBody(request);
          sendJson(response, 200, {
            batch: isVerdict
              ? await runManager.recordManualVerdict(batchId, body)
              : await runManager.recordManualStart(batchId, body),
          });
        } catch (error) {
          sendJson(response, 400, {
            error: isVerdict ? '人工核对结果回填失败' : '人工执行开始时间记录失败',
            detail: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      const runBatchMatch = /^\/api\/run-batches\/([a-zA-Z0-9._-]+)$/.exec(url.pathname);
      if (runBatchMatch && (method === 'GET' || method === 'HEAD')) {
        const batch = runManager.get(runBatchMatch[1]!);
        if (!batch) {
          sendJson(response, 404, { error: '运行批次不存在。' }, headOnly);
          return;
        }
        sendJson(response, 200, { batch }, headOnly);
        return;
      }

      if (url.pathname === '/api/parameter-environments' && (method === 'GET' || method === 'HEAD')) {
        sendJson(
          response,
          200,
          { environments: listParameterEnvironments(projectRoot) },
          headOnly,
        );
        return;
      }

      if (url.pathname === '/api/parameters' && method === 'GET') {
        const environment = url.searchParams.get('environment') ?? '';
        const forceRefresh = url.searchParams.get('refresh') === '1';
        try {
          const result = await queryParameters(projectRoot, environment, { forceRefresh });
          sendCompactJson(response, 200, result);
        } catch (error) {
          sendJson(response, 400, {
            error: '合约参数查询失败',
            detail: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      const testCaseMatch = /^\/api\/test-cases\/(SCN-\d{3})$/.exec(url.pathname);
      if (testCaseMatch && method === 'PUT') {
        if (!isSameOriginRequest(request)) {
          sendJson(response, 403, { error: '仅允许同源页面保存测试用例。' });
          return;
        }
        try {
          const id = testCaseMatch[1]!;
          const currentCases = await readTestCaseViews(artifactDirectory, projectRoot);
          if (!currentCases.some((item) => item.id === id)) {
            sendJson(response, 404, { error: `测试用例不存在：${id}` });
            return;
          }
          await saveTestCaseOverride(id, await readJsonBody(request));
          const updatedCases = await readTestCaseViews(artifactDirectory, projectRoot);
          sendJson(response, 200, { case: updatedCases.find((item) => item.id === id) });
        } catch (error) {
          sendJson(response, 400, { error: '测试用例保存失败', detail: String(error) });
        }
        return;
      }

      if (url.pathname === '/api/reconciliation-fields' && (method === 'GET' || method === 'HEAD')) {
        const ledger = await loadReconciliationLedger(projectRoot);
        if (!ledger) {
          sendJson(response, 404, {
            error: '核对字段台账不存在',
            detail: '先运行 npx tsx scripts/seed-reconciliation-fields.ts 生成 config/reconciliation-fields.json。',
          }, headOnly);
          return;
        }
        sendJson(response, 200, { ledger }, headOnly);
        return;
      }

      if (url.pathname === '/api/reconciliation-fields/confirm' && method === 'POST') {
        if (!isSameOriginRequest(request)) {
          sendJson(response, 403, { error: '仅允许同源测试看板写回核对字段台账。' });
          return;
        }
        try {
          const body = (await readJsonBody(request) ?? {}) as {
            id?: unknown;
            status?: unknown;
            note?: unknown;
          };
          const id = typeof body.id === 'string' ? body.id : '';
          const status = typeof body.status === 'string' ? body.status : '';
          const note = typeof body.note === 'string' ? body.note : undefined;
          if (!/^[A-Za-z0-9._-]{1,80}$/.test(id)) {
            sendJson(response, 400, { error: '需要有效的台账行 id。' });
            return;
          }
          if (!confirmableStatuses.includes(status as ReconciliationFieldStatus)) {
            sendJson(response, 400, {
              error: `status 只允许 ${confirmableStatuses.join(' / ')}（implemented 由 seed 依据 results.json 覆盖判定）。`,
            });
            return;
          }
          if (note !== undefined && note.length > 500) {
            sendJson(response, 400, { error: 'note 最长 500 字符。' });
            return;
          }
          const ledger = await loadReconciliationLedger(projectRoot);
          if (!ledger) {
            sendJson(response, 404, {
              error: '核对字段台账不存在',
              detail: '先运行 npx tsx scripts/seed-reconciliation-fields.ts 生成 config/reconciliation-fields.json。',
            });
            return;
          }
          const target = ledger.rows.find((row) => row.id === id);
          if (!target) {
            sendJson(response, 404, { error: `台账中没有 id 为 ${id} 的字段行。` });
            return;
          }
          if (target.status === 'implemented') {
            sendJson(response, 409, {
              error: '该字段已由自动化核对覆盖（implemented），不接受手工改状态；如覆盖失效请重跑 seed。',
            });
            return;
          }
          const updated = {
            ...target,
            status: status as ReconciliationFieldStatus,
            note: note ?? target.note,
            updatedAt: new Date().toISOString(),
          };
          await saveReconciliationLedger(projectRoot, {
            ...ledger,
            rows: ledger.rows.map((row) => (row.id === id ? updated : row)),
          });
          sendJson(response, 200, { ok: true, row: updated });
        } catch (error) {
          sendJson(response, 400, {
            error: '核对字段台账写回失败',
            detail: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      if (url.pathname === '/api/execution-records/delete' && method === 'POST') {
        const body = (await readJsonBody(request) ?? {}) as { id?: unknown; project?: unknown };
        const id = typeof body.id === 'string' ? body.id : '';
        const project = typeof body.project === 'string' ? body.project : '';
        if (!/^SCN-\d{3}$/.test(id) || !project) {
          sendJson(response, 400, { error: '需要 id（SCN-xxx）与 project。' });
          return;
        }
        const artifact = await readArtifact(artifactDirectory);
        const matches = artifact.results.filter((item) => item.id === id && item.project === project);
        if (matches.length === 0) {
          sendJson(response, 404, { error: `latest 中没有 ${id}:${project} 的执行记录。` });
          return;
        }
        const deletedAt = new Date().toISOString();
        const records = await readDeletedRecords(projectRoot);
        records.push({
          id,
          project,
          deletedAt,
          note: `删除前状态 ${matches[0]!.status} · executedAt ${matches[0]!.executedAt}`,
        });
        const tombstonePath = deletedRecordsPath(projectRoot);
        await mkdir(dirname(tombstonePath), { recursive: true });
        await writeFile(tombstonePath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
        // 仅重写 latest 视图；artifacts/runs 历史档案不动，该场景未来的新执行会重新出现。
        await writeRunOutputs(applyDeletedRecords(artifact, records), artifactDirectory);
        sendJson(response, 200, { ok: true, id, project, deletedAt });
        return;
      }

      if (method === 'PUT' || method === 'POST') {
        sendJson(response, 405, { error: 'Method Not Allowed' });
        return;
      }

      if (url.pathname === '/api/results') {
        const artifact = await readArtifact(artifactDirectory);
        sendJson(response, 200, artifact, headOnly);
        return;
      }

      const transactionMatch = /^\/api\/transactions\/(0x[0-9a-fA-F]{64})$/.exec(url.pathname);
      if (transactionMatch) {
        const artifact = await readArtifact(artifactDirectory);
        const wanted = transactionMatch[1]!.toLowerCase();
        for (const result of artifact.results) {
          const transaction = result.executionEvidence?.transactions.find(
            (item) => item.txHash.toLowerCase() === wanted,
          );
          if (transaction) {
            sendJson(response, 200, {
              runId: artifact.run.id,
              scenario: { id: result.id, title: result.scenarioTitle, project: result.project },
              transaction,
              evidenceSource: result.executionEvidence?.sourcePath,
              note: 'Tenderly 私有 Fork 的本地持久证据；交易是否仍可由 RPC 查询取决于 Fork 是否被重置。',
            }, headOnly);
            return;
          }
        }
        sendJson(response, 404, { error: 'Transaction evidence not found' }, headOnly);
        return;
      }

      if (url.pathname === '/api/version') {
        const artifact = await readArtifact(artifactDirectory);
        sendJson(
          response,
          200,
          {
            service: 'fx100-e2e-dashboard',
            packageName: packageMetadata.name,
            version: packageMetadata.version,
            schemaVersion: artifact.schemaVersion,
            sourceStatus: artifact.sourceStatus,
            runId: artifact.run.id,
            release: artifact.run.release ?? null,
            releaseSource: artifact.run.releaseSource ?? null,
            targetRelease: artifact.run.targetRelease ?? null,
            releaseMismatch: artifact.run.releaseMismatch ?? null,
            currentTargetRelease: targetRelease()?.label ?? null,
            baselineRegistry: baselineRegistryDisplayPath(),
            generatedAt: artifact.source.generatedAt,
            catalogSize: artifact.catalog.length,
            resultCount: artifact.results.length,
            pages: ['/', '/executions', '/test-cases', '/runs', '/environments', '/faucet', '/parameters', '/formulas', '/page-formulas', '/reconciliation-console'],
            parameterApis: ['/api/parameter-environments', '/api/parameters?environment=tx-fork'],
            runApis: [
              '/api/environments',
              '/api/environment-initializations',
              '/api/contract-deployments',
              '/api/contract-deployments/branches',
              '/api/run-batches',
              '/api/run-batches/:id/manual-result',
              '/api/run-batches/:id/manual-start',
              '/api/keeper-service',
              '/api/fund-usdc',
              '/api/faucet-balance',
              '/api/faucet-auto-funding',
              '/api/faucet-auto-funding/run-now',
              '/api/mock-oracle-prices',
              '/api/parameters/set',
              '/api/noise-trades',
              '/api/noise-plan',
              '/api/noise-traders',
              '/api/manual-check-target',
              '/api/reconciliation-fields',
              '/api/reconciliation-fields/confirm',
            ],
            capabilities: {
              environmentInitialization: true,
              environmentConfiguration: true,
              contractDeployment: true,
              completeDefaultMockMarket: true,
              manualVerdictRecording: true,
              manualFrontendLink: true,
              serviceKeeperControl: true,
              usdcFunding: true,
              baseSepoliaFaucetMonitor: true,
              faucetAutoFunding: true,
              mockOraclePrices: true,
              parameterWrite: true,
              noiseTrades: true,
              telegramNotifications: true,
            },
          },
          headOnly,
        );
        return;
      }

      if (url.pathname === '/health') {
        const artifact = await readArtifact(artifactDirectory);
        sendJson(
          response,
          200,
          {
            status: 'ok',
            sourceStatus: artifact.sourceStatus,
            runId: artifact.run.id,
            generatedAt: artifact.source.generatedAt,
          },
          headOnly,
        );
        return;
      }

      if (url.pathname === '/summary.md') {
        const markdown = await readFile(join(artifactDirectory, 'summary.md'));
        send(response, 200, 'text/markdown; charset=utf-8', markdown, headOnly);
        return;
      }

      if (url.pathname === '/favicon.ico') {
        response.writeHead(204, SECURITY_HEADERS);
        response.end();
        return;
      }

      sendJson(response, 404, { error: 'Not Found' }, headOnly);
    } catch (error) {
      sendJson(response, 500, { error: 'Dashboard artifact unavailable', detail: String(error) }, headOnly);
    }
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(options.port, options.host, () => resolveListen());
  });

  return {
    server,
    artifactDirectory,
    initialArtifact,
    packageMetadata,
    runManager,
    url: `http://${options.host}:${options.port}/`,
  };
}

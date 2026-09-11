import { access, chmod, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import dotenv from 'dotenv';
import {
  createPublicClient,
  encodeAbiParameters,
  getAddress,
  http,
  keccak256,
  parseAbi,
  parseUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';

import {
  environmentNames,
  environments,
  type EnvironmentName,
} from '../../config/environments/catalog.js';
import {
  isCompleteDefaultMockResource,
  isMockResourceEnvironment,
  loadMockResourceRegistry,
} from '../config/mock-resources.js';
import {
  loadDeploymentManifest,
  parameterSnapshotCsvPath,
} from '../config/deployment.js';
import {
  assertRuntimeEnvironmentBinding,
  loadEnvironmentBinding,
} from '../config/environment-binding.js';
import { validateRpcUrl } from './environment-settings.js';
import { loadEnvironmentInitializationProfile } from './environment-initialization-profile.js';

type FieldType = 'text' | 'url' | 'number' | 'select' | 'checkbox' | 'path' | 'secret';
type CheckStatus = 'PASS' | 'FAIL' | 'WARN';

interface FieldSpec {
  readonly key: string;
  readonly label: string;
  readonly section: string;
  readonly type: FieldType;
  readonly help: string;
  readonly required?: boolean;
  readonly options?: readonly string[];
  readonly secret?: boolean;
  readonly validation?: 'address' | 'private-key' | 'http-url' | 'wss-url' | 'positive-integer' | 'telegram-bot-token' | 'telegram-chat-id';
}

export interface EnvironmentConfigurationField {
  readonly key: string;
  readonly label: string;
  readonly section: string;
  readonly type: FieldType;
  readonly help: string;
  readonly required: boolean;
  readonly configured: boolean;
  readonly value?: string;
  readonly options?: readonly string[];
  readonly secret: boolean;
}

export interface EnvironmentConfigurationSnapshot {
  readonly environment: EnvironmentName;
  readonly sections: ReadonlyArray<{ readonly id: string; readonly label: string; readonly description: string }>;
  readonly fields: readonly EnvironmentConfigurationField[];
  readonly capabilities: {
    readonly permitsTransactions: boolean;
    readonly permitsOracleMutation: boolean;
    readonly permitsTimeTravel: boolean;
    readonly initializesDefaultMockResources: boolean;
  };
}

export interface EnvironmentCheck {
  readonly id: string;
  readonly label: string;
  readonly status: CheckStatus;
  readonly detail: string;
}

export interface EnvironmentCheckResult {
  readonly environment: EnvironmentName;
  readonly checkedAt: string;
  readonly status: 'READY' | 'NOT_READY';
  readonly checks: readonly EnvironmentCheck[];
}

const sections = [
  { id: 'trade', label: 'Trade 与基础配置', description: '被测页面、链、部署版本和超时设置。' },
  { id: 'rpc', label: '环境 RPC', description: '当前环境的主 RPC 与可选 Admin RPC；页面显示完整地址。' },
  { id: 'accounts', label: 'Trader、Keeper 与 Admin', description: '测试角色、签名模式和本机密钥状态。' },
  { id: 'fork', label: 'Fork 与 Keeper', description: '快照、Baseline、Keeper 文件及 Tenderly 配置。' },
  { id: 'sources', label: '高级：Case 与看板数据源', description: '测试用例、参数、公式和覆盖层文件路径。' },
] as const;

const commonFields: readonly FieldSpec[] = [
  { key: 'E2E_APP_BASE_URL', label: 'Trade 站点地址', section: 'trade', type: 'url', help: '填写站点根地址，检查时自动访问 /trade。', required: true, validation: 'http-url' },
  { key: 'E2E_REQUEST_TIMEOUT_MS', label: '请求超时（毫秒）', section: 'trade', type: 'number', help: 'Trade、RPC 与链上读取的单次超时。', required: true, validation: 'positive-integer' },
  { key: 'E2E_RELEASE', label: '默认 Release', section: 'trade', type: 'text', help: '运行记录使用的默认版本名称。' },
  { key: 'E2E_FORK_DISPLAY_NAME', label: 'Fork 显示名称', section: 'trade', type: 'text', help: '留空时从 RPC 地址自动推导。' },

  { key: 'E2E_SIGNING_MODE', label: '签名模式', section: 'accounts', type: 'select', help: '真实签名证据使用 private-key；普通私有 Fork 可使用 impersonation。', required: true, options: ['private-key', 'impersonation'] },
  { key: 'E2E_TEST_ACCOUNT', label: 'Trader 地址', section: 'accounts', type: 'text', help: '发起订单的测试账户。', validation: 'address' },
  { key: 'E2E_KEEPER_ACCOUNT', label: 'Keeper 地址', section: 'accounts', type: 'text', help: '执行订单并持有 ORDER_KEEPER 角色。', validation: 'address' },
  { key: 'E2E_ADMIN_ACCOUNT', label: 'Admin 地址', section: 'accounts', type: 'text', help: '修改 Oracle/配置并持有 CONTROLLER 角色。', validation: 'address' },
  { key: 'E2E_NOISE_TRADER_ACCOUNTS', label: '模拟交易 Trader 列表', section: 'accounts', type: 'text', help: '逗号分隔的地址（fork 上 impersonation 免私钥）。供 env:noise:trades 铺底模拟交易，使环境数据更复杂：双侧 OI、Skew、Funding、多仓并存；这些交易不做核验。' },
  { key: 'E2E_TEST_PRIVATE_KEY', label: 'Trader 私钥', section: 'accounts', type: 'secret', help: '已有值不会回显；留空保持不变。', secret: true, validation: 'private-key' },
  { key: 'E2E_SECONDARY_TEST_PRIVATE_KEY', label: 'Keeper 私钥', section: 'accounts', type: 'secret', help: '已有值不会回显；也可从 Keeper 配置文件读取。', secret: true, validation: 'private-key' },
  { key: 'E2E_TOKEN_OWNER_PRIVATE_KEY', label: 'Token Owner 私钥', section: 'accounts', type: 'secret', help: '仅 Base Sepolia Fund USDC 使用：必须匹配链上 Mock USDC 的 owner()，用于发送真实 mint 交易；不会回显或写入报告。', secret: true, validation: 'private-key' },

  { key: 'E2E_FORK_RESET_MODE', label: 'Fork 重置模式', section: 'fork', type: 'select', help: 'snapshot 每次动态快照；baseline 使用固定 ID。', required: true, options: ['snapshot', 'baseline'] },
  { key: 'E2E_FORK_BASELINE_ID', label: 'Fork Baseline ID', section: 'fork', type: 'text', help: '仅 baseline 模式需要。' },
  { key: 'E2E_PERSIST_FORK_STATE', label: '保留 Fork 状态', section: 'fork', type: 'checkbox', help: '仅用于需要保留真实签名证据的运行。' },
  { key: 'E2E_KEEPER_ENV_FILE', label: 'Keeper 配置文件', section: 'fork', type: 'path', help: '本机 Keeper .env 路径；内容不会复制进看板。' },
  { key: 'E2E_TENDERLY_ACCESS_TOKEN', label: 'Tenderly Access Token', section: 'fork', type: 'secret', help: '已有值不会回显；留空保持不变。', secret: true },

  { key: 'E2E_SCENARIO_CATALOG', label: '场景目录', section: 'sources', type: 'path', help: 'SCENARIO-CHECKLIST.md 路径。' },
  { key: 'E2E_SCENARIO_DETAILS_DIR', label: '场景明细目录', section: 'sources', type: 'path', help: 'S01–S08 Markdown 文件目录。' },
  { key: 'E2E_CONTRACT_FORMULAS_SOURCE', label: '合约公式来源', section: 'sources', type: 'path', help: '核心字段计算公式 Markdown。' },
  { key: 'E2E_PAGE_FORMULAS_SOURCE', label: '页面公式来源', section: 'sources', type: 'path', help: '页面数据计算公式 Markdown。' },
  { key: 'E2E_TEST_CASE_OVERRIDES', label: 'Case 覆盖层', section: 'sources', type: 'path', help: '看板编辑测试用例时写入的 JSON 文件。' },
];

const baseSepoliaMonitoringFields: readonly FieldSpec[] = [
  {
    key: 'E2E_TELEGRAM_BOT_TOKEN',
    label: 'Telegram Bot Token',
    section: 'accounts',
    type: 'secret',
    help: 'Base Sepolia Faucet 低余额、自动补款成功或失败通知；不会回显或写入报告。',
    secret: true,
    validation: 'telegram-bot-token',
  },
  {
    key: 'E2E_TELEGRAM_CHAT_ID',
    label: 'Telegram Chat ID',
    section: 'accounts',
    type: 'text',
    help: '接收 Faucet 告警的个人或群组 Chat ID；群组 ID 通常为负数。',
    validation: 'telegram-chat-id',
  },
];

const saveSchema = z.object({
  environment: z.enum(environmentNames),
  values: z.record(z.string(), z.string()).default({}),
  clearKeys: z.array(z.string()).default([]),
});

async function parseFile(path: string): Promise<Record<string, string>> {
  try {
    return dotenv.parse(await readFile(path, 'utf8'));
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code === 'ENOENT') return {};
    throw error;
  }
}

function fieldsFor(environment: EnvironmentName): readonly FieldSpec[] {
  const definition = environments[environment];
  const chainIdHint: Record<EnvironmentName, string> = {
    'dev-readonly': 'dev-readonly 请填写其实际 RPC 返回的 Chain ID。',
    'tx-fork': '建议固定编号：tx-fork = 99911。切换到该 Fork 时请填写 99911，并确保 RPC 的 eth_chainId 也返回 99911。',
    'oracle-fork': '建议固定编号：oracle-fork = 99912。切换到该 Fork 时请填写 99912，并确保 RPC 的 eth_chainId 也返回 99912。',
    'time-fork': '建议固定编号：time-fork = 99913。切换到该 Fork 时请填写 99913，并确保 RPC 的 eth_chainId 也返回 99913。',
    'base-sepolia': 'Base Sepolia 的 Chain ID 为 84532。',
  };
  const chainIdField: FieldSpec = {
    key: definition.chainIdEnvironmentVariable ?? 'E2E_CHAIN_ID',
    label: '固定 Chain ID',
    section: 'trade',
    type: 'number',
    help: `该环境/Fork 的固定 Chain ID。${chainIdHint[environment]} 创建运行前会与 RPC 的 eth_chainId 强制核对；旧 E2E_CHAIN_ID 仅作兼容回退。`,
    required: true,
    validation: 'positive-integer',
  };
  const rpcFields: FieldSpec[] = [{
    key: definition.rpcEnvironmentVariable,
    label: '主 RPC',
    section: 'rpc',
    type: 'url',
    help: `${environment} 的 JSON-RPC 完整端点。`,
    required: true,
    validation: 'http-url',
  }];
  if (definition.adminRpcEnvironmentVariable) {
    rpcFields.push({
      key: definition.adminRpcEnvironmentVariable,
      label: 'Admin RPC',
      section: 'rpc',
      type: 'url',
      help: '用于快照、Oracle 或时间控制；可以与主 RPC 相同。',
      required: definition.permitsOracleMutation || definition.permitsTimeTravel,
      validation: 'http-url',
    });
  }
  if (definition.wssEnvironmentVariable) {
    rpcFields.push({ key: definition.wssEnvironmentVariable, label: 'WSS RPC', section: 'rpc', type: 'url', help: 'Tenderly Fork 创建后自动回填；用于订阅区块与事件。', validation: 'wss-url' });
  }
  const fields = [
    ...commonFields.slice(0, 1),
    chainIdField,
    ...commonFields.slice(1, 4),
    ...rpcFields,
    ...commonFields.slice(4),
  ];
  // Base Sepolia 使用已部署合约，不提供 Fork 重置、Keeper 文件或 Tenderly 初始化配置。
  return environment === 'base-sepolia'
    ? [...fields.filter((field) => field.section !== 'fork' && ![
      'E2E_FORK_DISPLAY_NAME',
      'E2E_KEEPER_ACCOUNT',
      'E2E_SECONDARY_TEST_PRIVATE_KEY',
    ].includes(field.key)), ...baseSepoliaMonitoringFields]
    : fields;
}

async function effectiveValues(projectRoot: string): Promise<Record<string, string>> {
  const [local, defaults] = await Promise.all([
    parseFile(join(projectRoot, '.env.local')),
    parseFile(join(projectRoot, '.env')),
  ]);
  return { ...Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  ), ...defaults, ...local };
}

function replaceValue(source: string, key: string, value: string): string {
  const line = `${key}=${JSON.stringify(value)}`;
  const expression = new RegExp(`^${key}=.*$`, 'm');
  if (expression.test(source)) return source.replace(expression, line);
  const prefix = source.length === 0 || source.endsWith('\n') ? source : `${source}\n`;
  return `${prefix}${line}\n`;
}

function normalize(spec: FieldSpec, rawValue: string): string {
  const value = rawValue.trim();
  if (!value) return '';
  if (value.length > 4_000) throw new Error(`${spec.label} 内容过长。`);
  if (spec.validation === 'http-url') return validateRpcUrl(value);
  if (spec.validation === 'wss-url') {
    const url = new URL(value);
    if (url.protocol !== 'wss:') throw new Error(`${spec.label} 必须以 wss:// 开头。`);
    if (url.username || url.password) throw new Error(`${spec.label} 不能使用 URL 用户名或密码。`);
    return url.href;
  }
  if (spec.validation === 'positive-integer') {
    const number = Number(value);
    if (!Number.isInteger(number) || number <= 0) throw new Error(`${spec.label} 必须是正整数。`);
    return String(number);
  }
  if (spec.validation === 'address' && !/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new Error(`${spec.label} 必须是 0x 开头的 40 字节十六进制地址。`);
  }
  if (spec.validation === 'private-key' && !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${spec.label} 必须是 0x 开头的 32 字节私钥。`);
  }
  if (spec.validation === 'telegram-bot-token' && !/^\d{5,20}:[A-Za-z0-9_-]{20,}$/.test(value)) {
    throw new Error(`${spec.label} 格式不正确。`);
  }
  if (spec.validation === 'telegram-chat-id' && !/^-?\d{1,20}$/.test(value)) {
    throw new Error(`${spec.label} 必须是数字 Chat ID。`);
  }
  if (spec.type === 'select' && !spec.options?.includes(value)) {
    throw new Error(`${spec.label} 的取值不受支持。`);
  }
  if (spec.type === 'checkbox' && !['true', 'false'].includes(value)) {
    throw new Error(`${spec.label} 必须是 true 或 false。`);
  }
  if (spec.type === 'url') {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${spec.label} 只允许 http 或 https。`);
    return url.href;
  }
  return value;
}

export async function readEnvironmentConfiguration(
  projectRoot: string,
  environment: EnvironmentName,
): Promise<EnvironmentConfigurationSnapshot> {
  const values = await effectiveValues(projectRoot);
  const definition = environments[environment];
  const visibleSections = environment === 'base-sepolia'
    ? sections.filter((section) => section.id !== 'fork').map((section) => section.id === 'accounts'
      ? { ...section, label: 'Trader、Admin 与通知', description: '已有部署的交易账户、Admin、签名、Token Owner 与 Telegram 通知状态。' }
      : section)
    : sections;
  return {
    environment,
    sections: visibleSections,
    fields: fieldsFor(environment).map((spec) => {
      const value = values[spec.key]?.trim() ?? '';
      return {
        key: spec.key,
        label: spec.label,
        section: spec.section,
        type: spec.type,
        help: spec.help,
        required: spec.required ?? false,
        configured: Boolean(value),
        ...(spec.options ? { options: spec.options } : {}),
        secret: spec.secret ?? false,
        ...(!spec.secret ? { value } : {}),
      };
    }),
    capabilities: {
      permitsTransactions: definition.permitsTransactions,
      permitsOracleMutation: definition.permitsOracleMutation,
      permitsTimeTravel: definition.permitsTimeTravel,
      initializesDefaultMockResources: definition.initializesDefaultMockResources,
    },
  };
}

export interface TradeSiteTarget {
  readonly key: 'E2E_APP_BASE_URL';
  readonly appBaseUrl: string;
  readonly tradeUrl: string;
  readonly configured: boolean;
}

const emptyTradeSiteTarget: TradeSiteTarget = {
  key: 'E2E_APP_BASE_URL',
  appBaseUrl: '',
  tradeUrl: '',
  configured: false,
};

/**
 * 手工核对清单要打开的被测前端地址，直接复用测试环境已有的 Trade 站点地址（E2E_APP_BASE_URL），
 * 不另存一份：编辑仍在测试环境页面，这里只读。/trade 与环境检查保持同一口径。
 */
export async function readTradeSiteTarget(projectRoot: string): Promise<TradeSiteTarget> {
  const values = await effectiveValues(projectRoot);
  const raw = values.E2E_APP_BASE_URL?.trim();
  if (!raw) return emptyTradeSiteTarget;
  try {
    const base = new URL(raw);
    // 配置里写了 javascript: 之类的伪协议时按未配置处理，页面拿不到一个点了会执行脚本的链接。
    if (!['http:', 'https:'].includes(base.protocol)) return emptyTradeSiteTarget;
    return {
      key: 'E2E_APP_BASE_URL',
      appBaseUrl: base.href,
      tradeUrl: new URL('/trade', base).href,
      configured: true,
    };
  } catch {
    return emptyTradeSiteTarget;
  }
}

export interface FundingSignerCandidate {
  readonly source: 'E2E_TOKEN_OWNER_PRIVATE_KEY' | 'E2E_TEST_PRIVATE_KEY' | 'E2E_SECONDARY_TEST_PRIVATE_KEY';
  readonly privateKey: `0x${string}`;
}

/**
 * 只供本机 Funding 服务选择链上 MockToken owner 签名人使用。
 * 候选值绝不通过环境 API 或报告返回；真正发送前还必须与 token.owner() 一致。
 */
export async function readFundingSignerCandidates(projectRoot: string): Promise<readonly FundingSignerCandidate[]> {
  const values = await effectiveValues(projectRoot);
  const keys = [
    'E2E_TOKEN_OWNER_PRIVATE_KEY',
    'E2E_TEST_PRIVATE_KEY',
    'E2E_SECONDARY_TEST_PRIVATE_KEY',
  ] as const;
  return keys.flatMap((source) => {
    const privateKey = values[source]?.trim();
    return privateKey && /^0x[0-9a-fA-F]{64}$/.test(privateKey)
      ? [{ source, privateKey: privateKey as `0x${string}` }]
      : [];
  });
}

export interface TelegramNotificationConfiguration {
  readonly botToken?: string;
  readonly chatId?: string;
  readonly configured: boolean;
}

/** Telegram 凭证只供本机后台通知服务使用，不通过看板 API 返回具体值。 */
export async function readTelegramNotificationConfiguration(
  projectRoot: string,
): Promise<TelegramNotificationConfiguration> {
  const values = await effectiveValues(projectRoot);
  const botToken = values.E2E_TELEGRAM_BOT_TOKEN?.trim();
  const chatId = values.E2E_TELEGRAM_CHAT_ID?.trim();
  return {
    ...(botToken ? { botToken } : {}),
    ...(chatId ? { chatId } : {}),
    configured: Boolean(
      botToken
      && chatId
      && /^\d{5,20}:[A-Za-z0-9_-]{20,}$/.test(botToken)
      && /^-?\d{1,20}$/.test(chatId),
    ),
  };
}

export async function saveEnvironmentConfiguration(
  projectRoot: string,
  rawInput: unknown,
): Promise<EnvironmentConfigurationSnapshot> {
  const input = saveSchema.parse(rawInput);
  const specs = fieldsFor(input.environment);
  const byKey = new Map(specs.map((spec) => [spec.key, spec]));
  const updates = new Map<string, string>([['E2E_ENV', input.environment]]);
  for (const [key, rawValue] of Object.entries(input.values)) {
    const spec = byKey.get(key);
    if (!spec) throw new Error(`不允许保存未知配置项：${key}`);
    if (spec.secret && !rawValue.trim()) continue;
    updates.set(key, normalize(spec, rawValue));
  }
  for (const key of input.clearKeys) {
    const spec = byKey.get(key);
    if (!spec?.secret) throw new Error(`只能显式清除敏感配置项：${key}`);
    updates.set(key, '');
  }

  const path = join(projectRoot, '.env.local');
  let source = '';
  try {
    source = await readFile(path, 'utf8');
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    if (code !== 'ENOENT') throw error;
  }
  for (const [key, value] of updates) source = replaceValue(source, key, value);
  const temporaryPath = `${path}.tmp-${process.pid}`;
  await writeFile(temporaryPath, source, { encoding: 'utf8', mode: 0o600 });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, path);
  await chmod(path, 0o600);
  for (const [key, value] of updates) {
    if (value) process.env[key] = value;
    else delete process.env[key];
  }
  return readEnvironmentConfiguration(projectRoot, input.environment);
}

function roleHash(name: string): `0x${string}` {
  return keccak256(encodeAbiParameters([{ type: 'string' }], [name]));
}

function safeDetail(error: unknown, secrets: readonly string[]): string {
  let detail = error instanceof Error ? error.message : String(error);
  for (const secret of secrets) if (secret) detail = detail.replaceAll(secret, '[已隐藏]');
  return detail.replace(/https?:\/\/[^\s"']+\.rpc\.tenderly\.co\/[^\s"']+/gi, '[RPC 已隐藏]');
}

async function rpcCall(url: string, method: string): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json() as { result?: unknown; error?: { message?: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message ?? 'unknown RPC error'}`);
  return body.result;
}

export async function checkEnvironmentConfiguration(
  projectRoot: string,
  environment: EnvironmentName,
): Promise<EnvironmentCheckResult> {
  const values = await effectiveValues(projectRoot);
  const definition = environments[environment];
  const checks: EnvironmentCheck[] = [];
  const push = (id: string, label: string, status: CheckStatus, detail: string) => {
    checks.push({ id, label, status, detail });
  };
  const rpcUrl = values[definition.rpcEnvironmentVariable]?.trim();
  const adminRpcUrl = definition.adminRpcEnvironmentVariable
    ? values[definition.adminRpcEnvironmentVariable]?.trim()
    : undefined;
  // Fork 可覆盖 Base Sepolia 的全局兼容值；检查、运行时与看板使用同一优先级。
  const expectedChainId = Number(
    (definition.chainIdEnvironmentVariable ? values[definition.chainIdEnvironmentVariable] : undefined)
      ?? values.E2E_CHAIN_ID,
  );
  const sensitive = [
    rpcUrl ?? '', adminRpcUrl ?? '', values.E2E_TEST_PRIVATE_KEY ?? '',
    values.E2E_SECONDARY_TEST_PRIVATE_KEY ?? '', values.E2E_TOKEN_OWNER_PRIVATE_KEY ?? '',
    values.E2E_TENDERLY_ACCESS_TOKEN ?? '',
  ];

  const appBaseUrl = values.E2E_APP_BASE_URL?.trim();
  if (!appBaseUrl) {
    push('trade', 'Trade 页面', 'FAIL', 'E2E_APP_BASE_URL 未配置。');
  } else {
    try {
      const response = await fetch(new URL('/trade', appBaseUrl), {
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
      });
      push('trade', 'Trade 页面', response.ok ? 'PASS' : 'FAIL', `HTTP ${response.status}`);
    } catch (error) {
      push('trade', 'Trade 页面', 'FAIL', safeDetail(error, sensitive));
    }
  }

  let rpcReady = false;
  if (!rpcUrl) {
    push('rpc', '主 RPC', 'FAIL', `${definition.rpcEnvironmentVariable} 未配置。`);
  } else {
    try {
      const [chainRaw, blockRaw] = await Promise.all([
        rpcCall(rpcUrl, 'eth_chainId'),
        rpcCall(rpcUrl, 'eth_blockNumber'),
      ]);
      const chainId = Number(BigInt(String(chainRaw)));
      rpcReady = chainId === expectedChainId;
      push('rpc', '主 RPC', rpcReady ? 'PASS' : 'FAIL', `chainId=${chainId}，期望=${expectedChainId}，block=${BigInt(String(blockRaw))}`);
    } catch (error) {
      push('rpc', '主 RPC', 'FAIL', safeDetail(error, sensitive));
    }
  }
  if (definition.adminRpcEnvironmentVariable) {
    if (!adminRpcUrl) {
      push('admin-rpc', 'Admin RPC', 'FAIL', `${definition.adminRpcEnvironmentVariable} 未配置。`);
    } else {
      try {
        const chainRaw = await rpcCall(adminRpcUrl, 'eth_chainId');
        const chainId = Number(BigInt(String(chainRaw)));
        push('admin-rpc', 'Admin RPC', chainId === expectedChainId ? 'PASS' : 'FAIL', `chainId=${chainId}，期望=${expectedChainId}`);
      } catch (error) {
        push('admin-rpc', 'Admin RPC', 'FAIL', safeDetail(error, sensitive));
      }
    }
  }

  let manifest: Awaited<ReturnType<typeof loadDeploymentManifest>> | undefined;
  let deploymentBinding: ReturnType<typeof loadEnvironmentBinding> | undefined;
  try {
    deploymentBinding = loadEnvironmentBinding(projectRoot, environment);
    manifest = deploymentBinding.manifest;
    push(
      'deployment',
      '环境部署绑定',
      'PASS',
      `${environment} → ${deploymentBinding.binding.deploymentId} → ${manifest.name} / ${manifest.release}`,
    );
  } catch (error) {
    push('deployment', '环境部署绑定', 'FAIL', safeDetail(error, sensitive));
  }
  if (rpcReady && rpcUrl && deploymentBinding) {
    try {
      await assertRuntimeEnvironmentBinding({
        environment,
        chainId: expectedChainId,
        rpcUrl,
        deploymentManifestPath: deploymentBinding.manifestPath,
        deploymentId: deploymentBinding.binding.deploymentId,
        deploymentRelease: deploymentBinding.binding.release,
        requestTimeoutMs: 30_000,
      }, projectRoot);
      push('deployment-rpc', '绑定部署链上实例', 'PASS', 'RPC Chain ID 与关键合约 bytecode 均匹配。');
    } catch (error) {
      push('deployment-rpc', '绑定部署链上实例', 'FAIL', safeDetail(error, sensitive));
    }
  }

  let keeperFileValues: Record<string, string> = {};
  const signingMode = values.E2E_SIGNING_MODE || 'private-key';
  const keeperPath = values.E2E_KEEPER_ENV_FILE?.trim();
  const requiresKeeperConfiguration = environment !== 'base-sepolia';
  if (!requiresKeeperConfiguration) {
    // Base Sepolia 的 Service Keeper 在“测试运行”专项区域单独体检和启动；
    // 环境页只检查已有部署，不把 Keeper 初始化/密钥当作其就绪条件。
  } else if (!keeperPath) {
    push('keeper-file', 'Keeper 配置文件', 'WARN', signingMode === 'impersonation'
      ? 'impersonation 模式不要求 Keeper 密钥文件。'
      : '未配置；私钥必须直接填写在 TestCode。');
  } else {
    try {
      const resolved = resolve(projectRoot, keeperPath);
      await access(resolved);
      keeperFileValues = await parseFile(resolved);
      push('keeper-file', 'Keeper 配置文件', 'PASS', '文件存在，内容未输出。');
    } catch {
      push('keeper-file', 'Keeper 配置文件', signingMode === 'impersonation' ? 'WARN' : 'FAIL',
        signingMode === 'impersonation'
          ? `找不到 ${keeperPath}；当前 impersonation 模式可继续。`
          : `找不到 ${keeperPath}`);
    }
  }

  const traderKey = values.E2E_TEST_PRIVATE_KEY || keeperFileValues.FX100_TRADER_PK;
  const keeperKey = values.E2E_SECONDARY_TEST_PRIVATE_KEY || keeperFileValues.ORDER_KEEPER_PRIVATE_KEY;
  const traderAddress = values.E2E_TEST_ACCOUNT;
  const keeperAddress = values.E2E_KEEPER_ACCOUNT;
  if (signingMode === 'private-key') {
    const missing = [
      !traderKey ? 'Trader 私钥' : '',
      requiresKeeperConfiguration && !keeperKey ? 'Keeper 私钥' : '',
    ].filter(Boolean);
    if (missing.length) {
      push('signing', '签名与密钥', 'FAIL', `缺少 ${missing.join('、')}。`);
    } else {
      try {
        const traderMatches = !traderAddress || privateKeyToAccount(traderKey as `0x${string}`).address.toLowerCase() === traderAddress.toLowerCase();
        const keeperMatches = !requiresKeeperConfiguration || !keeperAddress
          || privateKeyToAccount(keeperKey as `0x${string}`).address.toLowerCase() === keeperAddress.toLowerCase();
        push('signing', '签名与密钥', traderMatches && keeperMatches ? 'PASS' : 'FAIL', traderMatches && keeperMatches
          ? `${requiresKeeperConfiguration ? 'Trader/Keeper' : 'Trader'} 私钥与配置地址一致。`
          : '私钥与配置账户地址不匹配。');
      } catch {
        push('signing', '签名与密钥', 'FAIL', `${requiresKeeperConfiguration ? 'Trader 或 Keeper' : 'Trader'} 私钥格式非法。`);
      }
    }
  } else {
    const accountsReady = Boolean(traderAddress && (!requiresKeeperConfiguration || keeperAddress));
    push('signing', '签名与账户', accountsReady ? 'PASS' : 'FAIL', accountsReady
      ? `impersonation 所需${requiresKeeperConfiguration ? ' Trader/Keeper' : ' Trader'} 账户已配置。`
      : `impersonation 缺少${requiresKeeperConfiguration ? ' Trader 或 Keeper' : ' Trader'} 地址。`);
  }

  if (rpcReady && rpcUrl && manifest) {
    const accessControlAbi = parseAbi(['function hasRole(bytes32,address) view returns (bool)']);
    const client = createPublicClient({ transport: http(rpcUrl, { timeout: 20_000 }) });
    if (requiresKeeperConfiguration && keeperAddress) {
      try {
        const hasRole = await client.readContract({
          address: getAddress(manifest.contracts.dataStore),
          abi: accessControlAbi,
          functionName: 'hasRole',
          args: [roleHash('ORDER_KEEPER'), getAddress(keeperAddress)],
        });
        push('keeper-role', 'Keeper ORDER_KEEPER', hasRole ? 'PASS' : 'FAIL', hasRole ? '角色已持有。' : '角色缺失。');
      } catch (error) {
        push('keeper-role', 'Keeper ORDER_KEEPER', 'FAIL', safeDetail(error, sensitive));
      }
    }
    const adminAddress = values.E2E_ADMIN_ACCOUNT;
    if (adminAddress && definition.permitsOracleMutation) {
      try {
        const hasRole = await client.readContract({
          address: getAddress(manifest.contracts.dataStore),
          abi: accessControlAbi,
          functionName: 'hasRole',
          args: [roleHash('CONTROLLER'), getAddress(adminAddress)],
        });
        push('admin-role', 'Admin CONTROLLER', hasRole ? 'PASS' : 'FAIL', hasRole ? '角色已持有。' : '角色缺失。');
      } catch (error) {
        push('admin-role', 'Admin CONTROLLER', 'FAIL', safeDetail(error, sensitive));
      }
    }
  }

  if (definition.initializesDefaultMockResources && isMockResourceEnvironment(environment)) {
    const resource = (await loadMockResourceRegistry()).resources[environment];
    const registryChainMatches = resource.chainId === expectedChainId;
    const bundleReady = isCompleteDefaultMockResource(resource);
    const ready = bundleReady && registryChainMatches;
    push('default-mock', 'default-mock', ready ? 'PASS' : 'FAIL', ready
      ? `ready / market#${resource.market?.marketIndex ?? '?'} / ${resource.market?.profileId ?? '未命名配置'}`
      : !registryChainMatches
        ? `登记 Chain ID=${resource.chainId ?? '缺失'}，当前环境=${expectedChainId}；Fork 已切换，请强制重新初始化 default-mock。`
        : !bundleReady
          ? '缺少完整 Market Bundle（bundleId、Index/USDC 双 Mock Oracle 或 Market）；请重新初始化 default-mock。'
        : `${resource.status} / market ${resource.market?.status ?? 'unregistered'}`);
    if (ready && rpcReady && rpcUrl && manifest && resource.collateralToken && resource.market?.vault) {
      const profile = await loadEnvironmentInitializationProfile(projectRoot, environment);
      const client = createPublicClient({ transport: http(rpcUrl, { timeout: 20_000 }) });
      const erc20Abi = parseAbi([
        'function balanceOf(address) view returns (uint256)',
        'function allowance(address,address) view returns (uint256)',
      ]);
      const vaultAbi = parseAbi(['function totalAssets() view returns (uint256)']);
      const trader = values.E2E_TEST_ACCOUNT;
      const router = manifest.additionalContracts.router;
      if (profile.operations.fundTraderCollateral && trader) {
        try {
          const balance = await client.readContract({
            address: getAddress(resource.collateralToken.address),
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [getAddress(trader)],
          });
          const expected = parseUnits(profile.funding.traderCollateral, resource.collateralToken.decimals);
          push('trader-collateral', 'Trader Collateral', balance >= expected ? 'PASS' : 'FAIL',
            `balance=${balance}，最低=${expected}`);
        } catch (error) {
          push('trader-collateral', 'Trader Collateral', 'FAIL', safeDetail(error, sensitive));
        }
      }
      if (profile.operations.configureRouterAllowance && trader && router) {
        try {
          const allowance = await client.readContract({
            address: getAddress(resource.collateralToken.address),
            abi: erc20Abi,
            functionName: 'allowance',
            args: [getAddress(trader), getAddress(router)],
          });
          const expected = profile.funding.routerAllowance === 'max'
            ? (2n ** 256n) - 1n
            : parseUnits(profile.funding.traderCollateral, resource.collateralToken.decimals);
          push('router-allowance', 'Trader → Router Allowance', allowance >= expected ? 'PASS' : 'FAIL',
            allowance >= expected ? '授权额度满足初始化配置。' : `allowance=${allowance}，最低=${expected}`);
        } catch (error) {
          push('router-allowance', 'Trader → Router Allowance', 'FAIL', safeDetail(error, sensitive));
        }
      }
      if (profile.operations.seedLpLiquidity) {
        try {
          const assets = await client.readContract({
            address: getAddress(resource.market.vault),
            abi: vaultAbi,
            functionName: 'totalAssets',
          });
          const expected = parseUnits(profile.funding.minimumLpCollateral, resource.collateralToken.decimals);
          push('lp-liquidity', 'LP 最低流动性', assets >= expected ? 'PASS' : 'FAIL',
            `totalAssets=${assets}，最低=${expected}`);
        } catch (error) {
          push('lp-liquidity', 'LP 最低流动性', 'FAIL', safeDetail(error, sensitive));
        }
      }
    }
  }

  const parametersSource = deploymentBinding?.manifest.source?.parametersFile;
  const parametersFile = parametersSource
    ? parameterSnapshotCsvPath(parametersSource)
    : undefined;
  if (!parametersFile) {
    push('file-bound-parameters', '环境绑定参数快照', 'FAIL', '绑定 manifest 缺少 source.parametersFile。');
  } else {
    try {
      await access(resolve(projectRoot, parametersFile));
      push('file-bound-parameters', '环境绑定参数快照', 'PASS', parametersFile);
    } catch {
      push('file-bound-parameters', '环境绑定参数快照', 'FAIL', `找不到 ${parametersFile}；请在参数页刷新当前环境。`);
    }
  }

  for (const [key, label] of [
    ['E2E_SCENARIO_CATALOG', '场景目录'],
    ['E2E_SCENARIO_DETAILS_DIR', '场景明细目录'],
    ['E2E_CONTRACT_FORMULAS_SOURCE', '合约公式来源'],
    ['E2E_PAGE_FORMULAS_SOURCE', '页面公式来源'],
  ] as const) {
    const value = values[key]?.trim();
    if (!value) {
      push(`file-${key}`, label, 'WARN', '未配置。');
      continue;
    }
    try {
      await access(resolve(projectRoot, value));
      push(`file-${key}`, label, 'PASS', value);
    } catch {
      push(`file-${key}`, label, 'FAIL', `找不到 ${value}`);
    }
  }

  return {
    environment,
    checkedAt: new Date().toISOString(),
    status: checks.some((check) => check.status === 'FAIL') ? 'NOT_READY' : 'READY',
    checks,
  };
}

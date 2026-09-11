import { readFile, realpath, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

import { environmentNames, type EnvironmentName } from '../../config/environments/catalog.js';
import {
  parameterSnapshotCsvPath,
  parameterSnapshotJsonPath,
} from '../config/deployment.js';
import { loadEnvironmentBinding } from '../config/environment-binding.js';
import { normalizeForkDisplayName } from '../domain/fork-display.js';

export interface ParameterSnapshotMetadata {
  readonly environment: string;
  readonly displayName: string;
  /** 参数读取的合约地址（DataStore；本部署 RoleStore 与其同址） */
  readonly dataStore?: string;
  readonly deploymentName: string;
  readonly chainId: number;
  readonly blockNumber: number;
  readonly blockTimestamp: number;
  readonly generatedAt: string;
  readonly setCount: number;
  readonly unsetCount: number;
  readonly errorCount: number;
  readonly skippedCount: number;
  readonly roleCount: number;
  readonly marketMappings: ParameterMarketMapping[];
}

export interface ParameterMarketMapping {
  readonly marketIndex: number;
  readonly pair: string;
  readonly indexTokenSymbol: string;
  readonly indexToken: string;
  readonly collateralTokenSymbol: string;
  readonly collateralToken: string;
}

export interface ParameterReference {
  readonly sourcePath: string;
  readonly modifiedAt: string;
  readonly headers: string[];
  readonly rows: Array<Record<string, string>>;
  readonly snapshot?: ParameterSnapshotMetadata;
}

export interface FormulaReference {
  /** 源文件真实绝对路径（realpath；软链已解析），页面原样显示。 */
  readonly sourcePath: string;
  /** 源文件 mtime（ISO）。 */
  readonly modifiedAt: string;
  readonly markdown: string;
}

/**
 * 三份公式文档都取自工作区 TestCase/E2E/ContractCodeSummary/v0.3.2/（详解层）：
 * - contractFormulas → FX100-核心字段计算公式.md（A 级，合约）
 * - pageFormulas     → FX100-前端代码公式.md（B 级，fx100-apps SDK/App 自己算的公式）
 * - keeperFormulas   → FX100-Keeper代码公式.md（K1/K2，Keeper 进程自己算的公式）
 * 看板页面结构只有「合约核心公式」「页面数据公式」两页，Keeper 公式挂在页面数据公式页下方（render-formulas.ts）。
 */
export interface ReferenceSources {
  readonly parameters: ParameterReference;
  readonly contractFormulas: FormulaReference;
  readonly pageFormulas: FormulaReference;
  readonly keeperFormulas: FormulaReference;
}

function parseCsv(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (quoted) throw new Error('系统参数 CSV 存在未闭合的引号。');
  return rows;
}

const canonicalParameterHeaders = [
  '序号', '参数层级', '模块', '参数名', 'Solidity Key/入口', '参数作用域（Key维度）', '状态',
  '当前链上原始值', '可读值', '数据类型', '精度或单位', '设置入口', '所需权限',
  'Limited Keeper可改', '当前路径必填', '用途', 'E2E测试关注点', '来源', '备注',
];

interface ConfigDumpSnapshot {
  readonly meta: {
    readonly generatedAt: string;
    readonly rpc?: string;
    readonly chainId: number;
    readonly blockNumber: number;
    readonly blockTimestamp: number;
    readonly deploymentName: string;
    readonly dataStore?: string;
  };
  readonly dimensions?: Record<string, Array<{
    readonly value: string | number | boolean;
    readonly label?: string;
  }>>;
  readonly markets?: Array<{
    readonly marketIndex: number;
    readonly INDEX_TOKEN: string;
    readonly COLLATERAL_TOKEN: string;
    readonly indexTokenSymbol?: string;
    readonly collateralTokenSymbol?: string;
  }>;
  readonly roles?: Array<{
    readonly name: string;
    readonly hash: string;
    readonly members: string[];
    readonly error?: string | null;
  }>;
  readonly skipped?: Array<{
    readonly fn?: string;
    readonly base: string;
    readonly params?: string[];
    readonly reason: string;
  }>;
}

function snapshotDisplayName(raw: string | undefined, environment: string): string {
  // Alchemy 等公共 RPC 会把访问令牌放在 URL path；真链快照禁止从 URL 派生显示名。
  if (environment === 'base-sepolia') return 'Base Sepolia';
  if (!raw) return environment;
  if (!raw.includes('://')) return raw;
  try {
    const url = new URL(raw);
    const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const project = normalizeForkDisplayName(segments.slice(-3).join('/'));
    return project && environment !== 'dev-readonly' ? `${environment} / ${project}` : environment;
  } catch {
    return environment;
  }
}

function settingPermission(settableVia: string): string {
  const roles = ['LIMITED_CONFIG_KEEPER', 'CONFIG_KEEPER', 'CONTROLLER']
    .filter((role) => settableVia.includes(role));
  return roles.join(' / ') || '只读或需专用入口';
}

function currentParameterScope(rawScope: string | undefined, snapshot: ConfigDumpSnapshot): string {
  if (!rawScope) return '全局';
  return rawScope.replace(/market#(\d+)(?: · [A-Z0-9]+\/[A-Z0-9]+)?/g, (matched, indexText: string) => {
    const market = snapshot.markets?.find((item) => item.marketIndex === Number(indexText));
    if (!market) return matched;
    const indexSymbol = market.indexTokenSymbol === 'WETH' ? 'ETH' : market.indexTokenSymbol;
    if (!indexSymbol || !market.collateralTokenSymbol) return matched;
    return `market#${indexText} · ${indexSymbol}/${market.collateralTokenSymbol}`;
  });
}

function currentReadableValue(row: Record<string, string>, snapshot: ConfigDumpSnapshot): string {
  if (row.readable) return row.readable;
  if (row.type !== 'address' || !row.value) return '';
  const address = row.value;
  if (row.base === 'INDEX_TOKEN') {
    const market = snapshot.markets?.find((item) => item.INDEX_TOKEN?.toLowerCase() === address.toLowerCase());
    if (market?.indexTokenSymbol === 'WETH') return 'ETH market（WETH）';
    if (market?.indexTokenSymbol) return `${market.indexTokenSymbol} market`;
  }
  if (row.base === 'COLLATERAL_TOKEN') {
    // tx-fork@v0.3.2 参数快照的 markets[] 不带 COLLATERAL_TOKEN/INDEX_TOKEN 地址列，缺失时回退 labels 匹配。
    const market = snapshot.markets?.find((item) => item.COLLATERAL_TOKEN?.toLowerCase() === address.toLowerCase());
    if (market?.collateralTokenSymbol) return market.collateralTokenSymbol;
  }
  const labels = Object.values(snapshot.dimensions ?? {})
    .flat()
    .filter((item) => String(item.value).toLowerCase() === address.toLowerCase())
    .flatMap((item) => item.label?.split(' / ').map((label) => label.trim()) ?? []);
  const preferred = labels.find((label) => label === 'MockUSDC')
    ?? labels.find((label) => label.startsWith('WNT'))
    ?? labels.find((label) => label.includes('PriceFeedProvider'))
    ?? labels[0];
  return preferred ?? '';
}

function mapConfigDumpRows(
  rows: Array<Record<string, string>>,
  snapshot: ConfigDumpSnapshot,
  environment: string,
  displayNameOverride?: string,
): { rows: Array<Record<string, string>>; metadata: ParameterSnapshotMetadata } {
  const displayName = displayNameOverride
    ?? snapshotDisplayName(snapshot.meta.rpc, environment);
  const source = `${displayName} · block ${snapshot.meta.blockNumber}`;
  const mapped = rows.map((row, index) => {
    const status = row.note?.startsWith('读取失败:') ? '读取失败' : row.status;
    const settableVia = row.settableVia ?? '';
    return {
      序号: String(index + 1),
      参数层级: 'DataStore 链上参数',
      模块: row.module ?? '未分类',
      参数名: row.base ?? '',
      'Solidity Key/入口': row.base ? `FX100Keys.${row.base}` : '',
      '参数作用域（Key维度）': currentParameterScope(row.argLabel, snapshot),
      状态: status ?? '',
      当前链上原始值: row.value ?? '',
      可读值: currentReadableValue(row, snapshot),
      数据类型: row.type ?? '',
      精度或单位: row.typeConfidence ? `类型可信度：${row.typeConfidence}` : '',
      设置入口: settableVia,
      所需权限: settingPermission(settableVia),
      'Limited Keeper可改': settableVia.includes('LIMITED_CONFIG_KEEPER') ? '是' : '否',
      当前路径必填: status === '已设置' ? '是（当前生效）' : '否（当前默认值）',
      用途: row.group ?? '',
      E2E测试关注点: row.note || (status === '已设置' ? '校验当前值、精度与作用域' : '确认默认值路径'),
      来源: source,
      备注: row.key ? `DataStore key=${row.key}` : '',
    };
  });

  for (const role of snapshot.roles ?? []) {
    mapped.push({
      序号: String(mapped.length + 1),
      参数层级: '角色成员',
      模块: '权限与角色',
      参数名: role.name,
      'Solidity Key/入口': role.hash,
      '参数作用域（Key维度）': '全局角色',
      状态: role.error ? '读取失败' : role.members.length > 0 ? '已设置' : '未设置',
      当前链上原始值: role.members.join(' / '),
      可读值: role.error ? '' : `${role.members.length} 个成员`,
      数据类型: 'address[]',
      精度或单位: '角色成员地址',
      设置入口: 'RoleStore / Timelock',
      所需权限: 'TIMELOCK_ADMIN',
      'Limited Keeper可改': '否',
      当前路径必填: role.members.length > 0 ? '是（当前生效）' : '否',
      用途: '协议权限控制',
      E2E测试关注点: '校验角色成员与操作权限边界',
      来源: source,
      备注: role.error ? `读取失败：${role.error}` : '',
    });
  }

  for (const skipped of snapshot.skipped ?? []) {
    mapped.push({
      序号: String(mapped.length + 1),
      参数层级: '参数定义',
      模块: '不可枚举参数',
      参数名: skipped.base,
      'Solidity Key/入口': skipped.fn && skipped.fn !== '-' ? skipped.fn : `FX100Keys.${skipped.base}`,
      '参数作用域（Key维度）': skipped.params?.join(' / ') || '需业务上下文',
      状态: '不可枚举',
      当前链上原始值: '',
      可读值: '',
      数据类型: '',
      精度或单位: '',
      设置入口: '需按具体业务 Key 单独读取',
      所需权限: '取决于具体入口',
      'Limited Keeper可改': '待确认',
      当前路径必填: '需上下文',
      用途: '动态 Key / 标识常量',
      E2E测试关注点: skipped.reason,
      来源: source,
      备注: '全量工具不会用虚构入参展开此项',
    });
  }

  const setCount = mapped.filter((row) => row.状态 === '已设置').length;
  const unsetCount = mapped.filter((row) => row.状态.startsWith('未设置')).length;
  const errorCount = mapped.filter((row) => row.状态 === '读取失败').length;
  const marketMappings = (snapshot.markets ?? []).map((market) => {
    const indexTokenSymbol = market.indexTokenSymbol
      ?? (market.INDEX_TOKEN.toLowerCase() === '0x0555e30da8f98308edb960aa94c0db47230d2b9c'
        ? 'BTC'
        : market.INDEX_TOKEN.toLowerCase() === '0x4200000000000000000000000000000000000006'
          ? 'WETH'
          : 'UNKNOWN');
    const collateralTokenSymbol = market.collateralTokenSymbol
      ?? (market.COLLATERAL_TOKEN.toLowerCase() === '0xbf4d9b318689ab928db9ee4cdc840c065575eb89'
        ? 'USDC'
        : 'UNKNOWN');
    const pairIndexSymbol = indexTokenSymbol === 'WETH' ? 'ETH' : indexTokenSymbol;
    return {
      marketIndex: market.marketIndex,
      pair: `${pairIndexSymbol}/${collateralTokenSymbol}`,
      indexTokenSymbol,
      indexToken: market.INDEX_TOKEN,
      collateralTokenSymbol,
      collateralToken: market.COLLATERAL_TOKEN,
    };
  });
  return {
    rows: mapped,
    metadata: {
      environment,
      displayName,
      ...(snapshot.meta.dataStore ? { dataStore: snapshot.meta.dataStore } : {}),
      deploymentName: snapshot.meta.deploymentName,
      chainId: snapshot.meta.chainId,
      blockNumber: snapshot.meta.blockNumber,
      blockTimestamp: snapshot.meta.blockTimestamp,
      generatedAt: snapshot.meta.generatedAt,
      setCount,
      unsetCount,
      errorCount,
      skippedCount: snapshot.skipped?.length ?? 0,
      roleCount: snapshot.roles?.length ?? 0,
      marketMappings,
    },
  };
}

export async function loadParameters(
  path: string,
  options: { snapshotPath?: string; environment?: string; displayName?: string } = {},
): Promise<ParameterReference> {
  const [source, metadata] = await Promise.all([readFile(path, 'utf8'), stat(path)]);
  const parsed = parseCsv(source.replace(/^\uFEFF/, ''));
  const headers = parsed[0];
  if (!headers || headers.length === 0) throw new Error(`系统参数 CSV 没有表头：${path}`);

  let rows = parsed.slice(1).map((values, rowIndex) => {
    if (values.length !== headers.length) {
      throw new Error(
        `系统参数 CSV 第 ${rowIndex + 2} 行有 ${values.length} 列，预期 ${headers.length} 列。`,
      );
    }
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });

  const nativeConfigDump = ['module', 'base', 'argLabel', 'status', 'value', 'key']
    .every((header) => headers.includes(header));
  let outputHeaders = headers;
  let snapshotMetadata: ParameterSnapshotMetadata | undefined;
  if (nativeConfigDump) {
    const snapshotPath = options.snapshotPath
      ?? parameterSnapshotJsonPath(path);
    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as ConfigDumpSnapshot;
    const mapped = mapConfigDumpRows(
      rows,
      snapshot,
      options.environment ?? process.env.E2E_ENV ?? 'tx-fork',
      options.displayName,
    );
    rows = mapped.rows;
    outputHeaders = canonicalParameterHeaders;
    snapshotMetadata = mapped.metadata;
  }

  return {
    sourcePath: relative(process.cwd(), path),
    modifiedAt: metadata.mtime.toISOString(),
    headers: outputHeaders,
    rows,
    ...(snapshotMetadata ? { snapshot: snapshotMetadata } : {}),
  };
}

async function loadFormulas(path: string): Promise<FormulaReference> {
  const [markdown, metadata, realPath] = await Promise.all([
    readFile(path, 'utf8'),
    stat(path),
    realpath(path).catch(() => resolve(path)),
  ]);
  return {
    sourcePath: realPath,
    modifiedAt: metadata.mtime.toISOString(),
    markdown,
  };
}

const FORMULA_DOC_DIR = '../TestCase/E2E/ContractCodeSummary/v0.3.2';

export async function loadReferenceSources(): Promise<ReferenceSources> {
  const requestedEnvironment = environmentNames.includes(process.env.E2E_ENV as EnvironmentName)
    ? process.env.E2E_ENV as EnvironmentName
    : 'tx-fork';
  const binding = loadEnvironmentBinding(process.cwd(), requestedEnvironment);
  const boundParameters = binding.manifest.source?.parametersFile;
  if (!boundParameters) {
    throw new Error(`环境 ${requestedEnvironment} 的绑定 manifest 缺少 source.parametersFile。`);
  }
  const parametersSnapshotPath = resolve(process.cwd(), boundParameters);
  const parametersPath = resolve(process.cwd(), parameterSnapshotCsvPath(boundParameters));
  // 三份公式页数据源统一切到 v0.3.2 详解层（TestCase/E2E/ContractCodeSummary/v0.3.2/）；环境变量只作临时覆盖。
  // 页面公式页的语义已从「需求文档口径」改为「前端代码公式」，覆盖键随之改名为 E2E_FRONTEND_FORMULAS_SOURCE；
  // 旧键 E2E_PAGE_FORMULAS_SOURCE（.env.local 里常指向 Docs/…/FX100-页面字段计算公式.md）不再读取，只告警。
  if (process.env.E2E_PAGE_FORMULAS_SOURCE) {
    console.warn(
      '[reference-sources] E2E_PAGE_FORMULAS_SOURCE 已废弃并被忽略：页面数据公式页现在固定渲染 '
      + `${FORMULA_DOC_DIR}/FX100-前端代码公式.md（临时覆盖请改用 E2E_FRONTEND_FORMULAS_SOURCE）。`,
    );
  }
  const contractFormulasPath = resolve(
    process.cwd(),
    process.env.E2E_CONTRACT_FORMULAS_SOURCE
      ?? process.env.E2E_FORMULAS_SOURCE
      ?? `${FORMULA_DOC_DIR}/FX100-核心字段计算公式.md`,
  );
  const pageFormulasPath = resolve(
    process.cwd(),
    process.env.E2E_FRONTEND_FORMULAS_SOURCE
      ?? `${FORMULA_DOC_DIR}/FX100-前端代码公式.md`,
  );
  const keeperFormulasPath = resolve(
    process.cwd(),
    process.env.E2E_KEEPER_FORMULAS_SOURCE
      ?? `${FORMULA_DOC_DIR}/FX100-Keeper代码公式.md`,
  );

  const [parameters, contractFormulas, pageFormulas, keeperFormulas] = await Promise.all([
    loadParameters(parametersPath, { snapshotPath: parametersSnapshotPath, environment: requestedEnvironment }),
    loadFormulas(contractFormulasPath),
    loadFormulas(pageFormulasPath),
    loadFormulas(keeperFormulasPath),
  ]);
  // 只有 config-dump 原生产物（params-by-module.csv + 同名 params.json）才带链上快照；
  // 指向设计文档 CSV 时参数页会静默退化成无链上值、无 Market 过滤的清单——必须显式告警，
  // 否则只会在 dashboard:verify 里表现为 #market-index 选不到选项的超时。
  if (!parameters.snapshot) {
    console.warn(
      `[reference-sources] 系统参数来源不是 config-dump 原生快照：${parameters.sourcePath}\n`
      + '  参数页将缺少链上当前值、Market 范围过滤与 DataStore 直写；'
      + '请刷新当前环境的参数快照，并检查绑定 manifest 的 source.parametersFile。',
    );
  }
  return { parameters, contractFormulas, pageFormulas, keeperFormulas };
}

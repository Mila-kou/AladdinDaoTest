/**
 * 前端本地 fork 补丁：让 fx100-apps@develop 的静态市场表认识 TestCode Mock Market Bundle 创建的市场。
 *
 * 背景（docs/07 附录二 / Phase 1 审计 2026-08-14）：develop 前端在 84532 槽位上只用静态表
 * （config/markets.ts、constants/markets.ts、SDK configs/tokens.ts），tx-fork 上新建的市场（如 #27 FXMOCK）
 * 不在表中 → 不查持仓、无价格、平仓弹窗打不开。这里做的是 dev-only 的最小可逆补丁：
 *   - 三个文件各插入一段带哨兵注释的条目（幂等：已存在则跳过）
 *   - 另把 SDK TOKENS[BASE_SEPOLIA] 里 collateral(USDC) 的地址改成小写并加行尾哨兵注释——
 *     split 数据源整条管线（useMarketsValues 资格判断 / SDK getContractMarketPrices）都用**小写**市场地址
 *     直接索引 tokensData，而 tokensData 键 = /api/tokens 返回的原样地址；配置地址为 checksum 时
 *     collateral 永远"无价"→ 市场被丢（2026-08-18 实证：Market Unavailable / Positions (0)）。
 *   - revert 只移除哨兵块、还原地址，不 git checkout（不碰前端仓其他本地改动）
 * 长期方案 = 前端需求 D（市场表可配置/动态发现），补丁落地后删除本脚本。
 *
 * 用法：
 *   npx tsx scripts/frontend-fork-patch.ts apply   [--env tx-fork] [--alias default-mock] [--frontend-root <path>]
 *   npx tsx scripts/frontend-fork-patch.ts revert  [--frontend-root <path>]
 *   npx tsx scripts/frontend-fork-patch.ts status  [--frontend-root <path>]
 *
 * frontend root（补丁作用的前端 worktree）优先级：`--frontend-root` > 环境变量 `E2E_FRONTEND_ROOT` > 默认
 * `../Github/fx100-apps@develop`（相对 TestCode/ 解析；两者都不传时与改造前解析到同一路径）。
 * 「两个合约版本各配一个前端版本」并行时用它把补丁分别打到各自的 worktree——哨兵按文件独立存在，
 * 不同 worktree 的 apply/revert 互不影响（同一 worktree 内仍是全局二值开关，未做多环境叠加）。
 * 说明：frontend root 提示行走 **stderr**，三个子命令的 stdout 与改造前逐字节一致
 *（scripts/pipeline.ts 阶段 C-UI 按 `/^clean/m` 解析 status 输出，不能被新增行干扰）。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** 默认前端 worktree（保持与改造前一致：相对 TestCode/ 的 ../Github/fx100-apps@develop） */
const DEFAULT_FRONTEND_ROOT = '../Github/fx100-apps@develop';

/** 补丁作用的三个文件在前端 worktree 内的相对路径（键序即 status/apply/revert 的输出顺序，勿调整） */
function frontendFiles(root: string) {
  return {
    sdkTokens: resolve(root, 'packages/sdk/src/configs/tokens.ts'),
    appMarkets: resolve(root, 'apps/fx-base-app/src/config/markets.ts'),
    appPairs: resolve(root, 'apps/fx-base-app/src/constants/markets.ts'),
  } as const;
}

const SENTINEL_BEGIN = '// [fx100-testcode fork patch] BEGIN';
const SENTINEL_END = '// [fx100-testcode fork patch] END';
const INLINE_BEGIN = '[fx100-testcode fork patch] BEGIN';
const INLINE_END = '[fx100-testcode fork patch] END';

/** frontend root 的来源，用于 status 展示与文件缺失时的报错定位 */
type RootOrigin = '默认' | '环境变量 E2E_FRONTEND_ROOT' | '命令行 --frontend-root';

interface Args {
  command: 'apply' | 'revert' | 'status';
  env: string;
  alias: string;
  frontendRoot: string;
  frontendRootOrigin: RootOrigin;
}

function parseArgs(): Args {
  const [command = 'status', ...rest] = process.argv.slice(2);
  if (!['apply', 'revert', 'status'].includes(command)) throw new Error(`未知命令 ${command}`);
  const get = (flag: string, fallback: string) => {
    const i = rest.indexOf(flag);
    return i >= 0 && rest[i + 1] ? rest[i + 1]! : fallback;
  };
  // frontend root 专用取值。写了 flag 就必须给出有效值——**不能静默回落到默认 worktree**：
  // 默认 worktree 是多会话共享的，补丁又是全局二值开关，回落等于把补丁打到别人的前端上
  // （2026-09-05 并行会话审计的 HIGH 风险项）。缺值/空串/下一个 token 是另一个 flag，一律 fail-fast。
  const pickRoot = (flag: string): string | undefined => {
    const i = rest.indexOf(flag);
    if (i < 0) return undefined;
    const value = rest[i + 1];
    if (!value || !value.trim() || value.startsWith('--')) {
      throw new Error(
        `${flag} 需要一个路径值（收到 ${value === undefined ? '缺失' : JSON.stringify(value)}）。`
        + `\n  补丁作用于共享 worktree 时是全局二值开关，这里不做静默回落——请显式给出目标前端目录，`
        + `\n  例如：--frontend-root ../Github/fx100-apps@develop`
        + `\n  （不指定 ${flag} 时才使用默认 worktree。）`,
      );
    }
    return value.trim();
  };
  const cliRoot = pickRoot('--frontend-root');
  const envRoot = process.env.E2E_FRONTEND_ROOT?.trim() || undefined;
  const frontendRootOrigin: RootOrigin = cliRoot
    ? '命令行 --frontend-root'
    : envRoot
      ? '环境变量 E2E_FRONTEND_ROOT'
      : '默认';
  // 相对路径一律相对 TestCode/（process.cwd()）解析：都不传时等价于改造前的
  // resolve(process.cwd(), '../Github/fx100-apps@develop')，解析结果逐字节一致。
  return {
    command: command as Args['command'],
    env: get('--env', process.env.E2E_ENV ?? 'tx-fork'),
    alias: get('--alias', process.env.E2E_MARKET_RESOURCE_ALIAS ?? 'default-mock'),
    frontendRoot: resolve(process.cwd(), cliRoot ?? envRoot ?? DEFAULT_FRONTEND_ROOT),
    frontendRootOrigin,
  };
}

interface BundleInfo {
  marketIndex: number;
  token: { address: string; name: string; symbol: string; decimals: number };
  collateral: { address: string; symbol: string };
  vault: string;
}

function readBundle(env: string, alias: string): BundleInfo {
  const registry = JSON.parse(readFileSync(resolve(process.cwd(), 'config/mock-resources.json'), 'utf8')) as {
    resources: Record<string, {
      sharedCollateral?: { token: { address: string; symbol: string } };
      bundles?: Record<string, { token: BundleInfo['token']; market: { marketIndex: number; vault: string } }>;
    }>;
  };
  const resource = registry.resources[env];
  if (!resource) throw new Error(`mock-resources.json 无环境 ${env}`);
  const bundle = resource.bundles?.[alias];
  if (!bundle) throw new Error(`环境 ${env} 无 bundle ${alias}`);
  if (!resource.sharedCollateral) throw new Error(`环境 ${env} 无 sharedCollateral 登记`);
  return {
    marketIndex: bundle.market.marketIndex,
    token: bundle.token,
    collateral: resource.sharedCollateral.token,
    vault: bundle.market.vault,
  };
}

/** 生成三段插入块。地址统一小写：前端 useMarketsValues 用 tokensData[market.indexToken] 直接索引（大小写敏感）。 */
function blocks(info: BundleInfo) {
  const addr = info.token.address.toLowerCase();
  const pairSymbol = `${info.token.symbol}${info.collateral.symbol}`;
  return {
    sdkTokens: {
      anchor: /(\n\s*\[BASE_SEPOLIA\]: \[\n)/,
      block: `    ${SENTINEL_BEGIN}
    {
      name: ${JSON.stringify(info.token.name)},
      symbol: ${JSON.stringify(info.token.symbol)},
      decimals: ${info.token.decimals},
      address: ${JSON.stringify(addr)},
      isShortable: true,
      categories: ["layer1"],
    },
    ${SENTINEL_END}
`,
    },
    appMarkets: {
      anchor: /(\n\s*\[BASE_SEPOLIA\]: \{\n)/,
      block: `    ${SENTINEL_BEGIN}
    "${info.marketIndex}": {
      marketIndex: "${info.marketIndex}",
      vault: contractAddresses.baseSepolia.LPVault,
      indexToken: ${JSON.stringify(addr)},
      collateralToken: ${JSON.stringify(info.collateral.address.toLowerCase())},
    },
    ${SENTINEL_END}
`,
    },
    appPairs: {
      anchor: /(\nexport const MARKET_PAIRS: MarketPair\[\] = \[\n)/,
      block: `  ${SENTINEL_BEGIN}
  {
    symbol: '${pairSymbol}',
    base: '${info.token.symbol}',
    quote: '${info.collateral.symbol}',
    name: ${JSON.stringify(info.token.name)},
    isListed: true,
    // 注意：MarketPair 自 develop@c670d007（2026-08-23 拉取）起已删除 category 字段，
    // 分类改由 SDK TOKENS[].categories 推导（见 constants/markets.ts getMarketCategories）；sdkTokens 块已注入 categories。
    maxLeverage: 100,
    marketIndices: {
      [BASE_SEPOLIA]: ${info.marketIndex},
    },
  },
  ${SENTINEL_END}
`,
      // 展示白名单：dev 市场集合追加本交易对（同样用哨兵包裹，revert 时一并移除）。
      // 兼容两种写法：单行 new Set(['A', 'B']) → 行内哨兵注释；多行 new Set([\n  'A',\n  'B',\n]) → 行级哨兵块（stripPatch 的 lineBlock 可移除）。
      extraAnchor: /const DISPLAY_DEV_MARKETS = new Set\(\[([\s\S]*?)\]\);/,
      extraReplace: (m: string, inner: string) => {
        if (inner.includes(`'${pairSymbol}'`)) return m;
        if (!inner.includes('\n')) {
          return `const DISPLAY_DEV_MARKETS = new Set([${inner}, /* ${INLINE_BEGIN} */ '${pairSymbol}' /* ${INLINE_END} */]);`;
        }
        const indent = inner.match(/\n([ \t]+)'/)?.[1] ?? '  ';
        const body = inner.endsWith('\n') ? inner : `${inner}\n`;
        return `const DISPLAY_DEV_MARKETS = new Set([${body}${indent}${SENTINEL_BEGIN}\n${indent}'${pairSymbol}',\n${indent}${SENTINEL_END}\n]);`;
      },
    },
  };
}

const LOWERCASE_MARK = '// [fx100-testcode fork patch] lowercase (was ';

/** SDK TOKENS[BASE_SEPOLIA] 块内：collateral 地址 checksum → 小写（仅首个匹配，不碰 [BASE_SEPOLIA_FORK] 块） */
function applyCollateralLowercase(source: string, checksum: string): string {
  const lower = checksum.toLowerCase();
  if (lower === checksum) return source;
  const anchor = source.search(/\n\s*\[BASE_SEPOLIA\]: \[\n/);
  if (anchor < 0) throw new Error('sdkTokens: 找不到 [BASE_SEPOLIA] 块');
  const head = source.slice(0, anchor);
  let tail = source.slice(anchor);
  const needle = `address: ${JSON.stringify(checksum)},`;
  const at = tail.indexOf(needle);
  if (at < 0) return source; // 已小写或结构变化：由 hasCollateralLowercase 判断
  tail = tail.slice(0, at) + `address: ${JSON.stringify(lower)}, ${LOWERCASE_MARK}${checksum})` + tail.slice(at + needle.length);
  return head + tail;
}

function revertCollateralLowercase(source: string): string {
  return source.replace(
    new RegExp(`address: "(0x[0-9a-f]{40})", ${escapeRe(LOWERCASE_MARK)}(0x[0-9a-fA-F]{40})\\)`, 'g'),
    (_m, _lower: string, original: string) => `address: ${JSON.stringify(original)},`,
  );
}

function hasPatch(source: string): boolean {
  return source.includes(SENTINEL_BEGIN) || source.includes(LOWERCASE_MARK);
}

function stripPatch(source: string): string {
  // 行块
  const lineBlock = new RegExp(`[ \\t]*${escapeRe(SENTINEL_BEGIN)}[\\s\\S]*?${escapeRe(SENTINEL_END)}\\n`, 'g');
  // 内联块（DISPLAY_DEV_MARKETS）
  const inlineBlock = new RegExp(`, /\\* ${escapeRe(INLINE_BEGIN)} \\*/ [^/]*? /\\* ${escapeRe(INLINE_END)} \\*/`, 'g');
  return revertCollateralLowercase(source.replace(lineBlock, '').replace(inlineBlock, ''));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function main() {
  const args = parseArgs();
  const FILES = frontendFiles(args.frontendRoot);
  // 补丁作用的 worktree 提示：走 stderr，不进 stdout（pipeline.ts 按 /^clean/m 解析 status 的 stdout）。
  console.error(`frontend root: ${args.frontendRoot}（来源：${args.frontendRootOrigin}）`);
  for (const [key, path] of Object.entries(FILES)) {
    if (!existsSync(path)) {
      throw new Error(
        `前端文件不存在：${path}（${key}）\n` +
          `  frontend root=${args.frontendRoot}（来源：${args.frontendRootOrigin}）\n` +
          `  若要打到别的前端 worktree，用 --frontend-root <path> 或环境变量 E2E_FRONTEND_ROOT 指定` +
          `（相对路径相对 TestCode/ 解析；默认 ${DEFAULT_FRONTEND_ROOT}）。`,
      );
    }
  }
  if (args.command === 'status') {
    for (const [key, path] of Object.entries(FILES)) {
      console.log(`${hasPatch(readFileSync(path, 'utf8')) ? 'PATCHED' : 'clean  '}  ${key}  ${path}`);
    }
    return;
  }
  if (args.command === 'revert') {
    for (const [key, path] of Object.entries(FILES)) {
      const before = readFileSync(path, 'utf8');
      const after = stripPatch(before);
      if (after !== before) { writeFileSync(path, after); console.log(`reverted ${key}`); }
      else console.log(`clean    ${key}`);
    }
    return;
  }
  const info = readBundle(args.env, args.alias);
  console.log(`apply: env=${args.env} alias=${args.alias} market#${info.marketIndex} ${info.token.symbol} ${info.token.address}`);
  const b = blocks(info);
  for (const key of ['sdkTokens', 'appMarkets', 'appPairs'] as const) {
    const path = FILES[key];
    let source = readFileSync(path, 'utf8');
    if (hasPatch(source)) source = stripPatch(source); // 重新生成（登记可能变了）
    const spec = b[key];
    if (!spec.anchor.test(source)) throw new Error(`${key}: 找不到插入锚点，前端文件结构已变，补丁需更新`);
    source = source.replace(spec.anchor, `$1${spec.block}`);
    if ('extraAnchor' in spec) {
      if (!spec.extraAnchor.test(source)) throw new Error(`${key}: 找不到 DISPLAY_DEV_MARKETS 锚点`);
      source = source.replace(spec.extraAnchor, spec.extraReplace);
    }
    if (key === 'sdkTokens') source = applyCollateralLowercase(source, info.collateral.address);
    writeFileSync(path, source);
    console.log(`patched  ${key}`);
  }
  console.log('提示：前端 dev server 若已在跑需重启（Turbopack 对 SDK 源码改动一般热更，但静态表建议重启）。');
}

main();

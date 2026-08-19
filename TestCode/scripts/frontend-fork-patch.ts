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
 *   npx tsx scripts/frontend-fork-patch.ts apply   [--env tx-fork] [--alias default-mock]
 *   npx tsx scripts/frontend-fork-patch.ts revert
 *   npx tsx scripts/frontend-fork-patch.ts status
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const FRONTEND_ROOT = resolve(process.cwd(), '../Github/fx100-apps@develop');
const FILES = {
  sdkTokens: resolve(FRONTEND_ROOT, 'packages/sdk/src/configs/tokens.ts'),
  appMarkets: resolve(FRONTEND_ROOT, 'apps/fx-base-app/src/config/markets.ts'),
  appPairs: resolve(FRONTEND_ROOT, 'apps/fx-base-app/src/constants/markets.ts'),
} as const;

const SENTINEL_BEGIN = '// [fx100-testcode fork patch] BEGIN';
const SENTINEL_END = '// [fx100-testcode fork patch] END';
const INLINE_BEGIN = '[fx100-testcode fork patch] BEGIN';
const INLINE_END = '[fx100-testcode fork patch] END';

interface Args { command: 'apply' | 'revert' | 'status'; env: string; alias: string }

function parseArgs(): Args {
  const [command = 'status', ...rest] = process.argv.slice(2);
  if (!['apply', 'revert', 'status'].includes(command)) throw new Error(`未知命令 ${command}`);
  const get = (flag: string, fallback: string) => {
    const i = rest.indexOf(flag);
    return i >= 0 && rest[i + 1] ? rest[i + 1]! : fallback;
  };
  return {
    command: command as Args['command'],
    env: get('--env', process.env.E2E_ENV ?? 'tx-fork'),
    alias: get('--alias', process.env.E2E_MARKET_RESOURCE_ALIAS ?? 'default-mock'),
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
    category: 'layer1',
    maxLeverage: 100,
    marketIndices: {
      [BASE_SEPOLIA]: ${info.marketIndex},
    },
  },
  ${SENTINEL_END}
`,
      // 展示白名单：dev 市场集合追加本交易对（同样用哨兵包裹，revert 时一并移除）
      extraAnchor: /const DISPLAY_DEV_MARKETS = new Set\(\[(.*)\]\);/,
      extraReplace: (m: string, inner: string) =>
        inner.includes(`'${pairSymbol}'`) ? m : `const DISPLAY_DEV_MARKETS = new Set([${inner}, /* ${INLINE_BEGIN} */ '${pairSymbol}' /* ${INLINE_END} */]);`,
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
  for (const [key, path] of Object.entries(FILES)) {
    if (!existsSync(path)) throw new Error(`前端文件不存在：${path}（${key}）`);
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

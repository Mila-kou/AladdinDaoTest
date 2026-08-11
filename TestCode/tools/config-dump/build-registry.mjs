#!/usr/bin/env node
// 从合约源码生成参数登记表 registry.json。
//
// 为什么解析源码而不是手写清单：手写清单一定会漏（这正是「合约取数清单可能不全」的成因）。
// 解析 FX100Keys.sol 后，只要合约新增了 key，重跑本脚本就会自动出现在登记表里。
//
// 抽取三类信息：
//   1. bytes32 常量 —— 区分 keccak256("X")（raw）与 keccak256(abi.encode("X"))，两者哈希不同
//   2. key 派生函数 —— keccak256(abi.encode(BASE, 参数...)) 的参数类型顺序
//   3. 取值类型 —— 全仓扫描 dataStore.getUint/getInt/getBool/getAddress/getBytes32(...Keys.X)
//
// 用法：node build-registry.mjs [--contracts <路径>] [--out registry.json]

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { keccak256Utf8 } from "./lib/keccak.mjs";
import { abiEncode, keccak256Hex } from "./lib/abi.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONTRACTS = resolve(HERE, "../../../Github/fx100-contracts@release-v0.3.1");

// 参数名 -> 维度。决定 dump 阶段如何枚举取值。
// enumerable=false 的维度（账户、时间片、任意字符串）无法穷举，登记但不取数，并在报告里点名。
const DIMENSION_BY_PARAM = {
  marketIndex: "market",
  token: "token",
  feeToken: "token",
  module: "module",
  isLong: "bool",
  isPositive: "bool",
  isLongToken: "bool",
  balanceWasImproved: "bool",
  orderType: "orderType",
  pnlFactorType: "pnlFactorType",
  feeType: "feeType",
  tier: "graceTier",
  proTier: "proTier",
  referralTierLevel: "referralTier",
  provider: "oracleProvider",
  oracle: "oracleContract",
  account: "account",
  subaccount: "account",
  sender: "account",
  actionType: "subaccountActionType",
  positionKey: "positionKey",
  timeKey: "timeKey",
  parameter: "configParameterName",
  distributionId: "distributionId",
  updateId: "updateId",
  virtualTokenId: "virtualTokenId",
  virtualMarketId: "virtualMarketId",
  integrationId: "integrationId",
};

function listSolFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listSolFiles(full));
    else if (entry.endsWith(".sol")) out.push(full);
  }
  return out;
}

function parseConstants(source) {
  const constants = [];
  const re = /bytes32\s+(?:public|internal|private)\s+constant\s+(\w+)\s*=\s*keccak256\(\s*(abi\.encode\(\s*)?"([^"]+)"/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const [, name, abiWrapped, literal] = m;
    const hashMode = abiWrapped ? "abiEncode" : "raw";
    const hash = hashMode === "raw" ? keccak256Utf8(literal) : keccak256Hex(abiEncode([{ type: "string", value: literal }]));
    constants.push({ name, literal, hashMode, hash });
  }
  return constants;
}

function parseDerivations(source) {
  const derivations = [];
  const re = /function\s+(\w+)\(([^)]*)\)\s+internal\s+pure\s+returns\s*\(bytes32\)\s*\{([\s\S]*?)\n    \}/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const [, fn, rawArgs, body] = m;
    const flat = body.replace(/\s+/g, " ").trim();

    const encoded = /return keccak256\(abi\.encode\(([^)]*)\)\);/.exec(flat);
    const efficient = /return _efficientHash\(([^;]*)\);/.exec(flat);
    const passthrough = /^return ([A-Z0-9_]+);$/.exec(flat);

    const params = rawArgs
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const parts = s.split(/\s+/);
        return { type: parts[0], name: parts[parts.length - 1], dimension: DIMENSION_BY_PARAM[parts[parts.length - 1]] ?? null };
      });

    if (passthrough) {
      derivations.push({ fn, kind: "alias", base: passthrough[1], params: [], scheme: "identity" });
      continue;
    }
    if (encoded) {
      const args = encoded[1].split(",").map((s) => s.trim());
      const base = args[0];
      if (!/^[A-Z][A-Z0-9_]*$/.test(base)) continue; // 首参不是常量基键（如 getFullKey），跳过
      derivations.push({ fn, kind: "derived", base, params, scheme: "keccak256(abi.encode(BASE,...args))" });
      continue;
    }
    if (efficient) {
      const args = efficient[1].split(",").map((s) => s.trim());
      const base = args.find((a) => /^[A-Z][A-Z0-9_]*$/.test(a));
      if (!base) continue;
      derivations.push({ fn, kind: "derived", base, params, scheme: "_efficientHash(BASE, arg)" });
    }
  }
  return derivations;
}

function scanRoots(contractsRoot) {
  // src/ 是权威；test/ 只用来补 src 没覆盖到的 key 类型（release/v0.3.1 有 test/，main 没有）
  const roots = [join(contractsRoot, "src")];
  try {
    if (statSync(join(contractsRoot, "test")).isDirectory()) roots.push(join(contractsRoot, "test"));
  } catch {
    /* 无 test 目录 */
  }
  return roots;
}

function scanValueTypes(contractsRoot) {
  // 只认大写常量；小写的是 key 派生函数，由 backfillValueTypesFromFunctions 处理。
  // get 与 set 都扫：写入侧同样能确定类型，且 Config 只写不读的 key 只有写入侧线索。
  const re = /\.(?:get|set)(Uint|Int|Bool|Address|Bytes32|String)(?:Array|Count)?\(\s*(?:FX100)?Keys\.([A-Z][A-Z0-9_]*)\s*[,)]/g;
  const hits = new Map();
  for (const file of scanRoots(contractsRoot).flatMap(listSolFiles)) {
    const source = readFileSync(file, "utf8");
    let m;
    while ((m = re.exec(source)) !== null) {
      const [, type, symbol] = m;
      if (!hits.has(symbol)) hits.set(symbol, new Map());
      const counter = hits.get(symbol);
      counter.set(type, (counter.get(type) ?? 0) + 1);
    }
  }

  const valueTypes = {};
  const ambiguous = {};
  for (const [symbol, counter] of hits) {
    const sorted = [...counter.entries()].sort((a, b) => b[1] - a[1]);
    valueTypes[symbol] = sorted[0][0].toLowerCase();
    if (sorted.length > 1) ambiguous[symbol] = Object.fromEntries(sorted);
  }
  return { valueTypes, ambiguous };
}

// 派生函数名（如 constantPriceSpreadKey）与它调用的 getter 之间隔了一层，
// 这里把「函数名 -> 基键」的映射回填到 valueTypes 上。
function backfillValueTypesFromFunctions(contractsRoot, derivations, valueTypes) {
  const fnToBase = new Map(derivations.map((d) => [d.fn, d.base]));
  const re = /\.(?:get|set)(Uint|Int|Bool|Address|Bytes32|String)(?:Array|Count)?\(\s*(?:FX100)?Keys\.([a-z][A-Za-z0-9_]*)\(/g;
  const hits = new Map();
  for (const file of scanRoots(contractsRoot).flatMap(listSolFiles)) {
    const source = readFileSync(file, "utf8");
    let m;
    while ((m = re.exec(source)) !== null) {
      const [, type, fn] = m;
      const base = fnToBase.get(fn);
      if (!base) continue;
      if (!hits.has(base)) hits.set(base, new Map());
      const counter = hits.get(base);
      counter.set(type, (counter.get(type) ?? 0) + 1);
    }
  }
  let added = 0;
  for (const [base, counter] of hits) {
    if (valueTypes[base]) continue;
    const sorted = [...counter.entries()].sort((a, b) => b[1] - a[1]);
    valueTypes[base] = sorted[0][0].toLowerCase();
    added++;
  }
  return added;
}

// Config.sol 的 allowedBaseKeys / allowedLimitedBaseKeys 就是「治理可设置参数」的权威白名单：
// 在里面 = CONFIG_KEEPER（或 LIMITED_CONFIG_KEEPER）能通过 Config 改；
// 不在里面 = 只能由 CONTROLLER 直写 DataStore（部署脚本走的正是这条路，例如 orderBookDepth）。
// 这个区分是 CFG 用例的核心：直写型参数没有治理路径，改动不留 Config 事件。
function parseConfigAllowlists(configSource) {
  const grab = (mapping) => {
    const re = new RegExp(`${mapping}\\[(?:FX100)?Keys\\.([A-Z][A-Z0-9_]*)\\]\\s*=\\s*true`, "g");
    const out = new Set();
    let m;
    while ((m = re.exec(configSource)) !== null) out.add(m[1]);
    return [...out];
  };
  return { config: grab("allowedBaseKeys"), limitedConfig: grab("allowedLimitedBaseKeys") };
}

// 源码扫描扫不到的两类 key，用有明确依据的命名规则补类型；provenance 记为 naming-heuristic，
// 报告里与 source-scan 区分开，便于复核。没有依据的一律不猜，留给探测法。
function applyNamingHeuristics(constants, valueTypes) {
  const applied = {};
  for (const { name } of constants) {
    if (valueTypes[name]) continue;
    // 依据 src/feature/FeatureUtils.sol: isFeatureDisabled(dataStore, key) => dataStore.getBool(key)
    // 特性开关的 key 是外部算好后传进来的，正则扫不到调用点
    if (name.endsWith("_FEATURE_DISABLED") || /^(IS|SKIP|USE)_/.test(name)) {
      valueTypes[name] = "bool";
      applied[name] = "bool";
    }
  }
  return applied;
}

// 集合型 key（EnumerableSet 根）不是标量，getUint 恒返回 0。单列出来按 count 读。
function classifyNonScalar(constants) {
  const setRoots = [];
  const identifiers = [];
  for (const { name } of constants) {
    if (name.endsWith("_LIST")) setRoots.push(name);
    else if (name.endsWith("_FEE_TYPE")) identifiers.push(name);
  }
  return { setRoots, identifiers };
}

function gitInfo(root) {
  const run = (args) => {
    try {
      return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
    } catch {
      return null;
    }
  };
  return { branch: run(["rev-parse", "--abbrev-ref", "HEAD"]), commit: run(["rev-parse", "HEAD"]) };
}

function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).reduce((acc, cur, i, arr) => {
      if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]]);
      return acc;
    }, [])
  );

  const contractsRoot = resolve(args.contracts ?? DEFAULT_CONTRACTS);
  const outPath = resolve(args.out ?? join(HERE, "registry.json"));

  const keysPath = join(contractsRoot, "src/constants/FX100Keys.sol");
  const rolePath = join(contractsRoot, "src/constants/Role.sol");
  const marketStorePath = join(contractsRoot, "src/market/MarketStoreUtils.sol");

  const keysSource = readFileSync(keysPath, "utf8");
  const constants = parseConstants(keysSource);
  const derivations = parseDerivations(keysSource);
  const { valueTypes, ambiguous } = scanValueTypes(contractsRoot);
  const backfilled = backfillValueTypesFromFunctions(contractsRoot, derivations, valueTypes);
  const heuristics = applyNamingHeuristics(constants, valueTypes);
  const nonScalar = classifyNonScalar(constants);

  // 市场属性子键（MarketStoreUtils 里独立声明，键形为 _efficientHash(bytes32(marketIndex), SUBKEY)）
  const marketProps = parseConstants(readFileSync(marketStorePath, "utf8")).map((c) => ({
    ...c,
    scheme: "_efficientHash(bytes32(marketIndex), SUBKEY)",
    dimension: "market",
    valueType: c.name === "MARKET_INDEX" ? "uint" : "address",
  }));

  const roles = parseConstants(readFileSync(rolePath, "utf8"));
  const allowlists = parseConfigAllowlists(readFileSync(join(contractsRoot, "src/config/Config.sol"), "utf8"));

  const configSet = new Set(allowlists.config);
  const limitedSet = new Set(allowlists.limitedConfig);
  for (const constant of constants) {
    constant.settableVia = [configSet.has(constant.name) && "Config(CONFIG_KEEPER)", limitedSet.has(constant.name) && "Config(LIMITED_CONFIG_KEEPER)"]
      .filter(Boolean);
    if (constant.settableVia.length === 0) constant.settableVia = ["DataStore 直写(CONTROLLER)"];
  }

  const derivedBases = new Set(derivations.filter((d) => d.kind === "derived").map((d) => d.base));
  const globals = constants.filter((c) => !derivedBases.has(c.name));

  const registry = {
    generatedFrom: {
      contracts: contractsRoot,
      ...gitInfo(contractsRoot),
      files: [
        "src/constants/FX100Keys.sol",
        "src/constants/Role.sol",
        "src/market/MarketStoreUtils.sol",
        "src/config/Config.sol",
      ],
    },
    stats: {
      constants: constants.length,
      derivations: derivations.length,
      globalScalarCandidates: globals.length,
      valueTypesResolved: Object.keys(valueTypes).length,
      valueTypesBackfilledFromKeyFunctions: backfilled,
      valueTypesFromNamingHeuristic: Object.keys(heuristics).length,
      roles: roles.length,
      settableViaConfig: allowlists.config.length,
      settableViaLimitedConfig: allowlists.limitedConfig.length,
    },
    constants,
    derivations,
    marketProps,
    roles,
    allowlists,
    valueTypes,
    valueTypesFromNamingHeuristic: heuristics,
    ambiguousValueTypes: ambiguous,
    nonScalar,
    dimensionByParam: DIMENSION_BY_PARAM,
  };

  writeFileSync(outPath, JSON.stringify(registry, null, 2) + "\n");
  console.log(`registry 已写入 ${outPath}`);
  console.log(
    `  常量 ${constants.length} · 派生函数 ${derivations.length} · 全局标量候选 ${globals.length} · ` +
      `取值类型已解析 ${Object.keys(valueTypes).length}（其中回填 ${backfilled}） · 角色 ${roles.length}`
  );
  console.log(
    `  治理可设置：Config 白名单 ${allowlists.config.length} 个 · LimitedConfig 白名单 ${allowlists.limitedConfig.length} 个 · ` +
      `其余只能 CONTROLLER 直写 DataStore`
  );

  const unresolved = constants.filter((c) => !valueTypes[c.name]).map((c) => c.name);
  if (unresolved.length) {
    console.log(`  未能从源码推断取值类型的 key ${unresolved.length} 个 —— dump 阶段会逐类型探测（探测法）`);
  }
}

main();

#!/usr/bin/env node
// 读取一套已部署 fx100 合约在 DataStore 里的全部参数，落盘到 TestCode 参数缓存。
//
// 三段式：
//   1. 维度发现  —— 从链上 MARKET_LIST / 市场属性 + deployed_addresses.json 推出 market/token/module 等取值域
//   2. 展开 & 取数 —— registry.json 的每个 key 在维度上做笛卡尔积，批量 eth_call 固定同一 block
//   3. 落盘      —— JSON（机器可读，供用例断言）+ Markdown（人读，供核对）
//
// 取值类型未能从源码推断时走「探测法」：uint/int/bool/address/bytes32 全读一遍，
// 报告里标 typeSource=probe 并列出所有非零读数，由人判定。宁可多列，不可静默假设。
//
// 用法：
//   node dump-config.mjs                                   # 默认部署 + latest block
//   node dump-config.mjs --block 44881000                  # 钉块
//   node dump-config.mjs --rpc https://... --out ../../artifacts/parameter-cache
//   node dump-config.mjs --only-set                        # 只输出非默认值

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { Rpc } from "./lib/rpc.mjs";
import {
  abiEncode,
  encodeCall,
  keccak256Hex,
  decodeUint,
  decodeInt,
  decodeBool,
  decodeAddress,
  decodeBytes32,
  decodeString,
  decodeUintArray,
  decodeAddressArray,
} from "./lib/abi.mjs";
import { humanize, isUnset } from "./lib/hints.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACTS = resolve(HERE, "../../../Github/fx100-contracts@release-v0.3.1");
const DEFAULT_DEPLOYMENT = join(CONTRACTS, "base_sepolia_v0.3.1_260729/deployed_addresses.json");
const DEFAULT_OUT = resolve(HERE, "../../artifacts/parameter-cache");
const DEFAULT_RPC = process.env.FX100_RPC_URL ?? "https://sepolia.base.org";

const WNT = "0x4200000000000000000000000000000000000006"; // Base WETH
const BASE_SEPOLIA_SYNTHETIC_BTC = "0x0555e30da8f98308edb960aa94c0db47230d2b9c";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ORDER_TYPE_COUNT = 7; // Order.OrderType: MarketIncrease..StopIncrease
const TIER_PROBE_COUNT = 4; // grace / pro / referral 分档，向上探 4 档

const GETTER = {
  uint: { sig: "getUint(bytes32)", decode: decodeUint },
  int: { sig: "getInt(bytes32)", decode: decodeInt },
  bool: { sig: "getBool(bytes32)", decode: decodeBool },
  address: { sig: "getAddress(bytes32)", decode: decodeAddress },
  bytes32: { sig: "getBytes32(bytes32)", decode: decodeBytes32 },
  uintCount: { sig: "getUintCount(bytes32)", decode: decodeUint },
  addressCount: { sig: "getAddressCount(bytes32)", decode: decodeUint },
  bytes32Count: { sig: "getBytes32Count(bytes32)", decode: decodeUint },
};
const PROBE_TYPES = ["uint", "int", "bool", "address", "bytes32"];

/* ------------------------------------------------------------------ */
/* 参数解析                                                            */
/* ------------------------------------------------------------------ */

function parseArgs() {
  const argv = process.argv.slice(2);
  const args = { flags: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const name = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args.flags.add(name);
    else {
      args[name] = next;
      i++;
    }
  }
  return args;
}

function maskRpcUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return `${url.protocol}//${url.host}/***`;
  } catch {
    return "configured RPC";
  }
}

/* ------------------------------------------------------------------ */
/* 维度发现                                                            */
/* ------------------------------------------------------------------ */

// FEATURE_DISABLED 类 key 以「调用入口合约地址」为维度：只有能成为 msg.sender 的入口合约才有意义。
// 库、金库、只读合约（Reader/KeeperReader）、代币、实现槽都不会出现在这个位置，全部排除，
// 否则维度会从 13 膨胀到 32，配合 orderType 维度直接放大 2.5 倍读取量。
const MODULE_NAME_PATTERN = /(Router|Handler|Executor|Syncer)$|^(Config|MarketFactory|FeeHandler|ExternalHandler)$/;

function pickModules(addresses) {
  const seen = new Map();
  for (const [name, address] of Object.entries(addresses)) {
    const short = name.split("#")[1] ?? name;
    if (short.endsWith("Impl") || short.endsWith("Proxy")) continue;
    if (!MODULE_NAME_PATTERN.test(short)) continue;
    if (!seen.has(address.toLowerCase())) seen.set(address.toLowerCase(), { name: short, address });
  }
  return [...seen.values()];
}

async function discoverDimensions(rpc, dataStore, block, registry, addresses) {
  const constantByName = new Map(registry.constants.map((c) => [c.name, c]));
  const marketListKey = constantByName.get("MARKET_LIST").hash;

  const countHex = await rpc.readMany(
    [{ to: dataStore, data: encodeCall("getUintCount(bytes32)", [{ type: "bytes32", value: marketListKey }]) }],
    block
  );
  if (countHex[0].error) throw new Error(`读取 MARKET_LIST 失败: ${countHex[0].error}`);
  const marketCount = Number(decodeUint(countHex[0].result));

  let marketIndexes = [];
  if (marketCount > 0) {
    const valuesHex = await rpc.readMany(
      [
        {
          to: dataStore,
          data: encodeCall("getUintValuesAt(bytes32,uint256,uint256)", [
            { type: "bytes32", value: marketListKey },
            { type: "uint256", value: 0 },
            { type: "uint256", value: marketCount },
          ]),
        },
      ],
      block
    );
    marketIndexes = decodeUintArray(valuesHex[0].result).map(Number);
  }

  // 市场属性：_efficientHash(bytes32(marketIndex), SUBKEY)
  const propCalls = [];
  for (const marketIndex of marketIndexes) {
    for (const prop of registry.marketProps) {
      const key = keccak256Hex(
        abiEncode([
          { type: "uint256", value: marketIndex },
          { type: "bytes32", value: prop.hash },
        ])
      );
      propCalls.push({ marketIndex, prop, key, to: dataStore, data: encodeCall(GETTER[prop.valueType].sig, [{ type: "bytes32", value: key }]) });
    }
  }
  const propResults = await rpc.readMany(propCalls, block);

  const markets = new Map(marketIndexes.map((i) => [i, { marketIndex: i }]));
  const marketPropEntries = [];
  propCalls.forEach((call, i) => {
    const res = propResults[i];
    const value = res.error ? null : GETTER[call.prop.valueType].decode(res.result);
    markets.get(call.marketIndex)[call.prop.name] = value;
    marketPropEntries.push({
      group: "market-prop",
      base: call.prop.name,
      scheme: call.prop.scheme,
      args: { marketIndex: call.marketIndex },
      argLabel: `marketIndex=market#${call.marketIndex}`,
      key: call.key,
      type: call.prop.valueType,
      typeSource: "registry",
      value: value === null ? null : String(value),
      error: res.error ?? null,
    });
  });

  const usdc = addresses["Fx100Usdc#MockUSDC"];
  const tokens = new Map();
  const addToken = (address, label) => {
    if (!address || address === ZERO_ADDRESS) return;
    const lower = address.toLowerCase();
    if (!tokens.has(lower)) tokens.set(lower, { address, labels: [] });
    if (label && !tokens.get(lower).labels.includes(label)) tokens.get(lower).labels.push(label);
  };
  for (const market of markets.values()) {
    addToken(market.INDEX_TOKEN, `market#${market.marketIndex} indexToken`);
    addToken(market.COLLATERAL_TOKEN, `market#${market.marketIndex} collateralToken`);
  }
  addToken(usdc, "MockUSDC");
  addToken(WNT, "WNT (Base WETH)");

  // 从当前配置环境读取 token metadata。BTC 是合成 index 标识地址、没有 ERC20
  // bytecode，因此用项目明确配置的 symbol 兜底；其余 token 以链上 symbol/name 为准。
  const tokenValues = [...tokens.values()];
  const metadataCalls = tokenValues.flatMap((token) => [
    { to: token.address, data: encodeCall("symbol()", []) },
    { to: token.address, data: encodeCall("name()", []) },
    { to: token.address, data: encodeCall("decimals()", []) },
  ]);
  const metadataResults = await rpc.readMany(metadataCalls, block, "token metadata ");
  const tokenMetadata = {};
  tokenValues.forEach((token, index) => {
    const symbolResult = metadataResults[index * 3];
    const nameResult = metadataResults[index * 3 + 1];
    const decimalsResult = metadataResults[index * 3 + 2];
    const lower = token.address.toLowerCase();
    const syntheticBtc = lower === BASE_SEPOLIA_SYNTHETIC_BTC;
    tokenMetadata[lower] = {
      address: token.address,
      symbol: syntheticBtc ? "BTC" : symbolResult?.error ? null : decodeString(symbolResult?.result),
      name: syntheticBtc ? "Synthetic BTC index identifier" : nameResult?.error ? null : decodeString(nameResult?.result),
      decimals: syntheticBtc || decimalsResult?.error ? null : Number(decodeUint(decimalsResult?.result)),
      metadataSource: syntheticBtc ? "project-config" : "chain",
    };
  });

  const enrichedMarkets = [...markets.values()].map((market) => {
    const indexMetadata = tokenMetadata[String(market.INDEX_TOKEN).toLowerCase()] ?? {};
    const collateralMetadata = tokenMetadata[String(market.COLLATERAL_TOKEN).toLowerCase()] ?? {};
    return {
      ...market,
      indexTokenSymbol: indexMetadata.symbol ?? "UNKNOWN",
      indexTokenName: indexMetadata.name ?? null,
      indexTokenDecimals: indexMetadata.decimals ?? null,
      collateralTokenSymbol: collateralMetadata.symbol ?? "UNKNOWN",
      collateralTokenName: collateralMetadata.name ?? null,
      collateralTokenDecimals: collateralMetadata.decimals ?? null,
    };
  });
  const marketByIndex = new Map(enrichedMarkets.map((market) => [market.marketIndex, market]));
  const marketLabel = (marketIndex) => {
    const market = marketByIndex.get(marketIndex);
    return market
      ? `market#${marketIndex} · ${market.indexTokenSymbol}/${market.collateralTokenSymbol}`
      : `market#${marketIndex}`;
  };
  for (const entry of marketPropEntries) {
    entry.argLabel = `marketIndex=${marketLabel(entry.args.marketIndex)}`;
  }

  const oracleProviders = [
    ["ChainlinkPriceFeedProvider", addresses["Fx100Oracle#ChainlinkPriceFeedProvider"]],
    ["PythPriceFeedProvider", addresses["Fx100Oracle#PythPriceFeedProvider"]],
    ["ChainlinkDataStreamProvider", addresses["Fx100Oracle#ChainlinkDataStreamProvider"]],
  ].filter(([, address]) => Boolean(address));

  const feeTypes = registry.constants.filter((c) => c.name.endsWith("_FEE_TYPE"));
  const pnlFactorTypes = ["MAX_PNL_FACTOR_FOR_TRADERS", "MAX_PNL_FACTOR_FOR_ADL", "MAX_PNL_FACTOR_FOR_WITHDRAWALS"]
    .map((n) => constantByName.get(n))
    .filter(Boolean);

  return {
    dimensions: {
      market: marketIndexes.map((v) => ({ value: v, type: "uint256", label: marketLabel(v) })),
      bool: [
        { value: true, type: "bool", label: "true" },
        { value: false, type: "bool", label: "false" },
      ],
      token: tokenValues.map((t) => ({
        value: t.address,
        type: "address",
        label: [tokenMetadata[t.address.toLowerCase()]?.symbol, ...t.labels].filter(Boolean).join(" / "),
      })),
      module: pickModules(addresses).map((m) => ({ value: m.address, type: "address", label: m.name })),
      orderType: Array.from({ length: ORDER_TYPE_COUNT }, (_, i) => ({ value: i, type: "uint256", label: `orderType#${i}` })),
      pnlFactorType: pnlFactorTypes.map((c) => ({ value: c.hash, type: "bytes32", label: c.name })),
      feeType: feeTypes.map((c) => ({ value: c.hash, type: "bytes32", label: c.name })),
      graceTier: Array.from({ length: TIER_PROBE_COUNT }, (_, i) => ({ value: i, type: "uint256", label: `tier${i}` })),
      proTier: Array.from({ length: TIER_PROBE_COUNT }, (_, i) => ({ value: i, type: "uint256", label: `proTier${i}` })),
      referralTier: Array.from({ length: TIER_PROBE_COUNT }, (_, i) => ({ value: i, type: "uint256", label: `referralTier${i}` })),
      oracleProvider: oracleProviders.map(([name, address]) => ({ value: address, type: "address", label: name })),
      oracleContract: [{ value: addresses["Fx100Base#Oracle"], type: "address", label: "Oracle" }],
    },
    markets: enrichedMarkets,
    tokenMetadata,
    marketPropEntries,
  };
}

/* ------------------------------------------------------------------ */
/* 展开读取计划                                                        */
/* ------------------------------------------------------------------ */

function cartesian(lists) {
  return lists.reduce((acc, list) => acc.flatMap((prefix) => list.map((item) => [...prefix, item])), [[]]);
}

function buildPlan(registry, dimensions) {
  const plan = [];
  const skipped = [];
  const derivedBases = new Set(registry.derivations.filter((d) => d.kind === "derived").map((d) => d.base));
  const heuristicTypes = new Set(Object.keys(registry.valueTypesFromNamingHeuristic ?? {}));
  const setRoots = new Set(registry.nonScalar?.setRoots ?? []);
  const identifiers = new Set(registry.nonScalar?.identifiers ?? []);
  const settableVia = new Map(registry.constants.map((c) => [c.name, c.settableVia]));

  const pushEntry = (entry) => {
    const withMeta = { ...entry, settableVia: settableVia.get(entry.base) ?? null };
    const type = registry.valueTypes[entry.base];
    if (type && GETTER[type]) {
      plan.push({ ...withMeta, type, typeSource: heuristicTypes.has(entry.base) ? "naming-heuristic" : "source-scan" });
    } else {
      for (const probe of PROBE_TYPES) plan.push({ ...withMeta, type: probe, typeSource: "probe" });
    }
  };

  // 1) 全局标量：未被任何派生函数用作基键的常量
  for (const constant of registry.constants) {
    if (derivedBases.has(constant.name)) continue;

    // *_FEE_TYPE 是当作子键传参的标识常量，本身不存值，读它恒为 0（会污染报告）
    if (identifiers.has(constant.name)) {
      skipped.push({ fn: "-", base: constant.name, params: [], reason: "费用类型标识常量，作为子键传参使用，自身不存储值" });
      continue;
    }

    const entry = {
      group: setRoots.has(constant.name) ? "set-root" : "global",
      base: constant.name,
      scheme: constant.hashMode === "raw" ? 'keccak256("NAME")' : 'keccak256(abi.encode("NAME"))',
      args: {},
      key: constant.hash,
    };

    // 集合根（EnumerableSet）不是标量，getUint 恒 0；改读三种元素类型的 count
    if (setRoots.has(constant.name)) {
      for (const [type, sig] of [["uintCount", "getUintCount(bytes32)"], ["addressCount", "getAddressCount(bytes32)"], ["bytes32Count", "getBytes32Count(bytes32)"]]) {
        plan.push({ ...entry, settableVia: settableVia.get(constant.name) ?? null, type, sig, typeSource: "set-count", argLabel: type });
      }
      continue;
    }

    pushEntry(entry);
  }

  // 2) 派生 key：在各维度上做笛卡尔积
  const constantByName = new Map(registry.constants.map((c) => [c.name, c]));
  const seenFnArity = new Set();

  for (const derivation of registry.derivations) {
    if (derivation.kind !== "derived") continue;
    const constant = constantByName.get(derivation.base);
    if (!constant) continue;

    const signature = `${derivation.fn}/${derivation.params.length}`;
    if (seenFnArity.has(signature)) continue;
    seenFnArity.add(signature);

    const lists = [];
    let blocker = null;
    for (const param of derivation.params) {
      const values = param.dimension ? dimensions[param.dimension] : null;
      if (!values || values.length === 0) {
        blocker = param.dimension ? `维度 ${param.dimension} 无可枚举取值` : `参数 ${param.name}(${param.type}) 未映射到维度`;
        break;
      }
      lists.push(values.map((v) => ({ param, ...v })));
    }
    if (blocker) {
      skipped.push({ fn: derivation.fn, base: derivation.base, params: derivation.params.map((p) => `${p.type} ${p.name}`), reason: blocker });
      continue;
    }

    for (const combo of cartesian(lists)) {
      const encodeParams = [{ type: "bytes32", value: constant.hash }];
      const args = {};
      const labels = [];
      for (const item of combo) {
        encodeParams.push({ type: item.param.type, value: item.value });
        args[item.param.name] = typeof item.value === "bigint" ? String(item.value) : item.value;
        labels.push(`${item.param.name}=${item.label}`);
      }
      pushEntry({
        group: "derived",
        base: derivation.base,
        fn: derivation.fn,
        scheme: derivation.scheme,
        args,
        argLabel: labels.join(", "),
        key: keccak256Hex(abiEncode(encodeParams)),
      });
    }
  }

  return { plan, skipped };
}

/* ------------------------------------------------------------------ */
/* 输出                                                                */
/* ------------------------------------------------------------------ */

// 链上读回的整数是 BigInt，JSON.stringify 直接抛错；统一转 decimal string 落盘
// （也符合取数清单「原始整数统一返回 decimal string」的要求）。
function bigintSafe(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}

function formatValue(entry) {
  if (entry.error) return `ERROR: ${entry.error}`;
  if (entry.value === null) return "-";
  return entry.value;
}

function renderMarkdown(snapshot) {
  const { meta, dimensions, markets, roles, entries, skipped } = snapshot;
  const lines = [];

  lines.push(`# fx100 合约参数快照 — ${meta.deploymentName}`);
  lines.push("");
  lines.push(`> 本文件由 \`TestCode/tools/config-dump/dump-config.mjs\` 生成，请勿手工编辑。`);
  lines.push(`> 重新生成：\`node dump-config.mjs --block ${meta.blockNumber}\`（钉同一块可复现本表）`);
  lines.push("");
  lines.push("## 快照坐标");
  lines.push("");
  lines.push("| 项 | 值 |");
  lines.push("|---|---|");
  lines.push(`| chainId | ${meta.chainId} |`);
  lines.push(`| blockNumber | ${meta.blockNumber} |`);
  lines.push(`| blockTimestamp | ${meta.blockTimestamp}（${new Date(meta.blockTimestamp * 1000).toISOString()}） |`);
  lines.push(`| DataStore | \`${meta.dataStore}\` |`);
  lines.push(`| 部署产物 | ${meta.deploymentName} |`);
  lines.push(`| 合约分支/commit | ${meta.contracts.branch ?? "?"} @ ${(meta.contracts.commit ?? "?").slice(0, 12)} |`);
  lines.push(`| RPC | ${meta.rpc} |`);
  lines.push(`| 生成时间 | ${meta.generatedAt} |`);
  lines.push("");

  lines.push("## 市场");
  lines.push("");
  lines.push("| marketIndex | indexToken | collateralToken | vault |");
  lines.push("|---|---|---|---|");
  for (const market of markets) {
    lines.push(`| ${market.marketIndex} | \`${market.INDEX_TOKEN}\` | \`${market.COLLATERAL_TOKEN}\` | \`${market.VAULT}\` |`);
  }
  lines.push("");

  lines.push("## 角色成员（DataStore AccessControl）");
  lines.push("");
  lines.push("| 角色 | 成员数 | 地址 |");
  lines.push("|---|---|---|");
  for (const role of roles) {
    const list = role.members.length ? role.members.map((a) => `\`${a}\``).join("<br>") : "_（空）_";
    lines.push(`| ${role.name} | ${role.members.length} | ${list} |`);
  }
  lines.push("");

  const groups = [
    ["global", "全局参数（无维度）"],
    ["market-prop", "市场属性"],
    ["set-root", "集合型 key（元素个数）"],
    ["derived", "带维度参数"],
  ];

  for (const [group, title] of groups) {
    const rows = entries.filter((e) => e.group === group);
    if (!rows.length) continue;
    lines.push(`## ${title}（${rows.length} 项）`);
    lines.push("");
    lines.push("| key 基名 | 维度 | 类型 | 原始值 | 可读值 | 状态 | 设置路径 | key hash |");
    lines.push("|---|---|---|---|---|---|---|---|");
    for (const entry of rows.sort((a, b) => a.base.localeCompare(b.base) || (a.argLabel ?? "").localeCompare(b.argLabel ?? ""))) {
      const readable = humanize(entry.base, entry.type === "uint" || entry.type === "int" ? entry.value : null) ?? "";
      const status = entry.error ? "读取失败" : entry.unset ? "未设置(默认值)" : "已设置";
      const flag = entry.typeSource === "probe" ? " ⚠探测" : entry.typeSource === "naming-heuristic" ? " ※命名推断" : "";
      const path = (entry.settableVia ?? []).join(" / ") || "-";
      lines.push(
        `| ${entry.base}${flag} | ${entry.argLabel ?? "-"} | ${entry.type} | \`${formatValue(entry)}\` | ${readable} | ${status} | ${path} | \`${entry.key.slice(0, 18)}…\` |`
      );
    }
    lines.push("");
  }

  if (skipped.length) {
    lines.push(`## 未取数的 key（${skipped.length} 项）`);
    lines.push("");
    lines.push("这些 key 的维度不可穷举（账户地址、时间片、任意字符串等），必须由具体用例给定入参后单独读。");
    lines.push("");
    lines.push("| 派生函数 | 基键 | 参数 | 原因 |");
    lines.push("|---|---|---|---|");
    for (const item of skipped.sort((a, b) => a.base.localeCompare(b.base))) {
      lines.push(`| \`${item.fn}\` | ${item.base} | ${item.params.join(", ")} | ${item.reason} |`);
    }
    lines.push("");
  }

  lines.push("## 维度取值域");
  lines.push("");
  for (const [name, values] of Object.entries(dimensions)) {
    lines.push(`- **${name}**（${values.length}）：${values.map((v) => `${v.value}${v.label ? ` (${v.label})` : ""}`).join("、") || "_空_"}`);
  }
  lines.push("");

  lines.push("## ⚠ 探测法读数说明");
  lines.push("");
  lines.push("标 `⚠探测` 的 key 没能从合约源码推断出取值类型（没有 `dataStore.getXxx(Keys.KEY)` 的直接引用），");
  lines.push("工具对它按 uint/int/bool/address/bytes32 各读一遍全部列出。同一 key 会出现多行，");
  lines.push("**只有其中一行是真的**——用例引用前必须回源码确认该 key 的写入类型。");
  lines.push("");

  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

async function main() {
  const args = parseArgs();
  const rpcUrl = args.rpc ?? DEFAULT_RPC;
  const rpcLabel = args["rpc-label"] ?? maskRpcUrl(rpcUrl);
  const deploymentPath = resolve(args.deployment ?? DEFAULT_DEPLOYMENT);
  const outDir = resolve(args.out ?? DEFAULT_OUT);
  const registryPath = resolve(args.registry ?? join(HERE, "registry.json"));
  const onlySet = args.flags.has("only-set");
  const maxCalls = Number(args["max-calls"] ?? 40000);

  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  const addresses = JSON.parse(readFileSync(deploymentPath, "utf8"));
  const deploymentName = basename(dirname(deploymentPath));
  const dataStore = addresses["Fx100Base#DataStore"];
  if (!dataStore) throw new Error(`deployed_addresses.json 里没有 Fx100Base#DataStore：${deploymentPath}`);

  const rpc = new Rpc(rpcUrl, { batchSize: Number(args["batch-size"] ?? 100) });

  // RPC 路径可能包含私有 Fork 标识；终端与快照只记录安全的展示名。
  console.log(`RPC        ${rpcLabel}`);
  console.log(`部署产物   ${deploymentName}`);
  console.log(`DataStore  ${dataStore}`);

  const chainId = await rpc.chainId();
  const expectedChainId = args["expected-chain-id"] ? Number(args["expected-chain-id"]) : null;
  if (expectedChainId !== null && chainId !== expectedChainId) {
    throw new Error(`chainId 不匹配：RPC=${chainId}，期望=${expectedChainId}`);
  }
  const blockNumber = args.block ? Number(args.block) : await rpc.blockNumber();
  const blockInfo = await rpc.block(blockNumber);
  const blockTimestamp = Number(BigInt(blockInfo.timestamp));
  const blockTag = "0x" + BigInt(blockNumber).toString(16);
  const dataStoreCode = await rpc.single("eth_getCode", [dataStore, blockTag]);
  if (!dataStoreCode || dataStoreCode === "0x") {
    throw new Error(`DataStore 在区块 ${blockNumber} 没有合约代码：${dataStore}`);
  }
  console.log(`快照       chainId=${chainId} block=${blockNumber} timestamp=${blockTimestamp}`);

  console.log("\n[1/4] 维度发现");
  const { dimensions, markets, tokenMetadata, marketPropEntries } = await discoverDimensions(rpc, dataStore, blockNumber, registry, addresses);
  console.log(
    `  market=${dimensions.market.length} token=${dimensions.token.length} module=${dimensions.module.length} ` +
      `feeType=${dimensions.feeType.length} orderType=${dimensions.orderType.length}`
  );

  console.log("\n[2/4] 展开读取计划");
  const { plan, skipped } = buildPlan(registry, dimensions);
  console.log(`  待读 ${plan.length} 项（其中探测法 ${plan.filter((p) => p.typeSource === "probe").length} 项）· 跳过 ${skipped.length} 个不可枚举 key`);
  if (plan.length > maxCalls) {
    throw new Error(`读取项 ${plan.length} 超过 --max-calls ${maxCalls}，请缩小范围或调高上限`);
  }

  console.log("\n[3/4] 批量取数");
  const results = await rpc.readMany(
    plan.map((entry) => ({ to: dataStore, data: encodeCall(GETTER[entry.type].sig, [{ type: "bytes32", value: entry.key }]) })),
    blockNumber
  );

  const entries = [...marketPropEntries];
  plan.forEach((entry, i) => {
    const res = results[i];
    const value = res.error ? null : GETTER[entry.type].decode(res.result);
    entries.push({
      ...entry,
      value: value === null ? null : String(value),
      unset: isUnset(entry.type, value),
      error: res.error ?? null,
    });
  });
  for (const entry of entries) entry.unset ??= isUnset(entry.type, entry.value);

  // 角色成员
  const roleResults = await rpc.readMany(
    registry.roles.map((role) => ({ to: dataStore, data: encodeCall("getRoleMembers(bytes32)", [{ type: "bytes32", value: role.hash }]) })),
    blockNumber
  );
  const roles = registry.roles.map((role, i) => ({
    name: role.name,
    hash: role.hash,
    members: roleResults[i].error ? [] : decodeAddressArray(roleResults[i].result),
    error: roleResults[i].error ?? null,
  }));

  // 探测法：同一 key 的 5 行读数里，若只有一种类型非零，直接收敛为该类型
  const probeGroups = new Map();
  for (const entry of entries) {
    if (entry.typeSource !== "probe") continue;
    if (!probeGroups.has(entry.key)) probeGroups.set(entry.key, []);
    probeGroups.get(entry.key).push(entry);
  }
  let converged = 0;
  for (const group of probeGroups.values()) {
    // bool/uint 对同一非零槽位会同时为真，收敛时以「非 bool 的非零读数」为准
    const nonZero = group.filter((e) => !e.unset && !e.error && e.type !== "bool");
    if (nonZero.length === 1) {
      for (const entry of group) entry.probeConverged = entry === nonZero[0];
      converged++;
    }
  }

  const kept = onlySet ? entries.filter((e) => !e.unset || e.error) : entries;

  console.log("\n[4/4] 落盘");
  const snapshot = {
    meta: {
      tool: "config-dump",
      version: 1,
      generatedAt: new Date().toISOString(),
      rpc: rpcLabel,
      chainId,
      blockNumber,
      blockTimestamp,
      dataStore,
      deploymentName,
      deploymentPath,
      contracts: registry.generatedFrom,
      filters: { onlySet },
      counts: {
        entries: kept.length,
        set: entries.filter((e) => !e.unset && !e.error).length,
        unset: entries.filter((e) => e.unset).length,
        errors: entries.filter((e) => e.error).length,
        probeEntries: entries.filter((e) => e.typeSource === "probe").length,
        probeConvergedKeys: converged,
        skippedKeys: skipped.length,
      },
    },
    dimensions,
    markets,
    tokenMetadata,
    roles,
    entries: kept,
    skipped,
  };

  mkdirSync(outDir, { recursive: true });
  const stem = join(outDir, `${deploymentName}.params`);
  writeFileSync(`${stem}.json`, JSON.stringify(snapshot, bigintSafe, 2) + "\n");
  writeFileSync(`${stem}.md`, renderMarkdown(snapshot) + "\n");

  console.log(`  ${stem}.json`);
  console.log(`  ${stem}.md`);
  console.log(
    `\n完成：已设置 ${snapshot.meta.counts.set} · 未设置 ${snapshot.meta.counts.unset} · ` +
      `读取失败 ${snapshot.meta.counts.errors} · 探测项 ${snapshot.meta.counts.probeEntries} · 不可枚举 ${skipped.length}`
  );
}

main().catch((error) => {
  console.error(`\n失败：${error.message}`);
  process.exitCode = 1;
});

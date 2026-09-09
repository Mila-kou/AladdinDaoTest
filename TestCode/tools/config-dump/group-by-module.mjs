#!/usr/bin/env node
// 把 dump-config.mjs 产出的参数快照按**功能模块**归类，落一份 CSV。
//
//   node group-by-module.mjs --snapshot <参数快照.json>
//   node group-by-module.mjs --deployment <名字>
//   node group-by-module.mjs --only-set               # 只要已设置的（119 条那批）
//
// 为什么要折叠：类型推不出来的 key 走 probe 策略，同一个 DataStore key 会按
// uint/int/bool/address/bytes32 各读一遍**各出一行**，1982 行里有约 840 行是这种冗余。
// 五行全空 ⇒ 该 key 确实没设，折叠成一行；有一行有值 ⇒ 那行才是真的，只留它。
// 折叠掉的行数如实记在 note 列，不静默丢弃。

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { humanize } from "./lib/hints.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = resolve(HERE, "../../artifacts/parameter-cache");

/**
 * 功能模块归类规则：**有序**匹配，先具体后宽泛，命中即止。
 * 顺序很关键——LIQUIDATION_FEE_FACTOR 必须先被「清算」接住，
 * 否则会被后面的「交易费用」按 _FEE_FACTOR 抢走。
 */
const MODULES = [
  // 功能开关放第一位：`_FEATURE_DISABLED` 是最明确的后缀，不该被后面按主题的规则抢走
  // （否则 EXECUTE_ADL_FEATURE_DISABLED 会跑进 ADL、CANCEL_ORDER_FEATURE_DISABLED 跑进订单）
  ["功能开关",       /_FEATURE_DISABLED$/],
  ["市场与代币",     /^(MARKET_|INDEX_TOKEN|COLLATERAL_TOKEN$|VAULT$|VIRTUAL_(MARKET|TOKEN)_ID|IS_MARKET_DISABLED)|TOKEN_LIST/],
  ["跨链与多链",     /(MULTICHAIN|SRC_CHAIN_ID|^EID_TO_)/],
  ["Relay 与子账户", /^(RELAY_|SUBACCOUNT|MAX_RELAY)|EIP712/],
  // Gas 排在 Oracle 之前：ESTIMATED_GAS_FEE_PER_ORACLE_PRICE 名字里带 ORACLE，但它是 gas 估算参数
  ["执行费与 Gas",   /(GAS_LIMIT|GAS_FEE|EXECUTION_FEE|CALLBACK|ESTIMATED_GAS|_GAS$|GAS_TO_FORWARD|GAS_FOR_EXECUTION)/],
  ["Oracle 与价格源", /(ORACLE|DATA_STREAM|PRICE_FEED|PYTH|CHAINLINK|EDGE_|RECORDED_PRICE|^STABLE_PRICE|SEQUENCER_)/],
  ["清算与保护期",   /^LIQUIDATION_|GRACE_PERIOD|MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION/],
  ["ADL 与盈亏水位", /(ADL|PNL_FACTOR)/],
  ["资金费",         /FUNDING/],
  ["借贷与可借出",   /(BORROWING|LENDABLE|OPTIMAL_USAGE)/],
  ["兑换 Swap",      /SWAP/],
  ["定价与点差",     /(SPREAD|PRICE_IMPACT|SKEW|ORDER_BOOK_DEPTH|POSITION_IMPACT)/],
  ["风控闸门",       /^(RESERVE_FACTOR|MAX_OPEN_INTEREST|MIN_COLLATERAL|MAX_COLLATERAL|MAX_POSITION_|MIN_POSITION_|MAX_POOL_)|OPEN_INTEREST_IN_TOKENS/],
  ["订单与请求",     /^(ORDER_|REQUEST_|MAX_AUTO_CANCEL|MAX_DATA_LENGTH)|_ORDER_|ORDER_LIST/],
  ["推荐与 UI 费",   /^(REFERRAL|AFFILIATE|PRO_DISCOUNT|MIN_AFFILIATE)|UI_FEE/],
  ["交易费用与分账", /(FEE_FACTOR|FEE_RECEIVER|_FEE$|AVAILABLE_FEE_AMOUNT)/],
  ["LP 存取与金库",  /^(DEPOSIT_|WITHDRAWAL_|ATOMIC_|POOL_|HOLDING_ADDRESS|MIN_MARKET_TOKENS)/],
  ["可领取余额",     /^(CLAIMABLE_|CLAIM_)/],
  ["费用分发",       /^(FEE_DISTRIBUTOR|FEE_BATCH|CONTRIBUTOR_|MAX_TOTAL_CONTRIBUTOR|MIN_CONTRIBUTOR)/],
  ["配置同步",       /^(SYNC_CONFIG|GMX_DATA)/],
  ["运行时状态",     /^(CUMULATIVE_|COLLATERAL_SUM|TOTAL_|NONCE$|REENTRANCY)|_UPDATED_AT$|_LIST$|_AT$/],
];

const moduleOf = (base) => MODULES.find(([, re]) => re.test(base))?.[0] ?? "未分类";

/** 类型可信度：决定「未设置」这个结论本身可不可信 */
const CONFIDENCE = {
  registry: "确定", "source-scan": "确定", "set-count": "确定",
  "naming-heuristic": "命名推断", probe: "探测",
};

function parseArgs() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--deployment") out.deployment = argv[++i];
    else if (argv[i] === "--snapshot") out.snapshot = argv[++i];
    else if (argv[i] === "--only-set") out.onlySet = true;
    else if (argv[i] === "--out") out.out = argv[++i];
  }
  return out;
}

const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function main() {
  const args = parseArgs();
  if (!args.snapshot && !args.deployment) {
    throw new Error("缺少 --snapshot 或 --deployment；不再回退固定 v0.3.1 参数快照。");
  }
  const snapshotPath = args.snapshot
    ? resolve(args.snapshot)
    : resolve(CONFIG_DIR, `${args.deployment}.params.json`);
  const snap = JSON.parse(readFileSync(snapshotPath, "utf8"));

  /* ---- 1. 按 DataStore key 折叠 probe 冗余 ---- */
  const byKey = new Map();
  for (const e of snap.entries) {
    if (!byKey.has(e.key)) byKey.set(e.key, []);
    byKey.get(e.key).push(e);
  }

  const rows = [];
  for (const group of byKey.values()) {
    const withValue = group.filter((e) => !e.unset && !e.error);
    let entry, note = "";

    if (withValue.length === 1) {
      entry = withValue[0];
      if (group.length > 1) note = `同 key 探测 ${group.length} 种类型，仅此型有值`;
    } else if (withValue.length > 1) {
      // 多型同时有值：不替使用者做选择，全部保留并标注
      for (const e of withValue) {
        rows.push(buildRow(e, `⚠ 同 key ${withValue.length} 种类型都读到值，需回源码定型`));
      }
      continue;
    } else {
      entry = group[0];
      if (group.length > 1) note = `探测 ${group.length} 种类型均无值`;
    }
    rows.push(buildRow(entry, note));
  }

  /* ---- 2. 排序：模块 → 已设置优先 → base → 维度 ---- */
  const moduleOrder = new Map(MODULES.map(([name], i) => [name, i]));
  rows.sort((a, b) =>
    (moduleOrder.get(a.module) ?? 99) - (moduleOrder.get(b.module) ?? 99) ||
    (a.status === "已设置" ? 0 : 1) - (b.status === "已设置" ? 0 : 1) ||
    a.base.localeCompare(b.base) ||
    a.argLabel.localeCompare(b.argLabel));

  const output = args.onlySet ? rows.filter((r) => r.status === "已设置") : rows;

  /* ---- 3. 落 CSV ---- */
  const HEADER = [
    "module", "base", "argLabel", "status", "value", "readable",
    "type", "typeConfidence", "settableVia", "group", "key", "note",
  ];
  const csv = [
    HEADER.join(","),
    ...output.map((r) => HEADER.map((h) => csvCell(r[h])).join(",")),
  ].join("\n") + "\n";

  const outPath = args.out
    ? resolve(args.out)
    : resolve(dirname(snapshotPath), `${snap.meta.deploymentName}.params-by-module${args.onlySet ? "-set" : ""}.csv`);
  writeFileSync(outPath, csv, "utf8");

  /* ---- 4. 终端摘要 ---- */
  const m = snap.meta;
  console.log(`\n参数汇总（按功能模块）`);
  console.log(`部署 ${m.deploymentName} · chainId ${m.chainId} · @block ${m.blockNumber}`);
  console.log(`原始 ${snap.entries.length} 条 → 折叠后 ${rows.length} 行（去掉 ${snap.entries.length - rows.length} 行探测冗余）\n`);

  const stat = new Map();
  for (const r of rows) {
    const s = stat.get(r.module) ?? { set: 0, unset: 0 };
    r.status === "已设置" ? s.set++ : s.unset++;
    stat.set(r.module, s);
  }
  const order = [...MODULES.map(([n]) => n), "未分类"];
  console.log(`${"功能模块".padEnd(16)}  已设置   未设置`);
  console.log("─".repeat(40));
  for (const name of order) {
    const s = stat.get(name);
    if (!s) continue;
    const pad = name + " ".repeat(Math.max(0, 16 - [...name].reduce((n, ch) => n + (ch.charCodeAt(0) > 127 ? 2 : 1), 0)));
    console.log(`${pad}  ${String(s.set).padStart(4)}   ${String(s.unset).padStart(6)}`);
  }
  console.log("─".repeat(40));
  const totalSet = rows.filter((r) => r.status === "已设置").length;
  console.log(`${"合计".padEnd(14)}  ${String(totalSet).padStart(4)}   ${String(rows.length - totalSet).padStart(6)}`);

  const unclassified = rows.filter((r) => r.module === "未分类");
  if (unclassified.length) {
    console.log(`\n⚠ ${unclassified.length} 行未归类，base key：`);
    console.log("  " + [...new Set(unclassified.map((r) => r.base))].join(", "));
    console.log("  → 补 MODULES 规则后重跑");
  }
  console.log(`\n落盘：${outPath}\n`);
}

function buildRow(e, note) {
  const isSet = !e.unset && !e.error;
  const confidence = CONFIDENCE[e.typeSource] ?? e.typeSource;
  return {
    module: moduleOf(e.base),
    base: e.base,
    argLabel: e.argLabel ?? "",
    // 未设置且类型靠推断时，「未设置」这个结论本身不可信——如实标出来，不装作确定
    status: isSet ? "已设置" : confidence === "确定" ? "未设置" : `未设置(${confidence})`,
    // 未设置也是链上实际状态：保留 0 / false / 零地址，不再用空白伪装成“没有取数”。
    value: e.error ? "" : (e.value ?? ""),
    readable: e.error ? "" : humanize(e.base, e.value),
    type: e.type ?? "",
    typeConfidence: confidence,
    settableVia: (e.settableVia ?? []).join(" / "),
    group: e.group,
    key: e.key,
    note: e.error ? `读取失败: ${e.error}` : note,
  };
}

main();

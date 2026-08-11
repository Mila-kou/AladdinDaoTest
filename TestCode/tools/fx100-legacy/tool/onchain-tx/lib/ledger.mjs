// 账本快照 / Delta / 守恒校验 / CSV 落盘。
// 槽位依据附录 D §一（LedgerSnapshot 槽位表）与 cases/integration/POS.md 的集成层子集。
// 守恒式 L1（T0，零容差）：Δtrader + ΔorderVault + ΔposVault + ΔlpVault + ΔfeeReceiver = 0

import { mkdirSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

import { encodeCall, decodeUint } from "../../config-dump/lib/abi.mjs";
import { splitWords, wordToBigInt, wordToAddress, wordToBool } from "./decode.mjs";
import { BASE, cumulativeOpenCostsKey, openInterestInTokensKey, claimableFeeAmountKey, positionImpactPoolAmountKey, positionKey } from "./keys.mjs";

/** 守恒五方：谁的 USDC 余额进 L1 守恒式 */
export const CONSERVATION_SLOTS = ["traderUsdc", "orderVaultUsdc", "posVaultUsdc", "lpVaultAssets", "feeReceiverUsdc"];

// Position.Props 是全静态元组，返回数据 = 12 个 word，无 offset 头
const POSITION_FIELDS = [
  "account",
  "marketIndex",
  "sizeInUsd",
  "sizeInTokens",
  "collateralAmount",
  "negativeFundingFeePerSize",
  "positiveFundingFeePerSize",
  "increasedAtTime",
  "decreasedAtTime",
  "graceStart",
  "graceEnd",
  "isLong",
];

/**
 * 采一份账本快照，固定在同一 block。
 * @param {import("../../config-dump/lib/rpc.mjs").Rpc} rpc
 * @param {object} deployment loadDeployment() 的结果
 * @param {{trader:string, marketIndex:number|bigint, isLong:boolean}} ctx
 * @param {number} blockNumber 钉块——不钉块两次快照不可比
 */
export async function snapshot(rpc, deployment, ctx, blockNumber) {
  const a = deployment.addresses;
  const mi = ctx.marketIndex;
  const posKey = positionKey(ctx.trader, mi, ctx.isLong);

  const balanceOf = (holder) => ({
    to: a.usdc,
    data: encodeCall("balanceOf(address)", [{ type: "address", value: holder }]),
  });
  const getUint = (key) => ({
    to: a.dataStore,
    data: encodeCall("getUint(bytes32)", [{ type: "bytes32", value: key }]),
  });

  const plan = [
    ["traderUsdc", balanceOf(ctx.trader), "uint"],
    ["orderVaultUsdc", balanceOf(a.orderVault), "uint"],
    ["posVaultUsdc", balanceOf(a.positionVault), "uint"],
    ["feeReceiverUsdc", balanceOf(a.feeHandler), "uint"],
    ["lpVaultAssets", { to: a.lpVault, data: encodeCall("totalAssets()", []) }, "uint"],

    ["cumulativeOpenCostsLong", getUint(cumulativeOpenCostsKey(mi, true)), "uint"],
    ["cumulativeOpenCostsShort", getUint(cumulativeOpenCostsKey(mi, false)), "uint"],
    ["openInterestInTokensLong", getUint(openInterestInTokensKey(mi, true)), "uint"],
    ["openInterestInTokensShort", getUint(openInterestInTokensKey(mi, false)), "uint"],
    ["claimableFeeAmountPosition", getUint(claimableFeeAmountKey(mi, a.usdc, BASE.POSITION_FEE_TYPE)), "uint"],
    ["claimableFeeAmountFunding", getUint(claimableFeeAmountKey(mi, a.usdc, BASE.FUNDING_FEE_TYPE)), "uint"],
    // 清算费 receiver 份额进的是**独立槽位**（`DecreasePositionCollateralUtils.sol:229`），
    // 不混进 POSITION_FEE_TYPE。LIQ 域组参数要求三槽齐全；此前只有两槽，
    // 于是 IT-LIQ-* 里「claimable(LIQUIDATION) Delta = 0」这类断言全部**空过**
    // （读到 undefined，被调用方的 `?? 0n` 兜成 0）。
    ["claimableFeeAmountLiquidation", getUint(claimableFeeAmountKey(mi, a.usdc, BASE.LIQUIDATION_FEE_TYPE)), "uint"],
    ["positionImpactPoolAmount", getUint(positionImpactPoolAmountKey(mi)), "uint"],

    [
      "position",
      {
        to: a.reader,
        data: encodeCall("getPosition(address,bytes32)", [
          { type: "address", value: a.dataStore },
          { type: "bytes32", value: posKey },
        ]),
      },
      "position",
    ],
  ];

  const results = await rpc.readMany(plan.map(([, call]) => call), blockNumber, "快照 ");

  const values = {};
  const errors = [];
  plan.forEach(([name, , kind], i) => {
    const r = results[i];
    // 读不到就是读不到——绝不当作 0（config-dump 同款铁律）
    if (!r || r.error) {
      errors.push(`${name}: ${r?.error ?? "无返回"}`);
      values[name] = null;
      return;
    }
    values[name] = kind === "position" ? decodePosition(r.result) : decodeUint(r.result);
  });

  return { blockNumber, posKey, values, errors };
}

function decodePosition(hex) {
  if (!hex || hex === "0x") return null;
  const words = splitWords(hex);
  if (words.length < POSITION_FIELDS.length) return null;
  const out = {};
  POSITION_FIELDS.forEach((field, i) => {
    const word = words[i];
    if (field === "account") out.account = wordToAddress(word);
    else if (field === "isLong") out.isLong = wordToBool(word);
    else out[field] = wordToBigInt(word);
  });
  out.exists = out.account !== "0x0000000000000000000000000000000000000000";
  return out;
}

/** 逐槽位算 Delta（after − before）。缺读数的槽位标 null，不参与守恒。 */
export function diff(before, after) {
  const deltas = {};
  for (const key of Object.keys(before.values)) {
    const b = before.values[key];
    const a = after.values[key];
    if (typeof b === "bigint" && typeof a === "bigint") deltas[key] = a - b;
    else deltas[key] = null;
  }
  return deltas;
}

/**
 * L1 守恒校验（T0 零容差）。任一槽位缺读数即判 UNVERIFIABLE——
 * 缺读数不等于守恒成立，不许当作通过。
 */
export function checkConservation(deltas) {
  const missing = CONSERVATION_SLOTS.filter((slot) => typeof deltas[slot] !== "bigint");
  if (missing.length) {
    return { status: "UNVERIFIABLE", sum: null, missing, terms: {} };
  }
  const terms = Object.fromEntries(CONSERVATION_SLOTS.map((s) => [s, deltas[s]]));
  const sum = CONSERVATION_SLOTS.reduce((acc, s) => acc + deltas[s], 0n);
  return { status: sum === 0n ? "PASS" : "FAIL", sum, missing: [], terms };
}

/* ---------------- CSV 落盘：reports/ledger/<用例ID>.csv（标准 03 §五 / 04 §3.3） ---------------- */

// 与集成层 test/shared/LedgerCsv.sol 同一套表头，规范见 reports/README.md「统一格式 v2」。
// 改这里要同步改：LedgerCsv.sol · dashboard/lib/reports.mjs · reports/README.md
const CSV_HEADER =
  "caseId,step,field,before,after,delta,expected,match,unit,blockBefore,blockAfter,txHash,note";

/** 守恒行的 field 名，两层统一 */
export const ZERO_SUM_FIELD = "ZERO_SUM";

function csvCell(value) {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 单位标注按附录 C §一 精度公约表 */
const UNIT = {
  traderUsdc: "USDC 1e6",
  orderVaultUsdc: "USDC 1e6",
  posVaultUsdc: "USDC 1e6",
  lpVaultAssets: "USDC 1e6",
  feeReceiverUsdc: "USDC 1e6",
  claimableFeeAmountPosition: "USDC 1e6",
  claimableFeeAmountFunding: "USDC 1e6",
  claimableFeeAmountLiquidation: "USDC 1e6",
  cumulativeOpenCostsLong: "USD 1e30",
  cumulativeOpenCostsShort: "USD 1e30",
  openInterestInTokensLong: "Token 1e18",
  openInterestInTokensShort: "Token 1e18",
  positionImpactPoolAmount: "Token 1e18",
};

/**
 * 追加一步账本流水到 CSV。
 * match 列：有期望值时比对期望，无期望值时留空——不写 TRUE 冒充核对过。
 */
export function appendCsv(path, { caseId, step, before, after, deltas, txHash, expected = {}, note = "" }) {
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) writeFileSync(path, CSV_HEADER + "\n", "utf8");

  const rows = [];
  for (const slot of Object.keys(before.values)) {
    if (slot === "position") continue;
    const b = before.values[slot];
    const a = after.values[slot];
    const d = deltas[slot];
    // expected 为空时 match 必须留空——空期望配 TRUE 就是拿「没核对」冒充「核对通过」
    const hasExpected = Object.prototype.hasOwnProperty.call(expected, slot);
    const exp = hasExpected ? BigInt(expected[slot]) : null;
    const match = !hasExpected ? "" : d !== null && d === exp ? "TRUE" : "FALSE";
    rows.push(
      [
        caseId, step, slot,
        b ?? "", a ?? "", d ?? "",
        exp ?? "", match,
        UNIT[slot] ?? "",
        before.blockNumber, after.blockNumber,
        txHash ?? "", note,
      ].map(csvCell).join(","),
    );
  }
  appendFileSync(path, rows.join("\n") + "\n", "utf8");
  return rows.length;
}

/** 守恒校验结果也落一行，便于看板直接读「这步守不守恒」 */
export function appendConservationRow(path, { caseId, step, conservation, before, after, txHash }) {
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) writeFileSync(path, CSV_HEADER + "\n", "utf8");
  // 守恒的期望值恒为 0；UNVERIFIABLE 时 match 留空——缺读数不等于守恒成立
  const row = [
    caseId, step, ZERO_SUM_FIELD,
    "-", "-", conservation.sum ?? "",
    "0",
    conservation.status === "PASS" ? "TRUE" : conservation.status === "FAIL" ? "FALSE" : "",
    "USDC 1e6",
    before.blockNumber, after.blockNumber, txHash ?? "",
    conservation.status === "UNVERIFIABLE" ? `缺读数: ${conservation.missing.join("|")}` : "Δ五方求和",
  ].map(csvCell).join(",");
  appendFileSync(path, row + "\n", "utf8");
}

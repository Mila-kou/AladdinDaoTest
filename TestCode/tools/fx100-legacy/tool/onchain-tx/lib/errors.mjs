// revert 解码：从部署产物 abi/*.json 收集全部自定义 error，建 selector → 签名表。
//
// 为什么不用 cast 4byte：那要联网查 4byte.directory，且同 selector 常有多个候选；
// 部署产物里的 ABI 就是这套合约的真值，离线、无歧义。

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { selector } from "../../config-dump/lib/abi.mjs";
import { splitWords, wordToBigInt, wordToAddress } from "./decode.mjs";

let TABLE = null;

/** 建表：selector → {name, inputs[]} */
export function buildErrorTable(deploymentDir) {
  if (TABLE) return TABLE;
  TABLE = new Map();
  const abiDir = join(deploymentDir, "abi");
  let files = [];
  try { files = readdirSync(abiDir); } catch { return TABLE; }

  for (const name of files) {
    if (!name.endsWith(".json")) continue;
    let items;
    try {
      const raw = JSON.parse(readFileSync(join(abiDir, name), "utf8"));
      items = Array.isArray(raw) ? raw : raw.abi ?? [];
    } catch { continue; }
    for (const item of items) {
      if (item.type !== "error") continue;
      const sig = `${item.name}(${(item.inputs ?? []).map((i) => i.type).join(",")})`;
      TABLE.set(selector(sig), { name: item.name, inputs: item.inputs ?? [], sig });
    }
  }
  // Error(string) / Panic(uint256) 是 solidity 内建，ABI 里没有
  TABLE.set(selector("Error(string)"), { name: "Error", inputs: [{ name: "reason", type: "string" }], sig: "Error(string)" });
  TABLE.set(selector("Panic(uint256)"), { name: "Panic", inputs: [{ name: "code", type: "uint256" }], sig: "Panic(uint256)" });
  return TABLE;
}

/**
 * 解一条 revert data。解不出就如实说解不出，不猜。
 * @returns {{decoded:boolean, name?:string, args?:Array, text:string}}
 */
export function decodeRevert(data, deploymentDir) {
  const hex = extractHex(data);
  if (!hex || hex.length < 10) return { decoded: false, text: String(data).slice(0, 200) };

  const table = buildErrorTable(deploymentDir);
  const sel = hex.slice(0, 10).toLowerCase();
  const entry = table.get(sel);
  if (!entry) return { decoded: false, text: `未知 error（selector ${sel}）` };

  const words = splitWords("0x" + hex.slice(10));
  const args = entry.inputs.map((input, i) => {
    const word = words[i];
    if (word === undefined) return { name: input.name, type: input.type, value: "(缺)" };
    let value;
    if (input.type === "address") value = wordToAddress(word);
    else if (input.type === "bool") value = wordToBigInt(word) !== 0n ? "true" : "false";
    else if (input.type.startsWith("uint") || input.type.startsWith("int")) value = wordToBigInt(word).toString();
    else if (input.type === "string") value = decodeStringArg("0x" + hex.slice(10), i);
    else value = "0x" + word;
    return { name: input.name, type: input.type, value };
  });

  const text = `${entry.name}(${args.map((x) => `${x.name || x.type}=${x.value}`).join(", ")})`;
  return { decoded: true, name: entry.name, args, text, sig: entry.sig };
}

function decodeStringArg(payload, index) {
  try {
    const words = splitWords(payload);
    const offset = Number(wordToBigInt(words[index])) * 2;
    const body = payload.slice(2);
    const len = Number(BigInt("0x" + body.slice(offset, offset + 64)));
    const bytes = body.slice(offset + 64, offset + 64 + len * 2);
    return Buffer.from(bytes, "hex").toString("utf8");
  } catch {
    return "(解不出)";
  }
}

/** 从 cast/RPC 的各种错误文本里抠出 revert data */
function extractHex(input) {
  if (typeof input !== "string") return null;
  const m = input.match(/0x[0-9a-fA-F]{8,}/);
  return m ? m[0] : null;
}

/** 常见 revert 的处置建议——只给确定的，猜不出就不编 */
export const REMEDY = {
  ERC20InsufficientAllowance: (args) =>
    `USDC 未授权给 spender ${args.find((a) => a.type === "address")?.value ?? "?"}。` +
    `执行：cast send <USDC> "approve(address,uint256)" <spender> <amount> --rpc-url <rpc>（spender 是 Router，不是 ExchangeRouter）`,
  ERC20InsufficientBalance: () => "余额不足。测试 USDC 走 /faucet（10 USDC/24h/钱包），大额需 MockUSDC owner 划拨",
  InsufficientPositionSize: () => "size 低于 MIN_POSITION_SIZE_USD（本部署 10 USD）",
  EmptySecondaryPrice: () => "该 token 的 latestRecordedPrice 为空（R-ORA-13），需 keeper 先 refreshLatestRecordedPrices 喂价",
  MaxPriceAgeExceeded: () => "缓存价超龄，需 keeper 刷新报价",
  Unauthorized: () => "调用方没有该角色。ORDER_KEEPER 等角色需 admin grantRole",
};

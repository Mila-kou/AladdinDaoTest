// 发交易类工具的公共护栏与签名出口。
// 抽出来共用，是为了避免两个工具各写一套、某一套漏掉一道卡——护栏分叉就是安全 bug。

import { execFileSync } from "node:child_process";

const BASE_MAINNET = 8453;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
export const isAddress = (value) => /^0x[0-9a-fA-F]{40}$/.test(String(value));
export const sameAddress = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/** 通用 --flag / --key value 解析；repeatable 里的键可重复出现，收进数组 */
export function parseArgs(repeatable = []) {
  const argv = process.argv.slice(2);
  const args = { flags: new Set() };
  for (const key of repeatable) args[key] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const name = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args.flags.add(name);
      continue;
    }
    if (repeatable.includes(name)) args[name].push(next);
    else args[name] = next;
    i++;
  }
  return args;
}

/** 私钥红线：任何形式的私钥入参一律拒绝，不给「就这一次」的口子 */
export function rejectPrivateKeys(args) {
  for (const name of ["private-key", "privateKey", "pk", "keystore-password", "password"]) {
    if (args.flags.has(name) || args[name]) {
      throw new Error(
        `本工具不接受私钥/口令（--${name}）。请用 \`cast wallet import <名字> --interactive\` 导入 keystore，然后 --account <名字>；密码由 cast 自己向你要。`
      );
    }
  }
}

/**
 * 执行前的通用护栏。任一不满足直接抛错中止。
 * @param extraGates 额外关卡 [{ condition, flag, message }]，condition 为真且 flag 未给出时拒绝
 */
export function assertExecuteAllowed({ args, chainId, extraGates = [] }) {
  // 签名者两种来源：keystore（默认，推荐）或密钥文件（降级路径，调用方须自行限制使用范围）。
  // 这里只校验「指定了签名者」，不接触私钥内容——本模块始终不读、不传、不打印私钥。
  if (!args.account && !args["key-file"]) {
    throw new Error("--execute 必须配 --account <keystore名>（`cast wallet list` 可看已导入的名字）");
  }
  if (!args.flags.has("yes")) {
    throw new Error("--execute 必须同时加 --yes 明确确认；这会向链上发出真实交易。");
  }
  if (chainId === BASE_MAINNET && !args.flags.has("allow-mainnet")) {
    throw new Error(`chainId ${chainId} 是 Base 主网。本工具默认只在测试网执行，确需主网请加 --allow-mainnet。`);
  }
  for (const gate of extraGates) {
    if (gate.condition && !args.flags.has(gate.flag)) {
      throw new Error(`${gate.message} 确需执行请加 --${gate.flag}。`);
    }
  }
}

/**
 * 经 cast 发交易。stdio: inherit —— keystore 密码由 cast 直接向用户索取，
 * 本进程既不读取也不转发，更不会进日志。
 */
export function sendWithCast({ to, sig, params = [], value, rpcUrl, account }) {
  const cmd = ["send", to];
  if (sig) cmd.push(sig, ...params.map(String));
  if (value !== undefined) cmd.push("--value", String(value));
  cmd.push("--rpc-url", rpcUrl, "--account", account);
  execFileSync("cast", cmd, { stdio: "inherit" });
}

/**
 * 同 sendWithCast，但捕获 `--json` 回执并返回 {txHash, blockNumber, status, gasUsed}。
 * 取证类工具（账本对账要记 txHash + 区块号）用这个。
 *
 * stdio 三路分开：stdin 继承（keystore 密码由 cast 直接向用户索取，本进程不经手）、
 * stdout 捕获（JSON 回执）、stderr 继承（进度与密码提示照常显示）。
 * 出错时命令行不进异常信息——即便将来有人误传密钥，也不会被打进日志。
 */
export function sendWithCastReceipt({ to, sig, params = [], data, value, rpcUrl, account, confirmations = 1 }) {
  const cmd = ["send", to];
  // data = 已编码好的 raw calldata（multicall 这类嵌套调用用它）；否则走 sig + params
  if (data) cmd.push(data);
  else if (sig) cmd.push(sig, ...params.map(String));
  if (value !== undefined) cmd.push("--value", String(value));
  cmd.push("--rpc-url", rpcUrl, "--account", account, "--confirmations", String(confirmations), "--json");

  let stdout;
  try {
    stdout = execFileSync("cast", cmd, {
      stdio: ["inherit", "pipe", "inherit"],
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    // 只留 cast 的退出码，不回显命令行
    throw new Error(`cast send 失败（退出码 ${error.status ?? "?"}），详见上方 cast 输出`);
  }

  const line = stdout.split("\n").find((l) => l.trim().startsWith("{"));
  if (!line) throw new Error("cast send 没有返回 JSON 回执");
  const r = JSON.parse(line);
  return {
    txHash: r.transactionHash,
    blockNumber: Number(BigInt(r.blockNumber)),
    status: BigInt(r.status ?? "0x1") === 1n ? "success" : "reverted",
    gasUsed: String(BigInt(r.gasUsed ?? 0)),
    receipt: r,
  };
}

/** 供人复核/手动执行的命令行（不含任何密钥） */
export function castCommandLine({ to, sig, params = [], data, value, rpcUrl, account }) {
  const parts = ["cast send", to];
  if (data) parts.push(data.length > 74 ? `${data.slice(0, 66)}…(${(data.length - 2) / 2} 字节)` : data);
  else if (sig) parts.push(`"${sig}"`, ...params.map(String));
  if (value !== undefined) parts.push("--value", String(value));
  parts.push("--rpc-url", rpcUrl, "--account", account ?? "<你的keystore名>");
  return parts.join(" ");
}

/* ---------- 十进制金额 <-> 原始整数：全程 BigInt，不碰浮点 ---------- */

export function parseUnits(value, decimals) {
  const text = String(value).trim();
  if (!/^-?\d*\.?\d*$/.test(text) || text === "" || text === ".") {
    throw new Error(`不是合法数量：${value}`);
  }
  const negative = text.startsWith("-");
  const [whole = "0", fraction = ""] = (negative ? text.slice(1) : text).split(".");
  if (fraction.length > decimals) {
    throw new Error(`${value} 的小数位超过该代币精度（${decimals} 位），会被静默截断，请改写`);
  }
  const raw = BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
  return negative ? -raw : raw;
}

export function formatUnits(raw, decimals, maxFractionDigits = 6) {
  const value = BigInt(raw);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let fraction = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  if (fraction.length > maxFractionDigits) fraction = fraction.slice(0, maxFractionDigits) + "…";
  return `${negative ? "-" : ""}${whole}${fraction ? "." + fraction : ""}`;
}

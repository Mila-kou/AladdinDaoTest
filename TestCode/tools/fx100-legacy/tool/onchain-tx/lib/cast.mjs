// cast 封装：calldata 编码、模拟调用、签名广播。
//
// 为什么编码交给 cast 而不是自己写：CreateOrderParams 是嵌套 + 含动态数组（dataList）的
// struct，手写 ABI 编码的出错面远大于收益，而 foundry 本来就是必装依赖。
//
// **签名一律走 keystore**，与 fund / role-grant / lp-deposit 共用 `tool/lib/exec-guard.mjs`
// 的护栏与签名出口。本文件不接受、不读取、不转发私钥。
//
// 历史教训（ISS-013）：早先版本用 `--private-key <值>` 传参，`execFileSync` 抛错时会把
// 完整命令行塞进 error.message，导致 admin 私钥被打进终端与会话记录。护栏分叉就是安全 bug——
// 所以这里不再自建发送路径，统一收敛到 exec-guard。

import { execFileSync } from "node:child_process";

export { sendWithCastReceipt as send, castCommandLine } from "../../lib/exec-guard.mjs";

/** 把任何 64 位 hex 串替换掉，兜底防止密钥类数据进日志 */
const scrub = (text) => String(text ?? "").replace(/(0x)?[0-9a-fA-F]{64}/g, "0x***REDACTED***");

function cast(args, { allowFail = false } = {}) {
  try {
    return execFileSync("cast", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
    }).trim();
  } catch (error) {
    const message = scrub((error.stderr?.toString() || error.message || "").trim());
    if (allowFail) return { error: message };
    const err = new Error(`cast ${args[0]} 失败: ${message}`);
    err.stack = scrub(err.stack);
    throw err;
  }
}

/** 编码一次函数调用为 calldata */
export const calldata = (signature, params) => cast(["calldata", signature, ...params.map(String)]);

/** 只读模拟，返回原始 hex（用来在广播前拿 createOrder 的返回值、提前发现必 revert 的单） */
export function simulate({ to, data, from, rpc, value = "0" }) {
  const args = ["call", to, data, "--rpc-url", rpc, "--value", String(value)];
  if (from) args.push("--from", from);
  const out = cast(args, { allowFail: true });
  return typeof out === "string" ? { ok: true, result: out } : { ok: false, error: out.error };
}

/** keystore 名 → 地址。不涉及私钥，cast 从 keystore 文件读公开部分。 */
export function addressOfAccount(account) {
  const out = cast(["wallet", "address", "--account", account], { allowFail: true });
  return typeof out === "string" ? out.toLowerCase() : null;
}

/** 已导入的 keystore 列表，报错时提示用户可用的名字 */
export function listAccounts() {
  const out = cast(["wallet", "list"], { allowFail: true });
  return typeof out === "string" ? out.split("\n").map((l) => l.trim()).filter(Boolean) : [];
}

export function hasCast() {
  return typeof cast(["--version"], { allowFail: true }) === "string";
}

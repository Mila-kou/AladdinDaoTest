// 动作原语与广播器。
//
// 链上动作的构造与发送全部来自 [`tool/onchain-tx/lib/flows.mjs`](../../tool/onchain-tx/lib/flows.mjs)
// ——那些流程已经在 fork 上跑通过真交易（`E2E-POS-004-fork.json` 是证据）。
// 本文件只做「三种广播模式」的分叉，不重复实现任何链上逻辑。
//
// ## 三种广播模式
//
// | 模式 | 怎么发 | 要私钥吗 | 默认 |
// |---|---|---|---|
// | `dry-run` | `eth_call` 模拟，**不发交易** | — | ✅ |
// | `impersonate` | fork 免签名以任意地址发（`eth_sendTransaction`） | ❌ | 集成层真跑用这个 |
// | `keystore` | `cast send --account`，密码由 cast 直接索取 | 由 cast 经手 | 真测试网才需要 |
//
// fork 上用 impersonation 的理由：集成层要反复发交易对账，每次掏 keystore 密码不现实；
// 而 impersonation 不碰私钥、不消耗真实资产、fork 随时可重置。

import { calldata, simulate, send as castSend } from "../../tool/onchain-tx/lib/cast.mjs";
import { decodeRevert } from "../../tool/onchain-tx/lib/errors.mjs";
import {
  assertImpersonatable,
  sendImpersonated,
  extractOrderKey,
  buildIncreaseMulticall,
  buildDecreaseOrder,
  acceptAnyPrice,
  waitForExecution,
} from "../../tool/onchain-tx/lib/flows.mjs";

export { buildIncreaseMulticall, buildDecreaseOrder, acceptAnyPrice, extractOrderKey, waitForExecution };

/**
 * dry-run 广播器：只做 `eth_call` 模拟。
 *
 * 模拟能回答的：**这笔交易发出去会不会 revert、返回值是什么**（含 orderKey）。
 * 回答不了的：交易上链后的状态变化——那些核对点一律走 `t.skip()`，
 * **绝不拿模拟结果冒充真实结果**。
 */
export function dryRunBroadcaster({ rpcUrl, deploymentDir }) {
  return {
    mode: "dry-run",
    simulated: true,
    async send({ to, data, from, value = "0", label }) {
      const out = simulate({ to, data, from, rpc: rpcUrl, value });
      if (!out.ok) return { ok: false, simulated: true, error: decodeRevertSafe(out.error, deploymentDir), label };
      return { ok: true, simulated: true, result: out.result, orderKey: extractOrderKey(out.result), txHash: null, label };
    },
  };
}

/**
 * fork 免签名广播器。**每次构造时先探能力**——探不通就不是 fork，直接拒绝，
 * 绝不在真链上以别人的身份发交易。
 */
export async function impersonateBroadcaster({ rpcUrl, deploymentDir }) {
  await assertImpersonatable(rpcUrl);
  return {
    mode: "impersonate",
    simulated: false,
    async send({ to, data, from, value = "0", label }) {
      // 先模拟：失败的话拿到可读的 revert 原因，比 receipt 里的 status=0 有用得多
      const sim = simulate({ to, data, from, rpc: rpcUrl, value });
      if (!sim.ok) return { ok: false, simulated: true, error: decodeRevertSafe(sim.error, deploymentDir), label };

      const receipt = await sendImpersonated(rpcUrl, { from, to, data, value });
      return {
        ok: receipt.status === "success",
        simulated: false,
        txHash: receipt.txHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
        orderKey: extractOrderKey(sim.result),
        error: receipt.status === "success" ? null : "交易 reverted",
        label,
      };
    },
  };
}

/**
 * keystore 广播器（真测试网路径）。护栏在 `tool/lib/exec-guard.mjs`，这里不重复实现也不绕过。
 * 集成层默认不用它——验收口径是 fork。
 */
export function keystoreBroadcaster({ rpcUrl, account, deploymentDir }) {
  return {
    mode: "keystore",
    simulated: false,
    async send({ to, data, from, value = "0", label }) {
      const sim = simulate({ to, data, from, rpc: rpcUrl, value });
      if (!sim.ok) return { ok: false, simulated: true, error: decodeRevertSafe(sim.error, deploymentDir), label };
      const receipt = castSend({ to, data, value: String(value), rpcUrl, account });
      return {
        ok: receipt.status === "success",
        simulated: false,
        txHash: receipt.txHash,
        blockNumber: receipt.blockNumber,
        orderKey: extractOrderKey(sim.result),
        label,
      };
    },
  };
}

function decodeRevertSafe(error, deploymentDir) {
  const hex = /0x[0-9a-fA-F]{8,}/.exec(String(error ?? ""))?.[0];
  if (!hex) return String(error ?? "").slice(0, 400);
  try {
    const decoded = decodeRevert(hex, deploymentDir);
    return decoded?.text ?? String(error).slice(0, 400);
  } catch {
    return String(error).slice(0, 400);
  }
}

/* ------------------------------------------------------------ 只读 */

/** 单次只读调用。`Rpc` 提供的是 `single(method, params)`，包一层免得每处都写全 */
export function ethCall(rpc, { to, data }, block = "latest") {
  return rpc.single("eth_call", [{ to, data }, block]);
}

export async function readUint(rpc, to, signature, params = []) {
  const hex = await ethCall(rpc, { to, data: calldata(signature, params) });
  return BigInt(hex || "0x0");
}

/** 订单是否还在挂单态（供 `waitForExecution` 的判定回调用） */
/**
 * 订单是否还在挂单态。
 *
 * ⚠️ **`block` 必须显式传**，否则默认查 `latest` —— 那会造成竞态：
 * 「s1 挂单期订单应当在 ORDER_LIST 里」这类断言，如果查 latest，keeper 快的时候
 * 订单已被执行、断言假红；keeper 慢的时候又能过。单跑绿、全套红，最难查的那种 flaky。
 * 查历史状态一律钉块。
 */
export async function orderIsPending(rpc, { dataStore, orderListKey, orderKey, block = "latest" }) {
  const hex = await ethCall(
    rpc,
    { to: dataStore, data: calldata("containsBytes32(bytes32,bytes32)", [orderListKey, orderKey]) },
    typeof block === "number" ? "0x" + block.toString(16) : block
  );
  return BigInt(hex || "0x0") !== 0n;
}

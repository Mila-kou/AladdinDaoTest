// JSON-RPC 客户端：批量 eth_call + 固定 block 快照。
// 用批量请求而非 Multicall3，理由：无需部署依赖，任何 RPC 都能跑；
// 单条失败只影响该条（结果里带 error），不会整批回滚。

import { encodeAggregate3, decodeAggregate3 } from "./abi.mjs";

// Multicall3 的规范地址，在 Base / Base Sepolia 等绝大多数链上一致
export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

const DEFAULT_MULTICALL_CHUNK = 400;
const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_RETRIES = 3;
const DEFAULT_THROTTLE_MS = 120;
const RATE_LIMIT_PASSES = 6;

// 公共 RPC（sepolia.base.org）会按条限流，返回 {"error":{"message":"over rate limit"}}。
// 这类错误不是「读取失败」，是「没读到」，必须退避重试，否则快照会静默残缺。
const RATE_LIMIT_RE = /rate limit|429|too many requests|exceeded/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Rpc {
  constructor(url, { batchSize = DEFAULT_BATCH_SIZE, retries = DEFAULT_RETRIES, timeoutMs = 30000, throttleMs = DEFAULT_THROTTLE_MS } = {}) {
    this.url = url;
    this.batchSize = batchSize;
    this.retries = retries;
    this.timeoutMs = timeoutMs;
    this.throttleMs = throttleMs;
    this.callCount = 0;
    this.rateLimitHits = 0;
    this.multicallChunk = DEFAULT_MULTICALL_CHUNK;
    this.multicallAvailable = null; // null=未探测
  }

  /** Multicall3 是否可用（有代码）。不可用时自动退回逐条批量。 */
  async hasMulticall3() {
    if (this.multicallAvailable !== null) return this.multicallAvailable;
    try {
      const code = await this.single("eth_getCode", [MULTICALL3, "latest"]);
      this.multicallAvailable = Boolean(code) && code !== "0x";
    } catch {
      this.multicallAvailable = false;
    }
    return this.multicallAvailable;
  }

  /**
   * 读取入口：优先 Multicall3（1 次 RPC 打包数百次读取），否则退回逐条批量。
   * 返回与入参同序的 [{result}|{error}]。
   */
  async readMany(calls, blockNumber, label = "") {
    if (calls.length === 0) return [];
    if (await this.hasMulticall3()) return this.#multicallRead(calls, blockNumber, label);
    process.stderr.write("  Multicall3 不可用，退回逐条批量（会明显变慢且更容易触发限流）\n");
    return this.batchCall(calls, blockNumber);
  }

  async #multicallRead(calls, blockNumber, label) {
    const tag = "0x" + BigInt(blockNumber).toString(16);
    const out = new Array(calls.length);

    for (let start = 0; start < calls.length; start += this.multicallChunk) {
      const chunk = calls.slice(start, start + this.multicallChunk);
      const data = encodeAggregate3(chunk);

      let decoded;
      for (let attempt = 0; ; attempt++) {
        const body = await this.#post({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to: MULTICALL3, data }, tag],
        });
        if (!body.error) {
          decoded = decodeAggregate3(body.result);
          break;
        }
        if (!RATE_LIMIT_RE.test(body.error.message) || attempt >= RATE_LIMIT_PASSES) {
          throw new Error(`Multicall3 调用失败: ${body.error.message}`);
        }
        this.rateLimitHits++;
        await sleep(1000 * 2 ** attempt);
      }

      if (decoded.length !== chunk.length) {
        throw new Error(`Multicall3 返回条数不符：请求 ${chunk.length}，返回 ${decoded.length}`);
      }
      decoded.forEach((item, i) => {
        out[start + i] = item.success ? { result: item.returnData } : { error: "call reverted" };
      });

      this.callCount += chunk.length;
      process.stderr.write(`\r  ${label}multicall ${Math.min(start + chunk.length, calls.length)}/${calls.length}   `);
      if (this.throttleMs) await sleep(this.throttleMs);
    }
    process.stderr.write("\n");
    return out;
  }

  async #post(payload) {
    let lastError;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * attempt));
      try {
        const res = await fetch(this.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        return await res.json();
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(`RPC 请求失败（重试 ${this.retries} 次后）: ${lastError?.message ?? lastError}`);
  }

  async single(method, params) {
    const body = await this.#post({ jsonrpc: "2.0", id: 1, method, params });
    if (body.error) throw new Error(`${method} 失败: ${body.error.message}`);
    return body.result;
  }

  async chainId() {
    return Number(BigInt(await this.single("eth_chainId", [])));
  }

  async blockNumber() {
    return Number(BigInt(await this.single("eth_blockNumber", [])));
  }

  async block(blockNumber) {
    const tag = "0x" + BigInt(blockNumber).toString(16);
    return this.single("eth_getBlockByNumber", [tag, false]);
  }

  /**
   * 批量 eth_call，全部固定在同一 block。
   * @param {Array<{to:string,data:string}>} calls
   * @param {number} blockNumber
   * @returns {Promise<Array<{result?:string,error?:string}>>} 与入参同序
   */
  async batchCall(calls, blockNumber) {
    const tag = "0x" + BigInt(blockNumber).toString(16);
    const out = new Array(calls.length);

    // 第一遍全量；之后只重发被限流的那些，逐轮加大退避
    let pending = calls.map((call, index) => ({ call, index }));

    for (let pass = 0; pass < RATE_LIMIT_PASSES && pending.length > 0; pass++) {
      if (pass > 0) {
        this.rateLimitHits += pending.length;
        const backoff = 1000 * 2 ** (pass - 1);
        process.stderr.write(`\n  限流重试 第 ${pass} 轮：${pending.length} 项，退避 ${backoff}ms\n`);
        await sleep(backoff);
      }

      const retry = [];
      let done = 0;
      for (let start = 0; start < pending.length; start += this.batchSize) {
        const chunk = pending.slice(start, start + this.batchSize);
        const payload = chunk.map((item, i) => ({
          jsonrpc: "2.0",
          id: i,
          method: "eth_call",
          params: [{ to: item.call.to, data: item.call.data }, tag],
        }));

        const body = await this.#post(payload);
        const responses = Array.isArray(body) ? body : [body];
        if (responses.length !== chunk.length) {
          throw new Error(`RPC 批量返回条数不符：请求 ${chunk.length}，返回 ${responses.length}（该 RPC 可能不支持批量）`);
        }
        for (const response of responses) {
          const item = chunk[response.id];
          if (response.error && RATE_LIMIT_RE.test(response.error.message)) retry.push(item);
          else out[item.index] = response.error ? { error: response.error.message } : { result: response.result };
        }
        this.callCount += chunk.length;
        done += chunk.length;
        process.stderr.write(`\r  eth_call ${done}/${pending.length}${pass > 0 ? ` (重试轮 ${pass})` : ""}   `);
        if (this.throttleMs) await sleep(this.throttleMs);
      }
      pending = retry;
    }

    // 退避耗尽仍未拿到的，如实标注为限流未取回，绝不当作 0
    for (const item of pending) out[item.index] = { error: "over rate limit（退避重试耗尽，未取回）" };

    process.stderr.write("\n");
    return out;
  }
}

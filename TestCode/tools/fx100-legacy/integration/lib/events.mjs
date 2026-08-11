// EventEmitter 日志抓取与 EventLogData 解码。
//
// 为什么需要它（附录 C §〇.8，2026-07-30 v1.1）：fork 上 arrange 与 act 必然隔块，
// 每笔仓位操作都会先更新市场 funding 再结算本仓——「抵押全额入仓/退回」的字面量断言
// 必须改为**结算公式**，公式的四个输入取自 keeper 执行交易发出的 `PositionFeesCollected`
// 事件；funding 双闭环的市场侧取自 `Funding` 事件。两者都走 EventEmitter 的
// `EventLog1(address msgSender, string eventName, string indexed eventNameHash, bytes32 indexed topic1, EventLogData eventData)`
// ——事件名的 keccak 在 topics[1]，市场号（bytes32(marketIndex)）在 topics[2]，正文在 data。
//
// 过滤口径与合约层 `contracts-tests/test/shared/EventAsserts.sol` 一致：
// 按 topics[1] == keccak(eventName) 过滤，再解 EventLogData 的 items。
// arrayItems 本层用不到，只跳位不取值；bytes/string 值同理。

import { keccak256Utf8 } from "../../tool/config-dump/lib/keccak.mjs";

/* ------------- ABI 游标解码：只针对 EventLogData 这一种形状，不是通用解码器 ------------- */

const wordAt = (buf, byteOff) => buf.slice(byteOff * 2, byteOff * 2 + 64);
const uintAt = (buf, byteOff) => BigInt("0x" + (wordAt(buf, byteOff) || "0"));

const TWO_255 = 1n << 255n;
const TWO_256 = 1n << 256n;
const toSigned = (u) => (u >= TWO_255 ? u - TWO_256 : u);

function stringAt(buf, byteOff) {
  const len = Number(uintAt(buf, byteOff));
  const start = (byteOff + 32) * 2;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = parseInt(buf.slice(start + i * 2, start + i * 2 + 2), 16);
  return new TextDecoder().decode(bytes);
}

// EventLogData 的七个成员，顺序照抄 src/event/EventUtils.sol 的 struct 定义。
/** 动态类型（bytes / string）的 value 槽存的是**偏移**，不是值本身——解法与静态类型不同 */
function bytesAt(buf, byteOff) {
  const len = Number(uintAt(buf, byteOff));
  return "0x" + buf.slice((byteOff + 32) * 2, (byteOff + 32) * 2 + len * 2);
}

// 七个成员，顺序照抄 src/event/EventUtils.sol 的 struct 定义。
//
// bytes / string 两族原先标 null（只跳位不取值）。**这让静默取消的原因不可见**——
// `OrderCancelled` 的 `reason`（string）和 `reasonBytes`（bytes）恰恰在这两族里，
// 而静默取消是本项目最高频的失败形态：交易 status=1、订单没了、看不出被哪道闸门拦的。
// 现在两族都解，`dynamic: true` 标记走偏移解法。
const MEMBERS = [
  ["address", (w) => "0x" + w.slice(24)],
  ["uint", (w) => BigInt("0x" + w)],
  ["int", (w) => toSigned(BigInt("0x" + w))],
  ["bool", (w) => BigInt("0x" + w) !== 0n],
  ["bytes32", (w) => "0x" + w],
  ["bytes", bytesAt, true],
  ["string", stringAt, true],
];

/**
 * 解一条 EventLog1 的 data 段（非 indexed 部分：msgSender, eventName, eventData）。
 * @returns {{eventName:string, address:object, uint:object, int:object, bool:object, bytes32:object}}
 *          各 object 均为「item 名 → 值」的平面映射（uint/int 为 BigInt）。
 */
export function decodeEventLog1(dataHex) {
  const buf = dataHex.startsWith("0x") ? dataHex.slice(2) : dataHex;
  // data 头三个字：msgSender、eventName 偏移、EventLogData 偏移（偏移相对 data 起点）
  const out = { eventName: stringAt(buf, Number(uintAt(buf, 32))) };
  const B = Number(uintAt(buf, 64)); // EventLogData 基址
  MEMBERS.forEach(([kind, convert, isDynamic], i) => {
    const X = B + Number(uintAt(buf, B + i * 32)); // XItems 基址（成员偏移相对 EventLogData 基址）
    const A = X + Number(uintAt(buf, X)); //          items 数组基址（X+32 是 arrayItems，不解）
    const n = Number(uintAt(buf, A));
    const items = {};
    for (let j = 0; j < n; j++) {
      // 动态元组数组：元素偏移相对「长度字之后」的元素区起点
      const E = A + 32 + Number(uintAt(buf, A + 32 + j * 32));
      const key = stringAt(buf, E + Number(uintAt(buf, E))); // KeyValue.key（string，偏移相对元组基址）
      items[key] = isDynamic
        ? convert(buf, E + Number(uintAt(buf, E + 32))) // value 是动态类型：槽里是偏移
        : convert(wordAt(buf, E + 32)); //                 value 是静态类型：就地一个字
    }
    out[kind] = items;
  });
  return out;
}

/** topics[2] 的市场号编码：bytes32(marketIndex) */
export const marketIndexTopic = (marketIndex) => "0x" + BigInt(marketIndex).toString(16).padStart(64, "0");

/**
 * 抓一段区块内 EventEmitter 的某个具名事件并解码。
 * @param topic1 可选，EventLog1 的 topic1（本项目惯例是 bytes32(marketIndex)），不给则不过滤
 */
export async function fetchEmitterEvents(rpc, { emitter, fromBlock, toBlock, eventName, topic1 }) {
  const hex = (n) => "0x" + BigInt(n).toString(16);
  const topics = [null, keccak256Utf8(eventName)];
  if (topic1 !== undefined) topics.push(topic1);
  const logs = await rpc.single("eth_getLogs", [
    { address: emitter, fromBlock: hex(fromBlock), toBlock: hex(toBlock), topics },
  ]);
  return (logs ?? []).map((log) => ({
    blockNumber: Number(BigInt(log.blockNumber)),
    txHash: log.transactionHash,
    ...decodeEventLog1(log.data),
  }));
}

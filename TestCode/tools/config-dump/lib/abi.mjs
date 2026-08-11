// 最小 ABI 编解码：只覆盖 key 派生与 DataStore getter 需要的类型。
// 支持 abi.encode 的静态类型（bytes32/uint256/int256/bool/address）与动态 string。

import { keccak256Bytes, keccak256Utf8, fromHex, toHex } from "./keccak.mjs";

const WORD = 32;

function padWord(hexNo0x) {
  return hexNo0x.padStart(WORD * 2, "0");
}

function uintWord(value) {
  let v = BigInt(value);
  if (v < 0n) throw new Error(`uint 不能为负: ${value}`);
  return padWord(v.toString(16));
}

function intWord(value) {
  let v = BigInt(value);
  if (v < 0n) v += 1n << 256n;
  return padWord(v.toString(16));
}

function addressWord(value) {
  const clean = String(value).replace(/^0x/i, "").toLowerCase();
  if (clean.length !== 40) throw new Error(`address 长度错误: ${value}`);
  return padWord(clean);
}

function bytes32Word(value) {
  const clean = String(value).replace(/^0x/i, "").toLowerCase();
  if (clean.length !== 64) throw new Error(`bytes32 长度错误: ${value}`);
  return clean;
}

function boolWord(value) {
  return padWord(value ? "1" : "0");
}

/**
 * 等价 Solidity 的 abi.encode(...)，返回 0x 前缀 hex。
 * @param {Array<{type:string,value:any}>} params
 */
export function abiEncode(params) {
  const heads = [];
  const tails = [];
  let tailOffset = params.length * WORD;

  for (const { type, value } of params) {
    switch (type) {
      case "bytes32":
        heads.push(bytes32Word(value));
        break;
      case "address":
        heads.push(addressWord(value));
        break;
      case "bool":
        heads.push(boolWord(value));
        break;
      case "string": {
        const bytes = new TextEncoder().encode(String(value));
        const chunks = Math.ceil(bytes.length / WORD);
        let data = "";
        for (let i = 0; i < chunks * WORD; i++) {
          data += (i < bytes.length ? bytes[i] : 0).toString(16).padStart(2, "0");
        }
        const tail = uintWord(bytes.length) + data;
        heads.push(uintWord(tailOffset));
        tails.push(tail);
        tailOffset += tail.length / 2;
        break;
      }
      default:
        if (type.startsWith("uint")) heads.push(uintWord(value));
        else if (type.startsWith("int")) heads.push(intWord(value));
        else throw new Error(`abiEncode 不支持的类型: ${type}`);
    }
  }

  return "0x" + heads.join("") + tails.join("");
}

/** Solidity 的 keccak256(abi.encode(...)) */
export function hashEncoded(params) {
  return keccak256Hex(abiEncode(params));
}

function keccak256Hex(hex) {
  return toHex(keccak256Bytes(fromHex(hex)));
}

/** 4 字节函数选择器 */
export function selector(signature) {
  return keccak256Utf8(signature).slice(0, 10);
}

/** 拼装 eth_call 的 calldata：选择器 + abi.encode(参数) */
export function encodeCall(signature, params) {
  return selector(signature) + abiEncode(params).slice(2);
}

/* ---------- 返回值解码 ---------- */

export function decodeUint(hex) {
  if (!hex || hex === "0x") return null;
  return BigInt(hex.slice(0, 66));
}

export function decodeInt(hex) {
  if (!hex || hex === "0x") return null;
  let v = BigInt(hex.slice(0, 66));
  if (v >= 1n << 255n) v -= 1n << 256n;
  return v;
}

export function decodeBool(hex) {
  if (!hex || hex === "0x") return null;
  return BigInt(hex.slice(0, 66)) !== 0n;
}

export function decodeAddress(hex) {
  if (!hex || hex === "0x") return null;
  return "0x" + hex.slice(2).slice(24, 64);
}

export function decodeBytes32(hex) {
  if (!hex || hex === "0x") return null;
  return hex.slice(0, 66);
}

/** 解码 ABI 动态 string；部分代币 metadata 调用失败时由调用方降级处理。 */
export function decodeString(hex) {
  if (!hex || hex === "0x") return null;
  const body = hex.slice(2);
  const offset = Number(BigInt("0x" + body.slice(0, 64))) * 2;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + 64 > body.length) return null;
  const length = Number(BigInt("0x" + body.slice(offset, offset + 64)));
  const start = offset + 64;
  const data = body.slice(start, start + length * 2);
  if (data.length !== length * 2) return null;
  const bytes = new Uint8Array(data.match(/.{2}/g)?.map((pair) => Number.parseInt(pair, 16)) ?? []);
  return new TextDecoder().decode(bytes).replace(/\0+$/g, "") || null;
}

/** 解码 T[]（T 为 32 字节静态类型），返回原始 32 字节词数组 */
export function decodeStaticArrayWords(hex) {
  if (!hex || hex === "0x") return [];
  const body = hex.slice(2);
  const offset = Number(BigInt("0x" + body.slice(0, 64))) * 2;
  const len = Number(BigInt("0x" + body.slice(offset, offset + 64)));
  const words = [];
  for (let i = 0; i < len; i++) {
    words.push("0x" + body.slice(offset + 64 + i * 64, offset + 64 + (i + 1) * 64));
  }
  return words;
}

export function decodeUintArray(hex) {
  return decodeStaticArrayWords(hex).map((w) => BigInt(w));
}

export function decodeAddressArray(hex) {
  return decodeStaticArrayWords(hex).map((w) => "0x" + w.slice(2).slice(24, 64));
}

/* ---------- Multicall3 ---------- */
// 把 N 次 eth_call 压成 1 次。公共 RPC 按「请求条数」限流，用 Multicall3 后
// 近 2000 次读取只消耗个位数配额，是本工具能在公共 RPC 上跑完的关键。

const WORD_HEX = 64;

function padRightData(hex) {
  const body = hex.replace(/^0x/, "");
  const chunks = Math.ceil(body.length / WORD_HEX);
  return body.padEnd(chunks * WORD_HEX, "0");
}

/** aggregate3((address target, bool allowFailure, bytes callData)[]) */
export function encodeAggregate3(calls) {
  const elements = calls.map((call) => {
    const data = call.data.replace(/^0x/, "");
    return (
      addressWord(call.to) +
      boolWord(true) +
      uintWord(0x60) +
      uintWord(data.length / 2) +
      padRightData(data)
    );
  });

  let cursor = calls.length * WORD_HEX / 2; // 元素偏移区之后的第一个字节
  const offsets = [];
  for (const element of elements) {
    offsets.push(uintWord(cursor));
    cursor += element.length / 2;
  }

  return selector("aggregate3((address,bool,bytes)[])") + uintWord(0x20) + uintWord(calls.length) + offsets.join("") + elements.join("");
}

/** 解码 Result[]，返回 [{success, returnData}] */
export function decodeAggregate3(hex) {
  const body = hex.replace(/^0x/, "");
  const word = (byteOffset) => body.slice(byteOffset * 2, byteOffset * 2 + WORD_HEX);
  const num = (byteOffset) => Number(BigInt("0x" + word(byteOffset)));

  const arrayStart = num(0);
  const length = num(arrayStart);
  const offsetsBase = arrayStart + 32;

  const out = [];
  for (let i = 0; i < length; i++) {
    const tupleStart = offsetsBase + num(offsetsBase + i * 32);
    const success = BigInt("0x" + word(tupleStart)) !== 0n;
    const dataStart = tupleStart + num(tupleStart + 32);
    const dataLength = num(dataStart);
    out.push({ success, returnData: "0x" + body.slice((dataStart + 32) * 2, (dataStart + 32 + dataLength) * 2) });
  }
  return out;
}

export { keccak256Hex };

// keccak256（原始 Keccak 填充 0x01，不是 SHA3-256 的 0x06），零依赖实现。
// 用途：在不安装 ethers 的前提下复算 FX100Keys 的 key 派生。
// 自检：node lib/keccak.mjs 会跑内置向量，与 `cast keccak` 对齐。

const MASK = (1n << 64n) - 1n;

const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

// ROT[x][y]，状态按 A[x + 5*y] 索引
const ROT = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14],
];

function rotl(x, n) {
  if (n === 0) return x;
  const b = BigInt(n);
  return ((x << b) | (x >> (64n - b))) & MASK;
}

function keccakF(A) {
  const C = new Array(5);
  const D = new Array(5);
  const B = new Array(25);

  for (let round = 0; round < 24; round++) {
    for (let x = 0; x < 5; x++) {
      C[x] = A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20];
    }
    for (let x = 0; x < 5; x++) {
      D[x] = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1);
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) A[x + 5 * y] ^= D[x];
    }

    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(A[x + 5 * y], ROT[x][y]);
      }
    }

    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        A[x + 5 * y] = B[x + 5 * y] ^ (~B[((x + 1) % 5) + 5 * y] & MASK & B[((x + 2) % 5) + 5 * y]);
      }
    }

    A[0] ^= RC[round];
  }
}

/** @param {Uint8Array} input @returns {Uint8Array} 32 字节摘要 */
export function keccak256Bytes(input) {
  const RATE = 136; // 1088 bit
  const padLen = RATE - (input.length % RATE);
  const padded = new Uint8Array(input.length + padLen);
  padded.set(input);
  padded[input.length] |= 0x01;
  padded[padded.length - 1] |= 0x80;

  const A = new Array(25).fill(0n);
  for (let off = 0; off < padded.length; off += RATE) {
    for (let i = 0; i < RATE / 8; i++) {
      let lane = 0n;
      for (let b = 7; b >= 0; b--) {
        lane = (lane << 8n) | BigInt(padded[off + i * 8 + b]);
      }
      A[i] ^= lane;
    }
    keccakF(A);
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    let lane = A[i];
    for (let b = 0; b < 8; b++) {
      out[i * 8 + b] = Number(lane & 0xffn);
      lane >>= 8n;
    }
  }
  return out;
}

export function toHex(bytes) {
  let s = "0x";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

export function fromHex(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error(`hex 长度必须为偶数: ${hex}`);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** keccak256(hex 字节串) -> 0x 前缀 bytes32 */
export function keccak256(hexOrBytes) {
  const bytes = typeof hexOrBytes === "string" ? fromHex(hexOrBytes) : hexOrBytes;
  return toHex(keccak256Bytes(bytes));
}

/** keccak256(utf8(str))：对应 Solidity 的 keccak256("STR") */
export function keccak256Utf8(str) {
  return toHex(keccak256Bytes(new TextEncoder().encode(str)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const vectors = [
    ["", "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"],
    ["abc", "0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45"],
    // Solidity: keccak256("EXECUTION_FEE_SUBSIDIZE")（raw string，非 abi.encode）
    ["EXECUTION_FEE_SUBSIDIZE", null],
  ];
  for (const [input, expected] of vectors) {
    const got = keccak256Utf8(input);
    const mark = expected === null ? "(无内置期望值，请与 cast keccak 比对)" : got === expected ? "OK" : `FAIL 期望 ${expected}`;
    console.log(`keccak256("${input}") = ${got}  ${mark}`);
  }
}

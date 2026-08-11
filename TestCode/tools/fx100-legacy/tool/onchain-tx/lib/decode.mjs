// 静态元组返回值的切词。
//
// 注意与 config-dump 的 decodeStaticArrayWords 区分：那个是给**动态数组**（uint256[]）
// 用的，会先读 offset 再读 length；静态元组（Position.Props、RecordedPrice、Price.Props）
// 的返回数据是扁平的 N 个 word，没有 offset/length 头，用错会解出空数组。

/** 把 eth_call 返回的 hex 切成 32 字节 word 数组（不带 0x 前缀） */
export function splitWords(hex) {
  if (!hex || hex === "0x") return [];
  const body = hex.slice(2);
  const words = [];
  for (let i = 0; i + 64 <= body.length; i += 64) words.push(body.slice(i, i + 64));
  return words;
}

export const wordToBigInt = (word) => BigInt("0x" + word);
export const wordToAddress = (word) => "0x" + word.slice(-40);
export const wordToBool = (word) => BigInt("0x" + word) !== 0n;

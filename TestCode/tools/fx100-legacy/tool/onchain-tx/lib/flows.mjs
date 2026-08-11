// 链上动作库 —— 用例脚本编排的最小积木。
//
// 这里的每个函数都是从 `send-order.mjs` 里**已经在 fork 上跑通过**的流程提取出来的
// （`E2E-POS-004-fork.json` 就是那条路径产的真交易：真 txHash、守恒 PASS）。
// 提取的原因：`send-order.mjs` 是「发一笔开仓单」的固定脚本，表达不了
// 加保证金 / 提取 / 部分减仓 / 平仓 这些不同的动作序列。能力是现成的，缺的是编排。
//
// ## 两条发送路径
//
// | 路径 | 何时用 | 要私钥吗 |
// |---|---|---|
// | `sendImpersonated` | **fork**（集成层默认） | ❌ 不要。Tenderly VNet 允许以任意地址发交易 |
// | `Cast.send`（keystore） | 真测试网 | 密码由 cast 直接向用户索取，不经过本进程 |
//
// fork 上免私钥这一点很关键：集成层要反复发交易对账，每次都掏 keystore 密码不现实，
// 而 impersonation 既不碰私钥、也不消耗真实资产、fork 还能随时重置。

import { calldata } from "./cast.mjs";

/** CreateOrderParams 的完整签名（嵌套 struct + 动态数组，编码交给 cast） */
export const CREATE_ORDER_SIG =
  "createOrder(((address,address,address,address),(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256),uint8,bool,bool,bool,bytes32,bytes32[]))";

/**
 * 订单类型枚举 —— **必须与 `src/order/Order.sol` 的 `enum OrderType` 逐项对齐**。
 *
 * ⚠️ 这里曾经写成 `{MarketIncrease: 2, MarketDecrease: 4}`（凭印象猜的），结果把开多增仓单
 * 发成了 MarketDecrease：走平仓侧判定 `execPrice >= acceptablePrice`，而开仓哨兵是
 * MaxUint256 ⇒ **每一单都被静默取消**，抵押卡在 OrderVault。
 * 而且这个错误在 dry-run 下**看不出来**（模拟能过，因为 createOrder 本身不校验可成交性），
 * 只有真发交易 + 等 keeper 才暴露。枚举值属于「必须照抄不能推断」的东西。
 */
export const ORDER_TYPE = {
  MarketIncrease: 0,
  LimitIncrease: 1,
  MarketDecrease: 2,
  LimitDecrease: 3,
  StopLossDecrease: 4,
  Liquidation: 5,
  StopIncrease: 6,
};
const ZERO = "0x0000000000000000000000000000000000000000";
const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

/**
 * 市价单的哨兵 acceptablePrice（Order 流程文档 §1.2）。
 * 开仓侧判定 `execPrice <= acceptable`，平仓侧判定反向——所以两侧哨兵值相反。
 */
export const acceptAnyPrice = ({ isLong, isIncrease }) =>
  isIncrease === false
    ? isLong
      ? 0n
      : 2n ** 256n - 1n
    : isLong
      ? 2n ** 256n - 1n
      : 0n;

/** 拼 CreateOrderParams 的 tuple 字面量（cast 的入参格式） */
function orderParamsTuple({
  account,
  marketIndex,
  sizeDeltaUsd,
  collateralDelta,
  acceptablePrice,
  executionFee,
  orderType,
  isLong,
}) {
  return [
    `(${account},${account},${ZERO},${ZERO})`,
    `(${marketIndex},${sizeDeltaUsd},${collateralDelta},0,${acceptablePrice},${executionFee},0,0,0)`,
    orderType,
    isLong,
    false, // autoCancel
    true, //  isSizeDeltaUsd —— size 以 USD 计
    ZERO_BYTES32, // referralCode
    "[]", // dataList
  ].join(",");
}

/**
 * 增仓单（开仓 / 加仓 / 加保证金）的 **multicall 原子三段**。
 *
 * ⚠️ 必须原子：`OrderUtils.createOrder` 对 `*Increase` 单用
 * `orderVault.recordTransferIn(collateralToken)` **覆盖** calldata 里的
 * `initialCollateralDeltaAmount`——也就是说抵押以「实际转进 OrderVault 的量」为准
 * （IT-POS-014 专测这条）。分开发就可能被别人的转账夹在中间，记错抵押。
 *
 * `sizeDeltaUsd = 0` 即纯加保证金（IT-POS-015）。
 */
export function buildIncreaseMulticall({
  exchangeRouter,
  orderVault,
  collateralToken,
  account,
  marketIndex,
  isLong,
  sizeDeltaUsd,
  collateral,
  executionFee,
  acceptablePrice,
}) {
  const params = orderParamsTuple({
    account,
    marketIndex,
    sizeDeltaUsd,
    collateralDelta: collateral,
    acceptablePrice: acceptablePrice ?? acceptAnyPrice({ isLong, isIncrease: true }),
    executionFee,
    orderType: ORDER_TYPE.MarketIncrease,
    isLong,
  });
  const parts = [
    calldata("sendWnt(address,uint256)", [orderVault, executionFee]),
    calldata("sendTokens(address,address,uint256)", [collateralToken, orderVault, collateral]),
    calldata(CREATE_ORDER_SIG, [`(${params})`]),
  ];
  return {
    to: exchangeRouter,
    data: calldata("multicall(bytes[])", [`[${parts.join(",")}]`]),
    value: String(executionFee),
    label: `multicall[sendWnt, sendTokens(${collateral}), createOrder(size=${sizeDeltaUsd})]`,
  };
}

/**
 * 减仓单（部分减仓 / 全平 / 提取保证金）。
 *
 * 与增仓单的关键差异：**挂单期不转入任何资金**，所以只有 createOrder 一段，不需要 multicall
 * （执行费仍要随 value 发）。`sizeDeltaUsd = 0` + `collateralDelta > 0` = 纯提取保证金（IT-POS-016）；
 * `sizeDeltaUsd = position.sizeInUsd` = 全平（此时合约会把 collateralDelta 强制归零，全额走 outputAmount）。
 */
export function buildDecreaseOrder({
  exchangeRouter,
  orderVault,
  account,
  marketIndex,
  isLong,
  sizeDeltaUsd,
  collateralDelta = 0,
  executionFee,
  acceptablePrice,
}) {
  const params = orderParamsTuple({
    account,
    marketIndex,
    sizeDeltaUsd,
    collateralDelta,
    acceptablePrice: acceptablePrice ?? acceptAnyPrice({ isLong, isIncrease: false }),
    executionFee,
    orderType: ORDER_TYPE.MarketDecrease,
    isLong,
  });
  const parts = [
    calldata("sendWnt(address,uint256)", [orderVault, executionFee]),
    calldata(CREATE_ORDER_SIG, [`(${params})`]),
  ];
  return {
    to: exchangeRouter,
    data: calldata("multicall(bytes[])", [`[${parts.join(",")}]`]),
    value: String(executionFee),
    label: `multicall[sendWnt, createOrder(decrease size=${sizeDeltaUsd}, collDelta=${collateralDelta})]`,
  };
}

/**
 * multicall 返回 `bytes[]`；createOrder 是最后一段，其内容即 orderKey。
 * 解不出来不抛错——调用方可以改由事件核对。
 */
export function extractOrderKey(hex) {
  if (!hex || hex.length < 66) return null;
  const words = hex.slice(2).match(/.{64}/g) ?? [];
  // 最后一个非零 32 字节字通常就是 orderKey；保守起见只在长度合理时取
  for (let i = words.length - 1; i >= 0; i--) {
    if (/[1-9a-f]/i.test(words[i])) return "0x" + words[i];
  }
  return null;
}

/* ------------------------------------------------------- 发送（fork 路径） */

async function post(rpcUrl, method, params) {
  const r = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }).then((x) => x.json());
  if (r.error) throw new Error(`${method}: ${r.error.message}`);
  return r.result;
}

/**
 * 能力探测：impersonation 能用就是 fork，真链绝不可能允许。
 *
 * **比按 RPC 主机名判断可靠**——主机名可以配错，能力探测不会骗人
 * （fork 与真测试网的 chainId 都是 84532，光看 chainId 分辨不出）。
 * 任何会改状态的操作之前都应该先过这一关。
 */
export async function assertImpersonatable(rpcUrl) {
  try {
    await post(rpcUrl, "eth_sendTransaction", [{ from: "0x0000000000000000000000000000000000000001", to: "0x0000000000000000000000000000000000000001", value: "0x0" }]);
  } catch (error) {
    throw new Error(
      `impersonation 探针被拒绝（${String(error.message).slice(0, 90)}）——这不是 fork。\n` +
        `  集成层只在 fork 上发交易；真测试网请改用 keystore 路径（--account）。`
    );
  }
}

/** 免签名发交易（fork 专用），返回与 `Cast.send` 同形状的回执 */
export async function sendImpersonated(rpcUrl, { from, to, data, value = "0" }) {
  const hash = await post(rpcUrl, "eth_sendTransaction", [
    { from, to, data, value: "0x" + BigInt(value).toString(16) },
  ]);
  let receipt = null;
  for (let i = 0; i < 30 && !receipt; i++) {
    receipt = await post(rpcUrl, "eth_getTransactionReceipt", [hash]);
    if (!receipt) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!receipt) throw new Error(`交易 ${hash} 30s 内没拿到回执`);
  return {
    txHash: hash,
    blockNumber: Number(BigInt(receipt.blockNumber)),
    status: BigInt(receipt.status ?? "0x1") === 1n ? "success" : "reverted",
    gasUsed: String(BigInt(receipt.gasUsed ?? 0)),
  };
}

/**
 * 等 keeper 执行订单。
 *
 * 链上 `executeOrder` 有两道锁测试账号过不去（ORDER_KEEPER 角色 + Chainlink Data Streams
 * 签名报价），所以下完单只能等 keeper。**等不到是 BLOCKED 不是 FAIL**——keeper 没跑
 * 不是被测系统的缺陷（`tool/keeper-runner/README.md`）。本函数只报事实，判定交给调用方。
 *
 * @param isSettled 由调用方提供的「订单是否已离开挂单态」判定（通常读 ORDER_LIST）
 */
export async function waitForExecution(isSettled, { timeoutMs = 300_000, pollMs = 5_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isSettled()) return { outcome: "settled" };
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return {
    outcome: "BLOCKED",
    reason: `等 keeper 超时（${timeoutMs / 1000}s），订单仍在挂单态。先确认 keeper 是否在跑：cd tool/keeper-runner && ./run.sh check`,
  };
}

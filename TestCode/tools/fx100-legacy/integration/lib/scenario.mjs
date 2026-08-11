// 场景骨架 —— 把「发单 → 等 keeper → 前后快照对账」这条每个用例都要走的链路收成一处。
//
// 没有它的话，每条 fork 用例都要重复：钉块、取快照、判缺读数、发交易、判 dry-run 分叉、
// 等 keeper、再取快照、算 Delta、判守恒——一百行样板，而且**每抄一遍就多一处漂移的机会**
// （IT-POS-001 首版就在「订单离开挂单态 ≠ 执行成功」这点上漏了断言）。
//
// 用例文件里只剩「本条特有的动作与核对点」。

import { snapshot, diff, checkConservation } from "../../tool/onchain-tx/lib/ledger.mjs";
import { BASE, accountOrderListKey } from "../../tool/onchain-tx/lib/keys.mjs";
import {
  waitForExecution,
  orderIsPending,
  readUint,
  ethCall,
  buildIncreaseMulticall,
  buildDecreaseOrder,
} from "./actions.mjs";
import { calldata } from "../../tool/onchain-tx/lib/cast.mjs";
import { fetchEmitterEvents, marketIndexTopic } from "./events.mjs";
import { writeForkLedgerStep } from "./ledger.mjs";
import { explorerTxUrl } from "../../config.mjs";

/** 用例上下文：一次组装，各步骤共用 */
export function makeCtx({ rpc, deployment, broadcaster, env, isLong = true }) {
  return {
    rpc,
    deployment,
    broadcaster,
    env,
    a: deployment.addresses,
    marketIndex: env.cfg.markets.eth, // 部署侧 ETH = #2，与本地夹具的 #1 相反
    trader: env.trader,
    isLong,
  };
}

/** 取一份钉块快照。缺读数直接抛——绝不当作 0（`ledger.mjs` 的铁律） */
export async function takeSnapshot(ctx, { block } = {}) {
  const at = block ?? Number(BigInt(await ctx.rpc.single("eth_blockNumber", [])));
  const snap = await snapshot(
    ctx.rpc,
    ctx.deployment,
    { trader: ctx.trader, marketIndex: ctx.marketIndex, isLong: ctx.isLong },
    at
  );
  if (snap.errors.length) {
    const err = new Error(`快照缺读数，无法对账：${snap.errors.join("; ").slice(0, 200)}`);
    err.blocked = true;
    throw err;
  }
  return snap;
}

/**
 * 发一笔单并等它落定，返回三个快照与两组 Delta。
 *
 * dry-run 下在「模拟通过」处就返回（`simulated: true`），调用方据此把上链后的核对点
 * 标 SKIPPED——**模拟结果不冒充真实结果**。
 *
 * 返回 `{ blocked }` 表示卡在环境（keeper 没跑、发单模拟失败），调用方应判 BLOCKED 不是 FAIL。
 */
export async function submitAndSettle(ctx, t, { tx, stepNo, label, before, waitMs = 300_000 }) {
  const { a } = ctx;

  t.step(stepNo, label);
  const sent = await ctx.broadcaster.send({ ...tx, from: ctx.trader });
  t.checkTrue("发单交易可执行（模拟不 revert）", sent.ok, sent.error ?? sent.txHash ?? "");
  if (!sent.ok) return { blocked: `发单失败：${sent.error}`, sent };

  const orderKey = sent.orderKey;
  t.checkTrue("解出 orderKey", Boolean(orderKey), orderKey ?? "未解出，改由事件核对");
  if (ctx.broadcaster.simulated) return { simulated: true, sent, orderKey };

  t.recordTx({
    role: "trader",
    label: "发单 multicall[sendWnt, sendTokens, createOrder]",
    ...(await txMeta(ctx, { txHash: sent.txHash, blockNumber: sent.blockNumber })),
  });
  t.fact({ orderKey });

  // ---- s1：挂单期中间态 ----
  t.snapPoint("s1", "挂单期快照与核对");
  const s1 = await takeSnapshot(ctx, { block: sent.blockNumber });
  // 钉在 s1 那个块上查——查 latest 会和 keeper 抢跑（见 orderIsPending 的注释）
  t.checkTrue(
    "s1 订单已落库（ORDER_LIST 含 orderKey）",
    await orderIsPending(ctx.rpc, {
      dataStore: a.dataStore,
      orderListKey: BASE.ORDER_LIST,
      orderKey,
      block: sent.blockNumber,
    })
  );
  // 逐槽位落 CSV（`<ID>.fork.csv`），不是只在流水里记一行汇总——
  // 汇总行的「14」是 diff 对象的键数，看板拿它对不了账。
  const { deltas: d01 } = writeForkLedgerStep(t, {
    step: "s0->s1",
    before,
    after: s1,
    txHash: sent.txHash,
    note: "挂单期：抵押经停 OrderVault",
  });

  // ---- 等 keeper ----
  // 等不到是 BLOCKED 不是 FAIL——keeper 没跑不是被测系统的缺陷
  t.step(`${stepNo}b`, "等 keeper 执行 executeOrder");
  const settled = await waitForExecution(
    async () => !(await orderIsPending(ctx.rpc, { dataStore: a.dataStore, orderListKey: BASE.ORDER_LIST, orderKey })),
    { timeoutMs: waitMs }
  );
  if (settled.outcome === "BLOCKED") {
    t.skip("keeper 执行", settled.reason);
    return { blocked: settled.reason, sent, orderKey, s1, d01 };
  }

  // ---- s2：落定后 ----
  t.snapPoint("s2", "执行后快照与逐槽位对账");
  const after = await takeSnapshot(ctx);
  const d12 = diff(s1, after);

  // ⚠️「订单离开挂单态」**不等于执行成功**——静默取消同样会把它移出 ORDER_LIST。
  // 每条用例都必须另判「预期的状态变更真的发生了」，否则取消也能让断言全绿。
  t.checkTrue(
    "订单已离开挂单态",
    !(await orderIsPending(ctx.rpc, { dataStore: a.dataStore, orderListKey: BASE.ORDER_LIST, orderKey }))
  );

  // keeper 那笔交易的哈希：此前只存在于 ord-worker.log 里，用例侧完全没留证——
  // 而它才是执行链路上最该留的一笔（发单只是把订单挂上去）。
  const settlement = await findSettlementTx(ctx, {
    orderKey,
    fromBlock: sent.blockNumber,
    toBlock: after.blockNumber,
  });
  if (settlement) {
    t.recordTx({
      role: "keeper",
      label: `keeper executeOrder（${settlement.kind}）`,
      ...(await txMeta(ctx, { txHash: settlement.txHash, blockNumber: settlement.blockNumber })),
    });
    t.fact({ settlementKind: settlement.kind });
  } else {
    t.note("keeper 执行交易", "区间内没抓到 OrderExecuted / OrderCancelled，证据缺这一笔");
  }

  const { deltas: d02, conservation } = writeForkLedgerStep(t, {
    step: "s0->s2",
    before,
    after,
    txHash: settlement?.txHash ?? sent.txHash,
    note: settlement ? `keeper ${settlement.kind}` : "keeper 交易未取证",
  });
  t.fact({ conservation: { status: conservation.status, sum: conservation.sum === null ? null : String(conservation.sum) } });

  return { sent, orderKey, s1, after, d01, d02, d12, settlement };
}

/**
 * 补齐一笔交易的链上元数据：回执（gasUsed / status / from / to）+ 块时间戳 + 浏览器链接。
 *
 * 为什么要单独跑一趟 RPC：`sent` 里只有广播器回填的那几项，keeper 那笔更是只从事件日志
 * 拿到 txHash 与块号——**没有时间就没法回答「这两笔差了多久」**，而挂单到执行的间隔
 * 恰恰是 keeper 链路的核心观测量。
 *
 * 拿不到就返回已知的部分，不抛——证据缺一格是遗憾，把用例判失败是错判。
 */
async function txMeta(ctx, { txHash, blockNumber }) {
  const hex = (n) => "0x" + BigInt(n).toString(16);
  const [receipt, block] = await Promise.all([
    ctx.rpc.single("eth_getTransactionReceipt", [txHash]).catch(() => null),
    blockNumber != null ? ctx.rpc.single("eth_getBlockByNumber", [hex(blockNumber), false]).catch(() => null) : null,
  ]);
  const num = (v) => (v == null ? null : Number(BigInt(v)));
  return {
    txHash,
    blockNumber: blockNumber ?? num(receipt?.blockNumber),
    timestamp: num(block?.timestamp),
    gasUsed: num(receipt?.gasUsed),
    status: receipt?.status == null ? null : num(receipt.status) === 1 ? "success" : "reverted",
    from: receipt?.from ?? null,
    to: receipt?.to ?? null,
    explorer: explorerTxUrl(txHash),
  };
}

/**
 * 定位「让订单离开挂单态」的那一笔交易。
 *
 * 两种结局都要认：`OrderExecuted`（成交）与 `OrderCancelled`（静默取消）——
 * 只查前者的话，被取消的用例会显示「没有 keeper 交易」，而真相是 keeper 发了一笔、
 * 只是把订单取消了。**取消同样是 keeper 的动作，同样要留证。**
 *
 * @returns {Promise<{txHash:string, blockNumber:number|null, kind:string}|null>}
 */
async function findSettlementTx(ctx, { orderKey, fromBlock, toBlock }) {
  const common = { emitter: ctx.a.eventEmitter, fromBlock, toBlock };
  const [executed, cancelled] = await Promise.all([
    fetchEmitterEvents(ctx.rpc, { ...common, eventName: "OrderExecuted" }),
    fetchEmitterEvents(ctx.rpc, { ...common, eventName: "OrderCancelled" }),
  ]);
  // 两族事件装 orderKey 的字段名不同（见 fetchExecutionEvents 的注释），一律两个都试
  const keyOf = (e) => e.bytes32?.key ?? e.bytes32?.orderKey ?? null;
  const hit = (list) => list.find((e) => !orderKey || keyOf(e)?.toLowerCase() === orderKey.toLowerCase());

  const ok = hit(executed);
  if (ok) return { txHash: ok.txHash, blockNumber: ok.blockNumber ?? null, kind: "OrderExecuted" };
  const no = hit(cancelled);
  if (no) return { txHash: no.txHash, blockNumber: no.blockNumber ?? null, kind: "OrderCancelled" };
  return null;
}

/**
 * 守恒五方（T0 零容差）。三态：PASS / FAIL / UNVERIFIABLE。
 * **缺读数不等于守恒成立**——那种情况标 SKIPPED，不许当通过。
 */
export function checkFiveWayConservation(t, deltas, label = "s0->s2") {
  const cons = checkConservation(deltas);
  if (cons.status === "UNVERIFIABLE") {
    t.skip(`${label} 五方守恒`, `缺读数无法核验：${cons.missing.join(", ")}`);
    return cons;
  }
  t.checkEq(`${label} 五方守恒（Δ 之和）`, cons.sum, 0n, "USDC 1e6", cons.status);
  return cons;
}

/**
 * 判「订单被静默取消」。用例在预期成交却没成交时调它，把 keeper 日志的排查线索写进流水。
 * 取消本身不是 FAIL 的理由——**是不是缺陷取决于用例预期**，所以只返回事实。
 */
export function positionMissingHint(position) {
  return position?.exists
    ? null
    : "仓位不存在 ⇒ 订单是被静默取消的，不是执行的。查 keeper 日志的 cancelReason / reasonBytes：tail -f tool/keeper-runner/logs/ord-worker.log";
}

/** dry-run 下统一把上链后的核对点标 SKIPPED，措辞一致好检索 */
export function skipOnChainChecks(t, names) {
  for (const name of names) t.skip(name, "需真广播 + keeper 执行；dry-run 拿不到上链后的状态");
}

/**
 * 静默平掉一条仓位（清场/重建前置用，不产生核对点）。
 * 平不掉时抛 blocked 错——是环境卡住不是被测系统缺陷，由调用方决定退化路径。
 */
async function closePositionQuiet(ctx, pos, { executionFee, waitMs = 300_000 }) {
  const { a } = ctx;
  const sent = await ctx.broadcaster.send({
    ...buildDecreaseOrder({
      exchangeRouter: a.exchangeRouter,
      orderVault: a.orderVault,
      account: ctx.trader,
      marketIndex: ctx.marketIndex,
      isLong: ctx.isLong,
      sizeDeltaUsd: pos.sizeInUsd,
      collateralDelta: 0n,
      executionFee,
    }),
    from: ctx.trader,
  });
  if (!sent.ok) {
    const err = new Error(`平仓发单失败：${sent.error}`);
    err.blocked = true;
    throw err;
  }
  // orderKey 解得出就等「订单离开挂单态」，解不出就直接等「仓位消失」
  const settled = await waitForExecution(
    sent.orderKey
      ? async () => !(await orderIsPending(ctx.rpc, { dataStore: a.dataStore, orderListKey: BASE.ORDER_LIST, orderKey: sent.orderKey }))
      : async () => !(await takeSnapshot(ctx)).values.position?.exists,
    { timeoutMs: waitMs }
  );
  if (settled.outcome === "BLOCKED") {
    const err = new Error(`平仓等 keeper 超时：${settled.reason}`);
    err.blocked = true;
    throw err;
  }
  const after = await takeSnapshot(ctx);
  if (after.values.position?.exists) {
    const err = new Error("平仓后仓位仍在——订单可能被静默取消，查 keeper 日志的 cancelReason");
    err.blocked = true;
    throw err;
  }
}

/** 本账户在挂订单数（ACCOUNT_ORDER_LIST，与全局 ORDER_LIST 区分——那里还有别人的单） */
const pendingOrderCount = (ctx) =>
  readUint(ctx.rpc, ctx.a.dataStore, "getBytes32Count(bytes32)", [accountOrderListKey(ctx.trader)]);

/** 本账户在挂订单的 key 列表 */
async function pendingOrderKeys(ctx, count) {
  const hex = await ethCall(ctx.rpc, {
    to: ctx.a.dataStore,
    data: calldata("getBytes32ValuesAt(bytes32,uint256,uint256)", [accountOrderListKey(ctx.trader), 0n, count]),
  });
  // 返回 bytes32[]：跳过 offset 与 length 两个头字
  return (hex.slice(2).match(/.{64}/g) ?? []).slice(2).map((w) => "0x" + w);
}

/**
 * 清掉本账户的在挂订单：**先试撤、撤不掉再等 keeper**。
 * 自助撤单受 REQUEST_EXPIRATION_TIME = 3600s 约束（ISS-014）：滞留超过一小时的可以直接
 * `cancelOrder(bytes32)` 撤掉并退款（真实场景：keeper 换代后不再消化的旧单，等是等不来的）；
 * 太年轻撤不掉的（模拟就 revert），只能等 keeper 消化。两条路都走不通 → blocked。
 */
async function drainPendingOrders(ctx, t, { waitMs = 300_000 } = {}) {
  const count = await pendingOrderCount(ctx);
  if (count === 0n) return;
  const keys = await pendingOrderKeys(ctx, count);
  t.note("清场（§〇.7）", `本账户在挂订单 ${count} 条，先试自助撤单（ISS-014：滞留超 3600s 才撤得掉）`);
  let uncancellable = 0;
  for (const key of keys) {
    const sent = await ctx.broadcaster.send({
      to: ctx.a.exchangeRouter,
      data: calldata("cancelOrder(bytes32)", [key]),
      from: ctx.trader,
      label: `cancelOrder(${key.slice(0, 10)}…)`,
    });
    if (sent.ok) {
      t.note("清场（§〇.7）", `已撤挂单 ${key.slice(0, 10)}…（退款回 trader，发生在 s0 之前）`);
    } else {
      uncancellable++;
      t.note("清场（§〇.7）", `挂单 ${key.slice(0, 10)}… 撤不掉（${String(sent.error).slice(0, 80)}），等 keeper 消化`);
    }
  }
  if (uncancellable > 0) {
    const drained = await waitForExecution(async () => (await pendingOrderCount(ctx)) === 0n, { timeoutMs: waitMs });
    if (drained.outcome === "BLOCKED") {
      const err = new Error(`清场失败：在挂订单既撤不掉也等不到 keeper 消化——${drained.reason}`);
      err.blocked = true;
      throw err;
    }
  }
}

/**
 * 清场（附录 C §〇.7）：**检查 → 清场 → 复检 → 才取 s0**。返回复检后的快照，调用方以它为 s0。
 *
 * 为什么开仓类用例必须做：fork 有状态，跳过清场撞上既有同向仓位，MarketIncrease 会
 * **静默变成加仓路径**（保护期不重置、funding 结算进抵押）——测的不再是「首次开仓」分支。
 * 双方向都查；清场的资金流全部发生在 s0 之前，不污染 Delta 断言。
 *
 * 在挂订单先试撤、撤不掉再等 keeper（见 drainPendingOrders）；两条路都不通 → BLOCKED（环境问题）。
 * dry-run 发不了清场交易，只申报现状，不冒充「已清场」。
 */
export async function ensureCleanSlate(ctx, t, { executionFee, waitMs = 300_000 } = {}) {
  const posOf = async (isLong) => (await takeSnapshot({ ...ctx, isLong })).values.position;
  let long = await posOf(true);
  let short = await posOf(false);

  if (ctx.broadcaster.simulated) {
    const pending = await pendingOrderCount(ctx);
    t.note(
      "清场（§〇.7）",
      `dry-run 不发清场交易，仅申报现状：多仓 ${long?.exists ? long.sizeInUsd : "无"} · ` +
        `空仓 ${short?.exists ? short.sizeInUsd : "无"} · 在挂订单 ${pending}`
    );
    return takeSnapshot(ctx);
  }

  await drainPendingOrders(ctx, t, { waitMs });

  for (const isLong of [true, false]) {
    const pos = isLong ? long : short;
    if (!pos?.exists) continue;
    t.note("清场（§〇.7）", `平掉既有${isLong ? "多" : "空"}仓（sizeInUsd ${pos.sizeInUsd}）——资金流在 s0 之前，不进 Delta`);
    await closePositionQuiet({ ...ctx, isLong }, pos, { executionFee, waitMs });
  }

  // 复检（§〇.7 的「前自检断言」，落成真核对点而不是口头声明）
  long = await posOf(true);
  short = await posOf(false);
  const pending = await pendingOrderCount(ctx);
  t.checkTrue(
    "前置复检：双方向无仓位、本账户无在挂订单（§〇.7 清场后）",
    !long?.exists && !short?.exists && pending === 0n,
    `多仓 ${long?.exists ? "在" : "无"} · 空仓 ${short?.exists ? "在" : "无"} · 挂单 ${pending}`
  );
  return takeSnapshot(ctx);
}

/**
 * 确保前置仓位存在（§〇.7「建立」而非「声明」）。
 *
 * **为什么必须有这一步**：fork 是**有状态**的，而全平类用例（IT-POS-022 等）会把仓位清掉。
 * 如果各用例都依赖「上一条留下的仓位」，套件就只能按特定顺序跑一次——
 * 跑第二遍时后面的用例全部 BLOCKED。每条用例自己保证前置，套件才可重复、可乱序、可单跑。
 *
 * §〇.7 的优先级：**优先新开一笔已知参数的仓位**（既有仓位先平掉再开，期望值可用字面量）；
 * 仅在平不掉时退化为「收养」现有仓位、以读数为基线（期望值退化为公式）。
 * 建立过程不产生核对点（那是 IT-POS-001 的职责），只在流水里留 note 说明前置怎么来的。
 */
export async function ensurePosition(ctx, t, { sizeUsd, collateral, executionFee, waitMs = 300_000 }) {
  let snap = await takeSnapshot(ctx);
  if (snap.values.position?.exists) {
    if (ctx.broadcaster.simulated) {
      t.note("前置仓位", `已存在（sizeInUsd ${snap.values.position.sizeInUsd}）；dry-run 不重建，直接以读数为基线`);
      return snap;
    }
    // §〇.7：优先「新开已知参数的仓位」——先平旧仓再按 SEED 参数重开，而不是直接收养
    t.note(
      "前置仓位（§〇.7）",
      `已存在（sizeInUsd ${snap.values.position.sizeInUsd}），先平掉再按已知参数新开——优先「建立」，收养只是后备`
    );
    try {
      await closePositionQuiet(ctx, snap.values.position, { executionFee, waitMs });
    } catch (error) {
      t.note("前置仓位", `平不掉既有仓位（${error.message}）——退化为「收养」，期望值以读数为基线`);
      return snap;
    }
    snap = await takeSnapshot(ctx);
  }
  if (ctx.broadcaster.simulated) {
    t.note("前置仓位", "当前无仓位；dry-run 不建仓，后续核对点将标 SKIPPED");
    return snap;
  }

  t.note("前置仓位", `当前无仓位，先开一笔（size ${sizeUsd} / 抵押 ${collateral}）——本步不产生核对点`);
  const r = await submitAndSettle(ctx, t, {
    stepNo: "0",
    label: `前置：开一笔${ctx.isLong ? "多" : "空"}仓（size ${sizeUsd}）`,
    before: snap,
    waitMs,
    tx: buildIncreaseMulticall({
      exchangeRouter: ctx.a.exchangeRouter,
      orderVault: ctx.a.orderVault,
      collateralToken: ctx.a.usdc,
      account: ctx.trader,
      marketIndex: ctx.marketIndex,
      isLong: ctx.isLong,
      sizeDeltaUsd: sizeUsd,
      collateral,
      executionFee,
    }),
  });
  if (r.blocked) {
    const err = new Error(`前置建仓失败：${r.blocked}`);
    err.blocked = true;
    throw err;
  }
  snap = r.after ?? (await takeSnapshot(ctx));
  if (!snap.values.position?.exists) {
    const err = new Error("前置建仓后仓位仍不存在——订单可能被静默取消，查 keeper 日志");
    err.blocked = true;
    throw err;
  }
  return snap;
}

/* ------------------------------------------------ §〇.8 funding 口径：事件与双闭环 ------------------------------------------------ */

/**
 * 抓执行期事件（范围通常取 (s0, s2]，只取本市场）。
 * `feesCollected` 按 orderKey 定位**本单**的 PositionFeesCollected；
 * `fundingEvents` 是范围内本市场全部 Funding 事件——市场 LP 闭环要的是区间总账，
 * 不能只看本单那一条（范围内可能有别的仓位操作也触发 funding 更新）。
 *
 * ⚠️ topic1 不能一刀切按市场过滤：PositionFeesCollected / Funding 的 topic1 是
 * bytes32(marketIndex)，但 PositionDecrease / PositionIncrease 的 topic1 是
 * bytes32(account)（PositionEventUtils L73/L123/L302）——extraNames 里的事件
 * 一律不带 topic1，靠 orderKey 精确匹配。
 */
export async function fetchExecutionEvents(ctx, { fromBlock, toBlock, orderKey, extraNames = [] }) {
  const common = { emitter: ctx.a.eventEmitter, fromBlock, toBlock };
  const byMarket = { ...common, topic1: marketIndexTopic(ctx.marketIndex) };
  const [fees, funding, ...extra] = await Promise.all([
    fetchEmitterEvents(ctx.rpc, { ...byMarket, eventName: "PositionFeesCollected" }),
    fetchEmitterEvents(ctx.rpc, { ...byMarket, eventName: "Funding" }),
    ...extraNames.map((eventName) => fetchEmitterEvents(ctx.rpc, { ...common, eventName })),
  ]);
  // ⚠️ 同一个订单 key，不同事件用**不同字段名**装：
  //    `PositionIncrease` / `PositionDecrease` / `PositionFeesCollected` → `orderKey`
  //    `OrderCancelled` / `OrderCreated` / `OrderFrozen`                 → `key`
  // 只认 `orderKey` 会让所有取消类事件永远匹配不上，而且是**静默失配**——
  // 断言写成「应当发出 OrderCancelled」时会恒假，看起来像被测系统的问题。
  const keyOf = (e) => e.bytes32?.orderKey ?? e.bytes32?.key ?? null;
  const byOrderKey = (e) => !orderKey || keyOf(e)?.toLowerCase() === orderKey.toLowerCase();
  const out = { feesCollected: fees.find(byOrderKey) ?? null, fundingEvents: funding };
  extraNames.forEach((name, i) => (out[name] = extra[i].find(byOrderKey) ?? null));
  return out;
}

/**
 * §〇.8 闭环①（仓位结算闭环，T0）：
 *   collateral Δ = 流入(转入为正/提取为负) − negativeFundingFeeAmount + positiveFundingFeeAmount − totalCostAmountExcludingFunding
 * 四值取自本单的 `PositionFeesCollected` 事件。事件里没有单列 totalCostAmountExcludingFunding，
 * 但 totalCostAmount = excludingFunding + negativeFundingFeeAmount（PositionPricingUtils L373-376），可反推。
 * 增仓侧（IncreasePositionUtils L239-240）与减仓侧（DecreasePositionCollateralUtils L127-132）已核，符号一致。
 */
export function checkSettlementFormula(t, { label = "s2", flow, feesCollected, collateralDelta }) {
  if (!feesCollected) {
    t.skip(`${label} 仓位结算闭环（§〇.8 公式）`, "区间内没抓到本单的 PositionFeesCollected 事件");
    return null;
  }
  const u = feesCollected.uint;
  const neg = u.negativeFundingFeeAmount ?? 0n;
  const pos = u.positiveFundingFeeAmount ?? 0n;
  const exclFunding = (u.totalCostAmount ?? 0n) - neg;
  t.checkEq(
    `${label} 仓位结算闭环：collateral Δ = 流入 − 负资金费 + 正资金费 − 非资金费成本（§〇.8，T0）`,
    collateralDelta,
    flow - neg + pos - exclFunding,
    "USDC 1e6",
    `流入 ${flow} − neg ${neg} + pos ${pos} − 非资金费成本 ${exclFunding}（事件 totalCostAmount ${u.totalCostAmount ?? 0n}）`
  );
  return { neg, pos, exclFunding };
}

/**
 * §〇.8 闭环②（市场 LP 闭环，T0）：claimable(FUNDING) Δ = Σ max(Funding.positionPaysLp, 0)。
 * positionPaysLp < 0 的部分**不走 claimable**——那是 LPVault → PositionVault 的真实转账
 * （MarketUtils L692-695 的 else 分支），已体现在 lpVault/posVault 两个槽位的 Δ 里：
 * 守恒五方把它计入（内部转账，求和仍为 0），逐槽位期望值也必须计入（lpVault Δ −N / posVault Δ +N）。
 * 两环之差只记录不做相等断言（ISS-016：口径差非资金缺口）。
 */
export function checkFundingMarketLoop(t, { label = "s2", d02, fundingEvents, settlement = null }) {
  const paysLp = fundingEvents.map((e) => e.int?.positionPaysLp ?? 0n);
  const toClaimable = paysLp.reduce((s, v) => s + (v > 0n ? v : 0n), 0n);
  const lpToPosVault = paysLp.reduce((s, v) => s + (v < 0n ? -v : 0n), 0n);
  t.checkEq(
    `${label} 市场 LP 闭环：claimable(FUNDING) Δ = Σ max(positionPaysLp, 0)（§〇.8，T0）`,
    d02.claimableFeeAmountFunding,
    toClaimable,
    "USDC 1e6",
    `Funding 事件 ${fundingEvents.length} 条，positionPaysLp = [${paysLp.join(", ")}]`
  );
  if (lpToPosVault > 0n) {
    t.note(
      "funding LPVault→PositionVault 真实转账（§〇.8）",
      `本区间合计 ${lpToPosVault}（positionPaysLp < 0 分支）；已含在 lpVault Δ / posVault Δ 中，守恒五方计入`
    );
  }
  if (settlement) {
    const posNet = settlement.neg - settlement.pos;
    const marketNet = paysLp.reduce((s, v) => s + v, 0n);
    t.note(
      "funding 两环差（只记录不断言，ISS-016 口径差）",
      `仓位结算环净扣 ${posNet} vs 市场环 Σ positionPaysLp ${marketNet}，差 ${posNet - marketNet}`
    );
  }
  return { toClaimable, lpToPosVault };
}

/* ------------------------------------------------------------ 闸门阈值（实参推导） */

/**
 * 读部署实参，推出「提取抵押」两道闸门的阈值。
 *
 * ⚠️ **不许照搬夹具的 52.5e6**——那是夹具参数下的值。fork 上必须从链上实读参数现推，
 * 否则参数一改用例就失效，而且失效时是**静默通过**（阈值算错、断言照样绿）。
 *
 * 两道闸门（口径不一致是已登记的 ISS-015）：
 *   预检 `willPositionCollateralBeSufficient`：剩余抵押 × 价 ≥ max(MIN_COLLATERAL_USD, sizeInUsd × factor)
 *                                              —— **不扣**平仓费
 *   终检：                              (剩余抵押 − 平仓费) × 价 ≥ 同一个下限
 */
export async function readGateParams(ctx, position) {
  const { calldata } = await import("../../tool/onchain-tx/lib/cast.mjs");
  const K = await import("../../tool/onchain-tx/lib/keys.mjs");
  const rd = async (key) =>
    BigInt(
      (await ctx.rpc.single("eth_call", [
        { to: ctx.a.dataStore, data: calldata("getUint(bytes32)", [key]) },
        "latest",
      ])) || "0x0"
    );

  const minCollateralFactor = await rd(K.minCollateralFactorKey(ctx.marketIndex));
  const minCollateralUsd = await rd(K.BASE.MIN_COLLATERAL_USD);
  const minPositionSizeUsd = await rd(K.BASE.MIN_POSITION_SIZE_USD);
  const feeFactor = await rd(K.positionFeeFactorKey(ctx.marketIndex, false));

  const FLOAT = 10n ** 30n;
  const USDC_PRICE = 10n ** 24n; // USDC 的 Oracle Contract Price（附录 C §一）

  // 下限（USD 1e30）：两道闸门共用，取 MIN_COLLATERAL_USD 与 size×factor 的较大者
  const byFactor = (position.sizeInUsd * minCollateralFactor) / FLOAT;
  const floorUsd = byFactor > minCollateralUsd ? byFactor : minCollateralUsd;

  const closeFee = (position.sizeInUsd * feeFactor) / FLOAT / USDC_PRICE; // USDC 1e6
  const floorKeep = floorUsd / USDC_PRICE; //                               剩余 ≥ 此值才过**预检**
  const finalKeep = floorKeep + closeFee; //                                剩余 ≥ 此值才过**终检**

  return {
    minCollateralFactor,
    minCollateralUsd,
    minPositionSizeUsd,
    feeFactor,
    closeFee,
    floorUsd,
    floorKeep,
    finalKeep,
    maxWithdrawal: position.collateralAmount > finalKeep ? position.collateralAmount - finalKeep : 0n,
  };
}

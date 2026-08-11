// 域专用 fork —— 给需要**改写全局配置**的域（LIQ / ADL）起一个自己的链。
//
// ## 为什么不能在共享 fork 上做
//
// 清算类用例的前提是「把仓位推到维持保证金以下」，而部署侧 `oracleProviderForToken`
// 指向 ChainlinkDataStreamProvider——价格来自 Chainlink 签名报价，伪造不了。
// 唯一可控的路子是把 `priceFeedKey(token)` 改指到我们自己的聚合器
// （`ChainlinkPriceFeedProvider.getOraclePrice` 完全忽略 data、不验签）。
//
// 这是**全局破坏性改动**：改完之后共享 fork 上跑着的 keeper-runner 会因为
// `InvalidOracleProviderForToken` 全线执行失败。所以必须自己起一条链。
//
// ## 为什么是 anvil 而不是再开一个 Tenderly VNet
//
// 附录 C §〇.9 要求「每用例 `evm_snapshot` / `evm_revert`」。我在共享 VNet 上实测过：
// **回滚会打断 keeper-runner**——Redis 事件游标停在未来的块、去重键残留、producer
// 内存游标不跟随，三层都要清且必须重启（实测恢复约 96 秒，见 `snapshot-probe.mjs`）。
//
// 根因是链下组件，不是链本身。本层**没有任何链下组件**：订单由我们自己扮 ORDER_KEEPER
// 执行（见 `selfkeeper.mjs`）。所以在 anvil 上 §〇.9 的快照纪律是干净可行的。
//
// 顺带的好处：本地无网络往返、`evm_increaseTime` 可推 30 天（IT-LIQ-011）、
// 起停成本低、跑完即焚不留痕。
//
// ## 一条链的生命周期
//
//   const fork = await startDomainFork({ upstream, domain: "LIQ" });
//   await fork.provisionControlledPrices({ deployment, admin, tokens });
//   await fork.applyConfigProfile(CONFIG_L0);      // 自检不过就抛，不进 Act
//   const snap = await fork.snapshot();
//   ... 跑一条用例 ...
//   await fork.revertTo(snap);
//   await fork.stop();

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { calldata } from "../../tool/onchain-tx/lib/cast.mjs";
import {
  priceFeedKey,
  priceFeedMultiplierKey,
  priceFeedHeartbeatDurationKey,
  oracleProviderForTokenKey,
  isOracleProviderEnabledKey,
} from "../../tool/onchain-tx/lib/keys.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * **聚合器小数位取 `30 − tokenDecimals`，让 multiplier 恰好等于 1e30。**
 *
 * 合约内部价 = `answer × multiplier / 1e30`，`multiplier = 10^(60 − feedDecimals − tokenDecimals)`。
 * 取 `feedDecimals = 30 − tokenDecimals` ⇒ `multiplier = 1e30` ⇒ **`answer` 就是合约内部价，1:1**。
 *
 * 为什么非要 1:1：IT-LIQ-002/004 要测「阈值 ±1 个价格单位」。若沿用 Chainlink 惯例的
 * 8 位小数，WNT 的 multiplier = 1e34，可表示的最小价格步长是 **1e4 个内部价单位**——
 * ±1 根本构造不出来，用例会退化成「±10000」，命题就变了。
 */
export const feedDecimalsFor = (tokenDecimals) => 30 - tokenDecimals;

const post = async (url, method, params = []) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) {
    // ⚠️ revert 的 returndata 在 `error.data`，**不在 `error.message` 里**。
    // 首版只取 message，于是 `PositionShouldNotBeLiquidated` 只能认出选择器、
    // 四个参数全解成「(缺)」——而那四个参数正是 05 门槛 C5 要求核对的东西。
    const err = new Error(`${method}: ${json.error.message ?? JSON.stringify(json.error)}`);
    err.data = typeof json.error.data === "string" ? json.error.data : json.error.data?.data ?? null;
    throw err;
  }
  return json.result;
};

function mockPriceFeedArtifact() {
  const path = join(HERE, "../contracts/out/MockPriceFeed.sol/MockPriceFeed.json");
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(
      `找不到 MockPriceFeed 字节码（${path}）。\n` +
        `  先编译：cd Test/project/fx100/integration/contracts && forge build`
    );
  }
}

/**
 * 起一条域专用 anvil fork。
 *
 * `--auto-impersonate` 免去逐地址 `anvil_impersonateAccount`；本层所有写操作都以
 * 部署侧角色地址的身份发出（那个地址持有全部角色，见 `config/*.roles.json`），
 * **不碰任何私钥**。
 */
export async function startDomainFork({ upstream, domain, port = 0, blockNumber = null, timeoutMs = 90_000 }) {
  // ⚠️ 端口必须**每次现取空闲的**，不能按域名哈希固定。
  // 首版是 `19000 + hash(domain) % 900`——同一个域恒定一个端口，于是
  // ①两个 run.mjs 并行跑同域用例会撞端口；②上一条 anvil 没退干净时下一条静默起不来
  // （实测：跑到第三条用例整个套件卡死，排查了好一阵才发现是端口占用）。
  const chosenPort = port || (await findFreePort());

  // 上游 URL 不直接交给 anvil——经本地代理中转，token 不进 argv（见 startUpstreamProxy）
  const proxy = await startUpstreamProxy(upstream);

  const args = [
    "--fork-url", proxy.url,
    "--port", String(chosenPort),
    "--silent",
    "--no-rate-limit",
    "--auto-impersonate",
    // ⚠️ **gas 价归零**，理由是让执行费闸门确定化。
    //
    // `GasUtils.validateExecutionFee` 的下限是 `gasLimit × tx.gasprice`（:186）——
    // 随链上 base fee 浮动。实测：同一笔「纯加保证金」在跑了十几笔交易之后
    // base fee 涨上去，下限从可忽略变成 5.25e15，用例固定的执行费 2e13 就被
    // `InsufficientExecutionFee` 拦下——**同样的用例，跑第几笔决定成败**。
    //
    // 执行费闸门是 ORD 域的被测对象，不是 LIQ 域的。在专用链上把它中性化，
    // 换来的是本域全部用例与「链上跑了多少笔交易」解耦。
    "--base-fee", "0",
    "--gas-price", "0",
  ];
  if (blockNumber) args.push("--fork-block-number", String(blockNumber));

  const proc = spawn("anvil", args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (d) => (stderr += String(d)));

  const url = `http://127.0.0.1:${chosenPort}`;
  const deadline = Date.now() + timeoutMs;
  let chainId = null;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      await proxy.close().catch(() => {});
      throw Object.assign(new Error(`anvil 启动失败（exit ${proc.exitCode}）：${stderr.slice(0, 300)}`), {
        blocked: true,
      });
    }
    try {
      chainId = BigInt(await post(url, "eth_chainId"));
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  if (chainId === null) {
    proc.kill();
    await proxy.close().catch(() => {});
    throw Object.assign(new Error(`anvil ${timeoutMs}ms 内没起来：${stderr.slice(0, 300)}`), { blocked: true });
  }

  const forkBlock = Number(BigInt(await post(url, "eth_blockNumber")));

  const fork = {
    domain,
    rpcUrl: url,
    chainId,
    forkBlock,
    /** 给这条链贴的标签——**永不含上游 URL**（里面嵌着 access token） */
    label: `anvil:${domain}@${chosenPort} (fork of chain ${chainId} block ${forkBlock})`,

    call: (method, params) => post(url, method, params),

    async ethCall(to, signature, params, block = "latest") {
      return post(url, "eth_call", [{ to, data: calldata(signature, params) }, block]);
    },

    /**
     * 免签名发交易并等回执。
     *
     * anvil 是即时出块，但 `eth_sendTransaction` 返回后回执**不保证同一拍就可读**——
     * 首版没轮询，第一笔部署交易就拿到 null 回执。这里短轮询兜住。
     */
    async send({ from, to, data, value = 0n, label = "" }) {
      const hash = await post(url, "eth_sendTransaction", [
        {
          from,
          to,
          data,
          value: "0x" + BigInt(value).toString(16),
          gas: "0x2000000",
          // ⚠️ **必须显式写 0**：不写的话 anvil 会自己填默认优先费（实测 1 gwei），
          // 于是 `GasUtils.validateExecutionFee` 的下限
          // `gasLimit × tx.gasprice`（:186）变成 5.25e15，用例固定的执行费被
          // `InsufficientExecutionFee` 拦下。只加 `--gas-price 0 --base-fee 0` 启动参数**不够**
          // ——那两个管的是链的 base fee，管不了单笔交易缺省填入的 gasPrice。
          gasPrice: "0x0",
        },
      ]);
      let receipt = null;
      for (let i = 0; i < 100 && !receipt; i++) {
        receipt = await post(url, "eth_getTransactionReceipt", [hash]);
        if (!receipt) await new Promise((r) => setTimeout(r, 50));
      }
      if (!receipt) throw new Error(`${label || to}: 发出后 5s 没拿到回执（${hash}）`);
      return {
        txHash: hash,
        blockNumber: Number(BigInt(receipt.blockNumber)),
        status: BigInt(receipt.status ?? "0x0") === 1n ? "success" : "reverted",
        gasUsed: String(BigInt(receipt.gasUsed ?? 0)),
        logs: receipt.logs ?? [],
        label,
      };
    },

    /**
     * 发交易，失败即抛（环境搭建用——搭不起来就该停，不该带病进 Act）。
     *
     * 失败时**补一次 `eth_call` 把 revert 原因取出来**：回执里只有 `status = 0`，
     * 光凭 txHash 排查等于从零复现。首版就是这样，一条「交易失败」看了半天。
     */
    async mustSend(tx) {
      const r = await fork.send(tx);
      if (r.status !== "success") {
        let why = "（原因未取到）";
        try {
          await post(url, "eth_call", [
            { from: tx.from, to: tx.to, data: tx.data, value: "0x" + BigInt(tx.value ?? 0n).toString(16) },
            "0x" + BigInt(r.blockNumber - 1).toString(16),
          ]);
          why = "（重放 eth_call 却成功了——可能是同块内的状态依赖）";
        } catch (error) {
          why = error.data ? `revert data ${error.data}` : String(error.message ?? error).slice(0, 200);
        }
        throw Object.assign(new Error(`${tx.label || tx.to} 交易失败（${r.txHash}）：${why}`), {
          blocked: true,
          revertData: null,
        });
      }
      return r;
    },

    setBalance: (address, wei) =>
      post(url, "anvil_setBalance", [address, "0x" + BigInt(wei).toString(16)]),

    snapshot: () => post(url, "evm_snapshot"),

    /**
     * 回滚。**anvil 的快照是一次性的**——`evm_revert` 之后该 id 失效，
     * 而且比它新的快照也一并作废。所以回滚后要立刻重新打一个。
     */
    async revertTo(id) {
      const ok = await post(url, "evm_revert", [id]);
      if (ok !== true) throw Object.assign(new Error(`evm_revert(${id}) 失败——实例作废`), { blocked: true });
      return post(url, "evm_snapshot");
    },

    /** 推进时间并出块（IT-LIQ-005 的 grace ±1 秒、011 的 30 天） */
    async increaseTime(seconds) {
      await post(url, "evm_increaseTime", [Number(seconds)]);
      await post(url, "evm_mine");
      return Number(BigInt((await post(url, "eth_getBlockByNumber", ["latest", false])).timestamp));
    },

    async now() {
      return Number(BigInt((await post(url, "eth_getBlockByNumber", ["latest", false])).timestamp));
    },

    async stop() {
      proc.kill("SIGKILL");
      await new Promise((r) => setTimeout(r, 100));
      await proxy.close().catch(() => {});
    },
  };

  return fork;
}

/**
 * 部署可控价格源并改指，逐项自检。
 *
 * 自检不是走过场：改指涉及 4 个 DataStore 键 + 1 个 provider 开关，
 * **任何一个写错都不会报错，只会让后续全部价格断言建立在错的价上**。
 * 所以最后一道自检是直接 `eth_call` 打到 `ChainlinkPriceFeedProvider.getOraclePrice`，
 * 核对它吐出来的 min/max 是不是我们想要的内部价——端到端，不是逐键回读。
 *
 * @param tokens [{ name, address, decimals, initialContractPrice }]
 */
export async function provisionControlledPrices(fork, { deployment, admin, tokens, provider }) {
  const ds = deployment.addresses.dataStore;
  const oracle = deployment.addresses.oracle;
  provider ??= deployment.addresses.chainlinkPriceFeedProvider; // 地址不裸写，从部署产物取
  const artifact = mockPriceFeedArtifact();

  await fork.setBalance(admin, 100n * 10n ** 18n);

  const enabled = BigInt(
    (await fork.ethCall(ds, "getBool(bytes32)", [isOracleProviderEnabledKey(provider)])) || "0x0"
  );
  if (enabled !== 1n) {
    throw Object.assign(
      new Error(`ChainlinkPriceFeedProvider(${provider}) 在本部署上未启用——改指路子不通`),
      { blocked: true }
    );
  }

  const feeds = {};
  for (const token of tokens) {
    const feedDecimals = feedDecimalsFor(token.decimals);
    const multiplier = 10n ** BigInt(60 - feedDecimals - token.decimals); // 恒 1e30，见 feedDecimalsFor

    // 1) 部署聚合器（构造参数：初始 answer、小数位、描述）
    const ctor = encodeMockCtor(token.initialContractPrice, feedDecimals, `${token.name}/USD mock`);
    const deployReceipt = await fork.mustSend({
      from: admin,
      to: null,
      data: artifact.bytecode.object + ctor,
      label: `部署 MockPriceFeed(${token.name})`,
    });
    const feed = await contractAddressOf(fork, deployReceipt.txHash);

    // 2) 四个键改指
    for (const [label, sig, key, value] of [
      ["priceFeed", "setAddress(bytes32,address)", priceFeedKey(token.address), feed],
      ["multiplier", "setUint(bytes32,uint256)", priceFeedMultiplierKey(token.address), multiplier],
      // heartbeat 取足够大：IT-LIQ-011 要推 30 天，用真实的 24h 会触发
      // ChainlinkPriceFeedNotUpdated。mock 的 updatedAt 恒为 block.timestamp，
      // 本来就不会过期，这里只是不让守卫误伤。
      ["heartbeat", "setUint(bytes32,uint256)", priceFeedHeartbeatDurationKey(token.address), 365n * 86400n],
      ["provider", "setAddress(bytes32,address)", oracleProviderForTokenKey(oracle, token.address), provider],
    ]) {
      await fork.mustSend({
        from: admin,
        to: ds,
        data: calldata(sig, [key, typeof value === "bigint" ? value : value]),
        label: `${token.name} ${label}`,
      });
    }

    feeds[token.name] = { ...token, feed, feedDecimals, multiplier };
  }

  // 3) 端到端自检：provider 吐出来的内部价必须等于我们设的
  for (const t of Object.values(feeds)) {
    const got = await readProviderPrice(fork, { provider, token: t.address });
    if (got.min !== t.initialContractPrice || got.max !== t.initialContractPrice) {
      throw Object.assign(
        new Error(
          `${t.name} 价格源自检不过：provider 吐出 min ${got.min} / max ${got.max}，` +
            `期望 ${t.initialContractPrice}（内部价档）`
        ),
        { blocked: true }
      );
    }
  }

  return {
    feeds,
    /** 设内部价（不是聚合器原始档——1:1，见 feedDecimalsFor） */
    async setPrice(name, contractPrice) {
      const t = feeds[name];
      if (!t) throw new Error(`没有这个价格源：${name}（有 ${Object.keys(feeds).join(" / ")}）`);
      await fork.mustSend({
        from: admin,
        to: t.feed,
        data: calldata("setAnswer(int256)", [contractPrice]),
        label: `设 ${name} 价 = ${contractPrice}`,
      });
      const got = await readProviderPrice(fork, { provider, token: t.address });
      if (got.min !== contractPrice) {
        throw Object.assign(
          new Error(`设 ${name} = ${contractPrice} 后回读成 ${got.min}——价格源不可信，停`),
          { blocked: true }
        );
      }
      return contractPrice;
    },
    /** 构造 oracleParams：走 priceFeed provider，`data` 恒空（不验签） */
    oracleParams(names) {
      const list = names.map((n) => feeds[n]);
      return {
        tokens: list.map((t) => t.address),
        providers: list.map(() => provider),
        data: list.map(() => "0x"),
      };
    },
  };
}

async function readProviderPrice(fork, { provider, token }) {
  const hex = await fork.ethCall(provider, "getOraclePrice(address,bytes)", [token, "0x"]);
  const body = hex.replace(/^0x/, "");
  // ValidatedPrice { address token; uint256 min; uint256 max; uint256 timestamp; address provider; }
  const word = (i) => BigInt("0x" + body.slice(i * 64, (i + 1) * 64));
  return { min: word(1), max: word(2), timestamp: word(3) };
}

async function contractAddressOf(fork, txHash) {
  const receipt = await fork.call("eth_getTransactionReceipt", [txHash]);
  if (!receipt?.contractAddress) throw new Error(`部署交易 ${txHash} 没有 contractAddress`);
  return receipt.contractAddress;
}

/** abi.encode(int256, uint8, string) —— 构造参数，追加在 creation bytecode 后面 */
function encodeMockCtor(answer, decimals, description) {
  const w = (v) => BigInt.asUintN(256, BigInt(v)).toString(16).padStart(64, "0");
  const bytes = new TextEncoder().encode(description);
  const padded = Buffer.from(bytes).toString("hex").padEnd(Math.ceil(bytes.length / 32) * 64, "0");
  return w(answer) + w(decimals) + w(0x60) + w(bytes.length) + padded;
}

/**
 * 上游转发代理 —— **让上游 URL 不出现在任何进程的命令行里**。
 *
 * anvil 的 `--fork-url` 没有环境变量出口（`anvil --help` 里只有 `ANVIL_IP_ADDR` 带 `[env:]`），
 * 直接传就意味着带 access token 的完整 URL 进了 argv，本机任何用户 `ps` 都能读到。
 * 这与 ISS-013（admin 私钥经 `--private-key` 进命令行）是同一类问题——
 * 那次的教训是「护栏分叉就是安全 bug」，这里同样不该开第二个口子。
 *
 * 所以起一个只监听 127.0.0.1 的转发代理，anvil 拿到的是 `http://127.0.0.1:<port>`。
 * token 只存在于本进程内存里，不进 argv、不进日志（`fork.label` 也只印代理端口）。
 */
async function startUpstreamProxy(upstream) {
  const port = await findFreePort();
  const server = createHttpServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      try {
        const upstreamRes = await fetch(upstream, {
          method: req.method,
          headers: { "content-type": "application/json" },
          body: chunks.length ? Buffer.concat(chunks) : undefined,
        });
        const body = Buffer.from(await upstreamRes.arrayBuffer());
        res.writeHead(upstreamRes.status, { "content-type": "application/json" });
        res.end(body);
      } catch (error) {
        // 转发失败要如实回一个 JSON-RPC 错误，不能静默挂起——anvil 会一直等
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: String(error.message ?? error) } }));
      }
    });
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  server.keepAliveTimeout = 60_000;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

/** 让内核分配一个空闲端口再让给 anvil。窗口期极短的 TOCTOU 可接受——起链失败会明确报错。 */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/**
 * 写一组 DataStore 键并逐一回读自检。
 *
 * 对应设计稿的「配置 fixture 三要件」：有名字、内容列全、**有自检断言**。
 * 自检不过抛 `blocked`——配置没就位就不进 Act，避免拿错配置跑出「看着对」的绿。
 *
 * ## ⚠️ uint 与 int 是 DataStore 里**两张不同的表**
 *
 * `setUint(k, 0)` 与 `setInt(k, 0)` 写的不是同一个槽位。写错表的后果是**静默的**：
 * 值写进去了、交易成功、读回来也对——只是读的是没人用的那张表，真正被合约读的那张
 * 纹丝未动。
 *
 * 首版就栽在这：`skewImpactFactorKey` 被合约用 `getInt` 读，我用 `setUint` 写，
 * 自检又用 `getUint` 读回——**自检确认了我写进去的值，却没确认合约能读到它**，
 * 于是这个自检永远不会失败。结果点差没清零，开仓即带 0.125% 的 `dynamicSpread`，
 * 10_000e30 的仓一开出来就少 12.48 USD，阈值推导全盘作废。
 *
 * 所以自检必须**用与写入相同的 getter**，且 profile 里每个键都要显式归族。
 * 归哪一族只看一件事：源码里那个键是被 `getUint` 还是 `getInt` 读的。
 *
 * @param profile { name, uints: [[key, value, label]], ints: [[key, value, label]] }
 */
export async function applyConfigProfile(fork, { deployment, admin, profile }) {
  const ds = deployment.addresses.dataStore;
  const applied = [];

  for (const [kind, rows] of [
    ["uint", profile.uints ?? []],
    ["int", profile.ints ?? []],
  ]) {
    const setter = kind === "uint" ? "setUint(bytes32,uint256)" : "setInt(bytes32,int256)";
    for (const [key, value, label] of rows) {
      await fork.mustSend({
        from: admin,
        to: ds,
        data: calldata(setter, [key, value]),
        label: `${profile.name} · ${label}`,
      });
      applied.push({ key, want: BigInt(value), label, kind });
    }
  }

  const bad = [];
  for (const { key, want, label, kind } of applied) {
    // 关键：用与写入**同一族**的 getter 回读，否则自检永远不会失败
    const raw = (await fork.ethCall(ds, kind === "uint" ? "getUint(bytes32)" : "getInt(bytes32)", [key])) || "0x0";
    const got = kind === "uint" ? BigInt(raw) : BigInt.asIntN(256, BigInt(raw));
    if (got !== want) bad.push(`${label}（${kind}）: 回读 ${got} ≠ 期望 ${want}`);
  }
  if (bad.length) {
    throw Object.assign(new Error(`配置 ${profile.name} 自检不过：\n    ${bad.join("\n    ")}`), { blocked: true });
  }

  return {
    name: profile.name,
    keys: applied.length,
    uints: (profile.uints ?? []).length,
    ints: (profile.ints ?? []).length,
  };
}

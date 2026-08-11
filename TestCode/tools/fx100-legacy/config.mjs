// fx100 测试环境配置 —— **唯一真源**，所有工具从这里取参数。
//
//   import { CONFIG, loadFx100Config, requireFork } from "<相对路径>/config.mjs";
//
//   node Test/project/fx100/config.mjs      # 打印当前生效配置（脱敏），排查用
//
// ┌─ 要改参数？改下面 `CONFIG` 那一块就行，其余是解析与守卫逻辑。
// └─ 新增参数直接往 `CONFIG` 里加字段，不要另起配置文件。
//
// ## 本文件 vs 同级 `config/` 目录
//
// | | 是什么 | 谁写 |
// |---|---|---|
// | **本文件** | **我们配的**测试环境参数（账户、RPC、目标状态、市场编号） | 人工编辑 |
// | `config/` 目录 | 从链上 dump 的部署产物读数（params / tokens / roles） | `tool/config-dump` 生成 |
//
// ## 三类配置，只有第一类在这里
//
// | 配什么 | 在哪 | 能提交吗 |
// |---|---|---|
// | 账户地址、fork RPC、目标状态、市场编号 | **本文件** | ✅ 全是地址与数量，无私钥 |
// | 私钥、Chainlink API key、Redis | `tool/keeper-runner/.env` | ❌ 不提交 |
// | 部署地址表 | `Github/…/base_sepolia_v0.3.1_260729/deployed_addresses.json` | ✅ 部署产物 |
//
// **本文件永不返回私钥。** 签名一律走 cast keystore（`--account`），私钥不流经任何 node 进程（ISS-013）。
//
// ⚠️ 不要从 `Test/fx100BaseDev0624.env` 取账户——那是 0624 那批部署的**另一套账户**
// （`TEST_EOA=0x3d52…C6CF`、`KEEPER_EOA=0xb5eb…8cA2`），与当前 fork 环境无关。
// 集成层一度从那里回退取值，结果读出 trader 余额 0，把环境问题误报成前置缺口。

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

// ════════════════════════════════════════════════════════════════════
// 参数区 —— 改这里
// ════════════════════════════════════════════════════════════════════

export const CONFIG = {
  /** fork 的 RPC。留空则借 `tool/keeper-runner/.env` 的 FX100_RPC_URL（那里同时放私钥，不提交） */
  // 留空：RPC URL 里嵌着 access key，不该硬编码进可提交的文件。
  // 空值会按顺序回退到 $FX100_RPC_URL → keeper-runner/.env（那份是 600 且不提交）。
  // 曾经这里被填成 virtual.mainnet.*（chainId 1 的主网 fork），
  // 而它优先级高于 .env，于是 fork-init 跑到了错的链上——现在 init 会先校验 chainId 拦住。
  rpc: "",

  /** 账户**地址**（不是私钥）。换账户改这里，`fork-init` 与集成层自动跟上。 */
  accounts: {
    trader: "0xEEeA43701a49F3d41EF694DdAFe2Ac74c7c8B119", // 发单账户，兼作 LP
    keeper: "0x542fe841228416F6a3D65eb534a90Ebc5cc36354", // 跑 worker 的账户，由 fork-init 授角色
    admin: "0xf82cf35c5c0019861c2cdc65041c8ac32970d403", // 本部署的 DEFAULT_ADMIN_ROLE 持有者
  },

  /**
   * `fork-init` 要把 fork 拉到的目标状态。人读单位，代码侧用 `loadFx100Config().targetsRaw` 取整数。
   *
   * `lpUsdc` 不能省——LP 池为空时任何开仓都会被 `MaxOpenInterestExceeded` 静默取消（ISS-010），
   * 那是开仓类用例的硬前置。`keeperRoles` 只列 worker 真正需要的三个；
   * rel-worker 是代发者，合约里没有对应角色。
   */
  targets: {
    eth: "10",
    traderUsdc: "1000000",
    lpUsdc: "500000",
    keeperRoles: ["ORDER_KEEPER", "ADL_KEEPER", "LIQUIDATION_KEEPER"],
  },

  /**
   * 市场编号。⚠️ **部署侧与本地夹具相反**（附录 C §七）：
   * 部署 #1 = WBTC、#2 = ETH；夹具 #1 = ETH、#2 = WBTC。
   * fork 用例一律用这里的值，别照搬夹具常量。
   */
  markets: {
    eth: 2,
    wbtc: 1,
  },

  /** 被测部署产物目录名（在 `Github/fx100-contracts@release-v0.3.1/` 下） */
  deployment: "base_sepolia_v0.3.1_260729",

  /**
   * 交易浏览器 URL 模板，`{hash}` 会被替换成交易哈希。**留空 = 不生成链接。**
   *
   * ⚠️ **fork 上的交易不在公开浏览器上。** Tenderly Virtual TestNet 是私有 fork，
   * 交易只存在于那条虚拟链里，`sepolia.basescan.org` 一律 404——
   * 看板此前硬编码的正是它，于是每个 txHash 都链到一个查无此交易的页面。
   *
   * 要出链接就把你 Tenderly 控制台里那条 VNet 的交易页地址粘到这里，形如：
   *   `https://dashboard.tenderly.co/<组织>/<项目>/testnet/<testnet-id>/tx/{hash}`
   * （地址在 Tenderly 控制台打开任意一笔交易后从浏览器地址栏复制，把哈希换成 `{hash}`）
   *
   * **留空比填错好**：看板会退化成「纯哈希 + 可复制」，不给假链接。
   */
  // 2026-08-02 实测：本 VNet 的交易在 Tenderly 控制台上**查不到**，四种路径全试过——
  //   `/AladdinDAO/test/tx/{hash}`                    → "Invalid transaction hash"
  //   `/testnets/<id>/instance/{hash}`                → 落 VNet 总览页（instance 位要的是实例 UUID）
  //   `/testnets/<id>/instance/<uuid>/tx/{hash}`      → 跳回 /home
  //   `/explorer/vnet/<id>/tx/{hash}`                 → 404
  // 根因不在 URL 拼法：VNet 自己的交易列表（`.../instance/<uuid>/activity/transactions`）
  // **一行都没有**，连 1 分钟前刚发的都不在——我们是 impersonation 直接 eth_sendTransaction
  // 打进去的，没走 Tenderly 的交易索引通路。控制台没索引的交易，给不出页面。
  // 先留空（看板退化成点击复制哈希）；哪天能在 UI 里点开我们发的交易，把那条 URL 填回来即可。
  explorer: "",
};

/** 把交易哈希套进 `CONFIG.explorer` 模板；没配就返回 null（调用方据此不出链接）。 */
export function explorerTxUrl(hash) {
  if (!CONFIG.explorer || !hash) return null;
  return CONFIG.explorer.includes("{hash}")
    ? CONFIG.explorer.replace("{hash}", hash)
    : `${CONFIG.explorer.replace(/\/+$/, "")}/${hash}`;
}

// ════════════════════════════════════════════════════════════════════
// 以下是解析与守卫，一般不用改
// ════════════════════════════════════════════════════════════════════

export const PROJECT_ROOT = HERE; // Test/project/fx100
export const KEEPER_ENV = join(PROJECT_ROOT, "tool/keeper-runner/.env");
export const DEPLOYMENT_DIR = resolve(
  PROJECT_ROOT,
  "../../../Github/fx100-contracts@release-v0.3.1",
  CONFIG.deployment
);

/* ------------------------------------------------------------ RPC 判别 */

/**
 * fork 主机名特征（Tenderly Virtual TestNet）。
 *
 * 判别关键是**以 `virtual.` 开头**：
 *   fork  `virtual.base-sepolia.eu.rpc.tenderly.co`（中间段数不固定，可能带区域）
 *   真网  `base-sepolia.gateway.tenderly.co`
 * 锚定开头比枚举中间段可靠——首版写成 `virtual.[\w-]*\.rpc` 就把带区域段的 fork 判成了真网。
 */
const FORK_HOST_RE = /^virtual\.[\w.-]+\.rpc\.tenderly\.co$/i;

/** 只认主机名，不认 chainId——fork 与真测试网的 chainId 都是 84532 */
export function classifyRpc(url) {
  if (!url) return "missing";
  try {
    return FORK_HOST_RE.test(new URL(url).host) ? "fork" : "live";
  } catch {
    return "invalid";
  }
}

/** URL 脱敏：Tenderly / Alchemy 把访问令牌嵌在路径里，整条打进日志就等于泄了 key */
export function redact(url) {
  if (!url) return "(未设置)";
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/***`;
  } catch {
    return "(格式非法)";
  }
}

/* ------------------------------------------------------------ 读取 */

/** 只按名取值的 .env 读取器。**调用方只应取非私钥项。** */
export function readEnvFile(path, names = []) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, key, raw] = m;
    if (names.length && !names.includes(key)) continue;
    out[key] = raw.trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

/** 人读单位 → 原始整数，全程 BigInt 不碰浮点 */
export function units(human, decimals) {
  const [whole = "0", frac = ""] = String(human).split(".");
  if (frac.length > decimals) throw new Error(`${human} 小数位超过精度 ${decimals}`);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt((frac + "0".repeat(decimals)).slice(0, decimals) || "0");
}

const isAddress = (v) => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v.trim());
const pickAddress = (...candidates) => {
  for (const v of candidates) if (isAddress(v)) return v.trim().toLowerCase();
  return null;
};

/**
 * 解析全套配置。覆盖顺序（前者优先）：显式入参 > 环境变量 > `CONFIG` > `keeper-runner/.env`（仅 RPC）。
 *
 * **没有 RPC 就报错，不默认回落到真测试网。** 其它工具历史上默认
 * `https://sepolia.base.org`，在 fork 纪律下这个默认值会让人不知不觉打到真链。
 */
export function loadFx100Config({ rpc, trader, keeper, admin } = {}) {
  const fromKeeperEnv = readEnvFile(KEEPER_ENV, ["FX100_RPC_URL", "KEEPER_HTTP_RPC_URL"]);

  const rpcCandidates = [
    [rpc, "参数 --rpc"],
    [process.env.FX100_RPC_URL, "$FX100_RPC_URL"],
    [CONFIG.rpc, "config.mjs 的 CONFIG.rpc"],
    [fromKeeperEnv.FX100_RPC_URL, "keeper-runner/.env 的 FX100_RPC_URL"],
    [fromKeeperEnv.KEEPER_HTTP_RPC_URL, "keeper-runner/.env 的 KEEPER_HTTP_RPC_URL"],
  ];
  const hit = rpcCandidates.find(([v]) => v);
  const rpcUrl = hit?.[0] ?? "";

  const accounts = {
    trader: pickAddress(trader, process.env.FX100_TRADER, CONFIG.accounts.trader),
    keeper: pickAddress(keeper, process.env.FX100_KEEPER, CONFIG.accounts.keeper),
    admin: pickAddress(admin, process.env.FX100_ADMIN, CONFIG.accounts.admin),
  };
  for (const [name, value] of Object.entries(accounts)) {
    if (!value) throw new Error(`config.mjs 的 CONFIG.accounts.${name} 不是合法地址`);
  }

  return {
    rpcUrl,
    rpcLabel: redact(rpcUrl),
    rpcKind: classifyRpc(rpcUrl),
    rpcSource: hit?.[1] ?? "(无)",
    accounts,
    markets: CONFIG.markets,
    targets: CONFIG.targets,
    /** 代码侧直接可用的整数版目标值 */
    targetsRaw: {
      eth: units(CONFIG.targets.eth, 18),
      traderUsdc: units(CONFIG.targets.traderUsdc, 6),
      lpUsdc: units(CONFIG.targets.lpUsdc, 6),
      keeperRoles: CONFIG.targets.keeperRoles,
    },
    deploymentDir: DEPLOYMENT_DIR,
  };
}

/* ------------------------------------------------------------ 守卫 */

/** 缺 RPC 直接中止，并把可配置的位置全列出来 */
export function requireRpc(cfg) {
  if (cfg.rpcKind !== "missing") return;
  throw new Error(
    `没有可用的 RPC。三选一：\n` +
    `  1) 命令行 --rpc <url>\n` +
    `  2) 环境变量 FX100_RPC_URL\n` +
    `  3) ${join(PROJECT_ROOT, "config.mjs")} 的 CONFIG.rpc（留空则借 keeper-runner/.env）`
  );
}

/**
 * fork 主机名闸门。会改状态的路径请**再加**能力探测（`assertForkByCapability`）——
 * 主机名可以配错，能力探测不会骗人。
 */
export function requireFork(cfg, { allowLive = false } = {}) {
  requireRpc(cfg);
  if (cfg.rpcKind === "invalid") throw new Error(`RPC 地址格式非法：${cfg.rpcLabel}`);
  if (cfg.rpcKind === "fork") return;
  if (!allowLive) {
    throw new Error(
      `RPC ${cfg.rpcLabel} 不是 fork（fork 主机名以 virtual. 开头，形如 virtual.base-sepolia.*.rpc.tenderly.co）。\n` +
      `  来源：${cfg.rpcSource}\n` +
      `  确需对真测试网操作请显式放行（--allow-live-testnet）。`
    );
  }
}

/**
 * 能力探测：impersonation 能用就是 fork，真链绝不可能允许。
 * 做法与 `tool/fork-init/init.mjs` 一致（无害的 0 wei 自转探针）。
 *
 * 探针本身会发一笔交易，所以只在**状态变更之前**用；只读 / dry-run 用主机名闸门就够。
 */
export async function assertForkByCapability(sendRpc) {
  try {
    await sendRpc("eth_sendTransaction", [
      {
        from: "0x0000000000000000000000000000000000000001",
        to: "0x0000000000000000000000000000000000000001",
        value: "0x0",
      },
    ]);
  } catch (error) {
    throw new Error(
      `这不是 fork —— impersonation 探针被拒绝（${String(error.message).slice(0, 100)}）。\n` +
      `  会改状态的操作只能在可重置的 fork 上做。fork 环境用 tool/fork-init 拉起。`
    );
  }
}

/** 人读摘要（已脱敏），各工具启动时打一行，省得靠猜 */
export function describe(cfg) {
  const a = cfg.accounts;
  return (
    `RPC ${cfg.rpcLabel}（${cfg.rpcKind}，来自 ${cfg.rpcSource}）\n` +
    `trader ${a.trader}\nkeeper ${a.keeper}\nadmin  ${a.admin}\n` +
    `市场   ETH #${cfg.markets.eth} · WBTC #${cfg.markets.wbtc}（部署侧编号，与夹具相反）`
  );
}

// 直接运行时打印解析结果——排查「我到底连到哪、用的谁」最快的办法
if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = loadFx100Config();
  console.log(`\n配置真源：${join(PROJECT_ROOT, "config.mjs")}\n`);
  console.log(describe(cfg));
  console.log(`\n目标状态：${JSON.stringify(cfg.targets)}`);
  console.log(`部署产物：${cfg.deploymentDir}\n`);
}

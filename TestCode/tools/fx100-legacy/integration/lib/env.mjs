// 集成层的环境组装 —— **薄包装**，配置解析全部委托给共享入口
// [`config.mjs`](../../config.mjs)。
//
// 这里不再自己解析 RPC / 账户：配置来源分叉就是 bug 温床（集成层一度回退到
// `Test/fx100BaseDev0624.env` 的 `TEST_EOA`，那是另一套旧账户，导致读出余额 0）。
// 换账户、换 fork 只改 `Test/project/fx100/config.mjs` 一处。

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadFx100Config,
  requireFork,
  assertForkByCapability,
  classifyRpc,
  redact,
  describe,
  PROJECT_ROOT as FX100_ROOT,
  KEEPER_ENV,
} from "../../config.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(HERE, "../..");

// 共享能力原样透出，用例脚本与测试直接从这里取，不必知道底层在哪
export { classifyRpc, redact, describe, assertForkByCapability, FX100_ROOT, KEEPER_ENV };

/**
 * 组装本层运行环境。字段名保持本层习惯（`rpcLabel` / `kind` / `trader`），
 * 值全部来自共享配置。
 */
export function resolveEnv({ rpc, trader, keeper } = {}) {
  const cfg = loadFx100Config({ rpc, trader, keeper });
  return {
    cfg,
    rpcUrl: cfg.rpcUrl,
    rpcLabel: cfg.rpcLabel,
    kind: cfg.rpcKind,
    source: cfg.rpcSource,
    trader: cfg.accounts.trader,
    keeper: cfg.accounts.keeper,
    admin: cfg.accounts.admin,
    targets: cfg.targets,
  };
}

/** fork 主机名闸门（真广播另有能力探测，见 run.mjs） */
export function assertForkOrExplicit(env, args) {
  requireFork(env.cfg, { allowLive: args.flags.has("allow-live-testnet") });
}

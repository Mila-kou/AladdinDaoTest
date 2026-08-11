# fx100-legacy —— 收编的遗留 .mjs 工具

SCN-009 / SCN-010 的 runner（`src/scenarios/scn-009-runner.ts`、`scn-010-runner.ts`）和
`scripts/recover-scn009.ts` 通过动态 `import()` 使用这里的模块。它们原本住在工作区的
`Test/project/fx100/`，该目录在重构中被整体移出 AladdinDaoTest，导致 runner 报
`Cannot find module .../Test/project/fx100/tool/config-dump/lib/rpc.mjs`。现按原样收编到仓内。

来源：`/Users/milakou/Documents/AladdinDaoTest-claude/project/fx100/`（旧 `Test/` 树的副本，非 git 管理）。
收编时逐字节复制，未做任何源码改动。

## 目录形状不能动

这些 .mjs 之间用相对路径互相引用（`../../tool/onchain-tx/lib/keys.mjs`、
`../../config-dump/lib/abi.mjs`、`../../config.mjs`），所以必须保持原树形，不能拍平。

更关键的是**层级深度不能变**：

| 文件 | 计算 | 落点 |
|---|---|---|
| `tool/onchain-tx/lib/deployment.mjs:12` | `resolve(HERE, "../../../../../../Github/…")` | `AladdinDaoTest/Github/fx100-contracts@release-v0.3.1/…` |
| `config.mjs:124` | `resolve(PROJECT_ROOT, "../../../Github/…")` | 同上 |

`tools/fx100-legacy/` 与旧的 `Test/project/fx100/` 恰好都在工作区根下第 3 层，所以这两处向上
攀爬仍然落在真实的合约部署产物上。**把本目录挪到别的深度，这两条路径会静默指向不存在的位置**
（`loadDeployment()` 会抛"读不到部署产物"，`config.mjs` 侧则悄悄拿到空值）。
runner 侧已经不再依赖这个巧合——`deploymentPath()` 显式从 `process.cwd()` 解析部署目录。

## 运行前置

- **Foundry `cast`**：`tool/onchain-tx/lib/cast.mjs` 与 `tool/lib/exec-guard.mjs` 的所有 calldata
  编码都 shell 出去调 `cast`，package.json 里没有这个依赖。
- **`anvil`**：`integration/lib/domainfork.mjs` 起本地 fork 时会 spawn，并绑定两个 loopback 端口。
- **Node ≥ 18**：闭包直接用 `fetch` / `AbortSignal.timeout` / `TextEncoder`，无 polyfill。
- 无任何 npm 依赖（只用 `node:` 内置模块）。

## 收编范围

18 个 .mjs + 1 个合约产物，是从 10 个入口模块出发的完整传递闭包：

- 入口：`tool/config-dump/lib/rpc.mjs`、`tool/onchain-tx/lib/{deployment,ledger,keys,cast,flows}.mjs`、
  `integration/lib/{actions,events,scenario,domainfork}.mjs`
- 被连带引入：`config.mjs`、`tool/lib/exec-guard.mjs`、`tool/onchain-tx/lib/{decode,errors}.mjs`、
  `integration/lib/{env,ledger}.mjs`、`tool/config-dump/lib/{abi,keccak}.mjs`
- 运行时产物：`integration/contracts/out/MockPriceFeed.sol/MockPriceFeed.json`
  （SCN-010 布受控价格喂价用的字节码）

没有收编任何 `.env`。`config.mjs` 里的 `KEEPER_ENV` 指向仓内不存在的
`tool/keeper-runner/.env`，`readEnvFile()` 读不到就返回空对象——签名私钥一律走 `.env.local`
的 `E2E_TEST_PRIVATE_KEY` / `E2E_SECONDARY_TEST_PRIVATE_KEY`，不经过这里。

## 两处需要留意的重复

- `tool/config-dump/lib/{rpc,abi,keccak}.mjs` 与仓内既有的 `tools/config-dump/lib/` 同名同内容。
  后者服务参数 dump 流程（`src/server/parameter-query.ts` 直接 spawn `tools/config-dump/dump-config.mjs`），
  与本目录彼此独立；改动其中一份不会同步到另一份。
- `tool/onchain-tx/lib/ledger.mjs` 与 `integration/lib/ledger.mjs` 是两个不同的模块，不要混淆。

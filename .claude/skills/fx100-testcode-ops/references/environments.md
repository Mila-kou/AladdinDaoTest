# 环境与 Mock Market Bundle

## 一、Fork 建法（推荐：一键创建 Virtual TestNet；控制台手建为备选）

**一键创建（2026-08 起）**：环境页 ① 按钮「创建 Tenderly Virtual TestNet（固定 Chain ID）」或 `npm run env:vnet:create -- --env <tx-fork|oracle-fork|time-fork> [--block N] [--dry-run]`（`src/server/tenderly-forks.ts`）。

1. 前置：`E2E_TENDERLY_ACCESS_TOKEN`（环境页 ① secret 字段 / `.env.local`）；account/project slug 可选（`E2E_TENDERLY_ACCOUNT_SLUG` / `E2E_TENDERLY_PROJECT_SLUG`，留空从已配置的同项目 VNet RPC 路径推导）。
2. 走 Tenderly **Virtual TestNets REST API**（`POST /api/public/v1/account/{a}/project/{p}/environments`，`network_configs[].chain_config_overrides.chain_id` = catalog `fixedChainId`：tx-fork 99911 / oracle-fork 99912 / time-fork 99913；Parent = Base Sepolia 84532；`block_number` 可选钉死）。legacy Forks API（`POST .../fork`）已于 2026-03-31 停用。
3. 创建后自动：`eth_chainId` 校验固定编号 → 回填 `.env.local` 的主 RPC / Admin RPC（同为 Admin RPC）/ WSS / Chain ID → 登记 `config/tenderly-vnets.json`（只存 environment id 与 RPC 主机名，无凭证）→ 回写 `Docs/contract-releases/CURRENT.json` `environments.<env>`（status/chainId/forkBlockNumber/forkOf）。
4. 然后 ③ 初始化 Mock Market Bundle → ④ 环境检查；oracle-fork / time-fork 关闭运行期 State Sync（tx-fork 按需）。
5. 清理：`npm run env:vnet:delete -- --env <env>`（或 `--environment-id <uuid>`；看板 `POST /api/tenderly-forks/delete`），CURRENT.json 自动置回 pending。临时/CI 环境务必删，避免配额堆满。

**控制台手建（备选）**：`aladdindao/test` 项目 → Create Virtual TestNet，Parent = Base Sepolia (84532)，Custom Chain ID 填固定编号；HTTPS RPC 填环境页"主 RPC"与"Admin RPC"，Chain ID 填固定编号，保存（落盘 `.env.local`，`src/server/environment-settings.ts` 串行化读改写；变量名按 catalog：`E2E_TX_FORK_RPC_URL` / `E2E_ORACLE_FORK_ADMIN_RPC_URL` 等）。

## 二、Bundle 分层结构（登记在 `config/mock-resources.json`）

schema 见 `src/config/mock-resources.ts`。每个 fork 环境一个 registry 条目，内部两层：

| 层 | 成员 | 归属 |
|---|---|---|
| **Bundle 级**（每 bundle 一套） | Index Token（mock 币）、Index Mock Oracle（可 setMockPrice）、注册好的 Market（status=registered、marketIndex、vault、参数配置 tx） | `bundles[alias]`，默认别名 `default-mock` |
| **Fork 级共享**（全 fork 一套） | USDC Token、USDC Mock Oracle | `sharedCollateral`；所有 bundle 共用 |

- 就绪标志 `oracleMode: {index:'mock', collateral:'mock', inlineKeeperReady:true}` = 双 Mock Oracle 齐备，是 Inline Keeper 的硬前提（执行时要自己喂两种价）。
- 顶层 `token/oracle/market` 字段已 `@deprecated`，是旧单 bundle 结构的兼容投影；新结构支持一个 fork 挂多个 bundle（`defaultBundleAlias` 指默认）。
- "已配置的标准 market"只相当于 Bundle 级的第三项（一个注册好的 market），缺 mock oracle 和 mock USDC——执行链路不可自控（价格 60s 过期无解、只能等 Service Keeper）。

## 三、初始化（环境页 ③）

流程：填 Mock Token/Oracle 参数 → 资金与授权 → （可选）复制某个已配置 Market 的 33 项参数 → 保存并初始化。实现：`scripts/init-mock-resources.ts`，服务端排队 `src/server/environment-initializations.ts`。

### "同时重建共享 USDC Oracle（影响本 Fork 全部 Market）"决策表

默认（不勾）行为：**先验收再复用**现存共享 USDC——registry ready、`inlineKeeperReady`、地址一致、链上 `PRICE_FEED` / `ORACLE_PROVIDER_FOR_TOKEN` 接线核对通过（`scripts/init-mock-resources.ts` `reuseSharedCollateral`）；任一条不满足自动新建。

| 场景 | 勾不勾 |
|---|---|
| 该 fork 第一次初始化 | 不用勾（验收不过自然新建） |
| 加第二个 bundle（如 mock-btc） | 不勾（共享现有 USDC 正是设计意图） |
| 要改 USDC min/max 价格区间 / 重部署 USDC Oracle | 勾，并接受该 fork 全部 market 抵押品定价立即改变 |
| 共享层状态损坏 | 勾不勾都会重建，勾上语义更明确 |

隐藏行为：初始化请求携带新 RPC（"新建 fork 并初始化"路径）时服务端**自动强制重建**共享层（`src/server/environment-initializations.ts` 约 239 行）。

## 四、环境检查（环境页 ④）

只读验收：Trade、RPC（含 chainId 与配置一致性）、部署清单、账户/角色、default-mock 完整性、Case 数据源。跑批前④必须 PASS——runner 对 bundle 缺件是**明确拒跑**（如 SCN-010 抛"不是可执行的双 Mock Oracle Market Bundle"），不会跑到一半神秘失败。

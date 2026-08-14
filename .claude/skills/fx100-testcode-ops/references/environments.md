# 环境与 Mock Market Bundle

## 一、Fork 建法（Tenderly 控制台）

1. `aladdindao/test` 项目 → Create Virtual TestNet，Parent Network = Base Sepolia (84532)。
2. Custom Chain ID 按环境固定编号：tx-fork=99911 / oracle-fork=99912 / time-fork=99913。
3. oracle-fork / time-fork **关闭运行期 State Sync**（tx-fork 按需）。
4. HTTPS RPC 填环境页"主 RPC"与"Admin RPC"（可相同），Chain ID 填固定编号，保存。
5. 配置落盘 `.env.local`（`src/server/environment-settings.ts` 串行化读改写）；环境变量名按 catalog：`E2E_TX_FORK_RPC_URL` / `E2E_ORACLE_FORK_ADMIN_RPC_URL` 等。

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

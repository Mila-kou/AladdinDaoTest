# 🚀 FX100 新增 Market 上线手册（合约 + 前端 + Keeper 全链路）

> Notion 页面：[原文](https://app.notion.com/p/3ae3d7873f2c81879274d700c80f2577)
> 作者：fx100-sync（Gordon 的 fx100-contracts 仓库文档同步机器人，内容出自 Gordon）
> 创建时间：2026-08-01
> 最后编辑：2026-08-01
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 产品 / FX100 / 技术相关 / 合约 / 🚀 上线与部署
> 类型：设计文档

> 👥 受众：全员　｜　来源：docs/analysis/../superpowers/specs/2026-07-31-market-onboarding-playbook.md

# FX100 新增 Market 上线手册（合约 + 前端 + Keeper 全链路）

**日期**: 2026-07-31（2026-08-01 更新：真链部署完成、脚本加了 preflight 索引断言/读重试/幂等重试）
**适用**: 在已部署的 FX100 合约上新增交易市场（fork 或真链）
**当前状态**: GMX Top20 已在 **真 Base Sepolia（chain 84532）** 建成 20 个市场（索引 1→20 连续，19 个 Top20 资产 + MSOL，XMR 不部署），链上核对通过；先在 fork（Gordon 20260731, chain 99917）完整预演过一遍。逐资产参数 / Oracle ID / **真链 Token 地址**全表见 [2026-07-31-top20-markets-fork-deployment.md](2026-07-31-top20-markets-fork-deployment.md)
**相关文档**: [2026-06-10-market-listing-oracle-config.md](2026-06-10-market-listing-oracle-config.md)（资产筛选 + oracle 配置）、[2026-07-31-top20-markets-fork-deployment.md](2026-07-31-top20-markets-fork-deployment.md)（第一批部署记录）

---

## 〇、代码仓库与版本（工程师参考）

| 项 | 值 |
|---|---|
| **合约仓库** | `AladdinDAO/fx100-contracts` |
| 合约版本 | **v0.3.1**，部署包 `deployment/base_sepolia_v0.3.1_260729/`（含 `deployed_addresses.json` / `abi/` / `V0.3.1_VS_V0.3.0.md`） |
| 测试分支 | `docs/testing-standards`（测试用例与文档；`src/` 与 release/v0.3.1 逐字节一致，不含合约改动） |
| 本次文档提交 | `46c52c2` — 真链部署记录 + 本手册 |
| **前端仓库** | `AladdinDAO/fx100-apps` |
| 前端分支 | `feat/liquidation-protection-ux-v031`（从 develop 同步 v0.3.1 地址后建立） |
| 本次前端提交 | `69d4a8d7` — Top20 市场部署脚本 + 7 处前端配置 + OC-17 杠杆上限修复 |
| 部署/核对脚本位置 | `fx100-apps/apps/fx-base-app/scripts/tenderly/` |

> ⚠️ **提交纪律**：`fx100-contracts` 用 git 账号 **Sosogao**，`fx100-apps` 用 **Gondoneth**（两个私有仓权限不同，用错账号会报 `Repository not found`）。切换：`gh auth switch --user <名字> && gh auth setup-git`。
>
> ⚠️ 前端产品代码（组件 / locales / SDK 业务逻辑）是 develop 单向同步，**测试分支的本地修改不合并回 develop**。发现前端 bug 走 Notion Bugs DB 提单给前端工程师实现，测试分支的实现仅供本地验证。

### 本手册相关的脚本清单

| 脚本 | 用途 |
|---|---|
| `tenderly/createTop20Markets.ts` | 建市场 + 复制 ETH 基线参数 + 覆盖资产专属参数 + 接 oracle。含 preflight 索引断言、修复模式、MARKET_LIST 读重试 |
| `tenderly/verifyTop20Markets.ts` | 链上逐项核对（开仓=清算线 / RF / OI 上限 / 手续费 / oracle 接线） |
| `tenderly/grantMarketKeeperRole.ts` | DataStore 角色授权（`ROLE_NAME=` 指定，幂等） |
| `tenderly/refreshMockPrices.ts` | 刷 mock 资产价格（目前仅 MSOL），`WATCH=true` 可常驻 |
| `tenderly/refreshTop20RecordedPrices.ts` | 给新市场推首次 recorded price（自读部署私钥 + 强制 testnet feed 表/凭证） |
| `tenderly/alignMinCollateralFactor.ts` | 开仓 minCF 对齐清算因子 |
| `tenderly/switchTop20ToRealOracle.ts` | 把 oracle provider 从 mock 切到真实 Data Stream |
| `tenderly/setupRealChainTestAccounts.ts` | 真链测试环境 bootstrap：给测试钱包 mint mock USDC + 给 keeper 授全部角色（幂等，`DRY_RUN=1` 只报告） |
| `lpVaultDeposit.ts` | 给 LPVault 加流动性 |

---

## 一、为什么需要这份手册

新增一个 market 不是"链上 createMarket 就完事"。实测下来，一个市场要真正能在前端交易，需要打通 **4 个相互独立的层**（③ 内部又有 7 处独立的配置），每一层都有自己的硬编码白名单/配置，漏任何一个都会以完全不同的症状表现出来：

| 层 | 漏了会怎样 | 位置 |
|---|---|---|
| ① 链上市场 + 参数 | 市场不存在 | DataStore |
| ② 链上 Oracle 接线 | 下单执行 revert `EmptyPrimaryPrice` / `EmptyDataStreamFeedId` | DataStore |
| ③ 前端配置（7处） | 市场选择器看不到 / 价格显示 `$N/A` / Available Liquidity=0 / "Market Unavailable" | 前端代码 |
| ④ Keeper 配置 | 订单排队但永不执行 | keeper env |

2026-07-31 这次上线，这 4 层每一层都踩过坑，下面把每层要动的东西列清楚。

---

## 二、① 链上：创建市场 + 参数

**脚本**: `fx100-apps/apps/fx-base-app/scripts/tenderly/createTop20Markets.ts`

```bash
cd apps/fx-base-app/scripts
# 正常创建（不传 ASSETS = 跑脚本 ASSETS 数组全部，按 GMX 成交量排序）
RPC_URL=<fork或真链> SIGNER_PRIVATE_KEY=<部署者key> npx tsx tenderly/createTop20Markets.ts

# 只建部分资产
RPC_URL=… SIGNER_PRIVATE_KEY=… ASSETS=XRP,ARB npx tsx tenderly/createTop20Markets.ts

# 追加到已有市场后面（明确声明下一个索引，绕过 preflight 的默认预期 4）
RPC_URL=… SIGNER_PRIVATE_KEY=… EXPECT_FIRST_MARKET_INDEX=21 ASSETS=… npx tsx …

# 🔧 修复模式：补配一个"半成品"市场（中断留下的），不新建
RPC_URL=… SIGNER_PRIVATE_KEY=… CONFIGURE_MARKET_INDEX=5 CONFIGURE_TOKEN=0x… ASSETS=SOL npx tsx …
```

### 两个防事故机制（2026-08-01 加，均已实战验证）

1. **preflight 索引断言**：跑之前先读链上 `MARKET_LIST`，确认索引连续且下一个 == `EXPECT_FIRST_MARKET_INDEX`（默认 4），否则**在写任何东西之前中止**。老 fork 上那个重复的 SOL market 就是因为没有这道检查——误重跑脚本时它静默追加了一个新市场而不是报错。加上之后立刻拦住了一次同类误操作。
2. **修复模式** `CONFIGURE_MARKET_INDEX` + `CONFIGURE_TOKEN`：一个市场要写 ~45 笔交易，中途被打断会留下"有市场、有 token，但参数大半是 0、oracle 全空"的半成品。此模式跳过部署和 createMarket，只对指定的已存在 market 补配参数（全部是幂等的 setUint/setAddress，重复应用无害），**不用禁用重建、不产生索引空洞**。

脚本对每个资产做 5 件事：

1. 部署 `MockToken`（18 位小数）；`MockChainlinkOracle` **仅在该资产没有真实 Data Stream 时才部署**（走真实流的资产不需要，部署了也永远不会被读取）
2. `MarketFactory.createMarket(token)` → 返回新 market index
3. **把 ETH（market 2）的全部 ~37 个 market 级参数逐项复制过来**作为基线
4. 覆盖资产专属参数（见下表）
5. 接 oracle（见 §三）

### 资产专属参数（其余全部继承 ETH）

| 参数 | 取值规则 | 说明 |
|---|---|---|
| `minCollateralFactor`(开仓) | **= 清算线** | 项目约定：开仓线与清算线统一，消除"最大杠杆 vs 清算线"之间的危险区，让目标杠杆能顺滑开到底 |
| `minCollateralFactorForLiquidation` | `(1/MaxLev) / 2` | MaxLev 取 GMX 前端杠杆 |
| `reserveFactor` | 0.3（BTC 0.4） | 多空合计名义 OI 上限 = factor × poolUsd |
| `maxOpenInterest`(多/空) | GMX 链上 maxOI × k=0.30 | k 是占位系数，待 LP 规模确定后重算 |
| `maxOpenInterestFactor`(多/空) | **= reserveFactor** | ⚠️ 与 reserveFactor 是**完全独立的 key**，必须同时设，否则较小的那个成为实际瓶颈 |
| `maxPositionSizeUsd` | globalCap × 0.2 | 单仓上限 |
| `positionFeeFactor`(双向) | 0.0002 (0.02%) | 开/平仓共用同一 factor |
| `minPnlFactorAfterAdl`(双向) | 0.77 |  |

**B 类参数（资金费/价差/价格冲击/订单簿深度/skew）全部照抄 ETH**，不反映各资产真实流动性差异——这是明确的已知简化，等风控量化模型出来后需逐资产重算。

---

## 三、② 链上：Oracle 接线（最容易漏）

有两条路径，**取决于该资产是否有可用的真实 Chainlink 测试网价格流**。

### 路径 A：真实 Chainlink Data Stream（首选，与 BTC/ETH 完全一致）

需要设 5 个 key：

| Key | 值 |
|---|---|
| `oracleProviderForToken[Oracle][token]` | `ChainlinkOracleDataStreamProvider` 地址 |
| `priceFeed[token]` | **`0x0`**（Data Stream 路径不用这个 key，BTC/ETH 也是 0） |
| `dataStreamId[token]` | 该资产的 **testnet** Stream ID |
| `dataStreamMultiplier[token]` | `1e24`（18 位小数 token：`10^(60-18-18)`） |
| `dataStreamSpreadReductionFactor[token]` | `1e30`（100%，bid/ask 收敛到中点） |

> ⚠️ **`oracleProviderForToken` 必须用 2 参版本** `oracleProviderForTokenKey(oracleAddress, token)`。合约 `Oracle.sol` 读的是 `[Oracle合约地址][token]` 两层键；只设 1 参版本会让合约读到 0 → `InvalidOracleProviderForToken`。这个坑 2026-06-24 踩过一次。
>
> ⚠️ **只设 `oracleProviderForToken` 不设 `dataStreamId` 会 revert `EmptyDataStreamFeedId`**。这两个是不同的 key 命名空间（一个按 [oracle,token]，一个按 [token]），很容易只改一个。2026-07-31 踩过。

### 路径 B：Mock Oracle（仅当没有真实测试网价格流）

| Key | 值 |
|---|---|
| `priceFeed[token]` | 部署的 `MockChainlinkOracle` 地址 |
| `priceFeedMultiplier[token]` | `1e24` |
| `priceFeedHeartbeatDuration[token]` | `31536000`（1年，宽松） |
| `oracleProviderForToken[Oracle][token]` | `ChainlinkPriceFeedProvider` 地址 |

Mock 价格需要有人定期刷，否则冻结不动：`scripts/tenderly/refreshMockPrices.ts`（支持 `WATCH=true` 常驻每60秒刷一次）。

### 🔴 选 Stream ID 时必须先验证

**Chainlink 测试网列表里存在同名的非价格流。** SOL/USD 在测试网有**两行**：

| ID 前缀 | Schema | 内容 |
|---|---|---|
| `0x0005…` | v5（利率类） | `rate` / `timestamp` / `duration` — **不是价格** |
| `0x0003…` | v3（Crypto Advanced） | `price` / `bid` / `ask` — 正确 |

两行在页面上都叫 "SOL/USD"、都标 Crypto，极易抄错。按 v3 解码 v5 报告**不会报错**，但会把周期时间戳当成 bid，算出 ≈$0 的价格并被写上链。

**上线前强制检查**：拉一份报告解码，确认 `price / bid / ask` 三者同量级（`|bid-price|/price < 5%`）。judgement 标准和现成检查代码见 `createTop20Markets.ts` 的 `AssetDef.testnetFeedId` 注释。

### ③ 推送首次 recorded price

新市场刚建好时链上价格缓存是空的，即使 oracle 接线全对，前端 `Available Liquidity` 仍会是 0（因为 `poolUsd` 用 0 价格算出来是 0）。需要推一次：

```plain text
AdlHandler.refreshLatestRecordedPrices({ tokens: [indexToken, USDC], providers: [...], data: [报告...] })
```

v0.3.1 起这个函数是 permissionless 的（不需要 ADL_KEEPER 角色），任何地址都能调。

---

## 四、③ 前端：7 处配置（缺一不可）

| # | 文件 | 改什么 | 漏了的症状 |
|---|---|---|---|
| 1 | `packages/sdk/src/configs/tokens.ts` | 在 `[BASE_SEPOLIA]` **和** `[BASE_SEPOLIA_FORK]` 两个数组各加 token 定义（symbol/address/decimals=18） | SDK `getMarkets()` 静默跳过该市场（`getToken()` 抛错被 catch 吞掉） |
| 2 | `packages/sdk/src/configs/markets.ts` + `apps/fx-base-app/src/config/markets.ts` | 两份 `RAW_MARKETS` 都加 `{marketIndex, vault, indexToken, collateralToken}`（两个 chain 各一份，共 4 处） | 市场完全不存在于前端/keeper 的市场表 |
| 3 | `apps/fx-base-app/src/constants/markets.ts` | `MARKET_PAIRS` 加条目（含 `marketIndices[BASE_SEPOLIA]`）+ symbol 加进 `DISPLAY_DEV_MARKETS` | **市场选择器看不到**（这是真正的展示白名单） |
| 4 | `apps/fx-base-app/src/app/api/tokens/route.ts` | `defaultSymbols` 数组加 symbol | 最底层。`sdk.oracle.getTokens()` 不传 symbols 参数，只返回这个数组里的；卡住后面一切（Oracle Price/Available Liq 全 `-`） |
| 5 | `apps/fx-base-app/src/config/addresses.ts` 的 `baseSepoliaTokenAddresses` | 加 `SYMBOL: '0x…'` | **keeper / scripts 侧**的 token→symbol 解析用这张表（`scripts/libs/chainlink.ts` 的 `getTokenSymbolByAddress`），不是 SDK 的 tokens.ts。漏了报 `No token found for address 0x…` → 拉不到该 token 的 oracle 报告 → `EmptyPrimaryPrice` |
| 6 | `apps/fx-base-app/src/config/tokens.ts` 的 `baseSepoliaTokens` | 加 token 定义（address/decimals/symbol/name/abi） | **app 侧**独立的 token 表（与 packages/sdk 的 TOKENS 是两份！），`getTokenBySymbol`/`getTokenByAddress` 用它。`/api/prices/tickers` 靠它把 feed 映射到 token —— 漏了该资产**价格直接不显示** |
| 7 | `apps/fx-base-app/src/config/feedIds.ts` | 真实 Data Stream：**内联 `chainlinkFeedIds` 的 mainnet 分支**（`getSupportedFeeds()` 读这个）+ `chainlinkTestnetFeedIds`（fallback 用）+ 文件底部 `chainlinkMainnetFeedIds`。<br>Mock 资产：`mockOracleTokens.ts` | 🔴 **最容易加错位置**：`chainlinkFeedIds`（内联）和 `chainlinkMainnetFeedIds`（底部独立导出）名字极像，但 `/api/prices/tickers` 决定"要拉哪些 feed"只读**内联那个**。只加到底部 → 整批资产无价格 |

> 🔴 **`mockOracleTokens.ts` 不能为空**：删掉最后一个条目会连锁导致 —— ticker 不返回该资产价格 → SDK 把它从 `tokensData` 丢掉 → 该 market 从 `/api/markets/info` **整个消失**。2026-08-01 一个删 XMR 的正则误删了 MSOL，market 3 就这样凭空不见了。

> 🔴 **地址一律用 viem `getAddress()` 生成，不要手敲大小写。** EIP-55 校验和错了 TS 类型检查发现不了（就是个字符串），但 viem 运行时会直接 `InvalidAddressError` 拒绝。2026-07-31 手工转写 8 个地址**全部算错**。批量校验方法：
> ```ts
> import { getAddress } from 'viem';
> getAddress('0x…');  // 抛错就是校验和不对
> ```

### ⚠️ 改完 `packages/sdk` 必须重新 build

```bash
yarn workspace @fx-io/sdk build
```

`yarn dev` **不会**自动重建 workspace 包，Next.js 引的是 `build/cjs` 产物。2026-07-31 因为这个卡了很久：源码改了、类型检查全过、但前端读的还是一周前的编译产物，表现为"市场列表有了但 Oracle Price 和 Available Liquidity 全是 `-`"。

其余前端改动（app 自己的文件）`yarn dev` 会热更新，不用重启。

### ⚠️ 杠杆上限：合约层与产品层是两套（新增市场必须同时想到）

因为各市场 `minCollateralFactor` 现在**等于清算因子**（为了让目标杠杆能顺滑开到底、消除危险区），合约层能接受的杠杆远高于产品想给的：

| 资产 | 链上 minCF | 链上理论上限 | 产品展示 |
|---|---|---|---|
| BTC | 0.4% | 250x | 100x |
| HYPE | 1% | 100x | 50x |
| LIT | 1.11% | 90x | 45x |

- **产品层封顶**在 `constants/markets.ts` 的 `MARKET_PAIRS[].maxLeverage`（前端硬编码，不读链）。
- **2026-08-01 发现 bug（Notion OC-17，High）**：滑杆上限原本是 `min(链上安全杠杆, 硬编码 100)`，**完全没读** `MARKET_PAIRS[].maxLeverage` —— 展示 50x 的市场能拉到 100x。BTC/ETH 恰好正确纯属巧合（展示值就是 100）。修法：`maxAllowedLeverage = min(链上安全杠杆, MARKET_PAIRS[当前市场].maxLeverage)`，涉及 `OrderForm.tsx` 与 `PositionLeverageDialog.tsx`（调整杠杆弹窗同病）。
- ⚠️ 这只封 UI。**合约层依然接受更高杠杆**，绕过前端直接调合约仍可开到链上上限。若产品要求硬约束，需在合约层加 per-market 的杠杆 key（待产品确认口径）。
- 新增市场时若忘了填 `maxLeverage`，会回落到 100x 硬顶。

### 前端 ticker 的 mainnet/testnet 双轨

`/api/prices/tickers` 用 **mainnet** Chainlink 凭据取展示价（所以 BTC/ETH 显示真实市价），但新资产在 mainnet 订阅里往往**没有授权**（`401 feeds not authorized`）。已加 testnet fallback：mainnet 拉失败时自动用 `CHAINLINK_TESTNET_*` 凭据 + testnet feed ID 重试（`route.ts` 的 `fetchLatestChainlinkReportWithTestnetFallback`）。

实测 BTC 的 testnet 与 mainnet 报价相差仅 0.01%，所以 fallback 用于展示是安全的。

---

## 五、④ Keeper 配置

| 变量 | 说明 |
|---|---|
| `KEEPER_PRICE_FEED_TOKENS` | **只放 mock 资产**的 token 地址（逗号分隔，小写）。列在这里的资产，keeper 会跳过 Chainlink、传 `ChainlinkPriceFeedProvider` + 空 `0x` data |
| `KEEPER_PRICE_FEED_PROVIDER_ADDRESS` | `ChainlinkPriceFeedProvider` 地址 |

### 🔴 两个 `.env` 是两份独立文件，改错一个 = 看起来改了其实没生效

| 文件 | 谁读它 | 关键变量名 |
|---|---|---|
| `apps/fx-base-app/.env` | **Next 前端** | `NEXT_PUBLIC_BASE_SEPOLIA_FORK_RPC_URL` / `..._WSS_URL` |
| `apps/fx-base-app/scripts/.env` | **keeper 进程**（eventPublisher / eventWorker / adlWorker …） | `KEEPER_RPC_URL`、`ORDER_RPC_URL`、`BASE_SEPOLIA_FORK_RPC_URL`、`KEEPER_CHAIN_ID`、`ORDER_CHAIN_ID` |

**不是软链，是两份独立文件，变量名也不同** —— keeper 走 `KEEPER_HTTP_RPC_URL` → `KEEPER_RPC_URL` → `RPC_URL` 这条回退链，压根不认 `NEXT_PUBLIC_*`。换 fork 时只改前端那份，keeper 会继续连旧 fork。

**判断依据**：看 keeper 启动日志里打印的 `rpcUrl`。如果它还是旧值、或者 `wssUrl: '(unset)'` 而你明明在 `.env` 里设过 WSS —— 那就是它没读你改的那个文件。（2026-08-01 换 fork 时就这样：前端那份改完了，keeper 日志照旧打印上一个 fork 的 id。）

换 fork 的完整替换清单（两个文件里的 fork id 全换）：

```bash
cd apps/fx-base-app
grep -rn "<旧fork-id>" .env scripts/.env       # 先确认有几处
sed -i '' 's/<旧fork-id>/<新fork-id>/g' .env scripts/.env
```

> ⚠️ **走真实 Data Stream 的资产绝不能列进 `KEEPER_PRICE_FEED_TOKENS`**，反之亦然。列错的症状：mock 资产没列 → keeper 拿不到该 token 的价，oracle params 缺项 → `executeOrder` revert `EmptyPrimaryPrice`（`0xcd64a025`）。

**keeper 需要的链上角色**（新部署后会重置，必须重新授权）：

| 角色 | 谁需要 | 备注 |
|---|---|---|
| `ORDER_KEEPER` | eventWorker 执行订单 | **合约实际检查的是这个** |
| `MARKET_KEEPER` | eventWorker/liquidateWorker 的**脚本自检** | 脚本启动时自己查这个角色，与合约要求不一致，两个都要给 |
| `ADL_KEEPER` | adlWorker、推 recorded price | 只跑手动交易可不给 |
| `LIQUIDATION_KEEPER` | liquidateWorker |  |
| `FROZEN_ORDER_KEEPER` | OrderHandler 冻结单重试路径 |  |

工具：`scripts/tenderly/setupRealChainTestAccounts.ts` 一次配齐 5 个角色 + 给测试钱包 mint mock USDC（幂等，`DRY_RUN=1` 只报告）；单个角色用 `scripts/tenderly/grantMarketKeeperRole.ts`（`ROLE_NAME=` 指定）。

> **在真链上配，不要在 fork 上配。** fork 继承真链状态，真链配一次以后每个新 fork 都自带余额和权限；fork 上配的只是那个 fork 的本地状态，换 fork 就得全部重来。反过来 ETH 该在 fork 上用 `tenderly_setBalance` 白拿，别在真链真转。
>
> ⚠️ `grantRole` 回执 success 但紧接着 `hasRole` 读到 false 是真链读滞后，不是失败 —— 隔几秒重读为准，别据此重试。

改完 env / 授权后**必须重启 keeper 进程**才生效。

> ⚠️ 排查 keeper 问题前先 `ps aux | grep eventWorker` 确认没有多个进程。2026-07-31 遇到一个挂了 10 天的旧进程在抢同一个 Redis 队列，用旧配置处理订单后失败丢弃（`MAX_RETRIES=1`，失败即 ack 不回队列），表现为"订单排队后消失但链上没执行"。

---

## 五之二、换新 fork 后要做的 5 件事

fork 从真链切出来，**只继承真链的真实状态**：市场、参数、LP 池、mock USDC 余额、链上角色都在。不继承的是上一个 fork 的本地状态（作弊码设的 ETH、fork 上刷过的价格），以及**会随时间过期的东西**。

| # | 做什么 | 为什么 | 命令 |
|---|---|---|---|
| 1 | 改**两个** `.env` 的 fork id | 见上方 🔴 —— 只改一个 keeper 会继续连旧 fork | `sed -i '' 's/<旧>/<新>/g' .env scripts/.env` |
| 2 | 重启 keeper 进程 | env 不会热加载 | 先 `ps -eo pid,lstart,command \| grep -E "eventWorker\|eventPublisher\|relWorker"` |
| 3 | 补 ETH | 上一个 fork 的作弊码余额不继承 | `cast rpc tenderly_setBalance '["<addr>"]' '"0x8AC7230489E80000"' --rpc-url <fork>` |
| 4 | 推 recorded price | 继承来的价格缓存已过期 → Available Liquidity 读 0 | `RPC_URL=<fork> CHAIN_ID=99917 npx tsx scripts/tenderly/refreshTop20RecordedPrices.ts` |
| 5 | 刷 mock 价格 | MSOL 只在有人调 `setMockPrice` 时才动，继承来的可能已冻结几十小时 | `RPC_URL=<fork> WATCH=true npx tsx scripts/tenderly/refreshMockPrices.ts`（常驻） |

顺手核对一遍继承是否完整（应该全部 ⏭️ 已达标）：

```bash
RPC_URL=<fork> DRY_RUN=1 npx tsx scripts/tenderly/setupRealChainTestAccounts.ts
RPC_URL=<fork> npx tsx scripts/tenderly/verifyTop20Markets.ts   # 20 个 market，❌ 计数应为 0
```

还要顺带看一眼 fork 时钟偏差。偏差大会让 oracle 报价被判过期（`MAX_ORACLE_PRICE_AGE`），Express/gasless 尤其敏感：

```bash
cast block latest --rpc-url <fork> | grep timestamp   # 与 date +%s 对比
```

---

## 六、上线后自检清单

```bash
cd apps/fx-base-app/scripts

# 1. 链上参数逐项核对（开仓=清算线、RF、OI上限、fee、oracle接线）
RPC_URL=<rpc> npx tsx tenderly/verifyTop20Markets.ts

# 2. 前端三个 API 端到端
curl -s "http://localhost:3010/api/tokens?chainId=99917" | jq '.tokens[].symbol'
curl -s "http://localhost:3010/api/prices/tickers?chainId=99917" | jq '.[] | {tokenSymbol, minPrice}'
curl -s "http://localhost:3010/api/markets/info?chainId=99917" | jq '.marketsInfoData | keys'
```

逐项确认：

- [ ] `verifyTop20Markets` 每个市场 `open == liq` ✅、oracle provider 正确
- [ ] `/api/tokens` 返回所有新 symbol（**不传 symbols 参数**测，这才是 SDK 实际调用方式）
- [ ] `/api/prices/tickers` 每个资产价格合理、**无重复条目**、mock 资产不是死值
- [ ] `/api/markets/info` 的 `marketsInfoData` 包含全部 market index，`availableLongUsd` 非 0 且约等于配置的 maxOpenInterest
- [ ] 前端市场选择器能看到、能开仓、keeper 能执行（真实下一单）

---

## 七、真链部署差异

fork 上验证通过后部署真链，**同一套脚本，只换 `RPC_URL`**。2026-08-01 真链实跑（17 个市场、约 700 笔 tx）确认的差异点：

1. **RPC 读写延迟（真链会咬人，fork 不会）**：`createMarket` 回执 `status 1` 之后立刻读 `MARKET_LIST` 仍可能是旧长度。第一次真链跑就因此中断，留下一个"已建但没配参数"的半成品市场。脚本已加 `readMarketListWithRetry()`（轮询到长度达标才继续）+ `sendIdempotent()`（对 DataStore 幂等写做 3s×i 退避重试）。**`createMarket` 与合约部署故意不重试** —— 它们非幂等，重试会多建一个市场。
- 真的出现半成品市场时用修复模式补配，不要重建：`CONFIGURE_MARKET_INDEX=<idx> CONFIGURE_TOKEN=<token> npx tsx tenderly/createTop20Markets.ts`
1. **`preflight()` 索引断言**：真链上一定要带 `EXPECT_FIRST_MARKET_INDEX=`。它同时校验 `MARKET_LIST` 连续（无禁用空洞）和下一个索引符合预期 —— 本次就靠它挡下了一次误重跑。
2. **没有作弊码**：`tenderly_setBalance` / `tenderly_setErc20Balance` / 冒充任意地址在真链不可用。给测试账户充值要用真实转账；mock USDC 可 mint（`MockToken.mint` 在 v0.3.1 加了 `onlyOwner`，owner = 部署者）。
3. **Mock 价格要有人持续刷**：真链上 mock oracle 同样会冻结，且没有 fork 的时钟便利。
4. **`CHAINLINK_PAYMENT_TOKEN`**（全局键，非按资产）：必须设为链上真实 LINK 地址（Base Sepolia = `0xE4aB69C077896252FAFBD49EFD26B5D171A32410`），否则 Chainlink Verifier 收验证费那步会失败。v0.3.1 部署时已配好，新部署要确认。
5. **角色授权**：部署者 key 在 DataStore 上持有 `DEFAULT_ADMIN_ROLE`，可自行授权 keeper 所需角色。keeper 需要 5 个：`MARKET_KEEPER`（eventWorker 自检硬性要求）、`ORDER_KEEPER`（**合约 executeOrder 检的是这个，不是 MARKET_KEEPER**）、`ADL_KEEPER`、`LIQUIDATION_KEEPER`、`FROZEN_ORDER_KEEPER`。用 `setupRealChainTestAccounts.ts` 一次配齐。
- ⚠️ **写完立刻复核会读到 ❌**：同一个 RPC 读滞后，`grantRole` 回执 success 但紧接着 `hasRole` 返回 false。别据此重试，隔几秒重读即为准（实测 FROZEN_ORDER_KEEPER 就这样虚假报错一次）。
- **测试环境 bootstrap 放真链做，不要放 fork 做**：fork 继承真链状态，真链配一次以后每个新 fork 都自带余额和权限；fork 上配的属于该 fork 的本地状态，换 fork 就没了。反过来 ETH 应该在 fork 上用 `tenderly_setBalance` 白拿，别在真链真转。
1. **运维脚本的 feed 表是 import 时决定的**：`@/config/feedIds` 在模块加载时按 `CHAINLINK_NETWORK` 二选一，而 `.env` 里配的是 `mainnet`（前端展示需要）。链上 `dataStreamId` 是 **testnet** ID，所以运维脚本直接跑会 401 报 `no prices returned from Chainlink API`。必须在 import 之前改写环境变量（`refreshTop20RecordedPrices.ts` 就是这么做的），改在 import 之后无效。
2. **Gas 预估**：17 个市场约 700 笔 tx，Base Sepolia 在 0.006 gwei 下总共花费远小于 0.01 ETH；部署者留 0.05 ETH 以上即够。
3. **建议流程**：真链部署完成后**基于真链重新 fork 一次**再做前端/端到端测试。此时真链与新 fork 的地址完全一致，前端 `[BASE_SEPOLIA]` 与 `[BASE_SEPOLIA_FORK]` 两个块可以填同一张表，省掉一整轮地址同步和随之而来的错配风险。

---

## 八、已知遗留项

| 项 | 状态 |
|---|---|
| B 类参数（资金费/价差/深度/冲击）全部照抄 ETH | 等风控量化模型，逐资产重算 |
| `GlobalCapUSD` 的 k=0.30 是占位系数 | 待 LP 规模（LP_NAV）确定后全表重算 |
| LIT / ZEC 的 OI 上限是占位值 | 两者在 GMX Arbitrum 无对应市场，无链上参考，待风控单独定 |
| Pyth 2% 交叉校验未接入 | Pyth Feed ID 已在 `markets-top20.draft.json`，但链上/keeper 侧未接线。**注意**：未配 `pythPriceFeedKey` 的 token 完全没有偏差校验（keeper 可提交任意签名价格），上真链前应评估 |
| Index token 是 Mock ERC20 | 非任何真实资产的桥接映射，合成资产地址方案待定 |
| ~~XMR~~ | **已决定不部署**（2026-07-31）：Chainlink 无 XMR 测试网价格流，只能长期 mock。fork 上 market 12 已禁用并从全部配置移除 |
| MSOL 用 mock | **唯一的 mock 资产**（其余 19 个全部用真实 Chainlink Data Stream）。合成测试资产；测试网其实有真实 `MSOL/USD` DEX 流（`0x0003c683d2…`, Marinade Staked SOL），如需可切换，但会改变现有测试基线。价格需 `refreshMockPrices.ts` 维护 |
| 老 fork（Gordon 20260730）market 12/14 是禁用空洞 | 12=XMR、14=误建的重复 SOL，均 `isMarketDisabled=true`。**真链与新 fork 上不存在**，索引 1→20 连续 |
| 真链前端 UI 未端到端实测 | 计划基于真链重新 fork 后在 fork 上跑（地址一致，配置无需再改）。链上层与配置层均已核对通过 |

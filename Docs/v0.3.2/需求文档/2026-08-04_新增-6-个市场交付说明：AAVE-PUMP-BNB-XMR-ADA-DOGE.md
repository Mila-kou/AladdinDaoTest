# 🚀 新增 6 个市场交付说明：AAVE / PUMP / BNB / XMR / ADA / DOGE

> Notion 页面：[原文](https://app.notion.com/p/3b13d7873f2c811fbb65c17c6a1c0b93)
> 作者：fx100-sync（Gordon 的 fx100-contracts 仓库文档同步机器人，内容出自 Gordon）
> 创建时间：2026-08-04
> 最后编辑：2026-08-03
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 产品 / FX100 / 技术相关 / 合约 / 🚀 上线与部署
> 类型：设计文档

**日期**: 2026-08-04
**状态**: 6 个市场**已在真 Base Sepolia（chain 84532）部署并核对通过** —— market **21~26** 连续无空洞，全场 26 个市场逐项核对 `❌ 计数 = 0`
**用途**: 请按本文把这 6 个资产纳入你们侧的市场配置/部署脚本。参数、oracle ID、链上实际写入值都已核实，可直接取用。
**完整分析与部署记录**: [2026-08-03-batch2-markets-6-assets.md](2026-08-03-batch2-markets-6-assets.md)
**参数文件（机器可读）**: [`scripts/parameters/markets-batch2.draft.json`](../../../scripts/parameters/markets-batch2.draft.json)
**上线操作手册**: [2026-07-31-market-onboarding-playbook.md](2026-07-31-market-onboarding-playbook.md)

---

## 〇、先说一件必须知道的事（会影响你们所有配置脚本）

`src/constants/FX100Keys.sol` 里 **243 个常量用 `keccak256(abi.encode("NAME"))`，只有下面 4 个用裸 `keccak256("NAME")`**：

| 行 | 常量 |
|---|---|
| 7 | `LIQUIDATION_GRACE_PERIOD_BASE` |
| 10 | `LIQUIDATION_GRACE_PERIOD_TIER_MULTIPLIER` |
| 12 | `EXECUTION_FEE_SUBSIDIZE` |
| 13 | `EXECUTION_FEE_SUBSIDIZE_SIZE` |

任何按"统一 `abi.encode`"推导键的工具，写这 4 个键时都会**写进合约永远不读的槽位**：不报错、不 revert，写入变 no-op、读出恒为 0。

**这已经造成了一个真实缺陷**：market 3~20（18 个市场）的 `liquidationGracePeriodBase` 本应照抄 ETH 的 900 秒，实际是 0 —— 也就是**开仓即可被清算、完全没有清算保护期**（`LiquidationUtils.sol:44` 配合 `IncreaseOrderUtils.sol:52-55`）。BTC/ETH 有 900 秒。我们已在 2026-08-03 用 18 笔 `setUint` 补齐，现在**全场 26 个市场统一 900 秒**。

**给你们的建议（重要）**：

1. **工具侧统一按合约实际写法推导**，即这 4 个键用 `keccak256(toHex("NAME"))`。我们已在 `fx100-apps/apps/fx-base-app/scripts/libs/keys.ts` 这样修好。
2. **不建议直接改合约把这 4 个改成 `abi.encode`** —— 那会让链上已写入的值瞬间读不到（清算保护期和执行费豁免会静默变回 0）。若确实要统一写法，必须**同一笔升级里把链上值迁移到新键**，并且改完立即复核这 4 项。
3. 部署/核对脚本要能读出**与合约一致**的键，否则"参数核对全部通过"是自证清白 —— 上一批 20/20 通过对这 4 个键完全是盲的。

---

## 一、6 个资产的参数（逐资产不同的只有这 4 项）

取值规则与 market 4~20 完全一致：

```plain text
MaxLev                        = GMX 前端杠杆
minCollateralFactor(开仓)     = minCollateralFactorForLiquidation = (1/MaxLev)/2   ← 开仓线与清算线统一
maxOpenInterest(多/空各)       = GMX Arbitrum 链上 maxOI × k=0.30
maxPositionSizeUsd            = maxOpenInterest × 0.2
reserveFactor = maxOpenInterestFactor = 0.3
positionFeeFactor(双向)        = 0.02%
minPnlFactorAfterAdl(双向)     = 0.77
executionFeeSubsidize / _SIZE  = 0（两个键都显式写 = 全场免执行费）
```

| market | 资产 | MaxLev | 开仓=清算线 | maxOpenInterest（多/空各） | maxPositionSizeUsd | maxOI 依据 |
|---|---|---|---|---|---|---|
| 21 | AAVE | 50x | 1.0000% | $411,300 | $82,260 | GMX Arbitrum 链上 $1,371,000 × 0.30 |
| 22 | PUMP | 50x | 1.0000% | $300,000 | $60,000 | ⚠️ 风控占位 |
| 23 | BNB | 100x | 0.5000% | $840,900 | $168,180 | GMX Arbitrum 链上 $2,803,000 × 0.30 |
| 24 | XMR | 50x | 1.0000% | $500,000 | $100,000 | ⚠️ 风控占位 |
| 25 | ADA | 50x | 1.0000% | $500,000 | $100,000 | ⚠️ 风控占位 |
| 26 | DOGE | 100x | 0.5000% | $500,000 | $100,000 | ⚠️ 风控占位 |

**⚠️ 占位值说明**：ADA / DOGE / XMR / PUMP 在 GMX Arbitrum **没有市场**（逐个核对了 136 个 market 的 indexToken），所以 `maxOpenInterest` 没有链上参考值，用了风控占位数 —— 与前一批 LIT($300K) / ZEC($500K) 相同处理。`k=0.30` 本身也是占位，等 LP_NAV 定了要全表重算。

**其余参数全部照抄 ETH（market 2）基线**，与前一批 17 个新市场同处理：资金费曲线、`ConstantSpread`、订单簿深度、`PriceImpactParameter`、skew 等 22 项。这批和现有市场一样**不反映各自真实流动性差异**，等风控量化模型统一重算。

**⚠️ 有一项不能照抄 ETH**：`executionFeeSubsidize`。ETH 和 BTC 是 **20 USD 阈值**（刻意保留，用来测"收费"分支），其余 24 个市场都是 0（全免）。新市场必须**显式写 0**，否则从 ETH 复制会把 20 USD 阈值带过去。语义是 `MAX = 关闭豁免`，其它值 = `size >= 阈值即免`，所以 **0 = 恒真 = 全免**；而配置脚本缺省回退是 0，**漏写某个键会静默变成全免**，两个键都要写。

---

## 二、Oracle 配置

6 个资产**全部走真实 Chainlink Data Stream**（与 BTC/ETH 同一个 `ChainlinkOracleDataStreamProvider`），无 mock。链上生效的是 testnet Stream ID。

| 资产 | **testnet** Stream ID（链上写这个） | mainnet Stream ID（前端行情用） |
|---|---|---|
| AAVE | `0x0003c8e550d2fc5304993010112de9b69798297e4cc11990ee6250e464daf760` | `0x0003481a2f7fe21c01d427f39035541d2b7a53db9c76234dc36082e6ad6db7f5` |
| PUMP | `0x0003392ea25a7f0f48f255a0086489d950f148a3fd7f58bdd7991e39956b7320` | `0x00032ce910d5ee7e47506b9f0607acdc017fb6cd92ed3696eb3573db6ad41cb9` |
| BNB | `0x000387d7c042a9d5c97c15354b531bd01bf6d3a351e190f2394403cf2f79bde9` | `0x000335fd3f3ffa06cfd9297b97367f77145d7a5f132e84c736cc471dd98621fe` |
| XMR | `0x0003c70558bd921b1559d37b8e347797f121d1240e7386e68b2bee9b731b0833` | `0x00038f3b8f8be4305564abf0ed3c9cc46cb8b4303c35ab54079ea873b7d74b3a` |
| ADA | `0x00033470b2bb164a50c5a6fda879ddabcf8fb91fcfca048ac81a6bd5763fa1e3` | `0x00038580225b924c69e28ea101d4723d90c1b44ab83548a995c3d86ad9e92eb0` |
| DOGE | `0x00032057c7f224d0266b4311a81cdc3e38145e36442713350d3300fb12e85c99` | `0x000356ca64d3b32135e17dc0dc721a645bf50d0303be8ceb2cdca0a50bab8fdc` |

配套的 Pyth Feed ID 与 Base 主网备份 feed 地址见 [完整文档 §三](2026-08-03-batch2-markets-6-assets.md)。**Base Sepolia 上这 6 个都没有 push feed**（测试网只有 BTC/ETH/LINK），所以备份 oracle 这一层是空的，与现有 17 个新市场同状态；Pyth 2% 交叉校验也仍未接线（全场都没接）。

### 🔴 XMR 的旧结论要更正

之前文档写着"Chainlink 无 XMR 测试网价格流，只能长期 mock，不部署"。**这条已经过期** —— XMR 有可用的 testnet 价格流（上表），实测报价 $363.5 对 Hyperliquid $363.4，差 20bp。本批已正常部署，走真实 Data Stream。

### Stream ID 是怎么确认的（不是人工抄的）

Chainlink 不公开"符号 → 测试网 stream ID"对照表，`/api/v1/feeds` 只返回 ID 不返回名字。以前这些 ID 靠人工从文档抄，那正是 SOL 曾把**资金费率流**（`0x0005…` 前缀）当成价格流的根因 —— 按 v3 解码不报错，但会把周期时间戳当 bid，算出 ≈$0。

本批改成程序识别：枚举凭证可见的全部 638 条测试网 feed → 取 241 条 v3 crypto 价格流 → 每条拉 live report 解码 price/bid/ask → 用 Hyperliquid 实时价反查符号 → **两边每 40 秒同步重采样 7 次**，把当前价位撞车的资产分开（ADA↔EIGEN、DOGE↔HBAR、PEPE↔BONK）。判定门槛：全部采样点偏差 < 50bp 且次优候选至少差 3 倍。6 个全部 `confirmed`。

其中 **BNB 和 DOGE 的 testnet ID 另有独立印证**：与 `gmx-io/gmx-synthetics` 的 `config/tokens.ts`（`avalancheFuji` 段）逐字节相同。

脚本：`fx100-apps/apps/fx-base-app/scripts/oracle/resolveStreamIds.mjs`

```shell
npx tsx scripts/oracle/resolveStreamIds.mjs AAVE,PUMP,BNB,XMR,ADA,DOGE
# 难分的多采几次：SAMPLES=12 SAMPLE_GAP=120 …
# 输出 stream-ids.json；任何 INCONCLUSIVE 的资产退出码 2，别往链上写
```

仍然**不能替代**上线手册里的检查：任何 ID 写链前要确认 report 解码出的 price/bid/ask 三者同量级。

---

## 三、链上部署产物（真 Base Sepolia，2026-08-03）

**DataStore** `0x606D72Ab0C0fDcce607d04B1645CE2D528B88014` ｜ **MarketFactory** `0xA6B8C3a1d74EF60E48b77624A409e35d1De898e5`

| market | 资产 | index token（Mock ERC20, 18 位精度） |
|---|---|---|
| 21 | AAVE | `0xe706a715B9f5Fc09e98A16B19E2B7C1a64B3A928` |
| 22 | PUMP | `0xf0eBba81277bC0565E7aceBBc03a988C5AAa7778` |
| 23 | BNB | `0x541373871Af70C0923DE66dAdd911d360F04B6F6` |
| 24 | XMR | `0x4cb6c8ABD0c5c0fe98950C3e4CE4d5fEda8b5db4` |
| 25 | ADA | `0xBA98a71b71aa19e33eCc30Fe4BFDC992017de793` |
| 26 | DOGE | `0x24bE345B59f9594b038E2e4E966Ce97b32BE1965` |

- 全部地址由 viem `getAddress()` 生成（禁止手敲；EIP-55 校验和错了 TS 检查发现不了，viem 运行时会直接拒绝）
- Index token 仍是 Mock ERC20，非任何真实资产的桥接映射 —— 合成资产地址方案待定，与现有市场同状态
- 执行结果：**372 笔写入、0 失败**，4 次 RPC 抖动被幂等重试吃掉；`createMarket` 与合约部署（非幂等、故意不重试）全部一次成功
- recorded price 首推成功：23 个 token，tx `0x25361d9baaaa360b38c81e0bf360086c422faa99ff91fbb506a6a29045f8ee65`

### 核对命令与结果

```shell
cd fx100-apps/apps/fx-base-app
RPC_URL=<base-sepolia-rpc> npx tsx scripts/tenderly/verifyTop20Markets.ts
# markets on chain: 26 / ❌ 计数 = 0
```

- ✅ `open == liq` **26/26** 成立
- ✅ 6 个新市场参数与本文 §一逐项一致
- ✅ `graceBase = 900s` 全场 **26/26**（新 6 个抄自 ETH；存量 18 个已补齐）
- ✅ `execFeeSubsidize`：新 6 个 = 0（两个键都写），BTC/ETH 保持 20 USD
- ✅ oracle：25 个真实 Data Stream + 1 个 mock（MSOL market 3），新 6 个 `priceFeed = 0x0`

---

## 四、需要你们/风控确认的 4 件事

| # | 事项 | 说明 |
|---|---|---|
| 1 | **杠杆分层** | 本批 `MaxLev` 沿用旧规则抄 GMX 前端（50x/100x），而 Hyperliquid 对这 6 个只给 5~10x。因为 `minCollateralFactor = 清算线 = (1/MaxLev)/2`，杠杆直接决定风险敞口。按流动性分层的建议表见完整文档 §五 D1（本批 6 个都落 20x / 清算线 2.5%）。**当前按旧规则部署，等风控签字后再统一调整 market 1~26。** |
| 2 | **`liquidationGracePeriodTierMultiplier` tier 1~3 = 0** | 只有 tier 0 = 1e18(1x)。意味着**任何有推荐人（referrerTier ≥ 1）的用户，即使在 BTC/ETH 上清算保护期也是 0**。这是独立于本批的既有配置缺口，请确认是否有意。 |
| 3 | **maxOpenInterest 占位值** | ADA/DOGE/XMR $500K、PUMP $300K 无链上参考；`k=0.30` 也是占位。待 LP_NAV 确定后全表重算。 |
| 4 | **Pyth 2% 交叉校验未接线** | 全场 26 个市场的 `pythPriceFeedKey` 都没配 —— **未配的 token 完全没有偏差校验，keeper 理论上可提交任意签名价格**。Feed ID 都已备好，上真实资金前应评估。 |

---

## 五、前端 / SDK 侧已完成（不需要你们动）

上线手册列的 7 处配置我们已全部接好并重新 build 了 SDK，`tsc --noEmit` 通过，配置层实测 `getSupportedMarketPairs(84532)` 返回 26 个交易对、6 个新资产的 market index / token 地址 / feedId 全部解析正确。市场分类：AAVE=`defi`、BNB/XMR/ADA=`layer1`、PUMP/DOGE=`meme`。

顺带更正手册一处：第 4 项（`api/tokens/route.ts` 的 `defaultSymbols`）**已不需要手改**，现在是从 `getSupportedMarketPairs()` 派生的。

**唯一遗留**：真链前端 UI 还没做端到端实测 —— 需要基于真链重新 fork 一次再跑（真链与新 fork 地址一致，前端配置不用再改）。

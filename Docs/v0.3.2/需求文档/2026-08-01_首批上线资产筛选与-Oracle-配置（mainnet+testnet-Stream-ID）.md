# 🚀 首批上线资产筛选与 Oracle 配置（mainnet + testnet Stream ID）

> Notion 页面：[原文](https://app.notion.com/p/3ae3d7873f2c81229d0af0b241e22ba1)
> 作者：fx100-sync（Gordon 的 fx100-contracts 仓库文档同步机器人，内容出自 Gordon）
> 创建时间：2026-08-01
> 最后编辑：2026-08-01
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 产品 / FX100 / 技术相关 / 合约 / 🚀 上线与部署
> 类型：设计文档

> 👥 受众：全员　｜　来源：docs/analysis/../superpowers/specs/2026-06-10-market-listing-oracle-config.md

# FX100 首批上线资产 Oracle 配置整理（参考 GMX Top 20）

**日期**: 2026-06-10
**状态**: 第一步完成（资产筛选 + Oracle 信息核实），待续：market 创建参数整理
**前置文档**: [2026-06-09-oracle-system-design.md](2026-06-09-oracle-system-design.md)
**数据来源**: GMX 市场数据快照（2026-06-10 截取）；Chainlink docs/data.chain.link 注册表；Pyth Hermes stable API（全量 3055 feeds）；Chainlink reference-data-directory（Base/Base Sepolia/Arbitrum/Ethereum/Optimism）

---

## 一、资产筛选：GMX 24H 交易量 Top 20

| # | 市场 | 24H 交易量 | 总 OI (多+空) | 资产类别 |
|---|---|---|---|---|
| 1 | BTC/USD 100x | $103.0m | $19.1m | 加密 |
| 2 | WTIOIL/USD 100x | $21.1m | $2.0m | 商品-WTI 原油 |
| 3 | ETH/USD 100x | $18.7m | $10.6m | 加密 |
| 4 | HYPE/USD 50x | $2.7m | $701k | 加密 |
| 5 | SOL/USD 100x | $2.6m | $1.2m | 加密 |
| 6 | WLD/USD 50x | $2.1m | $8.5k | 加密 |
| 7 | ZEC/USD 85x | $2.0m | $204.6k | 加密-隐私币 |
| 8 | VVV/USD 50x | $1.4m | $110.3k | 加密-小币 (Venice) |
| 9 | SILVER/USD 100x | $1.3m | $195.2k | 商品-白银 (XAG) |
| 10 | LINK/USD 100x | $819.5k | $1.4m | 加密 |
| 11 | BRENTOIL/USD 100x | $803.0k | $374.2k | 商品-Brent 原油 |
| 12 | GOLD/USD 100x | $439.6k | $213.5k | 商品-黄金 (XAU) |
| 13 | SUI/USD 50x | $288.2k | $603.3k | 加密 |
| 14 | XMR/USD 50x | $266.5k | $199.9k | 加密-隐私币 |
| 15 | SPCX/USD 10x | $227.7k | $80.0k | 股权-SpaceX Pre-IPO |
| 16 | AERO/USD 50x | $214.9k | $29.4k | 加密 |
| 17 | NEAR/USD 50x | $214.3k | $23.8k | 加密 |
| 18 | XLM/USD 50x | $199.8k | $46.6k | 加密 |
| 19 | ENA/USD 50x | $180.2k | $8.6k | 加密 |
| 20 | TIA/USD 50x | $174.2k | $71.9k | 加密 |

候补（前 20 有资产被排除时顶上）：ONDO ($165.4k)、**XRP ($164.3k，OI $2.2m 全场第 4)**、ARB、LIT、TON。

---

## 二、三层 Oracle 配置总表

FX100 oracle 三层架构（见前置文档 §1.1）：

1. **主 oracle**: `ChainlinkDataStreamProvider`（Data Streams 签名报价，需 stream ID）
2. **备份主 oracle**: `ChainlinkPriceFeedProvider`（链上聚合器，需 Base 主网 proxy 地址）
3. **参考校验**: `PythPriceFeedProvider` / `PythPriceFeedUtils`（2% 偏差校验，需 Pyth feed ID，全链通用）

### 2.1 Chainlink Data Streams（主 oracle）

均为 mainnet 生产 stream ID。Crypto 为 v3 schema（`0x0003...`，CexPrice，24/7）；XAU/XAG 为 RWA v8 schema（`0x0008...`，ForexPrice，外汇时段 ~24/5，报告含 `marketStatus` 字段）。

| 资产 | mainnet Stream ID | Stream URL | 类型/时段 | test Stream ID |
|---|---|---|---|---|
| BTC | `0x00039d9e45394f473ab1f050a1b963e6b05351e52d71e507509ada0c95ed75b8` | [btc-usd-cexprice-streams](https://data.chain.link/streams/btc-usd-cexprice-streams) | Crypto v3, 24/7 | `0x00037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b439` |
| ETH | `0x000362205e10b3a147d02792eccee483dca6c7b44ecce7012cb8c6e0b68b3ae9` | [eth-usd-cexprice-streams](https://data.chain.link/streams/eth-usd-cexprice-streams) | Crypto v3, 24/7 | `0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782` |
| SOL | `0x0003b778d3f6b2ac4991302b89cb313f99a42467d6c9c5f96f57c29c0d2bc24f` | [sol-usd-cexprice-streams](https://data.chain.link/streams/sol-usd-cexprice-streams) | Crypto v3, 24/7 | ⚠️ `0x00057dc396a9167f0238de1759067e3d2711380a07db76528842e82863bcf44a` **不是价格流（见下方注）** |
| LINK | `0x00036d7a1251e3f67d6658466b5e9e7fe8418af7feac9567ff322bff95cc2401` | [link-usd-cexprice-streams](https://data.chain.link/streams/link-usd-cexprice-streams) | Crypto v3, 24/7 | `0x00036fe43f87884450b4c7e093cd5ed99cac6640d8c2000e6afc02c8838d0265` |
| SUI | `0x000348ce31679e9ce1f80ec929f1d7c86499569d67f1cea80a90d6e5e3c127a7` | [sui-usd-cexprice-streams](https://data.chain.link/streams/sui-usd-cexprice-streams) | Crypto v3, 24/7 | `0x00034881db604b551ff226aa414ba73dd5b2be0a06834124dafa9bf66871ce89` |
| NEAR | `0x00036e9386eda6b177c6f7e9d493e60ae9ebaeb732a271b880b4d6a131d6b3f5` | [near-usd](https://data.chain.link/streams/near-usd) | Crypto v3, 24/7 | `0x0003d64b0bdb0046a65e4ebb0a9866215044634524673c65bff4096a197fcff5` |
| XLM | `0x000358cb12b1f5bbeca8b5b4666025a40b15520af1f82516ee2fb9a335055e9a` | [xlm-usd](https://data.chain.link/streams/xlm-usd) | Crypto v3, 24/7 | `0x00037dfe3b67b7552cf15e10ee5fb0c0ab6d658b20eb558effe2ae4579d24c58` |
| TIA | `0x00034a6c27424c06b3441b8714c9b11bb4e7dc38548a525cee36ee232ffea013` | [tia-usd](https://data.chain.link/streams/tia-usd) | Crypto v3, 24/7 | `0x00036173437e26ef8dc971c19070b2c05f6575bdb484c2c45e06e99fec290bd2` |
| ENA | `0x00033e05a40dd8c25ffa1b88a35234845c067635f7ddf5edde701f859f8894c1` | [ena-usd](https://data.chain.link/streams/ena-usd) | Crypto v3, 24/7 | `0x0003f04d6244b2fb6bb366b405f63d87fa3550647acbc1c93f9c116df4645772` |
| AERO | `0x00038458999fd77d9deece17154ee687193b328cf7a53670501dd8ccad906ff6` | [aero-usd](https://data.chain.link/streams/aero-usd) | Crypto v3, 24/7 | `0x00033cf9f3040c301dcbfbf6d2827e49dc78e361b947eefe2dd870c86b950ca9` |
| WLD | `0x000365f820b0633946b78232bb91a97cf48100c426518e732465c3a050edb9f1` | [wld-usd-cexprice-streams](https://data.chain.link/streams/wld-usd-cexprice-streams) | Crypto v3, 24/7 | `0x00035f53bfb39e634d28d9c00cdc6ae53bdd9ad83a692341c2495aa5a24cc245` |
| ZEC | `0x00039f8a144f4a62715ca60aec1cf848c4821375c57e2259c6c90b7fa49db693` | [zec-usd-cexprice-streams](https://data.chain.link/streams/zec-usd-cexprice-streams) | Crypto v3, 24/7 | `0x00039c0417ee6ffb4bae0964e2093d1d7ecd69628aac53f1f8f00d04e115d3cf` |
| XMR | `0x00038f3b8f8be4305564abf0ed3c9cc46cb8b4303c35ab54079ea873b7d74b3a` | [xmr-usd-cexprice-streams](https://data.chain.link/streams/xmr-usd-cexprice-streams) | Crypto v3, 24/7（**无测试网 stream**） | — |
| HYPE | `0x0003d34539af562867c3cb309b59efccf40e74b404fb415eeb7699d61322aed9` | [hype-usd-cexprice-streams](https://data.chain.link/streams/hype-usd-cexprice-streams) | Crypto v3, 24/7 | `0x0003cbac760d50c462267f3127374f5fa039eb971dd4a58a2b4f2b664769f8ea` |
| VVV | `0x0003195dde0f669c58fa396bdd60488cbebcf4e0d869905fb79b3ed4b763c7a9` | [vvv-usd](https://data.chain.link/streams/vvv-usd) | Crypto v3, 24/7 | `0x0003dc0265d4419472f5a4cd68e8bcbaf9b01be500507b05fe7063626913c2e0` |
| GOLD (XAU) | `0x0008991d4caf73e8e05f6671ef43cee5e8c5c3652a35fde0b0942e44a77b0e89` | [xau-usd-forexprice-streams](https://data.chain.link/streams/xau-usd-forexprice-streams) | **RWA v8, 外汇时段（周末停盘）** | — |
| SILVER (XAG) | `0x0008460f5d530196432a03eac80efb9537823f3db72db93cfefc3062988269a9` | xag-usd-forexprice-streams（slug 待核实） | **RWA v8, 外汇时段（周末停盘）** | — |
| WTIOIL | ❌ **无价格 stream** | — | 仅有 WTI/USD push 型 Data Feed（Arbitrum/BNB）和 Hyperliquid CL/USDC 资金费率 stream（非价格） | — |
| BRENTOIL | ❌ **无价格 stream** | — | 仅有 BRENTOIL/USDC Hyperliquid 资金费率 stream（非价格），任何链上也无 push feed | — |
| SPCX | ❌ **完全无** | — | 仅有 tSpaceX (Tessera) NAV stream（基金净值，非交易标价）。SpaceX 预计 2026-06-12 Nasdaq IPO，上市后可能出现 v11 EquityPrice stream | — |

> **test Stream ID 来源**：2026-07-31 用户在 Notion 文档（"FX100 Oracle GMX Top 20"）里手动补充；已用 `fetchChainlinkOraclePrices()` 逐个实测（打真实 `https://api.testnet-dataengine.chain.link`），8 个资产（NEAR/HYPE/WLD/ZEC/VVV/LINK/SUI/AERO）拿到有效价格报告并通过链上 `getOraclePrice` 模拟验证。已同步写入 `apps/fx-base-app/src/config/feedIds.ts` 的 `chainlinkTestnetFeedIds`。XMR 确认无测试网 stream。
>
> ⚠️ **SOL 那格的 test Stream ID 是资金费率流，不是价格流**（2026-07-31 实测确认）。同一时刻同一 API 拉两份报告逐字段对比：
> - LINK（`0x0003…`，正常价格流）：字段 [6][7][8] = `8.2638 / 8.2619 / 8.2650`（price/bid/ask，三者同量级）
> - SOL（`0x0005…`）：字段 [6][7][8] = `1.2e13 / 1785495600 / 3600`（费率 / 精确整点时间戳 / 3600秒周期；`1785495600 ÷ 3600` 整除）。该费率值会随时间变化（前后两次查为 8e12→1.2e13，≈0.0012%/小时，年化约 10.5%），符合资金费率特征。
>
> 前 6 个字段与 V3 布局相同，只有后 3 个字段语义不同，所以按 V3 解码不会报错、但会把周期时间戳当成 bid，算出 ≈$0 的价格。`0x0005` 前缀应为费率类流族（与本文档 §2.1 提到的 Hyperliquid 资金费率流同类）。
> **待办**：需要重新获取 SOL/USD 真·价格测试网 stream ID（`0x0003…` 前缀）。在此之前 SOL（market 6）走 mock oracle，价格由 `apps/fx-base-app/scripts/tenderly/refreshMockPrices.ts` 维护。
> 测试网说明：除 XMR 外，以上 live 资产均有 Sepolia 测试网 stream ID（部署测试环境时另查）。

### 2.2 Chainlink 链上 Price Feed（备份主 oracle，Base 主网）

| 资产 | Base 主网地址 | 精度 | 心跳 | 偏差阈值 | Base Sepolia | 备注 |
|---|---|---|---|---|---|---|
| BTC | `0x64c911996D3c6aC71f9b455B1E8E7266BcbD848F` | 8 | 1200s | 0.1% | `0x0FB99723Aee6f420beAD13e6bBB79b7E6F034298` |  |
| ETH | `0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70` | 8 | 1200s | 0.15% | `0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1` |  |
| SOL | `0x975043adBb80fc32276CbF9Bbcfd4A601a12462D` | 8 | 86400s | 0.5% | ❌ |  |
| LINK | `0x17CAb8FE31E32f08326e5E27412894e49B0f9D65` | 8 | 86400s | 0.5% | `0xb113F5A928BCfF189C998ab20d753a47F9dE5A61` |  |
| SUI | `0x491a921c41d6a97C57426E0c0108a231cd6E5f60` | 8 | 86400s | 0.5% | ❌ |  |
| AERO | `0x4EC5970fC728C5f65ba413992CD5fF6FD70fcfF0` | 8 | 86400s | 0.5% | ❌ | feedCategory: **medium** |
| VVV | `0xaABc55Ca55D70B034e4daA2551A224239890282F` | **18** | 86400s | 0.5% | ❌ | feedCategory: **new**（最高谨慎级）；**18 位精度非 8 位** |
| GOLD (XAU) | `0x5213eBB69743b85644dbB6E25cdF994aFBb8cF31` | 8 | 86400s | 0.5% | ❌ | 交易时段资产 |
| SILVER (XAG) | `0x7dBC779B2A6F9B9AaB83a2dED78A2F7E9e203f0c` | 8 | 86400s | 0.5% | ❌ | 交易时段资产 |
| NEAR | ❌ Base 无 | — | — | — | ❌ | Arbitrum: `0xBF5C3fB2633e924598A46B9D07a174a9DBcF57C0` |
| XLM | ❌ Base 无 | — | — | — | ❌ | 仅 Optimism: `0x799A346e7dBfa0f66Ad0961259366F93A1ee34C4` |
| TIA | ❌ Base 无 | — | — | — | ❌ | Arbitrum: `0x4096b9bfB4c34497B7a3939D4f629cf65EBf5634` |
| ENA | ❌ Base 无 | — | — | — | ❌ | Arbitrum: `0x9eE96caa9972c801058CAA8E23419fc6516FbF7e` |
| WLD | ❌ Base 无 | — | — | — | ❌ | 仅 Optimism: `0x4e1C6B168DCFD7758bC2Ab9d2865f1895813D236` |
| ZEC | ❌ Base 无 | — | — | — | ❌ | Arbitrum: `0x21082CA28570f0ccfb089465bFaEfDc77b00D367`（**18 位精度**，medium） |
| XMR | ❌ Base 无 | — | — | — | ❌ | 仅 Optimism: `0x2a8D91686A048E98e6CCF1A89E82f40D14312672` |
| HYPE | ❌ Base 无 | — | — | — | ❌ | Arbitrum: `0xf9ce4fE2F0EcE0362cb416844AE179a49591D567` |
| WTIOIL | ❌ Base 无 | — | — | — | ❌ | 仅 Arbitrum: `0x594b919AD828e693B935705c3F816221729E7AE8`（feedCategory: **custom**） |
| BRENTOIL | ❌ **任何链都无** | — | — | — | ❌ |  |
| SPCX | ❌ **任何链都无** | — | — | — | ❌ |  |

> **Base Sepolia 极度稀疏**：本列表中只有 BTC / ETH / LINK 有测试网 feed，其余全部需要 mock。

### 2.3 Pyth 参考价 Feed（2% 偏差校验）

Feed ID 全链通用，已对 Hermes stable 全量目录核实。

| 资产 | Pyth Symbol | Feed ID | 类别/时段 |
|---|---|---|---|
| BTC | Crypto.BTC/USD | `0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43` | 24/7 |
| ETH | Crypto.ETH/USD | `0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace` | 24/7 |
| SOL | Crypto.SOL/USD | `0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` | 24/7 |
| LINK | Crypto.LINK/USD | `0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221` | 24/7 |
| SUI | Crypto.SUI/USD | `0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744` | 24/7 |
| NEAR | Crypto.NEAR/USD | `0xc415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750` | 24/7 |
| XLM | Crypto.XLM/USD | `0xb7a8eba68a997cd0210c2e1e4ee811ad2d174b3611c22d9ebf16f4cb7e9ba850` | 24/7 |
| TIA | Crypto.TIA/USD | `0x09f7c1d7dfbb7df2b8fe3d3d87ee94a2259d212da4f30c1f0540d066dfa44723` | 24/7 |
| ENA | Crypto.ENA/USD | `0xb7910ba7322db020416fcac28b48c01212fd9cc8fbcbaf7d30477ed8605f6bd4` | 24/7 |
| AERO | Crypto.AERO/USD | `0x9db37f4d5654aad3e37e2e14ffd8d53265fb3026d1d8f91146539eebaa2ef45f` | 24/7 |
| WLD | Crypto.WLD/USD | `0xd6835ad1f773de4a378115eb6824bd0c0e42d84d1c84d9750e853fb6b6c7794a` | 24/7 |
| ZEC | Crypto.ZEC/USD | `0xbe9b59d178f0d6a97ab4c343bff2aa69caa1eaae3e9048a65788c529b125bb24` | 24/7 |
| XMR | Crypto.XMR/USD | `0x46b8cc9347f04391764a0361e0b17c3ba394b001e7c304f7650f6376e37c321d` | 24/7 |
| HYPE | Crypto.HYPE/USD | `0x4279e31cc369bbcc2faf022b382b080e32a8e689ff20fbc530d2a603eb6cd98b` | 24/7 |
| VVV | Crypto.VVV/USD | `0x5ece7483ae221e3645ec0f9b5c6671ac830cb85471744df5d8e7deae152e31a2` | 24/7 |
| GOLD (XAU) | Metal.XAU/USD | `0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2` | 纽约时间周日 18:00–周五 17:00，每日 17:00-18:00 休市，周六停盘 |
| SILVER (XAG) | Metal.XAG/USD | `0xf2fb02c32b055c805e7238d628e5e9dadef274376114eb1f012337cabe93871e` | 同 XAU 时段 |
| WTIOIL | Commodities.USOILSPOT | `0x925ca92ff005ae943c158e3563f59698ce7e75c5a8c8dd43303a0a154887b3e6` | WTI 现货 CFD；GMT 周一至周四 00:00-21:00 & 22:00-24:00，周五 00:00-20:45，周六停，周日 22:00 开 |
| BRENTOIL | Commodities.UKOILSPOT | `0x27f0d5e09a830083e5491795cac9ca521399c8f7fd56240d09484b14e614d57a` | Brent 现货 CFD；周末停盘 |
| SPCX | ❌ **不存在** | — | 已对全量 3055 个 stable feed 检索 SPCX/SPACEX/SPACE/IPO/PRIVATE，确认无 SpaceX pre-IPO feed |

---

## 三、第一批上线名单（按 2026-06-13 确认的上线标准）

### 3.0 上线硬标准（必须同时满足）

1. **双源 oracle**：必须**同时拥有 Chainlink Data Stream（主 oracle）+ Pyth feed（参考校验）**。这样价格始终可被 2% 偏差交叉校验，避免单点 oracle 风险。链上 Base price feed 不再是必需条件（很多优质加密资产 Base 上没有，但有 Stream+Pyth 即可安全运行）。
2. **排除 RWA / 商品 / 股权**：金属（XAU/XAG）、原油（WTI/Brent）、股权（SPCX）等**不进第一批**。原因：本项目 fork 自 2024-10 的 GMX 代码，**风控逻辑不包含 5×24 交易时段（market hours）模式**，最新 GMX 也尚未加入。这类资产周末/休市停盘会触发全面 stale revert，且缺乏时段感知风控，暂不具备安全上线条件。RWA 资产仍保留在本文档表格中，用于跟踪市场与 oracle 现状，但**不在第一批**。

### 3.1 第一批名单（20 个加密资产，全部双源齐全）

按 GMX 24H 交易量排序，剔除 RWA/无 oracle 资产后，从 Top 20 取满足条件的 15 个，再按交易量往下补足至 20 个：

| # | 资产 | GMX 24H 量 | GMX 杠杆 | CL Stream | Pyth | Base feed | 备注 |
|---|---|---|---|---|---|---|---|
| 1 | BTC | $103.0m | 100x | ✅ | ✅ | ✅ |  |
| 2 | ETH | $18.7m | 100x | ✅ | ✅ | ✅ |  |
| 3 | HYPE | $2.7m | 50x | ✅ | ✅ | ❌ | Base 无备份 feed |
| 4 | SOL | $2.6m | 100x | ✅ | ✅ | ✅ |  |
| 5 | WLD | $2.1m | 50x | ✅ | ✅ | ❌ |  |
| 6 | ZEC | $2.0m | 85x | ✅ | ✅ | ❌ |  |
| 7 | VVV | $1.4m | 50x | ✅ | ✅ | ⚠️ | Base feed 18 位精度 + "new" 级，若启用需验证精度换算 |
| 8 | LINK | $819.5k | 100x | ✅ | ✅ | ✅ |  |
| 9 | SUI | $288.2k | 50x | ✅ | ✅ | ✅ |  |
| 10 | XMR | $266.5k | 50x | ✅ | ✅ | ❌ | **无测试网 stream**，Base Sepolia 需 mock |
| 11 | AERO | $214.9k | 50x | ✅ | ✅ | ⚠️ | Base feed category=medium |
| 12 | NEAR | $214.3k | 50x | ✅ | ✅ | ❌ |  |
| 13 | XLM | $199.8k | 50x | ✅ | ✅ | ❌ |  |
| 14 | ENA | $180.2k | 50x | ✅ | ✅ | ❌ |  |
| 15 | TIA | $174.2k | 50x | ✅ | ✅ | ❌ |  |
| 16 | ONDO | $165.4k | 50x | ✅ | ✅ | ❌ | 补位 #1 |
| 17 | XRP | $164.3k | 100x | ✅ | ✅ | ✅ | 补位 #2；OI $2.2m 全场第 4 |
| 18 | ARB | $162.2k | 70x | ✅ | ✅ | ❌ | 补位 #3 |
| 19 | LIT | $162.0k | 45x | ✅ | ✅ | ❌ | 补位 #4；CexPrice stream |
| 20 | TON | $138.2k | 70x | ✅ | ✅ | ❌ | 补位 #5 |

> 降级路径说明：14 个无 Base feed 的资产，Data Streams 故障时唯一备选是切 Pyth 主——据前置文档 §2.5，Pyth 做主时 2% 交叉校验会消失，成为单一信任源。建议在风控文档明确标注这些资产的降级特性。

新增资产的完整 oracle 信息（补 §2 各表）：

| 资产 | CL Stream ID（mainnet / testnet） | Pyth Feed ID |
|---|---|---|
| ONDO | `0x000380ec05b354a41eddf993234e7fb62bb1a39b1d63ada55a43bb2ef210de4a`<br>`0x000380fd590efd03f8368469267e187c251231fcf42bdf4c6ff08f56fe495b71` | `0xd40472610abe56d36d065a0cf889fc8f1dd9f3b7f2a478231a5fc6df07ea5ce3` |
| XRP | `0x0003c16c6aed42294f5cb4741f6e59ba2d728f0eae2eb9e6d3f555808c59fc45`<br>`0x00035e3ddda6345c3c8ce45639d4449451f1d5828d7a70845e446f04905937cd` | `0xec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8` |
| ARB | `0x00030ab7d02fbba9c6304f98824524407b1f494741174320cfd17a2c22eec1de`<br>`0x0003c90f4d0e133914a02466e44f3392560c86248925ce651ef8e44f1ec2ef4a` | `0x3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5` |
| LIT | `0x00033b02ff589d0d5693a4603c172a625440c02039611b0f6e7e80ab985dbd8c`<br>`0x00037610d1f26dfb7f7dbf22765a59700dec8203590344e85aca969af9b5897b` | `0xc0c83f00c39165892d55dcd17ade2191e289697e2ac132d9ab721e20834e2a9e` |
| TON | `0x0003f9ec12942ff27b28ab151905c8fc1cb280518d8bbd3885d410eaa50ddc56`<br>`0x0003167e54377caae2bdbefbefabb839916ed73e70468519a3b6a26b9c54e2f2` | `0x8963217838ab4cf5cadc172203c1f0b763fbaa45f346d8ee50ba994bbcac3026` |

XRP Base feed：`0xF35059FB4471333F81E4F39fA40260FF53Dc340b`（另有变体 `0x9f0C1dD78C4CBdF5b9cf923a549A201EdC676D34`，启用前确认 canonical）。ONDO/ARB/LIT/TON 在 Base 主网无链上 feed。

### 3.1.1 实际首批部署清单（12 个，2026-06-14 确定）

从 §3.1 的 20 个双源齐全资产中，**第一批实际部署 12 个**（部署/测试以此为准）：

**BTC、ETH、HYPE、SOL、ZEC、WLD、VVV、LINK、XMR、NEAR、SUI、AERO**

| 资产 | GMX 前端杠杆 | Base feed | 部署注意 |
|---|---|---|---|
| BTC | 100x | ✅ |  |
| ETH | 100x | ✅ |  |
| SOL | 100x | ✅ |  |
| LINK | 100x | ✅ |  |
| SUI | 50x | ✅ |  |
| HYPE | 50x | ❌ | 降级路径仅 Pyth 主 |
| ZEC | 85x | ❌ | 降级路径仅 Pyth 主 |
| WLD | 50x | ❌ | 降级路径仅 Pyth 主 |
| NEAR | 50x | ❌ | 降级路径仅 Pyth 主 |
| XMR | 50x | ❌ | 降级路径仅 Pyth 主；**无测试网 stream**，Base Sepolia 需 mock |
| VVV | 50x | ⚠️ | Base feed 18 位精度 + "new" 级，若启用需验证精度换算 |
| AERO | 50x | ⚠️ | Base feed category=medium |

从 20 个中**本批暂缓**的 8 个（保留在双源名单，后续批次再上）：XLM、ENA、TIA、ONDO、XRP、ARB、LIT、TON。

> **部署/测试 TODO**（本批 12 个）：
> 1. **细化所有 market 参数并逐项验证**——以 §3.5 链上 GMX 参考值为基准，按 fx100 口径定稿 `raw` 各字段（杠杆取前端值、清算缓冲用 fx100 自有口径、maxOI 按 LP 规模缩放等），替换 `markets-top20.draft.json` 里的 ETH 模版值
> 2. 每个 token 配齐 oracle 三件套并**强制校验 `pythPriceFeedKey`**（未配置则无 2% 偏差校验）
> 3. Base Sepolia 测试网：仅 BTC/ETH/LINK 有链上 feed，其余（尤其 XMR 无测试网 stream）需 MockPriceFeed
> 4. 确定 synthetic token 地址/部署方案（草稿中 token 字段为 TODO）

### 3.1.2 参数定稿状态（12 个部署资产，2026-06-14）

参数分两类，现状见下表。已写入 [markets-top20.draft.json](../../../scripts/parameters/markets-top20.draft.json) 各部署 market 的 `raw` + `paramStatus`。

**A 类——已定（机械参数 + OI 缩放）**：

| fx100 字段 | 取值规则 | 状态 |
|---|---|---|
| `MaxLev` | GMX 前端杠杆（BTC/ETH/SOL/LINK 100x、ZEC 85x、其余 50x） | ✅ 已定 |
| `MIN_COLLATERAL_FACTOR`（开仓） | `1/MaxLev`（100x→1%、50x→2%、85x→1.18%） | ✅ 已定 |
| `MinCollateralFactor`（清算线，json 字段） | **默认**：BTC 0.4%、ETH 0.5%、其余 = 开仓/2 | ⚠️ 默认值，**待风控签字** |
| `GlobalCapUSD` | GMX **链上** maxOI × **k=0.30**（BTC≈$40m…）；ZEC 无 GMX 参考 → 占位 $0.5m | ⚠️ k 待 LP 规模确认 |
| `SinglePosCapUSD` | `GlobalCapUSD × 0.2` | ✅ 随 Global |
| `OpenFeeRatio`/`CloseFeeRatio` | 0.02%/0.02%（sample 惯例） | ✅ 已定 |
| `ReserveFactor` | BTC 0.4、其余 0.3（sample 惯例） | ✅ 已定 |
| `minPnlFactorAfterAdl` L/S | 0.77 | ✅ 已定 |
| `MinPosUSD`/grace/cooldown | sample 固定惯例 | ✅ 已定 |

> OI 缩放系数 **k=0.30** 是占位（让 BTC≈$40m 对齐 sample 原意）。给定 LP_NAV 目标值后一键全表重算。ZEC 在 GMX Arbitrum 无 market，无链上 OI 参考，需风控单独定。

**B 类——待量化模型（仍为 ETH 模板占位，12 个资产当前完全相同，不真实）**：

`FundingFloorAPR_Normal/Emergency`、`FundingBaseAPR_Normal/Emergency`、`minFundingRate`、`maxFundingRate`、`FundingSkewEmaMinutes`、`ConstantSpread`、`PriceImpactParameter_Normal/Emergency`、`OrderbookDepth{Long,Short}` 及 min/max、`PI_Clamp_*`、`Skew_k_normal/emergency`、`Skew_Clamp_*`

这些是 fx100 动态价差/资金费模型的核心量化参数（见 [pricing.md](../../analysis/pricing/pricing.md)），repo 无推导公式，sample 的 BTC/ETH 值来自外部量化模型。**等用户提供量化模型/spreadsheet 后按资产精确计算填入**。量化模型需要为每个资产产出：

- 资金费曲线：`FundingFloorAPR`/`FundingBaseAPR`（Normal+Emergency）、min/max FundingRate、EMA 分钟数
- 订单簿深度：`OrderbookDepth{Long,Short}` + min/max（真实流动性，USD）
- 价差/冲击：`ConstantSpread`、`PriceImpactParameter`（Normal+Emergency）、`PI_Clamp`、`Skew_k`、`Skew_Clamp`

### 3.2 暂不上线（保留跟踪，非第一批）

| 资产 | GMX 24H 量 | 类别 | 不上线原因 |
|---|---|---|---|
| WTIOIL | $21.1m | 商品-原油 | RWA：风控不支持交易时段；且 Chainlink **无价格 Data Stream**（仅 Arbitrum push feed + Hyperliquid 资金费率 stream），Pyth 有 USOILSPOT |
| SILVER (XAG) | $1.3m | 金属 | RWA：风控不支持交易时段。三层 oracle 其实齐全（v8 ForexPrice stream + Base feed + Pyth Metal） |
| BRENTOIL | $803.0k | 商品-原油 | RWA：风控不支持交易时段；且 Chainlink **无价格 stream / 任何链无 push feed**，仅 Pyth UKOILSPOT |
| GOLD (XAU) | $439.6k | 金属 | RWA：风控不支持交易时段。三层 oracle 齐全（v8 ForexPrice stream + Base feed + Pyth Metal） |
| SPCX | $227.7k | 股权 | 无任何可用 oracle（Pyth 全量目录确认无 SpaceX feed；Chainlink 仅 tSpaceX 基金 NAV）。SpaceX 已于 2026-06-12 Nasdaq IPO，可复查是否出现 v11 EquityPrice stream + Pyth equity feed；但即便有，仍受 RWA 交易时段限制 |

> 上线 RWA 的前置条件：在风控层补齐 market-hours 模式（开/平/清算的时段感知、停盘期 stale 容忍、跳空保护）。这是一项独立的合约/风控工作项，需另立设计。

---

## 3.5 GMX 实际参数参考（定参用，链上读取）

**数据来源（2026-06-13 链上读取）**：直接从 GMX Arbitrum 主网 `DataStore`（`0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8`）读取实际生效值，脚本 [gmx-synthetics/scripts/fx100_read_market_params.js](../../../../gmx-synthetics/scripts/fx100_read_market_params.js)（经 Reader 枚举 136 个市场，取各资产 USDC 计价主市场，按合约 Key 逐项 `getUint`）。**不再用 `config/markets.ts`**——该文件是 2024-10 部署时的初始配置，上线后 maxOI / 价格冲击 / funding 已被治理多次调整，只更新在链上不回写配置文件（见下方差异说明）。**ZEC、LIT 当前 GMX Arbitrum 无对应市场**，无参考参数。

> **📜 链上读取脚本位置与用法**（以后复用 / 增删资产时用）：
> - 路径：`/Users/vicky/Documents/GitHub/gmx-synthetics/scripts/fx100_read_market_params.js`
> - ⚠️ 脚本在 **gmx-synthetics 仓库**（非本 fx100-contracts 仓库），因为它依赖 GMX 的 Reader/DataStore 地址与 ethers 依赖
> - 运行：`cd /Users/vicky/Documents/GitHub/gmx-synthetics && node scripts/fx100_read_market_params.js`
> - 输出：控制台表格 + `/tmp/gmx_onchain_params.json`（逐资产完整字段）
> - 改资产：编辑脚本顶部 `TARGETS` 数组即可增删；合成 token 地址自动用 `keccak256(abi.encode(chainId, symbol))` 生成，真实 token（ETH/SOL/LINK/ARB）地址在 `REAL` 映射里
> - 已硬编码：DataStore `0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8`、Reader `0x65A6CC451BAfF7e7B4FDAb4157763aB4b6b44D0E`、4 个公共 RPC 自动回退（公共 RPC 会限流，已串行读取 + 重试）

> 表头说明：`minColl` = `minCollateralFactor`（开仓校验）；链上读取确认 GMX 的 `minCollateralFactorForLiquidation` 与 `minCollateralFactor` **完全相等**（如 BTC 两者都是 0.005），即合约层不留缓冲，前端 100x 是 UI 限制。`maxLev` = `1/minColl`（合约层最高，非前端值）。

| 资产 | maxLev(=1/minColl) | minColl=清算线 | reserveFactor | maxOI多(USD) | openFee/closeFee | negPI / posPI | PI指数 | maxFunding/年 | 清算费 |
|---|---|---|---|---|---|---|---|---|---|
| BTC | 200x | 0.005 | 350% | $133.6m | 0.04% / 0.06% | 5.8e-9 / 4.8e-9 | 1.81 | 15% | 0.20% |
| ETH | 200x | 0.005 | 275% | $64.0m | 0.04% / 0.06% | 1.2e-8 / 1.0e-8 | 1.61 | 17% | 0.20% |
| SOL | 200x | 0.005 | 380% | $9.7m | 0.04% / 0.06% | 1.5e-8 / 1.3e-8 | 1.66 | 15% | 0.20% |
| LINK | 200x | 0.005 | 305% | $8.9m | 0.04% / 0.06% | 1.5e-8 / 9.9e-9 | 1.82 | 16% | 0.20% |
| XRP | 200x | 0.005 | 185% | $11.3m | 0.04% / 0.06% | 1.4e-7 / 9.5e-8 | 1.71 | 20% | 0.30% |
| ARB | 150x | 0.00667 | 235% | $0.7m | 0.04% / 0.06% | 1.5e-7 / 1.0e-7 | 1.98 | 25% | 0.20% |
| TON | 150x | 0.00667 | 175% | $1.0m | 0.04% / 0.06% | 2.2e-8 / 1.5e-8 | 1.90 | 108% | 0.30% |
| HYPE | 100x | 0.01 | 145% | $4.4m | 0.04% / 0.06% | 3.1e-8 / 2.0e-8 | 1.60 | 20% | 0.30% |
| WLD | 100x | 0.01 | 135% | $0.6m | 0.04% / 0.06% | 6.3e-8 / 4.2e-8 | 1.58 | 15% | 0.30% |
| VVV | 100x | 0.01 | 105% | $1.3m | 0.04% / 0.06% | 1.6e-6 / 1.0e-6 | 1.74 | 21% | 0.30% |
| SUI | 100x | 0.01 | 155% | $3.4m | 0.04% / 0.06% | 8.8e-10 / 5.9e-10 | 1.69 | 20% | 0.30% |
| XMR | 100x | 0.01 | 105% | $0.8m | 0.04% / 0.06% | 1.4e-7 / 9.6e-8 | 1.61 | 28% | 0.30% |
| AERO | 100x | 0.01 | 105% | $0.6m | 0.04% / 0.06% | 8.2e-8 / 5.5e-8 | 1.73 | 21% | 0.30% |
| NEAR | 100x | 0.01 | 185% | $1.2m | 0.04% / 0.06% | 2.7e-8 / 1.8e-8 | 1.69 | 15% | 0.30% |
| XLM | 100x | 0.01 | 105% | $1.3m | 0.04% / 0.06% | 1.8e-7 / 1.2e-7 | 1.80 | 16% | 0.30% |
| ENA | 100x | 0.01 | 105% | $0.5m | 0.04% / 0.06% | 5.2e-8 / 3.5e-8 | 1.72 | 21% | 0.30% |
| TIA | 100x | 0.01 | 155% | $0.4m | 0.04% / 0.06% | 2.1e-6 / 1.4e-6 | 1.74 | 21% | 0.30% |
| ONDO | 100x | 0.01 | 170% | $0.6m | 0.04% / 0.06% | 3.5e-8 / 2.3e-8 | 1.67 | 16% | 0.30% |
| ZEC | — | — | — | — | — | — | — | — | GMX Arbitrum 无此市场 |
| LIT | — | — | — | — | — | — | — | — | GMX Arbitrum 无此市场 |

### ⚠️ 链上值 vs config/markets.ts 的差异（为何要读链上）

markets.ts 是部署初始配置，部分参数上线后经治理调整、只存在于链上。逐项核对结论：

| 参数 | markets.ts（初始） | 链上（实际） | 是否一致 | 定参用哪个 |
|---|---|---|---|---|
| `minCollateralFactor` / 杠杆 | 0.005–0.01 | 0.005–0.01 | ✅ 一致 | 任一 |
| `positionFeeFactor` | 0.04%/0.06% | 0.04%/0.06% | ✅ 一致 | 任一 |
| `liquidationFeeFactor` | 0.20%/0.30% | 0.20%/0.30% | ✅ 一致 | 任一 |
| `reserveFactor` | 350%/275%… | 350%/275%… | ✅ 基本一致 | 任一 |
| **`maxOpenInterest`** | BTC $95m / ETH $110m | BTC $133.6m / ETH $64m | ❌ 差异大 | **链上** |
| **价格冲击 negPI** | BTC 9.0e-11 | BTC 5.8e-9（~60x） | ❌ 差异大 | **链上** |
| **价格冲击指数** | 恒 2（exponentToFloat 2e0） | 1.58–1.98（各资产不同） | ❌ 差异大 | **链上** |
| **`maxFundingFactor`/年** | 75%–100% | 15%–28%（TON 108%） | ❌ 差异大 | **链上** |

→ **杠杆/费率/reserveFactor 用配置或链上都行；maxOI、价格冲击、funding 必须以链上为准。** 本表已全部改为链上值。

### fx100 参数映射关系（哪些可直接参考，哪些语义不同）

| fx100 参数 | GMX 来源 | 可否直接参考 |
|---|---|---|
| `MaxLev` | 见下注 | ⚠️ **取 GMX 前端杠杆**（CSV 值：BTC/ETH/SOL/LINK/XRP 100x、HYPE/多数 50x、ARB/TON 70x、LIT 45x），**不是** `1/minCollateralFactor`（那是合约层 200x） |
| `MIN_COLLATERAL_FACTOR` | — | fx100 自定（如 1%→100x），与 GMX 的 `minCollateralFactor` 口径不同：GMX 开仓线=清算线相等无缓冲 |
| `MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION` | GMX `minCollateralFactorForLiquidation` | ❌ 不照搬。GMX 设成与开仓线相等（0.5%）；fx100 设更低（0.4%/0.5%）留缓冲，是 fx100 自己的设计 |
| `GlobalCapUSD` | 链上 `maxOpenInterest` | ✅ 量级参考（GMX 是其 Arbitrum 大池值，fx100 初期按 LP 规模等比缩小） |
| `OpenFeeRatio` / `CloseFeeRatio` | `positionFeeFactor` pos/neg（0.04%/0.06%） | ⚠️ 量级参考。fx100 sample 用 0.02%/0.02% |
| 价格冲击（`PriceImpactParameter`/`Skew_k`/clamps） | 链上 `negativePositionImpactFactor`/`positive…`/指数（链上 1.58–1.98，非配置里的 2） | ⚠️ 模型不同（GMX `impact=factor×(OI差)^exp`，fx100 用 orderbook 深度+skew_k）；参考**相对大小**排序 |
| `maxFundingRate` | 链上 `maxFundingFactorPerSecond` 年化（15%–108%） | ⚠️ 量级参考，fx100 funding 是 APR+EMA skew 模型，结构不同 |
| `ReserveFactor` | GMX `reserveFactor`（105%–380%） | ❌ **语义不同不可拷贝**。GMX 是「OI/pool 倍数上限」（可 >100%）；fx100（0.3–0.4）另一套口径 |
| `minPnlFactorAfterAdl` | GMX `minPnlFactorAfterAdl`（主流币 77%/合成 50–60%） | ✅ fx100 sample 已用 0.77，与 GMX 主流币一致 |
| 借贷费 | GMX `borrowingRateConfig` | ❌ fx100 **无借贷费**（见 `reference_fx100_design_doc` 备忘），忽略 |

**定参建议**：

1. **杠杆取前端值**：fx100 `MaxLev` 用 GMX 前端杠杆（CSV：主流币 100x、多数 50x、ARB/TON 70x、LIT 45x），清算缓冲（`MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION` < `MIN_COLLATERAL_FACTOR`）是 fx100 自己的设计，不照搬 GMX 的「相等」配置。
2. **OI 上限按 LP 规模缩放**：以链上 maxOI 为量级基准等比缩小。
3. **价格冲击取相对关系**：用链上 negPI/posPI 判断流动性档位（如 VVV/TIA 的 impact 比 BTC 大 ~2-3 个数量级），再换算到 fx100 orderbook 深度模型。
4. ReserveFactor / 借贷费 / funding 结构不照搬，按 fx100 模型单独定。

完整逐资产链上 GMX 参数已写入 [markets-top20.draft.json](../../../scripts/parameters/markets-top20.draft.json) 每个市场的 `gmxRef` 块，原始 JSON 见 `/tmp/gmx_onchain_params.json`。

## 四、与现有部署/配置的衔接

1. **参数模版**：[scripts/parameters/market.sample.json](../../../scripts/parameters/market.sample.json) 中 oracle 相关字段只有 `ChainlinkStreamUrl`；[base-sepolia/market-msol.json](../../../scripts/parameters/base-sepolia/market-msol.json) 中无 oracle 字段。本表的三件套（stream ID / feed 地址 / Pyth ID）需要新增字段或在部署脚本侧配置 `DataStore`（`ORACLE_PROVIDER_FOR_TOKEN`、`pythPriceFeedKey` 等）
2. **Pyth feed 必须逐个配置**：前置文档 §3 指出，未配置 `pythPriceFeedKey` 的 token 完全没有偏差校验（Keeper 可提交任意签名价格）——上新资产时这一项是**强制检查项**
3. **测试网 gap**：Base Sepolia 只有 BTC/ETH/LINK 有链上 feed，且 XMR 无测试网 stream——测试环境需要 MockPriceFeed 覆盖其余资产

## 五、下一步（待续）

- [x] 核实候补资产 XRP / ONDO 的双源 oracle 可用性
- [x] 按 2026-06-13 上线标准（双源 oracle + 排除 RWA）重定第一批名单 = 20 个加密资产（见 §3.1）
- [x] 核实补位资产 ARB / LIT / TON 的 CL Stream + Pyth（已确认齐全）
- [x] 重生成 20 个加密资产的 market 参数 json 草稿：[scripts/parameters/markets-top20.draft.json](../../../scripts/parameters/markets-top20.draft.json)
- [x] **整理这 20 个资产在 GMX 的实际参数作为定参参考**——已改为**链上读取**（Arbitrum DataStore，2026-06-13），写入 §3.5 表 + json `gmxRef`；发现 maxOI/价格冲击/funding 链上值与 config/markets.ts 差异大，以链上为准
- [x] 确定实际首批部署清单 = 12 个（2026-06-14，见 §3.1.1）：BTC ETH HYPE SOL ZEC WLD VVV LINK XMR NEAR SUI AERO
- [ ] **为这 12 个细化所有 market 参数并逐项验证**——以 §3.5 链上 GMX 参考值为基准、按 fx100 口径定稿 `raw` 字段，替换草稿 ETH 模版值（部署测试前置）
- [ ] 确定 synthetic token 地址生成/部署方案（草稿中 token 字段为 TODO）
- [ ] 确认 XRP Base feed 两个变体地址中的 canonical 条目
- [ ] （延后）RWA market-hours 风控模式设计——上线金属/原油的前置条件
- [ ] （延后）SPCX IPO 后复查 oracle 可用性

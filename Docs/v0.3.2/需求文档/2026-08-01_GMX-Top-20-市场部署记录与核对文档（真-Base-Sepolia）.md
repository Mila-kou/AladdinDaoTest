# 🚀 GMX Top 20 市场部署记录与核对文档（真 Base Sepolia）

> Notion 页面：[原文](https://app.notion.com/p/3ae3d7873f2c811cb78cf370bbc9e5da)
> 作者：fx100-sync（Gordon 的 fx100-contracts 仓库文档同步机器人，内容出自 Gordon）
> 创建时间：2026-08-01
> 最后编辑：2026-08-01
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 产品 / FX100 / 技术相关 / 合约 / 🚀 上线与部署
> 类型：设计文档

> 👥 受众：全员　｜　来源：docs/analysis/../superpowers/specs/2026-07-31-top20-markets-fork-deployment.md

# GMX Top 20 市场部署记录与核对文档

**日期**: 2026-08-01（本文为最终态，替代 2026-07-31 老 fork 的记录）
**链**: **真 Base Sepolia（chain 84532）** — 已完成部署，本文所有地址均为真链地址
**先行 fork**: Gordon 20260731（chain 99917），RPC `https://virtual.base-sepolia.eu.rpc.tenderly.co/aladdindao/test/f64878-bdceed`（预演，已作废；真链部署完成后应重新 fork 一次）
**状态**: 真链 **20 个市场全部建成并链上核对通过，索引 1→20 连续无空洞**；17 个新资产 recorded price 已推送（tx `0xc05f404616ebfce544eb5458e1c3fe5813b5a2a7c3e6fbaff047b7219426851d`）
**上线操作手册（5层配置 + 所有坑）**: [2026-07-31-market-onboarding-playbook.md](2026-07-31-market-onboarding-playbook.md)
**资产筛选 / oracle 依据**: [2026-06-10-market-listing-oracle-config.md](2026-06-10-market-listing-oracle-config.md)

## 部署产物（合约工程师校对用）

| 文件 | 内容 |
|---|---|
| [`scripts/parameters/markets-top20.draft.json`](../../../scripts/parameters/markets-top20.draft.json) | 逐资产参数草稿 + `gmxRef`（GMX 链上参考值） |
| `fx100-apps/apps/fx-base-app/scripts/top20-markets-result.json` | 真链部署结果（token 地址、market index、oracle 模式、实际写入值）。⚠️ 脚本按批覆盖此文件，本次真链跑了 2 批（4~6 / 7~20），文件内只留最后一批 14 条；**权威数据是链上，用下面的 verify 脚本读** |
| `fx100-apps/apps/fx-base-app/scripts/top20-tokens.realchain-20260801.json` | **17 个真链 index token 地址完整清单**（从链上读回、viem 校验和）。补 `top20-markets-result.json` 只剩一批的缺口 |
| `fx100-apps/apps/fx-base-app/scripts/top20-markets-result.fork-20260731.json`<br>`…/top20-tokens.fork-20260731.json` | fork 预演结果备份（对照用；除 HYPE/SOL 恰好同 nonce 外，token 地址与真链不同） |
| `fx100-apps/apps/fx-base-app/scripts/tenderly/createTop20Markets.ts` | 创建脚本（全部资产参数定义 + preflight 索引断言 + `readMarketListWithRetry` 抗 RPC 读滞后 + `sendIdempotent` 抗超时重试 + 修复模式） |
| `fx100-apps/apps/fx-base-app/scripts/tenderly/verifyTop20Markets.ts` | 链上核对脚本（**本文档数据来源**）：`RPC_URL=<rpc> npx tsx scripts/tenderly/verifyTop20Markets.ts` |
| `fx100-apps/apps/fx-base-app/scripts/tenderly/refreshTop20RecordedPrices.ts` | 给 17 个新资产推 recorded price（强制 testnet feed 表 + testnet 凭证，见 §三） |

---

## 一、数量口径（容易混，先说清）

```plain text
Top20 名单           20 个资产（含 BTC、ETH）
  − XMR 不部署        19 个资产  ← 资产覆盖数
  − BTC/ETH 已存在    17 个       ← 本次新建的市场数（market 4~20）
最终链上             20 个市场 = BTC(1) + ETH(2) + MSOL(3) + 新建 17 个
```

- **BTC / ETH / MSOL 沿用真链已有的 market 1 / 2 / 3**，fork 直接继承，未重建。
- **XMR 不部署**：Chainlink 无 XMR 测试网价格流，只能长期 mock，价值不大。
- 老 fork（Gordon 20260730）最高索引是 22，那是因为中间有 2 个禁用空洞（12=XMR、14=误建的重复 SOL）；本次连续创建**无空洞，最高索引 20**。可用市场数两边都是 20。

## 二、Oracle 现状

**19 个资产用真实 Chainlink testnet Data Stream**（与 BTC/ETH 同一条路径、同一个 `ChainlinkOracleDataStreamProvider` 合约）；**仅 MSOL 用 mock oracle**（合成测试资产，无任何真实 feed，价格靠 `refreshMockPrices.ts` 维护）。

链上核对结果：20 个市场 `open == liq` 全部成立；provider 分布 19 : 1 与上述一致。

---

### A. 逐资产不同的参数（只有这 5 个 + 地址/ID）

| Market | 资产 | 目标杠杆 | 开仓=清算线 | maxOpenInterest(多/空各) | maxPositionSizeUsd | Oracle |
|---|---|---|---|---|---|---|
| 1 | BTC | 100x | 0.4000% | $40,000,000 | $8,000,000 | 真实 CL |
| 2 | ETH | 100x | 0.5000% | $30,000,000 | $6,000,000 | 真实 CL |
| 3 | MSOL | 50x | 0.5000% | $30,000,000 | $6,000,000 | mock |
| 4 | HYPE | 50x | 1.0000% | $1,331,560 | $266,312 | 真实 CL |
| 5 | SOL | 100x | 0.5000% | $2,915,156 | $583,031 | 真实 CL |
| 6 | WLD | 50x | 1.0000% | $180,600 | $36,120 | 真实 CL |
| 7 | ZEC | 85x | 0.5900% | $500,000 | $100,000 | 真实 CL |
| 8 | VVV | 50x | 1.0000% | $401,712 | $80,342 | 真实 CL |
| 9 | LINK | 100x | 0.5000% | $2,685,000 | $537,000 | 真实 CL |
| 10 | SUI | 50x | 1.0000% | $1,027,500 | $205,500 | 真实 CL |
| 11 | AERO | 50x | 1.0000% | $170,100 | $34,020 | 真实 CL |
| 12 | NEAR | 50x | 1.0000% | $360,600 | $72,120 | 真实 CL |
| 13 | XLM | 50x | 1.0000% | $399,900 | $79,980 | 真实 CL |
| 14 | ENA | 50x | 1.0000% | $148,125 | $29,625 | 真实 CL |
| 15 | TIA | 50x | 1.0000% | $114,600 | $22,920 | 真实 CL |
| 16 | ONDO | 50x | 1.0000% | $183,600 | $36,720 | 真实 CL |
| 17 | XRP | 100x | 0.5000% | $3,401,100 | $680,220 | 真实 CL |
| 18 | ARB | 70x | 0.7100% | $204,900 | $40,980 | 真实 CL |
| 19 | LIT | 45x | 1.1100% | $300,000 | $60,000 | 真实 CL |
| 20 | TON | 70x | 0.7100% | $293,400 | $58,680 | 真实 CL |

### B. Oracle Feed ID + Token 地址全表（前端接入用）

| Market | 资产 | Index Token（**真 Base Sepolia**） | Chainlink mainnet Stream ID | Chainlink **testnet** Stream ID（当前生效） | Pyth Feed ID（未接线） |
|---|---|---|---|---|---|
| 1 | BTC | `0x0555E30da8f98308EdB960aa94C0Db47230d2B9c` | `0x00039d9e45394f473ab1f050a1b963e6b05351e52d71e507509ada0c95ed75b8` | `0x00037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b439` | `0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43` |
| 2 | ETH | `0x4200000000000000000000000000000000000006` | `0x000362205e10b3a147d02792eccee483dca6c7b44ecce7012cb8c6e0b68b3ae9` | `0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782` | `0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace` |
| 3 | MSOL | `0xBfCa745E50a272Dc723b8608122b956Afb6391Ff` | `—` | `—（mock oracle）` | `—` |
| 4 | HYPE | `0x74DEF71365759CE2A29cca45b904815256f3c043` | `0x0003d34539af562867c3cb309b59efccf40e74b404fb415eeb7699d61322aed9` | `0x0003cbac760d50c462267f3127374f5fa039eb971dd4a58a2b4f2b664769f8ea` | `0x4279e31cc369bbcc2faf022b382b080e32a8e689ff20fbc530d2a603eb6cd98b` |
| 5 | SOL | `0x9F0b9d68f1Cbf03ee4cdD1baD2f42d3bED3d2daf` | `0x0003b778d3f6b2ac4991302b89cb313f99a42467d6c9c5f96f57c29c0d2bc24f` | `0x0003d338ea2ac3be9e026033b1aa601673c37bab5e13851c59966f9f820754d6` | `0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` |
| 6 | WLD | `0x320e60D2d9175cBb6b936814B83d4a6Af94aB25A` | `0x000365f820b0633946b78232bb91a97cf48100c426518e732465c3a050edb9f1` | `0x00035f53bfb39e634d28d9c00cdc6ae53bdd9ad83a692341c2495aa5a24cc245` | `0xd6835ad1f773de4a378115eb6824bd0c0e42d84d1c84d9750e853fb6b6c7794a` |
| 7 | ZEC | `0xdA3874BE7e22263dd8d1bAB5d510dF5f7a5e26fB` | `0x00039f8a144f4a62715ca60aec1cf848c4821375c57e2259c6c90b7fa49db693` | `0x00039c0417ee6ffb4bae0964e2093d1d7ecd69628aac53f1f8f00d04e115d3cf` | `0xbe9b59d178f0d6a97ab4c343bff2aa69caa1eaae3e9048a65788c529b125bb24` |
| 8 | VVV | `0x084acd6285BBc351D560709b302a83335b7CC13a` | `0x0003195dde0f669c58fa396bdd60488cbebcf4e0d869905fb79b3ed4b763c7a9` | `0x0003dc0265d4419472f5a4cd68e8bcbaf9b01be500507b05fe7063626913c2e0` | `0x5ece7483ae221e3645ec0f9b5c6671ac830cb85471744df5d8e7deae152e31a2` |
| 9 | LINK | `0x9d4bA3C766B0172431f5C98D3d6F32a682DD6A4c` | `0x00036d7a1251e3f67d6658466b5e9e7fe8418af7feac9567ff322bff95cc2401` | `0x00036fe43f87884450b4c7e093cd5ed99cac6640d8c2000e6afc02c8838d0265` | `0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221` |
| 10 | SUI | `0x71cD43217763027f7D9634d317f6BaA8525721B3` | `0x000348ce31679e9ce1f80ec929f1d7c86499569d67f1cea80a90d6e5e3c127a7` | `0x00034881db604b551ff226aa414ba73dd5b2be0a06834124dafa9bf66871ce89` | `0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744` |
| 11 | AERO | `0x1B7B58F656B4ec8A50Bf793EA4a5606A903C6F95` | `0x00038458999fd77d9deece17154ee687193b328cf7a53670501dd8ccad906ff6` | `0x00033cf9f3040c301dcbfbf6d2827e49dc78e361b947eefe2dd870c86b950ca9` | `0x9db37f4d5654aad3e37e2e14ffd8d53265fb3026d1d8f91146539eebaa2ef45f` |
| 12 | NEAR | `0x0AE32036a370256477ca2D8cD7546299194e5555` | `0x00036e9386eda6b177c6f7e9d493e60ae9ebaeb732a271b880b4d6a131d6b3f5` | `0x0003d64b0bdb0046a65e4ebb0a9866215044634524673c65bff4096a197fcff5` | `0xc415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750` |
| 13 | XLM | `0xDa311BdF455e82Aab0b4d9133b0D4C10936E0311` | `0x000358cb12b1f5bbeca8b5b4666025a40b15520af1f82516ee2fb9a335055e9a` | `0x00037dfe3b67b7552cf15e10ee5fb0c0ab6d658b20eb558effe2ae4579d24c58` | `0xb7a8eba68a997cd0210c2e1e4ee811ad2d174b3611c22d9ebf16f4cb7e9ba850` |
| 14 | ENA | `0x2d4bD8b530b5027337D9b01593292D1f852A581C` | `0x00033e05a40dd8c25ffa1b88a35234845c067635f7ddf5edde701f859f8894c1` | `0x0003f04d6244b2fb6bb366b405f63d87fa3550647acbc1c93f9c116df4645772` | `0xb7910ba7322db020416fcac28b48c01212fd9cc8fbcbaf7d30477ed8605f6bd4` |
| 15 | TIA | `0x908881330827874014a1E9F0E875c948Ef5dd02E` | `0x00034a6c27424c06b3441b8714c9b11bb4e7dc38548a525cee36ee232ffea013` | `0x00036173437e26ef8dc971c19070b2c05f6575bdb484c2c45e06e99fec290bd2` | `0x09f7c1d7dfbb7df2b8fe3d3d87ee94a2259d212da4f30c1f0540d066dfa44723` |
| 16 | ONDO | `0xB9d61814407190BbBc057979A5d234Dfd602090A` | `0x000380ec05b354a41eddf993234e7fb62bb1a39b1d63ada55a43bb2ef210de4a` | `0x000380fd590efd03f8368469267e187c251231fcf42bdf4c6ff08f56fe495b71` | `0xd40472610abe56d36d065a0cf889fc8f1dd9f3b7f2a478231a5fc6df07ea5ce3` |
| 17 | XRP | `0x5A8a17a149FBFf4038b2cB7C6CB793Cd1608C2Cb` | `0x0003c16c6aed42294f5cb4741f6e59ba2d728f0eae2eb9e6d3f555808c59fc45` | `0x00035e3ddda6345c3c8ce45639d4449451f1d5828d7a70845e446f04905937cd` | `0xec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8` |
| 18 | ARB | `0xA41227235ED685ca2a72d509d0dd3289060B6833` | `0x00030ab7d02fbba9c6304f98824524407b1f494741174320cfd17a2c22eec1de` | `0x0003c90f4d0e133914a02466e44f3392560c86248925ce651ef8e44f1ec2ef4a` | `0x3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5` |
| 19 | LIT | `0xcda2eCaF479DFA6C4384d933b7b6393effB462f1` | `0x00033b02ff589d0d5693a4603c172a625440c02039611b0f6e7e80ab985dbd8c` | `0x00037610d1f26dfb7f7dbf22765a59700dec8203590344e85aca969af9b5897b` | `0xc0c83f00c39165892d55dcd17ade2191e289697e2ac132d9ab721e20834e2a9e` |
| 20 | TON | `0x10b937df33ee42E0ca3B6c601E933735058E318a` | `0x0003f9ec12942ff27b28ab151905c8fc1cb280518d8bbd3885d410eaa50ddc56` | `0x0003167e54377caae2bdbefbefabb839916ed73e70468519a3b6a26b9c54e2f2` | `0x8963217838ab4cf5cadc172203c1f0b763fbaa45f346d8ee50ba994bbcac3026` |

> ⚠️ **选 testnet Stream ID 前必须验证是价格流**。Chainlink 测试网列表存在同名的**非价格流**：SOL/USD 有两行，`0x0005…` 那行是 schema v5（利率类：rate/timestamp/duration），按 v3 解码不会报错但会把周期时间戳当 bid、算出 ≈$0。上表 17 个 testnet ID 均已实测确认返回真实 price/bid/ask（三者同量级）。

### C. 全部 20 个市场取值完全相同的参数（20 个）

这些直接从 ETH（market 2）复制，无需逐资产配置：

| 参数 | 值 | 含义 |
|---|---|---|
| `maxPnlFactorForTraders`(多/空) | `1e30` (100%) | 交易者 PnL 上限 |
| `maxPnlFactorForAdl`(多/空) | `0` | 走全局裸键，per-market 为 0 是正常的 |
| `positionImpactFactor`(多/空) | `0` | fx100 用 orderbook 深度模型，不用 GMX 那套 |
| `positionImpactExponentFactor`(多/空) | `1e30` |  |
| `maxPositionImpactFactor`(多/空) | `1e30` |  |
| `maxPositionImpactFactorForLiquidations` | `0` |  |
| `liquidationFeeFactor` | `3e27` (0.3%) |  |
| `executionFeeSubsidize` | `0` | ⚠️ 见下方"已知遗留项" |
| `openInterestReserveFactor`(多/空) | `0` |  |
| `constantPriceSpread` | `1e14` (0.01%) |  |
| `liquidationGracePeriodBase` | `0` |  |
| `minSkewImpact` / `maxSkewImpact` | `-5e15` / `5e15` |  |
| `fundingFloorFactor` | `3472222222222222222222` |  |

### D. 18 个新建市场之间一致、但与 BTC/ETH/MSOL 不同的参数（14 个）

新市场统一取 ETH 基线值（除手续费和 minPnlAfterAdl 是本批新定的）：

| 参数 | 18 个新市场 | BTC | ETH | 说明 |
|---|---|---|---|---|
| `reserveFactor` / `maxOpenInterestFactor`(多/空) | 30% | 40% | 30% |  |
| `positionFeeFactor`(双向) | **0.02%** | 0.05% | 0.05% | 本批按文档 §3.1.2 定为 0.02% |
| `minPnlFactorAfterAdl`(多/空) | **0.77** | 0 | 0 | 本批新定；老市场走全局裸键 |
| `bidOrderBookDepth` / `askOrderBookDepth` | ETH 值 | BTC 值(约2倍) | — | B类占位 |
| `priceImpactParameter` | 0.6 | 0.5 | 0.6 | B类占位 |
| `skewImpactFactor` | 2.5e15 | 1e16 | 2.5e15 | B类占位 |
| `fundingBaseFactor` / `min\|maxFundingFactorPerSecond` | ETH 值 | BTC 值 | — | B类占位 |

---

## 二、参数取值规则（A 类，本次实际执行）

| 参数 | 规则 |
|---|---|
| `MaxLev` | GMX 前端杠杆 |
| `minCollateralFactorForLiquidation` | `(1/MaxLev) / 2` |
| **`minCollateralFactor`(开仓)** | **= 清算线**（项目约定：统一后消除"最大杠杆 vs 清算线"之间的危险区，目标杠杆可顺滑开到底） |
| `maxOpenInterest`(多/空) | GMX 链上 maxOI × k=0.30 |
| `maxPositionSizeUsd` | `maxOpenInterest × 0.2` |
| `reserveFactor` = `maxOpenInterestFactor` | 0.3 |
| `positionFeeFactor`(双向) | 0.02% |
| `minPnlFactorAfterAdl`(双向) | 0.77 |

第二批 8 个资产（XRP/ARB/TON/XLM/ENA/TIA/ONDO/LIT）的 `raw` 块原为纯 ETH 模板（8 个完全相同、不真实），已按上表逐资产重新推导。

---

## 三、已知遗留项

| 项 | 状态 |
|---|---|
| **B 类参数全部照抄 ETH** | 资金费曲线/价差/订单簿深度/价格冲击/skew 20 个资产同一套，不反映真实流动性差异。等风控量化模型，逐资产重算 |
| `maxOpenInterest` 的 k=0.30 是占位系数 | 待 LP 规模（LP_NAV）确定后全表重算 |
| LIT / ZEC 的 OI 上限是占位值 | 两者在 GMX Arbitrum 无对应市场，无链上参考，待风控单独定（LIT $300K / ZEC $500K） |
| **Pyth 2% 交叉校验未接线** | Pyth Feed ID 已在上表 + `markets-top20.draft.json`，但链上 `pythPriceFeedKey` 未配。⚠️ 未配的 token 完全没有偏差校验，keeper 理论上可提交任意签名价格——**上真链前应评估** |
| `executionFeeSubsidize = 0` | 继承 ETH。0 的含义见 [project_exec_fee_subsidy_config_requirement 备忘]，真链部署前确认是否要显式配置 |
| Index token 是 Mock ERC20 | 非任何真实资产的桥接映射，合成资产地址方案待定 |
| MSOL 用 mock，价格需人工维护 | 脚本 `scripts/tenderly/refreshMockPrices.ts`（`WATCH=true` 可常驻每 60s 刷）。测试网其实有真实 `MSOL/USD` DEX 流（`0x0003c683d2…`, Marinade Staked SOL），如需可切换，但会改变现有测试基线 |
| 前端展示价走 mainnet 订阅、新资产无授权 | 已加 testnet fallback（`/api/prices/tickers`）。实测 BTC 两网报价相差 0.01%，展示可接受。长期应申请 mainnet 订阅授权 |
| 运维脚本默认拉 mainnet feed，与链上 testnet ID 不匹配 | `@/config/feedIds` 在 **import 时**按 `CHAINLINK_NETWORK` 选表，`.env` 里是 `mainnet`（前端展示需要），于是 `refreshRecordedPrices.ts` 直接拿到 mainnet ID + mainnet 凭证 → 401 → `no prices returned from Chainlink API`。`refreshTop20RecordedPrices.ts` 通过在 import 之前改写 `CHAINLINK_NETWORK` / `CHAINLINK_API_*` 为 testnet 绕过。**写任何新运维脚本都要注意这个 import 时序** |

---

## 四、核对状态（2026-08-01 真链最终）

真链核对命令与实际输出：

```bash
cd fx100-apps/apps/fx-base-app
RPC_URL=<base-sepolia-rpc> npx tsx scripts/tenderly/verifyTop20Markets.ts
# chain=84532 / 20 个 market 块 / ❌ 计数 = 0
```

- ✅ **真链（84532）20 个市场逐项核对通过**：`open == liq` 20/20 成立（无一处 ❌）、oracle provider 正确、`maxOpenInterest` / `reserveFactor` / `positionFeeFactor` / `minPnlFactorAfterAdl` 与本文 A 表一致
- ✅ **市场索引 4→20 连续无空洞**，且与 fork 预演的索引分配逐一对应（脚本断言 `marketIndex` 相等，17/17 通过）
- ✅ 17 个新资产 recorded price 已推送：`refreshTop20RecordedPrices.ts`，tx `0xc05f404616ebfce544eb5458e1c3fe5813b5a2a7c3e6fbaff047b7219426851d`（17 tokens, status success）
- ✅ 前端 4 个含地址的配置文件已换成真链地址（105 处），残留 fork 地址扫描为 0；`@fx-io/sdk` 已重建；`tsc --noEmit` 通过
- ✅ 全部地址由 viem `getAddress()` 生成（禁止手敲，见上线手册 🔴 规则）
- ⚠️ 真链前端 UI 未做端到端实测 —— 计划由用户**基于真链重新 fork 一次**后在 fork 上跑，因为真链与新 fork 的地址此时完全一致，前端配置无需再改

### 真链部署过程中触发的两次容错（脚本已固化）

| 现象 | 原因 | 脚本对策 |
|---|---|---|
| `createMarket` 回执 `status 1`，紧接着读 `MARKET_LIST` 仍是旧长度 | 真链多节点读滞后（fork 上不会出现） | `readMarketListWithRetry()` 轮询到长度达标才继续，否则以前会留下一个"已建但未配参数"的半成品市场 |
| 参数配置中途 RPC request timeout | 公共 RPC 抖动 | `sendIdempotent()` 对所有 DataStore 幂等写做 3s×i 退避重试；`createMarket` 与合约部署**故意不重试**（非幂等，重试会多建市场） |

**上线前必做的自检命令**见[上线手册 §六](2026-07-31-market-onboarding-playbook.md)。

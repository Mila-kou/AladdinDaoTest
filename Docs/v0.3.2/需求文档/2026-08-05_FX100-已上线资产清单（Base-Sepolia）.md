# 📊 FX100 已上线资产清单（Base Sepolia）

> Notion 页面：[原文](https://app.notion.com/p/3b33d7873f2c8167a54bd4dd204a7fc8)
> 作者：fx100-sync（Gordon 的 fx100-contracts 仓库文档同步机器人，内容出自 Gordon）
> 创建时间：2026-08-05
> 最后编辑：2026-08-20
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 产品 / FX100 / 技术相关 / 合约 / 🚀 上线与部署
> 类型：设计文档

**数据截止**: 2026-08-19（参数变更历史见 §十一）
**链**: Base Sepolia，chain **84532**
**DataStore**: `0x606D72Ab0C0fDcce607d04B1645CE2D528B88014`
**可交易资产**: **24 个**，全部使用真实 Chainlink Data Stream 报价
**数据来源**: 链上逐项读取（`scripts/tenderly/verifyTop20Markets.ts`）+ SDK `Token.categories` + `MARKET_PAIRS`

> **关于 market index 缺号（3 和 19）**：链上市场索引是只增不减的，下架不会回收编号，所以本清单的 index 有两处跳号，都是正常的： - **3 = MSOL**：合成测试资产、mock oracle、价格人工维护，**仅内部测试使用，不对外上线**。 - **19 = LIT**：**已于 2026-08-05 下架**（GMX 已下架该资产），链上 `IS_MARKET_DISABLED = true`，不可开仓也不可交易。市场本身仍在链上占用 index 19。

---

## 一、资产总表

| market | 资产 | 名称 | 分类 | 最大杠杆 | 开仓线=清算线 | 今日可开/侧（=RF×池子） | 单仓上限 | 开/平仓费 |
|---|---|---|---|---|---|---|---|---|
| 1 | **BTC** | Bitcoin | Layer 1 | 100x | 0.5000% | $25,390,087 | $1,800,000 | 0.0500% |
| 2 | **ETH** | Ethereum | Layer 1 | 100x | 0.5000% | $35,264,010 | $1,800,000 | 0.0500% |
| 4 | **HYPE** | Hyperliquid | ⚠️ 未配 | 50x | 1.0000% | $25,390,087 | $1,800,000 | 0.0750% |
| 5 | **SOL** | Solana | Layer 1 | 100x | 0.5000% | $11,284,483 | $800,000 | 0.0750% |
| 6 | **WLD** | Worldcoin | AI | 50x | 1.0000% | $7,052,802 | $500,000 | 0.0750% |
| 7 | **ZEC** | Zcash | Layer 1 | 85x | 0.5900% | $11,284,483 | $800,000 | 0.0750% |
| 8 | **VVV** | Venice Token | AI | 50x | 1.0000% | $3,526,401 | $250,000 | 0.0750% |
| 9 | **LINK** | Chainlink | DeFi | 100x | 0.5000% | $7,052,802 | $500,000 | 0.0750% |
| 10 | **SUI** | Sui | Layer 1 | 50x | 1.0000% | $7,052,802 | $500,000 | 0.0750% |
| 11 | **AERO** | Aerodrome | DeFi | 50x | 1.0000% | $3,526,401 | $250,000 | 0.0750% |
| 12 | **NEAR** | NEAR Protocol | Layer 1 | 50x | 1.0000% | $7,052,802 | $500,000 | 0.0750% |
| 13 | **XLM** | Stellar | Layer 1 | 50x | 1.0000% | $3,526,401 | $250,000 | 0.0750% |
| 14 | **ENA** | Ethena | DeFi | 50x | 1.0000% | $7,052,802 | $500,000 | 0.0750% |
| 15 | **TIA** | Celestia | Layer 1 | 50x | 1.0000% | $3,526,401 | $250,000 | 0.0750% |
| 16 | **ONDO** | Ondo Finance | RWA | 50x | 1.0000% | $3,526,401 | $250,000 | 0.0750% |
| 17 | **XRP** | XRP | Layer 1 | 100x | 0.5000% | $7,052,802 | $500,000 | 0.0750% |
| 18 | **ARB** | Arbitrum | Layer 2 | 70x | 0.7100% | $3,526,401 | $250,000 | 0.0750% |
| 20 | **TON** | Toncoin | ⚠️ 未配 | 70x | 0.7100% | $3,526,401 | $250,000 | 0.0750% |
| 21 | **AAVE** | Aave | DeFi | 50x | 1.0000% | $7,052,802 | $500,000 | 0.0750% |
| 22 | **PUMP** | Pump.fun | Meme | 50x | 1.0000% | $7,052,802 | $500,000 | 0.0750% |
| 23 | **BNB** | BNB | Layer 1 | 100x | 0.5000% | $7,052,802 | $500,000 | 0.0750% |
| 24 | **XMR** | Monero | Layer 1 | 50x | 1.0000% | $7,052,802 | $500,000 | 0.0750% |
| 25 | **ADA** | Cardano | Layer 1 | 50x | 1.0000% | $7,052,802 | $500,000 | 0.0750% |
| 26 | **DOGE** | Dogecoin | Meme | 100x | 0.5000% | $7,052,802 | $500,000 | 0.0750% |

**读表说明**
- **开仓线 = 清算线**：项目约定两者统一，消除"最大杠杆 vs 清算线"之间的危险区，目标杠杆可以顺滑开到底。数值 = `(1 / 最大杠杆) / 2`，**24 个市场全部符合该规则**（BTC 原为 0.40% 是唯一例外，已于 2026-08-05 对齐）。
- **今日可开/侧**：某一侧在市场空仓时的可开额度 = `RESERVE_FACTOR` × 池子。⚠️ 这不是"多空各一份"—— `RESERVE_FACTOR` 管的是**多空合计**，多空共享这一个额度（单侧闸门已于 2026-08-06 撤除，见 §6.6），所以一边吃满另一边就没有了。
- **单仓上限** = 今日可开/侧 × 10%（绝对美元值，不随池子伸缩）。
- **容量只由 `RESERVE_FACTOR` 一个参数决定，四层分配 + ETH 逐市场上调，Σ = 3.09（⚠️ 已超出自定的 ≤3 预算，2026-08-19 显式接受，见 §十一）**，见 §六。另两个上限自 2026-08-06 起都刻意惰性、不参与决策：`MAX_OPEN_INTEREST` 全场 $100M/侧、`MAX_OPEN_INTEREST_FACTOR` 全场 1.0。**各市场今日可开 = RF × 池子**（池子 $70.53M）：ETH $35.3M、BTC/HYPE $25.4M、T2 $11.3M、T3 $7.1M、T4 $3.5M（多空共享，非各一份）。⚠️ 表里的美元数会随池子变动，**耐用的值是 RF 那一列**；额度不够优先加 LP，加 LP 跟不上时才逐市场上调 RF。
- **开/平仓费**：BTC/ETH **0.05%**，其余 22 个 **0.075%**（2026-08-06 起，为覆盖 15 分钟清算保护期的风险；此前全场统一 0.02%）。

## 二、Index Token 地址

均为 18 位精度的测试代币，非任何真实资产的桥接映射。

| market | 资产 | index token |
|---|---|---|
| 1 | BTC | `0x0555E30da8f98308EdB960aa94C0Db47230d2B9c` |
| 2 | ETH | `0x4200000000000000000000000000000000000006` |
| 4 | HYPE | `0x74DEF71365759CE2A29cca45b904815256f3c043` |
| 5 | SOL | `0x9F0b9d68f1Cbf03ee4cdD1baD2f42d3bED3d2daf` |
| 6 | WLD | `0x320e60D2d9175cBb6b936814B83d4a6Af94aB25A` |
| 7 | ZEC | `0xdA3874BE7e22263dd8d1bAB5d510dF5f7a5e26fB` |
| 8 | VVV | `0x084acd6285BBc351D560709b302a83335b7CC13a` |
| 9 | LINK | `0x9d4bA3C766B0172431f5C98D3d6F32a682DD6A4c` |
| 10 | SUI | `0x71cD43217763027f7D9634d317f6BaA8525721B3` |
| 11 | AERO | `0x1B7B58F656B4ec8A50Bf793EA4a5606A903C6F95` |
| 12 | NEAR | `0x0AE32036a370256477ca2D8cD7546299194e5555` |
| 13 | XLM | `0xDa311BdF455e82Aab0b4d9133b0D4C10936E0311` |
| 14 | ENA | `0x2d4bD8b530b5027337D9b01593292D1f852A581C` |
| 15 | TIA | `0x908881330827874014a1E9F0E875c948Ef5dd02E` |
| 16 | ONDO | `0xB9d61814407190BbBc057979A5d234Dfd602090A` |
| 17 | XRP | `0x5A8a17a149FBFf4038b2cB7C6CB793Cd1608C2Cb` |
| 18 | ARB | `0xA41227235ED685ca2a72d509d0dd3289060B6833` |
| 20 | TON | `0x10b937df33ee42E0ca3B6c601E933735058E318a` |
| 21 | AAVE | `0xe706a715B9f5Fc09e98A16B19E2B7C1a64B3A928` |
| 22 | PUMP | `0xf0eBba81277bC0565E7aceBBc03a988C5AAa7778` |
| 23 | BNB | `0x541373871Af70C0923DE66dAdd911d360F04B6F6` |
| 24 | XMR | `0x4cb6c8ABD0c5c0fe98950C3e4CE4d5fEda8b5db4` |
| 25 | ADA | `0xBA98a71b71aa19e33eCc30Fe4BFDC992017de793` |
| 26 | DOGE | `0x24bE345B59f9594b038E2e4E966Ce97b32BE1965` |

抵押/结算代币统一为 USDC：`0xbf4D9B318689AB928DB9eE4Cdc840c065575Eb89`

## 三、全场统一的交易口径

| 项 | 值 | 说明 |
|---|---|---|
| 清算保护期 | **900 秒** | 新开仓后 15 分钟内不可被清算（`graceEnd`）。⚠️ 仅对推荐人等级 0 的用户生效，tier ≥ 1 当前为 0，待风控确认 |
| 执行费 | **全免（24 / 24 市场）** | 2026-08-06 起无例外。此前 BTC / ETH 保留 20 USD 阈值以保留"收费"路径可测，现已按用户要求取消。<br>豁免由每市场**两个**键控制，判定在**下单时刻**（`GasUtils.isExecutionFeeSubsidizedAtCreation`）：`EXECUTION_FEE_SUBSIDIZE`（USD 计价单）与 `EXECUTION_FEE_SUBSIDIZE_SIZE`（token 计价单）。语义是 `sizeDelta >= 阈值` 即免、`MAX` = 关闭豁免，因此 **0 = 恒免**，全场 24 个市场两键均为 0。<br>⚠️ 阈值不要写成 10 USD 来"对齐最小开仓规模"：豁免比的是**订单的 `sizeDelta`**，而 `MIN_POSITION_SIZE_USD` 约束的是**结果仓位** `position.sizeInUsd()`（`PositionUtils.validatePosition`）—— 在已有 100 USD 仓位上加仓 5 USD、或部分平仓 3 USD，sizeDelta 都低于 10，仍会自付执行费。只有 0 能保证全免。<br>⚠️ 这两个键属于 4 个"裸 keccak"异类键（见 §五），且未设置的键读回 0，漏写一个就是静默全免而非报错，必须两个都显式写 |
| 市价单有效期 | **120 秒** | 同时是可成交窗口与不可取消窗口：120 秒内可被成交且不可取消，超时后永久不可成交、立即可取消 |
| 最小开仓规模 | **10 USD** | 低于此值 revert |
| 报价新鲜度上限 | **60 秒** | 报价相对区块时间的最大年龄 |
| ADL 触发 / 结束阈值 | 触发 **55%**<br>结束 **45%** | 均为**全局裸键**、与市场无关（`AdlUtils.updateAdlState:82` → `MarketUtils.isGlobalNetObligationRatioExceeded:1188`）。⚠️ markets 4-26 上那些 per-market `MIN_PNL_FACTOR_AFTER_ADL = 0.77` 是**死写**，合约不读；此前本表写的 0.77 不是实际行为。详见 §9.7 |
| LP 提款封锁阈值 | **50%** | 全局裸键 `MAX_PNL_FACTOR_FOR_WITHDRAWALS`（`LPVault.sol:358`） |
| 盈利结算硬顶 `MAX_PNL_FACTOR_FOR_TRADERS` | **60%** | per-market 键（多空各一份）。池子聚合 PnL 超过 90% × poolUsd 时，平仓盈利按 `cappedPnl/poolPnl` 等比打折（`PositionUtils.sol:227` → `MarketUtils.getCappedPnl`）。演进：2026-08-06 前是 100%（= 永不打折，规范的 0.90 从未配置）→ 08-06 按规范补配 0.90 → **08-07 按提案 B 下调至 0.60**，逐市场写入含 MSOL market 3（它共用同一个 LPVault）。GMX 主流市场是 90%、合成市场 70%，见 §10.3 / §10.4 |
| 储备系数 `RESERVE_FACTOR` | **按四层分配 + 逐市场覆盖** | **ETH 50%**（2026-08-19 由 36% 上调，见 §十一）｜其余 T1 36%（BTC / HYPE）｜T2 16%（SOL / ZEC）｜T3 10%（13 个）｜T4 5%（7 个），**Σ = 3.09（超出自定 ≤3 预算，已显式接受）**。逐市场值见 §6.5 |
| 开/平仓手续费 | **BTC/ETH 0.05%<br>其余 22 个 0.075%** | 2026-08-06 按历史数据测算调整，用于覆盖 15 分钟清算保护期的风险敞口。⚠️ 开仓费与平仓费是**同一个参数**（`POSITION_FEE_FACTOR`，按"是否改善多空平衡"分两个槽位，当前两槽同值），合约层**无法**让开仓与平仓收不同费率 |
| 费用分配给 LP 的比例 | **0%（2026-08-19 起）** | **0% 即时 ／ 20% 应计**（2026-08-20 起） 详见 **§11.3** |
| 固定价差 `constantPriceSpread` | **0.01%**（生效） | 全场 24 个一致。它只是动态价差的一个分量，实际点差 = 固定价差 + 价格冲击 + skew 冲击（改善平衡时 skew 为负，可能使总点差低于 0.01%），下限 0、无总上限。链上实测见 §8.2。⚠️ 它用 **WEI_PRECISION（1e18 = 100%）**，0.01% = `1e14`，与 `POSITION_FEE_FACTOR` 的 1e30 刻度不同 |

## 四、分布

- **最大杠杆**：100x×7 ｜ 85x×1 ｜ 70x×2 ｜ 50x×14
- **分类**：Layer 1 12 个、DeFi 4 个、AI 2 个、Meme 2 个、RWA 1 个、Layer 2 1 个、⚠️ 未配 2 个
- **Oracle**：24 / 24 全部为真实 Chainlink Data Stream（与 BTC/ETH 同一条 `ChainlinkOracleDataStreamProvider` 路径），无 mock

## 五、已知待办

1. **HYPE / TON 未配分类** —— 分类筛选的任何页签都看不到它们，只出现在「全部」里。分类数据源已收敛到 SDK 的 `Token.categories`（单一数据源），这两个漏配了。建议 HYPE → Layer 1 + DeFi（自有 L1 兼 DEX，双属性），TON → Layer 1。
2. **Pyth 2% 交叉校验未接线** —— 全部市场的 `pythPriceFeedKey` 均未配置，即当前没有价格偏差校验。Pyth Feed ID 已备齐。
3. **杠杆分层待风控定档** —— 现有杠杆沿用 GMX 前端口径，比 Hyperliquid 同资产宽 5~10 倍；按流动性分层的建议方案待签字后统一调整。
4. 🔴 **v0.3.2 升级阻塞项：动态价差零配置** —— v0.3.2 把动态价差改成 `clamp(spread, MIN_DYNAMIC_SPREAD, MAX_DYNAMIC_SPREAD)`，而这两个键在链上都是 0（v0.3.1 不使用它们），`clamp(x,0,0)=0` 且无"0 视为不限制"兜底。**直接升级会让全场点差立刻变 0**。升级前必须先配 `MAX_DYNAMIC_SPREAD`。当前 v0.3.1 下点差正常生效，详见 §8.1/§8.2。
5. ✅ ~~`SKEW_IMPACT_FACTOR` 大小关系配反~~ —— 2026-08-06 已全场统一为 0.0025（此前 BTC 0.01 是其余的 4 倍，方向相反）。详见 §8.4。若将来要按流动性分层，与杠杆分层一并定档。
6. ⚪ **`PRICE_IMPACT_PARAMETER` 当前完全无效，已决定暂不改** —— 它只出现在 exp 分支，param < 1 时该分支永远输给线性项，能赢的区间又早被 `MAX_PRICE_IMPACT_SPREAD` 0.5% 盖住。**当前实际行为 = `min(订单额/深度/100, 0.5%)`，线性正比于 u**，这被接受为公测期口径。链上那两个值（BTC 0.5 / 其余 0.6）是摆着不生效的，别以为两者有差别。详见 §8.3。
7. **Funding / Dynamic Spread 参数仍是「BTC 一套 + 其余照抄 ETH」** —— 23 个市场共用 ETH 基线，不反映各自流动性差异。详见 §七、§八。
8. **参数模板里有一批字段没有链上对应**（`FundingSkewEmaMinutes`、各 `*_Emergency`、`min/maxOrderbookDepth*`、`CloseFeeRatio` 等），配了不生效，容易误以为已调优。详见 §7.3、§8.7。
9. **风控兜底核对（2026-08-06 核对 GMX 时发现，3 项已全部处理）** —— ①✅ `MAX_PNL_FACTOR_FOR_TRADERS` 已从 100% 逐市场改为 **0.90**（50 笔写入，含 MSOL）；②⚪ `MIN_COLLATERAL_USD = 0` 已评估**接受不改**（§9.9；残余风险：小仓位清算不经济、若将来下调最小仓位规模必须补回）；③✅ **四个 PnL 阶梯参数已定档并落链**（2026-08-07，提案 B）：traders 60 / ADL 触发 55 / 提款封锁 50 / ADL 后目标 45，均匀 5pt，旧值 90/75/65/50。设计原则、与 GMX 的口径与顺序差异、已接受的两个代价（危险带收窄至 5pt、TRADERS 偏离规范 0.90）见 **§十**。另注意 ADL 两阈值是**全局裸键**，markets 4-26 上 per-market 的 0.77 是死写、`verifyTop20Markets` 打印的 77% 不代表行为（§9.7）。
10. **GMX 对标结论待决策** —— 清算费 receiver 分成 50% vs 37%；资金费上限 96.5%/年 vs GMX ~17%/年；FX100 无借贷费。清算费率本身已核实清楚（详见 §9.2.1）：24 个上线资产里只有 BTC/ETH/SOL/LINK/ARB/BNB/AAVE 这 7 个在 GMX 属于 0.20% 真实抵押档，其余 17 个即使在 GMX 也是 0.30% 合成档，与 FX100 现值一致；差异只存在于这 7 个资产上，本轮结论是暂不调整参数（见 [docs/analysis/TEST_REVIEW_FINDINGS.md](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/analysis/TEST_REVIEW_FINDINGS.md) 问题 3）。详见 §九。
11. **备份 oracle 层为空** —— Base Sepolia 上除 BTC / ETH / LINK 外无 Chainlink push feed，故链上聚合器这一层未接。

> **手续费沿革**： - 2026-07-21 把 BTC/ETH 从 0.05% 改成 0.02%，但改在 v0.3.0 的 DataStore（`0x1523353Ca…`）上；7-29 换 v0.3.1 全新部署（`0x606D72Ab…`）后配置重置，退回模板里的 0.05%。 - 2026-08-04 重新把 BTC/ETH 对齐到 0.02%（全场统一），同时把部署模板一并改掉，避免再次因重新部署而丢失。 - **2026-08-06（当前）**：按历史数据测算，为覆盖 **15 分钟清算保护期**的风险敞口上调 —— BTC/ETH → **0.05%**，其余 22 个 → **0.075%**。清算保护期是 2026-08-04 全场铺开 900s 的直接后果（此前 market 3~20 实际为 0），保护期内仓位不可被清算，风险由协议承担，故以手续费覆盖。链上 48 笔写入全部复核通过；`constantPriceSpread` 维持 0.01% 未动。 另：链上 market 3（MSOL，内部测试用，不在本清单）仍为 0.05%，未改动，以免影响既有 E2E 基线。
> **BTC 清算线对齐记录（2026-08-05）**：BTC 的开仓线/清算线原为 **0.40%**，是全场唯一不符合 `(1/MaxLev)/2` 规则的市场（100x 应为 0.50%，ETH 一直是 0.50%）。已改为 **0.50%**，开仓线与清算线同步。改动前核对过链上仓位：BTC 唯一未平多头 size $64,217.95 / 抵押 $639.34 = **0.9956%**，远高于新阈值 0.50%（需跌到 $321 以下才会可清算），**不会因这次改动被清算**。部署模板 `scripts/parameters/market.sample.json` 的 WBTC `MinCollateralFactor` 也已从 `0.004` 改为 `0.005`。
> **LIT 下架记录（2026-08-05）**：GMX 已下架 LIT，我们同步下架。链上 `market 19` 置 `IS_MARKET_DISABLED = true`（tx `0x56c6b81d…`），下架前确认未平仓位为 0 —— **这一步必须先确认**：`IS_MARKET_DISABLED` 不是"只挡开仓"的开关，`MarketUtils.validateEnabledMarket` 在开仓（`OrderUtils.sol:99`）、平仓（`DecreaseOrderUtils.sol:33`）、任何订单执行（`BaseOrderHandler.sol:62`）、ADL（`AdlHandler.sol:106`）四条路径上都会走到，禁用后持仓者无法平仓、也无法被清算/ADL，资金会被锁死。若市场仍有仓位，应改为软下架（`maxOpenInterest` 多空都设 0，只挡新开仓），等仓位清零后再禁用。前端与 SDK 侧已从展示/交易配置移除 LIT。

---

新增市场的完整流程见[新增 Market 上线手册](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/superpowers/specs/2026-07-31-market-onboarding-playbook.md)；最近一批（AAVE / PUMP / BNB / XMR / ADA / DOGE，market 21~26）的参数与 oracle 依据见[交付说明](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/superpowers/specs/2026-08-04-batch2-6-assets-handoff.md)。

---

## 六、容量参数与 Available Liquidity

> **状态：已于 2026-08-05 落链**（144 笔写入 0 失败，24 个对外市场），部署模板同步完成。本节记录参数含义、设计推导与复现方式。

### 6.1 「单仓上限」「全局持仓上限」分别是哪个参数

| 界面/文档叫法 | 链上键 | 维度 | 强制位置 | 含义 |
|---|---|---|---|---|
| **单仓上限** | `MAX_POSITION_SIZE_USD` | per-market | `PositionUtils.sol:305` | 单个仓位的 `sizeInUsd` 上限，超了 revert `MaxPositionSize` |
| **全局持仓上限** | `MAX_OPEN_INTEREST` | per-market **× 多空各一份** | `MarketUtils.sol:649-652` | 该侧 OI 的**绝对美元硬顶**，超了 revert `MaxOpenInterestExceeded`。⚠️ 当前全场统一 $100M/侧、**刻意不生效**（§6.6）；另注意写 0 是"全禁"不是"无限" |
| （同上，比例版） | `MAX_OPEN_INTEREST_FACTOR` | per-market **× 多空各一份** | `MarketUtils.sol:655-658` | 该侧 OI ≤ 系数 × poolUsd。⚠️ 当前全场 **1.0（= 整个池子/侧）、刻意不生效**，等于**单侧闸门已撤除**：一个方向可以独占该市场的全部 RF 额度 |
| （市场总容量） | `RESERVE_FACTOR` | per-market，**不分多空** | `MarketUtils.sol:667` `validateOpenInterestReserve` | **多空合计**名义 OI ≤ 系数 × poolUsd |

### 6.2 Available Liquidity 是这三个上限取最小

前端那个数字不是前端算的，是合约 `ReaderUtils.getAvailableLiquidityUsd`（:167-193）算的，与开仓时的拦截口径**完全一致**：

```plain text
某一侧的 Available = min(
    MAX_OPEN_INTEREST(mi, isLong)        − 该侧已用OI,     // 绝对硬顶
    MAX_OPEN_INTEREST_FACTOR(mi,isLong) × poolUsd − 该侧已用OI,   // 比例软顶（单边）
    RESERVE_FACTOR(mi)                  × poolUsd − 多空合计名义OI  // 市场总容量（合计）
)
```

- `poolUsd` = `LPVault.totalAssets() × USDC价格`，**全部市场共用同一个 LP 池**（单池设计）
- 当前 `poolUsd` = **$70,528,020**（LPVault `0xD584270bbC25E0948103da1e1865AA523a1BAe6c`，2026-08-19 由 $50.43M 增资 +$20M，见 §十一）

### 6.3 瓶颈变化（改造前 → 改造后）

**改造前（截至 2026-08-05 之前）**：池子 $50M，两个比例上限都是 0.30 → 各给出 **$15M** 空间；但 `MAX_OPEN_INTEREST` 只有 **$114,600 ~ $3.4M**（当初按「GMX Arbitrum 链上 maxOI × 0.30」推的，GMX 那边本来就小，部分资产还是风控占位数）。结果 **22/24 个市场的 Available Liquidity 完全由 `MAX_OPEN_INTEREST` 决定，跟 LP 池多大无关** —— 池子加到 $500M 也不会变；只有 BTC / ETH 是比例上限在卡。而且 BTC $20M + ETH $15M 就吃掉了全场 $52.4M 容量的 67%。
**改造后（2026-08-05）**：`MAX_OPEN_INTEREST` 按 LP=$100M 反推、比例上限按当前池生效，链上实测 **24/24 个市场的瓶颈都是 `maxOIFactor`** —— 即容量随 LP 自动伸缩，加 LP 就是加 Available Liquidity，不用改任何参数。
**再简化（2026-08-06，当前）**，分两步：
1. 既然 24/24 都由比例上限决定，绝对上限就没有存在意义了 —— 全场 `MAX_OPEN_INTEREST` 统一写成 **$100M/侧**，彻底退出决策。**今日容量数字不变**，换来的是少一层要对齐的参数。
2. 再把 `MAX_OPEN_INTEREST_FACTOR` 也统一写成 **1.0/侧**，让单侧比例上限同样失效，于是只剩 `RESERVE_FACTOR` 一个上限在管。**这一步让每侧可开额度翻倍**（T1 $9.0M → $18.0M/侧），代价是撤掉了单侧闸门 —— 见 §6.6 的 ⚠️。

|  | 改造前 | 改造后 |
|---|---|---|
| Σ 每侧有效容量 | $52,372,553 | $73,779,407 |
| 等效 Σ RESERVE_FACTOR | 2.09 | **2.95**（当时预算 ≤3；2026-08-19 因 ETH 上调至 **3.09**，见 §十一） |
| 瓶颈 | `MAX_OPEN_INTEREST` × 22 个 | `maxOIFactor` × 24 个 |
| BTC+ETH 占比 | 67% | 24% |

### 6.4 风控规范里 RESERVE_FACTOR 的口径（别搞错）

依据 [储备金与风控体系改造规范](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/superpowers/specs/2026-06-12-reserve-risk-control-implementation-spec.md) §二/§四：
- `RESERVE_FACTOR` 是**每个市场各自**的上限，**不是所有市场加总 ≤ 3**。建议值 **1.0~1.5 起步，成熟后可逐市场调到 3.0**。
- 口径是**多空合计**名义 OI / poolUsd，与方向无关；单边极端集中由 per-side `MAX_OPEN_INTEREST` 兜底，两者互补独立。
- 规范明确写了 **`RESERVE_FACTOR > 1` 是安全的** —— 合计名义超过池子不等于 LP 欠钱，真实义务由三层全局控制：ADL 触发 `Σnet/pool ≥ 0.75`、LP 提款封锁 `0.65`、结算 PnL 硬顶 `TRADERS 0.90`。⚠️ 这是**规范原文的建议值**；链上三层均已生效，但 2026-08-07 已按提案 B 整体下压为 **ADL 触发 0.55 / 提款封锁 0.50 / 结算硬顶 0.60**（另有 ADL 后目标 0.45），理由与代价见 §10.4。
- ⚠️ **当前链上是 0.30，比规范建议的起步值低 3~5 倍**。

### 6.5 参数表（定稿）

按 HL OI 降序。「现 Available/侧」是 2026-08-05 改造**前**的值，留作对照。`MAX_OPEN_INTEREST` 自 2026-08-06 起**全场统一 $100M**（刻意惰性，见 §6.6），容量由 `RESERVE_FACTOR` 单独决定。

| market | 资产 | 层 | HL OI（分层依据） | 改造前 Available/侧 | **`MAX_OPEN_INTEREST`/侧**<br>(全场统一，惰性) | `maxOIFactor`<br>(全场 1.0，惰性) | `RESERVE_FACTOR` | 单仓上限 | 今日可开/侧<br>(=RF×$50M) | 开/平仓费 |
|--:|---|:-:|---:|---:|---:|---:|---:|---:|---:|:-:|
| 1 | **BTC** | T1 | $2,267,944,328 | $20,001,429 | **$100,000,000** | 1.000 | 0.36 | $1,800,000 | $25,390,087 | 0.0500% |
| 2 | **ETH** | T1 | $1,841,210,277 | $15,001,072 | **$100,000,000** | 1.000 | 0.50 | $1,800,000 | $35,264,010 | 0.0500% |
| 4 | **HYPE** | T1 | $1,241,699,493 | $1,331,560 | **$100,000,000** | 1.000 | 0.36 | $1,800,000 | $25,390,087 | 0.0750% |
| 5 | **SOL** | T2 | $299,035,002 | $2,915,156 | **$100,000,000** | 1.000 | 0.16 | $800,000 | $11,284,483 | 0.0750% |
| 7 | **ZEC** | T2 | $201,710,388 | $500,000 | **$100,000,000** | 1.000 | 0.16 | $800,000 | $11,284,483 | 0.0750% |
| 22 | **PUMP** | T3 | $74,153,977 | $300,000 | **$100,000,000** | 1.000 | 0.10 | $500,000 | $7,052,802 | 0.0750% |
| 17 | **XRP** | T3 | $72,466,946 | $3,401,100 | **$100,000,000** | 1.000 | 0.10 | $500,000 | $7,052,802 | 0.0750% |
| 21 | **AAVE** | T3 | $63,856,760 | $411,300 | **$100,000,000** | 1.000 | 0.10 | $500,000 | $7,052,802 | 0.0750% |
| 12 | **NEAR** | T3 | $47,160,823 | $360,600 | **$100,000,000** | 1.000 | 0.10 | $500,000 | $7,052,802 | 0.0750% |
| 9 | **LINK** | T3 | $37,134,048 | $2,685,000 | **$100,000,000** | 1.000 | 0.10 | $500,000 | $7,052,802 | 0.0750% |
| 23 | **BNB** | T3 | $32,030,251 | $840,900 | **$100,000,000** | 1.000 | 0.10 | $500,000 | $7,052,802 | 0.0750% |
| 25 | **ADA** | T3 | $31,754,678 | $500,000 | **$100,000,000** | 1.000 | 0.10 | $500,000 | $7,052,802 | 0.0750% |
| 24 | **XMR** | T3 | $30,711,509 | $500,000 | **$100,000,000** | 1.000 | 0.10 | $500,000 | $7,052,802 | 0.0750% |
| 6 | **WLD** | T3 | $27,400,811 | $180,600 | **$100,000,000** | 1.000 | 0.10 | $500,000 | $7,052,802 | 0.0750% |
| 26 | **DOGE** | T3 | $23,588,120 | $500,000 | **$100,000,000** | 1.000 | 0.10 | $500,000 | $7,052,802 | 0.0750% |
| 10 | **SUI** | T3 | $23,487,934 | $1,027,500 | **$100,000,000** | 1.000 | 0.10 | $500,000 | $7,052,802 | 0.0750% |
| 14 | **ENA** | T3 | $22,634,353 | $148,125 | **$100,000,000** | 1.000 | 0.10 | $500,000 | $7,052,802 | 0.0750% |
| 8 | **VVV** | T4 | $15,073,763 | $401,712 | **$100,000,000** | 1.000 | 0.05 | $250,000 | $3,526,401 | 0.0750% |
| 16 | **ONDO** | T4 | $11,855,384 | $183,600 | **$100,000,000** | 1.000 | 0.05 | $250,000 | $3,526,401 | 0.0750% |
| 11 | **AERO** | T4 | $7,608,126 | $170,100 | **$100,000,000** | 1.000 | 0.05 | $250,000 | $3,526,401 | 0.0750% |
| 13 | **XLM** | T4 | $6,754,564 | $399,900 | **$100,000,000** | 1.000 | 0.05 | $250,000 | $3,526,401 | 0.0750% |
| 18 | **ARB** | T4 | $4,444,144 | $204,900 | **$100,000,000** | 1.000 | 0.05 | $250,000 | $3,526,401 | 0.0750% |
| 15 | **TIA** | T4 | $1,917,082 | $114,600 | **$100,000,000** | 1.000 | 0.05 | $250,000 | $3,526,401 | 0.0750% |
| 20 | **TON** | T4 | $0 | $293,400 | **$100,000,000** | 1.000 | 0.05 | $250,000 | $3,526,401 | 0.0750% |

### 6.6 方案设计

### 只留一个旋钮：容量 = `RESERVE_FACTOR` × 池子（2026-08-06 简化）

三个上限取最小，谁小谁生效。**现在刻意让绝对上限永远不生效**，这样"能开多少"只由一个参数决定：

| 参数 | 取值 | 角色 |
|---|---|---|
| `RESERVE_FACTOR` | 分层 + 逐市场覆盖，Σ = **3.09**（⚠️ 超出自定 ≤3，已显式接受，见 §11.1） | **唯一生效的上限**（多空合计） |
| `MAX_OPEN_INTEREST_FACTOR` | **全场 1.0/侧** | 惰性。1.0 = 整个池子/侧，永远大于 RF × pool，所以单侧永不触顶 |
| `MAX_OPEN_INTEREST` | **全场 $100M/侧** | 惰性。fac 1.0 下要等池子涨到 **$100M** 才可能生效，而那时 RF × pool 仍然更小 |

于是运营口径变成一句话：**额度不够就加 LP，不动任何参数。** 容量随池子线性伸缩，LP 提款时也自动收紧。
⚠️ **`MAX_OPEN_INTEREST_FACTOR` = 1.0 等于撤掉了单侧闸门。** 它原本是 RF/2，把每个方向各限制在市场储备的一半；现在**单个方向可以独占该市场的全部 RF 额度**（多空共享一个池子额度，一边吃满另一边就为 0）。最坏情况下全场单向名义敞口从 ~1.48× 池子升到 **~2.95× 池子（= Σ RF）**。剩下的兜底全在全局层、不在单市场层，共三层，2026-08-07 起为：ADL 触发 `Σnet/pool ≥ 0.55`、LP 提款封锁 `0.50`、结算 PnL 硬顶 `TRADERS 0.60`（旧值 0.75 / 0.65 / 0.90，下压理由见 §10.4）。⚠️ 撤闸门当天（2026-08-06）第三层其实还是 100%（= 不打折），是事后核对 GMX 时发现并补配的 —— 撤闸门与补配之间存在一个只有两层兜底的窗口，见 §9.7。这是为公测体验做的明确取舍。
⚠️ 两次调整的效果不同，别混淆：把 `MAX_OPEN_INTEREST` 抬到 $100M **不改变**任何一个市场今天的额度（瓶颈本来就是 fac，§6.3）；把 `maxOIFactor` 抬到 1.0 才是真正**让每侧额度翻倍**的那一步（T1 $9.0M → $18.0M/侧，其余同比例）。
⚠️ `MAX_OPEN_INTEREST = 0` **不等于"无限制"**，它会挡掉该市场所有开仓 —— 软下架正是这么做的（见 §五 / `setMarketDisabled.ts`）。所以"惰性"必须用一个大数表达，不能写 0。
⚠️ 单仓上限 `MAX_POSITION_SIZE_USD` 是**绝对美元值、不随池子伸缩**，所以它仍需分层显式配置（当前 = 各层今日有效容量的 20%：T1 $1.8M / T2 $800k / T3 $500k / T4 $250k）。池子规模变化较大时要回来重估这一项。

### 预算约束：Σ RESERVE_FACTOR ≤ 3

你定的口径是**所有市场 RF 加总 ≤ 3**（比规范的"每市场各自 ≤3.0"保守）。等价于：

```plain text
Σ(每侧 MAX_OPEN_INTEREST) ≤ 1.5 × 反推基准 LP = 1.5 × $100M = $150,000,000
```

**定稿时 Σ RESERVE_FACTOR = 2.95 ≤ 3** ✅ ——⚠️ 2026-08-19 ETH 由 36% 上调到 50% 后 **Σ = 3.09，已不再满足 ≤3**，属显式接受的偏离，见 §11.1。

### 四层划分（按 HL OI 的实际断层）

| 层 | HL OI 区间 | 资产 | 个数 | `RESERVE_FACTOR` | RF 小计 | 今日可开/侧<br>(=RF×池子) | 单仓上限 | `MAX_OI`/侧 | `maxOIFactor` |
|---|---|---|---|---|---|---|---|---|---|
| **T1** | ≥ $1B | BTC、ETH、**HYPE** | 3 | 0.36 | 1.08 | $18,001,286 | $1,800,000 | $100M（惰性） | 1.0（惰性） |
| **T2** | $100M ~ $1B | SOL、ZEC | 2 | 0.16 | 0.32 | $8,000,572 | $800,000 | $100M（惰性） | 1.0（惰性） |
| **T3** | $20M ~ $100M | PUMP、XRP、AAVE、NEAR、LINK、BNB、ADA、XMR、WLD、DOGE、SUI、ENA | 12 | 0.10 | 1.20 | $5,000,357 | $500,000 | $100M（惰性） | 1.0（惰性） |
| **T4** | < $20M | VVV、ONDO、AERO、XLM、ARB、TIA、TON | 7 | 0.05 | 0.35 | $2,500,179 | $250,000 | $100M（惰性） | 1.0（惰性） |

**全场名义 OI 上限 = Σ RF × 池子 = 3.09 × $70,528,020 ≈ $217,931,582**（2026-08-19 口径）；单个市场空仓时任一侧最多可开 RF × 池子（多空共享）。作为对照，2026-08-05 改造前全场每侧合计仅 $52,372,553（等效 ΣRF 2.09）。
**HYPE 升进 T1**：它的 HL OI $1.24B 比 SOL($299M) 还高，之前和 ENA 同层不合理。

### 单仓上限：绝对值，不随池子伸缩

`maxPositionSizeUsd` 是**绝对美元值**，所以必须按层显式配，不能像其他上限那样交给比例自动伸缩。当前值（T1 $1.8M / T2 $800K / T3 $500K / T4 $250K）是按 2026-08-05 那次口径「今日容量 × 20%」定的；8/06 撤掉单侧闸门后每侧容量翻倍，它相对收紧到 **10%** —— 属于偏保守的方向，本次未动。池子规模大变、或想让单个账户占更大份额时再回来调。

### ⚠️ 4 个市场今日容量会下调

预算固定下腾挪必然有降的。这 4 个的现有额度来自「GMX Arbitrum maxOI × 0.30」，是 GMX 那边的定价，不代表这些资产的真实流动性：

| 资产 | 现 Available/侧 | 今日有效/侧 | 变化 |
|---|---|---|---|
| BTC | $20,001,429 | $9,000,643 | ↓55% |
| ETH | $15,001,072 | $9,000,643 | ↓40% |
| XRP | $3,401,100 | $2,500,000 | ↓26% |
| LINK | $2,685,000 | $2,500,000 | ↓7% |

**下调是安全的**：`validateOpenInterest` 只在**增仓**时校验，调低上限不影响已有仓位、不触发清算，只是不能再往上加。BTC 当前仅 1 个多头仓位（$64K），远低于新上限。
其余 20 个全部上调，长尾涨幅最大：ENA ×16.9、WLD ×13.8、TIA ×10.9、AERO ×7.4、HYPE ×6.8、ZEC ×8.0。

### 想再调的方向

- **想整体放大**：加 LP。这是本方案最省事的旋钮 —— $50M → $100M 期间容量线性跟涨，一个参数都不用动。
- **想让长尾更宽**：压 T1。T1 从 $18M 降到 $12M 可释放 0.36 RF，够把 T4 从 $2.5M 提到 $5M。
- **想突破 $100M 天花板**：那时再统一上调 `MAX_OPEN_INTEREST`（届时 ΣRF ≤ 3 的预算基准也要跟着改）。

### 6.7 落地记录与复现方式

**执行脚本**：`fx100-apps/apps/fx-base-app/scripts/tenderly/setMarketCapacity.ts`
分层与反推基准都写在脚本顶部常量里（`REFERENCE_POOL_USD = 100_000_000`、`TOTAL_RF_BUDGET = 3.0`、`TIER_MAX_OI`、`TIERS`），跑之前会**先校验 Σ RESERVE_FACTOR 是否超预算**，超了直接退出；已下架的市场（LIT/19）自动跳过，MSOL/3 不在管理范围。

```shell
cd fx100-apps/apps/fx-base-app
DRY_RUN=1 RPC_URL=<rpc> npx tsx scripts/tenderly/setMarketCapacity.ts        # 打印逐市场计划
RPC_URL=<rpc> SIGNER_PRIVATE_KEY=0x... npx tsx scripts/tenderly/setMarketCapacity.ts
RPC_URL=<rpc> npx tsx scripts/tenderly/verifyTop20Markets.ts                 # 复核
MARKETS=1,2 ...                                                              # 只改部分市场
```

**部署模板已同步**（不改的话下次全新部署会退回旧值 —— 手续费和 BTC 清算线都栽过这个坑）：

| 文件 | 改动 |
|---|---|
| `scripts/parameters/market.sample.json` | WBTC / ETH 的 `GlobalCapUSD` / `SinglePosCapUSD` / `ReserveFactor` |
| `scripts/parameters/markets-top20.draft.json` | 20 个市场同名字段 |
| `scripts/parameters/markets-batch2.draft.json` | 6 个市场同名字段 |
| `fx100-apps/.../scripts/tenderly/createTop20Markets.ts` | `ASSETS` 数组 23 个资产的 `reserveFactor` / `globalCapUSD` / `singlePosCapUSD` |

> 模板字段对应关系：`GlobalCapUSD` = **每侧**的 `MAX_OPEN_INTEREST`（多空各写一份到链上），`SinglePosCapUSD` = `MAX_POSITION_SIZE_USD`，`ReserveFactor` = `RESERVE_FACTOR`（多空合计口径）。  🔴 **`maxOIFactor = ReserveFactor / 2`，两者不是同一个数** —— 前者是每侧、后者是多空合计。`createTop20Markets.ts` 原先把 `reserveFactor` 同值写给了 `maxOIFactor`，等于把单边比例上限放松了一倍；已于 2026-08-05 改成 `rf / 2n` 并加了注释锁住这个不变式。新建市场只需在模板里配 `ReserveFactor`，`maxOIFactor` 自动推导。

---

## 七、Funding 参数

> **版本说明**：以下公式已与链上实际运行的 **v0.3.1**（`origin/release/v0.3.1`）逐行核对，与本地 `src/`（v0.3.2）在这部分**完全一致** —— 4 个键、clamp 逻辑、floor 只加多头侧、EMA `sampleInterval` 硬编码 3600 秒，两版相同。  唯一差异：v0.3.2 新增了 `MarketUtils.settleFundingFees`，并从 `IncreasePositionUtils` / `DecreasePositionCollateralUtils` 调用；**v0.3.1 里这个函数不存在**。v0.3.1 的资金费是通过 `negativeFundingFeePerSizeDelta` / `positiveFundingFeePerSize` 这套 per-size 指数在增/减仓时结算的。这项新增改动了什么、是否与已跟踪的 R3-B03 相关，需要在 `src/` 同步到 v0.3.2 后专门补一轮 funding 全链路账务回归测试来确认 —— 本文不对其影响下结论。

链上只有 **4 个可配置键**，全部 per-market（不分多空）、`int256`、**FLOAT_PRECISION 1e30 且单位是「每秒」**。下表的年化是 `值 / 1e30 × 31,536,000 × 100%` 换算出来的，链上存的不是年化。

### 7.1 计算公式（`MarketUtils.sol:505-538`）

```plain text
skew        = 多空失衡度的 EMA（WEI_PRECISION 1e18 = 100% skew）
f_long      = clamp( fundingFloorFactor + fundingBaseFactor × skew / 1e18,
                     minFundingFactorPerSecond, maxFundingFactorPerSecond )
f_short     = clamp(                    − fundingBaseFactor × skew / 1e18,
                     minFundingFactorPerSecond, maxFundingFactorPerSecond )
long delta  = f_long  × longOpenInterest  × dt
short delta = f_short × shortOpenInterest × dt
lp delta    = long delta + short delta
```

要点：**floor 只加在多头侧**（`f_short` 没有 floor 项），所以多空失衡为 0 时多头仍在按 floor 付资金费、空头为 0 —— 这是"多头长期净付费给 LP"的设计。

### 7.2 链上现值（年化）

| 参数 | 链上键 | BTC | 其余 23 个（ETH 基线） | 含义 |
|---|---|---|---|---|
| Floor | `FUNDING_FLOOR_FACTOR` | **10.95%** | **10.95%** | 多头侧的资金费地板 |
| Base | `FUNDING_BASE_FACTOR` | **134.5723%** | **142.7897%** | 失衡斜率：skew 每 100% 贡献这么多年化 |
| 下限 | `MIN_FUNDING_FACTOR_PER_SECOND` | **−13.3940%** | **−27.5075%** | 允许负资金费（收费方向反转） |
| 上限 | `MAX_FUNDING_FACTOR_PER_SECOND` | **96.5221%** | **111.3878%** |  |

只有 BTC 一套自己的值，**其余 23 个（含 ETH 本身）全部是 ETH 基线** —— 即不反映各资产真实流动性差异，这是已知的「B 类参数照抄 ETH」遗留项。

### 7.3 ⚠️ 参数模板里有 3 个字段没有链上对应

| 模板字段 | 状况 |
|---|---|
| `FundingSkewEmaMinutes: 30` | **无链上键**。EMA 的 `sampleInterval` 在合约里**硬编码 3600 秒**（`MarketUtils.sol:507`），改这个 JSON 字段不产生任何效果，且实际值是 60 分钟而非 30 |
| `FundingFloorAPR_Emergency` / `FundingBaseAPR_Emergency` | **无链上键**。链上每个市场只有一套 floor/base，没有"应急档"；要切换只能人工改同一个键 |
| `THRESHOLD_FOR_STABLE_FUNDING` / `THRESHOLD_FOR_DECREASE_FUNDING` | 链上**有键但无任何逻辑读取**，只出现在 `Config.sol:425-426` 的白名单里（GMX 血统残留） |

---

## 八、Dynamic Spread 参数

### 8.1 ⚠️ 先看版本：链上是 v0.3.1，本地 `src/` 是 v0.3.2

**这两个版本的动态价差逻辑不一样，解释链上行为必须用 `origin/release/v0.3.1` 的源码，不能用本地工作区。**

|  | v0.3.1（链上实际运行） | v0.3.2（本地 `src/`，未部署） |
|---|---|---|
| 返回类型 | `uint256` | `int256` |
| 下限 | 硬编码：总和 ≤ 0 就返回 0 | 可配置 `MIN_DYNAMIC_SPREAD`，且支持负点差（`allowNegativeSpread`） |
| 上限 | **无总上限**（只有价格冲击分量受全局 `MAX_PRICE_IMPACT_SPREAD` 限制） | 可配置 `MAX_DYNAMIC_SPREAD` |
| `MIN/MAX_DYNAMIC_SPREAD` 键 | **FX100Keys 里不存在** | 新增 |

🔴 **v0.3.2 升级阻塞项**：新版是 `clamp(spread, minDynamicSpread, maxDynamicSpread)`，而 `Calc.clamp(x, 0, 0) = 0` 且**没有"0 视为不限制"的兜底**。这两个键当前链上都是 0（因为 v0.3.1 不用它们）。**如果直接把 v0.3.2 部署上去而不配置这两个键，全场点差会立刻变成 0**（固定价差、价格冲击、skew 冲击全部被抹平，成交价 = oracle 价）。升级前必须先配 `MAX_DYNAMIC_SPREAD`（例如 1% = `1e16`）。这与 `docs/analysis/pricing/risk_dynamic_spread_floor_removal.md` 里分析的「零配置陷阱」是同一件事。

### 8.2 计算公式（v0.3.1，链上实际）

```plain text
dynamicSpread = skewImpact + constantPriceSpread + priceImpactSpread
                若总和 ≤ 0 → 返回 0（只有下限 0，没有总上限）

priceImpactSpread = min(
    max( exp(orderSize × priceImpactParameter / depth) − 1e18,  orderSize × 1e18 / depth ) / 100,
    MAX_PRICE_IMPACT_SPREAD          ← 全局单键，当前 0.5%
)
depth = 买卖方向对应的 ask 或 bid 深度
若 depth == 0 或 priceImpactParameter == 0 → priceImpactSpread = 0（防除零）

skewImpact = clamp( skewImpactFactor × skewRef / 1e18, minSkewImpact, maxSkewImpact )
             若这笔单**改善**了多空平衡 → 取负（即给点差折扣）

成交价：多头 = indexPrice.max × (1e18 + dynamicSpread) / 1e18
        空头 = indexPrice.min × (1e18 − dynamicSpread) / 1e18      （PositionUtils.sol:629-642）
```

**链上实测**（部署的 `Reader.getExecutionPrice`，用链上真实 recorded price；`u = 订单额 / ask深度`）：

| u | BTC 订单额 | BTC 总点差 | = 固定 + 价格冲击 + skew | TIA 订单额 | TIA 总点差 | = 固定 + 价格冲击 + skew |
|---|---|---|---|---|---|---|
| 0.1 | $1,559,328 | 0.3380% | 0.01 + 0.100 + 0.228 | $792,396 | 0.1933% | 0.01 + 0.100 + 0.083 |
| 0.3 | $4,677,985 | 0.6637% | 0.01 + 0.300 + 0.354 | $2,377,188 | 0.4178% | 0.01 + 0.300 + 0.108 |
| 0.5 | $7,796,641 | 0.9156% | 0.01 + **0.500**⌈ + 0.406 | $3,961,981 | 0.6246% | 0.01 + **0.500**⌈ + 0.115 |
| 1.0 | $15,593,282 | 0.9685% | 0.01 + **0.500**⌈ + 0.459 | $7,923,961 | 0.6304% | 0.01 + **0.500**⌈ + 0.120 |
| 3.0 | $46,779,846 | **1.0100%** | 0.01 + **0.500**⌈ + **0.500**⌈ | $23,771,883 | **0.6345%** | 0.01 + **0.500**⌈ + 0.125 |

⌈ = 触及上限。分解与公式**逐项吻合**：
- 极限情况 BTC = `0.01%(固定) + 0.5%(MAX_PRICE_IMPACT_SPREAD) + 0.5%(maxSkewImpact)` = **1.01%**，与实测一致
- TIA 的 skew 收敛到 `skewImpactFactor 0.0025 × skewRef 50% = 0.125%`，与实测 0.1245% 一致（`skewRef` 是「变动前后绝对失衡率的均值」，单边吃满时 → (0% + 100%)/2 = 50%）
- **总点差没有上限** —— 1.01% 超过任何单一分量的上限，印证 v0.3.1 只有下限 0、没有 clamp

### 8.3 🔴 `PRICE_IMPACT_PARAMETER` 当前完全不起作用

公式里 `priceImpactParameter` **只出现在 exp 那一支**：

```plain text
priceImpactSpread = min( max( exp(param × u) − 1,  u ) / 100,  MAX_PRICE_IMPACT_SPREAD )
                              └── 含 param ──┘   └ 不含 param ┘
```

- **方向是正比**：param 越大 → 指数项越大 → 点差越大
- **但 `param < 1` 时指数项永远输给线性项**：`exp(param·u) − 1 > u` 需要 u ≳ 1.6（param=0.6）或 u ≳ 2.55（param=0.5）；而线性项在 u = 0.5 时就已经等于 0.5% 撞上 `MAX_PRICE_IMPACT_SPREAD` 封顶了。也就是说指数项能赢的区间**早已被上限盖住**。
- 实测印证：u ≤ 0.5 时价格冲击分量精确等于线性项 `u/100`（表中 0.100% / 0.300%），BTC(param 0.5) 与 TIA(param 0.6) 没有任何差别
**结论：只要 `priceImpactParameter ≤ 1` 且 `MAX_PRICE_IMPACT_SPREAD = 0.5%`，这个参数对任何订单都没有影响**，价格冲击实际就是 `min(订单额 / 深度 / 100, 0.5%)`。要让它真正生效，得把 param 配成 > 1（例如 3~5）或放宽 `MAX_PRICE_IMPACT_SPREAD`。

### 8.4 ✅ `SKEW_IMPACT_FACTOR` 已统一为 0.0025（2026-08-06 修正）

`skewImpact = clamp(skewImpactFactor × skewRef / 1e18, minSkewImpact, maxSkewImpact)`，**正比** —— 系数越大，同样的失衡算出的点差越大。所以按「大资产滑点低」的市场规律，BTC/ETH 不该比小资产更贵。
**改之前是反的**：BTC = 0.01，其余 23 个（含 ETH）= 0.0025，即 BTC 对同样失衡收 **4 倍** skew 点差，且在失衡 50% 时就撞上 ±0.5% 上限。这两个值在 [top20 部署记录](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/superpowers/specs/2026-07-31-top20-markets-fork-deployment.md) §D 里标注为「B 类占位」—— BTC 拿了 BTC 样例值、其余全拿 ETH 样例值，从未按资产设计过。
**已全场统一为 0.0025**（只有 BTC 需要改，tx `0x53288f7d…`）。链上实测对比：

| u = 订单额/深度 | BTC 改前 | BTC 改后 | TIA（未变） |
|---|---|---|---|
| 0.1 | 0.3380% | **0.1670%** | 0.1933% |
| 0.3 | 0.6637% | **0.3984%** | 0.4178% |
| 0.5 | 0.9156% | **0.6114%** | 0.6246% |
| 3.0 | 1.0100% | **0.6360%** | 0.6345% |

方向现在对了：**同样的相对单量下 BTC 比 TIA 更便宜**（0.1670% vs 0.1933%），而且因为 BTC 深度是其余市场的 2 倍，同样**美元金额**下差距更大。
两个副作用：
- 全场满失衡的 skew 点差都是 `0.0025 × 50% = 0.125%`，**`min/maxSkewImpact`（±0.5%）从此永不触及**，退化为纯保险
- 极限总点差从 BTC 的 1.01% 降到 ~0.635%（= 0.01% 固定 + 0.5% 价格冲击上限 + 0.125% skew），全场一致

> 这是为公测体验做的简化选择，不是"最终风控口径"。若将来要按流动性分层（大资产更小的系数），与杠杆分层一并交风控定档。

### 8.5 链上现值

| 参数 | 链上键 | 维度 | 精度 | BTC | 其余 23 个 |
|---|---|---|---|---|---|
| 固定价差 | `CONSTANT_PRICE_SPREAD` | per-market | 1e18 = 100% | 0.01% | 0.01% |
| 买盘深度 | `BID_ORDER_BOOK_DEPTH` | per-market | 1e30 USD | $15,217,320 | $7,767,179 |
| 卖盘深度 | `ASK_ORDER_BOOK_DEPTH` | per-market | 1e30 USD | $15,593,282 | $7,923,961 |
| 价格冲击系数 | `PRICE_IMPACT_PARAMETER` | per-market | **1e18 = 1** | 0.5 | 0.6 |
| Skew 系数 | `SKEW_IMPACT_FACTOR` | per-market | **1e18 = 1** | 0.0025 | 0.0025 |
| Skew 下限 | `MIN_SKEW_IMPACT` | per-market | 1e18 = 100% | −0.5% | −0.5% |
| Skew 上限 | `MAX_SKEW_IMPACT` | per-market | 1e18 = 100% | +0.5% | +0.5% |
| 价差下限 | `MIN_DYNAMIC_SPREAD` | per-market **× 多空** | 1e18 = 100% | 0 | 0 |
| 价差上限 | `MAX_DYNAMIC_SPREAD` | per-market **× 多空** | 1e18 = 100% | 0 | 0 |

> 最后两个键 **v0.3.1 不读取**（`FX100Keys` 里都没这两个常量），所以链上为 0 不影响当前行为。它们是 v0.3.2 新增的，升级前必须配置 —— 见 §8.1。

| 价格冲击上限 | `MAX_PRICE_IMPACT_SPREAD` | **全局单键** | 1e18 = 100% | 0.5% | 0.5% |
|---|---|---|---|---|---|

### 8.6 ⚠️ 精度有三种刻度，混用会差 12 个数量级

| 刻度 | 代表 100% 的值 | 用这个刻度的参数 |
|---|---|---|
| FLOAT_PRECISION | `1e30` | `POSITION_FEE_FACTOR`、`RESERVE_FACTOR`、`MAX_OPEN_INTEREST`、4 个 funding 键（每秒）、`MIN_COLLATERAL_FACTOR` |
| WEI_PRECISION（比例） | `1e18` | `CONSTANT_PRICE_SPREAD`、`MIN/MAX_DYNAMIC_SPREAD`、`MIN/MAX_SKEW_IMPACT`、`MAX_PRICE_IMPACT_SPREAD` |
| WEI_PRECISION（倍数） | `1e18` = **1**（不是 100%） | `PRICE_IMPACT_PARAMETER`、`SKEW_IMPACT_FACTOR` |

订单簿深度是 **1e30 USD 绝对值**，不是比例。

### 8.7 模板里同样有无链上对应的字段

`minOrderbookDepthLong/Short`、`maxOrderbookDepthLong/Short`（链上每侧只有一个深度值，没有区间）、`PriceImpactParameter_Emergency`、`Skew_k_emergency`、`PI_Clamp_Min/Max`（链上对应的是全局 `MAX_PRICE_IMPACT_SPREAD`，不是 per-market 区间）、`LP_NAV` / `RiskThreshold` / `TargetRiskRatio`（离线风控模型输入，不写链）。

## 九、GMX 参数参考（用于决策对标）

### 9.1 数据来源

**全部数值为链上实读，非配置文件。** GMX 的 `config/markets.ts` 只是部署脚本的期望值，与链上可能漂移，不能当事实引用。

| 链 | Arbitrum One（GMX v2 主战场） |
|---|---|
| DataStore | `0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8` |
| Reader | `0x65A6CC451BAfF7e7B4FDAb4157763aB4b6b44D0E` |
| 市场总数 | **136 个**（`Reader.getMarkets` 枚举，含 6 个纯 swap 池） |
| 读取日期 | 2026-08-06 |
| 精度 | 与 FX100 相同，FLOAT_PRECISION = `1e30`；funding/borrowing 是**每秒**值，本节折年化按 31,536,000 秒 |
| 取样市场 | 逐市场明细取 **BTC/USD [WBTC-USDC] `0x47c03123…`** 与 **ETH/USD [WETH-USDC] `0x70d95587…`**，即与 FX100 的 market 1 / 2 同资产同抵押结构 |

复现方式：`cast call <DataStore> 'getUint(bytes32)(uint256)' <key>`，key = `keccak256(abi.encode("NAME", market, isLong))`。⚠️ GMX 的键第二个参数是 **market token 地址**，FX100 是 **marketIndex（uint256）**，两边键不通用。

### 9.2 清算费：GMX 分三档，FX100 全场一档

清算费公式两边**逐行相同**（FX100 从 GMX fork）：`liquidationFeeUsd = sizeInUsd × LIQUIDATION_FEE_FACTOR`，只在清算路径收，`factor = 0` 即不收。所以数字可直接对比。

| 清算费 | GMX 市场数 | 是哪一类 |
|---|---|---|
| **0.20%** | 17 | **抵押品是真实代币的主流永续**：BTC/USDC、ETH/USDC、SOL/USDC、LINK/USDC、UNI、ARB、BNB、AAVE、AVAX、OP、GMX、PEPE、WIF、APE、PENDLE、ANIME、ETH[wstETH-USDe] |
| **0.30%** | 110 | 合成市场（index token 是占位地址、抵押 WETH-USDC）+ 单币市场（BTC-BTC、WETH-WETH、SOL-SOL） |
| **0.45%** | 2 | TRUMP、MELANIA |
| **0** | 6 | index token = `0x0` 的纯 swap 池（USDC-USDT / USDC-DAI / wstETH-WETH / USDe-USDC 等），无仓位故不收；另有 1 个未配置市场 |

### 9.2.1 FX100 现有 24 个上线资产，在 GMX 分别落在哪一档（链上逐一实测，2026-08-12）

不能只按"名字在不在 17 个真实抵押名单里"去推断，逐一在 GMX v2（Arbitrum One）链上核实过：`Reader.getMarkets` 枚举全部 136 个市场 → 匹配对应资产的市场 → `DataStore.getUint(liquidationFeeFactorKey(marketToken))` 实测数值。方法与结果见下。

| 档位 | FX100 资产（24 个全覆盖） | 个数 |
|---|---|---|
| **GMX 0.20%**（抵押品是真实代币的主流永续） | BTC、ETH、SOL、LINK、ARB、BNB、AAVE | 7 |
| **GMX 0.30%**（合成市场：index token 是占位地址，抵押实为 WETH-USDC 或 WBTC-USDC） | HYPE、WLD、ZEC、VVV、SUI、AERO、NEAR、XLM、ENA、TIA、ONDO、XRP、TON、PUMP、XMR、ADA、DOGE | 17 |

即 **FX100 24 个上线资产里，只有 7 个（29%）在 GMX 属于"真实抵押主流永续"档；其余 17 个（71%）即使放到 GMX 上，本来也是 0.30% 的合成市场档，与 FX100 现在的 0.30%（全场一档）正好一致，不存在"FX100 比 GMX 贵"的问题**。差异只存在于这 7 个真实抵押资产上（GMX 0.20% vs FX100 0.30%），下面 §9.2 的同资产对比表就是针对这 7 个的口径。
⚠️ **一个值得记录的坑**：核查 ZEC 时，本地 `gmx-synthetics` 仓库的配置文件快照（`config/tokens.ts`/`config/markets.ts`）里完全没有 ZEC 这一项，按配置文件会误判"GMX 没有 ZEC 市场"；但链上实测确实存在一个活跃的 ZEC 市场（`0x587759c2...6E60`），`LIQUIDATION_FEE_FACTOR` 实测 0.30%。GMX 应该是在这份配置快照之后才上线 ZEC 的（与 2026 年隐私币上线潮的时间点吻合）。这正是 §9.1 强调的"配置文件只是期望值、链上才是事实"的又一次印证 —— 本节 24 个资产的分类结论全部以链上 `getUint` 实测值为准，配置文件只用于加速定位候选地址，不作为最终判据。
**同资产同口径对比**（GMX BTC/ETH/SOL/LINK 与 FX100 market 1/2 均为真实代币 index + USDC 抵押）：

| 项 | GMX（链上） | FX100（链上） | 说明 |
|---|---|---|---|
| 开仓线 `minCollateralFactor` | 0.5% | 0.5% | **一致**。GMX 是逐市场覆盖到 0.5%，不是 base 默认的 1% |
| 清算线 `minCollateralFactorForLiquidation` | 0.5% | 0.5% | **一致** |
| **清算费** | **0.20%** | **0.30%** | FX100 是 GMX 同类市场的 1.5 倍，落在 GMX 的合成/单币档 |
| 平仓费 `POSITION_FEE_FACTOR` | 0.04%（改善平衡）/ 0.06%（恶化） | 0.05% / 0.05% | GMX 用双槽做平衡激励；FX100 两槽同值，等于未启用该机制 |
| 清算费给 fee receiver | 37% | **100%**（2026-08-19 起，此前 50%） | 其余进 LP 池 ⇒ GMX 留 63% 给 LP，FX100 **一分不留**。开/平仓费同样是 100%（`POSITION_FEE_RECEIVER_FACTOR`，GMX 为 37%）。见 §三 |
| **被清算总成本** | **0.24% ~ 0.26%** | **0.35%** | 平仓费 + 清算费。⚠️ 这是**交易者付出**的成本，不受 2026-08-19 分配比例调整影响；变的只是这笔钱在 LP 与分账器之间怎么分 |
| 清算线 ÷ 清算费 | 2.5× | 1.67× | 反映被清算用户能留下的残值厚度 |

### 9.3 🔴 容量参数不能直接照抄：GMX 是每市场独立池，FX100 是单一共享池

这是两边最根本的结构差异，不理解它会得出灾难性的结论。

|  | GMX v2 | FX100 |
|---|---|---|
| LP 池 | **每个市场一个独立 GM 池**，互不影响 | **24 个市场共用一个 LPVault** |
| `RESERVE_FACTOR` 键 | per-(market, **isLong**) | per-market（**多空合计**） |
| BTC 实测值 | **3.5 = 350%/侧** | 0.36 = 36% 合计 |
| ETH 实测值 | **2.75 = 275%/侧** | 0.36 = 36% 合计 |
| `OPEN_INTEREST_RESERVE_FACTOR` | BTC 345% / ETH 270%（略低于 RF，先于 RF 拦截开仓） | FX100 未使用该键 |
| `MAX_OPEN_INTEREST` | BTC **$141.7M/侧**、ETH **$91.7M/侧** —— **真在生效的绝对上限** | 全场 $100M/侧，**刻意惰性**（§6.6） |

**GMX 的 350% 之所以安全，是因为它是"该市场自己那个池子"的 350%**，风险被隔离在单个 GM 池内，LP 是自愿选择该市场的风险。FX100 单池共享，任一市场的亏损都由同一批 LP 承担，所以口径必须是 **Σ RESERVE_FACTOR ≤ 3（全场加总）**，而不是逐市场 3.5。**把 GMX 的 350% 搬到 FX100 会让单个市场就吃掉全池 3.5 倍的名义敞口。**
反过来可借鉴的是：GMX 让 `MAX_OPEN_INTEREST` 真正生效（BTC $141.7M），作为独立于池子规模的绝对天花板；FX100 目前把它设成惰性，完全依赖比例上限。

### 9.4 费用结构：GMX 有借贷费，FX100 完全没有

|  | GMX（BTC/ETH 实测） | FX100 |
|---|---|---|
| 借贷费模型 | **拐点利率（kinked）**，`MarketUtils.getKinkBorrowingFactor` | **无借贷费** |
| `OPTIMAL_USAGE_FACTOR` | 85% | — |
| `BASE_BORROWING_FACTOR` | `1.4269e-8`/秒 ≈ **45%/年** | — |
| `ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR` | `2.8539e-8`/秒 ≈ **90%/年** | — |
| `BORROWING_FACTOR`（非拐点旧路径） | `6.25e-9`/秒 ≈ 19.7%/年，**因 optimalUsageFactor ≠ 0 而不生效** | — |

GMX 拐点公式（已核对源码）：`rate/s = usage × baseBorrowingFactor`，当 `usage > optimal` 时再加 `(aboveOptimal − base) × (usage − optimal) / (1 − optimal)`。折年化后：使用率 50% → 22.5%/年；85%（拐点）→ 38.3%/年；100% → **90%/年**。
⚠️ **FX100 v0.3.1 的借贷费是彻底没有的**：`FX100Keys.sol` 里 `BORROWING_FACTOR` / `BASE_BORROWING_FACTOR` 等 9 个键仍在（fork 遗留），但除了 `Config.sol` / `ConfigSyncer.sol` / `ConfigUtils.sol` 的 setter 白名单外，`src/market`、`src/position`、`src/pricing` **没有任何代码读它们**；链上这些键也全为 0。**这是 GMX 的一大块 LP 收入来源，FX100 用资金费 + 手续费替代**。评估 LP 收益率时不能把 GMX 的 APR 直接对标。
**资金费上限对比**（都是每秒值，此处折年化）：

|  | GMX BTC | GMX ETH | FX100 BTC |
|---|---|---|---|
| `MIN_FUNDING_FACTOR_PER_SECOND` | 1.00%/年 | 1.00%/年 | **−13.39%/年**（可为负） |
| `MAX_FUNDING_FACTOR_PER_SECOND` | **16.69%/年** | **17.18%/年** | **96.52%/年** |

FX100 的资金费上限是 GMX 的 **约 5.8 倍**，且允许负值（GMX 下限为正，恒为付出方付费）。这是 FX100「Trader–LP 直接对赌、以资金费替代借贷费」设计的直接结果 —— 但也意味着极端偏斜时用户成本远高于 GMX，是对外沟通时容易被质疑的点。

### 9.5 价格冲击：GMX 幂律，FX100 线性

|  | GMX BTC | GMX ETH | FX100 |
|---|---|---|---|
| `POSITION_IMPACT_FACTOR`（负向/正向） | `1.824e-9` / `1.520e-9` | `1.779e-8` / `1.482e-8` | 不使用该键 |
| `POSITION_IMPACT_EXPONENT_FACTOR` | **1.8143** | **1.6083** | 不使用（FX100 走 `PRICE_IMPACT_PARAMETER` + 订单簿深度） |
| 冲击上限 `MAX_POSITION_IMPACT_FACTOR`（负/正） | 0.5% / 0.4% | 0.5% / 0.4% | `MAX_PRICE_IMPACT_SPREAD` 0.5%（全局） |

GMX 的冲击是**超线性**（指数 1.6~1.8），大单惩罚显著加重；FX100 当前实际行为是**线性** `min(订单额/深度/100, 0.5%)`，因为 `PRICE_IMPACT_PARAMETER < 1` 使 exp 分支永远输给线性项（§8.3）。两边冲击上限恰好都是 0.5%，所以**小单 FX100 更贵、大单 GMX 更贵**。

### 9.6 最小值门槛

|  | GMX | FX100 |
|---|---|---|
| `MIN_COLLATERAL_USD` | **$1** | **$0（未配置）** |
| `MIN_POSITION_SIZE_USD` | **$1** | **$10** |

- FX100 的最小开仓规模是 GMX 的 10 倍。这直接影响执行费豁免的口径讨论（§三）。
- ⚠️ **FX100 的 `MIN_COLLATERAL_USD` 链上是 0，即没有绝对抵押品下限**。该键确实被使用（`PositionUtils.sol:400` 的清算判定、`DecreasePositionUtils.sol:148` 的减仓校验），值为 0 意味着这一层校验恒过，仓位能否存在完全由 `minCollateralFactor`（比例）决定。GMX 配的是 $1。**已评估，决定接受不改 —— 理由与残余风险见 §9.9。**

### 9.7 🔴 顺带查出的两处「文档/规范 与 链上」不一致

核对 GMX 时读了 FX100 的对应键，发现两处此前被当成既有事实引用的兜底并不成立：
1. **ADL 结束目标系数实际是 50%，不是文档里写的 0.77。** v0.3.1 的 ADL 已改成**全局**判定：`MarketUtils.isGlobalNetObligationRatioExceeded:1188` 直接 `dataStore.getUint(pnlFactorType)` 读**裸键**，`AdlUtils.updateAdlState:82` 传入 `MAX_PNL_FACTOR_FOR_ADL`（触发）或 `MIN_PNL_FACTOR_AFTER_ADL`（结束）。链上裸键实测：触发 **75%** ✅、结束 **50%**、LP 提款封锁 `MAX_PNL_FACTOR_FOR_WITHDRAWALS` **65%** ✅。而 markets 4-26 上那些 per-market `MIN_PNL_FACTOR_AFTER_ADL = 0.77` 是**死写**，合约根本不读；BTC/ETH 的 per-market 值为 0 也因此无影响。§三 的「ADL 后最低 PnL 系数 0.77」应理解为 **50%**。
2. ✅ **已修复：`MAX_PNL_FACTOR_FOR_TRADERS` 曾是 100%，规范的 0.90 从未配置。** 它是 per-market 键（`PositionUtils.sol:227` → `MarketUtils.getCappedPnl`），发现时抽样 market 1/2/4/17/26 **全为 100%**，即盈利结算在 PnL 达到池子 100% 前永不打折。**2026-08-06 已逐市场（多空各一份）写入 0.90**，覆盖 25 个未下架市场含 MSOL market 3，共 50 笔写入并读回确认；脚本 `setMaxPnlFactorTraders.ts`。此前把该层当作撤除单侧闸门（§6.6）的兜底之一是不准确的，现已名实相符。GMX 主流市场同为 90%（§9.8）。

### 9.8 PnL 阶梯对照（ADL / 提款 / 结算上限）

GMX 的这组参数全部是 **per-(market, isLong)**，裸键实测为 0 —— 它不使用全局裸键。FX100 v0.3.1 反过来：ADL 两个阈值和提款阈值都是**全局裸键**，只有 traders 上限是 per-market（§9.7）。

|  | traders 结算上限 | ADL 触发 | ADL 后目标 | LP 提款封锁 | 存款封锁 |
|---|---|---|---|---|---|
| **GMX 主流市场**（BTC/ETH 真币抵押、单币） | 90% | 85% | **77%** | 70% | 90% |
| **GMX 合成市场**（110 个，如 DOGE） | 70% | 65% | **60%** | 55% | 70% |
| **FX100**（2026-08-06 起） | **90%** | 75% | **50%** | 65% | 不使用 |

⚠️ **口径不同，数值不能直接比大小**：GMX 的比值是"**单个市场**的池子 PnL ÷ 该市场自己的池子"，风险隔离在单池内；FX100 是"**全场** Σnet ÷ 共享池"。同样的 75%，在 FX100 是全协议级事件，在 GMX 只是某一个市场的事件。

### 🔴 关键差异：两边阶梯的顺序不同，这决定了 ADL 后目标能不能单独改

- **GMX**：`traders 90 > ADL 触发 85 > ADL 后目标 77 > 提款封锁 70`。ADL 跑完拉回到 77%，**仍高于提款线 70%**，所以一轮 ADL 结束后 **LP 依然不能提款**，必须等行情或后续 ADL 继续改善。
- **FX100**：`traders 90 > ADL 触发 75 > 提款封锁 65 > ADL 后目标 50`。ADL 跑完拉回到 50%，**低于提款线 65%**，所以一轮 ADL 就把 LP 的提款能力恢复了。
于是 FX100 的 50% 更像是**刻意的深度回拉**，不是配错：它用"单轮 ADL 拉得很深"换"ADL 频率低 + LP 能重新提款"，代价是每一轮 ADL 对交易者的强制减仓幅度大得多（回拉 25 个百分点，GMX 只有 8 个）。
**因此若要把 ADL 后目标往 GMX 的 77% 靠，必须同时下调提款封锁线 65%**，否则会出现"ADL 跑完了、LP 仍被锁"的状态，把一个本来能自愈的流程变成需要人工干预。
➡️ **完整的设计原则、口径差异与定档提案见 §十**（2026-08-07 起该议题统一在 §十 维护，本节只保留 GMX 侧的参考数据）。

### 9.9 `MIN_COLLATERAL_USD = 0` 的评估结论

**结论：接受现状，不修改。** 依据：`MIN_POSITION_SIZE_USD = 10`（GMX 是 $1）已经从仓位规模侧挡住了尘埃仓位，10 USD 名义 × 最高 100x 杠杆意味着抵押品至少 0.1 USD 量级，再叠加 `minCollateralFactor` 0.5%~1% 的比例要求，实际不存在"抵押品趋近于 0 但仓位仍存活"的空间。
仍需留意的残余风险（未验证，上线前建议实测确认）：
1. **清算经济性**：极小仓位被清算时，清算费按 `sizeInUsd × 0.30%` 计，10 USD 仓位只有 0.03 USD，其中 50% 给 fee receiver = 0.015 USD，**远低于清算 keeper 的 gas 成本**。Base 上 gas 便宜所以问题不大，但这类仓位实际上没人愿意清算，会滞留。GMX 用 $1 的 `MIN_COLLATERAL_USD` 并不能解决这个问题，它靠的是同样的最小仓位规模 —— 所以这是**行业共性问题，不是 FX100 独有缺口**。
2. **该键确实在被读**：`PositionUtils.sol:400`（清算判定）与 `DecreasePositionUtils.sol:148`（减仓校验）都会取它。值为 0 意味着这两处的绝对下限分支恒过，**仓位存续完全由比例因子 `minCollateralFactor` 决定**。如果将来下调 `MIN_POSITION_SIZE_USD`（例如为了提升小额用户体验），这层保护就没有了，届时必须同步补上绝对下限。
3. **与执行费全免叠加**：执行费现已全场豁免（§三），意味着开一个 10 USD 仓位对用户零 gas 成本，刷仓位的边际成本只有手续费。公测期可接受（正是要压测），主网前应重新评估是否需要 `MIN_COLLATERAL_USD` + 最小持仓时间双管。

## 十、FX100 风控设计原则与 ADL 阶梯定档

本节回答两个问题：FX100 的风控是按什么原则设计的（**为什么不能照抄 GMX**），以及四个 PnL 阶梯参数应该定在哪。依据是 [储备金与风控体系改造规范（实施版）](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/superpowers/specs/2026-06-12-reserve-risk-control-implementation-spec.md)（2026-06-12 定稿，v0.3.0 已实现）+ 2026-08-06 的链上实读。

### 10.1 设计原则（八条）

1. **单一共享 USDC LP 池。** GMX 是双资产分侧池（多头池 WETH、空头池 USDC），赔付路径分侧配对；FX100 所有市场共用一个 USDC LP 池。**这是所有口径差异的根源。**
2. **LP NAV 不含 pending PnL**（`pendingPnlScalingFactor = 0`）：NAV = `totalAssets / totalSupply`。
3. **风控度量是「净义务」，不是单边 PnL、也不是名义 OI。**

```plain text
   per-market:  net_i    = max(0, longPnl_i) + max(0, shortPnl_i)
   全局:        pnlRatio = Σ_i net_i / poolUsd
```

**侧内盈亏互抵、跨侧不互抵**。为什么必须这样：GMX 的检查全是单边（`isLong`），单边对单池是对的；FX100 多空共用一个池，若每边各拿全池做分母，**池容量会被计两次** —— 多空同时盈利各 0.5×pool 时不触发任何单边阈值，而 LP 实际义务已达 1.0×pool。
1. **多空天然对冲 ⇒ 容量参数可以 > 1。** LP 真正要赔的是盈利侧净额，不是名义 OI；多空平衡时名义 OI 远超池子而实际风险极低。这正是 FX100 敢用 Σ RESERVE_FACTOR = 2.95 的依据，也是它资本效率高于 GMX 的地方（§9.3）。
2. **四个 PnL 参数与市场数量无关。** 新上市场只需配 `RESERVE_FACTOR` 与 `MAX_OPEN_INTEREST`，不动任何 PnL 参数。
3. **水位必须满足** `AFTER_ADL < WITHDRAWALS < ADL < TRADERS`（规范 §二明文）。
4. **存款任何状态都允许，只对提款设 gate。** 存款是在补充池子，没有理由拦。
5. **`TRADERS` cap 是 keeper 全部失效时的最后被动防线**，不是日常调节旋钮。它在每次结算时按**当时剩余的 poolUsd** 重算，单笔最多拿走剩余池的该比例，串行结算在数学上不会把池打穿为负。

### 10.2 四个参数的精确口径（粒度不同，别当成同一个刻度）

| 参数 | 键维度 | 分子 | 分母 | 判定位置 |
|---|---|---|---|---|
| `MAX_PNL_FACTOR_FOR_TRADERS` | **per-market × isLong** | **单个市场单侧**的聚合 PnL | 共享池 | 每次减仓结算（`PositionUtils.sol:227` → `getCappedPnl`） |
| `MAX_PNL_FACTOR_FOR_ADL` | 全局裸键 | **全场** Σ net_i | 共享池 | `AdlUtils.updateAdlState` |
| `MIN_PNL_FACTOR_AFTER_ADL` | 全局裸键 | 同上 | 共享池 | 同上（ADL 退出水位） |
| `MAX_PNL_FACTOR_FOR_WITHDRAWALS` | 全局裸键 | 同上 | 共享池 | `LPVault.sol:358`（claim 时） |

两个推论：
- **`TRADERS` 恒 ≤ 全局比值**（它是那个求和里的一项），所以 **`TRADERS` 必须 ≥ ADL 触发**，否则会出现"全局还没到 ADL，盈利已经被打折"的怪状态。
- **`TRADERS` 靠价格波动几乎撞不到。** per-market 名义容量最多 = RF × pool（T1 仅 36%），即使该侧账面翻倍也只有 36% 的池子；它实际只在**连环结算逐步抽干池子**的过程中生效 —— 与原则 8 的定位一致。

### 10.3 与 GMX 的对比（链上实读，2026-08-06）

|  | traders 结算上限 | ADL 触发 | ADL 后目标 | LP 提款封锁 | 存款封锁 |
|---|---|---|---|---|---|
| **GMX 主流市场**（BTC/ETH 真币抵押、单币） | 90% | 85% | 77% | 70% | 90% |
| **GMX 合成市场**（110 个，如 DOGE） | 70% | 65% | 60% | 55% | 70% |
| **FX100 旧值**（2026-08-07 前） | 90% | 75% | 50% | 65% | 不设 |
| **FX100 现行**（提案 B） | **60%** | **55%** | **45%** | **50%** | 不设 |

**⚠️ 数值不可直接比大小**，三处口径差异：

| 维度 | GMX | FX100 |
|---|---|---|
| 键维度 | 全部 per-(market, isLong)，裸键实测为 0 | 只有 `TRADERS` 是 per-market，ADL/提款三个是**全局裸键** |
| 分母 | **该市场自己的池子**，风险隔离在单池内 | **全场共享池** |
| 分子 | 单边 PnL | 全场两侧正 PnL 之和（跨侧不互抵） |
| 事件性质 | 某一个市场的局部事件 | **全协议级事件** |

所以同样一个 75%，在 GMX 只是某个 GM 池的局部状态，在 FX100 是"LP 对全体交易者欠了 3/4 个池子"。
**阶梯顺序也不同，这比数值更重要：**
- **GMX**：`traders 90 > ADL触发 85 > ADL后目标 77 > 提款封锁 70` —— ADL 后目标**高于**提款线，一轮 ADL 跑完 **LP 依然被锁**，要等行情或下一轮。
- **FX100**：现行 `traders 60 > ADL触发 55 > 提款封锁 50 > ADL后目标 45`（旧值 90 > 75 > 65 > 50）—— 无论新旧，ADL 后目标都**低于**提款线，**一轮 ADL 就能把 LP 的提款能力恢复**（规范 §3.3 状态四的原话："提款仍封锁直到 < 0.65"，其中 0.65 即当时的提款线）。
FX100 让 ADL 后目标低于提款线因此是**刻意设计**（旧值回拉 25 个百分点，提案 B 后为 10 个；GMX 只有 8 个）：用"单轮拉得深"换"ADL 频率低 + 提款自愈"，代价是每一轮对交易者的强制减仓幅度大得多。**任何调档都必须保住"ADL 后目标 < 提款封锁"这个顺序**，否则会把一个能自愈的流程变成需要人工干预的死角。GMX 反过来排（且明知会卡住）的原因见 §10.5 —— 它的三个前提 FX100 一条都不成立。

### 10.4 定档：提案 B（2026-08-07 已落链）

**现状评估**：`ADL 触发 75%` 偏晚。8/06 撤掉单侧闸门（`maxOIFactor` → 1.0）并把 Σ RF 提到 2.95（现 **3.09**）之后，**单市场层面已不存在任何方向性约束，全部风险都压在这三个全局键上**（§6.6）。在 $50M 小池 + keeper 可靠性尚未经真实压力验证的阶段，等到 LP 欠掉 3/4 个池子才动手，缓冲太薄。

|  | traders | ADL 触发 | LP 提款封锁 | ADL 后目标 | 危险带 | 回拉深度 |
|---|---|---|---|---|---|---|
| 旧值（2026-08-07 前） | 90% | 75% | 65% | 50% | 10pt | 25pt |
| 提案 A（初版，已否决） | 60% | 55% | **45%** | **50%** | 10pt | 5pt |
| **✅ 提案 B（已采用并落链）** | **60%** | **55%** | **50%** | **45%** | 5pt | 10pt |
| 提案 C（曾备选，保留缓冲） | 70% | 60% | 52% | 45% | 8pt | 15pt |

**提案 A 不可用**：`提款封锁 45% < ADL 后目标 50%` 违反 §10.1 原则 6 的不变式 —— ADL 跑完停在 50%，而提款要求 < 45%，**状态四永远靠 ADL 走不出来**。提案 B 是同一组数值把中间两个互换，水位 `45 < 50 < 55 < 60`，均匀 5pt。
换算到当前 $70,528,020 池、Σ 名义容量 $217,931,582（= 3.09 × pool，2026-08-19 口径）：

|  | 提款封锁于 | ADL 触发于 | ADL 拉回到 | 相当于满仓账面的平均有利波动 |
|---|---|---|---|---|
| 旧值（90/75/65/50） | Σ正PnL > $45,843,213 | > $52,896,015 | $35,264,010 | 24.3% |
| **提案 B（现行 60/55/50/45）** | **> $35,264,010** | **> $38,790,411** | **$31,737,609** | **17.8%** |

⚠️ 这些美元数随池子和 Σ RF 变动，百分比阈值才是配置值；池子每次增资都会等比放大它们（见 §11.2）。
**采用提案 B 时明确接受的两个代价：**
1. **危险带从 10pt 收窄到 5pt。** 提款封锁到 ADL 触发之间只有 5 个百分点，急速行情下可能一个区块同时跨过两条线，"LP 已锁但 ADL 未启"的早期预警窗口几乎消失。若要保留缓冲用提案 C。
2. **`TRADERS 60%` 是对规范的明确偏离。** 规范 §七 写的是"维持现状不动"（0.90），理由见 §10.1 原则 8。压到 0.60 = 单笔最多拿走剩余池的 60%，对 LP 更安全、对盈利交易者更狠。这是有意识的二次决策，不是修 bug —— 注意 0.90 本身是 2026-08-06 刚按规范补配上去的（此前链上是 100%，见 §9.7）。
**另外两点不需要改**：ADL 触发/退出与提款三个键都是**全局裸键**，改一次全场生效，与市场数量无关（原则 5）；存款不设 gate 保持不变（原则 7）。
**落链记录（2026-08-07）**：

| 参数 | 键维度 | 旧 → 新 | 写入笔数 |
|---|---|---|---|
| `MIN_PNL_FACTOR_AFTER_ADL` | 全局裸键 | 50% → **45%** | 1 |
| `MAX_PNL_FACTOR_FOR_WITHDRAWALS` | 全局裸键 | 65% → **50%** | 1 |
| `MAX_PNL_FACTOR_FOR_ADL` | 全局裸键 | 75% → **55%** | 1 |
| `MAX_PNL_FACTOR_FOR_TRADERS` | per-market × isLong | 90% → **60%** | 50（25 个未下架市场，含 MSOL market 3） |

⚠️ **写入顺序不能任意**，否则中途会出现违反不变式的瞬时状态。本次全为下调，安全顺序是**自底向上**（后目标 → 提款封锁 → ADL 触发 → traders）；若将来上调则相反（自顶向下）。脚本 `setGlobalPnlLadder.ts` 内置不变式校验 + 贪心排序，保证每一步的中间状态都合法，目标组合违反不变式时直接拒绝执行；per-market 的 traders 走 `setMaxPnlFactorTraders.ts`。
写入后用合约自身的 `Reader.getAdlState` 复核：全局 `pnlRatio = 0.2433%`、当前判定阈值 = 55%、`ADL 应启用 = false`，符合预期（测试网 OI 极低，离所有线极远，本次调档无即时影响）。

## 十一、参数变更日志（真链 Base Sepolia）

**为什么要有这一节**：真链参数改过很多轮，光看当前值无法判断"某个数是刻意定的还是历史遗留"。7 月发生过一次真实事故 —— BTC/ETH 手续费改在旧 DataStore 上，7-29 换新部署后**静默丢失**，正是因为没有这样一份台账。
口径说明：**「笔数」= 实际 DataStore 写入次数**，全部写后读回确认。凡是改了链上值的，同一轮都已同步部署模板（`scripts/parameters/*.json`、`createTop20Markets.ts`、`configureMarket.ts`），否则全新部署会退回旧值。

| 日期 | 参数 / 动作 | 变更 | 笔数 | 备注 |
|---|---|---|---|---|
| 08-01 | 上线 GMX Top20 | market 4–20 部署 | — | 见 `project_top20_realchain_deployment` |
| 08-03~04 | Batch2 六市场 | market 21–26（AAVE / PUMP / BNB / XMR / ADA / DOGE） | 372 | 26/26 核对通过 |
| 08-03~04 | `LIQUIDATION_GRACE_PERIOD_BASE` | 补齐 **900s**（此前 18 个市场为 0） | 18 | 🔴 根因是 4 个「裸 keccak」异类键写错，见 §五 |
| 08-04 | `POSITION_FEE_FACTOR`（BTC/ETH） | → **0.02%** | — | 7-21 那次改在旧 DataStore 上、7-29 换部署后丢失，此为重做 |
| 08-05 | `REQUEST_EXPIRATION_TIME` | 60 分钟 → **120 秒** | 1 | 全局键；同时是可成交窗口与不可取消窗口 |
| 08-05 | `minCollateralFactor` / `…ForLiquidation`（BTC） | 0.40% → **0.50%** | 2 | 使 24 个市场全部符合 (1/MaxLev)/2 |
| 08-05 | LIT（market 19）下架 | `IS_MARKET_DISABLED = true` | 1 | GMX 已下架该资产；**确认 0 OI 后**才硬下架 |
| 08-05 | 容量重分配 | Σ RF 2.09 → **2.95**，四层；`MAX_OI` 按 LP=$100M 反推 | 144 | 长尾容量从十几万美元提升到百万级 |
| 08-06 | `POSITION_FEE_FACTOR` | BTC/ETH **0.05%**、其余 22 个 **0.075%** | 48 | 按历史数据测算，覆盖 15 分钟清算保护期风险 |
| 08-06 | `SKEW_IMPACT_FACTOR` | 全场统一 **0.0025**（BTC 原 0.01） | 1 | 原值方向搞反了：最深的市场点差最贵 |
| 08-06 | `EXECUTION_FEE_SUBSIDIZE` / `_SIZE` | market 1/2 的 20 USD + token 阈值 → **0（恒免）** | 4 | 全场 24/24 执行费全免；⚠️ 10 USD 不等于全免，见 §三 |
| 08-06 | `MAX_OPEN_INTEREST` | 全场统一 **$100M/侧**（刻意惰性） | 48 | 当日容量数字不变，只是少一层要对齐的参数 |
| 08-06 | `MAX_OPEN_INTEREST_FACTOR` | 全场 **1.0/侧** | 48 | 🔴 **撤除单侧闸门**，单向可独占市场全部 RF 额度；每侧额度翻倍 |
| 08-06 | `MAX_PNL_FACTOR_FOR_TRADERS` | 100% → **90%** | 50 | 规范里的 0.90 此前从未配置；per-market × 多空 |
| 08-07 | PnL 阶梯（4 个参数） | traders **60%** / ADL 触发 **55%** / 提款封锁 **50%** / ADL 后目标 **45%**（旧 90/75/65/50） | 53 | 与撤闸门配套的收紧；⚠️ 写入顺序自底向上，见 §10.4 |
| **08-19** | **LP 池增资** | **$50.43M → $70.43M（+$20M USDC）** | 1 | ETH 撞满 99.4% 触发；tx `0x007cb0e8…`；签名者与地址见 `project_add_lp_procedure` |
| **08-19** | **`RESERVE_FACTOR`（ETH）** | **36% → 50%** | 1 | 加 LP 后 ETH 又被吃到 92.4%（OI 从 9,543 → 12,189 ETH）；上限 $25.39M → **$35.26M**，占用回落到 66.5% |
| **08-19** | **`POSITION_FEE_RECEIVER_FACTOR`** | 50% → **100%** | 1 | 手续费不再分给 LP，全额归分账器；全局裸键 |
| **08-19** | **`LIQUIDATION_FEE_RECEIVER_FACTOR`** | 50% → **100%** | 1 | 同上；清算费此前一半留池 |
| **08-20** | **RevenuePool 分账比例**（3 条 reward） | treasury 40%→**50%**、保险基金 20%→**30%**、LP(ecosystem) 40%→**20%**（staker 仍 0%） | 3 | `updateRewardTokenRatio(index,…)` 逐 feeType 各一笔；LP 对手续费/资金费的应计份额随之 40%→20%。详见 §11.3 |

### 11.1 ⚠️ Σ RESERVE_FACTOR 已超出自定预算

ETH 上调后 **Σ RF = 3.09**，超过此前自定的 **≤ 3**（该口径比风控规范更严 —— 规范原文是"**每市场各自** ≤ 3.0、1.0~1.5 起步"，ETH 的 0.50 远低于它）。2026-08-19 显式接受，理由：
- 真正的兜底是全局三层（ADL 触发 55% / 提款封锁 50% / 结算硬顶 60%），Σ RF 只是**最坏情况**单向名义敞口的理论上限（3.09× 池子），且该上限从 2.95 到 3.09 只放宽了 4.7%；
- 当前全局 pnlRatio 不到 1%，离任何一条线都极远。
运维脚本已把这件事做成机制：`setMarketCapacity.ts` 有 `MARKET_RF_OVERRIDE` 逐市场覆盖表，Σ 超预算时**默认拒绝执行**，必须显式 `ALLOW_RF_BUDGET_OVERRUN=1` 才放行 —— 超预算永远是一次明确决定，不会因为改了分层表而静默发生。

### 11.2 从这两次调整学到的：加 LP 与调 RF 的分工

08-19 这一天 ETH 被吃满了**两次**：加 $20M 让它从 99.4% 回落到 71.2%，但公测期 OI 增长（9,543 → 12,189 ETH，+27.7%）很快又推回 92.4%，只靠加 LP 追不上。
- **加 LP** 是全场等比放大，对"某一个市场偏热"无效 —— 它同时把 ADL/提款封锁的**分母**放大，等于顺带稀释了全局风控阈值的绝对金额；
- **调该市场 RF** 是定向放大，但会消耗 Σ RF 预算。
所以次序应当是：先看是全场紧还是单市场紧。全场紧 → 加 LP；**单市场紧 → 调该市场 RF**。ETH 属于后者，08-19 两个动作都做了，事后看直接调 RF 就够。

### 11.3 费用分配与 LP 的实际收益口径（2026-08-19 改动的完整说明）

`POSITION_FEE_RECEIVER_FACTOR` 与 `LIQUIDATION_FEE_RECEIVER_FACTOR` 均为 **100%**，即开/平仓费与清算费**全部归 `FEE_RECEIVER`（分账器合约 `0x0b5141ef…`），不再有任何一部分留在 LP 池**（此前各 50%）。⚠️ 语义容易反着理解：系数是"给 fee receiver 的比例"，**余额才是进池的部分**（`PositionPricingUtils.sol:530-532`：`feeReceiverAmount = protocolFeeAmount × factor`、`positionFeeAmountForPool = protocolFeeAmount − feeReceiverAmount`），所以 100% = 池子分到 0。两个都是**全局裸键**。
🔴 **订正（2026-08-19，经 peer 质疑后复核）**：此前本行写过"`FUNDING_FEE_RECEIVER_FACTOR` 仍为 0，资金费全额进池"，**两句都是错的**。① 该键在 v0.3.1 的 `src/` 里**根本不存在**（`git grep` 零命中，连 `FX100Keys.sol` 都没有），读到的 0 是"不存在的键返回 0"，不是配置值；② 资金费**不进 LP 池**：`MarketUtils.sol:582-591`，交易者净付出的资金费走 `FeeUtils.incrementClaimableFeeAmount(..., FUNDING_FEE_TYPE)` 进 claimable 桶，代币存放在 **PositionVault**，经 `FeeHandler.claimFees` → `FeeUtils.claimFees`（`positionVault.transferOut`）→ `FeeHandler.withdrawFees` 转给 `FEE_RECEIVER`，全程不经过 LPVault。
⚠️ **方向是不对称的**：LP 需要倒付资金费时（`positionPaysLp < 0`）走 `IVault(market.vault).transferOut(...)` —— **真金白银从 LPVault 出**。即 **LP 承担资金费支出、却不收取资金费收入**。这不是今天改出来的，是「资金费改路由 claimable」设计的既有行为。📊 **量级已实测（peer 抽样，约 8000 区块 / 4.4 小时）**：同期 `PositionDecrease` 中 `basePnlUsd` 为正的合计 $105,980.84，而 LPVault → PositionVault 的 USDC 实际转出合计 $105,989.13，差额仅 **$8.29（约 0.008%）**。⇒ "LP 倒付资金费"这一分支在当前真实数据里几乎不发生，**是结构性缺口但目前不构成失血**，暂不需要专门治理。
⇒ 因此 **LP 的"已实现"收益此后只来自「交易者净亏损（对赌）」**；手续费与资金费**仍有 40% 的应计份额**，但需经分账器 `claim()` 才到账，而该管道至今未运行（见下）。
✅ **回流路径已核实（2026-08-20，经 peer 提示后独立读链）**：`FEE_RECEIVER` 就是 fx 既有的 `RevenuePool`，它的 `ecosystem()` **精确等于 LPVault**（`0xD584270b…`）—— 所以费用**确实有一部分会回到 LP**，我此前"LP 收益只来自对赌"的结论下得太绝对。另两槽：`treasury()` = ProtocolTreasury（`0x1cEAc53F…`）；`staker()` = `0xf82CF35C…`，⚠️ 这是**部署者 EOA、不是质押合约**，测试网占位可以接受，主网前必须换掉。✅ **分账比例也已核实（2026-08-20）**：正确读法不是 `ratio()` 这类（ABI 里没有，所以我之前一律 revert），而是 `getRewardCount()` + `rewards(i) → (token, key, stakerRatio, treasuryRatio, lockerRatio)`（1e9 精度），ecosystem 份额在 `claim()` 里用**余额法**得出（链上不存 ecosystemRatio 字段）。实测 3 条 reward，全是 USDC，`key` 分别精确对应 **FUNDING / LIQUIDATION / POSITION_FEE_TYPE**，三条比例始终一致。**2026-08-20 已调整为：staker 0% ｜ treasury 50% ｜ 保险基金 30% ⇒ ecosystem（= LPVault）20%**（此前 0/40/20/40）。⚠️ 合约里这一槽叫 `lockerRatio`、注释写"分给 ve token lockers"，但它实际转给 **`burners[token]`**，而本部署的 `burners[USDC]` 正好等于 **InsuranceTreasury（`0xa6cbc0Da…`）** —— 所以在本部署里它就是**保险基金**槽。改比例用 `updateRewardTokenRatio(index, staker, treasury, locker)`（`onlyOwner`，逐 index，三条都要改）；ecosystem 份额链上不存字段，是 `claim()` 里的余额法 `1e9 − 其余三者`。注意 **staker 份额是 0**，所以前述"部署者 EOA 占位"不会漏走任何资金（主网前若要启用质押分成仍需换成真合约）。
📐 **于是昨天那次改动对 LP 的真实影响可以算准（不是"费用全部不给 LP"）**：
- 开/平仓费与清算费，LP 份额三段演进：**08-19 前 = 50%（即时入池）+ 50%×40% = 70%** → **08-19 后 = 0% + 100%×40% = 40%** → **08-20 后 = 0% + 100%×20% = 20%**。⇒ 累计 **70% → 20%**，其中即时到账部分 50% → 0%；treasury+保险基金 从 30% → 80%。
- 资金费：不受那两个 receiver factor 影响，但**随分账比例一起从 40% 降到 20%**（08-20）。
📌 **回推历史时别弄错**：08-19 改的是两个 receiver factor（决定多少钱进 claimable 管道），08-20 改的是分账器比例（决定管道里的钱怎么分）——**两者是不同环节、生效时点也不同**。拿"claimable 累计额 × ecosystem 比例"估算 LP 应计时，**08-20 之前累积的部分要按 40%、之后的按 20%**，不能一律用现值折算 —— 因为 claimable 累加器（`ClaimableFeeAmountUpdated.delta` 事件）记录的是**当时那个 factor 下真实进入 claimable 的增量**（改动前只有 50%、改动后是 100%），改动前直接入池的另外 50% 从来不在这个累加器里（它单独体现为 Fee-to-Pool）。**不要**反过来拿现在的 100% 去回推改动前的费用总额。
🔴 **`claim()` 只有 `staker` 能调**（`require(msg.sender == _staker)`），而 `staker` = `0xf82CF35C…` 是**部署者 EOA**。整条分账管道的触发权因此在部署者手上、且必须手动发起 —— 这解释了它为何至今从未运行，也意味着**主网前需要把它做成 keeper 定时任务或改由合约触发**，否则费用会无限期停留在 claimable 状态。
🔴 **但这条回流链目前是休眠的**：实测 `FeeHandler`（`0x009559c1…`）、`RevenuePool`、`ProtocolTreasury` 的 USDC 余额**全为 $0**，即从未有人跑过 `FeeHandler.claimFees` → `withdrawFees` → `RevenuePool.claim()`。所有已计提费用仍以 claimable 记账停留在 **PositionVault**。
**⇒ 所以要分清"立即"与"最终"两个口径（这是本行最容易读错的地方）：**
- **立即**：改动前那 50% 是 `positionVault.transferOut(..., market.vault, feeAmountForPool)` **真实转入 LPVault**（`IncreasePositionUtils:244` / `DecreasePositionCollateralUtils:217`），直接抬 `totalAssets` 与 NAV，是 LP 的即时收入。**改动后这部分归零，这一点是确定且已生效的。**
- **最终**：理论上 ecosystem 槽位会把一部分送回 LPVault，但既要有人跑分账管道、又取决于未知的分账比例。**在管道被跑起来之前，LP 实际拿到的费用是 0。**
⇒ 测算 LP APR 时的稳妥口径：**已实现收益里费用按 0 计**（管道未跑，钱还没到）；若要展示"应计"口径，08-20 起按 **20%** 折算（更早累积的部分按 40%），并标注为假设、且注明尚未通过 `claim()` 到账。

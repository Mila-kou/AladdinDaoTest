# 📊 Avantis 线上资产 posSpreadCap/negSpreadCap 全量核对

> Notion 页面：[原文](https://app.notion.com/p/3bc3d7873f2c81e2bb89f29ccffd4e0b)
> 作者：fx100-sync（Gordon 的 fx100-contracts 仓库文档同步机器人，内容出自 Gordon）
> 创建时间：2026-08-14
> 最后编辑：2026-08-16
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 产品 / FX100 / 技术相关 / 合约 / 🏗️ 设计提案
> 类型：设计文档

> 👥 受众：合约工程师　｜　来源：docs/analysis/pricing/avantis_live_pairs_spread_caps.md

**数据截止**: 2026-08-15

**合约**: `PairStorage` 代理 `0x5db3772136e5557EFE028Db05EE95C84D76faEC4`（Base 主网，chainId 8453）

**读取方式**: `web3.py` 直接 `eth_call`（`getPairData` 取符号名、`spreadCaps(idx,false)` 取 pos/neg 上限、`isPairListed(feedId)` 判定是否在架），RPC 用公共节点 `https://mainnet.base.org`

---

## 一、数据口径

1. **`posSpreadCap`/`negSpreadCap` 换算公式**（`_PRECISION = 1e10`，`PairInfos.sol:16`）：
   ```
   百分比 = 链上原始值 / 10 / 1e10
   ```
   例：BTC `posSpreadCap` 原始值 `2,000,000,000` → `2e9/10/1e10 = 0.02%`。
2. **哪些是"当前上线"**：`isPairListed(feedId)` 为 `true` 且符号名非空。115 个 pairIndex 里有 4 个不算在架：`28=FET/USD`（`isPairListed=false`，已下架）、`32`/`47`（符号名为空，从未真正配置或已彻底清空，index 空占位）、`68=USD/KRW`（`isPairListed=false`，已下架）。**当前实际在架 111 个**。

---

## 二、Avantis 当前在架 111 个资产分类总览

| 资产类别 | 个数 | 说明 |
|---|---|---|
| 加密货币（含 meme/AI/Restaking 等长尾币） | 61 | index 0-10, 22-27, 29-46, 48-51, 53-64, 71-72, 75-76, 88-90, 92-95 |
| 外汇（forex，含新兴市场货币对） | 17 | EUR/GBP/JPY/CAD/CHF/SEK/AUD/NZD/SGD/TRY/CNH/INR/MXN/ZAR/BRL/IDR/TWD |
| 大宗商品 | 5 | XAU、XAG、USOILSPOT、WTI、BRENT |
| 美股/ETF/指数（`posSpreadCap` 链上为 0，见下方⚠️） | 28 | US500、US100、COIN、NVDA、AAPL、AMZN、MSFT、META、TSLA、GOOG、HOOD、AMD、INTC、MU、SNDK、CBRS、EWY、BABA、SPCX、CRCL、MRVL、MSTR、BB、PLTR、AVGO、NFLX、CRWV、SK HYNIX |
| **合计** | **111** |  |
| 已下架/未配置 | 4 | `28 FET`、`32`（空）、`47`（空）、`68 USD/KRW` |

⚠️ 美股类 28 个的 `posSpreadCap` 链上原始值全部是 **0**——这不代表"允许无限负点差"，而是这批资产的价差机制大概率**尚未按 Avantis 的正式公式启用**（`posSpreadCap=0` 在其 clamp 公式 `dynamicSpread < -int(0/10)` 下等价于**完全不允许负向偏移**，即这批资产事实上被钉死在 floor-at-0，和 FX100 v0.3.1 现在的行为一致）。这批股票类资产不在 FX100 当前 24 个资产范围内，仅供参考，未展开逐项分析。

---

## 三、与 FX100 已上线资产清单（Base Sepolia，24 个）逐项对照

依据 [LIVE_MARKETS.md](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/analysis/markets/LIVE_MARKETS.md) 的 24 个资产（不含仅供内测的 MSOL、已下架的 LIT）：

| FX100 market | 资产 | Avantis 是否上线 | Avantis pairIndex | posSpreadCap | negSpreadCap |
|---|---|---|---|---|---|
| 1 | **BTC** | ✅ | 1 | 0.0200% | 0.2500% |
| 2 | **ETH** | ✅ | 0 | 0.0200% | 0.2500% |
| 4 | **HYPE** | ✅ | 62 | 0.0500% | 0.5000% |
| 5 | **SOL** | ✅ | 2 | 0.0200% | 0.5000% |
| 6 | **WLD** | ✅ | 27 | 0.0500% | 1000.0000%（实质无效） |
| 7 | **ZEC** | ✅ | 92 | 0.0500% | 1000.0000%（实质无效） |
| 8 | **VVV** | ❌ 未上线 | — | — | — |
| 9 | **LINK** | ✅ | 41 | 0.0500% | 1000.0000%（实质无效） |
| 10 | **SUI** | ✅ | 49 | 0.0500% | 1000.0000%（实质无效） |
| 11 | **AERO** | ✅ | 37 | 0.0500% | 1000.0000%（实质无效） |
| 12 | **NEAR** | ✅ | 43 | 0.0500% | 1000.0000%（实质无效） |
| 13 | **XLM** | ❌ 未上线 | — | — | — |
| 14 | **ENA** | ✅ | 36 | 0.0500% | 1000.0000%（实质无效） |
| 15 | **TIA** | ✅ | 9 | 0.0500% | 1000.0000%（实质无效） |
| 16 | **ONDO** | ✅ | 31 | 0.0500% | 1000.0000%（实质无效） |
| 17 | **XRP** | ✅ | 59 | 0.0200% | 0.5000% |
| 18 | **ARB** | ✅ | 4 | 0.0500% | 1000.0000%（实质无效） |
| 20 | **TON** | ❌ 未上线 | — | — | — |
| 21 | **AAVE** | ✅ | 48 | 0.0500% | 1000.0000%（实质无效） |
| 22 | **PUMP** | ✅ | 75 | 0.0500% | 1000.0000%（实质无效） |
| 23 | **BNB** | ✅ | 3 | 0.0500% | 1000.0000%（实质无效） |
| 24 | **XMR** | ✅ | 93 | 0.0500% | 1000.0000%（实质无效） |
| 25 | **ADA** | ❌ 未上线 | — | — | — |
| 26 | **DOGE** | ✅ | 5 | 0.0200% | 3000.0000%（实质无效） |

**结论**：FX100 的 24 个资产里，**20 个**在 Avantis 也有对应交易对，**4 个没有**（VVV、XLM、TON、ADA）。

---

## 四、Avantis 的 posSpreadCap/negSpreadCap 设计规律（从全量数据里看出来的）

1. **`posSpreadCap` 只有两档，且和资产"档位"强相关**：
   - **主流大市值资产（ETH/BTC/SOL/XRP/DOGE/SHIB/PEPE/BONK/WIF/TRUMP/FARTCOIN/BERA）→ 0.02%（2bps）**——这批清一色是"高流动性或高波动 meme 龙头"，上限最紧。
   - **其余全部长尾资产（含 HYPE、所有 DeFi/Restaking/AI 币、以及 FX100 关心的 WLD/ZEC/LINK/SUI/AERO/NEAR/ENA/TIA/ONDO/ARB/AAVE/PUMP/BNB/XMR）→ 统一 0.05%（5bps）**。
   - 没有第三档；不存在"越小众上限越松"的连续分层，只有一刀切的二分。
2. **`negSpreadCap` 的分层逻辑完全不同，且大部分资产形同虚设**：
   - **只有极少数资产给了真正收紧的 `negSpreadCap`**：ETH/BTC（0.25%）、SOL/XRP/HYPE（0.5%）——这 5 个都是 FX100 也在用的主流资产。
   - **其余全部资产（含 DOGE/SHIB/PEPE/BONK/WIF 等 meme 币）的 `negSpreadCap` 是 1000% 或 3000%**——这在实际交易中永远不可能触及，等价于**没有上限**（不利方向的点差完全交给 `priceImpactSpread` 和市场深度自己决定，协议不做兜底收紧）。
   - 换句话说，Avantis 只对"优于 oracle 价成交"（`posSpreadCap`，协议要倒贴钱的方向）做严格限制，对"劣于 oracle 价成交"（`negSpreadCap`，用户自己吃价差的方向）**只在少数主流资产上收紧，长尾资产完全放开**。这与 [risk_dynamic_spread_floor_removal.md](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/analysis/pricing/risk_dynamic_spread_floor_removal.md) 此前的判断一致（该文档基于 07-24 仅读取的 3 个资产就已经观察到"负向上限远比正向上限宽松"），现在用全量 111 个资产验证：**这不是个例，是 Avantis 的统一设计原则**

---

## 五、原始数据

全部 111 个在架资产的完整 pairIndex / 符号 / posSpreadCap / negSpreadCap 已整理为结构化 JSON，如需要可另行导出为 CSV 或补充到本文档附录。加密类 61 个资产明细：

| pairIndex | 资产 | posSpreadCap | negSpreadCap |
|---|---|---|---|
| 0 | ETH/USD | 0.0200% | 0.2500% |
| 1 | BTC/USD | 0.0200% | 0.2500% |
| 2 | SOL/USD | 0.0200% | 0.5000% |
| 3 | BNB/USD | 0.0500% | 1000.0000% |
| 4 | ARB/USD | 0.0500% | 1000.0000% |
| 5 | DOGE/USD | 0.0200% | 3000.0000% |
| 6 | AVAX/USD | 0.0500% | 1000.0000% |
| 7 | OP/USD | 0.0500% | 1000.0000% |
| 8 | POL/USD | 0.0500% | 1000.0000% |
| 9 | TIA/USD | 0.0500% | 1000.0000% |
| 10 | SEI/USD | 0.0500% | 1000.0000% |
| 22 | SHIB/USD | 0.0200% | 3000.0000% |
| 23 | PEPE/USD | 0.0200% | 3000.0000% |
| 24 | BONK/USD | 0.0200% | 3000.0000% |
| 25 | WIF/USD | 0.0200% | 3000.0000% |
| 26 | RENDER/USD | 0.0500% | 1000.0000% |
| 27 | WLD/USD | 0.0500% | 1000.0000% |
| 29 | ARKM/USD | 0.0500% | 1000.0000% |
| 30 | PENDLE/USD | 0.0500% | 1000.0000% |
| 31 | ONDO/USD | 0.0500% | 1000.0000% |
| 33 | DYM/USD | 0.0500% | 1000.0000% |
| 34 | ORDI/USD | 0.0500% | 1000.0000% |
| 35 | STX/USD | 0.0500% | 1000.0000% |
| 36 | ENA/USD | 0.0500% | 1000.0000% |
| 37 | AERO/USD | 0.0500% | 1000.0000% |
| 38 | ETHFI/USD | 0.0500% | 1000.0000% |
| 39 | JUP/USD | 0.0500% | 1000.0000% |
| 40 | REZ/USD | 0.0500% | 1000.0000% |
| 41 | LINK/USD | 0.0500% | 1000.0000% |
| 42 | LDO/USD | 0.0500% | 1000.0000% |
| 43 | NEAR/USD | 0.0500% | 1000.0000% |
| 44 | INJ/USD | 0.0500% | 1000.0000% |
| 45 | ZK/USD | 0.0500% | 1000.0000% |
| 46 | ZRO/USD | 0.0500% | 1000.0000% |
| 48 | AAVE/USD | 0.0500% | 1000.0000% |
| 49 | SUI/USD | 0.0500% | 1000.0000% |
| 50 | TAO/USD | 0.0500% | 1000.0000% |
| 51 | EIGEN/USD | 0.0500% | 1000.0000% |
| 53 | BRETT/USD | 0.0500% | 1000.0000% |
| 54 | POPCAT/USD | 0.0500% | 1000.0000% |
| 55 | GOAT/USD | 0.0500% | 1000.0000% |
| 56 | APE/USD | 0.0500% | 1000.0000% |
| 57 | APT/USD | 0.0500% | 1000.0000% |
| 58 | CHILLGUY/USD | 0.0500% | 1000.0000% |
| 59 | XRP/USD | 0.0200% | 0.5000% |
| 60 | TRUMP/USD | 0.0200% | 1000.0000% |
| 61 | FARTCOIN/USD | 0.0200% | 3000.0000% |
| 62 | HYPE/USD | 0.0500% | 0.5000% |
| 63 | BERA/USD | 0.0200% | 1000.0000% |
| 64 | KAITO/USD | 0.0500% | 1000.0000% |
| 71 | PENGU/USD | 0.0500% | 1000.0000% |
| 72 | VIRTUAL/USD | 0.0500% | 1000.0000% |
| 75 | PUMP/USD | 0.0500% | 1000.0000% |
| 76 | ZORA/USD | 0.0500% | 1000.0000% |
| 88 | AVNT/USD | 0.0500% | 1000.0000% |
| 89 | ASTER/USD | 0.0500% | 1000.0000% |
| 90 | XPL/USD | 0.0500% | 1000.0000% |
| 92 | ZEC/USD | 0.0500% | 1000.0000% |
| 93 | XMR/USD | 0.0500% | 1000.0000% |
| 94 | MON/USD | 0.0500% | 1000.0000% |
| 95 | LIT/USD | 0.0500% | 1000.0000% |

> 注：`95 LIT/USD` 在 Avantis 仍是在架状态，FX100 侧已于 2026-08-05 下架 LIT（见 [LIVE_MARKETS.md](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/analysis/markets/LIVE_MARKETS.md) 相关记录），两边下架决策不同步，仅供参考、不影响本文结论。

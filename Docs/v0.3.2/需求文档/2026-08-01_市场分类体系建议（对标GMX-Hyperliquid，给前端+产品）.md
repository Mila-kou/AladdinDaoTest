# 🗂️ 市场分类体系建议（对标 GMX / Hyperliquid，给前端 + 产品）

> Notion 页面：[原文](https://app.notion.com/p/3af3d7873f2c813dafdde1116893cf8c)
> 作者：fx100-sync（Gordon 的 fx100-contracts 仓库文档同步机器人，内容出自 Gordon）
> 创建时间：2026-08-01
> 最后编辑：2026-08-01
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 产品 / FX100 / 技术相关 / 合约 / 🚀 上线与部署
> 类型：设计文档

> 👥 受众：前端 + 产品　｜　来源：docs/analysis/../superpowers/specs/2026-08-01-market-category-taxonomy.md

# FX100 市场分类体系建议（对标 GMX / Hyperliquid）

**日期**: 2026-08-01
**读者**: 前端工程师（实施）、产品（确认分类口径）
**结论**: 分类筛选**功能已经有了**，问题在**数据和结构**：4 个分类装不下 20 个资产（12 个挤在 `layer1`）、`meme` 页签空着、有 4 个资产分类错误、且存在**两套分类数据源**。建议补齐为二层结构（资产大类 + 赛道），并把 `categories` 收敛为单一数据源。
**相关文档**: [2026-07-31-market-onboarding-playbook.md](2026-07-31-market-onboarding-playbook.md)（§四 前端 7 处配置）、[2026-06-10-market-listing-oracle-config.md](2026-06-10-market-listing-oracle-config.md)（RWA/商品类资产的上线前置条件）

---

## 一、现状（已核实）

**功能是有的**：`apps/fx-base-app/src/components/features/trade/MarketSelect.tsx:150-160` 已经实现了分类页签 + 筛选。

```plain text
// MarketSelect.tsx:35
type MarketCategoryFilter = 'all' | 'favorites' | 'defi' | 'meme' | 'layer1' | 'layer2';
// :170  按 m.category 过滤
markets = markets.filter((m) => m.category === selectedCategory);
```

**20 个资产实际的分类分布**（真链 `getSupportedMarketPairs(84532)` 读出）：

| 分类 | 数量 | 资产 |
|---|---|---|
| `layer1` | **12** | BTC ETH MSOL SOL WLD ZEC SUI NEAR XLM TIA XRP TON |
| `defi` | 7 | HYPE VVV LINK AERO ENA ONDO LIT |
| `layer2` | 1 | ARB |
| `meme` | **0** | —— |

### 四个具体问题

1. **分类粒度不够，等于没分类**。12/20 挤在 `layer1`，点进去跟"全部"没有区别。缺 **AI**、**RWA** 两个 2026 年绕不开的赛道。
2. **`meme` 页签是空的**。页签在 `MarketSelect.tsx:150` 是**静态数组硬编码**渲染的，不是从数据推导，所以即使一个资产都没有也照样显示，点进去空列表。
3. **两套分类数据源，会漂移**：
- `packages/sdk/src/types/tokens.ts:11` — `TokenCategory = "meme" | "layer1" | "layer2" | "defi"`，`Token.categories?: TokenCategory[]`（**数组**）
- `MARKET_PAIRS[].category` —— **单值**，而且**筛选实际用的是这个**
   两处各填一遍，SDK 那份目前没人读。新增市场时漏改一处不会报错，只会静默分错类。
1. **MSOL 混在真实资产里**。它是纯合成测试资产（唯一用 mock oracle 的），归到 `layer1` 会出现在正式赛道列表里。

## 二、GMX / Hyperliquid 怎么做的

两家的结构高度一致，都是**两层**：

|  | 第一层 | 第二层（赛道） |
|---|---|---|
| **GMX** | `Perpetuals \| Swap` → `All \| Favourites \| Crypto \| TradFi` | `All \| AI \| Layer 1 \| Layer 2 \| DeFi \| Meme` |
| **Hyperliquid** | `Favorites \| All \| Perps \| Spot \| Outcome \| Crypto \| Tradfi \| HIP-3 \| Trending \| Pre-launch` | `All \| AI \| Defi \| Gaming \| Layer 1 \| Layer 2 \| Meme` |

可以提炼出三点共识：

1. **赛道层的集合基本相同**：`AI / DeFi / Layer 1 / Layer 2 / Meme`（HL 多一个 Gaming）。**两家都有 AI，我们没有。**
2. **资产大类独立于赛道**：`Crypto` 和 `TradFi` 是并列的第一层，不是塞进赛道里。因为 GOLD 既不是 Layer 1 也不是 DeFi —— 它属于另一个维度。
3. **有"运营位"分类**：HL 的 `Trending` / `Pre-launch`、两家的 `Favorites`。这些不是资产属性，是按行为或人工运营算出来的。

## 三、给 FX100 的建议

### 3.1 采用两层结构，但**现在只做必要的部分**

```plain text
第一层（资产大类）  All | ⭐Favorites | Crypto | TradFi(暂时隐藏)
第二层（赛道）      All | Layer 1 | Layer 2 | DeFi | AI | RWA
```

**为什么现在就要加第一层，而不是等 TradFi 上线再说**：[资产筛选文档](2026-06-10-market-listing-oracle-config.md)里已经在跟踪 GOLD / SILVER / WTIOIL / BRENTOIL / SPCX，它们被推迟的原因是**缺 market-hours 风控**而不是缺 oracle（GOLD/SILVER 的 oracle 其实是齐的）。一旦风控补上就会上线，那时候没有第一层就只能把 GOLD 硬塞进某个赛道。**第一层现在加的成本是几行代码，等资产上线再加就要动已有数据。**

TradFi 页签在没有对应资产时**隐藏**（见 3.3），所以现在加不会给用户看到空页签。

**不建议现在做的**：`Trending` / `Pre-launch` / `Gaming`。前两个需要成交量排序或上线状态的后端支撑，`Gaming` 我们一个资产都没有。等有需求再说。

### 3.2 20 个资产的分类建议

第一层全部是 `Crypto`（目前没有 TradFi 资产）。第二层：

| Market | 资产 | 现状 | **建议** | 依据 |
|---|---|---|---|---|
| 1 | BTC | layer1 | `layer1` | ✅ 不变 |
| 2 | ETH | layer1 | `layer1` | ✅ 不变 |
| 3 | MSOL | layer1 | **不归入任何赛道** | 🔴 合成测试资产，不该出现在正式赛道列表。见 3.4 |
| 4 | HYPE | defi | **`layer1` + `defi`** | 🟡 Hyperliquid 既是自有 L1 也是 DEX，双属性 —— 这是需要支持多分类的理由 |
| 5 | SOL | layer1 | `layer1` | ✅ 不变 |
| 6 | WLD | layer1 | **`ai`** | 🔴 Worldcoin 是身份/AI 赛道，不是 Layer 1 |
| 7 | ZEC | layer1 | `layer1` | ✅ 不变（Zcash 是独立 L1） |
| 8 | VVV | defi | **`ai`** | 🔴 Venice.ai，AI 赛道，与 DeFi 无关 |
| 9 | LINK | defi | `defi` | 🟡 严格说是 oracle/基础设施，但 GMX/HL 的赛道集合里没有这一类，业内通常归 DeFi。保持 |
| 10 | SUI | layer1 | `layer1` | ✅ 不变 |
| 11 | AERO | defi | `defi` | ✅ 不变（Aerodrome，Base 上的 DEX） |
| 12 | NEAR | layer1 | `layer1` | ✅ 不变（近期有 AI 叙事，但主属性仍是 L1） |
| 13 | XLM | layer1 | `layer1` | ✅ 不变（Stellar，支付类 L1） |
| 14 | ENA | defi | `defi` | ✅ 不变（Ethena） |
| 15 | TIA | layer1 | `layer1` | 🟡 Celestia 是模块化 DA 层，严格说是基础设施；沿用 L1 可接受 |
| 16 | ONDO | defi | **`rwa`** | 🔴 Ondo 是代币化美债/RWA 协议。**注意：它本身是 Crypto 资产，第一层仍是 Crypto，不是 TradFi** |
| 17 | XRP | layer1 | `layer1` | ✅ 不变 |
| 18 | ARB | layer2 | `layer2` | ✅ 不变 |
| 19 | LIT | defi | **⚠️ 待确认** | 🔴 `LIT` 符号有歧义（Litentry/Heima vs Lit Protocol），我们的参数表里没有全名字段，且[部署文档](2026-07-31-top20-markets-fork-deployment.md)记录它在 GMX Arbitrum 无对应市场（OI 是占位值）。**请产品确认是哪个项目再定分类，不要沿用现在的 defi** |
| 20 | TON | layer1 | `layer1` | ✅ 不变 |

分类后的分布（不含 MSOL 与待确认的 LIT）：

| 赛道 | 数量 | 资产 |
|---|---|---|
| `layer1` | 11 | BTC ETH HYPE SOL ZEC SUI NEAR XLM TIA XRP TON |
| `defi` | 4 | HYPE LINK AERO ENA |
| `ai` | 2 | WLD VVV |
| `rwa` | 1 | ONDO |
| `layer2` | 1 | ARB |

比现状（12/7/1）均衡得多，每个页签点进去都有实际内容。`ai` 和 `rwa` 只有 2 个和 1 个略显单薄，但这正好靠 3.3 的"空页签自动隐藏"逻辑自然演进 —— 资产多了页签自然出现，不需要改代码。

### 3.3 三个结构性改动（按优先级）

**P0 — 页签从数据推导，空的自动隐藏。** 现在 `MarketSelect.tsx:150` 是硬编码数组，导致 `meme` 空页签。改成对当前链的市场列表做一次 groupBy，只渲染有资产的赛道。这样：

- `meme` 页签自动消失（我们没有 meme 资产）
- 以后加 meme / gaming / TradFi 资产，页签自动出现，**不需要再改前端代码**
- `all` 和 `favorites` 保持常驻

**P1 — 收敛为单一数据源。** 保留 SDK 的 `Token.categories`（数组），删掉 `MARKET_PAIRS[].category`，或让后者从前者派生。理由：

- 数组类型已经存在，能表达 HYPE 这种双属性资产（单值表达不了）
- 消除"两处各填一遍、漏一处静默分错"的问题
- SDK 是 `packages/sdk`，前端和 keeper 都能复用

同时把 `TokenCategory` 从 4 个扩到 6 个：

```plain text
// packages/sdk/src/types/tokens.ts:11
export type TokenCategory = "layer1" | "layer2" | "defi" | "ai" | "rwa" | "meme";
```

**P2 — 加资产大类维度。** 与赛道正交的独立字段，不要塞进 `categories`：

```plain text
export type AssetClass = "crypto" | "tradfi";
// Token 上新增
assetClass?: AssetClass;   // 缺省视为 "crypto"
```

配合 P0 的空页签隐藏，`TradFi` 现在不会显示，等 GOLD/SILVER 上线时自动出现。

### 3.4 MSOL 怎么处理

它是唯一的 mock oracle 资产、纯测试用途。两个选项：

- **（推荐）不给它任何赛道分类**，只在 `all` 里出现。配合 P0，它不会污染任何赛道页签。
- 加一个 `test` 赛道，但只在测试网环境显示。

不推荐继续留在 `layer1` —— 它会和 BTC/ETH 并列出现在 Layer 1 列表里，对外演示时容易被当成真实资产。

## 四、这不是纯前端的事：需要产品确认的两点

1. **LIT 到底是哪个项目**（见 3.2 第 19 行）。这个影响分类，也影响它该不该继续留在名单里。
2. **`ai` / `rwa` 两个赛道名要不要用**。如果产品倾向于跟 GMX 完全对齐（GMX 只有 AI，没有 RWA），那 ONDO 就还是归 DeFi，`rwa` 不加。这是产品口径问题，不是技术问题 —— 我按"更精确"给的建议，但对齐竞品也是合理选择。

## 五、工作量估计

| 项 | 改动 |
|---|---|
| P0 页签数据推导 | `MarketSelect.tsx` 一处 `useMemo`，约 15 行 |
| 分类数据修正 | 4 个资产改值（WLD/VVV/ONDO + MSOL 清空），LIT 待确认 |
| P1 单一数据源 | `packages/sdk` 类型扩展 + 删 `MARKET_PAIRS.category` + 筛选改读 `categories.includes()`。⚠️ 改完 `packages/sdk` **必须 `yarn workspace @fx-io/sdk build`**，否则 Next 用旧 build（见上线手册 §四） |
| P2 资产大类 | 新增字段 + 一层页签，TradFi 资产上线前不可见 |

P0 + 分类数据修正是最小可交付，改完就能明显改善"点分类跟全部一样"的体感。P1/P2 建议一起做，避免二次返工。

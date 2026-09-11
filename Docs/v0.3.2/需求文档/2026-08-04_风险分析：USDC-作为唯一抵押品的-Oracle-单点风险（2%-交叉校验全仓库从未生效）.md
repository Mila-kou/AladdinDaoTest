# 🔺 风险分析：USDC 作为唯一抵押品的 Oracle 单点风险（2% 交叉校验全仓库从未生效）

> Notion 页面：[原文](https://app.notion.com/p/3b23d7873f2c8150b037f3600f9c248c)
> 作者：fx100-sync（Gordon 的 fx100-contracts 仓库文档同步机器人，内容出自 Gordon）
> 创建时间：2026-08-04
> 最后编辑：2026-08-11
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 产品 / FX100 / 技术相关 / 合约 / 🏗️ 设计提案
> 类型：设计文档

> 👥 受众：合约工程师　｜　来源：docs/analysis/oracle/risk_usdc_single_point_of_failure.md

# 风险分析：USDC 作为唯一抵押品/结算货币的 Oracle 单点风险

**状态**: 分析完成。**团队最终结论：不修补 oracle 交叉校验，改为在 Oracle 源头把 USDC 价格硬编码为 $1，彻底移除这个风险面**（见六节）。第二/三/四/五节的风险描述仍然是理解"为什么要这么做"的必要背景，请勿跳过直接看结论。

**涉及模块**: `src/oracle/Oracle.sol`（`_validatePrices`/`_validateRefPrice`/`_getSecondaryPrice`/`getPrimaryPrice`/`getSecondaryPrice`）、`src/market/MarketUtils.sol`（`getGlobalNetObligationRatio`）、`src/position/PositionUtils.sol`（`isPositionLiquidatable`）、`src/vault/LPVault.sol`、`src/adl/AdlUtils.sol`

**关联文档**: [oracle.md](./oracle.md)（机制设计口径）、[2026-06-10-market-listing-oracle-config.md](../../superpowers/specs/2026-06-10-market-listing-oracle-config.md)（团队 2026-06-10 已首次记录 Pyth 校验缺口，本文档六节的结论已使该缺口对 USDC 不再相关）、[2026-08-04-zenith-supplementary-materials](../../audit/2026-08-04-zenith-supplementary-materials.md)、[risk_dynamic_spread_floor_removal.md](../pricing/risk_dynamic_spread_floor_removal.md)（同类风险分析写法参考）

---

## 一、结论先行

FX100 里 USDC 目前**不是**硬编码的 `$1` 常量，而是和 BTC/ETH/AAVE 等资产走**完全相同**的实时 Chainlink oracle 管线（`Oracle.sol::_validatePrices`）。这意味着 USDC 的价格既有"市场真实脱锚"的风险，也有"喂价源故障给出错误报价"的风险——而且这两类风险一旦发生，影响面不会局限于某个市场，因为 **USDC 同时是全协议唯一的抵押品和唯一的结算货币，所有市场共享同一个 vault**（`MarketUtils.getGlobalNetObligationRatio` 注释原话："All markets share the same vault"）。

代码里设计了一道"Chainlink 主报价 vs Pyth 参考价，偏差超 2% 则 revert"的交叉校验（`Oracle.sol:262-320`），理论上能挡住单一喂价源故障。**但经过对真实部署脚本和参数文件的核实，这道校验目前对包括 USDC 的所有 token 都不生效**：全仓库没有任何非测试代码把 `pythPriceFeedKey` 写入过 DataStore，`hasRefPrice` 恒为 `false`，`_validateRefPrice` 从未被执行到。全局阈值参数 `MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR` 可能已经按 2% 配置生效（`configureGeneral.ts` 默认写入，审计文档也确认"2% in prod"），但因为没有任何 token 挂上 Pyth ref feed，这个阈值形同虚设。**这不是本次分析新发现的问题——团队在 2026-06-10 的 `market-listing-oracle-config.md` 里已经明确写过"未配置 pythPriceFeedKey 的 token 完全没有偏差校验……上新资产时这一项是强制检查项"，但截至目前的真实部署仍未补上这个配置面（部署 schema 里甚至没有 `pyth` 字段）。**

**团队讨论后没有选择"修好这道交叉校验"这条路，而是选择了更彻底的方案**（六节详述）：FX100 的抵押品/结算货币只有 USDC 一种（不像 GMX v2 的 GM pool 支持多个稳定币混合抵押），BTC 等 index token 的真实盈亏本来就靠 Chainlink 独立喂价，跟 USDC 无关；trader 和 LP 之间是**用同一种代币互相对赌**，只要"USDC 的价格"在 Oracle 源头被统一、一致地定义为 $1，两边用的是完全相同的记账单位，不存在谁被多算谁被少算的问题。与其花精力去补一个"Chainlink vs Pyth 交叉校验、发现分歧时还是判断不出真相"的防线（二~五节详述了这条路径的天花板），不如从源头砍掉这个风险面——USDC 的价格从此不再是一个"可能出错的输入"，而是一个协议自己定义的记账常数。以下二~五节仍完整保留（说明"如果不这么做，风险有多大、多难解"），六节给出最终方案的完整推理和实现方式。

---

## 二、USDC 的价格机制现状（证据）

### 2.1 不是常量，是实时 oracle 报价

`Oracle.sol:100-104` 的 `setPrices()` → `_validatePrices()` 对所有 token（含 USDC）统一走：

```solidity
IOracleProvider(provider).getOraclePrice(token, data)
```

没有 `if (token == USDC) return 1e24` 这类特殊分支。生产参数文件 `scripts/parameters/base-sepolia/oracle-msol.json` 证实 USDC 用的是和 WBTC/ETH 相同的 schema，接的是 Chainlink **Data Stream**：

```json
{
  "symbol": "USDC",
  "token": "0x1e758baF8Bb30c289943C80dd02109Bdab6A2b2c",
  "dataFeed": { "feedAddress": "0x00...00", "oracleDecimals": "18", "heartbeatDuration": "60" },
  "dataStream": { "feedId": "0x0003dc85e8b01946bf9dfd8b0db860129181eb6105a8c8981d9f28e00b6f60d9", ... }
}
```

`dataFeed.feedAddress = 0x00...00` 说明没有配置传统链上 Price Feed 作为 fallback，USDC 完全依赖这一条 Data Stream。全代码库 `src/` 目录下没有任何地方把 USDC 价格硬编码为 `1e24`/`1e30`——这个数字只出现在测试 mock（`test/fixtures/Fx100Setup.t.sol:365`），不是生产逻辑。

### 2.2 唯一的"稳定币保护"机制，USDC 用的这条 provider 路径里没有

`ChainlinkPriceFeedProvider.sol:49-58` 有一个 `stablePrice` 频带机制：

```solidity
uint256 stablePrice = dataStore.getUint(FX100Keys.stablePriceKey(token));
if (stablePrice > 0) {
    priceProps = Price.Props(price < stablePrice ? price : stablePrice, price < stablePrice ? stablePrice : price);
}
```

如果配置了 `stablePrice`，会把 min/max 夹在"实时报价"和"锚定价"之间，起到限幅作用。但这段逻辑**只存在于 `ChainlinkPriceFeedProvider`**，`ChainlinkDataStreamProvider.sol`（USDC 生产实际用的 provider）**没有这段代码**。即使生产环境给 USDC 配置了 `stablePrice`，也不会生效。

### 2.3 设计上本该有的第二道防线：2% Chainlink vs Pyth 交叉校验

`Oracle.sol:262-320`：

```solidity
uint256 maxRefPriceDeviationFactor = dataStore.getUint(FX100Keys.MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR);
...
if (!provider.isPythOnChainProvider()) {
    (bool hasRefPrice, uint256 refPrice) = PythPriceFeedUtils.getPriceFeedPrice(pyth, dataStore, token);
    if (hasRefPrice) {
        _validateRefPrice(token, validatedPrice.min, refPrice, maxRefPriceDeviationFactor);
        _validateRefPrice(token, validatedPrice.max, refPrice, maxRefPriceDeviationFactor);
    }
}

function _validateRefPrice(...) internal pure {
    uint256 diff = Calc.diff(price, refPrice);
    uint256 diffFactor = Precision.toFactor(diff, refPrice);
    if (diffFactor > maxRefPriceDeviationFactor) {
        revert FxErrors.MaxRefPriceDeviationExceeded(token, price, refPrice, maxRefPriceDeviationFactor);
    }
}
```

这是**全局单一阈值**（不是按 token 单独配置），默认 2%（`scripts/config/defaults.ts:12`，`(FLOAT_PRECISION * 2n) / 100n`；`scripts/parameters/general.sample.json:7`）。理论上对所有 token（含 USDC）无差别生效，是能同时挡住"真实脱锚超出阈值"和"单一喂价源故障"两类风险的关键防线。

### 2.4 核实结果：这道防线在真实部署里从未真正启用过

对真实部署脚本 `scripts/configureOracle.ts` 逐行核实：只调用了 Chainlink classic（`directKey.priceFeed`/`priceFeedMultiplier`/`priceFeedHeartbeatDuration`）和 Chainlink Data Stream（`directKey.dataStreamId`/`dataStreamMultiplier`/`dataStreamSpreadReductionFactor`）两类 setter，**没有一次**调用 `directKey.pythPriceFeed(...)`。

`scripts/config/keys.ts` 确实定义了 `pythPriceFeed(token)`/`pythPriceFeedMultiplier(token)`，但对整仓库 grep（排除 node_modules/lib/out），这两个函数**只在 `keys.ts` 里被定义，从未在任何部署脚本中被调用**——是死代码。

真正被使用的参数文件 `scripts/config/types.ts` 里 `OracleTokenConfig` 类型本身就**只定义了 `dataFeed` 和 `dataStream` 两个字段，没有 `pyth`/`pythFeedId` 字段**——不是"漏填了"，是配置 schema 层面压根没给这个字段留位置。

合约侧读取逻辑 `PythPriceFeedUtils.sol` 印证了后果：

```solidity
function getPriceFeedPrice(address pyth, DataStore dataStore, address token) internal view returns (bool, uint256) {
    bytes32 id = dataStore.getBytes32(FX100Keys.pythPriceFeedKey(token));
    if (id == bytes32(0)) {
        return (false, 0);
    }
    ...
}
```

因为从未有脚本写入过 `pythPriceFeedKey`，链上该 slot 保持默认值 `bytes32(0)`，所有 token（含 USDC）的 `hasRefPrice` 恒为 `false`。测试代码的注释也直接承认了这一点：

- `test/e2e/OracleRisk.t.sol:246`：`// Confirm pythPriceFeedKey is not configured (default in test env)`
- `test/integration/core/Oracle.int.t.sol:495`：`INT-ORACLE-10 未配置 pythPriceFeedKey → 偏差校验完全跳过`

而全局阈值参数 `MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR` 本身大概率**已经**按 2% 写入生产（`configureGeneral.ts` 有默认值兜底，且 `docs/audit/2026-08-04-zenith-supplementary-materials.md` 里称"2% in prod"）——**参数配对了，但因为没有 token 挂 ref feed，if 判断永远走不到里面，形同虚设**。这个问题团队自己在 2026-06-10 就发现并记录了（见 [market-listing-oracle-config.md:341](../../superpowers/specs/2026-06-10-market-listing-oracle-config.md)），但至今没有在真实部署里补上。

### 2.5 结论

| 防线 | 设计意图 | 生产真实状态 |
|---|---|---|
| 主报价来源 | Chainlink Data Stream（USDC 与 BTC/ETH 同管线） | ✅ 生效，但是**唯一**信任源 |
| `stablePrice` 频带 | 把稳定币价格夹在锚定价附近 | ❌ 只存在于 `ChainlinkPriceFeedProvider`，USDC 用的 Data Stream provider 没有这段逻辑 |
| Chainlink vs Pyth 2% 交叉校验 | 挡住单一源故障/极端偏差 | ❌ 全局阈值可能已配置，但因为**没有任何 token（含 USDC）配置 Pyth ref feed**，`hasRefPrice` 恒 false，校验从未执行 |
| Recorded price 过期检查 | 防止使用陈旧价格 | ✅ 生效，但只保证"新鲜"不保证"正确"（见五节） |

**净结果：USDC 当前是一个没有任何交叉验证兜底的单一信任源。**

---

## 三、结构性放大器：为什么 USDC 出问题是"全协议级联"而不是"单市场受损"

这是本分析的核心——即使 2% 校验补上了，USDC 依然比其他任何单一资产的 oracle 风险更危险，因为架构上它扮演了两个横切所有市场的角色：

1. **唯一抵押品**：所有市场的保证金都以 USDC 计价。
2. **唯一结算货币 + 全市场共享同一个 vault**：`MarketUtils.getGlobalNetObligationRatio`（`:188-212`）用 USDC 的二级价对**整个协议**的池子做估值，不是按市场隔离的。

BTC 的 oracle 出问题，只影响持有 BTC 仓位的用户；USDC 的 oracle 出问题，**同时冲击所有市场的清算判定、保证金计算、LP vault 估值、ADL 触发条件**——因为这四类计算的入参里都有 USDC 价格，而且用的是同一个全局函数。

### 3.1 依赖 USDC oracle 价格的关键路径

| 用途 | 文件:行号 | 函数 | 说明 |
|---|---|---|---|
| 抵押品估值取价入口 | `MarketUtils.sol:122,740` | `getMarketPrices` | `oracle.getPrimaryPrice(market.collateralToken)` |
| 清算判定/保证金计算 | `PositionUtils.sol:324-410` | `isPositionLiquidatable` | `collateralUsd = collateralAmount × collateralTokenPrice.min` |
| 保证金充足性校验 | `PositionUtils.sol:444-447` | `willPositionCollateralBeSufficient` | 同上口径 |
| LP Vault 估值（全市场共享） | `MarketUtils.sol:188-212` | `getGlobalNetObligationRatio` | `oracle.getSecondaryPrice(market.collateralToken, isADLStart)` |
| ADL 触发条件 | `MarketUtils.sol:1181-1193`, `AdlUtils.sol:80-90`, `AdlHandler.sol:93-138` | `isGlobalNetObligationRatioExceeded` / `updateAdlState` / `executeAdl` | 均间接调用上面的全局函数 |
| LP 提款闸门 | `LPVault.sol:355-361` | `_validateWithdrawalsAllowed` | 提款前必须过这道全局检查 |

---

## 四、两种风险场景要分开分析——协议的"正确响应"完全不同

### 4.1 场景 A：USDC 真实脱锚（如 SVB 事件式挤兑，跌到 $0.99/$0.90）

这是真实发生的市场事实，oracle 报出真实价格本身是"对"的。破坏性在于**联动被放大**：

- 全市场同时触发保证金不足：不是某个市场出问题，是所有仓位的抵押品估值同时下调。USDC 跌 1%，相当于全协议所有仓位保证金瞬间少 1%，无论该仓位方向、盈亏如何。
- 相关性叠加：真实脱锚通常伴随恐慌性挤兑和链上拥堵，keeper 清算/ADL 执行会排队延迟，坏账窗口被拉长。
- LP Vault 估值联动失真：`getGlobalNetObligationRatio` 用 USDC 价格给整个池子估值，USDC 跌价会推高"全局净敞口比例"，可能误触发 ADL 或直接卡住 `LPVault.sol:357` 的提款闸门——即使各市场自身的多空盈亏结构完全没变。

这个场景下协议**方向是对的**（反映真实贬值），但**结构是缺陷**：单一抵押品脱锚被放大成"全协议清算 + 全协议提款冻结"的联动事件，而不是隔离在受影响的仓位里。

### 4.2 场景 B：Chainlink oracle 故障（真实 USDC 仍是 $1，喂价源给出错误数据）

这个更危险，因为协议会依据**虚假信号**做出**真实且不可逆**的清算/ADL 动作。

可能的故障模式：Data Stream 签名节点故障/被攻破、链下聚合逻辑 bug、极端行情下多个 Chainlink 节点集体报出闪崩价（历史上稳定币 feed 闪崩到 $0 的事件已发生过多次）。

后果：

- **误清算**：仓位保证金实际充足，但因为 USDC 被错误报价压低，`collateralUsd` 被错误压低，触发不该发生的清算——用户资金损失且不可逆。
- **误触发 ADL**：`isGlobalNetObligationRatioExceeded` → `AdlHandler.executeAdl` 基于错误的全局净敞口比例对盈利仓位自动减仓，伤及无辜。
- **2% 校验能不能挡住，取决于三个前提，目前全都不满足或不确定**：
  1. USDC 需要配置 Pyth ref feed——**当前未配置**（第二节已核实），完全挡不住；
  2. 即使配了，若是"全网性事件"（Chainlink 和 Pyth 恰好同时出错，或两者共享上游数据源），两个源"一起错"，2% 校验通过但价格仍是错的；
  3. 阈值本身是 2%，如果故障报价刚好落在阈值内（比如 $0.985），校验不会 revert，但清算/ADL 判定已经被污染——2% 对波动资产（BTC）合理，对稳定币而言是一个相当宽的容忍带。
- **Recorded price 过期叠加的独立故障路径**：`Oracle.sol:165-183` 的 `_getSecondaryPrice`，若 USDC 的 `latestRecordedPrices` 超过 `MAX_RECORDED_PRICE_AGE` 未刷新，会直接 `revert FxErrors.MaxPriceAgeExceeded`，导致 `getGlobalNetObligationRatio` 整体失败——**冻结全协议 LP 提款和 ADL**。这是可用性风险而非"给错误价格"的正确性风险，但同样因为"USDC 是全市场共享的唯一入参"而被放大到全局，而不是局限在某个市场。

---

## 五、级联影响清单

| # | 影响 | 触发路径 | 严重度 |
|---|---|---|---|
| 1 | 全协议同时误清算/漏清算 | `PositionUtils.isPositionLiquidatable` 用被污染的 USDC 价格算 `collateralUsd` | 高——直接、不可逆的用户资金损失 |
| 2 | ADL 误触发或该触发未触发 | `MarketUtils.isGlobalNetObligationRatioExceeded` → `AdlHandler.executeAdl` | 高——伤及无关的盈利仓位 |
| 3 | LP 提款全局冻结 | `LPVault._validateWithdrawalsAllowed` 依赖同一个全局函数，USDC 价格异常或 recorded price 过期都会导致整体 revert | 高——可用性风险，且不限于受影响的单个市场 |
| 4 | 保证金充足性误判 | `PositionUtils.willPositionCollateralBeSufficient` | 中～高——影响新开仓/加仓校验 |
| 5 | 前端可用流动性显示异常 | `ReaderUtils` 依赖同一套全局估值 | 中——用户体验/信任问题，非资金安全问题 |
| 6 | 2% 交叉校验实际不生效 | 无 token 配置 `pythPriceFeedKey`（本文档核实的现状） | 高——是上面 1/2/3 能发生的**前提**，不修复其余防线都缺一道关键闸门 |

---

## 六、最终方案：在 Oracle 源头把 USDC 硬编码为 $1

### 6.1 核心论证：为什么这不是"逃避问题"而是"问题在 FX100 的架构下本来就不存在"

一开始的直觉反对是："硬编码会不会让 trader 和 LP 之间的结算变得不公平（比如真实 depeg 时赢家被少付、输家少付）？"——推演之后这个直觉是错的，原因如下：

FX100 的 PnL → USDC 数量换算公式是：

```solidity
// DecreasePositionCollateralUtils.sol:115
deductionAmountForPool = values.basePnlUsd.toUint256() / cache.pnlTokenPrice.max;
// DecreasePositionUtils.sol:244
cache.pnlTokenPrice = cache.prices.collateralTokenPrice;
```

`basePnlUsd` 由 BTC 等 index token 的**独立 Chainlink 真实美元喂价**算出，跟 USDC 无关；`collateralTokenPrice` 是 USDC 的价格。这个除法本质上是在拿两个独立的美元报价，拼出一个"BTC/USDC"的隐含汇率——这和 Binance 的 BTC/USDT 永续合约想做的事是一回事，只是 Binance 用真实市场撮合出这个汇率（USDT depeg 会自然反映在 BTC/USDT 报价里），FX100 是靠公式硬拼出来的。

**只要这个 `collateralTokenPrice` 在系统里处处（清算判定、ADL、LP vault 估值、PnL 结算）取同一个值**，无论这个值是 1 还是随时波动的实时价，trader 和 LP 之间的结算都是**内部自洽、零和**的——因为双方用的是完全相同的记账单位，代币总量守恒，不存在谁被多算谁被少算。真正的差别只在于：这个"BTC/USDC 隐含汇率"是否精确追踪了"如果 USDC 是在真实市场里被交易，此刻会跟 BTC 换出什么汇率"——这不是内部公平性问题，是**协议想不想让自己的 PnL 数字代表真实美元购买力**的产品定位问题，不是安全漏洞。

### 6.2 为什么 FX100 可以这么做，而 GMX v2 不能

GMX v2 的 GM pool 支持**多个稳定币混合抵押**（USDC/USDT/DAI 同一个池子），如果某个稳定币被硬编码而另一个用活价，depeg 时会出现"用被硬编码高估的稳定币套走另一种真实计价的稳定币"的跨资产套利面——这种情况下活价格是必须的护栏。

**FX100 只有 USDC 一种抵押品，不存在这个跨资产套利面。** 硬编码不会给 FX100 引入 GMX 需要防的那类攻击向量——GMX 的复杂度是为了解决一个 FX100 架构里根本不存在的问题，照搬没有意义。

### 6.3 实现要求：必须在 Oracle 源头做，不能分散到各调用点

要让"处处一致"这个前提真正成立，唯一正确的实现方式是在 **`Oracle.sol` 的 `getPrimaryPrice`/`getSecondaryPrice`（或对应的 `IOracleProvider` 实现）里**，对抵押品 token 地址直接短路返回一个常量价格，完全跳过 Chainlink Data Stream 的实际取价：

- `MarketUtils.sol:122,740`（`getMarketPrices`）、`MarketUtils.sol:205`（`getGlobalNetObligationRatio`）、`PositionUtils.sol` 的清算/保证金判定、`LPVault.sol` 的提款闸门——这些全部统一走 `oracle.getPrimaryPrice(collateralToken)` / `oracle.getSecondaryPrice(collateralToken, ...)` 这两个入口，**在源头改一次，下游全部自动一致**。
- **不要**在 `PositionUtils`/`MarketUtils`/`LPVault` 各自加 `if (token == USDC) ... ` 特判——这种分散实现只要漏改一处，就会出现"有的地方硬编码、有的地方还在用活价"的真正不一致，那才是会被套利的漏洞（比如清算判定用硬编码但 ADL 用活价，两者对同一笔头寸算出不同的"USDC 保证金价值"，可能被利用来构造清算和 ADL 判定互相矛盾的头寸）。硬编码必须是**单一开关、单一生效点**。
- 二~五节讨论的 `_validateRefPrice`/Pyth ref feed/Stream vs Feed 交叉校验，一旦 USDC 走这条硬编码路径，**全部变得不相关**——不需要再补 Pyth 配置面，不需要再纠结 2% 还是 0.2% 的阈值，`MAX_RECORDED_PRICE_AGE` 过期检查对 USDC 也不再适用（没有价格需要"新鲜"）。这些机制继续对 BTC/ETH 等 index token 生效（它们的价格风险是另一个独立话题，跟本文档无关）。
- **判断条件建议做成 DataStore 配置项，而不是 Solidity 常量地址比较**（比如 `isPeggedStablecoin[token]` 这个 mapping，走一个新 key），不要写成 `if (token == Addresses.USDC)`。理由见 6.6——这个选择直接决定了未来换抵押品代币时要不要重新编译合约。

### 6.4 唯一没有解决、且任何定价方案都解决不了的残余风险

LP 池子里存的是**真实的 USDC 代币**。如果 USDC 现实中永久脱锚（比如发行方出现真实偿付问题），LP 想把这些代币兑换回真实美元时能拿到多少，跟 FX100 合约内部怎么记账没有任何关系——硬编码不会消除这个风险，只是不让合约去"追踪"它。这其实更诚实：不用一个本身可能是错的实时价格去掩盖一个真正的偿付能力问题，比"看起来很努力地追踪但可能追踪错"更干净、也更不容易被误判为"协议已经处理了这个风险"。

对这种极端、永久性的 depeg，建议保留一个**治理层面**的应急开关（多签暂停协议 / 迁移抵押品到另一种资产），这是人工/治理动作，不是定价公式，所以不会重新引入本文档一直在讨论的那个 oracle 单点风险问题。

### 6.5 如果未来架构变了（引入多稳定币抵押），二~五节的方案要重新启用

如果某天 FX100 决定支持多种稳定币混合抵押（类似 GMX GM pool），6.2 节"为什么可以硬编码"的前提就不再成立，此时需要回头启用七节里描述的活价格 + 交叉验证方案（补 Pyth ref feed 配置面、per-token 更紧的偏差阈值、稳定币频带熔断、TWAP）。这也是为什么七节的分析被完整保留而不是删除——它是"多抵押品架构下必须解决的问题"的完整备忘，只是在当前单一抵押品架构下暂时不需要。

### 6.6 如果未来换掉整个抵押品代币（比如从 mock USDC 换成另一种稳定币，重新部署一套全新的市场），要注意什么

这是"单一抵押品换成另一种资产、但仍是全新部署（没有存量仓位/LP）"的场景，跟 6.5 的"引入多种抵押品混合"是两件不同的事，答案也不同。已核实两个关键事实：

- **抵押品身份本来就是部署时的配置值，不是写死在业务逻辑里的常量**：`MarketFactory.sol:59` 建市场时读的是 `dataStore.getAddress(FX100Keys.COLLATERAL_TOKEN)`——一个全局 DataStore key，并且强制要求跟 LP vault 的底层资产一致（`:65-66`，不一致直接 `revert`）。
- `Addresses.sol:10` 里那个 `USDC` 常量，全仓库 grep 下来**只在一个测试文件里被引用**（`test/unit/constants/Constants.t.sol:58`，纯粹断言地址没变），没有被任何 `src/` 业务逻辑读取。

**结论：只要新代币仍然是"另一种 $1 锚定的稳定币"，全新部署时确实基本上只是改配置，不需要碰 Solidity 源码**——把 `COLLATERAL_TOKEN` 这个 DataStore key 指向新地址、部署 vault 时用新代币作为底层资产即可。但有两个条件必须同时满足，否则这个结论不成立：

1. **6.3 节提到的硬编码判断条件，必须实现成 DataStore 配置（如 `isPeggedStablecoin[token]`），不能是编译期常量地址比较**——如果写成 `if (token == Addresses.USDC)`，换币就必须改这行代码、重新编译；写成配置项，换币纯粹是部署后的一笔配置交易，不需要动源码。
2. **价格精度常量必须跟着新代币的 decimals 重新算，不能硬抄 `1e24`**：`1e24 = 10^(30 - 6)`，这个 6 是 USDC 的 decimals，30 是协议统一的价格精度。如果新代币 decimals 不是 6（比如常见的 18 位 ERC20），精度常量必须是 `10^(30 - 新decimals)`，否则会算错。实现时建议直接读 `IERC20Metadata(token).decimals()` 动态算这个数，而不是写死某个数字常量。

**且这一切只在"新代币仍是稳定资产"的前提下成立。** 如果换成的是会波动的代币（不是稳定币），硬编码 $1 这个方案本身就不适用了——那不再是"depeg 风险"，是跟 BTC 一样的"抵押品本身会涨跌"的正常波动风险，必须用真实活价格去追踪才能让清算判定有意义，等于要撤回本文档六节的结论，重新启用七节的活价格 + 交叉验证方案。换句话说：**"换币不用动代码"这个结论的边界，就是"换的还是不是稳定币"，不是"换的是不是 USDC"。**

---

## 七、备选方案：如果不硬编码，需要活价格追踪时的分层清单

> 以下方案是六节最终方案定案**之前**评估过的路径，团队没有采用，但作为"如果未来 FX100 架构变化（如支持多稳定币抵押，见 6.5）"时的备忘完整保留。

### 7.1 立即可做（配置/监控层，不改合约）

1. **补齐 Pyth ref feed 配置面**：`scripts/config/types.ts` 的 `OracleTokenConfig` 需要新增 `pyth`/`pythFeedId` 字段，部署脚本 `scripts/configureOracle.ts` 需要新增对 `directKey.pythPriceFeed(...)` 的调用，至少先给 USDC 挂上 Pyth 的 USDC/USD ref feed——这是让已经写死在合约里的 2% 校验逻辑第一次真正跑起来的前提,是成本最低、收益最确定的一步。
2. **给 USDC 单独配一个比 2% 更紧的偏差阈值**：`MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR` 目前是全局单一阈值，BTC 波动 2% 是正常行情，但 USDC 偏离 0.2%~0.3% 已经是异常信号，0.5%~1% 应触发降级。建议把这个 key 改成 per-token（或至少给稳定币类目单独开一个更紧的全局稳定币阈值），不应该和 BTC 共用同一个数字。
3. **给 recorded price keeper 加监控告警 + 备份刷新任务**，避免 USDC 因长期无人交易导致 `latestRecordedPrices` 过期，冻结全协议（这是场景 B 里独立于"价格对不对"的第二条故障路径）。
4. **上新资产 checklist 里补一条强制项**：`market-listing-oracle-config.md` 已经在 2026-06-10 写过这个待办，建议正式纳入上线 checklist（类似记忆里的 `executionFeeSubsidize`/动态价差零配置 那类"缺省回退=高风险"检查项），避免后续新资产重复踩同一个坑。

### 7.2 Stream vs Feed（或 Pyth）交叉校验的四象限逻辑，以及"两者都判断不出真相时怎么办"

| Stream | Feed/Pyth | 结论 |
|---|---|---|
| 正常 | 正常 | 没事 |
| 偏离 -0.2% | 同步偏离 -0.2%（差值在阈值内） | 真实 depeg，两个源一致，Stream 价格可用 |
| 偏离 -0.2% | 正常（=$1） | **不知道是 Stream 错还是 Feed 错，谁的都不能用** |
| 两者都偏离，且彼此之间差值也很大 |  | 至少一个坏了，都不能用 |

第三种情况是**纯粹的认知边界，不是能靠公式解决的工程问题**：链上没有第三方真相可以核对，两个独立源打平手时，代码没法知道谁对。正确答案不是"猜一个"，而是**认输，降级成安全状态**——触发这个不确定分支时直接熔断（暂停清算/ADL/新开仓，只留只减仓，冻结提款闸门自动判定），等人工/多签介入，靠链下信息源（Curve/Uniswap USDC/USDT 池子即时汇率、发行方官方公告）做判断。加第三个独立源（如 DEX TWAP，故障模式与 Chainlink 不同）能降低"两个源同时挂"的概率，但永远无法降到 0——这是所有 DeFi 协议共同的尾部风险边界。

### 7.3 合约层面改进（需要工程师排期）

1. **给 USDC 补一条稳定币价格频带/熔断逻辑**，且要能在 `ChainlinkDataStreamProvider` 下工作（现有 `stablePrice` 逻辑只存在于 `ChainlinkPriceFeedProvider`，覆盖不到 USDC 实际用的 provider）：当 USDC 报价偏离 $1 超过阈值（比如 3%~5%）时，不直接把这个价格喂给清算/ADL 判定，而是触发系统级降级（暂停清算/ADL/提款，只保留只减仓路径），走人工/多签确认后再恢复。
2. **清算/ADL 判定改用时间加权价格（TWAP）**而非瞬时价格，至少给闪崩式误报价一个缓冲窗口，降低单笔尖峰价格触发大规模清算的概率。

### 7.4 架构层面（长期）

1. 考虑支持多稳定币抵押（不止 USDC），或至少在协议里为"抵押品清单"预留扩展性，分散单一抵押品脱锚的相关性风险——**这也是唯一会让六节的硬编码方案失效、需要回头启用本节方案的场景**。
2. 把"全局净敞口比例"计算从强依赖单一 USDC 瞬时价格，改为对 USDC 价格设定一个可配置的安全区间（clamp），区间外触发保守模式而非线性套用异常价格。

---

## 八、给工程师/审计方的一句话总结

USDC 的 oracle 风险源头是"唯一抵押品 + 全市场共享结算货币叠加在一个没有交叉验证的活价格输入上"——但 FX100 的架构（单一稳定币抵押，trader 与 LP 直接对赌）恰好满足"硬编码是安全的"这个前提（不存在 GMX 式的跨稳定币套利面）。团队的结论是不去修补那道从未真正生效的 2% Pyth 交叉校验，而是从 Oracle 源头把 USDC 价格定义为常量 $1，彻底移除这个风险面；唯一要守住的实现纪律是"硬编码必须在源头做、必须处处一致"，唯一没解决（也不该指望靠定价方案解决）的是 LP 真实资金对 USDC 真实脱锚的裸露敞口，这部分交给治理层面的应急开关处理。若未来引入多稳定币抵押，七节的方案需要重新启用。

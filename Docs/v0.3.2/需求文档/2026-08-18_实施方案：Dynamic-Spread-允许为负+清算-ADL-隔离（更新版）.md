# 🔧 实施方案：Dynamic Spread 允许为负 + 清算/ADL 隔离

> Notion 页面：[原文](https://app.notion.com/p/3b13d7873f2c81da808ccff72c665a67)
> 作者：fx100-sync（Gordon 的 fx100-contracts 仓库文档同步机器人，内容出自 Gordon）
> 创建时间：2026-08-03
> 最后编辑：2026-08-18
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 产品 / FX100 / 技术相关 / 合约 / 🏗️ 设计提案
> 类型：设计文档
> 版本说明：取代 `2026-07-29_Dynamic-Spread-允许为负+清算-ADL-隔离实施方案.md`（旧 Notion 页 3aa3d7873f2c81e18d82eaf8b851ce13，为精简版、状态「待评审实施」）。本页为完整实施方案且实质已变：①状态行改为「✅ 已实施（2026-08-03 核对通过，release/v0.3.2 @ 7d639c9）」并新增 2026-08-03 实施核对摘要；②新增第九节实施核对（forge 实测 9 用例全 PASS；三.3 ADL 隔离复用既有 `secondaryOrderType` 通路而非新增字段；清算/ADL 路径保留普通交易同一份 `maxDynamicSpread` 上限，团队已拍板）；③新增第十节 24 个上线资产 `MIN/MAX_DYNAMIC_SPREAD` 具体数值建议（2026-08-17：BTC/ETH −0.02%/0.25%、SOL/XRP −0.02%/0.50%、HYPE −0.05%/0.50%，其余 19 个 −0.05%/1.50%，DOGE 例外 −0.02%）；④参数名 `MIN_DYNAMIC_SPREAD`/`MAX_DYNAMIC_SPREAD` 与 clamp 结构、前端联动要求与旧版一致，但正文为带代码与行号的逐节展开。

> 👥 受众：合约工程师　｜　来源：docs/analysis/pricing/impl_spec_negative_dynamic_spread.md

# 实施方案：Dynamic Spread 允许为负 + 清算/ADL 隔离（给合约工程师）

**状态**: ✅ 已实施（2026-08-03 核对通过，`release/v0.3.2` @ `7d639c9`，对应 commit `4a40477`/`c8b84e3`/`7d639c9`）

**关联文档**: [risk_dynamic_spread_floor_removal.md](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/analysis/pricing/risk_dynamic_spread_floor_removal.md)（风险分析，本方案的前置阅读材料，尤其是二.3、2.3.1-2.3.3、五节"清算交互"）、[summary_dynamic_spread_floor_removal.md](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/analysis/pricing/summary_dynamic_spread_floor_removal.md)（精炼版）、[2026-08-03-v032-audit-fix-verification.md](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/audit/2026-08-03-v032-audit-fix-verification.md)（实施核对报告，含 `forge test` 实测记录）

**涉及文件**: `src/pricing/PositionPricingUtils.sol`、`src/constants/FX100Keys.sol`、`src/position/PositionUtils.sol`、`src/position/IncreasePositionUtils.sol`、`src/position/DecreasePositionCollateralUtils.sol`、`src/position/PositionEventUtils.sol`、`src/reader/ReaderPricingUtils.sol`、`src/order/Order.sol`、`src/adl/AdlUtils.sol`、`src/config/Config.sol`

> **2026-08-03 实施核对摘要**：`git worktree` 拉取 `origin/release/v0.3.2` 到隔离目录，`forge build` 全量通过、`test/integration/PositionPricing.t.sol` 9 个用例全 PASS。与本方案逐条核对：一.3/二.2/三.1 均逐字落地（含"修正版"的无条件 `setOrderType(Liquidation)`）；三.3 的 ADL 隔离用了比本方案提议更干净的现成通路（详见九.2）。**清算/ADL 是否保留正向上限**：实现里只清零了 `minDynamicSpread`（不给 rebate），沿用了普通交易那份 `maxDynamicSpread` 上限——**2026-08-03 团队已拍板保留这个现状**（与普通交易一致），详见九.3。完整核对细节见九节。

---

## 零、这个方案要做什么（一句话）

把 `PositionPricingUtils.getDynamicSpread` 的返回值从"floor at 0 的 `uint256`"改成"可以为负的 `int256`"，正负幅度按市场、按方向可配置（类似 Avantis）；但清算和 ADL 这类强制平仓，继续保持今天 floor-at-0 的行为，不受影响——这是风险分析文档五节的结论，本方案是它的具体落地代码设计。

---

## 一、新增配置：卡在 `dynamicSpread` 求和之后，不是 `skewImpact` 那一层

> ⚠️ **本节是对初版方案的修正**：初版把"按市场/方向可配置、允许为负"这个需求实现成了重新设计 `minSkewImpactKey`/`maxSkewImpactKey`（即改 `skewImpact` 自己的 clamp）。这是不必要且不对的——`skewImpact` 今天就已经是有正有负、有自己的 min/max clamp 的（见下面 1.1），这一层完全不用动。真正该加的是一个**全新的、卡在三项求和之后**的 cap，跟 Avantis 的 `posSpreadCap`/`negSpreadCap` 严格对应。

### 1.1 现状确认：`skewImpact` 自己已经有正负和 clamp，这层不用改

`PositionPricingUtils.sol:202-219`：

```solidity
function getSkewImpact(...) internal view returns (int256) {
    int256 skewImpact = (dataStore.getInt(FX100Keys.skewImpactFactorKey(marketIndex)) * skewRef.toInt256()) / int256(Precision.WEI_PRECISION);
    if (balanceWasImproved) {
        skewImpact = -skewImpact;   // 改善平衡时取负，今天就是这样
    }
    int256 minSkewImpact = dataStore.getInt(FX100Keys.minSkewImpactKey(marketIndex));
    int256 maxSkewImpact = dataStore.getInt(FX100Keys.maxSkewImpactKey(marketIndex));
    return SignedMath.max(minSkewImpact, SignedMath.min(maxSkewImpact, skewImpact));  // 已经是 clamp(min, max)
}
```

这个函数、以及它用到的 `minSkewImpactKey`/`maxSkewImpactKey`（`FX100Keys.sol:625-633`），**本次改动完全不用碰**。

### 1.2 现状确认：`dynamicSpread` 求和之后目前没有可配置的 cap，只有硬编码的 `<= 0`

`PositionPricingUtils.sol:170-174`：

```solidity
int256 dynamicSpread = skewImpact + int256(constantPriceSpread) + priceImpactSpread;
if (dynamicSpread <= 0) {
    return (0, balanceWasImproved);   // 这里的 0 是字面量，不是从 DataStore 读的参数
}
```

grep 了整个 `FX100Keys.sol`（含所有 `SPREAD`/`DYNAMIC_SPREAD` 相关命名），确认目前没有任何对应的 key——这跟 `MAX_POSITION_IMPACT_FACTOR_FOR_LIQUIDATIONS`、`SecondaryOrderType.Adl` 那种"GMX fork 遗留但没接线"的死代码不是一回事，这里是**真的没有**，需要新增。

### 1.3 真正要加的：新增 `MIN_DYNAMIC_SPREAD`/`MAX_DYNAMIC_SPREAD`，卡在求和之后，对应 Avantis 的 `posSpreadCap`/`negSpreadCap`

回看 Avantis 的真实代码（`PairInfos.sol:319`）：

```solidity
int dynamicSpread = (int(pairsStorage.pairSpreadP(pairIndex, isPnl)) + priceImpactSpread + skewImpactSpread);
dynamicSpread = dynamicSpread < -int(posSpreadCap / 10) ? -int(posSpreadCap / 10)
    : (dynamicSpread > int(negSpreadCap / 10) ? int(negSpreadCap / 10) : dynamicSpread);
```

`posSpreadCap`/`negSpreadCap` 卡的就是三项加总之后的值，不是 `skewImpactSpread` 单独那一层。团队说"类似 Avantis 的模式"，字面意思就是把 `getDynamicSpread` 最后那行 `if (dynamicSpread <= 0) return 0` 换成一对可配置、`min` 可以为负的上下限，FX100 应该照这个结构做，而不是去改 `skewImpact` 的 clamp。

新增两个 key（`FX100Keys.sol`），two-arg 模式照抄已有的 `positionFeeFactorKey`（`FX100Keys.sol:1363-1364`）：

```solidity
bytes32 public constant MIN_DYNAMIC_SPREAD = keccak256(abi.encode("MIN_DYNAMIC_SPREAD"));
bytes32 public constant MAX_DYNAMIC_SPREAD = keccak256(abi.encode("MAX_DYNAMIC_SPREAD"));

function minDynamicSpreadKey(uint256 marketIndex, bool isLong) internal pure returns (bytes32) {
    return keccak256(abi.encode(MIN_DYNAMIC_SPREAD, marketIndex, isLong));
}
function maxDynamicSpreadKey(uint256 marketIndex, bool isLong) internal pure returns (bytes32) {
    return keccak256(abi.encode(MAX_DYNAMIC_SPREAD, marketIndex, isLong));
}
```

这是全新的 key，不存在迁移问题（没有旧值需要保留），但**上线时必须显式为每个市场的 long/short 写入初始值**——`dataStore.getInt` 对未写入的 key 默认返回 `0`，如果漏配，`minDynamicSpread`/`maxDynamicSpread` 都会是 `0`，等效于自动退回今天的 floor-at-0 行为（不会报错，但新功能形同虚设），上线检查清单里必须逐市场、逐方向核对这两个 key 是否已写入非零值。

> ⚠️ **重要联动细节——两层 clamp 谁说了算**：`skewImpact` 自己的 `minSkewImpactKey`（今天比如 BTC 是 -0.5%）和这里新加的 `minDynamicSpread`（新参数）是**两层独立的 clamp**，谁更紧谁说了算：
> - 如果新的 `minDynamicSpread` 设得**比** `skewImpact` 自己能达到的下限还负（比如 minDynamicSpread=-1%，而 skewImpact 自己最多到 -0.5%），那 `minDynamicSpread` 根本不会生效——因为 `dynamicSpread` 求和的结果永远到不了 -1% 这么负（`skewImpact` 早就先被自己的 clamp 卡住了），新加的这层等于形同虚设。
> - 也就是说：**如果目标是让 `dynamicSpread` 能比今天更负，只加 `minDynamicSpread` 这一个新 key 是不够的，可能还需要通过治理把 `minSkewImpactKey` 现有的配置值调得更负**（不需要改它的 key 结构/签名，只是调整已经存在的那个值），这样 `skewImpact` 自己才有空间产生更负的结果，`minDynamicSpread` 才能作为一道"上面还有一层更松"的额外安全网发挥作用；反过来，如果 `minDynamicSpread` 设得比 `skewImpact` 现有的界限更紧，它就会是真正生效的那道闸门，`skewImpact` 那层反而是形同虚设的那个。
> 上线前建议把这两个数字放在一张表里对齐清楚，明确哪一层是"实际生效的约束"，不要两边各自配置、互相不知道对方数值，导致新参数改了却没有任何实际效果。

---

## 二、核心改动：`getDynamicSpread` 允许返回负值

### 2.1 现状（`PositionPricingUtils.sol:150-175`）

```solidity
function getDynamicSpread(GetPriceImpactUsdParams memory params) internal view returns (uint256, bool) {
    if (params.usdDelta == 0) {
        return (0, false);
    }
    uint256 constantPriceSpread = params.dataStore.getUint(FX100Keys.constantPriceSpreadKey(params.market.marketIndex));
    int256 priceImpactSpread = getPriceImpactSpread(params);
    OpenInterestParams memory openInterestParams = getNextOpenInterest(params, true);
    bool balanceWasImproved = isBalanceWasImproved(openInterestParams);
    int256 skewImpact = getSkewImpact(params.dataStore, params.market.marketIndex, openInterestParams, balanceWasImproved);

    int256 dynamicSpread = skewImpact + int256(constantPriceSpread) + priceImpactSpread;
    if (dynamicSpread <= 0) {
        return (0, balanceWasImproved);
    }
    return (uint256(dynamicSpread), balanceWasImproved);
}
```

### 2.2 改动后

```solidity
function getDynamicSpread(GetPriceImpactUsdParams memory params, bool isLiquidationContext)
    internal
    view
    returns (int256, bool)
{
    if (params.usdDelta == 0) {
        return (0, false);
    }
    uint256 constantPriceSpread = params.dataStore.getUint(FX100Keys.constantPriceSpreadKey(params.market.marketIndex));
    int256 priceImpactSpread = getPriceImpactSpread(params);
    OpenInterestParams memory openInterestParams = getNextOpenInterest(params, true);
    bool balanceWasImproved = isBalanceWasImproved(openInterestParams);
    // getSkewImpact 及其 minSkewImpactKey/maxSkewImpactKey 完全不用改，签名不变
    int256 skewImpact = getSkewImpact(params.dataStore, params.market.marketIndex, openInterestParams, balanceWasImproved);

    int256 dynamicSpread = skewImpact + int256(constantPriceSpread) + priceImpactSpread;

    if (isLiquidationContext) {
        // 清算/ADL：保持今天的行为，永远不给 rebate，只允许 ≥0 的正常成本
        if (dynamicSpread <= 0) {
            return (0, balanceWasImproved);
        }
        return (dynamicSpread, balanceWasImproved);
    }

    // 普通自愿开平仓：新增的求和后 cap，对应 Avantis 的 posSpreadCap/negSpreadCap，min 可以为负
    int256 minDynamicSpread =
        params.dataStore.getInt(FX100Keys.minDynamicSpreadKey(params.market.marketIndex, params.isLong));
    int256 maxDynamicSpread =
        params.dataStore.getInt(FX100Keys.maxDynamicSpreadKey(params.market.marketIndex, params.isLong));
    dynamicSpread = SignedMath.max(minDynamicSpread, SignedMath.min(maxDynamicSpread, dynamicSpread));

    return (dynamicSpread, balanceWasImproved);
}
```

比初版方案改动更小：`getSkewImpact` 函数体和它的两个现有 key 完全不动，只有 `getDynamicSpread` 这一个函数的最后几行变了，加了两个全新 key。

**关键点**：返回类型从 `uint256` 改成 `int256`，是本次改动里唯一"牵一发动全身"的类型变更，波及范围见第四节。**建议先落地这一步类型重构、跑通全部现有测试（此时行为应该和改动前完全一致，因为逻辑还没变），再叠加"允许负数"的业务逻辑作为第二个独立提交**，把"类型迁移"和"业务逻辑变化"这两类风险分开验证，不要一个 PR 里混着做。

---

## 三、清算/ADL 隔离

### 3.1 清算判定：一行修改，把 `isPositionLiquidatable` 的合成订单**无条件**标记成 Liquidation 类型

> ⚠️ **本节是对初版方案的第二次修正**：初版把这行改动写成了 `if (forLiquidation) { ... }`，只在 `forLiquidation=true` 时才标记——这是错的。原因见下面 3.1.1。

现状（`PositionUtils.sol:336-343`），合成的 `cache.params.order` 从来没设置过 `orderType`：

```solidity
cache.params.contracts.dataStore = dataStore;
cache.params.market = market;
cache.params.position = position;
cache.params.order.setSizeDelta(position.sizeInUsd());
cache.params.order.setIsSizeDeltaUsd(true);
cache.params.order.setIsLong(position.isLong());
cache.params.order.setAcceptablePrice(position.isLong() ? 0 : type(uint256).max);
```

改成（新增最后一行，**不加 `if`，无条件执行**）：

```solidity
cache.params.contracts.dataStore = dataStore;
cache.params.market = market;
cache.params.position = position;
cache.params.order.setSizeDelta(position.sizeInUsd());
cache.params.order.setIsSizeDeltaUsd(true);
cache.params.order.setIsLong(position.isLong());
cache.params.order.setAcceptablePrice(position.isLong() ? 0 : type(uint256).max);
cache.params.order.setOrderType(Order.OrderType.Liquidation);
```

### 3.1.1 为什么必须无条件——`forLiquidation=false` 覆盖的是开仓/减仓的常规安全校验，不是只有真清算才用得到

`isPositionLiquidatable` 只在函数内部用 `forLiquidation` 来选 `getMinCollateralFactorForLiquidation` 还是 `getMinCollateralFactor`（`PositionUtils.sol:387-391`），跟"这次调用是不是为了真的执行清算"没有关系。查了全部调用点：

| 调用点 | 场景 | `forLiquidation` 传的值 |
|---|---|---|
| `IncreasePositionUtils.sol:153` | **每次开仓/加仓后**（含开 100x 这种） | `cache.sizeDeltaUsd == 0`——真实开仓/加仓时 `sizeDeltaUsd≠0`，所以是 **`false`** |
| `DecreasePositionUtils.sol:293-303` | **每次减仓/平仓后** | 写死 **`false`** |
| `DecreasePositionUtils.sol:228` | 真正的清算执行 gate | `true` |
| `Reader.sol:136` | 前端/off-chain 只读查询 | 由调用方传入，前端预览通常也是 `false` |

也就是说，**真实开仓、加仓、减仓这些最常见的操作，走的都是 `forLiquidation=false`**。如果按初版方案只在 `forLiquidation=true` 时才标记 `Liquidation`，这些常规操作后的安全校验会照样调用新的、允许为负的 `dynamicSpread` 逻辑——**如果这笔交易恰好是"改善平衡"方向，安全校验就可能被一个临时 rebate"骗"到，让本来因为保证金太薄该被拒绝的仓位（比如最小保证金 1% 对应的 100x）通过校验**，这正好是本节要堵住的漏洞，且是常规交易路径，不是边缘场景。

修复方法很简单：`cache.params.order` 是这个函数内部现造的临时结构体，从来不会被真的提交执行，唯一作用是喂给 `getExecutionPriceForDecrease` 算一个假设成交价用于安全校验——所以不管 `forLiquidation` 是什么值，都应该无条件把它标记成"不给 rebate 算数"的上下文，因为这个函数不管服务于哪个场景，本质都是"宁可保守，也不要被临时有利的市场状态骗过去"的检查。这样改比初版方案的 `if` 判断更简单（少一行判断逻辑），而且自动覆盖上表全部四个调用点，不需要逐个排查。

### 3.1.2 一个独立的、不受影响的第二层防线：`willPositionCollateralBeSufficient`

`PositionUtils.sol:437-471` 还有一个专门校验杠杆/保证金的函数，文档注释（`PositionUtils.sol:417-429`）明确写了"价格冲击可能被用来 game 高杠杆开仓"这个场景，但这个函数的设计是**完全不算 fees 和 price impact**，只用 `getMinCollateralFactorForOpenInterest`/`getMinCollateralFactor` 这类跟仓位规模挂钩的固定系数去卡杠杆上限，从头到尾不碰 `dynamicSpread`——**这一层完全不受本次改动影响**，也是 FX100 现有的、独立于本方案的第二道杠杆防线。

如果历史上做过"100x 顺滑"相关的 `minCollateralFactor` 调优（关联记忆 `project_min_collateral_factor_change`），大概率调的就是这一层；但 3.1.1 说的 `validatePosition`/`isPositionLiquidatable` 是另一道独立防线，两者都要在这次改动里核对，建议改完后把 100x 边界场景（极限杠杆、极薄保证金）重新跑一遍两层校验的回归测试，确认没有退化。

### 3.2 `getExecutionPriceForDecrease` 据此传 `isLiquidationContext`

`PositionUtils.sol:697-706`，改成：

```solidity
bool isLiquidationContext = Order.isLiquidationOrder(params.order.orderType());

(cache.dynamicSpread, cache.balanceWasImproved) = PositionPricingUtils.getDynamicSpread(
    PositionPricingUtils.GetPriceImpactUsdParams(
        params.contracts.dataStore,
        params.market,
        indexTokenPrice,
        -cache.sizeDeltaUsd.toInt256(),
        -cache.sizeDeltaInTokens.toInt256(),
        params.order.isLong()
    ),
    isLiquidationContext
);
```

`Order.isLiquidationOrder`（`Order.sol:459-461`）已经存在，不需要新写。`getExecutionPriceForIncrease`（`PositionUtils.sol:617-626`）同样要改调用签名传 `false`（开仓不可能是清算/ADL），保持类型一致。

因为 3.1 已经保证 `isPositionLiquidatable` 的全部四个调用场景（开仓校验、减仓校验、真清算执行 gate、Reader 只读查询）的 `params.order.orderType()` 都会无条件返回 `Liquidation`，加上真实清算执行本身（`DecreasePositionCollateralUtils.sol:87`）走的也是同一个 `getExecutionPriceForDecrease`、订单本身就是真正的 `Order.OrderType.Liquidation`，**这一处改动会自动覆盖"安全校验"和"真实清算结算"两大类场景，不需要在每个调用点分别判断**——这也是为什么建议这样设计：只需要一个统一的信号源（`orderType`），而不是到处传递散落的 boolean 参数，新增的调用点（比如未来新加的校验逻辑）也会自动继承这层保护。

### 3.3 ⚠️ ADL 需要额外补一个标记——它目前不是独立的 orderType，普通 MarketDecrease 分不出来

`AdlUtils.sol:134`，ADL 订单创建时用的 orderType 是普通的：

```solidity
Order.OrderType.MarketDecrease, // orderType
```

`Order.sol:30-33` 定义了 `SecondaryOrderType { None, Adl }` 枚举，但**目前没有对应字段存在 `Order.Props` 里，也没有 getter/setter**——是从 GMX fork 带过来但没接上的又一处死代码（跟 `MAX_POSITION_IMPACT_FACTOR_FOR_LIQUIDATIONS` 是同一类情况）。也就是说，**"ADL 订单"目前在类型层面和普通自愿平仓完全无法区分**，`Order.isLiquidationOrder` 这条路对 ADL 不生效，需要额外补一个标记，不是免费的。

两种做法：

- **方案 A（推荐）**：给 `Order.Props` 加一个 `secondaryOrderType` 字段 + `setSecondaryOrderType`/`secondaryOrderType()` getter/setter（参照 `orderType`/`setOrderType` 的写法，`Order.sol:201-208`），`AdlUtils.createAdlOrder` 里把它设成 `SecondaryOrderType.Adl`，然后 3.2 的判断改成：
  ```solidity
  bool isLiquidationContext = Order.isLiquidationOrder(params.order.orderType())
      || params.order.secondaryOrderType() == Order.SecondaryOrderType.Adl;
  ```
  这样命名上会有点别扭（变量叫 `isLiquidationContext` 但其实也包含 ADL），建议改名成 `isForcedCloseContext` 之类更准确的名字。
- **方案 B（更省事但语义不够干净）**：不改 `Order` 结构，直接在 `AdlUtils.createAdlOrder` 那条调用链上显式传一个 `bool isAdl` 参数一路传到 `getExecutionPriceForDecrease`，绕开 orderType 机制。

建议选 A——这个字段本来就是 GMX fork 遗留、专门为这个目的设计的，选 B 相当于绕开现成的设计再发明一遍，以后如果还有第三种"强制平仓"类型（比如未来加自动止损之外的风控强平），A 的模式可以直接复用，B 每次都要重新拉一条参数线。

---

## 四、类型变更 `uint256`→`int256` 的完整改动清单

`dynamicSpread` 这个值目前是 `uint256`，改成 `int256` 后牵扯到的每一处：

| 文件 | 行号 | 需要改的地方 |
|---|---|---|
| `PositionPricingUtils.sol` | 152 | 函数签名返回值 `uint256`→`int256`，见 2.2 |
| `PositionUtils.sol` | 86 | `DecreasePositionCollateralValues.dynamicSpread` 字段类型 |
| `PositionUtils.sol` | 148 | `ExecutionPriceResult.dynamicSpread` 字段类型 |
| `PositionUtils.sol` | 632 / 646 | `Precision.WEI_PRECISION + cache.dynamicSpread` → `int256(Precision.WEI_PRECISION) + cache.dynamicSpread`，结果转回 `uint256` 前确认非负（正常情况下恒成立，因为负 spread 的最大幅度被 min/maxSkewImpact 限制住，远小于 `WEI_PRECISION`；但建议加一个 `assert`/防御性 revert，而不是静默 underflow） |
| `PositionUtils.sol` | 638 / 652 / 710 | `Precision.WEI_PRECISION - cache.dynamicSpread` 同上处理 |
| `PositionUtils.sol` | 713 | `Precision.mulDiv(..., Precision.WEI_PRECISION + cache.dynamicSpread, ...)` 同上 |
| `IncreasePositionUtils.sol` | 40 | 局部 cache 结构体字段类型 |
| `DecreasePositionCollateralUtils.sol` | 88 | `values.dynamicSpread = executionPriceResult.dynamicSpread` 字段类型 |
| `PositionEventUtils.sol` | 34 | event 参数结构体字段类型 |
| `PositionEventUtils.sol` | 59 / 108 | `eventData.uintItems.setItem(13/14, "dynamicSpread", ...)` **必须**改成 `eventData.intItems.setItem(...)`——两个数组各自的 slot 数量声明（`initItems` 那一段）都要跟着调整，`uintItems` 少一项、`intItems` 多一项，漏改会在运行时数组越界 revert |
| `ReaderPricingUtils.sol` | 25 / 65 / 73 | 对外只读接口字段类型——**这是唯一会影响链下消费者的改动点**，前端/indexer 如果按 `uint256` 解析这个字段要同步通知改成有符号类型 |

---

## 五、配置护栏

`Config.sol` 目前的校验模式（`allowedBaseKeys` 白名单 + `setUint`/`setInt`，`Config.sol:35,269-296`）**没有任何"两个 key 之间要满足某种比例关系"的链上交叉校验先例**。"正向上限的幅度不能超过负向上限的某个比例"这条护栏，有两个选择：

- **链上强制**：在 `setInt` 里针对新加的 `MIN_DYNAMIC_SPREAD`/`MAX_DYNAMIC_SPREAD` 这两个 key 特殊处理，写入时读另一侧的值做比较校验——本仓库目前没有这个模式，工作量不小，但保证任何时候都生效，哪怕紧急情况下手工改配置也躲不过。同时建议把一.3 提到的"`minDynamicSpread` 跟 `minSkewImpactKey` 现有值要配套"也纳入校验范围，或者至少在部署脚本里打印出两层数值供人工核对。
- **链下约束**：只在部署脚本/`ConfigSyncer` 里做校验，链上不限制——实现简单，贴近现有代码风格，但没有强制力，人工误操作可以绕过。

考虑到这是直接决定"最多倒贴多少钱"的风控参数，建议**至少加链上校验**，哪怕只是一个简单的 `require`——配置错误的后果参考风险分析文档 4.1 节的数字（单笔就能到 $8,000+ 量级），比多写这几行校验代码的成本高得多。

---

## 六、测试清单（建议至少覆盖）

1. **普通交易**：改善平衡时 `dynamicSpread` 为负、成交价优于 oracle，且不超过新配置的 `minDynamicSpread`/`maxDynamicSpread` 上限（长短分别验证）；额外补一个用例验证一.3 提到的"两层 clamp 谁生效"——分别构造 `minSkewImpactKey` 更紧 和 `minDynamicSpread` 更紧 两种配置，确认两种情况下实际生效的都是数值更紧的那一层。
2. **清算判定**：构造一个"如果按普通交易公式算会显示为负 spread（更健康）"的场景，确认判定阶段依然按 floor-at-0 的保守口径处理，该清算的仍然清算——这是本方案要解决的核心问题，必须有专门用例。
3. **清算执行**：确认清算执行价不会优于 oracle 价（floor-at-0 在执行阶段也生效）。
4. **开仓/加仓/减仓的安全校验**（3.1.1 提到的场景，容易被漏测，跟 2、3 同样重要）：构造一笔"改善平衡方向、保证金极薄（比如逼近 1% 对应的 100x）"的开仓/加仓/减仓，确认 `validatePosition`/`isPositionLiquidatable` 依然按 floor-at-0 的保守口径判断该笔操作是否会让仓位立刻可清算，不会因为这笔交易本身的负 spread 而放行本该被拒绝的仓位；同时验证 `willPositionCollateralBeSufficient` 这一层（3.1.2）确实完全不受本次改动影响，两层校验分别独立跑一遍。
5. **ADL**（如果方案 A 落地）：同 2、3，用 ADL 触发路径重跑一遍。
6. **事件**：确认 `PositionIncrease`/`PositionDecrease` 事件里 `dynamicSpread` 字段能正确读出负值（`intItems`），链下 indexer/前端解析不报错。
7. **Reader**：`ReaderPricingUtils` 相关只读函数返回值符号正确，前端联调一次。
8. **配置初始化**：部署脚本对所有已上线市场写入新的 `minDynamicSpreadKey`/`maxDynamicSpreadKey`（每个市场 long/short 各一份），逐市场核对写入成功且非零；同时核对现有 `minSkewImpactKey`/`maxSkewImpactKey` 的数值是否需要跟着调整（见一.3 的联动说明）。
9. **回归**：第二节的类型重构提交（第一步）单独跑一遍全量现有测试，确认在"业务逻辑未变"的前提下行为完全一致，再合入第二步业务逻辑改动。

---

## 七、建议的落地顺序

1. **PR 1**：`uint256`→`int256` 类型重构（第四节清单），不改变任何行为，跑通现有全部测试。
2. **PR 2**：`FX100Keys.sol` 新增 `MIN_DYNAMIC_SPREAD`/`MAX_DYNAMIC_SPREAD`（第一节）+ 部署脚本初始化逻辑，此时业务逻辑仍未改变（`isLiquidationContext` 还没接入，或接入但两个分支行为暂时相同）。
3. **PR 3**：接入 `isLiquidationContext` 判断（第三节 3.1/3.2），此时清算已经和普通交易分离，但 ADL 还没有独立标记（如果 ADL 恰好也复用了同一个 `getExecutionPriceForDecrease` 调用且 orderType 恰好不是 Liquidation，会被当成"普通交易"处理，这是过渡期的已知状态，需要在 PR 3 的描述里明确写出来，避免被当成遗漏）。
4. **PR 4**：ADL 隔离（第三节 3.3，方案 A），补齐 `SecondaryOrderType` 的接线。
5. **PR 5**：配置护栏（第五节）。

每一步都应该是可以独立测试、独立回滚的最小单元，不建议合并成一个大 PR 一次性提交。

## 八、前端联动（负 spread 上线时必须同步改，否则前端会把返利吞成 0）

> 受众：前端工程师。合约允许 `dynamicSpread` 为负后，前端有一处**镜像了合约旧 floor-at-0 逻辑**的本地计算，如果不同步改，改善平衡的单在前端会永远显示 0 spread（吞掉返利），且执行价、Price Impact、Total Spread 三处读数都会偏保守。仓库：`fx100-apps`。

### 8.1 唯一的源头 floor（改这一处，三处读数一起好）

`apps/fx-base-app/src/lib/executionPrice.ts:348-349`（`getExecutionPriceSpread`，镜像合约 `PositionPricingUtils.getExecutionPriceSpread`）：

```plain text
const dynamicSpread = constantSpread + depthSpread + skewImpact;
const spread = dynamicSpread <= 0n ? 0n : dynamicSpread;   // ← 就是这行 floor-at-0
```

这个 `spread` 字段同时喂给下面三处，所以**改这一处即可全解**：

1. **Est. execution price**：执行价用 `spread` 施加到 index 价上（`getExecutionPriceForIncrease/Decrease`）。
2. **Total Spread 展示**：spread-breakdown tooltip 里的 Total Spread（`useExecutionPrice.ts:211 totalSpread: sc.spread`、`OrderPreview.tsx:561`）——现状 Constant 0.0100% + Depth 0.0041% + Skew −0.0217% 三项分明是负和，但 Total Spread 被 floor 成 0.0000%。
3. **Price Impact 行**：`OrderPreview.tsx:327-331` 的 `priceImpactPct` 又对 `spread` 做了一次冗余 floor（`spread < 0n ? 0n`），要一并删。

**改法**：把 line 349 的硬编码 `<= 0 ? 0` 换成读新配置键 `minDynamicSpreadKey/maxDynamicSpreadKey(marketIndex, isLong)` 的 `clamp(min, max, dynamicSpread)`，与合约 2.2 节的非清算分支逐字对齐；前端预览恒为非清算路径，不需要 floor-at-0 分支。同时删掉 `OrderPreview.tsx:329` 的冗余 floor。

### 8.2 平仓/减仓路径的镜像也要同步

`apps/fx-base-app/src/hooks/trade/useCreateDecreaseOrder.ts:1298`（`totalSpread: simResult.spread.spread`）走的是各自的 sim spread 来源，确认它同样改成 clamp、不再 floor（自愿平仓是非清算，也应能拿负 spread）。

### 8.3 新配置键要进前端的 multicall

前端本地算 spread 用的是 market config，需把 `MIN_DYNAMIC_SPREAD/MAX_DYNAMIC_SPREAD`（每市场 × long/short）加进 DataStore 读取（`packages/sdk` 的 dataStore keys + `query-builders` multicall），否则 8.1 的 clamp 没有参数来源、默认 0 又退回 floor 效果。

### 8.4 有符号解析 + 颜色（多数已就绪）

- 若某处 spread 改从合约 Reader 读（`ReaderPricingUtils`，见第四节 Reader 条），前端要按**有符号 int** 解析，别再当 uint。
- 颜色侧已就绪：`OrderPreview.tsx` 的 `priceImpactColor` 已把 `<= 0` 视作绿色（利好），负值会自动显示成利好色，无需额外改；只需确认 Total Spread / 执行价的正负号显示正确（负 spread → 成交价优于 oracle）。

### 8.5 文案（已先行完成，不阻塞）

Price Impact 的 tooltip 已在 develop `d04fe5d2` 改好（四语，去掉 always≥0、写清正=劣于 oracle / 负=返利）。本节 8.1–8.4 的数值侧改动落地后，tooltip 描述的负值场景才会真正出现在 UI 上。

---

## 九、实施核对（2026-08-03，`release/v0.3.2`）

**核对方式**：`git worktree` 拉取 `origin/release/v0.3.2`（不改动本仓库 `src/`），`forge build` + `forge test` 实测；不是纯读代码，方案文档提到的每一条都有对应的构建/测试证据。完整报告见 [2026-08-03-v032-audit-fix-verification.md](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/audit/2026-08-03-v032-audit-fix-verification.md) 三节。

### 9.1 测试结果

`forge build` 全量编译通过（仅 lint 提示）。`forge test --match-path "test/integration/PositionPricing.t.sol"`：**9 个用例全部 PASS**，包括新增的 `test_GetDynamicSpread_DisallowsNegativeWhenFlagIsFalse`、`test_GetExecutionPriceForDecrease_DisallowsNegativeSpreadForLiquidation`、`test_GetExecutionPriceForDecrease_DisallowsNegativeSpreadForAdl`、`test_IsPositionLiquidatable_UsesLiquidationSpreadRules` 等直接覆盖本方案核心诉求的用例。

### 9.2 与方案逐条核对结果

| 章节 | 核对结论 |
|---|---|
| 一.3（新增 `MIN/MAX_DYNAMIC_SPREAD`，卡在求和之后） | ✅ 逐字落地：`FX100Keys.sol` 新增两个 key + 对应函数，`Config.sol` 白名单已加 |
| 二.2（`getDynamicSpread` 返回 `int256`） | ✅ 落地，类型迁移用了仓库已有的 `Calc.sumReturnUint256` 辅助函数（比文档手写的 assert 建议更简洁，Solidity 0.8 checked arithmetic 在结果为负时会自动 revert，效果等价） |
| 三.1（清算判定无条件打 `Liquidation` 标记，"修正版"方案） | ✅ 完全按修正版实现：`cache.params.order.setOrderType(Order.OrderType.Liquidation)` 不带任何 `if` 条件 |
| 三.3（ADL 隔离，方案 A：给 `Order.Props` 新增 `secondaryOrderType` 字段） | ⚠️ **本节判断依据过时**：实际代码库里 `secondaryOrderType` 字段早就存在于 `PositionUtils.UpdatePositionParams`（此前 `e7ea332 feat(fee-distribute): split liquidation fee` 已打通全链路），工程师直接复用了这条现成通路，**比方案提议的新增字段更干净**，是文档没查全，不是实现的问题 |

### 9.3 清算/ADL 是否保留正向上限——已定案：保留，与普通交易一致

本方案三.1/三.2 最初的设计意图是"清算/ADL 完全不受这次改动影响，保持今天 floor-at-0、**无上限**的行为"。实际实现只清零了下限：

```solidity
if (!params.allowNegativeSpread && minDynamicSpread < 0) {
    minDynamicSpread = 0;          // ✅ 按方案清零，没有 rebate
}
if (maxDynamicSpread < minDynamicSpread) {
    maxDynamicSpread = minDynamicSpread;
}
return (Calc.clamp(dynamicSpread, minDynamicSpread, maxDynamicSpread), balanceWasImproved);
```

`maxDynamicSpread` 沿用了普通交易那一份配置，清算/ADL 路径的执行价也会被这个上限封顶——跟本方案最初"清算完全不设上限"的设计不完全一致，第一轮核对时曾作为待确认的偏离提出。

**✅ 2026-08-03 团队已拍板：保留现状，不再单独放开**——理由是"与其他交易保持一致"，即当前实现即最终设计，不需要改代码。

- `scripts/config/defaults.ts` 目前把 `maxDynamicSpread` 默认配到 `WEI_PRECISION`（100%，等效无上限）；既然清算/ADL 现在也复用这同一份配置，**这个值同时决定了清算执行价的上限**，未来任何市场调整 `maxDynamicSpread` 都要按"这个数值管着两类场景"来考虑，不能只按普通交易的 UX 目标配置。
- 建议补一条测试：构造清算/ADL 场景下 `dynamicSpread` 超过市场配置 `maxDynamicSpread` 的情况，确认执行价确实被这个上限封顶——这是新确认的预期行为，不是要防御的 bug。

---

## 十、24 个上线资产的 `MIN/MAX_DYNAMIC_SPREAD` 具体数值建议（参照 Avantis 实测数据，2026-08-17）

`defaults.ts` 目前的占位值（`maxDynamicSpread = 100%`）等于没有配置，本节把 [avantis_live_pairs_spread_caps.md](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/analysis/pricing/avantis_live_pairs_spread_caps.md) 已经核对过的 111 个 Avantis 在架资产真实 `posSpreadCap`/`negSpreadCap`，逐一映射到 FX100 现在 24 个上线资产，给出具体建议值。

### 10.1 映射方法

第一节已确认 `MIN_DYNAMIC_SPREAD = -posSpreadCap`、`MAX_DYNAMIC_SPREAD = negSpreadCap`（同一个 clamp 公式的两端）。Avantis 的 key 不分 long/short，建议 FX100 也对同一个市场的 long/short 配相同数值（`isLong=true`/`false` 两份写入同一个数字），除非未来有具体理由要做方向性区分。

### 10.2 分三组处理

**组 A：Avantis 对这个资产的 `negSpreadCap` 是真正收紧过的（5 个）**——直接照抄 Avantis 数值，因为这是 Avantis 真实在生效的风控意图，且这 5 个数值（0.25%/0.5%）本身就低于 FX100 三项分量加总的自然上限（常数价差 0.01% + 价格冲击上限 0.5% + skew 上限 0.5% = 1.01%，见 §8.2），**会真正生效收紧**，不是摆设：

| market | 资产 | `MIN_DYNAMIC_SPREAD` | `MAX_DYNAMIC_SPREAD` |
|---|---|---|---|
| 1 | BTC | −0.02% | 0.25% |
| 2 | ETH | −0.02% | 0.25% |
| 5 | SOL | −0.02% | 0.50% |
| 17 | XRP | −0.02% | 0.50% |
| 4 | HYPE | −0.05% | 0.50% |

**组 B：Avantis 有对应资产，但 `negSpreadCap` 是 1000%/3000% 形同虚设（15 个）**——`MIN_DYNAMIC_SPREAD` 照抄 Avantis 的 `posSpreadCap`；`MAX_DYNAMIC_SPREAD` **不建议照抄 1000%/3000% 这种字面数字**（在 FX100 的精度体系下配一个荒谬的大数没有意义，且 Avantis 的"实质无效"本身就是想让这一侧完全交给价格冲击和市场深度自己决定，不设额外的兜底上限）——用一个略高于 §8.2 三项分量自然上限（1.01%）的整数值 **1.50%** 作为"不额外收紧"的等效实现，两边效果一致（自然上限本来就够不到 1.50%），但数值更合理、不需要在系统里出现"3000%"这种荒谬字面量：

| market | 资产 | Avantis `posSpreadCap` | `MIN_DYNAMIC_SPREAD` | `MAX_DYNAMIC_SPREAD`（建议统一） |
|---|---|---|---|---|
| 6 | WLD | 0.05% | −0.05% | 1.50% |
| 7 | ZEC | 0.05% | −0.05% | 1.50% |
| 9 | LINK | 0.05% | −0.05% | 1.50% |
| 10 | SUI | 0.05% | −0.05% | 1.50% |
| 11 | AERO | 0.05% | −0.05% | 1.50% |
| 12 | NEAR | 0.05% | −0.05% | 1.50% |
| 14 | ENA | 0.05% | −0.05% | 1.50% |
| 15 | TIA | 0.05% | −0.05% | 1.50% |
| 16 | ONDO | 0.05% | −0.05% | 1.50% |
| 18 | ARB | 0.05% | −0.05% | 1.50% |
| 21 | AAVE | 0.05% | −0.05% | 1.50% |
| 22 | PUMP | 0.05% | −0.05% | 1.50% |
| 23 | BNB | 0.05% | −0.05% | 1.50% |
| 24 | XMR | 0.05% | −0.05% | 1.50% |
| 26 | DOGE | **0.02%** | **−0.02%** | 1.50% |

⚠️ **DOGE 需要一个判断，不是照抄能自动解决的**：Avantis 把 DOGE 的 `posSpreadCap` 归进"主流大市值"那一档（0.02%，跟 BTC/ETH 同档），但 `negSpreadCap` 却没有像 BTC/ETH/SOL/XRP/HYPE 那样收紧，跟其它长尾资产一样是 3000%（无效）。这跟 FX100 自己的容量分层（§6.5，DOGE 是 T3，不是 T1 主流层）不完全一致。本文档建议**跟着 Avantis 的实际数值走**（`posSpreadCap` 用 0.02%，`negSpreadCap` 侧按组 B 处理），因为这两个 cap 管的是"价格执行/点差风控"，跟 FX100 自己按流动性容量分的 RESERVE_FACTOR 层级是两件不同的事，没有必要强行对齐；但这是一个值得团队再确认一次的判断点，不是纯粹照搬的机械结论。

**组 C：Avantis 没有对应资产（4 个：VVV、XLM、TON、ADA）**——套用组 B 的长尾默认值（`−0.05%`/`1.50%`），理由：这 4 个在 FX100 自己的容量分层里也都是 T3/T4（非主流层，见 §6.5），跟组 B 里其余长尾资产的定位一致，用同一套默认值是合理的外推，不是凭空捏造：

| market | 资产 | `MIN_DYNAMIC_SPREAD` | `MAX_DYNAMIC_SPREAD` |
|---|---|---|---|
| 8 | VVV | −0.05% | 1.50% |
| 13 | XLM | −0.05% | 1.50% |
| 20 | TON | −0.05% | 1.50% |
| 25 | ADA | −0.05% | 1.50% |

### 10.3 汇总一句话

24 个资产里，**5 个（BTC/ETH/SOL/XRP/HYPE）建议直接照抄 Avantis 的真实收紧值**（这几个数值会真正生效，比 FX100 自然上限更紧）；**其余 19 个建议统一 `MIN=-0.05%`（DOGE 例外，用 -0.02%）、`MAX=1.50%`**（等效于"不额外收紧"，比字面照抄 Avantis 的 1000%/3000% 更干净）。DOGE 的档位归属建议团队再确认一次。这组数值可以直接用于 §七"建议的落地顺序" PR 2 的部署脚本初始化。

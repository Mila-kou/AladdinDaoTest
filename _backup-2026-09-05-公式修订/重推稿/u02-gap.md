# §3 订单数量转换 · 需求↔实现差异台账

> 本组无专属需求规范文档（改写重点即「以源码为准」）。以下条目按任务约定，记录**源码自身的设计意图（注释 / 命名 / 结构）与实际行为之间的冲突**，以及跨模块口径不一致。凡涉及数值的均已在源码上核对到具体行。
> 源码基线：`Github/fx100-contracts@release-v0.3.2` @ `13880f2`。

---

### 1. 开仓 skew 预测用的是 index 价 tokenDelta，实际落账 OI 用的是执行价 tokenDelta

- 需求规范：无专属需求文档。源码自陈的设计意图见 `src/pricing/PositionPricingUtils.sol::getNextOpenInterest` 注释——"if useOpenInterestInTokens is true, then the price impact can vary depending on the index token price"，其结构表明该函数意在**预测本单执行后的 next open interest**，据此判定 `balanceWasImproved` 与 `skewImpact`。
- 合约实现：`src/position/PositionUtils.sol::getExecutionPriceForIncrease`（L616-626）把 `getIncreaseOrderSize` 的**预解析** `sizeDeltaInTokens` 作为 `tokenDelta` 传入；`getNextOpenInterest` 用 `usdDelta = tokenDelta × indexPrice.midPrice()` 推 next OI。但同一函数随后（L629-655）用含点差的 `executionPrice` 覆盖重算 `sizeDeltaInTokens`，`IncreasePositionUtils::increasePosition`（L120）落账 OI 用的是**覆盖后**的值。
- 差异：USD 计价开仓时，用于判定 skew / `balanceWasImproved` 的 tokenDelta 与实际写入 `openInterestInTokens` 的 tokenDelta 相差一个点差比例（正点差下 Long 的预解析值偏大、Short 的偏小，量级 = `dynamicSpread`；示例 0.1% 点差、$3000 单笔，Long 预解析 `1e18` vs 落账 `999000999000999000`）。token 计价模式与全部减仓路径不存在该偏差。
- 影响：`balanceWasImproved` 处在翻转边界时（next OI 与 current OI 的失衡差极接近）可能取到与真实落账结果相反的值，进而改变 `skewImpact` 符号与费率档（`balanceWasImproved` 还会传入 `processCollateral` 决定费率档，见 §7）。资金层面偏差极小，但对"临界失衡"用例是可复现的错判源；测试时不能用落账后的 OI 反推 `balanceWasImproved`。
- 建议定性：缺陷候选（低危，口径不自洽）

---

### 2. 超仓减仓按 orderType 分叉：限价/止损静默改写订单，市价/清算直接 revert

- 需求规范：无专属需求文档。`src/order/Order.sol::Numbers` 对 `sizeDelta` 的注释只写 "the requested change in position size"，没有任何"执行时可能被链上改写"的说明；本工作区的《FX100-核心字段计算公式》v0.3.1 / v0.3.2 §3.2 也只写了"全平时直接使用仓位完整的 sizeInUsd 和 sizeInTokens"，完全没有超仓分支。
- 合约实现：`src/position/DecreasePositionUtils.sol::decreasePosition`（L79-97）——`order.sizeDelta > maxSizeDelta` 时，`LimitDecrease(3)` / `StopLossDecrease(4)` 会 `emit OrderSizeDeltaAutoUpdated` 后 `setSizeDelta(maxSizeDelta)` 并重算（静默下调为全平）；`MarketDecrease(2)` / `Liquidation(5)` 则 `revert FxErrors.InvalidDecreaseOrderSize(cache.sizeDeltaUsd, position.sizeInUsd())`。另有三处同类静默改写：L102-116（v0.3.2 新增全平归一化）、L205-217（剩余保证金+PnL 低于 `MIN_COLLATERAL_USD` 强制全平）、L219-234（残仓低于 `MIN_POSITION_SIZE_USD` 强制全平）。
- 差异：同一个"平仓量超过仓位"的输入，结果取决于 orderType：一类静默成交成全平，一类整笔回滚；且实际成交量与用户下单量可以不同，只通过事件披露。
- 影响：前端/SDK 若不监听 `OrderSizeDeltaAutoUpdated`，展示的成交量、预估收益与链上不符；测试若按订单原值算期望值会得到假 FAIL。用户侧的实际风险是"想平一半却被全平"（闸门 3/4 在部分平仓时也会触发），这不是超仓输入才有的行为。
- 建议定性：需求表述模糊（行为本身与 GMX v2 同源、可判为设计；缺的是对外口径文档）

---

### 3. v0.3.2 新增的「全平归一化」闸门只覆盖 USD 计价，且未回写任何版本文档

- 需求规范：无专属需求文档。`Docs/contract-releases/v0.3.2/01-代码变化分析.md` §13 P1 已把它列为测试点——"USD 减仓因 token 舍入自动转换为全平"，但只有一句结论、无公式与触发条件；v0.3.1 与 v0.3.2 两版《FX100-核心字段计算公式》§3 逐字相同，均无此分支。
- 合约实现：`src/position/DecreasePositionUtils.sol::decreasePosition` L99-116（v0.3.1 无此段，`git diff` 显示为纯新增）：当 `isSizeDeltaUsd && sizeDeltaUsd < sizeInUsd && sizeDeltaInTokens == sizeInTokens` 时，`setSizeDelta(position.sizeInUsd())` 归一化成全平，理由见其注释——"so PnL, fees, open interest and emitted values use the same USD size"。
- 差异：(a) 该分支是 v0.3.2 的行为变更，两版公式文档都未体现；(b) 只处理 `isSizeDeltaUsd = true`，token 计价没有对称分支。
- 影响：(a) 用 v0.3.1 口径推 v0.3.2 期望值时，命中该尾差的用例会算错（应为全平却按部分平算）。(b) 经量纲推导，token 计价下 `sizeDeltaUsd` 的 ceil 只有在 `rawSizeDelta == sizeInTokens`（已走恒等全平分支）时才可能触及 `sizeInUsd`，因此**当前不构成资金风险**；但若将来出现 `sizeInUsd / sizeInTokens < 1` 的市场配置（USD 精度低于 token 精度），不对称就会暴露。触发门槛可精确表述为：剩余未平 USD < `sizeInUsd / sizeInTokens`（一个 token-wei 的入场价值）——18 位 index token 上约 `1e-15` 美元量级，低 decimals index token 上会显著抬高，是可设计的边界用例。
- 建议定性：设计已变更未回写文档

---

### 4. `Reader.getExecutionPrice` 不复现 `decreasePosition` 的尺寸闸门与 acceptablePrice 校验

- 需求规范：无专属需求文档。Reader 的定位（本文 §0.2 来源优先级第 2 条）是"返回值与交易事件"级别的口径依据，前端预览据此展示成交量。
- 合约实现：`src/reader/ReaderPricingUtils.sol::getExecutionPrice` 复用 `PositionUtils.getExecutionPriceForIncrease/ForDecrease`，但（a）把 `acceptablePrice` 写死为 `type(uint256).max`（需更小执行价时）或 `0`，使 `BaseOrderUtils` 的 acceptablePrice 校验恒过、永不 revert；（b）只构造了 `position.sizeInUsd / sizeInTokens / isLong / marketIndex`，完全不经过 `DecreasePositionUtils::decreasePosition` 的四道闸门（超仓夹紧/revert、全平归一化、`MIN_COLLATERAL_USD` 强平、`MIN_POSITION_SIZE_USD` 强平）。
- 差异：同一笔减仓，Reader 预览返回的 `sizeDeltaUsd / sizeDeltaInTokens` 与实际执行结果可以不同；Reader 也不会提示该单实际会被 revert 或被改写成全平。
- 影响：前端"预计成交/预计可得"在超仓、残仓过小、保证金临界这三类场景下与链上不一致；E2E 若用 Reader 值做期望值会与 `PositionDecrease` 事件对不上。该差异不涉及资金安全，属预览层可信度问题。
- 建议定性：缺陷候选（前端预览与执行口径不一致）

---

### 5. 减仓 price impact 依赖各自仓位的 `sizeInUsd / sizeInTokens` 比例（源码自陈的已知不公平）

- 需求规范：无对外文档描述。源码注释自陈：`src/pricing/PositionPricingUtils.sol::getNextOpenInterest`——"note that for decrease position, tokenDelta is based on the ratio of position.sizeInUsd and position.sizeInTokens so different users would experience different price impacts for the same decrease in USD size"。
- 合约实现：`PositionUtils::getExecutionPriceForDecrease` 传入的 `tokenDelta` 来自 `getDecreaseOrderSize` 的等比销账值（=仓位均价口径），`getNextOpenInterest` 再用 `tokenDelta × midPrice` 覆写 `usdDelta` 参与 skew。
- 差异：两个用户在同一时刻、同一市场、同样按 USD 平掉同样金额，因入场均价不同而拿到不同的 `skewImpact` → 不同 `dynamicSpread` → 不同执行价。
- 影响：对用户是可感知的费率差异；对测试意味着"同 USD 平仓量"的用例不能跨仓位复用期望点差，必须带上该仓位的 `sizeInUsd / sizeInTokens`。合约已按此设计运行，不是回归缺陷。
- 建议定性：需求表述模糊（源码承认的设计取舍，缺对外口径说明）


<!-- 恢复时未能定位原位置，改为追加 -->
触发门槛的严格整数判据为 `sizeInTokens × (sizeInUsd − sizeDeltaUsd) < sizeInUsd`（等价于 `ceil(sizeInTokens × sizeDeltaUsd / sizeInUsd) == sizeInTokens`）；写成实数除法的量纲读法是「剩余未平 USD < `sizeInUsd / sizeInTokens`（一个 token-wei 的入场价值）」，换算成美元即「入场均价 × 10^(−index token decimals)」——注意该 `/` 是实数除法，按 Solidity 整除读会在边界上给出相反结论。当前 `TestCode/config/mock-resources.json` 三套 fork 登记的 index token decimals 均为 18、collateral token 为 6（oracle 报价 decimals 各 fork 不同：tx-fork 18，oracle-fork / time-fork 8，与本门槛无关），门槛 ≈ 入场均价 × `1e-18` 美元（$3000 均价下约 `3e-15`），只能靠构造 `sizeDelta = sizeInUsd - k` 命中，不存在自然可达的低 decimals 市场；若将来登记非 18 位 index token 才会显著抬高成常规可测边界。

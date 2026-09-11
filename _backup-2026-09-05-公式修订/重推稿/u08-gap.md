# u08（§11 清算判定 · §12 市场与 ADL 风控字段）需求↔实现差异台账

对照的需求规范：
- A =《2026-06-13_FX100-储备金与风控体系全面设计规范（讨论版-2026-06-12-修订）》
- B =《2026-07-22_FX100-储备金与风控体系改造规范(实施版-2026-06-12)》
- C =《2026-08-18_实施方案：Dynamic-Spread-允许为负+清算-ADL-隔离（更新版）》
- D =《2026-07-29_Dynamic-Spread-允许为负+清算-ADL-隔离实施方案》（已被 C 取代）

源码基线：`Github/fx100-contracts@release-v0.3.2`。

---

### 1. `executeAdl` 的执行前置闸门用的是「退出水位」而非「触发水位」

- 需求规范：B §5.3「**合约强制**（`AdlUtils.validateAdl` / `executeAdl` 改造）：1. 全局净义务比 \> `MAX_PNL_FACTOR_FOR_ADL` 才允许执行；……3. 全局比率 ≤ `MIN_PNL_FACTOR_AFTER_ADL` 后拒绝继续执行（防过度减仓）。」B §5.1 又给出「触发: Σ > MAX_PNL_FACTOR_FOR_ADL（0.75）／退出: Σ ≤ MIN_PNL_FACTOR_AFTER_ADL（0.50）」。
- 合约实现：`src/exchange/AdlHandler.sol::executeAdl` 第 98 行 `MarketUtils.isGlobalNetObligationRatioExceeded(store, oracle, FX100Keys.MIN_PNL_FACTOR_AFTER_ADL, false)`，不超限即 `revert AdlNotRequired`。`MAX_PNL_FACTOR_FOR_ADL` 只出现在 `AdlUtils::updateAdlState` 的置位分支。
- 差异：需求写的「> 0.75 才允许执行」在执行函数里实际是「> 0.50 才允许执行」，0.75 这道关由 keeper 主动调用的 `updateAdlState` 迟滞开关单独把守。
- 影响：ADL 一旦被 `updateAdlState` 开启，在比率回落到 0.50~0.75 区间内仍可继续执行；这正是 B §5.2「循环减仓直到 ≤ 0.50」所需要的行为，但按需求原文写期望值会在 0.50~0.75 区间误判为「应 revert AdlNotRequired」。B §十四.3 只笼统写「executeAdl 只检查 isAdlEnabled 标志 + 前置比率」，没有指明是哪个水位。
- 建议定性：需求表述模糊

---

### 2. 净义务分母 `poolUsd` 的取价侧与需求伪代码相反

- 需求规范：B §三.1 伪代码 `poolUsd = vault.totalAssets() × USDC 价（现有 getPoolUsdWithoutPnl，单池，无 isLong）`；B §十四.5 自述「**poolUsd 取价方向与本文伪代码相反**：§三伪代码用 `price.max`，实际实现取 collateral **min** 价（方向更保守，比率偏大更易触发 gate）」。
- 合约实现：`src/market/MarketUtils.sol::getGlobalNetObligationRatio` 调 `getPoolUsdWithoutPnl(market, collateralTokenPrice, false)` → `collateralTokenPrice.min`。
- 差异：分母取 `.min` 不是 `.max`，比率系统性偏大。
- 影响：提款闸门与 ADL 触发都更早生效；按需求正文伪代码（`.max`）算期望比率会偏小，USDC 有 Chainlink feed（min == max）时看不出来，一旦换成无 feed 的缓存价或价差不为零的抵押品就会对不上。
- 建议定性：设计已变更未回写文档（正文 §三 未同步，仅在 §十四.5 补注）

---

### 3. `validateOpenInterestReserve` 的 `poolUsd` 同样取 `.min`，与需求给出的实现代码相反

- 需求规范：B §四.2 直接给出实现代码：`uint256 poolUsd = getPoolUsdWithoutPnl(dataStore, market, prices.collateralTokenPrice, true);`（`maximize = true`）。
- 合约实现：`src/market/MarketUtils.sol::validateOpenInterestReserve` 为 `getPoolUsdWithoutPnl(market, prices.collateralTokenPrice, false)`。
- 差异：需求给的是 `true`（`.max`），实现是 `false`（`.min`）。B §十四 只对 §三 的 poolUsd 做了补注，没有覆盖 §四.2 这处。
- 影响：储备容量上限 `maxAllowed` 偏小，开仓更早被 `InsufficientReserveForOpenInterest` 拒绝。测试若按需求代码算 `maxAllowed` 会高估可开容量，在抵押品价差非零的环境（脱锚测试、非稳定币抵押）产生假缺陷。
- 建议定性：设计已变更未回写文档

---

### 4. v0.3.2 把 `balanceWasImproved` 接进清算判定，需求方案完全没有描述这条改动

- 需求规范：C 第三节只描述了两处清算/ADL 隔离改动——三.1「无条件 `setOrderType(Order.OrderType.Liquidation)`」与三.2「`getExecutionPriceForDecrease` 据此传 `isLiquidationContext`」。C 九.1 的核对清单里也只逐条核对了这两项，没有任何一节提到费率档位。
- 合约实现：`src/position/PositionUtils.sol::isPositionLiquidatable` 第 342–344 行新增 `cache.balanceWasImproved = executionPriceResult.balanceWasImproved;`（v0.3.1 该字段从未被赋值，恒为 `false`），随后传入 `PositionPricingUtils.GetPositionFeesParams`，在 `getPositionFeesAfterReferral` 里决定 `positionFeeFactorKey(marketIndex, balanceWasImproved)` 取哪一档费率。
- 差异：清算判定所用的平仓位费档位从「恒定 not-improved 档」改为「按实际平衡方向切档」，需求文档零覆盖。
- 影响：**清算阈值本身随市场多空平衡状态移动**。同一仓位、同一价格，在「平掉它会改善平衡」时和「会恶化平衡」时的 `remainingCollateralUsd` 不同，清算边界也不同；v0.3.1 → v0.3.2 的清算价回归对比若不带上这一维度会得到无法解释的偏差。前端/Keeper 的近似清算价若沿用固定费率，会与链上判定出现方向性偏离。
- 建议定性：设计已变更未回写文档

---

### 5. 清算/ADL 路径保留了普通交易的 `maxDynamicSpread` 上限

- 需求规范：C 三.1/三.2 的设计意图是「清算和 ADL 这类强制平仓，继续保持今天 floor-at-0 的行为，不受影响」；C 九.3 自述「本方案三.1/三.2 最初的设计意图是『清算/ADL 完全不受这次改动影响，保持今天 floor-at-0、**无上限**的行为』。实际实现只清零了下限……**2026-08-03 团队已拍板保留这个现状**」。
- 合约实现：`src/pricing/PositionPricingUtils.sol::getDynamicSpread` 只有 `if (!params.allowNegativeSpread && minDynamicSpread < 0) minDynamicSpread = 0;`，`maxDynamicSpread` 沿用 `maxDynamicSpreadKey(marketIndex, isLong)` 同一份配置。
- 差异：正文（三.1/三.2）与结论（九.3）并存且相反，正文未更新。
- 影响：`maxDynamicSpread` 这一个配置同时决定普通交易执行价与**清算执行价**的上限；调参时只按普通交易 UX 目标设置会连带改变清算成交价。C 九.3 建议补的「清算/ADL 场景下 dynamicSpread 超上限被封顶」用例目前应作为预期行为而非缺陷。
- 建议定性：设计已变更未回写文档

---

### 6. ADL 隔离用的是 `secondaryOrderType` 而不是需求提议的新增 `Order.Props` 字段

- 需求规范：C 三.3「`Order.sol:30-33` 定义了 `SecondaryOrderType { None, Adl }` 枚举，但**目前没有对应字段存在 `Order.Props` 里，也没有 getter/setter**」，据此提出「方案 A：给 `Order.Props` 新增 `secondaryOrderType` 字段」。C 九.2 自述「**本节判断依据过时**：实际代码库里 `secondaryOrderType` 字段早就存在于 `PositionUtils.UpdatePositionParams`……是文档没查全，不是实现的问题」。
- 合约实现：`AdlHandler::executeAdl` → `_getExecuteOrderParams(..., Order.SecondaryOrderType.Adl)` → `BaseOrderUtils.ExecuteOrderParams.secondaryOrderType` → `DecreaseOrderUtils` 透传进 `PositionUtils.UpdatePositionParams.secondaryOrderType` → `getExecutionPriceForDecrease` 里 `allowNegativeSpread = false`。ADL 订单本身的 `orderType` 仍是 `Order.OrderType.MarketDecrease`（`AdlUtils::createAdlOrder`）。
- 差异：隔离信号走执行参数而非订单存储字段。
- 影响：**从 `OrderStoreUtils` 读回的 ADL 订单与普通 `MarketDecrease` 无法区分**，只能靠执行时 `ExecuteOrderUtils` 单独 emit 的 `secondaryOrderType` 事件字段辨认；只读回放、订单快照类核对必须以事件为准，不能用订单类型判 ADL。
- 建议定性：设计已变更未回写文档

---

### 7. `getGlobalNetObligationRatio` 的分母固定取第一个市场的 vault，不变量无合约校验

- 需求规范：B §三.1「poolUsd = vault.totalAssets() × USDC 价（现有 getPoolUsdWithoutPnl，**单池**，无 isLong）」；B §十四.5「分母跨市场场景固定取『第一个市场』的 vault（依赖『所有市场共享同一 LPVault』的部署不变量，需要作为新市场上线 checklist 的强制项）」。
- 合约实现：`MarketUtils::getGlobalNetObligationRatio` 循环里 `if (i == 0) { ... poolUsd = getPoolUsdWithoutPnl(market, ...); }`，全程不比较其它市场的 `market.vault`。
- 差异：需求把「单池」当作前提，实现把它当作未校验的假设。
- 影响：一旦上线一个 `vault` 不同的市场，全局比率的分子会含它的净义务、分母却不含它的池子，提款闸门与 ADL 触发全部失真且不会 revert（静默错误）。属于合约层可加校验而未加。
- 建议定性：缺陷候选

---

### 8. `executeAdl` 的缓存价过期处理是「整笔 revert」，不是需求设计的「该市场排除出 ADL 目标」

- 需求规范：B §八「缓存超 staleness 上限（建议 24h）：…… ADL 路径：该市场仍以缓存价计入 Σ（触发判断宁可偏旧不漏算），但**不允许对该市场执行 ADL**」；B §十四.2 自述实现改成了整笔 `revert MaxPriceAgeExceeded`。
- 合约实现：`src/oracle/Oracle.sol::_getSecondaryPrice`，`isADLStart == false` 且 `timestamp + MAX_RECORDED_PRICE_AGE < block.timestamp` 直接 revert；`executeAdl` 前后两次比率计算都传 `isADLStart = false`，任一无 feed 市场缓存价超龄即整笔失败。
- 差异：从「按市场降级」变成「全局硬阻断」。
- 影响：单个滞后市场可阻断全局 ADL；测试环境里若有 mock 市场长期不喂价，ADL 用例会以 `MaxPriceAgeExceeded` 失败而非业务原因失败，容易被误判为 ADL 逻辑缺陷。
- 建议定性：设计已变更未回写文档

---

### 9. 单笔 ADL 没有降幅上限，只保证比率单调下降

- 需求规范：B §5.3 第 3 条「全局比率 ≤ `MIN_PNL_FACTOR_AFTER_ADL` 后拒绝继续执行（防过度减仓）」，B §5.2「循环 │ 重复 1-3 直到全局比率 ≤ 0.50」；B §十四.4 自述「原设想中隐含的『防止一次性砍太多』保护（`PnlOvercorrected`）已被删除，`executeAdl` 只保证执行后 ratio 单调下降，不限制单笔降幅（实测单笔可砍掉仓位 90%+ 仍通过校验）」。
- 合约实现：`AdlHandler::executeAdl` 末尾仅 `if (nextGlobalNetObligationRatio >= cache.globalNetObligationRatio) revert InvalidAdl(...)`，`createAdlOrder` 只校验 `sizeDeltaUsd <= position.sizeInUsd`。
- 差异：「防过度减仓」在合约层不存在，只在 keeper 策略层自律。
- 影响：单笔 ADL 可把用户仓位砍掉绝大部分并把比率一次性打到远低于 0.50；ADL 边界用例不应期待任何 `PnlOvercorrected` 类 revert。
- 建议定性：设计已变更未回写文档

---

### 10. 纯加保证金（`sizeDeltaUsd == 0`）用的是清算档因子，需求文档未描述这条分支的语义

- 需求规范：C 三.1.1 的调用点表格写了「`IncreasePositionUtils.sol:153` 每次开仓/加仓后（含开 100x 这种）｜`cache.sizeDeltaUsd == 0`——真实开仓/加仓时 `sizeDeltaUsd≠0`，所以是 **`false`**」，只解释了「真实开仓时是 false」，没有说明 `sizeDeltaUsd == 0`（纯加保证金）这一分支会走 `MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION`。A/B 两篇也未提及。
- 合约实现：`src/position/IncreasePositionUtils.sol:153` `forLiquidation: cache.sizeDeltaUsd == 0`；`PositionUtils::isPositionLiquidatable` 据此选 `getMinCollateralFactorForLiquidation`。同一个 `if (cache.sizeDeltaUsd > 0)` 还同时跳过了 `validateOpenInterestReserve` 与 `willPositionCollateralBeSufficient`。
- 差异：需求把 `forLiquidation` 描述为「跟这次调用是不是为了真的执行清算没有关系」，但没给出「加保证金按清算档校验」这条业务语义。
- 影响：补保证金只需满足清算档（更松），补完后的仓位可能达不到开仓档，下一笔加仓被 `MIN_COLLATERAL_FACTOR` 拒绝——用户视角是「刚补完钱就不能加仓」。测试若统一按开仓档算加保证金的期望阈值会报假缺陷。
- 建议定性：需求表述模糊

---

### 11. `MIN_COLLATERAL_FACTOR > MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION` 只写在注释里，合约不校验（配置值未核实）

- 需求规范：A §3.1 把「MIN_COLLATERAL_FACTOR 最大杠杆 / `PositionUtils.validatePosition()`」列为「✅ 正常」的既有风控层；A/B 均把清算视为最后一道防线，隐含「开仓档应严于清算档，否则不存在安全垫」。
- 合约实现：`MarketUtils::getMinCollateralFactor` 的 NatSpec 写「Should always be larger than minCollateralFactorForLiquidation to ensure users cannot create immediately liquidatable positions」，`getMinCollateralFactorForLiquidation` 写「Should be lower than minCollateralFactor」。但 `src/config/ConfigUtils.sol:187-205` 只对两者各设了**独立**上限（`MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION ≤ 1%`、`MIN_COLLATERAL_FACTOR ≤ 5%`），没有任何跨键的大小校验。
- 差异：不变量只以注释形式存在，配置层可以把两者配成相等甚至反向（例如两者都配 1% 即可同时通过各自的范围校验）。
- 影响：两者相等时「开仓校验线 == 清算线」，仓位一旦通过开仓校验就贴在清算线上，安全垫为零；提取保证金的 Max 值会直接落到清算线。**本次未读取链上实配，两个因子的实际取值未核实**，需在目标环境用 `Reader` / DataStore 读键确认后再定性。
- 建议定性：缺陷候选（待配置核实）

---

### 12. `MAX_OPEN_INTEREST` 没有「0 表示不限制」的豁免

- 需求规范：B §十 键结构变更总表把 `MAX_OPEN_INTEREST` 列为「已实现，不动」的 per-side 硬顶（A §3.1 同）；两篇均未说明未配置（0）时的行为。
- 合约实现：`MarketUtils::validateOpenInterest` 的硬顶分支是 `if (openInterest > maxOpenInterest) revert`，没有 `maxOpenInterest > 0` 的前置判断——与同一份代码里 `validatePosition` 的 `if (maxPositionSizeUsd > 0 && ...)` 写法相反。
- 差异：同一份代码对「配置为 0」的两种上限采用了不同语义。
- 影响：新市场若漏配 `maxOpenInterestKey(marketIndex, isLong)`，任何开仓都会以 `MaxOpenInterestExceeded(oi, 0)` 失败；这是部署 checklist 项，也是 mock 市场初始化最常见的假缺陷来源。
- 建议定性：需求表述模糊（建议在参数目录里明确标注「必配、无 0 豁免」）

---

### 13. 方案断言「`willPositionCollateralBeSufficient` 完全不受负点差改动影响」只对开仓路径成立

- 需求规范：C 三.1.2 标题即「一个独立的、**不受影响的**第二层防线：`willPositionCollateralBeSufficient`」，正文断言「这个函数的设计是完全不算 fees 和 price impact……从头到尾不碰 `dynamicSpread`——**这一层完全不受本次改动影响**」；C 九.4 据此把「验证 `willPositionCollateralBeSufficient` 这一层（3.1.2）确实完全不受本次改动影响」写成测试点，且该测试点的场景明确含「开仓/加仓/**减仓**」。
- 合约实现：函数体本身确实不碰点差，但它有**两个**调用点——`IncreasePositionUtils.increasePosition`（`cache.sizeDeltaUsd > 0`）和 `DecreasePositionUtils.decreasePosition`（`cache.sizeDeltaUsd < position.sizeInUsd`，即每一笔部分减仓与每一笔纯提取保证金单）。减仓侧传入的 `realizedPnlUsd = cache.estimatedRealizedPnlUsd`，由 `PositionUtils.getExecutionPriceForDecrease` 的成交价推出；用户发起的 `MarketDecrease` 既不是 `Order.OrderType.Liquidation`、也不带 `secondaryOrderType == Adl`，因此 `allowNegativeSpread = true`，负点差直接进入该闸门的入参。
- 差异：方案把「函数体不碰点差」等同于「这层防线不受影响」，忽略了减仓路径的入参链路。
- 影响：**部分减仓 / 提取保证金的自动降级触发点会随负点差移动**。减仓侧 `!willBeSufficient` 不 revert `InsufficientCollateralUsd`（该错误只存在于开仓路径），而是：`sizeDeltaUsd == 0` 时 revert `UnableToWithdrawCollateral`；否则静默把 `order.initialCollateralDeltaAmount` 置 0（emit `OrderCollateralDeltaAmountAutoUpdated`）并回填 USD，随后若 `estimatedRemainingCollateralUsd + estimatedRemainingPnlUsd < MIN_COLLATERAL_USD` 再把 `order.sizeDelta` 自动改成 `maxSizeDelta`，**订单被升级为整仓全平**。按 C 九.4 的字面表述去设计「减仓侧该层不受影响」的回归用例会得到假通过；提取保证金 Max 值、部分平仓的期望输出量也必须按含负点差的成交价重算。另注：该 `if` 的第二个并列条件 `(estimatedRemainingCollateralUsd + estimatedRemainingPnlUsd) < MIN_COLLATERAL_USD` 与 `willBeSufficient` 是 `||` 关系，方案与既有核对文档均未提。
- 建议定性：需求断言与实现不符（方案自述结论过宽）

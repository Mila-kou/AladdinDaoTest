# u01（§1 精度与通用运算 · §2 Oracle 价格字段）需求↔实现差异台账

> 本组**无专属需求规范文档**（Precision / Calc / Price / oracle 均为底层库，Gordon 需求归档不覆盖）。因此下列各条的「需求规范」一栏引用的是**源码自身表达的设计意图**——NatSpec 注释、函数命名、合约头部说明；「合约实现」一栏是同一份源码的实际行为。两者不一致时，公式文档一律按实际行为写，差异记在这里。
>
> 源码基准：`Github/fx100-contracts@release-v0.3.2` @ `13880f2416918f4fed3fea86d7f1023084a3ce0d`。本组涉及的 `src/utils/Precision.sol`、`src/utils/Calc.sol`、`src/price/Price.sol`、`src/oracle/*` 与 v0.3.1（`d9a7fd2`）**blob 完全一致**，因此下列差异在两版同时存在。

---

### 1. 带符号 `applyFactor` / `mulDiv` / `toFactor` 是「向零截断」，注释只字未提

- 需求规范：`Precision.sol::applyFactor` 的 NatSpec 仅写 "Applies the given factor to the given value and returns the result."；同库另有显式的 `roundUpMagnitude` 参数版本，暗示「不传 `roundUpMagnitude` 就是常规取整」。
- 合约实现：`Precision.sol::mulDiv(uint256 value, int256 numerator, uint256 denominator)` 先 `mulDiv(value, numerator.abs(), denominator)` 取绝对值 floor，再 `numerator > 0 ? result : -result` 补符号；`mulDiv(int256, uint256, uint256)` 与 `toFactor(int256, uint256)` 同构。结果对负数是**向零截断**（`applyFactor(10, -0.25e30) = -2`），不是 floor（`-3`）。
- 差异：注释与命名没有区分「floor」与「向零截断」，只有读实现才能得知负数分支的取整方向。
- 影响：任何用 `Math.floor` 或按 floor 语义复算负值字段的期望值都会差 1 个最小单位；直接命中 `MarketUtils::getNextFundingAmountPerSize` 的 `positionPaysLp`、`PositionUtils::_getPositionPnlUsd` 的负 PnL 拆分等 E2E 常核字段，会以「1 wei 偏差」的形态报成假缺陷。
- 建议定性：需求表述模糊（源码注释缺口）——实现本身自洽，需补文档而非改代码。

---

### 2. `Calc.boundMagnitude` 对 `value == 0` 返回 `+min` 而不是 0

- 需求规范：函数名与 NatSpec "clamps / bounds the magnitude" 表达的意图是「只压缩幅度、不改变零值」。
- 合约实现：`Calc.sol::boundMagnitude` 中 `magnitude = value.abs()`，`magnitude < min` 时被抬到 `min`；符号 `sign = value == 0 ? int256(1) : value / value.abs()`。因此 `boundMagnitude(0, min, max) == +min`，把 0 变成了一个正的下界值。
- 差异：零值被静默放大成 `+min`，与「只做幅度夹紧」的语义相反。
- 影响：**v0.3.2 `src` 无调用点**，当前不影响任何链上路径与资金。但该函数一旦被接到点差、funding factor 或 skew 的夹紧上，会把「无偏斜 / 无点差」的中性状态变成单边正值。测试侧的风险是照着函数名给期望值。
- 建议定性：缺陷候选（当前未激活）——建议要么删除死代码，要么补 `value == 0 → return 0` 分支。

---

### 3. 库内保留了一批 v0.3.2 `src` 完全没有调用点的工具函数

- 需求规范：`Precision.sol` / `Calc.sol` 作为「通用运算库」对外呈现完整工具集，NatSpec 逐个函数写明用途，未标注任何一个为废弃。
- 合约实现：v0.3.2 `src` 全量 grep 显示无调用点的有——`Precision::applyExponentFactor`、`Precision::applyFactor(uint,int,bool)`（三参带符号版）、`Precision::FLOAT_PRECISION_SQRT`、`Calc::roundUpMagnitudeDivision`、`Calc::boundMagnitude`、`Calc::boundedAdd`、`Calc::boundedSub`、`Calc::toSigned`；`Precision::floatToWei` / `weiToFloat` / `FLOAT_TO_WEI_DIVISOR` 仅被同样无调用点的 `applyExponentFactor` 使用。
- 差异：库的表面能力集 ⊋ 实际启用的运算路径，且无任何标记区分。
- 影响：公式文档（v0.3.1 与 v0.3.2 均如此）把 `floatToWei` / `weiToFloat` 列进「通用公式」、把「绝对值向上取整」归给 `Calc.roundUpMagnitudeDivision`，都是按库表面写的，会把测试引向不存在的计算路径；真正做绝对值向上取整的是 `Precision.mulDiv(int,uint,uint,roundUpMagnitude)`。
- 建议定性：设计已变更未回写文档——建议在库内标注 unused / deprecated，公式文档已按实际调用点重写。

---

### 4. `toFactor` 的 `value == 0` 早退会吞掉 `divisor == 0`

- 需求规范：`Precision.sol::toFactor` 的语义是 `value / divisor` 的 1e30 定点表示；除零应当是错误。
- 合约实现：`toFactor(uint256 value, uint256 divisor, bool roundUpMagnitude)` 开头 `if (value == 0) return 0;`，在 `Math.mulDiv` 之前返回，所以 `toFactor(0, 0) == 0`（不 revert）；而 `value != 0 && divisor == 0` 走 `Math.mulDiv` 除零 revert。
- 差异：同一个「除数为 0」的非法输入，按被除数是否为 0 分裂成「静默返回 0」和「revert」两种结果，而不是统一 revert。
- 影响：已核实 v0.3.2 的风控类调用点**都在外层自己做了守卫**——`MarketUtils::getGlobalNetObligationRatio` 与 `::getPnlToPoolFactor` 都有 `poolUsd == 0 → return 0` 早退，funding 的四处 `toFactor` 都在 `openInterestInTokens > 0` 分支内，因此这条不影响资金。唯一没有外层守卫的是 `Oracle.sol::_validateRefPrice` 的 `Precision.toFactor(diff, refPrice)`：若 Pyth 参考价经 multiplier 标度后 floor 成 0，则「待校验价也为 0」时校验静默通过、「待校验价非 0」时 revert，同一非法输入两种结局。
- 建议定性：缺陷候选（低危 · 边界一致性）——建议把守卫收进 `toFactor` 本身或在 `_validateRefPrice` 补 `refPrice == 0` 分支；当前不构成资金风险，测试上仅需覆盖 `_validateRefPrice` 这一处边界。

---

### 5. 两个 on-chain feed provider 用 `block.timestamp` 冒充价格时间戳，架空了两道陈旧校验

- 需求规范：`Oracle.sol::_validatePrices` 用 `MAX_ORACLE_PRICE_AGE` 拦截陈旧价，`Oracle.sol::_getSecondaryPrice` 用 `MAX_RECORDED_PRICE_AGE` 拦截陈旧历史价——两者的设计意图都是「价格必须足够新」。
- 合约实现：`ChainlinkPriceFeedProvider.sol::getOraclePrice` 与 `PythPriceFeedProvider.sol::getOraclePrice` 均返回 `timestamp: block.timestamp`，且 `shouldAdjustTimestamp() == false`。于是 `validatedPrice.timestamp + MAX_ORACLE_PRICE_AGE < block.timestamp` **恒不成立**；随后 `_setPrimaryPrice` 又把这个「当前时间」写进 `latestRecordedPrices`，使 secondary 的 `MAX_RECORDED_PRICE_AGE` 度量的是「距上一笔写价交易多久」而非「距 feed 实际更新多久」。这两个 provider 的注释自承是取舍（"it is assumed that the feed is sufficiently updated"）；实际唯一防线是 `ChainlinkPriceFeedUtils` 的 `PRICE_FEED_HEARTBEAT_DURATION` 与 Pyth 的 `getPriceNoOlderThan`。附带：`PythPriceFeedProvider` 的这段注释是从 Chainlink 版整段复制的，文中仍写 "Chainlink on-chain price feeds"。
- 差异：`MAX_ORACLE_PRICE_AGE` / `MAX_RECORDED_PRICE_AGE` 两个参数对这两个 provider 事实上不生效，与参数名表达的保护意图不符。
- 影响：用这两个 provider 的 token（含 mock 环境常用的稳定币）无法通过调 `MAX_ORACLE_PRICE_AGE` 构造「陈旧价被拒」的用例；ADL 的 secondary 陈旧保护在这些 token 上同样落空。测试设计若按参数名推导用例会全部落空，且真实环境下陈旧保护弱于文档预期。
- 建议定性：缺陷候选（设计取舍已在注释中承认，但参数语义与实际保护范围不一致，需要产品侧确认）。

---

### 6. Chainlink 心跳校验对「未来时间戳」整条跳过

- 需求规范：`ChainlinkPriceFeedUtils.sol` 头注释 "there is a small risk of stale pricing due to latency in price updates or if the chain is down"，`PRICE_FEED_HEARTBEAT_DURATION` 的意图是拦截超期未更新的 feed。
- 合约实现：`ChainlinkPriceFeedUtils.sol::getPriceFeedPrice` 写作 `if (block.timestamp > timestamp && block.timestamp - timestamp > heartbeatDuration) revert ChainlinkPriceFeedNotUpdated(...)`。第一个条件是为了防 `uint` 下溢，但副作用是：只要 feed 返回的 `timestamp >= block.timestamp`（未来时间戳），心跳校验整条被跳过，价格无条件采纳。
- 差异：陈旧检查只覆盖「过去」方向，未来方向既不拦截也不报警。
- 影响：被操纵或配置错误的 feed 只要把时间戳推到未来即可绕过唯一的新鲜度防线（结合第 5 条，这两个 provider 没有别的防线）。fork 环境上调时间做用例时，若把区块时间往回调，也会静默跳过心跳校验，导致「陈旧价拒绝」类用例假 PASS。
- 建议定性：缺陷候选（安全 · 中危）。

---

### 7. primary 与 secondary 的价格结构不同（bid/ask vs 平价），同一时刻可给出口径不一致的估值

- 需求规范：`Price.sol` 的 `Props{min, max}` 与 `ChainlinkDataStreamProvider` 的 "bid: min price / ask: max price" 注释表明，系统的价格模型是**带买卖价差的双边价**，全部估值都应在这个模型内做保守取侧。
- 合约实现：`Oracle.sol::_getSecondaryPrice` 的第一条分支（该 token 登记了 `PRICE_FEED`）直接返回 `Price.Props(price, price)`，`min == max`，无点差；只有回退到 `latestRecordedPrices` 时才拿到有点差的双边价。而 secondary 的消费方 `MarketUtils::getNetObligation` / `::getGlobalNetObligationRatio` / `BaseRelayRouter::_payRelayFee` 都是按 `Price.Props` 语义使用的。
- 差异：同一 token 在同一区块，primary 可能是 `[bid, ask]`、secondary 可能是 `[p, p]`，两套估值口径不可比。
- 影响：ADL 风控（净负债/池子价值比）与 relay fee 换算的取侧保守度取决于「该 token 是否登记了 PRICE_FEED」这一部署配置，而不是业务规则；同一场景换环境（fork 上登记与否不同）结论会变。测试上必须先确认目标 token 的 `PRICE_FEED` 登记状态，否则 §12 / §15 的期望值算法选错。
- 建议定性：设计已变更未回写文档（口径分裂需在文档与部署清单中显式登记）。

---

### 8. `getPrimaryPrice` / `getSecondaryPrice` 对 `address(0)` 静默返回 `(0, 0)`

- 需求规范：`Oracle.sol` 合约头注释明确 "zero / negative prices are considered empty / invalid"，且 `Price.sol::isEmpty` 把 `min == 0 || max == 0` 定义为空价、`getPrimaryPrice` 对空价 `revert EmptyPrimaryPrice`。
- 合约实现：两个读取入口都在最前面加了 `if (token == address(0)) return Price.Props(0, 0);`，绕过了 `isEmpty` 检查，把「无效价」当正常返回值交给调用方。
- 差异：合约自己定义为 invalid 的零价，在 `address(0)` 这条入口上不 revert 而是被正常返回。
- 影响：调用方若未判空，零价会向下游传播——乘法路径把 USD 值算成 0（金额静默归零），除法路径才 revert（Panic 0x12）。故障点被推迟到远离根因的地方，排障成本高。`MarketUtils::getMarketPrices` 直接把两个 token 的价塞进 `MarketPrices`，未做 `address(0)` 判定。
- 建议定性：缺陷候选（低危 · 防御性）——若该分支是为「市场无 collateral/index token」的合法场景服务，应在注释中写明并在消费方补判空。

---

## 未列入本台账的观察（供后续章节参考，非差异）

- `ChainlinkDataStreamProvider` 的 `spreadReductionFactor == 1e30` 分支把 bid/ask 收敛成同一个中间价，属显式配置能力，不是差异；但它会让该 token 的 primary 也变成平价，与第 7 条叠加后 primary/secondary 反而一致，测试时要连带核对该配置。
- `Oracle.sol::_setPrices` 在 `prices.length == 0` 时直接 return（gasless relay 无需价格），此时 `tokensWithPrices` 保持为空、`minTimestamp/maxTimestamp` 不更新，是设计内行为，已写入 §2.5。

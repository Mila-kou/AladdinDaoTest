# §4 动态点差与成交价格 — 需求↔实现差异台账

需求规范基线：`Docs/v0.3.2/需求文档/2026-08-18_实施方案：Dynamic-Spread-允许为负+清算-ADL-隔离（更新版）.md`（优先），`2026-07-29_Dynamic-Spread-允许为负+清算-ADL-隔离实施方案.md`（被取代版，仅作对照）。
实现基线：`Github/fx100-contracts@release-v0.3.2` @ `13880f2`。

---

### 1. 两个 clamp 键未配置时，需求说「退回 floor-at-0」，实现是「点差恒 0」

- 需求规范：08-18 更新版 一.3：「`dataStore.getInt` 对未写入的 key 默认返回 `0`，如果漏配，`minDynamicSpread`/`maxDynamicSpread` 都会是 `0`，**等效于自动退回今天的 floor-at-0 行为**（不会报错，但新功能形同虚设）」；07-29 版 二节第 1 条同义：「新 key 未写入时默认值为 0，不会报错，但会退回旧的 floor-at-0 行为」。
- 合约实现：`src/pricing/PositionPricingUtils.sol::getDynamicSpread` — 两键均为 0 时 `minDynamicSpread=0`、`maxDynamicSpread=0`，`Calc.clamp(raw, 0, 0)`（`src/utils/Calc.sol::clamp`）对 `raw > 0` 走 `value > max → 返回 max = 0`。即**任何正的 raw 也被压到 0**，常数点差 `CONSTANT_PRICE_SPREAD` 与深度冲击一并被吞，执行价恰好等于 oracle 选价。
- 差异：v0.3.1 的 floor-at-0 会保留正点差、只砍负值；v0.3.2 漏配时是「点差链路整体失效」，两者行为不同，需求文档把二者等同了。
- 影响：升级后若任一市场 × 方向漏写这两个键，该市场全部开平仓零点差成交，协议永久性少收点差收入且做市偏斜调节失效；且因为不 revert、不报警，只能靠部署读值核对发现。测试侧若照需求文档写期望值（保留常数点差 1e14）会与链上偏差整整一个常数点差。
- 建议定性：缺陷候选（升级漏配的静默失效；已由 `Docs/contract-releases/v0.3.2/05-重要参数边界场景.md` B32-1-01 立为必核项，但需求文档表述本身也需订正）

---

### 2. 需求要求的配置护栏（链上 require）完全未实现，`max < min` 静默按 min 生效

- 需求规范：08-18 更新版 五节：「考虑到这是直接决定"最多倒贴多少钱"的风控参数，建议**至少加链上校验**，哪怕只是一个简单的 `require`——配置错误的后果参考风险分析文档 4.1 节的数字（单笔就能到 $8,000+ 量级）」。
- 合约实现：`src/config/Config.sol::setInt` 函数体只有 `_validateKey(baseKey)` + `store.setInt`，**不调用 `ConfigUtils.validateRange`**（该函数只在 `setUint` 路径被调用，且只覆盖 `SEQUENCER_GRACE_DURATION` 等少数键）。`_initAllowedBaseKeys` 仅把 `MIN_DYNAMIC_SPREAD` / `MAX_DYNAMIC_SPREAD` 加进白名单（`Config.sol:391-392`），无任何数值范围或跨键关系校验。运行时唯一的兜底是 `getDynamicSpread` 里的 `if (maxDynamicSpread < minDynamicSpread) maxDynamicSpread = minDynamicSpread` —— 错配不 revert，而是把 clamp 区间坍缩成单点，点差恒等于 `min`。
- 差异：需求建议的链上强制校验一条也没落地，越界与相对关系防护全部依赖运行时 clamp 的静默修正。
- 影响：CONFIG_KEEPER 单次误操作（例如把 min 写成 `1e16`、max 写成 `5e15`）会让该市场该方向的点差恒等于 1%，所有成交价系统性偏移且无任何链上信号；写入 `−1e18` 一类极端值同样可以成功（B32-1-09 实测预期）。测试侧必须把「配置错误」当成可达状态设计用例，不能假设链上会拒。
- 建议定性：缺陷候选（风控护栏缺失。注：`05-重要参数边界场景.md` B32-1-09 已把它记为「已确认的设计现状而非缺陷断言」，但需求文档从未回写「决定不做」的结论，两边定性不一致）

---

### 3. 清算 / ADL 的正向上限：需求正文说「完全不受影响、无上限」，实现沿用普通交易的 `MAX_DYNAMIC_SPREAD`

- 需求规范：08-18 更新版 零节：「但清算和 ADL 这类强制平仓，**继续保持今天 floor-at-0 的行为，不受影响**」；二.2 的目标伪代码把 clamp 只放在非清算分支，清算分支是 `if (dynamicSpread <= 0) return 0; return dynamicSpread;`（不经任何上限）。同文 九.3 自述：「本方案三.1/三.2 最初的设计意图是"清算/ADL 完全不受这次改动影响，保持今天 floor-at-0、**无上限**的行为"」。
- 合约实现：`src/pricing/PositionPricingUtils.sol::getDynamicSpread` 对清算/ADL 与普通交易走**同一条 clamp**，只在 `!allowNegativeSpread && minDynamicSpread < 0` 时把下限抬到 0；`maxDynamicSpread` 读的是同一个 `MAX_DYNAMIC_SPREAD[marketIndex][isLong]`，清算执行价同样被它封顶。
- 差异：需求正文（零节 / 二.2 伪代码 / 三节）与实现不一致；同一份文档的 九.3 已记录该偏离并写明「2026-08-03 团队已拍板：保留现状，不再单独放开」，但正文与伪代码未随之订正。
- 影响：对测试是「预期来源二选一」的陷阱——按正文伪代码算清算执行价（无上限）与按实现算（受 max 封顶）在 `raw > maxDynamicSpread` 时会给出不同期望值。另按 九.3 的提醒：`MAX_DYNAMIC_SPREAD` 这一个数值同时管着普通交易与清算/ADL 两类场景，未来调参必须双场景评估。
- 建议定性：需求表述模糊（同一文档正文与第九节自相矛盾；实现口径以 九.3 为准）

---

### 4. 需求第八节的前端联动未落地：`fx100-apps@develop` 仍镜像 v0.3.1 的 floor-at-0

- 需求规范：08-18 更新版 八节：「合约允许 `dynamicSpread` 为负后，前端有一处**镜像了合约旧 floor-at-0 逻辑**的本地计算，如果不同步改，改善平衡的单在前端会永远显示 0 spread（吞掉返利）」；8.1 要求把 `executionPrice.ts:349` 的 `dynamicSpread <= 0n ? 0n : dynamicSpread` 换成读新键的 `clamp(min, max, dynamicSpread)`；8.3 要求把两个新键加进 SDK 的 DataStore multicall。
- 合约实现（前端侧对照）：`Github/fx100-apps@develop/apps/fx-base-app/src/lib/executionPrice.ts:348-349` 仍是 `const dynamicSpread = constantSpread + depthSpread + skewImpact; const spread = dynamicSpread <= 0n ? 0n : dynamicSpread;`，类型注释也仍写着 `// spread: max(0, dynamicSpread)`（:74）。未见 `MIN/MAX_DYNAMIC_SPREAD` 的读取。
- 差异：需求要求的前端 clamp 改造未实现，前端预览仍按 v0.3.1 口径 floor 到 0。
- 影响：改善平衡方向的订单，页面 Est. execution price / Total Spread / Price Impact 三处读数会与链上实际成交价系统性不一致（链上给负点差让利、页面显示 0）；跨层一致性用例（XT-*）在负点差场景下必然 FAIL，需要按「前端未改造」定性为前端缺陷而非合约缺陷。
- 建议定性：缺陷候选（前端层；本条为跨仓库对照结论，前端 commit 以 `CURRENT.json` `frontend.head` 登记为准，未逐 commit 复核）

---

### 5. 默认部署配置让「点差可为负」这一新功能在默认市场上不可达

- 需求规范：08-18 更新版 一.3 的联动提醒：「如果目标是让 `dynamicSpread` 能比今天更负，只加 `minDynamicSpread` 这一个新 key 是不够的，可能还需要通过治理把 `minSkewImpactKey` 现有的配置值调得更负……上线前建议把这两个数字放在一张表里对齐清楚」；六节测试清单第 1 条要求验证「改善平衡时 `dynamicSpread` 为负、成交价优于 oracle」。
- 合约实现：`scripts/config/defaults.ts` 中每个市场都是 `minSkewImpact: 0n`、`minDynamicSpread: -(WEI_PRECISION * 2n) / 100n`（−2%）、`maxDynamicSpread: WEI_PRECISION`（100%）。`getSkewImpact` 的 clamp 下限为 0 ⇒ `skewImpact ≥ 0` ⇒ `raw = skewImpact + constant + priceImpact ≥ 0`，`minDynamicSpread = −2e16` 永远不可能被触及；同时 `maxDynamicSpread = 1e18` 远高于三项自然上限，上限也永不生效——自然上限按市场而异（`MAX_SKEW_IMPACT`、`CONSTANT_PRICE_SPREAD` 均为 per-market 键，`MAX_PRICE_IMPACT_SPREAD` 为全局键）：ETH（`defaults.ts:59` `maxSkewImpact = 5e15`）＝ `1e14 + 5e15 + 5e15 = 1.01e16`，WBTC（`:85` `maxSkewImpact = 1e16`）＝ `1e14 + 5e15 + 1e16 = 1.51e16`。
- 差异：需求提醒的「两层配套调整」在默认配置里没做；按默认值部署的市场，负点差功能等于未开启，两个新键的 clamp 都是空转。
- 影响：若测试环境沿用 `defaults.ts` 或同口径的初始化档案（`TestCode/config/environment-initialization-profiles.json` 里部分市场 `MIN_DYNAMIC_SPREAD(true/false)` 甚至为 `"0"`），负点差用例（SCN-050、B32-1-06/07）必须先改写 `MIN_SKEW_IMPACT` 才能构造出负点差，否则会得到「spread 恒非负」的假 PASS/假 FAIL。部署核对必须同时读 `MIN_SKEW_IMPACT` 与 `MIN_DYNAMIC_SPREAD` 两层。
- 建议定性：缺陷候选（配置层：新功能默认关闭且无告警。若产品意图就是「先默认关闭、按市场逐个放开」，则应回写为设计决策）

---

### 6. ADL 隔离的落地方式与需求三.3「方案 A」不同（需求已自认过时，正文未订正）

- 需求规范：08-18 更新版 三.3：「`Order.sol:30-33` 定义了 `SecondaryOrderType { None, Adl }` 枚举，但**目前没有对应字段存在 `Order.Props` 里，也没有 getter/setter**……**方案 A（推荐）**：给 `Order.Props` 加一个 `secondaryOrderType` 字段 + `setSecondaryOrderType`/`secondaryOrderType()` getter/setter」。
- 合约实现：`Order.Props` **没有**新增该字段。实际通路是 `PositionUtils.UpdatePositionParams.secondaryOrderType`（`src/position/PositionUtils.sol:43`），由 `AdlHandler.executeAdl` 传入 `Order.SecondaryOrderType.Adl`（`src/exchange/AdlHandler.sol:128`）→ `BaseOrderHandler._getExecuteOrderParams`（`:67`）→ `DecreaseOrderUtils` → `getExecutionPriceForDecrease` 的 `params.secondaryOrderType == Order.SecondaryOrderType.Adl` 判定（`PositionUtils.sol:701`）。
- 差异：判定信号源不是订单存储字段而是执行参数字段；同一文档 九.2 已自认「本节判断依据过时……工程师直接复用了这条现成通路，比方案提议的新增字段更干净，是文档没查全，不是实现的问题」，但三.3 正文未订正。
- 影响：对测试的实际影响是**取证路径不同**——ADL 身份不在 `Order` 存储里，链上按订单查不到；只能从 `OrderExecuted` 事件的 `secondaryOrderType`（`src/order/OrderEventUtils.sol:45`，uintItems 第 0 项）取证。按需求正文去读 `order.secondaryOrderType()` 会取不到值。同理，`Order.isLiquidationOrder` 对 ADL 订单恒为 false（ADL 的 `orderType` 是普通 `MarketDecrease`）。
- 建议定性：设计已变更未回写文档（实现更优，需求正文三.3 应订正为「复用 `UpdatePositionParams.secondaryOrderType`」）

---

### 7. 隔离开关的参数形态与极性与需求伪代码相反（命名级差异，无行为影响）

- 需求规范：08-18 更新版 二.2 / 三.2：`getDynamicSpread(GetPriceImpactUsdParams memory params, bool isLiquidationContext)`，独立布尔入参，`true` 表示「清算上下文」；三.2 还建议改名 `isForcedCloseContext`。
- 合约实现：布尔并入结构体并**反了极性**——`GetDynamicSpreadParams.allowNegativeSpread`（`src/pricing/PositionPricingUtils.sol:64`），`false` 才表示清算/ADL；结构体本身也从 `GetPriceImpactUsdParams` 更名为 `GetDynamicSpreadParams`。
- 差异：入参位置、名称、极性三处与需求伪代码不一致，语义等价。
- 影响：无资金影响。仅影响按需求文档写 harness / 单测 mock 的人——传 `true` 在需求语义下是「清算」，在实现里是「允许负点差＝非清算」，极性写反会让隔离用例静默失效（构造的清算场景实际拿到了负点差）。
- 建议定性：设计已变更未回写文档

---

## 附注：本组需求规范未覆盖的实现变化（不计为差异）

- `getPriceImpactSpread` 在 v0.3.2 新增的早退分支 `priceImpactExponent > uint256(LogExpMath.MAX_NATURAL_EXPONENT = 130e18) → return MAX_PRICE_IMPACT_SPREAD`（`PositionPricingUtils.sol:202-205`），来自审计修复而非本组两篇 Dynamic Spread 方案，两篇需求文档均未提及。行为已按源码写入 §4.2。
- `getNextOpenInterest` 把 `params.usdDelta` 就地覆盖为 `tokenDelta × midPrice`（`PositionPricingUtils.sol:303`）是 v0.3.1 就有的既存行为，本组需求文档未描述，也未主张改动。已按源码在 §4.3 写明「深度冲击用覆盖前值、偏斜用覆盖后值」。

---
id: BUG-FE-STOPTYPE-016
title: 触发式入场单（StopIncrease）在订单列表被错标为 "Limit"；编辑触发价跨越现价时不重派订单类型/操作符，造出必然自冻的订单且仅显平静 Pending
severity: S2
priority: P1
status: open
found: 2026-08-29
env: https://fx100-dev.vercel.app · Base Sepolia 84532 · v0.3.1 · Chrome 桌面 · 已连接 0xEEeA…B119 · 逐笔签名
source-case: E2E-TRD S7（出单参数链上断言）· E2E 限价/触发单入场 · 2026-08-29 R3 LOG-068/069（链上取证 forensics-stop.mjs / stop-orders.json）
finder: 执行人（Mila）+ 记录员链上取证
---

# BUG-FE-STOPTYPE-016 · 触发入场单类型错标 + 编辑跨市价不改类型致自冻

两个症状同根：**前端订单列表/编辑逻辑没有 "StopIncrease（触发式增仓）" 这个类别**，把它并进 "Limit" 处理。

## 症状 A：订单列表 Type 列把 StopIncrease 错标为 "Limit"（display bug）

- 操作：ETH 下单区 Limit 页签 · Sell/Short · $2,000 · 75x · **触发价 Oracle ≤ 2410（现价 2,435.89 下方）**；下单**按钮读 "Place Stop"**。
- 提交后 Open Orders 该行 **Type 列显示 "Limit"**（2026-08-29 20:03:46，$2,000 / 0.8299 ETH / Trigger Oracle ≤ 2,410 / RO No / Pending）。
- **链上真相（创建 tx `0xce8f25ec11b30972605f9131f3d7515fdc8a4dbd8af71c624795401440060072`，block 46118369）**：`orderType = 6 (StopIncrease)`、isLong=false、triggerPrice=2410、acceptablePrice=2397.95=2410×(1−0.5%)、sizeDelta=$2000。枚举依据 v0.3.1 `src/order/Order.sol`（6=StopIncrease）。
- **三处口径打架**：下单按钮="Place Stop" · 列表 Type="Limit" · 链上=StopIncrease(6)。列表 TYPE 筛选项仅 `Market / Limit / Take Profit / Stop Loss`——**无 "Stop"(增仓) 桶**，StopIncrease 被塞进 "Limit"。
- 影响：用户/测试无法从**当前挂单页**区分 Limit-Increase 与 Stop-Increase（两者触发方向、执行语义相反），订单类型显示不可信。链上语义本身正确，故本症状为 display 级。
- **定性收敛（2026-08-29 21:3x，Orders History 对照）**：**Orders History 标签页的 Type 列标注正确**——`StopIncrease → "Stop Market"`、`LimitIncrease → "Limit"`，与链上 orderType **4/4 精确吻合**（20:03 Stop Market / 20:21 Limit / 21:30 Limit / 21:31 Stop Market，全部对应链上 6/1/1/6）。故 **app 已具备并在用正确的类型映射，错标仅出现在 Open Orders(挂单)标签页**，它把所有触发入场单拍平成 "Limit"。→ 缺陷范围收窄为"Open Orders 未复用 Orders History 已有的类型显示"，修复更轻、几乎无需产品决策（"Stop Market" 文案已存在于 app 内、且与 Hyperliquid 同词）。

## 症状 B：编辑触发价跨越现价时不重派类型/操作符 → 造出必然自冻的订单（行为 bug，S2 定级来源）

- 操作：对症状 A 的订单点 **Edit**，把触发价 **2410 → 2470（改到现价上方）**，提交。
- **链上（OrderUpdated tx `0x248631a674e615d8817c1116e37d802862a878082fe2e53a463888bb0ba1c757`，20:08:30，同 orderKey `0x984b73efce6b1020c67c24014237444602c7cdd341acbea07b255bbfb2e2603b`）**：triggerPrice→2470、acceptablePrice→2457.65=2470×(1−0.5%)，**orderType 仍 = 6 StopIncrease、触发操作符仍 "Oracle ≤"**（未随"跨越现价"翻转）。
- 后果链：2470 在现价上方 → "Oracle ≤ 2470" 立即成立 → keeper 立即尝试执行 → 空头开仓须成交价 ≥ acceptable 2457.65，但市价仅 **2435.57** → 不可成交。
- **20:09:30 OrderFrozen（tx `0x7322c0ae2eb5788d42f2339a911b3b12b9f95c27f9cecef3488136c746c2cb09`，同 orderKey）**：reasonBytes 选择器 `0xe09ad0e9` = `FxErrors.OrderNotFulfillableAtAcceptablePrice(uint256 price, uint256 acceptablePrice)`（`src/order/BaseOrderUtils.sol:228/266`、`src/error/FxErrors.sol:252`），解参 **price=2435.57 / acceptablePrice=2457.65**，精确坐实冻结成因。
- **前端表现**：编辑后订单一直显示平静 "Pending"（Trigger: Oracle ≤ 2,470），**无任何"该配置将立即冻结/不可成交"警告**；冻结发生在链上 1 分钟后，前端亦无可见的"已冻结/原因"提示。

## 期望

1. **A**：订单列表 Type 列（及筛选）区分 `Limit`（LimitIncrease）与 `Stop`（StopIncrease），与下单按钮文案一致；至少 StopIncrease 不得显示为 "Limit"。
2. **B**：编辑/下单时若触发价相对现价的位置决定了应有的订单类型（空头：上方=Sell-Limit/LimitIncrease+"≥"、下方=Sell-Stop/StopIncrease+"≤"；多头镜像），则**随触发价跨越现价自动重派 orderType 与触发操作符**；无法自动重派时**阻止提交并提示**，不得留下"操作符与触发价方向矛盾、必然自冻"的订单，也不得把这种单显示为普通 Pending 而不提示冻结风险。

## 影响与定级

- 协议侧冻结**正确**（不以劣于 acceptablePrice 的价成交，资金安全，非资损）；缺陷纯在前端。
- 但 B 让用户能创建一笔"注定立即冻结"的入场单，且用平静 Pending 掩盖、冻结后无原因回显——误导性强、属可复现的功能缺陷，故整单 **S2/P1**（A 单独看为 S3 显示级，B 抬升定级）。
- 同族：SLACCEPT-009 / EDITACCEPT-014（均 acceptablePrice 冻结），但本单根因是"列表/编辑缺 StopIncrease 类别 + 编辑不随现价重派类型"。

## 证据

- 链上取证脚本 `TestCode 侧 scratchpad/forensics-stop.mjs` → `stop-orders.json`（OrderCreated/OrderUpdated/OrderFrozen 全解码）；
- 截图：Open Orders 行（Type=Limit / Trigger Oracle ≤ 2,410）、编辑后（Trigger Oracle ≤ 2,470，Pending）；
- 交叉证据：LOG-068（下单设置）、LOG-069（链上取证与时间线）。

## 正例已验（2026-08-29 20:21，链上坐实：表单路径完全正确 → 缺陷确定只在编辑路径）

执行人按建议做了镜像正例：**表单直接**下一笔空头、触发价设**现价上方**（不经编辑）。表单表现全对：
- 触发操作符自动显示 **"Oracle ≥ 2480"**（≥，随"上方"翻转）；下单**按钮读 "Place Limit"**；Trade Details 明写 **"Limit sell: triggers when Oracle ≥ 2480, then opens at market (≈2480)"**；
- 链上（创建 tx **`0x561dd6ede179b8741321e07682bbe1df6daa469f4c1e5b95f21a05515275690f`**，20:21:50，orderKey `0x4f74eed8…e9a8`）：**orderType = 1 (LimitIncrease)** ✓、isLong=false、triggerPrice=2480、acceptablePrice=**2467.60=2480×(1−0.5%)**；
- 状态 **Pending（健康）**：LimitIncrease 触发条件 Oracle ≥ 2480，现价 2438.65 < 2480 → 未触发、安静等上涨，届时成交≈2480 ≥ 底价 2467.60 可成交。

**三单同页对照（决定性隔离）**：

| 页面时间 | 触发显示 | vs 现价 | 链上 orderType | acceptablePrice | 状态 | 路径 |
|---|---|---|---|---|---|---|
| 20:03:46 | Oracle **≤** 2410 | 下方 | 6 StopIncrease | 2397.95 | Pending（后被编辑） | 表单直下 ✓ |
| 20:08:30 | Oracle **≤** 2470 | 上方 | **6 StopIncrease**（编辑保留） | 2457.65 | **Frozen** | 编辑 2410→2470 ✗ |
| 20:21:50 | Oracle **≥** 2480 | 上方 | 1 LimitIncrease | 2467.60 | Pending | 表单直下 ✓ |

**结论强化**：表单路径能正确按"触发价 vs 现价"派生 orderType(1/6) 与操作符(≥/≤)、按钮文案、说明文案——证明**逻辑已存在且正确**。症状 B 缺陷是**编辑路径没有复用这套派生**（编辑只改了 triggerPrice，未重派 type/operator）。修复=**让 Edit 走与表单相同的派生逻辑**（触发价跨越现价即重算 type+operator，或无法重派则拦截并提示）。

## 修复建议（QA 提案 · 含确认级别）

> 本节为测试侧修复提案，供 fx100-apps 前端研发与产品评估。**fx100-apps 属被测前端，测试侧不直接改产品代码；改与不改、如何改由研发/产品裁定。** 每条标注确认级别：`【缺陷直修】`=明确错误、方向清晰可直接排期；`【需产品确认】`=涉及交互语义/文案决策，须经 PO/设计确认后再定实现细节。

### 症状 B（编辑不重派类型致自冻）— 主修

- **B1【缺陷直修】编辑复用表单已有派生逻辑**：Edit 提交前，按「触发价 vs 现价 + 多空方向」重算 `orderType`（LimitIncrease/StopIncrease）与触发操作符（≥/≤），与新开表单同一套逻辑（表单已链上验证正确，tx `0x561dd6ede179b874…690f`）。这是消除"必然自冻单"的根因修复。
  - **确认点【需产品确认】**：编辑使触发价跨越现价、导致**订单语义翻转**（Sell-Stop 破位空 ↔ Sell-Limit 高抛空）时，是**静默自动转换**（与表单一致）还是**先提示"已由 Stop 转为 Limit"再提交**。表单当前为静默转；为一致性建议编辑也静默转，但"编辑既有单"涉及用户既定意图，是否加一次确认由产品定。
- **B2【缺陷直修】拦截矛盾/必然冻结配置**：若产品选择不自动转、或某编辑无法自动重派，则**提交前校验并禁用按钮**——当「操作符方向 + 触发价相对现价」的组合会使 acceptablePrice 立即不可满足时，禁止提交并给出原因。app 在**持仓行 TP/SL 弹窗**已具备"方向非法→按钮 disabled"的能力（见 TPSL-007 对照），此处复用即可。
- **B3【缺陷直修】冻结态可见化**：订单在链上 OrderFrozen 后，前端不应从 Pending **静默跳 Frozen 而无任何解释**；应展示冻结原因（如"成交价未达可接受价，订单已冻结"）并给出 编辑/取消/重挂 引导。当前无原因提示。

### 症状 A（列表 Type 把 StopIncrease 错标为 "Limit"）— 次修

- **A1【缺陷直修，几乎无需产品决策】**：让 **Open Orders 标签页复用 Orders History 已有的类型显示逻辑**——Orders History 已正确把 `StopIncrease→"Stop Market"`、`LimitIncrease→"Limit"`（与链上 4/4 吻合），Open Orders 直接沿用同一映射即可，不必新造文案/筛选桶。"Stop Market" 标签已存在于 app 内、且与下单按钮 "Place Stop"、Hyperliquid 命名一致。
  - 可选【需产品确认】：Open Orders 顶部 TYPE 筛选是否也新增 "Stop" 筛项（当前仅 Market/Limit/Take Profit/Stop Loss）——纯筛选便利，非阻断项。

### 是否需要确认按建议修改（结论）

- **仅一处需确认。** B1/B2/B3、A1 均方向明确、可直接排期（A1 沿用 Orders History 已有的 "Stop Market" 映射，原"标签命名需确认"已消解）；**唯一须先经产品/设计拍板的是**：① B1 跨市价语义翻转采用「静默自动转」（与表单一致）还是「提示后转」。其余按缺陷直修。
- 建议顺序：先修 **B1（根因，消除自冻）** 与 **B3（冻结可见化，止损用户困惑）**，再按产品定论处理 B1 确认点、B2 兜底与 A1 文案。

## 参考对标：Hyperliquid 如何规避本类缺陷（industry precedent）

据 Hyperliquid 官方文档，其从结构上避免"编辑触发价致类型错乱/自冻"，可作 FX100 修复选型参考：

1. **订单类型显式命名、非推断**：HL 有独立命名类型 `Market / Limit / Chase / Stop Market / Stop Limit / Take Market / Take Limit / Scale / TWAP`，用户**显式选类型**；类型是订单固定属性，**不从"触发价 vs 现价"隐式推断**。→ 编辑触发价不会像 FX100 这样悄悄翻转语义（FX100 是"推断型"，症状 B 即推断未在编辑路径重跑）。
2. **触发方向硬校验（正对标 B2）**：HL 文档明确 "Stop Market：多头触发价须**高于**中间价、空头须**低于**中间价；Take Market 相反"。触发价落在与类型不符的一侧 = 违反方向要求 → **入场校验层面被挡**，而非"接受后冻结"。FX100 那笔"空头 Stop 触发价设在现价上方"，按 HL 规则会在下单时被拦。
3. **执行/滑点模型不同（解释 HL 为何不出现 "Frozen"）**：HL Stop **Market** 触发后按市价成交、受滑点上限约束（默认 8%、TP/SL 市价 10%），不冻结；Stop **Limit** 触发后挂一张限价单，若行情跳空穿过则**静置未成交、仓位保留**（用户显式设的限价），也不是错误态。FX100（GMX-v2 模型）把 `triggerPrice` 与 `acceptablePrice=触发×(1∓滑点)` 绑定，不可满足即 `OrderFrozen`——这是本缺陷"冻结"表象的**模型根源**。

**映射到本单修复**：FX100 有两条自洽路径——(A) 保留"推断类型"模型，则**编辑必须复用表单的推断**（=B1）；或 (B) 采 HL "**显式类型 + 触发方向硬校验、错侧即拦截**"模型（=B2 的强化版）。二者择一即可根除症状 B；B3（冻结可见化）无论走哪条都应做。

> 来源：Hyperliquid Docs — Order types / TP-SL（gitbook）。文档未逐字说明"违反方向时的具体 UI"与"编辑既有单"的交互，方向硬校验为据其明文"needs to be higher/lower than mid price"推得。

## 待复测

- 多头镜像：多头下方=Buy-Stop/StopIncrease+"≤"、上方=Buy-Limit/LimitIncrease+"≥"，表单/编辑两路径是否同样表现（表单对、编辑跨越是否同样不重派）。
- 症状 A（列表 Type 列把 StopIncrease 显示为 "Limit"）：正例中 LimitIncrease 也显示 "Limit"，故列表**无法区分** LimitIncrease 与 StopIncrease（20:03 的 StopIncrease 与 20:21 的 LimitIncrease 列表 Type 同为 "Limit"）——症状 A 复现确认。

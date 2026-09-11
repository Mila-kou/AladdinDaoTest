# Round 3 小结 · 2026-08-29（空头镜像链路 + 触发式入场单链上取证）

> 承接 Round 1/2。本轮把**前两轮都没走的空头镜像链路**走通，并对**触发式入场单（Limit/Stop 开仓）**做了参数级链上取证，产出 1 张 S2 缺陷（STOPTYPE-016）。逐笔见 OPERATION-LOG LOG-052~071。

## 一、范围与总结论

- **空头镜像链路补齐**：开空 → 升杠杆加仓 → 持仓行 TP/SL 方向校验 → 挂哨兵 TP/SL → 50% 部分平 → Max 全平 → 全平自动清 TP/SL；每步与多头逐项镜像一致，资金零缺口（LOG-060~067）。
- **触发式入场单链路（本轮新增，之前只测过市价单）**：Limit/Stop 开仓的类型派生、操作符、acceptablePrice、编辑、冻结、取消全链上取证（LOG-068~071）。
- **S7 出单参数断言矩阵基本闭合**：7 种 orderType 均已链上核过（见下表）。
- 缺陷：新增 **BUG-FE-STOPTYPE-016（S2）**；缺陷单总数 13→**16**（含本轮前段 015-PRICEFREEZE）。

## 二、空头镜像链路（关键数值均过）

- **50% 部分平**（LOG-066）：保杠杆、按比例退保证金；Max acceptable=成交价×(1+0.5%)（空头平=买回取上限，与多头镜像）；Net=Margin−PnL−平仓费 逐位吻合。
- **Max 全平 + 自动清**（LOG-067）：TP/SL "全平剩余"模式自动 resize 跟随仓位（**TPSLSIZE-012 的正例边界**：固定 USD 额才不跟随）；全平即 AUTO_CANCEL——**链上 2×OrderCancelled(reason=AUTO_CANCEL)、key 正是 TP `0x3cecb6e9`/SL `0x4f952967`**，铁证。
- **空头 TP/SL 哨兵**（LOG-064）：TP=LimitDecrease(3)/SL=StopLossDecrease(4)、**acceptablePrice=MaxUint256**（空头平仓哨兵，与多头平仓=0 镜像）。

## 三、触发式入场单 + BUG-FE-STOPTYPE-016（S2）

**缺陷两症状（同根：Open Orders/编辑路径未处理 StopIncrease）**：
- **症状 A**：**Open Orders 挂单页**把 StopIncrease 错标为 "Limit"；而 **Orders History 标注正确**（"Stop Market"/"Limit"，与链上 orderType **4/4 吻合**）→ app 有映射、仅挂单页没用。修复=挂单页复用 Orders History 逻辑（近零产品决策，"Stop Market" 文案已存在、与 HL 同词）。
- **症状 B**：**编辑触发价跨越现价时不重派 orderType/操作符**。把空头 Stop 触发从 2410(下方)改到 2470(上方)，链上仍是 StopIncrease(6)+"≤"，立即触发但成交价(2435.57)低于 acceptable 底价(2457.65) → **OrderFrozen**（`OrderNotFulfillableAtAcceptablePrice(2435.57,2457.65)`）。前端全程只显平静 Pending、冻结后无原因。

**决定性隔离——三单同页对照 + 表单正例**：

| 页面时间 | 触发显示 | vs现价 | 链上 orderType | 状态 | 路径 |
|---|---|---|---|---|---|
| 20:03:46 | Oracle ≤ 2410 | 下方 | 6 StopIncrease | Pending→(编辑) | 表单 ✓ |
| 20:08:30 | Oracle ≤ 2470 | 上方 | 6 StopIncrease(编辑留存) | **Frozen** | 编辑 ✗ |
| 20:21:50 | Oracle ≥ 2480 | 上方 | 1 LimitIncrease | Pending | 表单 ✓ |
| 21:30:46 | Oracle ≥ 2490 | 上方 | 1 LimitIncrease | Pending | 表单 ✓ |
| 21:31:16 | Oracle ≤ 2400 | 下方 | 6 StopIncrease | Pending | 表单 ✓ |

→ **表单两向派生全对**（上方=Limit(1)/≥/"Place Limit"，下方=Stop(6)/≤/"Place Stop"，Trade Details 有解释文案）；**缺陷确定只在编辑路径与 Open Orders 显示**。

**修复建议（含确认级别，详见缺陷单）**：
- **B1【缺陷直修】** 编辑触发价时复用表单已验证的派生逻辑（跨现价重算 orderType + 操作符）——根因修复。
- **B2【缺陷直修】** 无法自动重派时提交前校验 + 禁用按钮（复用持仓行 TP/SL 已有的"方向非法→disabled"能力）。
- **B3【缺陷直修】** 冻结态可见化：不再 Pending 静默跳 Frozen，显示原因 + 编辑/取消引导。
- **A1【缺陷直修】** Open Orders 复用 Orders History 已有的类型显示（"Stop Market"/"Limit"，与链上 4/4 吻合），近零产品决策。
- **需产品确认仅一处**：B1 跨市价语义翻转采「静默自动转」（与表单一致）还是「提示后转」。

**Hyperliquid 对标（industry precedent，支撑修复选型）**：
1. 订单类型**显式命名**（Stop Market/Stop Limit/Take Market/Take Limit/Limit…），非从"触发价 vs 现价"推断 → 编辑触发价不会悄悄翻转语义；
2. **触发方向硬校验**（文档明文"空头 Stop 触发价须低于中间价"等）→ 错侧配置在下单校验层被拦，而非"接受后冻结"（正对标 B2）；
3. 执行模型不同：HL Stop-Market 触发按市价成交（滑点上限、不冻结）、Stop-Limit 触发后挂限价单（跳空则静置不成交、仓位保留）；FX100（GMX-v2）把 trigger 与 acceptablePrice 绑死 → 不可满足即 OrderFrozen（本缺陷"冻结"表象的模型根源）。
- **映射**：FX100 两条自洽修复路线——(A) 保留"推断类型"模型则**编辑必须复用表单派生**（=B1）；(B) 采 HL "显式类型 + 触发方向硬校验"（=B2 强化）。二者择一即可根除症状 B。来源：Hyperliquid Docs（order types / TP-SL）。

## 四、核对口径新知（本轮增补，纠正 Round 2 一处）

- **acceptablePrice 规律（纠正 Round 2）**：**增仓触发单（Market/Limit/StopIncrease）的 acceptablePrice = 参考价×(1∓0.5% 滑点) 的真实边界**（空头开=卖出下界）；**哨兵(0/MaxUint256) 只用于平仓侧 TP/SL（LimitDecrease/StopLossDecrease）**。依据 v0.3.1 `src/order/Order.sol` 注释。（Round 2 记的"触发单恒哨兵"仅对平仓侧成立）。
- **orderType 枚举全验**（`src/order/Order.sol`）：0 MarketIncrease / 1 LimitIncrease / 2 MarketDecrease / 3 LimitDecrease / 4 StopLossDecrease / 5 Liquidation / 6 StopIncrease——本轮 0/1/2/6 均见到并链上核对，连同前轮 3/4，7 类齐。
- **触发单 Token Size = $Size ÷ 触发价**（在触发价处折算，非现价）。
- **冻结单可 USER_INITIATED_CANCEL 手动清除**（非永久卡死）；`OrderFrozen` reason 走 reasonBytes（错误选择器+双价参），非 string。
- **Orders History Type 列忠实链上 orderType**（可作前端类型显示的正确参照）。

## 五、链上取证资产

- 脚本：会话 scratchpad `forensics-stop.mjs`（只读 EventEmitter `0x8f00…b380` 的 OrderCreated/Updated/Frozen/Cancelled，账户 owner+sub，RPC sepolia.base.org）→ `stop-orders.json`（本轮全事件解码）。
- 枚举权威：`Github/fx100-contracts@release-v0.3.1/src/order/Order.sol`；冻结错误 `FxErrors.sol:252` + `BaseOrderUtils.sol:228/266`。

## 六、收轮时页面状态（⚠️ 交下轮/提醒执行人）

- **Positions(2) 仍开**：ETH Short + ETH Long；截图显示**至少一仓保护已过期（"You are exposed to liquidation"）**——裸奔可被清算，非测试意图的话建议 Close & Reopen 或平掉。
- **Open Orders(2) 挂单**：2490 LimitIncrease(Pending)、2400 StopIncrease(Pending)，均空头开仓触发单。

## 七、下一轮待办（更新）

- ~~空头镜像链路~~ ✅ 本轮完成。
- **STOPTYPE-016 修复复测**（B1/B3 优先）；**多头镜像触发单**（下方=Buy-Stop、上方=Buy-Limit，验表单/编辑同规律）。
- 仍挂：A 段 010-014、B 段表单、TRADE-CASES 正式执行、007/012/013/MKTURL-002 复测、保护窗内达清算门槛主动平仓定性。
- 可选：把 015-PRICEFREEZE、016-STOPTYPE、017-TPSLREF 同步 Notion 🐛 Bugs 库（前 13 张已同步）。

## 八、2026-08-30 续测新发现：BUG-FE-TPSLREF-017（S2，reduce-only 平仓 TP/SL 参考价不一致）

（次日续测，非 Round 3 主体，先并档于此）reduce-only 平多 TP/SL 表单**按 "Market"(mark) 价派生 TP/SL 类型与操作符，协议却按 Oracle 价分类**，两价差 ~$1、触发价落其间时 **SL↔TP 静默翻转**：

- **实录**：点 "Place SL"、Oracle ≤ 2458.28（表单参考 Market 2458.29）→ 链上创建成 **Take Profit（LimitDecrease 3）/ Oracle ≥ 2458.28 / Close Long**（tx `0xa565224d…`，Oracle 当时 2457.23）。**想止损得到止盈、下行无保护**。
- **对照**：触发 2454（明显低于两价）→ 正确 Stop Loss（StopLossDecrease 4，tx `0xb4a0eb93…`）。
- **与 016 关系**：同族（前端"按触发价 vs 现价推断触发单类型"脆弱），根因不同（016=编辑不重派/挂单页显示；017=表单派生用错价源 Market≠Oracle）。修复建议一并处理"派生一律以 Oracle 为准 + 全路径复用同一派生"。
- **附带确认**：平多 TP/SL acceptablePrice=**0**（平多哨兵，与平空 MaxUint256 镜像）、autoCancel=true。reduce-only+Buy/Long 正确指向 Close Long（昨日方向疑问解答：方向本身没错）。
- 缺陷单：`bugs/v0.3.1/BUG-FE-TPSLREF-017-*.md`。⚠️ 隔夜空头消失（价涨破 liq ~2456，疑清算，待取证）。

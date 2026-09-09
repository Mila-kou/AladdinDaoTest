---
id: BUG-FE-TPSL-007
title: 开仓附带 TP 低于现价时校验报错未拦截提交，非法 TP 被静默转为第二笔 Stop Loss 订单
severity: S2
priority: P1
status: open
found: 2026-08-28
env: https://fx100-dev.vercel.app · Chrome 桌面 · Base Sepolia 84532 · 已连接（0xEEeA••••B119）· One-Click 模式
source-case: E2E-TRD-030/032/033（"不能静默改变订单语义/订单类型"）· 2026-08-28 smoke LOG-020
finder: 执行人（Mila）
notion: https://app.notion.com/p/3ca3d7873f2c81969fcdc63ebea9e5ea（🐛 Bugs 库，2026-08-28 提交，Open/FX100/High）
---

# BUG-FE-TPSL-007 · 非法 TP 未拦截且静默转为 SL

## 复现步骤（2026-08-28 17:33 实录）

1. SOL/USD 市价开多表单：$30,000 / 100x，展开 TP/SL 面板。
2. TP 输入 **106**（低于当时 oracle 106.25）——表单**已显示红字校验错误**："Take Profit price should be above oracle price"，TP 徽标显示负收益 −34.18%；SL 输入 105.5（低于清算价，黄条警告）。
3. 点击 Open Long 提交（Rabby/Flash 签名）。

## 期望结果

TP 方向非法时**阻止提交**（或强制修正后才可提交）；任何情况下不得改变用户指定的订单类型。

## 实际结果

- 提交**未被拦截**，"Order Submitted" 成功；
- 开仓执行（281.891 SOL @106.42 ✓ 正常），但附带订单生成为 **两笔 Stop Loss**（同戳 2026-08-28 17:33:42，均 Close Long $30,000、Reduce-Only、Pending）：
  - SL#1：Trigger **Oracle ≤ 106**（即用户输入的"TP 106"被静默转成了 SL 语义）
  - SL#2：Trigger Oracle ≤ 105.5（用户本来的 SL）
- 结果：用户意图的"止盈单"变成了一笔**会在下跌时亏损平仓**的止损单，且全程无任何"已转换类型"的提示——校验文案与提交行为自相矛盾。

## 影响

- 订单语义被静默改变（资金后果真实）：价格触及 106 时仓位将以约 −$120（价差）+费用的亏损被"止盈单"平掉，与用户意图相反；
- 双 SL 并存还引入未定义行为：一笔触发全平后另一笔的处置（AUTO_CANCEL 是否覆盖同类型双单）待观察；
- 违反 E2E-TRD-030/032 的设计期望："方向/价格不合理时明确说明会立即触发或阻止，**不能静默改变订单类型**"。

## 证据

- 提交前表单截图（红字错误 + TP 106/SL 105.5）；Open Orders 双 SL 行截图（同戳 17:33:42）；LOG-020 持仓与订单核对；链上 orderType 取证补充中（前端行显示 Trigger: Oracle ≤ 106 即 SL 语义）。

## 备注

TP badge 在非法方向下仍按公式计算并显示负值（−34.18%），说明前端已知该"TP"必然亏损——校验、显示与提交三层行为不一致，修复时建议统一：非法方向禁止提交。

## 复现记录 2（2026-08-28 21:34，SOL，复现 2/2）

- 表单 TP 105.1 / SL 105（oracle ~105.08），红字 "Take Profit price should be above oracle price" 显示中，**Open Long 按钮仍可点击**（执行人截图标注）；
- 提交后 Open Orders 出现**两笔同戳 21:34:06 的 Stop Loss**（$10,000：Trigger Oracle ≤ 105.1 与 ≤ 105）——"TP 105.1" 再次被静默转为 SL。缺陷确定性复现。
- 附带观察：TP 105.1 在截图时点略高于 oracle 105.08 仍报错——校验基准疑为预估成交价（~105.23）而非 oracle，与报错文案"above oracle price"口径不一致（输入时 oracle 亦可能更高，待定向复测：TP 设于 oracle 与预估成交价之间观察是否报错）。
- 复现 2 后续：该"TP 转 SL"订单于同日触发执行（105.03，SLACCEPT-009 修复后执行链路已通），另一笔真 SL 被 AUTO_CANCEL——类型转换缺陷本身仍在。

## 链上实锤（2026-08-28 21:34 复现 2 的参数级证据）

创建 tx `0xcb4844413ca82b962ec01d95d2d4cf7ba5d8e6e39a45df5d0d86d2fb1bff3377`（block 46077879）：用户输入的 "TP 105.1" 落链为 **orderType=4（StopLossDecrease）**（orderKey `0x8bb29a4d…514bf`；枚举依据 v0.3.1 合约 `src/order/Order.sol`）——订单类型在创建参数层即被改写，非显示问题。

## 复现记录 3（2026-08-28 22:01，镜像方向：非法 SL → TP）

- 表单 TP 105.7 / **SL 105.6（高于 oracle 105.28）**，红字 "Stop Loss price should be below oracle price" 显示中提交（$20,000/100x）；
- 结果：Open Orders 出现**两笔 Take Profit**（同戳 22:01:12，Oracle ≥ 105.6 与 ≥ 105.7）——"SL 105.6" 被静默转为 TP。
- **结论升级：转换规则 = 按触发价与现价相对位置归类（高于现价→TP/LimitDecrease，低于现价→SL/StopLossDecrease），完全无视用户选择的订单类型；TP→SL 与 SL→TP 双向均复现。**
- 后续：执行人将其中一笔 TP 编辑 105.6→104.5 成功（22:04:32，tx `0xc8e5…`）。

## 范围钉死：仅"开仓附带 TP/SL"路径缺陷，持仓行 TP/SL 弹窗正确（2026-08-29 双向证据）

对照测试证明 app 具备正确的方向校验能力，本缺陷是"开仓附带"路径独有的遗漏：

| 路径 | 方向非法时行为 | 判定 |
|---|---|---|
| **持仓行 TP/SL 弹窗**（Close/TP-SL 按钮打开） | 红字报错 + **Confirm 按钮 disabled**（JS 实测 disabled:true/not-allowed），不可提交 | ✅ 正确 |
| **开仓附带 TP/SL**（下单表单 TP/SL 面板） | 红字报错但**按钮可点、静默转订单类型** | ❌ 本缺陷 |

双向均验证：
- 多头（2026-08-28）：开仓附带 TP<现价 静默转 SL；
- 空头（2026-08-29 LOG-062）：持仓行 TP/SL 面板 TP 2440(>oracle)/SL 2410(<oracle) 双向非法 → 均红字 + **按钮禁用**（正确）。

结论：修复只需让"开仓附带"路径复用持仓弹窗已有的"方向非法→禁用提交"逻辑。

## 根因（fx100-apps@develop 源码定位，2026-08-31）

两条 TP/SL 路径是**两套独立代码**：下单表单附带（缺陷）走 `lib/orders/increaseOrderPayloads.ts::buildTpslSidecarPayloads`；持仓行弹窗（正确）走 `lib/orders/decreaseTpslPayloads.ts::buildExistingPositionTpslPayloads`。缺陷是两个独立前端缺陷叠加：

**根因① 报红字却不禁用提交（校验只在展示层，未接提交门禁）**
- 红字来源（**display-only**）：`lib/orders/tpsl.ts:206-210` `if (isLong && tp <= markPrice) tpWarning = takeProfitLong`（"Take Profit price should be above oracle price"）→ `useTpslSectionModel.ts:98` → `order-form/TpslSection.tsx:125 <WarningRow>` 渲染红字。该 `tpslModel` **只喂展示组件，不参与任何提交判定**。
- 提交门禁 `canSubmitOrderAtom`（`state/derived/order.ts:654-656`）= `orderFormValidationAtom.isValid`；后者（`505-651`）push 的 error **仅含** 余额/限价/市场禁用/费用/仓位大小类，**通篇无 TP/SL 方向校验**。
- 按钮 disabled（`hooks/trade/useOrderFormController.ts:2388-2439`）只连 `canSubmitOrderAtom`，`order-form/SubmitButton.tsx:26 disabled={model.disabled}` 无额外 TP/SL 判断 → **红字与按钮可用性完全解耦**。

**根因② 低于现价的 TP 静默转 StopLossDecrease(4)（orderType 按位置反推、非用户选择）**
- `increaseOrderPayloads.ts:192-208 getTakeProfitOrderType`：`isLong ? (triggerPrice > indexPrice ? LimitDecrease(3) : StopLossDecrease(4)) : …` → **做多 TP 只要 triggerPrice ≤ 参考价即落成 StopLossDecrease(4)**。用户选的 TP 字段仅决定"调哪个函数"，最终 type 由触发价 vs 参考价反推（调用处 `310-321`）。
- 参考价 = **index/市场价**（`useCreateOrder.ts:1478-1482 tpslReferencePrice = 市价单用 increaseAmounts.indexPrice`），**非协议执行用的 oracle 价** → 与文案 "above oracle price" 及协议判定基准系统性错位（呼应 BUG-017）。枚举 LimitDecrease=3/StopLossDecrease=4（`packages/sdk/src/types/orders.ts:15-17`），与链上取证 orderType=4 吻合。

**两条路径的决定性代码差异**：持仓弹窗 `PositionTPSLDialog.tsx:1298-1306` 的 Confirm `disabled` **显式含 `!!tpWarning || !!slWarning`**（方向非法即禁用、到不了归类函数）；下单表单按钮 disabled 只连 `canSubmitOrderAtom`（从不含 TP/SL 方向）→ 非法 TP 一路走到 `buildTpslSidecarPayloads` 被按位置归成 SL。两条路径的 `getTakeProfitOrderType` 逻辑相同，差别仅在"到达前有没有被按钮门禁挡住"。

**修复落点**：① 把 TP/SL 方向非法纳入下单表单提交门禁——在 `orderFormValidationAtom` 增一项 TP/SL 方向 error（`tpSlExpanded` 且方向非法时 push），或 `submitButtonModel.blocked` 叠加 `tpslModel.takeProfit.warning || stopLoss.warning`；② 根治：sidecar orderType 由用户所选 TP/SL 字段直接决定，不由 triggerPrice-vs-price 反推；派生基准价改用 oracle（与协议一致，见 017）。

## 修复要求（执行人 2026-08-28 明确）

**订单类型字段传值**：前端必须把用户选择的订单类型（TP=LimitDecrease / SL=StopLossDecrease）如实传入订单创建参数，不得按触发价与现价的相对位置自行归类改写；TP 方向非法时应禁止提交（按钮禁用），而非转换类型放行。

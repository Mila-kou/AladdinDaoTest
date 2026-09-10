# Relay 余额门与 Max 死区 —— 实测补充

> **本文不是口径来源。** 口径以 [`Standard-Relay-Flash-OneClick-(v0.3.2).md`](Standard-Relay-Flash-OneClick-(v0.3.2).md) §7.2 / §7.2.1 / §10 为准，用例以 [`Trade-测试用例矩阵.md`](Trade-测试用例矩阵.md) 的 **FT-RELAY-USDC-015 / 016**、**FT-RELAY-MAX-018 / 019**、**FT-RELAY-SWITCH-022** 为准。
>
> 那些文档明确自述「**这些 GAP 是静态代码对照结论，不是链上执行结果**」。本文补的正是缺的那一半：**在真实部署上跑出来的证据**，外加三条静态对照没覆盖到的观察。
>
> 专项三册（业务说明 / 原理篇 / 需求与分析）在 `Docs/v0.3.2/专项-Relay-①②③`；③ 的 RQ-RELAY-29 引用本文作为实测证据，① 场景 4 / 场景 7 用人话转述了本文 §二与 §五。

- **实测环境**：https://fx100-dev.vercel.app · Base Sepolia 84532 · **v0.3.1 部署（260729）** · 前端 `fx100-apps@develop`
- **注意**：实测跑在 v0.3.1 部署上，本文归入 v0.3.2 是因为口径与用例归属该版本；正式结果仍按 [`results.md`](results.md) 登记
- **日期**：2026-09-06 · 逐笔证据 `manual-runs/2026-08-28-基本功能smoke/OPERATION-LOG.md` LOG-087

---

## 一、实测证据（FT-RELAY-USDC-015 的活样本）

执行人账户 `0x7b692C57aaa687f777d78144C23cC0764fec1958`，四张截图：

| # | B (USDC) | Pay | B−Pay | 表现 |
|---|---|---|---|---|
| 1 | 1,000 | 998.50 | 1.50 | Max 正常 |
| 2 | 1.48 | 1.07（手输） | 0.41 | Insufficient USDC for Relay Fee |
| 3 | 1.48 | **0.97（手输 size 90）** | 0.51 | **真实开仓成交** |
| 4 | 0.50 | 0.97 | 负 | Insufficient balance |

- **与 §7.2.1 的预言逐位吻合**：该节写「`B=1,000`、`C=0.5` 时 Max 为 `998.5`；`B=1.48`、`C=0.5` 时 `S=0.98≤1`，Max 为 0」——**两个数值都由实测复现**。
- 图 3 补充了静态对照给不出的一条：**同一 1.48 U 余额下手输可真实成交**（`Pay 0.97 ≤ B−C = 0.98`），即死区里存在合法可开仓额度而 Max 给 0。对应 FT-RELAY-USDC-015 期望列「0 结果显示明确原因」的用户可感知损害。
- **链上余额续测**：该账户当前 USDC **0.501605**（block 46429374），距 `C` 下限 0.5 仅 **0.0016 U**；ETH 0.00996。

---

## 二、三条静态代码对照未覆盖的观察

### ① 死区态不是「不提示」，是**显示了一条误导性的中性文案**

§10 GAP 记为「不置灰、不清旧值、不提示」。实际链路更具体：空输入经 `state/derived/order.ts:386-388 → :547` 产出 **`INVALID_PAY_AMOUNT`**，按钮渲染 `trade.enterAmountPrompt` = **「Enter Amount / 请输入金额」**（`useOrderFormController.ts:288`、`en.ts:374`）。

> 用户读到的是「我还没输金额」，真相是「我输不了金额」。**建议把 FT-RELAY-USDC-015 的 UI 断言写成「不得出现与真实原因无关的中性提示」，而不仅是「应有提示」——否则实现方补一条 `Enter Amount` 就能形式上满足。**

提示行确实为空：`validationErrorHint` 白名单（`:2401-2432`）不含该码 → `:2432 return null` → `SubmitButton.tsx:55` 整块不渲染。

### ② 切到 Standard 后，**解释性 UI 一并消失**（反馈倒退）

§7.2 的产品处理是「提示用户改走 Standard」。但开仓表单里 `SwitchToStandardAction` 与 relay 文案都挂在 `shouldUseFlash &&` 之下：

- 出口渲染条件 `OrderForm.tsx:797-806`
- 按钮文案 `useOrderFormController.ts:2362-2363`

于是用户**按产品指引切过去之后**，原本可见的「Insufficient USDC for Relay Fee」与出口按钮同时消失；而 `applyMaxUsdcReserve`（`useOrderFormController.ts:1645/:1689`）无模式分支，Standard 下仍减 `U`（此点 §10 已作 P1 作用域 GAP 登记），死区变成 `0 < B ≤ 1.0` 依然存在。

> 净效果：**Max 失败从「Flash 下至少有解释」退化为「Standard 下完全静默」**。实测 `B=0.5016` 与推算 `B=0.8` 在两种模式下 Max 均填不出数字。
> 建议并入 **FT-RELAY-SWITCH-022** 的断言：切换后若 Max 重算仍为 0，反馈不得比切换前更少。

### ③ 移动端开仓面板**完全没有出口**

`components/features/trade/mobile/MobileOrderPanel.tsx` 对 `SwitchToStandardAction` / `RelayFeeRow` / `insufficientUsdcRelayFee` **零命中**，但 `:204` 有 `handleSizePercent(100)` 的 Max、`:470` 复用同一 `submitButtonModel`。

> 即便进入「显式不足」态，移动端只显示按钮文案、**拿不到任何切换入口**。§10 的移动端 GAP 只覆盖 1CT setup modal，未覆盖此项。建议 FT-RELAY-USDC-015/016 的「桌面/移动」维度对出口按钮单独留证。

---

## 三、Standard 这条路的成本与现实性

| 项 | 值 | 出处 |
|---|---|---|
| 执行费 gas | `600,000 + 250,000×3 + 3,900,000 ≈ 5,250,000` | SDK `fees/executionFee.ts:25-41` |
| → 折 ETH | 0.01 gwei ≈ **0.0000525** · 0.1 gwei ≈ 0.000525 · 1 gwei ≈ 0.00525 | 同上 |
| 客户端兜底下限 | `MIN_EXECUTION_FEE = 0.00004 ETH` | `lib/orders/executionFee.ts:21` |
| Base Sepolia USD 下限 | 无（`undefined`） | SDK `configs/chains.ts:72` |
| 额外链上交易 | **一次性 ERC20 approve**（Flash 走 permit 不需要） | `useCreateOrder.ts:1428` → `lib/orders/allowance.ts:43-57` |

> **模式定位冲突（供风控/产品参考）**：默认模式是 `'1ct'`，而 `lib/relay/README.md:7` 明写 *"The user spends **no ETH**"* —— **ETH=0 是 Flash 的默认人群**，而出口按钮的渲染条件完全不校验 `nativeBalance`（`RelayFeeRow.tsx:28-31` 切换只写偏好、零预检），Standard 侧的 ETH 门在 `state/derived/order.ts:631,643-646`。
> 实测账户持 0.00996 ETH，gas 层面走得通；ETH=0 的用户则被推到另一条走不通的路。

---

## 四、测试账户余额准备

| 目的 | USDC | ETH |
|---|---|---|
| 跑 Flash 且要用 Max | `> C+U`；C 浮动，保守 ≥ 5，**建议 ≥ 20**（免受 cap 波动干扰） | 0 |
| 跑 Standard | `> U`（要用 Max） | **≥ 0.001**（约 20 笔 @0.01 gwei，含一次 approve） |
| 复现 Max 死区（FT-RELAY-USDC-015） | Flash **1.48 / 1.50 / 1.500001**；Standard **≤ 1.0**，如 0.8 | — |
| 复现 signed-cap 门（FT-RELAY-USDC-016） | `< C`，如 **0.3** | — |

---

## 五、三种「卡住」的现场判别法

| | ① relay 费不足 | ② Max 死区 | ③ keeper 跳单 |
|---|---|---|---|
| 发生时机 | 提交**前** | 点 Max 时 | 提交**后** |
| 链上有无 tx | 无 | 无 | **有 `OrderCreated`** |
| 页面表现 | Insufficient USDC for Relay Fee ＋ 出口按钮 | 输入框无反应，按钮「Enter Amount」 | 订单一直「已创建」 |
| 判别动作 | 看 `B < C`？ | 看 B 是否落在 `(C, C+U]`（Standard：`(0, U]`） | 扫 EventEmitter 有无 `OrderExecuted` |
| 归属 | 设计如此（§7.2） | §10 P0 GAP · FT-RELAY-USDC-015 | **BUG-021**（keeper 服务端） |
| 自救 | 充值至 ≥ C | 手输金额，或充值至 `> C+U` | 手动 Cancel 撤单退款后重发 |

> 前两种**压根没发交易**，第三种发了但没人执行 —— 「链上有没有 `OrderCreated`」是硬分界，别把 keeper 问题误报成余额问题。

---

## 六、关联

- 缺陷单 `bugs/v0.3.1/BUG-FE-MAXRESERVE-025-*.md`（v0.3.1 部署上的实测记录；核心症状已由本版 §10 P0 GAP 登记，该单只作实测证据与上述三条补充的载体）
- `bugs/v0.3.1/BUG-FE-PCTBASE-026-*.md`（开仓表单 25/50/75 走裸余额，**未专项复现**；注意与 FT-RELAY-MAX-018 中 Deposit 侧「25/50/75% 按未扣额外 U 的 depositMaxRaw 计算」是不同场景）
- `FT-RELAY-011`（cap 下限修复的端到端复测，用例已写未执行）
- Notion `Relay InsufficientRelayFee` 缺陷：代码级已修（`71963561`，2026-09-03，cap 下限 0.01→0.5、倍数 1.5x→3.0x）

> 维护：口径变化改上游权威文档，不改本文；本文只承载实测证据与执行侧观察。

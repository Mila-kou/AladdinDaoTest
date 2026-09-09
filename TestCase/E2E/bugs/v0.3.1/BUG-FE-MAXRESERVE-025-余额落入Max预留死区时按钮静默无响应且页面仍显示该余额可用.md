---
id: BUG-FE-MAXRESERVE-025
title: 余额落入 Max 预留死区时点 Max 静默无响应（不填值/不报错/不置灰），而页面同时显示该余额"可用"、手输同一区间可正常成交
severity: S2
priority: P1
status: open
found: 2026-09-06
env: https://fx100-dev.vercel.app · Base Sepolia 84532 · v0.3.1 部署(260729) · 前端 fx100-apps@develop
source-case: web 端人工冒烟续测（执行人 Mila 实操发现）
finder: 执行人现象 + 记录员源码定位 + 9-agent 对抗性核验工作流
account: 0x7b692C57aaa687f777d78144C23cC0764fec1958
related: BUG-FE-PCTBASE-026（同排百分比按钮三把尺）
---

# BUG-FE-MAXRESERVE-025 · Max 死区静默失效

## 一、结论先行

| 主张 | 判定 |
|---|---|
| Max 在 relay cap 之上再留 1.0 USDC **过严** | **❌ 撤回** —— 经项目经理确认为**需求**（留钱确保还能 cancel），非缺陷 |
| 落入死区时 Max **静默无响应** | **✅ 成立，本单主项（S2）** —— 需求说要留 1 U，没说要一声不吭 |
| 该死区总额在 relay 修复后**被动扩大且无人复核** | **✅ 成立** —— 见 §四时间线，属回归副作用，需产品复核而非直接判缺陷 |
| 产品兜底路线「USDC 不足 → 走 Standard」可解此场景 | **❌ 不成立** —— 见 §六，路线在开仓表单里三处断裂：出口条件覆盖不到死区、切过去死区仍在、切过去反而更静默 |
| 本单是「新发现」 | **❌ 否（2026-09-06 更正）** —— 核心症状已由 `versions/v0.3.2/Standard-Relay-Flash-OneClick-(v0.3.2).md` §10 登记为 **P0 GAP**，验收用例 **FT-RELAY-USDC-015** 已在矩阵登记（测试数据列即含 `1.48/1.50/1.500001U`）。本单降为**实测证据载体**，见 §十二 |

## 二、现象

执行人四张截图（账户 `0x7b69…1958`）：

| # | 余额 | Pay | 余额−Pay | 表现 |
|---|---|---|---|---|
| 1 | 1,000 | 998.50 | 1.50 | Max 正常 |
| 2 | 1.48 | 1.07（手输） | 0.41 | ❌ Insufficient USDC for Relay Fee |
| 3 | 1.48 | **0.97（手输 size 90）** | 0.51 | ✅ **真实开仓成交** |
| 4 | 0.50 | 0.97 | 负 | Insufficient balance |

**核心矛盾**：同一余额 1.48 USDC —— 点 Max，输入框毫无反应、无提示、按钮不置灰、页面上方仍写着「可用 1.48」；改手输 size 90，正常成交。

## 三、口径（参数化表述，勿写死快照值）

设 `B` = 钱包 USDC 余额，`R` = **当次动态** relay cap（Flash 下有 0.5 U 下限、上限 25 U，随 gas/oracle 浮动；Standard 下恒 0）：

```
提交侧可开仓上界 = B − R                       // order.ts:499-503 spendablePayTokenBalanceAtom
                                              // 校验条件行 order.ts:537-541 / :549
Max 输出         = max(0, (B − R) − 1.0)       // useOrderFormController.ts:1645 / :1689
                                              //   → feeEstimate.ts:40-43 applyMaxUsdcReserve
静默死区         = 0 < (B − R) ≤ 1.0
```

- **Flash**（R 取下限 0.5）→ 死区 `0.5 < B ≤ 1.5`；实测 B=1.48 落入，手输 0.97 ≤ B−R=0.98 成交 ✅
- **Standard**（R=0，`feeEstimate.ts:29-35` `!shouldUseFlash` 短路 return 0n）→ 死区 `0 < B ≤ 1.0`

> ⚠️ **表述纪律（对抗性核验要求）**：
> ① 不要把「1000 − 0.5 − 1.0 = 998.50 逐位吻合」当主证据——单一 cap = 1.5 U 可给出同一数字，**该算术不判别**，只作旁证；
> ② 不要写「合法上界 0.98」「死区 B ≤ 1.5」这类快照值——`R` 是动态量，须按上式参数化，否则开发可用「数字对不上」驳回。

## 四、根因与时间线（git 溯源）

```
e8f5145e  2026-08-10  feat: MaxUsdcReserve 1U          ← 引入 1.0 预留（commit 无正文、未改任何文档）
                                                          当时 MIN_FEE_USDC = 10_000n（0.01 U）
                                                          → 死区约 1.01 U
71963561  2026-09-03  fix: harden Flash relay fee caps ← cap 下限 0.01 → 0.5、倍数 1.5x → 3.0x
                                                          feeEstimate.ts 改 414 行
                                                          对 MAX_USDC_RESERVE_AMOUNT 增删：0 处
                                                          → 死区被动扩大到 ~1.5 U
```

两次改动相隔 **24 天**、彼此独立。**死区从 ~1.01 扩到 ~1.5 不是组合设计，是 relay 修复未连带复核 Max 预留总额的副作用。**（该 relay 修复本身正确，见 FT-RELAY-011。）

静默的直接来源——两条 Max 路径算出 `0n` 后**裸 return**：

```ts
// useOrderFormController.ts:1643-1647   Pay / gross-up 模式
const availableBalance = percent === 100
  ? applyMaxUsdcReserve(spendablePayTokenBalance)
  : payTokenBalance;
if (!payToken || availableBalance === 0n) return;          // ← 无 setState / 无错误码 / 无 toast

// useOrderFormController.ts:1687-1697   Size 模式
if (!payToken || !orderMarketInfo?.indexToken ||
    availableBalance <= 0n || effectiveLeverageBps <= 0n) {
  return;                                                   // ← 同上
}
```

**⚠️ 修正一处早前表述**：死区态并非「零错误码」。空输入会经 `order.ts:386-388` → `:547` 产出 **`INVALID_PAY_AMOUNT`**，按钮显示 `trade.enterAmountPrompt` = **「Enter Amount / 请输入金额」**（`useOrderFormController.ts:288`、`en.ts:374`）。这比沉默更糟——它告诉用户「你还没输金额」，而真相是「你输不了金额」。提示行仍为空：`validationErrorHint` 白名单十四个分支不含 `INVALID_PAY_AMOUNT`，直落 `:2432 return null`，`SubmitButton.tsx:55` 的 `{model.hint && (` 整块不渲染。

加重误导的三处：
1. **页面显示的是裸余额**——`useOrderFormController.ts:1569-1578` `formattedBalance` 用 `payTokenBalance`（未扣 R、未扣 1.0），所以 UI 明说「可用 1.48」；
2. **按钮无任何禁用态**——三处触发入口均无 `disabled` / `title` / `tooltip`；
3. **对照组刺眼**——同一表单的 `INSUFFICIENT_BALANCE` / `INSUFFICIENT_RELAY_FEE` 有按钮文案 + 提示行 + SwitchToStandard 三处可见反馈，Max 路径一处都没复用。

**行为已被测试反向固化**（修复时须同步改）：
```ts
// lib/relay/feeEstimate.test.ts:23-28
expect(applyMaxUsdcReserve(1_000_000n)).toBe(0n);
expect(applyMaxUsdcReserve(500_000n)).toBe(0n);
```

## 五、原「需产品裁定两点」——已由 v0.3.2 需求文档回答（2026-09-06 更正）

本节原提出两个问题，现已在 `versions/v0.3.2/Standard-Relay-Flash-OneClick-(v0.3.2).md` 找到答案，**不再需要产品裁定**：

| 原问题 | 答案 | 出处 |
|---|---|---|
| 死区总额 `C+U` 是否仍是想要的？ | **是，为唯一口径**：「v0.3.2 Relay/1CT Max 的唯一口径是：先预留本次 signed `maxFeeAmount`，再额外预留 1 USDC」；§7.2.1 给出精确函数 `MaxBudget = B > C+U ? B−C−U : 0`，并注明「C 命中下限时 Max 要得到正数必须 `B > 1.5 USDC`」 | §7.2 / §7.2.1 |
| Standard 下这 1.0 有无用途？ | **已登记为 P1 作用域 GAP**：「Max 的 `B−C−U` 主公式已确认，但固定 `1_000_000 raw` **仍泄漏到 Standard**……解除条件：将 reserve 收口到 Relay family + 当前 6 位 USDC pay/feeToken」 | §10 |

→ **§七 的 E4 据此撤回**（不需要我提方案，上游已有解除条件与验收用例 FT-RELAY-USDC-015 / FT-RELAY-MAX-018）。

## 六、逃生路线「USDC 不足 → 走 Standard」端到端核验：**不闭合**

> 需求②（执行人 2026-09-06 转达）：「如果 USDC 不足的时候，要走 Standard 模式。」
> 5-agent 工作流核验（runId `wf_6a9ec725-a97`），复核者独立重读代码验证三处承重结论。结论：**这条路线在开仓表单里断成三截。**

**入口确实存在于开仓表单**（此前"只在持仓弹窗"的猜测不成立）：`OrderForm.tsx:804` 渲染 `SwitchToStandardAction`。但其条件（`OrderForm.tsx:797-806`）的三个门在死区态**全部为假**：

```ts
{shouldUseFlash &&                                        // 门①：切到 Standard 后即为假
  (isReduceOnly
    ? reduceOnlyRelayFee.blockReason === 'insufficient'
    : increaseRelayFeeBlockReason === 'insufficient' ||   // 门②：开仓路恒等价于 B < R
      validation.errors.includes('INSUFFICIENT_RELAY_FEE')) && (   // 门③：空输入不可达
      <SwitchToStandardAction />
```

- **门② 恒退化为 `B < R`**：开仓路调 `useFlashRelayFee` 时**没传 `collateralUsdc`**（`useRelayFeeEstimate.ts:47-62`），取默认 `collateralUsdc = 0n`（`useFlashRelayFee.ts:86`）→ `:310` 喂进 gate → `feeEstimate.ts:122` `balance < collateralAmount + maxFeeAmount` 退化成 `B < R`。而死区定义是 `B > R`，故恒不触发。
- **门③ 不可达**：`INSUFFICIENT_RELAY_FEE` 只由 `addBalanceError`（`order.ts:522-528`）产出，被 `order.ts:549` `if (payAmount > 0n && payAmount > spendableBalance)` 守住；Max 裸 return 没写输入框 → `payAmount === 0n` → 不进。size 分支同理被 `order.ts:539` 守住。

### 三处断点

| # | 断点 | 依据 |
|---|---|---|
| **A** | **切过去死区照样在**——`applyMaxUsdcReserve` 两个 Max 调用点**无任何 `shouldUseFlash` 包裹**（`:1640-1786` 区间对 `shouldUseFlash` 零命中），Standard 下 R=0、死区变成 `0 < B ≤ 1.0`，**缩小但未消失** | `useOrderFormController.ts:1645/:1689`；`feeEstimate.ts:40-43` 函数签名无模式参数 |
| **B** | **切过去反而更静默**——Flash 下至少 `B < R` 时有「Insufficient USDC for Relay Fee」+ 出口按钮；切 Standard 后这两处都被 `shouldUseFlash &&` 门住，**一并消失**，Max 失败从"有解释"退化为"完全静默" | `OrderForm.tsx:798`；`useOrderFormController.ts:2362-2363` |
| **C** | **Standard 需要 ETH,而 Flash 的卖点正是"不用 ETH"**——默认模式即 `'1ct'`（`state/ui/flash.ts:20-24`），`lib/relay/README.md:7` 明写 *"The user spends no ETH"*。出口按钮的渲染条件**完全不校验 `nativeBalance`**，可能把用户从一条死路推到另一条 | `RelayFeeRow.tsx:28-31` 切换动作只写偏好、零预检；`order.ts:631,643-646` Standard 的 ETH 门 |

**数值走查（复核者独立验证）**：

| 账户余额 B | Flash 点 Max | 切 Standard 后点 Max |
|---|---|---|
| **0.5016 U**（本单实测账户） | 填不出数字 | **仍填不出数字**（`501_600 > 1_000_000` 为假 → `0n`），且解释性 UI 全消失 |
| 0.8 U | 填不出数字，纯静默（gate 不亮：`0.8 < 0.5` 为假） | **仍填不出数字** |

**Standard 的 ETH 成本量级**（供评估断点 C）：执行费 = gasLimit × gasPrice，Base Sepolia 实参 `600000 + 250000×3 + 3900000 = 5,250,000 gas` → 0.01 gwei 时 ≈ **0.0000525 ETH**、1 gwei 时 ≈ 0.00525 ETH；客户端兜底下限 `MIN_EXECUTION_FEE = 0.00004 ETH`（`lib/orders/executionFee.ts:21`）。另需**一次性链上 ERC20 approve**（Flash 走 permit 签名不需要）：`useCreateOrder.ts:1387` 的 `if (shouldUseFlash)` 为假时走 `:1428 ensureRouterAllowance` → `lib/orders/allowance.ts:43-57`。
→ 本单实测账户持 0.00996 ETH，**gas 层面走得通**（约可支撑上百笔）；但对 ETH=0 的 Flash 默认人群，断点 C 是硬墙。

**没有任何自动回落**：全仓 `setFlashMode(` 仅三处（`FlashSettings.tsx:121` / `RelayFeeRow.tsx:29` / `FlashStatusChip.tsx:47`），全为用户手动；四份 locale 里 `switchToStandard` 只是按钮 label，**无一句文案把「USDC 不足」与「可以走 Standard」在语义上连起来**。

**同一张表单的刺眼不对称**：B=0.8 在 Flash 下点 **75%** → 填 0.6 → `0.6 > spendable 0.3` → `INSUFFICIENT_RELAY_FEE` → 按钮文案 + 提示行 + 出口按钮**全都出现**；点 **Max** → 什么都没有。（→ BUG-026）

**被测试固化**：`feeEstimate.test.ts:25-27` 断言 `applyMaxUsdcReserve(500_000n) === 0n`；`RelayFeeRow.test.tsx:37` 用例名 *"offers Standard mode only when USDC is explicitly insufficient"* —— 死区被判定为「不算显式不足」。修复须同步改这两处。

## 七、期望

须同时满足两条已确认需求：① Max 需为钱包保留足够 USDC，保证用户之后仍能发起 cancel；② USDC 不足以支付 Flash 中继费时，产品期望用户改走 Standard。

**E1｜Max 算出非正数时必须给出可见反馈，不得裸 return**
依据 `useOrderFormController.ts:1647`（`availableBalance === 0n`）与 `:1691-1698`（Size，`<= 0n`）。对照基准：同表单 25/50/75 走 `:1646`/`:1690` 的 `: payTokenBalance`，超额时经 `order.ts:549 → :522-528` 产出完整反馈。Max 必须与之对齐。

**E2｜新增专属错误码/提示，语义为「余额被预留额吃尽」，取代中性的 Enter Amount**
现状落到 `INVALID_PAY_AMOUNT`（`order.ts:547`）→ `useOrderFormController.ts:288` → `en.ts:374 'Enter Amount'`；提示行白名单（`:2401-2432`）不含该码，直落 `return null`，`SubmitButton.tsx:55` 整块不渲染。期望文案须同时说明**差多少**与**怎么办**，例如：「余额 0.80 USDC；Flash 需预留 0.50 中继费 + 1.00 操作保留额。请充值至 ≥1.50 USDC，或切换到 Standard 模式。」

**E3｜出口按钮必须覆盖 Max 死区，不能只覆盖「显式不足」**
新增判定「Flash 下 `B ≤ R + MAX_USDC_RESERVE_AMOUNT`」时同样渲染出口，或改用 reserve 后的 spendable 作为门槛输入。同步修正 `RelayFeeRow.test.tsx:37` 固化的旧边界。

**E4｜~~切到 Standard 后 1 USDC 预留须按模式重新判定~~ · 已撤回** —— 该项已是 v0.3.2 §10 的 P1 作用域 GAP，解除条件与验收用例（FT-RELAY-USDC-015 / FT-RELAY-MAX-018）均已登记，无须本单另提方案。以下原文留档：
需求①的前提是 cancel 消耗 USDC；Standard 下 cancel 走普通链上交易、以 ETH 付 gas（`useCancelOrder.ts:106` 为假 → `:165-171` `walletClient.sendTransaction`），该保留额失去依据。二选一（需产品裁决并落文档）：(a) `applyMaxUsdcReserve` 仅在 `shouldUseFlash` 为真时生效；(b) 保留额按模式取值（Flash=1.0，Standard=0），并在 `feeEstimate.ts:8` 注释写明依据。**验收**：B=0.8 的账户切 Standard 后点 Max 必须填出 0.8。

**E5｜出口按钮出现前须校验 ETH 可行性**
渲染条件（`OrderForm.tsx:797-802`、`RelayFeeRow.tsx:91`）完全不看 `nativeBalance`，切换动作（`RelayFeeRow.tsx:28-31`）零预检，而 Standard 有 ETH 硬门（`order.ts:631,643-646`）。ETH 不足时该按钮应不可用并附说明，或改为引导充值 ETH——不得把用户从一条死路推到另一条。

**E6｜Standard 下须保留等效原因说明，反馈不得倒退**
`OrderForm.tsx:798` 的 `shouldUseFlash &&` 使切换后原有文案与出口一并消失（按钮文案同被 `:2362-2363` 门住）。Standard 下 Max 失败须给出属于 Standard 语境的说明。

**E7｜页面须显示「可用于开仓的余额」，而非裸钱包余额**
`formattedBalance` 基于 `payTokenBalance`（`:1569-1581`），渲染于 `OrderForm.tsx:302-303` 与 `MobileOrderPanel.tsx:209`；而 `spendablePayTokenBalanceAtom` 与 `MAX_USDC_RESERVE_AMOUNT` 的消费方**全在 state/hook/lib 层，无任何 component 引用**。至少以 tooltip 或副标题展示 R 与 1 U 预留的扣减明细。

**E8｜移动端开仓面板须与 web 端等效** ⚠️ 交移动端会话留意
`MobileOrderPanel.tsx:204` 有 `handleSizePercent(100)` 的 Max，但整份文件对 `SwitchToStandardAction` / `RelayFeeRow` / `insufficientUsdcRelayFee` **零命中**——即使进入「显式不足」态，移动端也只有按钮文案、**拿不到任何出口**。E1~E7 须在移动端同步落地。

**E9｜Max 内部状态不得在守卫之前置位**
`:1642` `openMaxModeRef.current = percent === 100 ? inputMode : null` 写在 `:1647` 守卫**之前** → 「Max 已选中但输入框保持旧值」；随后 `:1774-1786` 的 effect 在余额变动时重放 `handleAmountPercent(100)`，仍静默。用户可能把上一次手输的**陈旧金额**误认为 Max 值直接提交。置位应移到守卫之后，或在 Max 失败时清空/标记输入框。

### 验收用例（建议补入用例矩阵）

| # | 模式 | B (USDC) | R | 期望 |
|---|---|---|---|---|
| V1 | Flash | 0.8 | 0.5 | Max 不填数时必须显示原因 + 出口按钮（现状：全静默） |
| V2 | Flash | 0.5016 | 0.5 | 同上（现状：全静默） |
| V3 | Standard | 0.8 | 0 | 按 E4 裁决，Max 填出 0.8 |
| V4 | Standard | 0.5016 | 0 | Max 填出 0.5016 |
| V5 | Flash→点出口切 Standard，钱包 ETH=0 | 0.8 | 0.5 | 出口按钮不可用或附 ETH 不足说明（现状：可点，切完更静默） |
| V6 | 移动端 Flash | 0.8 | 0.5 | 与 V1 表现一致 |

## 八、影响面与逃生口（据实记录，不夸大）

- 影响区间窄（Flash `0.5 < B ≤ 1.5`、Standard `0 < B ≤ 1.0`），但**恰是水龙头/新用户账户的首单区间**，且是**首次**交互——第一印象损失不能按金额算；
- **不造成永久资金损失**：手输可绕过 Max；已开仓位仍可平——六个后续动作弹窗（Close/Cancel/Update/TPSL/Leverage/Margin）均引用 `RelayFeeRow`，其 `:96` 在 relay fee **显式不足**时渲染 `SwitchToStandardAction`，Standard 平仓走原生代币付费（`orderTransactions.ts:419-428`），USDC 分文不花。
  ⚠️ **但该出口不覆盖本单场景**：出口只在 `blockReason === 'insufficient'`（即 `B < R`）时出现，而死区是 `B > R`；且切过去后 Max 死区仍在（§六 断点 A）、解释性 UI 反而消失（断点 B）。**平仓有出口，开仓没有。**
- **定 S2 而非 S3 的理由**：100% 必现；页面同时显示该余额「可用」、按钮却说「Enter Amount」——**不是无信息，是错误信息**；产品指定的兜底路线（走 Standard）在开仓表单里三处断裂（§六），用户按指引操作后处境更差；且会挡住小额账户的冒烟路径。修复成本仍低（E1/E2/E3 三条即可解除主要危害）。

## 九、驳回的一条推翻意见（存档）

对抗性核验中，「用户损害」视角的法官以 `MIN_POSITION_SIZE_USD = $10` + `DEFAULT_LEVERAGE = 2` 推断「死区内用户本来就开不了仓（0.98 × 2 = $1.96 < $10）」，据此主张撤单。**该前提与实测相反**：执行人截图 3 在 B=1.48 时手输 size **90**（Pay 0.97 ⇒ 杠杆 ≈93x）**真实成交**。高杠杆下死区完全可达，故该推翻意见不成立。

## 十、项目经理反馈（2026-09-06，经执行人转达）

> 「relay 0.5 门槛这个是没问题的，因为链上真实有可能要达到 0.5 USDC，最终不确定会用多少，高一些能确保可以 cancel 掉。」
> 「max 保留 1 U 留钱确保还能 cancel，对的这个也是要计算在内的。是需求内容。」
> 「**如果 USDC 不足的时候，要走 Standard 模式。**」（2026-09-06 追加）

据此 **D2（预留过严）撤回**。

> ⚠️ **2026-09-06 更正**：我此前写的「该 1.0 无书面依据」**是错的，会误导**。依据确实存在，只是不在前端仓库里，而在本工作区的版本需求文档 `versions/v0.3.2/Standard-Relay-Flash-OneClick-(v0.3.2).md` §7.2 / §7.2.1 —— 那里把 `B−C−U` 定为唯一口径并给出精确函数与边界表。**准确表述应为**：该常量在 **fx100-apps 仓库内**无 why 注释（`feeEstimate.ts:8` 只讲 what；README / docs / CHANGELOG / commit body 皆无，而同文件 `MIN_MAX_FEE_USDC` 有 17 行论证 + `docs/flash-mode.md:400` 记载）——这是**仓库内文档缺失**，不是**需求缺失**。

另留档一条： `feeEstimate.ts:243` 的 *"See the README."* 是悬空指针——`lib/relay/README.md` 全文 112 行及其全部 5 个历史版本对 reserve/balance/gate 零命中。建议顺手补文档。

## 十一、证据

- 执行人截图 ×4；链上实测余额 `0.501605 USDC`（block 46429374，脚本 `scratchpad/usdc-bal.mjs`，USDC `0xbf4D9B318689AB928DB9eE4Cdc840c065575Eb89`）——该账户现距 Flash 门槛（≥R）仅 0.0016 U；
- 源码：`lib/relay/feeEstimate.ts:8-9,29-38,40-43,122,239-245`、`state/derived/order.ts:499-503,537-541,549,627-647`、`hooks/trade/useOrderFormController.ts:1569-1578,1643-1647,1687-1697`、`components/features/trade/_position/PositionMarginDialog.tsx:301-306,324`、`lib/relay/feeEstimate.test.ts:23-28`；
- git：`e8f5145e`(2026-08-10) / `71963561`(2026-09-03)；
- 核验工作流：9 agents（6 取证角度 + 3 对抗法官），runId `wf_78021aed-c57`；
- 路线闭合核验：5 agents（4 探查角度 + 1 独立复核），runId `wf_6a9ec725-a97`；
- 台账：`manual-runs/2026-08-28-基本功能smoke/OPERATION-LOG.md` LOG-087。

## 十二、与 v0.3.2 登记项的关系（2026-09-06 更正后定位）

**本单不是新发现。** 核心症状早已登记：

| 上游登记 | 内容 |
|---|---|
| §10 GAP **P0** | 「`B≤C+U` 时 Order Pay/Size Max handler 直接 return，不置灰、不清旧值、不提示 → cap floor=0.5U 时形成最小 1.5U 的确定性无响应区」 |
| §10 GAP **P1** | 「固定 `1_000_000 raw` 仍泄漏到 Standard → Standard 少报可用额」 |
| 矩阵 **FT-RELAY-USDC-015 / P0** | 测试数据列含 **`1.48/1.50/1.500001U（C=0.5U）`**；期望列写明「当前 0 时 handler 直接 return、不清旧值、不置灰、不提示，执行 UI 断言应暴露并登记 GAP；Standard 当前仍减 U，作为作用域 GAP 留证」 |
| 矩阵 **FT-RELAY-USDC-016 / P0** | 手输金额的 signed-cap 准入边界与「切 Standard 后再确认」 |

**本单保留的价值**（上游明确自述「这些 GAP 是**静态代码对照结论，不是链上执行结果**」）：

1. **真实部署上的实测证据** —— 四张截图 + 链上余额，复现了 §7.2.1 预言的 `B=1,000→998.50` 与 `B=1.48→0` 两个数值，并补上静态对照给不出的一条：同一 1.48 U 下**手输 0.97 真实成交**；
2. **三条静态对照未覆盖的观察** —— 死区态显示误导性的「Enter Amount」而非无提示；切 Standard 后解释性 UI 一并消失（反馈倒退）；`MobileOrderPanel` 完全没有出口。

详见 `versions/v0.3.2/Relay余额门与Max死区-实测补充-(v0.3.2).md`。

**流程教训**：本单前两轮（9-agent + 5-agent 核验）在**未查 `versions/v0.3.2/` 需求文档与用例矩阵**的情况下从源码反推口径，重复了上游已有结论。立缺陷前应先查该版本的需求文档与矩阵。

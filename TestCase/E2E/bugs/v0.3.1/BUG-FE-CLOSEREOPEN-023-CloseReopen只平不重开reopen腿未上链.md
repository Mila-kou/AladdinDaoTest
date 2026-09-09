---
id: BUG-FE-CLOSEREOPEN-023
title: 保护期到期后 Close & Reopen 必然只平不重开：重开单被前端自身的输入校验静默拦掉，从未提交上链，用户全程无任何提示（仓位被平、丢失新保护）
severity: S2
priority: P1
status: open
found: 2026-08-31
env: https://fx100-dev.vercel.app · Base Sepolia 84532 · v0.3.1 · 桌面 · One-Click/Flash（子账户中继）
source-case: 免清算保护到期 · Close & Reopen 入口 · 2026-08-31 LOG-084（链上取证 sol-reopen.json）
finder: 执行人（Mila）
recurrence: 2026-09-06 第二次复现（同账户 0xEEeA…B119，**BNB/USD 空头**）——见文末「第二次复现」段
notion: https://app.notion.com/p/3d23d7873f2c8111b7fcd4d6c2d06670（🐞 Bugs「清算保护期到期后 Close & Reopen 只平不重开…」High/Open/V0.1.1，2026-09-06 立单，指派 Gordon）
root-cause: 2026-09-06 **源码定位（经链上时间戳复核后已更正）**：roll overrides 传未截断的 18 位小数 size 串，被前端精度门 `hasExcessAmountFraction`（BNB 仅允许 4 位）确定性拒绝 → `return null`，订单从未上链且无任何提示。回归引入点 commit `c7276332`。**初判的 180s TTL 已排除**（当天三笔订单 create→execute 均仅隔 5 个区块）——见文末「根因（源码定位）」段
---

# BUG-FE-CLOSEREOPEN-023 · Close & Reopen 只平不重开

## 现象（2026-08-31 实录）

账户 `0xEEeA…B119` 的 **SOL/USD 多头**（Position size ~$9,956、75x、**保护已到期 exposed**、PnL −32.48%）点击 **"Close & Reopen"**：

- **close 腿成功**：`MarketDecrease`（isLong=true，SOL / marketIndex 5，$10,000 全平）创建 **11:01:30**（tx `0x39ea8dc0ff019ead`，经子账户中继 IncrementSubaccountActionCount）→ **执行成功 11:03:34**（PositionDecrease + OrderExecuted，tx `0x8fa07e3a3c8b2ad3`）；
- **reopen 腿从未上链**：close 执行后扫描至 block **46188953（约 13 分钟）**，**无任何 `MarketIncrease`（reopen）被创建**。整取证窗口（block 46183000→46188953）该账户仅 3 笔 OrderCreated：08:02 ETH 清算(mkt2 ot5) / 09:49:16 SOL 开仓(mkt5 ot0 MarketIncrease) / 11:01:30 SOL 平仓(mkt5 ot2 MarketDecrease)——**close 之后零新增**。
- **结果**：SOL 仓位被平掉、**未重开** → 用户变空仓，丢失原仓位与本想刷新的 15 分钟免清算保护。

## 期望

"Close & Reopen" 应在 close 执行后**自动创建并执行 reopen**（同向、同 size 重开），刷新保护；若 reopen 无法提交，须**明确提示并保留可重开入口**，不得静默"只平不重开"。

## 影响

- 用户意图 = "平旧仓 + 重开刷新保护"，实际**只平不重开** → 仓位意外归零；若未察觉则脱离市场、错失后续 P&L；
- close 本身正常成交（抵押/PnL 按正常平仓返还，无直接资损），但**核心功能只做一半、静默失败** → 定 S2/P1。

## 根因推断（前端）

"Close & Reopen" 疑为"先提交 close → 等 close 执行 → 再提交 reopen"的两腿时序流程。close 从创建到执行耗时 **~2 分钟**（11:01:30→11:03:34，keeper 队列），前端"等 close 执行再发 reopen"的环节可能**超时 / 中断 / 未触发** → reopen 的 MarketIncrease 从未提交上链。链上证据：整窗口仅 09:49 一笔 MarketIncrease（原始开仓），close 后无新增，即 reopen **连订单都没创建**（非 keeper 未执行）。

## 证据

链上取证脚本 `scratchpad/forensics-stop.mjs` → `sol-reopen.json`（block 46183000→46188953）。close：tx `0x39ea8dc0ff019ead`（MarketDecrease 创建 11:01:30）+ tx `0x8fa07e3a3c8b2ad3`（PositionDecrease 执行 11:03:34）。close 后 390 块（~13min）无 reopen MarketIncrease。

## 待复测

- ~~复现稳定性 / 量化 close 执行时长与 reopen 是否触发的相关性~~ → **2026-09-06 已由源码给出定量答案**：阈值是「从点击 Roll 起算 180 秒」，见下。
- 对照同屏 **"Roll to renew"** 入口是否也有此问题（单腿刷新 vs 两腿平重开）。
- 移动端是否同样复现（若该截图为移动端/其他会话，标注平台）。

---

## 第二次复现（2026-09-06，BNB/USD 空头 · 已取证）

同账户 `0xEEeA…B119`，**BNB/USD 空头（market #23）**，环境为 **Base Sepolia 官方测试网（chainId 84532，非 fork）**。现象与 2026-08-31 的 SOL 多头完全一致 → 非个例、非市场相关、**多空皆可复现**。

### 链上实录（UTC，公共 RPC 取证）

| 时间 | 事件 | 结果 |
|---|---|---|
| 15:49:50 | `MarketIncrease` 开空 **$100,000** / 抵押 1,075.00 USDC | 已执行（tx `0xfbb88998…c315313`） |
| 15:50:32 | `MarketDecrease` 部分平 $31,669（开仓后 42s） | 已执行 |
| **16:04:50** | **graceEnd**（开仓 +900s，保护期结束） | — |
| 16:07:26 | `MarketDecrease` 平掉剩余 $68,331 / 退回 936.86 USDC | 已执行（创建 `0xd88cd682…7e2d6e99`，执行 `0xdc691af3…104b108e5`） |
| 之后 | — | **零 `MarketIncrease`** |

两笔平仓合计 $31,669 + $68,331 = **$100,000**，恰为开仓全额；market #23 多空两侧当前 `SIZE_IN_USD` 均为 0。

### 判定

close 之后**完全没有** `orderType=0`(`MarketIncrease`) 的 `OrderCreated` → 按取证脚本判读规则属 **A 类：open 腿从未创建**。三类链上原因均被排除：不是 keeper 跳过成僵尸单、不是 `OrderCancelled`、不是 `OrderFrozen`。**订单根本没提交到链上**，与 2026-08-31 SOL 那次结论相同 → 坐实根因为下文的前端 TTL 丢弃。

### 取证工具与产物

- 脚本 `TestCode/tmp-session/bnb-reopen-forensics.sh`（环境无关，RPC 与地址作参数传入，不硬编码）：
  ```bash
  RPC='<公共或私有 RPC>' ./TestCode/tmp-session/bnb-reopen-forensics.sh \
    --account 0xEEeA43701a49F3d41EF694DdAFe2Ac74c7c8B119 --market 23
  ```
- 本次产物：`fx100-forensics-0xEEeA4370-20260906-003449/`（`report.txt` + 原始日志 + 解码事件）。

### 顺带发现（另案）

同账户在 **SUI/USDC（market #10）** 有 **3 张挂了 32~38 小时的 `MarketIncrease`**（`updatedAt` 1788485714 / 1788486882 / 1788506968），`isFrozen=false` 且无任何终态事件，每张锁 207.50 USDC，**合计 622.50 USDC 锁在 OrderVault**。这是 keeper 过期跳过（只 skip 不 cancel）造成的 D 类僵尸单，需用户手动 `cancelOrder` 取回。建议单独立单跟进。

### Notion

已按本次现象立单（High / Open / V0.1.1 / 指派 Gordon）：<https://app.notion.com/p/3d23d7873f2c8111b7fcd4d6c2d06670>

## 根因（源码定位，2026-09-06 · 含一次自我更正）

> ⚠️ **更正记录**：本段初版把根因写成「180s TTL 超时丢弃」，经链上时间戳复核**已推翻**（当天三笔订单 create→execute 均只隔 5 个区块 ≈10 秒，打不穿 180s）。真实根因是下方的 **size 小数位精度门**。TTL 常量仍是独立隐患（注释「lands within seconds」与实测 58~124s 冲突），但不是本单成因。

前端基线 `fx100-apps@develop` head `1912f460`。

### 真实根因：roll overrides 传未截断的 18 位小数 size，被精度门确定性拒绝

reopen 的 open 腿**在提交前就被前端自己的输入校验拒了**，根本没走到发交易那一步。

| 锚点 | 内容 |
|---|---|
| `packages/sdk/src/utils/positionPrecision.ts:6-10` | `getPositionSizeDecimals` **恒返回 18**（忽略入参；因 `sizeInTokens` 在合约里对所有 token 都按 18 位存） |
| `usePositionsController.ts:222-225` | roll 快照 `sizeAmountInput = formatUnits(sizeInTokens, getPositionSizeDecimals(...))` → 产出 18 位小数串（本次实测 `'163.299965707007201528'`） |
| `useOrderFormController.ts:943-950` | 表单预填**做了** `truncateAmountFraction(...)` 截断 |
| `useOrderFormController.ts:1021-1032` | 但构造 overrides 时传的是 `request.sizeAmountInput`（**未截断原串**），而 `submitOrder` 校验的正是 overrides 快照、不是表单 |
| `useCreateOrder.ts:407-412` | `allowedDecimals = getTokenAmountDecimalsForToken(indexToken)`；`hasExcessAmountFraction(...)` → 18 > 4 → **`return null`** |
| `packages/sdk/src/utils/numbers.ts:820-825` | BNB ≈ $612 落在 `>=50` 档 → 允许 **4** 位 |
| `lib/amountInput.ts:13-19` | 判据是纯按小数点后字符数比，与数值大小无关 |
| `useCreateOrder.ts:1159-1166` | 返回 `{success:false, error:'Order inputs are invalid'}`，且**不置 submissionState error** |
| `useOrderFormController.ts:1067-1077` | roll 收尾清 request、关 toast、释放锁，**不调 `maybeToastSubmissionFailure`**（手动下单路径 `:2158`/`:2235` 调了）→ 零提示 |

**为什么是确定性必现、而非偶发**：`formatUnits(sizeInTokens, 18)` 只有在 size 恰为 `1e14` 整数倍时小数位才 ≤4，实际几乎不可能。**凡 `allowedDecimals < 18` 的市场皆然**，与 keeper 快慢、网络状况无关——这解释了为什么两次复现都是静默失败。

**回归引入点**：`c7276332`（2026-07-28 `feat: decimals`）加了这道精度门，同 commit 只给表单回填补了截断，**漏了 overrides 路径**；roll 本体是 `646b914f`（2026-06-11），早 6 周。

### 附：原先误判的 TTL 机制（保留备查，非本单成因）

**机制**：`Close & Reopen` 不是原子操作，而是两段——close 先上链，**open 腿只是一个存在浏览器内存里的待办**（`protectionRollReopenRequestAtom`，`state/base/protection.ts:106`，普通 Jotai `atom`，**无 `atomWithStorage` 持久化**），等 close 上链确认后才提交。这个待办**有 180 秒有效期，过期静默丢弃**。

| 锚点 | 内容 |
|---|---|
| `useOrderFormController.ts:223` | `const ROLL_REQUEST_TTL_SEC = 180;` |
| `useOrderFormController.ts:993-1002` | `if (ageSec > ROLL_REQUEST_TTL_SEC) { console.warn('[OrderForm] Roll reopen request expired, dropping', …); setRollReopenRequest(null); finishProtectionRoll(); return; }` |
| `state/ui/protection.ts:29-31` | `finishProtectionRoll` 只做 `set(isProtectionRollInFlightAtom, false)` —— **无任何用户可见提示** |
| `useOrderFormController.ts:1004` | `if (!positionsInfoData) return;` |
| `useOrderFormController.ts:1006-1008` | `closeCompleted = !originalPosition \|\| originalPosition.sizeInUsd <= 0n` |
| `useOrderFormController.ts:1010` | `if (!executionPriceConfig[String(request.marketIndex)]) return;` |

**四条都导致「裸平仓」的路径**（任一在 180s 内没走完即丢弃）：

1. keeper 执行 close 超过 180s；
2. `executionPriceConfig` 未在窗口内加载完；
3. `positionsInfoData` 未就绪（轮询滞后）；
4. 用户刷新页面 / 关标签 / 切走 —— atom 纯内存，**必丢**。

**关键矛盾**：`:218-222` 的注释写 *"Keeper execution normally lands within seconds"*，而本工作区实测 **keeper 正常延迟就是 58~124 秒**（另有已知的二值跳过更久）。2026-08-31 那次 close 从创建到执行耗时 **124 秒**（11:01:30→11:03:34），仅剩 56 秒要走完 positions 轮询刷新 + execPriceConfig 拉取 + 提交——**余量极薄，正常波动即失败**。

代码自身也承认这个失败模式：`:1005-1012` 注释原文说缺了 execPriceConfig 会让 acceptable price 不带点差、keeper 拒单，*"turning the roll into a naked close"* —— 开发者知道会变成裸平仓，选择用 TTL 兜底，但**兜底方式是静默放弃**。

**排除的假设**（子代理独立核查，三重否定）：open 腿不会被 `clearAutoCancelOrders` 顺手取消——(a) `OrderUtils.sol:364-367` 白名单只登记 `LimitDecrease`/`StopLossDecrease`，`MarketIncrease` 第一行早退；(b) `BaseOrderUtils.sol:281-287` `getPositionKey` 对非 decrease 单直接 revert `UnsupportedOrderType`；(c) 时序上 open 腿在 close 确认之后才创建，close 执行时它还不存在。

**另一条同症状但已被证据排除的假设**：open 腿被创建后撞上链上 `REQUEST_EXPIRATION_TIME=120s` 成为无事件僵尸单（`IncreaseOrderUtils.sol:73-82` revert `OracleTimestampsAreLargerThanRequestExpirationTime`，经 `BaseHandler.sol:41-50` 判为 keeper 错误 → 不 cancel 不 freeze）。2026-08-31 的取证显示 close 后 390 块（~13 分钟）**零 `MarketIncrease` 创建**，故本单确定是「前端从未提交」而非「提交后成僵尸」。**区分方法**：查 close 之后有没有 `orderType=0` 的 `OrderCreated` —— 有则是僵尸单路径，无则是本单。

## 建议修复方向（供工程师判断）

1. **直接修（最小改动，对症）**：`useOrderFormController.ts:1021-1032` 构造 overrides 时，对 `sizeAmountInput` 施加与 `:943-950` 相同的 `truncateAmountFraction`，使两条路径口径一致。
2. **更稳妥**：让 size 的精度校验使用「仓位 size 精度（18）」而非「市场展示精度」——展示精度用于 UI，不该充当提交校验的合法性门槛。
3. **失败路径必须可见**：`useCreateOrder.ts` 内多处 return（`:1064/1069/1132/1161/1177/1281`）既不置 `submissionState` error、roll 收尾也不调 `maybeToastSubmissionFailure`。任一失败都应给用户提示并保留「立即重开」入口。
4. 建议同时评估**两腿原子化**（批量交易，参考 `submitFlashBatchOrder.ts`），可一并消除中间态丢失类风险；若维持两段式，至少要：
   - 待办**持久化**（`atomWithStorage` 或服务端待办），刷新/切页不丢；
   - TTL 按**实测 keeper 延迟**重定（当前 180s 的假设「lands within seconds」与实测 58~124s 不符），或改成等待 close 的链上确认事件而非墙钟计时；
   - 过期/失败**必须给用户可见提示**并保留"立即重开"入口，不得只 `console.warn`。
3. 无论选哪条，都应补一条覆盖「close 已执行但 open 未提交」的自动化用例——当前该分支零测试覆盖。

---

## 第三次复现（2026-09-06 20:54，真实 Base Sepolia）：**新的失败模式——重开腿被「余额不足」挡住**

环境：真实 Base Sepolia（84532）· 前端本地 :3110 @ `25853155` · 账户 `0x109e1e82…28fc` · SOL/USD 空头。

### 现象

保护期到期后点 Close & Reopen：**close 腿正常执行、仓位被平**；重开腿**表单已正确预填**（93.8495 SOL / 46.05x），但**提交按钮置灰、提示「余额不足 · 超过最大可用余额」**，订单从未提交。

与前两次的区别：这次**不是**前端校验静默拒单（`0716cb2b` 的精度修复确实生效了——预填值 93.8495 是截断后的合法值），而是**钱不够**。

### 根因：平仓实收 < 重开所需（结构性，非偶发）

用页面数值逐项对账：

| 项 | 金额（USDC） |
|---|---|
| 平仓前抵押 | 217.89 |
| − 已实现亏损 | 23.09 |
| − 平仓手续费 | 7.44 |
| **= 平仓后可用余额** | **187.36** ≈ 页面显示 187.80 ✓ |
| 重开保证金（$10,035.06 ÷ 46.05x） | 217.92 |
| + 开仓手续费 | 7.46 |
| **= 预计支付** | **225.38** ← 页面显示 ✓ |
| **缺口** | **37.58** = 已实现亏损 + 两笔手续费 |

**结论：只要仓位有浮亏，roll 必然卡在「余额不足」**——因为它按**原规模、原杠杆**重开，而用户在平仓时刚刚实现了亏损、还付了两笔手续费。亏损越大缺口越大；即使完全不亏，两笔手续费也会造成小缺口。

这与本单 2026-09-06 首次分析里列为 MEDIUM 的假设 #3（「override 二次校验被余额/抵押门拦下」）是同一机制，当时因被精度门遮蔽而走不到；精度门修好后，它成为**下一道必然命中的门**。

### 关键：失败提示到位了，但方向仍需产品裁决

`0716cb2b` 新增的三条提示（`rollReopenDropped` 等）在这个场景**没有出现**——因为提交根本没发起，走的是表单自身的「余额不足」置灰。用户能看到原因（比之前的静默失败好），但：

- 页面同时显示「您正暴露于强平风险。重新开仓以恢复保护。」，**却给不出可执行路径**——用户被告知要重开，又被拦住不让重开；
- 仓位已经被平掉，**保护期没续上，敞口也没了**，用户实际处于「既没仓位、也没保护」的状态。

### 建议修复方向（供工程师/产品判断）

1. **提交前预检**：点 Close & Reopen 之前就用「预计平仓实收 vs 重开所需」做可行性判断，不足时**不要执行 close 腿**，直接提示用户（可给出差额与补充金额）。这是最重要的一条——现在是先把仓位平掉、再告诉用户开不回来。
2. **按实收资金缩放重开规模**：若产品接受，重开时按平仓实收反推可开规模（同杠杆、较小名义），而不是硬套原规模。
3. 若维持现状，至少把「您正暴露于强平风险，重新开仓以恢复保护」这句在余额不足时改写，避免指向一个走不通的动作。

### 待确认（本次未取证完）

用户报告「一次 Close & Reopen 下了 2 笔 close」。链上 market #5 在该时段确有多笔 `MarketDecrease`，但取证输出被截断，尚未逐笔比对确认是否为**同一次操作产生的重复平仓单**（也可能是当前订单/订单历史两个页签看到同一笔）。**下次复现时需重点核对**：同一次点击后，`OrderCreated(orderType=2)` 是否出现两条。

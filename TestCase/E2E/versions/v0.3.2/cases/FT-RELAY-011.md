# FT-RELAY-011 · 代付费授权上限（maxFeeAmount）端到端复测

> 缺陷回归：Notion「生产环境 Relay 取消/修改订单报 InsufficientRelayFee（maxFeeAmount 下限被误砍到 0.01 USDC）」（`3cc3d7873f2c81e69b5de12fbcc2d8a0`，High/Review）。
> 矩阵登记：`Trade-测试用例矩阵.md` C 节 `FT-RELAY-011 / P0`。结果回填 `../results.md`。
> 层：前端层（页面）。**执行前置于 `CURRENT.primary.admissionScope["tx-fork:frontend"]` 准入；环境未准入时记 `BLOCKED`，前端/schema 能力未实现时记 `GAP`。** 本用例的页面主路径是 Flash One-Click/1CT；direct Relay/Gasless 不是公开 UI 模式，只能作为 API/CT/XT 对照，不得伪装成 FT 入口。

## 0. 缺陷背景（决定用例怎么设计）

前端 `feeEstimate.ts` 曾把**为"显示金额"设计的下限** `MIN_FEE_USDC = 10_000n`（0.01 USDC）**同时套用到 `maxFeeAmount`**（链上 EIP-712 签名授权上限）。cancel/update 本身 gas 小、余量薄，最先撞到这个地板：生产实测 `InsufficientRelayFee(14208, 10946)` —— 实需 0.0142 USDC，授权仅 0.0109 USDC，整笔 revert。

修复（commit `71963561`，2026-09-03）拆成三个常量并对齐链上公式：

| 常量 | 值 | 作用域 |
|---|---|---|
| `MIN_DISPLAY_FEE_USDC` | 10_000n（0.01 USDC） | **仅** 页面显示 |
| `MIN_MAX_FEE_USDC` | **500_000n（0.5 USDC）** | **仅** 签名授权上限 |
| `MAX_MAX_FEE_USDC` | 25_000_000n（25 USDC） | 授权上限的硬顶 |

**本用例要验的就是这三条边界在页面端真实成立**，而不是只看代码。

## 1. 前置条件

1. 环境、chainId、Router 与部署版本全部从 `Docs/contract-releases/CURRENT.json` 及其 manifest 读取；`fx100-dev` / Base Sepolia 只是缺陷原报环境，不是本轮固定基线。
2. **前端部署版本必须包含 commit `71963561`（2026-09-03）**——否则测的是旧代码，结果无效。执行前先确认部署版本（页面 `dpl-` 部署 ID 或发布记录），并把版本写进实际结果。
3. Flash One-Click/1CT 已完成 v0.3.2 `slot` 类型、EIP-712、ABI 与后端准入；账户**未**做过当前版本子账户授权（全新用户场景）。schema/功能未补齐时前端层记 `GAP`；功能已备但环境/服务不可用时记 `BLOCKED`；不能用旧 schema 继续执行。
4. 每轮从链上读取 `RELAY_FEE_BASE_GAS_LIMIT`、`RELAY_FEE_MULTIPLIER_FACTOR`、Oracle 价格与各 cap；历史缺陷参数仅作对照，不写成本轮常量。

## 2. 测试数据 —— 新用户需要准备什么

### 2.1 钱包与网络

| 项 | 要求 | 说明 |
|---|---|---|
| EOA | **全新地址**，从未在 fx100 建过子账户 | 覆盖"首次授权 + 首单"路径 |
| 网络 | CURRENT 登记的前端测试网络 | 运行时记录 chainId，不复用历史环境假设 |
| 原生 Gas Token | Relay/1CT 路径的用户钱包**不需要**（Relayer 代发交易）；若做 Standard 对照组则需少量 | Permit 是签名，不单独消耗链上 gas |
| USDC | 见 2.2 三档 | 从页面 **Faucet** 领取 |

### 2.2 USDC 余额三档（本用例的核心数据设计）

余额门不是永久固定的 0.5 USDC，而是**当次 fresh quote 计算后写入签名的 `maxFeeAmount`**。0.5 USDC 只是当计算值更低时的 signed-cap floor。据此动态分三档：

| 档 | USDC 余额 | 覆盖目的 |
|---|---|---|
| **D1 正常** | **≥ 30 USDC**（两张约 10 USDC 抵押的订单） | 主路径：创建两笔独立限价单，订单 A Cancel、订单 B Update 各自成功 |
| **D2 边界** | **恰好等于当次 computed `maxFeeAmount`** | 验证余额门的等号侧，成功后再确认签名写入同值；只有 computed cap 命中 floor 时才是 0.50 USDC |
| **D3 不足** | **当次 computed `maxFeeAmount` 减 1 个 feeToken 原始单位** | 验证越界一个最小单位时提交前拦截；此档预期不会产生动作签名；0.30 USDC 只可作为命中 0.5 floor 时的可选样本 |

> **D2/D3 构造顺序**：必须先在 D1 余额下建好挂单，每次动作先采 fresh quote 并记录将写入签名的 computed cap，再把余额调到“等于 cap”或“cap−1 raw unit”。若变更余额后报价过期，必须重新采样，不得用旧 cap 判新 gate。

### 2.3 待取消/更新的两笔独立限价单

| 项 | 取值 | 理由 |
|---|---|---|
| 市场/方向 | CURRENT 中任一可交易市场的 `long` | 不绑定 PUMP/BTC 等历史名称；symbol、token 与 decimals 运行时读取 |
| 类型 | 限价单 A 和 B（Buy-Limit） | A 用于 Cancel，B 用于 Update；取消后的 A 不可再 Edit |
| 触发价 | **现价 × 0.90**（下方 10%） | 保证长时间不成交、稳定处于 pending |
| 规模 | size ≈ $100 / 10x（抵押 ≈ $10） | 小额即可；注意**建单即托管抵押** |

### 2.4 每个动作的余额不等式

不得把“未来多次动作的 actual fee”和“当次 signed cap”同时叠加成一个门槛。每个动作独立判定：

- 创建前：`B0 ≥ initialCollateral + M_create`。
- 创建后：`B1 = B0 − initialCollateral − F_create`，其中 `F_create` 是实扣，不是 `M_create`。
- 取消前：`B1 ≥ M_cancel`。取消交易中的抵押退回不能预先抵扣前端提交门。
- 更新前：`B1 ≥ M_update`；如需 execution-fee top-up，按当次 payload 单独记录。

`M_*` 是当次 computed/signed `maxFeeAmount`，`F_*` 是链上实际 `RelayFeePaid.feeAmount`。D1 取 30 USDC 只是便于同时准备两张单的测试数据，不是产品公式。

## 3. 操作步骤

### 主路径（D1，P0）
1. 新 EOA 连接钱包，切到 CURRENT 登记网络，通过该环境支持的方式准备 **30 USDC**。
2. 切到 **Flash One-Click/1CT**，完成 consent、session key 生成和 `SubaccountApproval`；记录两个主钱包签名。授权签名本身不是一笔独立链上 tx。
3. 选择 CURRENT 可用市场并创建远价 **Buy-Limit A**。记录页面 `Relay fee (est.)`，从捕获的 session EIP-712 payload 读取 `maxFeeAmount`，并确认首个 Relay task/tx 携带该 approval；1CT 稳态不会为动作签名弹主钱包。
4. 用同类数据再创建挂单 B，确认 A/B 均进入 Open Orders；后续 A 只做 Cancel，B 只做 Update。
5. 对订单 A 点 **Cancel**，从 Relay 请求/typed data **记录本次 `maxFeeAmount`**（这是缺陷的关键字段）；另记动作 signer、`tx.from` 和 `tx.to`，不要期待 1CT 出现主钱包签名弹窗。
6. 确认提交结果：成功 / 失败弹窗原文。
7. 链上查该 cancel tx 的 `RelayFeePaid`，记录**实际扣费 feeAmount**；记录 USDC 余额差分。
8. 对仍为 Open 的订单 B 重复 5–7，改用 **Update**（update 与 cancel 同属薄余量动作）。

### 边界档（D2，P0）
9. 对已有挂单采集 Cancel 的 fresh quote，将余额精确调整为本次 computed `maxFeeAmount`，立即提交，并确认最终签名内的值相同。若 computed cap 命中 0.5 floor，此时才可记录为 0.50 USDC。

### 不足档（D3，P0）
10. 在独立 snapshot 采集同动作 fresh quote，将余额调整为 computed `maxFeeAmount − 1` 个原始单位，执行 Cancel，记录**是否在提交前被拦**、提示文案原文、**有无产生动作签名/task/tx**。

### 可选（P2，建议3 的实时校验）
11. 通过测试拦截器在“生成动作签名”和“发送 Relay 请求”之间延迟 2–3 分钟，模拟 gas 价漂移；观察是否出现 `Gas prices moved while this was being signed…` 并**阻断发送**（而非链上 revert）。自然波动不足且无可控注入时记 `BLOCKED`，不判 `FAIL`。

## 4. 核对数据

① 每次签名的 **`maxFeeAmount`**（授权上限，单位 6 位小数）
② 页面 **`Relay fee (est.)`**（displayFee，注意二者不是同一个数）
③ 链上 **`RelayFeePaid.feeAmount`**（实际扣费）
④ 订单终态（Cancelled / 仍 pending / 无事件）
⑤ USDC 余额差分
⑥ 失败时 **`InsufficientRelayFee(feeAmount, maxFeeAmount)` 两个参数**
⑦ D3 的拦截时机（提交前 vs 链上）与提示文案原文
⑧ 前端部署版本（是否含 `71963561`）

## 5. 期望结果（含推导）

**推导 1 —— 授权上限下限**
`MIN_MAX_FEE_USDC = 500_000`（6 位小数）= **0.5 USDC**；缺陷原始实需 `feeAmount = 14,208` = 0.0142 USDC。
→ `500,000 / 14,208 = 35.2`，即约 **35.2 倍**。只要真实代付费 < 0.5 USDC，该类失败在结构上不可能。

**推导 2 —— 真实代付费**
链上按本轮读取的 base gas、calldata gas、`tx.gasprice`、multiplier、垫付 execution fee 和 Oracle min/max 计算。原始案例的 0.0142 USDC 只用于说明旧 0.01 上限为何失败，不作为当前环境固定区间；正式断言是独立复算值 = `RelayFeePaid.feeAmount` = 账户差分，且不超过签署的 `maxFeeAmount`。

**逐档期望**

| 档 | 期望 |
|---|---|
| **D1** | 订单 A Cancel 与订单 B Update **均成功**；各自 signed `maxFeeAmount ≥ 500,000`；实扣与本轮链上参数独立复算一致且 `≤ maxFeeAmount`；不出现 `InsufficientRelayFee`；A 终态 Cancelled，B 仍存在且字段更新 |
| **D2** | 余额恰好等于当次 signed cap 时不被误挡，Cancel 成功；只有 cap floor 生效时才可写“0.50 USDC 等号成功” |
| **D3** | 余额比当次 signed cap 少 1 raw unit 时在提交前被拦、给出可读提示、不产生 task/tx/链上 revert |
| 可选 | 签名滞留后若 gas 上涨，出现"Gas prices moved…"提示并阻断发送 |

**同时应观察（显示层不回归）**：页面 `Relay fee (est.)` 仍保持 0.01 USDC 量级的合理显示，**不得**因授权上限抬高而把显示金额也撑到 0.5（即 display 与 cap 两个下限确实已拆开）。

## 6. 测试陷阱（执行前必读）

1. **别把页面 `Relay fee (est.)` 当授权上限**。页面显示的是 `displayFee`（~$0.02），真正决定成败的 `maxFeeAmount` 只在**签名内容**和链上事件里。
2. **区分"keeper 跳单"与"代付费失败"**——两者现象完全不同：
   - 代付费授权不足 = **立即弹窗 revert**（`InsufficientRelayFee`）
   - keeper 跳单（BUG-021）= **一直 pending、链上无任何后续事件**
   已知**新子账户的头几单是 keeper 跳单高危**，本用例正好用全新账户，务必按上面特征判别，别把 keeper 跳单误判成本缺陷未修。
3. **环境版本**必须确认含 `71963561`，否则结论无效（缺陷原报环境是生产 testnet，修复 09-03 才落 develop）。
4. D2/D3 必须**先建单、再取 fresh quote、最后精确调余额**；不得不看当次 quote 就把 0.50/0.30 USDC 当通用边界。
5. Cancel 成功后订单已不存在；Update 必须使用另一张独立挂单或恢复 snapshot。

## 7. 实际结果

待执行。回填要求：每档记 环境/部署版本、前端 commit、签名 maxFeeAmount、页面 displayFee、链上 feeAmount、tx、订单终态、USDC 差分；结论同步 `../results.md` 与 Notion 缺陷「复测」字段。

# BUG-FE-RELAY-001：Max 预留 1 USDC 与 Relay Fee 不足切换 Standard

## 1. 基本信息

| 字段 | 内容 |
|---|---|
| 模块 | Trade / Flash & Relay / Standard |
| 优先级 | P0 |
| 环境 | FX100 Dev / Base Sepolia |
| 状态 | CLOSED |
| 首次验证 | 2026-08-10 未通过 |
| 回归结果 | 2026-08-10 验收用例 6 / 6 PASS |

## 2. 需求目标

本需求包含两条相互独立的规则：

1. 用户在开仓、加仓或追加保证金时点击 `Max`，不得用尽钱包 USDC，必须预留 `1 USDC`；
2. Flash/Relay 模式下，用户资金足够完成业务操作、但不足以额外支付 Relay Fee 时，前端必须阻止 Relay 提交，并引导用户切换到 Standard 模式。

这样既能避免 Max 后没有余额支付 Relay Fee，也能让仍可通过 Standard 完成的操作不被错误阻断。

## 3. 适用范围

### 3.1 Max 预留 1 USDC

| 操作 | 订单类型 | 方向 | 交易模式 | 是否应用 |
|---|---|---|---|---|
| 开仓 | Market / Limit | Long / Short | Flash/Relay、Standard | 是 |
| 加仓 | Market / Limit | Long / Short | Flash/Relay、Standard | 是 |
| Adjust Margin → Deposit | 不适用 | 已有仓位方向 | Flash/Relay、Standard | 是 |
| 减仓 / 关仓的 Max | Market | Long / Short | Flash/Relay、Standard | 否；这里的 Max 表示关闭 100% 仓位，不是花费全部钱包余额 |
| Adjust Margin → Withdraw | 不适用 | 已有仓位方向 | Flash/Relay、Standard | 否；上限由可提取保证金和仓位风控决定 |

### 3.2 Relay Fee 不足时切换 Standard

该规则只在 Flash/Relay 模式生效，覆盖所有需要支付 Relay Fee 的用户写操作：

- Market / Limit 开仓；
- Market / Limit 加仓；
- 减仓、全部关仓；
- Adjust Leverage；
- Adjust Margin 的 Deposit / Withdraw；
- 其他使用同一 Relay 提交流程的交易操作。

Standard 模式不显示 `Switch to Standard`，也不把 Relay Fee 计入可提交条件。

## 4. 字段与计算口径

### 4.1 变量定义

| 变量 | 含义 | 单位 |
|---|---|---|
| `B` | 操作前钱包可用 USDC 余额 | USDC 最小单位 |
| `R` | Max 必须预留的余额，固定为 `1 USDC` | USDC 最小单位 |
| `M` | 用户输入的交易金额或 Deposit 金额 | USDC 最小单位 |
| `F(M)` | 除 Relay Fee 外、需要从同一钱包额外扣除的 USDC 费用；如费用已包含在 `M` 中，不得重复计算 | USDC 最小单位 |
| `Q` | 完成业务操作所需 USDC 总额，不包含 Relay Fee | USDC 最小单位 |
| `L` | 当前预估 Relay Fee | USDC 最小单位 |
| `D` | Relay Fee 资金缺口 | USDC 最小单位 |

USDC 按 Token 实际 decimals 计算。当前为 6 位时：

```text
1 USDC = 1,000,000
R = 1,000,000
```

计算必须使用整数最小单位，禁止使用 JavaScript 浮点数直接计算余额和费用。

### 4.2 Max 计算

通用定义：取满足以下条件的最大整数金额 `M`：

```text
M + F(M) <= B - R
M >= 0
```

如果额外费用与输入金额无关，可简化为：

```text
ExpectedMax = max(0, B - R - F)
```

如果费用随输入金额变化，必须按最终 Max 金额重新预估费用，直至同时满足余额约束；不能先用完整余额计算金额、再在提交阶段追加费用。

页面展示值由最小单位格式化得到，最多显示 USDC 支持的小数位，不得向上取整。实际提交值必须与 `ExpectedMax` 的原始整数值一致。

### 4.3 Relay Fee 余额分段

```text
Q = M + F(M)
D = max(0, Q + L - B)
```

| 余额条件 | 业务含义 | 页面处理 |
|---|---|---|
| `B < Q` | 连业务金额及非 Relay 费用都不足 | 显示普通 USDC 余额不足；不得用 `Switch to Standard` 掩盖真实余额不足 |
| `Q <= B < Q + L` | 业务资金足够，只缺 Relay Fee | 显示 Relay Fee 不足和 `Switch to Standard`；阻止 Flash/Relay 提交 |
| `B >= Q + L` | 业务资金与 Relay Fee 均足够 | 允许继续 Flash/Relay 流程 |

边界按整数精确比较：

- `B = Q`：可以切换 Standard，但不能继续 Relay；
- `B = Q + L - 1`：仍属于 Relay Fee 不足；
- `B = Q + L`：Relay 资金恰好足够，允许提交。

## 5. 页面交互与提示

当 `Q <= B < Q + L` 时，页面必须显示：

```text
Insufficient USDC for Relay Fee
Switch to Standard
```

交互要求：

1. Flash/Relay 确认按钮不可继续产生签名或链上交易；
2. 可展示 Relay Fee 预估值和缺口 `D`，便于用户理解；
3. 点击 `Switch to Standard` 只切换模式，不自动发送交易；
4. 切换后保留适用的订单类型、Long/Short、金额、杠杆、Limit 价格、滑点、仓位和保证金输入；
5. 切换后重新计算 Standard 模式预览，不再展示 Relay Fee；
6. 余额、费用或预览变化后，确认交易前必须重新执行余额校验，不能复用过期校验结果。

## 6. 测试数据口径

每条用例都必须记录以下原始数据：

```text
B：Before 钱包 USDC 余额
R：固定预留 1 USDC
M：输入金额
F：非 Relay USDC 费用
Q：M + F
L：Relay Fee
D：max(0, Q + L - B)
ExpectedMax：按 Max 公式计算的期望值
ActualMax：页面点击 Max 后的实际值
```

建议基础数据：

| 数据组 | 设置 | 主要断言 |
|---|---|---|
| DATA-01 | `B = 100`，`F = 0.25` | `ExpectedMax = 98.75`，提交前至少留出 `1 USDC` |
| DATA-02 | `B = 1`，`F = 0` | `ExpectedMax = 0` |
| DATA-03 | `B = 0.999999`，`F = 0` | `ExpectedMax = 0`，不得出现负数 |
| DATA-04 | `B = Q`，`L > 0` | 业务资金恰好足够，提示切换 Standard |
| DATA-05 | `B = Q + L - 0.000001` | Relay 仍不足，缺口为最小单位 |
| DATA-06 | `B = Q + L` | Relay 恰好足够，允许提交 |

## 7. 测试用例

### 7.1 Max 预留用例

| ID | P | 场景与交叉参数 | 步骤 | 预期结果 |
|---|---|---|---|---|
| TC-MAX-001 | P0 | Market 开仓；Long / Short；Flash/Relay / Standard | 读取 `B` 和费用；点击 Max；记录 ActualMax | ActualMax 等于公式结果；至少预留 1 USDC；预览和提交使用同一原始值 |
| TC-MAX-002 | P0 | Limit 开仓；Long / Short；Flash/Relay / Standard | 设置 Limit Price；点击 Max | Max 正确；Limit Price、方向、杠杆不变 |
| TC-MAX-003 | P0 | Market / Limit 加仓；已有 Long / Short；Flash/Relay / Standard | 选已有仓位；点击 Max | Max 正确；只增加目标仓位，不改变仓位方向 |
| TC-MAX-004 | P0 | Adjust Margin → Deposit；Long / Short 仓位；Flash/Relay / Standard | 打开保证金调整；选择 Deposit；点击 Max | Deposit 值等于公式结果；钱包至少预留 1 USDC |
| TC-MAX-005 | P0 | `B < 1`、`B = 1`、`B = 1 + 最小单位` | 分别点击 Max | 结果依次为 0、0、扣除费用后的最小可用值；无负数、无向上取整 |
| TC-MAX-006 | P1 | 点击 Max 后余额或费用发生变化 | 先点击 Max，再改变余额/费率并提交 | 提交前重新计算并校验；旧 Max 不得导致超额扣款或错误交易 |

### 7.2 Relay Fee 与 Standard 切换用例

以下操作都使用 `Q <= B < Q + L` 的数据条件执行。

| ID | P | 操作 | 预期结果 |
|---|---|---|---|
| TC-RELAY-001 | P0 | Market / Limit 开仓，Long / Short | 显示 Relay Fee 不足和切换入口；Flash/Relay 不得提交 |
| TC-RELAY-002 | P0 | Market / Limit 加仓，Long / Short | 提示和阻止规则与开仓一致 |
| TC-RELAY-003 | P0 | 减仓、Max 全部关仓 | 不改变关闭数量；提示切换 Standard；不得产生 Relay 交易 |
| TC-RELAY-004 | P0 | Adjust Leverage | 保留目标杠杆；提示切换 Standard；不得产生 Relay 交易 |
| TC-RELAY-005 | P0 | Adjust Margin → Deposit / Withdraw | 保留操作方向和金额；提示切换 Standard；不得产生 Relay 交易 |
| TC-RELAY-006 | P0 | 点击 `Switch to Standard` | 所有适用表单字段保留；Relay 提示消失；Standard 预览重算；不自动提交 |
| TC-RELAY-007 | P0 | `B < Q` | 仅显示业务余额不足；不得错误提示“只缺 Relay Fee” |
| TC-RELAY-008 | P0 | `B = Q + L - 1` 与 `B = Q + L` | 前者阻止并提示切换；后者允许 Relay 提交 |
| TC-RELAY-009 | P1 | 预览后 Relay Fee 上涨导致余额不足 | 确认前重新校验并阻止提交；缺口按最新 `L` 计算 |
| TC-RELAY-010 | P1 | 已处于 Standard 模式 | 不显示 Switch to Standard；仅按 `Q` 判断业务余额是否足够 |

## 8. 每条用例的证据要求

- 测试环境、版本、市场、订单类型、方向和交易模式；
- `B / R / M / F / Q / L / D / ExpectedMax / ActualMax`；
- 点击 Max 前后和切换模式前后的页面截图；
- 表单字段保留结果；
- 被阻止时无钱包签名、无交易哈希、无新增订单；
- 允许提交时的交易链接、交易前后余额和订单/仓位结果；
- 执行时间、执行人及最终 PASS/FAIL。

## 9. 验收与关闭记录

首次核对时，开仓、加仓和 Deposit 的 Max 未预留 1 USDC，Relay Fee 不足判断也未完成统一验证，因此 Bug 保持 OPEN。

2026-08-10 回归确认以下原始验收项全部通过：

```text
1. Market 开仓 Max 预留 1 USDC
2. Limit 开仓 Max 预留 1 USDC
3. Market / Limit 加仓 Max 预留 1 USDC
4. Adjust Margin Deposit Max 预留 1 USDC
5. Relay Fee 不足时提示切换 Standard，并阻止 Relay 提交
6. 切换 Standard 后保留表单参数，且不自动提交

回归结果：6 / 6 PASS
Bug 状态：CLOSED
```

第 7 节的交叉组合和边界用例作为后续版本的持续回归基线；一旦任一 P0 用例失败，应重新打开该 Bug 或创建对应的回归缺陷。

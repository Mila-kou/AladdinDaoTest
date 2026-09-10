# v0.3.2 前端 Trade 操作清单

## 1. 页面进入与市场

| 用户操作 | 前端要求 | 合约/数据核对 |
|---|---|---|
| 打开 Trade 页面 | 显示默认市场、行情、图表、下单区、仓位与订单区 | chainId、部署地址、marketIndex 与 CURRENT 一致 |
| 搜索/选择市场 | 所有区域同步切换；不兼容输入重置 | Reader 市场、token decimals、参数和页面一致 |
| 收藏市场 | 本地状态正确，不影响真实市场选择 | 不应改变链上参数 |
| 切换无行情/禁用市场 | 明确不可交易，不用 0 伪造价格 | 不发订单交易 |

Mock 合成市场不得按名称推断为 BTC。前端应读取市场实际 symbol、index token 和 decimals；测试数据至少要能覆盖 8 位与 18 位两类精度，所有输入、展示和 payload 均按运行时 decimals 换算。

## 2. 下单表单

用户可能执行：

- 选择 Buy/Long 或 Sell/Short。
- 选择 Market、Limit；根据产品入口表达 Stop Increase。
- 输入 USD 或 Token 数量并切换单位。
- 使用 25%/50%/75%/Max。
- 输入或拖动杠杆。
- 输入 Limit/Stop trigger price。
- 开启 TP/SL 并输入两个触发价。
- 查看 Pay、Size、Execution Price、Price Impact、Fee、Liquidation Price、Est. Receive。
- 在产品公开的 Standard 与 Flash One-Click/1CT 两种模式之间切换；direct Relay/Gasless 只是一条隐藏的 `mode=flash` 技术路径，不应显示成第三张模式卡。

前端必须在签名前阻止空值、0、负数、非法字符、超精度、超余额、超杠杆、超流动性/风险上限和错误方向 TP/SL。

## 3. Standard、Relay 与 Flash One-Click

当前产品 UI 是 **两种模式**，实现层是 **三条提交路径**：Standard、隐藏 direct Relay、1CT。持久化默认值是 `1ct`，但 Relay family 是否真正启用还受前端环境开关（默认关闭）、支持链和非零 `RelayRouter` 地址共同约束；当前 gate 并未再单独检查 `SubaccountRelayRouter`，因此 1CT 仍须额外验证目标地址。“默认选中”不能替代可用性检查。旧浏览器若保存过 `flash`，当前又没有 direct Relay 卡片可选，必须避免出现没有任何模式卡高亮的僵尸状态。

| 模式 | 签名与发送 | 费用 | 前端状态链 |
|---|---|---|---|
| Standard | 主钱包直接向 `ExchangeRouter` 发链上交易 | 用户支付原生 Gas；无 Relay Fee | wallet signing → tx pending → receipt → order |
| Relay/Gasless（内部 mode=`flash`） | 主钱包对每个动作签 EIP-712，任何持有有效 payload 的 caller 都可向 `RelayRouter` 发交易 | caller 付 Gas，用户付 Relay Fee，fee 收款方是实际 `msg.sender` | signing → relay task → tx → order；当前 UI 选择卡隐藏 |
| Flash One-Click/1CT | 主钱包完成独立风险 consent/approval，之后由 session key 签动作；任何持有有效 payload 的 caller 可向 `SubaccountRelayRouter` 发交易 | caller 付 Gas，用户付 Relay Fee，fee 收款方是实际 `msg.sender` | setup/renew → relay task → tx → order；受 slot、过期和计数约束 |

切换模式本身只改变提交偏好，不签名、不发交易、不创建 Relay task 或订单，也不得清空 market、方向、订单类型、数量单位、collateral、trigger、TP/SL、slippage 等非派生输入。手填金额保持；仍选中的 Max/百分比金额会按新模式余额规则重新计算。切到 Standard 后当前动作需要用户再次确认；切到 Standard 不等于撤销 1CT 授权，撤权必须走显式 Disconnect 链上流程。

合约没有要求 Relay caller 持有 Keeper role。前端/后端不得把某个固定服务地址写成安全前提；需要验证签名 domain/chainId、deadline、nonce/count、动作内容和费用 cap，并在 UI/API 留下实际 `tx.from`。

Relay task 与 Order 是两套串联状态：

| Relay task 状态 | 页面可声明的事实 | 页面不可声明的事实 |
|---|---|---|
| `pending` | 请求已入后端队列 | 不能说已广播或已创建订单 |
| `submitted` | 已广播且应有 `txHash` | 不能说 Router 成功或订单已成交 |
| `executed` | Relay Router 交易回执成功 | create 只说明 Order 已创建；Limit/Stop/TP/SL 仍需 Order Keeper，Market 也不能仅凭 task 判成交 |
| `failed` | Relay 广播/回执/链上执行失败 | 不能自动映射为链上 `Cancelled` |

CURRENT 下单 helper 只拿到 `taskId` 就会先把本地 submission state 标成 `success`；此处只能显示“请求已入队”，不能显示“链上成功”。Keeper 等待回执默认约 60 秒，超时可让服务端任务保持 `submitted`；前端约 2 秒轮询、90 次后产生约 3 分钟的本地 timeout/failed，但不会改变服务端或链上状态。超时后应提供按 `txHash`/orderKey 继续对账与安全重试能力，避免用户重复建单。

### 3.1 1CT 首次连接、Consent 与 Session Key

目标分层是：钱包连接处披露 Terms/Privacy；进入 1CT 时再做一次独立的风险确认。CURRENT 风险 consent 使用 `personal_sign`，按 owner 和 consent 版本 `2026-07-29` 保存，且不随 `Stay connected` 开关迁移或清除。

CURRENT 仍有两处不一致，验收时不能忽略：

- Trade 建连弹窗仍要求勾选 Terms/Privacy，把法律条款和 1CT 风险确认混在同一层。
- Settings 可在未检查风险 consent 时先生成 session key、签 approval；若需求定义为“授权创建前必须确认风险”，该入口不合格。若只要求“下单前确认”，Trade gate 会拦截，但仍需明确产品口径。

首次 Trade 建连顺序应记录为：风险确认 → 浏览器随机生成 session private key → 主钱包签 approval/必要 Permit → Relay 提交建连。建连弹窗成功后会关闭，用户必须再次点击原交易提交；系统不得自动补发刚才的订单，也不得在建连失败时静默切成 Standard。

- Session private key 使用浏览器本地随机数生成，不是从主钱包签名推导。当前以公开 owner 地址作为本地 AES 口令，只能算轻量混淆，不能宣传为强静态加密。
- `Stay connected` 默认开启：开启写 localStorage，关闭写 sessionStorage；切换时迁移现有 key。
- 活跃策略为 90 天有效期，`maxAllowedCount = 当前链上 count + 1,000,000`。两者是前端政策，不是合约常量；SDK 中仍留有未走活跃流程的 7 天/90 次/1 小时旧默认。
- 单笔 create/update/cancel/batch 的签名 deadline 约 30 分钟，Permit 约 1 小时，approval deadline 才是 90 天；三者不得混用。
- 旧的 1 小时离开/闲置锁目前未挂载，离开页面或闲置一小时不会按需求自动锁。
- 前端在 `now >= expiresAt` 或 `nextCount >= maxAllowedCount` 时提前判无效；合约是在 `>` 时才拒绝，因此等号边界存在一个 tick 的保守差异。
- 到期前 3 天只显示提醒和手动 Renew，没有自动重签；到期、计数耗尽或签名失败不得无提示回退 Standard。

### 3.2 1CT 动作范围、槽位与撤权

- 合约将 create、update、cancel 和 batch 共用一个 `SUBACCOUNT_ORDER_ACTION`；batch 的 action count 是 create、update、cancel 子项数量之和。当前无法授权“只创建、不更新/不撤单”。
- Liquidation、ADL、Funding 更新和 Oracle 更新不是用户 session action，不得因为它们影响 Trade 就放进 1CT 授权范围。
- 最多 4 个命名 slot。同名有效 slot 可替换 subaccount；不同有效 slot 不能重复使用同一非零 subaccount；过期不会自动释放 slot。
- `removeSubaccount` 只把地址清零，保留 slot 名与 active 标志，因此不释放四槽容量；只有 `removeSlot` 清空槽位并释放容量。找不到目标时两者的事件/静默行为也不同，页面不能一概显示“已删除”。
- 合约、SDK 和当前前端均没有 `revokeAll`。CURRENT Disconnect 由主钱包直接调用 `SubaccountRouter.removeSubaccount`，不是 gasless，而且不会释放 slot；“Disconnect”不得承诺已释放槽位或已撤销所有授权。
- v0.3.2 合约的 `SubaccountApproval` 必须含 `string slot`，但 CURRENT SDK 的类型、EIP-712、ABI/encoding 以及前端调用仍缺该字段，Keeper 又复用同一 SDK。修复并完成跨层对拍前，1CT create/update/cancel/batch 的功能层全部记 `GAP`，版本前端准入另为 `NOT_READY`。

### 3.3 Relay Fee、USDC Max 与切换 Standard

- `maxFeeAmount` 是签名 cap；合约只扣实际 `feeAmount`，没有“扣 max 后退差额”。展示报价与签名 cap 采用不同防护参数，签名前必须重新报价。
- v0.3.2 Relay/1CT 的 6 位 USDC Max 统一为两级预留：`B>C+U ? B−C−U : 0`，其中 `C=signed maxFeeAmount`、`U=1 USDC=1_000_000 raw`。cap floor 为 0.5U 时，`B≤1.5U` 的 Max 都为 0；必须覆盖 `C+U−1/= /+1 raw`。
- Pay/Size 的 0 结果当前直接 return，按钮不置灰、不报错且可能保留旧输入；这是确定性死区，不是偶发网络问题。
- 建议适用面固定为 Market/Limit/Stop Increase 的 open/add、long/short、pay/gross-up/size，以及 Adjust Margin Deposit。Close 100% 与 Withdraw Max 是仓位/风险维度，不扣额外 `U`。
- 固定 `1_000_000` 扣减没有按 mode 收口，Standard 也会扣。当前 pay/fee token 是 6 位 USDC，index token 的 8/18 位不影响 reserve；未来若开放非 6 位 pay/fee/collateral token，必须按运行时 decimals 计算，不能把一百万 raw 当 1 USDC。
- Deposit Max=`min(riskMax,max(B−C−U,0))`；wallet-bound、risk-bound、手填等号与 25%/50%/75% 必须分组。
- Withdraw Max 不使用钱包 `U`，但必须同时受清算余量和最大杠杆约束。CURRENT 对清算 floor 增加 `floor+ceil(floor×25%)` 的 Max-fill 余量，再与 action threshold 取较高 required；最终取 `equity−required` 与 `settledMargin−ceil(size/maxLeverage)` 两个可提上限中的较小值。相同 Position 快照下 Standard 与 1CT 的 Max 金额应一致，1CT 只额外校验 Relay Fee 余额。
- Shared fee gate 会把 loading、unavailable、insufficient 都标成 blocked，但各操作消费方式不一致：Update Order 按 `blocked` 全部禁用，多个 close/margin/TP-SL 等入口只把 insufficient 当阻断、对 loading/unavailable fail open。三类原因必须分别展示，并统一哪些动作可继续；不能把当前分裂行为写成统一需求。
- 估算超过 25 USDC 时底层会抛专用 cap 错误，但当前 quote refresh 捕获后只保留 `unavailable` 状态，页面可能丢失“超过上限，请切 Standard”的具体原因。
- `Switch to Standard` 当前只修改模式：非派生字段和手填金额保持，已选 Max/百分比金额重算；不自动提交，要求用户再次确认。该入口主要出现在 confirmed insufficient 分支，报价不可用/cap 分支不一定提供。
- Relay create/update 的 Execution Fee 可由 caller 先垫 WNT并包含在 Relay Fee 中；订单执行/取消后，多余 WNT 可能解包为原生币退给用户。页面不得把 Relay Fee 与 Order executionFee 重复相加，也不得承诺多余部分退回 USDC。

#### 3.3.1 前端模式与 Max 交叉验证用例

产品页面只允许用户选择 Standard 与 Flash One-Click/1CT；direct Relay/Gasless 仅作为隐藏技术路径验证，不能把它设计成第三张公开模式卡。下表只列交叉风险，正常路由与静态数值边界继续复用已有原子用例，不重复执行。

| 交叉验证对象 | 原子用例 | 本用例独立验证的风险 |
|---|---|---|
| 三条技术路径的正常 signer、Router、task 与经济结果 | `XT-RELAY-010`、`XT-FLASH-004` | 复用既有证据；Standard、direct Relay、1CT 结果只允许存在已声明的路径与费用差异 |
| 1CT 联合准入 | `FT-RELAY-MODE-023` | 任一依赖缺失时，高亮模式、CTA 与实际 Router 不得相互矛盾或静默降级 |
| 隐藏 direct Relay 遗留状态 | `FT-RELAY-LEGACY-024` | localStorage=`flash` 不得形成没有公开卡片选中却实际发送 Relay 请求的 zombie 模式 |
| 市价开仓 Max 跨模式零值迁移 | `FT-RELAY-MAX-025` | Standard 的有效 Max 切到 1CT 后变为 0 时，必须清除旧值并阻断提交 |
| 增加保证金 Max 跨模式零值迁移 | `FT-RELAY-MAX-026` | 100%/Max 草稿不得在模式切换后沿用已失效的增保金额 |
| Relay Fee 报价与模式切换竞态 | `FT-RELAY-QUOTE-027` | 迟到的旧 1CT quote 不得污染 Standard Max，切回 1CT 必须取当前上下文 fresh quote |
| 提取保证金 Max 的模式等价性 | `FT-RELAY-MAX-028` | Standard/1CT 对同一仓位得到相同风险 Max；25% 清算余量、maintenance/leverage 双上限和 fee-only 门分别核对 |
| 1CT 开仓防重复提交 | `FT-RELAY-SUBMIT-029` | 第一次点击须同步锁定 CTA；Relay txHash 可追踪前的双击、连点、Enter 和移动端连续 tap 均不得产生第二次签名、task 或订单 |
| 提交状态弹窗防重复提交（用例位） | `FT-RELAY-SUBMIT-030` | 保留弹窗重复点击、Retry、关闭重开和重复回调导致多笔交易的专项位置；待实际交互核对后原子化 |

其余静态边界仍由 `FT-RELAY-USDC-015/016`、`FT-RELAY-MAX-018/019`、`FT-RELAY-QUOTE-020`、`FT-RELAY-CAP-021` 与 `FT-RELAY-SWITCH-022` 承担。已提交 task 或 `Open` Order 后切模式的隔离证据统一挂到 `XT-ORD-MODE-001`，不得重新创建同一业务订单。

### 3.4 CURRENT 实现依据

本节结论固定到 [`CURRENT.json`](../../contract-releases/CURRENT.json) 指向的合约与 apps 提交，不用需求文档日期替代源码事实：

- 模式、可用性和 UI 卡片：[`state/ui/flash.ts`](../../../Github/fx100-apps@develop/apps/fx-base-app/src/state/ui/flash.ts)、[`state/derived/flash.ts`](../../../Github/fx100-apps@develop/apps/fx-base-app/src/state/derived/flash.ts)、[`FlashSettings.tsx`](../../../Github/fx100-apps@develop/apps/fx-base-app/src/components/features/settings/FlashSettings.tsx)。
- Consent、随机 key、90 天/+1,000,000 和撤权：[`wallet-providers.tsx`](../../../Github/fx100-apps@develop/apps/fx-base-app/src/app/wallet-providers.tsx)、[`EstablishConnectionModal.tsx`](../../../Github/fx100-apps@develop/apps/fx-base-app/src/components/features/trade/order-form/EstablishConnectionModal.tsx)、[`consent.ts`](../../../Github/fx100-apps@develop/apps/fx-base-app/src/lib/flash/consent.ts)、[`subaccountCrypto.ts`](../../../Github/fx100-apps@develop/packages/sdk/src/flash/subaccountCrypto.ts)、[`signFlashApproval.ts`](../../../Github/fx100-apps@develop/apps/fx-base-app/src/lib/flash/signFlashApproval.ts)、[`useSubaccountSession.ts`](../../../Github/fx100-apps@develop/apps/fx-base-app/src/hooks/account/useSubaccountSession.ts)。
- Fee、USDC Max 与切换：[`feeEstimate.ts`](../../../Github/fx100-apps@develop/apps/fx-base-app/src/lib/relay/feeEstimate.ts)、[`useOrderFormController.ts`](../../../Github/fx100-apps@develop/apps/fx-base-app/src/hooks/trade/useOrderFormController.ts)、[`PositionMarginDialog.tsx`](../../../Github/fx100-apps@develop/apps/fx-base-app/src/components/features/trade/_position/PositionMarginDialog.tsx)。
- 开仓按钮提交锁：[`useSubmissionLock.ts`](../../../Github/fx100-apps@develop/apps/fx-base-app/src/hooks/trade/useSubmissionLock.ts)、[`submissionLock.ts`](../../../Github/fx100-apps@develop/apps/fx-base-app/src/lib/orders/submissionLock.ts)、[`SubmitButton.tsx`](../../../Github/fx100-apps@develop/apps/fx-base-app/src/components/features/trade/order-form/SubmitButton.tsx)。
- Relay task：[`queueProtocol.ts`](../../../Github/fx100-apps@develop/packages/sdk/src/relay/queueProtocol.ts)、[`relWorker.ts`](../../../Github/fx100-apps@develop/apps/keeper/src/entrypoints/relWorker.ts)、[`submitFlashOrder.ts`](../../../Github/fx100-apps@develop/apps/fx-base-app/src/lib/orders/submitFlashOrder.ts)。
- Caller 权限、slot/action、CURRENT SDK slot GAP 与 Execution Fee 退款：[`BaseRelayRouter.sol`](../../../Github/fx100-contracts@release-v0.3.2/src/router/relay/BaseRelayRouter.sol)、[`SubaccountUtils.sol`](../../../Github/fx100-contracts@release-v0.3.2/src/subaccount/SubaccountUtils.sol)、[`RelayUtils.sol`](../../../Github/fx100-contracts@release-v0.3.2/src/router/relay/RelayUtils.sol)、[`types.ts`](../../../Github/fx100-apps@develop/packages/sdk/src/relay/types.ts)、[`eip712.ts`](../../../Github/fx100-apps@develop/packages/sdk/src/relay/eip712.ts)、[`subaccountApproval.ts`](../../../Github/fx100-apps@develop/packages/sdk/src/relay/subaccountApproval.ts)、[`GasUtils.sol`](../../../Github/fx100-contracts@release-v0.3.2/src/gas/GasUtils.sol)、[`OrderUtils.sol`](../../../Github/fx100-contracts@release-v0.3.2/src/order/OrderUtils.sol)、[`OrderHandler.sol`](../../../Github/fx100-contracts@release-v0.3.2/src/exchange/OrderHandler.sol)。

详细首次建连、续期、存储、Permit、Cancel All/Protection Roll 等动作覆盖和 v0.3.2 当前 GAP 见 [Standard-Relay-Flash-OneClick-(v0.3.2).md](<专项-Relay/Standard-Relay-Flash-OneClick-(v0.3.2).md>)。

## 4. 持仓操作

用户可能：

- 查看方向、Size、Collateral、Entry、Mark/Oracle、PnL、Funding、Leverage、Liquidation Price。
- 同方向加仓。
- 部分平仓、全部平仓。
- 增加或提取保证金。
- 调整目标杠杆。
- 为现有仓位新增或修改 TP/SL。
- 清算保护期结束后执行关闭并重新开仓（Close & Reopen）。

每个操作后页面必须从 Reader/事件刷新，而不是只修改本地乐观状态；失败时应回滚乐观显示。

### 4.1 关闭并重新开仓的前端要求

- 入口只在原 Position 仍存在且 `now>=graceEnd` 时可用；`graceEnd−1` 不可用，`graceEnd` 等号已到期。到期后刷新、重进 Trade、在桌面仓位行或移动仓位卡重新选择，入口仍必须可达。
- 同一账户存在多笔仍在清算保护期的 Position 时，选中状态、倒计时、到期状态和入口必须按 positionKey 隔离。用户在 P2 到期前选中 P2，随后 P2 先到期而 P1/P3 仍在保护期时，页面不得自动切换到 P1/P3；点击“关闭并重新开仓”只能冻结并处理 P2 的快照。两腿等待期间应以本次请求及 orderKey 持续关联 P2，重开成功后仍指向新的 P2 仓位上下文；P1/P3 的 Position、TP/SL、保护期和费用不得变化。
- 该功能不是一笔合约 Roll：前端先提交 100% `MarketDecrease`，只在本次关仓 Order 已 `Executed` 且旧 Position 归零后，才使用点击时冻结的 market、direction、collateral、leverage 和 size 提交 `MarketIncrease`。两腿必须分别显示 orderKey/任务、执行状态和费用。
- 重开 size 按当前市场页面允许精度向下截断，不得向上放大。新仓的 `graceStart/graceEnd` 以 `MarketIncrease` 真正执行时的链上数据为准；只有 OrderCreated 或 Relay task accepted 时不得提前显示新保护期。
- 旧仓的 `autoCancel=true` TP/SL 应随全平自动取消；重开快照不继承 TP/SL，页面应明确提示用户新仓需要重新设置保护单。
- Standard 要在第一腿前校验两腿 Gas、Execution Fee 和重开资金；1CT 要在第一腿前校验 session/consent、剩余 action count≥2 和两个独立 Relay task 的 Relay Fee。任一整体条件不足时不得先平仓。1CT 不得静默降级为直接 Relay。
- 关仓腿失败时原仓位保留且不提交重开；关仓已成功但重开失败时，必须明确告知用户当前空仓并保留人工重开表单。若 Liquidation 先终结旧仓，不得仅因 Position 消失就自动重开。

完整原子用例见 [Trade-测试用例矩阵.md](../../../TestCase/E2E/versions/v0.3.2/Trade-测试用例矩阵.md) C2 与 §5 C 的 FT/XT-FLASH-ROLL 专项。

## 5. Open Orders 与历史

用户可能：

- 查看订单 Type、Direction、Size、Trigger、Acceptable Price、状态和创建时间。
- 编辑允许修改的触发价和规模。
- 撤销单笔或 Cancel All。
- 查看 Executed、Cancelled、Frozen、ADL、Liquidation 历史。

重点要求：页面类型与链上 `orderType` 一致；订单规模在 Open Orders 和 History 使用相同口径；Indexer 延迟必须提示，不能用陈旧数据伪装最终状态。

## 6. 风险与保护操作

用户可能：

- 查看清算价和风险提示。
- 在危险区追加保证金或减仓。
- 查看免清算保护倒计时与状态。
- 在保护期内设置/触发 TP/SL。
- 查看保护到期后的清算或仓位存续结果。
- 查看 ADL 或 Liquidation 通知。

前端必须明确区分：价格触线、保护中、正在救援、保护到期、已清算、ADL。

## 7. v0.3.2 前端专项要求

1. Dynamic Spread 和 Price Impact 支持负值，不能用无符号类型、绝对值或 0 代替。
2. 报价、执行价和 acceptablePrice 必须使用 v0.3.2 规则。
3. 减仓 payload 正确传 `minOutputAmount`，单位为合约要求的 USD 口径。
4. 适配删除后的 secondary output 事件字段。
5. 删除 claimCollateral 页面入口、ABI 调用和后台依赖。
6. 合约要求子账户授权包含命名 `slot`，最多 4 个有效槽位；CURRENT 固定前端的类型、typed data 与 ABI 仍缺 `slot`，修复并对拍前 1CT 功能层记 `GAP`，准入状态另记 `NOT_READY`。
7. Relay feeToken 固定使用 COLLATERAL_TOKEN，不提供无效代币选择。
8. Funding 页面值与逐仓实际结算时点一致。

## 8. 前端验收证据

关键用例至少保留：操作前页面、填写后预览、模式与有效可用性、钱包/会话 signer、提交 payload、Relay task、`tx.from/to`、过程状态、最终页面、交易哈希、orderKey、Reader 对照和余额差分。仅有交易哈希不能证明前端功能通过。

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
- 在 Standard 和 Flash/One-Click 之间切换。

前端必须在签名前阻止空值、0、负数、非法字符、超精度、超余额、超杠杆、超流动性/风险上限和错误方向 TP/SL。

## 3. 提交与签名

| 操作 | Standard | Flash/One-Click |
|---|---|---|
| 首次准备 | 钱包连接、网络、USDC allowance | 主钱包连接、创建/选择 slot、EIP-712 授权 |
| 提交 | 钱包确认链上交易 | 会话签名/Relay 任务 |
| Fee | Execution/交易相关费用 | 同左 + Relay fee |
| 状态 | wallet pending → tx → order | submitted → relay task → tx → order |
| 失败恢复 | 拒签/RPC 失败可重新提交，不重复发单 | 授权过期、计数、Relay 超时可识别和恢复 |

## 4. 持仓操作

用户可能：

- 查看方向、Size、Collateral、Entry、Mark/Oracle、PnL、Funding、Leverage、Liquidation Price。
- 同方向加仓。
- 部分平仓、全部平仓。
- 增加或提取保证金。
- 调整目标杠杆。
- 为现有仓位新增或修改 TP/SL。
- Close & Reopen（若产品提供入口）。

每个操作后页面必须从 Reader/事件刷新，而不是只修改本地乐观状态；失败时应回滚乐观显示。

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
6. 子账户授权包含命名 slot，最多 4 个有效槽位。
7. Relay feeToken 固定使用 COLLATERAL_TOKEN，不提供无效代币选择。
8. Funding 页面值与逐仓实际结算时点一致。

## 8. 前端验收证据

关键用例至少保留：操作前页面、填写后预览、钱包/Flash 确认、提交 payload、过程状态、最终页面、交易哈希、orderKey、Reader 对照和余额差分。仅有交易哈希不能证明前端功能通过。

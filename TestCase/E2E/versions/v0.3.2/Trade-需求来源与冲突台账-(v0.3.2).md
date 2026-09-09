# v0.3.2 Trade 需求来源、时间线与冲突台账

> 环境、合约、前端和 Keeper 的固定基线只认 [`Docs/contract-releases/CURRENT.json`](../../../../Docs/contract-releases/CURRENT.json)。本文负责裁决需求口径，不把移动分支、历史部署或旧测试结果写成当前事实。

## 1. 裁决规则

1. **实现事实**：以 CURRENT 固定的合约、前端/SDK/Keeper 源码为准；需求写了但源码或测试适配没有，记 `GAP`；实现已经具备但运行依赖不可用，才记 `BLOCKED`。
2. **产品期望**：同一主题由后续 `Closed/Approved` 的明确决定覆盖早期草案；同一文件前后矛盾时，采用其中标明“已定/最终/已实现”的后段决定。
3. **未决需求**：`Open`、空白任务、讨论稿和建议项不覆盖已关闭决定，也不生成新的 PASS 期望。
4. **安全事实**：可复现的资金或权限缺口优先于旧营销/风险文案。存在反例时，不得继续使用“绝不会转移资金”等绝对表述。
5. **测试落地**：版本功能 ID 只在 [Trade-测试用例矩阵.md](Trade-测试用例矩阵.md) 创建；本台账只给出裁决状态和待办。

执行结果只使用 `NOT_RUN`、`PASS`、`FAIL`、`BLOCKED`、`GAP`。其中 `GAP` 是需求、实现或测试面的结构性缺失；`BLOCKED` 是实现与测试面已存在、但环境或外部依赖阻止执行。两者不得合写；同一旅程按 CT、FT、XT 分层登记。

本文的 `已裁决`、`待产品/安全裁决`、`历史作废` 是需求裁决标签，不是测试执行状态。

## 2. 需求时间线

| 日期 | 来源 | 状态 | 对当前测试的作用 |
|---|---|---|---|
| 2026-06-10 | [本地归档](../../../../Docs/V0.3.1/需求文档/2026-06-10_FX100-Express-Mode-架构分析-前端指南-产品风控-测试规格.md)、[Notion 原文](https://app.notion.com/p/FX100-Express-Mode-2026-06-10-37c3d7873f2c81909f5af4f06a81cef9) | v0.2.1 初始批准稿 | Relay/1CT、费用、Keeper 和安全约束的根需求；24h/100 次、5 分钟 deadline、Keeper 白名单等不能直接当 v0.3.2 当前值 |
| 2026-06-15 | Express B1 决策 | 已批准补充 | Relayer 垫付 WNT Execution Fee，用户以抵押品 Token 的 Relay Fee 偿付；要求 Relay create 的 Execution Fee cap 生效 |
| 2026-06-22 | [本地归档](../../../../Docs/V0.3.1/需求文档/2026-06-22_express模式前端策略.md)、[Notion 原文](https://app.notion.com/p/express-3873d7873f2c801bbb81f0e0a51b78f1) | Review/P1；后续决定再次确认 | 最终用户只看到 One-Click 与 Standard，默认 One-Click；direct Relay 不是第三个公开模式 |
| 2026-07-17～2026-07-23 | [Flash 安全评审](../../../../Docs/V0.3.1/需求文档/2026-07-26_flash-mode-security-review.md) 第三部分、[HL 优化本地归档](../../../../Docs/V0.3.1/需求文档/2026-07-23_Flash-1CT学HL优化-随机key与隐形默认交互.md)、[Notion 原文](https://app.notion.com/p/Flash-1CT-HL-key-review-feat-flash-1ct-hl-style-3a53d7873f2c81d0ad5ff44c0a53304a) | 产品已拍板、优化单 Closed | 随机本地 key、90 天、链上已用次数 +1,000,000、移除 1h 锁、Stay connected 默认开、建连后不自动下单 |
| 2026-07-20 | [本地归档](../../../../Docs/v0.3.2/需求文档/2026-07-20_FX100-Flash-1CT-Named-Agent-最终方案.md)、[Notion 原文](https://app.notion.com/p/FX100-Flash-1CT-Named-Agent-3a33d7873f2c8117b564f6c93f42a446) | 设计方案，部分开放 | 给出命名随机 key、多设备、同名替换和管理 UI 意图；90 天授权以命名槽可覆盖，或 `revokeAll` 可发现、可撤销为安全前提；CURRENT 未形成完整管理面 |
| 2026-07-28 | [1CT 同意与风险披露](../../../../Docs/V0.3.1/需求文档/2026-07-28_FX100-Flash-1CT-同意与风险披露(给前端+合规).md) | Closed，最终实现说明 | Terms/Privacy 在连接钱包阶段；开启 1CT 前另做版本化风险 `personal_sign`，同版本续期不重复签 |
| 2026-08-04 | [OC-23 Market 超时撤单](../../../../Docs/v0.3.2/需求文档/2026-08-04_OC-23-market-单永远无法取消，保证金被无限锁定（合约支持，是前端把入口关掉了）.md)、[OC-24 Order Tracking](../../../../Docs/v0.3.2/需求文档/2026-08-04_OC-24-Settings-的-Order-Status-建议默认关闭（对齐-HL-的一键成交体验）.md)、[OC-25 交易通知](../../../../Docs/v0.3.2/需求文档/2026-08-04_OC-25-收藏市场缺少顶部跑马灯-+-缺少交易通知（关掉订单弹窗后没有任何即时反馈）.md)、[OC-26 Standard 撤单反馈](../../../../Docs/v0.3.2/需求文档/2026-08-04_OC-26-标准钱包路径取消订单永远卡在-Cancel-Submitted（Flash-路径正常）.md) | Closed；OC-26 High | Market 超时撤单、Order Tracking 默认关闭、toast 完整终态；Standard 撤单必须从 `Cancel Submitted` 更新到 `Order Canceled` 或错误态，不得 8 秒静默消失 |
| 2026-08-10 | [USDC 不够时如何发起 Relay](../../../../Docs/v0.3.2/需求文档/2026-08-10_USDC不够时如何发起relay.md) | Closed/High；公式已按 CURRENT 裁决 | v0.3.2 使用 signed `maxFeeAmount` + 额外 1 USDC 两级预留；边界以本台账第 3 节和专项文档为准 |
| 2026-08-11 | [90 天到期前自动重新签](../../../../Docs/v0.3.2/需求文档/2026-08-11_subaccount-90天到期前可以自动重新签.md) | Open/Low，正文为空 | 仅为 backlog，不覆盖“到期前提示、用户主动续签”；不得据此要求后台静默签名 |
| 2026-08-12 | v0.3.2 Bug 注册表 R8-B02/R8-B21 | Reported | 证明 1CT Relay Fee cap 和 callback Execution Fee cap 存在资金转移风险，推翻旧绝对安全文案 |
| 2026-08-16 | [子账户槽位数量讨论](../../../../Docs/v0.3.2/需求文档/2026-08-16_子账户槽位数量上限（MAX_SUBACCOUNT_SLOTS）设计讨论.md) | 讨论完成、未实施 | 1 槽/固定 slot/可配置是候选方案；当前合约测试仍必须按实际 4 槽 |

特别提醒：2026-07-26 的安全评审开头仍保留 24 小时、90 次、1 小时锁和默认不持久化的旧描述，但同一文件第三部分已经记录最终决定。测试不得按文件名日期机械采用开头旧值。

### 2.1 已确认的需求错误

OC-23 的遗留说明把“`REQUEST_EXPIRATION_TIME` 较长、`MAX_ORACLE_PRICE_AGE` 较短”推导成 Market Order 在 Oracle 新鲜度过后“既不能执行也不能取消”的死窗，这个推导不符合 v0.3.2 合约。`MAX_ORACLE_PRICE_AGE` 校验是价格报告相对**执行当时** `block.timestamp` 的新鲜度；Keeper 可在 request 的 T 窗口内不断提交 fresh report。Market Order 另要求 Oracle timestamp 不早于 `order.updatedAtTime` 且不晚于 `updatedAtTime + REQUEST_EXPIRATION_TIME`。因此当前正确测试是动态读 T，验证 T−1/T/T+1 的取消边界，并在执行窗内用 fresh report 验证可执行；不将“约 59 分钟死窗”列为产品事实或待裁冲突。

## 3. 已裁决，可直接修正文档和用例

| 主题 | 当前统一口径 |
|---|---|
| 模式数量 | **两种用户产品模式、三条技术提交路径**。公开 UI 只有 Standard 与 Flash One-Click/1CT；direct Relay/Gasless 是内部/遗留技术路径，只做 SDK、RPC 和迁移覆盖 |
| 默认与降级 | 保存偏好默认 `1ct`；feature、chain 或 Router 不可用时有效路径可回到 Standard，但页面必须让“偏好模式”和“实际模式”一致可解释 |
| key 生成 | 浏览器本地随机生成，不由主钱包签名派生；生成动作没有钱包弹窗 |
| 1CT 首次签名 | 风险 consent `personal_sign` + `SubaccountApproval`；首笔交易 allowance 不足时还可能有 Permit。完成一次性设置后才是稳态无逐笔钱包弹窗 |
| Consent 分层 | Terms/Privacy 属于钱包连接披露；1CT 建连只处理会话密钥风险 consent。风险 consent 按 owner + version 缓存，版本变化重签，同版本续期不重签 |
| 生命周期 | 前端授权期 90 天；每次授权令 `maxAllowedCount = onChainActionCount + 1,000,000`；少于 3 天只在 Settings 提示；不采用 1h 隐藏/闲置锁；Stay connected 默认开。90 天不能单独作为安全结论，必须同时满足命名槽可覆盖，或 `revokeAll` 可发现且可撤销 |
| 建连后下单 | setup/renew 成功只关闭弹窗并恢复原 CTA；**不得自动提交**，用户必须再次点击 |
| 到期 | 当前为提示并由用户显式 renew；过期/次数用尽时不使用旧 key，也不静默切 Standard 自动下单 |
| USDC Max | 6 位 USDC 的 Relay/1CT Max 为 `B>C+U ? B−C−U : 0`；`C` 为 signed `maxFeeAmount`，`U=1 USDC=1_000_000 raw` 为额外预留。cap floor=0.5U 时正 Max 要求 `B>1.5U`；不再使用旧公式 |
| USDC 不足与切换 | gate 以 signed `maxFeeAmount` 做余额准入，`B<业务金额+C` 才不足、等号通过；显示 `Insufficient USDC for Relay Fee` 和 `Switch to Standard`。切换不自动提交，手填金额保持，Max/百分比派生金额按 Standard 规则重算 |
| Order Tracking | 新用户默认关闭 Modal，以同一条可更新 toast 覆盖 signing/task/tx/order 终态；历史 localStorage 为 true 的用户仍可显示 Modal |
| Standard 撤单 toast | Standard 路径拿到 txHash 后使用可更新的 pending toast，等待 receipt 后原地更新为 `Order Canceled` 或错误态；未 resolve 前不按 8 秒定时消失，最终态语义和视觉与 Relay 路径一致 |
| 槽位实现 | v0.3.2 是 `string slot`、最多 4 个 active slot；同名替换，重复地址拒绝；`removeSubaccount` 撤地址授权但不释放槽，`removeSlot` 才释放 |

## 4. CURRENT 差距：`GAP` 与 `BLOCKED` 分层

`CURRENT.primary.admissionScope` 为 `NOT_READY` 只说明尚未准入，不直接决定记 `GAP` 还是 `BLOCKED`；必须继续写清根因。代码、schema、链/地址配置或 UI 入口缺失是 `GAP`，外部服务、目标版本环境、资金、角色、钱包或 RPC 暂不可用才是 `BLOCKED`。

### 4.1 `GAP`：需求、实现或测试面缺失

| 优先级 | 期望 | CURRENT 事实 | 测试处理 |
|---|---|---|---|
| **P0 / 最高** | Consent 风险边界和文案必须真实 | 当前文案仍声称 key “can never withdraw or move your funds”，但 R8-B02/B21 给出资金转移路径 | 修复安全缺口前不得开放 1CT；立即删除绝对保证，完成法务/安全复核。执行当前文案用例若复现不一致，记 `FAIL`，不能以环境问题降为 `BLOCKED` |
| **P0 / 最高** | Terms/Privacy 与 1CT 风险 consent 分层且不可绕过 | `EstablishConnectionModal` 注释写已分层，实际 UI 仍强制勾选 Terms/Privacy；Settings 又可绕过 consent 先签 approval | FT 分别验证连接披露、版本化风险 consent、Settings/Trade readiness；缺失的统一 gate 记 `GAP`，可执行路径绕过期望则记 `FAIL` |
| P0 | 90 天授权具有可发现、可撤销的 Named Agent 退出面 | CURRENT 每个 `(chainId, owner)` 只管理一个本地 session；无完整四槽查看/覆盖、`removeSlot` 或 `revokeAll` UI | 90 天不得单独判安全；合约 CT 按 4 槽验证，FT 在完整管理/撤权面补齐前记 `GAP` |
| P0 | 1CT typed data、ABI 和 Keeper 与 `string slot` 一致 | 前端/SDK/Keeper 仍是无 `slot` 的旧结构 | 1CT FT/XT 记 `GAP`；完成 digest、selector、首次授权、续期和全部动作对拍后解除 |
| P0 | 目标 tx-fork 有完整链、地址和 Relay ingress 适配 | 目标 chainId 未进入当前 SDK supported-chain/地址配置，Relay ingress 也拒绝该 chainId | `tx-fork:frontend` 的当前根因记 `GAP`；完成配置、Router 读回和 ingress 准入后再运行 FT/XT |
| P0 | B1 Relay create/update 对 Execution Fee 封顶 | Router 调 `OrderHandler` 时仍传 `shouldCapMaxExecutionFee=false` | 以 R8-B21 安全负向用例验证，修复前不判安全通过 |
| P0 | 子账户专属 Relay Fee USD cap 生效 | 键已声明但收费路径未读取 | 以 R8-B02 安全负向用例验证，不能拿全局 WNT cap 替代 |
| P1 | 删除/复用设备的权限历史可解释 | `removeSubaccount` 不清该地址的 expiry/max/actionCount 等字段，以后复用同地址可能继承历史值 | 增加地址复用回归；在产品确认前页面必须展示真实状态，不得说“全部数据已删除” |
| P1 | 移动端可完成 setup/renew | 移动端 handler 存在，但对应 modal 未渲染 | 移动 1CT FT 记 `GAP`；Standard 移动旅程另行执行，不得互相替代 |
| P0 | Max 的零值边界必须可解释 | `B≤C+U` 时 Pay/Size Max handler 直接 return，不置灰、不清旧值、不提示；cap floor 命中时形成最小 1.5U 确定性死区 | 以 `C+U−1/= /+1 raw` 和 1.48/1.50/1.500001U 代表值执行 FT；0 结果必须有明确 UI，不得把旧值当 Max |
| P1 | Relay 专用 reserve 只作用于正确模式与 Token | 固定 `1_000_000 raw` 也作用到 Standard；若未来开放非 6 位 pay/fee/collateral token 会产生单位错配 | Standard 作负对照；当前 8/18 位 index token 只测 size 换算；未来 Token 扩展前先改为运行时 decimals |
| P1 | 报价异常和余额不足分开 | 超 25U cap 被折叠成 unavailable；Deposit 等入口只消费 insufficient，loading/unavailable 的 UI 行为与 Increase/Update 不一致 | 逐动作测试 loading/unavailable/cap/insufficient；不得复用错误文案，提交前保持零不可解释副作用 |

### 4.2 `BLOCKED`：实现已具备，但运行依赖不可用

| 范围 | 可判 `BLOCKED` 的条件 | 必须记录的解除条件 |
|---|---|---|
| Relay/1CT FT/XT | 相关 schema、链/地址和 ingress 适配已完成，但 Relay API/worker、Relayer 资金或角色、Order Keeper、Oracle、钱包或 RPC 暂不可用 | 缺失依赖、责任方、目标环境和恢复后要重跑的 Case ID；依赖恢复前不得记 `PASS` |
| Oracle/time 跨域旅程 | `oracle-fork` 或 `time-fork` 未指向 v0.3.2，无法执行该版本的触发、超时或续期边界 | 建立并登记目标版本 manifest/参数快照，完成准入读检 |

产品选择尚未裁决不等于环境阻塞：继续保留在第 5 节，不以 `BLOCKED` 代替产品决定。

## 5. 待产品/安全共同裁决

| 决策 ID | 冲突 | 方案与影响 | 当前临时测试口径 |
|---|---|---|---|
| DEC-TRADE-001 | 历史 localStorage 值 `flash` 仍会走 direct Relay，但 UI 没有对应卡片 | A. 迁到 Standard，最保守但恢复逐笔链上交易；B. 迁到 `1ct`，符合默认产品模式但必须显式 setup | 覆盖 zombie mode，要求页面不得无选中项；不替产品决定迁移目标 |
| DEC-TRADE-002 | 6/10 要求 `isKeeper(msg.sender)`，当前两个 Relay Router 均为 permissionless | A. 恢复合约白名单；B. 明确接受任意 caller 持合法 payload 可提交并收 Relay Fee的威胁模型 | 文档写 CURRENT 为 permissionless；隔离 fork 测任意 caller、fee recipient、重放和余额，不称其有 Keeper ACL |
| DEC-TRADE-003 | 6/10 要求默认只授权 CREATE，UPDATE/CANCEL 手动开放；当前只有统一 `SUBACCOUNT_ORDER_ACTION` | A. 拆 actionType 做最小权限；B. 正式接受 create/update/cancel/batch 整包 Trade Order 权限 | 测试记录统一权限事实，但安全 PASS 等待选择 |
| DEC-TRADE-004 | 旧批准稿 Relay action deadline 推荐 5 分钟且 UI 不超过 10 分钟；CURRENT 为 30 分钟 | 5～10 分钟降低截获窗口；30 分钟减少慢签/网络失败 | 所有执行按 payload 实值测边界；30 分钟只标实现现状，不标批准产品值 |
| DEC-TRADE-005 | 旧批准稿 max fee cap 为 10 USDC、超过 2 USDC 二次确认；CURRENT 签名 cap 为 25 USDC、无该确认 | 决定硬顶、warning 阈值及是否按动作/网络动态化 | 合约只断言 actual ≤ signed max；前端 25 USDC 标实现现状，不写成已批准需求 |
| DEC-TRADE-006 | 4 槽当前实现与“上线只允许 1 槽”的后续讨论并存；同时无 revokeAll | A. 正式接受 4 槽并补管理 UI；B. 下一部署改 1 槽；C. 仅部署期可配置且只允许安全调大 | 当前 v0.3.2 CT 固定断言 4；不把未实施讨论覆盖进本版本 |
| DEC-TRADE-007 | 8/11 标题提出到期前自动重签，7/23 Closed 方案要求只提示、不偷偷续签 | 可选仅提醒、自动打开引导或其他显式交互；浏览器不能替用户静默生成钱包签名 | 保持“少于 3 天仅 Settings 提示，用户主动 renew”，直到新验收标准 Closed |

## 6. 已确认的实现事实，不再沿用旧稿

- Relay 基础设施当前是自建 Relay API/worker，不把 Gelato 或旧 `oracleParams` 写入 v0.3.2 验收步骤。
- Relay task 的 `executed` 只代表 Relay Router 交易 receipt 成功；Market/Limit/Stop/TP/SL 是否成交仍由后续 Order Keeper 与 Oracle 决定。
- 当前 Relay action deadline 约 30 分钟，Permit deadline 约 1 小时，1CT Approval deadline 通常与 90 天 `expiresAt` 相同；三者不可混写。
- 合约入口没有 Relay Keeper ACL。后端服务钱包是正常产品路径，但不是链上权限边界。
- `slot` 当前允许空字符串，合约没有长度/非空校验；若产品要求可读且非空，应由前端与合约约束并另补边界，不能把现状写成“空 slot 会拒绝”。
- `MAX_RELAY_SWAP_WNT_CAP` 是全局单次 native fee cap；不能替代子账户 USD cap，也不能阻止重复小额调用。
- Relay/1CT Max 的两级预留已经裁决：signed `maxFeeAmount` 之外再留 1 USDC。

## 7. 本轮建议先解决的顺序

1. **最高优先：先关闭错误的 Consent/风险承诺。** 在 R8-B02/R8-B21 和权限边界未修复前不开放 1CT；删除“绝不会转移资金”类绝对文案，堵住 Settings 绕过，并完成法务/安全复核。
2. 修复 R8-B02/R8-B21，同时裁决 DEC-TRADE-002/003/005；这些共同决定 Relayer 权限、动作授权面和费用资金边界。
3. 裁决 DEC-TRADE-006，并补齐命名槽查看/覆盖、`removeSlot` 与 `revokeAll`。在这些撤权能力可发现、可操作前，不得把 90 天期限单独当作安全保证。
4. 最后裁决 DEC-TRADE-001/004/007，统一迁移、时效与续期体验。Max 双重预留不再是待决项，只剩作用域和交互实现 GAP。

# v0.3.2 期望差异

本文件把 v0.3.2 合约行为映射回共享用例。详细数据集与整数期望见 [cases/SCN-B32.md](cases/SCN-B32.md)。

| 共享用例 | v0.3.2 覆盖期望 |
|---|---|
| SCN-049 浅流动性极端冲击 | 指数输入在上限前、等于上限、越过上限三点均返回受控 cap，不得因 exponent 越界 revert；守卫 depth=0 / parameter=0 不 panic |
| SCN-050 改善/恶化失衡 | 普通交易允许负 dynamic spread 并给出改善失衡的更优执行价；MIN/MAX 使用 int256 clamp |
| SCN-068 清算与 ADL | Liquidation/ADL 不享受负点差，最终 spread floor=0；清算手续费档位必须按 balanceWasImproved 正确选择 |
| SCN-023/024/032 减仓与输入模式 | USD 减仓换算 ceil 恰好耗尽 token 时归一为完整平仓；多头/空头 floor/ceil 差异与事件、OI、账本一致 |
| SCN-022/024 预计可得与全平 | minOutputAmount 使用 1e30 USD 口径并按输出 token 的 oracle min 价校验；等号通过，高 1 单位拒绝且资金不变 |
| SCN-053 Flash 连续交易 | 产品 UI 的 Flash 指 One-Click/1CT，不等于主钱包逐动作签名的 direct Relay。1CT 完成 consent、approval 及必要 Permit 后，连续 create/update/cancel/close 不再逐笔弹主钱包；每个动作使用唯一 nonce/request，按实际动作递增 action count，Relay fee token 必须等于全局 `COLLATERAL_TOKEN`。CURRENT `slot` schema 未补齐时 1CT FT/XT 记 `GAP` |
| SCN-054 Standard/Flash 切换 | 用户只选择 Standard 与 Flash One-Click/1CT；direct Relay 是内部/遗留技术路径，不显示第三张模式卡。Standard 逐笔由主钱包签交易，1CT 由 session 签动作；切换不改变挂单、仓位、非派生字段或手填金额，不等于撤销 session，也不得自动提交。仍选中的 Max/百分比草稿按新模式重算；Relay Fee 不足切 Standard 后仍须再次点击 |
| SCN-055 consent 版本升级 | Terms/Privacy 属于连接钱包披露；开启 1CT 前另做版本化风险 `personal_sign`，按 owner + consent version 留证。同版本续期不重复签风险 consent，版本变化必须重签；Settings 与 Trade 必须共用同一 readiness gate，不能绕过 consent 先签 approval |
| SCN-056 Cancel All 原子撤单 | Standard 使用链上 multicall；1CT 使用单个 Relay batch、单个 task 和单次 Relay Fee，batch 要么全部成功要么全部回滚。1CT action count 按 batch 中实际撤销动作数增加；session/setup 不满足时阻断，不得静默退成 direct Relay。Market Order 与暂停取消的订单按当前可取消规则过滤 |
| SCN-057 断开与撤销交易密钥 | 断开必须让本设备旧 session key 不再可交易并清理本地敏感状态；`removeSubaccount` 只撤地址授权、不释放命名槽，`removeSlot` 才释放槽。Router ERC-20 allowance 是独立权限，不得随断开文案宣称已撤销；CURRENT 缺少完整 slot 管理和 `revokeAll` UI 时相应 FT 记 `GAP` |
| SCN-058 到期/持久化/多设备 | v0.3.2 前端授权期为 90 天，`maxAllowedCount = onChainActionCount + 1,000,000`，不采用 1 小时隐藏锁，Stay connected 默认开；到期前只提示并由用户显式 renew，不后台静默签名，setup/renew 后不自动下单。合约最多 4 个 `string slot`；90 天只有在命名槽覆盖或 `revokeAll` 可发现且可撤销时才可作为安全方案验收，CURRENT 管理面缺失使 FT 记 `GAP` |
| SCN-059 Relay/Keeper 超时幂等 | direct Relay 与 1CT 用 taskId/nonce/digest 防重复，Standard 用 txHash/orderKey 查链；超时、刷新或连点不得创建第二笔。Relay task `executed` 只表示 Router receipt 成功，Order 是否成交仍须继续跟踪 Order Keeper/Oracle 和最终状态。Standard 撤单 toast 必须从 submitted 更新到 canceled 或 error，终态语义与 Relay 路径一致 |
| SCN-063 移动端核心旅程 | Standard 核心交易与 1CT setup/renew 分开判定；移动端 handler 存在但 setup/renew modal 未渲染时，1CT 移动 FT 记 `GAP`，不得用桌面证据或 Standard smoke 替代。实现后还需覆盖纵横屏、键盘遮挡、拒签、续期、切回 Standard，以及手填字段保持/Max 派生值重算 |
| E2E-CMB-A-006 Standard vs Flash One-Click | 仅比较两个公开产品模式。Standard 为主钱包 `tx.from` → `ExchangeRouter`；1CT 外层 `tx.from` 是 Relayer、动作签名者是 session key、经济账户仍是 owner，目标为 `SubaccountRelayRouter`，不得把子账户/session 写成 `tx.from`。Relay Fee 只在 1CT 腿单独列账；1CT 开仓和全平是两个订单动作，action count 合计应增加 2，而非整条腿只增加 1。CURRENT `slot` schema 缺失时 FT/XT 记 `GAP` |
| SCN-077/078 Funding | Funding 在仓位动作实际应用时逐仓结算，LP 路由、正负方向与 ceil/floor 取整必须同账本守恒 |
| 事件与历史兼容性 | 前端、Indexer 和 SDK 不得依赖已删除的 secondary output / claimable collateral 字段或旧调用入口；应以 v0.3.2 ABI、主输出字段和当前订单状态为准 |

版本专项用例不应反向写入共享 SCN 的通用期望；后续版本若继续沿用，再评估是否提升为共享规则。

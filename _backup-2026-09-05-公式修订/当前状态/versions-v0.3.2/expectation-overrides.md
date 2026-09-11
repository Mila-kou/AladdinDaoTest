# v0.3.2 期望差异

本文件把 v0.3.2 合约行为映射回共享用例。详细数据集与整数期望见 [cases/SCN-B32.md](cases/SCN-B32.md)。

| 共享用例 | v0.3.2 覆盖期望 |
|---|---|
| SCN-049 浅流动性极端冲击 | 指数输入在上限前、等于上限、越过上限三点均返回受控 cap，不得因 exponent 越界 revert；守卫 depth=0 / parameter=0 不 panic |
| SCN-050 改善/恶化失衡 | 普通交易允许负 dynamic spread 并给出改善失衡的更优执行价；MIN/MAX 使用 int256 clamp |
| SCN-068 清算与 ADL | Liquidation/ADL 不享受负点差，最终 spread floor=0；清算手续费档位必须按 balanceWasImproved 正确选择 |
| SCN-023/024/032 减仓与输入模式 | USD 减仓换算 ceil 恰好耗尽 token 时归一为完整平仓；多头/空头 floor/ceil 差异与事件、OI、账本一致 |
| SCN-022/024 预计可得与全平 | minOutputAmount 使用 1e30 USD 口径并按输出 token 的 oracle min 价校验；等号通过，高 1 单位拒绝且资金不变 |
| SCN-053～058 Flash/Relay | Relay fee token 必须等于全局 COLLATERAL_TOKEN；子账户改为最多 4 个槽位；EIP-712 签名包含 slot，旧签名不得继续有效 |
| SCN-077/078 Funding | Funding 在仓位动作实际应用时逐仓结算，LP 路由、正负方向与 ceil/floor 取整必须同账本守恒 |
| 事件与历史兼容性 | 前端、Indexer 和 SDK 不得依赖已删除的 secondary output / claimable collateral 字段或旧调用入口；应以 v0.3.2 ABI、主输出字段和当前订单状态为准 |

版本专项用例不应反向写入共享 SCN 的通用期望；后续版本若继续沿用，再评估是否提升为共享规则。

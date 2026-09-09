# v0.3.2 测试适用性

## 共享回归

| 用例集 | 适用性 | v0.3.2 使用方式 |
|---|---|---|
| SCN-001～080 | 全量适用 | 通用步骤不复制；差异断言见 [expectation-overrides.md](expectation-overrides.md) |
| CMB 手工组合 | 条件适用 | 执行记录明确写 contractRelease: v0.3.2 后才计入本版本 |

## v0.3.2 专项

| 用例集 | 数量 | 入口 |
|---|---:|---|
| SCN-B32-01～08 | 8 | [cases/SCN-B32.md](cases/SCN-B32.md) |
| IT-VAULT-001～003、IT-MARKET-001 | 4 | [cases/IT-VAULT-MARKET.md](cases/IT-VAULT-MARKET.md) |
| v0.3.2 交易与订单矩阵 | 160 | [Trade-测试用例矩阵.md](Trade-测试用例矩阵.md)（部署与交易基线 9 + 市价开仓与市价关仓 47〔市价开仓 30 + 配对市价关仓 17〕+ 市价加仓、市价部分减仓与账本 16 + 限价开仓 16 + 主单取消级联 2 + TP/SL 与清算保护期 20 + 订单类型 16 + 其他跨域 34） |
| 合约单元测试 | 14 | [TestCase/UT/README.md](../../../UT/README.md) |

## 结果继承规则

- 旧版本测试结果只作为历史对照；v0.3.2 必须依据当前功能规则和本版本矩阵独立执行，状态见 [results.md](results.md)。
- 某个 Foundry 单元测试 PASS 只能证明对应内部函数/边界，不能替代 E2E 的部署、页面、事件、Reader 和资金差分。
- oracle-fork、time-fork 或 tx-fork 只有在实际 manifest 指向 v0.3.2 且参数快照匹配时，结果才可登记到本版本。

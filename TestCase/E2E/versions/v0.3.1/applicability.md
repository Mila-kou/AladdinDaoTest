# v0.3.1 测试适用性

## 共享用例

| 用例集 | 适用性 | 说明 |
|---|---|---|
| SCN-001～080 | 适用 | 按共享步骤执行；涉及版本差异的断言以 [expectation-overrides.md](expectation-overrides.md) 为准 |
| E2E-TRD-001～054 | 适用 | 页面原子功能回归底座；必须同时记录实际前端 commit 与 v0.3.1 deployment |
| 手工 CMB 用例 | 条件适用 | manual-cases 中 v1/v2 是用例修订版；只有执行记录明确写 contractRelease: v0.3.1 时才归入本版本 |

## 不适用

- SCN-B32-01～08 是 v0.3.2 变更专项，不属于 v0.3.1 发布验收范围。
- IT-VAULT-001～003、IT-MARKET-001 以 v0.3.2 新行为为目标，不适用于 v0.3.1。
- v0.3.2 的子账户槽位、新 EIP-712 结构、全局 COLLATERAL_TOKEN、减仓 minOutputAmount 与 USD 减仓归一断言不作为 v0.3.1 PASS 条件。

历史 v0.3.1 执行结果见 [results.md](results.md)；不得据此推导其他版本状态。

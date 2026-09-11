# FX100 E2E 合约版本层

共享目录保存稳定用例 ID 与通用设计；本目录保存合约版本适用性、版本期望差异、版本专项用例和执行结果。

## 目录职责

| 内容 | 唯一维护位置 |
|---|---|
| 80 条用户旅程设计（SCN-001～080） | [scenarios](../scenarios/) 与 [SCENARIO-CHECKLIST.md](../SCENARIO-CHECKLIST.md) |
| 54 条 Trade 原子用例设计（E2E-TRD-001～054） | [FX100-Trade页面功能测试用例.md](../FX100-Trade页面功能测试用例.md) 与 [CHECKLIST.md](../CHECKLIST.md) |
| 某合约版本适用范围 | version-name/applicability.md |
| 通用期望在该版本的变化 | version-name/expectation-overrides.md |
| 只属于某版本的专项用例 | version-name/cases/ |
| PASS/FAIL/BLOCKED、证据、执行人和日期 | version-name/results.md 及其链接的结果快照 |

## 已登记版本

| 合约版本 | 入口 | 定位 |
|---|---|---|
| v0.3.1 | [v0.3.1/README.md](v0.3.1/README.md) | 冻结历史适用性和执行结果 |
| v0.3.2 | [v0.3.2/README.md](v0.3.2/README.md) | 当前版本差异、专项设计与独立结果 |

## 规则

1. 共享用例不复制到每个版本；用例 ID、步骤与通用期望只维护一份。
2. 版本结果不能继承。v0.3.1 的 PASS 只能作为 v0.3.2 的回归对照。
3. 执行结果必须记录实际合约 commit、deployment、chain/fork、参数快照与证据位置。
4. manual-cases/v1/v2 中的 v1/v2 是“用例修订版”，不是合约版本；执行时另记 contractRelease。
5. 当前主测版本仍以 [Docs/contract-releases/CURRENT.json](../../../Docs/contract-releases/CURRENT.json) 为事实源。

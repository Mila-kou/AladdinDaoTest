# TestCase/UT — 单元测试用例设计

与 [`TestCase/E2E/`](../E2E/README.md)（用户级场景 SCN）平行的第二条用例主线：**域级/合约内部函数级**的单元测试文档。当前两份 case 都明确绑定 v0.3.2，不作为跨版本共享用例；E2E 的版本适用性和结果入口见 [`E2E/versions/v0.3.2/`](../E2E/versions/v0.3.2/README.md)。

对应的可执行测试代码不放在这里，也**不直接写进 `Github/` 下的合约克隆**，而是维护在本仓库自己的 [`TestCode/unit/`](../../TestCode/unit/README.md)（原因与同步方式见该目录 README）。

## 目录

| 文档 | 覆盖对象 | 版本 | 状态 |
| --- | --- | --- | --- |
| [case/UT-B32-01-DynamicSpreadClamp.md](case/UT-B32-01-DynamicSpreadClamp.md) | `MIN/MAX_DYNAMIC_SPREAD` clamp 边界（新增功能） | v0.3.2 | 11 条，全部 PASS（2026-08-23） |
| [case/UT-R5B02-LiquidationFeeTier.md](case/UT-R5B02-LiquidationFeeTier.md) | 清算可行性判定手续费档位回归（缺陷修复 13880f2） | v0.3.2 | 3 条，全部 PASS（2026-08-23） |

## 与 E2E / 05-重要参数边界场景 的关系

- `Docs/contract-releases/v0.3.2/05-重要参数边界场景.md` 是**先行设计**的用户旅程级边界场景（B32-1~B32-10，38 条），需要真实部署或 fork 环境才能执行。
- 本目录把其中**不依赖链上部署、纯靠合约内部函数直接调用即可复算**的子集（clamp 计算、权限校验、费率档位选取）下沉为 Foundry 单元测试，可以在本机秒级跑完，不等 v0.3.2 部署。
- 两者不是重复关系：05 文档的场景卡片仍是权威的"完整链路+精确期望值"设计来源；本目录的用例编号和期望值推导直接引用 05 文档，只是换了一种更快的执行方式验证同一段计算逻辑。
- 需要真实成交/OI/oracle 环境的数据点（如 B32-1-02/05/06/07/08）**不在本目录重复设计**，仍以 05 文档 + [v0.3.2 SCN-B32 专项](../E2E/versions/v0.3.2/cases/SCN-B32.md)为准。

## 执行记录约定

每条用例的「实际结果」只允许 PASS/FAIL + 执行日期，不允许空断言或占位词。执行方式统一为：`TestCode/unit/README.md` 描述的同步脚本 + `forge test`，原始命令行输出留痕在对应 case 文档或本次改动的 PR 描述里，不在此处重复粘贴全文。

这 14 条 Foundry 结果在 E2E 版本层仅作单元层引用，不得折算为 SCN/TRD PASS；汇总见 [v0.3.2 results](../E2E/versions/v0.3.2/results.md)。

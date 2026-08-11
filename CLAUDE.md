# AladdinDaoTest 工作区

多项目测试工作区，结构：

- `Docs/<项目>/` — 需求文档归档
- `Github/` — 被测源码克隆。**目录命名规范：`<仓库名>@<分支名>`**（分支中的 `/` 换 `-`，如 `fx100-contracts@release-v0.3.1`）；同仓库其他分支用 git worktree 从既有克隆派生，不重复克隆
- `Test/` — 测试主战场

## 测试标准（所有项目必读）

**通用测试标准在 [`Test/standards/`](Test/standards/)**（00 总纲 · 01 用例编写六字段 · 02 单元 · 03 集成 · 04 E2E · 05 有效性门槛 DoD · 06 用例设计方法 · samples/ 三层样本），适用于 Test 下所有项目。每个项目在 `Test/project/<项目名>/profile/` 有项目附录（A 基线环境 / B 域代码表 / C 单元集成约定 / D E2E 账本约定），实例化通用标准。

硬性约定速记：
1. 用例六字段：前置条件 / 测试数据 / 操作步骤 / 核对数据 / 期望结果 / 实际结果；期望值必须附推导过程。
2. 用例 ID：`<UT|IT|E2E>-<域>-<三位序号>`；缺陷 `<项目代号>-BUG-NNN`。
3. 幽灵内容零容忍（05 标准）：无断言的测试不算测试，无证据的勾选不算通过，占位词充数的用例不算用例。
4. 断言以实际实现为准（设计文档与实现冲突时按实现，并回写记录）。
5. 私钥类文件（如 fx100 的 `pk.txt`）严禁读取、引用、提交。

## 当前项目

| 项目 | 基线 | 入口 |
|---|---|---|
| fx100 | 合约 `Github/fx100-contracts@release-v0.3.1`（部署 `base_sepolia_v0.3.1_260729`）· 前端 `Github/fx100-apps@develop` | [`Test/project/fx100/README.md`](Test/project/fx100/README.md) |

fx100 注意：合约 main 分支无 test 目录，禁用；需求文档里 `test-hub/...` 与 `docs/testing-standards` 分支引用全部作废。

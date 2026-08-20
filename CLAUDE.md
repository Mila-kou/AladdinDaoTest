# FX100 工作区

FX100 测试工作区，结构：

- `Docs/` — FX100 文档根目录；版本分析统一放在 `Docs/contract-releases/<version>/`，需求归档放在 `Docs/Gordon-Notion需求文档归档/`
- `Github/` — 被测源码克隆。**目录命名规范：`<仓库名>@<分支名>`**（分支中的 `/` 换 `-`，如 `fx100-contracts@release-v0.3.2`）；同仓库其他分支用 git worktree 从既有克隆派生，不重复克隆
- `TestCase/` — 测试用例文档。fx100 E2E 主入口 `TestCase/E2E/`：80 条 SCN 场景（`scenarios/S01~S08`）+ 总控清单 `SCENARIO-CHECKLIST.md`
- `TestCode/` — E2E 自动化独立工程（Playwright + 链上驱动 + 结果看板），入口 [`TestCode/README.md`](TestCode/README.md)
- `配置文件来自开发/` — 开发交付的环境配置压缩包（含密钥类内容，不读取、不解压）

> 2026-08 起原 `Test/` 目录已移出工作区，归档在 `/Users/milakou/Documents/AladdinDaoTest-claude/`（`standards/` 通用标准 + `project/fx100/` 旧树）。旧树的 .mjs 工具已收编为 `TestCode/tools/fx100-legacy/`；除该收编副本外不要引用归档路径。

## 测试标准（所有项目必读）

通用测试标准（00 总纲 · 01 用例编写六字段 · 02 单元 · 03 集成 · 04 E2E · 05 有效性门槛 DoD · 06 用例设计方法 · samples/ 三层样本）随旧树归档于 `/Users/milakou/Documents/AladdinDaoTest-claude/standards/`。硬性约定不变：

1. 用例六字段：前置条件 / 测试数据 / 操作步骤 / 核对数据 / 期望结果 / 实际结果；期望值必须附推导过程。
2. 用例 ID：E2E 用户级场景用 `SCN-三位序号`（80 条，见 SCENARIO-CHECKLIST）；域级用例 `<UT|IT|E2E>-<域>-<三位序号>`；缺陷 `<项目代号>-BUG-NNN`。
3. 幽灵内容零容忍（05 标准）：无断言的测试不算测试，无证据的勾选不算通过，占位词充数的用例不算用例。
4. 断言以实际实现为准（设计文档与实现冲突时按实现，并回写记录）。
5. 私钥类文件（如 fx100 的 `pk.txt`、keeper 的 `.env`）严禁读取、引用、提交。

## 当前项目

| 项目 | 基线 | 入口 |
|---|---|---|
| fx100 | **主测合约 `Github/fx100-contracts@release-v0.3.2`** · 对比基线 `Github/fx100-contracts@release-v0.3.1` · 前端 `Github/fx100-apps@develop` | 用例 [`TestCase/E2E/README.md`](TestCase/E2E/README.md) · 自动化与看板 [`TestCode/README.md`](TestCode/README.md) |

fx100 注意：

- 合约 main 分支无 test 目录，禁用；需求文档里 `test-hub/...` 与 `docs/testing-standards` 分支引用全部作废。
- 拉取新合约版本后必须执行 `.claude/skills/fx100-contract-release-workflow/SKILL.md`：完成代码变化、部署/升级、功能、参数、重要参数边界场景和测试准入材料后，才能开始该版本系统回归。当前默认目标为 release/v0.3.2。
- 自动化现状（2026-08-11）：SCN-009/010（tx-fork）与 SCN-070（oracle-fork）已完成自动化用例；数据核对层（execution-evidence 对账）改造中，目标是确保核对内容与核对公式正确。
- tx-fork 是 Tenderly 私有 fork，链 ID 为独立的 **99911**（部署基线 Base Sepolia 为 84532）；核对 chainId 以 `TestCode/config/mock-resources.json` 登记为准。

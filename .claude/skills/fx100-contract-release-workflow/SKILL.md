---
name: fx100-contract-release-workflow
description: 固化 FX100 合约新版本拉取后的分析与测试准备流程。Use whenever a contract branch, release, tag, deployment package, or baseline is newly pulled or changed, or the user asks to analyze contract changes, prepare deployment instructions,整理代码功能文档、参数文档、重要参数边界场景、版本测试范围、升级影响或发布验收；尤其适用于 release/v0.3.2 及后续版本。必须产出版本证据、差异报告、部署手册、功能文档、参数目录和边界场景清单后才能进入系统回归。
---

# FX100 合约版本工作流

## 基线

- 当前主测合约：`Github/fx100-contracts@release-v0.3.2`。
- 默认对比基线：上一已验证发布版 `Github/fx100-contracts@release-v0.3.1`。
- 前端：`Github/fx100-apps@develop`；只在核对前端兼容性时纳入。
- 以源码和实际部署产物为准；文档只作线索。

## 强制流程

按顺序执行，使用 [references/deliverables.md](references/deliverables.md) 的内容要求和完成门槛。

1. **冻结版本证据**：确认目录、remote、分支、HEAD、工作树、submodule、对比基线和比较范围。工作树不干净时区分用户改动，不覆盖、不混入版本结论。默认比较上一发布版到当前主测版，禁止只看最近一条 commit。
2. **分析代码变化**：先列 commit、文件和统计，再按模块归类语义变化。每项写清旧/新行为、调用链、状态/事件/错误/ABI/DataStore key 变化、兼容性、风险和测试影响。区分生产源码、部署脚本、测试、文档、依赖和生成物。
3. **整理部署方法**：从仓库真实配置和脚本还原新部署、Proxy/implementation 升级、初始化/迁移、角色授权、配置写入、Oracle/Keeper/前端对接、验证和回滚。不得读取或输出私钥、token、带凭证 RPC。
4. **整理功能文档**：按模块描述职责、入口、主流程、状态变化、事件、错误、角色权限及与前版差异。资金、仓位、费用、Funding、价格、清算、ADL、Relay/Subaccount、Vault 分别说明。
5. **整理参数文档**：从 Keys、Config、DataStore 读写点、部署配置和初始化脚本交叉提取。记录 key/signature、类型、精度、维度、默认/部署值来源、读写者、影响公式、约束、修改风险和验证方法。取不到部署值时标 `待部署确认`，不得用 0 或旧值代替。
6. **整理重要参数边界场景**：覆盖零值、最小非零、阈值前/等于/阈值后、合法最大、越界、符号翻转、组合边界和变更后的存量状态；同时覆盖取整、min/max 选价、精度、权限、开关、Oracle 异常、资金不足和事件自证。映射既有 `SCN-xxx`，没有匹配项时提出新增设计，不伪造结果。
7. **交叉核对并准入测试**：贯通“代码变化 → 部署 → 功能 → 参数 → 边界场景”，每个材料性变化至少有一条测试映射。运行仓库已有检查并记录结果。五类材料齐全且无未解释材料性变化后才标 `READY_FOR_SYSTEM_TEST`，否则标 `NOT_READY`。

## 固定输出位置

每个版本写入 `Docs/contract-releases/<version>/`：

- `00-版本证据.md`
- `01-代码变化分析.md`
- `02-部署与升级手册.md`
- `03-合约功能说明.md`
- `04-参数目录.md`
- `05-重要参数边界场景.md`
- `06-测试影响与准入结论.md`

版本名使用 `v0.3.2` 形式。目录已存在时原位更新并保留证据日期，不创建“最终版2”等副本。

## 使用纪律

- 所有结论附 `文件::函数/符号` 锚点；行号只作辅助。
- “未变化”也要以 diff 范围为证据，不能凭记忆。
- ABI、事件、错误选择器、Storage、初始化器和角色权限变化默认高风险。
- 参数值、公式和测试期望使用整数原始值与精度，不用 JavaScript `Number` 计算资金。
- 不把测试代码中自造的期望值当作合约事实；关键结论至少由源码和另一独立来源交叉确认。
- 不提交部署包、密钥文件、带凭证 RPC、临时扫描文件或系统文件。

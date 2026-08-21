# ContractCodeSummary 目录说明（版本基线与快照标注）

> 基线唯一登记：[`Docs/contract-releases/CURRENT.json`](../../../Docs/contract-releases/CURRENT.json)（人读镜像 `CURRENT.md`）。本目录所有文件**不复述**主测版本号；凡写死的版本数据一律按下表标「@vX.Y.Z 快照」。

| 文件 | 内容 | 版本归属 | 说明 |
|---|---|---|---|
| `FX100-合约配置参数总表.csv` / `.xlsx` | 合约配置参数总表（部署初始化参数 + 链上参数 + 样例） | **@v0.3.1 快照** | CSV 无法加注释行，在此说明：第 8 列「当前/样例原始值」与「参数层级 = 当前链上参数」的 119 行（「来源」列 `链上参数快照 base_sepolia_v0.3.1_260729`）均取自 CURRENT.json `deployments[0].paramsExport`（base-sepolia@v0.3.1 部署导出），**不是** `primary` 版本现值。`primary` 版本参数变化见 [`Docs/contract-releases/v0.3.2/04-参数目录.md`](../../../Docs/contract-releases/v0.3.2/04-参数目录.md)（§2 新增 / §3 语义变化 / §4 移除 / §6 变化清单 11 项），其部署值一律「待部署确认」，不得用本表旧值代替。`.xlsx` 为同表镜像，以 CSV 为准。 |
| `FX100-核心字段计算公式.md` | 全字段计算与展示口径（合约 + 页面） | @v0.3.1 快照（`Github/fx100-contracts@release-v0.3.1` @d9a7fd2） | 权威性与来源优先级已改为引用 CURRENT.json `primary`；§22 差异表为快照，按 `primary` 复核时「负 Dynamic Spread」行已在 v0.3.2 合入需重判。 |
| `FX100-项目模块与资金方向总结.md` | 模块、测试动作与资金核对数据 | @v0.3.1 快照（同上） | 「v0.3.1 特别约定」段保留，`primary` 沿用与否待复核（v0.3.2 减仓输出结构有简化）。 |

## 维护约定

1. 切换 CURRENT.json `primary` 时：本目录文件不自动失效，但所有「@v0.3.1 快照」标注的数据在新版本部署确认前只能作对比基线，不能作断言期望值。
2. 重新导出参数总表（`TestCode/tools/config-dump/dump-config.mjs` 生成 `TestCase/project/fx100/config/<network>_<version>_<date>.params.*`）后，需同步更新 CSV「来源」列与本表「版本归属」，并把旧版本整表归档为快照文件，不得原地覆盖后仍标旧版本。
3. 全工作区版本引用校验：在 `TestCode/` 执行 `npm run baseline:lint`；带「@vX.Y.Z 快照」标注的行放行。

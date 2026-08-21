# FX100 当前测试基线（单一事实源）

> 机器可读版：[`CURRENT.json`](CURRENT.json)。**切换测试版本只改 `CURRENT.json`**，然后在 `TestCode/` 执行 `npm run baseline:lint` 扫描全工作区过期引用。本文件只是 JSON 的人读镜像，不要在别处复述版本号。

| 项 | 值（随 CURRENT.json 同步） |
|---|---|
| 主测合约 | `primary`：v0.3.2 · `Github/fx100-contracts@release-v0.3.2` · HEAD 13880f2 · 交付物 `Docs/contract-releases/v0.3.2/` · 准入 **NOT_READY** |
| 对比基线 | `comparison`：v0.3.1 · `Github/fx100-contracts@release-v0.3.1` · HEAD d9a7fd2 |
| 前端 | `Github/fx100-apps@develop` |
| 已知部署 | `base-sepolia@v0.3.1`（84532，参数导出 `TestCase/project/fx100/config/base_sepolia_v0.3.1_260729.params.json`）；**v0.3.2 无部署** |
| 测试环境 | tx-fork 99911 / oracle-fork 99912（均 fork 自 base-sepolia@v0.3.1）；time-fork 99913 **待手建** |
| 排除项 | `Github/fx100-contracts@soso-test`（暂不纳入） |

## 约定

1. **引用而不复述**：TestCase/TestCode/Docs 里写「基线」「主测」「CURRENT」时一律指向本登记（`见 Docs/contract-releases/CURRENT.json`），不要写死 `release/v0.3.x`。
2. **快照要标注**：确实是某版本下的数据（参数总表、部署参数导出、历史用例账本）写成「@v0.3.1 快照」并说明来源，lint 对带此标注的行放行。
3. **两个「版本」分清**：`primary.version` 是*目标*主测版本；TestCode 批次的 `release` 是*环境实际部署*版本（来自 `environments.<env>.forkOf` → `deployments[].releaseLabel`）。两者不一致时看板/批次必须显式标注「环境基线 ≠ 目标基线」，这类批次不充当目标版本的回归材料。
4. **变更记录**：每次改 CURRENT.json 在 `history` 追加一行。

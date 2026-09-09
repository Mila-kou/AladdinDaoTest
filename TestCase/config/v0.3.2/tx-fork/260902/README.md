# tx-fork v0.3.2 参数快照

> `tx-fork-v0.3.2-260902` / chainId `99911` / 参数 block `46282993` / 合约 `release/v0.3.2` @ `13880f2416918f4fed3fea86d7f1023084a3ce0d`。

| 文件 | 内容 |
| --- | --- |
| `parameters.json` | 全量 1,969 条探测结果，含 124 条已设置值和 1,845 条未设置值 |
| `parameters-by-module.csv` | 124 条已设置值的可机读镜像 |
| `roles.json` | 角色成员快照 |
| `tokens.json` | Token 元数据快照 |
| `deployed-addresses.json` | ignition 部署地址底本 |
| `ignition/journal.jsonl` | Ignition 执行记录（deployment-id `tx-fork-v032-260902r3`，只含 tx/区块哈希，无密钥），2026-09-02 自合约 worktree 归档 |
| `ignition/fx100.fork.tx-fork.json` | 本次 Ignition 部署使用的参数文件 |
| `configure-inputs/` | 三个 configure 脚本的输入：`general.sample.json`、`market.sample.json`（双市场）、`oracle.fork.tx-fork.json`（仅含公开 feedId）、`shared_market.sample.json` |
| `compile.log` | 2026-09-02 在 HEAD `13880f2` 执行 `npm run compile` 的记录（Nothing to compile，退出码 0；solc 0.8.29 / optimizer 200 / viaIR，见 Ignition `build-info`） |

> 未归档：`hardhat.fork.config.ts`（含账户/密钥装配逻辑，属于本机生成文件，不入库）。Ignition 的 `artifacts/`、`build-info/` 仍在合约 worktree `ignition/deployments/tx-fork-v032-260902r3/`，切换版本前如需保留请另行拷贝。

本目录保存“某次部署在某个区块”的初始化配置和参数值；合约级参数定义和变化说明见 [`ContractCodeSummary/v0.3.2`](../../../../E2E/ContractCodeSummary/v0.3.2/README.md)。

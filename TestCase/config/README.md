# FX100 参数快照索引

本目录按“合约版本 / 环境 / 部署快照”三层归档初始化配置和链上参数。

| 合约版本 | 环境 | 部署快照 | 状态 |
| --- | --- | --- | --- |
| v0.3.1 | `base-sepolia` | [`260729`](./v0.3.1/base-sepolia/260729/README.md) | Base Sepolia 84532 正式快照 |
| v0.3.1 | `tx-fork` | [`260812`](./v0.3.1/tx-fork/260812/README.md) | 源自 260729 部署的 Fork 历史快照 |
| v0.3.2 | `tx-fork` | [`260902`](./v0.3.2/tx-fork/260902/README.md) | 当前 tx-fork 快照 |

规则：

1. 版本层隔离合约参数模型，环境层隔离网络，部署快照层隔离地址、区块、初始化配置和实际值。
2. 每个快照必须记录 release/commit、deployment ID、chainId、blockNumber 与生成时间。
3. 原始 JSON 是完整证据；CSV/Markdown 是便于阅读和差异比较的派生文件。
4. 新快照不得覆盖旧部署目录。
5. 环境目录必须与 `parameters.json.meta` 的实际 RPC / chainId 一致；源 deployment 名称另记在快照 README，不得用它替代采集环境。

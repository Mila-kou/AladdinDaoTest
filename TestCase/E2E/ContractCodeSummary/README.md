# FX100 ContractCodeSummary 版本索引

> 当前主测合约版本仅由 [`Docs/contract-releases/CURRENT.json`](../../../Docs/contract-releases/CURRENT.json) 登记。本目录只保存绑定到精确合约 commit 的不可变版本快照，不在根目录复述“当前版本”。

| 版本 | 合约 commit | 内容 | 部署快照 |
|---|---|---|---|
| [`v0.3.1`](v0.3.1/README.md) | `d9a7fd2f23705c0bcfe44eaa2f40d9d5c170aaa0` | 原始全字段公式、模块/资金方向、参数总表 | Base Sepolia / tx-fork 历史快照 |
| [`v0.3.2`](v0.3.2/README.md) | `13880f2416918f4fed3fea86d7f1023084a3ce0d` | 重新核对的字段公式、模块/资金方向、参数定义目录 | tx-fork `tx-fork-v0.3.2-260902` |

## 使用规则

1. 公式和模块文档按合约版本保存完整快照，不在旧版文件上覆盖更新。
2. “参数定义”属于合约版本；“链上参数值”属于某次部署，必须同时标记网络、deployment ID、区块和参数快照。
3. CSV 是参数表的可机读来源，XLSX 是审阅镜像；两者必须由同一批数据生成。
4. 每次切换 `CURRENT.json` 后，运行 `TestCode` 中的基线校验，但不改写已归档版本。

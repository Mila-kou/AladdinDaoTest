# ContractCodeSummary v0.3.1 快照说明

> 快照坐标：`release/v0.3.1` @ `d9a7fd2f23705c0bcfe44eaa2f40d9d5c170aaa0`。当前主测基线另见 [`Docs/contract-releases/CURRENT.json`](../../../../Docs/contract-releases/CURRENT.json)；切换主测版本不改写本快照。

| 文件 | 内容 | 版本归属 | 说明 |
|---|---|---|---|
| `FX100-合约配置参数总表.csv` / `.xlsx` | 合约配置参数总表（部署初始化参数 + 链上参数 + 样例） | **@v0.3.1 快照** | 第 8 列中「参数层级 = 当前链上参数」的 119 行来自原标签 `base_sepolia_v0.3.1_260729`；其机读 `meta` 显示实际导出环境为 tx-fork 99911 / block 45389192，不得视为 Base Sepolia 84532 同区块实值。`.xlsx` 为同表镜像，以 CSV 为准。 |
| `FX100-核心字段计算公式.md` | 全字段计算与展示口径（合约 + 页面） | @v0.3.1 快照（`Github/fx100-contracts@release-v0.3.1` @d9a7fd2） | 保留归档时对 `CURRENT.json primary` 的提示；用于 v0.3.1 断言时以本行精确 commit 为准，v0.3.2 断言改用平级版本目录。 |
| `FX100-项目模块与资金方向总结.md` | 模块、测试动作与资金核对数据 | @v0.3.1 快照（同上） | 「v0.3.1 特别约定」段保留，`primary` 沿用与否待复核（v0.3.2 减仓输出结构有简化）。 |

## 维护约定

1. 本目录内容只用于 v0.3.1 历史对照，不得作为 v0.3.2 断言期望值。
2. 参数总表中 119 行“当前链上参数”的网络、区块、合约地址和生成时间，以 `TestCase/config/v0.3.1/tx-fork/260812/parameters.json` 机读快照为准；Base Sepolia 真链参数另见 `TestCase/config/v0.3.1/base-sepolia/260729/`。
3. 如需更正历史错误，只允许增加勘误记录，不静默改写原始执行结论。

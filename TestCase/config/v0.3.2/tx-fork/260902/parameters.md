# tx-fork v0.3.2 参数快照摘要

| 字段 | 值 |
| --- | --- |
| deployment | `tx-fork-v0.3.2-260902` |
| release | `release/v0.3.2` @ `13880f2416918f4fed3fea86d7f1023084a3ce0d` |
| chainId | `99911` |
| 参数块高 | `46282993` |
| 生成时间 | `2026-09-02T07:47:33.483Z` |
| DataStore | `0x4741A9C9F0310625C0C68997ACdce43Ab55604b8` |
| 探测结果 | 1,969 条；已设置 124，未设置 1,845，错误 0 |

## 市场与抵押品

| marketIndex | 市场 | indexToken | collateralToken | vault |
| ---: | --- | --- | --- | --- |
| 1 | MOCK-BTC-USD | `0x0555E30da8f98308EdB960aa94C0Db47230d2B9c` | `0xF300bBfB89106F54794aab6f7554ECfdAf32e154` (Mock USDC, 6 decimals) | `0x46Fb4f1eeBf811A59dcf6E6343aC5be36122DdE8` |
| 2 | ETH-USD | `0x4200000000000000000000000000000000000006` (WETH, 18 decimals) | `0xF300bBfB89106F54794aab6f7554ECfdAf32e154` (Mock USDC, 6 decimals) | `0x46Fb4f1eeBf811A59dcf6E6343aC5be36122DdE8` |

v0.3.2 的 `COLLATERAL_TOKEN` 是全局配置，不再从每市场旧槽位读取。参数探测文件中早期根据旧 market-prop 推导出的 `collateralTokenSymbol=UNKNOWN` 不是部署真值；本表已按 deployment manifest 和全局 `COLLATERAL_TOKEN` 校正为 Mock USDC。

## 文件口径

- [`parameters.json`](./parameters.json)：全量探测证据，包含未设置键。
- [`parameters-by-module.csv`](./parameters-by-module.csv)：124 条已设置值，用于机读差异比较。
- [`roles.json`](./roles.json) / [`tokens.json`](./tokens.json) / [`deployed-addresses.json`](./deployed-addresses.json)：角色、Token 元数据和部署地址侧证。
- 参数定义、版本变化和审阅工作簿见 [`ContractCodeSummary/v0.3.2`](../../../../E2E/ContractCodeSummary/v0.3.2/README.md)。

本文只是摘要，冲突时以 `parameters.json` 的区块快照和 deployment manifest 为准。

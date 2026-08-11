# ABI 准入规则

本目录后续存放固定版本 ABI，不在运行时从浏览器或远端下载。

首批需要：

- `ExchangeRouter.json`
- `Reader.json`
- `DataStore.json`
- `RoleStore.json`
- `Config.json`
- `Oracle.json`
- `OrderHandler.json`
- `LiquidationHandler.json`
- `AdlHandler.json`
- `EventEmitter.json`
- `ERC20.json`
- `MockOracle.json`（Mock 方案确定后）

每个 ABI 必须能追溯到 deployment manifest 的 release/commit。Proxy 合约同时记录 Proxy 地址和 implementation 版本，doctor 后续增加 selector/codehash 校验。

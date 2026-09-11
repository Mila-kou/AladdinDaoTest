# ABI 接入现状与准入规则

## 现状（2026-08-11 按实际实现回写）

本目录当前**不存放 ABI 文件**。ABI 统一来自 deployment manifest 指向的合约部署产物：

- `config/deployments/base-sepolia-v0.3.1-260729.json` 的 `source.abiDirectory`
  → `../Github/fx100-contracts@release-v0.3.1/base_sepolia_v0.3.1_260729/abi/`，
  由 manifest 的 `abiFiles` 做名称映射；
- SCN-070 runner 的 `loadAbi()`（`src/scenarios/scn-070-runner.ts`）走此通道，是标准接法。

## 已知欠账（用例迁移放量前需归一）

1. **两套地址/ABI 通道并存**：SCN-009/010 runner 仍经 `tools/fx100-legacy` 的
   `deployment.mjs` 直读部署产物 `deployed_addresses.json` + cast 签名字符串，
   未走 manifest。归一方向：统一到 manifest + viem（以 SCN-070 为范本）。
2. 原计划"仓内固定版本 ABI + doctor 增加 selector/codehash 校验"未落地。

## 若后续把 ABI 固化进本目录

- 每个 ABI 必须能追溯到 deployment manifest 的 release/commit；
- Proxy 合约同时记录 Proxy 地址和 implementation 版本；
- 不在运行时从浏览器或远端下载。

首批范围参考（12 个）：`ExchangeRouter` / `Reader` / `DataStore` / `RoleStore` /
`Config` / `Oracle` / `OrderHandler` / `LiquidationHandler` / `AdlHandler` /
`EventEmitter` / `ERC20` / `MockOracle`。

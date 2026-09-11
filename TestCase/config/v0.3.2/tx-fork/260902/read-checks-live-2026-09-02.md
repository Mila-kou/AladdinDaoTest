# tx-fork@v0.3.2 在线读检记录（02 §18.1 第 5、6 项）

> 执行：2026-09-02，tx-fork（chainId 99911）block `46283222`，deployment `tx-fork-v0.3.2-260902`，合约 `release/v0.3.2` @ `13880f2`。
> 方式：临时 tsx 脚本经 TestCode 运行时配置读取 RPC（脚本已删除，未入库；输出中不含 RPC URL 与任何密钥）。
> 期望值来源：`src/router/relay/RelayUtils.sol` 的 `DOMAIN_SEPARATOR_TYPEHASH` / `DOMAIN_SEPARATOR_NAME_HASH("Fx100RelayRouter")` / `DOMAIN_SEPARATOR_VERSION_HASH("1")`，按 `keccak256(abi.encode(typehash, nameHash, versionHash, chainId, verifyingContract))` 本地计算；`Reader.getSubaccountSlots` 的 4 槽结构来源 `src/reader/Reader.sol::getSubaccountSlots`（`MAX_SUBACCOUNT_SLOTS = 4`）。

| # | 检查 | 目标 | 实际 | 期望 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 5a | `getDomainSeparator()` | RelayRouter `0xb25e3a0da2d4654144222800D639d0D17D001186` | `0x3b4f029765c5c488a8e667fc66f270183fd09363102318815063816f28a91ea7` | 同左（本地计算） | PASS |
| 5b | `getDomainSeparator()` | SubaccountRelayRouter `0x1C038C1D34Ac612D408A60CeF38f4f3622CeE8a0` | `0x98183c16d8dd96f49ee9830d74ecd4cb9d88f3d4c41352f52339ea25e38a8f90` | 同左（本地计算） | PASS |
| 6 | `Reader.getSubaccountSlots(dataStore, 测试账户)` | Reader `0x575c97e7991a782E1D5B91F18e3D36002E9c62A3`，账户 `0x2fd6F79c404B17d68FDc111f8EF8C93891682624`（SCN-009 专属 Trader，公开地址） | 长度 4，每槽 `{slot:"", subaccount:0x0, isActive:false}` | 4 槽结构，未授权账户全空 | PASS |

说明：5a/5b 证明 v0.3.2 Relay 的 EIP-712 域（name `Fx100RelayRouter`、version `1`、chainId 99911）与合约源码一致，签名服务按同一常量出签即可对齐；6 证明 Reader 槽位接口在部署上可用且默认态为空。第 1～4、7 项为离线核对，见同目录 `read-checks-offline-2026-09-02.md`。

---
project: fx100
layer: integration
domains: [VAULT, MARKET]
title: v0.3.2 Vault 提款校验与建市 COLLATERAL_TOKEN 校验（域级用例）
cases: 4
status: draft
created: 2026-08-21
---

# IT-v0.3.2-VAULT-MARKET：Vault 提款到账校验（R4-B01）与建市 COLLATERAL_TOKEN 校验

> **来源与定位**：2026-08-21 收编自 `Docs/contract-releases/v0.3.2/05-重要参数边界场景.md` 组 8（卡片 B32-8-01/02）与组 3（卡片 B32-3-01/02/04），对应 `06-测试影响与准入结论.md` §1.2 G6 / §5 B-1 的「IT-VAULT-001～003、IT-MARKET-001 落 TestCase 域级目录」裁决。四条均为**非用户旅程**（Vault/Strategy 资金路径、建市与键写入权限），按工作区域级用例编号 `IT-<域>-<三位序号>` 登记，不进入 `SCENARIO-CHECKLIST.md` 的 80 条用户旅程计数；E2E 冒烟如需挂靠，归 S06 异常恢复组（05 §1.4）。
>
> **基线**：文件名中的 `v0.3.2` 指交付物目录 `Docs/contract-releases/v0.3.2/`；当前主测/对比/环境登记一律以 `Docs/contract-releases/CURRENT.json` 为准，本文不复述版本号。卡片内整数期望值为 **@v0.3.2 快照**（按 05 受控 fixture 推导，锚点为 `Github/fx100-contracts@release-v0.3.2` 源码）；实测按部署真值以同公式重算（05 §12-2）。
>
> **数值纪律**：资金一律使用整数原始值 + 精度（USDC 6 位）；执行状态与环境缺口统一记录在 [../results.md](../results.md)。
>
> **锚点约定**：「文件::函数」路径相对合约仓根。

## 0. 总表

| ID | 优先级 | 域 | 来源卡片 | 环境能力 | 一句话目标 | 结果入口 |
|---|---|---|---|---|---|---|
| IT-VAULT-001 | P0 | VAULT | B32-8-01 | tx-fork（或 Foundry fork 集成）+ 可编程 Strategy mock（可指定实际转账额） | Strategy 实际到账 等于 / 少 1 / 多 1 三点，双向不等式校验 | [results.md](../results.md) |
| IT-VAULT-002 | P0 | VAULT | B32-8-02 a | 同上 | 零闲置：全额 shortage 经 Strategy 校验路径到账 | [results.md](../results.md) |
| IT-VAULT-003 | P1 | VAULT | B32-8-02 b | tx-fork | 足额闲置：直接转账，Strategy 不被调用 | [results.md](../results.md) |
| IT-MARKET-001 | P0 | MARKET | B32-3-01 a、B32-3-02、B32-3-04 | tx-fork（CONTROLLER 可直写 DataStore；CONFIG_KEEPER / MARKET_KEEPER 角色可控） | 建市对全局 COLLATERAL_TOKEN 的零值 / 组合约束 / 写入权限三面 | [results.md](../results.md) |

关联：组合场景 B32-5-04（LP 付资金费且 Vault 闲置不足）与 IT-VAULT-001 同链路，其用户侧断言并入 S08 SCN-078 扩展数据集；Relay fee token 三态（B32-3-03）与未配置时 Relay 关断（B32-3-01 b）属用户旅程，归 [SCN-B32-03](SCN-B32.md)。

---

## 1. IT-VAULT-001 Strategy 实际到账三点（等于 / 少 1 / 多 1）

| 字段 | 内容 |
|---|---|
| 来源 | 05 卡片 B32-8-01；06 矩阵 R11（`test/vault/VaultBase.t.sol` forge 已通过，fork 集成待编写） |
| 环境能力 | tx-fork + 可编程 Strategy mock（可指定向 receiver 的实际转账额）；或 Foundry fork 集成 |
| 前置条件 | v0.3.2 合约就绪；LP Vault 合约内 USDC 闲置余额 = 100000000（100 USDC）；Strategy 持有充足资产；发起提款 assets = 150000000（150 USDC）→ shortage = 150000000 − 100000000 = 50000000 |
| 测试数据 | Strategy 实际向 receiver 转账三点（每点独立快照）：P1 = 50000000（精确等于 shortage）；P2 = 49999999（少 1 个最小单位）；P3 = 50000001（多 1 个最小单位） |
| 操作步骤 | 每点：1. 配置 mock 实际转账额；2. 触发提款（`IVault.transferOut` / withdraw 路径，落到 `_withdrawAssets`）；3. 记录 receiver 余额差、Vault 闲置余额、revert 选择器与参数 |
| 核对数据 | receiver 总到账；Strategy `withdraw` 调用参数 (asset, 50000000, receiver)；revert 选择器与两个参数；revert 后 Vault 闲置余额是否回到 100000000（先行转账是否回滚） |
| 期望结果 | 推导（`src/vault/VaultBase.sol::_withdrawAssets`）：balance(100000000) < assets(150000000) → 先 `safeTransfer(receiver, 100000000)`，记 receiverBalanceBefore，调 `IStrategy.withdraw(asset, 50000000, receiver)`，receivedAssets = balanceAfter − balanceBefore，判 `receivedAssets != shortage` 即 revert。**P1 成功，receiver 共到账 150000000（= 100000000 闲置 + 50000000 Strategy）；P2 revert `ErrorStrategyWithdrawalMismatch(50000000, 49999999)`；P3 同样 revert `ErrorStrategyWithdrawalMismatch(50000000, 50000001)`**——校验是双向不等式（!=），多转也拒绝（防 fee-on-transfer / 错账实现）。P2/P3 整笔 revert，先行转账同交易内回滚，receiver 余额不变、Vault 闲置仍 100000000。v0.3.1 对照：无该校验，P2 账面成功而用户实际少收 1 单位（01 §9） |
| 结果记录 | 见 [results.md](../results.md) |

## 2. IT-VAULT-002 零闲置：全额 shortage 经 Strategy 校验路径

| 字段 | 内容 |
|---|---|
| 来源 | 05 卡片 B32-8-02 数据集 a |
| 环境能力 | 同 IT-VAULT-001 |
| 前置条件 | Vault 闲置余额 = 0；Strategy 持有充足资产并配置为精确转账 |
| 测试数据 | assets = 150000000；Strategy 实际转 150000000（精确） |
| 操作步骤 | 1. 置 Vault 闲置为 0；2. 触发提款 150000000；3. 记录 Strategy 是否被调用、调用金额、receiver 到账 |
| 核对数据 | Strategy `withdraw` 调用次数与金额；receiver 到账；无多余 `safeTransfer(receiver, 0)` 转账事件 |
| 期望结果 | `_withdrawAssets` 首个 if/else：`balance != 0` 分支不成立 → **跳过先行转账（0 不转），shortage = 全额 150000000**，经 Strategy 校验路径（同 IT-VAULT-001 的 receivedAssets == shortage 判定）到账；**receiver 到账 150000000，Strategy `withdraw(asset, 150000000, receiver)` 被调用一次**。零值维度：balance = 0 是 shortage 路径的极值形态（05 §1.3 零值行） |
| 结果记录 | 见 [results.md](../results.md) |

## 3. IT-VAULT-003 足额闲置：直接转账、Strategy 不被调用

| 字段 | 内容 |
|---|---|
| 来源 | 05 卡片 B32-8-02 数据集 b |
| 环境能力 | tx-fork（无需 Strategy mock 指定转账额，只需可观测其是否被调用） |
| 前置条件 | Vault 闲置余额 = 200000000（200 USDC）≥ assets |
| 测试数据 | assets = 150000000 |
| 操作步骤 | 1. 触发提款 150000000；2. 记录 receiver 到账、Vault 闲置余额、Strategy 调用情况 |
| 核对数据 | receiver 到账；Vault 闲置余额差；Strategy `withdraw` 调用次数 |
| 期望结果 | `_withdrawAssets` 走 `balance >= assets` 分支：**直接 `safeTransfer(receiver, 150000000)`，Strategy 不被调用**（无差额校验开销）；Vault 闲置余额 200000000 → 50000000；receiver 到账 150000000 |
| 结果记录 | 见 [results.md](../results.md) |

## 4. IT-MARKET-001 建市对全局 COLLATERAL_TOKEN 的零值 / 组合约束 / 写入权限

> 数据集编号沿用 05 卡片原编号：① = B32-3-01 a（零值）、② = B32-3-02（组合约束）、④ = B32-3-04（写入权限）；③（Relay feeToken 三态，B32-3-03）为用户旅程，归 SCN-B32-03，不在本文。

| 字段 | 内容 |
|---|---|
| 来源 | 05 卡片 B32-3-01 a、B32-3-02、B32-3-04；06 矩阵 R4（`RelayCreateOrder.t.sol`/`SubaccountRelayCreateOrder.t.sol` forge 已覆盖；E2E 链路与部署读值仍需覆盖） |
| 环境能力 | tx-fork：CONTROLLER（C1）可直写 DataStore；K1 持 CONFIG_KEEPER；MARKET_KEEPER 可调 `createMarket`；可部署/清除 `COLLATERAL_TOKEN` 键 |
| 前置条件 | ① `DataStore.getAddress(FX100Keys.COLLATERAL_TOKEN)` = address(0)（未执行 ignition `SetCollateralToken` 步骤，`ignition/modules/Fx100Role.ts`）；② C1 将该键直写为非 USDC 的测试代币地址 T，vault.asset() = USDC；④ K1 持 CONFIG_KEEPER、C1 持 CONTROLLER，键值可回写 |
| 测试数据 | ① MARKET_KEEPER 调 `createMarket(indexToken)`；② 同调 `createMarket(indexToken)`；④ a) K1 调 `Config.setAddress(COLLATERAL_TOKEN, "", usdc)`，b) C1 调 `DataStore.setAddress(FX100Keys.COLLATERAL_TOKEN, usdc)` |
| 操作步骤 | ① 1. 只读确认键值为 0 地址；2. 调 createMarket；3. 记录 revert。② 1. C1 直写 T；2. 调 createMarket；3. 记录 revert；4. 恢复 USDC。④ 1. 执行 a 记录 revert；2. 执行 b；3. `getAddress` 读回 |
| 核对数据 | revert 选择器与参数（含参数顺序）；④ b 的读回值 |
| 期望结果 | **① revert `FxErrors.EmptyToken()`**（`src/market/MarketFactory.sol::createMarket` 首个校验 `collateralToken == address(0)`；语义上「未配置 = 建市关断」，零值即全局开关；v0.3.1 对照：无全局键，建市取 `vault.asset()`）。**② revert `FxErrors.InvalidCollateralTokenForVault(T, USDC)`**（`createMarket` 的 `collateralToken != vaultAsset` 分支，参数顺序 (collateralToken, vaultAsset)）。**④ a) revert `FxErrors.InvalidBaseKey(COLLATERAL_TOKEN)`**——该键不在 `src/config/Config.sol::_initAllowedBaseKeys` 白名单，`_validateKey` 拒绝（04 §2.3 写入权限行）；**b) 成功，`getAddress` 返回 USDC**（`src/data/DataStore.sol` CONTROLLER 直写口径）。结论：该键只能走部署步骤 / CONTROLLER，运营期误改风险低但漏配风险高（联动 SCN-B32-03 ① 与 06 §5 A-2 部署核对必核项） |
| 结果记录 | 见 [results.md](../results.md) |

---

## 5. 执行环境要求

1. 执行前以 `Docs/contract-releases/CURRENT.json` 和实际 deployment manifest 确认环境确为 v0.3.2；IT-VAULT-001/002 另需可编程 Strategy mock（06 矩阵 R11「能力待建」）。
2. 执行载体未定：Foundry fork 集成（合约仓 `test/vault/VaultBase.t.sol` 已有同类断言，可扩展）或 TestCode 链上驱动二选一，定稿后在本文「环境能力」列回写。
3. 本文不登记用户旅程证据（截图/页面），PASS 证据为 tx hash + 区块号 + revert 解码 + Reader/DataStore 读值。

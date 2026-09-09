# FX100 Express Mode：架构分析 · 前端指南 · 产品风控 · 测试规格（2026-06-10）

> Notion 原文：[FX100 Express Mode：架构分析 · 前端指南 · 产品风控 · 测试规格（2026-06-10）](https://app.notion.com/p/FX100-Express-Mode-2026-06-10-37c3d7873f2c81909f5af4f06a81cef9)  
> 本地归档：2026-09-06  
> 版本归属：v0.2.1（归档于 V0.3.1 及以前）

> **日期**：2026-06-10   **版本**：v0.2.1   **状态**：已批准；EFS-H 组 + RC-11 为 B1 合约改造后待激活 vm.skip（2026-06-15 决策）   **分支**：docs/testing-standards

---

## 目录

1. [Express Mode 概述](#1-express-mode-概述)

1. [FX100 vs GMX 架构深度对比](#2-fx100-vs-gmx-架构深度对比)

1. [Relay 策略分析与推荐](#3-relay-策略分析与推荐)

1. [前端开发指南（viem v2 + wagmi）](#4-前端开发指南)

1. [产品风控策略与默认参数](#5-产品风控策略与默认参数)

1. [测试规格](#6-测试规格)

1. [待实施：Express 执行费改造（B1）](#7-待实施express-执行费改造b1)

---

## 1. Express Mode 概述

Express Mode（无 Gas 交易模式）允许用户用 ERC20 代币（如 USDC）支付链上手续费，完全跳过 ETH/原生代币。用户签署 EIP-712 离线消息，由 Keeper（中继节点）代为提交链上交易。

### 1.1 核心价值

- **用户体验**：无需持有 ETH；钱包授权一次，后续操作无感知

- **子账户委托**：交易机器人或策略账户可被授权代替主账户操作，无需暴露主私钥

- **批量操作**：单次签名执行多个订单（创建 + 更新 + 取消）

### 1.2 关键合约文件

```
src/router/relay/
├── IRelayUtils.sol          # 数据结构（RelayParams, FeeParams, TokenPermit）
├── RelayUtils.sol           # EIP-712 TypeHash 常量 + 签名验证逻辑
├── BaseRelayRouter.sol      # withRelay modifier, _payRelayFee, _handleTokenPermits
├── RelayRouter.sol          # 普通用户入口（createOrder/updateOrder/cancelOrder/batch）
└── SubaccountRelayRouter.sol # 子账户入口（双签验证体系）
```

---

## 2. FX100 vs GMX 架构深度对比

### 2.1 设计哲学

| 维度 | GMX Express Mode | FX100 Express Mode |

| 命名体系 | `GelatoRelayRouter` / `GELATO_*` | `RelayRouter` / `RELAY_*`（平台无关） |

| 基础设施依赖 | 强绑定 Gelato 合约地址 | 任意 keeper 可调用（`isKeeper` 白名单） |

| 费用模式 | 两种：链上追加 / 预充池 | 单一：链上精确计算，ERC20 直扣 |

| 功能熔断 | 无 | `gaslessFeatureDisabledKey`（治理可关闭） |

| 费用豁免 | 无 | `isRelayFeeExcludedKey(keeper)` 可豁免特定 keeper |

### 2.2 签名架构对比

**GMX：Gelato 中心化路径**

```
用户签名 ──EIP-712──► SDK ──► Gelato SDK ──► Gelato 节点 ──► GelatoRelayBase
                                                                 ↓
                                              验证 msg.sender == GelatoRelay 合约地址
```

**FX100：Keeper 开放路径**

```
用户签名 ──EIP-712──► SDK ──► 任意 Keeper ──► RelayRouter / SubaccountRelayRouter
                                                 ↓
                              验证 isKeeper(msg.sender) == true（白名单）
```

FX100 的关键设计：`withRelay` modifier 不检查 `msg.sender` 是否为某个固定地址，只验证 `isKeeper(msg.sender)`。这使任意经过白名单注册的节点都能作为中继，包括自建 keeper 或 Gelato 节点。

### 2.3 withRelay Modifier 执行流

```
// BaseRelayRouter.sol:42
modifier withRelay(IRelayUtils.RelayParams calldata relayParams, address account) {
    uint256 startingGas = gasleft();                              // 1. 记录起始 gas
    FeatureUtils.validateFeature(dataStore, gaslessFeatureDisabledKey);  // 2. 功能开关检查
    oracle.setPrices(relayParams.oracleParams);                   // 3. 设置 oracle 价格
    _handleTokenPermits(account, relayParams.tokenPermits);       // 4. ERC-2612 Permit
    _;                                                            // 5. 核心业务逻辑
    _payRelayFee(account, relayParams.fee, startingGas);          // 6. 扣除 relay 费用
    oracle.clearAllPrices();                                      // 7. 清理 oracle 状态
}
```

### 2.4 Relay 费用计算（FX100 完整链上公式）

```
relayGasLimit = gasUsed + RELAY_FEE_BASE_GAS_LIMIT + calldataGas
calldataGas   = calldataLength × 10 + (ceil(calldataLength/32))² / 512 + ceil(calldataLength/32) × 3

nativeFee     = ceil(relayGasLimit × tx.gasprice × multiplierFactor / FLOAT_PRECISION)

feeAmount(ERC20) = ceil(nativeFee × WNT.maxPrice / feeToken.minPrice)
```

关键约束：

- `feeAmount > fee.maxFeeAmount` → revert `InsufficientRelayFee`（防 keeper 超收）

- `relayFeeMultiplierFactor = 0` → 降级为 `FLOAT_PRECISION`（即 1.0x）

- calldata 超 50,000 字节 → revert `RelayCalldataTooLong`

GMX 对比：fee 由 Gelato 节点 off-chain 计算后追加到 calldata，合约直接从 calldata 读取，不做独立计算 —— 存在对 Gelato 报价的信任假设。

### 2.5 EIP-712 签名体系

**Domain Separator**（FX100 独立域，不复用 Gelato）：

```
name    = "Fx100RelayRouter"
version = "1"
chainId = block.chainid
verifyingContract = address(this)
```

**关键 TypeHash（RelayUtils.sol）**：

| 常量 | 用途 |

| `CREATE_ORDER_TYPEHASH` | 普通用户创建订单 |

| `SUBACCOUNT_CREATE_ORDER_TYPEHASH` | 子账户代创建 |

| `UPDATE_ORDER_TYPEHASH` / `SUBACCOUNT_UPDATE_ORDER_TYPEHASH` | 更新订单 |

| `CANCEL_ORDER_TYPEHASH` / `SUBACCOUNT_CANCEL_ORDER_TYPEHASH` | 取消订单 |

| `BATCH_TYPEHASH` / `SUBACCOUNT_BATCH_TYPEHASH` | 批量操作 |

| `SUBACCOUNT_APPROVAL_TYPEHASH` | 子账户授权 |

| `MINIFIED_TYPEHASH` | 嵌套摘要（Minified(bytes32 digest)） |

**双重验签路径**（`validateSignature`）：

1. 先尝试直接恢复签名（标准 EIP-712）

1. 失败则尝试 Minified digest：`keccak256(abi.encode(MINIFIED_TYPEHASH, originalDigest))`

1. 两者均失败 → revert

这一设计允许钱包对"摘要的摘要"签名（部分硬件钱包或 AA 合约钱包常见场景）。

### 2.6 防重放机制

| 机制 | 覆盖场景 |

| `digests[digest] = true` | 每个 EIP-712 摘要只能使用一次（全局去重） |

| `relayParams.deadline` | 签名有效期截止时间 |

| `relayParams.desChainId` | 防跨链重放 |

| `subaccountApprovalNonces[account]` | 子账户授权的顺序 nonce（防乱序重用） |

### 2.7 子账户安全模型（FX100 独有）

```
主账户
  └─ 签署 SubaccountApproval
        ├─ subaccount      = 子账户地址
        ├─ actionType      = CREATE_ORDER / UPDATE_ORDER / ...
        ├─ maxAllowedCount = N（最多使用 N 次）
        ├─ expiresAt       = 时间戳（授权到期）
        ├─ nonce           = subaccountApprovalNonces[主账户]（顺序递增）
        └─ desChainId      = chainId（防跨链）
             ↓
子账户
  └─ 签署具体 Action（如 SubaccountCreateOrder）
        └─ 包含 subaccountApproval 哈希 + relayParams 哈希
```

**`_handleSubaccountOrderAction` 执行逻辑**：

1. 验证 `subaccount` 在主账户的授权名单中

1. 验证授权未过期（`expiresAt`）

1. 消费 `maxAllowedCount` 配额

1. 递增 `subaccountApprovalNonces[account]`（每次授权消耗一个 nonce 槽）

---

## 3. Relay 策略分析与推荐

### 3.1 Gelato 机制详解

Gelato 提供两种中继模式：

**模式 A：sponsoredCall（GMX 和 FX100 SDK 当前使用）**

```
项目方预充值 1Balance ──► 用户签名 + API Key ──► Gelato 节点 ──► 合约
                                                        ↑
                               Gelato 从 1Balance 扣款，项目方再向用户收费
```

- **需要**：注册 API Key，预充值 1Balance 账户

- **风险**：1Balance 耗尽 → 全线停止；API Key 泄露；Gelato 服务中断

- **结论**：**Permissioned（有权限要求）**

**模式 B：callWithSyncFee（更去中心化）**

```
用户签名 ──► Gelato 节点 ──► 合约（实现 GelatoRelayFeeCollector）
                                ↑
                   Gelato 将 fee 追加到 calldata，合约内支付给 GelatoFeeCollector
```

- **需要**：合约实现指定接口；Gelato 节点识别该合约

- **结论**：基本无需 API Key，但仍依赖 Gelato 节点可用性

**总结**：Gelato 不是完全 permissionless。sponsoredCall 对项目方有权限要求（API Key + 充值），callWithSyncFee 对合约有接口要求。FX100 当前合约不实现 `GelatoRelayFeeCollector` 接口，使用 callWithSyncFee 需要合约改造。

### 3.2 三种策略对比

| | 自建 Keeper | 纯 Gelato | 双轨（推荐） |

| 工程成本 | 高（keeper 服务、监控） | 低 | 中（抽象接口 + 适配器） |

| 上线速度 | 慢 | 快 | 快（先用 Gelato） |

| 外部依赖 | 无 | 强（API Key / 1Balance） | 弱（Gelato 为 fallback） |

| 费用控制 | 完全自控 | 受 Gelato 定价影响 | 自建后完全自控 |

| 合约改动 | 无需 | callWithSyncFee 需改造 | 无需 |

| L1 Data Fee | 需自行计算（Base 链） | Gelato 帮处理 | 两阶段都需处理 |

### 3.3 推荐方案：双轨架构（Option C）

FX100 v0.2.1 合约已为此完全准备好（`RELAY_*` 平台无关命名，任意 keeper 可调）。

**SDK 层抽象设计**：

```typescript
interface IRelayExecutor {
  send(params: RelayTransaction): Promise<string>; // 返回 taskId 或 txHash
  waitForExecution(taskId: string): Promise<TransactionReceipt>;
}

class GelatoRelayExecutor implements IRelayExecutor { ... }  // 现有路径
class KeeperRelayExecutor implements IRelayExecutor { ... }  // 自建后端 API
```

**迁移路径**：


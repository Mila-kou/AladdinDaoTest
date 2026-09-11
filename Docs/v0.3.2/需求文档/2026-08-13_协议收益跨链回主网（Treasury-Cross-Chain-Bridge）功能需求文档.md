# 🌉 协议收益跨链回主网（Treasury Cross-Chain Bridge）功能需求文档

> Notion 页面：[原文](https://app.notion.com/p/3bb3d7873f2c81798e80ff8d73ccb807)
> 作者：fx100-sync（Gordon 的 fx100-contracts 仓库文档同步机器人，内容出自 Gordon）
> 创建时间：2026-08-13
> 最后编辑：2026-08-13
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 产品 / FX100 / 技术相关 / 合约 / 🏗️ 设计提案
> 类型：设计文档

> 👥 受众：合约工程师　｜　来源：docs/analysis/../superpowers/specs/2026-08-13-treasury-cross-chain-bridge-design.md

# 协议收益跨链回主网（Treasury Cross-Chain Bridge）功能需求文档

**日期**: 2026-08-13

**状态**: 设计定稿，待写实现计划（writing-plans）

**受众**: 合约工程师

**涉及模块（新增）**: `src/fee-distribute/TreasuryBridgeCoordinator.sol`, `src/fee-distribute/bridge/IBridgeAdapter.sol`, `src/fee-distribute/bridge/BridgeAdapterBase.sol`, `src/fee-distribute/bridge/CCTPBridgeAdapter.sol`

**涉及模块（不改动）**: `src/fee-distribute/ProtocolTreasury.sol`, `src/fee-distribute/RevenuePool.sol`

**关联文档**: `docs/superpowers/specs/2026-05-28-fee-distribution-design.md` §4.4（原始 P2 手动方案）、`docs/superpowers/specs/2026-06-13-fee-distribution-implementation-spec.md`（P2-1，"跨链 veFXN 收益分配运营流程"）、`docs/superpowers/specs/2026-08-13-coupon-account-design.md`（同日另一份需求文档，无直接依赖关系）

---

## 一、背景与目标

FX100 协议收益（协议收益库 `ProtocolTreasury` 中累积的手续费分成）需要定期跨链回 Ethereum 主网，用于给 fx 协议的 veFXN 持有者分配收益，以此拉动 fxUSD 业务。**现状**：按 `2026-05-28-fee-distribution-design.md` §4.4 原定方案，这一步被显式定义为 P2、"无需新合约代码"——运营给协议收益库白名单加官方 bridge 地址，治理手动 `multicall`/`batchTransfer` 把资金转给 bridge 托管地址，再由人工完成跨链和主网分配。

这个流程的问题是：资金在"从金库转出"到"实际完成跨链"之间，不可避免地要经过某个 EOA/托管地址的中转（无论是 bridge 官方的托管地址还是运营自己的中转地址），存在中间人托管窗口。本需求的目标是把"从协议收益库取出 + 发起跨链"这个动作本身合约化为一笔原子交易，消除中间托管窗口；主网侧接收后如何分配给 veFXN，仍按现状人工操作，不在本次范围内。

**范围边界（本期不做）**：

- 不自动化主网侧接收/veFXN 分配，这部分仍人工操作。
- 不覆盖保险基金（`InsuranceTreasury`）的跨链，保险基金作为 L2 风险备付资金应留在 Base 链上，只针对协议收益库（`ProtocolTreasury`）。
- 不做全自动定时触发（Chainlink Automation / 自建 keeper 定时任务），触发方仍是人工授权的角色地址（多签/keeper），只是资金不再经过 EOA 托管。
- 本期只**部署**一个代币（USDC）+ 一个跨链协议（Circle CCTP）的适配器，但架构上采用可插拔的每 token 适配器注册表（详见§三），为未来 LP 底层资产扩充带来的其他代币收入预留扩展位——扩展时只需新部署一个符合通用接口的 adapter + 管理员注册，无需重新设计协调层合约。
- 不新增链上历史流水台账合约，审计轨迹靠事件（event）。
- 不改动 `ProtocolTreasury.sol`/`RevenuePool.sol`，也不移除现有"白名单 + multicall"人工兜底路径——本功能是新增的替代路径，旧路径可保留作为 break-glass 兜底。

---

## 二、现状调研结论（决策依据）

1. **`ProtocolTreasuryProxy_Funding`/`ProtocolTreasuryProxy_fxMint` 在本仓库中不存在**——穷举 `src/`/`script/`/`docs/`/`ignition/` 全仓库历史、以及本机其他相关仓库（fx100-apps/fx100-ui/fx100-monitor/gmx-synthetics 等）均无命中。本仓库 Ignition 部署 ID 只有 `ProtocolTreasury`/`InsuranceTreasury` 两个通用实例（`ignition/modules/Fx100Fee.ts:31,40`）。这两个名字大概率是 fx-protocol-contracts（主网真实协议仓库）里的具体实例命名，不在 fx100-contracts 范围内，**主网侧确切接收地址需要运营与 fx 主网团队确认后再配置**，本设计不假设具体地址。
2. **现有分账/支出机制**：`RevenuePool.claim()`（仅 `staker` 可调用）把协议手续费按比例拆给 `treasury`（`ProtocolTreasury`，协议收益库）/`burners`（`InsuranceTreasury`，保险基金）/`ecosystem`（LP Vault）。`ProtocolTreasury.sol`（`src/fee-distribute/ProtocolTreasury.sol`，`InsuranceTreasury` 是同一份合约部署两次）已有：
   - `batchTransfer(token, receivers[], amounts[])`：`onlyRole(BATCH_TRANSFER_ROLE)`，且内部对每个 `receivers[i]` 做 `_checkRole(TOKEN_RECEIVER_ROLE, receivers[i])`——这就是文档里说的"白名单手动支出"。
   - `multicall(targets[], data[])`：`onlyRole(MULTICALL_ROLE)`，任意目标任意 calldata。
   - `withdraw(token, recipient)`：`onlyRole(DEFAULT_ADMIN_ROLE)`，整体转出，文档标注仅用于合约退役场景。

   **这两个函数已经足够支持"新合约作为白名单接收方 + 自己触发跨链"的集成方式，完全不需要改 `ProtocolTreasury.sol` 本身。**
3. **"LP 那边已有的跨链合约" 已核实**：这是 v0.3.0 之前为一个搁置的"FxSave"跨链 LP 策略搭建的完整跨链栈，已在 `a51f08f` commit 整体删除（`docs/analysis/vault/vault.md:13` 有自查记录），但可通过 `git show bac1a50:<path>` 完整恢复：
   - `src/interfaces/IStrategy.sol`（**至今仍在用**，`VaultBase.sol` 通过它调用策略）——抽象层未受影响。
   - `src/vault/strategy/StrategyBase.sol`（已删除）：`TokenConfig{bridgeAdapter, recipientOnDestChain, maxSlippageInBps, additionalData}` + `delegatecall` 进可插拔 bridge adapter 的模式。
   - `src/vault/bridge/{IBridgeAdapter,BridgeAdapterBase}.sol`（已删除）：通用、协议无关的桥接适配器接口。
   - `src/vault/bridge/CCTPStandardBridgeAdapter.sol`（已删除）：USDC 走 **Circle CCTP**（`ICCTPTokenMessenger.depositForBurn`），硬编码 `DEST_DOMAIN_ETHEREUM = 0`，Base→Ethereum burn-and-mint。
   - `src/vault/bridge/OFTBridgeAdapter.sol`（已删除）：fxSAVE 份额走 **LayerZero OFT**。
   - `src/interfaces/ISuperchainBridge.sol`（已删除）：Base 原生 OP-Stack 消息桥，用于跨链状态确认（非价值转移）。
   - 具体用例 `FxSaveHostStrategy.sol`（Base）/`FxSaveRemoteStrategy.sol`（Ethereum 主网，硬编码主网 USDC/fxUSD 地址）：USDC 走 CCTP，控制消息走 OP-Stack 原生桥，fxSAVE 份额走 OFT 桥回 Base——三种桥接机制组合使用。

   **团队此前的选型已经证明：对 USDC 这类价值转移，选的是 CCTP（无滑点/流动性风险的官方 burn-mint），不是 LayerZero/Stargate。本设计沿用同一选型。**
4. **原设计文档明确把这一步标为 P2、"无需新合约代码"**——说明本次需求是对原计划的主动升级，需要在文档里说明升级理由（消除 EOA 托管窗口），而非推翻原设计。

---

## 三、总体架构

### 3.1 方案选择

**推荐：新增 `TreasuryBridgeCoordinator.sol` + 可插拔的 bridge adapter 层，`ProtocolTreasury.sol` 零改动。**

`ProtocolTreasury.sol` 已有的白名单钩子（`batchTransfer` + 内部 `TOKEN_RECEIVER_ROLE` 校验）足以支持："给新合约同时授予 `BATCH_TRANSFER_ROLE` 和 `TOKEN_RECEIVER_ROLE`（治理操作，非代码改动），新合约自己的一个函数里，把'从金库拉钱'和'发起跨链销毁'写成一笔原子交易"。

设计上把这个新合约拆成两层，直接复用已删除的 FxSave 跨链栈里可复用的那一半：

- **`TreasuryBridgeCoordinator.sol`**（协调层，新）：持有 `mapping(address token => TokenBridgeConfig) tokenConfigs`（`TokenBridgeConfig{bridgeAdapter, mainnetRecipient, maxSlippageInBps, additionalData}`，与已删除的 `StrategyBase.TokenConfig` 同构），管理员通过 `setTokenConfig(token, ...)` 逐个代币注册桥接路线。核心函数：

```solidity
function bridgeProfitToMainnet(address token, uint256 amount) external onlyRole(BRIDGE_OPERATOR_ROLE) {
    TokenBridgeConfig memory cfg = tokenConfigs[token];
    require(cfg.bridgeAdapter != address(0), "no adapter configured");

    address[] memory receivers = new address[](1);
    uint256[] memory amounts = new uint256[](1);
    receivers[0] = address(this);
    amounts[0] = amount;
    protocolTreasury.batchTransfer(token, receivers, amounts);     // 从金库拉出

    DelegateCallLib.delegateCall(cfg.bridgeAdapter, abi.encodeWithSelector(
        IBridgeAdapter.bridge.selector, token, amount, cfg.mainnetRecipient,
        cfg.maxSlippageInBps, cfg.additionalData
    ));                                                             // delegatecall 进适配器，Base 侧完成销毁/锁定
    emit ProfitBridgedToMainnet(token, amount, cfg.mainnetRecipient, block.timestamp);
}
```

  用 `delegatecall`（而非普通 call）调用适配器，是照搬已删除 `StrategyBase.bridge` 的原因：拉出来的代币停留在 `TreasuryBridgeCoordinator` 自己名下，适配器内部的 `approve`/`depositForBurn` 需要以 `address(this) == coordinator` 的身份操作这笔余额，delegatecall 保留了这个调用上下文。

- **`IBridgeAdapter.sol`/`BridgeAdapterBase.sol`**（适配器接口层，恢复自 `git show bac1a50:src/vault/bridge/{IBridgeAdapter,BridgeAdapterBase}.sol`，原样或近似原样恢复）：`bridge(token, amount, recipient, maxSlippage, additionalData)` 的通用协议无关接口。
- **`CCTPBridgeAdapter.sol`**（首个、也是本期唯一注册的适配器，改编自 `git show bac1a50:src/vault/bridge/CCTPStandardBridgeAdapter.sol`）：内部调用 `ICCTPTokenMessenger.depositForBurn`，`DEST_DOMAIN_ETHEREUM = 0`。

由于"拉钱"和"跨链销毁"发生在同一笔交易、同一个调用方地址下，**资金不会在任何 EOA 或托管地址停留**——这正是要消除的"不可避免要到 EOA"问题的根本解法：不是流程上更快地转手，而是结构上不再存在转手这一步。

### 3.2 为什么恢复适配器层、但不恢复完整的 StrategyBase

已删除的 `StrategyBase` 其实是两件事叠在一起：①一层通用、协议无关的"按 token 配置 + delegatecall 进可插拔 bridge adapter"机制（`TokenConfig` + `bridge()`）；②一层 LP Vault 专用的策略记账（实现 `IStrategy.totalAssets()/deposit()/withdraw()`，服务于 Vault 的 NAV 核算）。

本需求只要①，不要②——`ProtocolTreasury` 不是一个按策略核算 NAV 的 vault，它只是一个存了累积手续费分成、等待跨链的金库，套用 `IStrategy` 的存取款语义没有意义，反而会引入本仓库目前完全没有用到的一整套策略角色/记账状态。所以 `TreasuryBridgeCoordinator` 只提取①（token 配置注册表 + delegatecall 分发），不继承/实现 `IStrategy`。

这样设计的好处：**今天的实际需求（USDC 走 CCTP）只需要部署一个 adapter、注册一条配置，复杂度和最初的单一用途方案几乎一样**；但未来 LP 底层资产扩充带来新的代币收入时，只需要新部署一个符合 `IBridgeAdapter` 接口的适配器（可能是恢复的 `OFTBridgeAdapter.sol`，也可能是另一个 CCTP 变体）+ 调 `setTokenConfig` 登记，`TreasuryBridgeCoordinator` 本身不用重新部署或改代码。额外收益：由于适配器是无状态、协议无关的，同一份部署好的 `CCTPBridgeAdapter` 理论上未来也能被 LP 那边如果复活的策略合约共用。

### 3.3 为什么不直接改 `ProtocolTreasury.sol`

`ProtocolTreasury.sol` 是复用的合约（`ProtocolTreasury`/`InsuranceTreasury` 是同一份代码部署两次，源自 `aladdin-v3-contracts`），改动它的影响面比新增一个窄范围的旁路合约更大，而且现有的白名单钩子已经足够支撑这个集成方式，没有必要改。

---

## 四、合约设计细节

### 4.1 `TreasuryBridgeCoordinator.sol`（新，协调层）

| 元素 | 设计 |
|---|---|
| `BRIDGE_OPERATOR_ROLE` | 授予运营多签/keeper 地址，可调用 `bridgeProfitToMainnet`。沿用 `ProtocolTreasury.sol` 里 `BATCH_TRANSFER_ROLE`/`MULTICALL_ROLE` 同款的管理员角色惯例 |
| `protocolTreasury`（immutable） | 现有 `ProtocolTreasury` 代理地址（协议收益库），不含 `InsuranceTreasury` |
| `tokenConfigs`（`mapping(address token => TokenBridgeConfig)`） | 每个代币的桥接路线配置：`TokenBridgeConfig{address bridgeAdapter, bytes32 mainnetRecipient, uint256 maxSlippageInBps, bytes additionalData}`，与已删除的 `StrategyBase.TokenConfig` 同构 |
| `setTokenConfig(address token, TokenBridgeConfig calldata cfg)` | `onlyRole(DEFAULT_ADMIN_ROLE)`。注册/更新某代币的桥接适配器和主网接收地址。本期上线时只调用一次，为 USDC 注册 `CCTPBridgeAdapter`；未来新增代币收入时，部署新适配器后再调一次即可 |
| `bridgeProfitToMainnet(address token, uint256 amount)` | `onlyRole(BRIDGE_OPERATOR_ROLE)`。若 `tokenConfigs[token].bridgeAdapter == address(0)` revert；否则从 `protocolTreasury` 拉出 `amount` 个 `token`，`delegatecall` 进配置好的适配器执行跨链。`amount == 0` 或超过 `protocolTreasury` 当前该代币余额时会在 `batchTransfer`/ERC20 转账里自然 revert，无需重复校验 |
| `bridgeAllAvailable(address token)` | 便捷函数——读取 `protocolTreasury` 当前该代币余额，全额调用 `bridgeProfitToMainnet`。适合运营"把这个周期累积的收益一次性跨走"的实际操作习惯 |

### 4.1.1 `IBridgeAdapter.sol` / `BridgeAdapterBase.sol`（新，适配器接口层，恢复自已删除代码）

通用、协议无关的接口：`bridge(address token, uint256 amount, bytes32 recipient, uint256 maxSlippageInBps, bytes calldata additionalData)`。`BridgeAdapterBase` 提供公共的滑点保护等辅助逻辑，具体跨链协议的实现放在各自的子类里。

### 4.1.2 `CCTPBridgeAdapter.sol`（新，本期唯一注册的适配器，改编自已删除的 `CCTPStandardBridgeAdapter.sol`）

`bridge()` 内部：`IERC20(token).approve(cctpTokenMessenger, amount)` → `ICCTPTokenMessenger(cctpTokenMessenger).depositForBurn(amount, DEST_DOMAIN_ETHEREUM, recipient, token)`，`DEST_DOMAIN_ETHEREUM = 0`（CCTP 里 Ethereum 主网的固定 domain id，与旧适配器硬编码值一致）。`recipient`（即 `TokenBridgeConfig.mainnetRecipient`）是主网最终接收地址，**不硬编码在适配器里**，由协调层的 `setTokenConfig` 配置，因为具体目标（运营口中的 `ProtocolTreasuryProxy_Funding` 在主网 fx-protocol-contracts 部署里到底是哪个地址）需要运营与主网团队确认后再配置，上线前必须先完成这一步核实。CCTP `depositForBurn` 的 recipient 参数类型是 `bytes32`（地址左补零），需在文档/注释里说明避免误认为哈希值。

### 4.2 事件

`TokenConfigUpdated(address indexed token, address bridgeAdapter, bytes32 mainnetRecipient)`、`ProfitBridgedToMainnet(address indexed token, uint256 amount, bytes32 mainnetRecipient, uint256 timestamp)`，作为审计轨迹（本功能不新增链上流水台账合约，靠事件回溯）。

### 4.3 CCTP 两段式跨链的运营提醒（不在本仓库合约范围内，但需要写进文档）

`depositForBurn` 只完成 Base 侧的"销毁 + 发消息"。Ethereum 主网侧的实际铸造需要第二步：拿到 Circle 的 attestation，提交给主网 `MessageTransmitter.receiveMessage`。这一步是无需权限的（任何人拿着 attestation 都能提交），通常由一个简单的链下中继脚本/机器人自动完成，完全发生在主网侧、fx100-contracts 范围之外——与"主网侧接收和分配仍人工操作"的既定范围是一致的，这个中继步骤大概率是运营侧一个小脚本，而不是本需求要交付的合约代码。

---

## 五、边界情况

| 场景 | 行为 |
|---|---|
| 该代币尚未通过 `setTokenConfig` 注册适配器 | `bridgeProfitToMainnet` revert（`bridgeAdapter == address(0)` 显式检查） |
| `mainnetRecipient` 尚未配置（配置里是 `bytes32(0)`） | 适配器内部 revert，避免误销毁到零地址 |
| 请求金额超过 `ProtocolTreasury` 当前该代币余额 | 在 `batchTransfer` 内部 ERC20 转账失败时自然 revert，无需重复余额检查 |
| 非 `BRIDGE_OPERATOR_ROLE` 调用 `bridgeProfitToMainnet` | revert（AccessControl） |
| `TreasuryBridgeCoordinator` 在 `ProtocolTreasury` 上的两个角色被治理撤销 | `bridgeProfitToMainnet` 在 `batchTransfer` 内部角色校验处 revert，资金不会被转移，失败是安全的 |
| Circle CCTP 暂停/弃用 `depositForBurn`（外部依赖风险，小概率） | 该代币的跨链功能 revert；现有"白名单 + multicall"人工兜底路径未被移除，可作为备用；其他已注册代币（若有）不受影响 |
| 适配器 `delegatecall` 内部逻辑异常/耗尽 gas | 整笔 `bridgeProfitToMainnet` 交易 revert（`delegatecall` 失败需要显式检查返回值并 revert，不能吞掉错误），协调层自身存储不会因适配器执行失败而被污染 |

---

## 六、测试要点（Foundry）

- **单元测试**：`bridgeProfitToMainnet` 角色门禁（非 operator revert）、`setTokenConfig` 仅管理员可调、未注册代币 revert、零地址 recipient 保护、适配器 `delegatecall` 失败时协调层正确 revert（不吞错误）。
- **集成测试**：对 Base 主网 fork 的真实 CCTP `TokenMessenger` 跑完整流程——给一个（fork 上的真实或测试用）`ProtocolTreasury` 授予两个角色、给 `TreasuryBridgeCoordinator` 注册 USDC→`CCTPBridgeAdapter` 配置、往金库充值 USDC、调用 `bridgeProfitToMainnet(USDC, amount)`，断言：`ProtocolTreasury` 余额减少、`TreasuryBridgeCoordinator` 自身余额归零（全额转出）、Circle `TokenMessenger` 发出的 `DepositForBurn` 事件里 `mainnetRecipient`/domain/amount 均正确。
- **集成测试**：`bridgeAllAvailable(token)` 正确读取并跨链当前全部余额。
- **集成测试**：新代币扩展场景——注册第二个代币 + 一个 mock/新适配器，验证不改动 `TreasuryBridgeCoordinator` 代码、不影响已有 USDC 配置的前提下能独立工作。
- **回归测试**：确认 `ProtocolTreasury` 现有 `batchTransfer`/`multicall`/`withdraw` 对其他已白名单接收方的行为完全不受影响（本功能只是新增了一个白名单接收方，不改变任何既有逻辑）。

---

## 七、非目标清单（复述，防止范围蔓延）

- 主网侧接收/veFXN 分配自动化
- 保险基金（`InsuranceTreasury`）跨链
- 全自动定时触发（无人工授权）
- 本期只上线 USDC + CCTP 一条路线——多代币/多协议的**能力**是架构层面预留的，但本次交付不涉及注册/实现除 CCTP 之外的第二个适配器（例如 LayerZero OFT），那是后续独立的迭代
- 链上历史流水台账合约
- 改动 `ProtocolTreasury.sol`/`RevenuePool.sol`，或移除现有人工兜底路径

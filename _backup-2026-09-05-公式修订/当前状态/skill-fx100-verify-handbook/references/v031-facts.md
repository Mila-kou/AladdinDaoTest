# v0.3.1 事实卡（@v0.3.1 快照）：费用路由 · key 签名 · 部署地址 · 账户圈定

> 全部按 `Github/fx100-contracts@release-v0.3.1`（@d9a7fd2f）与部署 `base_sepolia_v0.3.1_260729` 逐段核实（2026-08-07）。

## 1. 费用路由三段（决定"钱什么时候在哪"）

**交易执行时（每笔开/平仓）**：
- 协议费 `feeReceiverAmount` **只记账不动钱**：`FeeUtils.incrementClaimableFeeAmount` 写 DataStore `claimableFeeAmount(marketIndex, token, feeType)`，USDC 物理留在 **PositionVault**（IncreasePositionUtils.sol:220-227；减仓 DecreasePositionCollateralUtils.sol:219-226，清算费份额记独立 LIQUIDATION_FEE_TYPE 槽 :228-236）。
- LP 份额 `feeAmountForPool` **当场物理转** LPVault（IncreasePositionUtils.sol:242-244 / DecreasePositionCollateralUtils.sol:215-217）。
- Funding：Position→LP 方向走 claimable(FUNDING_FEE_TYPE)（钱留 PositionVault）；LP→Position 方向 LPVault 物理 transferOut（MarketUtils.sol:582-594）。

**第一跳 `claimFees(marketIndex, feeToken, feeType)`**（FeeHandler.sol:69-74，**任何人可调**）：读 claimable 并清零 → PositionVault 物理转 **FeeHandler**（0x009559c1B221…452c）→ 记 `availableFeeAmount(feeToken, feeType)`。

**第二跳 `withdrawFees(feeToken, feeType)`**（FeeHandler.sol:49-62，**onlyFeeKeeper**）：available 清零 → FeeHandler 转 `DataStore.FEE_RECEIVER` = **RevenuePool**（0x0b5141ef…F396，链上已设置；走 depositReward 记 balances[token][feeType]）。

**第三段 `RevenuePool.claim()`**（仅 staker 可调）：才按 staker/treasury/locker/ecosystem 比例四路分发到 ProtocolTreasury（0x1cEAc53F…1427）/InsuranceTreasury（0xa6cbc0Da…FbA8）等。

## 2. 关键结论：核对账户圈怎么圈

- 交易执行窗口的五账户零和应圈：**Trader、OrderVault、PositionVault、LPVault(totalAssets)、FeeHandler**（后者恒 0 变化，作哨兵）。
- ⚠️ **TestCode 看板的 `ΔFeeReceiver` 槽实际读的是 FeeHandler 余额**（tools/fx100-legacy/tool/onchain-tx/lib/ledger.mjs:56 balanceOf(a.feeHandler)），不是 FEE_RECEIVER 指向的 RevenuePool——命名与合约语义错位，宜改名 ΔFeeHandler；做 claim/withdraw 场景时再加 ΔRevenuePool 等槽位。
- claimable（DataStore 应收账本）与 ERC20 余额是**两套账**，各自守恒，禁止相加。
- TestCode 部署 manifest（config/deployments/base-sepolia-v0.3.1-260729.json）**未登记** feeHandler/revenuePool/treasury 地址（schema 也不要求）——补核对前先补 manifest。

## 3. key 签名（v0.3.1，与 v0.2.x 不同！）

- `claimableFeeAmountKey(uint256 marketIndex, address token, bytes32 feeType)`（FX100Keys.sol:1033-1038）；
- `availableFeeAmountKey(address feeToken, bytes32 feeType)`（:1621-1622）；
- feeType 常量：POSITION_FEE_TYPE / LIQUIDATION_FEE_TYPE / FUNDING_FEE_TYPE / UI_POSITION_FEE_TYPE；
- 旧世代（v0.2.x）无 feeType 参数——用旧签名读 v0.3.1 会**静默读 0**。
- 双重基编码陷阱仍在：LIQUIDATION_GRACE_PERIOD_* 用 `keccak256(纯字符串)`，多数其他键用 `keccak256(abi.encode(string))`（见 traps.md §1）。

## 4. 部署速查（base_sepolia_v0.3.1_260729，fork chainId 84532，forkBlock 45002553）

| 合约 | 地址 |
|---|---|
| DataStore/RoleStore | 0x606D72Ab0C0fDcce607d04B1645CE2D528B88014 |
| PositionVault | 0xffdFc6611901f98cD45f9F1191dE58b21AEc188A |
| OrderVault | 0xA2c327927b0e447969C67c2840B23cB8038e4b05 |
| LPVault（两市场共用） | 0xD584270bbC25E0948103da1e1865AA523a1BAe6c |
| FeeHandler | 0x009559c1B221243939f4DfbBB036fC87883c452c |
| RevenuePool（=FEE_RECEIVER） | 0x0b5141ef09e0cCB0d35595EC4cF25ED82079F396 |
| ProtocolTreasury / InsuranceTreasury | 0x1cEAc53F…1427 / 0xa6cbc0Da…FbA8 |
| ExchangeRouter / Reader / Oracle / OrderHandler / EventEmitter | 0x5f9215DF…2E97 / 0xB81D25f8…8761 / 0x83719dDb…497d / 0x84162e52…648d / 0x8f00eBF8…b380 |

参数：POSITION_FEE_RECEIVER_FACTOR = LIQUIDATION_FEE_RECEIVER_FACTOR = 5e29（50% 归协议、50% 归 LP）。LPVault `totalAssets() = 自身余额 + 策略资产`（VaultBase.sol:105-106；本部署为 Noop 策略 0x5B6B9d41…aC46）——账本 LP 槽应读 totalAssets 而非 balanceOf。ABI 用合约仓 `base_sepolia_v0.3.1_260729/abi/`（191 个 json）。

## 5. 发单资金前置校验（用例前置条件）

`collateral + relayFee + 开仓费(+关仓费预算) < USDC 余额`（严格小于留余量）：
- 普通模式：前端 Pay = Collateral + 开仓费，一次性 sendTokens 从钱包转出——余额不足在 createOrder 的 transferFrom 直接 revert；
- Flash/relay 模式：另加 relayFee，**USDC 计价**（apps `useRelayFeeEstimate` → `estimateRelayDisplayFeeUsdc`，gas×ETH 价折算，约 30s 刷新会随 gas 浮动 → 必须留 buffer）；
- 关仓费从平仓所得/押金扣、不预付，但计入预算保证全流程（开→调→平）不因余额中途卡壳；
- 执行费（executionFee）是 ETH/WNT 侧，另行核对，不占 USDC 预算。

# 🎟️ 优惠券账户（Coupon Account）功能需求文档

> Notion 页面：[原文](https://app.notion.com/p/3bb3d7873f2c81c2a7e8e4e1714d21ab)
> 作者：fx100-sync（Gordon 的 fx100-contracts 仓库文档同步机器人，内容出自 Gordon）
> 创建时间：2026-08-13
> 最后编辑：2026-08-13
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 产品 / FX100 / 技术相关 / 合约 / 🏗️ 设计提案
> 类型：设计文档

> 👥 受众：合约工程师　｜　来源：docs/analysis/../superpowers/specs/2026-08-13-coupon-account-design.md

# 优惠券账户（Coupon Account）功能需求文档

**日期**: 2026-08-13

**状态**: 设计定稿，待写实现计划（writing-plans）

**受众**: 合约工程师

**涉及模块（新增）**: `src/coupon/CouponVault.sol`, `src/coupon/CouponUtils.sol`, `src/coupon/CouponHandler.sol`, `src/constants/FX100Keys.sol`（新增 key）

**涉及模块（改动，均为小范围 hook 调用，非结构性改写）**: `src/pricing/PositionPricingUtils.sol`, `src/position/IncreasePositionUtils.sol`, `src/position/DecreasePositionCollateralUtils.sol`

---

## 一、背景与目标

运营希望通过"优惠券账户"提高转化：管理员可以给指定用户地址充值一笔 USDC 优惠券余额；这笔余额**只能用于抵扣开仓手续费和平仓手续费**（不含清算费、资金费），**不能被用户提现或转出**；优惠券资金抵扣的手续费**不产生 referral 返佣**（不给交易折扣，也不给 affiliate 分成）。

**范围边界（本期不做）**：

- 不覆盖清算费、资金费——优惠券只抵扣开/平仓手续费（position fee）这一个子项，清算费和资金费无论优惠券余额是否充足都始终从抵押品正常扣除，逻辑上完全不与优惠券产生交互。这样做有两个好处：①不触碰清算边界、资金费结算这两块本仓库历史上最容易出精度/时序细节问题的路径；②referral 返佣本身就只针对 position fee 计算，抑制范围与优惠券覆盖范围天然一致，不存在"覆盖了清算费但清算费本来就没有返佣"这种要额外处理的错位。
- 不做用户自助充值/提现入口，仅管理员后台充值。
- 不覆盖 keeper 执行费（execution fee）。现有 execution fee 是下单时用原生代币 WNT 预付到 `OrderVault`（`GasUtils.payExecutionFee`），与 USDC 抵押品/手续费是完全独立的两条路径，本期不新增"USDC 代付 WNT"的兑换机制。
- 不做按市场隔离的优惠券余额，只做账户级（跨市场共享）的全局余额。
- 到期只做**账户级单一到期时间**，不做按笔（lot-based）独立到期跟踪——同一账户多次充值共享一个 `expiryTimestamp`，新充值直接覆盖旧值；管理员手动回收/清零仍然保留，作为过期机制之外的另一条控制手段（两者不互斥，同时提供）。
- 不做部分覆盖时的按比例返佣拆分——只要本次手续费沾上优惠券（哪怕只覆盖一部分），整笔手续费的 referral 返佣和交易折扣全部为零。
- 不含前端/UI 改动，纯合约层需求。

---

## 二、现状调研结论（决策依据）

1. **手续费流转**：`PositionPricingUtils.getPositionFeesAfterReferral()`（`src/pricing/PositionPricingUtils.sol:445`）计算 `fees.totalCostAmount`（由 position fee / funding fee / liquidation fee 三个子项汇总而成，汇总前各子项已独立可读），随后 `IncreasePositionUtils.processCollateral()`（`:198-255`）与 `DecreasePositionCollateralUtils.payForCost()`（`~:186`）从抵押品里扣除该总额，多余部分经 `FeeUtils.incrementClaimableFeeAmount` → `FeeHandler` → `RevenuePool`（"分账器"）分给协议/保险/LP。**优惠券只挂钩 position fee 这一个子项**（本文档以 `fees.positionFeeAmount` 代称，具体字段名以实现时读到的 `fees` 结构体为准），不动 funding fee / liquidation fee 子项。
2. **Referral 返佣**：`ReferralUtils.getReferralInfo()` 在手续费计算阶段（`PositionPricingUtils.sol:461-467`）就算出 `affiliateRewardAmount`/`traderDiscountAmount`；实际发放在 `PositionUtils.handleReferral()`（`:578`，由 `IncreasePositionUtils.sol:148` / `DecreasePositionUtils.sol:298` 调用），**发生在抵押品扣款之前**。这意味着"优惠券抵扣手续费"与"抑制 referral 返佣"是两个时序不同的钩子点，必须共享同一个覆盖金额判断，不能各算各的。
3. **抵押品模型**：没有账户级余额合约，抵押品完全内嵌在 `Position.Numbers.collateralAmount` 里（按 `(account, marketIndex, isLong)` 建仓位 key）。优惠券账户是全新的、不挂在任何 position 上的账户级存储。
4. **Keeper 执行费**：下单时用 WNT 原生代币预付进 `OrderVault`，`GasUtils.payExecutionFee` 直接从 `OrderVault` 转给 keeper，与 USDC 抵押品/手续费无关——本期不覆盖。
5. **可复用的既有模式**：`FeeUtils.incrementClaimableFeeAmount`/`ReferralUtils.incrementAffiliateReward` 都是「DataStore keyed uint 记账 + StrictBank 实际持币 + 事件」三件套模式，优惠券账户设计沿用同一套惯例（不引入新的存储范式）。

---

## 三、总体架构

```plain text
管理员 depositCoupon(account, amount, expiryTimestamp)
        │ USDC 转入
        ▼
   CouponVault（新 StrictBank，独立持币，与 PositionVault 隔离）
        │
        │ DataStore: couponBalanceKey(account, token) += amount
        │            couponExpiryKey(account, token) = expiryTimestamp（覆盖旧值）
        ▼
   交易者正常开/平仓/被清算/资金费结算
        │
        ▼
PositionPricingUtils.getPositionFeesAfterReferral()
   ├─ CouponUtils.getCouponCoverage(account, token, fees.positionFeeAmount) → couponCoveredAmount（只读 peek，只以 position fee 子项为上限，与 funding/liquidation 无关）
   ├─ 若 couponCoveredAmount > 0：referralCode 视为未设置 → affiliateRewardAmount = 0, traderDiscountAmount = 0
   └─ fees.couponCoveredAmount = couponCoveredAmount（挂在 fees 结构体上，供下游复用同一个数）
        │
        ▼
IncreasePositionUtils.processCollateral() / DecreasePositionCollateralUtils.payForCost()
   ├─ 若 fees.couponCoveredAmount > 0：
   │     CouponUtils.consumeCouponBalance(account, token, couponCoveredAmount)
   │     → DataStore 余额 -= couponCoveredAmount
   │     → CouponVault.transferOut(token, positionVault, couponCoveredAmount)
   └─ collateralDeltaAmount -= (totalCostAmount - couponCoveredAmount)   ← 公式不变，只是 couponCoveredAmount 的上限从"全部费用"收紧到"position fee 子项"，
        │                                                                    因此 funding fee + liquidation fee 部分必然仍由抵押品支付，天然不受优惠券影响
        ▼
   手续费全额（不论来源）仍按现有逻辑走 FeeUtils.incrementClaimableFeeAmount → FeeHandler → RevenuePool 分账
   （LP/协议/保险基金拿到的分成金额与优惠券是否参与无关，完全不受影响；唯一被抑制的只有 referral 返佣）
```

**核心设计原则**：优惠券只改变"开/平仓手续费"这一项由谁付（`CouponVault` 还是交易者抵押品），不改变手续费"该收多少、分给谁"，也完全不触碰资金费和清算费；唯一被优惠券触发而改变的下游行为是 referral 返佣归零。

**为什么这个限定几乎不增加实现复杂度**：`processCollateral`/`payForCost` 里的扣款公式 `collateralDeltaAmount -= (totalCostAmount - couponCoveredAmount)` 完全不用改——只要 5.1 处把 `couponCoveredAmount` 的上限从 `totalCostAmount` 收紧成 `fees.positionFeeAmount`，`couponCoveredAmount` 就永远不可能超过 position fee 子项，`(totalCostAmount - couponCoveredAmount)` 也就永远 ≥ funding fee + liquidation fee 之和，抵押品自然照付不误。改动集中在 5.1 的一个参数上，5.3 处的扣款逻辑字面上不用动。

---

## 四、新增合约与存储

### 4.1 `CouponVault.sol`（新，继承 `StrictBank`）

与 `PositionVault`/`OrderVault` 同构，仅持币，不含业务逻辑。与 `PositionVault` 物理隔离的原因：避免优惠券负债与交易池流动性记账混在一起。

### 4.2 `CouponUtils.sol`（新库，风格对齐 `ReferralUtils.sol`/`FeeUtils.sol`）

**过期模型**：账户级单一到期时间，不做按笔（lot-based）跟踪——`couponExpiry[account]` 只存一个 `uint256` 时间戳，每次管理员充值都会传入一个新的 `expiryTimestamp` 并直接覆盖旧值（不是取 max，也不做多笔到期时间并存）。`expiryTimestamp == 0` 约定为"永不过期"（沿用本仓库"0 = 不限制"的惯例，如 `MIN_COLLATERAL_USD=0`）。过期是**惰性判断**——不需要 keeper/定时任务去扫描清零，`getCouponCoverage`/`consumeCouponBalance` 每次调用时自己检查 `block.timestamp <= couponExpiry[account]`，过期即视为可用余额为 0；链上原始余额数字（`getCouponBalance` 读到的值）在管理员显式回收之前依然会保留在存储和 `CouponVault` 里，只是逻辑上不可再消费，管理员可以在任何时间点通过 `decrementCouponBalance` 把这笔已过期但未清理的余额收回。

| 函数 | 说明 |
|---|---|
| `incrementCouponBalance(dataStore, eventEmitter, account, token, amount, expiryTimestamp)` | 管理员充值，仅由 `CouponHandler` 调用；`expiryTimestamp` 直接覆盖该账户之前的到期时间（`0` = 永不过期） |
| `decrementCouponBalance(dataStore, eventEmitter, account, token, amount, recipient)` | 管理员手动回收/清零，USDC 退回 `recipient`（运营指定地址）；`amount > 当前记录余额` 时 revert；无论是否已过期都可以调用，用于清理过期未用完的余额 |
| `getCouponBalance(dataStore, account, token) view returns (uint256)` | 查询**原始**记录余额，不考虑是否过期 |
| `isCouponExpired(dataStore, account, token) view returns (bool)` | 查询 `block.timestamp > couponExpiry[account]`（`expiryTimestamp == 0` 时恒为 `false`） |
| `getCouponCoverage(dataStore, account, token, costAmount) view returns (uint256)` | 只读 peek；若已过期直接返回 `0`，否则返回 `min(balance, costAmount)`，无状态变更；函数本身是通用的金额上限计算，不关心调用方传入的是哪个费用子项——调用方（5.1）传入 `fees.positionFeeAmount` 是本设计限定覆盖范围的地方，不是这个函数内部的逻辑 |
| `consumeCouponBalance(dataStore, eventEmitter, account, token, amount)` | 状态变更：余额 -= amount，且 `couponVault.transferOut(token, positionVault, amount)`；调用方（5.3）传入的 `amount` 已经是经过 `getCouponCoverage` 过期检查后的值，这里不重复检查过期，只做记账减法（保持职责单一） |

### 4.3 `CouponHandler.sol`（新，薄控制层）

- `depositCoupon(account, amount, expiryTimestamp)`：从管理员地址转入 USDC 到 `CouponVault`，调用 `CouponUtils.incrementCouponBalance`。同一账户重复充值时，新的 `expiryTimestamp` 会覆盖旧值——如果运营想要"续期"，直接再充值一次并传入更晚的时间戳即可；如果不小心传入更早的时间戳，也会按新值生效（管理员本身有 `revokeCoupon` 作为兜底，不需要额外的"只能延长不能缩短"防呆校验）。
- `revokeCoupon(account, amount, recipient)`：调用 `CouponUtils.decrementCouponBalance`。
- 两者均沿用本仓库现有的管理员角色校验模式（`CONTROLLER`/admin role），非管理员调用 revert。

### 4.4 DataStore Key（`src/constants/FX100Keys.sol`）

参考 `availableFeeAmountKey`（账户级/协议级，不含 `marketIndex`）：

```solidity
bytes32 public constant COUPON_BALANCE = keccak256(abi.encode("COUPON_BALANCE"));
bytes32 public constant COUPON_EXPIRY  = keccak256(abi.encode("COUPON_EXPIRY"));

function couponBalanceKey(address account, address token) internal pure returns (bytes32) {
    return keccak256(abi.encode(COUPON_BALANCE, account, token));
}

function couponExpiryKey(address account, address token) internal pure returns (bytes32) {
    return keccak256(abi.encode(COUPON_EXPIRY, account, token));
}
```

`token` 参数保留是为了与既有 key 命名惯例一致，实际场景下 FX100 单一抵押品架构下只会是 USDC。余额存储单位与 `fees.totalCostAmount` 一致（token 原始精度，非扩展精度），两者可直接相减比较，无需换算；`couponExpiryKey` 存的是 unix 时间戳（`block.timestamp` 同一单位）。

**不可提现的实现方式**：结构性保证——`CouponVault`/`CouponUtils`/`CouponHandler` 全套代码里没有任何"转给用户"的函数，而不是靠运行时开关拦截。

---

## 五、手续费扣减与 Referral 抑制（核心改动点）

改动均为在既有函数内插入对 `CouponUtils` 的调用，不重写既有计算逻辑，共 3 处：

### 5.1 `PositionPricingUtils.getPositionFeesAfterReferral()`（`src/pricing/PositionPricingUtils.sol:445`）

在现有 `if (fees.referral.referralCode != bytes32(0))` 判断（`:516`）之前插入：

```solidity
uint256 couponCoveredAmount = CouponUtils.getCouponCoverage(
    dataStore, account, collateralToken, fees.positionFeeAmount // 上限是 position fee 子项，不是 totalCostAmount
);
if (couponCoveredAmount > 0) {
    fees.referral.referralCode = bytes32(0); // 整笔手续费一律不算返佣/折扣
}
fees.couponCoveredAmount = couponCoveredAmount; // 挂在 fees 结构体新增字段上，供下游复用
```

### 5.2 `PositionUtils.handleReferral()`（`src/position/PositionUtils.sol:578`）

**无需改动**。由于 5.1 已经把 `fees.referral.affiliateRewardAmount`/`traderDiscountAmount` 在源头算成 0，`handleReferral` 对优惠券覆盖的手续费自然是 no-op。

### 5.3 `IncreasePositionUtils.processCollateral()`（`~:247`）与 `DecreasePositionCollateralUtils.payForCost()`（`~:186`）

原逻辑 `collateralDeltaAmount -= fees.totalCostAmount` 改为：

```solidity
if (fees.couponCoveredAmount > 0) {
    CouponUtils.consumeCouponBalance(dataStore, eventEmitter, account, collateralToken, fees.couponCoveredAmount);
}
collateralDeltaAmount -= (fees.totalCostAmount - fees.couponCoveredAmount);
```

这一处代码与"不限制费用类型"版本完全一样，不需要改——因为 `fees.couponCoveredAmount` 的上限已经在 5.1 处被收紧到 `fees.positionFeeAmount`，所以 `fees.totalCostAmount - fees.couponCoveredAmount` 永远不会小于 `funding fee + liquidation fee`，这两类费用自然、无需额外代码地始终由抵押品支付。

### 5.4 为什么 peek（5.1）与 consume（5.3）要分两步

Referral 返佣发放（`handleReferral`）在时序上早于抵押品扣款（`processCollateral`/`payForCost`）。若把"判断是否命中优惠券"和"实际扣减优惠券余额"合并成一步放在扣款处执行，5.1 处就无法提前知道这笔手续费是否命中优惠券，也就无法正确抑制 referral。因此拆成"只读 peek（尽早决定返佣是否为 0）+ 状态变更 consume（在原扣款点执行实际扣减）"两步，且共享同一个 `couponCoveredAmount` 数值，保证两处判断口径一致，不会出现"返佣抑制了但优惠券余额没扣"或反过来的不一致。

---

## 六、边界情况

| 场景 | 行为 |
|---|---|
| 优惠券余额为 0 | `getCouponCoverage` 返回 0，两处 hook 全部 no-op，与现有行为完全一致（回归安全） |
| 部分覆盖开/平仓手续费（余额 $2，position fee $5） | 优惠券扣到 0，剩余 $3 position fee 从抵押品正常扣；整笔手续费返佣归零 |
| 清算 | 清算费**始终**从抵押品扣，优惠券完全不参与，即使账户还有充足余额也不会被扣减（本期范围已限定为只覆盖 position fee） |
| 资金费单独结算 | 资金费**始终**从抵押品扣，优惠券完全不参与；若某次结算只有资金费、没有 position fee（`fees.positionFeeAmount == 0`），`getCouponCoverage` 自然返回 0，两处 hook 全部 no-op |
| 优惠券已过期（`block.timestamp > couponExpiry[account]`） | `getCouponCoverage` 直接返回 0，两处 hook 全部 no-op，行为与"余额为 0"完全一致；原始余额数字仍保留在存储/`CouponVault` 里，等待管理员显式回收 |
| 同一账户被多次充值，新充值的 `expiryTimestamp` 比旧的更早 | 直接按新值覆盖生效（没有"只能延长"的保护），管理员需自行确保充值参数正确 |
| `expiryTimestamp == 0` | 视为永不过期，`isCouponExpired` 恒为 `false` |
| 管理员回收金额 > 当前余额 | revert |
| 非管理员调用充值/回收 | revert |
| 下单/订单结构 | 无需改动——扣减完全自动、无需用户或订单层面的开关字段 |

---

## 七、事件

新增 `CouponBalanceIncreased`（含新的 `expiryTimestamp` 字段）、`CouponBalanceConsumed`、`CouponBalanceRevoked`，经 `EventEmitter` 发出，字段风格对齐现有 `AffiliateRewardUpdated`/`ClaimableFeeAmountUpdated`，便于监控/索引复用现有基础设施。过期本身不发事件（惰性判断，没有一个"过期发生"的独立时间点可以触发事件——是每次尝试使用时才判断出来的）。

---

## 八、测试要点（Foundry）

- **单元测试**：`CouponUtils` 的 increment/decrement/coverage/consume 独立行为（含 revert 场景：余额不足回收、越权调用）；`isCouponExpired`/`getCouponCoverage` 在过期前、过期后、`expiryTimestamp == 0` 三种情况下的返回值；同账户二次充值覆盖旧 `expiryTimestamp`（含新值更早/更晚两种顺序）。
- **集成测试**：
- 优惠券全额覆盖开仓手续费（position fee）→ 验证 affiliate reward 未增加、`CouponVault` 余额减少、`PositionVault`/分账池收到的手续费金额不变。
- 部分覆盖 position fee → 验证抵押品补扣差额正确、优惠券余额清零、整笔返佣为 0。
- 优惠券余额为 0 的回归测试 → 确认现有行为完全不受影响。
- **清算场景**：账户优惠券余额充足，触发清算 → 验证清算费全额从抵押品扣除，`CouponVault`/DataStore 里的优惠券余额**不发生变化**。
- **纯资金费结算场景**（无 position fee 产生）：账户优惠券余额充足 → 验证资金费全额从抵押品扣除，优惠券余额不变。
- **过期场景**：`vm.warp` 到 `couponExpiry[account]` 之后 → 验证交易正常走抵押品扣款路径，优惠券完全不参与（等价于余额为 0），且原始 `getCouponBalance` 数字保持不变（没有被自动清零）；随后管理员对同一账户调用 `revokeCoupon` 能正常回收这笔已过期余额。
- 非管理员调用充值/回收 revert。
- 管理员回收金额超过余额 revert。

---

## 九、非目标清单（复述，防止范围蔓延）

- 用户自助充值/提现
- 清算费、资金费的优惠券覆盖——只覆盖开/平仓手续费（position fee）
- Keeper 执行费（WNT）的优惠券代付
- 按市场隔离的优惠券余额
- 按笔（lot-based）独立到期时间跟踪——到期只做账户级单一时间戳
- 部分覆盖时的按比例返佣拆分
- 前端/UI 改动

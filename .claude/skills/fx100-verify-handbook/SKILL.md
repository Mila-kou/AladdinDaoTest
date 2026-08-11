---
name: fx100-verify-handbook
description: FX100 数据核对知识手册（公式、取整、v0.3.1 费用路由与部署事实、核对陷阱）。Use whenever the task involves FX100 verification in this workspace — 数据核对 / 深度核对 / 核对公式 / Expected Δ / 守恒 / ΣΔ / 账本 / ledger / execution-evidence / reconciliation / SCN-009 / SCN-010 / SCN-070 / TestCode 核对重构 / 手续费公式 / 资金费 / funding / 执行价 / 动态点差 / dynamicSpread / 取整方向 / 清算价 / leverage 公式 / PnL / 支付瀑布 / claimable / FeeHandler / RevenuePool / 费用路由 / DataStore key — even if none of these words appear but the task requires computing expected on-chain values for fx100 positions/fees/funding/PnL, designing reconciliation checks, or reading DataStore/event fields. 与 Test/standards 冲突时以 standards 为准；本 skill 只提供领域知识。
---

# FX100 核对手册

> 知识来源：对一套经 30+ 笔实盘 bit 级验证的 fx100 核对参考实现的完整精读（2026-08-06/07），费用路由与 key 签名已按本工作区基线 `Github/fx100-contracts@release-v0.3.1` 逐段复核。**断言以实际实现为准**（工作区规则 4）：给出任何公式前，用文中的函数名锚点在 release-v0.3.1 源码里复核；行号仅供定位，以函数名为准。

## 一句话核心事实

1. **合约没有"杠杆"变量**：只有 `净抵押 ≥ sizeInUsd × minCollateralFactor` 约束（`PositionUtils.isPositionLiquidatable`；开仓/操作校验用 MIN_COLLATERAL_FACTOR，清算判定用 MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION）。杠杆全是前端派生显示量。
2. **交易执行时协议费不动钱**：只记 DataStore `claimableFeeAmount`（USDC 物理留 PositionVault）；LP 份额当场物理转 LPVault。FeeHandler/RevenuePool 的余额要到 claimFees/withdrawFees 才动（详见 v031-facts.md——**ΔFeeReceiver 这个名字在本仓看板里圈的其实是 FeeHandler**）。
3. **bit 级重算四根基**：BigInt 向零截断==EVM 整除；**同序复刻**（截断在每一步，重排乘除即差 1 wei）；事件为权威值来源；快照所有读数 pin 同一 blockNumber。
4. **取整总原则**：对 trader 不利、护池/护协议（买贵卖贱、付费进位、收款舍尾）。
5. **静默取消是头号陷阱**：OrderHandler try/catch 取消不 revert——"订单离队"≠"执行成功"，每个 TX 第一件事是判别 Executed/Cancelled/Frozen 并解码 reasonBytes。
6. **发单资金前置校验（务必遵守）**：前端/脚本发交易前必须保证 `collateral + relayFee + 开仓费(+关仓费预算) < USDC 余额`（严格小于、留余量）。机理：普通模式 Pay = Collateral + 开仓费一次性 sendTokens 转出；Flash/relay 模式另加 relayFee（**USDC 计价**，按 gas×ETH 价折算、约 30s 刷新会浮动，故必须留 buffer）；关仓费虽从平仓所得扣、不预付，但计入预算才能保证全流程不因余额卡壳。余额不足的失败形态：创建时 transferFrom revert（干净失败）或 relay 链路签名后失败——都会产生"无订单/无事件"的空转用例。把余额预检写进用例前置条件。

## 知识地图

| 你在做什么 | 读哪里 |
|---|---|
| 算/核任何期望值（零和、执行价、点差、size↔token、资金费、手续费、PnL、瀑布、leverage、清算价、取整速查） | [references/formulas.md](references/formulas.md) |
| 写核对代码/断言前防踩坑（双 key 编码、orderType 枚举、原子快照、execBlock−1、事件自证、同序复刻…） | [references/traps.md](references/traps.md) |
| 查 v0.3.1 费用路由、key 签名、部署地址、账户圈定 | [references/v031-facts.md](references/v031-facts.md) |

## 使用纪律

- 期望值**独立重算**，禁抄合约/事件输出当期望（幽灵内容零容忍，工作区规则 3）；确实无法独立时明确标注证据等级（恒等式/事件锚定），不冒充独立重算。
- 缺参数或公式未实现 → `NOT_VERIFIED`，不能倒推 PASS。
- 每条公式声明取整方向与容差（0 容差需同序复刻为前提）。

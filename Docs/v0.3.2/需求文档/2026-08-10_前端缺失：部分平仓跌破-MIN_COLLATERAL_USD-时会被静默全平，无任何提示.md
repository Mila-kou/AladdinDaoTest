# 前端缺失：部分平仓跌破 MIN_COLLATERAL_USD 时会被静默全平，无任何提示

> Notion 页面：[原文](https://app.notion.com/p/3b83d7873f2c817a96d7da8ea7173cf4)
> 作者：Gordon (chao@aladdin.club)
> 创建时间：2026-08-10
> 最后编辑：2026-08-12
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 🐛 Bugs（数据库）
> 类型：缺陷/需求（Bugs 库）
> 状态：Review / Medium

## 属性

| 属性 | 值 |
|---|---|
| Status | Review |
| Priority | Medium |
| Product | FX100 |
| Reporter | Gordon |
| Assignee | Fefe |
| Link | https://github.com/Sosogao/fx100-contracts/blob/docs/testing-standards/docs/bugs/BUGS.md#r7-b02 |
| 创建时间 | 2026-08-10T09:41:15.570Z |
| 复测 | 验证点：1) 前端在会触发该分支的场景下，提交前给出明确警告或阻止提交；2) 警告文案清楚说明'将会全平而非部分平仓'；3) 确认当前部署环境 MIN_COLLATERAL_USD 的实际值，评估该场景在真实交易规模下的触发概率。 |
| Text | 见下文 |

## 描述（Text 属性）

合约行为（已确认为既有设计，非合约 bug，见 docs/bugs/BUGS.md R7-B02）：DecreasePositionUtils.decreasePosition() 中，只要一笔部分平仓执行后剩余抵押品+PnL 的美元价值会跌破 MIN_COLLATERAL_USD，合约就会静默把这笔订单改写为全平仓（order.sizeDelta 直接改成仓位全部 sizeInUsd），不会 revert，也不会按用户原本请求的比例执行，只会触发 OrderSizeDeltaAutoUpdated 事件。

实测复现：test/integration/CollateralAdjustment.t.sol::test_CollateralAdjustment_PartialDecreaseBelowMinCollateralUsd_AutoClosesFully —— 开仓 1,000 USDC 抵押/10,000 USD 名义仓位，MIN_COLLATERAL_USD 抬高到 2,000（超过现有抵押品美元价值）后，请求一笔普通 30% 部分平仓，结果仓位被强制全平而不是按 30% 执行。

我检查了 fx100-apps（fx-base-app）代码：全仓库 grep MIN_COLLATERAL_USD/minCollateralUsd 零匹配——前端目前完全没有针对这个绝对美元门槛的任何预判或 UI 提示。现有的 ClosePositionDialog 里的 liquidatable/LiquidatableBadge 是另一套机制（基于价格/清算比例的清算区判断），跟这个基于绝对 USD 门槛的机制是两回事，不能互相替代。

影响：用户发起一笔看似正常的部分平仓，事前没有任何警告，执行后才发现整个仓位被平掉了（而不是他预期的部分比例）。虽然资金结算是正确的（没有资金损失），但用户体验上是一次意外的、无法挽回的被动全平。

建议修复方向（任选其一）：
1. 前端下单前用当前 MIN_COLLATERAL_USD 链上值 + 仓位当前抵押品/PnL，预判这笔部分平仓执行后是否会跌破门槛；如果会，在提交前明确提示用户这笔操作会导致仓位被完全平掉，而非部分平仓，让用户确认或取消。
2. 或者更保守地：直接禁止提交这类会触发该分支的部分平仓请求，只允许用户选择全平。

需要确认：当前 Base Sepolia 上 MIN_COLLATERAL_USD 的实际配置值是多少（scripts/parameters 里没有找到显式设置，可能是默认值/未配置，需要工程师确认当前是否真的会在实际交易规模下触发）。

## 正文

<!-- Notion 页面为空白页，无正文内容 -->

# USDC不够时如何发起relay

> Notion 页面：[原文](https://app.notion.com/p/3b83d7873f2c80c2a972e26df4b54365)
> 作者：Gordon (chao@aladdin.club)
> 创建时间：2026-08-10
> 最后编辑：2026-08-10
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 🐛 Bugs（数据库）
> 类型：缺陷/需求（Bugs 库）
> 状态：Closed / High

## 属性

| 属性 | 值 |
|---|---|
| Status | Closed |
| Priority | High |
| Product | FX100 |
| Reporter | Gordon |
| Assignee | Fefe, starit.public |
| 创建时间 | 2026-08-10T02:05:54.460Z |
| Text | 见下文 |

## 描述（Text 属性）

关仓时用户没有USDC如何解决：前端在开仓时要保留一点，同时各种交易要提醒usdc不够，要提醒切换到standard模式（或自动切换之类）

## 正文

用户在 Flash/Relay 模式进行以下操作并选择 `Max` 时，前端需要保留 `1 USDC`，避免把全部 USDC 用作交易金额后无法支付 Relay Fee：
- 开仓：Market / Limit，Long / Short；
- 加仓：Market / Limit，Long / Short；
- 仓位 Adjust Margin 的 Deposit。

Max 的验收口径：

```plain text
Max交易金额 + 非Relay USDC费用 <= USDC余额 - 1 USDC
```

当用户资金足够支付交易本身，但不足以同时支付 Relay Fee 时：

```plain text
业务所需USDC <= USDC余额 < 业务所需USDC + Relay Fee
```

页面必须显示：

```plain text
Insufficient USDC for Relay Fee
Switch to Standard
```

Flash/Relay 交易不能继续提交；点击 `Switch to Standard` 后保留订单类型、Long/Short、金额、杠杆、Limit 价格和滑点，不自动发送交易，由用户再次确认。

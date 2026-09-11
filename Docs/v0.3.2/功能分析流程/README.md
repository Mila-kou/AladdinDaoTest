# FX100 v0.3.2 功能分析流程

> 2026-09-10 由 `TestCase/E2E/versions/v0.3.2/`（分析类文档）与 `Docs/v0.3.2/合约文档/` 迁入。用例矩阵、结果、applicability、expectation-overrides 与 cases 仍在 [`TestCase/E2E/versions/v0.3.2/`](../../../TestCase/E2E/versions/v0.3.2/README.md)。基线以 [`CURRENT.json`](../../contract-releases/CURRENT.json) 为唯一事实源。
>
> 约定：单份文件的功能分析直接放本目录；多份文件的专项单独一个「专项-<功能>」文件夹，内部按读者分册 ①业务说明 / ②原理篇 / ③需求与分析，并收纳该专项的既有详解文档与实测补充。

## 总览与流程

| 文件 | 用途 |
|---|---|
| [00-Trade功能总览.md](00-Trade功能总览.md) | Trade 边界、参与者、功能域和总流程 |
| [01-Order字段与状态.md](01-Order字段与状态.md) | Order 全字段、业务含义、前端来源和核对规则 |
| [02-订单类型与交易流程.md](02-订单类型与交易流程.md) | 7 种 OrderType、ADL、Market/Limit/Stop、TP/SL，以及创建/触发/执行/取消/冻结流程 |
| [03-Fee-Funding-清算-ADL-Oracle.md](03-Fee-Funding-清算-ADL-Oracle.md) | Fee、Oracle、跨域证据与四份主题文档导航 |
| [04-前端Trade操作清单.md](04-前端Trade操作清单.md) | 用户在 Trade 页面可能执行的操作与前端要求 |

## 主题生命周期

| 文件 | 用途 |
|---|---|
| [dynamicSpread-(v0.3.2).md](<dynamicSpread-(v0.3.2).md>) | 有符号成交点差：组成公式、影响数据、前端/Keeper 责任与边界值 |
| [Funding-(v0.3.2).md](<Funding-(v0.3.2).md>) | Funding：参数、指数/EMA、Reader 预览、逐仓结算、领取、资金路由与边界 |
| [Liquidation-(v0.3.2).md](<Liquidation-(v0.3.2).md>) | 清算：Grace、风险判定、Keeper/前端清算价、强平执行、费用、资不抵债早退 |
| [ADL-(v0.3.2).md](<ADL-(v0.3.2).md>) | ADL：secondary 状态启停、primary 执行门槛、内部订单、严格改善、Keeper |

## 需求与裁决

| 文件 | 用途 |
|---|---|
| [Trade-需求来源与冲突台账-(v0.3.2).md](<Trade-需求来源与冲突台账-(v0.3.2).md>) | 需求时间线、已裁决口径、GAP / BLOCKED 分层、DEC-TRADE 待裁决项 |

## 专项

| 专项 | 文件 |
|---|---|
| [专项-Relay/](<专项-Relay/>) | [①业务说明](<专项-Relay/专项-Relay-①业务说明.md>) · [②原理篇](<专项-Relay/专项-Relay-②原理篇.md>) · [③需求与分析](<专项-Relay/专项-Relay-③需求与分析.md>)（RQ-RELAY-01～49 唯一汇总）· [合约代码流程与函数说明](<专项-Relay/Relay合约代码流程与函数说明.md>) · [Standard-Relay-Flash-OneClick 版本文档](<专项-Relay/Standard-Relay-Flash-OneClick-(v0.3.2).md>) · [余额门与 Max 死区实测补充](<专项-Relay/Relay余额门与Max死区-实测补充-(v0.3.2).md>) |

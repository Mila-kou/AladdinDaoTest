# GENERAL_DEFAULTS.liquidationGraceTier0Multiplier 默认值8应改为1,防止部署漏配导致保护期变120分钟

> Notion 页面：[原文](https://app.notion.com/p/3b33d7873f2c812d9881fe0694ecf7c3)
> 作者：Gordon (chao@aladdin.club)
> 创建时间：2026-08-05
> 最后编辑：2026-08-05
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 🐛 Bugs（数据库）
> 类型：缺陷/需求（Bugs 库）
> 状态：Open / Medium

## 属性

| 属性 | 值 |
|---|---|
| Status | Open |
| Priority | Medium |
| Product | FX100 |
| Reporter | Gordon |
| Assignee | LiY |
| 创建时间 | 2026-08-05T16:35:04.268Z |
| 复测 | 重新跑一次不带 general.liquidationGraceTier0Multiplier 显式配置的部署脚本(或直接跑 configureGeneral.ts 且注释掉该字段),读取 DataStore 里落地的 liquidationGraceTier0Multiplier 值,确认默认结果 = 1e18(对应900秒/15分钟保护期),而不是原来的 8e18(7200秒/120分钟)。 |
| Text | 见下文 |

## 描述（Text 属性）

文件: scripts/config/defaults.ts:40
GENERAL_DEFAULTS.liquidationGraceTier0Multiplier 硬编码为 8n * WEI_PRECISION (=8x)。

configureGeneral.ts:42-44 逻辑: 若部署配置文件(如 general.sample.json)没有显式传 liquidationGraceTier0Multiplier,则回退用这个 8x 默认值。

现状: 当前 Base Sepolia 实际部署用的 scripts/parameters/general.sample.json:26 显式写了 "1",所以线上保护期 = GraceBase(900s) x 1 = 15分钟,跟 GitBook 产品文档承诺的15分钟一致,目前没有实际问题。

风险: 8x 这个代码默认值本身是隐患。以后任何一次重新部署(新链/新环境/或不小心漏传 general 配置里的这一项)时,会静默回退成 8x,导致保护期变成 900x8=7200秒(120分钟),而不是文档承诺的15分钟——不会报错、不会有任何提示,只会在链上悄悄生效成错误的数值,很难第一时间发现,且直接影响到清算保护/ADL豁免这个用户可见的核心承诺。

建议修复: 把 scripts/config/defaults.ts:40 GENERAL_DEFAULTS.liquidationGraceTier0Multiplier 的代码默认值从 8n*WEI_PRECISION 改成 1n*WEI_PRECISION,让代码兜底值本身就跟15分钟对齐;各次部署仍可在配置文件里按需显式覆盖成其他倍数。

## 正文

<!-- Notion 页面为空白页，无正文内容 -->

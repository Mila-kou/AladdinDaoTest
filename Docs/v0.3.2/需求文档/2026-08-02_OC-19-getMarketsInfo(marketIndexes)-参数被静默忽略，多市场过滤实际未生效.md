# OC-19 getMarketsInfo(marketIndexes) 参数被静默忽略，多市场过滤实际未生效 + 缓存按参数分键却存全量

> Notion 页面：[原文](https://app.notion.com/p/3b03d7873f2c8195aa22c95d60dd2eda)
> 作者：Gordon (chao@aladdin.club)
> 创建时间：2026-08-02
> 最后编辑：2026-08-03
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 🐛 Bugs（数据库）
> 类型：缺陷/需求（Bugs 库）
> 状态：Closed / Medium

## 属性

| 属性 | 值 |
|---|---|
| Name | OC-19 getMarketsInfo(marketIndexes) 参数被静默忽略，多市场过滤实际未生效 + 缓存按参数分键却存全量 |
| Status | Closed |
| Priority | Medium |
| Product | FX100 |
| Reporter | Gordon |
| Assignee | starit.public |
| Link | https://www.notion.so/3ae3d7873f2c81879274d700c80f2577 |
| 创建时间 | 2026-08-02T15:02:10.609Z |
| Text | 见下文「描述（Text 属性）」 |
| 复测 | 见下文「复测（复测属性）」 |

## 描述（Text 属性）

【位置】apps/fx-base-app/src/app/api/markets/info/route.ts:124（develop c717f462 "feat: add market to url path and fix market info api" 引入）

【问题】route 调用 sdk.markets.getMarketsInfo(marketIndexes) 传了 1 个参数，但 packages/sdk/src/modules/markets/index.ts:458 的签名是 async getMarketsInfo(): Promise<MarketsInfoResult> —— 0 个参数。JS 会静默忽略多余实参，所以：
1. tsc --noEmit 报错 TS2554: Expected 0 arguments, but got 1（develop 分支自身就有这个错，不是合并引入的，已核对 develop 的 route 和 SDK 两边都是原样）。
2. 运行时不 crash，但 marketIndexes 过滤完全没生效 —— 每次请求都拉全部 20 个市场。这次 commit 想做的多市场按需加载没实现。
3. route.ts:74-75 的缓存 key 包含 marketIndexes（[...marketIndexes].sort().join('+')），但存进去的是全量 payload。所以请求 market 4 和请求 market 5 会写两条 key 不同、内容完全相同的缓存条目 —— 数据不错（是超集），但缓存命中率和内存都白费。

【根因推测】改了调用方但漏改 SDK 签名。SDK 的 getMarketsInfo 需要加一个可选的 marketIndexes 参数并在内部做过滤。

【影响面】随市场数量线性放大。现在真链已有 20 个市场，每次 /api/markets/info 都全量拉取，前端首屏和切市场都会变慢。

【建议】在 packages/sdk 的 getMarketsInfo 上加 marketIndexes?: string[] 参数并实现过滤，然后 yarn workspace @fx-io/sdk build。注意改完 SDK 必须 rebuild，否则 Next 用的还是旧 build（这个坑已多次踩到）。

## 复测（复测属性）

【已验证关闭 2026-08-03】develop 0a15c32a "feat: scope market info queries by index" 已修。SDK 签名改为 getMarketsInfo(marketIndexes?: string[])，内部是真过滤：有参数走 getMarketsByIndexes()、下游昂贵的 per-market multicall 用收窄后的索引，省略参数时保持全量行为向后兼容。前端 useMarketsInfoApiQuery 配套改为只请求当前选中市场，query key 带上 marketIndex。原先携带的 TS2554 报错已消失，fx-base-app typecheck 干净。已于 2026-08-03 合并进测试分支验证。

① tsc --noEmit 在 apps/fx-base-app 下无 TS2554 报错；② curl '/api/markets/info?chainId=84532&marketIndexes=4' 返回的 marketsInfoData 只含 market 4，不是全部 20 个；③ 对比传不同 marketIndexes 时的响应体积应有明显差异；④ 改完 SDK 记得 rebuild。

## 正文

<!-- Notion 页面为空白页，无正文内容 -->

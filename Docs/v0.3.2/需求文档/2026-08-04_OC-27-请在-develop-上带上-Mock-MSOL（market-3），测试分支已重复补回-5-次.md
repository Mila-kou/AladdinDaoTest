# OC-27 请在 develop 上带上 Mock MSOL（market 3），测试分支已重复补回 5 次

> Notion 页面：[原文](https://app.notion.com/p/3b23d7873f2c813c96b5eb80fdd62b61)
> 作者：Gordon (chao@aladdin.club)
> 创建时间：2026-08-04
> 最后编辑：2026-08-04
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 🐛 Bugs（数据库）
> 类型：缺陷/需求（Bugs 库）
> 状态：Closed / Medium

## 属性

| 属性 | 值 |
|---|---|
| Name | OC-27 请在 develop 上带上 Mock MSOL（market 3），测试分支已重复补回 5 次 |
| Status | Closed |
| Priority | Medium |
| Product | FX100 |
| Reporter | Gordon |
| Assignee | Fefe |
| Link | https://github.com/AladdinDAO/fx100-apps/commit/fdbd2810 |
| 创建时间 | 2026-08-04T13:06:24.450Z |
| Text | 见下文「描述（Text 属性）」 |
| 复测 | 见下文「复测（复测属性）」 |

## 描述（Text 属性）

【请求】把 Mock MSOL（market 3）作为 dev-only 市场纳入 develop，不要每次都省略。

【现状】真链 Base Sepolia 上是 26 个市场 = 25 个真实资产 + 1 个 Mock MSOL。develop 只配了 25 个真实资产，刻意省略 market 3。SDK configs/markets.ts 里 develop 自己的注释写了省略理由：「它没有 tokens.ts 条目、两个 feed registry 里都没有 Chainlink Data Streams feed，因此完全无法定价，需要上游补 feed 或下架」。

【为什么这个前提其实不成立】
MSOL 不走 Data Streams，它走链上 MockChainlinkOracle：
- 链上 market 3 的 priceFeed 指向 MockChainlinkOracle（0x1943907D463DA911D4fbF112d831ca5Da4E4Dc23），Oracle._getSecondaryPrice 会先命中 ChainlinkPriceFeedUtils.getPriceFeedPrice 直接返回，压根不查 latestRecordedPrices，也不需要 Data Streams feed。
- keeper 侧靠 env 的 KEEPER_PRICE_FEED_TOKENS（列 MSOL 地址）+ KEEPER_PRICE_FEED_PROVIDER_ADDRESS 改用 ChainlinkPriceFeedProvider 并传空 data，同样绕开 Data Streams。
所以它是可以定价、可以交易的，测试分支上一直在用，只是需要 tokens.ts 条目 —— 而那正是 develop 没加的东西。

【为什么值得上游维护：重复劳动已经很明显】
测试分支到目前为止已经在 5 次 develop 合并里手工补回 MSOL：b5903d52、0650307d、a98af89d、5a2d83d8、fdbd2810。每次要动 7 个文件里的若干处：
```text
  apps/fx-base-app/src/config/markets.ts          （RAW_MARKETS 两个链块）
  apps/fx-base-app/src/constants/markets.ts       （MARKET_PAIRS + DISPLAY_DEV_MARKETS）
  apps/fx-base-app/src/config/mockOracleTokens.ts （MOCK_ORACLE_TOKENS，唯一一条）
  apps/fx-base-app/src/config/addresses.ts        （token 地址表）
  apps/fx-base-app/src/config/tokens.ts           （app 自己的 token 表）
  packages/sdk/src/configs/markets.ts             （两个链块）
  packages/sdk/src/configs/tokens.ts              （两个链块）
```
而且这种「两边独立实现、代码块位置错开」的合并已经出过一次静默事故：OC-22 的 Pay amount 两块都被保留、界面渲染出两行（见 OC-22 关单记录）。同类风险每次合并都存在。

【建议做法：dev-only，不影响生产】
按 add-market skill 里既有的约定：加进 DISPLAY_DEV_MARKETS 但不加 DISPLAY_PRODUCTION_MARKETS，这样它只在开发/测试环境可见，生产不受影响。
另外两点请一并保留：
1. 不给它 categories —— 它是 mock 合成资产，不该出现在任何正式赛道页签里跟 BTC/ETH 并列（对外演示容易被当成真实资产），只在「全部」里可见。这一点 OC-18 关单时已在测试分支落实。
2. 在 SDK configs/markets.ts 的 market 3 条目上加注释说明它与 env 的 KEEPER_PRICE_FEED_TOKENS 是配套的 —— 按 develop 自己那段注释的说法，在该文件列出市场就等于「让 keeper 服务它」，删掉其中任一个都会让下单报 EmptyPrimaryPrice。

【参考实现】
测试分支 feat/liquidation-protection-ux-v031，commit fdbd2810 已含完整的 7 处配置（含上述两点）。
查看：git fetch origin feat/liquidation-protection-ux-v031 && git grep -n MSOL fdbd2810 -- apps packages

【备注】MSOL 价格需要人工维护（只在有人调 setMockPrice 时才动），测试时用
scripts/tenderly/refreshMockPrices.ts（WATCH=true 可常驻每 60s 刷）。这属于测试环境运维，不影响生产。

## 复测（复测属性）

① develop 上 getSupportedMarketPairs 返回 26 个市场，market 3 = MSOL；② MSOL 只在 DISPLAY_DEV_MARKETS，生产白名单不含它；③ MSOL 不出现在任何赛道页签，只在「全部」里；④ 在 fork 上对 MSOL 下单能被 keeper 执行（验证 KEEPER_PRICE_FEED_TOKENS 路径仍通，不报 EmptyPrimaryPrice）；⑤ 后续测试分支合并 develop 时不再需要手工补回 MSOL。

## 正文

<!-- Notion 页面为空白页，无正文内容 -->

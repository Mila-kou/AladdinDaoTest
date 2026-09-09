# OC-29 市场选择器两行分类页签过重（12 个带边框实心块），且单一大类下 All Markets 与 Crypto 完全等价，参考HL

> Notion 页面：[原文](https://app.notion.com/p/3b33d7873f2c8149bf25f6633b4f02e0)
> 作者：Gordon (chao@aladdin.club)
> 创建时间：2026-08-05
> 最后编辑：2026-08-08
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 🐛 Bugs（数据库）
> 类型：缺陷/需求（Bugs 库）
> 状态：Closed / Medium

## 属性

| 属性 | 值 |
|---|---|
| Status | Closed |
| Priority | Medium |
| Product | FX100 |
| Reporter | Gordon, Fefe |
| Assignee | Fefe |
| Link | https://github.com/AladdinDAO/fx100-apps/blob/develop/apps/fx-base-app/src/components/features/trade/MarketSelect.tsx#L384 |
| 创建时间 | 2026-08-05T01:55:23.372Z |
| 复测 | 【2026-08-05 部分修复，暂不关闭】develop ee5b524c "OC-29 Select Markets" 修了 ①②，③ 未修。<br>✅ ① 视觉：两级页签改为纯文字，边框与实心块全部去掉 —— 一级 h-8/text-sm/font-semibold，选中加 after:h-0.5 after:bg-primary 下划线；二级 h-7/text-xs/text-muted-foreground/75，选中仅 text-foreground 不加下划线；两级均 bg-transparent + rounded-none。层级差也做出来了。<br>✅ ② 文案：allMarkets → all，Favorites 提到第一位。<br>❌ ③ 单一大类下的冗余页签未修：getAvailableMarketAssetClasses 仍无条件返回 ['crypto']（constants/markets.ts:388-390），渲染层也没有条件隐藏，所以第一行仍是 Favorites \| All \| Crypto，而 All 与 Crypto 筛出来完全相同。<br>⚠️ 修这条时请注意：本次新增的 markets.taxonomy.test.ts 里有一条断言 expect(getAvailableMarketAssetClasses(MARKET_PAIRS, BASE_SEPOLIA)).toEqual(['crypto'])，把现状锁成了期望值。改成「单一大类时隐藏」需要同时更新这条断言，否则会被测试挡住。<br>建议实现：可用大类只有 1 个时不渲染该大类页签（第一行只留 ★Favorites + All），TradFi 资产上线后自动恢复 —— 与 OC-18 P0「页签由数据推导」是同一条原则的另一面。<br>测试分支 merge commit 3a96524d。<br><br>① 两行页签未选中态无边框无实心背景，仅颜色区分；② 选中态有唯一明确的指示器（建议下划线），整排只有一个视觉重点；③ 一级与二级页签在字号/颜色/间距上可区分，能看出是两个维度；④ 目前只有 crypto 一个大类时，第一行不应同时出现 All Markets 与 Crypto 两个等价项；⑤ TradFi 资产上线后第一行自动恢复完整（验证仍是数据推导，未写死）；⑥ 页签占用高度下降，弹窗内可见市场行数增加。 |
| Text | 见下文 |

## 描述（Text 属性）

OC-18 的两层分类功能是对的，这单只谈它的视觉与信息层级。对比 Hyperliquid 后，问题可归为三类：一个视觉、一个层级、一个逻辑。

════════ 一、视觉：12 个带边框实心块在互相争夺注意力 ════════

【现状】MarketSelect.tsx:384 和 :406 —— 两行页签用的是【完全相同】的 className：
    data-[state=off]:bg-secondary
    data-[state=off]:border data-[state=off]:border-border
    data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-sm
也就是每个【未选中】项都是「实心背景 + 可见边框」的块。两行加起来 12 个块，每个都有轮廓，在深色弹窗里非常扎眼；选中项靠 bg-primary 反色，反而不比周围的块更突出。

【HL 的做法】纯文字 tab，无边框无背景：
  · 未选中 = 低对比度灰字（muted-foreground）
  · 选中   = 全对比度白字 + 一条细下划线指示器
整排只有「一个」视觉重点，就是那条下划线。

【建议】
1. 去掉 data-[state=off] 的 bg-secondary 与 border —— 未选中态改为纯文字（text-muted-foreground），hover 时才升到 foreground。仅这一条就消掉 12 个轮廓。
2. 选中态不要用 bg-primary 反色块，改为 text-foreground + 底部 2px 下划线（border-b-2 border-primary）。指示器比色块轻，但因为整排只有它一个，反而更醒目。
3. 顺带回收垂直空间：现在 min-h-[40px] 两行约占 90px，弹窗里只剩 5 行市场可见（HL 同样高度能看 9 行）。文字 tab 可降到 ~28px/行。

════════ 二、层级：两行样式一模一样，看不出是两个不同维度 ════════

第一行是「资产大类」（Crypto / TradFi），第二行是「赛道」（Layer 1 / DeFi / AI / …），是两个正交维度。但两行 className 完全相同、间距也相同，视觉上像是「一堆标签换行了」，而不是「两级筛选」。

【建议】给两级明确的层级差：
  · 一级：字号略大、选中用下划线指示器；
  · 二级：字号更小、颜色更淡，选中仅用 text-foreground 不加下划线；
  · 两行之间加一条极淡的分隔线（border-border/40），或把二级整体缩进。
HL 就是这样：第一行是主 tab 条，第二行明显是它的子筛选。

════════ 三、逻辑：单一大类时第一行有两个等价选项（这条不只是好看不好看）════════

MarketSelect.tsx:163-176 的第一行无条件包含：
    { all } + { favorites } + ...getAvailableMarketAssetClasses(...)
目前链上只有 crypto 一个大类（实测 getAvailableMarketAssetClasses 返回 ['crypto']），所以「All Markets」和「Crypto」筛出来的结果【完全相同】—— 界面上摆了两个功能一致的按钮，而且最宽的那个（All Markets）是信息量最低的。

【建议】
4. 当可用大类只有 1 个时，隐藏该大类页签（甚至整行只留 ★Favorites）。这与 OC-18 P0 已确立的「页签由数据推导、空的自动隐藏」是同一条原则 —— 那条原则解决了「空页签」，这里是它的另一面：「冗余页签」。TradFi 资产上线后第一行自动出现，无需改代码。
5. 「All Markets」/「All Sectors」建议都简化为「All」。HL 两行都只写 All，靠位置区分即可；现在的长文案让最不重要的选项占了最宽的位置。
6. 「Favorites」建议改成 ★ 图标（HL 就是星标），省一大截宽度，也和列表左侧的星标列呼应。

【参考】本单不含代码改动，属纯 UI 优化，建议与 OC-25 的跑马灯视觉一起调，保持同一套 tab 语言。

## 正文

<!-- Notion 页面为空白页，无正文内容 -->

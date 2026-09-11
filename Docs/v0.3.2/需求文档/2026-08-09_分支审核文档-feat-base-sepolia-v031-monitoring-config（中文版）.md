# 分支审核文档：`feat/base-sepolia-v031-monitoring-config`（中文版）

> Notion 页面：[原文](https://app.notion.com/p/3b73d7873f2c81c0ba4fed7453efbc7b)
> 作者：fx100-sync（Gordon 的 fx100-contracts 仓库文档同步机器人，内容出自 Gordon）
> 创建时间：2026-08-09
> 最后编辑：2026-08-21
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 产品 / FX100 / PRD（产品需求文档） / 实时监控系统
> 类型：设计文档

- `marketCollector.ts`：把这两个键加进了已有的全局裸键读取（跟ADL/提款封锁那几个键同一次`batchReadDataStore`调用），暴露到`GlobalRisk`上，并加了期望值100%的`paramDrift`检查——跟上一条给ETH的RESERVE_FACTOR加的是同一种保护，这样以后这两个键再被悄悄改动就会被抓到，不会像这次一样是靠外部转达才知道。现场验证：两个键都读到100%，`paramDrift`数组长度是0。
`pnpm run typecheck` 14/14。截图确认`/fee-revenue`页面渲染正常，并且直接从渲染出来的HTML里grep到了更新后的文案确认它真的生效了。
改动落链之后独立核实过：Redis`snapshot:feeRevenue`几分钟内就显示三个feeType全部变成`staker=0/treasury=5e8/locker=3e8/ecosystem=2e8`，全自动生效、没改一行代码。现场截了Fee Revenue页的图——三行比例表格都显示0.0%/50.0%/30.0%/20.0%，"LP total if fully injected"也用新的20.0%份额重新算出来了。
唯一改动：`lpPnlCollector.ts`文件头注释原来写着"LP's eventual 40% ecosystem share"——改成描述为现场读取的余额（今天是20%），不再是写死的数字。纯注释改动，不影响运行时行为。
### 44. `e16f53d3` — 新增逐市场储备使用率历史，支撑RESERVE_FACTOR预算重新分配决策（2026-08-20）
用户提出：把ETH的RESERVE_FACTOR从36%手动调到50%解决了一次容量紧张之后，想知道哪些市场长期储备额度用不满、哪些一直顶格，这样才能有依据把RESERVE_FACTOR预算从低使用率市场挪给高使用率市场，而不是每次都简单粗暴地调高总量。这之前存在的东西都只是"当下这一瞬间"的：抽屉里那个"Reserve Usage Risk"仪表盘是纯实时快照，`reserveCapacityState`的区间跳变告警（commit 38）是"刚好现在越过阈值了"的即时提醒——两者都给不出用户真正需要的、以天/周为尺度的长期画像。
新增的几块，全部复用现有模式，没有发明新东西：
- `marketCollector.ts`（第5步，紧跟在原有的OI历史追加之后）：每个周期把每个市场当下的`reserveUsageRisk`折进当天的`{min,max,sum,count}`桶里（avg在读的时候用sum/count现算，不存，避免累计浮点误差）。用按天的粒度，不是像OI历史那样每5秒一个点——重新分配预算是个慢决策，不是实时决策（那是现有区间告警管的事）。每个市场最多留90天的桶，24个市场×90天×几个数字，总共才几KB。
- `packages/storage/src/keys.ts`：新增`reserveUsageHistory()`键。
- `apps/web/src/app/api/snapshot/reserve-usage-history/route.ts`：跟现有`oi-history`路由一样的直通模式。
- `apps/web/src/lib/reserveUsage.ts`：网页侧类型定义 + `aggregateReserveUsage()`（按样本数加权算跨N天窗口的均值，不是简单的"每天均值再求均值"）+ `useReserveUsageHistory()`自包含轮询，跟`lpPnl.ts`的`useLpPnlSnapshot`一个样。
- Markets页面：新增可排序的"Reserve Usage"列，按7天均值排序（这才是"长期"信号，不是当下快照），当前值/7天/30天放进tooltip里。跟旁边原有的"Cap Usage"列不是一回事——那个是基本不生效的`MAX_OPEN_INTEREST_FACTOR`指标，这个新列才是真正会顶住`increasePosition`不让开仓的`RESERVE_FACTOR`口径。
- `asset-drawer.tsx`的Pool tab（从Markets页面点进某个市场就能看到）：在现有的实时"Reserve Usage Risk"仪表盘正下方加了一块7天/30天均值+min-max，作为表格里"跨市场排序对比"功能对应的"钻进单个市场看细节"版本。
- `cost-params/page.tsx`的Reserve tab：同样加了这块7天/30天数据，服务于Config Standards这个抽屉的用户群体。
现场核实：worker跑了一个周期之后，Redis`reserveUsage:history`就有了全部25个市场的数据；对着跑着的dev server，把Markets列表列 + 两处抽屉都截了图——数字互相对得上，也跟实时的Reserve Usage Risk仪表盘对得上。`pnpm run typecheck` 14/14。
### 45. `c94c7f58` — 在Dashboard新增全市场储备使用率图表 + 调整建议（2026-08-20）
### 46. `8302da30` — 在Dashboard新增全市场LP已实现+未实现盈亏图表 + 汇总（2026-08-20）
# 分支审核文档：`feat/base-sepolia-v031-monitoring-config`（中文版）
**基于分支：** `dev`（真正在维护的主线——`main` 已废弃，见下文）
**提交数：** 48 个（下方第41条仅核实、无commit），按时间顺序见下方逐条说明
**状态：** 已 push 到 `origin/feat/base-sepolia-v031-monitoring-config`，尚未开 PR
本文档是 2026-08-08-branch-review.md（英文版）的中文版本，两者内容一一对应。写这份文档是为了让代码审核更容易：每次改动改了什么、为什么改、怎么验证的——包括审核前就已经发现并修掉的 bug，都记录在案，不用工程师自己从 commit message 里拼凑故事。
## 提交版本速查表

| 序号 | Commit | 一句话 |
|---|---|---|
| 1 | `c922c378` | 地址/市场配置从 v0.3.0 同步到 v0.3.1 真链 |
| 2 | `a8bf8bcc` | Goldsky 子图版本 v0.3.2 → v0.3.3 |
| 3 | `6f957a73` | 补齐 21 个市场缺失的 oracle/CEX feed 配置 |
| 4 | `c4a4c630` | Redis TTL 30s → 180s（快速止血） |
| 5 | `9e1056e0` | 采集循环并行化（真正修复根因） |
| 6 | `09788ac9` | 停止把死写键当真实 ADL 阈值展示 |
| 7 | `4ea333de` | 接入真实全局 ADL/pnlRatio（checklist P0-2） |
| 8 | `0c63ec73` | 新增跨市场单边集中度汇总（checklist P1） |
| 9 | `a3f399e8` | recorded-price keeper 活性 + 参数漂移日检（checklist P2） |
| 10 | `9d386602` | Base Sepolia RPC 多路由容错（2026-08-09） |
| 11 | `6a683998` | 调低 RPC 超时/重试参数，容错切换更快（2026-08-09） |
| 12 | `7c9fe95e` | Settlement NAV/PnL-Pool 改用 secondary price + 新增 LPVault.nav()（2026-08-12） |
| 13 | `7939cc1a` | 逐市场告警/OI 汇总排除 MSOL 和已下架市场（2026-08-13） |
| 14 | `1ddd36cf` | Skew Impact 精度改成 1e18 + 补齐 22 个市场缺失的符号（2026-08-13） |
| 15 | `c4a335d1` | 逐市场 drawer 删掉重复的全局 TVL 一行（2026-08-13） |
| 16 | `2b232c40` | ADL Thresholds 挪出逐市场 drawer + 删掉已废弃的 OI Reserve Factor（2026-08-13） |
| 17 | `9fcd8e90` | Reserve 预算改成 long+short 合并的单一额度，不再拆成两个独立额度（2026-08-13） |
| 18 | `85ecaa11` | 容量计算补上 MAX_OPEN_INTEREST_FACTOR + Available to Open 合并成一行（2026-08-13） |
| 19 | `8a0c0d83` | MAX_OPEN_INTEREST/FACTOR 接入跨市场参数漂移监控（2026-08-13） |
| 20 | `626d7139` | 软顶显示美元金额 + Cap Usage 公式写进文档（2026-08-13） |
| 21 | `68103fcb` | 软顶显示改成美元金额优先、百分比放 tooltip（2026-08-13） |
| 22 | `2acaac50` | 新增最小开仓/保证金/清算线/免手续费门槛四个参数（2026-08-13） |
| 23 | `f0ee5e8d` | 修复 Floor/Base Factor 显示未年化、四舍五入成 0% 的 bug（2026-08-13） |
| 24 | `9f9b2faf` | 修复 Skew EMA/Constant Spread/Price Impact K 精度用错成 1e30 的 bug（2026-08-13） |
| 25 | `2568e7e8` | 修复 Top Risk Assets 里"68% ≥ 300%"自相矛盾的资金费告警文案（2026-08-13） |
| 26 | `5bd6ac36` | 跨市场异常检查删掉 Reserve Factor/Max Leverage 两项 + 解释"consensus"来源（2026-08-13） |
| 27 | `210f484f` | 新增"Config Standards"固定标准值页面，取代实时 consensus（2026-08-14） |
| 28 | `fecb7f86` | Config Standards 表格：24 市场计数 + 层级列 + Grace 显示改分钟（2026-08-14） |
| 29 | `3ddecaeb` | 新增"手续费收入与分账核对"监控页面（2026-08-14） |
| 30 | `407bbd22` | 修复 indexer-collector 永久卡死 + 导航栏改名 + 24h/7d/30d 时间范围（2026-08-15） |
| 31 | `b3b30eca` | Position Risk Monitor 也加上 24h/7d/30d 时间范围选择器（2026-08-15） |
| 32 | `c9ce8746` | Liquidation/ADL Timeline 图表改总量柱状图+可排序明细表（2026-08-16） |
| 33 | `3179cd89` | 手续费收入采集器：修复disabled市场遗漏+区块高度drift，接入全历史种子，加pipeline停摆报警（2026-08-17） |
| 34 | `bf0770ae` | Trader P&L vs Pool 百分比旁加上美元金额（2026-08-17） |
| 35 | `248f2b7a` | 新增LP已实现/未实现盈亏 + 手续费注入假设计算（2026-08-18） |
| 36 | `e8af063c` | LP Realized PnL 漏掉了一条真实的、约50%的手续费收入；加上24h/7d/30d/ALL时间范围选择器（2026-08-18） |
| 37 | `58e2da64` | Fee-to-Pool 改成分段累计，不用"现在的factor乘全部历史"（2026-08-19） |
| 38 | `2a1f5c1e` | 修复ETH RESERVE_FACTOR误报漂移 + 新增储备占用告警（2026-08-19） |
| 39 | `ddbb8235` | 手续费receiver factor纳入参数漂移检查 + 更新过时UI文案（2026-08-19） |
| 40 | `c5f0eb5e` | 记录资金费LP支出不对称性（已量化为可忽略）+ 找到ecosystem地址=LPVault（2026-08-20） |
| 41 | （无commit，仅核实） | 确认40%数字的ABI出处 + 核实没有UI字段把资金费/生态假设收入当成已实现LP收益（2026-08-20） |
| 42 | `f75df35f` | 在UI里展示POSITION/LIQUIDATION_FEE_RECEIVER_FACTOR（2026-08-20） |
| 43 | `c2fb6de9` | 核实RevenuePool分配比例变动(0/50/30/20)不影响计算 + 更新过时注释（2026-08-20） |
| 44 | `e16f53d3` | 新增逐市场储备使用率历史，支撑RESERVE_FACTOR预算重新分配决策（2026-08-20） |
| 45 | `c94c7f58` | 在Dashboard新增全市场储备使用率图表 + 调整建议（2026-08-20） |
| 46 | `8302da30` | 在Dashboard新增全市场LP已实现+未实现盈亏图表 + 汇总（2026-08-20） |
| 47 | `e3e955c9` | 修复oracle价格缺失时用0价喂给getMarketInfo导致的P&L虚假暴涨暴跌（2026-08-21） |
| 48 | `ad3acbf0` | 新增LPVault epoch时间范围 + Total/Realized/Unrealized拆分显示（2026-08-21） |
| 49 | `e9bcf256` | 新增Epoch补贴规划器（Treasury→LP补款决策）（2026-08-21） |
| — | `e6307948` | 本审核文档（英文版） |
| — | 本文件 | 本审核文档（中文版） |

## 一句话总结
监控系统一开始压根没连对链（指向一个旧的 Tenderly fork）；接上真链之后，又发现它缺了监控清单里认定"最重要的指标"——全局 ADL/pnlRatio；它原本展示的一个指标（per-market ADL"距离"）读的是合约根本不用的存储槽，是假数据；24 个真实市场里有 21 个完全没有 oracle/CEX 实时数据。以上全部修复，另外新增了两个原来完全不存在的检查（跨市场集中度、参数漂移日检）。
下面每一条改动都用真实跑起来的 `pnpm dev:testnet` 实例验证过——不只是 `pnpm run typecheck` 过关，而是直接读 `redis-cli GET snapshot:protocol` 和/或 `curl localhost:3001/api/snapshot/markets` 确认数据真的对。凡是键的组合方式吃不准的地方，都去 `fx100-contracts` 的 Solidity 源码（`FX100Keys.sol` 以及真正用这个键的合约）核对过，不是看键名猜的。
## 背景：为什么会有这个分支
`fx100-monitor` 的 `main` 分支是一个已经废弃的单体 Express 原型。真正在维护的主线是 `dev`——一个规范的 `apps/{worker,web}` + `packages/*` monorepo，也是这个分支的基础。但即使是 `dev` 分支，部署配置里的合约地址还停留在 **v0.3.0**（2026-07-19），oracle/CEX feed 也只配了 BTC/ETH 两个——跟真正在跑的 **v0.3.1** 真链部署（2026-07-29，`fx100-contracts` 的 `deployment/base_sepolia_v0.3.1_260729/`，24 个真实可交易市场）完全对不上。
## 逐条提交说明
### 1. `c922c378` — 把监控同步到 fx100-contracts v0.3.1 真链部署
`packages/config/src/addresses.ts`（`baseSepolia` 块）和 `packages/config/src/markets.ts` 从 v0.3.0 地址更新到 v0.3.1。六个地址逐字节跟 `fx100-apps/apps/fx-base-app/src/config/addresses.ts`（真实交易前端自己的配置）核对过，这是目前能拿到的最强正确性证据。另外确认了 `deployment/base_sepolia_v0.3.1_260729/V0.3.1_VS_V0.3.0.md` 里写的这次重新部署没有改任何 DataStore 键的结构或 Reader ABI 字段（跟 07-19 那次 v0.3.0 同步不一样，那次是真的要改 `reader.ts`/`keys.ts`）——所以这一条纯粹是换地址，可以放心做。
### 2. `a8bf8bcc` — Goldsky 子图标签 v0.3.2 → v0.3.3
同样的逻辑：fx100-apps 线上的 `sdk.ts` 指向子图标签 `v0.3.3`；本仓库四处引用（`chains.ts`、两个 `.env.*.example`、`railway-setup.md`）还停在 `v0.3.2`。切换前先用 `_meta { block deployment }` 的 GraphQL 内省查询确认了 `v0.3.3` 端点确实活着。
### 3. `6f957a73` — 补齐 21 个真实市场缺失的 oracle/CEX feed 配置
这是**跑起来**才发现的，不是看代码看出来的：启动日志里除了 BTC/ETH 之外的每个市场都在打 `market-discovery: CRITICAL — new market detected but oracle/cex feed not configured`。`packages/config/src/feeds.ts` 的 `TOKEN_FEEDS_BY_CHAIN.baseSepolia` 原来只有 2 条，而 oracle 价格采集器、CEX 采集器、波动率采集器的全部符号列表都是从这张表派生的（`apps/worker/src/index.ts` 的 `getAllFeedConfigs()`）。补齐了缺失的 21 个，数据来自 `fx100-apps/apps/fx-base-app/src/config/feedIds.ts`。重启 worker 后验证 DOGE/LINK/AERO 等都开始收到真实 oracle 报价和 CEX 价格；只剩 marketIndex 3（MSOL，本来就没有真实 feed）还在报 CRITICAL，符合预期。
### 4. `c4a4c630` — Redis TTL 从 30 秒提到 180 秒
commit message 里自己写明了这只是快速止血：市场数从 2 个变成 24 个之后，单轮完整采集耗时从几秒暴涨到 43-83 秒（而且还在涨），早就超过了 30 秒的 TTL，导致 `apps/web` 的 markets API 退化到一条本来就是坏的、只在开发环境用的链上兜底读取路径，所有市场显示 $0。这一条只是买时间，没有解决根因（见第 5 条）。
### 5. `9e1056e0` — 采集循环并行化（真正的修复）
上面那个 TTL 快补大概撑了一个小时就开始不够用了：任务耗时继续往上爬，137 秒，168 秒，其中一个数据点直接是 **180017 毫秒——刚好卡在刚提高的 180 秒 TTL 上**，同时累计了 1360 多次 Chainlink API 限流报错。根因找到了：每个市场的循环体里有 2 次串行链上 RPC 调用（DataStore multicall + `Reader.getMarketInfo`），24 个市场就是 48 次串行请求打向公共的 `sepolia.base.org` RPC。把循环体抽成一个 `processMarket()` 函数，用手写的 `mapWithConcurrency()`（5 个并发，没引入新依赖）跑——用有限并发而不是无限制的 `Promise.all`，是因为这个仓库自己的文档里反复提到测试网限流是个真实的约束。验证结果：连续 10 轮任务耗时稳定在 11-32 秒。
### 6. `09788ac9` — 停止把 per-market ADL 阈值当真实数据展示
这是纠错，不是补漏：三个 UI 位置（`markets/page.tsx` 的 ADL 列、`asset-drawer.tsx` 的"Trader P&L vs Pool"分区色条和"ADL Thresholds"列表）把 `maxPnlFactorLong/Short` 和 `minPnlAfterAdlLong/Short` 当成合约真实的 ADL 触发/退出阈值展示。但它们不是——合约真正的 ADL 判定读的是**全局裸键**，把全场每个市场的 PnL/pool 加总比较；这几个字段读的 per-market 键是死写槽位，合约的 ADL 逻辑根本不会去读它们（跟 `fx100-contracts` 的 `docs/analysis/markets/LIVE_MARKETS.md` §三/§9.7 核对过）。一个看起来很精确但是错的数字比没有数字更危险，所以把那个基于假阈值画的分区色条/触发线可视化直接删掉了（它依赖的 `longPnlToPoolFactor`/`shortPnlToPoolFactor` 百分比本身是真的，保留）；ADL 列的 per-market"距离"改成"—"加一条解释性 tooltip；"ADL Thresholds"列表保留了原始值（毕竟是真实的链上读数，用来发现参数漂移还有用）但加了警示条并且改写了每条 tooltip 的措辞。
### 7. `4ea333de` — 接入真实的全局 ADL/pnlRatio（checklist **P0-2**）
第 6 条只能治标，这一条才是真正补上缺口：`protocolSnapshot` 原来根本没有任何全局层面的字段，Dashboard 的"Global Status"卡片实际上就是 `leveled[0]?.level`——24 个市场里最差的那个自己的告警等级，根本不是合约真正的全局判定。
- `packages/config/src/addresses.ts`：给 `MonitorContracts` 加了 `Oracle` 字段（`Reader.getAdlState(dataStore, oracle)` 需要）+ 真实地址，同样跟 fx100-apps 核对过。
- `packages/onchain/src/reader.ts`：新增 `getAdlState()`。
- `packages/onchain/src/keys.ts`：新增合约**真正**用来做这个判定的三个键——`maxPnlFactorForAdlGlobalKey`/`minPnlFactorAfterAdlGlobalKey`/`maxPnlFactorForWithdrawalsKey`，全部是裸键（不带 marketIndex）。跟 `fx100-contracts` 的 `src/constants/FX100Keys.sol:135,137,139`（纯 `keccak256(abi.encode("NAME"))`）以及每一个调用点（`AdlUtils.sol`、`ReaderUtils.sol`、`LPVault.sol`，全部把裸常量直接传给 `MarketUtils.isGlobalNetObligationRatioExceeded`，不带任何市场参数）逐一核对过。
- `apps/worker/src/collectors/marketCollector.ts`：新增一段每轮循环调用一次（不是每个市场调一次）的逻辑，用**实时**配置值（不是写死的数字）算出 checklist 里的 40/45/50/55% 四档水位，外加两个 keeper 活性派生信号（`shouldEnableAdl` 连续为真超过 5 分钟；`latestAdlTime` 在 ADL 激活期间冻结超过 5 分钟）。
- `apps/web/src/app/dashboard/page.tsx`：Global Status 卡片现在以这个真实值为主，旧的"最差单市场"逻辑降级成标注清楚的 fallback（"Worst market"），不再是头条信息。
**实机验证**（不只是过 typecheck）：`globalNetObligationRatioPct: 0.53%`，`adlTriggerThresholdPct: 55`——跟**独立读取**的 `maxPnlFactorForAdlPct: 55` 完全一致，两条完全不同的代码路径（Reader 自己动态选择的阈值，和手动哈希出来的裸键）得出一样的结果，是很强的互相印证。
### 8. `0c63ec73` — 新增跨市场单边集中度汇总（checklist **P1**）
checklist §二 里逐市场那一半（每个市场自己的 reserve usage）本来就是对的，缺的是跨市场汇总。新增了 `Σ_i max(longOiUsd_i, shortOiUsd_i) / poolUsd`（当前实际敞口）和 `Σ_i RESERVE_FACTOR_i`（理论最坏情况，目标 2.95，预算 ≤3），都放进同一个 `global` 字段。
**报告完成之前自己先抓到一个 bug**：第一版直接把所有发现的市场加总，算出 `reserveFactorBudgetUsed = 3.25`——超预算了，一开始看起来像真的发现了问题。查下去发现是 marketIndex 3（MSOL，内部测试专用合成资产）没有被标记为 `IS_MARKET_DISABLED`，所以没有被正常的逐市场流程过滤掉，而它自己配了真实的 `RESERVE_FACTOR = 0.30`——正好等于 `3.25 - 2.95` 的差值。显式把它排除掉并写清楚原因，重新验证精确等于 `2.95`。
checklist §二 第三条（skew 排行榜）不需要额外工作：`markets/page.tsx` 的 `MarketsTable` 本来就有按 `|skew|` 降序排序的列。
### 9. `a3f399e8` — recorded-price keeper 活性 + 参数漂移日检（checklist **P2**）
两个 checklist 里的待办，动手之前都先 grep 全零命中确认是真的空白：
**recorded-price keeper 活性（§四）。** `Oracle.latestRecordedPrices(token)` 是跟已经在跟踪的 Chainlink 主 oracle 价格**完全不同**的另一份链上快照——由 `AdlHandler.refreshLatestRecordedPrices()`（v0.3.1 起免权限）单独刷新，LP 提款和 ADL 结算读的是这个。一旦某个市场的这份快照过期，两条路径都会 revert。新增了 `packages/onchain/src/oracle.ts` + 一份精简版 `Oracle.abi.json`（跟 fx100-apps 的版本核对字节一致），跟每个市场原本就有的 `getMarketInfo` 调用并发读取（没有多加一次串行 RPC），把最老的过期时长 + 超期市场数汇总进 `global`。**实机发现**：各市场的刷新节奏很不均匀——BTC/ETH 几分钟内刷新过，有些市场 10 多个小时没刷新（还在 24 小时的配置阈值以内，还没到跳 revert 的地步，但值得盯着）。
**参数漂移日检（§三）。** 把"能在 /parameters 页面上看到当前值"变成"值不对就会被标出来"——引用了真实发生过的 07-29 事故（BTC/ETH 手续费在重新部署过程中被静默还原成旧值）作为这条必须自动化的理由。新增了三个之前完全没读过的键（`maxOpenInterestFactorKey`、`maxPnlFactorForTradersKey`、`executionFeeSubsidizeKey`/`executionFeeSubsidizeSizeKey`），每一个都去 `fx100-contracts` 源码核对过组合方式，不是猜的（`maxPnlFactorForTradersKey` 顺着 `PositionUtils.sol:224` → `MarketUtils.getCappedPnl` → `getMaxPnlFactor` → `FX100Keys.maxPnlFactorKey` 一路跟到底，确认它确实是 per-market+isLong 键，跟"死写"的 ADL 那两个键完全不是一回事）。对全部 24 个真实市场核对了 7 类参数，加上全局的 PnL 阶梯不变式。**明确没做的**：`MIN_DYNAMIC_SPREAD`/`MAX_DYNAMIC_SPREAD`（在 v0.3.1 下本来就是死的，属于升级到 v0.3.2 之前要做的关卡检查，不是 v0.3.1 下的日常漂移问题）；21 个非 Tier-1 市场的精确梯队归属只检查"是不是四档合法值之一"，而不是精确的 symbol→梯队映射（因为只有 Tier 1 的三个成员和 Tier 2 的 SOL/ZEC 是独立核实过的，写一份没核实过的完整映射表就是在重复这整个分支一直想避免的错误）。**实机验证**：`paramDrift` 结果为空；抽查了几个市场的原始数值（不是只信任"0"这个数字本身），确认这是真的"全部正确"，不是检查逻辑本身有漏洞放过了所有问题。
### 10. `9d386602` — Base Sepolia RPC 多路由容错（2026-08-09）
实机发现：dashboard 偶尔会显示一整段 viem 超时的原始报错文字，而不是优雅降级。用 systematic-debugging 的方法（不是猜着改）一层一层查下去，动手之前先查了四层：①`apps/web/.../snapshot/markets/route.ts` 的"仅开发环境用"链上兜底读取路径（ADR-005 规定，只有 Redis 里没有 worker 写的快照时才会跑）没有任何重试机制，报错时直接原样把 error message 塞进响应；②这条兜底路径只有在 worker 自己那一轮采集卡住超过 180 秒 TTL 时才会触发；③worker 和这条兜底路径用的是**同一个** `RPC_URL_TEST_SEPOLIA` 环境变量建 viem client，而这个变量只配了一个 URL；④`packages/onchain/src/client.ts` 其实**早就写好了**——只要配置里有多个逗号分隔的 URL，就会自动接进 viem 的 `fallback()` 容错 transport；这个机制本来就在、也写在文档里，只是从来没配置超过一个 URL。根因：单一免费公共 RPC 是唯一故障点，而容错机制早就搭好了却没人用。
修复是纯配置改动，没动一行代码：往 `RPC_URL_TEST_SEPOLIA` 里加了两个额外的公共 Base Sepolia RPC（`base-sepolia-rpc.publicnode.com`、`base-sepolia.drpc.org`），加之前都用 `eth_chainId` 验证过是活的（还测了第三个候选 `blockpi.network`，当时返回 HTTP 521，跳过没用）。已跟踪的 `.env.local-testnet.example` 模板里加了原因说明；本地实际在用的 `.env.local-testnet`（未纳入版本管理）也改成了同样的值。
### 11. `6a683998` — 调低 RPC 超时/重试参数，让容错切换更快（2026-08-09）
第 10 条加了更多节点，但没动 viem `http()`/`fallback()` 的默认值——每个 transport 默认超时 10 秒、重试 3 次，外层 `fallback()` 自己还有一层默认重试会把整个节点列表再跑一遍——三个节点都不顺的时候，最坏情况接近一分钟才会报错。用户实机遇到的就是这个：先是 `sepolia.base.org` 超时，加了第 10 条之后 `drpc.org` 又超时，都是 fallback 慢慢轮询列表时一个一个卡住报出来的。
动手之前先复现了那个真正超时的请求（`getMarkets()` 的 multicall——直接从报错信息里把原始 call data 抠出来复用）分别打给三个已配置的节点：全部在 1.2 秒内正常返回。不是节点挂了——是免费公共 RPC 偶尔限流，跟这个仓库自己文档里一直提到的测试网限流是一回事。所以要修的是"更快切换"，不是去找一个不存在的"永远可靠"的免费节点。
顺手测了一个私有的 Tenderly Gateway 节点（`fx100-contracts` 项目自己在用的），比三个公共节点都快（0.53 秒）——但这个 key 是另一个项目的凭证，monitor 拿来用可能会跟对方抢额度或者产生额外费用，动手前先问了用户，用户选择先不接这个、只调超时参数。
`packages/onchain/src/client.ts`：改成 `http(url, { timeout: 5_000, retryCount: 1 })`（不用 viem 默认值），`fallback(transports, { retryCount: 0 })`（整个列表只走一遍，不再被 `fallback()` 自己的重试逻辑再循环一遍）。最坏情况从原来的约 90 秒压到约"3 个节点 × 10 秒"，同时还留了给每个节点一次重试的余地。
### 12. `7c9fe95e` — Settlement NAV/PnL-Pool 改用 secondary price + 新增 LPVault.nav()（2026-08-12）
这次不是自己发现的 bug，是用户的纠正——但动手之前先去合约源码逐条核对了用户的说法，而不是直接照改。Dashboard 的"Net Value"和"PnL/Pool"原来是前端自己拿每个市场的 `longPnlToPoolFactor`/`shortPnlToPoolFactor`（`Reader.getMarketInfo`）加总算出来的——用的是这台 worker 自己缓存的**主 oracle 价格**，不是合约真正结算/风控判定时读的那个价格源。
逐行核对了 `src/market/MarketUtils.sol` 里用户提到的几个函数：
- `getGlobalNetObligationRatio`（`MarketUtils.sol:187-214`）核实下来是**不带符号的**（`uint256`）——每一侧先 `max(0, pnl)` clamp 到 0 以上才加总，问的是"要预留多少池子去兑付盈利仓位"，不是"LP 到底赚了还是亏了"——这跟用户描述的"有正有负"不一致，核实出来之后直接指出来了，没有顺着说法往下改。这个函数正好就是 P0-2 已经接的 `global.globalNetObligationRatioPct`（走 `Reader.getAdlState()`）——前端那份"只加正的"重新计算（`sumGrossPosFactor`）是用主价格独立算的第二套代码路径，算的是同一个概念。把这条路径退休了，PnL/Pool 现在直接读 `global.globalNetObligationRatioPct`（对应 ADR-005：读已经算好的快照，不在前端重新算）。
- 真正"有正有负"的全场 PnL，合约里没有现成的聚合函数——用已有的零件自己搭了一个：`MarketUtils.getPnl` 的精确公式（多头是 `openInterestValue − cumulativeOpenCosts`，空头反过来），逐市场套用 `Oracle.getSecondaryPrice()` 读到的价格——Base Sepolia 现在没有任何一个市场配置 Chainlink push feed，所以这个价格实际读到的就是 `Oracle.latestRecordedPrices`，跟 checklist P2 已经在盯的 recorded price 是同一份数据。用一次真实的 `cast call` 到 `latestRecordedPrices(WBTC)` 实测验证了精度：原始值 `6.41e16 / 1e12`（oracle limb 精度）＝ `$64,136`，跟当时的真实价格吻合。`packages/onchain/src/oracle.ts` 的 `getLatestRecordedPrice` 在 P2 里本来就已经逐市场并发调用了（跟 `getMarketInfo` 一起）——这次只是多用了它的 `.price`（原来只用 `.timestamp`），**零新增链上调用**。
- `packages/onchain/src/vault.ts`（新文件）：`getVaultNav()` —— `LPVault.nav()`（`VaultBase.sol:119-125`），跟用户说的一样是一个完全独立的指标（存入资产÷份额数，不含任何 PnL 调整），单独加一行放在 TVL 下面，不并进 TVL 里。精度是 1e18（`VaultBase` 自己的 `PRECISION` 常量），不是这个仓库其他地方通用的 1e30——专门写了注释防止以后被误当成 1e30 去换算。
- `apps/web/src/lib/snapshot.ts`：`protocolTotals()` 现在接收快照的 `global` 对象，直接读 `settlementNavUsd`/`dynamicPnlToPoolPct`/`globalPnlToPool`/`lpVaultNavPerShare`，不再从每个市场的 factor 重新拼装。删掉了已经没用的 `sumLongPnlFactor`/`sumShortPnlFactor`/`sumGrossPosFactor`/`globalNetTraderPnl`/`globalGrossPositivePnl` 那部分代码。
- `apps/web/src/app/dashboard/page.tsx`：`LpPoolHealthCard` 的"Net Value"改名成"Settlement NAV"（用户选的名字，没选"Dynamic NAV"），TVL 下面新加了一行"LP NAV/share"。
实机验证：`redis-cli GET snapshot:protocol` 显示 `lpVaultNavPerShare=1.00406...`，`settlementNavUsd≈$50,190,796`，对比 `TVL≈$50,190,809`（交易者整体净赚约 $12,294，`dynamicPnlToPoolPct=0.0244%`），MSOL 的 `pnlSecondary` 正确显示为 `null`（这个市场从来没设置过 recorded price）。配套的文档修正：`6d37fda2` 更新了 `docs/DASHBOARD_METRICS_GLOSSARY.zh-CN.md` 的 LP Pool Health 一节（原来错误的公式保留在文末一个可折叠区块里，当"以后别再犯"的参照）。
### 13. `7939cc1a` — 逐市场告警/OI 汇总排除 MSOL 和已下架市场（2026-08-13）
用户从 Dashboard 截图里发现的："Worst market"显示的是 `0xbfCa.../0xbf4D...`，不是一个正常的资产符号。根因：MSOL（market 3，内部测试专用合成资产）设计上就没有真实 Chainlink feed，所以它的 `oraclePrice` 永远是 `null`——`deriveOracleUpdateAgeLevel()` 把 `op==null` 直接判成 L3（最高级别），所以 MSOL 会永久压过全部 24 个真实市场，抢占"worst market"/Top Risk Assets 的位置；它的 indexToken 又没有符号映射（`packages/config/src/markets.ts` 里故意没配它），所以显示成了一串地址。
P1/P2 的全局汇总（`marketCollector.ts`）早就排除了 market 3（已下架的市场则是根本不会进快照——`processMarket()` 在写入前就把它们过滤掉了）——这次是前端**逐市场告警 rollup** 这条独立代码路径，之前没有加这层过滤。
- `apps/web/src/lib/store.ts`：`_applySnapshot` 现在把 `s.markets` 过滤成 `visibleMarkets`（`marketIndex !== 3 && !marketDisabled`），一次性用于 `marketRows`/`leveledRows`/`protocolTotals`/`oiHistory`/`oiTrend`——一处改动同时覆盖了 Worst market、Top Risk Assets、SignalStrip 计数、OI 汇总，不用一个个консumer去追。
- `apps/web/src/app/dashboard/page.tsx`：页面自己那份独立的 `markets` useMemo（喂给 `OIOverviewCard`，跟 `totals` 是两条独立路径）加了同样的过滤。
- `apps/web/src/app/positions/page.tsx`：同样的过滤，同时保留了原来 `EMPTY_MARKETS` 那个引用稳定性保护（snapshot 为空时用）。
`feature-flags`/`cost-params`/`events` 这几个页面没动——那些是运维/配置查看页，看到 MSOL 真实的链上配置反而是对的，不算误导性的风险信号，跟"worst market"这种性质不一样。
验证：`pnpm run typecheck` 14/14。实机确认原始快照里 MSOL 还在（25 个市场，market 3 仍然存在）——这次改动是展示层的过滤，不是 worker side 的改动；`/dashboard`、`/positions` 热更新后都还是 200。
### 14. `1ddd36cf` — Skew Impact 精度改成 1e18 + 补齐 22 个市场缺失的符号（2026-08-13）
又是用户从 Dashboard/Markets 截图里发现的两个问题："Skew Impact Factor"显示 `2.5000e-15`，不是 `0.0025`；除了 BTC/ETH 之外的每个市场都显示成一串截断的地址（`0x24bE.../0xbf4D...`），不是像 `ADA/USDC` 这样的符号。
- 核对 `PositionPricingUtils.sol:225-226`（`skewImpact = skewImpactFactor * skewRef / Precision.WEI_PRECISION`，`WEI_PRECISION = 1e18`）确认 `SKEW_IMPACT_FACTOR`/`MIN_SKEW_IMPACT`/`MAX_SKEW_IMPACT` 这三个键是 **WEI_PRECISION（1e18）**，不是 `asset-drawer.tsx` 共用的 `fRaw()` 对其他所有 factor 字段假设的 FLOAT_PRECISION（1e30）。实机验证：原始值 `2500000000000000 / 1e18 = 0.0025`（跟文档记录的值吻合），`fRaw()` 的 `/1e30` 算出 `2.5e-15`——正好就是截图里显示错的那个数字。加了第二个专用函数 `fRawWei()`，没有直接改 `fRaw()` 本身——因为 `fRaw()` 对它另一个调用点（Price Impact Param K，核实过是 FLOAT_PRECISION）还是对的。跟这个仓库其他地方已经记录过的 `constantPriceSpread` 用 WEI_PRECISION 是同一类陷阱——不是每个 `*_FACTOR` 结尾的键都是 1e30。
- `apps/web/src/lib/snapshot.ts` 的 `TOKEN_SYMBOLS` 表里有 BTC/ETH/USDC（好几代 Sepolia USDC 地址，但没有 v0.3.1 当前这一个）加几个给未来主网部署留的 Base 主网参考地址——但其余 22 个真实市场各自专用的 Sepolia 测试代币地址从来没有配进去，所以 `getTokenSymbol()` 对这些全部退化成截断地址。补齐了全部 22 个（HYPE 到 DOGE）加上当前 v0.3.1 的 USDC 地址，数据来自 `fx100-contracts` 的 `LIVE_MARKETS.md` §二，并跟 `fx100-apps` 的 `addresses.ts` 的 `baseSepoliaTokenAddresses`（实盘交易前端自己的符号数据源）交叉核对过——跟第 1 条同步合约地址用的是同一个核对方法。
验证：`pnpm run typecheck` 14/14。用脚本核对了更新后的表（38 条，没有格式错误的地址，DOGE/ADA/v0.3.1 USDC 都能解析出来）。`/dashboard`、`/markets` 都还是 200。
### 15. `c4a335d1` — 逐市场 drawer 删掉重复的全局 TVL 一行（2026-08-13）
用户从 ETH 市场 drawer 的截图里发现的：让我核对"LP Pool"这个 tab 里哪些字段其实是全场共用/在每个市场都一样，哪些是真正逐市场不同的——共性的去掉，个性的留下来并说明怎么算的。
- "Pool Values"区块里的"LP Pool TVL"——每一个市场的 drawer 里显示的都是完全一样的数字（所有 24+ 个市场共用同一个 LPVault），它自己的说明文字早就写着"same value across all markets"。删掉了；这个数字已经在 Dashboard 的 LP Pool Health 卡片里展示过一次了（TVL / Settlement NAV / LP NAV per share）。
- "Pool Value After This Market"留下来了——核实过它确实逐市场不同（每个市场自己的 `longPnlToPoolFactor`/`shortPnlToPoolFactor` 不一样），公式也跟截图对得上（`TVL $50.23M × (1 − (−0.000723) − 0.000099) = $50.26M`，精确匹配）。把区块名改成"Pool Value If Only This Market Settled"，tooltip 重写成把公式写清楚，并明确标注这是一个假设性数字（不能跨市场加总，跟真正的 Settlement NAV——第 12 条修的那个把全场 PnL 用 secondary price 正确加总的协议级数字——不是一回事）。
- "Trader P&L vs Pool"里那条过时的提示（"the ADL trigger threshold is a global check this drawer doesn't have yet"）也更新了——这个全局检查现在已经有了（checklist P0-2，`Reader.getAdlState()`，第 7 条），显示在 Dashboard 的 Global Status 卡片上，只是没有在这个逐市场 drawer 里重复一份。改成指向那边，而不是暗示"还没做"。
这次核对没发现数据本身算错（唯一留下来的公式跟截图精确对得上）——纯粹是"不要在每个市场的视图里重复全局状态"的清理。验证：`pnpm run typecheck` 14/14，`/markets`、`/dashboard` 都还是 200。
### 16. `2b232c40` — ADL Thresholds 挪出逐市场 drawer + 删掉已废弃的 OI Reserve Factor（2026-08-13）
用户又从另外两张 drawer 截图里发现的：(a) "ADL Thresholds"这个区块还留在逐市场 drawer 里，可这 4 个值全都是全局裸键（第 6 条`09788ac9`早就确认过是死写）——"这些参数已经变成了全局的，跟 market 没关系了，看看怎么处理，比如单独做个 ADL 的地方？"；(b)"OI Reserve Factor Long/Short"还有存在的必要吗；(c)"Reserve Usage Risk"算得对不对——两张不同截图里 Long 显示"of $13.36M free"、Short 显示"of $15.86M free"，为什么不一样，具体怎么算的。
- 把"ADL Thresholds"这个区块从 drawer 里整块删掉了（`asset-drawer.tsx`）。改在 Dashboard 的 Global Status 卡片上加了一个全局阶梯 `Tooltip`——这才是真正"全局的地方"：ADL 目标/退出线（45%）/ 提款封锁线（50%）/ ADL 触发线（55%）/ Trader 利润上限（60%）一次性列全。
- 为了这个 tooltip，往全局 snapshot 里加了 `tradersCapPct`（对应 `MAX_PNL_FACTOR_FOR_TRADERS`）。跟前面三个不一样，这一个才是真正的逐市场键——但参数漂移日检（第 9 条）已经确认它在全部 24 个真实市场上都统一是 60%，所以直接取第一个真实市场自己的值，不用重新做全局聚合。**在报告完成之前自己先抓到并修了一个 bug**：第一版实现算出来是 0～1 的小数（`0.6`），不是百分数（`60`），跟同一个类型里所有其他 `*Pct` 字段的口径不一致——改成跟兄弟字段一样的 `toPct` 缩放方式（`× 1_000_000n / P30 / 10_000`），修完之后又用 `redis-cli GET snapshot:protocol` 现场核对了一遍（`global.tradersCapPct: 60`）。
- 把"OI Reserve Factor Long/Short"从 drawer 的 Reserve Parameters 区块和 `anomalies.ts` 的参数漂移检查里都删掉了。`OPEN_INTEREST_RESERVE_FACTOR` 在 v0.3 就已经被完全砍掉了（核对过 `fx100-apps` 的 `d3e3f1c7` 这个 commit——`useMarketsData.ts` 把它硬编码成 `0n`，生成键哈希的辅助函数也不再给它生成槽位）——设计上每个市场永远是 0，拿它跟"全场也永远是 0"的共识值比，永远不可能真的报出异常。
- Reserve Usage Risk 的算法核对过了，是对的：直接从 Redis 里读同一个瞬时快照里 ETH 市场的原始数据，`reservedUsdLong + availableLongUsd == reservedUsdShort + availableShortUsd == $18,084,023.41`，分毫不差（两边其实都来自同一个 `poolUsdWithoutPnl × reserveFactor` 总额度，只是按当前 OI 拆成"已占用"和"还剩多少"两部分展示）。用户两张截图里看到的差异（$13.36M vs $15.86M "free"）是因为两张截图不是同一时刻抓的——5 秒一个刷新周期，这期间 OI 在动、但共用的总额度不变——不是算法本身有问题。
验证：`pnpm run typecheck` 14/14。用 `pnpm dev:testnet` 实跑 + `redis-cli GET snapshot:protocol` 核对：修完缩放 bug 之后 `global.tradersCapPct` 读出来是 `60`。`/dashboard`、`/markets` 都还是 200。
**事后订正（见第 17 条）**：上面这条"Reserve Usage Risk 的算法核对过了，是对的"这句话本身没错——当时核对的是"两边的算术是否自洽"（`reservedUsdLong + availableLongUsd` 是否等于 `reservedUsdShort + availableShortUsd`），确实分毫不差。但用户后来继续追问，逼着我去读了 `MarketUtils.sol` 才发现：把 Long/Short 各自拆开、各自对着同一个 reserveFactor 独立判断"够不够"，这个**模型本身**就是错的——链上从来不是这么判断的。数字算对了，不代表这套"两边各自有额度"的框架是对的。详见第 17 条。
### 17. `9fcd8e90` — Reserve 预算改成 long+short 合并的单一额度，不再拆成两个独立额度（2026-08-13）
用户自己主动报的，而且态度非常直接：对整个 reserve 模型本身表示怀疑——"long和short的reservefactor并不区分，是共享的，总计达到reserve要求就可以了，所以你区分long和short本身就是错的"——并且要求我去实际读一遍 `MarketUtils.sol` 的代码，而不是继续相信现有的设计。
核对了 `MarketUtils.sol:667-685`（`validateOpenInterestReserve`）：合约实际检查的是 `(longOiTokens + shortOiTokens) × indexTokenPrice.max` 对着**一个** `poolUsdWithoutPnl × RESERVE_FACTOR` 额度——单一合并分子，单一额度，一个 revert 条件。`RESERVE_FACTOR` 这个键本身压根没有 `isLong` 这个维度：`FX100Keys.reserveFactorKey(marketIndex)` 不接受 `isLong` 参数——每个市场只有一个 DataStore 槽位，不是两个。
用户是对的，之前的代码是错的：它把同一个 `RESERVE_FACTOR` 键读了两遍，分别叫 `reserveFactorLong`/`reserveFactorShort`，然后把 Long OI 和 Short OI 分别拿去跟这个（完全一样的）额度**独立**比较——这样两边的进度条都可能显示"安全的绿色"，而实际上合并总额早就超了额度，链上此刻任何一边的 `increasePosition` 都已经在 revert。
- `marketCollector.ts`：reserve usage 的分子现在直接用 `marketInfo.totalNominalOI`——直接从 `Reader.getMarketInfo` 读出来，跟合约自己 revert 检查用的是完全同一个值，没有本地重算、没有精度风险——拿去跟一个统一的 `reserveCap` 比较。`availableLongUsd`/`availableShortUsd` 现在也直接读 `Reader.getMarketInfo`（它内部正确地取了每边 `min(硬OI上限剩余量, 因子OI上限剩余量, 共享reserve剩余量)`），不再用同一个错误的"各自独立额度"假设在本地重新算一遍。
- `dsV.reserveFactorLong`/`reserveFactorShort` 合并成一个 `dsV.reserveFactor`（读一次键就够了，不用读两次一样的）。
- `snapshot.ts` / `anomalies.ts` / `asset-drawer.tsx` / **`cost-params/page.tsx`**（另一个页面，有一模一样的 Long/Short 拆分，第 16 条删 drawer 的 `OI Reserve Factor` 时漏掉了这个页面）："Reserve Factor Long"/"Reserve Factor Short" 在每一处消费方都合并成一行"Reserve Factor"——配置展示、参数漂移检查，以及 cost-params 页面自己那两行同样已经废弃的 `OI Reserve Factor Long/Short` 也一并删掉了。
- `asset-drawer.tsx` 的"Reserve Utilisation"区块重写了：改成一个合并的"Reserve Usage Risk"进度条（原来是两条独立的 Long/Short 进度条），另外加一行标注清楚的"Available to Open (Long/Short)"，展示那部分真正逐边不同的余量。
- 把 `packages/metrics/src/pool.ts` 整个文件删掉了——核实过是死代码（grep 了 `computeReserveUsage`/`computeAdlDistance` 的引用，哪里都没人调用）。它编码的正是这套同样错误的"long/short 独立 reserve 公式"，外加已经被证明是错的、逐市场 ADL 距离公式（读的是死键，第 6 条修过）。留着不删的话，以后有人想找"reserve 公式该怎么算"，翻到这个文件就会抄错。
验证：`pnpm run typecheck` 14/14。用 `redis-cli GET snapshot:protocol` 现场核对了一个刚跑完的 worker 周期：`reservedUsd + availableUsd == poolUsd × reserveFactor`，分毫不差（$18,085,075.32），`reserveUsageRisk` 现在是一个数字（40.08%），不再是两个数字取 `max(long, short)`。`/dashboard`、`/markets`、`/cost-params` 都还是 200。
### 18. `85ecaa11` — 容量计算补上 MAX_OPEN_INTEREST_FACTOR + Available to Open 合并成一行（2026-08-13）
紧接着第 17 条，用户发现刚上线的 drawer 里"Available to Open (Long)"和"(Short)"显示的是完全一样的数字（都是 $10.86M），要求合并成一行；但跟 RESERVE_FACTOR 那次不一样，用户这次指出 `MarketUtils.getMaxOpenInterestFactor`（在 `ReaderUtils.getAvailableLiquidityUsd` 里被调用）在链上确实是带 `isLong` 参数的，这个限制"也需要加上去"——同时让我核对一下 `MAX_OPEN_INTEREST_FACTOR` 是不是真的每个市场都配成了 100%，按他自己的参数表。
核对了 `MarketUtils.sol:639-658`（`validateOpenInterest`，每次 OI 增加都会走到，链路是 `applyDeltaToCumulativeOpenCosts` → `PositionUtils.sol:559`）：合约**同时**强制两个上限——一个硬上限（`MAX_OPEN_INTEREST`）和一个跟着资金池比例走的软上限（`MAX_OPEN_INTEREST_FACTOR × poolUsd`），两个"且"关系（哪个更紧就按哪个来）。跟 `RESERVE_FACTOR`（第 17 条已经修过）不一样，`getMaxOpenInterestFactor(dataStore, marketIndex, isLong)` 在链上确实是按边分开存的——这次用户是对的，跟上次的情况不一样。
- `marketCollector.ts` 的 Global Cap 使用率（`gcLongUsage`/`gcShortUsage`）原来只拿 OI 跟硬上限比，完全没管软上限。真实链上现在软上限（资金池 × 100% ≈ $50.2M）反而比硬上限（$100M）更紧，所以原来的口径把实际容量占用低估了差不多一半。改成两边各取 `min(硬上限, 软上限)`，跟 `validateOpenInterest` 完全对齐——现场核对：ETH 的 long 使用率从原来只对着 $100M 算出来的 ~5.1%，变成对着正确的 ~$50.2M 有效上限算出来的 10.3%。
- 在 `oi` snapshot 里加了 `maxLongFactor`/`maxShortFactor`，asset-drawer 和 `cost-params` 的 Capacity tab 里都补了一行"Max Long/Short OI Factor"——这个参数本身现在看得见了，也纳入了参数漂移检查，不再是悄悄埋在使用率里的隐藏数字。
- "Available to Open (Long)"/"(Short)" 合并成一行"Available to Open (Long or Short)"——用 `min(availableLongUsd, availableShortUsd)`，不是随便挑一边显示。这两个数字现在在全部 24 个真实市场上都一样，纯粹是因为 `MAX_OPEN_INTEREST` 和 `MAX_OPEN_INTEREST_FACTOR` 目前配得足够宽松，两边始终是共享的 reserve 余量（第 17 条）先被顶到；用 `min()` 而不是固定显示某一边，是为了以后万一某边自己的 OI 上限变紧了，这个数字还能自动反映出真正更紧的那一边，而不是悄悄藏起来。
- **在报告出去之前自己先抓到了一次假警报**：核对用户说的"MAX_OPEN_INTEREST_FACTOR 全部配成 100%"这件事时，有一次 `redis-cli` 读到 5 个真实市场（XLM/ENA/TIA/ONDO/XRP）显示 `0%`——按上面 `validateOpenInterest` 的逻辑，这意味着这 5 个市场任何一边都开不了新仓了。但紧接着连续核对了 3 个 worker 周期，全部显示健康（100%，没有报错），说明这不是真的链上配置问题。根因找到了：`batchReadDataStore` 用的是 `multicall({allowFailure: true})`——某一个键单次读取失败时会悄悄把那个值默认成 `0n` 而不是抛错，而参数漂移检查直接把这个默认值当真去比较，本来会在 dashboard 上报出一条吓人但是假的"5 个市场瘫痪了"的漂移记录。修复方式：给参数漂移循环加了个判断（`snap.errors?.datastore`），只要某个键这一轮读取失败了就跳过那一条检查，不再把失败兜底的 `0n` 当成真实数据用。
验证：`pnpm run typecheck` 14/14。用 `pnpm dev:testnet` + `redis-cli GET snapshot:protocol` 现场核对：连续 3 个周期，所有真实市场的 `maxLongFactor`/`maxShortFactor` 都读到 `1e30`（100%）；ETH 的 `globalCap` 现在是 `{longUsage: 0.103, shortUsage: 0.042}`；`availableLongUsd == availableShortUsd` 没变。`/dashboard`、`/markets`、`/cost-params` 都还是 200。
### 19. `8a0c0d83` — MAX_OPEN_INTEREST/FACTOR 接入跨市场参数漂移监控（2026-08-13）
紧接着第 18 条，用户马上追问："MAX_OPEN_INTEREST_FACTOR 和 MAX_OPEN_INTEREST 也加上吧，因为也是根据 LP 算出来的，也要监控起来，分别显示 Long 和 Short。"
这两个参数虽然已经在全局的 `paramDrift` 里检查过了（就是 dashboard 上那个"Param drift: N issue(s)"的提示），但一直没接入 drawer 里 Capacity tab 那套逐市场、跨市场共识的琥珀色小圆点异常提示——其他参数（手续费、点差、资金费、reserve、杠杆）都已经有这套机制了（`anomalies.ts`）。这次加了**四条**独立的 `PARAM_DEFS`，不是一条：跟 `RESERVE_FACTOR`（第 17 条已经合并成一个值）不一样，`MarketUtils.getMaxOpenInterest`/`getMaxOpenInterestFactor` 在链上确实都带 `isLong` 参数，Long 和 Short 是两个真实、独立的数值，值得分开监控——这跟第 18 条的结论是一致的，不是退回到第 17 条"把不该拆的强行拆开"的老毛病。
- `anomalies.ts`：加了 `fmtUsd30`（给美元计价的 `MAX_OPEN_INTEREST` 用的一致性比较格式——目前 `PARAM_DEFS` 里其余项都是百分比因子，这是第一个美元计价的）以及四条新条目："Max Long OI"、"Max Short OI"、"Max Long OI Factor"、"Max Short OI Factor"，全部挂到已有的"capacity" drawer tab 上。
- `asset-drawer.tsx`：给第 18 条新加的那四行 `ParamRow` 接上了 `anomaly={anomalyMap.get(...)}`（之前只显示原始数值，完全没做跨市场核对）。顺手修正了一处第 18 条遗留的过时提示——"Headroom USD"的 tooltip 还写着"MAX_OPEN_INTEREST − current OI"，但 `gcHeadroomUsd` 在第 18 条早就改成了两边各自 `min(硬上限, 软上限)` 之和。
验证：`pnpm run typecheck` 14/14。用 `redis-cli GET snapshot:protocol` 现场核对：拿 Python 把共识检查逐一模拟了一遍，覆盖全部 24 个真实市场——Max Long/Short OI 全部统一是 $100,000,000，Max Long/Short OI Factor 全部统一是 100.0000%，共识基线能正常形成，今天不会有假异常报出来。`/markets`、`/cost-params`、`/dashboard` 都是 200。
### 20. `626d7139` — 软顶显示美元金额 + Cap Usage 公式写进文档（2026-08-13）
紧接着第 19 条，用户马上追问："MAX_OPEN_INTEREST_FACTOR × LP 需要也显示出来（参数只小字或 tip 方式显示就行吧），为 OI 的软顶，按 Long 和 Short 分的，而 Max Long OI/Max Short OI 为硬顶。另外就是解释一下 Long Cap Usage，Short Cap Usage，Total Cap Usage 分别怎么算的，核对一下，也把这些记录到文档，方便我以后知道这些数据的来源和计算公式。"
- `marketCollector.ts`：把已经算好的 `factorCapLong`/`factorCapShort`（`poolUsd × MAX_OPEN_INTEREST_FACTOR`）暴露成 `oi` snapshot 里的 `maxLongFactorUsd`/`maxShortFactorUsd`，这样前端可以直接在百分比旁边显示"= $50.24M（今天）"，不用在浏览器端重新算一遍池子×因子。
- `asset-drawer.tsx` / `cost-params/page.tsx`：把"Max Long/Short OI"改名成"(Hard Cap)"、"Max Long/Short OI Factor"改名成"(Soft Cap)"，这样两个上限一眼就能看出是配对的，不是两个不相关的数字；软顶那两行的 tooltip 里加上了实时美元金额。给之前完全没有说明的 Long/Short/Total Cap Usage 三行、以及"Cap Risk Status"徽章都加上了公式 tooltip（这个徽章的说明文字之前是过时的，还写着"OI / MAX_OPEN_INTEREST"，是第 18 条改成 `min(硬顶, 软顶)` 之前留下的）。
- `DASHBOARD_METRICS_GLOSSARY.zh-CN.md`：新增"三、市场容量上限"整节，覆盖硬顶、软顶、有效上限 `min(硬顶, 软顶)`、Long/Short/Total Cap Usage、Cap Risk Score/Status、Headroom USD——每一项都按文档现有格式配好公式+代码位置。特别标注了 Total Cap Usage 是"合并持仓 ÷ 合并有效上限"，**不是** Long/Short 两个百分比的简单平均；也特别说明这一节讲的是逐市场、Long/Short 各自独立的机制，跟"二、LP Pool Health 卡片"里的 Reserve（协议级、全场共用一个额度，第 17 条修的）不是一回事，避免以后混着理解。
验证：`pnpm run typecheck` 14/14。用 `redis-cli GET snapshot:protocol` 现场核对了一个刚跑完的 worker 周期：`maxLongFactorUsd == maxShortFactorUsd == $50,240,103.11`（`poolUsd × 100%`），跟 `globalCap.longUsage`/`shortUsage` 用的是同一个有效上限，数字对得上。`/dashboard`、`/markets`、`/cost-params` 都是 200。
### 21. `68103fcb` — 软顶显示改成美元金额优先、百分比放 tooltip（2026-08-13）
紧接着第 20 条，用户立刻纠正："反过来，因为平时看的是美元 cap，参数作为鼠标悬停能看到就行了。"
第 20 条做反了——主显示是百分比参数（`MAX_OPEN_INTEREST_FACTOR`），美元金额放在 tooltip 里。改成 `asset-drawer.tsx` 和 `cost-params/page.tsx` 里"Max Long/Short OI Factor (Soft Cap)"主显示美元金额，百分比挪进 tooltip。同步更新了指标释义文档里关于显示顺序的说明。
（这次提交的 commit message 第一次提交时被弄乱了——shell 命令里 `printf` 的 `%` 转义把文字弄成了乱码（`0x0p+0s tooltip`）——当场发现，用纯文本文件走 `git commit -F` 重新写了 message，确认 `origin` 跟本地 `HEAD`完全一致之后用 `--force-with-lease` 重新推送修正。没有动任何代码，只是消息文本。）
验证：`pnpm run typecheck` 14/14。`/markets`、`/cost-params` 都是 200。
### 22. `2acaac50` — 新增最小开仓/保证金/清算线/免手续费门槛四个参数（2026-08-13）
用户报的："capacity 再增加一些，比如最小清算线，base sepolia 配置的和 Min Collateral Factor 一样，还有最小开仓金额，最小保证金金额，免手续费最小金额（现在配置为 0），有些是全局的吧，我也有点忘了。"
先去 `fx100-contracts` 源码核对了这四个到底是什么，没有直接照着感觉接线——结果四个里形态并不完全一样：
- **`MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION`**（"最小清算线"）是逐市场的键（`FX100Keys.sol:1258-1260`，带 `marketIndex`）——跟已经在显示的"Min Collateral Factor"（开仓侧杠杆上限）是**两个完全独立的 DataStore 键**，用在 `PositionUtils.isPositionLiquidatable` 清算判定里，不是开仓那条检查。这个值早就被 worker 读进来了（`dsV.minCollateralFactorForLiquidation`），但一直没暴露给前端类型、也没在任何地方显示——补进了 `snapshot.ts` 和两个页面的 Capacity tab。**现场核对结果：用户的印象是对的**——全部 24 个真实市场，这个值今天都跟开仓侧因子完全相等（比如 ETH 都是 0.50%），不过这是当前的配置选择，链上这两个键理论上是可以配成不同数值的，不是合约强制相等。
- **`MIN_POSITION_SIZE_USD`**（"最小开仓金额"）和 **`MIN_COLLATERAL_USD`**（"最小保证金金额"）两个都是真正的全局键（`FX100Keys.sol:426,431`，纯裸常量，任何地方都没有 `marketIndex` 参与哈希）——在 `packages/onchain/src/keys.ts` 里加了 `minCollateralUsdGlobalKey`/`minPositionSizeUsdGlobalKey`，跟第 9 条 ADL 阶梯那几个全局裸键用的是同一套模式，只在全局批量读取那里读一次（不会重复读 24 遍）。两个页面的 Capacity tab 都加了标注"(Global)"的行，数据从全局 store 里取（不是从某个市场的 snapshot 里取，因为 drawer 每次只拿到一个市场的数据）。现场核对：`MIN_COLLATERAL_USD = 0`（跟之前一个已经拍板接受的设计决定一致），`MIN_POSITION_SIZE_USD = $10`。
- **`EXECUTION_FEE_SUBSIDIZE`****/****`EXECUTION_FEE_SUBSIDIZE_SIZE`**（"免手续费最小金额"）早就被 worker 读进来给参数漂移检查用了，但从来没显示出来过。现在提升成了 `feeParams` 里的字段（跟其他手续费因子放一起），Fees tab 里新增了"Execution Fee Exemption"小节，drawer 和 cost-params 页面都加了。核对了 `GasUtils.isExecutionFeeSubsidizedAtCreation`，确认这两个门槛不是叠加生效的，是按订单类型二选一（USD 计价用一个，token/合约张数计价用另一个）——`0` 表示永远豁免，`type(uint256).max` 表示永不豁免。现场核对：全部真实市场今天两个都是 `0`（永远豁免），跟之前"24/24 全免"的记录对得上。
这四个参数也都写进了 `DASHBOARD_METRICS_GLOSSARY.zh-CN.md` 新增的"四、开仓/清算下限参数"这一节——公式、代码位置、哪个是全局哪个是逐市场，都列清楚了。
验证：`pnpm run typecheck` 14/14（加了新的 key 函数之后 `packages/onchain` 也重新 build 过了）。用 `redis-cli GET snapshot:protocol` 现场核对：`minCollateralUsdGlobal=0`，`minPositionSizeUsdGlobal=$10`，全部 24 个真实市场的 `minCollateralFactorForLiquidation == minCollateralFactor` 分毫不差，`executionFeeSubsidize`/`Size` 全部市场都是 `0`。`/markets`、`/cost-params`、`/dashboard` 都是 200。
### 23. `f0ee5e8d` — 修复 Floor/Base Factor 显示未年化、四舍五入成 0% 的 bug（2026-08-13）
用户从 ETH drawer 的截图里发现的："Floor Factor"显示 `0.000000%`、"Base Factor"显示 `0.000005%`，但用户记得 Floor 应该是年化 `10.95%`——引用的是 `fx100-contracts` 里 `docs/analysis/TEST_REVIEW_FINDINGS.md` §7.2 的一份参考表，里面按年化列出了 Floor/Base/Min/Max 在 BTC 跟其余 23 个真实市场（这 23 个共用同一套"ETH 基线"参数，该文档自己也标注这是已知问题）上的数值。
先去核对了 `MarketUtils.sol:526-539`，没有直接猜着改：`fundingFactorPerSecond = clamp(floorFactor + baseFactor×skew/1e18, minFundingFactorPerSecond, maxFundingFactorPerSecond)`——Floor 和 Base 是直接加进跟 Min/Max 完全同一个被 clamp 的表达式里的，证明这四个在链上是完全同一套 1e30 每秒精度的数字。monitor 自己的代码也印证了这个 bug：Min/Max Per Second 早就正确地乘了 3600 换算成 %/h，但 Floor/Base Factor 用的是跟 `RESERVE_FACTOR` 这类不带时间维度的普通因子一样的裸换算（`raw/1e30×100`），完全没做任何时间缩放——保留6位小数的情况下，一个年化约10.95%的每秒分数四舍五入下来就是"0.000000%"。链上的**数值本身从来没错**，错的只是显示层缺了这一步时间缩放。
- `asset-drawer.tsx` / `cost-params/page.tsx`：加了 `fmtAnnualPct`（`raw × 31,536,000 × 100`），跟 `fx100-contracts` 自己的年化换算约定对齐（`test/fixtures/Fx100Setup.t.sol` 里的 `FX100_SECONDS_PER_YEAR` 常量）。四个配置参数（Floor、Base、Min、Max）一起改成年化显示，没有只修 Floor/Base——Min/Max 之前在 drawer 里显示成 %/h、在 cost-params 页面显示成裸科学计数法，跟外部广泛引用的年化数字都对不上号。Funding tab 拆成了两组："Long/Short Per Second"（当前算出来的实时费率，保持 %/h，跟上面 Funding APR 卡片的每小时节奏一致）vs. Floor/Base/Min/Max（决定这个公式的四个配置参数，现在统一年化显示）。
- `anomalies.ts`：把"Funding Floor"/"Funding Base"两个跨市场共识检查的格式化函数也换成了同样的年化口径，这样异常提示里"Consensus: X%"跟主显示的年化数字能对上，不再是旧的裸分数字符串。
验证：`pnpm run typecheck` 14/14。用 `redis-cli GET snapshot:protocol` 现场核对：把全部24个真实市场的年化数值算出来，跟 `docs/analysis/TEST_REVIEW_FINDINGS.md` §7.2 的参考表逐项对比——**完全吻合**：WBTC（market 1）`floor=10.9500% base=134.5723% min=-13.3940% max=96.5221%`；其余23个真实市场（含 ETH）全部 `floor=10.9500% base=142.7897% min=-27.5075% max=111.3878%`。`/markets`、`/cost-params` 都是 200。
### 24. `9f9b2faf` — 修复 Skew EMA/Constant Spread/Price Impact K 精度用错成 1e30 的 bug（2026-08-13）
用户从 ETH drawer 的截图里发现的："Skew EMA 4.2601e-13"看起来不对；另外又说 Constant Spread 和 Price Impact Param K 也不对，Oracle 里还缺了 skew 相关的参数，动态价格的计算公式也应该连同全部参数一起列出来。
跟第 23 条修 Funding Floor/Base 是同一类 bug：`CONSTANT_PRICE_SPREAD`、`PRICE_IMPACT_PARAMETER`、`SPREAD_SKEW_IMPACT_FACTOR`、`MIN`/`MAX_SKEW_IMPACT_FACTOR`，以及资金费的 skew EMA，链上全部是**WEI_PRECISION（1e18）**，不是 FLOAT_PRECISION（1e30）——核对的是 `PositionPricingUtils.sol` 在 `origin/release/v0.3.1`（Base Sepolia 真实部署的那个版本；本地 `src/` 已经是 v0.3.2，多了一个链上还没生效的 `min`/`maxDynamicSpread` clamp，所以特意直接读 v0.3.1，避免把还没上链的公式写进文档）。`skewImpactFactor`/`minSkewImpact`/`maxSkewImpact` 其实当天早些时候（`asset-drawer.tsx` 的 `TabOI`）已经因为一次之前的报告修过 1e18 了——这次是把同样的修法延伸到剩下还在用 1e30（`fmtFactor30`/`fRaw`）的地方：`fmtSkewEma`（skew EMA 除以了 1e30，把一个真实约 43% 的失衡显示成了"4.2601e-13"）、drawer 的 Oracle tab 里的 Constant Spread 和 Price Impact Param K，以及 `cost-params/page.tsx` 整个 Spread tab（这个页面还额外把 Bid/Ask Depth——一个绝对美元值——套进了无量纲的 `fRaw()`，而不是 `formatUsd()`）。
- `asset-drawer.tsx`：修了 `fmtSkewEma`（改成 `/1e18`），加了 `fmtFactor18`，Constant Spread 换成它、Price Impact Param K 换成已有的 `fRawWei`（1e18）。把 Skew Impact Factor/Min/Max 和当前 Skew EMA 也加进了 Oracle tab 的 Price Parameters 区块（之前只在 Open Interest tab 里），因为它们是这个 tab 讲的同一套公式的输入。新增了一个"Dynamic Spread Formula (Execution Price Markup)"面板，把 v0.3.1 的完整公式列出来（`dynamicSpread = max(0, skewImpact + constantSpread + priceImpactSpread)`、价格冲击那部分 `exp()`/线性取 max 再 clamp、skew 冲击的 clamp，以及它最终怎么乘进开仓执行价里）——需要手算这个公式的所有参数现在都在一处能看到。
- `cost-params/page.tsx`：整个 Spread tab 同样换成 `fmtFactor18`/`fRawWei`，Bid/Ask Depth 改成 `formatUsd`，市场列表总览那一栏的 spread 列也修了。把已经彻底没人用的 `fRaw()`（1e30）删掉了——剩下的调用点全都需要 1e18。
- `anomalies.ts`：把"Constant Spread"/"Price Impact K"两个跨市场共识检查的格式化函数也换成了同样的 1e18 口径；同样删掉了这里已经没人用的 `fRaw()`。
验证：`pnpm run typecheck` 14/14。用 `redis-cli GET snapshot:protocol` 现场核对 ETH：`constantSpread=0.01%`、`priceImpactParam=0.6`、`skewImpactFactor=0.0025`、`minSkewImpact`/`maxSkewImpact=±0.5%`、`skewEma≈0.4062`（≈43% 失衡，跟之前对那个错误显示值做的粗算吻合）——都跟 `fx100-contracts` 部署文档里已经记录的数值对得上。`/markets`、`/cost-params` 都是 200。
### 25. `2568e7e8` — 修复 Top Risk Assets 里"68% ≥ 300%"自相矛盾的资金费告警文案（2026-08-13）
用户从 Dashboard 截图里发现的：ETH 在"Top Risk Assets"的 reason 那一列显示"Funding APR 68% ≥ 300% (P99)"——自相矛盾，68 明明不≥300。追问这个硬编码的"300% (P99)"到底是从哪来的。
根因：`dashboard/page.tsx` 的 `getReason()` 不管实际用的是哪个门槛，一律硬编码打印"≥300% (P99)"/"≥200% (P95)"。`computeFundingBand()`（worker 那边）在有历史资金费百分位数据时，其实是正确地用了**每个市场自己的真实、动态的百分位门槛**（来自 `packages/config/src/percentiles.ts` 的历史资金费采集器）——只有在某个 symbol 还没采集到百分位数据时，才会退回 PRD 里那个 200%/300% 的占位数字。ETH 真实的 live P99 根本不接近 300%——分类逻辑是对的，纯粹是显示文案一直是个不管用哪个门槛（live 还是 fallback）都不会跟着变的死文字。
第一版修复算出了真实门槛，但选边的逻辑是"long/short 哪个绝对值大就显示哪个"——**提交前自己现场核对数据时抓到了**：BTC 被判定"critical"其实是因为**空头**那一侧撞穿了一个很紧的 P1 尾部门槛（−13.4% vs 门槛 −13.3%），而多头的数字看起来更大（48.8%），但离它自己那个更松的 P99 门槛（116%）远得很。如果显示"49% ≥ 116%"，跟要修的这个 bug 一样自相矛盾——多空两侧的门槛本来就是不对称、独立的（正向资金费用上尾 P95/P99，负向资金费用单独算的、镜像过来的下尾 P5/P1），绝对值大的那一侧不一定就是真正撞线的那一侧。
- `marketCollector.ts`：`computeFundingBand()` 现在会先判断到底是 long 还是 short 真正触发了 l1/l2 分类，返回**那一侧自己的数值**（`refPct`）和**那一侧自己算出来的门槛**——这样 `refPct` 的绝对值必然 ≥ 返回的门槛，结构上就不可能自相矛盾。如果当前两边都没撞线，`refPct` 会预览绝对值更大那一侧自己的门槛（纯粹展示用，不是真的告警）。
- `snapshot.ts` / `dashboard/page.tsx`：加了 `fundingRefAnnualPct`，把硬编码的"≥300% (P99)"/"≥200% (P95)"换成了真实门槛 + "live"/"fallback"标注，一看就知道这个数字是哪来的。L3（≥2000% APR）是单独一条固定的绝对规则，单独说清楚，不再被错误地贴上"P99"的标签。
- `asset-drawer.tsx`：Funding Status 的 tooltip 图例现在显示这个市场自己真实的 P95/P99 门槛，不再是所有市场统一的那个 200%/300%。
顺带按用户要求，拿一份新鲜的现场快照核对了 Markets 列表的 |Skew|、Cap Usage、Funding APR、PnL/Pool 这四列——全部用的都是本 session 之前已经修过或已经单独核实过的字段（Cap Usage：第18-20条修的 `min(硬顶,软顶)` 有效上限；Funding APR：`fundingRateToAnnualPct`，核对过用的是跟第23条资金费系数修复同一套 ×31,536,000 年化公式，从来没有过 bug；|Skew| 和 PnL/Pool：本来就是简单、一直是对的逐市场比例）——没有再发现新问题。
验证：`pnpm run typecheck` 14/14。用 `redis-cli GET snapshot:protocol` 现场核对：BTC（`ref=-13.4%, p99=13.3%`）、ETH（`ref=-27.5%, p99=18.5%`）、LINK（`ref=-23.2%, p99=18.4%`）全部满足 `abs(refPct) >= threshold`。`/dashboard`、`/markets` 都是 200。
### 26. `5bd6ac36` — 跨市场异常检查删掉 Reserve Factor/Max Leverage 两项 + 解释"consensus"来源（2026-08-13）
用户从 Markets 列表截图里发现的：BTC 显示"6 differ from consensus"，里面包括 Reserve Factor（36% vs 10%）和 Max Leverage（200x vs 100x）——追问这个"consensus"到底是在哪配置的，界面上完全看不到。
答案：根本没有配置文件。`anomalies.ts` 的 `buildConsensusBaseline` 每个周期都会重新算一遍——"consensus"就是这一刻其余真实市场里出现次数最多的那个值，是一个动态、实时的比较，不是存起来的期望值。"每个市场都应该是同一个值"这个假设，对那些设计上本来就分层的参数是不成立的。拿一份现场快照在全部 24 个真实市场上核实过：
- `RESERVE_FACTOR`：干净的四档分布（10%×12、5%×7、36%×3 [T1: BTC/ETH/HYPE]、16%×2）——差不多一半的市场根本不存在什么"大家都一样"的共识，它们只是被永久标记成"跟别人不一样"，仅仅因为它们本来就该在自己的档位上。worker 那边的 `paramDrift` 检查（Dashboard 上"Param drift"那个提示）早就用了真正懂档位的正确判断（`T1_TOKENS` + `VALID_RESERVE_FACTORS`）——这个扁平版纯粹是个框架更差、说法还容易误导人的重复检查。
- Max Leverage：`100x×14、200x×7、140x×2、169x×1`——10/24 个市场（42%）被永久标记成跟别人不一样，仅仅因为它们本来就该在自己被分配到的风险档位上，而且这个还没有 `paramDrift` 的替代方案可用（杠杆是按资产逐个分配的，压根没有一个可以拿来比的全局"标准值"）。
把这两项从 `anomalies.ts` 的 `PARAM_DEFS`/`ANOMALY_SECTION` 里整个删掉了，`asset-drawer.tsx`（Reserve Parameters 区块、Max Leverage 那一行）里已经用不上的异常查询代码也一起清掉了。核对过其余几个还留着的检查项，确认它们**没有**这个问题——每一个都有真正接近全票通过的共识，只有一小部分（有信息量的）市场不一样：Pos Fee Normal/Improved（22/24 一致，只有 BTC+ETH 因为自己的低费率档位不一样）、Price Impact K（23/24 一致，只有 1 个不一样）、Funding Base（23/24 一致，只有 BTC 不一样，跟第23条的发现对应）——这些才是真正有用的信号，不是结构性噪音。
给共用的 `AnomalyBadge` tooltip（drawer 和 Markets 列表共用同一个组件）加了一段说明文字，直接讲清楚："consensus"是每个周期实时算出来的，不是配置出来的，某个市场跟别人不一样往往是它自己故意设的档位，不一定是配错了。
顺带按用户同一条消息的要求，去核对了 Positions 页面"Position Risk Monitor"的数据管线（`apps/worker/src/collectors/indexerCollector.ts`）——确认这是一个真实的 Goldsky/Subsquid 子图索引器（不是占位假数据），正确按 `orderType===5`（清算）/`secondaryOrderType===1`（ADL）过滤 `OrderExecuted` 事件，High-Risk 也是拿真实的 Position 实体现场算 `MarginRatio<1.5` 出来的。现场重新核对：数据确实在正常更新（BTC 11 笔清算/$704K/24h，跟用户自己截图里的数字完全对得上；LINK 14 笔/$1.231M，精确到美元都对得上）——用户看到的那张全是 0 的截图，只是索引器文档里写明的约 60 秒冷启动窗口，等用户后一张截图的时候早就跑起来了。这部分没有改代码。
验证：`pnpm run typecheck` 14/14。拿现场快照模拟了一遍新的共识基线：BTC 的差异数从 6 降到 4（Pos Fee×2、Price Impact K、Funding Base——全部是真正有信息量的小众信号）；ETH 从 4 降到 2（只剩 Pos Fee×2）。`/markets`、`/dashboard` 都是 200。
### 27. `210f484f` — 新增"Config Standards"固定标准值页面，取代实时 consensus（2026-08-14）
紧接着第26条删掉 Reserve Factor/Max Leverage 那次，用户直接提出了更根本的方案："形成一份固定的 consensus 吧——部署文档里本来就把资产分成了 T1/T2/T3/T4，不同层级本来就该有差异。在 market 页面下面加一个参数页面，放到 Fee 下面，把我部署的参数都列出来，最好分类，应该不够全，逐步完善吧，里面既有当前值，也有那个市场对应级别的标准值——如果我改了当前值，那就跟标准值有区别了，这才是真正的 differ。标准值本质就是 consensus，先把'FX100 已上线资产清单（Base Sepolia）'文件里的配置当成标准值。"
- `packages/config/src/paramStandards.ts`（新文件）：一份按 marketIndex 索引的静态标准值表，直接从部署文档的资产总表（§一）、容量/分层表（§6.5）、资金费表（§7.2）、动态价差表（§8.5）里摘出来——每个市场的 Reserve 层级（T1-T4）、Reserve Factor、单仓上限、开平仓费、最大杠杆、最小抵押因子，加上全场统一的几个全局常量（`MAX_OPEN_INTEREST`、`MAX_OPEN_INTEREST_FACTOR`、清算费、固定价差、Funding Floor、Skew Impact Factor/Min/Max、两个全局裸键最小值），以及 Funding Base/Min/Max 和 Price Impact K 的"BTC vs ETH 基线"两档拆分。按用户自己的话"应该不够全，逐步完善吧"故意留白——以后从文档里核对到新的就往里补。
- `apps/web/src/app/cost-params/page.tsx`：新增"Standards"标签页（按用户要求放在"Fees"后面），把 `paramStandards.ts` 里覆盖到的每一个参数分类展示（手续费 / Reserve 与容量 / 杠杆 / 资金费 / 价差 / 全局），每一行都是当前值 vs 标准值 + 一个匹配/差异的图标。这个标签页自己的角标数字来自新的 `standardsDiffCount()`（固定标准），跟旧的 `anomalies.ts` 实时共识系统是两套独立机制，以后各管各的。顺带把 `TAB_ANOMALY_LABELS` 里第26条已经从 `anomalies.ts` 删掉、但这边还留着的"Reserve Factor"/"Max Leverage"死引用也清掉了。
- `apps/web/src/components/layout/app-sidebar.tsx`：把 `/cost-params` 加进了侧边栏，叫"Config Standards"——这个页面之前完全没有入口，只能直接敲 URL 才能打开。
**提交前自己先抓到并修了一个真问题，没让它变成新的噪音**：如果直接拿 `MarketSnapshot.maxLeverage`（合约真正生效的上限，`1/minCollateralFactor`）去跟部署文档"最大杠杆"那一列（对外宣传/产品层面的上限，比如 BTC 是 100x）比，会导致**每一个市场永远显示"不一样"**——现场核对 BTC/ETH/LINK 全部精确是文档数字的 2 倍，ZEC 也是精确 2 倍。没有直接假设哪个数字错了，去读了 `fx100-contracts` 的 `PositionUtils.sol`（`origin/release/v0.3.1`，真实部署的那个版本）和 `fx100-apps` 自己的 `leverage.ts`——合约实际强制的就是精确的 `1/minCollateralFactor`，Solidity 里哪里都没有除以2这一步。文档里那句"(1/最大杠杆)/2"讲的是团队部署时**怎么反推出 ****`minCollateralFactor`**** 这个数值**（故意把链上安全上限设成对外宣传上限的两倍，作为安全边际，源自 2026-07-31 那次开仓/清算因子统一），不是合约的杠杆计算公式。修复方式：比较逻辑改成拿链上上限跟"文档产品上限 × 2"比，这一行也改名成"On-Chain Leverage Ceiling"并加了说明，讲清楚这个刻意的 2 倍关系——避免了跟第26条要解决的问题完全一样的那种"永远假的differ"噪音。
验证：`pnpm run typecheck` 14/14。现场核对了全部 24 个真实市场的 6 个逐市场字段（Reserve Factor、单仓上限、开平仓费 Normal/Improved、On-Chain Leverage Ceiling、最小抵押因子）：144 项里 143 项精确匹配；唯一的例外（ZEC 的杠杆：169x，预期 170x）是 ZEC 自己链上 `minCollateralFactor`（0.59%）本身就带了一点很小的舍入误差——这次核对正确地把它揪出来了，不是比较逻辑的 bug。`/dashboard`、`/markets`、`/positions`、`/events`、`/cost-params` 都是 200。
### 28. `fecb7f86` — Config Standards 表格：24 市场计数 + 层级列 + Grace 显示改分钟（2026-08-14）
用户从 Config Standards（`/cost-params`）总览表的截图里发现：Market 列在宽屏上无限撑开，"Markets Monitored"KPI 显示 26 而不是 24（应该排除 MSOL 和已下架的 LIT 市场），Grace Period 四舍五入成整小时（900秒=15分钟，每个市场都显示成"0h"），而且市场没有可见的层级标签（部署文档 §6.5 参数表本来就按 `RESERVE_FACTOR` 把每个市场分了 T1-T4，但这里完全没有体现出来）。
- Market 列宽度改成了 `minmax(180px,260px)`（原来是 `minmax(200px,1fr)`，在宽屏上会撑满整行）；新增了一列 Tier（T1-T4，按颜色区分，数据来自 `paramStandards.ts` 的 `MARKET_STANDARDS`——第27条已经有这份配置了，只是主表格里一直没展示出来）。
- 修复了"Markets Monitored"这个 KPI 小方块：它直接读的是 `snapshot.markets.length`（26个，包含 MSOL 和 LIT），而不是 store 里已经过滤好的 `marketRows`（24个）。改成了 `marketRows.map(r => r.market)`，跟 Dashboard/Markets 页面用的是同一套 `marketIndex!==3 && !marketDisabled` 过滤逻辑。
- `fmtGrace` 重写了，改成小于1小时时显示分钟（跟 `asset-drawer.tsx` 的 `fmtDuration` 是同一套写法），不再一律四舍五入成整小时——现在全部真实市场的 grace period 都是900秒，正确显示成"15m"，而不是每一行都误导性地显示"0h"。
验证：`pnpm run typecheck` 14/14。用 `redis-cli GET snapshot:protocol` 现场核对：过滤 `marketIndex!==3 && !marketDisabled` 之后是24个市场（含 MSOL 一共25个；LIT 现在压根不在快照里）。ETH 的 `gracePeriod.base=900` 现在显示"15m"。`/cost-params` 是 200。
### 29. `3ddecaeb` — 新增"手续费收入与分账核对"监控页面（2026-08-14）
用户提的新页面需求，依据是 `fx100-contracts` 仓库的 `docs/superpowers/specs/2026-08-14-fee-revenue-monitor-page-requirements.md`：claimable → available → RevenuePool → Staker/Treasury/Insurance/LP 这条资金流，加上守恒核对——需求文档自己说这是这个页面"除了好看之外最重要的价值"。
写任何采集逻辑之前，先把每一个键/ABI/事件假设都拿 `fx100-contracts` 源码核对了一遍——需求文档的英文描述里其实有一处小错值得抓出来：它把 `claimableFeeAmountKey` 的第二个参数说成"market"（听起来像是个地址）；但 FX100 压根没有地址类型的市场标识——每一个带市场维度的 DataStore 键（核对了 `FX100Keys.sol`）用的都是 `uint256 marketIndex`。另外还拿 `cast call` 对真实 Base Sepolia 链上状态独立核对了一遍，确认这套键推导没问题之后才敢往代码里写。
- **链上基础设施**（`packages/config`、`packages/onchain`）：把 FeeHandler/RevenuePool/ProtocolTreasury/InsuranceTreasury/USDC 五个地址加进了 `MonitorContracts` + 三条链的配置 + 环境变量覆盖。FeeHandler/USDC 逐字节核对过跟 `fx100-apps` 自己的 `addresses.ts` 完全一致；RevenuePool/ProtocolTreasury/InsuranceTreasury 这三个 `fx100-apps` 的配置里压根没有（交易前端不需要用到它们），所以这三个地址只能来自需求文档本身，已经在注释里标注清楚。从 `fx100-apps` 拷贝了 FeeHandler/RevenuePool/IERC20 三份 ABI（跟这个包里其余所有 ABI 一样的来源惯例）。`keys.ts` 里加了 `claimableFeeAmountKey`/`availableFeeAmountKey` 加上三个 `*_FEE_TYPE` 哈希常量，都核对过 `FeeUtils.sol`/`FeeHandler.sol`/`FX100Keys.sol`。新增 `feeRevenue.ts`（现场点位读取）和 `feeEvents.ts`（`EventLog2`/`EventLog1` 解码，覆盖 `ClaimableFeeAmountUpdated`/`FeesClaimed`/`SetAvailableFeeAmount`——具体字段的 key 字符串都是从源码里原样抄出来的，不是照着事件名猜的；按 indexed 的 `eventNameHash` 过滤，因为需求文档自己提醒过 `EventLog2` 是全协议的事件总线，不按这个过滤在真链上扫会直接超出 RPC 返回条数上限）。
- **新采集器**（`feeRevenueCollector.ts`，30秒一次接入调度器）：带检查点的增量扫块（每轮最多2000个块）+ 现场读取 + R1/R2/R3 三项守恒核对。收工前自己先抓到并修了两个真问题：①第一版 `claimableNow` 有一轮全部读成了0，原因是 Base Sepolia RPC 瞬时超时（`allowFailure:true` 会把单次调用失败悄悄吞掉）——连续核对了3个周期加上一次独立的 `cast call` 之后才确认这是链路抖动，不是逻辑 bug；②一个真的 bug——第一版为了"income"往前回扫了5000个块，但 `claimableNow` 的基线是过了好几轮、拿到市场列表之后才现场抓的，等于拿"过去约3小时"累积的收入去跟"过去约90秒"的 claimable 增量比，差了大概165倍，看着像是真的对不上，其实是统计窗口没对齐。修复方式：把基线捕获和"从哪个块开始扫"这两件事放进同一个周期里做，不做任何回扫——① 收入图表现在从采集器第一次跑起来的那一刻开始从0慢慢长，而不是冒险留一个永远对不上的 R1。
- **新页面** `/fee-revenue`（自己独立轮询，15秒一次，跟主 protocol-snapshot 的 store 完全无关，因为这是一个完全独立的 Redis 键/采集器），覆盖了需求文档5个部分里的4个——①收入（recharts 堆叠柱状图，按这个代码库现有的图表写法做了懒加载）②管道现状（claimable/available/各方余额）③分账（RevenuePool 当前比例 + 累计流向）④守恒核对（放在页面最上面，不是最下面，呼应需求文档自己强调的"这才是真正的价值"）。⑤LP APR 按需求文档自己"可选、优先级低"的说明跳过了（没有现成的 LP APR 组件可以复用）。侧边栏在 Positions/Events 下面加了入口。
验证：`pnpm run typecheck` 14/14。真链 Base Sepolia 现场核对：修完对齐问题之后，三个 feeType 的 R1/R2/R3 全部 `diff=0`；`claimableNow` 显示的是真实的逐市场非零数字（比如 ETH 的 position 未领手续费约 $15.9k，另外用 `cast call` 直接对 `DataStore.getUint` 独立核对过一遍，对得上）。`/fee-revenue` 和 `/api/snapshot/fee-revenue` 都是 200。
### 30. `407bbd22` — 修复 indexer-collector 永久卡死的问题，导航栏改名，加 24h/7d/30d 时间范围（2026-08-15）
用户报告：Events 页面的 Liquidation/ADL 时间线图表，和 Positions 页面的 Position Risk Monitor（风险监控）都完全没有数据（全部是 0 的 tile，"waiting for indexer data" 一直转不出来）。没有直接猜原因，而是一步步查实的——先查 Redis（`snapshot:indexer` 这个键压根不存在），再 grep worker 日志（`indexer-collector` 这个任务连续报 "job skipped: previous run still in-flight"），确认调度器 `runJob` 的 try/catch/finally 就算报错也会正确清掉 in-flight 标记（不是调度器本身的 bug），然后直接拿代码里用的一模一样的查询语句用 `curl` 打真实的 Goldsky 接口去复现。
Base Sepolia 测试网这些年攒下来大约 20,048 个未平仓仓位（用分页查询 `positions(where: {sizeInUsd_gt: "0"})` 在 skip=0/5000/20000/50000 各点核实过）。`correctReopenedOpenedAt` 里的 `positionKey_in` 查询把全部未平仓仓位的 key 一次性塞进一个请求——大约 2 万个 key 的情况下，这个查询真的会在约 12 秒后返回 HTTP 413（"Payload Too Large"），但代码自己设的 10 秒 `AbortSignal.timeout` 会先一步触发 `TimeoutError`。再加上原来 15 秒的调度间隔（一轮真实周期要翻页拉完全部仓位、外加这个必然失败的查询，15 秒根本不可能跑完），导致这个采集器看起来像是永久卡死，而不是"偶尔慢一点"——`snapshot:indexer`/`collector:hb:indexer` 从来没被写过，这正是两个功能都没数据的原因。
- **修复**：把 `positionKey_in` 查询切成每批 300 个 key，用有限并发（4）跑，每个分片的失败用 `.catch(() => ({ ...空结果... }))` 单独兜住，这样一个分片出问题不会拖垮整个修正流程。
- 把调度间隔从 15 秒调到 120 秒，对齐实测出来的真实周期耗时（连续几轮实测 84–115 秒，跟采集器最初的假设完全不是一回事）——间隔比真实周期短，只会不停地打印"上一轮还没跑完"的日志噪音，没有任何实际好处。
- 采集器的心跳 TTL 提到 300 秒（新间隔的 2.5 倍），留出余量。
- 按用户要求：侧边栏的 "ADL / Events" 改名为 "Liquidation"（路由和页面本身还是同时覆盖 Liquidation 和 ADL 两条时间线）。
- 按用户要求（"时间可以为24小时的，7天的，30天的"）：给 Events 页面加了 24h/7d/30d 时间范围选择器。`buildTimeline()` 现在接受 `bucketSec`/`bucketCount` 参数；worker 只拉一次 30 天窗口的事件，同时从这一份数据里构建出按小时（24×1小时）和按天（30×24小时）两套桶——7d/30d 直接切按天那一套的最后 7 或全部 30 个桶，不用额外查询。每个市场的 24h 汇总字段（`liquidation24hCount` 等，Positions 页面的 tile 在用）依然会先过滤成严格的过去 24 小时子集再计数，因为这几个字段在别处的文档/用法里就是按 24h 口径定义的。
现场验证：在这个 session 里手动把 worker 进程杀掉重启，连续观察了两轮 indexer-collector 在新间隔下干净跑完（908 → 918 条 liquidation，约 2 万个仓位，0 条 ADL——都是真实测试网数据，不是造的），确认 `snapshot:indexer` 里每种事件都带上了 24 个小时桶 + 30 个天桶（30 个天桶里有 16 个、24 个小时桶里有 23 个真的有 liquidation 数据），也确认 `/api/snapshot/markets` 端到端能拿到这份数据（跨所有市场汇总的 24h liquidation 数是 129，跟小时桶的数据吻合）。`/events` 和 `/positions` 都是 200。`pnpm run typecheck` 14/14。
### 31. `b3b30eca` — Position Risk Monitor 也加上 24h/7d/30d 时间范围选择器（2026-08-15）
用户继续追加的需求，跟第 30 条 Events 页面的选择器同一套模式。只有 Liquidations/ADL 两个 tile 加了选择器——High-Risk 和 Protected Positions 是"此刻是不是高风险"这种即时状态判定，没有"过去7天高风险"这种口径，所以保持不分时间段。
把 `TimeRange` 类型和新增的 `sumEventBuckets()` 函数放进了 `apps/web/src/lib/snapshot.ts`（Events 和 Positions 两个页面共用）——把一份 `EventTimelineSeries`（24h 读小时桶，7d/30d 切按天桶的最后 7 个或全部 30 个）汇总成协议级总数 + 逐市场明细，全部在前端算，用的还是 worker 已经在发的那份 `eventTimeline`。特意没有动 worker，也没有动现有的 `indexerData.liquidation24hCount`/`adl24hCount` 这两个字段——它们必须严格保持 24h 语义，因为 Dashboard 页面的卡片就是靠这个语义在算的。`SummaryStrip` 的 Liquidations/ADL 两个 pill、`PositionRiskTable` 的 Liq/Liq Volume 两列加排序、`LiquidationChart` 的逐市场柱状图，现在全部改成读这个按范围汇总出来的数据。
现场验证：写了一个独立脚本照抄同一套按桶求和的逻辑，直接对真实快照跑了一遍——`sumEventBuckets()` 算出来的 24h 总数跟服务端自己的 `liquidation24hCount` 汇总完全一致（两边都是118）；7d（817）和 30d（945）的数字也是合理地依次增大。`/positions` 和 `/events` 都是 200。`pnpm run typecheck` 14/14。
这次验证过程中还顺带发现了一个和这次改动本身无关的问题（这次改动只碰了前端页面，没动 worker）：indexer-collector 卡在"上一轮还没跑完"整整卡了 5 个多小时（上一次成功写入是 04:24，到 09:41 还是卡着）——跟第 30 条修的那个 413/超时 bug是两码事，因为每一次 `gql()` 调用本身已经带了 10 秒的 `AbortSignal.timeout` 保护。把 worker 重启之后立刻恢复，下一轮不到一分钟就正常跑完了。这里先记录为遗留问题，没有在这次改动里修：这个采集任务作为一个整体没有外层的看门狗/硬超时，如果某一次 `fetch` 调用在 Goldsky 持续抖动的情况下没能正确响应它自己的 abort signal（这个分支里已经不止一次真实观察到 Goldsky 的 `TimeoutError`），整个任务就可能无限期卡住，没有任何自动恢复机制。
### 32. `c9ce8746` — Liquidation/ADL Timeline 图表改总量柱状图 + 可排序明细表（2026-08-16）
用户反馈：24 个真实市场的情况下，时间线图表"每个市场一段堆叠柱子 + 一个图例色块"的方案已经看着很费劲——图例已经要换行3行，tooltip要列20多条。等以后到100+市场会彻底看不了。动手之前先用两个方案（总量柱状图+独立表格 vs. 保留堆叠但只给Top N上色、其余合并成"Other"）征求了用户意见，用户选了总量+表格这个方向。
图表真正要回答的问题（PRD 4.10.3.5/4.10.3.6）是一个时间维度的问题——是零散的还是在爆发——不是"到底是哪个市场"的问题。逐市场明细是完全独立的另一个诉求，交给表格来回答比图表的颜色图例靠谱得多：数字精确、不用对色块、市场数量再多也不会变成视觉噪音。
- `event-timeline-chart.tsx`：两张图表现在每个时间桶只画一根柱子（跨所有市场的总数），按事件类型上色（Liquidation橙色、ADL粉色——跟app里其他地方的chip颜色一致），不再是"每个市场一段堆叠+一条图例"。Tooltip 简化成 时间 + 总数 + 总额。
- `page.tsx`：在两张图表下方新增了 `EventMarketBreakdown` 表格（跟 Positions 页面的 `PositionRiskTable` 视觉风格一致）——Market | Liquidations | Liq Volume | ADL | ADL Volume，按当前选中的时间范围，按事件总数从高到低预排序。数据来自第31条已经加好的 `sumEventBuckets()` 逐市场汇总，worker 端不需要新加任何数据。
现场验证：重启了 worker（indexer-collector 又卡住了一次——Goldsky 这次是连续好几次真的返回 `TimeoutError`，最后才有一轮在127秒后跑成功，跟第31条记录的是同一种已知的 Goldsky 侧抖动，不是新 bug）。用无头 Chrome 截了 `/events` 24h 视图的图：图表变成干净的单色柱子，明细表显示真实的逐市场数字（SUI 6笔/$218.61K、ARB 5笔/$28.54K、ETH 4笔/$568.94K 等），"No ADL events"的空状态也还是对的。`pnpm run typecheck` 14/14。7d/30d 没有单独截图（这个环境没有现成的 CDP/websocket 工具去驱动时间范围按钮的点击），但它们和24h走的是同一个已经验证过的 `sumEventBuckets()` 数据路径、同一个参数化的图表组件，不是另外一套代码。
### 33. `3179cd89` — 手续费收入采集器：修复disabled市场遗漏+区块高度drift，接入全历史种子，加pipeline停摆报警（2026-08-17）
用户要求的核对任务：拿 fx100-contracts 仓库里另一个 session 自己独立改造的 fee-dashboard 核对脚本（`docs/superpowers/specs/2026-08-14-fee-revenue-monitor-page-requirements.md`，2026-08-16更新版）跟这边监控系统的实现对一遍。那个session在改自己脚本时抓到并修了3个真bug，同时留下一份全历史缓存文件；拿同一类问题核对这边的采集器，发现3个里有2个这边也有。
- **disabled市场漏统计**（现场核实过，跟他们"只统计3个市场"是同一类问题）：这边采集器原来的市场列表是从 `snapshot:protocol` 读的，而 `marketCollector.ts` 自己就会把disabled的市场当成"不存在"过滤掉（对交易前端来说是对的，对一个手续费账本来说是错的——市场下架不会把已经产生但没领的手续费清零）。直接现读链上验证过：marketIndex 19 当前是disabled状态，仍有 $0.15 未领claimable（position+funding），这边采集器完全看不到。修复方式：改成直接调 `getMarkets()`，不再依赖另一个采集器"这个市场现在能不能交易"的过滤逻辑。
- **区块高度drift**（跟他们"各状态量读取没有固定块高"是同一类问题）：`claimableNow`/`availableNow`/`rewards`/`balances` 这几个"现状"读取原来都是隐式读 latest，而 income/claimed 的事件扫描是精确到 `[fromBlock, toBlock]` 这个历史区间的——采集器自己扫链+取时间戳这段执行时间里，新区块还在继续产生，latest 可能已经超过 toBlock，导致 R1 出现一个真实但假警报性质的非零diff。修复方式：把每一处"现状"读取都 pin 到账本实际扫描覆盖到的那个精确区块（给 `packages/onchain` 里那三个读取函数加了可选的 `blockNumber` 参数）。
- **全历史回填**：新增 `apps/worker/scripts/seedFeeRevenueFromCache.ts`——复用另一个session已经跑完的全历史扫链结果（缓存文件 `fee-dashboard-data.json`，38.9万+条记录，本地拷贝了一份，已加进 .gitignore，34MB），不用自己重新扫一遍760k+个区块。脚本把缓存里的浮点美元数值转成raw的1e6精度bigint字符串，重建按小时的桶，R1的基线设成0（对应创世状态）。
- **pipeline停摆报警**：加了一个 `pipelineStall` 信号（累计已领为0但当前有未领余额=停摆）+ 页面最上方一个醒目的琥珀色横幅——这正是spec和另一个session都用原话强调的这个页面的核心价值（"值得让监控系统重点关注/报警"）；之前这块只是平铺数据，没有任何提示，虽然是页面上最值得关注的一个事实，但很容易被忽略。
现场验证：跑完种子脚本后重启了worker——`scanCoverage` 现在正确显示"覆盖全历史"；三个feeType的R1 diff全部精确为0（之前drift bug偶尔会出现一个小的假diff）；marketIndex 19 现在能在 `claimableNow` 里看到了；`pipelineStall` 正确显示 `stalled=true`，25个市场共 $256,640.27 未领、$0 已领。截图 `/fee-revenue`：横幅正常渲染，7项守恒核对全部通过，LP Vault余额（$50,373,401.94）跟另一个session独立统计出的约$50,365,138 TVL基本吻合（小差异=读取时块高更新、多accrue了一点）。`pnpm run typecheck` 14/14。
**事后订正（****`31d04885`****）**：一开始把 `apps/worker/data/fee-dashboard-data.json` 加进了 .gitignore，理由是"34MB的一次性参照文件不该塞进git历史"——用户指出这样一来，新clone这个仓库或任何部署环境根本没法跑 `seedFeeRevenueFromCache.ts`，因为这个文件压根不存在。改为去掉gitignore规则，直接把文件提交进git。顺便重新从fx100-contracts那个session还在持续跑的增量扫描里拷贝了最新快照（`lastBlock` 45560216 → 45566736，income记录 393035 → 406293，总收入 $251,526.69 → $257,276.90），并重新跑了一遍种子脚本，让Redis也同步到最新数据。
### 34. `bf0770ae` — Trader P&L vs Pool 百分比旁加上美元金额（2026-08-17）
用户要求的小改进：asset drawer 里"Long/Short traders' profit"这两行原来只显示比例（比如"0.0235%"），看不出背后实际的美元规模有多大。
在 worker 端每个市场的 pool 快照里加了 `longPnlUsd`/`shortPnlUsd`，算法是 `longPnlToPoolFactor * poolUsd / 1e30`（short同理）——特意用的是跟百分比同一套 factor 和 `poolUsd`，不是这个文件里别处（全局 Settlement NAV）用的 `pnlSecondary`（那个走的是recorded price，是另一个价格来源）——这样新加的美元金额永远跟旁边显示的百分比精确对得上，不会因为价格来源不一样而对不齐。带符号，跟原来的factor同一套约定（负数=交易者亏损、资金池在赚）。
现场验证：market 2（ETH）显示 `longPnlUsd=$19,014.68`，对应 `longPnlToPoolFactor=0.027%`、`poolUsdWithoutPnl=$70.43M`——手算核对过（0.027% × $70.43M ≈ $19,014），完全对得上。`pnpm run typecheck` 14/14。
### 35. `248f2b7a` — 新增LP已实现/未实现盈亏 + 手续费注入假设计算（2026-08-18）
用户要求的新需求：每个市场、以及整个LP的已实现(realized)/未实现(unrealized)盈亏，另外一个问题——如果把position/funding/liquidation这3种手续费收入按当前设置的LP分成比例算，加进LP之后LP总盈利是多少。
Realized PnL的数据来源：EventEmitter的 `PositionDecrease` 事件（EventLog1）里的 `basePnlUsd` 字段——新建了 `packages/onchain/src/positionEvents.ts`。对着 `DecreasePositionUtils.sol:147-153` 核实过，这个值是**这一笔平仓具体实现的那部分PnL**（按平仓比例分摊），不是仓位剩余的全部未实现PnL——所以把一个市场所有 `PositionDecrease` 事件的这个值加总，得到的就是精确的累计已实现PnL，不会重复计算。清算和ADL也核实过走的是同一条 `DecreaseOrderUtils`→`decreasePosition` 路径，且都是100%平仓，所以不需要额外处理。
按用户要求做了真正的全历史（不是"从采集器上线那天起"）：
- 先找到v0.3.1真实部署区块（44,780,226——对DataStore做`eth_getCode`二分查找，第一个有代码的区块；时间戳2026-07-29 12:39:00，跟"260729"部署文件夹名字完全对得上）。
- `scripts/scanRealizedPnlHistory.ts`：一次性扫链脚本，从部署区块扫到现在，约550秒，每2000个块一批（跟feeRevenueCollector同样的强制分块理由——真实RPC网关会静默截断大结果），每20批存一次checkpoint文件防止中断丢进度。扫出112,473条事件；把扫链结果（`apps/worker/data/realized-pnl-history.json`，约8.6MB）直接提交进了git，没有加gitignore——跟第33条 `fee-dashboard-data.json` 同样的道理：新clone或部署环境要真的有这个文件才能跑种子脚本。
- `scripts/seedRealizedPnlFromCache.ts`：把扫链结果灌进Redis（`lpPnl:state`），把交易者视角的 `basePnlUsd` 取反存成LP视角。
新采集器（`lpPnlCollector.ts`，30秒一轮）：跟feeRevenueCollector同一套断点续扫架构，从种子的 `lastBlock` 继续往后扫。每轮汇总三个来源：自己的已实现PnL账本、marketCollector已经算好的 `longPnlUsd`/`shortPnlUsd`（取反变成LP视角的未实现PnL）、feeRevenueCollector的收入+分账比例（算手续费注入假设）。MSOL在逐市场明细里被排除（跟其他面向交易者的页面一致），但协议级总数里包含它——它是真实市场，钱是真实进了共享的LPVault。
新增API路由（`/api/snapshot/lp-pnl`）+ 前端lib（自带30秒轮询，跟采集器节奏一致）。UI：asset-drawer的Pool标签页每个市场加了"LP Realized + Unrealized PnL"这一段；fee-revenue页面加了一段协议级总数+按feeType的手续费注入明细。
现场验证：种子灌进Redis后重启worker，采集器干净跑完（每轮2.5-10秒）。手算核对过手续费注入的数字（funding收入$147,246.54 × 40% = $58,904，对得上）。截图 `/fee-revenue`：Realized $298.44K / Unrealized -$56.75K / Total $241.69K / LP total if fully injected $358.22K，全部正确。用API确认过MSOL确实不在 `byMarket` 里，但计入了 `protocolWide` 的总数。`pnpm run typecheck` 14/14。
### 36. `e8af063c` — LP Realized PnL 漏掉了一条真实的、约50%的手续费收入；加上24h/7d/30d/ALL时间范围选择器（2026-08-18）
用户对第35条这个新功能提出两个核实问题：每个市场的Realized求和是不是等于LP总数？LP的Realized总和是不是应该等于NAV增长部分？第一个问题现在确实精确对得上（MSOL目前完全没有`PositionDecrease`历史记录，所以那个"展示层面排除MSOL"的设计现在不会造成任何偏差）。第二个问题——用之前的实现，答案是**不对**，而且是读了真实的结算代码才发现的，不是凭感觉猜的。
`DecreasePositionCollateralUtils.sol:196-220` 在每次结算时会把 `fees.feeAmountForPool` **直接转进池子**——这是position/liquidation手续费收入里的一部分，完全绕开了`claimFees()`/`withdrawFees()`/`RevenuePool.claim()`这整条链路。这部分钱对feeRevenueCollector（只看得到另外那一半，走claimable流程的部分）和对Realized PnL（`basePnlUsd`只是纯价格盈亏，跟手续费无关）都是不可见的。现场直接读`DataStore.getUint`核实过：`POSITION_FEE_RECEIVER_FACTOR`和`LIQUIDATION_FEE_RECEIVER_FACTOR`都精确等于50%——也就是说直接进池子的那一半，金额正好等于feeRevenueCollector已经在追踪的那两类手续费收入。实际量级：在之前报告的约$325K基础上，漏掉了约$155K，接近漏算了一半。
修复：`packages/onchain/src/keys.ts`加了这两个factor键的常量（对着`PositionPricingUtils.sol`核对过）。`lpPnlCollector.ts`每轮现场读取这两个factor的实时值（不是写死50%，这样以后factor真的被改了也能跟上），从feeRevenueCollector的逐市场收入数据（新加了一个`cumulativeIncomeByMarket`字段暴露出来）推算出直接进池子的那部分金额——不需要额外扫链，因为在当前50/50的分成下两半金额本来就相等。这部分钱在UI上做成了一个单独的"Fee-to-Pool (all-time)"卡片，没有悄悄合并进"Realized"里。
另外按同一条消息的要求，加了24h/7d/30d/ALL时间范围选择器，作用在价格盈亏(price PnL)这部分的Realized数字上，逐市场和整个LP两处都加了——跟Events/Positions页面已有的时间范围选择器是同一套习惯。用的是小时桶(24h视图)+天桶(30d视图)，跟indexerCollector.ts的Liquidation Timeline同一套分辨率组合，从一次PositionDecrease扫描里同时产出。桶的时间戳用的是精确的线性区块时间公式，不是逐个区块调用`eth_getBlock`——现场验证过Base Sepolia的出块时间精确到2.000000秒、在跨越整个824,966个区块的v0.3.1全部历史范围内三个独立采样点零漂移,省掉了原本要做的约32,000次单独RPC调用。Fee-to-Pool这部分保持只有all-time口径（不能按时间范围筛选）,因为feeRevenueCollector没有按时间给逐市场收入分桶——它的卡片上明确写着"(all-time)"，没有硬凑一个假的时间窗口数字。
现场验证：重启了worker，采集器干净跑完（2.8秒，没有报错）。`d30` 现在跟 `all` 完全相等（符合预期——协议部署还不到30天，这也是一次很干净的自我一致性核对，证明分桶的算法是对的）。通过直接读API核对过账：realizedFromPrice.all（$326,839.47） + realizedFromFeeToPoolUsd（$154,953.53） + unrealizedPnlUsd（-$19,994.02） = totalAllTimeUsd（$461,798.98），对得上。截图 `/fee-revenue`：新的4格拆分+时间范围选择器渲染正常。`pnpm run typecheck` 14/14。
### 37. `58e2da64` — Fee-to-Pool 改成分段累计，不用"现在的factor乘全部历史"（2026-08-19）
用户看完第36条后，打算把 `POSITION_FEE_RECEIVER_FACTOR`/`LIQUIDATION_FEE_RECEIVER_FACTOR` 从50%改成100%（这样position/liquidation手续费就全部走RevenuePool分账，一分钱都不直接进池子）——先纠正了一个方向性的误解：用户一开始想改成**0**，但读合约（`PositionPricingUtils.sol:552-554`）确认 `positionFeeReceiverFactor` 是"分给走RevenuePool链路那一份的比例"，不是"分给池子的比例"，改成0会导致**100%直接进池子、0%走RevenuePool**——跟用户想要的完全相反；改成**100%（1e30）**才是对的方向。
在用户确认改成100%之前，先检查了一遍这会不会影响第36条刚做的核对逻辑——**发现确实会**，而且是个原本就该修的真实设计问题，不只是"兼不兼容新参数"：`lpPnlCollector.ts`之前算Fee-to-Pool的方式是"每一轮用**当前**的factor乘**全部历史**累计收入"，这个算法只有在factor从创世到现在从没变过的前提下才是对的——一旦用户真的把factor改了，下一轮采集器就会拿新factor去乘全部历史总量，把过去几周里已经真实发生、已经躺在池子里的那笔钱从历史记录里错误地抹掉（不是能不能改的问题，是这个算法本来就该做成分段累计）。
修复：新增一个持久化的 `cumulativeFeeToPoolByMarket` 累计账本，每轮只对feeRevenueCollector累计收入里**这一轮新增的那一小段delta**用**这一轮当下的**factor征税，累计进账本——这样factor什么时候改、改成多少，都只影响改动之后新产生的收入，改动之前已经发生的部分保持不变。新增的 `lastSeenIncomeByMarket` 字段记录上一轮看到的收入值，用来算delta。这两个新字段缺省时都会退化成`{}`，正好兼容两种情况：全新状态（delta从0开始，等于全量，语义上完全正确）和第36条之前就已经存在的旧状态（第一轮的delta同样等于全量，用当时还是50%的factor去征税，正好是正确的一次性迁移，不用额外写迁移脚本）。
现场验证：改完代码后tsx自动重启了两次，采集器一直干净跑完（没有报错，除了一次跟这次改动无关的drpc.org网络超时，自己重试恢复了）。核对了迁移前后的Fee-to-Pool数字：迁移前$165,814.48（几小时前的旧记录），迁移后连续几轮平滑涨到$168,569.64——是自然增长，没有归零、没有跳变。`protocolWide`三项之和精确等于`totalAllTimeUsd`，`byMarket`求和跟`protocolWide`三项的差全部是0.00。`pnpm run typecheck` 14/14。用户确认代码没问题后会去改链上参数。
### 38. `2a1f5c1e` — 修复ETH RESERVE_FACTOR误报漂移 + 新增储备占用告警（2026-08-19）
另一个在跑同一条监控线的Claude session转达了用户指派的两件事，动手之前都先现场核实过链上真实数据（ETH的reserveFactor读回来精确是50%，`reserveFactorBudgetUsed`已经在实时算出3.09，LPVault的`poolUsdWithoutPnl`跟对方报的约$70.5M基本吻合）。
**① 修复**：2026-08-19当天ETH的RESERVE_FACTOR从36%上调到50%（`LIVE_MARKETS.md`§十一，ETH一天内两次被吃满储备上限），把ETH从"Tier 1统一36%"这个组里拉出来了（现在这个组只剩BTC/HYPE），但`paramDrift`那段检查代码里的`EXPECTED_T1_RF`判断还是把ETH算在36%那组里——导致每一轮都在误报"ETH的RESERVE_FACTOR漂移了"，其实是合约参数改了、监控的期望值没跟上。给ETH单独加了一条`EXPECTED_ETH_RF=50%`的判断。顺带把`reserveFactorBudgetUsed`相关的几处注释也更新了（原来写"目标2.95"，现在改成"2026-08-19后是3.09，是显式接受的超预算，不是漂移"），免得以后看代码的人被这个数字搞懵。现场验证：修完之后`paramDrift`数组长度是0（修之前每一轮都会有这条误报）。
**② 新增功能**：用户原话是"ETH一天内两次撞满储备上限，全靠人看前端才发现"——现在这套监控系统压根没有主动告警机制，`reserveUsageRisk`这个指标虽然早就算出来了，但只是前端页面上一个被动的颜色条，没人盯着就看不到。加了两处：
- `marketCollector.ts`：新增一个持久化的"储备占用区间"状态跟踪（`reserve:capacity:state:<marketIndex>`，normal/warn/critical三档，阈值复用这个文件里其他地方早就在用的80%/90%边界，不是新拍的数字），**只在区间发生跳变的那一轮才打日志**（不是只要处于高位就每5秒刷一条），日志里带齐market、占用百分比、已用/上限/剩余美元金额这些上下文。
- `dashboard/page.tsx`：在页面最顶部（比Global Status那一排还靠前，跟Fee Revenue页面"pipeline stall"横幅同一个"最要命的东西放最前面"的原则）加了一个横幅，只有真的有市场进入警戒线才会出现，列出具体是哪个市场、占用百分比、已用/上限/剩余多少钱。
现场验证：用Redis手动模拟了一次critical→normal的跳变，日志正确打出来了、状态也正确写回了。把阈值临时改成50%截了一张图确认横幅用ETH当时的真实数据（65.7%）渲染正常，然后改回真实的80%阈值又截了一张图确认没有市场超标时横幅确实不显示。`pnpm run typecheck` 14/14。
### 39. `ddbb8235` — 手续费receiver factor纳入参数漂移检查 + 更新过时UI文案（2026-08-19）
同一个peer session又转达了一条：用户今天把 `POSITION_FEE_RECEIVER_FACTOR`/`LIQUIDATION_FEE_RECEIVER_FACTOR` 从50%改成了**100%**——动手之前先自己直接读了一遍链上DataStore独立核实（不是只信对方转达），确认两个键现在确实精确是100%。
- `marketCollector.ts`：把这两个键加进了已有的全局裸键读取（跟ADL/提款封锁那几个键同一次`batchReadDataStore`调用），暴露到`GlobalRisk`上，并加了期望值100%的`paramDrift`检查——跟上一条给ETH的RESERVE_FACTOR加的是同一种保护，这样以后这两个键再被悄悄改动就会被抓到，不会像这次一样是靠外部转达才知道。现场验证：两个键都读到100%，`paramDrift`数组长度是0。
- `lpPnlCollector.ts` / `asset-drawer.tsx` / `fee-revenue/page.tsx`："Fee-to-Pool (all-time)"这个卡片的tooltip和note之前写的是"~50%的position/liquidation手续费"——factor是50%的时候这句话是对的，现在factor变成100%了这句话就过时了（往后0%手续费会绕开池子，之前factor还是50%时已经累积的历史总额继续保持不动，这正是上上条commit那个分段累计修复要保证的效果）。把文案改成同时说清楚历史状态和当前状态，而不是简单删掉这个过时的数字。现场核对过采集器自己的实时数字几乎没再涨（$168,569.64 → $168,745.45，跨度约1.5小时）——跟"factor改动正好卡在这个窗口中间某一刻"这个情况完全吻合，证明提前做好的那个分段累计修复在真实场景里确实生效了，不只是之前那次模拟测试里好用。
顺带核实了同一条peer消息里的另一句话，核实完发现**站不住脚**：`FUNDING_FEE_RECEIVER_FACTOR`这个键在`fx100-contracts`的`src/`目录里全文搜索是零命中，直接读`MarketUtils.sol`的`settleFundingFees`函数也确认它压根没有"分给receiver vs 分给池子"这种分支逻辑——资金费净支付方的差额100%直接进`incrementClaimableFeeAmount`（走claimable流程），完全没有参考任何factor。已经把这个发现回复给对方，让对方自己也核实一下，没有直接当作事实采纳；这个collector本来就正确地没把FUNDING纳入fee-to-pool修正，不需要改。
`pnpm run typecheck` 14/14。截图确认`/fee-revenue`页面渲染正常，并且直接从渲染出来的HTML里grep到了更新后的文案确认它真的生效了。
### 40. `c5f0eb5e` — 记录资金费LP支出不对称性（已量化为可忽略）+ 找到ecosystem地址=LPVault（2026-08-20）
peer session追加了一条更深的发现：资金费结算对LP是**不对称**的。读到底`MarketUtils.sol:445-469`的`settleFundingFees`——净支付方占多数的常见情况（交易者整体在付资金费）100%走`incrementClaimableFeeAmount`（跟position/liquidation同一条claimable流程，LP要等claim()真的跑了才能通过40%生态位间接拿到）；但如果是反过来（净收款方超过净支付方），LP要直接从池子里掏钱补上差额——`IVault(market.vault).transferOut(...)`，是真金白银从LPVault流出，而且这个分支**完全没有emit任何事件**。自己重新读了一遍同一个函数独立核实，确认属实。
**没有直接动手做完整重建，先查了量级**：抓了最近约8,000个区块（约4.4小时）的样本，`PositionDecrease`里`basePnlUsd`为正的求和是$105,980.84，而这段时间LPVault实际转出给PositionVault的USDC总额是$105,989.13——只差$8.29（约0.008%）。也就是说"LP倒付资金费"这个分支在当前这个测试网、这个时间窗口里几乎不存在，不是系统性的失血。结论：`realizedFromPrice`确实轻微偏高（漏了这一点点支出），但目前不构成实质性问题。把这个发现连同量化证据写进了`lpPnlCollector.ts`的文件头注释里，作为"已知但目前可忽略"的缺口记录下来，没有为此新建一整套"扫USDC转账+按同笔交易的basePnlUsd反推资金费残差"的事件关联逻辑（USDC全程按$1定价，理论上可行，但现在做投入产出比不划算）——以后如果资金费的skew方向长期反过来，需要回头重新评估。
**顺带解决了对方留的一个悬而未决的问题**：`RevenuePool.ecosystem()`（claim()时"生态/LP"那40%份额实际打给谁）现场读回来精确就是LPVault的地址（`0xD584270b…`）——confirms我这边`feeInjection`那个"如果RevenuePool今天分账"的假设计算，底层逻辑是对的，生态位份额真的会进LPVault，不是打给别的不相关地址。`staker()`/`treasury()`现场读回来也都是真实的非零地址。
纯注释改动，不影响运行时行为。`pnpm run typecheck` 14/14。
### 41.（无commit，仅核实）确认40%数字的ABI出处 + 核实没有任何UI字段把资金费/生态假设收入当成已实现LP收益（2026-08-20）
peer session在commit 40那轮交流里留了两个尾巴：(a) 40%这个生态份额数字究竟从哪读到的，因为他们自己试的`ratio()`/`ecosystemRatio()`/`stakerRatio()`/`getReceivers()`/`totalRatio()`全部revert；(b) 提醒如果fee-revenue页已经把40%生态回流（或者资金费收入）算进"已实现"的LP收益里，现在会偏高——因为这笔钱在claim()真正跑起来之前，LP实际上还没拿到。
**(a) 已解决**：那些调用revert是因为这些函数在`RevenuePool`的ABI里根本不存在。真正可用的接口是`getRewardCount() -> uint256` + `rewards(uint256) -> (address token, bytes32 key, uint32 stakerRatio, uint32 treasuryRatio, uint32 lockerRatio)`（1e9精度），再加三个简单的public状态变量getter `ecosystem()`/`treasury()`/`staker()`返回收款地址。`claim()`里生态/LP那份是余额法算出来的——`_balance - _stakerAmount - _treasuryAmount - _lockerAmount`——链上根本没有存过"ecosystemRatio"这个字段；本采集器自己的`ecosystemRatio1e9`字段就是`1e9 - stakerRatio - treasuryRatio - lockerRatio`，算法完全一致。
**(b) 对着实际代码而不是凭印象查了一遍**：重新读了`fee-revenue/page.tsx`和`asset-drawer.tsx`两处。`realizedFromPrice`（`lpPnlCollector.ts`）只由`PositionDecrease.basePnlUsd`算出——纯价格盈亏，资金费从未进入这个字段。`Fee-to-Pool(all-time)`只是position/liquidation费用的直接入池部分（真实、已发生的钱），资金费同样不在里面（见commit 40——资金费根本没有入池分流这条路）。40%生态数字只出现在`fee-revenue/page.tsx`里单独一段"If Undistributed Fee Income Were Credited to LP Today"/"LP total if fully injected"，这一段不算进"Total LP P&L"，而且footnote明确写了假设前提（"假设这笔钱还没通过claim()流到LP——现在确实如此；管道一旦常态化运行，这里要减去LP已实际收到的部分"）。`asset-drawer.tsx`那边更干净，压根没有这段假设性区块，只展示Realized/Fee-to-Pool/Unrealized/Total四个真实数字。
结论：目前不存在"高估"的问题，fx100-monitor侧不需要改代码。把具体的ABI签名和文件行号回给了peer session，方便对方结项。
仅核实，没有commit，没有动任何运行时行为。
### 42. `f75df35f` — 在UI里展示POSITION/LIQUIDATION_FEE_RECEIVER_FACTOR（2026-08-20）
用户直接提出的问题：这两个参数明明在commit 39里已经加进了`marketCollector.ts`的`paramDrift`检查和worker内部的`GlobalRisk`计算，但在监控页面上完全看不到。原因是worker的`globalRisk`对象是整个`JSON.stringify`写进Redis的，所以原始数字其实已经在缓存payload里了，但网页侧的类型`GlobalRiskSnapshot`从来没声明过这两个字段，也没有任何组件去读它们——导致压根没有一个地方能让人直接看到当前值。这正是用户观察到的问题。
按照现有的其他全局裸键(`MIN_COLLATERAL_USD`、`MIN_POSITION_SIZE_USD`)同样的方式补上：
- `packages/config/src/paramStandards.ts`：给`GLOBAL_STANDARDS`加上`positionFeeReceiverFactorPct`/`liquidationFeeReceiverFactorPct`（各100）——这是2026-08-19之后的当前期望值，跟`paramDrift`自己的期望常量保持一致。
- `apps/web/src/lib/snapshot.ts`：给`GlobalRiskSnapshot`补上这两个字段，让类型定义真正对得上commit 39以来Redis payload里实际已有的数据。
- `apps/web/src/app/cost-params/page.tsx`两处，跟Min Position Size/Min Collateral完全一样的模式：`TabFees`（逐市场的Fees详情tab）加两条新的`DetailRow`直接展示当前全局值；`TabStandards`（Config Standards对比tab）在已有的"Global (bare keys...)"分区里加两条新的`StandardRow`，跟其他标准值一样对着100%期望值做diff。
现场核实：Redis里`snapshot.protocol.global`两个字段确实都是100（`paramDrift`干净）。用headless Chrome（`puppeteer-core`连已跑着的dev server）分别截了两个tab的图——Fees tab显示"Position/Liquidation Fee Receiver Factor (Global): 100.00%"，Standards tab两条都显示绿色对勾、跟100%期望值匹配，位置在Global分区里。`pnpm run typecheck` 14/14。
### 43. `c2fb6de9` — 核实RevenuePool分配比例变动(0/50/30/20)不会影响任何计算 + 更新一处过时注释（2026-08-20）
用户把RevenuePool的分配比例改了：staker 0%（不变）、treasury 40%→50%、保险基金(locker) 20%→30%、LP(ecosystem) 40%→20%，三个费用类型全部生效——在让另一个session动链上参数之前，先来问会不会影响这边的计算。
不会，这是设计上就保证的：`feeRevenueCollector.ts`每个周期都现场从链上读`RevenuePool.rewards(i)`（`getRevenuePoolRewards`，钉在当前区块）——`ecosystemRatio`永远是链上余额法算出来的（`1e9 - staker - treasury - locker`），不是写死的常量。`lpPnlCollector.ts`那个"如果全额注入"的假设计算，以及fee-revenue页的比例表格，用的都是同一份当周期的`currentRatios`。也没有任何`paramDrift`检查假设旧的比例分布（跟position/liquidation fee-receiver-factor那次不一样，这次我压根没给这几个比例加检查）。资金守恒检查也不受影响，因为`claim()`从来没跑过，没有历史分配记录需要对账。
改动落链之后独立核实过：Redis`snapshot:feeRevenue`几分钟内就显示三个feeType全部变成`staker=0/treasury=5e8/locker=3e8/ecosystem=2e8`，全自动生效、没改一行代码。现场截了Fee Revenue页的图——三行比例表格都显示0.0%/50.0%/30.0%/20.0%，"LP total if fully injected"也用新的20.0%份额重新算出来了。
唯一改动：`lpPnlCollector.ts`文件头注释原来写着"LP's eventual 40% ecosystem share"——改成描述为现场读取的余额（今天是20%），不再是写死的数字。纯注释改动，不影响运行时行为。
### 44. `e16f53d3` — 新增逐市场储备使用率历史，支撑RESERVE_FACTOR预算重新分配决策（2026-08-20）
用户提出：把ETH的RESERVE_FACTOR从36%手动调到50%解决了一次容量紧张之后，想知道哪些市场长期储备额度用不满、哪些一直顶格，这样才能有依据把RESERVE_FACTOR预算从低使用率市场挪给高使用率市场，而不是每次都简单粗暴地调高总量。这之前存在的东西都只是"当下这一瞬间"的：抽屉里那个"Reserve Usage Risk"仪表盘是纯实时快照，`reserveCapacityState`的区间跳变告警（commit 38）是"刚好现在越过阈值了"的即时提醒——两者都给不出用户真正需要的、以天/周为尺度的长期画像。
新增的几块，全部复用现有模式，没有发明新东西：
- `marketCollector.ts`（第5步，紧跟在原有的OI历史追加之后）：每个周期把每个市场当下的`reserveUsageRisk`折进当天的`{min,max,sum,count}`桶里（avg在读的时候用sum/count现算，不存，避免累计浮点误差）。用按天的粒度，不是像OI历史那样每5秒一个点——重新分配预算是个慢决策，不是实时决策（那是现有区间告警管的事）。每个市场最多留90天的桶，24个市场×90天×几个数字，总共才几KB。
- `packages/storage/src/keys.ts`：新增`reserveUsageHistory()`键。
- `apps/web/src/app/api/snapshot/reserve-usage-history/route.ts`：跟现有`oi-history`路由一样的直通模式。
- `apps/web/src/lib/reserveUsage.ts`：网页侧类型定义 + `aggregateReserveUsage()`（按样本数加权算跨N天窗口的均值，不是简单的"每天均值再求均值"）+ `useReserveUsageHistory()`自包含轮询，跟`lpPnl.ts`的`useLpPnlSnapshot`一个样。
- Markets页面：新增可排序的"Reserve Usage"列，按7天均值排序（这才是"长期"信号，不是当下快照），当前值/7天/30天放进tooltip里。跟旁边原有的"Cap Usage"列不是一回事——那个是基本不生效的`MAX_OPEN_INTEREST_FACTOR`指标，这个新列才是真正会顶住`increasePosition`不让开仓的`RESERVE_FACTOR`口径。
- `asset-drawer.tsx`的Pool tab（从Markets页面点进某个市场就能看到）：在现有的实时"Reserve Usage Risk"仪表盘正下方加了一块7天/30天均值+min-max，作为表格里"跨市场排序对比"功能对应的"钻进单个市场看细节"版本。
- `cost-params/page.tsx`的Reserve tab：同样加了这块7天/30天数据，服务于Config Standards这个抽屉的用户群体。
现场核实：worker跑了一个周期之后，Redis`reserveUsage:history`就有了全部25个市场的数据；对着跑着的dev server，把Markets列表列 + 两处抽屉都截了图——数字互相对得上，也跟实时的Reserve Usage Risk仪表盘对得上。`pnpm run typecheck` 14/14。
### 45. `c94c7f58` — 在Dashboard新增全市场储备使用率图表 + 调整建议（2026-08-20）
commit 44的后续：那次把数据和逐市场抽屉视图都做了，但用户指出"还是藏在每个market里面"——要真正比较全部24个市场、决定该把RESERVE_FACTOR预算往哪挪，需要Dashboard上直接有图，而且要给出具体的调整建议，不能只有一堆原始数字。
- `apps/web/src/lib/reserveUsage.ts`：新增分类判断层——`RESERVE_USAGE_LOW_THRESHOLD`(15%)/`HIGH_THRESHOLD`(60%)/`MIN_SAMPLE_DAYS`(3天)、`classifyReserveUsage()`（返回"reduce"/"increase"/null）、`reserveUsageColor()`（跟现有储备告警共用同一套配色，"红色"在全App里含义一致）。这几个阈值特意比实时的80%/90%告警更保守——那两个是"马上就要挡开仓了"，这个是"长期一直很闲"/"长期一直很紧"这种更适合支撑重新分配的模式。明确标注只是建议——代码注释里写清楚：这只是数据+简单启发式，不是权威决策（tier分级、杠杆上限、既有的ΣRESERVE_FACTOR预算检查，这些都需要人的判断，这个功能不建模）。
- `apps/web/src/app/dashboard/charts.tsx`：新增`ReserveUsageChart`——横向柱状图（不是像现有`OIChart`那样竖着），因为24个市场得同时都看得到，不能像"Top 10"那样截断；按7天均值排序，每个市场按颜色分类，加了15%/60%两条参考虚线，hover显示均值/最大值/样本天数。
- `apps/web/src/app/dashboard/page.tsx`：新增`ReserveUsageSuggestions`面板——把分类结果转成明确的"Consider increasing (N)"/"Consider reducing (N)"列表，附带一行当前ΣRESERVE_FACTOR预算数字作为上下文，因为核心意图是"从低使用率市场挪给高使用率市场"，不是简单粗暴地整体调高。两个新组件都渲染在现有OI Trend/Distribution那一行下面新加的Zone 5里。
现场核实：图表正确显示全部24个真实市场并按序排列，颜色跟阈值逻辑对得上；建议面板正确显示"暂无长期异常"，因为commit 44上线到现在还不满3天历史数据——确认这是`MIN_SAMPLE_DAYS`门槛在正常工作，不是bug。`pnpm run typecheck` 14/14。
### 46. `8302da30` — 在Dashboard新增全市场LP已实现+未实现盈亏图表 + 汇总（2026-08-20）
跟commit 45的储备使用率图表同样的动机：用户指出逐市场LP盈亏数据（2026-08-17/18就已经上线，在`asset-drawer.tsx`里逐市场展示、在Fee Revenue页展示protocol-wide汇总）还是只能一个市场一个市场地看——想在Dashboard上一眼看到哪些市场LP在赚、哪些在亏，以及总数。
这次不需要任何后端改动——`lpPnlCollector.ts`/`/api/snapshot/lp-pnl`早就算好并暴露了逐市场的拆解数据，只是从来没有在除了抽屉和Fee Revenue汇总卡片之外的地方展示过。
- `apps/web/src/lib/lpPnl.ts`：新增`lpMarketTotalAllTimeUsd()`——`protocolWide.totalAllTimeUsd`公式的逐市场版本（realized+fee-to-pool+unrealized）。
- `apps/web/src/app/dashboard/charts.tsx`：新增`LpPnlChart`——同样是横向柱状图，按总额降序排列，LP赚得最多的市场排最上面、亏得最多的排最下面，正负用绿/红区分。只做全历史（没有24h/7d/30d选择器），因为`realizedFromFeeToPoolUsd`本来就只有全历史口径——这里做时间选择器会是假的。
- `apps/web/src/app/dashboard/page.tsx`：新增`LpPnlSummary`面板——protocol-wide全历史总额做大标题（按正负上色）、盈利/亏损市场数量、最好/最差的那个市场。明确注明这个总额包含MSOL（跟Fee Revenue页自己的脚注一样），而图表跟Dashboard其他地方一样排除了MSOL，所以柱子加起来故意不会正好等于这个总额。两个新组件都渲染在Zone 5下面新加的Zone 6里；`useLpPnlSnapshot()`在`DashboardPage`里只调一次、传给两个组件共用，避免重复起两个30秒轮询。
现场核实：图表正确显示24个市场排序（顶部一条窄的绿色柱子，往下逐渐变宽的红色柱子），汇总面板的盈利/亏损数量和最好/最差跟图表对得上，总数也跟现有Fee Revenue页的protocol-wide数字互相自洽。`pnpm run typecheck` 14/14。
### 47. `e3e955c9` — 修复oracle价格缺失时用0价喂给getMarketInfo导致的P&L虚假暴涨暴跌（2026-08-21）
用户反馈：新上线的全市场LP P&L Dashboard图表（commit 46）刷新时数字会剧烈跳变——先是-$753.85K，突然变成+$14.54M（ETH "Best for LP" +$8.21M），再过一会又变成+$947.11K（换了一批完全不同的市场在暴涨）——每次都是过一两个周期后自己"恢复正常"。
**根因**：`marketCollector.ts`在`oracle`(oracleCollector缓存)偶尔读不到的时候（不是硬故障，就是某个市场某一个5秒周期的普通缓存miss/滞后——对MSOL这种压根没配真实feed的市场则是每次都会命中），会用`ZERO_PRICE`兜底传给`getMarketInfo`的`indexTokenPrice`。`ZERO_PRICE`在`reader.ts`自己的文档注释里承诺"PnL相关字段会是0"，但部署的合约实际不是这样——对着`fx100-contracts/src/market/MarketUtils.sol:266-286`的`getPnl`核实过：只要这个市场有真实未平仓量（恰好就是这种情况会出问题的时候），价格传0算出来是`pnl = isLong ? (0 - openInterestCost) : (openInterestCost - 0)`。链上**根本没有零价格保护**。这是一个±openInterestCost级别的虚假暴涨暴跌，不是"0"——具体是哪个方向、哪个市场，完全取决于当次周期哪个oracle缓存读碰巧miss了，跟用户报告的现象完全对得上。
**修复**：`oracle`读不到时，这一周期直接跳过`getMarketInfo`整个调用（跟真实RPC失败走同一条路径），而不是拿一个被污染的零价格去算。下游所有消费者对`marketInfo`为undefined早就有null-safe兜底（既有的`readerError`路径）——检查过这个文件里每一处`marketInfo.`访问都已经有保护。现场确认：MSOL（marketIndex 3，压根没配真实oracle feed——核实过目前OI是0，所以这次是无害的，但如果它曾经挂过真实测试仓位就不是无害的了）现在每个周期都稳定走这条路径，报`pool: null`而不是编出一个假PnL。
现场核实：跑起完整的worker+web，确认MSOL每周期都按预期触发警告、真实市场没有再误触发；Dashboard的LP P&L总数在反复刷新后保持稳定，不再跳变。`pnpm run typecheck` 14/14。
### 48. `ad3acbf0` — 新增LPVault epoch时间范围 + Total/Realized/Unrealized拆分显示（2026-08-21）
commit 46的后续：想要时间范围能对齐LPVault自己的提款epoch（不只是24h/7d/30d/ALL这种滚动窗口），还想把Realized跟Unrealized分开看而不是永远预先合并成一根柱子——当然也要有合计。
**Epoch时间范围**：`packages/onchain/src/vault.ts`新增`getCurrentEpochWindow()`——`LPVault.currentEpoch()`是一个**懒更新**的链上结构体（`_advanceEpoch()`只在deposit/withdraw-request调用里面触发，不是按时间自动跑的）——现场核实过它能滞后好几周（读到index=0、startTime=2026-07-29、endTime=2026-08-05，而实际日期已经是2026-08-21）。这个函数用链上的`duration`往前投影出"按墙上时钟算，现在真正处在哪个epoch"，而不是直接相信链上结构体自己的startTime，所以不管`_advanceEpoch()`最近有没有被触发都是对的。`lpPnlCollector.ts`每周期现场读一次，给`RealizedPnlByRange`加了第5个"epoch"桶（从投影出的epoch起点开始，累加`hourlyBuckets`而不是`dailyBuckets`——因为epoch边界不是按天对齐的，需要小时级精度）。把`HOURLY_BUCKET_COUNT`从24调到216（9天），让小时级留存能覆盖当前7天的epoch还留有余量；"h24"自己的回看窗口拆成了独立常量，不会被这次留存调整影响。`PNL_RANGES`加了"epoch"之后，Fee Revenue页和抽屉里原有的时间范围选择器自动也多了一个"Epoch"选项，不用额外改代码。
**Total/Realized/Unrealized拆分**：`lib/lpPnl.ts`把原来的逐市场总额公式泛化成`lpMarketTotalUsd(row, range)`，又加了`lpPerMarketRaw(row, metric, range)`——图表和汇总面板统一调用这一个函数，保证两边口径永远一致。特意放在`lib/lpPnl.ts`而不是`dashboard/charts.tsx`（后者是`next/dynamic`懒加载的，专门为了不让recharts进主bundle）——这样page.tsx里不带图表的`LpPnlSummary`可以直接用它，不用去静态import图表模块把recharts又带回主bundle。`LpPnlChart`现在渲染两个pill切换器（Total/Realized/Unrealized，以及时间范围选择器——切到Unrealized时会隐藏，因为未实现盈亏永远是"现在这一刻"没有时间窗口概念）；`LpPnlSummary`跟着同一套选择联动，并加了一条脚注说明非"all"的时间范围只会影响realized-price这一块。
现场核实：跑起完整worker+web，`epochInfo`正确显示epoch #3（从链上滞后的#0往前投影出来的）；浏览器里切换Total/Realized/Unrealized三个数字互相自洽（Realized $1.41M + Fee-to-Pool $0.169M + Unrealized -$3.00M = Total -$1.42M，分毫不差）；切到Unrealized后时间范围选择器正确消失；Fee Revenue页原有的选择器不用改代码就自动多了"Epoch"选项。`pnpm run typecheck` 14/14。
### 49. `e9bcf256` — 新增Epoch补贴规划器（Treasury→LP补款决策）（2026-08-21）
用户提出：看到当前epoch的LP Realized P&L变成负数（当时是-$22.55K），想知道在epoch结束前——如果claim流程今天跑起来，LP实际能分到多少未分配的position/liquidation/funding手续费收入，同一笔backlog里treasury能分到多少，以及treasury现在手上实际有多少现金——因为treasury的资金相对自由，在epoch要收负的时候补一笔给LP正是手续费分配机制存在的意义。用户特别说明：目前一分钱都没claim过，但claim()一跑这些未分配的都会算进去，而且现在backlog应该已经攒了不少，够补贴了。
- `apps/worker/src/collectors/lpPnlCollector.ts`：把原有的全历史`feeInjection`假设计算（原来只算LP的ecosystem份额）扩展成同时算Treasury对同一笔backlog的份额（`totalTreasuryShareUsd`）——做补贴决策需要两边都看。新增了一个epoch范围的切片（`feeInjection.epoch`），从`feeRevenueCollector`自己的小时级收入桶（留存14天，覆盖7天epoch绰绰有余）里，从epoch的投影起点开始累加——明确标注这只是"这个epoch自己产生了多少"的参考背景数字，不是用来规划补贴的数字，因为claim()一跑是把全部历史backlog一次性扫光，不分是哪个epoch积累的；全历史总额才是真正能用的资金池。同时把`treasuryBalanceUsd`也加进来——这是Treasury现在实际持有的流动余额，跟上面那个"假设分到"的份额是两个不同的东西，现场核实过目前是$0，因为`claimFees()`/`withdrawFees()`/`claim()`一次都没跑过。
- `apps/web/src/app/dashboard/page.tsx`：新增`EpochSubsidyPlanner`，渲染在既有的"Protocol-Wide"卡片里，只在`range === "epoch"`时显示。展示这个epoch自己的手续费收入分类（背景参考）、LP的全历史可claim份额、"Epoch Realized P&L + LP份额"（最关键的合计数字）、Treasury的可claim份额和现在的实际余额、Treasury为空时的警告说明原因，以及一句结论性文案：不是"不需要动Treasury"，就是"还差$X，Treasury现在的余额够不够覆盖"。这个计算永远针对REALIZED这个口径，跟图表本身当前选的是哪个metric标签页无关——完全对应用户说的"希望LP Realized P&L补贴后为正"。所有运算全程用BigInt(1e30精度)，直到最后展示才转换——早期一版曾经中途绕道JS浮点数再转回来，提交前发现并改掉了。
现场核实：LP的全历史可claim份额读到$103,485.06，Treasury的读到$258,712.65（正好是LP的2.5倍，跟现在链上50%/20%的treasury/ecosystem比例吻合），Treasury实际余额$0，本epoch的手续费收入分类合计约$160K。Epoch Realized P&L(-$24,913.95) + LP份额($103,485.06)在屏幕上精确显示为$78,571.11，跟手算分毫不差——正确触发了"不需要动Treasury"这句结论。`pnpm run typecheck` 14/14。
## 已知未覆盖的部分（这个分支没有处理）
- `apps/web/src/app/api/snapshot/dashboard/route.ts` 是一个已存在的占位实现，读的是一个空的内存缓存（它自己的注释就写着 `// TODO: replace with Redis adapter`）。Dashboard 页面实际用的是 `/api/snapshot/markets`（这个是好的），不用这条路由——在验证第 7 条改动时顺带发现的，判断为超出本分支范围，没有动。
- checklist §五/§七/§八（LP epoch + 待提款排队组合告警、刷量检测、资金费触顶/零点差/执行价偏离计数）需要走 indexer 的事件流分析，不是当前状态快照能覆盖的。还没开始做。
- indexer-collector 这个任务没有外层看门狗/硬超时——每次 `gql()` 调用本身有 10 秒 `AbortSignal.timeout` 保护，但如果某次调用没能正确响应自己的 abort signal（2026-08-15 实测到过一次：在疑似 Goldsky 持续抖动的情况下卡在"上一轮还没跑完"长达 5 个多小时），整个任务就会无限期卡住，只能靠重启 worker 解决。这个分支没有修（见第 31 条的说明）。
## 本地怎么跑起来验证
```bash
cd fx100-monitor
git checkout feat/base-sepolia-v031-monitoring-config
cp .env.local-testnet.example .env.local-testnet   # 有 Chainlink 测试网凭证的话可以填进去
docker compose --profile sepolia up -d
pnpm dev:testnet
# 打开终端里 "- Local:" 那一行打印出来的地址（通常是 :3000，端口被占用时会自动变成 :3001）
```

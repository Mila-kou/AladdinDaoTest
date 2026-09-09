# 🛰️ Oracle 清单：Base Sepolia + Base 主网（Chainlink + Pyth 双源核对，2026-08-11）

> Notion 页面：[原文](https://app.notion.com/p/3bb3d7873f2c81b0ab1cf0fbe2dbaec1)
> 作者：fx100-sync（Gordon 的 fx100-contracts 仓库文档同步机器人，内容出自 Gordon）
> 创建时间：2026-08-13
> 最后编辑：2026-08-16
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 产品 / FX100 / 技术相关 / 合约 / 🚀 上线与部署
> 类型：设计文档

> 👥 受众：全员　｜　来源：docs/analysis/oracle/oracle_inventory.md

# FX100 Oracle 清单：Base Sepolia（测试网）+ Base 主网（准入判断）

**状态**: 整理完成，待人工核对完整性，尚未决定下一步部署动作
**日期**: 2026-08-11 首版，2026-08-13 多次更新（合并原先分开的 Sepolia/主网两份文档；补充 §1.8 备份方案定案——统一用 Pyth，不用传统 Chainlink Feed）
**范围**: 以 [`docs/analysis/markets/LIVE_MARKETS.md`](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/analysis/markets/LIVE_MARKETS.md) 为准——链上实际可交易的 **24 个资产**（market index 1,2,4-18,20-26；index 3=MSOL 内部测试资产、index 19=LIT 已于 2026-08-05 下架，均不计入 24 个可交易资产，单独在 §五 说明）。Base Sepolia 部分是"当前已部署、可测试的实际状态"；Base 主网部分是"上线前的准入判断"（还没有主网部署，是门槛检查，不是现状记录）。
**数据来源**: `docs/analysis/markets/LIVE_MARKETS.md`（资产范围权威来源）+ 本仓库 `scripts/parameters/markets-top20.draft.json`、`scripts/parameters/markets-batch2.draft.json`、`scripts/parameters/base-sepolia/oracle-msol.json`；外部核实见文末「核实方法」
**关联文档**: [fork_test_pyth_mechanism_verification.md](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/analysis/oracle/fork_test_pyth_mechanism_verification.md)（Oracle+Pyth 机制的 fork 完整验证、主备切换机制实测、备份方案设计讨论）、[risk_usdc_single_point_of_failure.md](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/analysis/oracle/risk_usdc_single_point_of_failure.md)（USDC 单点风险，本文档 USDC 行的详细分析）

---

## 一、原则与关键结论（先读）

**上线原则**：每个资产必须同时具备 **Chainlink（主 oracle）+ Pyth（交叉校验源）** 两个独立数据源，才允许上线。任一缺失，视为单点风险，不满足条件。Base Sepolia 看"是否已经双源齐全"，Base 主网看"是否能通过双源存在性这条准入门槛"——判断标准相同，只是一个是现状检查、一个是上线前置检查。

### 1.1 关于"Deviation Threshold 超过 2% 就无法交叉验证"——核实后结论和最初设想不一样

FX100 实际用作**主 oracle** 的是 Chainlink **Data Streams**（拉取式、连续计算，不是"价格变动超过阈值才更新"的推送式聚合器）。**Chainlink Data Streams 本身没有 Deviation Threshold / Heartbeat 这两个参数**（结构性事实，官方 schema 里这两个字段对 Data Streams 类目全部为空），"是否超过 2%"这个问题对主 oracle 不成立。真正有这两个参数、且已核实全部 ≤0.5%（远低于 2%）的，是可选的传统 Chainlink Price Feed 备份链路（§三）——但 Base Sepolia 上只有 3 个资产有（BTC/ETH/LINK），Base 主网大约 12 个有，其余全部只能靠 Data Stream + Pyth 双源，没有第三条链上腿。

### 1.2 ⚠️ 更正：Pyth 在 FX100 里是链上被动读取，不是"连续链下计算随时可查"

初版文档把 Pyth 描述成"连续链下计算、随时可查、没有心跳/陈旧概念"，这是套用了 Pyth 官方架构的通用说法，**但不是 FX100 合约实际消费 Pyth 的方式**。逐行核对 `src/oracle/ChainlinkPriceFeedUtils.sol`/`PythPriceFeedUtils.sol` 源码：

- `PythPriceFeedProvider.isPythOnChainProvider()` 恒返回 `true`——FX100 把 Pyth 当成**纯链上被动读取**的源，跟 `ChainlinkPriceFeedProvider`（传统 Price Feed）是**同一种模式**，不是 Data Streams 那种"链下报告 + 同笔交易内验证"的拉取模式。
- 具体调用是 `PythPriceFeedUtils.getPriceFeedPrice()` → `IPyth(pyth).getPriceNoOlderThan(id, heartbeatDuration)`——这是一次**view 调用，只读链上已经缓存好的价格**，FX100 自己完全没有在这笔交易里传入 Hermes 的签名更新数据、也没有为更新付费。
- 这个心跳用的 key 是 `priceFeedHeartbeatDurationKey(token)`——**跟传统 Chainlink Price Feed 共用同一个 DataStore key**，不是单独一套 Pyth 专属心跳配置。

**这意味着**：Pyth 能不能用，不取决于"Pyth 官方有没有维护这个资产"，而是取决于**有没有人在持续往链上的 IPyth 合约推送这个 Feed ID 的最新价格**（调用 `updatePriceFeeds()`）。FX100 自己完全没有做这件事——`fx100-apps` 全仓库搜索 `updatePriceFeeds`/price-pusher/Hermes 客户端，**零结果**。

### 1.3 全局性缺口，共三层（2026-08-13 fork 实测后更新，两个网络都适用）

1. **最底层、最严重（fork 实测坐实）：真实部署的 Oracle 合约实例本身没有能力用 Pyth**——`cast call <Oracle> "pyth()(address)"` 在 Base Sepolia 上返回零地址，而这个字段是 `immutable`，部署后永远改不了。这不是"配置没做"，是"这个合约实例从生下来就干不了这件事"，必须重新部署 Oracle（而且因为 `ChainlinkDataStreamProvider` 也有一个绑定死的 `onlyOracle`，重新部署 Oracle 还要连它一起重新部署）才能解决。完整验证过程、复现命令见 [fork_test_pyth_mechanism_verification.md](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/analysis/oracle/fork_test_pyth_mechanism_verification.md) §一/§三。
2. `pythPriceFeedKey` 在部署 schema 里**从未真正写入过 DataStore**——即使第 1 层解决了，数据存在 ≠ 已经接线，实际生效前必须先完成链上接线（`ORACLE_PROVIDER_FOR_TOKEN` + `pythPriceFeedKey` 两个 DataStore key）。
3. **即使前两层都解决了，还要有人持续给链上的 IPyth 合约推新价格**——好消息是这一层已经有具体解法并且 fork 实测跑通：`pythKeeper.ts`，一笔交易能批量刷新最多 24 个资产（见 §六）。

下表 §二"双源状态"只代表"链下有这个资产的数据源可用"，**不代表接线完成，也不代表现在的 Oracle 合约实例真的能用上它**（第 1 层）。

### 1.4 实测新鲜度：Base 主网比测试网明显更差——一个反直觉的发现

2026-08-12 起对两个网络的真实 Pyth 合约逐个资产实测 `getPriceUnsafe(id)` 的 `publish_time`，2026-08-13 又做了一次连续 4 小时观测（每 20 分钟采样一次，共 12 次，比单点快照有力得多）：

| 状态 | Base Sepolia | Base 主网 |
|---|---|---|
| 单点快照：新鲜（<30分钟） | 17 / 24 | **仅 4 / 24**（BTC、ETH、SUI、XRP） |
| 单点快照：陈旧 | 7 / 24（AERO/WLD/PUMP/ENA/TIA/ONDO/VVV，13 天~400 天不等） | **20 / 24**，部分超过 **150 天**（如 PUMP，217,390 分钟） |
| 4 小时连续观测：确实被刷新过 | 17 / 24（跟单点快照的名单完全一致） | **仅 4 / 24**（同上四个） |
| 4 小时连续观测：整窗口零更新 | 7 / 24（同上，多次观测确认不是巧合） | **20 / 24** |

**原因推测**：Base Sepolia 是很多团队共用的热门测试网，可能有其他项目/Pyth 官方自己的公共基础设施顺带把常见资产刷新了；但 Base **主网**上，如果没有真实协议在用某个资产的 Pyth 价格，就没有经济动机驱使第三方去刷新它——FX100 还没有主网部署，自然也没有在维护。**这坐实了"不能依赖第三方，必须自建 keeper"这个结论**，而且主网情况比测试网更紧迫：不是"大部分还行、几个要修"，是"绝大多数资产从一开始就要靠 FX100 自己的 keeper 才能用"。

**真实更新节奏是非常规律的"整点/半点"式，明显是定时任务，不是交易触发的自然行为**：

| 资产 | 网络 | 观测到的真实刷新间隔 |
|---|---|---|
| ETH | 两个网络都是 | 约 17~22 分钟一次（12 次采样全部刷新，全窗口最活跃） |
| BTC | Sepolia | 精确的 **3600 秒（1 小时）**一次，误差为 0 |
| BTC | 主网 | 精确的 **2400 秒（40 分钟）**一次 |
| AAVE | Sepolia | 约 3600 秒（1 小时）一次 |
| SUI / XRP | 主网 | 约 3600 秒（1 小时）一次 |
| ADA | 主网 | 观测窗口内只刷新过 1 次，间隔约 2.4 小时 |

这种**几乎零误差的固定间隔**几乎可以确定是某个第三方（大概率是 Pyth 官方自己）跑的定时 cron/keeper，不是有机行为——这份"免费"的第三方维护本质上跟 FX100 自己要建的 keeper 是同一种东西，只是不受 FX100 控制、随时可能停，而且完全不覆盖主网大部分资产。

### 1.5 离线接口（Hermes）本身的更新频率——不是链上陈旧的原因

用同一个 Feed ID 间隔几秒钟连续查询实测，不管是 BTC 这种主流资产还是 TIA/ONDO/PUMP 这类冷门资产，Hermes 返回的 `publish_time` 基本上**每 3~12 秒就会变一次**，价格也跟着微调——说明 Pythnet 底层对这 24 个资产的计算和发布本身是持续的、近乎实时的，**链上出现的几十天甚至几百天陈旧，完全是"没人推"造成的，不是 Pyth 官方这边数据本身就慢或者不维护冷门资产**。keeper 无论什么时候跑，都能从 Hermes 拿到足够新鲜的数据去推。

### 1.6 自建 keeper 的 gas 成本测算——结论：完全能承受

用 fork 上真实跑出来的一笔 keeper 交易（23 个资产打包刷新）反推，配上 Base 主网当前真实 gas 价格和真实 L1 数据费：

| 项目 | 数值 | 来源 |
|---|---|---|
| L2 执行 gas | 776,462 gas | fork 实测，23 个资产打包在一笔 `updatePriceFeeds()` 里 |
| Base 主网当前 gas price | 0.006 gwei | `cast gas-price` 实测 |
| L1 数据费 | 5.07e-8 ETH | 用**真实交易的完整 calldata**（不是补零假数据）查 `GasPriceOracle.getL1Fee()` 实测，占比约 1.1% |
| Pyth 协议自己收的 fee | 230 wei | 同一笔交易 `getUpdateFee()` 返回值，可忽略 |
| **单次批量刷新总成本** | **≈ $0.0089**（ETH=$1,885） | 三项合计 |

按不同刷新频率换算：

| 刷新频率 | 每天次数 | 每天成本 | 每月成本 |
|---|---|---|---|
| 每小时 | 24 | $0.21 | ~$6.4 |
| **每 30 分钟** | 48 | **$0.43** | **~$12.8** |
| 每 10 分钟 | 144 | $1.28 | ~$38 |
| 每 5 分钟 | 288 | $2.56 | ~$77 |

即使每 5 分钟刷新一次全部 24 个资产，一个月也只要 $77，比 FX100 自己一笔清算/开平仓执行的 gas 成本（`docs/analysis/TEST_REVIEW_FINDINGS.md` 实测 $0.03~$0.06/笔）贵不了多少，是完全能承受的成本量级。（这是当前 Base 极低 gas 价格环境下的数字，即使涨 10 倍也只是每月 $128，仍然便宜。）

### 1.7 对比 GMX 怎么做

查了 GMX 官方文档 + 本地 `gmx-synthetics` 仓库全文搜索 "pyth"（**零匹配**）——**GMX v2 完全不用 Pyth**，主 oracle 就是 Chainlink Data Streams（跟 FX100 主路径一样，拉取式、随每笔交易带新鲜签名价格），**没有第二条参考价交叉校验**，所以他们压根没有"链上缓存新鲜度维护"这个问题——主价格本来就是每笔交易现取的。也就是说，**Pyth 交叉校验是 FX100 自己加的一层 GMX 原版没有的额外保护，不是照抄 GMX 的做法**，这笔 keeper 开支是为了多一层安全保障主动承担的运维成本，不是 GMX 帮忙验证过的"标准做法"。

### 1.8 ✅ 备份方案定案（2026-08-13）：备份统一用 Pyth，不用传统 Chainlink Feed；备份期间接受"单源、无交叉校验"，靠应急 keeper 加速刷新兜底

**决策**：Data Stream（主路径）失效时，切换到的备份是 **Pyth**，不是 §三 记录的传统 Chainlink Price Feed。§三 的信息继续保留在文档里，仅作为"这些资产在链上还有这条备用数据源存在"的参考记录，**不是当前选定的备份路径**。

**为什么放弃传统 Chainlink Feed 当备份**（§三已核实的两个真实缺陷）：

1. **不全面**——Base Sepolia 只有 BTC/ETH/LINK 三个资产有；Base 主网约 12/24 个有，另外 12 个完全没有，做不到给全部 24 个资产统一备份。
2. **偏差阈值对高杠杆太松**——传统 Feed 是"价格变动超过阈值（部分资产 0.5%）或到心跳时间才更新"的推送式聚合器，100 倍杠杆下 0.5% 的滞后相当于 50% 保证金，风险偏高。

**改用 Pyth 当备份后，浮现出一个真实的架构矛盾，已接受、不打算改合约解决**：`Oracle._validatePrices()` 里 `if (!provider.isPythOnChainProvider())` 这一行，把"Pyth 是当前主 provider"和"继续对 Pyth 做交叉验证"做成了互斥——一旦切到 Pyth-as-primary，合约会自动跳过校验（避免拿 Pyth 校验 Pyth 自己）。**这意味着备份期间只有 Pyth 一个数据源在用，没有第二条链上腿做交叉验证**。这不是配置能绕开的，唯一的解法是改合约逻辑（比如"主是 Pyth 时改去校验传统 Feed"），但对没有传统 Feed 的 12 个资产依然无解——本质是"全仓库只接了两个独立源，两个都拿去当主的时候，没有第三个源可以再校验"，是数据源数量的硬约束。**定案结论是接受这个现实**：备份本来就是临时应急状态，主路径恢复后可以立刻切回（见下），不要求备份期间做到和正常运行时同等的安全冗余。

**缓解措施：应急 keeper 状态机（设计阶段，尚未实现）**——接受"单源"的同时，尽量让这段时间内唯一在用的 Pyth 价格保持新鲜：

- **触发方式**：监听 `Config.sol::setOracleProviderForToken` emit 的 `SetOracleProviderForToken` 事件，一旦某个 token 被切到 Pyth-as-primary，keeper 自动切到"加速模式"；看到切回 Data Stream，立刻降回正常节奏（30 分钟一次）。
- **加速到多快**：Hermes 实测每 3~12 秒就有新报价（§1.5），理论上可以按这个频率刷新链上缓存。
- **⚠️ 必须是事件触发的短时爆发，不能是常态策略**：按 §1.6 实测的单次批量刷新成本 $0.0089 计算，如果按 7.5 秒一次**常年**跑，一个月要 **$3,075**，是正常 30 分钟节奏（$12.8/月）的 **240 倍**；但如果只在备份激活的窗口内跑（比如一次故障处理 1 小时），这 1 小时只要 **$4.27**，完全可以接受。
- **切换机制的两个关键实测事实，直接决定这套 keeper 好不好落地**：
  1. **切换是纯人工操作，合约里没有任何自动检测/自动切换逻辑**——全仓库搜索 `setOracleProviderForToken` 的调用方，只有 `Config.sol` 自己定义了这个函数，没有任何执行路径（`OrderHandler`/`LiquidationHandler`/`AdlHandler`）会在 Data Stream 失败时自动触发切换；必须运维人工判断后手动调用（需要 `CONFIG_KEEPER` 角色）。keeper 的加速状态机只能挂在这个人工触发的事件上，不能假设系统会自愈。
  2. **`ORACLE_PROVIDER_MIN_CHANGE_DELAY` 真实配置=0，切换和切回没有强制冷却**——fork 实测证实这个延迟只锁"重复切同一个 provider"，不锁"切到另一个 provider"（正常的"切回主"操作），所以运维可以在主路径确认恢复后立即切回，加速窗口的时长完全由实际故障处理时间决定，不会被合约层面的冷却时间拉长。

**⚠️ 备份期间真正要担心的参数是 `priceFeedHeartbeatDuration`，不是 `MAX_ORACLE_PRICE_AGE`（2026-08-13 24 资产 fork 实测确认，容易搞错的一点）**：

直觉上"切到 Pyth 当主之后，是不是要把 `MAX_ORACLE_PRICE_AGE`（生产真实值 60 秒）适当放宽，否则容易因为价格太旧成交不了"——这个直觉的方向没错（备份期间确实有"新鲜度不够、成交不了"的真实风险），但**具体这个参数不需要动，因为它对 Pyth-as-primary 结构性地不生效**：

- `PythPriceFeedProvider.getOraclePrice()`（以及同样是"链上被动读取"模式的 `ChainlinkPriceFeedProvider`）返回的 `timestamp` 字段**直接就是 `block.timestamp`**（源码 `src/oracle/PythPriceFeedProvider.sol` 最后一行 `timestamp: block.timestamp`，源码自己的注释也写明"the timestamp returned is based on the current blockchain timestamp"），不是 Pyth 自己缓存的 `publishTime`。
- `Oracle._validatePrices()` 里 `MAX_ORACLE_PRICE_AGE` 的判断是 `validatedPrice.timestamp + maxPriceAge < block.timestamp`——把 `timestamp = block.timestamp` 代进去就是 `block.timestamp + maxPriceAge < block.timestamp`，只要 `maxPriceAge ≥ 0` 恒为假，**这个检查在 Pyth（或传统 Feed）当主时永远不会触发**，调不调整这个参数都一样。24 资产 fork 实测中，Pyth 备份这一轮全程没有碰过 `MAX_ORACLE_PRICE_AGE`，24/24 依然全部成功，直接印证了这一点。
- **真正会挡成交的是 `priceFeedHeartbeatDurationKey(token)`**——`PythPriceFeedUtils.getPriceFeedPrice()` 内部调用 `IPyth(pyth).getPriceNoOlderThan(id, heartbeatDuration)`，这是 Pyth 合约自己对"缓存价格是否够新"的校验，跟 `MAX_ORACLE_PRICE_AGE` 完全是两套独立机制。如果这个心跳配得比 keeper 实际刷新链上缓存的频率更紧，就会在两次刷新之间的窗口期内让交易全部失败（Pyth 自己的 `StalePrice` revert）。这正是 §1.8 缓解措施里"应急 keeper 加速刷新"要解决的问题——不是去放宽心跳阈值（放宽=削弱新鲜度保障），而是让 keeper 跑得比心跳阈值更快，两者要配套设计，不能只调一边。
- **次要但同样容易被忽略的一点：`MAX_ORACLE_TIMESTAMP_RANGE`（生产真实值同为 60 秒）**——这个参数限制的是**同一笔 `setPrices()` 调用里**所有 token 的 `timestamp` 最大跨度。如果某一笔交易里同时提交了"仍在主路径（Data Stream，真实签名时间，可能已经滞后接近 60 秒）"和"已切到 Pyth 备份（`timestamp=block.timestamp`，即"现在"）"这两类 token，二者时间戳的差值有可能超过这 60 秒的上限，从而触发 `MaxOracleTimestampRangeExceeded`。这个风险只在"部分资产已切备份、部分资产仍在主路径，且被打包进同一笔调用"这种混合场景下才会出现——按 FX100 目前逐 token 独立配置 provider 的设计，正常的单笔开平仓（只涉及 1 个 index token + USDC，USDC 已经不走 Oracle 校验）不会踩到，但如果未来 keeper 或批量操作把多个处于不同 provider 状态的资产打包进同一笔调用，需要注意这一点。

**现状**：`pythKeeper.ts` 目前还是固定节奏（默认 30 分钟一次），**没有实现**"监听切换事件 → 自动加速/降频"这套状态机——这是一项待开发的运维能力，不是已经上线的功能。完整的分析过程、fork 实测复现命令见 [fork_test_pyth_mechanism_verification.md](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/analysis/oracle/fork_test_pyth_mechanism_verification.md) §八（主备切换机制实测）/§九（本节决策的完整讨论过程）。

### 1.9 Pyth 交叉校验能防住 Chainlink Data Stream 插针吗？——假设三层缺口都已修复，风险到底剩在哪（2026-08-17）

以下分析的前提是**§1.3 提到的三层缺口都已解决**（Oracle 重新部署、`pythPriceFeedKey` 已配置、keeper 持续刷新 Pyth 缓存）——即这套交叉校验机制处于完全生效的理想状态。在这个前提下，回答"能不能防插针"：**能防一部分，不是全部，防住的和防不住的边界很明确，是"两个源分歧"和"两个源一起被带偏"的区别。**

**能防住的场景：插针只出现在 Chainlink 这条管道自己身上**——DON 聚合出 bug、某个 relayer 传错数据、签名节点被攻破、上游数据源配置错误。Pyth 是完全独立的数据源+独立的聚合网络，大概率不会同时出同样的错，这时候两边价格会出现明显分歧，被 `MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR`（生产真实值 2%）挡下来。§十 的 fork 实测已经直接验证过这个效果：把这个阈值收紧到 0（零容差），Data Stream 和 Pyth 哪怕只差几个基点也会被拒——机制本身是有效的。

**防不住的场景：插针是某个交易所真实出现的极端瞬时价格**（流动性差的 CEX 被砸盘、闪崩/闪拉），且 Chainlink 和 Pyth 的聚合网络**恰好都覆盖到了同一批交易所**——这是"插针"最常见的含义。这种情况下两条腿会同时反映这个价格，差异不会触发 2% 阈值，**交叉校验对此完全无效**。这是任何"比对两个独立源"类防御的通用局限，不是 FX100 实现得不够好——交叉校验的本质是"抓分歧"，抓不住"两边一起被同一个真实事件带偏"的情况。

**一个容易被忽略但值得说明的背景**：Chainlink Data Streams 本身在生成报告时，已经是多交易所加权聚合的结果，不是从单一交易所直接采样。这意味着真正只出现在单一小交易所的插针，很多时候在到达 FX100 之前就已经被 Chainlink 自己的聚合方法过滤掉了——第一道防线其实是 Chainlink DON 自己的聚合逻辑，不在 FX100 控制范围内。所以更准确的定位是：**Pyth 交叉校验主要防的是"Chainlink 这条数据管道自身故障"，而不是直接防"交易所层面的价格插针"**。

**即便机制完全生效，2% 阈值对高杠杆也偏宽松**：100 倍杠杆下，2% 的价格偏差相当于 200% 保证金——真正能在阈值内溜过去、但依然足以打穿仓位的"轻插针"，交叉校验拦不住，只有超过 2% 的粗暴分歧才会被拒。收紧阈值能缩小这个盲区，但会以更频繁触发 revert（正常波动也可能被误伤）为代价，是一个需要权衡的参数，不是越紧越好。

**小结——三层防线各自的作用范围，不要混淆**：

| 防线 | 防住什么 | 防不住什么 |
|---|---|---|
| Chainlink DON 自己的多交易所聚合 | 单一小交易所的局部插针 | DON 自身的聚合/传输故障 |
| Pyth 交叉校验（2% 阈值） | Chainlink 管道自身故障导致的价格异常（分歧类） | 两个源一起观测到的真实市场瞬时波动（相关类）；2% 阈值以内的轻度分歧 |
| 仓位层面的清算保护期（grace period，另见 `docs/analysis/adl/risk_grace_period_immunity.md`） | 瞬时波动短暂打穿清算线但很快恢复的情况——直接从"仓位是否该被清算"这个结果层面兜底，不依赖判断价格本身是否可信 | 不属于 oracle 层防线，也不解决"价格本身被写错"的问题，是互补而非替代关系 |

三层各管一段，交叉校验解决不了的"相关类"插针，真正的兜底更多要靠仓位层面的保护机制，而不是继续在 oracle 层面加码。

---

## 二、逐资产双源核对：Base Sepolia（现状）+ Base 主网（准入）并排对照

**说明**：编号用的是 `LIVE_MARKETS.md` 里链上真实的 market index，跳号的 3（MSOL）和 19（LIT）见 §五。Sepolia/Mainnet 的 Chainlink Stream ID 是**两个完全不同的 ID**（Chainlink 对 mainnet/testnet 分别维护"Global"/"GlobalTestnet"两套独立目录，不是同一个 ID 通用两边）。Pyth Feed ID 全网通用（mainnet/testnet 同一个 ID，只有链上合约地址不同，已核实与官方 Hermes 注册表一致，查询方法见文末）。新鲜度数据见 §1.4。

| market | 资产 | Chainlink Sepolia Stream ID | Chainlink Mainnet Stream ID | Pyth Feed ID | Sepolia 双源状态 | Mainnet 准入结论 | 备注 |
|---|---|---|---|---|---|---|---|
| 1 | BTC | `0x00037da06d56d083fe599397a4769a042d63aa73dc4ef57709d31e9971a5b439` | `0x00039d9e45394f473ab1f050a1b963e6b05351e52d71e507509ada0c95ed75b8` | `0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43` | ✅ 双源齐全 | ✅ 可上 | 两个网络都另有传统 Price Feed（§三，仅参考记录，非选定备份路径见 §1.8） |
| 2 | ETH | `0x000359843a543ee2fe414dc14c7e7920ef10f4372990b79d6361cdc0dd1ba782` | `0x000362205e10b3a147d02792eccee483dca6c7b44ecce7012cb8c6e0b68b3ae9` | `0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace` | ✅ 双源齐全 | ✅ 可上 | 同上；两个网络里更新最活跃的资产 |
| 4 | HYPE | `0x0003cbac760d50c462267f3127374f5fa039eb971dd4a58a2b4f2b664769f8ea` | `0x0003d34539af562867c3cb309b59efccf40e74b404fb415eeb7699d61322aed9` | `0x4279e31cc369bbcc2faf022b382b080e32a8e689ff20fbc530d2a603eb6cd98b` | ✅ 双源齐全 | ✅ 可上（Base 无传统 Feed，纯双源） | Pyth 另有 HYPER/KHYPE/LHYPE/MHYPE/STHYPE 等相似 symbol，已核实这个 ID 对应 HYPE 本体 |
| 5 | SOL | `0x0003d338ea2ac3be9e026033b1aa601673c37bab5e13851c59966f9f820754d6` | `0x0003b778d3f6b2ac4991302b89cb313f99a42467d6c9c5f96f57c29c0d2bc24f` | `0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d` | ✅ 双源齐全（**本文档更正**） | ✅ 可上（mainnet 流一直是对的） | Sepolia 旧 ID 曾是资金费率流，已在 `feedIds.ts` 修好（2026-08-01） |
| 6 | WLD | `0x00035f53bfb39e634d28d9c00cdc6ae53bdd9ad83a692341c2495aa5a24cc245` | `0x000365f820b0633946b78232bb91a97cf48100c426518e732465c3a050edb9f1` | `0xd6835ad1f773de4a378115eb6824bd0c0e42d84d1c84d9750e853fb6b6c7794a` | ✅ 双源齐全 | ✅ 可上 | Chainlink 风险分级字段为空（未设置），不是"高风险" |
| 7 | ZEC | `0x00039c0417ee6ffb4bae0964e2093d1d7ecd69628aac53f1f8f00d04e115d3cf` | `0x00039f8a144f4a62715ca60aec1cf848c4821375c57e2259c6c90b7fa49db693` | `0xbe9b59d178f0d6a97ab4c343bff2aa69caa1eaae3e9048a65788c529b125bb24` | ✅ 双源齐全 | ✅ 可上 |  |
| 8 | VVV | `0x0003dc0265d4419472f5a4cd68e8bcbaf9b01be500507b05fe7063626913c2e0` | `0x0003195dde0f669c58fa396bdd60488cbebcf4e0d869905fb79b3ed4b763c7a9` | `0x5ece7483ae221e3645ec0f9b5c6671ac830cb85471744df5d8e7deae152e31a2` | ✅ 双源齐全 | ✅ 可上（有传统 Feed 但 18 位精度+"new"风险级，见 §三） | Sepolia 端观测：约 400 天没更新 |
| 9 | LINK | `0x00036fe43f87884450b4c7e093cd5ed99cac6640d8c2000e6afc02c8838d0265` | `0x00036d7a1251e3f67d6658466b5e9e7fe8418af7feac9567ff322bff95cc2401` | `0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221` | ✅ 双源齐全 | ✅ 可上 | 两个网络都另有传统 Price Feed（§三，参考记录） |
| 10 | SUI | `0x00034881db604b551ff226aa414ba73dd5b2be0a06834124dafa9bf66871ce89` | `0x000348ce31679e9ce1f80ec929f1d7c86499569d67f1cea80a90d6e5e3c127a7` | `0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744` | ✅ 双源齐全 | ✅ 可上（有传统 Feed） | Pyth 另有 HASUI/VSUI/AFSUI/STSUI（质押衍生品），已核实这个 ID 是原生 SUI |
| 11 | AERO | `0x00033cf9f3040c301dcbfbf6d2827e49dc78e361b947eefe2dd870c86b950ca9` | `0x00038458999fd77d9deece17154ee687193b328cf7a53670501dd8ccad906ff6` | `0x9db37f4d5654aad3e37e2e14ffd8d53265fb3026d1d8f91146539eebaa2ef45f` | ✅ 双源齐全 | ✅ 可上（有传统 Feed，category=medium） | Sepolia 端观测：约 13 天没更新 |
| 12 | NEAR | `0x0003d64b0bdb0046a65e4ebb0a9866215044634524673c65bff4096a197fcff5` | `0x00036e9386eda6b177c6f7e9d493e60ae9ebaeb732a271b880b4d6a131d6b3f5` | `0xc415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750` | ✅ 双源齐全 | ✅ 可上 |  |
| 13 | XLM | `0x00037dfe3b67b7552cf15e10ee5fb0c0ab6d658b20eb558effe2ae4579d24c58` | `0x000358cb12b1f5bbeca8b5b4666025a40b15520af1f82516ee2fb9a335055e9a` | `0xb7a8eba68a997cd0210c2e1e4ee811ad2d174b3611c22d9ebf16f4cb7e9ba850` | ✅ 双源齐全 | ✅ 可上 |  |
| 14 | ENA | `0x0003f04d6244b2fb6bb366b405f63d87fa3550647acbc1c93f9c116df4645772` | `0x00033e05a40dd8c25ffa1b88a35234845c067635f7ddf5edde701f859f8894c1` | `0xb7910ba7322db020416fcac28b48c01212fd9cc8fbcbaf7d30477ed8605f6bd4` | ✅ 双源齐全 | ✅ 可上 | Sepolia 端观测：约 94 天没更新；风险分级字段同样为空 |
| 15 | TIA | `0x00036173437e26ef8dc971c19070b2c05f6575bdb484c2c45e06e99fec290bd2` | `0x00034a6c27424c06b3441b8714c9b11bb4e7dc38548a525cee36ee232ffea013` | `0x09f7c1d7dfbb7df2b8fe3d3d87ee94a2259d212da4f30c1f0540d066dfa44723` | ✅ 双源齐全 | ✅ 可上 | Sepolia 端观测：约 330 天没更新 |
| 16 | ONDO | `0x000380fd590efd03f8368469267e187c251231fcf42bdf4c6ff08f56fe495b71` | `0x000380ec05b354a41eddf993234e7fb62bb1a39b1d63ada55a43bb2ef210de4a` | `0xd40472610abe56d36d065a0cf889fc8f1dd9f3b7f2a478231a5fc6df07ea5ce3` | ✅ 双源齐全 | ✅ 可上 | Sepolia 端观测：约 330 天没更新 |
| 17 | XRP | `0x00035e3ddda6345c3c8ce45639d4449451f1d5828d7a70845e446f04905937cd` | `0x0003c16c6aed42294f5cb4741f6e59ba2d728f0eae2eb9e6d3f555808c59fc45` | `0xec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8` | ✅ 双源齐全 | ✅ 可上（传统 Feed 有两个候选地址未定 canonical，见 §三） | Pyth 另有 CBXRP（Coinbase 封装版），已核实这个 ID 是原生 XRP |
| 18 | ARB | `0x0003c90f4d0e133914a02466e44f3392560c86248925ce651ef8e44f1ec2ef4a` | `0x00030ab7d02fbba9c6304f98824524407b1f494741174320cfd17a2c22eec1de` | `0x3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5` | ✅ 双源齐全 | ✅ 可上 |  |
| 20 | TON | `0x0003167e54377caae2bdbefbefabb839916ed73e70468519a3b6a26b9c54e2f2` | `0x0003f9ec12942ff27b28ab151905c8fc1cb280518d8bbd3885d410eaa50ddc56` | `0x8963217838ab4cf5cadc172203c1f0b763fbaa45f346d8ee50ba994bbcac3026` | ✅ 双源齐全 | ✅ 可上 |  |
| 21 | AAVE | `0x0003c8e550d2fc5304993010112de9b69798297e4cc11990ee6250e464daf760` | `0x0003481a2f7fe21c01d427f39035541d2b7a53db9c76234dc36082e6ad6db7f5` | `0x2b9ab1e972a281585084148ba1389800799bd4be63b957507db1349314e47445` | ✅ 双源齐全（实测验证，7 次采样最大误差 6.3bp） | ✅ 可上（有传统 Feed，deviation/heartbeat 未核实） |  |
| 22 | PUMP | `0x0003392ea25a7f0f48f255a0086489d950f148a3fd7f58bdd7991e39956b7320` | `0x00032ce910d5ee7e47506b9f0607acdc017fb6cd92ed3696eb3573db6ad41cb9` | `0x7a01fca212788bba7c5bf8c9efd576a8a722f070d2c17596ff7bb609b8d5c3b9` | ✅ 双源齐全（实测验证，10.5bp 误差，唯一候选） | ✅ 可上（Base 无传统 Feed，纯双源） | Sepolia 端观测：约 94 天没更新 |
| 23 | BNB | `0x000387d7c042a9d5c97c15354b531bd01bf6d3a351e190f2394403cf2f79bde9` | `0x000335fd3f3ffa06cfd9297b97367f77145d7a5f132e84c736cc471dd98621fe` | `0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f` | ✅ 双源齐全（testnet ID 与 gmx-synthetics Avalanche Fuji 配置一致，交叉印证过） | ✅ 可上（有传统 Feed，deviation/heartbeat 未核实） |  |
| 24 | XMR | `0x0003c70558bd921b1559d37b8e347797f121d1240e7386e68b2bee9b731b0833` | `0x00038f3b8f8be4305564abf0ed3c9cc46cb8b4303c35ab54079ea873b7d74b3a` | `0x46b8cc9347f04391764a0361e0b17c3ba394b001e7c304f7650f6376e37c321d` | ⚠️ 双源存在但 testnet 流质量待验证（Chainlink 状态 `testing` 不是 `live`） | ✅ 可上（mainnet 状态是 `mainnet-production`，活跃） | 本次核实推翻了此前"XMR 无测试网 stream"的旧结论 |
| 25 | ADA | `0x00033470b2bb164a50c5a6fda879ddabcf8fb91fcfca048ac81a6bd5763fa1e3` | `0x00038580225b924c69e28ea101d4723d90c1b44ab83548a995c3d86ad9e92eb0` | `0x2a01deaec9e51a579277b34b122399984d0bbf57e2458a7e42fecd2829867a0d` | ✅ 双源齐全 | ✅ 可上（有传统 Feed） | **Chainlink 官方风险分级里这 24 个资产中唯一标为 Medium 的**，建议关注 |
| 26 | DOGE | `0x00032057c7f224d0266b4311a81cdc3e38145e36442713350d3300fb12e85c99` | `0x000356ca64d3b32135e17dc0dc721a645bf50d0303be8ceb2cdca0a50bab8fdc` | `0xdcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c` | ✅ 双源齐全（testnet ID 同样与 Avalanche Fuji 配置交叉印证过） | ✅ 可上（有传统 Feed，deviation/heartbeat 未核实） |  |

**⚠️ "双源齐全"/"可上"不等于接线完成、不等于已上线**：只代表数据源可用，见 §1.3 三层缺口；也不代表参数已定稿（资金费/价差/风控参数很多资产还是 ETH 模板占位，见各自 draft json 的 `derivation`/`paramStatus` 字段）。

---

## 三、传统 Chainlink Price Feed——参考记录，⚠️ 非当前选定的备份路径

**这是唯一真正有 Deviation Threshold / Heartbeat 概念的一层**（§1.1 已说明主 oracle Data Streams 没有这两个参数）。**已定案（§1.8）：备份统一用 Pyth，不用这里的传统 Feed**——原因是覆盖不全（只有部分资产有）+ 偏差阈值对高杠杆太松。本节数据继续保留，仅供了解"这些资产链上还有这条数据源存在"，不代表它会被启用为备份路径。

### 3.1 Base Sepolia（只有 3 个资产有）

| 资产 | Base Sepolia 地址 | 精度 | 心跳 | 偏差阈值 | 满足 <2%？ |
|---|---|---|---|---|---|
| BTC | `0x0FB99723Aee6f420beAD13e6bBB79b7E6F034298` | 8 | 1200s | 0.1% | ✅ |
| ETH | `0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1` | 8 | 1200s | 0.15% | ✅ |
| LINK | `0xb113F5A928BCfF189C998ab20d753a47F9dE5A61` | 8 | 86400s | 0.5% | ✅ |

其余全部资产在测试网没有这条备份链路，只能靠 Data Stream + Pyth 双源。

### 3.2 Base 主网（约 12 个资产有）

| 资产 | Base 主网地址 | 精度 | 心跳 | 偏差阈值 | 满足 <2%？ | 备注 |
|---|---|---|---|---|---|---|
| BTC | `0x64c911996D3c6aC71f9b455B1E8E7266BcbD848F` | 8 | 1200s | 0.1% | ✅ |  |
| ETH | `0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70` | 8 | 1200s | 0.15% | ✅ |  |
| SOL | `0x975043adBb80fc32276CbF9Bbcfd4A601a12462D` | 8 | 86400s | 0.5% | ✅ |  |
| LINK | `0x17CAb8FE31E32f08326e5E27412894e49B0f9D65` | 8 | 86400s | 0.5% | ✅ |  |
| SUI | `0x491a921c41d6a97C57426E0c0108a231cd6E5f60` | 8 | 86400s | 0.5% | ✅ |  |
| AERO | `0x4EC5970fC728C5f65ba413992CD5fF6FD70fcfF0` | 8 | 86400s | 0.5% | ✅ | Chainlink `feedCategory: medium` |
| VVV | `0xaABc55Ca55D70B034e4daA2551A224239890282F` | **18** | 86400s | 0.5% | ✅ | `feedCategory: new`（最高谨慎级）；**18 位精度，不是常见的 8 位**，接线时精度换算必须做对 |
| XRP | `0xF35059FB4471333F81E4F39fA40260FF53Dc340b` | 未核实 | 未核实 | 未核实 | — | 另有候选地址 `0x9f0C1dD78C4CBdF5b9cf923a549A201EdC676D34`，哪个是官方 canonical 尚未确认 |
| AAVE | `0x3d6774EF702A10b20FCa8Ed40FC022f7E4938e07` | 未核实 | 未核实 | 未核实 | — | Batch2 新增资产，deviation/heartbeat 尚未补齐 |
| BNB | `0x4b7836916781CAAfbb7Bd1E5FDd20ED544B453b1` | 未核实 | 未核实 | 未核实 | — | 同上 |
| ADA | `0x34cD971a092d5411bD69C10a5F0A7EEF72C69041` | 未核实 | 未核实 | 未核实 | — | 同上 |
| DOGE | `0x8422f3d3CAFf15Ca682939310d6A5e619AE08e57` | 未核实 | 未核实 | 未核实 | — | 同上 |

其余资产（HYPE/WLD/ZEC/XMR/NEAR/XLM/ENA/TIA/ONDO/ARB/TON/PUMP）在 Base 主网**没有**传统 Price Feed，只能靠 Data Stream + Pyth 双源，这不影响 §二 的准入结论（准入标准本来就不要求这条备份链路）。

---

## 四、链上基础设施地址

| 组件 | 网络 | 地址 | 说明 |
|---|---|---|---|
| Chainlink Data Streams Verifier Proxy | Base Sepolia | `0x8Ac491b7c118a0cdcF048e0f707247fD8C9575f9` | 验证 DON 签名报告用，所有资产共用同一个合约 |
| Pyth IPyth 合约（当前） | Base Sepolia | `0xA2aa501b19aff244D90cc15a4Cf739D2725B5729` | 所有 Pyth Feed ID 共用同一个合约 |
| Pyth IPyth 合约（升级版，**2026-08-18 生效**） | Base Sepolia | `0x5f52e4DBEA21f5b23523B6e20d50c29ae0a4EB83` | Pyth DAO 将在这个日期自动迁移，新接入应直接用新地址 |
| Pyth IPyth 合约（当前） | Base 主网 | `0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a` | [basescan 链接](https://basescan.org/address/0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a) |
| Pyth IPyth 合约（升级版，**2026-08-18 生效**） | Base 主网 | `0xbC16aee60f64864882BC6C4E428e148Fc0E272F5` | 同上，主网也会在这个日期切换 |

**给链上更新 keeper 的实现提示**：`updatePriceFeeds(bytes[] calldata updateData)` 接收的是数组，Hermes 接口也支持一次传多个 `ids[]`（`https://hermes.pyth.network/v2/updates/price/latest?ids[]=<id1>&ids[]=<id2>...`），**24 个资产可以在一笔交易里一次性全部刷新**，不需要每个资产单独发一笔交易，只需要付一笔按总数据量计算的 fee（`getUpdateFee(updateData)` 查询）。

---

## 五、不计入 24 个可交易资产的两个特殊 market index（仅 Base Sepolia，主网从未部署）

| market index | 资产 | 状态 | 说明 |
|---|---|---|---|
| 3 | MSOL | 内部测试专用，不对外上线 | `LIVE_MARKETS.md` 明确标注"合成测试资产、mock oracle、价格人工维护"。Oracle 现状：`oracle-msol.json` 里 `dataStream.feedId` 全零（未配置任何 Data Stream），只有一个传统 Price Feed（`0x1943907D...`，`heartbeatDuration=31536000` 即 1 年，大概率是占位符非真实心跳），Pyth Feed ID 从未记录过——**双源都不齐**，比 §二 任何一个正式资产都差，因为它本来就不是对外交易资产，不适用同一套上线标准，仅记录现状供参考 |
| 19 | LIT | **已于 2026-08-05 下架**（GMX 已下架该资产），链上 `IS_MARKET_DISABLED = true` | 下架前的 oracle 信息仍留档：Chainlink test Stream ID `0x00037610d1f26dfb7f7dbf22765a59700dec8203590344e85aca969af9b5897b`，Pyth Feed ID `0xc0c83f00c39165892d55dcd17ade2191e289697e2ac132d9ab721e20834e2a9e`（**重要**：Pyth 官方把这个 Feed ID 标注为 "Lighter"，一个永续合约 DEX 代币，**不是 Litecoin**——如果当初 FX100 的 LIT 市场想做的是 Litecoin，双源本来就没对齐，这可能也是它被下架的原因之一，未证实）。因为已下架，不再计入本文档的 24 个可交易资产 |

USDC（协议唯一抵押品，不是一个可交易 market）另见 [risk_usdc_single_point_of_failure.md](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/analysis/oracle/risk_usdc_single_point_of_failure.md)：Data Stream 存在（`0x0003dc85e8b01946bf9dfd8b0db860129181eb6105a8c8981d9f28e00b6f60d9`），Pyth 未配置，是已知的单点风险，不重复展开。

---

## 六、待办清单（按优先级，两个网络合并）

1. **最优先、之前没意识到的前置阻塞项：重新部署 Oracle + ChainlinkDataStreamProvider**——真实部署的 Oracle 合约 `pyth` 字段（immutable）是零地址，架构上就没有能力用 Pyth，不是配置问题；`ChainlinkDataStreamProvider` 又绑定了一个 `onlyOracle` 检查，只认它自己构造时那一个旧 Oracle 地址，所以重新部署 Oracle 必须连它一起换。这是一次合约迁移，不是配置变更，工作量和排期应该按迁移评估。`ChainlinkPriceFeedProvider`（备份路径）没有这种绑定，可以直接复用。完整验证过程见 [fork_test_pyth_mechanism_verification.md](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/analysis/oracle/fork_test_pyth_mechanism_verification.md)。
2. **搭建 Pyth 链上更新 keeper**：`pythKeeper.ts` 已经写好并在 fork 上实测跑通（一笔交易批量刷新 23/24 个资产成功）。上线前优先覆盖 Sepolia 上已经严重陈旧的 7 个资产（AERO/WLD/PUMP/ENA/TIA/ONDO/VVV），主网则几乎全部 24 个资产从一开始就要靠它。
3. **开发应急加速状态机**（§1.8 定案后的配套工作，当前 `pythKeeper.ts` 尚未实现）：监听 `SetOracleProviderForToken` 事件，切到 Pyth-as-primary 时自动加速到 Hermes 原生频率（3~12 秒），切回 Data Stream 立刻降回正常节奏；必须做成事件触发的短时爆发，严禁常态化运行（成本会暴涨 240 倍）。
4. **`pythPriceFeedKey` 全局未接线**：所有资产共同的缺口，不是任何单个资产的问题——即使显示"双源齐全"，也只代表数据可用。接线之后还要满足第 2 条（有人持续推新）才能真正跑起来。
5. **XMR 测试流状态复核**：新发现的 testnet stream 状态是 `testing` 不是 `live`，正式依赖它之前应该实测几次报告质量。
6. **MSOL 补全**（若未来要转正）：当前主 oracle 未配置（feedId 全零）、Pyth 完全没有——见 §五。
7. **XRP 主网传统 Feed 的 canonical 地址待定**：两个候选地址（`0xF35059FB...`/`0x9f0C1dD7...`）需要先确认哪个是官方的——仅作参考记录用，不影响 §1.8 已定案的 Pyth 备份路径。
8. **24 个资产全部核对了 Pyth Feed ID 与官方注册表一致**（零错配），**没有必要重新逐个再核一遍**，除非未来资产列表变化。
9. **Base Sepolia 传统 Price Feed 覆盖极稀疏**（只有 3 个），这是已知现状不是新问题，且已不影响备份路径选择（§1.8）。

---

## 核实方法（供复核参考，含可直接重跑的命令）

**Chainlink 数据**：直接读取 Chainlink 官方 Reference Data Directory（`reference-data-directory.vercel.app` 下的各链 JSON，即 docs.chain.link/data.chain.link 页面实际读取的同一份后端数据），逐个 Feed ID 精确匹配（不是模糊搜索），mainnet 986 条 + testnet 2,356 条 Data Streams 条目全部比对过。

**Pyth Feed ID**：查询 Pyth 官方 Hermes 注册表 API，命令可直接复制重跑：

```bash
curl -s "https://hermes.pyth.network/v2/price_feeds?asset_type=crypto&query=BTC" | python3 -m json.tool
```

返回结构（每条记录）：

```json
{
  "id": "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  "attributes": {
    "asset_type": "Crypto", "base": "BTC", "description": "BITCOIN / US DOLLAR",
    "display_symbol": "BTC/USD", "generic_symbol": "BTCUSD",
    "quote_currency": "USD", "schedule": "...", "symbol": "Crypto.BTC/USD"
  }
}
```

**关于能不能从这里查到 Deviation Threshold / Heartbeat——答案是查不到，这不是没查全，是这个注册表压根不提供这两个字段**。上面的 `attributes` 字段列表就是全部内容，没有任何跟阈值/心跳相关的键。进一步查实时价格接口确认同样没有：

```bash
curl -s "https://hermes.pyth.network/v2/updates/price/latest?ids[]=e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43" | python3 -m json.tool
```

返回的 `price` 对象只有 `price`/`conf`（实时置信区间，随每次更新变化，不是固定配置的阈值）/`expo`/`publish_time`——同样没有 deviation threshold 或 heartbeat 配置值。另外查了 Pyth 官方 best-practices 文档，原文明确说法是"SDK 提供一个默认的陈旧度阈值，但用户可以根据自己的场景配置它"——**这个阈值是消费方（FX100）自己配置的 `heartbeatDuration`，不是 Pyth 官方针对某个资产发布的固定规格**。

两次核实均为独立外部数据源核实（Chainlink 官方后端 JSON + Pyth 官方 Hermes API），非重新读本仓库现有文档做二次转抄。

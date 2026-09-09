# 📌 建议结论：USDC 不用 Oracle 校验，改为源头硬编码为 $1

> Notion 页面：[原文](https://app.notion.com/p/3b93d7873f2c818cb676f732e1024e0e)
> 作者：fx100-sync（Gordon 的 fx100-contracts 仓库文档同步机器人，内容出自 Gordon）
> 创建时间：2026-08-12
> 最后编辑：2026-08-12
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 产品 / FX100 / 技术相关 / 合约 / 🏗️ 设计提案
> 类型：设计文档

> 👥 受众：全员　｜　来源：docs/analysis/oracle/summary_usdc_oracle_single_point_of_failure.md

# 建议结论：USDC 不用 Oracle 校验，改为源头硬编码为 $1

**这是什么**：[risk_usdc_single_point_of_failure.md](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/analysis/oracle/risk_usdc_single_point_of_failure.md) 完整分析过程的精炼总结版——去掉逐轮推导，只留最终结论和支撑它的关键理由。要看完整证据链（代码行号、部署脚本核实过程、被推翻的中间方案），看那份文档；本文档只回答"最后怎么定的、为什么"。

**一句话结论**：不修补"2% Chainlink vs Pyth 交叉校验"（这道校验本身也从未在生产环境真正生效过），而是在 `Oracle.sol` 的价格入口把 USDC 硬编码为常量 `$1`，让 USDC 彻底退出 oracle 风险面。这对 FX100 是安全的，因为 FX100 只有 USDC 一种抵押品；GMX v2 不能这么做，因为它的池子混合多种稳定币。

---

## 一、问题的本质：USDC 一旦出问题是"全协议级联"，而真实 depeg 本身无解

FX100 所有市场共享同一个 vault，USDC 既是唯一抵押品又是唯一结算货币（`MarketUtils.getGlobalNetObligationRatio` 注释原话："All markets share the same vault"）。这意味着 USDC 一旦出问题，影响面不是某个市场，是**全协议同时**——所有仓位的保证金估值、全局净敞口比例、清算判定、ADL 触发、LP 提款闸门，全部共用同一个输入，一起被牵动。这跟 BTC 这类单一 index token 出问题（只影响持有 BTC 仓位的人）完全不是一个量级的风险。

但在讨论"怎么应对"之前，必须先讲清楚一件更根本的事：**如果 USDC 真的发生了真实、永久性的 depeg（不是喂价故障，是真的贬值了），这件事本身没有代码层面的解法**。任何 oracle 机制、任何合约设计，都不可能凭空让已经贬值的抵押品变回原来的价值——协议手里的 USDC 真实值多少，就是值多少，这是"选择单一稳定币作抵押品"这个决定自带的、无法通过合约逻辑消除的风险，跟用不用活价格、要不要交叉校验完全无关。

**GMX v2 同样面对这个无解的问题，只是选择了不同的应对姿态。** 它的活价格机制不是在"解决" depeg，而是在"如实反映" depeg：USDC 真的跌了，GM pool 的估值、清算线、ADL 触发条件会跟着同步下调，让损失及时、可控地传导（该清算的仓位被清算、LP 及时看到池子缩水、必要时触发 ADL）。GMX 从来没打算、也不可能凭空恢复 USDC 的偿付能力——那超出了任何 oracle 机制能做到的范围。真正的区别只在于"要不要让合约实时感知并传导这个已经发生、且无法挽回的贬值"，不在于"谁能真正解决它"——没有人能解决它。

**这才是理解下面所有讨论的前提**：既然真实 depeg 本身无解，"用什么机制去感知它"这条路要付出的代价（二节讲的不完备性、需要额外维护的 Pyth/Feed 配置面、阈值调参）就必须跟它能换来的收益（及时止损、避免坏账扩大）放在一起权衡——而不是想象成"只要机制设计得足够好，就能让 USDC 出问题变成不是问题"。这是不可能的，对 GMX 也不可能。FX100 因为只有单一抵押品（见三节），换来的收益比 GMX 更小，所以最终选择不投入这条路。

---

## 二、为什么"用 Oracle 机制保障 USDC 价格"这条路本身就是不完备的

这不是"当前没配置好、补上就行"的问题，是这类方案**天生有一个够不到的角落**：

- 交叉校验的原理是"两个独立源互相印证"——Chainlink 主报价 vs Pyth（或另一条 Chainlink Feed）参考价，分歧超过阈值就拒绝。这能挡住"一个源单独出错"。
- **但两个源出现分歧、且分歧程度无法明确指向某一方时，链上没有第三方真相可以裁决**——这时候到底该信谁，是一个纯粹的认知边界问题，不是能靠"再加一个公式、再调一个阈值"解决的工程问题。
- 更糟的是"两个源同时错"（correlated failure）：如果它们共享上游数据管线，或者遇到的是同一个真实世界事件（比如市场普遍恐慌导致的极端行情），两个源可能一起给出错误但彼此吻合的价格，交叉校验会误判为"两源一致，价格可信"。
- 加第三个、第四个独立源只能**降低**"全部同时出问题"的概率，永远不能**消除**它。这是所有依赖外部价格输入的系统共同的、结构性的天花板，不是 FX100 实现得不够好。

**结论：只要 USDC 的价格还是"从外部输入、需要被验证"的东西，就永远存在一个"验证不出真相、只能靠人工兜底"的角落。** 真正干净的解法不是把这个角落做得更小，而是让 USDC 价格从"输入"变成协议自己定义的"常量"——常量不需要验证。

## 三、为什么 GMX 用活价格，FX100 不需要

GMX v2 的每个 GM pool 可以**混合多种稳定币**（USDC、USDT、DAI 同池）。如果其中一种被硬编码而另一种用活价，depeg 时会出现"用被高估的稳定币套走另一种真实计价的稳定币"的跨资产套利面——这种架构下活价格是必须的护栏，没有商量空间。

**FX100 只有 USDC 一种抵押品，不存在跨稳定币的套利对象。** GMX 需要活价格解决的问题，在 FX100 的架构里根本不存在，照抄这套机制只是徒增复杂度和风险面（多一个可能出错的输入），没有对应的安全收益。

## 四、硬编码为什么不会让 trader / LP 之间的结算变得不公平

FX100 的 PnL 换算公式是 `basePnlUsd / collateralTokenPrice`——`basePnlUsd` 由 BTC 等 index token 的独立 Chainlink 喂价算出，跟 USDC 无关；`collateralTokenPrice` 就是 USDC 的价格。这个除法本质是在拼一个"BTC/USDC"隐含汇率。

**只要 `collateralTokenPrice` 在清算判定、ADL、LP vault 估值、PnL 结算这些地方处处取同一个值**，不管这个值是 1 还是随时波动的活价，trader 和 LP 用的都是完全相同的记账单位，代币总量守恒，内部零和自洽——不存在谁被多算谁被少算。差别只在于"这个隐含汇率是否精确追踪真实市场汇率"，这是产品定位问题（PnL 数字代表的是真实美元购买力，还是纯粹的 USDC 记账单位），不是安全漏洞。

## 五、最终方案

1. **在 `Oracle.sol` 的价格入口（`getPrimaryPrice`/`getSecondaryPrice` 或对应 provider）对 USDC 这一个 token 地址直接短路返回 `Price.Props(1e24, 1e24)`**，跳过 Chainlink Data Stream 的实际取价。所有下游（清算、ADL、LP vault、PnL 结算）统一走这两个入口，源头改一次，处处自动一致。
2. **不要**在各个业务函数里分别加 `if (token == USDC)` 特判——分散实现只要漏改一处，就会出现真正的不一致（这才是能被套利的漏洞）。必须是单一开关、单一生效点。
3. 硬编码之后，Pyth ref feed 配置面、per-token 偏差阈值、稳定币频带熔断、recorded price 过期检查——这些机制对 USDC 全部变得不相关，不需要再投入。它们继续对 BTC/ETH 等 index token 生效（那是另一个独立话题）。
4. **唯一没解决、也不该指望定价方案解决的残余风险**：LP 池子里的是真实 USDC 代币，如果 USDC 现实中永久脱锚，这些代币能换回多少真实美元，跟合约内部怎么记账无关——这正是一节说的"无解"的那部分，硬编码不会让它消失，只是不再靠一个可能本身出错的价格去掩盖它。这部分交给**治理层面的应急开关**（多签暂停协议 / 迁移抵押品），是人工动作，不是定价公式，不会重新引入 oracle 单点风险。
5. 如果未来 FX100 引入多稳定币混合抵押（架构变成类似 GMX 的模式），三节的前提就不再成立，需要回头启用活价格 + 交叉验证方案（完整清单见 [risk_usdc_single_point_of_failure.md](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/analysis/oracle/risk_usdc_single_point_of_failure.md) 七节）。
6. **如果未来是"整个换掉抵押品代币、重新部署一套全新市场"**（不是多币混合，是换成另一种币）：已核实 `MarketFactory.sol:59` 的 `collateralToken` 本来就是从 DataStore 读的配置值（不是硬编码），所以只要新代币**仍是 $1 锚定的稳定币**，基本上确实只需要改配置——但要满足两个实现前提：① 上面第 1 点的硬编码判断要做成 DataStore 配置项（如 `isPeggedStablecoin[token]`），不能写成编译期地址常量比较，否则换币还是要改代码重新编译；② 价格精度常量要按新代币的 decimals 重新算（`1e24` 是绑定 USDC 6 位小数的，不能直接照抄）。**如果换成的不是稳定币（会波动的资产），这个硬编码方案直接不适用**，等于要撤回本文档的结论，回退到七节的活价格方案——边界是"换的还是不是稳定币"，不是"换的是不是 USDC"。详细推导见 [risk_usdc_single_point_of_failure.md](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/analysis/oracle/risk_usdc_single_point_of_failure.md) 6.6 节。

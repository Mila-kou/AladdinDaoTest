# 🔧 参数同步 / Keeper 治理机制盘点与设计（ConfigSyncer + LIMITED_CONFIG_KEEPER）

> Notion 页面：[原文](https://app.notion.com/p/3bb3d7873f2c8131940ae0c055d220b1)
> 作者：fx100-sync（Gordon 的 fx100-contracts 仓库文档同步机器人，内容出自 Gordon）
> 创建时间：2026-08-13
> 最后编辑：2026-08-20
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 产品 / FX100 / 技术相关 / 合约 / 🏗️ 设计提案
> 类型：设计文档

> 👥 受众：合约工程师　｜　来源：docs/analysis/../superpowers/specs/2026-08-13-config-keeper-sync-mechanism-design.md

# 参数同步 / Keeper 治理机制盘点与设计（三层权限架构）

**日期**: 2026-08-13（2026-08-18 更新为三层权限架构）

**状态**: 现状盘点完成 + 三层权限架构设计草案，待用户确认后总结进 TEST_REVIEW_FINDINGS.md，再写实现计划（writing-plans）

**受众**: 合约工程师、运营

**触发背景**: [docs/analysis/TEST_REVIEW_FINDINGS.md 问题 8](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/analysis/TEST_REVIEW_FINDINGS.md)——订单簿深度参数（`ASK_ORDER_BOOK_DEPTH`/`BID_ORDER_BOOK_DEPTH`）需要 keeper 定时刷新，调研过程中发现现有的参数同步机制本身有更根本的问题，值得单独立项梳理；2026-08-18 用户提出具体的三层权限规划，本文档据此重新设计

---

## 一、背景与目标

FX100 需要几类"链下监控/运营判断 → 同步到链上"的参数刷新场景，且不同场景需要的响应速度和信任模型不一样：

1. 订单簿深度（`ASK_ORDER_BOOK_DEPTH`/`BID_ORDER_BOOK_DEPTH`）：链下监控发现真实深度偏离配置值超过阈值（例如 5%）时刷新，需要**最快**的响应速度。
2. 资金费、价差、储备金等运营参数（funding/spread/reserve 相关）：需要根据市场情况**较快**调整，但比深度更需要一点集体决策的审慎性。
3. 协议级别参数（手续费率、PnL 阶梯、feature flag、oracle 安全边界等）和合约升级：变动频率低、影响面大，需要**最高**的决策门槛。

2026-08-18 用户给出了明确的三层权限规划：

- **第一层**：深度参数由**单一 EOA 账户**执行，需要一个独立权限。
- **第二层**：funding/spread/reserve 相关运营参数由**4 人多签**执行，也需要一个独立权限，目标是能快速跟着市场调整。
- **第三层**：协议级别参数和合约升级交给**9 人多签**，未来会升级为 timelock。

本文档目标：①盘点 FX100 现有的参数改动路径全景（不止 depth 一个）；②盘点 fork 来的 `ConfigSyncer` + `LIMITED_CONFIG_KEEPER` 机制现状（GMX 官方怎么用的）；③给出三层权限架构的具体设计——每层对应哪个链上角色、需要哪些合约改动；④把现有全部参数逐一分类进三层。

---

## 二、FX100 现状全景：三条互相独立的参数改动路径

逐条读代码 + 链上验证（Base Sepolia，2026-08-13）确认，FX100 目前存在**三条完全独立、互不相通**的参数写入路径：

### 2.1 路径 A——`Config.sol` 直调，`CONFIG_KEEPER` 全量白名单

`Config.setUint/setInt/setBool/setAddress` 四个函数共用 `onlyKeeper` 修饰符（`src/config/Config.sol:47-53`）：持有 `Role.CONFIG_KEEPER` 的地址可以改 `allowedBaseKeys` 里的任意 key（`_initAllowedBaseKeys()`，`Config.sol:286-482`，约 130 个 key，涵盖 feature flag、gas limit、oracle 参数、四类手续费分成、position/swap impact、funding、borrowing、PnL 阶梯、multichain/relay、fee distributor 等）。`Config` 合约自身继承了 `BasicMulticall`（`Config.sol:22`），**同一笔交易可以打包多次 `setUint` 调用**，天然支持批量多市场/多参数更新。

### 2.2 路径 B——`Config.sol` 直调，`LIMITED_CONFIG_KEEPER` 收紧白名单

同样是 `Config.setUint` 等函数，但调用者只持有 `Role.LIMITED_CONFIG_KEEPER` 时，走的是更小的 `allowedLimitedBaseKeys`（`Config.sol:484-501`，现状 10 个 key：三组 gas fee 估算参数、资金费上下限、`MAX_POOL_AMOUNT`/`MAX_POOL_USD_FOR_DEPOSIT`/`MAX_OPEN_INTEREST`、`PRO_TRADER_TIER`）。`_validateKey`（`Config.sol:505-523`）按 `msg.sender` 持有哪个角色分别查对应的白名单，两个角色互斥判断（先查 `CONFIG_KEEPER`，查不到再查 `LIMITED_CONFIG_KEEPER`）。

**这条路径本身就是"给 keeper 用的收紧版直调接口"**——不需要经过下面的路径 C，`LIMITED_CONFIG_KEEPER` 持有者可以直接调 `Config.setUint`，只要 key 在 `allowedLimitedBaseKeys` 里。**本文档提出的三层权限架构，就是在这个"角色 + 白名单"模式的基础上再扩出一层，不是推翻重来。**

### 2.3 路径 C——`ConfigSyncer.sol` + Chaos Labs 风险预言机，**当前完全是摆设**

`ConfigSyncer.sol`（`sync(marketIndices[], parameters[])`，`onlyLimitedConfigKeeper`）读取一个外部 `IRiskOracle` 合约（`getLatestUpdateByParameterAndMarket`）里的"建议新值"，去重后调用 `config.setUint(...)` 落地。它自己有第三份独立白名单 `ConfigSyncer.allowedBaseKeys`（`ConfigSyncer.sol:123-146`，16 个 key）。

🔴 **链上实测确认（Base Sepolia，2026-08-13）：这条路径目前彻底不可用，且是两个独立原因叠加**：

1. **`riskOracle` 构造参数是零地址**：部署的 `ConfigSyncer`（`0x26A502A979310bC2A4BD3c6b65AfcE7a0a3869Be`）`cast call riskOracle()(address)` 返回 `0x0000...0000`。
2. **`ConfigSyncer` 合约自己在 DataStore 里没有任何角色**：链上 `hasRole(CONFIG_KEEPER, configSyncerAddr)` 和 `hasRole(LIMITED_CONFIG_KEEPER, configSyncerAddr)` **都是 `false`**。
3. `ignition/modules/Fx100Role.ts` 通篇搜索确认：**从未有任何一步把角色授予 `ConfigSyncer` 合约地址**。

即：FX100 现在管 `RESERVE_FACTOR`/资金费/borrowing/impact factor 这些参数，实际走的是**路径 A**（`scripts/configureMarket.ts` 用管理员 EOA 直调 `Config.setUint`），路径 C 从部署那一刻起就没有被启用过。

**本文档的三层权限架构完全不依赖路径 C**——三层都是"人/多签直接调 `Config.setUint`"模式，不经过 `ConfigSyncer`/`IRiskOracle`。是否要修复路径 C（对接 Chaos Labs 或自建风险预言机）留作独立决策，见 §七。

---

## 三、GMX 官方参考（本机 `gmx-synthetics` checkout + Arbitrum 主网链上验证，2026-08-13）

### 3.1 GMX 的 `ConfigSyncer` 白名单（18 个 key）vs FX100（16 个）

| 对比结果 | Key |
|---|---|
| **两边完全一致（14 个）** | `MAX_POOL_AMOUNT`、`MAX_POOL_USD_FOR_DEPOSIT`、`MAX_OPEN_INTEREST`、`POSITION_IMPACT_FACTOR`、`POSITION_IMPACT_EXPONENT_FACTOR`、`SWAP_IMPACT_FACTOR`、`SWAP_IMPACT_EXPONENT_FACTOR`、`MIN_FUNDING_FACTOR_PER_SECOND`、`MAX_FUNDING_FACTOR_PER_SECOND`、`OPTIMAL_USAGE_FACTOR`、`BASE_BORROWING_FACTOR`、`ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR`、`BORROWING_FACTOR`、`BORROWING_EXPONENT_FACTOR`、`RESERVE_FACTOR` |
| **GMX 有，FX100 删掉、无替代** | `OPEN_INTEREST_RESERVE_FACTOR`——FX100 只用单一的 `RESERVE_FACTOR`（架构差异，不是遗漏） |
| **GMX 有，FX100 换成了自己的命名** | `FUNDING_INCREASE_FACTOR_PER_SECOND`/`FUNDING_DECREASE_FACTOR_PER_SECOND` → FX100 是 `FUNDING_FLOOR_FACTOR`/`FUNDING_BASE_FACTOR`，资金费模型本身不同 |

**FX100 现有 depth 相关参数（`CONSTANT_PRICE_SPREAD`/`ASK_ORDER_BOOK_DEPTH`/`BID_ORDER_BOOK_DEPTH`/`PRICE_IMPACT_PARAMETER`）在 GMX 里没有任何对应物**——GMX 的价格冲击模型是纯 skew/imbalance 幂律，压根没有"深度"这个概念。**"深度参数怎么接入 keeper 同步"这件事没有 GMX 先例可抄，需要 FX100 自己设计。**

### 3.2 GMX 在 Arbitrum 主网是真的把这套机制跑起来了

- **`riskOracle` 配的是真实 Chaos Labs 合约**：Arbitrum/Avalanche 主网是 `0x0efb5a96Ed1B33308a73355C56Aa1Bc1aa7E4A8E`。
- **链上实测**：定位到两个真实生效的 `ConfigSyncer` 实例，都持有 `CONTROLLER`+`CONFIG_KEEPER`，且都指向同一个真实 Chaos Labs riskOracle 地址——**证实 GMX 生产环境这条链路是真的在跑，不是摆设**。这与 FX100 当前"零地址+零角色"的状态形成明确对照：不是这套机制本身不可靠，是 FX100 部署时没有走完最后一步。

### 3.3 GMX 的角色粒度：两级，且实测是"两条并行轨道"

`LIMITED_CONFIG_KEEPER` 在 Arbitrum 主网有 **20 个持有者，全部是零字节码的 EOA**——即 GMX 生产环境实际是"EOA keeper bot 直调 `allowedLimitedBaseKeys`"和"`ConfigSyncer` 合约代持 `CONFIG_KEEPER`、被动接受外部风险预言机"两条并行轨道，**没有比这更细的粒度**，不存在"按 key 分别指定谁能改"的机制。

**这正是本文档要解决的：GMX 只有两级，FX100 想要三级（EOA / 4 人多签 / 9 人多签→timelock），现有合约的角色系统需要扩一层才能干净地实现。**

---

## 四、三层权限架构设计

### 4.1 为什么是三层，不是两层

GMX 的两级模型（`CONFIG_KEEPER` 全量 / `LIMITED_CONFIG_KEEPER` 收紧）背后的分类逻辑是"谁被信任改哪些 key"，没有对应"决策速度 vs 决策审慎性"这个维度。FX100 现在明确要三种不同的响应速度：

| 层级 | 决策方 | 响应速度预期 | 覆盖参数类别 |
|---|---|---|---|
| **第一层** | 单一 EOA | 最快（分钟级，链下监控发现偏离即可推新值） | 深度（`ASK_ORDER_BOOK_DEPTH`/`BID_ORDER_BOOK_DEPTH`） |
| **第二层** | 4 人多签 | 较快（小时/天级，运营根据市场情况判断） | funding、spread（深度以外的部分）、reserve/容量相关 |
| **第三层** | 9 人多签（未来 timelock） | 慢（周/月级或计划内变更） | 协议级参数（手续费率、PnL 阶梯、feature flag、oracle 安全边界等）+ 合约升级 |

层级越高，持有者越多、单点被腐蚀的影响越大，需要的信任门槛也越高——这跟第一层"只放最窄、最不敏感的一组参数给单一 EOA"是同一套设计哲学，跟今天讨论订单簿深度时"深度直接参与成交价计算但影响范围有限"的结论一致。

### 4.2 需要的合约改动：Config.sol 从两级扩到三级

现有 `Config.sol` 只有 `CONFIG_KEEPER`/`LIMITED_CONFIG_KEEPER` 两级白名单，**没有一个角色天然对应"第二层"这个定位**——`CONFIG_KEEPER` 目前的语义更接近第三层（全量、高权限），`LIMITED_CONFIG_KEEPER` 目前的清单（gas 费估算+资金费上下限+容量上限+`PRO_TRADER_TIER`）里混杂了本该分属第二层和第三层的参数。要干净地落地三层，需要：

1. **新增一个角色**（本文档暂定名 `MARKET_OPS_KEEPER`，最终命名由合约工程师定）承接第二层，`Config.sol` 新增第三份白名单 `allowedMarketOpsKeys` + 对应的 `_initAllowedMarketOpsKeys()` 初始化函数，`_validateKey` 增加第三个分支（`CONFIG_KEEPER` → `MARKET_OPS_KEEPER` → `LIMITED_CONFIG_KEEPER` 依次查）。
2. **`LIMITED_CONFIG_KEEPER` 的 `allowedLimitedBaseKeys` 重新收窄为第一层专属**——只保留深度相关的 2-3 个 key，现有混在里面的资金费上下限/容量上限/`PRO_TRADER_TIER` 迁移到第二层的新白名单。
3. **`CONFIG_KEEPER` 的 `allowedBaseKeys` 挪走第二层的 key**——`RESERVE_FACTOR`/`FUNDING_FLOOR_FACTOR`/`SKEW_IMPACT_FACTOR` 等原本在这个大清单里的、划入第二层的参数迁移出去，`CONFIG_KEEPER` 之后只保留第三层的参数。
4. **两个孤儿 key 集群需要一并处理**：`ASK_ORDER_BOOK_DEPTH`/`BID_ORDER_BOOK_DEPTH`（第一层）和 `CONSTANT_PRICE_SPREAD`/`MAX_POSITION_SIZE_USD` 等（第二层）目前完全不在 Config 白名单体系里，需要在对应的新/改白名单里加进去，而不是继续用 `CONTROLLER` 直写 `DataStore` 这条路径。
5. **角色授予**：`ignition/modules/Fx100Role.ts` 新增一步把 `MARKET_OPS_KEEPER` 授予 4 人多签地址；`LIMITED_CONFIG_KEEPER` 授予单一 EOA；`CONFIG_KEEPER` 授予 9 人多签地址——且**不能再走现有 `resolveRoleAddress()` 的"未配置就 fallback 到 bootstrapAdmin"逻辑**，三层必须显式配置各自的多签/EOA 地址，不能像现在这样偷懒共用同一个部署者账户。
6. **`CONTROLLER`/合约升级权限同样给第三层的 9 人多签**：`CONTROLLER` 角色和 `TransparentUpgradeableProxy` 的 admin 权限本身不在 `Config.sol` 的 key 白名单系统里，是独立的 access-control 授予——建议把这些也指向同一个 9 人多签地址，让"协议级参数"和"合约升级"这两件事由同一个治理实体管理，未来一起迁移到真正的 `TimelockController` 合约（`TIMELOCK_ADMIN` 角色目前是定义了但没有任何函数使用 `onlyTimelockAdmin` 修饰符的死角色，也没有独立的 `TimelockController` 合约——这次升级到 timelock 时应该把这个角色真正接上，而不是继续放着不用）。

**这是一个真实的合约改造，不是"改改白名单数组内容"这么小的量级**——涉及 `Role.sol` 新增角色常量、`Config.sol` 新增第三份白名单+校验分支、部署脚本调整角色授予逻辑。

### 4.3 `ConfigSyncer`/`IRiskOracle`（路径 C）在三层架构里的定位

三层架构完全不依赖这条路径，`ConfigSyncer` 保持现状（摆设）不影响三层架构落地。如果未来想额外引入外部风险预言机（Chaos Labs 式），可以作为第二层的补充数据源（多签根据风险预言机建议值做判断后再提交，而不是像 GMX 那样让 `ConfigSyncer` 合约自己代持角色被动执行）——但这是独立于本次三层权限设计的后续决策，见 §七。

---

## 五、第一层（深度，单一 EOA）具体接入方案

### 5.1 范围

- **确定纳入**：`ASK_ORDER_BOOK_DEPTH`、`BID_ORDER_BOOK_DEPTH`。
- **待确认**：`PRICE_IMPACT_PARAMETER`——这个 key 跟深度同属一套价格冲击公式的输入（`priceImpactSpread` 计算里深度和这个参数一起用），本文档倾向也放进第一层，但用户在提出三层规划时把"spread"单独归给了第二层，`PRICE_IMPACT_PARAMETER` 算"深度"还是"spread"存在一点模糊地带，**这一条请用户在审阅时明确**，本文档先按"跟深度同一个公式、放第一层"处理，如有不同意见容易调整（只是白名单里挪一个 key）。

### 5.2 具体改动清单

- `src/constants/Role.sol`：如果决定复用现有 `LIMITED_CONFIG_KEEPER` 承接第一层（本文档的默认建议，理由见 §5.3），则不需要新增角色常量。
- `src/config/Config.sol`：`_initAllowedLimitedBaseKeys()` 重新定义为只含第一层的 key（`ASK_ORDER_BOOK_DEPTH`/`BID_ORDER_BOOK_DEPTH`，视 §5.1 讨论结果决定是否含 `PRICE_IMPACT_PARAMETER`），原来混在这个清单里的资金费上下限/容量上限/`PRO_TRADER_TIER` 迁移到第二层的新白名单（见 §六）。
- 部署/角色脚本：`limitedConfigKeeper` 参数必须显式配置成这个专职的单一 EOA 地址，不能 fallback 到 `bootstrapAdmin`。
- 链下监控脚本：检测到深度偏离阈值（如 5%）后，用这个 EOA 调 `Config.setUint(bidOrderBookDepthKey(marketIndex), data, newValue)`/`askOrderBookDepthKey` 对应版本，`Config` 自带 `BasicMulticall`，多个市场可以一笔交易打包。

### 5.3 为什么建议复用 `LIMITED_CONFIG_KEEPER` 承接第一层，而不是新开一个角色

`LIMITED_CONFIG_KEEPER` 这个名字本身（"受限的"）语义上正好对应"权限最窄、风险最低"的第一层，比给第一层另起一个新角色更省一次 `Role.sol`/部署脚本的改动。真正需要新增的是第二层的角色（现有两个角色都不适合承接它，见 §4.2）。

### 5.4 测试要点（对齐 [TEST_REVIEW_FINDINGS.md 问题 8](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/analysis/TEST_REVIEW_FINDINGS.md) 里已确认的缺口）

- 深度 key 收窄进 `allowedLimitedBaseKeys` 后，验证持有第一层角色的 EOA 可以成功调用、其它角色（含 `CONFIG_KEEPER`/第二层新角色）调用是否符合预期（角色互斥还是允许叠加，需要在改造 `_validateKey` 时明确设计）。
- "运行中途刷新深度"集成测试：先按旧深度值执行一笔订单，中途刷新深度，再执行下一笔订单，验证前后两笔订单的价格冲击计算分别正确反映各自时刻的深度值。
- 批量多市场更新：一笔 multicall 交易里同时改多个市场的深度，验证全部生效。
- 回归测试：确认现有依赖深度值在 `setUp` 阶段写死的测试（`PriceImpact.t.sol` 等）不受影响。

---

## 六、全量参数分类：三层权限归属

**判断标准**：不再是"这个参数适不适合交给自动化 keeper"（旧版本的框架），而是**"这个参数变动需要多快的响应速度、需要多少人共同决策"**——第一层最快最窄（单一 EOA，只放深度）、第二层较快（4 人多签，市场运营参数）、第三层最慢最广（9 人多签→未来 timelock，协议级参数+合约升级）。

### 6.1 第一层——单一 EOA（深度）

| 参数 | 现状 |
|---|---|
| `ASK_ORDER_BOOK_DEPTH` | 孤儿 key（不在任何白名单），需迁入 |
| `BID_ORDER_BOOK_DEPTH` | 孤儿 key，需迁入 |
| `PRICE_IMPACT_PARAMETER`（待确认） | 孤儿 key，是否归第一层见 §5.1 |

### 6.2 第二层——4 人多签（funding / spread / reserve）

| 分类 | 参数 | 现状 |
|---|---|---|
| **Spread（深度以外）** | `CONSTANT_PRICE_SPREAD` | 孤儿 key，需迁入新白名单 |
|  | `SKEW_IMPACT_FACTOR`/`MIN_SKEW_IMPACT`/`MAX_SKEW_IMPACT` | 目前在 `CONFIG_KEEPER` 全量白名单，需迁出 |
|  | `MIN_DYNAMIC_SPREAD`/`MAX_DYNAMIC_SPREAD` | 目前在 `CONFIG_KEEPER` 全量白名单，需迁出（v0.3.2 新增键） |
| **Funding** | `FUNDING_FLOOR_FACTOR`/`FUNDING_BASE_FACTOR` | 目前在 `CONFIG_KEEPER` 全量白名单，需迁出 |
|  | `MIN_FUNDING_FACTOR_PER_SECOND`/`MAX_FUNDING_FACTOR_PER_SECOND` | 目前在 `LIMITED_CONFIG_KEEPER`，需从"第一层"改挂到"第二层"新白名单 |
| **Reserve/容量** | `RESERVE_FACTOR` | 目前在 `CONFIG_KEEPER` 全量白名单，需迁出 |
|  | `MAX_POSITION_SIZE_USD` | 孤儿 key，需迁入（建议 keeper 脚本层面跟 `RESERVE_FACTOR` 同批次更新，理由见下） |
|  | `MAX_COLLATERAL_SUM` | 目前在 `CONFIG_KEEPER` 全量白名单，需迁出 |
|  | `MAX_POOL_AMOUNT`/`MAX_POOL_USD_FOR_DEPOSIT`/`MAX_OPEN_INTEREST` | 目前在 `LIMITED_CONFIG_KEEPER`，需从"第一层"改挂到"第二层"新白名单 |
| **Gas 费估算（待确认，建议一并归入）** | `ESTIMATED_GAS_FEE_*`（三个）、`EXECUTION_GAS_FEE_*`（三个） | 目前在 `LIMITED_CONFIG_KEEPER`——这组是随 L2 gas 价格波动需要跟着调的参数，性质上更接近"运营根据网络情况判断"（第二层），不是"链下监控直接推数值"（第一层），建议一并挪到第二层，但用户规划里没有明确点名这组，请审阅时确认 |
| **账户标签（待确认，优先级低）** | `PRO_TRADER_TIER` | 目前在 `LIMITED_CONFIG_KEEPER`——风险很低，放第二层或第三层都说得通，本文档倾向第二层（延续现状），非必须现在决定 |

⚠️ **`MIN_COLLATERAL_FACTOR`/`MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER`/`MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION`（清算线/杠杆线）不建议放进第二层**：这几个 key 直接决定现有未平仓仓位会不会被清算，属于"改错了直接影响用户资金安全"的类别，建议归入第三层（9 人多签），需要更审慎的决策流程，而不是 4 人多签的"快速响应"定位——这跟旧版本"有条件加入 LIMITED"的结论不同，是因为三层架构下第三层本来就承接这类高风险参数，不再需要额外设计"只能收紧不能放松"的软约束打补丁，直接用更高的决策门槛覆盖会更干净。

### 6.3 第三层——9 人多签（未来 timelock）：协议级参数 + 合约升级

以下全部归入第三层，理由跟旧版本"暂缓/不建议交给自动化"的结论一致，只是现在有了一个明确的高门槛归宿而不是笼统地"留给 CONFIG_KEEPER"：

| 类别 | 参数 |
|---|---|
| **手续费率与分账** | `POSITION_FEE_FACTOR`/`LIQUIDATION_FEE_FACTOR`/`SWAP_FEE_FACTOR`/`DEPOSIT_FEE_FACTOR`/`WITHDRAWAL_FEE_FACTOR`/`ATOMIC_SWAP_FEE_FACTOR`/`ATOMIC_WITHDRAWAL_FEE_FACTOR`、`POSITION_FEE_RECEIVER_FACTOR`/`LIQUIDATION_FEE_RECEIVER_FACTOR`/`SWAP_FEE_RECEIVER_FACTOR`/`BORROWING_FEE_RECEIVER_FACTOR`（含即将改为 1、全部先进 RevenuePool 的 `POSITION_FEE_RECEIVER_FACTOR`，见 [TEST_REVIEW_FINDINGS.md 问题 5](https://github.com/AladdinDAO/fx100-contracts/blob/docs/testing-standards/docs/analysis/TEST_REVIEW_FINDINGS.md) 最新结论） |
| **PnL 阶梯 / ADL** | `MAX_PNL_FACTOR`（traders）/`MAX_PNL_FACTOR_FOR_ADL`/`MIN_PNL_FACTOR_AFTER_ADL`/`MAX_PNL_FACTOR_FOR_WITHDRAWALS`——四者间有严格顺序不变式，链上无校验，必须走最高决策门槛 |
| **清算/杠杆线** | `MIN_COLLATERAL_FACTOR`/`MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER`/`MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION`/`MIN_COLLATERAL_USD`/`LIQUIDATION_GRACE_PERIOD_BASE` |
| **Oracle 安全边界** | `MIN_ORACLE_BLOCK_CONFIRMATIONS`/`MAX_ORACLE_PRICE_AGE`/`MAX_RECORDED_PRICE_AGE`/`MAX_ORACLE_TIMESTAMP_RANGE`/`ORACLE_TIMESTAMP_ADJUSTMENT`/`ORACLE_PROVIDER_MIN_CHANGE_DELAY`/`SEQUENCER_GRACE_DURATION`/`MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR` |
| **执行费/订单基础设施** | `EXECUTION_FEE_SUBSIDIZE`/`EXECUTION_FEE_SUBSIDIZE_SIZE`（已知"漏写就静默全免"的坑）、`REQUEST_EXPIRATION_TIME` |
| **开关类（二元熔断）** | `IS_MARKET_DISABLED`、全部 `*_FEATURE_DISABLED` |
| **营销/返佣策略** | `PRO_DISCOUNT_FACTOR`/`MIN_AFFILIATE_REWARD_FACTOR` |
| **借贷费类（当前死代码，归属默认第三层）** | `OPTIMAL_USAGE_FACTOR`/`BASE_BORROWING_FACTOR`/`ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR`/`BORROWING_FACTOR`/`BORROWING_EXPONENT_FACTOR` |
| **GMX 原生冲击模型（当前死代码，归属默认第三层）** | `POSITION_IMPACT_FACTOR`/`POSITION_IMPACT_EXPONENT_FACTOR`/`MAX_POSITION_IMPACT_FACTOR`/`SWAP_IMPACT_FACTOR`/`SWAP_IMPACT_EXPONENT_FACTOR` |
| **用途待确认** | `MAX_LENDABLE_IMPACT_FACTOR`/`MAX_LENDABLE_IMPACT_FACTOR_FOR_WITHDRAWALS`/`MAX_LENDABLE_IMPACT_USD`、`MAX_POSITION_IMPACT_FACTOR_FOR_LIQUIDATIONS`（已确认死代码） |
| **其它基础设施/多签迁移类** | gas limit 类（`CREATE_DEPOSIT_GAS_LIMIT` 等）、multichain/relay/fee-distributor 相关 key |
| **合约升级** | `CONTROLLER` 角色本身、`TransparentUpgradeableProxy` 的 proxy admin——不在 Config 白名单系统里，是独立的 access-control 授予，建议指向同一个 9 人多签，未来一起迁移到 `TimelockController` |

### 6.4 汇总：需要迁移的 key 一览

```plain text
【迁入第一层 LIMITED_CONFIG_KEEPER（收窄后）】
ASK_ORDER_BOOK_DEPTH
BID_ORDER_BOOK_DEPTH
PRICE_IMPACT_PARAMETER            ← 待确认，见 §5.1

【迁入第二层 新角色（本文档暂定 MARKET_OPS_KEEPER）】
CONSTANT_PRICE_SPREAD              孤儿 key
SKEW_IMPACT_FACTOR                 原 CONFIG_KEEPER
MIN_SKEW_IMPACT                    原 CONFIG_KEEPER
MAX_SKEW_IMPACT                    原 CONFIG_KEEPER
MIN_DYNAMIC_SPREAD                 原 CONFIG_KEEPER
MAX_DYNAMIC_SPREAD                 原 CONFIG_KEEPER
FUNDING_FLOOR_FACTOR                原 CONFIG_KEEPER
FUNDING_BASE_FACTOR                 原 CONFIG_KEEPER
MIN_FUNDING_FACTOR_PER_SECOND       原 LIMITED_CONFIG_KEEPER（层级不变，改挂新角色）
MAX_FUNDING_FACTOR_PER_SECOND       原 LIMITED_CONFIG_KEEPER（层级不变，改挂新角色）
RESERVE_FACTOR                      原 CONFIG_KEEPER
MAX_POSITION_SIZE_USD               孤儿 key
MAX_COLLATERAL_SUM                  原 CONFIG_KEEPER
MAX_POOL_AMOUNT                     原 LIMITED_CONFIG_KEEPER（层级不变，改挂新角色）
MAX_POOL_USD_FOR_DEPOSIT            原 LIMITED_CONFIG_KEEPER（层级不变，改挂新角色）
MAX_OPEN_INTEREST                   原 LIMITED_CONFIG_KEEPER（层级不变，改挂新角色）
ESTIMATED_GAS_FEE_*（三个）          原 LIMITED_CONFIG_KEEPER（层级不变，改挂新角色）← 待确认
EXECUTION_GAS_FEE_*（三个）          原 LIMITED_CONFIG_KEEPER（层级不变，改挂新角色）← 待确认
PRO_TRADER_TIER                      原 LIMITED_CONFIG_KEEPER（层级不变，改挂新角色）← 待确认

【留在/迁入第三层 CONFIG_KEEPER（收窄后仍是全量兜底）】
其余现有 CONFIG_KEEPER 全部 key（手续费率/分账、PnL 阶梯、清算线、oracle 安全边界、开关类、gas limit、multichain/relay/fee-distributor 等）
+ CONTROLLER 角色、proxy admin（合约升级）
```

`MAX_OPEN_INTEREST_FACTOR`（孤儿 key，刻意设为全场惰性值 1.0）**不建议放进任何一层的日常调整范围**——这是一次深思熟虑的架构取舍（撤除单侧闸门），不是市场风险驱动的日常参数，如果要重新引入应该走第三层的正式决策流程。

---

## 七、非目标 / 留待后续决定的问题

- **是否要真正启用路径 C（修复 `ConfigSyncer`/`riskOracle`）**：本文档只记录"当前是摆设"这一事实，不建议是否要接入 Chaos Labs 或自建风险预言机——这是运营/合约工程师需要单独评估成本收益的决策，见 §4.3。
- **`PRICE_IMPACT_PARAMETER`/gas 费估算三组/`PRO_TRADER_TIER` 具体归第一层还是第二层**：本文档给出了默认建议，但明确标注"待确认"，需要用户审阅后拍板。
- **`MARKET_OPS_KEEPER`（第二层）的最终命名**：本文档用的是暂定名，合约工程师可以按仓库既有命名习惯调整。
- **9 人多签→timelock 的具体升级时间表和 timelock 参数（延迟时长等）**：本文档只记录"未来会升级"这个方向，不涉及具体的 timelock 实现细节和迁移计划，需要单独的实现计划（`writing-plans`）覆盖。
- **`FUNDING_FLOOR_FACTOR`/`FUNDING_BASE_FACTOR` 与 GMX `FUNDING_INCREASE/DECREASE_FACTOR_PER_SECOND` 的公式等价性**：本文档只确认命名不同、无法直接对应，未逐行核对资金费公式是否等价，如需要严谨结论应单独立项核对。

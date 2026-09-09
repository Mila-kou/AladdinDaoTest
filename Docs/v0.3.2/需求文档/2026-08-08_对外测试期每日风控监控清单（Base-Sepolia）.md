# 对外测试期每日风控监控清单（Base Sepolia）

> Notion 页面：[原文](https://app.notion.com/p/3b63d7873f2c81de84e0d8593ea2e742)
> 作者：fx100-sync（Gordon 的 fx100-contracts 仓库文档同步机器人，内容出自 Gordon）
> 创建时间：2026-08-08
> 最后编辑：2026-08-09
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 产品 / FX100 / PRD（产品需求文档） / 实时监控系统
> 类型：设计文档

# 对外测试期每日风控监控清单（Base Sepolia）
**创建**: 2026-08-07 ｜ **用途**: 与现有监控 `AladdinDAO/fx100-monitor`（独立仓库，见文末盘点）对账，缺的补上
**参数依据**: LIVE_MARKETS.md，尤其 §三（全场口径）、§六（容量）、§十（风控阶梯）
**为什么现在需要**: 2026-08-06/07 连续改了 6 组参数，其中两项**放宽**了风险边界（执行费全免、撤除单侧闸门），一项作为配套**收紧**了全局兜底。放宽的部分需要用监控盯住，而不是靠参数拦住。
优先级：🔴 = 缺了就可能出事故 ｜ 🟡 = 需要但可以晚一步 ｜ ⚪ = 有更好
---
## 一、🔴 全局净义务比 pnlRatio —— 唯一最重要的指标
这是 FX100 风控的总闸，四条线全部拿它比较。
**读法**：`Fx100Reader.getAdlState(DataStore, Oracle)` → `(latestAdlTime, shouldEnableAdl, globalNetObligationRatio, threshold)`。⚠️ 前端配置里 Reader 的 key 叫 **`Fx100Reader`**，不是 `Reader`。精度 1e30。
**口径**：`Σ_i [max(0, longPnl_i) + max(0, shortPnl_i)] / poolUsd` —— 全场所有市场**盈利侧**的义务之和，**跨侧不互抵**，分母是共享 LPVault。

| 水位 | 含义 | 建议告警 |
|---|---|---|
| > 40% | 接近提款封锁 | 🟡 提醒 |
| > **45%** | 已进入 ADL 回拉目标区（ADL 一旦跑完停在这） | 🟡 |
| > **50%** | **LP 提款已封锁**（claim 会 revert） | 🔴 |
| > **55%** | **ADL 应触发** | 🔴 |

**另外两个必须监控的派生信号：**
- 🔴 **`shouldEnableAdl = true`**** 但 keeper 迟迟没调 ****`updateAdlState`** → ADL keeper 掉线。这是最危险的组合：阈值到了但没人执行。建议超过 5 分钟未收敛就告警。
- 🔴 **`latestAdlTime`**** 停止更新**。合约注释指出 ADL keeper 可以靠不断刷新该时间阻止 ADL 单执行，所以这个时间戳既要"在更新"，也要在 ADL 期间"确实有减仓发生"。
## 二、🔴 单边集中度（2026-08-06 新引入的风险，原本没有）
8/06 把 `MAX_OPEN_INTEREST_FACTOR` 改成 1.0，**撤除了单侧闸门** —— 一个方向现在可以独占整个市场的 RF 额度（此前上限是一半）。最坏情况全场单向名义敞口从 ~1.48× 池子升到 ~2.95× 池子。**参数层面已经没有东西拦它了，只能靠监控看见。**
每市场每侧需要：
- 该侧名义 OI ÷ (`RESERVE_FACTOR` × poolUsd) —— 接近 100% 说明这一侧吃满了整个市场额度，另一侧将完全无法开仓
- 全场 `Σ 单向名义 OI ÷ poolUsd` —— 逼近 2.95 就是最坏情况正在发生
- 🟡 多空失衡度（skew）排行，用于预判资金费和点差
## 三、🔴 参数漂移日检
7 月有过一次真实事故：BTC/ETH 手续费改在旧 DataStore 上，7-29 换新部署后**静默丢失**。今天改的 6 组参数都有同样的暴露面。
建议每天把 24 个市场的关键键读出来和期望值比对，不一致就告警。`verifyTop20Markets.ts` 已覆盖一部分，需要补齐今天新增的：

| 键 | 期望值 | 陷阱 |
|---|---|---|
| `EXECUTION_FEE_SUBSIDIZE` / `_SIZE` | 两键均 0 | **裸 keccak 异类键**；未设置读回 0 与"故意设 0"无法区分 |
| `MAX_OPEN_INTEREST` | $100M/侧 | 写 0 是"全禁开仓"不是"无限" |
| `MAX_OPEN_INTEREST_FACTOR` | 1.0/侧 | — |
| `RESERVE_FACTOR` | 分层，Σ = 2.95 | 超预算即风控失效 |
| `MAX_PNL_FACTOR_FOR_TRADERS` | 60%，per-market × 多空 | 写裸键无效 |
| `MAX_PNL_FACTOR_FOR_ADL` / `MIN_PNL_FACTOR_AFTER_ADL` / `MAX_PNL_FACTOR_FOR_WITHDRAWALS` | 55% / 45% / 50% | **全局裸键**；per-market 同名键是死写，读它会得到假象 |
| `POSITION_FEE_FACTOR` | BTC/ETH 0.05%，其余 0.075% | 两个槽位（是否改善平衡）都要读 |
| `LIQUIDATION_GRACE_PERIOD_BASE` | 900s | **裸 keccak 异类键** |
| `MIN_DYNAMIC_SPREAD` / `MAX_DYNAMIC_SPREAD` | v0.3.1 下无用 | 🔴 **升级 v0.3.2 前必须先配 ****`MAX_DYNAMIC_SPREAD`**，否则全场点差归零 |

⚠️ 不变式也要日检：`ADL后目标 < 提款封锁 < ADL触发 ≤ TRADERS`。
## 四、🔴 keeper 活性
单点故障会直接冻结风控能力：
- **recorded-price keeper** —— 它停了会冻结全部市场的 LP 提款与 ADL（两者都需要 secondary price）
- **清算 keeper** —— 结合"清算保护期 900s"看：保护期已过、抵押率已破线但仍未被清算的仓位数
- **订单执行 keeper** —— 市价单有效期只有 120 秒，超时即永久不可成交
- **ADL keeper** —— 见 §一
## 五、🟡 LP 侧健康度
- `LPVault.totalAssets()` 逐日变化、`nav()` 变化
- **epoch 状态（7 天一期）+ 待 claim 的提款请求量**。⚠️ FX100 的 NAV **不含 pending PnL**，所以 gate 一开就是抢跑窗口：如果积压了大量待 claim 请求而 pnlRatio 正在 50% 附近震荡，开闸瞬间会有挤兑。这个组合值得单独告警。
- 提款被拒次数（`WithdrawGlobalNetObligationRatioExceeded`）—— LP 排队 7 天后被拒是很差的体验，需要能提前预警
## 六、🟡 清算与小仓位健康度
- 抵押率分布：接近清算线（0.5% / 1%，逐市场不同）的仓位数量与规模
- 处于 900s 清算保护期内的仓位数（这段时间内不可清算，是已知的敞口窗口）
- ⚪ **尘埃仓位堆积**：$10 名义仓位的清算费只有 $0.03，给 keeper $0.015，低于 gas → 实际没人愿意清算。执行费现已全免，开小仓零 gas 成本，这类仓位会变多。需要一个计数看趋势。
## 七、🟡 刷量与异常行为
执行费全场豁免后，开仓的边际成本只剩手续费：
- 单账户开平频率、极小仓位占比
- ⚪ 与「最小持仓时间」机制的可行性分析联动（见 `docs/analysis/pricing/feasibility_min_close_duration_lock.md`）
## 八、⚪ 定价异常
- 资金费触顶次数（FX100 上限 96.52%/年，是 GMX 的约 5.8 倍，容易被用户质疑）
- 点差为 0 的成交（动态价差零配置陷阱）
- 执行价与 oracle 价偏离超预期的成交
---
## 与现有监控的对账（2026-08-07 初步盘点）
监控代码在**独立仓库** `AladdinDAO/fx100-monitor`（本地 `~/Documents/GitHub/fx100-monitor`，2026-08-07 用 `gh repo clone` 重新拉取，HEAD `08ecc6e2`），不在 fx100-apps 里。结构：

| 位置 | 作用 |
|---|---|
| `server/config/fx100.ts` (211 行) | 地址 / DataStore 键定义 / 环境 profile |
| `server/data/snapshot.ts` (2439 行) | 链上快照读取，主体逻辑 |
| `server/data/controlSurface.ts` | 参数面（运维可见的键集合） |
| `server/data/history.ts`、`api/monitoring/{snapshot,history,update}.ts` | 历史与 API |
| `client/src/lib/riskCalculator.ts` (251 行) | 前端风险计算 |
| `client/src/pages/` | `Monitoring(Enhanced)` / `Parameters(Enhanced)` / `Alerts(Enhanced)` / `ProtocolOps` / `DistributionOps` |

**已覆盖**（在 `snapshot.ts` + `controlSurface.ts` 中出现）：`RESERVE_FACTOR`、`MAX_OPEN_INTEREST_FACTOR`、`LIQUIDATION_GRACE_PERIOD_BASE`、`CONSTANT_PRICE_SPREAD`、订单簿深度、各类 feature-disabled 开关、gas limit、FeeDistributor 一族。
**🔴 实测缺口（grep 全仓零命中）**：

| 缺失项 | 影响 |
|---|---|
| `MAX_PNL_FACTOR_FOR_ADL` | ADL 触发线未被监控 |
| `MIN_PNL_FACTOR_AFTER_ADL` | ADL 退出水位未被监控 |
| `MAX_PNL_FACTOR_FOR_WITHDRAWALS` | LP 提款封锁线未被监控 |
| `MAX_PNL_FACTOR_FOR_TRADERS` | 盈利结算硬顶未被监控 |
| `getAdlState` | **全局 pnlRatio 与 ADL 状态完全没读** |
| `EXECUTION_FEE_SUBSIDIZE` / `_SIZE` | 执行费豁免配置未被监控 |

也就是说：**§一（唯一最重要的指标）和 §二（8/06 新引入的单边集中度风险）目前是零覆盖**，而这两项恰好是本轮参数改动后风险的主要落点。§三 的参数漂移日检有一半基础（`controlSurface.ts` 已有键集合概念），补齐键即可。
**建议下一步**：按 §一 → §二 → §三 的顺序补，先让 `snapshot.ts` 读 `Fx100Reader.getAdlState` 与四个阶梯键，再在 `riskCalculator.ts` 里加水位判定和告警带。⚠️ 注意 ADL 三个键是**全局裸键**（`keccak256(abi.encode("NAME"))`，不带 marketIndex），`TRADERS` 是 per-(market, isLong)，写/读混用会得到 0 的假象。
## 深度核查补充（2026-08-07 同日，启动前核实）
在给出启动方式前，实测了 `fx100-monitor` 当前到底连的是哪条链，发现比"缺指标"更基础的问题：**它现在根本没有指向真实 Base Sepolia 公测链**。
### 🔴 环境完全错配
- 本地 `pnpm dev` 默认 profile、以及线上 Vercel demo（`https://fx100-monitor.vercel.app/`），实测都指向 **Tenderly Virtual TestNet 的 fork**（环境名 `fx100Base7`/`fx100Base8`），不是真链。
- 实测 Vercel demo 的 `/api/monitoring/snapshot`：`"network": "Tenderly Virtual TestNet (Base fork)"`、`"readStatus": "fallback"`、`"mode": "demo-backed-api"` —— 这个公开地址目前给出的是**占位假数据**，不是任何真实链上状态。
- 根因在 `server/config/fx100.ts`：profile 解析路径硬编码指向兄弟仓库 **`../fx100-contracts_fork`**（本地最后一次改动是 5-29，早于 v0.3.0/v0.3.1 的任何一次真链部署），并读取该仓库下的 `docs/test-website/.env.local` 或 `scripts/deploy/base-fork/envs/fx100Base8.env`。这些 profile 里的地址（如 `DATA_STORE` 默认兜底 `0xE825D76E...`）是旧 fork 部署的地址，跟本仓库 `deployment/base_sepolia_v0.3.1_260729/deployed_addresses.json` 里的真链地址（`DataStore = 0x606D72Ab0C0fDcce607d04B1645CE2D528B88014`）完全不是一套。
- 本仓库根目录 `.env` 里其实已经有正确的真链 RPC（`BASE_SEPOLIA_RPC_URL`，走 Tenderly Gateway 代理到真实 84532 链，跟"virtual/fork" RPC 是两个不同东西），但 monitor 完全不读这个仓库、也不读这个变量。
### 🟡 好消息：market 发现机制不是死写 2 个
`server/config/fx100.ts` 里静态 `markets: []` 数组目前只填了 ETH / BTC 两条，但 `snapshot.ts:1084-1087` 实际会先读链上 `DataStore.MARKET_LIST`（`getUintCount` + `getUintValuesAt`）动态发现全部市场索引，再与静态数组取**并集**逐个市场读参数；不在静态数组里的市场会用 `symbolFromMarket(indexToken, marketIndex)` 兜底推断符号。也就是说：**只要 profile 指向正确的 RPC + DataStore，理论上能自动读到真链上全部 24 个市场**，不需要先手写扩到 24 条——但静态模板里的展示字段（tier、分类、单仓上限等展示用值）目前只有 ETH/BTC 有，其余 22 个会用通用推断，可能不准，需要后补。
### ⚠️ 需要用户确认的一处对不上
`§三` 提到 `verifyTop20Markets.ts` "已覆盖一部分"，但本仓库全文 grep 找不到这个文件名，只有 `scripts/verifyTenderly.ts`（用途是把已部署合约源码提交给 Tenderly dashboard 做校验，跟市场参数核对无关）。这条"已部分覆盖"的判断可能来自旧路径/别名脚本的记忆，需要用户确认这个脚本实际在哪，否则先当作**未覆盖**处理更稳妥。
### 📄 Notion PRD 比这份 checklist 更详细，需要单独通读
`实时监控系统` 页面（`https://app.notion.com/p/3583d7873f2c8002a146ec3e4c92ee79`）下最新版本 **Monitor_V1.5**（历史版本 V1.0 / V1.4 留存）是一份完整产品 PRD，篇幅远超本清单，抽样读到的内容包括：
- OI 口径明确拆成三种（结构 OI / 静态 OI / 成本 OI），并规定"容量/风控约束类指标必须逐项按合约真实校验口径定义，不允许所有 OI 指标默认套同一口径"
- Margin Ratio 有"对齐合约的完整公式"与"实际采用的近似公式"两版，且分级规则是独立表格
- PnL-to-Pool Factor、全协议健康总览（P0，判断"当前最高风险等级/是否扩大/最危险的资产/异常主要来自哪类风险/监控自身数据链路是否正常"）等
- 刷新频率分层（Tier-B 5s / Tier-C 30s 等），Recovery/Exit 第一阶段只做可视化不做自动执行
这份 PRD 只抽样读了前 ~100 个 block（还有更多未读），信息量足以独立成一轮核对工作——**建议单独作为下一步，把 PRD 逐条需求与 ****`snapshot.ts`**** 实际实现、以及本清单 §一~§八 做三方对表**，而不是现在就动手改代码。
### 现在启动会看到什么（当前默认配置，未做任何改动）
```bash
cd ~/Documents/GitHub/fx100-monitor
pnpm dev
# 打开 http://localhost:5173
```
这会走 `fx100-contracts_fork` 里的旧 fork profile（如果那个 Tenderly virtual testnet 还活着，可能是真的链上读取，但读的是**旧 fork 环境**，不是当前对外公测的真链部署）。**这不是真实公测数据**，只适合用来看 UI 结构/现有指标长什么样，不能用来判断当前真链风险。
要看真链 24 个市场的真实数据，需要一份新的 profile（真链 RPC + `deployed_addresses.json` 里的地址），这属于"需要修改"的部分，尚未创建，等待确认后再做。
**2026-08-07 补充**：用户用 `gh repo clone` 重新拉取了 `fx100-monitor`（旧本地 checkout 落后 origin 3 个 commit）。核实这 3 个新 commit 都是无关的 dev 工具修复（vite proxy、补 ethers 依赖、gitignore），**没有触碰 ****`server/config/fx100.ts`**** / ****`server/data/snapshot.ts`**，上面关于环境错配、地址对不上、market 发现机制的结论在新 checkout 里依然成立。唯一实质变化：`pnpm dev` 现在是 `pnpm build:server && concurrently "vite --host" "NODE_ENV=development node dist/index.js"`——一条命令会自动编译并同时起前端(5173)+后端，不用再手动分别起两个进程。
## 2026-08-07 重大更正：以上全部针对的是废弃的 `main` 分支
用户随后指出本地 `main` checkout 是错的，用户用 `gh repo clone` 又拉取了一份。核实后发现关键事实：**`fx100-monitor`**** 的 ****`main`**** 分支已经废弃，真正在开发的是 ****`dev`**** 分支**——架构完全不同、也更成熟：
- `main`：单体 Express + 一个 2439 行 `snapshot.ts`，上面 §一~§三 的核查都是针对它。
- `dev`：正规 monorepo（`apps/worker` 常驻进程读链算指标写 Redis + `apps/web` Next.js 只读 Redis 渲染），`packages/{types,config,onchain,metrics,storage,observability}` 分层，有 Docker Compose（Redis）、CI、按 PRD 章节编号实现（commit log 里能看到 "P0-D ADL 24h Count"、"wire volatility into protocol-wide alert aggregation (PRD 4.1)"、"Oracle Update Age thresholds (PRD 4.6.3.5)" 等）。已内建 `local-testnet`/`test-sepolia` → Base Sepolia (chainId 84532) 的环境档，不用像 main 那样自己发明 profile 机制。
远程还有一个 `feat/chain-config` 分支：核实是**过期分支**（落后 `dev`，不是领先），把地址回退到了更早的 2026-05-19 部署，**不要用它**，已忽略。
### 已在新分支 `feat/base-sepolia-v031-monitoring-config`（基于最新 `dev`）完成的配置同步
两个 commit，均已跑 `pnpm run typecheck`（14 个包全过）验证：
1. `c922c378` — `packages/config/src/addresses.ts` 的 `baseSepolia` 地址块、`packages/config/src/markets.ts` 的市场参考表，从 v0.3.0（07-19）更新到 v0.3.1 真链（07-29，`deployed_addresses.json`），24 个市场全部补全（原来只有 ETH/BTC 两条）。**已交叉核对 ****`fx100-apps/apps/fx-base-app/src/config/addresses.ts`**** 的 ****`baseSepolia`**** 块，六个地址字节级一致**——这是实盘交易前端在用的地址，一致性是最强的正确性证据。已读 `deployment/base_sepolia_v0.3.1_260729/V0.3.1_VS_V0.3.0.md` 确认这次是纯换地址，没有 DataStore key 形状或 Reader ABI 变化（跟 07-19 那次不同，那次真的需要改 `reader.ts`/`keys.ts`）。
2. `a8bf8bcc` — Goldsky 索引子图标签从 `v0.3.2` 升到 `v0.3.3`（4 处引用：`chains.ts`、两个 `.env.*.example`、`docs/railway-setup.md`），依据同样是 fx100-apps 当前实盘值；用 `_meta { block deployment }` GraphQL 查询验证了 v0.3.3 端点确实活着、有最新区块。
**2026-08-08 更新**：这批（含后续 P0-1/P0-2/P1）共 6 个 commit 已 push 到 `origin/feat/base-sepolia-v031-monitoring-config`，未开 PR。
### 已实机跑通验证 + 又修了一个真实缺口
用真实 Base Sepolia 起了 `pnpm dev:testnet`（worker + web），实测确认：
- 上面三处修复生效，worker 正确发现全部 24 个真实市场 + 3(MSOL)/19(LIT)，OI/reserve/funding/skew 逐市场读数正常。
- 但启动日志里 marketIndex 4-26（除 BTC/ETH 外的全部 21 个市场）疯狂打 `market-discovery: CRITICAL — new market detected but oracle/cex feed not configured`——排查发现 `packages/config/src/feeds.ts` 的 `TOKEN_FEEDS_BY_CHAIN.baseSepolia` 只配了 BTC/ETH 两个 Chainlink Data Streams feedId，Oracle 主价格采集器、Binance CEX 参考价采集器、波动率采集器的符号列表**全部**从这个表派生（`apps/worker/src/index.ts` 的 `getAllFeedConfigs()`），所以这 21 个市场的 Primary Oracle Price / CEX 偏离度 / 波动率此前是**完全没有**，不是降级。已从 `fx100-apps/apps/fx-base-app/src/config/feedIds.ts` 取真实 feedId 补齐全部 21 个（commit `6f957a73`），改完热重载后日志确认只剩 marketIndex 3(MSOL，本来就没有真实 feed，符合预期) 还打 CRITICAL，其余全部消失，DOGE/LINK/AERO 等都开始正常收到 oracle 报价和 CEX 价格。
- 顺带看到一条真实信号：BTC/ETH 当前 `fundingAbnormalStatus` 都是 `"critical"`——这就是这套系统正常运作后应该被每天盯的那类东西，具体数值以你自己在网页上看到的为准，这里不重复抄一遍链上瞬时值。
### 又一个真实缺口：Dashboard 显示全 $0 / "—"（已快补修复）
用户实际打开网页后反馈 Total OI / LP Pool TVL / Reserve 全是 $0 或 "—"。排查根因：`marketCollector.ts` 把 24 个市场汇总写 Redis 的 `snapshot:protocol` key，TTL 只有 30 秒，但补齐 21 个真实市场后单轮任务耗时从几秒暴涨到 43s→60s→83s（还在变慢，四处**串行** for 循环、无 `Promise.all`，怀疑叠加 Chainlink 测试网限流）——30 秒缓存几乎每次都在下一次成功写入前就过期，导致 `apps/web` 的 `/api/snapshot/markets` 路由读不到 Redis 快照，被迫退到一条自己注释都写着"Reported as 0 until this path is redesigned"的本地兜底路径，TVL/聚合 OI% 天生就没实现。**不是我三处改动本身有问题，是市场数量从2变24暴露了一个已存在的容量假设**。
已打快补（commit `c4a4c630`）：TTL 从 30s 提到 180s。验证：新一轮任务 70.5 秒完成，`TTL snapshot:protocol` 读到 180（未过期），`GET /api/snapshot/markets` 返回 `"source":"worker"`（不再是 `"source":"chain"`），BTC 等市场的 `globalCap`/`oi.totalUsd` 都是真实非零值。**真正的根因（四处串行循环没并行化）没有动**，只是买了时间窗口；如果市场继续变慢或将来再加市场，这个 TTL 还会不够，到时候需要回来做并行化。
顺带发现一个无法修的数据可用性限制，不是 bug：ONDO/XRP/ARB/TON/AAVE/PUMP/BNB/XMR/ADA/DOGE 这些资产不在 Binance 永续合约上市，CEX 参考价/偏离度检查天然缺失，属于"没有第三方数据可比对"，不是代码没写。
### 快补撑不住了，已做真正修复（commit `9e1056e0`）
用户挂着网页跑了一个多小时后，任务耗时继续爬升：43s→60s→83s→137s→**180017ms（正好撞在刚提到180s的TTL上）**，累计1360+次 Chainlink API 超时——快补已经在失效边缘。根因：`marketCollector.ts` 每个市场的循环体里有 **2 次串行链上 RPC 调用**（DataStore multicall + `Reader.getMarketInfo`），24 个市场 = 48 次串行 RPC，公共 Base Sepolia RPC（`sepolia.base.org`）延迟/限流一叠加就爆炸。
修复：把循环体抽成 `processMarket()` 函数，用手写的 `mapWithConcurrency()`（5 个并发 worker）代替全串行——不用无限制 `Promise.all` 一次性打 48 个请求，是因为这个仓库自己的文档里到处都在提"测试网限流"，怕并发太猛反而触发更硬的限流。每个市场只碰自己 `mi` 相关的 key，并发安全。
实测：10 轮任务耗时从 43-180s 稳定降到 **11-32s**，TTL 174s 健康，`GET /api/snapshot/markets` 依旧 `source:"worker"`+真实非零数据。没有引入新错误类型（残留的 Chainlink/Goldsky/market-discovery 超时都是运行前就有的外部依赖抖动，跟这次改动无关）。
**2026-08-08**：5 个 commit 已 push 到 `origin/feat/base-sepolia-v031-monitoring-config`（未开 PR，用户只要求 push）。
### 🔴 但仍有一个更成熟的 `dev` 分支也没解决的坑——ADL 距离指标口径错误（同 checklist §三 早就警告过的坑）
`packages/onchain/src/keys.ts:312-327` 的 `maxPnlFactorForAdlKey(marketIndex, isLong)` / `minPnlFactorAfterAdlKey(marketIndex, isLong)`，以及消费它们的 `packages/metrics/src/pool.ts:44-68` `computeAdlDistance()`，全部是**逐市场、逐方向**计算——但合约的真实 ADL 判定（`AdlUtils.updateAdlState` → `MarketUtils.isGlobalNetObligationRatioExceeded`）读的是**不带 marketIndex 的全局裸键**，比较的是**全场盈利侧义务之和 / 共享 poolUsd**，跟单个市场的 `longPnlToPoolFactor` 完全不是一回事；这两个函数读的 per-market key 是死写槎位（LIVE_MARKETS.md §三 已确认 markets 4-26 上的 0.77 不生效）。也就是说：**这个新系统显示的"AdlDistance"目前是双重错误**（读错槎位 + 算错口径），跟本清单 §一 的核心结论一样——最重要的全局 pnlRatio/ADL 状态目前还是没有被正确监控，只是换了个更精致的错误实现。这条**还没有修**，等用户确认优先级后再动 `packages/onchain`/`packages/metrics`。
---
## 2026-08-08 改进计划（逐条核对完 §一~§八 后的建议，按优先级排列，先文档不动代码）
方法：把 checklist 每一节跟 `dev` 分支的实际实现（`apps/worker/src/collectors/*`、`packages/metrics`、`apps/web/src/app/dashboard/page.tsx`）逐条对表，标注"已覆盖 / 部分覆盖 / 零覆盖"，只对后两类给改法。
### ✅ P0-1 已完成（commit `09788ac9`，已 push 到 origin）
`apps/web/src/app/markets/page.tsx` 的 ADL 列（非 ADL 中状态时）不再显示基于死写键算出的"距离百分比"，改成 "—" + tooltip 说明原因；`apps/web/src/components/asset-drawer.tsx` 的"Trader P&L vs Pool"去掉了基于假阈值的分区色条和"X% trigger"标签（保留真实的 PnL/pool 百分比），"ADL Thresholds"四个原始值保留展示（仍是真实链上读数，可用于参数漂移核对）但加了警示条+改写了每条 tooltip 措辞。跑过 `pnpm run typecheck`（14/14）+ 实机 `pnpm dev:testnet` 验证 `/markets`、`/dashboard` 都还是 200。
### P0-1（纠错，不是补漏）：删掉或标注 AdlDistance 这个误导性字段
上面那条 bug——`pool.ts` 的 `computeAdlDistance()` 用的是死写 per-market key。**在真正的全局读法（P0-2）上线前，建议先把 UI 上任何展示 ****`adlDistanceLong`****/****`adlDistanceShort`**** 的地方标成"⚠️ 口径存疑，不代表真实 ADL 距离"**，或者直接隐藏，防止运营看着一个"看起来正常"的假指标误判。这是纠错，优先级比下面的"补漏"更高——错的信息比没信息更危险。
### ✅ P0-2 已完成（commit `4ea333de`，已 push 到 origin）
按下面写的方案原样实现了，另外多做了一步——除了 `getAdlState()` 本身，还额外单独读了 `MAX_PNL_FACTOR_FOR_WITHDRAWALS`（50%）/`MAX_PNL_FACTOR_FOR_ADL`（55%）/`MIN_PNL_FACTOR_AFTER_ADL`（45%）三个全局裸键（在 fx100-contracts `src/constants/FX100Keys.sol:135,137,139` 逐行核对过，确实是纯 `keccak256(abi.encode("NAME"))`，不带 marketIndex，跟 `AdlUtils.sol`/`LPVault.sol`/`ReaderUtils.sol` 的调用点一致），这样才能同时显示 checklist 要的 40/45/50/55 四条水位线，而不是只有 `getAdlState()` 动态返回的那一条。
实机验证（`redis-cli GET snapshot:protocol` + `curl localhost:3001/api/snapshot/markets`）：`globalNetObligationRatioPct: 0.5317`、`adlTriggerThresholdPct: 55`（跟独立读到的 `maxPnlFactorForAdlPct: 55` 完全一致，两条独立读法互相印证）、`minPnlFactorAfterAdlPct: 45`、`maxPnlFactorForWithdrawalsPct: 50`——跟 [[project_fx100_risk_backstops_vs_spec]] 记录的 60/55/50/45 阶梯完全对得上。`pnpm run typecheck` 14/14 过。
Dashboard 的"Global Status"卡片已经改成以这个真实值为主，旧的"最差单市场"逻辑降级成 fallback（只在没有 global 数据时才用），并且改名成"Worst market"避免混淆。
### P0-2：把 §一（全局 pnlRatio / ADL 状态）从零覆盖补到位
这是checklist 认定的"唯一最重要的指标"，目前 `protocolSnapshot` 里完全没有这个字段（`marketCollector.ts` 循环结束后只写了 `{ts, source, markets:[...]}`，没有任何 global 级别字段），Dashboard 的"Global Status"卡片实际上是 `leveled[0]?.level`——24 个市场各自 `workerAlertLevel` 里取最大值，是"最差单市场"代理指标，跟真实的全局 pnlRatio 是两件不同的事。
改法（已核实全部可行，Reader ABI 里 `getAdlState` 函数确实存在）：
1. `packages/config/src/addresses.ts` 的 `MonitorContracts` 类型加一个 `Oracle` 字段，`baseSepolia` 填 `0x83719dDb9d810B87cC9cB17A29d937dF0761497d`（跟 fx100-apps 的 `Oracle` 地址核对一致）。
2. `packages/onchain/src/reader.ts` 仿照现有 `getMarketInfo()` 的写法加一个 `getAdlState(client, readerAddress, dataStoreAddress, oracleAddress)`，签名是 `(dataStore, oracle) → (latestAdlTime, shouldEnableAdl, globalNetObligationRatio, threshold)`，4 个返回值直接对应。
3. `marketCollector.ts` 里在 24 个市场的循环**之外**（每轮只调一次，不是每市场调一次）调用它，把结果写进 `protocolSnapshot` 新增的 `global: {...}` 字段。
4. 按 checklist §一的水位表加告警判定：>40% 提醒、>45% ADL回拉目标区、>50% 提款封锁、>55% ADL应触发；外加两个派生信号：`shouldEnableAdl=true` 但 `latestAdlTime` 超 5 分钟没更新→keeper掉线告警；`latestAdlTime` 停止更新单独告警。
5. Dashboard 的"Global Status"卡片改成以这个真实全局值为主，"最差单市场"可以降级成次要信息（不是不要，是不该再叫"Global"）。
### ✅ P1 已完成（commit `0c63ec73`，已 push 到 origin）
第一条（逐市场 reserve usage）确认原来就是对的。第二条（全场汇总）按下面方案实现：`Σ_i max(longOiUsd_i, shortOiUsd_i) / poolUsd` 跟 `Σ_i RESERVE_FACTOR_i` 都算好放进了 `global` 字段。
**过程中抓到一个真 bug，报告前自己先修了**：第一版直接对 `marketSnapshots` 里全部市场求和，算出 `reserveFactorBudgetUsed = 3.25`——比文档写的 2.95/预算≤3 都超了，一开始以为抓到了真的参数漂移。查下去发现是 market 3（MSOL，内部测试专用合成资产）混进来了——它没有被 `IS_MARKET_DISABLED` 标记，所以正常流程不会把它过滤掉，但它自己配了真实的 `RESERVE_FACTOR=0.30`，正好等于 3.25-2.95 的差值。加了显式排除后重新验证，`reserveFactorBudgetUsed` 精确等于 2.95。
第三条（skew 排行榜）确认不需要新工作——`markets/page.tsx` 的 `MarketsTable` 已经有按 `|skew|` 降序排序的列（`sortKey === "skew"`），已经满足需求。
实机验证：`globalNetObligationRatioPct 0.55%`、`unilateralConcentrationRatio 0.2475`、`reserveFactorBudgetUsed 2.95`（排除 MSOL 后精确匹配 T1/T2/T3/T4 阶梯之和）。`pnpm run typecheck` 14/14。Dashboard 的 Global Status 卡片新增了"Unilateral: X.XX× / Y.YY× budget"一行 + tooltip。
### P1：§二 单边集中度——一半已经有了，缺的是跨市场汇总
好消息：`marketCollector.ts` 里 `reserveUsageLong`/`reserveUsageShort`（该侧OI÷该侧RESERVE_FACTOR×poolUsd）已经算对了，就是 checklist §二 第一条要的东西，逐市场都有。
缺的是第二条——**全场 Σ单向名义OI ÷ 共享poolUsd**（checklist 说的"逼近 2.95 就是最坏情况"）。改法：24 个市场处理完之后，把每个市场的 `reservedLong`/`reservedShort` 累加，除以共享的 `poolUsd`（随便取一个市场的 `marketInfo.poolUsdWithoutPnl` 即可，反正是同一个 LPVault），算出这一个全场比值，也放进新增的 `global` 字段。
第三条（skew 排行榜）纯前端工作，数据已经都在每个市场的快照里，按 `|skew|` 排序展示即可，不需要新的链上读取。
### ✅ P2 已完成（commit `a3f399e8`+文档`e6307948`/`85670120`，已 push 到 origin；已同步上传 Notion 中英双语）
两块都做了，都是先 grep 全零命中确认是真缺口才动手：
**recorded-price keeper 活性**：确认这跟 Chainlink 主报价新鲜度是两个不同的东西——`Oracle.latestRecordedPrices(token)` 由 `AdlHandler.refreshLatestRecordedPrices()`（v0.3.1 起免权限）单独刷新，LP 提款和 ADL 结算读的是这个，不是 Chainlink 主报价。新增 `Oracle.abi.json`（跟 fx100-apps 的版本核对字节一致）+ `oracle.ts` 的 `getLatestRecordedPrice()`，每个市场跟已有的 `getMarketInfo` 调用并发读（没多加一次串行 RPC），汇总最老的 age + 超期市场数进 `global` 字段。**实机发现**：各市场刷新节奏很不均匀——BTC/ETH 几分钟内刷新过，有些市场 10 多小时没刷新过（还在 24h 配置阈值内，没到跳 revert 的地步，但值得盯）。
**参数漂移日检**：把 checklist 这张表变成真的会告警，不是"能看"。新增 3 个之前完全没读过的键（`MAX_OPEN_INTEREST_FACTOR`、`MAX_PNL_FACTOR_FOR_TRADERS`、`EXECUTION_FEE_SUBSIDIZE`/`_SIZE`），每一个都去 `fx100-contracts` 源码逐行核对了组合方式才敢写（`MAX_PNL_FACTOR_FOR_TRADERS` 顺着 `PositionUtils.sol:224`→`MarketUtils.getCappedPnl`→`getMaxPnlFactor`→`FX100Keys.maxPnlFactorKey` 一路跟到底，确认它是真的 per-market+isLong，跟"死写"的 ADL 那两个不是一回事）。对全部 24 个真实市场核对 7 类参数 + 全局不变式，**实机验证结果是 0 条漂移**——抽查了几个市场的原始值（不是只信任"0"这个数字）确认这是真的"全对"，不是检查逻辑本身有问题放过了一切。
明确没做的：`MIN_DYNAMIC_SPREAD`/`MAX_DYNAMIC_SPREAD`（v0.3.1 下本来就是死的，是升级v0.3.2前的关卡检查，不是v0.3.1日常漂移问题）；21个非T1市场的精确梯队归属只查"是不是四档之一"而非精确symbol映射（因为只有T1三个成员和T2的SOL/ZEC是独立核实过的，写一个没核实过的完整映射表就是在重复这整个session一直在避免的错误）。
另外按你的要求写了一份**面向工程师review的整合文档**：`fx100-monitor/docs/2026-08-08-branch-review.md`（英文）+ `2026-08-08-branch-review.zh-CN.md`（中文，1:1对应，含逐commit速查表），把这个分支全部9个commit的动机/改法/验证过程/抓到的bug都串成一条线，不用工程师自己从commit message里拼。全部11个commit已 push 到 `origin/feat/base-sepolia-v031-monitoring-config`。
### P2：§三 参数漂移日检——现在是"能看到值"，不是"会告警"
`dev` 分支的 Parameters 页面能看到当前各键的值，但没有"跟期望值比对、不一致就告警"的逻辑——是纯展示，不是纯 checklist 想要的日检。改法：把 checklist §三 那张表（`EXECUTION_FEE_SUBSIDIZE`/`_SIZE` 应为 0、`MAX_OPEN_INTEREST` $100M/侧、`RESERVE_FACTOR` Σ=2.95、`MAX_PNL_FACTOR_FOR_TRADERS` 60%、ADL 三个全局裸键 55/45/50、`POSITION_FEE_FACTOR` BTC/ETH 0.05%其余0.075%、`LIQUIDATION_GRACE_PERIOD_BASE` 900s）写成一份"期望值"配置，每轮跟已经采集到的真实值做 diff，不一致才告警，而不是每天人工去 Parameters 页面肉眼核对 24×N 个数字。这个改动量不大，但要等 P0-2 顺手把 ADL 三个全局裸键也读对了之后一起做（不然又要经历一次"读错槎位"的坑）。
### P2：§四 keeper 活性——ADL keeper 靠 P0-2；清算/订单 keeper 大部分已有底子
- ADL keeper 活性 = P0-2 里那两个派生信号，不用单独做。
- **清算 keeper**：`apps/worker/src/collectors/indexerCollector.ts` 已经在算 `highRiskCount`/`highRiskProtectedCount`（高风险仓位数，含"是否在900s保护期内"的区分），checklist §六这条基本已覆盖，不算缺口。
- **recorded-price keeper**（LP提款/ADL用的 secondary price）：目前有的 `oracleAgeSec`/`oracleAgeLevel` 检查的是 Chainlink Data Streams 主报价的新鲜度，跟合约里 ADL/提款用的"recorded price"（由 `AdlHandler.refreshLatestRecordedPrices` 单独刷新）是两个不同的时间戳——**没有验证过这两者是不是同一回事，需要单独确认 ****`dev`**** 分支有没有单独读 recorded price 的时间戳**，如果没有，这是一个真实缺口（且是单点故障，冻结全部市场的LP提款和ADL，优先级不低）。
- **订单执行 keeper**（市价单120秒有效期超时未成交）：没找到对应的指标，大概率是缺口，需要走 indexer 的 order 数据算"超过120秒仍pending"的数量。
### P3：§五/§七/§八——大部分需要走 indexer 事件流，量不小，建议排后面
- §五 LP健康度：TVL/NAV已经有 UI（截图里的 LP Pool Health 卡），epoch状态+待claim量+挤兑组合告警、`WithdrawGlobalNetObligationRatioExceeded` 拒绝次数，这几个没验证到，大概率缺。
- §七 刷量异常、§八 定价异常（资金费触顶次数/点差为0成交/执行价偏离oracle价）：都需要逐笔 trade 级别的 indexer 分析（按地址聚合开平频率、按笔判断点差/资金费），目前的 collector 都是"当前状态快照"，没有事件流分析这一层，工作量最大，建议排在最后。
### 建议的落地顺序
P0-1（纠错，几分钟）→ P0-2（全局pnlRatio/ADL，今天讨论的重点，改动集中在 3 个文件）→ P1（跨市场汇总，P0-2 顺手带）→ P2（参数日检 + recorded-price keeper 核实）→ P3（事件流类，工作量大，单独立项）。
### ✅ 顺带修的一个真实 bug（commit `9d386602`，已 push 到 origin）：Base Sepolia RPC 单点故障
用户反馈 dashboard 偶尔弹出一整段 viem 超时的原始报错（`getMarkets` 调 `sepolia.base.org` 超时）。用 systematic-debugging 流程查了四层才动手，不是猜的：①`apps/web` 的"仅开发环境"链上兜底路径没有重试，报错直接原样返回给前端；②这条路径只在 Redis 快照过期（worker 那轮采集卡住超过180s TTL）时才会触发；③worker 和这条兜底路径用的是**同一个** `RPC_URL_TEST_SEPOLIA` 环境变量，且只配了一个 URL；④`packages/onchain/src/client.ts` 其实早就写好了多 URL 自动接入 viem `fallback()` 容错的逻辑，只是没人配置超过一个 URL。根因：单一免费公共 RPC 是唯一故障点，容错机制早搭好了没人用。
修复是纯配置改动（往 `RPC_URL_TEST_SEPOLIA` 加两个验证过活着的公共 RPC），没动代码。`fx100-monitor/docs/2026-08-08-branch-review.md`/`.zh-CN.md` 里补了第 10 条。用户需要重启 `pnpm dev:testnet` 才能生效（env 只在进程启动时读一次）。

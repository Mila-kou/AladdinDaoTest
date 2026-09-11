# FX100 Keeper 代码分析报告（fx100-apps@develop · apps/keeper）

> 日期：2026-08-23 ｜ 目的：Keeper 测试设计前置分析（只读，未改被测代码）
> 被测对象：`Github/fx100-apps@develop/apps/keeper`，develop 分支 HEAD `c670d007`（2026-08-22，与 origin/develop 同步；最近 keeper 提交 `f5216327` 2026-08-14）
> 合约基线：按 [`Docs/contract-releases/CURRENT.json`](../contract-releases/CURRENT.json)（主测 v0.3.2 / 对比 v0.3.1 / 唯一已知部署 base-sepolia@v0.3.1）
> 方法：通读 `IMPLEMENTATION.md`（2067 行）+ 6 路分模块源码深读（事件摄入 / 订单执行与价格 / 队列与基础设施 / 清算与 ADL / 中继 / 合约绑定核对），所有结论以代码为准并标注 `文件:行号`；文档与代码冲突处按代码记录。
> 分模块原始报告存于本次会话 scratchpad（`keeper-analysis/A~F-*.md`），本文为汇总。

---

## 0. 结论摘要

1. **规模与健康度**：src 约 30.7k 行（含 47 个测试文件），8 个进程入口，56 个 `.env.example` 配置项。`tsc --noEmit` 通过；**vitest 44 文件 / 607 用例全部 PASS**（文档写 558，已过时）。
2. **架构**：单 `producer`（无私钥）负责 `OrderCreated` 监听 + ADL/清算策略 tick + ~1Hz Chainlink Data Streams 价格录入 + 两个价格触发 ZSET 索引（清算价 / 触发价）→ Redis 可靠队列（`RPOPLPUSH` + 锁 + processing 标记 + reaper）→ 按角色分进程的 worker 广播 `executeOrder / executeAdl / updateAdlState / executeLiquidation / refreshLatestRecordedPrices`；`relWorker` 另走 EIP-712 免 gas 中继。
3. **合约绑定（v0.3.1/v0.3.2）**：四个 handler 调用签名、Reader 函数、EventLog2/OrderCreated 字段、角色哈希、Order 枚举、触发方向不等式、DataStore 主键 **全部一致**；SDK 对 84532 登记的地址与 v0.3.1 部署导出逐一相等。两处漂移：① `minPnlFactorAfterAdlKey` SDK 按 `(marketIndex,isLong)` 哈希、合约为全局常量（低危，只进快照不进决策）；② v0.3.2 `SubaccountApproval` 新增 `slot` 字段而 SDK ABI/typehash 仍为旧结构 → **子账户中继路径在 v0.3.2 上必失败**（高危，升级阻塞项）。
4. **环境可测性（最关键的前置约束）**：
   - Keeper 对**所有 token（含 USDC）一律用 `ChainlinkOracleDataStreamProvider`**，合约 `Oracle.sol` 严格校验 `ORACLE_PROVIDER_FOR_TOKEN`。现有 **tx-fork/oracle-fork 的 USDC 已被 TestCode Mock 初始化改为 `ChainlinkPriceFeedProvider`** → Service Keeper 在这两个 fork 上任何含 USDC 的执行都会 revert `InvalidOracleProviderForToken`（且被归 unknown 反复重试）。真 Base Sepolia（24 市场 + USDC 全 Data Stream）或未做 Mock 初始化的新 fork 才能直接跑。
   - **fork 链 ID 99911/99912/99913 不在 SDK 登记**（仅 8453/84532/99917/99918），`isFx100Chain` 为假 → 合约地址、市场表、feedId、provider 全部解析失败；develop 上 99917 登记的是 v0.2.0 旧地址 + 2 个市场。Gordon 团队的测试分支（`origin/feat/liquidation-protection-ux-v031`）已把 99917 改为 v0.3.1 地址并附 `scripts/forkResetCursor.ts`，但尚未合入 develop。
   - `KEEPER_DRY_RUN` **默认 true**（未设即 dry）；dry-run 下所有 item 直接 ack、触发单不重索引、relay 永不 `executed`。
   - 需要 Chainlink Data Streams API 凭证（`CHAINLINK_API_KEY/SECRET`，`CHAINLINK_NETWORK=testnet` 对 84532）、Redis、各角色私钥（ORDER/ADL/LIQUIDATION_KEEPER 已授予）、WNT（relay）。
5. **两条 Open 缺陷在 develop 上均未修**：OC-28（区块游标只按 chainId 隔离；`computeStartBlock` 不与链头比较，游标 > 链头时 `pollingProvider.ts:122` 永久 early-return 一单不处理）、OC-31（`KEEPER_REDIS_MODE=local` 零处引用，`redisClient.ts:264` 只看 `KV_REST_API_*`）。
6. **现有单测的盲区集中在"进程级主流程"**：`ordWorker.executeOrder`、`liqWorker` 预检、`adlWorker` 两道 gate、`relWorker.executeRelay`、`producer.handleOrder` 分流 + `onSlotsWritten` pop→enqueue、`hybridProvider` 双投递、`orderEventListener`、`store.refresh` 全流程均无单测；测试用内存 Redis 无 TTL 过期 / list 命令为桩，锁过期、reaper 真实回收、Upstash 反序列化差异未被覆盖。
7. **行为层最值得测的风险簇**：价格 scale/decimals 与触发方向；时间窗边界（`validFromTime/updatedAtTime/REQUEST_EXPIRATION_TIME/MAX_ORACLE_PRICE_AGE`）；本地时钟 vs 链时间（fork 上尤甚：过期闸、grace 判定）；trigger-not-crossed 重索引与 pop 后丢单；锁/租约/重试预算；错误分类误判（`expired`/`Unauthorized` 子串、未映射错误当 retryable）；ADL 全局状态 vs 逐对信号；v0.3.2 行为变化（清算谓词、点差、relay feeToken/子账户）。
8. **文档漂移**：`IMPLEMENTATION.md` 有 30+ 处与代码不符（见 §9），写断言时不能以文档为准。

---

## 1. 被测对象

| 项 | 值 |
|---|---|
| 包 | `@fx-io/keeper`（`apps/keeper/package.json`），Node ≥18，viem 2.48 / ioredis 5.8 / @upstash/redis / zod 4 / vitest 3 |
| 依赖的同仓库包 | `@fx-io/sdk`（ABI、合约地址、市场/代币表、角色、DataStore key、订单工具、中继协议、keyspace 版本）、`@fx-io/chainlink-datastreams`（报告拉取/解码/换算） |
| 进程入口（`src/entrypoints/`） | `producer` / `ordWorker` / `adlWorker` / `liqWorker` / `relWorker` / `marketStateIndexer`（Phase 4，默认不启）/ `inspect`（调试）/ `preconfBench`（工具） |
| 部署 | 非 Vercel；`systemd/` 模板单元 `fx100-keeper@<role>[.<index>]`，`index` 即 `KEEPER_WALLET_INDEX`；`pack.sh` 打 esbuild bundle |
| 文档 | `CLAUDE.md`（agent 指南）、`IMPLEMENTATION.md`（自述权威）、`MARKET_STATE_IMPROVEMENT_PLAN.md`（Phase 1-5 增量管道计划） |
| 健康度 | `yarn tscheck` 通过；`yarn test` 607/607 PASS（2026-08-23 本机） |
| 其他分支 | `origin/fix/keeper-*`（6 月）、`origin/keeper/keyspace-version-chainid`（7 月）均已落后 develop；`origin/feat/liquidation-protection-ux-v031`（Sosogao，2026-08-12 合 develop）含 SDK 99917 改 v0.3.1 地址 + `forkResetCursor.ts`，未合入 |

---

## 2. 架构总览

### 2.1 进程拓扑与链上调用

| 进程 | 私钥/角色 | 消费 | 生产 | 链上写 |
|---|---|---|---|---|
| `producer` | **无** | 链 RPC、Chainlink | `keeper:orders:queue`、`keeper:adl:queue`、`keeper:adl-state:queue`、`keeper:liquidation:queue`、`keeper:price-refresh:queue`；`TriggerIndex`/`LiquidationIndex` ZSET；价格环 `keeper:prices:*` | 无 |
| `ordWorker`（可分片） | ORDER_KEEPER | `orders:queue`、`price-refresh:queue`（同进程第二循环，同一把 `submitGate`） | `TriggerIndex`（trigger-not-crossed 重索引） | `OrderHandler.executeOrder(key, SetPricesParams)`；`AdlHandler.refreshLatestRecordedPrices(params)`（permissionless） |
| `adlWorker` | ADL_KEEPER | `adl:queue`、`adl-state:queue` | `AdlStateGate`（`keeper:adl:lastSent:*`） | `AdlHandler.executeAdl(account, marketIndex, isLong, sizeDeltaUsd, params)`；`refreshLatestRecordedPrices(params)` + `updateAdlState()` |
| `liqWorker` | LIQUIDATION_KEEPER | `liquidation:queue` | — | `LiquidationHandler.executeLiquidation(account, marketIndex, isLong, params)` |
| `relWorker` | RELAY（无链上角色；需 ETH + WNT 且 `WNT.approve(Router)`） | `keeper:relay:queue`（由 fx-base-app `/api/relay/*` 写入） | `keeper:relay:task:<taskId>` 状态 | `RelayRouter`/`SubaccountRelayRouter`.`createOrder/cancelOrder/updateOrder/batch` |
| `marketStateIndexer` | 无 | 链 RPC（PositionIncrease/Decrease 事件） | `keeper:pos:*` 影子缓存 | 无 |

角色哈希 `keccak256(abi.encode("NAME"))`（`sdk/configs/roles.ts` ↔ `Role.sol`），RoleStore 默认即 DataStore；ord/adl/liq 三 worker 启动时 `assertKeeperRole`，**dry-run 下也校验**，失败 `exit(1)`。

### 2.2 数据流

```
OrderCreated(EventLog2) ──provider(auto=hybrid: ws加速+polling权威游标)──▶ producer.handleOrder
   ├─ 触发单(1/3/4/6) ──TriggerIndex.addOrderFromConfig──▶ ZSET keeper:trigger:{fall|rise}:<chain>:<indexToken>(score=triggerPrice) + meta
   └─ 市价单(0/2) ──expiry gate(REQUEST_EXPIRATION_TIME, boot 读一次)──enqueueOrder(dedup 1h)──▶ keeper:orders:queue

priceRecorder(~1Hz, Chainlink Data Streams) ──▶ keeper:prices:<chain>:<token>(LPUSH/LTRIM 15)
   └─ onSlotsWritten ──▶ LiquidationIndex.popExpiredGrace/popReady → liquidation:queue
                      └─▶ TriggerIndex.popReady(mid 价) → enqueueOrder(skipDedupCheck) → orders:queue

producer tick(30s) ──▶ store.refresh(markets/prices/adlState/positions/pnl/liqChecks)
   ├─ auto ADL strategy → adl:queue；shouldUpdateState → adl-state:queue
   ├─ auto liquidation strategy → liquidation:queue
   ├─ liquidationIndex.syncFromStore / syncIncremental
   └─ maybeEnqueuePriceRefresh → price-refresh:queue

worker(startReliableWorker): RPOPLPUSH→validate→markProcessing→lock→execute→ack/requeue
   execute: pending-tx 对账 → (expiry gate) → buildOracleParamsFromWindow(Redis 环, 方向 min/max, triggerCheck) → DRY_RUN? → submitGate(writeContract) → receipt
```

### 2.3 价格选择规则（`minMaxPriceSelector.ts` ↔ SDK `fx100Orders.ts` ↔ `BaseOrderUtils.sol:106-150`）

| PriceSide | 选法 | 说明 |
|---|---|---|
| long-increase / short-decrease | `max(ask)` | 多头买 / 空头买回 |
| short-increase / long-decrease / adl | `min(bid)` | |
| updateAdlState | 最新 observationsTimestamp | 无方向 |
| liquidation | 数组首个有效 slot（LPUSH 新在前） | 无方向 |

触发单 crossed 判定（含等号，与合约 v0.3.2 **逐条一致**）：LimitIncrease long `ask ≤ trig` / short `bid ≥ trig`；StopIncrease long `ask ≥ trig` / short `bid ≤ trig`；LimitDecrease long `bid ≥ trig` / short `ask ≤ trig`；StopLossDecrease long `bid ≤ trig` / short `ask ≥ trig`。触发检查只作用于 `tokens[0]`（index token）；`triggerPrice==0` 不检查。

价格 scale：Data Streams int192（USD×1e18）→ FX100 oracle 价（USD×10^(30−decimals)），`factor=10^(12−decimals)`；decimals 来自 SDK 代币表，**找不到时兜底 18**（`priceRecorder.ts:171`）。TriggerIndex/LiquidationIndex 的 ZSET score = `Number(price / 10^(24−decimals))`（USD×1e6 截断）。

### 2.4 Redis keyspace（前缀 `<KEYSPACE_VERSION>:<chainId>:`，当前 `v0.3.2:<chainId>:`，SDK `configs/keyspace.ts:18`）

| Key | 作用 |
|---|---|
| `keeper:{orders,price-refresh,adl,adl-state,liquidation}:queue` / `:processing` | 队列 / 处理中列表 |
| `keeper:<q>:processing:ts:<id>`（TTL 300）/ `keeper:<q>:lock:<id>`（TTL 180）/ `…:lock:<id>:submitted-transaction`（TTL 7d） | 租约 / 锁 / 已广播 hash 日志 |
| `keeper:orders:enqueued:<orderKey>`（TTL 3600）/ `keeper:orders:dead`（ZSET） | 入队去重 / 过期市价单事实缓存 |
| `keeper:prices:<chain>:<token>`（List，深度 15） | Chainlink 报告环 |
| `keeper:trigger:{fall,rise}:<chain>:<indexToken>` + `keeper:trigger:meta:<chain>:<orderKey>`（无 TTL） | 触发单索引 |
| `keeper:liq:{long,short}:<chain>:<indexToken>`、`keeper:liq:grace:*`、`keeper:pos:*` | 清算价索引 / 保护期索引 / 仓位影子 |
| `keeper:adl:lastSent:<chain>:<mi>:<L\|S>`（无 TTL） | updateAdlState 去重 |
| `keeper:events:lastBlock:<emitter>` | 区块游标（**只按 chainId+emitter 隔离，见 OC-28**） |
| `keeper:metrics:*` | 计数器 |
| `keeper:relay:queue` / `:processing` / `keeper:relay:dedup:<account:userNonce>`（1800s）；`v0.3.2:keeper:relay:task:<taskId>`（仅版本前缀，3600s） | 中继 |
| `heartbeat:keeper:v0.3.2:<chain>:<role><addr末6>`（不经 nsKey，TTL 30） | 心跳 |

identity：order=`topic1`(orderKey)；adl/adl-state=`id`（60s 桶化）；liquidation=`liq:<mi>:<L|S>:<account>`（按**仓位**互斥，两条发现路径共用）；relay=`account:userNonce`。

### 2.5 外部依赖
Chainlink Data Streams API（`api.dataengine.chain.link`，按 `CHAINLINK_NETWORK` 选 feedId 集）；HTTP/WSS RPC；Redis（本机 ioredis 或 Upstash REST，**选择只看 `KV_REST_API_URL/TOKEN` 是否存在**）；SDK 静态配置（`MARKETS/CONTRACTS/TOKENS/chainlinkFeeds`）。

---

## 3. 分模块要点（流程 → 规则 → 精选风险）

### 3.1 A · 事件摄入 / producer（`entrypoints/producer.ts`, `chain/orderEventListener.ts`, `providers/*`, `domain/orders/{enqueue,eventParser,deadOrderCache,orderAge}.ts`）

- boot：env/策略解析（非 daemon exit 2）→ `KEEPER_LEGACY_MARKET_STATE_SCAN_ENABLED=false` 直接 exit 1 → `redis.ping` → heartbeat → `initPriceRefresh`（读 `MAX_RECORDED_PRICE_AGE`/priceFeed，失败仅 warn）→ 先起 `priceRecorder` → 读 `REQUEST_EXPIRATION_TIME` **一次**装配 enqueue 侧过期闸 → `startOrderEventListener` → 初始 `store.refresh` → `scheduleTick`。SIGTERM 仅 stop listener 后立即 `exit(0)`，不等在途。
- provider `auto`：wss+http→`hybrid`（polling 持游标与回填，ws 仅加速）；仅 wss→websocket（无游标）；`onchain-all-orders` 扫全局 `ORDER_LIST`（非文档所说 AccountOrderList），要求 `isFx100Chain`。生产路径**不经过** `eventParser.parseOrderCreatedEvent`（仅 manualProvider 用）。
- 分流：`triggerIndex.addOrderFromConfig`（纯 SDK `MARKETS` 解析，不依赖 store）；`added:false`（含市场不在 SDK）一律落 expiry gate → `enqueueOrder`（dedup key 按 orderKey，1h；pop 路径 `skipDedupCheck`）。
- 游标：`<ver>:<chain>:keeper:events:lastBlock:<emitter>`；polling 范围 `[last+1, current]` **一次 getLogs 不分块**；任一 handler 抛错→游标不动整段重放；`computeStartBlock` 不与链头比较（OC-28）。
- 精选风险：① hybrid 双投递/重启回放对触发单 `ZADD` 重入索引→已执行单再次 pop→`EmptyOrder`；② `popReady` 已 ZREM+DEL meta 后 `enqueueOrder` 抛错→仅 log，**触发单永久丢失**；③ 过期闸用 `Date.now()` 对链 `updatedAtTime`，fork 链时间滞后宿主 > 120s+5s 时所有市价单被 producer 静默丢弃（debug 日志）；④ producer 闸值 boot 后不刷新；⑤ 市场不在 SDK → 触发单直接入队→worker 建 oracle 失败；⑥ `KEEPER_PRICE_BUFFER_FEED_SCOPE=disabled` 或 Chainlink 失败→触发单永不 pop 且无告警。

### 3.2 B · 订单执行 / 价格选择（`entrypoints/ordWorker.ts`, `chain/{oracle,priceBuffer,priceRecorder,minMaxPriceSelector,triggerIndex}.ts`）

`executeOrder`（ordWorker.ts:597-811）顺序：pending-tx 对账 → 市价过期闸（`now > (updatedAtTime+REQUEST_EXPIRATION_TIME)*1000+grace`，任何字段缺失 fail-open）→ `extractTokensForOracleByMarketIndex`（找不到市场→**空 params 继续提交**）→ `buildOracleParamsFromWindow`（窗口 `fromMs=max(validFromTime, updatedAtTime, now−10s)`，`toMs=now`；slot `expiresAt` 须留 2s 余量）：`trigger-not-crossed`→重索引+ack；`gap`→throw（runner 专用预算 10×5s）→ DRY_RUN→ack → `submitGate(writeContract)` → receipt；`stale-oracle` 重选一次（窗口前移但下界不变，可能选到同一 slot）；其余 `return false`→普通预算 `MAX_RETRIES=1`。第二循环 `price-refresh`：读 `Oracle.latestRecordedPrices` 若全部晚于 `signal.createdAt` 则 ack-drop，否则 `refreshLatestRecordedPrices`（部分 token 无价时降级重建）。

精选风险：① token 不在 SDK 代币表→decimals 兜底 18→6 位 token 判定差 1e12；② producer 用 mid 价 pop、worker 用 ask/bid 验证→价差内 pop↔re-index 抖动；③ `validFromTime` 在未来 >50s 且已越线→窗口空→gap→10 次后 ack **触发单永久丢失**（gap 路径不重索引）；④ recorder 停/buffer 空→市价单约 50s 后 ack-drop；⑤ `addOrderFromConfig` 失败只 log 即 ack；⑥ re-index 后立即被 pop 且被另一 shard 抢到、原锁未释放→"acking duplicate"两边都没了；⑦ `KEEPER_DRY_RUN` 默认 true；⑧ 已 `updateOrder` 的单 payload 仍是旧 `updatedAtTime`→选到更新前 slot→`OracleTimestampsAreSmallerThanRequired`。

### 3.3 C · 队列 / runner / 错误 / 钱包 / 对账（`infra/*`, `chain/{wallet,submitGate}.ts`）

- runner 每 tick：dequeue→validate(失败 ack-drop)→**先 markProcessing(300s) 再 lock(180s, 无 owner token)**→execute→finally **先 DEL lock 再 ack**。失败：`retryCount` 存 payload；普通预算 1（共 2 次）、buffer-gap 预算 10；`TransactionPendingError` 不耗预算；sleep 占用唯一 in-flight 槽。reaper 10s：JSON 坏→回灌；identity 空→**永久滞留**；marker 缺→回灌。`assertLeaseOutlivesReceiptWait`：`lock*1000 > receiptTimeout+15000` 且 `processing ≥ lock+5`。
- 对账：广播后 hash 先写 `…:submitted-transaction`（7d）+ checkpoint 再等回执；超时→probe，`absent≥3` 或 `attempts≥20` 才放弃重建；重启后按 identity 读 journal 续等同一 hash。
- 错误分类：先 ABI 解码（命中 stale/terminal；**已解码但未映射→unknown→按重试**），再子串（`expired`/`stale`→stale；`Unauthorized` 等→terminal；`nonce too low`/`timeout`…→retryable）。死条目（合约不存在）：OrderAlreadyExists/OrderHasNoMarket/OrderHasMarket/EmptySize/InvalidKeeperRole/OnlyHandler/PnlNotEnabled。未分类但会碰到：MaxPriceAgeExceeded、EmptySecondaryPrice、MaxOracleTimestampRangeExceeded、InvalidOracleProviderForToken、AdlNotEnabled、AdlPnlNotPositive 等。
- 钱包：`<ROLE>_KEEPER_PRIVATE_KEYS[idx]`→`<ROLE>_KEEPER_PRIVATE_KEY`→`KEEPER_PRIVATE_KEYS[idx]`→`KEEPER_PRIVATE_KEY`，池越界静默下钻；**无 nonceManager**，每 wallet 一把 FIFO `submitGate`（仅包裹 writeContract）；跨进程同 key 无保护。
- 精选风险：① 锁过期后第二 shard 持锁、第一 shard finally 删掉它→第三 shard 可入→重复广播；② `401 Unauthorized`/`expired` 子串误命中→整队 ack-drop 或误判 stale；③ 未映射确定性错误当 retryable→多烧一次 gas；④ Upstash 自动反序列化+重 stringify 导致 `LREM` 字节不匹配→processing 堆积；⑤ 畸形 JSON 毒消息无限乒乓；⑥ SIGTERM 时 receipt(60s) > 30s 强退；⑦ TTL 配置无下界。

### 3.4 D · 清算 / ADL / 市场状态（`chain/marketState/*`, `chain/liquidationIndex.ts`, `strategies/*`, `entrypoints/{liqWorker,adlWorker}.ts`）

- `store.refresh` 六阶段（markets≥10min 重拉 → Chainlink 价 → `Reader.getAdlState`+`isAdlEnabled`（**全局**）→ `POSITION_LIST`+`Reader.getPosition` → `getPositionInfo`(仅 needsAdl) → `isPositionLiquidatable(..., {vault: market.vault}, forLiquidation=true)`）全部 multicall `allowFailure:true`、`blockTag:'latest'`、batch 8192B；单子调用失败=该仓位本代缺席（仅 warn），vault=0x0 整市场跳过。
- 清算两条路径：auto strategy（`check.isLiquidatable && effectiveShortfallUsd > BUFFER`，非 grace 中，取 10）/ `LiquidationIndex`（近似 `liqPrice = mid ± effectiveShortfallUsd/sizeInTokens`，pop 后 legacy 模式仅 worker 复核、incremental 模式入队前复核）；grace 期仓位入 `keeper:liq:grace:*`（score=graceEnd），`popExpiredGrace` 后 `admitToLiqIndex`。liqWorker 预检：`getPosition`@latest（size=0/grace 中→ack）→ `getMarket` 取 vault → 用将广播的报告字节复核 `isPositionLiquidatable`（false→ack-drop）→ 广播；**无 positionKey 时跳过全部预检**。
- ADL：`needsAdl = isAdlEnabled && shouldEnableAdl`（均全局）；候选按 PnL 排序 top-5，`sizeDeltaUsd = sizeInUsd`（合约 v0.3.2 超量 **revert `InvalidSizeDeltaForAdl` 而非 clamp**）；`shouldUpdateState` 三触发（首发 / 漂移 100bps / 5min），producer 对每个 (market,side) 独立发信号；adlWorker 两道 gate（60s 幂等 / `latestAdlAt*1000 > createdAt`）后发 `refreshLatestRecordedPrices` + `updateAdlState()` 两笔。**adlWorker.executeAdl 无任何预检**。
- 精选风险：① 近似清算价随价格重锚偏移 + funding 累计→漏触发到下个 30s tick；② grace 结束瞬间本地时钟 vs block.timestamp；③ `allowFailure` 静默漏检（Market.Props 畸形/批过大）；④ ADL 全局状态 vs 2N 逐对信号→首笔后其余靠 gate；`AdlStateUnchanged`/`AdlPnlNotPositive` 未分类→重试烧 gas；⑤ 5min resend 空转仍发 `refreshLatestRecordedPrices`；⑥ index 路径无 hysteresis→临界仓位反复 pop/ack；⑦ `syncFromStore` DEL→ZADD 非原子；⑧ `getAdlState` 单条失败→沿用 10 分钟前基线→ADL 静默停摆。

### 3.5 E · Express/Flash 中继（`entrypoints/relWorker.ts`, `domain/relay/*`, SDK `relay/*`, fx-base-app `/api/relay/*`）

- 前端 EIP-712 签名（域 `Fx100RelayRouter/1/chainId/router`，`deadline=now+1800s`，USDC permit 给 Router）→ ingress 校验（形状/deadline/permit/**恢复签名者**/approval）→ `SET NX dedup(account:userNonce)`→ `task{pending}`→`LPUSH`。relWorker：`hasTaskAdvanced`→ack；解析；上下文校验；**WNT pre-flight**（`balanceOf ≥ executionFee && allowance(Router) ≥ executionFee`，读失败放行）→ `simulateContract`（可解码 revert→terminal→`failed{userMessage}`）→ DRY_RUN→`submitted`(无 hash)→广播→`submitted{txHash}`→receipt→`executed|failed`；**receipt 超时保持 submitted 不重发、无对账**；`validateRelay` 失败→丢弃且 task 不更新。
- 合约：四函数/RelayParams/UpdateOrderParams/BatchParams 与 v0.3.2 一致；**v0.3.2 `SubaccountApproval` 新增 `slot`（SDK 未跟）**；`_validateCall` 新增 `feeToken == COLLATERAL_TOKEN`；`_payRelayFee` 用 `getSecondaryPrice(WNT)`→无 feed 且 recorded 过期→`EmptySecondaryPrice`/`MaxPriceAgeExceeded`（fork gasprice=0 时被掩盖）。
- 精选风险：deadline 1s 边界；同 nonce 不同 payload 被吞；reaper 重入后 `InvalidUserDigest` 误标 failed；keeper ETH 不足→transient→用户看到"余额不足"文案；前端与 keeper `KEYSPACE_VERSION`/chainId 不一致→队列永不消费；RELAY 回退共用 `KEEPER_PRIVATE_KEY`→跨进程 nonce 冲突。

---

## 4. 合约绑定核对结论（F，按 CURRENT.json 的 primary 与 comparison 两个基线；下文版本号为 @v0.3.2 / @v0.3.1 快照）

| 类别 | 结论 |
|---|---|
| Handler 调用签名 ×5 / `SetPricesParams` | 一致（`updateAdlState()` 无参——keeper 正确） |
| Reader ×7（含 `isPositionLiquidatable(..., Market.Props, prices, shouldValidateMinCollateralUsd, forLiquidation)`） | 一致；v0.3.2 `13880f2` 只改内部语义（按清算价规则 + `balanceWasImproved` 费档、禁负点差） |
| EventLog2 / OrderCreated 字段（5 address + 11 uint + 4 bool + key + dataList）/ PositionIncrease·Decrease 字段 | 一致（`isFrozen` 不 emit 已注明；v0.3.2 `dynamicSpread` 改 intItems，keeper 不读） |
| 角色哈希 / RoleStore | 一致（与 v0.3.1 部署导出逐一相等） |
| `OrderType` 0..6 / isMarket(0,2) / isTrigger(1,3,4,6) / 触发不等式（含等号）/ 选侧 | 一致 |
| DataStore keys | 一致；例外 `minPnlFactorAfterAdlKey`（SDK 复合键 vs 合约全局常量，两版同）→ keeper 读 0，不进决策 |
| 合约地址 84532 | == v0.3.1 `deployed_addresses.json`；无 v0.3.2 地址（与 CURRENT.json 一致） |
| Oracle provider | keeper 全 token `ChainlinkOracleDataStreamProvider`；fork 上 USDC 为 PriceFeedProvider → **环境级不一致**（§7） |
| 错误名 | 7 个死条目；v0.3.2 改名/新增（`EmptyTokenTransferGasLimit`、`MaxSubaccountSlotsExceeded`、`DuplicateSubaccount`…）SDK ABI 解不出；10+ 个会碰到却未分类 |
| Oracle 时间约束（期望值推导依据） | `minTs ≥ updatedAtTime`（非市价另 `≥ validFromTime`）；Market* `maxTs ≤ updatedAtTime+REQUEST_EXPIRATION_TIME`；LimitDecrease/StopLoss `≥ max(orderUpdatedAt, positionIncreasedAt)`；Liquidation `≥ max(positionIncreasedAt, positionDecreasedAt)`；ADL `maxTs ≥ LATEST_ADL_AT`；`price.ts + MAX_ORACLE_PRICE_AGE ≥ block.ts`；`maxTs−minTs ≤ MAX_ORACLE_TIMESTAMP_RANGE`。fork 快照：120s / 60s / 60s / `MAX_RECORDED_PRICE_AGE` 86400s |
| v0.3.1→v0.3.2 影响 keeper 行为 | 清算谓词边界位移；动态点差有符号并夹紧；资金费逐仓结算；Relay `feeToken==COLLATERAL_TOKEN` + `SubaccountApproval.slot`（**子账户中继必失败**）；错误名变化 |

---

## 5. 现有单测覆盖与缺口

已覆盖（47 文件 607 用例）：纯函数与小组件——`minMaxPriceSelector / priceBuffer / priceRecorder / triggerIndex / triggerFilter(legacy) / oracleWindow / orderAge / recordedPriceRefresh / enqueue / pollingCursor(decode 被 stub) / eventProviderSelection / onchainAllOrdersSweep / deadOrderCache / blockPersistence / workerRunner / queueSafety / transactionReconcile / errors / submitGate / wallet / validators / serialization / heartbeat / chainEnv / log / priorityQueue / strategies.adl / strategies.liquidation / liquidationIndex(+Incremental) / marketState / adlStateGate / adlLocalPnl / positionEventCache / positionReconciler / collateralInvalidation / marketConfig / relay.{classify,context,funding,queueKeys,taskStore,userMessages} / preconf`。

**无单测的主流程**（组件级/集成级需补）：

| 模块 | 缺口 |
|---|---|
| `ordWorker.executeOrder` | 步序、trigger-not-crossed 重索引+ack、stale 重试、dry-run、空 params、`executePriceRefresh` 的 createdAt 比较与降级 |
| `producer` | `handleOrder` 分流 + expiry gate、`onSlotsWritten` 触发单 pop→enqueue（含 pop 后失败）、`verifyLiquidationCandidate`/`drainExactAudits`/grace→admit→pop 联动、adl-state 信号生成 |
| `orderEventListener` / `hybridProvider` / ws `onLogs` / `manualProvider` / `eventParser.parseOrderCreatedEvent` | 双投递、降级、解码/过滤 |
| `liqWorker` 预检、`adlWorker` 两道 gate 与双 tx、`store.refresh` 全流程（allowFailure 计数/旧代保留/legacy=false） | |
| `relWorker.executeRelay`、`extractRequiredWnt`、`resolveRelayCall`、`validateSignedRelay`、ingress dedup | |
| 测试基建 | `_memoryRedis` list 命令为桩、无 TTL；runner 测试内置 fake Redis 无 TTL → 锁/marker/journal 过期、reaper 真实回收、Upstash 反序列化差异未覆盖 |
| 合约漂移 | 无任何"keeper/SDK 绑定 vs 合约源码"自动化比对 |

---

## 6. 已知缺陷与需求关联

| 来源 | 状态（develop c670d007） | 说明 |
|---|---|---|
| OC-28 keeper 区块游标只按 chainId 隔离（Notion Bugs，Open/Medium） | **未修**：`blockPersistence.ts:26` key 无 fork 标识；`computeStartBlock`（:123）不与链头比较；`pollingProvider.ts:122` `currentBlock <= lastProcessedBlock` 永久 early-return | 复测四条见 Notion；Gordon 测试分支有 `forkResetCursor.ts` |
| OC-31 `KEEPER_REDIS_MODE=local` 无效（Open/High） | **未修**：`apps/keeper` 零处引用；`redisClient.ts:264-271` 只看 `KV_REST_API_URL/TOKEN` | workaround：起进程时置空两个 KV 变量 |
| Notion《Recorded Price Keeper——定时刷新 latestRecordedPrices》(08-01) | 已实现为 price-refresh 队列（§3.2） | 需求→实现映射完整 |
| Notion《FX100 新增 Market 上线手册（合约+前端+Keeper 全链路）》(08-01)、《Oracle 清单 Base Sepolia+主网》(08-13)、《已上线资产清单》(08-05) | 环境事实来源：24 真实资产 + USDC 全 Data Stream；market 0~26 + FXMOCK#27 | 决定 Service Keeper 可用市场 |
| Notion《Keeper 故障应急预案：紧急 Permissionless 执行开关》(08-17)、《参数同步/Keeper 治理机制》(08-13)、《Dev 中心化服务的监控和备份》(08-10) | 需求/提案，未在 develop 代码中体现 | 仅作测试范围边界参考 |
| `TestCase/config/v0.3.1/tx-fork/260812/parameters.*` | tx-fork(99911) 2026-08-12 块 45389192 的快照（原 `deploymentName=base_sepolia_v0.3.1_260729`，含 FXMOCK#27、USDC→PriceFeed provider） | 已与真实 Base Sepolia 快照分目录；CURRENT.json 的 base-sepolia 参数现指向 84532 / block 45389410 |

---

## 7. 测试环境前提与可测性（先决条件）

| 前提 | 现状 | 影响 / 处置方向 |
|---|---|---|
| **链 ID 登记** | SDK 仅 8453/84532/99917/99918；tx-fork 99911 / oracle-fork 99912 / time-fork 99913 不在；develop 的 99917 = v0.2.0 地址 + 2 市场 | Service Keeper 不能以 `KEEPER_CHAIN_ID=99911` 启动（地址/市场/feed/provider 全解析失败）。可选：a) 真 Base Sepolia 84532；b) 新建 chainId=99917 的 v0.3.1 fork + 使用 Gordon 分支的 SDK 99917 补丁（或在本地 SDK 补齐 99917/99911 登记——属被测仓改动，需登记）；c) 所有地址用 env 覆盖，但 `MARKETS`/feedId 仍需 SDK |
| **Oracle provider** | keeper 全 token → DataStream provider；tx-fork/oracle-fork 的 USDC/FXMOCK/MSOL 已是 PriceFeed provider（Mock 初始化） | 现有两 fork 上 Service Keeper 含 USDC 的 executeOrder/ADL/清算必 revert `InvalidOracleProviderForToken`。Service Keeper 需真 Base Sepolia 或**未做 Mock 初始化的新 fork**；Inline Keeper 用例（SCN-009/010/070）的 PASS 不能外推到 Service Keeper |
| **Chainlink 凭证** | `CHAINLINK_API_KEY/SECRET`；84532 用 `CHAINLINK_NETWORK=testnet` feed 集；FXMOCK 无 Data Stream feed | Mock 市场无法被真实 keeper 定价；只能用真实资产市场（0~26） |
| **Redis 隔离** | OC-31：`KV_REST_API_*` 存在即走 Upstash；keyspace 前缀 `v0.3.2:<chainId>` 不含 fork 标识 | 多 session/多 fork 共用远程 Redis 会互抢队列、互污染游标；测试必须本机 Redis 或独立实例 + 起前清 `<ver>:<chain>:keeper:*` |
| **DRY_RUN** | 默认 true | 真实执行必须显式 `KEEPER_DRY_RUN=false`；dry-run 路径本身也是测试对象（ack 语义） |
| **角色** | ORDER/ADL/LIQUIDATION_KEEPER 三角色已授予（v0.3.1 部署）；Service Keeper 私钥由 `E2E_KEEPER_ENV_FILE` 注入，禁止入库 | relWorker 需 ETH + WNT + `WNT.approve(Router)` |
| **链时间 vs 宿主时钟** | 过期闸、grace 判定、price-refresh 比较均用 `Date.now()` | Tenderly fork 若做过 `increaseTime`/时间滞后，将系统性改变 keeper 行为（time-fork 专项需设计） |
| **v0.3.2 环境** | 无部署（CURRENT.json `admission: NOT_READY`） | v0.3.2 相关行为只能在 v0.3.2 部署/fork 后验证；子账户中继 SDK 漂移可先以静态对照报告记录 |
| TestCode 现状 | `E2E_KEEPER_MODE=service` 占位，无 Service Keeper 编排；`KeeperController` 接口只有 Inline | Service Keeper 专项需新增：进程拉起/健康检查/队列观测/日志采集/清理 |

---

## 8. 建议测试分层与范围（供下一步测试设计）

**L1 单元/组件（可直接在 vitest 内补，优先级高、成本低）**
- 错误分类：`401 Unauthorized`/`expired` 误命中；未映射合约错误（`AdlStateUnchanged`、`InvalidOracleProviderForToken`、`MaxPriceAgeExceeded`、`EmptySecondaryPrice`）的归类期望；v0.3.2 新错误在 SDK ABI 再生前的 `UnknownRevert` 表现。
- 价格/触发：非 18 位 decimals（USDC 6 位）scale；等号边界；score 截断边界；`adl` 侧；V4 报告。
- 游标：OC-28 复测①②③（游标 > 链头自愈、续上、不退化）；OC-31 复测①~⑤。
- runner：锁过期后 DEL 非自己锁；processing 无 identity 滞留；buffer-gap 与普通预算互蚀；坏 JSON 乒乓；Upstash 反序列化 `LREM` 失配（用真 Redis 或更真实的 fake）。
- ordWorker/liqWorker/adlWorker/relWorker 主流程：以注入 fake client + 内存 Redis 的组件测试覆盖 §5 缺口。

**L2 集成（真实 keeper 进程 + Redis + fork/RPC，Service Keeper 专项环境）**
- 市价单全链路（OrderCreated→队列→executeOrder→OrderExecuted），含 dry-run/live 两态、分片 `ordWorker.0/1` 并发互斥、重启回放。
- 触发单：四类×多空越线/未越线/恰好相等；pop→trigger-not-crossed→re-index→再 pop；`validFromTime` 未来；buffer 空。
- 过期闸：`updatedAtTime+120s±grace` 三点；producer 闸 vs worker 闸；fork 时间滞后场景。
- 清算：临界仓位（shortfall≈0）、grace 进出、近似价 vs 真值、两条路径并发（锁互斥）、allowFailure 漏检注入（坏 vault）。
- ADL：`isAdlEnabled` 开/关、`shouldEnableAdl` 翻转、2N 信号去重、`InvalidSizeDeltaForAdl`（执行前减仓）、`AdlPnlNotPositive`。
- price-refresh：`latestRecordedPrices` 过期/新鲜两态、部分 token 无价降级。
- 中继：create/cancel/update/batch、WNT 不足、allowance 不足、deadline 边界、同 nonce 重复、receipt 超时、`EmptySecondaryPrice`（gasprice≠0）。
- 故障注入：Redis 断连、RPC 限流/断连、Chainlink 401/429、ws 断线（hybrid 降级）、SIGTERM 在途、时钟偏移。
- 心跳/可观测：heartbeat 字段与 TTL、metrics 计数与告警可见性。

**L3 版本/漂移**
- v0.3.2 部署后：清算谓词边界回归、点差夹紧下执行价、relay `feeToken` 校验与子账户 `slot`（SDK 再生后）、错误名再生。
- 建议新增"绑定漂移哨兵"脚本：比对 SDK ABI 函数/事件/错误名 vs 合约 `out/` 或 `src/`，作为换版本的 DoD。

---

## 9. 文档 vs 代码不一致汇总（`IMPLEMENTATION.md` / 源码注释，写断言时以代码为准）

| # | 文档说法 | 代码事实 |
|---|---|---|
| 1 | runner 顺序 lock→markProcessing；成功后 ack + release | 先 mark 再 lock；finally 先 DEL lock 再 ack（workerRunner.ts:288-303,414-425） |
| 2 | 错误分类"子串匹配" | 先 ABI 解码；已解码未映射→unknown，不再子串（errors.ts:216-228） |
| 3 | gap 走 worker retry budget(1) | 专用 gap 预算 `max(10,maxRetries)`×5s（workerRunner.ts:242） |
| 4 | 超时只 requeue 不耗预算 | 20 次/3 次 absent 上限后 abandon 进普通预算（transactionReceipt.ts:217-231） |
| 5 | 订单窗口 `[max(validFromTime, now−WINDOW), now]` | 还以 `updatedAtTime` 为下界（oracleWindow.ts:30） |
| 6 | recorder 独立 `setInterval`、仅 index/collateral | `setTimeout` 链，含 long/short token |
| 7 | priceBuffer 跳过重复 observationsTimestamp | `>=` 即丢，乱序旧报告也丢 |
| 8 | 过期闸两处（sweep + ordWorker） | producer `handleOrder` 对所有 provider 再加一道（producer.ts:1320），且 boot 读一次不刷新 |
| 9 | onchain 扫 `AccountOrderList` | 扫全局 `ORDER_LIST` |
| 10 | ws 用 `watchContractEvent` | `watchEvent` 手工比对 topics[1] |
| 11 | auto 清算按 `shortfallUsd`(MarginInfo) | 用 `LiquidationCheck.effectiveShortfallUsd`；MarginInfo 未用 |
| 12 | 合约会 clamp `sizeDeltaUsd` | v0.3.2 `createAdlOrder` 超量 revert `InvalidSizeDeltaForAdl` |
| 13 | ADL 状态按 (market,side)、pnlFactor 有符号 | `getAdlState`/`isAdlEnabled`/`latestAdlAt` 全局 uint |
| 14 | ROLE 仅 ORDER/ADL/LIQUIDATION；"viem nonce manager per-process" | 含 RELAY；无 nonceManager |
| 15 | 中继 key 无前缀、`QueuedRelay{payload}`、zod/KNOWN_SELECTORS、`_handleRelayFee`、`getEmptyOracleParams`、Router `0x20a6…` | 全带 `v0.3.2:<chain>:`；`dataJson`；不存在；实为 `_payRelayFee`；Gelato 遗留不用；FORK v0.2 地址 |
| 16 | `KEEPER_ADL_STATE_IDEMPOTENCE_WINDOW_MS`、`*_EXECUTION_INTERVAL_MS`、`KEEPER_ONCHAIN_*` | 直接 `process.env`/未入 env.ts 与文档表（违反自述约定） |
| 17 | `BALANCE_INTERVAL=0 回退默认` | 变为每拍刷新 |
| 18 | 测试数 558 / 285 | 607 |
| 19 | `eventParser.ts:296` topics 布局、`blockPersistence.ts:8`/`keyspace.ts:41` 前缀示例、`index.ts:81` 支持链列表 | 与 ABI 不符（仅 manualProvider 自洽）；`v0.3.0` 陈旧；漏 99917 |
| 20 | PLAN 不变量 7/8/12、"ADL worker 精确预检" | 未实现（PriorityQueue 仍非原子 pop；adlWorker 无预检） |

---

## 附录 A · env 配置分组（名称 / 默认；全表见各模块报告与 `chain/env.ts`）

- 安全/链：`KEEPER_DRY_RUN` true · `KEEPER_CHAIN_ID` 84532 · `KEEPER_HTTP_RPC_URL`(别名 `KEEPER_RPC_URL/RPC_URL`) · `KEEPER_WSS_RPC_URL` · `KEEPER_PRECONF_ENABLED` false · 地址覆盖 `KEEPER_EVENT_EMITTER_ADDRESS / ORDER|ADL|LIQUIDATION_HANDLER_ADDRESS / DATASTORE_ADDRESS / ORACLE_ADDRESS / READER_ADDRESS / REFERRAL_STORAGE_ADDRESS / ROLE_STORE_ADDRESS(默认 DataStore)`
- 事件：`KEEPER_EVENT_PROVIDER` auto · `KEEPER_POLL_INTERVAL_MS` 5000 · `KEEPER_REWIND_BLOCKS` 100 · `KEEPER_ONCHAIN_SCAN_INTERVAL_MS` 30000 · `KEEPER_ONCHAIN_{MULTICALL_BATCH_SIZE 100, KEYS_BATCH_SIZE 1000}` · `KEEPER_DEAD_ORDER_CACHE_TTL_SECONDS` 3600 · `KEEPER_ORDER_EXPIRY_GRACE_MS` 5000
- 队列/租约：`KEEPER_LOCK_TTL_SECONDS` 180 · `KEEPER_PROCESSING_TTL_SECONDS` 300 · `KEEPER_REAPER_INTERVAL_MS` 10000 · `KEEPER_REAPER_MAX_SCAN` 200 · `KEEPER_FAST_DRAIN_ENABLED` true · `KEEPER_TX_RECEIPT_TIMEOUT_MS` 60000 · `KEEPER_TX_RECONCILE_MAX_ATTEMPTS` 20 · `KEEPER_RPC_POLLING_INTERVAL_MS` 500 · （代码常量）`MAX_RETRIES` 1 / `RETRY_DELAY_MS` 5000
- 价格：`CHAINLINK_BASE_URL / API_KEY / API_SECRET / CHAINLINK_NETWORK`(testnet) · `KEEPER_PRICE_BUFFER_{DEPTH 15, WINDOW_MS 10000, SAFETY_MS 2000, FEED_SCOPE active-markets}` · `KEEPER_PRICE_RECORDER_INTERVAL_MS` 1000 · `KEEPER_ORACLE_FETCH_CONCURRENCY` 8 · `KEEPER_PRICE_REFRESH_{ENABLED true, FRACTION 0.25, ID_BUCKET_MS 300000}` · `KEEPER_RECORDED_PRICE_MAX_AGE_MS`
- producer/市场状态：`KEEPER_PRODUCER_INTERVAL_MS` 30000 · `ADL_STRATEGIES / LIQUIDATION_STRATEGIES` auto · `KEEPER_STATE_{MARKETS_REFRESH_MS 600000, POSITIONS_LIST_PAGE 500, POSITIONS_BATCH 100, POSITIONS_READ_CONCURRENCY 4}` · `KEEPER_MULTICALL_BATCH_BYTES` 8192 · `KEEPER_LEGACY_MARKET_STATE_SCAN_ENABLED` true · `KEEPER_MARKET_STATE_INDEXER_ENABLED` false · `KEEPER_POSITION_EVENT_*` · `KEEPER_INCREMENTAL_LIQ_SELECTION_ENABLED` false · `KEEPER_ADL_TOP_M_MULTIPLIER` 3 · `KEEPER_COLLATERAL_INVALIDATION_*` · `KEEPER_EXACT_AUDIT_RETRY_MS` 15000 · `KEEPER_ADL_STATE_CONCURRENCY` 4 · `KEEPER_ADL_STATE_IDEMPOTENCE_WINDOW_MS` 60000 · `FX100_AUTO_ADL_{MAX_CANDIDATES_PER_TICK 5, ID_BUCKET_MS 60000, RESEND_MS 300000, PNL_FACTOR_DRIFT_BPS 100}` · `FX100_AUTO_LIQ_{MAX_CANDIDATES_PER_TICK 10, ID_BUCKET_MS 60000, SHORTFALL_BUFFER_USD 0}`
- 钱包/心跳/中继：`KEEPER_PRIVATE_KEY(S)` · `<ORDER|ADL|LIQUIDATION|RELAY>_KEEPER_PRIVATE_KEY(S)` · `KEEPER_WALLET_INDEX` · `KEEPER_HEARTBEAT_{INTERVAL_MS 10000, BALANCE_INTERVAL_MS 300000}` · `KEEPER_INSTANCE_ID` · `KEEPER_RELAY_QUEUE_INTERVAL_MS` 250 · `KEEPER_RELAY_TASK_TTL_SECONDS` 3600
- Redis：`KV_REST_API_URL/TOKEN`（存在即 Upstash）否则 `REDIS_HOST/PORT`；`KEEPER_REDIS_MODE` **无效**（OC-31）

## 附录 B · 参考路径
- 被测：`Github/fx100-apps@develop/apps/keeper/`（`IMPLEMENTATION.md` 章节定位见本文引用）；SDK `Github/fx100-apps@develop/packages/sdk/src/{configs,utils,relay,abis/fx100}`
- 合约：`Github/fx100-contracts@release-v0.3.2/src/{exchange,adl,order,oracle,reader,constants,router/relay}`；对比 `…@release-v0.3.1`
- 现有 E2E：`TestCode/`（Inline Keeper：`src/scenarios/scn-0xx-runner.ts` 自建 `executeOrder` calldata，`data:['0x','0x']` + PriceFeed provider）；`TestCode/docs/05-Market-Bundle与Keeper执行模式.md`
- 需求/缺陷：`Docs/Gordon-Notion需求文档归档/`（OC-28、OC-31、Recorded Price Keeper、新增 Market 上线手册、Oracle 清单、已上线资产清单）

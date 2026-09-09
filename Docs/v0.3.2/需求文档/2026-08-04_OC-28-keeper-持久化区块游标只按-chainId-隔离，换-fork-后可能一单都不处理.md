# OC-28 keeper 持久化区块游标只按 chainId 隔离，换 fork 后可能一单都不处理

> Notion 页面：[原文](https://app.notion.com/p/3b23d7873f2c81bc9311e6f54c8589a3)
> 作者：Gordon (chao@aladdin.club)
> 创建时间：2026-08-04
> 最后编辑：2026-08-06
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
| Assignee | zhou |
| Link | https://github.com/AladdinDAO/fx100-apps/commit/f66d2434 |
| 创建时间 | 2026-08-04T16:11:41.127Z |
| 复测 | ① 在 A fork 上跑一会让游标落地，切到区块更高的 B fork，重启 keeper：应能正常处理订单（而不是首轮扫十几万区块）；② 切到区块更低的 fork（或人为把游标设成高于链头），重启 keeper：应自动丢弃脏游标冷启动，而不是永久 early-return 一单不处理；③ 同一 fork 内重启 keeper：游标仍应续上，不能因为修这个问题而退化成每次冷启动；④ 用 forkResetCursor.ts（不带 --reset）可交叉验证游标与链头关系。 |
| Text | 见下文 |

## 描述（Text 属性）

【背景】queue-durability 那次改动（develop 47c4bf18）让 pollingProvider 把区块游标持久化到 Redis，这本身是对的 —— 重启能续上而不是跳过空档。问题在 key 的隔离粒度。

【问题】key 由 blockPersistenceKey(chainId, emitter) 生成：
  <KEYSPACE_VERSION>:<chainId>:keeper:events:lastBlock:<emitter>
  实测值：v0.3.2:99917:keeper:events:lastBlock:0x8f00ebf8f5...
只按 chainId + emitter 隔离。但我们的测试工作流是【在同一 chainId 上反复换 Tenderly fork】—— 每个 fork 都报 chainId 99917、用同一个 EventEmitter 地址，所以所有 fork 共用同一个游标，而各 fork 的区块高度彼此毫无关系。Redis 是本机的，换 fork 也不会自动清。

【两种坏法】
① 游标 ≥ 新 fork 头部 → pollingProvider（src/providers/pollingProvider.ts:122）的
     if (currentBlock <= this.lastProcessedBlock) return;
   永远 early-return。**keeper 表面健康、日志正常，但一单都不会处理。**
   这个症状与之前排查过的队列丢单一模一样，病因完全不同，极难定位。
   什么时候会发生：从更早的真链快照切 fork，或 Tenderly 侧区块编号不单调时。
② 游标 ≪ 新 fork 头部 → 首轮用一次 eth_getLogs 扫整个空档。
   实测同一天切的两个 fork 相差 137,352 个区块（44,892,073 → 45,029,425），
   很可能很慢或被 RPC 限流。computeStartBlock 还会再往前 rewind 100 块。

【建议】key 里加入 fork 标识，或提供显式 reset 开关。可选方案：
  a) key 里带 RPC URL 的 hash（fork 换了 URL 就换，最贴合实际；同一 fork 重启仍能续上）；
  b) 启动时读一次链上 head，若持久化游标 > head 则判定为「换了链」，自动丢弃并冷启动
     —— 这条能同时兜住①，且不需要任何额外配置，我倾向这个；
  c) 提供 KEEPER_RESET_CURSOR=true 环境开关。
（b）成本最低且能自愈，建议至少先做它 —— 游标高于链头在任何正常场景下都不合法，直接当脏数据丢弃是安全的。

【测试侧已自行缓解，不阻塞你们】
测试分支加了 apps/keeper/scripts/forkResetCursor.ts：对比持久化游标与当前 fork 头部，给出 fatal/slow/ok 判定，只在 --reset 时删除。它复用 keeper 自己的 blockPersistenceKey() 拼 key 而不是手写 pattern，避免 KEYSPACE_VERSION 变动后对不上。已加入换 fork 操作清单第 2 步。
参考实现：AladdinDAO/fx100-apps @ feat/liquidation-protection-ux-v031，commit f66d2434。

【顺带确认：queue-durability 那次改动的其余部分对我们环境是安全的】
- KEEPER_LOCK_TTL_SECONDS 默认 90→180 + 新增开机断言 assertLeaseOutlivesReceiptWait：我们 env 未显式设置这些值，默认组合满足断言（adlWorker 2×60s + 15s 余量 < 180s 锁 < 300s processing TTL），不会拒绝启动。
- auto 改为解析成 hybrid：我们 env 固定 EVENT_PROVIDER=polling，不受影响。
- keeper 全量单测 482 个（33 文件）在测试分支合并后本地全通过。

## 正文

<!-- Notion 页面为空白页，无正文内容 -->

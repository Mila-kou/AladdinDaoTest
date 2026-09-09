# OC-31 KEEPER_REDIS_MODE=local 对 apps/keeper 完全失效（no-op），照 env 起进程会连远程 Upstash

> Notion 页面：[原文](https://app.notion.com/p/3b93d7873f2c8134a806f0e1c0c97573)
> 作者：Gordon (chao@aladdin.club)
> 创建时间：2026-08-11
> 最后编辑：2026-08-11
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 🐛 Bugs（数据库）
> 类型：缺陷/需求（Bugs 库）
> 状态：Open / High

## 属性

| 属性 | 值 |
|---|---|
| Status | Open |
| Priority | High |
| Product | FX100 |
| Reporter | Gordon |
| Assignee | zhou |
| Link | https://github.com/AladdinDAO/fx100-apps/blob/develop/apps/keeper/src/infra/redisClient.ts#L252 |
| 创建时间 | 2026-08-11T03:01:56.233Z |
| 复测 | ① 设 KEEPER_REDIS_MODE=local 且 KV_REST_API_URL/TOKEN 均有值时，启动 apps/keeper 任一 worker，日志应打印 [Redis] Using local Redis at 127.0.0.1:6379；② 不设 KEEPER_REDIS_MODE、KV_* 有值时，仍走 Upstash（不破坏生产行为）；③ KEEPER_REDIS_MODE=local 但 KV_* 未设时走本机（与现状一致）；④ createRedisClient() 上方的 Priority 注释已同步更新，不再与实现矛盾；⑤ 若实现了配置漂移 warn，验证它在「mode=local 但走了 Upstash」时确实输出。 |
| Text | 见下文 |

## 描述（Text 属性）

【发现者】keeper 测试 session（2026-08-11），我已独立复核确认。

【问题】环境变量 KEEPER_REDIS_MODE 在现在实际部署的 apps/keeper 包里【一次都没被引用】，设成 local 不产生任何效果。

复核证据：
1. grep 全 apps/keeper/：KEEPER_REDIS_MODE 零处引用。
2. apps/keeper/src/infra/redisClient.ts:252 的 createRedisClient() 判定逻辑只有一条：
     const upstashUrl = process.env.KV_REST_API_URL;
     const upstashToken = process.env.KV_REST_API_TOKEN;
     if (upstashUrl && upstashToken) { console.log('[Redis] Using Upstash Redis'); ... }
   两个变量都有值就走 Upstash，不看任何 mode 变量。函数上方的注释也只写了这两级优先级。
3. forceLocal = KEEPER_REDIS_MODE === 'local' 的判断只存在于【旧版】
   apps/fx-base-app/scripts/keeper/redisClient.ts:115,123 —— 那是 v0.3.0 老 recipe 用的嵌入式 keeper 脚本，
   不是现在跑的 apps/keeper 包。重构成独立包时这段逻辑丢了，但变量名还留在 env 里。
4. apps/fx-base-app/scripts/.env 里 KV_REST_API_URL / KV_REST_API_TOKEN 【两个都有值】。

【后果】任何人照现有 .env 直接起 apps/keeper 的 producer/ordWorker/adlWorker/liqWorker/relWorker，
都会连到远程 Upstash 而不是本机 Redis，而 env 里赫然写着 KEEPER_REDIS_MODE=local ——
给出的是错误的安全感，不逐行读源码根本发现不了。

多 session / 多人并行测试时，这意味着大家共用同一个远程队列、区块游标和去重标记：
一方的订单可能被另一方的 worker 抓走执行（环境不对则失败，且 MAX_RETRIES=1 失败即 ack 丢弃），
换 fork 清游标（OC-28）也会互相影响。排查成本极高，因为症状是「订单排队后消失」，
与真正的队列 bug 完全无法区分。

【建议修复】在 createRedisClient() 里补回和旧版一致的判断，例如：
     const forceLocal = (process.env.KEEPER_REDIS_MODE ?? '').toLowerCase() === 'local';
     if (!forceLocal && upstashUrl && upstashToken) { ...Upstash... }
     // 否则走本机
并把函数上方那段「Priority: 1. KV_* 存在 → Upstash 2. 否则 → local」的注释同步更新，
否则注释本身也是错的。
另外建议：若 KEEPER_REDIS_MODE 被设成了 local 但仍走 Upstash（即修复前的状态），应在启动日志里 warn，
让这种配置漂移可被发现。

【当前 workaround（测试环境已采用）】起进程时在 shell 里把两个变量置空，不改文件：
     KV_REST_API_URL= KV_REST_API_TOKEN= <启动命令>
验证生效看启动日志必须打印 [Redis] Using local Redis at …，而不是 [Redis] Using Upstash Redis。

【一个容易误判的点，供参考】排查中一度以为这会导致「和开发者真链 keeper 共用队列」。
核实后不成立：测试分支 scripts/.env 用的是 sunny-snapper-8872.upstash.io（我们自己的实例），
开发者那份是 happy-mustang-76475.upstash.io，2026-08-02 同步 env 时刻意没采用他们的。
所以风险不是跨团队串号，而是我们自己多 session 之间互相干扰 —— 但要修的东西一样。

## 正文

<!-- Notion 页面为空白页，无正文内容 -->

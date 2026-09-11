# OC-26 标准钱包路径取消订单永远卡在 Cancel Submitted（Flash 路径正常），且取消弹窗红字红底违反配色分级

> Notion 页面：[原文](https://app.notion.com/p/3b23d7873f2c81ada92fe14db41e3d98)
> 作者：Gordon (chao@aladdin.club)
> 创建时间：2026-08-04
> 最后编辑：2026-08-05
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 🐛 Bugs（数据库）
> 类型：缺陷/需求（Bugs 库）
> 状态：Closed / High

## 属性

| 属性 | 值 |
|---|---|
| Name | OC-26 标准钱包路径取消订单永远卡在 Cancel Submitted（Flash 路径正常），且取消弹窗红字红底违反配色分级 |
| Status | Closed |
| Priority | High |
| Product | FX100 |
| Reporter | Gordon |
| Assignee | Fefe |
| Link | https://github.com/AladdinDAO/fx100-apps/blob/develop/apps/fx-base-app/src/lib/toasts/orderToasts.ts#L555 |
| 创建时间 | 2026-08-04T09:23:38.533Z |
| Text | 见下文「描述（Text 属性）」 |
| 复测 | 见下文「复测（复测属性）」 |

## 描述（Text 属性）

OC-23 的后续验收发现两个问题，一个功能一个视觉。

════════ 一、标准钱包路径的取消 toast 永远不升级（功能，优先） ════════

【现象】
- Flash（relay）取消：toast 从 Cancel Submitted → Signed/Relayed → Order Canceled，正常。
- 自己发起交易（Standard 钱包签名）取消：一直停在「Cancel Submitted / Waiting for on-chain confirmation…」，8 秒后 toast 自行消失，从头到尾没有成功提示。但链上其实已经取消成功了。

【根因】两条路径用了两个完全不同的 toast 函数，只有 Flash 那个有生命周期。
- src/components/features/trade/OrderRecords.tsx:223-233
    if (result.txHash)            toastCancelSubmitted(...)        ← 标准路径
    else if (result.relayTaskId)  toastFlashRelaySubmitted(...)    ← Flash 路径
- toastFlashRelaySubmitted（orderToasts.ts:429）拿到了 toast 的 update 句柄，靠 onResolved 回调把同一条 toast 原地升级到最终态。文件里 :426 的注释也写明它是为「cancel/update 没有 OrderTrackingModal、生命周期 watcher 也不跟踪」这个场景设计的。
- toastCancelSubmitted（orderToasts.ts:555）是一次性 toast：只有 title + 一行 pending 状态 + duration 8000，**没有任何后续升级逻辑**，不等回执也不更新。

【最关键的一点：回执其实已经等到了，只是没回传】
src/hooks/trade/useCancelOrder.ts:163 已经在 await publicClient.waitForTransactionReceipt({ hash: txHash })。也就是说前端明确知道取消什么时候成功，只是这个结果没有传回给 toast 去更新。所以这不是「拿不到状态」，是「拿到了但丢掉了」，改动量很小。

【建议改法】
让标准路径复用 Flash 路径同一套 update 机制：toastCancelSubmitted 也返回 update/dismiss 句柄（或直接改成接受 onResolved 回调），把 useCancelOrder 里 waitForTransactionReceipt 的结果接上去，成功升级为 Order Canceled、失败升级为错误态。两条路径最终态的视觉应当一致 —— 用户不该从 toast 行为上感知自己走的是 Flash 还是标准路径。
另外 duration 8000 对标准路径偏短：钱包签名 + 出块经常超过 8 秒，toast 会在结果出来之前就消失。建议未 resolve 前用 ORDER_PENDING_DURATION_MS（Flash 路径用的就是这个），resolve 后再改成 ORDER_RESOLVED_DURATION_MS。

════════ 二、取消弹窗的警告框红字红底（视觉规范） ════════

【现象】CancelOrderDialog.tsx:165-169 的警告框：
    bg-destructive/10 + border-destructive/20 + text-destructive
红字配红底，对比度低；而且整个弹窗已经有三处红：标题的 AlertTriangle 图标、这个警告框、Confirm Cancel 按钮 —— 三个红互相竞争，反而没有重点。

【更根本的问题是语义用错了】
这段文案（「取消后需要重新下单」）是在说明后果，不是报错。红色/destructive 应当留给两件事：真正发生的错误，以及破坏性动作按钮本身。现在把它用在说明性文案上，导致同一个弹窗里 errorMessage（:181-184，也是 text-destructive）和这段说明长得一样 —— 真出错时用户分不出来。

【建议：三级配色，且项目里已有现成 token】
就在这个警告框下面 12 行，OC-13 的提示（:174-178）用的是
    bg-amber-500/10 + border-amber-500/30 + text-amber-500
说明项目已有可用的 caution 分级。建议明确成三级：
  · 中性/muted（bg-muted/border-border/text-muted-foreground）→ 后果说明。本条警告框应该用这一级：「不可撤销、需重新下单」属于告知，不是危险。
  · amber → 需要注意的告警。保留给 OC-13 那种情况（取消功能被暂停 → 资金被锁，确实值得警示）。
  · destructive/红 → 真实错误 + 破坏性动作按钮。
注意：本项目 text-warning / border-warning 未定义（等于白色 no-op），琥珀色一律写 amber-500。

【顺带一个易误操作点】
弹窗底部两个按钮：左边是 t('common.cancel') = 「Cancel」，右边是「Confirm Cancel」。在一个标题就叫 Cancel Order 的弹窗里，「Cancel」到底是放弃撤单还是执行撤单，语义是歧义的，容易点错。建议左键改为「Keep Order」/「保留订单」这类明确表达「什么都不做」的文案。右键 variant=destructive 是对的，保持。

## 复测（复测属性）

【已验证关闭 2026-08-05】develop edd1ea11 "modify toast logic" 两半都修了。
一、标准钱包路径 toast 卡住 —— 已修：toastCancelSubmitted 从返回 void 改为返回 CancelToastHandle，带 resolve({success, txHash, error})，标准路径现在原地升级同一条 toast，不再 8 秒静默消失。抽成了 lib/orders/cancelWithLifecycle.ts 并配单测；成功/失败两条路径都会 resolve；且在 await 回执【之前】先注册抑制 key 防竞态（OrderCancelled 事件可能比回执先到）——这一层本单没提，是他们额外做的。CancelToastHandle 的接口注释明确写了目标：最终态视觉与 Flash relay toast 一致，用户分不出走的哪条路径，正是本单的要求。
二、弹窗红字红底 + 按钮歧义 —— 已修：说明性文案从 bg-destructive/10 + text-destructive 改为 bg-muted/50 + border-border + text-muted-foreground，并留了注释记录三级分工（中性=后果说明 / amber=需注意告警(OC-13) / 红=真实错误与破坏性按钮），与本单建议一致。左侧按钮从 common.cancel 改为 orderRecords.keepOrder，消除了「Cancel 到底是放弃还是执行」的歧义。
测试分支 merge commit 3a96524d，192 个测试（24 文件）全过。

【已验证关闭 2026-08-04】develop 0cdd4164 "fix: OC-26" 已修，两半都改了且比本单要求更彻底。
① 功能：useCancelOrder 新增 onSubmitted 回调，在交易广播（拿到 hash）后、await 回执之前触发，这样标准路径能先弹一个能扛过确认等待的 pending toast，再原地升级为最终态 —— 与 Flash 路径行为一致。注释也明确写了该回调只在标准路径触发、Flash 路径返回 relayTaskId 不触发。另外新增 lib/orders/cancelWithLifecycle.ts + userCancelledRegistry.ts，并重构了 useOrderLifecycleWatcher。附带 cancelWithLifecycle.test.ts；本地跑 src/lib/orders/ 全目录 22 文件 180 个测试全过。
② 视觉：警告框从 bg-destructive/10 + text-destructive 改为中性档 bg-muted/50 + text-muted-foreground，代码注释里记下了三级规则（中性=后果说明 / amber=需注意 / 红=真实错误与破坏性按钮）。底部左键文案由歧义的 "Cancel" 改为 "Keep Order"。
测试分支 merge commit 3750faf6。

① 用 Standard（钱包签名）模式取消一笔 market 单：toast 应从 Cancel Submitted 升级为 Order Canceled，不再停在 Waiting for on-chain confirmation；② 同一操作用 Flash 模式，最终态视觉与标准路径一致；③ 故意让取消失败（例如未到 REQUEST_EXPIRATION_TIME 强行发交易），toast 应升级为错误态而不是静默消失；④ 钱包签名耗时超过 8 秒时 toast 不应提前消失；⑤ 取消弹窗的警告框不再是红字红底，与下方 OC-13 的 amber 提示、以及错误文案三者视觉可区分；⑥ 底部两个按钮的语义不再歧义。

## 正文

<!-- Notion 页面为空白页，无正文内容 -->

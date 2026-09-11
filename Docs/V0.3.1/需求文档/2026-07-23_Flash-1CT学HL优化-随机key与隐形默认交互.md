# Flash 1CT 学 HL 优化（随机 key + 隐形默认交互）— 请 review `feat/flash-1ct-hl-style` 合并

> Notion 原文：[Flash 1CT 学 HL 优化](https://app.notion.com/p/Flash-1CT-HL-key-review-feat-flash-1ct-hl-style-3a53d7873f2c81d0ad5ff44c0a53304a)  
> 本地归档：2026-09-06  
> 版本归属：v0.3.1 及以前

| 属性 | 内容 |
| --- | --- |
| Priority | High |
| Reporter | Gordon |
| Assignee | Fefe |
| Status | Closed |
| Link | [feat/flash-1ct-hl-style](https://github.com/AladdinDAO/fx100-apps/tree/feat/flash-1ct-hl-style) |
| Product | FX100 |
| 创建时间 | 2026-07-23 00:29 |

## 复测

首次进入按钮 = `Enable Trading` → 点开 `Establish Connection` 弹窗 → 点建立连接签一次 → 弹窗关闭 → 再点一次才下单（防误点）；1CT 模式表单无切换；Standard 模式下单按钮旁有“切换到一键交易”；Settings 可 Renew / Disconnect / Stay connected；弹窗样式对齐 Close Position。

## 需求正文

【优化，非 bug】Flash 1CT 按 HL 风格重做，合约不动，纯前端。请 review 分支 `feat/flash-1ct-hl-style` 后合并 `develop`。

改动：

1. 随机 key（替代确定性派生，可轮换、抗钓鱼）。
2. 有效期 90 天。
3. 次数上限 100 万（约等于无限）。
4. 去掉 1 小时闲置锁。
5. Stay connected 默认开启。
6. 隐形默认交互：主按钮 `Enable Trading` → `Establish Connection` 轻量弹窗；不自动签，成功后需再点一次才下单，防止误点。1CT 模式表单不显示切换，仅 Standard 模式在按钮旁显示“切换到一键交易”；即将过期只在 Settings 提示。
7. 弹窗样式对齐 `ClosePositionDialog`。
8. en / zh / ja / ko 文案；ja / ko 为占位翻译，需要 review。

合并须知：拉分支后先执行 `yarn workspace @fx-io/sdk build`（修改了 SDK `src`，运行时走 `build`）；`useSessionLockGuard.ts` / `sessionLock.ts` 已不挂载（dead code 可删）；已基于 `develop` 最新内容合并，`tsc --noEmit` 为 0 error。

完整设计与安全推导见[评审页](https://www.notion.so/3913d7873f2c801daa4de9d85c38f27a)（第三部分给前端、第四部分给合约）。

已知无关问题：Relay 下单报 `ERR max requests limit exceeded, Limit 500000` 是 Upstash（`KV_REST_API_URL`）每日配额超限，属于基础设施 / env，不是本改动；需要 Ops 更换或升级 Upstash，或本地更换 KV env。

后续（合约侧，非本次前端范围）：[命名 Agent 多设备最终方案](https://app.notion.com/p/FX100-Flash-1CT-Named-Agent-3a33d7873f2c8117b564f6c93f42a446)，需要合约工程师实现 `exclusive` / `revokeAll`。

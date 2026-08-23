---
name: fx100-testcode-ops
description: TestCode（fx100 E2E 测试工程）操作手册：三 Fork 环境体系与 Chain ID 约定、Mock Market Bundle 初始化、用例-环境绑定、跑批与 Keeper 模式、看板验证链与执行记录管理。Use whenever the task involves 跑用例 / 运行 SCN-009 SCN-010 SCN-070 / tx-fork oracle-fork time-fork / 环境配置 / 环境初始化 / Mock Market Bundle / default-mock / Chain ID 99911 99912 99913 / Inline Keeper / Service Keeper / State Sync / Tenderly fork / dashboard 看板 / rebuild-latest / dashboard:verify / dashboard:serve / 执行详情 / 执行记录 / 删除记录 / 用例被 SKIP / 本次未执行核对 / 环境检查 — even if none of these words appear but the task requires running, configuring, or debugging TestCode scenarios, environments, or dashboard pages. 合约公式、费用路由、核对公式陷阱等领域知识见 fx100-verify-handbook；本 skill 只管工程操作。断言以实际代码为准。
---

# TestCode 操作手册

> 工程根：`/Users/milakou/Documents/FX100/TestCode`。知识来源：2026-08 实际配置、跑批与排障过程，锚点均指向真实代码位置。**任何操作前先确认锚点仍然成立**——同事可能并发改动。

## 一、三 Fork 环境体系（背下来这张表）

| 环境 | Chain ID（固定） | 定位 | State Sync | 关键依赖 |
|---|---|---|---|---|
| tx-fork | **99911** | 交易账本线（SCN-009 等交易与数据核对） | 按需，跑核对时建议关 | Service Keeper 可指向本 Fork |
| oracle-fork | **99912** | 受控价格边界线（SCN-010 / SCN-070 钉死在此） | **必须关** | Admin RPC（evm_snapshot/revert、免签名推价） |
| time-fork | **99913** | 时间推进线（grace / funding 时效类） | **必须关** | Admin RPC（evm_increaseTime 等）；时间只能拨快不能回退 |

- 编号约定见 `src/server/environment-configuration.ts`（约 162 行起）；环境页建法框按环境动态显示（`src/reporting/render-environments.ts` 的 `forkGuides`）。
- 能力位定义在 `config/environments/catalog.ts`：三个 fork 都是 `initializesDefaultMockResources: true`（③ 初始化面板都可用），仅 time-fork `permitsTimeTravel: true`。
- 新 fork 推荐一键创建：环境页 ① 按钮「创建 Tenderly Virtual TestNet（固定 Chain ID）」或 `npm run env:vnet:create -- --env <env>`（走 Virtual TestNets API，Chain ID 自动取 catalog `fixedChainId`、`eth_chainId` 校验、回填 RPC/WSS/Chain ID、登记 CURRENT.json；需 `E2E_TENDERLY_ACCESS_TOKEN`）。legacy fork API 已停用；控制台手建（Parent Base Sepolia 84532 + Custom Chain ID）仍可作备选。细节见 `references/environments.md` §一。

## 二、用例-环境绑定（SKIP 不是故障）

- SCN-009 → tx-fork；SCN-010 → `tests/S02/scn-010.spec.ts` 内 `test.skip(project !== 'oracle-fork')`；SCN-070 → `tests/S07/scn-070.spec.ts` 同款钉死。
- 在别的环境跑它们会得到 SKIP，看板显示"本次未执行核对"（`src/reporting/playwright-reporter.ts` 的状态翻译）——这是**声明式绑定**，不是运行失败。skip 的真实理由只在 Playwright 输出里。
- 钉死原因：010/070 靠激进推价构造精确价格边界，与交易账本线共 fork 会互相污染价格状态。放开绑定前必读 `references/run-and-verify.md` 的"跨环境风险"。

## 三、标准工作流

1. **配环境**：环境页 ① Fork 与 RPC → ② Trade/账户 → ③ Mock Market Bundle 初始化 → ④ 环境检查（验收）。细节与决策表见 `references/environments.md`。
2. **跑用例**：跑批页选环境与 Keeper 模式；或 npm scripts 直跑。模式选择与 spec 保护差异见 `references/run-and-verify.md`。
3. **验证改动**（改任何渲染/核对代码后的固定三连）：

```bash
npm run typecheck && npm run dashboard:rebuild-latest && npm run dashboard:verify -- artifacts/latest/dashboard.html
```

   - `dashboard:verify` **必须带 `--` 和目标路径**，不带只会打印 Usage。
   - 不要用管道尾接 `typecheck`（如 `| tail`）——会掩盖退出码，曾导致在旧代码上重建。
4. **看板与记录管理**：页面清单、核对模块结构、执行记录删除（墓碑机制）见 `references/dashboard.md`。
5. **改了 server 或页面代码**：`dashboard:serve` 是常驻进程，**必须重启**才生效（页面 HTML 重建了但旧进程路由不认识新 API）。

## 知识地图

- `references/environments.md` — Fork 建法、bundle 分层结构、初始化流程、"重建共享 USDC"决策表
- `references/run-and-verify.md` — 跑批入口、Inline/Service Keeper 对比、签名模式、spec 状态保护差异、deployed-market 开关的限制
- `references/dashboard.md` — 页面清单、核对模块（验证方式分级 / 口径标注 / 公式自包含）、latest 合并规则、执行记录墓碑删除
- 领域知识（公式、取整、费用路由、STABLE_PRICE 三件套等核对陷阱）→ 隔壁 skill `fx100-verify-handbook`

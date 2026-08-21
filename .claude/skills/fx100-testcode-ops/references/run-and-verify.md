# 跑批、Keeper 模式与验证链

## 一、跑批入口

- **跑批页（推荐）**：选环境 → Market 执行资源（默认 default-mock）→ Keeper 执行方式 → 创建批次。RPC Chain ID 先核对（如 `tx-fork: RPC Chain ID 已核对为 99911`）再执行。
- **npm scripts 直跑**：
  - `npm run test:scn009` — `E2E_ENV=tx-fork E2E_ENV_PRIORITY_KEYS=E2E_ENV playwright test tests/S02/scn-009.spec.ts --project=tx-fork`（2026-08-21 起为涨/平/跌三数据集矩阵）
  - `npm run test:scn009:signed` — 追加 `E2E_SIGNING_MODE=private-key E2E_PERSIST_FORK_STATE=true`（**保留 fork 状态**，跑完状态不回滚；矩阵模式下三组顺序累加在同一状态上，跨数据集比较仍用各组自身 Δ）

- **直跑坑位（2026-08-21 实例）**：
  - 不要给 `playwright test` 传 `--reporter=line` 之类参数——会**整体替换** `playwright.config.ts` 的 reporter 列表，自定义 reporter（`src/reporting/playwright-reporter.ts`，负责写 `artifacts/runs/<run>` 与合并 latest）不再执行，测试 PASS 却没有任何 run 记录。要看实时输出就看 `artifacts/playwright/` 的附件或事后 `npm run report`。
  - `.env.local` 的 `E2E_ENV` 会覆盖命令行同名变量（dotenv override）；直跑必须带 `E2E_ENV_PRIORITY_KEYS=E2E_ENV`（`test:scn009*` 脚本已内置），否则 spec 的环境守卫 `expect(runtime.environment).toBe(project)` 会直接失败。
  - 数据集矩阵被网络中断（如 DNS 解析失败）打断时 finally 的 `evm_revert` 可能没执行，fork 上留下 trader 仓位，下次运行在「执行前无多/空仓」前置检查处失败：用 `E2E_ENV=<env> E2E_ENV_PRIORITY_KEYS=E2E_ENV npm run env:close:residual` 按 runner 同路径平掉残仓（`scripts/close-residual-position.ts` → `closeResidualPosition()`），再重跑。
  - 管道尾接 `| tail` 会吃掉退出码（同 typecheck 的告诫）：直跑请重定向到日志文件后 `echo $?`。

## 二、Keeper 执行方式

| | Inline Keeper（默认） | Service Keeper（专项） |
|---|---|---|
| 机理 | 测试程序用 ORDER_KEEPER 私钥直接发 executeOrder | producer + ord-worker 异步服务链路 |
| 前提 | **完整 Mock Bundle（双 Mock Oracle + inlineKeeperReady）**，缺则 runner 直接 throw（`scn-009-runner.ts` 约 562 行） | 必须以同一 Fork RPC 启动并通过专项就绪检查；启动注入 `KEEPER_RUN_RPC_URL` + `KEEPER_EXPECTED_CHAIN_ID` |
| 超时形态 | 无（自己执行） | 300s 等不到执行 → 报错提示换 Inline 或先做就绪检查 |
| 适用 | default-mock 全部场景 | 验证真实 keeper 服务链路；标准 Market（无 mock oracle）只能走它 |

签名模式：`E2E_KEEPER_MODE`（inline/service）、`E2E_SIGNING_MODE=private-key` 时 SCN-009/010/070 要求 Trader 与 Keeper 私钥齐备（spec 里 expect hasPrimaryTestWallet/hasSecondaryTestWallet）。

## 三、spec 状态保护差异（跨环境风险的核心）

- **SCN-010**（`tests/S02/scn-010.spec.ts`）：开跑前 `evm_snapshot`，finally 里 `evm_revert`（除非 `E2E_PERSIST_FORK_STATE=true` 且成功）——自带状态回滚保护。
- **SCN-070**（`src/scenarios/scn-070-runner.ts`）：每数据集 `evm_snapshot`/`evm_revert`（实测跑后价格/锚/区块与跑前一致）；基线价**硬编码** `60_000 × 10^oracleDecimals`；2026-08-21 起 `setMockPrice` 改为**三件套**（feed 价 + 新鲜时间戳 `freshOracleTimestamp` + admin 同步 DataStore `STABLE_PRICE` 锚 = feed），保证链上 min==max==feed 与 Reader 推导同口径。历史教训：oracle-fork default-mock 初始化把锚写成 60060（`scripts/init-mock-resources.ts` stablePrice=initialMaxPrice），旧 runner 只写 feed → min/max=[60000,60060] → 开多 E>A 静默取消（2026-08-13 FAIL 根因，问题记录 #1 CLOSED）。
- 推论（2026-08-13 排查结论）：把 010/070 放到 tx-fork 跑之前，必须先解决锚同步——tx-fork 的 STABLE_PRICE 锚与 60000 基线不一致时，min/max 被劈开，边界数学全错并触发 LiquidatablePosition 静默取消（机理见 fx100-verify-handbook traps）。070 跑完还会把 fork 价格留在最后一次推价处。
- SCN-009 有 `E2E_MARKET_MODE=deployed-market` 开关（marketIndex 硬编码 2），但 fork 上实际跑不通：inline keeper 硬性要求 mock bundle；标准 market 的真实价格源在 fork 冻结、60s 过期，runner 无冒充推价路径。SCN-010 连开关都没有。

## 四、验证链（改代码后的固定动作）

```bash
npm run typecheck
npm run dashboard:rebuild-latest
npm run dashboard:verify -- artifacts/latest/dashboard.html
```

- `dashboard:verify` 不带 `-- <路径>` 只打印 Usage，**看似跑了实际什么都没验**。
- 判定看输出 `status: 'PASSED'` 与 `browserErrors: 0`。
- `typecheck` 别接管道（`| tail` 会吃掉非零退出码）。
- 看板 HTML 是超长单行：统计字符串出现次数用 `grep -o "xx" | wc -l`，`grep -c` 数的是行数、永远是 1。

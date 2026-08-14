# 看板与核对模块

## 一、页面清单（`npm run dashboard:serve`，默认 4173）

`/`（主看板）、`/executions`（执行详情=核对主战场）、`/test-cases`、`/runs`（跑批）、`/environments`（环境配置）、`/parameters`（含 Mock Oracle 价格面板）、`/formulas`、`/page-formulas`、`/faucet`。

- 页面 HTML 是 `writeRunOutputs`（`src/reporting/write-outputs.ts`）静态产物，server 只负责托管 + API。
- **改 server 或渲染代码后必须重启 serve 进程**：页面文件重建了，但常驻进程的路由/模块还是旧的（新 API 会 405）。

## 二、核对模块结构（`src/reporting/execution-evidence.ts`）

每条核对行 = Before / After / Δ / Expected / 公式与依据（formula + inputs + basis + note）。工程约定：

1. **验证方式分级**（`classifyVerification`，标签渲染在状态徽章下）：计算复算 > 事件对照 > 恒等式 > 守恒 > 派生展示 > 缺数据（NOT_VERIFIED）。评估覆盖质量看这个分级，不是只看 PASS 数。
2. **公式自包含**：符号公式 + 实际值代入 + `inputs[{name,value,source}]`——读者不出页面就能手工复核。引用中间量不单独成行，折进消费方的 inputs（如 skewRef、Position Fee Factor）。
3. **分支公式先展示分支判定**：如 `Expected ΔShort OI = isLong ? 0 : …；本次 isLong=true（多头开仓）→ Short 侧不动，Δ = 0`——非活跃分支绝不代入无关算式。
4. **口径标注**（`LedgerField.scope`，每行 note 以"口径："开头）：账户级（仅 ΔTrader）/ 合约级（Order/PositionVault 总余额）/ 池级（LPVault）/ 协议级（FeeHandler）/ 市场级累计（claimable 三槽）/ 市场级总账（OI、累计开仓成本）。**Before/After 是聚合读数，本单只体现在 Δ**；Δ 核对隐含"窗口内无他人活动"（独享 fork 成立）。
5. **OI 三套口径命名**：`Long OI（Token 口径）`=链上存储 / `累计开仓成本（USD 成本口径）`=存储、不随价漂移 / `OI（USD 盯市口径，派生）`=tokens×indexMid、随价漂移。盯市≠成本是正常现象（执行价偏离 mid）。
6. 分类筛选（`render-executions.ts` `checkCategory`）：守恒 / 资金 Vault / 仓位 / 价格 / Fee / Funding / 清算 ADL / Grace / OI Skew / PnL / 状态成交。
7. 已知缺口：PnL Cap 行 NOT_VERIFIED（需执行区块 poolPnl/maxPnlFactor 采集）。

## 三、latest 合并规则（`src/reporting/latest-snapshot.ts`）

- key = `id:project`，每对保留 executedAt 最新一条；**SKIP 永不覆盖已有非 SKIP 记录**（所以旧 PASS 会一直挂着，直到被新的真实执行取代或被删除）。
- 执行详情下拉只显示带 executionEvidence 的记录（SKIP 无证据不显示）。

## 四、执行记录删除（墓碑机制，2026-08-13 引入）

- 入口：执行详情页顶栏"删除本条执行记录"按钮（删当前选中项，confirm 确认）；API `POST /api/execution-records/delete {id, project}`（`src/server/dashboard-server.ts`）。
- 语义：墓碑写 `artifacts/deleted-records.json`；匹配 `(id, project)` 且 `executedAt ≤ deletedAt` 的记录不再进 latest。**`artifacts/runs/` 历史档案永不改动**；`rebuild-latest` 重建时应用墓碑（不复活）；**删除之后的新执行自动重新出现**。
- 按钮只在经 serve 打开的页面可用（直接开 HTML 文件无本机服务，fetch 失败并提示）。
- 先例：SCN-010:tx-fork 的 2026-08-04 PASS（spec 钉死 oracle-fork 之前的历史产物）已用此机制删除。

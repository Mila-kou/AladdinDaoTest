# FX100 v0.3.1 用户旅程 E2E 执行结果（历史快照）

> 本文件由原共享执行清单迁移而来，只记录 v0.3.1 执行事实；共享设计见 [`../../SCENARIO-CHECKLIST.md`](../../SCENARIO-CHECKLIST.md)。证据与历史执行目录未移动、未改写。

> 总数：80（自动化 63｜手工核对 17）｜PASS：15｜FAIL：0｜BLOCKED：0｜PENDING：1｜待执行：64  
> **回填口径（2026-08-21）**：证据来源 `TestCode/artifacts`（latest 合并规则）与快照归档 `TestCode/evidence-archive/2026-08-21-v0.3.1-fork-batches/manifest.json`（含 sha256）。
> ① 全部 PASS 的基线是 **@v0.3.1 快照：release-v0.3.1 部署的 Tenderly fork**（tx-fork 99911 / oracle-fork 99912），**不充当 v0.3.2 回归材料**（v0.3.2 准入见 `Docs/contract-releases/v0.3.2/06-测试影响与准入结论.md`）；
> ② SCN-010 在 **oracle-fork** 执行（spec 钉死，见 `package.json test:scn010`），tx-fork 批次内为 SKIP 属声明式绑定，不是故障；
> ③ 自动化 PASS 的 coverage 均为 PARTIAL（页面层/钱包点击未自动化，由 [M] 手工用例覆盖）；SCN-009 三组受控价格（+3%/0/−3%，涨>平>跌）已于 2026-08-21 自动化；
> ④ fork 上每数据集 evm_snapshot/revert 会使 **txHash 跨运行重复**，证据定位以 run id + 块号 + evidence.json（sha256 见 manifest）为准。
> 状态：`[ ]` 待执行｜`[x]` PASS｜`[!]` FAIL｜`[B]` BLOCKED｜`[P]` PENDING｜`[S]` SKIP｜`[M]` 手工核对（设计上不写自动化，仍须人工执行并留证）

| 状态 | ID | 套件 / 场景 | P | 证据（截图、tx、区块、Reader） | 实际结果 | 执行人 | 日期 |
|---|---|---|---|---|---|---|---|
| [M] | SCN-001 | S01 首次进入并判断数据可信 | P0 | | | | |
| [M] | SCN-002 | S01 错误网络与安全切链 | P0 | | | | |
| [M] | SCN-003 | S01 钱包连接与协议披露 | P0 | | | | |
| [M] | SCN-004 | S01 筛选可交易市场 | P1 | | | | |
| [M] | SCN-005 | S01 Standard 第一笔市价开仓 | P0 | | | | |
| [M] | SCN-006 | S01 Flash 同意、连接与首单 | P0 | | | | |
| [M] | SCN-007 | S01 刷新与重开恢复上下文 | P1 | | | | |
| [M] | SCN-008 | S01 切账户的数据与授权隔离 | P0 | | | | |
| [x] | SCN-009 | S02 市价开多快速退出 | P0 | run `2026-08-21T043810-045Z`（tx-fork）· 12 笔 TX 0xfb301e78…a65468…0xb6a2dddf…4c6b19 · 块 45389421–45389426 · `TestCode/evidence-archive/2026-08-21-v0.3.1-fork-batches/runs/2026-08-21T043810-045Z/attachments/SCN-009-tx-fork-r0-0-scn-009-evidence.json` | PASS（376 项对账；三组受控价格 +3%/0/−3% 已自动化，coverage 仍 PARTIAL：缺浏览器钱包点击签名与页面历史核对；@v0.3.1 快照（fork 基线）） | 自动化（Playwright · Inline Keeper · 私钥签名） | 2026-08-21 |
| [x] | SCN-010 | S02 现价下方限价开多 | P0 | run `2026-08-13T151033-634Z-FX100-202-oracle-fork-mock-market-default-mock`（oracle-fork）· 4 笔 TX 0x72d1e265…f97053…0x5710be6e…78a437 · 块 45432569–45432574 · `TestCode/evidence-archive/2026-08-21-v0.3.1-fork-batches/runs/2026-08-13T151033-634Z-FX100-202-oracle-fork-mock-market-default-mock/attachments/SCN-010-oracle-fork-r0-0-scn-010-evidence.json` | PASS（128 项对账；coverage PARTIAL；**执行环境 oracle-fork**（spec 钉死），@v0.3.1 快照（fork 基线）） | 自动化（Playwright · Inline Keeper · 私钥签名） | 2026-08-13 |
| [x] | SCN-011 | S02 现价上方限价开空 | P0 | run `2026-08-14T053255-871Z`（tx-fork）· 4 笔 TX 0x82e3b372…9b2c8b…0xabe24c0e…02def9 · 块 45432567–45432572 · `TestCode/evidence-archive/2026-08-21-v0.3.1-fork-batches/runs/2026-08-14T053255-871Z/attachments/SCN-011-tx-fork-r0-0-scn-011-evidence.json` | PASS（125 项对账；coverage PARTIAL；@v0.3.1 快照（fork 基线）） | 自动化（Playwright · Inline Keeper · 私钥签名） | 2026-08-14 |
| [x] | SCN-012 | S02 突破追多 | P0 | run `2026-08-14T053403-093Z`（tx-fork）· 4 笔 TX 0xaf5cecf6…e68a4c…0xabe24c0e…02def9 · 块 45432567–45432572 · `TestCode/evidence-archive/2026-08-21-v0.3.1-fork-batches/runs/2026-08-14T053403-093Z/attachments/SCN-012-tx-fork-r0-0-scn-012-evidence.json` | PASS（125 项对账；coverage PARTIAL；@v0.3.1 快照（fork 基线）） | 自动化（Playwright · Inline Keeper · 私钥签名） | 2026-08-14 |
| [x] | SCN-013 | S02 破位追空与 validFrom | P0 | run `2026-08-14T053454-075Z`（tx-fork）· 4 笔 TX 0xedb260a9…9d596d…0xabe24c0e…02def9 · 块 45432567–45432572 · `TestCode/evidence-archive/2026-08-21-v0.3.1-fork-batches/runs/2026-08-14T053454-075Z/attachments/SCN-013-tx-fork-r0-0-scn-013-evidence.json` | PASS（125 项对账；coverage PARTIAL；@v0.3.1 快照（fork 基线）） | 自动化（Playwright · Inline Keeper · 私钥签名） | 2026-08-14 |
| [ ] | SCN-014 | S02 触发价与成交价差异 | P1 | | | | |
| [x] | SCN-015 | S02 多头开仓时同时附带 TP/SL，TP 先触发 | P0 | run `2026-08-14T053544-208Z`（tx-fork）· 4 笔 TX 0xf0f2a884…6ce98c…0xca2a9c30…b3a1c6 · 块 45432567–45432572 · `TestCode/evidence-archive/2026-08-21-v0.3.1-fork-batches/runs/2026-08-14T053544-208Z/attachments/SCN-015-tx-fork-r0-0-scn-015-evidence.json` | PASS（125 项对账；coverage PARTIAL；@v0.3.1 快照（fork 基线）） | 自动化（Playwright · Inline Keeper · 私钥签名） | 2026-08-14 |
| [x] | SCN-016 | S02 多头开仓时同时附带 TP/SL，SL 先触发并限制损失 | P0 | run `2026-08-14T053632-208Z`（tx-fork）· 4 笔 TX 0xf0f2a884…6ce98c…0xca2a9c30…b3a1c6 · 块 45432567–45432572 · `TestCode/evidence-archive/2026-08-21-v0.3.1-fork-batches/runs/2026-08-14T053632-208Z/attachments/SCN-016-tx-fork-r0-0-scn-016-evidence.json` | PASS（125 项对账；coverage PARTIAL；@v0.3.1 快照（fork 基线）） | 自动化（Playwright · Inline Keeper · 私钥签名） | 2026-08-14 |
| [ ] | SCN-017 | S02 修改触发价与规模 | P1 | | | | |
| [ ] | SCN-018 | S02 主动撤单与退款 | P0 | | | | |
| [ ] | SCN-019 | S02 市价滑点取消退款 | P0 | | | | |
| [ ] | SCN-020 | S02 Freeze 与 Oracle Revert | P0 | | | | |
| [ ] | SCN-021 | S03 新仓成交与风险核对 | P0 | | | | |
| [x] | SCN-022 | S03 PnL 与 Est. Receive | P0 | run `2026-08-19T065448-202Z`（tx-fork）· 8 笔 TX 0x2e465ca2…d06036…0xff882203…5b0a2e · 块 45389410–45389415 · `TestCode/evidence-archive/2026-08-21-v0.3.1-fork-batches/runs/2026-08-19T065448-202Z/attachments/SCN-022-tx-fork-r0-2-scn-022-evidence.json` | PASS（260 项对账；coverage PARTIAL；@v0.3.1 快照（fork 基线）） | 自动化（Playwright · Inline Keeper · 私钥签名） | 2026-08-19 |
| [x] | SCN-023 | S03 分批止盈退出 | P0 | run `2026-08-14T065250-313Z`（tx-fork）· 4 笔 TX 0xf0f2a884…6ce98c…0x52494fa3…a6702f · 块 45432567–45432574 · `TestCode/evidence-archive/2026-08-21-v0.3.1-fork-batches/runs/2026-08-14T065250-313Z/attachments/SCN-023-tx-fork-r0-0-scn-023-evidence.json` | PASS（183 项对账；coverage PARTIAL；@v0.3.1 快照（fork 基线）） | 自动化（Playwright · Inline Keeper · 私钥签名） | 2026-08-14 |
| [x] | SCN-024 | S03 紧急全部平仓 | P0 | run `2026-08-14T040717-552Z`（tx-fork）· 8 笔 TX 0xf0f2a884…6ce98c…0x28ff39ff…e95ef0 · 块 45432567–45432572 · `TestCode/evidence-archive/2026-08-21-v0.3.1-fork-batches/runs/2026-08-14T040717-552Z/attachments/SCN-024-tx-fork-r0-0-scn-024-evidence.json` | PASS（250 项对账；coverage PARTIAL；@v0.3.1 快照（fork 基线）） | 自动化（Playwright · Inline Keeper · 私钥签名） | 2026-08-14 |
| [x] | SCN-025 | S03 同方向加仓 | P1 | run `2026-08-14T045211-851Z`（tx-fork）· 8 笔 TX 0xf0f2a884…6ce98c…0x52494fa3…a6702f · 块 45432567–45432572 · `TestCode/evidence-archive/2026-08-21-v0.3.1-fork-batches/runs/2026-08-14T045211-851Z/attachments/SCN-025-tx-fork-r0-0-scn-025-evidence.json` | PASS（362 项对账；coverage PARTIAL；@v0.3.1 快照（fork 基线）） | 自动化（Playwright · Inline Keeper · 私钥签名） | 2026-08-14 |
| [ ] | SCN-026 | S03 追加保证金降风险 | P0 | | | | |
| [ ] | SCN-027 | S03 提取部分/全部保证金 | P0 | | | | |
| [ ] | SCN-028 | S03 调整目标杠杆 | P1 | | | | |
| [ ] | SCN-029 | S03 仓位更新结算 Funding | P1 | | | | |
| [ ] | SCN-030 | S03 空头正 Funding 部分平仓 | P0 | | | | |
| [ ] | SCN-031 | S03 ETH/BTC 仓位隔离 | P0 | | | | |
| [ ] | SCN-032 | S03 USD/Token Mode 等价 | P0 | | | | |
| [ ] | SCN-033 | S04 理论 100x 与真实 buffer | P0 | | | | |
| [ ] | SCN-034 | S04 最小抵押/仓位门槛 | P0 | | | | |
| [ ] | SCN-035 | S04 清算区精确补保证金 | P0 | | | | |
| [ ] | SCN-036 | S04 危险区足额部分减仓 | P0 | | | | |
| [ ] | SCN-037 | S04 清算区紧急全平 | P0 | | | | |
| [ ] | SCN-038 | S04 清算区限制操作 | P0 | | | | |
| [ ] | SCN-039 | S04 保护期与刷新连续性 | P0 | | | | |
| [ ] | SCN-040 | S04 加仓不延长保护期 | P0 | | | | |
| [ ] | SCN-041 | S04 保护期触线后恢复 | P0 | | | | |
| [ ] | SCN-042 | S04 保护期到期边界 | P0 | | | | |
| [ ] | SCN-043 | S04 USDC 脱锚风险 | P0 | | | | |
| [ ] | SCN-044 | S04 ADL 用户可见结果 | P0 | | | | |
| [ ] | SCN-045 | S05 均衡市场 Funding floor | P1 | | | | |
| [ ] | SCN-046 | S05 拥挤/轻侧 Funding | P1 | | | | |
| [ ] | SCN-047 | S05 长持 Funding 侵蚀 | P0 | | | | |
| [ ] | SCN-048 | S05 小单/大单价格冲击 | P1 | | | | |
| [ ] | SCN-049 | S05 浅流动性极端冲击 | P0 | | | | |
| [ ] | SCN-050 | S05 改善/恶化失衡对比 | P1 | | | | |
| [ ] | SCN-051 | S05 OI/储备上限 | P0 | | | | |
| [ ] | SCN-052 | S05 BTC 全链路精度 | P0 | | | | |
| [M] | SCN-053 | S06 Flash 连续交易 | P0 | | | | |
| [M] | SCN-054 | S06 Standard/Flash 切换 | P1 | | | | |
| [M] | SCN-055 | S06 consent 版本升级 | P0 | | | | |
| [M] | SCN-056 | S06 Cancel All 原子撤单 | P0 | | | | |
| [M] | SCN-057 | S06 断开与撤销交易密钥 | P0 | | | | |
| [M] | SCN-058 | S06 到期/持久化/多设备 | P1 | | | | |
| [ ] | SCN-059 | S06 Relay/Keeper 超时幂等 | P0 | | | | |
| [ ] | SCN-060 | S06 Oracle/Sequencer 故障恢复 | P0 | | | | |
| [M] | SCN-061 | S06 RPC/拒签恢复 | P1 | | | | |
| [ ] | SCN-062 | S06 Indexer 最终一致性 | P1 | | | | |
| [P] | SCN-063 | S06 移动端核心旅程 | P2 | manual-runs/2026-08-30-移动端smoke/（MLOG-001~017,60+ 笔链上核对;截图 139~195） | 竖屏真机核心旅程各环节真实提交全 PASS（开仓/TP-SL/调保证金/调杠杆/全平,4 例 SL 真实触发）;三钱包双平台;新缺陷 021(S2)/020/022(S3)。横屏项遗留→PENDING,收口后转 PASS;"暂时通过"判定见 ROUND-1-SUMMARY | Mila+Claude | 2026-08-30 |
| [M] | SCN-064 | S06 多语言与账户隐私 | P2 | | | | |
| [x] | SCN-065 | S07 市价开空与平空 | P0 | run `2026-08-13T155728-390Z`（tx-fork）· 4 笔 TX 0x7a4c8c89…440d28…0xfa62cf99…b190a5 · 块 45432567–45432570 · `TestCode/evidence-archive/2026-08-21-v0.3.1-fork-batches/runs/2026-08-13T155728-390Z/attachments/SCN-065-tx-fork-r0-0-scn-065-evidence.json` | PASS（125 项对账；coverage PARTIAL；@v0.3.1 快照（fork 基线）） | 自动化（Playwright · Inline Keeper · 私钥签名） | 2026-08-13 |
| [x] | SCN-066 | S07 空头止盈 LimitDecrease | P0 | run `2026-08-14T053720-013Z`（tx-fork）· 4 笔 TX 0x7a4c8c89…440d28…0xca2a9c30…b3a1c6 · 块 45432567–45432572 · `TestCode/evidence-archive/2026-08-21-v0.3.1-fork-batches/runs/2026-08-14T053720-013Z/attachments/SCN-066-tx-fork-r0-0-scn-066-evidence.json` | PASS（125 项对账；coverage PARTIAL；@v0.3.1 快照（fork 基线）） | 自动化（Playwright · Inline Keeper · 私钥签名） | 2026-08-14 |
| [x] | SCN-067 | S07 空头止损 StopLossDecrease | P0 | run `2026-08-14T053809-461Z`（tx-fork）· 4 笔 TX 0x7a4c8c89…440d28…0xca2a9c30…b3a1c6 · 块 45432567–45432572 · `TestCode/evidence-archive/2026-08-21-v0.3.1-fork-batches/runs/2026-08-14T053809-461Z/attachments/SCN-067-tx-fork-r0-0-scn-067-evidence.json` | PASS（125 项对账；coverage PARTIAL；@v0.3.1 快照（fork 基线）） | 自动化（Playwright · Inline Keeper · 私钥签名） | 2026-08-14 |
| [ ] | SCN-068 | S07 多空强平与 ADL 区分 | P0 | | | | |
| [ ] | SCN-069 | S07 四类触发单多空精确边界 | P0 | | | | |
| [x] | SCN-070 | S07 市价四象限可接受价 | P0 | run `2026-08-21T090044-138Z`（oracle-fork）· 24 笔 TX 0xe85d7464…5521f4…0x403e8061…a4187d · 块 45432829–45432838 · `TestCode/evidence-archive/2026-08-21-scn070-oracle-fork-anchor-fix/runs/2026-08-21T090044-138Z/attachments/SCN-070-oracle-fork-r0-0-scn-070-evidence.json` | PASS（186 项对账；8 数据集 = 4 条等号边界成交 + 4 条最小步长取消；2026-08-13 FAIL 根因为环境 STABLE_PRICE 锚≠runner 基线，runner 已改三件套同步锚，问题记录 #1 CLOSED；@v0.3.1 快照（fork 基线）） | 自动化（Playwright · 私钥签名） | 2026-08-21 |
| [ ] | SCN-071 | S07 触发单改撤冻结与重试 | P0 | | | | |
| [ ] | SCN-072 | S07 多空仓位同时附带 TP/SL 时的 reduce-only 与 autoCancel | P0 | | | | |
| [ ] | SCN-073 | S08 零 OI 与首仓 Funding 基准 | P0 | | | | |
| [ ] | SCN-074 | S08 Funding Factor 方向与翻转 | P0 | | | | |
| [ ] | SCN-075 | S08 按秒计提与 1h EMA | P0 | | | | |
| [ ] | SCN-076 | S08 Long/Short Factor Clamp 边界 | P0 | | | | |
| [ ] | SCN-077 | S08 全仓位动作 Funding 结算 | P0 | | | | |
| [ ] | SCN-078 | S08 Funding 取整与 LP 路由 | P0 | | | | |
| [ ] | SCN-079 | S08 Funding-only 清算边界 | P0 | | | | |
| [ ] | SCN-080 | S08 Funding 页面与市场隔离 | P0 | | | | |

## 套件级清理

| 清理项 | 结果 | 证据/备注 |
|---|---|---|
| 所有测试账户无持仓 | 待确认 | |
| 所有当前订单和 TP/SL 已清除 | 待确认 | |
| Base Sepolia、RPC、Oracle、Keeper、Indexer 已恢复 | 待确认 | |
| Flash 测试授权/交易密钥已撤销 | 待确认 | |
| 时间、价格、Funding、Depth、OI 配置已恢复 | 待确认 | |
| 语言、数字格式和视口已恢复 | 待确认 | |

## 问题记录

| 编号 | 场景 ID | 现象 | 用户影响 | 资金状态 | 证据 | Bug ID | 状态 |
|---|---|---|---|---|---|---|---|
| 1 | SCN-070 | oracle-fork 批次 `open-long-equal` 数据集：等号边界期望恰好 1 条 OrderExecuted，实际 0（订单被取消） | 四象限「等号可接受价」边界行为一度未验证 | 无（私有 fork） | 根因探针与复跑证据：`TestCode/evidence-archive/2026-08-21-scn070-oracle-fork-anchor-fix/manifest.json`；抛错点 `TestCode/src/scenarios/scn-070-runner.ts`（2026-08-21 修复） | 无需登记（测试侧问题，非合约缺陷） | **CLOSED 2026-08-21**：根因 = oracle-fork default-mock 初始化把 DataStore STABLE_PRICE 锚写成 60060 而 runner 基线 feed=60000，ChainlinkPriceFeedProvider 取 min/max=[60000,60060]，开多执行价 E（取 max）> runner 按 min=max 推导的 A → OrderNotFulfillableAtAcceptablePrice 静默取消；修复 = runner setMockPrice 改三件套（feed + 新鲜时间戳 + 同步 STABLE_PRICE 锚），复跑 PASS run 2026-08-21T090044-138Z |

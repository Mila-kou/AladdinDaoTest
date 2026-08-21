# FX100 用户旅程 E2E 执行清单

> 总数：80（自动化 63｜手工核对 17）｜PASS：15｜FAIL：0｜BLOCKED：0｜PENDING：0｜待执行：65｜增补：8（SCN-B32，见文末）  
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
| [x] | SCN-015 | S02 括号单 TP 先触发 | P0 | run `2026-08-14T053544-208Z`（tx-fork）· 4 笔 TX 0xf0f2a884…6ce98c…0xca2a9c30…b3a1c6 · 块 45432567–45432572 · `TestCode/evidence-archive/2026-08-21-v0.3.1-fork-batches/runs/2026-08-14T053544-208Z/attachments/SCN-015-tx-fork-r0-0-scn-015-evidence.json` | PASS（125 项对账；coverage PARTIAL；@v0.3.1 快照（fork 基线）） | 自动化（Playwright · Inline Keeper · 私钥签名） | 2026-08-14 |
| [x] | SCN-016 | S02 括号单 SL 先触发 | P0 | run `2026-08-14T053632-208Z`（tx-fork）· 4 笔 TX 0xf0f2a884…6ce98c…0xca2a9c30…b3a1c6 · 块 45432567–45432572 · `TestCode/evidence-archive/2026-08-21-v0.3.1-fork-batches/runs/2026-08-14T053632-208Z/attachments/SCN-016-tx-fork-r0-0-scn-016-evidence.json` | PASS（125 项对账；coverage PARTIAL；@v0.3.1 快照（fork 基线）） | 自动化（Playwright · Inline Keeper · 私钥签名） | 2026-08-14 |
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
| [M] | SCN-063 | S06 移动端核心旅程 | P2 | | | | |
| [M] | SCN-064 | S06 多语言与账户隐私 | P2 | | | | |
| [x] | SCN-065 | S07 市价开空与平空 | P0 | run `2026-08-13T155728-390Z`（tx-fork）· 4 笔 TX 0x7a4c8c89…440d28…0xfa62cf99…b190a5 · 块 45432567–45432570 · `TestCode/evidence-archive/2026-08-21-v0.3.1-fork-batches/runs/2026-08-13T155728-390Z/attachments/SCN-065-tx-fork-r0-0-scn-065-evidence.json` | PASS（125 项对账；coverage PARTIAL；@v0.3.1 快照（fork 基线）） | 自动化（Playwright · Inline Keeper · 私钥签名） | 2026-08-13 |
| [x] | SCN-066 | S07 空头止盈 LimitDecrease | P0 | run `2026-08-14T053720-013Z`（tx-fork）· 4 笔 TX 0x7a4c8c89…440d28…0xca2a9c30…b3a1c6 · 块 45432567–45432572 · `TestCode/evidence-archive/2026-08-21-v0.3.1-fork-batches/runs/2026-08-14T053720-013Z/attachments/SCN-066-tx-fork-r0-0-scn-066-evidence.json` | PASS（125 项对账；coverage PARTIAL；@v0.3.1 快照（fork 基线）） | 自动化（Playwright · Inline Keeper · 私钥签名） | 2026-08-14 |
| [x] | SCN-067 | S07 空头止损 StopLossDecrease | P0 | run `2026-08-14T053809-461Z`（tx-fork）· 4 笔 TX 0x7a4c8c89…440d28…0xca2a9c30…b3a1c6 · 块 45432567–45432572 · `TestCode/evidence-archive/2026-08-21-v0.3.1-fork-batches/runs/2026-08-14T053809-461Z/attachments/SCN-067-tx-fork-r0-0-scn-067-evidence.json` | PASS（125 项对账；coverage PARTIAL；@v0.3.1 快照（fork 基线）） | 自动化（Playwright · Inline Keeper · 私钥签名） | 2026-08-14 |
| [ ] | SCN-068 | S07 多空强平与 ADL 区分 | P0 | | | | |
| [ ] | SCN-069 | S07 四类触发单多空精确边界 | P0 | | | | |
| [x] | SCN-070 | S07 市价四象限可接受价 | P0 | run `2026-08-21T090044-138Z`（oracle-fork）· 24 笔 TX 0xe85d7464…5521f4…0x403e8061…a4187d · 块 45432829–45432838 · `TestCode/evidence-archive/2026-08-21-scn070-oracle-fork-anchor-fix/runs/2026-08-21T090044-138Z/attachments/SCN-070-oracle-fork-r0-0-scn-070-evidence.json` | PASS（186 项对账；8 数据集 = 4 条等号边界成交 + 4 条最小步长取消；2026-08-13 FAIL 根因为环境 STABLE_PRICE 锚≠runner 基线，runner 已改三件套同步锚，问题记录 #1 CLOSED；@v0.3.1 快照（fork 基线）） | 自动化（Playwright · 私钥签名） | 2026-08-21 |
| [ ] | SCN-071 | S07 触发单改撤冻结与重试 | P0 | | | | |
| [ ] | SCN-072 | S07 多空括号单与 autoCancel | P0 | | | | |
| [ ] | SCN-073 | S08 零 OI 与首仓 Funding 基准 | P0 | | | | |
| [ ] | SCN-074 | S08 Funding Factor 方向与翻转 | P0 | | | | |
| [ ] | SCN-075 | S08 按秒计提与 1h EMA | P0 | | | | |
| [ ] | SCN-076 | S08 Long/Short Factor Clamp 边界 | P0 | | | | |
| [ ] | SCN-077 | S08 全仓位动作 Funding 结算 | P0 | | | | |
| [ ] | SCN-078 | S08 Funding 取整与 LP 路由 | P0 | | | | |
| [ ] | SCN-079 | S08 Funding-only 清算边界 | P0 | | | | |
| [ ] | SCN-080 | S08 Funding 页面与市场隔离 | P0 | | | | |

## v0.3.2 增补场景（SCN-B32，2026-08-21 收编）

> 来源：`Docs/contract-releases/v0.3.2/05-重要参数边界场景.md` §1.4「SCN 映射总表」新增设计列 + §2～§11 卡片；收编裁决见同目录 `06-测试影响与准入结论.md` §1.2 G6 / §5 B-1。原 SCN-001～080 编号与头部「总数：80」不动，本节 8 条独立计数；TestCode 目录解析器只识别 `SCN-\d{3}`（`TestCode/src/reporting/catalog.ts`），本节行不计入 plannedScenarios，也不进入自动化覆盖率分母。  
> 执行前置：全部需要以 v0.3.2 部署为基线的环境；当前 tx-fork/oracle-fork 均为 base-sepolia@v0.3.1 镜像、time-fork 待手建（见 `Docs/contract-releases/CURRENT.json`），故本节整体「待执行」。期望值按 05 卡片的受控 fixture 推导，实测须按 v0.3.2 部署真值以同公式重算（05 §12-2），不得照抄。  
> 编号说明：05 §1.4 只显式分配了 01/03/04/05/06/07/08 七个号，SCN-B32-02 在 05 中空缺（表序对应行写「并入 SCN-049 新增三点数据集」）。本次按 §1.4 表序补位为 R2-B10 大单 price impact 封顶（卡片 B32-2-01/02，挂 S05），并保留「执行证据与 SCN-049 v0.3.2 数据集共用」约束；该补位待主会话确认，若否决则本行改为 `[S]` 并在 SCN-049 行记录。  
> 用例明细：`scenarios/S03-仓位管理与退出.md`、`scenarios/S05-长持费用价格冲击与多市场.md`、`scenarios/S06-Flash异常恢复与兼容.md` 末尾「v0.3.2 增补（SCN-B32）」小节；非用户旅程的 IT-VAULT-001～003、IT-MARKET-001 见 `case/IT-v0.3.2-VAULT-MARKET.md`。

| 状态 | ID | 套件 / 场景 | P | 证据（截图、tx、区块、Reader） | 实际结果 | 执行人 | 日期 |
|---|---|---|---|---|---|---|---|
| [ ] | SCN-B32-01 | S05 动态点差 MIN/MAX clamp 与负点差（含清算/ADL floor-at-0） | P0 | 映射 05 卡片 B32-1-01～09；环境能力 tx-fork（CONFIG_KEEPER setInt、受控 OI、Inline Keeper）+ oracle-fork（双价/推价，数据集⑦⑧）；数据集①（clamp 漏配升级事故形态）需部署前置 | 待执行（需 v0.3.2 部署环境） | | |
| [ ] | SCN-B32-02 | S05 大单 price impact 指数封顶 R2-B10（补位号，并入 SCN-049 三点数据集） | P1 | 映射 05 卡片 B32-2-01/02；环境能力 tx-fork + 受控浅深度配置 + Inline Keeper；执行证据与 SCN-049 v0.3.2 数据集共用 | 待执行（需 v0.3.2 部署环境） | | |
| [ ] | SCN-B32-03 | S06 全局 COLLATERAL_TOKEN 与 Relay fee token 强约束 | P0 | 映射 05 卡片 B32-3-01/03（B32-3-02/04 建市组合约束与写入权限落域级 IT-MARKET-001）；环境能力 tx-fork（CONTROLLER 可清空/直写该键）+ Relay 签名服务（新 EIP-712 域）；与 SCN-059 同环境 | 待执行（需 v0.3.2 部署环境） | | |
| [ ] | SCN-B32-04 | S06 子账户 4 槽位模型与 EIP-712 新旧签名 | P0 | 映射 05 卡片 B32-4-01～05；环境能力 tx-fork（SubaccountRouter 直连、CONFIG_KEEPER 写 integration 开关）+ Relay + 签名服务（可分别按 v0.3.1/v0.3.2 typed data 出签） | 待执行（需 v0.3.2 部署环境） | | |
| [ ] | SCN-B32-05 | S03 减仓最小输出 minOutputAmount 校验 R4-B22 | P0 | 映射 05 卡片 B32-6-01/02；环境能力 oracle-fork（固定价 + USDC 双价）+ Inline Keeper；紧邻 SCN-022 执行 | 待执行（需 v0.3.2 部署环境） | | |
| [ ] | SCN-B32-06 | S03 完整平仓边界：USD 减仓 ceil 耗尽归一全平 R4-B20 | P0 | 映射 05 卡片 B32-7-01/02；环境能力 oracle-fork（固定价构造精确 size）+ Inline Keeper；SCN-023/032/052 为关联回归 | 待执行（需 v0.3.2 部署环境） | | |
| [ ] | SCN-B32-07 | S05 折扣+返佣封顶 R2-B15 | P1 | 映射 05 卡片 B32-9-01～04；环境能力 tx-fork（CONFIG_KEEPER 写 pro tier / referral / minAffiliate 因子）+ Inline Keeper；域级对照 `test/integration/PositionPricing.t.sol` | 待执行（需 v0.3.2 部署环境） | | |
| [ ] | SCN-B32-08 | S06 升级迁移与存量数据兼容 | P0 | 映射 05 卡片 B32-10-01～04；环境能力 部署前置（v0.3.1 状态之上原位升级 v0.3.2）或 tx-fork 升级演练 + Relay/签名服务 | 待执行（需 v0.3.2 部署环境；另受 v0.3.1→v0.3.2 升级路径阻塞） | | |

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

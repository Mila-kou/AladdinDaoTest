# v0.3.2 测试结果

> 汇总日期：2026-09-03。执行前必须重新读取 Docs/contract-releases/CURRENT.json 与实际 deployment manifest；本页不继承任何 v0.3.1 PASS。

## 当前汇总

| 结果集 | 状态 | 说明 |
|---|---|---|
| 共享 SCN-001～080 | NOT_RUN | 尚无绑定 v0.3.2 deployment 的完整 E2E PASS 证据 |
| SCN-B32-01～08 | NOT_RUN | 设计已归档到 [cases/SCN-B32.md](cases/SCN-B32.md) |
| IT-VAULT-001～003、IT-MARKET-001 | NOT_RUN | [设计](cases/IT-VAULT-MARKET.md)；需要对应 fork/Strategy mock/角色能力 |
| v0.3.2 Foundry 单元测试 | PASS | 14 条（11 + 3），见 [TestCase/UT/README.md](../../../UT/README.md)；不折算为 E2E PASS |
| Trade 矩阵 A 节 CT-BASE-001～008 / XT-BASE-009 | 8 PASS / 1 GAP | tx-fork 合约层准入依据；前端层未准入 |
| Trade 矩阵 B1 XT-MKT-OPEN-001/002、LEV-003～006、COL-009；FT-MKT-LEV-007/008 | 合约层 7 PASS；交叉层 LEV-005/006 FAIL；FT-007/008 GAP（前端层未准入，spec 已代码化） | 页面 L_max 公式不含 oracle 价带与分腿费率，页面上限 100x > 链上 ~46x，待裁决（见 [TestCode/docs/tasks/2026-09-03-B1-L_max交叉偏离发现.md](../../../../TestCode/docs/tasks/2026-09-03-B1-L_max交叉偏离发现.md)） |

## 环境门槛

- tx-fork 合约层结果可登记的前提：`CURRENT.primary.admissionScope["tx-fork:contract"]` = READY_FOR_SYSTEM_TEST，且执行时合约 commit、部署清单、参数快照与 ABI 一致。**2026-09-03 已恢复 READY_FOR_SYSTEM_TEST**：部署 `tx-fork-v0.3.2-260902-2305`，`tests/A` 正式批次 `TestCode/artifacts/runs/2026-09-02T161000-175Z` CT-BASE-001～008 全 PASS 作为恢复依据。FT/XT 层与 Relay/Flash 结果要等 `tx-fork:frontend` 准入，之前只记 GAP。
- `STABLE_PRICE(USDC)` 在 v0.3.2 未设置是否有意，尚无裁决（04 §7-6），精确价格核对类用例执行前先落定。合成 BTC 乘数已裁决为 18 位口径正确；tx-fork 没有 8 位 index token 市场，8 位精度用例记 BLOCKED 待建市场。
- oracle-fork/time-fork 未指向 v0.3.2 时，精确 Oracle、Funding 和升级迁移结果记 BLOCKED，不得用 v0.3.1 fork 代跑。
- 每条结果至少记录 environment/deployment、contract commit、frontend commit（FT/XT）、数据集、tx、区块、事件、Reader 与资金差分。

## 专项状态

| ID | 状态 | 解除条件 |
|---|---|---|
| SCN-B32-01 | NOT_RUN | v0.3.2 tx/oracle fork、CONFIG_KEEPER、可控 OI 与 Oracle |
| SCN-B32-02 | NOT_RUN | v0.3.2 tx-fork、可控浅深度配置 |
| SCN-B32-03 | NOT_RUN | v0.3.2 tx-fork、全局键写入能力与新 Relay 签名服务 |
| SCN-B32-04 | NOT_RUN | v0.3.2 SubaccountRouter、4 槽位 Reader 与新旧 EIP-712 出签 |
| SCN-B32-05 | NOT_RUN | v0.3.2 tx-fork 的可控 Mock Oracle 与精确 output fixture；能力缺失则 BLOCKED |
| SCN-B32-06 | NOT_RUN | v0.3.2 tx-fork 的可控 Mock Oracle 与 ≥10 USD 精确 size fixture；能力缺失则 BLOCKED |
| SCN-B32-07 | NOT_RUN | v0.3.2 tx-fork、pro/referral 配置能力 |
| SCN-B32-08 | BLOCKED | 可复现的 v0.3.1 → v0.3.2 原位升级演练环境 |

## 功能用例结果（CT/XT/FT，版本级）

> 写回约定（2026-09-02 与测试看板 session 对齐）：本节是版本功能用例结果的唯一台账，看板程序化写回与人工填写都只改下面两个标记之间的表格行，其它章节不动；每次写回整文件原子替换（临时文件 + rename）。一行 = 一个原子用例（或「ID/数据集」）在一个部署上的一次结果；同一 ID 再次执行追加新行，不覆盖旧行。按层状态词汇固定为 `PASS` / `FAIL` / `BLOCKED` / `GAP` / `NOT_RUN`；`交叉一致` 只有页面入口才判，RPC 入口写 `—`。写回前置：对应层的 `CURRENT.primary.admissionScope` 为 READY_FOR_SYSTEM_TEST，否则只能写 BLOCKED / NOT_RUN，不得写 PASS。`部署` 列写 manifest 名（如 `tx-fork-v0.3.2-260902`）加合约 commit 前 7 位；`证据` 列写工作区相对路径（自动化：`TestCode/artifacts/runs/<run>/…`；手工：`TestCase/E2E/manual-runs/<日期-批次>/…`）。本节不引用 SCN 编号及相关内容。
>
> 行样例（放在注释里，不是执行记录）：
> `| XT-MKT-OPEN-001 | tx-fork-v0.3.2-260902 · 13880f2 | RPC | PASS | GAP | — | orderKey 0x…；executionPrice=…；ΣΔ=0 | TestCode/artifacts/runs/2026-09-03T01…/… | 自动化 | 2026-09-03 |`

<!-- functional-results:start -->
| ID | 部署 · commit | 入口 | 合约层 | 前端层 | 交叉一致 | 实际结果 | 证据 | 执行人 | 日期 |
|---|---|---|---|---|---|---|---|---|---|
| CT-BASE-001 | tx-fork-v0.3.2-260902-2305 · 13880f2 | RPC | PASS | — | — | eth_chainId=99911=CURRENT=manifest；latest 46296769 > forkBlock 46296406；forkOf→release-v0.3.2 与目标一致；绑定 bytecode 校验通过（7/7） | TestCode/artifacts/runs/2026-09-02T161000-175Z/attachments/CT-BASE-001-tx-fork-r0-0-ct-base-001-evidence.json | 自动化 | 2026-09-03 |
| CT-BASE-002 | tx-fork-v0.3.2-260902-2305 · 13880f2 | RPC | PASS | — | — | 37 个核心合约地址有码且 codehash 与 release-v0.3.2 编译产物一致（78/79，wnt 为 Base Sepolia 预部署 WETH9 记 NOT_EXERCISED） | TestCode/artifacts/runs/2026-09-02T161000-175Z/attachments/CT-BASE-002-tx-fork-r0-0-ct-base-002-evidence.json | 自动化 | 2026-09-03 |
| CT-BASE-003 | tx-fork-v0.3.2-260902-2305 · 13880f2 | RPC | PASS | — | — | 市场 #1 MockBTC/#2 ETH/#3 FXMOCK：Reader 市场元数据（index/collateral/vault/decimals）与 manifest 一致（15/15） | TestCode/artifacts/runs/2026-09-02T161000-175Z/attachments/CT-BASE-003-tx-fork-r0-0-ct-base-003-evidence.json | 自动化 | 2026-09-03 |
| CT-BASE-004 | tx-fork-v0.3.2-260902-2305 · 13880f2 | RPC | PASS | — | — | 合成 BTC 无码、PRICE_FEED_MULTIPLIER=1e34 反推 18 位 = manifest 18；USDC 6 位；ETH 18 位（8/8，1 项 NOT_EXERCISED） | TestCode/artifacts/runs/2026-09-02T161000-175Z/attachments/CT-BASE-004-tx-fork-r0-0-ct-base-004-evidence.json | 自动化 | 2026-09-03 |
| CT-BASE-005 | tx-fork-v0.3.2-260902-2305 · 13880f2 | RPC | PASS | — | — | 探针账户 USDC 10000、ETH 10、Router 授权 ≥ 按 MIN_POSITION_SIZE_USD/MIN_COLLATERAL_FACTOR/POSITION_FEE_FACTOR 推导的下限；LP Vault totalAssets 500000 USDC（8/8） | TestCode/artifacts/runs/2026-09-02T161000-175Z/attachments/CT-BASE-005-tx-fork-r0-0-ct-base-005-evidence.json | 自动化 | 2026-09-03 |
| CT-BASE-006 | tx-fork-v0.3.2-260902-2305 · 13880f2 | RPC | PASS | — | — | MIN_COLLATERAL_USD=0、MIN_POSITION_SIZE_USD=10 USD；三市场 MIN_COLLATERAL_FACTOR/MAX_OPEN_INTEREST/RESERVE_FACTOR/MAX_POSITION_SIZE_USD 非零且与参数快照一致（18/18）；L_min 无链上键 | TestCode/artifacts/runs/2026-09-02T161000-175Z/attachments/CT-BASE-006-tx-fork-r0-0-ct-base-006-evidence.json | 自动化 | 2026-09-03 |
| CT-BASE-007 | tx-fork-v0.3.2-260902-2305 · 13880f2 | RPC | PASS | — | — | 三 token 的 PRICE_FEED/PRICE_FEED_MULTIPLIER/provider 绑定与 Mock feed 登记一致，feed 报价 > 0；MAX_ORACLE_PRICE_AGE=60 s 仅对 DataStream 生效（17/17，3 项 NOT_EXERCISED：尚无成交无 Oracle min/max） | TestCode/artifacts/runs/2026-09-02T161000-175Z/attachments/CT-BASE-007-tx-fork-r0-0-ct-base-007-evidence.json | 自动化 | 2026-09-03 |
| CT-BASE-008 | tx-fork-v0.3.2-260902-2305 · 13880f2 | RPC | PASS | — | — | CONTROLLER/CONFIG_KEEPER/ORDER_KEEPER 等 manifest 角色 hasRole=true；非 keeper 调 executeOrder 与 LIMITED 账户改非白名单键均 Unauthorized(role 精确匹配)；LIMITED 夹具授权在 evm_snapshot 内并已回滚（21/21） | TestCode/artifacts/runs/2026-09-02T161000-175Z/attachments/CT-BASE-008-tx-fork-r0-0-ct-base-008-evidence.json | 自动化 | 2026-09-03 |
| XT-BASE-009 | tx-fork-v0.3.2-260902-2305 · 13880f2 | 页面 | — | GAP | — | 前端层未准入（admissionScope tx-fork:frontend=NOT_READY），spec 标 SKIP 未执行 | TestCode/artifacts/runs/2026-09-02T161000-175Z/results.json | 自动化 | 2026-09-03 |
| XT-MKT-OPEN-001 | tx-fork-v0.3.2-260902-2305 · 13880f2 | RPC | PASS | GAP | — | 市场 #4 开多 size 50 USD / 抵押 10 USDC（5x）：MarketIncrease 执行价 2032.7406 = max 2030×(1+0.135% 点差)、acceptablePrice=uint256.max、开仓费 10010 raw=applyFactor(size,2e26)/Pc.min、全平 pnl −0.8053 USD、trader USDC Δ −841204 raw = 瀑布重放值、五方守恒 ΣΔ=0（20/20） | TestCode/artifacts/runs/2026-09-02T170938-282Z/attachments/XT-MKT-OPEN-001-tx-fork-r0-0-xt-mkt-open-001-evidence.json | 自动化 | 2026-09-03 |
| XT-MKT-OPEN-002 | tx-fork-v0.3.2-260902-2305 · 13880f2 | RPC | PASS | GAP | — | 市场 #4 开空 size 50 USD / 抵押 10 USDC（5x）：执行价 1997.2999 = min 2000×(1−0.135%)、acceptablePrice=0、开仓费 10010 raw、全平 pnl −0.8186 USD、trader USDC Δ −854492 raw = 瀑布重放值、ΣΔ=0（20/20） | TestCode/artifacts/runs/2026-09-02T170938-282Z/attachments/XT-MKT-OPEN-002-tx-fork-r0-0-xt-mkt-open-002-evidence.json | 自动化 | 2026-09-03 |
| XT-MKT-LEV-003 | tx-fork-v0.3.2-260902-2305 · 13880f2 | RPC | PASS | GAP | — | L_min=1x 等号（页面规则，链上无最小杠杆键）：开多 size 50 USD / 抵押 50 USDC 成交，毛杠杆 1.000000x；开仓费 10010 raw、全平 USDC Δ −841204 raw = 重放值（20/20） | TestCode/artifacts/runs/2026-09-02T170938-282Z/attachments/XT-MKT-LEV-003-tx-fork-r0-0-xt-mkt-lev-003-evidence.json | 自动化 | 2026-09-03 |
| XT-MKT-LEV-004 | tx-fork-v0.3.2-260902-2305 · 13880f2 | RPC | PASS | GAP | — | L_min=1x 等号（short）：开空 size 50 USD / 抵押 50 USDC 成交，毛杠杆 1.000000x；全平 USDC Δ −854494 raw = 重放值（20/20） | TestCode/artifacts/runs/2026-09-02T170938-282Z/attachments/XT-MKT-LEV-004-tx-fork-r0-0-xt-mkt-lev-004-evidence.json | 自动化 | 2026-09-03 |
| XT-MKT-LEV-005 | tx-fork-v0.3.2-260902-2305 · 13880f2 | RPC | PASS | GAP | FAIL | 合约层：size 1000 USD 二分 26 次得最小可成交抵押 21.829651 USDC（21.829650 被 LiquidatablePosition「min collateral for leverage」取消）→ 链上 L_max(毛)=45.8551x，= 链上模型 1/(minCF 0.5% + f_open 2e26 + f_close 5e26 + 价带损耗 1.6108%)（平仓腿按仓位建立后读数 improved/点差 0）；以 minFeasible 开仓→全平原子 20 项全过。交叉：前端公式 L_max=145.93x→页面上限 100x > 链上 45.86x（|Δ|=100.08x），页面公式不含 oracle 价带 1.478%（feed 2000 / 锚 2030）与分腿费率 | TestCode/artifacts/runs/2026-09-02T170938-282Z/attachments/XT-MKT-LEV-005-tx-fork-r0-0-xt-mkt-lev-005-evidence.json | 自动化 | 2026-09-03 |
| XT-MKT-LEV-006 | tx-fork-v0.3.2-260902-2305 · 13880f2 | RPC | PASS | GAP | FAIL | 合约层：short size 1000 USD 二分 26 次得最小抵押 22.095508 USDC → 链上 L_max(毛)=45.3033x，= 链上模型（loss = Pmax(1+0)/(Pmin(1−s_open)) − 1 = 1.6373%）；原子 20 项全过。交叉：页面上限 100x > 链上 45.30x（|Δ|=100.63x），同 LEV-005 成因 | TestCode/artifacts/runs/2026-09-02T170938-282Z/attachments/XT-MKT-LEV-006-tx-fork-r0-0-xt-mkt-lev-006-evidence.json | 自动化 | 2026-09-03 |
| FT-MKT-LEV-007 | tx-fork-v0.3.2-260902-2305 · 13880f2 | 页面 | — | GAP | — | 前端层未准入，spec 已代码化并标 SKIP（基准 5x → 输入 0.99 → 观察拒绝/文案/提交/签名请求/挂单数）；前端事实：LeverageSection 直接拒绝 < 1 的键入且无提示，「明确拦截」是否成立待裁决 | TestCode/artifacts/runs/2026-09-03T083325-761Z/results.json | 自动化 | 2026-09-03 |
| FT-MKT-LEV-008 | tx-fork-v0.3.2-260902-2305 · 13880f2 | 页面 | — | GAP | — | 前端层未准入，spec 已代码化并标 SKIP（基准 5x → 输入 页面上限+0.01 → 观察封顶/拒绝/提交/签名请求/挂单数） | TestCode/artifacts/runs/2026-09-03T083325-761Z/results.json | 自动化 | 2026-09-03 |
| XT-MKT-COL-009 | tx-fork-v0.3.2-260902-2305 · 13880f2 | RPC | PASS | GAP | — | long 50 USD：链上 C_eff = 1.091424 USDC（模型 C* 差 1 raw，9 次探测）；C_eff−1 建单→Keeper 取消 LiquidatablePosition「min collateral for leverage」，remaining 0.24999945 < 0.25 USD；抵押 1,091,423 raw 全额退回、无仓位、订单离队；执行费被封顶为 0（basefee≈0）差额以 WNT 退回，无 keeper 费事件（15/15） | TestCode/artifacts/runs/2026-09-03T083325-761Z/attachments/XT-MKT-COL-009-tx-fork-r0-0-xt-mkt-col-009-evidence.json | 自动化 | 2026-09-03 |
<!-- functional-results:end -->

历史对照见 [v0.3.1/results.md](../v0.3.1/results.md)。

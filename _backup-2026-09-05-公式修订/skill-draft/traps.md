# 陷阱清单：写核对代码 / 设计断言 / 跑用例前必读

> 每条都是实测踩坑或逐行核实的硬事实。§1-§9 合约/公式层，§10-§12 流程/环境层。

## 1. DataStore 双重 key 编码（静默读 0）

同一合约两种基常量派生：`LIQUIDATION_GRACE_PERIOD_*` 用 `keccak256(纯字符串字节)`；`MIN_COLLATERAL_FACTOR`/`PRICE_FEED` 等用 `keccak256(abi.encode(string))`。抄错**不报错、读到 0**，且读到 0 无法区分"key 错"还是"真没配"。写断言前逐键核对 FX100Keys.sol 的派生方式。另：v0.3.1 的 `claimableFeeAmountKey`/`availableFeeAmountKey` 带 feeType 参数（v0.2.x 世代无），跨版本用旧签名恒读 0。

## 2. orderType 枚举与 GMX 不同序

0=MarketIncrease, 1=LimitIncrease, 2=MarketDecrease, 3=LimitDecrease(TP), 4=StopLossDecrease, 5=Liquidation, 6=StopIncrease——**无 Swap**。凭 GMX 直觉写常量必错，唯一权威 `src/order/Order.sol`。

## 3. EventEmitter indexed string topic

事件名 topic = `keccak256(raw UTF-8)`（ethers `id()` 语义），**不是** `keccak256(abi.encode(string))`——错了监听器静默抓不到任何事件。

## 4. 快照必须钉块 + Before 用 execBlock−1

- 单次快照内所有读数 pin 同一 `blockNumber`，否则零和必假失败（在途资金洞）。
- **Before = 执行交易区块−1（archive 读），After = 执行交易区块；禁止用 latest**——轮询后的 latest 可能已被后续区块污染。
- funding 的累加器/fundingUpdatedAt 的 Before **必须** execBlock−1（执行 tx 会覆写，执行块末态 dt 恒 0）；ADL 类 create+execute 原子交易的真 pre 同理。
- fork 上有 Service Keeper 抢跑现象：加"同块无第三方交易"检测，命中标 NOT_VERIFIED/POLLUTED。

## 5. 静默取消判别（每个 TX 的第一条检查）

OrderHandler try/catch 静默取消不 revert："订单离开 pending 队列"无法区分 Executed/Cancelled。必须按 orderKey 分计 OrderExecuted/OrderCancelled/OrderFrozen，解码 `reasonBytes`（区分 `Panic(0x11)` 类合约异常 vs `LiquidatablePosition` 等合理风控），并按预期结局断言。取消路径的核对模板：仓位状态纹丝不动 + `ΔTrader + ΔOrderVault === 0`（增单全额退款）。预期成功的用例必须带"仓位确实创建"的硬断言（防"全被取消测试仍绿"的 vacuous pass）；`vm.expectRevert`/异常捕获对 executeOrder 路径失效。

## 6. 发单资金前置校验

`collateral + relayFee + 开仓费(+关仓费预算) < USDC 余额`（严格小于、留余量）：普通模式 Pay=Collateral+开仓费一次性转出；Flash/relay 模式另加 **USDC 计价**的 relayFee（gas×ETH 价折算、约 30s 刷新浮动→必须留 buffer）；关仓费不预付但计入预算保证全流程不卡壳；executionFee 是 ETH/WNT 侧另算。余额不足的失败形态=创建 revert 或 relay 签名后失败，产生"无订单/无事件"空转用例。写进用例前置条件。

## 7. 事件自证与"独立度"

事件字段互加（如 protocolFee == feeReceiverAmount + feeAmountForPool）只是**恒等式**，不是核对——事件与状态若成对错则双双 PASS。给每条检查标独立度：FULL_RECOMPUTE（订单输入+区块参数独立重算）/ EVENT_ANCHORED（输入取事件、公式独立）/ IDENTITY（恒等式交叉）/ NOT_VERIFIED，不许 IDENTITY 冒充独立重算。执行价核对的输入若全取自被核对事件本身，且 dynamicSpread 未独立算，则该 PASS 建立在未验证字段上。

## 8. 期望值口径易错点

- 平仓 token 数与执行价无关（等比销账），拿执行价反推必错；限价单"按 trigger 成交"不是合约行为（trigger 只是闸门）。
- PnL/清算价的 entry 必须用**执行价**（sizeInUsd/sizeInTokens），不是 oracle/index 价。
- 杠杆约束压**净抵押**（含浮亏、pendingFunding），喂毛抵押会过度放行；openCost 只压新增 d，压整仓重复收费。
- 手续费两次 floor 与合并分母**恒等**（⌊⌊x/m⌋/n⌋=⌊x/(m·n)⌋，m,n 正整数）；差 1 wei 的是重排乘除（先除后乘）与 per-size 的中间乘回 1e30 式；瀑布顺序敏感（正 funding 先入押金、盈利先进 output、成本先扣 output）。
- 清算费不能一刀切 >0：穿仓时 fee=0 是正确行为（先判偿付型再断言）。
- skew 重算两坑：OI 用盯市口径（tokens×midPrice）；开仓 tokenDelta 用预备值（裸 index 价换算）非事件最终值。
- oracleProviderForToken 必须 2-arg key [Oracle合约, token]，单参旧键 revert。
- 宽限期**开仓即计时**（仅新仓写入、增仓不重置、keeper 尝试不启动不延长）→ 时序必须"先 set config 再开仓"。
- 严格相等（0 容差）的前提是**同序复刻**每一步截断；做不到就显式声明容差与理由，禁止事后偷偷放宽。

## 9. 账户圈与两套账

零和五账户圈 Trader/OrderVault/PositionVault/LPVault(totalAssets)/FeeHandler（v031-facts.md §2）；LP 槽必须 totalAssets() 非 balanceOf；claimable（DataStore 应收）与 ERC20 余额两套账各自守恒禁止相加；"OI==0"式清算断言假设单仓位——多仓并存用"减少量==被清算仓 sizeInUsd + tokens 侧 + 对侧不变"三件套。

## 10. TestCode 已知问题（2026-08-07 评审 → 2026-08-11 全面校对；完整清单见 TestCode/docs/reviews/2026-08-11-SCN-009-数据核对校对报告.md）

08-07 推导层批次一（✅）：ΔFeeHandler 改名（槽位 key 兼容存量）｜守恒独立分类｜4 处【恒等式】+【守恒推论】标注｜CALCULATED 行 expected 占位｜Grace 缺参数 NOT_VERIFIED 行。

08-11 P0 批次二（✅，SCN-009）：

- ✅ 七组五方守恒逐一进 check()（原先只写 observations，L1 零和总闸 FAIL 用例仍绿——审计 runner-01 高危）。
- ✅ after/参数快照钉 OrderExecuted 真实执行块，执行步 before=execBlock−1，加"创建块→execBlock−1 窗口纯净度"断言；全部快照断言 errors 为空（审计 feefund-01/cov-04/runner-02/runner-03）。
- ✅ 守恒行三态：UNVERIFIABLE→NOT_VERIFIED（不再误标 FAIL），PASS 前独立复算 Σterms 不信证据预存 sum（审计 ledger-04/conserve-01）。
- ✅ fee-funding 声明阶段缺 PositionFeesCollected 事件时输出 NOT_VERIFIED 兜底行，不再整组静默消失（审计 feefund-03）。
- ✅（附带）订单离队但找不到 OrderExecuted 事件时显式报错，不再当成功。

08-13 P1 批次三（✅，共享构造器方向守卫）：size↔token 四格取整按 isLong/isIncrease 分向（空头开仓 ⌈⌉；平仓全平恒等分支 + 部分平多 ⌈⌉/空 ⌊⌋）｜减仓 ΔTrader 换 processCollateral 瀑布重放（全平/部分平分支；全平偿付型与线性式等值）｜funding 市场级期望 Σmax 聚合、factor 行按执行 txHash 锚定｜balanceWasImproved/skewRef 换预备 tokenDelta 口径。helper 收敛在 src/reconciliation/formulas.ts（increaseSizeInTokens/decreaseSizeInTokens/preliminaryIncreaseTokens/decreaseWaterfall）。三 SCN 历史证据回放 253 行状态/期望零变化。

⬜ 仍待修：**P2**——OrderCancelled/reasonBytes 解码下沉公共模块；executionFee/WNT 零覆盖；`pass()` 字符串比较无 raw bigint/difference 字段；NOT_VERIFIED 不阻断整体 PASS（质量闸门）；runner check() fail-fast 断证据流；manifest 未登记 feeHandler/revenuePool/treasury。

## 11. 环境纪律

- **fork 时钟冻结陷阱**：Tenderly fork 只在有交易时出块，链上"最新区块时间"停在最后一次活动；而新交易挖出的区块用真实时钟。Mock Oracle 时间戳停在上次设价时刻 → 隔天执行订单必因价格过期（heartbeat/早于订单创建时间）被取消，且回滚后现场消失、只见 `eth_call reverted`。对策：跑批次前刷新 Oracle 时间戳（环境页 ④ Mock Oracle 价格 → "刷新时间戳"，或 `POST /api/mock-oracle-prices`）；SCN-009 runner 已内置执行前自愈（2026-08-12）。`setMockPrice` 无权限控制，admin RPC 免签名即可调。
- **改 mock 价必须同步 STABLE_PRICE 锚（2026-08-12 实案，reasonBytes 0xbc121108 实锤）**：v0.3.1 价格提供器（@v0.3.1 快照；`primary` 版本是否沿用待复核）在 `STABLE_PRICE(token) > 0` 时做双侧合并 `min=min(feed,stable)、max=max(feed,stable)`。只改 feed（60060→2000）不改锚 → min/max 撑开成 [2000, 60060] → 开多按 max≈60066 成交、清算校验按 min=2000 估值 → $50 仓位 PnL 瞬间 −$48 → `LiquidatablePosition("< 0")` 静默取消。**大幅改价三件套：feed 价 + 时间戳 + `DataStore.setUint(stablePriceKey(token), 新价×1e12)`**（admin 持 CONTROLLER 可直写）；USDC 的锚（$1.001 vs feed $0.999）是该机制的正常用法勿动。诊断路径参考：离队无 Executed → 同窗抓 OrderCancelled 解码 reasonBytes selector → ABI 全库映射选择器。另注意两点通用教训：①非持久模式 evm_revert 抹现场，"事后链上查无该单任何事件"≠"没取消过"；②拥挤 fork 上（实测 30 分钟 1.4 万块）eth_getLogs 有 20000 条/10MB 上限，取证须按 topic1=事件名过滤+分块。SCN-009 runner 已内置离队后取消判别+reason 解码（2026-08-12）。
- 压价只用 mock feed 市场；**测完每格立即复位 mock 价**（keeper 会用 stale 价秒吃后续新单）。
- 时间敏感用例用短 grace 真等，慎用 evm_increaseTime（时钟漂移 → MaxPriceAgeExceeded 等三连 revert）；`MAX_ORACLE_PRICE_AGE` 对 fork 偏紧可临时调大。
- Chainlink DataStream 必须 testnet 端点（mainnet 报文 → DigestNotSet）。
- 禁 `source .env`（密钥特殊字符炸 shell）；`NEXT_PUBLIC_*` 编译时注入，改后必须重启前端。
- 多人共用 keeper 队列会互相偷单——本地 Redis 或 namespace 隔离。

## 12. 引用外部结论的纪律

任何"已验证/通过"结论都是特定版本+特定 fork 的快照；在 `Docs/contract-releases/CURRENT.json` 所载基线上复核后才能引用（断言回 `primary`；环境实际部署版本见 `environments.*.forkOf` → `deployments[]`）。参考实现的覆盖表 ✅ 常指"代码已写"≠"实测通过"，引用前区分。

## 13. 当前 primary 增补（2026-09-05；出处为 `TestCase/E2E/ContractCodeSummary/<release>/` 四份详解与 versions 四篇；**事实本身见 v032-facts.md，本节只留「怎么被坑 + 防法」**）

1. **第 7 处改写不发事件**：全平时 `initialCollateralDeltaAmount` 强制置 0（`DecreasePositionUtils.sol:238-241`）无事件——不能用「没收到 AutoUpdated」推断「未改写」；全平的用户提取额恒 0，本金靠瀑布末步退回。→ 核心 §5.2 ⑦
2. **Path A / B 是优先 / 兜底，不是按界面二选一**：各界面先取 SDK `getLiquidationPrice`，仅下单预览与杠杆弹窗在其为 null 时回退 `estimateNewLiqPrice`（浮点）；证据记「这一次实际取到哪条」。通用防法：找到调用点后再看一层——它是主路径还是兜底。→ 前端 §6、核心 §18.5
3. **SDK 清算价的 impact 键是死键、borrowing 恒 0**：`POSITION_IMPACT_FACTOR` / `MAX_POSITION_IMPACT_FACTOR_FOR_LIQUIDATIONS` 在 src 无消费方（正常部署为 0；但 SDK 从 DataStore 读，环境配成非零则页面动、链上不动）；`pendingImpactAmount` / `pendingBorrowingFeesUsd` 对当前 ABI 恒 0。先读键确认为 0，也别因「现在为 0」删核对项。→ 核心 §18.5 / §18.9、前端 §5
4. **`evaluateTrigger` 是遗留路径**：提交路径不调用（keeper `IMPLEMENTATION.md` 明示、无非测试调用点）；现役是 `selectMinMaxSlot` 的 `triggerCheck`。引用 Keeper 行为前先 grep 调用点。→ Keeper §7 / §1.2
5. **`effectiveShortfallUsd` 是 Keeper 自减量**（`minCollateralUsdForLeverage − remainingCollateralUsd`），Reader `info` 无此字段，K 级派生量不作断言基准；`info` 是具名结构体、viem 返回对象，按 `info[0]` 取得 undefined → 静默 NaN。→ Keeper §4.1
6. **`formulas.ts::composeDynamicSpread` 仍是 floor-at-0**（无 min/max 入参，@v0.3.1 口径）——不可作当前 primary 点差佐证。→ 核心 §4.1
7. **funding 双锚点是假通过**：「先看链上实际值再选 v0.3.1/v0.3.2 锚、命中任一即 PASS」不是核对。事件取 f 与 per-size Δ 再对金额顶多 **EVENT_ANCHORED**、不得标 FULL_RECOMPUTE；FULL_RECOMPUTE 须从 execBlock−1 的 `fundingSkewEmaKey` 存态 + 成交前 OI + `getInt` 四参数重放 f。→ 核心 §10.2–10.5、§20.1
8. **skew EMA 是连续指数衰减，零 OI 会清零**：`alpha = exp(−dt/3600)`（3600 是时间常数不是采样间隔，本次 rawSkew 不进本次费率）；OI 归零后下一次执行把 `skewEMA` 写零、`fundingUpdatedAt` 照刷——跨「清仓→再开仓」不得沿用旧 EMA 快照。→ 核心 §20.1、§19.3
9. **空头同币种清算价分母可负可零**：`Q − A×scale ≤ 0` 时不等式翻向、`floor` 改 `ceil`，为零则该维度不可清算；SDK `getIsEquivalentTokens` 对「任一方 isSynthetic 且 symbol 相同」判等价会误入该分支（全局 USDC 抵押下链上不可达）。→ 核心 §18.2
10. **事件字段按名取，不按下标**：`PositionIncrease/Decrease` uintItems 16→15、`dynamicSpread` 迁 intItems 且 int256；按下标全错位、按 uint 解负点差得天文数字。→ 核心 §17.8、v032-facts §4
11. **不得写死 `/1e18`**：index token 不保证 18 位；合约 / oracle 价 `10^(30−d)`、SDK `TokenPrices` 恒 `1e30`/整枚，混用整体偏 `10^d` 且不 revert。→ 核心 §2.5、前端 §0
12. **开仓规模按含点差 executionPrice 回写，且 `usdDelta` 会被就地覆写**：`getIncreaseOrderSize` 的预解析量只喂 `getDynamicSpread`；`priceImpactSpread` 用原始 `sizeDeltaUsd`、随后 `getNextOpenInterest` 把 `usdDelta` 改成 `tokenDelta×mid` 再算 skew——拿预解析值当期望、或按覆写后值倒算 priceImpact 都必错。→ 核心 §23.1 步 2-8
13. **取整恒等式**：`⌊⌊x/m⌋/n⌋ = ⌊x/(m·n)⌋`（m,n 正整数）恒成立，拆 / 合同向分母不差 1 wei；差 1 wei 的是重排乘除（先除后乘）与 per-size 的 `⌊⌊a×r/1e30⌋×1e30/oi⌋`（中间乘回，非连续两次除）。→ 核心 §1.3、§10.4
14. **Keeper 报文选择两套规则**：普通单按侧挑极值（触发单先 `triggerCheck` 再取极值）；清算 / ADL 状态更新 / 抵押品取最新有效报文。期望执行价须复刻此选择或锚定事件 oracle 价。→ Keeper §1.1–1.2
15. **`Reader.isPositionLiquidatable` 不是执行等价物**：不预推 funding，真清算判定前先更新 funding，同报文下可不同号；Keeper 预检 `(false,true)` 与链上 gate `(true,true)` 不同，触 `MIN_COLLATERAL_USD` 线的仓位会被预检漏掉。→ 核心 §18.3
16. **双零 clamp**：`MIN/MAX_DYNAMIC_SPREAD` 未配 → `clamp(x,0,0)=0`，常数点差一并被吞（不是退回 floor-at-0）；`max<min` 坍缩成 `[min,min]` 不 revert。跑批前先读键。→ 核心 §4.1
17. **Reader 资金费预览 ×2 且恒取 long 侧**：前端 Owed / Margin / 杠杆分母（源自 `pendingFundingFeesUsd`）系统性偏大，差值随 `now − fundingUpdatedAt` 增长；属 Reader 路径，不影响真实结算。→ 台账 u07-5

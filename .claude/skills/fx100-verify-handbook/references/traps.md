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
- 手续费两次独立 floor，合并分母偶差 1 wei；瀑布顺序敏感（正 funding 先入押金、盈利先进 output、成本先扣 output）。
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

⬜ 仍待修：**P1 共享构造器方向守卫**——size↔token 四格取整只覆盖多头格（空头开仓 ⌈⌉、多头部分平 ⌈⌉，审计 ledger-02/formula-01）、PnL/减仓期望隐含全平假设（pnl-01/02）、funding 期望只取 fundingEvents[0] 未按 orderKey/Σ 聚合（ledger-03/feefund-02）、balanceWasImproved 用 after OI 而非预备 tokenDelta（formula-02）；**P2**——OrderCancelled/reasonBytes 解码下沉公共模块；executionFee/WNT 零覆盖；`pass()` 字符串比较无 raw bigint/difference 字段；NOT_VERIFIED 不阻断整体 PASS（质量闸门）；runner check() fail-fast 断证据流；manifest 未登记 feeHandler/revenuePool/treasury。

## 11. 环境纪律

- **fork 时钟冻结陷阱**：Tenderly fork 只在有交易时出块，链上"最新区块时间"停在最后一次活动；而新交易挖出的区块用真实时钟。Mock Oracle 时间戳停在上次设价时刻 → 隔天执行订单必因价格过期（heartbeat/早于订单创建时间）被取消，且回滚后现场消失、只见 `eth_call reverted`。对策：跑批次前刷新 Oracle 时间戳（环境页 ④ Mock Oracle 价格 → "刷新时间戳"，或 `POST /api/mock-oracle-prices`）；SCN-009 runner 已内置执行前自愈（2026-08-12）。`setMockPrice` 无权限控制，admin RPC 免签名即可调。
- 压价只用 mock feed 市场；**测完每格立即复位 mock 价**（keeper 会用 stale 价秒吃后续新单）。
- 时间敏感用例用短 grace 真等，慎用 evm_increaseTime（时钟漂移 → MaxPriceAgeExceeded 等三连 revert）；`MAX_ORACLE_PRICE_AGE` 对 fork 偏紧可临时调大。
- Chainlink DataStream 必须 testnet 端点（mainnet 报文 → DigestNotSet）。
- 禁 `source .env`（密钥特殊字符炸 shell）；`NEXT_PUBLIC_*` 编译时注入，改后必须重启前端。
- 多人共用 keeper 队列会互相偷单——本地 Redis 或 namespace 隔离。

## 12. 引用外部结论的纪律

任何"已验证/通过"结论都是特定版本+特定 fork 的快照；在本仓基线 release-v0.3.1 上复核后才能引用。参考实现的覆盖表 ✅ 常指"代码已写"≠"实测通过"，引用前区分。

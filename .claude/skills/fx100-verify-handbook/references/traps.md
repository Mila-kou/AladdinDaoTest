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

## 10. TestCode 已知问题（2026-08-07 评审快照，修复后此节过期）

- `ΔFeeReceiver` 槽实际读 FeeHandler 余额（ledger.mjs:56），命名错位；manifest 未登记 feeHandler/revenuePool/treasury 地址。
- after-execute 快照取 latest 非执行块（scn-009-runner.ts:502/575）；参数快照钉 afterOpen 块却标"执行区块参数"。
- SCN-009/010 无 OrderCancelled/reasonBytes 解码（仅 SCN-070 有，宜下沉公共模块）。
- executionFee/WNT 零覆盖；`pass()` 为字符串比较无 raw bigint；NOT_VERIFIED 不阻断整体 PASS；runner check() fail-fast 断证据流；CALCULATED 行 expected==actual 自身（宜改 INFO）。
- 事件自证 4 处：Protocol Fee 分账行、Total Cost 行、执行价行（输入取自被核对事件）、仓位字段==事件同名字段。

## 11. 环境纪律

- 压价只用 mock feed 市场；**测完每格立即复位 mock 价**（keeper 会用 stale 价秒吃后续新单）。
- 时间敏感用例用短 grace 真等，慎用 evm_increaseTime（时钟漂移 → MaxPriceAgeExceeded 等三连 revert）；`MAX_ORACLE_PRICE_AGE` 对 fork 偏紧可临时调大。
- Chainlink DataStream 必须 testnet 端点（mainnet 报文 → DigestNotSet）。
- 禁 `source .env`（密钥特殊字符炸 shell）；`NEXT_PUBLIC_*` 编译时注入，改后必须重启前端。
- 多人共用 keeper 队列会互相偷单——本地 Redis 或 namespace 隔离。

## 12. 引用外部结论的纪律

任何"已验证/通过"结论都是特定版本+特定 fork 的快照；在本仓基线 release-v0.3.1 上复核后才能引用。参考实现的覆盖表 ✅ 常指"代码已写"≠"实测通过"，引用前区分。

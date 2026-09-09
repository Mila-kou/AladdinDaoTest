# u10（§15 Relay Fee · §16 下单与订单字段字典）需求↔实现差异台账

分配的需求规范为两篇费用体系文档：

- 讨论版：`Docs/V0.3.1/需求文档/2026-06-15_FX100-费用收取与分配体系全面设计规范（讨论版-2026-06-13-定稿）.md`
- 实施版：`Docs/V0.3.1/需求文档/2026-07-22_FX100-费用收取与分配体系改造规范(实施版-2026-06-13).md`

补充参考（为 §16.6 定语义，非本次分配的主规范）：`Docs/v0.3.2/需求文档/2026-08-16_子账户槽位数量上限（MAX_SUBACCOUNT_SLOTS）设计讨论.md`

---

### Relay Fee 完全不在费用体系设计规范的覆盖范围内

- 需求规范：讨论版 §1.1「费用类型总览」共列 9 类费用（开/平仓手续费、资金费率净余额、动态点差、执行费、清算费、UI 手续费、推荐奖励、交易者盈利结算、交易者亏损结算），**没有 Relay Fee / gasless 代付费这一行**；实施版全文只在描述 `RevenuePool` 槽位时出现过 "keeper"，没有任何一节定义 relayer 垫付与补偿。
- 合约实现：`BaseRelayRouter.sol::_payRelayFee` 在每一笔 gasless 交易结束时，从主账户 `account` 向 `msg.sender`（relayer）划走 `feeAmount` 的 collateral token。这是一笔真实发生、用户可感知的资金流出，既不进 `FeeHandler`、也不进 `RevenuePool`/LP Vault，不出现在任何分账比例里。
- 差异：需求规范的"费用类型总览"不完备，漏掉了一整类用户实际支付的费用。
- 影响：（1）按该总览做费用对账/守恒的用例，在 gasless 路径上会出现无法解释的抵押品缺口；（2）产品侧无法从需求文档回答"gasless 下单用户一共被扣了多少、扣给了谁"；（3）分账比例设计没有考虑 relay fee，若未来想对 relay 抽成没有落点。
- 建议定性：设计已变更未回写文档（gasless/relay 在费用规范定稿之后才进主线，规范未增补）

### `IS_RELAY_FEE_EXCLUDED` 免收分支无任何需求侧定义

- 需求规范：两篇规范都没有出现 "免收 / 豁免 relay fee / 白名单 relayer" 的概念。与之相近的只有讨论版 §「执行费」一行的**条件性协议补贴**（大单/清算由协议承担 executionFee），那是另一套机制（按订单规模，写在 `GasUtils.isExecutionFeeSubsidizedAtCreation`）。
- 合约实现：`BaseRelayRouter.sol::_payRelayFee` 第一句 `if (dataStore.getBool(FX100Keys.isRelayFeeExcludedKey(msg.sender))) return;` —— 按 **relayer 地址**（`msg.sender`，不是用户账户）登记的布尔开关，命中即完全免收，且**不发 `RelayFeePaid` 事件**、不做 feeToken / cap / `maxFeeAmount` 任何校验。
- 差异：存在一个需求文档从未描述的、由治理配置的"这个 relayer 发起的交易一律不向用户收 relay fee"的开关。
- 影响：（1）测试若不知道该 key，会把"配置了免收的 fork 环境"的零扣款误判成缺陷，或反过来把生产环境的扣款误判成回归；（2）该分支不发事件，纯靠事件做账的索引器会漏掉"本笔交易 relay fee = 0 且是被豁免的"这一状态，与 `nativeFee == 0` 的分支（发 `feeAmount=0` 事件）不可区分；（3）豁免维度是 relayer 而非用户，同一用户换 relayer 就会被收费，产品侧对用户的费用承诺无法只看用户属性得出。
- 建议定性：设计已变更未回写文档（配置项本身是 by design，但缺少需求侧定义与免收时的可观测性）

### relay fee 的 fee token 被强制锁定为全局 `COLLATERAL_TOKEN`（v0.3.2 新增），需求侧无对应条款

- 需求规范：两篇规范均未规定 relay fee 用什么代币支付（因为整类费用就没写，见第一条）。
- 合约实现：`BaseRelayRouter.sol::_validateCall` 在 v0.3.2 新增两句 —— `collateralToken == address(0) → revert EmptyToken`；`relayParams.fee.feeToken != collateralToken → revert UnexpectedRelayFeeToken(feeToken, expected)`。v0.3.1 同一函数没有这段，客户端可任选 fee token。
- 差异：从"客户端可选"变成"链上强制单一 token"，是一次对外行为破坏性变更，需求文档没有记录。
- 影响：（1）沿用 v0.3.1 参数的客户端/SDK 在 v0.3.2 上全部回滚，且回滚点在业务动作之前，用户零扣款但订单也不会创建；（2）若部署时忘记设 `COLLATERAL_TOKEN`，**所有 gasless 路径（含 `removeSubaccount`/`removeSlot`）都不可用**，这是一个单点配置缺失导致整条链路瘫痪的风险点，部署手册必须把它列为必配项。
- 建议定性：设计已变更未回写文档

### 需求侧的"执行费由协议补贴"与 relay 侧的 relayer 垫付未做衔接说明

- 需求规范：讨论版 §「执行费」：`orderSize ≥ EXECUTION_FEE_SUBSIDIZE(marketIndex)` 阈值的大单及清算/ADL 由协议承担（executionFee=0），小单用户自付；Keeper 实际获得 `min(实际 gas × gasprice, executionFee)`，多余退还。**当前实现状态：机制完整，仅需配置阈值（建议如 $50,000）**。
- 合约实现：（a）`GasUtils.sol::isExecutionFeeSubsidizedAtCreation` 中阈值**未配置时读出 0**，`sizeDelta >= 0` 恒真 → 全部订单被补贴、`executionFee` 强制置 0；关闭补贴的唯一方式是把阈值写成哨兵 `type(uint256).max`。（b）在 gasless 路径下，"用户自付"实际是 relayer 先用自己的 WNT 垫付（`BaseRelayRouter.sol::_sendExecutionFeeFromRelayer`），累加进 `relayExecutionFee`，再随 relay fee 一起以 collateral token 向用户回收（`_payRelayFee`）。
- 差异：需求规范说的是"未配置阈值 = 机制待启用"，实现的默认语义却是"未配置 = 全量补贴"，方向相反；另外规范只描述了"用户自付"，没有描述 gasless 下这笔钱的实际垫付方与二次换币回收路径。
- 影响：（1）在阈值未配置的 fork 环境上，所有订单 `executionFee = 0`、`relayExecutionFee = 0`，按需求文档预期"小单用户应付执行费"的用例会全数误判为缺陷；（2）用户最终为执行费付出的是 collateral token 而非 WNT，且经过 `ceil(nativeFee × WNT.max / feeToken.min)` 一次换算，实付金额与 `order.executionFee` 不等值，账本核对不能把两者直接相减。
- 建议定性：需求表述模糊 +（默认值方向）缺陷候选 —— 建议至少把 `EXECUTION_FEE_SUBSIDIZE*` 列为部署必配项并在文档写明"0 = 全量补贴"

### `MAX_RELAY_FEE_SWAP_USD_FOR_SUBACCOUNT` 是已开白名单但无人读取的死配置

- 需求规范：两篇规范都没有提到该项（子账户 relay fee 上限在需求侧无对应条款）。
- 合约实现：`FX100Keys.sol:393` 定义常量，`Config.sol:458` 把它放进 `allowedBaseKeys`（治理可写），但全仓 `src/` 内**没有任何一处读取它**（唯一的用户侧上限是 `relayParams.fee.maxFeeAmount`，由用户自己在签名里给定）。
- 差异：存在一个可配置、看起来像风控上限、实际不生效的 key。
- 影响：运维/治理按名字理解会以为"给子账户的 relay fee 设了 USD 上限"，实际上没有任何保护；子账户路径下 relay fee 的唯一约束是用户签名里的 `maxFeeAmount` 与全局 `MAX_RELAY_SWAP_WNT_CAP`。
- 建议定性：缺陷候选（死配置，要么实现要么从白名单移除）

### `removeSubaccount` 不释放槽位，加满 4 个后换绑必然失败

- 需求规范：`Docs/v0.3.2/需求文档/2026-08-16_子账户槽位数量上限（MAX_SUBACCOUNT_SLOTS）设计讨论.md`：「`removeSubaccount`（按地址撤销）**不释放槽位**，只有 `removeSlot`（按名字）才真正腾出容量。」并注明"工程师已确认 by design"（`docs/bugs/BUGS.md` R6-B01）。
- 合约实现：`SubaccountUtils.sol::removeSubaccount` 只执行 `setAddress(subaccountSlotSubaccountKey(account, i), address(0))`，不动 `subaccountSlotKey` 与 `subaccountSlotActiveKey`；`SubaccountUtils.sol::addSubaccount` 的空位扫描条件是 `!isActive`，因此该槽位不会被复用，4 个槽位全 active 时新名字直接 `revert MaxSubaccountSlotsExceeded`。
- 差异：无（实现与该讨论文档记录一致）；但与"撤销一个子账户"的**用户直觉语义**相悖，且当前**没有任何需求/产品文档规定前端换绑设备的正确操作序列**。
- 影响：（1）用户在 4 台设备上都授权过、撤销其中一台后想授权新设备，会收到一个与操作无关的 `MaxSubaccountSlotsExceeded`；（2）前端若只实现 `removeSubaccount` 而不实现 `removeSlot`，用户会陷入永久无法新增子账户的状态，且链上没有自愈路径；（3）`removeSlot` 找不到匹配 slot 时**静默返回、不回滚不发事件**，前端无法据返回值判断是否真的释放成功，必须回读 `Reader.getSubaccountSlots`。
- 建议定性：设计已变更未回写文档（合约 by design，但缺少产品侧"更换设备 = removeSlot + addSubaccount"的流程规范；`removeSlot` 的静默失败单独可评为缺陷候选）

### `MAX_SUBACCOUNT_SLOTS = 4` 与产品侧"上线只允许 1 个"的意图未收敛

- 需求规范：同上讨论文档：「产品側提出：……上线时想只允许 1 个槽位同时生效」，并给出 A/B/C 三方案，结论是「讨论完成，给出建议方向，**尚未实施（合约无改动）**」。文档同时指出产品侧曾流传的"5"这个数字在仓库全部历史里都不存在。
- 合约实现：`SubaccountUtils.sol:33` `uint256 public constant MAX_SUBACCOUNT_SLOTS = 4;`（编译期常量），`Reader.sol:27` 重复声明同值；`Config.sol` 的两级白名单里没有任何 key 能改它。
- 差异：链上是 4 且不可配置，产品意图是 1；三个候选方案都未落地。
- 影响：（1）v0.3.2 的准入/回归用例必须按 4 个槽位设计，不能按"1 个"写期望值；（2）若后续采纳方案 A/C 重新部署，本节所有槽位用例（含上面那条 `MaxSubaccountSlotsExceeded` 场景）的边界值全部要改，属于已知的未来返工；（3）方案 C（改成 DataStore 变量）若被错误接入日常治理，"调小"会让高位 index 的已授权子账户瞬间失效、之后"调大"又会让它们复活 —— 该文档已明确要求排除这种用法。
- 建议定性：需求表述模糊（产品目标与链上事实不一致，且决策未闭环）

### `SubaccountApproval` 增加 `slot` 字段导致跨版本签名不兼容，需求侧无迁移说明

- 需求规范：无（两篇费用规范不涉及；槽位讨论文档只描述存储模型，未描述签名结构变更与客户端迁移）。
- 合约实现：`RelayUtils.sol::SUBACCOUNT_APPROVAL_TYPEHASH` 从 v0.3.1 的 9 字段变为 v0.3.2 的 10 字段（第 2 位插入 `string slot`），`getSubaccountApprovalStructHash` 用 `keccak256(bytes(slot))` 编码；同时 `SubaccountRouter.addSubaccount` 的 ABI 从 `(address)` 变成 `(address,string)`，新增 `removeSlot(string)` 与 `RemoveSubaccountSlot` typehash。
- 差异：EIP-712 typehash 与外部 ABI 双双破坏性变更，没有版本协商或兼容层。
- 影响：（1）v0.3.1 签发的 approval 在 v0.3.2 上会恢复出错误签名者，报 `InvalidRecoveredSigner`（且会先经过 `Minified` 兜底路径再报错，错误现场不直观）；（2）按记忆卡 `Docs/v0.3.2/需求文档` 记录，`fx100-apps` 前端目前仍对接 v0.3.1 的无上限旧模型、`SubaccountApproval` 连 `slot` 字段都没有 —— 前端子账户功能在 v0.3.2 上属于**未实现**而非"有缺陷"，相关前端层用例应记 GAP 而非 FAIL（前端当前 commit 未在本轮核实）。
- 建议定性：设计已变更未回写文档

### 本文档 §21 速查表把 `relayExecutionFee` 写成 `fixedFee`（文档内部矛盾，非需求↔实现差异）

- 需求规范：不适用。
- 合约实现：`BaseRelayRouter.sol:38` `uint256 private relayExecutionFee;`，由 `withRelay` 每次清零、由 `_sendExecutionFeeFromRelayer` 在本次 relay 调用内逐笔累加 relayer 垫付的订单执行费，取值随本次 batch 内容变化。
- 差异：§21 原「Relay | Native Fee | `ceil(relayGas×gasPrice×multiplier)+fixedFee`」把它写成了一个固定配置项，与 §15.2 冲突。
- 影响：按速查表算期望值会把一个随 batch 变化的量当成常量，gasless 批量下单的 relay fee 期望值必然算错。
- 建议定性：缺陷候选（文档缺陷）
- **状态更新（复核后回填）**：§21 改写稿已把该行改成 `+ relayExecutionFee` 并注明「不是固定费」，跨单元冲突已消除；§15.2 正文里原来指向 §21 的纠错括注同步删除（改成直接说明它随本次 relay/batch 变化），避免拼回后出现一句指责已被修正内容的错话。

### 执行费封顶（`maxExecutionFee` / `HOLDING_ADDRESS`）在需求侧无定义，且曾被本文档误判为不可达代码

- 需求规范：两篇费用规范只写「执行费 = keeper 预算 + 条件性协议补贴」，没有任何一节定义"执行费上限"「超额部分归属」与 `HOLDING_ADDRESS` 这个归集地址。
- 合约实现：`GasUtils.sol::validateAndCapExecutionFee` 在 `shouldCapMaxExecutionFee = true` 时按 `applyFactor(gasLimit × basefee, MAX_EXECUTION_FEE_MULTIPLIER_FACTOR)` 封顶，超额部分由 `GasUtils.sol::transferExcessiveExecutionFee` 转入 `HOLDING_ADDRESS`（未配置则 `revert EmptyHoldingAddress`）。v0.3.2 六个调用点中，只有 `SubaccountRouter.sol::createOrder`（`params.addresses.callbackContract != address(0)`）与 `::updateOrder`（`order.callbackContract() != address(0)`）会传 true，`ExchangeRouter` 与 `BaseRelayRouter` 恒传 false。
- 差异：（1）需求侧没有该机制；（2）本文档改写第一稿曾断言「四个调用点全部传 false，封顶分支不可达」，漏掉了 `SubaccountRouter` 的两个条件调用点——已在 §16.1 更正。
- 影响：若沿用「不可达」的结论，子账户 + `callbackContract` 路径的执行费封顶、`InvalidExecutionFee` 回滚、`ExcessiveExecutionFee` 事件与 `HOLDING_ADDRESS` 资金归集将整块漏测；而 `SubaccountRouter` 在 v0.3.2 已部署（`ignition/deployments/tx-fork-v032-260902r4/deployed_addresses.json` 的 `Fx100Execution#SubaccountRouter`），属可测路径。
- 建议定性：设计已变更未回写文档（合约 by design，需求侧缺定义；文档误判部分已在本轮修正）

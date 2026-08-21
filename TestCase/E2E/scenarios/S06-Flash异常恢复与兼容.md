---
project: fx100
layer: e2e
suite: S06
title: Flash、异常恢复与兼容
cases: 12
status: draft
---

# S06 Flash、异常恢复与兼容

**目标**：验证高频交易、会话安全、幂等、依赖故障恢复、移动端和本地化。

**主要依据**：Flash 安全评审与 07-28 consent 定案、执行费/Relay 实施版、Oracle 规范、UI/UX 回归文档。

| ID / 优先级 | 角色与意图 | 前置条件 | 测试数据 | 用户操作步骤 | 核对数据与期望结果 | 实际结果 / 恢复清理 |
|---|---|---|---|---|---|---|
| SCN-053 / P0 | 高频交易员启用 Flash 后连续交易 | Flash consent/approval 已完成；permit 已做 | 连续开、改、撤、平各一次 | 1. 执行四种动作；2. 统计钱包弹窗和 tx | 建立后正常动作不再逐笔弹主钱包；业务结果与 Standard 等价；每个动作有唯一 request/orderKey；费用不超 maxFeeAmount | 待执行；全平并撤单 |
| SCN-054 / P1 | 用户在 Standard 与 Flash 间切换 | 两种模式可用 | Standard→Flash→Standard | 1. 切模式；2. 各下一笔可清理订单 | Standard 逐笔签名；Flash 使用交易密钥；切换不改变已存在订单/持仓；按钮闪电和文案匹配模式 | 待执行；清理订单 |
| SCN-055 / P0 | Flash consent 版本升级后重新留证 | 已保存旧 consent；可切测试版本 | V1→V2 | 1. 打开 Flash；2. 观察同意流程；3. 续期 approval | 同版本不重复要求风险签名；版本变化必须重新同意；Terms/Privacy 连接披露与 1CT 风险同意分开 | 待执行；恢复正式版本数据 |
| SCN-056 / P0 | 高频交易员一键全撤，避免只撤一部分 | Flash 下有多笔 ETH/BTC 挂单 | Cancel All | 1. 记录全部 orderKey；2. 一键全撤；3. 制造其中一步失败再重试 | 原子性：全撤或全不撤；成功后所有抵押退款、历史完整；失败不留下半撤状态；只产生一次用户授权流程 | 待执行；确认无挂单 |
| SCN-057 / P0 | 用户断开一键交易并撤销本设备权限 | Flash active；本地有 key | Disconnect | 1. 断开；2. 检查链上授权和本地状态；3. 尝试 Flash 下单；4. 重新建立 | 旧 key 不可再交易；本地敏感状态清除；重建用新/沿用 key 符合部署版本；旧授权不形成孤儿权限 | 待执行；最终撤销测试授权 |
| SCN-058 / P1 | 授权到期、保持连接和多设备行为 | 两设备/两个浏览器；可推进授权时间 | 当前部署有效期；保持连接开/关 | 1. 设备 A 建立；2. 设备 B 登录；3. 重开浏览器；4. 推进到期；5. Reconnect | 会话按设备/账户隔离；持久化符合设置；到期后按钮进入 Reconnect，不能下单；重连成功后需再次点击才下单；记录部署是旧 24h/90 还是目标 90d/大额度 | 待执行；撤销两设备授权 |
| SCN-059 / P0 | Relay/keeper 超时下防重复下单 | 可暂停 relay/keeper | 单笔 Flash 或 Standard 订单 | 1. 提交；2. 连点按钮/刷新；3. 等待 60s；4. 恢复服务 | 页面保持 Pending 并禁止重复意外提交；恢复后只执行一次；若需手工重试，必须先按 orderKey/nonce 查状态 | 待执行；恢复服务并清理 |
| SCN-060 / P0 | Oracle 过期、偏离或 Sequencer 故障后恢复 | 已有挂单/仓位；可注入三类故障 | stale、>2% deviation、sequencer down | 1. 尝试开/平/清算；2. 查看提示；3. 恢复；4. 重试 | 协议冻结但订单/资金保持；页面不误报 Cancel/Freeze；恢复窗口后可重试；K 线仍显示时不能误导为可成交价格 | 待执行；恢复 oracle/sequencer |
| SCN-061 / P1 | RPC 断开和钱包拒签的本地恢复 | 可断网；钱包可拒绝 | 提交前/签名中/广播后三阶段 | 1. 各阶段断网或拒签；2. 恢复；3. 查询 tx/order | 提交前无副作用；拒签不创建订单；广播后未知状态先查链上再决定，不重复发送；页面给出可执行恢复操作 | 待执行；恢复网络 |
| SCN-062 / P1 | Indexer 延迟下页面最终一致 | 链上交易成功；可延迟 indexer | 开仓、撤单、全平各一组 | 1. 完成 tx；2. 暂停索引；3. 刷新；4. 恢复 | 页面区分“链上成功/数据同步中”；不把旧列表判为交易失败；恢复后无重复行、计数正确；Reader 可作为临时权威源 | 待执行；恢复 indexer |
| SCN-063 / P2 | 移动端完成核心交易与风险操作 | 375×812、390×844、812×375 | 选市场、下单、TP/SL、加保证金、全平 | 1. 三视口执行不广播的完整表单；2. 至少一组 smoke 真实提交 | 无横向不可恢复溢出；虚拟键盘不遮挡输入/CTA；图表与 Flash 弹窗可退出；危险态 CTA 可达 | 待执行；重置视口 |
| SCN-064 / P2 | 多语言/数字/日期与账户隐私回归 | zh/en/ja/ko；US/其他数字格式；账户 A/B | 动态行情、负数 Funding、历史日期 | 1. 切语言/格式；2. 切账户；3. 刷新 | 数值经济含义不变；正负号、千分位、小数点、时区日期正确；无关键中英混杂；切账户不闪现前一账户数据 | 待执行；恢复默认语言/格式 |

## 套件退出条件

- Relay、keeper、RPC、oracle、sequencer、indexer 全部恢复；
- Flash 测试授权和本地 key 已按计划撤销；
- 无残留挂单/持仓；
- 浏览器语言、格式和视口恢复默认。

## v0.3.2 增补（SCN-B32）

> 2026-08-21 收编自 `Docs/contract-releases/v0.3.2/05-重要参数边界场景.md`（卡片 B32-3-01/03、B32-4-01～05、B32-10-01～04，组 3/4/10）；台账见 [`../SCENARIO-CHECKLIST.md`](../SCENARIO-CHECKLIST.md) 文末「v0.3.2 增补场景」。本节不计入头部 `cases: 12`，也不改动 SCN-053～064。B32-3-02/04（建市组合约束与写入权限）与 B32-8-01/02（Vault 提款校验）为非用户旅程，落域级用例 [`../case/IT-v0.3.2-VAULT-MARKET.md`](../case/IT-v0.3.2-VAULT-MARKET.md)。关联：SCN-053/055/057/058 为 Flash 会话层回归，SCN-B32-04/08 给出其 v0.3.2 链上对应物。

| ID / 优先级 | 角色与意图 | 前置条件 | 测试数据 | 用户操作步骤 | 核对数据与期望结果 | 实际结果 / 恢复清理 |
|---|---|---|---|---|---|---|
| SCN-B32-03 / P0 | Flash/Relay 用户在全局 COLLATERAL_TOKEN 未配置或 feeToken 不符时被明确拒绝（v0.3.2 强约束） | v0.3.2 tx-fork + Relay 签名服务（新 EIP-712 域）；数据集①：`DataStore.getAddress(FX100Keys.COLLATERAL_TOKEN)`=address(0)（未执行 ignition `SetCollateralToken` 或 CONTROLLER 清空）；数据集②：该键=USDC、用户已授权 Relay；与 SCN-059 同环境执行 | 数据集①（=B32-3-01）a) MARKET_KEEPER 调 `createMarket(indexToken)`，b) 合法签名 Relay 请求 feeToken=USDC；数据集②（=B32-3-03）同一笔子账户/Relay 下单请求仅变 `relayParams.fee.feeToken`：F1=USDC、F2=WETH、F3=address(0) | 1. 只读确认键值；2. 分别构造、签名并提交各组请求；3. 记录交易成败与 revert 选择器/参数；4. 恢复键值=USDC | 推导见 05 卡片 B32-3-01/03（`MarketFactory.sol::createMarket` 首校验 `collateralToken == address(0)`；`BaseRelayRouter.sol::_validateCall` 先查全局键非零再比 `relayParams.fee.feeToken != collateralToken`）：① a/b 均 revert `FxErrors.EmptyToken()`——未配置=建市与全部 Relay 关断（v0.3.1 无此键、无此约束）；② F1 通过校验进入后续流程；F2 revert `UnexpectedRelayFeeToken(WETH, USDC)`；F3 revert `UnexpectedRelayFeeToken(address(0), USDC)`（零地址在 `_validateCall` 已截获，走不到 `_handleRelayFee` 的 EmptyToken 分支） | 待执行（需 v0.3.2 部署环境）；恢复 COLLATERAL_TOKEN=USDC，清理订单 |
| SCN-B32-04 / P0 | Flash 用户管理 4 个子账户槽位（增/改/删/复用/开关）并在升级后用新 EIP-712 结构重签 | v0.3.2 tx-fork（`SubaccountRouter` 直连）+ Relay + 签名服务（可分别按 v0.3.1/v0.3.2 typed data 出签）；主账户 A 初始无槽位（4 键组缺省 slot=""、subaccount=address(0)、isActive=false）；数据集④ 需活动子账户 S1 且 integrationId 已配置、CONFIG_KEEPER 可写开关；数据集⑤ A 私钥可控（测试钱包） | ①（=B32-4-01）S1..S5 依次 `addSubaccount(Si,"si")`；②（=B32-4-02）A 已有 "s1"→S1(index0)、"s2"→S2(index1)，a) `addSubaccount(S9,"s1")` b) `addSubaccount(S2,"s3")`；③（=B32-4-03）a) `removeSubaccount(S1)` b) `removeSlot("s2")` c) `addSubaccount(S3,"s3")`，再用 S1/S2 各下一单；④（=B32-4-04）a) 非槽位地址 X 以子账户身份为 A 下单，b) 置 `SUBACCOUNT_INTEGRATION_DISABLED(integrationId)=true` 后 S1 下单；⑤（=B32-4-05）a) 按 v0.3.1 `SubaccountApproval`（无 `string slot`）签名走 Relay 授权，b) 按 v0.3.2 结构重签同请求，c) `REMOVE_SUBACCOUNT_SLOT_TYPEHASH` 新流程 removeSlot | 每组：1. 执行调用；2. `Reader.getSubaccountSlots(A)` 读 4 槽三元组 {slot, subaccount, isActive}；3. 记录 `AddSubaccount` 事件 slotIndex/slot 与 revert 选择器；④ 关开关回归；⑤ 记录签名校验结果与槽位状态 | 推导见 05 卡片 B32-4-01～05（`SubaccountUtils.sol::MAX_SUBACCOUNT_SLOTS=4 / addSubaccount / removeSubaccount / removeSlot / validateSubaccount / validateIntegrationId`；`RelayUtils.sol::SUBACCOUNT_APPROVAL_TYPEHASH`）：① 前 4 次成功 slotIndex 依次 0/1/2/3，第 5 次 revert `MaxSubaccountSlotsExceeded(A)`（边界由常量决定，不可运营调整）；② a) index0 更新为 {"s1",S9,true}、活动槽仍 2（同名有效槽 add 视为更新），b) revert `DuplicateSubaccount(A,S2)`；③ a) index0 地址清 address(0) 但槽名与 isActive 保留，b) index1 isActive=false，c) 新增落入第一个非活动槽 index1，S1/S2 下单均 revert `SubaccountNotAuthorized(A,Sx)`（validateSubaccount 只匹配 isActive && 地址相等）；④ a) revert `SubaccountNotAuthorized(A,X)`，b) revert `SubaccountIntegrationIdDisabled(integrationId)`，关断后恢复可下单；⑤ a) 旧签名校验失败 revert（typehash 增 `string slot` → digest 不同，具体错误以实现为准），b/c 成功——所有已缓存旧授权签名作废需强制重签 | 待执行（需 v0.3.2 部署环境）；移除测试槽位，关闭 integration 开关，撤销测试授权 |
| SCN-B32-08 / P0 | 升级演练：v0.3.1 存量仓位 / 每市场 collateralToken / 旧子账户授权 / claimCollateral 调用方在 v0.3.2 上的行为 | 部署前置：在 v0.3.1 部署态（或 tx-fork 升级演练）创建多头仓位（含非零 funding per-size 快照）、经旧 `addSubaccount(address)` 授权 S1（写入 SUBACCOUNT_LIST）、27 市场每市场 collateralToken 槽位已有值（@v0.3.1 快照均 USDC，04 §4 表末行）；随后按 `02-部署与升级手册.md` 原位升级至 v0.3.2 并配置 clamp 两键；数据集② a 组未写全局 COLLATERAL_TOKEN、b 组已写 USDC；数据集④ 持有 v0.3.1 ABI 的调用方 | ①（=B32-10-01）存量仓位做一次部分减仓；②（=B32-10-02）Reader 读 market.collateralToken，建市/Relay 各一笔；③（=B32-10-03）`Reader.getSubaccountSlots(A)`、S1 为 A 下单、A 按新 ABI `addSubaccount(S1,"main")` 后重试；④（=B32-10-04）按 v0.3.1 selector 调 `ExchangeRouter.claimCollateral(...)`、CONFIG_KEEPER 调 `Config.setClaimableCollateralFactorForTime(...)` | 1. 升级前记录仓位五要素（sizeInUsd / sizeInTokens / collateral / 两 funding 快照）；2. 升级 + 配置；3. 逐组执行并读 funding 结算额、dynamicSpread 来源、market.collateralToken、4 槽状态、revert 形态；4. `cast sig` 比对新 ABI 无对应 selector，并核对 `scripts/configureGeneral.ts` 不再写 delay/divisor 两键 | 推导见 05 卡片 B32-10-01～04：① 仓位存储键与 funding per-size 键 v0.3.2 无 key 变化（04 §3.9），存量仓位字段原样可读；减仓 funding 按「市场最新 per-size − 仓位快照」逐仓结算且现金流走 `settleFundingFees` 新时点，执行价走 int256 clamp 链路；若漏配 clamp 键即落 SCN-B32-01 数据集① 事故（点差恒 0）——升级后首笔存量动作是第一现场；② a) `MarketStoreUtils.sol::get` 一律读全局键 → market.collateralToken=address(0)，建市/Relay 按 SCN-B32-03 ① revert `EmptyToken`（旧每市场槽位为孤儿数据不被消费），b) 写全局键后恢复 USDC——`SetCollateralToken` 是升级硬前置（fullKey 哈希不同，不能因链上旧值而跳过）；③ 升级后 4 槽全空（SUBACCOUNT_LIST 键已删除、槽位键从未写过），S1 下单 revert `SubaccountNotAuthorized(A,S1)`，重授权后成功——无自动迁移，需产品侧强制重授权；④ 两调用均失败 revert（v0.3.2 已删 `claimCollateral`、`setClaimableCollateralFactorForTime/ForAccount` 与 CLAIMABLE_COLLATERAL_* 六键，合约无对应 selector），以调用失败 + `cast sig` 比对为证 | 待执行（需 v0.3.2 部署环境；另受 v0.3.1→v0.3.2 升级路径阻塞）；保留升级演练快照，全平仓位 |

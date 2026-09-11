# tx-fork@v0.3.2 离线读检与参数对账记录（02 §18.1 第 1～4、7 项 + 06 §5 A-3）

> 核对对象：`tx-fork-v0.3.2-260902`（Ignition deployment-id `tx-fork-v032-260902r3`），chainId 99911，参数快照 block `46282993`，合约 `release/v0.3.2` @ `13880f2`。
> 方式：全部离线，以同目录 `parameters.json` / `roles.json` / `tokens.json` / `deployed-addresses.json` 为链上真值，以 `ignition/` 与 `configure-inputs/` 归档件为输入，用脚本按 `FX100Keys.sol` 的 key 构造与三个 configure 脚本的换算规则逐键复算；每项结论再由独立的反向复核过一遍（复核把 3 条 FAIL 改判为 NOT_STATED，见下）。原始报告与复核报告见 `verification/`（roles / configure / catalog 各一份加对应 recheck）。
> 第 5、6 项为在线读检，见 `read-checks-live-2026-09-02.md`。

## 一、02 §18.1 七项读检

| # | 检查 | 期望 | 实际 | 结果 |
| --- | --- | --- | --- | --- |
| 1 | `DataStore.getAddress(COLLATERAL_TOKEN)` | = USDC | `0xf300bbfb89106f54794aab6f7554ecfdaf32e154` = `tokens.json` USDC | PASS |
| 2 | `MIN/MAX_DYNAMIC_SPREAD` ×2 市场 ×2 方向 | 输入 `market.sample.json` `-0.02` / `1.0` ×1e18 | 8 条全部 `-20000000000000000` / `1000000000000000000` | PASS |
| 3 | `DataStore.getAddress(FEE_RECEIVER)` | = RevenuePool | `0x48473691c59750ee8d1fa45cbad29f08d38092ac` = `deployed-addresses.json` `Fx100Fee#RevenuePool` | PASS |
| 4 | `hasRole(CONTROLLER, OrderHandler)` 及 02 §9.2 角色矩阵 | 32 对 DataStore（角色, 持有人）全部存在；旧地址无角色 | 32/32 存在；`hasRole(CONTROLLER, OrderHandler)` = true；22 个 v0.3.1 地址均不持有任何角色；11 个角色哈希与 `Role.sol` 一致 | PASS，带一处已解释偏差（见二） |
| 5 | `BaseRelayRouter.getDomainSeparator()` | 与 `RelayUtils.sol` 常量本地计算一致 | RelayRouter 与 SubaccountRelayRouter 均一致 | PASS（在线） |
| 6 | `Reader.getSubaccountSlots` | 4 槽结构 | 长度 4，默认态全空 | PASS（在线） |
| 7 | 复跑三个 configure 脚本零 `applied` | 链上值 = 输入文件换算值 | 120/120 写入项由归档输入精确复现（key 哈希 + 类型 + 值），其余 12 条已设置值均归因于 createMarket / Ignition / configureOracle 的时间戳副作用 | PASS（离线等价），带一条重要限制（见二） |

## 二、偏差、限制与待决事项

1. **角色矩阵偏差（已解释，未在 02 §9.2 登记）**：DataStore CONTROLLER 比 §9.2 多一个成员，即 TestCode 的 E2E 管理账户 `0xf82cf35c5c0019861c2cdc65041c8ac32970d403`。来源是 `TestCode/scripts/deploy-contracts.ts` 第 8 步的测试夹具授权（`roles.json` grants[4]，manifest `roles.controller`），用于 fork 上免签名直写 DataStore；属测试环境便利，不得复制到生产。此外该账户同时持有 TIMELOCK_ADMIN、CONFIG_KEEPER、LIMITED_CONFIG_KEEPER、MARKET_KEEPER、FEE_KEEPER，三个 keeper 角色集中在 `0x542fe841228416F6a3D65eb534a90Ebc5cc36354` 一个地址。
2. **角色矩阵未覆盖项**：LPVault `CONTROLLER_ROLE`、两个 Treasury 的 TOKEN_RECEIVER/MULTICALL/BATCH_TRANSFER、ReferralStorage handler 共 17 对不在参数快照里，只能凭 Ignition journal 里对应 17 笔授权交易的 `SUCCESS` 回执作部署时证据；建议 config-dump 补读这几处，转成链上读回。
3. **第 7 项的限制**：零 `applied` 只对快照 block `46282993` 的状态成立。`env:init:mock` 初始化 Mock 市场时会把 `PRICE_FEED(USDC)` 改指向共享 8 位 USDC mock oracle；在此之后若真的重跑 `configureOracle`，会按 `oracle.fork.tx-fork.json` 把 USDC 的 PRICE_FEED / PRICE_FEED_MULTIPLIER 改回 Ignition 的 MockUSDCOracle（1e36），这正是 2026-09-01 事故的成因。**结论：Mock 初始化之后不要重跑 configureOracle；如需验证一致性，用本记录的离线比对方式。**
4. **A-3 参数对账**：124 条已设置值全部可由归档输入复现（120 精确、3 条乘数公式、1 条运行时时间戳）；124 个 DataStore key 与 ContractCodeSummary 目录 245 个常量哈希全部重算一致；04 §4 的移除键在链上均未出现；04 §2 的 MIN/MAX_DYNAMIC_SPREAD、COLLATERAL_TOKEN 卡片与链上一致。对账暴露的是文档缺陷，不是链上缺陷：
   - 04 §3.2～3.5 五个键（CONSTANT_PRICE_SPREAD、MAX_PRICE_IMPACT_SPREAD、PRICE_IMPACT_PARAMETER、BID/ASK_ORDER_BOOK_DEPTH）的「写入权限」写成 `Config.setUint` 白名单，实际不在 `Config.sol` 白名单内，只能由 CONTROLLER 直写 DataStore（部署脚本正是这样写的）。已于 2026-09-02 更正。
   - 3 个 market-prop 基键（MARKET_INDEX、VAULT、INDEX_TOKEN，共 6 行）不在参数定义目录里；目录中 POSITION_IMPACT_EXPONENT_FACTOR、POSITION_IMPACT_FACTOR 的「值类型」为空。
   - 33 个链上已设置基键没有独立 04 卡片，只通过 §5「底本」引用覆盖；而底本的来源列与 04:7 的说明不一致，且若干值与 v0.3.1 两份快照都对不上（属 v0.3.1 文档问题，另行处理）。
5. **待项目决策（不影响本次准入，但影响后续用例期望值）**：
   - `STABLE_PRICE(USDC)` 在 v0.3.1 tx-fork 上曾设为 `1001000000000000000000000`，v0.3.2 tx-fork 未设置；没有任何输入或文档说明是有意取消。未设置时 `ChainlinkPriceFeedProvider` 走 min=max=feed 价。SCN-070 类价格核对前需要裁决。
   - 合成 BTC 指数 token 的 `PRICE_FEED_MULTIPLIER` = 1e34，是 `configureOracle.ts` 按 18 位换算的结果。**已裁决**：前端 SDK `tokens.ts` 同样把该 token 定为 18 位，链上值正确；部署清单与 tokens.json 标注的"8 位"是 TestCode `deploy-contracts.ts` 的登记错误（已交测试看板 session 修正）。结论：tx-fork 上两个市场的 index token 均为 18 位口径，没有 8 位市场。
   - tx-fork 上 ChainlinkDataStreamProvider 已启用但未绑定任何 token，三个 token 都走 ChainlinkPriceFeedProvider，与 v0.3.1 tx-fork 不同，Oracle 路径用例的期望要按此设定。

## 三、对 06 §5 的勾销依据

| 条件 | 依据 |
| --- | --- |
| A-1 部署归档 | `ignition/journal.jsonl`、`ignition/fx100.fork.tx-fork.json`、`configure-inputs/`、`compile.log` 已归档；`deployed-addresses.json` 与 Ignition `deployed_addresses.json` 逐字节一致 |
| A-2 读检 | 本记录一、二节 + `read-checks-live-2026-09-02.md`：七项全部 PASS，偏差与限制已登记 |
| A-3 参数对账 | 本记录二-4；04 §3.2～3.5 已回填 tx-fork 当前值并更正写入权限；剩余为目录/底本缺陷与三项待决，已登记到 04 §7 |

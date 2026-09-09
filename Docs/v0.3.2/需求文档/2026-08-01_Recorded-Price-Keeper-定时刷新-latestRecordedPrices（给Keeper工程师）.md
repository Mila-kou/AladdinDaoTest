# ⏱️ Recorded Price Keeper —— 定时刷新 latestRecordedPrices（给 Keeper 工程师）

> Notion 页面：[原文](https://app.notion.com/p/3af3d7873f2c81a9b2e5c89825b7c486)
> 作者：fx100-sync（Gordon 的 fx100-contracts 仓库文档同步机器人，内容出自 Gordon）
> 创建时间：2026-08-01
> 最后编辑：2026-08-01
> 归档日期：2026-08-21
> Notion 路径：AladdinDAO 工作台 / 产品 / FX100 / 技术相关 / 合约 / 🚀 上线与部署
> 类型：设计文档

> 👥 受众：Keeper 工程师　｜　来源：docs/analysis/../superpowers/specs/2026-08-01-recorded-price-keeper.md

# Recorded Price Keeper —— 为什么需要定时刷新 `latestRecordedPrices`

**日期**: 2026-08-01
**读者**: keeper 工程师（服务端定时任务）、风控
**结论**: **需要新增一个独立的定时 job**。20 个市场上线后，任意一个资产连续超过 `MAX_RECORDED_PRICE_AGE`（真链当前 **24 小时**）没有交易，会导致 **LP 提款 revert**、ADL 状态无法更新、前端 Available Liquidity 显示 0。
**参考实现**: `fx100-apps/apps/fx-base-app/scripts/keeper/recordedPriceKeeper.ts`（分支 `feat/liquidation-protection-ux-v031`，已在真链 + fork 实测通过）
**相关文档**: [2026-07-31-market-onboarding-playbook.md](2026-07-31-market-onboarding-playbook.md)、[2026-07-31-top20-markets-fork-deployment.md](2026-07-31-top20-markets-fork-deployment.md)

---

## 一、为什么以前不需要，现在需要

`latestRecordedPrices[token]` **不是靠专门的 job 写入的，它是 `Oracle._setPrimaryPrice` 的副作用**：

```solidity
// src/oracle/Oracle.sol:336
OracleUtils.RecordedPrice storage latestRecordedPrice = latestRecordedPrices[token];
if (timestamp > latestRecordedPrice.timestamp) {
    latestRecordedPrice.timestamp = timestamp;
    latestRecordedPrice.price = price;
}
```

也就是说，**任何带 oracle 报价的操作都会顺手把它刷新**——开仓、平仓、清算、ADL、LP 存取款。所以：

> **有交易的资产永远不会过期。**

这就是为什么线上只有 BTC / ETH / MSOL 三个市场时，从来没人需要关心这件事 —— 这三个天天有人动。

**20 个市场之后不成立了。** 2026-08-01 真链实测数据（同一时刻）：

```plain text
BTC   age = 0.18h   ← 有真实交易，自动保鲜
ETH   age = 0.71h   ← 同上
其余 17 个新资产  age = 6.52h  ← 全部整齐停在人工推送的那一刻
```

17 个新资产的 age 完全一致，说明**自上次人工推送后没有任何一笔交易碰过它们**，它们会一起单调递增走向 24 小时。测试网上冷门资产（VVV / LIT / ZEC / AERO 这类）几天没人交易是常态，**必然触发**。

## 二、过期了会坏什么（读取路径是全局的）

关键在于读取侧不是"按需读单个资产"，而是**遍历所有市场**：

```solidity
// src/market/MarketUtils.sol:188-208  getGlobalNetObligationRatio
for (uint256 i; i < marketIndices.length; i++) {
    Market.Props memory market = MarketStoreUtils.get(dataStore, marketIndices[i]);
    netObligation += getNetObligation(dataStore, oracle, market, isADLStart);   // ← 内部读 index token
    if (i == 0) {
        Price.Props memory collateralTokenPrice = oracle.getSecondaryPrice(market.collateralToken, isADLStart);
        poolUsd = getPoolUsdWithoutPnl(market, collateralTokenPrice, false);
    }
}
```

而 `getSecondaryPrice` 对过期是**硬 revert**：

```solidity
// src/oracle/Oracle.sol:174-183
OracleUtils.RecordedPrice memory latestRecordedPrice = latestRecordedPrices[token];
if (latestRecordedPrice.price.isEmpty()) {
    revert FxErrors.EmptySecondaryPrice(token);          // ← 从未记录过
}
uint256 maxRecordedPriceAge = dataStore.getUint(FX100Keys.MAX_RECORDED_PRICE_AGE);
if (!isADLStart && latestRecordedPrice.timestamp + maxRecordedPriceAge < block.timestamp) {
    revert FxErrors.MaxPriceAgeExceeded(latestRecordedPrice.timestamp, block.timestamp);
}
```

**所以：20 个市场里只要有 1 个过期，整个全局调用就 revert。** 影响面：

| 调用点 | 后果 | 严重度 |
|---|---|---|
| `src/vault/LPVault.sol:357`<br>（`_validateWithdrawalsAllowed`，传 `MAX_PNL_FACTOR_FOR_WITHDRAWALS` + `isADLStart=false`） | **LP 提款 revert** | 🔴 真正会出事的 |
| `src/exchange/AdlHandler.sol:98` / `:138` | ADL 状态无法更新（`updateAdlState`） | 🔴 风控失效 |
| `src/adl/AdlUtils.sol:86` | ADL 执行 | 🔴 |
| `src/reader/ReaderUtils.sol:219` | 前端读取路径 → **Available Liquidity 显示 0，无法开仓** | 🟡 |
| `src/router/relay/BaseRelayRouter.sol:244-245` | Express / gasless 的 relay 费定价（WNT + feeToken） | 🟡 |

### 两个容易误判的细节

1. **`isADLStart == true` 时跳过年龄检查**（见上面 `!isADLStart &&`）。所以 ADL 的**启动**路径即使价格过期也能走，但 `AdlHandler.sol:138` 的 `updateAdlState` 传的是 `false`，仍然会挂。别因为"ADL 还能触发"就以为没问题。
2. **配了 `priceFeed` 的资产完全不受影响**。`_getSecondaryPrice` 先查链上 price feed：
   ```solidity
   // src/oracle/Oracle.sol:170-173
   (bool hasPriceFeed, uint256 price) = ChainlinkPriceFeedUtils.getPriceFeedPrice(dataStore, token);
   if (hasPriceFeed) {
       return Price.Props(price, price);      // ← 直接返回，压根不读 latestRecordedPrices
   }
   ```
   目前只有 **MSOL** 是这种（mock oracle）。刷它是无用功，脚本会自动跳过。

## 三、现有 `adlWorker` 为什么不能替代

`apps/keeper/src/entrypoints/adlWorker.ts` 里**已经在调这个函数**：

```plain text
// adlWorker.ts:496-509
const refreshHash = await walletClient.writeContract({
  address: ADL_HANDLER_ADDRESS, abi: AdlHandlerABI,
  functionName: 'refreshLatestRecordedPrices', args: [oracleParams],
});
await publicClient.waitForTransactionReceipt({ hash: refreshHash, ... });
const hash = await walletClient.writeContract({ ..., functionName: 'updateAdlState', args: [] });
```

但它**不能替代定时 job**，三个原因：

1. **事件驱动，不是定时**：它消费 Redis 的 ADL 队列，只有 `adlPublisher` 检测到 ADL 条件时才跑。而"所有资产都没交易"恰恰是最不会触发 ADL 的状态 —— 需要它的时候它正好不跑。
2. **只覆盖被触发的那个市场**：`fetchOraclePricesForUpdateAdlState(tokens, signal)`（`adlWorker.ts:346`）拿的是该 signal 相关的 token，不是全部 20 个。而 revert 的判定是全局的，覆盖一个市场没用。
3. **它自己就是受害者**：`updateAdlState` 内部就走 `isGlobalNetObligationRatioExceeded(..., false)`，某个不相关的冷门资产过期，会把 ADL 状态更新一起带挂。

**结论：需要一个与 adlWorker 平行、纯定时、覆盖全部 token 的独立 job。**

## 四、实现要点

### 权限：不需要任何角色

```solidity
// src/exchange/AdlHandler.sol:65-69
function refreshLatestRecordedPrices(OracleUtils.SetPricesParams calldata oracleParams)
    external
    globalNonReentrant
    withOraclePrices(oracleParams)
{}
```

**函数体是空的** —— 实际工作全在 `withOraclePrices` modifier 里（校验签名报告 → `_setPrimaryPrice` → 写 `latestRecordedPrices`）。没有 `onlyXxxKeeper` 修饰符，**任何有 gas 的 EOA 都能调**。不用给这个 job 授权角色，也不用共用 ADL keeper 的 key。

### 参考实现的设计取舍

`fx100-apps/apps/fx-base-app/scripts/keeper/recordedPriceKeeper.ts`，头部注释写了完整依据。移植到 `apps/keeper` 时请保留这几点：

| 设计 | 原因 |
|---|---|
| **token 列表从链上读**：遍历 `MARKET_LIST` → 每个市场的 `indexToken` + 共享的 `collateralToken` | 写死符号表会悄悄漂移。新增市场后如果 job 没跟上，症状是"某天 LP 突然提不了款"，极难排查 |
| **跳过配了 `priceFeed` 的资产** | 见 §二 细节 2，刷了也没用，白花 gas |
| **按年龄阈值刷**，默认超过 `MAX_RECORDED_PRICE_AGE` 的 50% 才刷 | 有交易的资产（BTC/ETH）会被自动跳过，只为真正需要的付 gas |
| **一笔交易覆盖所有待刷 token** | `refreshLatestRecordedPrices` 接受整个 `oracleParams` 数组；而且要保护的是**全局**读取路径，部分覆盖没有意义 |
| **常驻模式下单轮失败只记日志不退出** | Chainlink API 抖动不该让 keeper 死掉 —— 下一个 tick 会重试 |
| **报表打出每个 token 的年龄 + ✅/🟡/🔴** | 这个故障的症状（LP 提款 revert）离病因很远，必须能一眼看出是哪个资产拖的 |

### 🔴 一个必踩的坑：feed 表是 import 时决定的

`@/config/feedIds` 在**模块加载时**按 `CHAINLINK_NETWORK` 二选一。而链上 `dataStreamId[token]` 存的是 **testnet** Stream ID，`.env` 里配的却是 `mainnet`（前端展示需要 mainnet）。直接跑的结果是 mainnet 订阅对这些 feed 无授权 → 401 → `no prices returned from Chainlink API`。

必须在 **import 之前**改写环境变量，改在之后无效：

```plain text
process.env.CHAINLINK_NETWORK = 'testnet';
process.env.CHAINLINK_API_KEY = process.env.CHAINLINK_TESTNET_API_KEY;
// ... 然后才 await import('@/config/feedIds') 及任何间接引用它的模块
```

参考实现用动态 `import()` 就是为了保证这个时序。生产环境如果 keeper 与前端是独立进程/独立配置，可以直接把 env 配成 testnet，不需要这个技巧。

### 用法

```bash
cd apps/fx-base-app

# 看现状，不发交易（打出每个 token 年龄）
RPC_URL=<rpc> CHAIN_ID=84532 DRY_RUN=1 npx tsx scripts/keeper/recordedPriceKeeper.ts

# 单次执行
RPC_URL=<rpc> CHAIN_ID=84532 npx tsx scripts/keeper/recordedPriceKeeper.ts

# 常驻（本地替代 cron）
RPC_URL=<rpc> CHAIN_ID=99917 WATCH=true INTERVAL_MS=1800000 npx tsx scripts/keeper/recordedPriceKeeper.ts

# 全刷，忽略年龄
RPC_URL=<rpc> FORCE=1 npx tsx scripts/keeper/recordedPriceKeeper.ts
```

| 环境变量 | 默认 | 说明 |
|---|---|---|
| `RPC_URL` | 必填 |  |
| `CHAIN_ID` | `84532` | fork 用 `99917`（feed 配置沿用 84532） |
| `PRIVATE_KEY` | 回退读部署包 | 任意有 gas 的 EOA 即可，无需角色 |
| `REFRESH_AT` | `0.5` | 年龄超过 `MAX_RECORDED_PRICE_AGE` 的这个比例才刷 |
| `WATCH` / `INTERVAL_MS` | `false` / 30min | 常驻模式 |
| `DRY_RUN` / `FORCE` | — | 只报告 / 忽略年龄全刷 |

### 实测记录

| 环境 | 结果 |
|---|---|
| 真 Base Sepolia (84532) | `DRY_RUN` 正确识别 20 个相关 token（19 index + USDC）、跳过 1 个 mock 资产，读出 `maxAge=86400s`，各 token 年龄如 §一 |
| fork Gordon 20260801 (99917) | `FORCE=1` 一笔交易刷新 20 个 token，tx `0x0a72b5fd1dc18acec6400499be3c3c2a305f658c76a06ec7a1d7bbb185b35f26` |

## 五、给风控的一个待定项

真链当前配置：

| 键 | 值 |
|---|---|
| `MAX_RECORDED_PRICE_AGE` | `86400` s = **24 小时** |
| `MAX_ORACLE_PRICE_AGE` | `60` s = 1 分钟（这是 primary price 的，不是本文讨论的） |

24 小时这个值是在"只有 3 个热门市场"的前提下定的，那时它永远不会被触碰到。现在的取舍变了：

- **没有这个 job**：24 小时是"冷门资产必然踩雷"的红线，反而应该放宽
- **有了这个 job**：上限可以**收紧**（比如 2~4 小时），换取 LP 提款 / ADL 判定时用到的价格更新鲜 —— 这直接影响风控判定的准确性

建议：先上 job（间隔 30 分钟、阈值 50%），稳定运行后再由风控评估是否把 `MAX_RECORDED_PRICE_AGE` 调低。job 的刷新周期与上限之间要留足倍数余量（30 分钟 job + 24 小时上限 = 48 倍余量；若上限收到 2 小时则只剩 4 倍，需要相应缩短 job 间隔并加监控告警）。

**监控建议**：job 每轮把"最老的 token 年龄 / `MAX_RECORDED_PRICE_AGE`"这个比值打成 metric，超过 0.8 告警。这个比值触顶就等于 LP 提款即将不可用，属于需要立刻响应的级别。

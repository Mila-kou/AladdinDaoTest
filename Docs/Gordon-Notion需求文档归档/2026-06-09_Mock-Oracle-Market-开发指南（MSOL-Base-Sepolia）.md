---
title: Mock Oracle Market 开发指南（MSOL/Base Sepolia）
notion_url: https://app.notion.com/p/37a3d7873f2c819fa906e9c0340ee577
author: Gordon (chao@aladdin.club)
last_edited: 2026-06-09
archived: 2026-07-28
---

> **目标受众：** 测试人员、前端开发、Keeper 开发
以 Base Sepolia 上已部署的 **MSOL/USDC** 市场为案例，说明如何在没有 Chainlink Data Stream 的情况下用 `MockChainlinkOracle` 驱动完整测试市场。
---
## 代码参考
<table header-row="true">
<tr>
<td>仓库</td>
<td>分支</td>
<td>关键 commit</td>
</tr>
<tr>
<td>[fx100-contracts](https://github.com/AladdinDAO/fx100-contracts)</td>
<td>`docs/testing-standards`</td>
<td>`a0b9833` 文档；`f728460` 部署地址；`e38a879` setMockPrice 脚本；`0c86e14` MSOL 类型定义</td>
</tr>
<tr>
<td>[fx100-apps](https://github.com/AladdinDAO/fx100-apps)</td>
<td>`feat/liquidation-protection-ux-new-ui`</td>
<td>`03df8d7` forceExecuteOrder；`6abe253` keeper mock oracle bypass；`1097c1a` 前端 MSOL 市场配置</td>
</tr>
</table>
**合约版本：** v0.2.0（Base Sepolia，chain ID 84532）
---
## 1. 部署地址总览
<table header-row="true">
<tr>
<td>合约/配置</td>
<td>地址</td>
</tr>
<tr>
<td>**MockToken (MSOL)**</td>
<td>`0xBfCa745E50a272Dc723b8608122b956Afb6391Ff`</td>
</tr>
<tr>
<td>**MockChainlinkOracle (MSOL/USD)**</td>
<td>`0x1943907D463DA911D4fbF112d831ca5Da4E4Dc23`</td>
</tr>
<tr>
<td>**ChainlinkPriceFeedProvider**</td>
<td>`0xA3fAb982C1Fe9c45AD7C494E0FE46C3A86bB6073`</td>
</tr>
<tr>
<td>**DataStore**</td>
<td>`0x9e07065312D2d4c47b68CF21E9a71518c790453f`</td>
</tr>
<tr>
<td>**OrderHandler**</td>
<td>`0xA6842e58eBbEb2463C2eC86bE21aD62e03a9a96b`</td>
</tr>
<tr>
<td>**Fx100Reader**</td>
<td>`0xb066e715B3955e946E79bD7f03024b654fcF7716`</td>
</tr>
</table>
MSOL 市场配置：
<table header-row="true">
<tr>
<td>参数</td>
<td>值</td>
</tr>
<tr>
<td>Market Index</td>
<td>`3`</td>
</tr>
<tr>
<td>Oracle decimals</td>
<td>`18`</td>
</tr>
<tr>
<td>Token decimals</td>
<td>`18`</td>
</tr>
<tr>
<td>priceFeedMultiplier</td>
<td>`1e24`（= 10\^(60−18−18)）</td>
</tr>
<tr>
<td>Heartbeat duration</td>
<td>`31536000`（1 年，永不过期）</td>
</tr>
</table>
---
## 2. 架构原理
### 2.1 普通 Chainlink Data Stream 流程
```javascript
Chainlink Data Stream API
    ↓ (signed blob)
ChainlinkVerifier (on-chain)
    ↓ (verified price)
OracleModule
    ↓
合约业务逻辑（开仓/平仓/清算）
```
每次 Keeper 执行订单，都需要从 Chainlink API 实时拉取带签名的 price report，然后在链上验证。**测试网 token 没有对应的 Data Stream，因此无法走此流程。**
### 2.2 Mock Oracle 流程（本方案）
```javascript
setMockPrice.ts（手动设置）
    ↓
MockChainlinkOracle.setMockPrice(rawPrice, timestamp)
    ↓ latestRoundData()
ChainlinkPriceFeedProvider.getOraclePrice(token)
    ↓ adjustedPrice = rawPrice * 1e24 / 1e30
OracleModule
    ↓
合约业务逻辑
```
Keeper 构造 oracle params 时，将 MSOL 的 `provider` 设为 `ChainlinkPriceFeedProvider`，`data` 设为 `0x`（空），合约直接调用 `provider.getOraclePrice(token)` 拉取链上价格。
### 2.3 价格格式换算
<table header-row="true">
<tr>
<td>人类可读价格</td>
<td>MockChainlinkOracle raw（1e18）</td>
<td>FX100 内部 adjustedPrice</td>
</tr>
<tr>
<td>\$100</td>
<td>`100e18`</td>
<td>`100e12`</td>
</tr>
<tr>
<td>\$180</td>
<td>`180e18`</td>
<td>`180e12`</td>
</tr>
<tr>
<td>\$200</td>
<td>`200e18`</td>
<td>`200e12`</td>
</tr>
</table>
公式：`adjustedPrice = rawPrice × 1e24 / 1e30 = rawPrice / 1e6`
**触发价格（triggerPrice）和 oracle adjustedPrice 在同一单位下比较。**
---
## 3. 测试人员操作手册
### 3.1 前置条件
- Base Sepolia 钱包，有少量 ETH 用于 gas
- MSOL mock token（调用合约 `0xBfCa745E...` 的 `mint()` 铸造）
- USDC（Base Sepolia: `0x759319C868c0abac7e4FaADd5Afdb77a450d8249`）
### 3.2 设置 Mock Oracle 价格
进入 `fx100-contracts/` 目录：
```bash
MOCK_ORACLE_ADDRESS=0x1943907D463DA911D4fbF112d831ca5Da4E4Dc23 \
MOCK_PRICE_USD=200 \
npx hardhat run scripts/setMockPrice.ts --network base_sepolia
```
验证当前价格：
```bash
cast call 0x1943907D463DA911D4fbF112d831ca5Da4E4Dc23 \
  "latestRoundData()(uint80,int256,uint256,uint256,uint80)" \
  --rpc-url https://sepolia.base.org
# 第2个返回值为 rawPrice（1e18 单位）
```
### 3.3 市价单测试
1. 前端 MSOL/USDC 市场下市价单
2. 启动 Keeper 的 `eventPublisher` + `eventWorker`，订单几秒内自动执行
3. 或用 `forceExecuteOrder` 手动执行（见 3.5）
### 3.4 限价单测试（关键）
**⚠️ FX100 限价单语义和 CEX 不同，务必理解：**
<table header-row="true">
<tr>
<td>订单类型</td>
<td>含义</td>
<td>Long 触发条件</td>
<td>Short 触发条件</td>
</tr>
<tr>
<td>`LimitIncrease` (1)</td>
<td>限价开仓</td>
<td>`oracle.max ≤ triggerPrice`（价格**跌**到触发价）</td>
<td>`oracle.min ≥ triggerPrice`</td>
</tr>
<tr>
<td>`StopIncrease` (6)</td>
<td>突破开仓</td>
<td>`oracle.max ≥ triggerPrice`（价格**涨**到触发价）</td>
<td>`oracle.min ≤ triggerPrice`</td>
</tr>
<tr>
<td>`LimitDecrease` (3)</td>
<td>止盈平仓</td>
<td>`oracle.min ≥ triggerPrice`</td>
<td>`oracle.max ≤ triggerPrice`</td>
</tr>
<tr>
<td>`StopLossDecrease` (4)</td>
<td>止损平仓</td>
<td>`oracle.min ≤ triggerPrice`</td>
<td>`oracle.max ≥ triggerPrice`</td>
</tr>
</table>
**场景 A：LimitIncrease Long（等价格下跌到 \$180 成交）**
- oracle 设为 \$200 → 创建 LimitIncrease Long，triggerPrice = \$180
- oracle 设为 \$170（\< \$180）→ `170e12 ≤ 180e12` ✅ 成交
**场景 B：StopIncrease Long（等价格上涨到 \$200 成交）**
- oracle 设为 \$150 → 创建 StopIncrease Long，triggerPrice = \$200
- oracle 设为 \$210（\> \$200）→ `210e12 ≥ 200e12` ✅ 成交
**常见错误 ****`InvalidOrderPrices (0x0481a15a)`**：触发条件不满足。检查订单类型，调整 oracle 价格方向。
### 3.5 使用 forceExecuteOrder 手动执行订单
Keeper 丢弃了某订单（价格条件不满足时最多重试1次即丢弃），可手动强制执行：
```bash
cd apps/fx-base-app/scripts

ORDER_KEY=0x订单Key \
ORDER_MARKET_INDEX=3 \
npx tsx keeper/forceExecuteOrder.ts
```
**读取订单 triggerPrice（DataStore 查询）：**
```bash
ORDER_KEY=0x你的订单Key
TRIGGER_BASE=$(cast keccak $(cast abi-encode "f(string)" "TRIGGER_PRICE"))
PACKED=$(python3 -c "print('0x' + '${ORDER_KEY}'.replace('0x','') + '${TRIGGER_BASE}'.replace('0x',''))")
DS_KEY=$(cast keccak $PACKED)
cast call 0x9e07065312D2d4c47b68CF21E9a71518c790453f \
  "getUint(bytes32)(uint256)" "$DS_KEY" \
  --rpc-url https://sepolia.base.org
# 返回值 ÷ 1e12 = 触发价 USD
```
---
## 4. 前端开发接入说明
### 4.1 价格 Tickers 接口
`/api/prices/tickers` 自动混合 Chainlink（USDC）和 Mock Oracle（MSOL）价格。
MSOL 的价格通过 `MockChainlinkOracle.latestRoundData()` 获取，返回格式与其他 token 相同。已在 `apps/fx-base-app/src/app/api/prices/tickers/route.ts` 实现，无需修改。
### 4.2 triggerPrice 格式
```typescript
// 用户输入 $180 → triggerPrice = 180 × 1e12
const triggerPrice = BigInt(userPriceUSD) * BigInt(1e12); // = 180000000000000n
```
<table header-row="true">
<tr>
<td>Token</td>
<td>priceFeedMultiplier</td>
<td>\$1 in contract units</td>
</tr>
<tr>
<td>MSOL（18+18 decimals）</td>
<td>`1e24`</td>
<td>`1e12`</td>
</tr>
<tr>
<td>USDC（18+6 decimals）</td>
<td>`1e36`</td>
<td>`1e6`</td>
</tr>
</table>
### 4.3 OrderType 枚举
<table header-row="true">
<tr>
<td>前端 UI</td>
<td>合约 OrderType</td>
<td>枚举值</td>
</tr>
<tr>
<td>限价开多/空</td>
<td>`LimitIncrease`</td>
<td>1</td>
</tr>
<tr>
<td>突破开多/空</td>
<td>`StopIncrease`</td>
<td>6</td>
</tr>
<tr>
<td>止盈平仓</td>
<td>`LimitDecrease`</td>
<td>3</td>
</tr>
<tr>
<td>止损平仓</td>
<td>`StopLossDecrease`</td>
<td>4</td>
</tr>
</table>
**⚠️ 务必在 UI 上区分 LimitIncrease 和 StopIncrease**，否则用户会误以为限价单在目标价未成交。
### 4.4 Mock Token Mint
`MockToken` 有公开 `mint(address, uint256)` 函数，前端可直接调用让测试用户自助领取：
```typescript
await walletClient.writeContract({
  address: '0xBfCa745E50a272Dc723b8608122b956Afb6391Ff', // MSOL
  abi: [{ name: 'mint', type: 'function',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [] }],
  functionName: 'mint',
  args: [userAddress, parseUnits('100', 18)],
});
```
---
## 5. Keeper 开发说明
### 5.1 当前临时 Keeper 已知缺陷
1. 订单创建时立即尝试执行（价格条件可能未满足）
2. 失败后**最多重试 1 次**，然后从队列永久删除
3. Keeper 重启期间创建的订单不会被处理
4. 价格条件后来满足时，已丢弃的订单不会自动重试
### 5.2 Mock Oracle OraclePriceParams 构造
```typescript
// 常规 Chainlink token（USDC）
oracleParams = {
  tokens: [usdcAddress],
  providers: [chainlinkVerifier],  // ChainlinkStreamVerifier
  data: [signedBlob],              // 从 Chainlink API 拉取
};

// Mock Oracle token（MSOL）——provider = ChainlinkPriceFeedProvider，data = 0x
oracleParams = {
  tokens: [msolAddress, usdcAddress],
  providers: [chainlinkPriceFeedProvider, chainlinkVerifier],
  data: ['0x', signedBlob],
};
```
环境变量（`scripts/.env`）：
```javascript
KEEPER_PRICE_FEED_TOKENS=0xbfca745e50a272dc723b8608122b956afb6391ff
KEEPER_PRICE_FEED_PROVIDER_ADDRESS=0xA3fAb982C1Fe9c45AD7C494E0FE46C3A86bB6073
# 多个 mock token 用逗号分隔
```
### 5.3 完善 Keeper 需要的功能
**历史未成交订单扫描**
```typescript
async function scanPendingOrders() {
  const orders = await reader.getOrders(dataStore, 0, 1000);
  for (const order of orders) {
    if (isPriceConditionMet(order, currentOraclePrice)) {
      await executeOrder(order.key, oracleParams);
    }
  }
}
setInterval(scanPendingOrders, 10_000);
```
**InvalidOrderPrices 保留重试（不丢弃）**
```typescript
if (errorSelector === '0x0481a15a') {
  // 价格条件未满足 → 保留，等待价格变化
  await requeue(order, { delayMs: 30_000 });
} else {
  await discard(order);
}
```
**价格变化触发扫描**
```typescript
setInterval(async () => {
  const price = await getOraclePrice();
  if (price !== lastPrice) { lastPrice = price; await scanPendingOrders(); }
}, 5_000);
```
### 5.4 新增 Mock Token 的 Keeper 配置
在 `scripts/.env` 追加地址（逗号分隔）：
```javascript
KEEPER_PRICE_FEED_TOKENS=0xMSOL地址,0x新token地址
```
不需要改 Keeper 逻辑代码，bypass 通过 token 地址 Set 匹配。
---
## 6. 如何增加新 Mock Token 市场
**步骤 1：部署**
```bash
FX100_SYMBOL=MBTC FX100_DEPLOYMENT=base_sepolia \
npx hardhat run scripts/deployMockAsset.ts --network base_sepolia
# 输出：mock token MBTC: 0x...  mock oracle MBTC: 0x...
```
**步骤 2：链上配置 Oracle**
创建 `scripts/parameters/base-sepolia/oracle-mbtc.json`（参考 oracle-msol.json），运行：
```bash
FX100_DEPLOYMENT=base_sepolia \
FX100_ORACLE_CONFIG=scripts/parameters/base-sepolia/oracle-mbtc.json \
npx hardhat run scripts/configureOracle.ts --network base_sepolia
```
写入 DataStore：`PRICE_FEED`、`PRICE_FEED_MULTIPLIER=1e24`、`PRICE_FEED_HEARTBEAT_DURATION=31536000`
**步骤 3：链上配置 Market**
创建 market config（参考 market-msol.json），运行 `configureMarket.ts`。新 token 从 market index 4 开始。
**步骤 4：更新 SDK + Keeper**
- `fx100-apps/src/config/tokens.ts`：追加 token 地址 → symbol/decimals
- `fx100-apps/src/config/markets.ts`：追加 market index → indexToken/collateralToken
- `scripts/.env`：`KEEPER_PRICE_FEED_TOKENS` 追加新地址
- `src/app/api/prices/tickers/route.ts`：`MOCK_ORACLE_TOKENS` 追加新 token
**步骤 5：设置初始价格**
```bash
MOCK_ORACLE_ADDRESS=0x新oracle地址 MOCK_PRICE_USD=50000 \
npx hardhat run scripts/setMockPrice.ts --network base_sepolia
```
---
## 附录：错误代码速查
<table header-row="true">
<tr>
<td>错误 selector</td>
<td>原因</td>
<td>解决方法</td>
</tr>
<tr>
<td>`0x0481a15a` `InvalidOrderPrices`</td>
<td>触发条件不满足</td>
<td>调整 oracle 价格满足条件</td>
</tr>
<tr>
<td>`0xcd64a025`</td>
<td>Keeper 未提供 token oracle params</td>
<td>检查 `KEEPER_PRICE_FEED_TOKENS`</td>
</tr>
<tr>
<td>`EmptyOrder`</td>
<td>订单已执行或取消</td>
<td>用 Reader.getOrder 确认状态</td>
</tr>
<tr>
<td>`ChainlinkPriceFeedNotUpdated`</td>
<td>Oracle timestamp 超过 heartbeat</td>
<td>重新调用 setMockPrice</td>
</tr>
</table>
## 附录：常用 cast 命令
```bash
# 查询当前 mock oracle 价格
cast call 0x1943907D463DA911D4fbF112d831ca5Da4E4Dc23 \
  "latestRoundData()(uint80,int256,uint256,uint256,uint80)" \
  --rpc-url https://sepolia.base.org

# 模拟 executeOrder（不发交易，查看 revert 原因）
cast call 0xA6842e58eBbEb2463C2eC86bE21aD62e03a9a96b \
  "executeOrder(bytes32,(address[],address[],bytes[]))" \
  "0x订单key" \
  "([0xMSOL,0xUSDC],[0xChainlinkPriceFeedProvider,0xChainlinkVerifier],[0x,0xBlob])" \
  --rpc-url https://sepolia.base.org
```

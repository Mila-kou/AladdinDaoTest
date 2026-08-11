# Market Bundle 与 Keeper 执行模式

## 1. 资源模型

每个私有 Fork 可以初始化多个命名 Market Bundle，`default-mock` 是现有用例默认使用的兼容别名：

| 资源 | 归属 | 规则 |
|---|---|---|
| Index Token | Bundle 专属 | 每个 Market 使用自己的测试 Token，不硬编码地址 |
| Index Oracle | Bundle 专属 | Mock Chainlink Feed，必须返回 `min < max` |
| Collateral Token | 环境共享 | 当前使用协议 LPVault 的 USDC |
| USDC Oracle | 环境共享 | 私有 Fork 上替换为 Mock Feed，必须返回 `min < max` |
| Market / Vault | Bundle 登记 | 保存 `bundleId`、`marketIndex`、Vault 与 Profile |
| Market 参数 | Bundle 专属 | 33 项 Funding、Fee Ratio、Spread、OI 与风控参数 |

登记文件是 `config/mock-resources.json`。自动化用例只通过 `resolveDefaultMockResource(project)` 读取资源；Token、Oracle 与 Market 地址禁止出现在用例常量中。

### USDC Token 与 USDC Oracle 的来源

这两个资源不是一起重新部署：

| 对象 | 初始化方式 | 对 Base Sepolia 的影响 |
|---|---|---|
| USDC Token | 从当前部署的 LPVault `asset()` 读取并复用 | 不部署新 Token，不修改 Base Sepolia Token |
| USDC Oracle | 在每个 Tenderly Fork 中新部署 `MockChainlinkOracle` | 只修改当前 Fork 的 DataStore，不修改 Base Sepolia Oracle |

因此“共享 USDC Oracle”是指：同一个 Fork 内，所有使用这枚 USDC 的 Mock Market 共享该 Fork 新部署的 USDC Mock Oracle。它不是直接使用 Base Sepolia 当前配置的 Oracle。

当前登记结构为“环境级共享 Collateral + 多 Bundle”：每个 Market 使用独立 Index Token/Oracle，所有 Bundle 复用这枚 USDC Token 和 USDC Mock Oracle。`default-mock` 仍投影到旧的扁平字段，保证现有 SCN-009/010/070 不需要同时迁移。

## 2. 环境职责

| 环境 | Keeper | Oracle 组合 | 主要用例 |
|---|---|---|---|
| `tx-fork` | Inline | Index Mock + USDC Mock | 市价、仓位、Fee、OI、Skew、Spread 和账本核对 |
| `oracle-fork` | Inline | Index Mock + USDC Mock | 限价/止损触发、脱锚、极端价格、清算边界 |
| `time-fork` | Inline | Index Mock + USDC Mock | Funding、EMA、Grace、超时和时间边界 |
| `base-sepolia` | Service | 标准 Index Oracle + 标准 USDC Oracle | producer + worker 专项、真实部署兼容性 |

Service Keeper 的另一种兼容组合是“Index Mock + USDC 标准 Oracle”，但只能在明确准备了相应 Market 和服务配置的专项环境中执行；不能把它当作 Inline Keeper 的默认资源。

## 3. 初始化顺序

1. 核对 RPC、固定 chainId、部署清单和账户角色；
2. 按 Bundle Alias 部署独立 Index Token 与 Index Mock Oracle；
3. 从 LPVault 解析共享 USDC；若当前 Fork 尚无可用共享配置，则部署 USDC Mock Oracle，否则复用已登记并通过链上回读的共享 Oracle；
4. 为两枚 Token 配置 PriceFeed、Multiplier、Heartbeat、StablePrice 与 Oracle Provider；
5. 创建 Synthetic Market，复制/覆盖 33 项参数，准备余额、授权与流动性；
6. 回读 Reader Market、两路 Oracle `min/max`、provider 和全部参数；
7. 只有全部通过才把 Bundle 登记为 `ready` 和 `inlineKeeperReady=true`。

初始化由 Fork 快照保护。任何步骤失败都回滚，不保存半成品地址。

### 多 Bundle 初始化命令

```bash
# 初始化默认 Bundle；首次初始化会同时创建共享 USDC Oracle
npm run env:init:mock -- --project tx-fork --bundle default-mock

# 在同一 Fork 新增独立 Market；默认复用共享 USDC Oracle
npm run env:init:mock -- --project tx-fork --bundle mock-eth

# 只重建选定 Bundle，不重建共享 USDC Oracle
npm run env:init:mock -- --project tx-fork --bundle mock-eth --force

# 同时重建共享 USDC Oracle；这会改变同一 Fork 所有 Market 的 USDC 报价来源
npm run env:init:mock -- --project tx-fork --bundle default-mock --force --force-shared-collateral

# 核对指定 Bundle 和共享 USDC Oracle
E2E_ENV=tx-fork npm run env:verify:mock -- --bundle mock-eth
```

看板环境页提供同样的 Bundle Alias、重建所选 Bundle、重建共享 USDC Oracle 三个选项。新增 Bundle 时不要勾选共享重建；只有 Fork 已切换、共享地址失效或明确要修改 USDC Min/Max 时才重建共享资源。

### USDC Min/Max 配置口径

页面填写的是可读十进制 USD 价格，默认值为：

```text
USDC Min = 0.999
USDC Max = 1.001
Oracle Decimals = 8
Heartbeat = 86400 秒
```

`MockChainlinkOracle` 合约自身只保存一个 Feed Price。协议的 Chainlink Provider 会把 Feed Price 与 DataStore 的 `STABLE_PRICE` 排序成最终区间，所以初始化必须同时写两处：

```text
MockChainlinkOracle.setMockPrice(USDC Min, timestamp)
DataStore.STABLE_PRICE[USDC] = USDC Max

最终 Oracle Min = min(Feed Price, StablePrice)
最终 Oracle Max = max(Feed Price, StablePrice)
```

同时还要写入并登记：

- `PRICE_FEED[USDC]`：本 Fork 新部署的 USDC Mock Oracle；
- `PRICE_FEED_MULTIPLIER[USDC]`：按 USDC decimals 和 Oracle decimals 换算；
- `PRICE_FEED_HEARTBEAT_DURATION[USDC]`；
- `ORACLE_PROVIDER_FOR_TOKEN[ProtocolOracle][USDC]`：Chainlink PriceFeed Provider。

初始化完成后必须用 Provider 回读并断言：地址一致、`min < max`、Min/Max 与输入一致、timestamp 未过期。只有这些检查全部通过，资源才允许登记为 `inlineKeeperReady=true`。

### 初始化登记内容

`config/mock-resources.json` 必须保存以下证据，供用例和看板解析：

- Fork chainId、显示名称和初始化时间；
- Index Token/Oracle 地址、部署交易、decimals、初始 Min/Max；
- USDC Token 地址、名称、Symbol 和 decimals；
- USDC Mock Oracle 地址、部署交易、Provider、初始 Min/Max；
- `bundleId`、`marketIndex`、Vault、Market 创建交易和参数 Profile；
- Oracle、参数、角色、授权和流动性初始化交易列表。

登记结构采用下面的层级；地址只由初始化成功后的链上回读结果回填：

```json
{
  "resources": {
    "tx-fork": {
      "chainId": 99911,
      "defaultBundleAlias": "default-mock",
      "sharedCollateral": {
        "status": "ready",
        "token": { "symbol": "USDC", "origin": "inherited-base-deployment" },
        "oracle": { "origin": "environment-init", "minPrice": "...", "maxPrice": "..." },
        "configurationTxHashes": ["0x..."],
        "inlineKeeperReady": true
      },
      "bundles": {
        "default-mock": {
          "token": { "symbol": "FXMOCK" },
          "oracle": { "minPrice": "...", "maxPrice": "..." },
          "market": { "bundleId": "tx-fork/default-mock/market-...", "marketIndex": 0 }
        },
        "mock-eth": {
          "token": { "symbol": "..." },
          "oracle": { "minPrice": "...", "maxPrice": "..." },
          "market": { "bundleId": "tx-fork/mock-eth/market-...", "marketIndex": 0 }
        }
      }
    }
  }
}
```

旧的扁平 `token/oracle/market/collateralToken/collateralOracle` 字段只作为 `default-mock` 兼容投影。新初始化与新用例应读取 `sharedCollateral + bundles.<alias>`；旧地址缺少共享 Oracle 或 Chain ID 不匹配时一律保持 `pending-initialization`，不能自动升级为 `ready`。

## 4. 用例约束

- 普通协议自动化不加载 Trade 页面；Trader 创建/关闭订单和 Inline Keeper 执行都必须是真实私钥签名交易。
- 用例报告必须记录 `bundleId`、Market、Index/Collateral Token、两路 Oracle、价格 `min/max/timestamp` 和交易链接。
- 价格边界用例修改 Oracle 后必须恢复 before 的 Feed 价格、时间戳和 StablePrice；用例结束后再回滚 Fork 快照。
- USDC Oracle 是 Fork 级共享资源；修改 USDC Min/Max 会影响同一 Fork 中全部使用该 USDC 的 Market。脱锚用例必须串行、独占快照并在结束后恢复。
- `mock-only` 用例不能切换标准 Market；`mock-and-deployed` 用例可以在看板显式切换到 `base-sepolia` 标准 Market。
- Service Keeper 模式必须做 RPC、WSS、chainId、producer 和 worker 就绪检查；未就绪记为 `BLOCKED`，不能记为协议 `FAIL`。

## 5. 当前迁移结果

- SCN-009：`tx-fork + default-mock + Inline Keeper`；
- SCN-010：`oracle-fork + default-mock + Inline Keeper`，动态解析 Bundle，不再使用 Market #1/MockBTC 常量；
- `env:verify:mock`：同时核对 Index 与 USDC Mock Oracle；
- `config/mock-resources.json`：使用 `sharedCollateral` 保存环境级 USDC，用 `bundles.<alias>` 保存多个独立 Index Market；
- `base-sepolia`：允许显式交易，作为 Service Keeper + 标准 Oracle 专项环境，但仍禁止 Mock 初始化、Oracle 改写和时间推进。

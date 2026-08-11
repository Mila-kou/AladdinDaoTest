# config-dump — 合约参数全量取数工具

把一套已部署 fx100 合约在 **DataStore 里设置的全部参数**读出来，供 TestCode 的参数 Dashboard 实时查询使用。
供 CFG/断言类用例引用，并核对「合约取数清单」的完整性。

零依赖：只用 Node ≥ 20 内置能力（`fetch` + 自带 keccak256/ABI 实现），不需要 `npm install`、不需要合约仓库编译产物。

## 为什么不是手写一份 key 清单

手写清单一定会漏，也一定会过期——这正是现有「合约取数清单」只覆盖 18 个 DataStore 参数、而链上实际设了 72 个的原因。

本工具反过来做：**从合约源码生成参数登记表**。`FX100Keys.sol` 里新增一个 key，重跑 `build-registry.mjs` 就自动进表，
不依赖任何人记得去更新文档。

## 三个脚本

| 脚本 | 作用 | 输出 |
|---|---|---|
| `build-registry.mjs` | 解析合约源码，生成参数登记表 | `registry.json`（工具目录内，需提交） |
| `dump-config.mjs` | 按登记表读链上取值，固定同一 block | `config/<部署名>.params.json` + `.md` |
| `check-coverage.mjs` | 快照 vs 取数清单，量化清单缺口 | `config/取数清单-覆盖度.md` |
| `group-by-module.mjs` | 把快照按**功能模块**归类，折叠探测冗余 | `config/<部署名>.params-by-module.csv` |

```bash
cd TestCode/tools/config-dump

node build-registry.mjs      # 换合约分支 / 合约改了 key 之后才需要重跑
node dump-config.mjs         # 取数（默认 base_sepolia_v0.3.1_260729 + latest block）
node check-coverage.mjs      # 核对清单缺口
node group-by-module.mjs     # 按模块汇总成 CSV
node group-by-module.mjs --only-set   # 只要已设置的那 119 条
```

## group-by-module.mjs — 按功能模块汇总

给人看、给 CFG 用例挑参数用的视图。做两件 `.md` 报告不做的事：

**① 折叠探测冗余。** 类型推不出来的 key 走 probe 策略，同一个 DataStore key 会按
uint/int/bool/address/bytes32 各读一遍**各出一行**——1982 行里 672 行是这种噪音。
五行全空 ⇒ 该 key 确实没设，折叠成一行；某一行有值 ⇒ 只留那行。
折叠掉多少行如实写在 `note` 列，不静默丢弃。**多个类型同时读到值时不替你选**，全部保留并标 `⚠ 需回源码定型`。

**② 21 个功能模块归类。** 规则是**有序**匹配、命中即止，顺序本身是语义的一部分：

- `_FEATURE_DISABLED$` 排第一——否则 `EXECUTE_ADL_FEATURE_DISABLED` 会被 ADL 抢走
- Gas 排在 Oracle 前——`ESTIMATED_GAS_FEE_PER_ORACLE_PRICE` 名字里带 ORACLE，但它是 gas 参数
- Relay 排在 Gas 和 Swap 前——`MAX_RELAY_SWAP_WNT_CAP` / `RELAY_FEE_BASE_GAS_LIMIT` 归 Relay

改规则后重跑，终端会列出未归类的 base key；**未归类不是 0 就说明规则有缺口**，补完再用。

### CSV 列

`module,base,argLabel,status,value,readable,type,typeConfidence,settableVia,group,key,note`

`status` 分三档，因为「未设置」这个结论本身有可信度差异：

| status | 含义 |
|---|---|
| `已设置` | 读到非默认值 |
| `未设置` | 类型确定（source-scan / registry），"没设"可信 |
| `未设置(命名推断)` / `未设置(探测)` | 类型是猜的，**"没设"可能只是类型猜错读到了空槽位**，引用前回源码确认 |

无论状态是否“已设置”，`value` 都保留 RPC 实际返回值；未设置项会明确显示 `0`、`false`、零地址或零 bytes32，而不是空白。

`readable` 的精度换算来自 [`lib/hints.mjs`](lib/hints.mjs) 手维护的表——**没有提示的 key 只给原始整数**，
宁可不换算也不给错的换算（`spread 1e18` vs `fee factor 1e30` 是本项目最高频的踩坑对）。

### dump-config.mjs 参数

| 参数 | 默认 | 说明 |
|---|---|---|
| `--rpc <url>` | `$FX100_RPC_URL` 或 `https://sepolia.base.org` | 公共 RPC 够用（走 Multicall3），但私有 RPC 更稳 |
| `--rpc-label <名称>` | 脱敏后的 RPC Host | 写入日志和快照的安全展示名；私有 Fork 建议传项目名，不记录技术 ID |
| `--block <n>` | latest | **复现快照必须钉块**；不钉块两次运行结果不可比 |
| `--deployment <path>` | `base_sepolia_v0.3.1_260729/deployed_addresses.json` | 换部署产物 |
| `--out <dir>` | `../../artifacts/parameter-cache` | 输出目录 |
| `--only-set` | 否 | 只输出非默认值（默认连未设置项一起输出——`orderBookDepth = 0` 这种「没设」本身就是 CFG 用例要抓的结论） |
| `--batch-size <n>` / `--max-calls <n>` | 25 / 40000 | 退回逐条批量时的批大小；读取项数上限保护 |

`group-by-module.mjs --snapshot <params.json> --out <csv>` 可处理不同 Project 环境的独立缓存，避免环境之间互相覆盖。

## registry.json 从源码抽了什么

| 抽取项 | 来源 | 用途 |
|---|---|---|
| 247 个 `bytes32` 常量 | `src/constants/FX100Keys.sol` | key 基名 + 哈希 |
| 155 个 key 派生函数 | 同上 | 参数类型顺序，决定维度展开 |
| 取值类型（152 个已定） | 全仓扫 `dataStore.getXxx/setXxx(Keys.X)`，含 `test/` | 决定用哪个 getter 读 |
| Config 白名单 138 + LimitedConfig 12 | `src/config/Config.sol` 的 `allowedBaseKeys` / `allowedLimitedBaseKeys` | 区分**治理可改** vs **只能 CONTROLLER 直写** |
| 4 个市场属性子键 | `src/market/MarketStoreUtils.sol` | `_efficientHash(bytes32(marketIndex), SUBKEY)` |
| 11 个角色 | `src/constants/Role.sol` | `getRoleMembers` 逐个 dump |

### 两个哈希口径不能混

```solidity
keccak256(abi.encode("X"))   // 绝大多数 key
keccak256("X")               // 只有 4 个：LIQUIDATION_GRACE_PERIOD_BASE / _TIER_MULTIPLIER
                             //            EXECUTION_FEE_SUBSIDIZE / _SIZE
```
两者哈希完全不同，混用会读到一个恒为 0 的空槽位并误判成「未配置」。registry 里按 `hashMode` 分别记录。

## 取值类型的三种来源，报告里分开标

| `typeSource` | 含义 | 可信度 |
|---|---|---|
| `source-scan` | 源码里有 `dataStore.getUint(Keys.X)` 这类直接引用 | 确定 |
| `naming-heuristic`（报告标 `※命名推断`） | `*_FEATURE_DISABLED` 与 `IS_/SKIP_/USE_` 前缀判为 bool，依据 `FeatureUtils.isFeatureDisabled → getBool` | 高，但建议复核 |
| `probe`（报告标 `⚠探测`） | 源码里推不出类型，按 uint/int/bool/address/bytes32 各读一遍**全部列出** | **同一 key 会出现 5 行，只有 1 行是真的**，引用前必须回源码确认 |

探测法是刻意保留的：宁可多列 5 行让人判，也不静默假设一个类型、把读到的 0 当成「未配置」写进用例。

## 维度展开与不可枚举项

带参数的 key 在这些维度上做笛卡尔积（取值域从链上/部署产物实时发现，不写死）：

`market`（MARKET_LIST）· `token`（各市场 index/collateral token + MockUSDC + WNT）· `module`（入口合约）·
`bool` · `orderType`(0-6) · `pnlFactorType` · `feeType` · `graceTier`/`proTier`/`referralTier`(0-3) · `oracleProvider`

快照同时读取 index/collateral token 的链上 `symbol/name/decimals`，把作用域标成 `market#2 · ETH/USDC` 一类可读交易对。BTC 在 Base Sepolia 是没有 ERC-20 metadata 的合成 index 标识地址，因此使用项目配置的 `BTC` 标识；ETH 的实际 `INDEX_TOKEN` 是 WETH。

**41 个 key 不可枚举**（参数是账户地址、时间片 `timeKey`、`positionKey`、任意字符串等），
报告「未取数的 key」一节逐条列出并说明原因。这些必须由具体用例给定入参后单独读——工具不会假装覆盖了它们。

## 输出文件

| 文件 | 用途 |
|---|---|
| `config/<部署名>.params.json` | 机器可读。整数一律 decimal string（符合取数清单「不要先转 JS number」的要求），供用例断言直接引用 |
| `config/<部署名>.params.md` | 人读核对表，带精度换算与「设置路径」列 |
| `config/取数清单-覆盖度.md` | A 已覆盖 / B 对不上 / C 清单缺口 三张表 |

JSON 里每条取值的结构：

```jsonc
{
  "group": "derived",                       // global | derived | market-prop | set-root
  "base": "CONSTANT_PRICE_SPREAD",
  "fn": "constantPriceSpreadKey",
  "scheme": "keccak256(abi.encode(BASE,...args))",
  "args": { "marketIndex": 1 },
  "argLabel": "marketIndex=market#1",
  "key": "0x…",                             // 实际读的 DataStore key，可直接 cast call 复验
  "type": "uint",
  "typeSource": "source-scan",
  "value": "100000000000000",               // 原始整数，decimal string
  "unset": false,
  "settableVia": ["DataStore 直写(CONTROLLER)"],
  "error": null
}
```

## 精度提示只是辅助

`.md` 的「可读值」列来自 [`lib/hints.mjs`](lib/hints.mjs) 的手维护精度表（依据
[附录 C §一 精度公约表](../../profile/C-合约测试约定.md)）。**没有提示的 key 只给原始整数**——宁可不换算，也不给错的换算。
`spread 参数 1e18` vs `fee factor 1e30` 是本项目最高频的踩坑对，提示表里已按 key 分别标注。

## 复验单条取值

报告里的 `key` 是可以直接拿去链上复验的：

```bash
cast call 0x606D72Ab0C0fDcce607d04B1645CE2D528B88014 'getUint(bytes32)(uint256)' <key> --rpc-url https://sepolia.base.org --block <n>
```

keccak256 实现自带自检向量，可与 `cast keccak` 对齐：

```bash
node lib/keccak.mjs
```

## 限流与 Multicall3

近 2000 次读取如果逐条发，公共 RPC（`sepolia.base.org`）一轮只放行约 200 条，剩下全是 `over rate limit`。
工具默认走 **Multicall3**（`0xcA11bde05977b3631167028862bE2a173976CA11`，Base Sepolia 已部署），
一次 `eth_call` 打包 400 次读取，全量取数只消耗个位数配额。

Multicall3 不可用时自动退回逐条批量，并对被限流的条目做指数退避重试；退避耗尽仍未取回的，
在报告里如实标 `over rate limit（退避重试耗尽，未取回）`——**绝不当作 0**。

## 换部署 / 换分支时

1. 合约分支变了 → 先 `node build-registry.mjs --contracts <新路径>`（registry 跟着分支走）
2. 部署产物变了 → `node dump-config.mjs --deployment <新的 deployed_addresses.json>`
3. 取数清单更新了 → 改 `checklist-取数清单.json` 再跑 `check-coverage.mjs`

`registry.json` 里记了生成时的合约 branch/commit，快照 `meta.contracts` 会带上，便于回溯是哪版源码生成的。

## 已知边界

- 只覆盖 **DataStore 键值参数**。合约自身状态变量（LPVault epoch 长度、FeeHandler 三方分账槽位、
  各 Treasury 配置、MockUSDC owner）不在 DataStore 里，本工具不读；需要时另建工具或走 Reader。
- 不比对「期望值」。当前只回答「链上是什么」，不回答「应该是什么」。
  与 `scripts/config/defaults.ts` 的期望值比对是下一步（会引入对部署脚本 TS 的解析依赖，故未纳入本版）。
- `probe` 项与不可枚举项都会如实计数并列名，报告结论里的「已设置 N 项」只统计真正读到非默认值的条目。

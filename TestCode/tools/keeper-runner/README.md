# keeper-runner — 本地起 keeper（配置与被测仓库分离）

keeper 源码在 `Github/fx100-apps@develop/apps/keeper`（monorepo 内）。
本目录只放**测试环境的配置与启动脚本**，不往被测仓库里塞 `.env`。

> **收编说明**：本目录原在工作区的 `Test/project/fx100/tool/keeper-runner`，该树被移出
> AladdinDaoTest 后 `run.sh` 的相对路径全部偏级，导致所有子命令（含 `check` / `status`）
> 在第一行 `cd` 就失败——SCN-009 报错里让你执行的 `./run.sh check` 曾是一条死路。
> 现已收编到 `TestCode/tools/keeper-runner`，并把两处路径改成可覆盖：
>
> - `KEEPER_DIR`：keeper 应用目录。不设则按"收编位置 → 旧位置"顺序自动探测。
> - `KEEPER_ENV_FILE`：keeper 的 `.env`（**含 4 把私钥**）。不设则读同级 `.env`。
>   这份文件不随目录进仓，`.gitignore` 已挡住 `tools/keeper-runner/.env*` 与 `logs/`。
>
> 想让它彻底落在本目录，把你现有的 `.env` 移过来即可（内容我没有读、也没有复制）：
>
> ```bash
> mv /Users/milakou/Documents/AladdinDaoTest-claude/project/fx100/tool/keeper-runner/.env /Users/milakou/Documents/AladdinDaoTest/TestCode/tools/keeper-runner/.env
> ```
>
> 不想移动就用 `KEEPER_ENV_FILE` 指过去，两种都支持。

## 六个入口

keeper 侧有六个 entrypoint，性质不一样，别一股脑全起：

| 命令 | entrypoint | 签名钱包 | 需要的链上角色 | 队列谁来填 |
|---|---|---|---|---|
| `./run.sh producer` | `producer.ts` | 不签名 | — | 它自己（监听链上事件） |
| `./run.sh worker` | `ordWorker.ts` | `ORDER_KEEPER_PRIVATE_KEY` | **ORDER_KEEPER** | producer |
| `./run.sh adl-worker` | `adlWorker.ts` | `ADL_KEEPER_PRIVATE_KEY` | **ADL_KEEPER** | producer |
| `./run.sh liq-worker` | `liqWorker.ts` | `LIQUIDATION_KEEPER_PRIVATE_KEY` | **LIQUIDATION_KEEPER** | producer |
| `./run.sh rel-worker` | `relWorker.ts` | `RELAY_KEEPER_PRIVATE_KEY` | 无 | **前端** `/api/relay/*` |
| `./run.sh inspect` | `inspect.ts` | — | — | 只读，一次性命令 |

`./run.sh both` = producer + ord-worker（日常够用）；`./run.sh all` = producer + 全部四个 worker。

### 三件容易踩的事

**1. 角色不对的 worker 起不来，不是警告是直接退出。** keeper 在启动时 `assertKeeperRole`
（`src/lib/roles.ts:68`），没角色就抛错终止——实测 adl/liq 两个 worker 在无角色时**启动即退出**。
所以 `./run.sh check` 会逐个 worker 报角色状态，缺的直接把 `plan-grant` 授权命令打出来。

体检把 ord-worker 当基本盘（缺它整条链路不通，判失败），adl/liq 缺角色只警告不阻塞——
只跑开仓类用例时它们本来就用不上。

**2. rel-worker 不需要链上角色，但需要前端。** 合约的 `Role.sol` 里根本没有 RELAY_KEEPER
这个角色——它是**代发者**：用户签名、它付 gas 转发到 `RelayRouter`。所以只要钱包有 ETH 就能起。
但它的队列由 `fx-base-app` 的 `/api/relay/*` 填充，**前端没跑的话它只会空转**。

**3. `inspect` 不是常驻进程。** 它只读 Redis，打印队列深度、block cursor、价格缓冲、
清算/触发索引。排查「订单发了但没被执行」时先看它——能立刻分清是 producer 没入队还是 worker 没消费。

```bash
./run.sh inspect                    # 全景快照
./run.sh inspect dump orders        # 看 orders 队列里每一项
./run.sh status                     # 哪些在跑（顺带清理陈旧 pid）
```

## 运行环境 = fork，不是真测试网

`.env` 里的 RPC 指向 **Tenderly Virtual TestNet**（fork 自 Base Sepolia，chainId 同为 84532）。
所有下单/执行交易都只发生在 fork 上，不消耗真实测试网资产、不干扰其他人在测试网上的工作。

chainId 与真链一样是 84532，所以**光看 chainId 分辨不出你在哪**——认 RPC 主机名：
`virtual.base-sepolia.*.rpc.tenderly.co` = fork，`base-sepolia.gateway.tenderly.co` = 真测试网。
切回真测试网只需把 `.env` 底部注释掉的 `FX100_RPC_URL_TESTNET` 对调上来（**别顺手切**）。

fork 是某个块的快照：fork 之后别人在真测试网上做的事（注资、授权、部署）**不会**同步进来，
需要时重新 fork 一次。

```bash
cp .env.example .env      # 填空
./run.sh check            # 前置体检：配置、角色、Redis、余额
./run.sh both             # 起 producer + ord-worker
./run.sh stop
```

## 为什么必须起 keeper

链上 `OrderHandler.executeOrder(key, SetPricesParams)` 有两道锁，测试账号都过不去：

1. **角色锁** — 需 DataStore 的 `ORDER_KEEPER`。链上当前**只有 1 个持有者**：
   部署者 EOA `0xf82cf35c…d403`（同时是 DEFAULT_ADMIN 与全部 KEEPER）。
2. **报价锁** — `SetPricesParams.data` 是 Chainlink Data Streams 的**签名报价**，
   签名由 Chainlink 出，测试者伪造不了，只能用 `CHAINLINK_API_KEY`/`SECRET` 从 Data Streams API 拉。

不起 keeper，下的单会一直 Pending —— 那是 `BLOCKED`，不是被测系统的 `FAIL`。

## 三个最容易踩的配置坑

| 坑 | 后果 |
|---|---|
| `KEEPER_CHAIN_ID` 抄了模板默认的 `99918` | 跑到 Tenderly 主网 fork 上，不是 Base Sepolia |
| `CHAINLINK_NETWORK` 抄了模板默认的 `mainnet` | feed-id 集选错，84532 必须是 `testnet` |
| 直接拿 `pk.txt` 当 keeper 私钥 | 违反项目铁律 5。请 admin `grantRole(ORDER_KEEPER, 新地址)`，用新地址的私钥 |

`run.sh check` 会逐条查这些，包括**链上实查 `hasRole`** —— 角色没授上会当场报出来，
不会等你发了交易才发现。

## 安全阀

`KEEPER_DRY_RUN=true`（默认）时 worker 只验证不广播。角色确认无误后再改 `false`。
`run.sh check` 每次都会把当前档位打出来。

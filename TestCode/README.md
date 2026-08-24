# FX100 E2E TestCode

这是 FX100 用户级 E2E 自动化的独立工程。测试设计仍以 [`../TestCase/E2E`](../TestCase/E2E/README.md) 中的 80 条 `SCN` 场景为准；本目录只负责自动执行、环境控制、数据核对、证据输出和测试看板。

项目初始化和首批真实交易切片已经完成：`SCN-009` 在 `tx-fork` 覆盖 Inline Keeper 市价开多/全平；`SCN-010` 在 `oracle-fork` 使用当前环境登记的 Market Bundle，通过 Index Mock Oracle 构造 P-10% 精确触发，完成 LimitIncrease 开多/全平；`SCN-070` 在 `oracle-fork` 覆盖市价开多、开空、平多、平空的 `E=A` 与不利越界边界。协议自动化用例输出真实签名交易、事件、Reader 和账本证据；页面与浏览器钱包交互由手工核对用例单独覆盖。

## 已确定的执行方案

| 环境 | 用途 | 状态控制 |
|---|---|---|
| `dev-readonly` | 页面展示、市场切换、语言、基础可用性 | 不修改链上状态 |
| `tx-fork` | Inline Keeper 普通交易和完整账本核对 | Index + USDC 双 Mock Oracle；每例恢复基线 |
| `oracle-fork` | 触发价、极端价格、清算、脱锚 | Index + USDC 双 Mock Oracle；每例恢复基线 |
| `time-fork` | Funding、EMA、保护期和超时 | 可推进区块时间；关闭 State Sync |
| `base-sepolia` | Service Keeper 专项和真实部署参数核对 | 标准 Market/Oracle；允许显式交易，不修改 Oracle 或时间 |

Fork 上的交易和链上数据核对默认使用 `default-mock` Market Bundle：专属 Index Token + Index Mock Oracle、环境共享 USDC + USDC Mock Oracle、Synthetic Market 和参数套件。同一 Fork 也可以按别名增加多个独立 Bundle；它们共享 USDC 侧资源，但各自拥有 Index Token/Oracle、Market 和参数快照。交易仍由真实测试私钥签名，并经过真实协议合约与 Inline Keeper。Service Keeper 专项默认使用 `base-sepolia` 的标准 Market/Oracle；只有标记为兼容的用例才允许切换过去。

## 快速开始

```bash
cd TestCode
npm install
cp .env.example .env.local
npm run config:validate -- ./config/deployments/base-sepolia-v0.3.1-260729.json
npm run doctor
npm run typecheck
```

首次在本机运行浏览器测试前执行：

```bash
npm run playwright:install
```

## 基线登记与版本切换

测试基线只登记在一处：[`../Docs/contract-releases/CURRENT.json`](../Docs/contract-releases/CURRENT.json)（人读镜像 `CURRENT.md`）。本工程不复述版本号，全部由 `src/config/baseline.ts` 运行时读取（缺失时 `console.warn` 并回退既有机制，不抛错）：

| 字段 | 含义 | 来源 |
|---|---|---|
| `run.release`（`artifacts/runs/*/results.json`）/ 批次 `release`（`artifacts/run-batches/*/run.json`） | **环境实际部署版本**。Reporter 按 `CURRENT.json` `environments[env].forkOf → deployments[].releaseLabel` 解析（多环境映射到不同部署时以 ` \| ` 连接）；无映射（如未登记的环境、`forkOf=null` 的 time-fork）时回退 `E2E_RELEASE`（看板批次注入或 `.env.local`）。`run.releaseSource` 记录来源（`CURRENT.json` / `E2E_RELEASE`） | `resolveRunRelease()` |
| `run.targetRelease` / 批次 `targetRelease` | **目标测试版本** `CURRENT.json` `primary.version` 的标签形式（`release-vX.Y.Z`），运行 / 建批时写入 | `targetRelease()` |
| `run.releaseMismatch` / 批次 `releaseMismatch` | 环境基线与目标基线按 `vN.N.N` 归一化后不同 → `true`；任一方缺失不写 | `isReleaseMismatch()` |

三个字段在 `src/reporting/schema.ts` 均为 optional，历史产物不受影响。主看板与 `/runs` 页头显示「目标基线 vX（CURRENT.json）｜环境基线 vY」（目标基线在渲染时实时读登记；环境基线取运行记录），不一致时给出醒目徽章「环境基线 ≠ 目标基线：本批不充当目标版本回归材料」；`summary.md` 第二行同步写出；`/api/version` 返回 `release / releaseSource / targetRelease / releaseMismatch / currentTargetRelease / baselineRegistry`。`/runs` 页「版本 / Release」输入框默认值取 `CURRENT.json` 环境映射的部署标签（各环境唯一时），保证「批次 release = 环境实际部署版本」；改 `.env.local` 的 `E2E_RELEASE` 只影响无映射环境的回退值。

切换测试版本的步骤：只改 `CURRENT.json`（`primary` / `deployments` / `environments.*.forkOf`），然后在本目录运行基线引用 lint：

```bash
npm run baseline:lint                 # 有过期引用退出码 1（默认）
npm run baseline:lint -- --warn-only  # 仅告警，退出码 0
npm run baseline:lint -- --json       # 机器可读（stale 明细）；加 --verbose 连同已标注/允许项一起输出
```

lint 扫描 `CLAUDE.md`、`Docs/**/*.md`（跳过 `Docs/contract-releases/v*/` 版本目录与 `Docs/Gordon-Notion需求文档归档/`）、`TestCase/**/*.{md,csv}`、`TestCode/README.md`、`TestCode/docs/*.md`、`.claude/skills/**/*.md`，找「当前 / 主测 / CURRENT / 基线 / 适用基线 / 代码版本」12 字内出现 `release[/-]vN.N.N` 或 `vN.N.N` 字面量的行，与 `primary` 比对：版本 ≠ `primary` 且行内无「快照 / pinned / 对比基线 / 历史 / @v」标注即判 **stale**（`file:line` + 原因）。确实需要写死旧版本且不便加「@vX.Y.Z 快照」标注的行，登记到 `config/baseline-lint.allow.json`（`file:line` / 整文件 / `regex:` 前缀，相对工作区根）并在 `$why` 写明原因。

## 当前目录

```text
TestCode/
├── abi/                         # 固定版本 ABI，后续由项目方提供
├── config/
│   ├── deployments/             # 已部署地址和市场清单
│   ├── environments/            # 五类执行环境定义
│   └── markets/                 # Synthetic Market 参数 Profile
├── contracts/                   # Mock Token / Mock Oracle 接入约定
├── docs/                        # 完整方案与准备清单
├── scripts/                     # doctor、配置校验，后续增加 bootstrap
├── src/
│   ├── config/                  # 配置加载和 schema
│   ├── domain/                  # 精度与领域类型
│   ├── drivers/                 # Fork/Oracle/Protocol/Keeper 接口
│   └── reporting/               # 结果模型、Reporter、Markdown 和 HTML 看板
├── tests/                       # 按 S01～S08 建立；已有 15 条 spec 落在 S02 / S03 / S07（清单见文末）
└── artifacts/                   # 报告、Trace、截图和链上证据
```

## 准入原则

开始实现用例前必须满足：

1. 三个 Tenderly Fork RPC 可用，每个 Fork 的固定 chainId 与配置一致（当前约定 99911 / 99912 / 99913）；
2. 已部署地址、ABI、Proxy implementation 和 Keeper 角色明确；
3. 页面交易、Reader、Indexer、Keeper 指向同一 Fork；
4. Synthetic Market 能被协议、页面和数据层同时识别；
5. Mock Oracle 可以设置 `min/max/timestamp`；
6. 时间 Fork 可以推进时间并生成新区块；
7. 每条用例可以恢复到同一基线；
8. `npm run doctor` 全部通过。

详细说明：

- [框架与环境方案](docs/01-框架与环境方案.md)
- [项目准备清单](docs/02-项目准备清单.md)
- [后续用例实施约定](docs/03-后续用例实施约定.md)
- [测试结果与看板](docs/04-测试结果与看板.md)
- [Market Bundle 与 Keeper 执行模式](docs/05-Market-Bundle与Keeper执行模式.md)

## 默认 Mock 资源

`tx-fork`、`oracle-fork`、`time-fork` 初始化时默认准备一套完整的 `default-mock` Market Bundle，也可通过 `--bundle <alias>` 增加独立 Mock Market：
专属 Index Token、Index Mock Oracle、环境共享 USDC、USDC Mock Oracle、链上 Synthetic Market、两路 Token Oracle 配置和 33 项 Market 参数。其中 USDC Token 从 LPVault `asset()` 读取并复用；USDC Mock Oracle 在每个 Fork 中重新部署，Base Sepolia 的 Oracle 配置不会被修改。默认 USDC 区间是 `min=0.999 / max=1.001`，由 Mock Feed Price 和 DataStore `STABLE_PRICE` 共同形成。
Market 参数清单集中在 `config/markets/default-mock.ts`，数值在初始化时从同部署版本的
MockBTC 参考市场读取、复制并逐项回读，最终一起写入 `config/mock-resources.json`。
`dev-readonly` 和 `base-sepolia` 不会部署 Mock 合约。

用例的默认资源与兼容能力是两个独立字段：

- `marketMode=mock-market` 表示默认运行资源；
- `marketCompatibility=mock-only` 表示依赖可控价格、参数、时间或精确边界，不能切换标准 Market；
- `marketCompatibility=mock-and-deployed` 表示默认仍跑 Mock，但可以显式改用已部署 Market + 非 Mock Oracle；
- `deployed-only` 用于 `dev-readonly` 页面检查，或 `base-sepolia` 的 Service Keeper/标准 Market 专项；
- `not-applicable` 表示用例不涉及 Market。

首版标记为 `mock-and-deployed` 的用例共 23 条：`SCN-005/006/008/017/018/021/024/025/027/028/031/032/033/034/040/048/052/053/054/056/059/062/065`。`SCN-001/004/063` 属于 `dev-readonly` 的 `deployed-only` 页面检查。这是一份保守白名单；只有不依赖人为改价、参数注入、精确时间或风险边界的场景才进入该列表。

```bash
# 一键创建 Tenderly Virtual TestNet（固定 Chain ID：tx-fork 99911 / oracle-fork 99912 / time-fork 99913）
# 前置：.env.local 或环境页 ① 配好 E2E_TENDERLY_ACCESS_TOKEN（可选 E2E_TENDERLY_ACCOUNT_SLUG / E2E_TENDERLY_PROJECT_SLUG，留空从已配置的 Fork RPC 推导）
# 创建后自动：eth_chainId 校验 → 回填 .env.local 的 RPC / Admin RPC / WSS / Chain ID → 登记 config/tenderly-vnets.json 与 Docs/contract-releases/CURRENT.json
npm run env:vnet:create -- --env time-fork                 # 可加 --block <十进制区块> 钉死 fork 点；--dry-run 只打印请求体
npm run env:vnet:list                                      # 本地登记（无凭证）
npm run env:vnet:delete -- --env time-fork                 # 删除该环境最近一次创建的 VNet（CI/临时环境务必清理，避免配额堆满）

# 查看三个私有 Fork 的默认资源状态
npm run env:show:mock

# 首次初始化或 Fork 重建后执行；项目可选 tx-fork/oracle-fork/time-fork
npm run env:init:mock -- --project oracle-fork

# 在同一 Fork 新增一个独立 Index Market；共享现有 USDC Token/Oracle
npm run env:init:mock -- --project tx-fork --bundle mock-eth

# 明确重建共享 USDC Oracle（会影响同 Fork 全部 Market）
npm run env:init:mock -- --project tx-fork --bundle default-mock --force --force-shared-collateral

# 造数据计划执行（页面「Faucet & 交易」编辑保存的 JSON；最多 100 Trader 注资 + 网格批量下单）
npm run env:noise:trades -- --plan config/noise-plan.json

# 兼容模式：多 Trader 模拟交易铺底（默认 3 个内置 noise trader × 2 单留仓；交易不做核验）：
# 使环境数据更复杂——双侧非零 OI、Skew、Funding、多仓并存。
# 纪律：在跑用例批次前铺底；与批次并发会被用例的窗口纯净度断言如实拦截。
# 可选：--traders 0xA,0xB（或配 E2E_NOISE_TRADER_ACCOUNTS）、--orders N、--close 随即平仓
npm run env:noise:trades

# 每用例专属 Trader（per-case 档案）：先生成花名册（100 个真实 EOA，24 词助记词 BIP-44 派生；
# 私钥束仅本机 config/noise-traders.secret.json，0600+gitignore；已存在会拒绝覆盖，确认换批先备份再加 --force），
# 再按确定性规则（SCN-0NN → Trader NN；SCN-B32-0N → Trader 80+N）生成 config/case-traders.json（88 条，只含地址与编号，入库）。
npm run traders:generate                                   # 可加 -- --count N（默认 100）
npm run traders:map
# 跑批加 E2E_TRADER_ASSIGNMENT=per-case 后，15 条 SCN spec 会在顶部注入该场景专属 trader，
# 并在任何 evm_snapshot 之前幂等注资（ETH/USDC 金额与环境初始化 funding 口径一致，经 admin RPC cheatcode）。
# 未设该变量时行为与共享 trader 完全一致；E2E_TRADER_PROFILE=ui（前端观测档案）在场时 per-case 自动让位并 console.warn。

# 独立核对 Bundle、两路 Mock Oracle、Reader Market 和 33 项参数
E2E_ENV=oracle-fork npm run env:verify:mock

# 核对指定 Bundle
E2E_ENV=tx-fork npm run env:verify:mock -- --bundle mock-eth
```

用例代码通过 `resolveDefaultMockResource(project)` 解析 `bundleId`、Market、Index Token/Oracle、
USDC/Oracle、Vault 和 `marketIndex`，不直接写地址。初始化采用 Fork 快照保护；任一部署、Market 创建、参数写入或
回读失败都会回滚，不会把半成品登记为 `ready`。

`env:bind:mock-market` 仅保留给旧 Fork 兼容，不是新环境的默认初始化路径。

## SCN-009 首轮执行

该用例默认使用 Inline Keeper：测试程序分别用 Trader 与 ORDER_KEEPER 私钥发送真实交易，不依赖常驻 producer/order worker。执行前先运行 `npm run doctor`，并确认 `tx-fork/default-mock` 已通过双 Mock Oracle 验证。

日常隔离回归使用账户模拟，并在结束时自动 `evm_revert`：

```bash
npm run test:scn009
npm run dashboard:serve
```

需要验证真实签名并保留交易证据时，显式注入 `E2E_TEST_PRIVATE_KEY`，确认 Keeper 为 `dryRun=false`，再运行：

```bash
npm run test:scn009:signed
```

`test:scn009:signed` 会由本地私钥签名用户开仓/平仓交易，再由 ORDER_KEEPER 私钥 Inline 执行，并保存四笔交易的 transaction、receipt、`from`、签名字段、事件和账本。该入口不会自动回滚 Fork。私钥只能通过本机环境或密钥服务注入，禁止写入报告或提交仓库。

## SCN-010 限价触发执行

普通验证会在结束后回滚用例快照：

```bash
npm run test:scn010
```

需要保留真实交易与看板证据时运行：

```bash
npm run test:scn010:signed
```

该用例在 `oracle-fork` 解析当前登记的 `default-mock` Market Bundle，不再硬编码 Market #1 或 Token 地址，也不临时替换 PriceFeed。用例把 Index Oracle 的 `min/max` 同比下调到 P-10%，保持 USDC Mock Oracle 不变；用户真实签名创建 `LimitIncrease(1)`，到价后由 Keeper 真实签名执行，再由用户/Keeper 真实签名全平。结束时精确恢复两路 Mock Oracle 的价格、时间戳和 `StablePrice`；环境管理交易与四笔业务交易在证据中分开记录。

浏览器打开 `http://localhost:4173/` 查看最新运行结果。Keeper 凭据继续从既有 Keeper 环境文件运行时读取。

## SCN-070 市价四象限可接受价

先做不访问链的矩阵与比较方向自检：

```bash
npm run test:scn070:model
```

`oracle-fork/default-mock` 初始化并绑定市场后，执行真实签名链路：

```bash
npm run test:scn070
```

正式基线包含 8 个数据集：开多、开空、平多、平空各验证一次 `executionPrice = acceptablePrice` 成交，以及一次向不利方向越过最小可达 Oracle 步长后取消。每个数据集使用独立 Fork 快照，验证 OrderStore、EventEmitter、Reader 仓位和抵押币退款；不把普通的 4 笔市价交易当作边界覆盖。

## 看板预览

需要演示完整 80 条场景的筛选和页面功能时，可以生成明确标记为 `FIXTURE` 的功能预览：

```bash
npm run dashboard:fixture
npm run dashboard:verify -- ./artifacts/fixture-dashboard/dashboard.html
npm run dashboard:serve
```

浏览器打开：`http://localhost:4173/`。

页面入口：

- `http://localhost:4173/`：测试结果与场景明细；
- `http://localhost:4173/executions`：执行详情，按阶段展示 `before / after / Δ / expected`，覆盖资金账户、仓位、Fee、Funding、OI、Skew、Spread、PnL；支持按业务类别或交易阶段点击筛选，并可直达对应测试用例查看/编辑；
- `http://localhost:4173/test-cases`：80 条测试用例查看、按计划 Project / 市场兼容性筛选与编辑；每条用例显示默认市场资源、标准 Market 兼容性、时间能力、签名方式和 Mock 资源别名；
- `http://localhost:4173/runs`：创建版本化测试运行；支持单条、部分、全部用例，默认使用用例的 Mock 资源，也可对兼容用例切换标准 Market；同时支持默认/覆盖环境和新 RPC；
- `http://localhost:4173/environments`：按顺序分步配置——①Fork 与 RPC（含 Tenderly Virtual TestNet 建法指引与自定义 Chain ID 提示，填好即存）→ ②Trade/账户/高级配置（默认折叠，需修改自行展开）→ ③Mock Market Bundle 初始化 → ④环境检查（验收）。选择 `base-sepolia` 时隐藏 ③，只维护已有部署需要的配置；Mock Oracle 价格与参数直写在"合约参数"页；
- `http://localhost:4173/faucet`：**Faucet & 交易** 运维工具页：Base Sepolia Faucet 余额监控、低余额告警与自动补款、Fund USDC，以及**造数据计划**（最多 100 个 Trader：地址自动派生或粘贴覆盖 → 逐个注资 ETH/USDC + Router 授权 → 按网格规则批量下单：fixed 固定 / linear 线性递增 / ratio 等比递增，多空可交替；三种编辑方式——预设生成器、规则表格、高级 JSON 双向同步；展开预览逐单清单后再执行；后台任务 + 实时日志 + 历史任务表；计划保存在 `config/noise-plan.json`；交易不做核验；纪律：批次前铺底，并发会被窗口纯净度断言拦截）。测试期专用，与测试结果数据无耦合，上线后如不再需要可整页下线；
- `http://localhost:4173/parameters`：合约参数清单与筛选；私有 Fork 环境额外提供 **Mock Oracle 价格面板**（实时读数 + 刷新时间戳/设置新价格）与**单参数直写**（每行"修改"按钮 → DataStore 直写 + 回读核对；改动不自动恢复，页面有显著警示）；
- `http://localhost:4173/formulas`：合约核心公式和精度口径；
- `http://localhost:4173/page-formulas`：需求总结中的页面数据计算公式。

本地接口：

- `GET /api/version`：框架版本、结果 schema、run、release、数据状态和页面入口；
- `GET /api/results`：当前 `results.json`；
- `POST /api/fund-usdc`：同源测试看板专用；按链上 LPVault `asset()` 解析 USDC。`base-sepolia` 使用匹配 token `owner()` 的 `E2E_TOKEN_OWNER_PRIVATE_KEY` 发送真实 `MockToken.mint` 交易，三个私有 Fork 使用 `tenderly_setErc20Balance`，两种方式都会回读核对；
- `GET /api/environments`：环境能力、RPC 是否已配置及脱敏地址；
- `GET/POST /api/mock-oracle-prices`：读取 default-mock 两个 Mock Oracle 的链上 feed 价、有效 Min/Max 区间与时间戳新鲜度；同源 POST 刷新时间戳（价格不变）或设置 Min/Max（Min 写 MockOracle answer，Max 写 DataStore `STABLE_PRICE`，provider 取两者排序为价格区间）；仅三个私有 Fork 可用；
- `GET/POST /api/noise-trades`（+ `/:id`）：模拟交易铺底任务——GET 列任务与已配置 Trader；同源 POST 启动（计划模式传 `plan`；兼容模式 traders / ordersPerTrader / closeAfter），一次只允许一个任务运行；任务与计划落盘 `artifacts/noise-trades/<id>/`，服务重启时未完成任务标 INTERRUPTED；
- `POST /api/noise-traders/wallets`：生成 N 个**真实 EOA**（含私钥，可自主签名发交易）——默认助记词模式（一个 24 词助记词按 BIP-44 `m/44'/60'/0'/0/i` 派生，备份助记词即可完全恢复；可传已有 mnemonic 重派生），random 模式每个独立私钥。**私钥束只写本机 `config/noise-traders.secret.json`（0600、gitignore），API 与页面永不返回私钥/助记词**；公开花名册同步写 `noise-traders.json/.csv`（`source: wallet`）。造数据脚本检测到私钥束且全部 Trader 有私钥时自动切换为**私钥真实签名**下单（Router 授权与 createOrder 均由钱包自签），否则走 impersonation；
- `GET/POST /api/noise-traders` + `GET /api/noise-traders.csv`：Trader 花名册——GET 读已保存花名册（无则 100 个派生地址预览）；同源 POST 生成 N 个（1–100）并落盘 `config/noise-traders.json` + `.csv`（可传 overrides 覆盖前若干个）；CSV 下载接口。地址按序号确定性派生（`0x1001…0001`…），fork 上 impersonation 免私钥，任何时候可按序号重算；
- `GET/PUT/POST /api/noise-plan`：造数据计划——GET 读已保存计划（无则预设骨架）与全部预设；同源 PUT 保存到 `config/noise-plan.json`；POST 展开预览（不落盘不上链，返回摘要与逐单清单）；
- `POST /api/parameters/set`：单参数直写（同源）：按 DataStore key + 类型写入新值（模拟持有 CONTROLLER 的 Config 合约），写入后回读核对并返回 before/after/txHash；仅三个私有 Fork 可用；
- `GET/POST /api/environment-initializations`：查询或创建环境初始化任务；保存 RPC、验证 chainId/快照能力，并按 `bundleAlias` 部署独立 Market Bundle；`forceSharedCollateral` 仅用于明确重建环境共享 USDC Oracle；
- `GET /api/environment-initializations/<id>`：查询初始化状态和脱敏日志；
- `GET /api/run-batches`：最近的版本化运行及逐用例状态；
- `POST /api/run-batches`：从同源看板创建运行批次；
- `GET /api/run-batches/<runId>`：查询运行进度、结果和脱敏日志；
- `PUT /api/run-batches/<runId>/manual-result`：回填手工核对用例的人工结论（`caseId` / `status` / `operator` / `note`）；只接受该批次里 `manual` 的用例，`status=MANUAL` 表示撤销回填；
- `PUT /api/run-batches/<runId>/manual-start`：记录手工核对用例的人工开始执行时间（点"打开前端并开始"时触发），已开始过不会被重置；
- `GET /api/manual-check-target`：手工核对要打开的被测前端地址，只读复用测试环境的 Trade 站点地址 `E2E_APP_BASE_URL`（返回站点根地址与 `/trade`）；
- `GET /api/transactions/<txHash>`：按交易哈希查看当前运行中保存的交易与回执证据；
- `GET /health`：服务与看板数据健康状态；
- `GET /summary.md`：Markdown 摘要。

默认只监听 `127.0.0.1`，且只允许读取 `artifacts/latest` 的固定结果与资料页面。切换输出目录或端口：

```bash
npm run dashboard:serve -- --dir artifacts/fixture-dashboard --port 4173
```

正式运行后，自定义 Reporter 会在 `artifacts/runs/<run-id>/` 和 `artifacts/latest/` 同时生成：

- `results.json`：机器可读的权威运行结果；
- `summary.md`：适合 CI、PR 和清单回填的摘要；
- `dashboard.html`：无需服务端、无需网络的离线看板；
- `executions.html`：逐用例执行详情、数据核对公式和交易证据；
- `parameters.html`：由系统参数 CSV 生成的可筛选资料页；
- `formulas.html`：由核心计算公式 Markdown 生成的阅读页；
- `page-formulas.html`：由需求总结中的页面字段计算公式生成；
- `test-cases.html`：80 条场景明细与最近执行结果，Node 服务模式支持编辑。
- `runs.html`：测试运行创建、环境/RPC 确认、执行进度和最近批次页面；离线模式仅用于预览。

测试用例页面不会直接重写 `TestCase/E2E/scenarios/*.md`。编辑内容经过字段长度、编号、套件和优先级校验后保存到 `config/test-case-overrides.json`；后续 Reporter 和看板会自动应用覆盖层。直接双击 HTML 文件时保持只读。

## 前端显示值核对（Phase 1，2026-08-19）

链驱动制备状态 + Playwright 在全平前停点打开本地前端采集平仓弹窗（Est. Receive / Fee / Est. P&L / 执行价）→ 与链上事实三方核对，结果进看板 `dataSource=前端` 分组（UI 偏差不拉低协议状态）。方案、前端缺陷（需求 D/E/F）、运行手册与已知限制见 [`docs/07-前端显示值核对与testid契约.md`](docs/07-前端显示值核对与testid契约.md) 附录四。一键命令：

```bash
E2E_ENV=tx-fork E2E_TRADER_PROFILE=ui E2E_UI_COLLECT=true E2E_ENV_PRIORITY_KEYS=E2E_ENV,E2E_TRADER_PROFILE npx playwright test tests/S03/scn-022.spec.ts --project=tx-fork
```

前置：本地前端（`.claude/launch.json` → `fx100-frontend-local`）、`scripts/frontend-fork-patch.ts apply`、`scripts/prepare-ui-trader.ts`。

## pipeline 一键链路

`scripts/pipeline.ts` 把跑批全链路串成一条无头命令（看板跑批之外的 CLI 入口）：

```
A 环境存在性 ──→ B 环境准备 ──→ C 按例 Trader（可选）──→ D 跑批 ──→ E 回收
  复用已配置        init:mock         trader-roster           playwright      rebuild-latest
  或新建 VNet       verify:mock       覆盖检查+批量注资        --project=<env>  + verify + 摘要表（+归档）
```

示例：

```bash
# 先看计划（不创建 fork、不发交易、不跑批）
npm run pipeline -- --env tx-fork --cases SCN-009 --dry-run

# 实跑两条场景并归档证据最小集
npm run pipeline -- --env tx-fork --cases SCN-009,SCN-022 --archive scn009-scn022-batch

# 全部 spec + 按例专属 Trader
npm run pipeline -- --env tx-fork --all --per-case-traders
```

flags 一览：

- `--env <tx-fork|oracle-fork|time-fork>`：必填，目标 Fork 环境（同时作为 Playwright `--project`）；
- `--cases SCN-009,SCN-022`：逗号分隔场景（与 `--all` 二选一；无关环境的 spec 会自声明 SKIP，属正常）；
- `--all`：`tests/**/scn-*.spec.ts` 全部；
- `--fresh`：强制重建——新建 Tenderly VNet 并重新初始化 Mock 资源；
- `--skip-vnet`：跳过阶段 A 的创建动作（RPC 未配置时中止）；
- `--skip-init`：跳过阶段 B（不 init 不 verify）；
- `--force`：`env:verify:mock` 失败时醒目告警后继续；
- `--per-case-traders`：启用按例专属 Trader（阶段 C 检查 `config/case-traders.json` 覆盖并批量注资，子进程注入 `E2E_TRADER_ASSIGNMENT=per-case`）；
- `--archive <name>`：阶段 E 末尾调用 `evidence-archive/tools/archive-evidence.py` 归档本批证据最小集（仅 PASS 场景入档）；
- `--dry-run`：只打印各阶段计划，不触链。

约定：reporter 自动写 `artifacts/runs` 并合并 `latest`，pipeline 不传 `--reporter` 覆盖；摘要表读取 `artifacts/latest/results.json`，当 `run.releaseMismatch` 为真时明确提示「环境基线≠目标基线：本批结果不充当目标版本回归材料」；全程不打印任何 RPC URL / 私钥（环境状态只打印 configured / chainId）。退出码：0 成功，2 参数错误，10/20/30/40/50 对应阶段 A–E 失败。

## 从看板执行用例

在“测试用例”页面勾选一条、多条或全部用例，点击“执行所选”进入“测试运行”页面：

1. 填写版本 / Release，用于本次报告和运行历史；
2. Market 执行资源默认选择用例的 `default-mock`；只有 `mock-and-deployed` / `deployed-only` 用例可以切换标准 Market，不兼容用例会在创建前被拦截；
3. 默认按每条用例的 `targetProject` 分组执行；
4. 如选择统一覆盖环境，留空 RPC 表示使用现有配置；输入新 RPC 表示更新该环境的 `.env.local` 后再执行；
5. 选择环境并填写 RPC 后，可先点击“保存 RPC 并初始化环境”；新 RPC 会被视为新 Fork，按页面中的 Bundle Alias 创建完整的 Token、Oracle、Market 与参数套件；
6. 已有 RPC 留空时，初始化按钮只验证连接、chainId、快照/时间能力并复用共享 USDC Oracle；可单独重建所选 Bundle，只有明确需要更新 USDC Min/Max 或共享地址失效时才勾选“同时重建共享 USDC Oracle”；
7. RPC 地址只在本机配置与子进程中使用，页面、任务 JSON 和日志只保留配置状态或脱敏地址；
8. 环境初始化和测试运行共用串行队列，避免同时修改同一 Fork；
9. 只有存在 `tests/**/scn-xxx.spec.ts` 的场景会启动 Playwright，其余场景明确记录为 `NOT_AUTOMATED`；
10. 同一批次里的手工核对用例（`executionMode=manual`）不会被代跑，创建后直接记为 `MANUAL`，由右侧“手工核对清单”人工回填。

### 手工核对用例怎么走

一个批次可以同时包含自动化和手工用例（例如一次选 SCN-001~010）：看板只对有 spec 的用例启动 Playwright，手工用例进入“手工核对清单”面板。

1. 面板按用例列出前置条件、测试数据、操作步骤、期望结果，点”导出清单”可生成 Markdown 交给手工执行人员；
2. 被测前端地址直接读测试环境页面已配置的 **Trade 站点地址 `E2E_APP_BASE_URL`**，不另存一份；点”打开前端并开始”会在新标签打开该站点的 `/trade`（与环境检查同一口径），并记录这条用例的人工开始时间；未配置时按钮禁用并提示去测试环境页面填写；
3. 顶部填一次”执行人”，每条用例填”实际结果 / 证据”后点击”标记通过 / 标记失败 / 标记阻塞”；执行人或证据为空会被前后端同时拒绝——无证据的勾选不算通过；
4. 回填结果写入 `artifacts/run-batches/<runId>/run.json` 的 `manualVerdict`（结论、执行人、证据、时间）与 `manualStartedAt`，回填行会显示人工耗时；标错可以”撤销回填”退回 `MANUAL`（开始时间一并清空，便于重新执行）；
5. 批次状态由逐用例状态按固定优先级推导：`RUNNING` → `QUEUED` → `INTERRUPTED`（服务重启打断过的批次不会因为人工回填变回"跑完了"）→ `FAIL`（任一用例 FAIL/BLOCKED）→ `MANUAL_PENDING`（还有手工用例未回填）→ `NO_AUTOMATION` → `PASS` → `PARTIAL`。自动化部分全绿不会把整批记成 `PASS`；批次已是 `FAIL` 时，未回填的手工用例数仍显示在清单标题上；
6. 自动化用例的结果只能来自 Playwright 产物：接口拒绝对非手工用例的人工回填，也拒绝覆盖已带 Playwright 产物结果（`resultRunId`）的用例。

如果页面提示 `Method Not Allowed`，说明当前页面仍由旧版进程或静态预览服务提供；停止旧服务后重新执行
`npm run dashboard:serve`，再从 `http://127.0.0.1:4173/runs` 操作。新版页面会在启用按钮前检查初始化能力。

当前已有自动化代码的 spec 共 15 条（`tests/**/scn-xxx.spec.ts`，以目录实际文件为准，`npm run test:list` 可核对）：

| 套件 | spec | 覆盖要点 | 默认环境 |
|---|---|---|---|
| S02 | `tests/S02/scn-009.spec.ts` | SCN-009 市价开多快速退出——**涨 / 平 / 跌三组受控价格数据集**（+3% / 0 / −3%，跨数据集断言 `traderUsdcDelta` 严格递减）已自动化 | tx-fork |
| S02 | `tests/S02/scn-010.spec.ts` | SCN-010 现价下方限价开多（Index Mock Oracle P-10% 精确触发，真实签名链路） | oracle-fork |
| S02 | `tests/S02/scn-011.spec.ts` | SCN-011 现价上方限价开空 LimitIncrease short | tx-fork |
| S02 | `tests/S02/scn-012.spec.ts` | SCN-012 突破追多 StopIncrease long | tx-fork |
| S02 | `tests/S02/scn-013.spec.ts` | SCN-013 破位追空 StopIncrease short | tx-fork |
| S02 | `tests/S02/scn-015.spec.ts` | SCN-015 括号单 TP 先触发 LimitDecrease long | tx-fork |
| S02 | `tests/S02/scn-016.spec.ts` | SCN-016 括号单 SL 先触发 StopLossDecrease long | tx-fork |
| S03 | `tests/S03/scn-022.spec.ts` | SCN-022 纯价格 PnL 与实际可得差异（盈利全平双向数据集；可选前端显示值采集） | tx-fork |
| S03 | `tests/S03/scn-023.spec.ts` | SCN-023 盈利分批兑现（部分平 50% 后清仓） | tx-fork |
| S03 | `tests/S03/scn-024.spec.ts` | SCN-024 紧急全部平仓（亏损全平双向数据集） | tx-fork |
| S03 | `tests/S03/scn-025.spec.ts` | SCN-025 同方向加仓（加仓双向数据集） | tx-fork |
| S07 | `tests/S07/scn-065.spec.ts` | SCN-065 市价开空与平空 MarketIncrease short | tx-fork |
| S07 | `tests/S07/scn-066.spec.ts` | SCN-066 空头下跌止盈 LimitDecrease short | tx-fork |
| S07 | `tests/S07/scn-067.spec.ts` | SCN-067 空头上涨止损 StopLossDecrease short | tx-fork |
| S07 | `tests/S07/scn-070.spec.ts` | SCN-070 市价四象限可接受价（等号成交与不利越界取消，8 数据集） | oracle-fork |

环境资源就绪后，用例会生成测试结果、执行详情、交易链接和核对证据。运行记录的 `release` / `targetRelease` / `releaseMismatch` 语义见上文「基线登记与版本切换」。

# 07 - 前端显示值核对与 testid 契约

> **Phase 0 交付物**:给前端工程师的 PR 需求(testid 清单 + 命名规范 + data-raw 说明)+ 给核对方的口径速查与环境接线。
> 审计基线:`fx100-apps@develop` @ `61ec1f41`(2026-08-14 四路并行源码深读,全部锚点已抽查核实)。锚点为 file:line,行号随代码演进会漂移,以组件与变量名为准。
> 背景:SCN-022(PnL 与 Est. Receive)等用例的链上核对已闭环(72 项),缺的是**前端显示口径**的核对层。方案 = 链驱动制备状态 + Playwright UI 观测采集 + 三方核对(UI 显示值 vs 链上真值 vs 独立重算),见本文档末尾分阶段计划。

---

## 一、现状盘点(审计事实)

| 事实 | 详情 | 影响 |
|---|---|---|
| 生产组件数值字段 **testid 为零** | 全仓 29 处 `data-testid`:26 处在 dev harness(`testing/` 三文件),生产组件仅 3 处(`slippage-toggle`、`flash-setup-prompt`、`flash-switch-oneclick`)。PnL/Est.Receive/Fee/价格等展示节点一个都没有 | 契约从零建立,无历史包袱 |
| i18n 四语言 | 自研 `useTranslation` + `src/locales/{en,zh,ja,ko}.ts`,文案随语言设置漂移 | **按文案定位不可行**,必须 testid |
| 前端已有 E2E 基建 | `e2e/` 目录 + `playwright.config.ts`(baseURL localhost:3010、自动 `yarn dev`);**`e2e/fixtures/mock-wallet.ts` 已实现 EIP-1193 注入**(可配 address/chainId);另有 mock-rpc / mock-api / real-wallet / signer.mjs | 钱包注入不用从零写,TestCode 侧可移植或复用 |
| dev harness 三页面 | `/dev/order-form`、`/dev/order-tracking`、`/dev/orders`(生产构建 404):jotai atom 种子化 + 渲染**真实生产组件** | 弹窗类 UI 断言可脱链先行;但 harness testid 只覆盖控制面,被测组件内部仍需本契约的 testid |
| fork 链 ID 硬编码 | `src/config/chainId.ts:6`:`BASE_SEPOLIA_FORK = 99917`、`BASE_FORK = 99918`(99917 是历史 fork 的链 ID) | 我们的 tx-fork 是 **99911**,前端现状不认;见需求 C |
| 命名风格已有惯例 | kebab-case 小写;参数化 `类别-值`(`scenario-${key}`);动作 `动词-宾语`(`open-close-dialog`);容器 `-harness` 结尾 | 新契约沿用同一风格 |

---

## 二、需求 A:testid 契约清单

### 通用规则

1. **testid 打在"值节点"上**(渲染最终字符串的 `<span>`/`<div>`),不打在行容器上;需要行定位的另给容器 id。
2. 桌面表格与移动卡片是**同一字段的两套渲染**(响应式互斥显示),打**同一个 testid**;采集方自行 `.filter({ visible: true })`。
3. 值节点同时挂 `data-raw`(见需求 B)。
4. 行级容器带上下文数据属性(`data-market`、`data-side`),采集不依赖渲染顺序。

### 采集面 1:持仓列表(`src/components/features/trade/order/Positions.tsx`)

行容器:`data-testid="position-row"` + `data-market="{marketIndex}"` + `data-side="long|short"`(桌面 tr 与移动卡片根各一)。

| testid | 字段 | 桌面锚点 | 移动锚点 | 值来源(口径见附录一) |
|---|---|---|---|---|
| `pos-pnl` | 未实现 PnL(USD) | :1658-1663 | :1322-1329 | `data.unrealizedPnlUsdRaw`(列表 Oracle 中间价重算口径) |
| `pos-pnl-percent` | PnL 百分比 | :1670-1671 | :1336-1337 | `data.unrealizedPnlPercentBpsRaw` |
| `pos-net-value` | Net Value | :1696-1701 | :1385-1387 | `netValueUsdRaw` = Margin + uPnL − 平仓费 |
| `pos-margin` | Margin | :1689-1695 | :1372-1374 | `marginUsdRaw` = collateralUsd + 净资金费 |
| `pos-entry-price` | Entry Price | :1652-1654 | :1296-1298 | `sizeInUsd/sizeInTokens` 派生 |
| `pos-oracle-price` | Oracle 当前价 | :1655-1657(组件 413-423) | :1302-1304 | tickers 中间价(非 markPrice) |
| `pos-liq-price` | Est. Liq. Price | :1674-1688 | :1353-1361 | `posInfo.liquidationPrice`(×visualMultiplier) |
| `pos-leverage` | 杠杆徽章 | :1604-1612 | :1255-1263 | `sizeInUsd×10⁴/marginUsd`,回退 SDK leverage |
| `pos-size` | Size(token 量) | :1635-1648 | :1279-1286 | `posInfo.sizeInTokens` |
| `pos-value` | Value(live USD) | :1649-1651 | :1290-1292 | `sizeInTokens×markPrice`(≠链上 sizeInUsd) |

另:可清算时价格被 `LiquidatableBadge` 替换(桌面 :1676、移动 :1354)——badge 请挂 `data-testid="pos-liquidatable-badge"`,采集方先探测此节点再决定取值。

### 采集面 2:平仓弹窗(`src/components/features/trade/ClosePositionDialog.tsx`)

| testid | 字段 | 锚点 | 值来源 |
|---|---|---|---|
| `close-est-receive` | Est. Receive | :797-806(值 span :801-805) | `receivePreview` ← `liveClosePreview.receiveTokenAmount`/`receiveUsd`(含 pending funding/borrowing,见附录一) |
| `close-fee` | Fee(平仓费,含费率) | :784-792(值 :790) | `liveClosePreview.positionFeeUsd` ← SDK `getDecreasePositionAmounts` |
| `close-est-pnl` | Est. P&L | :694-704(值 :697-702) | `closePnlPreview` = closedTokens×(执行价−开仓价),预览口径 |
| `close-exec-price` | Est. execution price | :684-693(值 :690-692) | `effectiveClosePreviewData.executionPrice`(oracle±动态点差,不含滑点) |
| `close-acceptable-price` | Max/Min acceptable | :771-782(值 :778-780) | `liveClosePreview.finalAcceptablePrice`(执行价±slippageBps) |
| `close-size-input` | Close Size 输入框 | :591-680(AmountInput :607-618) | 本地 state(25/50/75/Max 按钮请一并挂 `close-pct-25/50/75/max`) |
| `close-confirm` | Confirm 按钮 | :818-835 | — |

已有:`slippage-toggle`(:755)保持不动。

### 采集面 3:保证金弹窗(`src/components/features/trade/_position/PositionMarginDialog.tsx`)

| testid | 字段 | 锚点 | 值来源 |
|---|---|---|---|
| `margin-current` | Current Margin | :644-647(值 :646) | `currentMarginUsdRaw`(collateral+净资金费) |
| `margin-funding-net` | Pending funding (net) | :648-659(值 :657) | `getPositionNetFundingUsd` |
| `margin-equity` | Equity (after PnL & funding) | :662-676(值 :674) | `displayEquityRawUsd`(显示口径,与列表 Net Value 同源) |
| `margin-new` | New Margin | :677-684(值 :682) | `newMarginUsdRaw`(OC-15:已扣 pending 结算费) |
| `margin-current-leverage` | Current Leverage | :685-690(值 :688) | `getPositionDisplayLeverage` |
| `margin-new-leverage` | New Leverage | :691-704(值 :700-702) | `newLeverageBps` |
| `margin-est-liq` | Est. Liq. Price 预览 | :705-710(渲染 `LiqPriceRow.tsx:37-50`) | `sdkEstimatedLiqRaw`(OC-15:pending 费真值传入) |
| `margin-min-deposit-hint` | 最低补充量提示 | :620-622(amountError :612-614) | `getMinDepositUsdToEscapeLiquidation`(OC-17:0.5% 清算线 + 10% headroom) |
| `margin-withdraw-max` | 可取额按钮 | :562-579(值 :571) | `withdrawMaxRaw` = equity − 1% action 线 |
| `margin-deposit-max` | 可存额(余额)按钮 | :551-561(值 :559) | `walletBalanceValue` / `depositMaxRaw` |

---

## 三、需求 B:`data-raw` 外显规范

**目的**:显示值经 `formatNumber(x,2)` 等丢精度,核对只能做"显示级"(±最后一位);把格式化前的原始值同步外显,核对可升到接近 bit 级,且能区分"取数错"与"格式化错"(OC-15/16/17 全是取数口径错,此层直接定位)。

**契约**:值节点同时输出两个属性——

```html
<span data-testid="pos-pnl"
      data-raw="12.345678901234567890123456789012"
      data-raw-scale="usd">+$12.35</span>
```

- `data-raw`:**全精度十进制字符串**,统一为 `formatUnits(bigint, decimals)` 的输出(无损、可 `parseUnits` 还原)。禁止经过任何显示格式化(不去尾零、不加千分位、不截断)。
- `data-raw-scale`:值域标注,枚举:`usd`(1e30 formatUnits 后)/ `token`(collateral/index 原生位)/ `price`(1e30)/ `bps` / `pct`。
- 原始值可得性(审计结论):
  - 持仓表行作用域已有 bigint(`unrealizedPnlUsdRaw`、`netValueUsdRaw`、`marginUsdRaw`、`posInfo.*`),直接 `formatUnits` 外显;
  - 平仓弹窗的预览值是 `getOrderPreview` 统一 `formatUnits(x,30)` 后的十进制字符串,**本身就是全精度**,原样进 `data-raw` 即可;bigint 级(`decreaseAmounts.*`)在 hook 作用域,如需外显请在 `getOrderPreview` 返回体附带(可选增强,不阻塞);
  - 保证金弹窗作用域已有 `*Raw` bigint 变量,同持仓表处理。
- 找不到原始值的字段(如 Oracle 价单元格是 number):`data-raw` 给当前最高精度值并如实标注,不造假精度。

---

## 四、需求 C:fork 链 ID env 化

`src/config/chainId.ts:6-7` 将 fork 链 ID 硬编码为 `99917/99918`(历史 fork 的值)。测试工作区的 fork 链 ID 是**固定编号约定**(tx-fork=99911、oracle-fork=99912、time-fork=99913,登记于 `TestCode/config/mock-resources.json`),会随环境长期存在多条。

**需求**:比照 RPC 已有的 env 化方式(`NEXT_PUBLIC_BASE_FORK_RPC_URL`),链 ID 改为:

```ts
export const BASE_SEPOLIA_FORK = Number(process.env.NEXT_PUBLIC_BASE_SEPOLIA_FORK_CHAIN_ID ?? 99917);
export const BASE_FORK = Number(process.env.NEXT_PUBLIC_BASE_FORK_CHAIN_ID ?? 99918);
```

默认值不变,存量环境零影响。另注意 `CloseOrderTrackingHarness.tsx:455` 的 `chainId={99917}` 是 harness 自造值,与环境无关,不必改。

---

## 五、命名规范(沿用仓库既有风格)

- kebab-case 小写,无页面前缀;
- 值节点:`{区域}-{字段}`(`pos-` / `close-` / `margin-` 三个区域前缀,如上清单);
- 动作元素:`动词-宾语`(`close-confirm`、`close-pct-max`);
- 行容器/上下文:`data-testid` 定位 + `data-market`/`data-side` 携带业务上下文;
- **testid 是契约**:改名/删除需同步测试方(TestCode 维护同名防腐层 `TestCode/src/ui/selectors.ts`,前端变更提 PR 时 @ 测试);新增显示字段默认带 testid + data-raw。

## 六、验收标准

1. 上述三个采集面每个 testid 可被 `page.getByTestId()` 命中,且命中的是**值节点**;
2. 切换语言(en/zh/ja/ko)后 testid 与 data-raw 不变;
3. `data-raw` 与显示值同帧渲染(同一次 React commit),不允许显示值已更新而 raw 滞后;
4. `parseUnits(data-raw)` 与显示值的关系满足:显示值 = 对 raw 应用现行格式化规则的结果(抽 3 个字段自动验证);
5. 生产构建产物中 testid 保留(现有 3 个生产 testid 已是先例,无 babel 剥离配置)。

---

## 附录一:显示口径速查(核对方必读,全部为审计确认的实现现状)

| 显示值 | 实际口径 | 核对陷阱 |
|---|---|---|
| 列表 PnL | `calculatePositionPnlUsdRaw(sizeInTokens, sizeInUsd, 列表 tickers 中间价)`,oracle 缺失才回退 SDK `position.pnl` | **不是 markPrice 口径**;与 SDK/合约 mark 价核对必有偏差,期望值要用同一 tickers 价源 |
| Entry Price | `sizeInUsd/sizeInTokens` 派生(`state/derived/positions.ts:49-54`,注释:fork 精度问题不用 SDK entryPrice) | 与 SDK `entryPrice` 字段可能不同 |
| Margin 列 | `collateralUsd + (应收funding − 应付funding)` | ≠ 纯链上抵押;纯抵押在 tooltip(`posInfo.collateralUsd`) |
| Net Value 列 / 弹窗 Equity(显示) | `Margin + 列表口径 uPnL − 平仓费` | 与 SDK `posInfo.netValue` **不是同一个数**(后者含 uiFee/price impact/markPrice PnL,仅用于清算判定与 gate) |
| Est. Receive | `estimateFx100ReceiveUsd`:含 pendingBorrowing/pendingFunding/负向 pending impact;优先 `receiveTokenAmount`(按 receiveToken minPrice 折) | 期望值必须计入 pending 费三件套;弹窗**没有**独立 Pending Fees 行 |
| Est. P&L(平仓弹窗) | closedTokens×(执行价−开仓价),执行价含动态点差不含滑点 | 与合约事件 realized PnL(keeper 实际 oracle 价)口径不同,只能做预览级核对 |
| Est. execution price | `getOrderPreview` 内与 acceptablePrice 同值别名;`finalAcceptablePrice` = 执行价±slippageBps 才是链上界 | 断言实发参数时用 finalAcceptablePrice 链路 |
| Full Close | Max 按钮 → `sizeInUsdExact/sizeInTokensExact` 精确串提交 | 期望 sizeDelta = 链上 `position.sizeInUsd` 原值,非显示截断值 |
| keepLeverage | 弹窗链路硬编码 `true`(`ClosePositionDialog.tsx:477`) | 部分平仓必按比例撤保证金(soso LB-6 定性的根因),非链上字段 |
| New Margin(存取预览) | 已扣 `max(0, 应付funding+borrowing)`(OC-15 修复态) | 正向 funding 不在扣项里 |
| withdraw/deposit 换算 | withdrawMax 用 minPrice 折 token、depositMax 用 midPrice、输入折 USD 用 minPrice、救援量按 minPrice 向上取整 | 复算期望值时价源与取整方向逐项对齐 |
| 所有价格显示 | ×`visualMultiplier` 缩放 | 复算后先乘再比 |
| 数据新鲜度 | `usePositionsDataSync` staleTime 4s / refetch 8s + `holdLastGoodSnapshots` 兜底 | 断言可能读到一拍旧数据;停点静止设计消掉此风险,degenerate 快照兜底仍需注意 |

## 附录二:环境接线与现成资产

**本地起前端接 tx-fork**(自动化采集的运行形态;Vercel dev 部署链配置构建期烙死,只作人工手测入口):

```bash
# fx100-apps/apps/fx-base-app/.env(在需求 C 落地后)
NEXT_PUBLIC_BASE_SEPOLIA_FORK_CHAIN_ID=99911
NEXT_PUBLIC_BASE_SEPOLIA_FORK_RPC_URL=<tx-fork RPC>
RELAY_KEEPER_RPC_URL=<tx-fork RPC>
# soso V030_FORK_ENV.md 的两条测前必查:启动日志确认本地 Redis(防与真实测试网 keeper 共享队列);
# tickers API 实测返回 fork mock 价(ab143033 修复已在 develop,仍要验证生效)
```

**可复用资产**:

- `e2e/fixtures/mock-wallet.ts`:EIP-1193 注入(address/chainId 可配)——TestCode Phase 1 直接移植;
- `/dev/order-tracking` harness(`open-margin-dialog` 等 testid):弹窗类断言可脱链先验;
- soso fork 走查:`fx100-contracts@soso-test/docs/testing/V030_FORK_ENV.md`、`LIQ_BOUNDARY_FRONTEND_TEST.md`(三层核对法与执行纪律)。

## 附录三:分阶段计划(整体方案定位)

| 阶段 | 交付物 | 依赖 |
|---|---|---|
| **Phase 0(本文档)** | testid 清单 + 命名规范 + data-raw 说明 + fork chainId env 化需求 → 提给前端排期 | — |
| Phase 1 | 本地前端接 tx-fork 验证(tickers 返回 fork 价)→ mock-wallet 注入连接 → SCN-022 平仓停点采 Est.Receive / Close Fee / PnL 三值跑通三方核对 | testid 未落地前用防腐层(`TestCode/src/ui/selectors.ts`)按 i18n 文案顶替 |
| Phase 2 | 采集器通用化 + 看板 ui-display 核对模块(口径标注"显示级"/"raw 级")+ webServer 纳入跑批 | Phase 1 |
| Phase 3 | 字段清单扩到其他 SCN(保证金弹窗、Est.Liq、funding 显示;soso OC-15/16/17 与 LB-15 即高危字段优先级) | Phase 2 |

---

## 附录四:Phase 1 结论(2026-08-19)

> 目标"链驱动制备状态 + Playwright UI 观测采集 + 三方核对"已在 SCN-022 上跑通并进看板:`artifacts/latest` 的 SCN-022(tx-fork,private-key 全签名 PASS)含 **前端显示 · 平仓弹窗预览(Max 全平)** 分组 4×2 行 + 持仓行原文 2 行,`dataSource=前端`,看板 `dashboard:verify` PASSED。

### 1. 三方核对结果(双数据集,两次独立运行一致)

| 字段(UI 显示 vs 链上事实) | 多头 +10% | 空头 −10% | 结论 |
|---|---|---|---|
| Est. execution price vs `PositionDecrease.executionPrice` | $2,648.69 vs 2,648.69 | $2,178.66 vs 2,178.6639 | 显示级一致 |
| Est. P&L vs `PositionDecrease.basePnlUsd` | +$4.69 vs 4.6943 | +$4.76 vs 4.7601 | 显示级一致 |
| Fee vs `positionFeeAmount × collateralTokenPrice.min` | −$0.02 vs 0.0250(0.05% 档) | −$0.01 vs 0.0100(0.02% 改善档) | 容差内;多头 0.025 落在四舍五入边界(前端显示 0.02),data-raw 落地后可判定取整方向 |
| **Est. Receive vs 全平实收 USDC(ΔTrader@executeClose)** | 14.66 vs **14.654586** | 14.73 vs **14.720303** | **UI-DEVIATION**:预览系统性偏高 0.005–0.010 USDC(0.04–0.07%),两次运行稳定复现;候选原因见行内 note(预览到执行的 funding/borrowing 累计、receiveTokenAmount 折算价基、瀑布口径),需 data-raw 逐位定位 → 建议记为前端待查项 |

分层原则(docs/06 §8):UI 行只产 PASS / CALCULATED / NOT_VERIFIED,超显示级容差记 CALCULATED + note `UI-DEVIATION`,不拉低协议 executionStatus。容差 = 显示位数的半个最小单位(2 位 → ±0.005),内部 1e6 定点无浮点。实现:`TestCode/src/reporting/ui-display-evidence.ts`,由 `execution-evidence.ts` `deriveMarketFlowSingle` 挂入(读 `evidence.uiDisplay`)。

### 2. 审计外新发现的前端缺陷(需求 D/E/F,建议一并提给前端)

- **需求 D · 市场表可配置/动态发现**:develop 在 84532 槽位只用静态市场表(`config/markets.ts`、`constants/markets.ts`、SDK `configs/tokens.ts`),fork 上新建的市场不可见。测试侧过渡:`TestCode/scripts/frontend-fork-patch.ts apply|revert|status`(读 `mock-resources.json` 生成哨兵包裹的三处条目,可逆)。
- **需求 E · split 数据源地址大小写不一致(真实缺陷)**:`useMarketsBase` 把市场地址小写,`useMarketsValues` 资格判断与 SDK `getContractMarketPrices` 用**小写**直接索引 `tokensData`,而 `tokensData` 键 = `/api/tokens` 原样地址(USDC 为 checksum)→ 该市场 collateral 永远"无价"→ 市场被丢("Market Unavailable")。建议统一小写化(`getTokensData` 键或 `/api/tokens` 输出),或所有查找改 `resolveTokenByAddress`。测试侧过渡:补丁把 SDK `TOKENS[BASE_SEPOLIA]` USDC 地址一并小写(行尾哨兵)。
- **需求 F · 账户持有未列市场仓位 → 持仓列表整体消失(真实缺陷)**:SDK `getPositions` 用 `Reader.getAccountPositionInfoList` 且只传 `marketsInfoData` 里的市场价格;Reader 遍历账户**全部**仓位,缺任一市场价格即 revert `EmptyMarketPrice(uint256)`,前端吞错后显示 "Positions (0)"。共享 trader `0xEEeA…` 在市场 11/15/23 有 8/5–8/7 遗留仓位即触发。建议前端按市场分批调用或先 `getAccountPositions` 过滤。测试侧过渡:专用零历史 trader(见 §3)。

### 3. 运行手册(UI 观测)

前置(一次性):`Github/fx100-apps@develop/apps/fx-base-app/.env.local`(附录二 recipe)、`npx tsx scripts/frontend-fork-patch.ts apply`、`.env.local` 增 `E2E_UI_TEST_ACCOUNT/E2E_UI_TEST_PRIVATE_KEY`(仅 fork 用的独立密钥,不入库)、`E2E_ENV=tx-fork E2E_ENV_PRIORITY_KEYS=E2E_ENV npx tsx scripts/prepare-ui-trader.ts`(注 10 ETH / 10,000 USDC + Router 授权)。

启动前端:工作区 `.claude/launch.json` → `fx100-frontend-local`(等价 `cd Github/fx100-apps@develop && yarn workspace fx-base-app dev`,:3010)。目录改名后若 /trade 空白反复刷新,删 `apps/fx-base-app/.next` 重启。

跑用例(密钥留在 .env.local,命令行只传 profile):
```bash
E2E_ENV=tx-fork E2E_TRADER_PROFILE=ui E2E_UI_COLLECT=true UI_APP_BASE_URL=http://localhost:3010 \
E2E_ENV_PRIORITY_KEYS=E2E_ENV,E2E_TRADER_PROFILE npx playwright test tests/S03/scn-022.spec.ts --project=tx-fork
```
调试/冒烟:`scripts/ui-fork-smoke.ts`(接线冒烟:换网遮罩/tickers 逐字节/头部价/市场水合/钱包)、`scripts/scn-009-ui-close-dialog.ts`(单流停点采三值)、`scripts/scn-009-ui-1d-reader-probe.ts`(Reader 直读定位)、`scripts/market-hydration-diagnose.ts`。

### 4. 本阶段顺手修复的 TestCode 问题

- `runtime.ts` 以 `override:true` 加载 `.env.local`,其 `E2E_ENV` 会覆盖跑批注入的批次环境(2026-08-14 实例:标 tx-fork 的 SCN-022 证据 chainId=99912)→ 新增 `E2E_ENV_PRIORITY_KEYS`,`run-batches.ts` 按批次注入;SCN-022 spec 增加 `runtime.environment === project` 断言。
- runner impersonation 模式必挂的"四笔非零签名"断言 → 按签名模式给期望形态(私钥 4 签 / impersonation 用户免签 Keeper 真签)。注意证据准入仍要求全签名才 PASS,UI 观测用 `E2E_TRADER_PROFILE=ui` 走 private-key。
- runner 新增 `beforeClose` 停点钩子与 `evidence.uiDisplay`;矩阵透传 `datasetId`。
- `tsx` keepNames 会给函数包 `__name` 助手,`addInitScript(fn)` 注入页面后静默失败 → 注入一律用源码字符串(`src/ui/mock-wallet.ts`)。
- Playwright `hasText` 用 textContent(单元格无分隔拼接),`\b` 词边界失效 → 行定位用子串。

### 5. 已知限制 / Phase 2 入口

- 前端 ETH/BTC(市场 1/2)在 fork 上的 provider 是 datastream 类,view 需 report 数据 → 只喂 mock 市场与 USDC 价,ETH/BTC 市场在本地前端不可见(不影响 SCN 采集)。
- 前端 `positionRowFields` 全部 `not found`(生产持仓表 testid 为零),持仓行仅留 innerText 原文;需求 A/B 落地后 `selectors.ts` 直接切换、脚本零改动。
- Est. Receive 偏差与 Fee 取整方向需要 data-raw(需求 B)才能从"显示级"升到"raw 级"定位。
- Phase 2:采集器泛化到其他 SCN(挂 `beforeClose` 即可)、看板给"前端"分组独立汇总徽章、`playwright.config.ts` webServer 纳入跑批。

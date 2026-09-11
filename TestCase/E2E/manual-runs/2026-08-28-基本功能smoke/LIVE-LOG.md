# 实时观察日志（live-observer agent 维护）

> 来源：只读轮询测试人员 Chrome 的 fx100 标签页（约每 20-30 秒一拍），记录可见页面数据变化与网络请求证据。
> 局限：轮询间隙的瞬时状态可能漏拍；底部列表只能看到执行人当前停留的页签；Rabby 弹窗不可见。
> 汇总合并入 [OPERATION-LOG.md](OPERATION-LOG.md) 时以本文件为原始底稿。

---

## 16:04 前后 · 表单输入快照（记录员手拍，observer 启动前）

- 输入：0.01 BTC / 100x / Buy Long（BTC 计价档），oracle 79,707.46，余额 98,217.06，无持仓无挂单。
- 预览：Position size $796.75｜Collateral $7.97｜Est. exec $79,822.63｜Est. Liq $79,464.91（−0.45%）｜Impact 0.1398%｜Max slippage 0.5%｜Max acceptable $80,221.75｜Fee −$0.4｜Pay amount 8.37 USDC。
- 复算：抵押=796.75/100 ✓；费=796.75×0.05%=0.398 ✓；Pay=7.97+0.40 ✓；可接受价=exec×1.005 ✓ 精确；Liq 与 −0.45% 公式差 $1.5（二阶项待执行定）。
- ⚠️ 观察-URL：地址栏 `?market=SUIUSDC` 而页面为 BTC/USD——某条市场切换路径不更新 URL（选择器路径已验证会更新），刷新将错跳 SUI，缺陷候选待复现。
- ⚠️ 观察-中继费：英文界面 Trade Details 无 Relay fee 行（早前中文界面有 ~$0.15 估算行），差异原因待查（语言/连接态/已移除）。

## 16:03:06 实测 · 开仓成交：0.01 BTC 100x 多单开仓，保护倒计时启动
- 可用余额：98,217.06 → 98,208.69 USDC（Δ = -8.37）
- Positions：0 → 1；Open Orders：0 → 0
- 保护面板：未激活（15:00 静止）→ "You are protected"，倒计时 14:37（首拍读数，推算开仓发生在约 23 秒前）
- 持仓行全字段（首拍）：
  - Coin: BTC ｜ 杠杆徽标: 100.19x ｜ Direction: Long ｜ Size: 0.01 BTC ｜ Value: $797
  - Entry: 79,814.64 ｜ Oracle: 79,719.61 ｜ PnL: -$0.95 (-11.92%)
  - Est.Liq: $79,457.01（行内）；倒计时 14:37 ｜ Margin: 7.97 USDC ｜ Net Value: 6.62 USDC ｜ Funding: -<$0.01
- 表单/预览（成交后）：仍为 0.01 BTC / 100x / Buy Long；Pay 8.37 USDC；Position size $797.06；Collateral $7.97；Est.exec $79,835.55；Est.Liq $79,477.58 (-0.45%)；Price Impact 0.1398%；Max acceptable $80,234.72；Fee(0.05%) -$0.4
- 核对推导：
  - 开仓规模（按 Entry）= 79,814.64 × 0.01 = $798.15
  - 开仓费 = 798.15 × 0.05% = $0.399 ≈ $0.40 ✓（与预览 Fee -$0.4 吻合）
  - 抵押 = 798.15 / 100.19 ≈ $7.97 ✓（= 行内 Margin）
  - 余额Δ = -8.37 = 抵押 7.97 + 开仓费 0.40 ✓ 吻合费用模型
  - PnL = (79,719.61 − 79,814.64) × 0.01 × (+1) = -$0.95 ✓；PnL% = -0.95/7.97 = -11.92% ✓
  - 净值 = Margin 7.97 + PnL(-0.95) − 0.40 = 6.62 ✓（差额 0.40 与平仓费 0.05% 预扣一致）
- 对应用例：E2E-PROT-006（100x 开仓 + 15 分钟清算保护）

## 16:03:55 实测 · 新市价单提交（$10,000 Open Long，Pending）+ 底部页签切至 Open Orders
- 可用余额：98,208.69 → 98,103.67 USDC（Δ = -105.02）
- Open Orders：0 → 1；Positions 仍 (1)
- 新挂单行：2026-08-28 16:03:04 ｜ Market ｜ BTC ｜ Open Long ｜ Size $10,000 ｜ Token Size 0.125466 BTC ｜ Trigger - ｜ Reduce Only: No ｜ Status: Pending
- 表单变化：输入模式 BTC → USD；Pay amount 8.37 → 105 USDC；"Switch to One-Click" 入口消失且预览新增 Relay fee (est.) ~$0.0446（疑似已切至 One-Click 模式）
- 预览：Position size $10,000 ｜ Collateral $100 ｜ Est.exec $79,928.53 ｜ Est.Liq $79,568.86 (-0.45%) ｜ Price Impact 0.1404% ｜ Max acceptable $80,328.18 ｜ Fee(0.05%) -$5
- 保护面板：倒计时 14:37 → 13:40；PnL -$0.95 → +$0.01 (+0.06%)（Oracle 79,815.17 vs Entry 79,814.64，(79,815.17−79,814.64)×0.01=+$0.005 ≈ +$0.01 ✓）
- 核对推导（挂单冻结）：
  - 预期扣款 = Collateral 100 + Fee 5 = $105.00；实际余额Δ = -105.02
  - 待核对：差额 $0.02（非 Relay fee 估值 0.0446，可能为执行费预留/取整，待订单执行后回看）
- 网络请求：本拍仅捕获 Goldsky subgraph OPTIONS 204，未捕获 eth_sendRawTransaction（提交发生在捕获窗口外）

## 16:04:48 实测 · 挂单执行成交并并入持仓（0.01 → 0.135087 BTC），倒计时未重置
- Open Orders：1 → 0（16:03:04 的 $10,000 Market Open Long 已执行）；Positions 仍 (1)（并单）
- 可用余额：98,103.67 → 98,103.67（不变，✓ 资金在挂单时已冻结扣除）
- 持仓行变化（前 → 后）：
  - 杠杆徽标：100.19x → 100.03x ｜ Size：0.01 → 0.135087 BTC ｜ Value：$797 → $10,783.64
  - Entry：79,814.64 → 79,934.46 ｜ Oracle：79,811.13 ｜ PnL：+$0.01 → -$16.66 (-15.43%)
  - Est.Liq：$79,457.01 → $79,575.02 ｜ Margin：7.97 → 107.95 USDC ｜ Net Value：6.62 → 85.89 USDC ｜ Funding：-<$0.01 → -$0.0181
- 保护倒计时：13:40 → 12:55，**加仓未重置倒计时**（仍按初次开仓计时，与 "No liquidation for 15 mins after initial open" 文案一致——E2E-PROT-006 关键观察点）
- 表单：已清空（Enter Amount，预览空）；底部页签切回 Positions
- 核对推导：
  - 增量 = 0.135087 − 0.01 = 0.125087 BTC；增量名义 = Entry 混合反推 ≈ $10,000.0 ✓（执行价 ≈ 10,000/0.125087 = $79,944.4，劣于预估 79,928.53 但在 0.5% 滑点内 ✓）
  - Entry 加权：(0.01×79,814.64 + 0.125087×79,944.4)/0.135087 ≈ 79,934.5 ✓（= 行内 79,934.46）
  - PnL = (79,811.13 − 79,934.46) × 0.135087 = -$16.66 ✓；PnL% = -16.66/107.95 = -15.43% ✓
  - Margin 预期 = 7.97 + 100 = 107.97，实际 107.95；**待核对：差额 $0.02**（与上一拍余额多扣 $0.02 同源，疑为执行费/取整，待平仓结算回看）
  - Net Value = 107.95 − 16.66 − 平仓费(10,783.64×0.05%=5.39) − Funding 0.0181 ≈ 85.88~85.90，行内 85.89 ✓

## 16:05:31 实测 · 价格回落 PnL 走扩至 -20.71%；发现 Funding 实时从 Margin 扣减
- Oracle：79,811.13 → 79,768.92；PnL：-$16.66 (-15.43%) → -$22.36 (-20.71%)
- Margin：107.95 → 107.92 USDC；Funding：-$0.0181 → -$0.0451（Funding 增加 ≈0.027，Margin 减少 ≈0.03，方向与量级吻合 → **Funding 直接侵蚀 Margin 实时显示**）
- Net Value：85.89 → 80.16；Est.Liq：79,575.02 → 79,575.22（随 margin 侵蚀微升）
- 倒计时：12:55 → 12:03（连续递减正常）
- 核对：PnL = (79,768.92 − 79,934.46) × 0.135087 = -$22.36 ✓；-22.36/107.92 = -20.72% ≈ 行内 -20.71% ✓
- 备注：当前浮亏已超保证金 20%，若无 15 分钟保护该仓位接近清算区（Est.Liq 79,575 vs Oracle 79,769，距离 0.24%）——持续盯倒计时归零瞬间的处置

## 16:09:49 实测 · 漂移快照：价格回升 PnL 收窄至 -15.70%，倒计时过半
- Oracle：79,768.92 → 79,808.96（期间低点 ≈79,733.89，PnL 最深 -25.09%）
- PnL：-$22.36 (-20.71%) → -$16.95 (-15.70%)；Net Value：80.16 → 85.5 USDC
- Margin：107.92 → 107.85（Funding 累计 -$0.1098，持续侵蚀）；Est.Liq 缓升至 $79,575.7
- 保护倒计时：12:02 → 07:39；期间无任何交易操作（余额/计数均不变，表单保持空）

## 16:12:49 实测 · 切换至 ETH/USD 市场并备好新开仓表单（未提交）
- 市场面板：BTC/USD → ETH/USD（Oracle 2,498.99；OI 56%/44% $46.19M/$36.50M；Funding/h +0.0035%/-0.0022%）
- 表单：USD 模式输入，Position size $1,000 ｜ Pay amount 10.50 USDC ｜ 100x ｜ Buy/Long（含 Relay fee 预览 → One-Click 模式）
- 预览：Collateral $10 ｜ Est.exec $2,500.24 ｜ Est.Liq $2,488.99 (-0.45%) ｜ Price Impact 0.0433% ｜ Max acceptable $2,512.74 ｜ Fee(0.05%) -$0.5 ｜ Relay fee ~$0.0270
- 预览核对：Pay 10.50 = Collateral 10 + Fee 0.5 ✓；余额未变（98,103.67）、Open Orders(0) → **尚未提交**
- BTC 持仓不变：PnL -$20.10 (-18.61%)，倒计时 04:39，Margin 107.81，Funding -$0.1532
- 网络：仅常规轮询（tickers/open-interest/markets info/candles + Tenderly RPC 读 POST），无交易提交请求

## 16:13:25 实测 · ETH $20,000 市价开多已提交（Pending），金额从 $1,000 加码到 $20,000
- 表单变化：Position size $1,000/Pay 10.50 → **$20,000/Pay 210 USDC**（Collateral $200 ｜ Fee(0.05%) -$10 ｜ Est.exec $2,500.18 ｜ Est.Liq $2,488.93 ｜ Price Impact 0.0457% ｜ Max acceptable $2,512.68 ｜ Relay fee ~$0.0270）
- 可用余额：98,103.67 → 97,893.66 USDC（Δ = -210.01）
- Open Orders：0 → 1（订单行详情在 Positions 页签下未展开，待下拍确认执行）
- 核对推导：预期扣款 = Collateral 200 + Fee 10 = $210.00；实际 -210.01；**待核对：差额 $0.01**（与 BTC 单 $0.02 差额同模式，疑似执行费预留/取整）
- BTC 持仓：PnL -$21.55 (-19.95%)，倒计时 04:03，Margin 107.79，Funding -$0.1734（继续侵蚀）

## 16:14:53 实测 · ETH 挂单执行成交，第二个持仓出现（Positions 1→2），双仓各自独立倒计时
- 上一拍曾出现 Open Orders 1→0 但 Positions 仍(1) 的中间态（列表刷新滞后约一拍），本拍确认为**已执行**
- 可用余额：97,893.66（不变 ✓ 冻结资金转为保证金）
- ETH 持仓行（首拍全字段）：
  - Coin: ETH ｜ 杠杆徽标: 100x ｜ Direction: Long ｜ Size: 8.0022 ETH ｜ Value: $19,995.98
  - Entry: 2,499.3 ｜ Oracle: 2,497.58 ｜ PnL: -$13.76 (-6.88%)
  - Est.Liq: $2,488.05 ｜ 倒计时 14:39（独立于 BTC 仓的 02:41 → **保护计时按持仓维度独立**）
  - Margin: 200 USDC ｜ Net Value: 176.23 USDC ｜ Funding: -<$0.01
- 核对推导：
  - 成交价 = 20,000/8.0022 ≈ 2,499.31 ✓（= Entry 2,499.3，优于 Max acceptable 2,511.54，滑点内）
  - Margin = 200 与 Collateral 分毫不差（对比 BTC 仓差 $0.02——两仓模式不一致，BTC 的 $0.02 差额更可疑）
  - PnL = (2,497.58 − 2,499.3) × 8.0022 = -$13.76 ✓；-13.76/200 = -6.88% ✓
  - Net Value = 200 − 13.76 − 平仓费(19,995.98×0.05%=10.00) = 176.24 ≈ 176.23 ✓
- BTC 持仓：PnL -$25.35 (-23.47%)，倒计时 **02:41（即将归零，重点盯保护到期后的清算行为）**，Margin 107.78

## 16:17:36 实测 · BTC 15 分钟清算保护到期（倒计时归零 → 行内显示 "Expired"），未触发清算
- BTC 持仓行倒计时：00:18 → **Expired**；持仓仍在（Positions 仍 2，未清算）
- 到期瞬间状态：Oracle 79,799.55 > Est.Liq $79,576.66（距离 +0.28%）→ 不满足清算条件，符合预期
- 到期后该仓恢复常规清算规则（Est.Liq 继续显示 $79,576.66）；期间浮亏最深曾达 -25.09%（Oracle 低点 79,733.89 仍高于清算价，故保护期内即使无保护也未必触发——本轮未构成保护拦截清算的正例证据）
- BTC：PnL -$18.22 (-16.88%)，Margin 107.72，Funding -$0.2402
- ETH：PnL +$5.17 (+2.58%)，倒计时 11:51 独立运行，Margin 199.96
- 保护面板（左侧）此时仅展示 ETH 仓（"You are protected 11:50"），BTC 已不在保护面板中
- E2E-PROT-006 关键证据链：开仓即启动 15:00 → 加仓不重置 → 到期转 Expired → 未清算（价格未触线）

## 16:29:44 实测 · ETH 15 分钟保护到期（第二仓），保护面板转为 "Close & Reopen" 引导
- ETH 持仓行倒计时：00:04 → **Expired**（自 ETH 开仓起满 15 分钟，全程独立计时）；持仓未清算（Oracle 2,498.22 > Est.Liq 2,488.07，距离 +0.41%）
- 保护面板文案变化："You are protected" → **"You are exposed to liquidation. Reopen to get protection back. 00:00"**，出现 **Close & Reopen** 按钮 + Relay fee (est.) ~$0.0540（前端提供平仓重开重获保护的引导路径）
- 双仓现均为 Expired 状态：
  - ETH：PnL -$8.61 (-4.30%)，Margin 199.82，Net Value 181.21，Funding -$0.1766
  - BTC：PnL -$18.30 (-16.95%)，Margin 107.53，Net Value 83.83，Funding -$0.4353
- 余额 97,893.66 不变；网络仅常规轮询（另见一条 /api/perf/client POST 200，性能上报）

## 16:31:06 实测 · 边界探索：Max 全余额下单被前端拦截（Exceeds Max Position）
- 表单：点击 Max → Pay amount 97,877.22 USDC（≈ 全部可用余额 97,893.66 扣除费用预留）
- 预览：Position size **$5,858,296.25**（非 Pay×100x=$9.79M，前端已按市场上限/流动性截断至可开上限）｜ Collateral $94,948.08（隐含 ≈61.7x）｜ Est.exec $2,512.16 ｜ Est.Liq $2,485.27 (-1.07%) ｜ **Price Impact 0.5504% > Max slippage 0.5%** ｜ Fee -$2,929.15
- 提交按钮变为错误态：**"Exceeds Max Position / Position size exceeds market maximum"** → 下单被前端阻止，未产生交易（余额/持仓/挂单均不变）
- 双仓仍 Expired 暴露态：ETH PnL -$8.54 (-4.27%)，BTC PnL -$18.65 (-17.27%)

## 16:35:35 实测 · 新增 2 条挂单（Open Orders 0→2），疑似 TP/SL 触发单
- Open Orders：0 → **2**；Positions 仍 (2)，两持仓行未见 TP/SL 徽标变化（页签停留 Positions，订单明细暂不可见）
- 可用余额：97,893.66 → 97,893.63（Δ = **-0.03**）——非抵押冻结级别的扣款，与触发单（TP/SL）不冻结保证金、仅预留执行费的模式吻合；待订单明细可见后核对
- 表单仍停留 Max 拦截态（Pay 97,892.60，Exceeds Max Position），非本次挂单来源 → 挂单应来自持仓行 TP/SL 操作
- 双仓：ETH PnL -$8.71 (-4.35%)；BTC PnL -$17.19 (-15.92%)，均 Expired

## 16:36:10 实测 · 确认：ETH 持仓挂上 TP/SL 一对触发单（16:35:10 同时创建）
- 订单 1：Take Profit ｜ ETH ｜ Close Long ｜ Size $20,000 ｜ 8.0022 ETH ｜ Trigger: **Oracle ≥ 2,500** ｜ Reduce Only: Yes ｜ Pending
- 订单 2：Stop Loss ｜ ETH ｜ Close Long ｜ Size $20,000 ｜ 8.0022 ETH ｜ Trigger: **Oracle ≤ 2,490** ｜ Reduce Only: Yes ｜ Pending
- 当前 ETH Oracle 2,496.96，恰在 (2,490, 2,500) 区间内；TP 距 +0.12%，SL 距 -0.28% —— 两侧都很近，预计很快触发其一
- 上一拍余额 Δ-0.03 对应这对触发单的创建成本（不冻结保证金，Reduce Only）✓
- 底部页签已切至 Open Orders（出现 Cancel All 入口）

## 16:43:16 实测 · 切换至 LINK/USD 市场（表单清空，尚无操作）
- 市场面板：ETH/USD → LINK/USD（Oracle 11.703 ｜ 24h Vol 399.81K ｜ OI 97%/3% $1.28M/$43.18K ｜ Funding/h +0.0127%/-0.0031% ｜ 可用流动性 $5.72M）
- 保护面板出现 "LINK 61.68x Trade now 15:00" 预告（LINK 市场杠杆上限展示 61.68x，非 100x——与 BTC/ETH 不同）
- ETH TP/SL 两单仍 Pending（Oracle 在 2,490~2,500 区间内震荡未触发）；双仓、余额均不变

## 16:44:16 实测 · 本轮 live-observer 收尾快照
- 可用余额：97,893.63 USDC（全程账目链：98,217.06 → -8.37(BTC开仓) → -105.02(BTC加仓) → -210.01(ETH开仓) → -0.03(TP/SL对) → 97,893.63 ✓）
- Positions (2)：
  - ETH Long 8.0022 ETH ｜ Entry 2,499.3 ｜ 保护 Expired ｜ TP @2,500 / SL @2,490 两单 Pending（Oracle 收尾时 11.698 页在 LINK，ETH 最后读数 2,496.1，区间内未触发）
  - BTC Long 0.135087 BTC ｜ Entry 79,934.46 ｜ 保护 Expired ｜ 无 TP/SL
- Open Orders (2)：ETH TP/SL 对（16:35:10 创建，Reduce Only）
- 页面停留：LINK/USD 市场（表单空）；无清算、无平仓发生
- 待核对遗留：① BTC 加仓扣款/保证金两处 $0.02 差额 ② ETH 开仓扣款 $0.01 差额（模式：扣款=抵押+开仓费+微量额外，ETH 仓 Margin 却与抵押分毫不差，BTC 仓差 0.02，口径不一致待链上核对）

## 16:48:03 实测 · 第二班接班首拍：LINK 仓已开（Positions 2→3），余额 -32.26
- 接班基线（第一班 ~16:50）：余额 97,893.63；Positions(2)（ETH Long / BTC Long）；表单 LINK $3,000/100x 已填未提交。
- 本拍实测（get_page_text）：
  - 余额：97,893.63 → **97,861.37 USDC**（Δ = -32.26）
  - Positions 计数：(2) → **(3)**；页面出现 Liquidation Protection 面板：**LINK 100x · You are protected 14:54**（15 分钟保护倒计时进行中）· PnL **-$7.86 (-26.19%)**
  - 判定：LINK $3,000 / 100x 多仓已在交接间隙成交（保护剩 14:54 → 约在本拍前 ~6 秒内刚开仓）
- 扣款核对（LINK 费率 0.075%）：
  - 预期扣款 = 抵押 $30 + 开仓费 0.075%×$3,000 = $2.25 → $32.25；加 Relay fee 预估 ~$0.0323 → ~$32.28
  - 实际 Δ = **32.26** ≈ 32.25 + 0.01：与 ETH/BTC 开仓同款"扣款=抵押+开仓费+微量额外($0.01)"模式一致，Relay fee 未按预估全额扣（或已含在 0.01 内），待链上核对
- PnL 自洽性：Oracle 11.664，Est. exec price 显示 11.694；若 entry≈11.695，价格Δ≈-0.262% ×100x ≈ -26.2%（页面 -26.19% 吻合）→ entry 约 11.695，待用户切到 Positions 页签确认全字段
- 其他：ETH TP（Oracle ≥2,500）/ SL（Oracle ≤2,490）两单仍 Pending；BTC oracle 79,623.62；表单仍显示 $3,000/100x（提交后未清空或用户重填，待观察）

## 16:49:13 实测 · ★关键事件：ETH SL 触发全平，配对 TP 自动取消（Open Orders 2→0）；余额 +114.51
- **触发结果（重点观察#1 的核心断言）**：
  - Open Orders：(2) → **(0)** —— 一单执行后另一单**已自动取消**，无残单长驻 ✅（E2E-TRD-033 正例证据）
  - Positions：(3) → **(2)** —— ETH Long 8.0022 ETH 消失；剩 LINK Long + BTC Long
  - 余额：97,861.37 → **97,975.88**（Δ = **+114.51**，ETH 平仓回款）
- **哪单执行的推导：SL（Oracle ≤ 2,490）**
  - 回款 114.51 = Margin(~199.6) + PnL − 平仓费 − 资金费
  - 反推 PnL ≈ 114.51 − 199.6 + 9.96(费) + funding ≈ -74.4 → 每 ETH -9.30 → 执行价 ≈ 2,499.3 − 9.3 = **2,490.0**，正落在 SL 触发线上；TP(≥2,500) 方向不符
  - 平仓费 = 0.05% × (8.0022×2,490 ≈ $19,925) ≈ $9.96；由此反推 ETH 资金费 ≈ $0.7 量级（与 BTC 仓 -0.76 同量级，合理）
  - 待核对：Trade History 应出现 Stop Loss 类型平仓记录（用户切到该页签时核对执行价/费用精确值）
- **LINK 新仓全字段（用户切到 Positions 页签，本拍可见）**：
  - LINK 100.04x Long · 256.523 LINK · Value $2,989.95 · **Entry 11.695**（与上拍推导 11.695 吻合）· Oracle 11.666 · PnL -$7.51 (-25.03%) · Est.Liq $11.645 · 保护倒计时 13:49 · Margin **29.99** USDC · Net Value 20.23 · Funding -$0.0112
  - 核对：256.523 × 11.695 = $3,000.04 ✅ 开仓规模吻合；PnL=(11.666−11.695)×256.523≈-7.44≈页面 -7.51（oracle 渲染时差）✅；抵押 $30 vs Margin 29.99 —— 又见 $0.01 口径差（同 BTC 仓 0.02 模式）
- **★BTC 仓险情：Oracle 已低于 Est.Liq 且保护 Expired**
  - BTC 100.73x Long · Entry 79,934.46 · Oracle **79,565.48** < Est.Liq **79,580.51** · PnL -$49.85 (-46.16%) · Margin 107.20 · Net Value 51.96 · Funding -$0.7608
  - 处于可清算区间但尚未被清算（keeper 未动手/Est.Liq 为估算值）——**下拍起重点盯 BTC 仓是否消失**
- 页面状态：用户已切至 **SOL 市场**（URL=SOLUSDC 与页面 SOL/USD 一致，MKTBOUNCE-004 修复后稳定 ✅）；表单已填 SOL $4,000/100x（Pay 43 = 抵押 40 + 费 3；**SOL 费率亦为 0.075%**，若成交按此核对）；SOL oracle 106.01

## 16:50:06 实测 · Orders History 证据：ETH TP/SL 两单状态仍为 Created（疑索引滞后，待复查）
- 用户切至 Orders History 页签，今日相关记录：
  - 16:35:10 Take Profit ETH Close Long $20,000 · **8 ETH** · Trigger 2,500 · Status **Created**
  - 16:35:10 Stop Loss ETH Close Long $20,000 · **8.0321 ETH** · Trigger 2,490 · Status **Created**
  - 16:12:50 Market ETH Open Long $20,000 · 8.0022 ETH · Entry 2,499.3 · Fee $10 · Executed（与基线开仓吻合 ✅）
- **疑点**：持仓已消失、Open Orders 已 2→0、回款 +114.51 已到账，但 Orders History 中 TP/SL 状态均停在 **Created**，且**无 SL Executed / TP Cancelled 记录、无平仓成交行**。对照 2026-08-04 23:47:28 历史同类对（TP Executed + SL Cancelled）应有的终态，当前状态未更新——先按索引滞后处理，**后续拍复查是否翻转为 SL Executed + TP Cancelled；若长期停 Created 则为 Orders History 状态回写缺陷**
- 细节：TP 行 token size 显示 8 ETH、SL 行 8.0321 ETH，均 ≠ 实际持仓 8.0022 ETH（下单时预估值口径，记录备查）
- 状态平稳项：余额 97,975.88 不变；BTC 仓仍在（oracle 已再跌至 **79,528.1**，深于 Est.Liq 79,580.51 约 0.066%，保护 Expired，仍未被清算）；LINK 仓保护 12:39、PnL -$9.18 (-30.60%)；SOL 表单 $4,000/100x 仍未提交

## 16:51:01 实测 · ★关键事件：BTC 仓消失（疑似清算），余额 +14.67
- **Positions (2) → (1)**：BTC Long 0.135087 BTC（Entry 79,934.46，保护 Expired）消失，仅剩 LINK 仓；此前两拍 oracle 已低于 Est.Liq 79,580.51（79,565→79,528→本拍 79,488.3），符合清算预期路径
- 余额：97,975.88 → **97,990.55**（Δ = **+14.67**）——非零返还，非"归零"式清算
- 返还推导（末次可见状态：Margin 107.20 · Net Value 51.96 @oracle 79,565 · Funding -0.7608）：
  - 14.67 = 107.20 + PnL − 清算费 − 资金费 → PnL − 费 − 资金费 = -92.53
  - 假设 A（清算费≈0.33%×$10,740≈$35，参照 08-05 BTC 清算行 $213.75/$64,218≈0.33%）：PnL≈-56.3 → 清算执行价 ≈ **79,517**，落在两拍间 oracle 区间 [79,488, 79,528] ✅ 更自洽
  - 假设 B（普通 0.05% 费≈$5.37）：反推执行价 ≈79,295，低于区间，欠自洽
  - **待核对**：Trade History 应新增 Liquidation · BTC · Close Long 行（size/价格/费用），用户切页签时核对定案
- LINK 仓：保护 11:47 · PnL -$10.72 (-35.72%) · Oracle 11.653 · Value $2,990.48 · Margin **29.98**（29.99→29.98，随 funding -$0.0196 递减）· Net Value 17.01 · Est.Liq $11.645（oracle 距强平仅 0.069%，但保护期内不清算——**保护期作用的现场验证观察点**）
- 页面：仍在 SOL 市场，Positions 页签；SOL 表单 $4,000/100x 未提交；Open Orders (0)

## 16:51:54 实测 · Trade History 滞后：LINK 开仓/ETH SL 平仓/BTC 清算三笔均未入账
- 用户切至 **ETH 市场**（URL=ETHUSDC 与页面一致 ✅，表单随切换清空为 Enter Amount——SOL $4,000 单未提交即弃）+ Trade History 页签
- **Trade History 最新行停在 16:14:12（ETH Open $20,000 @2,499.3 fee $10）**；以下三笔今日事件全部缺失：
  1. LINK Open Long $3,000（~17:06，按保护倒计时反推）
  2. ETH SL 触发平仓 $20,000（~17:08-17:10 间）
  3. BTC Liquidated $10,754（~17:13-17:15 间）
  → 与 Orders History 两单停 "Created" 同源：**索引/回写全面滞后**（>10 分钟），持续观察是否补录；长期不补则计缺陷（history 完整性）
- 参考费率标定（供 BTC 清算费假设 A 校正）：历史 Liquidated 行费率不一（BTC 08-05 0.33%、TIA 0.165%、AERO 0.54%、SUI 0.36%）→ 清算费非固定费率，最终以补录行为准
- 环境佐证（read_network_requests，12 条全 200）：API chainId=84532（Base Sepolia 基线）、RPC 走 base-sepolia.gateway.tenderly.co（Tenderly 网关）；无失败请求
- 状态：余额 97,990.55 不变；LINK 仓保护 10:52 · PnL -$8.54 (-28.47%)；ETH oracle **2,489.91**（已在原 SL 线 2,490 下方，佐证 SL 触发方向）；BTC oracle 回升 79,551.33

## 16:53:25 实测 · ★终态确认：Orders History 补录完成——SL Executed + TP Cancelled + BTC Liquidation 全字段
- 索引滞后已消除（滞后约数分钟~十余分钟量级），Orders History 新增/翻转四行：
  1. 16:49:50 **Liquidation BTC Close Long $10,798.15 · 0.135776 BTC · 价格 79,529.29 · Fee $38.567 · Executed**
  2. 16:45:58 Market LINK Open Long $3,000 · 256.523 LINK · Entry 11.695 · Fee $2.25 · Executed
  3. 16:35:10 Take Profit ETH（Trigger 2,500）→ **Cancelled** ✅
  4. 16:35:10 Stop Loss ETH（Trigger 2,490）→ **Executed · 成交价 2,489.91 · Fee $10.392** ✅
  → **E2E-TRD-033 断言最终确认：SL 执行 + 配对 TP 自动取消，无残单**；前两拍的 Created 停滞为索引滞后而非缺陷（滞后时长记录在案）
- BTC 清算复核（对照本班拍4 的假设 A）：
  - 清算价 79,529.29 落在观测区间 [79,488, 79,528] 边缘 ✅；清算费 $38.567/$10,798 ≈ **0.357%**（接近假设 A 的 0.33-0.36% 区间）✅
  - 回款复算：107.20(Margin) + PnL(79,529.29−79,934.46)×0.135087=−54.73 − 38.567(清算费) − ~0.77(funding) ≈ **13.13** vs 实际到账 **+14.67** → **差 +$1.54 待链上核对**（Margin 精确值/资金费结算时点为未知项）
  - 口径疑点：清算行 Token Size **0.135776** ≠ 持仓 0.135087（+0.51%）；Size $10,798.15=0.135776×79,529.29 自洽，但与持仓名义 $10,743.7 不符——与 SL 行 8.0324≠8.0022 同款"预估 token size"口径，记录备查
- ETH SL 复核：成交价 2,489.91（=当前 oracle 显示值，触发线 2,490 下方 0.004%）；Fee $10.392 vs 0.05%×8.0022×2,489.91≈$9.96 → **差 +$0.43 待核对**（疑含 relay/执行溢价）；余额回款 114.51 的精确分解仍缺 Margin 与 funding 精确值，挂账待链上核对
- 页面：ETH 市场 Orders History 页签；余额 97,990.55；LINK 仓保护 10:00 · PnL -$8.35；ETH oracle 2,489.85

## 16:57:47 实测 · Trade History 补录 + Closed PnL 口径破解：两笔结算全部对账闭合
- Trade History 新增三行（官方 Closed PnL 落地）：
  - 16:49:50 BTC Liquidated @79,529.29 · $10,798.15 · fee $38.567 · **Closed PnL -$93.30**
  - 16:48:22 ETH Close @2,489.91 · $20,000 · fee $10.392 · **Closed PnL -$85.48**
  - 16:47:16 LINK Open @11.695 · $3,000 · fee $2.25
  - 事件时序确认：LINK 开仓(16:47:16) → ETH SL 平仓(16:48:22) → BTC 清算(16:49:50)，三事件集中在 ~2.5 分钟窗口，与本班拍1~拍4 观测顺序一致（页面时间戳与本地钟有约 15 分钟偏移，逻辑序无矛盾）
- **口径破解（重要）：Closed PnL = 原始 PnL + 平仓/清算费；余额回款 = 初始抵押 + Closed PnL − $0.01**
  - BTC 验证：raw PnL=(79,529.29−79,934.46)×0.135087=−54.73；−54.73−38.567=**−93.30** 与页面分毫不差 ✅；回款 = 初始抵押(7.98+100.00=107.98) − 93.30 = 14.68 vs 实际 +14.67（差 0.01）✅
  - ETH 验证：raw PnL=(2,489.91−2,499.3)×8.0022=−75.14；−75.14−10.392=−85.53 ≈ 页面 −85.48（差 0.05）；回款 = 初始抵押 200.00 − 85.48 = 114.52 vs 实际 +114.51（差 0.01）✅
  - **拍4 挂账的 +$1.54 差额已闭合**：此前误用页面显示 Margin(107.20，已扣 accrued funding)做基数；正确基数为初始抵押 107.98
  - **新疑点（待链上核对）**：Positions 页 Funding 累计显示值（BTC -0.7608）未体现在最终回款中——funding 疑似仅从显示 Margin 递减展示、结算另走 Funding History，或根本未实缴；回款通道每笔仍有 -$0.01 固定微差（与开仓多扣 $0.01 呼应）
- 状态：余额 97,990.55 不变；LINK 仓保护 05:28 · Oracle 11.658 · PnL -$9.39 · Margin 29.94 · funding -0.0581；ETH oracle 2,487.15

## 16:58:26 实测 · ETH 表单超额边界测试：Insufficient balance 拦截正常
- 用户在 ETH 表单输入超额仓位：Position size $5,865,939.51 · Collateral $130,354.21（≈45x）· Pay 133,287.18 USDC > 余额 97,990.55
- 页面提示 **Insufficient balance** + **Exceeds max balance** 双提示，Open 按钮态待观察（未见成交，拦截有效 ✅）
- 细节：Price Impact **0.5503%** 已超 Max slippage 0.5% 但未见独立滑点告警（仅余额拦截优先展示，若余额充足时是否有滑点拦截待另测）；ETH Fee 0.0500% ✓；Est.Liq -1.67% from entry（大仓位价格冲击下强平距离拉远，合理）
- LINK 仓：保护 04:06 · PnL -$8.51 · Margin 29.93 · funding -0.0691；余额不变

## 16:59:53 实测 · 边界拦截第二形态 + Funding History 落地（资金费与余额对账现矛盾）
- **表单边界（续）**：用户点 Max（Pay 97,989.52 ≈ 全余额），Position size $5,615,717.81 → 提示变为 **Exceeds Max Position / Position size exceeds market maximum**（余额够但超市场单仓上限）；与上拍 Insufficient balance 构成两类拦截均验证 ✅（ETH 市场仓位上限 < $5.6M，具体值待查合约参数）
- **Funding History 页签（用户切入）今日结算行**：
  - 16:49 BTC $10,798.15 Long **-$0.7735**（0.0071%；rate×size=0.767 自洽 ✓）
  - 16:48 ETH $20,000 Long **-$0.392**（0.0019%；=0.38 自洽 ✓）
  - 16:03 BTC -$0.0019 · 15:42 BTC -$0.0024（微量）
- **★矛盾挂账**：上拍已证 回款 = 初始抵押 + Closed PnL − 0.01（BTC 14.67=107.98−93.30−0.01；ETH 114.51=200.00−85.48−0.01），Closed PnL 精确 = rawPnL + 平仓/清算费，**无空间容纳 funding**；但 Funding History 明确记账 -0.7735/-0.392 → **两笔资金费未体现在余额回款中**（判定候选：a. funding 实际由 margin 内已扣但结算按初始抵押返还=白扣展示；b. funding 未实缴、History 仅记账；c. 回款含 funding 返还相抵）——**留给链上核对的头号差额**
- LINK 仓：保护 03:02 · PnL -$8.30 · Margin 29.92 · funding -0.0775；余额 97,990.55 不变

## 17:02:10 实测 · LINK 仓 15 分钟保护即将到期（00:18）
- 保护期全程（~15 分钟）观察确认：期间 oracle 多次逼近 Est.Liq 11.645（最近 0.069%）**始终未被清算** ✅——"No liquidation for 15 mins after initial open" 行为符合预期（保护期正例证据）
- 到期时点状态：PnL -$9.72 (-32.40%) · Margin ~29.92 · Est.Liq $11.645；到期后若 oracle 跌破 11.645 应可被清算——下拍起观察保护消失后页面呈现（倒计时区域变化）与是否清算
- 期间余额 97,990.55 恒定；用户表单维持 Max/Exceeds Max Position 状态未提交

## 17:02:47 实测 · LINK 保护到期：面板切换为 "You are exposed to liquidation" + Close & Reopen 入口
- Liquidation Protection 面板：倒计时 00:00，文案变 **"You are exposed to liquidation. Reopen to get protection back."**，新增 **Close & Reopen** 按钮（Relay fee est. ~$0.0537）——保护到期 UI 呈现完整 ✅
- Positions 表 Liq. Prot. 列：倒计时 → **Expired** ✅
- LINK 仓现状：Oracle 11.657 vs Est.Liq **11.646**（距仅 0.094%，裸奔中）· PnL -$9.79 (-32.64%) · Margin 29.90 · Net Value 17.86 · funding -$0.098——**随时可能清算，持续盯**
- 其他：用户表单又调（Collateral $1.87M，Insufficient balance 拦截持续）；余额 97,990.55 不变

## 17:03:31 实测 · ★关键事件：LINK 仓被清算（保护到期后 ~1 分钟内），Positions 归零
- **Positions (1) → (0)**（"No positions"）；Open Orders (0)；余额 97,990.55 → **97,995.35**（Δ = **+4.80**）
- 判定为清算而非手动平仓：
  - 若手动全平：回款 ≈ 30 + rawPnL(≈-10.3) − 平仓费(0.075%×2,990≈2.24) ≈ **17.5**，与 +4.80 不符
  - 清算口径：4.80 = 30(初始抵押) + rawPnL − 清算费 → rawPnL − 清算费 = −25.20；若清算费按 BTC 例 ~0.357%（≈$10.67）→ rawPnL ≈ −14.53 → 清算执行价 ≈ **11.638**（< Est.Liq 11.646 ✓ 自洽）
  - **保护期语义闭环**：保护中多次贴线未清算 → 到期后 oracle 跌破线即被清算——15 分钟保护机制正反两面均验证 ✅
- 待补录核对：Trade History/Orders History 应新增 Liquidation LINK 行（清算价/费用/Closed PnL），出现后按 回款=初始抵押+ClosedPnL−0.01 复核
- UI 残留：Liquidation Protection 面板仍显示 LINK "exposed"（杠杆值异常跳为 61.71x）而 Positions 已空——面板未随清算即时清除（轻微展示滞后，观察是否自行消失）
- 今日事件累计：ETH SL 触发平仓（TP 自动取消）→ BTC 清算 → LINK 清算；账户仅剩余额 97,995.35，无持仓无挂单

## 17:04:58 实测 · UI 缺陷候选：清算后 Liquidation Protection 面板残留不消失
- LINK 仓已清算（Positions=0）超过 ~2 分钟，左侧 Liquidation Protection 面板仍渲染：LINK · "You are exposed to liquidation. Reopen to get protection back." · 00:00 · PnL 冻结在 -$9.78 (-32.58%)
- 且面板杠杆数值随**表单滑条**联动变化（100.33x → 61.71x → 23x），并非已消失仓位的杠杆——面板把已清算仓位的缓存 PnL 与当前表单杠杆混合渲染
- 影响：误导用户以为仍有暴露仓位可 "Close & Reopen"；建议缺陷单（展示层）：清算/平仓后未订阅仓位消失事件清除面板。持续观察是否在页面刷新/切市场后消失
- 余额 97,995.35 恒定；Positions(0)/Open Orders(0)；用户表单维持 Exceeds Max Position

## 17:19:55 实测 · 第二班收班（60 拍满）
- 收班快照：余额 **97,995.35 USDC** · Positions(0) · Open Orders(0)；ETH 市场页；表单停在 Max/Exceeds Max Position 状态未提交
- 末三拍页面数据完全冻结（oracle 2,492.29 / BTC 79,425.18 连续三拍不变）——疑标签页后台休眠或行情流暂停，非事件；末次网络检查（拍40）RPC/接口全 200
- 清算后 Liquidation Protection 残留面板：**直至收班仍未消失**（>20 分钟），缺陷候选成立（详见本班 UI 缺陷候选条目）
- 本班关键事件回顾：① ETH SL 触发全平 + TP 自动取消（Open Orders 2→0，E2E-TRD-033 正例）② BTC 清算（@79,529.29，费 $38.567）③ LINK 保护到期后清算（余额 +4.80）④ 结算口径破解：回款=初始抵押+Closed PnL−0.01，Closed PnL=rawPnL+平仓/清算费
- 遗留待链上核对：① funding 记账（BTC -0.7735 / ETH -0.392）未体现在余额回款 ② 每笔回款固定少 $0.01 ③ ETH SL 费 $10.392 vs 0.05% 名义 $9.96 的 +0.43 ④ LINK 清算行补录后按公式复核（清算价 ≈11.638 推算值）⑤ 清算/订单行 Token Size 用预估值≠实际持仓量的口径确认

## 17:27:59 实测 · 第三班开班（live-observer #3）基线快照
- 交接核对：余额 **97,995.35 USDC** ✅（与二班收班一致）· Positions(0) · Open Orders(0) ✅
- 页面现在 **SOL 市场**（SOLUSDC，非本班计划的 BTC）：Oracle 106.37 · 费率 **0.0750%**（SOL 档，与两班结论 LINK/SOL 0.075% 一致）
- 用户表单已预填（未提交）：SOL 100x · Position size $30,000 · Collateral $300 · Pay 322.50 USDC · Est.Exec 106.49 · Est.Liq 106.04（**-0.43% from entry**，100x 贴身线合理）· Price Impact 0.0985% · Fee -$22.5（=0.075%×30,000 ✓）
- 表单 TP/SL 挂件：TP 108（+142.01%，Est.PnL +$426.10）/ SL 106（-45.80%，Est.PnL -$137.43）· On；页面出现警示 **"Stop Loss price is at or below the liquidation price ($106.04)"** —— SL≤Liq 预警文案确认存在 ✅（边界提示正例）
- **二班缺陷候选跟踪**：清算后 Liquidation Protection 残留面板 **仍在**（LINK · "You are exposed to liquidation" · 00:00 · PnL 冻结 -$9.78 -32.58%，杠杆随表单联动）——自 17:03 清算起 **约 25 分钟未清除**，跨市场切换（ETH→SOL）也不消失，缺陷候选升级为稳定复现
- 网络基线：open-interest / tickers / goldsky subgraph 正常（200/pending 流式）

## 17:29:09 实测 · SL≤Liq 预警动态消隐 + LINK 残留面板部分清除
- SL 预警边界行为（表单未动，行情自漂）：Est.Liq 从 106.04 漂至 105.99（oracle 106.37→106.33），SL=106 由 ≤Liq 变为 >Liq，**警示文案随之消失** —— 预警是实时联动计算而非提交时一次性校验 ✅（与开班拍的出现构成正反例）
- 二班遗留的 Liquidation Protection 残留面板：**"You are exposed…/00:00/冻结 PnL" 文案块已消失**，面板只剩 "LINK 100x" 标题壳（~17:28 起）——残留部分自清，但标题壳仍未清干净（缺陷候选降级为轻微展示残留，继续观察）
- 余额 97,995.35 · Positions(0) · Open Orders(0) 不变

## 17:32:34 实测 · 表单 SL 106→105：Est.PnL 触发 -100% 封顶展示（拍10 · 网络检查通过）
- 用户改动（唯一变化）：TP 108 / SL **105**（原 106）
- **SL Est.PnL 显示 -100% / -$300（=全额抵押）**：raw 线性计算应为 (105−106.39)/106.39×30,000 ≈ **-$392** > 抵押 300 —— 前端把 SL 预估亏损**按抵押封顶**展示（超出部分不显示为负超额）✅ 合理但属推导口径：亏损上限=抵押（清算兜底）
- SL(105) < Liq(105.93) 警示持续显示 ✓（与封顶展示同时成立，两重提示自洽）
- 期间拍3~9 无实质变化（行情微漂、SL≤Liq 警示随 Liq 漂移多次消隐/复现，已归入上一条目结论）
- 网络检查（拍10）：tickers/open-interest/markets-info/candles + Tenderly RPC 全部 200 ✅
- 余额 97,995.35 · Positions(0) · Open Orders(0)

## 17:34:11 实测 · ★市价开多 SOL 已提交：余额 -322.54，Open Orders (0)→(3)，Positions 暂 (0)
- 余额 97,995.35 → **97,672.81**（Δ = **-322.54** ≈ Pay 322.50 + relay fee ~0.0377 ✓ 分毫吻合）
- **Open Orders (0)→(3)**：判读为 市价开仓单(待 keeper 执行) + TP 单 + SL 单 三件套同时挂出（提交时 TP/SL·On）；Positions 仍 (0) —— 市价单为异步执行模型（提交→keeper 成交）确认
- 提交参数（按拍10-12 表单）：SOL Long $30,000 · 100x · Collateral $300 · Pay 322.50 · 提交时 TP/SL 约 108/105（成交前表单又改为 TP 106/SL 105.5，是否影响已挂 TP/SL 待 Open Orders 行观察）
- 注意：本单是 **SOL $30,000/100x**，非本班计划第 1 步的 BTC $1,000/2x（执行人自选，观察照记）
- 表单区新态：TP 106 显示校验 **"Take Profit price should be above oracle price"**（106 < oracle 106.25，多头 TP 必须高于现价的反例校验 ✅）；SL 105.5 Est.PnL -81.05% / -$243.47（=(105.5−106.36)/106.36×30,000−? 线性推导 ≈ -242.6，含费口径差 ~0.9 待成交后核）
- 中间态补录（拍12）：SL 输入过程中出现 "1055" 瞬时值，校验即时提示 "Stop Loss price should be below oracle price"（+89,187.29%）——输入过程逐字符实时校验 ✅
- 下拍重点：Open Orders 三行字段、市价单成交（Positions 出现 + Orders 3→2）、成交后 TP/SL 行触发价到底是 108/105 还是 106/105.5

## 17:35:19 实测 · ★SOL 市价单成交 Positions(1)；Open Orders 现 **两条 Stop Loss**（TP 疑被按触发方向归类为 SL）
- **Positions (0)→(1)**、Open Orders (3)→(2)：市价开仓单已由 keeper 执行（异步模型闭环）
- 用户切到 Open Orders 页签，两行全字段（创建时间同为 **2026-08-28 17:33:42**，同批创建）：
  1. **Stop Loss** · SOL · Close Long · Size $30,000 · Token Size **281.891 SOL** · Trigger $105.5 · Reduce Only **Yes** · Trigger: Oracle ≤ 105.5 · Pending · [Edit/Cancel]
  2. **Stop Loss** · SOL · Close Long · Size $30,000 · Token Size **281.891 SOL** · Trigger $106 · Reduce Only Yes · Trigger: Oracle ≤ **106** · Pending · [Edit/Cancel]
- **★发现：没有 Take Profit 行**。提交时表单 TP=106 低于 oracle(106.25)（页面同时报 "TP should be above oracle price"），但订单仍然创建成功且**被归类为第二条 Stop Loss（Oracle ≤ 106）** —— 前端校验只是提示未拦截，后端按触发方向（多头 close 且触发价 < 现价 ⇒ SL）归类。行为候选缺陷：**用户意图 TP 变成了贴身 SL**（106 距现价仅 -0.27%，随时触发）
- 反推开仓：Token Size 281.891 → 入场价 ≈ 30,000/281.891 = **106.42**（≈ 拍13 表单 Est.Exec 106.41/106.36 ✓）；位置详情（Margin/Liq/PnL）因用户停在 Orders 页签暂不可见，切回 Positions 时补录
- 表单现值：TP 107 / SL 105.5（用户提交后又调，TP +55.56% Est.PnL +$166.96）
- 余额 97,672.81 不变（开仓扣款已在上一拍完成）
- **下拍焦点：SL@106 距 oracle 106.29 仅 0.27%，大概率先触发 → 若触发即"意图 TP 单实际以 SL 平仓"，盯余额回款与 History 落地**

## 17:36:05 实测 · Positions 行补录（SOL 100x 母仓）+ 三项口径核对通过
- 持仓行全字段：SOL **100.03x** Long · **281.891 SOL** · Value $29,961.7 · Entry **106.42** · Oracle 106.25 · PnL **-$48.9 (-16.30%)** · Est.Liq **$105.97** · Liq.Prot 倒计时 **13:45** · Margin **299.92** USDC · Net Value **228.52** USDC · Funding **-$0.078** · [Close Position / TP/SL / Leverage / Adjust Margin]
- 核对：
  - PnL% = -48.9/300 = **-16.30%** ✓（分母=初始抵押）；raw=(106.25−106.42)×281.891=−47.9≈−48.9（oracle 显示位数截断致 ~$1 差，量级吻合）
  - Margin 299.92 = 300 − funding 0.078 ✓（显示 Margin 随 funding 递减，延续二班结论）
  - **Net Value 228.52 = Margin 299.92 + PnL(−48.9) − 平仓费 22.5 ✓ 精确成立**（Net Value 含预扣平仓费口径确认）
  - 杠杆 100.03x = 30,000/299.92 ✓（按当前 Margin 折算，非初始 100x）
- 100x 下 PnL 波动剧烈：oracle 距 Est.Liq 105.97 仅 0.26%、距 SL@106 仅 0.24% —— 三线（106 / 105.97 / 105.5）交叠，**SL@106 略高于清算线**，理论上 SL 先触发；实况盯下拍
- 保护期语义注意：Liq.Prot 13:45 生效中 → 清算被抑制，但 **SL 触发不受保护期抑制**（待验证：若 oracle ≤106 则 SL 平仓应照常执行）

## 17:37:23 实测 · 用户备 50% 减仓单（Reduce-only Market Close）：预览快照
- 表单：Reduce-only 开启 · Available to Trade 30,000 USD · 选 $15,000（50%）≈ **141.184 SOL** · 按钮变 **Place Close**
- 预览 Trade Details：**Est. Receive 112.38 USDC** · Position size $15,000 · **Collateral $119.55** · Est.Exec 106.24（=oracle，无点差显示）· Min acceptable 105.71 · Fee(0.0750%) **-$11.25**（=0.075%×15,000 ✓）· Relay ~0.0369
- 推导对不上的点（挂账待执行后核）：按比例退抵押应 ≈ 299.91/2=149.96，PnL 份额 −25.34，费 −11.25 → 理论到账 ≈ **113.37**，预览 112.38（差 ~0.99，疑隐含平仓价格冲击）；且 Collateral 显示 **119.55 ≠ 149.96**，占比 39.9% 而非 50% —— **Collateral 字段口径存疑**（若=移除抵押，则剩余仓位杠杆将变 15,000/180.36≈83x，疑按"保持可用维持保证金"另算）
- Liquidation Protection 面板：**LINK 残留已被真实 SOL 仓位取代**（SOL 100.03x · You are protected · 12:34）——残留面板生命周期终结：新开仓覆盖后才彻底清除（缺陷影响面：仅在无新仓期间误导）
- 持仓行同步：PnL -$50.68 (-16.89%) · Margin 299.91 · Net Value 226.73 · funding -$0.0869；余额 97,672.81 不变；Open Orders 仍 (2)（SL 106 / SL 105.5 未触发——oracle 106.24 尚未 ≤106？**注意：oracle 已 106.24 < 106？否，106.24 > 106** ✓ 未触发正确）

## 17:38:59 实测 · ★订单编辑落地：SL@106 → SL@105.6（Edit 生成新行新时间戳）；50% 减仓市价单 Pending 超 1 分钟
- **订单编辑（本班计划功能点）**：原行 `17:33:42 · SL · $30,000 · 281.891 SOL · Trigger $106` 消失，新行 **`17:38:04 · Stop Loss · Close Long · $30,000 · 281.891 SOL · Trigger $105.6 · Reduce Only Yes · Pending`**
  - 变化字段：Trigger Price **106 → 105.6**；时间戳 **17:33:42 → 17:38:04（编辑=重建，新时间戳）**；Size/Token Size/方向/RO 均不变
  - 触发价编辑无余额变动（97,672.81 恒定 ✓，trigger 单不占用资金）
  - 编辑动机可读：SL@106 距 oracle 太近（0.24%）且高于清算线——用户把"误变 SL 的 TP"下移避险
- **市价减仓单执行延迟**：17:37:28 提交的 Market Close $15,000 至本拍（~17:39:2x）仍 **Pending ≥ 1 分钟**——对比开仓市价单 <40 秒成交，明显偏慢（候选：keeper 对 reduce-only market 的处理延迟 / 或与同仓位 SL 编辑并发引起）；继续计时
- 三行现状：SL@105.6(17:38:04) + MarketClose $15,000(17:37:28, Pending) + SL@105.5(17:33:42)
- 网络（拍20）：RPC/tickers/open-interest/goldsky 全 200 ✅；持仓 PnL 随 oracle 106.29 回至 -$37.81

## 17:39:50 实测 · ★50% 减仓成交 + **SL 触发单自动缩量到剩余仓位**（重要正例）+ 第二次编辑 SL 105.6→106
- **减仓市价单已执行**（17:37:28 提交，成交发生于 17:38:4x 前后，Pending ≈ 70-80 秒）：表单 Available to Trade 30,000→**15,000 USD**；保护面板 PnL -$8.53 (-5.72%) · 杠杆 100.64x；Positions 仍 (1)（剩余仓行待用户切回 Positions 补录）
- **★两条 SL 触发单 Size 自动 $30,000→$15,000、Token Size 281.891→140.9455**，行内出现注记 **"Closes entire remaining position"** —— reduce-only 触发单随仓位缩减自动等比缩量 ✅（本班计划第 5 步关键断言的前半段：残单不悬空超量）
- **第二次订单编辑**：SL@105.6(17:38:04) → **SL@106(17:38:46)**（又一次重建新时间戳；现两行：SL@106 与 SL@105.5，均 $15,000/140.9455）
- 剩余仓位推导：预览 Collateral **149.05**（≈15,000/100.64 ✓）→ 部分平仓按比例退出约half抵押；full-close 预览 Est.Receive 128.26 vs 手推 149.05−8.53−11.25=129.27（**又差 ~1，与拍17 预览差额同源，疑隐含价格冲击项未单列**，挂账）
- oracle 全程未 ≤106，SL@106 未触发 ✓（当前 106.36）
- 待补：减仓余额回款 Δ（预览 Est.Receive 112.38 口径）——用户切回带余额视图时核对

## 17:40:43 实测 · 减仓后剩余仓行补录：Token Size 精确 50%，保护期不重置，Net Value 公式再验证
- 剩余仓行：SOL **100.66x** Long · **140.9455 SOL**（=281.891/2 **精确 50%** ✅）· Value $14,990.59 · Entry **106.42 不变** ✅ · Oracle 106.41 · PnL -$1.46 (-0.97%) · Est.Liq **$105.98** · Liq.Prot **09:14 续走（部分平仓不重置保护期 ✅）** · Margin **149.02** · Net Value **136.31** · Funding -$0.0279
- 核对：
  - Net Value 136.31 = 149.02 − 1.46 − 11.25 ✓ 公式第二次精确成立
  - **Margin 149.02 ≠ 299.92/2=149.96（差 0.94）**：抵押退还非严格对半——0.94 疑似=减仓时实现亏损从退还份额中先扣（减仓成交价 ~106.33-106.36 段，raw loss ≈ (exec−106.42)×140.9455 ≈ 0.9-1.3，量级吻合）→ **判读：部分平仓 = 按比例退抵押 − 实现亏损 − 费**，剩余 Margin 另按公式微调；待余额 Δ 现身后闭环
  - Est.Liq 105.97→105.98（微调，与 margin 减半自洽：距 entry 仍 -0.41%）
- 余额字段因 Reduce-only 表单不可见，回款核对挂账（最后知 97,672.81）

## 17:42:49 实测 · ★oracle 触及 106.00 = SL@106 触发线；保护面板现新状态文案 "Successfully rescued"
- Oracle 106.14 → **106.00**（恰好踩线）：SL@106（Oracle ≤ 106）**条件已满足，行仍 Pending**（keeper 触发延迟计时开始）；SL@105.5 未及
- **保护面板新状态**："You are protected" → **"Successfully rescued"**（06:56 剩余）——oracle 已跌破 Est.Liq 105.98±? 附近（PnL -$60.17 -40.36%，若无保护此仓已可清算）→ 15 分钟保护**主动拦下清算**的第三种状态文案首次捕获 ✅（protected / exposed / **rescued** 三态齐）
- 竞态观察点：SL@106 触发执行 vs 保护期内清算抑制——若 SL 正常执行则验证"SL 不受保护期抑制"；执行价与 Min acceptable 105.46 对照
- full-close 预览：Est.Receive 76.53（=149.05−60.17−11.25−1.1 附近，仍含 ~1 隐差）

## 17:43:33 实测 · ★★SL@106 状态 Pending → **Frozen**（未执行）；保护面板 "You are being rescued"
- Oracle 106.00 → **105.87**（已深破 SL@106 触发线 0.12%+、也破 Est.Liq 105.98）
- **SL@106 行 Status 变为 Frozen**（Edit/Cancel 按钮仍在）：触发条件满足但订单被冻结而非成交——判读候选：a) keeper 执行时仓位已处清算区（oracle<Est.Liq），执行校验失败转 Frozen；b) 15 分钟保护期把清算与 SL 一并抑制。**若 b 成立，"SL 不受保护抑制"假设被推翻**——关键区分证据：SL@105.5 仍 Pending（未冻结），若 oracle ≤105.5 时它也 Frozen → 倾向 b/清算区冻结；若成交 → a 特定于"越过清算线后的 SL"
- 保护面板第四种文案：**"You are being rescued"**（06:16）·PnL -$77.81 (-52.20%)——rescue 进行时（护航中）与上拍 "Successfully rescued"（完成时）为一组过程态
- 本仓已是 100x 深水仓：抵押 149.05 · 浮亏 -77.81（-52%）；保护若到期（~06:00 后）oracle 仍 <Liq 则面临清算——下拍持续
- 挂账断言更新（本班计划第 5 步"TP/SL 随全平自动取消"尚未到）：新增 **"SL Frozen 后能否恢复/成交/退出"** 观察项

## 17:45:00 实测 · Positions 行 Est.Liq 列变 **"Liquidatable"** 标签（保护倒计时 04:42 内免死）
- 持仓行：SOL 100.71x Long · 140.9455 SOL · Value $14,930.95 · Entry 106.42 · Oracle 105.71 · PnL **-$100.28 (-67.28%)** · Est.Liq 列显示 **Liquidatable**+倒计时 04:42 · Margin 148.94 · Net Value **37.41** · Funding -$0.1047
- 语义链完整：oracle(105.71) < 清算线(~105.98) → 仓位标记 Liquidatable，但保护倒计时未走完 → 不执行清算（与二班 LINK 保护期正例一致）；Net Value 37.41 = 148.94 − 100.28 − 11.25 ✓ 公式三验
- 行情往返：oracle 低点 105.62（未及 SL@105.5 触发线）→ 回 105.71；两 SL 单：@106 Frozen 不变、@105.5 Pending 不变
- 网络（拍30）：全 200 ✅
- 焦点前瞻：保护到期 ~04:40 后若 oracle 仍 <105.98 应发生清算（除非先回升）；SL@105.5 若先被触及，看是否也 Frozen（区分冻结机理）

## 17:46:51 实测 · SL@105.5 已撤单（Open Orders 2→1），Frozen SL@106 仍冻结不动
- SL@105.5（17:33:42 · Pending）行消失，Positions 仍 (1)、仓量 140.9455 不变 → 判定**用户 Cancel 撤单**（非触发执行；oracle 观测低点 105.62 未及 105.5）
- Frozen SL@106：oracle 已回升至 105.88（仍 <106 触发区、<Est.Liq ~105.98 清算区），状态持续 **Frozen 不自动恢复**
- 保护倒计时 02:52 · PnL -$76.68 (-51.44%)；到期时 oracle 若仍 <105.98 → 清算与 Frozen SL 的竞态即将揭晓
- 撤单退款：trigger 单无占资，预期余额不变（余额字段仍被 Reduce-only 表单遮蔽，待验）

## 17:49:03 实测 · 保护临期 00:39：面板第五态 **"You'll be liquidated"** + **Add Margin 快捷入口**出现
- 保护倒计时 00:39 · oracle 105.80（仍 < 清算线）：面板文案 "You are being rescued" → **"You'll be liquidated"**，并新增 **USDC 输入框 + Add Margin 按钮**（临期自救入口）——保护面板五态齐收：protected / exposed(到期) / Successfully rescued / being rescued / **You'll be liquidated**
- PnL -$87.85 (-58.94%) · Frozen SL@106 依旧冻结；到期若不加保证金且价不回 105.98 上方 → 预期清算（清算费 SOL 档 ~0.3%×15,000≈$45 量级、按二班跨市场同率结论）
- 预告核对公式：清算回款 Δ=剩余Margin基数(148.85±) + rawPnL − 清算费；或按二班口径 回款=本仓初始抵押份额 + Closed PnL − 0.01

## 17:50:11 实测 · ★★保护到期即清算：Positions 归零，**Frozen SL@106 随清算自动取消**（关键断言 PASS）
- 保护 00:02 → 到期 → **一个拍周期（≤20 秒）内清算执行完毕**：Positions (1)→(0) · **Open Orders (1)→(0)**
- **本班计划第 5 步核心断言（残单处置）落地**：仓位因清算归零时，遗留的 Frozen SL@106 **自动消失**（未变成孤儿单）✅ —— 二班 ETH 例证的是 SL 成交后 TP 自动取消，本班补上 **清算场景 + Frozen 状态单** 的自动清场证据
- 保护面板第六态：**"You have been liquidated"** · 00:00 · PnL 冻结 -$83.37 (-55.93%)；表单变 "No position to reduce"、Est.Receive 0 / Collateral $0
- 清算时点 oracle ~105.76-105.83（< 清算线 105.98）；Frozen SL 从未成交 → **"SL 冻结未执行 → 到期清算收尾"完整链路实录**（对用户而言：SL 因贴清算线而失效的风险实证，呼应下单时 UI 的 SL≤Liq 警示）
- 待核：余额 Δ（部分平仓回款 + 清算回款，基数 97,672.81）——等余额字段可见；History 落地行（Liquidation + Market Close 50%）与 IDXLAG-005 计时开始（清算发生 ~17:47:0x）
## 17:51:13 实测 · Orders History 落地：本班 SOL 四行 + 二班挂账 LINK 清算行补录闭环；SOL 清算行尚未回填（IDXLAG-005 计时中）
- 本班 SOL 链路四行（用户切入 Orders History）：
  1. `17:37:28 Market Close Long $15,000 · 141.1064 SOL · 成交价 106.3 · Fee $11.4005 · Executed`（50% 减仓）——**Token Size 141.1064 = 15,000/106.3 派生值 ≠ 实际减掉的 140.9455**（二班挂账⑤"Token Size 口径"再证）；**Fee 11.4005 ≠ 0.075%×15,000=11.25（+0.15）**，反推费基 $15,200.7（疑含价格冲击后的名义额，挂账）
  2. `17:33:42 Stop Loss $30,000 · 283.0189 SOL · Trigger 106 · **Frozen**`——History 里 Frozen 状态保留，Size 记**原始 $30,000**（非缩量后 15,000），Token Size=30,000/106 派生
  3. `17:33:42 Market Open Long $30,000 · 281.891 SOL · 106.42 · Fee $22.5 · Executed`——开仓费 =0.075%×30,000 **精确** ✓
  4. `17:33:42 Stop Loss $30,000 · 284.3602 SOL · Trigger 105.5 · **Cancelled**`——撤单终态正确 ✓（Token Size=30,000/105.5 派生）
- **二班挂账④ LINK 清算行现身并闭环**：`17:03:00 Liquidation LINK Close Long $3,000 · 257.712 LINK · 11.641 · Fee $11.3497 · Executed`
  - 清算价 **11.641** vs 二班反推 ≈11.638 ✓；raw PnL=(11.641−11.695)×256.523=−13.85 → ClosedPnL=−13.85−11.35=−25.20 → 回款=30−25.20−0.01=**4.79 ≈ 实测 +4.80** ✓✓（回款公式四次验证）
  - 清算费率 11.3497/3,000=**0.378%**（vs BTC 例 0.357%——"清算费跨市场同率 0.3%"结论需修正：**实际 0.35-0.38% 浮动，疑 0.3% 基础+执行成本**，改挂账）
- **SOL 清算（~17:47:0x 发生）在 Orders History 尚无行**：History 首行停在 17:37:28 → **IDXLAG-005 计时开始**（发生→回填时差待记）
- 页面时间戳 17:03:00 与二班观察 17:03:31 拍相差 <31s：History 时间为链上执行时刻 ✓

## 17:52:18 实测 · SOL 清算行回填：`17:49:34 Liquidation SOL Close Long $15,000 · 141.7263 SOL · 105.84 · Fee $56.4269 · Executed`
- **IDXLAG-005 计时**：行落地于本拍（发现时 ≤ 拍43），行内时间戳 17:49:34 → 回填时差 **< ~2 分钟**（较二班观测明显快）；⚠️ 时序疑点：UI Positions 归零观测拍（~17:47-17:48 估）与链上执行时间 17:49:34 接近甚至略早——**页面疑在保护到期时先行乐观清仓展示**，或本班拍点时间估计偏差，不定罪、留档
- 清算参数：执行价 **105.84** · 费 **$56.4269 = 0.376%×15,000**（与 LINK 0.378%、BTC 0.357% 同档 → **清算费率 ~0.35-0.38% 浮动**结论加固，非固定 0.3%）· Token Size 141.7263 = 15,000/105.84 派生值（非实际 140.9455，口径挂账⑤三证）
- 预演核对（待余额/Trade History 平账）：raw=(105.84−106.42)×140.9455=−81.75 → ClosedPnL=−81.75−56.43=**−138.18** → 清算回款 ≈ 149.05−138.18−0.01=**+10.86**；50% 减仓回款 ≈ 预览 112.38（±）→ **预期余额 ≈ 97,672.81+112.38+10.86 ≈ 97,796.05（±2）**
- 另录：Frozen SL@106 在 History 终态显示为 **Cancelled**（拍42 曾见 Frozen，本拍已转 Cancelled）——冻结单随清算自动取消在 History 的终态归档正确 ✓

## 17:59:48 实测 · 第三班收班（60 拍满）
- 收班快照：Positions(0) · Open Orders(0)；页面停 Orders History 页签（末 ~15 拍执行人无操作，行情流持续更新，非休眠）；表单停 Reduce-only "No position to reduce"；保护面板残留 "You have been liquidated"（SOL，与二班 LINK 残留同缺陷模式——**清算后面板不清除复现第二例，缺陷候选坐实**）
- **★头号遗留（交接第四班/复盘）**：**收班时余额字段全程被 Reduce-only 表单遮蔽未能读到**。最后确认值 97,672.81（开仓扣款后）。应到账：50% 减仓回款（预览口径 ~112.38）+ 清算回款（推导 ~10.86）→ **预期余额 ≈ 97,796±2**；下次页面回到 Buy/Long 表单或刷新时第一时间核对
- 本班关键链路回顾（SOL 100x，非计划 BTC/空头——计划第 1/2/3/6 步执行人未走，观察按实况记）：
  ① 市价开多 $30,000/100x 成交 @106.42，扣款 322.54 分毫吻合 ② 提交时 TP 106 低于 oracle 被后端按触发方向归类为第二条 SL（前端仅提示未拦截）③ 两次订单编辑（SL 106→105.6→106，Edit=重建新时间戳）④ 50% 减仓 Token Size 精确减半、SL 触发单自动缩量 + "Closes entire remaining position" 注记 ⑤ SL@106 触发条件满足后转 **Frozen** 未执行 ⑥ SL@105.5 手动撤单 ⑦ 保护到期 ≤20 秒内清算 @105.84（费 0.376%）、**Frozen SL 随清算自动取消**（残单处置断言 PASS，History 终态 Cancelled）⑧ 保护面板六态全捕获 ⑨ 二班 LINK 清算行回填闭环（回款公式四验：30−25.20−0.01=4.79≈4.80）
- 存疑挂账（新增）：a) 减仓费 11.4005 vs 名义 11.25（+0.15，反推费基 15,200.7）b) 减仓/全平预览 Est.Receive 恒少 ~1（疑隐含价格冲击未单列）c) 部分平仓退抵押非严格对半（149.02 vs 149.96，差 0.94 疑为实现亏损先扣）d) History Token Size=Size/价格 派生值（三证）e) 清算费率 0.357-0.378% 浮动（"0.3% 同率"结论需修正）f) UI 疑似在保护到期时先行乐观清仓展示（Positions 归零观测早于/贴近链上 17:49:34，拍点时间估计有偏差，未定罪）
- 网络：拍10/20/30/40 全 200，收班拍 goldsky OPTIONS 204 正常

---

# 第四班（R2）接班 · 实时观察

## 21:44:35 实测 · R2 · 接班首拍：IDXLAG-005 回填已落地（21:34:06 三条记录现身 Orders History）
- 接班基线核对：余额 **97,774.12** ✓（与交接一致）；Positions(0) · Open Orders(0) ✓；页面 SOL 市场，Oracle 104.79
- **IDXLAG-005 判定**：交接基线（~21:40+）称 21:3x 记录未回填；本班首拍 21:44:35 **已见全部三条**。回填发生于交接与首拍之间 → **滞后上界 ≈ 10 分 29 秒**（行内时间戳 21:34:06 → 首拍 21:44:35），实际滞后介于"交接时刻—21:44:35"，比三班 SOL 清算行 <2 分钟的观测慢（不同类型记录/索引批次，留档不定罪）
- 回填三条内容（TPSL-007 复现2 链上侧留痕核对）：
  1. `21:34:06 Market Open Long $10,000 · 95.0604 SOL · Entry 105.2 · Fee $7.5 · Executed` — 开仓费 7.5=0.075%×10,000 ✓
  2. `21:34:06 Stop Loss Close Long $10,000 · 95.213 SOL · Trigger 105.1 · Entry 105.03 · Fee $7.5017 · Executed` — **提交时为 TP 105.1，History 终态记为 Stop Loss** → TPSL-007 复现2 的历史侧证据坐实（TP 低于现价被归类为 SL 且已按 SL 触发执行）；执行价 105.03 低于触发 105.1（SL 语义：跌破触发向下成交）✓；Token Size 95.213 为派生值（10,000/105.03≈95.211，口径挂账 d 又一证）；费 7.5017 反推费基 10,002.3（挂账 a 模式再现）
  3. `21:34:06 Stop Loss Close Long $10,000 · 95.2381 SOL · Trigger 105 · Cancelled` — 原生 SL 105 因仓位已被"变身 SL"平掉而自动取消 ✓（Token Size 95.2381=10,000/105 派生）
- 净额核对：raw=(105.03−105.2)×95.0604=−16.16；费 7.5+7.5017=15.00 → 推导净 **−31.16** vs 交接口径净 −31.07，**差 +0.09 待核**（疑资金费/费基微差，挂账）
- 结论：该仓生命周期在 History 三行完整闭环（开仓 Executed / 变身 SL Executed / 原 SL Cancelled），无孤儿行

## 21:49:45 实测 · R2 · 旁证：执行人链上取证进行中（拍12 观察）
- 执行人另开标签页访问 BaseScan Sepolia tx 页：`0xab51198fc3df2171d597b12f1047028e5f0720160d6cba878d40a5313f9a9ebc`（疑为 21:34:06 交易组的链上凭证，交接备查）；BaseScan 两页均在过 Cloudflare 人机挑战
- fx100 页（tab 1810810510）持续静置：余额 97,774.12 · 无仓无单 · Orders History 页签；拍1-12 仅行情流动，无交易操作
- 21:57 补充：取证第二笔 tx `0xcb4844413ca82b962ec01d95d2d4cf7ba5d8e6e39a45df5d0d86d2fb1bff3377`（执行人在看其 #eventlog 页）

## 22:00:47 实测 · R2 · 执行人回到 fx100（拍25）：页签由 Orders History 切至 Positions（空态"No positions"）
- 拍13-24（~21:52-22:03）执行人全程在 BaseScan 取证（两笔 tx：0xab51198f... 与 0xcb484441...），fx100 无任何交易操作，余额恒 97,774.12
- 现回到交易页，疑将开始 Round 2 计划操作（空头链路/编辑单），进入密切观察

## 22:01:50 实测 · R2 · 拍26 三连事件：挂单已提交（Open Orders 0→3）+ 余额冻结扣款 + 表单再现 SL 高于现价校验提示
- **余额 97,774.12 → 97,559.07（−215.05）**：Positions 仍 (0) → 扣款为挂单抵押冻结（非成交），含 ~0.05 差额（疑 relay fee 预留，待终态核对）
- **Open Orders (3)**：拍25→26 间（22:00:47~22:02:00）提交，构成疑为 1 限价开仓 + 附带 TP/SL 两条触发单（页面停 Positions 空态页签，挂单明细待执行人切页签后捕获）
- 表单当前状态（准备中或提交后残留）：**Buy/Long** $20,000 · 100x · Pay 215 USDC · TP 105.7（+37.65%，Est. PnL +$75.12）/ **SL 105.6 · On** → 前端红字 **"Stop Loss price should be below oracle price"**（oracle 105.2；SL 高于现价对多头非法——SLACCEPT-009 再验证操作进行中，前端有提示；此前 TPSL-007 场景为"提示不拦截"）
- Trade Details 预览留档：Est. exec 105.3 · Liq 104.86（−0.43% from entry）· Price Impact 0.0881% · Max acceptable(incl. 0.5% slippage) 105.83 · Fee 0.075%=$15 · Relay fee ~$0.0599
- ⚠️ 注意：计划为空头链路但当前表单是 Open Long ——继续观察实际提交方向

## 22:03:23 实测 · R2 · 拍27 限价开多成交 + 价格急跌 → 保护面板 "You are being rescued"（受控跌价场景启动）
- **限价单成交转持仓**：Positions(1) · Open Orders 3→2。持仓 SOL **Long 190.5481 SOL · 100.01x · Entry 104.96** · Size Value $20,046.03 · Margin 199.99 USDC · Funding −$0.011
- **冻结扣款 215.05 平账** ✓✓：= Margin 199.99 + 开仓费 15.00（0.075%×20,000）+ relay ~0.06，分毫吻合（拍26 挂账即销）
- **SOL 一拍内 105.2 → 104.41（−0.75%）**：疑受控价格注入。oracle 104.41 已低于 Est.Liq 104.51 → 15 分钟保护期内不清算，保护面板显示 **"You are being rescued" · 100.01x · PnL −$103.92 (−51.95%) · 倒计时 14:41**（rescue 态复现，本班第 1 次）
- 持仓核对：PnL −103.92 vs 推导 (104.41−104.96)×190.5481=−104.80（差 0.88，疑 mark 口径/时点差）；−51.95%=−103.92/199.99 ✓；**Net Value 81.07 = 199.99 − 103.92 − 15.00（预估平仓费）** 精确 ✓；Size Value 20,046.03 与 entry×token=20,001.87 差 +44.16 **口径待核（挂账 g）**
- Open Orders 剩 2 条：应为 TP 105.7 / SL 105.6（SL 提交时高于 oracle 105.2，前端仅红字提示未拦截——**SLACCEPT-009 复现：可带非法 SL 提交**；两单实际类型待切页签验证是否又被转向）
- 表单残留 TP/SL 面板刷新为 TP +112.75% Est.PnL +$224 / SL +103.19%（相对新 oracle 104.41 两者均在上方，红字仍在）

## 22:04:36 实测 · R2 · 拍28 Open Orders 明细捕获：**TPSL-007 复现3（镜像形态：SL 被转为第二条 TP）**
- 执行人切至 Open Orders 页签，2 条挂单全貌（同组时间戳 22:01:12，与限价开仓同时提交）：
  1. `Take Profit · Close Long $20,000 · 190.5481 SOL · Trigger $105.7 · Trigger: Oracle ≥ 105.7 · Pending`（用户原意 TP ✓）
  2. `Take Profit · Close Long $20,000 · 190.5481 SOL · Trigger $105.6 · Trigger: Oracle ≥ 105.6 · Pending`（**用户提交的是 SL 105.6**，提交时高于 oracle 105.2 → 后端按触发方向归类为第二条 **Take Profit**）
- **缺陷模式三证坐实**：复现2 为 TP(低于现价)→SL；本次为 SL(高于现价)→TP，镜像对称。结论：后端以"触发价 vs 现价的方向"决定单据类型（≥ 现价即 TP、≤ 现价即 SL），完全覆盖用户语义；前端红字提示但不拦截提交（SLACCEPT-009）
- 挂单 Token Size = 190.5481（实际持仓量，非 Size/价格 派生值——与 History 派生口径不同，Open Orders 用真实量 ✓）
- 持仓续恶化：oracle 104.29 · PnL −$127.33（−63.66%）· rescue 倒计时 13:02——保护期内跌破清算价不清算持续验证中

## 22:05:49 实测 · R2 · 拍29 订单编辑（E2E-EDIT）：被转向的 TP 105.6 → 改为 104.5，Edit 重建时间戳复验
- 挂单变化：`105.6 (22:01:12)` 一条消失，出现 `Take Profit · Trigger $104.5 · Oracle ≥ 104.5 · Pending · 时间戳 2026-08-28 22:04:32`；另一条 105.7 (22:01:12) 未动
- **Edit=撤旧建新（新时间戳）** 三班结论复验 ✓；编辑后 104.5 高于现价 103.98，仍为合法 TP 方向，类型保持 Take Profit
- 余额 97,559.07 → **97,559.05（−0.02）**：编辑动作产生的微量扣费（疑 relay fee，挂账 h 待终态平账）
- 持仓：oracle 103.98 · PnL **−$186.26（−93.13%）** · rescue 倒计时 12:08 —— 已近 −100%（穿仓边缘），保护期内仍不清算；**疑受控跌价瞄准"保护期内穿仓"深度场景**，密切跟拍

## 22:11:44 实测 · R2 · 拍36 SOL 仓位被编辑后的 TP@104.5 触发平仓；执行人切至 ETH 市场
- **平仓确认**：Positions(0) · Open Orders(0)；余额 97,559.05 → **97,661.63（+102.58 回款）**。触发时点介于拍35（22:07 oracle 104.49）与拍36 之间，oracle 短暂 ≥104.5 即触发（现价已回落 104.02——受控价格拉回）
- **回款反推执行价 ≈ 104.53**：回款 102.58 = margin 199.99 + rawPnL − closeFee 15 → rawPnL ≈ −82.4 → 执行价 ≈ 104.53（vs 触发 104.5，正向偏移 +0.03，TP 语义"≥触发价成交"✓，方向正确）；**待 History 回填执行行核对**
- 本仓全链路平账：97,774.12 → −215.05（开仓组）→ −0.02（编辑）→ +102.58（平仓）= **97,661.63 ✓**；净损 112.49 = 开费15 + 平费15 + rawPnL ~82.4 + relay ~0.1
- **类型修正（重要）**：Orders History 回填显示 22:01:12 开仓行为 **`Market Open Long $20,000 · Entry 104.96 · Fee $15 · Executed`** —— 拍27 记的"限价成交"实为**市价单经 keeper 延迟执行**（提交后 Open Orders 短暂显示 3 条含 pending 市价单）；拍26/27 相应表述以本条为准
- **History 回填滞后再现（IDXLAG-005 同类）**：两条 TP 显示 `105.7 · Created` / `105.6 · Created`（Token Size 189.2148/189.3939 = 20,000/触发价 派生 ✓ 口径d）；**105.6→104.5 的编辑行、104.5 的 Executed 行、105.7 的 Cancelled 行均未回填**，Created 为陈旧状态——回填时刻待跟踪
- UI 细节挂账 i：切至 ETH 市场后表单 TP/SL 输入残留 SOL 数值（"TP 105.7 / SL 105.6 · On"跨市场残留）
- 执行人现于 **ETH 市场**（oracle 2,485.68），疑准备空头链路（ETH 100x 上限、保护面板显示 56.08x 默认杠杆）

## 22:14:06 实测 · R2 · 拍38 ETH 市价开多组已提交：$10,000 · ~56x · TP 2480 / SL 2460（合法配置对照组）
- 余额 97,661.63 → **97,478.27（−183.36 = Pay 183.32 + relay ~0.04）**；Open Orders(3)（市价 pending + TP + SL），Positions(0) 待 keeper 执行
- 本组为**合法 TP/SL 对照组**：提交时 oracle ~2,472-2,477，TP 2480 在上、SL 2460 在下，皆合方向（与 SOL 组的非法 SL 形成对照，验证正常路径不发生类型转向）
- 预览留档：Collateral 178.32 · Est. exec 2,473.85 · Liq 2,443.34（−1.23%）· **ETH 费率 0.05%**（=$5，与 SOL 0.075% 不同市场费率）· Price Impact 0.0554%

## 22:15:12 实测 · R2 · 拍39 ETH 市价成交；**对照组验证通过：合法 TP/SL 类型不发生转向**
- Positions(1) · Open Orders(2)：`Stop Loss · Close Long $10,000 · 4.035 ETH · Trigger $2,460 · Oracle ≤ 2,460 · Pending` + `Take Profit · $2,480 · Oracle ≥ 2,480 · Pending`（22:13:30）
- **关键对照结论**：TP 在上/SL 在下的合法配置下，两单类型与用户语义一致（SL 保持 Stop Loss、触发方向 ≤）——与 SOL 组（非法侧被重归类）对比，TPSL-007 根因锁定为"以触发价与现价的相对方向强制归类"，合法路径无恙
- 保护面板 "You are protected" 14:22 · PnL −$5.59（−3.13%）；由 PnL 反推 entry ≈ 2,478.3（与 Est. exec 2,478.29 吻合）；持仓明细行待执行人切 Positions 页签补录

## 22:16:28 实测 · R2 · 拍40 Orders History 回填观察：编辑行替换原行但沿用原组时间戳；终态回填滞后计时中
- SOL 组回填变化：`105.6 · Created` 行已被 **`104.5 · Created`（Token Size 191.3876 = 20,000/104.5 派生 ✓）** 替换——但 History 行时间戳仍挂 **22:01:12**，而 Open Orders 中编辑后显示 22:04:32 → **History 与 Open Orders 的时间戳口径不一致（History=原组时间，Open Orders=编辑时间），挂账 j**
- **终态回填滞后（IDXLAG 计时中）**：TP@104.5 实际已于 ~22:07-22:08 执行、TP@105.7 已随平仓自动取消，但 History 两行至今（22:16+）仍显示 **Created** —— 滞后已 >8 分钟，等待翻转为 Executed/Cancelled 的时刻
- ETH 持仓存续：oracle 2,472.74 · PnL −$22.54（−12.63%）· protected 13:34 · 挂单 TP2480/SL2460 Pending

## 22:18:28 实测 · R2 · 拍41 ETH TP@2480 触发执行：回款 +183.39 已入账，仓位行残留展示（待下拍确认归零）
- oracle 升至 **2,481.97 ≥ 触发 2480**：Open Orders 0（TP 转执行、SL 自动撤）；余额 97,478.27 → **97,661.66（+183.39）**
- **回款平账 ✓**：183.39 = margin 178.32 + rawPnL − closeFee 5 → rawPnL ≈ +10.07 → **执行价 ≈ 2,480.83**（≥ 触发价 2480，TP 语义正确，正向偏移 +0.83）
- **ETH 组全链路平账 ✓**：97,661.63 → −183.36（开）→ +183.39（平）= 97,661.66（净 +0.03，微差疑 relay 估计差，观察）；本组合法 TP/SL 全生命周期：提交类型不转向 → TP 正常触发 → SL 自动取消
- ⚠️ **UI 残留**：Positions 仍显示 (1) 行 `ETH Long 4.035 · Entry 2,478.33 · PnL +$14.7 · Margin 178.30`（用实时 oracle 计算的活数据）——但回款已入账、挂单已消失 → **平仓后仓位行延迟消失/乐观残留**（与三班"清算前乐观归零"相映成趣，UI 同步缺陷族，挂账 l）；下拍确认归零
- 执行人取证页切至 Trader 地址页 0xEEeA4370...8B119（BaseScan address view）

## 22:19:53 实测 · R2 · 拍42 双收口：ETH 仓位行残留消失（≈1 拍）；SOL 组 History 终态回填完成，执行价 104.53 精确验证
- **挂账 l 收口**：Positions(0) —— 拍41 的仓位行残留仅持续 ~20-30 秒（一拍级 UI 同步延迟，非缺陷级残留，降级为观察项）
- **SOL 组终态回填**（拍40 Created → 本拍终态，回填于 22:16:28-22:20 间落地）：
  1. `TP 104.5 → Entry 104.53 · Fee $15.1528 · Executed` —— **执行价 104.53 与拍36 余额反推值（≈104.53）分毫吻合 ✓✓**（回款公式再获验证）；Token Size 191.3351=20,000/104.53 派生 ✓
  2. `TP 105.7 → Cancelled` ✓（仓位平掉后另一触发单自动取消，与三班 Frozen SL 处置一致）
- **IDXLAG-005 第三例收口**：执行发生 ~22:07-22:08 → 终态回填 22:16:28~22:20 → **滞后 ≈ 9-12 分钟**（订单终态类回填慢于清算行回填 <2 分钟的观测，回填速度按记录类型分层的假设加固）
- 费口径挂账 a 再现：15.1528 / 0.075% = 费基 20,203.7 > 名义 20,000（+1.0%），执行名义口径待与合约核对
- 新计时开启：ETH 22:13:30 组（Market Open / TP Executed / SL Cancelled）尚未出现在 Orders History —— 回填滞后计时中
- 全账户静态：余额 97,661.66 · 无仓无单；两轮 TP/SL 场景（非法转向组 + 合法对照组）均完整闭环

## 22:22:30 实测 · R2 · 拍45 ETH 组 History 初始回填出现（滞后 ~7-9 分钟）；观察工具瞬断一次已恢复
- ETH 22:13:30 组三行现身：`Market Open Long $10,000 · 4.035 ETH · Entry 2,478.33 · Fee $5 · Executed` ✓ + `Stop Loss 2460 · Created`（4.065=10,000/2460 派生）+ `Take Profit 2480 · Created`（4.0323=10,000/2480 派生）
- **合法组类型保持再证**：History 中 SL 仍记为 Stop Loss（未被转向）——TPSL-007 仅发生在"触发价与现价方向冲突"侧
- 初始回填滞后 ≈7-9 分钟（22:13:30 → 22:20-22:22 间出现）；TP Executed / SL Cancelled 终态尚未翻转（Created 陈旧），终态回填计时继续
- 备注：拍44-45 间 Chrome 扩展瞬断一次（~40 秒），重连后无观测缺口影响

## 22:24:11 实测 · R2 · 拍46 ETH 组终态回填完成：TP 执行价 2,480.83 与余额反推分毫吻合（回款公式二连验）
- `Take Profit 2480 → Entry 2,480.83 · Fee $5.0197 · Executed` ✓✓（拍41 反推 ≈2,480.83 精确命中；Token Size 4.0309=10,000/2,480.83 派生 ✓）+ `Stop Loss 2460 → Cancelled` ✓
- 终态回填滞后本例 ≈5-7 分钟（执行 ~22:17-18 → 回填 22:23-24）；费 5.0197 → 费基 10,039.4（0.05%），执行名义（4.035×2,480.83=10,010.1）之上仍 +0.3%，费基口径挂账 a 数据点 +1
- **两组 TP/SL 场景全闭环**（SOL 非法转向组 / ETH 合法对照组），History 三行结构完整、无孤儿行

## 22:31:34 实测 · R2 · 第四班收班（60 拍满）
- 收班快照：余额 **97,661.66** · Positions(0) · Open Orders(0) · 页面 ETH 市场 Orders History 页签；拍42 后执行人无新操作（疑在做记录/复盘），末拍页面后台节流（价格停帧非休眠）；两 BaseScan 取证页：tx 0xab51198f... 与 Trader 地址页
- **本班账本全平**：接班 97,774.12 → SOL 组净损 −112.49（开15+平15.15+rawPnL −82.32+relay ~0.02×2）→ ETH 组净微差 +0.03 → **97,661.66，逐笔分毫可解释，无差额遗留**（三班遗留的"预期余额 97,796±2"问题已被 Round 2 21:34 组的 −31.07 与本班两组损益覆盖解释——21:34 组净 −31.16 推导 vs 交接 −31.07 差 0.09 仍挂账）
- 本班捕获事件链回顾：
  ① IDXLAG-005 收口 ×3：21:34 组回填 ≤10.5 分；SOL 22:01 组终态回填 ~9-12 分；ETH 22:13 组初始回填 ~7-9 分/终态 ~5-7 分（终态类慢于清算行 <2 分，回填速度分层）
  ② **TPSL-007 复现3（镜像）**：SL 105.6 高于现价提交 → 后端转为第二条 TP（Oracle ≥105.6）；与复现2（TP→SL）互为镜像，根因锁定"按触发价 vs 现价方向强制归类"；前端红字提示不拦截（SLACCEPT-009 复现）
  ③ **合法对照组通过**：ETH TP2480/SL2460 全程类型不转向，TP 触发执行 2,480.83（≥2480 ✓），SL 自动取消
  ④ 受控价格场景：SOL 105.2→104 急跌，"You are being rescued" 复现（PnL 最深 −93.13%，保护期内跌破清算价不清算 ✓，接近穿仓未触及）；价格回拉后编辑单 TP@104.5 于 104.53 执行
  ⑤ E2E-EDIT：Edit=撤旧建新（Open Orders 新时间戳 22:04:32）复验 ✓；**History 侧编辑行沿用原组时间戳 22:01:12（口径不一致，挂账 j）**
  ⑥ 回款公式两连验：SOL 回款 102.58 反推执行价 104.53、ETH 回款 183.39 反推 2,480.83，均与 History 回填的 Entry 分毫吻合
  ⑦ UI 观察：平仓后 Positions 行残留 ~20-30 秒（拍41→42，一拍级，观察项 l）；跨市场表单 TP/SL 输入残留（挂账 i）
- 存疑挂账（本班新增/更新）：a) 费基恒大于名义（15.1528/20,000=+1.0%、5.0197/10,000=+0.4%，随执行名义走，待与合约费基核对） g) 持仓行 Size Value 与 entry×token 差 +44（仅拍27 一见，未复现） h) 编辑动作扣费 0.02 已并入总账平掉 j) History/Open Orders 编辑时间戳口径不一 i/l) UI 残留类两项
- 网络：拍10/20/50 检查全 200；Chrome 扩展瞬断一次（拍44-45 间 ~40 秒）无观测缺口
- 未观察到：空头开仓（计划中的空头镜像链路本班未执行——执行人以两组多头 TP/SL 转向验证收束 Round 2 相关目标）；空头镜像断言（清算价在上/资金费收取/TP<现价合法）**留待下一班**

## 22:37:08 实测 · R2-5 · 接班（第五班）：基线核对一致；交接项①勘误——payout 183.39 已入账，无待跳变
- 接班快照：余额 **97,661.66** · Positions(0) · Open Orders(0) · ETH 市场（oracle 2,504.94，价格流更新中非停帧）· Trade History 页签；两 BaseScan 取证页未动
- **交接项①勘误**：交接称"payout 183.39 回显滞后中、实际应 ≈97,845"——经与四班拍41 对照，97,478.27 + 183.39 = **97,661.66 已于 22:18:28 入账**，97,845 预期系将 payout 重复计算（97,661.66 + 183.39）。当前余额即全平终态，**不存在待观察的跳变**；若后续余额确跳 97,845 则推翻此判断（连续观察数拍验证）
- 交接项②确认闭环：22:13 组三单 History 初填（四班拍45，滞后 ~7-9 分）与终态回填（拍46，TP Entry 2,480.83 / Fee $5.0197 / SL Cancelled）均已落地，本班首拍复核三行仍在、数据未变 ✓
- 自 22:18（四班拍42）起执行人无新操作，静默计时约 20 分钟；按班规连续 20 拍全静默且无仓无单可提前收班

## 22:40:20 实测 · R2-5 · 拍5 执行人复盘浏览：Trade History 仓位级数据现身，Closed PnL 公式验证 + 四班三笔挂账收口
- 执行人 22:39 起恢复活动：Positions（空）→ Trade History 页签逐页浏览（复盘取证，无新下单）；余额 97,661.66 稳定不变——**接班勘误确认：payout 已入账，无 97,845 跳变**（交接项①按勘误关闭）
- **Round 2 三组仓位级行首次回填可见**（执行时刻精确到秒，补齐 keeper 延迟数据）：
  1. `22:14:16 ETH Open 2,478.33 $10,000 fee $5`（提交 22:13:30 → 执行 22:14:16，keeper 延迟 ~46s）
  2. `22:17:22 ETH Close 2,480.83 $10,000 fee $5.0197 · Closed PnL +$5.07`（TP 执行时刻实证 22:17:22，四班拍41 估计 ~22:17-18 ✓）
  3. `22:02:22 SOL Open 104.96 / 22:09:50 SOL Close 104.53 · Closed PnL −$97.42`；`21:35:34 SOL Open 105.2 / 21:35:44 Close 105.03 · Closed PnL −$23.53`
- **Closed PnL 口径验证 ✓（三连）**：Closed PnL = (exit−entry) × closeTokenSize − closeFee（**不含开仓费**）
  · ETH：(2,480.83−2,478.33)×4.0309 = 10.08 − 5.0197 = **5.06 ≈ 5.07** ✓
  · SOL 22:01 组：−0.43×191.3351 = −82.27 − 15.1528 = **−97.42 分毫吻合** ✓（rawPnL 用平仓行 Token Size，非开仓行）
  · SOL 21:34 组：−23.53 与费口径自洽 ✓
- **四班挂账收口 ×2**：
  · 21:34 组差额 0.09 挂账关闭：净损 = ClosedPnL −23.53 − openFee 7.5 − relay ~0.04 = **−31.07 与交接分毫吻合**（四班 −31.16 系 rawPnL 估算偏差）
  · ETH 组"微差 +0.03"关闭：+5.07 − 5(openFee) − relay ~0.04 = **+0.03 精确成立**
- SOL 22:01 组账本复核：−97.42 − 15 − relay ~0.07 = −112.49 与四班账本一致 ✓

## 22:50:40 实测 · R2-5 · 第五班提前收班（静默 20 拍规则触发）：执行人已停止操作
- 收班快照：余额 **97,661.66** · Positions(0) · Open Orders(0) · 页面 ETH 市场 Orders History 页签（oracle ~2,503.9，价格流正常）；两 BaseScan 取证页未动
- 时间线：22:37 接班 → 22:39-22:41 执行人短暂活动（Positions → Trade History → Orders History 三页签复盘浏览，无任何下单/编辑/撤单）→ 22:41 起连续 20 拍（约 7 分钟）全静默，判定执行人已收工
- 本班共 26 拍，实质记录 2 条（接班勘误 + 拍5 Closed PnL 三连验与挂账收口）；网络检查 2 次（拍10/21）全 200，无扩展断连
- 本班关键产出：
  ① 交接项①勘误关闭：payout 183.39 已于 22:18 入账（97,845 预期系重复计算），本班 26 拍余额恒为 97,661.66 佐证
  ② Closed PnL 口径确立：= (exit−entry)×平仓行 TokenSize − closeFee（不含开仓费），ETH/SOL 三组分毫验证
  ③ 四班挂账二连收口：21:34 组 0.09 差额（实为 −31.07 分毫平）、ETH 组 +0.03 微差（5.07−5−relay 精确成立）
  ④ keeper 执行时刻补齐：ETH 开仓 22:14:16（延迟 46s）、TP 平仓 22:17:22
- 未观察到（顺延交接下一班/次日）：空头镜像链路（开空清算价在上、空头 TP<现价合法性、空头触发单 acceptablePrice=MaxUint256）、订单编辑复验、非法方向提交 TPSL-007 追加素材——Round 2 以两组多头 TP/SL 对照验证收束，执行人未再开新链路
- 全天账本状态：97,661.66 全平无差额遗留；仅存量挂账 a（费基>名义 +0.3~1.0%，待与合约费基口径核对）与 j（History/Open Orders 编辑时间戳口径不一）

## 00:15:05 · R2-6 · 开班首拍：挂单 2→4 条，执行人已追加第二对 TP/SL（TP@2490 / SL@2420）
- 第六班（Round 2 续）开班，tabId 1810810510 确认；页面 Oracle 2,445.99（标题拍到 2,446.97→2,445.99，行情仍偏弱）。
- **挂单列表 4 of 4**（交接基线只有 00:12:12 的 TP@2478/SL@2430 一对）：
  - 00:13:34 Take Profit Close Long $10,000 / 4.0847 ETH @ $2,490，Trigger: Oracle ≥ 2,490，Reduce-only，Pending —— 新增
  - 00:13:34 Stop Loss Close Long $10,000 / 4.0847 ETH @ $2,420，Trigger: Oracle ≤ 2,420，Reduce-only，Pending —— 新增
  - 00:12:12 Stop Loss @ $2,430（Oracle ≤ 2,430）Pending —— 原对照组
  - 00:12:12 Take Profit @ $2,478（Oracle ≥ 2,478）Pending —— 原对照组
- 语义观察：两对 reduce-only TP/SL 均登记全仓 4.0847 ETH，合计挂单名义 2× 持仓。**触发次序推演**：多仓下跌先到 2,430（内层 SL）→ 若全平成功，外层 SL@2420 与两条 TP 应 AUTO_CANCEL（或触发时因仓位为 0 而作废）；上涨先到 2,478（内层 TP）。本班新增核对点：第二对单在首单全平后的清理行为。
- 持仓面板：PnL −$8.74（−0.87%），保护倒计时 13:21，"You are protected / No liquidation for 15 mins after initial open"仍在。
- 距离核对（现价 2,445.99）：SL@2430 −0.65%、SL@2420 −1.06%、TP@2478 +1.31%、TP@2490 +1.80%。下行触发概率仍最高。
- 余额 96,656.60（交接 96,656.63，−0.03 疑似资金费/展示刷新，观察）。

## 00:17:27 · R2-6 · 触发前置景：Oracle 跌至 2,439.19，距内层 SL@2430 仅 −0.38%
- 5 拍走势：2,445.99 → 2,445.91 → 2,443.40 → 2,443.87 → 2,442.27 → 2,439.19，单边下行。
- 持仓 PnL −$36.53（−3.65%），保护倒计时 10:30，余额 96,656.60 稳定。
- 4 条挂单全部 Pending 未动。若跌破 2,430：预期内层 SL 触发全平（执行价按 Oracle、long 平仓 acceptable 哨兵=0 无滑点拒绝风险），回款 = Margin 1,000 + ClosedPnL（(exit−2,448.13)×4.0847 − 平仓费 exit×4.0847×0.05%）；另外 3 条（TP@2478、TP@2490、SL@2420）预期 AUTO_CANCEL。开始逐拍紧盯。

## 00:20:30 · R2-6 · 执行人切 Positions 页签：持仓明细快照与 Net Value 守恒核对 PASS
- 底部面板从 Open Orders 切到 Positions（执行人操作，观察者未触碰页面）。Oracle 2,442.98。
- 持仓行：ETH 10x Long 4.0847 ETH · Value $9,975.79 · Entry 2,448.13 · PnL −$21.07（−2.10%）· Liq $2,216.8（保护倒计时 07:36）· Margin 999.95 · Net 973.88 · Funding −$0.0523。
- **核对 1（Margin 扣资金费）**：1,000 − 0.0523 ≈ 999.95 ✓（资金费从 Margin 显示中扣减）。
- **核对 2（Net Value 公式）**：Net = Margin + PnL − 平仓费预扣 = 999.95 − 21.07 − 9,975.79×0.05%(≈4.99) = 973.89 ≈ 973.88 ✓（±0.01 舍入）。
- **核对 3（PnL）**：(2,442.98−2,448.13)×4.0847 = −21.04 ≈ −21.07（价格拍差内）✓。
- 观察项：Value $9,975.79 ÷ 4.0847 = 2,442.23，与同屏 Oracle 2,442.98 存在 ~0.75 的取价滞后（Value 列用稍旧价），与既往"多处取价不同拍"现象一致，不判缺陷。
- 4 条挂单（切页签前一拍确认）仍 Pending；余额 96,656.60。

## 00:22:08 · R2-6 · 重大：执行人提交巨额加仓市价单 Open Long $85,708.83 / 35.0194 ETH（00:21:18，Pending）
- Open Orders 4→5：新增 2026-08-29 00:21:18 Market · Open Long · $85,708.83 · 35.0194 ETH · Reduce-only=No · Pending（待 keeper 执行）。
- 页面 Oracle 2,446.03；85,708.83 ÷ 35.0194 ≈ 2,447.46（含点差/预估执行价口径）。
- 余额 96,656.60 → 96,656.59（−0.01，疑似资金费；市价单尚未成交、保证金未见扣减）。
- **待核对（成交后）**：
  1) 仓位合并：4.0847 + 35.0194 ≈ 39.1041 ETH，新 Entry 应为两次开仓的加权均价；
  2) 保证金扣减与开仓费（0.05% ≈ $42.85）+ Relay fee；
  3) 原 4 条 reduce-only TP/SL 登记的 Token Size 仍是 4.0847 ETH —— 加仓后变成部分平仓单，观察其 Size 字段是否跟随仓位刷新（已知口径：应保持登记值）；
  4) 保护倒计时语义：当前剩 06:02，加仓是否重置 15 分钟保护（"after initial open"字面上不重置）—— 本班重点 ② 的活体样本；
  5) 加仓后 10x→杠杆变化：若未同步补足保证金，合并杠杆将显著高于 10x，Liq 价将大幅上移，脱离"无清算压力对照"。

## 00:23:33 · R2-6 · 加仓成交：仓位并至 ~39.1041 ETH，杠杆 100.01x，保护倒计时不重置（关键语义证据）
- 市价单从 Open Orders 消失（5→4），保护面板徽章 ETH 10x → **100.01x**，PnL −$182.61（−19.08%），Oracle 2,441.99。
- **推导链（全部页面数据自洽）**：
  1) 新混合 Entry ≈ 2,446.67：由 TP/SL 行 Token Size 4.0847→**4.0872**（=$10,000÷2,446.67）反推 —— 证实触发单登记面额是 USD Size，Token Size 列按当前仓位 Entry 派生显示，加仓合并后自动刷新；
  2) 由混合 Entry 反推本次加仓实际执行价 ≈ 2,446.49（挂单登记 $85,708.83/35.0194=2,447.46 为含预估口径，实际成交更优，价格正下行）；
  3) PnL 核对：(2,441.99−2,446.67)×39.1041 ≈ −$183.0 ≈ −$182.61 ✓；
  4) PnL% 基数反推 Margin：182.61÷19.08% = 957.1 USDC = 1,000 − 开仓费 42.84（=35.0194×2,446.49×0.05%）− 资金费 ~0.06 ✓ —— **加仓开仓费从 Margin 内扣，余额未动**；
  5) 余额 96,656.59 全程不变 —— 本次 $85.7k 加仓**未追加任何保证金**，names 合并杠杆 (39.1041×2,441.99)/957.1 ≈ 99.8 ≈ 徽章 100.01x ✓（= ETH 市场杠杆上限）。
- **保护语义证据（本班重点②）**：倒计时 06:02（拍 14，加仓前）→ 05:05（拍 15，加仓后）连续递减，**未重置为 15:00** —— "No liquidation for 15 mins after initial open" 的窗口锚定初次开仓，加仓不刷新。
- **风险格局剧变**：估算 Liq ≈ Entry − Margin×(1−清算费余量)/39.1041 ≈ 2,446.67 − ~24 ≈ **~2,423**（粗算）；现价 2,441.99 距之仅 ~0.8%。层级：现价 2,442 > SL@2430 > Liq~2,423 > SL@2420。保护窗剩 ~5 分钟，窗口结束后若价格击穿将出现"SL 与清算赛跑"，SL@2420 已在清算线之下（预期永远轮不到）。
- 四条 reduce-only 单现在均为部分平仓（4.0872/39.1041 ≈ 10.45%），触发后不再全平 —— 之前"另一对 AUTO_CANCEL"推演需改写：部分平仓后仓位仍在，其余触发单预期保留。

## 00:24:30 · R2-6 · 保护机制实弹触发：面板文案 "You are protected" → "Successfully rescued"（倒计时 03:44 续走）
- Oracle 跌至 2,438.30，PnL −$326.97（−34.16%），保护面板显示 **"Successfully rescued"** —— 100.01x 仓位的清算条件已在保护窗口内被满足，系统未清算而是"救回"。本班重点②从对照组变成实弹样本。
- 清算线复推（用 10x 基线反推的维持保证金率 ~0.55% 名义）：equity=957−(2,446.67−P)×39.1041 ≤ ~526 → P_liq ≈ **2,435.6**。两拍间隔中 Oracle 低点未知，但现价 2,438.3 已一度逼近/击穿该线附近，与"rescued"文案一致（页面数据为准，precise liq 待链上核对）。
- 倒计时 03:44 仍在递减（未因 rescue 重置）。窗口预计 ~00:28 前后结束；届时若 equity 仍低于维持线，预期立即可被清算 —— 接下来 4 分钟是本班最高优先观察段。
- 层级刷新：现价 2,438.3 → SL@2430（−0.34%）→ Liq~2,435.6（已在 SL 之上！）：**清算线高于内层 SL** —— SL@2430 已在清算线下方，若保护窗结束时价格 < 2,435.6，清算将先于 SL 触发（keeper 顺序竞争样本）。SL@2420 更无意义。
- 4 挂单仍 Pending（Token Size 4.0872 不变）；余额 96,656.59 不变。

## 00:25:20 · R2-6 · 救援进行时："You are being rescued"（02:51）· PnL −95.13% · SL@2430 被置为 Frozen
- Oracle 暴跌至 **2,423.38**（上拍 2,438.30，~30 秒 −0.6%）。PnL −$910.54（−95.13%，基数 957.2 ✓），equity 仅剩 ~$46.7 —— 常规语义下早已过清算线，但保护窗内未被清算。
- 保护面板文案第三态：**"You are being rescued"**（倒计时 02:51 续减）。已观测状态机：You are protected → Successfully rescued → You are being rescued —— 疑似"救援完成"与"救援进行中"两种子状态随价格反复穿越清算线切换。
- **关键：SL@2430（00:12:12）状态 Pending → "Frozen"**。Oracle 2,423.38 < 2,430，触发条件已满足，但订单未执行、被标记 Frozen —— 保护/救援期间平仓触发单被冻结的实证。SL@2420（2,423.38 > 2,420 未触及）与两条 TP 仍 Pending。
- 待核对：Frozen 的准确语义（救援窗口冻结 reduce-only 触发单 vs 其它原因）；救援结束后该单是恢复 Pending、立即执行、还是作废 —— 逐拍盯。
- 下单表单侧证：SL 预设 2430 相对现价出现 "+2.30% Stop Loss price should be below oracle price" 校验报错（现价已低于预设 SL），表单校验实时联动 ✓。
- 徽章 100.01x→100.02x；余额 96,656.59 不变；窗口预计 ~3 分钟后结束，届时若 equity 仍 <维持线：清算 vs Frozen SL 解冻的优先级是本班最高优先观察点。

## 00:26:04 · R2-6 · 双 SL 全部 Frozen，equity 转负（−117.83%），保护窗剩 01:59
- Oracle 2,417.83（续跌）。SL@2420 触发条件亦满足（2,417.83 ≤ 2,420）→ 状态同样置 **Frozen**。现在两条 SL 均 Frozen、两条 TP 仍 Pending —— 冻结与"触发条件已满足"强相关，TP（条件未满足）不受影响。
- PnL −$1,127.74（**−117.83%**）：equity = 957.2 − 1,127.7 ≈ **−$170.5，已穿仓**。保护窗内不清算的实现方式 = 连触发平仓单一并冻结（否则 SL 执行等效于绕过保护抢先离场？待链上确认设计意图）。
- 注意：SL 若在 2,430 正常执行，损失约 −$654；冻结导致损失扩大至穿仓 —— **保护机制此场景下反而放大亏损**（对用户而言"保护"变"禁止止损"）。记为潜在产品语义问题候选：SCN-B32/OC 系列关联，待提缺陷讨论。
- 倒计时 01:59。窗口结束瞬间的清算顺序、坏账处理（equity<0 由谁兜底）、Frozen 单去向为接下来核心观察。余额 96,656.59 不变。

## 00:27:14 · R2-6 · 第四态 "You'll be liquidated"（00:49）+ Add Margin 补救入口出现
- Oracle 反弹至 2,421.24，PnL −$994.28（−103.88%），equity 仍负（~−$37）。保护面板文案切换为 **"You'll be liquidated"**，并出现 **USDC 输入框 + Add Margin 按钮**（保护窗内自救通道）。
- 已观测保护面板完整状态机：You are protected → Successfully rescued → You are being rescued → **You'll be liquidated**（随 equity/价格实时切换）。
- 两 SL 仍 Frozen、两 TP 仍 Pending；余额 96,656.59 不变（执行人未注资）。
- 窗口剩 ~49 秒。若到点时 equity < 维持线 → 预期清算（清算费 0.3%、Frozen 单去向、坏账兜底为核对点）；若执行人 Add Margin 或价格回到 ~2,435+ → 逃逸。读秒紧盯。
- 网络抽查：请求缓冲仅剩 1 条 pending 的 open-interest 轮询（缓冲疑似页面周期清理），无交易签名请求 —— 执行人截至此拍未点 Add Margin。

## 00:28:43 · R2-6 · 保护窗到期：未清算（价格反弹自救），仓位标记 Liquidatable/Expired，Net 回正 +412.01
- 窗口到期瞬间 Oracle 恰好反弹 2,422.25 → **2,433.95**，PnL 收敛至 −$496.90（−51.91%），Net Value 由 −45.86 回正至 **+412.01**。**清算未发生**。
- 仓位行 Liq. Prot. 列显示 **"Liquidatable / Expired"** —— 保护已过期且仓位仍处可清算判定（equity 412 仍低于维持线 ~526 估算），keeper 随时可执行清算；能否逃逸取决于价格是否先回到 ~2,436+。
- 保护面板小组件回落 idle 态（"ETH 10x / Trade now / 15:00 / PnL --"）—— 面板是"下一笔交易"的推广组件与活跃仓位状态解耦，仓位级状态移到 Positions 行内展示。
- 精确数据修正（以 Positions 行为准）：仓位 **39.1182 ETH**（此前按挂单显示 35.0194 推 39.1041 偏小：实际成交 tokens = $85,708.83 ÷ 实际执行价 2,446.48 = 35.0335）；Entry **2,446.65**；Margin **956.76**；Funding −$0.3199（注意较上拍 −0.3313 略回落，资金费显示存在回摆，观察）。
- Net Value 核对：956.76 − 496.90 − 94,706.97×0.05%(=47.35) ≈ 412.51 vs 显示 412.01（差 ~0.5，含资金费与取价拍差，量级 ✓）。
- 悬念保留：两条 Frozen SL 的解冻行为 —— 当前价 2,433.95 已回到 2,430 上方（SL@2430 触发条件不再满足），Frozen 是否回 Pending 待下拍切 Open Orders 时核对。

## 00:30:22 · R2-6 · 清算终局：00:29:10 Liquidated @2,430.82 · Fee $335.3839 · Closed PnL −$954.78 · 四挂单全清 · 余额回款 +2.21 —— 全链路对账 PASS
- Positions (0)、Open Orders (0)。Trade History 三行本仓生命周期：
  1) 00:12:44 Open Position @2,448.13 · $10,000 · Fee $5；
  2) 00:22:08 **Increase Leverage** @2,446.48 · $85,708.83 · Fee $42.913（前端将无追加保证金的加仓归类为 Increase Leverage；执行价 2,446.48 与本班拍 15 由 TP/SL Token Size 反推值完全一致 ✓）；
  3) 00:29:10 **Liquidated** @2,430.82 · $95,708.83 · Fee $335.3839 · Closed PnL **−$954.78**。
- **Fee 对账**：平仓费 95,708.83×0.05% = 47.85 + 清算费 95,708.83×0.3% = 287.13 + 资金费 ~0.42 = 335.40 ≈ 335.38 ✓（±0.02）。
- **Closed PnL 对账**：价差 (2,430.82−2,446.65)×39.1182 = −619.24；−619.24 − 335.38(费) = −954.62 ≈ −954.78 ✓（±0.16，资金费拍差）——口径与既往一致：Closed PnL 含费不含开仓费。
- **回款对账**：余额 96,656.59 → **96,658.80**（+2.21）；理论残值 = Margin 956.76 − 954.78 = 1.98 ≈ 2.21（±0.23，资金费/舍入）✓ —— 穿仓未发生在最终结算点（清算价 2,430.82 时 equity 尚余 ~2），无坏账。
- **重点①终局判定（清算变体）**：两条 Frozen SL + 两条 Pending TP 在清算后**全部自动消失**（Open Orders 0）—— 清算清理所有 reduce-only 触发单 ✓；Frozen 单未在解冻后执行（价格 00:29 前曾回到 2,430 上方使 SL@2430 条件解除，但清算先落地）。
- 时间线注记：拍 23（约 00:30 前后采样）仍显示持仓行，为页面轮询滞后于 00:29:10 链上清算所致，滞后 <1 分钟，符合"清算回填 <2min"口径。
- 结论：**Liquidation Protection 全状态机 + 100x 清算全链路一次性拿全**（protected → Successfully rescued → being rescued → You'll be liquidated → Expired/Liquidatable → Liquidated），数值三方对账全部 PASS。唯一产品语义疑点保留：保护窗内 SL Frozen 导致用户无法止损、损失从 −$654 量级扩大至 −$954.78（见前拍记录，建议提缺陷/设计确认）。

## 00:31:22 · R2-6 · Orders History 终态确认：4 触发单全 Cancelled；Token Size 三处派生口径厘清
- Orders History（执行人切页签）本仓生命周期 7 行：Open@2,448.13(4.0847,Executed) → 2×TP/2×SL(Cancelled) → Increase@2,446.48($85,708.83, **35.0335 ETH**,Executed；与拍 22 推导一致 ✓) → Liquidation@2,430.82($95,708.83,Executed)。
- **触发单终态 = Cancelled**（非 AUTO_CANCEL 独立态、非 Frozen 残留）：清算后所有 reduce-only 触发单统一 Cancelled ✓。Frozen 只是运行态，终态收敛正确。
- **Token Size 派生口径三处不同（记录备查，均非缺陷但易踩坑）**：
  1) Open Orders 列表：$Size ÷ 当前仓位 Entry（随加仓合并实时刷新，4.0847→4.0872）；
  2) Orders History 触发单行：$Size ÷ 触发价（4.0161=10000/2490、4.1322=10000/2420、4.0355=10000/2478、4.1152=10000/2430 ✓）；
  3) Orders History 清算行：$Size ÷ 执行价（39.3731=95,708.83/2,430.82），**非实际平仓 tokens 39.1182**（差 0.65%）—— 与 Trade History 对账时须用实际仓位 tokens，勿直接取该列。
- 未见"终态回退 Created"现象（重点④），回填窗口内继续抽查。

## 00:43:16 · R2-6 · 收班：连续 25 拍无变化且无持仓无挂单，提前收班
- 自 Orders History 终态确认（约 00:34）后，执行人无进一步操作；Oracle 在 2,430~2,443 区间震荡，末拍 2,440.40；余额定格 **96,658.80 USDC**；Positions 0 / Open Orders 0。
- 回填复查：清算记录（00:29:10）在 Trade History 与 Orders History 中的数值全程无回填改动，未出现"终态回退 Created"现象（重点④本班未复现）。
- 本班共 51 拍（约 00:15–00:50，一次 8s 紧急补拍），记录 10 条。
- **交接下一班**：账户空仓静默。遗留事项：
  1) 保护窗内 SL Frozen 语义（用户无法止损、亏损从约 −$654 扩大至 −$954.78）建议提缺陷/设计确认，可对照 OC-17 与 SCN-B32 系列；
  2) 清算行 Token Size 列为 $Size÷执行价 的派生值（39.3731 ≠ 实际 39.1182），对账需注意；
  3) BaseScan 标签页（tx 0xab51198f…、地址 0xEEeA4370…4c7c8B119）可用于链上复核本次清算的 fee 路由拆分（0.05% 平仓费 + 0.3% 清算费 + funding ≈ $335.38）与残值回款 2.21。

## 17:29:39 实测 · R3-7 · 接班首拍：Adjust Margin Deposit 100 未见落地；新增 17:25:56 Open Long $0/0ETH（疑似 Reopen）
- **接班基线核对**：Available balance **95,553.78 USDC**（与交接一致，未 −100）→ Adjust Margin Deposit 100 USDC **未确认/未落地**（历史无 Deposit tx，余额未变，Collateral 仍显 $1,000 区）。
- **新 tx（交接后新增）**：Trade History 顶行 `17:25:56 Market ETH Open Long $0 / 0 ETH @ 2,434.29 fee $1.6686 Executed`。size=$0/0ETH，fee $1.6686（待核对费用来源，非 0.05%×0）。疑似"Reopen 保护"动作。
- **持仓卡（Liquidation Protection 面板）**：ETH long **9.1x**；**PnL −$39.29 (−3.57%)**（交接 −37.19，价跌走阔）；保护 **Expired/exposed**（"You are exposed to liquidation. Reopen to get protection back."）；按钮 **Close & Reopen**；Relay fee est ~$0.0526。
- **下单表单（在编，未提交）**：Market/Buy-Long；Pay amount 1,005 USDC；预览 Position size $10,000 / Collateral $1,000 / Est exec $2,434.78 / Est Liq $2,204.69(−9.45%) / Fee(0.05%) −$5 / Price Impact 0.0249% / Max acceptable $2,446.95。TP/SL·On（TP - / SL -）。
- **计数**：Positions(1)、Open Orders(**0**)（交接记 Open Orders(1) TP/SL·On，本拍为 0，待续拍确认是否已撤/成交）。Oracle 2,434.08，24h −2.29%。

## 17:36:56 实测 · R3-7 · 空窗检查点（连续 15 拍无结构变化）
- 17:29–17:36:56 共 15 拍：持仓卡 ETH long 9.1x（价动 9.11x 四舍五入）保护仍 **Expired/exposed**，未点 Close & Reopen、未加/减仓、未挂 TP/SL；下单表单在编未提交（Pay 1,005 USDC）。
- 余额恒 **95,553.78 USDC**；Positions(1)/Open Orders(0)；无新 tx（顶行仍 17:25:56 $0/0ETH）。
- 仅价/PnL 漂移：Oracle 2,434.08→2,435.95，PnL −39.29→−31.65（价升多仓收窄）；Avail Liquidity 11.44M→11.12M。页面 live（价每拍跳），非冻结/休眠。执行人疑似暂离。

## 17:41:45 实测 · R3-7 · 空窗检查点②（连续 25 拍无结构变化，累计约 25 分钟）
- 17:29–17:41:45 持续无操作：ETH long 9.11x 保护仍 Expired/exposed，未 Close & Reopen / 未加减仓 / 未挂 TP-SL；余额恒 95,553.78；Positions(1)/Open Orders(0)；顶行 tx 仍 17:25:56 $0/0ETH（无新交易）。
- 仅价/PnL 漂移：本区间 Oracle 2,436~2,437 窄幅，PnL 约 −26~−29；网络仅 open-interest/tickers(84532)+Tenderly 只读轮询，无下单/提交。页面 live 未冻结。
- 判定：因持仓仍在，不触发"25 拍空仓提前收班"；继续按节奏轮询。

## 17:48:37 实测 · R3-7 · 空窗检查点③（连续 40 拍无结构变化，约 40 分钟）
- 17:29–17:48:37 持续无操作：ETH long 9.11x 保护 Expired/exposed，未 Close & Reopen / 未加减仓 / 未挂 TP-SL；余额恒 95,553.78；Positions(1)/Open Orders(0)；顶行 tx 仍 17:25:56 $0/0ETH。
- 仅价/PnL 窄幅漂移：Oracle 2,435~2,437，PnL 约 −26~−34；网络仅 candles/tickers/open-interest(84532)+perf/client 遥测+Tenderly 只读轮询，无下单/提交。页面 live 未冻结。执行人仍疑似暂离。

## 17:55:27 实测 · R3-7 · 空窗检查点④（连续 55 拍无结构变化，约 55 分钟）
- 17:29–17:55:27 持续无操作：ETH long 9.11x 保护 Expired/exposed，未 Close & Reopen / 未加减仓 / 未挂 TP-SL；余额恒 95,553.78；Positions(1)/Open Orders(0)；顶行 tx 仍 17:25:56 $0/0ETH。
- 仅价/PnL 窄幅漂移：本区间 Oracle 2,435~2,437，PnL 约 −29~−34；网络周期性 tickers/open-interest(84532)+Tenderly 只读轮询，无下单/提交。页面 live 未冻结。执行人仍未回。

## 18:02:19 实测 · R3-7 · 【观察】前端价格显示冻结 ≥6 拍（feed 停更，非页面休眠）
- 连续 6 拍（约 2 分钟）整页价格数值 **逐位相同**：Oracle **2,436.15** / BTC 77,667.83 / SOL 103.45 / SUI 0.7366 / 24h vol 137.11M / OI 46.96M·42.84M / Avail 11.12M；持仓卡 PnL 恒 **−$30.83**、Est exec 2,436.82、Liq 2,206.54 也随之冻结（派生自冻结的 oracle）。四资产 80 秒同时逐位不动，非正常行情静止。
- **网络证据（区分休眠 vs feed 停更）**：冻结期 read_network_requests 仅见 `base-sepolia.gateway.tenderly.co` RPC POST（14 条全 200）在持续发；此前拍存在的 `fx100-dev.vercel.app/api/prices/tickers|open-interest|candles` GET 轮询**在本区间缓冲区消失**。→ 标签页未休眠（链上读仍活跃），是**前端价格 tickers feed 停更/卡住**导致展示层冻结。
- 业务态未变：余额 95,553.78；Positions(1)/Open Orders(0)；顶行 tx 仍 17:25:56 $0/0ETH。执行人仍未回。
- 交接提示：若下一班仍冻结，建议对该前端"价格 feed 是否会自恢复/需刷新"记一条待验；本班只读，未刷新页面。

## 18:06:58 实测 · R3-7 · 收班（本班 ~77 拍，17:29–18:06:58）
- **全班无测试动作**：接班时执行人在 Adjust Margin 弹窗（拟 Deposit 100，未确认），此后整班未再操作——未确认存/取保证金、未 Close & Reopen、未加减仓、未挂/撤 TP-SL、未开空。业务态自始至终：余额 **95,553.78 USDC**、Positions(1)（ETH long 9.11x 保护 Expired/exposed）、Open Orders(0)、顶行 tx 恒为 17:25:56 $0/0ETH。**接班重点①②③④均无从核对（无对应操作发生）**。
- **前端价格显示冻结（未恢复）**：约 18:00 起连续 ≥14 拍价格数值逐位冻结（Oracle 2,436.15 等），至收班仍未恢复；网络证据表明为**前端 tickers feed 停更**（fx100-dev GET 轮询消失），非标签页休眠（Tenderly RPC 仍活跃）。详见 18:02 条。
- **待下一班**：①若价格仍冻结，验该 feed 是否自恢复/需刷新（本班只读未刷新）；②Adjust Margin Deposit 100 是否会被执行人重启并落地（届时核对 New Margin~1,098.34 / Lev~9.10x / Liq~2,188.73 / 余额−100+relay）；③保护 Expired 的 exposed 仓后续处置（Close & Reopen / 平仓 / 减仓）。

## 18:38:00 实测 · R3-8空头 · 接班基线
- Oracle ETH 2,436.38 · 24h -2.33% · Funding/h +0.0022%/-0.001%
- 现持仓 Positions(1)：Long 4.0922 ETH / $9,969.29 / Entry 2,443.68 / Oracle 2,436.38 / PnL -$29.9 (-2.99%) / Liq $2,213.23 / 保护 Expired / Margin 998.07 / Net 963.17 / Funding -$0.0202 / 10.02x
- 余额 95,653.76 USDC
- 下单区已切 Sell/Short：ETH $3,000/10x · Collateral $300 · Est.exec $2,436.28（<oracle 2,436.38，卖 bid 减点差✓）· Est.Liq $2,666.5（+9.45% from entry，entry 上方✓空头镜像）· Min acceptable $2,424.09 · Fee 0.05% -$1.5 · Pay 301.50 · Reduce-only OFF · 尚未点 Open Short
- 本班重点：Short 提交后 Positions 是否 1→2（独立空头仓 vs 净额减多头）

## 18:48:45 实测 · R3-8空头 · 【事件】Short 已提交（Pending）
- Open Orders 0→(1)：2026-08-29 18:48:04 · Market · ETH · Open Short · Size $3,000 · Token Size 1.2313 ETH · Trigger - · Reduce Only No · Status **Pending**
- 余额 95,653.76 → 95,352.25 USDC（Δ −301.51 ≈ Pay 301.50，含 collateral 300+fee 1.5+relay）
- Positions 仍 (1)：多头未动，空头仓待成交（订单 Pending，未生成第二仓）
- Open Interest 53%/47% → 52%/48%（空头侧上升）· Oracle 2,436.42
- Token 1.2313 ETH @ $3,000 → 隐含 entry ≈ 2,436.4（≈oracle）
- 待观察：Pending→Filled 后 Positions 是否 1→2（独立空头仓 vs 净额减多头）

## 18:50:46 实测 · R3-8空头 · 【关键事件】Short 成交 → Positions 1→(2) 多空并存确认
- Open Orders (1)→(0)：Pending 单已 Filled（提交 18:48:04，约 18:49:xx 成交，keeper 延迟约 1.5 拍）
- **Positions 计数 (1)→(2)**：首要观察结论 = **同 ETH 市场多空并存为独立两仓，非净额抵消多头**（多头 4.0922 ETH 不变，空头 1.2313 ETH 独立新建）
- 余额维持 95,352.25（成交不再扣款，开仓时已预扣）
- Oracle 2,436.51 · OI 回到 53%/47%
- 注：当前面板停在 Open Orders 标签（空），两仓明细行不在 DOM；只读不可切标签，待测试人员切回 Positions 再采集两仓 Direction/Size/Entry/Liq/Margin

## 18:51:47 实测 · R3-8空头 · 空头开仓成交核对（两仓明细）+ 空头镜像断言判定
两仓并存明细（Positions(2)）：
- **空头[新]** ETH 10x · Short 1.2313 ETH · Value $3,000.07 · Entry **2,436.43** · Oracle 2,436.54 · PnL **-$0.14 (-0.04%)** · Est.Liq **$2,666.67** · 保护 **倒计时 13:49 MIN:SEC（激活，非 Expired）** · Margin 300 · Net **298.36** · Funding -<$0.01
- 多头[存] ETH 10.02x · Long 4.0922 ETH · Value $9,970.09 · Entry 2,443.68 · Oracle 2,436.54 · PnL -$29.23 (-2.92%) · Est.Liq $2,213.24 · 保护 Expired · Margin 998.02 · Net 963.79 · Funding -$0.0716

空头镜像断言判定（本班核心）：
- ①清算价方向：空头 Est.Liq 2,666.67 **在 entry 2,436.43 上方**（+9.45%，涨则爆）✓ 与多头 Liq 在下方 2,213.24 镜像成立
- ②Entry<Oracle：空头 entry 2,436.43 < 成交时 oracle ~2,436.51（卖 bid 减点差）✓
- ③acceptable 方向：下单区取 **Min acceptable**（下界 $2,424.xx）✓ 与多头 Max 相反
- ④PnL 符号：现价 2,436.54 略高于 entry 2,436.43 → 空头小额浮亏 -$0.14 ✓（价涨空头亏，符号相反正确）
- ⑤多空并存：**独立两仓 1→2 已确认**（非净额抵消）✓
- ⑥Fee/余额：Fee 0.05%=-$1.5，余额 -301.5 ✓；Margin=collateral 300 ✓
- ⑦Net 核对：300 - PnL0.14 - 平仓费1.5 = **298.36** ✓（平仓费=0.05%×3000=$1.5，非固定$5）
- 注：新仓获清算保护倒计时窗口（多头侧已 Expired），符合新开仓保护期机制

## 18:52:31 实测 · R3-8空头 · 多空并存浮盈亏符号相反（同 oracle 下行）实证
- Oracle 2,436.54 → **2,435.75**（下行 -0.79）
- 空头 PnL -$0.14 → **+$0.83 (+0.27%)**（价跌转浮盈✓）· Net 298.36→299.33 · 保护倒计 12:45
- 多头 PnL -$29.23 → **-$32.45 (-3.25%)**（价跌浮亏加深✓）· Net 963.79→960.57
- 判定：同一 oracle 变动下两仓 PnL **符号相反**，本班重点④确认；空头 Entry/Size/Liq 均不变

## 19:05:43 实测 · R3-8空头 · 空头清算保护倒计时归零→Expired
- 空头保护：18:50 开仓时 13:49 倒计时 → 本拍 **Expired**（保护窗口约 15 分钟走完，与多头 Expired 一致）
- 两仓现均 Liq Prot = Expired · Oracle 2,435.16（回升）· 空头 PnL +$1.56 / Net 300.07 · 多头 PnL -$34.87
- 期间 30+ 拍测试人员未对任一仓做 TP/SL / 减仓 / 平仓 / 触发单动作，仅持仓观察行情下行

## 19:09:38 实测 · R3-8空头 · 收班交接（第八班结束）
本班 69 拍（约 23 分钟）· 记录 6 条 · Feed 全程活（3 次 network 检查均 prices/tickers + open-interest GET 200 + Tenderly RPC POST 200，无 PRICEFREEZE）
**关键事件线**：18:48:04 提交 Short → 约 18:49 Pending → **Positions 1→(2)** 成交（多空并存独立两仓）→ 空头保护倒计时 15min → 约 19:05 Expired → 此后 40 拍测试人员零操作，持双仓观望
**收班快照（Oracle 2,434.62 · 余额 95,352.25 · Positions(2) · Open Orders(0)）**：
- 空头 ETH 10x · Short 1.2313 ETH · Entry 2,436.43 · PnL +$2.23(+0.74%) · Liq 2,666.67 · 保护 Expired · Margin 300.01 · Net 300.73 · Funding +<$0.01
- 多头 ETH 10.02x · Long 4.0922 ETH · Entry 2,443.68 · PnL -$37.09(-3.71%) · Liq 2,213.26 · 保护 Expired · Margin 997.95 · Net 955.87 · Funding -$0.1385
**空头镜像六断言全部 PASS**（清算价上方 / entry<oracle / Min acceptable 下界 / 价涨空头亏符号相反 / 多空并存独立仓 / Net=Margin+PnL−平仓费1.5）
**未覆盖（交接下一班）**：空头 TP/SL（TP<现价·SL>现价合法性）、空头减仓、空头平仓成交、空头触发单 acceptablePrice=MaxUint256 —— 本班测试人员均未发起

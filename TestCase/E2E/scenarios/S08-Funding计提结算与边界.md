---
project: fx100
layer: e2e
contractRelease: shared
suite: S08
title: Funding 计提、结算与边界
cases: 8
status: draft
---

# S08 Funding 计提、结算与边界

**目标**：补齐 Funding 从 OI/EMA 得到 factor，按秒计提，在仓位动作中结算，最终影响抵押、到账、LP 路由和清算的完整用户级链路。

**阅读前置**：[Funding 机制说明与测试矩阵](../05-Funding机制说明与测试矩阵.md)。

**主要依据**：`MarketUtils.getNextFundingAmountPerSize`、`ExponentialMovingAverage`、`PositionPricingUtils.getFundingFees`、部署 Funding 参数快照和页面字段计算公式。

## 必做边界数据

| 组 | 数据集 | 判定要点 |
|---|---|---|
| OI | 双边 0、仅 Long、仅 Short、Long=Short | 零 OI 无经济累计；单边不除零；均衡时 Long 仍可支付 Floor |
| Factor 符号 | Skew `-1/0/+1`，Long 翻转点 `boundary-ε/boundary/boundary+ε` | 正 factor=付，负 factor=收，页面符号可翻转但经济方向不能反 |
| Clamp | Long Min/Max、Short Min/Max 各做阈值 `±ε` | 阈值外不得超出配置 Min/Max |
| 时间 | `0/1/3599/3600/3601s`；突变 Skew 前后 | 按秒计提；1h 无离散扣费跳变；EMA 平滑收敛 |
| 结算 | 应付/应收 × 加仓/存保证金/取保证金/手动部分平/手动全平/TP/SL/清算/ADL | 18 个仓位路径组均结算且不重复；纯订单改撤不结算 |
| 取整 | per-size 差 `0/1/整除/余数`；Oracle `min=max/min<max` | 应付 ceil + `price.min`；应收 floor + `price.max` |
| 清算 | Funding 侵蚀后剩余抵押恰好等于门槛、少 `1` 个 USD(1e30) 原始单位 | 等于按合约不等号判断；越界后才可清算 |

## 场景用例

| ID / 优先级 | 角色与意图 | 前置条件 | 测试数据 | 用户操作步骤 | 核对数据与期望结果 | 恢复与清理 |
|---|---|---|---|---|---|---|
| SCN-073 / P0 | 新用户确认零 OI 等待不会让首仓背负历史 Funding | 市场 Long/Short OI=0；可推进时间 | 零 OI 后推进 1 天；分别首次开多/开空 | 1. 记录 per-size/updatedAt/账本；2. 推进 1 天；3. 首次开仓；4. 核对 PositionFees 和仓位基准；5. 在相同时间戳/0s fixture 立即平仓作对照 | 零 OI 期间无 per-size 经济增量/资金流，即使 updatedAt/零值事件变化也不误判；首仓 `negative/positiveFundingFeeAmount=0`，基准对齐市场最新值；不追溯收取 1 天 Funding | 全平并恢复市场零 OI |
| SCN-074 / P0 | 交易员判断什么时候 Long/Short 支付或获得 | 可控 OI 和 EMA Skew；固定 Funding 参数快照 | Skew `-1/0/+1`；Long 翻转点 `-floor/base` 的 `±ε`；ETH 代表 `+20%/-5%/-20%` | 1. 每组设置 OI/EMA；2. 读 Long/Short factor；3. 查页面小时费率；4. 推进固定时间并结算两侧仓位 | Factor 与 `floor+base×skew` / `-base×skew` 一致；合约正=付、负=收；均衡时 Long 支付 Floor/Short=0；`-5%` 可出现两侧同付；翻转点两侧的符号和页面文案正确 | 每组独立快照回滚 |
| SCN-075 / P0 | 测试工程师区分按秒计提和 1h EMA 平滑 | 可推进区块时间；可固定或突变 Raw Skew | A 稳定 factor：`0/1/3599/3600/3601s`；B EMA 从 0 突变至 `+100%` | A 每个时点读 pending/per-size；B 突变 OI 后在同时刻、1s、3599s、3600s、3601s 读 EMA/factor；各时点核对 UI | 稳定 factor 下 Funding 与秒数成比例，`0s=0`；3600s 不发生一次性扣费；突变同时刻不直接跳到新 Raw Skew，之后连续单调收敛；页面倒计时如有不得暗示离散收费 | 恢复时间/OI/EMA |
| SCN-076 / P0 | 测试工程师验证四个 Factor Clamp 边界 | 可控 EMA Skew 到 `1e18` 精度；已读当前 floor/base/min/max | Long Max/Min、Short Max/Min 阈值；每个 `boundary-ε/boundary/boundary+ε` | 1. 按当前配置动态解四个阈值；2. 注入每组 EMA；3. 执行 Funding 更新；4. 比较原始公式值、Clamp 值、事件和 UI | 阈值内等于原始公式；命中或越过后精确等于 min/max，不得继续超界；等号和 `±ε` 行为与 `clamp` 一致；改配置后 UI 不使用旧缓存 | 恢复全部 Funding 参数/EMA |
| SCN-077 / P0 | 交易员验证所有仓位动作都只结算一次 Funding | 可分别制造应付/应收 Funding；每组使用独立仓位 | 2 个费用方向 × 加仓、追加保证金、提取保证金、手动部分平、手动全平、TP、SL、Liquidation、ADL，共 18 组；改/撤单作反例 | 每组：1. 记录仓位/市场基准和 pending；2. 执行动作；3. 核对抵押/到账/事件；4. 同时刻再做一次零增量动作；5. 反例只改/撤未执行订单 | 应付从抵押/输出扣除，应收增加抵押/输出；部分平先结算整个旧仓自上次基准以来的 Funding，剩余仓基准刷新；紧接着再动作 Funding=0；改/撤单不刷新仓位基准；强平与 ADL 的历史/事件能区分原因 | 每组全平/清单 |
| SCN-078 / P0 | 账本测试工程师验证 Funding 取整和 LP 资金路由 | 专用 fork/fixture；可控 per-size 差、sizeInTokens 和 collateral min/max | 差值 `0/1`、整除/有余数；`min=max/min<max`；`positionPaysLp >0/=0/<0` | 1. 独立 BigInt 计算 ceil/floor；2. 执行仓位动作；3. 核对 PositionFees、抵押、PositionVault/LPVault、claimable Funding；4. 对照 UI/Reader 舍入 | 应付使用 `price.min` 向上取整，应收使用 `price.max` 向下取整；零差无资金流；`positionPaysLp>0` 增加 Funding claimable，`<0` 发生 LPVault→PositionVault，`=0` 无净路由；容差只能用于已定义的显示舍入 | 快照回滚并恢复 Oracle |
| SCN-079 / P0 | 高杠杆用户确认价格不变也可因 Funding 进入清算 | 固定 index/collateral 价格；应付 Funding；可精确推进时间 | 剩余抵押恰好等于清算门槛，再少 `1` 个 USD(1e30) 原始单位；`graceEnd-1/graceEnd/graceEnd+1` | 1. 建高杠杆仓位并固定价格；2. 推时间到 Funding 边界；3. 同时点读 pending/有效抵押/清算资格；4. 再推越一单位；5. 验证保护期并由 keeper 清算 | 价格 PnL=0 但负 Funding 使有效抵押下降/杠杆上升；恰好等于门槛时按合约当前 `<` 口径不误清算，少一原始单位后进入可清算；保护期内不执行，到期后清算账本含 Funding | 清仓并恢复风险/Funding 参数 |
| SCN-080 / P0 | 交易员确认 Funding 页面符号、口径、历史和市场隔离 | 同账户 ETH/WBTC 仓位；一侧应付、另一侧应收；Reader/事件可读 | 合约正/负 factor；小时费率；pending 正/负/零；结算前后 | 1. 核对页头多/空费率；2. 查持仓 Funding、PnL、Est. Receive；3. 只对 ETH 做仓位动作；4. 查 Funding 历史/事件；5. 切 WBTC/账户/语言后复查 | 页面如翻转符号，必须保持“负=付、正=收”文案一致；小时换算准确；PnL 不含 Funding，Est. Receive/有效抵押包含；结算后新 pending 从新基准起算；ETH 动作不改 WBTC 仓位基准，切账户不闪现前账户数据 | 全平两市场并恢复页面设置 |

## 执行约束

- SCN-074 必须使用 EMA Skew，不得用当前 Raw Skew 直接代替预期值。
- SCN-075 要分开“固定 factor 下的按秒累计”和“Raw Skew 突变后的 EMA 收敛”，不得用一组数据同时断言两个命题。
- SCN-076 四个 Clamp 阈值必须用执行时链上参数动态计算，不得硬编码本文档的 ETH 快照百分比。
- SCN-077 的 18 个结算组是必做子项；首次开仓的无历史费用基准由 SCN-073 单独覆盖。Liquidation 与 ADL 必须分开取证；如页面不直接支持系统路径，可使用可控 fork 完成资金动作，页面仍需验证最终仓位和历史回显。
- 每个结算用例至少保留：区块时间、Long/Short OI、Raw/EMA Skew、四个 Funding 参数、两侧 factor、市场/仓位 per-size、PositionFees、Reader、tx 和页面截图。

## 套件退出条件

- Factor 符号、Long 翻转和四个 Clamp 边界均有 `±ε` 证据；
- 零 OI、首仓基准、按秒计提和 EMA 平滑全部完成；
- 18 个仓位动作结算组、首次开仓基准和改/撤单反例全部完成；
- 支付/获得取整、LP 三路由、Funding-only 清算和页面符号均有双源/多源证据；
- 所有测试仓位已平，Funding/OI/EMA/Oracle/风险参数已恢复。

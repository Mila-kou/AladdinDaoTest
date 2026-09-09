# FX100 用户旅程 E2E 设计索引

> 固定范围：SCN-001～SCN-080，共 80 条。本文只维护用例名称、优先级和设计入口，不记录任何版本的 PASS/FAIL/PENDING、证据或执行人。版本适用性、期望差异与执行结果见 [`versions/`](versions/README.md)。

| ID | 套件 / 场景 | P | 设计文档 |
|---|---|---|---|
| SCN-001 | S01 首次进入并判断数据可信 | P0 | [S01](scenarios/S01-交易准备与首单.md) |
| SCN-002 | S01 错误网络与安全切链 | P0 | [S01](scenarios/S01-交易准备与首单.md) |
| SCN-003 | S01 钱包连接与协议披露 | P0 | [S01](scenarios/S01-交易准备与首单.md) |
| SCN-004 | S01 筛选可交易市场 | P1 | [S01](scenarios/S01-交易准备与首单.md) |
| SCN-005 | S01 Standard 第一笔市价开仓 | P0 | [S01](scenarios/S01-交易准备与首单.md) |
| SCN-006 | S01 Flash 同意、连接与首单 | P0 | [S01](scenarios/S01-交易准备与首单.md) |
| SCN-007 | S01 刷新与重开恢复上下文 | P1 | [S01](scenarios/S01-交易准备与首单.md) |
| SCN-008 | S01 切账户的数据与授权隔离 | P0 | [S01](scenarios/S01-交易准备与首单.md) |
| SCN-009 | S02 市价开多快速退出 | P0 | [S02](scenarios/S02-策略下单与订单管理.md) |
| SCN-010 | S02 现价下方限价开多 | P0 | [S02](scenarios/S02-策略下单与订单管理.md) |
| SCN-011 | S02 现价上方限价开空 | P0 | [S02](scenarios/S02-策略下单与订单管理.md) |
| SCN-012 | S02 突破追多 | P0 | [S02](scenarios/S02-策略下单与订单管理.md) |
| SCN-013 | S02 破位追空与 validFrom | P0 | [S02](scenarios/S02-策略下单与订单管理.md) |
| SCN-014 | S02 触发价与成交价差异 | P1 | [S02](scenarios/S02-策略下单与订单管理.md) |
| SCN-015 | S02 多头开仓时同时附带 TP/SL，TP 先触发 | P0 | [S02](scenarios/S02-策略下单与订单管理.md) |
| SCN-016 | S02 多头开仓时同时附带 TP/SL，SL 先触发并限制损失 | P0 | [S02](scenarios/S02-策略下单与订单管理.md) |
| SCN-017 | S02 修改触发价与规模 | P1 | [S02](scenarios/S02-策略下单与订单管理.md) |
| SCN-018 | S02 主动撤单与退款 | P0 | [S02](scenarios/S02-策略下单与订单管理.md) |
| SCN-019 | S02 市价滑点取消退款 | P0 | [S02](scenarios/S02-策略下单与订单管理.md) |
| SCN-020 | S02 Freeze 与 Oracle Revert | P0 | [S02](scenarios/S02-策略下单与订单管理.md) |
| SCN-021 | S03 新仓成交与风险核对 | P0 | [S03](scenarios/S03-仓位管理与退出.md) |
| SCN-022 | S03 PnL 与 Est. Receive | P0 | [S03](scenarios/S03-仓位管理与退出.md) |
| SCN-023 | S03 分批止盈退出 | P0 | [S03](scenarios/S03-仓位管理与退出.md) |
| SCN-024 | S03 紧急全部平仓 | P0 | [S03](scenarios/S03-仓位管理与退出.md) |
| SCN-025 | S03 同方向加仓 | P1 | [S03](scenarios/S03-仓位管理与退出.md) |
| SCN-026 | S03 追加保证金降风险 | P0 | [S03](scenarios/S03-仓位管理与退出.md) |
| SCN-027 | S03 提取部分/全部保证金 | P0 | [S03](scenarios/S03-仓位管理与退出.md) |
| SCN-028 | S03 调整目标杠杆 | P1 | [S03](scenarios/S03-仓位管理与退出.md) |
| SCN-029 | S03 仓位更新结算 Funding | P1 | [S03](scenarios/S03-仓位管理与退出.md) |
| SCN-030 | S03 空头正 Funding 部分平仓 | P0 | [S03](scenarios/S03-仓位管理与退出.md) |
| SCN-031 | S03 ETH/BTC 仓位隔离 | P0 | [S03](scenarios/S03-仓位管理与退出.md) |
| SCN-032 | S03 USD/Token Mode 等价 | P0 | [S03](scenarios/S03-仓位管理与退出.md) |
| SCN-033 | S04 理论 100x 与真实 buffer | P0 | [S04](scenarios/S04-风险自救保护与强平.md) |
| SCN-034 | S04 最小抵押/仓位门槛 | P0 | [S04](scenarios/S04-风险自救保护与强平.md) |
| SCN-035 | S04 清算区精确补保证金 | P0 | [S04](scenarios/S04-风险自救保护与强平.md) |
| SCN-036 | S04 危险区足额部分减仓 | P0 | [S04](scenarios/S04-风险自救保护与强平.md) |
| SCN-037 | S04 清算区紧急全平 | P0 | [S04](scenarios/S04-风险自救保护与强平.md) |
| SCN-038 | S04 清算区限制操作 | P0 | [S04](scenarios/S04-风险自救保护与强平.md) |
| SCN-039 | S04 保护期与刷新连续性 | P0 | [S04](scenarios/S04-风险自救保护与强平.md) |
| SCN-040 | S04 加仓不延长保护期 | P0 | [S04](scenarios/S04-风险自救保护与强平.md) |
| SCN-041 | S04 保护期触线后恢复 | P0 | [S04](scenarios/S04-风险自救保护与强平.md) |
| SCN-042 | S04 保护期到期边界 | P0 | [S04](scenarios/S04-风险自救保护与强平.md) |
| SCN-043 | S04 USDC 脱锚风险 | P0 | [S04](scenarios/S04-风险自救保护与强平.md) |
| SCN-044 | S04 ADL 用户可见结果 | P0 | [S04](scenarios/S04-风险自救保护与强平.md) |
| SCN-045 | S05 均衡市场 Funding floor | P1 | [S05](scenarios/S05-长持费用价格冲击与多市场.md) |
| SCN-046 | S05 拥挤/轻侧 Funding | P1 | [S05](scenarios/S05-长持费用价格冲击与多市场.md) |
| SCN-047 | S05 长持 Funding 侵蚀 | P0 | [S05](scenarios/S05-长持费用价格冲击与多市场.md) |
| SCN-048 | S05 小单/大单价格冲击 | P1 | [S05](scenarios/S05-长持费用价格冲击与多市场.md) |
| SCN-049 | S05 浅流动性极端冲击 | P0 | [S05](scenarios/S05-长持费用价格冲击与多市场.md) |
| SCN-050 | S05 改善/恶化失衡对比 | P1 | [S05](scenarios/S05-长持费用价格冲击与多市场.md) |
| SCN-051 | S05 OI/储备上限 | P0 | [S05](scenarios/S05-长持费用价格冲击与多市场.md) |
| SCN-052 | S05 BTC 全链路精度 | P0 | [S05](scenarios/S05-长持费用价格冲击与多市场.md) |
| SCN-053 | S06 Flash 连续交易 | P0 | [S06](scenarios/S06-Flash异常恢复与兼容.md) |
| SCN-054 | S06 Standard/Flash 切换 | P1 | [S06](scenarios/S06-Flash异常恢复与兼容.md) |
| SCN-055 | S06 consent 版本升级 | P0 | [S06](scenarios/S06-Flash异常恢复与兼容.md) |
| SCN-056 | S06 Cancel All 原子撤单 | P0 | [S06](scenarios/S06-Flash异常恢复与兼容.md) |
| SCN-057 | S06 断开与撤销交易密钥 | P0 | [S06](scenarios/S06-Flash异常恢复与兼容.md) |
| SCN-058 | S06 到期/持久化/多设备 | P1 | [S06](scenarios/S06-Flash异常恢复与兼容.md) |
| SCN-059 | S06 Relay/Keeper 超时幂等 | P0 | [S06](scenarios/S06-Flash异常恢复与兼容.md) |
| SCN-060 | S06 Oracle/Sequencer 故障恢复 | P0 | [S06](scenarios/S06-Flash异常恢复与兼容.md) |
| SCN-061 | S06 RPC/拒签恢复 | P1 | [S06](scenarios/S06-Flash异常恢复与兼容.md) |
| SCN-062 | S06 Indexer 最终一致性 | P1 | [S06](scenarios/S06-Flash异常恢复与兼容.md) |
| SCN-063 | S06 移动端核心旅程 | P2 | [S06](scenarios/S06-Flash异常恢复与兼容.md) |
| SCN-064 | S06 多语言与账户隐私 | P2 | [S06](scenarios/S06-Flash异常恢复与兼容.md) |
| SCN-065 | S07 市价开空与平空 | P0 | [S07](scenarios/S07-订单类型全矩阵.md) |
| SCN-066 | S07 空头止盈 LimitDecrease | P0 | [S07](scenarios/S07-订单类型全矩阵.md) |
| SCN-067 | S07 空头止损 StopLossDecrease | P0 | [S07](scenarios/S07-订单类型全矩阵.md) |
| SCN-068 | S07 多空强平与 ADL 区分 | P0 | [S07](scenarios/S07-订单类型全矩阵.md) |
| SCN-069 | S07 四类触发单多空精确边界 | P0 | [S07](scenarios/S07-订单类型全矩阵.md) |
| SCN-070 | S07 市价四象限可接受价 | P0 | [S07](scenarios/S07-订单类型全矩阵.md) |
| SCN-071 | S07 触发单改撤冻结与重试 | P0 | [S07](scenarios/S07-订单类型全矩阵.md) |
| SCN-072 | S07 多空仓位同时附带 TP/SL 时的 reduce-only 与 autoCancel | P0 | [S07](scenarios/S07-订单类型全矩阵.md) |
| SCN-073 | S08 零 OI 与首仓 Funding 基准 | P0 | [S08](scenarios/S08-Funding计提结算与边界.md) |
| SCN-074 | S08 Funding Factor 方向与翻转 | P0 | [S08](scenarios/S08-Funding计提结算与边界.md) |
| SCN-075 | S08 按秒计提与 1h EMA | P0 | [S08](scenarios/S08-Funding计提结算与边界.md) |
| SCN-076 | S08 Long/Short Factor Clamp 边界 | P0 | [S08](scenarios/S08-Funding计提结算与边界.md) |
| SCN-077 | S08 全仓位动作 Funding 结算 | P0 | [S08](scenarios/S08-Funding计提结算与边界.md) |
| SCN-078 | S08 Funding 取整与 LP 路由 | P0 | [S08](scenarios/S08-Funding计提结算与边界.md) |
| SCN-079 | S08 Funding-only 清算边界 | P0 | [S08](scenarios/S08-Funding计提结算与边界.md) |
| SCN-080 | S08 Funding 页面与市场隔离 | P0 | [S08](scenarios/S08-Funding计提结算与边界.md) |

## 使用规则

- 用例步骤与通用期望只在 `scenarios/` 维护；用例 ID 不随合约版本变化。
- 合约版本改变通用期望时，写入对应版本的 `expectation-overrides.md`。
- 某版本独有的用例写入对应版本的 `cases/`，不扩充本表。
- 执行结果只写入对应版本的 `results.md` 或其链接的结果快照。

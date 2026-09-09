# FX100 fx100-dev 测试覆盖度 · web 端里程碑（切移动端前收口）

- **范围**：https://fx100-dev.vercel.app 交易页人工冒烟（web/桌面 Chrome）
- **测试账户**：`0xEEeA43701a49F3d41EF694DdAFe2Ac74C7C8B119`（owner；Flash 子账户 `0x1446bf6F3E60a14E423C9D15328F83f11657cb92`）
- **基线**：`fx100-contracts@release-v0.3.1` 部署（260729）· Base Sepolia 84532
- **周期**：2026-08-28 ~ 08-30（Round 1/2/3 + 08-30 续测），逐笔核对 OPERATION-LOG LOG-001~076
- **结论速览**：核心交易机制（开/平/加减仓/杠杆/保证金/触发单/TP-SL/保护/清算/费用/PnL/清算价/多空镜像）**已链上级覆盖并核对**；出 **18 张缺陷单**（其中 open S2×5）；真缺口集中在 **纯 Limit 真成交、买侧限价、Standard 双模式、行情K线域、若干控件细节**。

---

## 一、用例三层来源与回填状态

| 层 | 来源 | 条数 | 回填 |
|---|---|---|---|
| A 控件底座 | `TestCase/E2E/FX100-Trade页面功能测试用例.md` | 54（选40/排14） | CHECKLIST 11 PASS，另 ~10 有 LOG 证据待回填、~21 未执行 |
| B 交易场景 v1 | `TRADE-CASES.md`（PROT×6/POS×8/EDIT×3/LMT×7） | 24 | 08-30 回填 LMT-004/005、POS-006（发出+字段正确口径 PASS）；余多数🟡有证据待回填 |
| C 组合矩阵 v2 | `TestCase/E2E/manual-cases/v2/CMB-LONG.md` | 26+10 | 0 正式回填（部分自然实验覆盖；C-004/005/007 旧"无证据"标注已过时） |

> 验收口径（执行人 2026-08-30 明确）：**限价单只要前端能真实发出、链上每个字段填写正确，即算功能覆盖 PASS**，不强制等真实成交（成交与否取决于行情到没到触发点）。

---

## 二、按功能域覆盖矩阵

✅=核心断言已 PASS/链上铁证｜🟡=部分/有证据待正式回填｜⬜=盲区｜❌=已发现缺陷

| 功能域 | 状态 | 证据 / 缺陷 |
|---|---|---|
| 市价开仓 | ✅ | 真实开多/开空多次（LOG-002/005/008/039/058） |
| 平仓（全平/部分/仅减仓） | ✅ | LOG-003/021/023/066/067；资金零缺口闭环 |
| 加减仓 | ✅❌ | LOG-005/043/060/061；**BUG-012** 加仓后 TP/SL 不放大致 SL 失效（S2） |
| 杠杆调整（=市价加/减仓） | ✅ | LOG-042/060（弹窗全字段 + 升杠杆费从保证金扣） |
| 保证金调整（存/取） | ✅ | LOG-050~056/065（双向 + 超100x 拦截全验） |
| **触发式入场单（Limit/Stop）** | ✅（发出+字段）🟡（纯 Limit 真成交） | LOG-068~071/076：LimitIncrease(1)/StopIncrease(6) 派生+字段全对；**Stop 入场真成交样本**（LINK 12:35:28）；**BUG-016**（挂单页类型错标 + 编辑跨市价致自冻，S2） |
| **TP/SL（平仓触发单）** | ✅ | LOG-062~064/072/074/075/076：类型/方向/哨兵；**SL 真实触发执行**（ETH 多头 12:36:22）；**BUG-017**（表单按 Market 派生边界 SL↔TP 翻转，S2）、**BUG-018**（平空哨兵非规范，S3） |
| 免清算保护 | ✅ | LOG-002/008/016/025/026/028/058：激活/救援/清算/面板六态/per-position 独立 |
| 清算 | ✅ | **6 例真实清算**（BTC/LINK/SOL×2/ETH 穿仓/隔夜空头 LOG-073）；orderType=5 + LiquidationHandler `0x40a99db1` 铁证；清算费 0.3% 三市场同率、残值返还、insolvent 禁手动平仓 |
| 费用/资金费/PnL/**清算价** | ✅✅ | 口径钉死；**清算价核对方法已源码级固化进 fx100-verify-handbook §9**（闭式+两法+陷阱+file:line）；费率 0.05%/0.075% 按市场 |
| 多空镜像 | ✅ | 空头全链路（LOG-057~067）；触发单/TP-SL 方向镜像 |
| 编辑弹窗 | 🟡❌ | 改触发价✓（LOG-022/027/033/069）；**改数量/非法值待**；**BUG-014**（编辑破坏哨兵）、BUG-016 症状B |
| 行情/K线 | ⬜❌ | 几乎空白；**BUG-015** 价格 feed 停更冻结不自恢复（S3） |
| **Standard / One-Click 双模式** | 🟡 | **Standard 切换正常、有 3 笔真实 Standard 交易**（owner `0xEEeA…B119` 直签：市价开空 + StopIncrease + LimitIncrease，08-29 19:59~20:21，LOG-078）；One-Click/Flash 26 笔（子账户）。**待补**：受控差分/计数/跨模式穿插（A-006/007/C-008）。链上区分法：Standard=tx.from 为 owner、无 IncrementSubaccountActionCount；Flash=relayer 提交 + 子账户增量 |

---

## 三、18 张缺陷单一览（`TestCase/E2E/bugs/v0.3.1/`）

| # | 标题要点 | 级别 | 状态 |
|---|---|---|---|
| RELAY-001 | （既存）relay 相关 | — | — |
| MKTURL-002 | 切回市场 URL 不随动 | S3 | open（疑被 004 修复覆盖，待确认） |
| OI-003 | OI 显示 | — | open |
| MKTBOUNCE-004 | 市场选择回弹 | — | **已修复** |
| IDXLAG-005 | TP/SL 状态更新滞后 | — | open |
| PROTPANEL-006 | 保护面板 | — | open |
| **TPSL-007** | 开仓附带非法 TP 静默转 SL | **S2** | open |
| TOOLTIP-008 | tooltip | — | open |
| SLACCEPT-009 | SL acceptablePrice 冻结 | S2 | **已修复** |
| ORDHIST-010 | 订单历史 | — | open |
| MINOUT-011 | 最小产出 | — | open |
| **TPSLSIZE-012** | 加仓后 TP/SL 不放大致 SL 冻结 | **S2** | open |
| **POSCARD-013** | 加仓后持仓卡陈旧 | **S2** | open |
| EDITACCEPT-014 | 编辑破坏 acceptablePrice 哨兵 | — | open |
| PRICEFREEZE-015 | 价格 feed 停更冻结 | S3 | open |
| **STOPTYPE-016** | 触发入场单类型错标 + 编辑跨市价致自冻 | **S2** | open |
| **TPSLREF-017** | reduce-only TP/SL 表单按 Market 派生致边界 SL↔TP 翻转 | **S2** | open |
| ACCEPTSENTINEL-018 | 平空触发单 acceptablePrice=MaxUint256/1e18 非规范 | S3 | open |
| STICKYHEADER-019 | 订单表格表头未固定、滚动丢列义（UX 建议） | S4 | open |

**open S2×5**（007/012/013/016/017）—— 均"前端触发单/TP-SL 的类型派生/显示/字段"层，链上核心语义本身正确。

---

## 四、明确盲区（⬜，web 端仍需补）

1. ~~纯 Limit(ot1)/LimitDecrease(ot3=TP) 真成交~~ ✅ **已闭合（2026-08-30 LOG-077）**：LimitIncrease 入场（14:12 LINK 开多 exec 11.419，tx `0xd575e0ba`）+ LimitDecrease TP 平仓（13:42 LINK 平空 exec 11.414，tx `0xa20100d4`）均真成交；**至此 7 类 orderType(0-6) 全部有真成交铁证**。
2. ~~买侧限价（LMT-001/003）~~ ✅ **已闭合**：LINK Buy-Limit(下方=LimitIncrease)/Buy-Stop(上方=StopIncrease) 发出+字段核过、四象限收口（LOG-077）。
3. **Standard 双模式**（A-006/007/C-008）：~~零证据~~ **已纠正（LOG-078）**——Standard 切换正常、有 3 笔真实 Standard 交易（owner 直签，08-29）；仅**受控差分/计数/跨模式穿插**待补，非"无交易"。
4. **行情/K线域**（TRD-011/012/025）：几乎未测。
5. **保护倒计时三时点同屏一致性**（PROT-002）、**编辑改数量/非法值**（EDIT-001/003）、**限价预览锚定**（LMT-007）。
6. **控件交互细节**（A/B 段）：**大部分已在交易中实操覆盖（执行人 2026-08-30 确认，LOG-079）**——买卖切换（TRD-013，每笔多/空必用）、杠杆快捷按钮+滑块（TRD-018/020，10x/75x/100x 实操）、市价/限价切换（TRD-021）、订单预览动态更新（TRD-022）、TP/SL 开关（TRD-031）、底部标签+空态（TRD-040，"No open orders"等）、标准/Flash 入口（TRD-046=LOG-078）均在下单流程中被行使。**仅少数纯边界/设置项无专门证据**（如已顺带做过可回填，否则单列补测）：数量非法字符/超额（TRD-016）、杠杆手输越界（TRD-019）、市场收藏（TRD-010）、计价单位切换（TRD-014）、语言/格式/重置设置（TRD-047/048）。
7. **缺陷复测**：007/012/013/015/016/017/018/MKTURL-002。

---

## 五、链上取证资产（可复用）

- 脚本：会话 scratchpad `forensics-stop.mjs`（只读 EventEmitter `0x8f00…b380` 全事件解码，RPC sepolia.base.org）；产物 `stop-orders.json`/`tpsl-order.json`/`liq-scan.json`/`trades-scan.json`。
- 关键地址：EventEmitter `0x8f00eBF8f571557685eEeAA2807Ecac396c3b380`、LiquidationHandler `0x40a99db1ba2f9c73c2beeb11e3e4e1635c8c4139`；orderType 枚举权威 `src/order/Order.sol`。
- 清算价/费用/哨兵口径：fx100-verify-handbook（§9 已含清算价核对法）。

---

## 六、移动端测试交接（下一阶段）

**平台无关（已在 web 链上级验证，移动端继承、无需重验计算正确性）**：
- orderType 语义（0-6）、acceptablePrice 哨兵规则、fee/funding/PnL/清算价公式、清算判定、AUTO_CANCEL、保护机制——这些由**合约**决定，与前端无关。移动端只要发出的交易字段正确即等价。

**移动端必须重验（前端/交互层，18 张缺陷多属此层，移动端前端可能行为不同）**：
- 触发单**类型派生/显示**（016/017/018 在移动端是否复现或不同）、持仓卡即时刷新（013）、价格 feed 停更（015）、保护面板（006）、tooltip（008）、编辑弹窗校验（014/016）。
- **移动端专属**：触屏手势（滑动/长按下单）、响应式布局、移动端钱包连接（Rabby/Browser Wallet 注入路径）、小屏下的字段可见性与预览区、One-Click/Flash 在移动端的切换。

**建议移动端优先级**：先跑一遍与 web 对照的"触发单发出+字段"回归（复用本套链上取证脚本核字段），再补移动端专属交互，最后复测 web 未闭合的盲区是否移动端同样存在。

---

> 维护：切换项目/版本以 `Docs/contract-releases/CURRENT.json` 为准；缺陷单详情见 `TestCase/E2E/bugs/v0.3.1/`；逐笔证据见 `OPERATION-LOG.md`；轮次小结见 `ROUND-1/2/3-SUMMARY.md`。

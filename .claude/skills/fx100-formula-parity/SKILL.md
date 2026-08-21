---
name: fx100-formula-parity
description: FX100 前端公式 vs 合约公式一致性核对（同一字段两边算法/单位/取整/选价是否一致，含字段配对表与数值探针）。Use whenever the task asks whether the frontend / SDK / 页面 computes a field the same way the contract does — 前端公式 / 合约公式 / 口径一致 / 计算是否一致 / 公式对齐 / 公式核对 / parity / 前端显示的 X 和链上 X 为什么不一样 / SDK 算的 vs Reader 返回的 / 页面清算价 vs 合约清算判定 / 前端杠杆 / 前端手续费预览 / 前端资金费 / 前端 PnL / 执行价预览 / 点差预览 / 前端精度 decimals / fx100-apps 与 fx100-contracts 对照 — even if none of these words appear but the task requires locating where fx100-apps computes a value and comparing it with fx100-contracts, reviewing a frontend calc file for correctness against Solidity, or explaining a page-vs-chain discrepancy. 合约侧公式本身、核对陷阱、费用路由见 fx100-verify-handbook；本 skill 只管"两边是否一致"的定位、比对方法、已知差异台账与探针。
---

# FX100 前端 ↔ 合约 公式一致性核对

> 对象：`Github/fx100-apps@develop`（app：`apps/fx-base-app`，SDK：`packages/sdk`）↔ `Docs/contract-releases/CURRENT.json` `primary.repoPath`（当前主测合约，不在此复述版本号）。若前端尚未适配 `primary`，应如实判定兼容性差异，不能退回 `comparison` 版本得出假“一致”。**断言以实际实现为准**（工作区规则 4）：任何公式先在两侧源码里按函数名复核，行号只作定位。

## 一句话核心事实

1. **前端不是所有字段都自己算**。三种来源：`frontend-computes`（TS 复刻公式）、`reader-call / simulate-call`（读 Reader / DataStore / simulateExecuteOrder，只做单位换算与格式化）、`event-derived`（从事件字段派生）。**先判来源再比公式**——reader-call 的字段一致性天然成立，风险只剩换算与展示；把 Reader 返回值当"前端公式"去比是常见误判。
2. **合约里没有"杠杆""清算价"变量**，两者都是前端派生量；"一致"的判据是**前端派生量是否与合约的约束条件等价**（`PositionUtils.isPositionLiquidatable` / `validatePosition` 的 `净抵押 ≥ sizeInUsd × minCollateralFactor`），而不是去找一个不存在的合约函数。
3. **比公式形状之前先比四件套**：① 单位精度（USD 1e30 / token 1e18 / USDC 1e6 / 价格 1e12·1e24 / bigint 还是 float）② 取整方向（roundUp / 截断 / Math.round）③ 选价（min / max / mid / index）④ 参数来源（前端硬编码 vs DataStore 读取）。四件套任何一项不同，公式再像也是"不一致"。
4. **前端最常见的错法不是公式错，是精度错**：18 位统一存储 vs `indexToken.decimals` 用户输入路径、`USD×10^12` 合约价格 vs `USD×10^24` USDC 价格——已有 5 起真实故障（见 conventions.md）。
5. **每一条"不一致"结论必须能给出数值例子**：同一输入向量，两边输出不同。给不出例子的写"疑似不一致"，不许升级。

## 核对流程（每个字段走一遍）

1. **定位字段**：用户看到它在哪（页面 / 弹窗 / 列 / tooltip）。先查 [references/field-map.md](references/field-map.md) 是否已登记——已登记的直接从锚点复核，不重新找。
2. **判来源**：沿真实调用链（组件 → hook / atom → sdk util）确认是自算、读 Reader、还是事件派生。`apps/fx-base-app/scripts/info/*` 是调试脚本，不是 app 路径，只作旁证。注意死代码 / 重复实现（同一字段多条路径要分别登记）。
3. **抓两侧锚点**：前端 `文件::函数 L起-止`；合约 `文件::函数`（CURRENT.json `primary.repoPath`）。旧手册只能用于找线索，必须回 `primary` 源码复核。
4. **提取公式 + 四件套**：两侧各写一遍伪代码（保留真实变量名），逐项填单位 / 取整 / 选价 / 参数来源。
5. **判定**（分类见下表）。判"不一致 / 疑似不一致"必须尝试构造数值例子；能跑就跑数值探针（[references/probe.md](references/probe.md)）。
6. **出报告 + 回写**：按模板出报告；新确认的差异回写 field-map.md 的差异台账；若是真 bug，按工作区规范立 `<项目代号>-BUG-NNN` 或提交给合约侧 BUGS.md 流程。

## 判定分类

| 判定 | 含义 | 需要的证据 |
|---|---|---|
| **一致** | 公式、四件套全同 | 两侧锚点 + 四件套逐项对照 |
| **等价** | 代码形状不同但结果可证相同（如乘除重排但无截断差、常量折叠） | 说明为什么结果相同；涉及整数除法重排的必须给数值例子证明无 1-wei 差 |
| **不一致** | 找到具体差异会改变结果 | 数值例子（输入向量 + 两侧输出）+ 差异根因（四件套哪一项 / 缺项 / 符号） |
| **疑似不一致** | 有可疑点但未能构造出差异例子 | 写清可疑点与未能证明的原因，留待探针 |
| **无法比较** | 前端读 Reader / simulate，或合约无此概念（纯展示派生） | 记录前端的换算与格式化路径（这才是该类字段的风险点） |
| **前端未实现** | 合约有、页面应显示但前端没算（或用了占位/固定值） | 前端锚点证明缺失或硬编码 |

差异严重度另标：**材料性**（单位错 / 选价侧错 / 符号错 / 缺项 → 影响用户决策或资金）vs **展示性**（末位取整、显示精度内的差）。

## 报告模板（每字段一份，或合并成表）

```
### <字段名 / fieldName>
- 显示位置：
- 来源类型：frontend-computes | reader-call | simulate-call | event-derived | display-only
- 前端锚点：<file>::<fn> L..（调用链：组件 → hook → util）
- 合约锚点：<file>::<fn>
- 前端公式：
- 合约公式：
- 四件套：单位精度 | 取整 | 选价 | 参数来源（两侧并列）
- 判定：一致 / 等价 / 不一致(材料性|展示性) / 疑似不一致 / 无法比较 / 前端未实现
- 差异说明 + 数值例子（不一致时必填）：
- 证据：file:line ×2
- 已有文档：<哪份文档哪节已覆盖>
```

## 知识地图

| 你在做什么 | 读哪里 |
|---|---|
| 查某字段两侧锚点、已知判定、已确认差异台账 | [references/field-map.md](references/field-map.md) |
| 两侧单位 / 精度 / 取整 / 选价约定、前端已知精度故障样本、版本基线差异 | [references/conventions.md](references/conventions.md) |
| 跑数值探针（TS 与 Solidity 同输入向量比对）的方法与脚本 | [references/probe.md](references/probe.md) · `scripts/` |
| 合约侧公式细节、核对陷阱、费用路由 | 隔壁 skill `fx100-verify-handbook`（`references/formulas.md` / `traps.md` / `v031-facts.md`） |
| 页面口径的产品需求来源 | `Docs/Gordon-Notion需求文档归档/汇总/FX100-页面字段计算公式.md` |
| 合约+页面全字段公式长文（T0~T3 分层） | `TestCase/E2E/ContractCodeSummary/FX100-核心字段计算公式.md` |

## 使用纪律

- 结论只来自两侧源码，不抄文档结论（文档可能落后于代码；field-map 里的判定也标了核对日期，过期要复核）。
- 前端锚点必须在**真实 app 调用链**上；引用死代码 / 测试 mock / debug 脚本得出的"不一致"不成立。
- "不一致"必须附数值例子；整数除法重排的"等价"也必须附例子（差 1 wei 就不是等价）。
- 前端用 float / `Number` 参与中间计算的，一律标记（bigint 精度丢失是材料性风险的常见源头），即使当前样例数值上相同。
- 发现新差异或纠正旧判定后，回写 field-map.md（含日期与两侧 commit），别只留在对话里。

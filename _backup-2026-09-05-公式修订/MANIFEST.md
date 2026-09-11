# 备份清单 — 2026-09-05 公式文档修订

> **用途**：供你晨起审核「修改是否正确」。审核通过后整个 `_backup-2026-09-05-公式修订/` 目录可直接删除。

## ⚠️ 三件必须先知道的事

1. **这批文档在 git 里完全没有跟踪**。`TestCase/E2E/ContractCodeSummary/v0.3.2/` 与 `TestCase/E2E/versions/v0.3.2/` 下所有 `.md` 都是未跟踪文件（不是被 gitignore，是从没提交过）。**所以没有历史版本可回滚**，本目录是唯一的还原点。
2. **本备份创建于我已修改 4 份文件之后**。也就是说 `当前状态/` 里那 4 份是**改后**的，不是原版。它们改了什么，下表逐条列出，请重点审这几条。
3. 只有 `CURRENT.json` 能从 git 取回真正的原版，已放在 `git原版/`。

## 目录结构

| 路径 | 内容 |
| --- | --- |
| `当前状态/ContractCodeSummary-v0.3.2/` | 公式文档目录快照（含我已做的修改） |
| `当前状态/versions-v0.3.2/` | v0.3.2 版本用例文档快照（**我一个字都没动**，纯净原版） |
| `当前状态/skill-fx100-verify-handbook/` | skill 快照（**除文首指路外未动公式**） |
| `当前状态/CURRENT.json` | 改后版本 |
| `git原版/CURRENT.json` | git HEAD 原版，可 diff |
| `git原版/FX100-核心字段计算公式-公式未动版.md` | 核心公式文档在**任何公式被改动之前**的状态（含我加的交叉引用，但公式本体一字未动）——这是核对公式修改的基准 |

## 我已经改了什么（请重点审这 4 份 + CURRENT.json）

| 文件 | 改动 | 依据 |
| --- | --- | --- |
| `FX100-前端代码公式.md` | 5 处：§0 价格标度（补合约 `10^(30−d)` vs SDK 恒定 `1e30` 两层对照）· §5.4 算术 2212.9→2212.75 · §6 对照值 13.6/0.62%→13.44/0.61% · §6 新增 Path A/B 界面归属表 · §7 重写为真正三条线 + 补 isLong 分支 | 均已回源码亲验：`utils/tokens.ts:21` `parseUsdPrice=parseUnits(v,30)`；`PositionMarginDialog.tsx:521` 走 Path A、`PositionLeverageDialog.tsx:435` 走 Path B；`trade/decrease.ts:445` 无 `max(...,minCollateralUsd)` 那层 |
| `FX100-Keeper代码公式.md` | 5 处：§7 标注 `evaluateTrigger` 为遗留路径 · §4.1 更正 `effectiveShortfallUsd` 来源 · §5/§10 更正 ADL 并列扩展会被硬截 · §8 锚点 · §5 与合约 PnL 的差异项 | `IMPLEMENTATION.md:705` 原文「the submit path no longer calls it」；`store.ts:1155` 自减；`strategies/adl/auto.ts:93` `slice(0, maxPerTick)` |
| `FX100-功能用例公式与核对依据索引.md` | 早先：升级为三层索引（新增 §0 权威等级、§3.1 Keeper 归因表）。本轮：修 3 处失效章节锚点 | 锚点按 GitHub slug 规则算出：`、` 是删除不是转连字符 |
| `FX100-项目模块与资金方向总结.md` | Holding/Insurance 那行改为实际两个用途 + 补「穿仓不向任何地址转账，缺口由 LP 担」 | `TokenUtils.sol:69-79`、`GasUtils.sol:268-274` 是 `HOLDING_ADDRESS` 仅有的两处用途 |
| `FX100-核心字段计算公式.md` | **公式本体未动**。只加了：文首范围指向三层、§0.2 来源优先级插入「前端/Keeper 代码实现」一档、§24 补前端与 Keeper 文档入口 | — |
| `README.md` | 补三层坐标与两份新文档入口、维护规则补 pin 要求 | — |
| `Docs/contract-releases/CURRENT.json` | `frontend` 补 `head`/`headAt`/`subpaths(sdk/app/keeper)` + history 一条 | 前端与 Keeper 公式锚点需要可 pin；`develop` 是移动分支 |

## 我新建的文件（无原版，整份都是新的）

- `FX100-前端代码公式.md`（402 行）
- `FX100-Keeper代码公式.md`（424 行）

## 尚未动、正在处理中的

- `FX100-核心字段计算公式.md` 的 **12 组公式重推**（工作流产出后由我逐段核对再手工合并，不让 agent 直接写主文件）
- skill `fx100-verify-handbook/references/formulas.md` 的公式修订
- 需求差异台账（新建）
- `TestCase/E2E/versions/v0.3.2/` 全部文档（审计中，**尚未做任何修改**）

## 还原方法

```bash
cd /Users/milakou/Documents/FX100
# 还原某一份
cp "_backup-2026-09-05-公式修订/当前状态/ContractCodeSummary-v0.3.2/<文件名>" "TestCase/E2E/ContractCodeSummary/v0.3.2/"
# 还原 CURRENT.json 到 git 原版
cp "_backup-2026-09-05-公式修订/git原版/CURRENT.json" "Docs/contract-releases/CURRENT.json"
```

## 建议（与本次修订无关，但值得处理）

这批文档没有版本控制是个真实风险——本次能查出「14 章逐字照搬 v0.3.1」，靠的是恰好留着 `ContractCodeSummary/v0.3.1/` 目录可以 diff。若把 `TestCase/E2E/ContractCodeSummary/` 与 `versions/` 纳入 git，以后版本滞后能在 diff 里直接看见。


---

## 2026-09-05 上午追加：合并已执行 + 一次数据恢复事故

### 已执行（你批准了选项 A）
- `FX100-核心字段计算公式.md`：**1394 → 5639 行**，23 节替换、§0/§24/§25 保留；26 节编号完整、无重复。
- 新增 `FX100-需求与实现差异台账.md`（**124 条，全部为候选、未复核**），README 已登记。
- `FX100-前端代码公式.md` §6 再订正一处：三个界面都是 **Path A 优先、Path B 兜底**（初版误写为「走 Path B」，原因是只查了调用点没看主路径/兜底）。
- `FX100-核心字段计算公式.md` §18 由补齐组（u13）重写：原 73 行 → 294 行。

### 事故：临时目录被清空
13 份重推稿原本只存在 `/private/tmp/.../scratchpad/`，08:56 被系统清空。**主文档、备份均未受影响**。
恢复方法：从持久化的 agent 转录（`~/.claude/projects/.../subagents/workflows/wf_*/agent-*.jsonl`）回放 134 次 Write/Edit，并用复核 agent 的 Read 快照交叉；以合并前记录的**每节行数**为校验和——12/13 文件精确一致，u05 采用「最新快照 + 第三轮 Edit」后一致；末节 1–2 行差异为尾部空行计数所致（已归一）。
**重推稿现已持久化在本目录 `重推稿/`**（含 `merge.py`、`recover2.py`、`_bash-cmds.txt`）。

### 未做 / 进行中
- skill `fx100-verify-handbook` 的汇总层对齐：草稿写到 `skill-draft/`，复核通过后再拷入 skill（skill 快照见 `当前状态/skill-fx100-verify-handbook/`）。
- 主文档代码外约 118 处 ASCII 直引号（原文风格为弯引号）：纯风格，未动。
- 执行器（tx 单笔核对）：待你决定落点。

### ⚠️ `versions/v0.3.2/` 在备份后被别的会话改过（不是我，未还原）
备份快照 01:43:53；随后 01:47–02:18 有 10 个文件被修改：`Trade-测试用例矩阵.md`（435→474 行，+71/−32）、`Liquidation-(v0.3.2).md`（+20/−10）、`Funding-(v0.3.2).md`、`dynamicSpread-(v0.3.2).md`、`ADL-(v0.3.2).md`、`02-`、`03-`、`README.md`、`applicability.md`（矩阵 160→188 条，新增「杠杆/保证金调整 34」）、`cases/SCN-B32.md`。
证据：本会话全部子 agent 转录里对该目录只有 13 条读操作（awk/grep/wc/ls），无 Write/Edit；改动内容为有作者意图的用例扩充。判定为另一会话的 WIP，**按并行会话纪律未还原**。如需对比，01:43 快照在 `当前状态/versions-v0.3.2/`。
后续的 versions 审计（03:05 起读取）用的已是改后版本，结论有效。

### skill 汇总层已同步（2026-09-05 中午）
拷入 `fx100-verify-handbook`（TestSkill 真身，`.claude/skills` 软链同一 inode）：`SKILL.md`（43→53 行：核心事实 1/2 校正 + 新增 7/8/9 + 知识地图 4 行 + description 触发词）、`references/formulas.md`（127→150 行，全部条目按 v0.3.2 详解层校正并带 `→ 核心 §x.y` 指针）、`references/traps.md`（80→101 行：§8 旧「合并分母差 1 wei」论断改正 + 新增 §13 十七条）、**新建** `references/v032-facts.md`（70 行，v0.3.1→v0.3.2 影响核对的变更卡）。
三份草稿经 2 轮独立复核意见 + 我逐行审读修正（19 处），253 个章节指针全部解析通过。改前快照在 `当前状态/skill-fx100-verify-handbook/`，改后草稿在 `skill-draft/`。
未采纳：复核建议把 formulas.md 压到 ≤18KB——现 27KB；我保留了密度换完整性（旧卡 12KB 漏了这次查出的大半分支）。若你觉得长，可再压一轮。

---
id: BUG-FE-PCTBASE-026
title: 下单表单同排百分比按钮用三把不同的尺——25/50/75 走裸余额，会填出被自家校验判 INSUFFICIENT_RELAY_FEE 的值，而同排 100%(Max) 在同一余额下什么都不填
severity: S3
priority: P2
status: open
found: 2026-09-06
env: https://fx100-dev.vercel.app · Base Sepolia 84532 · v0.3.1 部署(260729) · 前端 fx100-apps@develop · Flash/One-Click 模式
source-case: BUG-025 对抗性核验工作流附带发现（6 取证角度中 4 个独立命中）
finder: 记录员源码定位（尚未专项实操复现）
related: BUG-FE-MAXRESERVE-025
---

# BUG-FE-PCTBASE-026 · 百分比按钮口径分裂

> **状态说明**：本单为**源码级发现**，尚未做专项手工复现。执行人复现后请回填「实际结果」。

## 一、事实

同一排四个百分比按钮（25% / 50% / 75% / Max），**基准余额分三种**：

```ts
// hooks/trade/useOrderFormController.ts:1643-1646（Pay/gross-up）与 :1687-1690（Size），两处同形
const availableBalance =
  percent === 100
    ? applyMaxUsdcReserve(spendablePayTokenBalance)   // = B − R − 1.0
    : payTokenBalance;                                // = B（裸余额，既不减 R 也不减 1.0）
```

设 `B` = 钱包 USDC 余额、`R` = 当次动态 relay cap（Flash 下 ≥0.5 U）：

| 按钮 | 填入值 | 提交侧上界 `B − R` | 后果 |
|---|---|---|---|
| 25 / 50 / 75% | `B × pct` | 不比对 | `B×pct > B−R` 时被自家 `orderFormValidationAtom` 判 `INSUFFICIENT_RELAY_FEE`、提交按钮置灰 |
| 100% (Max) | `max(0, B−R−1.0)` | 恒 `<` 上界 | 永不触发校验错误；但 `B−R ≤ 1.0` 时输出 0 并静默（→ BUG-025） |

**全链路无 clamp 兜底**（4 个 agent 独立普查：atom / 派生 / effect / 组件四层均无回夹）。

## 二、数值反例（R 取下限 0.5 U）

- **`B < 2.00 U` 时点 75% 必然**填出被自家校验拒绝的值。
  推导：`0.75B > B − 0.5` ⟺ `0.5 > 0.25B` ⟺ `B < 2.0`。
- **`B ≤ 1.5 U` 时**，同一余额下 75% 吐出一个被拒的数字、而 Max 一声不吭什么都不填——**同排两个按钮两种失败方式，都不解释原因**。
- 实测账户 `0x7b69…1958` 的 B=1.48 正落在该区间内。

## 三、期望

四个百分比档位采用**同一可用余额基准**（建议统一为 `spendablePayTokenBalance`，即 `B − R`；是否额外扣 1.0 按 BUG-025 §五的产品裁定执行），使得：
- 任何档位填出的值都能通过提交侧校验；
- 百分比与填入值单调（大档位不小于小档位）。

## 四、待复现清单（交执行人）

1. 备一个 `B` 落在 `(0.5, 2.0)` 的账户（如 1.48 U），Flash 模式，依次点 25/50/75/Max，记录每档填入值、提交按钮态、提示文案；
2. 核对 75% 是否确被 `INSUFFICIENT_RELAY_FEE` 拦下；
3. 顺带核对**存入保证金弹窗**（`PositionMarginDialog.tsx`）是否有同排百分比按钮、是否同样分裂——核验中有法官提到该弹窗可能出现「75% 填得比 100% 多」的非单调阶梯，**此点未经独立验证，需实测确认或证伪**。

## 五、证据

- 源码：`hooks/trade/useOrderFormController.ts:1643-1646, 1687-1690`（条件表达式本身）、`state/derived/order.ts:499-503, 519-528, 537-541, 549`（提交侧比的是 `spendableBalance`）、`lib/relay/feeEstimate.ts:40-43`；
- 核验工作流 runId `wf_78021aed-c57`（A3/A4 角度直接命中，J1/J3 两名法官均判定其「比原 D2 更实在」）；
- 台账：`OPERATION-LOG.md` LOG-087。

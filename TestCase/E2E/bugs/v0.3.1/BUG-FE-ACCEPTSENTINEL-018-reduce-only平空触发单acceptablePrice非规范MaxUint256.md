---
id: BUG-FE-ACCEPTSENTINEL-018
title: reduce-only 平空触发单(TP/SL)的 acceptablePrice 未用规范 MaxUint256 哨兵，链上实为 MaxUint256/1e18；与持仓行路径(规范 MaxUint256)及平多 close(规范 0)不一致
severity: S3
priority: P2
status: open
found: 2026-08-30
env: https://fx100-dev.vercel.app · Base Sepolia 84532 · v0.3.1 · Chrome 桌面 · Limit·Reduce-only
source-case: E2E-TRD S7（出单参数·平仓哨兵）· 2026-08-30 LOG-076（链上取证 trades-scan.json，逐字段核对已发出触发单）
finder: 执行人（Mila）"限价单每个字段是否填写正确"验收 + 记录员链上取证
---

# BUG-FE-ACCEPTSENTINEL-018 · 平空触发单 acceptablePrice 哨兵非规范

按执行人验收口径"限价单 = 能发出 + **每个字段填写正确** = PASS"，逐字段核对已发出的平仓触发单，发现 `acceptablePrice` 哨兵在一条路径下非规范。

## 现象（链上 OrderCreated 原始 acceptablePrice 核对）

规范约定（据本协议 ETH 样本）：平多 close 哨兵 = **0**；平空 close 哨兵 = **MaxUint256**（type(uint256).max）。

| 平仓触发单 | 路径 | orderType | isLong | acceptablePrice（原始） | 判定 |
|---|---|---|---|---|---|
| ETH 平空 TP/SL（19:22:14） | **持仓行 TP/SL 弹窗** | 3/4 | false | `MaxUint256`（115792…639935） | ✅ 规范 |
| ETH 平多 TP/SL（12:20/12:23） | Limit 页签 reduce-only | 3/4 | true | `0` | ✅ 规范 |
| **LINK 平空 TP/SL ×4（12:51~13:32）** | **Limit 页签 reduce-only** | 3/4 | false | `115792089237316195423570985008687907853269984665640564039457` = **MaxUint256 ÷ 1e18** | ⚠️ **非规范** |

LINK 四单（TP≤11 tx `0x69fbb6ff`、SL≥11.8 tx `0x1dccc58f`、SL≥11.8 tx `0xb75d4c21`、TP≤11.2 tx `0x88620c97`）acceptablePrice 全为 MaxUint256/1e18，非规范 MaxUint256。

## 根因（强推断，待隔离）

**Limit 页签 reduce-only 平仓路径对 acceptablePrice 哨兵多施加了一次 /1e18 缩放**：
- 平多哨兵 0 → 0/1e18 = 0（缩放不可见，故 ETH 平多看似正常）；
- 平空哨兵 MaxUint256 → MaxUint256/1e18（缩放暴露，即本缺陷）。
持仓行 TP/SL 路径不缩放（ETH 平空 = 规范 MaxUint256）。故疑为**路径依赖**（Limit 页签 RO 路径的哨兵缩放 bug），非市场依赖（LINK 特有）。

## 影响

- **功能无害**：MaxUint256/1e18 ≈ 1.16e59 作内部定点价；平空（买回）校验 `执行价 ≤ acceptablePrice`，真实执行价 ~1.1e13 ≪ 1.16e59 恒成立 → 仍等效"无限价"，平仓可正常执行，无资损。
- **但字段值非规范**：与本协议 ETH 平空路径、与 GMX `type(uint256).max` 约定不一致。**若任何下游（合约/SDK/看板/风控）以 `acceptablePrice == type(uint256).max` 判定"市价/无限价哨兵"，会把这些单误判为"带真实限价"** —— 属"每个字段填写正确"验收口径下的字段缺陷。

## 期望

平空 close 触发单 acceptablePrice 应为规范 `type(uint256).max`（MaxUint256），与持仓行路径及 GMX 约定一致，不应被 /1e18 缩放。

## 待复测（隔离路径 vs 市场）

1. **ETH 短仓经 Limit 页签 reduce-only 挂 TP/SL** → 若也 = MaxUint256/1e18，坐实**路径依赖**（Limit-tab RO 路径 bug，与市场无关）。
2. **LINK 短仓经持仓行 TP/SL 弹窗** → 若 = 规范 MaxUint256，进一步坐实路径依赖。
3. 多头镜像：Limit 页签 RO 平多本就 0（无法区分），可忽略。

## 证据

链上取证脚本 `scratchpad/forensics-stop.mjs` → `trades-scan.json`；哨兵并排核对见 LOG-076。ETH 平空 tx `0x7fd8d5b7`（=MaxUint256）、ETH 平多 tx `0xa565224d`/`0xb4a0eb93`（=0）、LINK 平空四 tx 见上（=MaxUint256/1e18）。

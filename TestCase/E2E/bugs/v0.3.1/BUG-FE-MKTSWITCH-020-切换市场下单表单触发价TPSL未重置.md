---
id: BUG-FE-MKTSWITCH-020
title: 切换交易市场（LINK/USD→SOL/USD）时下单表单的触发价/TP/SL 未随市场重置或换算，保留上一市场的绝对价位（对新市场现价为 −89% 等无意义值）
severity: S3
priority: P2
status: open
found: 2026-08-30
env: https://fx100-dev.vercel.app · Base Sepolia 84532 · v0.3.1 · Chrome 桌面 · Limit 下单表单
source-case: E2E-TRD 市场切换 · 市场切换族（MKTURL-002 / MKTBOUNCE-004） · 2026-08-30 LOG-082
finder: 执行人（Mila）
notion: https://app.notion.com/p/3cc3d7873f2c81ecb6b7fca2fdceadc7（🐛 Bugs 库，2026-08-30 提交，Open/FX100/Medium）
---

# BUG-FE-MKTSWITCH-020 · 切换市场后下单表单触发价/TP/SL 残留旧市场价位

## 现象（2026-08-30 实录）

从 **LINK/USD** 切换到 **SOL/USD**（SOL Oracle 106.41）后，下单表单（Limit · Buy/Long）残留上一市场（LINK ~11.6）的参数、未随市场切换重置：

- **触发价 Oracle ≤ 11.597**（LINK 价位）→ 对 SOL 现价 106 显示 **−89.12%**（红字）；
- **TP 11.9 / SL 11.3 · On**（LINK 价位）→ 对 SOL 无意义，% 显示 "-"；
- 表单顶部 Market 参考已更新为 SOL **$106.53**，但触发价/TP/SL 输入框值仍为 LINK 值。

## 期望

切换交易市场时，下单表单的**触发价、TP、SL 应清空**（或按新市场现价重算档位），不得保留上一市场的绝对价位；Size 输入亦应校验/清空。

## 影响

- 若用户未注意红字直接 Enter Amount 提交，会用旧市场价位建单：SOL 多头触发 ≤11.597（远低于现价）= 立即满足或永不达的 Buy-Limit，TP/SL 11.9/11.3 亦无意义 → 可能立即成交 / 冻结 / 挂死，资金风险；
- UI 已用 **−89.12% 红字**与 TP/SL "-" 提示（非静默），但**不自动重置**，属残留态缺陷。定 S3（可见提示降低误提交概率，但残留本身是缺陷）。

## 关联

市场切换族：MKTURL-002（切回市场 URL 不随动，open）、MKTBOUNCE-004（市场回弹，已修）。**本条为"订单表单参数残留"**，与前两者不同，建议一并纳入市场切换回归。

## 证据

执行人截图：SOL/USD 现价 106.41、表单触发 Oracle ≤ 11.597（−89.12%）、TP 11.9 / SL 11.3（红框标注）。

## 备注（旁证，非本缺陷）

同屏 Positions 仍显 **LINK Long** 258.001 LINK / entry 11.628 / PnL **−43.41%** / Est Liq $11.54 **Expired（暴露）**——持仓跨市场保留正常；本缺陷仅关下单表单参数残留。⚠️ 该 LINK 多头已暴露且大幅亏损，留意被动清算。

---
id: BUG-FE-STICKYHEADER-019
title: Orders History / Open Orders 表格表头未固定（非 sticky），行数多时表头随内容一起滚走，滚动后丢失列含义
severity: S4
priority: P3
status: open
found: 2026-08-30
env: https://fx100-dev.vercel.app · Base Sepolia 84532 · v0.3.1 · Chrome 桌面
source-case: 交易页底部 Orders History / Open Orders 表格 · 2026-08-30 LOG-077（执行人 UX 建议）
finder: 执行人（Mila）
notion: https://app.notion.com/p/3cc3d7873f2c8103b08dc178ed78583e（🐛 Bugs 库，2026-08-30 提交，Open/FX100/Low）
---

# BUG-FE-STICKYHEADER-019 · 订单表格表头未固定

## 现象

交易页底部 **Orders History / Open Orders** 表格的列表头行（Time / Type / Coin / Direction / Size / Token Size / Trigger / Entry Price / Fee / Reduce Only / Status）**未做 sticky 固定**：当订单行数较多、需要向下滚动查看时，表头随表体一起滚出可视区，**滚动到下方时无法对照列含义**，需回滚顶部才能确认某列是哪个字段。

## 期望

表格**表头固定（position: sticky / 独立不滚动的表头区）**，滚动仅作用于表体（行）内容——与主流交易所订单表一致，长列表下始终可见列名。

## 影响

- 纯 UX/可读性，无功能/资金影响；
- 但在核对场景（本次测试即为例：多市场多订单混排，需逐列比对 Type/Trigger/Status）下明显降低效率、易读错列。

## 备注

执行人在补齐买侧限价用例（LOG-077）滚动 Orders History 时提出。低优先增强项。

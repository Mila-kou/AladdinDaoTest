---
project: fx100
layer: e2e
type: manual-run-session
title: 2026-09-06-执行器走查-XT-MKT-OPEN-001 手工执行批次
date: 2026-09-06
release: v0.3.2
status: round-1-in-progress
---

# 2026-09-06-执行器走查-XT-MKT-OPEN-001 手工执行批次

> 由测试看板「测试用例页 · 手工测试工作台」创建。执行范围为版本功能用例（CT/XT/FT）；
> 结果唯一台账在 [../../versions/v0.3.2/results.md](../../versions/v0.3.2/results.md) 标记区，本目录只存过程档案与证据。

## 1. 范围

- 版本：v0.3.2（基线以 Docs/contract-releases/CURRENT.json 为准）
- 用例（1 条）：见 [RUN-SHEET.md](RUN-SHEET.md)
- 执行人：Claude（走查）

## 2. 记录规则

- 每条结果经看板「记录结果」写回 results.md 标记区（一行一次结果，重复执行追加行不覆盖）；
- 对应层 admissionScope 非 READY_FOR_SYSTEM_TEST 时只记 BLOCKED / NOT_RUN，不得写 PASS / FAIL；
- 证据（截图 / 日志 / tx 记录）存本目录，results.md 证据列写 `TestCase/E2E/manual-runs/2026-09-06-执行器走查-XT-MKT-OPEN-001/…` 相对路径。

## 3. 台账文件

- [RUN-SHEET.md](RUN-SHEET.md) — 选案台账（逐条状态回填）
- OPERATION-LOG.md — 逐条操作记录（执行时按需创建）
- ROUND-N-SUMMARY.md — 轮次小结（收口时由看板按 ID 反链 results.md 归档）

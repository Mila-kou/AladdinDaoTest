# FX100 E2E 测试结果

> 数据状态：READY｜Run：2026-08-21T043810-045Z｜生成：2026-08-21T04:40:38.178Z

| 指标 | 结果 | 定义 |
|---|---:|---|
| 规划场景 | 80 | SCENARIO-CHECKLIST 中的唯一 SCN 数量 |
| 手工核对 | 17 | 设计上依赖真人操作、不产出自动化代码；仍需人工执行并留证 |
| 自动化覆盖 | 1 / 63（1.6%） | 本次发现至少一个自动化测试的唯一 SCN / 应自动化场景（规划 − 手工） |
| 最终成功率 | 100.0% | (PASS + FLAKY) / (PASS + FLAKY + FAIL) |
| 稳定通过率 | 100.0% | PASS / (PASS + FLAKY + FAIL) |
| PASS / FAIL / FLAKY | 1 / 0 / 0 | 最终场景-项目结果 |
| BLOCKED / SKIP | 0 / 0 | 不进入成功率分母 |
| 累计执行耗时 | 147.8s | 所有场景尝试耗时之和 |

## 需要处理

无失败、Flaky 或 Blocked 场景。

## 数据质量

没有发现未映射编号或重复结果。

## 来源

- 运行结果：playwright-reporter
- 场景目录：../TestCase/E2E/SCENARIO-CHECKLIST.md
- 数据粒度：one row per scenario and Playwright project final outcome
- Playwright 状态：passed
- 最终失败数：0

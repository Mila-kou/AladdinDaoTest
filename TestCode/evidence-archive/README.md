# evidence-archive —— 执行证据「可核验最小集」快照

`artifacts/` 整体被 `.gitignore` 排除（视频/trace/截图体积大且可再生），导致自动化 PASS 的全部可核验支撑只存本机磁盘。
本目录按批次归档**最小可核验集**并受版本管理，供 `TestCase/E2E/SCENARIO-CHECKLIST.md` 回填时引用：

| 内容 | 来源 | 作用 |
|---|---|---|
| `run-batches/<batch>/run.json` | `artifacts/run-batches/` | 跑批页批次摘要（环境、Keeper 模式、用例状态） |
| `runs/<run>/results.json` + `summary.md` | `artifacts/runs/<run>/` | 该次运行的场景状态、注解、执行证据派生结果 |
| `runs/<run>/attachments/*evidence.json` | Playwright 附件 | runner 原始证据：快照 / Δ / 断言 / 交易回执 / 事件 |
| `manifest.json` | 本脚本生成 | 场景 → run id / executedAt / release / 环境 / 模式 / 覆盖 / TX 数 / 首末 txHash+块号 / 文件 sha256 |

口径：
- 只收录 `artifacts/latest` 中状态为 PASS 的场景所属运行；FAIL/SKIP 不入档（在清单里以 latest 记录引用）。
- fork 上每数据集 `evm_snapshot/evm_revert` 会使 **txHash 跨运行重复**（同 from/nonce/data），证据定位以 run id + 块号 + evidence.json（sha256）为准。
- 归档是快照，不替代 `artifacts/`；重跑后如需更新，新建批次目录（`<日期>-<说明>`），不覆盖旧档。

生成方式：在 `TestCode/` 下执行归档脚本（见各批次目录 `manifest.json` 的 `archivedAt`），脚本源码随批次一并存放于 `evidence-archive/tools/archive-evidence.py`。

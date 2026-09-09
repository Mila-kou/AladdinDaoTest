# v0.3.1 测试结果

> 本页是 v0.3.1 结果入口。迁移只改变文档位置，不移动或改写 manual-runs/、TestCode/evidence-archive/ 和截图/交易证据。

| 结果集 | 当前快照 | 明细 |
|---|---|---|
| 80 条 SCN | 15 PASS；SCN-063 为 PENDING；其余未形成 PASS | [results-scn.md](results-scn.md) |
| 54 条 TRD | 11 PASS；E2E-TRD-053 为 PENDING；其余未形成 PASS | [results-trd.md](results-trd.md) |

说明：

- SCN 自动化 PASS 的覆盖均为 PARTIAL：没有经过完整页面填写、浏览器钱包点击与页面历史核对的部分不能升级为 FT PASS。
- 原结果快照中的 run id、tx hash、区块号和证据路径保持不变。
- v0.3.2 必须在自己的 [results.md](../v0.3.2/results.md) 重新执行和登记。

# Tests

当前真实用例切片：

- `S02/scn-009.spec.ts`：市价开多、Keeper 执行、市价全平和链上证据核对。
- `S02/scn-010.spec.ts`：同一 `tx-fork` 内的 MockBTC `LimitIncrease` 挂单、P-10% 精确触发、真实 Keeper 执行、全平和 Oracle 恢复核对。
- `S07/scn-070.spec.ts`：`oracle-fork` 内市价开多、开空、平多、平空四象限，分别验证 `E=A` 成交和最小可达不利价格步长触发取消，共 8 个独立数据集。

真实链路执行结果独立记为 `PASS/FAIL`；尚未由浏览器钱包完成的页面点击签名通过 `coverage-gap` 单独记录，不误标为执行 `BLOCKED`。

环境、ABI、地址、页面数据源、Fork baseline、Mock Oracle 和 Keeper 全部通过 doctor 后，再按照 `S01`～`S08` 建立目录。每个自动化测试必须保留原始 `SCN-xxx` 编号。SCN-070 的 8 个数据集放在同一个 Playwright 测试中，避免 Reporter 把同一 SCN 重复登记为 8 条场景。

后续约定示例：

```text
tests/S08/funding-factor.spec.ts
tests/S08/funding-settlement.spec.ts
tests/S08/funding-risk-ui.spec.ts
```

测试目标动作必须从页面执行；Driver 只负责构造前置条件、触发系统角色动作和读取链上证据。

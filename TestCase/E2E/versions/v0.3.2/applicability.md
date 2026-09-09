# v0.3.2 测试适用性

## 共享回归

| 用例集 | 适用性 | v0.3.2 使用方式 |
|---|---|---|
| SCN-001～080 | 全量适用 | 通用步骤不复制；差异断言见 [expectation-overrides.md](expectation-overrides.md) |
| CMB 手工组合 | 条件适用 | 执行记录明确写 contractRelease: v0.3.2 后才计入本版本 |

## v0.3.2 专项

| 用例集 | 数量 | 入口 |
|---|---:|---|
| SCN-B32-01～08 | 8 | [cases/SCN-B32.md](cases/SCN-B32.md) |
| IT-VAULT-001～003、IT-MARKET-001 | 4 | [cases/IT-VAULT-MARKET.md](cases/IT-VAULT-MARKET.md) |
| v0.3.2 交易与订单矩阵 | 230 | [Trade-测试用例矩阵.md](Trade-测试用例矩阵.md)（部署与交易基线 9 + 市价开仓与市价关仓 55 + 市价加仓、杠杆/保证金调整、市价部分减仓与账本 34 + 限价开仓 16 + 主单取消级联 2 + TP/SL 与清算保护期 20 + 清算保护期结束后的关闭并重新开仓 18 + 订单类型 16 + 其他跨域 60；其中 C 节 Relay/1CT 34 + D 节前端状态/错误/事件适配 7，OC-24～26 在 D 节） |
| 合约单元测试 | 14 | [TestCase/UT/README.md](../../../UT/README.md) |

## `GAP` 与 `BLOCKED` 分层

- 每个 CT、FT、XT 结果只使用 `NOT_RUN`、`PASS`、`FAIL`、`BLOCKED`、`GAP` 五种状态，并按层分别登记。
- `GAP` 表示已明确的需求、实现或可测试面在 CURRENT 中结构性缺失，例如 v0.3.2 `slot` 未进入前端 typed data/ABI、目标链未加入 SDK 地址/链配置、移动端 setup modal 没有渲染。补代码、配置或测试适配后才解除。
- `BLOCKED` 表示对应实现与测试面已经存在，但执行所需的外部环境或依赖暂不可用，例如 Relay API/worker、Relayer 资金或角色、目标版本 Oracle/Order Keeper、钱包或 RPC 故障。必须记录具体依赖和解除条件。
- 同一旅程可出现 CT=`PASS`、FT=`GAP`、XT=`BLOCKED` 等分层结果；若既有实现缺口又有环境阻塞，先在受影响层记 `GAP`，补齐后再按当时环境决定是否为 `BLOCKED`，不得把两者合写。
- 只执行了部分断言不产生额外状态：已执行且有不一致记 `FAIL`；其余尚未执行的层或数据集记 `NOT_RUN`。

## 结果继承规则

- 旧版本测试结果只作为历史对照；v0.3.2 必须依据当前功能规则和本版本矩阵独立执行，状态见 [results.md](results.md)。
- 某个 Foundry 单元测试 PASS 只能证明对应内部函数/边界，不能替代 E2E 的部署、页面、事件、Reader 和资金差分。
- oracle-fork、time-fork 或 tx-fork 只有在实际 manifest 指向 v0.3.2 且参数快照匹配时，结果才可登记到本版本。
- Relay/Gasless 与 1CT 的 FT/XT 还必须满足 `tx-fork:frontend` 准入。当前目标链/地址/ingress 适配和 1CT `SubaccountApproval.slot` 类型、EIP-712、ABI、后端兼容缺失属于 `GAP`；这些实现补齐后，若 Relay 服务、Relayer、Keeper 或钱包等运行依赖仍不可用，再记 `BLOCKED`。
- `CT-RELAY-012/013` 为隔离 fork 的合约安全负向用例，不要求先开放 1CT 页面；不得在共享或生产网络构造攻击 payload。

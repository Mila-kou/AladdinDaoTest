# UT-B32-01 动态点差 MIN/MAX_DYNAMIC_SPREAD clamp 边界

> 所属版本：`fx100-contracts@release-v0.3.2`（HEAD `13880f2`）。新增功能：`dynamicSpread` 从 `uint256` 改为 `int256`，新增按市场/方向的 `MIN_DYNAMIC_SPREAD`/`MAX_DYNAMIC_SPREAD` clamp。
> 期望值来源：`Docs/contract-releases/v0.3.2/05-重要参数边界场景.md` §2「组 1」（B32-1-01/03/04/09），本文档把其中可脱离链上部署、纯靠合约内部函数复算的部分下沉为 Foundry 单元测试；需要真实成交/链上环境的数据集（B32-1-02/05/06/07/08）仍以 05 文档 + [E2E SCN-B32-01](../../E2E/versions/v0.3.2/cases/SCN-B32.md) 为准，不在本文重复。
> 代码锚点：`src/pricing/PositionPricingUtils.sol::getDynamicSpread`、`src/utils/Calc.sol::clamp`、`src/config/Config.sol::setInt/_validateKey/onlyKeeper`。
> 自动化落点：`TestCode/unit/src/DynamicSpreadClampBoundary.t.sol` → 同步进合约 worktree `test/integration/ut-custom/` 后以 `forge test` 执行（同步与执行方式见 `TestCode/unit/README.md`）。

## 公共 fixture

| 参数 | 值（原始整数） | 含义 |
| --- | --- | --- |
| `CONSTANT_PRICE_SPREAD` | 100000000000000（1e14） | 0.01% |
| `PRICE_IMPACT_PARAMETER` | 600000000000000000（6e17） | 0.6 |
| `BID/ASK_ORDER_BOOK_DEPTH` | 1e37 | 10,000,000 USD |
| `MAX_PRICE_IMPACT_SPREAD` | 5000000000000000（5e15） | 0.5%（本组数值远小于此，不生效） |
| `SKEW_IMPACT_FACTOR` | 0 | 隔离 skew 分支，只测 clamp 本身 |
| 基准订单 | usdDelta = 1e34（10,000 USD），isLong=true | 与 05 文档 §1.5 一致 |

推导（`getDynamicSpread`/`getPriceImpactSpread` 源码复核，与 05 文档 §1.5 一致）：线性项 = 1e34×1e18/1e37 = 1e15；priceImpactSpread = 1e15/100 = 1e13；skewImpact=0；**rawSpread = 1e14 + 1e13 = 110000000000000（1.1e14）**。下表所有用例均基于此固定 rawSpread。

## 用例列表

| 用例编号 | 设计方法 | 优先级 | 对应 forge 测试函数 |
| --- | --- | --- | --- |
| UT-B32-01-01 | 错误推测（升级漏配）+ 判定表 | P0 | `test_B32_1_01_ClampKeysUnconfigured_SpreadForcedToZero` |
| UT-B32-01-02 | 边界值（阈值前） | P1 | `test_B32_1_03_P1_MinBelowRaw_NotClamped` |
| UT-B32-01-03 | 边界值（阈值等于） | P1 | `test_B32_1_03_P2_MinEqualsRaw_NotClamped` |
| UT-B32-01-04 | 边界值（阈值越过） | P0 | `test_B32_1_03_P3_MinAboveRaw_ClampedUpToMin` |
| UT-B32-01-05 | 边界值（阈值前） | P1 | `test_B32_1_04_P1_MaxAboveRaw_NotClamped` |
| UT-B32-01-06 | 边界值（阈值等于） | P1 | `test_B32_1_04_P2_MaxEqualsRaw_NotClamped` |
| UT-B32-01-07 | 边界值（阈值越过） | P0 | `test_B32_1_04_P3_MaxBelowRaw_ClampedDownToMax` |
| UT-B32-01-08 | 权限测试 | P0 | `test_B32_1_09_K3_NoRole_Reverts` |
| UT-B32-01-09 | 权限测试 | P0 | `test_B32_1_09_K2_LimitedConfigKeeper_Reverts` |
| UT-B32-01-10 | 权限测试 | P1 | `test_B32_1_09_K1_ConfigKeeper_NormalValue_Succeeds` |
| UT-B32-01-11 | 无效等价类（无范围校验现状） | P1 | `test_B32_1_09_K1_ConfigKeeper_ExtremeValueNoRangeCheck_Succeeds` |

### UT-B32-01-01：MIN/MAX_DYNAMIC_SPREAD 两键未配置（升级漏配）→ 点差恒为 0

| 字段 | 内容 |
| --- | --- |
| 前置条件 | 公共 fixture 已配置；目标市场 `minDynamicSpreadKey(marketIndex,true)`、`maxDynamicSpreadKey(marketIndex,true)` 显式清零（模拟「未执行 configureMarket 对这两键的写入循环」的升级事故） |
| 测试数据 | rawSpread = 110000000000000（1.1e14，由公共 fixture 推导） |
| 操作步骤 | 1. 清零两键；2. 调用 `PositionPricingUtils.getDynamicSpread` 传入基准开多单参数；3. 读取返回的 `dynamicSpread` |
| 核对数据 | `dynamicSpread` |
| 期望结果 | `dynamicSpread = 0`。推导：`Calc.clamp(1.1e14, 0, 0)`，value(1.1e14) > max(0) → 返回 max = 0 |
| 实际结果 | **PASS**（2026-08-23，forge test，见执行记录） |

### UT-B32-01-02～04：MIN_DYNAMIC_SPREAD 三点钳制（max 固定为不生效的 1e18）

| 数据点 | min 取值 | 期望 dynamicSpread | 推导 |
| --- | --- | --- | --- |
| P1（阈值前，raw≥min） | raw−1 = 109999999999999 | 110000000000000（不钳） | value ≥ min，`Calc.clamp` 不改变 value |
| P2（阈值等于） | raw = 110000000000000 | 110000000000000（不钳） | value == min 不满足 `value < min`，不进入抬升分支 |
| P3（阈值越过，raw<min） | raw+1 = 110000000000001 | 110000000000001（抬升到 min） | value < min → 返回 min |

| 字段 | 内容 |
| --- | --- |
| 前置条件 | 公共 fixture 已配置 |
| 测试数据 | 见上表三点 |
| 操作步骤 | 每点：1. 写入 min/max；2. 调用 `getDynamicSpread`；3. 读 `dynamicSpread` |
| 核对数据 | `dynamicSpread` |
| 期望结果 | 见上表 |
| 实际结果 | **PASS**（P1/P2/P3 均通过，2026-08-23，forge test） |

### UT-B32-01-05～07：MAX_DYNAMIC_SPREAD 三点钳顶（min 固定为不生效的 −2e16）

| 数据点 | max 取值 | 期望 dynamicSpread | 推导 |
| --- | --- | --- | --- |
| P1（阈值前，raw≤max） | raw+1 = 110000000000001 | 110000000000000（不钳） | value ≤ max，不进入下压分支 |
| P2（阈值等于） | raw = 110000000000000 | 110000000000000（不钳） | value == max 不满足 `value > max` |
| P3（阈值越过，raw>max） | raw−1 = 109999999999999 | 109999999999999（下压到 max） | value > max → 返回 max |

| 字段 | 内容 |
| --- | --- |
| 前置条件 | 公共 fixture 已配置 |
| 测试数据 | 见上表三点 |
| 操作步骤 | 每点：1. 写入 min/max；2. 调用 `getDynamicSpread`；3. 读 `dynamicSpread` |
| 核对数据 | `dynamicSpread` |
| 期望结果 | 见上表 |
| 实际结果 | **PASS**（P1/P2/P3 均通过，2026-08-23，forge test） |

### UT-B32-01-08～11：Config.setInt 写入权限与无范围校验

| 字段 | 内容 |
| --- | --- |
| 前置条件 | K1=`configKeeper`（已授予 `Role.CONFIG_KEEPER`）；K2=`limitedConfigKeeper`（已授予 `Role.LIMITED_CONFIG_KEEPER`）；K3=`trader`（无角色）。`MIN_DYNAMIC_SPREAD` 基键在 `Config.sol::_initAllowedBaseKeys` 属于 `allowedBaseKeys`（CONFIG_KEEPER 专属），不在 `allowedLimitedBaseKeys` |
| 测试数据 | 正常值 −2e16；极端值 −1e18（−100%，业务不合理但无范围保护） |
| 操作步骤 | 1. K3 调 `config.setInt(MIN_DYNAMIC_SPREAD, ..., -2e16)`；2. K2 调同一调用；3. K1 调正常值；4. K1 调极端值 −1e18；5. 每步读回 `dataStore.getInt` |
| 核对数据 | revert 选择器与参数；`dataStore.getInt(minDynamicSpreadKey(...))` 读回值 |
| 期望结果 | K3 → revert `FxErrors.Unauthorized(trader, bytes32("LIMITED / CONFIG KEEPER"))`（`onlyKeeper` 修饰器）；K2 → revert `FxErrors.InvalidBaseKey(MIN_DYNAMIC_SPREAD)`（`_validateKey` 里不在 `allowedLimitedBaseKeys`）；K1 正常值 → 成功，读回 −2e16；K1 极端值 −1e18 → **同样成功**，读回 −1e18（`setInt` 只有 `onlyKeeper` + `_validateKey`，不经 `ConfigUtils.validateRange`，越界防护完全依赖运行时 `Calc.clamp`，这是已确认的设计现状，不是本用例要断言的缺陷） |
| 实际结果 | **PASS**（4 个子用例均通过，2026-08-23，forge test） |

## 已知范围限制（不在本单元测试文档覆盖，需求已在别处登记）

- B32-1-02（usdDelta 零值/最小非零）、B32-1-05（max<min 组合错误自愈）、B32-1-06/07（负点差改善平衡/清算-ADL floor-at-0）、B32-1-08（双价选价与执行价取整）：这些场景涉及 OI 失衡构造或双价 oracle，05 文档已给出精确期望值推导，且已收编为 [E2E SCN-B32-01](../../E2E/versions/v0.3.2/cases/SCN-B32.md)（挂 S05），按 `Docs/contract-releases/v0.3.2/06-测试影响与准入结论.md` B-2 追踪，待 v0.3.2 环境执行，不在本单元测试文档重复设计。

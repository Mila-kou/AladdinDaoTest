# TestCode/unit — 单元测试（Foundry）主副本与同步工作流

这里存放 FX100 工作区自己维护的 Foundry 单元测试**主副本**（`src/*.t.sol`），对应的用例设计文档在 [`TestCase/UT/`](../../TestCase/UT/README.md)。

## 为什么单测代码不直接写进 `Github/` 下的合约克隆

`Github/fx100-contracts@release-vX.X` 是按 `<仓库名>@<分支名>` 命名的 git worktree/克隆，**每个版本一个独立目录**。切换测试基线（例如 v0.3.2 → v0.3.3）时，`CURRENT.json` 会指向一个新拉取的目录——那是一份从官方 `release/v0.3.3` 分支全新检出的代码，**不会自动带上旧目录里手写的测试文件**，哪怕旧目录里的文件已经 `git commit` 过（两个版本分支在 git 历史上没有父子关系，不会被自动合并）。

如果把单测直接写在 `Github/fx100-contracts@release-v0.3.2/test/` 里：
- 文件本身不会丢（旧目录还在，可以手动去翻），但**不会自动出现在新版本目录里**，每次升级都要人工搬运，且升级时经常忘记搬。
- 换版本后旧用例可能因为函数签名/计算逻辑变了而断言错误，却没有强制的"重新核对"步骤。

解决方式：主副本放在**本仓库自己的 git 仓库**（`TestCode/unit/src/`），跟着 `FX100` 工作区自己的分支走，永远不因为合约那边切版本而丢失或需要手动搬运。执行前用 `sync.mjs` 把它"投影"一份进当前 `CURRENT.json` 登记的合约 worktree 里再跑 `forge test`。

## 用法

```bash
# 同步进 CURRENT.json 登记的主测版本（默认行为，推荐）
node TestCode/unit/sync.mjs --clean

# 跑刚同步进去的用例
cd Github/fx100-contracts@release-v0.3.2   # 以 CURRENT.json 当前登记为准
forge test --match-path "test/integration/ut-custom/*" -vv

# 跑全量（既有 forge 套件 + 本目录新增用例），确认没有互相干扰
forge test
```

同步目标目录 `test/integration/ut-custom/` 由脚本自动写入 `.gitignore`（内容 `*`），即使忘记清理也不会被误提交进合约仓自己的 git 历史；`ut-custom/` 本身不是合约仓的一部分，不要在合约仓里对它执行 `git add`。

## 版本升级时怎么办

1. 按工作区约定拉取/建立新版本的合约 worktree（`Github/fx100-contracts@release-vX.X`），更新 `Docs/contract-releases/CURRENT.json`。
2. 跑 `node TestCode/unit/sync.mjs --clean`，把本目录现有用例投影进新 worktree。
3. 跑 `forge test --match-path "test/integration/ut-custom/*"`：
   - 全绿 → 说明新版本没有改动这些用例覆盖的计算逻辑，直接可用，把执行记录（PASS + 日期 + 新版本号）补进对应 `TestCase/UT/case/*.md`。
   - 有 FAIL → **不要直接改测试代码让它通过**，先去看新版本对应函数的 diff（参照该版本自己的 `01-代码变化分析.md`），确认是"预期内的行为变化"还是"真的引入了回归"，再决定更新期望值还是报缺陷。
   - 编译报错（导入路径/函数签名变了）→ 说明被测函数的接口变了，需要人工改一版主副本，改完后原理同上仍要重新走一遍全绿确认，不能跳过。
4. 旧版本的用例文件不必删除——它们对应的是"这个函数在旧版本里应该怎么算"，删掉了以后想追溯旧行为反而麻烦；新增/修改的用例直接加进 `src/` 即可，文件按主题命名，不按版本号命名。

## 当前用例文件

| 文件 | 覆盖对象 | 对应设计文档 |
| --- | --- | --- |
| `src/DynamicSpreadClampBoundary.t.sol` | `MIN/MAX_DYNAMIC_SPREAD` int256 clamp 边界（v0.3.2 新增功能） | `TestCase/UT/case/UT-B32-01-DynamicSpreadClamp.md` |
| `src/LiquidationFeeTierRegression.t.sol` | 清算可行性判定手续费档位回归（v0.3.2 修复 commit `13880f2`） | `TestCase/UT/case/UT-R5B02-LiquidationFeeTier.md` |

## 最近一次执行记录

- 2026-08-23，`fx100-contracts@release-v0.3.2` @ `13880f2`：`forge test`（全量）99 passed / 0 failed / 0 skipped（85 条既有 + 14 条本目录新增）。
- 同日对照实验：临时替换 `PositionUtils.sol` 为修复前版本（父提交 `7d639c9`），`LiquidationFeeTierRegression.t.sol` 两条断言按预期 FAIL，证明该回归测试确实能捕获 R5-B02 缺陷（细节见 `TestCase/UT/case/UT-R5B02-LiquidationFeeTier.md`「回归有效性独立验证」一节），随后已还原代码并确认 `git diff` 为空。

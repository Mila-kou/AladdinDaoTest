# FX100：Git Worktree 前端与合约更新命令

## 1. Worktree 与远端分支对应关系

| 内容 | 本地 worktree | 更新来源 |
| --- | --- | --- |
| 前端 | `/Users/milakou/Documents/FX100/Github/fx100-apps@develop` | `origin/develop` |
| 合约 | `/Users/milakou/Documents/FX100/Github/fx100-contracts@release-v0.3.1` | `origin/release/v0.3.1` |

Worktree 只是同一个 Git 仓库下的独立工作目录，更新方式和普通 Git 目录相同。关键是要在正确的 worktree 中拉取对应分支。

## 2. 只更新代码，不安装依赖、不编译

如果两个目录都没有需要保留的未提交修改，执行下面四行即可：

```bash
# 查看前端状态，然后把前端更新到 origin/develop 的最新代码
git -C /Users/milakou/Documents/FX100/Github/fx100-apps@develop status --short --branch
git -C /Users/milakou/Documents/FX100/Github/fx100-apps@develop pull --ff-only origin develop

# 查看合约状态，然后把合约更新到 origin/release/v0.3.1 的最新代码
git -C /Users/milakou/Documents/FX100/Github/fx100-contracts@release-v0.3.1 status --short --branch
git -C /Users/milakou/Documents/FX100/Github/fx100-contracts@release-v0.3.1 pull --ff-only origin release/v0.3.1
```

如果只更新其中一套代码，只执行对应的两行。

这里没有执行 `git add`、`git commit` 或 `git push`，所以不会提交本地内容，也不会向远端上传任何内容。

## 3. 本地有修改，但不想提交，只想更新远端代码

推荐先用 `git stash` 临时收起本地修改。这样不会产生 commit，而且旧内容仍可恢复，比直接删除更安全。

### 3.1 前端

```bash
cd /Users/milakou/Documents/FX100/Github/fx100-apps@develop

# 先确认有哪些本地修改
git status --short --branch
git diff

# 临时收起已跟踪文件的本地修改，不创建 commit
git stash push -m "frontend local changes before update"

# 拉取远端 develop 最新代码
git pull --ff-only origin develop

# 确认更新结果；之前的本地修改仍保存在 stash 中
git status --short --branch
git stash list
```

### 3.2 合约

```bash
cd /Users/milakou/Documents/FX100/Github/fx100-contracts@release-v0.3.1

# 先确认有哪些本地修改
git status --short --branch
git diff

# 临时收起已跟踪文件的本地修改，不创建 commit
git stash push -m "contracts local changes before update"

# 拉取远端 release/v0.3.1 最新代码
git pull --ff-only origin release/v0.3.1

# 确认更新结果；之前的本地修改仍保存在 stash 中
git status --short --branch
git stash list
```

如果旧的本地修改已经不需要，更新后**不要执行 `git stash pop`**，当前目录就会保持为新拉取的代码。stash 暂时保留作为可恢复备份，确认无误后再决定是否清理。

如果之后发现还需要恢复旧修改，执行：

```bash
# 先查看备份列表，确认要恢复的是哪一条
git stash list

# 恢复最近一条 stash；如新旧代码修改了同一位置，可能需要手动解决冲突
git stash pop
```

> `git stash push` 默认只收起已跟踪文件的修改，不会处理未跟踪文件。不要在合约目录随意增加 `-u`，否则未跟踪的部署文件也会被一起收起。

## 4. 更新代码后，按需安装依赖和编译

下面这些命令不是“拉取代码”必需步骤。只有依赖锁文件发生变化，或者需要验证项目能否正常构建时再执行。

### 前端

```bash
cd /Users/milakou/Documents/FX100/Github/fx100-apps@develop

# 严格按照 yarn.lock 安装依赖，不允许安装过程改写锁文件
yarn install --frozen-lockfile

# 编译前端，验证更新后的代码
yarn build
```

### 合约

```bash
cd /Users/milakou/Documents/FX100/Github/fx100-contracts@release-v0.3.1

# 严格按照 package-lock.json 重新安装依赖
npm ci

# 编译合约，验证更新后的代码
npm run compile
```

## 5. 命令解释

| 命令 | 作用 | 是否修改远端 |
| --- | --- | --- |
| `cd <目录>` | 切换到指定 worktree | 否 |
| `git -C <目录> ...` | 不切换当前目录，直接在指定 worktree 执行 Git 命令 | 否 |
| `git status --short --branch` | 简要显示当前分支、已修改文件和未跟踪文件 | 否 |
| `git diff` | 查看尚未提交的具体代码差异 | 否 |
| `git stash push -m "说明"` | 临时收起已跟踪文件的本地修改，不创建 commit | 否 |
| `git stash list` | 查看已保存的本地修改备份 | 否 |
| `git stash pop` | 恢复最近一条 stash，并从 stash 列表移除 | 否 |
| `git pull --ff-only origin <分支>` | 从远端下载代码，并且只允许安全的快进更新 | 否，不会上传代码 |
| `yarn install --frozen-lockfile` | 按 `yarn.lock` 安装前端依赖 | 否 |
| `yarn build` | 编译前端项目 | 否 |
| `npm ci` | 按 `package-lock.json` 安装合约依赖 | 否 |
| `npm run compile` | 编译合约项目 | 否 |

`git pull --ff-only` 的好处是：如果本地分支和远端分支已经分叉，它会停止并报错，不会自动生成 merge commit，也不会悄悄覆盖本地提交。

## 6. 注意事项

- 合约 worktree 中存在未跟踪的部署文件，例如 `base_sepolia_v0.3.1_260729/`。不要执行 `git clean -fd`，否则这些文件会被直接删除。
- 不建议为了更新代码执行 `git reset --hard`；它会直接丢弃已跟踪文件的本地修改。使用 `git stash` 可以保留恢复机会。
- 如果 `git pull --ff-only` 提示本地修改会被覆盖，先执行 `git status` 和 `git diff`，再按第 3 节收起修改。
- 如果 `git pull --ff-only` 提示无法快进，说明本地可能有额外 commit。先不要强制覆盖，使用下面的命令确认历史：

```bash
git status
git log --oneline --decorate --graph -10
```

## 7. 最常用结论

- **工作区干净，只更新代码：**执行第 2 节的 `git pull --ff-only`。
- **本地有修改、不提交、旧修改也不想混回新代码：**执行 `git stash push`，再执行 `git pull --ff-only`；更新后不要执行 `git stash pop`。
- **以后可能还要本地修改：**保留 stash；需要时查看 `git stash list` 后再恢复。

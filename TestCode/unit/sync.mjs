#!/usr/bin/env node
// 把工作区自维护的 Foundry 单测主副本（TestCode/unit/src/）同步进当前合约 worktree 的
// test/integration/ut-custom/，再在合约仓里跑 forge test。
//
// 为什么要同步而不是直接在 Github/ 下的合约克隆里写测试文件：
// Github/fx100-contracts@release-vX.X 是按分支/版本各开一个独立目录（git worktree），
// 版本升级时（如 v0.3.2 -> v0.3.3）会是全新目录，不会自动带上旧目录里的文件。
// 把主副本放在本仓库自己的 TestCode/unit/src/ 下，可以让这些用例跟着 FX100 工作区自己的
// git 历史走（不因合约切版本而丢失），每次对新版本回归前用本脚本"投影"一份过去即可。
//
// 用法：
//   node TestCode/unit/sync.mjs                          # 同步进 Docs/contract-releases/CURRENT.json 登记的主测版本
//   node TestCode/unit/sync.mjs --repo <worktree路径>      # 显式指定目标合约 worktree
//   node TestCode/unit/sync.mjs --clean                   # 同步前先清空目标目录（去除已删除的旧用例文件）

import { existsSync, mkdirSync, readdirSync, copyFileSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "..", "..");
const srcDir = path.join(__dirname, "src");

function resolveTargetRepo(argv) {
  const explicit = argv.indexOf("--repo");
  if (explicit !== -1 && argv[explicit + 1]) {
    return path.resolve(argv[explicit + 1]);
  }

  const currentJsonPath = path.join(workspaceRoot, "Docs", "contract-releases", "CURRENT.json");
  if (!existsSync(currentJsonPath)) {
    throw new Error(`未找到 ${currentJsonPath}，请用 --repo 显式指定目标合约 worktree`);
  }
  const current = JSON.parse(readFileSync(currentJsonPath, "utf8"));
  const repoPath = current?.primary?.repoPath;
  if (!repoPath) {
    throw new Error("CURRENT.json 缺少 primary.repoPath，请用 --repo 显式指定目标合约 worktree");
  }
  return path.join(workspaceRoot, repoPath);
}

function main() {
  const argv = process.argv.slice(2);
  const clean = argv.includes("--clean");
  const targetRepo = resolveTargetRepo(argv);
  const targetDir = path.join(targetRepo, "test", "integration", "ut-custom");

  if (!existsSync(targetRepo)) {
    throw new Error(`目标合约 worktree 不存在：${targetRepo}`);
  }

  if (clean && existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true });
  }
  mkdirSync(targetDir, { recursive: true });

  const files = readdirSync(srcDir).filter((f) => f.endsWith(".t.sol"));
  if (files.length === 0) {
    console.log(`[sync] ${srcDir} 下没有 .t.sol 文件，无需同步`);
    return;
  }

  for (const file of files) {
    copyFileSync(path.join(srcDir, file), path.join(targetDir, file));
    console.log(`[sync] ${file} -> ${path.relative(workspaceRoot, path.join(targetDir, file))}`);
  }

  // 双保险：即使忘记事后清理，也不会被误 commit 进合约仓自己的 git 历史。
  writeFileSync(path.join(targetDir, ".gitignore"), "*\n");

  console.log(`\n[sync] 完成，共 ${files.length} 个文件同步进 ${path.relative(workspaceRoot, targetDir)}`);
  console.log(`[sync] 目标 worktree 内 test/integration/ut-custom/ 为生成产物，不属于该合约仓的 git 历史，`);
  console.log(`[sync] 不要在合约仓里对它执行 git add/commit；主副本的修改只回到本仓库的 TestCode/unit/src/。`);
}

main();

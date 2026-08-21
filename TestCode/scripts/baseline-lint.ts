/**
 * 基线引用 lint：全工作区扫描「当前 / 主测 / CURRENT / 基线 / 适用基线 / 代码版本」附近写死的版本号，
 * 与 Docs/contract-releases/CURRENT.json primary 比对，找出切换基线后未同步的过期引用。
 *
 * 用法（TestCode 根目录）：
 *   npm run baseline:lint                 # 有 stale 退出码 1
 *   npm run baseline:lint -- --warn-only  # 仅告警，退出码 0
 *   npm run baseline:lint -- --json       # 机器可读输出
 *
 * 判定规则：
 *   - 命中行：关键词与版本字面量（release[/-]vN.N.N 或 vN.N.N）相距 ≤ 12 字；
 *   - 版本 = primary.version → 正常；
 *   - 版本 ≠ primary.version 且行内无「快照 / pinned / 对比基线 / 历史 / @v」标注 → stale；
 *   - 允许清单 config/baseline-lint.allow.json（`file:line`、整文件路径或 `regex:` 前缀正则，均相对工作区根）。
 * 扫描范围：CLAUDE.md、Docs/**\/*.md（跳过 Docs/contract-releases/v*\/ 与 Docs/Gordon-Notion需求文档归档/）、
 * TestCase/**\/*.{md,csv}、TestCode/README.md、TestCode/docs/*.md、.claude/skills/**\/*.md。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import {
  baselineRegistryDisplayPath,
  loadBaselineRegistry,
  normalizeReleaseVersion,
} from '../src/config/baseline.js';

interface LintHit {
  readonly file: string;
  readonly line: number;
  readonly version: string;
  readonly literal: string;
  readonly keyword: string;
  readonly text: string;
  readonly verdict: 'ok' | 'annotated' | 'stale' | 'allowed';
  readonly reason: string;
}

const args = new Set(process.argv.slice(2));
const warnOnly = args.has('--warn-only');
const jsonOutput = args.has('--json');
const verbose = args.has('--verbose');

const projectRoot = process.cwd();
const workspaceRoot = resolve(projectRoot, '..');

const KEYWORDS = ['适用基线', '代码版本', '主测合约', '主测', '当前', 'CURRENT', '基线'];
const ANNOTATION_PATTERN = /快照|pinned|对比基线|历史|@v/i;
const VERSION_LITERAL_PATTERN = /release[/-]v\d+\.\d+\.\d+|v\d+\.\d+\.\d+/g;
const KEYWORD_DISTANCE = 12;

const SCAN_TARGETS: ReadonlyArray<{
  readonly root: string;
  readonly extensions: readonly string[];
  readonly recursive: boolean;
  readonly skip?: (relativePath: string) => boolean;
}> = [
  { root: 'CLAUDE.md', extensions: ['.md'], recursive: false },
  {
    root: 'Docs',
    extensions: ['.md'],
    recursive: true,
    skip: (path) => /^Docs\/contract-releases\/v[^/]*\//.test(path) || path.startsWith('Docs/Gordon-Notion需求文档归档/'),
  },
  { root: 'TestCase', extensions: ['.md', '.csv'], recursive: true },
  { root: 'TestCode/README.md', extensions: ['.md'], recursive: false },
  { root: 'TestCode/docs', extensions: ['.md'], recursive: false },
  { root: '.claude/skills', extensions: ['.md'], recursive: true },
];

function toPosix(path: string): string {
  return path.split(sep).join('/');
}

function collectFiles(): string[] {
  const files = new Set<string>();
  for (const target of SCAN_TARGETS) {
    const absolute = resolve(workspaceRoot, target.root);
    let stats;
    try {
      stats = statSync(absolute);
    } catch {
      continue;
    }
    if (stats.isFile()) {
      files.add(toPosix(relative(workspaceRoot, absolute)));
      continue;
    }
    const stack = [absolute];
    while (stack.length) {
      const directory = stack.pop()!;
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.name.startsWith('.') && entry.name !== '.claude') continue;
        if (entry.name === 'node_modules') continue;
        const path = join(directory, entry.name);
        const relativePath = toPosix(relative(workspaceRoot, path));
        if (entry.isDirectory()) {
          if (!target.recursive) continue;
          if (target.skip?.(`${relativePath}/`)) continue;
          stack.push(path);
          continue;
        }
        if (!entry.isFile()) continue;
        if (!target.extensions.some((extension) => entry.name.endsWith(extension))) continue;
        if (target.skip?.(relativePath)) continue;
        files.add(relativePath);
      }
    }
  }
  return [...files].sort();
}

interface AllowRule {
  readonly raw: string;
  readonly test: (file: string, line: number) => boolean;
}

function loadAllowRules(): AllowRule[] {
  const path = resolve(projectRoot, 'config', 'baseline-lint.allow.json');
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    return [];
  }
  const entries = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { allow?: unknown }).allow)
      ? (parsed as { allow: unknown[] }).allow
      : [];
  return entries.flatMap((entry): AllowRule[] => {
    if (typeof entry !== 'string' || !entry.trim()) return [];
    const raw = entry.trim();
    if (raw.startsWith('regex:')) {
      const pattern = new RegExp(raw.slice('regex:'.length));
      return [{ raw, test: (file, line) => pattern.test(`${file}:${line}`) }];
    }
    const match = /^(.*):(\d+)$/.exec(raw);
    if (match) {
      const [, file, line] = match;
      return [{ raw, test: (candidateFile, candidateLine) => candidateFile === file && candidateLine === Number(line) }];
    }
    return [{ raw, test: (file) => file === raw || file.startsWith(`${raw.replace(/\/$/, '')}/`) }];
  });
}

function nearbyKeyword(line: string, start: number, end: number): string | undefined {
  const windowStart = Math.max(0, start - KEYWORD_DISTANCE);
  const windowEnd = Math.min(line.length, end + KEYWORD_DISTANCE);
  const window = line.slice(windowStart, windowEnd);
  // 先匹配长关键词（适用基线 / 代码版本 / 主测合约），避免「基线」吞掉「适用基线」的语义。
  return KEYWORDS.find((keyword) => window.includes(keyword));
}

function lintFile(
  file: string,
  primaryVersion: string,
  allowRules: readonly AllowRule[],
): LintHit[] {
  const hits: LintHit[] = [];
  let content: string;
  try {
    content = readFileSync(resolve(workspaceRoot, file), 'utf8');
  } catch {
    return hits;
  }
  const lines = content.split(/\r?\n/);
  lines.forEach((text, index) => {
    const lineNumber = index + 1;
    VERSION_LITERAL_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    const seenVersions = new Set<string>();
    while ((match = VERSION_LITERAL_PATTERN.exec(text)) !== null) {
      const literal = match[0];
      const version = normalizeReleaseVersion(literal);
      if (!version) continue;
      const keyword = nearbyKeyword(text, match.index, match.index + literal.length);
      if (!keyword) continue;
      if (seenVersions.has(version)) continue;
      seenVersions.add(version);
      const base = { file, line: lineNumber, version, literal, keyword, text: text.trim().slice(0, 200) };
      if (version === primaryVersion) {
        hits.push({ ...base, verdict: 'ok', reason: `= primary ${primaryVersion}` });
        continue;
      }
      if (ANNOTATION_PATTERN.test(text)) {
        hits.push({ ...base, verdict: 'annotated', reason: '行内有 快照/pinned/对比基线/历史/@v 标注' });
        continue;
      }
      const allow = allowRules.find((rule) => rule.test(file, lineNumber));
      if (allow) {
        hits.push({ ...base, verdict: 'allowed', reason: `允许清单 ${allow.raw}` });
        continue;
      }
      hits.push({
        ...base,
        verdict: 'stale',
        reason: `关键词「${keyword}」附近写死 ${literal}（${version}）≠ primary ${primaryVersion}，且无 快照/pinned/对比基线/历史/@v 标注`,
      });
    }
  });
  return hits;
}

const registry = loadBaselineRegistry(projectRoot, { reload: true });
if (!registry) {
  console.error(`baseline-lint: 无法读取基线登记 ${baselineRegistryDisplayPath(projectRoot)}，无法比对。`);
  process.exitCode = warnOnly ? 0 : 1;
} else {
  const primaryVersion = normalizeReleaseVersion(registry.primary.version)!;
  const comparisonVersion = normalizeReleaseVersion(registry.comparison?.version);
  const allowRules = loadAllowRules();
  const files = collectFiles();
  const hits = files.flatMap((file) => lintFile(file, primaryVersion, allowRules));
  const stale = hits.filter((hit) => hit.verdict === 'stale');
  const annotated = hits.filter((hit) => hit.verdict === 'annotated');
  const allowed = hits.filter((hit) => hit.verdict === 'allowed');
  const ok = hits.filter((hit) => hit.verdict === 'ok');

  if (jsonOutput) {
    console.log(JSON.stringify({
      registry: baselineRegistryDisplayPath(projectRoot),
      primary: primaryVersion,
      comparison: comparisonVersion ?? null,
      scannedFiles: files.length,
      counts: { ok: ok.length, annotated: annotated.length, allowed: allowed.length, stale: stale.length },
      stale,
      ...(verbose ? { annotated, allowed, ok } : {}),
    }, null, 2));
  } else {
    console.log(`baseline-lint: 基线登记 ${baselineRegistryDisplayPath(projectRoot)} → primary ${primaryVersion}`
      + `${comparisonVersion ? `，comparison ${comparisonVersion}` : ''}；扫描 ${files.length} 个文件，`
      + `命中 ${hits.length} 处（= primary ${ok.length} · 已标注 ${annotated.length} · 允许清单 ${allowed.length} · 过期 ${stale.length}）`);
    for (const hit of stale) {
      console.log(`${warnOnly ? 'WARN' : 'STALE'} ${hit.file}:${hit.line} ${hit.reason}`);
      console.log(`      ${hit.text}`);
    }
    if (verbose) {
      for (const hit of [...annotated, ...allowed]) {
        console.log(`${hit.verdict.toUpperCase()} ${hit.file}:${hit.line} ${hit.literal} — ${hit.reason}`);
      }
    }
    if (stale.length === 0) console.log('baseline-lint: 无过期基线引用。');
  }
  process.exitCode = stale.length > 0 && !warnOnly ? 1 : 0;
}

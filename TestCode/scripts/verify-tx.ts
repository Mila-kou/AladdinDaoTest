/**
 * verify:tx —— 按 tx hash 手工核对 CLI（v0.3.2 合约口径）。
 *
 * 用法：
 *   npm run verify:tx -- --env tx-fork --tx 0x… [--tx 0x…] [--case XT-MKT-OPEN-001]
 *     [--contract-version v0.3.2] [--contract-head <sha>] [--frontend-head <sha>] [--executed-at <iso>]
 *     [--chain-id N] [--note "…"] [--out <path>] [--json]
 *
 * 流程：解析参数 → runTxVerify（src/reconciliation/verify-tx.ts，与看板 POST /api/verify-tx 共用同一 runner：
 *   buildEnvelopeFromTxHashes → 选核对包 → check-engine → aggregateReport → 唯一结论 → 证据 JSON 对象）
 *   → 终端表格 + 元数据块 → 写证据 JSON（结构与跑批附件一致：evidenceV2 + reconciliationReport + checks）。
 *
 * 退出码：任一 blocking FAIL 或 INVALID_EVIDENCE → 1；只有 NOT_VERIFIED / 缺 pack / warning FAIL → 2；
 *   全 PASS 且无缺口 → 0；参数或链上读取错误 → 3。
 *
 * 纪律：期望值与判定全部来自 packs（本文件不实现任何公式，也不复制 runner 逻辑）；证据等级由
 *   CheckRecord.verification 如实呈现，缺 execBlock−1 状态的行由引擎降级为 NOT_VERIFIED，这里绝不改写；
 *   错误文本先脱敏再打印（不外泄 RPC URL）。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { environmentNames } from '../config/environments/catalog.js';
import type { EvidenceEnvelope as EvidenceEnvelopeV2, Hex } from '../src/evidence/evidence-v2.js';
import {
  CASE_ID_PATTERN,
  compactTimestamp,
  errorMessage,
  labelOf,
  maskText,
  runTxVerify,
  sectionOf,
  stringifyArtifact,
  TX_HASH_PATTERN,
  TxVerifyChainError,
  valueOf,
  type PlanSelection,
  type TxVerifyMetadata,
  type TxVerifyOverrides,
  type TxVerifyRun,
} from '../src/reconciliation/verify-tx.js';
import type { CheckRecord, ReconciliationReport } from '../src/reconciliation/schema/check-record.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);

interface CliOptions {
  readonly env: string;
  readonly hashes: Hex[];
  readonly caseId?: string;
  readonly overrides: TxVerifyOverrides;
  readonly out?: string;
  readonly json: boolean;
  readonly help: boolean;
}

function usage(): string {
  return [
    '用法：npm run verify:tx -- --env <env> --tx 0x… [--tx 0x…] [选项]',
    '',
    `  --env <name>              环境（${environmentNames.join(' / ')}），必填`,
    '  --tx <hash>               交易哈希，可重复或用逗号分隔，必填',
    '  --case <id>               用例编号（CT/XT/FT-…-NNN 或 SCN-NNN）；缺省 adhoc',
    '  --contract-version <v>    覆盖合约版本（默认按 CURRENT.json environments.<env>.forkOf 解析）',
    '  --contract-head <sha>     覆盖合约 head',
    '  --frontend-head <sha>     覆盖前端 head',
    '  --executed-at <iso>       覆盖执行时间（默认最后一笔 tx 的区块时间）',
    '  --chain-id <n>            覆盖 chainId（默认 mock-resources / 绑定表登记值）',
    '  --note "…"                备注，随元数据写入证据',
    '  --out <path>              证据 JSON 输出路径；默认 artifacts/manual-verify/<env>/<yyyyMMdd-HHmmss>-<case|adhoc>.json',
    '  --json                    终端改打印完整证据 JSON（表格省略）',
    '',
    '退出码：1 = 任一 blocking FAIL 或 INVALID_EVIDENCE；2 = 只有 NOT_VERIFIED / 缺 pack；0 = 全 PASS；3 = 参数或读链错误。',
  ].join('\n');
}

function parseCli(argv: readonly string[]): CliOptions {
  let env = '';
  const hashes: Hex[] = [];
  let caseId: string | undefined;
  let out: string | undefined;
  let json = false;
  let help = false;
  const overrides: {
    contractVersion?: string; contractHead?: string; frontendHead?: string; executedAt?: string; chainId?: number; note?: string;
  } = {};
  const takeValue = (flag: string, index: number): string => {
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} 缺少参数值`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    switch (arg) {
      case '--help':
      case '-h':
        help = true;
        break;
      case '--json':
        json = true;
        break;
      case '--env':
        env = takeValue(arg, index);
        index += 1;
        break;
      case '--tx':
        for (const piece of takeValue(arg, index).split(',')) {
          const hash = piece.trim();
          if (!hash) continue;
          if (!TX_HASH_PATTERN.test(hash)) throw new Error(`--tx 不是合法交易哈希：${hash}`);
          hashes.push(hash.toLowerCase() as Hex);
        }
        index += 1;
        break;
      case '--case':
        caseId = takeValue(arg, index).trim();
        if (!CASE_ID_PATTERN.test(caseId)) {
          throw new Error(`--case=${caseId} 不符合用例编号规范（CT|XT|FT-<域>[-<子段>]-NNN 或 SCN-NNN）`);
        }
        index += 1;
        break;
      case '--contract-version':
        overrides.contractVersion = takeValue(arg, index);
        index += 1;
        break;
      case '--contract-head':
        overrides.contractHead = takeValue(arg, index);
        index += 1;
        break;
      case '--frontend-head':
        overrides.frontendHead = takeValue(arg, index);
        index += 1;
        break;
      case '--executed-at':
        overrides.executedAt = takeValue(arg, index);
        index += 1;
        break;
      case '--chain-id': {
        const raw = takeValue(arg, index);
        const parsed = Number(raw);
        if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`--chain-id=${raw} 不是正整数`);
        overrides.chainId = parsed;
        index += 1;
        break;
      }
      case '--note':
        overrides.note = takeValue(arg, index);
        index += 1;
        break;
      case '--out':
        out = takeValue(arg, index);
        index += 1;
        break;
      default:
        throw new Error(`未知参数：${arg}（--help 查看用法）`);
    }
  }
  if (!help) {
    if (!env) throw new Error('缺少 --env');
    if (!environmentNames.includes(env as (typeof environmentNames)[number])) {
      throw new Error(`--env=${env} 不在可信环境目录 ${environmentNames.join('/')} 中`);
    }
    if (hashes.length === 0) throw new Error('至少提供一个 --tx');
  }
  return {
    env,
    hashes: [...new Set(hashes)],
    ...(caseId ? { caseId } : {}),
    overrides,
    ...(out ? { out } : {}),
    json,
    help,
  };
}

// ---------------------------------------------------------------------------
// 展示
// ---------------------------------------------------------------------------

function clip(text: string, width: number): string {
  const chars = [...text];
  return chars.length <= width ? text : `${chars.slice(0, Math.max(0, width - 1)).join('')}…`;
}

/** 终端宽字符（CJK / 全角）按 2 列计算，保证表格对齐。 */
function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    width += code >= 0x1100 && (code <= 0x115f || (code >= 0x2e80 && code <= 0xa4cf) || (code >= 0xac00 && code <= 0xd7a3)
      || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xfe30 && code <= 0xfe4f) || (code >= 0xff00 && code <= 0xff60)
      || (code >= 0xffe0 && code <= 0xffe6) || (code >= 0x20000 && code <= 0x3fffd)) ? 2 : 1;
  }
  return width;
}

function pad(text: string, width: number): string {
  return `${text}${' '.repeat(Math.max(0, width - displayWidth(text)))}`;
}

function renderTable(header: readonly string[], rows: ReadonlyArray<readonly string[]>): string {
  const widths = header.map((title, column) => Math.max(displayWidth(title), ...rows.map((row) => displayWidth(row[column] ?? ''))));
  const line = (cells: readonly string[]) => cells.map((cell, column) => pad(cell, widths[column] ?? 0)).join('  ').trimEnd();
  const separator = widths.map((width) => '-'.repeat(width)).join('  ');
  return [line(header), separator, ...rows.map(line)].join('\n');
}

function renderChecks(checks: readonly CheckRecord[]): string {
  if (checks.length === 0) return '（无核对行）';
  const rows = checks.map((check) => [
    `${check.actionId} ${check.id}`,
    clip(labelOf(check), 22),
    check.verification,
    `${check.verdict}${check.severity === 'warning' ? '(warn)' : ''}`,
    clip(valueOf(check.expected), 26),
    clip(valueOf(check.actual), 26),
    clip(check.formula?.expanded ?? '—', 48),
    sectionOf(check),
  ]);
  return renderTable(['action / id', '名称', 'verification', 'verdict', 'expected', 'actual', 'formula', 'formulaBasis §'], rows);
}

function renderMetadata(metadata: TxVerifyMetadata, envelope: EvidenceEnvelopeV2): string {
  const overridden = Object.entries(metadata.resolvedFrom).filter(([, origin]) => origin === 'override').map(([field]) => field);
  const lines = [
    `环境            ${metadata.env}（forkOf=${metadata.forkOf} · deployment=${metadata.deploymentId ?? '—'} · manifest=${metadata.deploymentManifest ?? '—'}）`,
    `chainId         ${metadata.chainId}（${metadata.resolvedFrom.chainId ?? 'default'}；${metadata.sources.chainId ?? ''}）`
      + (metadata.rpcChainId !== undefined ? ` · RPC eth_chainId=${metadata.rpcChainId}${metadata.rpcChainId === metadata.chainId ? '' : ' ⚠ 不一致'}` : ''),
    `合约版本 / head  ${metadata.contractVersion} / ${metadata.contractHead}（${metadata.resolvedFrom.contractVersion ?? 'default'} / ${metadata.resolvedFrom.contractHead ?? 'default'}）`,
    `前端 head       ${metadata.frontendHead || '（空）'}（${metadata.resolvedFrom.frontendHead ?? 'default'}）`,
    `执行时间        ${metadata.executedAt}（${metadata.resolvedFrom.executedAt ?? 'default'}）`,
    `Fork            ${envelope.environment.fork?.displayName ?? '—'}${envelope.environment.fork?.forkBlockNumber ? ` @${envelope.environment.fork.forkBlockNumber}` : ''}`,
    `市场            ${envelope.environment.market ? `${envelope.environment.market.mode} #${envelope.environment.market.marketIndex ?? '?'}（${envelope.environment.market.resourceAlias ?? 'none'}）` : '—'}`,
    `override 字段   ${overridden.length > 0 ? overridden.join('、') : '无（全部取登记默认值）'}`,
    ...(metadata.note ? [`备注            ${metadata.note}`] : []),
  ];
  return lines.join('\n');
}

function renderTransactions(metadata: TxVerifyMetadata, envelope: EvidenceEnvelopeV2): string {
  const rows = metadata.perTx.map((tx) => {
    const action = envelope.actions.find((item) => item.actionId === tx.actionId);
    const transaction = action?.transactions[0];
    return [
      tx.actionId,
      tx.hash,
      tx.kind,
      action?.type ?? '—',
      tx.role,
      String(tx.blockNumber),
      tx.executedAtIso,
      transaction?.status ?? '—',
      tx.orderKey ? `${tx.orderKey.slice(0, 10)}…` : '—',
    ];
  });
  return renderTable(['action', 'tx', 'kind', 'type', 'role', 'block', '执行时间', 'status', 'orderKey'], rows);
}

function renderPlan(selection: PlanSelection, report: ReconciliationReport): string {
  const lines = [
    `计划            ${selection.plan.id}@${selection.plan.version}（${selection.trust === 'registered' ? '注册表可信计划' : 'adhoc · 未登记'}）· digest ${selection.digest}`,
    `已接入 pack     ${selection.applied.length > 0 ? selection.applied.join('、') : '无'}`,
    ...selection.excluded.map((item) => `排除 pack       ${item.id}：${item.reason}`),
    ...selection.noPack.map((gap) => `无 pack         ${gap.actionId} ${gap.kind}/${gap.type}：${gap.reason}`),
    ...selection.notes.map((note) => `说明            ${note}`),
    `报告状态        ${report.status} · layers ${Object.entries(report.layers).map(([layer, verdict]) => `${layer}=${verdict}`).join(' ')}`,
    ...(report.integrity.reasons.length > 0 ? [`完整性原因      ${report.integrity.reasons.map(maskText).join('；')}`] : []),
  ];
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function defaultOutPath(env: string, caseId: string | undefined, generatedAt: string): string {
  return resolve(ROOT, 'artifacts/manual-verify', env, `${compactTimestamp(generatedAt)}-${caseId ?? 'adhoc'}.json`);
}

async function main(): Promise<number> {
  let options: CliOptions;
  try {
    options = parseCli(process.argv.slice(2));
  } catch (error) {
    console.error(`参数错误：${errorMessage(error)}\n\n${usage()}`);
    return 3;
  }
  if (options.help) {
    console.log(usage());
    return 0;
  }

  let run: TxVerifyRun;
  try {
    run = await runTxVerify({
      env: options.env,
      hashes: options.hashes,
      ...(options.caseId ? { caseId: options.caseId } : {}),
      overrides: options.overrides,
      projectRoot: ROOT,
      source: 'scripts/verify-tx.ts',
    });
  } catch (error) {
    if (error instanceof TxVerifyChainError) {
      console.error(error.message);
      return 3;
    }
    throw error;
  }
  const { result, selection, checks, report, verdict, artifact, caseId } = run;

  const outPath = options.out ? resolve(ROOT, options.out) : defaultOutPath(options.env, options.caseId, run.generatedAt);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, stringifyArtifact(artifact), 'utf8');
  const outDisplay = relative(ROOT, outPath).startsWith('..') ? outPath : relative(ROOT, outPath);

  if (options.json) {
    process.stdout.write(stringifyArtifact({ ...artifact, outPath: outDisplay }));
    return verdict.exitCode;
  }

  const banner = `verify:tx · ${caseId} · ${options.env} · ${options.hashes.length} 笔 tx`;
  console.log(banner);
  console.log('='.repeat(displayWidth(banner)));
  console.log('\n[元数据]');
  console.log(renderMetadata(result.metadata, result.envelope));
  console.log('\n[交易]');
  console.log(renderTransactions(result.metadata, result.envelope));
  if (result.warnings.length > 0) {
    console.log('\n[适配器告警]');
    for (const warning of result.warnings) console.log(`- ${maskText(warning)}`);
  }
  console.log('\n[核对计划]');
  console.log(renderPlan(selection, report));
  console.log('\n[核对行]');
  console.log(renderChecks(checks));
  console.log('\n[结论]');
  const countsText = Object.entries(verdict.counts).map(([key, count]) => `${key}=${count}`).join(' ') || '无核对行';
  console.log(`${verdict.label}（退出码 ${verdict.exitCode}）· ${countsText} · 报告 ${report.status}`);
  for (const reason of verdict.reasons) console.log(`- ${reason}`);
  console.log(`\n证据 JSON：${outDisplay}`);
  return verdict.exitCode;
}

main().then((code) => {
  process.exitCode = code;
}).catch((error) => {
  console.error(`verify:tx 异常：${errorMessage(error)}`);
  process.exitCode = 3;
});

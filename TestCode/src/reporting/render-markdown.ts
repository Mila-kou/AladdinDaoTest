import { baselineHeadline, buildBaselineView, RELEASE_MISMATCH_BADGE, type BaselineView } from '../config/baseline.js';
import { computeResultMetrics } from './metrics.js';
import type { TestRunArtifact } from './schema.js';

function percent(value: number | null): string {
  return value === null ? 'N/A' : `${(value * 100).toFixed(1)}%`;
}

function duration(value: number): string {
  return `${(value / 1000).toFixed(1)}s`;
}

export function renderMarkdownSummary(artifact: TestRunArtifact, baseline?: BaselineView): string {
  const baselineView = baseline ?? buildBaselineView(artifact.run);
  const metrics = computeResultMetrics(artifact.catalog, artifact.results);
  const failures = artifact.results.filter((result) => result.status === 'FAIL');
  const problems = artifact.results.filter((result) =>
    ['FAIL', 'FLAKY', 'BLOCKED'].includes(result.status),
  );
  const catalogById = new Map(artifact.catalog.map((item) => [item.id, item]));

  const lines = [
    '# FX100 E2E 测试结果',
    '',
    `> 数据状态：${artifact.sourceStatus.toUpperCase()}｜Run：${artifact.run.id}｜生成：${artifact.source.generatedAt}`,
    `> ${baselineHeadline(baselineView)}${baselineView.mismatch === true ? `｜**${RELEASE_MISMATCH_BADGE}**` : ''}`,
    '',
    '| 指标 | 结果 | 定义 |',
    '|---|---:|---|',
    `| 规划场景 | ${metrics.planned} | SCENARIO-CHECKLIST 中的唯一 SCN 数量 |`,
    `| 手工核对 | ${metrics.manual} | 设计上依赖真人操作、不产出自动化代码；仍需人工执行并留证 |`,
    `| 自动化覆盖 | ${metrics.automated} / ${metrics.automatable}（${percent(metrics.automationCoverage)}） | 本次发现至少一个自动化测试的唯一 SCN / 应自动化场景（规划 − 手工） |`,
    `| 最终成功率 | ${percent(metrics.finalSuccessRate)} | (PASS + FLAKY) / (PASS + FLAKY + FAIL) |`,
    `| 稳定通过率 | ${percent(metrics.stablePassRate)} | PASS / (PASS + FLAKY + FAIL) |`,
    `| PASS / FAIL / FLAKY | ${metrics.pass} / ${metrics.fail} / ${metrics.flaky} | 最终场景-项目结果 |`,
    `| BLOCKED / SKIP | ${metrics.blocked} / ${metrics.skipped} | 不进入成功率分母 |`,
    `| 累计执行耗时 | ${duration(metrics.durationMs)} | 所有场景尝试耗时之和 |`,
    '',
    '## 需要处理',
    '',
  ];

  if (problems.length === 0) {
    lines.push('无失败、Flaky 或 Blocked 场景。');
  } else {
    lines.push('| ID | 套件 | 状态 | Project | 核对结果 | 执行链接 | 执行时间 | 耗时 | 原因 |');
    lines.push('|---|---|---|---|---|---|---|---:|---|');
    for (const result of problems) {
      const reason = (result.error ?? result.annotations[0]?.description ?? '')
        .replaceAll('|', '\\|')
        .replaceAll('\n', ' ');
      lines.push(
        `| ${result.id} | ${result.suite} · ${catalogById.get(result.id)?.suiteName ?? '未命名套件'} | ${result.status} | ${result.project} | ${result.checkResult.replaceAll('|', '\\|').replaceAll('\n', ' ')} | ${result.executionLinks.map((link) => `[${link.label}](${link.href})`).join('<br>') || '-'} | ${result.executedAt} | ${duration(result.durationMs)} | ${reason || '-'} |`,
      );
    }
  }

  lines.push('', '## 数据质量', '');
  if (artifact.qualityIssues.length === 0) {
    lines.push('没有发现未映射编号或重复结果。');
  } else {
    for (const issue of artifact.qualityIssues) {
      lines.push(`- ${issue.severity} ${issue.code}：${issue.message}`);
    }
  }

  lines.push(
    '',
    '## 来源',
    '',
    `- 运行结果：${artifact.source.kind}`,
    `- 场景目录：${artifact.source.catalogPath}`,
    `- 数据粒度：${artifact.source.grain}`,
    `- Playwright 状态：${artifact.run.playwrightStatus}`,
    `- 最终失败数：${failures.length}`,
    '',
  );

  return lines.join('\n');
}

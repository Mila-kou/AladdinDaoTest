import type { TestRunArtifact } from './schema.js';

function serializeForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');
}

export function renderDashboardHtml(artifact: TestRunArtifact): string {
  const payload = serializeForHtml(artifact);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>FX100 E2E 测试看板</title>
  <style>
    :root {
      --bg: #0a0f1c;
      --panel: #111827;
      --panel-2: #172033;
      --line: #27344c;
      --text: #edf3ff;
      --muted: #93a4bd;
      --pass: #36d399;
      --fail: #fb7185;
      --flaky: #fbbf24;
      --blocked: #a78bfa;
      --skip: #64748b;
      --not-automated: #475569;
      --manual: #38bdf8;
      --accent: #5ea7ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: radial-gradient(circle at top right, #142342 0, var(--bg) 38%);
      color: var(--text);
      font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main { width: min(1500px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 56px; }
    h1, h2 { margin: 0; letter-spacing: -.02em; }
    h1 { font-size: clamp(25px, 4vw, 38px); }
    h2 { font-size: 18px; }
    p { margin: 0; }
    .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 18px; }
    .top-nav { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 22px; }
    .top-nav a { color: var(--muted); text-decoration: none; border: 1px solid var(--line); background: #0c1424; border-radius: 999px; padding: 7px 12px; }
    .top-nav a[aria-current="page"] { color: var(--text); border-color: #3978bd; background: #102a4d; }
    .subhead { color: var(--muted); margin-top: 7px; }
    .badges { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
    .badge, .status-chip {
      display: inline-flex; align-items: center; border: 1px solid var(--line);
      border-radius: 999px; padding: 5px 9px; background: #0c1424; white-space: nowrap;
    }
    /* run-id 徽标可能长达 60+ 字符（时间戳+release+环境），窄屏必须允许折行，否则撑破 body */
    .badge { white-space: normal; overflow-wrap: anywhere; max-width: 100%; }
    .fixture-banner, .quality-banner {
      border: 1px solid #785d13; background: #2d240e; color: #fde68a;
      border-radius: 12px; padding: 11px 14px; margin-bottom: 14px;
    }
    .quality-banner { border-color: #7f1d1d; background: #2b1116; color: #fecdd3; }
    .filters, .panel {
      border: 1px solid var(--line); background: color-mix(in srgb, var(--panel) 92%, transparent);
      border-radius: 14px; box-shadow: 0 12px 30px rgba(0,0,0,.18);
    }
    .filters {
      display: grid; grid-template-columns: repeat(6, minmax(130px, 1fr)); gap: 10px;
      padding: 14px; margin-bottom: 14px;
    }
    label { display: grid; gap: 5px; color: var(--muted); font-size: 12px; }
    select, input {
      width: 100%; min-height: 38px; border: 1px solid var(--line); border-radius: 9px;
      background: #0b1220; color: var(--text); padding: 7px 9px;
    }
    .metric-grid { display: grid; grid-template-columns: repeat(8, minmax(130px, 1fr)); gap: 12px; margin-bottom: 14px; }
    .metric { padding: 14px; min-height: 110px; }
    .metric-label { color: var(--muted); font-size: 12px; }
    .metric-value { font-size: 28px; font-weight: 750; margin: 7px 0 2px; }
    .metric-note { color: var(--muted); font-size: 11px; }
    .layout { display: grid; grid-template-columns: 1fr 1.3fr; gap: 14px; margin-bottom: 14px; }
    .panel { padding: 16px; min-width: 0; }
    .panel-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
    .panel-note { color: var(--muted); font-size: 12px; }
    .bar-row { display: grid; grid-template-columns: 110px 1fr 45px; align-items: center; gap: 10px; margin: 11px 0; }
    .bar-track { height: 11px; border-radius: 20px; background: #0a1020; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: inherit; min-width: 0; }
    .scroll { overflow: auto; max-height: 520px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { padding: 9px 8px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { color: var(--muted); position: sticky; top: 0; background: var(--panel); z-index: 1; }
    tr:hover td { background: rgba(94,167,255,.045); }
    .status-chip { padding: 2px 7px; font-size: 11px; font-weight: 700; }
    .status-PASS { color: var(--pass); border-color: color-mix(in srgb, var(--pass) 45%, var(--line)); }
    .status-FAIL { color: var(--fail); border-color: color-mix(in srgb, var(--fail) 45%, var(--line)); }
    .status-FLAKY { color: var(--flaky); border-color: color-mix(in srgb, var(--flaky) 45%, var(--line)); }
    .status-BLOCKED { color: var(--blocked); border-color: color-mix(in srgb, var(--blocked) 45%, var(--line)); }
    .status-SKIP { color: var(--skip); }
    .status-NOT_AUTOMATED { color: #94a3b8; }
    .status-MANUAL { color: var(--manual); border-color: color-mix(in srgb, var(--manual) 45%, var(--line)); }
    .error { max-width: 620px; color: #fecdd3; white-space: pre-wrap; word-break: break-word; }
    .empty { color: var(--muted); padding: 18px 4px; }
    details { border-top: 1px solid var(--line); padding-top: 12px; margin-top: 12px; }
    summary { cursor: pointer; color: var(--accent); }
    dl { display: grid; grid-template-columns: minmax(140px, 230px) 1fr; gap: 7px 16px; }
    dt { color: var(--muted); }
    dd { margin: 0; word-break: break-word; }
    code { color: #c4d8ff; }
    .check-result { min-width: 180px; max-width: 360px; white-space: pre-wrap; overflow-wrap: anywhere; }
    .execution-links { display: grid; gap: 4px; min-width: 110px; }
    .execution-links a { color: #8fc2ff; overflow-wrap: anywhere; }
    .scenario-link { color: #8fc2ff; text-decoration: none; }
    .scenario-link:hover { text-decoration: underline; }
    .executed-at { white-space: nowrap; }
    @media (max-width: 1100px) {
      .filters { grid-template-columns: repeat(3, 1fr); }
      .metric-grid { grid-template-columns: repeat(3, 1fr); }
      .layout { grid-template-columns: 1fr; }
    }
    @media (max-width: 650px) {
      main { width: min(100% - 20px, 1500px); padding-top: 18px; }
      .header { display: block; }
      .badges { justify-content: flex-start; margin-top: 12px; }
      .filters { grid-template-columns: 1fr 1fr; }
      .metric-grid { grid-template-columns: 1fr 1fr; }
      .metric { min-height: 96px; }
      .bar-row { grid-template-columns: 90px 1fr 35px; }
    }
    @media print {
      body { background: white; color: #111827; }
      main { width: 100%; padding: 0; }
      .filters { display: none; }
      .top-nav { display: none; }
      .panel, .filters { box-shadow: none; background: white; }
      .scroll { max-height: none; overflow: visible; }
      th { position: static; background: white; }
    }
  </style>
</head>
<body>
<main id="dashboard" data-dashboard-ready="false">
  <nav class="top-nav" aria-label="看板页面">
    <a href="./dashboard.html" aria-current="page">测试看板</a>
    <a href="./executions.html">执行详情</a>
    <a href="./test-cases.html">测试用例</a>
    <a href="./runs.html">测试运行</a>
    <a href="./environments.html">测试环境</a>
    <a href="./faucet.html">Faucet & 交易</a>
    <a href="./parameters.html">合约参数</a>
    <a href="./formulas.html">合约核心公式</a>
    <a href="./page-formulas.html">页面数据公式</a>
  </nav>
  <header class="header">
    <div>
      <h1>FX100 E2E 测试看板</h1>
      <p class="subhead" id="run-subhead"></p>
    </div>
    <div class="badges" id="run-badges"></div>
  </header>
  <div id="notices"></div>
  <section class="filters" aria-label="全局筛选">
    <label>套件<select id="filter-suite"><option value="">全部</option></select></label>
    <label>优先级<select id="filter-priority"><option value="">全部</option></select></label>
    <label>状态<select id="filter-status"><option value="">全部</option></select></label>
    <label>Project<select id="filter-project"><option value="">全部</option></select></label>
    <label>环境<select id="filter-environment"><option value="">全部</option></select></label>
    <label>搜索<input id="filter-search" type="search" placeholder="SCN、标题或错误"></label>
  </section>
  <section class="metric-grid" id="metrics"></section>
  <section class="layout">
    <article class="panel">
      <div class="panel-head"><h2>状态分布</h2><span class="panel-note">场景 × Project 最终结果</span></div>
      <div id="status-chart"></div>
    </article>
    <article class="panel">
      <div class="panel-head"><h2>套件覆盖与质量</h2><span class="panel-note">规划 SCN 与本次发现结果</span></div>
      <div class="scroll"><table><thead><tr><th>套件</th><th>规划</th><th>手工</th><th>自动化</th><th>PASS</th><th>FAIL</th><th>FLAKY</th><th>未自动化</th></tr></thead><tbody id="suite-table"></tbody></table></div>
    </article>
  </section>
  <section class="panel" style="margin-bottom:14px">
    <div class="panel-head"><h2>失败、Flaky 与 Blocked</h2><span class="panel-note">优先处理清单</span></div>
    <div class="scroll"><table><thead><tr><th>ID</th><th>场景</th><th>状态</th><th>Project</th><th>核对结果</th><th>执行链接</th><th>执行时间</th><th>耗时</th><th>原因</th></tr></thead><tbody id="problem-table"></tbody></table></div>
  </section>
  <section class="panel" style="margin-bottom:14px">
    <div class="panel-head"><h2>全部场景明细</h2><span class="panel-note" id="detail-count"></span></div>
    <div class="scroll"><table><thead><tr><th>ID</th><th>套件</th><th>优先级</th><th>场景</th><th>Project / 环境</th><th>状态</th><th>核对结果</th><th>执行链接</th><th>执行时间</th><th>尝试</th><th>耗时</th><th>证据</th></tr></thead><tbody id="detail-table"></tbody></table></div>
  </section>
  <section class="panel">
    <div class="panel-head"><h2>数据来源与指标定义</h2><span class="panel-note">看板可信度说明</span></div>
    <dl id="source-details"></dl>
    <details><summary>查看全部指标定义</summary><dl id="metric-definitions"></dl></details>
  </section>
</main>
<script id="run-data" type="application/json">${payload}</script>
<script>
(async function () {
  'use strict';
  const data = JSON.parse(document.getElementById('run-data').textContent);
  const catalogById = new Map(data.catalog.map(function (item) { return [item.id, item]; }));
  const statusOrder = ['PASS', 'FAIL', 'FLAKY', 'BLOCKED', 'SKIP', 'MANUAL', 'NOT_AUTOMATED'];
  const statusColors = {
    PASS: 'var(--pass)', FAIL: 'var(--fail)', FLAKY: 'var(--flaky)',
    BLOCKED: 'var(--blocked)', SKIP: 'var(--skip)', MANUAL: 'var(--manual)',
    NOT_AUTOMATED: 'var(--not-automated)'
  };
  function isManual(item) { return item.executionMode === 'manual'; }
  const filters = {
    suite: document.getElementById('filter-suite'),
    priority: document.getElementById('filter-priority'),
    status: document.getElementById('filter-status'),
    project: document.getElementById('filter-project'),
    environment: document.getElementById('filter-environment'),
    search: document.getElementById('filter-search')
  };
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }
  function unique(values) { return Array.from(new Set(values.filter(Boolean))).sort(); }
  function option(select, value, label) {
    const item = document.createElement('option'); item.value = value; item.textContent = label || value; select.appendChild(item);
  }
  function suiteLabel(suite) {
    const catalogItem = data.catalog.find(function (item) { return item.suite === suite; });
    return suite + ' · ' + (catalogItem ? catalogItem.suiteName : '未命名套件');
  }
  unique(data.catalog.map(function (item) { return item.suite; })).forEach(function (v) { option(filters.suite, v, suiteLabel(v)); });
  unique(data.catalog.map(function (item) { return item.priority; })).forEach(function (v) { option(filters.priority, v); });
  statusOrder.forEach(function (v) { option(filters.status, v); });
  unique(data.results.map(function (item) { return item.project; })).forEach(function (v) { option(filters.project, v); });
  unique(data.results.map(function (item) { return item.environment; })).forEach(function (v) { option(filters.environment, v); });

  function matchesText(item, text) {
    if (!text) return true;
    const catalogItem = catalogById.get(item.id);
    const haystack = [item.id, item.title, item.scenarioTitle, item.testTitle, item.error, item.checkResult, item.suite, item.suiteName, catalogItem && catalogItem.suiteName]
      .filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(text.toLowerCase());
  }
  function selectedCatalog() {
    return data.catalog.filter(function (item) {
      return (!filters.suite.value || item.suite === filters.suite.value)
        && (!filters.priority.value || item.priority === filters.priority.value)
        && matchesText(item, filters.search.value);
    });
  }
  function selectedResults(ignoreStatus) {
    const allowedIds = new Set(selectedCatalog().map(function (item) { return item.id; }));
    return data.results.filter(function (item) {
      return allowedIds.has(item.id)
        && (!filters.project.value || item.project === filters.project.value)
        && (!filters.environment.value || item.environment === filters.environment.value)
        && (ignoreStatus || !filters.status.value || item.status === filters.status.value)
        && matchesText(item, filters.search.value);
    });
  }
  function detailRows() {
    const results = selectedResults(false);
    const manualIds = new Set(selectedCatalog().filter(isManual).map(function (item) { return item.id; }));
    const rows = results.map(function (result) {
      // 手工核对用例即使挂着历史自动化结果，也必须在明细里保留手工标记，
      // 不能只剩一个绿色 PASS。
      return Object.assign({ missing: false, manualCase: manualIds.has(result.id) }, result);
    });
    const automatedIds = new Set(selectedResults(true).map(function (result) { return result.id; }));
    selectedCatalog().forEach(function (item) {
      if (automatedIds.has(item.id)) return;
      const status = isManual(item) ? 'MANUAL' : 'NOT_AUTOMATED';
      if (filters.status.value && filters.status.value !== status) return;
      rows.push({
        missing: true, id: item.id, suite: item.suite, priority: item.priority,
        scenarioTitle: item.title, project: '-', environment: '-', status: status,
        checkResult: status === 'MANUAL'
          ? '手工核对用例：不产出自动化代码，需人工执行并在 SCENARIO-CHECKLIST 回填证据'
          : '尚未实现自动化用例',
        executionLinks: [], executedAt: '', attempts: [], durationMs: 0, error: ''
      });
    });
    return rows.sort(function (a, b) { return a.id.localeCompare(b.id) || a.project.localeCompare(b.project); });
  }
  function duration(ms) {
    if (!ms) return '-';
    if (ms < 1000) return ms + 'ms';
    if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
    return (ms / 60000).toFixed(1) + 'm';
  }
  function percent(value) { return value == null ? 'N/A' : (value * 100).toFixed(1) + '%'; }
  function statusChip(status) { return '<span class="status-chip status-' + status + '">' + status.replace('_', ' ') + '</span>'; }
  function executionLinkHtml(item) {
    const links = item.executionLinks || [];
    const values = links.map(function (link) {
      return '<a href="' + escapeHtml(link.href) + '" target="_blank" rel="noreferrer">' + escapeHtml(link.label) + '</a>';
    });
    if (item.executionEvidence) {
      values.unshift('<a href="./executions.html?scenario=' + encodeURIComponent(item.id) + '">核对与交易详情</a>');
    }
    return values.length ? '<span class="execution-links">' + values.join('') + '</span>' : '-';
  }
  function scenarioIdHtml(item) {
    return item.executionEvidence
      ? '<a class="scenario-link" href="./executions.html?scenario=' + encodeURIComponent(item.id) + '"><strong>' + escapeHtml(item.id) + '</strong></a>'
      : '<strong>' + escapeHtml(item.id) + '</strong>';
  }
  function executedAt(value) {
    if (!value) return '-';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
  }
  function metrics() {
    const catalog = selectedCatalog();
    const results = selectedResults(false);
    const manualIds = new Set(catalog.filter(isManual).map(function (item) { return item.id; }));
    const ids = new Set(results.map(function (r) { return r.id; })
      .filter(function (id) { return !manualIds.has(id); }));
    const automatable = Math.max(0, catalog.length - manualIds.size);
    const count = function (status) { return results.filter(function (r) { return r.status === status; }).length; };
    const pass = count('PASS'), fail = count('FAIL'), flaky = count('FLAKY');
    const executed = pass + fail + flaky;
    return {
      planned: catalog.length,
      manual: manualIds.size,
      automatable: automatable,
      automated: ids.size,
      coverage: automatable ? ids.size / automatable : null,
      success: executed ? (pass + flaky) / executed : null,
      stable: executed ? pass / executed : null,
      fail: fail, flaky: flaky, blocked: count('BLOCKED'), skipped: count('SKIP'),
      duration: results.reduce(function (sum, r) { return sum + r.durationMs; }, 0)
    };
  }
  function renderMetrics() {
    const m = metrics();
    const cards = [
      ['规划场景', m.planned, '筛选范围内唯一 SCN'],
      ['手工核对', m.manual, '设计上人工执行，需回填证据'],
      ['自动化覆盖', m.automated + ' · ' + percent(m.coverage), '本次发现唯一 SCN / 应自动化 ' + m.automatable + ' 条'],
      ['最终成功率', percent(m.success), '(PASS + FLAKY) / 已执行'],
      ['稳定通过率', percent(m.stable), 'PASS / 已执行'],
      ['FAIL', m.fail, '最终失败'],
      ['FLAKY', m.flaky, '重试后通过'],
      ['BLOCKED / SKIP', m.blocked + ' / ' + m.skipped, '不进入成功率分母']
    ];
    document.getElementById('metrics').innerHTML = cards.map(function (card) {
      return '<article class="panel metric"><div class="metric-label">' + escapeHtml(card[0]) + '</div>'
        + '<div class="metric-value">' + escapeHtml(card[1]) + '</div>'
        + '<div class="metric-note">' + escapeHtml(card[2]) + '</div></article>';
    }).join('');
  }
  function renderStatusChart() {
    const rows = detailRows();
    const counts = Object.fromEntries(statusOrder.map(function (status) { return [status, 0]; }));
    rows.forEach(function (row) { counts[row.status] = (counts[row.status] || 0) + 1; });
    const max = Math.max(1, ...Object.values(counts));
    document.getElementById('status-chart').innerHTML = statusOrder.map(function (status) {
      const count = counts[status];
      return '<div class="bar-row"><span>' + escapeHtml(status.replace('_', ' ')) + '</span>'
        + '<div class="bar-track"><div class="bar-fill" style="width:' + (count / max * 100) + '%;background:' + statusColors[status] + '"></div></div>'
        + '<strong>' + count + '</strong></div>';
    }).join('');
  }
  function renderSuites() {
    const results = selectedResults(false);
    const catalog = selectedCatalog();
    const suites = unique(catalog.map(function (item) { return item.suite; }));
    document.getElementById('suite-table').innerHTML = suites.map(function (suite) {
      const suiteCatalog = catalog.filter(function (item) { return item.suite === suite; });
      const suiteResults = results.filter(function (item) { return item.suite === suite; });
      const suiteManualIds = new Set(suiteCatalog.filter(isManual).map(function (item) { return item.id; }));
      const automated = new Set(suiteResults.map(function (item) { return item.id; })
        .filter(function (id) { return !suiteManualIds.has(id); })).size;
      const count = function (status) { return suiteResults.filter(function (item) { return item.status === status; }).length; };
      return '<tr><td><strong>' + escapeHtml(suiteLabel(suite)) + '</strong></td><td>' + suiteCatalog.length + '</td>'
        + '<td>' + suiteManualIds.size + '</td><td>' + automated + '</td>'
        + '<td>' + count('PASS') + '</td><td>' + count('FAIL') + '</td><td>' + count('FLAKY') + '</td>'
        + '<td>' + Math.max(0, suiteCatalog.length - suiteManualIds.size - automated) + '</td></tr>';
    }).join('') || '<tr><td colspan="8" class="empty">无匹配套件</td></tr>';
  }
  function renderProblems() {
    const problems = selectedResults(false).filter(function (item) { return ['FAIL', 'FLAKY', 'BLOCKED'].includes(item.status); });
    document.getElementById('problem-table').innerHTML = problems.map(function (item) {
      const reason = item.error || (item.annotations[0] && item.annotations[0].description) || '-';
      return '<tr><td>' + scenarioIdHtml(item) + '</td><td>' + escapeHtml(item.scenarioTitle) + '</td><td>' + statusChip(item.status)
        + '</td><td>' + escapeHtml(item.project) + '</td><td class="check-result">' + escapeHtml(item.checkResult) + '</td><td>' + executionLinkHtml(item)
        + '</td><td class="executed-at">' + escapeHtml(executedAt(item.executedAt)) + '</td><td>' + duration(item.durationMs) + '</td><td class="error">' + escapeHtml(reason) + '</td></tr>';
    }).join('') || '<tr><td colspan="9" class="empty">当前筛选没有失败、Flaky 或 Blocked 场景</td></tr>';
  }
  function renderDetails() {
    const rows = detailRows();
    document.getElementById('detail-count').textContent = rows.length + ' 行';
    document.getElementById('detail-table').innerHTML = rows.map(function (item) {
      const attachments = (item.attempts || []).flatMap(function (attempt) { return attempt.attachments || []; });
      const evidence = attachments.length ? attachments.map(function (a) { return escapeHtml(a.name); }).join(', ') : '-';
      return '<tr data-scenario-id="' + escapeHtml(item.id) + '"><td>' + scenarioIdHtml(item) + '</td><td>' + escapeHtml(suiteLabel(item.suite)) + '</td><td>' + item.priority + '</td>'
        + '<td>' + escapeHtml(item.scenarioTitle) + '</td><td>' + escapeHtml(item.project + ' / ' + (item.executionEvidence?.forkDisplayName || item.environment)) + '</td>'
        + '<td>' + statusChip(item.status) + (item.manualCase ? '<span class="status-chip status-MANUAL">手工核对</span>' : '')
        + '</td><td class="check-result">' + escapeHtml(item.checkResult) + '</td><td>' + executionLinkHtml(item)
        + '</td><td class="executed-at">' + escapeHtml(executedAt(item.executedAt)) + '</td><td>' + (item.attempts.length || '-') + '</td><td>' + duration(item.durationMs) + '</td><td>' + evidence + '</td></tr>';
    }).join('') || '<tr><td colspan="12" class="empty">无匹配场景</td></tr>';
  }
  function renderSource() {
    const source = [
      ['数据状态', data.sourceStatus.toUpperCase()], ['Run ID', data.run.id],
      ['生成时间', data.source.generatedAt], ['粒度', data.source.grain],
      ['场景目录', data.source.catalogPath], ['Playwright 状态', data.run.playwrightStatus],
      ['发现测试', data.run.discoveredTests], ['累计筛选耗时', duration(metrics().duration)]
    ];
    document.getElementById('source-details').innerHTML = source.map(function (item) {
      return '<dt>' + escapeHtml(item[0]) + '</dt><dd>' + escapeHtml(item[1]) + '</dd>';
    }).join('');
    document.getElementById('metric-definitions').innerHTML = Object.entries(data.source.metricDefinitions).map(function (item) {
      return '<dt>' + escapeHtml(item[0]) + '</dt><dd>' + escapeHtml(item[1]) + '</dd>';
    }).join('');
  }
  function render() {
    renderMetrics(); renderStatusChart(); renderSuites(); renderProblems(); renderDetails(); renderSource();
  }

  document.getElementById('run-subhead').textContent = data.run.startedAt + ' — ' + data.run.endedAt;
  document.getElementById('run-badges').innerHTML = [data.run.id, data.run.environments.join(', ') || 'no environment', data.sourceStatus.toUpperCase()]
    .map(function (value) { return '<span class="badge">' + escapeHtml(value) + '</span>'; }).join('');
  const notices = [];
  if (data.sourceStatus === 'fixture') notices.push('<div class="fixture-banner">FIXTURE 预览：当前数据是看板功能样例，不代表任何真实测试执行结论。</div>');
  if (data.qualityIssues.length) notices.push('<div class="quality-banner">数据质量问题：' + data.qualityIssues.map(function (i) { return escapeHtml(i.code + ' — ' + i.message); }).join('<br>') + '</div>');
  document.getElementById('notices').innerHTML = notices.join('');
  Object.values(filters).forEach(function (control) { control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', render); });
  render();
  document.getElementById('dashboard').dataset.dashboardReady = 'true';
})();
</script>
</body>
</html>`;
}

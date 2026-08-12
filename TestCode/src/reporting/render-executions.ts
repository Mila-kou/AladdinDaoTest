import { renderPageShell, serializeForHtml } from './render-page-shell.js';
import type { TestRunArtifact } from './schema.js';
import type { TestCaseDefinition } from './test-cases.js';

export function renderExecutionsHtml(
  artifact: TestRunArtifact,
  testCases: TestCaseDefinition[] = [],
): string {
  const payload = serializeForHtml({
    run: artifact.run,
    sourceStatus: artifact.sourceStatus,
    results: artifact.results.filter((result) => result.executionEvidence),
    cases: testCases.map(({ id, roleIntent, preconditions, testData, steps, expected, cleanup, sourcePath,
      targetProject, marketMode, oracleMode, timeMode, signingMode, mockResourceAlias, environmentSetup }) => ({
      id, roleIntent, preconditions, testData, steps, expected, cleanup, sourcePath, targetProject,
      marketMode, oracleMode, timeMode, signingMode, mockResourceAlias, environmentSetup,
    })),
  });
  const content = `
  <section class="panel controls">
    <label>执行场景
      <select id="execution-scenario"></select>
    </label>
    <div class="source-state"><span>数据状态</span><strong>${artifact.sourceStatus.toUpperCase()}</strong></div>
    <div class="source-state"><span>Run ID</span><strong>${artifact.run.id}</strong></div>
  </section>
  <section id="execution-content"></section>
  <script id="execution-data" type="application/json">${payload}</script>`;

  const script = `
  (function () {
    'use strict';
    const data = JSON.parse(document.getElementById('execution-data').textContent);
    const select = document.getElementById('execution-scenario');
    const content = document.getElementById('execution-content');
    function esc(value) {
      return String(value == null ? '' : value).replaceAll('&','&amp;').replaceAll('<','&lt;')
        .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
    }
    function shortHash(value) { return value ? value.slice(0, 10) + '…' + value.slice(-8) : '-'; }
    function actorLabel(actor) { return actor === 'TRADER' ? '交易员' : 'Keeper'; }
    function status(value) { return '<span class="status status-' + esc(value) + '">' + esc(value) + '</span>'; }
    function formulaBasis(item) {
      const formulaHref = item.basis.sourcePath.includes('页面字段计算公式') ? './page-formulas.html' : './formulas.html';
      return '<div class="formula">' + esc(item.formula) + '</div>'
        + '<div class="basis"><a href="' + formulaHref + '">' + esc(item.basis.section) + '</a> · ' + esc(item.basis.title)
        + '<br><code>' + esc(item.basis.sourcePath) + '</code></div>'
        + (item.note ? '<div class="note">' + esc(item.note) + '</div>' : '');
    }
    function txStepId(tx, index) { return tx.stepId || ('TX' + (index + 1)); }
    function stepRows(evidence, stepId) {
      return stepId === 'ALL' ? evidence.reconciliations : evidence.reconciliations.filter(function (item) { return item.txStep === stepId; });
    }
    function countStatuses(rows) {
      return rows.reduce(function (counts, item) { counts[item.status] = (counts[item.status] || 0) + 1; return counts; }, {});
    }
    function renderTxDetails(tx, index, open) {
      const stepId = txStepId(tx, index);
      return '<details class="tx-record panel"' + (open ? ' open' : '') + '><summary><span class="tx-sequence">' + esc(stepId) + '</span><span><strong>' + esc(tx.action) + '</strong><small><span class="actor actor-' + esc(tx.actor) + '">' + actorLabel(tx.actor) + '</span> · Block ' + esc(tx.blockNumber) + ' · ' + esc(shortHash(tx.txHash)) + '</small></span>' + status(tx.status) + '</summary>'
        + '<dl><dt>动作说明</dt><dd>' + esc(tx.summary || tx.action) + '</dd><dt>Tx Hash</dt><dd><code>' + esc(tx.txHash) + '</code> <a class="api-link" href="./api/transactions/' + esc(tx.txHash) + '" target="_blank" rel="noreferrer">打开 JSON 回执</a></dd>'
        + '<dt>From</dt><dd><code>' + esc(tx.from) + '</code></dd><dt>To</dt><dd><code>' + esc(tx.to) + '</code></dd>'
        + '<dt>Block</dt><dd>' + esc(tx.blockNumber) + '</dd><dt>Type / Nonce</dt><dd>' + esc(tx.transactionType) + ' / ' + esc(tx.nonce) + '</dd>'
        + '<dt>Gas Used</dt><dd>' + esc(tx.gasUsed) + '</dd><dt>Order Key</dt><dd><code>' + esc(tx.orderKey || '-') + '</code></dd>'
        + '<dt>签名核对</dt><dd>' + (tx.signatureVerified ? 'PASS：r/s 均为非零，from 与预期角色一致' : 'FAIL：签名字段不完整') + '</dd></dl></details>';
    }
    function renderExecutionSteps(evidence) {
      if (!evidence.transactions.length) return '<section class="panel"><h2>交易步骤</h2><p class="muted">没有交易证据。</p></section>';
      const allCounts = countStatuses(evidence.reconciliations);
      const orderCount = new Set(evidence.transactions.map(function (tx) { return tx.orderKey; }).filter(Boolean)).size;
      const flowSummary = evidence.transactions.length + ' 笔链上交易' + (orderCount ? ' / ' + orderCount + ' 个业务订单' : '');
      const buttons = ['<button type="button" class="tx-step-tab" data-tx-step="ALL"><span>全流程</span><strong>' + flowSummary + '</strong><small>' + evidence.reconciliations.length + ' 项数据核对</small></button>'].concat(evidence.transactions.map(function (tx, index) {
        const stepId = txStepId(tx, index); const counts = countStatuses(stepRows(evidence, stepId));
        const warning = (counts.FAIL || 0) + (counts.NOT_VERIFIED || 0);
        return '<button type="button" class="tx-step-tab" data-tx-step="' + esc(stepId) + '"><span>' + esc(stepId) + ' · ' + actorLabel(tx.actor) + '</span><strong>' + esc(tx.action) + '</strong><small>Block ' + esc(tx.blockNumber) + ' · ' + (counts.PASS || 0) + ' PASS' + (warning ? ' · ' + warning + ' 待关注' : '') + '</small></button>';
      })).join('');
      return '<section class="panel section tx-workflow"><div class="section-head"><div><h2>按交易动作核对</h2><p class="muted">' + flowSummary + '；Keeper 执行是订单的执行交易，不是新的订单类型。每笔交易使用自己的区块快照。</p></div><strong>' + (allCounts.PASS || 0) + ' PASS · ' + (allCounts.FAIL || 0) + ' FAIL</strong></div><div class="tx-step-tabs">' + buttons + '</div></section><section id="tx-step-content"></section>';
    }
    function renderStepHighlights(rows) {
      const patterns = [
        /^ΔTrader$/,
        /^ΔOrderVault$/,
        /^ΔPositionVault$/,
        /^ΔLPVaultAssets$/,
        /^ΔFee(?:Handler|Receiver)$/,
        /仓位规模|sizeInUsd/,
        /仓位 Margin/,
        /^Position Fee（链上实际/,
        /Protocol Fee 及分账守恒/,
        /Funding 净额/,
        /PnL/,
        /资金守恒/,
      ];
      const selected = [];
      patterns.forEach(function (pattern) {
        const item = rows.find(function (row) { return pattern.test(row.label) && !selected.some(function (picked) { return picked.id === row.id; }); });
        if (item) selected.push(item);
      });
      if (!selected.length) return '';
      function card(item) {
        return '<div><span>' + esc(item.label) + '</span><strong>' + esc(item.delta || item.after) + '</strong><small>' + status(item.status) + '</small></div>';
      }
      const conservationRows = selected.filter(function (item) { return /守恒/.test(item.label); });
      const metricRows = selected.filter(function (item) { return !/守恒/.test(item.label); });
      return (metricRows.length ? '<div class="tx-highlight-grid">' + metricRows.map(card).join('') + '</div>' : '')
        + (conservationRows.length ? '<div class="tx-conservation-grid">' + conservationRows.map(card).join('') + '</div>' : '');
    }
    function renderStepContent(evidence, stepId) {
      const mount = document.getElementById('tx-step-content'); if (!mount) return;
      const rows = stepRows(evidence, stepId);
      if (stepId === 'ALL') {
        mount.innerHTML = '<section class="tx-record-list">' + evidence.transactions.map(function (tx, index) { return renderTxDetails(tx, index, false); }).join('') + '</section>' + renderChecks(rows, '全流程数据核对');
      } else {
        const index = evidence.transactions.findIndex(function (tx, txIndex) { return txStepId(tx, txIndex) === stepId; });
        const tx = evidence.transactions[index];
        mount.innerHTML = tx ? '<section class="panel tx-action-summary"><div class="tx-action-main"><span class="eyebrow">' + esc(stepId) + ' · ' + actorLabel(tx.actor) + '</span><h2>' + esc(tx.action) + '</h2><p>' + esc(tx.summary || tx.action) + '</p>' + renderStepHighlights(rows) + '</div><div class="tx-action-metrics"><span>' + status(tx.status) + '</span><span>Block <strong>' + esc(tx.blockNumber) + '</strong></span><span>核对 <strong>' + rows.length + ' 项</strong></span></div></section>' + renderTxDetails(tx, index, false)
          + (rows.length ? renderChecks(rows, stepId + ' 数据核对') : '<section class="panel empty"><strong>该交易没有独立区块快照。</strong><p>这是历史执行证据；重新运行用例后会采集该 TX 的 Before / After 并生成独立核对。</p></section>') : '';
      }
      bindCheckFilters();
    }
    function bindExecutionSteps(evidence) {
      const buttons = Array.from(document.querySelectorAll('.tx-step-tab'));
      const requestedHash = new URLSearchParams(location.search).get('tx');
      const requestedTx = evidence.transactions.findIndex(function (tx) { return tx.txHash === requestedHash; });
      const failedTx = evidence.transactions.findIndex(function (tx, index) {
        return tx.status !== 'SUCCESS' || stepRows(evidence, txStepId(tx, index)).some(function (row) { return row.status === 'FAIL'; });
      });
      const initial = requestedTx >= 0 ? txStepId(evidence.transactions[requestedTx], requestedTx)
        : failedTx >= 0 ? txStepId(evidence.transactions[failedTx], failedTx) : txStepId(evidence.transactions[0], 0);
      function selectStep(stepId) {
        buttons.forEach(function (button) { button.classList.toggle('is-active', button.dataset.txStep === stepId); });
        renderStepContent(evidence, stepId);
      }
      buttons.forEach(function (button) { button.addEventListener('click', function () { selectStep(button.dataset.txStep); }); });
      selectStep(initial);
    }
    function renderCaseOverview(result) {
      const testCase = data.cases.find(function (item) { return item.id === result.id; });
      const intent = testCase?.roleIntent || ('验证“' + result.scenarioTitle + '”用户路径与链上结果');
      const expected = testCase?.expected || result.expectedStatus;
      return '<section class="panel case-overview"><div class="section-head"><div><h2>测试用例概述</h2><p class="muted">执行证据对应的用户场景、操作步骤与核心期望。</p></div>'
        + '<a class="case-link" href="./test-cases.html?scenario=' + encodeURIComponent(result.id) + '">查看 / 编辑完整测试用例</a></div>'
        + '<div class="case-meta"><span><strong>' + esc(result.id) + '</strong></span><span>' + esc(result.suite) + '</span><span>' + esc(result.priority) + '</span><span>期望状态 ' + esc(result.expectedStatus) + '</span></div>'
        + '<dl class="case-summary"><dt>场景</dt><dd>' + esc(result.scenarioTitle) + '</dd><dt>角色与意图</dt><dd>' + esc(intent) + '</dd></dl>'
        + '<div class="case-important-grid">'
        + '<article><h3>前置条件</h3><p>' + esc(testCase?.preconditions || '详见完整测试用例') + '</p></article>'
        + '<article><h3>测试数据</h3><p>' + esc(testCase?.testData || '详见完整测试用例') + '</p></article>'
        + '<article class="wide"><h3>用户操作步骤</h3><p>' + esc(testCase?.steps || '详见完整测试用例') + '</p></article>'
        + '<article class="wide expected"><h3>核对数据与期望结果</h3><p>' + esc(expected) + '</p></article>'
        + '<article class="wide"><h3>恢复 / 清理</h3><p>' + esc(testCase?.cleanup || '详见完整测试用例') + '</p></article></div>'
        + '<details class="case-environment"><summary>执行环境与环境准备（默认折叠）</summary><dl>'
        + '<dt>计划 Project</dt><dd>' + esc(testCase?.targetProject || result.project) + '</dd><dt>资产 / Oracle</dt><dd>' + esc((testCase?.marketMode || '未配置') + ' / ' + (testCase?.oracleMode || '未配置') + (testCase?.mockResourceAlias === 'default-mock' ? ' / default-mock' : '')) + '</dd>'
        + '<dt>时间 / 签名</dt><dd>' + esc((testCase?.timeMode || '未配置') + ' / ' + (testCase?.signingMode || '未配置')) + '</dd><dt>环境准备</dt><dd>' + esc(testCase?.environmentSetup || '详见完整测试用例') + '</dd>'
        + (testCase?.sourcePath ? '<dt>用例来源</dt><dd><code>' + esc(testCase.sourcePath) + '</code></dd>' : '') + '</dl></details></section>';
    }
    function checkCategory(item) {
      const group = item.group;
      const label = item.label;
      if (group === '守恒' || /守恒/.test(label)) return '守恒';
      if (/^Δ(?:Trader|OrderVault|PositionVault|LPVaultAssets|FeeHandler|FeeReceiver)$/.test(label) || /Fee(?:Handler|Receiver)\s+USDC/i.test(label)) return '资金 / Vault';
      if (group.includes('Grace') || /grace|保护期/i.test(label)) return 'Grace';
      if (group.includes('Funding') || label.includes('Funding')) return 'Funding';
      if (group.includes('Fee') || /Fee|费用|仓位费|清算费/.test(label)) return 'Fee';
      if (group.includes('PnL') || label.includes('PnL')) return 'PnL';
      if (/OI|Skew|Spread/.test(group + ' ' + label)) return 'OI / Skew / Spread';
      if (group.includes('仓位') || label.includes('仓位')) return '仓位';
      if (/资金|账本|Vault|余额|抵押品/.test(group + ' ' + label)) return '资金 / Vault';
      return '状态 / 成交';
    }
    function renderChecks(rowsForScope, title) {
      const groupCounts = rowsForScope.reduce(function (counts, item) {
        counts[item.group] = (counts[item.group] || 0) + 1; return counts;
      }, {});
      const categoryCounts = rowsForScope.reduce(function (counts, item) {
        const category = checkCategory(item); counts[category] = (counts[category] || 0) + 1; return counts;
      }, {});
      const categoryOrder = ['守恒','资金 / Vault','仓位','Fee','Funding','Grace','OI / Skew / Spread','PnL','状态 / 成交'];
      const categoryBadges = categoryOrder.filter(function (name) { return categoryCounts[name]; }).map(function (name) {
        return '<button type="button" class="check-filter" data-filter-type="category" data-filter-value="' + esc(name) + '">' + esc(name) + ' <strong>' + esc(categoryCounts[name]) + '</strong></button>';
      }).join('');
      const groupBadges = Object.entries(groupCounts).map(function (entry) {
        return '<button type="button" class="check-filter check-group-badge" data-filter-type="group" data-filter-value="' + esc(entry[0]) + '">' + esc(entry[0]) + ' <strong>' + esc(entry[1]) + '</strong></button>';
      }).join('');
      const rows = rowsForScope.map(function (item) {
        return '<tr data-check-id="' + esc(item.id) + '" data-check-group="' + esc(item.group) + '" data-check-category="' + esc(checkCategory(item)) + '" data-check-status="' + esc(item.status) + '"><td>' + esc(item.group) + '</td><td><strong>' + esc(item.label) + '</strong></td><td>' + status(item.status) + '</td>'
          + '<td class="value before">' + esc(item.before) + '</td><td class="value after">' + esc(item.after) + '</td>'
          + '<td class="value delta">' + esc(item.delta || '—') + '</td><td class="value expected">' + esc(item.expected) + '</td><td class="formula-cell">' + formulaBasis(item) + '</td></tr>';
      }).join('');
      const passed = rowsForScope.filter(function (item) { return item.status === 'PASS'; }).length;
      const failed = rowsForScope.filter(function (item) { return item.status === 'FAIL'; }).length;
      const calculated = rowsForScope.filter(function (item) { return item.status === 'CALCULATED'; }).length;
      const unverified = rowsForScope.filter(function (item) { return item.status === 'NOT_VERIFIED'; }).length;
      return '<section class="panel section"><div class="section-head"><div><h2>' + esc(title || '核对数据明细') + '</h2><p class="muted">每一行遵循 Expected After = Before + 独立计算的 Expected Δ；PASS 表示链上 Actual After 与 Expected After 一致。</p></div><strong id="check-visible-count">' + passed + ' PASS · ' + failed + ' FAIL · ' + calculated + ' CALCULATED · ' + unverified + ' NOT_VERIFIED</strong></div>'
        + '<div class="check-filter-block"><span class="filter-label">快速筛选</span><div class="check-groups"><button type="button" class="check-filter is-active" data-filter-type="all" data-filter-value="">全部 <strong>' + rowsForScope.length + '</strong></button>' + categoryBadges + '</div></div>'
        + '<div class="check-filter-block"><span class="filter-label">交易阶段 / 明细分组</span><div class="check-groups">' + groupBadges + '</div></div>'
        + '<div class="table-scroll check-scroll"><table id="reconciliation-table"><thead><tr><th>分组</th><th>核对字段</th><th>结果</th><th>Before（链上）</th><th>After（链上 Actual）</th><th>Expected Δ（订单 / 公式）</th><th>Expected After = Before + Δ</th><th>公式与依据</th></tr></thead><tbody>' + rows + '</tbody></table></div></section>';
    }
    function bindCheckFilters() {
      const buttons = Array.from(document.querySelectorAll('.check-filter'));
      const rows = Array.from(document.querySelectorAll('#reconciliation-table tbody tr'));
      const counter = document.getElementById('check-visible-count');
      buttons.forEach(function (button) {
        button.addEventListener('click', function () {
          buttons.forEach(function (item) { item.classList.toggle('is-active', item === button); });
          const type = button.dataset.filterType;
          const value = button.dataset.filterValue;
          let visible = 0; let passed = 0; let failed = 0; let calculated = 0; let unverified = 0;
          rows.forEach(function (row) {
            const matches = type === 'all' || (type === 'group' ? row.dataset.checkGroup === value : row.dataset.checkCategory === value);
            row.hidden = !matches;
            if (matches) { visible += 1; if (row.dataset.checkStatus === 'PASS') passed += 1; if (row.dataset.checkStatus === 'FAIL') failed += 1; if (row.dataset.checkStatus === 'CALCULATED') calculated += 1; if (row.dataset.checkStatus === 'NOT_VERIFIED') unverified += 1; }
          });
          counter.textContent = passed + ' PASS · ' + failed + ' FAIL · ' + calculated + ' CALCULATED · ' + unverified + ' NOT_VERIFIED（当前 ' + visible + ' / 全部 ' + rows.length + ' 项）';
        });
      });
    }
    function render() {
      const result = data.results.find(function (item) { return item.id + ':' + item.project === select.value; });
      if (!result) {
        content.innerHTML = '<section class="panel empty">当前运行没有结构化执行证据。</section>';
        return;
      }
      const e = result.executionEvidence;
      const executionStatus = e.executionStatus || (e.reconciliations.some(function (item) { return item.status === 'FAIL'; }) ? 'FAIL' : 'PASS');
      const coverageStatus = e.coverageStatus || 'COMPLETE';
      content.innerHTML = '<section class="hero panel"><div><span class="eyebrow">' + esc(result.id) + ' · ' + esc(result.project) + '</span><h2>' + esc(result.scenarioTitle) + '</h2><p>' + esc(result.checkResult) + '</p></div>'
        + '<div class="hero-meta"><span>执行结果 ' + status(executionStatus) + '</span><span>自动化覆盖 ' + status(coverageStatus) + '</span><span class="fork-label">Project / 环境 <strong>' + esc(result.project) + ' / ' + esc(e.forkDisplayName || result.environment) + '</strong></span><span>模式 <strong>' + esc(e.mode) + '</strong></span><span>保留 Fork <strong>' + (e.persistent ? '是' : '否') + '</strong></span></div>'
        + (e.coverageNote ? '<p class="coverage-note"><strong>覆盖说明：</strong>' + esc(e.coverageNote) + '</p>' : '') + '</section>'
        + renderCaseOverview(result) + renderExecutionSteps(e)
        + '<section class="panel provenance"><h2>证据来源</h2><dl><dt>执行证据</dt><dd><code>' + esc(e.sourcePath) + '</code></dd><dt>公式总表</dt><dd><a href="./formulas.html">合约核心公式页面</a><br><code>' + esc(e.formulaSourcePath) + '</code></dd></dl></section>';
      bindExecutionSteps(e);
    }
    data.results.forEach(function (item) {
      const option = document.createElement('option'); option.value = item.id + ':' + item.project;
      option.textContent = item.id + ' · ' + item.scenarioTitle + ' · ' + item.project; select.appendChild(option);
    });
    const requested = new URLSearchParams(location.search).get('scenario');
    const match = data.results.find(function (item) { return item.id === requested; });
    if (match) select.value = match.id + ':' + match.project;
    select.addEventListener('change', render);
    render();
    document.getElementById('executions-page').dataset.pageReady = 'true';
  })();`;

  return renderPageShell({
    title: 'FX100 执行详情',
    subtitle: '核对快照、Expected、公式依据，以及交易员与 Keeper 的签名交易证据',
    active: 'executions',
    readyId: 'executions-page',
    content,
    script,
    extraStyles: `
      .controls { display:grid; grid-template-columns:minmax(260px,2fr) 1fr 1.4fr; gap:14px; align-items:end; margin-bottom:14px; }
      label,.source-state { display:grid; gap:5px; color:var(--muted); font-size:12px; min-width:0; }
      select { min-height:40px; border:1px solid var(--line); border-radius:9px; background:#0b1220; color:var(--text); padding:8px 10px; }
      .source-state strong { color:var(--text); overflow-wrap:anywhere; }
      .hero { display:flex; flex-wrap:wrap; justify-content:space-between; gap:20px; align-items:flex-start; margin-bottom:14px; }.hero>div:first-child{flex:1;min-width:280px}
      .hero h2 { font-size:24px; margin:4px 0 7px; }.hero p{margin:0;color:#cbd5e1}.eyebrow{color:#8fc2ff;font-weight:700}
      .hero-meta { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; }.hero-meta>span{border:1px solid var(--line);border-radius:999px;padding:6px 10px;background:#0c1424;white-space:nowrap}
      .hero-meta>.fork-label{white-space:normal;overflow-wrap:anywhere;max-width:100%}
      .section,.case-overview { margin-bottom:14px; }.section-head,.tx-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:14px}.section-head h2,.tx-head h3,.provenance h2{margin:0}.section-head p{margin:4px 0 0}
      .table-scroll{overflow:auto}.check-scroll{max-height:760px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:10px 9px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{position:sticky;top:0;background:var(--panel);color:var(--muted);z-index:1}
      .status{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:2px 7px;font-size:11px;font-weight:750}.status-PASS,.status-SUCCESS,.status-COMPLETE{color:#36d399;border-color:#1d7a5c}.status-FAIL,.status-REVERTED{color:#fb7185;border-color:#9f3347}.status-CALCULATED{color:#60a5fa;border-color:#2f6ca5}.status-NOT_VERIFIED{color:#fbbf24;border-color:#8b6914}.status-BLOCKED{color:#a78bfa}.status-PARTIAL{color:#fbbf24;border-color:#8b6914}
      .coverage-note{flex-basis:100%;margin:0!important;padding-top:10px;border-top:1px solid var(--line);color:#f8dda0!important}
      .case-link{border:1px solid #3978bd;border-radius:9px;padding:7px 10px;text-decoration:none;white-space:nowrap}.case-meta{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px}.case-meta span{border:1px solid var(--line);border-radius:999px;padding:3px 8px;color:var(--muted)}.case-summary{grid-template-columns:110px 1fr;margin:0 0 14px}.case-summary dd{white-space:pre-line}.case-important-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:12px}.case-important-grid article{border:1px solid var(--line);border-radius:10px;padding:11px 13px;background:#0b1220}.case-important-grid article.wide{grid-column:1/-1}.case-important-grid article.expected{border-color:#315f51;background:rgba(54,211,153,.045)}.case-important-grid h3{margin:0 0 6px;color:#9fc9ff;font-size:12px}.case-important-grid p{margin:0;white-space:pre-line;color:#d8e2f0;line-height:1.55}.case-environment{border:1px solid var(--line);border-radius:10px;background:#0b1220}.case-environment summary{padding:10px 12px;cursor:pointer;color:var(--muted);font-weight:700}.case-environment[open] summary{border-bottom:1px solid var(--line);color:var(--text)}.case-environment dl{padding:12px;margin:0;grid-template-columns:120px 1fr}.case-environment dd{white-space:pre-line}.check-filter-block{display:grid;grid-template-columns:150px 1fr;gap:10px;align-items:start}.filter-label{color:var(--muted);font-size:11px;padding-top:4px}.hash-link,.api-link{display:block}.api-link{font-size:11px;margin-top:3px}.check-groups{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}.check-filter{border:1px solid var(--line);border-radius:999px;padding:4px 9px;color:var(--muted);background:#0c1424;font:inherit;font-size:11px;cursor:pointer}.check-filter:hover{border-color:#3978bd;color:var(--text)}.check-filter.is-active{color:#e8f2ff;border-color:#5ea7ff;background:#12345b;box-shadow:0 0 0 1px rgba(94,167,255,.16)}.check-filter strong{color:var(--text)}tr[hidden]{display:none}.value{min-width:190px;max-width:290px;overflow-wrap:anywhere}.before{background:rgba(148,163,184,.045)}.after{background:rgba(94,167,255,.055)}.delta{background:rgba(251,191,36,.045)}.expected{background:rgba(54,211,153,.055)}
      .formula-cell{min-width:330px;max-width:470px}.formula{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#d8e6ff;white-space:pre-wrap}.basis,.note{margin-top:6px;color:var(--muted);font-size:11px}.basis code{overflow-wrap:anywhere}
      .tx-workflow{margin-bottom:14px}.tx-step-tabs{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:9px}.tx-step-tab{display:grid;gap:5px;text-align:left;border:1px solid var(--line);border-radius:11px;background:#0b1220;color:var(--text);padding:12px;cursor:pointer;font:inherit;min-width:0}.tx-step-tab:hover{border-color:#3978bd}.tx-step-tab.is-active{border-color:#5ea7ff;background:#102b4b;box-shadow:0 0 0 1px rgba(94,167,255,.2)}.tx-step-tab span{color:#8fc2ff;font-size:11px;font-weight:800}.tx-step-tab strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tx-step-tab small{color:var(--muted)}
      .tx-action-summary{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:10px}.tx-action-main{flex:1;min-width:0}.tx-action-summary h2{margin:4px 0 7px}.tx-action-summary p{margin:0;color:#cbd5e1;max-width:880px}.tx-action-metrics{display:flex;flex-wrap:wrap;gap:7px;justify-content:flex-end}.tx-action-metrics>span{border:1px solid var(--line);border-radius:999px;padding:5px 9px;white-space:nowrap}.tx-highlight-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:7px;margin-top:13px}.tx-conservation-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:7px;margin-top:7px}.tx-highlight-grid>div,.tx-conservation-grid>div{display:grid;gap:3px;border:1px solid var(--line);border-radius:9px;padding:8px 10px;background:#0b1220}.tx-conservation-grid>div{border-color:#315f51;background:rgba(54,211,153,.035)}.tx-highlight-grid span,.tx-conservation-grid span{color:var(--muted);font-size:11px}.tx-highlight-grid strong,.tx-conservation-grid strong{font-size:12px;overflow-wrap:anywhere}.tx-highlight-grid small,.tx-conservation-grid small{justify-self:start}.tx-record-list{display:grid;gap:8px;margin-bottom:14px}.tx-record{padding:0;margin-bottom:10px}.tx-record summary{display:grid;grid-template-columns:auto auto minmax(0,1fr) auto;gap:12px;align-items:center;padding:13px 15px;cursor:pointer;list-style:none}.tx-record summary::-webkit-details-marker{display:none}.tx-record summary:before{content:'▸';color:var(--muted)}.tx-record[open] summary:before{content:'▾'}.tx-record summary>span:nth-of-type(2){display:grid;gap:3px}.tx-record summary small{color:var(--muted)}.tx-record dl{border-top:1px solid var(--line);padding:14px 16px;margin:0}.tx-sequence{border:1px solid #3978bd;border-radius:7px;color:#8fc2ff;padding:4px 7px;font-size:11px;font-weight:800}.tx-record summary>.status{grid-column:4}
      .tx-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}.tx-card{scroll-margin-top:16px}.tx-card:target{border-color:#5ea7ff;box-shadow:0 0 0 2px rgba(94,167,255,.18)}.tx-card h3{margin:5px 0 0}.actor{font-size:11px;font-weight:750}.actor-TRADER{color:#8fc2ff}.actor-KEEPER{color:#c4b5fd}
      dl{display:grid;grid-template-columns:110px 1fr;gap:7px 12px}dt{color:var(--muted)}dd{margin:0;overflow-wrap:anywhere}.provenance{margin-top:14px}
      .empty{color:var(--muted)}
      @media(max-width:900px){.controls{grid-template-columns:1fr 1fr}.controls label{grid-column:1/-1}.tx-grid{grid-template-columns:1fr}.hero{display:block}.hero-meta{justify-content:flex-start;margin-top:12px}.tx-action-summary{display:block}.tx-action-metrics{justify-content:flex-start;margin-top:12px}.tx-conservation-grid{grid-template-columns:1fr}}
      @media(max-width:600px){.controls{grid-template-columns:1fr}.controls label{grid-column:auto}.hero-meta{display:grid}.section-head{display:block}.case-link{display:inline-block;margin-top:10px;white-space:normal}.case-important-grid{grid-template-columns:1fr}.case-important-grid article.wide{grid-column:auto}.check-filter-block{grid-template-columns:1fr;gap:3px}.value{min-width:165px}.formula-cell{min-width:280px}dl{grid-template-columns:1fr}.tx-card dd{margin-bottom:8px}}
    `,
  });
}

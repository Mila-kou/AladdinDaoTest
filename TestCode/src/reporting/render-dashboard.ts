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
    .funding-panel { margin-bottom: 14px; }
    .faucet-panel { margin-bottom:14px; }
    .faucet-monitor-grid { display:grid; grid-template-columns:1fr 1fr minmax(210px,.7fr) minmax(180px,.7fr); gap:10px; }
    .faucet-monitor-grid > div { display:grid; gap:5px; min-width:0; border:1px solid var(--line); border-radius:9px; background:#0b1220; padding:10px 12px; }
    .faucet-monitor-grid span { color:var(--muted); font-size:11px; }
    .faucet-monitor-grid strong,.faucet-monitor-grid code { overflow-wrap:anywhere; }
    .faucet-balance { color:var(--pass); font-size:20px; }
    .faucet-monitor-actions { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-top:10px; }
    .faucet-monitor-actions p { color:var(--muted); overflow-wrap:anywhere; }
    .faucet-monitor-actions p.success { color:var(--pass); }
    .faucet-monitor-actions p.error { color:var(--fail); }
    .faucet-monitor-actions button { min-height:36px; border:1px solid #3978bd; border-radius:9px; background:#14569a; color:white; padding:6px 14px; cursor:pointer; white-space:nowrap; }
    .faucet-monitor-actions button:disabled { opacity:.45; cursor:not-allowed; }
    .faucet-monitor-link { color:#8fc2ff; text-decoration:none; }
    .faucet-auto-funding { margin-top:14px; padding-top:14px; border-top:1px dashed var(--line); }
    .faucet-auto-head { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:10px; }
    .faucet-auto-head h3 { margin:0; font-size:15px; }
    .faucet-auto-form { display:grid; grid-template-columns:minmax(190px,.8fr) minmax(190px,.8fr) minmax(250px,1.2fr) auto auto; gap:10px; align-items:end; }
    .faucet-auto-form label { display:grid; gap:6px; color:var(--muted); font-size:11px; }
    .faucet-auto-form input { width:100%; min-height:38px; border:1px solid var(--line); border-radius:8px; background:#0b1220; color:var(--text); padding:7px 10px; }
    .faucet-auto-form button { min-height:38px; border:1px solid #3978bd; border-radius:9px; background:#14569a; color:white; padding:7px 14px; cursor:pointer; white-space:nowrap; }
    .faucet-auto-form button.stop { border-color:#8b3a49; background:#682536; }
    .faucet-auto-form button:disabled { opacity:.45; cursor:not-allowed; }
    .faucet-auto-prerequisites { min-height:38px; display:flex; flex-wrap:wrap; align-items:center; gap:7px; padding:6px 9px; border:1px solid var(--line); border-radius:8px; background:#0b1220; }
    .faucet-auto-message { color:var(--muted); margin:10px 0 0; overflow-wrap:anywhere; }
    .faucet-auto-message.success { color:var(--pass); }
    .faucet-auto-message.error { color:var(--fail); }
    .faucet-auto-evidence { display:flex; flex-wrap:wrap; gap:7px 14px; margin-top:8px; color:var(--muted); font-size:11px; }
    .faucet-auto-evidence a { color:#8fc2ff; }
    .funding-form { display:grid; grid-template-columns:minmax(180px,.8fr) minmax(330px,1.5fr) minmax(180px,.7fr) auto; gap:10px; align-items:end; }
    .funding-form button { min-height:38px; border:1px solid #3978bd; border-radius:9px; background:#14569a; color:white; padding:7px 16px; cursor:pointer; }
    .funding-form button:disabled { opacity:.45; cursor:not-allowed; }
    .funding-status { color:var(--muted); margin-top:10px; overflow-wrap:anywhere; }
    .funding-status.success { color:var(--pass); }
    .funding-status.error { color:var(--fail); }
    .funding-receipt { margin-top:12px; padding-top:12px; border-top:1px dashed var(--line); }
    .funding-receipt dl { margin:0; grid-template-columns:120px 1fr; }
    .funding-receipt a { color:#8fc2ff; overflow-wrap:anywhere; }
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
      .funding-form { grid-template-columns:1fr; }
      .faucet-monitor-grid { grid-template-columns:1fr; }
      .faucet-monitor-actions { align-items:stretch; flex-direction:column; }
      .faucet-auto-form { grid-template-columns:1fr; }
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
  <section class="panel faucet-panel" aria-label="Base Sepolia Faucet 余额监控">
    <div class="panel-head"><div><h2>Base Sepolia Faucet 余额监控</h2><span class="panel-note">每 30 秒通过当前 Base Sepolia RPC 读取一次 Token balanceOf</span></div><span id="faucet-monitor-state" class="status-chip">等待读取</span></div>
    <div class="faucet-monitor-grid">
      <div><span>Faucet</span><code id="faucet-monitor-account">0x6E2Df1a8d0366ac1e55fF1dC23523299613902e5</code></div>
      <div><span>Token</span><code id="faucet-monitor-token">0xbf4D9B318689AB928DB9eE4Cdc840c065575Eb89</code></div>
      <div><span>当前余额</span><strong id="faucet-monitor-balance" class="faucet-balance">—</strong></div>
      <div><span>最新区块</span><strong id="faucet-monitor-block">—</strong></div>
    </div>
    <div class="faucet-monitor-actions"><p id="faucet-monitor-message">正在连接本机监控服务…</p><button id="refresh-faucet-balance" type="button">立即刷新</button></div>
    <div class="faucet-auto-funding" aria-label="Faucet 自动打款服务">
      <div class="faucet-auto-head"><div><h3>低余额告警与自动补款</h3><span class="panel-note">Node 后台每 30 秒检查；单次补款后冷却 5 分钟</span></div><span id="faucet-service-state" class="status-chip">等待读取</span></div>
      <div class="faucet-auto-form">
        <label>告警阈值（USDC）<input id="faucet-threshold" type="text" inputmode="decimal" autocomplete="off" placeholder="例如 100000"></label>
        <label>补款目标余额（USDC）<input id="faucet-target-balance" type="text" inputmode="decimal" autocomplete="off" placeholder="例如 200000"></label>
        <div><span class="panel-note">启动前置</span><div id="faucet-service-prerequisites" class="faucet-auto-prerequisites"><span class="status-chip">正在检查配置</span></div></div>
        <button id="start-faucet-service" type="button" disabled>启动后台服务</button>
        <button id="stop-faucet-service" class="stop" type="button" disabled>停止服务</button>
      </div>
      <p id="faucet-service-message" class="faucet-auto-message">正在读取后台服务状态…</p>
      <div id="faucet-service-evidence" class="faucet-auto-evidence" hidden></div>
    </div>
  </section>
  <section class="panel funding-panel" aria-label="USDC Funding">
    <div class="panel-head"><div><h2>Fund USDC</h2><span class="panel-note">按环境读取 LPVault 的 USDC，并向用户地址追加余额</span></div><span class="panel-note">默认 base-sepolia；也支持三个私有 Fork</span></div>
    <div class="funding-form">
      <label>环境<select id="fund-environment"><option value="">正在读取环境…</option></select></label>
      <label>用户地址<input id="fund-account" type="text" spellcheck="false" autocomplete="off" placeholder="0x…"></label>
      <label>追加金额（USDC）<input id="fund-amount" type="text" inputmode="decimal" autocomplete="off" placeholder="例如 1000"></label>
      <button id="fund-usdc" type="button" disabled>Fund USDC</button>
    </div>
    <p id="funding-status" class="funding-status">正在连接本机 Funding 服务…</p>
    <div id="funding-receipt" class="funding-receipt" hidden></div>
  </section>
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
  const fundingEnvironment = document.getElementById('fund-environment');
  const fundingAccount = document.getElementById('fund-account');
  const fundingAmount = document.getElementById('fund-amount');
  const fundingButton = document.getElementById('fund-usdc');
  const fundingStatus = document.getElementById('funding-status');
  const fundingReceipt = document.getElementById('funding-receipt');
  const faucetMonitorState = document.getElementById('faucet-monitor-state');
  const faucetMonitorBalance = document.getElementById('faucet-monitor-balance');
  const faucetMonitorBlock = document.getElementById('faucet-monitor-block');
  const faucetMonitorMessage = document.getElementById('faucet-monitor-message');
  const faucetMonitorRefresh = document.getElementById('refresh-faucet-balance');
  const faucetServiceState = document.getElementById('faucet-service-state');
  const faucetThreshold = document.getElementById('faucet-threshold');
  const faucetTargetBalance = document.getElementById('faucet-target-balance');
  const faucetServicePrerequisites = document.getElementById('faucet-service-prerequisites');
  const faucetServiceStart = document.getElementById('start-faucet-service');
  const faucetServiceStop = document.getElementById('stop-faucet-service');
  const faucetServiceMessage = document.getElementById('faucet-service-message');
  const faucetServiceEvidence = document.getElementById('faucet-service-evidence');
  let fundingProfiles = [];
  let baseFundingSignerConfigured = false;
  let faucetMonitorRunning = false;
  let faucetServiceUpdating = false;
  let faucetServiceInputsInitialized = false;

  function faucetMessage(message, kind) {
    faucetMonitorMessage.textContent = message;
    faucetMonitorMessage.className = kind || '';
  }
  async function refreshFaucetBalance() {
    if (faucetMonitorRunning) return;
    if (!['http:', 'https:'].includes(location.protocol)) {
      faucetMonitorRefresh.disabled = true;
      faucetMonitorState.textContent = '离线不可读';
      faucetMessage('请通过 Node 看板服务打开页面后读取 Base Sepolia 余额。');
      return;
    }
    faucetMonitorRunning = true;
    faucetMonitorRefresh.disabled = true;
    faucetMonitorState.textContent = '读取中';
    faucetMessage('正在核对 Chain ID、最新区块和 Faucet Token 余额…');
    try {
      const response = await fetch('/api/faucet-balance', { headers:{Accept:'application/json'}, cache:'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || body.error || ('接口返回 ' + response.status));
      const snapshot = body.faucet;
      faucetMonitorBalance.textContent = snapshot.balance + ' ' + snapshot.symbol;
      faucetMonitorBlock.textContent = '#' + snapshot.blockNumber;
      faucetMonitorState.textContent = snapshot.status === 'EMPTY' ? 'EMPTY' : 'AVAILABLE';
      faucetMonitorState.className = 'status-chip ' + (snapshot.status === 'EMPTY' ? 'status-FAIL' : 'status-PASS');
      faucetMessage('Chain ID ' + snapshot.chainId + ' · ' + new Date(snapshot.checkedAt).toLocaleString('zh-CN', { hour12:false }) + ' · ', snapshot.status === 'EMPTY' ? 'error' : 'success');
      const link = document.createElement('a');
      link.className = 'faucet-monitor-link';
      link.href = snapshot.explorerUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = '查看 Basescan';
      faucetMonitorMessage.appendChild(link);
    } catch (error) {
      faucetMonitorState.textContent = 'ERROR';
      faucetMonitorState.className = 'status-chip status-FAIL';
      faucetMessage('Faucet 余额读取失败：' + error.message, 'error');
    } finally {
      faucetMonitorRunning = false;
      faucetMonitorRefresh.disabled = false;
    }
  }

  function faucetServiceStatusMessage(message, kind) {
    faucetServiceMessage.textContent = message;
    faucetServiceMessage.className = 'faucet-auto-message' + (kind ? ' ' + kind : '');
  }
  function renderFaucetService(service, synchronizeInputs) {
    if (synchronizeInputs || !faucetServiceInputsInitialized) {
      faucetThreshold.value = service.threshold === '0' ? '' : service.threshold;
      faucetTargetBalance.value = service.targetBalance === '0' ? '' : service.targetBalance;
      faucetServiceInputsInitialized = true;
    }
    const failing = service.state === 'ERROR';
    const warning = service.state === 'LOW_BALANCE' || service.state === 'FUNDING';
    faucetServiceState.textContent = service.enabled ? service.state : 'STOPPED';
    faucetServiceState.className = 'status-chip ' + (failing ? 'status-FAIL' : warning ? 'status-FLAKY' : service.enabled ? 'status-PASS' : 'status-SKIP');
    faucetServicePrerequisites.innerHTML = [
      '<span class="status-chip ' + (service.ownerKeyConfigured ? 'status-PASS' : 'status-FAIL') + '">Owner Key ' + (service.ownerKeyConfigured ? '已配置' : '未配置') + '</span>',
      '<span class="status-chip ' + (service.telegramConfigured ? 'status-PASS' : 'status-FAIL') + '">Telegram ' + (service.telegramConfigured ? '已配置' : '未配置') + '</span>'
    ].join('');
    faucetServiceStart.disabled = faucetServiceUpdating || service.enabled || !service.ownerKeyConfigured || !service.telegramConfigured;
    faucetServiceStop.disabled = faucetServiceUpdating || !service.enabled;
    if (service.lastError) {
      faucetServiceStatusMessage(service.lastError, 'error');
    } else if (!service.enabled) {
      faucetServiceStatusMessage('服务已停止；配置会保留，但不会在后台检查或发送交易。');
    } else if (service.state === 'SCHEDULED' && service.nextCheckAt) {
      faucetServiceStatusMessage('服务运行中；下次检查：' + new Date(service.nextCheckAt).toLocaleString('zh-CN', { hour12:false }) + '。', 'success');
    } else {
      faucetServiceStatusMessage('服务运行中：' + service.state + '。', service.state === 'ERROR' ? 'error' : 'success');
    }
    const evidence = [];
    if (service.lastCheckedAt) evidence.push(escapeHtml('最近检查：' + new Date(service.lastCheckedAt).toLocaleString('zh-CN', { hour12:false })));
    if (service.lastBalance) evidence.push(escapeHtml('最近余额：' + service.lastBalance + ' USDC'));
    if (service.lastBlockNumber) evidence.push(escapeHtml('区块：#' + service.lastBlockNumber));
    if (service.lastFunding) {
      const receipt = service.lastFunding;
      evidence.push(escapeHtml('最近补款：' + receipt.before + ' + ' + receipt.amount + ' = ' + receipt.after + ' ' + receipt.symbol));
      if (receipt.transactionUrl) evidence.push('<a href="' + escapeHtml(receipt.transactionUrl) + '" target="_blank" rel="noopener noreferrer">查看补款交易</a>');
    }
    faucetServiceEvidence.innerHTML = evidence.map(function (item) { return '<span>' + item + '</span>'; }).join('');
    faucetServiceEvidence.hidden = evidence.length === 0;
  }
  async function loadFaucetServiceStatus(synchronizeInputs) {
    if (!['http:', 'https:'].includes(location.protocol)) {
      faucetServiceStart.disabled = true;
      faucetServiceStop.disabled = true;
      faucetServiceState.textContent = '离线不可用';
      faucetServiceStatusMessage('请通过 Node 看板服务打开页面后配置后台自动打款。');
      return;
    }
    try {
      const response = await fetch('/api/faucet-auto-funding', { headers:{Accept:'application/json'}, cache:'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || body.error || ('接口返回 ' + response.status));
      renderFaucetService(body.service, Boolean(synchronizeInputs));
    } catch (error) {
      faucetServiceState.textContent = 'ERROR';
      faucetServiceState.className = 'status-chip status-FAIL';
      faucetServiceStart.disabled = true;
      faucetServiceStop.disabled = true;
      faucetServiceStatusMessage('后台服务状态读取失败：' + error.message, 'error');
    }
  }
  async function updateFaucetService(enabled) {
    const threshold = faucetThreshold.value.trim();
    const targetBalance = faucetTargetBalance.value.trim();
    const decimal = /^(?:0|[1-9]\\d*)(?:\\.\\d{1,6})?$/;
    if (!decimal.test(threshold) || Number(threshold) <= 0) {
      faucetServiceStatusMessage('告警阈值必须是大于 0、最多 6 位小数的 USDC 数值。', 'error');
      return;
    }
    if (!decimal.test(targetBalance) || Number(targetBalance) <= Number(threshold)) {
      faucetServiceStatusMessage('补款目标余额必须大于告警阈值。', 'error');
      return;
    }
    faucetServiceUpdating = true;
    faucetServiceStart.disabled = true;
    faucetServiceStop.disabled = true;
    faucetServiceStatusMessage(enabled ? '正在保存配置并启动后台服务…' : '正在停止后台服务…');
    try {
      const response = await fetch('/api/faucet-auto-funding', {
        method:'PUT',
        headers:{'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify({ enabled:enabled, threshold:threshold, targetBalance:targetBalance })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || body.error || ('接口返回 ' + response.status));
      renderFaucetService(body.service, true);
      if (enabled) await refreshFaucetBalance();
    } catch (error) {
      faucetServiceStatusMessage((enabled ? '启动' : '停止') + '失败：' + error.message, 'error');
    } finally {
      faucetServiceUpdating = false;
      await loadFaucetServiceStatus(false);
    }
  }

  function fundingMessage(message, kind) {
    fundingStatus.textContent = message;
    fundingStatus.className = 'funding-status' + (kind ? ' ' + kind : '');
  }
  function renderFundingReceipt(receipt) {
    const rows = [
      ['环境 / Chain ID', receipt.environment + ' / ' + receipt.chainId],
      ['用户地址', receipt.account],
      ['Token', receipt.symbol + ' · ' + receipt.token],
      ['Before', receipt.before + ' ' + receipt.symbol],
      ['Fund', '+' + receipt.amount + ' ' + receipt.symbol],
      ['After', receipt.after + ' ' + receipt.symbol],
      ['执行方式', receipt.rpcMethod],
      ['执行时间', new Date(receipt.executedAt).toLocaleString('zh-CN', { hour12:false })]
    ];
    const transactionRow = receipt.transactionHash
      ? '<dt>交易链接</dt><dd><a href="' + escapeHtml(receipt.transactionUrl || '#') + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(receipt.transactionHash) + '</a></dd>'
      : '';
    fundingReceipt.innerHTML = '<dl>' + rows.map(function (row) {
      return '<dt>' + escapeHtml(row[0]) + '</dt><dd>' + escapeHtml(row[1]) + '</dd>';
    }).join('') + transactionRow + '</dl>';
    fundingReceipt.hidden = false;
  }
  function renderFundingHint() {
    const selected = fundingProfiles.find(function (item) { return item.name === fundingEnvironment.value; });
    if (!selected) return;
    if (selected.name === 'base-sepolia' && !baseFundingSignerConfigured) {
      fundingMessage('Base Sepolia 主 RPC 已配置，但 Token Owner 私钥尚未配置；请先到“测试环境”填写后再执行真实 mint。', 'error');
      return;
    }
    fundingMessage(selected.name === 'base-sepolia'
      ? 'Base Sepolia 将发送真实 MockToken.mint 交易；Token 与 decimals 均从链上读取。'
      : '私有 Fork 将使用 Tenderly 余额注入；Token 与 decimals 均从链上读取。');
  }
  async function initializeFunding() {
    if (!['http:', 'https:'].includes(location.protocol)) {
      fundingEnvironment.innerHTML = '<option value="">离线看板不可执行</option>';
      fundingMessage('请通过 Node 看板服务打开本页面后执行 Funding。');
      return;
    }
    try {
      const responses = await Promise.all([
        fetch('/api/environments', { headers:{Accept:'application/json'} }),
        fetch('/api/environment-configuration?environment=base-sepolia', { headers:{Accept:'application/json'} })
      ]);
      const response = responses[0];
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || body.error || ('接口返回 ' + response.status));
      if (responses[1].ok) {
        const configurationBody = await responses[1].json();
        const ownerField = configurationBody.configuration.fields.find(function (item) {
          return item.key === 'E2E_TOKEN_OWNER_PRIVATE_KEY';
        });
        baseFundingSignerConfigured = Boolean(ownerField && ownerField.configured);
      }
      const available = body.environments.filter(function (item) {
        return item.name === 'base-sepolia' || item.initializesDefaultMockResources;
      }).sort(function (left, right) {
        if (left.name === 'base-sepolia') return -1;
        if (right.name === 'base-sepolia') return 1;
        return left.name.localeCompare(right.name);
      });
      fundingEnvironment.innerHTML = available.map(function (item) {
        const readiness = item.name === 'base-sepolia'
          ? (item.rpcConfigured ? '主 RPC 已配置' : '主 RPC 未配置') + ' · Owner Key ' + (baseFundingSignerConfigured ? '已配置' : '未配置')
          : (item.adminRpcConfigured ? 'Admin RPC 已配置' : 'Admin RPC 未配置');
        return '<option value="' + escapeHtml(item.name) + '">' + escapeHtml(item.name + ' · Chain ID ' + (item.configuredChainId || '未配置') + ' · ' + readiness) + '</option>';
      }).join('');
      fundingProfiles = available;
      if (available.some(function (item) { return item.name === 'base-sepolia'; })) fundingEnvironment.value = 'base-sepolia';
      fundingButton.disabled = available.length === 0;
      if (available.length) renderFundingHint();
      else fundingMessage('没有可用的 Funding 环境。');
    } catch (error) {
      fundingEnvironment.innerHTML = '<option value="">环境读取失败</option>';
      fundingMessage('Funding 服务不可用：' + error.message, 'error');
    }
  }
  fundingEnvironment.addEventListener('change', renderFundingHint);
  faucetMonitorRefresh.addEventListener('click', refreshFaucetBalance);
  faucetServiceStart.addEventListener('click', function () { void updateFaucetService(true); });
  faucetServiceStop.addEventListener('click', function () { void updateFaucetService(false); });
  fundingButton.addEventListener('click', async function () {
    const environment = fundingEnvironment.value;
    const account = fundingAccount.value.trim();
    const amount = fundingAmount.value.trim();
    if (!environment) { fundingMessage('请选择可用环境。', 'error'); return; }
    if (!/^0x[0-9a-fA-F]{40}$/.test(account)) { fundingMessage('用户地址格式不正确。', 'error'); return; }
    if (!/^(?:0|[1-9]\\d*)(?:\\.\\d+)?$/.test(amount) || Number(amount) <= 0) { fundingMessage('金额必须是大于 0 的十进制数字。', 'error'); return; }
    fundingButton.disabled = true;
    fundingReceipt.hidden = true;
    fundingMessage('正在核对 Chain ID、读取 LPVault USDC，并按环境执行 Funding…');
    try {
      const response = await fetch('/api/fund-usdc', {
        method:'POST',
        headers:{'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify({ environment:environment, account:account, amount:amount })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || body.error || ('接口返回 ' + response.status));
      renderFundingReceipt(body.funding);
      fundingMessage('Funding 完成并已回读核对：' + body.funding.before + ' → ' + body.funding.after + ' ' + body.funding.symbol + '。', 'success');
    } catch (error) {
      fundingMessage('Funding 失败：' + error.message, 'error');
    } finally {
      fundingButton.disabled = false;
    }
  });

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
  await Promise.all([initializeFunding(), refreshFaucetBalance(), loadFaucetServiceStatus(true)]);
  window.setInterval(function () { if (!document.hidden) refreshFaucetBalance(); }, 30_000);
  window.setInterval(function () { if (!document.hidden) loadFaucetServiceStatus(false); }, 5_000);
  document.getElementById('dashboard').dataset.dashboardReady = 'true';
})();
</script>
</body>
</html>`;
}

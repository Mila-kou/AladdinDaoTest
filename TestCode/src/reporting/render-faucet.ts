import { renderPageShell } from './render-page-shell.js';

// Faucet 运维工具页：Base Sepolia Faucet 余额监控、低余额告警与自动补款、Fund USDC。
// 从主看板拆出独立页面——这些是测试期运维能力，主网上线后可能整页下线，
// 与测试结果数据无耦合（页面不内嵌 run 数据，全部状态来自本机服务 API）。
export function renderFaucetHtml(): string {
  const styles = `
    :root { --pass:#36d399; --fail:#fb7185; --flaky:#fbbf24; --skip:#64748b; }
    .status-chip { display:inline-flex; align-items:center; border:1px solid var(--line); border-radius:999px; padding:2px 7px; background:#0c1424; white-space:nowrap; font-size:11px; font-weight:700; }
    .status-PASS { color:var(--pass); border-color:color-mix(in srgb,var(--pass) 45%,var(--line)); }
    .status-FAIL { color:var(--fail); border-color:color-mix(in srgb,var(--fail) 45%,var(--line)); }
    .status-FLAKY { color:var(--flaky); border-color:color-mix(in srgb,var(--flaky) 45%,var(--line)); }
    .status-SKIP { color:var(--skip); }
    .panel-head { display:flex; align-items:baseline; justify-content:space-between; gap:10px; margin-bottom:14px; }
    .panel-head h2 { margin:0; font-size:18px; }
    .panel-note { color:var(--muted); font-size:12px; }
    label { display:grid; gap:5px; color:var(--muted); font-size:12px; }
    select, input { width:100%; min-height:38px; border:1px solid var(--line); border-radius:9px; background:#0b1220; color:var(--text); padding:7px 9px; }
    dl { display:grid; grid-template-columns:minmax(140px,230px) 1fr; gap:7px 16px; }
    dt { color:var(--muted); }
    dd { margin:0; word-break:break-word; }
    .funding-panel { margin-bottom:14px; }
    .faucet-panel { margin-bottom:14px; }
    .faucet-monitor-grid { display:grid; grid-template-columns:1fr 1fr minmax(210px,.7fr) minmax(180px,.7fr); gap:10px; }
    .faucet-monitor-grid > div { display:grid; gap:5px; min-width:0; border:1px solid var(--line); border-radius:9px; background:#0b1220; padding:10px 12px; }
    .faucet-monitor-grid span { color:var(--muted); font-size:11px; }
    .faucet-monitor-grid strong,.faucet-monitor-grid code { overflow-wrap:anywhere; }
    .faucet-balance { color:var(--pass); font-size:20px; }
    .faucet-monitor-actions { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-top:10px; }
    .faucet-monitor-actions p { color:var(--muted); overflow-wrap:anywhere; margin:0; }
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
    .noise-panel { margin-bottom:14px; }
    .noise-form { display:grid; grid-template-columns:minmax(160px,.7fr) minmax(140px,.6fr) minmax(300px,1.6fr) auto; gap:10px; align-items:end; }
    .noise-form button, .noise-traders-actions button { min-height:38px; border:1px solid #3978bd; border-radius:9px; background:#14569a; color:white; padding:7px 16px; cursor:pointer; white-space:nowrap; }
    .noise-traders-actions button.secondary { background:#101b2d; border-color:var(--line); color:var(--text); }
    .noise-form button:disabled, .noise-traders-actions button:disabled { opacity:.45; cursor:not-allowed; }
    .noise-check { display:flex; align-items:center; gap:8px; min-height:38px; padding:0 10px; border:1px solid var(--line); border-radius:9px; background:#0b1220; color:var(--text); font-size:12px; }
    .noise-check input { width:auto; min-height:0; accent-color:#5ea7ff; }
    .noise-traders { margin-top:12px; } .noise-traders textarea { width:100%; border:1px solid var(--line); border-radius:9px; background:#0b1220; color:var(--text); padding:8px 10px; font:inherit; font-size:12px; resize:vertical; }
    .noise-traders-actions { display:flex; align-items:center; gap:12px; margin-top:8px; }
    .noise-warning { margin:12px 0 0; padding:9px 12px; border:1px solid #785d13; border-radius:9px; background:#2d240e; color:#fde68a; }
    .noise-message { color:var(--muted); margin:10px 0 0; overflow-wrap:anywhere; } .noise-message.success { color:var(--pass); } .noise-message.error { color:var(--fail); }
    #noise-log { margin-top:10px; } #noise-log summary { cursor:pointer; color:var(--muted); } #noise-log pre { max-height:260px; overflow:auto; white-space:pre-wrap; background:#08101d; border-radius:9px; padding:10px; font-size:11px; }
    .table-scroll { overflow:auto; margin-top:12px; } .noise-jobs { width:100%; border-collapse:collapse; font-size:12px; } .noise-jobs th, .noise-jobs td { text-align:left; padding:7px 8px; border-bottom:1px solid var(--line); vertical-align:top; } .noise-jobs th { color:var(--muted); }
    @media (max-width:650px) {
      .noise-form { grid-template-columns:1fr; }
      .funding-form { grid-template-columns:1fr; }
      .faucet-monitor-grid { grid-template-columns:1fr; }
      .faucet-monitor-actions { align-items:stretch; flex-direction:column; }
      .faucet-auto-form { grid-template-columns:1fr; }
    }
  `;

  const content = `
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
  <section class="panel noise-panel" aria-label="模拟交易铺底">
    <div class="panel-head"><div><h2>模拟交易铺底（多 Trader）</h2><span class="panel-note">用多个 noise trader 在私有 Fork 的 default-mock 市场铺底真实成交，使环境数据更复杂：双侧非零 OI、Skew、Funding 累加器、多仓并存。<strong>这些交易不做核验。</strong></span></div><span id="noise-state" class="status-chip">等待读取</span></div>
    <div class="noise-form">
      <label>环境<select id="noise-environment"><option value="tx-fork">tx-fork</option><option value="oracle-fork">oracle-fork</option><option value="time-fork">time-fork</option></select></label>
      <label>每 Trader 单数<input id="noise-orders" type="number" min="1" max="10" value="2"></label>
      <label class="noise-check"><input id="noise-close" type="checkbox">铺底后随即全平（只留成交历史与 Funding 痕迹）</label>
      <button id="noise-start" type="button">开始铺底</button>
    </div>
    <div class="noise-traders">
      <label>模拟交易 Trader 列表（逗号分隔地址；fork 上 impersonation 免私钥；留空 = 内置 3 个 noise trader）<textarea id="noise-traders" rows="3" spellcheck="false" placeholder="0x…, 0x…"></textarea></label>
      <div class="noise-traders-actions"><button id="noise-save-traders" type="button" class="secondary">保存 Trader 列表到环境配置</button><span id="noise-traders-status" class="panel-note"></span></div>
    </div>
    <p class="noise-warning">⚠️ 使用纪律：在跑用例批次<strong>之前</strong>铺底。与批次并发时，被测用例的窗口纯净度断言会把并发账本变动如实判 FAIL——这是断言的职责。铺底完成后的静态仓位不影响核对（期望模型全部基于 before 快照的增量）。</p>
    <p id="noise-message" class="noise-message">正在读取任务状态…</p>
    <details id="noise-log" hidden><summary>任务日志</summary><pre id="noise-log-content"></pre></details>
    <div class="table-scroll"><table class="noise-jobs"><thead><tr><th>任务</th><th>环境</th><th>Trader</th><th>单数</th><th>状态</th><th>结果</th></tr></thead><tbody id="noise-job-rows"><tr><td colspan="6" class="muted">尚无任务</td></tr></tbody></table></div>
  </section>`;

  const script = `
(async function () {
  'use strict';
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

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }

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

  // —— 模拟交易铺底 ——
  const noiseState = document.getElementById('noise-state');
  const noiseEnvironment = document.getElementById('noise-environment');
  const noiseOrders = document.getElementById('noise-orders');
  const noiseClose = document.getElementById('noise-close');
  const noiseStart = document.getElementById('noise-start');
  const noiseTraders = document.getElementById('noise-traders');
  const noiseSaveTraders = document.getElementById('noise-save-traders');
  const noiseTradersStatus = document.getElementById('noise-traders-status');
  const noiseMessage = document.getElementById('noise-message');
  const noiseLog = document.getElementById('noise-log');
  const noiseLogContent = document.getElementById('noise-log-content');
  const noiseJobRows = document.getElementById('noise-job-rows');
  let noiseTradersInitialized = false;
  let noiseActiveJobId = null;
  function noiseSay(message, kind) { noiseMessage.textContent = message; noiseMessage.className = 'noise-message' + (kind ? ' ' + kind : ''); }
  function noiseChip(status) { return '<span class="status-chip status-' + (status === 'PASS' ? 'PASS' : status === 'RUNNING' ? 'FLAKY' : status === 'FAIL' ? 'FAIL' : 'SKIP') + '">' + escapeHtml(status) + '</span>'; }
  function renderNoiseJobs(jobs) {
    noiseJobRows.innerHTML = jobs.length ? jobs.map(function (job) {
      const traders = job.traders && job.traders.length ? job.traders.length + ' 个自定义' : '内置 3 个';
      const result = job.summary ? ('成交 ' + job.summary.executed + '（' + job.summary.longs + ' 多 / ' + job.summary.shorts + ' 空' + (job.closed || job.summary.closed ? '，平仓 ' + job.summary.closed : '') + '）') : (job.message || '');
      return '<tr><td><code>' + escapeHtml(job.id) + '</code></td><td>' + escapeHtml(job.environment) + '</td><td>' + escapeHtml(traders) + '</td><td>' + escapeHtml(job.ordersPerTrader) + '</td><td>' + noiseChip(job.status) + '</td><td>' + escapeHtml(result) + '</td></tr>';
    }).join('') : '<tr><td colspan="6" class="muted">尚无任务</td></tr>';
    const running = jobs.find(function (job) { return job.status === 'RUNNING'; });
    noiseState.textContent = running ? 'RUNNING' : (jobs[0] ? jobs[0].status : 'IDLE');
    noiseState.className = 'status-chip ' + (running ? 'status-FLAKY' : jobs[0] && jobs[0].status === 'PASS' ? 'status-PASS' : jobs[0] && jobs[0].status === 'FAIL' ? 'status-FAIL' : '');
    noiseStart.disabled = Boolean(running);
    if (running) {
      noiseActiveJobId = running.id;
      noiseSay('运行中：' + (running.message || ''), '');
      noiseLog.hidden = false; noiseLogContent.textContent = (running.logTail || []).join('\\n');
    } else if (noiseActiveJobId) {
      const finished = jobs.find(function (job) { return job.id === noiseActiveJobId; });
      if (finished) { noiseSay(finished.message || finished.status, finished.status === 'PASS' ? 'success' : 'error'); noiseLog.hidden = false; noiseLogContent.textContent = (finished.logTail || []).join('\\n'); }
      noiseActiveJobId = null;
    }
  }
  async function loadNoise() {
    if (!['http:', 'https:'].includes(location.protocol)) { noiseState.textContent = '离线不可用'; noiseStart.disabled = true; noiseSaveTraders.disabled = true; noiseSay('请通过 Node 看板服务打开页面后使用模拟交易铺底。'); return; }
    try {
      const response = await fetch('/api/noise-trades', { headers:{Accept:'application/json'}, cache:'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || body.error || ('接口返回 ' + response.status));
      if (!noiseTradersInitialized) { noiseTraders.value = (body.configuredTraders || []).join(',\\n'); noiseTradersInitialized = true; }
      renderNoiseJobs(body.jobs || []);
      if (!noiseActiveJobId && !(body.jobs || []).length) noiseSay('尚无任务。填写参数后点击“开始铺底”。');
    } catch (error) { noiseState.textContent = 'ERROR'; noiseState.className = 'status-chip status-FAIL'; noiseSay('任务状态读取失败：' + error.message, 'error'); }
  }
  noiseStart.addEventListener('click', async function () {
    const traders = noiseTraders.value.split(/[\\s,]+/).map(function (item) { return item.trim(); }).filter(Boolean);
    const invalid = traders.find(function (item) { return !/^0x[0-9a-fA-F]{40}$/.test(item); });
    if (invalid) { noiseSay('Trader 地址格式不正确：' + invalid, 'error'); return; }
    noiseStart.disabled = true; noiseSay('正在启动模拟交易铺底…'); noiseLog.hidden = false; noiseLogContent.textContent = '';
    try {
      const response = await fetch('/api/noise-trades', { method:'POST', headers:{'Content-Type':'application/json',Accept:'application/json'}, body: JSON.stringify({ environment: noiseEnvironment.value, ordersPerTrader: Number(noiseOrders.value) || 2, closeAfter: noiseClose.checked, traders: traders }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || body.error || ('接口返回 ' + response.status));
      noiseActiveJobId = body.job.id;
      await loadNoise();
    } catch (error) { noiseSay('启动失败：' + error.message, 'error'); noiseStart.disabled = false; }
  });
  noiseSaveTraders.addEventListener('click', async function () {
    const traders = noiseTraders.value.split(/[\\s,]+/).map(function (item) { return item.trim(); }).filter(Boolean);
    const invalid = traders.find(function (item) { return !/^0x[0-9a-fA-F]{40}$/.test(item); });
    if (invalid) { noiseTradersStatus.textContent = '地址格式不正确：' + invalid; return; }
    noiseSaveTraders.disabled = true; noiseTradersStatus.textContent = '保存中…';
    try {
      // 复用环境配置接口写入 E2E_NOISE_TRADER_ACCOUNTS（写 .env.local，同源 PUT）
      const response = await fetch('/api/environment-configuration', { method:'PUT', headers:{'Content-Type':'application/json',Accept:'application/json'}, body: JSON.stringify({ environment: noiseEnvironment.value, values: { E2E_NOISE_TRADER_ACCOUNTS: traders.join(',') }, clearKeys: traders.length ? [] : ['E2E_NOISE_TRADER_ACCOUNTS'] }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || body.error || ('接口返回 ' + response.status));
      noiseTradersStatus.textContent = traders.length ? '已保存 ' + traders.length + ' 个 Trader 到本机 .env.local。' : '已清空，回落内置 3 个 noise trader。';
    } catch (error) { noiseTradersStatus.textContent = '保存失败：' + error.message; }
    finally { noiseSaveTraders.disabled = false; }
  });

  await Promise.all([initializeFunding(), refreshFaucetBalance(), loadFaucetServiceStatus(true), loadNoise()]);
  window.setInterval(function () { if (!document.hidden && noiseActiveJobId) loadNoise(); }, 2_000);
  window.setInterval(function () { if (!document.hidden) refreshFaucetBalance(); }, 30_000);
  window.setInterval(function () { if (!document.hidden) loadFaucetServiceStatus(false); }, 5_000);
  document.getElementById('faucet-page').dataset.pageReady = 'true';
})();
`;

  return renderPageShell({
    title: 'FX100 Faucet & 交易',
    subtitle: 'Base Sepolia Faucet 余额监控、低余额告警与自动补款、Fund USDC、多 Trader 模拟交易铺底。测试期运维工具，与测试结果数据无耦合；上线后如不再需要可整页下线。',
    active: 'faucet',
    readyId: 'faucet-page',
    content,
    extraStyles: styles,
    script,
  });
}

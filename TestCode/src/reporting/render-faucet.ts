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
    .plan-toolbar { display:grid; grid-template-columns:minmax(200px,1.4fr) minmax(120px,.7fr) minmax(130px,.7fr) minmax(120px,.7fr) minmax(140px,.8fr) minmax(200px,1fr) minmax(150px,.8fr); gap:10px; align-items:end; }
    .plan-advanced-traders { margin-top:10px; } .plan-advanced-traders summary { cursor:pointer; color:var(--muted); font-size:12px; } .plan-advanced-traders textarea { width:100%; margin-top:6px; border:1px solid var(--line); border-radius:9px; background:#0b1220; color:var(--text); padding:8px 10px; font:inherit; font-size:12px; }
    .plan-rules-head { display:flex; align-items:end; justify-content:space-between; gap:12px; margin-top:16px; } .plan-rules-head h3 { margin:0; font-size:14px; } .plan-rules-actions { display:flex; align-items:end; gap:10px; } .plan-rules-actions label { min-width:220px; }
    .plan-rules td input, .plan-rules td select { min-height:32px; font-size:12px; padding:4px 7px; } .plan-rules td { padding:5px 4px; } .plan-rules th { white-space:nowrap; }
    .plan-rules .col-name { min-width:150px; } .plan-rules .col-num { min-width:90px; } .plan-rules .col-sel { min-width:100px; } .plan-rules .col-step { min-width:110px; } .plan-rules .col-traders { min-width:110px; }
    .plan-rule-remove { min-height:32px; padding:4px 10px; border:1px solid #8b3a49; border-radius:8px; background:#682536; color:white; cursor:pointer; font-size:12px; }
    .plan-actions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:12px; } .plan-actions button { min-height:38px; border:1px solid #3978bd; border-radius:9px; background:#14569a; color:white; padding:7px 16px; cursor:pointer; white-space:nowrap; } .plan-actions button.secondary { background:#101b2d; border-color:var(--line); color:var(--text); } .plan-actions button:disabled { opacity:.45; cursor:not-allowed; }
    #plan-preview-panel, .plan-json { margin-top:12px; } #plan-preview-panel summary, .plan-json summary { cursor:pointer; color:var(--muted); font-size:12px; }
    .plan-orders { width:100%; border-collapse:collapse; font-size:12px; margin-top:8px; } .plan-orders th, .plan-orders td { text-align:left; padding:5px 8px; border-bottom:1px solid var(--line); } .plan-orders th { color:var(--muted); }
    .plan-json textarea { width:100%; margin-top:6px; border:1px solid var(--line); border-radius:9px; background:#0b1220; color:var(--text); padding:8px 10px; font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace; }
    .side-long { color:var(--pass); } .side-short { color:var(--fail); }
    .plan-roster { margin-top:10px; } .plan-roster summary { cursor:pointer; color:var(--muted); font-size:12px; }
    .plan-roster-actions { display:flex; align-items:end; gap:10px; flex-wrap:wrap; margin-top:8px; } .plan-roster-actions label { min-width:120px; }
    .plan-roster-actions button { min-height:38px; border:1px solid var(--line); border-radius:9px; background:#101b2d; color:var(--text); padding:7px 14px; cursor:pointer; white-space:nowrap; } .plan-roster-actions button:disabled { opacity:.45; cursor:not-allowed; }
    .roster-link { color:#8fc2ff; align-self:center; } .roster-scroll { max-height:320px; } .roster-table code { overflow-wrap:anywhere; }
    #roster-generate-wallets { border-color:#3978bd; background:#14569a; color:white; } .roster-secret-note { margin-top:10px; font-size:12px; }
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
      .plan-toolbar { grid-template-columns:1fr; }
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
  <section class="panel noise-panel" aria-label="造数据计划">
    <div class="panel-head"><div><h2>造数据计划：多 Trader 注资 + 网格交易</h2><span class="panel-note">最多 100 个 Trader（地址自动派生或粘贴覆盖）→ 逐个注资 ETH/USDC + Router 授权 → 按网格规则批量下单（fixed 固定 / linear 线性递增 / ratio 等比递增，多空可交替）。<strong>这些交易不做核验</strong>，只为把环境数据铺复杂。</span></div><span id="noise-state" class="status-chip">等待读取</span></div>

    <div class="plan-toolbar">
      <label>计划名<input id="plan-name" type="text" maxlength="80"></label>
      <label>环境<select id="noise-environment"><option value="tx-fork">tx-fork</option><option value="oracle-fork">oracle-fork</option><option value="time-fork">time-fork</option></select></label>
      <label>Trader 数量（1–100）<input id="plan-trader-count" type="number" min="1" max="100" value="10"></label>
      <label>每 Trader 注资 ETH<input id="plan-eth" type="text" inputmode="decimal" value="10"></label>
      <label>每 Trader 注资 USDC<input id="plan-usdc" type="text" inputmode="decimal" value="1000000"></label>
      <label class="noise-check"><input id="noise-close" type="checkbox">全部下单后随即全平</label>
      <label>单单间随机间隔上限（秒）<input id="plan-delay" type="number" min="0" max="60" value="0"></label>
    </div>
    <details class="plan-advanced-traders"><summary>Trader 地址（默认按序号自动派生 0x1001…0001、0x1002…0002…，展开可粘贴覆盖）</summary>
      <textarea id="plan-trader-addresses" rows="3" spellcheck="false" placeholder="留空 = 自动派生；粘贴地址列表（逗号/换行分隔）则按顺序覆盖前 N 个"></textarea>
    </details>
    <details class="plan-roster"><summary>Trader 花名册（一键生成 Trader1…Trader100 并保存记录；地址确定性派生，任何时候可按序号重算）</summary>
      <div class="plan-roster-actions">
        <label>生成数量<input id="roster-count" type="number" min="1" max="100" value="100"></label>
        <button id="roster-generate" type="button" class="secondary">生成占位地址花名册（impersonation，无私钥）</button>
        <button id="roster-generate-wallets" type="button">生成真实钱包（含私钥，可自主签名发交易）</button>
        <button id="roster-fill-plan" type="button" class="secondary">用花名册填入计划（Trader 数 = 花名册长度）</button>
        <a id="roster-csv" class="roster-link" href="./api/noise-traders.csv" download="noise-traders.csv">下载 CSV</a>
        <span id="roster-status" class="panel-note"></span>
      </div>
      <p id="roster-wallet-status" class="panel-note"></p>
      <p class="noise-warning roster-secret-note">🔐 真实钱包私钥只写入本机 <code>config/noise-traders.secret.json</code>（权限 0600、已 gitignore），页面与 API <strong>永不返回私钥/助记词</strong>。默认助记词模式：一个 24 词助记词按 BIP-44 派生全部账户——<strong>备份助记词即可完全恢复</strong>；重新生成会覆盖旧文件。造数据计划检测到真实钱包时自动改为<strong>私钥真实签名</strong>下单（不再 impersonation）。</p>
      <div class="table-scroll roster-scroll"><table class="plan-orders roster-table"><thead><tr><th>#</th><th>名称</th><th>地址</th><th>来源</th></tr></thead><tbody id="roster-rows"><tr><td colspan="4" class="muted">尚未生成</td></tr></tbody></table></div>
    </details>

    <div class="plan-rules-head"><h3>网格规则（每条规则对指定 Trader 各下 count 单）</h3><div class="plan-rules-actions"><label>预设生成器<select id="plan-preset"><option value="">选择预设填充…</option></select></label><button id="plan-add-rule" type="button" class="secondary">+ 添加规则</button></div></div>
    <div class="table-scroll"><table class="plan-rules"><thead><tr><th>规则名</th><th>起始抵押 USDC</th><th>起始杠杆</th><th>方向</th><th>步进</th><th>单数</th><th>抵押增量 / 倍率</th><th>杠杆增量 / 倍率</th><th>应用 Trader</th><th></th></tr></thead><tbody id="plan-rule-rows"></tbody></table></div>

    <div class="plan-actions">
      <button id="plan-preview" type="button" class="secondary">展开预览</button>
      <button id="plan-save" type="button" class="secondary">保存计划</button>
      <button id="noise-start" type="button">按计划开始铺底</button>
      <span id="plan-summary" class="panel-note"></span>
    </div>
    <details id="plan-preview-panel" hidden><summary>逐单清单预览（<span id="plan-preview-count">0</span> 单；执行前可回到规则表微调）</summary>
      <div class="table-scroll"><table class="plan-orders"><thead><tr><th>#</th><th>Trader</th><th>规则</th><th>方向</th><th>抵押 USDC</th><th>杠杆</th><th>Size USD</th></tr></thead><tbody id="plan-order-rows"></tbody></table></div>
    </details>
    <details class="plan-json"><summary>高级：计划 JSON（与表格双向同步；可整段粘贴替换）</summary>
      <textarea id="plan-json" rows="12" spellcheck="false"></textarea>
      <div class="noise-traders-actions"><button id="plan-json-apply" type="button" class="secondary">应用 JSON 到表格</button><span id="plan-json-status" class="panel-note"></span></div>
    </details>

    <p class="noise-warning">⚠️ 使用纪律：在跑用例批次<strong>之前</strong>铺底。与批次并发时，被测用例的窗口纯净度断言会把并发账本变动如实判 FAIL——这是断言的职责。铺底完成后的静态仓位不影响核对（期望模型全部基于 before 快照的增量）。大计划（如 100 Trader × 多单）耗时以分钟计，任务在后台运行，可离开页面。</p>
    <p id="noise-message" class="noise-message">正在读取任务状态…</p>
    <details id="noise-log" hidden><summary>任务日志</summary><pre id="noise-log-content"></pre></details>
    <div class="table-scroll"><table class="noise-jobs"><thead><tr><th>任务</th><th>环境</th><th>计划</th><th>Trader / 单数</th><th>状态</th><th>结果</th></tr></thead><tbody id="noise-job-rows"><tr><td colspan="6" class="muted">尚无任务</td></tr></tbody></table></div>
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

  // —— 造数据计划：多 Trader 注资 + 网格交易 ——
  const noiseState = document.getElementById('noise-state');
  const noiseEnvironment = document.getElementById('noise-environment');
  const noiseClose = document.getElementById('noise-close');
  const noiseStart = document.getElementById('noise-start');
  const noiseMessage = document.getElementById('noise-message');
  const noiseLog = document.getElementById('noise-log');
  const noiseLogContent = document.getElementById('noise-log-content');
  const noiseJobRows = document.getElementById('noise-job-rows');
  const planName = document.getElementById('plan-name');
  const planTraderCount = document.getElementById('plan-trader-count');
  const planEth = document.getElementById('plan-eth');
  const planUsdc = document.getElementById('plan-usdc');
  const planDelay = document.getElementById('plan-delay');
  const planTraderAddresses = document.getElementById('plan-trader-addresses');
  const planPreset = document.getElementById('plan-preset');
  const planRuleRows = document.getElementById('plan-rule-rows');
  const planSummary = document.getElementById('plan-summary');
  const planPreviewPanel = document.getElementById('plan-preview-panel');
  const planPreviewCount = document.getElementById('plan-preview-count');
  const planOrderRows = document.getElementById('plan-order-rows');
  const planJson = document.getElementById('plan-json');
  const planJsonStatus = document.getElementById('plan-json-status');
  let noiseActiveJobId = null;
  let presets = {};
  let rules = [];

  function noiseSay(message, kind) { noiseMessage.textContent = message; noiseMessage.className = 'noise-message' + (kind ? ' ' + kind : ''); }
  function noiseChip(status) { return '<span class="status-chip status-' + (status === 'PASS' ? 'PASS' : status === 'RUNNING' ? 'FLAKY' : status === 'FAIL' ? 'FAIL' : 'SKIP') + '">' + escapeHtml(status) + '</span>'; }

  // 表格 ⇄ 计划对象
  function ruleRow(rule, index) {
    const opt = function (value, current, label) { return '<option value="' + value + '"' + (value === current ? ' selected' : '') + '>' + label + '</option>'; };
    const tradersText = rule.traders === 'all' ? 'all' : Array.isArray(rule.traders) ? rule.traders.join(',') : String(rule.traders);
    return '<tr data-rule="' + index + '">'
      + '<td class="col-name"><input data-field="label" value="' + escapeHtml(rule.label) + '"></td>'
      + '<td class="col-num"><input data-field="collateralUsdc" inputmode="decimal" value="' + escapeHtml(rule.collateralUsdc) + '"></td>'
      + '<td class="col-num"><input data-field="leverage" type="number" min="1" max="50" step="0.5" value="' + escapeHtml(rule.leverage) + '"></td>'
      + '<td class="col-sel"><select data-field="side">' + opt('alternate', rule.side, '多空交替') + opt('long', rule.side, '全多') + opt('short', rule.side, '全空') + '</select></td>'
      + '<td class="col-sel"><select data-field="step">' + opt('fixed', rule.step, '固定') + opt('linear', rule.step, '线性 +') + opt('ratio', rule.step, '等比 ×') + '</select></td>'
      + '<td class="col-num"><input data-field="count" type="number" min="1" max="50" value="' + escapeHtml(rule.count) + '"></td>'
      + '<td class="col-step"><input data-field="collateralStepOrRatio" placeholder="' + (rule.step === 'ratio' ? '倍率 如 1.5' : rule.step === 'linear' ? '增量 USDC' : '—') + '" value="' + escapeHtml(rule.step === 'ratio' ? (rule.collateralRatio == null ? '' : rule.collateralRatio) : (rule.collateralStep == null ? '' : rule.collateralStep)) + '"' + (rule.step === 'fixed' ? ' disabled' : '') + '></td>'
      + '<td class="col-step"><input data-field="leverageStepOrRatio" placeholder="' + (rule.step === 'ratio' ? '倍率 如 1.2' : rule.step === 'linear' ? '增量 如 10' : '—') + '" value="' + escapeHtml(rule.step === 'ratio' ? (rule.leverageRatio == null ? '' : rule.leverageRatio) : (rule.leverageStep == null ? '' : rule.leverageStep)) + '"' + (rule.step === 'fixed' ? ' disabled' : '') + '></td>'
      + '<td class="col-traders"><input data-field="traders" placeholder="all / 1-20 / 1,5,9" value="' + escapeHtml(tradersText) + '"></td>'
      + '<td><button type="button" class="plan-rule-remove" data-remove="' + index + '">删</button></td></tr>';
  }
  function renderRules() { planRuleRows.innerHTML = rules.map(ruleRow).join('') || '<tr><td colspan="10" class="muted">尚无规则，点击"+ 添加规则"或选择预设</td></tr>'; }
  function parseTraders(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed || trimmed === 'all') return 'all';
    if (/^\\d+-\\d+$/.test(trimmed)) return trimmed;
    return trimmed.split(/[\\s,]+/).map(function (item) { return Number(item); }).filter(function (item) { return Number.isInteger(item) && item > 0; });
  }
  function collectRules() {
    const out = [];
    planRuleRows.querySelectorAll('tr[data-rule]').forEach(function (row) {
      const get = function (field) { const el = row.querySelector('[data-field="' + field + '"]'); return el ? el.value : ''; };
      const step = get('step');
      const rule = { label: get('label') || '规则', collateralUsdc: String(get('collateralUsdc') || '0'), leverage: Number(get('leverage')) || 1, side: get('side') || 'alternate', step: step || 'fixed', count: Number(get('count')) || 1, traders: parseTraders(get('traders')) };
      const cs = get('collateralStepOrRatio'), ls = get('leverageStepOrRatio');
      if (step === 'linear') { if (cs) rule.collateralStep = String(cs); if (ls) rule.leverageStep = Number(ls); }
      if (step === 'ratio') { if (cs) rule.collateralRatio = Number(cs); if (ls) rule.leverageRatio = Number(ls); }
      out.push(rule);
    });
    return out;
  }
  function collectPlan() {
    const addresses = planTraderAddresses.value.split(/[\\s,]+/).map(function (item) { return item.trim(); }).filter(Boolean);
    const plan = {
      schemaVersion: 1,
      name: planName.value.trim() || '默认造数据计划',
      environment: noiseEnvironment.value,
      traderCount: Math.max(1, Math.min(100, Number(planTraderCount.value) || 1)),
      funding: { ethPerTrader: String(planEth.value || '10'), usdcPerTrader: String(planUsdc.value || '1000000') },
      rules: collectRules(),
      closeAfter: noiseClose.checked,
      maxDelaySeconds: Math.max(0, Math.min(60, Number(planDelay.value) || 0)),
    };
    if (addresses.length) plan.traderAddresses = addresses;
    return plan;
  }
  function applyPlan(plan) {
    planName.value = plan.name || '';
    noiseEnvironment.value = plan.environment || 'tx-fork';
    planTraderCount.value = plan.traderCount || 1;
    planEth.value = (plan.funding && plan.funding.ethPerTrader) || '10';
    planUsdc.value = (plan.funding && plan.funding.usdcPerTrader) || '1000000';
    noiseClose.checked = Boolean(plan.closeAfter);
    planDelay.value = plan.maxDelaySeconds || 0;
    planTraderAddresses.value = (plan.traderAddresses || []).join(',\\n');
    rules = (plan.rules || []).map(function (rule) { return Object.assign({ label: '规则', side: 'alternate', step: 'fixed', count: 1, traders: 'all' }, rule); });
    renderRules();
    syncJson();
  }
  function syncJson() { planJson.value = JSON.stringify(collectPlan(), null, 2); }

  planRuleRows.addEventListener('input', function () { rules = collectRules(); syncJson(); });
  planRuleRows.addEventListener('change', function (event) {
    rules = collectRules();
    if (event.target && event.target.dataset && event.target.dataset.field === 'step') renderRules();
    syncJson();
  });
  planRuleRows.addEventListener('click', function (event) {
    const button = event.target && event.target.closest ? event.target.closest('button[data-remove]') : null;
    if (!button) return;
    rules = collectRules(); rules.splice(Number(button.dataset.remove), 1); renderRules(); syncJson();
  });
  document.getElementById('plan-add-rule').addEventListener('click', function () {
    rules = collectRules(); rules.push({ label: '规则 ' + (rules.length + 1), collateralUsdc: '1000', leverage: 10, side: 'alternate', step: 'fixed', count: 1, traders: 'all' }); renderRules(); syncJson();
  });
  [planName, planTraderCount, planEth, planUsdc, planDelay, planTraderAddresses, noiseEnvironment, noiseClose].forEach(function (el) { el.addEventListener('input', syncJson); el.addEventListener('change', syncJson); });
  planPreset.addEventListener('change', function () {
    const preset = presets[planPreset.value];
    if (preset) { applyPlan(preset.plan); planSummary.textContent = '已填充预设：' + preset.name; }
    planPreset.value = '';
  });
  document.getElementById('plan-json-apply').addEventListener('click', function () {
    try { applyPlan(JSON.parse(planJson.value)); planJsonStatus.textContent = 'JSON 已应用到表格。'; }
    catch (error) { planJsonStatus.textContent = 'JSON 解析失败：' + error.message; }
  });

  async function previewPlan() {
    const response = await fetch('/api/noise-plan', { method:'POST', headers:{'Content-Type':'application/json',Accept:'application/json'}, body: JSON.stringify(collectPlan()) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.detail || body.error || ('接口返回 ' + response.status));
    const sm = body.summary;
    planSummary.textContent = sm.traders + ' Trader · ' + sm.orders + ' 单（' + sm.longs + ' 多 / ' + sm.shorts + ' 空）· 总抵押 ' + sm.totalCollateralUsdc + ' USDC · 总规模 ' + sm.totalSizeUsd + ' USD · 最大单 ' + sm.maxSingleSizeUsd + ' USD';
    planPreviewCount.textContent = body.orders.length;
    planOrderRows.innerHTML = body.orders.slice(0, 500).map(function (order) {
      return '<tr><td>' + order.seq + '</td><td>#' + order.traderIndex + ' <code>' + escapeHtml(order.trader.slice(0, 10)) + '…</code></td><td>' + escapeHtml(order.rule) + '</td><td class="side-' + order.side + '">' + (order.side === 'long' ? '多' : '空') + '</td><td>' + escapeHtml(order.collateralUsdc) + '</td><td>' + escapeHtml(order.leverage) + 'x</td><td>' + escapeHtml(order.sizeUsd) + '</td></tr>';
    }).join('') + (body.orders.length > 500 ? '<tr><td colspan="7" class="muted">仅显示前 500 单</td></tr>' : '');
    planPreviewPanel.hidden = false; planPreviewPanel.open = true;
    return body;
  }
  document.getElementById('plan-preview').addEventListener('click', function () { previewPlan().catch(function (error) { planSummary.textContent = '展开失败：' + error.message; }); });
  document.getElementById('plan-save').addEventListener('click', async function () {
    const button = this; button.disabled = true;
    try {
      const response = await fetch('/api/noise-plan', { method:'PUT', headers:{'Content-Type':'application/json',Accept:'application/json'}, body: JSON.stringify(collectPlan()) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || body.error || ('接口返回 ' + response.status));
      planSummary.textContent = '计划已保存到 config/noise-plan.json。';
    } catch (error) { planSummary.textContent = '保存失败：' + error.message; }
    finally { button.disabled = false; }
  });

  function renderNoiseJobs(jobs) {
    noiseJobRows.innerHTML = jobs.length ? jobs.map(function (job) {
      const planCell = job.planName ? escapeHtml(job.planName) : '<span class="muted">兼容模式（伪随机）</span>';
      const scale = job.planSummary ? (job.planSummary.traders + ' / ' + job.planSummary.orders) : ((job.traders && job.traders.length ? job.traders.length : 3) + ' / ' + (job.ordersPerTrader || '?') + '×');
      const result = job.summary ? ('成交 ' + job.summary.executed + '（' + job.summary.longs + ' 多 / ' + job.summary.shorts + ' 空' + (job.summary.closed ? '，平仓 ' + job.summary.closed : '') + '）') : (job.message || '');
      return '<tr><td><code>' + escapeHtml(job.id) + '</code></td><td>' + escapeHtml(job.environment) + '</td><td>' + planCell + '</td><td>' + escapeHtml(scale) + '</td><td>' + noiseChip(job.status) + '</td><td>' + escapeHtml(result) + '</td></tr>';
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
    if (!['http:', 'https:'].includes(location.protocol)) { noiseState.textContent = '离线不可用'; noiseStart.disabled = true; noiseSay('请通过 Node 看板服务打开页面后使用造数据计划。'); return; }
    try {
      const response = await fetch('/api/noise-trades', { headers:{Accept:'application/json'}, cache:'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || body.error || ('接口返回 ' + response.status));
      renderNoiseJobs(body.jobs || []);
      if (!noiseActiveJobId && !(body.jobs || []).length) noiseSay('尚无任务。编辑计划 → 展开预览 → 按计划开始铺底。');
    } catch (error) { noiseState.textContent = 'ERROR'; noiseState.className = 'status-chip status-FAIL'; noiseSay('任务状态读取失败：' + error.message, 'error'); }
  }
  async function loadPlan() {
    if (!['http:', 'https:'].includes(location.protocol)) { applyPlan({ name: '离线示例', traderCount: 10, rules: [{ label: '示例', collateralUsdc: '1000', leverage: 10, side: 'alternate', step: 'fixed', count: 1, traders: 'all' }] }); return; }
    try {
      const response = await fetch('/api/noise-plan', { headers:{Accept:'application/json'}, cache:'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || body.error || ('接口返回 ' + response.status));
      presets = body.presets || {};
      planPreset.innerHTML = '<option value="">选择预设填充…</option>' + Object.keys(presets).map(function (key) { return '<option value="' + escapeHtml(key) + '">' + escapeHtml(presets[key].name) + '</option>'; }).join('');
      applyPlan(body.plan);
      planSummary.textContent = body.saved ? '已加载保存的计划。' : '尚未保存计划，已填充预设骨架。';
    } catch (error) { planSummary.textContent = '计划读取失败：' + error.message; }
  }
  // —— Trader 花名册 ——
  const rosterRows = document.getElementById('roster-rows');
  const rosterStatus = document.getElementById('roster-status');
  let roster = [];
  function renderRoster(items, saved, savedAt) {
    roster = items || [];
    rosterRows.innerHTML = roster.length ? roster.map(function (item) {
      return '<tr><td>' + item.index + '</td><td>' + escapeHtml(item.name) + '</td><td><code>' + escapeHtml(item.address) + '</code></td><td>' + (item.source === 'wallet' ? '真实钱包' : item.source === 'override' ? '覆盖' : '派生占位') + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="muted">尚未生成</td></tr>';
    rosterStatus.textContent = saved ? ('已保存 ' + roster.length + ' 个（' + (savedAt ? new Date(savedAt).toLocaleString('zh-CN', { hour12:false }) : '') + '，config/noise-traders.json + .csv）') : ('预览 ' + roster.length + ' 个派生地址；点击"生成并保存"落盘');
  }
  async function loadRoster() {
    if (!['http:', 'https:'].includes(location.protocol)) { rosterStatus.textContent = '离线不可用'; return; }
    try {
      const response = await fetch('/api/noise-traders', { headers:{Accept:'application/json'}, cache:'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || body.error || ('接口返回 ' + response.status));
      renderRoster(body.roster, body.saved, body.savedAt);
      const walletStatus = document.getElementById('roster-wallet-status');
      walletStatus.textContent = body.wallets && body.wallets.exists
        ? ('🔐 本机存在真实钱包私钥束：' + body.wallets.count + ' 个（' + (body.wallets.mode === 'mnemonic' ? '助记词派生' : '独立随机') + '，' + (body.wallets.generatedAt ? new Date(body.wallets.generatedAt).toLocaleString('zh-CN', { hour12:false }) : '') + '）；造数据计划将用私钥真实签名。')
        : '本机尚无真实钱包私钥束；当前造数据走 impersonation 占位地址。';
    } catch (error) { rosterStatus.textContent = '花名册读取失败：' + error.message; }
  }
  document.getElementById('roster-generate-wallets').addEventListener('click', async function () {
    const count = Number(document.getElementById('roster-count').value) || 100;
    if (!window.confirm('将生成 ' + count + ' 个真实钱包（含私钥）并写入本机 config/noise-traders.secret.json（覆盖旧文件）。私钥不会显示在页面或经 API 返回；请妥善备份助记词。继续？')) return;
    const button = this; button.disabled = true; rosterStatus.textContent = '生成真实钱包中…';
    try {
      const response = await fetch('/api/noise-traders/wallets', { method:'POST', headers:{'Content-Type':'application/json',Accept:'application/json'}, body: JSON.stringify({ count: count, mode: 'mnemonic' }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || body.error || ('接口返回 ' + response.status));
      renderRoster(body.roster, true, body.generatedAt);
      await loadRoster();
      rosterStatus.textContent = '已生成 ' + body.roster.length + ' 个真实钱包（' + body.mode + (body.mnemonicWords ? '，' + body.mnemonicWords + ' 词助记词' : '') + '）；私钥束：' + body.secretPath + '（0600）；公开花名册：' + body.paths.json + ' / ' + body.paths.csv;
    } catch (error) { rosterStatus.textContent = '生成失败：' + error.message; }
    finally { button.disabled = false; }
  });
  document.getElementById('roster-generate').addEventListener('click', async function () {
    const button = this; button.disabled = true; rosterStatus.textContent = '生成中…';
    try {
      const overrides = planTraderAddresses.value.split(/[\\s,]+/).map(function (item) { return item.trim(); }).filter(Boolean);
      const response = await fetch('/api/noise-traders', { method:'POST', headers:{'Content-Type':'application/json',Accept:'application/json'}, body: JSON.stringify({ count: Number(document.getElementById('roster-count').value) || 100, overrides: overrides }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || body.error || ('接口返回 ' + response.status));
      renderRoster(body.roster, true, body.savedAt);
    } catch (error) { rosterStatus.textContent = '生成失败：' + error.message; }
    finally { button.disabled = false; }
  });
  document.getElementById('roster-fill-plan').addEventListener('click', function () {
    if (!roster.length) { rosterStatus.textContent = '请先生成花名册。'; return; }
    planTraderCount.value = roster.length;
    // 派生地址无需写入 traderAddresses（计划会按序号自动派生同一地址）；仅覆盖项需要显式写入
    const overrides = roster.filter(function (item) { return item.source === 'override'; }).map(function (item) { return item.address; });
    planTraderAddresses.value = overrides.length ? roster.map(function (item) { return item.address; }).join(',\\n') : '';
    syncJson();
    rosterStatus.textContent = '已填入计划：Trader 数 = ' + roster.length + (overrides.length ? '（含 ' + overrides.length + ' 个覆盖地址）' : '（全部派生地址，无需显式列出）');
  });

  noiseStart.addEventListener('click', async function () {
    noiseStart.disabled = true; noiseSay('正在按计划启动铺底…'); noiseLog.hidden = false; noiseLogContent.textContent = '';
    try {
      const plan = collectPlan();
      if (!plan.rules.length) throw new Error('至少需要一条网格规则。');
      const response = await fetch('/api/noise-trades', { method:'POST', headers:{'Content-Type':'application/json',Accept:'application/json'}, body: JSON.stringify({ environment: plan.environment, plan: plan }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail || body.error || ('接口返回 ' + response.status));
      noiseActiveJobId = body.job.id;
      await loadNoise();
    } catch (error) { noiseSay('启动失败：' + error.message, 'error'); noiseStart.disabled = false; }
  });

  await Promise.all([initializeFunding(), refreshFaucetBalance(), loadFaucetServiceStatus(true), loadNoise(), loadPlan(), loadRoster()]);
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

import { renderPageShell, serializeForHtml } from './render-page-shell.js';
import type { TradeSiteTarget } from '../server/environment-configuration.js';
import type { ExecutionDeploymentView } from './render-executions.js';

export function renderDeploymentsHtml(
  deploymentByEnvironment: Readonly<Record<string, ExecutionDeploymentView>>,
  tradeSite: TradeSiteTarget,
  generatedAt: string,
): string {
  const deployments = Object.values(deploymentByEnvironment);
  const versions = new Set(deployments.map((item) => item.version));
  const deploymentIds = new Set(deployments.map((item) => item.deploymentId));
  const payload = serializeForHtml({ deployments, tradeSite });
  const content = `
  <section class="summary-grid" aria-label="地址登记摘要">
    <article class="panel"><span>已绑定环境</span><strong>${deployments.length}</strong></article>
    <article class="panel"><span>合约版本</span><strong>${versions.size}</strong></article>
    <article class="panel"><span>Deployment</span><strong>${deploymentIds.size}</strong></article>
  </section>
  <section class="panel address-controls">
    <label>版本<select id="filter-version"><option value="">全部版本</option></select></label>
    <label>环境<select id="filter-environment"><option value="">全部环境</option></select></label>
    <label class="search">搜索<input id="filter-search" type="search" placeholder="合约名、地址、Market、Deployment……"></label>
    <div class="visible"><span>当前显示</span><strong id="visible-count">0 个环境</strong></div>
  </section>
  <section class="panel page-addresses">
    <div><h2>页面地址</h2><p class="muted">页面入口与链上合约地址分开登记；Trade 地址复用“测试环境”中的配置。</p></div>
    <dl>
      <dt>Trade 站点</dt><dd id="trade-site-address"></dd>
      <dt>环境配置</dt><dd><a href="./environments.html">打开测试环境</a></dd>
      <dt>执行详情</dt><dd><a href="./executions.html">打开执行详情</a></dd>
      <dt>本页地址</dt><dd><a id="catalog-page-address"></a></dd>
    </dl>
  </section>
  <section id="deployment-list" class="deployment-list"></section>
  <script id="deployment-data" type="application/json">${payload}</script>`;

  const script = `
  (function () {
    'use strict';
    const data = JSON.parse(document.getElementById('deployment-data').textContent);
    const version = document.getElementById('filter-version');
    const environment = document.getElementById('filter-environment');
    const search = document.getElementById('filter-search');
    const list = document.getElementById('deployment-list');
    const query = new URLSearchParams(location.search);
    function esc(value) {
      return String(value == null ? '' : value).replaceAll('&','&amp;').replaceAll('<','&lt;')
        .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
    }
    function options(values) {
      return Array.from(new Set(values)).sort().map(function (value) {
        return '<option value="' + esc(value) + '">' + esc(value) + '</option>';
      }).join('');
    }
    function addressRow(category, name, address, detail) {
      return '<tr><td>' + esc(category) + '</td><td><strong>' + esc(name) + '</strong>'
        + (detail ? '<small>' + esc(detail) + '</small>' : '') + '</td><td><code>' + esc(address) + '</code></td>'
        + '<td><button type="button" class="copy-address" data-address="' + esc(address) + '">复制</button></td></tr>';
    }
    function addressTable(rows) {
      return '<div class="table-scroll"><table><thead><tr><th>分类</th><th>名称</th><th>合约地址</th><th></th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
    }
    function mockSection(item) {
      const mock = item.mockResources;
      if (!mock) return '';
      const rows = [];
      const shared = mock.sharedCollateral || {};
      if (shared.token) rows.push(addressRow('USDC Mock', 'Collateral Token · ' + shared.token.name, shared.token.address, shared.token.symbol + ' · Token decimals ' + shared.token.decimals));
      if (shared.oracle) rows.push(addressRow('USDC Mock', 'Collateral Oracle · ' + shared.oracle.description, shared.oracle.address, 'Oracle decimals ' + shared.oracle.decimals));
      (mock.bundles || []).forEach(function (bundle) {
        if (bundle.token) rows.push(addressRow(bundle.alias, 'Index Token · ' + bundle.token.name, bundle.token.address, bundle.token.symbol + ' · Token decimals ' + bundle.token.decimals));
        if (bundle.oracle) rows.push(addressRow(bundle.alias, 'Index Oracle · ' + bundle.oracle.description, bundle.oracle.address, 'Oracle decimals ' + bundle.oracle.decimals));
        if (bundle.market?.vault) rows.push(addressRow(bundle.alias, 'Market Vault', bundle.market.vault, 'Market #' + (bundle.market.marketIndex ?? '—') + (bundle.market.bundleId ? ' · ' + bundle.market.bundleId : '')));
      });
      return '<section class="runtime-addresses"><div class="subsection-head"><div><h3>环境运行时 Mock 地址</h3><p class="muted">由该环境初始化产生，不与其他 Fork 共用。</p></div><span class="state state-' + esc(mock.status) + '">' + esc(mock.status) + '</span></div>'
        + (mock.forkDisplayName ? '<p class="fork-name">Fork：<code>' + esc(mock.forkDisplayName) + '</code></p>' : '')
        + (rows.length ? addressTable(rows) : '<p class="muted">该环境尚未登记完整 Mock 地址。</p>') + '</section>';
    }
    function card(item) {
      const coreRows = Object.entries(item.contracts || {}).map(function (entry) { return addressRow('核心合约', entry[0], entry[1]); });
      const extraRows = Object.entries(item.additionalContracts || {}).map(function (entry) { return addressRow('扩展合约', entry[0], entry[1]); });
      const snapshotRows = Object.entries(item.deployedAddresses || {}).map(function (entry) { return addressRow('部署产物', entry[0], entry[1]); });
      const marketRows = (item.markets || []).flatMap(function (market) { return [
        addressRow('Market #' + market.marketIndex, market.name + ' · Index Token', market.indexToken, market.symbol + ' · decimals ' + market.indexTokenDecimals),
        addressRow('Market #' + market.marketIndex, market.name + ' · Collateral Token', market.collateralToken, 'decimals ' + market.collateralTokenDecimals),
        addressRow('Market #' + market.marketIndex, market.name + ' · Vault', market.vault),
      ]; });
      const environmentHref = './environments.html?env=' + encodeURIComponent(item.environment);
      const catalogHref = './deployments.html?version=' + encodeURIComponent(item.version) + '&environment=' + encodeURIComponent(item.environment);
      const tradeHref = data.tradeSite?.configured ? data.tradeSite.tradeUrl : '';
      const pageLinks = (tradeHref ? '<a href="' + esc(tradeHref) + '" target="_blank" rel="noopener noreferrer">Trade 站点</a> · ' : '')
        + '<a href="' + esc(environmentHref) + '">测试环境</a> · <a href="' + esc(catalogHref) + '">本环境地址目录</a>';
      return '<article class="panel deployment-card" data-environment="' + esc(item.environment) + '" data-version="' + esc(item.version) + '">' 
        + '<div class="deployment-head"><div><span class="eyebrow">' + esc(item.deploymentId) + '</span><h2>' + esc(item.environment) + '</h2><p>' + esc(item.version) + ' · 运行 Chain ' + esc(item.environmentChainId) + '</p></div>'
        + '<div class="badges"><span>版本 <strong>' + esc(item.version) + '</strong></span><span>环境 <strong>' + esc(item.environment) + '</strong></span><span>Chain <strong>' + esc(item.environmentChainId) + '</strong></span></div></div>'
        + '<dl class="binding-meta"><dt>Deployment</dt><dd>' + esc(item.deploymentId) + '</dd><dt>Manifest</dt><dd><code>' + esc(item.manifestName) + '</code></dd><dt>合约 Commit</dt><dd><code>' + esc(item.contractCommit) + '</code></dd><dt>部署链 / 运行链</dt><dd>' + esc(item.deploymentChainId) + ' / ' + esc(item.environmentChainId) + '</dd><dt>地址快照</dt><dd>' + (snapshotRows.length ? snapshotRows.length + ' 项（展开下方完整列表）' : '未归档') + '</dd><dt>页面地址</dt><dd>' + pageLinks + '</dd></dl>'
        + '<section class="core-addresses"><h3>核心合约</h3>' + addressTable(coreRows) + '</section>'
        + mockSection(item)
        + (snapshotRows.length ? '<details class="deployment-snapshot-addresses"><summary>完整部署产物地址（' + snapshotRows.length + ' 项）</summary>' + addressTable(snapshotRows) + '</details>' : '')
        + '<details class="more-addresses"><summary>扩展合约与部署 Market（' + (extraRows.length + marketRows.length) + ' 项）</summary>' + addressTable(extraRows.concat(marketRows)) + '</details></article>';
    }
    function searchable(item) {
      return JSON.stringify(item).toLowerCase();
    }
    function syncEnvironmentForVersion() {
      if (!version.value || !environment.value) return;
      const compatible = (data.deployments || []).filter(function (item) { return item.version === version.value; });
      if (compatible.some(function (item) { return item.environment === environment.value; })) return;
      const preferred = compatible.find(function (item) { return item.environment === 'base-sepolia'; }) || compatible[0];
      if (preferred) environment.value = preferred.environment;
    }
    function syncVersionForEnvironment() {
      if (!environment.value || !version.value) return;
      const compatible = (data.deployments || []).find(function (item) { return item.environment === environment.value; });
      if (compatible && compatible.version !== version.value) version.value = compatible.version;
    }
    function render() {
      const term = search.value.trim().toLowerCase();
      const rows = (data.deployments || []).filter(function (item) {
        return (!version.value || item.version === version.value)
          && (!environment.value || item.environment === environment.value)
          && (!term || searchable(item).includes(term));
      });
      list.innerHTML = rows.length ? rows.map(card).join('') : '<section class="panel empty">当前筛选下没有匹配的地址。</section>';
      document.getElementById('visible-count').textContent = rows.length + ' / ' + (data.deployments || []).length + ' 个环境';
      Array.from(document.querySelectorAll('.copy-address')).forEach(function (button) {
        button.addEventListener('click', async function () {
          try { await navigator.clipboard.writeText(button.dataset.address); button.textContent = '已复制'; }
          catch { button.textContent = '复制失败'; }
        });
      });
      const nextQuery = new URLSearchParams(location.search);
      if (version.value) nextQuery.set('version', version.value); else nextQuery.delete('version');
      if (environment.value) nextQuery.set('environment', environment.value); else nextQuery.delete('environment');
      const nextUrl = location.pathname + (nextQuery.toString() ? '?' + nextQuery.toString() : '') + location.hash;
      history.replaceState(null, '', nextUrl);
      const pageAddress = document.getElementById('catalog-page-address');
      pageAddress.href = location.href;
      pageAddress.textContent = location.href;
    }
    version.insertAdjacentHTML('beforeend', options((data.deployments || []).map(function (item) { return item.version; })));
    environment.insertAdjacentHTML('beforeend', options((data.deployments || []).map(function (item) { return item.environment; })));
    if (query.get('version') && Array.from(version.options).some(function (item) { return item.value === query.get('version'); })) version.value = query.get('version');
    if (query.get('environment') && Array.from(environment.options).some(function (item) { return item.value === query.get('environment'); })) environment.value = query.get('environment');
    syncEnvironmentForVersion();
    const tradeMount = document.getElementById('trade-site-address');
    if (data.tradeSite?.configured) tradeMount.innerHTML = '<a href="' + esc(data.tradeSite.tradeUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(data.tradeSite.tradeUrl) + '</a>';
    else tradeMount.innerHTML = '<span class="missing">未配置；请到“测试环境”填写 Trade 站点地址。</span>';
    version.addEventListener('change', function () { syncEnvironmentForVersion(); render(); });
    environment.addEventListener('change', function () { syncVersionForEnvironment(); render(); });
    search.addEventListener('input', render);
    render();
    document.querySelector('main').dataset.pageReady = 'true';
  }());`;

  return renderPageShell({
    title: '版本、环境与合约地址',
    subtitle: `按版本和环境查看页面入口、Deployment、核心合约、Mock 资源与 Market 地址。生成时间：${generatedAt}`,
    active: 'deployments',
    readyId: 'deployments-page',
    content,
    script,
    extraStyles: `
      .summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px}.summary-grid article{display:grid;gap:3px;border-left:4px solid #3978bd}.summary-grid span,.visible span{color:var(--muted);font-size:11px}.summary-grid strong{font-size:25px}
      .address-controls{display:grid;grid-template-columns:180px 200px minmax(260px,1fr) auto;gap:12px;align-items:end;margin-bottom:14px}.address-controls label{display:grid;gap:5px;color:var(--muted);font-size:11px}.address-controls select,.address-controls input{min-height:40px;border:1px solid var(--line);border-radius:9px;background:#0b1220;color:var(--text);padding:8px 10px}.visible{display:grid;gap:2px;padding-bottom:4px}
      .page-addresses{display:grid;grid-template-columns:minmax(260px,.7fr) minmax(0,1.3fr);gap:24px;margin-bottom:14px;min-width:0}.page-addresses>*{min-width:0}.page-addresses h2{margin:0}.page-addresses p{margin:5px 0 0}.page-addresses dl{margin:0}.page-addresses a{overflow-wrap:anywhere}.missing{color:#fbbf24}
      .deployment-list{display:grid;gap:14px;min-width:0}.deployment-card{scroll-margin-top:12px;min-width:0}.deployment-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;border-bottom:1px solid var(--line);padding-bottom:13px;margin-bottom:13px}.deployment-head h2{margin:2px 0;font-size:25px}.deployment-head p{margin:0;color:var(--muted)}.eyebrow{color:#8fc2ff;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.badges{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:7px}.badges span{border:1px solid var(--line);border-radius:999px;background:#0b1220;padding:5px 9px;color:var(--muted);font-size:11px}.badges strong{color:var(--text)}
      dl{display:grid;grid-template-columns:130px minmax(0,1fr);gap:7px 12px;min-width:0}dt{color:var(--muted)}dd{margin:0;min-width:0;overflow-wrap:anywhere}.binding-meta{margin:0 0 16px}.deployment-card h3{margin:0 0 8px}.table-scroll{width:100%;max-width:100%;overflow:auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:9px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--muted);background:var(--panel);position:sticky;top:0}td:nth-child(3){min-width:360px}td code{color:#a9ceff;white-space:nowrap}td small{display:block;color:var(--muted);font-size:10px;margin-top:2px}.copy-address{border:1px solid #3978bd;border-radius:7px;background:#102a4d;color:#cfe4ff;padding:4px 8px;cursor:pointer}
      .runtime-addresses{margin-top:16px;border:1px solid #315f51;border-radius:11px;background:rgba(54,211,153,.035);padding:13px}.subsection-head{display:flex;justify-content:space-between;gap:16px}.subsection-head p{margin:3px 0 0}.state{border:1px solid #1d7a5c;border-radius:999px;padding:3px 8px;color:#36d399;height:max-content}.fork-name{color:var(--muted)}.more-addresses,.deployment-snapshot-addresses{margin-top:14px;border:1px solid var(--line);border-radius:10px}.more-addresses summary,.deployment-snapshot-addresses summary{padding:11px 13px;cursor:pointer;color:#93c5fd}.more-addresses[open] summary,.deployment-snapshot-addresses[open] summary{border-bottom:1px solid var(--line)}.deployment-snapshot-addresses .table-scroll{max-height:620px}.empty{color:var(--muted)}
      @media(max-width:900px){.address-controls{grid-template-columns:1fr 1fr}.address-controls .search{grid-column:1/-1}.page-addresses{grid-template-columns:1fr}.deployment-head{display:block}.badges{justify-content:flex-start;margin-top:10px}}
      @media(max-width:600px){.summary-grid,.address-controls{grid-template-columns:1fr}.address-controls .search{grid-column:auto}.deployment-card{padding:12px}.badges{display:grid;grid-template-columns:1fr}.badges span{white-space:normal}.subsection-head{display:block}dl{grid-template-columns:1fr}dd{margin-bottom:6px}td:nth-child(3){min-width:300px}}
    `,
  });
}

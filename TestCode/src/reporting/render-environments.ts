import { renderPageShell } from './render-page-shell.js';

// 测试环境页：按配置顺序分步呈现。
// ⓪ 一键搭建向导（勾选步骤按 Fork → 部署 → 初始化 → 检查 → 启动本地前端 → 启动 Keeper 固定顺序串行执行，/api/environment-setup 长任务；
//   前端 / Keeper 两步的参数直接取 ⑥ 两张卡的当前控件，环境固定用页面当前环境）
// → ① Fork 与 RPC（Tenderly 建 Fork → 填 RPC 即存）→ ② 部署合约（可选：deploy:contracts 全新部署所选分支）
// → ③ Trade/账户/高级配置（默认折叠）→ ④ Mock Market Bundle 初始化 → ⑤ 环境检查（验收）→ ⑥ 本地服务 → ⑦ 造数据计划。
// 工具条以下是「左侧目录 + 内容」两栏（≤960px 目录变成顶部横向 chip 行）；每个模块标题带折叠按钮，折叠态记在 localStorage['fx100-env-collapsed']。
// Mock Oracle 价格面板在合约参数页。
export function renderEnvironmentsHtml(generatedAt: string): string {
  const content = `
  <section class="toolbar panel">
    <div class="env-picker">
      <span class="env-picker-label muted">测试环境（默认 tx-fork；可用 <code>?env=</code> 分享指定环境）</span>
      <div id="env-tabs" class="env-tabs" role="tablist" aria-label="测试环境"></div>
      <label class="visually-hidden">测试环境<select id="environment"></select></label>
    </div>
    <div class="actions">
      <button id="reload" type="button" class="secondary">重新读取</button>
    </div>
    <p id="connection" class="notice">正在连接本机配置服务…</p>
  </section>

  <div class="env-layout">
  <nav class="env-toc" id="env-toc" aria-label="页面目录">
    <p class="env-toc-title">目录</p>
    <ul class="env-toc-list">
      <li><a href="#wizard-panel" data-toc="wizard-panel">⓪ 一键搭建向导</a></li>
      <li><a href="#fork-panel" data-toc="fork-panel">① Fork 与 RPC</a></li>
      <li><a href="#deploy-panel" data-toc="deploy-panel">② 部署合约</a></li>
      <li><a href="#config-panel" data-toc="config-panel">③ Trade·账户·高级配置</a></li>
      <li><a href="#initialization-panel" data-toc="initialization-panel">④ Mock 初始化</a></li>
      <li><a href="#check-panel" data-toc="check-panel">⑤ 环境检查</a></li>
      <li><a href="#ls-panel" data-toc="ls-panel">⑥ 本地服务</a>
        <ul class="env-toc-sub"><li><a href="#ls-fe-card" data-toc="ls-fe-card" data-toc-parent="ls-panel">前端</a></li><li><a href="#ls-kp-card" data-toc="ls-kp-card" data-toc-parent="ls-panel">Keeper</a></li></ul></li>
      <li><a href="#noise-panel" data-toc="noise-panel">⑦ 造数据计划</a></li>
    </ul>
    <div class="env-toc-actions"><button type="button" class="secondary env-toc-mini" id="toc-expand-all">全部展开</button><button type="button" class="secondary env-toc-mini" id="toc-collapse-all">全部折叠</button></div>
  </nav>
  <div class="env-main">

  <section class="panel section-card" id="wizard-panel">
    <div class="section-heading"><div><h2>⓪ 一键搭建向导</h2><p>勾选需要的步骤后按「新建 Fork → 部署合约 → 初始化 → 检查 → 启动本地前端 → 启动 Keeper」固定顺序自动执行，一步失败即停、后续跳过；每行也可「单独执行」。默认勾选 初始化+检查（重建 Fork 后最常用）；新建 Fork 与部署属破坏性/耗时步骤，需显式勾选；前端 / Keeper 两步按 ⑥ 两张卡的当前设置、以页面当前环境启动。</p></div><button id="wizard-run" type="button">一键执行勾选步骤</button></div>
    <div class="wizard-steps">
      <div class="wizard-step">
        <label class="wizard-pick"><input type="checkbox" id="wizard-pick-createFork"><span><strong>新建/重建 Fork</strong><small>创建 Tenderly Virtual TestNet（固定 Chain ID，fork 块 = latest）；会替换当前环境的 RPC 指向并改写 CURRENT.json</small></span></label>
        <div class="wizard-side"><button id="wizard-solo-createFork" type="button" class="secondary">单独执行</button><span id="wizard-badge-createFork" class="status">未执行</span></div>
        <p class="wizard-log" id="wizard-log-createFork" hidden></p>
      </div>
      <div class="wizard-step">
        <label class="wizard-pick"><input type="checkbox" id="wizard-pick-deploy"><span><strong>部署合约</strong><small>deploy:contracts 全新部署所选分支到当前 Fork（Ignition + configure 三脚本 + 角色授权 + 读回校验）</small></span></label>
        <div class="wizard-options"><label class="wizard-inline">分支<select id="wizard-deploy-branch" disabled><option value="">正在读取分支列表…</option></select></label><label class="wizard-opt"><input type="checkbox" id="wizard-deploy-dry-run">Dry-run（只预览，不触链）</label></div>
        <div class="wizard-side"><button id="wizard-solo-deploy" type="button" class="secondary">单独执行</button><span id="wizard-badge-deploy" class="status">未执行</span></div>
        <p class="wizard-log" id="wizard-log-deploy" hidden></p>
      </div>
      <div class="wizard-step">
        <label class="wizard-pick"><input type="checkbox" id="wizard-pick-init" checked><span><strong>初始化 Mock Bundle</strong><small>default-mock Market Bundle 初始化（Index Token/Oracle、Market、注资与角色授权）</small></span></label>
        <div class="wizard-options"><label class="wizard-opt"><input type="checkbox" id="wizard-init-force" checked>force（重新部署 Bundle）</label><label class="wizard-opt wizard-danger"><input type="checkbox" id="wizard-init-force-shared">force-shared-collateral（重建共享 USDC Oracle）</label></div>
        <div class="wizard-side"><button id="wizard-solo-init" type="button" class="secondary">单独执行</button><span id="wizard-badge-init" class="status">未执行</span></div>
        <p class="wizard-log" id="wizard-log-init" hidden></p>
      </div>
      <div class="wizard-step">
        <label class="wizard-pick"><input type="checkbox" id="wizard-pick-check" checked><span><strong>环境检查</strong><small>只读验收：Trade、RPC、部署清单、账户、角色、default-mock 与 Case 数据源</small></span></label>
        <div class="wizard-side"><button id="wizard-solo-check" type="button" class="secondary">单独执行</button><span id="wizard-badge-check" class="status">未执行</span></div>
        <p class="wizard-log" id="wizard-log-check" hidden></p>
      </div>
      <div class="wizard-step" id="wizard-step-frontend">
        <label class="wizard-pick"><input type="checkbox" id="wizard-pick-frontend"><span><strong>启动本地前端</strong><small>按 ⑥ 前端卡当前选择（分支 / 端口 / 高级选项）起一个 RPC 指向当前页面环境的本地前端；成功后给出 /trade 链接</small></span></label>
        <div class="wizard-side"><button id="wizard-solo-frontend" type="button" class="secondary">单独执行</button><span id="wizard-badge-frontend" class="status">未执行</span></div>
        <p class="wizard-summary" id="wizard-summary-frontend"></p>
        <p class="wizard-log" id="wizard-log-frontend" hidden></p>
      </div>
      <div class="wizard-step" id="wizard-step-keeper">
        <label class="wizard-pick"><input type="checkbox" id="wizard-pick-keeper"><span><strong>启动 Keeper</strong><small>按 ⑥ Keeper 卡勾选的 worker 与 Fork 模式 / Redis 清理选项，在当前页面环境的车道启动 keeper 进程</small></span></label>
        <div class="wizard-side"><button id="wizard-solo-keeper" type="button" class="secondary">单独执行</button><span id="wizard-badge-keeper" class="status">未执行</span></div>
        <p class="wizard-summary" id="wizard-summary-keeper"></p>
        <p class="wizard-log" id="wizard-log-keeper" hidden></p>
      </div>
    </div>
    <p id="wizard-status" class="notice"></p>
  </section>

  <section class="panel section-card" id="fork-panel">
    <div class="section-heading"><div><h2>① Fork 与 RPC</h2><p id="rpc-step-description">先有可用的 Fork，再谈其他配置。填好 RPC 后点击保存即可生效。</p></div><div class="actions"><button id="create-tenderly-fork" type="button" class="secondary">创建 Tenderly Virtual TestNet（固定 Chain ID）并回填 RPC / WSS</button><button id="save-rpc" type="button">保存 RPC 配置</button></div></div>
    <div id="fork-guide" class="guide">
      <strong id="fork-guide-title">tx-fork / oracle-fork / time-fork 的建法（推荐：页面一键创建）：</strong>
      <div id="fork-guide-body">
        <ol>
          <li>在 ① 区填好 <strong>Tenderly Access Token</strong>（可选：<code>E2E_TENDERLY_ACCOUNT_SLUG</code> / <code>E2E_TENDERLY_PROJECT_SLUG</code>；留空则从已配置的同项目 Fork RPC 推导）；</li>
          <li>选好环境后点「创建 Tenderly Virtual TestNet」：按本环境<strong>固定 Chain ID</strong>（tx-fork = <code>99911</code> / oracle-fork = <code>99912</code> / time-fork = <code>99913</code>）在 Base Sepolia (84532) 上建 VNet，创建后用 <code>eth_chainId</code> 校验，自动回填主 RPC / Admin RPC / WSS / Chain ID 并登记 <code>Docs/contract-releases/CURRENT.json</code>；</li>
          <li>需要钉死 fork 区块时在弹窗里填区块号（留空 = latest，响应会回填实际 fork 块）；</li>
          <li>然后按需执行 ② 部署合约（新 fork 需要全新部署时）→ ④ 初始化 Mock Market Bundle → ⑤ 环境检查。命令行等价：<code>npm run env:vnet:create -- --env &lt;环境&gt;</code>（删除：<code>env:vnet:delete</code>）。</li>
        </ol>
        <p class="muted">走 Tenderly Virtual TestNets API（legacy fork API 已于 2026-03-31 停用）。仍可在 Tenderly 控制台手建（Parent Base Sepolia、Custom Chain ID 填固定编号）后把 RPC 粘到下方保存。</p>
      </div>
    </div>
    <div id="rpc-fields" class="field-grid"></div>
    <p id="save-status" class="notice"></p>
  </section>

  <section class="panel section-card" id="deploy-panel">
    <div class="section-heading"><div><h2>② 部署合约（全新部署到当前 Fork）</h2><p id="deploy-description">从 <code>Github/fx100-contracts@&lt;分支&gt;</code> 克隆选择分支，用 <code>deploy:contracts</code> 在当前环境的 fork 上执行 Ignition 全新部署 + configure 三脚本 + 角色授权 + 读回校验。部署完成后必须重新执行 ④ Mock Market Bundle 初始化。</p></div><div class="actions"><button id="deploy-dry-run" type="button" class="secondary" disabled>Dry-run 预览</button><button id="deploy-run" type="button" disabled>部署到当前环境</button></div></div>
    <div class="deploy-controls"><label>合约分支（扫描 Github/ 下 fx100-contracts@* 克隆；soso-test 已按裁决排除）<select id="deploy-branch" disabled><option value="">正在读取分支列表…</option></select></label><button id="reload-deploy-branches" type="button" class="secondary" disabled>重新读取分支</button></div>
    <p id="deploy-status" class="notice"></p>
    <details id="deploy-log" hidden><summary>部署日志（敏感内容已隐藏；最近 120 行）</summary><pre id="deploy-log-content"></pre></details>
  </section>

  <section class="panel section-card" id="config-panel">
    <div class="section-heading"><div><h2>③ Trade、账户与高级配置</h2><p id="configuration-description">默认折叠：不修改即沿用现有配置；需要调整时展开对应分组。</p></div><button id="save-config" type="button">保存全部配置</button></div>
    <div id="config-sections"></div>
  </section>

  <section class="panel section-card" id="initialization-panel">
    <div class="section-heading"><div><h2>④ Mock Market Bundle 初始化</h2><p>一个 Bundle 包含独立 Index Token、Index Mock Oracle、Market 与参数快照；同一 Fork 的 Bundle 共享 USDC Token 与 USDC Mock Oracle。</p></div><span id="mock-capability" class="status"></span></div>
    <div class="subsection"><h3>Mock Token 与 Oracle</h3><div id="asset-profile" class="field-grid"></div></div>
    <div class="subsection"><h3>资金与授权</h3><div id="funding-profile" class="field-grid"></div></div>
    <div class="subsection"><h3>初始化动作</h3><div id="operation-profile" class="operation-grid"></div></div>
    <details class="subsection"><summary>Market 参数：Funding、Fee Ratio 与风控（33 项）</summary>
      <p class="muted">选择当前环境链上已配置的 Index Token，再复制对应 Market 的 33 项原始参数；复制后仍可逐项编辑，点击保存初始化配置后生效。</p>
      <div class="market-source"><label>默认 Market · Index Token<select id="market-source-select" disabled><option>正在读取已配置 Market…</option></select></label><button id="reload-market-sources" type="button" class="secondary">读取 Market 数据</button><button id="copy-market-source" type="button" class="secondary" disabled>复制该 Market 配置</button><span id="market-source-status" class="muted"></span></div>
      <div class="table-wrap"><table><thead><tr><th>分组</th><th>参数</th><th>类型</th><th>覆盖值（可选）</th></tr></thead><tbody id="parameter-rows"></tbody></table></div>
    </details>
    <div class="init-actions">
      <label class="bundle-alias">Market Bundle 别名<input id="bundle-alias" type="text" value="default-mock" pattern="[a-z0-9][a-z0-9-]{0,47}" placeholder="例如 mock-btc"></label>
      <label class="check"><input id="force-init" type="checkbox" checked>重新部署所选 Market Bundle</label>
      <label class="check danger-check"><input id="force-shared-collateral" type="checkbox">同时重建共享 USDC Oracle（影响本 Fork 全部 Market）</label>
      <button id="save-profile" type="button" class="secondary">保存初始化配置</button>
      <button id="run-initialization" type="button">保存并初始化环境</button>
    </div>
    <p class="muted">USDC Min / Max 是环境级配置：创建额外 Bundle 时默认复用现有 USDC Oracle；只有勾选“同时重建”才应用新的 USDC Oracle 配置。</p>
    <p id="initialization-status" class="notice"></p>
    <details id="initialization-log" hidden><summary>初始化日志（敏感内容已隐藏）</summary><pre id="log-content"></pre></details>
  </section>

  <section class="panel section-card" id="check-panel">
    <div class="section-heading"><div><h2>⑤ 环境检查</h2><p id="check-description">只读检查 Trade、RPC、部署清单、账户、角色、default-mock 与 Case 数据源——配置完成后的验收步骤。</p></div><div class="actions"><button id="check" type="button">检查当前环境</button><strong id="check-summary" class="status">尚未检查</strong></div></div>
    <div id="check-results" class="check-grid"><p class="muted">点击“检查当前环境”开始。</p></div>
  </section>

  <section class="panel section-card" id="ls-panel">
    <div class="section-heading"><div><h2>⑥ 本地服务：前端 + Keeper</h2><p>把「起一套指向某环境的本地前端 + Keeper」变成按钮：前端选分支与目标环境的 RPC，Keeper 按类型勾选；每个进程独立登记，停止时杀到真正的子进程。</p></div></div>
    <div class="ls-grid">
      <article class="ls-card" id="ls-fe-card">
        <h3>本地前端</h3>
        <div class="ls-fields">
          <label>前端分支（Github/ 下 fx100-apps@* 克隆 / worktree）<select id="ls-fe-branch" disabled><option value="">正在读取分支列表…</option></select><small id="ls-fe-branch-hint" hidden></small></label>
          <label>目标环境（前端 RPC 指向该环境；随页面环境切换同步）<select id="ls-fe-env"></select></label>
          <label>端口<input type="number" id="ls-fe-port" value="3110" min="1024" max="65535"><small>3010 留给常驻 fx100-frontend-local，请用其它端口</small></label>
        </div>
        <details class="ls-advanced"><summary>高级选项（数据源 / 门禁 / Flash / 价格 API / Chainlink 凭证）</summary>
          <div class="ls-fields">
            <label>数据源 NEXT_PUBLIC_MARKETS_DATA_SOURCE<select id="ls-fe-data-source"><option value="api" selected>api（默认；split 会因地址大小写索引失配而 Market Unavailable）</option><option value="split">split</option></select></label>
            <label class="ls-opt"><input type="checkbox" id="ls-fe-gate-off" checked><span>关闭门禁（NEXT_PUBLIC_GATE_ENABLED=false；本地 /api/access-gate/verify 缺 DATABASE_URL 必 500）</span></label>
            <label class="ls-opt"><input type="checkbox" id="ls-fe-flash"><span>Flash / One-Click（NEXT_PUBLIC_FLASH_ENABLED=true）<small>需 Upstash Redis：UPSTASH_REDIS_REST_URL/TOKEN，否则订单在签名后、上链前失败</small></span></label>
            <label>价格 API（NEXT_PUBLIC_PRICE_FEED_API_URL）<input type="text" id="ls-fe-price-api" value="https://fx100-apps.vercel.app/api"></label>
            <label>API URL（NEXT_PUBLIC_API_URL）<input type="text" id="ls-fe-api-url" value="https://fx100-apps.vercel.app"></label>
            <label class="ls-opt"><input type="checkbox" id="ls-fe-chainlink" checked><span>Chainlink 凭证从 keeper .env 抽取（shell 侧，只取四行，不进看板进程）</span></label>
          </div>
        </details>
        <div class="actions ls-actions"><button id="ls-fe-precheck" type="button" class="secondary">前置检查</button><button id="ls-fe-start" type="button">启动前端</button><button id="ls-fe-refresh" type="button" class="secondary">刷新实例</button></div>
        <p id="ls-fe-status" class="notice"></p>
        <div id="ls-fe-precheck-results" hidden></div>
        <p id="ls-fe-pruned" class="muted" hidden></p>
        <div id="ls-fe-services" class="table-wrap"><p class="muted">尚未读取本地前端实例。</p></div>
      </article>
      <article class="ls-card" id="ls-kp-card">
        <h3>本地 Keeper</h3>
        <div class="ls-fields">
          <label>目标环境（车道 = 该环境 Chain ID，日志落 logs/&lt;chainId&gt;/；随页面环境切换同步）<select id="ls-kp-env"></select></label>
        </div>
        <div class="ls-workers">
          <label class="ls-opt"><input type="checkbox" id="ls-kp-w-producer" data-worker="producer"><span><strong>producer</strong><small>事件监听 · 填队列（勾选任一 worker 自动包含）</small></span></label>
          <label class="ls-opt"><input type="checkbox" id="ls-kp-w-ord" data-worker="ord-worker" checked><span><strong>ord-worker</strong><small>订单执行 · ORDER_KEEPER</small></span></label>
          <label class="ls-opt"><input type="checkbox" id="ls-kp-w-liq" data-worker="liq-worker"><span><strong>liq-worker</strong><small>清算 · LIQUIDATION_KEEPER</small></span></label>
          <label class="ls-opt"><input type="checkbox" id="ls-kp-w-adl" data-worker="adl-worker"><span><strong>adl-worker</strong><small>ADL · ADL_KEEPER</small></span></label>
          <label class="ls-opt"><input type="checkbox" id="ls-kp-w-rel" data-worker="rel-worker"><span><strong>rel-worker</strong><small>Relay 代发 · Express/Flash（队列由前端 /api/relay/* 填）</small></span></label>
        </div>
        <div class="ls-fields">
          <label class="ls-opt"><input type="checkbox" id="ls-kp-fork-mode" checked><span>Fork 模式：关闭全量扫描（KEEPER_LEGACY_MARKET_STATE_SCAN_ENABLED=false + POSITION_EVENT_CACHE=true）</span></label>
          <label class="ls-opt"><input type="checkbox" id="ls-kp-clear-cursors" checked><span>启动前清理本链事件游标（先备份到 artifacts/local-services/redis-backup/）</span></label>
          <label class="ls-opt ls-danger"><input type="checkbox" id="ls-kp-clear-queues"><span>连队列一起清（keeper:* 全部）</span></label>
        </div>
        <div class="guide ls-guide">换 Fork 不清游标，producer 会死等旧块号，订单上链后无人执行；两个扫描开关必须成对。</div>
        <div class="actions ls-actions"><button id="ls-kp-check" type="button" class="secondary">体检</button><button id="ls-kp-start" type="button">启动所选</button><button id="ls-kp-status" type="button" class="secondary">状态</button><button id="ls-kp-stop" type="button" class="secondary">停止本车道</button></div>
        <p id="ls-kp-status-line" class="notice"></p>
        <p id="ls-kp-summary" class="muted" hidden></p>
        <ul id="ls-kp-warnings" class="ls-warnings" hidden></ul>
        <details id="ls-kp-output-wrap" hidden><summary>命令输出</summary><code id="ls-kp-command"></code><pre id="ls-kp-output"></pre></details>
        <div id="ls-kp-state"><p class="muted">尚未读取 Keeper 状态。</p></div>
      </article>
    </div>
  </section>

  <section class="panel section-card noise-plan-section" id="noise-panel">
    <div class="section-heading"><div><h2>⑦ 造数据计划：多 Trader 注资 + 网格交易</h2><p>作为测试环境配置的最后一步，为 Fork 批量铺设复杂交易数据。</p></div></div>
    <iframe id="noise-plan-frame" title="造数据计划：多 Trader 注资 + 网格交易" src="./faucet.html?embed=noise" loading="lazy"></iframe>
  </section>

  </div>
  </div>

  <footer>页面生成：${generatedAt}</footer>`;

  const styles = `
    [hidden]{display:none!important}.toolbar,.section-heading,.init-actions{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
    .env-picker{display:grid;gap:7px;flex:1;min-width:min(320px,100%)}.env-picker-label{font-size:12px}
    .env-tabs{display:flex;flex-wrap:wrap;gap:8px;max-width:100%;overflow-x:auto;padding-bottom:2px}
    .env-tab{display:flex;flex-direction:column;align-items:flex-start;gap:5px;border:1px solid var(--line);border-radius:11px;background:#0d1627;color:var(--muted);padding:8px 12px;cursor:pointer;text-align:left}
    .env-tab .env-tab-name{font-weight:700;color:var(--text)}
    .env-tab[data-env="tx-fork"] .env-tab-name{color:var(--accent)}
    .env-tab[aria-selected="true"]{border-color:#3978bd;background:#102a4d;box-shadow:0 0 0 2px rgba(94,167,255,.28)}
    .env-badges{display:flex;flex-wrap:wrap;gap:4px;max-width:230px}
    .env-badge{border:1px solid var(--line);border-radius:999px;padding:1px 7px;font-size:11px;line-height:1.5;color:var(--muted);background:#101b2d;white-space:nowrap}
    .env-badge.ok{color:#76e3aa;border-color:#1f7a55}.env-badge.warn{color:#f6c85f;border-color:#8b6227}
    .visually-hidden{position:absolute!important;width:1px;height:1px;margin:-1px;padding:0;border:0;clip:rect(0 0 0 0);clip-path:inset(50%);overflow:hidden;white-space:nowrap}
    label{display:grid;gap:6px;color:var(--muted)}select,input,button{font:inherit}select,input{width:100%;border:1px solid var(--line);border-radius:9px;background:#0a1322;color:var(--text);padding:9px 11px}input[type=checkbox]{width:auto;accent-color:var(--accent)}button{border:1px solid #367dc6;border-radius:9px;background:#1764aa;color:white;padding:9px 14px;cursor:pointer}button.secondary{background:#101b2d;border-color:var(--line);color:var(--text)}button:disabled{opacity:.5;cursor:not-allowed}
    .actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.notice{width:100%;margin:2px 0 0;color:#f6c85f}.section-card{margin-top:16px}.section-heading h2,.subsection h3{margin:0}.section-heading p,.subsection p{margin:4px 0 0;color:var(--muted)}
    .guide{border:1px solid var(--line);border-left:4px solid #367dc6;border-radius:9px;background:#0d1627;padding:12px 16px;margin-top:14px}.guide ol,.guide ul{margin:8px 0 0;padding-left:20px;display:grid;gap:4px}.guide p{margin:8px 0 0}
    .config-section,.subsection{border-top:1px solid var(--line);padding-top:16px;margin-top:16px}.config-section h3{margin:0 0 2px}.config-section summary{display:flex;align-items:baseline;gap:8px;cursor:pointer}.config-section summary strong{font-size:15px}.field-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:13px;margin-top:13px}.field{border:1px solid var(--line);border-radius:10px;padding:11px;background:#0d1627}.field small{color:var(--muted);min-height:34px;display:block;overflow-wrap:anywhere}.field-line{display:flex;align-items:center;justify-content:space-between;gap:8px}.required{color:#ff9a9a}.secret-state{font-size:12px;color:#73d8a4}.clear-secret{display:flex;margin-top:7px;grid-template-columns:auto 1fr;align-items:center}
    .check-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px}.check-result{border:1px solid var(--line);border-left-width:4px;border-radius:9px;padding:10px;background:#0d1627}.check-result.PASS{border-left-color:#44c488}.check-result.FAIL{border-left-color:#ff6868}.check-result.WARN{border-left-color:#f6c85f}.check-result strong{display:block}.check-result small{color:var(--muted)}.status{border-radius:999px;padding:5px 10px;background:#17243a;color:var(--muted);white-space:nowrap}.status.PASS,.status.READY{color:#76e3aa}.status.FAIL,.status.NOT_READY{color:#ff9090}
    .wizard-steps{display:grid;gap:9px;margin-top:12px}.wizard-step{display:flex;align-items:center;gap:10px;flex-wrap:wrap;border:1px solid var(--line);border-radius:9px;padding:10px;background:#0d1627}
    .wizard-pick{display:flex;flex-direction:row;align-items:flex-start;gap:9px;flex:1;min-width:min(280px,100%);color:var(--text)}.wizard-pick small{display:block;color:var(--muted)}
    .wizard-side{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.wizard-options{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
    .wizard-inline{display:flex;flex-direction:row;align-items:center;gap:6px;min-width:min(260px,100%)}.wizard-inline select{min-width:min(210px,100%)}
    .wizard-opt{display:flex;flex-direction:row;align-items:center;gap:6px;color:var(--muted)}.wizard-danger{color:#f6c85f}
    .wizard-log{width:100%;margin:0;color:var(--muted);white-space:pre-wrap;overflow-wrap:anywhere;max-height:130px;overflow:auto;font-size:12px;border-top:1px dashed var(--line);padding-top:6px}
    .status.pending{color:var(--muted)}.status.running{color:#f6c85f}.status.succeeded{color:#76e3aa}.status.failed{color:#ff9090}.status.skipped{color:var(--muted)}
    .operation-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:9px;margin-top:12px}.operation-grid label,.check{display:flex;grid-template-columns:auto 1fr;align-items:flex-start;gap:9px;border:1px solid var(--line);border-radius:9px;padding:10px;background:#0d1627;color:var(--text)}.bundle-alias{min-width:min(310px,100%)}.danger-check{border-color:#8b6227;color:#f6c85f}.market-source{display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin-top:12px;padding:12px;border:1px solid var(--line);border-radius:9px;background:#0d1627}.market-source label{min-width:min(680px,100%)}.market-source span{padding:9px 0}.deploy-controls{display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin-top:12px}.deploy-controls label{min-width:min(520px,100%);flex:1}details summary{cursor:pointer;font-weight:700}.table-wrap{overflow:auto;margin-top:12px}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid var(--line);padding:8px;white-space:nowrap}td input{min-width:260px}.group-funding{color:#73d8a4}.group-fee{color:#f6c85f}.init-actions{border-top:1px dashed var(--line);padding-top:16px;margin-top:16px}.init-actions label{min-width:min(240px,100%)}pre{max-height:360px;overflow:auto;white-space:pre-wrap;background:#08101d;border-radius:9px;padding:12px}.noise-plan-section{padding-bottom:4px}.noise-plan-section iframe{display:block;width:100%;min-height:900px;border:0;background:transparent;margin-top:12px}footer{margin-top:18px;color:var(--muted)}
    .ls-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(440px,1fr));gap:14px;margin-top:14px}@media (max-width:520px){.ls-grid{grid-template-columns:1fr}}
    .ls-card{border:1px solid var(--line);border-radius:11px;background:#0d1627;padding:14px;min-width:0;overflow-wrap:anywhere}.ls-card h3{margin:0}.ls-card .table-wrap{margin-top:10px}.ls-card td{white-space:normal;overflow-wrap:anywhere}.ls-card pre{margin:0;max-height:260px;font-size:12px}
    .ls-fields{display:grid;gap:10px;margin-top:10px}.ls-fields label{min-width:0}.ls-fields small,.ls-opt small{display:block;color:var(--muted)}
    .ls-opt{display:flex;flex-direction:row;align-items:flex-start;gap:8px;color:var(--text)}.ls-opt span{min-width:0}.ls-opt input[type=checkbox]{margin-top:4px;flex:none}.ls-danger{color:#f6c85f}
    .ls-workers{display:grid;gap:8px;margin-top:10px;border:1px solid var(--line);border-radius:9px;padding:10px;background:#0a1322}.ls-workers strong{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
    .ls-advanced{margin-top:10px}.ls-advanced summary{color:var(--muted)}.ls-actions{margin-top:12px}.ls-guide{margin-top:10px;padding:8px 12px;font-size:12px}
    .ls-check-grid{margin-top:10px}.ls-info{display:grid;gap:6px;border:1px solid var(--line);border-radius:9px;padding:10px;margin-top:10px;background:#0a1322}.ls-info code{overflow-wrap:anywhere;word-break:break-all}.ls-rpc-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .ls-mini{padding:4px 9px;font-size:12px}.ls-row-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.ls-log-row td{background:#08101d}
    .ls-kv{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:10px 0 0;font-size:13px}.ls-kv dt{color:var(--muted)}.ls-kv dd{margin:0;overflow-wrap:anywhere}
    .ls-warnings{margin:8px 0 0;padding-left:18px;color:#f6c85f}.ls-muted-details{margin-top:8px}.ls-muted-details summary{color:var(--muted);font-weight:600}.ls-muted-details ul{margin:6px 0 0;padding-left:18px}
    #ls-kp-command{display:block;color:var(--muted);font-size:12px;margin-bottom:6px;overflow-wrap:anywhere}
    /* 左侧目录 + 内容两栏；≤960px 目录变顶部横向 chip 行（不 sticky，避免撑宽移动端 body） */
    .env-layout{display:grid;grid-template-columns:200px minmax(0,1fr);gap:16px;align-items:start;margin-top:16px}
    .env-main{min-width:0}.env-main>.section-card:first-child{margin-top:0}
    .env-toc{position:sticky;top:12px;display:grid;gap:8px;border:1px solid var(--line);border-radius:12px;background:#0d1627;padding:12px 10px;max-height:calc(100vh - 24px);overflow:auto;min-width:0}
    .env-toc-title{margin:0;font-size:12px;color:var(--muted);letter-spacing:.08em;padding:0 8px}
    .env-toc ul{list-style:none;margin:0;padding:0;display:grid;gap:2px}.env-toc-sub{padding-left:14px!important;margin-top:2px!important}
    .env-toc a{display:block;color:var(--muted);text-decoration:none;border:1px solid transparent;border-radius:8px;padding:6px 8px;font-size:13px;line-height:1.35}
    .env-toc a:hover{color:var(--text);background:#101b2d}.env-toc a.is-active{color:var(--text);border-color:#3978bd;background:#102a4d}.env-toc a.is-active-parent{color:var(--text)}
    .env-toc a.is-collapsed::after{content:'已折叠';margin-left:6px;font-size:10px;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:0 5px;vertical-align:middle}
    .env-toc-actions{display:flex;gap:6px;flex-wrap:wrap;border-top:1px dashed var(--line);padding-top:8px}.env-toc .env-toc-mini{padding:5px 9px;font-size:12px}
    @media (max-width:960px){
      .env-layout{display:block}
      .env-toc{position:static;max-height:none;display:flex;flex-wrap:nowrap;align-items:center;gap:6px;overflow-x:auto;overflow-y:hidden;padding:8px;-webkit-overflow-scrolling:touch}
      .env-toc-title{display:none}.env-toc ul,.env-toc li{display:flex;flex-wrap:nowrap;align-items:center;gap:6px}.env-toc-sub{padding-left:0!important;margin-top:0!important}
      .env-toc a{white-space:nowrap;border-color:var(--line);background:#101b2d;border-radius:999px;padding:5px 10px;font-size:12px}.env-toc a.is-active{border-color:#3978bd;background:#102a4d}
      .env-toc-actions{border-top:0;padding-top:0;flex-wrap:nowrap;flex:none;margin-left:4px}.env-toc .env-toc-mini{white-space:nowrap}
    }
    /* 模块折叠：标题行右侧折叠按钮（JS 注入），折叠后只留标题行；标题文字本身可点 */
    .section-heading>div:first-child{flex:1;min-width:min(260px,100%)}.section-heading h2{cursor:pointer}
    .section-heading .sec-toggle{flex:none;padding:4px 10px;font-size:12px}
    .section-card.is-collapsed>:not(.section-heading){display:none}.section-card,.ls-card{scroll-margin-top:12px}
    /* 向导「启动本地前端 / 启动 Keeper」行：实时摘要来自 ⑥ 两张卡 */
    .wizard-summary{width:100%;margin:0;display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px;color:var(--muted);overflow-wrap:anywhere}
    .wizard-summary code{color:#c4d8ff}.wizard-warn{color:#f6c85f}.wizard-env-note{color:#f6c85f}.wizard-goto{white-space:nowrap}
    .wizard-step.is-unavailable .wizard-pick{opacity:.6}
  `;

  const script = `
    const environmentNames=['dev-readonly','tx-fork','oracle-fork','time-fork','base-sepolia'];
    const forkGuides={
      'tx-fork':{chainId:'99911',role:'交易账本线——SCN-009 等交易与数据核对用例的默认环境',special:[
        'State Sync 按需：需要跟随真链最新状态时可开启；跑受控核对用例期间建议关闭，避免窗口内混入外部状态变化；',
        'Service Keeper 可指向本 Fork：启动命令会注入当前 RPC 与 KEEPER_EXPECTED_CHAIN_ID=99911；',
        '改 Mock 价格必须三件套同步（feed 价 + 时间戳 + STABLE_PRICE 锚）——只改其一会触发订单静默取消（LiquidatablePosition）。']},
      'oracle-fork':{chainId:'99912',role:'受控价格边界线——SCN-010 / SCN-070 固定在此运行',special:[
        '必须关闭运行期 State Sync：用例靠受控推价构造精确价格边界，真链同步会覆盖推价状态；',
        'Admin RPC 必填（可与主 RPC 相同）：用例依赖 evm_snapshot / evm_revert 与免签名推价、DataStore 写入；',
        '必须完成 ③ 双 Mock Oracle Market Bundle 初始化（Index 与 USDC 两个 Mock Oracle 都是 mock）——缺一个 SCN-010/070 直接拒跑；',
        '用例会反复激进推价，勿与交易账本线（tx-fork）共用一个 Fork，避免价格状态互相污染。']},
      'time-fork':{chainId:'99913',role:'时间推进线——grace / funding 时效等需要拨快区块时间的用例',special:[
        '必须关闭运行期 State Sync：时间拨快后与真链时钟脱钩，同步会产生冲突；',
        'Admin RPC 必填：时间控制依赖 evm_increaseTime / evm_setNextBlockTimestamp / evm_snapshot；',
        '时间只能拨快不能回退：时钟领先后，Mock Oracle 时间戳会显得过旧（60s 价龄上限），执行交易前先刷新 Oracle 时间戳。']}
    };
    function renderForkGuide(){
      const guide=forkGuides[environment.value];
      const title=document.getElementById('fork-guide-title'),body=document.getElementById('fork-guide-body');
      if(!guide){title.textContent='tx-fork / oracle-fork / time-fork 的建法（Tenderly 控制台）：';return;}
      title.textContent=environment.value+' 的建法（页面一键创建 / 控制台手建）· Chain ID 固定 '+guide.chainId+'：';
      body.innerHTML='<p>定位：'+guide.role+'。</p>'
        +'<ol>'
        +'<li>推荐：点上方「创建 Tenderly Virtual TestNet」，自动以 Chain ID <code>'+guide.chainId+'</code>（本环境专用编号；tx-fork=99911 / oracle-fork=99912 / time-fork=99913，避免与真链混淆、也便于 Keeper 按 Chain ID 隔离游标）在 Base Sepolia (84532) 上建 VNet 并回填 RPC / Admin RPC / WSS / Chain ID、登记 CURRENT.json；</li>'
        +'<li>备选：Tenderly 控制台手建（Parent Base Sepolia，Custom Chain ID 填 <code>'+guide.chainId+'</code>），把 HTTPS RPC 填到下方 <strong>主 RPC</strong> 与 <strong>Admin RPC</strong>，点击“保存 RPC 配置”。</li>'
        +'</ol>'
        +'<p><strong>本环境特殊要求（区别于其他 Fork）：</strong></p>'
        +'<ul>'+guide.special.map(function(item){return '<li>'+item+'</li>';}).join('')+'</ul>'
        +'<p class="muted">按钮走 Virtual TestNets API（legacy fork API 已停用），Chain ID 自动用固定编号并经 eth_chainId 校验；建好后按需 ② 部署合约，再 ④ 初始化 Mock Market Bundle。</p>';
    }
    const state={configuration:null,profile:null,profiles:null,marketSources:[],activeInitializationId:null,poll:null,deployBranches:[],deployBranchesLoaded:false,activeDeploymentId:null,deployPoll:null,activeWizardId:null,wizardPoll:null};
    const environment=document.getElementById('environment');
    environment.innerHTML=environmentNames.map(function(name){return '<option value="'+name+'">'+name+'</option>';}).join('');
    // 环境标签条：三条 Fork 放前面、tx-fork 最前且为默认；select 保留但视觉隐藏，environment.value 仍是全部联动的单一事实源。
    const environmentTabOrder=['tx-fork','oracle-fork','time-fork','dev-readonly','base-sepolia'];
    const fixedChainIds={'tx-fork':99911,'oracle-fork':99912,'time-fork':99913,'base-sepolia':84532};
    const forkEnvironmentNames=['tx-fork','oracle-fork','time-fork'];
    const ENVIRONMENT_STORAGE_KEY='fx100-environments-selected';
    function readStoredEnvironment(){try{return localStorage.getItem(ENVIRONMENT_STORAGE_KEY);}catch(error){return null;}}
    function persistEnvironment(name){try{localStorage.setItem(ENVIRONMENT_STORAGE_KEY,name);}catch(error){/* 无痕/禁存储时静默回退，不影响切换 */}}
    (function initializeEnvironmentSelection(){
      let initial='tx-fork';
      let urlEnvironment=null;
      try{urlEnvironment=new URLSearchParams(location.search).get('env');}catch(error){urlEnvironment=null;}
      if(urlEnvironment&&environmentNames.includes(urlEnvironment)){initial=urlEnvironment;}
      else{const stored=readStoredEnvironment();if(stored&&environmentNames.includes(stored))initial=stored;}
      environment.value=initial;
    })();
    function environmentBadges(name){
      const isFork=forkEnvironmentNames.includes(name);
      const profile=state.profiles?state.profiles.find(function(item){return item.name===name;}):null;
      const badges=[];
      const chainId=profile?(profile.fixedChainId||profile.configuredChainId):fixedChainIds[name];
      if(chainId)badges.push('<span class="env-badge">Chain '+esc(chainId)+'</span>');
      if(profile){
        badges.push('<span class="env-badge '+(profile.rpcConfigured?'ok':'warn')+'">RPC '+(profile.rpcConfigured?'已配':'未配')+'</span>');
        if(profile.initializesDefaultMockResources)badges.push('<span class="env-badge '+(profile.defaultMockStatus==='ready'?'ok">mock ready':'warn">mock pending')+'</span>');
        if(isFork&&profile.forkOfVersion)badges.push('<span class="env-badge">'+esc(profile.forkOfVersion)+'</span>');
      }else if(isFork){
        badges.push('<span class="env-badge">需 serve 读取</span>');
      }
      return badges.join('');
    }
    function renderEnvironmentTabs(){
      document.getElementById('env-tabs').innerHTML=environmentTabOrder.map(function(name){
        return '<button type="button" class="env-tab" role="tab" data-env="'+name+'" aria-selected="'+(name===environment.value)+'">'
          +'<span class="env-tab-name">'+name+'</span><span class="env-badges">'+environmentBadges(name)+'</span></button>';
      }).join('');
    }
    function syncEnvironmentTabs(){
      document.querySelectorAll('#env-tabs .env-tab').forEach(function(tab){tab.setAttribute('aria-selected',String(tab.dataset.env===environment.value));});
    }
    document.getElementById('env-tabs').addEventListener('click',function(event){
      const tab=event.target.closest('.env-tab');
      if(!tab||tab.dataset.env===environment.value)return;
      environment.value=tab.dataset.env;
      environment.dispatchEvent(new Event('change'));
    });
    renderEnvironmentTabs();
    function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(char){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char];});}
    function fieldInput(field){const id='config-'+field.key;const value=field.value||'';if(field.type==='checkbox')return '<input id="'+id+'" data-key="'+field.key+'" type="checkbox" '+(value==='true'?'checked':'')+'>';
      if(field.type==='select')return '<select id="'+id+'" data-key="'+field.key+'">'+(field.options||[]).map(function(option){return '<option '+(option===value?'selected':'')+'>'+esc(option)+'</option>';}).join('')+'</select>';
      return '<input id="'+id+'" data-key="'+field.key+'" type="'+(field.type==='number'?'number':field.type==='secret'?'password':field.type==='url'?'url':'text')+'" value="'+esc(value)+'" '+(field.secret?'autocomplete="new-password" placeholder="留空保持现有值"':'')+'>';
    }
    function fieldCard(field){return '<label class="field"><span class="field-line"><strong>'+esc(field.label)+(field.required?' <span class="required">*</span>':'')+'</strong>'+(field.secret?'<span class="secret-state">'+(field.configured?'已配置':'未配置')+'</span>':'')+'</span><small>'+esc(field.help)+'</small>'+fieldInput(field)+(field.secret&&field.configured?'<span class="clear-secret"><input type="checkbox" data-clear="'+field.key+'"> 清除现有值</span>':'')+'</label>';}
    function renderConfiguration(){const config=state.configuration;
      const rpcFields=config.fields.filter(function(field){return field.section==='rpc';});
      document.getElementById('rpc-fields').innerHTML=rpcFields.map(fieldCard).join('');
      document.getElementById('config-sections').innerHTML=config.sections.filter(function(section){return section.id!=='rpc';}).map(function(section){const fields=config.fields.filter(function(field){return field.section===section.id;});if(!fields.length)return '';return '<details class="config-section"><summary><strong>'+esc(section.label)+'</strong><span class="muted">'+esc(section.description)+'</span></summary><div class="field-grid">'+fields.map(fieldCard).join('')+'</div></details>';}).join('');}
    const assetFields=[['token.name','Index Token 名称','text'],['token.symbol','Index Token Symbol','text'],['token.decimals','Index Token Decimals','number'],['oracle.description','Index Oracle 描述','text'],['oracle.decimals','Index Oracle Decimals','number'],['oracle.minPrice','Index Oracle Min（USD）','text'],['oracle.maxPrice','Index Oracle Max（USD）','text'],['oracle.heartbeatDuration','Index Heartbeat（秒）','text'],['collateralOracle.description','USDC Oracle 描述','text'],['collateralOracle.decimals','USDC Oracle Decimals','number'],['collateralOracle.minPrice','USDC Oracle Min（USD）','text'],['collateralOracle.maxPrice','USDC Oracle Max（USD）','text'],['collateralOracle.heartbeatDuration','USDC Heartbeat（秒）','text'],['referenceMarketIndex','参考 Market Index','number']];
    const fundingFields=[['funding.nativeBalanceEth','账户 ETH','text'],['funding.traderCollateral','Trader Collateral（十进制）','text'],['funding.minimumLpCollateral','最低 LP Collateral（十进制）','text'],['funding.routerAllowance','Router allowance','select']];
    const operationLabels={configureMarketParameters:'配置 Market 风控参数',configureFundingParameters:'配置 Funding 参数',configureFeeRatio:'配置 Position Fee Ratio',fundNativeAccounts:'注入 Trader/Keeper/Admin ETH',fundTraderCollateral:'注入 Trader Collateral',seedLpLiquidity:'补足 LP 最低流动性',grantRoles:'授予 Keeper/Admin 角色',configureRouterAllowance:'配置 Trader → Router allowance',validateAfterInitialization:'初始化后逐项回读验证'};
    function getPath(object,path){return path.split('.').reduce(function(value,key){return value[key];},object);}
    function setPath(object,path,value){const keys=path.split('.');let target=object;keys.slice(0,-1).forEach(function(key){target=target[key];});target[keys[keys.length-1]]=value;}
    function profileField(definition){const path=definition[0],label=definition[1],type=definition[2],value=getPath(state.profile.profile,path);if(type==='select')return '<label class="field"><strong>'+label+'</strong><select data-profile="'+path+'"><option value="max" '+(value==='max'?'selected':'')+'>最大授权</option><option value="exact" '+(value==='exact'?'selected':'')+'>精确额度</option></select></label>';return '<label class="field"><strong>'+label+'</strong><input data-profile="'+path+'" type="'+(type==='number'?'number':'text')+'" value="'+esc(value)+'"></label>';}
    function renderEnvironmentMode(){const supported=state.configuration.capabilities.initializesDefaultMockResources;const isBase=environment.value==='base-sepolia';document.getElementById('wizard-panel').hidden=!supported;document.getElementById('initialization-panel').hidden=!supported;document.getElementById('create-tenderly-fork').hidden=!supported;document.getElementById('fork-guide').hidden=!supported;document.getElementById('deploy-panel').hidden=!supported;document.getElementById('rpc-step-description').textContent=isBase?'Base Sepolia 使用公共 RPC：填好主 RPC/WSS 后保存即可。':'先有可用的 Fork，再谈其他配置。填好 RPC 后点击保存即可生效。';document.getElementById('configuration-description').textContent=isBase?'Base Sepolia 使用已有部署：这里只维护 Trade、Trader、Admin、签名和本机数据源。默认折叠，需要修改自行展开。':'默认折叠：不修改即沿用现有配置；需要调整时展开对应分组。';document.getElementById('check-description').textContent=isBase?'只读检查 Trade、Base Sepolia RPC、部署清单、账户/Admin 与 Case 数据源；不会部署 Mock Token/Oracle、Market，也不会执行 Keeper 初始化。':'只读检查 Trade、RPC、部署清单、账户、角色、default-mock 与 Case 数据源——配置完成后的验收步骤。';renderForkGuide();tocSyncHidden();}
    function renderProfile(){const supported=state.configuration.capabilities.initializesDefaultMockResources;renderEnvironmentMode();if(!supported||!state.profile)return;document.getElementById('mock-capability').textContent='支持完整初始化';document.getElementById('asset-profile').innerHTML=assetFields.map(profileField).join('');document.getElementById('funding-profile').innerHTML=fundingFields.map(profileField).join('');document.getElementById('operation-profile').innerHTML=Object.entries(operationLabels).map(function(entry){return '<label><input type="checkbox" data-operation="'+entry[0]+'" '+(state.profile.profile.operations[entry[0]]?'checked':'')+'><span>'+esc(entry[1])+'</span></label>';}).join('');document.getElementById('parameter-rows').innerHTML=state.profile.parameters.map(function(parameter){return '<tr><td class="group-'+parameter.group+'">'+({funding:'Funding',fee:'Fee Ratio',market:'Market'}[parameter.group])+'</td><td><code>'+esc(parameter.label)+'</code></td><td>'+parameter.valueType+'</td><td><input data-parameter="'+esc(parameter.label)+'" value="'+esc(parameter.overrideValue||'')+'" placeholder="从参考 Market 复制"></td></tr>';}).join('');document.getElementById('run-initialization').disabled=false;}
    function collectProfile(){document.querySelectorAll('[data-profile]').forEach(function(input){const path=input.dataset.profile;let value=input.value.trim();if(input.type==='number')value=Number(value);setPath(state.profile.profile,path,value);});document.querySelectorAll('[data-operation]').forEach(function(input){state.profile.profile.operations[input.dataset.operation]=input.checked;});const overrides={};document.querySelectorAll('[data-parameter]').forEach(function(input){if(input.value.trim())overrides[input.dataset.parameter]=input.value.trim();});state.profile.profile.parameterOverrides=overrides;return state.profile.profile;}
    async function requestJson(url,options){const response=await fetch(url,options);const result=await response.json();if(!response.ok)throw new Error(result.detail||result.error||('接口返回 '+response.status));return result;}
    function renderMarketSources(){const select=document.getElementById('market-source-select'),button=document.getElementById('copy-market-source'),status=document.getElementById('market-source-status');if(!state.marketSources.length){select.innerHTML='<option value="">当前环境未读取到可复制的 Market</option>';select.disabled=true;button.disabled=true;status.textContent='请先配置可用 RPC，且链上至少存在一个 Market。';return;}select.innerHTML=state.marketSources.map(function(market){const index=market.indexTokenSymbol||market.indexTokenName||market.indexToken;const collateral=market.collateralTokenSymbol||market.collateralTokenName||market.collateralToken;return '<option value="'+esc(market.indexToken)+'">Market #'+esc(market.marketIndex)+' · '+esc(index)+' / '+esc(collateral)+' · '+esc(market.indexToken)+'</option>';}).join('');select.disabled=false;button.disabled=false;status.textContent='已读取 '+state.marketSources.length+' 个链上 Market。';}
    async function loadMarketSources(){const query=encodeURIComponent(environment.value);const result=await requestJson('/api/default-market-source?environment='+query);state.marketSources=result.markets;renderMarketSources();}
    async function copyMarketSource(){const button=document.getElementById('copy-market-source'),select=document.getElementById('market-source-select'),status=document.getElementById('market-source-status');button.disabled=true;status.textContent='正在读取该 Market 的 33 项参数…';try{const result=await requestJson('/api/default-market-source',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({environment:environment.value,indexToken:select.value})});state.profile.profile.referenceMarketIndex=result.source.marketIndex;state.profile.profile.parameterOverrides=result.source.parameterOverrides;state.profile.parameters=Object.entries(result.source.parameterOverrides).map(function(entry){const current=state.profile.parameters.find(function(parameter){return parameter.label===entry[0];});return Object.assign({},current,{overrideValue:entry[1]});});renderProfile();status.textContent='已复制 Market #'+result.source.marketIndex+' 的 33 项参数；点击“保存初始化配置”后生效。';}finally{button.disabled=false;}}
    async function load(){
      renderLocalServicesEnvironment();
      if(!['http:','https:'].includes(location.protocol)){
        document.getElementById('connection').textContent='静态 HTML 仅预览：配置读取、合约部署与初始化需要经 npm run dashboard:serve 打开本页。';
        document.getElementById('deploy-status').textContent='静态模式不可部署：分支列表与部署任务需要本机看板服务，请经 npm run dashboard:serve 打开本页（按钮已禁用）。';
        document.getElementById('deploy-branch').innerHTML='<option value="">静态模式不可用（需 dashboard:serve）</option>';
        document.getElementById('wizard-deploy-branch').innerHTML='<option value="">静态模式不可用（需 dashboard:serve）</option>';
        document.getElementById('wizard-status').textContent='静态模式不可执行：一键搭建与单独执行需要本机看板服务，请经 npm run dashboard:serve 打开本页（按钮已禁用）。';
        ['save-rpc','save-config','save-profile','run-initialization','check','create-tenderly-fork','reload-market-sources','deploy-branch','reload-deploy-branches','deploy-dry-run','deploy-run','wizard-run','wizard-solo-createFork','wizard-solo-deploy','wizard-solo-init','wizard-solo-check','wizard-solo-frontend','wizard-solo-keeper','wizard-deploy-branch'].forEach(function(id){document.getElementById(id).disabled=true;});
        return;
      }
      document.getElementById('connection').textContent='正在读取 '+environment.value+'…';const query=encodeURIComponent(environment.value);const configurationResult=await requestJson('/api/environment-configuration?environment='+query);state.configuration=configurationResult.configuration;state.profile=null;state.marketSources=[];try{state.profiles=(await requestJson('/api/environments')).environments;}catch(error){state.profiles=null;}renderEnvironmentTabs();renderConfiguration();renderEnvironmentMode();if(!state.deployBranchesLoaded){state.deployBranchesLoaded=true;await loadDeployBranches();}if(state.configuration.capabilities.initializesDefaultMockResources){state.profile=await requestJson('/api/environment-initialization-profile?environment='+query);renderProfile();try{await loadMarketSources();}catch(error){state.marketSources=[];renderMarketSources();document.getElementById('market-source-status').textContent='Market 列表读取失败：'+error.message;}}document.getElementById('connection').textContent=environment.value==='base-sepolia'?'已连接 Base Sepolia 配置；该环境不会加载或执行 Mock/Market/Keeper 初始化。':'已连接本机服务；RPC 显示完整地址，私钥和 Token 只显示配置状态。按 ①→⑤ 顺序完成配置（② 部署合约仅在需要全新部署时执行）。';}
    async function saveConfiguration(){const values={};state.configuration.fields.forEach(function(field){const input=document.getElementById('config-'+field.key);if(field.type==='checkbox')values[field.key]=String(input.checked);else if(!field.secret||input.value.trim())values[field.key]=input.value;});const clearKeys=Array.from(document.querySelectorAll('[data-clear]:checked')).map(function(input){return input.dataset.clear;});const result=await requestJson('/api/environment-configuration',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({environment:environment.value,values:values,clearKeys:clearKeys})});state.configuration=result.configuration;renderConfiguration();document.getElementById('save-status').textContent='配置已保存到本机 .env.local。';}
    async function saveProfile(){const result=await requestJson('/api/environment-initialization-profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({environment:environment.value,profile:collectProfile()})});state.profile=result;renderProfile();document.getElementById('initialization-status').textContent='初始化配置已保存。';return result;}
    async function check(){document.getElementById('check-summary').textContent='检查中…';const result=await requestJson('/api/environment-check?environment='+encodeURIComponent(environment.value));const check=result.result;document.getElementById('check-summary').textContent=check.status;document.getElementById('check-summary').className='status '+check.status;document.getElementById('check-results').innerHTML=check.checks.map(function(item){return '<article class="check-result '+item.status+'"><strong>'+esc(item.label)+' · '+item.status+'</strong><small>'+esc(item.detail)+'</small></article>';}).join('');}
    function renderJob(job){const alias=job.bundleAlias||'default-mock';document.getElementById('initialization-status').textContent='['+alias+'] '+(job.message||('初始化状态：'+job.status));document.getElementById('initialization-log').hidden=false;document.getElementById('log-content').textContent=(job.logTail||[]).join('\\n');if(['PASS','FAIL','INTERRUPTED'].includes(job.status)){clearInterval(state.poll);state.poll=null;document.getElementById('run-initialization').disabled=false;if(job.status==='PASS'){load().then(check).catch(function(){});}}}
    async function pollJob(){if(!state.activeInitializationId)return;const result=await requestJson('/api/environment-initializations/'+encodeURIComponent(state.activeInitializationId));renderJob(result.initialization);}
    function setDeployControlsDisabled(disabled){document.getElementById('deploy-dry-run').disabled=disabled;document.getElementById('deploy-run').disabled=disabled;}
    function renderWizardBranches(){const select=document.getElementById('wizard-deploy-branch');if(!state.deployBranches.length){select.innerHTML='<option value="">无可部署分支</option>';select.disabled=true;return;}select.innerHTML=state.deployBranches.map(function(item){return '<option value="'+esc(item.branch)+'">'+esc(item.branch)+' @ '+esc(item.head)+'</option>';}).join('');select.disabled=false;}
    function renderDeployBranches(){const select=document.getElementById('deploy-branch');document.getElementById('reload-deploy-branches').disabled=false;renderWizardBranches();if(!state.deployBranches.length){select.innerHTML='<option value="">未发现可部署分支</option>';select.disabled=true;setDeployControlsDisabled(true);document.getElementById('deploy-status').textContent='Github/ 下没有可用的 fx100-contracts@<分支> 克隆（soso-test 已按裁决排除）；先用 fetch-branch 把目标分支落到工作区。';return;}select.innerHTML=state.deployBranches.map(function(item){return '<option value="'+esc(item.branch)+'">'+esc(item.branch)+' @ '+esc(item.head)+'</option>';}).join('');select.disabled=false;setDeployControlsDisabled(false);document.getElementById('deploy-status').textContent='已读取 '+state.deployBranches.length+' 个可部署分支（默认选中最新版本）。';}
    async function loadDeployBranches(){try{const result=await requestJson('/api/contract-deployments/branches');state.deployBranches=result.branches;renderDeployBranches();}catch(error){state.deployBranches=[];const select=document.getElementById('deploy-branch');select.innerHTML='<option value="">分支列表不可用</option>';select.disabled=true;setDeployControlsDisabled(true);renderWizardBranches();document.getElementById('reload-deploy-branches').disabled=false;document.getElementById('deploy-status').textContent='分支列表读取失败：'+error.message+'（若看板服务是旧进程，请停止后重新 npm run dashboard:serve）';}}
    function renderDeployJob(job){const prefix=(job.dryRun?'[dry-run] ':'')+job.environment+' · '+job.branch+' · ';document.getElementById('deploy-status').textContent=prefix+(job.message||('部署任务 '+job.status+'…'));document.getElementById('deploy-log').hidden=false;document.getElementById('deploy-log-content').textContent=(job.logTail||[]).join('\\n');if(job.status!=='running'){if(state.deployPoll){clearInterval(state.deployPoll);state.deployPoll=null;}setDeployControlsDisabled(false);if(job.status==='succeeded'&&!job.dryRun){document.getElementById('deploy-status').textContent=prefix+'部署成功。已自动登记 4 个落点：deployment manifest（config/deployments/）、.env.local 的 E2E_DEPLOYMENT_MANIFEST、Docs/contract-releases/CURRENT.json、参数快照（artifacts/parameter-cache/'+job.environment+'/）。下一步：④ 重新初始化 Mock Market Bundle（勾选“重新部署所选 Market Bundle”+“同时重建共享 USDC Oracle”）→ ⑤ 环境检查。';}if(job.status==='failed'){document.getElementById('deploy-status').textContent=prefix+'部署失败（退出码 '+(job.exitCode==null?'未知':job.exitCode)+'）：'+(job.message||'详见下方日志。');}}}
    async function pollDeployment(){if(!state.activeDeploymentId)return;const job=await requestJson('/api/contract-deployments/'+encodeURIComponent(state.activeDeploymentId));renderDeployJob(job);}
    async function startDeployment(dryRun){const select=document.getElementById('deploy-branch');const branch=select.value;if(!branch){document.getElementById('deploy-status').textContent='请先选择合约分支。';return;}
      if(!dryRun&&!window.confirm('将在当前环境 '+environment.value+' 的 fork 上全新部署分支 '+branch+'（Ignition 八模块 + configure 三脚本 + 角色授权 + 读回校验）。\\n\\n部署会改写 .env.local 的 E2E_DEPLOYMENT_MANIFEST 与 CURRENT.json 登记；部署完成后必须重新执行 ④ Mock Market Bundle 初始化才能跑用例。\\n\\n确认继续？'))return;
      setDeployControlsDisabled(true);document.getElementById('deploy-status').textContent=(dryRun?'[dry-run] ':'')+'正在创建部署任务…';
      try{const result=await requestJson('/api/contract-deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({environment:environment.value,branch:branch,dryRun:dryRun})});state.activeDeploymentId=result.jobId;renderDeployJob(result.job);if(state.deployPoll)clearInterval(state.deployPoll);state.deployPoll=setInterval(function(){pollDeployment().catch(function(error){document.getElementById('deploy-status').textContent='部署任务查询失败：'+error.message;});},2000);}
      catch(error){setDeployControlsDisabled(false);document.getElementById('deploy-status').textContent='部署任务创建失败：'+error.message;}}
    // ⓪ 一键搭建向导：POST /api/environment-setup 后 2s 轮询 /:id，逐行更新徽章与最近日志。
    // 步骤契约：steps.frontend={directory,port,options}（与 ⑥ 前端卡 start 同形）、steps.keeper={workers,options:{forkMode,clearCursors,clearQueues}}（与 ⑥ Keeper 卡 start 同形）；
    // 任务视图 job.steps[] 的 step 为 'frontend' | 'keeper'，{status,summary,logTail} 与其它步骤同形，前端成功 summary 含 http://127.0.0.1:<port>/trade。
    const wizardStepOrder=['createFork','deploy','init','check','frontend','keeper'];
    const wizardStepNames={createFork:'新建/重建 Fork',deploy:'部署合约',init:'初始化 Mock Bundle',check:'环境检查',frontend:'启动本地前端',keeper:'启动 Keeper'};
    const wizardBadgeText={pending:'待执行',running:'执行中…',succeeded:'成功',failed:'失败',skipped:'已跳过'};
    function wizardBadge(step,statusClass,text){const badge=document.getElementById('wizard-badge-'+step);if(!badge)return;badge.textContent=text||wizardBadgeText[statusClass]||statusClass;badge.className='status '+statusClass;}
    function wizardSetLog(step,lines){const log=document.getElementById('wizard-log-'+step);if(!log)return;if(!lines||!lines.length){log.hidden=true;log.textContent='';return;}log.hidden=false;log.textContent=lines.join('\\n');}
    function renderWizardJob(job){
      job.steps.forEach(function(item){
        wizardBadge(item.step,item.status);
        let lines=(item.logTail||[]).slice(-4);
        if(item.summary)lines=lines.concat(['▶ '+item.summary]);
        wizardSetLog(item.step,lines);
      });
      const statusNode=document.getElementById('wizard-status');
      if(job.status==='running'){statusNode.textContent='一键搭建执行中（'+job.environment+'）：'+job.steps.map(function(item){return wizardStepNames[item.step]+'['+ (wizardBadgeText[item.status]||item.status)+']';}).join(' → ');return;}
      if(state.wizardPoll){clearInterval(state.wizardPoll);state.wizardPoll=null;}
      document.getElementById('wizard-run').disabled=false;
      if(job.status==='succeeded'){
        const frontendStep=job.steps.find(function(item){return item.step==='frontend'&&item.status==='succeeded';});
        const tradeUrl=frontendStep?wizardTradeUrl(frontendStep.summary):null;
        statusNode.innerHTML='一键搭建完成：'+esc(job.environment)+' 勾选的 '+job.steps.length+' 步全部成功。下一步：到「测试运行」页跑用例，或在 ⑦ 造数据计划铺设交易数据。'+(tradeUrl?' 本地前端：<a href="'+esc(tradeUrl)+'" target="_blank" rel="noopener">'+esc(tradeUrl)+'</a>':'');
        // 成功后重读配置，并刷新 ⑥ 两张卡的实例列表 / Keeper 状态（前端 starting → listening 由卡片自己的轮询接力）。
        load().catch(function(){}).finally(function(){lsRefreshFrontendServices();lsRefreshKeeperStatus();});
      }else{
        const failedStep=job.steps.find(function(item){return item.status==='failed';});
        statusNode.textContent='一键搭建失败：步骤「'+(failedStep?wizardStepNames[failedStep.step]:'未知')+'」失败——'+(failedStep&&failedStep.summary?failedStep.summary:'详见该行日志')+'；后续步骤已跳过。修复后可重新执行向导，或到对应 section 单独重试该步。';
      }
    }
    async function pollWizard(){if(!state.activeWizardId)return;const job=await requestJson('/api/environment-setup/'+encodeURIComponent(state.activeWizardId));renderWizardJob(job);}
    async function startWizard(){
      const keeperPick=document.getElementById('wizard-pick-keeper');
      const picks={
        createFork:document.getElementById('wizard-pick-createFork').checked,
        deploy:document.getElementById('wizard-pick-deploy').checked,
        init:document.getElementById('wizard-pick-init').checked,
        check:document.getElementById('wizard-pick-check').checked,
        frontend:document.getElementById('wizard-pick-frontend').checked,
        keeper:keeperPick.checked&&!keeperPick.disabled,
      };
      const chosen=wizardStepOrder.filter(function(name){return picks[name];});
      if(!chosen.length){document.getElementById('wizard-status').textContent='请先勾选至少一个步骤。';return;}
      const steps={};
      if(picks.createFork)steps.createFork={};
      const wizardDryRun=document.getElementById('wizard-deploy-dry-run').checked;
      if(picks.deploy){const branch=document.getElementById('wizard-deploy-branch').value;if(!branch){document.getElementById('wizard-status').textContent='请先在「部署合约」行选择合约分支。';return;}steps.deploy={branch:branch,dryRun:wizardDryRun};}
      if(picks.init)steps.init={force:document.getElementById('wizard-init-force').checked,forceSharedCollateral:document.getElementById('wizard-init-force-shared').checked};
      if(picks.check)steps.check=true;
      // 前端 / Keeper 的参数取 ⑥ 两张卡的当前控件（与卡片自己的启动按钮同一套取值函数）；环境不取卡片的下拉，固定用页面当前环境。
      if(picks.frontend){const fe=wizardFrontendInput();if(!fe.directory){document.getElementById('wizard-status').textContent='请先在 ⑥ 前端卡选择前端分支（向导按该卡当前选择启动）。';return;}if(fe.port===null){document.getElementById('wizard-status').textContent='⑥ 前端卡的端口无效：'+fe.portError;return;}steps.frontend={directory:fe.directory,port:fe.port,options:fe.options};}
      if(picks.keeper){const workers=lsSelectedWorkers();if(!workers.length){document.getElementById('wizard-status').textContent='请先在 ⑥ Keeper 卡至少勾选一个 worker。';return;}steps.keeper={workers:workers,options:lsKeeperOptions()};}
      let message='将在环境 '+environment.value+' 按固定顺序自动执行：\\n'+chosen.map(function(name){return wizardStepNames[name]+(name==='deploy'&&wizardDryRun?'（dry-run）':'');}).join(' → ')+'。';
      if(picks.createFork)message+='\\n\\n注意：新建 Fork 会创建新的 Tenderly Virtual TestNet 并替换当前环境的 RPC 指向（.env.local 与 CURRENT.json 会被改写）。';
      if(picks.deploy&&!wizardDryRun)message+='\\n注意：部署会改写 E2E_DEPLOYMENT_MANIFEST 与 CURRENT.json 登记。';
      if(picks.frontend)message+='\\n本地前端：'+steps.frontend.directory+' · 端口 :'+steps.frontend.port+' · 数据源 '+steps.frontend.options.marketsDataSource+(steps.frontend.options.gateEnabled?'':' · 门禁关')+(steps.frontend.options.flashEnabled?' · Flash 开':'')+'（RPC 指向 '+environment.value+'）。';
      if(picks.keeper)message+='\\nKeeper：'+steps.keeper.workers.join(', ')+' · Fork 模式 '+(steps.keeper.options.forkMode?'开':'关')+' · Redis '+(steps.keeper.options.clearQueues?'清理本链 keeper:* 全部键（含队列；先备份到 artifacts/local-services/redis-backup/）':steps.keeper.options.clearCursors?'清理本链事件游标（先备份到 artifacts/local-services/redis-backup/）':'不清理')+'（车道 = '+environment.value+' 的 Chain ID）。';
      message+='\\n\\n确认执行？';
      if(!window.confirm(message))return;
      wizardStepOrder.forEach(function(name){wizardBadge(name,picks[name]?'pending':'',picks[name]?undefined:(name==='keeper'&&keeperPick.disabled?'不可用':'未勾选'));wizardSetLog(name,null);});
      document.getElementById('wizard-run').disabled=true;
      document.getElementById('wizard-status').textContent='正在创建一键搭建任务…';
      try{
        const result=await requestJson('/api/environment-setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({environment:environment.value,steps:steps})});
        state.activeWizardId=result.jobId;renderWizardJob(result.job);
        if(state.wizardPoll)clearInterval(state.wizardPoll);
        state.wizardPoll=setInterval(function(){pollWizard().catch(function(error){document.getElementById('wizard-status').textContent='向导任务查询失败：'+error.message;});},2000);
      }catch(error){document.getElementById('wizard-run').disabled=false;document.getElementById('wizard-status').textContent='一键搭建任务创建失败：'+error.message;}
    }
    document.getElementById('wizard-run').addEventListener('click',function(){startWizard().catch(function(error){document.getElementById('wizard-run').disabled=false;document.getElementById('wizard-status').textContent='一键搭建启动失败：'+error.message;});});
    // 「单独执行」先把对应模块展开（折叠着看不到状态行），再触发该模块自己的按钮。
    document.getElementById('wizard-solo-createFork').addEventListener('click',function(){revealSection('fork-panel');document.getElementById('create-tenderly-fork').click();});
    document.getElementById('wizard-solo-deploy').addEventListener('click',function(){revealSection('deploy-panel');const branch=document.getElementById('wizard-deploy-branch').value;if(branch)document.getElementById('deploy-branch').value=branch;startDeployment(document.getElementById('wizard-deploy-dry-run').checked);});
    document.getElementById('wizard-solo-init').addEventListener('click',function(){revealSection('initialization-panel');document.getElementById('force-init').checked=document.getElementById('wizard-init-force').checked;document.getElementById('force-shared-collateral').checked=document.getElementById('wizard-init-force-shared').checked;document.getElementById('run-initialization').click();});
    document.getElementById('wizard-solo-check').addEventListener('click',function(){revealSection('check-panel');document.getElementById('check').click();});
    // 前端 / Keeper 的「单独执行」= 触发 ⑥ 两张卡自己的启动按钮：先把卡片的目标环境对齐到页面当前环境（向导口径），再点。
    document.getElementById('wizard-solo-frontend').addEventListener('click',function(){revealSection('ls-panel');wizardAlignCardEnvironment('ls-fe-env');document.getElementById('ls-fe-start').click();});
    document.getElementById('wizard-solo-keeper').addEventListener('click',function(){revealSection('ls-panel');wizardAlignCardEnvironment('ls-kp-env');document.getElementById('ls-kp-start').click();});
    document.getElementById('reload').addEventListener('click',function(){load().catch(showError);});environment.addEventListener('change',function(){persistEnvironment(environment.value);syncEnvironmentTabs();load().catch(showError);});
    document.getElementById('save-config').addEventListener('click',function(){saveConfiguration().catch(showError);});document.getElementById('save-rpc').addEventListener('click',function(){saveConfiguration().catch(showError);});document.getElementById('save-profile').addEventListener('click',function(){saveProfile().catch(showError);});document.getElementById('check').addEventListener('click',function(){check().catch(showError);});document.getElementById('create-tenderly-fork').addEventListener('click',async function(){const button=this;const block=window.prompt('可选：钉死 Base Sepolia fork 区块号（十进制；留空 = latest）','');if(block===null){return;}button.disabled=true;document.getElementById('connection').textContent='正在创建 Tenderly Virtual TestNet（固定 Chain ID）…';try{const payload={environment:environment.value};if(block&&block.trim()){payload.blockNumber=block.trim();}const result=await requestJson('/api/tenderly-forks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});document.getElementById('connection').textContent='Virtual TestNet 已创建并回填：Chain ID '+result.fork.chainId+'（已校验）'+(result.fork.forkBlockNumber!==undefined?'，fork 块 '+result.fork.forkBlockNumber:'')+'，Tenderly env '+result.fork.environmentId+'；主 RPC / Admin RPC / WSS 已保存'+(result.fork.baselineRegistryUpdated?'，CURRENT.json 已登记':'')+'。下一步：按需 ② 部署合约，再 ④ 初始化 Mock Market Bundle。';await load();}catch(error){showError(error);}finally{button.disabled=false;}});
    document.getElementById('reload-market-sources').addEventListener('click',async function(){const button=this;button.disabled=true;document.getElementById('market-source-status').textContent='正在读取链上 Market 数据…';try{await loadMarketSources();}catch(error){state.marketSources=[];renderMarketSources();document.getElementById('market-source-status').textContent='Market 列表读取失败：'+error.message;}finally{button.disabled=false;}});
    document.getElementById('copy-market-source').addEventListener('click',function(){copyMarketSource().catch(showError);});
    document.getElementById('reload-deploy-branches').addEventListener('click',function(){const button=this;button.disabled=true;document.getElementById('deploy-status').textContent='正在读取分支列表…';loadDeployBranches();});
    document.getElementById('deploy-dry-run').addEventListener('click',function(){startDeployment(true);});
    document.getElementById('deploy-run').addEventListener('click',function(){startDeployment(false);});
    document.getElementById('run-initialization').addEventListener('click',async function(){const button=this;const bundleAlias=document.getElementById('bundle-alias').value.trim();if(!/^[a-z0-9][a-z0-9-]{0,47}$/.test(bundleAlias)){showError(new Error('Market Bundle 别名只允许小写字母、数字和连字符，长度 1–48。'));return;}button.disabled=true;try{await saveConfiguration();await saveProfile();const result=await requestJson('/api/environment-initializations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({environment:environment.value,bundleAlias:bundleAlias,force:document.getElementById('force-init').checked,forceSharedCollateral:document.getElementById('force-shared-collateral').checked,reuseRpcForAdmin:false})});state.activeInitializationId=result.initialization.id;renderJob(result.initialization);state.poll=setInterval(function(){pollJob().catch(showError);},1500);}catch(error){button.disabled=false;showError(error);}});
    function showError(error){document.getElementById('connection').textContent='操作失败：'+error.message;document.getElementById('initialization-status').textContent='操作失败：'+error.message;}
    window.addEventListener('message',function(event){if(event.origin!==location.origin||!event.data||event.data.type!=='fx100-noise-height')return;const frame=document.getElementById('noise-plan-frame');if(event.source===frame.contentWindow){frame.style.height=Math.max(900,Number(event.data.height)||900)+'px';}});
    // ⑥ 本地服务：前端 + Keeper。接口 /api/local-services/*；404/405 或网络错误一律视作看板服务旧进程（不弹 alert，只写各卡片状态行）。
    const lsEnvironmentNames=environmentNames.filter(function(name){return name!=='dev-readonly';});
    const LS_STALE_NOTICE='看板服务是旧进程或未启用本地服务接口，请停止后重新 npm run dashboard:serve';
    const lsWorkerLabels={'producer':'事件监听 · 填队列','ord-worker':'订单执行 · ORDER_KEEPER','liq-worker':'清算 · LIQUIDATION_KEEPER','adl-worker':'ADL · ADL_KEEPER','rel-worker':'Relay 代发 · Express/Flash'};
    const lsKeeperActionLabels={check:'体检',start:'启动',status:'状态读取',stop:'停止本车道','clear-cursors':'清理游标'};
    const lsState={initialized:false,kpDefaultsApplied:false,branches:[],branchesLoaded:false,feServices:[],feLogs:{},feOpenLogs:{},fePoll:null,feRefreshing:false,fePrecheck:null,prunedShown:{},kpStatus:null,kpChainSupport:null,kpOpenLogs:{}};
    async function lsRequest(url,options){let response;try{response=await fetch(url,options);}catch(error){throw new Error(LS_STALE_NOTICE);}let result=null;try{result=await response.json();}catch(error){result=null;}const detail=result&&(result.detail||result.error);if(response.status===404||response.status===405){if(!detail||detail==='Not Found'||detail==='Method Not Allowed')throw new Error(LS_STALE_NOTICE);throw new Error(String(detail));}if(!response.ok)throw new Error(detail?String(detail):('接口返回 '+response.status));return result||{};}
    function lsFrontendStatusLine(text){document.getElementById('ls-fe-status').textContent=text;}
    function lsKeeperStatusLine(text){document.getElementById('ls-kp-status-line').textContent=text;}
    function lsShortHead(head){return String(head==null?'':head).slice(0,12);}
    function lsFormatUptime(seconds){seconds=Math.max(0,Math.floor(Number(seconds)||0));if(seconds<60)return seconds+' 秒';if(seconds<3600)return Math.floor(seconds/60)+' 分 '+(seconds%60)+' 秒';return Math.floor(seconds/3600)+' 时 '+Math.floor(seconds%3600/60)+' 分';}
    function lsFormatTime(value){if(value==null||value==='')return '—';const date=new Date(value);return isNaN(date.getTime())?String(value):date.toLocaleString('zh-CN',{hour12:false});}
    function lsJoin(value){if(Array.isArray(value))return value.length?value.join(', '):'无';return value==null?'—':String(value);}
    function lsSetFrontendBusy(busy){['ls-fe-precheck','ls-fe-start','ls-fe-refresh'].forEach(function(id){document.getElementById(id).disabled=busy;});document.querySelectorAll('#ls-fe-services button').forEach(function(button){button.disabled=busy;});}
    function lsSetKeeperBusy(busy){['ls-kp-check','ls-kp-start','ls-kp-status','ls-kp-stop'].forEach(function(id){document.getElementById(id).disabled=busy;});}
    function lsSetStaticMode(){['ls-fe-branch','ls-fe-env','ls-fe-port','ls-fe-precheck','ls-fe-start','ls-fe-refresh','ls-kp-env','ls-kp-check','ls-kp-start','ls-kp-status','ls-kp-stop'].forEach(function(id){document.getElementById(id).disabled=true;});document.getElementById('ls-fe-branch').innerHTML='<option value="">静态模式不可用（需 dashboard:serve）</option>';const text='静态模式不可用：本地前端 / Keeper 的启停需经 npm run dashboard:serve 打开本页（按钮已禁用）。';lsFrontendStatusLine(text);lsKeeperStatusLine(text);}
    // —— 本地前端 ——
    function lsRenderBranchHint(){const select=document.getElementById('ls-fe-branch'),hint=document.getElementById('ls-fe-branch-hint');const item=lsState.branches.find(function(entry){return entry.directory===select.value;});const text=item?[item.path?'路径 '+item.path:'',item.installStale?('依赖可能过期'+(item.installHint?'：'+item.installHint:'')):'',item.patch==='MIXED'?'fork 补丁状态 MIXED：部分文件已打补丁，启动前先核对':''].filter(Boolean).join(' · '):'';hint.textContent=text;hint.hidden=!text;}
    async function lsLoadFrontendBranches(){const select=document.getElementById('ls-fe-branch');try{const result=await lsRequest('/api/local-services/frontend/branches');lsState.branches=result.branches||[];if(!lsState.branches.length){select.innerHTML='<option value="">Github/ 下没有 fx100-apps@* 克隆或 worktree</option>';select.disabled=true;lsRenderBranchHint();return;}select.innerHTML=lsState.branches.map(function(item){return '<option value="'+esc(item.directory)+'">'+esc(item.directory)+' · '+esc(item.branch)+' @ '+esc(lsShortHead(item.head))+' · 补丁 '+esc(item.patch||'UNKNOWN')+(item.installStale?' · 依赖可能过期':'')+'</option>';}).join('');select.disabled=false;lsRenderBranchHint();}catch(error){lsState.branchesLoaded=false;select.innerHTML='<option value="">分支列表不可用</option>';select.disabled=true;lsRenderBranchHint();lsFrontendStatusLine('前端分支列表读取失败：'+error.message);}}
    function lsPrecheckKey(env,directory,port){return env+'|'+directory+'|'+port;}
    function lsInvalidatePrecheck(){lsState.fePrecheck=null;document.getElementById('ls-fe-precheck-results').hidden=true;}
    function lsParsePort(raw){raw=String(raw==null?'':raw).trim();const port=Number(raw);if(!/^[0-9]+$/.test(raw)||port<1024||port>65535)return {port:null,error:'端口须是 1024–65535 的整数。'};if(port===3010)return {port:null,error:'3010 留给常驻 fx100-frontend-local，请改用其它端口。'};return {port:port,error:null};}
    function lsReadPort(){const parsed=lsParsePort(document.getElementById('ls-fe-port').value);if(parsed.error){lsFrontendStatusLine(parsed.error);return null;}return parsed.port;}
    function lsCopyFallback(text,done){const area=document.createElement('textarea');area.value=text;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();let ok=false;try{ok=document.execCommand('copy');}catch(error){ok=false;}document.body.removeChild(area);if(!ok){const code=document.getElementById('ls-fe-rpc');if(code){const range=document.createRange();range.selectNodeContents(code);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);}}done(ok);}
    function lsCopyText(text,stateNode){function done(ok){stateNode.textContent=ok?'已复制':'复制失败：已选中 RPC 文本，请按 ⌘C / Ctrl+C';}if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){done(true);},function(){lsCopyFallback(text,done);});return;}lsCopyFallback(text,done);}
    function lsRenderPrecheck(result){
      const node=document.getElementById('ls-fe-precheck-results');const heads=result.heads||{};const fork=heads.fork,base=heads.baseSepolia;const rpc=result.rpcUrl||result.rpcMasked||'';
      node.hidden=false;
      node.innerHTML='<div class="check-grid ls-check-grid">'+(result.checks||[]).map(function(item){return '<article class="check-result '+esc(item.status)+'"><strong>'+esc(item.name)+' · '+esc(item.status)+'</strong><small>'+esc(item.detail)+'</small></article>';}).join('')+'</div>'
        +'<div class="ls-info"><div class="ls-rpc-line"><strong>RPC 全文（钱包网络 / 前端 .env 用）</strong><button type="button" class="secondary ls-mini" id="ls-fe-copy-rpc">复制</button><span id="ls-fe-copy-state" class="muted"></span></div><code id="ls-fe-rpc">'+esc(rpc||'（接口未返回 RPC）')+'</code>'
        +'<div>环境 <strong>'+esc(result.environment)+'</strong> · Chain ID <code>'+esc(result.chainId)+'</code></div>'
        +'<div>'+(fork?'Fork 块高 <strong>'+esc(fork.blockNumber)+'</strong>（延迟 '+esc(fork.latencyMs)+' ms，eth_chainId '+esc(fork.chainId)+'）':'Fork RPC <strong>不可达</strong>')+' vs '+(base?'Base Sepolia 真链块高 <strong>'+esc(base.blockNumber)+'</strong>（延迟 '+esc(base.latencyMs)+' ms）':'Base Sepolia 真链 <strong>不可达</strong>')+'</div>'
        +(result.identifyHint?'<div class="muted">识别提示：'+esc(result.identifyHint)+'</div>':'')+'</div>';
      document.getElementById('ls-fe-copy-rpc').addEventListener('click',function(){lsCopyText(rpc,document.getElementById('ls-fe-copy-state'));});
    }
    async function lsRunFrontendPrecheck(env,directory,port){const query='environment='+encodeURIComponent(env)+'&directory='+encodeURIComponent(directory)+'&port='+encodeURIComponent(port);const result=await lsRequest('/api/local-services/frontend/precheck?'+query);lsState.fePrecheck={key:lsPrecheckKey(env,directory,port),data:result};lsRenderPrecheck(result);return result;}
    function lsPrecheckSummary(result){const counts={PASS:0,WARN:0,FAIL:0};(result.checks||[]).forEach(function(item){counts[item.status]=(counts[item.status]||0)+1;});return 'PASS '+counts.PASS+' · WARN '+counts.WARN+' · FAIL '+counts.FAIL;}
    async function lsPrecheckFrontend(){const directory=document.getElementById('ls-fe-branch').value,env=document.getElementById('ls-fe-env').value,port=lsReadPort();if(!directory){lsFrontendStatusLine('请先选择前端分支。');return;}if(port===null)return;lsSetFrontendBusy(true);lsFrontendStatusLine('前置检查中（'+env+' · :'+port+'）…');try{const result=await lsRunFrontendPrecheck(env,directory,port);lsFrontendStatusLine('前置检查完成：'+lsPrecheckSummary(result)+'。');}catch(error){lsFrontendStatusLine('前置检查失败：'+error.message);}finally{lsSetFrontendBusy(false);}}
    function lsFrontendOptions(){return {marketsDataSource:document.getElementById('ls-fe-data-source').value,gateEnabled:!document.getElementById('ls-fe-gate-off').checked,flashEnabled:document.getElementById('ls-fe-flash').checked,priceFeedApiUrl:document.getElementById('ls-fe-price-api').value.trim(),apiUrl:document.getElementById('ls-fe-api-url').value.trim(),chainlinkFromKeeperEnv:document.getElementById('ls-fe-chainlink').checked};}
    async function lsStartFrontend(){
      const directory=document.getElementById('ls-fe-branch').value,env=document.getElementById('ls-fe-env').value,port=lsReadPort();
      if(!directory){lsFrontendStatusLine('请先选择前端分支。');return;}
      if(port===null)return;
      lsSetFrontendBusy(true);
      try{
        // 没做过（或参数已变）的前置检查先补做一次，FAIL 项列进确认框，仍允许强行启动。
        const key=lsPrecheckKey(env,directory,port);
        if(!lsState.fePrecheck||lsState.fePrecheck.key!==key){lsFrontendStatusLine('启动前先做前置检查（'+env+' · :'+port+'）…');await lsRunFrontendPrecheck(env,directory,port);}
        const fails=(lsState.fePrecheck.data.checks||[]).filter(function(item){return item.status==='FAIL';});
        if(fails.length&&!window.confirm('前置检查有 '+fails.length+' 项 FAIL：\\n'+fails.map(function(item){return '· '+item.name+'：'+item.detail;}).join('\\n')+'\\n\\n仍要启动前端？')){lsFrontendStatusLine('已取消启动（前置检查 '+lsPrecheckSummary(lsState.fePrecheck.data)+'）。');return;}
        lsFrontendStatusLine('正在启动前端：'+directory+' → '+env+' · :'+port+'…');
        const result=await lsRequest('/api/local-services/frontend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'start',environment:env,directory:directory,port:port,options:lsFrontendOptions()})});
        const service=result.service||{};
        lsFrontendStatusLine('前端已登记启动：'+(service.id||'')+' · 端口 '+(service.port||port)+' · 状态 '+(service.status||'starting')+'；变为 listening 后可「打开 /trade」。');
        await lsRefreshFrontendServices();
      }catch(error){lsFrontendStatusLine('启动失败：'+error.message);}
      finally{lsSetFrontendBusy(false);}
    }
    function lsNotePruned(pruned){const fresh=pruned.filter(function(item){return item&&item.id&&!lsState.prunedShown[item.id];});if(!fresh.length)return;fresh.forEach(function(item){lsState.prunedShown[item.id]=true;});const node=document.getElementById('ls-fe-pruned');node.hidden=false;node.textContent='上次未正常停止的登记已清理: '+fresh.map(function(item){return item.label||item.id;}).join('、');}
    function lsRenderFrontendServices(){
      const wrap=document.getElementById('ls-fe-services');const services=lsState.feServices;
      if(!services.length){wrap.innerHTML='<p class="muted">当前没有登记的本地前端实例。</p>';return;}
      wrap.innerHTML='<table><thead><tr><th>端口</th><th>分支</th><th>环境</th><th>状态</th><th>PID</th><th>启动时间</th><th>运行时长</th><th>操作</th></tr></thead><tbody>'+services.map(function(service){
        const statusClass={starting:'running',listening:'succeeded',exited:'failed'}[service.status]||'pending';const open=!!lsState.feOpenLogs[service.id];
        let row='<tr><td><strong>'+esc(service.port)+'</strong></td><td>'+esc(service.directory)+'<br><small class="muted">'+esc(service.branch)+' @ '+esc(lsShortHead(service.head))+'</small></td><td>'+esc(service.environment)+'<br><small class="muted">Chain '+esc(service.chainId)+'</small></td><td><span class="status '+statusClass+'">'+esc(service.status)+'</span></td><td>'+esc(service.pid==null?'—':service.pid)+'</td><td>'+esc(lsFormatTime(service.startedAt))+'</td><td>'+esc(lsFormatUptime(service.uptimeSeconds))+'</td><td class="ls-row-actions">'
          +(service.status==='listening'?'<a href="http://127.0.0.1:'+esc(service.port)+'/trade" target="_blank" rel="noopener">打开 /trade</a>':'')
          +'<button type="button" class="secondary ls-mini" data-ls-fe-log="'+esc(service.id)+'">'+(open?'收起日志':'日志')+'</button>'
          +'<button type="button" class="secondary ls-mini" data-ls-fe-stop="'+esc(service.id)+'">停止</button></td></tr>';
        if(open)row+='<tr class="ls-log-row"><td colspan="8"><pre>'+esc((lsState.feLogs[service.id]||service.logTail||[]).join('\\n')||'（日志为空）')+'</pre><small class="muted">'+esc(service.logPath||'')+(service.command?' · '+esc(service.command):'')+'</small></td></tr>';
        return row;}).join('')+'</tbody></table>';
    }
    function lsSyncFrontendPoll(){const needed=lsState.feServices.some(function(service){return service.status==='starting';});if(needed&&!lsState.fePoll){lsState.fePoll=setInterval(function(){lsRefreshFrontendServices();},4000);}if(!needed&&lsState.fePoll){clearInterval(lsState.fePoll);lsState.fePoll=null;}}
    async function lsFetchFrontendLog(id){const result=await lsRequest('/api/local-services/frontend/'+encodeURIComponent(id)+'/log?lines=300');lsState.feLogs[id]=result.lines||[];}
    async function lsRefreshFrontendServices(){
      if(lsState.feRefreshing)return;lsState.feRefreshing=true;
      try{
        const result=await lsRequest('/api/local-services/frontend');
        lsState.feServices=result.services||[];
        const openIds=lsState.feServices.filter(function(service){return lsState.feOpenLogs[service.id];}).map(function(service){return service.id;});
        await Promise.all(openIds.map(function(id){return lsFetchFrontendLog(id).catch(function(){});}));
        lsRenderFrontendServices();lsNotePruned(result.pruned||[]);
      }catch(error){lsState.feServices=[];document.getElementById('ls-fe-services').innerHTML='<p class="muted">实例列表不可用：'+esc(error.message)+'</p>';lsFrontendStatusLine('前端实例列表读取失败：'+error.message);}
      finally{lsState.feRefreshing=false;lsSyncFrontendPoll();}
    }
    async function lsToggleFrontendLog(id){if(lsState.feOpenLogs[id]){lsState.feOpenLogs[id]=false;lsRenderFrontendServices();return;}lsState.feOpenLogs[id]=true;try{await lsFetchFrontendLog(id);}catch(error){lsState.feLogs[id]=['日志读取失败：'+error.message];}lsRenderFrontendServices();}
    async function lsStopFrontend(id){lsSetFrontendBusy(true);lsFrontendStatusLine('正在停止 '+id+'…');try{const result=await lsRequest('/api/local-services/frontend',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'stop',id:id})});const detail=result.result||{};lsFrontendStatusLine('已停止 '+(result.id||id)+'：signaled '+lsJoin(detail.signaled)+' · remaining '+lsJoin(detail.remaining)+'。');delete lsState.feOpenLogs[id];await lsRefreshFrontendServices();}catch(error){lsFrontendStatusLine('停止失败：'+error.message);}finally{lsSetFrontendBusy(false);}}
    // —— 本地 Keeper ——
    function lsSyncProducer(){const producer=document.getElementById('ls-kp-w-producer');const implied=['ls-kp-w-ord','ls-kp-w-liq','ls-kp-w-adl'].some(function(id){return document.getElementById(id).checked;});if(implied){producer.checked=true;producer.disabled=true;}else{producer.disabled=false;}}
    function lsSelectedWorkers(){return Array.from(document.querySelectorAll('#ls-kp-card [data-worker]')).filter(function(input){return input.checked;}).map(function(input){return input.dataset.worker;});}
    function lsApplyKeeperDefaults(env){const fork=env!=='base-sepolia';document.getElementById('ls-kp-fork-mode').checked=fork;document.getElementById('ls-kp-clear-cursors').checked=fork;document.getElementById('ls-kp-clear-queues').checked=false;}
    function lsKeeperOptions(){return {forkMode:document.getElementById('ls-kp-fork-mode').checked,clearCursors:document.getElementById('ls-kp-clear-cursors').checked,clearQueues:document.getElementById('ls-kp-clear-queues').checked};}
    function lsRenderKeeperStatus(status){
      const node=document.getElementById('ls-kp-state');
      if(!status){node.innerHTML='<p class="muted">尚未读取 Keeper 状态。</p>';return;}
      const lane=status.lane||{},redis=status.redis||{},cursors=redis.cursorKeys||[],processes=status.processes||[];
      let html='<dl class="ls-kv"><dt>车道</dt><dd>Chain ID <code>'+esc(lane.chainId==null?'—':lane.chainId)+'</code> · 日志目录 <code>'+esc(lane.logDir||'—')+'</code></dd><dt>DataStore</dt><dd><code>'+esc(status.dataStore||'—')+'</code></dd><dt>RPC</dt><dd><code>'+esc(status.rpcMasked||'—')+'</code></dd><dt>Redis</dt><dd><span class="status '+(redis.reachable?'PASS':'FAIL')+'">'+(redis.reachable?'可达':'不可达')+'</span> 前缀 <code>'+esc(redis.keyspacePrefix||'—')+'</code> · 键数 '+esc(redis.keyCount==null?'—':redis.keyCount)+'</dd></dl>';
      html+='<div class="table-wrap"><table><thead><tr><th>游标键</th><th>类型</th><th>值</th></tr></thead><tbody>'+(cursors.length?cursors.map(function(item){return '<tr><td><code>'+esc(item.key)+'</code></td><td>'+esc(item.type)+'</td><td><code>'+esc(item.value)+'</code></td></tr>';}).join(''):'<tr><td colspan="3" class="muted">本链没有事件游标键</td></tr>')+'</tbody></table></div>';
      html+='<div class="table-wrap"><table><thead><tr><th>进程</th><th>PID</th><th>存活</th><th>日志</th></tr></thead><tbody>'+(processes.length?processes.map(function(proc){const open=!!lsState.kpOpenLogs[proc.name];return '<tr><td><strong>'+esc(proc.name)+'</strong><br><small class="muted">'+esc(lsWorkerLabels[proc.name]||'')+'</small></td><td>'+esc(proc.pid==null?'—':proc.pid)+'</td><td><span class="status '+(proc.alive?'succeeded':'failed')+'">'+(proc.alive?'alive':'dead')+'</span></td><td><button type="button" class="secondary ls-mini" data-ls-kp-log="'+esc(proc.name)+'">'+(open?'收起':'日志')+'</button></td></tr>'+(open?'<tr class="ls-log-row"><td colspan="4"><pre>'+esc((proc.logTail||[]).join('\\n')||'（日志为空）')+'</pre><small class="muted">'+esc(proc.logPath||'')+'</small></td></tr>':'');}).join(''):'<tr><td colspan="4" class="muted">本车道没有登记的 Keeper 进程</td></tr>')+'</tbody></table></div>';
      if(status.entrypoints&&status.entrypoints.length)html+='<details class="ls-muted-details"><summary>入口脚本（'+status.entrypoints.length+'）</summary><ul class="muted">'+status.entrypoints.map(function(item){return '<li><code>'+esc(item)+'</code></li>';}).join('')+'</ul></details>';
      if(status.registry&&status.registry.length)html+='<details class="ls-muted-details"><summary>进程登记（'+status.registry.length+'）</summary><pre>'+esc(JSON.stringify(status.registry,null,1))+'</pre></details>';
      if(status.warnings&&status.warnings.length)html+='<ul class="ls-warnings">'+status.warnings.map(function(item){return '<li>'+esc(item)+'</li>';}).join('')+'</ul>';
      node.innerHTML=html;
    }
    // 状态里的 chainSupported（keeper 地址表是否认本链）同时暴露到 lsState.kpChainSupport 供 ⓪ 向导用：false 时向导的「启动 Keeper」行禁用。
    async function lsRefreshKeeperStatus(){const env=document.getElementById('ls-kp-env').value;try{const result=await lsRequest('/api/local-services/keeper?environment='+encodeURIComponent(env));if(document.getElementById('ls-kp-env').value!==env)return;lsState.kpStatus=result;lsState.kpChainSupport={environment:result.environment||env,chainId:result.chainId,supported:result.chainSupported!==false,warnings:result.warnings||[]};lsRenderKeeperStatus(result);}catch(error){if(document.getElementById('ls-kp-env').value!==env)return;lsState.kpStatus=null;lsState.kpChainSupport=null;document.getElementById('ls-kp-state').innerHTML='<p class="muted">Keeper 状态不可用：'+esc(error.message)+'</p>';lsKeeperStatusLine('Keeper 状态读取失败：'+error.message);}wizardRenderServiceSummaries();}
    function lsRenderKeeperResult(result,action,env){
      const label=lsKeeperActionLabels[action]||action;
      lsKeeperStatusLine(label+(result.ok===false?' 失败':' 完成')+'：'+(result.environment||env)+' · Chain ID '+(result.chainId==null?'?':result.chainId)+'。');
      const parts=[];
      if(result.started&&result.started.length)parts.push('已启动 '+result.started.map(function(item){return item.name+'(pid '+item.pid+')';}).join('、'));
      if(result.stopped)parts.push('已停止：signaled '+lsJoin(result.stopped.signaled)+' · remaining '+lsJoin(result.stopped.remaining));
      if(result.backups&&result.backups.length)parts.push('Redis 备份 '+result.backups.length+' 份：'+result.backups.join('、'));
      if(result.cleared&&result.cleared.length)parts.push('已清理 '+result.cleared.length+' 个键');
      const summary=document.getElementById('ls-kp-summary');summary.hidden=!parts.length;summary.textContent=parts.join('；');
      const warnings=document.getElementById('ls-kp-warnings'),list=result.warnings||[];warnings.hidden=!list.length;warnings.innerHTML=list.map(function(item){return '<li>'+esc(item)+'</li>';}).join('');
      const wrap=document.getElementById('ls-kp-output-wrap'),output=Array.isArray(result.output)?result.output.join('\\n'):String(result.output==null?'':result.output);
      document.getElementById('ls-kp-command').textContent=result.command?String(result.command):'';
      document.getElementById('ls-kp-output').textContent=output||'（无输出）';
      wrap.hidden=false;wrap.open=true;
    }
    async function lsKeeperAction(action){
      const env=document.getElementById('ls-kp-env').value,workers=lsSelectedWorkers(),options=lsKeeperOptions();
      if(action==='start'){
        if(!workers.length){lsKeeperStatusLine('请至少勾选一个 worker。');return;}
        const chainId=(lsState.kpStatus&&lsState.kpStatus.environment===env&&lsState.kpStatus.chainId!=null)?lsState.kpStatus.chainId:(fixedChainIds[env]||'?');
        let message='将在环境 '+env+'（Chain ID '+chainId+'）启动 Keeper：'+workers.join(', ')+'。\\n\\nFork 模式（关闭全量扫描 + 事件缓存）：'+(options.forkMode?'开':'关')+'\\nRedis：'+(options.clearQueues?'清理本链 keeper:* 全部键（含队列；先备份到 artifacts/local-services/redis-backup/）':options.clearCursors?'清理本链事件游标（先备份到 artifacts/local-services/redis-backup/）':'不清理');
        if(env==='base-sepolia')message+='\\n\\n注意：base-sepolia 是真链，Keeper 会执行真实订单 / 清算。';
        message+='\\n\\n确认启动？';
        if(!window.confirm(message))return;
      }
      const label=lsKeeperActionLabels[action]||action;
      lsSetKeeperBusy(true);lsKeeperStatusLine(label+' 执行中（'+env+'）…');
      try{const response=await lsRequest('/api/local-services/keeper',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:action,environment:env,workers:workers,options:options})});lsRenderKeeperResult(response.result||{},action,env);}
      catch(error){lsKeeperStatusLine(label+' 失败：'+error.message);}
      finally{lsSetKeeperBusy(false);}
      await lsRefreshKeeperStatus();
    }
    function lsBindLocalServices(){
      document.getElementById('ls-fe-precheck').addEventListener('click',function(){lsPrecheckFrontend();});
      document.getElementById('ls-fe-start').addEventListener('click',function(){lsStartFrontend();});
      document.getElementById('ls-fe-refresh').addEventListener('click',function(){lsRefreshFrontendServices();});
      document.getElementById('ls-fe-branch').addEventListener('change',function(){lsInvalidatePrecheck();lsRenderBranchHint();});
      document.getElementById('ls-fe-env').addEventListener('change',lsInvalidatePrecheck);
      document.getElementById('ls-fe-port').addEventListener('input',lsInvalidatePrecheck);
      document.getElementById('ls-fe-services').addEventListener('click',function(event){const target=event.target.closest('button');if(!target)return;if(target.dataset.lsFeLog)lsToggleFrontendLog(target.dataset.lsFeLog);else if(target.dataset.lsFeStop)lsStopFrontend(target.dataset.lsFeStop);});
      ['ls-kp-w-ord','ls-kp-w-liq','ls-kp-w-adl'].forEach(function(id){document.getElementById(id).addEventListener('change',lsSyncProducer);});
      document.getElementById('ls-kp-env').addEventListener('change',function(){lsApplyKeeperDefaults(this.value);lsState.kpStatus=null;lsRefreshKeeperStatus();});
      document.getElementById('ls-kp-check').addEventListener('click',function(){lsKeeperAction('check');});
      document.getElementById('ls-kp-start').addEventListener('click',function(){lsKeeperAction('start');});
      document.getElementById('ls-kp-status').addEventListener('click',function(){lsKeeperAction('status');});
      document.getElementById('ls-kp-stop').addEventListener('click',function(){lsKeeperAction('stop');});
      document.getElementById('ls-kp-state').addEventListener('click',function(event){const target=event.target.closest('button');if(!target||!target.dataset.lsKpLog)return;const name=target.dataset.lsKpLog;lsState.kpOpenLogs[name]=!lsState.kpOpenLogs[name];lsRenderKeeperStatus(lsState.kpStatus);});
      // ⑥ 任一控件变化 → 同步 ⓪ 向导两行的实时摘要（change / input 冒泡到面板，一个委托监听即可，且在各控件自己的处理之后执行）。
      document.getElementById('ls-panel').addEventListener('change',function(){wizardRenderServiceSummaries();});
      document.getElementById('ls-panel').addEventListener('input',function(){wizardRenderServiceSummaries();});
      lsSyncProducer();
    }
    // load() 每次（初次 / 切环境 / 重新读取）调用：两张卡的目标环境跟随页面环境（dev-readonly 不在选项内则回落 tx-fork），清掉前端轮询后刷新实例与 Keeper 状态。
    function renderLocalServicesEnvironment(){
      const feEnv=document.getElementById('ls-fe-env'),kpEnv=document.getElementById('ls-kp-env');
      if(!lsState.initialized){lsState.initialized=true;const options=lsEnvironmentNames.map(function(name){return '<option value="'+name+'">'+name+'</option>';}).join('');feEnv.innerHTML=options;kpEnv.innerHTML=options;lsBindLocalServices();}
      if(!['http:','https:'].includes(location.protocol)){lsSetStaticMode();wizardRenderServiceSummaries();return;}
      const target=lsEnvironmentNames.includes(environment.value)?environment.value:lsEnvironmentNames[0];
      if(feEnv.value!==target){feEnv.value=target;lsInvalidatePrecheck();}
      if(kpEnv.value!==target||!lsState.kpDefaultsApplied){lsState.kpDefaultsApplied=true;kpEnv.value=target;lsApplyKeeperDefaults(target);lsState.kpStatus=null;lsState.kpChainSupport=null;}
      if(lsState.fePoll){clearInterval(lsState.fePoll);lsState.fePoll=null;}
      if(!lsState.branchesLoaded){lsState.branchesLoaded=true;lsLoadFrontendBranches().then(function(){wizardRenderServiceSummaries();});}
      lsRefreshFrontendServices();lsRefreshKeeperStatus();
      wizardRenderServiceSummaries();
    }
    // ⓪ 向导「启动本地前端 / 启动 Keeper」两行：参数与实时摘要都取自 ⑥ 两张卡的当前控件（同一套取值函数），环境固定为页面当前环境。
    function wizardFrontendInput(){const parsed=lsParsePort(document.getElementById('ls-fe-port').value);return {directory:document.getElementById('ls-fe-branch').value,port:parsed.port,portError:parsed.error,options:lsFrontendOptions()};}
    function wizardGotoLink(target,text){return '<a href="#'+target+'" class="wizard-goto" data-goto="'+target+'">'+(text||'去 ⑥ 调整')+'</a>';}
    function wizardEnvNote(cardEnv){return cardEnv&&cardEnv!==environment.value?'<span class="wizard-env-note">⑥ 卡选的是 '+esc(cardEnv)+'，将按当前页面环境 '+esc(environment.value)+' 启动</span>':'';}
    function wizardKeeperUnavailableReason(){const support=lsState.kpChainSupport;if(!support||support.environment!==environment.value||support.supported)return null;return 'keeper 代码只认 Chain ID 8453 / 84532 / 99917 / 99918，本环境（'+environment.value+' · Chain '+support.chainId+'）不可用';}
    function wizardAlignCardEnvironment(selectId){const select=document.getElementById(selectId);if(!lsEnvironmentNames.includes(environment.value)||select.value===environment.value)return;select.value=environment.value;select.dispatchEvent(new Event('change'));}
    function wizardTradeUrl(summary){const match=new RegExp('https?://[^ "<>）)]+/trade').exec(String(summary==null?'':summary));return match?match[0]:null;}
    function wizardRenderServiceSummaries(){
      const feNode=document.getElementById('wizard-summary-frontend'),kpNode=document.getElementById('wizard-summary-keeper');
      const fe=wizardFrontendInput(),feParts=[];
      feParts.push(fe.directory?'分支 <code>'+esc(fe.directory)+'</code>':'<span class="wizard-warn">⑥ 前端卡尚未选择分支</span>');
      feParts.push(fe.port===null?'<span class="wizard-warn">端口无效（'+esc(fe.portError)+'）</span>':':'+esc(fe.port));
      feParts.push('数据源 '+esc(fe.options.marketsDataSource));
      if(!fe.options.gateEnabled)feParts.push('门禁关');
      if(fe.options.flashEnabled)feParts.push('Flash 开');
      feParts.push('RPC → '+esc(environment.value));
      feNode.innerHTML='<span>'+feParts.join(' · ')+'</span>'+wizardEnvNote(document.getElementById('ls-fe-env').value)+wizardGotoLink('ls-fe-card');
      const pick=document.getElementById('wizard-pick-keeper'),row=document.getElementById('wizard-step-keeper'),reason=wizardKeeperUnavailableReason();
      if(reason){pick.checked=false;pick.disabled=true;row.classList.add('is-unavailable');kpNode.innerHTML='<span class="wizard-warn">'+esc(reason)+'，向导已禁用此步</span>'+wizardGotoLink('ls-kp-card','去 ⑥ 查看');return;}
      pick.disabled=false;row.classList.remove('is-unavailable');
      const workers=lsSelectedWorkers(),options=lsKeeperOptions(),support=lsState.kpChainSupport,kpParts=[];
      kpParts.push(workers.length?'worker '+esc(workers.join(', ')):'<span class="wizard-warn">⑥ Keeper 卡未勾选任何 worker</span>');
      kpParts.push('Fork 模式 '+(options.forkMode?'开':'关'));
      kpParts.push(options.clearQueues?'Redis 连队列一起清（keeper:* 全部，先备份）':options.clearCursors?'清游标 开（先备份）':'不清 Redis');
      kpParts.push('车道 → '+esc(environment.value));
      if(!support||support.environment!==environment.value)kpParts.push('Chain 支持情况待 ⑥ 读取 Keeper 状态');
      kpNode.innerHTML='<span>'+kpParts.join(' · ')+'</span>'+wizardEnvNote(document.getElementById('ls-kp-env').value)+wizardGotoLink('ls-kp-card');
    }
    document.getElementById('wizard-panel').addEventListener('click',function(event){const link=event.target.closest('a[data-goto]');if(!link)return;event.preventDefault();gotoSection(link.dataset.goto,true);});
    // 每个模块可折叠：标题行注入 button.sec-toggle（aria-expanded），折叠态 = section.is-collapsed（只留标题行）；
    // 折叠的模块 id 记在 localStorage['fx100-env-collapsed']（无痕 / 禁存储时静默）。默认全部展开。
    const SECTION_COLLAPSE_KEY='fx100-env-collapsed';
    function readCollapsedIds(){try{const parsed=JSON.parse(localStorage.getItem(SECTION_COLLAPSE_KEY)||'[]');return Array.isArray(parsed)?parsed.filter(function(id){return typeof id==='string';}):[];}catch(error){return [];}}
    function persistCollapsedIds(){try{localStorage.setItem(SECTION_COLLAPSE_KEY,JSON.stringify(sectionCards().filter(function(section){return section.classList.contains('is-collapsed');}).map(function(section){return section.id;})));}catch(error){/* 无痕 / 禁存储时静默：折叠态只在本次页面内有效 */}}
    function sectionCards(){return Array.from(document.querySelectorAll('.section-card[id]'));}
    function sectionHeading(section){let heading=section.querySelector(':scope > .section-heading');if(heading)return heading;heading=document.createElement('div');heading.className='section-heading';const block=document.createElement('div');const title=section.querySelector('h2');if(title)block.appendChild(title);else{const fallback=document.createElement('h2');fallback.textContent=section.id;block.appendChild(fallback);}heading.appendChild(block);section.insertBefore(heading,section.firstChild);return heading;}
    function setSectionCollapsed(section,collapsed,skipPersist){
      section.classList.toggle('is-collapsed',collapsed);
      const toggle=section.querySelector(':scope > .section-heading .sec-toggle');
      if(toggle){toggle.textContent=collapsed?'展开':'折叠';toggle.setAttribute('aria-expanded',String(!collapsed));}
      const link=document.querySelector('#env-toc a[data-toc="'+section.id+'"]');
      if(link)link.classList.toggle('is-collapsed',collapsed);
      if(!skipPersist)persistCollapsedIds();
      tocScheduleActive();
    }
    function toggleSection(section){setSectionCollapsed(section,!section.classList.contains('is-collapsed'));}
    function setAllSectionsCollapsed(collapsed){sectionCards().forEach(function(section){setSectionCollapsed(section,collapsed,true);});persistCollapsedIds();}
    function revealSection(id){const section=document.getElementById(id);if(section&&section.classList.contains('is-collapsed'))setSectionCollapsed(section,false);}
    function initSectionCollapse(){
      const stored=readCollapsedIds();
      sectionCards().forEach(function(section){
        const heading=sectionHeading(section);
        const toggle=document.createElement('button');
        toggle.type='button';toggle.className='secondary sec-toggle';toggle.textContent='折叠';toggle.setAttribute('aria-expanded','true');toggle.setAttribute('aria-controls',section.id);toggle.title='折叠 / 展开本模块（点标题亦可）';
        heading.appendChild(toggle);
        const title=heading.querySelector('h2');if(title)title.title='点击折叠 / 展开本模块';
        // 标题文字或折叠按钮可切换；标题行里的其它按钮 / 链接 / 表单控件不触发折叠。
        heading.addEventListener('click',function(event){
          if(event.target.closest('.sec-toggle')){toggleSection(section);return;}
          if(event.target.closest('button,a,input,select,textarea,label,summary'))return;
          if(event.target.closest('h2'))toggleSection(section);
        });
        if(stored.includes(section.id))setSectionCollapsed(section,true,true);
      });
    }
    // 左侧目录：点击 → 目标模块若折叠先展开，再平滑滚动并更新 hash；当前模块高亮由 IntersectionObserver 触发重算（无 IO 时退回 scroll 监听）。
    function tocLinks(){return Array.from(document.querySelectorAll('#env-toc a[data-toc]'));}
    function tocTargetVisible(el){return !!el&&!el.closest('[hidden]');}
    function tocSetActive(id){
      const current=id?document.querySelector('#env-toc a[data-toc="'+id+'"]'):null;
      const parentId=current&&current.dataset.tocParent?current.dataset.tocParent:null;
      tocLinks().forEach(function(link){const active=link===current;link.classList.toggle('is-active',active);link.classList.toggle('is-active-parent',!active&&link.dataset.toc===parentId);if(active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});
    }
    // 规则：视口顶部下方 5% 处那条线落在哪个目标里，哪个就是当前（嵌套取最内层；并列——⑥ 两张卡桌面端同一行、top 相同——保留当前已高亮的，否则取靠前的，
    // 这样点目录「Keeper」后不会被 IO 重算抢回「前端」）；都不含时取最后一个已滚过这条线的目标，再没有就取第一个可见目标。
    function tocPickActive(){
      const offset=Math.max(16,window.innerHeight*0.05);
      const activeLink=document.querySelector('#env-toc a.is-active'),activeId=activeLink?activeLink.dataset.toc:null;
      let containedId=null,containedTop=-Infinity,passedId=null,passedTop=-Infinity,firstVisible=null;
      tocLinks().forEach(function(link){
        const id=link.dataset.toc,el=document.getElementById(id);
        if(!tocTargetVisible(el))return;
        if(!firstVisible)firstVisible=id;
        const rect=el.getBoundingClientRect();
        const wins=function(top,best){return top>best||(top===best&&id===activeId);};
        if(rect.top<=offset&&rect.bottom>offset&&wins(rect.top,containedTop)){containedTop=rect.top;containedId=id;}
        if(rect.top<=offset&&wins(rect.top,passedTop)){passedTop=rect.top;passedId=id;}
      });
      tocSetActive(containedId||passedId||firstVisible);
    }
    let tocActiveScheduled=false;
    function tocScheduleActive(){if(tocActiveScheduled)return;tocActiveScheduled=true;window.requestAnimationFrame(function(){tocActiveScheduled=false;tocPickActive();});}
    function tocSyncHidden(){tocLinks().forEach(function(link){const item=link.closest('li');if(item)item.hidden=!tocTargetVisible(document.getElementById(link.dataset.toc));});tocScheduleActive();}
    function gotoSection(id,updateHash){
      const target=document.getElementById(id);if(!target)return;
      const section=target.closest('.section-card');
      if(section&&section.classList.contains('is-collapsed'))setSectionCollapsed(section,false);
      try{target.scrollIntoView({behavior:'smooth',block:'start'});}catch(error){target.scrollIntoView();}
      if(updateHash){try{history.replaceState(null,'','#'+id);}catch(error){/* file:// 等不允许改 URL 时忽略 */}}
      tocSetActive(id);
    }
    function initToc(){
      document.getElementById('env-toc').addEventListener('click',function(event){const link=event.target.closest('a[data-toc]');if(!link)return;event.preventDefault();gotoSection(link.dataset.toc,true);});
      document.getElementById('toc-expand-all').addEventListener('click',function(){setAllSectionsCollapsed(false);});
      document.getElementById('toc-collapse-all').addEventListener('click',function(){setAllSectionsCollapsed(true);});
      if('IntersectionObserver' in window){
        const observer=new IntersectionObserver(function(){tocScheduleActive();},{rootMargin:'0px 0px -95% 0px',threshold:[0,1]});
        tocLinks().forEach(function(link){const el=document.getElementById(link.dataset.toc);if(el)observer.observe(el);});
      }else{window.addEventListener('scroll',tocScheduleActive,{passive:true});}
      window.addEventListener('resize',tocScheduleActive);
      tocSyncHidden();
      const hash=location.hash?location.hash.slice(1):'';
      if(hash&&document.getElementById(hash))window.setTimeout(function(){gotoSection(hash,false);},0);
    }
    initSectionCollapse();initToc();
    load().catch(showError).finally(function(){document.querySelector('main').dataset.pageReady='true';});
  `;

  return renderPageShell({
    title: '测试环境',
    subtitle: '⓪一键搭建向导（勾选步骤自动串行）或按 ①Fork 与 RPC → ②部署合约（可选）→ ③Trade/账户配置（默认折叠）→ ④Mock 初始化 → ⑤环境检查 的顺序手工完成；Mock Oracle 价格与参数直写在合约参数页',
    active: 'environments',
    readyId: 'environment-page',
    content,
    extraStyles: styles,
    script,
  });
}

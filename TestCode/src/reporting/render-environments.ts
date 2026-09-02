import { renderPageShell } from './render-page-shell.js';

// 测试环境页：按配置顺序分步呈现。
// ⓪ 一键搭建向导（勾选步骤按 Fork → 部署 → 初始化 → 检查 固定顺序串行执行，/api/environment-setup 长任务）
// → ① Fork 与 RPC（Tenderly 建 Fork → 填 RPC 即存）→ ② 部署合约（可选：deploy:contracts 全新部署所选分支）
// → ③ Trade/账户/高级配置（默认折叠）→ ④ Mock Market Bundle 初始化 → ⑤ 环境检查（验收）。
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

  <section class="panel section-card" id="wizard-panel">
    <div class="section-heading"><div><h2>⓪ 一键搭建向导</h2><p>勾选需要的步骤后按「新建 Fork → 部署合约 → 初始化 → 检查」固定顺序自动执行，一步失败即停、后续跳过；每行也可「单独执行」。默认勾选 初始化+检查（重建 Fork 后最常用）；新建 Fork 与部署属破坏性/耗时步骤，需显式勾选。</p></div><button id="wizard-run" type="button">一键执行勾选步骤</button></div>
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
    </div>
    <p id="wizard-status" class="notice"></p>
  </section>

  <section class="panel section-card">
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

  <section class="panel section-card">
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

  <section class="panel section-card">
    <div class="section-heading"><div><h2>⑤ 环境检查</h2><p id="check-description">只读检查 Trade、RPC、部署清单、账户、角色、default-mock 与 Case 数据源——配置完成后的验收步骤。</p></div><div class="actions"><button id="check" type="button">检查当前环境</button><strong id="check-summary" class="status">尚未检查</strong></div></div>
    <div id="check-results" class="check-grid"><p class="muted">点击“检查当前环境”开始。</p></div>
  </section>

  <section class="panel section-card noise-plan-section">
    <div class="section-heading"><div><h2>⑥ 造数据计划：多 Trader 注资 + 网格交易</h2><p>作为测试环境配置的最后一步，为 Fork 批量铺设复杂交易数据。</p></div></div>
    <iframe id="noise-plan-frame" title="造数据计划：多 Trader 注资 + 网格交易" src="./faucet.html?embed=noise" loading="lazy"></iframe>
  </section>

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
    function renderEnvironmentMode(){const supported=state.configuration.capabilities.initializesDefaultMockResources;const isBase=environment.value==='base-sepolia';document.getElementById('wizard-panel').hidden=!supported;document.getElementById('initialization-panel').hidden=!supported;document.getElementById('create-tenderly-fork').hidden=!supported;document.getElementById('fork-guide').hidden=!supported;document.getElementById('deploy-panel').hidden=!supported;document.getElementById('rpc-step-description').textContent=isBase?'Base Sepolia 使用公共 RPC：填好主 RPC/WSS 后保存即可。':'先有可用的 Fork，再谈其他配置。填好 RPC 后点击保存即可生效。';document.getElementById('configuration-description').textContent=isBase?'Base Sepolia 使用已有部署：这里只维护 Trade、Trader、Admin、签名和本机数据源。默认折叠，需要修改自行展开。':'默认折叠：不修改即沿用现有配置；需要调整时展开对应分组。';document.getElementById('check-description').textContent=isBase?'只读检查 Trade、Base Sepolia RPC、部署清单、账户/Admin 与 Case 数据源；不会部署 Mock Token/Oracle、Market，也不会执行 Keeper 初始化。':'只读检查 Trade、RPC、部署清单、账户、角色、default-mock 与 Case 数据源——配置完成后的验收步骤。';renderForkGuide();}
    function renderProfile(){const supported=state.configuration.capabilities.initializesDefaultMockResources;renderEnvironmentMode();if(!supported||!state.profile)return;document.getElementById('mock-capability').textContent='支持完整初始化';document.getElementById('asset-profile').innerHTML=assetFields.map(profileField).join('');document.getElementById('funding-profile').innerHTML=fundingFields.map(profileField).join('');document.getElementById('operation-profile').innerHTML=Object.entries(operationLabels).map(function(entry){return '<label><input type="checkbox" data-operation="'+entry[0]+'" '+(state.profile.profile.operations[entry[0]]?'checked':'')+'><span>'+esc(entry[1])+'</span></label>';}).join('');document.getElementById('parameter-rows').innerHTML=state.profile.parameters.map(function(parameter){return '<tr><td class="group-'+parameter.group+'">'+({funding:'Funding',fee:'Fee Ratio',market:'Market'}[parameter.group])+'</td><td><code>'+esc(parameter.label)+'</code></td><td>'+parameter.valueType+'</td><td><input data-parameter="'+esc(parameter.label)+'" value="'+esc(parameter.overrideValue||'')+'" placeholder="从参考 Market 复制"></td></tr>';}).join('');document.getElementById('run-initialization').disabled=false;}
    function collectProfile(){document.querySelectorAll('[data-profile]').forEach(function(input){const path=input.dataset.profile;let value=input.value.trim();if(input.type==='number')value=Number(value);setPath(state.profile.profile,path,value);});document.querySelectorAll('[data-operation]').forEach(function(input){state.profile.profile.operations[input.dataset.operation]=input.checked;});const overrides={};document.querySelectorAll('[data-parameter]').forEach(function(input){if(input.value.trim())overrides[input.dataset.parameter]=input.value.trim();});state.profile.profile.parameterOverrides=overrides;return state.profile.profile;}
    async function requestJson(url,options){const response=await fetch(url,options);const result=await response.json();if(!response.ok)throw new Error(result.detail||result.error||('接口返回 '+response.status));return result;}
    function renderMarketSources(){const select=document.getElementById('market-source-select'),button=document.getElementById('copy-market-source'),status=document.getElementById('market-source-status');if(!state.marketSources.length){select.innerHTML='<option value="">当前环境未读取到可复制的 Market</option>';select.disabled=true;button.disabled=true;status.textContent='请先配置可用 RPC，且链上至少存在一个 Market。';return;}select.innerHTML=state.marketSources.map(function(market){const index=market.indexTokenSymbol||market.indexTokenName||market.indexToken;const collateral=market.collateralTokenSymbol||market.collateralTokenName||market.collateralToken;return '<option value="'+esc(market.indexToken)+'">Market #'+esc(market.marketIndex)+' · '+esc(index)+' / '+esc(collateral)+' · '+esc(market.indexToken)+'</option>';}).join('');select.disabled=false;button.disabled=false;status.textContent='已读取 '+state.marketSources.length+' 个链上 Market。';}
    async function loadMarketSources(){const query=encodeURIComponent(environment.value);const result=await requestJson('/api/default-market-source?environment='+query);state.marketSources=result.markets;renderMarketSources();}
    async function copyMarketSource(){const button=document.getElementById('copy-market-source'),select=document.getElementById('market-source-select'),status=document.getElementById('market-source-status');button.disabled=true;status.textContent='正在读取该 Market 的 33 项参数…';try{const result=await requestJson('/api/default-market-source',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({environment:environment.value,indexToken:select.value})});state.profile.profile.referenceMarketIndex=result.source.marketIndex;state.profile.profile.parameterOverrides=result.source.parameterOverrides;state.profile.parameters=Object.entries(result.source.parameterOverrides).map(function(entry){const current=state.profile.parameters.find(function(parameter){return parameter.label===entry[0];});return Object.assign({},current,{overrideValue:entry[1]});});renderProfile();status.textContent='已复制 Market #'+result.source.marketIndex+' 的 33 项参数；点击“保存初始化配置”后生效。';}finally{button.disabled=false;}}
    async function load(){
      if(!['http:','https:'].includes(location.protocol)){
        document.getElementById('connection').textContent='静态 HTML 仅预览：配置读取、合约部署与初始化需要经 npm run dashboard:serve 打开本页。';
        document.getElementById('deploy-status').textContent='静态模式不可部署：分支列表与部署任务需要本机看板服务，请经 npm run dashboard:serve 打开本页（按钮已禁用）。';
        document.getElementById('deploy-branch').innerHTML='<option value="">静态模式不可用（需 dashboard:serve）</option>';
        document.getElementById('wizard-deploy-branch').innerHTML='<option value="">静态模式不可用（需 dashboard:serve）</option>';
        document.getElementById('wizard-status').textContent='静态模式不可执行：一键搭建与单独执行需要本机看板服务，请经 npm run dashboard:serve 打开本页（按钮已禁用）。';
        ['save-rpc','save-config','save-profile','run-initialization','check','create-tenderly-fork','reload-market-sources','deploy-branch','reload-deploy-branches','deploy-dry-run','deploy-run','wizard-run','wizard-solo-createFork','wizard-solo-deploy','wizard-solo-init','wizard-solo-check','wizard-deploy-branch'].forEach(function(id){document.getElementById(id).disabled=true;});
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
    const wizardStepOrder=['createFork','deploy','init','check'];
    const wizardStepNames={createFork:'新建/重建 Fork',deploy:'部署合约',init:'初始化 Mock Bundle',check:'环境检查'};
    const wizardBadgeText={pending:'待执行',running:'执行中…',succeeded:'成功',failed:'失败',skipped:'已跳过'};
    function wizardBadge(step,statusClass,text){const badge=document.getElementById('wizard-badge-'+step);badge.textContent=text||wizardBadgeText[statusClass]||statusClass;badge.className='status '+statusClass;}
    function wizardSetLog(step,lines){const log=document.getElementById('wizard-log-'+step);if(!lines||!lines.length){log.hidden=true;log.textContent='';return;}log.hidden=false;log.textContent=lines.join('\\n');}
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
        statusNode.textContent='一键搭建完成：'+job.environment+' 勾选的 '+job.steps.length+' 步全部成功。下一步：到「测试运行」页跑用例，或在 ⑥ 造数据计划铺设交易数据。';
        load().catch(function(){});
      }else{
        const failedStep=job.steps.find(function(item){return item.status==='failed';});
        statusNode.textContent='一键搭建失败：步骤「'+(failedStep?wizardStepNames[failedStep.step]:'未知')+'」失败——'+(failedStep&&failedStep.summary?failedStep.summary:'详见该行日志')+'；后续步骤已跳过。修复后可重新执行向导，或到对应 section 单独重试该步。';
      }
    }
    async function pollWizard(){if(!state.activeWizardId)return;const job=await requestJson('/api/environment-setup/'+encodeURIComponent(state.activeWizardId));renderWizardJob(job);}
    async function startWizard(){
      const picks={
        createFork:document.getElementById('wizard-pick-createFork').checked,
        deploy:document.getElementById('wizard-pick-deploy').checked,
        init:document.getElementById('wizard-pick-init').checked,
        check:document.getElementById('wizard-pick-check').checked,
      };
      const chosen=wizardStepOrder.filter(function(name){return picks[name];});
      if(!chosen.length){document.getElementById('wizard-status').textContent='请先勾选至少一个步骤。';return;}
      const steps={};
      if(picks.createFork)steps.createFork={};
      const wizardDryRun=document.getElementById('wizard-deploy-dry-run').checked;
      if(picks.deploy){const branch=document.getElementById('wizard-deploy-branch').value;if(!branch){document.getElementById('wizard-status').textContent='请先在「部署合约」行选择合约分支。';return;}steps.deploy={branch:branch,dryRun:wizardDryRun};}
      if(picks.init)steps.init={force:document.getElementById('wizard-init-force').checked,forceSharedCollateral:document.getElementById('wizard-init-force-shared').checked};
      if(picks.check)steps.check=true;
      let message='将在环境 '+environment.value+' 按固定顺序自动执行：\\n'+chosen.map(function(name){return wizardStepNames[name]+(name==='deploy'&&wizardDryRun?'（dry-run）':'');}).join(' → ')+'。';
      if(picks.createFork)message+='\\n\\n注意：新建 Fork 会创建新的 Tenderly Virtual TestNet 并替换当前环境的 RPC 指向（.env.local 与 CURRENT.json 会被改写）。';
      if(picks.deploy&&!wizardDryRun)message+='\\n注意：部署会改写 E2E_DEPLOYMENT_MANIFEST 与 CURRENT.json 登记。';
      message+='\\n\\n确认执行？';
      if(!window.confirm(message))return;
      wizardStepOrder.forEach(function(name){wizardBadge(name,picks[name]?'pending':'',picks[name]?undefined:'未勾选');wizardSetLog(name,null);});
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
    document.getElementById('wizard-solo-createFork').addEventListener('click',function(){document.getElementById('create-tenderly-fork').click();});
    document.getElementById('wizard-solo-deploy').addEventListener('click',function(){const branch=document.getElementById('wizard-deploy-branch').value;if(branch)document.getElementById('deploy-branch').value=branch;startDeployment(document.getElementById('wizard-deploy-dry-run').checked);});
    document.getElementById('wizard-solo-init').addEventListener('click',function(){document.getElementById('force-init').checked=document.getElementById('wizard-init-force').checked;document.getElementById('force-shared-collateral').checked=document.getElementById('wizard-init-force-shared').checked;document.getElementById('run-initialization').click();});
    document.getElementById('wizard-solo-check').addEventListener('click',function(){document.getElementById('check').click();});
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

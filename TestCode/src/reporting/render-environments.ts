import { renderPageShell } from './render-page-shell.js';

// 测试环境页：按配置顺序分步呈现。
// ① Fork 与 RPC（Tenderly 建 Fork → 填 RPC 即存）→ ② Trade/账户/高级配置（默认折叠）
// → ③ Mock Market Bundle 初始化 → ④ 环境检查（验收）。Mock Oracle 价格面板在合约参数页。
export function renderEnvironmentsHtml(generatedAt: string): string {
  const content = `
  <section class="toolbar panel">
    <label>测试环境<select id="environment"></select></label>
    <div class="actions">
      <button id="reload" type="button" class="secondary">重新读取</button>
    </div>
    <p id="connection" class="notice">正在连接本机配置服务…</p>
  </section>

  <section class="panel section-card">
    <div class="section-heading"><div><h2>① Fork 与 RPC</h2><p id="rpc-step-description">先有可用的 Fork，再谈其他配置。填好 RPC 后点击保存即可生效。</p></div><div class="actions"><button id="create-tenderly-fork" type="button" class="secondary">创建 Tenderly Fork 并回填 RPC / WSS</button><button id="save-rpc" type="button">保存 RPC 配置</button></div></div>
    <div id="fork-guide" class="guide">
      <strong id="fork-guide-title">tx-fork / oracle-fork / time-fork 的建法（Tenderly 控制台）：</strong>
      <div id="fork-guide-body">
        <ol>
          <li>在 Tenderly 创建 Virtual TestNet，Parent Network 选 <code>Base Sepolia (84532)</code>；</li>
          <li>Custom Chain ID 按环境固定编号：tx-fork = <code>99911</code> / oracle-fork = <code>99912</code> / time-fork = <code>99913</code>；</li>
          <li>oracle-fork / time-fork 关闭运行期 State Sync（tx-fork 按需）；</li>
          <li>建好后把 HTTPS RPC 填到下方 <strong>主 RPC</strong> 与 <strong>Admin RPC</strong>，Chain ID 填固定编号，点击“保存 RPC 配置”。</li>
        </ol>
        <p class="muted">“创建 Tenderly Fork”按钮走 legacy fork API（Chain ID 继承 84532），适合快速起临时 Fork；要固定 Chain ID 请用控制台手建。</p>
      </div>
    </div>
    <div id="rpc-fields" class="field-grid"></div>
    <p id="save-status" class="notice"></p>
  </section>

  <section class="panel section-card">
    <div class="section-heading"><div><h2>② Trade、账户与高级配置</h2><p id="configuration-description">默认折叠：不修改即沿用现有配置；需要调整时展开对应分组。</p></div><button id="save-config" type="button">保存全部配置</button></div>
    <div id="config-sections"></div>
  </section>

  <section class="panel section-card" id="initialization-panel">
    <div class="section-heading"><div><h2>③ Mock Market Bundle 初始化</h2><p>一个 Bundle 包含独立 Index Token、Index Mock Oracle、Market 与参数快照；同一 Fork 的 Bundle 共享 USDC Token 与 USDC Mock Oracle。</p></div><span id="mock-capability" class="status"></span></div>
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
    <div class="section-heading"><div><h2>④ 环境检查</h2><p id="check-description">只读检查 Trade、RPC、部署清单、账户、角色、default-mock 与 Case 数据源——配置完成后的验收步骤。</p></div><div class="actions"><button id="check" type="button">检查当前环境</button><strong id="check-summary" class="status">尚未检查</strong></div></div>
    <div id="check-results" class="check-grid"><p class="muted">点击“检查当前环境”开始。</p></div>
  </section>

  <footer>页面生成：${generatedAt}</footer>`;

  const styles = `
    [hidden]{display:none!important}.toolbar,.section-heading,.init-actions{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.toolbar label{min-width:min(420px,100%)}
    label{display:grid;gap:6px;color:var(--muted)}select,input,button{font:inherit}select,input{width:100%;border:1px solid var(--line);border-radius:9px;background:#0a1322;color:var(--text);padding:9px 11px}input[type=checkbox]{width:auto;accent-color:var(--accent)}button{border:1px solid #367dc6;border-radius:9px;background:#1764aa;color:white;padding:9px 14px;cursor:pointer}button.secondary{background:#101b2d;border-color:var(--line);color:var(--text)}button:disabled{opacity:.5;cursor:not-allowed}
    .actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.notice{width:100%;margin:2px 0 0;color:#f6c85f}.section-card{margin-top:16px}.section-heading h2,.subsection h3{margin:0}.section-heading p,.subsection p{margin:4px 0 0;color:var(--muted)}
    .guide{border:1px solid var(--line);border-left:4px solid #367dc6;border-radius:9px;background:#0d1627;padding:12px 16px;margin-top:14px}.guide ol,.guide ul{margin:8px 0 0;padding-left:20px;display:grid;gap:4px}.guide p{margin:8px 0 0}
    .config-section,.subsection{border-top:1px solid var(--line);padding-top:16px;margin-top:16px}.config-section h3{margin:0 0 2px}.config-section summary{display:flex;align-items:baseline;gap:8px;cursor:pointer}.config-section summary strong{font-size:15px}.field-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:13px;margin-top:13px}.field{border:1px solid var(--line);border-radius:10px;padding:11px;background:#0d1627}.field small{color:var(--muted);min-height:34px;display:block;overflow-wrap:anywhere}.field-line{display:flex;align-items:center;justify-content:space-between;gap:8px}.required{color:#ff9a9a}.secret-state{font-size:12px;color:#73d8a4}.clear-secret{display:flex;margin-top:7px;grid-template-columns:auto 1fr;align-items:center}
    .check-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px}.check-result{border:1px solid var(--line);border-left-width:4px;border-radius:9px;padding:10px;background:#0d1627}.check-result.PASS{border-left-color:#44c488}.check-result.FAIL{border-left-color:#ff6868}.check-result.WARN{border-left-color:#f6c85f}.check-result strong{display:block}.check-result small{color:var(--muted)}.status{border-radius:999px;padding:5px 10px;background:#17243a;color:var(--muted);white-space:nowrap}.status.PASS,.status.READY{color:#76e3aa}.status.FAIL,.status.NOT_READY{color:#ff9090}
    .operation-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:9px;margin-top:12px}.operation-grid label,.check{display:flex;grid-template-columns:auto 1fr;align-items:flex-start;gap:9px;border:1px solid var(--line);border-radius:9px;padding:10px;background:#0d1627;color:var(--text)}.bundle-alias{min-width:min(310px,100%)}.danger-check{border-color:#8b6227;color:#f6c85f}.market-source{display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin-top:12px;padding:12px;border:1px solid var(--line);border-radius:9px;background:#0d1627}.market-source label{min-width:min(680px,100%)}.market-source span{padding:9px 0}details summary{cursor:pointer;font-weight:700}.table-wrap{overflow:auto;margin-top:12px}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid var(--line);padding:8px;white-space:nowrap}td input{min-width:260px}.group-funding{color:#73d8a4}.group-fee{color:#f6c85f}.init-actions{border-top:1px dashed var(--line);padding-top:16px;margin-top:16px}.init-actions label{min-width:min(240px,100%)}pre{max-height:360px;overflow:auto;white-space:pre-wrap;background:#08101d;border-radius:9px;padding:12px}footer{margin-top:18px;color:var(--muted)}
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
      title.textContent=environment.value+' 的建法（Tenderly 控制台）· Chain ID 固定 '+guide.chainId+'：';
      body.innerHTML='<p>定位：'+guide.role+'。</p>'
        +'<ol>'
        +'<li>在 Tenderly <code>aladdindao/test</code> 项目创建 Virtual TestNet，Parent Network 选 <code>Base Sepolia (84532)</code>；</li>'
        +'<li>Custom Chain ID 固定填 <code>'+guide.chainId+'</code>（本环境专用编号；tx-fork=99911 / oracle-fork=99912 / time-fork=99913，避免与真链混淆、也便于 Keeper 按 Chain ID 隔离游标）；</li>'
        +'<li>建好后把 HTTPS RPC 填到下方 <strong>主 RPC</strong> 与 <strong>Admin RPC</strong>，Chain ID 填 <code>'+guide.chainId+'</code>，点击“保存 RPC 配置”。</li>'
        +'</ol>'
        +'<p><strong>本环境特殊要求（区别于其他 Fork）：</strong></p>'
        +'<ul>'+guide.special.map(function(item){return '<li>'+item+'</li>';}).join('')+'</ul>'
        +'<p class="muted">“创建 Tenderly Fork”按钮走 legacy fork API（Chain ID 继承 84532，不符合本环境固定编号），要固定 Chain ID 请在 Tenderly 控制台手建。</p>';
    }
    const state={configuration:null,profile:null,marketSources:[],activeInitializationId:null,poll:null};
    const environment=document.getElementById('environment');
    environment.innerHTML=environmentNames.map(function(name){return '<option value="'+name+'">'+name+'</option>';}).join('');
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
    function renderEnvironmentMode(){const supported=state.configuration.capabilities.initializesDefaultMockResources;const isBase=environment.value==='base-sepolia';document.getElementById('initialization-panel').hidden=!supported;document.getElementById('create-tenderly-fork').hidden=!supported;document.getElementById('fork-guide').hidden=!supported;document.getElementById('rpc-step-description').textContent=isBase?'Base Sepolia 使用公共 RPC：填好主 RPC/WSS 后保存即可。':'先有可用的 Fork，再谈其他配置。填好 RPC 后点击保存即可生效。';document.getElementById('configuration-description').textContent=isBase?'Base Sepolia 使用已有部署：这里只维护 Trade、Trader、Admin、签名和本机数据源。默认折叠，需要修改自行展开。':'默认折叠：不修改即沿用现有配置；需要调整时展开对应分组。';document.getElementById('check-description').textContent=isBase?'只读检查 Trade、Base Sepolia RPC、部署清单、账户/Admin 与 Case 数据源；不会部署 Mock Token/Oracle、Market，也不会执行 Keeper 初始化。':'只读检查 Trade、RPC、部署清单、账户、角色、default-mock 与 Case 数据源——配置完成后的验收步骤。';renderForkGuide();}
    function renderProfile(){const supported=state.configuration.capabilities.initializesDefaultMockResources;renderEnvironmentMode();if(!supported||!state.profile)return;document.getElementById('mock-capability').textContent='支持完整初始化';document.getElementById('asset-profile').innerHTML=assetFields.map(profileField).join('');document.getElementById('funding-profile').innerHTML=fundingFields.map(profileField).join('');document.getElementById('operation-profile').innerHTML=Object.entries(operationLabels).map(function(entry){return '<label><input type="checkbox" data-operation="'+entry[0]+'" '+(state.profile.profile.operations[entry[0]]?'checked':'')+'><span>'+esc(entry[1])+'</span></label>';}).join('');document.getElementById('parameter-rows').innerHTML=state.profile.parameters.map(function(parameter){return '<tr><td class="group-'+parameter.group+'">'+({funding:'Funding',fee:'Fee Ratio',market:'Market'}[parameter.group])+'</td><td><code>'+esc(parameter.label)+'</code></td><td>'+parameter.valueType+'</td><td><input data-parameter="'+esc(parameter.label)+'" value="'+esc(parameter.overrideValue||'')+'" placeholder="从参考 Market 复制"></td></tr>';}).join('');document.getElementById('run-initialization').disabled=false;}
    function collectProfile(){document.querySelectorAll('[data-profile]').forEach(function(input){const path=input.dataset.profile;let value=input.value.trim();if(input.type==='number')value=Number(value);setPath(state.profile.profile,path,value);});document.querySelectorAll('[data-operation]').forEach(function(input){state.profile.profile.operations[input.dataset.operation]=input.checked;});const overrides={};document.querySelectorAll('[data-parameter]').forEach(function(input){if(input.value.trim())overrides[input.dataset.parameter]=input.value.trim();});state.profile.profile.parameterOverrides=overrides;return state.profile.profile;}
    async function requestJson(url,options){const response=await fetch(url,options);const result=await response.json();if(!response.ok)throw new Error(result.detail||result.error||('接口返回 '+response.status));return result;}
    function renderMarketSources(){const select=document.getElementById('market-source-select'),button=document.getElementById('copy-market-source'),status=document.getElementById('market-source-status');if(!state.marketSources.length){select.innerHTML='<option value="">当前环境未读取到可复制的 Market</option>';select.disabled=true;button.disabled=true;status.textContent='请先配置可用 RPC，且链上至少存在一个 Market。';return;}select.innerHTML=state.marketSources.map(function(market){const index=market.indexTokenSymbol||market.indexTokenName||market.indexToken;const collateral=market.collateralTokenSymbol||market.collateralTokenName||market.collateralToken;return '<option value="'+esc(market.indexToken)+'">Market #'+esc(market.marketIndex)+' · '+esc(index)+' / '+esc(collateral)+' · '+esc(market.indexToken)+'</option>';}).join('');select.disabled=false;button.disabled=false;status.textContent='已读取 '+state.marketSources.length+' 个链上 Market。';}
    async function loadMarketSources(){const query=encodeURIComponent(environment.value);const result=await requestJson('/api/default-market-source?environment='+query);state.marketSources=result.markets;renderMarketSources();}
    async function copyMarketSource(){const button=document.getElementById('copy-market-source'),select=document.getElementById('market-source-select'),status=document.getElementById('market-source-status');button.disabled=true;status.textContent='正在读取该 Market 的 33 项参数…';try{const result=await requestJson('/api/default-market-source',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({environment:environment.value,indexToken:select.value})});state.profile.profile.referenceMarketIndex=result.source.marketIndex;state.profile.profile.parameterOverrides=result.source.parameterOverrides;state.profile.parameters=Object.entries(result.source.parameterOverrides).map(function(entry){const current=state.profile.parameters.find(function(parameter){return parameter.label===entry[0];});return Object.assign({},current,{overrideValue:entry[1]});});renderProfile();status.textContent='已复制 Market #'+result.source.marketIndex+' 的 33 项参数；点击“保存初始化配置”后生效。';}finally{button.disabled=false;}}
    async function load(){document.getElementById('connection').textContent='正在读取 '+environment.value+'…';const query=encodeURIComponent(environment.value);const configurationResult=await requestJson('/api/environment-configuration?environment='+query);state.configuration=configurationResult.configuration;state.profile=null;state.marketSources=[];renderConfiguration();renderEnvironmentMode();if(state.configuration.capabilities.initializesDefaultMockResources){state.profile=await requestJson('/api/environment-initialization-profile?environment='+query);renderProfile();try{await loadMarketSources();}catch(error){state.marketSources=[];renderMarketSources();document.getElementById('market-source-status').textContent='Market 列表读取失败：'+error.message;}}document.getElementById('connection').textContent=environment.value==='base-sepolia'?'已连接 Base Sepolia 配置；该环境不会加载或执行 Mock/Market/Keeper 初始化。':'已连接本机服务；RPC 显示完整地址，私钥和 Token 只显示配置状态。按 ①→④ 顺序完成配置。';}
    async function saveConfiguration(){const values={};state.configuration.fields.forEach(function(field){const input=document.getElementById('config-'+field.key);if(field.type==='checkbox')values[field.key]=String(input.checked);else if(!field.secret||input.value.trim())values[field.key]=input.value;});const clearKeys=Array.from(document.querySelectorAll('[data-clear]:checked')).map(function(input){return input.dataset.clear;});const result=await requestJson('/api/environment-configuration',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({environment:environment.value,values:values,clearKeys:clearKeys})});state.configuration=result.configuration;renderConfiguration();document.getElementById('save-status').textContent='配置已保存到本机 .env.local。';}
    async function saveProfile(){const result=await requestJson('/api/environment-initialization-profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({environment:environment.value,profile:collectProfile()})});state.profile=result;renderProfile();document.getElementById('initialization-status').textContent='初始化配置已保存。';return result;}
    async function check(){document.getElementById('check-summary').textContent='检查中…';const result=await requestJson('/api/environment-check?environment='+encodeURIComponent(environment.value));const check=result.result;document.getElementById('check-summary').textContent=check.status;document.getElementById('check-summary').className='status '+check.status;document.getElementById('check-results').innerHTML=check.checks.map(function(item){return '<article class="check-result '+item.status+'"><strong>'+esc(item.label)+' · '+item.status+'</strong><small>'+esc(item.detail)+'</small></article>';}).join('');}
    function renderJob(job){const alias=job.bundleAlias||'default-mock';document.getElementById('initialization-status').textContent='['+alias+'] '+(job.message||('初始化状态：'+job.status));document.getElementById('initialization-log').hidden=false;document.getElementById('log-content').textContent=(job.logTail||[]).join('\\n');if(['PASS','FAIL','INTERRUPTED'].includes(job.status)){clearInterval(state.poll);state.poll=null;document.getElementById('run-initialization').disabled=false;if(job.status==='PASS'){load().then(check).catch(function(){});}}}
    async function pollJob(){if(!state.activeInitializationId)return;const result=await requestJson('/api/environment-initializations/'+encodeURIComponent(state.activeInitializationId));renderJob(result.initialization);}
    document.getElementById('reload').addEventListener('click',function(){load().catch(showError);});environment.addEventListener('change',function(){load().catch(showError);});
    document.getElementById('save-config').addEventListener('click',function(){saveConfiguration().catch(showError);});document.getElementById('save-rpc').addEventListener('click',function(){saveConfiguration().catch(showError);});document.getElementById('save-profile').addEventListener('click',function(){saveProfile().catch(showError);});document.getElementById('check').addEventListener('click',function(){check().catch(showError);});document.getElementById('create-tenderly-fork').addEventListener('click',async function(){const button=this;button.disabled=true;document.getElementById('connection').textContent='正在创建 Tenderly Fork…';try{const result=await requestJson('/api/tenderly-forks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({environment:environment.value})});document.getElementById('connection').textContent='Fork 已创建并回填：Chain ID '+result.fork.chainId+'；HTTP RPC 与 WSS 已保存。';await load();}catch(error){showError(error);}finally{button.disabled=false;}});
    document.getElementById('reload-market-sources').addEventListener('click',async function(){const button=this;button.disabled=true;document.getElementById('market-source-status').textContent='正在读取链上 Market 数据…';try{await loadMarketSources();}catch(error){state.marketSources=[];renderMarketSources();document.getElementById('market-source-status').textContent='Market 列表读取失败：'+error.message;}finally{button.disabled=false;}});
    document.getElementById('copy-market-source').addEventListener('click',function(){copyMarketSource().catch(showError);});
    document.getElementById('run-initialization').addEventListener('click',async function(){const button=this;const bundleAlias=document.getElementById('bundle-alias').value.trim();if(!/^[a-z0-9][a-z0-9-]{0,47}$/.test(bundleAlias)){showError(new Error('Market Bundle 别名只允许小写字母、数字和连字符，长度 1–48。'));return;}button.disabled=true;try{await saveConfiguration();await saveProfile();const result=await requestJson('/api/environment-initializations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({environment:environment.value,bundleAlias:bundleAlias,force:document.getElementById('force-init').checked,forceSharedCollateral:document.getElementById('force-shared-collateral').checked,reuseRpcForAdmin:false})});state.activeInitializationId=result.initialization.id;renderJob(result.initialization);state.poll=setInterval(function(){pollJob().catch(showError);},1500);}catch(error){button.disabled=false;showError(error);}});
    function showError(error){document.getElementById('connection').textContent='操作失败：'+error.message;document.getElementById('initialization-status').textContent='操作失败：'+error.message;}
    load().catch(showError).finally(function(){document.querySelector('main').dataset.pageReady='true';});
  `;

  return renderPageShell({
    title: '测试环境',
    subtitle: '按 ①Fork 与 RPC → ②Trade/账户配置（默认折叠）→ ③Mock 初始化 → ④环境检查 的顺序完成配置；Mock Oracle 价格与参数直写在合约参数页',
    active: 'environments',
    readyId: 'environment-page',
    content,
    extraStyles: styles,
    script,
  });
}

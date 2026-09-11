import type { ParameterReference } from './reference-sources.js';
import { escapeHtml, renderPageShell, serializeForHtml } from './render-page-shell.js';

const visibleColumns = [
  '序号', '参数层级', '模块', '参数名', 'Solidity Key/入口', '参数作用域（Key维度）', '状态',
  '当前链上原始值', '可读值', '数据类型', '设置入口', '来源',
];

export function renderParametersHtml(reference: ParameterReference, generatedAt: string): string {
  const payload = serializeForHtml({ ...reference, visibleColumns });
  const snapshot = reference.snapshot;
  const content = `
  <section class="notice">“当前链上原始值”全部来自所选 Project 环境 RPC，不使用样例值：Base Sepolia 每次点击时重新解析 latest，再把本轮全部读取锁定在该查询时最新区块，保证数值口径一致；fork 环境读取各自的固定区块。未设置项也保留 0 / false / 零地址。选择 Market 后，页面会把该 Market 及其 INDEX/COLLATERAL Token 相关参数排在前面，并在后面保留全局参数。</section>
  <section class="query-panel panel" aria-label="Project 环境参数查询">
    <label>Project 环境<select id="project-environment"><option value="${escapeHtml(snapshot?.environment ?? '')}">${escapeHtml(snapshot?.displayName ?? '当前设计资料')}</option></select></label>
    <button id="query-parameters" type="button" disabled>查询最新参数</button>
    <span id="query-status" class="muted">正在检查可用环境…</span>
    <div class="rpc-cell">
      <span id="query-rpc" class="muted rpc-display">对应 RPC：正在检查…</span>
      <span id="query-datastore" class="muted rpc-display">读取合约 DataStore：${escapeHtml(snapshot?.dataStore ?? '—')}</span>
    </div>
  </section>
  <section class="meta panel">
    <div><span>当前环境</span><strong id="environment-value">${escapeHtml(snapshot?.displayName ?? '设计资料')}</strong></div>
    <div><span id="block-label">${snapshot?.environment === 'base-sepolia' ? '查询时最新区块' : '固定区块'}</span><strong id="block-value">${snapshot ? snapshot.blockNumber : '-'}</strong></div>
    <div><span>匹配记录</span><strong id="row-count">${reference.rows.length}</strong></div>
    <div><span>快照已设置</span><strong id="set-count">${snapshot?.setCount ?? '-'}</strong></div>
    <div><span>快照未设置</span><strong id="unset-count">${snapshot?.unsetCount ?? '-'}</strong></div>
    <div><span>不可枚举</span><strong id="skipped-count">${snapshot?.skippedCount ?? '-'}</strong></div>
    <div><span>读取失败</span><strong id="error-count">${snapshot?.errorCount ?? '-'}</strong></div>
  </section>
  <section class="panel action-panel" id="oracle-panel" hidden>
    <div class="panel-head"><div><h2>Mock Oracle 价格</h2><span class="muted">default-mock 双 Oracle 链上实时读数；fork 新区块用真实时钟，跑批次前先刷新时间戳防价格过期</span></div><button id="refresh-oracle-read" type="button">重新读取</button></div>
    <div id="oracle-cards" class="oracle-grid"></div>
    <div class="action-row">
      <button id="refresh-oracle-timestamp" type="button">刷新时间戳（价格不变）</button>
      <label>目标<select id="oracle-target"><option value="index">Index Oracle</option><option value="collateral">USDC Oracle</option><option value="both">两个都改</option></select></label>
      <label>Min 价（USD，写 MockOracle answer）<input id="oracle-min-price" type="text" inputmode="decimal" autocomplete="off" placeholder="例如 2000"></label>
      <label>Max 价（USD，写 STABLE_PRICE；留空 = Min）<input id="oracle-max-price" type="text" inputmode="decimal" autocomplete="off" placeholder="例如 2030"></label>
      <button id="set-oracle-price" type="button">设置 Min / Max</button>
    </div>
    <p id="oracle-status" class="muted action-status"></p>
  </section>
  <section class="panel action-panel" id="write-panel" hidden>
    <div class="panel-head"><div><h2>修改参数</h2><span class="muted">仅私有 Fork：DataStore 直写（模拟持有 CONTROLLER 角色的 Config 合约），写入后立即回读核对</span></div><button id="write-close" type="button">收起</button></div>
    <div id="write-target" class="write-target"></div>
    <div class="action-row">
      <label>新值（raw 原始值；bool 填 true/false）<input id="write-value" type="text" autocomplete="off" spellcheck="false"></label>
      <button id="write-submit" type="button">写入并回读</button>
    </div>
    <p class="write-warning">⚠️ 改动立即生效且不会自动恢复——会影响后续用例的参数基线。请记录原值，用例跑完后手工改回或重新初始化环境。</p>
    <p id="write-status" class="muted action-status"></p>
  </section>
  <section class="filters panel" aria-label="系统参数筛选">
    <label class="market-filter">Market 范围<select id="market-index"><option value="">全部参数</option><option value="global">仅全局参数</option></select></label>
    <label>参数层级<select id="level"><option value="">全部</option></select></label>
    <label>模块<select id="module"><option value="">全部</option></select></label>
    <label>状态<select id="status"><option value="">全部</option></select></label>
    <label>当前路径必填<select id="required"><option value="">全部</option></select></label>
    <label class="search">搜索<input id="search" type="search" placeholder="参数名、Key、作用域、来源……"></label>
  </section>
  <section class="panel table-panel">
    <div class="panel-head"><div><h2>参数清单</h2><span id="scope-summary" class="scope-summary"></span><span id="display-range" class="muted"></span></div><span class="muted">来源：<span id="source-path">${escapeHtml(reference.sourcePath)}</span></span></div>
    <div class="scroll"><table><thead><tr>${visibleColumns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}<th>操作</th></tr></thead><tbody id="parameter-rows"></tbody></table></div>
    <div class="pagination" aria-label="参数分页">
      <label>每页<select id="page-size"><option value="100">100</option><option value="250">250</option><option value="500" selected>500</option><option value="1000">1000</option></select></label>
      <button id="previous-page" type="button">上一页</button><span id="page-label" class="muted"></span><button id="next-page" type="button">下一页</button>
    </div>
  </section>
  <section class="footnote panel"><span>快照生成：<strong id="snapshot-time">${escapeHtml(snapshot?.generatedAt ?? reference.modifiedAt)}</strong></span><span>页面生成：<strong>${escapeHtml(generatedAt)}</strong></span><span>角色定义：<strong id="role-count">${snapshot?.roleCount ?? '-'}</strong></span></section>
  <script id="parameter-data" type="application/json">${payload}</script>`;

  const script = `(function(){
    'use strict';
    let data=JSON.parse(document.getElementById('parameter-data').textContent);
    let pageIndex=0;
    const controls={level:document.getElementById('level'),module:document.getElementById('module'),status:document.getElementById('status'),required:document.getElementById('required'),search:document.getElementById('search')};
    const marketSelect=document.getElementById('market-index');
    const environmentSelect=document.getElementById('project-environment');
    const queryButton=document.getElementById('query-parameters');
    const queryStatus=document.getElementById('query-status');
    const queryRpc=document.getElementById('query-rpc');
    let parameterEnvironments=[];
    const pageSize=document.getElementById('page-size');
    const previousPage=document.getElementById('previous-page');
    const nextPage=document.getElementById('next-page');
    const FORK_ENVIRONMENTS=['tx-fork','oracle-fork','time-fork'];
    let writeEnabled=false;
    let lastVisibleRows=[];
    let currentWrite=null;
    function isForkEnvironment(name){return FORK_ENVIRONMENTS.includes(name);}
    function writableRow(row){if(row['参数层级']!=='DataStore 链上参数')return null;const type=row['数据类型'];if(!['uint','int','bool','address'].includes(type))return null;const match=/DataStore key=(0x[0-9a-fA-F]{64})/.exec(String(row['备注']||''));if(!match)return null;return {key:match[1],valueType:type};}
    function escapeHtml(value){return String(value==null?'':value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
    function fill(select,key){select.querySelectorAll('option:not([value=""])').forEach(function(option){option.remove();});Array.from(new Set(data.rows.map(function(row){return row[key];}).filter(Boolean))).sort().forEach(function(value){const option=document.createElement('option');option.value=value;option.textContent=value;select.appendChild(option);});}
    function rebuildMarketFilter(){marketSelect.innerHTML='<option value="">全部参数</option><option value="global">仅全局参数</option>';(data.snapshot&&data.snapshot.marketMappings||[]).forEach(function(market){const option=document.createElement('option');option.value=String(market.marketIndex);option.textContent='market#'+market.marketIndex+' · '+market.pair+'（相关参数 + 全局参数）';marketSelect.appendChild(option);});marketSelect.value='';}
    function rebuildFilters(){Object.values(controls).forEach(function(control){control.value='';});rebuildMarketFilter();fill(controls.level,'参数层级');fill(controls.module,'模块');fill(controls.status,'状态');fill(controls.required,'当前路径必填');pageIndex=0;}
    function rowScope(row){return String(row['参数作用域（Key维度）']||'');}
    function isGlobalScope(scope){return scope==='全局'||scope==='全局角色';}
    function containsMarket(scope,index){const marker='market#'+index;let position=scope.indexOf(marker);while(position>=0){const next=scope.charAt(position+marker.length);if(!/[0-9]/.test(next))return true;position=scope.indexOf(marker,position+marker.length);}return false;}
    function containsMarketIndex(scope,index){const marker='marketIndex=market#'+index;const position=scope.indexOf(marker);return position>=0&&!/[0-9]/.test(scope.charAt(position+marker.length));}
    function matchesMarket(row){const selected=marketSelect.value;if(!selected)return true;const scope=rowScope(row);if(selected==='global')return isGlobalScope(scope);if(isGlobalScope(scope))return true;if(scope.includes('marketIndex='))return containsMarketIndex(scope,selected);return containsMarket(scope,selected);}
    function filteredRows(){const query=controls.search.value.trim().toLowerCase();const selected=marketSelect.value;const rows=data.rows.filter(function(row){return matchesMarket(row)&&(!controls.level.value||row['参数层级']===controls.level.value)&&(!controls.module.value||row['模块']===controls.module.value)&&(!controls.status.value||row['状态']===controls.status.value)&&(!controls.required.value||row['当前路径必填']===controls.required.value)&&(!query||Object.values(row).join(' ').toLowerCase().includes(query));});if(selected&&selected!=='global'){return rows.map(function(row,index){return {row:row,index:index,global:isGlobalScope(rowScope(row))};}).sort(function(left,right){return Number(left.global)-Number(right.global)||left.index-right.index;}).map(function(item){return item.row;});}return rows;}
    function scopeSummary(){const selected=marketSelect.value;if(!selected)return '全部作用域';if(selected==='global')return '仅全局参数';const market=(data.snapshot&&data.snapshot.marketMappings||[]).find(function(item){return String(item.marketIndex)===selected;});return 'market#'+selected+(market?' · '+market.pair:'')+'：Market / Token 相关参数 + 全局参数';}
    function updateMetadata(){const snapshot=data.snapshot||{};document.getElementById('environment-value').textContent=snapshot.displayName||'设计资料';document.getElementById('block-label').textContent=snapshot.environment==='base-sepolia'?'查询时最新区块':'固定区块';document.getElementById('block-value').textContent=snapshot.blockNumber||'-';document.getElementById('set-count').textContent=snapshot.setCount==null?'-':snapshot.setCount;document.getElementById('unset-count').textContent=snapshot.unsetCount==null?'-':snapshot.unsetCount;document.getElementById('skipped-count').textContent=snapshot.skippedCount==null?'-':snapshot.skippedCount;document.getElementById('error-count').textContent=snapshot.errorCount==null?'-':snapshot.errorCount;document.getElementById('snapshot-time').textContent=snapshot.generatedAt||data.modifiedAt;document.getElementById('role-count').textContent=snapshot.roleCount==null?'-':snapshot.roleCount;document.getElementById('source-path').textContent=data.sourcePath;document.getElementById('query-datastore').textContent='读取合约 DataStore：'+(snapshot.dataStore||'—');}
    function render(){const rows=filteredRows();const size=Number(pageSize.value);const pageCount=Math.max(1,Math.ceil(rows.length/size));pageIndex=Math.min(pageIndex,pageCount-1);const start=pageIndex*size;const visible=rows.slice(start,start+size);document.getElementById('row-count').textContent=rows.length;document.getElementById('scope-summary').textContent=scopeSummary();document.getElementById('display-range').textContent=rows.length?'显示 '+(start+1)+'–'+(start+visible.length)+' / '+rows.length:'0 条';document.getElementById('page-label').textContent='第 '+(pageIndex+1)+' / '+pageCount+' 页';previousPage.disabled=pageIndex===0;nextPage.disabled=pageIndex>=pageCount-1;lastVisibleRows=visible;document.getElementById('parameter-rows').innerHTML=visible.map(function(row,index){const writable=writeEnabled&&writableRow(row);return '<tr>'+data.visibleColumns.map(function(column){const value=row[column]||'-';return '<td'+(column==='参数名'?' class="parameter-name"':'')+'>'+escapeHtml(value)+'</td>';}).join('')+'<td>'+(writable?'<button type="button" class="row-edit" data-write-index="'+index+'">修改</button>':'—')+'</td></tr>';}).join('')||'<tr><td colspan="'+(data.visibleColumns.length+1)+'" class="empty">无匹配参数</td></tr>';}
    marketSelect.addEventListener('change',function(){pageIndex=0;render();});
    Object.values(controls).forEach(function(control){control.addEventListener(control.tagName==='INPUT'?'input':'change',function(){pageIndex=0;render();});});
    pageSize.addEventListener('change',function(){pageIndex=0;render();});previousPage.addEventListener('click',function(){if(pageIndex>0){pageIndex--;render();}});nextPage.addEventListener('click',function(){pageIndex++;render();});
    function updateRpcDisplay(){const selected=parameterEnvironments.find(function(environment){return environment.name===environmentSelect.value;});queryRpc.textContent='对应 RPC：'+(selected&&selected.rpcDisplay?selected.rpcDisplay:'未配置');}
    function updateWriteCapability(){writeEnabled=['http:','https:'].includes(location.protocol)&&isForkEnvironment(environmentSelect.value);document.getElementById('oracle-panel').hidden=!writeEnabled;if(!writeEnabled){document.getElementById('write-panel').hidden=true;currentWrite=null;}render();}
    function renderOraclePrices(result){document.getElementById('oracle-cards').innerHTML=result.oracles.map(function(oracle){const hours=(oracle.ageSeconds/3600).toFixed(1);const freshness=oracle.fresh?'<span class="chip chip-fresh">新鲜 · '+oracle.ageSeconds+'s</span>':'<span class="chip chip-stale">已过期 '+hours+' 小时</span>';const range=oracle.minPriceDisplay?'<div>有效区间 <strong>Min '+escapeHtml(oracle.minPriceDisplay)+' — Max '+escapeHtml(oracle.maxPriceDisplay)+' USD</strong><span class="muted">（min=feed answer，max=STABLE_PRICE，provider 取两者排序）</span></div>':'';return '<article class="oracle-card"><div class="oracle-card-head"><strong>'+(oracle.role==='index'?'Index Oracle':'USDC Oracle')+' · '+escapeHtml(oracle.description)+'</strong>'+freshness+'</div><code>'+escapeHtml(oracle.address)+'</code><div>feed 价 <strong>'+escapeHtml(oracle.priceDisplay)+' USD</strong>（raw '+escapeHtml(oracle.priceRaw)+' · '+oracle.decimals+' 位小数）</div>'+range+'<div class="muted">时间戳 '+oracle.updatedAt+'（'+escapeHtml(oracle.updatedAtIso)+'）</div></article>';}).join('');}
    async function loadOraclePrices(){if(document.getElementById('oracle-panel').hidden)return;const statusEl=document.getElementById('oracle-status');statusEl.textContent='正在读取 Mock Oracle 链上状态…';try{const response=await fetch('/api/mock-oracle-prices?environment='+encodeURIComponent(environmentSelect.value),{headers:{Accept:'application/json'}});const result=await response.json();if(!response.ok)throw new Error(result.detail||result.error||('接口返回 '+response.status));renderOraclePrices(result);statusEl.textContent='链上实时读数 · 最新区块 #'+result.latestBlock.number+'（'+escapeHtml(result.latestBlock.timestampIso)+'）';}catch(error){document.getElementById('oracle-cards').innerHTML='';statusEl.textContent='读取失败：'+error.message;}}
    async function oracleAction(body,button){button.disabled=true;const statusEl=document.getElementById('oracle-status');statusEl.textContent='正在发送环境管理交易（admin RPC 免签名）…';try{const response=await fetch('/api/mock-oracle-prices',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(Object.assign({environment:environmentSelect.value},body))});const result=await response.json();if(!response.ok)throw new Error(result.detail||result.error||('接口返回 '+response.status));statusEl.textContent='完成：'+result.operations.map(function(op){return op.role+' '+op.txHash.slice(0,12)+'…（Min '+op.after.minPriceDisplay+' / Max '+op.after.maxPriceDisplay+' USD，时间戳 '+op.after.updatedAt+(op.stableTxHash?'；STABLE_PRICE tx '+op.stableTxHash.slice(0,12)+'…':'')+'）';}).join('；');await loadOraclePrices();}catch(error){statusEl.textContent='操作失败：'+error.message;}finally{button.disabled=false;}}
    function selectRowForWrite(row){const writable=writableRow(row);if(!writable)return;currentWrite={row:row,key:writable.key,valueType:writable.valueType};document.getElementById('write-panel').hidden=false;document.getElementById('write-target').innerHTML='<dl><dt>参数</dt><dd><strong>'+escapeHtml(row['参数名'])+'</strong>（'+escapeHtml(row['Solidity Key/入口']||'')+'）</dd><dt>作用域</dt><dd>'+escapeHtml(row['参数作用域（Key维度）']||'')+'</dd><dt>DataStore key</dt><dd><code>'+escapeHtml(writable.key)+'</code></dd><dt>类型</dt><dd>'+escapeHtml(writable.valueType)+'</dd><dt>当前链上原始值</dt><dd><code>'+escapeHtml(row['当前链上原始值']||'0')+'</code>'+(row['可读值']?'（'+escapeHtml(row['可读值'])+'）':'')+'</dd></dl>';document.getElementById('write-value').value='';const mismatch=data.snapshot&&data.snapshot.environment!==environmentSelect.value;document.getElementById('write-status').textContent=mismatch?'注意：表格快照来自 '+data.snapshot.environment+'，写入目标是 '+environmentSelect.value+'——"当前值"仅供参考，写入前会重新读链。':'写入目标：'+environmentSelect.value+'。';document.getElementById('write-panel').scrollIntoView({behavior:'smooth',block:'nearest'});}
    async function submitWrite(button){if(!currentWrite)return;const value=document.getElementById('write-value').value.trim();if(!value){document.getElementById('write-status').textContent='请输入新值（raw 原始值）。';return;}button.disabled=true;const statusEl=document.getElementById('write-status');statusEl.textContent='正在写入 DataStore 并回读核对…';try{const response=await fetch('/api/parameters/set',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({environment:environmentSelect.value,key:currentWrite.key,valueType:currentWrite.valueType,value:value,label:String(currentWrite.row['参数名']||'')})});const result=await response.json();if(!response.ok)throw new Error(result.detail||result.error||('接口返回 '+response.status));const write=result.write;statusEl.textContent='写入成功并回读核对：'+write.before+' → '+write.after+'（tx '+write.txHash.slice(0,12)+'… · 区块 #'+write.blockNumber+'）。列表值已本地更新；如需全量校准请点击"查询最新参数"。';if(data.snapshot&&data.snapshot.environment===environmentSelect.value){currentWrite.row['当前链上原始值']=write.after;currentWrite.row['状态']='已设置';render();}}catch(error){statusEl.textContent='写入失败：'+error.message;}finally{button.disabled=false;}}
    document.getElementById('parameter-rows').addEventListener('click',function(event){const target=event.target;if(!(target instanceof Element))return;const button=target.closest('button[data-write-index]');if(!button)return;const row=lastVisibleRows[Number(button.dataset.writeIndex)];if(row)selectRowForWrite(row);});
    document.getElementById('write-close').addEventListener('click',function(){document.getElementById('write-panel').hidden=true;currentWrite=null;});
    document.getElementById('write-submit').addEventListener('click',function(){submitWrite(this);});
    document.getElementById('refresh-oracle-read').addEventListener('click',function(){loadOraclePrices();});
    document.getElementById('refresh-oracle-timestamp').addEventListener('click',function(){oracleAction({action:'refresh-timestamp',target:'both'},this);});
    document.getElementById('set-oracle-price').addEventListener('click',function(){const decimal=/^(?:0|[1-9]\\d*)(?:\\.\\d{1,18})?$/;const min=document.getElementById('oracle-min-price').value.trim();const max=document.getElementById('oracle-max-price').value.trim();if(!decimal.test(min)||Number(min)<=0){document.getElementById('oracle-status').textContent='Min 价必须是大于 0 的十进制数字。';return;}if(max&&(!decimal.test(max)||Number(max)<Number(min))){document.getElementById('oracle-status').textContent='Max 价必须是不小于 Min 的十进制数字（留空 = Min）。';return;}oracleAction({action:'set-price',target:document.getElementById('oracle-target').value,minPrice:min,maxPrice:max||min},this);});
    environmentSelect.addEventListener('change',function(){updateRpcDisplay();updateWriteCapability();loadOraclePrices();});
    async function loadEnvironments(){if(!['http:','https:'].includes(location.protocol)){queryStatus.textContent='静态文件模式仅展示已生成快照';queryRpc.textContent='对应 RPC：仅服务模式可见';return;}try{const response=await fetch('/api/parameter-environments',{headers:{Accept:'application/json'}});const result=await response.json();if(!response.ok)throw new Error(result.detail||result.error||'环境接口返回 '+response.status);parameterEnvironments=result.environments;environmentSelect.innerHTML='';parameterEnvironments.forEach(function(environment){const option=document.createElement('option');option.value=environment.name;option.textContent=environment.displayName+(environment.available?'':'（未配置）');option.disabled=!environment.available;environmentSelect.appendChild(option);});const current=data.snapshot&&data.snapshot.environment;const preferred=parameterEnvironments.find(function(environment){return environment.name===current&&environment.available;})||parameterEnvironments.find(function(environment){return environment.selected&&environment.available;})||parameterEnvironments.find(function(environment){return environment.available;});if(preferred)environmentSelect.value=preferred.name;queryButton.disabled=!preferred;queryStatus.textContent=preferred?'选择环境后点击查询；每次都会重新读取当前链上值':'没有已配置 RPC 的 Project 环境';updateRpcDisplay();updateWriteCapability();loadOraclePrices();}catch(error){queryStatus.textContent='环境加载失败：'+error.message;queryRpc.textContent='对应 RPC：读取失败';}}
    queryButton.addEventListener('click',async function(){const environment=environmentSelect.value;if(!environment)return;queryButton.disabled=true;queryStatus.textContent='正在从 '+environment+' 配置环境重新读取全部当前值，通常需要 1–3 分钟…';try{const response=await fetch('/api/parameters?environment='+encodeURIComponent(environment)+'&refresh=1',{headers:{Accept:'application/json'}});const result=await response.json();if(!response.ok)throw new Error(result.detail||result.error||'参数接口返回 '+response.status);data=Object.assign({},result.parameters,{visibleColumns:data.visibleColumns});rebuildFilters();updateMetadata();render();queryStatus.textContent='查询完成：'+data.snapshot.displayName+' · '+(data.snapshot.environment==='base-sepolia'?'查询时最新区块 ':'固定区块 ')+data.snapshot.blockNumber;}catch(error){queryStatus.textContent='查询失败：'+error.message;}finally{queryButton.disabled=false;}});
    rebuildFilters();updateMetadata();render();loadEnvironments();document.getElementById('parameters-page').dataset.pageReady='true';
  }());`;

  return renderPageShell({
    title: 'FX100 合约系统参数',
    subtitle: '按 Project 环境查询：DataStore、市场、费用、Funding、风控、角色与动态 Key 边界',
    active: 'parameters',
    readyId: 'parameters-page',
    content,
    script,
    extraStyles: `
      .notice { border:1px solid #785d13; background:#2d240e; color:#fde68a; border-radius:12px; padding:11px 14px; margin-bottom:14px; }
      .query-panel { display:grid; grid-template-columns:minmax(260px,1fr) auto minmax(340px,1.25fr) minmax(320px,1.5fr); align-items:end; gap:12px; margin-bottom:14px; }
      .rpc-display { min-height:38px; display:flex; align-items:center; padding:0 12px; border:1px solid var(--line); border-radius:9px; background:#0b1220; overflow-wrap:anywhere; }
      .rpc-cell { display:grid; gap:6px; min-width:0; }
      .rpc-cell .rpc-display { min-height:0; padding:7px 12px; }
      button { min-height:38px; border:1px solid #3767a2; border-radius:9px; background:#17355f; color:#e7f0ff; padding:7px 14px; cursor:pointer; font-weight:700; }
      button:disabled { opacity:.5; cursor:not-allowed; }
      .meta { display:grid; grid-template-columns:repeat(7,minmax(120px,1fr)); gap:12px; margin-bottom:14px; }
      .meta div { display:grid; gap:5px; } .meta span { color:var(--muted); font-size:12px; } .meta strong { word-break:break-word; }
      .filters { display:grid; grid-template-columns:minmax(260px,1.6fr) repeat(4,minmax(140px,1fr)); gap:10px; margin-bottom:14px; }
      .filters .search { grid-column:1/-1; }
      label { display:grid; gap:5px; color:var(--muted); font-size:12px; }
      select,input { width:100%; min-height:38px; border:1px solid var(--line); border-radius:9px; background:#0b1220; color:var(--text); padding:7px 9px; }
      .panel-head { display:flex; align-items:baseline; justify-content:space-between; gap:10px; margin-bottom:12px; } .panel-head>div { display:flex; align-items:baseline; flex-wrap:wrap; gap:10px; } h2 { margin:0; font-size:18px; }
      .scope-summary { color:#86efac; font-size:12px; font-weight:700; }
      .scroll { overflow:auto; max-height:680px; } table { min-width:1900px; width:100%; border-collapse:collapse; font-size:12px; }
      th,td { padding:9px 8px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; max-width:300px; overflow-wrap:anywhere; }
      th { color:var(--muted); position:sticky; top:0; background:var(--panel); z-index:1; white-space:nowrap; }
      tr:hover td { background:rgba(94,167,255,.045); } .parameter-name { color:#c4d8ff; font-weight:700; } .empty { color:var(--muted); padding:20px; }
      .pagination { display:flex; justify-content:flex-end; align-items:end; gap:10px; padding-top:12px; } .pagination label { min-width:100px; } .pagination button { min-width:82px; }
      .footnote { display:flex; flex-wrap:wrap; gap:12px 28px; margin-top:14px; color:var(--muted); font-size:12px; } .footnote strong { color:var(--text); }
      .action-panel { margin-bottom:14px; padding:16px; }
      .action-row { display:flex; align-items:end; gap:10px; flex-wrap:wrap; margin-top:12px; } .action-row label { min-width:min(260px,100%); }
      .action-status { margin:10px 0 0; overflow-wrap:anywhere; }
      .oracle-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:12px; }
      .oracle-card { border:1px solid var(--line); border-radius:10px; background:#0d1627; padding:12px; display:grid; gap:6px; }
      .oracle-card code { overflow-wrap:anywhere; }
      .oracle-card-head { display:flex; align-items:center; justify-content:space-between; gap:10px; }
      .chip { border-radius:999px; padding:3px 9px; font-size:11px; font-weight:700; white-space:nowrap; }
      .chip-fresh { background:#0e2a1e; color:#76e3aa; border:1px solid #1e5c40; }
      .chip-stale { background:#2b1116; color:#ff9090; border:1px solid #7f1d1d; }
      .row-edit { min-height:26px; padding:2px 10px; font-size:11px; font-weight:700; }
      .write-target dl { display:grid; grid-template-columns:minmax(120px,180px) 1fr; gap:6px 14px; margin:12px 0 0; }
      .write-target dt { color:var(--muted); } .write-target dd { margin:0; overflow-wrap:anywhere; }
      .write-warning { margin:12px 0 0; padding:9px 12px; border:1px solid #785d13; border-radius:9px; background:#2d240e; color:#fde68a; }
      @media(max-width:1200px){.meta{grid-template-columns:repeat(3,1fr)}}
      @media(max-width:1000px){.query-panel{grid-template-columns:1fr auto}.query-panel .muted,.query-panel .rpc-cell{grid-column:1/-1}.filters{grid-template-columns:1fr 1fr}.search{grid-column:1/-1}}
      @media(max-width:600px){.query-panel,.meta,.filters{grid-template-columns:1fr}.query-panel .muted,.search{grid-column:auto}.table-panel{padding:10px}.panel-head{display:grid}.pagination{justify-content:stretch;display:grid;grid-template-columns:1fr 1fr}.pagination label,.pagination span{grid-column:1/-1}}
    `,
  });
}

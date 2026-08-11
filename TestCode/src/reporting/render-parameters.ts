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
    <span id="query-rpc" class="muted rpc-display">对应 RPC：正在检查…</span>
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
    <div class="scroll"><table><thead><tr>${visibleColumns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody id="parameter-rows"></tbody></table></div>
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
    function updateMetadata(){const snapshot=data.snapshot||{};document.getElementById('environment-value').textContent=snapshot.displayName||'设计资料';document.getElementById('block-label').textContent=snapshot.environment==='base-sepolia'?'查询时最新区块':'固定区块';document.getElementById('block-value').textContent=snapshot.blockNumber||'-';document.getElementById('set-count').textContent=snapshot.setCount==null?'-':snapshot.setCount;document.getElementById('unset-count').textContent=snapshot.unsetCount==null?'-':snapshot.unsetCount;document.getElementById('skipped-count').textContent=snapshot.skippedCount==null?'-':snapshot.skippedCount;document.getElementById('error-count').textContent=snapshot.errorCount==null?'-':snapshot.errorCount;document.getElementById('snapshot-time').textContent=snapshot.generatedAt||data.modifiedAt;document.getElementById('role-count').textContent=snapshot.roleCount==null?'-':snapshot.roleCount;document.getElementById('source-path').textContent=data.sourcePath;}
    function render(){const rows=filteredRows();const size=Number(pageSize.value);const pageCount=Math.max(1,Math.ceil(rows.length/size));pageIndex=Math.min(pageIndex,pageCount-1);const start=pageIndex*size;const visible=rows.slice(start,start+size);document.getElementById('row-count').textContent=rows.length;document.getElementById('scope-summary').textContent=scopeSummary();document.getElementById('display-range').textContent=rows.length?'显示 '+(start+1)+'–'+(start+visible.length)+' / '+rows.length:'0 条';document.getElementById('page-label').textContent='第 '+(pageIndex+1)+' / '+pageCount+' 页';previousPage.disabled=pageIndex===0;nextPage.disabled=pageIndex>=pageCount-1;document.getElementById('parameter-rows').innerHTML=visible.map(function(row){return '<tr>'+data.visibleColumns.map(function(column){const value=row[column]||'-';return '<td'+(column==='参数名'?' class="parameter-name"':'')+'>'+escapeHtml(value)+'</td>';}).join('')+'</tr>';}).join('')||'<tr><td colspan="'+data.visibleColumns.length+'" class="empty">无匹配参数</td></tr>';}
    marketSelect.addEventListener('change',function(){pageIndex=0;render();});
    Object.values(controls).forEach(function(control){control.addEventListener(control.tagName==='INPUT'?'input':'change',function(){pageIndex=0;render();});});
    pageSize.addEventListener('change',function(){pageIndex=0;render();});previousPage.addEventListener('click',function(){if(pageIndex>0){pageIndex--;render();}});nextPage.addEventListener('click',function(){pageIndex++;render();});
    function updateRpcDisplay(){const selected=parameterEnvironments.find(function(environment){return environment.name===environmentSelect.value;});queryRpc.textContent='对应 RPC：'+(selected&&selected.rpcDisplay?selected.rpcDisplay:'未配置');}
    environmentSelect.addEventListener('change',updateRpcDisplay);
    async function loadEnvironments(){if(!['http:','https:'].includes(location.protocol)){queryStatus.textContent='静态文件模式仅展示已生成快照';queryRpc.textContent='对应 RPC：仅服务模式可见';return;}try{const response=await fetch('/api/parameter-environments',{headers:{Accept:'application/json'}});const result=await response.json();if(!response.ok)throw new Error(result.detail||result.error||'环境接口返回 '+response.status);parameterEnvironments=result.environments;environmentSelect.innerHTML='';parameterEnvironments.forEach(function(environment){const option=document.createElement('option');option.value=environment.name;option.textContent=environment.displayName+(environment.available?'':'（未配置）');option.disabled=!environment.available;environmentSelect.appendChild(option);});const current=data.snapshot&&data.snapshot.environment;const preferred=parameterEnvironments.find(function(environment){return environment.name===current&&environment.available;})||parameterEnvironments.find(function(environment){return environment.selected&&environment.available;})||parameterEnvironments.find(function(environment){return environment.available;});if(preferred)environmentSelect.value=preferred.name;queryButton.disabled=!preferred;queryStatus.textContent=preferred?'选择环境后点击查询；每次都会重新读取当前链上值':'没有已配置 RPC 的 Project 环境';updateRpcDisplay();}catch(error){queryStatus.textContent='环境加载失败：'+error.message;queryRpc.textContent='对应 RPC：读取失败';}}
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
      @media(max-width:1200px){.meta{grid-template-columns:repeat(3,1fr)}}
      @media(max-width:1000px){.query-panel{grid-template-columns:1fr auto}.query-panel .muted{grid-column:1/-1}.filters{grid-template-columns:1fr 1fr}.search{grid-column:1/-1}}
      @media(max-width:600px){.query-panel,.meta,.filters{grid-template-columns:1fr}.query-panel .muted,.search{grid-column:auto}.table-panel{padding:10px}.panel-head{display:grid}.pagination{justify-content:stretch;display:grid;grid-template-columns:1fr 1fr}.pagination label,.pagination span{grid-column:1/-1}}
    `,
  });
}

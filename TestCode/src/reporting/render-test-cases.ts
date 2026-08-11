import { renderPageShell, serializeForHtml } from './render-page-shell.js';
import type { TestCaseView } from './test-cases.js';

export function renderTestCasesHtml(cases: TestCaseView[], generatedAt: string): string {
  const payload = serializeForHtml({ cases, generatedAt });
  const content = `
  <section class="notice" id="editor-notice">通过 Node 看板服务打开时可编辑；直接打开离线 HTML 时为只读模式。</section>
  <section class="metric-grid" id="case-metrics"></section>
  <section class="filters panel" aria-label="测试用例筛选">
    <label>套件<select id="case-suite"><option value="">全部</option></select></label>
    <label>计划 Project<select id="case-project"><option value="">全部</option></select></label>
    <label>市场兼容性<select id="case-compatibility"><option value="">全部</option><option value="mock-only">仅 Mock Market</option><option value="mock-and-deployed">Mock + 标准 Market</option><option value="deployed-only">仅标准 Market</option><option value="not-applicable">不涉及</option></select></label>
    <label>优先级<select id="case-priority"><option value="">全部</option><option>P0</option><option>P1</option><option>P2</option></select></label>
    <label>执行方式<select id="case-execution"><option value="">全部</option><option value="automated">自动化执行</option><option value="manual">手工核对</option></select></label>
    <label>执行状态<select id="case-status"><option value="">全部</option><option>PASS</option><option>FAIL</option><option>FLAKY</option><option>BLOCKED</option><option>SKIP</option><option>MANUAL</option><option>NOT_AUTOMATED</option></select></label>
    <label>搜索<input id="case-search" type="search" placeholder="SCN、标题、步骤、预期……"></label>
  </section>
  <section class="selection-toolbar panel" aria-label="运行用例选择">
    <div><strong id="run-selection-count">已选择 0 条</strong><span>可选择单条、部分或全部用例创建版本化运行</span></div>
    <div class="selection-actions"><button type="button" id="select-visible">选择当前筛选</button><button type="button" id="select-all-cases">选择全部 80 条</button><button type="button" id="clear-selection">清空</button><button type="button" id="run-selected" class="primary" disabled>执行所选</button></div>
  </section>
  <section class="workspace">
    <article class="panel list-panel">
      <div class="panel-head"><h2>测试用例</h2><span class="muted" id="case-count"></span></div>
      <div class="scroll"><table><thead><tr><th><input id="select-visible-toggle" type="checkbox" aria-label="选择当前筛选的全部用例"></th><th>ID</th><th>套件</th><th>P</th><th>标题</th><th>计划 Project</th><th>默认资源</th><th>可执行市场</th><th>最近执行</th><th>维护</th></tr></thead><tbody id="case-rows"></tbody></table></div>
    </article>
    <article class="panel editor-panel">
      <div class="panel-head"><h2>查看 / 编辑</h2><span class="save-status" id="save-status"></span></div>
      <form id="case-editor">
        <div class="form-grid">
          <label>ID<input name="id" readonly></label>
          <label>套件<select name="suite">${Array.from({ length: 8 }, (_, index) => `<option>S0${index + 1}</option>`).join('')}</select></label>
          <label>优先级<select name="priority"><option>P0</option><option>P1</option><option>P2</option></select></label>
          <label>执行方式<select name="executionMode"><option value="automated">自动化执行</option><option value="manual">手工核对（人工跑并留证）</option></select></label>
          <div class="wide env-heading"><strong>执行环境规划</strong><span>Project 决定运行 Fork；Mock 资源通过别名解析，不在用例中硬编码地址。</span></div>
          <label>Project<select name="targetProject"><option>dev-readonly</option><option>tx-fork</option><option>oracle-fork</option><option>time-fork</option><option>base-sepolia</option></select></label>
          <label>市场 / Token<select name="marketMode"><option value="deployed-market">已部署市场 + 已部署 Token</option><option value="mock-market">默认 Mock 市场 + Mock Token</option><option value="not-applicable">不涉及市场</option></select></label>
          <label>Oracle<select name="oracleMode"><option value="deployed-oracle">已部署 Oracle</option><option value="mock-oracle">Mock Oracle（可控价格）</option><option value="not-applicable">不涉及 Oracle</option></select></label>
          <label>可执行市场<select name="marketCompatibility"><option value="mock-only">仅 Mock Market</option><option value="mock-and-deployed">Mock + 标准 Market</option><option value="deployed-only">仅标准 Market</option><option value="not-applicable">不涉及市场</option></select></label>
          <label>区块时间<select name="timeMode"><option value="normal-block-time">正常区块时间</option><option value="controllable-time">可推进时间 / 挖块</option><option value="not-applicable">不涉及链上时间</option></select></label>
          <label>签名方式<select name="signingMode"><option value="readonly">只读 / 不签名</option><option value="browser-wallet-keeper">浏览器钱包 + Keeper</option><option value="trader-keeper-private-key">Trader / Keeper 测试私钥真实签名</option></select></label>
          <label>Mock 资源别名<input name="mockResourceAlias" value="default-mock" pattern="[a-z0-9][a-z0-9-]{0,47}" placeholder="例如 default-mock / mock-eth"></label>
          <label class="wide">环境初始化与恢复要求<textarea name="environmentSetup" required class="tall"></textarea></label>
          <label class="wide">场景标题<input name="title" required maxlength="300"></label>
          <label class="wide">角色与意图<textarea name="roleIntent" required></textarea></label>
          <label class="wide">前置条件<textarea name="preconditions" required></textarea></label>
          <label class="wide">测试数据<textarea name="testData" required></textarea></label>
          <label class="wide">用户操作步骤<textarea name="steps" required class="tall"></textarea></label>
          <label class="wide">核对数据与期望结果<textarea name="expected" required class="tall"></textarea></label>
          <label class="wide">实际结果 / 恢复清理<textarea name="cleanup" required></textarea></label>
        </div>
        <dl class="source"><dt>原始明细</dt><dd id="case-source"></dd><dt>最后编辑</dt><dd id="case-updated"></dd></dl>
        <div class="editor-actions"><button id="save-case" type="submit">保存修改</button><button id="run-current" type="button">仅执行当前用例</button></div>
      </form>
    </article>
  </section>
  <script id="test-case-data" type="application/json">${payload}</script>`;

  const script = `(async function(){
    'use strict';
    const initial=JSON.parse(document.getElementById('test-case-data').textContent);
    const requestedCaseId=new URLSearchParams(location.search).get('scenario');
    const initialSelectedId=initial.cases.some(function(item){return item.id===requestedCaseId;})?requestedCaseId:(initial.cases[0]&&initial.cases[0].id);
    const state={cases:initial.cases,selectedId:initialSelectedId,editable:false,selectedForRun:new Set()};
    const controls={suite:document.getElementById('case-suite'),project:document.getElementById('case-project'),compatibility:document.getElementById('case-compatibility'),priority:document.getElementById('case-priority'),execution:document.getElementById('case-execution'),status:document.getElementById('case-status'),search:document.getElementById('case-search')};
    const form=document.getElementById('case-editor');const saveButton=document.getElementById('save-case');const saveStatus=document.getElementById('save-status');
    function escapeHtml(value){return String(value==null?'':value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
    function isManual(item){return item.executionMode==='manual';}
    function statuses(item){return item.executions.length?Array.from(new Set(item.executions.map(function(run){return run.status;}))):[isManual(item)?'MANUAL':'NOT_AUTOMATED'];}
    function suiteLabel(item){return item.suite+' · '+item.suiteName;}
    function filtered(){const query=controls.search.value.trim().toLowerCase();return state.cases.filter(function(item){const text=[item.id,item.title,item.targetProject,item.marketMode,item.oracleMode,item.marketCompatibility,item.mockResourceAlias,item.environmentSetup,item.roleIntent,item.preconditions,item.testData,item.steps,item.expected,item.cleanup].join(' ').toLowerCase();return (!controls.suite.value||item.suite===controls.suite.value)&&(!controls.project.value||item.targetProject===controls.project.value)&&(!controls.compatibility.value||item.marketCompatibility===controls.compatibility.value)&&(!controls.priority.value||item.priority===controls.priority.value)&&(!controls.execution.value||item.executionMode===controls.execution.value)&&(!controls.status.value||statuses(item).includes(controls.status.value))&&(!query||text.includes(query));});}
    function renderMetrics(){const edited=state.cases.filter(function(item){return item.edited;}).length;const automated=state.cases.filter(function(item){return item.executions.length;}).length;const manual=state.cases.filter(isManual).length;const dual=state.cases.filter(function(item){return item.marketCompatibility==='mock-and-deployed';}).length;const cards=[['规划用例',state.cases.length],['P0',state.cases.filter(function(item){return item.priority==='P0';}).length],['可切标准 Market',dual],['手工核对',manual],['已有执行结果',automated],['已编辑',edited]];document.getElementById('case-metrics').innerHTML=cards.map(function(card){return '<div class="panel metric"><span>'+escapeHtml(card[0])+'</span><strong>'+card[1]+'</strong></div>';}).join('');}
    function resourceLabel(item){if(item.marketMode==='mock-market')return 'Mock Token / Mock Oracle';if(item.marketMode==='deployed-market')return '已部署 Token / Oracle';return '不涉及';}
    function compatibilityLabel(item){if(item.marketCompatibility==='mock-and-deployed')return 'Mock + 标准 Market';if(item.marketCompatibility==='mock-only')return '仅 Mock Market';if(item.marketCompatibility==='deployed-only')return '仅标准 Market';return '不涉及';}
    function renderSelection(){const count=state.selectedForRun.size;document.getElementById('run-selection-count').textContent='已选择 '+count+' 条';document.getElementById('run-selected').disabled=count===0;const rows=filtered();const selectedVisible=rows.filter(function(item){return state.selectedForRun.has(item.id);}).length;const toggle=document.getElementById('select-visible-toggle');toggle.checked=rows.length>0&&selectedVisible===rows.length;toggle.indeterminate=selectedVisible>0&&selectedVisible<rows.length;}
    function renderRows(){const rows=filtered();document.getElementById('case-count').textContent=rows.length+' 条';document.getElementById('case-rows').innerHTML=rows.map(function(item){return '<tr class="'+(item.id===state.selectedId?'selected':'')+'"><td><input class="case-check" type="checkbox" data-id="'+item.id+'" aria-label="选择 '+item.id+'" '+(state.selectedForRun.has(item.id)?'checked':'')+'></td><td><button type="button" class="row-button" data-id="'+item.id+'">'+item.id+'</button></td><td>'+escapeHtml(suiteLabel(item))+'</td><td>'+item.priority+'</td><td>'+escapeHtml(item.title)+(isManual(item)?'<span class="manual-tag">手工核对</span>':'')+'</td><td><span class="project-chip">'+escapeHtml(item.targetProject)+'</span></td><td>'+escapeHtml(resourceLabel(item))+(item.mockResourceAlias!=='none'?'<small class="resource-alias">'+escapeHtml(item.mockResourceAlias)+'</small>':'')+'</td><td><span class="compatibility compatibility-'+escapeHtml(item.marketCompatibility)+'">'+escapeHtml(compatibilityLabel(item))+'</span></td><td>'+statuses(item).map(function(value){return '<span class="status status-'+value+'">'+value.replace('_',' ')+'</span>';}).join(' ')+'</td><td>'+(item.edited?'<span class="edited">已编辑</span>':'基线')+'</td></tr>';}).join('')||'<tr><td colspan="10" class="empty">无匹配用例</td></tr>';document.querySelectorAll('.row-button').forEach(function(button){button.addEventListener('click',function(){selectCase(button.dataset.id);});});document.querySelectorAll('.case-check').forEach(function(check){check.addEventListener('change',function(){if(check.checked)state.selectedForRun.add(check.dataset.id);else state.selectedForRun.delete(check.dataset.id);renderSelection();});});renderSelection();}
    function field(name){return form.elements.namedItem(name);}
    function selectCase(id){const item=state.cases.find(function(value){return value.id===id;});if(!item)return;state.selectedId=id;['id','suite','priority','executionMode','targetProject','marketMode','oracleMode','marketCompatibility','timeMode','signingMode','mockResourceAlias','environmentSetup','title','roleIntent','preconditions','testData','steps','expected','cleanup'].forEach(function(name){field(name).value=item[name];});document.getElementById('case-source').textContent=item.sourcePath;document.getElementById('case-updated').textContent=item.updatedAt||'未通过页面编辑';saveStatus.textContent='';renderRows();}
    function fillFilters(){const seen=new Map();state.cases.forEach(function(item){seen.set(item.suite,suiteLabel(item));});controls.suite.innerHTML='<option value="">全部</option>'+Array.from(seen.entries()).sort().map(function(entry){return '<option value="'+entry[0]+'">'+escapeHtml(entry[1])+'</option>';}).join('');const projects=['dev-readonly','tx-fork','oracle-fork','time-fork','base-sepolia'];controls.project.innerHTML='<option value="">全部</option>'+projects.map(function(project){return '<option>'+escapeHtml(project)+'</option>';}).join('');}
    async function loadLiveCases(){if(!['http:','https:'].includes(location.protocol))return;const response=await fetch('/api/test-cases',{headers:{Accept:'application/json'}});if(!response.ok)throw new Error('测试用例接口返回 '+response.status);const data=await response.json();state.cases=data.cases;state.editable=true;}
    Object.values(controls).forEach(function(control){control.addEventListener(control.tagName==='INPUT'?'input':'change',renderRows);});
    function goToRun(ids){if(!ids.length)return;location.href='./runs.html?scenarios='+encodeURIComponent(ids.sort().join(','));}
    document.getElementById('select-visible').addEventListener('click',function(){filtered().forEach(function(item){state.selectedForRun.add(item.id);});renderRows();});
    document.getElementById('select-all-cases').addEventListener('click',function(){state.cases.forEach(function(item){state.selectedForRun.add(item.id);});renderRows();});
    document.getElementById('clear-selection').addEventListener('click',function(){state.selectedForRun.clear();renderRows();});
    document.getElementById('select-visible-toggle').addEventListener('change',function(event){filtered().forEach(function(item){if(event.target.checked)state.selectedForRun.add(item.id);else state.selectedForRun.delete(item.id);});renderRows();});
    document.getElementById('run-selected').addEventListener('click',function(){goToRun(Array.from(state.selectedForRun));});
    document.getElementById('run-current').addEventListener('click',function(){if(state.selectedId)goToRun([state.selectedId]);});
    field('marketMode').addEventListener('change',function(){field('mockResourceAlias').value=field('marketMode').value==='mock-market'?'default-mock':'none';});
    form.addEventListener('submit',async function(event){event.preventDefault();if(!state.editable)return;const id=field('id').value;const body={suite:field('suite').value,priority:field('priority').value,executionMode:field('executionMode').value,targetProject:field('targetProject').value,marketMode:field('marketMode').value,oracleMode:field('oracleMode').value,marketCompatibility:field('marketCompatibility').value,timeMode:field('timeMode').value,signingMode:field('signingMode').value,mockResourceAlias:field('mockResourceAlias').value,environmentSetup:field('environmentSetup').value,title:field('title').value,roleIntent:field('roleIntent').value,preconditions:field('preconditions').value,testData:field('testData').value,steps:field('steps').value,expected:field('expected').value,cleanup:field('cleanup').value};saveButton.disabled=true;saveStatus.textContent='保存中…';try{const response=await fetch('/api/test-cases/'+id,{method:'PUT',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.detail||result.error||'保存失败');state.cases=state.cases.map(function(item){return item.id===id?result.case:item;});saveStatus.textContent='已保存 '+new Date(result.case.updatedAt).toLocaleString('zh-CN',{hour12:false});fillFilters();renderMetrics();selectCase(id);}catch(error){saveStatus.textContent='保存失败：'+error.message;}finally{saveButton.disabled=false;}});
    try{await loadLiveCases();document.getElementById('editor-notice').textContent='编辑内容保存到 TestCode/config/test-case-overrides.json；原始场景 Markdown 保持为可追溯基线。';}catch(error){document.getElementById('editor-notice').textContent='当前为只读模式：'+error.message;}
    saveButton.disabled=!state.editable;fillFilters();renderMetrics();renderRows();if(state.selectedId)selectCase(state.selectedId);document.getElementById('test-cases-page').dataset.pageReady='true';
  }());`;

  return renderPageShell({
    title: 'FX100 测试用例库',
    subtitle: '独立查看 80 条用户级场景，规划 Project、Mock 资源和执行环境，关联最近执行结果',
    active: 'test-cases',
    readyId: 'test-cases-page',
    content,
    script,
    extraStyles: `
      .notice { border:1px solid #2d5f8f; background:#10243b; color:#bfdbfe; border-radius:12px; padding:11px 14px; margin-bottom:14px; }
      .metric-grid { display:grid; grid-template-columns:repeat(6,1fr); gap:12px; margin-bottom:14px; } .metric { display:grid; gap:4px; } .metric span { color:var(--muted); font-size:12px; } .metric strong { font-size:25px; }
      .filters { display:grid; grid-template-columns:1fr 1fr 1.2fr .8fr 1fr 1fr 2fr; gap:10px; margin-bottom:14px; }
      .selection-toolbar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:14px}.selection-toolbar>div:first-child{display:grid}.selection-toolbar span{color:var(--muted);font-size:12px}.selection-actions{display:flex;flex-wrap:wrap;gap:7px}.selection-actions button,.editor-actions button{border:1px solid #365274;border-radius:8px;background:#0b2038;color:#cfe4ff;padding:7px 10px;cursor:pointer}.selection-actions button.primary{background:#14569a;border-color:#3978bd;color:white}.selection-actions button:disabled{opacity:.4;cursor:not-allowed}
      label { display:grid; gap:5px; color:var(--muted); font-size:12px; } select,input,textarea { width:100%; border:1px solid var(--line); border-radius:9px; background:#0b1220; color:var(--text); padding:8px 9px; } select,input { min-height:38px; } textarea { min-height:72px; resize:vertical; line-height:1.5; } textarea.tall { min-height:112px; }
      .workspace { display:grid; grid-template-columns:minmax(560px,1.1fr) minmax(480px,.9fr); gap:14px; align-items:start; } .panel-head { display:flex; align-items:baseline; justify-content:space-between; gap:10px; margin-bottom:12px; } h2 { margin:0; font-size:18px; }
      .scroll { overflow:auto; max-height:760px; } table { width:100%; border-collapse:collapse; font-size:12px; } th,td { padding:9px 8px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; } th { color:var(--muted); position:sticky; top:0; background:var(--panel); z-index:1; } tr.selected td { background:#10243b; }
      .row-button { border:0; padding:0; color:#8fc2ff; background:transparent; cursor:pointer; font-weight:700; } .status { display:inline-flex; border:1px solid var(--line); border-radius:999px; padding:2px 6px; white-space:nowrap; font-size:10px; } .status-PASS { color:#36d399; } .status-FAIL { color:#fb7185; } .status-FLAKY { color:#fbbf24; } .status-BLOCKED { color:#a78bfa; } .status-NOT_AUTOMATED,.status-SKIP { color:#94a3b8; } .status-MANUAL { color:#38bdf8; border-color:#2a6f92; } .manual-tag { display:inline-flex; margin-left:6px; border:1px solid #2a6f92; border-radius:999px; padding:1px 6px; color:#38bdf8; font-size:10px; white-space:nowrap; } .edited { color:#fbbf24; }
      .project-chip,.compatibility{display:inline-flex;border:1px solid #3978bd;border-radius:999px;padding:2px 7px;color:#93c5fd;white-space:nowrap}.compatibility-mock-and-deployed{border-color:#2f8f72;color:#6ee7b7}.compatibility-mock-only{border-color:#7c5cb8;color:#c4b5fd}.compatibility-deployed-only{border-color:#64748b;color:#cbd5e1}.resource-alias{display:block;color:#c4b5fd;margin-top:3px}.env-heading{display:flex;align-items:baseline;gap:10px;border-top:1px solid var(--line);padding-top:12px;margin-top:4px}.env-heading span{color:var(--muted);font-size:11px}
      .form-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; } .wide { grid-column:1/-1; } .source { display:grid; grid-template-columns:90px 1fr; gap:6px 10px; margin:14px 0; font-size:12px; } .source dt { color:var(--muted); } .source dd { margin:0; overflow-wrap:anywhere; }
      .editor-actions{display:flex;gap:8px}#save-case { border:1px solid #3978bd; border-radius:9px; background:#14569a; color:white; padding:9px 16px; cursor:pointer; } #save-case:disabled { opacity:.45; cursor:not-allowed; } .save-status { color:#93c5fd; font-size:12px; } .empty { color:var(--muted); }.case-check,#select-visible-toggle{width:auto;min-height:auto;accent-color:#5ea7ff}
      @media(max-width:1150px){.workspace{grid-template-columns:1fr}.filters{grid-template-columns:1fr 1fr}.list-panel .scroll{max-height:520px}}
      @media(max-width:650px){.metric-grid,.filters,.form-grid{grid-template-columns:1fr}.wide{grid-column:auto}.editor-panel,.list-panel{padding:11px}.selection-toolbar{align-items:stretch;flex-direction:column}}
    `,
  });
}

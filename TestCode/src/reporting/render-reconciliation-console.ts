import { escapeHtml, renderPageShell, serializeForHtml } from './render-page-shell.js';
import type { ReconciliationLedger } from './reconciliation-fields.js';

/**
 * 核对数据控制台：字段台账（config/reconciliation-fields.json）的浏览与确认纳入工作流。
 * - 静态页展示重建时的台账快照；经 dashboard:serve 打开时从 /api/reconciliation-fields 刷新，
 *   并可用「纳入核对 / 确认纳入 / 撤回」按钮经 /api/reconciliation-fields/confirm 写回台账。
 * - implemented（已生效）由 seed 脚本按 results.json 覆盖匹配判定，页面不允许手工设置。
 */
export function renderReconciliationConsoleHtml(
  ledger: ReconciliationLedger | null,
  generatedAt: string,
): string {
  const payload = serializeForHtml({ ledger });
  const seededFrom = ledger?.seededFrom;
  const content = `
  <section class="notice">字段台账来自四个权威来源（合约核心公式章节、v0.3.2 参数变化清单、页面断言表、公式配对约定），由 <code>npx tsx scripts/seed-reconciliation-fields.ts</code> 生成并按 <code>artifacts/latest/results.json</code> 的核对行匹配「已生效」。工作流：<strong>未纳入 → 纳入核对（候选）→ 确认纳入 → 已生效</strong>；候选/确认状态经本页写回 <code>config/reconciliation-fields.json</code>，用例代码补上核对行后重跑 seed 自动升级为已生效。</section>
  <section class="meta panel" aria-label="覆盖率统计">
    <div><span>合约侧 已生效 / 总数</span><strong id="coverage-contract">-</strong></div>
    <div><span>前端侧 已生效 / 总数</span><strong id="coverage-frontend">-</strong></div>
    <div><span>配对约定 已生效 / 总数</span><strong id="coverage-pairing">-</strong></div>
    <div><span>总计 已生效 / 总数</span><strong id="coverage-total">-</strong></div>
    <div><span>台账生成</span><strong id="ledger-generated">${escapeHtml(ledger?.generatedAt ?? '未生成')}</strong></div>
    <div><span>覆盖快照（seededFrom）</span><strong id="ledger-seeded">${escapeHtml(seededFrom ? `${seededFrom.resultsPath} · run ${seededFrom.runId || '未知'}` : '-')}</strong></div>
  </section>
  <section class="filters panel" aria-label="台账筛选">
    <label>状态<select id="filter-status"><option value="">全部</option><option value="uncovered">未纳入</option><option value="candidate">候选</option><option value="accepted">已确认纳入</option><option value="implemented">已生效</option></select></label>
    <label>侧别<select id="filter-side"><option value="">全部</option><option value="合约">合约侧</option><option value="前端">前端侧</option><option value="配对">配对约定</option></select></label>
    <label class="search">搜索<input id="filter-search" type="search" placeholder="字段、口径摘要、来源锚点…"></label>
    <span id="write-mode" class="muted write-mode"></span>
  </section>
  <div class="console-columns">
    <section class="panel side-panel" data-side-panel="合约">
      <div class="panel-head"><h2>合约侧</h2><span class="muted" id="count-contract"></span></div>
      <div class="row-list" id="rows-contract"></div>
    </section>
    <div class="right-column">
      <section class="panel side-panel" data-side-panel="前端">
        <div class="panel-head"><h2>前端侧</h2><span class="muted" id="count-frontend"></span></div>
        <div class="row-list" id="rows-frontend"></div>
      </section>
      <section class="panel side-panel" data-side-panel="配对">
        <div class="panel-head"><h2>配对约定</h2><span class="muted" id="count-pairing"></span></div>
        <div class="row-list" id="rows-pairing"></div>
      </section>
    </div>
  </div>
  <section class="footnote panel"><span>页面生成：<strong>${escapeHtml(generatedAt)}</strong></span><span>台账文件：<strong>config/reconciliation-fields.json</strong></span><span>覆盖判定：<strong>seed 依据 results.json 各场景 executionEvidence.reconciliations 模糊匹配</strong></span></section>
  <script id="reconciliation-data" type="application/json">${payload}</script>`;

  const script = `(function(){
    'use strict';
    let ledger=(JSON.parse(document.getElementById('reconciliation-data').textContent).ledger)||null;
    const serverMode=['http:','https:'].includes(location.protocol);
    const statusLabel={uncovered:'未纳入',candidate:'候选',accepted:'已确认纳入',implemented:'已生效'};
    const sideMount={'合约':'rows-contract','前端':'rows-frontend','配对':'rows-pairing'};
    const sideCount={'合约':'count-contract','前端':'count-frontend','配对':'count-pairing'};
    const filters={status:document.getElementById('filter-status'),side:document.getElementById('filter-side'),search:document.getElementById('filter-search')};
    function esc(value){return String(value==null?'':value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
    function badge(status){return '<span class="chip status-chip status-'+esc(status)+'">'+esc(statusLabel[status]||status)+'</span>';}
    function scenarioLink(id){return '<a class="scn-chip" href="./executions.html?scenario='+encodeURIComponent(id)+'">'+esc(id)+'</a>';}
    function coveredBlock(row){
      if(!row.coveredBy||!row.coveredBy.length)return '';
      const items=row.coveredBy.map(function(link){return '<li><a href="./executions.html?scenario='+encodeURIComponent(link.scenarioId)+'">'+esc(link.scenarioId)+'</a> · <code>'+esc(link.rowId)+'</code></li>';}).join('');
      return '<details class="covered"><summary>覆盖核对行 '+row.coveredBy.length+' 处（链接到执行详情）</summary><ul>'+items+'</ul></details>';
    }
    function actionButtons(row){
      if(row.status==='implemented')return '<span class="muted small">已由自动化核对覆盖，无需手工纳入</span>';
      const disabled=serverMode?'':' disabled title="写回需经 npm run dashboard:serve 打开本页"';
      let buttons='';
      if(row.status==='uncovered')buttons='<button type="button" class="row-action" data-action="candidate" data-id="'+esc(row.id)+'"'+disabled+'>纳入核对</button>';
      if(row.status==='candidate')buttons='<button type="button" class="row-action" data-action="accepted" data-id="'+esc(row.id)+'"'+disabled+'>确认纳入</button><button type="button" class="row-action secondary" data-action="uncovered" data-id="'+esc(row.id)+'"'+disabled+'>撤回</button>';
      if(row.status==='accepted')buttons='<button type="button" class="row-action secondary" data-action="uncovered" data-id="'+esc(row.id)+'"'+disabled+'>撤回</button>';
      return buttons;
    }
    function rowCard(row){
      const scenarios=(row.relatedScenarios||[]).map(scenarioLink).join('');
      return '<article class="field-row status-border-'+esc(row.status)+'" data-field-id="'+esc(row.id)+'" data-status="'+esc(row.status)+'" data-side="'+esc(row.side)+'">'
        +'<div class="row-head"><strong class="field-name">'+esc(row.field)+'</strong>'+badge(row.status)+'</div>'
        +(row.formulaDigest?'<p class="digest">'+esc(row.formulaDigest)+'</p>':'<p class="digest muted">（无口径摘要）</p>')
        +'<p class="anchor"><code>'+esc(row.sourceAnchor)+'</code></p>'
        +(scenarios?'<div class="row-links"><span class="muted small">关联 SCN</span>'+scenarios+'</div>':'')
        +coveredBlock(row)
        +(row.note?'<p class="note">'+esc(row.note)+'</p>':'')
        +'<div class="row-actions">'+actionButtons(row)+'<span class="muted small updated">更新 '+esc(row.updatedAt?row.updatedAt.slice(0,19).replace('T',' '):'-')+'</span></div>'
        +'</article>';
    }
    function matches(row){
      if(filters.status.value&&row.status!==filters.status.value)return false;
      if(filters.side.value&&row.side!==filters.side.value)return false;
      const query=filters.search.value.trim().toLowerCase();
      if(query&&!(row.field+' '+row.formulaDigest+' '+row.sourceAnchor+' '+(row.relatedScenarios||[]).join(' ')).toLowerCase().includes(query))return false;
      return true;
    }
    function coverage(rows){const total=rows.length;const implemented=rows.filter(function(row){return row.status==='implemented';}).length;return implemented+' / '+total;}
    function render(){
      const rows=(ledger&&ledger.rows)||[];
      ['合约','前端','配对'].forEach(function(side){
        const sideRows=rows.filter(function(row){return row.side===side;});
        const visible=sideRows.filter(matches);
        document.getElementById(sideCount[side]).textContent='显示 '+visible.length+' / '+sideRows.length+' 行';
        document.getElementById(sideMount[side]).innerHTML=visible.map(rowCard).join('')
          ||(sideRows.length?'<p class="empty">无匹配字段</p>':'<p class="empty">台账为空——先运行 npx tsx scripts/seed-reconciliation-fields.ts 生成字段台账。</p>');
      });
      document.getElementById('coverage-contract').textContent=coverage(rows.filter(function(row){return row.side==='合约';}));
      document.getElementById('coverage-frontend').textContent=coverage(rows.filter(function(row){return row.side==='前端';}));
      document.getElementById('coverage-pairing').textContent=coverage(rows.filter(function(row){return row.side==='配对';}));
      document.getElementById('coverage-total').textContent=coverage(rows);
      if(ledger){document.getElementById('ledger-generated').textContent=ledger.generatedAt||'未知';const seeded=ledger.seededFrom||{};document.getElementById('ledger-seeded').textContent=(seeded.resultsPath||'-')+' · run '+(seeded.runId||'未知');}
      document.getElementById('write-mode').textContent=serverMode?'服务模式：确认纳入 / 撤回会写回 config/reconciliation-fields.json':'静态文件模式：仅浏览；写回需 npm run dashboard:serve';
    }
    async function confirmStatus(button){
      const id=button.dataset.id;const status=button.dataset.action;
      button.disabled=true;
      try{
        const response=await fetch('./api/reconciliation-fields/confirm',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({id:id,status:status})});
        const body=await response.json().catch(function(){return {};});
        if(!response.ok)throw new Error(body.detail||body.error||('接口返回 '+response.status));
        const index=ledger.rows.findIndex(function(row){return row.id===id;});
        if(index>=0&&body.row)ledger.rows[index]=body.row;
        render();
      }catch(error){
        button.disabled=false;
        window.alert('状态写回失败：'+error.message+'\\n（写回需要经 npm run dashboard:serve 打开本页，直接打开 HTML 文件无本机服务。）');
      }
    }
    document.addEventListener('click',function(event){
      const target=event.target;
      if(!(target instanceof Element))return;
      const button=target.closest('button.row-action');
      if(button&&!button.disabled)confirmStatus(button);
    });
    Object.values(filters).forEach(function(control){control.addEventListener(control.tagName==='INPUT'?'input':'change',render);});
    async function refreshFromServer(){
      if(!serverMode)return;
      try{
        const response=await fetch('./api/reconciliation-fields',{headers:{Accept:'application/json'}});
        if(!response.ok)return;
        const body=await response.json();
        if(body&&body.ledger){ledger=body.ledger;render();}
      }catch{ /* 静态快照继续可用 */ }
    }
    render();
    refreshFromServer();
    document.getElementById('reconciliation-console-page').dataset.pageReady='true';
  }());`;

  return renderPageShell({
    title: 'FX100 核对数据控制台',
    subtitle: '核对字段台账：合约侧 / 前端侧 / 配对约定的覆盖状态与确认纳入工作流',
    active: 'reconciliation-console',
    readyId: 'reconciliation-console-page',
    content,
    script,
    extraStyles: `
      .notice { border:1px solid #785d13; background:#2d240e; color:#fde68a; border-radius:12px; padding:11px 14px; margin-bottom:14px; overflow-wrap:anywhere; }
      .notice code { color:#fef3c7; }
      .meta { display:grid; grid-template-columns:repeat(6,minmax(120px,1fr)); gap:12px; margin-bottom:14px; }
      .meta div { display:grid; gap:5px; min-width:0; } .meta span { color:var(--muted); font-size:12px; } .meta strong { word-break:break-word; }
      .filters { display:grid; grid-template-columns:minmax(130px,1fr) minmax(130px,1fr) minmax(220px,2fr) minmax(200px,2fr); gap:10px; align-items:end; margin-bottom:14px; }
      label { display:grid; gap:5px; color:var(--muted); font-size:12px; }
      select,input { width:100%; min-height:38px; border:1px solid var(--line); border-radius:9px; background:#0b1220; color:var(--text); padding:7px 9px; }
      .write-mode { font-size:12px; overflow-wrap:anywhere; }
      .console-columns { display:grid; grid-template-columns:1fr 1fr; gap:14px; align-items:start; }
      .right-column { display:grid; gap:14px; min-width:0; }
      .side-panel { min-width:0; }
      .panel-head { display:flex; align-items:baseline; justify-content:space-between; gap:10px; margin-bottom:12px; } h2 { margin:0; font-size:18px; }
      .row-list { display:grid; gap:10px; }
      .field-row { border:1px solid var(--line); border-radius:10px; background:#0b1220; padding:11px 13px; display:grid; gap:7px; min-width:0; }
      .row-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
      .field-name { overflow-wrap:anywhere; }
      .chip { border-radius:999px; padding:3px 9px; font-size:11px; font-weight:700; white-space:nowrap; border:1px solid var(--line); }
      .status-uncovered { color:#93a4bd; background:#111827; border-color:#334155; }
      .status-candidate { color:#fbbf24; background:#2d240e; border-color:#8b6914; }
      .status-accepted { color:#60a5fa; background:#0e1f3a; border-color:#2f6ca5; }
      .status-implemented { color:#36d399; background:#0b2a1e; border-color:#1d7a5c; }
      .status-border-implemented { border-color:#1d7a5c; }
      .status-border-accepted { border-color:#2f6ca5; }
      .status-border-candidate { border-color:#8b6914; }
      .digest { margin:0; color:#d8e2f0; font-size:12px; overflow-wrap:anywhere; }
      .anchor { margin:0; font-size:11px; } .anchor code { overflow-wrap:anywhere; color:#9fc9ff; }
      .note { margin:0; color:#f8dda0; font-size:11px; overflow-wrap:anywhere; }
      .row-links { display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
      .scn-chip { border:1px solid #3767a2; border-radius:999px; padding:2px 8px; font-size:11px; text-decoration:none; }
      .covered summary { cursor:pointer; color:var(--muted); font-size:11px; }
      .covered ul { margin:6px 0 0; padding-left:18px; font-size:11px; color:var(--muted); display:grid; gap:3px; }
      .covered code { overflow-wrap:anywhere; }
      .row-actions { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
      .row-action { min-height:30px; border:1px solid #3767a2; border-radius:9px; background:#17355f; color:#e7f0ff; padding:4px 12px; cursor:pointer; font-weight:700; font-size:12px; }
      .row-action.secondary { background:#1c2434; border-color:#3b4a63; color:#c7d4e8; }
      .row-action:disabled { opacity:.5; cursor:not-allowed; }
      .small { font-size:11px; }
      .updated { margin-left:auto; }
      .empty { color:var(--muted); margin:0; padding:8px 0; }
      .footnote { display:flex; flex-wrap:wrap; gap:12px 28px; margin-top:14px; color:var(--muted); font-size:12px; } .footnote strong { color:var(--text); overflow-wrap:anywhere; }
      @media(max-width:1100px){ .meta{grid-template-columns:repeat(3,1fr)} .console-columns{grid-template-columns:1fr} }
      @media(max-width:600px){ .meta,.filters{grid-template-columns:1fr} .row-head{flex-wrap:wrap} .updated{margin-left:0} }
    `,
  });
}

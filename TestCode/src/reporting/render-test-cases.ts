import { escapeHtml, renderPageShell, serializeForHtml } from './render-page-shell.js';
import type { TestCaseView } from './test-cases.js';
import type {
  AdmissionView,
  VersionCasesData,
  VersionCasesView,
  VersionFunctionalCase,
} from './version-cases.js';

function admissionChipClass(status: string): string {
  if (/^READY/.test(status)) return 'admission-ready';
  if (/NOT_READY/.test(status)) return 'admission-blocked';
  return 'admission-unknown';
}

// 准入横幅：admission 总开关 + admissionScope 逐项（来源 CURRENT.json，容错读取）。
function renderAdmissionBannerHtml(admission: AdmissionView): string {
  const scopeChips = admission.scope.map((item) =>
    `<span class="admission-chip ${admissionChipClass(item.status)}">${escapeHtml(item.key)}：${escapeHtml(item.status)}</span>`,
  ).join('');
  return `
  <section class="panel admission-banner" id="admission-banner" aria-label="版本准入状态">
    <strong>准入</strong>
    <span class="admission-chip ${admissionChipClass(admission.admission)}">admission（总开关）：${escapeHtml(admission.admission)}</span>
    ${scopeChips || '<span class="admission-chip admission-unknown">admissionScope：未登记</span>'}
    <span class="admission-source">来源：${escapeHtml(admission.source)}</span>
  </section>`;
}

// 共享 SCN 分区仅加这一行：指向当前版本 applicability / expectation-overrides 的来源链接，不展开差异内容。
function renderScnVersionSourcesHtml(data: VersionCasesData): string {
  const view = data.versions.find((item) => item.release === data.defaultRelease);
  const body = view
    ? `共享场景用例在当前版本（${escapeHtml(view.release)}）的适用性与期望差异见来源：`
      + `<a href="../../../${escapeHtml(view.applicabilityPath)}">applicability.md</a> · `
      + `<a href="../../../${escapeHtml(view.overridesPath)}">expectation-overrides.md</a>（仅来源链接，不展开）。`
    : `共享场景用例的版本适用性来源缺失：${escapeHtml(data.noVersionsReason ?? '未找到版本目录。')}`;
  return `
  <section class="scn-version-sources" id="scn-version-sources">${body}</section>`;
}

function renderVersionCaseRowHtml(item: VersionFunctionalCase, section: string): string {
  const layerCell = (role: string, status: string): string =>
    `<td><span class="layer layer-${escapeHtml(status)}" data-layer="${role}">${escapeHtml(status)}</span></td>`;
  const detailField = (label: string, value: string, className = ''): string =>
    `<article${className ? ` class="${className}"` : ''}><h4>${label}</h4><p>${escapeHtml(value || '—')}</p></article>`;
  const row = `<tr class="vc-row" data-kind="${item.kind}" data-id="${escapeHtml(item.id)}"`
    + ` data-section="${escapeHtml(section)}" data-priority="${escapeHtml(item.priority)}"`
    + ` data-entry="${escapeHtml(item.entry)}" data-trader="${escapeHtml(item.trader)}"`
    + ` data-c="${escapeHtml(item.layers.contract)}" data-f="${escapeHtml(item.layers.frontend)}" data-x="${escapeHtml(item.layers.parity)}">`
    + `<td class="vc-check-cell"><input type="checkbox" class="vc-check" data-id="${escapeHtml(item.id)}" aria-label="选择 ${escapeHtml(item.id)}"></td>`
    + `<td class="vc-id">${escapeHtml(item.id)}</td>`
    + `<td class="vc-p">${escapeHtml(item.priority)}</td>`
    + `<td class="vc-title">${escapeHtml(item.title)}</td>`
    + `<td class="vc-entry">${escapeHtml(item.entry)}<small>${escapeHtml(item.layer)}</small></td>`
    + `<td class="vc-trader">${escapeHtml(item.trader)}</td>`
    + layerCell('c', item.layers.contract)
    + layerCell('f', item.layers.frontend)
    + layerCell('x', item.layers.parity)
    + `<td class="vc-act"><button type="button" class="vc-detail-toggle" data-id="${escapeHtml(item.id)}" aria-expanded="false">详情</button><button type="button" class="vc-record" data-id="${escapeHtml(item.id)}" disabled title="需通过 npm run dashboard:serve 打开本页">记录结果</button></td>`
    + '</tr>';
  const detail = `<tr class="vc-detail-row" data-detail-for="${escapeHtml(item.id)}" hidden><td colspan="10">`
    + `<section class="vc-case-detail" aria-label="${escapeHtml(item.id)} 完整测试用例">`
    + `<header><div><span>${escapeHtml(item.id)} · ${escapeHtml(item.priority)}</span><h3>${escapeHtml(item.title)}</h3></div>`
    + `<div class="vc-detail-meta"><span>层：${escapeHtml(item.layer)}</span><span>入口：${escapeHtml(item.entry)}</span><span>Trader / 地址：${escapeHtml(item.trader)}</span></div></header>`
    + `<div class="vc-detail-grid">${detailField('前置条件', item.preconditions)}${detailField('测试数据', item.testData)}`
    + `${detailField('操作步骤', item.steps)}${detailField('核对数据', item.checks)}`
    + `${detailField('期望结果', item.expected, 'expected')}${detailField('设计方法 / 依据', item.designBasis)}</div>`
    + '</section></td></tr>';
  return row + detail;
}

function renderVersionBlockHtml(view: VersionCasesView, hidden: boolean): string {
  const body = view.hasMatrix
    ? `<p class="vc-block-note">数据源：<code>${escapeHtml(view.matrixPath)}</code> · 执行状态：<code>${escapeHtml(view.resultsPath)}</code>（无记录 = NOT_RUN；FT 未走页面时前端层 = GAP）· 带地址列（A/B 节）${view.coreCount} 条 + 其余节 ${view.otherCount} 条</p>`
      + view.sections.map((section) =>
        `<h3 class="vc-section-head" data-section="${escapeHtml(section.name)}">${escapeHtml(section.name)}</h3>`
        + `<div class="scroll vc-section-scroll" data-section="${escapeHtml(section.name)}"><table class="vc-table"><thead><tr><th class="vc-check-cell"><span class="visually-hidden">选择</span></th><th>ID</th><th>P</th><th>标题</th><th>本轮入口</th><th>Trader / 地址</th><th>合约层</th><th>前端层</th><th>交叉一致</th><th>操作</th></tr></thead><tbody>`
        + section.cases.map((item) => renderVersionCaseRowHtml(item, section.name)).join('')
        + '</tbody></table></div>',
      ).join('')
    : `<p class="vc-empty">${escapeHtml(view.emptyReason ?? '该版本暂无版本级功能用例。')}</p>`;
  return `<div class="version-case-block" data-release="${escapeHtml(view.release)}"${hidden ? ' hidden' : ''}>${body}</div>`;
}

// 抽屉内「链上核对」块：tx hash → POST /api/verify-tx 渲染分层结论 → POST /api/manual-runs/attach 回填证据与合约层结果。
// 放在 <form id="vc-drawer-form"> 之外：块内输入回车不会触发保存表单的隐式提交。
function renderTxVerifyBlockHtml(): string {
  const overrideField = (key: string, label: string, hint: string, wide = false): string =>
    `<label${wide ? ' class="vc-wide"' : ''}>${label}<input id="vc-tx-ov-${key}" data-override="${key}" autocomplete="off" spellcheck="false" placeholder="登记值">`
    + `<small class="vc-tx-default" data-default-for="${key}">${hint}</small></label>`;
  return `
      <details class="vc-tx-verify" id="vc-tx-verify" open>
        <summary><strong>链上核对</strong><span class="vc-tx-badge" id="vc-tx-verdict" hidden></span><span class="muted" id="vc-tx-mode"></span></summary>
        <div class="vc-tx-grid">
          <label>环境<select id="vc-tx-env"><option value="">加载中…</option></select></label>
          <label class="vc-wide">tx hash（每行一个）<textarea id="vc-tx-hashes" spellcheck="false" placeholder="0x… 按链上顺序每行一个（如 下单 / Keeper 执行 / 平仓 / Keeper 执行）"></textarea></label>
        </div>
        <details class="vc-tx-overrides" id="vc-tx-overrides">
          <summary>元数据覆盖（留空 = 登记默认值）</summary>
          <div class="vc-tx-grid">
            ${overrideField('contractVersion', '合约版本', '留空 = 登记值')}
            ${overrideField('contractHead', '合约 head', '留空 = 登记值')}
            ${overrideField('frontendHead', '前端 head', '留空 = 登记值')}
            ${overrideField('executedAt', '执行时间（ISO）', '留空 = 登记值')}
            ${overrideField('note', '备注', '可选；随元数据写入证据', true)}
          </div>
        </details>
        <div class="vc-drawer-actions vc-tx-actions">
          <button type="button" id="vc-tx-run" disabled>核对</button>
          <button type="button" id="vc-tx-attach" disabled>回填</button>
          <span class="save-status" id="vc-tx-status"></span>
        </div>
        <div class="vc-tx-result" id="vc-tx-result" hidden></div>
      </details>`;
}

// 手工测试工作台侧边抽屉 + 逐条引导模式（放在 #version-cases 外，功能用例分区文本保持只含矩阵内容）。
function renderVersionDrawerHtml(): string {
  const statusSelect = (id: string, label: string): string =>
    `<label>${label}<select id="${id}"><option>NOT_RUN</option><option>PASS</option><option>FAIL</option><option>BLOCKED</option><option>GAP</option></select></label>`;
  return `
  <aside class="panel vc-drawer" id="vc-drawer" hidden aria-label="记录功能用例结果">
    <div class="vc-drawer-head">
      <h2 id="vc-drawer-title">记录结果</h2>
      <div class="vc-guide-nav" id="vc-guide-nav" hidden>
        <span id="vc-guide-progress"></span>
        <button type="button" id="vc-guide-prev">上一条</button>
        <button type="button" id="vc-guide-skip">跳过</button>
        <button type="button" id="vc-guide-next">下一条</button>
      </div>
      <button type="button" id="vc-drawer-close" aria-label="关闭">×</button>
    </div>
    <div class="vc-drawer-body" id="vc-drawer-main">
      <dl class="vc-readonly">
        <dt>ID</dt><dd id="vc-r-id"></dd>
        <dt>优先级</dt><dd id="vc-r-priority"></dd>
        <dt>标题</dt><dd id="vc-r-title"></dd>
        <dt>本轮入口</dt><dd id="vc-r-entry"></dd>
        <dt>Trader / 地址</dt><dd id="vc-r-trader"></dd>
        <dt>当前状态</dt><dd id="vc-r-status"></dd>
      </dl>
      <p class="vc-admission-hint" id="vc-admission-hint" hidden></p>${renderTxVerifyBlockHtml()}
      <form id="vc-drawer-form">
        <div class="vc-form-grid">
          ${statusSelect('vc-f-contract', '合约层')}
          ${statusSelect('vc-f-frontend', '前端层')}
          <label>交叉一致<select id="vc-f-cross"><option>—</option><option>NOT_RUN</option><option>PASS</option><option>FAIL</option><option>BLOCKED</option><option>GAP</option></select></label>
          <label>数据集（可选）<input id="vc-f-dataset" maxlength="60" placeholder="如 组A"></label>
          <label class="vc-wide">实际结果<textarea id="vc-f-actual" required maxlength="2000" placeholder="关键读数 / 差分 / 结论"></textarea></label>
          <label class="vc-wide">证据链接（每行一条，工作区相对路径）<textarea id="vc-f-evidence" required placeholder="TestCase/E2E/manual-runs/…"></textarea></label>
          <label>执行人<input id="vc-f-executor" required maxlength="60"></label>
          <label>日期（自动）<input id="vc-f-date" readonly></label>
        </div>
        <div class="vc-drawer-actions">
          <button type="submit" id="vc-drawer-save">保存并追加到 results.md</button>
          <span id="vc-drawer-status" class="save-status"></span>
        </div>
      </form>
    </div>
    <div class="vc-drawer-body" id="vc-guide-end" hidden>
      <h3>批次执行完成</h3>
      <p id="vc-guide-stats"></p>
      <div class="vc-drawer-actions">
        <button type="button" id="vc-guide-archive">归档 ROUND 小结</button>
        <button type="button" id="vc-guide-finish">完成并关闭</button>
        <span id="vc-guide-archive-status" class="save-status"></span>
      </div>
    </div>
  </aside>`;
}

// 版本功能用例分区（CT/XT/FT）：与共享 SCN 分区分开展示，按矩阵节分组；本分区不出现任何 SCN 编号。
function renderVersionCasesSectionHtml(data: VersionCasesData): string {
  const picker = data.releases.length > 0
    ? `<label class="vc-release-picker">版本<select id="version-case-release">${data.releases.map((release) =>
      `<option${release === data.defaultRelease ? ' selected' : ''}>${escapeHtml(release)}</option>`,
    ).join('')}</select></label>`
    : '';
  const blockedBadge = data.admission.txForkContractReady
    ? ''
    : '<span class="vc-blocked" id="version-cases-blocked">当前环境不可开跑（tx-fork:contract 非 READY）</span>';
  const blocks = data.versions.length > 0
    ? data.versions.map((view) => renderVersionBlockHtml(view, view.release !== data.defaultRelease)).join('')
    : `<p class="vc-empty">${escapeHtml(data.noVersionsReason ?? '暂无版本级功能用例。')}</p>`;
  return `
  <section class="panel version-cases" id="version-cases" aria-label="版本功能用例">
    <div class="panel-head"><h2>版本功能用例（CT / XT / FT）</h2>${blockedBadge}${picker}</div>
    <div class="vc-filters" id="vc-filters" aria-label="功能用例筛选">
      <label>状态<select id="vc-filter-status"><option value="">全部</option><option>NOT_RUN</option><option>PASS</option><option>FAIL</option><option>BLOCKED</option><option>GAP</option></select></label>
      <label>层<select id="vc-filter-layer"><option value="">任一层</option><option value="c">合约层</option><option value="f">前端层</option><option value="x">交叉一致</option></select></label>
      <label>优先级<select id="vc-filter-priority"><option value="">全部</option><option>P0</option><option>P1</option><option>P2</option></select></label>
      <label>节<select id="vc-filter-section"><option value="">全部</option></select></label>
      <label>入口<select id="vc-filter-entry"><option value="">全部</option></select></label>
      <label>Trader<input id="vc-filter-trader" type="search" placeholder="地址 / 编号"></label>
      <label>关键字<input id="vc-filter-search" type="search" placeholder="ID、标题……"></label>
      <div class="vc-filter-actions"><button type="button" id="vc-filter-pending">只看待执行</button><button type="button" id="vc-filter-reset">清除筛选</button><span class="muted" id="vc-filter-count"></span></div>
    </div>
    <div class="vc-batch-bar" id="vc-batch-bar">
      <strong id="vc-selected-count">已选 0 条</strong>
      <button type="button" id="vc-select-visible-cases">选择当前筛选</button>
      <button type="button" id="vc-clear-selected">清空</button>
      <button type="button" id="vc-run-selected" class="primary" disabled>自动化执行（0 条）</button>
      <button type="button" id="vc-start-batch" class="primary" disabled>手工执行（0 条）</button>
      <span class="muted" id="vc-manual-hint"></span>
    </div>
    <div class="vc-batch-setup" id="vc-batch-setup" hidden>
      <label>批次名<input id="vc-batch-name" maxlength="40" placeholder="如 功能回归-合约层"></label>
      <label>执行人<input id="vc-batch-executor" maxlength="60"></label>
      <button type="button" id="vc-batch-create">创建批次并开始</button>
      <button type="button" id="vc-batch-cancel">取消</button>
      <span class="save-status" id="vc-batch-status"></span>
    </div>
    <div id="version-case-blocks">${blocks}</div>
  </section>`;
}

export function renderTestCasesHtml(
  cases: TestCaseView[],
  generatedAt: string,
  versionCases: VersionCasesData,
  automatedFunctionalCaseIds: readonly string[] = [],
): string {
  const payload = serializeForHtml({ cases, generatedAt });
  const versionPayload = serializeForHtml({
    defaultRelease: versionCases.defaultRelease,
    automatedCaseIds: automatedFunctionalCaseIds,
    releases: versionCases.releases,
    admission: versionCases.admission,
    versions: versionCases.versions.map((view) => ({
      release: view.release,
      hasMatrix: view.hasMatrix,
      coreCount: view.coreCount,
      otherCount: view.otherCount,
      parseIssues: view.parseIssues,
      statusCounts: view.sections.flatMap((section) => section.cases).reduce<Record<string, Record<string, number>>>(
        (acc, item) => {
          for (const [layer, status] of Object.entries(item.layers)) {
            acc[layer] = acc[layer] ?? {};
            acc[layer][status] = (acc[layer][status] ?? 0) + 1;
          }
          return acc;
        },
        {},
      ),
    })),
    ...(versionCases.noVersionsReason ? { noVersionsReason: versionCases.noVersionsReason } : {}),
  });
  const defaultVersionView = versionCases.versions.find((view) => view.release === versionCases.defaultRelease);
  const functionalCaseCount = defaultVersionView ? defaultVersionView.coreCount + defaultVersionView.otherCount : 0;
  const content = `
  <section class="notice" id="editor-notice">通过 Node 看板服务打开时可编辑；直接打开离线 HTML 时为只读模式。</section>
  <nav class="case-tabs" role="tablist" aria-label="测试用例类型">
    <button type="button" role="tab" id="case-tab-scenario" data-case-tab="scenario" aria-controls="case-panel-scenario" aria-selected="true">Scenario <span>${cases.length}</span></button>
    <button type="button" role="tab" id="case-tab-functional" data-case-tab="functional" aria-controls="case-panel-functional" aria-selected="false">功能用例 <span>${functionalCaseCount}</span></button>
  </nav>
  <section class="case-tab-panel" id="case-panel-scenario" role="tabpanel" aria-labelledby="case-tab-scenario">${renderScnVersionSourcesHtml(versionCases)}
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
  </section>
  <section class="case-tab-panel" id="case-panel-functional" role="tabpanel" aria-labelledby="case-tab-functional" hidden>
    ${renderAdmissionBannerHtml(versionCases.admission)}${renderVersionCasesSectionHtml(versionCases)}${renderVersionDrawerHtml()}
  </section>
  <script id="test-case-data" type="application/json">${payload}</script>
  <script id="version-case-data" type="application/json">${versionPayload}</script>`;

  const script = `(async function(){
    'use strict';
    const initial=JSON.parse(document.getElementById('test-case-data').textContent);
    const requestedCaseId=new URLSearchParams(location.search).get('scenario');
    const initialSelectedId=initial.cases.some(function(item){return item.id===requestedCaseId;})?requestedCaseId:(initial.cases[0]&&initial.cases[0].id);
    const state={cases:initial.cases,selectedId:initialSelectedId,editable:false,selectedForRun:new Set()};
    const controls={suite:document.getElementById('case-suite'),project:document.getElementById('case-project'),compatibility:document.getElementById('case-compatibility'),priority:document.getElementById('case-priority'),execution:document.getElementById('case-execution'),status:document.getElementById('case-status'),search:document.getElementById('case-search')};
    const form=document.getElementById('case-editor');const saveButton=document.getElementById('save-case');const saveStatus=document.getElementById('save-status');
    const tabButtons=Array.prototype.slice.call(document.querySelectorAll('[data-case-tab]'));
    const tabPanels={scenario:document.getElementById('case-panel-scenario'),functional:document.getElementById('case-panel-functional')};
    function setCaseTab(name,updateUrl){if(!tabPanels[name])name='scenario';tabButtons.forEach(function(button){var active=button.dataset.caseTab===name;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;});Object.keys(tabPanels).forEach(function(key){tabPanels[key].hidden=key!==name;});if(updateUrl&&history.replaceState){var url=new URL(location.href);if(name==='scenario')url.searchParams.delete('tab');else url.searchParams.set('tab',name);history.replaceState(null,'',url.pathname+url.search+url.hash);}}
    tabButtons.forEach(function(button,index){button.addEventListener('click',function(){setCaseTab(button.dataset.caseTab,true);});button.addEventListener('keydown',function(event){if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;event.preventDefault();var next=(index+(event.key==='ArrowRight'?1:-1)+tabButtons.length)%tabButtons.length;tabButtons[next].focus();setCaseTab(tabButtons[next].dataset.caseTab,true);});});
    setCaseTab(requestedCaseId&&/^SCN-\\d{3}$/.test(requestedCaseId)?'scenario':(new URLSearchParams(location.search).get('tab')||(requestedCaseId?'functional':'scenario')),false);
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
    // —— 版本功能用例分区：手工测试工作台（筛选 / 记录结果抽屉 / 手工批次逐条引导） ——
    async function initVersionCases(){
      var section=document.getElementById('version-cases');if(!section)return;
      var vcData=JSON.parse(document.getElementById('version-case-data').textContent);
      var releaseSelect=document.getElementById('version-case-release');
      var requestedRelease=new URLSearchParams(location.search).get('release');
      if(releaseSelect&&requestedRelease&&Array.prototype.some.call(releaseSelect.options,function(option){return option.value===requestedRelease;})){releaseSelect.value=requestedRelease;document.querySelectorAll('.version-case-block').forEach(function(block){block.hidden=block.getAttribute('data-release')!==requestedRelease;});}
      var drawer=document.getElementById('vc-drawer');
      var FILTER_KEY='fx100.vc.filters';var EXECUTOR_KEY='fx100.vc.executor';
      var automatedCaseIds=new Set(vcData.automatedCaseIds||[]);
      var live=false;var deployLabel='待确认';var activeRow=null;
      var guide={active:false,batchId:'',ids:[],index:0,saved:0,skipped:0,executor:''};
      var controls={status:document.getElementById('vc-filter-status'),layer:document.getElementById('vc-filter-layer'),priority:document.getElementById('vc-filter-priority'),section:document.getElementById('vc-filter-section'),entry:document.getElementById('vc-filter-entry'),trader:document.getElementById('vc-filter-trader'),search:document.getElementById('vc-filter-search')};
      var fields={contract:document.getElementById('vc-f-contract'),frontend:document.getElementById('vc-f-frontend'),cross:document.getElementById('vc-f-cross'),dataset:document.getElementById('vc-f-dataset'),actual:document.getElementById('vc-f-actual'),evidence:document.getElementById('vc-f-evidence'),executor:document.getElementById('vc-f-executor'),date:document.getElementById('vc-f-date')};
      function currentRelease(){return releaseSelect?releaseSelect.value:(vcData.defaultRelease||'');}
      function visibleBlock(){return document.querySelector('.version-case-block:not([hidden])');}
      function allRows(){var block=visibleBlock();return block?Array.prototype.slice.call(block.querySelectorAll('tr.vc-row')):[];}
      function rowById(id){var rows=allRows();for(var i=0;i<rows.length;i++){if(rows[i].dataset.id===id)return rows[i];}return null;}
      function scopeStatus(key){var scope=(vcData.admission&&vcData.admission.scope)||[];for(var i=0;i<scope.length;i++){if(scope[i].key===key)return scope[i].status;}return '未登记';}
      function layerReady(layer){return /^READY/.test(scopeStatus(layer==='contract'?'tx-fork:contract':'tx-fork:frontend'));}
      function todayText(){var now=new Date();return now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');}
      // —— 筛选（组合条件存 localStorage，读写都 try/catch） ——
      function filterState(){return {status:controls.status.value,layer:controls.layer.value,priority:controls.priority.value,section:controls.section.value,entry:controls.entry.value,trader:controls.trader.value,search:controls.search.value};}
      function persistFilters(){try{localStorage.setItem(FILTER_KEY,JSON.stringify(filterState()));}catch(error){}}
      function restoreFilters(){try{var raw=localStorage.getItem(FILTER_KEY);if(!raw)return;var saved=JSON.parse(raw);['status','layer','priority','section','entry','trader','search'].forEach(function(key){if(typeof saved[key]==='string')controls[key].value=saved[key];});}catch(error){}}
      function populateOptions(){var sections=[];var entries=[];allRows().forEach(function(row){if(sections.indexOf(row.dataset.section)<0)sections.push(row.dataset.section);if(entries.indexOf(row.dataset.entry)<0)entries.push(row.dataset.entry);});
        var keepSection=controls.section.value;controls.section.innerHTML='<option value="">全部</option>'+sections.map(function(name){return '<option>'+escapeHtml(name)+'</option>';}).join('');controls.section.value=sections.indexOf(keepSection)>=0?keepSection:'';
        var keepEntry=controls.entry.value;controls.entry.innerHTML='<option value="">全部</option>'+entries.map(function(name){return '<option>'+escapeHtml(name)+'</option>';}).join('');controls.entry.value=entries.indexOf(keepEntry)>=0?keepEntry:'';}
      function rowMatches(row,f){var byLayer=f.layer==='c'?row.dataset.c:f.layer==='f'?row.dataset.f:f.layer==='x'?row.dataset.x:'';
        var okStatus=!f.status||(f.layer?byLayer===f.status:[row.dataset.c,row.dataset.f,row.dataset.x].indexOf(f.status)>=0);
        var okPriority=!f.priority||row.dataset.priority===f.priority;
        var okSection=!f.section||row.dataset.section===f.section;
        var okEntry=!f.entry||row.dataset.entry===f.entry;
        var okTrader=!f.trader||(row.dataset.trader||'').toLowerCase().indexOf(f.trader.toLowerCase())>=0;
        var detail=row.nextElementSibling&&row.nextElementSibling.classList.contains('vc-detail-row')?row.nextElementSibling:null;
        var searchable=(row.textContent||'')+' '+(detail?detail.textContent||'':'');
        var okSearch=!f.search||searchable.toLowerCase().indexOf(f.search.toLowerCase())>=0;
        return okStatus&&okPriority&&okSection&&okEntry&&okTrader&&okSearch;}
      function applyFilters(){var f=filterState();var rows=allRows();var shown=0;rows.forEach(function(row){var ok=rowMatches(row,f);row.hidden=!ok;if(!ok){var detail=row.nextElementSibling;if(detail&&detail.classList.contains('vc-detail-row'))detail.hidden=true;var button=row.querySelector('.vc-detail-toggle');if(button)button.setAttribute('aria-expanded','false');}if(ok)shown++;});
        var block=visibleBlock();if(block){var heads=block.querySelectorAll('.vc-section-head');var wraps=block.querySelectorAll('.vc-section-scroll');for(var i=0;i<wraps.length;i++){var any=wraps[i].querySelector('tr.vc-row:not([hidden])');wraps[i].hidden=!any;if(heads[i])heads[i].hidden=!any;}}
        var counter=document.getElementById('vc-filter-count');if(counter)counter.textContent='匹配 '+shown+' / '+rows.length+' 条';
        persistFilters();updateSelectedCount();}
      Object.keys(controls).forEach(function(key){var control=controls[key];control.addEventListener(control.tagName==='INPUT'?'input':'change',applyFilters);});
      document.getElementById('vc-filter-pending').addEventListener('click',function(){controls.status.value='NOT_RUN';controls.layer.value='';applyFilters();});
      document.getElementById('vc-filter-reset').addEventListener('click',function(){Object.keys(controls).forEach(function(key){controls[key].value='';});applyFilters();});
      // —— 选择与批次 ——
      function selectedIds(){var ids=[];allRows().forEach(function(row){var check=row.querySelector('.vc-check');if(check&&check.checked)ids.push(row.dataset.id);});return ids;}
      function automatedSelectedIds(){return selectedIds().filter(function(id){return automatedCaseIds.has(id);});}
      function updateSelectedCount(){var count=selectedIds().length;var automatedCount=automatedSelectedIds().length;document.getElementById('vc-selected-count').textContent='已选 '+count+' 条 · 可自动化 '+automatedCount+' 条';var runButton=document.getElementById('vc-run-selected');runButton.textContent='自动化执行（'+automatedCount+' 条）';runButton.disabled=automatedCount===0;var startButton=document.getElementById('vc-start-batch');startButton.textContent='手工执行（'+count+' 条）';startButton.disabled=!live||count===0;}
      section.addEventListener('change',function(event){if(event.target&&event.target.classList&&event.target.classList.contains('vc-check'))updateSelectedCount();});
      document.getElementById('vc-select-visible-cases').addEventListener('click',function(){allRows().forEach(function(row){if(!row.hidden){var check=row.querySelector('.vc-check');if(check)check.checked=true;}});updateSelectedCount();});
      document.getElementById('vc-clear-selected').addEventListener('click',function(){allRows().forEach(function(row){var check=row.querySelector('.vc-check');if(check)check.checked=false;});updateSelectedCount();});
      document.getElementById('vc-run-selected').addEventListener('click',function(){var ids=automatedSelectedIds();if(!ids.length)return;var query=new URLSearchParams();query.set('cases',ids.sort().join(','));query.set('release',currentRelease());location.href='./runs.html?'+query.toString();});
      // —— 抽屉 ——
      var statusText=document.getElementById('vc-drawer-status');
      function setStatusOptionGuards(select,layer){Array.prototype.forEach.call(select.options,function(option){if(option.value==='PASS'||option.value==='FAIL'){var ready=layerReady(layer);option.disabled=!ready;option.title=ready?'':'admissionScope['+(layer==='contract'?'tx-fork:contract':'tx-fork:frontend')+'] 非 READY_FOR_SYSTEM_TEST，只能记 BLOCKED / NOT_RUN';}});}
      function setBadge(row,role,status){if(!status)return;row.dataset[role]=status;var span=row.querySelector('span[data-layer="'+role+'"]');if(span){span.textContent=status;span.className='layer layer-'+(status==='—'?'NONE':status);}}
      function openDrawer(row){activeRow=row;
        document.getElementById('vc-r-id').textContent=row.dataset.id;
        document.getElementById('vc-r-priority').textContent=row.dataset.priority;
        document.getElementById('vc-r-title').textContent=(row.querySelector('.vc-title')||{}).textContent||'';
        document.getElementById('vc-r-entry').textContent=row.dataset.entry;
        document.getElementById('vc-r-trader').textContent=row.dataset.trader;
        document.getElementById('vc-r-status').textContent='合约层 '+row.dataset.c+' · 前端层 '+row.dataset.f+' · 交叉一致 '+row.dataset.x;
        function preset(select,value){var has=false;Array.prototype.forEach.call(select.options,function(option){if(option.value===value)has=true;});select.value=has?value:'NOT_RUN';}
        preset(fields.contract,row.dataset.c);preset(fields.frontend,row.dataset.f);
        var pageEntry=(row.dataset.entry||'').indexOf('页面')>=0;
        fields.cross.disabled=!pageEntry;fields.cross.title=pageEntry?'':'交叉一致仅页面入口判，RPC 入口固定为 —';
        if(pageEntry){preset(fields.cross,row.dataset.x==='—'?'—':row.dataset.x);}else{fields.cross.value='—';}
        setStatusOptionGuards(fields.contract,'contract');setStatusOptionGuards(fields.frontend,'frontend');setStatusOptionGuards(fields.cross,'frontend');
        var hints=[];if(!layerReady('contract'))hints.push('tx-fork:contract='+scopeStatus('tx-fork:contract'));if(!layerReady('frontend'))hints.push('tx-fork:frontend='+scopeStatus('tx-fork:frontend'));
        var hint=document.getElementById('vc-admission-hint');hint.hidden=hints.length===0;hint.textContent=hints.length?('admission 门槛：'+hints.join('；')+' —— 对应层 PASS / FAIL 已禁用，只能记 BLOCKED / NOT_RUN。'):'';
        fields.dataset.value='';fields.actual.value='';
        fields.evidence.value=guide.active&&guide.batchId?('TestCase/E2E/manual-runs/'+guide.batchId+'/'):'';
        var storedExecutor='';try{storedExecutor=localStorage.getItem(EXECUTOR_KEY)||'';}catch(error){}
        fields.executor.value=guide.executor||storedExecutor;
        fields.date.value=todayText();
        statusText.textContent='';
        var nav=document.getElementById('vc-guide-nav');nav.hidden=!guide.active;
        if(guide.active)document.getElementById('vc-guide-progress').textContent='第 '+(guide.index+1)+' / '+guide.ids.length+' 条';
        document.getElementById('vc-drawer-main').hidden=false;document.getElementById('vc-guide-end').hidden=true;
        resetTxVerify();
        drawer.hidden=false;}
      function closeDrawer(){drawer.hidden=true;activeRow=null;guide.active=false;document.getElementById('vc-guide-nav').hidden=true;}
      document.getElementById('vc-drawer-close').addEventListener('click',closeDrawer);
      section.addEventListener('click',function(event){var target=event.target;
        var detailButton=target&&target.closest?target.closest('.vc-detail-toggle'):null;
        if(detailButton){var detailRow=detailButton.closest('tr.vc-row');var detail=detailRow&&detailRow.nextElementSibling;if(detail&&detail.classList.contains('vc-detail-row')){var willOpen=detail.hidden;allRows().forEach(function(row){var candidate=row.nextElementSibling;if(candidate&&candidate.classList.contains('vc-detail-row'))candidate.hidden=true;var toggle=row.querySelector('.vc-detail-toggle');if(toggle)toggle.setAttribute('aria-expanded','false');});detail.hidden=!willOpen;detailButton.setAttribute('aria-expanded',String(willOpen));if(willOpen&&history.replaceState){var url=new URL(location.href);url.searchParams.set('tab','functional');url.searchParams.set('scenario',detailRow.dataset.id);url.searchParams.set('release',currentRelease());history.replaceState(null,'',url.pathname+url.search+url.hash);}}return;}
        var button=target&&target.closest?target.closest('.vc-record'):null;if(!button||button.disabled)return;guide.active=false;var row=button.closest('tr.vc-row');if(row)openDrawer(row);});
      async function refreshRelease(){if(!live)return;try{var response=await fetch('/api/version-results?release='+encodeURIComponent(currentRelease()),{headers:{Accept:'application/json'}});if(!response.ok)return;var data=await response.json();if(data.available===false)return;deployLabel=data.deploy||deployLabel;var latest={};(data.rows||[]).forEach(function(row){latest[row.caseId]=row;});
        allRows().forEach(function(row){var record=latest[row.dataset.id];if(!record)return;setBadge(row,'c',record.contract);setBadge(row,'f',record.frontend);setBadge(row,'x',record.cross);});applyFilters();}catch(error){}}
      document.getElementById('vc-drawer-form').addEventListener('submit',async function(event){event.preventDefault();if(!live||!activeRow)return;
        var saveButton2=document.getElementById('vc-drawer-save');
        var evidence=fields.evidence.value.split('\\n').map(function(line){return line.trim();}).filter(function(line){return line.length>0;});
        var row={id:activeRow.dataset.id,entry:activeRow.dataset.entry||'',layers:{contract:fields.contract.value,frontend:fields.frontend.value,cross:fields.cross.disabled?'—':fields.cross.value},actualResult:fields.actual.value,evidence:evidence,executor:fields.executor.value};
        if(fields.dataset.value.trim())row.dataset=fields.dataset.value.trim();
        saveButton2.disabled=true;statusText.textContent='写回中…';
        try{var response=await fetch('/api/version-results/append',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({release:currentRelease(),rows:[row]})});
          var result=await response.json();if(!response.ok)throw new Error(result.detail||result.error||('HTTP '+response.status));
          try{localStorage.setItem(EXECUTOR_KEY,fields.executor.value);}catch(error){}
          await refreshRelease();
          statusText.textContent='已追加：'+result.deploy+' · '+result.date;
          if(guide.active){guide.saved++;openGuideAt(guide.index+1);}
        }catch(error){statusText.textContent='写回失败：'+error.message;}
        finally{saveButton2.disabled=false;}});
      // —— 手工批次：创建 → 逐条引导 → 小结归档 ——
      document.getElementById('vc-start-batch').addEventListener('click',function(){if(!live||selectedIds().length===0)return;var setup=document.getElementById('vc-batch-setup');setup.hidden=false;var executorInput=document.getElementById('vc-batch-executor');if(!executorInput.value){try{executorInput.value=localStorage.getItem(EXECUTOR_KEY)||'';}catch(error){}}});
      document.getElementById('vc-batch-cancel').addEventListener('click',function(){document.getElementById('vc-batch-setup').hidden=true;document.getElementById('vc-batch-status').textContent='';});
      document.getElementById('vc-batch-create').addEventListener('click',async function(){var ids=selectedIds();var name=document.getElementById('vc-batch-name').value.trim();var executor=document.getElementById('vc-batch-executor').value.trim();var batchStatus=document.getElementById('vc-batch-status');
        if(!ids.length){batchStatus.textContent='请先勾选要执行的用例。';return;}
        if(!name||!executor){batchStatus.textContent='批次名与执行人必填。';return;}
        batchStatus.textContent='创建批次中…';
        try{var response=await fetch('/api/manual-batches',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({release:currentRelease(),name:name,caseIds:ids,executor:executor})});
          var result=await response.json();if(!response.ok)throw new Error(result.detail||result.error||('HTTP '+response.status));
          guide={active:true,batchId:result.batch.id,ids:ids,index:0,saved:0,skipped:0,executor:executor};
          batchStatus.textContent='已创建 '+result.batch.directory;
          document.getElementById('vc-batch-setup').hidden=true;
          openGuideAt(0);
        }catch(error){batchStatus.textContent='批次创建失败：'+error.message;}});
      function openGuideAt(index){guide.index=index;if(index>=guide.ids.length){showGuideEnd();return;}var row=rowById(guide.ids[index]);if(!row){openGuideAt(index+1);return;}openDrawer(row);}
      function showGuideEnd(){document.getElementById('vc-drawer-main').hidden=true;var end=document.getElementById('vc-guide-end');end.hidden=false;document.getElementById('vc-guide-nav').hidden=true;
        document.getElementById('vc-guide-stats').textContent='批次 '+guide.batchId+'：共 '+guide.ids.length+' 条，已保存 '+guide.saved+' 条，跳过 '+guide.skipped+' 条。结果已追加到 results.md 标记区。';
        document.getElementById('vc-guide-archive-status').textContent='';drawer.hidden=false;}
      document.getElementById('vc-guide-prev').addEventListener('click',function(){if(guide.active)openGuideAt(Math.max(0,guide.index-1));});
      document.getElementById('vc-guide-skip').addEventListener('click',function(){if(guide.active){guide.skipped++;openGuideAt(guide.index+1);}});
      document.getElementById('vc-guide-next').addEventListener('click',function(){if(guide.active)openGuideAt(guide.index+1);});
      document.getElementById('vc-guide-archive').addEventListener('click',async function(){var archiveStatus=document.getElementById('vc-guide-archive-status');archiveStatus.textContent='归档中…';
        try{var response=await fetch('/api/manual-batches/'+encodeURIComponent(guide.batchId)+'/summary',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({release:currentRelease(),caseIds:guide.ids,executor:guide.executor})});
          var result=await response.json();if(!response.ok)throw new Error(result.detail||result.error||('HTTP '+response.status));
          archiveStatus.textContent='已归档 '+result.summary.file;
        }catch(error){archiveStatus.textContent='归档失败：'+error.message;}});
      document.getElementById('vc-guide-finish').addEventListener('click',closeDrawer);
      // —— 链上核对（抽屉内）：tx hash → /api/verify-tx 渲染分层结论 → /api/manual-runs/attach 回填证据与合约层结果 ——
      // 纪律：结论只从接口返回读取；results.md 词汇表没有 NOT_VERIFIED，映射为 GAP（核对缺口），服务端若给 layerStatus 则以其为准；
      // 回填后合约层下拉锁定「不可手改成更好的」（PASS > GAP/BLOCKED/NOT_RUN > FAIL），换用例重开抽屉才解锁。
      var TX_ENV_KEY='fx100.vc.verifyEnv';
      var TX_HASH_PATTERN=/^0x[0-9a-fA-F]{64}$/;
      var TX_OVERRIDE_KEYS=['contractVersion','contractHead','frontendHead','executedAt','note'];
      var TX_OVERRIDE_HINTS={contractVersion:'登记值：CURRENT.json environments.<env>.forkOf → deployments[].releaseLabel',contractHead:'登记值：CURRENT.json primary / comparison.head（核对后回显）',frontendHead:'登记值：CURRENT.json frontend.head（核对后回显）',executedAt:'登记值：最后一笔 tx 的区块时间（核对后回显）',note:'可选；随元数据写入证据'};
      var TX_META_FIELDS=[['contractVersion','合约版本'],['contractHead','合约 head'],['frontendHead','前端 head'],['executedAt','执行时间'],['chainId','chainId'],['note','备注']];
      var TX_LAYER_RANK={PASS:3,GAP:2,BLOCKED:2,NOT_RUN:2,FAIL:1};
      var txVerify={environments:[],artifact:null,artifactPath:'',attached:null,lock:'',running:false};
      var txEls=null;
      function txOverrideInput(key){return document.getElementById('vc-tx-ov-'+key);}
      function txDefaultHint(key){return document.querySelector('.vc-tx-default[data-default-for="'+key+'"]');}
      function txText(value){return value==null?'':String(value);}
      function txShort(value,head,tail){var s=txText(value);return s.length>head+tail+1?(s.slice(0,head)+'…'+s.slice(s.length-tail)):s;}
      function txOption(select,value){for(var i=0;i<select.options.length;i++){if(select.options[i].value===value)return select.options[i];}return null;}
      function txHashes(){var lines=txEls.hashes.value.split('\\n').map(function(line){return line.trim();}).filter(function(line){return line.length>0;});var hashes=[];var invalid=[];lines.forEach(function(line){if(!TX_HASH_PATTERN.test(line)){invalid.push(line);return;}var lower=line.toLowerCase();if(hashes.indexOf(lower)<0)hashes.push(lower);});return {hashes:hashes,invalid:invalid};}
      function txOverrides(){var out={};TX_OVERRIDE_KEYS.forEach(function(key){var input=txOverrideInput(key);if(!input)return;var value=input.value.trim();if(value)out[key]=value;});return out;}
      function txCurrentProfile(){var name=txEls.env.value;for(var i=0;i<txVerify.environments.length;i++){if(txVerify.environments[i].name===name)return txVerify.environments[i];}return null;}
      function txResetDefaultHints(){var profile=txCurrentProfile();TX_OVERRIDE_KEYS.forEach(function(key){var input=txOverrideInput(key);var hint=txDefaultHint(key);if(!input||!hint)return;if(key==='contractVersion'&&profile&&profile.forkOfVersion){input.placeholder='登记值 '+profile.forkOfVersion;hint.textContent='登记值：'+profile.forkOfVersion+'（CURRENT.json environments.'+profile.name+'.forkOf）';return;}input.placeholder=key==='note'?'':'登记值';hint.textContent=TX_OVERRIDE_HINTS[key]||'';});}
      function txApplyMetadataHints(artifact){var meta=(artifact.data&&artifact.data.metadata)||{};var resolved=meta.resolvedFrom||{};var sources=meta.sources||{};TX_OVERRIDE_KEYS.forEach(function(key){var input=txOverrideInput(key);var hint=txDefaultHint(key);if(!input||!hint||meta[key]===undefined)return;if(resolved[key]==='override'){hint.textContent='覆盖值（本次核对已采用）· '+txText(sources[key]);return;}input.placeholder='登记值 '+txText(meta[key]);hint.textContent='登记值：'+txText(meta[key])+' · '+txText(sources[key]);});}
      function txDefaultEnv(){var stored='';try{stored=localStorage.getItem(TX_ENV_KEY)||'';}catch(error){}var names=txVerify.environments.map(function(profile){return profile.name;});if(names.indexOf(stored)>=0)return stored;if(names.indexOf('tx-fork')>=0)return 'tx-fork';var capable=txVerify.environments.filter(function(profile){return profile.permitsTransactions;});return capable.length?capable[0].name:(names[0]||'');}
      async function loadTxEnvironments(){try{var response=await fetch('/api/environments',{headers:{Accept:'application/json'}});if(!response.ok)throw new Error('HTTP '+response.status);var data=await response.json();txVerify.environments=(data.environments||[]).filter(function(profile){return profile&&typeof profile.name==='string';});
        txEls.env.innerHTML=txVerify.environments.map(function(profile){return '<option value="'+escapeHtml(profile.name)+'">'+escapeHtml(profile.name+'（'+(profile.forkOfVersion||'版本未登记')+(profile.rpcConfigured?'':' · RPC 未配置')+'）')+'</option>';}).join('')||'<option value="">无可用环境</option>';
        txEls.env.value=txDefaultEnv();txEls.env.disabled=txVerify.environments.length===0;txEls.run.disabled=txVerify.environments.length===0;txResetDefaultHints();}
        catch(error){txEls.env.innerHTML='<option value="">环境列表不可用</option>';txEls.status.textContent='环境列表加载失败：'+error.message;}}
      async function txReadJson(response){try{return await response.json();}catch(error){return null;}}
      function txErrorText(response,result,route){if(result&&(result.detail||result.error))return txText(result.detail||result.error);if(response.status===404)return '看板服务未提供 '+route+'（请更新代码并重启 npm run dashboard:serve）';return 'HTTP '+response.status;}
      // /api/verify-tx 的证据在 evidence 键（verify-tx-routes.ts 契约）；artifact / 顶层 summary 两种旧形保留兼容。
      function txUnwrapArtifact(result){if(!result||typeof result!=='object')return null;if(result.evidence&&typeof result.evidence==='object'&&result.evidence.summary)return result.evidence;if(result.artifact&&typeof result.artifact==='object'&&result.artifact.summary)return result.artifact;if(result.summary)return result;return null;}
      function txFirstString(candidates){for(var i=0;i<candidates.length;i++){if(typeof candidates[i]==='string'&&candidates[i].trim())return candidates[i].trim();}return '';}
      function txArtifactPath(result,artifact){return txFirstString([result&&result.path,result&&result.artifactPath,result&&result.out,result&&result.file,artifact&&artifact.path,artifact&&artifact.artifactPath]);}
      function txCheckRows(artifact){var basis=(artifact.data&&artifact.data.formulaBasis&&artifact.data.formulaBasis.byCheckId)||{};var report=artifact.reconciliationReport||{};
        function sectionOf(name){var item=basis[name];return item&&item.section?item.section:'—';}
        function valueOf(value){if(value==null)return '—';if(typeof value==='object')return txText(value.display!=null?value.display:value.raw);return txText(value);}
        if(Array.isArray(report.checks)&&report.checks.length){return report.checks.map(function(check){var name=txText(check.actionId)+' '+txText(check.id);return {name:name,label:txText(check.label||''),verification:txText(check.verification),verdict:txText(check.verdict),severity:txText(check.severity),expected:valueOf(check.expected),actual:valueOf(check.actual),formula:check.formula&&check.formula.expanded?txText(check.formula.expanded):'—',formulaId:check.formula&&check.formula.id?txText(check.formula.id):'',section:sectionOf(name),note:txText(check.note||check.difference||'')};});}
        return (artifact.checks||[]).map(function(check){var name=txText(check.name);return {name:name,label:txText(check.label||''),verification:txText(check.verification),verdict:txText(check.verdict),severity:txText(check.severity),expected:valueOf(check.expected),actual:valueOf(check.actual),formula:'—',formulaId:'',section:sectionOf(name),note:txText(check.note||'')};});}
      function txStatusHtml(value){return '<span class="status status-'+escapeHtml(value)+'">'+escapeHtml(value)+'</span>';}
      function txRenderResult(artifact,path,extraWarnings){var summary=artifact.summary||{};var data=artifact.data||{};var meta=data.metadata||{};var plan=data.plan||{};var resolved=meta.resolvedFrom||{};var sources=meta.sources||{};var verdict=txText(summary.verdict||'NOT_VERIFIED');
        var counts=summary.counts||{};var countText=Object.keys(counts).map(function(key){return key+' '+counts[key];}).join(' · ')||'无核对行';
        var rows=txCheckRows(artifact);
        var html='<div class="vc-tx-summary"><span class="vc-tx-badge vc-tx-badge-'+escapeHtml(verdict)+'">'+escapeHtml(verdict)+'</span><span>报告 '+txStatusHtml(txText(summary.reportStatus||'—'))+'</span><span class="muted">'+escapeHtml(countText)+'</span><span class="muted">计划 '+escapeHtml(txText(plan.id||'—')+'@'+txText(plan.version||'—')+'（'+(plan.trust==='registered'?'注册表可信计划':'adhoc · 未登记')+'）')+'</span></div>';
        if(Array.isArray(summary.reasons)&&summary.reasons.length)html+='<ul class="vc-tx-reasons">'+summary.reasons.map(function(reason){return '<li>'+escapeHtml(reason)+'</li>';}).join('')+'</ul>';
        var layers=summary.layers||{};html+='<div class="vc-tx-layers">'+Object.keys(layers).map(function(layer){return '<span>'+escapeHtml(layer)+' '+txStatusHtml(txText(layers[layer]))+'</span>';}).join('')+'</div>';
        html+='<h4>独立核对分层结论（'+rows.length+' 行）</h4>';
        html+=rows.length?'<div class="vc-tx-scroll"><table class="vc-tx-table"><thead><tr><th>action / id</th><th>verification</th><th>verdict</th><th>expected</th><th>actual</th><th>formula</th><th>§</th></tr></thead><tbody>'+rows.map(function(row){return '<tr data-verdict="'+escapeHtml(row.verdict)+'"><td><strong>'+escapeHtml(row.name)+'</strong>'+(row.label?'<small>'+escapeHtml(row.label)+'</small>':'')+(row.formulaId?'<small class="muted">'+escapeHtml(row.formulaId)+'</small>':'')+'</td><td>'+escapeHtml(row.verification)+'</td><td>'+txStatusHtml(row.verdict)+(row.severity==='warning'?'<small class="muted">warning</small>':'')+'</td><td class="vc-tx-value">'+escapeHtml(row.expected)+'</td><td class="vc-tx-value">'+escapeHtml(row.actual)+'</td><td class="vc-tx-formula">'+escapeHtml(row.formula)+(row.note?'<small class="muted">'+escapeHtml(row.note)+'</small>':'')+'</td><td>'+escapeHtml(row.section)+'</td></tr>';}).join('')+'</tbody></table></div>':'<p class="muted">（无核对行）</p>';
        html+='<h4>元数据</h4><table class="vc-tx-meta"><thead><tr><th>字段</th><th>值</th><th>来源</th><th>出处</th></tr></thead><tbody>';
        html+='<tr><td>环境</td><td>'+escapeHtml(txText(meta.env||'—')+'（forkOf='+txText(meta.forkOf||'—')+' · deployment='+txText(meta.deploymentId||'—')+' · manifest='+txText(meta.deploymentManifest||'—')+'）')+'</td><td class="vc-tx-source-default">登记</td><td>CURRENT.json environments.'+escapeHtml(txText(meta.env||'<env>'))+'</td></tr>';
        TX_META_FIELDS.forEach(function(field){var key=field[0];if(meta[key]===undefined&&key!=='note')return;if(key==='note'&&!meta.note)return;var origin=resolved[key]==='override'?'覆盖':(resolved[key]==='default'?'默认（登记值）':'—');var cls=resolved[key]==='override'?'vc-tx-source-override':'vc-tx-source-default';var value=txText(meta[key]);if(key==='chainId'&&meta.rpcChainId!==undefined)value+=' · RPC eth_chainId='+txText(meta.rpcChainId)+(String(meta.rpcChainId)===String(meta.chainId)?'':' ⚠ 不一致');html+='<tr><td>'+escapeHtml(field[1])+'</td><td>'+escapeHtml(value||'（空）')+'</td><td class="'+cls+'">'+escapeHtml(origin)+'</td><td>'+escapeHtml(txText(sources[key]||'—'))+'</td></tr>';});
        html+='</tbody></table>';
        var perTx=Array.isArray(meta.perTx)?meta.perTx:[];if(perTx.length)html+='<details class="vc-tx-sub"><summary>tx 明细（'+perTx.length+' 笔）</summary><div class="vc-tx-scroll"><table class="vc-tx-table"><thead><tr><th>action</th><th>tx</th><th>kind</th><th>role</th><th>block</th><th>执行时间</th><th>orderKey</th></tr></thead><tbody>'+perTx.map(function(tx){return '<tr><td>'+escapeHtml(txText(tx.actionId))+'</td><td title="'+escapeHtml(txText(tx.hash))+'">'+escapeHtml(txShort(tx.hash,10,6))+'</td><td>'+escapeHtml(txText(tx.kind))+'</td><td>'+escapeHtml(txText(tx.role))+'</td><td>'+escapeHtml(txText(tx.blockNumber))+'</td><td>'+escapeHtml(txText(tx.executedAtIso))+'</td><td>'+escapeHtml(tx.orderKey?txShort(tx.orderKey,10,0):'—')+'</td></tr>';}).join('')+'</tbody></table></div></details>';
        var notes=[];(plan.applied||[]).length&&notes.push('已接入 pack：'+plan.applied.join('、'));(plan.excluded||[]).forEach(function(item){notes.push('排除 pack '+txText(item.id)+'：'+txText(item.reason));});(plan.noPack||[]).forEach(function(gap){notes.push('无 pack '+txText(gap.actionId)+' '+txText(gap.kind)+'/'+txText(gap.type)+'：'+txText(gap.reason));});(plan.notes||[]).forEach(function(note){notes.push('说明：'+txText(note));});(data.warnings||[]).concat(extraWarnings||[]).forEach(function(warning){notes.push('告警：'+txText(warning));});if(plan.digest)notes.push('digest '+txText(plan.digest));
        if(notes.length)html+='<details class="vc-tx-sub"><summary>计划 / pack / 告警（'+notes.length+'）</summary><ul class="vc-tx-notes">'+notes.map(function(note){return '<li>'+escapeHtml(note)+'</li>';}).join('')+'</ul></details>';
        html+='<p class="muted vc-tx-foot">产物：'+escapeHtml(path||'（接口未返回产物路径）')+' · 公式依据：'+escapeHtml(txText((data.formulaBasis&&data.formulaBasis.sourcePath)||'—'))+'</p>';
        txEls.result.innerHTML=html;txEls.result.hidden=false;
        txEls.verdictBadge.textContent=verdict;txEls.verdictBadge.className='vc-tx-badge vc-tx-badge-'+verdict;txEls.verdictBadge.hidden=false;
        drawer.classList.add('vc-drawer-wide');}
      async function runTxVerify(){if(!live||txVerify.running)return;var parsed=txHashes();
        if(parsed.invalid.length){txEls.status.textContent='tx hash 不合法：'+parsed.invalid.slice(0,3).join('、');return;}
        if(!parsed.hashes.length){txEls.status.textContent='请至少填一条 tx hash。';return;}
        if(!txEls.env.value){txEls.status.textContent='请选择环境。';return;}
        var body={env:txEls.env.value,hashes:parsed.hashes,release:currentRelease(),overrides:txOverrides()};
        if(activeRow)body.caseId=activeRow.dataset.id;if(guide.active&&guide.batchId)body.batchId=guide.batchId;
        txVerify.running=true;txEls.run.disabled=true;txEls.attach.disabled=true;txVerify.artifact=null;txVerify.artifactPath='';
        txEls.status.textContent='核对中…（读链 + 跑核对包，可能需要十几秒）';
        try{var response=await fetch('/api/verify-tx',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});
          var result=await txReadJson(response);if(!response.ok)throw new Error(txErrorText(response,result,'/api/verify-tx'));
          var artifact=txUnwrapArtifact(result);if(!artifact)throw new Error('接口返回缺少 summary，无法渲染核对结论。');
          txVerify.artifact=artifact;txVerify.artifactPath=txArtifactPath(result,artifact);
          txRenderResult(artifact,txVerify.artifactPath,(result&&Array.isArray(result.warnings))?result.warnings:[]);txApplyMetadataHints(artifact);
          txEls.attach.disabled=false;
          txEls.status.textContent='核对完成：'+txText(artifact.summary.verdict)+(txVerify.artifactPath?' · 产物 '+txVerify.artifactPath:'')+(txVerify.lock?'（合约层仍按上次回填 '+txVerify.lock+' 锁定，重新回填以更新）':'');
        }catch(error){txEls.status.textContent='核对失败：'+error.message;}
        finally{txVerify.running=false;txEls.run.disabled=!live;}}
      function txAttachPath(result){return txFirstString([result&&result.path,result&&result.evidencePath,result&&result.file,result&&result.attachment&&result.attachment.path,result&&result.evidence&&result.evidence.path]);}
      function txAttachVerdict(result,artifact){var value=txFirstString([result&&result.verdict,result&&result.summary&&result.summary.verdict,result&&result.attachment&&result.attachment.verdict,artifact&&artifact.summary&&artifact.summary.verdict]);return ['PASS','FAIL','NOT_VERIFIED'].indexOf(value)>=0?value:'NOT_VERIFIED';}
      function txAttachLayerStatus(result){var value=txFirstString([result&&result.layerStatus,result&&result.contractLayer,result&&result.layers&&result.layers.contract]);return TX_LAYER_RANK[value]!==undefined?value:'';}
      function txFillEvidence(path){var lines=fields.evidence.value.split('\\n').map(function(line){return line.trim();}).filter(function(line){return line.length>0;});var prefix=guide.active&&guide.batchId?('TestCase/E2E/manual-runs/'+guide.batchId+'/'):'';lines=lines.filter(function(line){return !(prefix&&line===prefix&&path.indexOf(prefix)===0);});if(lines.indexOf(path)<0)lines.push(path);fields.evidence.value=lines.join('\\n');}
      function txApplyContractLock(){var lockRank=txVerify.lock?TX_LAYER_RANK[txVerify.lock]:0;Array.prototype.forEach.call(fields.contract.options,function(option){option.disabled=false;option.title='';});setStatusOptionGuards(fields.contract,'contract');if(!txVerify.lock)return;Array.prototype.forEach.call(fields.contract.options,function(option){var rank=TX_LAYER_RANK[option.value];if(rank!==undefined&&rank>lockRank){option.disabled=true;option.title='链上核对已回填 '+txVerify.lock+'：不可手改成更好的结果';}});}
      function txLockContract(verdict,layerStatus){var mapped=layerStatus||(verdict==='PASS'?'PASS':verdict==='FAIL'?'FAIL':'GAP');var note=verdict==='NOT_VERIFIED'&&!layerStatus?'NOT_VERIFIED 不在 results.md 词汇表，记 GAP（核对缺口）；':'';txVerify.lock='';txApplyContractLock();var option=txOption(fields.contract,mapped);if(option&&option.disabled){note+='admission 门槛禁用 '+mapped+'，改记 BLOCKED；';mapped='BLOCKED';}fields.contract.value=mapped;txVerify.lock=mapped;txApplyContractLock();return {status:mapped,note:note};}
      function txActualSummary(artifact,verdict){var summary=artifact.summary||{};var counts=summary.counts||{};var countText=Object.keys(counts).map(function(key){return key+' '+counts[key];}).join('/');var reasons=Array.isArray(summary.reasons)?summary.reasons.slice(0,2).join('；'):'';return '链上核对（verify-tx）'+verdict+'：report '+txText(summary.reportStatus||'—')+(countText?'；核对行 '+countText:'')+(reasons?'；'+reasons:'');}
      // attach 契约（verify-tx-routes.ts）：{ batchId?, caseId, evidence }。evidence 就是核对接口返回的证据 JSON 原样回传；
      // 非引导模式不带 batchId，服务端落到默认段 adhoc（路径由返回的 path 回显）；服务端不接受 artifactPath 路径引用，故不发。
      async function attachTxVerify(){if(!live||!txVerify.artifact||!activeRow)return;
        var body={caseId:activeRow.dataset.id,evidence:txVerify.artifact};
        if(guide.active&&guide.batchId)body.batchId=guide.batchId;
        txEls.attach.disabled=true;txEls.status.textContent='回填中…';
        try{var response=await fetch('/api/manual-runs/attach',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});
          var result=await txReadJson(response);if(!response.ok)throw new Error(txErrorText(response,result,'/api/manual-runs/attach'));
          var path=txAttachPath(result);if(!path)throw new Error('接口未返回证据路径（path）。');
          var verdict=txAttachVerdict(result,txVerify.artifact);var locked=txLockContract(verdict,txAttachLayerStatus(result));
          txVerify.attached={path:path,verdict:verdict,status:locked.status};txFillEvidence(path);
          if(!fields.actual.value.trim())fields.actual.value=txActualSummary(txVerify.artifact,verdict);
          txEls.status.textContent='已回填：'+path+' · 链上结论 '+verdict+' → 合约层 '+locked.status+'（'+locked.note+'不可手改成更好的）'+(result&&typeof result.note==='string'&&result.note?' · '+result.note:'');
        }catch(error){txEls.status.textContent='回填失败：'+error.message;}
        finally{txEls.attach.disabled=!txVerify.artifact;}}
      function resetTxVerify(){if(!txEls)return;txEls.hashes.value='';txVerify.artifact=null;txVerify.artifactPath='';txVerify.attached=null;txVerify.lock='';txVerify.running=false;txEls.result.hidden=true;txEls.result.innerHTML='';txEls.verdictBadge.hidden=true;txEls.attach.disabled=true;txEls.run.disabled=!live||txVerify.environments.length===0;txEls.status.textContent='';drawer.classList.remove('vc-drawer-wide');txApplyContractLock();}
      function initTxVerify(){var block=document.getElementById('vc-tx-verify');if(!block)return;
        txEls={block:block,env:document.getElementById('vc-tx-env'),hashes:document.getElementById('vc-tx-hashes'),run:document.getElementById('vc-tx-run'),attach:document.getElementById('vc-tx-attach'),status:document.getElementById('vc-tx-status'),result:document.getElementById('vc-tx-result'),mode:document.getElementById('vc-tx-mode'),verdictBadge:document.getElementById('vc-tx-verdict')};
        if(!live){txEls.mode.textContent='需 dashboard:serve';txEls.env.innerHTML='<option value="">需 dashboard:serve</option>';txEls.env.disabled=true;txEls.hashes.disabled=true;TX_OVERRIDE_KEYS.forEach(function(key){var input=txOverrideInput(key);if(input)input.disabled=true;});txEls.run.disabled=true;txEls.attach.disabled=true;txEls.status.textContent='静态模式：链上核对需通过 npm run dashboard:serve 打开本页（按钮已禁用）。';return;}
        txEls.mode.textContent='核对 → /api/verify-tx · 回填 → /api/manual-runs/attach';
        txEls.run.addEventListener('click',runTxVerify);txEls.attach.addEventListener('click',attachTxVerify);
        txEls.env.addEventListener('change',function(){try{localStorage.setItem(TX_ENV_KEY,txEls.env.value);}catch(error){}txResetDefaultHints();});
        loadTxEnvironments();}
      // —— 版本切换与静态守卫 ——
      if(releaseSelect)releaseSelect.addEventListener('change',function(){document.querySelectorAll('.version-case-block').forEach(function(block){block.hidden=block.getAttribute('data-release')!==releaseSelect.value;});populateOptions();applyFilters();refreshRelease();});
      if(['http:','https:'].indexOf(location.protocol)>=0){try{var probe=await fetch('/api/version-results?release='+encodeURIComponent(currentRelease()),{headers:{Accept:'application/json'}});if(probe.ok){live=true;var probeData=await probe.json();deployLabel=probeData.deploy||deployLabel;var latest={};(probeData.rows||[]).forEach(function(row){latest[row.caseId]=row;});allRows().forEach(function(row){var record=latest[row.dataset.id];if(!record)return;setBadge(row,'c',record.contract);setBadge(row,'f',record.frontend);setBadge(row,'x',record.cross);});}}catch(error){}}
      var manualHint=document.getElementById('vc-manual-hint');
      if(live){document.querySelectorAll('.vc-record').forEach(function(button){button.disabled=false;button.title='';});manualHint.textContent='结果写回 results.md 标记区（追加行，不覆盖）；批次归档到 TestCase/E2E/manual-runs/。';}
      else{manualHint.textContent='静态模式：记录结果与手工批次需通过 npm run dashboard:serve 打开本页（按钮已禁用）。';}
      initTxVerify();
      restoreFilters();populateOptions();applyFilters();
      if(requestedCaseId){var requestedRow=rowById(requestedCaseId);if(requestedRow){var detailButton=requestedRow.querySelector('.vc-detail-toggle');if(detailButton)detailButton.click();}}
    }
    try{await initVersionCases();}catch(error){var vcHint=document.getElementById('vc-manual-hint');if(vcHint)vcHint.textContent='手工测试工作台初始化失败：'+error.message;}
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
      .case-tabs{display:flex;gap:8px;margin:0 0 14px;padding:5px;border:1px solid var(--line);border-radius:14px;background:#0c1424;width:max-content;max-width:100%}.case-tabs button{display:flex;align-items:center;gap:9px;border:0;border-radius:10px;background:transparent;color:var(--muted);padding:10px 18px;font:inherit;font-weight:750;cursor:pointer}.case-tabs button span{display:inline-flex;align-items:center;justify-content:center;min-width:28px;border-radius:999px;background:#17243a;color:#9fb3cf;padding:1px 7px;font-size:11px}.case-tabs button[aria-selected="true"]{background:#14569a;color:#fff;box-shadow:0 5px 14px rgba(20,86,154,.28)}.case-tabs button[aria-selected="true"] span{background:rgba(255,255,255,.16);color:#fff}.case-tab-panel[hidden]{display:none!important}
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
      .workspace>.panel{min-width:0}
      .admission-banner{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:14px;font-size:12px}
      .admission-chip{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:3px 9px;white-space:nowrap;font-weight:700}
      .admission-ready{color:#36d399;border-color:#1f7a55;background:#0b2a1e}.admission-blocked{color:#fde68a;border-color:#d97706;background:#3a2405}.admission-unknown{color:#93a4bd}
      .admission-source{color:var(--muted);overflow-wrap:anywhere}
      .scn-version-sources{border:1px solid var(--line);background:#0c1424;border-radius:12px;padding:9px 14px;margin-bottom:14px;color:var(--muted);font-size:12px;overflow-wrap:anywhere}
      .version-cases{margin-top:0}.version-cases .panel-head{flex-wrap:wrap;align-items:center}
      .vc-release-picker{min-width:130px}.vc-release-picker select{min-height:34px}
      .version-cases h3{margin:16px 0 8px;font-size:15px}
      .vc-block-note{color:var(--muted);font-size:12px;overflow-wrap:anywhere;margin:0 0 6px}
      .vc-empty{color:var(--muted);border:1px dashed var(--line);border-radius:10px;padding:12px}
      .vc-blocked{display:inline-flex;border:1px solid #d97706;background:#3a2405;color:#fde68a;border-radius:999px;padding:3px 9px;font-size:12px;font-weight:700;white-space:nowrap}
      .version-cases .scroll{max-height:560px}
      .vc-table td.vc-title{min-width:260px}.vc-table td.vc-id,.vc-table td.vc-entry{white-space:nowrap}.vc-entry small{display:block;color:var(--muted);margin-top:3px}.vc-act{display:flex;gap:6px;min-width:132px}
      .vc-table td.vc-trader{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;overflow-wrap:anywhere;min-width:200px}
      .layer{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:2px 6px;white-space:nowrap;font-size:10px}
      .layer-PASS{color:#36d399}.layer-FAIL{color:#fb7185}.layer-BLOCKED{color:#a78bfa}.layer-GAP{color:#fbbf24}.layer-NOT_RUN{color:#94a3b8}.layer-NONE{color:#64748b}
      .visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
      .vc-filters{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px}
      .vc-filter-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;grid-column:1/-1}
      .vc-filter-actions button,.vc-batch-bar button,.vc-batch-setup button,.vc-guide-nav button{border:1px solid #365274;border-radius:8px;background:#0b2038;color:#cfe4ff;padding:6px 10px;cursor:pointer}
      .vc-batch-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}
      .vc-batch-bar button.primary{background:#14569a;border-color:#3978bd;color:white}
      .vc-batch-bar button:disabled,.vc-record:disabled{opacity:.4;cursor:not-allowed}
      .vc-batch-setup{display:flex;align-items:end;gap:10px;flex-wrap:wrap;border:1px solid var(--line);border-radius:10px;padding:10px;margin-bottom:10px}
      .vc-batch-setup[hidden]{display:none!important}
      .vc-batch-setup label{min-width:180px;flex:1}
      .vc-check{width:auto;min-height:auto;accent-color:#5ea7ff}
      .vc-record,.vc-detail-toggle{border:1px solid #365274;border-radius:8px;background:#0b2038;color:#cfe4ff;padding:4px 8px;cursor:pointer;white-space:nowrap;font-size:11px}.vc-detail-toggle[aria-expanded="true"]{background:#14569a;border-color:#5ea7ff;color:#fff}
      .vc-detail-row>td{padding:0 8px 12px;background:#0a111e}.vc-case-detail{border:1px solid #3978bd;border-radius:12px;background:#0c1729;padding:15px}.vc-case-detail>header{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:12px}.vc-case-detail header span{color:#8fc2ff;font-size:11px;font-weight:750}.vc-case-detail h3{margin:4px 0 0!important;font-size:17px}.vc-detail-meta{display:flex;justify-content:flex-end;gap:6px;flex-wrap:wrap}.vc-detail-meta span{border:1px solid var(--line);border-radius:999px;padding:4px 8px;color:var(--muted)!important;max-width:420px;overflow-wrap:anywhere}.vc-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.vc-detail-grid article{border:1px solid var(--line);border-radius:10px;background:#0b1220;padding:11px 13px}.vc-detail-grid article.expected{border-color:#315f51;background:rgba(54,211,153,.045)}.vc-detail-grid h4{margin:0 0 6px;color:#9fc9ff;font-size:12px}.vc-detail-grid p{margin:0;white-space:pre-line;line-height:1.55;color:#d8e2f0}
      #vc-drawer{position:fixed;top:0;right:0;height:100vh;width:min(520px,100vw);z-index:50;overflow:auto;margin:0;border-radius:0;border-left:1px solid var(--line);box-shadow:-12px 0 30px rgba(0,0,0,.45)}
      #vc-drawer[hidden]{display:none!important}
      .vc-drawer-head{display:flex;align-items:center;gap:10px;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap}
      #vc-drawer-close{border:1px solid var(--line);background:transparent;color:var(--text);border-radius:8px;width:30px;height:30px;cursor:pointer}
      .vc-guide-nav{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);flex-wrap:wrap}
      .vc-readonly{display:grid;grid-template-columns:96px 1fr;gap:6px 10px;font-size:12px;margin:0 0 10px}
      .vc-readonly dt{color:var(--muted)}.vc-readonly dd{margin:0;overflow-wrap:anywhere}
      .vc-admission-hint{border:1px solid #d97706;background:#3a2405;color:#fde68a;border-radius:10px;padding:8px 10px;font-size:12px;margin:0 0 10px}
      .vc-admission-hint[hidden]{display:none!important}
      .vc-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .vc-wide{grid-column:1/-1}
      .vc-drawer-actions{display:flex;align-items:center;gap:10px;margin-top:12px;flex-wrap:wrap}
      .vc-drawer-actions button{border:1px solid #3978bd;border-radius:9px;background:#14569a;color:white;padding:8px 12px;cursor:pointer}
      .vc-drawer-actions button:disabled{opacity:.45;cursor:not-allowed}
      #vc-drawer.vc-drawer-wide{width:min(900px,100vw)}
      .vc-tx-verify{border:1px solid #2d5f8f;border-radius:10px;background:#0c1729;padding:8px 10px;margin:0 0 12px}
      .vc-tx-verify>summary{cursor:pointer;display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13px}.vc-tx-verify>summary .muted{font-size:11px}
      .vc-tx-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.vc-tx-grid textarea{min-height:64px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}
      .vc-tx-overrides{margin-top:8px;border:1px dashed var(--line);border-radius:8px;padding:6px 8px}.vc-tx-overrides>summary{cursor:pointer;color:var(--muted);font-size:12px}
      .vc-tx-default{color:#64748b;font-size:10px;overflow-wrap:anywhere}.vc-tx-actions{margin-top:8px}
      .vc-tx-result{margin-top:10px;display:grid;gap:8px;font-size:12px}.vc-tx-result[hidden]{display:none!important}
      .vc-tx-summary{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .vc-tx-badge{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:3px 10px;font-weight:800;font-size:12px;white-space:nowrap}.vc-tx-badge[hidden]{display:none!important}
      .vc-tx-badge-PASS{color:#36d399;border-color:#1f7a55;background:#0b2a1e}.vc-tx-badge-FAIL{color:#fb7185;border-color:#9f3347;background:#2b1118}.vc-tx-badge-NOT_VERIFIED{color:#fde68a;border-color:#d97706;background:#3a2405}
      .vc-tx-reasons,.vc-tx-notes{margin:0;padding-left:18px;color:#fde68a;overflow-wrap:anywhere}.vc-tx-notes{color:#c6d3e4}
      .vc-tx-layers{display:flex;flex-wrap:wrap;gap:6px}.vc-tx-layers>span{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line);border-radius:999px;padding:2px 8px;color:var(--muted);font-size:11px}
      .vc-tx-result h4{margin:4px 0 0;font-size:12px;color:#9fc9ff}
      .vc-tx-scroll{overflow:auto;max-height:340px;border:1px solid var(--line);border-radius:8px}
      .vc-tx-table{font-size:11px;min-width:760px}.vc-tx-table td,.vc-tx-table th{padding:5px 6px;white-space:nowrap;vertical-align:top}.vc-tx-table td small{display:block;color:#93a4bd;font-size:10px}
      .vc-tx-table td.vc-tx-value{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;max-width:200px;overflow:hidden;text-overflow:ellipsis}.vc-tx-table td.vc-tx-formula{white-space:normal;min-width:240px;max-width:380px;overflow-wrap:anywhere;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
      .vc-tx-table tr[data-verdict="FAIL"] td{background:rgba(159,51,71,.1)}.vc-tx-table tr[data-verdict="NOT_VERIFIED"] td{background:rgba(217,119,6,.08)}
      .vc-tx-meta{font-size:11px}.vc-tx-meta td,.vc-tx-meta th{padding:4px 6px;overflow-wrap:anywhere}.vc-tx-source-default{color:#93a4bd;white-space:nowrap}.vc-tx-source-override{color:#fbbf24;white-space:nowrap}
      .vc-tx-sub>summary{cursor:pointer;color:var(--muted);font-size:12px}.vc-tx-foot{margin:0;overflow-wrap:anywhere}
      .status-NOT_VERIFIED,.status-PASS_WITH_GAPS,.status-INCOMPLETE{color:#fbbf24}.status-NOT_RUN,.status-NOT_APPLICABLE{color:#94a3b8}.status-INVALID_EVIDENCE{color:#fb7185}
      @media(max-width:1150px){.workspace{grid-template-columns:1fr}.filters{grid-template-columns:1fr 1fr}.list-panel .scroll{max-height:520px}}
      @media(max-width:650px){.case-tabs{width:100%}.case-tabs button{flex:1;justify-content:center;padding:9px 10px}.metric-grid,.filters,.form-grid{grid-template-columns:1fr}.wide{grid-column:auto}.editor-panel,.list-panel{padding:11px}.selection-toolbar{align-items:stretch;flex-direction:column}.version-cases .scroll{max-height:420px}.vc-filters,.vc-form-grid,.vc-detail-grid{grid-template-columns:1fr}.vc-case-detail>header{display:block}.vc-detail-meta{justify-content:flex-start;margin-top:10px}.vc-wide{grid-column:auto}#vc-drawer,#vc-drawer.vc-drawer-wide{width:100vw}.vc-tx-grid{grid-template-columns:1fr}}
    `,
  });
}

import { renderPageShell, serializeForHtml } from './render-page-shell.js';
import { isFunctionalResultId, type TestRunArtifact } from './schema.js';
import type { PositionKeyContext } from './decode-chain-values.js';
import type { TestCaseDefinition } from './test-cases.js';
import type { VersionCasesData } from './version-cases.js';

export interface FunctionalAutomationCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly status?: 'PASS' | 'FAIL' | 'NOT_VERIFIED' | 'NOT_APPLICABLE';
  /** calculation 需要展示公式与代入；assertion 只展示断言语义和链上证据。 */
  readonly kind?: 'calculation' | 'assertion';
  readonly actual: unknown;
  readonly expected: unknown;
  readonly verification?: string;
  readonly sources?: readonly string[];
  readonly before?: unknown;
  readonly after?: unknown;
  readonly delta?: unknown;
  readonly expectedDelta?: unknown;
  readonly expectedAfter?: unknown;
  readonly formula?: string | {
    readonly id: string;
    readonly version: string;
    readonly expanded: string;
  };
  readonly note?: string;
  /** 该核对项由哪些交易阶段产生；历史证据在读取时按名称补齐。 */
  readonly actionKeys?: readonly string[];
}

export interface FunctionalAutomationTransaction {
  readonly label: string;
  readonly hash: string;
  /** createOpen / executeOpen / createClose / executeClose / oracle-* 等稳定阶段键。 */
  readonly actionKey?: string;
  readonly url?: string;
  readonly linkStatus: 'available' | 'missing';
  readonly blockNumber?: string;
  readonly status?: string;
  readonly from?: string;
  readonly to?: string;
}

export interface FunctionalAutomationEvidence {
  readonly id: string;
  readonly title: string;
  readonly checks: readonly FunctionalAutomationCheck[];
  readonly transactions: readonly FunctionalAutomationTransaction[];
  /** Position key 为不可逆 bytes32；这里只保存由原始证据重新计算并校验通过的关联字段。 */
  readonly positionKeyContexts?: readonly PositionKeyContext[];
  /** 从原始 runner 证据只读提取的动作摘要数据，不参与测试结论计算。 */
  readonly actionData?: unknown;
  readonly data?: unknown;
  readonly sourcePath: string;
  readonly reportStatus?: string;
  readonly layerVerdicts?: Readonly<Record<string, string>>;
  readonly checkPlan?: { readonly id: string; readonly version: string; readonly digest: string };
}

export interface ExecutionDeploymentView {
  readonly environment: string;
  readonly version: string;
  readonly deploymentId: string;
  readonly manifestName: string;
  readonly contractCommit: string;
  readonly environmentChainId: number;
  readonly deploymentChainId: number;
  readonly contracts: Readonly<Record<string, string>>;
  readonly additionalContracts: Readonly<Record<string, string>>;
  /** 原始部署器输出的完整地址表；核心/扩展字段仍由 manifest 提供稳定语义。 */
  readonly deployedAddresses?: Readonly<Record<string, string>>;
  readonly markets: readonly {
    readonly name: string;
    readonly symbol: string;
    readonly marketIndex: string;
    readonly indexToken: string;
    readonly collateralToken: string;
    readonly vault: string;
    readonly indexTokenDecimals: number;
    readonly collateralTokenDecimals: number;
  }[];
  readonly mockResources?: {
    readonly status: string;
    readonly forkDisplayName?: string;
    readonly sharedCollateral?: {
      readonly token?: { readonly name: string; readonly symbol: string; readonly address: string; readonly decimals: number };
      readonly oracle?: { readonly description: string; readonly address: string; readonly decimals: number };
    };
    readonly bundles: readonly {
      readonly alias: string;
      readonly status: string;
      readonly token?: { readonly name: string; readonly symbol: string; readonly address: string; readonly decimals: number };
      readonly oracle?: { readonly description: string; readonly address: string; readonly decimals: number };
      readonly market?: { readonly marketIndex?: number; readonly vault?: string; readonly bundleId?: string };
    }[];
  };
}

export function renderExecutionsHtml(
  artifact: TestRunArtifact,
  testCases: TestCaseDefinition[] = [],
  versionCases?: VersionCasesData,
  functionalEvidence: Readonly<Record<string, FunctionalAutomationEvidence>> = {},
  deploymentByEnvironment: Readonly<Record<string, ExecutionDeploymentView>> = {},
): string {
  const versionView = versionCases?.versions.find((view) => view.release === versionCases.defaultRelease);
  const payload = serializeForHtml({
    run: artifact.run,
    sourceStatus: artifact.sourceStatus,
    results: artifact.results.filter((result) => result.executionEvidence && !isFunctionalResultId(result.id)),
    functionalResults: artifact.results.filter((result) => isFunctionalResultId(result.id)),
    functionalEvidence,
    deploymentByEnvironment,
    functionalCases: (versionView?.sections ?? []).flatMap((section) => section.cases.map((item) => ({
      id: item.id,
      section: section.name,
      layer: item.layer,
      entry: item.entry,
      trader: item.trader,
      preconditions: item.preconditions,
      testData: item.testData,
      steps: item.steps,
      checks: item.checks,
      expected: item.expected,
      relatedCase: item.relatedCase,
      designBasis: item.designBasis,
      layers: item.layers,
      release: versionView?.release ?? '',
    }))),
    cases: testCases.map(({ id, roleIntent, preconditions, testData, steps, expected, cleanup, sourcePath,
      targetProject, marketMode, oracleMode, timeMode, signingMode, mockResourceAlias, environmentSetup }) => ({
      id, roleIntent, preconditions, testData, steps, expected, cleanup, sourcePath, targetProject,
      marketMode, oracleMode, timeMode, signingMode, mockResourceAlias, environmentSetup,
    })),
  });
  const content = `
  <nav class="execution-tabs" role="tablist" aria-label="执行结果类型">
    <button type="button" role="tab" id="execution-tab-scenario" data-execution-tab="scenario" aria-controls="execution-panel-scenario" aria-selected="true">Scenario <span>${artifact.results.filter((result) => result.executionEvidence && !isFunctionalResultId(result.id)).length}</span></button>
    <button type="button" role="tab" id="execution-tab-functional" data-execution-tab="functional" aria-controls="execution-panel-functional" aria-selected="false">功能用例 <span>${artifact.results.filter((result) => isFunctionalResultId(result.id)).length}</span></button>
  </nav>
  <section id="execution-panel-scenario" class="execution-tab-panel" role="tabpanel" aria-labelledby="execution-tab-scenario">
    <section class="panel controls">
      <label>执行场景
        <select id="execution-scenario"></select>
      </label>
      <div class="source-state"><span>数据状态</span><strong>${artifact.sourceStatus.toUpperCase()}</strong></div>
      <div class="source-state"><span>Run ID</span><strong>${artifact.run.id}</strong></div>
      <div class="source-state"><span>记录管理</span><button id="delete-record" type="button">删除本条执行记录</button></div>
    </section>
    <section id="execution-content"></section>
  </section>
  <section id="execution-panel-functional" class="execution-tab-panel" role="tabpanel" aria-labelledby="execution-tab-functional" hidden>
    <section class="functional-metrics" id="functional-metrics"></section>
    <section class="panel controls functional-controls">
      <label>执行用例<select id="functional-result-select"></select></label>
      <label>自动化结果<select id="functional-status"><option value="">全部</option><option>PASS</option><option>FAIL</option><option>BLOCKED</option><option>SKIP</option><option>FLAKY</option></select></label>
      <label>用例类型<select id="functional-kind"><option value="">全部</option><option value="CT">CT · 合约检查</option><option value="XT">XT · 交叉/交易检查</option><option value="FT">FT · 前端检查</option></select></label>
      <label>批次 ID<select id="functional-batch"><option value="">全部批次</option></select></label>
      <label class="functional-search">搜索<input id="functional-search" type="search" placeholder="ID、标题、批次、结果说明……"></label>
      <div class="source-state"><span>当前筛选</span><strong id="functional-visible-count">0 条</strong></div>
      <div class="source-state"><span>记录管理</span><button id="delete-functional-record" type="button">删除本条执行记录</button></div>
    </section>
    <section id="functional-execution-content"></section>
  </section>
  <script id="execution-data" type="application/json">${payload}</script>`;

  const script = `
  (function () {
    'use strict';
    const data = JSON.parse(document.getElementById('execution-data').textContent);
    const urlQuery = new URLSearchParams(location.search);
    const select = document.getElementById('execution-scenario');
    const content = document.getElementById('execution-content');
    const functionalContent = document.getElementById('functional-execution-content');
    const functionalSelect = document.getElementById('functional-result-select');
    const functionalControls = {
      status: document.getElementById('functional-status'),
      kind: document.getElementById('functional-kind'),
      batch: document.getElementById('functional-batch'),
      search: document.getElementById('functional-search'),
    };
    const functionalCaseById = new Map((data.functionalCases || []).map(function (item) { return [item.id, item]; }));
    const functionalState = { selectedKey: '' };
    let activeFunctionalBasisTip = null;
    let functionalBasisTipCloseTimer = 0;
    function esc(value) {
      return String(value == null ? '' : value).replaceAll('&','&amp;').replaceAll('<','&lt;')
        .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
    }
    function shortHash(value) { return value ? value.slice(0, 10) + '…' + value.slice(-8) : '-'; }
    function actorLabel(actor) { return actor === 'TRADER' ? '交易员' : 'Keeper'; }
    function status(value) { return '<span class="status status-' + esc(value) + '">' + esc(value) + '</span>'; }
    function functionalBasisTarget(value) { return value instanceof Element ? value : null; }
    function functionalBasisTipIsOpen(popover) {
      try { return popover.matches(':popover-open') || popover.classList.contains('is-open'); }
      catch { return popover.classList.contains('is-open'); }
    }
    function positionFunctionalBasisTip(trigger, popover) {
      const margin = 12;
      const gap = 8;
      popover.style.left = margin + 'px';
      popover.style.top = margin + 'px';
      const triggerRect = trigger.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();
      const left = Math.min(
        window.innerWidth - popoverRect.width - margin,
        Math.max(margin, triggerRect.right - popoverRect.width),
      );
      const preferredTop = triggerRect.bottom + gap;
      const top = preferredTop + popoverRect.height <= window.innerHeight - margin
        ? preferredTop
        : Math.max(margin, triggerRect.top - popoverRect.height - gap);
      popover.style.left = Math.max(margin, left) + 'px';
      popover.style.top = top + 'px';
    }
    function hideFunctionalBasisTip(force) {
      if (!activeFunctionalBasisTip || (activeFunctionalBasisTip.pinned && !force)) return;
      window.clearTimeout(functionalBasisTipCloseTimer);
      const current = activeFunctionalBasisTip;
      current.trigger.setAttribute('aria-expanded', 'false');
      try {
        if (typeof current.popover.hidePopover === 'function' && current.popover.matches(':popover-open')) current.popover.hidePopover();
      } catch { /* 动态切换 TX 时节点可能已被移除。 */ }
      current.popover.classList.remove('is-open');
      activeFunctionalBasisTip = null;
    }
    function showFunctionalBasisTip(trigger, pinned) {
      const popover = document.getElementById(trigger.dataset.functionalBasisTip || '');
      if (!popover) return;
      if (activeFunctionalBasisTip && activeFunctionalBasisTip.trigger !== trigger) hideFunctionalBasisTip(true);
      window.clearTimeout(functionalBasisTipCloseTimer);
      try {
        if (typeof popover.showPopover === 'function' && !popover.matches(':popover-open')) popover.showPopover();
        else if (typeof popover.showPopover !== 'function') popover.classList.add('is-open');
      } catch { popover.classList.add('is-open'); }
      trigger.setAttribute('aria-expanded', 'true');
      activeFunctionalBasisTip = { trigger: trigger, popover: popover, pinned: Boolean(pinned) };
      positionFunctionalBasisTip(trigger, popover);
    }
    function scheduleFunctionalBasisTipClose() {
      window.clearTimeout(functionalBasisTipCloseTimer);
      if (!activeFunctionalBasisTip || activeFunctionalBasisTip.pinned) return;
      functionalBasisTipCloseTimer = window.setTimeout(function () { hideFunctionalBasisTip(false); }, 180);
    }
    function bindBasisTipSurface(surface) {
      surface.addEventListener('pointerover', function (event) {
        const target = functionalBasisTarget(event.target);
        if (!target) return;
        const trigger = target.closest('.functional-basis-tip-trigger');
        if (trigger && surface.contains(trigger)) {
          showFunctionalBasisTip(trigger, activeFunctionalBasisTip?.trigger === trigger && activeFunctionalBasisTip.pinned);
          return;
        }
        if (target.closest('.functional-basis-popover')) window.clearTimeout(functionalBasisTipCloseTimer);
      });
      surface.addEventListener('pointerout', function (event) {
        const target = functionalBasisTarget(event.target);
        const related = functionalBasisTarget(event.relatedTarget);
        if (!target) return;
        const trigger = target.closest('.functional-basis-tip-trigger');
        const popover = target.closest('.functional-basis-popover');
        if (trigger && related && trigger.contains(related)) return;
        if (popover && related && popover.contains(related)) return;
        if (trigger || popover) scheduleFunctionalBasisTipClose();
      });
      surface.addEventListener('focusin', function (event) {
        const target = functionalBasisTarget(event.target);
        if (!target) return;
        const trigger = target.closest('.functional-basis-tip-trigger');
        if (trigger) showFunctionalBasisTip(trigger, activeFunctionalBasisTip?.trigger === trigger && activeFunctionalBasisTip.pinned);
        if (target.closest('.functional-basis-popover')) window.clearTimeout(functionalBasisTipCloseTimer);
      });
      surface.addEventListener('focusout', function (event) {
        const related = functionalBasisTarget(event.relatedTarget);
        if (activeFunctionalBasisTip && related
          && (activeFunctionalBasisTip.trigger.contains(related) || activeFunctionalBasisTip.popover.contains(related))) return;
        scheduleFunctionalBasisTipClose();
      });
      surface.addEventListener('click', function (event) {
        const target = functionalBasisTarget(event.target);
        const trigger = target?.closest('.functional-basis-tip-trigger');
        if (!trigger) return;
        event.preventDefault();
        if (activeFunctionalBasisTip?.trigger === trigger && activeFunctionalBasisTip.pinned && functionalBasisTipIsOpen(activeFunctionalBasisTip.popover)) {
          hideFunctionalBasisTip(true);
          return;
        }
        showFunctionalBasisTip(trigger, true);
      });
      surface.addEventListener('scroll', function (event) {
        const target = functionalBasisTarget(event.target);
        if (target?.classList.contains('table-scroll')) hideFunctionalBasisTip(true);
      }, true);
    }
    function bindFunctionalBasisTips() {
      bindBasisTipSurface(functionalContent);
      bindBasisTipSurface(content);
      document.addEventListener('pointerdown', function (event) {
        if (!activeFunctionalBasisTip) return;
        const target = functionalBasisTarget(event.target);
        if (target && (activeFunctionalBasisTip.trigger.contains(target) || activeFunctionalBasisTip.popover.contains(target))) return;
        hideFunctionalBasisTip(true);
      });
      document.addEventListener('keydown', function (event) {
        if (event.key !== 'Escape' || !activeFunctionalBasisTip) return;
        const trigger = activeFunctionalBasisTip.trigger;
        hideFunctionalBasisTip(true);
        trigger.focus();
      });
      window.addEventListener('resize', function () { hideFunctionalBasisTip(true); });
    }
    function duration(value) { const ms = Number(value || 0); return ms < 1000 ? ms + ' ms' : (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + ' s'; }
    function localTime(value) { try { return new Date(value).toLocaleString('zh-CN', { hour12: false }); } catch { return String(value || '—'); } }
    function renderDeploymentSummary(result, embedded) {
      const deployment = (data.deploymentByEnvironment || {})[result.environment];
      const catalogHref = './deployments.html?environment=' + encodeURIComponent(result.environment)
        + (deployment?.version ? '&version=' + encodeURIComponent(deployment.version) : '');
      const className = embedded
        ? 'execution-binding-summary execution-binding-inline'
        : 'panel execution-binding-summary';
      if (!deployment) {
        return '<section class="' + className + '"><div><span class="eyebrow">当前版本与环境</span><strong>' + esc(result.environment) + '</strong><small>该历史结果没有可确认的地址绑定。</small></div><a class="case-link" href="' + esc(catalogHref) + '">查看版本、环境与合约地址</a></section>';
      }
      return '<section class="' + className + '"><div><span class="eyebrow">当前版本与环境</span><strong>' + esc(deployment.version) + ' · ' + esc(deployment.environment) + '</strong><small>Chain ' + esc(deployment.environmentChainId) + ' · ' + esc(deployment.deploymentId) + '</small></div><a class="case-link" href="' + esc(catalogHref) + '">查看页面与合约地址</a></section>';
    }
    function asRecord(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
    function trimDecimal(value) {
      const text = String(value == null ? '' : value);
      return text.includes('.') ? text.replace(/0+$/, '').replace(/\\.$/, '') : text;
    }
    function splitFormulaText(value) {
      const normalized = String(value || '')
        .replace(/\\r\\n/g, '\\n')
        .replace(/；/g, '\\n')
        .replace(/;\\s*/g, '\\n')
        .replace(/(?:^|\\n)\\s*本次[:：]?\\s*/g, '\\n本次代入：\\n')
        .replace(/(?:^|\\n)\\s*本次代入[:：]?\\s*/g, '\\n本次代入：\\n')
        .replace(/[ \\t\\u00A0]*：[ \\t\\u00A0]*/g, '：')
        .replace(/\\s*\\n\\s*/g, '\\n')
        .replace(/\\n{2,}/g, '\\n')
        .trim();
      if (!normalized) return [];
      const lines = normalized.split('\\n').map(function (line) { return line.trim(); }).filter(Boolean);
      const hasHeading = lines.some(function (line) {
        return /^(允许清算|因此|同时要求|约束|边界|条件|计算规则|本次代入|核对说明|核对依据|说明|公式|示例|前置|本次)[:：]?$/.test(line);
      });
      if (!hasHeading && lines.length > 1) {
        const firstLine = lines[0];
        if (/[=<>≠≤≥]/.test(firstLine) || /^公式|^计算/.test(firstLine)) {
          return [firstLine].concat(lines.slice(1));
        }
      }
      return lines;
    }
    function renderFormulaLines(value) {
      const renderLine = function (line) {
        const outcome = line.match(/^(.+?[：:])\\s*(拒绝|允许|成立|不成立|通过|不通过|PASS|FAIL|NOT_VERIFIED)$/);
        if (!outcome) return esc(line);
        return esc(outcome[1]) + '<span class="formula-outcome">' + esc(outcome[2]) + '</span>';
      };
      const lines = splitFormulaText(value);
      if (!lines.length) return '';
      return '<div class="formula-lines">' + lines.map(function (line) {
        const sectionHeading = /^(允许清算|因此|同时要求|约束|边界|条件|计算规则|本次代入|核对说明|核对依据|说明|公式|示例)[:：]?$/.test(line);
        const isListLine = /^[-•]\\s*/.test(line);
        const isOrdered = /^\\d+[、.]\\s*/.test(line);
        const isConditionLine = />=|<=|===|==|!==|!=|<|>|&&|\\|\\|/g.test(line);
        const isOutcomeLine = /[：:].*(拒绝|允许|成立|不成立|通过|不通过|PASS|FAIL|NOT_VERIFIED)$/.test(line);
        const isEquationLine = /[^\\s=]+\\s*=/.test(line);
        const isBoundaryLine = /(?:^|\\s)(?:graceEnd|graceDuration|graceStart|minOracleTimestamp|max\\()/.test(line);
        const classes = ['formula-line'];
        if (sectionHeading) classes.push('is-title');
        if (isListLine || isOrdered) classes.push('is-list-item');
        if (isConditionLine) classes.push('is-condition');
        if (isOutcomeLine) classes.push('is-outcome');
        if (isEquationLine) classes.push('is-equation');
        if (isBoundaryLine) classes.push('is-boundary');
        const cleanedLine = line.replace(/^[-•]\\s*/, '').replace(/^\\d+[、.]\\s*/, '');
        return '<div class="' + esc(classes.join(' ')) + '"><code>' + renderLine(cleanedLine) + '</code></div>';
      }).join('') + '</div>';
    }
    function splitFormulaAndSample(value) {
      const raw = String(value || '').trim();
      const explicitMatch = raw.match(/；\\s*本次[:：]?/);
      if (explicitMatch && explicitMatch.index !== undefined) {
        return {
          rule: raw.slice(0, explicitMatch.index).trim(),
          sample: raw.slice(explicitMatch.index + explicitMatch[0].length).trim(),
        };
      }
      const inlineMatch = raw.match(/\\n\\s*本次代入[:：]?/);
      if (inlineMatch && inlineMatch.index !== undefined) {
        return {
          rule: raw.slice(0, inlineMatch.index).trim(),
          sample: raw.slice(inlineMatch.index + inlineMatch[0].length).trim(),
        };
      }
      const fallbackMatch = raw.match(/[;\\uff1b]\\s*/);
      if (fallbackMatch && fallbackMatch.index !== undefined) {
        return {
          rule: raw.slice(0, fallbackMatch.index).trim(),
          sample: raw.slice(fallbackMatch.index + fallbackMatch[0].length).trim(),
        };
      }
      return { rule: raw, sample: '' };
    }
    function normalizeFormulaText(value) {
      if (value === undefined || value === null) return '';
      if (typeof value === 'string') return value;
      if (typeof value === 'object') {
        if ('expanded' in value && typeof value.expanded === 'string' && value.expanded.trim()) return value.expanded;
        if ('expression' in value && typeof value.expression === 'string' && value.expression.trim()) return value.expression;
        if ('raw' in value && typeof value.raw === 'string' && value.raw.trim()) return value.raw;
      }
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }

    function parseFunctionalFormula(value) {
      if (!value) return { id: '', version: '', expression: '', raw: '' };
      if (typeof value === 'object') {
        const objectValue = value;
        return {
          id: typeof objectValue.id === 'string' ? objectValue.id : '',
          version: typeof objectValue.version === 'string' ? objectValue.version : '',
          expression: normalizeFormulaText({
            expanded: typeof objectValue.expanded === 'string' ? objectValue.expanded : undefined,
            expression: typeof objectValue.expression === 'string' ? objectValue.expression : undefined,
            raw: typeof objectValue.raw === 'string' ? objectValue.raw : '',
          }),
          raw: normalizeFormulaText(value),
        };
      }
      if (typeof value !== 'string') return { id: '', version: '', expression: String(value), raw: String(value) };
      const normalized = value.trim();
      const match = normalized.match(/^([^@]+?)@([^：:\\s]+)\\s*[:：]\\s*([\\s\\S]+)$/);
      if (!match) return { id: '', version: '', expression: normalized, raw: normalized };
      return {
        id: match[1].trim(),
        version: match[2].trim(),
        expression: match[3].trim(),
        raw: normalized,
      };
    }

    function extractFormulaLikeFromText(value) {
      const text = String(value || '').trim();
      if (!text) return '';
      const normalized = text
        .replace(/；/g, ';')
        .replace(/[\\uFF0B]/g, '+')
        .replace(/[−—–]/g, '-')
        .replace(/[\\uFF0D\\uFE63]/g, '-')
        .replace(/[\\uFF1D]/g, '=')
        .replace(/[\\uFF1C]/g, '<')
        .replace(/[\\uFF1E]/g, '>');
      const lines = normalized
        .split(/[\\n;]+/)
        .map(function (line) { return line.trim(); })
        .filter(Boolean);
      const isMetadataLine = function (line) {
        return /^(verification|sources?|source|formula)\\s*=/.test(line.toLowerCase());
      };
      const isFormulaLine = function (line) {
        if (!/[=<>≠≤≥]|[\\u2248]/.test(line)) return false;
        if (isMetadataLine(line)) return false;
        const sides = line.split('=');
        if (!sides.length || sides.length === 1) return false;
        const rhs = sides.slice(1).join('=').trim();
        if (!rhs || !sides[0].trim()) return false;
        const compactLine = line.replace(/\\s+/g, '');
        const hasArithmetic = /[+\\-*/()%<>≤≥≠≈⊕⊗∕]|(?:\\b(?:floor|ceil|abs|min|max)\\b)/i.test(compactLine);
        const hasNumericRhs = /-?0x[0-9a-fA-F]+/.test(rhs) || /\\d/.test(rhs);
        const rhsCompact = rhs.replace(/\\s+/g, '');
        const hasSymbolicRhs = /^[A-Za-z0-9_\\u4e00-\\u9fff.+*()\\/\\-]+$/.test(rhsCompact);
        return hasArithmetic || hasNumericRhs || hasSymbolicRhs;
      };
      for (const line of lines) {
        const normalized = line
          .replace(/^\\d+[、.)]\\s*/, '')
          .replace(/^[•▪-]\\s*/, '')
          .trim();
        if (isFormulaLine(normalized)) {
          return normalized;
        }
      }
      return '';
    }

    function splitFunctionalNote(value) {
      const text = String(value || '').trim();
      if (!text) return { verification: '', sources: [], extras: [] };
      const chunks = text.replace(/；/g, ';').split(';').map(function (item) { return item.trim(); }).filter(Boolean);
      const result = { verification: '', sources: [], extras: [] };
      chunks.forEach(function (chunk) {
        if (/^verification\\s*=/.test(chunk.toLowerCase())) {
          result.verification = chunk.replace(/^verification\\s*=/i, '').trim();
          return;
        }
        if (/^sources\\s*=/.test(chunk.toLowerCase())) {
          const sourceText = chunk.replace(/^sources\\s*=/i, '').trim();
          sourceText.split(/；|;/).map(function (item) { return item.trim(); }).filter(Boolean).forEach(function (source) {
            result.sources.push(source);
          });
          return;
        }
        result.extras.push(chunk);
      });
      return result;
    }
    function mapFunctionalVerification(value) {
      const key = String(value || '').toLowerCase();
      if (key === 'full_recompute' || key === 'full-recompute' || key === 'full_recompute@v2') return '完整复算';
      if (key === 'event_anchored') return '事件对照';
      if (key === 'eventanchored') return '事件对照';
      if (key === 'event') return '事件对照';
      if (key === 'recompute' || key === 'not_applicable') return '复算不可得';
      if (key === 'identity') return '恒等式';
      if (key === 'not_verified' || key === 'not verified' || key === 'notverified') return '未核对';
      if (key === 'presence' || key === 'presense') return '存在性核对';
      if (key === 'conservation' || key === 'whole_flow') return '守恒';
      return value || '未记录';
    }
    function renderFunctionalSourceList(sources) {
      if (!sources || !sources.length) return '<p>核对依据来源：未记录。</p>';
      return '<ul>' + sources.map(function (source) {
        return '<li><code>' + esc(source) + '</code></li>';
      }).join('') + '</ul>';
    }
    function formulaSource(item) {
      const sourcePath = item.basis?.sourcePath || '';
      const formulaHref = sourcePath.includes('页面字段计算公式') ? './page-formulas.html' : './formulas.html';
      return '<a href="' + esc(formulaHref) + '">' + esc(item.basis?.section || '公式章节') + '</a> · ' + esc(item.basis?.title || '核对依据') + '<br><code>' + esc(sourcePath || '未记录来源路径') + '</code>';
    }
    function formatRawUnits(value, decimals, maximumFractionDigits) {
      const raw = String(value == null ? '' : value);
      if (!/^-?\\d+$/.test(raw)) return raw || '—';
      const negative = raw.startsWith('-');
      const digits = negative ? raw.slice(1) : raw;
      const padded = digits.padStart(decimals + 1, '0');
      const wholeRaw = decimals > 0 ? padded.slice(0, -decimals) : padded;
      const fractionRaw = decimals > 0 ? padded.slice(-decimals) : '';
      const fraction = fractionRaw.slice(0, maximumFractionDigits).replace(/0+$/, '');
      const whole = wholeRaw.replace(/^0+(?=\\d)/, '').replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',');
      return (negative ? '-' : '') + whole + (fraction ? '.' + fraction : '');
    }
    function firstFunctionalValue(values) {
      for (const value of values) {
        if (value !== undefined && value !== null && value !== '') return value;
      }
      return undefined;
    }
    function functionalActions(context) {
      return Array.isArray(context?.actions) ? context.actions.map(asRecord).filter(Boolean) : [];
    }
    function functionalActionKind(actionKey, action) {
      if (actionKey === 'createOpen' || actionKey === 'executeOpen' || actionKey === 'createClose' || actionKey === 'executeClose') return actionKey;
      if (!action) return actionKey;
      if (action.type === 'submitMarketIncrease') return 'createOpen';
      if (action.type === 'submitMarketDecrease') return 'createClose';
      if (action.type === 'executeOrder' && action.purpose === 'cleanup') return 'executeClose';
      if (action.type === 'executeOrder') return 'executeOpen';
      return actionKey;
    }
    function findFunctionalAction(context, actionKey, transaction) {
      const actions = functionalActions(context);
      const transactionHash = String(transaction?.hash || '').toLowerCase();
      if (transactionHash) {
        const byTransaction = actions.find(function (action) {
          return Array.isArray(action.transactions) && action.transactions.some(function (item) {
            const record = asRecord(item);
            return String(record?.txHash || '').toLowerCase() === transactionHash;
          });
        });
        if (byTransaction) return byTransaction;
      }
      const byId = actions.find(function (action) {
        const actionId = String(action.actionId || '');
        return actionKey === actionId || String(actionKey || '').startsWith(actionId + ':');
      });
      if (byId) return byId;
      const legacyShape = {
        createOpen: function (action) { return action.type === 'submitMarketIncrease' && action.purpose === 'primary'; },
        executeOpen: function (action) { return action.type === 'executeOrder' && action.purpose === 'primary'; },
        createClose: function (action) { return action.type === 'submitMarketDecrease' && action.purpose === 'cleanup'; },
        executeClose: function (action) { return action.type === 'executeOrder' && action.purpose === 'cleanup'; },
      };
      const matcher = legacyShape[actionKey];
      return matcher ? actions.find(matcher) || null : null;
    }
    function findFunctionalCanonicalAction(context, type, purpose) {
      return functionalActions(context).find(function (action) {
        return action.type === type && (!purpose || action.purpose === purpose);
      }) || null;
    }
    function findFunctionalEvent(action, names) {
      if (!action || !Array.isArray(action.events)) return null;
      return action.events.map(asRecord).find(function (event) { return names.includes(event?.name); }) || null;
    }
    function functionalEventParts(event) {
      const args = asRecord(event?.args) || {};
      return {
        uint: asRecord(args.uint) || args,
        int: asRecord(args.int) || {},
        bool: asRecord(args.bool) || {},
        bytes32: asRecord(args.bytes32) || {},
      };
    }
    function functionalTransactionForAction(action, transaction) {
      if (!action || !Array.isArray(action.transactions)) return null;
      const transactions = action.transactions.map(asRecord).filter(Boolean);
      const transactionHash = String(transaction?.hash || '').toLowerCase();
      return transactions.find(function (item) { return String(item.txHash || '').toLowerCase() === transactionHash; }) || transactions[0] || null;
    }
    function functionalOrderKey(action, transaction, eventParts) {
      const orderRefs = asRecord(action?.orderRefs);
      const canonicalTransaction = functionalTransactionForAction(action, transaction);
      return firstFunctionalValue([
        orderRefs?.order,
        canonicalTransaction?.orderKey,
        eventParts?.bytes32?.orderKey,
        eventParts?.bytes32?.key,
      ]);
    }
    function functionalSnapshotDelta(action, valueKey) {
      if (!action || !Array.isArray(action.snapshots) || action.snapshots.length < 2) return undefined;
      const first = asRecord(action.snapshots[0]);
      const last = asRecord(action.snapshots[action.snapshots.length - 1]);
      const before = asRecord(first?.values)?.[valueKey];
      const after = asRecord(last?.values)?.[valueKey];
      if (!/^-?\\d+$/.test(String(before ?? '')) || !/^-?\\d+$/.test(String(after ?? ''))) return undefined;
      try { return (BigInt(after) - BigInt(before)).toString(); } catch { return undefined; }
    }
    function functionalLeverage(sizeRaw, collateralRaw, collateralDecimals) {
      if (!/^[0-9]+$/.test(String(sizeRaw ?? '')) || !/^[0-9]+$/.test(String(collateralRaw ?? ''))) return undefined;
      try {
        const collateral = BigInt(collateralRaw);
        if (collateral === 0n) return undefined;
        const precision = 6;
        const scaled = BigInt(sizeRaw) * (10n ** BigInt(collateralDecimals + precision));
        const ratio = scaled / (collateral * (10n ** 30n));
        return formatRawUnits(ratio.toString(), precision, precision);
      } catch { return undefined; }
    }
    function functionalMarketMetadata(context, marketIndex) {
      const environment = asRecord(context?.environment);
      const environmentName = environment?.name;
      const deployment = asRecord((data.deploymentByEnvironment || {})[environmentName]);
      const markets = Array.isArray(deployment?.markets) ? deployment.markets.map(asRecord).filter(Boolean) : [];
      const market = markets.find(function (item) { return String(item.marketIndex) === String(marketIndex); });
      const mockResources = asRecord(deployment?.mockResources);
      const bundles = Array.isArray(mockResources?.bundles) ? mockResources.bundles.map(asRecord).filter(Boolean) : [];
      const bundle = bundles.find(function (item) { return String(asRecord(item.market)?.marketIndex) === String(marketIndex); });
      const sharedCollateral = asRecord(mockResources?.sharedCollateral);
      return {
        indexTokenDecimals: firstFunctionalValue([
          market?.indexTokenDecimals,
          asRecord(bundle?.token)?.decimals,
          asRecord(environment?.market)?.indexTokenDecimals,
          context?.indexTokenDecimals,
          18,
        ]),
        indexTokenSymbol: firstFunctionalValue([
          market?.symbol,
          asRecord(bundle?.token)?.symbol,
          asRecord(environment?.market)?.symbol,
          'Token',
        ]),
        collateralTokenDecimals: firstFunctionalValue([
          market?.collateralTokenDecimals,
          asRecord(sharedCollateral?.token)?.decimals,
          6,
        ]),
        collateralTokenSymbol: firstFunctionalValue([
          asRecord(sharedCollateral?.token)?.symbol,
          'USDC',
        ]),
      };
    }
    function renderFunctionalTradeSummary(evidence, actionKey, transaction) {
      const context = asRecord(evidence?.data);
      const leverage = asRecord(context?.leverage);
      const actionData = asRecord(evidence?.actionData);
      const selectedAction = asRecord(actionData?.[actionKey]);
      const openExecution = asRecord(context?.openExecution);
      if (!transaction) return '';
      const canonicalAction = findFunctionalAction(context, actionKey, transaction);
      const summaryKind = functionalActionKind(actionKey, canonicalAction);
      const primaryOpenAction = findFunctionalCanonicalAction(context, 'submitMarketIncrease', 'primary');
      const executeOpenAction = findFunctionalCanonicalAction(context, 'executeOrder', 'primary');
      const executeCloseAction = findFunctionalCanonicalAction(context, 'executeOrder', 'cleanup');
      const primaryInput = asRecord(primaryOpenAction?.input) || {};
      const isClose = summaryKind === 'createClose' || summaryKind === 'executeClose';
      const isExecute = summaryKind === 'executeOpen' || summaryKind === 'executeClose' || canonicalAction?.type === 'executeOrder';
      const executionAction = isClose ? executeCloseAction : executeOpenAction;
      const executionEvent = findFunctionalEvent(executionAction, isClose ? ['PositionDecrease'] : ['PositionIncrease']);
      const eventParts = functionalEventParts(executionEvent);
      const side = firstFunctionalValue([primaryInput.side, eventParts.bool.isLong, context?.isLong]);
      const isLong = side === 'long' || side === true || (side !== 'short' && side !== false && String(side) !== 'false');
      const canonicalEnvironment = asRecord(context?.environment);
      const canonicalMarket = asRecord(canonicalEnvironment?.market);
      const marketIndex = firstFunctionalValue([canonicalMarket?.marketIndex, eventParts.uint.marketIndex, context?.marketIndex]);
      const metadata = functionalMarketMetadata(context, marketIndex);
      const collateralDecimals = Number(metadata.collateralTokenDecimals);
      const tokenDecimals = Number(metadata.indexTokenDecimals);
      const sizeRaw = firstFunctionalValue([primaryInput.sizeDeltaUsd, selectedAction?.sizeDeltaUsd, eventParts.uint.sizeDeltaUsd, context?.sizeDeltaUsd]);
      const collateralRaw = firstFunctionalValue([primaryInput.collateralAmount, context?.collateral]);
      const margin = trimDecimal(firstFunctionalValue([
        context?.collateralUsdcText,
        collateralRaw !== undefined ? formatRawUnits(collateralRaw, collateralDecimals, 6) : undefined,
        '—',
      ]));
      const leverageX = trimDecimal(firstFunctionalValue([
        leverage?.grossX,
        functionalLeverage(sizeRaw, collateralRaw, collateralDecimals),
        '—',
      ]));
      const size = trimDecimal(firstFunctionalValue([
        context?.sizeUsdText,
        sizeRaw !== undefined ? formatRawUnits(sizeRaw, 30, 6) : undefined,
        '—',
      ]));
      const direction = isClose ? (isLong ? '平多' : '平空') : (isLong ? '开多' : '开空');
      const canonicalTransaction = functionalTransactionForAction(canonicalAction, transaction);
      const actor = canonicalTransaction?.role === 'keeper' || isExecute
        ? 'Keeper'
        : canonicalTransaction?.role === 'trader' || summaryKind === 'createOpen' || summaryKind === 'createClose'
          ? '交易员'
          : '链上账户';
      const internalPriceDecimals = Math.max(0, 30 - tokenDecimals);
      const executionRaw = isExecute ? firstFunctionalValue([
        selectedAction?.executionPrice,
        eventParts.uint.executionPrice,
        summaryKind === 'executeOpen' ? openExecution?.executionPrice : undefined,
      ]) : undefined;
      const oracleMinRaw = isExecute ? firstFunctionalValue([
        selectedAction?.indexPriceMin,
        eventParts.uint['indexTokenPrice.min'],
        summaryKind === 'executeOpen' ? openExecution?.indexPriceMin : undefined,
      ]) : undefined;
      const oracleMaxRaw = isExecute ? firstFunctionalValue([
        selectedAction?.indexPriceMax,
        eventParts.uint['indexTokenPrice.max'],
        summaryKind === 'executeOpen' ? openExecution?.indexPriceMax : undefined,
      ]) : undefined;
      const orderKey = firstFunctionalValue([
        selectedAction?.orderKey,
        functionalOrderKey(canonicalAction, transaction, eventParts),
        summaryKind === 'createOpen' || summaryKind === 'executeOpen' ? openExecution?.orderKey : undefined,
      ]);
      const executionPrice = executionRaw
        ? formatRawUnits(executionRaw, internalPriceDecimals, 6)
        : '—';
      const oracleMin = oracleMinRaw ? formatRawUnits(oracleMinRaw, internalPriceDecimals, 6) : '—';
      const oracleMax = oracleMaxRaw ? formatRawUnits(oracleMaxRaw, internalPriceDecimals, 6) : '—';
      const pnlRaw = firstFunctionalValue([selectedAction?.basePnlUsd, eventParts.int.basePnlUsd]);
      const traderUsdcDeltaRaw = firstFunctionalValue([
        selectedAction?.traderUsdcDelta,
        functionalSnapshotDelta(executeCloseAction, 'traderUsdc'),
      ]);
      const pnl = pnlRaw !== undefined ? formatRawUnits(pnlRaw, 30, 6) : '—';
      const traderUsdcDelta = traderUsdcDeltaRaw !== undefined ? formatRawUnits(traderUsdcDeltaRaw, collateralDecimals, 6) : '—';
      let narrative;
      let cardItems;
      if (summaryKind === 'createOpen') {
        narrative = '交易员提交 ' + margin + ' USDC、' + leverageX + 'x 市价' + direction + '订单；' + size + ' USD 仓位订单已创建，USDC 从 Trader 转入 OrderVault。';
        cardItems = [['Margin', margin + ' USDC'], ['Leverage', leverageX + 'x'], ['Position Size', size + ' USD'], ['订单状态', '已创建']];
      } else if (summaryKind === 'executeOpen') {
        narrative = 'Keeper 执行' + direction + '订单；实际成交价 ' + executionPrice + ' USD，仓位规模 ' + size + ' USD。';
        cardItems = [['执行状态', '已执行'], ['Execution Price', executionPrice + ' USD'], ['Oracle Min / Max', oracleMin + ' / ' + oracleMax], ['Position Size', size + ' USD']];
      } else if (summaryKind === 'createClose') {
        narrative = '交易员提交 ' + size + ' USD 市价' + direction + '订单；订单已创建，等待 Keeper 执行全平。';
        cardItems = [['Position Size', size + ' USD'], ['平仓方式', '市价全平'], ['方向', direction], ['订单状态', '已创建']];
      } else if (summaryKind === 'executeClose') {
        narrative = 'Keeper 执行' + direction + '订单；实际成交价 ' + executionPrice + ' USD，Trader USDC 净变动 ' + traderUsdcDelta + ' USDC。';
        cardItems = [['执行状态', '已执行'], ['Execution Price', executionPrice + ' USD'], ['Base PnL', pnl + ' USD'], ['Trader USDC Δ', traderUsdcDelta + ' USDC']];
      } else {
        narrative = actor + '执行“' + transaction.label + '”；交易回执与该动作核对项已载入。';
        cardItems = [['执行角色', actor], ['动作', transaction.label], ['状态', transaction.status || 'RECORDED'], ['Block', transaction.blockNumber || '—']];
      }
      const cards = cardItems.map(function (item) { return '<article><span>' + esc(item[0]) + '</span><strong>' + esc(item[1]) + '</strong></article>'; }).join('');
      const priceMeta = executionRaw ? '<dt>Execution Price Raw</dt><dd><code>' + esc(executionRaw) + '</code></dd><dt>Raw 换算口径</dt><dd>raw ÷ 10^(30 − Index Token Decimals)；本次 Index Token Decimals = ' + esc(tokenDecimals) + '，因此除以 1e' + esc(internalPriceDecimals) + '</dd>' : '';
      return '<section class="functional-action-submodule functional-trade-summary" data-trade-action="' + esc(actionKey) + '"><div class="functional-submodule-head"><div><span class="eyebrow">测试数据</span><h3>交易概要</h3><p>' + esc(narrative) + '</p></div><span class="trade-direction ' + (isLong ? 'long' : 'short') + '">' + esc(direction) + '</span></div><div class="trade-summary-grid">' + cards + '</div><dl class="trade-summary-meta"><dt>执行角色</dt><dd>' + esc(actor) + '</dd><dt>Market</dt><dd>#' + esc(marketIndex ?? '—') + '</dd><dt>Order Key</dt><dd><code>' + esc(orderKey || '—') + '</code></dd>' + priceMeta + '</dl></section>';
    }
    function plainError(value) { return String(value || '').replace(/\\u001b\\[[0-9;]*m/g, ''); }
    function shortError(value) { const firstLine = plainError(value).split(/\\r?\\n/)[0] || '—'; return firstLine.length > 220 ? firstLine.slice(0, 220) + '…' : firstLine; }
    function functionalKey(item) { return item.id + ':' + item.project + ':' + (item.batchId || item.resultRunId || item.executedAt); }
    function functionalKind(item) { return String(item.id || '').split('-')[0]; }
    function initializeFunctionalBatchFilter() {
      const batchIds = Array.from(new Set((data.functionalResults || []).map(function (item) { return item.batchId; }).filter(Boolean))).sort().reverse();
      functionalControls.batch.innerHTML = '<option value="">全部批次</option>' + batchIds.map(function (id) { return '<option value="' + esc(id) + '">' + esc(id) + '</option>'; }).join('');
      const requestedBatch = urlQuery.get('batch');
      if (requestedBatch && batchIds.includes(requestedBatch)) functionalControls.batch.value = requestedBatch;
    }
    function layerValue(item, layer) { const definition = functionalCaseById.get(item.id); return definition && definition.layers ? definition.layers[layer] : 'NOT_RUN'; }
    function formulaBasis(item, tipId) {
      const parsed = splitFormulaAndSample(item.formula || '');
      const inputsBlock = item.inputs && item.inputs.length
        ? '<details class="check-inputs" open><summary>输入来源 ' + item.inputs.length + ' 项</summary><ul>'
          + item.inputs.map(function (entry) {
            return '<li><code>' + esc(entry.name) + '</code> = ' + esc(entry.value) + '<br><small class="muted">← ' + esc(entry.source) + '</small></li>';
          }).join('')
          + '</ul></details>'
        : '';
      const formulaRule = parsed.rule
        ? '<section class="scenario-formula-section formula-rule"><span>计算规则</span>' + renderFormulaLines(parsed.rule) + '</section>'
        : '';
      const formulaSample = parsed.sample
        ? '<section class="scenario-formula-section formula-example"><span>本次代入</span>' + renderFormulaLines(parsed.sample) + '</section>'
        : '';
      const noteParts = item.note ? splitFormulaText(item.note) : [];
      const noteContent = noteParts.length > 1
        ? '<ul>' + noteParts.map(function (part) { return '<li>' + esc(part) + '</li>'; }).join('') + '</ul>'
        : item.note
          ? '<p>' + esc(item.note) + '</p>'
          : '';
      const noteBlock = item.note
        ? '<section class="scenario-formula-section formula-note"><span>核对说明</span>' + noteContent + '</section>'
        : '';
      const basisBlock = '<section class="scenario-formula-section formula-basis"><span>核对依据</span>' + formulaSource(item) + '</section>';
      const tipLabel = item.note ? '查看核对说明与依据' : '查看核对依据';
      const basisTip = '<span class="functional-basis-tip scenario-basis-tip"><button type="button" class="functional-basis-tip-trigger scenario-basis-tip-trigger" data-functional-basis-tip="' + esc(tipId) + '" aria-controls="' + esc(tipId) + '" aria-expanded="false" aria-haspopup="dialog"><span aria-hidden="true">ⓘ</span> ' + tipLabel + '</button><div id="' + esc(tipId) + '" class="functional-basis-popover scenario-basis-popover" popover="manual" role="dialog" aria-label="' + tipLabel + '">' + noteBlock + basisBlock + '</div></span>';
      return '<div class="scenario-formula-stack">'
        + formulaRule
        + formulaSample
        + basisTip
        + '</div>'
        + inputsBlock;
    }
    function txStepId(tx, index) { return tx.stepId || ('TX' + (index + 1)); }
    function stepRows(evidence, stepId) {
      return stepId === 'ALL' ? evidence.reconciliations : evidence.reconciliations.filter(function (item) { return item.txStep === stepId; });
    }
    function countStatuses(rows) {
      return rows.reduce(function (counts, item) { counts[item.status] = (counts[item.status] || 0) + 1; return counts; }, {});
    }
    function renderTxDetails(tx, index, open) {
      const stepId = txStepId(tx, index);
      return '<details class="tx-record panel"' + (open ? ' open' : '') + '><summary><span class="tx-sequence">' + esc(stepId) + '</span><span><strong>' + esc(tx.action) + '</strong><small><span class="actor actor-' + esc(tx.actor) + '">' + actorLabel(tx.actor) + '</span> · Block ' + esc(tx.blockNumber) + ' · ' + esc(shortHash(tx.txHash)) + '</small></span>' + status(tx.status) + '</summary>'
        + '<dl><dt>动作说明</dt><dd>' + esc(tx.summary || tx.action) + '</dd><dt>Tx Hash</dt><dd><code>' + esc(tx.txHash) + '</code> <a class="api-link" href="./api/transactions/' + esc(tx.txHash) + '" target="_blank" rel="noreferrer">打开 JSON 回执</a></dd>'
        + '<dt>From</dt><dd><code>' + esc(tx.from) + '</code></dd><dt>To</dt><dd><code>' + esc(tx.to) + '</code></dd>'
        + '<dt>Block</dt><dd>' + esc(tx.blockNumber) + '</dd><dt>Type / Nonce</dt><dd>' + esc(tx.transactionType) + ' / ' + esc(tx.nonce) + '</dd>'
        + '<dt>Gas Used</dt><dd>' + esc(tx.gasUsed) + '</dd><dt>Order Key</dt><dd><code>' + esc(tx.orderKey || '-') + '</code></dd>'
        + '<dt>签名核对</dt><dd>' + (tx.signatureVerified ? 'PASS：r/s 均为非零，from 与预期角色一致' : 'FAIL：签名字段不完整') + '</dd></dl></details>';
    }
    function renderExecutionSteps(evidence) {
      if (!evidence.transactions.length) return '<section class="panel"><h2>交易步骤</h2><p class="muted">没有交易证据。</p></section>';
      const allCounts = countStatuses(evidence.reconciliations);
      const orderCount = new Set(evidence.transactions.map(function (tx) { return tx.orderKey; }).filter(Boolean)).size;
      const flowSummary = evidence.transactions.length + ' 笔链上交易' + (orderCount ? ' / ' + orderCount + ' 个业务订单' : '');
      const buttons = ['<button type="button" class="tx-step-tab" data-tx-step="ALL"><span>全流程</span><strong>' + flowSummary + '</strong><small>' + evidence.reconciliations.length + ' 项数据核对</small></button>'].concat(evidence.transactions.map(function (tx, index) {
        const stepId = txStepId(tx, index); const counts = countStatuses(stepRows(evidence, stepId));
        const warning = (counts.FAIL || 0) + (counts.NOT_VERIFIED || 0);
        return '<button type="button" class="tx-step-tab" data-tx-step="' + esc(stepId) + '"><span>' + esc(stepId) + ' · ' + actorLabel(tx.actor) + '</span><strong>' + esc(tx.action) + '</strong><small>Block ' + esc(tx.blockNumber) + ' · ' + (counts.PASS || 0) + ' PASS' + (warning ? ' · ' + warning + ' 待关注' : '') + '</small></button>';
      })).join('');
      return '<section class="panel section tx-workflow"><div class="section-head"><div><h2>按交易动作核对</h2><p class="muted">' + flowSummary + '；Keeper 执行是订单的执行交易，不是新的订单类型。每笔交易使用自己的区块快照。</p></div><strong>' + (allCounts.PASS || 0) + ' PASS · ' + (allCounts.FAIL || 0) + ' FAIL</strong></div><div class="tx-step-tabs">' + buttons + '</div></section><section id="tx-step-content"></section>';
    }
    function renderStepHighlights(rows) {
      const patterns = [
        /^ΔTrader$/,
        /^ΔOrderVault$/,
        /^ΔPositionVault$/,
        /^ΔLPVaultAssets$/,
        /^ΔFee(?:Handler|Receiver)$/,
        /仓位规模|sizeInUsd/,
        /仓位 Margin/,
        /^Position Fee（链上实际/,
        /Protocol Fee 及分账守恒/,
        /Funding 净额/,
        /PnL/,
        /资金守恒/,
      ];
      const selected = [];
      patterns.forEach(function (pattern) {
        const item = rows.find(function (row) { return pattern.test(row.label) && !selected.some(function (picked) { return picked.id === row.id; }); });
        if (item) selected.push(item);
      });
      if (!selected.length) return '';
      function card(item) {
        return '<div><span>' + esc(item.label) + '</span><strong>' + esc(item.delta || item.after) + '</strong><small>' + status(item.status) + '</small></div>';
      }
      const conservationRows = selected.filter(function (item) { return /守恒/.test(item.label); });
      const metricRows = selected.filter(function (item) { return !/守恒/.test(item.label); });
      return (metricRows.length ? '<div class="tx-highlight-grid">' + metricRows.map(card).join('') + '</div>' : '')
        + (conservationRows.length ? '<div class="tx-conservation-grid">' + conservationRows.map(card).join('') + '</div>' : '');
    }
    function renderStepContent(evidence, stepId) {
      hideFunctionalBasisTip(true);
      const mount = document.getElementById('tx-step-content'); if (!mount) return;
      const rows = stepRows(evidence, stepId);
      if (stepId === 'ALL') {
        mount.innerHTML = '<section class="tx-record-list">' + evidence.transactions.map(function (tx, index) { return renderTxDetails(tx, index, false); }).join('') + '</section>' + renderChecks(rows, '全流程数据核对');
      } else {
        const index = evidence.transactions.findIndex(function (tx, txIndex) { return txStepId(tx, txIndex) === stepId; });
        const tx = evidence.transactions[index];
        mount.innerHTML = tx ? '<section class="panel tx-action-summary"><div class="tx-action-main"><span class="eyebrow">' + esc(stepId) + ' · ' + actorLabel(tx.actor) + '</span><h2>' + esc(tx.action) + '</h2><p>' + esc(tx.summary || tx.action) + '</p>' + renderStepHighlights(rows) + '</div><div class="tx-action-metrics"><span>' + status(tx.status) + '</span><span>Block <strong>' + esc(tx.blockNumber) + '</strong></span><span>核对 <strong>' + rows.length + ' 项</strong></span></div></section>' + renderTxDetails(tx, index, false)
          + (rows.length ? renderChecks(rows, stepId + ' 数据核对') : '<section class="panel empty"><strong>该交易没有独立区块快照。</strong><p>这是历史执行证据；重新运行用例后会采集该 TX 的 Before / After 并生成独立核对。</p></section>') : '';
      }
      bindCheckFilters();
    }
    function bindExecutionSteps(evidence) {
      const buttons = Array.from(document.querySelectorAll('#execution-panel-scenario .tx-step-tab[data-tx-step]'));
      const requestedHash = new URLSearchParams(location.search).get('tx');
      const requestedTx = evidence.transactions.findIndex(function (tx) { return tx.txHash === requestedHash; });
      const failedTx = evidence.transactions.findIndex(function (tx, index) {
        return tx.status !== 'SUCCESS' || stepRows(evidence, txStepId(tx, index)).some(function (row) { return row.status === 'FAIL'; });
      });
      const initial = requestedTx >= 0 ? txStepId(evidence.transactions[requestedTx], requestedTx)
        : failedTx >= 0 ? txStepId(evidence.transactions[failedTx], failedTx) : txStepId(evidence.transactions[0], 0);
      function selectStep(stepId) {
        buttons.forEach(function (button) { button.classList.toggle('is-active', button.dataset.txStep === stepId); });
        renderStepContent(evidence, stepId);
      }
      buttons.forEach(function (button) { button.addEventListener('click', function () { selectStep(button.dataset.txStep); }); });
      selectStep(initial);
    }
    function renderCaseOverview(result) {
      const testCase = data.cases.find(function (item) { return item.id === result.id; });
      const intent = testCase?.roleIntent || ('验证“' + result.scenarioTitle + '”用户路径与链上结果');
      const expected = testCase?.expected || result.expectedStatus;
      return '<section class="panel case-overview"><div class="section-head"><div><h2>测试用例概述</h2><p class="muted">执行证据对应的用户场景、操作步骤与核心期望。</p></div>'
        + '<a class="case-link" href="./test-cases.html?scenario=' + encodeURIComponent(result.id) + '">查看 / 编辑完整测试用例</a></div>'
        + '<div class="case-meta"><span><strong>' + esc(result.id) + '</strong></span><span>' + esc(result.suite) + '</span><span>' + esc(result.priority) + '</span><span>期望状态 ' + esc(result.expectedStatus) + '</span></div>'
        + '<dl class="case-summary"><dt>场景</dt><dd>' + esc(result.scenarioTitle) + '</dd><dt>角色与意图</dt><dd>' + esc(intent) + '</dd></dl>'
        + '<div class="case-important-grid">'
        + '<article><h3>前置条件</h3><p>' + esc(testCase?.preconditions || '详见完整测试用例') + '</p></article>'
        + '<article><h3>测试数据</h3><p>' + esc(testCase?.testData || '详见完整测试用例') + '</p></article>'
        + '<article class="wide"><h3>用户操作步骤</h3><p>' + esc(testCase?.steps || '详见完整测试用例') + '</p></article>'
        + '<article class="wide expected"><h3>核对数据与期望结果</h3><p>' + esc(expected) + '</p></article>'
        + '<article class="wide"><h3>恢复 / 清理</h3><p>' + esc(testCase?.cleanup || '详见完整测试用例') + '</p></article></div>'
        + '<details class="case-environment"><summary>执行环境与环境准备（默认折叠）</summary><dl>'
        + '<dt>计划 Project</dt><dd>' + esc(testCase?.targetProject || result.project) + '</dd><dt>资产 / Oracle</dt><dd>' + esc((testCase?.marketMode || '未配置') + ' / ' + (testCase?.oracleMode || '未配置') + (testCase?.mockResourceAlias === 'default-mock' ? ' / default-mock' : '')) + '</dd>'
        + '<dt>时间 / 签名</dt><dd>' + esc((testCase?.timeMode || '未配置') + ' / ' + (testCase?.signingMode || '未配置')) + '</dd><dt>环境准备</dt><dd>' + esc(testCase?.environmentSetup || '详见完整测试用例') + '</dd>'
        + (testCase?.sourcePath ? '<dt>用例来源</dt><dd><code>' + esc(testCase.sourcePath) + '</code></dd>' : '') + '</dl></details></section>';
    }
    function checkCategory(item) {
      const group = item.group;
      const label = item.label;
      if (group === '守恒' || /守恒/.test(label)) return '守恒';
      if (/^Δ(?:Trader|OrderVault|PositionVault|LPVaultAssets|FeeHandler|FeeReceiver)$/.test(label) || /Fee(?:Handler|Receiver)\\s+USDC/i.test(label)) return '资金 / Vault';
      if (group.includes('Grace') || /grace|保护期/i.test(label)) return 'Grace';
      if (/清算|Liquidat|ADL|Adl/.test(group + ' ' + label)) return '清算/ADL';
      // 价格功能点：Oracle 价、执行价（成交价格组 + OI/Skew 组内的 Spread 调整后执行价）、Dynamic Spread。
      // 需在 OI/Skew 规则之前判定，否则会被组名里的 Spread 抢走。
      if (/执行价|价格|Dynamic Spread/.test(group + ' ' + label)) return '价格';
      if (group.includes('Funding') || label.includes('Funding')) return 'Funding';
      if (group.includes('Fee') || /Fee|费用|仓位费/.test(label)) return 'Fee';
      if (group.includes('PnL') || label.includes('PnL')) return 'PnL';
      if (/OI|Skew|Spread/.test(group + ' ' + label)) return 'OI / Skew';
      if (group.includes('仓位') || label.includes('仓位')) return '仓位';
      if (/资金|账本|Vault|余额|抵押品/.test(group + ' ' + label)) return '资金 / Vault';
      return '状态 / 成交';
    }
    function verificationOf(item) {
      // 验证方式由数据层（execution-evidence）分级写入；历史 results.json 无该字段时显示为 —。
      return item.verification || '—';
    }
    function sourceOf(item) {
      // 数据来源分层（合约/事件/合约+事件/前端）说明 Actual 值读的是哪一层；与验证方式正交。
      return item.dataSource || '—';
    }
    function attachmentHref(attachment) {
      // 附件随 run 目录一起落在同级 attachments/（write-outputs.ts）；latest 与 runs/<id> 目录结构一致，
      // 看板服务也按 /attachments/<文件名> 提供静态读取。
      const file = String(attachment.path || '').split('/').pop();
      return file ? 'attachments/' + encodeURIComponent(file) : '';
    }
    function renderScreenshots(result) {
      const shots = (result.attempts || []).flatMap(function (attempt) { return attempt.attachments || []; })
        .filter(function (a) { return a.contentType === 'image/png' && a.path; });
      if (!shots.length) return '';
      // 名称形如 SCN-022_long-close-profit-close-dialog-position-row.png / SCN-065-order-open-form-filled.png：
      // <场景>[_<数据集>]-<钩子 close-dialog|order-open|order-close>-<阶段>.png
      const stageLabel = {
        'position-row': '持仓行可见', 'dialog-open': '平仓弹窗打开', 'preview': 'Max 预览稳定（采集点）', 'error': '失败现场',
        'form-filled': '下单表单已填', 'submitted': '已点击提交', 'tx-confirmed': '交易已上链', 'submit-disabled': '提交按钮未可用',
        'dialog-max': '平仓弹窗 Max', 'confirmed': '已点击 Confirm Close', 'position-row-missing': '持仓行未渲染',
      };
      const hookLabel = { 'close-dialog': '停点采集', 'order-open': '页面开仓', 'order-close': '页面全平' };
      const cards = shots.map(function (a) {
        const href = attachmentHref(a);
        const match = String(a.name).match(/^(SCN-\\d{3})(?:_(.+?))?-(close-dialog|order-open|order-close)-([a-z-]+)\\.png$/);
        const dataset = match && match[2] ? match[2] : '';
        const hook = match ? (hookLabel[match[3]] || match[3]) : '';
        const stage = match ? match[4] : '';
        return '<figure class="shot"><a href="' + href + '" target="_blank" rel="noopener"><img loading="lazy" src="' + href + '" alt="' + esc(a.name) + '"></a>'
          + '<figcaption><strong>' + esc((hook ? hook + ' · ' : '') + (stageLabel[stage] || stage || '截图')) + '</strong><br><small class="muted">' + esc((dataset ? dataset + ' · ' : '') + a.name) + '</small></figcaption></figure>';
      }).join('');
      return '<section class="panel section screenshots"><div class="section-head"><div><h2>前端截图</h2><p class="muted">页面下单（E2E_UI_ORDER_ENTRY：表单已填 → 提交 → 上链；持仓行 → Max → Confirm Close → 上链）与停点采集（E2E_UI_COLLECT：持仓行 → 平仓弹窗 → Max 预览稳定）的逐阶段截图；点击放大。</p></div><strong>' + shots.length + ' 张</strong></div><div class="shot-grid">' + cards + '</div></section>';
    }
    function renderChecks(rowsForScope, title) {
      const categoryCounts = rowsForScope.reduce(function (counts, item) {
        const category = checkCategory(item); counts[category] = (counts[category] || 0) + 1; return counts;
      }, {});
      const verificationCounts = rowsForScope.reduce(function (counts, item) {
        const kind = verificationOf(item); counts[kind] = (counts[kind] || 0) + 1; return counts;
      }, {});
      const sourceCounts = rowsForScope.reduce(function (counts, item) {
        const kind = sourceOf(item); counts[kind] = (counts[kind] || 0) + 1; return counts;
      }, {});
      const sourceOrder = ['合约', '事件', '合约+事件', '前端', '—'];
      const sourceBadges = sourceOrder.map(function (name) {
        const count = sourceCounts[name] || 0;
        if (count === 0 && name !== '前端') return '';
        // 前端层恒显示：0 项时以禁用样子呈现，让覆盖缺口可见而不是消失。
        const disabled = count === 0 ? ' disabled title="页面显示值核对尚未自动化"' : '';
        return '<button type="button" class="check-filter" data-filter-type="source" data-filter-value="' + esc(name) + '"' + disabled + '>' + esc(name) + ' <strong>' + count + '</strong></button>';
      }).join('');
      const sourceGapNote = (sourceCounts['前端'] || 0) === 0
        ? '<span class="filter-note">前端（页面显示值）核对尚未自动化，事件层也有待补充项——两者均为覆盖缺口，逐步补齐。</span>'
        : '';
      const verificationOrder = ['计算复算', '事件对照', '恒等式', '守恒', '派生展示', '缺数据', '—'];
      const verificationBadges = verificationOrder.filter(function (name) { return verificationCounts[name]; }).map(function (name) {
        return '<button type="button" class="check-filter" data-filter-type="verification" data-filter-value="' + esc(name) + '">' + esc(name) + ' <strong>' + esc(verificationCounts[name]) + '</strong></button>';
      }).join('');
      const categoryOrder = ['守恒','资金 / Vault','仓位','价格','Fee','Funding','清算/ADL','Grace','OI / Skew','PnL','状态 / 成交'];
      const categoryBadges = categoryOrder.filter(function (name) { return categoryCounts[name]; }).map(function (name) {
        return '<button type="button" class="check-filter" data-filter-type="category" data-filter-value="' + esc(name) + '">' + esc(name) + ' <strong>' + esc(categoryCounts[name]) + '</strong></button>';
      }).join('');
      // 「交易阶段 / 明细分组」筛选排已按用户要求移除（2026-08-13）：TX 阶段已有页签承担，
      // 明细分组信息保留在每行「分组」列与 data-check-group 属性中，不再重复出一排按钮。
      const rows = rowsForScope.map(function (item, rowIndex) {
        return '<tr data-check-id="' + esc(item.id) + '" data-check-group="' + esc(item.group) + '" data-check-category="' + esc(checkCategory(item)) + '" data-check-status="' + esc(item.status) + '" data-check-verification="' + esc(verificationOf(item)) + '" data-check-source="' + esc(sourceOf(item)) + '"><td>' + esc(item.group) + '</td><td><strong>' + esc(item.label) + '</strong><div><small class="source-tag source-' + (sourceOf(item) === '合约' ? 'contract' : sourceOf(item) === '事件' ? 'event' : sourceOf(item) === '前端' ? 'frontend' : 'mixed') + '">' + esc(sourceOf(item)) + '</small></div></td><td>' + status(item.status) + '<div><small class="muted">' + esc(verificationOf(item)) + '</small></div></td>'
          + '<td class="value before">' + esc(item.before) + '</td><td class="value after">' + esc(item.after) + '</td>'
          + '<td class="value delta">' + esc(item.delta || '—') + '</td><td class="value expected">' + esc(item.expected) + '</td><td class="formula-cell">' + formulaBasis(item, 'scenario-basis-tip-' + rowIndex) + '</td></tr>';
      }).join('');
      const passed = rowsForScope.filter(function (item) { return item.status === 'PASS'; }).length;
      const failed = rowsForScope.filter(function (item) { return item.status === 'FAIL'; }).length;
      const calculated = rowsForScope.filter(function (item) { return item.status === 'CALCULATED'; }).length;
      const unverified = rowsForScope.filter(function (item) { return item.status === 'NOT_VERIFIED'; }).length;
      return '<section class="panel section"><div class="section-head"><div><h2>' + esc(title || '核对数据明细') + '</h2><p class="muted">每一行遵循 Expected After = Before + 独立计算的 Expected Δ；PASS 表示链上 Actual After 与 Expected After 一致。</p></div><strong id="check-visible-count">' + passed + ' PASS · ' + failed + ' FAIL · ' + calculated + ' CALCULATED · ' + unverified + ' NOT_VERIFIED</strong></div>'
        + '<div class="check-filter-block"><span class="filter-label">数据来源</span><div class="check-groups"><button type="button" class="check-filter is-active" data-filter-type="all" data-filter-value="">全部 <strong>' + rowsForScope.length + '</strong></button>' + sourceBadges + sourceGapNote + '</div></div>'
        + '<div class="check-filter-block"><span class="filter-label">功能点</span><div class="check-groups">' + categoryBadges + '</div></div>'
        + '<div class="check-filter-block"><span class="filter-label">验证方式</span><div class="check-groups">' + verificationBadges + '</div></div>'
        + '<div class="table-scroll check-scroll"><table id="reconciliation-table"><thead><tr><th>分组</th><th>核对字段</th><th>结果</th><th>Before（链上）</th><th>After（链上 Actual）</th><th>Expected Δ（订单 / 公式）</th><th>Expected After = Before + Δ</th><th>公式与依据</th></tr></thead><tbody>' + rows + '</tbody></table></div></section>';
    }
    function bindCheckFilters() {
      const buttons = Array.from(document.querySelectorAll('.check-filter'));
      const rows = Array.from(document.querySelectorAll('#reconciliation-table tbody tr'));
      const counter = document.getElementById('check-visible-count');
      buttons.forEach(function (button) {
        button.addEventListener('click', function () {
          buttons.forEach(function (item) { item.classList.toggle('is-active', item === button); });
          const type = button.dataset.filterType;
          const value = button.dataset.filterValue;
          let visible = 0; let passed = 0; let failed = 0; let calculated = 0; let unverified = 0;
          rows.forEach(function (row) {
            const matches = type === 'all'
              || (type === 'group' ? row.dataset.checkGroup === value
                : type === 'verification' ? row.dataset.checkVerification === value
                  : type === 'source' ? row.dataset.checkSource === value
                    : row.dataset.checkCategory === value);
            row.hidden = !matches;
            if (matches) { visible += 1; if (row.dataset.checkStatus === 'PASS') passed += 1; if (row.dataset.checkStatus === 'FAIL') failed += 1; if (row.dataset.checkStatus === 'CALCULATED') calculated += 1; if (row.dataset.checkStatus === 'NOT_VERIFIED') unverified += 1; }
          });
          counter.textContent = passed + ' PASS · ' + failed + ' FAIL · ' + calculated + ' CALCULATED · ' + unverified + ' NOT_VERIFIED（当前 ' + visible + ' / 全部 ' + rows.length + ' 项）';
        });
      });
    }
    function filteredFunctionalResults() {
      const query = functionalControls.search.value.trim().toLowerCase();
      return (data.functionalResults || []).filter(function (item) {
        const definition = functionalCaseById.get(item.id);
        return (!functionalControls.status.value || item.status === functionalControls.status.value)
          && (!functionalControls.kind.value || functionalKind(item) === functionalControls.kind.value)
          && (!functionalControls.batch.value || item.batchId === functionalControls.batch.value)
          && (!query || [item.id, item.scenarioTitle, item.batchId, item.checkResult, item.project, definition?.section]
            .join(' ').toLowerCase().includes(query));
      });
    }
    function renderFunctionalMetrics() {
      const rows = data.functionalResults || [];
      const cards = [
        ['已有自动化结果', rows.length, 'all'],
        ['PASS', rows.filter(function (item) { return item.status === 'PASS'; }).length, 'pass'],
        ['FAIL', rows.filter(function (item) { return item.status === 'FAIL'; }).length, 'fail'],
        ['BLOCKED / SKIP', rows.filter(function (item) { return item.status === 'BLOCKED' || item.status === 'SKIP'; }).length, 'pending'],
      ];
      document.getElementById('functional-metrics').innerHTML = cards.map(function (card) {
        return '<article class="panel functional-metric metric-' + card[2] + '"><span>' + card[0] + '</span><strong>' + card[1] + '</strong></article>';
      }).join('');
    }
    function renderFunctionalDetail() {
      hideFunctionalBasisTip(true);
      const result = (data.functionalResults || []).find(function (item) { return functionalKey(item) === functionalState.selectedKey; });
      if (!result) {
        functionalContent.innerHTML = '<section class="panel empty">当前筛选下没有功能用例自动化结果。</section>';
        document.getElementById('delete-functional-record').disabled = true;
        return;
      }
      const definition = functionalCaseById.get(result.id);
      const testCase = data.cases.find(function (item) { return item.id === result.id; });
      const evidence = (data.functionalEvidence || {})[functionalKey(result)];
      const formulaRelease = definition?.release || data.run.release || '当前版本';
      const attachments = (result.attempts || []).flatMap(function (attempt) { return attempt.attachments || []; });
      const attachmentRows = attachments.map(function (item) {
        const href = attachmentHref(item);
        return '<li><a href="' + href + '" target="_blank" rel="noopener">' + esc(item.name) + '</a><small>' + esc(item.contentType) + '</small></li>';
      }).join('');
      const attemptRows = (result.attempts || []).map(function (attempt) {
        return '<tr><td>#' + (Number(attempt.retry) + 1) + '</td><td>' + status(String(attempt.status).toUpperCase()) + '</td><td>' + duration(attempt.durationMs) + '</td><td>' + esc(localTime(attempt.startedAt)) + '</td><td>' + esc(shortError(attempt.error)) + '</td></tr>';
      }).join('');
      const annotationRows = (result.annotations || []).filter(function (item) { return item.type !== 'check-result'; }).map(function (item) {
        return '<li><strong>' + esc(item.type) + '</strong><span>' + esc(item.description || '—') + '</span></li>';
      }).join('');
      function displayValue(value) {
        if (value === undefined || value === null || value === '') return '—';
        if (typeof value === 'string') return value;
        try { return JSON.stringify(value, null, 2); } catch { return String(value); }
      }
      const precisionContext = asRecord(evidence && evidence.data);
      const precisionEnvironment = asRecord(precisionContext?.environment);
      const precisionMarket = asRecord(precisionEnvironment?.market);
      const precisionMarketIndex = firstFunctionalValue([precisionMarket?.marketIndex, precisionContext?.marketIndex]);
      const precisionMetadata = functionalMarketMetadata(precisionContext, precisionMarketIndex);
      const precisionCollateralDecimals = Number(precisionMetadata.collateralTokenDecimals);
      const precisionIndexTokenDecimals = Number(precisionMetadata.indexTokenDecimals);
      const precisionPriceDecimals = Math.max(0, 30 - precisionIndexTokenDecimals);
      const precisionUsdcChecks = new Set([
        'order.create.escrow-trader', 'order.create.escrow-vault',
        'market-open.core.conservation', 'market-open.cleanup.conservation',
        'whole.conservation', 'whole.trader-usdc', 'position.collateral',
        'fee.position.amount', 'fee.claimable.position', 'fee.claimable.funding',
        'fee.claimable.liquidation', 'fee.handler-token-balance',
      ]);
      const precisionUsdChecks = new Set([
        'position.size-usd', 'market.oi-usd-primary-side', 'market.oi-usd-other-side',
      ]);
      const precisionTokenChecks = new Set([
        'market.oi-token-primary-side', 'market.oi-token-other-side',
      ]);
      function functionalPrecisionSpec(item) {
        const name = String(item.name || '');
        if (precisionUsdcChecks.has(name)) return { decimals: precisionCollateralDecimals, unit: String(precisionMetadata.collateralTokenSymbol || 'USDC') };
        if (precisionUsdChecks.has(name)) return { decimals: 30, unit: 'USD' };
        if (name === 'pricing.execution-price') return { decimals: precisionPriceDecimals, unit: 'USD / Token' };
        if (precisionTokenChecks.has(name)) return { decimals: precisionIndexTokenDecimals, unit: String(precisionMetadata.indexTokenSymbol || 'Token') };
        return null;
      }
      function functionalReadableValue(item, value) {
        const raw = String(value == null ? '' : value);
        const spec = functionalPrecisionSpec(item);
        if (!spec || !/^-?\\d+$/.test(raw) || !Number.isInteger(spec.decimals) || spec.decimals < 0) return null;
        const maximumFractionDigits = 12;
        const digits = raw.startsWith('-') ? raw.slice(1) : raw;
        const padded = digits.padStart(spec.decimals + 1, '0');
        const fraction = spec.decimals > 0 ? padded.slice(-spec.decimals) : '';
        const approximate = spec.decimals > maximumFractionDigits && /[1-9]/.test(fraction.slice(maximumFractionDigits));
        return {
          text: (approximate ? '≈ ' : '= ') + formatRawUnits(raw, spec.decimals, maximumFractionDigits) + ' ' + spec.unit,
          decimals: spec.decimals,
        };
      }
      function functionalValueText(item, value) {
        const raw = displayValue(value);
        const readable = functionalReadableValue(item, value);
        return readable ? readable.text.replace(/^= /, '') : raw;
      }
      function renderFunctionalValue(item, value) {
        const raw = displayValue(value);
        const readable = functionalReadableValue(item, value);
        return '<pre class="functional-value-raw" title="Raw 原值：' + esc(raw) + '">' + esc(raw) + '</pre>'
          + (readable ? '<small class="functional-readable-value" data-readable-value="' + esc(readable.text) + '" title="Raw ÷ 10^' + esc(readable.decimals) + '">' + esc(readable.text) + '</small>' : '');
      }
      const checks = evidence && Array.isArray(evidence.checks)
        ? evidence.checks.slice().sort(function (left, right) { return Number(left.status === 'PASS' || left.passed) - Number(right.status === 'PASS' || right.passed); })
        : [];
      function checkStatus(item) { return item.status || (item.passed ? 'PASS' : 'FAIL'); }
      const passedChecks = checks.filter(function (item) { return checkStatus(item) === 'PASS'; }).length;
      const failedChecks = checks.filter(function (item) { return checkStatus(item) === 'FAIL'; }).length;
      const unverifiedChecks = checks.length - passedChecks - failedChecks;
      function actionRows(actionKey) {
        if (actionKey === 'ALL') return checks;
        return checks.filter(function (item) { return Array.isArray(item.actionKeys) && item.actionKeys.includes(actionKey); });
      }
      const functionalCheckLabels = {
        'cleanup.execute.outcome': '清理订单执行结果',
        'cleanup.position-removed': '清理后仓位已移除',
        'event.position.order-type': '事件中的订单类型',
        'event.position.side': '事件中的仓位方向（isLong）',
        'fee.claimable.funding': '可领取资金费',
        'fee.claimable.liquidation': '可领取清算费',
        'fee.claimable.position': '可领取仓位费',
        'fee.factor-selected': '仓位费率选择结果',
        'fee.handler-token-balance': 'Fee Handler 代币余额',
        'fee.position.amount': '仓位手续费金额',
        'keeper.close-execution': 'Keeper 平仓执行结果',
        'keeper.open-execution': 'Keeper 开仓执行结果',
        'market-open.cleanup.conservation': '清理阶段 USDC 守恒',
        'market-open.core.conservation': '核心交易阶段 USDC 守恒',
        'market.oi-token-other-side': '另一方向未发生 OI Token 变化',
        'market.oi-token-primary-side': '目标方向 OI Token 变化',
        'market.oi-usd-other-side': '另一方向未发生 OI USD 变化',
        'market.oi-usd-primary-side': '目标方向 OI USD 变化',
        'order.create.escrow-trader': '创建订单：Trader 托管扣款',
        'order.create.escrow-vault': '创建订单：OrderVault 托管入账',
        'order.execute.outcome': '订单执行结果',
        'position.collateral': '仓位抵押品余额',
        'position.exists': '仓位是否存在',
        'position.side': '仓位方向（isLong）',
        'position.size-usd': '仓位规模（USD）',
        'pricing.execution-price': '成交价格',
        'whole.conservation': '全流程 USDC 守恒',
        'whole.trader-usdc': 'Trader 全流程 USDC 余额',
      };
      function functionalCheckTitle(item) {
        const name = String(item.name || '').trim();
        return functionalCheckLabels[name] || name || '未命名核对项';
      }
      function hasFunctionalValue(value) {
        return value !== undefined && value !== null && value !== '';
      }
      function functionalCheckKind(item) {
        if (item.kind === 'calculation' || item.kind === 'assertion') return item.kind;
        const formulaMeta = parseFunctionalFormula(item.formula);
        return formulaMeta.expression || hasFunctionalValue(item.expectedDelta) ? 'calculation' : 'assertion';
      }
      function normalizedFunctionalBoolean(value) {
        if (value === true || value === 'true' || value === 1 || value === '1') return true;
        if (value === false || value === 'false' || value === 0 || value === '0') return false;
        return null;
      }
      function semanticFunctionalValue(item, value, expectedValue) {
        const name = String(item.name || '');
        const raw = displayValue(value);
        const boolValue = normalizedFunctionalBoolean(value);
        if (name === 'event.position.side' || name === 'position.side') {
          if (boolValue === true) return 'isLong=true（多仓）';
          if (boolValue === false) return 'isLong=false（空仓）';
        }
        if (name === 'position.exists') {
          if (boolValue !== null) return '仓位存在：' + (boolValue ? '是' : '否');
        }
        if (name === 'cleanup.position-removed') {
          if (boolValue !== null) return '仓位已移除：' + (boolValue ? '否' : '是') + '（position.exists=' + String(boolValue) + '）';
        }
        if (name === 'order.execute.outcome' || name === 'cleanup.execute.outcome') {
          if (String(value).toLowerCase() === 'executed') return '订单执行结果：已执行（executed）';
        }
        if (name === 'keeper.open-execution' || name === 'keeper.close-execution') {
          const normalized = String(value || '').toUpperCase();
          if (normalized.includes('SUCCESS')) {
            return expectedValue
              ? '预期由 Keeper 或服务账户成功执行（' + raw + '）'
              : 'Keeper 交易执行成功（' + raw + '）';
          }
        }
        if (name === 'event.position.order-type' && String(value) === '0') return 'MarketIncrease（0，市价开仓）';
        if (name === 'fee.factor-selected' && boolValue !== null) return 'balanceWasImproved=' + String(boolValue);
        return raw;
      }
      function functionalActionIdsFromSources(item) {
        const ids = [];
        const sourceText = (Array.isArray(item.sources) ? item.sources : []).join('；');
        const marker = 'actionId=';
        let cursor = 0;
        while (cursor < sourceText.length) {
          const start = sourceText.indexOf(marker, cursor);
          if (start < 0) break;
          const valueStart = start + marker.length;
          const bracketEnd = sourceText.indexOf(']', valueStart);
          const parenEnd = sourceText.indexOf(')', valueStart);
          const ends = [bracketEnd, parenEnd].filter(function (value) { return value >= 0; });
          const valueEnd = ends.length ? Math.min.apply(Math, ends) : sourceText.length;
          const id = sourceText.slice(valueStart, valueEnd).trim();
          if (id && !ids.includes(id)) ids.push(id);
          cursor = valueEnd + 1;
        }
        return ids;
      }
      function functionalEvidenceForCheck(item) {
        const evidenceData = asRecord(evidence && evidence.data);
        const canonicalActions = evidenceData && Array.isArray(evidenceData.actions) ? evidenceData.actions : [];
        const actionIds = functionalActionIdsFromSources(item);
        const actionKeys = Array.isArray(item.actionKeys) ? item.actionKeys : [];
        const matchingTransactions = transactions.filter(function (transaction) {
          return actionKeys.includes(transaction.actionKey) || actionIds.includes(transaction.actionKey);
        });
        const matchingHashes = matchingTransactions.map(function (transaction) { return transaction.hash; });
        const actions = canonicalActions.filter(function (candidate) {
          const action = asRecord(candidate);
          if (!action) return false;
          const actionTransactions = Array.isArray(action.transactions) ? action.transactions : [];
          const matchesCurrentAction = actionTransactions.some(function (candidateTransaction) {
            const transaction = asRecord(candidateTransaction);
            return transaction && matchingHashes.includes(String(transaction.txHash || ''));
          });
          return matchingHashes.length ? matchesCurrentAction : actionIds.includes(String(action.actionId || ''));
        });
        const transactionRefs = [];
        const orderKeys = [];
        const positionKeys = [];
        function pushUnique(target, value) {
          const text = String(value || '').trim();
          if (text && !target.includes(text)) target.push(text);
        }
        actions.forEach(function (candidate) {
          const action = asRecord(candidate);
          if (!action) return;
          const orderRefs = asRecord(action.orderRefs);
          const positionRefs = asRecord(action.positionRefs);
          if (orderRefs) Object.values(orderRefs).forEach(function (value) { pushUnique(orderKeys, value); });
          if (positionRefs) Object.values(positionRefs).forEach(function (value) { pushUnique(positionKeys, value); });
          (Array.isArray(action.transactions) ? action.transactions : []).forEach(function (candidateTransaction) {
            const transaction = asRecord(candidateTransaction);
            if (!transaction) return;
            const hash = String(transaction.txHash || '');
            const renderedTransaction = transactions.find(function (value) { return value.hash === hash; });
            const explorer = asRecord(transaction.explorer);
            pushUnique(orderKeys, transaction.orderKey);
            if (hash && !transactionRefs.some(function (value) { return value.hash === hash; })) {
              transactionRefs.push({
                hash: hash,
                url: renderedTransaction && renderedTransaction.linkStatus === 'available'
                  ? renderedTransaction.url
                  : undefined,
                missing: Boolean(renderedTransaction && renderedTransaction.linkStatus === 'missing'),
                savedUrl: explorer && explorer.transactionUrl ? String(explorer.transactionUrl) : '',
              });
            }
          });
          (Array.isArray(action.events) ? action.events : []).forEach(function (candidateEvent) {
            const event = asRecord(candidateEvent);
            const args = event && asRecord(event.args);
            const bytes32 = args && asRecord(args.bytes32);
            if (bytes32) {
              pushUnique(orderKeys, bytes32.orderKey || bytes32.key);
              pushUnique(positionKeys, bytes32.positionKey);
            }
          });
        });
        matchingTransactions.forEach(function (transaction) {
          if (!transactionRefs.some(function (value) { return value.hash === transaction.hash; })) {
            transactionRefs.push({ hash: transaction.hash, url: transaction.url, missing: transaction.linkStatus === 'missing', savedUrl: '' });
          }
        });
        return { transactions: transactionRefs, orderKeys: orderKeys, positionKeys: positionKeys };
      }
      function renderFunctionalEvidenceReferences(item, explicitSources) {
        const refs = functionalEvidenceForCheck(item);
        const txRows = refs.transactions.map(function (transaction) {
          const link = transaction.url
            ? '<a href="' + esc(transaction.url) + '" target="_blank" rel="noopener noreferrer">查看真实交易 ↗</a>'
            : '<span class="functional-assertion-missing">真实交易链接已缺失</span>';
          return '<div class="functional-assertion-reference"><span>交易</span><code>' + esc(transaction.hash) + '</code>' + link + '</div>';
        }).join('');
        const orderRows = refs.orderKeys.map(function (key) {
          return '<div class="functional-assertion-reference"><span>Order Key</span><code>' + esc(key) + '</code></div>';
        }).join('');
        const positionRows = refs.positionKeys.map(function (key) {
          return '<div class="functional-assertion-reference"><span>Position Key / ID</span><code>' + esc(key) + '</code></div>';
        }).join('');
        const references = txRows + orderRows + positionRows;
        return references || renderFunctionalSourceList(explicitSources);
      }
      function renderFunctionalAssertion(item, noteParts, noteText, explicitSources, basisTipId) {
        const noteBlock = noteText
          ? '<p class="functional-assertion-note">' + esc(noteText) + '</p>'
          : '';
        const assertionContent = '<div class="functional-check-explanation functional-assertion-explanation">'
          + '<section class="functional-explanation-block functional-assertion-evidence"><span>断言依据</span>'
          + '<p>核对方式：' + esc(mapFunctionalVerification(item.verification || noteParts.verification)) + '</p>'
          + noteBlock
          + renderFunctionalEvidenceReferences(item, explicitSources) + '</section></div>';
        const tipId = basisTipId || 'functional-assertion-tip-default';
        const tipLabel = noteBlock ? '查看断言说明与依据' : '查看断言依据';
        return '<span class="functional-basis-tip functional-assertion-tip"><button type="button" class="functional-basis-tip-trigger" data-functional-basis-tip="' + esc(tipId) + '" aria-controls="' + esc(tipId) + '" aria-expanded="false" aria-haspopup="dialog"><span aria-hidden="true">ⓘ</span> ' + tipLabel + '</button><div id="' + esc(tipId) + '" class="functional-basis-popover" popover="manual" role="dialog" aria-label="' + tipLabel + '">' + assertionContent + '</div></span>';
      }
      function calculationSample(item, parsedSample) {
        if (parsedSample) return parsedSample;
        const lines = [];
        if (hasFunctionalValue(item.before)) lines.push('Before = ' + functionalValueText(item, item.before));
        if (hasFunctionalValue(item.expectedDelta)) lines.push('Expected Δ = ' + functionalValueText(item, item.expectedDelta));
        if (hasFunctionalValue(item.expectedAfter)) lines.push('Expected After = ' + functionalValueText(item, item.expectedAfter));
        else if (hasFunctionalValue(item.expected)) lines.push('Expected = ' + functionalValueText(item, item.expected));
        if (hasFunctionalValue(item.delta)) lines.push('Actual Δ = ' + functionalValueText(item, item.delta));
        if (hasFunctionalValue(item.after)) lines.push('Actual After = ' + functionalValueText(item, item.after));
        else if (hasFunctionalValue(item.actual)) lines.push('Actual = ' + functionalValueText(item, item.actual));
        return lines.join('\\n');
      }
      function renderFunctionalCheckExplanation(item, basisTipId) {
        const formulaMeta = parseFunctionalFormula(item.formula);
        const noteParts = splitFunctionalNote(String(item.note || ''));
        const noteText = noteParts.extras.join('；');
        const explicitSources = Array.isArray(item.sources) ? item.sources : noteParts.sources;
        if (functionalCheckKind(item) === 'assertion') {
          return renderFunctionalAssertion(item, noteParts, noteText, explicitSources, basisTipId);
        }
        const fallbackRule = hasFunctionalValue(item.expectedDelta) ? 'Expected After = Before + Expected Δ' : 'Actual = Expected';
        const parsed = splitFormulaAndSample(formulaMeta.expression || fallbackRule);
        const sample = calculationSample(item, parsed.sample);
        const ruleBlock = '<section class="functional-explanation-block functional-formula-section formula-rule"><span>计算公式</span>' + renderFormulaLines(parsed.rule) + '</section>';
        const exampleBlock = sample
          ? '<section class="functional-explanation-block functional-formula-section formula-example"><span>本次代入</span>' + renderFormulaLines(sample) + '</section>'
          : '';
        const noteContent = noteText
          ? '<section class="functional-explanation-block formula-note"><span>核对说明</span><p>' + esc(noteText) + '</p></section>'
          : '';
        const basisBlock = '<section class="functional-explanation-block formula-basis"><span>计算依据</span>'
          + '<dl><dt>公式标识</dt><dd><code>' + esc(formulaMeta.id || '通用差值核对') + '</code></dd>'
          + '<dt>版本</dt><dd>' + esc(formulaMeta.version || formulaRelease) + '</dd>'
          + '<dt>核对方式</dt><dd>' + esc(mapFunctionalVerification(item.verification || noteParts.verification)) + '</dd>'
          + '<dt>数据来源</dt><dd>' + renderFunctionalSourceList(explicitSources) + '</dd></dl></section>';
        const formulaSource = formulaMeta.id
          ? '<div class="functional-formula-source"><span>公式版本：' + esc(formulaMeta.version || formulaRelease) + '</span><a href="./formulas.html">查看核心公式</a></div>'
          : '';
        const tipId = basisTipId || 'functional-basis-tip-default';
        const tipLabel = noteContent ? '查看说明与依据' : '查看计算依据';
        const basisTip = '<span class="functional-basis-tip"><button type="button" class="functional-basis-tip-trigger" data-functional-basis-tip="' + esc(tipId) + '" aria-controls="' + esc(tipId) + '" aria-expanded="false" aria-haspopup="dialog"><span aria-hidden="true">ⓘ</span> ' + tipLabel + '</button><div id="' + esc(tipId) + '" class="functional-basis-popover" popover="manual" role="dialog" aria-label="' + tipLabel + '">' + noteContent + basisBlock + formulaSource + '</div></span>';
        return '<div class="functional-check-explanation functional-calculation-explanation">' + ruleBlock + exampleBlock + basisTip + '</div>';
      }
      function renderFunctionalChecks(rows, title, embedded) {
        const actionPassed = rows.filter(function (item) { return checkStatus(item) === 'PASS'; }).length;
        const actionFailed = rows.filter(function (item) { return checkStatus(item) === 'FAIL'; }).length;
        const actionUnverified = rows.length - actionPassed - actionFailed;
        const checkRows = rows.map(function (item) {
          const originalIndex = checks.indexOf(item);
          const verdict = checkStatus(item);
          const kind = functionalCheckKind(item);
          const checkName = String(item.name || 'unknown-check');
          const checkTitle = functionalCheckTitle(item);
          const technicalName = checkTitle !== checkName ? '<small>' + esc(checkName) + '</small>' : '';
          const titleCell = '<td class="functional-check-title"><div><span class="check-index">' + (originalIndex + 1) + '</span><strong>' + esc(checkTitle) + '</strong></div>' + technicalName + '<span class="functional-check-kind functional-check-kind-' + kind + '">' + (kind === 'calculation' ? '计算核对' : '断言核对') + '</span></td>';
          if (kind === 'assertion') {
            const actualValue = semanticFunctionalValue(item, item.after !== undefined ? item.after : item.actual, false);
            const expectedValue = semanticFunctionalValue(item, item.expectedAfter !== undefined ? item.expectedAfter : item.expected, true);
            return '<tr class="functional-check-row functional-assertion-row" data-check-status="' + verdict + '" data-check-kind="' + kind + '">' + titleCell + '<td>' + status(verdict) + '</td><td class="functional-assertion-placeholder">—</td><td class="functional-check-value actual functional-assertion-actual"><small>实际</small><strong>' + esc(actualValue) + '</strong></td><td class="functional-assertion-placeholder">—</td><td class="functional-assertion-placeholder">—</td><td class="functional-check-value expected functional-assertion-expected"><small>预期</small><strong>' + esc(expectedValue) + '</strong></td><td class="functional-check-note">' + renderFunctionalCheckExplanation(item, 'functional-assertion-tip-' + (originalIndex + 1)) + '</td></tr>';
          }
          return '<tr class="functional-check-row functional-calculation-row" data-check-status="' + verdict + '" data-check-kind="' + kind + '">' + titleCell + '<td>' + status(verdict) + '</td><td class="functional-check-value">' + renderFunctionalValue(item, item.before) + '</td><td class="functional-check-value actual">' + renderFunctionalValue(item, item.after !== undefined ? item.after : item.actual) + '</td><td class="functional-check-value">' + renderFunctionalValue(item, item.delta) + '</td><td class="functional-check-value expected">' + renderFunctionalValue(item, item.expectedDelta) + '</td><td class="functional-check-value expected">' + renderFunctionalValue(item, item.expectedAfter !== undefined ? item.expectedAfter : item.expected) + '</td><td class="functional-check-note">' + renderFunctionalCheckExplanation(item, 'functional-basis-tip-' + (originalIndex + 1)) + '</td></tr>';
        }).join('');
        const wrapperClass = embedded
          ? 'functional-action-submodule functional-checks functional-action-checks'
          : 'panel section functional-checks';
        const heading = embedded
          ? '<div class="functional-submodule-head functional-check-submodule-head"><div><span class="eyebrow">核对结果</span><h3>' + esc(title) + '</h3><p>本交易动作的链上读数、断言结果与 Expected 对照。</p></div><div class="functional-check-head-actions"><strong>' + actionPassed + ' PASS · ' + actionFailed + ' FAIL · ' + actionUnverified + ' 未核对 · 共 ' + rows.length + ' 项</strong><a class="case-link functional-formula-catalog-link" href="./formulas.html">查看 ' + esc(formulaRelease) + ' 核心公式</a></div></div>'
          : '<div class="section-head"><div><h2>' + esc(title) + '</h2><p class="muted">当前表格随上方交易动作切换；Expected 由独立核对引擎产生，Reporter 只渲染 ReconciliationReport。</p></div><div class="functional-check-head-actions"><strong>' + actionPassed + ' PASS · ' + actionFailed + ' FAIL · ' + actionUnverified + ' 未核对 · 共 ' + rows.length + ' 项</strong><a class="case-link functional-formula-catalog-link" href="./formulas.html">查看 ' + esc(formulaRelease) + ' 核心公式</a></div></div>';
        return '<section class="' + wrapperClass + '">' + heading
          + (rows.length ? '<div class="check-groups"><button type="button" class="functional-check-filter is-active" data-value="">全部 <strong>' + rows.length + '</strong></button><button type="button" class="functional-check-filter" data-value="PASS">PASS <strong>' + actionPassed + '</strong></button><button type="button" class="functional-check-filter" data-value="FAIL">FAIL <strong>' + actionFailed + '</strong></button><button type="button" class="functional-check-filter" data-value="NOT_VERIFIED">NOT_VERIFIED <strong>' + actionUnverified + '</strong></button></div><div class="table-scroll check-scroll"><table class="functional-check-table"><colgroup><col class="functional-check-col-title"><col class="functional-check-col-status"><col class="functional-check-col-before"><col class="functional-check-col-after"><col class="functional-check-col-actual-delta"><col class="functional-check-col-expected-delta"><col class="functional-check-col-expected"><col class="functional-check-col-basis"></colgroup><thead><tr><th>核对项</th><th>结果</th><th>Before</th><th>After（Actual）</th><th>Actual Δ</th><th>Expected Δ</th><th>Expected After / Expected</th><th>公式 / 依据</th></tr></thead><tbody>' + checkRows + '</tbody></table></div>'
            : '<div class="empty"><strong>该交易动作没有独立核对项。</strong><p>交易回执仍可查看；跨动作或整条流程的检查请切换到“全流程”。</p></div>') + '</section>';
      }
      const rawData = evidence && evidence.data !== undefined
        ? '<details class="panel functional-raw-data"><summary><strong>执行上下文与原始数据</strong><span>展开查看自动化脚本保存的输入、链上读数及交易标识</span></summary><pre>' + esc(displayValue(evidence.data)) + '</pre></details>'
        : '';
      const transactions = evidence && Array.isArray(evidence.transactions)
        ? evidence.transactions.filter(function (item) {
          return item.actionKey !== 'oracle-index' && item.actionKey !== 'oracle-collateral';
        })
        : [];
      function transactionStatus(item) {
        return !item.status ? 'RECORDED' : item.status === '0x1' ? 'SUCCESS' : item.status === '0x0' ? 'REVERTED' : String(item.status).toUpperCase();
      }
      function transactionActor(item) {
        if (/创建/.test(item.label)) return '交易员';
        if (/执行/.test(item.label)) return 'Keeper';
        if (/Oracle|价格/.test(item.label)) return 'Oracle 更新';
        return '链上账户';
      }
      function renderFunctionalTransaction(item, index, embedded) {
        const txStatus = !item.status ? 'RECORDED' : item.status === '0x1' ? 'SUCCESS' : item.status === '0x0' ? 'REVERTED' : String(item.status).toUpperCase();
        const route = './api/transactions/' + encodeURIComponent(item.hash);
        const hash = item.url && item.linkStatus === 'available'
          ? '<a class="functional-tx-explorer-link" href="' + esc(item.url) + '" target="_blank" rel="noopener noreferrer"><code>' + esc(item.hash) + '</code><span>在链上浏览器查看 ↗</span></a>'
          : '<div class="functional-tx-unavailable"><code class="functional-tx-hash">' + esc(item.hash) + '</code><span class="functional-tx-missing">真实链接已缺失</span></div>';
        const details = '<dl><dt>交易阶段</dt><dd>' + esc(item.actionKey || '未分类') + '</dd><dt>Transaction Hash</dt><dd><div class="functional-tx-actions">' + hash + '<a class="functional-tx-link" href="' + route + '" target="_blank" rel="noreferrer">本地回执 JSON</a></div></dd><dt>From</dt><dd><code>' + esc(item.from || '—') + '</code></dd><dt>To</dt><dd><code>' + esc(item.to || '—') + '</code></dd><dt>Block</dt><dd>' + esc(item.blockNumber || '—') + '</dd></dl>';
        if (embedded) {
          return '<section class="functional-action-submodule functional-tx-receipt"><div class="functional-submodule-head"><div><span class="eyebrow">链上证据</span><h3>交易回执</h3><p>Transaction Hash、真实链上链接和本地保存的回执数据。</p></div>' + status(txStatus) + '</div>' + details + '</section>';
        }
        return '<details class="tx-record panel functional-tx-record"><summary><span class="tx-sequence">TX' + (index + 1) + '</span><span><strong>' + esc(item.label) + '</strong><small><span class="actor">' + esc(transactionActor(item)) + '</span> · Block ' + esc(item.blockNumber || '—') + ' · ' + esc(shortHash(item.hash)) + '</small></span>' + status(txStatus) + '</summary>' + details + '</details>';
      }
      function renderFunctionalActionModule(item, index, stepId, rows) {
        return '<section class="panel functional-action-module"><header class="functional-action-header"><div class="functional-action-title"><span class="eyebrow">' + esc(stepId) + ' · ' + esc(transactionActor(item)) + '</span><h2>' + esc(item.label) + '</h2><p>先查看 ' + rows.length + ' 项数据核对，再查看测试数据与链上证据；三者随当前交易同步切换。</p></div><div class="tx-action-metrics"><span>' + status(transactionStatus(item)) + '</span><span>Block <strong>' + esc(item.blockNumber || '—') + '</strong></span><span>核对 <strong>' + rows.length + ' 项</strong></span></div></header><div class="functional-action-body">' + renderFunctionalChecks(rows, '数据核对', true) + renderFunctionalTradeSummary(evidence, item.actionKey || '', item) + renderFunctionalTransaction(item, index, true) + '</div></section>';
      }
      function renderFunctionalWorkflow() {
        if (!transactions.length) return renderFunctionalChecks(checks, '测试核对结果');
        const buttons = ['<button type="button" class="tx-step-tab functional-tx-step-tab" role="tab" aria-selected="false" aria-controls="functional-tx-step-content" tabindex="-1" data-functional-tx-step="ALL"><span>全流程</span><strong>' + transactions.length + ' 笔链上交易</strong><small>' + checks.length + ' 项数据核对</small></button>'].concat(transactions.map(function (item, index) {
          const rows = actionRows(item.actionKey || '');
          const failed = rows.filter(function (check) { return checkStatus(check) === 'FAIL'; }).length;
          const unverified = rows.filter(function (check) { return !['PASS', 'FAIL'].includes(checkStatus(check)); }).length;
          return '<button type="button" class="tx-step-tab functional-tx-step-tab" role="tab" aria-selected="false" aria-controls="functional-tx-step-content" tabindex="-1" data-functional-tx-step="TX' + (index + 1) + '"><span>TX' + (index + 1) + ' · ' + esc(transactionActor(item)) + '</span><strong>' + esc(item.label) + '</strong><small>Block ' + esc(item.blockNumber || '—') + ' · ' + rows.filter(function (check) { return checkStatus(check) === 'PASS'; }).length + ' PASS' + (failed ? ' · ' + failed + ' FAIL' : '') + (unverified ? ' · ' + unverified + ' 未核对' : '') + '</small></button>';
        })).join('');
        return '<section class="panel section tx-workflow functional-tx-workflow"><div class="section-head"><div><h2>按交易动作核对</h2><p class="muted">本页来源：批次 <code>' + esc(result.batchId || '未记录') + '</code> · 用例执行开始 ' + esc(localTime(result.executedAt)) + '。选择动作后，下方数据核对、测试数据与链上证据同步切换。</p></div><strong>' + passedChecks + ' PASS · ' + failedChecks + ' FAIL · ' + unverifiedChecks + ' 未核对</strong></div><div class="tx-step-tabs" role="tablist" aria-label="按交易动作筛选">' + buttons + '</div></section><section id="functional-tx-step-content"></section>';
      }
      function bindFunctionalCheckFilters() {
        Array.from(document.querySelectorAll('#functional-tx-step-content .functional-check-filter, #functional-execution-content > .functional-checks .functional-check-filter')).forEach(function (button) {
          button.addEventListener('click', function () {
            const scope = button.closest('.functional-checks');
            Array.from(scope.querySelectorAll('.functional-check-filter')).forEach(function (item) { item.classList.toggle('is-active', item === button); });
            Array.from(scope.querySelectorAll('.functional-check-row')).forEach(function (row) { row.hidden = Boolean(button.dataset.value) && row.dataset.checkStatus !== button.dataset.value; });
          });
        });
      }
      function bindFunctionalExecutionSteps() {
        const buttons = Array.from(document.querySelectorAll('#functional-execution-content .functional-tx-step-tab[data-functional-tx-step]'));
        const mount = document.getElementById('functional-tx-step-content');
        if (!buttons.length || !mount) { bindFunctionalCheckFilters(); return; }
        function selectStep(stepId) {
          hideFunctionalBasisTip(true);
          buttons.forEach(function (button) {
            const selected = button.dataset.functionalTxStep === stepId;
            button.classList.toggle('is-active', selected);
            button.setAttribute('aria-selected', String(selected));
            button.tabIndex = selected ? 0 : -1;
          });
          if (stepId === 'ALL') {
            mount.innerHTML = renderFunctionalChecks(checks, '全流程数据核对') + '<section class="tx-record-list">' + transactions.map(function (item, index) { return renderFunctionalTransaction(item, index, false); }).join('') + '</section>';
          } else {
            const index = Math.max(0, Number(stepId.slice(2)) - 1);
            const item = transactions[index];
            const rows = item ? actionRows(item.actionKey || '') : [];
            mount.innerHTML = item ? renderFunctionalActionModule(item, index, stepId, rows) : '';
          }
          bindFunctionalCheckFilters();
        }
        const requestedHash = new URLSearchParams(location.search).get('tx');
        const requestedIndex = transactions.findIndex(function (item) { return item.hash === requestedHash; });
        const failedAction = checks.find(function (item) { return checkStatus(item) === 'FAIL' && Array.isArray(item.actionKeys) && item.actionKeys.length; });
        const failedIndex = failedAction ? transactions.findIndex(function (item) { return failedAction.actionKeys.includes(item.actionKey); }) : -1;
        const linkedIndex = transactions.findIndex(function (item) { return actionRows(item.actionKey || '').length > 0; });
        const initialIndex = requestedIndex >= 0 ? requestedIndex : failedIndex >= 0 ? failedIndex : linkedIndex >= 0 ? linkedIndex : 0;
        buttons.forEach(function (button, index) {
          button.addEventListener('click', function () { selectStep(button.dataset.functionalTxStep); });
          button.addEventListener('keydown', function (event) {
            let nextIndex = index;
            if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + buttons.length) % buttons.length;
            else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % buttons.length;
            else if (event.key === 'Home') nextIndex = 0;
            else if (event.key === 'End') nextIndex = buttons.length - 1;
            else return;
            event.preventDefault();
            selectStep(buttons[nextIndex].dataset.functionalTxStep);
            buttons[nextIndex].focus();
          });
        });
        selectStep('TX' + (initialIndex + 1));
      }
      const transactionSection = renderFunctionalWorkflow();
      const reconciliationLayers = evidence && evidence.layerVerdicts
        ? '<section class="panel section"><div class="section-head"><div><h2>独立核对分层结论</h2><p class="muted">直接来自 ReconciliationReport；NOT_RUN / INCOMPLETE 不并入合约层 PASS。</p></div><strong>' + status(evidence.reportStatus || '—') + '</strong></div><div class="functional-layer-grid">' + Object.entries(evidence.layerVerdicts).map(function (entry) { return '<article class="panel"><span>' + esc(entry[0]) + '</span>' + status(entry[1]) + '</article>'; }).join('') + '</div></section>'
        : '';
      functionalContent.innerHTML = '<section class="hero panel functional-detail-hero"><div><span class="eyebrow">' + esc(result.id) + ' · ' + esc(result.project) + '</span><h2>' + esc(result.scenarioTitle) + '</h2><p>' + esc(result.checkResult) + '</p></div><div class="hero-meta"><span>执行结果 ' + status(result.status) + '</span><span>核对项 <strong>' + checks.length + '</strong></span><span>通过 <strong>' + passedChecks + '</strong></span><span>失败 <strong>' + failedChecks + '</strong></span></div></section>'
        + '<section class="functional-layer-grid"><article class="panel"><span>合约层</span>' + status(layerValue(result, 'contract')) + '</article><article class="panel"><span>前端层</span>' + status(layerValue(result, 'frontend')) + '</article><article class="panel"><span>交叉一致</span>' + status(layerValue(result, 'parity')) + '</article></section>'
        + '<section class="panel case-overview functional-case-overview"><div class="section-head functional-case-head"><div><h2>功能用例说明</h2><p class="muted">来自版本测试矩阵的完整设计信息。</p></div>' + renderDeploymentSummary(result, true) + '</div>'
        + '<section class="functional-case-submodule functional-case-participant"><div class="functional-case-identity"><span class="eyebrow">用例与执行对象</span><div class="case-meta"><span><strong>优先级</strong> ' + esc(result.priority) + '</span><span><strong>章节</strong> ' + esc(definition?.section || '—') + '</span><span><strong>层</strong> ' + esc(definition?.layer || '—') + '</span><span><strong>入口</strong> ' + esc(definition?.entry || '—') + '</span></div></div><dl class="case-summary functional-case-account"><dt>测试账户 / 地址</dt><dd><code>' + esc(definition?.trader || '未绑定测试账户') + '</code></dd></dl></section>'
        + '<section class="functional-case-submodule functional-test-data"><span class="eyebrow">独立数据区</span><h3>测试数据</h3><p>' + esc(definition?.testData || testCase?.testData || '—') + '</p></section>'
        + '<section class="functional-case-submodule functional-case-design"><span class="eyebrow">用例设计信息</span><div class="case-important-grid"><article><h3>前置条件</h3><p>' + esc(definition?.preconditions || testCase?.preconditions || '—') + '</p></article><article><h3>操作步骤</h3><p>' + esc(definition?.steps || testCase?.steps || '—') + '</p></article><article><h3>核对数据</h3><p>' + esc(definition?.checks || '—') + '</p></article><article class="expected"><h3>期望结果</h3><p>' + esc(definition?.expected || testCase?.expected || '—') + '</p></article>' + (definition?.relatedCase ? '<article class="wide functional-related-case"><h3>关联用例 / 后续处理</h3><p>' + esc(definition.relatedCase) + '</p></article>' : '') + '<article class="wide"><h3>设计方法 / 依据</h3><p>' + esc(definition?.designBasis || '—') + '</p></article></div></section></section>'
        + reconciliationLayers + transactionSection + rawData
        + '<section class="panel functional-run-meta"><h2>本次自动化运行</h2><dl><dt>批次 ID</dt><dd><code>' + esc(result.batchId || '未记录') + '</code></dd><dt>结果 Run ID</dt><dd><code>' + esc(result.resultRunId || '未记录') + '</code></dd><dt>自动化结论</dt><dd>' + status(result.status) + '</dd><dt>版本 / 环境</dt><dd>' + esc(((data.deploymentByEnvironment || {})[result.environment]?.version || definition?.release || data.run.release || '—') + ' / ' + result.environment) + '</dd><dt>Project</dt><dd>' + esc(result.project) + '</dd><dt>执行时间</dt><dd>' + esc(localTime(result.executedAt)) + '</dd><dt>总耗时</dt><dd>' + duration(result.durationMs) + '</dd><dt>优先级 / 标签</dt><dd>' + esc(result.priority + (result.tags?.length ? ' · ' + result.tags.join(' ') : '')) + '</dd><dt>矩阵节</dt><dd>' + esc(definition?.section || testCase?.sourcePath || '—') + '</dd><dt>执行入口</dt><dd>' + esc(definition?.entry || '—') + '</dd><dt>核对计划</dt><dd><code>' + esc(evidence?.checkPlan ? evidence.checkPlan.id + '@' + evidence.checkPlan.version + ' · ' + evidence.checkPlan.digest : '未绑定') + '</code></dd><dt>核对证据</dt><dd><code>' + esc(evidence?.sourcePath || '未发现结构化 evidence JSON') + '</code></dd></dl>' + (result.error ? '<details class="functional-error"><summary><strong>展开完整失败原因</strong> · ' + esc(shortError(result.error)) + '</summary><pre>' + esc(plainError(result.error)) + '</pre></details>' : '') + '</section>'
        + '<section class="panel functional-attempts"><div class="section-head"><div><h2>执行尝试</h2><p class="muted">重试、耗时与失败现场按尝试保留。</p></div><strong>' + (result.attempts || []).length + ' 次</strong></div><div class="table-scroll"><table><thead><tr><th>尝试</th><th>结果</th><th>耗时</th><th>开始时间</th><th>错误</th></tr></thead><tbody>' + attemptRows + '</tbody></table></div></section>'
        + '<section class="panel functional-evidence"><div class="section-head"><div><h2>证据附件</h2><p class="muted">JSON 保留逐项 Actual / Expected；失败用例同时保留探测与现场证据。</p></div><strong>' + attachments.length + ' 个</strong></div>' + (attachmentRows ? '<ul>' + attachmentRows + '</ul>' : '<p class="muted">本次没有附件。</p>') + (annotationRows ? '<h3>覆盖说明</h3><ul class="functional-annotations">' + annotationRows + '</ul>' : '') + '</section>';
      document.getElementById('delete-functional-record').disabled = false;
      bindFunctionalExecutionSteps();
    }
    function renderFunctionalResults() {
      const rows = filteredFunctionalResults();
      document.getElementById('functional-visible-count').textContent = rows.length + ' / ' + (data.functionalResults || []).length + ' 条';
      if (!rows.some(function (item) { return functionalKey(item) === functionalState.selectedKey; })) {
        functionalState.selectedKey = rows[0] ? functionalKey(rows[0]) : '';
      }
      functionalSelect.innerHTML = rows.map(function (item) { return '<option value="' + esc(functionalKey(item)) + '">' + esc(item.id + ' · ' + item.scenarioTitle + ' · ' + item.status + ' · ' + item.project) + '</option>'; }).join('') || '<option value="">没有匹配结果</option>';
      functionalSelect.value = functionalState.selectedKey;
      renderFunctionalDetail();
    }
    async function deleteExecutionRecord(result, button) {
      if (!result) { window.alert('当前没有可删除的执行记录。'); return; }
      const label = result.id + ' · ' + result.scenarioTitle + ' · ' + result.project;
      if (!window.confirm('确认删除执行记录「' + label + '」？\\n只从“最近结果”视图移除（artifacts/runs 历史档案保留）；之后的新执行会重新出现。')) return;
      button.disabled = true;
      try {
        const response = await fetch('./api/execution-records/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: result.id, project: result.project }) });
        const body = await response.json().catch(function () { return {}; });
        if (!response.ok) throw new Error(body.error || ('接口返回 ' + response.status));
        location.reload();
      } catch (error) {
        button.disabled = false;
        window.alert('删除失败：' + error.message + '\\n（删除需要经 npm run dashboard:serve 打开本页。）');
      }
    }
    function render() {
      const result = data.results.find(function (item) { return item.id + ':' + item.project === select.value; });
      if (!result) {
        content.innerHTML = '<section class="panel empty">当前运行没有结构化执行证据。</section>';
        return;
      }
      const e = result.executionEvidence;
      const executionStatus = e.executionStatus || (e.reconciliations.some(function (item) { return item.status === 'FAIL'; }) ? 'FAIL' : 'PASS');
      const coverageStatus = e.coverageStatus || 'COMPLETE';
      content.innerHTML = '<section class="hero panel"><div><span class="eyebrow">' + esc(result.id) + ' · ' + esc(result.project) + '</span><h2>' + esc(result.scenarioTitle) + '</h2><p>' + esc(result.checkResult) + '</p></div>'
        + '<div class="hero-meta"><span>执行结果 ' + status(executionStatus) + '</span><span>自动化覆盖 ' + status(coverageStatus) + '</span><span>批次 <strong>' + esc(result.batchId || '未记录') + '</strong></span><span class="fork-label">Project / 环境 <strong>' + esc(result.project) + ' / ' + esc(e.forkDisplayName || result.environment) + '</strong></span><span>模式 <strong>' + esc(e.mode) + '</strong></span><span>保留 Fork <strong>' + (e.persistent ? '是' : '否') + '</strong></span></div>'
        + (e.coverageNote ? '<p class="coverage-note"><strong>覆盖说明：</strong>' + esc(e.coverageNote) + '</p>' : '') + '</section>'
        + renderCaseOverview(result) + renderDeploymentSummary(result) + renderScreenshots(result) + renderExecutionSteps(e)
        + '<section class="panel provenance"><h2>证据来源</h2><dl><dt>执行证据</dt><dd><code>' + esc(e.sourcePath) + '</code></dd><dt>公式总表</dt><dd><a href="./formulas.html">合约核心公式页面</a><br><code>' + esc(e.formulaSourcePath) + '</code></dd></dl></section>';
      bindExecutionSteps(e);
    }
    data.results.forEach(function (item) {
      const option = document.createElement('option'); option.value = item.id + ':' + item.project;
      option.textContent = item.id + ' · ' + item.scenarioTitle + ' · ' + item.project; select.appendChild(option);
    });
    const requested = urlQuery.get('scenario');
    const match = data.results.find(function (item) { return item.id === requested; });
    if (match) select.value = match.id + ':' + match.project;
    select.addEventListener('change', render);
    const deleteButton = document.getElementById('delete-record');
    deleteButton.addEventListener('click', function () {
      const result = data.results.find(function (item) { return item.id + ':' + item.project === select.value; });
      deleteExecutionRecord(result, deleteButton);
    });
    const requestedFunctional = (data.functionalResults || []).find(function (item) { return item.id === requested; });
    if (requestedFunctional) functionalState.selectedKey = functionalKey(requestedFunctional);
    Object.values(functionalControls).forEach(function (control) { control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', renderFunctionalResults); });
    functionalSelect.addEventListener('change', function () {
      functionalState.selectedKey = functionalSelect.value;
      const item = (data.functionalResults || []).find(function (result) { return functionalKey(result) === functionalState.selectedKey; });
      if (item && history.replaceState) { const url = new URL(location.href); url.searchParams.set('type', 'functional'); url.searchParams.set('scenario', item.id); if (item.batchId) url.searchParams.set('batch', item.batchId); else url.searchParams.delete('batch'); history.replaceState(null, '', url.pathname + url.search + url.hash); }
      renderFunctionalDetail();
    });
    const deleteFunctionalButton = document.getElementById('delete-functional-record');
    deleteFunctionalButton.addEventListener('click', function () {
      const result = (data.functionalResults || []).find(function (item) { return functionalKey(item) === functionalState.selectedKey; });
      deleteExecutionRecord(result, deleteFunctionalButton);
    });
    const executionTabs = Array.from(document.querySelectorAll('[data-execution-tab]'));
    const executionPanels = { scenario: document.getElementById('execution-panel-scenario'), functional: document.getElementById('execution-panel-functional') };
    function setExecutionTab(name, updateUrl) {
      if (!executionPanels[name]) name = 'scenario';
      executionTabs.forEach(function (button) { const active = button.dataset.executionTab === name; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
      Object.keys(executionPanels).forEach(function (key) { executionPanels[key].hidden = key !== name; });
      if (updateUrl && history.replaceState) { const url = new URL(location.href); if (name === 'functional') url.searchParams.set('type', 'functional'); else url.searchParams.delete('type'); history.replaceState(null, '', url.pathname + url.search + url.hash); }
    }
    executionTabs.forEach(function (button) { button.addEventListener('click', function () { setExecutionTab(button.dataset.executionTab, true); }); });
    bindFunctionalBasisTips();
    initializeFunctionalBatchFilter();
    renderFunctionalMetrics();
    renderFunctionalResults();
    render();
    setExecutionTab(requestedFunctional || urlQuery.get('type') === 'functional' ? 'functional' : 'scenario', false);
    document.getElementById('executions-page').dataset.pageReady = 'true';
  })();`;

  return renderPageShell({
    title: 'FX100 执行详情',
    subtitle: '核对快照、Expected、公式依据，以及交易员与 Keeper 的签名交易证据',
    active: 'executions',
    readyId: 'executions-page',
    content,
    script,
    extraStyles: `
      [hidden]{display:none!important}.execution-tabs{display:flex;gap:8px;margin:0 0 14px;padding:5px;border:1px solid var(--line);border-radius:14px;background:#0c1424;width:max-content;max-width:100%}.execution-tabs button{display:flex;align-items:center;gap:9px;border:0;border-radius:10px;background:transparent;color:var(--muted);padding:10px 18px;font:inherit;font-weight:750;cursor:pointer}.execution-tabs button span{display:inline-flex;align-items:center;justify-content:center;min-width:28px;border-radius:999px;background:#17243a;color:#9fb3cf;padding:1px 7px;font-size:11px}.execution-tabs button[aria-selected="true"]{background:#14569a;color:#fff;box-shadow:0 5px 14px rgba(20,86,154,.28)}.execution-tabs button[aria-selected="true"] span{background:rgba(255,255,255,.16);color:#fff}
      .controls { display:grid; grid-template-columns:minmax(260px,2fr) 1fr 1.4fr auto; gap:14px; align-items:end; margin-bottom:14px; }
      .functional-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px}.functional-metric{display:grid;gap:3px;border-left:4px solid #3978bd}.functional-metric span{color:var(--muted);font-size:12px}.functional-metric strong{font-size:25px}.functional-metric.metric-pass{border-left-color:#1d7a5c}.functional-metric.metric-fail{border-left-color:#9f3347}.functional-metric.metric-pending{border-left-color:#8b6914}.functional-controls{grid-template-columns:minmax(330px,2fr) 145px 160px minmax(220px,1fr) auto auto}.functional-controls input{min-height:40px;border:1px solid var(--line);border-radius:9px;background:#0b1220;color:var(--text);padding:8px 10px}.functional-controls select{width:100%;min-width:0}.functional-detail-hero{margin-bottom:12px;border-left:4px solid #3978bd}.functional-detail-hero h2{margin:4px 0 7px;font-size:24px}.functional-detail-hero p{margin:0;color:#cbd5e1}.functional-layer-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:12px}.functional-layer-grid article{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:11px 13px}.functional-layer-grid article>span:first-child{color:var(--muted);font-size:11px}.functional-case-overview,.functional-transactions,.functional-checks,.functional-run-meta,.functional-attempts,.functional-evidence,.functional-raw-data{margin-bottom:14px}.functional-transactions td:nth-child(2) small{display:block;margin-top:4px;color:var(--muted);font-size:10px;overflow-wrap:anywhere}.functional-tx-actions{display:grid;gap:5px;min-width:490px}.functional-tx-record .functional-tx-actions{min-width:0}.functional-tx-record dd{min-width:0}.functional-tx-record code{display:block;max-width:100%;overflow-wrap:anywhere}.functional-tx-record .functional-tx-explorer-link,.functional-tx-record .functional-tx-unavailable{width:100%;min-width:0}.functional-tx-explorer-link,.functional-tx-unavailable{display:grid;gap:3px;width:max-content;max-width:100%;text-decoration:none}.functional-tx-explorer-link code,.functional-tx-hash{color:#8fc2ff;overflow-wrap:anywhere}.functional-tx-explorer-link span,.functional-tx-link{font-size:10px;color:var(--muted)}.functional-tx-missing{width:max-content;border:1px solid #8b6914;border-radius:999px;padding:2px 7px;color:#fbbf24;background:rgba(139,105,20,.12);font-size:10px}.functional-tx-explorer-link:hover code,.functional-tx-link:hover{color:#bfdbfe;text-decoration:underline}.status-RECORDED{color:#60a5fa;border-color:#2f6ca5}.functional-run-meta h2{margin-top:0}.functional-error{margin-top:12px;border:1px solid #9f3347;border-radius:9px;background:#2b1118;padding:10px;color:#fda4af}.functional-error pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:7px 0 0;max-height:260px;overflow:auto}.functional-check-filter{border:1px solid var(--line);border-radius:999px;padding:4px 9px;color:var(--muted);background:#0c1424;font:inherit;font-size:11px;cursor:pointer}.functional-check-filter.is-active{color:#e8f2ff;border-color:#5ea7ff;background:#12345b}.functional-check-row[data-check-status="FAIL"] td{background:rgba(159,51,71,.08)}.check-index{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;margin-right:7px;border-radius:999px;background:#17243a;color:var(--muted);font-size:10px}.functional-check-value{min-width:230px;max-width:390px}.functional-check-value pre,.functional-raw-data pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}.functional-readable-value{display:block;margin-top:6px;color:#8fc2ff;font:700 12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap}.functional-check-value.actual{background:rgba(94,167,255,.055)}.functional-check-value.expected{background:rgba(54,211,153,.055)}.functional-check-note{min-width:300px;max-width:480px;white-space:normal}.functional-check-explanation{display:grid;gap:8px}.functional-explanation-block{display:grid;gap:6px;border:1px solid #2a3d58;border-radius:9px;background:#0a1322;padding:9px 10px}.functional-explanation-block>span{width:max-content;border-radius:999px;padding:2px 7px;font-size:10px;font-weight:800;letter-spacing:.02em}.functional-explanation-block code{display:block;color:#dce9f8;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;font:11px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}.functional-explanation-block p{margin:0;color:#c6d3e4;white-space:pre-wrap;line-height:1.58}.functional-explanation-block ul{display:grid;gap:6px;margin:0;padding:0 0 0 18px;color:#c6d3e4}.functional-explanation-block li{padding-left:2px;line-height:1.55}.scenario-formula-stack{display:grid;gap:7px}.scenario-formula-section,.functional-formula-section{display:grid;gap:4px}.formula-lines{display:grid;gap:4px}.formula-line{display:flex;align-items:flex-start;gap:6px}.formula-line code{display:block}.formula-line.is-title{color:#8fc2ff;font-weight:800}.formula-line.is-title code{color:inherit}.formula-line.is-list-item{padding-left:10px}.formula-line.is-list-item:before{content:'•';color:#8fc2ff;line-height:1.4;display:inline-block;margin-right:2px}.formula-line.is-condition{font-weight:700}.formula-line.is-equation{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#dbeafe}.formula-line.is-boundary{border-left:3px solid #f59e0b;padding-left:8px;background:rgba(245,158,11,.08)}.formula-line.is-outcome{border-left:3px solid #60a5fa;padding-left:8px;background:rgba(96,165,250,.06)}.formula-line.is-equation code{font-family:inherit}.formula-outcome{display:inline-flex;padding:0 7px;border-radius:999px;background:rgba(96,165,250,.16);color:#93c5fd;font-size:10px;font-weight:800;margin-left:4px;white-space:nowrap}.formula-note{border-left:3px solid #8b5cf6;background:rgba(139,92,246,.05)}.formula-note>span{color:#c4b5fd;background:rgba(139,92,246,.16)}.formula-rule{border-left:3px solid #5ea7ff}.formula-rule>span{color:#9fc9ff;background:rgba(94,167,255,.12)}.formula-example{border-left:3px solid #d6a845;background:rgba(214,168,69,.045)}.formula-example>span{color:#f5cf7a;background:rgba(214,168,69,.12)}.formula-basis{border-left:3px solid #45a87e;background:rgba(69,168,126,.045)}.formula-basis>span{color:#79d7ad;background:rgba(69,168,126,.12)}.functional-formula-source{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:7px;border-top:1px dashed #31435d;padding-top:7px;color:var(--muted);font-size:10px}.functional-formula-source a{color:#8fc2ff}.functional-basis-tip{display:inline-flex;align-items:center;justify-content:flex-start}.functional-basis-tip-trigger{display:inline-flex;align-items:center;gap:5px;width:max-content;border:1px solid #3978bd;border-radius:999px;background:rgba(31,79,125,.2);color:#9fc9ff;padding:5px 9px;font:inherit;font-size:11px;font-weight:750;cursor:pointer}.functional-basis-tip-trigger:hover,.functional-basis-tip-trigger:focus-visible,.functional-basis-tip-trigger[aria-expanded="true"]{border-color:#6db3ff;background:#153b64;color:#e8f2ff;outline:none}.functional-basis-popover{display:none;position:fixed;inset:auto;box-sizing:border-box;width:min(520px,calc(100vw - 24px));max-height:min(70vh,600px);margin:0;overflow:auto;z-index:1000;border:1px solid #3d5d82;border-radius:12px;background:#081220;color:var(--text);padding:12px;box-shadow:0 20px 55px rgba(0,0,0,.5)}.functional-basis-popover:popover-open{display:grid;gap:9px}.functional-basis-popover.is-open{display:grid;gap:9px}.functional-basis-popover .formula-basis{margin:0}.functional-basis-popover .functional-formula-source{margin-top:0}.functional-check-head-actions{display:grid;justify-items:end;gap:8px;text-align:right}.functional-formula-catalog-link{font-size:11px}.functional-raw-data{padding:0}.functional-raw-data summary{display:flex;justify-content:space-between;gap:12px;padding:13px 15px;cursor:pointer}.functional-raw-data summary span{color:var(--muted);font-size:11px}.functional-raw-data>pre{border-top:1px solid var(--line);padding:14px;max-height:560px;overflow:auto}.functional-evidence ul{display:grid;gap:7px;padding:0;margin:0;list-style:none}.functional-evidence li{display:flex;justify-content:space-between;gap:10px;border:1px solid var(--line);border-radius:8px;background:#0b1220;padding:8px 10px;overflow-wrap:anywhere}.functional-evidence li small{color:var(--muted)}.functional-evidence h3{margin:16px 0 8px}.functional-annotations li{display:grid;justify-content:stretch}.functional-annotations li span{color:var(--muted);font-size:11px}.status-GAP,.status-NOT_RUN,.status-SKIP,.status-SKIPPED{color:#94a3b8;border-color:#475569}.status-FLAKY{color:#fbbf24;border-color:#8b6914}
      .functional-check-title{min-width:245px;max-width:320px}.functional-check-title>div{display:flex;align-items:center}.functional-check-title>div strong{line-height:1.4}.functional-check-title>small{display:block;margin:6px 0;color:#7f93ad;font:10px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}.functional-check-kind{display:inline-flex;border:1px solid;border-radius:999px;padding:2px 7px;font-size:10px;font-weight:800}.functional-check-kind-calculation{border-color:#2f6ca5;color:#93c5fd;background:rgba(47,108,165,.12)}.functional-check-kind-assertion{border-color:#6d54a3;color:#c4b5fd;background:rgba(109,84,163,.12)}.functional-assertion-actual,.functional-assertion-expected{display:grid;gap:5px;min-width:250px}.functional-assertion-actual small,.functional-assertion-expected small{color:var(--muted);font-size:10px}.functional-assertion-actual strong,.functional-assertion-expected strong{overflow-wrap:anywhere;line-height:1.45}.functional-assertion-placeholder{min-width:90px;color:#53657d;text-align:center}.functional-assertion-section{border-left:3px solid #8b5cf6;background:rgba(139,92,246,.045)}.functional-assertion-section>span{color:#c4b5fd;background:rgba(139,92,246,.16)}.functional-assertion-evidence{border-left:3px solid #45a87e;background:rgba(69,168,126,.045)}.functional-assertion-evidence>span{color:#79d7ad;background:rgba(69,168,126,.12)}.functional-assertion-verdict{font-weight:750;color:#b9ebd3!important}.functional-assertion-note{border-top:1px dashed #33445c;padding-top:7px}.functional-assertion-reference{display:grid;grid-template-columns:90px minmax(230px,1fr) auto;gap:8px;align-items:start;border-top:1px solid #263b59;padding-top:7px}.functional-assertion-reference>span{color:var(--muted);font-size:10px}.functional-assertion-reference>a{color:#8fc2ff;white-space:nowrap;text-decoration:none}.functional-assertion-reference>a:hover{text-decoration:underline}.functional-assertion-missing{width:max-content;border:1px solid #8b6914;border-radius:999px;padding:2px 7px;color:#fbbf24;background:rgba(139,105,20,.12);font-size:10px}.functional-calculation-row{border-left:3px solid #2f6ca5}.functional-assertion-row{border-left:3px solid #6d54a3}
      main{width:min(2200px,calc(100% - 24px))}.functional-check-table{width:100%;min-width:0;table-layout:fixed;font-size:11px}.functional-check-table .functional-check-col-title{width:17%}.functional-check-table .functional-check-col-status{width:6%}.functional-check-table .functional-check-col-before{width:10%}.functional-check-table .functional-check-col-after{width:11%}.functional-check-table .functional-check-col-actual-delta{width:9%}.functional-check-table .functional-check-col-expected-delta{width:10%}.functional-check-table .functional-check-col-expected{width:12%}.functional-check-table .functional-check-col-basis{width:25%}.functional-check-table th,.functional-check-table td{min-width:0;max-width:none;padding:8px 6px;overflow-wrap:anywhere}.functional-check-table th{line-height:1.3;white-space:normal}.functional-check-table .functional-check-title,.functional-check-table .functional-check-value,.functional-check-table .functional-check-note,.functional-check-table .functional-assertion-actual,.functional-check-table .functional-assertion-expected,.functional-check-table .functional-assertion-placeholder{min-width:0;max-width:none}.functional-check-table td.functional-assertion-actual,.functional-check-table td.functional-assertion-expected{display:table-cell}.functional-check-table .functional-check-title>small{margin:3px 0;font-size:9px;line-height:1.3}.functional-check-table .functional-check-kind{padding:1px 5px;font-size:9px}.functional-check-table .functional-value-raw{display:block;width:100%;margin:0;color:#8b9bb0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;overflow-wrap:normal;font-size:9px;line-height:1.35;cursor:help}.functional-check-table .functional-readable-value{margin-top:3px;color:#a8d2ff;white-space:normal;overflow-wrap:anywhere;font-size:11px;line-height:1.35}.functional-check-table .functional-basis-tip-trigger{padding:4px 7px;font-size:10px}.functional-check-table .functional-explanation-block{padding:7px 8px}.functional-check-table .functional-explanation-block code{font-size:10px;line-height:1.45}
      .functional-controls{grid-template-columns:minmax(280px,2fr) 125px 145px minmax(250px,1.5fr) minmax(220px,1.4fr) auto auto}.execution-binding-summary{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px;padding:12px 16px}.execution-binding-summary>div{display:grid;gap:2px;min-width:0}.execution-binding-summary .eyebrow{color:var(--muted);font-size:10px}.execution-binding-summary strong{overflow-wrap:anywhere}.execution-binding-summary small{color:var(--muted)}.functional-case-overview{border-color:#2d4b70;background:linear-gradient(145deg,rgba(28,58,91,.28),var(--panel) 48%);box-shadow:0 12px 34px rgba(2,8,23,.18)}.functional-case-overview>.section-head{align-items:center;padding-bottom:12px;border-bottom:1px solid rgba(94,167,255,.18)}.functional-case-head{flex-wrap:wrap}.execution-binding-inline{flex:0 1 540px;min-width:min(100%,360px);margin:0;padding:10px 12px;border:1px solid #31577f;border-radius:11px;background:rgba(24,58,94,.28)}.execution-binding-inline .case-link{font-size:11px}.functional-case-submodule{margin-bottom:10px;border:1px solid #263b59;border-radius:11px;background:#0a1322;padding:12px 14px}.functional-case-participant{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:start}.functional-case-identity{min-width:0}.functional-case-participant .case-meta{margin:7px 0 0}.functional-case-participant .case-meta strong{color:#c9d8eb}.functional-case-account{grid-template-columns:130px minmax(0,1fr);margin:0;padding-top:11px;border-top:1px solid #263b59}.functional-case-account dd,.functional-case-account code{min-width:0;overflow-wrap:anywhere;word-break:break-word}.functional-test-data{border-left:3px solid #5ea7ff;background:rgba(17,45,76,.34)}.functional-test-data h3{margin:4px 0 7px;color:#b8d8ff}.functional-test-data p{margin:0;white-space:pre-line;color:#d8e6f8;line-height:1.6}.functional-case-design{border-left:3px solid #62748d}.functional-case-design .case-important-grid{margin:10px 0 0}.functional-related-case{border-color:#4a5470!important;background:rgba(99,102,241,.045)!important}.functional-tx-workflow,.functional-checks{border-color:#294260}.functional-action-module{padding:0;margin-bottom:14px;overflow:hidden;border-color:#31577f;background:#0d1829;box-shadow:0 12px 34px rgba(2,8,23,.22)}.functional-action-header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;padding:16px 18px;border-bottom:1px solid #31506f;background:linear-gradient(120deg,rgba(24,70,116,.34),rgba(12,23,40,.7))}.functional-action-title{flex:1;min-width:0}.functional-action-title h2{margin:4px 0 7px}.functional-action-title p{margin:0;color:#cbd5e1}.functional-action-body{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;padding:14px}.functional-action-submodule{min-width:0;border:1px solid #263b59;border-radius:11px;background:#09121f;padding:14px}.functional-action-checks{margin:0;border-left:3px solid #2f6ca5}.functional-check-submodule-head{margin-bottom:10px}.functional-submodule-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:12px}.functional-submodule-head h3{margin:4px 0 0;font-size:18px}.functional-submodule-head p{margin:6px 0 0;color:#c5d2e3}.functional-trade-summary{margin:0;border-left:3px solid #5ea7ff}.trade-direction{border:1px solid #2f6ca5;border-radius:999px;padding:5px 10px;color:#93c5fd;background:rgba(47,108,165,.12);font-weight:800;white-space:nowrap}.trade-direction.short{color:#c4b5fd;border-color:#6d54a3;background:rgba(109,84,163,.12)}.trade-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:12px 0}.trade-summary-grid article{display:grid;gap:4px;border:1px solid #263b59;border-radius:10px;background:#0c1727;padding:11px 13px}.trade-summary-grid span{color:var(--muted);font-size:11px}.trade-summary-grid strong{font-size:17px;overflow-wrap:anywhere}.trade-summary-meta{grid-template-columns:145px minmax(0,1fr);margin:0;padding-top:12px;border-top:1px solid #263b59}.functional-tx-receipt{border-left:3px solid #62748d}.functional-tx-receipt dl{grid-template-columns:145px minmax(0,1fr);margin:0;padding-top:12px;border-top:1px solid #263b59}.functional-tx-receipt .functional-tx-actions{min-width:0}.functional-tx-receipt .functional-tx-explorer-link,.functional-tx-receipt .functional-tx-unavailable{width:100%;min-width:0}.functional-tx-receipt code,.functional-trade-summary code{display:block;max-width:100%;overflow-wrap:anywhere;word-break:break-word}
      .screenshots .shot-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:14px; margin-top:10px; }
      .screenshots .shot { margin:0; border:1px solid var(--line); border-radius:10px; overflow:hidden; background:#0b1220; }
      .screenshots .shot img { display:block; width:100%; height:auto; aspect-ratio:16/9; object-fit:cover; object-position:top; }
      .screenshots .shot figcaption { padding:8px 10px; font-size:12px; line-height:1.4; overflow-wrap:anywhere; }
      #delete-record,#delete-functional-record { min-height:40px; border:1px solid #8b3a3a; border-radius:9px; background:#2b1118; color:#ff9a9a; padding:8px 12px; cursor:pointer; }
      #delete-record:hover,#delete-functional-record:hover { background:#3a1520; }
      #delete-record:disabled,#delete-functional-record:disabled { opacity:.5; cursor:not-allowed; }
      label,.source-state { display:grid; gap:5px; color:var(--muted); font-size:12px; min-width:0; }
      select { min-height:40px; border:1px solid var(--line); border-radius:9px; background:#0b1220; color:var(--text); padding:8px 10px; }
      .source-state strong { color:var(--text); overflow-wrap:anywhere; }
      .hero { display:flex; flex-wrap:wrap; justify-content:space-between; gap:20px; align-items:flex-start; margin-bottom:14px; }.hero>div:first-child{flex:1;min-width:280px}
      .hero h2 { font-size:24px; margin:4px 0 7px; }.hero p{margin:0;color:#cbd5e1}.eyebrow{color:#8fc2ff;font-weight:700}
      .hero-meta { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; }.hero-meta>span{border:1px solid var(--line);border-radius:999px;padding:6px 10px;background:#0c1424;white-space:nowrap}
      .hero-meta>.fork-label{white-space:normal;overflow-wrap:anywhere;max-width:100%}
      .section,.case-overview { margin-bottom:14px; }.section-head,.tx-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:14px}.section-head h2,.tx-head h3,.provenance h2{margin:0}.section-head p{margin:4px 0 0}
      .table-scroll{overflow:auto}.check-scroll{max-height:760px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:10px 9px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{position:sticky;top:0;background:var(--panel);color:var(--muted);z-index:1}
      .status{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:2px 7px;font-size:11px;font-weight:750}.status-PASS,.status-SUCCESS,.status-COMPLETE{color:#36d399;border-color:#1d7a5c}.status-FAIL,.status-REVERTED{color:#fb7185;border-color:#9f3347}.status-CALCULATED{color:#60a5fa;border-color:#2f6ca5}.status-NOT_VERIFIED{color:#fbbf24;border-color:#8b6914}.status-BLOCKED{color:#a78bfa}.status-PARTIAL{color:#fbbf24;border-color:#8b6914}
      .coverage-note{flex-basis:100%;margin:0!important;padding-top:10px;border-top:1px solid var(--line);color:#f8dda0!important}
      .case-link{border:1px solid #3978bd;border-radius:9px;padding:7px 10px;text-decoration:none;white-space:nowrap}.case-meta{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px}.case-meta span{border:1px solid var(--line);border-radius:999px;padding:3px 8px;color:var(--muted)}.case-summary{grid-template-columns:110px 1fr;margin:0 0 14px}.case-summary dd{white-space:pre-line}.case-important-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:12px}.case-important-grid article{border:1px solid var(--line);border-radius:10px;padding:11px 13px;background:#0b1220}.case-important-grid article.wide{grid-column:1/-1}.case-important-grid article.expected{border-color:#315f51;background:rgba(54,211,153,.045)}.case-important-grid h3{margin:0 0 6px;color:#9fc9ff;font-size:12px}.case-important-grid p{margin:0;white-space:pre-line;color:#d8e2f0;line-height:1.55}.case-environment{border:1px solid var(--line);border-radius:10px;background:#0b1220}.case-environment summary{padding:10px 12px;cursor:pointer;color:var(--muted);font-weight:700}.case-environment[open] summary{border-bottom:1px solid var(--line);color:var(--text)}.case-environment dl{padding:12px;margin:0;grid-template-columns:120px 1fr}.case-environment dd{white-space:pre-line}.check-filter-block{display:grid;grid-template-columns:150px 1fr;gap:10px;align-items:start}.filter-label{color:var(--muted);font-size:11px;padding-top:4px}.hash-link,.api-link{display:block}.api-link{font-size:11px;margin-top:3px}.check-groups{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}.check-filter{border:1px solid var(--line);border-radius:999px;padding:4px 9px;color:var(--muted);background:#0c1424;font:inherit;font-size:11px;cursor:pointer}.check-filter:hover{border-color:#3978bd;color:var(--text)}.check-filter.is-active{color:#e8f2ff;border-color:#5ea7ff;background:#12345b;box-shadow:0 0 0 1px rgba(94,167,255,.16)}.check-filter strong{color:var(--text)}tr[hidden]{display:none}.value{min-width:190px;max-width:290px;overflow-wrap:anywhere}.before{background:rgba(148,163,184,.045)}.after{background:rgba(94,167,255,.055)}.delta{background:rgba(251,191,36,.045)}.expected{background:rgba(54,211,153,.055)}
      .formula-cell{min-width:330px;max-width:470px}.formula{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#d8e6ff;white-space:pre-wrap}.basis,.note{margin-top:6px;color:var(--muted);font-size:11px}.basis code{overflow-wrap:anywhere}
      .tx-workflow{margin-bottom:14px}.tx-step-tabs{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:9px}.tx-step-tab{display:grid;gap:5px;text-align:left;border:1px solid var(--line);border-radius:11px;background:#0b1220;color:#c5d1e0;padding:12px;cursor:pointer;font:inherit;min-width:0;transition:border-color .15s ease,background-color .15s ease,box-shadow .15s ease,color .15s ease}.tx-step-tab:hover{border-color:#3978bd;background:#0d1a2c;color:var(--text)}.tx-step-tab:focus-visible{outline:2px solid #8fc2ff;outline-offset:2px}.tx-step-tab.is-active{border-color:#5ea7ff;background:#102b4b;color:#f4f8ff;box-shadow:0 0 0 1px rgba(94,167,255,.32),0 8px 22px rgba(5,24,48,.28)}.tx-step-tab span{color:#7890ad;font-size:11px;font-weight:800}.tx-step-tab:hover span{color:#8fc2ff}.tx-step-tab.is-active span{color:#a9d2ff}.tx-step-tab strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tx-step-tab small{color:var(--muted)}
      .tx-action-summary{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:10px}.tx-action-main{flex:1;min-width:0}.tx-action-summary h2{margin:4px 0 7px}.tx-action-summary p{margin:0;color:#cbd5e1;max-width:880px}.tx-action-metrics{display:flex;flex-wrap:wrap;gap:7px;justify-content:flex-end}.tx-action-metrics>span{border:1px solid var(--line);border-radius:999px;padding:5px 9px;white-space:nowrap}.tx-highlight-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:7px;margin-top:13px}.tx-conservation-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:7px;margin-top:7px}.tx-highlight-grid>div,.tx-conservation-grid>div{display:grid;gap:3px;border:1px solid var(--line);border-radius:9px;padding:8px 10px;background:#0b1220}.tx-conservation-grid>div{border-color:#315f51;background:rgba(54,211,153,.035)}.tx-highlight-grid span,.tx-conservation-grid span{color:var(--muted);font-size:11px}.tx-highlight-grid strong,.tx-conservation-grid strong{font-size:12px;overflow-wrap:anywhere}.tx-highlight-grid small,.tx-conservation-grid small{justify-self:start}.tx-record-list{display:grid;gap:8px;margin-bottom:14px}.tx-record{padding:0;margin-bottom:10px}.tx-record summary{display:grid;grid-template-columns:auto auto minmax(0,1fr) auto;gap:12px;align-items:center;padding:13px 15px;cursor:pointer;list-style:none}.tx-record summary::-webkit-details-marker{display:none}.tx-record summary:before{content:'▸';color:var(--muted)}.tx-record[open] summary:before{content:'▾'}.tx-record summary>span:nth-of-type(2){display:grid;gap:3px}.tx-record summary small{color:var(--muted)}.tx-record dl{border-top:1px solid var(--line);padding:14px 16px;margin:0}.tx-sequence{border:1px solid #3978bd;border-radius:7px;color:#8fc2ff;padding:4px 7px;font-size:11px;font-weight:800}.tx-record summary>.status{grid-column:4}
      .tx-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}.tx-card{scroll-margin-top:16px}.tx-card:target{border-color:#5ea7ff;box-shadow:0 0 0 2px rgba(94,167,255,.18)}.tx-card h3{margin:5px 0 0}.actor{font-size:11px;font-weight:750}.actor-TRADER{color:#8fc2ff}.actor-KEEPER{color:#c4b5fd}
      dl{display:grid;grid-template-columns:110px 1fr;gap:7px 12px}dt{color:var(--muted)}dd{margin:0;overflow-wrap:anywhere}.provenance{margin-top:14px}
      .empty{color:var(--muted)}
      @media(max-width:1199px){.functional-check-table{width:100%;min-width:1180px}}
      @media(max-width:1100px){.functional-controls{grid-template-columns:1fr 1fr 1fr}.functional-controls label:first-child,.functional-search{grid-column:span 2}}
      @media(max-width:900px){.controls,.functional-controls{grid-template-columns:1fr 1fr}.controls label,.functional-controls label:first-child,.functional-search{grid-column:1/-1}.functional-metrics{grid-template-columns:1fr 1fr}.trade-summary-grid{grid-template-columns:1fr 1fr}.functional-case-head{display:grid;grid-template-columns:1fr}.execution-binding-inline{width:100%;max-width:none}.functional-case-participant{grid-template-columns:1fr}.tx-grid{grid-template-columns:1fr}.hero{display:block}.hero-meta{justify-content:flex-start;margin-top:12px}.tx-action-summary,.functional-action-header{display:block}.tx-action-metrics{justify-content:flex-start;margin-top:12px}.tx-conservation-grid{grid-template-columns:1fr}}
      @media(max-width:600px){.execution-tabs{width:100%}.execution-tabs button{flex:1;justify-content:center;padding:9px 10px}.controls,.functional-controls,.functional-metrics,.trade-summary-grid{grid-template-columns:1fr}.controls label,.functional-controls label:first-child,.functional-search{grid-column:auto}.functional-layer-grid{grid-template-columns:1fr}.hero-meta{display:grid}.section-head,.functional-raw-data summary,.functional-submodule-head{display:block}.execution-binding-summary{display:grid}.execution-binding-summary .case-link{margin-top:2px}.execution-binding-inline{width:100%;min-width:0}.functional-case-account{grid-template-columns:minmax(0,1fr)}.functional-check-head-actions{justify-items:start;text-align:left;margin-top:10px}.case-link{display:inline-block;margin-top:10px;white-space:normal}.trade-direction{display:inline-flex;margin-top:10px}.case-important-grid{grid-template-columns:1fr}.case-important-grid article.wide{grid-column:auto}.check-filter-block{grid-template-columns:1fr;gap:3px}.value{min-width:165px}.formula-cell{min-width:280px}dl,.functional-tx-receipt dl,.trade-summary-meta{grid-template-columns:minmax(0,1fr)}.tx-card dd{margin-bottom:8px}}
    `,
  });
}

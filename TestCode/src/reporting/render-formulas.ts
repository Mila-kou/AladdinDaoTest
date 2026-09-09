import { marked, Renderer } from 'marked';

import { escapeHtml, renderPageShell } from './render-page-shell.js';
import type { FormulaReference } from './reference-sources.js';

/**
 * 公式页渲染。数据源由 reference-sources.ts 统一装载（三份都在 TestCase/E2E/ContractCodeSummary/v0.3.2/）：
 * - formulas.html      ← FX100-核心字段计算公式.md（合约，A 级）
 * - page-formulas.html ← FX100-前端代码公式.md（前端，B 级）+ 下方挂 FX100-Keeper代码公式.md（Keeper，K1/K2）
 * 看板导航 / 服务端路由白名单只有两页（render-page-shell.ts · dashboard-server.ts），所以 Keeper 公式不单开页，
 * 以页内锚点「Keeper 公式」作入口并标注来源与 mtime。
 */
interface FormulaPageOptions {
  readonly title: string;
  readonly subtitle: string;
  readonly active: 'formulas' | 'page-formulas';
  readonly readyId: string;
  readonly sourceKind: string;
  readonly notice: string;
  /** 挂在正文下方的附属文档（同一 .markdown-body 内，保证页面只有一个正文容器）。 */
  readonly attachment?: {
    readonly anchorId: string;
    readonly label: string;
    readonly sourceKind: string;
    readonly reference: FormulaReference;
    readonly notice: string;
  };
}

function renderMarkdown(markdown: string): string {
  const renderer = new Renderer();
  renderer.html = ({ text }) => escapeHtml(text);
  return marked.parse(markdown, { async: false, gfm: true, renderer }) as string;
}

function renderMeta(sourceKind: string, reference: FormulaReference, generatedAt: string): string {
  return `
  <section class="meta panel">
    <div><span>资料类型</span><strong>${escapeHtml(sourceKind)}</strong></div>
    <div><span>来源（真实路径）</span><strong>${escapeHtml(reference.sourcePath)}</strong></div>
    <div><span>源文件更新时间（mtime）</span><strong>${escapeHtml(reference.modifiedAt)}</strong></div>
    <div><span>页面生成时间</span><strong>${escapeHtml(generatedAt)}</strong></div>
  </section>`;
}

function renderFormulaPage(
  reference: FormulaReference,
  generatedAt: string,
  options: FormulaPageOptions,
): string {
  const attachment = options.attachment;
  const mainAnchorId = `${options.readyId}-doc`;
  const docSwitch = attachment
    ? `
  <nav class="doc-switch" aria-label="本页文档">
    <a href="#${mainAnchorId}">${escapeHtml(options.sourceKind)}</a>
    <a href="#${attachment.anchorId}">${escapeHtml(attachment.label)}</a>
  </nav>`
    : '';
  const attachmentHtml = attachment
    ? `
    <hr class="doc-divider">
    <section class="attachment" id="${attachment.anchorId}">
      <h1 class="attachment-title">${escapeHtml(attachment.label)}</h1>
      ${renderMeta(attachment.sourceKind, attachment.reference, generatedAt)}
      <section class="notice">${escapeHtml(attachment.notice)}</section>
      ${renderMarkdown(attachment.reference.markdown)}
    </section>`
    : '';
  const content = `
  ${renderMeta(options.sourceKind, reference, generatedAt)}
  <section class="notice">${escapeHtml(options.notice)}</section>${docSwitch}
  <article class="panel markdown-body" id="${mainAnchorId}">${renderMarkdown(reference.markdown)}${attachmentHtml}</article>`;

  return renderPageShell({
    title: options.title,
    subtitle: options.subtitle,
    active: options.active,
    readyId: options.readyId,
    content,
    extraStyles: `
      .meta { display:grid; grid-template-columns:1fr 2fr 1fr 1fr; gap:12px; margin-bottom:14px; }
      .meta div { display:grid; gap:5px; min-width:0; } .meta span { color:var(--muted); font-size:12px; } .meta strong { overflow-wrap:anywhere; }
      .notice { border:1px solid #2d5f8f; background:#10243b; color:#bfdbfe; border-radius:12px; padding:11px 14px; margin-bottom:14px; }
      .doc-switch { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px; }
      .doc-switch a { color:var(--text); text-decoration:none; border:1px solid #3978bd; background:#102a4d; border-radius:999px; padding:6px 12px; }
      .doc-divider { border:0; border-top:2px dashed var(--line); margin:48px 0 28px; }
      .attachment .meta { margin-top:10px; }
      .attachment-title { font-size:26px; }
      .markdown-body { max-width:1150px; margin:0 auto; padding:clamp(18px,4vw,42px); }
      .markdown-body h1 { font-size:30px; border-bottom:1px solid var(--line); padding-bottom:12px; }
      .markdown-body h2 { margin-top:38px; border-bottom:1px solid var(--line); padding-bottom:8px; }
      .markdown-body h3 { margin-top:28px; }
      .markdown-body p,.markdown-body li { color:#dbe6f6; }
      .markdown-body blockquote { margin:16px 0; padding:10px 16px; border-left:4px solid var(--accent); background:#0d1829; color:#cbd5e1; }
      .markdown-body pre { overflow:auto; padding:14px; border:1px solid var(--line); border-radius:10px; background:#090f1a; }
      .markdown-body code { background:#0b1423; border-radius:5px; padding:2px 5px; }
      .markdown-body pre code { background:transparent; padding:0; }
      .markdown-body table { display:block; overflow:auto; width:max-content; max-width:100%; border-collapse:collapse; font-size:13px; }
      .markdown-body th,.markdown-body td { border:1px solid var(--line); padding:8px 10px; text-align:left; vertical-align:top; }
      .markdown-body th { background:#172033; color:#c4d8ff; }
      @media(max-width:1000px){.meta{grid-template-columns:1fr 1fr}}
      @media(max-width:800px){.meta{grid-template-columns:1fr}.markdown-body{padding:16px}}
    `,
  });
}

export function renderContractFormulasHtml(
  reference: FormulaReference,
  generatedAt: string,
): string {
  return renderFormulaPage(reference, generatedAt, {
    title: 'FX100 合约核心公式',
    subtitle: 'ContractCodeSummary v0.3.2 详解层：合约、Reader、费用、Funding 与风控计算口径（A 级，绑定 CURRENT.json primary.head）',
    active: 'formulas',
    readyId: 'contract-formulas-page',
    sourceKind: '合约代码公式详解层（FX100-核心字段计算公式.md）',
    notice: '链上账本与 E2E 精确预期值复算的唯一口径；章节号即核对行 formulaBasis.section / 台账 c-<章>-<节> 行 id。最终断言必须记录区块、Oracle min/max、市场参数及 Solidity 取整方向。',
  });
}

/**
 * 页面数据公式页：正文是前端代码公式（B 级），下方挂 Keeper 代码公式（K1/K2）。
 * keeper 省略时只渲染前端公式（旧调用方兼容）。
 */
export function renderPageFormulasHtml(
  reference: FormulaReference,
  generatedAt: string,
  keeper?: FormulaReference,
): string {
  return renderFormulaPage(reference, generatedAt, {
    title: 'FX100 页面数据计算公式',
    subtitle: 'ContractCodeSummary v0.3.2 详解层：前端代码公式（fx100-apps SDK/App，B 级派生显示量）' + (keeper ? ' + Keeper 代码公式（K1/K2）' : ''),
    active: 'page-formulas',
    readyId: 'page-formulas-page',
    sourceKind: '前端代码公式（FX100-前端代码公式.md）',
    notice: '前端计算是 B 级派生显示量：验收标准是「算法与合约约束等价」，不是「数值等于链上」；与合约结果冲突时以当前 release 合约与 Reader 行为为准并记录差异。需求文档口径（Docs/Gordon-Notion需求文档归档/汇总/FX100-页面字段计算公式.md）已不再作为本页数据源。',
    ...(keeper ? {
      attachment: {
        anchorId: 'keeper-formulas-doc',
        label: 'Keeper 公式',
        sourceKind: 'Keeper 代码公式（FX100-Keeper代码公式.md）',
        reference: keeper,
        notice: '看板页面结构只有「合约核心公式」「页面数据公式」两页，Keeper 公式挂在本页下方。K1 决定型（oracle 报文选择、gas limit、时间窗）进入链上输入，是实际值的组成部分；K2 筛选型只影响调度，只验「不漏」、禁作 parity 基准。',
      },
    } : {}),
  });
}

import { marked, Renderer } from 'marked';

import { escapeHtml, renderPageShell } from './render-page-shell.js';
import type { FormulaReference } from './reference-sources.js';

interface FormulaPageOptions {
  readonly title: string;
  readonly subtitle: string;
  readonly active: 'formulas' | 'page-formulas';
  readonly readyId: string;
  readonly sourceKind: string;
  readonly notice: string;
}

function renderFormulaPage(
  reference: FormulaReference,
  generatedAt: string,
  options: FormulaPageOptions,
): string {
  const renderer = new Renderer();
  renderer.html = ({ text }) => escapeHtml(text);
  const markdownHtml = marked.parse(reference.markdown, { async: false, gfm: true, renderer });
  const content = `
  <section class="meta panel">
    <div><span>资料类型</span><strong>${escapeHtml(options.sourceKind)}</strong></div>
    <div><span>来源</span><strong>${escapeHtml(reference.sourcePath)}</strong></div>
    <div><span>源文件更新时间</span><strong>${escapeHtml(reference.modifiedAt)}</strong></div>
    <div><span>页面生成时间</span><strong>${escapeHtml(generatedAt)}</strong></div>
  </section>
  <section class="notice">${escapeHtml(options.notice)}</section>
  <article class="panel markdown-body">${markdownHtml}</article>`;

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
    subtitle: 'ContractCodeSummary：合约、Reader、费用、Funding 与风控计算口径',
    active: 'formulas',
    readyId: 'contract-formulas-page',
    sourceKind: '合约代码总结',
    notice: '用于链上账本与 E2E 精确预期值复算；最终断言必须记录区块、Oracle min/max、市场参数及 Solidity 取整方向。',
  });
}

export function renderPageFormulasHtml(
  reference: FormulaReference,
  generatedAt: string,
): string {
  return renderFormulaPage(reference, generatedAt, {
    title: 'FX100 页面数据计算公式',
    subtitle: '需求总结：下单、持仓、TP/SL、Protection、市场信息与订单列表展示口径',
    active: 'page-formulas',
    readyId: 'page-formulas-page',
    sourceKind: '需求文档归档 / 汇总',
    notice: '用于 UI 展示和用户口径核对；与合约结果冲突时，以当前 release 合约与 Reader 行为为最高优先级，并记录差异。',
  });
}

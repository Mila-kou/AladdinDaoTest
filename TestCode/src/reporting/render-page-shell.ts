export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function serializeForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');
}

interface PageOptions {
  readonly title: string;
  readonly subtitle: string;
  readonly active: 'dashboard' | 'executions' | 'test-cases' | 'runs' | 'environments' | 'parameters' | 'formulas' | 'page-formulas';
  readonly readyId: string;
  readonly content: string;
  readonly extraStyles?: string;
  readonly script?: string;
}

export function renderPageShell(options: PageOptions): string {
  const nav = [
    ['dashboard', './dashboard.html', '测试看板'],
    ['executions', './executions.html', '执行详情'],
    ['test-cases', './test-cases.html', '测试用例'],
    ['runs', './runs.html', '测试运行'],
    ['environments', './environments.html', '测试环境'],
    ['parameters', './parameters.html', '合约参数'],
    ['formulas', './formulas.html', '合约核心公式'],
    ['page-formulas', './page-formulas.html', '页面数据公式'],
  ].map(([key, href, label]) =>
    `<a href="${href}"${key === options.active ? ' aria-current="page"' : ''}>${label}</a>`,
  ).join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>${escapeHtml(options.title)}</title>
  <style>
    :root { --bg:#0a0f1c; --panel:#111827; --panel2:#172033; --line:#27344c; --text:#edf3ff; --muted:#93a4bd; --accent:#5ea7ff; }
    * { box-sizing:border-box; }
    body { margin:0; background:radial-gradient(circle at top right,#142342 0,var(--bg) 38%); color:var(--text); font:14px/1.55 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    main { width:min(1500px,calc(100% - 32px)); margin:0 auto; padding:24px 0 56px; }
    a { color:#8fc2ff; }
    .top-nav { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:22px; }
    .top-nav a { color:var(--muted); text-decoration:none; border:1px solid var(--line); background:#0c1424; border-radius:999px; padding:7px 12px; }
    .top-nav a[aria-current="page"] { color:var(--text); border-color:#3978bd; background:#102a4d; }
    header { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; margin-bottom:18px; }
    h1,h2,h3 { letter-spacing:-.02em; }
    h1 { margin:0; font-size:clamp(25px,4vw,38px); }
    .subtitle,.muted { color:var(--muted); }
    .subtitle { margin:7px 0 0; }
    .panel { border:1px solid var(--line); background:color-mix(in srgb,var(--panel) 92%,transparent); border-radius:14px; padding:16px; box-shadow:0 12px 30px rgba(0,0,0,.18); }
    code { color:#c4d8ff; }
    ${options.extraStyles ?? ''}
    @media (max-width:650px) { main { width:min(100% - 20px,1500px); padding-top:16px; } header { display:block; } }
    @media print { body { background:white; color:#111827; } main { width:100%; padding:0; } .top-nav { display:none; } .panel { box-shadow:none; background:white; } }
  </style>
</head>
<body>
<main id="${escapeHtml(options.readyId)}" data-page-ready="${options.script ? 'false' : 'true'}">
  <nav class="top-nav" aria-label="看板页面">${nav}</nav>
  <header><div><h1>${escapeHtml(options.title)}</h1><p class="subtitle">${escapeHtml(options.subtitle)}</p></div></header>
  ${options.content}
</main>
${options.script ? `<script>${options.script}</script>` : ''}
</body>
</html>`;
}

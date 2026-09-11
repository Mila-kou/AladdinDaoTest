/**
 * 防腐层（src/ui/selectors.ts）在真实生产组件上的定位验证——不依赖链上状态。
 *
 *   npx tsx scripts/close-dialog-selectors-smoke.ts
 *   （前端需已在 UI_APP_BASE_URL/localhost:3010 运行；/dev/order-tracking 是 dev-only harness，
 *     生产构建 404，无需钱包、无需 fork、无需 E2E_ENV）
 *
 * 背景：docs/07 Phase 1 的三方核对目标是「链驱动制备状态 + Playwright UI 观测采集 + 独立重算」，
 * 但 scn-009-ui-position-parity.ts 已发现前端对 Mock Market Bundle 创建的市场存在
 * "Market Unavailable"/"Positions (0)" 的链上数据水合问题（marketAddress 解析 bug），
 * 卡住了链驱动这条腿。CloseOrderTrackingHarness（/dev/order-tracking）用 jotai atom 直接
 * 注入 PositionInfo + 硬编码 closePreview（不走 marketsInfoDataAtom），可以先绕开这个卡点，
 * 单独验证「selectors.ts 的 testid/文案 fallback 定位策略在真实生产 ClosePositionDialog 组件上
 * 是否找得到值节点」——这是 Phase 0 防腐层能否用于 Phase 1 采集的前提，链上数值正确性核对
 * 不在本脚本范围内（harness 的 Est. Receive/执行价是硬编码值，Fee 行在此 harness 下不渲染）。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { chromium } from '@playwright/test';

import { CLOSE_DIALOG_FIELDS, collectDisplayValues } from '../src/ui/selectors.js';

async function main() {
  const appBaseUrl = process.env.UI_APP_BASE_URL ?? 'http://localhost:3010';
  const outDir = resolve(process.cwd(), 'artifacts/ui-smoke');
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300)); });

  const report: Record<string, unknown> = { appBaseUrl };
  try {
    await page.goto(new URL('/dev/order-tracking', appBaseUrl).toString(), { waitUntil: 'domcontentloaded' });
    const opened = page.getByTestId('open-close-dialog');
    await opened.waitFor({ state: 'visible', timeout: 10_000 });
    await opened.click();

    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });

    // 不点 Max 时的一次采集（closeSize 为空，Est. P&L 行按源码不渲染，其余字段应可读）
    const beforeMax = await collectDisplayValues(dialog, CLOSE_DIALOG_FIELDS);

    // 点 100% 预设，填充 closeSize，触发 Est. P&L 计算
    await dialog.getByText('Max', { exact: true }).click();
    await page.waitForTimeout(500);
    const afterMax = await collectDisplayValues(dialog, CLOSE_DIALOG_FIELDS);

    await page.screenshot({ path: resolve(outDir, 'close-dialog-harness.png'), fullPage: false });

    report.beforeMax = beforeMax;
    report.afterMax = afterMax;
    report.consoleErrors = consoleErrors.slice(0, 20);
  } catch (error) {
    report.error = error instanceof Error ? `${error.message}\n${error.stack?.split('\n').slice(0, 4).join('\n')}` : String(error);
    await page.screenshot({ path: resolve(outDir, 'close-dialog-harness-error.png') }).catch(() => undefined);
  } finally {
    await browser.close();
  }

  await writeFile(resolve(outDir, 'close-dialog-selectors-smoke-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  const afterMax = (report.afterMax ?? []) as Array<{ field: string; displayed: string | null; locatedBy: string }>;
  const located = afterMax.filter((f) => f.locatedBy !== 'none');
  console.log(`\n定位成功 ${located.length}/${afterMax.length} 个字段（fee 在本 harness 下预期为 0——组件源码未渲染该行，不是选择器故障）`);
}

main().catch((error) => { console.error(error); process.exit(1); });

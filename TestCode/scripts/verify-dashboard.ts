import { access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium, type Page } from '@playwright/test';

interface VerificationResult {
  readonly title: string | null;
  readonly dashboardNavLabel: string;
  readonly testRunNavHref: string | null;
  readonly faucetTitle: string | null;
  readonly fundingPanelExists: boolean;
  readonly fundingButtonEnabled: boolean;
  readonly fundingDefaultEnvironment: string;
  readonly faucetMonitorExists: boolean;
  readonly faucetMonitorAccount: string;
  readonly faucetMonitorToken: string;
  readonly faucetAutoFundingControlsExist: boolean;
  readonly faucetAutoFundingThresholdType: string | null;
  readonly faucetAutoFundingTargetType: string | null;
  readonly metricCards: number;
  readonly detailRowsBefore: number;
  readonly detailRowsAfter: number;
  readonly suiteLabel: string | null;
  readonly detailHeaders: string;
  readonly executionLinks: number;
  readonly scenarioExecutionHref: string | null;
  readonly evidenceScenarioId: string | null;
  readonly evidenceRowText: string;
  readonly executionTitle: string | null;
  readonly executionSourceStatus: string;
  readonly executionHeroText: string;
  readonly reconciliationRows: number;
  readonly reconciliationHeaders: string;
  readonly traderTransactions: number;
  readonly keeperTransactions: number;
  readonly transactionEvidenceLinks: number;
  readonly testCaseOverviewHref: string | null;
  readonly testCaseOverviewText: string;
  readonly graceFilteredRows: number;
  readonly graceFilteredText: string;
  readonly feeFilteredRows: number;
  readonly allFilteredRows: number;
  readonly testCaseRows: number;
  readonly scnCatalogCount: number;
  readonly scnCatalogAllScn: boolean;
  readonly scnVersionSourcesText: string;
  readonly versionSectionExists: boolean;
  readonly admissionBannerExists: boolean;
  readonly admissionBannerText: string;
  readonly versionDefaultBlockCount: number;
  readonly versionDefaultRelease: string | null;
  readonly versionPayloadDefaultRelease: string;
  readonly versionTxForkContractReady: boolean;
  readonly versionParseIssueCount: number;
  readonly versionCoreRows: number;
  readonly versionCoreAddressMissing: number;
  readonly versionOtherRows: number;
  readonly versionOtherIncomplete: number;
  readonly versionSwitchRelease: string | null;
  readonly versionSwitchBlockText: string;
  readonly versionSectionText: string;
  readonly versionPayloadCoreCount: number;
  readonly versionPayloadOtherCount: number;
  readonly vcFilterBarExists: boolean;
  readonly vcRowsTotal: number;
  readonly vcNotRunExpected: number;
  readonly vcNotRunFiltered: number;
  readonly vcDrawerCount: number;
  readonly vcRecordButtons: number;
  readonly vcRecordDisabled: number;
  readonly vcStartBatchDisabled: boolean;
  readonly vcManualHint: string;
  readonly vcDrawerOpens: boolean;
  readonly vcCrossLockedForRpc: boolean;
  readonly vcPassOptionGuarded: boolean;
  readonly vcDateAuto: boolean;
  readonly testCaseEditorEnabled: boolean;
  readonly selectedTestCaseId: string;
  readonly selectedPlannedProject: string;
  readonly projectFilterOptions: number;
  readonly projectFilteredRows: number;
  readonly scn010Environment: string;
  readonly scn005Environment: string;
  readonly selectedMarketCompatibility: string;
  readonly compatibilityFilteredRows: number;
  readonly selectedForRunCount: string;
  readonly runSelectionEnabled: boolean;
  readonly runsTitle: string | null;
  readonly runPreviewRows: number;
  readonly runRunnableSummary: string;
  readonly runCreateEnabled: boolean;
  readonly runInitializeEnabled: boolean;
  readonly runRpcInputType: string | null;
  readonly runRpcValueVisible: boolean;
  readonly runEnvironmentOptions: number;
  readonly runEnvironmentCard: string;
  readonly runMarketDefaultText: string;
  readonly runStandardBlocked: boolean;
  readonly runStandardWarning: string;
  readonly parameterRows: number;
  readonly marketFilteredParameterRows: number;
  readonly globalParameterRows: number;
  readonly marketScopeSummary: string;
  readonly foreignMarketRows: number;
  readonly filteredParameterRows: number;
  readonly formulaSections: number;
  readonly formulaHasFunding: boolean;
  readonly pageFormulaSections: number;
  readonly pageFormulaHasOrderPanel: boolean;
  readonly pageFormulaHasPositionSizes: boolean;
  readonly consoleTitle: string | null;
  readonly consoleNavHref: string | null;
  readonly consoleCoverageTotal: string;
  readonly consoleCoverageContract: string;
  readonly consoleCoverageFrontend: string;
  readonly consoleCoveragePairing: string;
  readonly consoleFieldRows: number;
  readonly consoleImplementedRows: number;
  readonly consoleFilteredRows: number;
  readonly environmentsTitle: string | null;
  readonly envTabCount: number;
  readonly envTabSelected: string | null;
  readonly envSelectValue: string;
  readonly envTabBadgeText: string;
  readonly envMobileTabCount: number;
  readonly wizardSectionTitle: string;
  readonly wizardStepRows: number;
  readonly wizardRunDisabled: boolean;
  readonly wizardStatusText: string;
  readonly deploySectionTitle: string;
  readonly deployBranchDisabled: boolean;
  readonly deployDryRunDisabled: boolean;
  readonly deployRunDisabled: boolean;
  readonly deployStatusText: string;
  readonly environmentsMobileBodyWidth: number;
  readonly testCasesMobileBodyWidth: number;
  readonly mobileBodyWidth: number;
  readonly executionMobileBodyWidth: number;
  readonly runsMobileBodyWidth: number;
  readonly consoleMobileBodyWidth: number;
}

async function verifyDashboard(page: Page, url: string) {
  await page.goto(url);
  await page.waitForSelector('[data-dashboard-ready="true"]');
  const title = await page.locator('h1').textContent();
  const dashboardNavLabel = (await page.locator('.top-nav a[href="./dashboard.html"]').textContent()) ?? '';
  const testRunNavHref = await page.locator('.top-nav a[href="./runs.html"]').getAttribute('href');
  const metricCards = await page.locator('.metric').count();
  const detailRowsBefore = await page.locator('#detail-table tr').count();
  const suiteLabel = await page.locator('#filter-suite option[value="S01"]').textContent();
  const detailHeaders = (await page.locator('#detail-table').locator('xpath=../thead').textContent()) ?? '';
  const executionLinks = await page.locator('#detail-table .execution-links a').count();
  const evidenceScenarioId = await page.locator('#run-data').evaluate((node) => {
    const parsed = JSON.parse(node.textContent ?? '{}') as {
      results?: Array<{ id?: string; executionEvidence?: unknown }>;
    };
    return parsed.results?.find((item) => item.executionEvidence)?.id ?? null;
  });
  const scenarioExecutionLink = evidenceScenarioId
    ? page.locator(`#detail-table a[href*="scenario=${evidenceScenarioId}"]`).first()
    : page.locator('#detail-table a[href*="scenario="]').first();
  const scenarioExecutionHref = await scenarioExecutionLink.count() > 0
    ? await scenarioExecutionLink.getAttribute('href')
    : null;
  // 同一场景可能在多个 project（如 oracle-fork/tx-fork）各有一行，取第一行即可，避免 strict mode violation。
  const evidenceRow = evidenceScenarioId
    ? page.locator(`#detail-table tr[data-scenario-id="${evidenceScenarioId}"]`).first()
    : page.locator('#detail-table tr').first();
  const evidenceRowText = await evidenceRow.count() > 0 ? (await evidenceRow.textContent()) ?? '' : '';
  await page.locator('#filter-status').selectOption('PASS');
  const detailRowsAfter = await page.locator('#detail-table tr').count();
  return {
    title,
    dashboardNavLabel,
    testRunNavHref,
    metricCards,
    detailRowsBefore,
    suiteLabel,
    detailHeaders,
    executionLinks,
    evidenceScenarioId,
    scenarioExecutionHref,
    evidenceRowText,
    detailRowsAfter,
  };
}

// Faucet 运维页（从主看板拆出）：余额监控 + 低余额告警与自动补款 + Fund USDC。
async function verifyFaucet(page: Page, url: string) {
  await page.goto(url);
  await page.waitForSelector('#faucet-page[data-page-ready="true"]');
  const faucetTitle = await page.locator('h1').textContent();
  const fundingPanelExists = await page.locator('.funding-panel #fund-usdc').count() === 1;
  const fundingButtonEnabled = fundingPanelExists && await page.locator('#fund-usdc').isEnabled();
  const fundingDefaultEnvironment = fundingPanelExists
    ? await page.locator('#fund-environment').inputValue()
    : '';
  const faucetMonitorExists = await page.locator('.faucet-panel #refresh-faucet-balance').count() === 1;
  const faucetMonitorAccount = faucetMonitorExists
    ? (await page.locator('#faucet-monitor-account').textContent()) ?? ''
    : '';
  const faucetMonitorToken = faucetMonitorExists
    ? (await page.locator('#faucet-monitor-token').textContent()) ?? ''
    : '';
  const faucetAutoFundingControlsExist = await page.locator('#start-faucet-service').count() === 1
    && await page.locator('#stop-faucet-service').count() === 1;
  const faucetAutoFundingThresholdType = await page.locator('#faucet-threshold').getAttribute('type');
  const faucetAutoFundingTargetType = await page.locator('#faucet-target-balance').getAttribute('type');
  return {
    faucetTitle,
    fundingPanelExists,
    fundingButtonEnabled,
    fundingDefaultEnvironment,
    faucetMonitorExists,
    faucetMonitorAccount,
    faucetMonitorToken,
    faucetAutoFundingControlsExist,
    faucetAutoFundingThresholdType,
    faucetAutoFundingTargetType,
  };
}

async function verifyParameters(page: Page, url: string) {
  await page.goto(url);
  await page.waitForSelector('#parameters-page[data-page-ready="true"]');
  const title = await page.locator('h1').textContent();
  const parameterRows = Number(await page.locator('#row-count').textContent());
  // Market 选项来自 config-dump 快照的 markets；来源退化成设计文档 CSV 时下拉只剩「全部/仅全局」，
  // 直接 selectOption 只会得到 30s 超时——先断言选项存在，把原因说清楚。
  const marketOptionValues = await page.locator('#market-index option')
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  if (!marketOptionValues.includes('1')) {
    throw new Error(
      `参数页 Market 范围下拉缺少 market#1 选项（现有：${marketOptionValues.map((value) => value || '(全部)').join(', ')}）。`
      + '系统参数来源没有 config-dump 快照：刷新当前环境参数，并检查绑定 manifest 的 source.parametersFile。',
    );
  }
  await page.locator('#market-index').selectOption('1');
  const marketFilteredParameterRows = Number(await page.locator('#row-count').textContent());
  const marketScopeSummary = (await page.locator('#scope-summary').textContent()) ?? '';
  const foreignMarketRows = await page.locator('#parameter-rows tr').evaluateAll((rows) => rows.filter((row) => {
    const scope = row.querySelectorAll('td')[5]?.textContent ?? '';
    return scope.includes('marketIndex=') && !scope.includes('marketIndex=market#1 · BTC/USDC');
  }).length);
  await page.locator('#market-index').selectOption('global');
  const globalParameterRows = Number(await page.locator('#row-count').textContent());
  await page.locator('#market-index').selectOption('');
  await page.locator('#search').fill('funding');
  const filteredParameterRows = Number(await page.locator('#row-count').textContent());
  return { title, parameterRows, marketFilteredParameterRows, globalParameterRows, marketScopeSummary, foreignMarketRows, filteredParameterRows };
}

async function verifyExecutions(page: Page, url: string) {
  await page.goto(url);
  await page.waitForSelector('#executions-page[data-page-ready="true"]');
  const executionTitle = await page.locator('h1').textContent();
  const executionSourceStatus = await page.locator('#execution-data').evaluate((node) =>
    String(JSON.parse(node.textContent ?? '{}').sourceStatus ?? ''),
  );
  const executionHero = page.locator('#execution-content .hero');
  const executionHeroText = await executionHero.count() > 0
    ? (await executionHero.textContent()) ?? ''
    : '';
  const allTransactionsTab = page.locator('.tx-step-tab[data-tx-step="ALL"]');
  if (await allTransactionsTab.count() > 0) await allTransactionsTab.click();
  const reconciliationRows = await page.locator('#reconciliation-table tbody tr').count();
  const reconciliationHeader = page.locator('#reconciliation-table thead');
  const reconciliationHeaders = await reconciliationHeader.count() > 0
    ? (await reconciliationHeader.textContent()) ?? ''
    : '';
  const traderTransactions = await page.locator('.tx-record .actor-TRADER').count();
  const keeperTransactions = await page.locator('.tx-record .actor-KEEPER').count();
  const transactionEvidenceLinks = await page.locator('.tx-record .api-link').count();
  const testCaseOverviewLink = page.locator('.case-overview .case-link');
  const hasCaseOverview = await testCaseOverviewLink.count() > 0;
  const testCaseOverviewHref = hasCaseOverview ? await testCaseOverviewLink.getAttribute('href') : null;
  const testCaseOverviewText = hasCaseOverview
    ? (await page.locator('.case-overview').textContent()) ?? ''
    : '';
  let graceFilteredRows = 0;
  let graceFilteredText = '';
  let feeFilteredRows = 0;
  let allFilteredRows = 0;
  if (reconciliationRows > 0) {
    const graceFilter = page.locator('.check-filter[data-filter-type="category"][data-filter-value="Grace"]');
    await graceFilter.click();
    const graceRows = page.locator('#reconciliation-table tbody tr:not([hidden])');
    graceFilteredRows = await graceRows.count();
    graceFilteredText = (await graceRows.allTextContents()).join(' ');
    const feeFilter = page.locator('.check-filter[data-filter-type="category"][data-filter-value="Fee"]');
    await feeFilter.click();
    feeFilteredRows = await page.locator('#reconciliation-table tbody tr:not([hidden])').count();
    // 「交易阶段 / 明细分组」筛选排已移除（2026-08-13 用户要求）：不再校验 group 型按钮。
    const allFilter = page.locator('.check-filter[data-filter-type="all"]');
    await allFilter.click();
    allFilteredRows = await page.locator('#reconciliation-table tbody tr:not([hidden])').count();
  }
  return {
    executionTitle,
    executionSourceStatus,
    executionHeroText,
    reconciliationRows,
    reconciliationHeaders,
    traderTransactions,
    keeperTransactions,
    transactionEvidenceLinks,
    testCaseOverviewHref,
    testCaseOverviewText,
    graceFilteredRows,
    graceFilteredText,
    feeFilteredRows,
    allFilteredRows,
  };
}

async function verifyTestCases(page: Page, url: string) {
  const directUrl = new URL(url);
  directUrl.searchParams.set('scenario', 'SCN-009');
  await page.goto(directUrl.href);
  await page.waitForSelector('#test-cases-page[data-page-ready="true"]');
  const title = await page.locator('h1').textContent();
  const testCaseRows = await page.locator('#case-rows tr').count();

  // —— 共享 SCN 分区不变性：行数与目录一致、只含 SCN 编号；仅新增一行版本来源链接。 ——
  const scnCatalog = await page.locator('#test-case-data').evaluate((node) => {
    const parsed = JSON.parse(node.textContent ?? '{}') as { cases?: Array<{ id?: string }> };
    const ids = (parsed.cases ?? []).map((item) => String(item.id ?? ''));
    return { count: ids.length, allScn: ids.every((id) => /^SCN-\d{3}$/.test(id)) };
  });
  const scnVersionSourcesText = (await page.locator('#scn-version-sources').textContent().catch(() => '')) ?? '';

  // —— 版本功能用例（CT/XT/FT）分区：准入横幅、45/55 条、8/9 列混排零报错、无 SCN 泄漏。 ——
  const versionSectionExists = await page.locator('#version-cases').count() === 1;
  const admissionBannerExists = await page.locator('#admission-banner').count() === 1;
  const admissionBannerText = admissionBannerExists
    ? (await page.locator('#admission-banner').textContent()) ?? ''
    : '';
  const versionSummary = await page.locator('#version-case-data').evaluate((node) => {
    const parsed = JSON.parse(node.textContent ?? '{}') as {
      defaultRelease?: string;
      admission?: { txForkContractReady?: boolean };
      versions?: Array<{ release?: string; parseIssues?: string[]; coreCount?: number; otherCount?: number }>;
    };
    const defaultRelease = parsed.defaultRelease ?? '';
    const defaultView = (parsed.versions ?? []).find((view) => view.release === defaultRelease);
    return {
      defaultRelease,
      txForkContractReady: parsed.admission?.txForkContractReady === true,
      parseIssueCount: (parsed.versions ?? []).reduce((sum, view) => sum + (view.parseIssues?.length ?? 0), 0),
      releases: (parsed.versions ?? []).map((view) => String(view.release ?? '')),
      coreCount: defaultView?.coreCount ?? -1,
      otherCount: defaultView?.otherCount ?? -1,
    };
  }).catch(() => ({
    defaultRelease: '', txForkContractReady: false, parseIssueCount: -1,
    releases: [] as string[], coreCount: -1, otherCount: -1,
  }));
  const defaultBlock = page.locator('.version-case-block:not([hidden])');
  const versionDefaultBlockCount = await defaultBlock.count();
  const versionDefaultRelease = versionDefaultBlockCount === 1
    ? await defaultBlock.getAttribute('data-release')
    : null;
  const versionCoreRows = await defaultBlock.locator('tr.vc-row[data-kind="core"]').count();
  const versionCoreAddressMissing = versionCoreRows > 0
    ? await defaultBlock.locator('tr.vc-row[data-kind="core"] td.vc-trader').evaluateAll((cells) =>
      cells.filter((cell) => {
        const text = (cell.textContent ?? '').trim();
        return !text || text.includes('待分配');
      }).length)
    : -1;
  const versionOtherRows = await defaultBlock.locator('tr.vc-row[data-kind="other"]').count();
  const versionOtherIncomplete = versionOtherRows > 0
    ? await defaultBlock.locator('tr.vc-row[data-kind="other"]').evaluateAll((rows) =>
      rows.filter((row) => {
        const id = (row.querySelector('.vc-id')?.textContent ?? '').trim();
        const priority = (row.querySelector('.vc-p')?.textContent ?? '').trim();
        const caseTitle = (row.querySelector('.vc-title')?.textContent ?? '').trim();
        return !id || !/^P[0-2]$/.test(priority) || !caseTitle;
      }).length)
    : -1;
  const versionSectionText = versionSectionExists
    ? (await page.locator('#version-cases').textContent()) ?? ''
    : '';
  // 版本切换：切到另一版本（如 v0.3.1，无矩阵 → 空块 + 原因说明）后再切回默认。
  let versionSwitchRelease: string | null = null;
  let versionSwitchBlockText = '';
  const otherRelease = versionSummary.releases.find((release) => release && release !== versionSummary.defaultRelease);
  if (otherRelease && await page.locator('#version-case-release').count() === 1) {
    await page.locator('#version-case-release').selectOption(otherRelease);
    const switched = page.locator('.version-case-block:not([hidden])');
    versionSwitchRelease = await switched.count() === 1 ? await switched.getAttribute('data-release') : null;
    versionSwitchBlockText = await switched.count() === 1 ? (await switched.textContent()) ?? '' : '';
    await page.locator('#version-case-release').selectOption(versionSummary.defaultRelease);
  }

  // —— 手工测试工作台：筛选栏存在且生效、记录结果抽屉、静态模式编辑控件禁用。 ——
  const isHttpMode = /^https?:\/\//.test(url);
  const vcControlSelectors = ['#vc-filter-status', '#vc-filter-layer', '#vc-filter-priority',
    '#vc-filter-section', '#vc-filter-entry', '#vc-filter-trader', '#vc-filter-search', '#vc-filter-pending'];
  let vcFilterBarExists = true;
  for (const selector of vcControlSelectors) {
    if (await page.locator(selector).count() !== 1) vcFilterBarExists = false;
  }
  const vcRowsTotal = await defaultBlock.locator('tr.vc-row').count();
  // 期望值按行 data 属性重算：状态筛选是「任一层匹配」，NOT_RUN 计数必须与筛选后可见行数一致。
  const vcNotRunExpected = await defaultBlock.locator('tr.vc-row').evaluateAll((rows) =>
    rows.filter((row) => [row.getAttribute('data-c'), row.getAttribute('data-f'), row.getAttribute('data-x')]
      .includes('NOT_RUN')).length);
  await page.locator('#vc-filter-status').selectOption('NOT_RUN');
  const vcNotRunFiltered = await defaultBlock.locator('tr.vc-row:not([hidden])').count();
  await page.locator('#vc-filter-status').selectOption('');
  const vcDrawerCount = await page.locator('#vc-drawer').count();
  const vcRecordButtons = await defaultBlock.locator('.vc-record').count();
  const vcRecordDisabled = await defaultBlock.locator('.vc-record:disabled').count();
  const vcStartBatchDisabled = await page.locator('#vc-start-batch').isDisabled();
  const vcManualHint = (await page.locator('#vc-manual-hint').textContent()) ?? '';
  let vcDrawerOpens = !isHttpMode;
  let vcCrossLockedForRpc = !isHttpMode;
  let vcPassOptionGuarded = !isHttpMode;
  let vcDateAuto = !isHttpMode;
  if (isHttpMode) {
    // 首行（CT-BASE-001，RPC 只读入口）打开抽屉：交叉一致锁定为 —；admission 非 READY 时 PASS 选项禁用。
    await defaultBlock.locator('.vc-record').first().click();
    vcDrawerOpens = await page.locator('#vc-drawer:not([hidden])').count() === 1;
    if (vcDrawerOpens) {
      vcCrossLockedForRpc = await page.locator('#vc-f-cross').isDisabled()
        && await page.locator('#vc-f-cross').inputValue() === '—';
      const passDisabled = await page.locator('#vc-f-contract').evaluate((node) => {
        const option = Array.from((node as HTMLSelectElement).options).find((item) => item.value === 'PASS');
        return option ? option.disabled : null;
      });
      vcPassOptionGuarded = passDisabled !== null
        && (versionSummary.txForkContractReady ? !passDisabled : passDisabled);
      vcDateAuto = /^\d{4}-\d{2}-\d{2}$/.test(await page.locator('#vc-f-date').inputValue());
      await page.locator('#vc-drawer-close').click();
    }
  }

  const testCaseEditorEnabled = await page.locator('#save-case').isEnabled();
  const selectedTestCaseId = await page.locator('#case-editor input[name="id"]').inputValue();
  const selectedPlannedProject = await page.locator('#case-editor select[name="targetProject"]').inputValue();
  const selectedMarketCompatibility = await page.locator('#case-editor select[name="marketCompatibility"]').inputValue();
  const projectFilterOptions = await page.locator('#case-project option').count();
  const scn010Environment = await page.locator('#test-case-data').evaluate((node) => {
    const parsed = JSON.parse(node.textContent ?? '{}') as {
      cases?: Array<Record<string, unknown>>;
    };
    const item = parsed.cases?.find((value) => value.id === 'SCN-010');
    return item
      ? [item.targetProject, item.marketMode, item.oracleMode, item.marketCompatibility, item.mockResourceAlias].join(' / ')
      : '';
  });
  const scn005Environment = await page.locator('#test-case-data').evaluate((node) => {
    const parsed = JSON.parse(node.textContent ?? '{}') as { cases?: Array<Record<string, unknown>> };
    const item = parsed.cases?.find((value) => value.id === 'SCN-005');
    return item
      ? [item.targetProject, item.marketMode, item.oracleMode, item.marketCompatibility, item.mockResourceAlias].join(' / ')
      : '';
  });
  await page.locator('.case-check[data-id="SCN-009"]').check();
  const selectedForRunCount = (await page.locator('#run-selection-count').textContent()) ?? '';
  const runSelectionEnabled = await page.locator('#run-selected').isEnabled();
  await page.locator('#case-project').selectOption('oracle-fork');
  const projectFilteredRows = await page.locator('#case-rows tr').count();
  await page.locator('#case-project').selectOption('');
  await page.locator('#case-compatibility').selectOption('mock-and-deployed');
  const compatibilityFilteredRows = await page.locator('#case-rows tr').count();
  await page.locator('#case-compatibility').selectOption('');
  await page.locator('#case-search').fill('Funding');
  const filteredRows = await page.locator('#case-rows tr').count();
  return {
    title, testCaseRows, testCaseEditorEnabled, selectedTestCaseId, selectedPlannedProject,
    projectFilterOptions, projectFilteredRows, scn010Environment, scn005Environment,
    selectedMarketCompatibility, compatibilityFilteredRows, selectedForRunCount,
    runSelectionEnabled, filteredRows,
    scnCatalogCount: scnCatalog.count,
    scnCatalogAllScn: scnCatalog.allScn,
    scnVersionSourcesText,
    versionSectionExists,
    admissionBannerExists,
    admissionBannerText,
    versionDefaultBlockCount,
    versionDefaultRelease,
    versionPayloadDefaultRelease: versionSummary.defaultRelease,
    versionTxForkContractReady: versionSummary.txForkContractReady,
    versionParseIssueCount: versionSummary.parseIssueCount,
    versionCoreRows,
    versionCoreAddressMissing,
    versionOtherRows,
    versionOtherIncomplete,
    versionSectionText,
    versionSwitchRelease,
    versionSwitchBlockText,
    versionPayloadCoreCount: versionSummary.coreCount,
    versionPayloadOtherCount: versionSummary.otherCount,
    vcFilterBarExists,
    vcRowsTotal,
    vcNotRunExpected,
    vcNotRunFiltered,
    vcDrawerCount,
    vcRecordButtons,
    vcRecordDisabled,
    vcStartBatchDisabled,
    vcManualHint,
    vcDrawerOpens,
    vcCrossLockedForRpc,
    vcPassOptionGuarded,
    vcDateAuto,
  };
}

async function verifyRuns(page: Page, url: string) {
  const directUrl = new URL(url);
  directUrl.searchParams.set('scenarios', 'SCN-009,SCN-010');
  await page.goto(directUrl.href);
  await page.waitForSelector('#runs-page[data-page-ready="true"]');
  const runsTitle = await page.locator('h1').textContent();
  const runPreviewRows = await page.locator('#selected-case-rows tr').count();
  const runRunnableSummary = (await page.locator('#runnable-summary').textContent()) ?? '';
  const runCreateEnabled = await page.locator('#create-run').isEnabled();
  const runMarketDefaultText = (await page.locator('#market-warning').textContent()) ?? '';
  await page.locator('input[name="marketSelection"][value="deployed"]').check();
  const runStandardBlocked = await page.locator('#create-run').isDisabled();
  const runStandardWarning = (await page.locator('#market-warning').textContent()) ?? '';
  await page.locator('input[name="marketSelection"][value="default"]').check();
  const runEnvironmentOptions = await page.locator('#override-environment option').count();
  await page.locator('input[name="environmentMode"][value="override"]').check();
  await page.locator('#override-environment').selectOption('tx-fork');
  const runEnvironmentCard = (await page.locator('#environment-card').textContent()) ?? '';
  const runInitializeEnabled = await page.locator('#initialize-environment').isEnabled();
  const rpcInput = page.locator('#run-rpc');
  const runRpcInputType = await rpcInput.getAttribute('type');
  await rpcInput.fill('https://virtual.base-sepolia.example/rpc-test');
  const runRpcValueVisible = await rpcInput.inputValue() === 'https://virtual.base-sepolia.example/rpc-test';
  return {
    runsTitle, runPreviewRows, runRunnableSummary, runCreateEnabled,
    runInitializeEnabled, runRpcInputType, runRpcValueVisible,
    runEnvironmentOptions, runEnvironmentCard, runMarketDefaultText,
    runStandardBlocked, runStandardWarning,
  };
}

async function verifyFormulas(page: Page, url: string, readyId: string) {
  await page.goto(url);
  await page.waitForSelector(`#${readyId}[data-page-ready="true"]`);
  const title = await page.locator('h1').first().textContent();
  const formulaSections = await page.locator('.markdown-body h2').count();
  const formulaText = (await page.locator('.markdown-body').textContent()) ?? '';
  return {
    title,
    formulaSections,
    formulaHasFunding: formulaText.includes('Funding'),
    formulaHasOrderPanel: formulaText.includes('下单面板'),
    formulaHasPositionSizes: formulaText.includes('sizeInUsd')
      && formulaText.includes('sizeInTokens')
      && formulaText.includes('完整计算链'),
  };
}

// 测试环境页：环境标签条 5 个标签、默认选中 tx-fork（静态打开即验，无记忆时的默认值）；
// 「⓪ 一键搭建向导」四步行齐全、「② 部署合约」section 存在；
// 静态打开时向导一键按钮、分支下拉与两个部署按钮降级禁用并提示 dashboard:serve。
async function verifyEnvironments(page: Page, url: string) {
  await page.goto(url);
  await page.waitForSelector('#environment-page[data-page-ready="true"]');
  const environmentsTitle = await page.locator('h1').textContent();
  const envTabCount = await page.locator('#env-tabs .env-tab').count();
  const envTabSelected = envTabCount > 0
    ? await page.locator('#env-tabs .env-tab[aria-selected="true"]').getAttribute('data-env')
    : null;
  const envSelectValue = await page.locator('#environment').inputValue();
  const envTabBadgeText = (await page.locator('#env-tabs').textContent()) ?? '';
  const wizardSectionTitle = (await page.locator('#wizard-panel h2').textContent()) ?? '';
  const wizardStepRows = await page.locator('#wizard-panel .wizard-step').count();
  const wizardRunDisabled = await page.locator('#wizard-run').isDisabled();
  const wizardStatusText = (await page.locator('#wizard-status').textContent()) ?? '';
  const deploySectionTitle = (await page.locator('#deploy-panel h2').textContent()) ?? '';
  const deployBranchDisabled = await page.locator('#deploy-branch').isDisabled();
  const deployDryRunDisabled = await page.locator('#deploy-dry-run').isDisabled();
  const deployRunDisabled = await page.locator('#deploy-run').isDisabled();
  const deployStatusText = (await page.locator('#deploy-status').textContent()) ?? '';
  return {
    environmentsTitle,
    envTabCount,
    envTabSelected,
    envSelectValue,
    envTabBadgeText,
    wizardSectionTitle,
    wizardStepRows,
    wizardRunDisabled,
    wizardStatusText,
    deploySectionTitle,
    deployBranchDisabled,
    deployDryRunDisabled,
    deployRunDisabled,
    deployStatusText,
  };
}

// 核对数据控制台：字段台账页面存在、覆盖率数字可读、状态筛选生效。
async function verifyReconciliationConsole(page: Page, url: string) {
  await page.goto(url);
  await page.waitForSelector('#reconciliation-console-page[data-page-ready="true"]');
  const consoleTitle = await page.locator('h1').textContent();
  const consoleNavHref = await page
    .locator('.top-nav a[href="./reconciliation-console.html"]')
    .getAttribute('href');
  const consoleCoverageTotal = (await page.locator('#coverage-total').textContent()) ?? '';
  const consoleCoverageContract = (await page.locator('#coverage-contract').textContent()) ?? '';
  const consoleCoverageFrontend = (await page.locator('#coverage-frontend').textContent()) ?? '';
  const consoleCoveragePairing = (await page.locator('#coverage-pairing').textContent()) ?? '';
  const consoleFieldRows = await page.locator('.field-row').count();
  await page.locator('#filter-status').selectOption('implemented');
  const consoleImplementedRows = await page.locator('.field-row').count();
  await page.locator('#filter-status').selectOption('');
  await page.locator('#filter-search').fill('Funding');
  const consoleFilteredRows = await page.locator('.field-row').count();
  return {
    consoleTitle,
    consoleNavHref,
    consoleCoverageTotal,
    consoleCoverageContract,
    consoleCoverageFrontend,
    consoleCoveragePairing,
    consoleFieldRows,
    consoleImplementedRows,
    consoleFilteredRows,
  };
}

const input = process.argv[2];
if (!input) {
  console.error('Usage: npm run dashboard:verify -- <dashboard.html|http://localhost:4173/>');
  process.exitCode = 1;
} else {
  const isHttp = /^https?:\/\//.test(input);
  const dashboardPath = isHttp ? undefined : resolve(process.cwd(), input);
  if (dashboardPath) {
    await Promise.all([
      access(dashboardPath),
      access(join(dirname(dashboardPath), 'parameters.html')),
      access(join(dirname(dashboardPath), 'executions.html')),
      access(join(dirname(dashboardPath), 'formulas.html')),
      access(join(dirname(dashboardPath), 'page-formulas.html')),
      access(join(dirname(dashboardPath), 'test-cases.html')),
      access(join(dirname(dashboardPath), 'runs.html')),
      access(join(dirname(dashboardPath), 'faucet.html')),
      access(join(dirname(dashboardPath), 'environments.html')),
      access(join(dirname(dashboardPath), 'reconciliation-console.html')),
    ]);
  }

  const dashboardUrl = isHttp ? input : pathToFileURL(dashboardPath!).href;
  const parametersUrl = isHttp
    ? new URL('./parameters.html', dashboardUrl).href
    : pathToFileURL(join(dirname(dashboardPath!), 'parameters.html')).href;
  const executionsUrl = isHttp
    ? new URL('./executions.html', dashboardUrl).href
    : pathToFileURL(join(dirname(dashboardPath!), 'executions.html')).href;
  const formulasUrl = isHttp
    ? new URL('./formulas.html', dashboardUrl).href
    : pathToFileURL(join(dirname(dashboardPath!), 'formulas.html')).href;
  const pageFormulasUrl = isHttp
    ? new URL('./page-formulas.html', dashboardUrl).href
    : pathToFileURL(join(dirname(dashboardPath!), 'page-formulas.html')).href;
  const testCasesUrl = isHttp
    ? new URL('./test-cases.html', dashboardUrl).href
    : pathToFileURL(join(dirname(dashboardPath!), 'test-cases.html')).href;
  const runsUrl = isHttp
    ? new URL('./runs.html', dashboardUrl).href
    : pathToFileURL(join(dirname(dashboardPath!), 'runs.html')).href;
  const faucetUrl = isHttp
    ? new URL('./faucet.html', dashboardUrl).href
    : pathToFileURL(join(dirname(dashboardPath!), 'faucet.html')).href;
  const environmentsUrl = isHttp
    ? new URL('./environments.html', dashboardUrl).href
    : pathToFileURL(join(dirname(dashboardPath!), 'environments.html')).href;
  const reconciliationConsoleUrl = isHttp
    ? new URL('./reconciliation-console.html', dashboardUrl).href
    : pathToFileURL(join(dirname(dashboardPath!), 'reconciliation-console.html')).href;
  const allowedOrigin = new URL(dashboardUrl).origin;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  const externalRequests: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== allowedOrigin) {
      externalRequests.push(request.url());
    }
  });

  const dashboard = await verifyDashboard(page, dashboardUrl);
  const faucet = await verifyFaucet(page, faucetUrl);
  const executions = await verifyExecutions(page, executionsUrl);
  const testCases = await verifyTestCases(page, testCasesUrl);
  const runs = await verifyRuns(page, runsUrl);
  const parameters = await verifyParameters(page, parametersUrl);
  const formulas = await verifyFormulas(page, formulasUrl, 'contract-formulas-page');
  const pageFormulas = await verifyFormulas(page, pageFormulasUrl, 'page-formulas-page');
  const environmentsPage = await verifyEnvironments(page, environmentsUrl);
  const reconciliationConsole = await verifyReconciliationConsole(page, reconciliationConsoleUrl);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(environmentsUrl);
  await page.waitForSelector('#environment-page[data-page-ready="true"]');
  const environmentsMobileBodyWidth = await page.evaluate(() => document.body.scrollWidth);
  const envMobileTabCount = await page.locator('#env-tabs .env-tab').count();
  await page.goto(reconciliationConsoleUrl);
  await page.waitForSelector('#reconciliation-console-page[data-page-ready="true"]');
  const consoleMobileBodyWidth = await page.evaluate(() => document.body.scrollWidth);
  await page.goto(testCasesUrl);
  await page.waitForSelector('#test-cases-page[data-page-ready="true"]');
  const testCasesMobileBodyWidth = await page.evaluate(() => document.body.scrollWidth);
  await page.goto(executionsUrl);
  await page.waitForSelector('#executions-page[data-page-ready="true"]');
  const executionMobileBodyWidth = await page.evaluate(() => document.body.scrollWidth);
  await page.goto(runsUrl);
  await page.waitForSelector('#runs-page[data-page-ready="true"]');
  const runsMobileBodyWidth = await page.evaluate(() => document.body.scrollWidth);
  await page.goto(dashboardUrl);
  await page.waitForSelector('[data-dashboard-ready="true"]');
  const mobileBodyWidth = await page.evaluate(() => document.body.scrollWidth);
  await browser.close();

  const result: VerificationResult = {
    ...dashboard,
    ...faucet,
    ...executions,
    testCaseRows: testCases.testCaseRows,
    scnCatalogCount: testCases.scnCatalogCount,
    scnCatalogAllScn: testCases.scnCatalogAllScn,
    scnVersionSourcesText: testCases.scnVersionSourcesText,
    versionSectionExists: testCases.versionSectionExists,
    admissionBannerExists: testCases.admissionBannerExists,
    admissionBannerText: testCases.admissionBannerText,
    versionDefaultBlockCount: testCases.versionDefaultBlockCount,
    versionDefaultRelease: testCases.versionDefaultRelease,
    versionPayloadDefaultRelease: testCases.versionPayloadDefaultRelease,
    versionTxForkContractReady: testCases.versionTxForkContractReady,
    versionParseIssueCount: testCases.versionParseIssueCount,
    versionCoreRows: testCases.versionCoreRows,
    versionCoreAddressMissing: testCases.versionCoreAddressMissing,
    versionOtherRows: testCases.versionOtherRows,
    versionOtherIncomplete: testCases.versionOtherIncomplete,
    versionSwitchRelease: testCases.versionSwitchRelease,
    versionSwitchBlockText: testCases.versionSwitchBlockText,
    versionSectionText: testCases.versionSectionText,
    versionPayloadCoreCount: testCases.versionPayloadCoreCount,
    versionPayloadOtherCount: testCases.versionPayloadOtherCount,
    vcFilterBarExists: testCases.vcFilterBarExists,
    vcRowsTotal: testCases.vcRowsTotal,
    vcNotRunExpected: testCases.vcNotRunExpected,
    vcNotRunFiltered: testCases.vcNotRunFiltered,
    vcDrawerCount: testCases.vcDrawerCount,
    vcRecordButtons: testCases.vcRecordButtons,
    vcRecordDisabled: testCases.vcRecordDisabled,
    vcStartBatchDisabled: testCases.vcStartBatchDisabled,
    vcManualHint: testCases.vcManualHint,
    vcDrawerOpens: testCases.vcDrawerOpens,
    vcCrossLockedForRpc: testCases.vcCrossLockedForRpc,
    vcPassOptionGuarded: testCases.vcPassOptionGuarded,
    vcDateAuto: testCases.vcDateAuto,
    testCaseEditorEnabled: testCases.testCaseEditorEnabled,
    selectedTestCaseId: testCases.selectedTestCaseId,
    selectedPlannedProject: testCases.selectedPlannedProject,
    projectFilterOptions: testCases.projectFilterOptions,
    projectFilteredRows: testCases.projectFilteredRows,
    scn010Environment: testCases.scn010Environment,
    scn005Environment: testCases.scn005Environment,
    selectedMarketCompatibility: testCases.selectedMarketCompatibility,
    compatibilityFilteredRows: testCases.compatibilityFilteredRows,
    selectedForRunCount: testCases.selectedForRunCount,
    runSelectionEnabled: testCases.runSelectionEnabled,
    runsTitle: runs.runsTitle,
    runPreviewRows: runs.runPreviewRows,
    runRunnableSummary: runs.runRunnableSummary,
    runCreateEnabled: runs.runCreateEnabled,
    runInitializeEnabled: runs.runInitializeEnabled,
    runRpcInputType: runs.runRpcInputType,
    runRpcValueVisible: runs.runRpcValueVisible,
    runEnvironmentOptions: runs.runEnvironmentOptions,
    runEnvironmentCard: runs.runEnvironmentCard,
    runMarketDefaultText: runs.runMarketDefaultText,
    runStandardBlocked: runs.runStandardBlocked,
    runStandardWarning: runs.runStandardWarning,
    parameterRows: parameters.parameterRows,
    marketFilteredParameterRows: parameters.marketFilteredParameterRows,
    globalParameterRows: parameters.globalParameterRows,
    marketScopeSummary: parameters.marketScopeSummary,
    foreignMarketRows: parameters.foreignMarketRows,
    filteredParameterRows: parameters.filteredParameterRows,
    formulaSections: formulas.formulaSections,
    formulaHasFunding: formulas.formulaHasFunding,
    pageFormulaSections: pageFormulas.formulaSections,
    pageFormulaHasOrderPanel: pageFormulas.formulaHasOrderPanel,
    pageFormulaHasPositionSizes: pageFormulas.formulaHasPositionSizes,
    ...reconciliationConsole,
    ...environmentsPage,
    envMobileTabCount,
    environmentsMobileBodyWidth,
    testCasesMobileBodyWidth,
    mobileBodyWidth,
    executionMobileBodyWidth,
    runsMobileBodyWidth,
    consoleMobileBodyWidth,
  };
  const expectedHeaders = ['核对结果', '执行链接', '执行时间'];
  const expectedReconciliationHeaders = ['Before（链上）', 'After（链上 Actual）', 'Expected Δ（订单 / 公式）', 'Expected After = Before + Δ', '公式与依据'];
  const requiresExecutionEvidence = result.executionSourceStatus === 'ready';
  const failed = dashboard.title !== 'FX100 E2E 测试看板'
    || dashboard.dashboardNavLabel !== '测试看板'
    || dashboard.testRunNavHref !== './runs.html'
    || faucet.faucetTitle !== 'FX100 Faucet USDC'
    || !faucet.fundingPanelExists
    || !faucet.faucetMonitorExists
    || faucet.faucetMonitorAccount !== '0x6E2Df1a8d0366ac1e55fF1dC23523299613902e5'
    || faucet.faucetMonitorToken !== '0xbf4D9B318689AB928DB9eE4Cdc840c065575Eb89'
    || !faucet.faucetAutoFundingControlsExist
    || faucet.faucetAutoFundingThresholdType !== 'text'
    || faucet.faucetAutoFundingTargetType !== 'text'
    || (isHttp && !faucet.fundingButtonEnabled)
    || (isHttp && faucet.fundingDefaultEnvironment !== 'base-sepolia')
    || (!isHttp && faucet.fundingButtonEnabled)
    || result.executionTitle !== 'FX100 执行详情'
    || testCases.title !== 'FX100 测试用例库'
    || result.runsTitle !== 'FX100 测试运行'
    || parameters.title !== 'FX100 合约系统参数'
    || formulas.title !== 'FX100 合约核心公式'
    || pageFormulas.title !== 'FX100 页面数据计算公式'
    || result.metricCards < 7
    || result.detailRowsBefore < 1
    || result.detailRowsAfter < 1
    || !result.suiteLabel?.includes('交易准备与首单')
    || !expectedHeaders.every((header) => result.detailHeaders.includes(header))
    || result.executionLinks < 1
    || (requiresExecutionEvidence && (!result.evidenceScenarioId
      || !result.scenarioExecutionHref?.includes(`scenario=${result.evidenceScenarioId}`)))
    // 断言 forkDisplayName 已归一化展示（项目名而非技术 Fork ID）；不锁定环境——最新证据可能来自任一 fork。
    || (requiresExecutionEvidence && !result.evidenceRowText.includes(' / aladdindao/test'))
    || (requiresExecutionEvidence && result.evidenceRowText.includes('9f3df3-7d0923'))
    || (requiresExecutionEvidence && result.reconciliationRows < 1)
    || (requiresExecutionEvidence && !expectedReconciliationHeaders.every((header) => result.reconciliationHeaders.includes(header)))
    || (requiresExecutionEvidence && result.traderTransactions < 2)
    || (requiresExecutionEvidence && result.keeperTransactions < 2)
    || (requiresExecutionEvidence && result.transactionEvidenceLinks < 4)
    // 概述链接必须指向证据对应的场景（最新证据场景随数据变化，不硬编码具体 SCN）。
    || (requiresExecutionEvidence && !result.testCaseOverviewHref?.includes(`test-cases.html?scenario=${result.evidenceScenarioId}`))
    || (requiresExecutionEvidence && !result.testCaseOverviewText.includes('角色与意图'))
    || (requiresExecutionEvidence && result.graceFilteredRows < 1)
    || (requiresExecutionEvidence && !['Grace 公式核对', 'graceStart', 'graceEnd']
      .every((field) => result.graceFilteredText.includes(field)))
    || (requiresExecutionEvidence && (result.feeFilteredRows < 1 || result.feeFilteredRows >= result.reconciliationRows))
    || (requiresExecutionEvidence && result.allFilteredRows !== result.reconciliationRows)
    || (requiresExecutionEvidence && !result.executionHeroText.includes('执行结果 PASS'))
    || (requiresExecutionEvidence && !result.executionHeroText.includes('自动化覆盖 PARTIAL'))
    || (requiresExecutionEvidence && !result.executionHeroText.includes(' / aladdindao/test'))
    || (requiresExecutionEvidence && result.executionHeroText.includes('9f3df3-7d0923'))
    // 用例目录会持续增长；验证看板行为，不把当前目录条数误当成页面契约。
    || result.testCaseRows < 80
    // —— 共享 SCN 分区不变性：行数 = 目录数、全部为 SCN 编号；来源链接行存在（唯一新增行）。 ——
    || result.testCaseRows !== result.scnCatalogCount
    || !result.scnCatalogAllScn
    || !result.scnVersionSourcesText.includes('applicability.md')
    || !result.scnVersionSourcesText.includes('expectation-overrides.md')
    // —— 版本功能用例（CT/XT/FT）分区：存在、准入横幅、行数与解析产物一致（矩阵在持续扩充，
    //     只锁 45/55 下限 + DOM 行数必须等于 payload coreCount/otherCount）、地址非空、混排零报错、无 SCN 泄漏。 ——
    || !result.versionSectionExists
    || !result.admissionBannerExists
    || !result.admissionBannerText.includes('admission（总开关）')
    || !result.admissionBannerText.includes('tx-fork:contract')
    || result.versionDefaultBlockCount !== 1
    || !result.versionDefaultRelease
    || result.versionDefaultRelease !== result.versionPayloadDefaultRelease
    || result.versionCoreRows < 45
    || result.versionCoreRows !== result.versionPayloadCoreCount
    || result.versionCoreAddressMissing !== 0
    || result.versionOtherRows < 55
    || result.versionOtherRows !== result.versionPayloadOtherCount
    || result.versionOtherIncomplete !== 0
    || result.versionParseIssueCount !== 0
    || /SCN-\d/.test(result.versionSectionText)
    || result.versionSectionText.includes('scenarios/')
    // tx-fork:contract 非 READY 时功能用例区必须标「当前环境不可开跑」。
    || (!result.versionTxForkContractReady && !result.versionSectionText.includes('当前环境不可开跑'))
    // 版本切换：存在第二个版本时必须能切换；无矩阵版本给出空块原因（含「暂无版本级功能用例」）。
    || (result.versionSwitchRelease !== null
      && (result.versionSwitchRelease === result.versionPayloadDefaultRelease
        || result.versionSwitchBlockText.trim().length === 0))
    // —— 手工测试工作台：筛选栏存在且生效（状态=NOT_RUN 任一层计数）、抽屉存在、静态模式编辑控件禁用。 ——
    || !result.vcFilterBarExists
    || result.vcRowsTotal !== result.versionCoreRows + result.versionOtherRows
    || result.vcNotRunFiltered < 1
    || result.vcNotRunFiltered !== result.vcNotRunExpected
    || result.vcDrawerCount !== 1
    || result.vcRecordButtons !== result.vcRowsTotal
    || (!isHttp && result.vcRecordDisabled !== result.vcRecordButtons)
    || (!isHttp && !result.vcStartBatchDisabled)
    || (!isHttp && !result.vcManualHint.includes('dashboard:serve'))
    || (isHttp && result.vcRecordDisabled !== 0)
    || !result.vcDrawerOpens
    || !result.vcCrossLockedForRpc
    || !result.vcPassOptionGuarded
    || !result.vcDateAuto
    || result.selectedTestCaseId !== 'SCN-009'
    || result.selectedPlannedProject !== 'tx-fork'
    || result.projectFilterOptions !== 6
    || result.projectFilteredRows < 1
    || result.projectFilteredRows >= result.testCaseRows
    || result.scn010Environment !== 'oracle-fork / mock-market / mock-oracle / mock-only / default-mock'
    // SCN-005 是手工核对用例：默认落 base-sepolia 已部署环境，不建 Fork、不用 Mock 资源。
    || result.scn005Environment !== 'base-sepolia / deployed-market / deployed-oracle / deployed-only / none'
    || result.selectedMarketCompatibility !== 'mock-only'
    // mock-only 用例数量会随着覆盖扩展变化，只需验证筛选确实缩小了集合。
    || result.compatibilityFilteredRows < 1
    || result.compatibilityFilteredRows >= result.testCaseRows
    || result.selectedForRunCount !== '已选择 1 条'
    || !result.runSelectionEnabled
    || result.runPreviewRows !== 2
    || !result.runRunnableSummary.includes('2 条可自动执行 / 2 条已选')
    || result.runEnvironmentOptions !== 5
    || !result.runEnvironmentCard.includes('tx-fork')
    || !result.runEnvironmentCard.includes('default-mock')
    || !result.runMarketDefaultText.includes('兼容')
    || !result.runStandardBlocked
    || !result.runStandardWarning.includes('SCN-009')
    || !result.runStandardWarning.includes('SCN-010')
    || result.runRpcInputType !== 'url'
    || !result.runRpcValueVisible
    || (isHttp && !result.runCreateEnabled)
    || (!isHttp && result.runCreateEnabled)
    || (isHttp && !result.runInitializeEnabled)
    || (!isHttp && result.runInitializeEnabled)
    || testCases.filteredRows < 1
    || testCases.filteredRows >= result.testCaseRows
    || (isHttp && !result.testCaseEditorEnabled)
    || (!isHttp && result.testCaseEditorEnabled)
    || result.parameterRows < 200
    || result.globalParameterRows < 1
    || result.globalParameterRows >= result.marketFilteredParameterRows
    || result.marketFilteredParameterRows >= result.parameterRows
    || !result.marketScopeSummary.includes('market#1 · BTC/USDC')
    || !result.marketScopeSummary.includes('全局参数')
    || result.foreignMarketRows !== 0
    || result.filteredParameterRows < 1
    || result.filteredParameterRows >= result.parameterRows
    || result.formulaSections < 15
    || !result.formulaHasFunding
    || result.pageFormulaSections < 9
    || !result.pageFormulaHasOrderPanel
    || !result.pageFormulaHasPositionSizes
    || result.consoleTitle !== 'FX100 核对数据控制台'
    || result.consoleNavHref !== './reconciliation-console.html'
    // 覆盖率必须是「已生效 / 总数」的数字对；台账种子后总数应至少有几十行。
    || !/^\d+ \/ \d+$/.test(result.consoleCoverageTotal)
    || !/^\d+ \/ \d+$/.test(result.consoleCoverageContract)
    || !/^\d+ \/ \d+$/.test(result.consoleCoverageFrontend)
    || !/^\d+ \/ \d+$/.test(result.consoleCoveragePairing)
    || result.consoleFieldRows < 10
    || result.consoleImplementedRows < 1
    || result.consoleImplementedRows >= result.consoleFieldRows
    || result.consoleFilteredRows < 1
    || result.consoleFilteredRows >= result.consoleFieldRows
    || result.environmentsTitle !== '测试环境'
    // 环境标签条：5 个环境标签齐全、无记忆时默认选中 tx-fork（隐藏 select 同步）；390 宽标签条仍完整（配合上/下方 body 宽度断言）。
    || result.envTabCount !== 5
    || result.envTabSelected !== 'tx-fork'
    || result.envSelectValue !== 'tx-fork'
    // 徽章至少要有三条 Fork 的固定 Chain ID（静态模式来自内嵌常量，serve 模式来自 profiles）。
    || !['Chain 99911', 'Chain 99912', 'Chain 99913'].every((badge) => result.envTabBadgeText.includes(badge))
    || result.envMobileTabCount !== 5
    // ⓪ 一键搭建向导：面板存在、四步行齐全；静态打开时一键按钮禁用并提示 dashboard:serve。
    || !result.wizardSectionTitle.includes('⓪ 一键搭建向导')
    || result.wizardStepRows !== 6
    || (!isHttp && !result.wizardRunDisabled)
    || (!isHttp && !result.wizardStatusText.includes('dashboard:serve'))
    || !result.deploySectionTitle.includes('② 部署合约')
    // 静态打开时部署入口必须降级：下拉与两按钮禁用，并提示需 dashboard:serve。
    || (!isHttp && !(result.deployBranchDisabled && result.deployDryRunDisabled && result.deployRunDisabled))
    || (!isHttp && !result.deployStatusText.includes('dashboard:serve'))
    || result.environmentsMobileBodyWidth > 410
    || result.testCasesMobileBodyWidth > 410
    || errors.length > 0
    || externalRequests.length > 0
    || mobileBodyWidth > 410
    || executionMobileBodyWidth > 410
    || runsMobileBodyWidth > 410
    || consoleMobileBodyWidth > 410;

  if (failed) {
    console.error({ status: 'FAILED', ...result, errors, externalRequests });
    process.exitCode = 1;
  } else {
    console.log({
      status: 'PASSED',
      ...result,
      browserErrors: 0,
      externalRequests: 0,
    });
  }
}

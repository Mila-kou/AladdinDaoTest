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
      + '系统参数来源没有 config-dump 快照：检查 E2E_SYSTEM_PARAMETERS_SOURCE 是否指向 <deployment>.params-by-module.csv。',
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

// 测试环境页：「⓪ 一键搭建向导」四步行齐全、「② 部署合约」section 存在；
// 静态打开时向导一键按钮、分支下拉与两个部署按钮降级禁用并提示 dashboard:serve。
async function verifyEnvironments(page: Page, url: string) {
  await page.goto(url);
  await page.waitForSelector('#environment-page[data-page-ready="true"]');
  const environmentsTitle = await page.locator('h1').textContent();
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
  await page.goto(reconciliationConsoleUrl);
  await page.waitForSelector('#reconciliation-console-page[data-page-ready="true"]');
  const consoleMobileBodyWidth = await page.evaluate(() => document.body.scrollWidth);
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
    environmentsMobileBodyWidth,
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
    // ⓪ 一键搭建向导：面板存在、四步行齐全；静态打开时一键按钮禁用并提示 dashboard:serve。
    || !result.wizardSectionTitle.includes('⓪ 一键搭建向导')
    || result.wizardStepRows !== 4
    || (!isHttp && !result.wizardRunDisabled)
    || (!isHttp && !result.wizardStatusText.includes('dashboard:serve'))
    || !result.deploySectionTitle.includes('② 部署合约')
    // 静态打开时部署入口必须降级：下拉与两按钮禁用，并提示需 dashboard:serve。
    || (!isHttp && !(result.deployBranchDisabled && result.deployDryRunDisabled && result.deployRunDisabled))
    || (!isHttp && !result.deployStatusText.includes('dashboard:serve'))
    || result.environmentsMobileBodyWidth > 410
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

import { access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { chromium, type Page } from '@playwright/test';

interface VerificationResult {
  readonly title: string | null;
  readonly dashboardNavLabel: string;
  readonly testRunNavHref: string | null;
  readonly deploymentsNavHref: string | null;
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
  readonly functionalExecutionRows: number;
  readonly functionalExecutionMetrics: string;
  readonly functionalFailureRows: number;
  readonly functionalExecutionLayers: string;
  readonly functionalExecutionDetail: string;
  readonly functionalEvidenceLinks: number;
  readonly functionalCheckRows: number;
  readonly functionalCheckHeaders: string;
  readonly functionalTransactionLinks: number;
  readonly functionalTransactionLinkStatus: number | null;
  readonly functionalExplorerLinks: number;
  readonly functionalExplorerHref: string | null;
  readonly functionalTradeSummary: string;
  readonly functionalBindingSummary: string;
  readonly functionalBindingHref: string | null;
  readonly functionalNestedBindings: number;
  readonly functionalStandaloneBindings: number;
  readonly functionalTestDataSections: number;
  readonly functionalActionModuleCount: number;
  readonly functionalActionHeaderCount: number;
  readonly functionalActionTradeSubmodules: number;
  readonly functionalActionReceiptSubmodules: number;
  readonly functionalFormulaRuleBlocks: number;
  readonly functionalFormulaExampleBlocks: number;
  readonly functionalFormulaBasisBlocks: number;
  readonly functionalFormulaSourceLinks: number;
  readonly functionalHeroCaseLinks: number;
  readonly functionalActionTabs: number;
  readonly functionalActionSelectionChecks: number;
  readonly functionalActionSelectionErrors: string;
  readonly functionalActionModuleOrderChecks: number;
  readonly functionalActionModuleOrderErrors: string;
  readonly functionalTxTableStructureChecks: number;
  readonly functionalTxTableStructureErrors: string;
  readonly functionalAssertionRows: number;
  readonly functionalCleanupPositionRemovedText: string;
  readonly functionalReadablePrecisionMarkers: number;
  readonly functionalPositionSizeReadableText: string;
  readonly functionalPrecisionValueChecks: number;
  readonly functionalPrecisionValueErrors: string;
  readonly functionalPrecisionValueSummary: string;
  readonly functionalDesktopTableLayoutChecks: number;
  readonly functionalDesktopTableLayoutErrors: string;
  readonly functionalDesktopTableLayoutSummary: string;
  readonly functionalMobileTableLayoutChecks: number;
  readonly functionalMobileTableLayoutErrors: string;
  readonly functionalMobileTableLayoutSummary: string;
  readonly functionalOpenActionRows: number;
  readonly functionalOpenActionTitle: string;
  readonly functionalAllActionRows: number;
  readonly functionalAllTransactionRecords: number;
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
  readonly versionDetailRows: number;
  readonly versionDetailIncomplete: number;
  readonly versionDetailOpens: boolean;
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
  readonly deploymentsTitle: string | null;
  readonly deploymentsNavCurrent: string | null;
  readonly deploymentVersionOptions: number;
  readonly deploymentEnvironmentOptions: number;
  readonly deploymentInitialCards: number;
  readonly deploymentVersionFilteredCards: number;
  readonly deploymentEnvironmentFilteredCards: number;
  readonly deploymentCoreRows: number;
  readonly deploymentMockRows: number;
  readonly deploymentMockText: string;
  readonly deploymentPageAddressText: string;
  readonly deploymentV031SelectedVersion: string;
  readonly deploymentV031SelectedEnvironment: string;
  readonly deploymentV031CoordinatedCards: number;
  readonly deploymentV031BaseSepoliaCards: number;
  readonly deploymentV031CoreRows: number;
  readonly deploymentV031CoreAddressCount: number;
  readonly deploymentV031InvalidCoreAddresses: number;
  readonly deploymentV031SnapshotRows: number;
  readonly deploymentV031DeploymentId: string;
  readonly deploymentV031ManifestName: string;
  readonly deploymentV031ChainPair: string;
  readonly environmentsMobileBodyWidth: number;
  readonly deploymentsMobileBodyWidth: number;
  readonly testCasesMobileBodyWidth: number;
  readonly mobileBodyWidth: number;
  readonly executionMobileBodyWidth: number;
  readonly runsMobileBodyWidth: number;
  readonly consoleMobileBodyWidth: number;
}

interface FunctionalTableLayoutMeasurement {
  readonly viewportWidth: number;
  readonly steps: ReadonlyArray<{
    readonly stepId: string;
    readonly buttonCount: number;
    readonly containerCount: number;
    readonly tableCount: number;
    readonly containerClientWidth: number;
    readonly containerScrollWidth: number;
    readonly overflowX: string;
    readonly bodyClientWidth: number;
    readonly bodyScrollWidth: number;
    readonly documentClientWidth: number;
    readonly documentScrollWidth: number;
  }>;
}

async function verifyDashboard(page: Page, url: string) {
  await page.goto(url);
  await page.waitForSelector('[data-dashboard-ready="true"]');
  const title = await page.locator('h1').textContent();
  const dashboardNavLabel = (await page.locator('.top-nav a[href="./dashboard.html"]').textContent()) ?? '';
  const testRunNavHref = await page.locator('.top-nav a[href="./runs.html"]').getAttribute('href');
  const deploymentsNavHref = await page.locator('.top-nav a[href="./deployments.html"]').getAttribute('href');
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
    deploymentsNavHref,
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

// 版本、环境与合约地址：独立页面、双筛选、核心合约及环境运行时 Mock 地址均可核对。
async function verifyDeployments(page: Page, url: string) {
  await page.goto(url);
  await page.waitForSelector('#deployments-page[data-page-ready="true"]');
  const deploymentsTitle = await page.locator('h1').textContent();
  const deploymentsNavCurrent = await page.locator('.top-nav a[href="./deployments.html"]').getAttribute('aria-current');
  const deploymentVersionOptions = await page.locator('#filter-version option').count();
  const deploymentEnvironmentOptions = await page.locator('#filter-environment option').count();
  const deploymentInitialCards = await page.locator('.deployment-card').count();

  const firstVersion = await page.locator('#filter-version option').nth(1).getAttribute('value');
  if (firstVersion) await page.locator('#filter-version').selectOption(firstVersion);
  const deploymentVersionFilteredCards = await page.locator('.deployment-card').count();
  await page.locator('#filter-version').selectOption('');

  const environmentOptions = await page.locator('#filter-environment option').evaluateAll((options) =>
    options.map((option) => (option as HTMLOptionElement).value));
  const selectedEnvironment = environmentOptions.includes('tx-fork') ? 'tx-fork' : environmentOptions.find(Boolean) ?? '';
  if (selectedEnvironment) await page.locator('#filter-environment').selectOption(selectedEnvironment);
  const deploymentEnvironmentFilteredCards = await page.locator('.deployment-card').count();
  const selectedCard = page.locator(`.deployment-card[data-environment="${selectedEnvironment}"]`);
  const deploymentCoreRows = await selectedCard.locator('.core-addresses tbody tr').count();
  const deploymentMockRows = await selectedCard.locator('.runtime-addresses tbody tr').count();
  const deploymentMockText = (await selectedCard.locator('.runtime-addresses').textContent().catch(() => '')) ?? '';
  const deploymentPageAddressText = [
    (await page.locator('.page-addresses').textContent()) ?? '',
    (await selectedCard.locator('.binding-meta').textContent()) ?? '',
  ].join(' ');

  // 从不兼容的 tx-fork 切换到 v0.3.1 时，页面应自动协调到该版本的 Base Sepolia 部署。
  await page.locator('#filter-environment').selectOption('tx-fork');
  await page.locator('#filter-version').selectOption('v0.3.1');
  const deploymentV031SelectedVersion = await page.locator('#filter-version').inputValue();
  const deploymentV031SelectedEnvironment = await page.locator('#filter-environment').inputValue();
  const deploymentV031CoordinatedCards = await page.locator('.deployment-card').count();
  const deploymentV031CardLocator = page.locator(
    '.deployment-card[data-version="v0.3.1"][data-environment="base-sepolia"]',
  );
  const deploymentV031BaseSepoliaCards = await deploymentV031CardLocator.count();
  const deploymentV031Card = deploymentV031CardLocator.first();
  const deploymentV031CoreRows = await deploymentV031Card.locator('.core-addresses tbody tr').count();
  const deploymentV031CoreAddresses = (await deploymentV031Card
    .locator('.core-addresses tbody tr td:nth-child(3) code')
    .allTextContents())
    .map((address) => address.trim());
  const deploymentV031CoreAddressCount = deploymentV031CoreAddresses.length;
  const deploymentV031InvalidCoreAddresses = deploymentV031CoreAddresses.filter((address) =>
    !/^0x[0-9a-fA-F]{40}$/.test(address) || /^0x0{40}$/i.test(address)).length;
  const deploymentV031SnapshotRows = await deploymentV031Card
    .locator('.deployment-snapshot-addresses tbody tr')
    .count();
  const deploymentV031Meta = new Map(await deploymentV031Card.locator('.binding-meta dt').evaluateAll((terms) =>
    terms.map((term) => [
      (term.textContent ?? '').replace(/\s+/g, ' ').trim(),
      (term.nextElementSibling?.textContent ?? '').replace(/\s+/g, ' ').trim(),
    ] as const)));
  const deploymentV031DeploymentId = deploymentV031Meta.get('Deployment') ?? '';
  const deploymentV031ManifestName = deploymentV031Meta.get('Manifest') ?? '';
  const deploymentV031ChainPair = deploymentV031Meta.get('部署链 / 运行链') ?? '';
  return {
    deploymentsTitle,
    deploymentsNavCurrent,
    deploymentVersionOptions,
    deploymentEnvironmentOptions,
    deploymentInitialCards,
    deploymentVersionFilteredCards,
    deploymentEnvironmentFilteredCards,
    deploymentCoreRows,
    deploymentMockRows,
    deploymentMockText,
    deploymentPageAddressText,
    deploymentV031SelectedVersion,
    deploymentV031SelectedEnvironment,
    deploymentV031CoordinatedCards,
    deploymentV031BaseSepoliaCards,
    deploymentV031CoreRows,
    deploymentV031CoreAddressCount,
    deploymentV031InvalidCoreAddresses,
    deploymentV031SnapshotRows,
    deploymentV031DeploymentId,
    deploymentV031ManifestName,
    deploymentV031ChainPair,
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

async function measureFunctionalTableLayout(
  page: Page,
  url: string,
  viewportWidth: number,
): Promise<FunctionalTableLayoutMeasurement> {
  await page.setViewportSize({ width: viewportWidth, height: viewportWidth <= 390 ? 844 : 1000 });
  await page.goto(url);
  await page.waitForSelector('#executions-page[data-page-ready="true"]');

  const functionalTab = page.locator('#execution-tab-functional');
  if (await functionalTab.count() > 0) await functionalTab.click();
  const transactionCaseValue = await page.locator('#functional-result-select option').evaluateAll((options) =>
    options.find((option) => (option.textContent ?? '').includes('XT-MKT-OPEN-001'))?.getAttribute('value') ?? '');
  if (transactionCaseValue) await page.locator('#functional-result-select').selectOption(transactionCaseValue);

  const steps: FunctionalTableLayoutMeasurement['steps'][number][] = [];
  for (const stepId of ['TX1', 'TX2', 'TX3', 'TX4']) {
    const button = page.locator(`.functional-tx-step-tab[data-functional-tx-step="${stepId}"]`);
    const buttonCount = await button.count();
    if (buttonCount === 1) await button.click();

    const container = page.locator('#functional-tx-step-content .functional-checks .check-scroll');
    const table = container.locator('table');
    const containerCount = await container.count();
    const tableCount = await table.count();
    const dimensions = containerCount === 1
      ? await container.evaluate((node) => {
        const element = node as HTMLElement;
        const body = document.body;
        const root = document.documentElement;
        return {
          containerClientWidth: element.clientWidth,
          containerScrollWidth: element.scrollWidth,
          overflowX: getComputedStyle(element).overflowX,
          bodyClientWidth: body.clientWidth,
          bodyScrollWidth: body.scrollWidth,
          documentClientWidth: root.clientWidth,
          documentScrollWidth: root.scrollWidth,
        };
      })
      : {
        containerClientWidth: 0,
        containerScrollWidth: 0,
        overflowX: '',
        bodyClientWidth: 0,
        bodyScrollWidth: 0,
        documentClientWidth: 0,
        documentScrollWidth: 0,
      };
    steps.push({ stepId, buttonCount, containerCount, tableCount, ...dimensions });
  }

  return { viewportWidth, steps };
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
  const testCaseOverviewLink = page.locator('#execution-panel-scenario .case-overview .case-link');
  const hasCaseOverview = await testCaseOverviewLink.count() > 0;
  const testCaseOverviewHref = hasCaseOverview ? await testCaseOverviewLink.getAttribute('href') : null;
  const testCaseOverviewText = hasCaseOverview
    ? (await page.locator('#execution-panel-scenario .case-overview').textContent()) ?? ''
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
  await page.locator('#execution-tab-functional').click();
  const functionalExecutionRows = await page.locator('#functional-result-select option').count();
  const functionalExecutionMetrics = (await page.locator('#functional-metrics').textContent()) ?? '';
  const transactionCaseValue = await page.locator('#functional-result-select option').evaluateAll((options) =>
    options.find((option) => (option.textContent ?? '').includes('XT-MKT-OPEN-001'))?.getAttribute('value') ?? '');
  if (transactionCaseValue) await page.locator('#functional-result-select').selectOption(transactionCaseValue);
  const functionalActionTabLocator = page.locator('.functional-tx-step-tab');
  const functionalActionTabs = await functionalActionTabLocator.count();
  let functionalActionSelectionChecks = 0;
  const functionalActionSelectionErrors: string[] = [];
  const verifyFunctionalActionSelection = async (expectedStep: string | null, phase: string) => {
    functionalActionSelectionChecks += 1;
    const activeTabs = page.locator('.functional-tx-step-tab.is-active');
    const activeCount = await activeTabs.count();
    const activeStep = activeCount > 0
      ? await activeTabs.first().getAttribute('data-functional-tx-step')
      : null;
    if (activeCount !== 1) {
      functionalActionSelectionErrors.push(`${phase}: active 数量为 ${activeCount}（应为 1）`);
    }
    if (!expectedStep || activeStep !== expectedStep) {
      functionalActionSelectionErrors.push(`${phase}: active=${activeStep ?? '无'}（应为 ${expectedStep ?? '有效 TX/ALL'}）`);
    }

    const checkTitleLocator = expectedStep === 'ALL'
      ? page.locator('#functional-tx-step-content > .functional-checks h2')
      : page.locator('#functional-tx-step-content .functional-action-checks h3');
    const checkTitle = ((await checkTitleLocator.textContent().catch(() => '')) ?? '').trim();
    const actionModuleCount = await page.locator('#functional-tx-step-content > .functional-action-module').count();
    if (expectedStep === 'ALL') {
      const transactionRecords = await page.locator('#functional-tx-step-content .functional-tx-record').count();
      if (checkTitle !== '全流程数据核对' || actionModuleCount !== 0 || transactionRecords !== functionalActionTabs - 1) {
        functionalActionSelectionErrors.push(
          `${phase}: 全流程内容未同步（标题=${checkTitle || '无'}，动作模块=${actionModuleCount}，交易记录=${transactionRecords}）`,
        );
      }
      return;
    }

    const actionEyebrow = ((await page.locator('#functional-tx-step-content .functional-action-title .eyebrow').textContent().catch(() => '')) ?? '').trim();
    if (!expectedStep
      || checkTitle !== '数据核对'
      || actionModuleCount !== 1
      || !actionEyebrow.startsWith(`${expectedStep} ·`)) {
      functionalActionSelectionErrors.push(
        `${phase}: TX 内容未同步（标题=${checkTitle || '无'}，动作=${actionEyebrow || '无'}，动作模块=${actionModuleCount}）`,
      );
    }
  };

  const initialActiveStep = await page.locator('.functional-tx-step-tab.is-active').first()
    .getAttribute('data-functional-tx-step')
    .catch(() => null);
  await verifyFunctionalActionSelection(initialActiveStep, '初始状态');
  const functionalActionStepIds = await functionalActionTabLocator.evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute('data-functional-tx-step')).filter((step): step is string => Boolean(step)));
  const expectedFunctionalTxSteps = ['TX1', 'TX2', 'TX3', 'TX4'];
  let functionalActionModuleOrderChecks = 0;
  const functionalActionModuleOrderErrors: string[] = [];
  const functionalTxTableStructureErrors: string[] = [];
  let functionalTxTableStructureChecks = 0;
  let functionalAssertionRows = 0;
  let functionalCleanupPositionRemovedText = '';
  let functionalReadablePrecisionMarkers = 0;
  let functionalPositionSizeReadableText = '';
  const functionalPrecisionValueErrors: string[] = [];
  const functionalPrecisionValueSummary: string[] = [];
  const functionalPrecisionValueChecks = new Set<string>();
  const functionalPrecisionExpectations = [
    { name: 'position.size-usd', raw: '50000000000000000000000000000000', readable: '= 50 USD' },
    { name: 'pricing.execution-price', raw: '2032740628092499', readable: '= 2,032.740628092499 USD / Token' },
    { name: 'market.oi-token-primary-side', raw: '24597333919044772', readable: '≈ 0.024597333919 FXMOCK' },
    { name: 'fee.position.amount', raw: '10010', readable: '= 0.01001 USDC' },
    { name: 'position.collateral', raw: '9989990', readable: '= 9.98999 USDC' },
  ];
  for (const expectedStep of expectedFunctionalTxSteps) {
    const matchingTabs = functionalActionStepIds.filter((stepId) => stepId === expectedStep).length;
    if (matchingTabs !== 1) {
      functionalActionSelectionErrors.push(`${expectedStep}: 入口数量为 ${matchingTabs}（应为 1）`);
    }
  }
  for (const stepId of functionalActionStepIds) {
    await page.locator(`.functional-tx-step-tab[data-functional-tx-step="${stepId}"]`).click();
    await verifyFunctionalActionSelection(stepId, `点击 ${stepId}`);
    if (!expectedFunctionalTxSteps.includes(stepId)) continue;

    functionalActionModuleOrderChecks += 1;
    const actionModuleStructure = await page.locator('#functional-tx-step-content').evaluate((mount) => {
      const mountChildren = Array.from(mount.children);
      const actionModules = mountChildren.filter((child) => child.classList.contains('functional-action-module'));
      const actionModuleIndex = mountChildren.findIndex((child) => child.classList.contains('functional-action-module'));
      const legacyFollowingChecks = actionModuleIndex < 0
        ? []
        : mountChildren.slice(actionModuleIndex + 1).filter((child) => child.classList.contains('functional-checks'));
      const actionModule = actionModules[0];
      const actionBodies = actionModules.length === 1 && actionModule
        ? Array.from(actionModule.children).filter((child) => child.classList.contains('functional-action-body'))
        : [];
      const actionBody = actionBodies[0];
      const bodyChildren = actionBodies.length === 1 && actionBody ? Array.from(actionBody.children) : [];
      return {
        actionModuleCount: actionModules.length,
        actionBodyCount: actionBodies.length,
        legacyFollowingCheckCount: legacyFollowingChecks.length,
        bodyChildren: bodyChildren.map((child) => ({
          classes: Array.from(child.classList),
          text: (child.textContent ?? '').replace(/\s+/g, ' ').trim(),
        })),
      };
    });
    const expectedActionSubmodules = [
      { className: 'functional-action-checks', label: '数据核对' },
      { className: 'functional-trade-summary', label: '测试数据' },
      { className: 'functional-tx-receipt', label: '链上证据' },
    ];
    const actionModuleOrderProblems: string[] = [];
    if (actionModuleStructure.actionModuleCount !== 1) {
      actionModuleOrderProblems.push(`动作模块数量=${actionModuleStructure.actionModuleCount}（应为 1）`);
    }
    if (actionModuleStructure.actionBodyCount !== 1) {
      actionModuleOrderProblems.push(`动作主体数量=${actionModuleStructure.actionBodyCount}（应为 1）`);
    }
    if (actionModuleStructure.bodyChildren.length !== expectedActionSubmodules.length) {
      actionModuleOrderProblems.push(`动作主体直接子级=${actionModuleStructure.bodyChildren.length}（应为 3）`);
    }
    expectedActionSubmodules.forEach((expected, index) => {
      const actual = actionModuleStructure.bodyChildren[index];
      if (!actual?.classes.includes(expected.className)) {
        actionModuleOrderProblems.push(`第 ${index + 1} 个子级不是 .${expected.className}`);
      }
      if (!actual?.classes.includes('functional-action-submodule')) {
        actionModuleOrderProblems.push(`第 ${index + 1} 个子级缺少 .functional-action-submodule`);
      }
      if (!actual?.text.includes(expected.label)) {
        actionModuleOrderProblems.push(`第 ${index + 1} 个子级缺少“${expected.label}”`);
      }
    });
    if (actionModuleStructure.legacyFollowingCheckCount !== 0) {
      actionModuleOrderProblems.push(`动作模块后仍有 ${actionModuleStructure.legacyFollowingCheckCount} 个同级数据核对模块`);
    }
    if (actionModuleOrderProblems.length > 0) {
      functionalActionModuleOrderErrors.push(`${stepId}: ${actionModuleOrderProblems.join('，')}`);
    }

    const table = page.locator('#functional-tx-step-content .functional-checks table');
    const tableCount = await table.count();
    if (tableCount !== 1) {
      functionalTxTableStructureErrors.push(`${stepId}: 数据核对表数量为 ${tableCount}（应为 1）`);
      continue;
    }
    const rowStructures = await table.locator('tbody tr.functional-check-row').evaluateAll((rows) => rows.map((row, index) => {
      const cells = Array.from((row as HTMLTableRowElement).cells);
      return {
        index: index + 1,
        kind: (row as HTMLElement).dataset.checkKind ?? '',
        cellCount: cells.length,
        effectiveColumnCount: cells.reduce((sum, cell) => sum + Math.max(1, cell.colSpan || 1), 0),
        hasLegacyAssertionCell: Boolean(row.querySelector('.functional-assertion-values')),
        actualIsFourth: Boolean(cells[3]?.classList.contains('functional-assertion-actual')),
        expectedIsSeventh: Boolean(cells[6]?.classList.contains('functional-assertion-expected')),
        evidenceIsEighth: Boolean(cells[7]?.classList.contains('functional-check-note')),
      };
    }));
    if (rowStructures.length === 0) {
      functionalTxTableStructureErrors.push(`${stepId}: 数据核对表没有明细行`);
    }
    for (const row of rowStructures) {
      functionalTxTableStructureChecks += 1;
      if (row.effectiveColumnCount !== 8) {
        functionalTxTableStructureErrors.push(`${stepId} 第 ${row.index} 行有效列数为 ${row.effectiveColumnCount}（应为 8）`);
      }
      if (row.kind !== 'assertion') continue;
      functionalAssertionRows += 1;
      if (row.cellCount !== 8
        || row.hasLegacyAssertionCell
        || !row.actualIsFourth
        || !row.expectedIsSeventh
        || !row.evidenceIsEighth) {
        functionalTxTableStructureErrors.push(
          `${stepId} 第 ${row.index} 行断言布局错误（单元格=${row.cellCount}，Actual第4列=${row.actualIsFourth}，Expected第7列=${row.expectedIsSeventh}，证据第8列=${row.evidenceIsEighth}，旧合并单元格=${row.hasLegacyAssertionCell}）`,
        );
      }
    }

    if (stepId === 'TX4') {
      const cleanupRow = table.locator('tbody tr.functional-check-row').filter({ hasText: 'cleanup.position-removed' });
      const cleanupRowCount = await cleanupRow.count();
      if (cleanupRowCount !== 1) {
        functionalTxTableStructureErrors.push(`TX4: cleanup.position-removed 行数量为 ${cleanupRowCount}（应为 1）`);
      } else {
        functionalCleanupPositionRemovedText = ((await cleanupRow.locator('td').nth(3).textContent()) ?? '').replace(/\s+/g, ' ').trim();
        if (!functionalCleanupPositionRemovedText.includes('仓位已移除：是（position.exists=false）')) {
          functionalTxTableStructureErrors.push(`TX4: cleanup.position-removed 实际值不可读（${functionalCleanupPositionRemovedText || '空'}）`);
        }
      }
    }

    const actionReadablePrecisionMarkers = await table.locator('.functional-readable-value[data-readable-value]').count();
    functionalReadablePrecisionMarkers += actionReadablePrecisionMarkers;
    if (actionReadablePrecisionMarkers > 0) {
      for (const expectation of functionalPrecisionExpectations) {
        const matchingRows = table.locator('tbody tr.functional-check-row').filter({ hasText: expectation.name });
        const matchingRowCount = await matchingRows.count();
        if (matchingRowCount === 0) continue;
        if (matchingRowCount !== 1) {
          functionalPrecisionValueErrors.push(`${stepId}: ${expectation.name} 行数量为 ${matchingRowCount}（应为 1）`);
          continue;
        }
        const actualCell = matchingRows.locator('td').nth(3);
        const rawValues = await actualCell.locator('.functional-value-raw').allTextContents();
        const readableValues = await actualCell.locator('.functional-readable-value[data-readable-value]').evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute('data-readable-value') ?? ''));
        const rawValue = rawValues.map((value) => value.trim()).join(' | ');
        const readableValue = readableValues.join(' | ');
        functionalPrecisionValueChecks.add(expectation.name);
        if (expectation.name === 'position.size-usd') functionalPositionSizeReadableText = readableValue;
        functionalPrecisionValueSummary.push(`${expectation.name}: ${rawValue || '缺少原值'} ${readableValue || '缺少可读值'}`);
        if (!rawValues.map((value) => value.trim()).includes(expectation.raw)) {
          functionalPrecisionValueErrors.push(`${stepId}: ${expectation.name} Actual 单元格原值为“${rawValue || '空'}”（应包含“${expectation.raw}”）`);
        }
        if (!readableValues.includes(expectation.readable)) {
          functionalPrecisionValueErrors.push(`${stepId}: ${expectation.name} Actual 单元格可读值为“${readableValue || '空'}”（应包含“${expectation.readable}”）`);
        }
      }
    }
  }
  if (functionalReadablePrecisionMarkers > 0) {
    for (const expectation of functionalPrecisionExpectations) {
      if (!functionalPrecisionValueChecks.has(expectation.name)) {
        functionalPrecisionValueErrors.push(`已启用可读精度显示，但 TX1～TX4 中没有 ${expectation.name} 行`);
      }
    }
  }
  const functionalCreateOpenAction = page.locator('.functional-tx-step-tab').filter({ hasText: '创建开仓订单' }).first();
  if (await functionalCreateOpenAction.count() > 0) await functionalCreateOpenAction.click();
  const functionalTraderTradeSummary = (await page.locator('.functional-trade-summary[data-trade-action="createOpen"]').textContent().catch(() => '')) ?? '';
  const functionalActionModuleCount = await page.locator('#functional-tx-step-content > .functional-action-module').count();
  const functionalActionHeaderCount = await page.locator('.functional-action-module > .functional-action-header').count();
  const functionalActionTradeSubmodules = await page.locator('.functional-action-module .functional-trade-summary').count();
  const functionalActionReceiptSubmodules = await page.locator('.functional-action-module .functional-tx-receipt').count();
  const functionalOpenAction = page.locator('.functional-tx-step-tab').filter({ hasText: '执行开仓订单' }).first();
  if (await functionalOpenAction.count() > 0) await functionalOpenAction.click();
  const functionalKeeperTradeSummary = (await page.locator('.functional-trade-summary[data-trade-action="executeOpen"]').textContent().catch(() => '')) ?? '';
  const functionalTradeSummary = `${functionalTraderTradeSummary} ${functionalKeeperTradeSummary}`;
  const functionalOpenActionRows = await page.locator('#functional-tx-step-content .functional-check-row').count();
  const functionalOpenActionTitle = (await page.locator('#functional-tx-step-content .functional-action-checks h3').textContent().catch(() => '')) ?? '';
  const functionalFormulaRuleBlocks = await page.locator('#functional-tx-step-content .formula-rule').count();
  const functionalFormulaExampleBlocks = await page.locator('#functional-tx-step-content .formula-example').count();
  const functionalFormulaBasisBlocks = await page.locator('#functional-tx-step-content .formula-basis').count();
  const functionalFormulaSourceLinks = await page.locator('#functional-tx-step-content .functional-formula-source a, #functional-tx-step-content .functional-formula-catalog-link').count();
  const functionalAllAction = page.locator('.functional-tx-step-tab[data-functional-tx-step="ALL"]');
  if (await functionalAllAction.count() > 0) await functionalAllAction.click();
  functionalActionModuleOrderChecks += 1;
  const functionalAllModuleOrder = await page.locator('#functional-tx-step-content').evaluate((mount) => {
    const children = Array.from(mount.children);
    const checkIndexes = children
      .map((child, index) => child.classList.contains('functional-checks') ? index : -1)
      .filter((index) => index >= 0);
    const transactionListIndexes = children
      .map((child, index) => child.classList.contains('tx-record-list') ? index : -1)
      .filter((index) => index >= 0);
    return {
      checkIndexes,
      transactionListIndexes,
      childClasses: children.map((child) => Array.from(child.classList).join('.')),
    };
  });
  const allCheckIndex = functionalAllModuleOrder.checkIndexes[0];
  const allTransactionListIndex = functionalAllModuleOrder.transactionListIndexes[0];
  if (functionalAllModuleOrder.checkIndexes.length !== 1
    || functionalAllModuleOrder.transactionListIndexes.length !== 1
    || allCheckIndex === undefined
    || allTransactionListIndex === undefined
    || allCheckIndex >= allTransactionListIndex) {
    functionalActionModuleOrderErrors.push(
      `ALL: 数据核对应位于 tx-record-list 前（直接子级=${functionalAllModuleOrder.childClasses.join(' → ') || '无'}）`,
    );
  }
  const functionalAllActionRows = await page.locator('#functional-tx-step-content .functional-check-row').count();
  const functionalAllTransactionRecords = await page.locator('#functional-tx-step-content .functional-tx-record').count();
  const functionalTransactionLinks = await page.locator('.functional-tx-link').count();
  const firstFunctionalTransactionHref = functionalTransactionLinks > 0
    ? await page.locator('.functional-tx-link').first().getAttribute('href')
    : null;
  const functionalTransactionLinkStatus = firstFunctionalTransactionHref && /^https?:\/\//.test(page.url())
    ? (await page.request.get(new URL(firstFunctionalTransactionHref, page.url()).href)).status()
    : null;
  const functionalExplorerLinks = await page.locator('.functional-tx-explorer-link').count();
  const functionalExplorerHref = functionalExplorerLinks > 0
    ? await page.locator('.functional-tx-explorer-link').first().getAttribute('href')
    : null;
  const functionalBindingSummary = (await page.locator('#functional-execution-content .execution-binding-summary').textContent().catch(() => '')) ?? '';
  const functionalBindingHref = await page.locator('#functional-execution-content .execution-binding-summary .case-link').getAttribute('href').catch(() => null);
  const functionalNestedBindings = await page.locator('.functional-case-overview .functional-case-head > .execution-binding-inline').count();
  const functionalStandaloneBindings = await page.locator('#functional-execution-content > .execution-binding-summary').count();
  const functionalHeroCaseLinks = await page.locator('#functional-execution-content > .functional-detail-hero .case-link').count();
  const functionalTestDataSections = await page.locator('.functional-case-overview > .functional-test-data').count();
  await page.locator('#functional-status').selectOption('FAIL');
  const functionalFailureRows = await page.locator('#functional-result-select option').count();
  const functionalExecutionLayers = (await page.locator('.functional-layer-grid').textContent().catch(() => '')) ?? '';
  const functionalExecutionDetail = (await page.locator('#functional-execution-content').textContent()) ?? '';
  const functionalEvidenceLinks = await page.locator('.functional-evidence a').count();
  const functionalCheckRows = await page.locator('.functional-check-row').count();
  const functionalCheckHeaders = (await page.locator('.functional-checks thead').textContent().catch(() => '')) ?? '';
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
    functionalExecutionRows,
    functionalExecutionMetrics,
    functionalFailureRows,
    functionalExecutionLayers,
    functionalExecutionDetail,
    functionalEvidenceLinks,
    functionalCheckRows,
    functionalCheckHeaders,
    functionalTransactionLinks,
    functionalTransactionLinkStatus,
    functionalExplorerLinks,
    functionalExplorerHref,
    functionalTradeSummary,
    functionalBindingSummary,
    functionalBindingHref,
    functionalNestedBindings,
    functionalStandaloneBindings,
    functionalTestDataSections,
    functionalActionModuleCount,
    functionalActionHeaderCount,
    functionalActionTradeSubmodules,
    functionalActionReceiptSubmodules,
    functionalFormulaRuleBlocks,
    functionalFormulaExampleBlocks,
    functionalFormulaBasisBlocks,
    functionalFormulaSourceLinks,
    functionalHeroCaseLinks,
    functionalActionTabs,
    functionalActionSelectionChecks,
    functionalActionSelectionErrors: functionalActionSelectionErrors.join('；'),
    functionalActionModuleOrderChecks,
    functionalActionModuleOrderErrors: functionalActionModuleOrderErrors.join('；'),
    functionalTxTableStructureChecks,
    functionalTxTableStructureErrors: functionalTxTableStructureErrors.join('；'),
    functionalAssertionRows,
    functionalCleanupPositionRemovedText,
    functionalReadablePrecisionMarkers,
    functionalPositionSizeReadableText,
    functionalPrecisionValueChecks: functionalPrecisionValueChecks.size,
    functionalPrecisionValueErrors: functionalPrecisionValueErrors.join('；'),
    functionalPrecisionValueSummary: functionalPrecisionValueSummary.join('；'),
    functionalOpenActionRows,
    functionalOpenActionTitle,
    functionalAllActionRows,
    functionalAllTransactionRecords,
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

  // —— 版本功能用例（CT/XT/FT）分区：准入横幅、8/11 列混排零报错、完整设计字段、无 SCN 泄漏。 ——
  await page.locator('#case-tab-functional').click();
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
  const versionDetailRows = await defaultBlock.locator('tr.vc-detail-row').count();
  const versionDetailIncomplete = versionDetailRows > 0
    ? await defaultBlock.locator('tr.vc-detail-row').evaluateAll((rows) => rows.filter((row) => {
      const values = Array.from(row.querySelectorAll('.vc-detail-grid article p'))
        .map((node) => (node.textContent ?? '').trim());
      return values.length !== 6 || values.some((value) => !value || value === '—');
    }).length)
    : -1;
  const firstDetailToggle = defaultBlock.locator('.vc-detail-toggle').first();
  await firstDetailToggle.click();
  const versionDetailOpens = await defaultBlock.locator('tr.vc-detail-row:not([hidden])').count() === 1;
  await firstDetailToggle.click();
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

  // 两类用例独立 Tab：回到 Scenario 后继续验证其筛选、选择与编辑逻辑。
  await page.locator('#case-tab-scenario').click();
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
    versionDetailRows,
    versionDetailIncomplete,
    versionDetailOpens,
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
      access(join(dirname(dashboardPath), 'deployments.html')),
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
  const deploymentsUrl = isHttp
    ? new URL('./deployments.html', dashboardUrl).href
    : pathToFileURL(join(dirname(dashboardPath!), 'deployments.html')).href;
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
  const deploymentsPage = await verifyDeployments(page, deploymentsUrl);
  const reconciliationConsole = await verifyReconciliationConsole(page, reconciliationConsoleUrl);

  const functionalDesktopTableLayoutErrors: string[] = [];
  const functionalDesktopTableLayoutSummary: string[] = [];
  let functionalDesktopTableLayoutChecks = 0;
  for (const viewportWidth of [1440, 1920]) {
    const measurement = await measureFunctionalTableLayout(page, executionsUrl, viewportWidth);
    for (const step of measurement.steps) {
      functionalDesktopTableLayoutChecks += 1;
      functionalDesktopTableLayoutSummary.push(
        `${viewportWidth}/${step.stepId}: ${step.containerScrollWidth}/${step.containerClientWidth}px`,
      );
      if (step.buttonCount !== 1 || step.containerCount !== 1 || step.tableCount !== 1) {
        functionalDesktopTableLayoutErrors.push(
          `${viewportWidth}px ${step.stepId}: 入口=${step.buttonCount}，滚动容器=${step.containerCount}，表格=${step.tableCount}（均应为 1）`,
        );
        continue;
      }
      if (step.containerScrollWidth > step.containerClientWidth + 1) {
        functionalDesktopTableLayoutErrors.push(
          `${viewportWidth}px ${step.stepId}: 数据核对表仍需横向滚动（scrollWidth=${step.containerScrollWidth}px，clientWidth=${step.containerClientWidth}px）`,
        );
      }
    }
  }

  const functionalMobileTableLayoutErrors: string[] = [];
  const functionalMobileTableLayoutSummary: string[] = [];
  let functionalMobileTableLayoutChecks = 0;
  const functionalMobileTableLayout = await measureFunctionalTableLayout(page, executionsUrl, 390);
  for (const step of functionalMobileTableLayout.steps) {
    functionalMobileTableLayoutChecks += 1;
    functionalMobileTableLayoutSummary.push(
      `390/${step.stepId}: 表格 ${step.containerScrollWidth}/${step.containerClientWidth}px，页面 ${step.documentScrollWidth}/${step.documentClientWidth}px`,
    );
    if (step.buttonCount !== 1 || step.containerCount !== 1 || step.tableCount !== 1) {
      functionalMobileTableLayoutErrors.push(
        `390px ${step.stepId}: 入口=${step.buttonCount}，滚动容器=${step.containerCount}，表格=${step.tableCount}（均应为 1）`,
      );
      continue;
    }
    if (step.bodyScrollWidth > step.documentClientWidth + 1
      || step.documentScrollWidth > step.documentClientWidth + 1) {
      functionalMobileTableLayoutErrors.push(
        `390px ${step.stepId}: 横向滚动泄漏到页面（body=${step.bodyScrollWidth}px，document=${step.documentScrollWidth}px，viewport=${step.documentClientWidth}px）`,
      );
    }
    if (step.containerScrollWidth > step.containerClientWidth + 1
      && !['auto', 'scroll'].includes(step.overflowX)) {
      functionalMobileTableLayoutErrors.push(
        `390px ${step.stepId}: 表格超宽但滚动容器 overflow-x=${step.overflowX || '未设置'}`,
      );
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(environmentsUrl);
  await page.waitForSelector('#environment-page[data-page-ready="true"]');
  const environmentsMobileBodyWidth = await page.evaluate(() => document.body.scrollWidth);
  const envMobileTabCount = await page.locator('#env-tabs .env-tab').count();
  await page.goto(deploymentsUrl);
  await page.waitForSelector('#deployments-page[data-page-ready="true"]');
  const deploymentsMobileBodyWidth = await page.evaluate(() => document.body.scrollWidth);
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
    functionalDesktopTableLayoutChecks,
    functionalDesktopTableLayoutErrors: functionalDesktopTableLayoutErrors.join('；'),
    functionalDesktopTableLayoutSummary: functionalDesktopTableLayoutSummary.join('；'),
    functionalMobileTableLayoutChecks,
    functionalMobileTableLayoutErrors: functionalMobileTableLayoutErrors.join('；'),
    functionalMobileTableLayoutSummary: functionalMobileTableLayoutSummary.join('；'),
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
    versionDetailRows: testCases.versionDetailRows,
    versionDetailIncomplete: testCases.versionDetailIncomplete,
    versionDetailOpens: testCases.versionDetailOpens,
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
    ...deploymentsPage,
    envMobileTabCount,
    environmentsMobileBodyWidth,
    deploymentsMobileBodyWidth,
    testCasesMobileBodyWidth,
    mobileBodyWidth,
    executionMobileBodyWidth,
    runsMobileBodyWidth,
    consoleMobileBodyWidth,
  };
  const expectedHeaders = ['核对结果', '执行链接', '执行时间'];
  const expectedReconciliationHeaders = ['Before（链上）', 'After（链上 Actual）', 'Expected Δ（订单 / 公式）', 'Expected After = Before + Δ', '公式与依据'];
  const requiresScenarioExecutionEvidence = result.executionSourceStatus === 'ready' && result.evidenceScenarioId !== null;
  const requiresFunctionalExecutionEvidence = result.executionSourceStatus === 'ready' && result.functionalExecutionRows > 0;
  const failed = dashboard.title !== 'FX100 E2E 测试看板'
    || dashboard.dashboardNavLabel !== '测试看板'
    || dashboard.testRunNavHref !== './runs.html'
    || dashboard.deploymentsNavHref !== './deployments.html'
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
    || (requiresScenarioExecutionEvidence && result.executionLinks < 1)
    || (requiresScenarioExecutionEvidence && (!result.evidenceScenarioId
      || !result.scenarioExecutionHref?.includes(`scenario=${result.evidenceScenarioId}`)))
    // 断言 forkDisplayName 已归一化展示（项目名而非技术 Fork ID）；不锁定环境——最新证据可能来自任一 fork。
    || (requiresScenarioExecutionEvidence && !result.evidenceRowText.includes(' / aladdindao/test'))
    || (requiresScenarioExecutionEvidence && result.evidenceRowText.includes('9f3df3-7d0923'))
    || (requiresScenarioExecutionEvidence && result.reconciliationRows < 1)
    || (requiresScenarioExecutionEvidence && !expectedReconciliationHeaders.every((header) => result.reconciliationHeaders.includes(header)))
    || (requiresScenarioExecutionEvidence && result.traderTransactions < 2)
    || (requiresScenarioExecutionEvidence && result.keeperTransactions < 2)
    || (requiresScenarioExecutionEvidence && result.transactionEvidenceLinks < 4)
    // 概述链接必须指向证据对应的场景（最新证据场景随数据变化，不硬编码具体 SCN）。
    || (requiresScenarioExecutionEvidence && !result.testCaseOverviewHref?.includes(`test-cases.html?scenario=${result.evidenceScenarioId}`))
    || (requiresScenarioExecutionEvidence && !result.testCaseOverviewText.includes('角色与意图'))
    || (requiresScenarioExecutionEvidence && result.graceFilteredRows < 1)
    || (requiresScenarioExecutionEvidence && !['Grace 公式核对', 'graceStart', 'graceEnd']
      .every((field) => result.graceFilteredText.includes(field)))
    || (requiresScenarioExecutionEvidence && (result.feeFilteredRows < 1 || result.feeFilteredRows >= result.reconciliationRows))
    || (requiresScenarioExecutionEvidence && result.allFilteredRows !== result.reconciliationRows)
    || (requiresScenarioExecutionEvidence && !result.executionHeroText.includes('执行结果 PASS'))
    || (requiresScenarioExecutionEvidence && !result.executionHeroText.includes('自动化覆盖 PARTIAL'))
    || (requiresScenarioExecutionEvidence && !result.executionHeroText.includes(' / aladdindao/test'))
    || (requiresScenarioExecutionEvidence && result.executionHeroText.includes('9f3df3-7d0923'))
    || (requiresFunctionalExecutionEvidence && !result.functionalExecutionMetrics.includes('已有自动化结果'))
    || (requiresFunctionalExecutionEvidence && result.functionalFailureRows < 1)
    || (requiresFunctionalExecutionEvidence && !['合约层', '前端层', '交叉一致'].every((label) => result.functionalExecutionLayers.includes(label)))
    || (requiresFunctionalExecutionEvidence && !result.functionalExecutionDetail.includes('本次自动化运行'))
    || (requiresFunctionalExecutionEvidence && !['批次 ID', '结果 Run ID']
      .every((label) => result.functionalExecutionDetail.includes(label)))
    || (requiresFunctionalExecutionEvidence && !['当前版本与环境', '查看页面与合约地址']
      .every((label) => result.functionalBindingSummary.includes(label)))
    || (requiresFunctionalExecutionEvidence && !result.functionalBindingHref?.includes('deployments.html?environment='))
    || (requiresFunctionalExecutionEvidence && result.functionalNestedBindings !== 1)
    || (requiresFunctionalExecutionEvidence && result.functionalStandaloneBindings !== 0)
    || (requiresFunctionalExecutionEvidence && result.functionalTestDataSections !== 1)
    || (requiresFunctionalExecutionEvidence && result.functionalActionModuleCount !== 1)
    || (requiresFunctionalExecutionEvidence && result.functionalActionHeaderCount !== 1)
    || (requiresFunctionalExecutionEvidence && result.functionalActionTradeSubmodules !== 1)
    || (requiresFunctionalExecutionEvidence && result.functionalActionReceiptSubmodules !== 1)
    || (requiresFunctionalExecutionEvidence && result.functionalFormulaBasisBlocks < 1)
    || (requiresFunctionalExecutionEvidence && result.functionalFormulaSourceLinks < 1)
    || (requiresFunctionalExecutionEvidence && result.functionalHeroCaseLinks !== 0)
    || (requiresFunctionalExecutionEvidence && result.functionalActionTabs < 2)
    || (requiresFunctionalExecutionEvidence && result.functionalActionSelectionChecks !== result.functionalActionTabs + 1)
    || (requiresFunctionalExecutionEvidence && result.functionalActionSelectionErrors !== '')
    || (requiresFunctionalExecutionEvidence && result.functionalActionModuleOrderChecks !== 5)
    || (requiresFunctionalExecutionEvidence && result.functionalActionModuleOrderErrors !== '')
    || (requiresFunctionalExecutionEvidence && result.functionalTxTableStructureChecks < 1)
    || (requiresFunctionalExecutionEvidence && result.functionalTxTableStructureErrors !== '')
    || (requiresFunctionalExecutionEvidence && result.functionalDesktopTableLayoutChecks !== 8)
    || (requiresFunctionalExecutionEvidence && result.functionalDesktopTableLayoutErrors !== '')
    || (requiresFunctionalExecutionEvidence && result.functionalMobileTableLayoutChecks !== 4)
    || (requiresFunctionalExecutionEvidence && result.functionalMobileTableLayoutErrors !== '')
    || (requiresFunctionalExecutionEvidence && result.functionalAssertionRows < 1)
    || (requiresFunctionalExecutionEvidence
      && !result.functionalCleanupPositionRemovedText.includes('仓位已移除：是（position.exists=false）'))
    || (requiresFunctionalExecutionEvidence
      && result.functionalReadablePrecisionMarkers > 0
      && result.functionalPositionSizeReadableText !== '= 50 USD')
    || (requiresFunctionalExecutionEvidence
      && result.functionalReadablePrecisionMarkers > 0
      && result.functionalPrecisionValueChecks !== 5)
    || (requiresFunctionalExecutionEvidence
      && result.functionalReadablePrecisionMarkers > 0
      && result.functionalPrecisionValueErrors !== '')
    || (requiresFunctionalExecutionEvidence && result.functionalOpenActionRows < 1)
    || (requiresFunctionalExecutionEvidence && result.functionalOpenActionTitle.trim() !== '数据核对')
    || (requiresFunctionalExecutionEvidence && result.functionalAllActionRows <= result.functionalOpenActionRows)
    || (requiresFunctionalExecutionEvidence && result.functionalAllTransactionRecords !== result.functionalActionTabs - 1)
    || (requiresFunctionalExecutionEvidence && ![
      '交易概要',
      '交易员提交 10 USDC、5x 市价开多订单',
      'USDC 从 Trader 转入 OrderVault',
      'Keeper 执行开多订单；实际成交价 2,032.740628 USD',
      'Margin10 USDC',
      'Leverage5x',
      'Position Size50 USD',
      'Execution Price2,032.740628 USD',
      'Execution Price Raw2032740628092499',
      'Raw 换算口径raw ÷ 10^(30 − Index Token Decimals)',
      'Index Token Decimals = 18',
      '因此除以 1e12',
    ].every((label) => result.functionalTradeSummary.replace(/\s+/g, '').includes(label.replace(/\s+/g, ''))))
    || (requiresFunctionalExecutionEvidence && result.functionalEvidenceLinks < 1)
    || (requiresFunctionalExecutionEvidence && result.functionalCheckRows < 1)
    || (requiresFunctionalExecutionEvidence && !['核对项', 'Before', 'After（Actual）', 'Actual Δ', 'Expected Δ', 'Expected After / Expected', '公式 / 依据']
      .every((label) => result.functionalCheckHeaders.includes(label)))
    || (requiresFunctionalExecutionEvidence && result.functionalTransactionLinks < 1)
    || (isHttp && requiresFunctionalExecutionEvidence && result.functionalTransactionLinkStatus !== 200)
    || (requiresFunctionalExecutionEvidence && result.functionalExplorerLinks < 1)
    || (requiresFunctionalExecutionEvidence && !/^https:\/\/(?:dashboard\.tenderly\.co\/[^/]+\/[^/]+\/testnet\/[a-zA-Z0-9-]+|sepolia\.basescan\.org)\/tx\/0x[0-9a-fA-F]{64}$/.test(result.functionalExplorerHref ?? ''))
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
    || result.versionDetailRows !== result.vcRowsTotal
    || result.versionDetailIncomplete !== 0
    || !result.versionDetailOpens
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
    || !result.versionSectionText.includes('自动化执行（0 条）')
    || !result.versionSectionText.includes('手工执行（0 条）')
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
    || result.deploymentsTitle !== '版本、环境与合约地址'
    || result.deploymentsNavCurrent !== 'page'
    || result.deploymentVersionOptions < 2
    || result.deploymentEnvironmentOptions < 2
    || result.deploymentInitialCards < 1
    || result.deploymentVersionFilteredCards < 1
    || result.deploymentVersionFilteredCards > result.deploymentInitialCards
    || result.deploymentEnvironmentFilteredCards !== 1
    || result.deploymentCoreRows < 1
    || result.deploymentMockRows < 5
    || !['USDC Mock', 'Index Token', 'Index Oracle', 'Token decimals 6', 'Oracle decimals 8', 'Oracle decimals 18']
      .every((label) => result.deploymentMockText.includes(label))
    || !['Trade 站点', '环境配置', '执行详情', '本页地址', '页面地址', '测试环境', '本环境地址目录']
      .every((label) => result.deploymentPageAddressText.includes(label))
    || result.deploymentV031SelectedVersion !== 'v0.3.1'
    || result.deploymentV031SelectedEnvironment !== 'base-sepolia'
    || result.deploymentV031CoordinatedCards !== 1
    || result.deploymentV031BaseSepoliaCards !== 1
    || result.deploymentV031CoreRows !== 11
    || result.deploymentV031CoreAddressCount !== 11
    || result.deploymentV031InvalidCoreAddresses !== 0
    || result.deploymentV031SnapshotRows !== 67
    || result.deploymentV031DeploymentId !== 'base-sepolia@v0.3.1'
    || result.deploymentV031ManifestName !== 'base-sepolia-v0.3.1-260729'
    || result.deploymentV031ChainPair !== '84532 / 84532'
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
    || result.deploymentsMobileBodyWidth > 410
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

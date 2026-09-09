import { environmentNames, type EnvironmentName } from '../../config/environments/catalog.js';
import { loadEnvironmentBinding } from '../config/environment-binding.js';
import { listMockMarketBundles, loadMockResourceRegistrySync } from '../config/mock-resources.js';
import type { EvidenceEnvelope } from '../evidence/evidence-v3.js';
import { sha256CanonicalJson } from '../evidence/evidence-digest.js';
import { findTrustedCheckPlan } from './check-plan-registry.js';
import { aggregateReport } from './engine/aggregate-verdicts.js';
import { runCheckPlan } from './engine/check-engine.js';
import { reconciliationReportSchema, type ReconciliationReport } from './schema/check-record.js';

function verifyEnvironmentIdentity(
  evidence: EvidenceEnvelope,
  projectRoot: string,
): string[] {
  const diagnostics: string[] = [];
  const environment = evidence.environment;
  if (!environmentNames.includes(environment.name as EnvironmentName)) {
    return [`Evidence.environment.name=${environment.name} 不在可信环境目录中`];
  }

  let context: ReturnType<typeof loadEnvironmentBinding>;
  try {
    context = loadEnvironmentBinding(projectRoot, environment.name as EnvironmentName);
  } catch (error) {
    return [`无法加载 Evidence.environment=${environment.name} 的可信部署绑定：${error instanceof Error ? error.message : String(error)}`];
  }
  if (environment.chainId !== context.binding.environmentChainId) {
    diagnostics.push(
      `Evidence.environment.chainId=${environment.chainId} 与可信绑定 chainId=${context.binding.environmentChainId} 不一致`,
    );
  }

  if (environment.deploymentId !== context.binding.deploymentId) {
    diagnostics.push(
      `Evidence.environment.deploymentId=${environment.deploymentId} 与可信绑定 deploymentId=${context.binding.deploymentId} 不一致`,
    );
  }
  if (environment.release !== undefined && environment.release !== context.binding.release) {
    diagnostics.push(
      `Evidence.environment.release=${environment.release} 与可信绑定 release=${context.binding.release} 不一致`,
    );
  }

  const isForkEnvironment = environment.name === 'tx-fork'
    || environment.name === 'oracle-fork'
    || environment.name === 'time-fork';
  let mockResource: ReturnType<typeof loadMockResourceRegistrySync>['resources']['tx-fork'] | undefined;
  if (isForkEnvironment) {
    if (!environment.fork) {
      diagnostics.push(`Evidence.environment.fork 在 ${environment.name} 中必填`);
    } else if (environment.fork.provider !== 'tenderly-vnet') {
      diagnostics.push(
        `Evidence.environment.fork.provider=${environment.fork.provider}，可信值为 tenderly-vnet`,
      );
    }
    try {
      const forkEnvironment = environment.name as 'tx-fork' | 'oracle-fork' | 'time-fork';
      const resource = loadMockResourceRegistrySync(projectRoot).resources[forkEnvironment];
      mockResource = resource;
      if (resource.forkDisplayName
        && environment.fork?.displayName !== resource.forkDisplayName) {
        diagnostics.push(
          `Evidence.environment.fork.displayName=${environment.fork?.displayName ?? '<missing>'} 与可信 Mock Registry=${resource.forkDisplayName} 不一致`,
        );
      }
    } catch (error) {
      diagnostics.push(
        `无法加载 ${environment.name} 的可信 Mock Registry：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } else if (environment.fork) {
    diagnostics.push(`Evidence.environment.fork 不得出现在非 Fork 环境 ${environment.name}`);
  }

  const marketActionTypes = new Set([
    'submitMarketIncrease', 'submitMarketDecrease', 'placeLimit', 'addTpSl',
    'executeOrder', 'liquidate', 'adl', 'movePrice',
  ]);
  const requiresMarket = evidence.actions.some((action) => marketActionTypes.has(action.type));
  const market = environment.market;
  if (requiresMarket && !market) {
    diagnostics.push('Evidence.environment.market 对当前市场动作必填');
    return diagnostics;
  }
  if (!market) return diagnostics;

  if (market.mode === 'mock-market') {
    if (!isForkEnvironment || !mockResource) {
      diagnostics.push(`Evidence.environment.market.mode=mock-market 不能用于 ${environment.name}`);
      return diagnostics;
    }
    if (!market.resourceAlias) {
      diagnostics.push('Evidence.environment.market.resourceAlias 在 mock-market 中必填');
      return diagnostics;
    }
    const matchingBundles = listMockMarketBundles(mockResource)
      .filter((bundle) => bundle.alias === market.resourceAlias);
    if (matchingBundles.length !== 1) {
      diagnostics.push(
        `Evidence.environment.market.resourceAlias=${market.resourceAlias} 未唯一命中可信 Mock Bundle`,
      );
      return diagnostics;
    }
    const bundle = matchingBundles[0]!;
    if (mockResource.status !== 'ready' || bundle.status !== 'ready'
      || bundle.market?.status !== 'registered' || bundle.market.marketIndex === undefined) {
      diagnostics.push(`可信 Mock Bundle ${market.resourceAlias} 尚未 ready/registered`);
      return diagnostics;
    }
    if (market.marketIndex !== bundle.market.marketIndex) {
      diagnostics.push(
        `Evidence.environment.market.marketIndex=${market.marketIndex ?? '<missing>'} 与可信 Mock Bundle=${bundle.market.marketIndex} 不一致`,
      );
    }
    if (market.marketAddress !== undefined
      && market.marketAddress.toLowerCase() !== bundle.market.vault?.toLowerCase()) {
      diagnostics.push(
        `Evidence.environment.market.marketAddress=${market.marketAddress} 与可信 Mock Bundle vault=${bundle.market.vault ?? '<missing>'} 不一致`,
      );
    }
  } else if (market.mode === 'deployed-market') {
    if (market.resourceAlias !== undefined && market.resourceAlias !== 'none') {
      diagnostics.push(`deployed-market 不得引用 Mock resourceAlias=${market.resourceAlias}`);
    }
    const matchingMarkets = context.manifest.markets.filter((candidate) => (
      Number(candidate.marketIndex) === market.marketIndex
    ));
    if (matchingMarkets.length !== 1) {
      diagnostics.push(
        `Evidence.environment.market.marketIndex=${market.marketIndex ?? '<missing>'} 未唯一命中可信 deployment manifest`,
      );
    } else if (market.marketAddress !== undefined
      && market.marketAddress.toLowerCase() !== matchingMarkets[0]!.vault.toLowerCase()) {
      diagnostics.push(
        `Evidence.environment.market.marketAddress=${market.marketAddress} 与可信 manifest vault=${matchingMarkets[0]!.vault} 不一致`,
      );
    }
  } else {
    diagnostics.push(`Evidence.environment.market.mode=${market.mode} 不是可信市场模式`);
  }
  return diagnostics;
}

/**
 * Artifact trust gate owned by reconciliation, not by the renderer.
 * It replays the registered executable plan and compares the entire canonical
 * report, so a public plan digest cannot be reused to bless hand-written rows.
 */
export function verifyReconciliationArtifact(
  evidence: EvidenceEnvelope,
  report: ReconciliationReport,
  projectRoot: string,
): readonly string[] {
  const diagnostics = verifyEnvironmentIdentity(evidence, projectRoot);
  const trusted = findTrustedCheckPlan(report.checkPlan.id, report.checkPlan.version);
  if (!trusted) {
    diagnostics.push(
      `ReconciliationReport.checkPlan=${report.checkPlan.id}@${report.checkPlan.version} 未登记到 Reporter 可信计划注册表`,
    );
    return diagnostics;
  }
  if (report.checkPlanDigest !== trusted.digest) {
    diagnostics.push(
      `ReconciliationReport.checkPlanDigest=${report.checkPlanDigest} 与可信计划 digest=${trusted.digest} 不一致`,
    );
    return diagnostics;
  }

  try {
    const authoritativeChecks = runCheckPlan(evidence, trusted.plan);
    const authoritativeReport = reconciliationReportSchema.parse(
      aggregateReport(evidence, authoritativeChecks, trusted.plan),
    );
    const actualDigest = sha256CanonicalJson(report);
    const authoritativeDigest = sha256CanonicalJson(authoritativeReport);
    if (actualDigest !== authoritativeDigest) {
      diagnostics.push(
        `ReconciliationReport 与可信计划对 canonical Evidence 的重放结果不一致：artifact=${actualDigest}，authoritative=${authoritativeDigest}`,
      );
    }
  } catch (error) {
    diagnostics.push(
      `可信计划 ${trusted.id}@${trusted.version} 重放失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return diagnostics;
}

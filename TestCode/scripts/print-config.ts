import { loadRuntimeConfig, maskUrl } from '../src/config/runtime.js';

const config = loadRuntimeConfig();

console.log({
  environment: config.environment,
  appBaseUrl: config.appBaseUrl,
  chainId: config.chainId,
  rpcUrl: maskUrl(config.rpcUrl),
  adminRpcUrl: config.adminRpcUrl ? maskUrl(config.adminRpcUrl) : undefined,
  deploymentId: config.deploymentId,
  deploymentRelease: config.deploymentRelease,
  deploymentManifestName: config.deploymentManifestName,
  environmentBindingsPath: config.environmentBindingsPath,
  deploymentManifestPath: config.deploymentManifestPath,
  requestTimeoutMs: config.requestTimeoutMs,
  baselineConfigured: Boolean(config.baselineId),
  primaryWalletConfigured: config.hasPrimaryTestWallet,
  secondaryWalletConfigured: config.hasSecondaryTestWallet,
  tenderlyTokenConfigured: config.hasTenderlyAccessToken,
});

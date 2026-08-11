import { listMockMarketBundles, loadMockResourceRegistry } from '../src/config/mock-resources.js';

const registry = await loadMockResourceRegistry();
for (const [environment, resource] of Object.entries(registry.resources)) {
  const shared = resource.sharedCollateral;
  console.log(`${environment} | ${resource.status} | shared USDC=${shared?.token?.address ?? 'pending'} | shared Oracle=${shared?.oracle?.address ?? 'pending'}`);
  const bundles = listMockMarketBundles(resource);
  if (bundles.length === 0) console.log('  bundle=pending');
  for (const bundle of bundles) {
    console.log([
      `  ${bundle.alias}`,
      bundle.status,
      bundle.token?.address ?? 'token=pending',
      bundle.oracle?.address ?? 'oracle=pending',
      bundle.market?.marketIndex === undefined ? 'market=pending' : `marketIndex=${bundle.market.marketIndex}`,
      bundle.market?.profileId ?? 'profile=pending',
      bundle.market?.configuredParameterCount === undefined
        ? 'parameters=pending'
        : `parameters=${bundle.market.configuredParameterCount}`,
    ].join(' | '));
  }
}

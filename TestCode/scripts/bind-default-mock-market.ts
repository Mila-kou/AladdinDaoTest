import { getAddress } from 'viem';

import { loadDeploymentManifest } from '../src/config/deployment.js';
import {
  isMockResourceEnvironment,
  resolveDefaultMockResource,
  saveDefaultMockResource,
} from '../src/config/mock-resources.js';
import { loadRuntimeConfig } from '../src/config/runtime.js';
import type { TestProject } from '../src/reporting/test-environments.js';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const project = (argument('--project') ?? process.env.E2E_ENV ?? 'oracle-fork') as TestProject;
if (!isMockResourceEnvironment(project)) {
  throw new Error('Mock Market 只允许绑定到 tx-fork / oracle-fork / time-fork。');
}
process.env.E2E_ENV = project;

const marketIndexText = argument('--market-index') ?? '1';
if (!/^\d+$/.test(marketIndexText)) {
  throw new Error(`--market-index 必须是非负整数，实际 ${marketIndexText}`);
}
const marketIndex = Number(marketIndexText);
const runtime = loadRuntimeConfig();
const [resource, manifest] = await Promise.all([
  resolveDefaultMockResource(project),
  loadDeploymentManifest(runtime.deploymentManifestPath),
]);
const market = manifest.markets.find((item) => Number(item.marketIndex) === marketIndex);
if (!market) {
  throw new Error(`${manifest.name} 不存在 marketIndex=${marketIndex}`);
}
if (!market.synthetic) {
  throw new Error(`${market.name} 不是 Synthetic Market，不应用作 default-mock。`);
}

const collateralAddress = getAddress(market.collateralToken);
const inheritedCollateral = resource.collateralToken;
const collateralToken = inheritedCollateral
  && getAddress(inheritedCollateral.address) === collateralAddress
  ? inheritedCollateral
  : {
      address: collateralAddress,
      origin: 'inherited-base-deployment' as const,
      name: market.collateralTokenDecimals === 6 ? 'MockUSDC' : `${market.name} Collateral`,
      symbol: market.collateralTokenDecimals === 6 ? 'MOCK_USDC' : 'COLLATERAL',
      decimals: market.collateralTokenDecimals,
    };
const bindingNote = `已绑定 ${manifest.name}/marketIndex=${marketIndex}；绑定仅更新本地登记，不创建或修改链上 Market。`;

await saveDefaultMockResource(project, {
  ...resource,
  chainId: runtime.chainId,
  ...(runtime.forkDisplayName ? { forkDisplayName: runtime.forkDisplayName } : {}),
  token: {
    address: getAddress(market.indexToken),
    origin: 'inherited-base-deployment',
    name: market.name,
    symbol: market.symbol,
    decimals: market.indexTokenDecimals,
  },
  collateralToken,
  market: {
    status: 'registered',
    marketIndex,
    notes: `${manifest.name} 的 ${market.name} 市场；执行前由用例临时把 indexToken Oracle 指向 default-mock Oracle。`,
  },
  notes: resource.notes.includes(bindingNote) ? resource.notes : `${resource.notes} ${bindingNote}`,
});

console.log(`${project}/default-mock 已绑定 ${market.name} marketIndex=${marketIndex}`);
console.log(`Index Token: ${getAddress(market.indexToken)}`);
console.log(`Mock Oracle: ${resource.oracle?.address ?? 'unknown'}`);
console.log('登记表：config/mock-resources.json');

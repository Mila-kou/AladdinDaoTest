import { resolve } from 'node:path';

import { environmentNames } from '../config/environments/catalog.js';
import { loadDeploymentManifest } from '../src/config/deployment.js';
import { loadEnvironmentBinding } from '../src/config/environment-binding.js';

const inputPath = process.argv[2];

if (!inputPath) {
  try {
    const rows = environmentNames.map((environment) => {
      const context = loadEnvironmentBinding(process.cwd(), environment);
      return {
        environment,
        deploymentId: context.binding.deploymentId,
        release: context.binding.release,
        environmentChainId: context.binding.environmentChainId,
        deploymentChainId: context.binding.deploymentChainId,
        manifest: context.binding.manifest,
      };
    });
    console.table(rows);
    console.log({ status: 'VALID', bindings: rows.length });
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
} else {
  try {
    const path = resolve(process.cwd(), inputPath);
    const manifest = await loadDeploymentManifest(path);
    console.log({
      status: 'VALID',
      path,
      name: manifest.name,
      release: manifest.release,
      chainId: manifest.chainId,
      markets: manifest.markets.map((market) => ({
        name: market.name,
        marketIndex: market.marketIndex,
        synthetic: market.synthetic,
      })),
    });
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

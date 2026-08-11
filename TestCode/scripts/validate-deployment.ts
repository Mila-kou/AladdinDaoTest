import { resolve } from 'node:path';

import { loadDeploymentManifest } from '../src/config/deployment.js';

const inputPath = process.argv[2];

if (!inputPath) {
  console.error('Usage: npm run config:validate -- <deployment-manifest.json>');
  process.exitCode = 1;
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

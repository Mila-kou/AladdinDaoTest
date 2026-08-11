import { resolve } from 'node:path';

import { startDashboardServer } from '../src/server/dashboard-server.js';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const host = argument('--host') ?? process.env.DASHBOARD_HOST ?? '127.0.0.1';
const portValue = argument('--port') ?? process.env.DASHBOARD_PORT ?? '4173';
const port = Number(portValue);
const artifactDirectory = resolve(
  process.cwd(),
  argument('--dir') ?? process.env.DASHBOARD_ARTIFACT_DIR ?? 'artifacts/latest',
);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  console.error(`无效端口：${portValue}`);
  process.exitCode = 1;
} else {
  try {
    const running = await startDashboardServer({
      host,
      port,
      artifactDirectory,
      projectRoot: process.cwd(),
    });

    console.log(`FX100 E2E Dashboard: ${running.url}`);
    console.log(`Execution details: ${running.url}executions`);
    console.log(`Test cases: ${running.url}test-cases`);
    console.log(`Test runs: ${running.url}runs`);
    console.log(`Test environments: ${running.url}environments`);
    console.log(`Contract parameters: ${running.url}parameters`);
    console.log(`Contract formulas: ${running.url}formulas`);
    console.log(`Page data formulas: ${running.url}page-formulas`);
    console.log(`Artifact: ${running.artifactDirectory}`);
    console.log(`Version API: ${running.url}api/version`);
    console.log(`Health API: ${running.url}health`);
    console.log(`Source status: ${running.initialArtifact.sourceStatus.toUpperCase()}`);
    console.log('Press Ctrl+C to stop.');

    const stop = () => {
      running.server.close(() => process.exit(0));
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch (error) {
    console.error('Dashboard server failed:', error);
    process.exitCode = 1;
  }
}

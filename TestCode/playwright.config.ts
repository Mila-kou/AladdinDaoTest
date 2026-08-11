import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ path: '.env', quiet: true });

const baseURL = process.env.E2E_APP_BASE_URL ?? 'https://fx100-dev.vercel.app';

export default defineConfig({
  testDir: './tests',
  outputDir: './artifacts/playwright',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [
    ['list'],
    [
      './src/reporting/playwright-reporter.ts',
      {
        outputRoot: 'artifacts/runs',
        latestOutput: 'artifacts/latest',
        catalogPath: '../TestCase/E2E/SCENARIO-CHECKLIST.md',
      },
    ],
    ['html', { outputFolder: 'artifacts/html-report', open: 'never' }],
    ['json', { outputFile: 'artifacts/results.json' }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'dev-readonly',
      metadata: { e2eEnvironment: 'dev-readonly', rpcEnv: 'E2E_DEV_RPC_URL' },
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'tx-fork',
      metadata: { e2eEnvironment: 'tx-fork', rpcEnv: 'E2E_TX_FORK_RPC_URL' },
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'oracle-fork',
      metadata: { e2eEnvironment: 'oracle-fork', rpcEnv: 'E2E_ORACLE_FORK_RPC_URL' },
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'time-fork',
      metadata: { e2eEnvironment: 'time-fork', rpcEnv: 'E2E_TIME_FORK_RPC_URL' },
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'base-sepolia',
      metadata: { e2eEnvironment: 'base-sepolia', rpcEnv: 'E2E_BASE_SEPOLIA_RPC_URL' },
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

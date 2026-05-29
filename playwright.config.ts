import { defineConfig } from '@playwright/test';

const dashboardPort = 3200;
const apiPort = 3201;
const greenhouseStubPort = 3202;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${dashboardPort}`;

export default defineConfig({
  testDir: './tests/apps/dashboard',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
    trace: 'retain-on-failure'
  },
  webServer: [
    {
      command: `node scripts/e2e-api-server.mjs --api-port=${apiPort} --greenhouse-stub-port=${greenhouseStubPort}`,
      port: apiPort,
      reuseExistingServer: false,
      timeout: 120000
    },
    {
      command: `node scripts/e2e-dashboard-server.mjs --api-port=${apiPort} --dashboard-port=${dashboardPort}`,
      port: dashboardPort,
      reuseExistingServer: false,
      timeout: 120000
    }
  ]
});

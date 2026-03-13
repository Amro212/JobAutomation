import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './tests/apps/dashboard',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'msedge',
    trace: 'retain-on-failure'
  },
  webServer: [
    {
      command: 'corepack pnpm --filter @jobautomation/api dev',
      port: 3001,
      reuseExistingServer: !process.env.CI,
      timeout: 120000
    },
    {
      command: 'corepack pnpm --filter @jobautomation/dashboard dev --hostname 127.0.0.1 --port 3000',
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 120000
    }
  ]
});

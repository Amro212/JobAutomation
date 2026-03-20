import { defineConfig } from '@playwright/test';

const dashboardPort = 3200;
const apiPort = 3201;
const greenhouseStubPort = 3202;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${dashboardPort}`;
const powershell =
  'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

export default defineConfig({
  testDir: './tests/apps/dashboard',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'msedge',
    trace: 'retain-on-failure'
  },
  webServer: [
    {
      command: `${powershell} -NoLogo -NoProfile -Command "Set-Location 'C:\\VScode\\JobAutomation'; Remove-Item -Force 'apps\\api\\data\\playwright.sqlite' -ErrorAction SilentlyContinue; $env:JOB_AUTOMATION_DB_PATH='C:\\VScode\\JobAutomation\\apps\\api\\data\\playwright.sqlite'; $env:API_PORT='${apiPort}'; $env:API_BASE_URL='http://127.0.0.1:${apiPort}'; $env:GREENHOUSE_API_BASE_URL='http://127.0.0.1:${greenhouseStubPort}/v1/boards'; $env:JOB_AUTOMATION_TECTONIC_COMMAND='node'; $env:JOB_AUTOMATION_TECTONIC_ARGS_JSON='["C:\\VScode\\JobAutomation\\tests\\fixtures\\documents\\tectonic-stub.mjs"]'; corepack pnpm --filter @jobautomation/api dev"`,
      port: apiPort,
      reuseExistingServer: false,
      timeout: 120000
    },
    {
      command: `${powershell} -NoLogo -NoProfile -Command "Set-Location 'C:\\VScode\\JobAutomation'; $env:API_BASE_URL='http://127.0.0.1:${apiPort}'; corepack pnpm --filter @jobautomation/dashboard dev --hostname 127.0.0.1 --port ${dashboardPort}"`,
      port: dashboardPort,
      reuseExistingServer: false,
      timeout: 120000
    }
  ]
});

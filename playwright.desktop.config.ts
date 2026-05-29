import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@playwright/test';

const workspaceRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './tests/apps/desktop',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  use: {
    trace: 'retain-on-failure'
  },
  metadata: {
    workspaceRoot,
    desktopRoot: path.join(workspaceRoot, 'apps', 'desktop')
  }
});

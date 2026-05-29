import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect, _electron as electron } from '@playwright/test';

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
);
const desktopRoot = path.join(workspaceRoot, 'apps', 'desktop');
const desktopMainEntry = path.join(desktopRoot, 'dist', 'main', 'index.js');
const requireFromDesktop = createRequire(path.join(desktopRoot, 'package.json'));
const electronExecutable = requireFromDesktop('electron');

test.fixme(
  true,
  'Playwright electron.launch still times out under the current Electron 37 desktop runtime; scaffold retained for final verification.'
);

test('desktop shell boots and reaches the autopilot page', async () => {
  const electronApp = await electron.launch({
    executablePath: electronExecutable,
    args: [desktopMainEntry],
    cwd: desktopRoot,
    env: {
      ...process.env,
      JOB_AUTOMATION_DESKTOP_DEBUG: '1',
      JOB_AUTOMATION_DESKTOP_TEST: '1',
      JOB_AUTOMATION_DISABLE_AUTO_UPDATES: '1'
    }
  });

  try {
    const page = await electronApp.firstWindow();

    await expect(page.getByText('Desktop Control Panel')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Autopilot' })).toBeVisible();

    const apiPort = await page.evaluate(async () => window.electronAPI?.getApiPort?.() ?? null);
    expect(apiPort).not.toBeNull();

    const health = await page.evaluate(async () => {
      const port = await window.electronAPI?.getApiPort?.();
      if (!port) {
        return null;
      }

      const response = await fetch(`http://127.0.0.1:${port}/health`);
      return response.ok;
    });

    expect(health).toBe(true);
  } finally {
    await electronApp.close();
  }
});

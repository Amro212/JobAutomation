import { beforeEach, describe, expect, test, vi } from 'vitest';

import { createBrowserWithCamoufoxLauncher } from '../../../packages/automation/src/playwright/browser';

describe('Camoufox browser runtime', () => {
  const camoufoxMock = vi.fn();

  beforeEach(() => {
    camoufoxMock.mockReset();
  });

  test('launches Camoufox with stealth defaults and caller launch options', async () => {
    const browser = { close: vi.fn() };
    camoufoxMock.mockResolvedValue(browser);

    await expect(
      createBrowserWithCamoufoxLauncher(camoufoxMock, {
        headless: false,
        timeout: 12_000,
        channel: 'msedge'
      })
    ).resolves.toBe(browser);

    expect(camoufoxMock).toHaveBeenCalledWith({
      headless: false,
      humanize: true,
      locale: 'en-US',
      os: 'windows',
      timeout: 12_000
    });
  });

  test('reports the Camoufox install command when the browser binary is missing', async () => {
    camoufoxMock.mockRejectedValue(new Error("Executable doesn't exist at C:/cache/camoufox"));

    await expect(createBrowserWithCamoufoxLauncher(camoufoxMock)).rejects.toThrow(
      'Camoufox browser binary is missing. Run `corepack pnpm browser:install` from the repository root.'
    );
  });
});

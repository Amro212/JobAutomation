import path from 'node:path';

import { beforeEach, describe, expect, test, vi } from 'vitest';

import {
  buildBrowserIdentityConfig,
  createApplicationBrowserRuntime,
  createBrowserWithCamoufoxLauncher
} from '../../../packages/automation/src/playwright/browser';

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

  test('builds persistent per-board apply profile paths under the configured profile root', () => {
    const identity = buildBrowserIdentityConfig({
      profileKind: 'apply',
      board: 'lever',
      profilesRootDir: 'C:/VScode/JobAutomation/data/browser-profiles'
    });

    expect(identity).toMatchObject({
      profileKind: 'apply',
      board: 'lever',
      os: 'windows',
      enableCache: true,
      humanize: true,
      headless: false
    });
    expect(identity.userDataDir).toBe(
      path.join('C:/VScode/JobAutomation/data/browser-profiles', 'apply', 'lever')
    );
  });

  test('launches application runtime through identity-aware Camoufox launchOptions and a persistent context', async () => {
    const persistentContext = {
      browser: vi.fn().mockReturnValue({ close: vi.fn() }),
      close: vi.fn()
    };
    const launchOptionsFactory = vi.fn().mockResolvedValue({
      executablePath: 'C:/camoufox/firefox.exe',
      firefoxUserPrefs: {
        'browser.cache.disk.enable': true
      }
    });
    const browserType = {
      launchPersistentContext: vi.fn().mockResolvedValue(persistentContext)
    };

    const runtime = await createApplicationBrowserRuntime({
      board: 'greenhouse',
      profilesRootDir: 'C:/VScode/JobAutomation/data/browser-profiles',
      browserType,
      launchOptionsFactory
    });

    expect(launchOptionsFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        os: 'windows',
        humanize: true,
        enable_cache: true,
        headless: false,
        locale: identityLocale(),
        firefox_user_prefs: expect.objectContaining({
          'browser.cache.disk.enable': true
        })
      })
    );
    expect(browserType.launchPersistentContext).toHaveBeenCalledWith(
      path.join('C:/VScode/JobAutomation/data/browser-profiles', 'apply', 'greenhouse'),
      expect.objectContaining({
        executablePath: 'C:/camoufox/firefox.exe'
      })
    );
    expect(runtime).toMatchObject({
      persistent: true,
      identity: expect.objectContaining({
        board: 'greenhouse',
        profileKind: 'apply'
      }),
      context: persistentContext
    });
  });
});

function identityLocale(): string {
  return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
}

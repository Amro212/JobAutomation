import path from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  resolveDefaultDbPath,
  resolveDesktopUserDataPath,
  shouldResetDevelopmentDbPath,
  shouldResetProductionDbPath
} from '../../../apps/desktop/src/main/config-paths';

describe('desktop config paths', () => {
  const appDataPath = 'C:\\Users\\amrom\\AppData\\Roaming';
  const workspaceRoot = 'C:\\Users\\amrom\\.codex\\worktrees\\e22e\\JobAutomation';

  test('uses separate production and development userData directories', () => {
    expect(resolveDesktopUserDataPath({ appDataPath, packaged: true })).toBe(
      path.join(appDataPath, 'JobAutomation')
    );
    expect(resolveDesktopUserDataPath({ appDataPath, packaged: false })).toBe(
      path.join(appDataPath, 'JobAutomationDev')
    );
  });

  test('resets production dbPath when persisted config points outside userData', () => {
    const userDataPath = path.join(appDataPath, 'JobAutomation');

    expect(
      shouldResetProductionDbPath({
        packaged: true,
        userDataPath,
        dbPath:
          'C:\\Users\\amrom\\.codex\\worktrees\\e22e\\JobAutomation\\data\\jobautomation.sqlite'
      })
    ).toBe(true);
    expect(resolveDefaultDbPath({ packaged: true, userDataPath, workspaceRoot })).toBe(
      path.join(userDataPath, 'jobautomation.sqlite')
    );
  });

  test('uses workspace data database for development by default', () => {
    expect(
      resolveDefaultDbPath({
        packaged: false,
        userDataPath: path.join(appDataPath, 'JobAutomationDev'),
        workspaceRoot
      })
    ).toBe(path.join(workspaceRoot, 'data', 'jobautomation.sqlite'));
  });

  test('uses userData database for production by default', () => {
    const userDataPath = path.join(appDataPath, 'JobAutomation');

    expect(
      resolveDefaultDbPath({
        packaged: true,
        userDataPath,
        workspaceRoot
      })
    ).toBe(path.join(userDataPath, 'jobautomation.sqlite'));
  });

  test('keeps production dbPath when it already lives inside userData', () => {
    const userDataPath = path.join(appDataPath, 'JobAutomation');

    expect(
      shouldResetProductionDbPath({
        packaged: true,
        userDataPath,
        dbPath: path.join(userDataPath, 'jobautomation.sqlite')
      })
    ).toBe(false);
  });

  test('does not reset development dbPath', () => {
    expect(
      shouldResetProductionDbPath({
        packaged: false,
        userDataPath: path.join(appDataPath, 'JobAutomationDev'),
        dbPath:
          'C:\\Users\\amrom\\.codex\\worktrees\\e22e\\JobAutomation\\data\\jobautomation.sqlite'
      })
    ).toBe(false);
  });

  test('resets development dbPath only when it points at the empty dev userData default', () => {
    const userDataPath = path.join(appDataPath, 'JobAutomationDev');

    expect(
      shouldResetDevelopmentDbPath({
        packaged: false,
        userDataPath,
        dbPath: path.join(userDataPath, 'jobautomation.sqlite')
      })
    ).toBe(true);

    expect(
      shouldResetDevelopmentDbPath({
        packaged: false,
        userDataPath,
        dbPath: path.join(workspaceRoot, 'data', 'jobautomation.sqlite')
      })
    ).toBe(false);
  });
});

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, test } from 'vitest';

import {
  readConfig,
  resolveAppDataPath
} from '../../../packages/config/src/env';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'jobautomation-config-'));
  tempDirs.push(dir);
  return dir;
}

describe('config file helpers', () => {
  test('reads config json and resolves relative database paths from the config directory', () => {
    const configDir = createTempDir();
    const configPath = join(configDir, 'desktop-config.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        API_PORT: 3012,
        JOB_AUTOMATION_DB_PATH: './state/jobautomation.sqlite'
      })
    );

    const config = readConfig(configPath);

    expect(config.API_PORT).toBe(3012);
    expect(config.JOB_AUTOMATION_DB_PATH).toBe(
      join(configDir, 'state', 'jobautomation.sqlite')
    );
  });

  test('resolves windows app data paths', () => {
    expect(
      resolveAppDataPath('JobAutomation', {
        platform: 'win32',
        env: {
          APPDATA: 'C:\\Users\\test\\AppData\\Roaming'
        }
      })
    ).toBe('C:\\Users\\test\\AppData\\Roaming\\JobAutomation');
  });

  test('resolves macOS app data paths', () => {
    expect(
      resolveAppDataPath('JobAutomation', {
        platform: 'darwin',
        env: {
          HOME: '/Users/tester'
        }
      })
    ).toBe('/Users/tester/Library/Application Support/JobAutomation');
  });
});

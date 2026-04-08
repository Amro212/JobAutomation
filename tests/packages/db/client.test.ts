import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { readEnv } from '../../../packages/config/src';
import { resolveDatabasePath } from '../../../packages/db/src/client';

describe('database path resolution', () => {
  test('resolves relative db paths from the repository root instead of process cwd', () => {
    const expectedPath = fileURLToPath(
      new URL('../../../data/jobautomation.sqlite', import.meta.url)
    );

    expect(
      readEnv({
        JOB_AUTOMATION_DB_PATH: './data/jobautomation.sqlite'
      }).JOB_AUTOMATION_DB_PATH
    ).toBe(expectedPath);

    expect(resolveDatabasePath('./data/jobautomation.sqlite')).toBe(expectedPath);
  });
});

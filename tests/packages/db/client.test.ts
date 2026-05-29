import { fileURLToPath } from 'node:url';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, test } from 'vitest';

import { readEnv } from '../../../packages/config/src';
import {
  createDatabaseClient,
  migrateDatabase,
  resolveDatabasePath
} from '../../../packages/db/src';

const createdPaths: string[] = [];
const trackedClients: Array<{ close: () => Promise<void> | void }> = [];

function createTestDatabasePath(): string {
  const path = fileURLToPath(
    new URL(`../../../data/test/${randomUUID()}.sqlite`, import.meta.url)
  );
  mkdirSync(dirname(path), { recursive: true });
  createdPaths.push(path);
  return path;
}

afterEach(async () => {
  for (const client of trackedClients.splice(0)) {
    await client.close();
  }

  for (const path of createdPaths.splice(0)) {
    try {
      rmSync(path, { force: true });
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EBUSY') {
        throw error;
      }
    }
  }
});

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

  test('migrates performance indexes needed by application recovery and run lookups', async () => {
    const db = createDatabaseClient(createTestDatabasePath());
    trackedClients.push(db.$client);
    await migrateDatabase(db);

    const indexes = await db.$client.execute(
      "select name from sqlite_master where type = 'index' order by name"
    );
    const indexNames = indexes.rows.map((row) => row.name);

    expect(indexNames).toEqual(
      expect.arrayContaining([
        'application_runs_status_updated_idx',
        'application_runs_job_status_idx',
        'discovery_runs_status_completed_idx',
        'log_events_discovery_run_idx',
        'artifacts_discovery_run_idx'
      ])
    );
  });
});

import { mkdirSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeEach, describe, expect, test } from 'vitest';

import { buildApp } from '../../../apps/api/src/app';

function createTestDatabasePath(): string {
  const path = fileURLToPath(
    new URL(`../../../data/test/${randomUUID()}.sqlite`, import.meta.url)
  );
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

describe('discovery source routes', () => {
  const originalDbPath = process.env.JOB_AUTOMATION_DB_PATH;
  const dbPath = createTestDatabasePath();

  beforeEach(() => {
    process.env.JOB_AUTOMATION_DB_PATH = dbPath;
  });

  const app = buildApp();

  afterAll(async () => {
    await app.close();
    process.env.JOB_AUTOMATION_DB_PATH = originalDbPath;

    try {
      rmSync(dbPath, { force: true });
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EBUSY') {
        throw error;
      }
    }
  });

  test('accepts playwright sources and persists a canonical absolute source url', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/discovery-sources',
      payload: {
        sourceKind: 'playwright',
        sourceKey: 'https://Example.com/careers/jobs?team=eng#open-roles',
        label: 'Example Careers',
        enabled: true
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().source.sourceKind).toBe('playwright');
    expect(response.json().source.sourceKey).toBe('https://example.com/careers/jobs?team=eng');
  });

  test('rejects stagehand as a persisted discovery source kind', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/discovery-sources',
      payload: {
        sourceKind: 'stagehand',
        sourceKey: 'https://example.com/careers/jobs',
        label: 'Stagehand Source',
        enabled: true
      }
    });

    expect(response.statusCode).toBe(400);
  });
});

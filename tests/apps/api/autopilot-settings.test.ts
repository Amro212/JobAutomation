import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildApp } from '../../../apps/api/src/app';

function createTestDatabasePath(): string {
  const path = fileURLToPath(
    new URL(`../../../data/test/${randomUUID()}.sqlite`, import.meta.url)
  );
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

describe('autopilot settings routes', () => {
  const originalDbPath = process.env.JOB_AUTOMATION_DB_PATH;
  const dbPath = createTestDatabasePath();

  process.env.JOB_AUTOMATION_DB_PATH = dbPath;

  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

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

  test('returns defaults on first GET and persists updates via PUT', async () => {
    const firstGet = await app.inject({
      method: 'GET',
      url: '/autopilot-settings'
    });

    expect(firstGet.statusCode).toBe(200);
    expect(firstGet.json().settings.config).toMatchObject({
      discoverySourceIds: [],
      applySiteKeys: ['greenhouse', 'lever', 'ashby'],
      maxJobsPerRun: null,
      forceFreshDiscovery: false,
      discoveryCacheHours: 3,
      artifactMode: 'both'
    });

    const updateResponse = await app.inject({
      method: 'PUT',
      url: '/autopilot-settings',
      payload: {
        applySiteKeys: ['greenhouse'],
        maxJobsPerRun: 5,
        forceFreshDiscovery: true,
        artifactMode: 'resume'
      }
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().settings.config).toMatchObject({
      applySiteKeys: ['greenhouse'],
      maxJobsPerRun: 5,
      forceFreshDiscovery: true,
      artifactMode: 'resume'
    });

    const secondGet = await app.inject({
      method: 'GET',
      url: '/autopilot-settings'
    });
    expect(secondGet.statusCode).toBe(200);
    expect(secondGet.json().settings.config).toMatchObject({
      applySiteKeys: ['greenhouse'],
      maxJobsPerRun: 5,
      forceFreshDiscovery: true,
      artifactMode: 'resume'
    });
  });
});

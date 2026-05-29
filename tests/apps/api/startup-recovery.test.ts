import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, test } from 'vitest';

import { buildApp } from '../../../apps/api/src/app';
import {
  ApplicationRunsRepository,
  JobsRepository,
  createDatabaseClient,
  migrateDatabase
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

describe('API startup recovery', () => {
  test('marks stale running application runs as retry on startup', async () => {
    const originalDbPath = process.env.JOB_AUTOMATION_DB_PATH;
    const dbPath = createTestDatabasePath();
    process.env.JOB_AUTOMATION_DB_PATH = dbPath;

    const setupDb = createDatabaseClient(dbPath);
    trackedClients.push(setupDb.$client);
    await migrateDatabase(setupDb);

    const jobsRepository = new JobsRepository(setupDb);
    const applicationRunsRepository = new ApplicationRunsRepository(setupDb);
    const job = await jobsRepository.upsert({
      sourceKind: 'lever',
      sourceId: `job-${randomUUID()}`,
      sourceUrl: 'https://jobs.lever.co/example/1',
      companyName: 'Example',
      title: 'Engineer',
      location: 'Remote',
      remoteType: 'remote',
      employmentType: 'full-time',
      compensationText: null,
      descriptionText: 'Build automation.',
      rawPayload: null,
      discoveryRunId: null,
      status: 'shortlisted',
      discoveredAt: new Date('2026-05-01T10:00:00.000Z'),
      updatedAt: new Date('2026-05-01T10:00:00.000Z')
    });
    const staleRun = await applicationRunsRepository.create({
      jobId: job.id,
      siteKey: 'lever',
      status: 'running',
      currentStep: 'starting',
      prefilterReasons: [],
      createdAt: new Date('2026-05-01T10:01:00.000Z'),
      startedAt: new Date('2026-05-01T10:01:00.000Z'),
      updatedAt: new Date('2026-05-01T10:01:00.000Z')
    });
    await setupDb.$client.close();
    trackedClients.pop();

    const app = buildApp();
    try {
      await app.ready();

      await expect(
        app.repositories.applicationRuns.findById(staleRun.id)
      ).resolves.toEqual(
        expect.objectContaining({
          status: 'retry',
          currentStep: 'retry_queued',
          stopReason: 'stale_startup_recovery'
        })
      );
    } finally {
      await app.close();
      if (originalDbPath === undefined) {
        delete process.env.JOB_AUTOMATION_DB_PATH;
      } else {
        process.env.JOB_AUTOMATION_DB_PATH = originalDbPath;
      }
    }
  });
});

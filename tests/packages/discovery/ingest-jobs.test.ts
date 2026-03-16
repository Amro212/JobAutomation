import { mkdirSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterEach, describe, expect, test } from 'vitest';

import ingestRuns from '../../fixtures/discovery/ingest-runs.json';
import {
  createDatabaseClient,
  DiscoveryRunsRepository,
  JobsRepository
} from '../../../packages/db/src';
import type { SourceAdapter } from '../../../packages/discovery/src/contracts/source-adapter';
import { normalizeJob } from '../../../packages/discovery/src/normalization/normalize-job';
import { ingestJobs } from '../../../packages/discovery/src/services/ingest-jobs';

const migrationsFolder = fileURLToPath(
  new URL('../../../packages/db/drizzle', import.meta.url)
);
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

const greenhouseAdapter: SourceAdapter<Record<string, unknown>> = {
  sourceKind: 'greenhouse',
  normalizeJob(sourceJob, context) {
    return normalizeJob(
      {
        sourceKind: 'greenhouse',
        ...sourceJob
      },
      context
    );
  }
};

const leverAdapter: SourceAdapter<Record<string, unknown>> = {
  sourceKind: 'lever',
  normalizeJob(sourceJob, context) {
    return normalizeJob(
      {
        sourceKind: 'lever',
        ...sourceJob
      },
      context
    );
  }
};

const ashbyAdapter: SourceAdapter<Record<string, unknown>> = {
  sourceKind: 'ashby',
  normalizeJob(sourceJob, context) {
    return normalizeJob(
      {
        sourceKind: 'ashby',
        ...sourceJob
      },
      context
    );
  }
};

describe('ingestJobs', () => {
  test('records discovery runs and updates existing jobs instead of duplicating them', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, { migrationsFolder });

    const jobsRepository = new JobsRepository(db);
    const runsRepository = new DiscoveryRunsRepository(db);

    const firstRun = await ingestJobs({
      adapter: greenhouseAdapter,
      jobs: ingestRuns.firstRun,
      jobsRepository,
      runsRepository,
      capturedAt: new Date('2026-03-13T10:00:00.000Z')
    });

    const secondRun = await ingestJobs({
      adapter: greenhouseAdapter,
      jobs: ingestRuns.secondRun,
      jobsRepository,
      runsRepository,
      capturedAt: new Date('2026-03-13T12:00:00.000Z')
    });

    const thirdRun = await ingestJobs({
      adapter: greenhouseAdapter,
      jobs: ingestRuns.secondRun,
      jobsRepository,
      runsRepository,
      capturedAt: new Date('2026-03-13T12:00:00.000Z')
    });

    const storedJobs = await jobsRepository.list();
    const storedRuns = await runsRepository.list();

    expect(firstRun.run.newJobCount).toBe(1);
    expect(firstRun.run.updatedJobCount).toBe(0);
    expect(secondRun.run.newJobCount).toBe(0);
    expect(secondRun.run.updatedJobCount).toBe(1);
    expect(thirdRun.run.updatedJobCount).toBe(0);
    expect(storedJobs).toHaveLength(1);
    expect(storedJobs[0]?.title).toBe('Senior Platform Engineer');
    expect(storedRuns).toHaveLength(3);
    expect(storedRuns[0]?.status).toBe('completed');
  });

  test('keeps records from different source kinds even when source ids overlap', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, { migrationsFolder });

    const jobsRepository = new JobsRepository(db);
    const runsRepository = new DiscoveryRunsRepository(db);

    await ingestJobs({
      adapter: greenhouseAdapter,
      jobs: [
        {
          sourceId: 'shared-id',
          sourceUrl: 'https://boards.greenhouse.io/example/jobs/shared-id',
          companyName: 'Greenhouse Example',
          title: 'Platform Engineer',
          location: 'Remote',
          remoteType: 'remote'
        }
      ],
      jobsRepository,
      runsRepository,
      capturedAt: new Date('2026-03-13T10:00:00.000Z')
    });

    await ingestJobs({
      adapter: leverAdapter,
      jobs: [
        {
          sourceId: 'shared-id',
          sourceUrl: 'https://jobs.lever.co/example/shared-id',
          companyName: 'Lever Example',
          title: 'Platform Engineer',
          location: 'Remote',
          remoteType: 'remote'
        }
      ],
      jobsRepository,
      runsRepository,
      capturedAt: new Date('2026-03-13T10:05:00.000Z')
    });

    await ingestJobs({
      adapter: ashbyAdapter,
      jobs: [
        {
          sourceId: 'shared-id',
          sourceUrl: 'https://jobs.ashbyhq.com/example/shared-id',
          companyName: 'Ashby Example',
          title: 'Platform Engineer',
          location: 'Remote',
          remoteType: 'remote'
        }
      ],
      jobsRepository,
      runsRepository,
      capturedAt: new Date('2026-03-13T10:10:00.000Z')
    });

    const storedJobs = await jobsRepository.list();

    expect(storedJobs).toHaveLength(3);
    expect(storedJobs.map((job) => job.sourceKind).sort()).toEqual([
      'ashby',
      'greenhouse',
      'lever'
    ]);
  });
});

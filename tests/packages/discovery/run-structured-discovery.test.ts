import { mkdirSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterEach, describe, expect, test } from 'vitest';

import greenhouseJobsResponse from '../../fixtures/discovery/greenhouse/jobs-response.json';
import {
  createDatabaseClient,
  DiscoveryRunsRepository,
  DiscoverySourcesRepository,
  JobsRepository,
  LogEventsRepository
} from '../../../packages/db/src';
import {
  retryDiscoveryStep,
  runStructuredDiscovery
} from '../../../packages/discovery/src';

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

describe('runStructuredDiscovery', () => {
  test('keeps successful source results and logs a partial failure', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, { migrationsFolder });

    const runsRepository = new DiscoveryRunsRepository(db);
    const jobsRepository = new JobsRepository(db);
    const logEventsRepository = new LogEventsRepository(db);

    const run = await runsRepository.create({
      sourceKind: 'structured',
      runKind: 'structured',
      triggerKind: 'manual',
      status: 'pending'
    });

    const greenhouseSource = {
      id: 'source-greenhouse',
      sourceKind: 'greenhouse' as const,
      sourceKey: 'acme',
      label: 'Acme Corp',
      enabled: true,
      createdAt: new Date('2026-03-14T00:00:00.000Z'),
      updatedAt: new Date('2026-03-14T00:00:00.000Z')
    };

    const leverSource = {
      id: 'source-lever',
      sourceKind: 'lever' as const,
      sourceKey: 'broken',
      label: 'Broken Lever',
      enabled: true,
      createdAt: new Date('2026-03-14T00:00:00.000Z'),
      updatedAt: new Date('2026-03-14T00:00:00.000Z')
    };

    const finalRun = await runStructuredDiscovery({
      run,
      sources: [greenhouseSource, leverSource],
      jobsRepository,
      runsRepository,
      logEventsRepository,
      greenhouseBaseUrl: 'https://boards-api.greenhouse.io/v1/boards',
      leverBaseUrl: 'https://api.lever.co/v0/postings',
      ashbyBaseUrl: 'https://api.ashbyhq.com/posting-api/job-board',
      fetchImpl: async (input) => {
        const url = String(input);

        if (url.includes('/acme/jobs')) {
          return new Response(JSON.stringify(greenhouseJobsResponse), {
            status: 200,
            headers: {
              'content-type': 'application/json'
            }
          });
        }

        throw new Error(`Unhandled fetch url ${url}`);
      },
      capturedAt: new Date('2026-03-14T01:00:00.000Z')
    });

    const { jobs } = await jobsRepository.list();
    const logs = await logEventsRepository.listByDiscoveryRun(run.id);

    expect(finalRun.status).toBe('partial');
    expect(finalRun.newJobCount).toBe(1);
    expect(finalRun.updatedJobCount).toBe(0);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.title).toBe('Senior Platform Engineer');
    expect(logs.map((entry) => entry.message)).toEqual([
      'Started discovery run.',
      'Starting greenhouse source Acme Corp.',
      'Completed greenhouse source Acme Corp.',
      'Starting lever source Broken Lever.',
      'Failed lever source Broken Lever.',
      'Completed discovery run with source failures.'
    ]);
  });

  test('creates a pending retry run and logs the request', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, { migrationsFolder });

    const runsRepository = new DiscoveryRunsRepository(db);
    const sourcesRepository = new DiscoverySourcesRepository(db);
    const logEventsRepository = new LogEventsRepository(db);

    const source = await sourcesRepository.upsert({
      sourceKind: 'greenhouse',
      sourceKey: 'acme',
      label: 'Acme Corp',
      enabled: true
    });

    const retryRun = await retryDiscoveryStep({
      source,
      runsRepository,
      logEventsRepository,
      requestedFromRun: null
    });

    const logs = await logEventsRepository.listByDiscoveryRun(retryRun.id);

    expect(retryRun.triggerKind).toBe('retry');
    expect(retryRun.status).toBe('pending');
    expect(retryRun.discoverySourceId).toBe(source.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.message).toBe('Queued retry for greenhouse source Acme Corp.');
  });
});



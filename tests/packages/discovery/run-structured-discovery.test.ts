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
    const sourcesRepository = new DiscoverySourcesRepository(db);
    const jobsRepository = new JobsRepository(db);
    const logEventsRepository = new LogEventsRepository(db);

    const run = await runsRepository.create({
      sourceKind: 'structured',
      runKind: 'structured',
      triggerKind: 'manual',
      status: 'pending'
    });

    const greenhouseSource = await sourcesRepository.upsert({
      sourceKind: 'greenhouse',
      sourceKey: 'acme',
      label: 'Acme Corp',
      enabled: true
    });

    const leverSource = await sourcesRepository.upsert({
      sourceKind: 'lever',
      sourceKey: 'broken',
      label: 'Broken Lever',
      enabled: true
    });

    const finalRun = await runStructuredDiscovery({
      run,
      sources: [greenhouseSource, leverSource],
      sourcesRepository,
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

  test('removes invalid structured sources when their feed is gone', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, { migrationsFolder });

    const runsRepository = new DiscoveryRunsRepository(db);
    const sourcesRepository = new DiscoverySourcesRepository(db);
    const jobsRepository = new JobsRepository(db);
    const logEventsRepository = new LogEventsRepository(db);

    const run = await runsRepository.create({
      sourceKind: 'structured',
      runKind: 'structured',
      triggerKind: 'manual',
      status: 'pending'
    });

    const source = await sourcesRepository.upsert({
      sourceKind: 'greenhouse',
      sourceKey: 'gone-company',
      label: 'Gone Company',
      enabled: true
    });
    const historicalRun = await runsRepository.create({
      sourceKind: 'greenhouse',
      runKind: 'single-source',
      triggerKind: 'manual',
      discoverySourceId: source.id,
      status: 'completed'
    });

    const finalRun = await runStructuredDiscovery({
      run,
      sources: [source],
      sourcesRepository,
      jobsRepository,
      runsRepository,
      logEventsRepository,
      greenhouseBaseUrl: 'https://boards-api.greenhouse.io/v1/boards',
      leverBaseUrl: 'https://api.lever.co/v0/postings',
      ashbyBaseUrl: 'https://api.ashbyhq.com/posting-api/job-board',
      fetchImpl: async () =>
        new Response(JSON.stringify({ message: 'not found' }), {
          status: 404,
          headers: {
            'content-type': 'application/json'
          }
        })
    });

    const remainingSource = await sourcesRepository.findById(source.id);
    const storedHistoricalRun = await runsRepository.findById(historicalRun.id);
    const logs = await logEventsRepository.listByDiscoveryRun(run.id);

    expect(finalRun.status).toBe('completed');
    expect(remainingSource).toBeNull();
    expect(storedHistoricalRun?.discoverySourceId).toBeNull();
    expect(logs.map((entry) => entry.message)).toContain(
      'Removed invalid greenhouse source Gone Company.'
    );
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



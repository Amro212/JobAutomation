import { createServer } from 'node:http';
import { mkdirSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  ArtifactsRepository,
  DiscoveryRunsRepository,
  DiscoverySourcesRepository,
  JobsRepository,
  LogEventsRepository,
  createDatabaseClient,
  migrateDatabase
} from '../../../packages/db/src';
import {
  createFallbackEscalation
} from '../../../packages/automation/src/discovery/fallback-escalation';
import { runPlaywrightDiscovery } from '../../../packages/automation/src/discovery/playwright-discovery-adapter';
import type { StagehandExtractionClient } from '../../../packages/automation/src/stagehand/stagehand-client';

function createTestDatabasePath(): string {
  const path = fileURLToPath(
    new URL(`../../../data/test/${randomUUID()}.sqlite`, import.meta.url)
  );
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

function createArtifactsDir(): string {
  const path = fileURLToPath(
    new URL(`../../../data/test-artifacts/${randomUUID()}`, import.meta.url)
  );
  mkdirSync(path, { recursive: true });
  return path;
}

describe('stagehand-assisted fallback discovery', () => {
  const dbPath = createTestDatabasePath();
  const artifactsRootDir = createArtifactsDir();
  const db = createDatabaseClient(dbPath);
  const jobsRepository = new JobsRepository(db);
  const runsRepository = new DiscoveryRunsRepository(db);
  const sourcesRepository = new DiscoverySourcesRepository(db);
  const logEventsRepository = new LogEventsRepository(db);
  const artifactsRepository = new ArtifactsRepository(db);
  let server: ReturnType<typeof createServer> | null = null;
  let baseUrl = '';

  beforeEach(async () => {
    await migrateDatabase(db);
    server = createServer((request, response) => {
      const url = request.url ?? '/';

      if (url === '/jobs') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end(`
          <html>
            <body>
              <main data-job-listings>
                <article data-job-card>
                  <a href="/jobs/ambiguous-role" data-job-detail>Ambiguous Role</a>
                </article>
              </main>
            </body>
          </html>
        `);
        return;
      }

      if (url === '/jobs/ambiguous-role') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end(`
          <html>
            <body>
              <article data-job-detail-page>
                <div data-company-name>Fallback Corp</div>
                <div data-job-location>Toronto, ON</div>
                <section data-job-description>Stagehand should recover the missing title.</section>
              </article>
            </body>
          </html>
        `);
        return;
      }

      response.writeHead(404, { 'content-type': 'text/html' });
      response.end('<html><body>Not found</body></html>');
    });

    await new Promise<void>((resolve, reject) => {
      server?.listen(0, '127.0.0.1', (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        const address = server?.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Test server address was not available.'));
          return;
        }

        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }

    server = null;
  });

  afterAll(async () => {
    await db.$client.close();
    try {
      rmSync(dbPath, { force: true });
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EBUSY') {
        throw error;
      }
    }
    rmSync(artifactsRootDir, { recursive: true, force: true });
  });

  test('escalates through the single Stagehand seam only when deterministic extraction is ambiguous', async () => {
    const source = await sourcesRepository.upsert({
      sourceKind: 'playwright',
      sourceKey: `${baseUrl}/jobs`,
      label: 'Fallback Careers',
      enabled: true
    });
    const run = await runsRepository.create({
      sourceKind: 'playwright',
      discoverySourceId: source.id,
      status: 'pending'
    });
    const createClient = vi.fn(async (): Promise<StagehandExtractionClient> => ({
      async extractJob() {
        return {
          title: 'Recovered Platform Engineer',
          companyName: 'Fallback Corp',
          sourceId: 'stagehand-001',
          location: 'Toronto, ON',
          remoteType: 'hybrid',
          employmentType: 'Full-time',
          compensationText: '$150k',
          descriptionText: 'Recovered via Stagehand',
          sourceUrl: `${baseUrl}/jobs/ambiguous-role`
        };
      },
      async close() {}
    }));
    const escalate = createFallbackEscalation({
      createClient
    });

    const result = await runPlaywrightDiscovery({
      run,
      source,
      jobsRepository,
      runsRepository,
      logEventsRepository,
      artifactsRepository,
      artifactsRootDir,
      escalate
    });

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('completed');

    const jobs = await jobsRepository.list({ sourceKind: 'playwright' });
    expect(jobs).toHaveLength(1);
    expect(JSON.parse(jobs[0]!.rawPayload ?? '{}')).toMatchObject({
      fallbackMode: 'stagehand',
      stagehandUsed: true,
      extractorId: 'generic-listing'
    });

    const artifacts = await artifactsRepository.listByDiscoveryRun(run.id);
    expect(artifacts.some((artifact) => artifact.kind === 'fallback-stagehand-output')).toBe(true);

    const logs = await logEventsRepository.listByDiscoveryRun(run.id);
    expect(
      logs.some((entry) => {
        const details = JSON.parse(entry.detailsJson ?? '{}') as Record<string, unknown>;
        return details.fallbackMode === 'stagehand' && details.stagehandUsed === true;
      })
    ).toBe(true);
  });

  test('rejects invalid Stagehand output and leaves the run inspectably failed', async () => {
    const source = await sourcesRepository.upsert({
      sourceKind: 'playwright',
      sourceKey: `${baseUrl}/jobs`,
      label: 'Broken Careers',
      enabled: true
    });
    const run = await runsRepository.create({
      sourceKind: 'playwright',
      discoverySourceId: source.id,
      status: 'pending'
    });
    const escalate = createFallbackEscalation({
      createClient: async (): Promise<StagehandExtractionClient> => ({
        async extractJob() {
          return {
            title: '',
            companyName: 'Fallback Corp'
          };
        },
        async close() {}
      })
    });

    const result = await runPlaywrightDiscovery({
      run,
      source,
      jobsRepository,
      runsRepository,
      logEventsRepository,
      artifactsRepository,
      artifactsRootDir,
      escalate
    });

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('Stagehand extraction failed validation');

    const artifacts = await artifactsRepository.listByDiscoveryRun(run.id);
    expect(artifacts.some((artifact) => artifact.kind === 'fallback-stagehand-output')).toBe(true);

    const logs = await logEventsRepository.listByDiscoveryRun(run.id);
    const failureLog = logs.find((entry) => entry.level === 'error');
    expect(failureLog).toBeDefined();
    expect(JSON.parse(failureLog!.detailsJson ?? '{}')).toMatchObject({
      fallbackMode: 'stagehand',
      stagehandUsed: true,
      errorMessage: expect.stringContaining('Stagehand extraction failed validation')
    });
  });
});

import { createServer } from 'node:http';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

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

import { runPlaywrightDiscovery } from '../../../packages/automation/src/discovery/playwright-discovery-adapter';

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

describe('playwright fallback discovery', () => {
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
                  <a href="/jobs/platform-engineer" data-job-detail>Platform Engineer</a>
                </article>
              </main>
            </body>
          </html>
        `);
        return;
      }

      if (url === '/jobs/platform-engineer') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end(`
          <html>
            <body>
              <article data-job-detail-page>
                <h1 data-job-title>Senior Platform Engineer</h1>
                <div data-company-name>Example Corp</div>
                <div data-job-location>Toronto, ON</div>
                <div data-job-id>platform-001</div>
                <section data-job-description>Build reliable automation systems.</section>
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

  test('discovers jobs through deterministic Playwright extraction and keeps the escalation seam dormant', async () => {
    const source = await sourcesRepository.upsert({
      sourceKind: 'playwright',
      sourceKey: `${baseUrl}/jobs`,
      label: 'Example Careers',
      enabled: true
    });
    const run = await runsRepository.create({
      sourceKind: 'playwright',
      discoverySourceId: source.id,
      status: 'pending'
    });
    const escalate = vi.fn().mockResolvedValue(null);

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

    expect(escalate).not.toHaveBeenCalled();
    expect(result.status).toBe('completed');

    const jobs = await jobsRepository.list({
      sourceKind: 'playwright'
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.sourceKind).toBe('playwright');
    expect(jobs[0]?.sourceId).toBe('platform-001');
    expect(jobs[0]?.sourceUrl).toBe(`${baseUrl}/jobs/platform-engineer`);

    const rawPayload = JSON.parse(jobs[0]!.rawPayload ?? '{}') as Record<string, unknown>;
    expect(rawPayload).toMatchObject({
      sourcePageUrl: `${baseUrl}/jobs`,
      detailPageUrl: `${baseUrl}/jobs/platform-engineer`,
      extractorId: 'generic-listing',
      fallbackMode: 'playwright',
      stagehandUsed: false
    });

    const artifacts = await artifactsRepository.listByDiscoveryRun(run.id);
    expect(artifacts.map((artifact) => artifact.kind).sort()).toEqual([
      'fallback-page-html',
      'fallback-screenshot',
      'fallback-trace'
    ]);
  });

  test('persists evidence and failure logs when deterministic Playwright extraction cannot produce a valid job', async () => {
    server?.removeAllListeners('request');
    server?.on('request', (request, response) => {
      const url = request.url ?? '/';

      if (url === '/jobs') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end(`
          <html>
            <body>
              <main data-job-listings>
                <article data-job-card>
                  <a href="/jobs/broken-role" data-job-detail>Broken Role</a>
                </article>
              </main>
            </body>
          </html>
        `);
        return;
      }

      if (url === '/jobs/broken-role') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end(`
          <html>
            <body>
              <article data-job-detail-page>
                <div data-company-name>Example Corp</div>
                <section data-job-description>Missing title should fail deterministic extraction.</section>
              </article>
            </body>
          </html>
        `);
        return;
      }

      response.writeHead(404, { 'content-type': 'text/html' });
      response.end('<html><body>Not found</body></html>');
    });

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

    const result = await runPlaywrightDiscovery({
      run,
      source,
      jobsRepository,
      runsRepository,
      logEventsRepository,
      artifactsRepository,
      artifactsRootDir,
      escalate: vi.fn().mockResolvedValue(null)
    });

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('Missing required job fields');

    const logs = await logEventsRepository.listByDiscoveryRun(run.id);
    const failureLog = logs.find((entry) => entry.level === 'error');
    expect(failureLog).toBeDefined();
    expect(JSON.parse(failureLog!.detailsJson ?? '{}')).toMatchObject({
      discoverySourceId: source.id,
      sourceKind: 'playwright',
      sourceKey: `${baseUrl}/jobs`,
      label: 'Broken Careers',
      pageUrl: `${baseUrl}/jobs/broken-role`,
      extractorId: 'generic-listing',
      fallbackMode: 'playwright',
      errorMessage: expect.stringContaining('Missing required job fields')
    });

    const artifacts = await artifactsRepository.listByDiscoveryRun(run.id);
    expect(artifacts.some((artifact) => artifact.kind === 'fallback-screenshot')).toBe(true);
    expect(artifacts.some((artifact) => artifact.kind === 'fallback-page-html')).toBe(true);
    expect(artifacts.some((artifact) => artifact.kind === 'fallback-trace')).toBe(true);
  });
});

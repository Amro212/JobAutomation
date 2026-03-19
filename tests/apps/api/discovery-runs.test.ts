import { mkdirSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import ashbyJobsResponse from '../../fixtures/discovery/ashby/jobs-response.json';
import greenhouseJobsResponse from '../../fixtures/discovery/greenhouse/jobs-response.json';
import leverJobsResponse from '../../fixtures/discovery/lever/jobs-response.json';
import { buildApp } from '../../../apps/api/src/app';

function createTestDatabasePath(): string {
  const path = fileURLToPath(
    new URL(`../../../data/test/${randomUUID()}.sqlite`, import.meta.url)
  );
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

describe('discovery run routes', () => {
  const originalDbPath = process.env.JOB_AUTOMATION_DB_PATH;
  const dbPath = createTestDatabasePath();

  beforeEach(() => {
    process.env.JOB_AUTOMATION_DB_PATH = dbPath;
    process.env.GREENHOUSE_API_BASE_URL = 'https://boards-api.greenhouse.io/v1/boards';
    process.env.LEVER_API_BASE_URL = 'https://api.lever.co/v0/postings';
    process.env.ASHBY_API_BASE_URL = 'https://api.ashbyhq.com/posting-api/job-board';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

  test('queues a greenhouse run and exposes run detail logs after ingestion completes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(greenhouseJobsResponse), {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        })
      )
    );

    const createSourceResponse = await app.inject({
      method: 'POST',
      url: '/discovery-sources',
      payload: {
        sourceKind: 'greenhouse',
        sourceKey: 'acme',
        label: 'Acme Corp',
        enabled: true
      }
    });

    const runResponse = await app.inject({
      method: 'POST',
      url: '/discovery-runs',
      payload: {
        sourceIds: [createSourceResponse.json().source.id]
      }
    });

    expect(runResponse.statusCode).toBe(200);
    expect(runResponse.json().runs).toHaveLength(1);
    expect(runResponse.json().runs[0].status).toBe('pending');
    expect(runResponse.json().runs[0].runKind).toBe('single-source');

    await app.discoveryQueue.onIdle();

    const artifact = await app.repositories.artifacts.create({
      jobId: null,
      discoveryRunId: runResponse.json().runs[0].id,
      kind: 'fallback-screenshot',
      format: 'png',
      fileName: 'evidence.png',
      storagePath: 'artifacts/fallback/evidence.png',
      createdAt: new Date()
    });

    const jobsResponse = await app.inject({ method: 'GET', url: '/jobs' });
    const runDetailResponse = await app.inject({
      method: 'GET',
      url: `/discovery-runs/${runResponse.json().runs[0].id}`
    });

    expect(jobsResponse.json().jobs).toHaveLength(1);
    expect(jobsResponse.json().jobs[0].companyName).toBe('Acme Corp');
    expect(jobsResponse.json().jobs[0].title).toBe('Senior Platform Engineer');
    expect(runDetailResponse.statusCode).toBe(200);
    expect(runDetailResponse.json().run.status).toBe('completed');
    expect(runDetailResponse.json().artifacts).toEqual([
      expect.objectContaining({
        id: artifact.id,
        kind: 'fallback-screenshot',
        format: 'png',
        storagePath: 'artifacts/fallback/evidence.png'
      })
    ]);
    expect(runDetailResponse.json().logs.map((log: { message: string }) => log.message)).toEqual([
      'Queued manual discovery run.',
      'Started discovery run.',
      'Starting greenhouse source Acme Corp.',
      'Completed greenhouse source Acme Corp.',
      'Completed discovery run.'
    ]);
  });

  test('normalizes source urls and ingests greenhouse, lever, and ashby jobs through one structured queued run', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request) => {
        const url = String(input);

        if (url.includes('boards-api.greenhouse.io')) {
          return Promise.resolve(
            new Response(JSON.stringify(greenhouseJobsResponse), {
              status: 200,
              headers: {
                'content-type': 'application/json'
              }
            })
          );
        }

        if (url.includes('api.lever.co')) {
          return Promise.resolve(
            new Response(JSON.stringify(leverJobsResponse), {
              status: 200,
              headers: {
                'content-type': 'application/json'
              }
            })
          );
        }

        if (url.includes('api.ashbyhq.com')) {
          return Promise.resolve(
            new Response(JSON.stringify(ashbyJobsResponse), {
              status: 200,
              headers: {
                'content-type': 'application/json'
              }
            })
          );
        }

        return Promise.reject(new Error(`Unhandled fetch url ${url}`));
      })
    );

    const greenhouseSourceResponse = await app.inject({
      method: 'POST',
      url: '/discovery-sources',
      payload: {
        sourceKind: 'greenhouse',
        sourceKey: 'https://job-boards.greenhouse.io/greenhouse',
        label: 'Greenhouse',
        enabled: true
      }
    });

    const leverSourceResponse = await app.inject({
      method: 'POST',
      url: '/discovery-sources',
      payload: {
        sourceKind: 'lever',
        sourceKey: 'https://jobs.lever.co/dnb',
        label: 'Dun & Bradstreet',
        enabled: true
      }
    });

    const ashbySourceResponse = await app.inject({
      method: 'POST',
      url: '/discovery-sources',
      payload: {
        sourceKind: 'ashby',
        sourceKey: 'https://jobs.ashbyhq.com/ashby',
        label: 'Ashby',
        enabled: true
      }
    });

    const runResponse = await app.inject({
      method: 'POST',
      url: '/discovery-runs',
      payload: {
        sourceIds: [
          greenhouseSourceResponse.json().source.id,
          leverSourceResponse.json().source.id,
          ashbySourceResponse.json().source.id
        ]
      }
    });

    expect(runResponse.statusCode).toBe(200);
    expect(runResponse.json().runs).toHaveLength(1);
    expect(runResponse.json().runs[0].sourceKind).toBe('structured');
    expect(runResponse.json().runs[0].runKind).toBe('structured');

    await app.discoveryQueue.onIdle();

    const jobsResponse = await app.inject({ method: 'GET', url: '/jobs' });
    const runsResponse = await app.inject({ method: 'GET', url: '/discovery-runs' });

    expect(jobsResponse.json().jobs.some((job: { title: string }) => job.title === "Don't see what you're looking for?")).toBe(false);
    expect(jobsResponse.json().jobs.some((job: { title: string }) => job.title === 'Account Executive II, SLED (R-18831)')).toBe(true);
    expect(jobsResponse.json().jobs.some((job: { title: string }) => job.title === 'Engineer Who Can Design, Americas')).toBe(true);
    expect(runsResponse.json().runs).toHaveLength(2);
    expect(runsResponse.json().runs[0].status).toBe('completed');
  });

  test('queues a retry run for a specific source step', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(greenhouseJobsResponse), {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        })
      )
    );

    const sourceResponse = await app.inject({
      method: 'POST',
      url: '/discovery-sources',
      payload: {
        sourceKind: 'greenhouse',
        sourceKey: 'acme-retry',
        label: 'Retry Acme',
        enabled: true
      }
    });

    const originalRun = await app.repositories.discoveryRuns.create({
      sourceKind: 'structured',
      runKind: 'structured',
      triggerKind: 'manual',
      status: 'failed'
    });

    const retryResponse = await app.inject({
      method: 'POST',
      url: `/discovery-runs/${originalRun.id}/retry`,
      payload: {
        sourceId: sourceResponse.json().source.id
      }
    });

    expect(retryResponse.statusCode).toBe(200);
    expect(retryResponse.json().run.triggerKind).toBe('retry');
    expect(retryResponse.json().run.status).toBe('pending');

    await app.discoveryQueue.onIdle();

    const retriedRun = await app.inject({
      method: 'GET',
      url: `/discovery-runs/${retryResponse.json().run.id}`
    });

    expect(retriedRun.json().run.status).toBe('completed');
    expect(retriedRun.json().logs.some((log: { message: string }) => log.message === 'Queued retry for greenhouse source Retry Acme.')).toBe(true);
  });

  test('does not report unchanged lever jobs as updated on rerun', async () => {
    const rerunLeverJobs = leverJobsResponse.map((job) => ({
      ...job,
      id: `rerun-${job.id}`,
      hostedUrl: `${job.hostedUrl}-rerun`
    }));

    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request) => {
        const url = String(input);

        if (url.includes('api.lever.co')) {
          return Promise.resolve(
            new Response(JSON.stringify(rerunLeverJobs), {
              status: 200,
              headers: {
                'content-type': 'application/json'
              }
            })
          );
        }

        return Promise.reject(new Error(`Unhandled fetch url ${url}`));
      })
    );

    const sourceResponse = await app.inject({
      method: 'POST',
      url: '/discovery-sources',
      payload: {
        sourceKind: 'lever',
        sourceKey: 'dnb-rerun',
        label: 'DnB Rerun',
        enabled: true
      }
    });

    const firstRunResponse = await app.inject({
      method: 'POST',
      url: '/discovery-runs',
      payload: {
        sourceIds: [sourceResponse.json().source.id]
      }
    });

    await app.discoveryQueue.onIdle();

    const firstRunDetailResponse = await app.inject({
      method: 'GET',
      url: `/discovery-runs/${firstRunResponse.json().runs[0].id}`
    });

    expect(firstRunDetailResponse.json().run.newJobCount).toBe(2);
    expect(firstRunDetailResponse.json().run.updatedJobCount).toBe(0);

    const secondRunResponse = await app.inject({
      method: 'POST',
      url: '/discovery-runs',
      payload: {
        sourceIds: [sourceResponse.json().source.id]
      }
    });

    await app.discoveryQueue.onIdle();

    const secondRunDetailResponse = await app.inject({
      method: 'GET',
      url: `/discovery-runs/${secondRunResponse.json().runs[0].id}`
    });

    expect(secondRunDetailResponse.json().run.newJobCount).toBe(0);
    expect(secondRunDetailResponse.json().run.updatedJobCount).toBe(0);
  });

  test('queues a playwright fallback run and persists jobs, logs, and artifacts through the shared run detail route', async () => {
    const server = createServer((request, response) => {
      const url = request.url ?? '/';

      if (url === '/jobs') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end(`
          <html>
            <body>
              <main data-job-listings>
                <article data-job-card>
                  <a href="/jobs/fallback-platform-engineer" data-job-detail>Fallback Platform Engineer</a>
                </article>
              </main>
            </body>
          </html>
        `);
        return;
      }

      if (url === '/jobs/fallback-platform-engineer') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end(`
          <html>
            <body>
              <article data-job-detail-page>
                <h1 data-job-title>Fallback Platform Engineer</h1>
                <div data-company-name>Fallback Corp</div>
                <div data-job-location>Toronto, ON</div>
                <div data-job-id>fallback-001</div>
                <section data-job-description>Deterministic browser fallback extraction.</section>
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
      server.listen(0, '127.0.0.1', (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Test server address was not available.');
      }

      const sourceUrl = `http://127.0.0.1:${address.port}/jobs`;
      const createSourceResponse = await app.inject({
        method: 'POST',
        url: '/discovery-sources',
        payload: {
          sourceKind: 'playwright',
          sourceKey: sourceUrl,
          label: 'Fallback Careers',
          enabled: true
        }
      });

      const runResponse = await app.inject({
        method: 'POST',
        url: '/discovery-runs',
        payload: {
          sourceIds: [createSourceResponse.json().source.id]
        }
      });

      await app.discoveryQueue.onIdle();

      const jobsResponse = await app.inject({ method: 'GET', url: '/jobs?sourceKind=playwright' });
      const runDetailResponse = await app.inject({
        method: 'GET',
        url: `/discovery-runs/${runResponse.json().runs[0].id}`
      });

      expect(jobsResponse.statusCode).toBe(200);
      expect(jobsResponse.json().jobs).toHaveLength(1);
      expect(jobsResponse.json().jobs[0].sourceKind).toBe('playwright');
      expect(JSON.parse(jobsResponse.json().jobs[0].rawPayload)).toMatchObject({
        sourcePageUrl: sourceUrl,
        detailPageUrl: `http://127.0.0.1:${address.port}/jobs/fallback-platform-engineer`,
        extractorId: 'generic-listing',
        fallbackMode: 'playwright',
        stagehandUsed: false
      });
      expect(runDetailResponse.json().run.status).toBe('completed');
      expect(runDetailResponse.json().artifacts.some((artifact: { kind: string }) => artifact.kind === 'fallback-trace')).toBe(true);
      expect(runDetailResponse.json().logs.some((log: { message: string }) => log.message === 'Completed playwright source Fallback Careers.')).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  });
});

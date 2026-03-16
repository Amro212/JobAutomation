import { createServer } from 'node:http';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, test } from 'vitest';

import { buildApp } from '../../../apps/api/src/app';
import type { FastifyInstance } from 'fastify';

type TestAppHandle = {
  app: FastifyInstance;
  dbPath: string;
  restoreEnv: () => void;
};

function createTestDatabasePath(): string {
  const path = fileURLToPath(
    new URL(`../../../data/test/${randomUUID()}.sqlite`, import.meta.url)
  );
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

async function createTestApp(
  envOverrides: Record<string, string | undefined> = {}
): Promise<TestAppHandle> {
  const dbPath = createTestDatabasePath();
  const keys = ['JOB_AUTOMATION_DB_PATH', ...Object.keys(envOverrides)];
  const original = new Map<string, string | undefined>();

  for (const key of keys) {
    original.set(key, process.env[key]);
  }

  process.env.JOB_AUTOMATION_DB_PATH = dbPath;

  for (const [key, value] of Object.entries(envOverrides)) {
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  const app = buildApp();
  await app.ready();

  return {
    app,
    dbPath,
    restoreEnv: () => {
      for (const [key, value] of original.entries()) {
        if (value == null) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  };
}

const activeApps: TestAppHandle[] = [];
const activeServers: Array<{
  close: () => Promise<void>;
}> = [];

afterEach(async () => {
  for (const server of activeServers.splice(0)) {
    await server.close();
  }

  for (const handle of activeApps.splice(0)) {
    await handle.app.close();
    handle.restoreEnv();

    try {
      rmSync(handle.dbPath, { force: true });
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EBUSY') {
        throw error;
      }
    }
  }
});

describe('job review routes', () => {
  test('persists review notes and shortlist transitions', async () => {
    const handle = await createTestApp();
    activeApps.push(handle);

    const job = await handle.app.repositories.jobs.upsert({
      sourceKind: 'greenhouse',
      sourceId: 'job-123',
      sourceUrl: 'https://boards.greenhouse.io/example/jobs/123',
      companyName: 'Example Corp',
      title: 'Senior Platform Engineer',
      location: 'Remote - Canada',
      remoteType: 'remote',
      employmentType: 'full-time',
      compensationText: '$170k-$190k CAD',
      descriptionText: 'Build the local-first discovery pipeline.',
      rawPayload: '{"id":"job-123"}',
      discoveryRunId: null,
      status: 'discovered',
      reviewNotes: '',
      reviewSummary: null,
      reviewScore: null,
      reviewScoreReasoning: null,
      reviewUpdatedAt: null,
      reviewScoreUpdatedAt: null,
      discoveredAt: new Date('2026-03-15T09:00:00.000Z'),
      updatedAt: new Date('2026-03-15T09:00:00.000Z')
    });

    const updateResponse = await handle.app.inject({
      method: 'PATCH',
      url: `/job-reviews/${job.id}`,
      payload: {
        status: 'reviewing',
        reviewNotes: 'High-signal local-first fit.'
      }
    });
    const shortlistResponse = await handle.app.inject({
      method: 'POST',
      url: `/job-reviews/${job.id}/shortlist`
    });
    const removeShortlistResponse = await handle.app.inject({
      method: 'DELETE',
      url: `/job-reviews/${job.id}/shortlist`
    });
    const persisted = await handle.app.repositories.jobs.findById(job.id);

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().job.reviewNotes).toBe('High-signal local-first fit.');
    expect(updateResponse.json().job.status).toBe('reviewing');
    expect(shortlistResponse.statusCode).toBe(200);
    expect(shortlistResponse.json().job.status).toBe('shortlisted');
    expect(removeShortlistResponse.statusCode).toBe(200);
    expect(removeShortlistResponse.json().job.status).toBe('reviewing');
    expect(persisted?.reviewNotes).toBe('High-signal local-first fit.');
  });

  test('disables scoring gracefully when OpenRouter config is missing', async () => {
    const handle = await createTestApp({
      OPENROUTER_API_KEY: undefined
    });
    activeApps.push(handle);

    const job = await handle.app.repositories.jobs.upsert({
      sourceKind: 'lever',
      sourceId: 'job-456',
      sourceUrl: 'https://jobs.lever.co/example/job-456',
      companyName: 'Example Corp',
      title: 'Senior Software Engineer',
      location: 'Remote - United States',
      remoteType: 'remote',
      employmentType: 'full-time',
      compensationText: '$180k-$210k USD',
      descriptionText: 'Build the next generation of platform tooling.',
      rawPayload: '{"id":"job-456"}',
      discoveryRunId: null,
      status: 'reviewing',
      reviewNotes: '',
      reviewSummary: null,
      reviewScore: null,
      reviewScoreReasoning: null,
      reviewUpdatedAt: null,
      reviewScoreUpdatedAt: null,
      discoveredAt: new Date('2026-03-15T09:00:00.000Z'),
      updatedAt: new Date('2026-03-15T09:00:00.000Z')
    });

    const capabilitiesResponse = await handle.app.inject({
      method: 'GET',
      url: '/job-reviews/capabilities'
    });
    const scoreResponse = await handle.app.inject({
      method: 'POST',
      url: `/job-reviews/${job.id}/score`
    });

    expect(capabilitiesResponse.statusCode).toBe(200);
    expect(capabilitiesResponse.json()).toEqual({
      scoringEnabled: false
    });
    expect(scoreResponse.statusCode).toBe(409);
    expect(scoreResponse.json().message).toContain('OpenRouter');
  });

  test('rejects invalid score output safely without changing review notes', async () => {
    const server = createServer((request, response) => {
      if (request.url === '/api/v1/chat/completions') {
        response.writeHead(200, {
          'content-type': 'application/json'
        });
        response.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: 'Useful summary, but the score is malformed.',
                    score: 'eighty-six'
                  })
                }
              }
            ]
          })
        );
        return;
      }

      response.writeHead(404, {
        'content-type': 'application/json'
      });
      response.end(JSON.stringify({ message: 'Not found' }));
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(3299, '127.0.0.1', (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    activeServers.push({
      close: () =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        })
    });

    const handle = await createTestApp({
      OPENROUTER_API_KEY: 'test-key',
      OPENROUTER_API_BASE_URL: 'http://127.0.0.1:3299/api/v1',
      OPENROUTER_JOB_SUMMARY_MODEL: 'openrouter/test-model'
    });
    activeApps.push(handle);

    const job = await handle.app.repositories.jobs.upsert({
      sourceKind: 'ashby',
      sourceId: 'job-789',
      sourceUrl: 'https://jobs.ashbyhq.com/example/job-789',
      companyName: 'Example Corp',
      title: 'Engineer Who Can Design',
      location: 'Remote - Americas',
      remoteType: 'remote',
      employmentType: 'full-time',
      compensationText: '$190k-$255k USD',
      descriptionText: 'Design systems and product engineering.',
      rawPayload: '{"id":"job-789"}',
      discoveryRunId: null,
      status: 'reviewing',
      reviewNotes: 'Promising, but needs a validated score.',
      reviewSummary: null,
      reviewScore: null,
      reviewScoreReasoning: null,
      reviewUpdatedAt: new Date('2026-03-15T10:00:00.000Z'),
      reviewScoreUpdatedAt: null,
      discoveredAt: new Date('2026-03-15T09:00:00.000Z'),
      updatedAt: new Date('2026-03-15T09:00:00.000Z')
    });

    const scoreResponse = await handle.app.inject({
      method: 'POST',
      url: `/job-reviews/${job.id}/score`
    });
    const persisted = await handle.app.repositories.jobs.findById(job.id);

    expect(scoreResponse.statusCode).toBe(422);
    expect(scoreResponse.json().message).toContain('invalid');
    expect(persisted?.reviewNotes).toBe('Promising, but needs a validated score.');
    expect(persisted?.reviewSummary).toBeNull();
    expect(persisted?.reviewScore).toBeNull();
  });
});

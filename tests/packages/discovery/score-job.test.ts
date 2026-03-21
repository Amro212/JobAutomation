import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterEach, describe, expect, test } from 'vitest';

import type { ApplicantProfile } from '@jobautomation/core';

import { createDatabaseClient, JobsRepository } from '../../../packages/db/src';
import { JobScoreError, scoreJob } from '../../../packages/discovery/src/services/score-job';

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

describe('scoreJob', () => {
  test('stores a validated review summary and score', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, { migrationsFolder });

    const jobsRepository = new JobsRepository(db);
    const job = await jobsRepository.upsert({
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
      status: 'reviewing',
      reviewNotes: 'Strong fit for TypeScript control-plane work.',
      reviewSummary: null,
      reviewScore: null,
      reviewScoreReasoning: null,
      reviewUpdatedAt: new Date('2026-03-15T10:00:00.000Z'),
      reviewScoreUpdatedAt: null,
      discoveredAt: new Date('2026-03-15T09:00:00.000Z'),
      updatedAt: new Date('2026-03-15T09:00:00.000Z')
    });

    const scored = await scoreJob({
      jobId: job.id,
      jobsRepository,
      openRouter: {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.example/api/v1',
        model: 'openrouter/test-model',
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      summary:
                        'Strong local-first infrastructure fit with relevant TypeScript platform experience.',
                      score: 86,
                      reasoning:
                        'The role aligns with prior discovery and control-plane work called out in the description.'
                    })
                  }
                }
              ]
            }),
            {
              status: 200,
              headers: {
                'content-type': 'application/json'
              }
            }
          )
      }
    });

    const stored = await jobsRepository.findById(job.id);

    expect(scored.reviewSummary).toContain('local-first infrastructure fit');
    expect(scored.reviewScore).toBe(86);
    expect(scored.reviewScoreReasoning).toContain('control-plane work');
    expect(scored.reviewScoreUpdatedAt).toBeInstanceOf(Date);
    expect(stored?.reviewSummary).toBe(scored.reviewSummary);
    expect(stored?.reviewScore).toBe(86);
  });

  test('requests strict structured output from OpenRouter', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, { migrationsFolder });

    const jobsRepository = new JobsRepository(db);
    const job = await jobsRepository.upsert({
      sourceKind: 'greenhouse',
      sourceId: 'job-schema',
      sourceUrl: 'https://boards.greenhouse.io/example/jobs/schema',
      companyName: 'Schema Corp',
      title: 'Platform Engineer',
      location: 'Remote - Canada',
      remoteType: 'remote',
      employmentType: 'full-time',
      compensationText: null,
      descriptionText: 'Keep summary generation consistent across all jobs.',
      rawPayload: '{"id":"job-schema"}',
      discoveryRunId: null,
      status: 'reviewing',
      reviewNotes: '',
      reviewSummary: null,
      reviewScore: null,
      reviewScoreReasoning: null,
      reviewUpdatedAt: new Date('2026-03-15T10:00:00.000Z'),
      reviewScoreUpdatedAt: null,
      discoveredAt: new Date('2026-03-15T09:00:00.000Z'),
      updatedAt: new Date('2026-03-15T09:00:00.000Z')
    });

    let requestBody: Record<string, unknown> | null = null;

    await scoreJob({
      jobId: job.id,
      jobsRepository,
      openRouter: {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.example/api/v1',
        model: 'openrouter/test-model',
        fetchImpl: async (_input, init) => {
          requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      summary: 'Consistent platform fit for local-first automation work.',
                      score: 88,
                      reasoning: 'Role strongly matches the reliability and automation focus.'
                    })
                  }
                }
              ]
            }),
            {
              status: 200,
              headers: {
                'content-type': 'application/json'
              }
            }
          );
        }
      }
    });

    expect(requestBody).toMatchObject({
      plugins: [{ id: 'response-healing' }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'job_summary',
          strict: true
        }
      }
    });
  });

  test('includes applicant context in the user prompt and uses personalized system instructions', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, { migrationsFolder });

    const jobsRepository = new JobsRepository(db);
    const job = await jobsRepository.upsert({
      sourceKind: 'greenhouse',
      sourceId: 'job-fit',
      sourceUrl: 'https://boards.greenhouse.io/example/jobs/fit',
      companyName: 'Fit Corp',
      title: 'Staff Engineer',
      location: 'Remote',
      remoteType: 'remote',
      employmentType: 'full-time',
      compensationText: null,
      descriptionText: 'We need Rust and distributed systems.',
      rawPayload: '{"id":"job-fit"}',
      discoveryRunId: null,
      status: 'reviewing',
      reviewNotes: '',
      reviewSummary: null,
      reviewScore: null,
      reviewScoreReasoning: null,
      reviewUpdatedAt: new Date('2026-03-15T10:00:00.000Z'),
      reviewScoreUpdatedAt: null,
      discoveredAt: new Date('2026-03-15T09:00:00.000Z'),
      updatedAt: new Date('2026-03-15T09:00:00.000Z')
    });

    const marker = 'UNIQUE_SCORE_JOB_APPLICANT_MARKER_RUST_EXPERT';

    const applicantProfile: ApplicantProfile = {
      id: 'default',
      fullName: 'Test User',
      email: 'test@example.com',
      phone: '',
      location: 'Berlin',
      summary: 'Backend engineer.',
      reusableContext: marker,
      linkedinUrl: '',
      websiteUrl: '',
      baseResumeFileName: '',
      baseResumeTex: '',
      updatedAt: new Date('2026-03-15T10:00:00.000Z')
    };

    let requestBody: Record<string, unknown> | null = null;

    await scoreJob({
      jobId: job.id,
      jobsRepository,
      applicantProfile,
      openRouter: {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.example/api/v1',
        model: 'openrouter/test-model',
        fetchImpl: async (_input, init) => {
          requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;

          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      summary: 'Strong systems fit given Rust focus.',
                      score: 90,
                      reasoning: 'Posting asks for Rust; applicant context aligns.'
                    })
                  }
                }
              ]
            }),
            {
              status: 200,
              headers: {
                'content-type': 'application/json'
              }
            }
          );
        }
      }
    });

    const body = requestBody as Record<string, unknown> | null;
    const messages = body?.messages as Array<{ role: string; content: string }> | undefined;
    expect(messages?.[0]?.content).toContain('Assess personalized fit');
    expect(messages?.[1]?.content).toContain(marker);
    expect(messages?.[1]?.content).toContain('--- Applicant (personalized fit) ---');
  });

  test('rejects invalid model output without corrupting persisted review state', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, { migrationsFolder });

    const jobsRepository = new JobsRepository(db);
    const job = await jobsRepository.upsert({
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
      reviewNotes: 'Need stronger signal on platform scale, but worth holding.',
      reviewSummary: null,
      reviewScore: null,
      reviewScoreReasoning: null,
      reviewUpdatedAt: new Date('2026-03-15T11:00:00.000Z'),
      reviewScoreUpdatedAt: null,
      discoveredAt: new Date('2026-03-15T09:00:00.000Z'),
      updatedAt: new Date('2026-03-15T09:00:00.000Z')
    });

    await expect(
      scoreJob({
        jobId: job.id,
        jobsRepository,
        openRouter: {
          apiKey: 'test-key',
          baseUrl: 'https://openrouter.example/api/v1',
          model: 'openrouter/test-model',
          fetchImpl: async () =>
            new Response(
              JSON.stringify({
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        summary: 'Looks promising.',
                        score: 'high'
                      })
                    }
                  }
                ]
              }),
              {
                status: 200,
                headers: {
                  'content-type': 'application/json'
                }
              }
            )
        }
      })
    ).rejects.toMatchObject({
      code: 'invalid_output'
    } satisfies Pick<JobScoreError, 'code'>);

    const stored = await jobsRepository.findById(job.id);

    expect(stored?.reviewNotes).toBe('Need stronger signal on platform scale, but worth holding.');
    expect(stored?.reviewSummary).toBeNull();
    expect(stored?.reviewScore).toBeNull();
    expect(stored?.reviewScoreReasoning).toBeNull();
    expect(stored?.status).toBe('reviewing');
  });

  test('maps OpenRouter authentication errors to not_configured with actionable message', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, { migrationsFolder });

    const jobsRepository = new JobsRepository(db);
    const job = await jobsRepository.upsert({
      sourceKind: 'ashby',
      sourceId: 'job-789',
      sourceUrl: 'https://jobs.ashbyhq.com/example/job-789',
      companyName: 'Example Corp',
      title: 'Staff Automation Engineer',
      location: 'Remote',
      remoteType: 'remote',
      employmentType: 'full-time',
      compensationText: null,
      descriptionText: 'Own end-to-end automation reliability and quality.',
      rawPayload: '{"id":"job-789"}',
      discoveryRunId: null,
      status: 'reviewing',
      reviewNotes: 'High-priority role, pending summary and score.',
      reviewSummary: null,
      reviewScore: null,
      reviewScoreReasoning: null,
      reviewUpdatedAt: new Date('2026-03-15T12:00:00.000Z'),
      reviewScoreUpdatedAt: null,
      discoveredAt: new Date('2026-03-15T09:00:00.000Z'),
      updatedAt: new Date('2026-03-15T09:00:00.000Z')
    });

    await expect(
      scoreJob({
        jobId: job.id,
        jobsRepository,
        openRouter: {
          apiKey: 'test-key',
          baseUrl: 'https://openrouter.example/api/v1',
          model: 'openrouter/test-model',
          fetchImpl: async () =>
            new Response(
              JSON.stringify({
                error: {
                  message: 'User not found.'
                }
              }),
              {
                status: 401,
                headers: {
                  'content-type': 'application/json'
                }
              }
            )
        }
      })
    ).rejects.toMatchObject({
      code: 'not_configured',
      message: 'OpenRouter authentication failed. Check OPENROUTER_API_KEY and retry.'
    } satisfies Pick<JobScoreError, 'code' | 'message'>);
  });

  test('surfaces rate limit errors with an actionable message', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, { migrationsFolder });

    const jobsRepository = new JobsRepository(db);
    const job = await jobsRepository.upsert({
      sourceKind: 'greenhouse',
      sourceId: 'job-429',
      sourceUrl: 'https://boards.greenhouse.io/example/jobs/429',
      companyName: 'Rate Corp',
      title: 'Engineer',
      location: 'Remote',
      remoteType: 'remote',
      employmentType: 'full-time',
      compensationText: null,
      descriptionText: 'Build things.',
      rawPayload: '{"id":"job-429"}',
      discoveryRunId: null,
      status: 'reviewing',
      reviewNotes: '',
      reviewSummary: null,
      reviewScore: null,
      reviewScoreReasoning: null,
      reviewUpdatedAt: new Date('2026-03-15T12:00:00.000Z'),
      reviewScoreUpdatedAt: null,
      discoveredAt: new Date('2026-03-15T09:00:00.000Z'),
      updatedAt: new Date('2026-03-15T09:00:00.000Z')
    });

    await expect(
      scoreJob({
        jobId: job.id,
        jobsRepository,
        openRouter: {
          apiKey: 'test-key',
          baseUrl: 'https://openrouter.example/api/v1',
          model: 'openrouter/test-model',
          fetchImpl: async () =>
            new Response(
              JSON.stringify({
                error: {
                  message: 'Provider returned error.'
                }
              }),
              {
                status: 429,
                headers: {
                  'content-type': 'application/json'
                }
              }
            )
        }
      })
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof JobScoreError &&
        e.code === 'provider_error' &&
        /rate limited/i.test(e.message) &&
        e.message.includes('(HTTP 429)')
    );
  });

  test('retries transient OpenRouter transport failures', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, { migrationsFolder });

    const jobsRepository = new JobsRepository(db);
    const job = await jobsRepository.upsert({
      sourceKind: 'greenhouse',
      sourceId: 'job-retry',
      sourceUrl: 'https://boards.greenhouse.io/example/jobs/retry',
      companyName: 'Retry Corp',
      title: 'Platform Engineer',
      location: 'Remote',
      remoteType: 'remote',
      employmentType: 'full-time',
      compensationText: null,
      descriptionText: 'Build reliable job automation systems.',
      rawPayload: '{"id":"job-retry"}',
      discoveryRunId: null,
      status: 'reviewing',
      reviewNotes: '',
      reviewSummary: null,
      reviewScore: null,
      reviewScoreReasoning: null,
      reviewUpdatedAt: new Date('2026-03-15T13:00:00.000Z'),
      reviewScoreUpdatedAt: null,
      discoveredAt: new Date('2026-03-15T09:00:00.000Z'),
      updatedAt: new Date('2026-03-15T09:00:00.000Z')
    });

    let attempts = 0;

    const scored = await scoreJob({
      jobId: job.id,
      jobsRepository,
      openRouter: {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.example/api/v1',
        model: 'openrouter/test-model',
        fetchImpl: async () => {
          attempts += 1;

          if (attempts === 1) {
            throw new TypeError('fetch failed');
          }

          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      summary: 'Reliable platform role with strong alignment to automation work.',
                      score: 81,
                      reasoning: 'Role emphasizes reliability and systems ownership with remote fit.'
                    })
                  }
                }
              ]
            }),
            {
              status: 200,
              headers: {
                'content-type': 'application/json'
              }
            }
          );
        }
      }
    });

    expect(attempts).toBe(2);
    expect(scored.reviewScore).toBe(81);
    expect(scored.reviewSummary).toContain('Reliable platform role');
  });
});


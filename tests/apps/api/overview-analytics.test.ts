import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { buildApp } from '../../../apps/api/src/app';
import {
  buildOverviewAnalytics,
  buildOverviewAiRequest,
  generateOverviewAiInsights,
  type OverviewAiOutput,
  type OverviewApplicationRunInput
} from '../../../apps/api/src/services/overview-analytics';

function run(input: Partial<OverviewApplicationRunInput>): OverviewApplicationRunInput {
  return {
    id: input.id ?? randomUUID(),
    siteKey: input.siteKey ?? 'greenhouse',
    status: input.status ?? 'completed',
    stopReason: input.stopReason ?? null,
    createdAt: input.createdAt ?? new Date('2026-05-01T12:00:00.000Z'),
    completedAt: input.completedAt ?? null
  };
}

function createTestDatabasePath(): string {
  const path = fileURLToPath(
    new URL(`../../../data/test/${randomUUID()}.sqlite`, import.meta.url)
  );
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

describe('overview analytics service', () => {
  test('builds real 7-day metrics, chart buckets, platform rates, and fallback score from application runs', () => {
    const now = new Date('2026-06-04T15:00:00.000Z');
    const analytics = buildOverviewAnalytics({
      now,
      range: '7d',
      totalJobs: 10,
      filteredMatch: 4,
      applicationRuns: [
        run({
          siteKey: 'greenhouse',
          status: 'completed',
          completedAt: new Date('2026-05-29T13:00:00.000Z')
        }),
        run({
          siteKey: 'greenhouse',
          status: 'failed',
          completedAt: new Date('2026-05-30T13:00:00.000Z')
        }),
        run({
          siteKey: 'lever',
          status: 'completed',
          completedAt: new Date('2026-06-02T13:00:00.000Z')
        }),
        run({
          siteKey: 'ashby',
          status: 'paused',
          stopReason: 'manual_review_required',
          createdAt: new Date('2026-06-03T13:00:00.000Z')
        }),
        run({
          siteKey: 'greenhouse',
          status: 'completed',
          completedAt: new Date('2026-05-22T13:00:00.000Z')
        })
      ]
    });

    expect(analytics.metrics).toMatchObject({
      totalJobs: 10,
      filteredMatch: 4,
      totalApplications: 5,
      completedApplications: 3,
      blockedApplications: 1,
      failedApplications: 1,
      successRate: 60
    });
    expect(analytics.applicationsOverTime).toHaveLength(7);
    expect(analytics.applicationsOverTime.map((entry) => entry.count)).toEqual([
      1, 0, 0, 0, 1, 0, 0
    ]);
    expect(analytics.platformSuccessRates).toEqual([
      expect.objectContaining({
        siteKey: 'greenhouse',
        completedCount: 2,
        attemptedCount: 3,
        successRate: 67
      }),
      expect.objectContaining({
        siteKey: 'lever',
        completedCount: 1,
        attemptedCount: 1,
        successRate: 100
      }),
      expect.objectContaining({
        siteKey: 'ashby',
        completedCount: 0,
        attemptedCount: 1,
        successRate: 0
      })
    ]);
    expect(analytics.agentEfficiencyScore.value).toBeGreaterThan(0);
    expect(analytics.agentEfficiencyScore.source).toBe('computed');
    expect(analytics.agentInsights[0]?.description).toContain('3 of 5');
  });

  test('builds an AI request that forbids unsupported claims and constrains the output schema', () => {
    const analytics = buildOverviewAnalytics({
      now: new Date('2026-06-04T15:00:00.000Z'),
      range: '30d',
      totalJobs: 20,
      filteredMatch: 5,
      applicationRuns: [
        run({
          siteKey: 'lever',
          status: 'completed',
          completedAt: new Date('2026-06-01T13:00:00.000Z')
        })
      ]
    });
    const request = buildOverviewAiRequest(analytics);

    expect(request.schemaName).toBe('overview_agent_insights');
    expect(request.systemPrompt).toContain('Use only the supplied analytics snapshot');
    expect(request.systemPrompt).toContain('Do not invent interview rates');
    expect(request.prompt).toContain('"range": "30d"');
  });

  test('uses valid AI insights and score when the provider returns the expected schema', async () => {
    const analytics = buildOverviewAnalytics({
      now: new Date('2026-06-04T15:00:00.000Z'),
      range: '7d',
      totalJobs: 2,
      filteredMatch: 1,
      applicationRuns: [
        run({
          siteKey: 'greenhouse',
          status: 'completed',
          completedAt: new Date('2026-06-03T13:00:00.000Z')
        })
      ]
    });
    const aiOutput: OverviewAiOutput = {
      efficiencyScore: 88,
      efficiencyRationale: 'High completion rate with no blocked runs.',
      insights: [
        {
          severity: 'positive',
          title: 'Reliable completion',
          description: 'The agent completed the only run in the selected window.'
        }
      ]
    };

    const enriched = await generateOverviewAiInsights({
      analytics,
      provider: {
        async generateStructuredObject() {
          return aiOutput;
        }
      }
    });

    expect(enriched.agentEfficiencyScore).toEqual({
      value: 88,
      source: 'ai',
      rationale: 'High completion rate with no blocked runs.'
    });
    expect(enriched.agentInsights).toEqual(aiOutput.insights);
  });
});

describe('overview analytics route', () => {
  const originalDbPath = process.env.JOB_AUTOMATION_DB_PATH;
  const originalApiKey = process.env.OPENROUTER_API_KEY;
  const originalModel = process.env.OPENROUTER_JOB_SUMMARY_MODEL;
  const dbPath = createTestDatabasePath();

  process.env.JOB_AUTOMATION_DB_PATH = dbPath;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_JOB_SUMMARY_MODEL;

  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    process.env.JOB_AUTOMATION_DB_PATH = originalDbPath;
    if (originalApiKey === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    }
    if (originalModel === undefined) {
      delete process.env.OPENROUTER_JOB_SUMMARY_MODEL;
    } else {
      process.env.OPENROUTER_JOB_SUMMARY_MODEL = originalModel;
    }
    try {
      rmSync(dbPath, { force: true });
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        error.code !== 'EBUSY'
      ) {
        throw error;
      }
    }
  });

  test('returns overview analytics backed by persisted jobs and application runs', async () => {
    const job = await app.repositories.jobs.upsert({
      sourceKind: 'greenhouse',
      sourceId: `job-${randomUUID()}`,
      sourceUrl: 'https://boards.greenhouse.io/example/jobs/analytics',
      companyName: 'Analytics Corp',
      title: 'Platform Engineer',
      location: 'Toronto, ON, Canada',
      remoteType: 'remote',
      employmentType: 'full-time',
      compensationText: null,
      descriptionText: 'Build application automation.',
      rawPayload: null,
      discoveryRunId: null,
      status: 'shortlisted',
      discoveredAt: new Date('2026-06-01T10:00:00.000Z'),
      updatedAt: new Date('2026-06-01T10:00:00.000Z')
    });
    await app.repositories.jobs.updatePrefilterResult(job.id, {
      pass: true,
      score: 92,
      reasons: [],
      audit: { matcherVersion: 'test' }
    });
    await app.repositories.applicationRuns.create({
      jobId: job.id,
      siteKey: 'greenhouse',
      status: 'completed',
      currentStep: 'submitted',
      completedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const response = await app.inject({
      method: 'GET',
      url: '/application-runs/overview?range=7d'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      range: '7d',
      metrics: {
        totalJobs: 1,
        filteredMatch: 1,
        totalApplications: 1,
        completedApplications: 1
      },
      ai: {
        source: 'computed',
        configured: false
      }
    });
  });
});

import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { readEnv } from '../../../packages/config/src/env';
import { autopilotConfigSchema } from '../../../packages/core/src/autopilot-config';
import {
  ApplicantProfileRepository,
  ApplicationRunsRepository,
  AutopilotRunsRepository,
  ArtifactsRepository,
  DiscoveryRunsRepository,
  DiscoverySourcesRepository,
  JobsRepository,
  LogEventsRepository,
  createDatabaseClient
} from '../../../packages/db/src';
import { AutopilotQueueService } from '../../../apps/api/src/services/autopilot-queue';

const migrationsFolder = fileURLToPath(
  new URL('../../../packages/db/drizzle', import.meta.url)
);
const createdPaths: string[] = [];
const trackedClients: Array<{ close: () => Promise<void> | void }> = [];
const defaultAutopilotConfig = autopilotConfigSchema.parse({});

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

describe('autopilot queue service', () => {
  test('discovers jobs, applies prefilter, submits eligible jobs, and skips ineligible ones', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, { migrationsFolder });

    const repositories = {
      applicantProfile: new ApplicantProfileRepository(db),
      applicationRuns: new ApplicationRunsRepository(db),
      autopilotRuns: new AutopilotRunsRepository(db),
      artifacts: new ArtifactsRepository(db),
      discoveryRuns: new DiscoveryRunsRepository(db),
      discoverySources: new DiscoverySourcesRepository(db),
      jobs: new JobsRepository(db),
      logEvents: new LogEventsRepository(db)
    };

    await repositories.applicantProfile.save({
      id: 'default',
      fullName: 'Taylor Example',
      email: 'taylor@example.com',
      phone: '555-0100',
      location: 'Toronto, ON',
      summary: 'TypeScript engineer',
      reusableContext: 'Builds automation systems.',
      linkedinUrl: 'https://www.linkedin.com/in/taylor-example',
      websiteUrl: 'https://example.com',
      baseResumeFileName: 'resume.tex',
      baseResumeTex: '\\section{Experience}',
      jobKeywordProfile: {
        seniority: 'mid',
        target_titles: ['platform engineer'],
        positive_keywords: ['typescript', 'automation'],
        negative_keywords: []
      }
    });

    const source = await repositories.discoverySources.upsert({
      sourceKind: 'playwright',
      sourceKey: 'acme',
      label: 'Acme Corp',
      enabled: true
    });
    const autopilotRun = await repositories.autopilotRuns.create({
      triggerKind: 'manual',
      status: 'pending',
      currentStep: 'queued'
    });

    const runPlaywrightDiscoveryStub = vi.fn(async ({ run, jobsRepository }) => {
      await jobsRepository.upsert({
        sourceKind: 'greenhouse',
        sourceId: 'job-eligible',
        sourceUrl: 'https://boards.greenhouse.io/example/jobs/eligible',
        companyName: 'Acme Corp',
        title: 'Platform Engineer',
        location: 'Remote',
        remoteType: 'remote',
        employmentType: 'full-time',
        compensationText: null,
        descriptionText: 'Build TypeScript automation.',
        rawPayload: null,
        discoveryRunId: run.id,
        status: 'discovered',
        discoveredAt: new Date('2026-05-08T10:00:00.000Z'),
        updatedAt: new Date('2026-05-08T10:00:00.000Z')
      });

      await jobsRepository.upsert({
        sourceKind: 'greenhouse',
        sourceId: 'job-skip',
        sourceUrl: 'https://boards.greenhouse.io/example/jobs/skip',
        companyName: 'Acme Corp',
        title: 'Line Cook',
        location: 'Remote',
        remoteType: 'remote',
        employmentType: 'full-time',
        compensationText: null,
        descriptionText: 'Prepare meals.',
        rawPayload: null,
        discoveryRunId: run.id,
        status: 'discovered',
        discoveredAt: new Date('2026-05-08T10:00:00.000Z'),
        updatedAt: new Date('2026-05-08T10:00:00.000Z')
      });

      await repositories.discoveryRuns.markFinished({
        id: run.id,
        status: 'completed',
        jobCount: 2,
        newJobCount: 2,
        updatedJobCount: 0
      });
    });

    const generateArtifactsStub = vi.fn(async ({ jobId }: { jobId: string }) => ({
      job: (await repositories.jobs.findById(jobId))!,
      profile: (await repositories.applicantProfile.get())!,
      artifacts: [
        await repositories.artifacts.create({
          jobId,
          discoveryRunId: null,
          kind: 'resume-variant',
          format: 'pdf',
          fileName: 'resume.pdf',
          storagePath: `/tmp/${jobId}-resume.pdf`,
          createdAt: new Date('2026-05-08T10:01:00.000Z')
        }),
        await repositories.artifacts.create({
          jobId,
          discoveryRunId: null,
          kind: 'cover-letter',
          format: 'pdf',
          fileName: 'cover-letter.pdf',
          storagePath: `/tmp/${jobId}-cover-letter.pdf`,
          createdAt: new Date('2026-05-08T10:01:00.000Z')
        })
      ]
    }));

    const runApplicationStub = vi.fn(async ({ runId, applicationRunsRepository }) => {
      const run = await applicationRunsRepository.findById!(runId!);
      if (!run) {
        throw new Error('Expected application run to exist.');
      }

      const updated = await applicationRunsRepository.update(run.id, {
        status: 'completed',
        currentStep: 'submitted',
        completedAt: new Date('2026-05-08T10:05:00.000Z')
      });
      if (!updated) {
        throw new Error('Expected application run update to succeed.');
      }

      return updated;
    });

    const queue = new AutopilotQueueService({
      repositories,
      config: readEnv({
        JOB_AUTOMATION_DB_PATH: dbPath
      }),
      runPlaywrightDiscoveryImpl: runPlaywrightDiscoveryStub as never,
      generateArtifactsImpl: generateArtifactsStub as never,
      runApplicationImpl: runApplicationStub as never
    });

    queue.enqueueRun({
      run: autopilotRun,
      sources: [source],
      config: defaultAutopilotConfig
    });
    await queue.onIdle();

    const storedRun = await repositories.autopilotRuns.findById(autopilotRun.id);
    const childRuns = await repositories.applicationRuns.listByAutopilotRun(
      autopilotRun.id
    );
    const eligibleJob = await repositories.jobs.findBySource('greenhouse', 'job-eligible');
    const skippedJob = await repositories.jobs.findBySource('greenhouse', 'job-skip');

    expect(runPlaywrightDiscoveryStub).toHaveBeenCalledTimes(1);
    expect(eligibleJob).not.toBeNull();
    expect(skippedJob).not.toBeNull();
    expect(storedRun).toMatchObject({
      status: 'completed',
      currentStep: 'applications_completed',
      discoveredJobCount: 1,
      eligibleJobCount: 1,
      skippedJobCount: 0,
      submittedCount: 1,
      blockedCount: 0,
      failedCount: 0
    });
    expect(childRuns).toHaveLength(1);
    expect(childRuns[0]?.resumeArtifactId).toBeTruthy();
    expect(childRuns[0]?.coverLetterArtifactId).toBeTruthy();
    expect(eligibleJob?.status).toBe('applied');
    expect(skippedJob?.status).toBe('discovered');
  });

  test('retries artifact generation until resume pdf is available', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, { migrationsFolder });

    const repositories = {
      applicantProfile: new ApplicantProfileRepository(db),
      applicationRuns: new ApplicationRunsRepository(db),
      autopilotRuns: new AutopilotRunsRepository(db),
      artifacts: new ArtifactsRepository(db),
      discoveryRuns: new DiscoveryRunsRepository(db),
      discoverySources: new DiscoverySourcesRepository(db),
      jobs: new JobsRepository(db),
      logEvents: new LogEventsRepository(db)
    };

    await repositories.applicantProfile.save({
      id: 'default',
      fullName: 'Taylor Example',
      email: 'taylor@example.com',
      phone: '555-0100',
      location: 'Toronto, ON',
      summary: 'TypeScript engineer',
      reusableContext: 'Builds automation systems.',
      linkedinUrl: 'https://www.linkedin.com/in/taylor-example',
      websiteUrl: 'https://example.com',
      baseResumeFileName: 'resume.tex',
      baseResumeTex: '\\section{Experience}'
    });

    const source = await repositories.discoverySources.upsert({
      sourceKind: 'playwright',
      sourceKey: 'acme',
      label: 'Acme Corp',
      enabled: true
    });
    const autopilotRun = await repositories.autopilotRuns.create({
      triggerKind: 'manual',
      status: 'pending',
      currentStep: 'queued'
    });

    const runPlaywrightDiscoveryStub = vi.fn(async ({ run, jobsRepository }) => {
      await jobsRepository.upsert({
        sourceKind: 'greenhouse',
        sourceId: 'job-retry-artifact',
        sourceUrl: 'https://boards.greenhouse.io/example/jobs/retry-artifact',
        companyName: 'Acme Corp',
        title: 'Platform Engineer',
        location: 'Remote',
        remoteType: 'remote',
        employmentType: 'full-time',
        compensationText: null,
        descriptionText: 'Build TypeScript systems.',
        rawPayload: null,
        discoveryRunId: run.id,
        status: 'discovered',
        discoveredAt: new Date('2026-05-08T10:00:00.000Z'),
        updatedAt: new Date('2026-05-08T10:00:00.000Z')
      });

      await repositories.discoveryRuns.markFinished({
        id: run.id,
        status: 'completed',
        jobCount: 1,
        newJobCount: 1,
        updatedJobCount: 0
      });
    });

    const generateArtifactsStub = vi
      .fn()
      .mockImplementationOnce(async ({ jobId }: { jobId: string }) => ({
        job: (await repositories.jobs.findById(jobId))!,
        profile: (await repositories.applicantProfile.get())!,
        artifacts: [
          await repositories.artifacts.create({
            jobId,
            discoveryRunId: null,
            kind: 'cover-letter',
            format: 'pdf',
            fileName: 'cover-letter.pdf',
            storagePath: `/tmp/${jobId}-cover-letter.pdf`,
            createdAt: new Date('2026-05-08T10:01:00.000Z')
          })
        ],
        warnings: ['Resume: PDF compile failed']
      }))
      .mockImplementationOnce(async ({ jobId }: { jobId: string }) => ({
        job: (await repositories.jobs.findById(jobId))!,
        profile: (await repositories.applicantProfile.get())!,
        artifacts: [
          await repositories.artifacts.create({
            jobId,
            discoveryRunId: null,
            kind: 'resume-variant',
            format: 'pdf',
            fileName: 'resume.pdf',
            storagePath: `/tmp/${jobId}-resume.pdf`,
            createdAt: new Date('2026-05-08T10:01:00.000Z')
          })
        ]
      }));

    const runApplicationStub = vi.fn(async ({ runId, applicationRunsRepository }) => {
      const run = await applicationRunsRepository.findById!(runId!);
      if (!run) {
        throw new Error('Expected application run to exist.');
      }
      const updated = await applicationRunsRepository.update(run.id, {
        status: 'completed',
        currentStep: 'submitted',
        completedAt: new Date('2026-05-08T10:05:00.000Z')
      });
      if (!updated) {
        throw new Error('Expected application run update to succeed.');
      }
      return updated;
    });

    const queue = new AutopilotQueueService({
      repositories,
      config: readEnv({
        JOB_AUTOMATION_DB_PATH: dbPath
      }),
      runPlaywrightDiscoveryImpl: runPlaywrightDiscoveryStub as never,
      generateArtifactsImpl: generateArtifactsStub as never,
      runApplicationImpl: runApplicationStub as never
    });

    queue.enqueueRun({
      run: autopilotRun,
      sources: [source],
      config: defaultAutopilotConfig
    });
    await queue.onIdle();

    const storedRun = await repositories.autopilotRuns.findById(autopilotRun.id);
    const childRuns = await repositories.applicationRuns.listByAutopilotRun(autopilotRun.id);

    expect(generateArtifactsStub).toHaveBeenCalledTimes(2);
    expect(runApplicationStub).toHaveBeenCalledTimes(1);
    expect(storedRun).toMatchObject({
      status: 'completed',
      submittedCount: 1,
      failedCount: 0
    });
    expect(childRuns).toHaveLength(1);
    expect(childRuns[0]?.resumeArtifactId).toBeTruthy();
  });

  test('fails application run when artifact generation exhausts retries without resume pdf', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, { migrationsFolder });

    const repositories = {
      applicantProfile: new ApplicantProfileRepository(db),
      applicationRuns: new ApplicationRunsRepository(db),
      autopilotRuns: new AutopilotRunsRepository(db),
      artifacts: new ArtifactsRepository(db),
      discoveryRuns: new DiscoveryRunsRepository(db),
      discoverySources: new DiscoverySourcesRepository(db),
      jobs: new JobsRepository(db),
      logEvents: new LogEventsRepository(db)
    };

    await repositories.applicantProfile.save({
      id: 'default',
      fullName: 'Taylor Example',
      email: 'taylor@example.com',
      phone: '555-0100',
      location: 'Toronto, ON',
      summary: 'TypeScript engineer',
      reusableContext: 'Builds automation systems.',
      linkedinUrl: 'https://www.linkedin.com/in/taylor-example',
      websiteUrl: 'https://example.com',
      baseResumeFileName: 'resume.tex',
      baseResumeTex: '\\section{Experience}'
    });

    const source = await repositories.discoverySources.upsert({
      sourceKind: 'playwright',
      sourceKey: 'acme',
      label: 'Acme Corp',
      enabled: true
    });
    const autopilotRun = await repositories.autopilotRuns.create({
      triggerKind: 'manual',
      status: 'pending',
      currentStep: 'queued'
    });

    const runPlaywrightDiscoveryStub = vi.fn(async ({ run, jobsRepository }) => {
      await jobsRepository.upsert({
        sourceKind: 'greenhouse',
        sourceId: 'job-artifact-fails',
        sourceUrl: 'https://boards.greenhouse.io/example/jobs/artifact-fails',
        companyName: 'Acme Corp',
        title: 'Platform Engineer',
        location: 'Remote',
        remoteType: 'remote',
        employmentType: 'full-time',
        compensationText: null,
        descriptionText: 'Build TypeScript systems.',
        rawPayload: null,
        discoveryRunId: run.id,
        status: 'discovered',
        discoveredAt: new Date('2026-05-08T10:00:00.000Z'),
        updatedAt: new Date('2026-05-08T10:00:00.000Z')
      });

      await repositories.discoveryRuns.markFinished({
        id: run.id,
        status: 'completed',
        jobCount: 1,
        newJobCount: 1,
        updatedJobCount: 0
      });
    });

    const generateArtifactsStub = vi.fn(async ({ jobId }: { jobId: string }) => ({
      job: (await repositories.jobs.findById(jobId))!,
      profile: (await repositories.applicantProfile.get())!,
      artifacts: [
        await repositories.artifacts.create({
          jobId,
          discoveryRunId: null,
          kind: 'cover-letter',
          format: 'pdf',
          fileName: 'cover-letter.pdf',
          storagePath: `/tmp/${jobId}-cover-letter.pdf`,
          createdAt: new Date('2026-05-08T10:01:00.000Z')
        })
      ],
      warnings: ['Resume: PDF compile failed']
    }));

    const runApplicationStub = vi.fn();

    const queue = new AutopilotQueueService({
      repositories,
      config: readEnv({
        JOB_AUTOMATION_DB_PATH: dbPath
      }),
      runPlaywrightDiscoveryImpl: runPlaywrightDiscoveryStub as never,
      generateArtifactsImpl: generateArtifactsStub as never,
      runApplicationImpl: runApplicationStub as never
    });

    queue.enqueueRun({
      run: autopilotRun,
      sources: [source],
      config: defaultAutopilotConfig
    });
    await queue.onIdle();

    const storedRun = await repositories.autopilotRuns.findById(autopilotRun.id);
    const childRuns = await repositories.applicationRuns.listByAutopilotRun(autopilotRun.id);

    expect(generateArtifactsStub).toHaveBeenCalledTimes(3);
    expect(runApplicationStub).not.toHaveBeenCalled();
    expect(storedRun).toMatchObject({
      status: 'failed',
      submittedCount: 0,
      failedCount: 1
    });
    expect(childRuns).toHaveLength(1);
    expect(childRuns[0]).toMatchObject({
      status: 'failed',
      currentStep: 'artifact_generation_failed',
      stopReason: 'artifact_generation_failed'
    });
  });

  test('skips a deterministic pass when hybrid LLM review vetoes the match', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, { migrationsFolder });

    const repositories = {
      applicantProfile: new ApplicantProfileRepository(db),
      applicationRuns: new ApplicationRunsRepository(db),
      autopilotRuns: new AutopilotRunsRepository(db),
      artifacts: new ArtifactsRepository(db),
      discoveryRuns: new DiscoveryRunsRepository(db),
      discoverySources: new DiscoverySourcesRepository(db),
      jobs: new JobsRepository(db),
      logEvents: new LogEventsRepository(db)
    };

    await repositories.applicantProfile.save({
      id: 'default',
      fullName: 'Taylor Example',
      email: 'taylor@example.com',
      phone: '555-0100',
      location: 'Toronto, ON',
      summary: 'New grad TypeScript engineer',
      reusableContext: 'Builds automation systems.',
      linkedinUrl: 'https://www.linkedin.com/in/taylor-example',
      websiteUrl: 'https://example.com',
      baseResumeFileName: 'resume.tex',
      baseResumeTex: '\\section{Projects} TypeScript automation',
      jobKeywordProfile: {
        seniority: 'new_grad',
        target_titles: ['software engineer'],
        positive_keywords: ['typescript', 'automation'],
        negative_keywords: []
      }
    });

    const source = await repositories.discoverySources.upsert({
      sourceKind: 'playwright',
      sourceKey: 'acme',
      label: 'Acme Corp',
      enabled: true
    });
    const autopilotRun = await repositories.autopilotRuns.create({
      triggerKind: 'manual',
      status: 'pending',
      currentStep: 'queued'
    });

    const runPlaywrightDiscoveryStub = vi.fn(async ({ run, jobsRepository }) => {
      await jobsRepository.upsert({
        sourceKind: 'greenhouse',
        sourceId: 'job-borderline',
        sourceUrl: 'https://boards.greenhouse.io/example/jobs/borderline',
        companyName: 'Acme Corp',
        title: 'Software Engineer I',
        location: 'Remote',
        remoteType: 'remote',
        employmentType: 'full-time',
        compensationText: null,
        descriptionText: 'Build TypeScript automation. Preferred: 3+ years of professional experience.',
        rawPayload: null,
        discoveryRunId: run.id,
        status: 'discovered',
        discoveredAt: new Date('2026-05-08T10:00:00.000Z'),
        updatedAt: new Date('2026-05-08T10:00:00.000Z')
      });

      await repositories.discoveryRuns.markFinished({
        id: run.id,
        status: 'completed',
        jobCount: 1,
        newJobCount: 1,
        updatedJobCount: 0
      });
    });

    const generateArtifactsStub = vi.fn();
    const runApplicationStub = vi.fn();
    const reviewJobMatchStub = vi.fn(async () => ({
      reviewed: true,
      pass: false,
      score: 35,
      reasons: ['llm_veto'],
      audit: {
        matcherVersion: 'hybrid-v2',
        decision: 'reject',
        score: 35,
        reasons: ['llm_veto'],
        signals: ['llm_review_recommended'],
        roleFamily: { name: 'engineering', matched: true },
        evidence: {
          matchedTitleTerms: ['software engineer'],
          matchedKeywords: ['typescript', 'automation'],
          matchedSkills: ['typescript', 'automation'],
          missingMustHaveKeywords: []
        },
        seniority: {
          profile: 'new_grad',
          earlyCareerSignal: false,
          minYearsRequired: 3,
          softExperienceCap: true
        },
        llm: {
          reviewed: true,
          pass: false,
          rationale: '3+ years makes this a weak new-grad autopilot match.',
          reasonCodes: ['over_level_years']
        }
      }
    }));

    const queue = new AutopilotQueueService({
      repositories,
      config: readEnv({
        JOB_AUTOMATION_DB_PATH: dbPath,
        OPENROUTER_API_KEY: 'test-key'
      }),
      runPlaywrightDiscoveryImpl: runPlaywrightDiscoveryStub as never,
      generateArtifactsImpl: generateArtifactsStub as never,
      runApplicationImpl: runApplicationStub as never,
      reviewJobMatchImpl: reviewJobMatchStub as never
    });

    queue.enqueueRun({
      run: autopilotRun,
      sources: [source],
      config: defaultAutopilotConfig
    });
    await queue.onIdle();

    const storedRun = await repositories.autopilotRuns.findById(autopilotRun.id);
    const job = await repositories.jobs.findBySource('greenhouse', 'job-borderline');
    const childRuns = await repositories.applicationRuns.listByAutopilotRun(autopilotRun.id);

    expect(reviewJobMatchStub).toHaveBeenCalledTimes(1);
    expect(generateArtifactsStub).not.toHaveBeenCalled();
    expect(runApplicationStub).not.toHaveBeenCalled();
    expect(childRuns).toHaveLength(0);
    expect(job?.prefilterPass).toBe(false);
    expect(job?.prefilterReasonsJson).toContain('llm_veto');
    expect(storedRun).toMatchObject({
      status: 'completed',
      discoveredJobCount: 1,
      eligibleJobCount: 0,
      skippedJobCount: 1,
      submittedCount: 0
    });
  });

  test('marks the batch partial and continues after a blocked application', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, { migrationsFolder });

    const repositories = {
      applicantProfile: new ApplicantProfileRepository(db),
      applicationRuns: new ApplicationRunsRepository(db),
      autopilotRuns: new AutopilotRunsRepository(db),
      artifacts: new ArtifactsRepository(db),
      discoveryRuns: new DiscoveryRunsRepository(db),
      discoverySources: new DiscoverySourcesRepository(db),
      jobs: new JobsRepository(db),
      logEvents: new LogEventsRepository(db)
    };

    await repositories.applicantProfile.save({
      id: 'default',
      fullName: 'Taylor Example',
      email: 'taylor@example.com',
      phone: '555-0100',
      location: 'Toronto, ON',
      summary: 'TypeScript engineer',
      reusableContext: 'Builds automation systems.',
      linkedinUrl: 'https://www.linkedin.com/in/taylor-example',
      websiteUrl: 'https://example.com',
      baseResumeFileName: 'resume.tex',
      baseResumeTex: '\\section{Experience}',
      jobKeywordProfile: {
        seniority: 'mid',
        target_titles: ['platform engineer'],
        positive_keywords: ['typescript'],
        negative_keywords: []
      }
    });

    const source = await repositories.discoverySources.upsert({
      sourceKind: 'playwright',
      sourceKey: 'acme',
      label: 'Acme Corp',
      enabled: true
    });
    const autopilotRun = await repositories.autopilotRuns.create({
      triggerKind: 'manual',
      status: 'pending',
      currentStep: 'queued'
    });

    const runPlaywrightDiscoveryStub = vi.fn(async ({ run, jobsRepository }) => {
      for (const suffix of ['one', 'two']) {
        await jobsRepository.upsert({
          sourceKind: 'greenhouse',
          sourceId: `job-${suffix}`,
          sourceUrl: `https://boards.greenhouse.io/example/jobs/${suffix}`,
          companyName: 'Acme Corp',
          title: 'Platform Engineer',
          location: 'Remote',
          remoteType: 'remote',
          employmentType: 'full-time',
          compensationText: null,
          descriptionText: 'Build TypeScript systems.',
          rawPayload: null,
          discoveryRunId: run.id,
          status: 'discovered',
          discoveredAt: new Date('2026-05-08T10:00:00.000Z'),
          updatedAt: new Date('2026-05-08T10:00:00.000Z')
        });
      }

      await repositories.discoveryRuns.markFinished({
        id: run.id,
        status: 'completed',
        jobCount: 2,
        newJobCount: 2,
        updatedJobCount: 0
      });
    });

    const generateArtifactsStub = vi.fn(async ({ jobId }: { jobId: string }) => ({
      job: (await repositories.jobs.findById(jobId))!,
      profile: (await repositories.applicantProfile.get())!,
      artifacts: [
        await repositories.artifacts.create({
          jobId,
          discoveryRunId: null,
          kind: 'resume-variant',
          format: 'pdf',
          fileName: 'resume.pdf',
          storagePath: `/tmp/${jobId}-resume.pdf`,
          createdAt: new Date('2026-05-08T10:01:00.000Z')
        }),
        await repositories.artifacts.create({
          jobId,
          discoveryRunId: null,
          kind: 'cover-letter',
          format: 'pdf',
          fileName: 'cover-letter.pdf',
          storagePath: `/tmp/${jobId}-cover-letter.pdf`,
          createdAt: new Date('2026-05-08T10:01:00.000Z')
        })
      ]
    }));

    let callCount = 0;
    const runApplicationStub = vi.fn(async ({ runId, applicationRunsRepository }) => {
      callCount += 1;
      const run = await applicationRunsRepository.findById!(runId!);
      if (!run) {
        throw new Error('Expected application run to exist.');
      }

      const updated = await applicationRunsRepository.update(run.id, {
        status: callCount === 1 ? 'completed' : 'paused',
        currentStep: callCount === 1 ? 'submitted' : 'email_verification_required',
        stopReason: callCount === 1 ? null : 'not_configured',
        completedAt: new Date('2026-05-08T10:05:00.000Z')
      });
      if (!updated) {
        throw new Error('Expected application run update to succeed.');
      }

      return updated;
    });

    const queue = new AutopilotQueueService({
      repositories,
      config: readEnv({
        JOB_AUTOMATION_DB_PATH: dbPath
      }),
      runPlaywrightDiscoveryImpl: runPlaywrightDiscoveryStub as never,
      generateArtifactsImpl: generateArtifactsStub as never,
      runApplicationImpl: runApplicationStub as never
    });

    queue.enqueueRun({
      run: autopilotRun,
      sources: [source],
      config: defaultAutopilotConfig
    });
    await queue.onIdle();

    const storedRun = await repositories.autopilotRuns.findById(autopilotRun.id);
    const childRuns = await repositories.applicationRuns.listByAutopilotRun(
      autopilotRun.id
    );

    expect(runPlaywrightDiscoveryStub).toHaveBeenCalledTimes(1);
    expect(storedRun).toMatchObject({
      status: 'partial',
      submittedCount: 1,
      blockedCount: 1,
      failedCount: 0
    });
    expect(childRuns).toHaveLength(2);
    expect(callCount).toBe(2);
    expect(runApplicationStub.mock.calls[0]?.[0]).toMatchObject({
      leaveBrowserOpenOnPause: false
    });
    expect(runApplicationStub.mock.calls[1]?.[0]).toMatchObject({
      leaveBrowserOpenOnPause: false
    });
  });

  test('excludes completed applications from the pool and retries failed or paused ones', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, { migrationsFolder });

    const repositories = {
      applicantProfile: new ApplicantProfileRepository(db),
      applicationRuns: new ApplicationRunsRepository(db),
      autopilotRuns: new AutopilotRunsRepository(db),
      artifacts: new ArtifactsRepository(db),
      discoveryRuns: new DiscoveryRunsRepository(db),
      discoverySources: new DiscoverySourcesRepository(db),
      jobs: new JobsRepository(db),
      logEvents: new LogEventsRepository(db)
    };

    await repositories.applicantProfile.save({
      id: 'default',
      fullName: 'Taylor Example',
      email: 'taylor@example.com',
      phone: '555-0100',
      location: 'Toronto, ON',
      summary: 'TypeScript engineer',
      reusableContext: 'Builds automation systems.',
      linkedinUrl: 'https://www.linkedin.com/in/taylor-example',
      websiteUrl: 'https://example.com',
      baseResumeFileName: 'resume.tex',
      baseResumeTex: '\\section{Experience}',
      jobKeywordProfile: {
        seniority: 'mid',
        target_titles: ['platform engineer'],
        positive_keywords: ['typescript'],
        negative_keywords: []
      }
    });

    const source = await repositories.discoverySources.upsert({
      sourceKind: 'playwright',
      sourceKey: 'acme',
      label: 'Acme Corp',
      enabled: true
    });
    const autopilotRun = await repositories.autopilotRuns.create({
      triggerKind: 'manual',
      status: 'pending',
      currentStep: 'queued'
    });
    const previousAutopilotRun = await repositories.autopilotRuns.create({
      triggerKind: 'manual',
      status: 'partial',
      currentStep: 'applications_completed'
    });
    const discoveryRun = await repositories.discoveryRuns.create({
      sourceKind: 'playwright',
      runKind: 'single-source',
      triggerKind: 'manual',
      discoverySourceId: source.id,
      status: 'running'
    });

    for (const suffix of ['failed', 'paused', 'completed', 'fresh']) {
      await repositories.jobs.upsert({
        sourceKind: 'greenhouse',
        sourceId: `job-${suffix}`,
        sourceUrl: `https://boards.greenhouse.io/example/jobs/${suffix}`,
        companyName: 'Acme Corp',
        title: 'Platform Engineer',
        location: 'Remote',
        remoteType: 'remote',
        employmentType: 'full-time',
        compensationText: null,
        descriptionText: 'Build TypeScript systems.',
        rawPayload: null,
        discoveryRunId: discoveryRun.id,
        status: 'discovered',
        discoveredAt: new Date('2026-05-08T10:00:00.000Z'),
        updatedAt: new Date('2026-05-08T10:00:00.000Z')
      });
    }

    await repositories.discoveryRuns.markFinished({
      id: discoveryRun.id,
      status: 'completed',
      jobCount: 4,
      newJobCount: 4,
      updatedJobCount: 0
    });

    for (const status of ['failed', 'paused', 'completed'] as const) {
      const job = await repositories.jobs.findBySource('greenhouse', `job-${status}`);
      expect(job).not.toBeNull();
      await repositories.applicationRuns.create({
        jobId: job!.id,
        autopilotRunId: previousAutopilotRun.id,
        siteKey: 'greenhouse',
        status,
        currentStep: status,
        prefilterReasons: [],
        completedAt: new Date('2026-05-08T10:05:00.000Z')
      });
    }

    const runPlaywrightDiscoveryStub = vi.fn();

    const generateArtifactsStub = vi.fn(async ({ jobId }: { jobId: string }) => ({
      job: (await repositories.jobs.findById(jobId))!,
      profile: (await repositories.applicantProfile.get())!,
      artifacts: [
        await repositories.artifacts.create({
          jobId,
          discoveryRunId: null,
          kind: 'resume-variant',
          format: 'pdf',
          fileName: 'resume.pdf',
          storagePath: `/tmp/${jobId}-resume.pdf`,
          createdAt: new Date('2026-05-08T10:01:00.000Z')
        }),
        await repositories.artifacts.create({
          jobId,
          discoveryRunId: null,
          kind: 'cover-letter',
          format: 'pdf',
          fileName: 'cover-letter.pdf',
          storagePath: `/tmp/${jobId}-cover-letter.pdf`,
          createdAt: new Date('2026-05-08T10:01:00.000Z')
        })
      ]
    }));

    const runApplicationStub = vi.fn(async ({ runId, applicationRunsRepository }) => {
      const run = await applicationRunsRepository.findById!(runId!);
      if (!run) {
        throw new Error('Expected application run to exist.');
      }

      const updated = await applicationRunsRepository.update(run.id, {
        status: 'completed',
        currentStep: 'submitted',
        completedAt: new Date('2026-05-08T10:05:00.000Z')
      });
      if (!updated) {
        throw new Error('Expected application run update to succeed.');
      }

      return updated;
    });

    const queue = new AutopilotQueueService({
      repositories,
      config: readEnv({
        JOB_AUTOMATION_DB_PATH: dbPath
      }),
      runPlaywrightDiscoveryImpl: runPlaywrightDiscoveryStub as never,
      generateArtifactsImpl: generateArtifactsStub as never,
      runApplicationImpl: runApplicationStub as never
    });

    queue.enqueueRun({
      run: autopilotRun,
      sources: [source],
      config: defaultAutopilotConfig
    });
    await queue.onIdle();

    const storedRun = await repositories.autopilotRuns.findById(autopilotRun.id);
    const childRuns = await repositories.applicationRuns.listByAutopilotRun(
      autopilotRun.id
    );

    const failedJob = await repositories.jobs.findBySource('greenhouse', 'job-failed');
    const pausedJob = await repositories.jobs.findBySource('greenhouse', 'job-paused');
    const freshJob = await repositories.jobs.findBySource('greenhouse', 'job-fresh');

    expect(runPlaywrightDiscoveryStub).not.toHaveBeenCalled();
    expect(generateArtifactsStub).toHaveBeenCalledTimes(3);
    expect(runApplicationStub).toHaveBeenCalledTimes(3);
    expect(runApplicationStub.mock.calls.map((call) => call[0]?.jobId)).toEqual(
      expect.arrayContaining([failedJob?.id, pausedJob?.id, freshJob?.id])
    );
    expect(childRuns).toHaveLength(3);
    expect(storedRun).toMatchObject({
      status: 'completed',
      discoveredJobCount: 3,
      eligibleJobCount: 3,
      skippedJobCount: 0,
      submittedCount: 3,
      blockedCount: 0,
      failedCount: 0
    });
  });

  test('applies only to jobs visible under jobs-tab default filters, not the full discovery batch', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, { migrationsFolder });

    const repositories = {
      applicantProfile: new ApplicantProfileRepository(db),
      applicationRuns: new ApplicationRunsRepository(db),
      autopilotRuns: new AutopilotRunsRepository(db),
      artifacts: new ArtifactsRepository(db),
      discoveryRuns: new DiscoveryRunsRepository(db),
      discoverySources: new DiscoverySourcesRepository(db),
      jobs: new JobsRepository(db),
      logEvents: new LogEventsRepository(db)
    };

    await repositories.applicantProfile.save({
      id: 'default',
      fullName: 'Taylor Example',
      email: 'taylor@example.com',
      phone: '555-0100',
      location: 'Toronto, ON',
      summary: 'TypeScript engineer',
      reusableContext: 'Builds automation systems.',
      linkedinUrl: 'https://www.linkedin.com/in/taylor-example',
      websiteUrl: 'https://example.com',
      baseResumeFileName: 'resume.tex',
      baseResumeTex: '\\section{Experience}',
      jobKeywordProfile: {
        seniority: 'mid',
        target_titles: ['platform engineer'],
        positive_keywords: ['typescript', 'automation'],
        negative_keywords: []
      },
      preferredCountries: ['CA']
    });

    const source = await repositories.discoverySources.upsert({
      sourceKind: 'playwright',
      sourceKey: 'acme',
      label: 'Acme Corp',
      enabled: true
    });
    const autopilotRun = await repositories.autopilotRuns.create({
      triggerKind: 'manual',
      status: 'pending',
      currentStep: 'queued'
    });

    const runPlaywrightDiscoveryStub = vi.fn(async ({ run, jobsRepository }) => {
      await jobsRepository.upsert({
        sourceKind: 'greenhouse',
        sourceId: 'job-ca',
        sourceUrl: 'https://boards.greenhouse.io/example/jobs/ca',
        companyName: 'Harvey',
        title: 'Platform Engineer',
        location: 'Toronto, Canada',
        remoteType: 'remote',
        employmentType: 'full-time',
        compensationText: null,
        descriptionText: 'Build TypeScript automation in Canada.',
        rawPayload: null,
        discoveryRunId: run.id,
        status: 'discovered',
        discoveredAt: new Date('2026-05-08T10:00:00.000Z'),
        updatedAt: new Date('2026-05-08T10:00:00.000Z')
      });

      await jobsRepository.upsert({
        sourceKind: 'greenhouse',
        sourceId: 'job-xai',
        sourceUrl: 'https://boards.greenhouse.io/example/jobs/xai',
        companyName: 'XAI',
        title: 'AI Tutor - Vietnamese',
        location: 'Remote',
        remoteType: 'remote',
        employmentType: 'full-time',
        compensationText: null,
        descriptionText: 'Build TypeScript automation remotely.',
        rawPayload: null,
        discoveryRunId: run.id,
        status: 'discovered',
        discoveredAt: new Date('2026-05-08T10:00:00.000Z'),
        updatedAt: new Date('2026-05-08T10:00:00.000Z')
      });

      await jobsRepository.upsert({
        sourceKind: 'greenhouse',
        sourceId: 'job-commercial-director',
        sourceUrl: 'https://boards.greenhouse.io/example/jobs/commercial-director',
        companyName: 'Capco',
        title: 'Commercial Director - Canada',
        location: 'Toronto, Canada',
        remoteType: 'hybrid',
        employmentType: 'full-time',
        compensationText: null,
        descriptionText: 'Lead enterprise sales and commercial account strategy.',
        rawPayload: null,
        discoveryRunId: run.id,
        status: 'discovered',
        discoveredAt: new Date('2026-05-08T10:00:00.000Z'),
        updatedAt: new Date('2026-05-08T10:00:00.000Z')
      });

      await repositories.discoveryRuns.markFinished({
        id: run.id,
        status: 'completed',
        jobCount: 3,
        newJobCount: 3,
        updatedJobCount: 0
      });
    });

    const generateArtifactsStub = vi.fn(async ({ jobId }: { jobId: string }) => ({
      job: (await repositories.jobs.findById(jobId))!,
      profile: (await repositories.applicantProfile.get())!,
      artifacts: [
        await repositories.artifacts.create({
          jobId,
          discoveryRunId: null,
          kind: 'resume-variant',
          format: 'pdf',
          fileName: 'resume.pdf',
          storagePath: `/tmp/${jobId}-resume.pdf`,
          createdAt: new Date('2026-05-08T10:01:00.000Z')
        }),
        await repositories.artifacts.create({
          jobId,
          discoveryRunId: null,
          kind: 'cover-letter',
          format: 'pdf',
          fileName: 'cover-letter.pdf',
          storagePath: `/tmp/${jobId}-cover-letter.pdf`,
          createdAt: new Date('2026-05-08T10:01:00.000Z')
        })
      ]
    }));

    const runApplicationStub = vi.fn(async ({ runId, applicationRunsRepository }) => {
      const run = await applicationRunsRepository.findById!(runId!);
      if (!run) {
        throw new Error('Expected application run to exist.');
      }

      const updated = await applicationRunsRepository.update(run.id, {
        status: 'completed',
        currentStep: 'submitted',
        completedAt: new Date('2026-05-08T10:05:00.000Z')
      });
      if (!updated) {
        throw new Error('Expected application run update to succeed.');
      }

      return updated;
    });

    const queue = new AutopilotQueueService({
      repositories,
      config: readEnv({
        JOB_AUTOMATION_DB_PATH: dbPath
      }),
      runPlaywrightDiscoveryImpl: runPlaywrightDiscoveryStub as never,
      generateArtifactsImpl: generateArtifactsStub as never,
      runApplicationImpl: runApplicationStub as never
    });

    queue.enqueueRun({
      run: autopilotRun,
      sources: [source],
      config: autopilotConfigSchema.parse({
        ...defaultAutopilotConfig,
        matchProfile: 'all'
      })
    });
    await queue.onIdle();

    const childRuns = await repositories.applicationRuns.listByAutopilotRun(
      autopilotRun.id
    );
    const caJob = await repositories.jobs.findBySource('greenhouse', 'job-ca');
    const xaiJob = await repositories.jobs.findBySource('greenhouse', 'job-xai');
    const commercialDirectorJob = await repositories.jobs.findBySource(
      'greenhouse',
      'job-commercial-director'
    );

    expect(childRuns).toHaveLength(1);
    expect(childRuns[0]?.jobId).toBe(caJob?.id);
    expect(runApplicationStub).toHaveBeenCalledTimes(1);
    expect(runApplicationStub.mock.calls[0]?.[0]).toMatchObject({
      jobId: caJob?.id
    });
    expect(xaiJob?.status).toBe('discovered');
    expect(commercialDirectorJob?.status).toBe('discovered');
  });

  test('respects config overrides for fresh discovery, job cap, artifact mode, and site filters', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, { migrationsFolder });

    const repositories = {
      applicantProfile: new ApplicantProfileRepository(db),
      applicationRuns: new ApplicationRunsRepository(db),
      autopilotRuns: new AutopilotRunsRepository(db),
      artifacts: new ArtifactsRepository(db),
      discoveryRuns: new DiscoveryRunsRepository(db),
      discoverySources: new DiscoverySourcesRepository(db),
      jobs: new JobsRepository(db),
      logEvents: new LogEventsRepository(db)
    };

    await repositories.applicantProfile.save({
      id: 'default',
      fullName: 'Taylor Example',
      email: 'taylor@example.com',
      phone: '555-0100',
      location: 'Toronto, ON',
      summary: 'TypeScript engineer',
      reusableContext: 'Builds automation systems.',
      linkedinUrl: 'https://www.linkedin.com/in/taylor-example',
      websiteUrl: 'https://example.com',
      baseResumeFileName: 'resume.tex',
      baseResumeTex: '\\section{Experience}'
    });

    const source = await repositories.discoverySources.upsert({
      sourceKind: 'playwright',
      sourceKey: 'acme',
      label: 'Acme Corp',
      enabled: true
    });
    const autopilotRun = await repositories.autopilotRuns.create({
      triggerKind: 'manual',
      status: 'pending',
      currentStep: 'queued'
    });

    const previousDiscoveryRun = await repositories.discoveryRuns.create({
      sourceKind: 'playwright',
      runKind: 'single-source',
      triggerKind: 'manual',
      discoverySourceId: source.id,
      status: 'running'
    });
    await repositories.discoveryRuns.markFinished({
      id: previousDiscoveryRun.id,
      status: 'completed',
      jobCount: 0,
      newJobCount: 0,
      updatedJobCount: 0
    });

    const runPlaywrightDiscoveryStub = vi.fn(async ({ run, jobsRepository }) => {
      for (const suffix of ['one', 'two']) {
        await jobsRepository.upsert({
          sourceKind: 'lever',
          sourceId: `job-${suffix}`,
          sourceUrl: `https://jobs.lever.co/acme/${suffix}`,
          companyName: 'Acme Corp',
          title: 'Platform Engineer',
          location: 'Remote',
          remoteType: 'remote',
          employmentType: 'full-time',
          compensationText: null,
          descriptionText: 'Build TypeScript systems.',
          rawPayload: null,
          discoveryRunId: run.id,
          status: 'discovered',
          discoveredAt: new Date('2026-05-08T10:00:00.000Z'),
          updatedAt: new Date('2026-05-08T10:00:00.000Z')
        });
      }

      await repositories.discoveryRuns.markFinished({
        id: run.id,
        status: 'completed',
        jobCount: 2,
        newJobCount: 2,
        updatedJobCount: 0
      });
    });

    const generateArtifactsStub = vi.fn(async ({ jobId }: { jobId: string }) => ({
      job: (await repositories.jobs.findById(jobId))!,
      profile: (await repositories.applicantProfile.get())!,
      artifacts: [
        await repositories.artifacts.create({
          jobId,
          discoveryRunId: null,
          kind: 'resume-variant',
          format: 'pdf',
          fileName: 'resume.pdf',
          storagePath: `/tmp/${jobId}-resume.pdf`,
          createdAt: new Date('2026-05-08T10:01:00.000Z')
        })
      ]
    }));

    const runApplicationStub = vi.fn(async ({ runId, applicationRunsRepository }) => {
      const run = await applicationRunsRepository.findById!(runId!);
      if (!run) {
        throw new Error('Expected application run to exist.');
      }

      const updated = await applicationRunsRepository.update(run.id, {
        status: 'completed',
        currentStep: 'submitted',
        completedAt: new Date('2026-05-08T10:05:00.000Z')
      });
      if (!updated) {
        throw new Error('Expected application run update to succeed.');
      }

      return updated;
    });

    const queue = new AutopilotQueueService({
      repositories,
      config: readEnv({
        JOB_AUTOMATION_DB_PATH: dbPath
      }),
      runPlaywrightDiscoveryImpl: runPlaywrightDiscoveryStub as never,
      generateArtifactsImpl: generateArtifactsStub as never,
      runApplicationImpl: runApplicationStub as never
    });

    queue.enqueueRun({
      run: autopilotRun,
      sources: [source],
      config: autopilotConfigSchema.parse({
        discoverySourceIds: [source.id],
        applySiteKeys: ['lever'],
        maxJobsPerRun: 1,
        forceFreshDiscovery: true,
        artifactMode: 'resume'
      })
    });
    await queue.onIdle();

    const childRuns = await repositories.applicationRuns.listByAutopilotRun(autopilotRun.id);

    expect(runPlaywrightDiscoveryStub).toHaveBeenCalledTimes(1);
    expect(generateArtifactsStub).toHaveBeenCalledTimes(1);
    expect(generateArtifactsStub.mock.calls[0]?.[0]).toMatchObject({
      mode: 'resume'
    });
    expect(runApplicationStub).toHaveBeenCalledTimes(1);
    expect(runApplicationStub.mock.calls[0]?.[0].siteFlows).toHaveLength(1);
    expect(runApplicationStub.mock.calls[0]?.[0].siteFlows[0]?.siteKey).toBe('lever');
    expect(childRuns).toHaveLength(1);
  });

  test('recovers stale running application runs into retry state before processing', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, { migrationsFolder });

    const repositories = {
      applicantProfile: new ApplicantProfileRepository(db),
      applicationRuns: new ApplicationRunsRepository(db),
      autopilotRuns: new AutopilotRunsRepository(db),
      artifacts: new ArtifactsRepository(db),
      discoveryRuns: new DiscoveryRunsRepository(db),
      discoverySources: new DiscoverySourcesRepository(db),
      jobs: new JobsRepository(db),
      logEvents: new LogEventsRepository(db)
    };

    await repositories.applicantProfile.save({
      id: 'default',
      fullName: 'Taylor Example',
      email: 'taylor@example.com',
      phone: '555-0100',
      location: 'Toronto, ON',
      summary: 'TypeScript engineer',
      reusableContext: 'Builds automation systems.',
      linkedinUrl: 'https://www.linkedin.com/in/taylor-example',
      websiteUrl: 'https://example.com',
      baseResumeFileName: 'resume.tex',
      baseResumeTex: '\\section{Experience}'
    });

    const source = await repositories.discoverySources.upsert({
      sourceKind: 'playwright',
      sourceKey: 'acme',
      label: 'Acme Corp',
      enabled: true
    });

    const job = await repositories.jobs.upsert({
      sourceKind: 'playwright',
      sourceId: 'stale-running-job',
      sourceUrl: 'https://example.com/jobs/stale',
      companyName: 'Acme Corp',
      title: 'Platform Engineer',
      location: 'Remote',
      remoteType: 'remote',
      employmentType: 'full-time',
      compensationText: null,
      descriptionText: 'Build TypeScript systems.',
      rawPayload: null,
      discoveryRunId: null,
      status: 'discovered',
      discoveredAt: new Date('2026-05-08T10:00:00.000Z'),
      updatedAt: new Date('2026-05-08T10:00:00.000Z')
    });
    const staleRun = await repositories.applicationRuns.create({
      jobId: job.id,
      siteKey: 'greenhouse',
      status: 'running',
      currentStep: 'starting',
      startedAt: new Date('2026-05-08T10:01:00.000Z'),
      createdAt: new Date('2026-05-08T10:01:00.000Z'),
      updatedAt: new Date('2026-05-08T10:01:00.000Z')
    });
    const autopilotRun = await repositories.autopilotRuns.create({
      triggerKind: 'manual',
      status: 'pending',
      currentStep: 'queued'
    });

    const runPlaywrightDiscoveryStub = vi.fn(async ({ run }) => {
      await repositories.discoveryRuns.markFinished({
        id: run.id,
        status: 'completed',
        jobCount: 0,
        newJobCount: 0,
        updatedJobCount: 0
      });
    });

    const queue = new AutopilotQueueService({
      repositories,
      config: readEnv({
        JOB_AUTOMATION_DB_PATH: dbPath
      }),
      runPlaywrightDiscoveryImpl: runPlaywrightDiscoveryStub as never,
      staleApplicationRunThresholdMs: 25,
      terminateCamoufoxImpl: vi.fn(async () => undefined)
    });

    queue.enqueueRun({
      run: autopilotRun,
      sources: [source],
      config: defaultAutopilotConfig
    });
    await queue.onIdle();

    const recoveredRun = await repositories.applicationRuns.findById(staleRun.id);
    expect(recoveredRun).toMatchObject({
      status: 'retry',
      currentStep: 'retry_queued',
      stopReason: 'stuck_timeout'
    });
  });

  test('marks timed-out application attempts as retry and finishes batch', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, { migrationsFolder });

    const repositories = {
      applicantProfile: new ApplicantProfileRepository(db),
      applicationRuns: new ApplicationRunsRepository(db),
      autopilotRuns: new AutopilotRunsRepository(db),
      artifacts: new ArtifactsRepository(db),
      discoveryRuns: new DiscoveryRunsRepository(db),
      discoverySources: new DiscoverySourcesRepository(db),
      jobs: new JobsRepository(db),
      logEvents: new LogEventsRepository(db)
    };

    await repositories.applicantProfile.save({
      id: 'default',
      fullName: 'Taylor Example',
      email: 'taylor@example.com',
      phone: '555-0100',
      location: 'Toronto, ON',
      summary: 'TypeScript engineer',
      reusableContext: 'Builds automation systems.',
      linkedinUrl: 'https://www.linkedin.com/in/taylor-example',
      websiteUrl: 'https://example.com',
      baseResumeFileName: 'resume.tex',
      baseResumeTex: '\\section{Experience}',
      jobKeywordProfile: {
        seniority: 'mid',
        target_titles: ['platform engineer'],
        positive_keywords: ['typescript'],
        negative_keywords: []
      }
    });

    const source = await repositories.discoverySources.upsert({
      sourceKind: 'playwright',
      sourceKey: 'acme',
      label: 'Acme Corp',
      enabled: true
    });
    const autopilotRun = await repositories.autopilotRuns.create({
      triggerKind: 'manual',
      status: 'pending',
      currentStep: 'queued'
    });

    const runPlaywrightDiscoveryStub = vi.fn(async ({ run, jobsRepository }) => {
      await jobsRepository.upsert({
        sourceKind: 'greenhouse',
        sourceId: 'job-timeout',
        sourceUrl: 'https://boards.greenhouse.io/example/jobs/timeout',
        companyName: 'Acme Corp',
        title: 'Platform Engineer',
        location: 'Remote',
        remoteType: 'remote',
        employmentType: 'full-time',
        compensationText: null,
        descriptionText: 'Build TypeScript systems.',
        rawPayload: null,
        discoveryRunId: run.id,
        status: 'discovered',
        discoveredAt: new Date('2026-05-08T10:00:00.000Z'),
        updatedAt: new Date('2026-05-08T10:00:00.000Z')
      });

      await repositories.discoveryRuns.markFinished({
        id: run.id,
        status: 'completed',
        jobCount: 1,
        newJobCount: 1,
        updatedJobCount: 0
      });
    });

    const generateArtifactsStub = vi.fn(async ({ jobId }: { jobId: string }) => ({
      job: (await repositories.jobs.findById(jobId))!,
      profile: (await repositories.applicantProfile.get())!,
      artifacts: [
        await repositories.artifacts.create({
          jobId,
          discoveryRunId: null,
          kind: 'resume-variant',
          format: 'pdf',
          fileName: 'resume.pdf',
          storagePath: `/tmp/${jobId}-resume.pdf`,
          createdAt: new Date('2026-05-08T10:01:00.000Z')
        })
      ]
    }));

    const runApplicationStub = vi.fn(
      async () => await new Promise<never>(() => {})
    );

    const queue = new AutopilotQueueService({
      repositories,
      config: readEnv({
        JOB_AUTOMATION_DB_PATH: dbPath
      }),
      runPlaywrightDiscoveryImpl: runPlaywrightDiscoveryStub as never,
      generateArtifactsImpl: generateArtifactsStub as never,
      runApplicationImpl: runApplicationStub as never,
      applicationRunTimeoutMs: 25,
      staleApplicationRunThresholdMs: 60_000,
      terminateCamoufoxImpl: vi.fn(async () => undefined)
    });

    queue.enqueueRun({
      run: autopilotRun,
      sources: [source],
      config: defaultAutopilotConfig
    });
    await queue.onIdle();

    const updatedBatch = await repositories.autopilotRuns.findById(autopilotRun.id);
    const childRuns = await repositories.applicationRuns.listByAutopilotRun(autopilotRun.id);

    expect(runApplicationStub).toHaveBeenCalledTimes(1);
    expect(updatedBatch).toMatchObject({
      status: 'failed',
      blockedCount: 1,
      submittedCount: 0
    });
    expect(childRuns).toHaveLength(1);
    expect(childRuns[0]).toMatchObject({
      status: 'retry',
      currentStep: 'retry_queued',
      stopReason: 'stuck_timeout'
    });
  });
});

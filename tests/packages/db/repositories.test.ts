import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterEach, describe, expect, test } from 'vitest';

import {
  ApplicantProfileRepository,
  ApplicationRunsRepository,
  ArtifactsRepository,
  DiscoveryRunsRepository,
  DiscoverySchedulesRepository,
  JobsRepository,
  LogEventsRepository,
  createDatabaseClient
} from '../../../packages/db/src';

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

describe('repositories', () => {
  test('upserts jobs and keeps source identity stable', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, {
      migrationsFolder
    });

    const repository = new JobsRepository(db);
    const discoveredAt = new Date('2026-03-13T10:00:00.000Z');
    const updatedAt = new Date('2026-03-13T10:00:00.000Z');

    const created = await repository.upsert({
      sourceKind: 'greenhouse',
      sourceId: 'job-123',
      sourceUrl: 'https://boards.greenhouse.io/example/jobs/123',
      companyName: 'Example Corp',
      title: 'Platform Engineer',
      location: 'Toronto, ON',
      remoteType: 'hybrid',
      employmentType: 'full-time',
      compensationText: '$150k-$170k',
      descriptionText: 'Build the control plane',
      rawPayload: '{"id":"job-123"}',
      discoveryRunId: null,
      status: 'discovered',
      discoveredAt,
      updatedAt
    });

    const updated = await repository.upsert({
      sourceKind: 'greenhouse',
      sourceId: 'job-123',
      sourceUrl: 'https://boards.greenhouse.io/example/jobs/123',
      companyName: 'Example Corp',
      title: 'Senior Platform Engineer',
      location: 'Toronto, ON',
      remoteType: 'remote',
      employmentType: 'full-time',
      compensationText: '$170k-$190k',
      descriptionText: 'Own the local-first control plane',
      rawPayload: '{"id":"job-123","updated":true}',
      discoveryRunId: null,
      status: 'reviewing',
      discoveredAt,
      updatedAt: new Date('2026-03-13T12:00:00.000Z')
    });

    const { jobs, total } = await repository.list();

    expect(updated.id).toBe(created.id);
    expect(jobs).toHaveLength(1);
    expect(total).toBe(1);
    expect(jobs[0]?.title).toBe('Senior Platform Engineer');
    expect(jobs[0]?.status).toBe('reviewing');
  });

  test('stores applicant setup data including the base latex resume source', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, {
      migrationsFolder
    });

    const repository = new ApplicantProfileRepository(db);

    const profile = await repository.save({
      id: 'default',
      fullName: 'Taylor Example',
      email: 'taylor@example.com',
      phone: '555-0100',
      location: 'Toronto, ON',
      summary: 'TypeScript engineer',
      reusableContext: 'Enjoys local-first tooling.',
      linkedinUrl: 'https://www.linkedin.com/in/taylor-example',
      websiteUrl: 'https://example.com',
      baseResumeFileName: 'resume.tex',
      baseResumeTex: '\\section{Experience}'
    });

    const stored = await repository.get();

    expect(profile.baseResumeFileName).toBe('resume.tex');
    expect(stored?.baseResumeTex).toContain('Experience');
  });

  test('tracks discovery runs and related artifacts', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, {
      migrationsFolder
    });

    const runsRepository = new DiscoveryRunsRepository(db);
    const jobsRepository = new JobsRepository(db);
    const artifactsRepository = new ArtifactsRepository(db);

    const run = await runsRepository.create('greenhouse');
    const job = await jobsRepository.upsert({
      sourceKind: 'greenhouse',
      sourceId: 'job-456',
      sourceUrl: 'https://boards.greenhouse.io/example/jobs/456',
      companyName: 'Example Corp',
      title: 'Automation Engineer',
      location: 'Remote',
      remoteType: 'remote',
      employmentType: 'full-time',
      compensationText: null,
      descriptionText: 'Build discovery systems',
      rawPayload: null,
      discoveryRunId: run.id,
      status: 'discovered',
      discoveredAt: new Date('2026-03-13T10:00:00.000Z'),
      updatedAt: new Date('2026-03-13T10:00:00.000Z')
    });

    await runsRepository.markFinished({
      id: run.id,
      status: 'completed',
      jobCount: 1,
      newJobCount: 1,
      updatedJobCount: 0
    });

    await artifactsRepository.create({
      jobId: job.id,
      discoveryRunId: run.id,
      kind: 'resume-source',
      format: 'tex',
      fileName: 'resume.tex',
      storagePath: 'artifacts/default/resume.tex',
      createdAt: new Date('2026-03-13T10:05:00.000Z')
    });

    const artifacts = await artifactsRepository.listByJob(job.id);
    const runs = await runsRepository.list();

    expect(artifacts).toHaveLength(1);
    expect(runs[0]?.status).toBe('completed');
    expect(runs[0]?.newJobCount).toBe(1);
  });

  test('stores application runs and links artifacts and log events to the run', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, {
      migrationsFolder
    });

    const runsRepository = new ApplicationRunsRepository(db);
    const jobsRepository = new JobsRepository(db);
    const artifactsRepository = new ArtifactsRepository(db);
    const logEventsRepository = new LogEventsRepository(db);

    const job = await jobsRepository.upsert({
      sourceKind: 'greenhouse',
      sourceId: 'job-789',
      sourceUrl: 'https://boards.greenhouse.io/example/jobs/789',
      companyName: 'Example Corp',
      title: 'Platform Engineer',
      location: 'Toronto, ON',
      remoteType: 'hybrid',
      employmentType: 'full-time',
      compensationText: null,
      descriptionText: 'Build reliable automation systems.',
      rawPayload: null,
      discoveryRunId: null,
      status: 'shortlisted',
      discoveredAt: new Date('2026-03-13T10:00:00.000Z'),
      updatedAt: new Date('2026-03-13T10:00:00.000Z')
    });

    const created = await runsRepository.create({
      jobId: job.id,
      siteKey: 'greenhouse',
      status: 'running',
      currentStep: 'documents_resolved',
      prefilterReasons: [],
      createdAt: new Date('2026-03-13T10:10:00.000Z'),
      startedAt: new Date('2026-03-13T10:10:05.000Z'),
      updatedAt: new Date('2026-03-13T10:10:05.000Z')
    });

    const resumeArtifact = await artifactsRepository.create({
      jobId: job.id,
      applicationRunId: created.id,
      discoveryRunId: null,
      kind: 'resume-variant',
      format: 'pdf',
      fileName: 'resume.pdf',
      storagePath: 'artifacts/default/resume.pdf',
      createdAt: new Date('2026-03-13T10:10:10.000Z')
    });

    const logEvent = await logEventsRepository.create({
      applicationRunId: created.id,
      jobId: job.id,
      level: 'info',
      message: 'Opened application form.',
      detailsJson: JSON.stringify({ step: 'documents_resolved' }),
      createdAt: new Date('2026-03-13T10:10:12.000Z')
    });

    await runsRepository.update(created.id, {
      status: 'paused',
      currentStep: 'review_ready',
      stopReason: 'manual_review_required',
      reviewUrl: 'https://job-boards.greenhouse.io/example/jobs/789/application',
      coverLetterArtifactId: resumeArtifact.id,
      completedAt: new Date('2026-03-13T10:11:00.000Z'),
      updatedAt: new Date('2026-03-13T10:11:00.000Z')
    });

    const storedRun = await runsRepository.findById(created.id);
    const artifacts = await artifactsRepository.listByApplicationRun(created.id);
    const logs = await logEventsRepository.listByApplicationRun(created.id);

    expect(storedRun?.status).toBe('paused');
    expect(storedRun?.prefilterReasons).toEqual([]);
    expect(storedRun?.siteKey).toBe('greenhouse');
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.applicationRunId).toBe(created.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.applicationRunId).toBe(created.id);
    expect(logEvent.id).toBeDefined();
  });

  test('filters jobs by locationCountries with case-insensitive alias matching', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, { migrationsFolder });

    const repository = new JobsRepository(db);
    const baseJob = {
      sourceKind: 'greenhouse' as const,
      remoteType: 'remote',
      employmentType: 'full-time',
      compensationText: null,
      descriptionText: 'Test job',
      rawPayload: null,
      discoveryRunId: null,
      status: 'discovered' as const,
      discoveredAt: new Date('2026-03-13T10:00:00.000Z'),
      updatedAt: new Date('2026-03-13T10:00:00.000Z')
    };

    await repository.upsert({
      ...baseJob,
      sourceId: 'j1',
      sourceUrl: 'https://example.com/j1',
      companyName: 'Acme',
      title: 'Engineer',
      location: 'San Francisco, CA'
    });
    await repository.upsert({
      ...baseJob,
      sourceId: 'j2',
      sourceUrl: 'https://example.com/j2',
      companyName: 'Maple Inc',
      title: 'Designer',
      location: 'Toronto, Ontario'
    });
    await repository.upsert({
      ...baseJob,
      sourceId: 'j3',
      sourceUrl: 'https://example.com/j3',
      companyName: 'Berlin GmbH',
      title: 'Backend Dev',
      location: 'Berlin, Germany'
    });
    await repository.upsert({
      ...baseJob,
      sourceId: 'j4',
      sourceUrl: 'https://example.com/j4',
      companyName: 'Remote Co',
      title: 'SRE',
      location: 'United States of America'
    });

    const usOnly = await repository.list({ locationCountries: ['US'] });
    const usLocations = usOnly.jobs.map((j) => j.location);
    expect(usLocations).toContain('San Francisco, CA');
    expect(usLocations).toContain('United States of America');
    expect(usOnly.total).toBe(2);

    const caOnly = await repository.list({ locationCountries: ['CA'] });
    expect(caOnly.jobs.map((j) => j.location)).toContain('Toronto, Ontario');
    expect(caOnly.total).toBe(1);

    const usAndCa = await repository.list({ locationCountries: ['US', 'CA'] });
    expect(usAndCa.total).toBe(3);

    const deOnly = await repository.list({ locationCountries: ['DE'] });
    expect(deOnly.jobs.map((j) => j.location)).toContain('Berlin, Germany');
    expect(deOnly.total).toBe(1);
  });

  test('stores and retrieves applicant profile preferredCountries', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, { migrationsFolder });

    const repository = new ApplicantProfileRepository(db);

    await repository.save({
      id: 'default',
      fullName: 'Test User',
      email: 'test@example.com',
      phone: '',
      location: 'NYC',
      summary: '',
      reusableContext: '',
      linkedinUrl: '',
      websiteUrl: '',
      baseResumeFileName: '',
      baseResumeTex: '',
      preferredCountries: ['US', 'CA']
    });

    const stored = await repository.get();
    expect(stored?.preferredCountries).toEqual(['US', 'CA']);
  });

  test('persists the singleton discovery schedule and run log events', async () => {
    const dbPath = createTestDatabasePath();
    const db = createDatabaseClient(dbPath);
    trackedClients.push(db.$client);
    await migrate(db, {
      migrationsFolder
    });

    const schedulesRepository = new DiscoverySchedulesRepository(db);
    const runsRepository = new DiscoveryRunsRepository(db);
    const logEventsRepository = new LogEventsRepository(db);

    const schedule = await schedulesRepository.upsert({
      cronExpression: '0 */4 * * *',
      timezone: 'America/Toronto',
      enabled: true
    });

    const run = await runsRepository.create({
      sourceKind: 'structured',
      runKind: 'structured',
      triggerKind: 'scheduled',
      scheduleId: schedule.id,
      status: 'pending'
    });

    await logEventsRepository.create({
      discoveryRunId: run.id,
      level: 'info',
      message: 'Queued structured discovery run.'
    });

    const storedSchedule = await schedulesRepository.get();
    const storedRun = await runsRepository.findById(run.id);
    const logs = await logEventsRepository.listByDiscoveryRun(run.id);

    expect(storedSchedule?.enabled).toBe(true);
    expect(storedRun?.scheduleId).toBe(schedule.id);
    expect(storedRun?.status).toBe('pending');
    expect(logs).toHaveLength(1);
    expect(logs[0]?.message).toBe('Queued structured discovery run.');
  });
});

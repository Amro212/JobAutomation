import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { migrate } from 'drizzle-orm/libsql/migrator';
import { afterEach, describe, expect, test } from 'vitest';

import {
  ApplicantProfileRepository,
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

    const jobs = await repository.list();

    expect(updated.id).toBe(created.id);
    expect(jobs).toHaveLength(1);
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

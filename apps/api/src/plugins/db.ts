import fp from 'fastify-plugin';

import {
  ApplicationRunsRepository,
  ApplicantProfileRepository,
  AutopilotSettingsRepository,
  AutopilotRunsRepository,
  ArtifactsRepository,
  DiscoveryRunsRepository,
  DiscoverySchedulesRepository,
  DiscoverySourcesRepository,
  JobsRepository,
  LogEventsRepository,
  createDatabaseClient,
  migrateDatabase,
  type JobAutomationDatabase
} from '@jobautomation/db';

export interface ApiRepositories {
  applicationRuns: ApplicationRunsRepository;
  applicantProfile: ApplicantProfileRepository;
  autopilotSettings: AutopilotSettingsRepository;
  autopilotRuns: AutopilotRunsRepository;
  artifacts: ArtifactsRepository;
  discoveryRuns: DiscoveryRunsRepository;
  discoverySchedules: DiscoverySchedulesRepository;
  discoverySources: DiscoverySourcesRepository;
  jobs: JobsRepository;
  logEvents: LogEventsRepository;
}

export function createApiRepositories(db: JobAutomationDatabase): ApiRepositories {
  return {
    applicationRuns: new ApplicationRunsRepository(db),
    applicantProfile: new ApplicantProfileRepository(db),
    autopilotSettings: new AutopilotSettingsRepository(db),
    autopilotRuns: new AutopilotRunsRepository(db),
    artifacts: new ArtifactsRepository(db),
    discoveryRuns: new DiscoveryRunsRepository(db),
    discoverySchedules: new DiscoverySchedulesRepository(db),
    discoverySources: new DiscoverySourcesRepository(db),
    jobs: new JobsRepository(db),
    logEvents: new LogEventsRepository(db)
  };
}

const STARTUP_STALE_APPLICATION_RUN_THRESHOLD_MS = 10 * 60 * 1000;

async function recoverStaleApplicationRunsOnStartup(
  repositories: ApiRepositories
): Promise<void> {
  const cutoff = Date.now() - STARTUP_STALE_APPLICATION_RUN_THRESHOLD_MS;
  const staleRuns = (await repositories.applicationRuns.listByStatus(['running']))
    .filter((run) => run.updatedAt.getTime() < cutoff);

  for (const run of staleRuns) {
    await repositories.applicationRuns.update(run.id, {
      status: 'retry',
      currentStep: 'retry_queued',
      stopReason: 'stale_startup_recovery',
      completedAt: new Date(),
      updatedAt: new Date()
    });

    await repositories.logEvents.create({
      applicationRunId: run.id,
      jobId: run.jobId,
      level: 'warn',
      message: 'Recovered stale running application run on API startup.',
      detailsJson: JSON.stringify({
        applicationRunId: run.id,
        previousStep: run.currentStep,
        previousUpdatedAt: run.updatedAt.toISOString(),
        staleThresholdMs: STARTUP_STALE_APPLICATION_RUN_THRESHOLD_MS
      })
    });
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    db: JobAutomationDatabase;
    repositories: ApiRepositories;
  }
}

export const registerDatabasePlugin = fp(async (app) => {
  const db = createDatabaseClient();
  await migrateDatabase(db);

  const repositories = createApiRepositories(db);

  await recoverStaleApplicationRunsOnStartup(repositories);

  app.decorate('db', db);
  app.decorate('repositories', repositories);

  app.addHook('onClose', async () => {
    await db.$client.close();
  });
});

import fp from 'fastify-plugin';

import {
  ApplicantProfileRepository,
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
  applicantProfile: ApplicantProfileRepository;
  artifacts: ArtifactsRepository;
  discoveryRuns: DiscoveryRunsRepository;
  discoverySchedules: DiscoverySchedulesRepository;
  discoverySources: DiscoverySourcesRepository;
  jobs: JobsRepository;
  logEvents: LogEventsRepository;
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

  app.decorate('db', db);
  app.decorate('repositories', {
    applicantProfile: new ApplicantProfileRepository(db),
    artifacts: new ArtifactsRepository(db),
    discoveryRuns: new DiscoveryRunsRepository(db),
    discoverySchedules: new DiscoverySchedulesRepository(db),
    discoverySources: new DiscoverySourcesRepository(db),
    jobs: new JobsRepository(db),
    logEvents: new LogEventsRepository(db)
  });

  app.addHook('onClose', async () => {
    await db.$client.close();
  });
});

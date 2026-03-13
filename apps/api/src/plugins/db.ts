import fp from 'fastify-plugin';

import {
  ApplicantProfileRepository,
  ArtifactsRepository,
  DiscoveryRunsRepository,
  JobsRepository,
  createDatabaseClient,
  migrateDatabase,
  type JobAutomationDatabase
} from '@jobautomation/db';

export interface ApiRepositories {
  applicantProfile: ApplicantProfileRepository;
  artifacts: ArtifactsRepository;
  discoveryRuns: DiscoveryRunsRepository;
  jobs: JobsRepository;
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
    jobs: new JobsRepository(db)
  });

  app.addHook('onClose', async () => {
    await db.$client.close();
  });
});

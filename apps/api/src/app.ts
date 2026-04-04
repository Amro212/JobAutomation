import Fastify, { type FastifyInstance } from 'fastify';

import { registerApplicantProfileRoutes } from './routes/applicant-profile';
import { registerArtifactsRoutes } from './routes/artifacts';
import { registerApplicationRunRoutes } from './routes/application-runs';
import { registerDiscoveryRunRoutes } from './routes/discovery-runs';
import { registerDiscoveryScheduleRoutes } from './routes/discovery-schedules';
import { registerDiscoverySourceRoutes } from './routes/discovery-sources';
import { registerHealthRoutes } from './routes/health';
import { registerJobReviewRoutes } from './routes/job-reviews';
import { registerJobsRoutes } from './routes/jobs';
import { registerConfigPlugin } from './plugins/config';
import { registerDatabasePlugin } from './plugins/db';
import { registerDiscoveryExecutionPlugin } from './plugins/discovery-execution';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: false
  });

  app.register(registerConfigPlugin);
  app.register(registerDatabasePlugin);
  app.register(registerDiscoveryExecutionPlugin);
  app.register(registerHealthRoutes);
  app.register(registerJobsRoutes);
  app.register(registerJobReviewRoutes);
  app.register(registerDiscoverySourceRoutes);
  app.register(registerDiscoveryRunRoutes);
  app.register(registerApplicationRunRoutes);
  app.register(registerDiscoveryScheduleRoutes);
  app.register(registerApplicantProfileRoutes);
  app.register(registerArtifactsRoutes);

  return app;
}

import Fastify, { type FastifyInstance } from 'fastify';

import { registerApplicantProfileRoutes } from './routes/applicant-profile';
import { registerDiscoveryRunRoutes } from './routes/discovery-runs';
import { registerHealthRoutes } from './routes/health';
import { registerJobsRoutes } from './routes/jobs';
import { registerConfigPlugin } from './plugins/config';
import { registerDatabasePlugin } from './plugins/db';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: false
  });

  app.register(registerConfigPlugin);
  app.register(registerDatabasePlugin);
  app.register(registerHealthRoutes);
  app.register(registerJobsRoutes);
  app.register(registerDiscoveryRunRoutes);
  app.register(registerApplicantProfileRoutes);

  return app;
}

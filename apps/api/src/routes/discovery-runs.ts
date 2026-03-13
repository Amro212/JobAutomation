import { discoveryRunRecordSchema } from '@jobautomation/core';
import type { FastifyPluginAsync } from 'fastify';

export const registerDiscoveryRunRoutes: FastifyPluginAsync = async (app) => {
  app.get('/discovery-runs', async () => {
    const runs = await app.repositories.discoveryRuns.list();
    return {
      runs: runs.map((run) => discoveryRunRecordSchema.parse(run))
    };
  });
};

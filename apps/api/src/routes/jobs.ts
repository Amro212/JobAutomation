import { jobListFiltersSchema } from '@jobautomation/core';
import type { FastifyPluginAsync } from 'fastify';

function getQueryValue(
  query: Record<string, unknown>,
  key: 'sourceKind' | 'status' | 'remoteType' | 'title' | 'location' | 'companyName'
): string | undefined {
  const value = query[key];
  return typeof value === 'string' ? value : undefined;
}

export const registerJobsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/jobs', async (request) => {
    const query = (request.query ?? {}) as Record<string, unknown>;
    const filters = jobListFiltersSchema.parse({
      sourceKind: getQueryValue(query, 'sourceKind'),
      status: getQueryValue(query, 'status'),
      remoteType: getQueryValue(query, 'remoteType'),
      title: getQueryValue(query, 'title'),
      location: getQueryValue(query, 'location'),
      companyName: getQueryValue(query, 'companyName')
    });
    const jobs = await app.repositories.jobs.list(filters);
    return { jobs };
  });

  app.get('/jobs/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = await app.repositories.jobs.findById(jobId);

    if (!job) {
      return reply.code(404).send({ message: 'Job not found.' });
    }

    return { job };
  });
};

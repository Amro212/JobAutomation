import {
  JOB_LIST_DEFAULT_PAGE_SIZE,
  jobListFiltersSchema,
  jobListQuerySchema
} from '@jobautomation/core';
import type { FastifyPluginAsync } from 'fastify';

function getQueryValue(query: Record<string, unknown>, key: string): string | undefined {
  const value = query[key];
  return typeof value === 'string' ? value : undefined;
}

export const registerJobsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/jobs', async (request) => {
    const query = (request.query ?? {}) as Record<string, unknown>;
    const parsed = jobListQuerySchema.parse({
      sourceKind: getQueryValue(query, 'sourceKind'),
      status: getQueryValue(query, 'status'),
      remoteType: getQueryValue(query, 'remoteType'),
      title: getQueryValue(query, 'title'),
      location: getQueryValue(query, 'location'),
      companyName: getQueryValue(query, 'companyName'),
      page: getQueryValue(query, 'page'),
      pageSize: getQueryValue(query, 'pageSize')
    });

    const filters = jobListFiltersSchema.parse({
      sourceKind: parsed.sourceKind,
      status: parsed.status,
      remoteType: parsed.remoteType,
      title: parsed.title,
      location: parsed.location,
      companyName: parsed.companyName
    });

    const usePagination = parsed.page !== undefined || parsed.pageSize !== undefined;
    const page = parsed.page ?? 1;
    const pageSize = parsed.pageSize ?? JOB_LIST_DEFAULT_PAGE_SIZE;

    const { jobs, total } = usePagination
      ? await app.repositories.jobs.list(filters, { page, pageSize })
      : await app.repositories.jobs.list(filters);

    return { jobs, total };
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

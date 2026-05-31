import {
  JOB_LIST_DEFAULT_PAGE_SIZE,
  jobListFiltersSchema,
  jobListQuerySchema,
  prefilterContextFromApplicant,
  prefilterMatchesMeaningful
} from '@jobautomation/core';
import type { FastifyPluginAsync } from 'fastify';

import { recomputeJobPrefilterMatches } from '../services/job-prefilter-recompute';

function getQueryValue(query: Record<string, unknown>, key: string): string | undefined {
  const value = query[key];
  return typeof value === 'string' ? value : undefined;
}

function getQueryArray(query: Record<string, unknown>, key: string): string[] | undefined {
  const value = query[key];
  if (typeof value === 'string') {
    return value.trim().length > 0 ? [value] : undefined;
  }
  if (Array.isArray(value)) {
    const filtered = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    return filtered.length > 0 ? filtered : undefined;
  }
  return undefined;
}

export const registerJobsRoutes: FastifyPluginAsync = async (app) => {
  app.post('/jobs/recompute-prefilter-matches', async () => {
    const profile = await app.repositories.applicantProfile.get();
    return recomputeJobPrefilterMatches(app.repositories.jobs, profile);
  });

  app.get('/jobs', async (request) => {
    const query = (request.query ?? {}) as Record<string, unknown>;
    const parsed = jobListQuerySchema.parse({
      sourceKind: getQueryValue(query, 'sourceKind'),
      status: getQueryValue(query, 'status'),
      remoteType: getQueryValue(query, 'remoteType'),
      title: getQueryValue(query, 'title'),
      location: getQueryValue(query, 'location'),
      companyName: getQueryValue(query, 'companyName'),
      matchProfile: getQueryValue(query, 'matchProfile'),
      page: getQueryValue(query, 'page'),
      pageSize: getQueryValue(query, 'pageSize')
    });

    const applicant = await app.repositories.applicantProfile.get();
    const meaningful = prefilterMatchesMeaningful(prefilterContextFromApplicant(applicant));
    const matchProfile =
      parsed.matchProfile === 'me' && meaningful ? ('me' as const) : ('all' as const);

    const filters = jobListFiltersSchema.parse({
      sourceKind: parsed.sourceKind,
      status: parsed.status,
      remoteType: parsed.remoteType,
      title: parsed.title,
      location: parsed.location,
      companyName: parsed.companyName,
      locationCountries: getQueryArray(query, 'country'),
      matchProfile
    });

    // Pillar 1: Enforce server-side pagination by default to prevent large unpaginated dumps
    const usePagination = true; 
    const page = parsed.page ?? 1;
    const pageSize = parsed.pageSize ?? JOB_LIST_DEFAULT_PAGE_SIZE;

    // Pillar 3: Decouple prefilter match recomputation from GET requests to avoid HTTP request timeouts.
    // Stale matches should be computed in the background, not synchronously on jobs fetch.

    const { jobs, total } = await app.repositories.jobs.listSummary(filters, { page, pageSize });

    return { jobs, total };
  });

  app.get('/jobs/distinct-companies', async (request) => {
    const query = (request.query ?? {}) as Record<string, unknown>;
    const parsed = jobListQuerySchema.parse({
      sourceKind: getQueryValue(query, 'sourceKind'),
      status: getQueryValue(query, 'status'),
      remoteType: getQueryValue(query, 'remoteType'),
      title: getQueryValue(query, 'title'),
      location: getQueryValue(query, 'location'),
      companyName: getQueryValue(query, 'companyName'),
      matchProfile: getQueryValue(query, 'matchProfile'),
      page: getQueryValue(query, 'page'),
      pageSize: getQueryValue(query, 'pageSize')
    });

    const applicant = await app.repositories.applicantProfile.get();
    const meaningful = prefilterMatchesMeaningful(prefilterContextFromApplicant(applicant));
    const matchProfile =
      parsed.matchProfile === 'me' && meaningful ? ('me' as const) : ('all' as const);

    const filters = jobListFiltersSchema.parse({
      sourceKind: parsed.sourceKind,
      status: parsed.status,
      remoteType: parsed.remoteType,
      title: parsed.title,
      location: parsed.location,
      companyName: parsed.companyName,
      locationCountries: getQueryArray(query, 'country'),
      matchProfile
    });

    const companies = await app.repositories.jobs.distinctCompanyNames(filters);
    return { companies };
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

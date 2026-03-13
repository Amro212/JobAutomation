import type { FastifyPluginAsync } from 'fastify';

export const registerJobsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/jobs', async () => {
    const jobs = await app.repositories.jobs.list();
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

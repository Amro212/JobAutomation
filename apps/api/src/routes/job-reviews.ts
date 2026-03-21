import { isOpenRouterConfigured } from '@jobautomation/config';
import { jobReviewPatchSchema } from '@jobautomation/core';
import { JobScoreError, scoreJob, shortlistJob } from '@jobautomation/discovery';
import type { FastifyPluginAsync } from 'fastify';

export const registerJobReviewRoutes: FastifyPluginAsync = async (app) => {
  app.get('/job-reviews/capabilities', async () => {
    return {
      scoringEnabled: isOpenRouterConfigured(app.config)
    };
  });

  app.patch('/job-reviews/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const payload = jobReviewPatchSchema.parse(request.body ?? {});
    const job = await app.repositories.jobs.updateReview(jobId, payload);

    if (!job) {
      return reply.code(404).send({ message: 'Job not found.' });
    }

    return { job };
  });

  app.post('/job-reviews/:jobId/shortlist', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = await shortlistJob({
      jobId,
      jobsRepository: app.repositories.jobs,
      shortlisted: true
    });

    if (!job) {
      return reply.code(404).send({ message: 'Job not found.' });
    }

    return { job };
  });

  app.delete('/job-reviews/:jobId/shortlist', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = await shortlistJob({
      jobId,
      jobsRepository: app.repositories.jobs,
      shortlisted: false
    });

    if (!job) {
      return reply.code(404).send({ message: 'Job not found.' });
    }

    return { job };
  });

  app.post('/job-reviews/:jobId/score', async (request, reply) => {
    const { jobId } = request.params as { jobId: string };

    try {
      const applicantProfile = await app.repositories.applicantProfile.get();

      const job = await scoreJob({
        jobId,
        jobsRepository: app.repositories.jobs,
        applicantProfile,
        ...(app.config.OPENROUTER_API_KEY
          ? {
              openRouter: {
                apiKey: app.config.OPENROUTER_API_KEY,
                baseUrl: app.config.OPENROUTER_API_BASE_URL,
                model: app.config.OPENROUTER_JOB_SUMMARY_MODEL
              }
            }
          : {})
      });

      return { job };
    } catch (error) {
      if (error instanceof JobScoreError) {
        if (error.code === 'not_found') {
          return reply.code(404).send({ message: error.message });
        }

        if (error.code === 'not_configured') {
          return reply.code(409).send({ message: error.message });
        }

        if (error.code === 'invalid_output') {
          return reply.code(422).send({ message: error.message });
        }

        if (error.code === 'prefilter_rejected') {
          return reply.code(422).send({ message: error.message });
        }

        return reply.code(502).send({ message: error.message });
      }

      throw error;
    }
  });
};

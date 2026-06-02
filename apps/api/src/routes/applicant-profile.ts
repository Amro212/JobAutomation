import { applicantProfileInputSchema } from '@jobautomation/core';
import { generateJobKeywordProfile, JobKeywordProfileError } from '@jobautomation/discovery';
import type { FastifyPluginAsync } from 'fastify';

import { createStructuredAiProvider, isStructuredAiConfigured } from '../services/ai-provider';
import { recomputeJobPrefilterMatches } from '../services/job-prefilter-recompute';

type ApplicantProfileReadiness = {
  hasBaseResume: boolean;
  hasReusableContext: boolean;
  readyForTailoring: boolean;
};

function buildReadiness(
  profile: { baseResumeTex: string; reusableContext: string } | null
): ApplicantProfileReadiness {
  const hasBaseResume = Boolean(profile?.baseResumeTex.trim());
  const hasReusableContext = Boolean(profile?.reusableContext.trim());

  return {
    hasBaseResume,
    hasReusableContext,
    readyForTailoring: hasBaseResume && hasReusableContext
  };
}

export const registerApplicantProfileRoutes: FastifyPluginAsync = async (app) => {
  app.get('/applicant-profile', async () => {
    const profile = await app.repositories.applicantProfile.get();
    return { profile, readiness: buildReadiness(profile) };
  });

  app.put('/applicant-profile', async (request) => {
    const before = await app.repositories.applicantProfile.get();
    const input = applicantProfileInputSchema.parse(request.body ?? {});
    const profile = await app.repositories.applicantProfile.save(input);

    const keywordChanged =
      JSON.stringify(before?.jobKeywordProfile ?? null) !== JSON.stringify(profile.jobKeywordProfile ?? null);

    if (keywordChanged) {
      await recomputeJobPrefilterMatches(app.repositories.jobs, profile);
    }

    return { profile, readiness: buildReadiness(profile) };
  });

  app.post('/applicant-profile/job-keyword-profile/generate', async (_request, reply) => {
    try {
      const existing = await app.repositories.applicantProfile.get();
      if (!existing) {
        return reply
          .code(404)
          .send({ message: 'Save applicant setup before generating a job filter profile.' });
      }

      if (!isStructuredAiConfigured(app.config)) {
        return reply.code(409).send({ message: 'Sign in to enable hosted AI generation.' });
      }

      const keywordProfile = await generateJobKeywordProfile({
        applicantProfile: existing,
        provider: createStructuredAiProvider(app.config, {
          model: app.config.OPENROUTER_JOB_SUMMARY_MODEL
        })
      });

      const profile = await app.repositories.applicantProfile.saveJobKeywordProfile(keywordProfile);
      await recomputeJobPrefilterMatches(app.repositories.jobs, profile);
      return { profile, readiness: buildReadiness(profile) };
    } catch (error) {
      if (error instanceof JobKeywordProfileError) {
        if (error.code === 'not_configured') {
          return reply.code(409).send({ message: error.message });
        }

        if (error.code === 'insufficient_context' || error.code === 'invalid_output') {
          return reply.code(422).send({ message: error.message });
        }

        return reply.code(502).send({ message: error.message });
      }

      throw error;
    }
  });
};

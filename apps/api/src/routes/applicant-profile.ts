import { applicantProfileInputSchema } from '@jobautomation/core';
import type { FastifyPluginAsync } from 'fastify';

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
    const input = applicantProfileInputSchema.parse(request.body ?? {});
    const profile = await app.repositories.applicantProfile.save(input);
    return { profile, readiness: buildReadiness(profile) };
  });
};

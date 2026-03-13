import { applicantProfileInputSchema } from '@jobautomation/core';
import type { FastifyPluginAsync } from 'fastify';

export const registerApplicantProfileRoutes: FastifyPluginAsync = async (app) => {
  app.get('/applicant-profile', async () => {
    const profile = await app.repositories.applicantProfile.get();
    return { profile };
  });

  app.put('/applicant-profile', async (request) => {
    const input = applicantProfileInputSchema.parse(request.body ?? {});
    const profile = await app.repositories.applicantProfile.save(input);
    return { profile };
  });
};

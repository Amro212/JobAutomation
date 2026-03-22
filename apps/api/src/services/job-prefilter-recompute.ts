import {
  prefilterContextFromApplicant,
  prefilterMatchesMeaningful,
  type ApplicantProfile
} from '@jobautomation/core';
import type { JobsRepository } from '@jobautomation/db';

export async function recomputeJobPrefilterMatches(
  jobsRepository: JobsRepository,
  applicantProfile: ApplicantProfile | null
): Promise<{ evaluated: number }> {
  const ctx = prefilterContextFromApplicant(applicantProfile);
  if (!prefilterMatchesMeaningful(ctx)) {
    await jobsRepository.clearAllPrefilterResults();
    return { evaluated: 0 };
  }

  const evaluated = await jobsRepository.recomputePrefilterForAllJobs(ctx);
  return { evaluated };
}

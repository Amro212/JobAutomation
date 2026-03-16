import type { JobRecord } from '@jobautomation/core';
import type { JobsRepository } from '@jobautomation/db';

export type ShortlistJobInput = {
  jobId: string;
  jobsRepository: JobsRepository;
  shortlisted: boolean;
};

export async function shortlistJob(input: ShortlistJobInput): Promise<JobRecord | null> {
  return input.jobsRepository.updateReview(input.jobId, {
    status: input.shortlisted ? 'shortlisted' : 'reviewing'
  });
}

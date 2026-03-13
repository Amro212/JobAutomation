import {
  discoveryRunRecordSchema,
  type DiscoveryRunRecord,
  type DiscoveryRunStatus
} from '@jobautomation/core';
import type { DiscoveryRunsRepository } from '@jobautomation/db';

export type UpsertDiscoveryRunInput = {
  runsRepository: DiscoveryRunsRepository;
  runId: string;
  status: DiscoveryRunStatus;
  jobCount: number;
  newJobCount: number;
  updatedJobCount: number;
  errorMessage?: string | null;
};

export async function upsertDiscoveryRun(
  input: UpsertDiscoveryRunInput
): Promise<DiscoveryRunRecord> {
  const record = await input.runsRepository.markFinished({
    id: input.runId,
    status: input.status,
    jobCount: input.jobCount,
    newJobCount: input.newJobCount,
    updatedJobCount: input.updatedJobCount,
    errorMessage: input.errorMessage ?? null
  });

  return discoveryRunRecordSchema.parse(record);
}

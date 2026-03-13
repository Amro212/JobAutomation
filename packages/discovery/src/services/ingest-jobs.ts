import {
  discoveryRunRecordSchema,
  type DiscoveryRunRecord,
  type JobRecord,
  type JobStatus
} from '@jobautomation/core';
import type { DiscoveryRunsRepository, JobsRepository } from '@jobautomation/db';

import type { SourceAdapter } from '../contracts/source-adapter';
import type { NormalizedJob } from '../contracts/normalized-job';
import { dedupeJobs } from './dedupe-jobs';
import { upsertDiscoveryRun } from './upsert-discovery-run';

export type IngestJobsInput<TSourceJob> = {
  adapter: SourceAdapter<TSourceJob>;
  jobs: readonly TSourceJob[];
  jobsRepository: JobsRepository;
  runsRepository: DiscoveryRunsRepository;
  capturedAt?: Date;
};

export type IngestJobsResult = {
  run: DiscoveryRunRecord;
  jobs: JobRecord[];
};

function serializeRawPayload(payload: unknown): string | null {
  if (payload == null) {
    return null;
  }

  return JSON.stringify(payload);
}

function hasJobChanged(existing: JobRecord, candidate: NormalizedJob): boolean {
  return (
    existing.sourceUrl !== candidate.sourceUrl ||
    existing.companyName !== candidate.companyName ||
    existing.title !== candidate.title ||
    existing.location !== candidate.location ||
    existing.remoteType !== candidate.remoteType ||
    existing.employmentType !== candidate.employmentType ||
    existing.compensationText !== candidate.compensationText ||
    existing.descriptionText !== candidate.descriptionText ||
    existing.rawPayload !== serializeRawPayload(candidate.rawPayload) ||
    existing.updatedAt.getTime() !== candidate.updatedAt.getTime()
  );
}

function resolveJobStatus(existing: JobRecord | null): JobStatus {
  return existing?.status ?? 'discovered';
}

export async function ingestJobs<TSourceJob>(
  input: IngestJobsInput<TSourceJob>
): Promise<IngestJobsResult> {
  const capturedAt = input.capturedAt ?? new Date();
  const startedRun = discoveryRunRecordSchema.parse(
    await input.runsRepository.create(input.adapter.sourceKind)
  );

  try {
    const normalizedJobs = dedupeJobs(
      input.jobs.map((job) =>
        input.adapter.normalizeJob(job, {
          capturedAt
        })
      )
    );

    let newJobCount = 0;
    let updatedJobCount = 0;
    const persistedJobs: JobRecord[] = [];

    for (const normalizedJob of normalizedJobs) {
      const existing = await input.jobsRepository.findBySource(
        normalizedJob.sourceKind,
        normalizedJob.sourceId
      );

      if (!existing) {
        newJobCount += 1;
      } else if (hasJobChanged(existing, normalizedJob)) {
        updatedJobCount += 1;
      }

      const persistedJob = await input.jobsRepository.upsert({
        sourceKind: normalizedJob.sourceKind,
        sourceId: normalizedJob.sourceId,
        sourceUrl: normalizedJob.sourceUrl,
        companyName: normalizedJob.companyName,
        title: normalizedJob.title,
        location: normalizedJob.location,
        remoteType: normalizedJob.remoteType,
        employmentType: normalizedJob.employmentType,
        compensationText: normalizedJob.compensationText,
        descriptionText: normalizedJob.descriptionText,
        rawPayload: serializeRawPayload(normalizedJob.rawPayload),
        discoveryRunId: startedRun.id,
        status: resolveJobStatus(existing),
        discoveredAt: existing?.discoveredAt ?? normalizedJob.discoveredAt,
        updatedAt: normalizedJob.updatedAt
      });

      persistedJobs.push(persistedJob);
    }

    const completedRun = await upsertDiscoveryRun({
      runsRepository: input.runsRepository,
      runId: startedRun.id,
      status: 'completed',
      jobCount: normalizedJobs.length,
      newJobCount,
      updatedJobCount
    });

    return {
      run: completedRun,
      jobs: persistedJobs
    };
  } catch (error) {
    await upsertDiscoveryRun({
      runsRepository: input.runsRepository,
      runId: startedRun.id,
      status: 'failed',
      jobCount: 0,
      newJobCount: 0,
      updatedJobCount: 0,
      errorMessage: error instanceof Error ? error.message : 'Unknown discovery ingestion error.'
    });

    throw error;
  }
}

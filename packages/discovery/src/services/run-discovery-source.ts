import type { DiscoverySourceRecord, DiscoveryRunTriggerKind } from '@jobautomation/core';
import type { DiscoveryRunsRepository, JobsRepository } from '@jobautomation/db';

import { type SourceAdapter } from '../contracts/source-adapter';
import {
  createAshbyAdapter,
  fetchAshbyJobs
} from '../adapters/ashby';
import {
  createGreenhouseAdapter,
  fetchGreenhouseJobs,
  filterGreenhouseJobs
} from '../adapters/greenhouse';
import { createLeverAdapter, fetchLeverJobs } from '../adapters/lever';
import { ingestJobs, type IngestJobsResult } from './ingest-jobs';

export type LoadDiscoverySourceJobsInput = {
  source: DiscoverySourceRecord;
  greenhouseBaseUrl: string;
  leverBaseUrl: string;
  ashbyBaseUrl: string;
  fetchImpl?: typeof fetch;
};

export type LoadedDiscoverySourceJobs = {
  adapter: SourceAdapter<unknown>;
  jobs: readonly unknown[];
};

export type RunDiscoverySourceInput = LoadDiscoverySourceJobsInput & {
  jobsRepository: JobsRepository;
  runsRepository: DiscoveryRunsRepository;
  capturedAt?: Date;
  triggerKind?: DiscoveryRunTriggerKind;
  scheduleId?: string | null;
};

export async function loadDiscoverySourceJobs(
  input: LoadDiscoverySourceJobsInput
): Promise<LoadedDiscoverySourceJobs> {
  if (!input.source.enabled) {
    throw new Error(`Discovery source ${input.source.id} is disabled.`);
  }

  switch (input.source.sourceKind) {
    case 'greenhouse': {
      const jobs = filterGreenhouseJobs(
        await fetchGreenhouseJobs({
          boardToken: input.source.sourceKey,
          baseUrl: input.greenhouseBaseUrl,
          fetchImpl: input.fetchImpl
        })
      );

      return {
        adapter: createGreenhouseAdapter(input.source),
        jobs
      };
    }
    case 'lever': {
      const jobs = await fetchLeverJobs({
        companyHandle: input.source.sourceKey,
        baseUrl: input.leverBaseUrl,
        fetchImpl: input.fetchImpl
      });

      return {
        adapter: createLeverAdapter(input.source),
        jobs
      };
    }
    case 'ashby': {
      const jobs = await fetchAshbyJobs({
        boardName: input.source.sourceKey,
        baseUrl: input.ashbyBaseUrl,
        fetchImpl: input.fetchImpl
      });

      return {
        adapter: createAshbyAdapter(input.source),
        jobs
      };
    }
    default:
      throw new Error(`Structured discovery for ${input.source.sourceKind} is not implemented yet.`);
  }
}

export async function runDiscoverySource(
  input: RunDiscoverySourceInput
): Promise<IngestJobsResult> {
  const loaded = await loadDiscoverySourceJobs(input);

  return ingestJobs({
    adapter: loaded.adapter,
    jobs: loaded.jobs,
    jobsRepository: input.jobsRepository,
    runsRepository: input.runsRepository,
    capturedAt: input.capturedAt,
    runMetadata: {
      discoverySourceId: input.source.id,
      runKind: 'single-source',
      triggerKind: input.triggerKind ?? 'manual',
      scheduleId: input.scheduleId ?? null
    }
  });
}

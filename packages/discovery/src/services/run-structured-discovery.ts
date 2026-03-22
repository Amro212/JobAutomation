import type { DiscoveryRunRecord, DiscoverySourceRecord, LogLevel } from '@jobautomation/core';
import type {
  DiscoveryRunsRepository,
  JobsRepository,
  LogEventsRepository
} from '@jobautomation/db';

import { ingestJobsIntoRun } from './ingest-jobs';
import { loadDiscoverySourceJobs } from './run-discovery-source';
import { upsertDiscoveryRun } from './upsert-discovery-run';

export type RunStructuredDiscoveryInput = {
  run: DiscoveryRunRecord;
  sources: DiscoverySourceRecord[];
  jobsRepository: JobsRepository;
  runsRepository: DiscoveryRunsRepository;
  logEventsRepository: LogEventsRepository;
  greenhouseBaseUrl: string;
  leverBaseUrl: string;
  ashbyBaseUrl: string;
  fetchImpl?: typeof fetch;
  capturedAt?: Date;
};

function stringifyDetails(details: Record<string, unknown>): string {
  return JSON.stringify(details);
}

async function logRunEvent(
  repository: LogEventsRepository,
  runId: string,
  level: LogLevel,
  message: string,
  details: Record<string, unknown>
): Promise<void> {
  await repository.create({
    discoveryRunId: runId,
    level,
    message,
    detailsJson: stringifyDetails(details)
  });
}

export async function runStructuredDiscovery(
  input: RunStructuredDiscoveryInput
): Promise<DiscoveryRunRecord> {
  await input.runsRepository.markRunning(input.run.id);
  await logRunEvent(input.logEventsRepository, input.run.id, 'info', 'Started discovery run.', {
    runKind: input.run.runKind,
    triggerKind: input.run.triggerKind,
    sourceCount: input.sources.length
  });

  let jobCount = 0;
  let newJobCount = 0;
  let updatedJobCount = 0;
  const failures: string[] = [];
  let successfulSourceCount = 0;

  for (const source of input.sources) {
    const details = {
      discoverySourceId: source.id,
      sourceKind: source.sourceKind,
      sourceKey: source.sourceKey,
      label: source.label
    };

    if (!source.enabled) {
      await logRunEvent(
        input.logEventsRepository,
        input.run.id,
        'warn',
        `Skipped disabled ${source.sourceKind} source ${source.label}.`,
        details
      );
      continue;
    }

    await logRunEvent(
      input.logEventsRepository,
      input.run.id,
      'info',
      `Starting ${source.sourceKind} source ${source.label}.`,
      details
    );

    try {
      const loaded = await loadDiscoverySourceJobs({
        source,
        greenhouseBaseUrl: input.greenhouseBaseUrl,
        leverBaseUrl: input.leverBaseUrl,
        ashbyBaseUrl: input.ashbyBaseUrl,
        fetchImpl: input.fetchImpl
      });

      const counts = await ingestJobsIntoRun({
        runId: input.run.id,
        adapter: loaded.adapter,
        jobs: loaded.jobs,
        jobsRepository: input.jobsRepository,
        capturedAt: input.capturedAt
      });

      jobCount += counts.jobCount;
      newJobCount += counts.newJobCount;
      updatedJobCount += counts.updatedJobCount;

      successfulSourceCount += 1;

      await logRunEvent(
        input.logEventsRepository,
        input.run.id,
        'info',
        `Completed ${source.sourceKind} source ${source.label}.`,
        {
          ...details,
          jobCount: counts.jobCount,
          newJobCount: counts.newJobCount,
          updatedJobCount: counts.updatedJobCount
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown discovery source error.';
      failures.push(`${source.label}: ${message}`);
      await logRunEvent(
        input.logEventsRepository,
        input.run.id,
        'error',
        `Failed ${source.sourceKind} source ${source.label}.`,
        {
          ...details,
          errorMessage: message
        }
      );
    }
  }

  const finalStatus =
    failures.length === 0
      ? 'completed'
      : successfulSourceCount > 0
        ? 'partial'
        : 'failed';

  const finalRun = await upsertDiscoveryRun({
    runsRepository: input.runsRepository,
    runId: input.run.id,
    status: finalStatus,
    jobCount,
    newJobCount,
    updatedJobCount,
    errorMessage: failures.length === 0 ? null : failures.join(' | ')
  });

  await logRunEvent(
    input.logEventsRepository,
    input.run.id,
    failures.length === 0 ? 'info' : 'warn',
    failures.length === 0 ? 'Completed discovery run.' : 'Completed discovery run with source failures.',
    {
      jobCount,
      newJobCount,
      updatedJobCount,
      failureCount: failures.length
    }
  );

  return finalRun;
}

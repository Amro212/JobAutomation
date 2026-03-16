import type { DiscoveryRunRecord, DiscoverySourceRecord } from '@jobautomation/core';
import type { DiscoveryRunsRepository, LogEventsRepository } from '@jobautomation/db';

export type RetryDiscoveryStepInput = {
  source: DiscoverySourceRecord;
  runsRepository: DiscoveryRunsRepository;
  logEventsRepository: LogEventsRepository;
  requestedFromRun?: DiscoveryRunRecord | null;
};

export async function retryDiscoveryStep(
  input: RetryDiscoveryStepInput
): Promise<DiscoveryRunRecord> {
  const run = await input.runsRepository.create({
    sourceKind: input.source.sourceKind,
    runKind: 'single-source',
    triggerKind: 'retry',
    discoverySourceId: input.source.id,
    status: 'pending'
  });

  await input.logEventsRepository.create({
    discoveryRunId: run.id,
    level: 'info',
    message: `Queued retry for ${input.source.sourceKind} source ${input.source.label}.`,
    detailsJson: JSON.stringify({
      discoverySourceId: input.source.id,
      sourceKind: input.source.sourceKind,
      sourceKey: input.source.sourceKey,
      label: input.source.label,
      requestedFromRunId: input.requestedFromRun?.id ?? null
    })
  });

  return run;
}

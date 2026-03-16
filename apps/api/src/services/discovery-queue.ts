import PQueue from 'p-queue';

import type { DiscoveryRunRecord, DiscoverySourceRecord } from '@jobautomation/core';
import type {
  DiscoveryRunsRepository,
  JobsRepository,
  LogEventsRepository
} from '@jobautomation/db';
import { runStructuredDiscovery } from '@jobautomation/discovery';

export type QueueDiscoveryRunInput = {
  run: DiscoveryRunRecord;
  sources: DiscoverySourceRecord[];
};

export type DiscoveryQueueServiceInput = {
  jobsRepository: JobsRepository;
  runsRepository: DiscoveryRunsRepository;
  logEventsRepository: LogEventsRepository;
  greenhouseBaseUrl: string;
  leverBaseUrl: string;
  ashbyBaseUrl: string;
  concurrency?: number;
};

export class DiscoveryQueueService {
  private readonly queue: PQueue;

  constructor(private readonly input: DiscoveryQueueServiceInput) {
    this.queue = new PQueue({
      concurrency: input.concurrency ?? 1
    });
  }

  enqueueRun(input: QueueDiscoveryRunInput): void {
    void this.queue
      .add(async () => {
        try {
          await runStructuredDiscovery({
            run: input.run,
            sources: input.sources,
            jobsRepository: this.input.jobsRepository,
            runsRepository: this.input.runsRepository,
            logEventsRepository: this.input.logEventsRepository,
            greenhouseBaseUrl: this.input.greenhouseBaseUrl,
            leverBaseUrl: this.input.leverBaseUrl,
            ashbyBaseUrl: this.input.ashbyBaseUrl
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown discovery queue error.';
          await this.input.logEventsRepository.create({
            discoveryRunId: input.run.id,
            level: 'error',
            message: 'Discovery queue execution failed.',
            detailsJson: JSON.stringify({
              errorMessage: message
            })
          });
          await this.input.runsRepository.markFinished({
            id: input.run.id,
            status: 'failed',
            jobCount: 0,
            newJobCount: 0,
            updatedJobCount: 0,
            errorMessage: message
          });
        }
      })
      .catch(() => {
        // The task handles its own failure path; avoid an unhandled rejection here.
      });
  }

  async onIdle(): Promise<void> {
    await this.queue.onIdle();
  }
}

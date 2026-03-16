import cron, { type ScheduledTask } from 'node-cron';

import type { DiscoveryScheduleRecord, DiscoveryScheduleUpdate, DiscoveryRunRecord } from '@jobautomation/core';
import type {
  DiscoveryRunsRepository,
  DiscoverySchedulesRepository,
  DiscoverySourcesRepository,
  LogEventsRepository
} from '@jobautomation/db';

import type { DiscoveryQueueService } from './discovery-queue';

export type DiscoverySchedulerServiceInput = {
  schedulesRepository: DiscoverySchedulesRepository;
  sourcesRepository: DiscoverySourcesRepository;
  runsRepository: DiscoveryRunsRepository;
  logEventsRepository: LogEventsRepository;
  queueService: DiscoveryQueueService;
  defaultCronExpression: string;
  defaultTimezone: string;
};

export class DiscoverySchedulerService {
  private task: ScheduledTask | null = null;

  constructor(private readonly input: DiscoverySchedulerServiceInput) {}

  async start(): Promise<void> {
    const schedule = await this.getSchedule();
    await this.syncTask(schedule);
  }

  async stop(): Promise<void> {
    this.task?.stop();
    this.task?.destroy();
    this.task = null;
  }

  async getSchedule(): Promise<DiscoveryScheduleRecord> {
    const existing = await this.input.schedulesRepository.get();

    if (existing) {
      return existing;
    }

    return this.input.schedulesRepository.upsert({
      cronExpression: this.input.defaultCronExpression,
      timezone: this.input.defaultTimezone,
      enabled: false
    });
  }

  async updateSchedule(input: DiscoveryScheduleUpdate): Promise<DiscoveryScheduleRecord> {
    if (input.cronExpression && !cron.validate(input.cronExpression)) {
      throw new Error('Invalid cron expression.');
    }

    const schedule = await this.input.schedulesRepository.upsert(input);
    await this.syncTask(schedule);
    return schedule;
  }

  async enqueueScheduledRun(): Promise<DiscoveryRunRecord | null> {
    const schedule = await this.getSchedule();
    const sources = await this.input.sourcesRepository.listEnabled();

    if (!schedule.enabled || sources.length === 0) {
      return null;
    }

    const run = await this.input.runsRepository.create({
      sourceKind: 'structured',
      runKind: 'structured',
      triggerKind: 'scheduled',
      scheduleId: schedule.id,
      status: 'pending'
    });

    await this.input.logEventsRepository.create({
      discoveryRunId: run.id,
      level: 'info',
      message: 'Queued scheduled discovery run.',
      detailsJson: JSON.stringify({
        scheduleId: schedule.id,
        sourceCount: sources.length
      })
    });

    this.input.queueService.enqueueRun({
      run,
      sources
    });

    return run;
  }

  private async syncTask(schedule: DiscoveryScheduleRecord): Promise<void> {
    await this.stop();

    if (!schedule.enabled) {
      return;
    }

    this.task = cron.schedule(
      schedule.cronExpression,
      () => {
        void this.enqueueScheduledRun();
      },
      {
        timezone: schedule.timezone
      }
    );
  }
}

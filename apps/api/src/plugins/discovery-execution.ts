import fp from 'fastify-plugin';
import { dirname, join } from 'node:path';

import type { DiscoveryRunRecord, DiscoverySourceRecord } from '@jobautomation/core';
import { logEventRecordSchema } from '@jobautomation/core';

import { DiscoveryQueueService } from '../services/discovery-queue';
import { DiscoverySchedulerService } from '../services/discovery-scheduler';

declare module 'fastify' {
  interface FastifyInstance {
    discoveryQueue: DiscoveryQueueService;
    discoveryScheduler: DiscoverySchedulerService;
  }
}

export const registerDiscoveryExecutionPlugin = fp(async (app) => {
  const queue = new DiscoveryQueueService({
    artifactsRepository: app.repositories.artifacts,
    artifactsRootDir: join(dirname(app.config.JOB_AUTOMATION_DB_PATH), 'artifacts'),
    jobsRepository: app.repositories.jobs,
    runsRepository: app.repositories.discoveryRuns,
    logEventsRepository: app.repositories.logEvents,
    greenhouseBaseUrl: app.config.GREENHOUSE_API_BASE_URL,
    leverBaseUrl: app.config.LEVER_API_BASE_URL,
    ashbyBaseUrl: app.config.ASHBY_API_BASE_URL,
    concurrency: app.config.DISCOVERY_QUEUE_CONCURRENCY
  });

  const scheduler = new DiscoverySchedulerService({
    schedulesRepository: app.repositories.discoverySchedules,
    sourcesRepository: app.repositories.discoverySources,
    runsRepository: app.repositories.discoveryRuns,
    logEventsRepository: app.repositories.logEvents,
    queueService: queue,
    defaultCronExpression: app.config.DISCOVERY_SCHEDULE_CRON,
    defaultTimezone: app.config.DISCOVERY_SCHEDULE_TIMEZONE
  });

  app.decorate('discoveryQueue', queue);
  app.decorate('discoveryScheduler', scheduler);

  await scheduler.start();

  app.addHook('onClose', async () => {
    await scheduler.stop();
    await queue.onIdle();
  });
});

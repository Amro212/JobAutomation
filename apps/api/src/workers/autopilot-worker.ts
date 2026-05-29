import { parentPort, workerData } from 'node:worker_threads';

import type { AppEnv } from '@jobautomation/config';
import { createDatabaseClient, migrateDatabase } from '@jobautomation/db';

import { createApiRepositories } from '../plugins/db';
import {
  AutopilotQueueService,
  type QueueAutopilotRunInput
} from '../services/autopilot-queue';
import type {
  AutopilotWorkerCommand,
  AutopilotWorkerEvent
} from '../services/autopilot-worker-client';

type AutopilotWorkerData = {
  config: AppEnv;
};

async function startWorker(): Promise<void> {
  const config = (workerData as AutopilotWorkerData).config;
  const db = createDatabaseClient(config.JOB_AUTOMATION_DB_PATH);
  await migrateDatabase(db);

  const repositories = createApiRepositories(db);
  const queue = new AutopilotQueueService({
    repositories,
    config
  });

  parentPort?.postMessage({ type: 'ready' } satisfies AutopilotWorkerEvent);
  parentPort?.on('message', (message: AutopilotWorkerCommand) => {
    if (message.type === 'cancel-autopilot') {
      void queue.cancelRun(message.payload.runId);
      return;
    }

    void executeRun(queue, repositories.autopilotRuns, message.payload);
  });
}

async function executeRun(
  queue: AutopilotQueueService,
  autopilotRuns: ReturnType<typeof createApiRepositories>['autopilotRuns'],
  input: QueueAutopilotRunInput
): Promise<void> {
  try {
    await queue.runNow(input);
    const run = await autopilotRuns.findById(input.run.id);

    parentPort?.postMessage({
      type: 'completed',
      payload: {
        runId: input.run.id,
        status: run?.status ?? 'unknown'
      }
    } satisfies AutopilotWorkerEvent);
  } catch (error) {
    parentPort?.postMessage({
      type: 'error',
      payload: {
        runId: input.run.id,
        message: error instanceof Error ? error.message : String(error)
      }
    } satisfies AutopilotWorkerEvent);
  }
}

void startWorker();

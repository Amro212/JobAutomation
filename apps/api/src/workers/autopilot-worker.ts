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

type AutopilotWorkerMessageHandlerInput = {
  queue: Pick<AutopilotQueueService, 'cancelRun' | 'runNow'>;
  autopilotRuns: Pick<
    ReturnType<typeof createApiRepositories>['autopilotRuns'],
    'findById'
  >;
  postMessage: (event: AutopilotWorkerEvent) => void;
};

async function executeRun(
  queue: Pick<AutopilotQueueService, 'runNow'>,
  autopilotRuns: Pick<
    ReturnType<typeof createApiRepositories>['autopilotRuns'],
    'findById'
  >,
  input: QueueAutopilotRunInput,
  postMessage: (event: AutopilotWorkerEvent) => void
): Promise<void> {
  try {
    await queue.runNow(input);
    const run = await autopilotRuns.findById(input.run.id);

    postMessage({
      type: 'completed',
      payload: {
        runId: input.run.id,
        status: run?.status ?? 'unknown'
      }
    } satisfies AutopilotWorkerEvent);
  } catch (error) {
    postMessage({
      type: 'error',
      payload: {
        runId: input.run.id,
        message: error instanceof Error ? error.message : String(error)
      }
    } satisfies AutopilotWorkerEvent);
  }
}

export function bindAutopilotWorkerMessageHandler(
  input: AutopilotWorkerMessageHandlerInput
): (message: AutopilotWorkerCommand) => void {
  let activeRunId: string | null = null;

  return (message: AutopilotWorkerCommand) => {
    if (message.type === 'cancel-autopilot') {
      void input.queue.cancelRun(message.payload.runId);
      return;
    }

    if (activeRunId !== null) {
      input.postMessage({
        type: 'error',
        payload: {
          runId: message.payload.run.id,
          message: 'Autopilot worker is already processing a run.'
        }
      } satisfies AutopilotWorkerEvent);
      return;
    }

    activeRunId = message.payload.run.id;
    void executeRun(
      input.queue,
      input.autopilotRuns,
      message.payload,
      input.postMessage
    ).finally(() => {
      if (activeRunId === message.payload.run.id) {
        activeRunId = null;
      }
    });
  };
}

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
  parentPort?.on(
    'message',
    bindAutopilotWorkerMessageHandler({
      queue,
      autopilotRuns: repositories.autopilotRuns,
      postMessage: (event) => {
        parentPort?.postMessage(event);
      }
    })
  );
}

if (parentPort) {
  void startWorker();
}

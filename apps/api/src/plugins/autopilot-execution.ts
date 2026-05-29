import fp from 'fastify-plugin';

import type { AutopilotQueue } from '../services/autopilot-queue';
import { WorkerAutopilotQueueService } from '../services/autopilot-queue';
import { AutopilotWorkerThreadClient } from '../services/autopilot-worker-client';

declare module 'fastify' {
  interface FastifyInstance {
    autopilotQueue: AutopilotQueue;
  }
}

export const registerAutopilotExecutionPlugin = fp(async (app) => {
  const workerClient = new AutopilotWorkerThreadClient({
    config: app.config,
    repositories: app.repositories,
    logger: {
      error: (error) => app.log.error(error)
    }
  });
  const queue = new WorkerAutopilotQueueService({
    repositories: app.repositories,
    workerClient
  });

  app.decorate('autopilotQueue', queue);

  app.addHook('onClose', async () => {
    await queue.onIdle();
    await workerClient.dispose();
  });
});

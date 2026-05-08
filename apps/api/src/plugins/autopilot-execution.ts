import fp from 'fastify-plugin';

import { AutopilotQueueService } from '../services/autopilot-queue';

declare module 'fastify' {
  interface FastifyInstance {
    autopilotQueue: AutopilotQueueService;
  }
}

export const registerAutopilotExecutionPlugin = fp(async (app) => {
  const queue = new AutopilotQueueService({
    repositories: app.repositories,
    config: app.config
  });

  app.decorate('autopilotQueue', queue);

  app.addHook('onClose', async () => {
    await queue.onIdle();
  });
});

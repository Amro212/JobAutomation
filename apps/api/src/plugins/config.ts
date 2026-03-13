import fp from 'fastify-plugin';

import { readEnv, type AppEnv } from '@jobautomation/config';

declare module 'fastify' {
  interface FastifyInstance {
    config: AppEnv;
  }
}

export const registerConfigPlugin = fp(async (app) => {
  app.decorate('config', readEnv(process.env));
});

import { readEnv } from '@jobautomation/config';

import { buildApp } from './app';

async function start(): Promise<void> {
  const env = readEnv(process.env);
  const app = buildApp();

  try {
    await app.listen({
      host: env.API_HOST,
      port: env.API_PORT
    });
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

void start();

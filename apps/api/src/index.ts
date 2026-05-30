import { readEnv } from '@jobautomation/config';

import { buildApp } from './app';
import { installChildProcessLifecycle } from './process-lifecycle';

async function start(): Promise<void> {
  const env = readEnv(process.env);
  const app = buildApp();
  const childLifecycle = installChildProcessLifecycle(app);

  try {
    await app.listen({
      host: env.API_HOST,
      port: env.API_PORT
    });
    childLifecycle.notifyReady();
  } catch (error) {
    childLifecycle.dispose();
    console.error('API START ERROR:', error);
    app.log.error(error);
    process.exitCode = 1;
  }
}

void start();

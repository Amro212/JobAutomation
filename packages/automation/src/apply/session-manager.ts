import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { Browser } from 'playwright';

import type { ApplicationSession } from './contracts';

export async function createApplicationSession(input: {
  browser: Browser;
  runId: string;
  artifactsRootDir: string;
  startUrl?: string;
}): Promise<ApplicationSession> {
  const context = await input.browser.newContext({
    locale: 'en-US'
  });
  await context.tracing.start({
    screenshots: true,
    snapshots: true
  });

  const page = await context.newPage();
  if (input.startUrl) {
    await page.goto(input.startUrl, {
      waitUntil: 'domcontentloaded'
    });
  }

  const traceDir = join(input.artifactsRootDir, 'applications', input.runId);
  const tracePath = join(traceDir, 'trace.zip');

  return {
    browser: input.browser,
    context,
    page,
    async finalizeTrace() {
      await mkdir(traceDir, { recursive: true });
      await context.tracing.stop({
        path: tracePath
      });
      return tracePath;
    },
    async close() {
      await context.close();
      await input.browser.close();
    }
  };
}

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type {
  ApplicationSession,
  ApplicationSessionOptions,
  ApplicationSessionRuntime
} from './contracts';

function isBlankPage(page: { url: () => string }): boolean {
  return page.url() === 'about:blank';
}

export async function createApplicationSession(input: {
  runtime: ApplicationSessionRuntime;
} & ApplicationSessionOptions): Promise<ApplicationSession> {
  const context =
    input.runtime.context ??
    (await input.runtime.browser?.newContext());

  if (!context) {
    throw new Error('Application session runtime did not provide a browser context.');
  }

  const ownsContext = input.runtime.context == null;

  await context.tracing.start({
    screenshots: true,
    snapshots: true
  });

  async function closeSurplusBlankPages(activePage = page): Promise<void> {
    await Promise.all(
      context
        .pages()
        .filter((candidate) => candidate !== activePage && isBlankPage(candidate))
        .map((candidate) => candidate.close().catch(() => undefined))
    );
  }

  const pages = context.pages();
  const reusableBlankPage = pages.find(isBlankPage);
  const page = reusableBlankPage ?? await context.newPage();
  await closeSurplusBlankPages(page);
  if (input.startUrl) {
    await page.goto(input.startUrl, {
      waitUntil: 'domcontentloaded'
    });
  }

  const traceDir = join(input.artifactsRootDir, 'applications', input.runId);
  const tracePath = join(traceDir, 'trace.zip');

  return {
    browser: input.runtime.browser,
    context,
    page,
    identity: input.identity,
    ...(input.pacing ? { pacing: input.pacing } : {}),
    closeSurplusBlankPages,
    async finalizeTrace() {
      await mkdir(traceDir, { recursive: true });
      await context.tracing.stop({
        path: tracePath
      });
      return tracePath;
    },
    async close() {
      if (ownsContext) {
        await context.close();
        if (input.runtime.browser) {
          await input.runtime.browser.close();
        }
        return;
      }

      await input.runtime.close();
    }
  };
}

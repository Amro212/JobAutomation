import { describe, expect, test, vi } from 'vitest';

import { createApplicationSession } from '../../../packages/automation/src/apply/session-manager';

describe('application session manager', () => {
  test('reuses a persistent browser context for apply sessions', async () => {
    const page = {
      goto: vi.fn().mockResolvedValue(undefined)
    };
    const context = {
      tracing: {
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn().mockResolvedValue(undefined)
      },
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined)
    };
    const browser = {
      close: vi.fn().mockResolvedValue(undefined),
      newContext: vi.fn()
    };
    const runtimeClose = vi.fn().mockResolvedValue(undefined);

    const session = await createApplicationSession({
      runtime: {
        browser,
        context,
        persistent: true,
        identity: {
          profileKind: 'apply',
          board: 'ashby',
          userDataDir: 'C:/VScode/JobAutomation/data/browser-profiles/apply/ashby',
          os: 'windows',
          locale: 'en-CA',
          enableCache: true,
          humanize: true,
          firefoxUserPrefs: {},
          headless: false
        },
        close: runtimeClose
      },
      runId: 'run-1',
      artifactsRootDir: 'C:/VScode/JobAutomation/output/artifacts',
      startUrl: 'https://jobs.ashbyhq.com/example/job'
    });

    expect(browser.newContext).not.toHaveBeenCalled();
    expect(context.tracing.start).toHaveBeenCalledWith({
      screenshots: true,
      snapshots: true
    });
    expect(page.goto).toHaveBeenCalledWith('https://jobs.ashbyhq.com/example/job', {
      waitUntil: 'domcontentloaded'
    });

    await session.close();
    expect(runtimeClose).toHaveBeenCalledTimes(1);
    expect(context.close).not.toHaveBeenCalled();
    expect(browser.close).not.toHaveBeenCalled();
  });
});

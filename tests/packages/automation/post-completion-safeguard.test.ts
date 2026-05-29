import { afterEach, describe, expect, test, vi } from 'vitest';

import { assessPostCompletionStatus } from '../../../packages/automation/src/apply/post-completion-safeguard';

function hiddenLocator() {
  return {
    first: () => ({
      isVisible: vi.fn().mockResolvedValue(false)
    })
  };
}

function createPage(overrides: Record<string, unknown> = {}) {
  return {
    isClosed: vi.fn().mockReturnValue(false),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    url: vi.fn().mockReturnValue('https://job-boards.greenhouse.io/example/jobs/1/confirmation'),
    getByText: vi.fn().mockReturnValue(hiddenLocator()),
    locator: vi.fn().mockReturnValue(hiddenLocator()),
    ...overrides
  };
}

describe('post-completion safeguard', () => {
  afterEach(() => {
    delete process.env.JOBAUTOMATION_APPLICATION_POST_COMPLETION_CHECK_DELAY_MS;
  });

  test('passes when the page remains open without negative signals', async () => {
    process.env.JOBAUTOMATION_APPLICATION_POST_COMPLETION_CHECK_DELAY_MS = '1';
    const page = createPage();

    const assessment = await assessPostCompletionStatus({
      page,
      board: 'greenhouse'
    });

    expect(assessment).toMatchObject({
      ok: true,
      status: 'completed'
    });
    expect(page.waitForTimeout).toHaveBeenCalledWith(1);
  });

  test('fails when the page is closed after completion', async () => {
    const page = createPage({
      isClosed: vi.fn().mockReturnValue(true)
    });

    const assessment = await assessPostCompletionStatus({
      page,
      board: 'greenhouse'
    });

    expect(assessment).toMatchObject({
      ok: false,
      status: 'failed',
      stopReason: 'post_completion_window_closed'
    });
  });

  test('fails when the application is unavailable after completion', async () => {
    const page = createPage({
      url: vi.fn().mockReturnValue('https://job-boards.greenhouse.io/example/jobs/closed')
    });

    const assessment = await assessPostCompletionStatus({
      page,
      board: 'greenhouse'
    });

    expect(assessment).toMatchObject({
      ok: false,
      status: 'failed',
      stopReason: 'post_completion_application_unavailable'
    });
  });
});

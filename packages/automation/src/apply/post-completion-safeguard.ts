import type { Page } from 'playwright';

import type { SupportedApplicationBoard } from './board-entry';

export type PostCompletionAssessment =
  | {
      ok: true;
      status: 'completed';
      signals: string[];
    }
  | {
      ok: false;
      status: 'paused' | 'failed';
      stopReason: string;
      message: string;
      signals: string[];
    };

const DEFAULT_SETTLE_DELAY_MS = 3_000;

const EXPIRED_URL_PATTERNS = [
  /\/404(\/|$)/i,
  /\/not[-_]?found(\/|$)/i,
  /\/expired(\/|$)/i,
  /\/closed(\/|$)/i
];

const EXPIRED_TEXT_PATTERNS = [
  /no longer accepting applications/i,
  /(job|posting) (not found|has expired|no longer exists)/i,
  /this (job|position|posting|role|listing) (has (been )?(closed|removed|filled|expired)|is closed)/i,
  /404[\s\u2014\u2013-]*not found/i
];

const ERROR_TEXT_PATTERNS = [
  /field is required/i,
  /required field/i,
  /please (complete|fill|select|enter)/i,
  /cannot be blank/i,
  /invalid (answer|email|phone|response|value)/i,
  /there was (an )?error/i,
  /something went wrong/i,
  /try again/i
];

function resolveSettleDelayMs(): number {
  const value = process.env.JOBAUTOMATION_APPLICATION_POST_COMPLETION_CHECK_DELAY_MS;
  if (!value) {
    return DEFAULT_SETTLE_DELAY_MS;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : DEFAULT_SETTLE_DELAY_MS;
}

async function visibleTextSignal(
  page: Pick<Page, 'getByText'>,
  patterns: RegExp[],
  prefix: string
): Promise<string | null> {
  for (const pattern of patterns) {
    const visible = await page
      .getByText(pattern)
      .first()
      .isVisible()
      .catch(() => false);
    if (visible) {
      return `${prefix}:${pattern.source}`;
    }
  }

  return null;
}

function urlSignal(url: string, patterns: RegExp[], prefix: string): string | null {
  for (const pattern of patterns) {
    if (pattern.test(url)) {
      return `${prefix}:${pattern.source}`;
    }
  }

  return null;
}

export async function assessPostCompletionStatus(input: {
  page: Pick<Page, 'getByText' | 'isClosed' | 'locator' | 'url' | 'waitForTimeout'>;
  board: SupportedApplicationBoard;
}): Promise<PostCompletionAssessment> {
  await input.page.waitForTimeout(resolveSettleDelayMs());

  if (input.page.isClosed()) {
    return {
      ok: false,
      status: 'failed',
      stopReason: 'post_completion_window_closed',
      message: 'Post-completion safeguard failed because the application browser page closed unexpectedly.',
      signals: ['page:closed']
    };
  }

  const pageUrl = input.page.url();
  const expiredUrlSignal = urlSignal(pageUrl, EXPIRED_URL_PATTERNS, 'expired_url');
  if (expiredUrlSignal) {
    return {
      ok: false,
      status: 'failed',
      stopReason: 'post_completion_application_unavailable',
      message: 'Post-completion safeguard found that the application page is unavailable.',
      signals: [expiredUrlSignal]
    };
  }

  const expiredTextSignal = await visibleTextSignal(input.page, EXPIRED_TEXT_PATTERNS, 'expired_text');
  if (expiredTextSignal) {
    return {
      ok: false,
      status: 'failed',
      stopReason: 'post_completion_application_unavailable',
      message: 'Post-completion safeguard found that the application is no longer available.',
      signals: [expiredTextSignal]
    };
  }

  const invalidFieldVisible = await input.page
    .locator(':invalid')
    .first()
    .isVisible()
    .catch(() => false);
  if (invalidFieldVisible) {
    return {
      ok: false,
      status: 'paused',
      stopReason: 'post_completion_validation_error',
      message: 'Post-completion safeguard found visible invalid or incomplete fields.',
      signals: ['field:invalid_visible']
    };
  }

  const errorTextSignal = await visibleTextSignal(input.page, ERROR_TEXT_PATTERNS, 'error_text');
  if (errorTextSignal) {
    return {
      ok: false,
      status: 'paused',
      stopReason: 'post_completion_validation_error',
      message: 'Post-completion safeguard found a visible application error.',
      signals: [errorTextSignal]
    };
  }

  const submitStillVisible = await input.page
    .locator('button[type="submit"], input[type="submit"]')
    .first()
    .isVisible()
    .catch(() => false);
  if (submitStillVisible) {
    return {
      ok: false,
      status: 'paused',
      stopReason: 'post_completion_submit_still_visible',
      message: 'Post-completion safeguard found the application submit control still visible.',
      signals: ['submit:visible']
    };
  }

  return {
    ok: true,
    status: 'completed',
    signals: [`board:${input.board}`, `url:${pageUrl}`]
  };
}

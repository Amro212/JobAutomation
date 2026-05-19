import type { Locator, Page } from 'playwright';

import type { SupportedApplicationBoard } from './board-entry';

export type SubmitApplicationResult =
  | {
      status: 'submitted';
      confirmationMessage: string;
      submitButtonSource: string;
      confirmationSignal: string;
    }
  | {
      status: 'submit_button_not_found' | 'submission_confirmation_missing';
      message: string;
    };

const SUCCESS_TEXT_BY_BOARD: Record<SupportedApplicationBoard, RegExp[]> = {
  greenhouse: [
    /thank(s| you) for (applying|your (application|interest|submission))/i,
    /application (submitted|received|complete|sent)/i,
    /we['\u2019]?(ve| have) received your application/i,
    /your application (has been|was) (received|submitted|sent)/i,
    /your application is being reviewed/i,
    /successfully (applied|submitted)/i,
    /submission (received|successful)/i,
    /you['\u2019]?(ve| have) (successfully )?applied/i
  ],
  ashby: [
    /thank(s| you) for (applying|your (application|interest|submission))/i,
    /application (submitted|received|complete|sent)/i,
    /we['\u2019]?(ve| have) received your application/i,
    /your application (has been|was) (received|submitted|sent)/i,
    /successfully (applied|submitted)/i,
    /submission (received|successful)/i
  ],
  lever: [
    /thank(s| you) for (applying|your (application|interest|submission))/i,
    /application (submitted|received|complete|sent)/i,
    /your application has been (submitted|received|sent)/i,
    /successfully (applied|submitted)/i,
    /submission (received|successful)/i
  ]
};

const SUCCESS_URL_PATTERNS: RegExp[] = [
  /[?&]confirmation(=|&|$)/i,
  /[?&]submitted(=|&|$)/i,
  /[?&]success(=|&|$)/i,
  /\/thank[-_]?you(\/|$|\?)/i,
  /\/confirmation(\/|$|\?)/i,
  /\/submitted(\/|$|\?)/i,
  /\/success(\/|$|\?)/i,
  /\/applied(\/|$|\?)/i
];

const DEFAULT_SUCCESS_POLL_TIMEOUT_MS = 10_000;
const SUCCESS_POLL_INTERVAL_MS = 250;

async function findSubmitButton(
  page: Page
): Promise<{ locator: Locator | null; source: string | null }> {
  const candidates = [
    [
      'role:button[name=/submit application/i]',
      page.getByRole('button', { name: /submit application/i }).first()
    ],
    ['role:button[name=/^submit$/i]', page.getByRole('button', { name: /^submit$/i }).first()],
    ['role:button[name=/^apply$/i]', page.getByRole('button', { name: /^apply$/i }).first()],
    ['css:button[type="submit"]', page.locator('button[type="submit"]').first()],
    ['css:input[type="submit"]', page.locator('input[type="submit"]').first()]
  ] as const;

  for (const [source, locator] of candidates) {
    if (await locator.isVisible().catch(() => false)) {
      return { locator, source };
    }
  }

  return { locator: null, source: null };
}

async function detectSuccessSignal(
  page: Page,
  patterns: RegExp[]
): Promise<string | null> {
  const url = page.url();
  for (const urlPattern of SUCCESS_URL_PATTERNS) {
    if (urlPattern.test(url)) {
      return `url:${urlPattern.source}`;
    }
  }

  for (const pattern of patterns) {
    const visible = await page
      .getByText(pattern)
      .first()
      .isVisible()
      .catch(() => false);
    if (visible) {
      return `text:${pattern.source}`;
    }
  }

  return null;
}

async function waitForSuccessSignal(input: {
  page: Page;
  patterns: RegExp[];
  timeoutMs: number;
}): Promise<string | null> {
  const deadline = Date.now() + input.timeoutMs;
  while (Date.now() <= deadline) {
    const signal = await detectSuccessSignal(input.page, input.patterns);
    if (signal) {
      return signal;
    }

    await input.page.waitForTimeout(SUCCESS_POLL_INTERVAL_MS);
  }

  return detectSuccessSignal(input.page, input.patterns);
}

export async function submitApplicationAndConfirm(input: {
  page: Page;
  board: SupportedApplicationBoard;
  confirmationTimeoutMs?: number;
}): Promise<SubmitApplicationResult> {
  const submitButton = await findSubmitButton(input.page);
  if (!submitButton.locator || !submitButton.source) {
    return {
      status: 'submit_button_not_found',
      message: 'Application submit button was not visible.'
    };
  }

  await submitButton.locator.click();

  const confirmationSignal = await waitForSuccessSignal({
    page: input.page,
    patterns: SUCCESS_TEXT_BY_BOARD[input.board],
    timeoutMs: input.confirmationTimeoutMs ?? DEFAULT_SUCCESS_POLL_TIMEOUT_MS
  });
  if (!confirmationSignal) {
    return {
      status: 'submission_confirmation_missing',
      message: 'Post-submit confirmation was not visible after clicking submit.'
    };
  }

  return {
    status: 'submitted',
    confirmationMessage: 'Application submitted successfully.',
    submitButtonSource: submitButton.source,
    confirmationSignal
  };
}

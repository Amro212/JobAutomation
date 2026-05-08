import type { Locator, Page } from 'playwright';

import type { SupportedApplicationBoard } from './board-entry';

export type SubmitApplicationResult =
  | {
      status: 'submitted';
      confirmationMessage: string;
      submitButtonSource: string;
    }
  | {
      status: 'submit_button_not_found' | 'submission_confirmation_missing';
      message: string;
    };

const SUCCESS_TEXT_BY_BOARD: Record<SupportedApplicationBoard, RegExp[]> = {
  greenhouse: [
    /thank you for applying/i,
    /application submitted/i,
    /we have received your application/i
  ],
  ashby: [
    /thank you for applying/i,
    /application submitted/i,
    /we've received your application/i
  ],
  lever: [
    /thank you for applying/i,
    /application submitted/i,
    /your application has been submitted/i
  ]
};

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

async function successTextVisible(page: Page, patterns: RegExp[]): Promise<boolean> {
  for (const pattern of patterns) {
    if (await page.getByText(pattern).first().isVisible().catch(() => false)) {
      return true;
    }
  }

  return false;
}

export async function submitApplicationAndConfirm(input: {
  page: Page;
  board: SupportedApplicationBoard;
}): Promise<SubmitApplicationResult> {
  const submitButton = await findSubmitButton(input.page);
  if (!submitButton.locator || !submitButton.source) {
    return {
      status: 'submit_button_not_found',
      message: 'Application submit button was not visible.'
    };
  }

  await submitButton.locator.click();
  await input.page.waitForTimeout(1_000);

  const successVisible = await successTextVisible(
    input.page,
    SUCCESS_TEXT_BY_BOARD[input.board]
  );
  if (!successVisible) {
    return {
      status: 'submission_confirmation_missing',
      message: 'Post-submit confirmation was not visible after clicking submit.'
    };
  }

  return {
    status: 'submitted',
    confirmationMessage: 'Application submitted successfully.',
    submitButtonSource: submitButton.source
  };
}

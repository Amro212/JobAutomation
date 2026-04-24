import type { Page, Locator } from 'playwright';

import type { EmailVerificationDebugLog, GreenhouseVerificationCodeResult } from './contracts';

type CodeRetriever = (submittedAt: Date) => Promise<GreenhouseVerificationCodeResult>;

const VERIFICATION_PROMPT_PATTERN = /security code|verification code|check your email/i;

async function emitDebugLog(
  logger: EmailVerificationDebugLog | undefined,
  event: string,
  details?: Record<string, unknown>
): Promise<void> {
  await logger?.(event, details);
}

async function findSubmitButton(page: Page): Promise<{ locator: Locator | null; source: string | null }> {
  const candidates = [
    ['role:button[name=/submit application/i]', page.getByRole('button', { name: /submit application/i }).first()],
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

async function findVerificationInput(page: Page): Promise<{ locator: Locator | null; source: string | null }> {
  const candidates = [
    ['label:/security code/i', page.getByLabel(/security code/i).first()],
    ['label:/verification code/i', page.getByLabel(/verification code/i).first()],
    ['css:input[autocomplete="one-time-code"]', page.locator('input[autocomplete="one-time-code"]').first()],
    ['css:input[name*="security" i]', page.locator('input[name*="security" i]').first()],
    ['css:input[id*="security" i]', page.locator('input[id*="security" i]').first()],
    ['css:input[name*="verification" i]', page.locator('input[name*="verification" i]').first()],
    ['css:input[id*="verification" i]', page.locator('input[id*="verification" i]').first()],
    ['css:input[type="text"]', page.locator('input[type="text"]').first()]
  ] as const;

  for (const [source, locator] of candidates) {
    if (await locator.isVisible().catch(() => false)) {
      return { locator, source };
    }
  }

  return { locator: null, source: null };
}

async function clearAndType(page: Page, locator: Locator, value: string): Promise<void> {
  await locator.click();
  await page.keyboard.press('Control+A').catch(() => undefined);
  await page.keyboard.press('Backspace').catch(() => undefined);
  await page.keyboard.type(value, { delay: 35 });
}

export async function submitGreenhouseApplicationAndEnterVerificationCode(input: {
  page: Page;
  retrieveCode: CodeRetriever;
  debugLog?: EmailVerificationDebugLog;
}): Promise<
  | {
      status: 'code_entered';
      messageId: string;
      subject: string;
      codeLength: number;
    }
  | GreenhouseVerificationCodeResult
> {
  const submitButton = await findSubmitButton(input.page);
  await emitDebugLog(input.debugLog, 'greenhouse_submit_button_resolved', {
    found: Boolean(submitButton.locator),
    source: submitButton.source
  });
  if (!submitButton.locator) {
    return {
      status: 'submit_button_not_found',
      message: 'Greenhouse submit button was not visible.'
    };
  }

  await submitButton.locator.click();
  const submittedAt = new Date();
  await emitDebugLog(input.debugLog, 'greenhouse_submit_clicked', {
    source: submitButton.source
  });
  await input.page.waitForTimeout(1_000);

  const challengeVisible = await input.page
    .getByText(VERIFICATION_PROMPT_PATTERN)
    .first()
    .isVisible()
    .catch(() => false);
  const verificationInput = await findVerificationInput(input.page);
  const segmentedInputCount = await input.page
    .locator('input[id^="security-input-"]')
    .count()
    .catch(() => 0);
  await emitDebugLog(input.debugLog, 'greenhouse_challenge_checked', {
    challengeVisible,
    verificationInputFound: Boolean(verificationInput.locator),
    verificationInputSource: verificationInput.source,
    segmentedInputCount
  });
  if (!challengeVisible && !verificationInput.locator) {
    return {
      status: 'challenge_not_visible',
      message: 'Greenhouse verification challenge did not become visible after submit.'
    };
  }

  await emitDebugLog(input.debugLog, 'greenhouse_retrieve_code_started', {
    submittedAt: submittedAt.toISOString()
  });
  const codeResult = await input.retrieveCode(submittedAt);
  await emitDebugLog(input.debugLog, 'greenhouse_retrieve_code_completed', {
    status: codeResult.status,
    ...(codeResult.status === 'matched'
      ? {
          codeLength: codeResult.code.length,
          messageId: codeResult.messageId,
          subject: codeResult.subject
        }
      : {
          message: codeResult.message
        })
  });
  if (codeResult.status !== 'matched') {
    return codeResult;
  }

  if (!verificationInput.locator) {
    return {
      status: 'code_input_not_found',
      message: 'Greenhouse verification input was not visible.'
    };
  }

  await clearAndType(input.page, verificationInput.locator, codeResult.code);
  const segmentedValues = await input.page
    .locator('input[id^="security-input-"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => (node instanceof HTMLInputElement ? node.value : ''))
    )
    .catch(() => []);
  await emitDebugLog(input.debugLog, 'greenhouse_code_entered', {
    verificationInputSource: verificationInput.source,
    segmentedInputCount,
    segmentedValues,
    enteredCodeLength: codeResult.code.length
  });

  return {
    status: 'code_entered',
    messageId: codeResult.messageId,
    subject: codeResult.subject,
    codeLength: codeResult.code.length
  };
}

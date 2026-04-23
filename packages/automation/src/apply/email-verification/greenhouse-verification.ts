import type { Page, Locator } from 'playwright';

import type { GreenhouseVerificationCodeResult } from './contracts';

type CodeRetriever = () => Promise<GreenhouseVerificationCodeResult>;

const VERIFICATION_PROMPT_PATTERN = /security code|verification code|check your email/i;

async function firstVisibleLocator(candidates: Locator[]): Promise<Locator | null> {
  for (const locator of candidates) {
    if (await locator.isVisible().catch(() => false)) {
      return locator;
    }
  }

  return null;
}

async function findSubmitButton(page: Page): Promise<Locator | null> {
  return firstVisibleLocator([
    page.getByRole('button', { name: /submit application/i }).first(),
    page.getByRole('button', { name: /^submit$/i }).first(),
    page.getByRole('button', { name: /^apply$/i }).first(),
    page.locator('button[type="submit"]').first(),
    page.locator('input[type="submit"]').first()
  ]);
}

async function findVerificationInput(page: Page): Promise<Locator | null> {
  const labeled = await firstVisibleLocator([
    page.getByLabel(/security code/i).first(),
    page.getByLabel(/verification code/i).first()
  ]);
  if (labeled) {
    return labeled;
  }

  return firstVisibleLocator([
    page.locator('input[autocomplete="one-time-code"]').first(),
    page.locator('input[name*="security" i]').first(),
    page.locator('input[id*="security" i]').first(),
    page.locator('input[name*="verification" i]').first(),
    page.locator('input[id*="verification" i]').first(),
    page.locator('input[type="text"]').first()
  ]);
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
  if (!submitButton) {
    return {
      status: 'submit_button_not_found',
      message: 'Greenhouse submit button was not visible.'
    };
  }

  await submitButton.click();
  await input.page.waitForTimeout(1_000);

  const challengeVisible = await input.page
    .getByText(VERIFICATION_PROMPT_PATTERN)
    .first()
    .isVisible()
    .catch(() => false);
  const verificationInput = await findVerificationInput(input.page);
  if (!challengeVisible && !verificationInput) {
    return {
      status: 'challenge_not_visible',
      message: 'Greenhouse verification challenge did not become visible after submit.'
    };
  }

  const codeResult = await input.retrieveCode();
  if (codeResult.status !== 'matched') {
    return codeResult;
  }

  if (!verificationInput) {
    return {
      status: 'code_input_not_found',
      message: 'Greenhouse verification input was not visible.'
    };
  }

  await clearAndType(input.page, verificationInput, codeResult.code);

  return {
    status: 'code_entered',
    messageId: codeResult.messageId,
    subject: codeResult.subject,
    codeLength: codeResult.code.length
  };
}

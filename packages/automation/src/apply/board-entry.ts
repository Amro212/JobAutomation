import type { Locator, Page } from 'playwright';

export type SupportedApplicationBoard = 'greenhouse' | 'lever' | 'ashby';

export type ApplicationBoardEntryAction =
  | 'direct_form'
  | 'clicked_apply_button'
  | 'clicked_application_tab';

export type ApplicationBoardEntryResult = {
  board: SupportedApplicationBoard;
  entryAction: ApplicationBoardEntryAction;
  startUrl: string;
  finalUrl: string;
  readyFieldCount: number;
  rootSelector: string;
  rootIndex: number;
};

type ApplicationFormSnapshot = {
  readyFieldCount: number;
  rootSelector: string;
  rootIndex: number;
};

const BOARD_ROOT_SELECTORS: Record<SupportedApplicationBoard, string[]> = {
  greenhouse: [
    '#application',
    '#application_form',
    '[id*="application"]',
    '[class*="application"]',
    '[data-qa="application-form"]',
    '[data-testid="application-form"]',
    'form'
  ],
  lever: [
    '[data-qa="application-form"]',
    '[data-testid="application-form"]',
    '[id*="application"]',
    '[class*="application"]',
    'form'
  ],
  ashby: [
    '[role="tabpanel"]',
    '[data-testid*="application"]',
    '[id*="application"]',
    '[class*="application"]',
    'form'
  ]
};

const INTERACTIVE_FIELD_SELECTOR = [
  'input:not([type="hidden"]):not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[contenteditable="true"]',
  '[role="textbox"]',
  '[role="combobox"]'
].join(', ');

const MIN_VISIBLE_FIELDS = 1;
const DEFAULT_POLL_MIN_DELAY_MS = 80;
const DEFAULT_POLL_MAX_DELAY_MS = 180;
const DIRECT_FORM_TIMEOUT_MS: Record<SupportedApplicationBoard, number> = {
  greenhouse: 750,
  lever: 1_500,
  ashby: 2_500,
};

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
}

function resolvePollDelayBounds(): { min: number; max: number } {
  const minFromEnv = parsePositiveInt(process.env.JOBAUTOMATION_APPLICATION_POLL_MIN_MS);
  const maxFromEnv = parsePositiveInt(process.env.JOBAUTOMATION_APPLICATION_POLL_MAX_MS);

  const min = minFromEnv ?? DEFAULT_POLL_MIN_DELAY_MS;
  const max = maxFromEnv ?? DEFAULT_POLL_MAX_DELAY_MS;

  if (min > max) {
    return { min: max, max: min };
  }

  return { min, max };
}

function randomPollDelayMs(bounds: { min: number; max: number }): number {
  if (bounds.min === bounds.max) {
    return bounds.min;
  }

  return Math.floor(Math.random() * (bounds.max - bounds.min + 1)) + bounds.min;
}

async function countVisibleInteractiveFields(root: Locator): Promise<number> {
  const fields = root.locator(INTERACTIVE_FIELD_SELECTOR);
  const total = await fields.count();
  let visibleFields = 0;

  for (let index = 0; index < total; index += 1) {
    const field = fields.nth(index);
    const visible = await field.isVisible().catch(() => false);
    if (!visible) {
      continue;
    }

    const enabled = await field.isEnabled().catch(() => true);
    if (enabled) {
      visibleFields += 1;
    }
  }

  return visibleFields;
}

async function inspectApplicationForm(
  page: Page,
  board: SupportedApplicationBoard
): Promise<ApplicationFormSnapshot | null> {
  let bestMatch: ApplicationFormSnapshot | null = null;

  for (const selector of BOARD_ROOT_SELECTORS[board]) {
    const roots = page.locator(selector);
    const total = await roots.count();
    const inspectCount = Math.min(total, 5);

    for (let index = 0; index < inspectCount; index += 1) {
      const root = roots.nth(index);
      const isVisible = await root.isVisible().catch(() => false);
      if (!isVisible) {
        continue;
      }

      const readyFieldCount = await countVisibleInteractiveFields(root);
      if (
        readyFieldCount >= MIN_VISIBLE_FIELDS &&
        (!bestMatch || readyFieldCount > bestMatch.readyFieldCount)
      ) {
        bestMatch = {
          readyFieldCount,
          rootSelector: selector,
          rootIndex: index
        };
      }
    }
  }

  return bestMatch;
}

async function waitForApplicationForm(
  page: Page,
  board: SupportedApplicationBoard,
  timeoutMs = 3_000
): Promise<ApplicationFormSnapshot | null> {
  const deadline = Date.now() + timeoutMs;
  const delayBounds = resolvePollDelayBounds();

  while (Date.now() <= deadline) {
    const snapshot = await inspectApplicationForm(page, board);
    if (snapshot) {
      return snapshot;
    }

    await page.waitForTimeout(randomPollDelayMs(delayBounds));
  }

  return null;
}

async function clickFirstVisibleTrigger(triggers: Locator[]): Promise<boolean> {
  for (const trigger of triggers) {
    const visible = await trigger.isVisible().catch(() => false);
    if (!visible) {
      continue;
    }

    await trigger.click();
    return true;
  }

  return false;
}

export async function reachApplicationForm(input: {
  page: Page;
  board: SupportedApplicationBoard;
}): Promise<ApplicationBoardEntryResult> {
  const startUrl = input.page.url();
  await input.page.waitForLoadState('domcontentloaded');

  const directForm = await waitForApplicationForm(
    input.page,
    input.board,
    DIRECT_FORM_TIMEOUT_MS[input.board]
  );
  if (directForm) {
    return {
      board: input.board,
      entryAction: 'direct_form',
      startUrl,
      finalUrl: input.page.url(),
      readyFieldCount: directForm.readyFieldCount,
      rootSelector: directForm.rootSelector,
      rootIndex: directForm.rootIndex
    };
  }

  if (input.board === 'greenhouse') {
    throw new Error(
      'Greenhouse application form was not directly available on the initial page load.'
    );
  }

  const clicked =
    input.board === 'lever'
      ? await clickFirstVisibleTrigger([
          input.page.getByRole('button', { name: /apply for this job/i }).first(),
          input.page.getByRole('link', { name: /apply for this job/i }).first(),
          input.page.getByRole('button', { name: /^apply$/i }).first(),
          input.page.getByRole('link', { name: /^apply$/i }).first()
        ])
      : await clickFirstVisibleTrigger([
          input.page.getByRole('tab', { name: /^application$/i }).first(),
          input.page.getByRole('button', { name: /^application$/i }).first(),
          input.page.getByRole('link', { name: /^application$/i }).first()
        ]);

  if (!clicked) {
    throw new Error(
      input.board === 'lever'
        ? 'Lever application entry button was not visible.'
        : 'Ashby application tab was not visible.'
    );
  }

  const postClickForm = await waitForApplicationForm(input.page, input.board);
  if (!postClickForm) {
    throw new Error(
      input.board === 'lever'
        ? 'Lever application form did not become ready after clicking the apply button.'
        : 'Ashby application form did not become ready after selecting the application tab.'
    );
  }

  return {
    board: input.board,
    entryAction: input.board === 'lever' ? 'clicked_apply_button' : 'clicked_application_tab',
    startUrl,
    finalUrl: input.page.url(),
    readyFieldCount: postClickForm.readyFieldCount,
    rootSelector: postClickForm.rootSelector,
    rootIndex: postClickForm.rootIndex
  };
}

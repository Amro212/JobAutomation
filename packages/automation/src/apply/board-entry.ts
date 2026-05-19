import type { Locator, Page } from 'playwright';

export type SupportedApplicationBoard = 'greenhouse' | 'lever' | 'ashby';

export class ApplicationLinkExpiredError extends Error {
  readonly board: SupportedApplicationBoard;
  readonly signal: string;
  readonly url: string;

  constructor(input: {
    board: SupportedApplicationBoard;
    signal: string;
    url: string;
    message?: string;
  }) {
    super(
      input.message ??
        `Application link for ${input.board} appears expired or no longer accepting applications (${input.signal}).`
    );
    this.name = 'ApplicationLinkExpiredError';
    this.board = input.board;
    this.signal = input.signal;
    this.url = input.url;
  }
}

const EXPIRED_PAGE_TEXT_PATTERNS: RegExp[] = [
  /no longer accepting applications/i,
  /we (are|'?re) no longer accepting/i,
  /this (job|position|posting|role|listing) (is no longer|has been|is) (open|available|active|accepting|posted)/i,
  /this (job|position|posting|role|listing) (has (been )?(closed|removed|filled|expired)|is closed)/i,
  /position has been (closed|filled|removed)/i,
  /(job|posting) (not found|has expired|no longer exists)/i,
  /sorry,? (this|the) (job|posting|role|position|page) (is no longer|has been|cannot be|could not be|doesn'?t exist)/i,
  /the (job|posting|page) you (are looking for|requested) (has been|is no longer|cannot be|could not be)/i,
  /this (page|listing) (does not|doesn'?t) exist/i,
  /404[\s\u2014\u2013\-]*not found/i,
];

const EXPIRED_URL_PATTERNS: RegExp[] = [
  /\/404(\/|$)/i,
  /\/not[-_]?found(\/|$)/i,
  /\/expired(\/|$)/i,
  /\/closed(\/|$)/i,
];

async function isExpiredPageTextVisible(page: Page): Promise<string | null> {
  for (const pattern of EXPIRED_PAGE_TEXT_PATTERNS) {
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

function isExpiredUrl(url: string): string | null {
  for (const pattern of EXPIRED_URL_PATTERNS) {
    if (pattern.test(url)) {
      return `url:${pattern.source}`;
    }
  }

  return null;
}

async function assertApplicationLinkNotExpired(input: {
  page: Page;
  board: SupportedApplicationBoard;
}): Promise<void> {
  const url = input.page.url();
  const urlSignal = isExpiredUrl(url);
  if (urlSignal) {
    throw new ApplicationLinkExpiredError({
      board: input.board,
      signal: urlSignal,
      url,
    });
  }

  const textSignal = await isExpiredPageTextVisible(input.page);
  if (textSignal) {
    throw new ApplicationLinkExpiredError({
      board: input.board,
      signal: textSignal,
      url,
    });
  }
}

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

  await assertApplicationLinkNotExpired({
    page: input.page,
    board: input.board,
  });

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

  await assertApplicationLinkNotExpired({
    page: input.page,
    board: input.board,
  });

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

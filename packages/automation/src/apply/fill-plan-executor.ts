import type { Locator, Page } from 'playwright';

import type {
  ApplicationArtifacts,
  InteractionPacingProfile,
} from './contracts';
import type {
  ApplicationBoardEntryResult,
  SupportedApplicationBoard,
} from './board-entry';
import type { ScrapedApplicationField, ScrapedApplicationFieldOption } from './form-scraper';
import type { ApplicationFillPlanEntry } from './openrouter-answer-module';
import { uploadArtifactFile } from './file-upload';
import { isFieldRequired, uploadArtifactKindForField } from './field-contract';

export type ApplicationFillExecutionStatus = 'success' | 'skipped' | 'failed';

export type HumanActionEngine = {
  click: (locator: Locator) => Promise<void>;
  typeText: (
    locator: Locator,
    value: string,
    options?: {
      ensureClear?: boolean;
      skipScroll?: boolean;
    }
  ) => Promise<void>;
  press: (key: string) => Promise<void>;
  waitForPreFill: () => Promise<void>;
  metrics: {
    pointerActions: number;
    typingDurationMs: number;
    preFillDwellMs: number;
  };
};

export type ApplicationFillExecutionResult = {
  fieldId: string;
  label: string;
  action: ApplicationFillPlanEntry['action'];
  status: ApplicationFillExecutionStatus;
  selector?: string;
  message: string;
};

export type ExecuteApplicationFillPlanResult = {
  results: ApplicationFillExecutionResult[];
  summary: {
    total: number;
    success: number;
    skipped: number;
    failed: number;
  };
  telemetry: {
    totalPreFillDwellMs: number;
    totalTypingDurationMs: number;
    totalPointerActions: number;
    forbiddenDirectApiUsage: string[];
  };
};

const STAGE_5_LOG_PREFIX = '[Stage 5][fill-plan-executor]';
/** Playwright locator actions for human-fill must not rely on infinite default timeouts on slow/heavy ATS pages. */
const LOCATOR_ACTION_TIMEOUT_MS = 20_000;
const DEFAULT_PACING: Required<InteractionPacingProfile> = {
  preFieldDelayMs: [10, 30],
  postFieldDelayMs: [10, 30],
  typingDelayMs: [20, 45],
  preApplyReadDelayMs: [40, 80],
  sectionReadDelayMs: [20, 40],
};

function logStage5(action: string, details: Record<string, unknown>): void {
  console.log(`${STAGE_5_LOG_PREFIX} ${action} ${JSON.stringify(details)}`);
}

function createSummary(
  results: ApplicationFillExecutionResult[]
): ExecuteApplicationFillPlanResult['summary'] {
  return {
    total: results.length,
    success: results.filter((result) => result.status === 'success').length,
    skipped: results.filter((result) => result.status === 'skipped').length,
    failed: results.filter((result) => result.status === 'failed').length,
  };
}

export function randomBetween([min, max]: [number, number]): number {
  if (max <= min) {
    return min;
  }

  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function resolvePacingProfile(
  pacing?: InteractionPacingProfile
): Required<InteractionPacingProfile> {
  return {
    preFieldDelayMs: pacing?.preFieldDelayMs ?? DEFAULT_PACING.preFieldDelayMs,
    postFieldDelayMs:
      pacing?.postFieldDelayMs ?? DEFAULT_PACING.postFieldDelayMs,
    typingDelayMs: pacing?.typingDelayMs ?? DEFAULT_PACING.typingDelayMs,
    preApplyReadDelayMs:
      pacing?.preApplyReadDelayMs ?? DEFAULT_PACING.preApplyReadDelayMs,
    sectionReadDelayMs:
      pacing?.sectionReadDelayMs ?? DEFAULT_PACING.sectionReadDelayMs,
  };
}

async function waitWithRange(
  page: Page,
  range: [number, number]
): Promise<number> {
  const duration = randomBetween(range);
  await page.waitForTimeout(duration);
  return duration;
}

function createHumanActionEngine(input: {
  page: Page;
  pacing?: InteractionPacingProfile;
}): HumanActionEngine {
  const pacing = resolvePacingProfile(input.pacing);
  const metrics = {
    pointerActions: 0,
    typingDurationMs: 0,
    preFillDwellMs: 0,
  };

  return {
    metrics,
    async waitForPreFill() {
      metrics.preFillDwellMs += await waitWithRange(
        input.page,
        pacing.preApplyReadDelayMs
      );
    },
    async click(locator: Locator) {
      const clickedInViewport = await clickLocatorCenterIfVisible({
        page: input.page,
        locator,
        preClickDelayMs: pacing.preFieldDelayMs,
      });
      if (clickedInViewport) {
        metrics.pointerActions += 1;
        await waitWithRange(input.page, pacing.postFieldDelayMs);
        return;
      }

      await locator.scrollIntoViewIfNeeded({ timeout: LOCATOR_ACTION_TIMEOUT_MS }).catch(() => undefined);
      await waitWithRange(input.page, pacing.preFieldDelayMs);
      await clickLocatorCenterWithoutScroll({ page: input.page, locator });
      metrics.pointerActions += 1;
      await waitWithRange(input.page, pacing.postFieldDelayMs);
    },
    async typeText(
      locator: Locator,
      value: string,
      options?: { ensureClear?: boolean; skipScroll?: boolean }
    ) {
      const clickedInViewport = await clickLocatorCenterIfVisible({
        page: input.page,
        locator,
        preClickDelayMs: pacing.preFieldDelayMs,
      });
      if (!clickedInViewport && !options?.skipScroll) {
        await locator.scrollIntoViewIfNeeded({ timeout: LOCATOR_ACTION_TIMEOUT_MS }).catch(() => undefined);
        await waitWithRange(input.page, pacing.preFieldDelayMs);
        await clickLocatorCenterWithoutScroll({ page: input.page, locator });
      } else if (!clickedInViewport) {
        await waitWithRange(input.page, pacing.preFieldDelayMs);
        await locator.click({ timeout: LOCATOR_ACTION_TIMEOUT_MS });
      }
      metrics.pointerActions += 1;

      await input.page.keyboard.press('ControlOrMeta+A').catch(() => undefined);
      await input.page.keyboard.press('Backspace').catch(() => undefined);
      if (options?.ensureClear) {
        let cleared = false;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const currentInputValue = await locator.inputValue().catch(() => null);
          const currentTextContent = await locator.textContent().catch(() => null);
          const currentValue = (
            currentInputValue ??
            currentTextContent ??
            ''
          ).trim();
          if (currentValue.length === 0) {
            cleared = true;
            break;
          }
          await input.page.keyboard.press('ControlOrMeta+A').catch(() => undefined);
          await input.page.keyboard.press('Backspace').catch(() => undefined);
        }
        if (!cleared) {
          throw new Error('Field did not clear before typing.');
        }
      }

      for (const [index, character] of Array.from(value).entries()) {
        const keyDelay = randomBetween(pacing.typingDelayMs);
        await input.page.keyboard.type(character, { delay: keyDelay });
        metrics.typingDurationMs += keyDelay;

        if (index > 0 && index % 5 === 0) {
          metrics.typingDurationMs += await waitWithRange(
            input.page,
            pacing.sectionReadDelayMs
          );
        }
      }

      await waitWithRange(input.page, pacing.postFieldDelayMs);
    },
    async press(key: string) {
      await input.page.keyboard.press(key);
    },
  };
}

async function firstVisibleLocator(input: {
  page: Page;
  root: Locator;
  selector: string;
}): Promise<Locator | null> {
  const scoped = input.root.locator(input.selector).first();
  if (await scoped.isVisible().catch(() => false)) {
    return scoped;
  }

  const pageLevel = input.page.locator(input.selector).first();
  if (await pageLevel.isVisible().catch(() => false)) {
    return pageLevel;
  }

  return null;
}

async function firstAttachedLocator(input: {
  page: Page;
  root: Locator;
  selector: string;
}): Promise<Locator | null> {
  const scoped = input.root.locator(input.selector).first();
  if ((await scoped.count().catch(() => 0)) > 0) {
    return scoped;
  }

  const pageLevel = input.page.locator(input.selector).first();
  if ((await pageLevel.count().catch(() => 0)) > 0) {
    return pageLevel;
  }

  return null;
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function cssEscape(value: string): string {
  return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

function choiceValues(value: ApplicationFillPlanEntry['value']): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value;
  }

  return [];
}

function normalizeOptionText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Compares demographic / EEO slug-like tokens across `_`, `-`, and whitespace (e.g. `prefer_not_to_say` vs `prefer-not-to-say`). */
function normalizeComparableSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[_\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function choiceOptionMatchesRequestedValue(
  candidate: ScrapedApplicationFieldOption,
  requestedValue: string,
  comparableRequested?: string
): boolean {
  if (candidate.value === requestedValue) {
    return true;
  }

  const nv = normalizeOptionText(requestedValue);
  if (
    normalizeOptionText(candidate.value) === nv ||
    normalizeOptionText(candidate.label) === nv
  ) {
    return true;
  }

  const cr = comparableRequested ?? normalizeComparableSlug(requestedValue);
  return (
    normalizeComparableSlug(candidate.value) === cr ||
    normalizeComparableSlug(candidate.label) === cr
  );
}

function isConsentNoticeComboboxField(field: ScrapedApplicationField): boolean {
  const fingerprint = `${field.id} ${field.label}`.toLowerCase();
  return (
    fingerprint.includes('privacy') ||
    fingerprint.includes('acknowledge') ||
    fingerprint.includes('acknowledgement') ||
    fingerprint.includes('consent') ||
    fingerprint.includes('notice at collection') ||
    fingerprint.includes('notice-at-collection')
  );
}

function expandComboboxSemanticAliases(
  raw: string,
  field?: ScrapedApplicationField
): string[] {
  const v = normalizeOptionText(raw);
  const aliases = new Set<string>([raw]);
  const addIf = (...candidates: string[]) => {
    for (const candidate of candidates) {
      aliases.add(candidate);
    }
  };

  if (v === 'yes' || raw.trim() === 'Yes') {
    addIf('Yes', 'yes', 'I agree', 'Agree');
    if (field && isConsentNoticeComboboxField(field)) {
      addIf('Acknowledge', 'acknowledge', 'Acknowledgement', 'acknowledgement');
    }
  }
  if (v === 'no' || raw.trim() === 'No') {
    addIf('No', 'no');
  }

  if (/\bu\.?s\.?\s*citizens?|us\s*citizen/i.test(raw)) {
    addIf('U.S. Citizen', 'US Citizen', 'Citizen', 'Authorized to work in the United States');
  }

  return Array.from(aliases).filter((candidate) => candidate.trim().length > 0);
}

function comboboxCandidateLabels(input: {
  field: ScrapedApplicationField;
  value: string;
}): string[] {
  const valueVariants = expandComboboxSemanticAliases(input.value, input.field).map(normalizeOptionText);
  const matchingFieldOptions = input.field.options.filter((option) => {
    const ov = normalizeOptionText(option.value);
    const ol = normalizeOptionText(option.label);
    return valueVariants.some((vv) => vv === ov || vv === ol || ov.includes(vv) || ol.includes(vv));
  });

  const fromAliases = expandComboboxSemanticAliases(input.value, input.field);

  return Array.from(
    new Set(
      [
        ...matchingFieldOptions.flatMap((option) => [
          option.label,
          option.value,
        ]),
        ...fromAliases,
        input.value,
      ].filter((candidate) => candidate.trim().length > 0)
    )
  );
}

function isBoardLocationAutocompleteField(input: {
  board: SupportedApplicationBoard;
  field: ScrapedApplicationField;
}): boolean {
  const fingerprint = [
    input.field.id,
    input.field.label,
    ...input.field.selectorCandidates,
  ].join(' ');

  return (
    (input.board === 'lever' || input.board === 'ashby') &&
    (input.field.type === 'text' || input.field.type === 'combobox') &&
    (/\blocation\b/i.test(fingerprint) ||
      (/\bcity\b/i.test(fingerprint) && /\bcountry\b/i.test(fingerprint)) ||
      /\bwork\s+from\b/i.test(fingerprint))
  );
}

async function visibleText(locator: Locator): Promise<string> {
  const inputValue = await locator.inputValue().catch(() => null);
  const textContent = await locator.textContent().catch(() => null);

  return (inputValue ?? textContent ?? '').trim();
}

async function waitForLeverResumeParsingToSettle(input: {
  page: Page;
  root: Locator;
  minWaitMs?: number;
  timeoutMs?: number;
  quietMs?: number;
  pollMs?: number;
}): Promise<void> {
  await input.page.waitForTimeout(input.minWaitMs ?? 5_500);

  const timeoutMs = input.timeoutMs ?? 8_000;
  const quietMs = input.quietMs ?? 750;
  const pollMs = input.pollMs ?? 100;
  const deadline = Date.now() + timeoutMs;
  let lastSnapshot = '';
  let stableSince = Date.now();

  while (Date.now() <= deadline) {
    const snapshot = await input.root
      .locator('input:not([type="file"]), textarea, [contenteditable="true"]')
      .evaluateAll((elements) =>
        elements
          .map((element) => {
            if (
              element instanceof HTMLInputElement ||
              element instanceof HTMLTextAreaElement
            ) {
              return `${element.id}:${element.name}:${element.value}`;
            }

            return `${element.id}:${element.textContent ?? ''}`;
          })
          .join('\n')
      )
      .catch(() => '');

    if (snapshot !== lastSnapshot) {
      lastSnapshot = snapshot;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= quietMs) {
      return;
    }

    await input.page.waitForTimeout(pollMs);
  }
}

async function clickLocatorCenterWithoutScroll(input: {
  page: Page;
  locator: Locator;
}): Promise<void> {
  const box = await input.locator.boundingBox();
  if (!box) {
    throw new Error('Location suggestion was not visible for center click.');
  }

  await input.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function clickLocatorCenterIfVisible(input: {
  page: Page;
  locator: Locator;
  preClickDelayMs: [number, number];
}): Promise<boolean> {
  const box = await input.locator.boundingBox();
  if (!box || box.width <= 0 || box.height <= 0) {
    return false;
  }

  const viewport = input.page.viewportSize();
  const viewportSize =
    viewport ??
    (await input.page
      .evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      }))
      .catch(() => null));
  if (!viewportSize) {
    return false;
  }

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const clickCenterVisible =
    x >= 0 && x <= viewportSize.width && y >= 0 && y <= viewportSize.height;
  if (!clickCenterVisible) {
    return false;
  }

  await waitWithRange(input.page, input.preClickDelayMs);
  await input.page.mouse.move(x, y);
  await input.page.mouse.click(x, y);
  return true;
}

async function visibleOptionByText(input: {
  page: Page;
  root: Locator;
  labels: string[];
  optionRoots?: Locator[];
}): Promise<Locator | null> {
  const roots = input.optionRoots ?? [input.root, input.page.locator('body')];
  for (const label of input.labels) {
    for (const root of roots) {
      const option = root.getByRole('option', { name: label, exact: true }).first();
      if (await option.isVisible().catch(() => false)) {
        return option;
      }
    }
  }

  return null;
}

async function firstVisibleOption(input: {
  page: Page;
  root: Locator;
  optionRoots?: Locator[];
}): Promise<Locator | null> {
  const roots = input.optionRoots ?? [input.root, input.page.locator('body')];
  for (const root of roots) {
    const option = root.getByRole('option').first();
    if (await option.isVisible().catch(() => false)) {
      return option;
    }
  }

  return null;
}

async function comboboxOptionRoots(input: {
  page: Page;
  root: Locator;
  locator: Locator;
}): Promise<Locator[]> {
  const roots: Locator[] = [];

  for (const attribute of ['aria-controls', 'aria-owns', 'list']) {
    const value = await input.locator.getAttribute(attribute).catch(() => null);
    for (const id of (value ?? '').split(/\s+/).map((item) => item.trim()).filter(Boolean)) {
      roots.push(input.page.locator(`#${cssEscape(id)}`));
    }
  }

  roots.push(input.root, input.page.locator('body'));
  return roots;
}

async function waitForComboboxOption(input: {
  page: Page;
  root: Locator;
  labels: string[];
  optionRoots?: Locator[];
  allowFirstVisibleFallback?: boolean;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<Locator | null> {
  const timeoutMs = input.timeoutMs ?? 2_000;
  const pollMs = input.pollMs ?? 100;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const exactMatch = await visibleOptionByText({
      page: input.page,
      root: input.root,
      labels: input.labels,
      ...(input.optionRoots ? { optionRoots: input.optionRoots } : {}),
    });
    if (exactMatch) {
      return exactMatch;
    }

    if (input.allowFirstVisibleFallback ?? true) {
      const firstVisible = await firstVisibleOption({
        page: input.page,
        root: input.root,
        ...(input.optionRoots ? { optionRoots: input.optionRoots } : {}),
      });
      if (firstVisible) {
        return firstVisible;
      }
    }

    await input.page.waitForTimeout(pollMs);
  }

  return null;
}

async function waitForLeverLocationOption(input: {
  page: Page;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<Locator | null> {
  const timeoutMs = input.timeoutMs ?? 8_500;
  const pollMs = input.pollMs ?? 120;
  const deadline = Date.now() + timeoutMs;

  // Scope to suggestion panels only. `[data-qa*="location"]` must NOT be used loosely — it matches
  // Lever's main combobox (#location-input) which appears earlier in DOM than `.dropdown-results`,
  // so `locator(...).first()` would treat the input as the "option" and never commit a selection.

  const panelLocator = input.page.locator([
    '.dropdown-results',
    '[class*="dropdown-results"]',
    '[class*="candidate-list"]',
  ].join(', '));
  const optionLocator = panelLocator.locator([
    '.dropdown-location',
    '[id^="location-"]:not(input)',
    'button',
    '[role="option"]',
    'li[class*="candidate"]',
    '[data-qa*="location-suggestion"]',
    '[data-qa*="location-result"]',
  ].join(', '));

  while (Date.now() <= deadline) {
    const option = optionLocator.first();
    if (await option.isVisible().catch(() => false)) {
      return option;
    }

    await input.page.waitForTimeout(pollMs);
  }

  return null;
}

async function hasLeverSelectedLocation(page: Page): Promise<boolean> {
  const selectedMirror = page.locator('#selected-location, [name="selectedLocation"]').first();
  const hasMirror = (await selectedMirror.count().catch(() => 0)) > 0;

  if (hasMirror) {
    const hiddenValue = (await selectedMirror.inputValue().catch(() => '')).trim();
    if (hiddenValue.length >= 2) {
      return true;
    }

    const mirroredText = normalizeOptionText((await selectedMirror.textContent().catch(() => null)) ?? '');
    if (mirroredText.length >= 3) {
      return true;
    }
  }

  // Legacy Lever layouts without a separate selectedLocation mirror rely on typed text only.
  if (!hasMirror) {
    const inputSelectors = ['#location-input', '[data-qa="location-input"]', '[name="location"]'];
    for (const selector of inputSelectors) {
      const locator = page.locator(selector).first();
      const value = (await locator.inputValue().catch(() => '')).trim();
      if (value.length >= 2) {
        return true;
      }
    }
  }

  return false;
}

async function ashbyLocationCommitted(input: {
  page: Page;
  locator: Locator;
}): Promise<boolean> {
  const currentValue = await visibleText(input.locator);
  if (currentValue.length === 0) {
    return false;
  }

  const visibleOption = await firstVisibleOption({
    page: input.page,
    root: input.page.locator('body'),
  });

  return !visibleOption;
}

async function executeLocationAutocomplete(input: {
  board: SupportedApplicationBoard;
  page: Page;
  root: Locator;
  field: ScrapedApplicationField;
  entry: ApplicationFillPlanEntry;
  locator: Locator;
  actionEngine: HumanActionEngine;
}): Promise<void> {
  if (input.entry.action !== 'fill' || typeof input.entry.value !== 'string') {
    throw new Error('Location autocomplete action requires a text fill value.');
  }

  const value = input.entry.value.trim();
  if (!value) {
    throw new Error('Location autocomplete action requires a non-empty value.');
  }

  await input.actionEngine.typeText(input.locator, value, {
    ensureClear: true,
    skipScroll: true,
  });
  await waitWithRange(input.page, input.board === 'lever' ? [1400, 2400] : [1000, 2000]);

  if (input.board === 'lever') {
    const option = await waitForLeverLocationOption({ page: input.page });
    if (!option) {
      throw new Error(`No visible location suggestion appeared for "${value}".`);
    }

    await input.actionEngine.click(option);
    await input.page.waitForTimeout(600);
    if (!(await hasLeverSelectedLocation(input.page))) {
      await input.actionEngine.press('Enter');
      await input.page.waitForTimeout(450);
    }
    if (!(await hasLeverSelectedLocation(input.page))) {
      throw new Error(`Location suggestion did not commit for "${value}".`);
    }
    return;
  }

  const option = await waitForComboboxOption({
    page: input.page,
    root: input.root,
    labels: comboboxCandidateLabels({
      field: input.field,
      value,
    }),
    timeoutMs: 2_500,
  });

  if (!option) {
    throw new Error(`No visible location suggestion appeared for "${value}".`);
  }

  await clickLocatorCenterWithoutScroll({ page: input.page, locator: option });
  await input.page.waitForTimeout(300);
  if (await ashbyLocationCommitted({ page: input.page, locator: input.locator })) {
    return;
  }

  await input.actionEngine.press('Enter');
  await input.page.waitForTimeout(300);
  if (!(await ashbyLocationCommitted({ page: input.page, locator: input.locator }))) {
    throw new Error(`Location suggestion did not commit for "${value}".`);
  }
}

async function executeCombobox(input: {
  board: SupportedApplicationBoard;
  page: Page;
  root: Locator;
  field: ScrapedApplicationField;
  entry: ApplicationFillPlanEntry;
  locator: Locator;
  actionEngine: HumanActionEngine;
}): Promise<void> {
  if (input.entry.action !== 'fill' || typeof input.entry.value !== 'string') {
    throw new Error('Combobox action requires a text fill value.');
  }

  const value = input.entry.value.trim();
  if (!value) {
    throw new Error('Combobox action requires a non-empty text value.');
  }

  const isLocationAutocomplete = isBoardLocationAutocompleteField({
    board: input.board,
    field: input.field,
  });
  if (isLocationAutocomplete) {
    await executeLocationAutocomplete(input);
    return;
  }

  const optionRoots = await comboboxOptionRoots({
    page: input.page,
    root: input.root,
    locator: input.locator,
  });
  const candidateLabels = comboboxCandidateLabels({
    field: input.field,
    value,
  });
  const optionMode = input.field.optionMode ?? (input.field.options.length > 0 ? 'static' : 'dynamic_search');

  if (optionMode === 'static' && input.field.options.length > 0) {
    await input.actionEngine.click(input.locator);
    const option = await waitForComboboxOption({
      page: input.page,
      root: input.root,
      labels: candidateLabels,
      optionRoots,
      allowFirstVisibleFallback: false,
      timeoutMs: 650,
      pollMs: 50,
    });

    if (option) {
      await input.actionEngine.click(option);
      await input.page.keyboard.press('Escape').catch(() => undefined);
      await input.locator.evaluate((element) => {
        if (element instanceof HTMLElement) {
          element.blur();
        }
      }).catch(() => undefined);
      return;
    }
  }

  await input.actionEngine.typeText(input.locator, value);

  const dynamicComboboxProbe =
    optionMode !== 'static'
      ? { timeoutMs: 6_500 as const, pollMs: 90 as const }
      : {};

  const option = await waitForComboboxOption({
    page: input.page,
    root: input.root,
    labels: candidateLabels,
    optionRoots,
    allowFirstVisibleFallback: optionMode !== 'static',
    ...dynamicComboboxProbe,
  });

  if (!option) {
    throw new Error(`No visible combobox option appeared for "${value}".`);
  }

  await input.actionEngine.click(option);
  await input.page.waitForTimeout(150);
  await input.page.keyboard.press('Escape').catch(() => undefined);
  await input.locator.evaluate((element) => {
    if (element instanceof HTMLElement) {
      element.blur();
    }
  }).catch(() => undefined);
}

async function firstVisibleChoiceLocator(input: {
  page: Page;
  root: Locator;
  selector: string;
  value: string;
  ariaRole: 'radio' | 'checkbox';
  label?: string;
}): Promise<Locator | null> {
  const valueSelector = `${input.selector}[value="${escapeAttributeValue(input.value)}"]`;
  const byValue = await firstVisibleLocator({
    page: input.page,
    root: input.root,
    selector: valueSelector,
  });
  if (byValue) {
    return byValue;
  }

  if (input.label && input.label.trim().length > 0) {
    const scopedRole = input.root.getByRole(input.ariaRole, { name: input.label.trim(), exact: true }).first();
    if (await scopedRole.isVisible().catch(() => false)) {
      return scopedRole;
    }

    const pageRole = input.page.getByRole(input.ariaRole, { name: input.label.trim(), exact: true }).first();
    if (await pageRole.isVisible().catch(() => false)) {
      return pageRole;
    }

    const scopedByLabel = input.root.getByLabel(input.label.trim()).first();
    if (await scopedByLabel.isVisible().catch(() => false)) {
      return scopedByLabel;
    }

    const pageByLabel = input.page.getByLabel(input.label.trim()).first();
    if (await pageByLabel.isVisible().catch(() => false)) {
      return pageByLabel;
    }
  }

  return null;
}

async function executeChoiceGroup(input: {
  page: Page;
  root: Locator;
  field: ScrapedApplicationField;
  entry: ApplicationFillPlanEntry;
  selector: string;
  actionEngine: HumanActionEngine;
}): Promise<void> {
  const values = choiceValues(input.entry.value);
  if (values.length === 0) {
    throw new Error('Choice group action did not include option values.');
  }

  const ariaRole: 'radio' | 'checkbox' =
    input.field.type === 'radio_group' ? 'radio' : 'checkbox';

  for (const value of values) {
    const comparable = normalizeComparableSlug(value);
    const option = input.field.options.find((candidate) =>
      choiceOptionMatchesRequestedValue(candidate, value, comparable)
    );
    const domValue =
      option && option.value.trim().length > 0 ? option.value : value;
    const locator = await firstVisibleChoiceLocator({
      page: input.page,
      root: input.root,
      selector: input.selector,
      value: domValue,
      ariaRole,
      ...(option?.label.trim().length
        ? { label: option.label.trim() }
        : option?.value.trim().length
          ? { label: option.value.trim() }
          : {}),
    });

    if (!locator) {
      throw new Error(`Choice option ${value} was not visible.`);
    }

    const alreadyChecked = await locator.isChecked().catch(() => false);
    if (!alreadyChecked) {
      await input.actionEngine.click(locator);
    }
  }
}

async function executeTextFill(input: {
  board: SupportedApplicationBoard;
  page: Page;
  root: Locator;
  field: ScrapedApplicationField;
  entry: ApplicationFillPlanEntry;
  locator: Locator;
  actionEngine: HumanActionEngine;
}): Promise<void> {
  if (input.entry.action !== 'fill' || typeof input.entry.value !== 'string') {
    throw new Error('Text field action requires a text fill value.');
  }

  const isLocationAutocomplete = isBoardLocationAutocompleteField({
    board: input.board,
    field: input.field,
  });
  if (isLocationAutocomplete) {
    await executeLocationAutocomplete(input);
    return;
  }

  await input.actionEngine.typeText(input.locator, input.entry.value);
}

async function executeSelect(input: {
  field: ScrapedApplicationField;
  entry: ApplicationFillPlanEntry;
  locator: Locator;
  actionEngine: HumanActionEngine;
}): Promise<void> {
  if (
    input.entry.action !== 'select' ||
    typeof input.entry.value !== 'string'
  ) {
    throw new Error('Select action requires an option value.');
  }

  const value = input.entry.value;
  const comparableRequested = normalizeComparableSlug(value);
  const targetIndex = input.field.options.findIndex((option) =>
    choiceOptionMatchesRequestedValue(option, value, comparableRequested)
  );
  if (targetIndex < 0) {
    throw new Error(`No known select option matched "${value}".`);
  }

  const targetOption = input.field.options[targetIndex];
  const tagName =
    (await input.locator.evaluate((element) => element.tagName?.toLowerCase() ?? '').catch(() => '')) ??
    '';

  if (tagName === 'select') {
    try {
      await input.locator.selectOption({ value }, { timeout: 12_000 });
    } catch {
      await input.locator.selectOption(
        { label: targetOption?.label.trim() ?? value },
        { timeout: 12_000 }
      );
    }
    return;
  }

  await input.actionEngine.click(input.locator);
  await input.locator.focus();
  await input.locator.press('Home');
  for (let index = 0; index < targetIndex; index += 1) {
    await input.locator.press('ArrowDown');
  }
  await input.locator.press('Enter');

  const selectedValue = await input.locator.inputValue().catch(() => '');
  if (selectedValue !== value) {
    const targetLabel = targetOption?.label.trim() ?? '';
    await input.locator.focus();
    if (targetLabel.length > 0) {
      await input.locator.press(targetLabel[0] ?? '');
    }
    await input.locator.press('Enter');
  }
}

async function executeCheckbox(input: {
  page: Page;
  root: Locator;
  field: ScrapedApplicationField;
  entry: ApplicationFillPlanEntry;
  locator: Locator;
  actionEngine: HumanActionEngine;
}): Promise<void> {
  if (typeof input.entry.value !== 'boolean') {
    throw new Error('Checkbox action requires a boolean value.');
  }

  const checked = await input.locator.isChecked().catch(() => null);
  if (checked !== input.entry.value) {
    const locatorVisible = await input.locator.isVisible().catch(() => false);
    if (locatorVisible) {
      await input.actionEngine.click(input.locator);
      return;
    }
    // Some boards render hidden checkbox inputs and clickable Yes/No buttons.

    const container = input.locator.locator(
      'xpath=ancestor::*[@data-field-path or @data-field-entry-id or self::fieldset or contains(@class,"fieldEntry") or contains(@class,"field-entry")][1]'
    );
    const buttonName = input.entry.value ? /^yes$/i : /^no$/i;
    const scopedButton = container.getByRole('button', { name: buttonName }).first();
    if (await scopedButton.isVisible().catch(() => false)) {
      await input.actionEngine.click(scopedButton);
      return;
    }

    if (input.field.label.trim().length > 0) {
      const labelContainer = input.root
        .getByText(input.field.label, { exact: false })
        .first()
        .locator(
          'xpath=ancestor::*[@data-field-path or @data-field-entry-id or self::fieldset or contains(@class,"fieldEntry") or contains(@class,"field-entry")][1]'
        );
      const labelScopedButton = labelContainer.getByRole('button', { name: buttonName }).first();
      if (await labelScopedButton.isVisible().catch(() => false)) {
        await input.actionEngine.click(labelScopedButton);
        return;
      }
    }

    throw new Error('Checkbox target was not visible and no Yes/No button fallback was available.');
  }
}

function uploadArtifactForField(input: {
  artifacts?: ApplicationArtifacts;
  field: ScrapedApplicationField;
}): {
  kind: 'resume' | 'coverLetter' | null;
  label: string;
  artifact: ApplicationArtifacts[keyof ApplicationArtifacts] | null;
} {
  const kind = uploadArtifactKindForField(input.field);
  if (kind === 'resume') {
    return {
      kind: 'resume',
      label: 'resume',
      artifact: input.artifacts?.resume ?? null,
    };
  }

  if (kind === 'coverLetter') {
    return {
      kind: 'coverLetter',
      label: 'cover letter',
      artifact: input.artifacts?.coverLetter ?? null,
    };
  }

  return {
    kind: null,
    label: 'upload',
    artifact: null,
  };
}

async function executeFileUploadWithSelectorFallback(input: {
  board: SupportedApplicationBoard;
  page: Page;
  root: Locator;
  field: ScrapedApplicationField;
  entry: ApplicationFillPlanEntry;
  artifacts?: ApplicationArtifacts;
  pacing?: InteractionPacingProfile;
}): Promise<ApplicationFillExecutionResult> {
  if (input.artifacts === undefined) {
    return {
      fieldId: input.field.id,
      label: input.field.label,
      action: input.entry.action,
      status: 'skipped',
      message: input.entry.skipReason || 'Field was skipped by fill plan.',
    };
  }

  const pacing = resolvePacingProfile(input.pacing);
  const upload = uploadArtifactForField({
    artifacts: input.artifacts,
    field: input.field,
  });

  if (!upload.kind) {
    return {
      fieldId: input.field.id,
      label: input.field.label,
      action: input.entry.action,
      status: isFieldRequired(input.field) ? 'failed' : 'skipped',
      message:
        'No matching upload artifact type could be inferred for this file field.',
    };
  }

  if (!upload.artifact) {
    return {
      fieldId: input.field.id,
      label: input.field.label,
      action: input.entry.action,
      status: isFieldRequired(input.field) ? 'failed' : 'skipped',
      message: isFieldRequired(input.field)
        ? `Required ${upload.label} artifact is missing.`
        : `Optional ${upload.label} artifact is missing.`,
    };
  }

  const errors: string[] = [];

  for (const selector of input.field.selectorCandidates) {
    logStage5('selector_attempt', {
      fieldId: input.field.id,
      label: input.field.label,
      action: input.entry.action,
      selector,
    });

    const locator = await firstAttachedLocator({
      page: input.page,
      root: input.root,
      selector,
    });

    if (!locator) {
      errors.push(`${selector}: not attached`);
      continue;
    }

    try {
      await locator.scrollIntoViewIfNeeded().catch(() => undefined);
      await waitWithRange(input.page, pacing.preFieldDelayMs);
      await uploadArtifactFile({
        artifact: upload.artifact,
        locator,
        required: isFieldRequired(input.field),
      });
      await waitWithRange(input.page, pacing.postFieldDelayMs);
      if (input.board === 'lever' && upload.kind === 'resume') {
        await waitForLeverResumeParsingToSettle({
          page: input.page,
          root: input.root,
        });
      }

      return {
        fieldId: input.field.id,
        label: input.field.label,
        action: input.entry.action,
        status: 'success',
        selector,
        message: `Uploaded ${upload.label} artifact.`,
      };
    } catch (error) {
      errors.push(
        `${selector}: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  }

  return {
    fieldId: input.field.id,
    label: input.field.label,
    action: input.entry.action,
    status: 'failed',
    message:
      errors.length > 0
        ? errors.join(' | ')
        : 'No selector candidates were available.',
  };
}

async function executeWithSelectorFallback(input: {
  board: SupportedApplicationBoard;
  page: Page;
  root: Locator;
  field: ScrapedApplicationField;
  entry: ApplicationFillPlanEntry;
  actionEngine: HumanActionEngine;
}): Promise<ApplicationFillExecutionResult> {
  const errors: string[] = [];

  for (const selector of input.field.selectorCandidates) {
    logStage5('selector_attempt', {
      fieldId: input.field.id,
      label: input.field.label,
      action: input.entry.action,
      selector,
    });

    const locator =
      input.entry.action === 'check' && input.field.type === 'checkbox'
        ? await firstAttachedLocator({
            page: input.page,
            root: input.root,
            selector,
          })
        : await firstVisibleLocator({
            page: input.page,
            root: input.root,
            selector,
          });

    if (!locator) {
      errors.push(
        input.entry.action === 'check' && input.field.type === 'checkbox'
          ? `${selector}: not attached`
          : `${selector}: not visible`
      );
      continue;
    }

    try {
      if (input.field.type === 'combobox') {
        await executeCombobox({
          board: input.board,
          page: input.page,
          root: input.root,
          field: input.field,
          entry: input.entry,
          locator,
          actionEngine: input.actionEngine,
        });
        return {
          fieldId: input.field.id,
          label: input.field.label,
          action: input.entry.action,
          status: 'success',
          selector,
          message: 'Selected combobox option.',
        };
      }

      if (
        input.field.type === 'text' ||
        input.field.type === 'email' ||
        input.field.type === 'tel' ||
        input.field.type === 'textarea' ||
        input.field.type === 'rich_text'
      ) {
        await executeTextFill({
          board: input.board,
          page: input.page,
          root: input.root,
          field: input.field,
          entry: input.entry,
          locator,
          actionEngine: input.actionEngine,
        });
        return {
          fieldId: input.field.id,
          label: input.field.label,
          action: input.entry.action,
          status: 'success',
          selector,
          message: 'Filled field.',
        };
      }

      if (input.field.type === 'select') {
        await executeSelect({
          field: input.field,
          entry: input.entry,
          locator,
          actionEngine: input.actionEngine,
        });
        return {
          fieldId: input.field.id,
          label: input.field.label,
          action: input.entry.action,
          status: 'success',
          selector,
          message: 'Selected option.',
        };
      }

      if (input.entry.action === 'check' && input.field.type === 'checkbox') {
        await executeCheckbox({
          page: input.page,
          root: input.root,
          field: input.field,
          entry: input.entry,
          locator,
          actionEngine: input.actionEngine,
        });
        return {
          fieldId: input.field.id,
          label: input.field.label,
          action: input.entry.action,
          status: 'success',
          selector,
          message: input.entry.value ? 'Checked field.' : 'Unchecked field.',
        };
      }

      if (
        input.field.type === 'checkbox_group' &&
        (input.entry.action === 'check' ||
          (input.entry.action === 'fill' &&
            (typeof input.entry.value === 'string' || Array.isArray(input.entry.value))))
      ) {
        await executeChoiceGroup({
          page: input.page,
          root: input.root,
          field: input.field,
          entry: input.entry,
          selector,
          actionEngine: input.actionEngine,
        });
        return {
          fieldId: input.field.id,
          label: input.field.label,
          action: input.entry.action,
          status: 'success',
          selector,
          message: 'Checked choice options.',
        };
      }

      if (
        input.entry.action === 'click' &&
        input.field.type === 'radio_group'
      ) {
        await executeChoiceGroup({
          page: input.page,
          root: input.root,
          field: input.field,
          entry: input.entry,
          selector,
          actionEngine: input.actionEngine,
        });
        return {
          fieldId: input.field.id,
          label: input.field.label,
          action: input.entry.action,
          status: 'success',
          selector,
          message: 'Selected radio option.',
        };
      }

      errors.push(`${selector}: unsupported action or value`);
    } catch (error) {
      errors.push(
        `${selector}: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  }

  return {
    fieldId: input.field.id,
    label: input.field.label,
    action: input.entry.action,
    status: 'failed',
    message:
      errors.length > 0
        ? errors.join(' | ')
        : 'No selector candidates were available.',
  };
}

export async function executeApplicationFillPlan(input: {
  page: Page;
  boardEntry: ApplicationBoardEntryResult;
  artifacts?: ApplicationArtifacts;
  fields: ScrapedApplicationField[];
  fillPlan: ApplicationFillPlanEntry[];
  pacing?: InteractionPacingProfile;
}): Promise<ExecuteApplicationFillPlanResult> {
  const root = input.page
    .locator(input.boardEntry.rootSelector)
    .nth(input.boardEntry.rootIndex);
  const fieldById = new Map(input.fields.map((field) => [field.id, field]));
  const results: ApplicationFillExecutionResult[] = [];
  const actionEngine = createHumanActionEngine({
    page: input.page,
    ...(input.pacing !== undefined ? { pacing: input.pacing } : {}),
  });

  await actionEngine.waitForPreFill();

  for (const entry of input.fillPlan) {
    const field = fieldById.get(entry.fieldId);

    logStage5('action_start', {
      fieldId: entry.fieldId,
      action: entry.action,
    });

    if (!field) {
      const result: ApplicationFillExecutionResult = {
        fieldId: entry.fieldId,
        label: '',
        action: entry.action,
        status: 'failed',
        message: 'Fill plan entry did not match a scraped field.',
      };
      logStage5('action_failed', result);
      results.push(result);
      continue;
    }

    if (field.type === 'file' || field.specialHandling === 'file_upload') {
      const result = await executeFileUploadWithSelectorFallback({
        board: input.boardEntry.board,
        page: input.page,
        root,
        field,
        entry,
        ...(input.artifacts !== undefined ? { artifacts: input.artifacts } : {}),
        ...(input.pacing !== undefined ? { pacing: input.pacing } : {}),
      });
      logStage5(
        result.status === 'success'
          ? 'action_success'
          : result.status === 'skipped'
            ? 'action_skipped'
            : 'action_failed',
        result
      );
      results.push(result);
      continue;
    }

    if (entry.action === 'skip') {
      const result: ApplicationFillExecutionResult = {
        fieldId: field.id,
        label: field.label,
        action: entry.action,
        status: 'skipped',
        message: entry.skipReason || 'Field was skipped by fill plan.',
      };
      logStage5('action_skipped', result);
      results.push(result);
      continue;
    }

    const result = await executeWithSelectorFallback({
      board: input.boardEntry.board,
      page: input.page,
      root,
      field,
      entry,
      actionEngine,
    });
    logStage5(
      result.status === 'success' ? 'action_success' : 'action_failed',
      result
    );
    results.push(result);
  }

  const summary = createSummary(results);
  logStage5('execution_summary', summary);

  return {
    results,
    summary,
    telemetry: {
      totalPreFillDwellMs: actionEngine.metrics.preFillDwellMs,
      totalTypingDurationMs: actionEngine.metrics.typingDurationMs,
      totalPointerActions: actionEngine.metrics.pointerActions,
      forbiddenDirectApiUsage: [],
    },
  };
}

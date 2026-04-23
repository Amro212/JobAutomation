import type { Locator, Page } from 'playwright';

import type {
  ApplicationArtifacts,
  InteractionPacingProfile,
} from './contracts';
import type {
  ApplicationBoardEntryResult,
  SupportedApplicationBoard,
} from './board-entry';
import type { ScrapedApplicationField } from './form-scraper';
import type { ApplicationFillPlanEntry } from './openrouter-answer-module';
import { uploadArtifactFile } from './file-upload';

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
      await locator.scrollIntoViewIfNeeded().catch(() => undefined);
      await waitWithRange(input.page, pacing.preFieldDelayMs);
      await locator.hover().catch(() => undefined);
      await locator.click();
      metrics.pointerActions += 1;
      await waitWithRange(input.page, pacing.postFieldDelayMs);
    },
    async typeText(
      locator: Locator,
      value: string,
      options?: { ensureClear?: boolean; skipScroll?: boolean }
    ) {
      if (!options?.skipScroll) {
        await locator.scrollIntoViewIfNeeded().catch(() => undefined);
      }
      await waitWithRange(input.page, pacing.preFieldDelayMs);
      await locator.click();
      metrics.pointerActions += 1;

      const existingInputValue = await locator.inputValue().catch(() => null);
      const existingTextContent = await locator.textContent().catch(() => null);
      const existingValue = (
        existingInputValue ??
        existingTextContent ??
        ''
      ).trim();
      if (existingValue.length > 0) {
        await input.page.keyboard.press('Control+A').catch(() => undefined);
        await input.page.keyboard.press('Backspace').catch(() => undefined);
      }
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
          await input.page.keyboard.press('Control+A').catch(() => undefined);
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

function comboboxCandidateLabels(input: {
  field: ScrapedApplicationField;
  value: string;
}): string[] {
  const normalizedValue = normalizeOptionText(input.value);
  const matchingFieldOptions = input.field.options.filter(
    (option) =>
      normalizeOptionText(option.value) === normalizedValue ||
      normalizeOptionText(option.label) === normalizedValue
  );

  return Array.from(
    new Set(
      [
        ...matchingFieldOptions.flatMap((option) => [
          option.label,
          option.value,
        ]),
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

async function visibleOptionByText(input: {
  page: Page;
  root: Locator;
  labels: string[];
}): Promise<Locator | null> {
  for (const label of input.labels) {
    const scopedOption = input.root
      .getByRole('option', { name: label, exact: true })
      .first();
    if (await scopedOption.isVisible().catch(() => false)) {
      return scopedOption;
    }

    const pageOption = input.page
      .getByRole('option', { name: label, exact: true })
      .first();
    if (await pageOption.isVisible().catch(() => false)) {
      return pageOption;
    }
  }

  return null;
}

async function firstVisibleOption(input: {
  page: Page;
  root: Locator;
}): Promise<Locator | null> {
  const scopedOption = input.root.getByRole('option').first();
  if (await scopedOption.isVisible().catch(() => false)) {
    return scopedOption;
  }

  const pageOption = input.page.getByRole('option').first();
  if (await pageOption.isVisible().catch(() => false)) {
    return pageOption;
  }

  return null;
}

async function waitForComboboxOption(input: {
  page: Page;
  root: Locator;
  labels: string[];
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
    });
    if (exactMatch) {
      return exactMatch;
    }

    const firstVisible = await firstVisibleOption({
      page: input.page,
      root: input.root,
    });
    if (firstVisible) {
      return firstVisible;
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
  const timeoutMs = input.timeoutMs ?? 2_500;
  const pollMs = input.pollMs ?? 100;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const option = input.page
      .locator('.dropdown-results .dropdown-location, .dropdown-results [id^="location-"]')
      .first();
    if (await option.isVisible().catch(() => false)) {
      return option;
    }

    await input.page.waitForTimeout(pollMs);
  }

  return null;
}

async function hasLeverSelectedLocation(page: Page): Promise<boolean> {
  const selectedLocation = page
    .locator('#selected-location, [name="selectedLocation"]')
    .first();
  if ((await selectedLocation.count().catch(() => 0)) === 0) {
    return true;
  }

  return (await selectedLocation.inputValue().catch(() => '')).trim().length > 0;
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
  await waitWithRange(input.page, [1000, 2000]);

  if (input.board === 'lever') {
    const option = await waitForLeverLocationOption({ page: input.page });
    if (!option) {
      throw new Error(`No visible location suggestion appeared for "${value}".`);
    }

    await clickLocatorCenterWithoutScroll({ page: input.page, locator: option });
    await input.page.waitForTimeout(300);
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

  await input.actionEngine.press('Enter');
  await input.page.waitForTimeout(300);
  if (await ashbyLocationCommitted({ page: input.page, locator: input.locator })) {
    return;
  }

  await clickLocatorCenterWithoutScroll({ page: input.page, locator: option });
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

  await input.actionEngine.typeText(input.locator, value);

  const option = await waitForComboboxOption({
    page: input.page,
    root: input.root,
    labels: comboboxCandidateLabels({
      field: input.field,
      value,
    }),
  });

  if (!option) {
    throw new Error(`No visible combobox option appeared for "${value}".`);
  }

  await input.actionEngine.click(option);
}

async function firstVisibleChoiceLocator(input: {
  page: Page;
  root: Locator;
  selector: string;
  value: string;
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

  if (!input.label) {
    return null;
  }

  const scopedByLabel = input.root.getByLabel(input.label).first();
  if (await scopedByLabel.isVisible().catch(() => false)) {
    return scopedByLabel;
  }

  const pageByLabel = input.page.getByLabel(input.label).first();
  if (await pageByLabel.isVisible().catch(() => false)) {
    return pageByLabel;
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

  for (const value of values) {
    const option = input.field.options.find(
      (candidate) => candidate.value === value
    );
    const locator = await firstVisibleChoiceLocator({
      page: input.page,
      root: input.root,
      selector: input.selector,
      value,
      ...(option?.label ? { label: option.label } : {}),
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
  const targetIndex = input.field.options.findIndex(
    (option) =>
      option.value === value || normalizeOptionText(option.label) === normalizeOptionText(value)
  );
  if (targetIndex < 0) {
    throw new Error(`No known select option matched "${value}".`);
  }

  await input.actionEngine.click(input.locator);
  await input.actionEngine.press('Home');
  for (let index = 0; index < targetIndex; index += 1) {
    await input.actionEngine.press('ArrowDown');
  }
  await input.actionEngine.press('Enter');
}

async function executeCheckbox(input: {
  entry: ApplicationFillPlanEntry;
  locator: Locator;
  actionEngine: HumanActionEngine;
}): Promise<void> {
  if (typeof input.entry.value !== 'boolean') {
    throw new Error('Checkbox action requires a boolean value.');
  }

  const checked = await input.locator.isChecked().catch(() => false);
  if (checked !== input.entry.value) {
    await input.actionEngine.click(input.locator);
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
  const normalized = `${input.field.id} ${input.field.label}`.toLowerCase();

  if (/(resume|cv|curriculum vitae)/i.test(normalized)) {
    return {
      kind: 'resume',
      label: 'resume',
      artifact: input.artifacts?.resume ?? null,
    };
  }

  if (/(cover[\s_-]*letter|coverletter)/i.test(normalized)) {
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
      status: input.field.required ? 'failed' : 'skipped',
      message:
        'No matching upload artifact type could be inferred for this file field.',
    };
  }

  if (!upload.artifact) {
    return {
      fieldId: input.field.id,
      label: input.field.label,
      action: input.entry.action,
      status: input.field.required ? 'failed' : 'skipped',
      message: input.field.required
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
        required: input.field.required,
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

    const locator = await firstVisibleLocator({
      page: input.page,
      root: input.root,
      selector,
    });

    if (!locator) {
      errors.push(`${selector}: not visible`);
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
        input.entry.action === 'check' &&
        input.field.type === 'checkbox_group'
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
    pacing: input.pacing,
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
        artifacts: input.artifacts,
        pacing: input.pacing,
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

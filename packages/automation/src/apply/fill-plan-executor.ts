import type { Locator, Page } from 'playwright';

import type { InteractionPacingProfile } from './contracts';
import type { ApplicationBoardEntryResult } from './board-entry';
import type { ScrapedApplicationField } from './form-scraper';
import type { ApplicationFillPlanEntry } from './openrouter-answer-module';

export type ApplicationFillExecutionStatus = 'success' | 'skipped' | 'failed';

export type HumanActionEngine = {
  click: (locator: Locator) => Promise<void>;
  typeText: (locator: Locator, value: string) => Promise<void>;
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
  sectionReadDelayMs: [20, 40]
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
    failed: results.filter((result) => result.status === 'failed').length
  };
}

function randomBetween([min, max]: [number, number]): number {
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
    postFieldDelayMs: pacing?.postFieldDelayMs ?? DEFAULT_PACING.postFieldDelayMs,
    typingDelayMs: pacing?.typingDelayMs ?? DEFAULT_PACING.typingDelayMs,
    preApplyReadDelayMs: pacing?.preApplyReadDelayMs ?? DEFAULT_PACING.preApplyReadDelayMs,
    sectionReadDelayMs: pacing?.sectionReadDelayMs ?? DEFAULT_PACING.sectionReadDelayMs
  };
}

async function waitWithRange(page: Page, range: [number, number]): Promise<number> {
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
    preFillDwellMs: 0
  };

  return {
    metrics,
    async waitForPreFill() {
      metrics.preFillDwellMs += await waitWithRange(input.page, pacing.preApplyReadDelayMs);
    },
    async click(locator: Locator) {
      await locator.scrollIntoViewIfNeeded().catch(() => undefined);
      await waitWithRange(input.page, pacing.preFieldDelayMs);
      await locator.hover().catch(() => undefined);
      await locator.click();
      metrics.pointerActions += 1;
      await waitWithRange(input.page, pacing.postFieldDelayMs);
    },
    async typeText(locator: Locator, value: string) {
      await locator.scrollIntoViewIfNeeded().catch(() => undefined);
      await waitWithRange(input.page, pacing.preFieldDelayMs);
      await locator.click();
      metrics.pointerActions += 1;

      const existingInputValue = await locator.inputValue().catch(() => null);
      const existingTextContent = await locator.textContent().catch(() => null);
      const existingValue = (existingInputValue ?? existingTextContent ?? '').trim();
      if (existingValue.length > 0) {
        await input.page.keyboard.press('Control+A').catch(() => undefined);
        await input.page.keyboard.press('Backspace').catch(() => undefined);
      }

      for (const [index, character] of Array.from(value).entries()) {
        const keyDelay = randomBetween(pacing.typingDelayMs);
        await input.page.keyboard.type(character, { delay: keyDelay });
        metrics.typingDurationMs += keyDelay;

        if (index > 0 && index % 5 === 0) {
          metrics.typingDurationMs += await waitWithRange(input.page, pacing.sectionReadDelayMs);
        }
      }

      await waitWithRange(input.page, pacing.postFieldDelayMs);
    },
    async press(key: string) {
      await input.page.keyboard.press(key);
    }
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
        ...matchingFieldOptions.flatMap((option) => [option.label, option.value]),
        input.value
      ].filter((candidate) => candidate.trim().length > 0)
    )
  );
}

async function visibleOptionByText(input: {
  page: Page;
  root: Locator;
  labels: string[];
}): Promise<Locator | null> {
  for (const label of input.labels) {
    const scopedOption = input.root.getByRole('option', { name: label, exact: true }).first();
    if (await scopedOption.isVisible().catch(() => false)) {
      return scopedOption;
    }

    const pageOption = input.page.getByRole('option', { name: label, exact: true }).first();
    if (await pageOption.isVisible().catch(() => false)) {
      return pageOption;
    }
  }

  return null;
}

async function executeCombobox(input: {
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

  await input.actionEngine.typeText(input.locator, value);

  const option = await visibleOptionByText({
    page: input.page,
    root: input.root,
    labels: comboboxCandidateLabels({
      field: input.field,
      value
    })
  });

  if (!option) {
    throw new Error(`No visible combobox option matched "${value}".`);
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
    selector: valueSelector
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
    const option = input.field.options.find((candidate) => candidate.value === value);
    const locator = await firstVisibleChoiceLocator({
      page: input.page,
      root: input.root,
      selector: input.selector,
      value,
      ...(option?.label ? { label: option.label } : {})
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
  field: ScrapedApplicationField;
  entry: ApplicationFillPlanEntry;
  locator: Locator;
  actionEngine: HumanActionEngine;
}): Promise<void> {
  if (input.entry.action !== 'fill' || typeof input.entry.value !== 'string') {
    throw new Error('Text field action requires a text fill value.');
  }

  await input.actionEngine.typeText(input.locator, input.entry.value);
}

async function executeSelect(input: {
  field: ScrapedApplicationField;
  entry: ApplicationFillPlanEntry;
  locator: Locator;
  actionEngine: HumanActionEngine;
}): Promise<void> {
  if (input.entry.action !== 'select' || typeof input.entry.value !== 'string') {
    throw new Error('Select action requires an option value.');
  }

  const targetIndex = input.field.options.findIndex(
    (option) =>
      option.value === input.entry.value || normalizeOptionText(option.label) === normalizeOptionText(input.entry.value)
  );
  if (targetIndex < 0) {
    throw new Error(`No known select option matched "${input.entry.value}".`);
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

async function executeWithSelectorFallback(input: {
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
      selector
    });

    const locator = await firstVisibleLocator({
      page: input.page,
      root: input.root,
      selector
    });

    if (!locator) {
      errors.push(`${selector}: not visible`);
      continue;
    }

    try {
      if (input.field.type === 'combobox') {
        await executeCombobox({
          page: input.page,
          root: input.root,
          field: input.field,
          entry: input.entry,
          locator,
          actionEngine: input.actionEngine
        });
        return {
          fieldId: input.field.id,
          label: input.field.label,
          action: input.entry.action,
          status: 'success',
          selector,
          message: 'Selected combobox option.'
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
          field: input.field,
          entry: input.entry,
          locator,
          actionEngine: input.actionEngine
        });
        return {
          fieldId: input.field.id,
          label: input.field.label,
          action: input.entry.action,
          status: 'success',
          selector,
          message: 'Filled field.'
        };
      }

      if (input.field.type === 'select') {
        await executeSelect({
          field: input.field,
          entry: input.entry,
          locator,
          actionEngine: input.actionEngine
        });
        return {
          fieldId: input.field.id,
          label: input.field.label,
          action: input.entry.action,
          status: 'success',
          selector,
          message: 'Selected option.'
        };
      }

      if (input.entry.action === 'check' && input.field.type === 'checkbox') {
        await executeCheckbox({
          entry: input.entry,
          locator,
          actionEngine: input.actionEngine
        });
        return {
          fieldId: input.field.id,
          label: input.field.label,
          action: input.entry.action,
          status: 'success',
          selector,
          message: input.entry.value ? 'Checked field.' : 'Unchecked field.'
        };
      }

      if (input.entry.action === 'check' && input.field.type === 'checkbox_group') {
        await executeChoiceGroup({
          page: input.page,
          root: input.root,
          field: input.field,
          entry: input.entry,
          selector,
          actionEngine: input.actionEngine
        });
        return {
          fieldId: input.field.id,
          label: input.field.label,
          action: input.entry.action,
          status: 'success',
          selector,
          message: 'Checked choice options.'
        };
      }

      if (input.entry.action === 'click' && input.field.type === 'radio_group') {
        await executeChoiceGroup({
          page: input.page,
          root: input.root,
          field: input.field,
          entry: input.entry,
          selector,
          actionEngine: input.actionEngine
        });
        return {
          fieldId: input.field.id,
          label: input.field.label,
          action: input.entry.action,
          status: 'success',
          selector,
          message: 'Selected radio option.'
        };
      }

      errors.push(`${selector}: unsupported action or value`);
    } catch (error) {
      errors.push(`${selector}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  return {
    fieldId: input.field.id,
    label: input.field.label,
    action: input.entry.action,
    status: 'failed',
    message: errors.length > 0 ? errors.join(' | ') : 'No selector candidates were available.'
  };
}

export async function executeApplicationFillPlan(input: {
  page: Page;
  boardEntry: ApplicationBoardEntryResult;
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
    pacing: input.pacing
  });

  await actionEngine.waitForPreFill();

  for (const entry of input.fillPlan) {
    const field = fieldById.get(entry.fieldId);

    logStage5('action_start', {
      fieldId: entry.fieldId,
      action: entry.action
    });

    if (!field) {
      const result: ApplicationFillExecutionResult = {
        fieldId: entry.fieldId,
        label: '',
        action: entry.action,
        status: 'failed',
        message: 'Fill plan entry did not match a scraped field.'
      };
      logStage5('action_failed', result);
      results.push(result);
      continue;
    }

    if (entry.action === 'skip' || field.type === 'file') {
      const result: ApplicationFillExecutionResult = {
        fieldId: field.id,
        label: field.label,
        action: entry.action,
        status: 'skipped',
        message: entry.skipReason || 'Field was skipped by fill plan.'
      };
      logStage5('action_skipped', result);
      results.push(result);
      continue;
    }

    const result = await executeWithSelectorFallback({
      page: input.page,
      root,
      field,
      entry,
      actionEngine
    });
    logStage5(result.status === 'success' ? 'action_success' : 'action_failed', result);
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
      forbiddenDirectApiUsage: []
    }
  };
}

import type { Locator, Page } from 'playwright';

import type { ApplicationBoardEntryResult } from './board-entry';
import type { ScrapedApplicationField } from './form-scraper';
import type { ApplicationFillPlanEntry } from './openrouter-answer-module';

export type ApplicationFillExecutionStatus = 'success' | 'skipped' | 'failed';

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
};

const STAGE_5_LOG_PREFIX = '[Stage 5][fill-plan-executor]';

// DEBUG: remove after Stage 5
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
}): Promise<void> {
  if (input.entry.action !== 'fill' || typeof input.entry.value !== 'string') {
    throw new Error('Combobox action requires a text fill value.');
  }

  const value = input.entry.value.trim();
  if (!value) {
    throw new Error('Combobox action requires a non-empty text value.');
  }

  await input.locator.click();
  await input.locator.fill(value);

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

  await option.click();
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

    await locator.setChecked(true);
  }
}

async function executeWithSelectorFallback(input: {
  page: Page;
  root: Locator;
  field: ScrapedApplicationField;
  entry: ApplicationFillPlanEntry;
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
      // DEBUG: remove after Stage 5
      if (input.field.type === 'combobox') {
        await executeCombobox({
          page: input.page,
          root: input.root,
          field: input.field,
          entry: input.entry,
          locator
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

      if (input.entry.action === 'fill' && typeof input.entry.value === 'string') {
        await locator.fill(input.entry.value);
        return {
          fieldId: input.field.id,
          label: input.field.label,
          action: input.entry.action,
          status: 'success',
          selector,
          message: 'Filled field.'
        };
      }

      if (input.entry.action === 'select' && typeof input.entry.value === 'string') {
        await locator.selectOption(input.entry.value);
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
        if (typeof input.entry.value !== 'boolean') {
          errors.push(`${selector}: checkbox action requires a boolean value`);
          continue;
        }

        await locator.setChecked(input.entry.value);
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
          selector
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
          selector
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
}): Promise<ExecuteApplicationFillPlanResult> {
  const root = input.page
    .locator(input.boardEntry.rootSelector)
    .nth(input.boardEntry.rootIndex);
  const fieldById = new Map(input.fields.map((field) => [field.id, field]));
  const results: ApplicationFillExecutionResult[] = [];

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
      entry
    });
    logStage5(result.status === 'success' ? 'action_success' : 'action_failed', result);
    results.push(result);
  }

  const summary = createSummary(results);
  logStage5('execution_summary', summary);

  return {
    results,
    summary
  };
}

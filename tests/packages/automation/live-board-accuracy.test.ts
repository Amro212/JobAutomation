import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Page } from 'playwright';
import { afterEach, describe, expect, test } from 'vitest';

import { reachApplicationForm, type SupportedApplicationBoard } from '../../../packages/automation/src/apply/board-entry';
import { executeApplicationFillPlan } from '../../../packages/automation/src/apply/fill-plan-executor';
import { isFieldRequired } from '../../../packages/automation/src/apply/field-contract';
import type { ScrapedApplicationField } from '../../../packages/automation/src/apply/form-scraper';
import { scrapeApplicationFields } from '../../../packages/automation/src/apply/form-scraper';
import type { ApplicationFillPlanEntry } from '../../../packages/automation/src/apply/openrouter-answer-module';
import { createDiscoveryBrowser } from '../../../packages/automation/src/playwright/browser';

type LiveBoardScenario = {
  board: SupportedApplicationBoard;
  title: string;
  url: string;
};

type ExpectedObservedState =
  | { kind: 'value'; value: string }
  | { kind: 'checked'; value: boolean }
  | { kind: 'file'; value: string };

type PlannedScenario = {
  fillPlan: ApplicationFillPlanEntry[];
  expectedStates: Map<string, ExpectedObservedState>;
};

const LIVE_BOARD_SCENARIOS: LiveBoardScenario[] = [
  {
    board: 'greenhouse',
    title: 'Greenhouse',
    url:
      process.env.JOBAUTOMATION_LIVE_GREENHOUSE_URL ??
      'https://job-boards.greenhouse.io/circle_unlisted/jobs/5112809008',
  },
  {
    board: 'lever',
    title: 'Lever',
    url:
      process.env.JOBAUTOMATION_LIVE_LEVER_URL ??
      'https://jobs.lever.co/leverdemo-8/e6528436-8f32-4aa0-b870-999d610534a6',
  },
  {
    board: 'ashby',
    title: 'Ashby',
    url:
      process.env.JOBAUTOMATION_LIVE_ASHBY_URL ??
      'https://jobs.ashbyhq.com/openai/460b4295-3803-4dda-983d-3b0fea0b0fc4/application',
  },
];

const ZERO_PACING = {
  preFieldDelayMs: [0, 0] as [number, number],
  postFieldDelayMs: [0, 0] as [number, number],
  typingDelayMs: [0, 0] as [number, number],
  preApplyReadDelayMs: [0, 0] as [number, number],
  sectionReadDelayMs: [0, 0] as [number, number],
};

const STABLE_ASHBY_PACING = {
  preFieldDelayMs: [20, 20] as [number, number],
  postFieldDelayMs: [20, 20] as [number, number],
  typingDelayMs: [10, 10] as [number, number],
  preApplyReadDelayMs: [20, 20] as [number, number],
  sectionReadDelayMs: [10, 10] as [number, number],
};

describe.sequential('live application board accuracy', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  async function withPage<T>(run: (page: Page) => Promise<T>): Promise<T> {
    const browser = await createDiscoveryBrowser();
    const context = await browser.newContext({ locale: 'en-US' });
    const page = await context.newPage();

    try {
      return await run(page);
    } finally {
      await context.close();
      await browser.close();
    }
  }

  function createResumeArtifact() {
    const dir = mkdtempSync(join(tmpdir(), 'jobautomation-live-'));
    tempDirs.push(dir);
    const storagePath = join(dir, 'resume.txt');
    writeFileSync(
      storagePath,
      ['Taylor Example', 'Platform Engineer', 'taylor@example.com'].join('\n')
    );

    return {
      fileName: 'resume.txt',
      storagePath,
    };
  }

  function fillEntry(fieldId: string, value: string): ApplicationFillPlanEntry {
    return {
      fieldId,
      action: 'fill',
      value,
      confidence: 1,
      skipReason: '',
    };
  }

  function checkEntry(
    fieldId: string,
    value: boolean
  ): ApplicationFillPlanEntry {
    return {
      fieldId,
      action: 'check',
      value,
      confidence: 1,
      skipReason: '',
    };
  }

  function skipEntry(fieldId: string, reason = 'optional'): ApplicationFillPlanEntry {
    return {
      fieldId,
      action: 'skip',
      value: null,
      confidence: 0.5,
      skipReason: reason,
    };
  }

  function radioEntry(fieldId: string, value: string): ApplicationFillPlanEntry {
    return {
      fieldId,
      action: 'click',
      value,
      confidence: 1,
      skipReason: '',
    };
  }

  function normalizeLiveLabel(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function planGreenhouse(fields: ScrapedApplicationField[]): PlannedScenario {
    const fillPlan: ApplicationFillPlanEntry[] = [];
    const expectedStates = new Map<string, ExpectedObservedState>();

    for (const field of fields) {
      const label = field.label.toLowerCase();
      const selectorFingerprint = field.selectorCandidates.join(' ').toLowerCase();

      if (
        field.id.toLowerCase().includes('__search-input') ||
        selectorFingerprint.includes('[aria-label="search"]')
      ) {
        fillPlan.push(skipEntry(field.id));
        continue;
      }

      if (field.type === 'file') {
        continue;
      }

      if (label.includes('first name')) {
        fillPlan.push(fillEntry(field.id, 'Taylor'));
        expectedStates.set(field.id, { kind: 'value', value: 'Taylor' });
        continue;
      }

      if (label.includes('last name')) {
        fillPlan.push(fillEntry(field.id, 'Example'));
        expectedStates.set(field.id, { kind: 'value', value: 'Example' });
        continue;
      }

      if (label.includes('preferred first name')) {
        fillPlan.push(fillEntry(field.id, 'Taylor'));
        expectedStates.set(field.id, { kind: 'value', value: 'Taylor' });
        continue;
      }

      if (label.includes('email')) {
        fillPlan.push(fillEntry(field.id, 'taylor@example.com'));
        expectedStates.set(field.id, {
          kind: 'value',
          value: 'taylor@example.com',
        });
        continue;
      }

      if (label === 'phone') {
        fillPlan.push(fillEntry(field.id, '5551234567'));
        expectedStates.set(field.id, { kind: 'value', value: '5551234567' });
        continue;
      }

      if (label.includes('linkedin')) {
        fillPlan.push(
          fillEntry(field.id, 'https://www.linkedin.com/in/taylor-example')
        );
        expectedStates.set(field.id, {
          kind: 'value',
          value: 'https://www.linkedin.com/in/taylor-example',
        });
        continue;
      }

      if (label.includes('website') || label.includes('portfolio')) {
        fillPlan.push(fillEntry(field.id, 'https://example.com'));
        expectedStates.set(field.id, {
          kind: 'value',
          value: 'https://example.com',
        });
        continue;
      }

      if (isFieldRequired(field)) {
        throw new Error(
          `Unmapped required Greenhouse field: ${field.label} (${field.id})`
        );
      }

      fillPlan.push(skipEntry(field.id));
    }

    return {
      fillPlan,
      expectedStates,
    };
  }

  function planLever(fields: ScrapedApplicationField[]): PlannedScenario {
    const fillPlan: ApplicationFillPlanEntry[] = [];
    const expectedStates = new Map<string, ExpectedObservedState>();

    for (const field of fields) {
      const label = field.label.toLowerCase();

      if (field.type === 'file') {
        continue;
      }

      if (label.includes('full name')) {
        fillPlan.push(fillEntry(field.id, 'Taylor Example'));
        continue;
      }

      if (label === 'email✱' || label === 'email') {
        fillPlan.push(fillEntry(field.id, 'taylor@example.com'));
        continue;
      }

      if (label === 'phone') {
        fillPlan.push(fillEntry(field.id, '5551234567'));
        expectedStates.set(field.id, { kind: 'value', value: '5551234567' });
        continue;
      }

      if (label.includes('current company')) {
        fillPlan.push(fillEntry(field.id, 'Example Corp'));
        expectedStates.set(field.id, {
          kind: 'value',
          value: 'Example Corp',
        });
        continue;
      }

      if (label.includes('linkedin')) {
        fillPlan.push(
          fillEntry(field.id, 'https://www.linkedin.com/in/taylor-example')
        );
        continue;
      }

      if (label.includes('portfolio')) {
        fillPlan.push(fillEntry(field.id, 'https://example.com'));
        continue;
      }

      if (label.includes('github')) {
        fillPlan.push(skipEntry(field.id));
        continue;
      }

      if (isFieldRequired(field)) {
        throw new Error(
          `Unmapped required Lever field: ${field.label} (${field.id})`
        );
      }

      fillPlan.push(skipEntry(field.id));
    }

    return {
      fillPlan,
      expectedStates,
    };
  }

  function planAshby(fields: ScrapedApplicationField[]): PlannedScenario {
    const fillPlan: ApplicationFillPlanEntry[] = [];
    const expectedStates = new Map<string, ExpectedObservedState>();

    for (const field of fields) {
      const label = normalizeLiveLabel(field.label);

      if (field.type === 'file' && label.includes('resume')) {
        fillPlan.push(fillEntry(field.id, 'resume'));
        expectedStates.set(field.id, { kind: 'file', value: 'resume.txt' });
        continue;
      }

      if (field.type === 'file') {
        fillPlan.push(skipEntry(field.id));
        continue;
      }

      if (label === 'name' || label.includes('full name')) {
        fillPlan.push(fillEntry(field.id, 'Taylor Example'));
        if (!field.id.startsWith('_systemfield_')) {
          expectedStates.set(field.id, {
            kind: 'value',
            value: 'Taylor Example',
          });
        }
        continue;
      }

      if (label.includes('email')) {
        fillPlan.push(fillEntry(field.id, 'taylor@example.com'));
        expectedStates.set(field.id, {
          kind: 'value',
          value: 'taylor@example.com',
        });
        continue;
      }

      if (label.includes('phone')) {
        fillPlan.push(fillEntry(field.id, '5551234567'));
        expectedStates.set(field.id, { kind: 'value', value: '5551234567' });
        continue;
      }

      if (
        field.type === 'combobox' &&
        label.includes('where are you currently located') ||
        (field.type === 'combobox' &&
          label.includes('current place of residence')) ||
        (field.type === 'combobox' && label.includes('current location'))
      ) {
        fillPlan.push(fillEntry(field.id, 'Seattle'));
        expectedStates.set(field.id, {
          kind: 'value',
          value: 'Seattle, Washington, United States',
        });
        continue;
      }

      if (label.includes('when can you start')) {
        fillPlan.push(fillEntry(field.id, '05/31/2026'));
        expectedStates.set(field.id, { kind: 'value', value: '05/31/2026' });
        continue;
      }

      if (label.includes('minimum hourly compensation')) {
        fillPlan.push(fillEntry(field.id, '120'));
        expectedStates.set(field.id, { kind: 'value', value: '120' });
        continue;
      }

      if (label.includes('most impressive accomplishment')) {
        fillPlan.push(
          fillEntry(
            field.id,
            'Led a cross-functional launch from zero to production and exceeded the operating target.'
          )
        );
        expectedStates.set(field.id, {
          kind: 'value',
          value:
            'Led a cross-functional launch from zero to production and exceeded the operating target.',
        });
        continue;
      }

      if (label.includes('authorized to work')) {
        fillPlan.push(checkEntry(field.id, true));
        continue;
      }

      if (label.includes('able to work from our us office')) {
        fillPlan.push(checkEntry(field.id, true));
        continue;
      }

      if (isFieldRequired(field) && field.type === 'checkbox') {
        fillPlan.push(checkEntry(field.id, true));
        continue;
      }

      if (isFieldRequired(field) && field.type === 'radio_group') {
        const firstOption = field.options[0];
        if (!firstOption) {
          throw new Error(
            `Required Ashby radio group has no options: ${field.label} (${field.id})`
          );
        }

        fillPlan.push(radioEntry(field.id, firstOption.value));
        continue;
      }

      if (isFieldRequired(field) && field.type === 'textarea') {
        fillPlan.push(
          fillEntry(
            field.id,
            'Built and shipped a complex initiative end-to-end with direct ownership of delivery and outcomes.'
          )
        );
        expectedStates.set(field.id, {
          kind: 'value',
          value:
            'Built and shipped a complex initiative end-to-end with direct ownership of delivery and outcomes.',
        });
        continue;
      }

      if (
        isFieldRequired(field) &&
        (field.type === 'text' || field.type === 'email' || field.type === 'tel')
      ) {
        fillPlan.push(fillEntry(field.id, 'Taylor Example'));
        expectedStates.set(field.id, {
          kind: 'value',
          value: 'Taylor Example',
        });
        continue;
      }

      if (isFieldRequired(field)) {
        throw new Error(
          `Unmapped required Ashby field: ${field.label} (${field.id})`
        );
      }

      fillPlan.push(skipEntry(field.id));
    }

    return {
      fillPlan,
      expectedStates,
    };
  }

  function buildPlan(input: {
    board: SupportedApplicationBoard;
    fields: ScrapedApplicationField[];
  }): PlannedScenario {
    if (input.board === 'greenhouse') {
      return planGreenhouse(input.fields);
    }

    if (input.board === 'lever') {
      return planLever(input.fields);
    }

    return planAshby(input.fields);
  }

  async function readObservedState(input: {
    page: Page;
    rootSelector: string;
    rootIndex: number;
    selector: string;
    expectation: ExpectedObservedState;
  }): Promise<string | boolean | null> {
    const locateVisibleCandidate = async (
      scope: Page | ReturnType<Page['locator']>
    ) => {
      const candidates = scope.locator(input.selector);
      const count = await candidates.count().catch(() => 0);

      for (let index = 0; index < count; index += 1) {
        const candidate = candidates.nth(index);
        const visible = await candidate.isVisible().catch(() => false);
        if (visible) {
          return candidate;
        }
      }

      return count > 0 ? candidates.first() : null;
    };

    const root = input.page
      .locator(input.rootSelector)
      .nth(input.rootIndex);
    const locator =
      (await locateVisibleCandidate(root)) ??
      (await locateVisibleCandidate(input.page));

    if (!locator) {
      return null;
    }

    if (input.expectation.kind === 'checked') {
      return locator.isChecked();
    }

    if (input.expectation.kind === 'file') {
      return locator.evaluate(
        (node: Element) => (node as HTMLInputElement).files?.[0]?.name ?? null
      );
    }

    return locator
      .inputValue()
      .catch(async () => (await locator.textContent())?.trim() ?? null);
  }

  for (const scenario of LIVE_BOARD_SCENARIOS) {
    test.sequential(
      `fills the live ${scenario.title} application in exact fill-plan order`,
      async () => {
        const { board, url } = scenario;
      const resume = createResumeArtifact();

      await withPage(async (page) => {
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        });

        if (board === 'ashby') {
          await page.waitForTimeout(2_500);
        }

        let boardEntry = await reachApplicationForm({
          page,
          board,
        });
        if (board === 'ashby' && boardEntry.rootSelector !== '[role="tabpanel"]') {
          boardEntry = {
            ...boardEntry,
            rootSelector: '[role="tabpanel"]',
            rootIndex: 0,
          };
        }
        const fields = await scrapeApplicationFields({
          page,
          boardEntry,
        });
        if (board === 'ashby') {
          await page.locator('[role="tabpanel"]').first().scrollIntoViewIfNeeded();
          await page.waitForTimeout(500);
          await page.evaluate(() => {
            const applicationRoot = document.querySelector('[role="tabpanel"]');
            if (!applicationRoot) {
              return;
            }

            for (const element of Array.from(
              document.querySelectorAll<HTMLElement>(
                'a, [role="link"], header, nav, [role="banner"], [role="navigation"]'
              )
            )) {
              if (!applicationRoot.contains(element)) {
                element.style.pointerEvents = 'none';
              }
            }
          });
        }
        const { fillPlan, expectedStates } = buildPlan({
          board,
          fields,
        });
        const executionResult = await executeApplicationFillPlan({
          page,
          boardEntry,
          fields,
          fillPlan,
          artifacts: {
            resume,
          } as never,
          pacing: board === 'ashby' ? STABLE_ASHBY_PACING : ZERO_PACING,
        });

        expect(
          executionResult.results.map(({ fieldId, action }) => ({
            fieldId,
            action,
          }))
        ).toEqual(
          fillPlan.map(({ fieldId, action }) => ({
            fieldId,
            action,
          }))
        );

        const requiredFieldIds = fields
          .filter((field) => isFieldRequired(field))
          .map((field) => field.id);

        const resultByFieldId = new Map(
          executionResult.results.map((result) => [result.fieldId, result])
        );
        const planByFieldId = new Map(
          fillPlan.map((entry) => [entry.fieldId, entry])
        );

        for (const fieldId of requiredFieldIds) {
          const entry = planByFieldId.get(fieldId);
          expect(entry, `Missing plan entry for required field ${fieldId}`).toBeDefined();
          expect(entry?.action, `Required field ${fieldId} was skipped`).not.toBe(
            'skip'
          );
          expect(
            resultByFieldId.get(fieldId)?.status,
            `Required field ${fieldId} did not execute successfully`
          ).toBe('success');
        }

        for (const [fieldId, expectation] of expectedStates) {
          const result = resultByFieldId.get(fieldId);
          expect(result?.status, `Field ${fieldId} did not succeed`).toBe(
            'success'
          );
          expect(result?.selector, `Field ${fieldId} did not report a selector`).toBeTruthy();

          const observed = await readObservedState({
            page,
            rootSelector: boardEntry.rootSelector,
            rootIndex: boardEntry.rootIndex,
            selector: result?.selector ?? '',
            expectation,
          });
          if (
            expectation.kind === 'value' &&
            (observed === null || observed === '')
          ) {
            continue;
          }
          expect(
            observed,
            `Observed field state for ${fieldId} diverged from the fill plan`
          ).toBe(expectation.value);
        }

        expect(executionResult.summary.failed).toBe(0);
      });
      },
      240_000
    );
  }
});

import { expect, test } from '@playwright/test';

import {
  AutopilotRunsRepository,
  createDatabaseClient,
  migrateDatabase
} from '../../../packages/db/src/index';

const playwrightDatabasePath = 'C:\\VScode\\JobAutomation\\apps\\api\\data\\playwright.sqlite';

async function seedAutopilotRuns(count: number) {
  const db = createDatabaseClient(playwrightDatabasePath);
  await migrateDatabase(db);

  const autopilotRunsRepository = new AutopilotRunsRepository(db);

  for (let index = 0; index < count; index += 1) {
    await autopilotRunsRepository.create({
      triggerKind: 'manual',
      status: index % 2 === 0 ? 'completed' : 'failed',
      currentStep: 'finished',
      eligibleJobCount: index + 1,
      submittedCount: index,
      blockedCount: 0,
      updatedAt: new Date(`2026-05-${String(22 - index).padStart(2, '0')}T12:00:00.000Z`)
    });
  }
}

async function getAutopilotRunCount(page: import('@playwright/test').Page): Promise<number> {
  const response = await page.request.get('http://127.0.0.1:3201/autopilot-runs');
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as { runs: unknown[] };
  return payload.runs.length;
}

test('autopilot batches list stays compact and swaps in place with batch detail', async ({
  page
}) => {
  await expect
    .poll(async () => {
      const response = await page.request.get('http://127.0.0.1:3201/health');
      return response.ok();
    })
    .toBe(true);

  const existingCount = await getAutopilotRunCount(page);
  await seedAutopilotRuns(7);
  const totalRuns = existingCount + 7;

  await page.goto('/autopilot');

  await expect(page.getByRole('heading', { name: 'Latest autopilot runs' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Autopilot batch detail' })).toHaveCount(0);
  await expect(page.getByText(`Showing 5 of ${totalRuns} batches.`)).toBeVisible();
  await expect(
    page.getByRole('button', { name: `Show all ${totalRuns} batches` })
  ).toBeVisible();

  await page.getByRole('link', { name: /View batch, completed/ }).first().click();

  await expect(page).toHaveURL(/\/autopilot\?runId=.+/);
  await expect(page.getByRole('heading', { name: 'Autopilot batch detail' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Latest autopilot runs' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Back to batches' })).toBeVisible();

  await page.getByRole('link', { name: 'Back to batches' }).click();

  await expect(page).toHaveURL('/autopilot');
  await expect(page.getByRole('heading', { name: 'Latest autopilot runs' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Autopilot batch detail' })).toHaveCount(0);
});

test('autopilot batches expand control reveals all rows', async ({ page }) => {
  await expect
    .poll(async () => {
      const response = await page.request.get('http://127.0.0.1:3201/health');
      return response.ok();
    })
    .toBe(true);

  const existingCount = await getAutopilotRunCount(page);
  await seedAutopilotRuns(7);
  const totalRuns = existingCount + 7;

  await page.goto('/autopilot');
  await page.getByRole('button', { name: `Show all ${totalRuns} batches` }).click();

  await expect(page.getByText(`Showing all ${totalRuns} batches.`)).toBeVisible();
  await expect(page.getByRole('link', { name: /View batch,/ })).toHaveCount(totalRuns);
});

import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import {
  ApplicationRunsRepository,
  JobsRepository,
  createDatabaseClient,
  migrateDatabase
} from '../../../packages/db/src/index';

const playwrightDatabasePath = 'C:\\VScode\\JobAutomation\\apps\\api\\data\\playwright.sqlite';

test('submitted page shows local timestamps instead of raw UTC ISO strings', async ({ page }) => {
  await expect
    .poll(async () => {
      const response = await page.request.get('http://127.0.0.1:3201/health');
      return response.ok();
    })
    .toBe(true);

  const db = createDatabaseClient(playwrightDatabasePath);
  await migrateDatabase(db);

  const jobsRepository = new JobsRepository(db);
  const applicationRunsRepository = new ApplicationRunsRepository(db);

  const job = await jobsRepository.upsert({
    sourceKind: 'greenhouse',
    sourceId: `job-${randomUUID()}`,
    sourceUrl: 'https://boards.greenhouse.io/acme/jobs/123',
    companyName: 'Acme Corp',
    title: 'Platform Engineer',
    location: 'Toronto, ON, Canada',
    remoteType: 'remote',
    employmentType: 'full-time',
    compensationText: null,
    descriptionText: 'Build reliable automation.',
    rawPayload: JSON.stringify({ id: 'job-1' }),
    discoveryRunId: null,
    status: 'applied',
    discoveredAt: new Date('2026-05-22T03:24:23.937Z'),
    updatedAt: new Date('2026-05-22T03:24:23.937Z')
  });

  await applicationRunsRepository.create({
    jobId: job.id,
    siteKey: 'greenhouse',
    status: 'completed',
    currentStep: 'submitted',
    completedAt: new Date('2026-05-22T03:24:23.937Z'),
    createdAt: new Date('2026-05-22T03:20:00.000Z'),
    updatedAt: new Date('2026-05-22T03:24:23.937Z')
  });

  await page.goto('/submitted');
  await expect(page.getByRole('heading', { name: 'Successful submissions' })).toBeVisible();
  await expect(page.getByText('Platform Engineer')).toBeVisible();

  const submittedCell = page.getByRole('cell').filter({ hasText: /May|2026|PM|AM|\d{1,2}:\d{2}/ });
  await expect(submittedCell.first()).toBeVisible();
  await expect(page.locator('time[datetime="2026-05-22T03:24:23.937Z"]')).toBeVisible();
  await expect(page.getByText('2026-05-22T03:24:23.937Z')).toHaveCount(0);
});

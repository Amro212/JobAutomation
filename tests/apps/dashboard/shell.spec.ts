import { expect, test } from '@playwright/test';

test('navigates the dashboard shell against persisted API state', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Jobs', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible();
  await expect(
    page
      .getByText('No jobs have been discovered yet.')
      .or(page.getByRole('columnheader', { name: 'Title' }))
  ).toBeVisible();

  await page.getByRole('link', { name: 'Runs', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Discovery run history' })).toBeVisible();
  await expect(
    page
      .getByText('No discovery runs have been recorded yet.')
      .or(page.getByRole('columnheader', { name: 'Source' }))
  ).toBeVisible();

  await page.getByRole('link', { name: 'Setup', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save setup' })).toBeVisible();
});

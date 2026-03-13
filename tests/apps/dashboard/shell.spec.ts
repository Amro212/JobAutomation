import { expect, test } from '@playwright/test';

test('navigates the dashboard shell against the real API empty state', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Jobs', exact: true }).click();
  await expect(page.getByText('No jobs have been discovered yet.')).toBeVisible();

  await page.getByRole('link', { name: 'Runs', exact: true }).click();
  await expect(page.getByText('No discovery runs have been recorded yet.')).toBeVisible();

  await page.getByRole('link', { name: 'Setup', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save setup' })).toBeVisible();
});

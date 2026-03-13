import { expect, test } from '@playwright/test';

test('loads the dashboard shell', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Control Panel' })).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Jobs' })).toBeVisible();
});

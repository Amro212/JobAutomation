import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

const greenhouseJobsResponse = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../fixtures/discovery/greenhouse/jobs-response.json', import.meta.url)),
    'utf8'
  )
) as {
  jobs: Array<{ title: string }>;
};

test('shows scheduled discovery controls and run detail logs', async ({ page }) => {
  const server = createServer((request, response) => {
    if (request.url === '/v1/boards/acme/jobs?content=true') {
      response.writeHead(200, {
        'content-type': 'application/json'
      });
      response.end(JSON.stringify(greenhouseJobsResponse));
      return;
    }

    response.writeHead(404, {
      'content-type': 'application/json'
    });
    response.end(JSON.stringify({ message: 'Not found' }));
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(3202, '127.0.0.1', (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  try {
    await page.goto('/jobs');
    await page.getByLabel('Board label').fill('Acme Corp');
    await page.getByLabel('Source token or URL').fill('acme');
    await page.getByRole('button', { name: 'Add source' }).click();
    await page.getByRole('button', { name: 'Run now' }).click();

    await page.goto('/runs');
    await expect(page.getByRole('heading', { name: 'Structured discovery schedule' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open run' }).first()).toBeVisible();
    await page.getByRole('link', { name: 'Open run' }).first().click();

    await expect(page).toHaveURL(/\/runs\/.+/);
    await expect(page.getByRole('heading', { name: 'greenhouse discovery run' })).toBeVisible();
    await expect(page.getByText('Queued manual discovery run.')).toBeVisible();
    await expect(page.getByText('Completed greenhouse source Acme Corp.')).toBeVisible();
    await expect(page.getByText('No fallback evidence was captured for this run.')).toBeVisible();
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});


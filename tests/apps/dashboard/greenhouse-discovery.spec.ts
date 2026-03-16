import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

const greenhouseJobsResponse = JSON.parse(
  readFileSync(new URL('../../fixtures/discovery/greenhouse/jobs-response.json', import.meta.url), 'utf8')
) as {
  jobs: Array<{ title: string }>;
};

test('creates a greenhouse source, renders discovered jobs, and opens the detail page', async ({
  page
}) => {
  const server = createServer((request, response) => {
    if (request.url === '/v1/boards/acme/jobs?content=true') {
      response.writeHead(200, {
        'content-type': 'application/json'
      });
      response.end(JSON.stringify(greenhouseJobsResponse));
      return;
    }

    response.writeHead(404);
    response.end();
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(3202, '127.0.0.1', () => resolve());
    server.on('error', reject);
  });

  try {
    await page.goto('/jobs');

    await page.getByLabel('Source type').selectOption('greenhouse');
    await page.getByLabel('Board label').fill('Acme Corp');
    await page.getByLabel('Source token or URL').fill('https://job-boards.greenhouse.io/acme');
    await page.getByRole('button', { name: 'Add source' }).click();

    await expect(page.getByRole('cell', { name: 'Acme Corp' }).first()).toBeVisible();
    await page
      .getByRole('row', { name: /Acme Corp acme Enabled Disable Run now/i })
      .getByRole('button', { name: 'Run now' })
      .click();

    await expect(page.getByRole('link', { name: 'Senior Platform Engineer' })).toBeVisible();
    await expect(page.getByText('Remote - Canada')).toBeVisible();
    await page.getByRole('link', { name: 'Senior Platform Engineer' }).click();

    await expect(page).toHaveURL(/\/jobs\/.+/);
    await expect(page.getByRole('heading', { name: 'Senior Platform Engineer' })).toBeVisible();
    await expect(page.getByText('Acme Corp')).toBeVisible();
    await expect(page.getByText('greenhouse')).toBeVisible();
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
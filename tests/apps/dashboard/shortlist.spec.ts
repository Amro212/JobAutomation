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

test('filters jobs via URL params and supports the shortlist review workflow', async ({ page }) => {
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

    await expect(page.getByRole('link', { name: 'Senior Platform Engineer' })).toBeVisible();

    await page.getByLabel('Filter source kind').selectOption('greenhouse');
    await page.getByLabel('Filter status').selectOption('discovered');
    await page.getByLabel('Filter remote type').selectOption('remote');
    await page.getByLabel('Filter title').fill('Platform');
    await page.getByLabel('Filter location').fill('Canada');
    await page.getByRole('button', { name: 'Apply filters' }).click();

    await expect(page).toHaveURL(
      /\/jobs\?sourceKind=greenhouse&status=discovered&remoteType=remote&title=Platform&location=Canada/
    );
    await expect(page.getByRole('link', { name: 'Senior Platform Engineer' })).toBeVisible();

    await page.getByRole('link', { name: 'Senior Platform Engineer' }).click();

    await expect(page.getByRole('heading', { name: 'Senior Platform Engineer' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate summary and score' })).toBeDisabled();
    await expect(page.getByText('Configure OpenRouter to enable on-demand scoring.')).toBeVisible();

    await page.getByLabel('Review notes').fill('Strong local-first fit and worth shortlisting.');
    await page.getByLabel('Review status').selectOption('reviewing');
    await page.getByRole('button', { name: 'Save review' }).click();

    await expect(page.getByText('Review saved.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Review notes')).toHaveValue(
      'Strong local-first fit and worth shortlisting.'
    );
    await expect(page.getByLabel('Review status')).toHaveValue('reviewing');

    await page.getByRole('button', { name: 'Add to shortlist' }).click();
    await expect(page.getByText('Job shortlisted.')).toBeVisible();
    await expect(page.getByLabel('Review status')).toHaveValue('shortlisted');

    await page.getByRole('link', { name: 'Shortlist', exact: true }).click();
    await expect(page).toHaveURL('/shortlist');
    await expect(page.getByRole('heading', { name: 'Shortlist' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Senior Platform Engineer' })).toBeVisible();

    await page.getByRole('link', { name: 'Senior Platform Engineer' }).click();
    await page.getByRole('button', { name: 'Remove from shortlist' }).click();
    await expect(page.getByText('Job moved back to reviewing.')).toBeVisible();

    await page.getByRole('link', { name: 'Shortlist', exact: true }).click();
    await expect(page.getByText('No shortlisted jobs yet.')).toBeVisible();
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

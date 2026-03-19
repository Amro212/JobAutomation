import { createServer } from 'node:http';

import { expect, test } from '@playwright/test';

test('creates a persisted playwright source and exposes fallback run evidence through the run detail view', async ({
  page
}) => {
  const server = createServer((request, response) => {
    const url = request.url ?? '/';

    if (url === '/jobs') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(`
        <html>
          <body>
            <main data-job-listings>
              <article data-job-card>
                <a href="/jobs/fallback-role" data-job-detail>Fallback Role</a>
              </article>
            </main>
          </body>
        </html>
      `);
      return;
    }

    if (url === '/jobs/fallback-role') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(`
        <html>
          <body>
            <article data-job-detail-page>
              <h1 data-job-title>Fallback Role</h1>
              <div data-company-name>Fallback Corp</div>
              <div data-job-location>Toronto, ON</div>
              <div data-job-id>fallback-role-001</div>
              <section data-job-description>Fallback browser discovery evidence.</section>
            </article>
          </body>
        </html>
      `);
      return;
    }

    response.writeHead(404, { 'content-type': 'text/html' });
    response.end('<html><body>Not found</body></html>');
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  try {
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Fallback source server address was not available.');
    }

    const sourceUrl = `http://127.0.0.1:${address.port}/jobs`;

    await page.goto('/jobs');
    await page.getByLabel('Source type').selectOption('playwright');
    await page.getByLabel('Board label').fill('Fallback Careers');
    await page.getByLabel('Source token or URL').fill(sourceUrl);
    await page.getByRole('button', { name: 'Add source' }).click();

    await expect(page.getByRole('cell', { name: 'playwright' })).toBeVisible();
    await page
      .locator('tr', { hasText: 'Fallback Careers' })
      .getByRole('button', { name: 'Run now' })
      .click();

    await page.goto('/runs');
    await page.getByRole('link', { name: 'Open run' }).first().click();

    await expect(page).toHaveURL(/\/runs\/.+/);
    await expect
      .poll(
        async () => {
          await page.reload();
          return await page.getByText('Completed playwright source Fallback Careers.').count();
        },
        { timeout: 15000 }
      )
      .toBe(1);

    await expect(page.getByRole('heading', { name: 'playwright discovery run' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Fallback evidence' })).toBeVisible();
    await expect(page.getByText('fallback-trace')).toBeVisible();
    await expect(page.getByText('fallback-screenshot')).toBeVisible();
    await expect(page.getByRole('cell', { name: new RegExp(sourceUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first()).toBeVisible();
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

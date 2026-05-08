import { createServer } from 'node:http';

import type { Page } from 'playwright';
import { afterEach, describe, expect, test } from 'vitest';

import { reachApplicationForm } from '../../../packages/automation/src/apply/board-entry';
import { createDiscoveryBrowser } from '../../../packages/automation/src/playwright/browser';

describe('application board entry', () => {
  let server: ReturnType<typeof createServer> | null = null;
  let baseUrl = '';

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }

    server = null;
    baseUrl = '';
  });

  async function startServer(html: string): Promise<void> {
    server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(html);
    });

    await new Promise<void>((resolve, reject) => {
      server?.listen(0, '127.0.0.1', (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        const address = server?.address();
        if (!address || typeof address === 'string') {
          reject(
            new Error('Board entry test server address was not available.')
          );
          return;
        }

        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  }

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

  test('waits long enough for a delayed Ashby application panel that is already on the application URL', async () => {
    await startServer(`
      <html>
        <body>
          <main id="mount">Loading…</main>
          <script>
            window.setTimeout(() => {
              document.querySelector('#mount').innerHTML =
                '<section role="tabpanel" aria-label="Application">' +
                '<input id="candidate_name" name="candidate_name" />' +
                '<input id="candidate_email" name="candidate_email" />' +
                '</section>';
            }, 1000);
          </script>
        </body>
      </html>
    `);

    const result = await withPage(async (page) => {
      await page.goto(`${baseUrl}/application`, {
        waitUntil: 'domcontentloaded',
      });

      return reachApplicationForm({
        page,
        board: 'ashby',
      });
    });

    expect(result).toEqual(
      expect.objectContaining({
        board: 'ashby',
        entryAction: 'direct_form',
        rootSelector: '[role="tabpanel"]',
        readyFieldCount: 2,
      })
    );
  });
});

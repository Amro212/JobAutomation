import { createServer } from 'node:http';

import type { Page } from 'playwright';
import { afterEach, describe, expect, test } from 'vitest';

import { submitApplicationAndConfirm } from '../../../packages/automation/src/apply/submit-application';
import { createDiscoveryBrowser } from '../../../packages/automation/src/playwright/browser';

describe('submit application confirmation', () => {
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

  async function startServer(
    handler: (url: string) => { status?: number; html: string }
  ): Promise<void> {
    server = createServer((request, response) => {
      const result = handler(request.url ?? '/');
      response.writeHead(result.status ?? 200, { 'content-type': 'text/html' });
      response.end(result.html);
    });

    await new Promise<void>((resolve, reject) => {
      server?.listen(0, '127.0.0.1', (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        const address = server?.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Test server address was not available.'));
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

  test('detects a delayed Greenhouse confirmation banner that appears 2 seconds after submit', async () => {
    await startServer(() => ({
      html: `
        <html>
          <body>
            <form id="application_form">
              <input type="text" name="name" />
              <button type="submit">Submit application</button>
            </form>
            <div id="confirmation" style="display:none;">Application submitted.</div>
            <script>
              document.getElementById('application_form').addEventListener('submit', (event) => {
                event.preventDefault();
                window.setTimeout(() => {
                  document.getElementById('confirmation').style.display = 'block';
                }, 2000);
              });
            </script>
          </body>
        </html>
      `
    }));

    const result = await withPage(async (page) => {
      await page.goto(`${baseUrl}/job/1`, { waitUntil: 'domcontentloaded' });

      return submitApplicationAndConfirm({
        page,
        board: 'greenhouse'
      });
    });

    expect(result.status).toBe('submitted');
    if (result.status === 'submitted') {
      expect(result.confirmationSignal).toMatch(/text:/);
    }
  });

  test('detects success via URL change when no banner text appears', async () => {
    await startServer((url) => {
      if (url.startsWith('/confirmation')) {
        return {
          html: `
            <html>
              <body>
                <p>Submission acknowledged.</p>
              </body>
            </html>
          `
        };
      }

      return {
        html: `
          <html>
            <body>
              <form id="application_form" action="/confirmation" method="GET">
                <input type="text" name="name" />
                <button type="submit">Submit application</button>
              </form>
            </body>
          </html>
        `
      };
    });

    const result = await withPage(async (page) => {
      await page.goto(`${baseUrl}/job/1`, { waitUntil: 'domcontentloaded' });

      return submitApplicationAndConfirm({
        page,
        board: 'greenhouse'
      });
    });

    expect(result.status).toBe('submitted');
    if (result.status === 'submitted') {
      expect(result.confirmationSignal).toMatch(/url:/);
    }
  });

  test('returns submission_confirmation_missing when no success signal appears within timeout', async () => {
    await startServer(() => ({
      html: `
        <html>
          <body>
            <form id="application_form">
              <input type="text" name="name" />
              <button type="submit">Submit application</button>
            </form>
            <script>
              document.getElementById('application_form').addEventListener('submit', (event) => {
                event.preventDefault();
              });
            </script>
          </body>
        </html>
      `
    }));

    const result = await withPage(async (page) => {
      await page.goto(`${baseUrl}/job/1`, { waitUntil: 'domcontentloaded' });

      return submitApplicationAndConfirm({
        page,
        board: 'greenhouse',
        confirmationTimeoutMs: 1_500
      });
    });

    expect(result.status).toBe('submission_confirmation_missing');
  });
});

import { createServer } from 'node:http';

import type { Page } from 'playwright';
import { afterEach, describe, expect, test } from 'vitest';

import {
  ApplicationLinkExpiredError,
  reachApplicationForm
} from '../../../packages/automation/src/apply/board-entry';
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

  test('throws ApplicationLinkExpiredError when a Greenhouse page shows an expired-listing message', async () => {
    await startServer(`
      <html>
        <body>
          <main>
            <h1>Sorry, this position has been closed.</h1>
            <p>We are no longer accepting applications for this role.</p>
            <form id="search-form">
              <input type="search" name="q" placeholder="Search jobs" />
              <button type="submit">Search</button>
            </form>
          </main>
        </body>
      </html>
    `);

    await expect(
      withPage(async (page) => {
        await page.goto(`${baseUrl}/jobs/expired`, {
          waitUntil: 'domcontentloaded'
        });

        return reachApplicationForm({
          page,
          board: 'greenhouse'
        });
      })
    ).rejects.toBeInstanceOf(ApplicationLinkExpiredError);
  });

  test('does not treat an open-role explanation as an expired Greenhouse posting', async () => {
    await startServer(`
      <html>
        <body>
          <main>
            <h1>Apply for this job</h1>
            <p><strong>Why This Role Is Open</strong></p>
            <p>This position is open as part of our ongoing business needs.</p>
            <form id="application">
              <label>First Name* <input name="first_name" required /></label>
              <label>Last Name* <input name="last_name" required /></label>
              <button type="submit">Submit application</button>
            </form>
          </main>
        </body>
      </html>
    `);

    const result = await withPage(async (page) => {
      await page.goto(`${baseUrl}/jobs/open`, {
        waitUntil: 'domcontentloaded'
      });

      return reachApplicationForm({
        page,
        board: 'greenhouse'
      });
    });

    expect(result).toEqual(
      expect.objectContaining({
        board: 'greenhouse',
        entryAction: 'direct_form',
        readyFieldCount: 2
      })
    );
  });

  test('clicks a company-hosted Greenhouse apply link before failing direct-form detection', async () => {
    server = createServer((request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' });
      if (request.url === '/apply') {
        response.end(`
          <html>
            <body>
              <main>
                <form id="application">
                  <label>First Name* <input name="first_name" required /></label>
                  <label>Last Name* <input name="last_name" required /></label>
                  <button type="submit">Submit application</button>
                </form>
              </main>
            </body>
          </html>
        `);
        return;
      }

      response.end(`
        <html>
          <body>
            <main>
              <h1>Software Engineer</h1>
              <a href="/apply">Apply for this role</a>
            </main>
          </body>
        </html>
      `);
    });

    await new Promise<void>((resolve, reject) => {
      server?.listen(0, '127.0.0.1', (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        const address = server?.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Board entry test server address was not available.'));
          return;
        }

        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    const result = await withPage(async (page) => {
      await page.goto(`${baseUrl}/jobs/1`, {
        waitUntil: 'domcontentloaded'
      });

      return reachApplicationForm({
        page,
        board: 'greenhouse'
      });
    });

    expect(result).toEqual(
      expect.objectContaining({
        board: 'greenhouse',
        entryAction: 'clicked_apply_button',
        finalUrl: `${baseUrl}/apply`,
        readyFieldCount: 2
      })
    );
  });

  test('uses a visible company-hosted Greenhouse iframe as an embedded form', async () => {
    await startServer(`
      <html>
        <body>
          <main>
            <h1>Software Engineer</h1>
            <iframe
              title="Application"
              src="https://job-boards.greenhouse.io/embed/job_app?for=example&token=12345"
              style="display:block;width:800px;height:600px;"
            ></iframe>
          </main>
        </body>
      </html>
    `);

    const result = await withPage(async (page) => {
      await page.route('https://job-boards.greenhouse.io/embed/job_app**', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: `
            <html>
              <body>
                <form id="application">
                  <label>First Name* <input name="first_name" required /></label>
                  <label>Last Name* <input name="last_name" required /></label>
                  <button type="submit">Submit application</button>
                </form>
              </body>
            </html>
          `
        })
      );
      await page.goto(`${baseUrl}/jobs/iframe`, {
        waitUntil: 'domcontentloaded'
      });

      return reachApplicationForm({
        page,
        board: 'greenhouse'
      });
    });

    expect(result).toEqual(
      expect.objectContaining({
        board: 'greenhouse',
        entryAction: 'embedded_form',
        finalUrl: 'https://job-boards.greenhouse.io/embed/job_app?for=example&token=12345',
        readyFieldCount: 2
      })
    );
  });

  test('throws ApplicationLinkExpiredError when a Lever page shows a closed-posting message', async () => {
    await startServer(`
      <html>
        <body>
          <main>
            <h1>Posting</h1>
            <p>The job you are looking for is no longer available.</p>
          </main>
        </body>
      </html>
    `);

    await expect(
      withPage(async (page) => {
        await page.goto(`${baseUrl}/spotify/closed`, {
          waitUntil: 'domcontentloaded'
        });

        return reachApplicationForm({
          page,
          board: 'lever'
        });
      })
    ).rejects.toBeInstanceOf(ApplicationLinkExpiredError);
  });
});

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

  async function startServer(
    routes: Record<string, string>
  ): Promise<void> {
    server = createServer((request, response) => {
      const html = routes[request.url ?? '/'];
      if (!html) {
        response.writeHead(404, { 'content-type': 'text/html' });
        response.end('<html><body>Not found</body></html>');
        return;
      }

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
          reject(new Error('Board entry test server address was not available.'));
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

  test('confirms a direct Greenhouse application form is ready without an entry click', async () => {
    await startServer({
      '/greenhouse': `
        <html>
          <body>
            <main>
              <section id="application">
                <label for="first_name">First Name</label>
                <input id="first_name" required />
                <label for="email">Email</label>
                <input id="email" type="email" required />
                <label for="resume">Resume</label>
                <input id="resume" type="file" />
              </section>
            </main>
          </body>
        </html>
      `
    });

    const result = await withPage(async (page) => {
      await page.goto(`${baseUrl}/greenhouse`, { waitUntil: 'domcontentloaded' });
      return reachApplicationForm({ page, board: 'greenhouse' });
    });

    expect(result).toMatchObject({
      board: 'greenhouse',
      entryAction: 'direct_form',
      finalUrl: `${baseUrl}/greenhouse`
    });
    expect(result.readyFieldCount).toBeGreaterThanOrEqual(2);
  });

  test('clicks the Lever apply button before validating the real application form', async () => {
    await startServer({
      '/lever': `
        <html>
          <body>
            <main>
              <button id="apply_button" type="button">Apply for this job</button>
              <section id="application_shell" hidden>
                <form data-qa="application-form">
                  <label for="name">Name</label>
                  <input id="name" required />
                  <label for="email">Email</label>
                  <input id="email" type="email" required />
                  <label for="phone">Phone</label>
                  <input id="phone" />
                </form>
              </section>
              <script>
                document.getElementById('apply_button').addEventListener('click', () => {
                  document.getElementById('application_shell').hidden = false;
                });
              </script>
            </main>
          </body>
        </html>
      `
    });

    const result = await withPage(async (page) => {
      await page.goto(`${baseUrl}/lever`, { waitUntil: 'domcontentloaded' });
      return reachApplicationForm({ page, board: 'lever' });
    });

    expect(result).toMatchObject({
      board: 'lever',
      entryAction: 'clicked_apply_button',
      finalUrl: `${baseUrl}/lever`
    });
    expect(result.readyFieldCount).toBeGreaterThanOrEqual(2);
  });

  test('selects the Ashby application tab before validating the real application form', async () => {
    await startServer({
      '/ashby': `
        <html>
          <body>
            <main>
              <div role="tablist" aria-label="Job sections">
                <button role="tab" aria-selected="true">Overview</button>
                <button id="application_tab" role="tab" aria-selected="false">Application</button>
              </div>
              <section id="overview_panel">
                <p>Job overview content only.</p>
              </section>
              <section id="application_panel" role="tabpanel" hidden>
                <form>
                  <label for="first_name">First Name</label>
                  <input id="first_name" required />
                  <label for="last_name">Last Name</label>
                  <input id="last_name" required />
                  <label for="email">Email</label>
                  <input id="email" type="email" required />
                </form>
              </section>
              <script>
                document.getElementById('application_tab').addEventListener('click', () => {
                  document.getElementById('application_panel').hidden = false;
                });
              </script>
            </main>
          </body>
        </html>
      `
    });

    const result = await withPage(async (page) => {
      await page.goto(`${baseUrl}/ashby`, { waitUntil: 'domcontentloaded' });
      return reachApplicationForm({ page, board: 'ashby' });
    });

    expect(result).toMatchObject({
      board: 'ashby',
      entryAction: 'clicked_application_tab',
      finalUrl: `${baseUrl}/ashby`
    });
    expect(result.readyFieldCount).toBeGreaterThanOrEqual(2);
  });

  test('rejects Greenhouse pages that never expose a direct application form', async () => {
    await startServer({
      '/greenhouse-missing-form': `
        <html>
          <body>
            <main>
              <article>
                <h1>Senior Platform Engineer</h1>
                <p>This page only contains a job description.</p>
              </article>
            </main>
          </body>
        </html>
      `
    });

    await expect(
      withPage(async (page) => {
        await page.goto(`${baseUrl}/greenhouse-missing-form`, { waitUntil: 'domcontentloaded' });
        return reachApplicationForm({ page, board: 'greenhouse' });
      })
    ).rejects.toThrow('Greenhouse application form was not directly available');
  });
});

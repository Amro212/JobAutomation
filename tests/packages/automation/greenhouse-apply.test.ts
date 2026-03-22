import { createServer } from 'node:http';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  runGreenhouseApply,
  type GreenhouseApplyHelpers
} from '../../../packages/automation/src/apply/sites/greenhouse-apply';
import { createDiscoveryBrowser } from '../../../packages/automation/src/playwright/browser';
import type {
  ApplyFieldStep,
  ApplyStopBeforeSubmitStep,
  ApplyUploadStep
} from '../../../packages/automation/src/apply/sites/shared/form-step';

function createTestDirectory(prefix: string): string {
  const path = fileURLToPath(new URL(`../../../data/test/${prefix}-${randomUUID()}`, import.meta.url));
  mkdirSync(path, { recursive: true });
  return path;
}

describe('greenhouse apply site flow', () => {
  const tempDir = createTestDirectory('greenhouse-apply');
  const resumePath = join(tempDir, 'resume.pdf');

  let server: ReturnType<typeof createServer> | null = null;
  let baseUrl = '';
  let currentUrl = '';

  beforeEach(async () => {
    writeFileSync(resumePath, Buffer.from('%PDF-1.4\n% greenhouse apply test resume\n'));

    server = createServer((request, response) => {
      const url = request.url ?? '/';

      if (url === '/jobs/senior-platform-engineer') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end(`
          <html>
            <body>
              <main data-greenhouse-job-page>
                <h1>Senior Platform Engineer</h1>
                <a id="apply_button" href="/jobs/senior-platform-engineer/apply">Apply now</a>
              </main>
            </body>
          </html>
        `);
        return;
      }

      if (url === '/jobs/senior-platform-engineer/apply') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end(`
          <html>
            <body>
              <main data-greenhouse-application-page>
                <form id="application_form">
                  <label>
                    First name
                    <input id="first_name" name="job_application[first_name]" />
                  </label>
                  <label>
                    Last name
                    <input id="last_name" name="job_application[last_name]" />
                  </label>
                  <label>
                    Email
                    <input id="email" name="job_application[email]" />
                  </label>
                  <label>
                    Phone
                    <input id="phone" name="job_application[phone]" />
                  </label>
                  <label>
                    Resume
                    <input id="resume" type="file" name="job_application[resume]" />
                  </label>
                  <button id="continue_to_review" type="submit">Continue to review</button>
                </form>
                <script>
                  document.getElementById('application_form').addEventListener('submit', (event) => {
                    event.preventDefault();
                    window.location.href = '/jobs/senior-platform-engineer/review';
                  });
                </script>
              </main>
            </body>
          </html>
        `);
        return;
      }

      if (url === '/jobs/senior-platform-engineer/review') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end(`
          <html>
            <body>
              <main data-greenhouse-review-page>
                <h2>Review your application</h2>
                <p data-final-review-ready>Everything is ready for manual review.</p>
                <button id="submit_application" type="submit">Submit application</button>
                <script>
                  window.__finalSubmitClicks = 0;
                  document.getElementById('submit_application').addEventListener('click', (event) => {
                    event.preventDefault();
                    window.__finalSubmitClicks += 1;
                    document.body.setAttribute('data-submitted', 'true');
                  });
                </script>
              </main>
            </body>
          </html>
        `);
        return;
      }

      response.writeHead(404, { 'content-type': 'text/html' });
      response.end('<html><body>Not found</body></html>');
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
  });

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
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('reaches final review through explicit selectors and stops before the final submit action', async () => {
    const browser = await createDiscoveryBrowser();
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`${baseUrl}/jobs/senior-platform-engineer`, {
      waitUntil: 'domcontentloaded'
    });

    const callLog: string[] = [];

    const mapField = vi.fn(async (step: ApplyFieldStep) => {
      callLog.push(`field:${step.name}`);
      await page.locator(step.selector).fill(step.value);
    });

    const uploadFile = vi.fn(async (step: ApplyUploadStep) => {
      callLog.push(`upload:${step.name}`);
      await page.locator(step.selector).setInputFiles(step.filePath);
    });

    const stopBeforeSubmit = vi.fn(async (step: ApplyStopBeforeSubmitStep) => {
      callLog.push(`stop:${step.name}`);
      currentUrl = page.url();
    });

    const helpers: GreenhouseApplyHelpers = {
      mapField,
      uploadFile,
      stopBeforeSubmit
    };

    const result = await runGreenhouseApply({
      page,
      sourceUrl: `${baseUrl}/jobs/senior-platform-engineer`,
      applicant: {
        firstName: 'Casey',
        lastName: 'Ng',
        email: 'casey@example.com',
        phone: '+1 555 010 0101',
        resumePath
      },
      helpers
    });

    expect(result).toMatchObject({
      sourceUrl: `${baseUrl}/jobs/senior-platform-engineer`,
      applicationUrl: `${baseUrl}/jobs/senior-platform-engineer/apply`,
      finalReviewUrl: `${baseUrl}/jobs/senior-platform-engineer/review`,
      stoppedBeforeSubmit: true
    });

    expect(callLog).toEqual([
      'field:first_name',
      'field:last_name',
      'field:email',
      'field:phone',
      'upload:resume',
      'stop:final_review'
    ]);
    expect(mapField).toHaveBeenCalledTimes(4);
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(stopBeforeSubmit).toHaveBeenCalledTimes(1);
    expect(mapField.mock.calls.map(([step]) => step.value)).toEqual([
      'Casey',
      'Ng',
      'casey@example.com',
      '+1 555 010 0101'
    ]);
    expect(uploadFile.mock.calls[0]?.[0]).toMatchObject({
      name: 'resume',
      selector: 'input#resume',
      filePath: resumePath
    });
    expect(await page.evaluate(() => (window as Window & { __finalSubmitClicks?: number }).__finalSubmitClicks ?? 0)).toBe(0);
    expect(await page.locator('[data-final-review-ready]').count()).toBe(1);
    expect(await page.locator('[data-final-review-ready]').textContent()).toContain('manual review');
    expect(page.url()).toBe(`${baseUrl}/jobs/senior-platform-engineer/review`);
    expect(currentUrl).toBe(`${baseUrl}/jobs/senior-platform-engineer/review`);
    await context.close();
    await browser.close();
  }, 30000);
});

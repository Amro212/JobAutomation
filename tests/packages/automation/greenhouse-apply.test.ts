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
  const coverLetterPath = join(tempDir, 'cover-letter.pdf');

  let server: ReturnType<typeof createServer> | null = null;
  let baseUrl = '';
  let currentUrl = '';

  beforeEach(async () => {
    writeFileSync(resumePath, Buffer.from('%PDF-1.4\n% greenhouse apply test resume\n'));
    writeFileSync(coverLetterPath, Buffer.from('%PDF-1.4\n% greenhouse apply test cover letter\n'));
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

  test('fills a hosted inline Greenhouse form and stops before submit on the same page', async () => {
    server = createServer((request, response) => {
      const url = request.url ?? '/';

      if (url === '/jobs/senior-platform-engineer') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end(`
          <html>
            <body>
              <main data-greenhouse-hosted-page>
                <h1>Senior Platform Engineer</h1>
                <button id="apply_trigger" type="button">Apply</button>
                <form id="application_form" hidden>
                  <label for="first_name">First Name*</label>
                  <input id="first_name" required />

                  <label for="last_name">Last Name*</label>
                  <input id="last_name" required />

                  <label for="email">Email*</label>
                  <input id="email" required />

                  <label for="country">Country*</label>
                  <input id="country" role="combobox" aria-required="true" />

                  <label for="phone">Phone*</label>
                  <input id="phone" type="tel" required />

                  <label for="resume">Resume</label>
                  <input id="resume" type="file" />

                  <label for="cover_letter">Cover Letter</label>
                  <input id="cover_letter" type="file" />

                  <label for="linkedin_url">LinkedIn Profile</label>
                  <input id="linkedin_url" />

                  <label for="website_url">Website</label>
                  <input id="website_url" />

                  <button id="submit_application" type="submit">Submit application</button>
                </form>
                <script>
                  window.__finalSubmitClicks = 0;
                  document.getElementById('apply_trigger').addEventListener('click', () => {
                    const form = document.getElementById('application_form');
                    form.hidden = false;
                    document.getElementById('first_name').focus();
                  });
                  document.getElementById('application_form').addEventListener('submit', (event) => {
                    event.preventDefault();
                    window.__finalSubmitClicks += 1;
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

    const captureScreenshot = vi.fn(async ({ step }: { step: string }) => {
      callLog.push(`screenshot:${step}`);
    });

    const logRequiredField = vi.fn(async ({ label, classification }: { label: string; classification: string }) => {
      callLog.push(`required:${classification}:${label}`);
    });

    const stopBeforeSubmit = vi.fn(async (step: ApplyStopBeforeSubmitStep & { details?: Record<string, unknown> }) => {
      callLog.push(`stop:${step.name}`);
      currentUrl = page.url();
    });

    const helpers: GreenhouseApplyHelpers = {
      mapField,
      uploadFile,
      captureScreenshot,
      logRequiredField,
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
        country: 'Canada',
        linkedinUrl: 'https://www.linkedin.com/in/casey-ng',
        websiteUrl: 'https://example.com',
        resumePath,
        coverLetterPath
      },
      helpers
    });

    expect(result).toMatchObject({
      sourceUrl: `${baseUrl}/jobs/senior-platform-engineer`,
      applicationUrl: `${baseUrl}/jobs/senior-platform-engineer`,
      finalReviewUrl: `${baseUrl}/jobs/senior-platform-engineer`,
      pageMode: 'hosted-inline',
      stoppedBeforeSubmit: true
    });

    expect(callLog).toEqual([
      'screenshot:form_revealed',
      'field:first_name',
      'field:last_name',
      'field:email',
      'field:country',
      'field:phone',
      'field:linkedin_profile',
      'field:website',
      'screenshot:core_fields_filled',
      'upload:resume',
      'upload:cover_letter',
      'screenshot:documents_uploaded',
      'required:filled:First Name',
      'required:filled:Last Name',
      'required:filled:Email',
      'required:filled:Country',
      'required:filled:Phone',
      'stop:final_review'
    ]);

    expect(stopBeforeSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'final_review',
        selector: '#submit_application',
        details: expect.objectContaining({
          pageMode: 'hosted-inline',
          blockedRequiredFields: [],
          reviewUrlSessionNote: expect.any(String)
        })
      })
    );
    expect(await page.evaluate(() => (window as Window & { __finalSubmitClicks?: number }).__finalSubmitClicks ?? 0)).toBe(0);
    expect(page.url()).toBe(`${baseUrl}/jobs/senior-platform-engineer`);
    expect(currentUrl).toBe(`${baseUrl}/jobs/senior-platform-engineer`);
    await context.close();
    await browser.close();
  }, 30000);

  test('pauses for manual review when required employer-specific Greenhouse questions remain unresolved', async () => {
    server = createServer((request, response) => {
      const url = request.url ?? '/';

      if (url === '/jobs/associate-software-engineer') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end(`
          <html>
            <body>
              <main data-greenhouse-hosted-page>
                <h1>Associate Software Engineer</h1>
                <button id="apply_trigger" type="button">Apply</button>
                <form id="application_form" hidden>
                  <label for="first_name">First Name*</label>
                  <input id="first_name" required />

                  <label for="last_name">Last Name*</label>
                  <input id="last_name" required />

                  <label for="email">Email*</label>
                  <input id="email" required />

                  <label for="country">Country*</label>
                  <input id="country" role="combobox" aria-required="true" />

                  <label for="phone">Phone*</label>
                  <input id="phone" type="tel" required />

                  <label for="resume">Resume</label>
                  <input id="resume" type="file" />

                  <label for="question_visa">Will you require sponsorship from Example for employment now or in the future?*</label>
                  <input id="question_visa" role="combobox" aria-required="true" />

                  <button id="submit_application" type="submit">Submit application</button>
                </form>
                <script>
                  document.getElementById('apply_trigger').addEventListener('click', () => {
                    const form = document.getElementById('application_form');
                    form.hidden = false;
                    document.getElementById('first_name').focus();
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

    const browser = await createDiscoveryBrowser();
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`${baseUrl}/jobs/associate-software-engineer`, {
      waitUntil: 'domcontentloaded'
    });

    const logRequiredField = vi.fn();
    const stopBeforeSubmit = vi.fn(async (_step: ApplyStopBeforeSubmitStep & { details?: Record<string, unknown> }) => {
      currentUrl = page.url();
    });

    await runGreenhouseApply({
      page,
      sourceUrl: `${baseUrl}/jobs/associate-software-engineer`,
      applicant: {
        firstName: 'Casey',
        lastName: 'Ng',
        email: 'casey@example.com',
        phone: '+1 555 010 0101',
        country: 'Canada',
        resumePath
      },
      helpers: {
        mapField: async (step) => {
          await page.locator(step.selector).fill(step.value);
        },
        uploadFile: async (step) => {
          await page.locator(step.selector).setInputFiles(step.filePath);
        },
        logRequiredField,
        stopBeforeSubmit
      }
    });

    expect(logRequiredField).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Will you require sponsorship from Example for employment now or in the future?',
        classification: 'blocked_missing_profile_data',
        filled: false
      })
    );
    expect(stopBeforeSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'manual_review_required_questions',
        details: expect.objectContaining({
          pageMode: 'hosted-inline',
          reviewUrlSessionNote: expect.any(String),
          blockedRequiredFields: [
            expect.objectContaining({
              label: 'Will you require sponsorship from Example for employment now or in the future?',
              classification: 'blocked_missing_profile_data'
            })
          ]
        })
      })
    );
    expect(currentUrl).toBe(`${baseUrl}/jobs/associate-software-engineer`);

    await context.close();
    await browser.close();
  }, 30000);
});

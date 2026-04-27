import { createServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Page } from 'playwright';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { ApplicationBoardEntryResult } from '../../../packages/automation/src/apply/board-entry';
import { executeApplicationFillPlan } from '../../../packages/automation/src/apply/fill-plan-executor';
import type { ScrapedApplicationField } from '../../../packages/automation/src/apply/form-scraper';
import type { ApplicationFillPlanEntry } from '../../../packages/automation/src/apply/openrouter-answer-module';
import { createDiscoveryBrowser } from '../../../packages/automation/src/playwright/browser';

describe('application fill plan executor', () => {
  let server: ReturnType<typeof createServer> | null = null;
  let baseUrl = '';
  const tempDirs: string[] = [];

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

    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
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
            new Error(
              'Fill plan executor test server address was not available.'
            )
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

  function boardEntry(
    board: ApplicationBoardEntryResult['board'] = 'greenhouse'
  ): ApplicationBoardEntryResult {
    return {
      board,
      entryAction: 'direct_form',
      startUrl: `${baseUrl}/`,
      finalUrl: `${baseUrl}/`,
      readyFieldCount: 4,
      rootSelector: '#application',
      rootIndex: 0,
    };
  }

  test('fills text-like and rich text fields from the fill plan', async () => {
    await startServer(`
      <html>
        <body>
          <section id="application">
            <input id="first_name" name="first_name" />
            <input id="email" name="email" type="email" />
            <textarea id="summary" name="summary"></textarea>
            <div id="cover_letter" role="textbox" contenteditable="true"></div>
          </section>
        </body>
      </html>
    `);

    const result = await withPage(async (page) => {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

      const fields: ScrapedApplicationField[] = [
        {
          id: 'first_name',
          label: 'First Name',
          type: 'text',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#missing_first_name', '#first_name'],
          options: [],
        },
        {
          id: 'email',
          label: 'Email',
          type: 'email',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#email'],
          options: [],
        },
        {
          id: 'summary',
          label: 'Summary',
          type: 'textarea',
          required: false,
          visible: true,
          enabled: true,
          selectorCandidates: ['#summary'],
          options: [],
        },
        {
          id: 'cover_letter',
          label: 'Cover Letter',
          type: 'rich_text',
          required: false,
          visible: true,
          enabled: true,
          selectorCandidates: ['#cover_letter'],
          options: [],
          specialHandling: 'rich_text',
        },
      ];
      const fillPlan: ApplicationFillPlanEntry[] = [
        {
          fieldId: 'first_name',
          action: 'fill',
          value: 'Taylor',
          confidence: 1,
          skipReason: '',
        },
        {
          fieldId: 'email',
          action: 'fill',
          value: 'taylor@example.com',
          confidence: 1,
          skipReason: '',
        },
        {
          fieldId: 'summary',
          action: 'fill',
          value: 'Browser automation engineer',
          confidence: 0.9,
          skipReason: '',
        },
        {
          fieldId: 'cover_letter',
          action: 'fill',
          value: 'I build reliable internal tools.',
          confidence: 0.9,
          skipReason: '',
        },
      ];

      const executionResult = await executeApplicationFillPlan({
        page,
        boardEntry: boardEntry(),
        fields,
        fillPlan,
      });

      return {
        executionResult,
        firstName: await page.locator('#first_name').inputValue(),
        email: await page.locator('#email').inputValue(),
        summary: await page.locator('#summary').inputValue(),
        coverLetter: await page.locator('#cover_letter').textContent(),
      };
    });

    expect(result.firstName).toBe('Taylor');
    expect(result.email).toBe('taylor@example.com');
    expect(result.summary).toBe('Browser automation engineer');
    expect(result.coverLetter).toBe('I build reliable internal tools.');
    expect(result.executionResult.summary).toEqual({
      total: 4,
      success: 4,
      skipped: 0,
      failed: 0,
    });
    expect(result.executionResult.results).toEqual([
      expect.objectContaining({
        fieldId: 'first_name',
        status: 'success',
        selector: '#first_name',
      }),
      expect.objectContaining({
        fieldId: 'email',
        status: 'success',
        selector: '#email',
      }),
      expect.objectContaining({
        fieldId: 'summary',
        status: 'success',
        selector: '#summary',
      }),
      expect.objectContaining({
        fieldId: 'cover_letter',
        status: 'success',
        selector: '#cover_letter',
      }),
    ]);
  });

  test('selects native dropdown values from the fill plan', async () => {
    await startServer(`
      <html>
        <body>
          <section id="application">
            <select id="country" name="country">
              <option value="">Select a country</option>
              <option value="ca">Canada</option>
              <option value="us">United States</option>
            </select>
          </section>
        </body>
      </html>
    `);

    const result = await withPage(async (page) => {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

      const fields: ScrapedApplicationField[] = [
        {
          id: 'country',
          label: 'Country',
          type: 'select',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#country'],
          options: [
            { value: '', label: 'Select a country' },
            { value: 'ca', label: 'Canada' },
            { value: 'us', label: 'United States' },
          ],
        },
      ];
      const fillPlan: ApplicationFillPlanEntry[] = [
        {
          fieldId: 'country',
          action: 'select',
          value: 'ca',
          confidence: 0.95,
          skipReason: '',
        },
      ];

      const executionResult = await executeApplicationFillPlan({
        page,
        boardEntry: boardEntry(),
        fields,
        fillPlan,
      });

      return {
        executionResult,
        country: await page.locator('#country').inputValue(),
      };
    });

    expect(result.country).toBe('ca');
    expect(result.executionResult.summary).toEqual({
      total: 1,
      success: 1,
      skipped: 0,
      failed: 0,
    });
    expect(result.executionResult.results[0]).toEqual(
      expect.objectContaining({
        fieldId: 'country',
        action: 'select',
        status: 'success',
        selector: '#country',
      })
    );
  });

  test('selects custom combobox options from the visible listbox', async () => {
    await startServer(`
      <html>
        <body>
          <section id="application">
            <input
              id="office"
              name="office"
              role="combobox"
              aria-controls="office-options"
              aria-expanded="false"
              autocomplete="off"
            />
            <div id="office-options" role="listbox" hidden>
              <button type="button" role="option">Yes</button>
              <button type="button" role="option">No</button>
            </div>
            <script>
              const office = document.querySelector('#office');
              const options = document.querySelector('#office-options');
              function showOptions() {
                options.hidden = false;
                office.setAttribute('aria-expanded', 'true');
              }
              office.addEventListener('focus', showOptions);
              office.addEventListener('input', showOptions);
              for (const option of options.querySelectorAll('[role="option"]')) {
                option.addEventListener('click', () => {
                  office.value = option.textContent.trim();
                  office.dataset.selected = option.textContent.trim();
                  options.hidden = true;
                  office.setAttribute('aria-expanded', 'false');
                });
              }
            </script>
          </section>
        </body>
      </html>
    `);

    const result = await withPage(async (page) => {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

      const fields: ScrapedApplicationField[] = [
        {
          id: 'office',
          label: 'Are you open to doing 4 days a week in the office?',
          type: 'combobox',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#office'],
          options: [],
        },
      ];
      const fillPlan: ApplicationFillPlanEntry[] = [
        {
          fieldId: 'office',
          action: 'fill',
          value: 'Yes',
          confidence: 1,
          skipReason: '',
        },
      ];

      const executionResult = await executeApplicationFillPlan({
        page,
        boardEntry: boardEntry(),
        fields,
        fillPlan,
      });

      return {
        executionResult,
        selected: await page.locator('#office').getAttribute('data-selected'),
        value: await page.locator('#office').inputValue(),
      };
    });

    expect(result.selected).toBe('Yes');
    expect(result.value).toBe('Yes');
    expect(result.executionResult.summary).toEqual({
      total: 1,
      success: 1,
      skipped: 0,
      failed: 0,
    });
    expect(result.executionResult.results[0]).toEqual(
      expect.objectContaining({
        fieldId: 'office',
        action: 'fill',
        status: 'success',
        selector: '#office',
        message: 'Selected combobox option.',
      })
    );
  });

  test('commits Ashby location combobox with Enter after suggestions load', async () => {
    await startServer(`
      <html>
        <body>
          <section id="application">
            <label for="work_location">Which city and country do you intend to work from?</label>
            <input
              id="work_location"
              role="combobox"
              aria-controls="location-options"
              aria-expanded="false"
              autocomplete="off"
            />
            <div id="location-options" role="listbox" hidden>
              <div role="option" id="toronto">Toronto, Ontario, Canada</div>
            </div>
            <script>
              document.body.dataset.locationOptionPointerClicks = '0';
              const input = document.querySelector('#work_location');
              const options = document.querySelector('#location-options');
              function showOptions() {
                options.hidden = false;
                input.setAttribute('aria-expanded', 'true');
              }
              function selectFirst() {
                input.value = 'Toronto, Ontario, Canada';
                input.dataset.selected = 'Toronto, Ontario, Canada';
                options.hidden = true;
                input.setAttribute('aria-expanded', 'false');
              }
              input.addEventListener('input', () => setTimeout(showOptions, 100));
              input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && !options.hidden) {
                  event.preventDefault();
                  selectFirst();
                }
              });
              document.querySelector('#toronto').addEventListener('click', () => {
                const current = Number(document.body.dataset.locationOptionPointerClicks ?? '0');
                document.body.dataset.locationOptionPointerClicks = String(current + 1);
                selectFirst();
              });
            </script>
          </section>
        </body>
      </html>
    `);

    const result = await withPage(async (page) => {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

      const fields: ScrapedApplicationField[] = [
        {
          id: 'which_city_and_country_do_you_intend_to_work_from_',
          label: 'Which city and country do you intend to work from?',
          type: 'combobox',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#work_location'],
          options: [],
        },
      ];
      const fillPlan: ApplicationFillPlanEntry[] = [
        {
          fieldId: 'which_city_and_country_do_you_intend_to_work_from_',
          action: 'fill',
          value: 'Toronto, Ontario',
          confidence: 1,
          skipReason: '',
        },
      ];

      const executionResult = await executeApplicationFillPlan({
        page,
        boardEntry: boardEntry('ashby'),
        fields,
        fillPlan,
      });

      return {
        executionResult,
        pointerClicks: await page.evaluate(
          () => document.body.dataset.locationOptionPointerClicks
        ),
        selected: await page.locator('#work_location').getAttribute('data-selected'),
        value: await page.locator('#work_location').inputValue(),
      };
    });

    expect(result.pointerClicks).toBe('0');
    expect(result.selected).toBe('Toronto, Ontario, Canada');
    expect(result.value).toBe('Toronto, Ontario, Canada');
    expect(result.executionResult.summary).toEqual({
      total: 1,
      success: 1,
      skipped: 0,
      failed: 0,
    });
  });

  test('selects Lever location autocomplete row and updates hidden selection', async () => {
    await startServer(`
      <html>
        <body>
          <section id="application">
            <label for="location-input">Current location</label>
            <input id="location-input" name="location" data-qa="location-input" />
            <input id="selected-location" name="selectedLocation" type="hidden" />
            <div class="dropdown-results width-full cursor-pointer" hidden>
              <div id="location-0" class="break-word dropdown-location width-full py1 px2">
                Toronto, ON, CAN
              </div>
            </div>
            <script>
              const input = document.querySelector('#location-input');
              const selectedLocation = document.querySelector('#selected-location');
              const results = document.querySelector('.dropdown-results');
              const row = document.querySelector('#location-0');
              input.addEventListener('input', () => {
                selectedLocation.value = '';
                setTimeout(() => {
                  results.hidden = false;
                }, 100);
              });
              row.addEventListener('click', () => {
                const name = row.textContent.trim();
                input.value = name;
                selectedLocation.value = JSON.stringify({ name, id: 'toronto' });
                results.hidden = true;
              });
            </script>
          </section>
        </body>
      </html>
    `);

    const result = await withPage(async (page) => {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

      const fields: ScrapedApplicationField[] = [
        {
          id: 'location',
          label: 'Current location',
          type: 'text',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: [
            '#location-input',
            '[name="location"]',
            '[data-qa="location-input"]',
          ],
          options: [],
        },
      ];
      const fillPlan: ApplicationFillPlanEntry[] = [
        {
          fieldId: 'location',
          action: 'fill',
          value: 'Toronto, ON',
          confidence: 1,
          skipReason: '',
        },
      ];

      const executionResult = await executeApplicationFillPlan({
        page,
        boardEntry: boardEntry('lever'),
        fields,
        fillPlan,
      });

      return {
        executionResult,
        selectedLocation: await page.locator('#selected-location').inputValue(),
        value: await page.locator('#location-input').inputValue(),
      };
    });

    expect(result.selectedLocation).toContain('"name":"Toronto, ON, CAN"');
    expect(result.value).toBe('Toronto, ON, CAN');
    expect(result.executionResult.summary).toEqual({
      total: 1,
      success: 1,
      skipped: 0,
      failed: 0,
    });
  });

  test('fails custom combobox fills when no option matches the fill plan value', async () => {
    await startServer(`
      <html>
        <body>
          <section id="application">
            <input
              id="office"
              name="office"
              role="combobox"
              aria-controls="office-options"
              aria-expanded="false"
              autocomplete="off"
            />
            <div id="office-options" role="listbox" hidden>
              <button type="button" role="option">Yes</button>
              <button type="button" role="option">No</button>
            </div>
            <script>
              const office = document.querySelector('#office');
              const options = document.querySelector('#office-options');
              office.addEventListener('focus', () => {
                options.hidden = false;
                office.setAttribute('aria-expanded', 'true');
              });
              office.addEventListener('input', () => {
                options.hidden = office.value.trim().toLowerCase() === 'n/a';
                office.setAttribute('aria-expanded', options.hidden ? 'false' : 'true');
              });
              for (const option of options.querySelectorAll('[role="option"]')) {
                option.addEventListener('click', () => {
                  office.value = option.textContent.trim();
                  office.dataset.selected = option.textContent.trim();
                  options.hidden = true;
                  office.setAttribute('aria-expanded', 'false');
                });
              }
            </script>
          </section>
        </body>
      </html>
    `);

    const result = await withPage(async (page) => {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

      const fields: ScrapedApplicationField[] = [
        {
          id: 'office',
          label: 'Are you open to doing 4 days a week in the office?',
          type: 'combobox',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#office'],
          options: [],
        },
      ];
      const fillPlan: ApplicationFillPlanEntry[] = [
        {
          fieldId: 'office',
          action: 'fill',
          value: 'N/A',
          confidence: 1,
          skipReason: '',
        },
      ];

      const executionResult = await executeApplicationFillPlan({
        page,
        boardEntry: boardEntry(),
        fields,
        fillPlan,
      });

      return {
        executionResult,
        selected: await page.locator('#office').getAttribute('data-selected'),
      };
    });

    expect(result.selected).toBeNull();
    expect(result.executionResult.summary).toEqual({
      total: 1,
      success: 0,
      skipped: 0,
      failed: 1,
    });
    expect(result.executionResult.results[0]).toEqual(
      expect.objectContaining({
        fieldId: 'office',
        action: 'fill',
        status: 'failed',
        message: expect.stringContaining('No visible combobox option appeared'),
      })
    );
  });

  test('checks single checkboxes, checkbox groups, and radio groups', async () => {
    await startServer(`
      <html>
        <body>
          <section id="application">
            <label>
              <input id="privacy" type="checkbox" name="privacy" />
              I accept
            </label>
            <label>
              <input id="newsletter" type="checkbox" name="newsletter" checked />
              Send updates
            </label>
            <fieldset>
              <legend>Skills</legend>
              <label>
                <input type="checkbox" name="skills" value="typescript" />
                TypeScript
              </label>
              <label>
                <input type="checkbox" name="skills" value="playwright" />
                Playwright
              </label>
              <label>
                <input type="checkbox" name="skills" value="react" />
                React
              </label>
            </fieldset>
            <fieldset>
              <legend>Work authorization</legend>
              <label>
                <input type="radio" name="work_auth" value="yes" />
                Yes
              </label>
              <label>
                <input type="radio" name="work_auth" value="no" />
                No
              </label>
            </fieldset>
          </section>
        </body>
      </html>
    `);

    const result = await withPage(async (page) => {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

      const fields: ScrapedApplicationField[] = [
        {
          id: 'privacy',
          label: 'I accept',
          type: 'checkbox',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#privacy'],
          options: [],
        },
        {
          id: 'newsletter',
          label: 'Send updates',
          type: 'checkbox',
          required: false,
          visible: true,
          enabled: true,
          selectorCandidates: ['#newsletter'],
          options: [],
        },
        {
          id: 'skills',
          label: 'Skills',
          type: 'checkbox_group',
          required: false,
          visible: true,
          enabled: true,
          selectorCandidates: ['[name="skills"]'],
          options: [
            { value: 'typescript', label: 'TypeScript' },
            { value: 'playwright', label: 'Playwright' },
            { value: 'react', label: 'React' },
          ],
        },
        {
          id: 'work_auth',
          label: 'Work authorization',
          type: 'radio_group',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['[name="work_auth"]'],
          options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ],
        },
      ];
      const fillPlan: ApplicationFillPlanEntry[] = [
        {
          fieldId: 'privacy',
          action: 'check',
          value: true,
          confidence: 1,
          skipReason: '',
        },
        {
          fieldId: 'newsletter',
          action: 'check',
          value: false,
          confidence: 1,
          skipReason: '',
        },
        {
          fieldId: 'skills',
          action: 'check',
          value: ['typescript', 'playwright'],
          confidence: 0.9,
          skipReason: '',
        },
        {
          fieldId: 'work_auth',
          action: 'click',
          value: 'yes',
          confidence: 0.9,
          skipReason: '',
        },
      ];

      const executionResult = await executeApplicationFillPlan({
        page,
        boardEntry: boardEntry(),
        fields,
        fillPlan,
      });

      return {
        executionResult,
        privacy: await page.locator('#privacy').isChecked(),
        newsletter: await page.locator('#newsletter').isChecked(),
        typescript: await page
          .locator('input[name="skills"][value="typescript"]')
          .isChecked(),
        playwright: await page
          .locator('input[name="skills"][value="playwright"]')
          .isChecked(),
        react: await page
          .locator('input[name="skills"][value="react"]')
          .isChecked(),
        yes: await page
          .locator('input[name="work_auth"][value="yes"]')
          .isChecked(),
        no: await page
          .locator('input[name="work_auth"][value="no"]')
          .isChecked(),
      };
    });

    expect(result.privacy).toBe(true);
    expect(result.newsletter).toBe(false);
    expect(result.typescript).toBe(true);
    expect(result.playwright).toBe(true);
    expect(result.react).toBe(false);
    expect(result.yes).toBe(true);
    expect(result.no).toBe(false);
    expect(result.executionResult.summary).toEqual({
      total: 4,
      success: 4,
      skipped: 0,
      failed: 0,
    });
  });

  test('skips requested and file fields while continuing after field failures', async () => {
    await startServer(`
      <html>
        <body>
          <section id="application">
            <input id="last_name" name="last_name" />
            <input id="resume" name="resume" type="file" />
          </section>
        </body>
      </html>
    `);

    const result = await withPage(async (page) => {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

      const fields: ScrapedApplicationField[] = [
        {
          id: 'optional_question',
          label: 'Optional question',
          type: 'text',
          required: false,
          visible: true,
          enabled: true,
          selectorCandidates: ['#optional_question'],
          options: [],
        },
        {
          id: 'resume',
          label: 'Resume',
          type: 'file',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#resume'],
          options: [],
          specialHandling: 'file_upload',
        },
        {
          id: 'ghost',
          label: 'Ghost field',
          type: 'text',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#ghost'],
          options: [],
        },
        {
          id: 'last_name',
          label: 'Last Name',
          type: 'text',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#last_name'],
          options: [],
        },
      ];
      const fillPlan: ApplicationFillPlanEntry[] = [
        {
          fieldId: 'optional_question',
          action: 'skip',
          value: null,
          confidence: 0,
          skipReason: 'optional',
        },
        {
          fieldId: 'resume',
          action: 'fill',
          value: 'resume.pdf',
          confidence: 0.5,
          skipReason: '',
        },
        {
          fieldId: 'missing_from_scrape',
          action: 'fill',
          value: 'missing',
          confidence: 1,
          skipReason: '',
        },
        {
          fieldId: 'ghost',
          action: 'fill',
          value: 'unreachable',
          confidence: 1,
          skipReason: '',
        },
        {
          fieldId: 'last_name',
          action: 'fill',
          value: 'Example',
          confidence: 1,
          skipReason: '',
        },
      ];

      const executionResult = await executeApplicationFillPlan({
        page,
        boardEntry: boardEntry(),
        fields,
        fillPlan,
      });

      return {
        executionResult,
        lastName: await page.locator('#last_name').inputValue(),
      };
    });

    expect(result.lastName).toBe('Example');
    expect(result.executionResult.summary).toEqual({
      total: 5,
      success: 1,
      skipped: 2,
      failed: 2,
    });
    expect(result.executionResult.results).toEqual([
      expect.objectContaining({
        fieldId: 'optional_question',
        status: 'skipped',
        message: 'optional',
      }),
      expect.objectContaining({
        fieldId: 'resume',
        status: 'skipped',
      }),
      expect.objectContaining({
        fieldId: 'missing_from_scrape',
        status: 'failed',
        message: 'Fill plan entry did not match a scraped field.',
      }),
      expect.objectContaining({
        fieldId: 'ghost',
        status: 'failed',
      }),
      expect.objectContaining({
        fieldId: 'last_name',
        status: 'success',
        selector: '#last_name',
      }),
    ]);
  });

  test('uploads resume and cover letter artifacts for scraped file fields', async () => {
    const artifactsDir = mkdtempSync(join(tmpdir(), 'jobautomation-uploads-'));
    tempDirs.push(artifactsDir);
    const resumePath = join(artifactsDir, 'tailored-resume.pdf');
    const coverLetterPath = join(artifactsDir, 'tailored-cover-letter.pdf');
    writeFileSync(resumePath, '%PDF-1.4 resume');
    writeFileSync(coverLetterPath, '%PDF-1.4 cover letter');

    await startServer(`
      <html>
        <body>
          <section id="application">
            <label for="resume">Resume/CV</label>
            <input id="resume" name="resume" type="file" />
            <label for="cover_letter">Cover Letter</label>
            <input id="cover_letter" name="cover_letter" type="file" />
          </section>
        </body>
      </html>
    `);

    const result = await withPage(async (page) => {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

      const executionResult = await executeApplicationFillPlan({
        page,
        boardEntry: boardEntry(),
        artifacts: {
          resume: {
            id: 'resume-artifact',
            jobId: 'job-1',
            discoveryRunId: null,
            applicationRunId: null,
            applicantProfileId: null,
            applicantProfileUpdatedAt: null,
            version: 2,
            kind: 'resume-variant',
            format: 'pdf',
            fileName: 'tailored-resume.pdf',
            storagePath: resumePath,
            createdAt: new Date('2026-04-21T10:00:00.000Z'),
          },
          coverLetter: {
            id: 'cover-letter-artifact',
            jobId: 'job-1',
            discoveryRunId: null,
            applicationRunId: null,
            applicantProfileId: null,
            applicantProfileUpdatedAt: null,
            version: 2,
            kind: 'cover-letter',
            format: 'pdf',
            fileName: 'tailored-cover-letter.pdf',
            storagePath: coverLetterPath,
            createdAt: new Date('2026-04-21T10:00:00.000Z'),
          },
        },
        fields: [
          {
            id: 'resume',
            label: 'Resume/CV',
            type: 'file',
            required: true,
            visible: true,
            enabled: true,
            selectorCandidates: ['#resume'],
            options: [],
            specialHandling: 'file_upload',
          },
          {
            id: 'cover_letter',
            label: 'Cover Letter',
            type: 'file',
            required: false,
            visible: true,
            enabled: true,
            selectorCandidates: ['#cover_letter'],
            options: [],
            specialHandling: 'file_upload',
          },
        ],
        fillPlan: [
          {
            fieldId: 'resume',
            action: 'skip',
            value: null,
            confidence: 0,
            skipReason: 'file_upload_handled_later',
          },
          {
            fieldId: 'cover_letter',
            action: 'skip',
            value: null,
            confidence: 0,
            skipReason: 'file_upload_handled_later',
          },
        ],
      });

      return {
        executionResult,
        resumeFileName: await page
          .locator('#resume')
          .evaluate(
            (element) => (element as HTMLInputElement).files?.[0]?.name ?? null
          ),
        coverLetterFileName: await page
          .locator('#cover_letter')
          .evaluate(
            (element) => (element as HTMLInputElement).files?.[0]?.name ?? null
          ),
      };
    });

    expect(result.resumeFileName).toBe('tailored-resume.pdf');
    expect(result.coverLetterFileName).toBe('tailored-cover-letter.pdf');
    expect(result.executionResult.summary).toEqual({
      total: 2,
      success: 2,
      skipped: 0,
      failed: 0,
    });
    expect(result.executionResult.results).toEqual([
      expect.objectContaining({
        fieldId: 'resume',
        action: 'skip',
        status: 'success',
        selector: '#resume',
        message: 'Uploaded resume artifact.',
      }),
      expect.objectContaining({
        fieldId: 'cover_letter',
        action: 'skip',
        status: 'success',
        selector: '#cover_letter',
        message: 'Uploaded cover letter artifact.',
      }),
    ]);
  });

  test('waits for Lever resume parsing before filling fields', async () => {
    const artifactsDir = mkdtempSync(join(tmpdir(), 'jobautomation-uploads-'));
    tempDirs.push(artifactsDir);
    const resumePath = join(artifactsDir, 'tailored-resume.pdf');
    writeFileSync(resumePath, '%PDF-1.4 resume');

    await startServer(`
      <html>
        <body>
          <section id="application">
            <label for="resume">Resume/CV</label>
            <input id="resume" name="resume" type="file" />
            <label for="full_name">Full name</label>
            <input id="full_name" name="name" />
            <script>
              const resume = document.querySelector('#resume');
              const fullName = document.querySelector('#full_name');
              resume.addEventListener('change', () => {
                document.body.dataset.parserStatus = 'parsing';
                setTimeout(() => {
                  fullName.value = 'Resume Parsed Name';
                  fullName.dispatchEvent(new Event('input', { bubbles: true }));
                  document.body.dataset.parserStatus = 'complete';
                }, 5_000);
              });
            </script>
          </section>
        </body>
      </html>
    `);

    const result = await withPage(async (page) => {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

      const executionResult = await executeApplicationFillPlan({
        page,
        boardEntry: boardEntry('lever'),
        artifacts: {
          resume: {
            id: 'resume-artifact',
            jobId: 'job-1',
            discoveryRunId: null,
            applicationRunId: null,
            applicantProfileId: null,
            applicantProfileUpdatedAt: null,
            version: 2,
            kind: 'resume-variant',
            format: 'pdf',
            fileName: 'tailored-resume.pdf',
            storagePath: resumePath,
            createdAt: new Date('2026-04-21T10:00:00.000Z'),
          },
        },
        fields: [
          {
            id: 'resume',
            label: 'Resume/CV',
            type: 'file',
            required: true,
            visible: true,
            enabled: true,
            selectorCandidates: ['#resume'],
            options: [],
            specialHandling: 'file_upload',
          },
          {
            id: 'full_name',
            label: 'Full name',
            type: 'text',
            required: true,
            visible: true,
            enabled: true,
            selectorCandidates: ['#full_name'],
            options: [],
          },
        ],
        fillPlan: [
          {
            fieldId: 'resume',
            action: 'skip',
            value: null,
            confidence: 0,
            skipReason: 'file_upload_handled_later',
          },
          {
            fieldId: 'full_name',
            action: 'fill',
            value: 'Amro Abedmoosa',
            confidence: 1,
            skipReason: '',
          },
        ],
        pacing: {
          preFieldDelayMs: [1, 1],
          postFieldDelayMs: [1, 1],
          typingDelayMs: [1, 1],
          preApplyReadDelayMs: [1, 1],
          sectionReadDelayMs: [1, 1],
        },
      });

      await page.waitForTimeout(5_200);

      return {
        executionResult,
        parserStatus: await page.evaluate(() => document.body.dataset.parserStatus),
        fullName: await page.locator('#full_name').inputValue(),
      };
    });

    expect(result.parserStatus).toBe('complete');
    expect(result.fullName).toBe('Amro Abedmoosa');
    expect(result.executionResult.summary).toEqual({
      total: 2,
      success: 2,
      skipped: 0,
      failed: 0,
    });
  });

  test('uploads resume artifact for combined resume and cover letter file fields', async () => {
    const artifactsDir = mkdtempSync(join(tmpdir(), 'jobautomation-uploads-'));
    tempDirs.push(artifactsDir);
    const resumePath = join(artifactsDir, 'tailored-resume.pdf');
    const coverLetterPath = join(artifactsDir, 'tailored-cover-letter.pdf');
    writeFileSync(resumePath, '%PDF-1.4 resume');
    writeFileSync(coverLetterPath, '%PDF-1.4 cover letter');

    await startServer(`
      <html>
        <body>
          <section id="application">
            <label for="combined_upload">Resume/CV and Cover Letter</label>
            <input id="combined_upload" name="combined_upload" type="file" />
          </section>
        </body>
      </html>
    `);

    const result = await withPage(async (page) => {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

      const executionResult = await executeApplicationFillPlan({
        page,
        boardEntry: boardEntry(),
        artifacts: {
          resume: {
            id: 'resume-artifact',
            jobId: 'job-1',
            discoveryRunId: null,
            applicationRunId: null,
            applicantProfileId: null,
            applicantProfileUpdatedAt: null,
            version: 2,
            kind: 'resume-variant',
            format: 'pdf',
            fileName: 'tailored-resume.pdf',
            storagePath: resumePath,
            createdAt: new Date('2026-04-21T10:00:00.000Z'),
          },
          coverLetter: {
            id: 'cover-letter-artifact',
            jobId: 'job-1',
            discoveryRunId: null,
            applicationRunId: null,
            applicantProfileId: null,
            applicantProfileUpdatedAt: null,
            version: 2,
            kind: 'cover-letter',
            format: 'pdf',
            fileName: 'tailored-cover-letter.pdf',
            storagePath: coverLetterPath,
            createdAt: new Date('2026-04-21T10:00:00.000Z'),
          },
        },
        fields: [
          {
            id: 'combined_upload',
            label: 'Resume/CV and Cover Letter',
            type: 'file',
            required: true,
            visible: true,
            enabled: true,
            selectorCandidates: ['#combined_upload'],
            options: [],
            specialHandling: 'file_upload',
          },
        ],
        fillPlan: [
          {
            fieldId: 'combined_upload',
            action: 'skip',
            value: null,
            confidence: 0,
            skipReason: 'file_upload_handled_later',
          },
        ],
      });

      return {
        executionResult,
        fileName: await page
          .locator('#combined_upload')
          .evaluate(
            (element) => (element as HTMLInputElement).files?.[0]?.name ?? null
          ),
      };
    });

    expect(result.fileName).toBe('tailored-resume.pdf');
    expect(result.executionResult.results[0]).toEqual(
      expect.objectContaining({
        fieldId: 'combined_upload',
        status: 'success',
        message: 'Uploaded resume artifact.',
      })
    );
  });

  test('avoids direct bulk setter APIs for human-style interactions', async () => {
    await startServer(`
      <html>
        <body>
          <section id="application">
            <input id="first_name" name="first_name" />
            <select id="country" name="country">
              <option value="">Select a country</option>
              <option value="ca">Canada</option>
              <option value="us">United States</option>
            </select>
            <label>
              <input id="privacy" type="checkbox" name="privacy" />
              I accept
            </label>
            <fieldset>
              <legend>Work authorization</legend>
              <label>
                <input type="radio" name="work_auth" value="yes" />
                Yes
              </label>
              <label>
                <input type="radio" name="work_auth" value="no" />
                No
              </label>
            </fieldset>
          </section>
        </body>
      </html>
    `);

    await withPage(async (page) => {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

      const locatorPrototype = Object.getPrototypeOf(page.locator('body')) as {
        fill: (...args: unknown[]) => Promise<void>;
        selectOption: (...args: unknown[]) => Promise<void>;
        setChecked: (...args: unknown[]) => Promise<void>;
      };
      const fillSpy = vi.spyOn(locatorPrototype, 'fill');
      const selectOptionSpy = vi.spyOn(locatorPrototype, 'selectOption');
      const setCheckedSpy = vi.spyOn(locatorPrototype, 'setChecked');

      try {
        await executeApplicationFillPlan({
          page,
          boardEntry: boardEntry(),
          fields: [
            {
              id: 'first_name',
              label: 'First Name',
              type: 'text',
              required: true,
              visible: true,
              enabled: true,
              selectorCandidates: ['#first_name'],
              options: [],
            },
            {
              id: 'country',
              label: 'Country',
              type: 'select',
              required: true,
              visible: true,
              enabled: true,
              selectorCandidates: ['#country'],
              options: [
                { value: '', label: 'Select a country' },
                { value: 'ca', label: 'Canada' },
                { value: 'us', label: 'United States' },
              ],
            },
            {
              id: 'privacy',
              label: 'Privacy',
              type: 'checkbox',
              required: true,
              visible: true,
              enabled: true,
              selectorCandidates: ['#privacy'],
              options: [],
            },
            {
              id: 'work_auth',
              label: 'Work authorization',
              type: 'radio_group',
              required: true,
              visible: true,
              enabled: true,
              selectorCandidates: ['[name="work_auth"]'],
              options: [
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ],
            },
          ],
          fillPlan: [
            {
              fieldId: 'first_name',
              action: 'fill',
              value: 'Taylor',
              confidence: 1,
              skipReason: '',
            },
            {
              fieldId: 'country',
              action: 'select',
              value: 'ca',
              confidence: 1,
              skipReason: '',
            },
            {
              fieldId: 'privacy',
              action: 'check',
              value: true,
              confidence: 1,
              skipReason: '',
            },
            {
              fieldId: 'work_auth',
              action: 'click',
              value: 'yes',
              confidence: 1,
              skipReason: '',
            },
          ],
        });
      } finally {
        expect(fillSpy).not.toHaveBeenCalled();
        expect(selectOptionSpy).not.toHaveBeenCalled();
        expect(setCheckedSpy).not.toHaveBeenCalled();
        fillSpy.mockRestore();
        selectOptionSpy.mockRestore();
        setCheckedSpy.mockRestore();
      }
    });
  });

  test('types text character-by-character instead of writing the full value at once', async () => {
    await startServer(`
      <html>
        <body>
          <section id="application">
            <input id="first_name" name="first_name" />
            <script>
              const events = [];
              const input = document.getElementById('first_name');
              input.addEventListener('keydown', (event) => {
                events.push(event.key);
                input.dataset.keys = JSON.stringify(events);
              });
            </script>
          </section>
        </body>
      </html>
    `);

    const result = await withPage(async (page) => {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

      await executeApplicationFillPlan({
        page,
        boardEntry: boardEntry(),
        fields: [
          {
            id: 'first_name',
            label: 'First Name',
            type: 'text',
            required: true,
            visible: true,
            enabled: true,
            selectorCandidates: ['#first_name'],
            options: [],
          },
        ],
        fillPlan: [
          {
            fieldId: 'first_name',
            action: 'fill',
            value: 'Taylor',
            confidence: 1,
            skipReason: '',
          },
        ],
      });

      return {
        keys: await page.locator('#first_name').getAttribute('data-keys'),
        value: await page.locator('#first_name').inputValue(),
      };
    });

    const printableKeys = JSON.parse(result.keys ?? '[]').filter(
      (key: string) => /^[A-Za-z]$/.test(key)
    );
    expect(printableKeys.slice(-6)).toEqual(['T', 'a', 'y', 'l', 'o', 'r']);
    expect(result.value).toBe('Taylor');
  });

  test('selects all and backspaces before typing into prefilled text fields', async () => {
    await startServer(`
      <html>
        <body>
          <section id="application">
            <input id="full_name" name="full_name" value="Existing Name" />
            <script>
              const events = [];
              const input = document.getElementById('full_name');
              input.addEventListener('keydown', (event) => {
                events.push(event.key);
                input.dataset.keys = JSON.stringify(events);
              });
            </script>
          </section>
        </body>
      </html>
    `);

    const result = await withPage(async (page) => {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

      await executeApplicationFillPlan({
        page,
        boardEntry: boardEntry(),
        fields: [
          {
            id: 'full_name',
            label: 'Full Name',
            type: 'text',
            required: true,
            visible: true,
            enabled: true,
            selectorCandidates: ['#full_name'],
            options: [],
          },
        ],
        fillPlan: [
          {
            fieldId: 'full_name',
            action: 'fill',
            value: 'Taylor Morgan',
            confidence: 1,
            skipReason: '',
          },
        ],
      });

      return {
        keys: await page.locator('#full_name').getAttribute('data-keys'),
        value: await page.locator('#full_name').inputValue(),
      };
    });

    const keys = JSON.parse(result.keys ?? '[]');
    expect(keys).toContain('Backspace');
    expect(result.value).toBe('Taylor Morgan');
  });
});

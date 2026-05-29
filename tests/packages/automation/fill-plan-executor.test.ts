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

  test('closes Greenhouse phone country combobox before filling phone number', async () => {
    await startServer(`
      <html>
        <head>
          <style>
            #application { position: relative; }
            #phone-options {
              position: absolute;
              top: 48px;
              left: 0;
              width: 300px;
              height: 120px;
              background: white;
              z-index: 10;
            }
          </style>
        </head>
        <body>
          <section id="application">
            <input
              id="phone_country"
              name="phone_country"
              role="combobox"
              aria-controls="phone-options"
              aria-expanded="false"
              autocomplete="off"
            />
            <input id="phone" name="phone" type="tel" style="display:block; margin-top: 16px;" />
            <div id="phone-options" role="listbox" hidden>
              <button type="button" role="option">United States +1</button>
              <button type="button" role="option">Canada +1</button>
            </div>
            <script>
              const country = document.querySelector('#phone_country');
              const options = document.querySelector('#phone-options');
              function showOptions() {
                options.hidden = false;
                country.setAttribute('aria-expanded', 'true');
              }
              function hideOptions() {
                options.hidden = true;
                country.setAttribute('aria-expanded', 'false');
              }
              country.addEventListener('focus', showOptions);
              country.addEventListener('input', showOptions);
              country.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') hideOptions();
              });
              country.addEventListener('blur', hideOptions);
              for (const option of options.querySelectorAll('[role="option"]')) {
                option.addEventListener('mousedown', () => {
                  country.value = option.textContent.trim();
                  country.dataset.selected = option.textContent.trim();
                  country.dispatchEvent(new Event('input', { bubbles: true }));
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
          id: 'phone_country',
          label: 'Country',
          type: 'combobox',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#phone_country'],
          options: [
            { value: 'United States +1', label: 'United States +1' },
            { value: 'Canada +1', label: 'Canada +1' },
          ],
        },
        {
          id: 'phone',
          label: 'Phone',
          type: 'tel',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#phone'],
          options: [],
        },
      ];
      const fillPlan: ApplicationFillPlanEntry[] = [
        {
          fieldId: 'phone_country',
          action: 'fill',
          value: 'United States +1',
          confidence: 1,
          skipReason: '',
        },
        {
          fieldId: 'phone',
          action: 'fill',
          value: '9054621004',
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
        selectedCountry: await page.locator('#phone_country').getAttribute('data-selected'),
        phone: await page.locator('#phone').inputValue(),
        optionsVisible: await page.locator('#phone-options').isVisible(),
      };
    });

    expect(result.selectedCountry).toBe('United States +1');
    expect(result.phone).toBe('9054621004');
    expect(result.optionsVisible).toBe(false);
    expect(result.executionResult.summary).toEqual({
      total: 2,
      success: 2,
      skipped: 0,
      failed: 0,
    });
  });

  test('clicks the populated Ashby location option after typing search text', async () => {
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

    expect(result.pointerClicks).toBe('1');
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

  test('matches underscore demographic slugs to hyphenated checkbox values', async () => {
    await startServer(`
      <html>
        <body>
          <section id="application">
            <fieldset>
              <legend>Pronouns</legend>
              <label>
                <input type="checkbox" name="pronouns[]" value="she-her" />
                She/her
              </label>
              <label>
                <input type="checkbox" name="pronouns[]" value="prefer-not-to-say" />
                Prefer not to say
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
          id: 'pronouns',
          label: 'Pronouns',
          type: 'checkbox_group',
          required: false,
          visible: true,
          enabled: true,
          selectorCandidates: ['[name="pronouns[]"]'],
          options: [
            { value: 'she-her', label: 'She/her' },
            { value: 'prefer-not-to-say', label: 'Prefer not to say' },
          ],
        },
      ];
      const fillPlan: ApplicationFillPlanEntry[] = [
        {
          fieldId: 'pronouns',
          action: 'fill',
          value: 'prefer_not_to_say',
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
        pronounPreferNot: await page
          .locator('input[name="pronouns[]"][value="prefer-not-to-say"]')
          .isChecked(),
        pronounShe: await page
          .locator('input[name="pronouns[]"][value="she-her"]')
          .isChecked(),
      };
    });

    expect(result.pronounPreferNot).toBe(true);
    expect(result.pronounShe).toBe(false);
    expect(result.executionResult.summary).toEqual({
      total: 1,
      success: 1,
      skipped: 0,
      failed: 0,
    });
  });

  test('handles Ashby-style hidden checkbox inputs by clicking visible Yes/No buttons', async () => {
    await startServer(`
      <html>
        <body>
          <section id="application">
            <div class="ashby-application-form-field-entry" data-field-path="6a7a7e99-1d49-4066-ae75-097e6745c462">
              <label class="ashby-application-form-question-title">Do you have experience with LLMs?</label>
              <button id="llm-yes" type="button">Yes</button>
              <button id="llm-no" type="button">No</button>
              <input id="llm-hidden" type="checkbox" name="6a7a7e99-1d49-4066-ae75-097e6745c462" style="display:none" />
            </div>
            <script>
              const input = document.getElementById('llm-hidden');
              document.getElementById('llm-yes').addEventListener('click', () => {
                input.checked = true;
              });
              document.getElementById('llm-no').addEventListener('click', () => {
                input.checked = false;
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
        boardEntry: boardEntry('ashby'),
        fields: [
          {
            id: '6a7a7e99-1d49-4066-ae75-097e6745c462',
            label: 'Do you have experience with LLMs?',
            type: 'checkbox',
            required: true,
            visible: true,
            enabled: true,
            selectorCandidates: ['[name="6a7a7e99-1d49-4066-ae75-097e6745c462"]'],
            options: [],
          },
        ],
        fillPlan: [
          {
            fieldId: '6a7a7e99-1d49-4066-ae75-097e6745c462',
            action: 'check',
            value: true,
            confidence: 1,
            skipReason: '',
          },
        ],
      });

      return {
        executionResult,
        checked: await page.locator('#llm-hidden').isChecked(),
      };
    });

    expect(result.checked).toBe(true);
    expect(result.executionResult.summary).toEqual({
      total: 1,
      success: 1,
      skipped: 0,
      failed: 0,
    });
  });

  test('clicks No for required Ashby hidden checkbox fields when fill plan value is false', async () => {
    await startServer(`
      <html>
        <body>
          <section id="application">
            <div class="ashby-application-form-field-entry" data-field-path="required_no_answer">
              <label class="ashby-application-form-question-title">Do you require sponsorship now or in future?</label>
              <button id="sponsorship-yes" type="button">Yes</button>
              <button id="sponsorship-no" type="button">No</button>
              <input id="sponsorship-hidden" type="checkbox" name="required_no_answer" style="display:none" />
            </div>
            <script>
              const input = document.getElementById('sponsorship-hidden');
              document.getElementById('sponsorship-yes').addEventListener('click', () => {
                input.checked = true;
                input.dataset.answer = 'yes';
              });
              document.getElementById('sponsorship-no').addEventListener('click', () => {
                input.checked = false;
                input.dataset.answer = 'no';
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
        boardEntry: boardEntry('ashby'),
        fields: [
          {
            id: 'required_no_answer',
            label: 'Do you require sponsorship now or in future?',
            type: 'checkbox',
            required: true,
            visible: true,
            enabled: true,
            selectorCandidates: ['[name="required_no_answer"]'],
            options: [],
          },
        ],
        fillPlan: [
          {
            fieldId: 'required_no_answer',
            action: 'check',
            value: false,
            confidence: 1,
            skipReason: '',
          },
        ],
      });

      return {
        executionResult,
        answer: await page.locator('#sponsorship-hidden').getAttribute('data-answer'),
        checked: await page.locator('#sponsorship-hidden').isChecked(),
      };
    });

    expect(result.checked).toBe(false);
    expect(result.answer).toBe('no');
    expect(result.executionResult.summary).toEqual({
      total: 1,
      success: 1,
      skipped: 0,
      failed: 0,
    });
  });

  test('recovers bottom-edge static combobox selection when options appear after ArrowDown', async () => {
    await startServer(`
      <html>
        <body style="margin: 0;">
          <div style="height: 1100px;"></div>
          <section id="application">
            <label for="edge_combo">Non-compete acknowledgement</label>
            <input
              id="edge_combo"
              name="edge_combo"
              role="combobox"
              aria-controls="edge-options"
              aria-expanded="false"
              autocomplete="off"
            />
            <div id="edge-options" role="listbox" hidden>
              <button type="button" role="option">Yes</button>
              <button type="button" role="option">No</button>
            </div>
            <script>
              const combo = document.getElementById('edge_combo');
              const listbox = document.getElementById('edge-options');
              let unlocked = false;
              function hideOptions() {
                listbox.hidden = true;
                combo.setAttribute('aria-expanded', 'false');
              }
              function showOptions() {
                if (!unlocked) return;
                listbox.hidden = false;
                combo.setAttribute('aria-expanded', 'true');
              }
              combo.addEventListener('focus', showOptions);
              combo.addEventListener('input', showOptions);
              combo.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') {
                  hideOptions();
                  return;
                }
                if (event.key === 'ArrowDown') {
                  unlocked = true;
                  showOptions();
                }
              });
              combo.addEventListener('blur', hideOptions);
              for (const option of listbox.querySelectorAll('[role="option"]')) {
                option.addEventListener('mousedown', () => {
                  combo.value = option.textContent.trim();
                  combo.dataset.selected = option.textContent.trim();
                });
                option.addEventListener('click', hideOptions);
              }
            </script>
          </section>
          <div style="height: 1000px;"></div>
        </body>
      </html>
    `);

    const result = await withPage(async (page) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => {
        const combo = document.getElementById('edge_combo');
        if (!combo) return;
        const rect = combo.getBoundingClientRect();
        window.scrollBy(0, rect.top - (window.innerHeight - 18));
      });
      const initialScrollY = await page.evaluate(() => window.scrollY);

      const executionResult = await executeApplicationFillPlan({
        page,
        boardEntry: boardEntry(),
        fields: [
          {
            id: 'edge_combo',
            label: 'Non-compete acknowledgement',
            type: 'combobox',
            required: true,
            visible: true,
            enabled: true,
            selectorCandidates: ['#edge_combo'],
            options: [
              { value: 'Yes', label: 'Yes' },
              { value: 'No', label: 'No' },
            ],
          },
        ],
        fillPlan: [
          {
            fieldId: 'edge_combo',
            action: 'fill',
            value: 'Yes',
            confidence: 1,
            skipReason: '',
          },
        ],
      });

      return {
        executionResult,
        selected: await page.locator('#edge_combo').getAttribute('data-selected'),
        finalScrollY: await page.evaluate(() => window.scrollY),
        initialScrollY,
      };
    });

    expect(result.selected).toBe('Yes');
    expect(result.finalScrollY).toBeGreaterThan(result.initialScrollY);
    expect(result.executionResult.summary).toEqual({
      total: 1,
      success: 1,
      skipped: 0,
      failed: 0,
    });
  });

  test('scrolls text field away from bottom edge before typing', async () => {
    await startServer(`
      <html>
        <body style="margin: 0;">
          <div style="height: 1000px;"></div>
          <section id="application">
            <label for="edge_text">Why this role?</label>
            <input id="edge_text" name="edge_text" type="text" />
          </section>
          <div style="height: 1000px;"></div>
        </body>
      </html>
    `);

    const result = await withPage(async (page) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => {
        const input = document.getElementById('edge_text');
        if (!input) return;
        const rect = input.getBoundingClientRect();
        window.scrollBy(0, rect.top - (window.innerHeight - 14));
      });
      const initialScrollY = await page.evaluate(() => window.scrollY);

      const executionResult = await executeApplicationFillPlan({
        page,
        boardEntry: boardEntry(),
        fields: [
          {
            id: 'edge_text',
            label: 'Why this role?',
            type: 'text',
            required: true,
            visible: true,
            enabled: true,
            selectorCandidates: ['#edge_text'],
            options: [],
          },
        ],
        fillPlan: [
          {
            fieldId: 'edge_text',
            action: 'fill',
            value: 'I love complex migration work.',
            confidence: 1,
            skipReason: '',
          },
        ],
      });

      return {
        executionResult,
        value: await page.locator('#edge_text').inputValue(),
        finalScrollY: await page.evaluate(() => window.scrollY),
        initialScrollY,
      };
    });

    expect(result.value).toBe('I love complex migration work.');
    expect(result.finalScrollY).toBeGreaterThan(result.initialScrollY);
    expect(result.executionResult.summary).toEqual({
      total: 1,
      success: 1,
      skipped: 0,
      failed: 0,
    });
  });

  test('does not auto-scroll before clicking a radio option that is already on screen', async () => {
    await startServer(`
      <html>
        <body style="margin: 0;">
          <div style="height: 900px;"></div>
          <section id="application">
            <fieldset style="height: 180px; padding: 20px;">
              <legend>Work authorization</legend>
              <label style="display: block; height: 60px;">
                <input type="radio" name="work_auth" value="yes" />
                Yes
              </label>
              <label style="display: block; height: 60px;">
                <input id="work_auth_no" type="radio" name="work_auth" value="no" />
                No
              </label>
            </fieldset>
          </section>
          <div style="height: 900px;"></div>
        </body>
      </html>
    `);

    await withPage(async (page) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => window.scrollTo(0, 700));
      const initialScrollY = await page.evaluate(() => window.scrollY);

      const locatorPrototype = Object.getPrototypeOf(page.locator('body')) as {
        scrollIntoViewIfNeeded: (...args: unknown[]) => Promise<void>;
      };
      const scrollSpy = vi.spyOn(locatorPrototype, 'scrollIntoViewIfNeeded');

      try {
        const executionResult = await executeApplicationFillPlan({
          page,
          boardEntry: boardEntry(),
          fields: [
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
              fieldId: 'work_auth',
              action: 'click',
              value: 'no',
              confidence: 1,
              skipReason: '',
            },
          ],
        });

        expect(executionResult.summary).toEqual({
          total: 1,
          success: 1,
          skipped: 0,
          failed: 0,
        });
        expect(await page.locator('#work_auth_no').isChecked()).toBe(true);
        expect(scrollSpy).not.toHaveBeenCalled();
        expect(await page.evaluate(() => window.scrollY)).toBe(initialScrollY);
      } finally {
        scrollSpy.mockRestore();
      }
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

  test('avoids locator.fill() and locator.setChecked; native <select> uses selectOption for reliability', async () => {
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
        expect(setCheckedSpy).not.toHaveBeenCalled();
        expect(selectOptionSpy).toHaveBeenCalledTimes(1);
        fillSpy.mockRestore();
        selectOptionSpy.mockRestore();
        setCheckedSpy.mockRestore();
      }
    });
  });

  test('types Lever text with one field-level typing action instead of per-character section pauses', async () => {
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

      const executionResult = await executeApplicationFillPlan({
        page,
        boardEntry: boardEntry('lever'),
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
        pacing: {
          preFieldDelayMs: [1, 1],
          postFieldDelayMs: [1, 1],
          typingDelayMs: [1, 1],
          preApplyReadDelayMs: [1, 1],
          sectionReadDelayMs: [1, 1],
        },
      });

      return {
        executionResult,
        keys: await page.locator('#first_name').getAttribute('data-keys'),
        value: await page.locator('#first_name').inputValue(),
      };
    });

    const printableKeys = JSON.parse(result.keys ?? '[]').filter(
      (key: string) => /^[A-Za-z]$/.test(key)
    );
    expect(printableKeys.slice(-6)).toEqual(['T', 'a', 'y', 'l', 'o', 'r']);
    expect(result.value).toBe('Taylor');
    expect(result.executionResult.telemetry.totalTypingDurationMs).toBe(6);
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

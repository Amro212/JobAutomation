import { createServer } from 'node:http';

import type { Page } from 'playwright';
import { afterEach, describe, expect, test } from 'vitest';

import type { ApplicationBoardEntryResult } from '../../../packages/automation/src/apply/board-entry';
import { executeApplicationFillPlan } from '../../../packages/automation/src/apply/fill-plan-executor';
import type { ScrapedApplicationField } from '../../../packages/automation/src/apply/form-scraper';
import type { ApplicationFillPlanEntry } from '../../../packages/automation/src/apply/openrouter-answer-module';
import { createDiscoveryBrowser } from '../../../packages/automation/src/playwright/browser';

describe('application fill plan executor', () => {
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
          reject(new Error('Fill plan executor test server address was not available.'));
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

  function boardEntry(): ApplicationBoardEntryResult {
    return {
      board: 'greenhouse',
      entryAction: 'direct_form',
      startUrl: `${baseUrl}/`,
      finalUrl: `${baseUrl}/`,
      readyFieldCount: 4,
      rootSelector: '#application',
      rootIndex: 0
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
          options: []
        },
        {
          id: 'email',
          label: 'Email',
          type: 'email',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#email'],
          options: []
        },
        {
          id: 'summary',
          label: 'Summary',
          type: 'textarea',
          required: false,
          visible: true,
          enabled: true,
          selectorCandidates: ['#summary'],
          options: []
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
          specialHandling: 'rich_text'
        }
      ];
      const fillPlan: ApplicationFillPlanEntry[] = [
        {
          fieldId: 'first_name',
          action: 'fill',
          value: 'Taylor',
          confidence: 1,
          skipReason: ''
        },
        {
          fieldId: 'email',
          action: 'fill',
          value: 'taylor@example.com',
          confidence: 1,
          skipReason: ''
        },
        {
          fieldId: 'summary',
          action: 'fill',
          value: 'Browser automation engineer',
          confidence: 0.9,
          skipReason: ''
        },
        {
          fieldId: 'cover_letter',
          action: 'fill',
          value: 'I build reliable internal tools.',
          confidence: 0.9,
          skipReason: ''
        }
      ];

      const executionResult = await executeApplicationFillPlan({
        page,
        boardEntry: boardEntry(),
        fields,
        fillPlan
      });

      return {
        executionResult,
        firstName: await page.locator('#first_name').inputValue(),
        email: await page.locator('#email').inputValue(),
        summary: await page.locator('#summary').inputValue(),
        coverLetter: await page.locator('#cover_letter').textContent()
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
      failed: 0
    });
    expect(result.executionResult.results).toEqual([
      expect.objectContaining({
        fieldId: 'first_name',
        status: 'success',
        selector: '#first_name'
      }),
      expect.objectContaining({
        fieldId: 'email',
        status: 'success',
        selector: '#email'
      }),
      expect.objectContaining({
        fieldId: 'summary',
        status: 'success',
        selector: '#summary'
      }),
      expect.objectContaining({
        fieldId: 'cover_letter',
        status: 'success',
        selector: '#cover_letter'
      })
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
            { value: 'us', label: 'United States' }
          ]
        }
      ];
      const fillPlan: ApplicationFillPlanEntry[] = [
        {
          fieldId: 'country',
          action: 'select',
          value: 'ca',
          confidence: 0.95,
          skipReason: ''
        }
      ];

      const executionResult = await executeApplicationFillPlan({
        page,
        boardEntry: boardEntry(),
        fields,
        fillPlan
      });

      return {
        executionResult,
        country: await page.locator('#country').inputValue()
      };
    });

    expect(result.country).toBe('ca');
    expect(result.executionResult.summary).toEqual({
      total: 1,
      success: 1,
      skipped: 0,
      failed: 0
    });
    expect(result.executionResult.results[0]).toEqual(
      expect.objectContaining({
        fieldId: 'country',
        action: 'select',
        status: 'success',
        selector: '#country'
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
          options: []
        }
      ];
      const fillPlan: ApplicationFillPlanEntry[] = [
        {
          fieldId: 'office',
          action: 'fill',
          value: 'Yes',
          confidence: 1,
          skipReason: ''
        }
      ];

      const executionResult = await executeApplicationFillPlan({
        page,
        boardEntry: boardEntry(),
        fields,
        fillPlan
      });

      return {
        executionResult,
        selected: await page.locator('#office').getAttribute('data-selected'),
        value: await page.locator('#office').inputValue()
      };
    });

    expect(result.selected).toBe('Yes');
    expect(result.value).toBe('Yes');
    expect(result.executionResult.summary).toEqual({
      total: 1,
      success: 1,
      skipped: 0,
      failed: 0
    });
    expect(result.executionResult.results[0]).toEqual(
      expect.objectContaining({
        fieldId: 'office',
        action: 'fill',
        status: 'success',
        selector: '#office',
        message: 'Selected combobox option.'
      })
    );
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
          options: []
        }
      ];
      const fillPlan: ApplicationFillPlanEntry[] = [
        {
          fieldId: 'office',
          action: 'fill',
          value: 'N/A',
          confidence: 1,
          skipReason: ''
        }
      ];

      const executionResult = await executeApplicationFillPlan({
        page,
        boardEntry: boardEntry(),
        fields,
        fillPlan
      });

      return {
        executionResult,
        selected: await page.locator('#office').getAttribute('data-selected')
      };
    });

    expect(result.selected).toBeNull();
    expect(result.executionResult.summary).toEqual({
      total: 1,
      success: 0,
      skipped: 0,
      failed: 1
    });
    expect(result.executionResult.results[0]).toEqual(
      expect.objectContaining({
        fieldId: 'office',
        action: 'fill',
        status: 'failed',
        message: expect.stringContaining('No visible combobox option matched')
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
          options: []
        },
        {
          id: 'newsletter',
          label: 'Send updates',
          type: 'checkbox',
          required: false,
          visible: true,
          enabled: true,
          selectorCandidates: ['#newsletter'],
          options: []
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
            { value: 'react', label: 'React' }
          ]
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
            { value: 'no', label: 'No' }
          ]
        }
      ];
      const fillPlan: ApplicationFillPlanEntry[] = [
        {
          fieldId: 'privacy',
          action: 'check',
          value: true,
          confidence: 1,
          skipReason: ''
        },
        {
          fieldId: 'newsletter',
          action: 'check',
          value: false,
          confidence: 1,
          skipReason: ''
        },
        {
          fieldId: 'skills',
          action: 'check',
          value: ['typescript', 'playwright'],
          confidence: 0.9,
          skipReason: ''
        },
        {
          fieldId: 'work_auth',
          action: 'click',
          value: 'yes',
          confidence: 0.9,
          skipReason: ''
        }
      ];

      const executionResult = await executeApplicationFillPlan({
        page,
        boardEntry: boardEntry(),
        fields,
        fillPlan
      });

      return {
        executionResult,
        privacy: await page.locator('#privacy').isChecked(),
        newsletter: await page.locator('#newsletter').isChecked(),
        typescript: await page.locator('input[name="skills"][value="typescript"]').isChecked(),
        playwright: await page.locator('input[name="skills"][value="playwright"]').isChecked(),
        react: await page.locator('input[name="skills"][value="react"]').isChecked(),
        yes: await page.locator('input[name="work_auth"][value="yes"]').isChecked(),
        no: await page.locator('input[name="work_auth"][value="no"]').isChecked()
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
      failed: 0
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
          options: []
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
          specialHandling: 'file_upload'
        },
        {
          id: 'ghost',
          label: 'Ghost field',
          type: 'text',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#ghost'],
          options: []
        },
        {
          id: 'last_name',
          label: 'Last Name',
          type: 'text',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: ['#last_name'],
          options: []
        }
      ];
      const fillPlan: ApplicationFillPlanEntry[] = [
        {
          fieldId: 'optional_question',
          action: 'skip',
          value: null,
          confidence: 0,
          skipReason: 'optional'
        },
        {
          fieldId: 'resume',
          action: 'fill',
          value: 'resume.pdf',
          confidence: 0.5,
          skipReason: ''
        },
        {
          fieldId: 'missing_from_scrape',
          action: 'fill',
          value: 'missing',
          confidence: 1,
          skipReason: ''
        },
        {
          fieldId: 'ghost',
          action: 'fill',
          value: 'unreachable',
          confidence: 1,
          skipReason: ''
        },
        {
          fieldId: 'last_name',
          action: 'fill',
          value: 'Example',
          confidence: 1,
          skipReason: ''
        }
      ];

      const executionResult = await executeApplicationFillPlan({
        page,
        boardEntry: boardEntry(),
        fields,
        fillPlan
      });

      return {
        executionResult,
        lastName: await page.locator('#last_name').inputValue()
      };
    });

    expect(result.lastName).toBe('Example');
    expect(result.executionResult.summary).toEqual({
      total: 5,
      success: 1,
      skipped: 2,
      failed: 2
    });
    expect(result.executionResult.results).toEqual([
      expect.objectContaining({
        fieldId: 'optional_question',
        status: 'skipped',
        message: 'optional'
      }),
      expect.objectContaining({
        fieldId: 'resume',
        status: 'skipped'
      }),
      expect.objectContaining({
        fieldId: 'missing_from_scrape',
        status: 'failed',
        message: 'Fill plan entry did not match a scraped field.'
      }),
      expect.objectContaining({
        fieldId: 'ghost',
        status: 'failed'
      }),
      expect.objectContaining({
        fieldId: 'last_name',
        status: 'success',
        selector: '#last_name'
      })
    ]);
  });
});

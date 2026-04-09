import { createServer } from 'node:http';

import type { Page } from 'playwright';
import { afterEach, describe, expect, test } from 'vitest';

import { reachApplicationForm } from '../../../packages/automation/src/apply/board-entry';
import { scrapeApplicationFields } from '../../../packages/automation/src/apply/form-scraper';
import { createDiscoveryBrowser } from '../../../packages/automation/src/playwright/browser';

describe('application field scraper', () => {
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

  async function startServer(routes: Record<string, string>): Promise<void> {
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
          reject(new Error('Form scraper test server address was not available.'));
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

  test('scrapes visible application fields with labels, selector candidates, and special-case flags', async () => {
    await startServer({
      '/greenhouse': `
        <html>
          <body>
            <main>
              <article>
                <h1>Senior Platform Engineer</h1>
                <p>Build reliable systems without including this text as a field.</p>
              </article>
              <section id="application">
                <label for="first_name">First Name</label>
                <input id="first_name" name="first_name" required />

                <label for="email">Email</label>
                <input id="email" name="email" type="email" required />

                <label for="country">Country</label>
                <select id="country" name="country" required>
                  <option value="">Select a country</option>
                  <option value="ca">Canada</option>
                  <option value="us">United States</option>
                </select>

                <label for="resume">Resume/CV</label>
                <input id="resume" name="resume" type="file" />

                <label for="cover_letter">Cover Letter</label>
                <div
                  id="cover_letter"
                  contenteditable="true"
                  role="textbox"
                  aria-labelledby="cover_letter_label"
                ></div>
                <span id="cover_letter_label">Cover Letter</span>

                <input id="secret" type="hidden" value="ignore-me" />
              </section>
            </main>
          </body>
        </html>
      `
    });

    const fields = await withPage(async (page) => {
      await page.goto(`${baseUrl}/greenhouse`, { waitUntil: 'domcontentloaded' });
      const boardEntry = await reachApplicationForm({ page, board: 'greenhouse' });
      return scrapeApplicationFields({ page, boardEntry });
    });

    expect(fields).toHaveLength(5);

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'First Name',
          type: 'text',
          required: true,
          visible: true,
          enabled: true,
          selectorCandidates: expect.arrayContaining(['#first_name', '[name="first_name"]'])
        }),
        expect.objectContaining({
          label: 'Email',
          type: 'email',
          required: true,
          selectorCandidates: expect.arrayContaining(['#email', '[name="email"]'])
        }),
        expect.objectContaining({
          label: 'Country',
          type: 'select',
          required: true,
          options: [
            { value: '', label: 'Select a country' },
            { value: 'ca', label: 'Canada' },
            { value: 'us', label: 'United States' }
          ]
        }),
        expect.objectContaining({
          label: 'Resume/CV',
          type: 'file',
          specialHandling: 'file_upload'
        }),
        expect.objectContaining({
          label: 'Cover Letter',
          type: 'rich_text',
          specialHandling: 'rich_text'
        })
      ])
    );

    expect(fields.map((field) => field.label)).not.toContain(
      'Build reliable systems without including this text as a field.'
    );
  });

  test('groups radio and checkbox sets into a single field with options', async () => {
    await startServer({
      '/lever': `
        <html>
          <body>
            <main>
              <button id="apply_button" type="button">Apply for this job</button>
              <section id="application_shell" hidden>
                <form data-qa="application-form">
                  <fieldset>
                    <legend>Work authorization</legend>
                    <label>
                      <input type="radio" name="work_auth" value="yes" required />
                      Yes
                    </label>
                    <label>
                      <input type="radio" name="work_auth" value="no" />
                      No
                    </label>
                  </fieldset>

                  <fieldset>
                    <legend>Preferred locations</legend>
                    <label>
                      <input type="checkbox" name="locations" value="toronto" />
                      Toronto
                    </label>
                    <label>
                      <input type="checkbox" name="locations" value="remote" />
                      Remote
                    </label>
                  </fieldset>

                  <label for="phone">Phone</label>
                  <input id="phone" type="tel" name="phone" />
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

    const fields = await withPage(async (page) => {
      await page.goto(`${baseUrl}/lever`, { waitUntil: 'domcontentloaded' });
      const boardEntry = await reachApplicationForm({ page, board: 'lever' });
      return scrapeApplicationFields({ page, boardEntry });
    });

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Work authorization',
          type: 'radio_group',
          required: true,
          options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' }
          ]
        }),
        expect.objectContaining({
          label: 'Preferred locations',
          type: 'checkbox_group',
          required: false,
          options: [
            { value: 'toronto', label: 'Toronto' },
            { value: 'remote', label: 'Remote' }
          ]
        }),
        expect.objectContaining({
          label: 'Phone',
          type: 'tel'
        })
      ])
    );
  });

  test('ignores generic helper controls and prefers outer prompt labels for file widgets', async () => {
    await startServer({
      '/greenhouse-quality': `
        <html>
          <body>
            <section id="application">
              <div class="field">
                <span id="country_prompt">Country*</span>
                <div class="widget">
                  <div id="country" role="combobox" aria-labelledby="country_prompt"></div>
                  <input type="text" required placeholder="text" />
                </div>
              </div>

              <div class="field">
                <input type="file" />
                <label for="resume">Resume</label>
                <label>
                  <input id="resume" type="file" />
                  Attach
                </label>
              </div>

              <div class="field">
                <span>Cover Letter</span>
                <label>
                  <input id="cover_letter" type="file" />
                  Attach
                </label>
              </div>
            </section>
          </body>
        </html>
      `
    });

    const fields = await withPage(async (page) => {
      await page.goto(`${baseUrl}/greenhouse-quality`, { waitUntil: 'domcontentloaded' });
      const boardEntry = await reachApplicationForm({ page, board: 'greenhouse' });
      return scrapeApplicationFields({ page, boardEntry });
    });

    expect(fields.map((field) => field.label)).toEqual(['Country*', 'Resume', 'Cover Letter']);
    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Country*',
          type: 'combobox'
        }),
        expect.objectContaining({
          label: 'Resume',
          type: 'file',
          selectorCandidates: ['#resume'],
          specialHandling: 'file_upload'
        }),
        expect.objectContaining({
          label: 'Cover Letter',
          type: 'file',
          selectorCandidates: ['#cover_letter'],
          specialHandling: 'file_upload'
        })
      ])
    );
  });

  test('uses shared question labels for grouped choices instead of the first option label', async () => {
    await startServer({
      '/group-quality': `
        <html>
          <body>
            <section id="application">
              <div role="group" aria-labelledby="pronouns_question">
                <div id="pronouns_question">Pronouns</div>
                <label>
                  <input type="checkbox" name="pronouns" value="he_him" />
                  He/him
                </label>
                <label>
                  <input type="checkbox" name="pronouns" value="custom" />
                  Custom
                </label>
              </div>

              <div role="radiogroup" aria-labelledby="source_question">
                <div id="source_question">How did you hear about us?</div>
                <label>
                  <input type="radio" name="source" value="linkedin" />
                  LinkedIn
                </label>
                <label>
                  <input type="radio" name="source" value="glassdoor" />
                  Glassdoor
                </label>
              </div>
            </section>
          </body>
        </html>
      `
    });

    const fields = await withPage(async (page) => {
      await page.goto(`${baseUrl}/group-quality`, { waitUntil: 'domcontentloaded' });
      const boardEntry = await reachApplicationForm({ page, board: 'greenhouse' });
      return scrapeApplicationFields({ page, boardEntry });
    });

    expect(fields).toEqual([
      {
        id: 'pronouns',
        label: 'Pronouns',
        type: 'checkbox_group',
        required: false,
        visible: true,
        enabled: true,
        selectorCandidates: ['[name="pronouns"]'],
        options: [
          { value: 'he_him', label: 'He/him' },
          { value: 'custom', label: 'Custom' }
        ]
      },
      {
        id: 'source',
        label: 'How did you hear about us?',
        type: 'radio_group',
        required: false,
        visible: true,
        enabled: true,
        selectorCandidates: ['[name="source"]'],
        options: [
          { value: 'linkedin', label: 'LinkedIn' },
          { value: 'glassdoor', label: 'Glassdoor' }
        ]
      }
    ]);
  });

  test('reads wrapped select labels without polluting them with option text', async () => {
    await startServer({
      '/wrapped-select': `
        <html>
          <body>
            <section id="application" class="application">
              <label for="first_name">First Name</label>
              <input id="first_name" />
              <label>
                <div class="application-question">
                  <div class="application-label">What is your location?</div>
                  <div class="application-dropdown">
                    <select data-qa="candidate-location-select">
                      <option value="">Select...</option>
                      <option value="ca">Canada</option>
                      <option value="us">United States</option>
                    </select>
                  </div>
                </div>
              </label>
            </section>
          </body>
        </html>
      `
    });

    const fields = await withPage(async (page) => {
      await page.goto(`${baseUrl}/wrapped-select`, { waitUntil: 'domcontentloaded' });
      const boardEntry = await reachApplicationForm({ page, board: 'greenhouse' });
      return scrapeApplicationFields({ page, boardEntry });
    });

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'What is your location?',
          type: 'select',
          selectorCandidates: ['[data-qa="candidate-location-select"]']
        })
      ])
    );
  });

  test('prefers ancestor upload prompt labels over generic attach controls', async () => {
    await startServer({
      '/greenhouse-upload-ancestor': `
        <html>
          <body>
            <section id="application" class="application">
              <label for="first_name">First Name</label>
              <input id="first_name" />
              <div class="file-upload">
                <div class="file-upload__wrapper">
                  <div id="upload-label-resume" class="label upload-label">Resume/CV*</div>
                  <div class="button-container">
                    <div class="secondary-button">
                      <div>
                        <button type="button">Attach</button>
                        <label class="visually-hidden" for="resume">Attach</label>
                        <input id="resume" class="visually-hidden" type="file" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </body>
        </html>
      `
    });

    const fields = await withPage(async (page) => {
      await page.goto(`${baseUrl}/greenhouse-upload-ancestor`, { waitUntil: 'domcontentloaded' });
      const boardEntry = await reachApplicationForm({ page, board: 'greenhouse' });
      return scrapeApplicationFields({ page, boardEntry });
    });

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Resume/CV*',
          type: 'file',
          selectorCandidates: ['#resume'],
          specialHandling: 'file_upload'
        })
      ])
    );
  });

  test('groups container-based checkbox sets even when options do not share the same name', async () => {
    await startServer({
      '/container-checkbox-group': `
        <html>
          <body>
            <section id="application">
              <li class="application-question">
                <div class="application-label multiple-select">Pronouns</div>
                <div class="application-field">
                  <ul id="candidatePronounsCheckboxes">
                    <div class="column-wrapper">
                      <div class="table-row">
                        <li class="column">
                          <label>
                            <input type="checkbox" name="pronouns" value="he_him" />
                            He/him
                          </label>
                        </li>
                        <li class="column">
                          <label>
                            <input type="checkbox" name="pronouns" value="she_her" />
                            She/her
                          </label>
                        </li>
                      </div>
                    </div>
                    <hr />
                    <li>
                      <label>
                        <input id="customPronounsOption" type="checkbox" value="custom" />
                        Custom
                      </label>
                    </li>
                  </ul>
                </div>
              </li>
            </section>
          </body>
        </html>
      `
    });

    const fields = await withPage(async (page) => {
      await page.goto(`${baseUrl}/container-checkbox-group`, { waitUntil: 'domcontentloaded' });
      const boardEntry = await reachApplicationForm({ page, board: 'greenhouse' });
      return scrapeApplicationFields({ page, boardEntry });
    });

    expect(fields).toEqual([
      {
        id: 'pronouns',
        label: 'Pronouns',
        type: 'checkbox_group',
        required: false,
        visible: true,
        enabled: true,
        selectorCandidates: expect.arrayContaining(['[name="pronouns"]', '#customPronounsOption']),
        options: [
          { value: 'he_him', label: 'He/him' },
          { value: 'she_her', label: 'She/her' },
          { value: 'custom', label: 'Custom' }
        ]
      }
    ]);
  });

  test('prefers the question title inside grouped fieldsets over option text or section headers', async () => {
    await startServer({
      '/fieldset-question-title': `
        <html>
          <body>
            <section id="application">
              <div class="ashby-application-form-section-header">
                U.S. EQUAL EMPLOYMENT OPPORTUNITY INFORMATION ...
              </div>
              <fieldset class="_fieldEntry_17tft_29">
                <label class="ashby-application-form-question-title">Gender</label>
                <div class="ashby-application-form-question-description">Input gender</div>
                <div class="_option_1v5e2_35 false">
                  <span>
                    <input type="radio" name="eeoc_gender" value="male" />
                  </span>
                  Male
                </div>
                <div class="_option_1v5e2_35 false">
                  <span>
                    <input type="radio" name="eeoc_gender" value="female" />
                  </span>
                  Female
                </div>
              </fieldset>
            </section>
          </body>
        </html>
      `
    });

    const fields = await withPage(async (page) => {
      await page.goto(`${baseUrl}/fieldset-question-title`, { waitUntil: 'domcontentloaded' });
      const boardEntry = await reachApplicationForm({ page, board: 'greenhouse' });
      return scrapeApplicationFields({ page, boardEntry });
    });

    expect(fields).toEqual([
      {
        id: 'eeoc_gender',
        label: 'Gender',
        type: 'radio_group',
        required: false,
        visible: true,
        enabled: true,
        selectorCandidates: ['[name="eeoc_gender"]'],
        options: [
          { value: 'male', label: 'Male' },
          { value: 'female', label: 'Female' }
        ]
      }
    ]);
  });

  test('prefers prompt text inside wrapped labels over helper and status content', async () => {
    await startServer({
      '/wrapped-label-prompts': `
        <html>
          <body>
            <section id="application">
              <label>
                <div class="application-label">Resume/CV *</div>
                <div class="application-field">
                  <a>
                    <input id="resume-upload-input" type="file" name="resume" />
                    ATTACH RESUME/CV
                  </a>
                  <div>Couldn't auto-read resume.</div>
                  <div>Analyzing resume...</div>
                  <div>Success!</div>
                </div>
              </label>

              <label>
                <div class="application-label">Current location *</div>
                <div class="application-field">
                  <input id="location-input" type="text" name="location" />
                  <div>No location found. Try entering a different location</div>
                  <div>Loading</div>
                </div>
              </label>
            </section>
          </body>
        </html>
      `
    });

    const fields = await withPage(async (page) => {
      await page.goto(`${baseUrl}/wrapped-label-prompts`, { waitUntil: 'domcontentloaded' });
      const boardEntry = await reachApplicationForm({ page, board: 'lever' });
      return scrapeApplicationFields({ page, boardEntry });
    });

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'resume',
          label: 'Resume/CV *',
          type: 'file'
        }),
        expect.objectContaining({
          id: 'location',
          label: 'Current location *',
          type: 'text'
        })
      ])
    );
  });

  test('ignores nameless autofill upload helpers when a real resume upload field exists', async () => {
    await startServer({
      '/autofill-upload-helper': `
        <html>
          <body>
            <section id="application">
              <div id="form" role="tabpanel">
                <div role="presentation">
                  Autofill from resume
                  <input type="file" />
                </div>

                <label for="_systemfield_resume">Resume</label>
                <input id="_systemfield_resume" type="file" name="_systemfield_resume" />
              </div>
            </section>
          </body>
        </html>
      `
    });

    const fields = await withPage(async (page) => {
      await page.goto(`${baseUrl}/autofill-upload-helper`, { waitUntil: 'domcontentloaded' });
      const boardEntry = await reachApplicationForm({ page, board: 'ashby' });
      return scrapeApplicationFields({ page, boardEntry });
    });

    expect(fields).toEqual([
      expect.objectContaining({
        id: '_systemfield_resume',
        label: 'Resume',
        type: 'file'
      })
    ]);
  });

  test('does not merge separate radio fieldsets inside the same section', async () => {
    await startServer({
      '/separate-radio-fieldsets': `
        <html>
          <body>
            <section id="application">
              <div class="ashby-survey-form-container">
                <div class="ashby-application-form-section-container">
                  <div>U.S. EQUAL EMPLOYMENT OPPORTUNITY INFORMATION</div>

                  <fieldset>
                    <div>Gender</div>
                    <div>Input gender</div>
                    <label>
                      <input type="radio" name="eeoc_gender" value="male" />
                      Male
                    </label>
                    <label>
                      <input type="radio" name="eeoc_gender" value="female" />
                      Female
                    </label>
                  </fieldset>

                  <fieldset>
                    <div>Race</div>
                    <label>
                      <input type="radio" name="eeoc_race" value="hispanic" />
                      Hispanic or Latino
                    </label>
                    <label>
                      <input type="radio" name="eeoc_race" value="white" />
                      White
                    </label>
                  </fieldset>

                  <fieldset>
                    <div>Veteran Status</div>
                    <label>
                      <input type="radio" name="eeoc_veteran_status" value="protected" />
                      Protected veteran
                    </label>
                    <label>
                      <input type="radio" name="eeoc_veteran_status" value="not_protected" />
                      Not a protected veteran
                    </label>
                  </fieldset>
                </div>
              </div>
            </section>
          </body>
        </html>
      `
    });

    const fields = await withPage(async (page) => {
      await page.goto(`${baseUrl}/separate-radio-fieldsets`, { waitUntil: 'domcontentloaded' });
      const boardEntry = await reachApplicationForm({ page, board: 'ashby' });
      return scrapeApplicationFields({ page, boardEntry });
    });

    expect(fields).toEqual([
      expect.objectContaining({
        id: 'eeoc_gender',
        label: 'Gender',
        type: 'radio_group'
      }),
      expect.objectContaining({
        id: 'eeoc_race',
        label: 'Race',
        type: 'radio_group'
      }),
      expect.objectContaining({
        id: 'eeoc_veteran_status',
        label: 'Veteran Status',
        type: 'radio_group'
      })
    ]);
  });
});

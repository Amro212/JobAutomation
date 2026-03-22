import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import {
  ApplicantProfileRepository,
  ArtifactsRepository,
  JobsRepository,
  createDatabaseClient,
  migrateDatabase
} from '../../../packages/db/src/index';

const playwrightDatabasePath = 'C:\\VScode\\JobAutomation\\apps\\api\\data\\playwright.sqlite';
const seedArtifactsDir = 'C:\\VScode\\JobAutomation\\apps\\api\\data\\seed-artifacts';

test('starts a Greenhouse application run from the job page and shows persisted run evidence', async ({
  page
}) => {
  const server = createServer((request, response) => {
    const url = request.url ?? '/';

    if (url === '/jobs/senior-platform-engineer') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(`
        <html>
          <body>
            <main data-greenhouse-job-page>
              <h1>Senior Platform Engineer</h1>
              <button id="apply_button" type="button">Apply</button>
              <section id="application_shell" hidden>
                <h2>Apply for this job</h2>
                <label for="first_name">First Name</label>
                <input id="first_name" aria-label="First Name" required />
                <label for="last_name">Last Name</label>
                <input id="last_name" aria-label="Last Name" required />
                <label for="email">Email</label>
                <input id="email" aria-label="Email" required />
                <label id="country-label" for="country">Country</label>
                <input id="country" role="combobox" aria-labelledby="country-label" aria-required="true" required />
                <label for="phone">Phone</label>
                <input id="phone" aria-label="Phone" required />
                <label for="resume">Resume/CV</label>
                <input id="resume" type="file" />
                <div>
                  <label id="question_work_auth-label" for="question_work_auth">U.S. WORK AUTHORIZATION*</label>
                  <input
                    id="question_work_auth"
                    role="combobox"
                    aria-labelledby="question_work_auth-label"
                    aria-required="true"
                    required
                  />
                </div>
                <button type="submit">Submit application</button>
              </section>
              <script>
                document.getElementById('apply_button').addEventListener('click', () => {
                  const shell = document.getElementById('application_shell');
                  shell.hidden = false;
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
    server.listen(3202, '127.0.0.1', (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  try {
    await expect
      .poll(async () => {
        const response = await page.request.get('http://127.0.0.1:3201/health');
        return response.ok();
      })
      .toBe(true);

    mkdirSync(seedArtifactsDir, { recursive: true });
    const db = createDatabaseClient(playwrightDatabasePath);
    await migrateDatabase(db);

    const applicantProfileRepository = new ApplicantProfileRepository(db);
    const jobsRepository = new JobsRepository(db);
    const artifactsRepository = new ArtifactsRepository(db);

    const profile = await applicantProfileRepository.save({
      id: 'default',
      fullName: 'Casey Ng',
      email: 'casey@example.com',
      phone: '+1 555 010 0101',
      location: 'Toronto, ON, Canada',
      summary: 'Automation engineer',
      reusableContext: 'Prefers inspectable browser runs.',
      linkedinUrl: 'https://www.linkedin.com/in/casey-ng',
      websiteUrl: 'https://example.com',
      baseResumeFileName: 'resume.tex',
      baseResumeTex: '\\section{Experience}',
      preferredCountries: ['CA']
    });

    const job = await jobsRepository.upsert({
      sourceKind: 'greenhouse',
      sourceId: `job-${randomUUID()}`,
      sourceUrl: 'http://127.0.0.1:3202/jobs/senior-platform-engineer',
      companyName: 'Acme Corp',
      title: 'Senior Platform Engineer',
      location: 'Toronto, ON, Canada',
      remoteType: 'remote',
      employmentType: 'full-time',
      compensationText: null,
      descriptionText: 'Build inspectable application automation.',
      rawPayload: JSON.stringify({ id: 'job-1' }),
      discoveryRunId: null,
      status: 'shortlisted',
      discoveredAt: new Date('2026-03-21T10:00:00.000Z'),
      updatedAt: new Date('2026-03-21T10:00:00.000Z')
    });

    const resumePath = join(seedArtifactsDir, `${job.id}-resume.pdf`);
    writeFileSync(resumePath, Buffer.from('%PDF-1.4\n% dashboard application-run test resume\n'));

    await artifactsRepository.create({
      jobId: job.id,
      applicationRunId: null,
      discoveryRunId: null,
      applicantProfileId: profile.id,
      applicantProfileUpdatedAt: profile.updatedAt,
      kind: 'resume-variant',
      format: 'pdf',
      fileName: 'resume.pdf',
      storagePath: resumePath,
      version: 1,
      createdAt: new Date('2026-03-21T10:05:00.000Z')
    });

    await page.goto(`/jobs/${job.id}`);
    await expect(page.getByRole('heading', { name: 'Senior Platform Engineer' })).toBeVisible();
    await page.getByRole('button', { name: 'Start application run' }).click();

    await expect(page).toHaveURL(/\/applications\/.+$/, { timeout: 30000 });
    await expect(page.getByRole('heading', { name: 'Senior Platform Engineer' })).toBeVisible();
    await expect(page.getByText('Paused at final review and waiting for a human to submit.')).toBeVisible();
    await expect(page.getByText('Stop reason: manual_review_required')).toBeVisible();
    await expect(page.getByText('Manual review fields: U.S. WORK AUTHORIZATION')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open job posting URL' })).toBeVisible();
    await expect(
      page.getByText(
        'Greenhouse required field needs manual review because applicant data is unavailable: U.S. WORK AUTHORIZATION.'
      )
    ).toBeVisible();
    await expect(page.getByText('U.S. WORK AUTHORIZATION - blocked_missing_profile_data')).toBeVisible();
    await expect(page.getByText('Paused before final submit.')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'application-screenshot' }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'application-trace' }).first()).toBeVisible();

    const pausedRunId = page.url().split('/').pop();
    if (!pausedRunId) {
      throw new Error('Expected paused application run id in URL.');
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
});

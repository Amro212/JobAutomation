import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import {
  ApplicationRunsRepository,
  ApplicantProfileRepository,
  ArtifactsRepository,
  JobsRepository,
  LogEventsRepository,
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
    const applicationRunsRepository = new ApplicationRunsRepository(db);
    const artifactsRepository = new ArtifactsRepository(db);
    const logEventsRepository = new LogEventsRepository(db);

    const profile = await applicantProfileRepository.save({
      id: 'default',
      fullName: 'Casey Ng',
      email: 'casey@example.com',
      phone: '+1 555 010 0101',
      location: 'Toronto, ON',
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
    await expect(page.getByRole('link', { name: 'Open final review URL' })).toBeVisible();
    await expect(page.getByText('Paused before final submit.')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'application-screenshot' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'application-trace' })).toBeVisible();

    const pausedRunId = page.url().split('/').pop();
    if (!pausedRunId) {
      throw new Error('Expected paused application run id in URL.');
    }

    const skippedJob = await jobsRepository.upsert({
      sourceKind: 'greenhouse',
      sourceId: `job-${randomUUID()}`,
      sourceUrl: 'http://127.0.0.1:3202/jobs/senior-platform-engineer',
      companyName: 'Acme Corp',
      title: 'Skipped Platform Engineer',
      location: 'Berlin, Germany',
      remoteType: 'remote',
      employmentType: 'full-time',
      compensationText: null,
      descriptionText: 'This job should appear as skipped.',
      rawPayload: JSON.stringify({ id: 'job-2' }),
      discoveryRunId: null,
      status: 'reviewing',
      discoveredAt: new Date('2026-03-21T10:10:00.000Z'),
      updatedAt: new Date('2026-03-21T10:10:00.000Z')
    });

    const skippedRun = await applicationRunsRepository.create({
      jobId: skippedJob.id,
      siteKey: 'greenhouse',
      status: 'skipped',
      currentStep: 'prefilter_rejected',
      stopReason: 'prefilter_rejected',
      prefilterReasons: ['location'],
      createdAt: new Date('2026-03-21T10:11:00.000Z'),
      completedAt: new Date('2026-03-21T10:11:30.000Z'),
      updatedAt: new Date('2026-03-21T10:11:30.000Z')
    });
    await logEventsRepository.create({
      applicationRunId: skippedRun.id,
      jobId: skippedJob.id,
      level: 'warn',
      message: 'Skipped application run after applicant prefilter rejection.',
      detailsJson: JSON.stringify({
        applicationRunId: skippedRun.id,
        step: 'prefilter',
        prefilterReasons: ['location']
      })
    });

    await page.goto('/applications');
    await expect(page.getByRole('heading', { name: 'Application run history' })).toBeVisible();
    await expect(page.getByText('Paused before submit for manual review.')).toBeVisible();
    await expect(page.getByText('Prefilter: location')).toBeVisible();
    await expect(page.getByRole('row', { name: /Senior Platform Engineer/i })).toContainText('paused');
    await expect(page.getByRole('row', { name: /Skipped Platform Engineer/i })).toContainText('skipped');

    await page
      .getByRole('row', { name: /Senior Platform Engineer/i })
      .getByRole('link', { name: 'Open run' })
      .click();

    await expect(page).toHaveURL(new RegExp(`/applications/${pausedRunId}$`));
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

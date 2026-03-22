import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';

import { buildApp } from '../../../apps/api/src/app';

function createTestDatabasePath(): string {
  const path = fileURLToPath(
    new URL(`../../../data/test/${randomUUID()}.sqlite`, import.meta.url)
  );
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

describe('application run routes', () => {
  const originalDbPath = process.env.JOB_AUTOMATION_DB_PATH;
  const dbPath = createTestDatabasePath();
  const resumePath = fileURLToPath(
    new URL(`../../../data/test/${randomUUID()}-resume.pdf`, import.meta.url)
  );

  process.env.JOB_AUTOMATION_DB_PATH = dbPath;

  const app = buildApp();

  let server: ReturnType<typeof createServer> | null = null;
  let sourceUrl = '';

  beforeAll(async () => {
    await app.ready();
  });

  afterEach(async () => {
    if (server) {
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

    server = null;
  });

  afterAll(async () => {
    await app.close();
    process.env.JOB_AUTOMATION_DB_PATH = originalDbPath;

    try {
      rmSync(resumePath, { force: true });
      rmSync(dbPath, { force: true });
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EBUSY') {
        throw error;
      }
    }
  });

  test(
    'runs the Greenhouse apply flow to final review, pauses before submit, and exposes persisted evidence',
    async () => {
      writeFileSync(resumePath, Buffer.from('%PDF-1.4\n% api application-run test resume\n'));

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
            reject(new Error('Application stub address was not available.'));
            return;
          }

          sourceUrl = `http://127.0.0.1:${address.port}/jobs/senior-platform-engineer`;
          resolve();
        });
      });

      const profile = await app.repositories.applicantProfile.save({
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

      const job = await app.repositories.jobs.upsert({
        sourceKind: 'greenhouse',
        sourceId: `job-${randomUUID()}`,
        sourceUrl,
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

      const resumeArtifact = await app.repositories.artifacts.create({
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

      const createResponse = await app.inject({
        method: 'POST',
        url: '/application-runs',
        payload: {
          jobId: job.id
        }
      });

      expect(createResponse.statusCode).toBe(200);
      expect(createResponse.json().run).toMatchObject({
        jobId: job.id,
        siteKey: 'greenhouse',
        status: 'paused',
        currentStep: 'final_review',
        stopReason: 'manual_review_required',
        reviewUrl: expect.stringContaining('/review'),
        resumeArtifactId: resumeArtifact.id
      });

      const runId = createResponse.json().run.id as string;

      const listResponse = await app.inject({
        method: 'GET',
        url: '/application-runs'
      });
      const detailResponse = await app.inject({
        method: 'GET',
        url: `/application-runs/${runId}`
      });

      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.json().runs).toEqual([
        expect.objectContaining({
          run: expect.objectContaining({
            id: runId,
            status: 'paused',
            stopReason: 'manual_review_required'
          }),
          job: expect.objectContaining({
            id: job.id,
            title: 'Senior Platform Engineer',
            companyName: 'Acme Corp'
          })
        })
      ]);

      expect(detailResponse.statusCode).toBe(200);
      expect(detailResponse.json().run).toMatchObject({
        id: runId,
        status: 'paused',
        currentStep: 'final_review',
        stopReason: 'manual_review_required'
      });
      expect(detailResponse.json().logs.map((log: { message: string }) => log.message)).toEqual([
        'Started application run.',
        'Opened Greenhouse source posting.',
        'Filled first name.',
        'Filled last name.',
        'Filled email.',
        'Filled phone.',
        'Uploaded resume artifact.',
        'Reached final review and stopping before submit.',
        'Paused before final submit.'
      ]);
      expect(detailResponse.json().artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            applicationRunId: runId,
            kind: 'application-screenshot',
            format: 'png'
          }),
          expect.objectContaining({
            applicationRunId: runId,
            kind: 'application-trace',
            format: 'zip'
          })
        ])
      );

      for (const artifact of detailResponse.json().artifacts as Array<{ storagePath: string }>) {
        expect(existsSync(artifact.storagePath)).toBe(true);
      }
    },
    30000
  );
});

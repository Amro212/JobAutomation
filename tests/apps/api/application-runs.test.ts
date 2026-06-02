import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
  const originalApplicationBrowserHeaded =
    process.env.JOBAUTOMATION_APPLICATION_BROWSER_HEADED;
  const dbPath = createTestDatabasePath();
  const resumePath = fileURLToPath(
    new URL(`../../../data/test/${randomUUID()}-resume.pdf`, import.meta.url)
  );
  const coverLetterOnlyPath = fileURLToPath(
    new URL(`../../../data/test/${randomUUID()}-cover-letter.pdf`, import.meta.url)
  );

  process.env.JOB_AUTOMATION_DB_PATH = dbPath;
  process.env.JOBAUTOMATION_APPLICATION_BROWSER_HEADED = '0';

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
    process.env.JOBAUTOMATION_APPLICATION_BROWSER_HEADED =
      originalApplicationBrowserHeaded;

    try {
      rmSync(resumePath, { force: true });
      rmSync(coverLetterOnlyPath, { force: true });
      rmSync(dbPath, { force: true });
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        error.code !== 'EBUSY'
      ) {
        throw error;
      }
    }
  });

  test('scrapes the Greenhouse application form fields and pauses for Stage 3 review', async () => {
    writeFileSync(
      resumePath,
      Buffer.from('%PDF-1.4\n% api application-run test resume\n')
    );

    server = createServer((request, response) => {
      const url = request.url ?? '/';

      if (url === '/jobs/senior-platform-engineer') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end(`
            <html>
              <body>
                <main data-greenhouse-job-page>
                  <h1>Senior Platform Engineer</h1>
                  <section id="application_shell">
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
                    <input id="resume" type="file" /
                  </section>
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
      location: 'Toronto, ON, Canada',
      summary: 'Automation engineer',
      reusableContext: 'Prefers inspectable browser runs.',
      linkedinUrl: 'https://www.linkedin.com/in/casey-ng',
      websiteUrl: 'https://example.com',
      baseResumeFileName: 'resume.tex',
      baseResumeTex: '\\section{Experience}',
      preferredCountries: ['CA'],
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
      updatedAt: new Date('2026-03-21T10:00:00.000Z'),
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
      createdAt: new Date('2026-03-21T10:05:00.000Z'),
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/application-runs',
      payload: {
        jobId: job.id,
      },
    });

    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json().run).toMatchObject({
      jobId: job.id,
      siteKey: 'greenhouse',
      status: 'paused',
      currentStep: 'fields_scraped_ready',
      stopReason: 'manual_review_required',
      reviewUrl: sourceUrl,
      resumeArtifactId: resumeArtifact.id,
    });

    const runId = createResponse.json().run.id as string;

    const listResponse = await app.inject({
      method: 'GET',
      url: '/application-runs',
    });
    const detailResponse = await app.inject({
      method: 'GET',
      url: `/application-runs/${runId}`,
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().runs).toEqual([
      expect.objectContaining({
        run: expect.objectContaining({
          id: runId,
          status: 'paused',
          stopReason: 'manual_review_required',
        }),
        job: expect.objectContaining({
          id: job.id,
          title: 'Senior Platform Engineer',
          companyName: 'Acme Corp',
        }),
        resumeArtifact: expect.objectContaining({
          id: resumeArtifact.id,
          kind: 'resume-variant',
          format: 'pdf',
        }),
        coverLetterArtifact: null,
      }),
    ]);

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json().run).toMatchObject({
      id: runId,
      status: 'paused',
      currentStep: 'fields_scraped_ready',
      stopReason: 'manual_review_required',
      reviewUrl: sourceUrl,
    });
    expect(detailResponse.json().resumeArtifact).toMatchObject({
      id: resumeArtifact.id,
      kind: 'resume-variant',
      format: 'pdf',
    });
    expect(detailResponse.json().coverLetterArtifact).toBeNull();
    expect(
      detailResponse.json().logs.map((log: { message: string }) => log.message)
    ).toEqual(
      expect.arrayContaining([
        'Started application run.',
        'Scraped the visible Greenhouse application fields and stopped for Stage 3 review.',
        'Paused after scraping the visible Greenhouse application fields for Stage 3 review.',
      ])
    );
    const pauseLog = detailResponse
      .json()
      .logs.find(
        (log: { level: string; message: string }) =>
          log.level === 'info' &&
          log.message ===
            'Paused after scraping the visible Greenhouse application fields for Stage 3 review.'
      );
    expect(pauseLog).toBeDefined();
    expect(pauseLog.detailsJson).toContain('"entryAction":"direct_form"');
    expect(pauseLog.detailsJson).toContain('"scrapedFieldCount"');
    expect(pauseLog.detailsJson).toContain('"detailsArtifactId"');
    expect(pauseLog.detailsJson).not.toContain('"label":"First Name"');
    expect(detailResponse.json().artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'application-screenshot' }),
        expect.objectContaining({ kind: 'application-trace' }),
        expect.objectContaining({ kind: 'application-evidence-json' }),
      ])
    );
  }, 60000);

  test('rejects starting an application run before job artifacts are generated', async () => {
    const job = await app.repositories.jobs.upsert({
      sourceKind: 'greenhouse',
      sourceId: `job-${randomUUID()}`,
      sourceUrl: 'https://boards.greenhouse.io/example/jobs/no-artifacts',
      companyName: 'Acme Corp',
      title: 'Platform Engineer',
      location: 'Toronto, ON, Canada',
      remoteType: 'remote',
      employmentType: 'full-time',
      compensationText: null,
      descriptionText: 'Build inspectable application automation.',
      rawPayload: JSON.stringify({ id: 'job-no-artifacts' }),
      discoveryRunId: null,
      status: 'shortlisted',
      discoveredAt: new Date('2026-04-21T10:00:00.000Z'),
      updatedAt: new Date('2026-04-21T10:00:00.000Z'),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/application-runs',
      payload: {
        jobId: job.id,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      message:
        'Generate tailored artifacts before starting an application run.',
    });
  });

  test('rejects starting an application run when only a cover letter pdf exists', async () => {
    writeFileSync(
      coverLetterOnlyPath,
      Buffer.from('%PDF-1.4\n% cover letter only\n')
    );

    await app.repositories.applicantProfile.save({
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
      preferredCountries: ['CA'],
    });

    const job = await app.repositories.jobs.upsert({
      sourceKind: 'greenhouse',
      sourceId: `job-${randomUUID()}`,
      sourceUrl: 'https://boards.greenhouse.io/example/jobs/cover-letter-only',
      companyName: 'Acme Corp',
      title: 'Platform Engineer',
      location: 'New York, NY, USA',
      remoteType: 'remote',
      employmentType: 'full-time',
      compensationText: null,
      descriptionText: 'Build inspectable application automation.',
      rawPayload: JSON.stringify({ id: 'job-cover-letter-only' }),
      discoveryRunId: null,
      status: 'shortlisted',
      discoveredAt: new Date('2026-04-21T10:00:00.000Z'),
      updatedAt: new Date('2026-04-21T10:00:00.000Z'),
    });

    await app.repositories.artifacts.create({
      jobId: job.id,
      applicationRunId: null,
      discoveryRunId: null,
      applicantProfileId: null,
      applicantProfileUpdatedAt: null,
      kind: 'cover-letter',
      format: 'pdf',
      fileName: 'cover-letter.pdf',
      storagePath: coverLetterOnlyPath,
      version: 1,
      createdAt: new Date('2026-04-21T10:05:00.000Z'),
    });

    const originalStrict = process.env.JOBAUTOMATION_AUTHORIZED_DOMAIN_STRICT;
    const originalAllowlist =
      process.env.JOBAUTOMATION_AUTHORIZED_DOMAIN_ALLOWLIST;
    process.env.JOBAUTOMATION_AUTHORIZED_DOMAIN_STRICT = '1';
    process.env.JOBAUTOMATION_AUTHORIZED_DOMAIN_ALLOWLIST = 'example.com';

    let response;
    try {
      response = await app.inject({
        method: 'POST',
        url: '/application-runs',
        payload: {
          jobId: job.id,
        },
      });
    } finally {
      if (originalStrict === undefined) {
        delete process.env.JOBAUTOMATION_AUTHORIZED_DOMAIN_STRICT;
      } else {
        process.env.JOBAUTOMATION_AUTHORIZED_DOMAIN_STRICT = originalStrict;
      }

      if (originalAllowlist === undefined) {
        delete process.env.JOBAUTOMATION_AUTHORIZED_DOMAIN_ALLOWLIST;
      } else {
        process.env.JOBAUTOMATION_AUTHORIZED_DOMAIN_ALLOWLIST =
          originalAllowlist;
      }
    }

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      message:
        'Generate tailored artifacts before starting an application run.',
    });
  });
});

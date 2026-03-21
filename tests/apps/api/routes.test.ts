import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, test } from 'vitest';

import { buildApp } from '../../../apps/api/src/app';

function createTestDatabasePath(): string {
  const path = fileURLToPath(
    new URL(`../../../data/test/${randomUUID()}.sqlite`, import.meta.url)
  );
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

describe('API routes', () => {
  const originalTectonicCommand = process.env.JOB_AUTOMATION_TECTONIC_COMMAND;
  const originalTectonicArgs = process.env.JOB_AUTOMATION_TECTONIC_ARGS_JSON;
  const originalDbPath = process.env.JOB_AUTOMATION_DB_PATH;
  const dbPath = createTestDatabasePath();
  process.env.JOB_AUTOMATION_DB_PATH = dbPath;
  process.env.JOB_AUTOMATION_TECTONIC_COMMAND = 'node';
  process.env.JOB_AUTOMATION_TECTONIC_ARGS_JSON = JSON.stringify([
    fileURLToPath(new URL('../../fixtures/documents/tectonic-stub.mjs', import.meta.url))
  ]);
  const app = buildApp();

  afterAll(async () => {
    await app.close();
    process.env.JOB_AUTOMATION_DB_PATH = originalDbPath;
    process.env.JOB_AUTOMATION_TECTONIC_COMMAND = originalTectonicCommand;
    process.env.JOB_AUTOMATION_TECTONIC_ARGS_JSON = originalTectonicArgs;

    try {
      rmSync(dbPath, { force: true });
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EBUSY') {
        throw error;
      }
    }
  });

  test('returns typed empty-state collections', async () => {
    const jobsResponse = await app.inject({ method: 'GET', url: '/jobs' });
    const runsResponse = await app.inject({ method: 'GET', url: '/discovery-runs' });
    const profileResponse = await app.inject({ method: 'GET', url: '/applicant-profile' });

    expect(jobsResponse.statusCode).toBe(200);
    expect(jobsResponse.json()).toEqual({ jobs: [], total: 0 });
    expect(runsResponse.json()).toEqual({ runs: [] });
    expect(profileResponse.json()).toEqual({
      profile: null,
      readiness: {
        hasBaseResume: false,
        hasReusableContext: false,
        readyForTailoring: false
      }
    });
  });

  test('stores and returns the applicant profile setup state', async () => {
    const saveResponse = await app.inject({
      method: 'PUT',
      url: '/applicant-profile',
      payload: {
        id: 'default',
        fullName: 'Taylor Example',
        email: 'taylor@example.com',
        phone: '555-0100',
        location: 'Toronto, ON',
        summary: 'TypeScript engineer',
        reusableContext: 'Builds automation systems.',
        linkedinUrl: 'https://www.linkedin.com/in/taylor-example',
        websiteUrl: 'https://example.com',
        baseResumeFileName: 'resume.tex',
        baseResumeTex: '\\section{Experience}'
      }
    });

    const loadResponse = await app.inject({ method: 'GET', url: '/applicant-profile' });

    expect(saveResponse.statusCode).toBe(200);
    expect(loadResponse.json().profile.baseResumeFileName).toBe('resume.tex');
    expect(loadResponse.json().profile.baseResumeTex).toContain('Experience');
    expect(loadResponse.json().readiness.readyForTailoring).toBe(true);
  });

  test('filters jobs by repeated country query params', async () => {
    const baseJob = {
      sourceKind: 'greenhouse' as const,
      remoteType: 'remote',
      employmentType: 'full-time',
      compensationText: null,
      descriptionText: 'Test',
      rawPayload: null,
      discoveryRunId: null,
      status: 'discovered' as const,
      discoveredAt: new Date('2026-03-13T10:00:00.000Z'),
      updatedAt: new Date('2026-03-13T10:00:00.000Z')
    };

    await app.repositories.jobs.upsert({
      ...baseJob,
      sourceId: 'loc-us',
      sourceUrl: 'https://example.com/loc-us',
      companyName: 'US Corp',
      title: 'US Engineer',
      location: 'California, United States'
    });
    await app.repositories.jobs.upsert({
      ...baseJob,
      sourceId: 'loc-ca',
      sourceUrl: 'https://example.com/loc-ca',
      companyName: 'CA Corp',
      title: 'CA Engineer',
      location: 'Vancouver, British Columbia'
    });
    await app.repositories.jobs.upsert({
      ...baseJob,
      sourceId: 'loc-de',
      sourceUrl: 'https://example.com/loc-de',
      companyName: 'DE GmbH',
      title: 'DE Engineer',
      location: 'Munich, Germany'
    });

    const usResponse = await app.inject({ method: 'GET', url: '/jobs?country=US' });
    expect(usResponse.statusCode).toBe(200);
    const usJobs = usResponse.json().jobs as Array<{ title: string }>;
    expect(usJobs.some((j) => j.title === 'US Engineer')).toBe(true);
    expect(usJobs.some((j) => j.title === 'DE Engineer')).toBe(false);

    const multiResponse = await app.inject({ method: 'GET', url: '/jobs?country=US&country=CA' });
    const multiJobs = multiResponse.json().jobs as Array<{ title: string }>;
    expect(multiJobs.some((j) => j.title === 'US Engineer')).toBe(true);
    expect(multiJobs.some((j) => j.title === 'CA Engineer')).toBe(true);
    expect(multiJobs.some((j) => j.title === 'DE Engineer')).toBe(false);
  });

  test('generates versioned resume and cover letter artifacts for a job', async () => {
    await app.inject({
      method: 'PUT',
      url: '/applicant-profile',
      payload: {
        id: 'default',
        fullName: 'Taylor Example',
        email: 'taylor@example.com',
        phone: '555-0100',
        location: 'Toronto, ON',
        summary: 'TypeScript engineer',
        reusableContext: 'Builds automation systems.',
        linkedinUrl: 'https://www.linkedin.com/in/taylor-example',
        websiteUrl: 'https://example.com',
        baseResumeFileName: 'resume.tex',
        baseResumeTex: String.raw`\documentclass{article}
\begin{document}
\section{Experience}
\begin{itemize}
\item Built TypeScript automation systems.
\end{itemize}
\end{document}`
      }
    });

    const job = await app.repositories.jobs.upsert({
      sourceKind: 'greenhouse',
      sourceId: 'job-123',
      sourceUrl: 'https://boards.greenhouse.io/example/jobs/123',
      companyName: 'Example Corp',
      title: 'Senior Platform Engineer',
      location: 'Remote - Canada',
      remoteType: 'remote',
      employmentType: 'full-time',
      compensationText: '$170k-$190k CAD',
      descriptionText: 'Build the local-first platform automation pipeline.',
      rawPayload: '{"id":"job-123"}',
      discoveryRunId: null,
      status: 'shortlisted',
      discoveredAt: new Date('2026-03-15T09:00:00.000Z'),
      updatedAt: new Date('2026-03-15T09:00:00.000Z')
    });

    const generateResponse = await app.inject({
      method: 'POST',
      url: `/jobs/${job.id}/artifacts`,
      payload: {}
    });
    const loadResponse = await app.inject({
      method: 'GET',
      url: `/jobs/${job.id}/artifacts`
    });

    expect(generateResponse.statusCode).toBe(200);
    expect(generateResponse.json().artifacts).toHaveLength(4);
    expect(loadResponse.json().artifacts).toHaveLength(4);
    expect(loadResponse.json().artifacts[0].version).toBe(1);
    expect(loadResponse.json().artifacts.some((artifact: { kind: string }) => artifact.kind === 'resume-variant')).toBe(true);
    expect(loadResponse.json().artifacts.some((artifact: { kind: string }) => artifact.kind === 'cover-letter')).toBe(true);

    const resumePdf = loadResponse.json().artifacts.find(
      (artifact: { kind: string; format: string }) =>
        artifact.kind === 'resume-variant' && artifact.format === 'pdf'
    );
    expect(resumePdf).toBeTruthy();
    if (resumePdf) {
      const fileResponse = await app.inject({
        method: 'GET',
        url: `/artifacts/${resumePdf.id}/file`
      });

      expect(fileResponse.statusCode).toBe(200);
      expect(fileResponse.headers['content-type']).toContain('application/pdf');
      expect(fileResponse.headers['content-disposition']).toContain('inline');
      expect(fileResponse.headers['content-disposition']).toContain('resume.pdf');
      expect(fileResponse.body.slice(0, 4).toString('utf8')).toBe('%PDF');
    }
  });

  test('can generate only the resume variant when requested', async () => {
    await app.inject({
      method: 'PUT',
      url: '/applicant-profile',
      payload: {
        id: 'default',
        fullName: 'Taylor Example',
        email: 'taylor@example.com',
        phone: '555-0100',
        location: 'Toronto, ON',
        summary: 'TypeScript engineer',
        reusableContext: 'Builds automation systems.',
        linkedinUrl: 'https://www.linkedin.com/in/taylor-example',
        websiteUrl: 'https://example.com',
        baseResumeFileName: 'resume.tex',
        baseResumeTex: String.raw`\documentclass{article}
\begin{document}
\section{Experience}
\begin{itemize}
\item Built TypeScript automation systems.
\end{itemize}
\end{document}`
      }
    });

    const job = await app.repositories.jobs.upsert({
      sourceKind: 'greenhouse',
      sourceId: 'job-456',
      sourceUrl: 'https://boards.greenhouse.io/example/jobs/456',
      companyName: 'Example Corp',
      title: 'Platform Engineer',
      location: 'Remote - Canada',
      remoteType: 'remote',
      employmentType: 'full-time',
      compensationText: '$170k-$190k CAD',
      descriptionText: 'Build the local-first platform automation pipeline.',
      rawPayload: '{"id":"job-456"}',
      discoveryRunId: null,
      status: 'shortlisted',
      discoveredAt: new Date('2026-03-15T09:00:00.000Z'),
      updatedAt: new Date('2026-03-15T09:00:00.000Z')
    });

    const generateResponse = await app.inject({
      method: 'POST',
      url: `/jobs/${job.id}/artifacts`,
      payload: { mode: 'resume' }
    });

    expect(generateResponse.statusCode).toBe(200);
    expect(generateResponse.json().artifacts).toHaveLength(2);
    expect(generateResponse.json().artifacts.every((artifact: { kind: string }) => artifact.kind === 'resume-variant')).toBe(true);
  });
});

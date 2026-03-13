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
  const originalDbPath = process.env.JOB_AUTOMATION_DB_PATH;
  const dbPath = createTestDatabasePath();
  process.env.JOB_AUTOMATION_DB_PATH = dbPath;
  const app = buildApp();

  afterAll(async () => {
    await app.close();
    process.env.JOB_AUTOMATION_DB_PATH = originalDbPath;

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
    expect(jobsResponse.json()).toEqual({ jobs: [] });
    expect(runsResponse.json()).toEqual({ runs: [] });
    expect(profileResponse.json()).toEqual({ profile: null });
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
  });
});

import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import { buildApp } from '../../../apps/api/src/app';

function createTestDatabasePath(): string {
  const path = fileURLToPath(
    new URL(`../../../data/test/${randomUUID()}.sqlite`, import.meta.url)
  );
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

describe('autopilot run routes', () => {
  const originalDbPath = process.env.JOB_AUTOMATION_DB_PATH;
  const originalTectonicCommand = process.env.JOB_AUTOMATION_TECTONIC_COMMAND;
  const originalTectonicArgs = process.env.JOB_AUTOMATION_TECTONIC_ARGS_JSON;
  const dbPath = createTestDatabasePath();

  process.env.JOB_AUTOMATION_DB_PATH = dbPath;
  process.env.JOB_AUTOMATION_TECTONIC_COMMAND = 'node';
  process.env.JOB_AUTOMATION_TECTONIC_ARGS_JSON = JSON.stringify([
    fileURLToPath(new URL('../../fixtures/documents/tectonic-stub.mjs', import.meta.url))
  ]);

  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

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

  test('returns an empty autopilot run list before any launches', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/autopilot-runs'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ runs: [] });
  });

  test('rejects launch when setup is not ready', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/autopilot-runs'
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      message:
        'Save the canonical LaTeX resume and reusable applicant context before launching autopilot.'
    });
  });

  test('rejects launch when no enabled discovery sources exist', async () => {
    await app.repositories.applicantProfile.save({
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
    });

    const response = await app.inject({
      method: 'POST',
      url: '/autopilot-runs'
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      message: 'Enable at least one discovery source before launching autopilot.'
    });
  });

  test('queues a pending autopilot run and exposes it in list/detail responses', async () => {
    await app.repositories.discoverySources.upsert({
      sourceKind: 'greenhouse',
      sourceKey: 'acme',
      label: 'Acme Corp',
      enabled: true
    });

    const enqueueSpy = vi
      .spyOn(app.autopilotQueue, 'enqueueRun')
      .mockImplementation(() => {});

    const createResponse = await app.inject({
      method: 'POST',
      url: '/autopilot-runs',
      payload: {
        applySiteKeys: ['greenhouse'],
        maxJobsPerRun: 3,
        artifactMode: 'resume'
      }
    });

    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json().run).toMatchObject({
      triggerKind: 'manual',
      status: 'pending',
      currentStep: 'queued',
      discoveredJobCount: 0,
      eligibleJobCount: 0,
      skippedJobCount: 0,
      submittedCount: 0,
      blockedCount: 0,
      failedCount: 0
    });
    expect(createResponse.json().run.config).toMatchObject({
      applySiteKeys: ['greenhouse'],
      maxJobsPerRun: 3,
      artifactMode: 'resume'
    });

    const runId = createResponse.json().run.id as string;

    const listResponse = await app.inject({
      method: 'GET',
      url: '/autopilot-runs'
    });
    const detailResponse = await app.inject({
      method: 'GET',
      url: `/autopilot-runs/${runId}`
    });

    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().runs).toEqual([
      expect.objectContaining({
        run: expect.objectContaining({
          id: runId,
          status: 'pending'
        })
      })
    ]);
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toEqual({
      run: expect.objectContaining({
        id: runId,
        status: 'pending',
        config: expect.objectContaining({
          applySiteKeys: ['greenhouse'],
          maxJobsPerRun: 3,
          artifactMode: 'resume'
        })
      }),
      discoveryRun: null,
      applications: []
    });
  });

  test('accepts cancel without waiting for run lookup or queue persistence', async () => {
    const requestCancelSpy = vi
      .spyOn(app.autopilotQueue, 'requestCancelRun')
      .mockReturnValue(true);
    const findSpy = vi.spyOn(app.repositories.autopilotRuns, 'findById');

    const response = await app.inject({
      method: 'POST',
      url: `/autopilot-runs/${randomUUID()}/cancel`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ accepted: true, active: true });
    expect(requestCancelSpy).toHaveBeenCalledTimes(1);
    expect(findSpy).not.toHaveBeenCalled();

    requestCancelSpy.mockRestore();
    findSpy.mockRestore();
  });

  test('rejects launch when selected discovery source IDs are not enabled', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/autopilot-runs',
      payload: {
        discoverySourceIds: ['missing-source-id']
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      message:
        'One or more selected discovery sources are not enabled. Update your selections and try again.'
    });
  });
});

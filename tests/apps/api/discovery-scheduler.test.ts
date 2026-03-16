import { mkdirSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import greenhouseJobsResponse from '../../fixtures/discovery/greenhouse/jobs-response.json';
import { buildApp } from '../../../apps/api/src/app';

function createTestDatabasePath(): string {
  const path = fileURLToPath(
    new URL(`../../../data/test/${randomUUID()}.sqlite`, import.meta.url)
  );
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

describe('discovery scheduler', () => {
  const originalDbPath = process.env.JOB_AUTOMATION_DB_PATH;
  const dbPath = createTestDatabasePath();

  beforeEach(() => {
    process.env.JOB_AUTOMATION_DB_PATH = dbPath;
    process.env.GREENHOUSE_API_BASE_URL = 'https://boards-api.greenhouse.io/v1/boards';
    process.env.DISCOVERY_SCHEDULE_CRON = '0 */6 * * *';
    process.env.DISCOVERY_SCHEDULE_TIMEZONE = 'America/Toronto';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

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

  test('reads, updates, and enqueues the persisted discovery schedule', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(greenhouseJobsResponse), {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        })
      )
    );

    const initialScheduleResponse = await app.inject({
      method: 'GET',
      url: '/discovery-schedules'
    });

    expect(initialScheduleResponse.statusCode).toBe(200);
    expect(initialScheduleResponse.json().schedule.enabled).toBe(false);

    const sourceResponse = await app.inject({
      method: 'POST',
      url: '/discovery-sources',
      payload: {
        sourceKind: 'greenhouse',
        sourceKey: 'scheduled-acme',
        label: 'Scheduled Acme',
        enabled: true
      }
    });

    const updatedScheduleResponse = await app.inject({
      method: 'PUT',
      url: '/discovery-schedules',
      payload: {
        enabled: true,
        cronExpression: '*/15 * * * *',
        timezone: 'America/Toronto'
      }
    });

    expect(updatedScheduleResponse.statusCode).toBe(200);
    expect(updatedScheduleResponse.json().schedule.enabled).toBe(true);
    expect(updatedScheduleResponse.json().schedule.cronExpression).toBe('*/15 * * * *');

    const scheduledRun = await app.discoveryScheduler.enqueueScheduledRun();
    await app.discoveryQueue.onIdle();

    expect(scheduledRun).not.toBeNull();

    const runsResponse = await app.inject({ method: 'GET', url: '/discovery-runs' });
    expect(runsResponse.statusCode).toBe(200);
    expect(runsResponse.json().runs[0].triggerKind).toBe('scheduled');
    expect(runsResponse.json().runs[0].scheduleId).toBe(updatedScheduleResponse.json().schedule.id);
    expect(runsResponse.json().runs[0].status).toBe('completed');

    const detailResponse = await app.inject({
      method: 'GET',
      url: `/discovery-runs/${runsResponse.json().runs[0].id}`
    });

    expect(detailResponse.json().logs.some((log: { message: string }) => log.message === 'Queued scheduled discovery run.')).toBe(true);
    expect(sourceResponse.statusCode).toBe(200);
  });
});

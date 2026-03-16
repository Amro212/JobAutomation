import { describe, expect, test, vi } from 'vitest';

import greenhouseJobsResponse from '../../fixtures/discovery/greenhouse/jobs-response.json';
import {
  createGreenhouseAdapter,
  filterGreenhouseJobs,
  fetchGreenhouseJobs
} from '../../../packages/discovery/src/adapters/greenhouse';

describe('Greenhouse discovery', () => {
  test('fetches greenhouse jobs from the public board endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(greenhouseJobsResponse), {
        status: 200,
        headers: {
          'content-type': 'application/json'
        }
      })
    );

    const jobs = await fetchGreenhouseJobs({
      boardToken: 'acme',
      baseUrl: 'https://boards-api.greenhouse.io/v1/boards',
      fetchImpl: fetchMock
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://boards-api.greenhouse.io/v1/boards/acme/jobs?content=true'
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.title).toBe('Senior Platform Engineer');
  });

  test('normalizes greenhouse jobs into the shared discovery contract', () => {
    const adapter = createGreenhouseAdapter({
      id: 'source-1',
      sourceKind: 'greenhouse',
      sourceKey: 'acme',
      label: 'Acme Corp',
      enabled: true,
      createdAt: new Date('2026-03-13T12:00:00.000Z'),
      updatedAt: new Date('2026-03-13T12:00:00.000Z')
    });

    const normalized = adapter.normalizeJob(greenhouseJobsResponse.jobs[0], {
      capturedAt: new Date('2026-03-13T14:00:00.000Z')
    });

    expect(normalized.sourceKind).toBe('greenhouse');
    expect(normalized.sourceId).toBe('123456');
    expect(normalized.sourceUrl).toBe('https://boards.greenhouse.io/acme/jobs/123456');
    expect(normalized.companyName).toBe('Acme Corp');
    expect(normalized.title).toBe('Senior Platform Engineer');
    expect(normalized.location).toBe('Remote - Canada');
    expect(normalized.remoteType).toBe('remote');
    expect(normalized.employmentType).toBe('Full-time');
    expect(normalized.compensationText).toContain('CAD');
    expect(normalized.descriptionText).toContain('local-first discovery pipeline');
    expect(normalized.updatedAt.toISOString()).toBe('2026-03-13T13:30:00.000Z');
    expect(normalized.rawPayload).toEqual(greenhouseJobsResponse.jobs[0]);
  });

  test('accepts real greenhouse payloads where metadata is null', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          jobs: [
            {
              id: 7607671003,
              absolute_url: 'https://job-boards.greenhouse.io/public/jobs/7607671003',
              title: 'Director of Concierge & Sales',
              updated_at: '2026-02-10T15:01:28-05:00',
              content: '<p>Real payload sample</p>',
              location: {
                name: 'New York, New York'
              },
              metadata: null,
              pay_input_ranges: null
            }
          ]
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        }
      )
    );

    const jobs = await fetchGreenhouseJobs({
      boardToken: 'public',
      baseUrl: 'https://boards-api.greenhouse.io/v1/boards',
      fetchImpl: fetchMock
    });

    expect(jobs[0]?.metadata).toEqual([]);
    expect(jobs[0]?.pay_input_ranges).toEqual([]);
  });

  test('filters out generic open-application titles that add noise', () => {
    const filtered = filterGreenhouseJobs([
      greenhouseJobsResponse.jobs[0],
      {
        ...greenhouseJobsResponse.jobs[0],
        id: 999999,
        title: "Don't see what you're looking for?"
      }
    ]);

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.title).toBe('Senior Platform Engineer');
  });
});

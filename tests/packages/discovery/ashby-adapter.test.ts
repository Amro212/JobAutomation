import { describe, expect, test, vi } from 'vitest';

import ashbyJobsResponse from '../../fixtures/discovery/ashby/jobs-response.json';
import { createAshbyAdapter, fetchAshbyJobs } from '../../../packages/discovery/src/adapters/ashby';

describe('Ashby discovery', () => {
  test('fetches ashby jobs from the public board endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(ashbyJobsResponse), {
        status: 200,
        headers: {
          'content-type': 'application/json'
        }
      })
    );

    const jobs = await fetchAshbyJobs({
      boardName: 'ashby',
      baseUrl: 'https://api.ashbyhq.com/posting-api/job-board',
      fetchImpl: fetchMock
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.ashbyhq.com/posting-api/job-board/ashby?includeCompensation=true'
    );
    expect(jobs).toHaveLength(2);
    expect(jobs[0]?.title).toBe('Engineer Who Can Design, Americas');
  });

  test('normalizes ashby jobs into the shared discovery contract', () => {
    const adapter = createAshbyAdapter({
      id: 'source-1',
      sourceKind: 'ashby',
      sourceKey: 'ashby',
      label: 'Ashby',
      enabled: true,
      createdAt: new Date('2026-03-13T12:00:00.000Z'),
      updatedAt: new Date('2026-03-13T12:00:00.000Z')
    });

    const normalized = adapter.normalizeJob(ashbyJobsResponse.jobs[0], {
      capturedAt: new Date('2026-03-13T14:00:00.000Z')
    });

    expect(normalized.sourceKind).toBe('ashby');
    expect(normalized.sourceId).toBe('145ff46b-1441-4773-bcd3-c8c90baa598a');
    expect(normalized.sourceUrl).toBe(
      'https://jobs.ashbyhq.com/ashby/145ff46b-1441-4773-bcd3-c8c90baa598a'
    );
    expect(normalized.companyName).toBe('Ashby');
    expect(normalized.title).toBe('Engineer Who Can Design, Americas');
    expect(normalized.location).toBe('Remote - North to South America');
    expect(normalized.remoteType).toBe('remote');
    expect(normalized.employmentType).toBe('Full Time');
    expect(normalized.compensationText).toContain('$190K');
    expect(normalized.descriptionText).toContain('Design systems');
    expect(normalized.updatedAt.toISOString()).toBe('2025-11-14T00:46:58.989Z');
    expect(normalized.rawPayload).toEqual(ashbyJobsResponse.jobs[0]);
  });

  test('keeps compensation null when the posting does not expose it', () => {
    const adapter = createAshbyAdapter({
      id: 'source-1',
      sourceKind: 'ashby',
      sourceKey: 'ashby',
      label: 'Ashby',
      enabled: true,
      createdAt: new Date('2026-03-13T12:00:00.000Z'),
      updatedAt: new Date('2026-03-13T12:00:00.000Z')
    });

    const normalized = adapter.normalizeJob(ashbyJobsResponse.jobs[1], {
      capturedAt: new Date('2026-03-13T14:00:00.000Z')
    });

    expect(normalized.remoteType).toBe('hybrid');
    expect(normalized.compensationText).toBeNull();
  });
});

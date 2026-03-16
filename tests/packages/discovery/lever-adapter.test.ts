import { describe, expect, test, vi } from 'vitest';

import leverJobsResponse from '../../fixtures/discovery/lever/jobs-response.json';
import { createLeverAdapter, fetchLeverJobs } from '../../../packages/discovery/src/adapters/lever';

describe('Lever discovery', () => {
  test('fetches lever jobs from the published postings endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(leverJobsResponse), {
        status: 200,
        headers: {
          'content-type': 'application/json'
        }
      })
    );

    const jobs = await fetchLeverJobs({
      companyHandle: 'dnb',
      baseUrl: 'https://api.lever.co/v0/postings',
      fetchImpl: fetchMock
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.lever.co/v0/postings/dnb?mode=json'
    );
    expect(jobs).toHaveLength(2);
    expect(jobs[0]?.text).toBe('Account Executive II, SLED (R-18831)');
  });

  test('normalizes lever jobs into the shared discovery contract', () => {
    const adapter = createLeverAdapter({
      id: 'source-2',
      sourceKind: 'lever',
      sourceKey: 'dnb',
      label: 'Dun & Bradstreet',
      enabled: true,
      createdAt: new Date('2026-03-14T12:00:00.000Z'),
      updatedAt: new Date('2026-03-14T12:00:00.000Z')
    });

    const normalized = adapter.normalizeJob(leverJobsResponse[0], {
      capturedAt: new Date('2026-03-14T14:00:00.000Z')
    });

    expect(normalized.sourceKind).toBe('lever');
    expect(normalized.sourceId).toBe('6590549e-d893-4e0e-8934-dda77ef05223');
    expect(normalized.sourceUrl).toBe(
      'https://jobs.lever.co/dnb/6590549e-d893-4e0e-8934-dda77ef05223'
    );
    expect(normalized.companyName).toBe('Dun & Bradstreet');
    expect(normalized.title).toBe('Account Executive II, SLED (R-18831)');
    expect(normalized.location).toBe('Remote - United States');
    expect(normalized.remoteType).toBe('remote');
    expect(normalized.employmentType).toBe('Employee: Full Time');
    expect(normalized.compensationText).toBe('This role is eligible for commission');
    expect(normalized.descriptionText).toContain('Shape the Future');
    expect(normalized.discoveredAt.toISOString()).toBe('2026-02-05T20:59:09.676Z');
    expect(normalized.updatedAt.toISOString()).toBe('2026-02-05T20:59:09.676Z');
  });

  test('keeps a stable updated timestamp across identical reruns', () => {
    const adapter = createLeverAdapter({
      id: 'source-2',
      sourceKind: 'lever',
      sourceKey: 'dnb',
      label: 'Dun & Bradstreet',
      enabled: true,
      createdAt: new Date('2026-03-14T12:00:00.000Z'),
      updatedAt: new Date('2026-03-14T12:00:00.000Z')
    });

    const firstNormalized = adapter.normalizeJob(leverJobsResponse[0], {
      capturedAt: new Date('2026-03-14T14:00:00.000Z')
    });
    const secondNormalized = adapter.normalizeJob(leverJobsResponse[0], {
      capturedAt: new Date('2026-03-16T14:00:00.000Z')
    });

    expect(firstNormalized.updatedAt.toISOString()).toBe(secondNormalized.updatedAt.toISOString());
  });
});

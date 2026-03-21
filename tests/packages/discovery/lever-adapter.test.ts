import { describe, expect, test, vi } from 'vitest';

import leverJobsResponse from '../../fixtures/discovery/lever/jobs-response.json';
import { createLeverAdapter, fetchLeverJobs } from '../../../packages/discovery/src/adapters/lever';

describe('Lever discovery', () => {
  test('retains rich lever description fields from the postings payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 'spotify-rich',
            text: 'Head of Backstage Marketing',
            hostedUrl: 'https://jobs.lever.co/spotify/spotify-rich',
            createdAt: 1774000000000,
            descriptionPlain: 'About the Team',
            descriptionBodyPlain: 'Intro paragraph',
            openingPlain: '',
            additionalPlain: '',
            description: '<div>Intro paragraph</div>',
            lists: [
              {
                text: "What You'll Do",
                content: '<ul><li>Lead strategy</li><li>Build campaigns</li></ul>'
              }
            ],
            categories: {
              commitment: 'Employee: Full Time',
              location: 'Toronto',
              team: 'Marketing',
              allLocations: ['Toronto']
            },
            salaryDescription: '',
            workplaceType: 'remote'
          }
        ]),
        {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        }
      )
    );

    const jobs = await fetchLeverJobs({
      companyHandle: 'spotify',
      baseUrl: 'https://api.lever.co/v0/postings',
      fetchImpl: fetchMock
    });

    expect(jobs[0]).toMatchObject({
      descriptionBodyPlain: 'Intro paragraph',
      lists: [
        {
          text: "What You'll Do"
        }
      ]
    });
  });

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

  test('merges lever list sections into the stored description text', () => {
    const adapter = createLeverAdapter({
      id: 'source-spotify',
      sourceKind: 'lever',
      sourceKey: 'spotify',
      label: 'Spotify',
      enabled: true,
      createdAt: new Date('2026-03-14T12:00:00.000Z'),
      updatedAt: new Date('2026-03-14T12:00:00.000Z')
    });

    const normalized = adapter.normalizeJob(
      {
        id: 'spotify-rich',
        text: 'Head of Backstage Marketing',
        hostedUrl: 'https://jobs.lever.co/spotify/spotify-rich',
        createdAt: 1774000000000,
        descriptionPlain: 'About the Team',
        descriptionBodyPlain: 'The Platform team creates the technology.',
        openingPlain: '',
        additionalPlain: '',
        description: '<div>The Platform team creates the technology.</div>',
        lists: [
          {
            text: "What You'll Do",
            content:
              '<ul><li>Lead marketing strategy</li><li>Build and execute growth strategies</li></ul>'
          },
          {
            text: 'Who You Are',
            content: '<ul><li>You have 10+ years of experience</li></ul>'
          }
        ],
        categories: {
          commitment: 'Employee: Full Time',
          location: 'Toronto',
          team: 'Marketing',
          allLocations: ['Toronto']
        },
        salaryDescription: '',
        workplaceType: 'remote'
      } as Parameters<typeof adapter.normalizeJob>[0],
      {
        capturedAt: new Date('2026-03-14T14:00:00.000Z')
      }
    );

    expect(normalized.descriptionText).toContain('The Platform team creates the technology.');
    expect(normalized.descriptionText).toContain("What You'll Do");
    expect(normalized.descriptionText).toContain('- Lead marketing strategy');
    expect(normalized.descriptionText).toContain('Who You Are');
    expect(normalized.rawPayload).toEqual(
      expect.objectContaining({
        lists: expect.arrayContaining([
          expect.objectContaining({
            text: "What You'll Do"
          })
        ])
      })
    );
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

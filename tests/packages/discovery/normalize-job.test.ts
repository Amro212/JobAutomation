import { describe, expect, test } from 'vitest';

import normalizedJobExpected from '../../fixtures/discovery/normalized-job-expected.json';
import normalizedJobInput from '../../fixtures/discovery/normalized-job-input.json';
import { normalizeJob } from '../../../packages/discovery/src/normalization/normalize-job';

describe('normalizeJob', () => {
  test('normalizes structured source input and retains source provenance', () => {
    const normalized = normalizeJob(
      {
        sourceKind: 'greenhouse',
        ...normalizedJobInput
      },
      {
        capturedAt: new Date('2026-03-13T10:00:00.000Z')
      }
    );

    expect({
      ...normalized,
      discoveredAt: normalized.discoveredAt.toISOString(),
      updatedAt: normalized.updatedAt.toISOString()
    }).toEqual(normalizedJobExpected);
  });

  test('fills stable defaults for optional fields', () => {
    const normalized = normalizeJob(
      {
        sourceKind: 'ashby',
        sourceId: 'ashby-1',
        sourceUrl: 'https://jobs.ashbyhq.com/example/1',
        companyName: 'Ashby Example',
        title: 'Automation Engineer'
      },
      {
        capturedAt: new Date('2026-03-13T10:05:00.000Z')
      }
    );

    expect(normalized.location).toBe('');
    expect(normalized.remoteType).toBe('unknown');
    expect(normalized.employmentType).toBeNull();
    expect(normalized.compensationText).toBeNull();
    expect(normalized.descriptionText).toBe('');
    expect(normalized.rawPayload).toBeNull();
  });
});

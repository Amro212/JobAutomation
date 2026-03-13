import { describe, expect, test } from 'vitest';

import duplicateJobs from '../../fixtures/discovery/duplicate-jobs.json';
import { normalizeJob } from '../../../packages/discovery/src/normalization/normalize-job';
import { dedupeJobs } from '../../../packages/discovery/src/services/dedupe-jobs';

describe('dedupeJobs', () => {
  test('keeps the newest record per source identity and preserves other source kinds', () => {
    const jobs = duplicateJobs.map((job) =>
      normalizeJob(job, {
        capturedAt: new Date('2026-03-13T09:00:00.000Z')
      })
    );

    const deduped = dedupeJobs(jobs);

    expect(deduped).toHaveLength(2);
    expect(deduped.find((job) => job.sourceKind === 'greenhouse')?.title).toBe(
      'Senior Platform Engineer'
    );
    expect(deduped.find((job) => job.sourceKind === 'lever')?.sourceId).toBe('lv-900');
  });
});

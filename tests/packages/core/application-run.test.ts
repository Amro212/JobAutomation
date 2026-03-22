import { describe, expect, test } from 'vitest';

import { applicationRunRecordSchema } from '../../../packages/core/src/application-run';
import {
  applicationRunStatusSchema,
  applicationRunTypeSchema
} from '../../../packages/core/src/status';

describe('application run core contract', () => {
  test('includes skipped application run status', () => {
    expect(applicationRunStatusSchema.options).toContain('skipped');
  });

  test('exposes supported application site types', () => {
    expect(applicationRunTypeSchema.options).toEqual(
      expect.arrayContaining(['greenhouse', 'lever', 'ashby'])
    );
  });

  test('parses an application run record with explicit stable columns', () => {
    const record = applicationRunRecordSchema.parse({
      id: 'run-1',
      jobId: 'job-1',
      siteKey: 'greenhouse',
      status: 'paused',
      currentStep: 'review_ready',
      stopReason: 'manual_review_required',
      prefilterReasons: ['title_negative'],
      reviewUrl: 'https://job-boards.greenhouse.io/example/jobs/1/application',
      resumeArtifactId: 'artifact-resume',
      coverLetterArtifactId: 'artifact-cover-letter',
      createdAt: new Date('2026-03-13T10:10:00.000Z'),
      startedAt: new Date('2026-03-13T10:10:05.000Z'),
      completedAt: null,
      updatedAt: new Date('2026-03-13T10:11:00.000Z')
    });

    expect(record.prefilterReasons).toEqual(['title_negative']);
    expect(record.siteKey).toBe('greenhouse');
    expect(record.status).toBe('paused');
  });
});

import { describe, expect, test } from 'vitest';
import { getTableColumns } from 'drizzle-orm';

import {
  applicantProfileTable,
  applicationRunsTable,
  artifactsTable,
  discoveryRunsTable,
  jobsTable,
  logEventsTable
} from '../../../packages/db/src/schema';

describe('database schema', () => {
  test('defines the batch A tables', () => {
    expect(jobsTable[Symbol.for('drizzle:Name')]).toBe('jobs');
    expect(discoveryRunsTable[Symbol.for('drizzle:Name')]).toBe('discovery_runs');
    expect(applicantProfileTable[Symbol.for('drizzle:Name')]).toBe('applicant_profile');
    expect(artifactsTable[Symbol.for('drizzle:Name')]).toBe('artifacts');
    expect(applicationRunsTable[Symbol.for('drizzle:Name')]).toBe('application_runs');
    expect(logEventsTable[Symbol.for('drizzle:Name')]).toBe('log_events');
  });

  test('keeps source identity and applicant resume columns explicit', () => {
    const jobColumns = getTableColumns(jobsTable);
    const applicantColumns = getTableColumns(applicantProfileTable);

    expect(jobColumns.sourceKind).toBeDefined();
    expect(jobColumns.sourceId).toBeDefined();
    expect(jobColumns.discoveryRunId).toBeDefined();
    expect(applicantColumns.baseResumeFileName).toBeDefined();
    expect(applicantColumns.baseResumeTex).toBeDefined();
  });
});

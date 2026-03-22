import { describe, expect, test } from 'vitest';
import { getTableColumns } from 'drizzle-orm';

import {
  applicantProfileTable,
  applicationRunsTable,
  artifactsTable,
  discoveryRunsTable,
  discoverySchedulesTable,
  jobsTable,
  logEventsTable
} from '../../../packages/db/src/schema';

describe('database schema', () => {
  test('defines the batch A and Batch B scheduling tables', () => {
    expect(jobsTable[Symbol.for('drizzle:Name')]).toBe('jobs');
    expect(discoveryRunsTable[Symbol.for('drizzle:Name')]).toBe('discovery_runs');
    expect(discoverySchedulesTable[Symbol.for('drizzle:Name')]).toBe('discovery_schedules');
    expect(applicantProfileTable[Symbol.for('drizzle:Name')]).toBe('applicant_profile');
    expect(artifactsTable[Symbol.for('drizzle:Name')]).toBe('artifacts');
    expect(applicationRunsTable[Symbol.for('drizzle:Name')]).toBe('application_runs');
    expect(logEventsTable[Symbol.for('drizzle:Name')]).toBe('log_events');
  });

  test('keeps source identity and applicant resume columns explicit', () => {
    const jobColumns = getTableColumns(jobsTable);
    const applicantColumns = getTableColumns(applicantProfileTable);
    const runColumns = getTableColumns(discoveryRunsTable);

    expect(jobColumns.sourceKind).toBeDefined();
    expect(jobColumns.sourceId).toBeDefined();
    expect(jobColumns.discoveryRunId).toBeDefined();
    expect(jobColumns.prefilterPass).toBeDefined();
    expect(jobColumns.prefilterReasonsJson).toBeDefined();
    expect(runColumns.scheduleId).toBeDefined();
    expect(applicantColumns.baseResumeFileName).toBeDefined();
    expect(applicantColumns.baseResumeTex).toBeDefined();
  });

  test('keeps application run and evidence linkage explicit', () => {
    const applicationRunColumns = getTableColumns(applicationRunsTable);
    const artifactColumns = getTableColumns(artifactsTable);
    const logEventColumns = getTableColumns(logEventsTable);

    expect(applicationRunColumns.siteKey).toBeDefined();
    expect(applicationRunColumns.currentStep).toBeDefined();
    expect(applicationRunColumns.prefilterReasonsJson).toBeDefined();
    expect(applicationRunColumns.resumeArtifactId).toBeDefined();
    expect(applicationRunColumns.coverLetterArtifactId).toBeDefined();
    expect(applicationRunColumns.updatedAt).toBeDefined();
    expect(artifactColumns.applicationRunId).toBeDefined();
    expect(logEventColumns.applicationRunId).toBeDefined();
  });
});

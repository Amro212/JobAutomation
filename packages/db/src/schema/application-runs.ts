import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { jobsTable } from './jobs';

export const applicationRunsTable = sqliteTable('application_runs', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull().references(() => jobsTable.id, {
    onDelete: 'cascade'
  }),
  siteKey: text('site_key').notNull(),
  status: text('status').notNull(),
  currentStep: text('current_step').notNull(),
  stopReason: text('stop_reason'),
  prefilterReasonsJson: text('prefilter_reasons_json'),
  reviewUrl: text('review_url'),
  resumeArtifactId: text('resume_artifact_id'),
  coverLetterArtifactId: text('cover_letter_artifact_id'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
}, (table) => ({
  applicationRunsJobIdx: index('application_runs_job_idx').on(table.jobId),
  applicationRunsStatusIdx: index('application_runs_status_idx').on(table.status)
}));

import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { discoveryRunsTable } from './discovery-runs';

export const jobsTable = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    sourceKind: text('source_kind').notNull(),
    sourceId: text('source_id').notNull(),
    sourceUrl: text('source_url').notNull(),
    companyName: text('company_name').notNull(),
    title: text('title').notNull(),
    location: text('location').notNull().default(''),
    remoteType: text('remote_type').notNull().default('unknown'),
    employmentType: text('employment_type'),
    compensationText: text('compensation_text'),
    descriptionText: text('description_text').notNull().default(''),
    rawPayload: text('raw_payload'),
    discoveryRunId: text('discovery_run_id').references(() => discoveryRunsTable.id, {
      onDelete: 'set null'
    }),
    status: text('status').notNull().default('discovered'),
    reviewNotes: text('review_notes').notNull().default(''),
    reviewSummary: text('review_summary'),
    reviewScore: integer('review_score'),
    reviewScoreReasoning: text('review_score_reasoning'),
    reviewUpdatedAt: integer('review_updated_at', { mode: 'timestamp_ms' }),
    reviewScoreUpdatedAt: integer('review_score_updated_at', { mode: 'timestamp_ms' }),
    discoveredAt: integer('discovered_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    /** 1 = passes applicant pre-filter, 0 = rejected, null = not evaluated or invalidated */
    prefilterPass: integer('prefilter_pass'),
    prefilterReasonsJson: text('prefilter_reasons_json')
  },
  (table) => ({
    jobsSourceIdentityIdx: uniqueIndex('jobs_source_identity_idx').on(
      table.sourceKind,
      table.sourceId
    ),
    jobsStatusIdx: index('jobs_status_idx').on(table.status),
    jobsUpdatedAtIdx: index('jobs_updated_at_idx').on(table.updatedAt),
    jobsPrefilterPassIdx: index('jobs_prefilter_pass_idx').on(table.prefilterPass)
  })
);

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const discoveryRunsTable = sqliteTable('discovery_runs', {
  id: text('id').primaryKey(),
  sourceKind: text('source_kind').notNull(),
  status: text('status').notNull(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  jobCount: integer('job_count').notNull().default(0),
  newJobCount: integer('new_job_count').notNull().default(0),
  updatedJobCount: integer('updated_job_count').notNull().default(0),
  errorMessage: text('error_message')
});

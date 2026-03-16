import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { discoverySchedulesTable } from './discovery-schedules';
import { discoverySourcesTable } from './discovery-sources';

export const discoveryRunsTable = sqliteTable('discovery_runs', {
  id: text('id').primaryKey(),
  sourceKind: text('source_kind').notNull(),
  runKind: text('run_kind').notNull().default('single-source'),
  triggerKind: text('trigger_kind').notNull().default('manual'),
  discoverySourceId: text('discovery_source_id').references(() => discoverySourcesTable.id, {
    onDelete: 'set null'
  }),
  scheduleId: text('schedule_id').references(() => discoverySchedulesTable.id, {
    onDelete: 'set null'
  }),
  status: text('status').notNull(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  jobCount: integer('job_count').notNull().default(0),
  newJobCount: integer('new_job_count').notNull().default(0),
  updatedJobCount: integer('updated_job_count').notNull().default(0),
  errorMessage: text('error_message')
});
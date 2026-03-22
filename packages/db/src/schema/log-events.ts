import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { applicationRunsTable } from './application-runs';
import { discoveryRunsTable } from './discovery-runs';
import { jobsTable } from './jobs';

export const logEventsTable = sqliteTable(
  'log_events',
  {
    id: text('id').primaryKey(),
    discoveryRunId: text('discovery_run_id').references(() => discoveryRunsTable.id, {
      onDelete: 'set null'
    }),
    jobId: text('job_id').references(() => jobsTable.id, {
      onDelete: 'set null'
    }),
    applicationRunId: text('application_run_id').references(() => applicationRunsTable.id, {
      onDelete: 'set null'
    }),
    level: text('level').notNull(),
    message: text('message').notNull(),
    detailsJson: text('details_json'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    logEventsApplicationRunIdx: index('log_events_application_run_idx').on(table.applicationRunId)
  })
);

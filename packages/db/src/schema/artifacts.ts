import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { discoveryRunsTable } from './discovery-runs';
import { jobsTable } from './jobs';

export const artifactsTable = sqliteTable(
  'artifacts',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id').references(() => jobsTable.id, {
      onDelete: 'set null'
    }),
    discoveryRunId: text('discovery_run_id').references(() => discoveryRunsTable.id, {
      onDelete: 'set null'
    }),
    kind: text('kind').notNull(),
    format: text('format').notNull(),
    fileName: text('file_name').notNull(),
    storagePath: text('storage_path').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    artifactsJobIdx: index('artifacts_job_idx').on(table.jobId)
  })
);

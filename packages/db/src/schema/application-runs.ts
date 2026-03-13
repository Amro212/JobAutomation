import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { jobsTable } from './jobs';

export const applicationRunsTable = sqliteTable('application_runs', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull().references(() => jobsTable.id, {
    onDelete: 'cascade'
  }),
  status: text('status').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

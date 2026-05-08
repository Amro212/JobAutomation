import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { discoveryRunsTable } from './discovery-runs';

export const autopilotRunsTable = sqliteTable(
  'autopilot_runs',
  {
    id: text('id').primaryKey(),
    triggerKind: text('trigger_kind').notNull(),
    status: text('status').notNull(),
    currentStep: text('current_step').notNull(),
    discoveryRunId: text('discovery_run_id').references(
      () => discoveryRunsTable.id,
      {
        onDelete: 'set null'
      }
    ),
    discoveredJobCount: integer('discovered_job_count').notNull().default(0),
    eligibleJobCount: integer('eligible_job_count').notNull().default(0),
    skippedJobCount: integer('skipped_job_count').notNull().default(0),
    submittedCount: integer('submitted_count').notNull().default(0),
    blockedCount: integer('blocked_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    errorMessage: text('error_message'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    autopilotRunsStatusIdx: index('autopilot_runs_status_idx').on(table.status),
    autopilotRunsCreatedAtIdx: index('autopilot_runs_created_at_idx').on(
      table.createdAt
    ),
    autopilotRunsDiscoveryRunIdx: index('autopilot_runs_discovery_run_idx').on(
      table.discoveryRunId
    )
  })
);

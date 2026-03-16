import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const discoverySchedulesTable = sqliteTable('discovery_schedules', {
  id: text('id').primaryKey(),
  cronExpression: text('cron_expression').notNull(),
  timezone: text('timezone').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});
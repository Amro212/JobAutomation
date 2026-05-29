import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const autopilotSettingsTable = sqliteTable('autopilot_settings', {
  id: text('id').primaryKey(),
  configJson: text('config_json').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

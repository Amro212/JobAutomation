import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const discoverySourcesTable = sqliteTable(
  'discovery_sources',
  {
    id: text('id').primaryKey(),
    sourceKind: text('source_kind').notNull(),
    sourceKey: text('source_key').notNull(),
    label: text('label').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  (table) => ({
    discoverySourcesIdentityIdx: uniqueIndex('discovery_sources_identity_idx').on(
      table.sourceKind,
      table.sourceKey
    )
  })
);
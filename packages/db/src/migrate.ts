import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/libsql/migrator';

import { configureDatabaseClient, type JobAutomationDatabase } from './client';

const migrationsFolder =
  process.env.JOB_AUTOMATION_DB_MIGRATIONS_DIR ??
  fileURLToPath(new URL('../drizzle', import.meta.url));

export async function migrateDatabase(db: JobAutomationDatabase): Promise<void> {
  await configureDatabaseClient(db);
  await migrate(db, { migrationsFolder });
}

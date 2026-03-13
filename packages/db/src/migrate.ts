import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/libsql/migrator';

import type { JobAutomationDatabase } from './client';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

export async function migrateDatabase(db: JobAutomationDatabase): Promise<void> {
  await migrate(db, { migrationsFolder });
}

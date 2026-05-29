import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

import { readEnv, resolveProjectPath } from '@jobautomation/config';

import * as schema from './schema';

export type JobAutomationDatabase = ReturnType<typeof drizzle<typeof schema>>;

const performancePragmas = [
  // WAL mode allows concurrent reads during writes, which matters during autopilot.
  'PRAGMA journal_mode = WAL',
  'PRAGMA journal_size_limit = 67108864',
  'PRAGMA busy_timeout = 5000',
  'PRAGMA cache_size = -65536',
  'PRAGMA foreign_keys = ON',
  'PRAGMA synchronous = NORMAL'
] as const;

export function resolveDatabasePath(explicitPath?: string): string {
  const configuredPath = explicitPath ?? readEnv(process.env).JOB_AUTOMATION_DB_PATH;
  return resolveProjectPath(configuredPath);
}

export function resolveDatabaseUrl(explicitPath?: string): string {
  return pathToFileURL(resolveDatabasePath(explicitPath)).href;
}

export function createDatabaseClient(explicitPath?: string): JobAutomationDatabase {
  const databasePath = resolveDatabasePath(explicitPath);
  mkdirSync(dirname(databasePath), { recursive: true });

  const client = createClient({
    url: resolveDatabaseUrl(databasePath)
  });

  const db = drizzle(client, {
    schema
  });

  void configureDatabaseClient(db).catch(() => null);

  return db;
}

export async function configureDatabaseClient(db: JobAutomationDatabase): Promise<void> {
  for (const statement of performancePragmas) {
    await db.$client.execute(statement);
  }
}

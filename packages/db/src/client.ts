import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';

import { readEnv } from '@jobautomation/config';

import * as schema from './schema';

export type JobAutomationDatabase = ReturnType<typeof drizzle<typeof schema>>;

export function resolveDatabasePath(explicitPath?: string): string {
  const configuredPath = explicitPath ?? readEnv(process.env).JOB_AUTOMATION_DB_PATH;
  return resolve(configuredPath);
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

  return drizzle(client, {
    schema
  });
}

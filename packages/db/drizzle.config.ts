import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { defineConfig } from 'drizzle-kit';

const packageRoot = dirname(fileURLToPath(import.meta.url));
const defaultDbPath = resolve(packageRoot, '../../data/jobautomation.sqlite');

function resolveDatabaseUrl(value?: string): string {
  if (!value) {
    return pathToFileURL(defaultDbPath).href;
  }

  if (value.startsWith('file:')) {
    return value;
  }

  return pathToFileURL(resolve(value)).href;
}

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: resolveDatabaseUrl(process.env.JOB_AUTOMATION_DB_PATH)
  }
});

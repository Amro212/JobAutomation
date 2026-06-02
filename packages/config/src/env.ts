import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, posix, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));

export function resolveProjectPath(pathValue: string): string {
  return isAbsolute(pathValue) ? pathValue : resolve(workspaceRoot, pathValue);
}

function createConfigSchema(resolvePathValue: (pathValue: string) => string) {
  return z.object({
    API_BASE_URL: z.string().url().default('http://127.0.0.1:3001'),
    API_HOST: z.string().default('127.0.0.1'),
    API_PORT: z.coerce.number().int().positive().default(3001),
    DASHBOARD_PORT: z.coerce.number().int().positive().default(3000),
    GREENHOUSE_API_BASE_URL: z
      .string()
      .url()
      .default('https://boards-api.greenhouse.io/v1/boards'),
    LEVER_API_BASE_URL: z.string().url().default('https://api.lever.co/v0/postings'),
    ASHBY_API_BASE_URL: z.string().url().default('https://api.ashbyhq.com/posting-api/job-board'),
    DISCOVERY_SCHEDULE_CRON: z.string().default('0 */6 * * *'),
    DISCOVERY_SCHEDULE_TIMEZONE: z.string().default('America/Toronto'),
    DISCOVERY_QUEUE_CONCURRENCY: z.coerce.number().int().positive().default(1),
    JOB_AUTOMATION_DB_PATH: z
      .string()
      .min(1)
      .default('./data/jobautomation.sqlite')
      .transform(resolvePathValue),
    OPENROUTER_API_KEY: z.string().trim().min(1).optional(),
    OPENROUTER_API_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
    OPENROUTER_JOB_SUMMARY_MODEL: z.string().trim().min(1).optional(),
    OPENROUTER_APPLICATION_FILL_PLAN_MODEL: z.string().trim().min(1).optional(),
    JOBAUTOMATION_AI_GATEWAY_BASE_URL: z.string().url().optional(),
    JOBAUTOMATION_AI_AUTH_TOKEN: z.string().trim().min(1).optional(),
    JOBAUTOMATION_ALLOW_STATIC_ARTIFACT_FALLBACK: z
      .enum(['0', '1'])
      .default('0')
      .transform((value) => value === '1')
  });
}

const envSchema = createConfigSchema(resolveProjectPath);

export type AppEnv = z.infer<typeof envSchema>;

export function readEnv(input: NodeJS.ProcessEnv): AppEnv {
  return envSchema.parse({ ...input });
}

export function readConfig(configPath: string): AppEnv {
  const configDir = dirname(configPath);
  const configSchema = createConfigSchema((pathValue) =>
    isAbsolute(pathValue) ? pathValue : resolve(configDir, pathValue)
  );
  const rawConfig = JSON.parse(readFileSync(configPath, 'utf8')) as unknown;

  return configSchema.parse(rawConfig);
}

export function resolveAppDataPath(
  appName: string,
  options?: {
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
  }
): string {
  const platform = options?.platform ?? process.platform;
  const env = options?.env ?? process.env;

  if (platform === 'win32') {
    const appData = env.APPDATA;
    if (!appData) {
      throw new Error('APPDATA is not set.');
    }

    return win32.resolve(appData, appName);
  }

  const home = env.HOME ?? homedir();
  if (!home) {
    throw new Error('HOME is not set.');
  }

  if (platform === 'darwin') {
    return posix.resolve(home, 'Library', 'Application Support', appName);
  }

  return posix.resolve(
    env.XDG_DATA_HOME ?? posix.resolve(home, '.local', 'share'),
    appName
  );
}

export function isOpenRouterConfigured(env: AppEnv): boolean {
  return Boolean(env.OPENROUTER_API_KEY);
}

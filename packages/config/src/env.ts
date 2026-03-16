import { z } from 'zod';

const envSchema = z.object({
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
  JOB_AUTOMATION_DB_PATH: z.string().min(1).default('./data/jobautomation.sqlite'),
  OPENROUTER_API_KEY: z.string().trim().min(1).optional(),
  OPENROUTER_API_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  OPENROUTER_JOB_SUMMARY_MODEL: z
    .string()
    .trim()
    .min(1)
    .default('google/gemini-2.0-flash-lite-001')
});

export type AppEnv = z.infer<typeof envSchema>;

export function readEnv(input: NodeJS.ProcessEnv): AppEnv {
  return envSchema.parse(input);
}

export function isOpenRouterConfigured(env: AppEnv): boolean {
  return Boolean(env.OPENROUTER_API_KEY);
}

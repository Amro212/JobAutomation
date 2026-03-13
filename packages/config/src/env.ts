import { z } from 'zod';

const envSchema = z.object({
  API_BASE_URL: z.string().url().default('http://127.0.0.1:3001'),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  DASHBOARD_PORT: z.coerce.number().int().positive().default(3000),
  JOB_AUTOMATION_DB_PATH: z.string().min(1).default('./data/jobautomation.sqlite')
});

export type AppEnv = z.infer<typeof envSchema>;

export function readEnv(input: NodeJS.ProcessEnv): AppEnv {
  return envSchema.parse(input);
}

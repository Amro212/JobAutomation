import { z } from 'zod';
import type { Page } from 'playwright';

export type StagehandClientInput = {
  detailPageUrl: string;
  sourcePageUrl: string;
  label: string;
  extractorId: string;
  partialJob: Record<string, unknown>;
};

export interface StagehandExtractionClient {
  extractJob(input: StagehandClientInput): Promise<unknown>;
  close(): Promise<void>;
}

export interface StagehandInstance {
  init(): Promise<void>;
  close(): Promise<void>;
  page: Page;
  extract<T extends z.AnyZodObject>(
    instruction: string,
    schema: T,
    options?: { page?: Page; timeout?: number }
  ): Promise<z.infer<T>>;
  act(
    instruction: string,
    options?: { page?: Page; timeout?: number }
  ): Promise<{ success: boolean; message?: string; action?: string }>;
  observe(
    instruction?: string,
    options?: { page?: Page; timeout?: number }
  ): Promise<Array<{ selector: string; description: string; method: string; arguments?: string[] }>>;
}

export interface StagehandConfig {
  env?: 'LOCAL' | 'BROWSERBASE';
  model?: string;
  instructions?: string;
  localBrowserLaunchOptions?: {
    executablePath?: string;
    headless?: boolean;
    cdpUrl?: string;
  };
}

function readLocalBrowserPath(): string | undefined {
  const value = process.env.STAGEHAND_LOCAL_BROWSER_PATH?.trim();
  return value && value.length > 0 ? value : undefined;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  label = 'operation'
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[Stagehand] ${label} attempt ${attempt}/${maxAttempts} failed:`, lastError.message);
      if (attempt < maxAttempts) {
        const delay = 1000 * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// Zod schema for job extraction - v3 requires Zod schemas
const jobExtractionSchema = z.object({
  sourceId: z.string().nullish(),
  sourceUrl: z.string(),
  companyName: z.string(),
  title: z.string(),
  location: z.string(),
  remoteType: z.string(),
  employmentType: z.string().nullish(),
  compensationText: z.string().nullish(),
  descriptionText: z.string()
});

export async function createStagehandInstance(
  configOverrides?: Partial<StagehandConfig>
): Promise<StagehandInstance> {
  const module = (await import('@browserbasehq/stagehand')) as {
    Stagehand: new (config: StagehandConfig) => StagehandInstance;
  };

  const localBrowserPath = readLocalBrowserPath();
  const config: StagehandConfig = {
    env: (process.env.STAGEHAND_ENV as 'LOCAL' | 'BROWSERBASE') ?? 'LOCAL',
    model: process.env.STAGEHAND_MODEL ?? 'google/gemini-2.5-flash',
    ...(localBrowserPath
      ? {
          localBrowserLaunchOptions: {
            executablePath: localBrowserPath,
            headless: true
          }
        }
      : {}),
    ...configOverrides
  };

  const stagehand = new module.Stagehand(config);
  await stagehand.init();
  return stagehand;
}

export async function createStagehandClient(): Promise<StagehandExtractionClient> {
  const stagehand = await createStagehandInstance();

  return {
    async extractJob(input: StagehandClientInput): Promise<unknown> {
      const page = stagehand.page;
      if (!page) {
        throw new Error('Stagehand did not expose a browser page.');
      }

      await page.goto(input.detailPageUrl, {
        waitUntil: 'domcontentloaded'
      });
      await page.waitForLoadState('networkidle');

      return withRetry(
        () =>
          stagehand.extract(
            `Extract the public job posting fields from this page. Use visible page content only.
Context:
- Source URL: ${input.sourcePageUrl}
- Detail URL: ${input.detailPageUrl}
- Label: ${input.label}
- Extractor ID: ${input.extractorId}`,
            jobExtractionSchema
          ),
        3,
        'extract job'
      );
    },
    async close(): Promise<void> {
      await stagehand.close();
    }
  };
}
